import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readSheet, isSheetsConfigured } from "@/lib/google-sheets";
import { auth } from "@/lib/auth";
import { normalizeSheetDateToYmd } from "@/lib/sheet-date";
import { assertShiftRequestsUnlocked } from "@/lib/shift-request-lock";
import { assertShiftSlotsUnlocked } from "@/lib/shift-slot-lock";

function requireStaff(session: any) {
  if (!session) return { ok: false as const, res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const role = (session.user as any).role as string | undefined;
  if (role !== "admin" && role !== "employee") {
    return { ok: false as const, res: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true as const };
}

// POST: Googleフォームの回答（Google Sheets経由）をシフト希望に取り込み
// フォームの回答シートの想定構造:
// A列: タイムスタンプ, B列: メールアドレス, C列: 日付(YYYY-MM-DD), D列: 出勤時間(数値), E列: 退勤時間(数値), F列: メモ
export async function POST(req: NextRequest) {
  const session = await auth();
  const guard = requireStaff(session);
  if (!guard.ok) return guard.res;

  const body = await req.json();
  const { sheetName, periodId } = body;

  if (!periodId) {
    return NextResponse.json({ error: "periodId is required" }, { status: 400 });
  }

  if (!isSheetsConfigured()) {
    return NextResponse.json({ error: "Google Sheets連携が未設定です" }, { status: 400 });
  }

  const period = await prisma.shiftPeriod.findUnique({
    where: { id: periodId },
    include: { shiftDays: true, store: true },
  });

  if (!period) {
    return NextResponse.json({ error: "Period not found" }, { status: 404 });
  }

  const lockedRes = await assertShiftRequestsUnlocked(periodId);
  if (lockedRes) return lockedRes;
  const slotLockedRes = await assertShiftSlotsUnlocked(periodId);
  if (slotLockedRes) return slotLockedRes;

  try {
    // Googleフォームの回答シートを読み取り
    const formSheetName = sheetName || "フォームの回答 1";
    const rows = await readSheet(formSheetName, "A2:F1000");

    // メールアドレス → キャストIDのマッピング
    const allCasts = await prisma.user.findMany({
      where: { role: "cast" },
      select: { id: true, email: true, name: true },
    });
    const emailMap = new Map(allCasts.map((c) => [c.email.toLowerCase(), c]));

    // dayMap: 日付文字列 → dayId
    const dayMap = new Map<string, string>();
    for (const day of period.shiftDays) {
      const key = new Date(day.date).toISOString().slice(0, 10);
      dayMap.set(key, day.id);
    }

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of rows) {
      if (!row || row.length < 5) continue;

      const email = String(row[1] || "").trim().toLowerCase();
      const dateStr = normalizeSheetDateToYmd(row[2]);
      const startTime = Number(row[3]);
      const endTime = Number(row[4]);
      const notes = row[5] ? String(row[5]).trim() : null;

      // キャスト特定
      const cast = emailMap.get(email);
      if (!cast) {
        errors.push(`不明なメール: ${email}`);
        skipped++;
        continue;
      }

      // 日付をdayIdに変換
      if (!dateStr) {
        errors.push(`日付が読み取れません: ${String(row[2])} (${cast.name})`);
        skipped++;
        continue;
      }

      const dayId = dayMap.get(dateStr);
      if (!dayId) {
        errors.push(`期間外の日付: ${dateStr} (${cast.name})`);
        skipped++;
        continue;
      }

      // 有効な時間か確認
      if (isNaN(startTime) || isNaN(endTime) || startTime >= endTime) {
        errors.push(`無効な時間: ${startTime}-${endTime} (${cast.name} ${dateStr})`);
        skipped++;
        continue;
      }

      // 同じキャスト・同じ日の既存リクエストを確認
      const existingDate = period.shiftDays.find((d) => d.id === dayId)?.date;
      if (existingDate) {
        const existing = await prisma.shiftRequest.findFirst({
          where: {
            castId: cast.id,
            periodId,
            date: existingDate,
          },
        });
        if (existing) {
          // 既に登録済み → スキップ（上書きしない）
          skipped++;
          continue;
        }
      }

      // シフト希望を登録
      await prisma.shiftRequest.create({
        data: {
          castId: cast.id,
          periodId,
          date: existingDate!,
          startTime,
          endTime,
          notes,
          status: "approved",
        },
      });

      // シフト表に即時反映
      await prisma.shiftSlot.deleteMany({
        where: { dayId, castId: cast.id },
      });
      const slots = [];
      for (let t = startTime; t < endTime; t += 0.5) {
        slots.push({
          dayId,
          timeSlot: t,
          castId: cast.id,
          isStart: t === startTime,
          isEnd: t + 0.5 >= endTime,
          memo: t === startTime ? notes : null,
        });
      }
      if (slots.length > 0) {
        await prisma.shiftSlot.createMany({ data: slots });
      }

      imported++;
    }

    return NextResponse.json({
      success: true,
      message: `取り込み完了: ${imported}件登録, ${skipped}件スキップ`,
      imported,
      skipped,
      errors: errors.slice(0, 10), // 最初の10件のみ
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      message: `取り込みエラー: ${error.message}`,
    }, { status: 500 });
  }
}

// GET: 取り込み状況の確認
export async function GET() {
  const session = await auth();
  const guard = requireStaff(session);
  if (!guard.ok) return guard.res;

  return NextResponse.json({
    configured: isSheetsConfigured(),
    description:
      "Googleフォーム回答シートからシフト希望を取り込みます。シートの構造: A列=タイムスタンプ, B列=メールアドレス, C列=日付(YYYY-MM-DD またはスラッシュ), D列=出勤時間(数値例:20), E列=退勤時間(数値例:25), F列=メモ",
    formSetup: {
      questionOrder: [
        "メールアドレス（ログインと同じ）",
        "日付（YYYY-MM-DD 推奨）",
        "出勤（数値 19〜29、0.5刻み。例: 20.5=20:30）",
        "退勤（同上）",
        "備考（任意）",
      ],
      responseSheetNameDefault: "フォームの回答 1",
    },
  });
}
