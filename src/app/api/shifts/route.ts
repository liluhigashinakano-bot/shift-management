import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { assertShiftRequestsUnlocked } from "@/lib/shift-request-lock";
import { assertShiftSlotsUnlocked } from "@/lib/shift-slot-lock";

function getRole(session: any) {
  return (session?.user as any)?.role as string | undefined;
}

// GET: シフト期間のデータを取得
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = getRole(session);
  if (role === "cast") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const periodId = req.nextUrl.searchParams.get("periodId");
  if (!periodId) {
    return NextResponse.json({ error: "periodId is required" }, { status: 400 });
  }

  const period = await prisma.shiftPeriod.findUnique({
    where: { id: periodId },
    include: {
      store: true,
      shiftDays: {
        orderBy: { date: "asc" },
        include: {
          shiftSlots: {
            include: { cast: { select: { id: true, name: true } } },
            orderBy: { timeSlot: "asc" },
          },
        },
      },
    },
  });

  if (!period) {
    return NextResponse.json({ error: "Period not found" }, { status: 404 });
  }

  // シフト希望情報をdayIdにマッピングして返す
  const requests = await prisma.shiftRequest.findMany({
    where: { periodId },
    select: { castId: true, date: true, startTime: true, endTime: true, notes: true },
  });

  // date → dayId のマッピングを構築
  const dayMap = new Map<string, string>();
  for (const day of period.shiftDays) {
    const key = new Date(day.date).toISOString().slice(0, 10);
    dayMap.set(key, day.id);
  }

  const shiftRequests = requests.map((r) => ({
    castId: r.castId,
    dayId: dayMap.get(new Date(r.date).toISOString().slice(0, 10)) || null,
    date: r.date,
    startTime: r.startTime,
    endTime: r.endTime,
    notes: r.notes,
  }));

  // ヘルプ出勤情報: この店舗所属のキャストが他店舗のシフトに入っている情報を取得
  const storeId = period.storeId;
  const storeCasts = await prisma.user.findMany({
    where: { storeId, role: "cast" },
    select: { id: true, name: true },
  });
  const storeCastIds = storeCasts.map((c) => c.id);
  const castNameMap = new Map(storeCasts.map((c) => [c.id, c.name]));

  // 他店舗のシフト期間（同じ年月）のスロットを検索
  const otherPeriods = await prisma.shiftPeriod.findMany({
    where: {
      year: period.year,
      month: period.month,
      half: period.half,
      storeId: { not: storeId },
    },
    include: {
      store: { select: { name: true } },
      shiftDays: {
        select: {
          date: true,
          shiftSlots: {
            where: { castId: { in: storeCastIds } },
            select: { castId: true, timeSlot: true },
          },
        },
      },
    },
  });

  // ヘルプ情報を日付キーで整理: { "2026-03-31": [{ castName, storeName, start, end }] }
  const helpInfo: Record<string, { castName: string; storeName: string; startTime: number; endTime: number }[]> = {};

  for (const op of otherPeriods) {
    for (const opDay of op.shiftDays) {
      if (opDay.shiftSlots.length === 0) continue;
      const dateKey = new Date(opDay.date).toISOString().slice(0, 10);
      // このdateKeyに対応する自店舗のdayIdを探す
      const myDayId = dayMap.get(dateKey);
      if (!myDayId) continue;

      // キャストごとに出退勤時間を計算
      const castSlots = new Map<string, number[]>();
      for (const slot of opDay.shiftSlots) {
        if (!castSlots.has(slot.castId)) castSlots.set(slot.castId, []);
        castSlots.get(slot.castId)!.push(slot.timeSlot);
      }

      for (const [castId, slots] of castSlots) {
        const castName = castNameMap.get(castId) || "不明";
        if (!helpInfo[myDayId]) helpInfo[myDayId] = [];
        helpInfo[myDayId].push({
          castName,
          storeName: op.store.name,
          startTime: Math.min(...slots),
          endTime: Math.max(...slots) + 0.5,
        });
      }
    }
  }

  return NextResponse.json({ ...period, shiftRequests, helpInfo });
}

// POST: スロット操作
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = getRole(session);
  if (role !== "admin" && role !== "employee") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { action, dayId, castId } = body;

  if (action === "addCast") {
    const { startTime, endTime, memo } = body;
    const start = startTime as number;
    const end = endTime as number;

    const dayForLock = await prisma.shiftDay.findUnique({
      where: { id: dayId },
      select: { periodId: true },
    });
    if (!dayForLock) {
      return NextResponse.json({ error: "Day not found" }, { status: 404 });
    }
    const lockRes = await assertShiftRequestsUnlocked(dayForLock.periodId);
    if (lockRes) return lockRes;
    const slotLockRes = await assertShiftSlotsUnlocked(dayForLock.periodId);
    if (slotLockRes) return slotLockRes;

    const slots = [];

    for (let t = start; t < end; t += 0.5) {
      slots.push({
        dayId,
        timeSlot: t,
        castId,
        isStart: t === start,
        isEnd: t + 0.5 >= end,
        memo: t === start ? memo : null,
      });
    }

    await prisma.shiftSlot.deleteMany({ where: { dayId, castId } });
    if (slots.length > 0) {
      await prisma.shiftSlot.createMany({ data: slots });
    }

    // ShiftRequestも作成（元の時間を記録して、後で変更時に色を変えるため）
    const day = await prisma.shiftDay.findUnique({
      where: { id: dayId },
      select: { date: true, periodId: true },
    });
    if (day) {
      // 同じキャスト・同じ日の既存リクエストを削除してから作成
      await prisma.shiftRequest.deleteMany({
        where: { castId, periodId: day.periodId, date: day.date },
      });
      await prisma.shiftRequest.create({
        data: {
          castId,
          periodId: day.periodId,
          date: day.date,
          startTime: start,
          endTime: end,
          notes: memo || null,
          status: "approved",
        },
      });
    }

    return NextResponse.json({ ok: true });
  }

  // 削除 + 調整記録を自動作成
  if (action === "removeCast") {
    const { reason } = body;

    const dayForSlotLock = await prisma.shiftDay.findUnique({
      where: { id: dayId },
      select: { periodId: true },
    });
    if (!dayForSlotLock) {
      return NextResponse.json({ error: "Day not found" }, { status: 404 });
    }
    const slotLockRm = await assertShiftSlotsUnlocked(dayForSlotLock.periodId);
    if (slotLockRm) return slotLockRm;

    // 削除前に元の時間を記録
    const existing = await prisma.shiftSlot.findMany({
      where: { dayId, castId },
      orderBy: { timeSlot: "asc" },
    });

    if (existing.length > 0) {
      const originalStart = existing[0].timeSlot;
      const originalEnd = existing[existing.length - 1].timeSlot + 0.5;

      // 調整記録を作成
      await prisma.shiftAdjustment.create({
        data: {
          dayId,
          castId,
          originalStart,
          originalEnd,
          adjustedStart: null,
          adjustedEnd: null,
          action: "cut",
          reason: reason || "シフト表から削除",
        },
      });
    }

    await prisma.shiftSlot.deleteMany({ where: { dayId, castId } });
    return NextResponse.json({ ok: true });
  }

  // 編集（時間変更）+ 調整記録を自動作成
  if (action === "editCast") {
    const { newStart, newEnd, reason } = body;

    const dayForEditLock = await prisma.shiftDay.findUnique({
      where: { id: dayId },
      select: { periodId: true },
    });
    if (!dayForEditLock) {
      return NextResponse.json({ error: "Day not found" }, { status: 404 });
    }
    const slotLockEd = await assertShiftSlotsUnlocked(dayForEditLock.periodId);
    if (slotLockEd) return slotLockEd;

    // 元の時間を取得
    const existing = await prisma.shiftSlot.findMany({
      where: { dayId, castId },
      orderBy: { timeSlot: "asc" },
    });

    if (existing.length > 0) {
      const originalStart = existing[0].timeSlot;
      const originalEnd = existing[existing.length - 1].timeSlot + 0.5;

      // 時間が変わった場合のみ調整記録
      if (originalStart !== newStart || originalEnd !== newEnd) {
        const adjAction = (newEnd - newStart) < (originalEnd - originalStart) ? "shorten" : "move";
        await prisma.shiftAdjustment.create({
          data: {
            dayId,
            castId,
            originalStart,
            originalEnd,
            adjustedStart: newStart,
            adjustedEnd: newEnd,
            action: adjAction,
            reason: reason || "時間変更",
          },
        });
      }
    }

    // 元のスロットからメモを保持（出勤スロットのメモ = シフト希望メモ）
    const startSlotMemo = existing.find((s) => s.isStart)?.memo || null;

    // スロットを再作成（メモを引き継ぎ）
    await prisma.shiftSlot.deleteMany({ where: { dayId, castId } });
    const slots = [];
    for (let t = newStart; t < newEnd; t += 0.5) {
      slots.push({
        dayId,
        timeSlot: t,
        castId,
        isStart: t === newStart,
        isEnd: t + 0.5 >= newEnd,
        memo: t === newStart ? startSlotMemo : null,
      });
    }
    if (slots.length > 0) {
      await prisma.shiftSlot.createMany({ data: slots });
    }

    return NextResponse.json({ ok: true });
  }

  // 管理者メモ（日単位のJSON、キーは時間スロット）を更新
  if (action === "updateSlotMemo") {
    const { timeSlot, memo } = body;
    const day = await prisma.shiftDay.findUnique({ where: { id: dayId } });
    if (!day) return NextResponse.json({ error: "Day not found" }, { status: 404 });
    const slotMemoLock = await assertShiftSlotsUnlocked(day.periodId);
    if (slotMemoLock) return slotMemoLock;

    // notesフィールドにJSON形式で管理者メモを保存: {"slotMemos":{"20":"メモ内容",...}, "text":"通常備考"}
    let parsed: any = {};
    try { parsed = day.notes ? JSON.parse(day.notes) : {}; } catch { parsed = { text: day.notes || "" }; }
    if (!parsed.slotMemos) parsed.slotMemos = {};
    if (memo) {
      parsed.slotMemos[timeSlot.toString()] = memo;
    } else {
      delete parsed.slotMemos[timeSlot.toString()];
    }
    await prisma.shiftDay.update({
      where: { id: dayId },
      data: { notes: JSON.stringify(parsed) },
    });
    return NextResponse.json({ ok: true });
  }

  // 備考テキストだけ更新（slotMemosを保持）
  if (action === "updateNotesText") {
    const { text } = body;
    const day = await prisma.shiftDay.findUnique({ where: { id: dayId } });
    if (!day) return NextResponse.json({ error: "Day not found" }, { status: 404 });
    const lockNotes = await assertShiftSlotsUnlocked(day.periodId);
    if (lockNotes) return lockNotes;

    let parsed: any = {};
    if (day.notes) {
      try { parsed = JSON.parse(day.notes); } catch { parsed = {}; }
    }
    parsed.text = text || "";
    await prisma.shiftDay.update({
      where: { id: dayId },
      data: { notes: JSON.stringify(parsed) },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "updateDay") {
    const { targetBudget, eventName, expectedVisitors, notes, employeeOnDuty } = body;
    const dayForUpdate = await prisma.shiftDay.findUnique({
      where: { id: dayId },
      select: { periodId: true },
    });
    if (!dayForUpdate) {
      return NextResponse.json({ error: "Day not found" }, { status: 404 });
    }
    const lockDay = await assertShiftSlotsUnlocked(dayForUpdate.periodId);
    if (lockDay) return lockDay;
    await prisma.shiftDay.update({
      where: { id: dayId },
      data: { targetBudget, eventName, expectedVisitors, notes, employeeOnDuty },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
