import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readSheet, isSheetsConfigured } from "@/lib/google-sheets";

// POST: Googleフォームの回答（Google Sheets経由）をシフト希望に取り込み
// フォームの回答シートの想定構造:
// A列: タイムスタンプ, B列: メールアドレス, C列: 日付(YYYY-MM-DD), D列: 出勤時間(数値), E列: 退勤時間(数値), F列: メモ
export async function POST(req: NextRequest) {
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
      const dateStr = String(row[2] || "").trim();
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
  return NextResponse.json({
    configured: isSheetsConfigured(),
    description: "Googleフォーム回答シートからシフト希望を取り込みます。シートの構造: A列=タイムスタンプ, B列=メールアドレス, C列=日付(YYYY-MM-DD), D列=出勤時間(数値例:20), E列=退勤時間(数値例:25), F列=メモ",
  });
}
