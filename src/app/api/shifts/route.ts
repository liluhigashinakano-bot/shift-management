import { NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { assertStaffShiftPeriodNotFinalized } from "@/lib/shift-slot-lock";
import { canAccessStore, canEditStore } from "@/lib/store-access";
import { getRole } from "@/lib/session-user";
import {
  createTrialGuestUser,
  deleteTrialGuestIfUnused,
} from "@/lib/trial-guest-user";
import { parseTrialGuestName, TRIAL_GUEST_NAME_MAX_LEN } from "@/lib/trial-guest-constants";
import { INVALID_RANGE_MESSAGE, isValidShiftRange } from "@/lib/shift-time-range";
import { repairSlotBoundaries, slotsForRange } from "@/lib/shift-slot-writer";

function assertCanEditStore(session: Session, storeId: string) {
  if (!canEditStore(session.user, storeId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

function invalidRange() {
  return NextResponse.json({ error: INVALID_RANGE_MESSAGE }, { status: 400 });
}

function asOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
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
            include: { cast: { select: { id: true, name: true, isTrialGuest: true } } },
            orderBy: { timeSlot: "asc" },
          },
        },
      },
    },
  });

  if (!period) {
    return NextResponse.json({ error: "Period not found" }, { status: 404 });
  }
  if (!canAccessStore(session.user, period.storeId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // シフト希望情報をdayIdにマッピングして返す。
  const requests = await prisma.shiftRequest.findMany({
    where: { periodId },
    select: {
      id: true,
      castId: true,
      date: true,
      startTime: true,
      endTime: true,
      notes: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  // date → dayId のマッピングを構築
  const dayMap = new Map<string, string>();
  for (const day of period.shiftDays) {
    const key = new Date(day.date).toISOString().slice(0, 10);
    dayMap.set(key, day.id);
  }

  const shiftRequests = requests.map((r) => ({
    id: r.id,
    castId: r.castId,
    dayId: dayMap.get(new Date(r.date).toISOString().slice(0, 10)) || null,
    date: r.date,
    startTime: r.startTime,
    endTime: r.endTime,
    notes: r.notes,
    status: r.status,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));

  // ヘルプ出勤情報: この店舗所属のキャストが他店舗のシフトに入っている情報を取得
  const storeId = period.storeId;
  const storeCasts = await prisma.user.findMany({
    where: { storeId, role: "cast", isTrialGuest: false },
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

  // ヘルプ情報（castId 付き）: 自店所属キャストが他店のシフトに入っている件。
  // UI は同一キャストのローカル slot と二重表示しないよう castId で除外する。
  const helpInfo: Record<
    string,
    { castId: string; castName: string; storeName: string; startTime: number; endTime: number }[]
  > = {};

  for (const op of otherPeriods) {
    for (const opDay of op.shiftDays) {
      if (opDay.shiftSlots.length === 0) continue;
      const dateKey = new Date(opDay.date).toISOString().slice(0, 10);
      const myDayId = dayMap.get(dateKey);
      if (!myDayId) continue;

      const castSlots = new Map<string, number[]>();
      for (const slot of opDay.shiftSlots) {
        if (!castSlots.has(slot.castId)) castSlots.set(slot.castId, []);
        castSlots.get(slot.castId)!.push(slot.timeSlot);
      }

      for (const [cid, slots] of castSlots) {
        const castName = castNameMap.get(cid) || "不明";
        if (!helpInfo[myDayId]) helpInfo[myDayId] = [];
        helpInfo[myDayId]!.push({
          castId: cid,
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
  const dayId = typeof body.dayId === "string" ? body.dayId : "";
  const castId = typeof body.castId === "string" ? body.castId : "";

  if (action === "addCast") {
    const start = body.startTime as number;
    const end = body.endTime as number;
    const memo = asOptionalString(body.memo);
    const trialGuestName = body.trialGuestName;

    if (!isValidShiftRange(start, end)) return invalidRange();
    if (!dayId) {
      return NextResponse.json({ error: "dayId is required" }, { status: 400 });
    }

    const day = await prisma.shiftDay.findUnique({
      where: { id: dayId },
      select: {
        date: true,
        periodId: true,
        period: {
          select: {
            year: true,
            month: true,
            half: true,
            storeId: true,
            store: { select: { name: true } },
          },
        },
      },
    });
    if (!day) {
      return NextResponse.json({ error: "Day not found" }, { status: 404 });
    }
    const editRes = assertCanEditStore(session, day.period.storeId);
    if (editRes) return editRes;
    const lockRes = await assertStaffShiftPeriodNotFinalized(day.periodId);
    if (lockRes) return lockRes;

    let trialName: string | null = null;
    if (trialGuestName != null && String(trialGuestName).trim() !== "") {
      try {
        trialName = parseTrialGuestName(trialGuestName);
      } catch {
        return NextResponse.json(
          { error: `体入の名前は1〜${TRIAL_GUEST_NAME_MAX_LEN}文字で入力してください` },
          { status: 400 },
        );
      }
    } else if (!castId) {
      return NextResponse.json(
        { error: "castId or trialGuestName is required" },
        { status: 400 },
      );
    }

    // 体入でないときは、指定されたキャストが実在することを先に確かめる
    const existingCast = trialName
      ? null
      : await prisma.user.findUnique({
          where: { id: castId },
          select: { id: true, storeId: true, role: true },
        });
    if (!trialName && (!existingCast || existingCast.role !== "cast")) {
      return NextResponse.json({ error: "キャストが見つかりません" }, { status: 404 });
    }

    // 所属が他店なら、その店の同じ日から重なる時間帯だけ外す
    let homeDayId: string | null = null;
    let homePeriodId: string | null = null;
    const homeStoreId = existingCast?.storeId ?? null;
    if (homeStoreId && homeStoreId !== day.period.storeId) {
      const homePeriod = await prisma.shiftPeriod.findFirst({
        where: {
          storeId: homeStoreId,
          year: day.period.year,
          month: day.period.month,
          half: day.period.half,
        },
        select: { id: true },
      });
      if (homePeriod) {
        homePeriodId = homePeriod.id;
        if (homePeriodId !== day.periodId) {
          const lockHome = await assertStaffShiftPeriodNotFinalized(homePeriodId);
          if (lockHome) return lockHome;
        }
        const homeDay = await prisma.shiftDay.findFirst({
          where: { periodId: homePeriod.id, date: day.date },
          select: { id: true },
        });
        if (homeDay) homeDayId = homeDay.id;
      }
    }

    const adjustmentReason = `→ ${day.period.store.name}`;

    await prisma.$transaction(async (tx) => {
      const effectiveCastId = trialName
        ? (await createTrialGuestUser(trialName, day.period.storeId, tx)).id
        : castId;

      if (homeDayId && homeDayId !== dayId) {
        const removedFromHome = await tx.shiftSlot.findMany({
          where: {
            dayId: homeDayId,
            castId: effectiveCastId,
            timeSlot: { gte: start, lt: end },
          },
          orderBy: { timeSlot: "asc" },
          select: { timeSlot: true },
        });
        if (removedFromHome.length > 0) {
          await tx.shiftSlot.deleteMany({
            where: {
              dayId: homeDayId,
              castId: effectiveCastId,
              timeSlot: { gte: start, lt: end },
            },
          });
          await tx.shiftAdjustment.create({
            data: {
              dayId: homeDayId,
              castId: effectiveCastId,
              originalStart: removedFromHome[0]!.timeSlot,
              originalEnd: removedFromHome[removedFromHome.length - 1]!.timeSlot + 0.5,
              adjustedStart: null,
              adjustedEnd: null,
              action: "help",
              reason: adjustmentReason,
            },
          });
          await repairSlotBoundaries(tx, homeDayId, effectiveCastId);
        }
      }

      // 重なる時間帯だけ差し替える。
      // 以前はその日のスロットを全部消していたため、同じ日に 2 回追加すると
      // 先に入れた時間帯が黙って消えていた。
      await tx.shiftSlot.deleteMany({
        where: { dayId, castId: effectiveCastId, timeSlot: { gte: start, lt: end } },
      });
      const newSlots = slotsForRange(dayId, effectiveCastId, start, end, memo);
      if (newSlots.length > 0) {
        await tx.shiftSlot.createMany({ data: newSlots });
      }
      await repairSlotBoundaries(tx, dayId, effectiveCastId);
    });

    return NextResponse.json({ ok: true });
  }

  /**
   * 自店舗のシフト表で開いた「キャスト編集モーダル」のヘルプ出勤タブから、
   * 当該キャストを別店舗のシフト表へヘルプとして追加する。
   *
   * 権限: sourceDay が属する店舗（開いているシフト表の店）を編集できること。
   * 追加先店舗へのアクセスは不要（自店から他店へヘルプを登録する操作のため）。
   */
  if (action === "addCastHelp") {
    const sourceDayId = typeof body.sourceDayId === "string" ? body.sourceDayId : "";
    const targetStoreName =
      typeof body.targetStoreName === "string" ? body.targetStoreName : "";
    const start = body.startTime as number;
    const end = body.endTime as number;
    const memo = asOptionalString(body.memo);
    const helpCastId = castId;

    if (!sourceDayId || !targetStoreName || !helpCastId) {
      return NextResponse.json(
        { error: "sourceDayId, targetStoreName, castId are required" },
        { status: 400 },
      );
    }
    if (!isValidShiftRange(start, end)) return invalidRange();

    const sourceDay = await prisma.shiftDay.findUnique({
      where: { id: sourceDayId },
      select: {
        date: true,
        periodId: true,
        period: { select: { year: true, month: true, half: true, storeId: true } },
      },
    });
    if (!sourceDay) {
      return NextResponse.json({ error: "Source day not found" }, { status: 404 });
    }

    const targetStore = await prisma.store.findUnique({
      where: { name: targetStoreName },
      select: { id: true },
    });
    if (!targetStore) {
      return NextResponse.json({ error: "Target store not found" }, { status: 404 });
    }

    if (!canEditStore(session.user, sourceDay.period.storeId)) {
      return NextResponse.json({ error: "Forbidden: source store" }, { status: 403 });
    }

    const targetPeriod = await prisma.shiftPeriod.findFirst({
      where: {
        storeId: targetStore.id,
        year: sourceDay.period.year,
        month: sourceDay.period.month,
        half: sourceDay.period.half,
      },
      select: { id: true },
    });
    if (!targetPeriod) {
      return NextResponse.json(
        { error: "対象店舗の同期間のシフトが作成されていません。" },
        { status: 404 },
      );
    }

    const targetDay = await prisma.shiftDay.findFirst({
      where: { periodId: targetPeriod.id, date: sourceDay.date },
      select: { id: true },
    });
    if (!targetDay) {
      return NextResponse.json(
        { error: "対象店舗で同日付のシフト日が見つかりません。" },
        { status: 404 },
      );
    }

    const castUser = await prisma.user.findUnique({
      where: { id: helpCastId },
      select: { storeId: true },
    });

    let homeDayId: string | null = null;
    let homePeriodId: string | null = null;
    if (castUser?.storeId && castUser.storeId !== targetStore.id) {
      const homePeriod = await prisma.shiftPeriod.findFirst({
        where: {
          storeId: castUser.storeId,
          year: sourceDay.period.year,
          month: sourceDay.period.month,
          half: sourceDay.period.half,
        },
        select: { id: true },
      });
      if (homePeriod) {
        homePeriodId = homePeriod.id;
        const homeDay = await prisma.shiftDay.findFirst({
          where: { periodId: homePeriod.id, date: sourceDay.date },
          select: { id: true },
        });
        if (homeDay) homeDayId = homeDay.id;
      }
    }

    const lockTarget = await assertStaffShiftPeriodNotFinalized(targetPeriod.id);
    if (lockTarget) return lockTarget;
    if (sourceDay.periodId !== targetPeriod.id) {
      const lockSource = await assertStaffShiftPeriodNotFinalized(sourceDay.periodId);
      if (lockSource) return lockSource;
    }
    if (
      homePeriodId &&
      homePeriodId !== sourceDay.periodId &&
      homePeriodId !== targetPeriod.id
    ) {
      const lockHome = await assertStaffShiftPeriodNotFinalized(homePeriodId);
      if (lockHome) return lockHome;
    }

    const sourceExisting = await prisma.shiftSlot.findMany({
      where: { dayId: sourceDayId, castId: helpCastId },
      orderBy: { timeSlot: "asc" },
      select: { timeSlot: true },
    });
    const homeExisting =
      homeDayId && homeDayId !== sourceDayId
        ? await prisma.shiftSlot.findMany({
            where: { dayId: homeDayId, castId: helpCastId },
            orderBy: { timeSlot: "asc" },
            select: { timeSlot: true },
          })
        : [];

    const adjustmentReason = `→ ${targetStoreName}`;
    const newSlots = slotsForRange(targetDay.id, helpCastId, start, end, memo);
    const removedFromSource = sourceExisting.filter(
      (s) => s.timeSlot >= start && s.timeSlot < end,
    );

    await prisma.$transaction(async (tx) => {
      await tx.shiftSlot.deleteMany({
        where: {
          dayId: sourceDayId,
          castId: helpCastId,
          timeSlot: { gte: start, lt: end },
        },
      });

      if (removedFromSource.length > 0) {
        await tx.shiftAdjustment.create({
          data: {
            dayId: sourceDayId,
            castId: helpCastId,
            originalStart: removedFromSource[0]!.timeSlot,
            originalEnd: removedFromSource[removedFromSource.length - 1]!.timeSlot + 0.5,
            adjustedStart: null,
            adjustedEnd: null,
            action: "help",
            reason: adjustmentReason,
          },
        });
      }

      if (homeDayId && homeDayId !== sourceDayId) {
        const removedFromHome = homeExisting.filter(
          (s) => s.timeSlot >= start && s.timeSlot < end,
        );
        if (removedFromHome.length > 0) {
          await tx.shiftSlot.deleteMany({
            where: {
              dayId: homeDayId,
              castId: helpCastId,
              timeSlot: { gte: start, lt: end },
            },
          });
          await tx.shiftAdjustment.create({
            data: {
              dayId: homeDayId,
              castId: helpCastId,
              originalStart: removedFromHome[0]!.timeSlot,
              originalEnd: removedFromHome[removedFromHome.length - 1]!.timeSlot + 0.5,
              adjustedStart: null,
              adjustedEnd: null,
              action: "help",
              reason: adjustmentReason,
            },
          });
        }
      }

      await tx.shiftSlot.deleteMany({
        where: {
          dayId: targetDay.id,
          castId: helpCastId,
          timeSlot: { gte: start, lt: end },
        },
      });
      if (newSlots.length > 0) {
        await tx.shiftSlot.createMany({ data: newSlots });
      }

      await repairSlotBoundaries(tx, sourceDayId, helpCastId);
      if (homeDayId && homeDayId !== sourceDayId) {
        await repairSlotBoundaries(tx, homeDayId, helpCastId);
      }
      await repairSlotBoundaries(tx, targetDay.id, helpCastId);
    });

    return NextResponse.json({ ok: true });
  }

  // 削除 + 調整記録を自動作成
  if (action === "removeCast") {
    const reason = asOptionalString(body.reason);
    if (!dayId || !castId) {
      return NextResponse.json({ error: "dayId と castId が必要です" }, { status: 400 });
    }

    const dayForSlotLock = await prisma.shiftDay.findUnique({
      where: { id: dayId },
      select: { periodId: true, date: true, period: { select: { storeId: true } } },
    });
    if (!dayForSlotLock) {
      return NextResponse.json({ error: "Day not found" }, { status: 404 });
    }
    const editRes = assertCanEditStore(session, dayForSlotLock.period.storeId);
    if (editRes) return editRes;
    const slotLockRm = await assertStaffShiftPeriodNotFinalized(dayForSlotLock.periodId);
    if (slotLockRm) return slotLockRm;

    await prisma.$transaction(async (tx) => {
      // 削除前に元の時間を記録
      const existing = await tx.shiftSlot.findMany({
        where: { dayId, castId },
        orderBy: { timeSlot: "asc" },
        select: { timeSlot: true },
      });

      if (existing.length > 0) {
        await tx.shiftAdjustment.create({
          data: {
            dayId,
            castId,
            originalStart: existing[0]!.timeSlot,
            originalEnd: existing[existing.length - 1]!.timeSlot + 0.5,
            adjustedStart: null,
            adjustedEnd: null,
            action: "cut",
            reason: reason || "シフト表から削除",
          },
        });
      }

      await tx.shiftSlot.deleteMany({ where: { dayId, castId } });

      // ⚠️ シフト希望はここで消さない。
      //    本人が出した希望まで消えると、提出済みのキャストが未提出一覧に載り、
      //    「カットされた」という記録も追えなくなる。
      //    シフト表から直接入れたキャストは、そもそも希望を作らない作りにしてある。

      // 体入は 1 回の追加につき 1 人ぶん作られる。どの日にも載らなくなったら行ごと消す
      await deleteTrialGuestIfUnused(castId, tx);
    });

    return NextResponse.json({ ok: true });
  }

  // 編集（時間変更）+ 調整記録を自動作成
  if (action === "editCast") {
    const newStart = body.newStart as number;
    const newEnd = body.newEnd as number;
    const reason = asOptionalString(body.reason);

    if (!isValidShiftRange(newStart, newEnd)) return invalidRange();
    if (!dayId || !castId) {
      return NextResponse.json({ error: "dayId と castId が必要です" }, { status: 400 });
    }

    const dayForEditLock = await prisma.shiftDay.findUnique({
      where: { id: dayId },
      select: { periodId: true, period: { select: { storeId: true } } },
    });
    if (!dayForEditLock) {
      return NextResponse.json({ error: "Day not found" }, { status: 404 });
    }
    const editRes = assertCanEditStore(session, dayForEditLock.period.storeId);
    if (editRes) return editRes;
    const slotLockEd = await assertStaffShiftPeriodNotFinalized(dayForEditLock.periodId);
    if (slotLockEd) return slotLockEd;

    // 元の時間を取得
    const existing = await prisma.shiftSlot.findMany({
      where: { dayId, castId },
      orderBy: { timeSlot: "asc" },
    });

    // editCast は「既存スロットの時間変更」専用。スロット 0 件の場合は別ユーザー or 別タブで
    // 既に削除されている／元から無いケース。
    if (existing.length === 0) {
      return NextResponse.json(
        {
          error:
            "編集対象のシフトが見つかりません。画面を再読み込みしてから操作してください。",
        },
        { status: 409 },
      );
    }

    const originalStart = existing[0]!.timeSlot;
    const originalEnd = existing[existing.length - 1]!.timeSlot + 0.5;
    // 元のスロットからメモを保持（出勤スロットのメモ = シフト希望メモ）
    const startSlotMemo = existing.find((s) => s.isStart)?.memo ?? null;

    await prisma.$transaction(async (tx) => {
      // 時間が変わった場合のみ調整記録
      if (originalStart !== newStart || originalEnd !== newEnd) {
        const adjAction =
          newEnd - newStart < originalEnd - originalStart ? "shorten" : "move";
        await tx.shiftAdjustment.create({
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

      await tx.shiftSlot.deleteMany({ where: { dayId, castId } });
      const slots = slotsForRange(dayId, castId, newStart, newEnd, startSlotMemo);
      if (slots.length > 0) {
        await tx.shiftSlot.createMany({ data: slots });
      }
    });

    return NextResponse.json({ ok: true });
  }

  // 管理者メモ（日単位のJSON、キーは時間スロット）を更新
  if (action === "updateSlotMemo") {
    const timeSlot = body.timeSlot;
    const memo = typeof body.memo === "string" ? body.memo : "";
    if (typeof timeSlot !== "number" || !Number.isFinite(timeSlot)) {
      return NextResponse.json({ error: "timeSlot が不正です" }, { status: 400 });
    }
    const day = await prisma.shiftDay.findUnique({
      where: { id: dayId },
      select: { id: true, notes: true, periodId: true, period: { select: { storeId: true } } },
    });
    if (!day) return NextResponse.json({ error: "Day not found" }, { status: 404 });
    const editRes = assertCanEditStore(session, day.period.storeId);
    if (editRes) return editRes;
    const slotMemoLock = await assertStaffShiftPeriodNotFinalized(day.periodId);
    if (slotMemoLock) return slotMemoLock;

    // notesフィールドにJSON形式で管理者メモを保存: {"slotMemos":{"20":"メモ内容",...}, "text":"通常備考"}
    const parsed = parseDayNotes(day.notes);
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
    const text = typeof body.text === "string" ? body.text : "";
    const day = await prisma.shiftDay.findUnique({
      where: { id: dayId },
      select: { id: true, notes: true, periodId: true, period: { select: { storeId: true } } },
    });
    if (!day) return NextResponse.json({ error: "Day not found" }, { status: 404 });
    const editRes = assertCanEditStore(session, day.period.storeId);
    if (editRes) return editRes;
    const lockNotes = await assertStaffShiftPeriodNotFinalized(day.periodId);
    if (lockNotes) return lockNotes;

    const parsed = parseDayNotes(day.notes);
    parsed.text = text;
    await prisma.shiftDay.update({
      where: { id: dayId },
      data: { notes: JSON.stringify(parsed) },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "updateDay") {
    const targetBudgetRaw = body.targetBudget;
    const targetBudget =
      typeof targetBudgetRaw === "number" && Number.isFinite(targetBudgetRaw)
        ? Math.round(targetBudgetRaw)
        : null;

    const dayForUpdate = await prisma.shiftDay.findUnique({
      where: { id: dayId },
      select: { periodId: true, period: { select: { storeId: true } } },
    });
    if (!dayForUpdate) {
      return NextResponse.json({ error: "Day not found" }, { status: 404 });
    }
    const editRes = assertCanEditStore(session, dayForUpdate.period.storeId);
    if (editRes) return editRes;
    const lockDay = await assertStaffShiftPeriodNotFinalized(dayForUpdate.periodId);
    if (lockDay) return lockDay;

    await prisma.shiftDay.update({
      where: { id: dayId },
      data: {
        targetBudget,
        eventName: asOptionalString(body.eventName),
        expectedVisitors: asOptionalString(body.expectedVisitors),
        // notes は JSON 文字列（slotMemos を含む）なので trim しない
        ...(typeof body.notes === "string" ? { notes: body.notes } : {}),
        employeeOnDuty: asOptionalString(body.employeeOnDuty),
      },
    });
    return NextResponse.json({ ok: true });
  }

  // 元に戻す／やり直し用: シフト期間全体のスナップショットを一括で復元
  if (action === "restoreSnapshot") {
    const periodId = typeof body.periodId === "string" ? body.periodId : "";
    const days = body.days as
      | Array<{
          id: string;
          targetBudget: number | null;
          eventName: string | null;
          expectedVisitors: string | null;
          notes: string | null;
          employeeOnDuty: string | null;
          slots: Array<{
            timeSlot: number;
            castId: string;
            isStart: boolean;
            isEnd: boolean;
            memo: string | null;
          }>;
        }>
      | undefined;

    if (!periodId || !Array.isArray(days)) {
      return NextResponse.json({ error: "periodId and days are required" }, { status: 400 });
    }

    const period = await prisma.shiftPeriod.findUnique({
      where: { id: periodId },
      select: { id: true, storeId: true },
    });
    if (!period) {
      return NextResponse.json({ error: "Period not found" }, { status: 404 });
    }
    const editRes = assertCanEditStore(session, period.storeId);
    if (editRes) return editRes;
    const lockRestore = await assertStaffShiftPeriodNotFinalized(periodId);
    if (lockRestore) return lockRestore;

    // 指定された日がすべて同じ periodId に属しているか確認
    const dayIds = days.map((d) => d.id);
    const dbDays = await prisma.shiftDay.findMany({
      where: { id: { in: dayIds } },
      select: { id: true, periodId: true },
    });
    const validDayIds = new Set(
      dbDays.filter((d) => d.periodId === periodId).map((d) => d.id),
    );

    await prisma.$transaction(async (tx) => {
      for (const day of days) {
        if (!validDayIds.has(day.id)) continue;

        await tx.shiftDay.update({
          where: { id: day.id },
          data: {
            targetBudget: day.targetBudget,
            eventName: day.eventName,
            expectedVisitors: day.expectedVisitors,
            notes: day.notes,
            employeeOnDuty: day.employeeOnDuty,
          },
        });

        await tx.shiftSlot.deleteMany({ where: { dayId: day.id } });

        if (Array.isArray(day.slots) && day.slots.length > 0) {
          await tx.shiftSlot.createMany({
            data: day.slots.map((s) => ({
              dayId: day.id,
              timeSlot: s.timeSlot,
              castId: s.castId,
              isStart: Boolean(s.isStart),
              isEnd: Boolean(s.isEnd),
              memo: s.memo ?? null,
            })),
          });
        }
      }

      // ⚠️ シフト希望はここで触らない。
      //    以前は期間の希望を全部消して作り直していたため、店長がシフト表を開いたあとに
      //    キャストが出した希望が「元に戻す」で消えていた。
    });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

type DayNotes = { text: string; slotMemos: Record<string, string> };

/** ShiftDay.notes は {"text":..., "slotMemos":{...}} の JSON。壊れていても落とさない */
function parseDayNotes(raw: string | null): DayNotes {
  if (!raw) return { text: "", slotMemos: {} };
  try {
    const parsed = JSON.parse(raw) as Partial<DayNotes> | null;
    if (!parsed || typeof parsed !== "object") return { text: "", slotMemos: {} };
    return {
      text: typeof parsed.text === "string" ? parsed.text : "",
      slotMemos:
        parsed.slotMemos && typeof parsed.slotMemos === "object"
          ? (parsed.slotMemos as Record<string, string>)
          : {},
    };
  } catch {
    // 旧形式（ただのテキスト）
    return { text: raw, slotMemos: {} };
  }
}
