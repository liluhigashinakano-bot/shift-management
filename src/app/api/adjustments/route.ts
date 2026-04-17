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
    await prisma.shiftAdjustment.delete({ where: { id: body.id } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
