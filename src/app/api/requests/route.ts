import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { assertShiftRequestsUnlocked } from "@/lib/shift-request-lock";

function getRole(session: any) {
  return (session?.user as any)?.role as string | undefined;
}

// シフト希望をシフト表に即時反映するヘルパー
async function applyToShiftTable(castId: string, periodId: string, date: Date, startTime: number, endTime: number, notes?: string | null) {
  const period = await prisma.shiftPeriod.findUnique({
    where: { id: periodId },
    include: { shiftDays: true },
  });
  if (!period) return;

  const reqDate = new Date(date);
  const day = period.shiftDays.find(
    (d) => new Date(d.date).toDateString() === reqDate.toDateString()
  );
  if (!day) return;

  // 既存スロット削除（同キャスト・同日）
  await prisma.shiftSlot.deleteMany({
    where: { dayId: day.id, castId },
  });

  // 30分刻みでスロット作成
  const slots = [];
  for (let t = startTime; t < endTime; t += 0.5) {
    slots.push({
      dayId: day.id,
      timeSlot: t,
      castId,
      isStart: t === startTime,
      isEnd: t + 0.5 >= endTime,
      memo: t === startTime ? (notes || null) : null,
    });
  }
  if (slots.length > 0) {
    await prisma.shiftSlot.createMany({ data: slots });
  }
}

// GET: シフト希望一覧
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const periodId = req.nextUrl.searchParams.get("periodId");
  const castIdParam = req.nextUrl.searchParams.get("castId");
  const role = getRole(session);
  const castId = role === "cast" ? session.user.id : castIdParam;

  const where: Record<string, unknown> = {};
  if (periodId) where.periodId = periodId;
  if (castId) where.castId = castId;

  const requests = await prisma.shiftRequest.findMany({
    where,
    include: {
      cast: { select: { id: true, name: true, store: { select: { name: true } } } },
      period: { select: { store: { select: { name: true } }, year: true, month: true, half: true } },
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });

  return NextResponse.json(requests);
}

// POST: シフト希望を作成/更新
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = getRole(session);

  const body = await req.json();
  const { action } = body;

  // 単一登録 → 即時シフト表反映
  if (action === "create") {
    const { castId, periodId, date, startTime, endTime, notes } = body;
    if (role === "cast" && castId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const lockedRes = await assertShiftRequestsUnlocked(periodId);
    if (lockedRes) return lockedRes;
    const request = await prisma.shiftRequest.create({
      data: {
        castId,
        periodId,
        date: new Date(date),
        startTime,
        endTime,
        notes,
        status: "approved",
      },
    });
    await applyToShiftTable(castId, periodId, new Date(date), startTime, endTime, notes);
    return NextResponse.json(request);
  }

  // 複数日一括登録 → 即時シフト表反映
  if (action === "bulkCreate") {
    const { castId, periodId, entries } = body as {
      castId: string;
      periodId: string;
      entries: { date: string; startTime: number; endTime: number; notes?: string }[];
    };
    if (role === "cast" && castId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const lockedBulk = await assertShiftRequestsUnlocked(periodId);
    if (lockedBulk) return lockedBulk;

    // 同じ日が複数回あれば最後の内容を採用
    const byCalendarDay = new Map<string, (typeof entries)[0]>();
    for (const e of entries) {
      const key = new Date(e.date).toISOString().slice(0, 10);
      byCalendarDay.set(key, e);
    }
    const merged = [...byCalendarDay.values()];
    const datesToReplace = merged.map((e) => new Date(e.date));

    // 今回チェックした日付の希望だけ置き換え（他の日は残す。全削除すると追加分だけになって上書きに見える）
    if (datesToReplace.length > 0) {
      await prisma.shiftRequest.deleteMany({
        where: { castId, periodId, date: { in: datesToReplace } },
      });
    }

    const data = merged.map((e) => ({
      castId,
      periodId,
      date: new Date(e.date),
      startTime: e.startTime,
      endTime: e.endTime,
      notes: e.notes || null,
      status: "approved" as const,
    }));

    await prisma.shiftRequest.createMany({ data });

    for (const entry of merged) {
      await applyToShiftTable(castId, periodId, new Date(entry.date), entry.startTime, entry.endTime, entry.notes);
    }

    return NextResponse.json({ ok: true, count: data.length });
  }

  if (action === "updateStatus") {
    // ステータス更新は管理者/社員のみ
    if (role === "cast") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id, status } = body;
    const row = await prisma.shiftRequest.findUnique({
      where: { id },
      select: { periodId: true },
    });
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const lockedSt = await assertShiftRequestsUnlocked(row.periodId);
    if (lockedSt) return lockedSt;
    await prisma.shiftRequest.update({
      where: { id },
      data: { status },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "delete") {
    const { id } = body;
    const existing = await prisma.shiftRequest.findUnique({
      where: { id },
      select: { castId: true, periodId: true },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (role === "cast" && existing.castId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const lockedDel = await assertShiftRequestsUnlocked(existing.periodId);
    if (lockedDel) return lockedDel;
    await prisma.shiftRequest.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
