import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

function getRole(session: any) {
  return (session?.user as any)?.role as string | undefined;
}

// GET: 調整一覧取得
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = getRole(session);

  const periodId = req.nextUrl.searchParams.get("periodId");
  if (!periodId) {
    return NextResponse.json({ error: "periodId required" }, { status: 400 });
  }

  // periodに属するshiftDayのIDを取得
  const days = await prisma.shiftDay.findMany({
    where: { periodId },
    select: { id: true },
  });
  const dayIds = days.map((d) => d.id);

  const adjustments = await prisma.shiftAdjustment.findMany({
    where: {
      dayId: { in: dayIds },
      ...(role === "cast" ? { castId: session.user.id } : {}),
    },
    include: {
      cast: { select: { id: true, name: true, store: { select: { name: true } } } },
      day: { select: { date: true, dayOfWeek: true } },
    },
    orderBy: [{ day: { date: "asc" } }, { createdAt: "asc" }],
  });

  return NextResponse.json(adjustments);
}

// POST: 調整記録を作成
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = getRole(session);
  if (role === "cast") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { action } = body;

  if (action === "create") {
    const { dayId, castId, originalStart, originalEnd, adjustedStart, adjustedEnd, adjustAction, reason } = body;
    const dayRow = await prisma.shiftDay.findUnique({
      where: { id: dayId as string },
      select: { period: { select: { adjustmentConfirmedPublished: true } } },
    });
    if (!dayRow) {
      return NextResponse.json({ error: "日が見つかりません" }, { status: 404 });
    }
    if (dayRow.period.adjustmentConfirmedPublished) {
      return NextResponse.json(
        { error: "シフト確定済みのため調整記録を追加できません（「シフトを編集する」で解除してください）" },
        { status: 403 },
      );
    }
    const adj = await prisma.shiftAdjustment.create({
      data: {
        dayId,
        castId,
        originalStart,
        originalEnd,
        adjustedStart: adjustedStart ?? null,
        adjustedEnd: adjustedEnd ?? null,
        action: adjustAction,
        reason: reason || null,
      },
    });
    return NextResponse.json(adj);
  }

  if (action === "delete") {
    const adjId = String((body as { id?: unknown }).id ?? "").trim();
    if (!adjId) {
      return NextResponse.json({ error: "id が必要です" }, { status: 400 });
    }
    const existingAdj = await prisma.shiftAdjustment.findUnique({
      where: { id: adjId },
      select: { day: { select: { period: { select: { adjustmentConfirmedPublished: true } } } } },
    });
    if (!existingAdj) {
      return NextResponse.json({ error: "調整が見つかりません" }, { status: 404 });
    }
    if (existingAdj.day.period.adjustmentConfirmedPublished) {
      return NextResponse.json(
        { error: "シフト確定済みのため調整記録を削除できません（「シフトを編集する」で解除してください）" },
        { status: 403 },
      );
    }
    await prisma.shiftAdjustment.delete({ where: { id: adjId } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
