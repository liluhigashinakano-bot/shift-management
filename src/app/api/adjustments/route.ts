import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { canAccessStore, canEditStore } from "@/lib/store-access";
import { getRole } from "@/lib/session-user";
import { isValidShiftRange, INVALID_RANGE_MESSAGE } from "@/lib/shift-time-range";

// GET: 調整一覧取得
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = getRole(session);

  const periodId = req.nextUrl.searchParams.get("periodId");
  if (!periodId) {
    return NextResponse.json({ error: "periodId required" }, { status: 400 });
  }

  const period = await prisma.shiftPeriod.findUnique({
    where: { id: periodId },
    select: { storeId: true },
  });
  if (!period) {
    return NextResponse.json({ error: "Period not found" }, { status: 404 });
  }
  // キャストは自分の分だけ。それ以外は見られる店舗かを確かめる
  // （以前は店舗の確認が無く、住所を打てば他店舗の調整を取り出せた）
  if (role !== "cast" && !canAccessStore(session.user, period.storeId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
  if (role !== "admin" && role !== "employee") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "リクエストの形式が不正です" }, { status: 400 });
  }
  const action = typeof body.action === "string" ? body.action : "";

  if (action === "create") {
    const dayId = String(body.dayId ?? "");
    const castId = String(body.castId ?? "");
    const originalStart = body.originalStart as number;
    const originalEnd = body.originalEnd as number;
    const adjustedStart = (body.adjustedStart ?? null) as number | null;
    const adjustedEnd = (body.adjustedEnd ?? null) as number | null;
    const adjustAction = String(body.adjustAction ?? "");
    const reason = typeof body.reason === "string" ? body.reason.trim() || null : null;

    if (!dayId || !castId) {
      return NextResponse.json({ error: "dayId と castId が必要です" }, { status: 400 });
    }
    if (!isValidShiftRange(originalStart, originalEnd)) {
      return NextResponse.json({ error: INVALID_RANGE_MESSAGE }, { status: 400 });
    }
    if (
      adjustedStart !== null &&
      adjustedEnd !== null &&
      !isValidShiftRange(adjustedStart, adjustedEnd)
    ) {
      return NextResponse.json({ error: INVALID_RANGE_MESSAGE }, { status: 400 });
    }
    if (!["cut", "shorten", "move", "help"].includes(adjustAction)) {
      return NextResponse.json({ error: "アクションの指定が不正です" }, { status: 400 });
    }

    const dayRow = await prisma.shiftDay.findUnique({
      where: { id: dayId },
      select: { period: { select: { adjustmentConfirmedPublished: true, storeId: true } } },
    });
    if (!dayRow) {
      return NextResponse.json({ error: "日が見つかりません" }, { status: 404 });
    }
    if (dayRow.period.adjustmentConfirmedPublished) {
      return NextResponse.json(
        {
          error:
            "シフト確定済みのため調整記録を追加できません（「シフトロック中」ボタンで解除してください）",
        },
        { status: 403 },
      );
    }
    if (!canEditStore(session.user, dayRow.period.storeId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const adj = await prisma.shiftAdjustment.create({
      data: {
        dayId,
        castId,
        originalStart,
        originalEnd,
        adjustedStart,
        adjustedEnd,
        action: adjustAction,
        reason,
      },
    });
    return NextResponse.json(adj);
  }

  if (action === "delete") {
    const adjId = String(body.id ?? "").trim();
    if (!adjId) {
      return NextResponse.json({ error: "id が必要です" }, { status: 400 });
    }
    const existingAdj = await prisma.shiftAdjustment.findUnique({
      where: { id: adjId },
      select: {
        day: {
          select: {
            period: { select: { adjustmentConfirmedPublished: true, storeId: true } },
          },
        },
      },
    });
    if (!existingAdj) {
      return NextResponse.json({ error: "調整が見つかりません" }, { status: 404 });
    }
    if (existingAdj.day.period.adjustmentConfirmedPublished) {
      return NextResponse.json(
        {
          error:
            "シフト確定済みのため調整記録を削除できません（「シフトロック中」ボタンで解除してください）",
        },
        { status: 403 },
      );
    }
    if (!canEditStore(session.user, existingAdj.day.period.storeId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await prisma.shiftAdjustment.delete({ where: { id: adjId } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
