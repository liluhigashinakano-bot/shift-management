import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

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
  const periodId = req.nextUrl.searchParams.get("periodId");
  const castId = req.nextUrl.searchParams.get("castId");

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
  const body = await req.json();
  const { action } = body;

  // 単一登録 → 即時シフト表反映
  if (action === "create") {
    const { castId, periodId, date, startTime, endTime, notes } = body;
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

    // 既存の希望を削除
    await prisma.shiftRequest.deleteMany({
      where: { castId, periodId },
    });

    const data = entries.map((e) => ({
      castId,
      periodId,
      date: new Date(e.date),
      startTime: e.startTime,
      endTime: e.endTime,
      notes: e.notes || null,
      status: "approved" as const,
    }));

    await prisma.shiftRequest.createMany({ data });

    // 全エントリをシフト表に即時反映
    for (const entry of entries) {
      await applyToShiftTable(castId, periodId, new Date(entry.date), entry.startTime, entry.endTime, entry.notes);
    }

    return NextResponse.json({ ok: true, count: data.length });
  }

  if (action === "updateStatus") {
    const { id, status } = body;
    await prisma.shiftRequest.update({
      where: { id },
      data: { status },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "delete") {
    const { id } = body;
    await prisma.shiftRequest.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
