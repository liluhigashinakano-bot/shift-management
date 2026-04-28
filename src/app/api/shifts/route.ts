import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { assertStaffShiftPeriodNotFinalized } from "@/lib/shift-slot-lock";
import { canAccessStore, type SessionUserLike } from "@/lib/store-access";

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

  // シフト希望情報をdayIdにマッピングして返す。
  // Undo/Redo のスナップショット復元で createdAt/updatedAt/status を保持できるよう、
  // タイムスタンプ系も合わせて返却する。
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

    // 対象日 + 期間 + 店舗を 1 度に取得（cross-store 判定にも使う）
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
    const lockRes = await assertStaffShiftPeriodNotFinalized(day.periodId);
    if (lockRes) return lockRes;

    // キャスト所属店舗（home）。target がキャスト所属と異なれば「ヘルプ出勤」扱いとなり、
    // home 側のスロットと同一日の slot を除去する（同時刻に複数店舗には居られない）。
    // これは cast-add-dialog の「ヘルプ」タブからの addCast 経由でも適用される。
    const cast = await prisma.user.findUnique({
      where: { id: castId },
      select: { storeId: true },
    });

    let homeDayId: string | null = null;
    let homePeriodId: string | null = null;
    let homeExisting: { timeSlot: number }[] = [];
    const isCrossStore =
      Boolean(cast?.storeId) && cast!.storeId !== day.period.storeId;

    if (isCrossStore && cast?.storeId) {
      const homePeriod = await prisma.shiftPeriod.findFirst({
        where: {
          storeId: cast.storeId,
          year: day.period.year,
          month: day.period.month,
          half: day.period.half,
        },
        select: { id: true },
      });
      if (homePeriod) {
        homePeriodId = homePeriod.id;
        // home 側の確定ロックも事前にチェック
        if (homePeriodId !== day.periodId) {
          const lockHome = await assertStaffShiftPeriodNotFinalized(homePeriodId);
          if (lockHome) return lockHome;
        }
        const homeDay = await prisma.shiftDay.findFirst({
          where: { periodId: homePeriod.id, date: day.date },
          select: { id: true },
        });
        if (homeDay) {
          homeDayId = homeDay.id;
          homeExisting = await prisma.shiftSlot.findMany({
            where: { dayId: homeDay.id, castId },
            orderBy: { timeSlot: "asc" },
            select: { timeSlot: true },
          });
        }
      }
    }

    const targetStoreName = day.period.store.name;
    const adjustmentReason = `→ ${targetStoreName}`;

    const newSlots: Array<{
      dayId: string;
      timeSlot: number;
      castId: string;
      isStart: boolean;
      isEnd: boolean;
      memo: string | null;
    }> = [];
    for (let t = start; t < end; t += 0.5) {
      newSlots.push({
        dayId,
        timeSlot: t,
        castId,
        isStart: t === start,
        isEnd: t + 0.5 >= end,
        memo: t === start ? memo : null,
      });
    }

    // 一連の処理（自店除去 → 調整記録 → target 入れ替え → 希望保護）を不可分に
    await prisma.$transaction(async (tx) => {
      // ヘルプ追加なら自店の同日 slot を削除し、調整記録（action="help"）を残す
      if (homeDayId && homeDayId !== dayId) {
        await tx.shiftSlot.deleteMany({
          where: { dayId: homeDayId, castId },
        });
        if (homeExisting.length > 0) {
          const originalStart = homeExisting[0].timeSlot;
          const originalEnd =
            homeExisting[homeExisting.length - 1].timeSlot + 0.5;
          await tx.shiftAdjustment.create({
            data: {
              dayId: homeDayId,
              castId,
              originalStart,
              originalEnd,
              adjustedStart: null,
              adjustedEnd: null,
              action: "help",
              reason: adjustmentReason,
            },
          });
        }
      }

      // target 側 slot 入れ替え
      await tx.shiftSlot.deleteMany({ where: { dayId, castId } });
      if (newSlots.length > 0) {
        await tx.shiftSlot.createMany({ data: newSlots });
      }

      // ShiftRequest は「キャスト本人の希望（原本）」として保護する。
      // 既存があれば希望時間 / notes を上書きせず、無い場合のみ作成。
      const existingRequest = await tx.shiftRequest.findFirst({
        where: { castId, periodId: day.periodId, date: day.date },
        select: { id: true },
      });
      if (!existingRequest) {
        await tx.shiftRequest.create({
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
    });

    return NextResponse.json({ ok: true });
  }

  /**
   * 自店舗のシフト表で開いた「キャスト編集モーダル」のヘルプ出勤タブから、
   * 当該キャストを別店舗のシフト表へヘルプとして追加する。
   *
   * 入力:
   *   sourceDayId   ... 自店舗側の ShiftDay.id（同一の年/月/前後半 を解決するため）
   *   targetStoreName ... 追加先店舗の名称（Store.name は @unique）
   *   castId        ... 追加するキャスト（自店舗・別店舗いずれでも可）
   *   startTime/endTime/memo ... 通常の addCast と同じ
   *
   * 振る舞いは addCast と概ね同等で:
   *   - 既存スロット（同 dayId × castId）を削除して 30 分刻みで再作成
   *   - ShiftRequest が無ければ作成（既存があれば希望を上書きしない）
   * 違いは「追加先 dayId をクライアントから受け取らず、サーバー側で
   *   targetStoreName + sourceDay の年月半 + 同じ日付 を解決する」点。
   */
  if (action === "addCastHelp") {
    const { sourceDayId, targetStoreName, startTime, endTime, memo } = body as {
      sourceDayId?: string;
      targetStoreName?: string;
      startTime?: number;
      endTime?: number;
      memo?: string | null;
    };
    const helpCastId = castId as string | undefined;

    if (!sourceDayId || !targetStoreName || !helpCastId) {
      return NextResponse.json(
        { error: "sourceDayId, targetStoreName, castId are required" },
        { status: 400 },
      );
    }
    if (typeof startTime !== "number" || typeof endTime !== "number" || endTime <= startTime) {
      return NextResponse.json(
        { error: "startTime / endTime are invalid" },
        { status: 400 },
      );
    }

    const sourceDay = await prisma.shiftDay.findUnique({
      where: { id: sourceDayId },
      select: {
        date: true,
        periodId: true,
        period: { select: { year: true, month: true, half: true } },
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

    // 対象店舗へのアクセス権チェック（admin は常に通る）
    if (!canAccessStore(session.user as SessionUserLike, targetStore.id)) {
      return NextResponse.json({ error: "Forbidden: target store" }, { status: 403 });
    }

    // 同一の年/月/前後半 を持つ追加先期間を検索
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

    // キャストの所属店舗（home）。同時刻に複数店舗には居られないので、
    // ヘルプ出勤として追加先へ移すと同時に source / home 側の slot は除去する。
    const cast = await prisma.user.findUnique({
      where: { id: helpCastId },
      select: { storeId: true },
    });

    let homeDayId: string | null = null;
    let homePeriodId: string | null = null;
    if (cast?.storeId && cast.storeId !== targetStore.id) {
      const homePeriod = await prisma.shiftPeriod.findFirst({
        where: {
          storeId: cast.storeId,
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

    // 関係する全期間の確定ロックチェック（target / source / home）
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

    const start = startTime as number;
    const end = endTime as number;

    const newSlots: Array<{
      dayId: string;
      timeSlot: number;
      castId: string;
      isStart: boolean;
      isEnd: boolean;
      memo: string | null;
    }> = [];
    for (let t = start; t < end; t += 0.5) {
      newSlots.push({
        dayId: targetDay.id,
        timeSlot: t,
        castId: helpCastId,
        isStart: t === start,
        isEnd: t + 0.5 >= end,
        memo: t === start ? (memo ?? null) : null,
      });
    }

    // 削除予定の元店舗・自店スロットを事前に取得（調整一覧へ「ヘルプ出勤」として
    // 差分記録するため、deleteMany より前に元の出退勤時間を控えておく）。
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

    // 一連のスロット入れ替えと希望生成、調整記録は不可分にする
    await prisma.$transaction(async (tx) => {
      // 元店舗（modal を開いた dayId）の slot を削除
      await tx.shiftSlot.deleteMany({
        where: { dayId: sourceDayId, castId: helpCastId },
      });

      // 元店舗側に既存スロットがあれば「ヘルプ出勤」として調整記録を残す
      if (sourceExisting.length > 0) {
        const originalStart = sourceExisting[0].timeSlot;
        const originalEnd = sourceExisting[sourceExisting.length - 1].timeSlot + 0.5;
        await tx.shiftAdjustment.create({
          data: {
            dayId: sourceDayId,
            castId: helpCastId,
            originalStart,
            originalEnd,
            adjustedStart: null,
            adjustedEnd: null,
            action: "help",
            reason: adjustmentReason,
          },
        });
      }

      // 本拠地店舗の同日 slot を削除（source と違う場合のみ）
      if (homeDayId && homeDayId !== sourceDayId) {
        await tx.shiftSlot.deleteMany({
          where: { dayId: homeDayId, castId: helpCastId },
        });

        if (homeExisting.length > 0) {
          const originalStart = homeExisting[0].timeSlot;
          const originalEnd = homeExisting[homeExisting.length - 1].timeSlot + 0.5;
          await tx.shiftAdjustment.create({
            data: {
              dayId: homeDayId,
              castId: helpCastId,
              originalStart,
              originalEnd,
              adjustedStart: null,
              adjustedEnd: null,
              action: "help",
              reason: adjustmentReason,
            },
          });
        }
      }

      // 追加先 slot を作り直し
      await tx.shiftSlot.deleteMany({
        where: { dayId: targetDay.id, castId: helpCastId },
      });
      if (newSlots.length > 0) {
        await tx.shiftSlot.createMany({ data: newSlots });
      }

      // 追加先側 ShiftRequest は addCast と同じく「原本があれば守る」
      const existingRequest = await tx.shiftRequest.findFirst({
        where: { castId: helpCastId, periodId: targetPeriod.id, date: sourceDay.date },
        select: { id: true },
      });
      if (!existingRequest) {
        await tx.shiftRequest.create({
          data: {
            castId: helpCastId,
            periodId: targetPeriod.id,
            date: sourceDay.date,
            startTime: start,
            endTime: end,
            notes: memo || null,
            status: "approved",
          },
        });
      }
    });

    return NextResponse.json({ ok: true });
  }

  // 削除 + 調整記録を自動作成
  if (action === "removeCast") {
    const { reason } = body;

    const dayForSlotLock = await prisma.shiftDay.findUnique({
      where: { id: dayId },
      select: { periodId: true, date: true },
    });
    if (!dayForSlotLock) {
      return NextResponse.json({ error: "Day not found" }, { status: 404 });
    }
    const slotLockRm = await assertStaffShiftPeriodNotFinalized(dayForSlotLock.periodId);
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

    // 対応する ShiftRequest（その日のキャストの希望）も削除する。
    // 残しておくと「未提出キャスト」一覧から漏れる（admin が addCast で自動生成した synthetic
    // request が残ったまま slot だけ消えて、提出済み扱いになってしまう）。
    // 他の日の希望は保持される（その日付分だけ削除）。
    await prisma.shiftRequest.deleteMany({
      where: { castId, periodId: dayForSlotLock.periodId, date: dayForSlotLock.date },
    });

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
    const slotLockEd = await assertStaffShiftPeriodNotFinalized(dayForEditLock.periodId);
    if (slotLockEd) return slotLockEd;

    // 元の時間を取得
    const existing = await prisma.shiftSlot.findMany({
      where: { dayId, castId },
      orderBy: { timeSlot: "asc" },
    });

    // editCast は「既存スロットの時間変更」専用。スロット 0 件の場合は別ユーザー or 別タブで
    // 既に削除されている／元から無いケース。ここで誤って create してしまうと
    // 「addCast 経由でない synthetic な配置」が生まれてしまうので 409 で弾く。
    if (existing.length === 0) {
      return NextResponse.json(
        {
          error:
            "編集対象のシフトが見つかりません。画面を再読み込みしてから操作してください。",
        },
        { status: 409 },
      );
    }

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
    const slotMemoLock = await assertStaffShiftPeriodNotFinalized(day.periodId);
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
    const lockNotes = await assertStaffShiftPeriodNotFinalized(day.periodId);
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
    const lockDay = await assertStaffShiftPeriodNotFinalized(dayForUpdate.periodId);
    if (lockDay) return lockDay;
    await prisma.shiftDay.update({
      where: { id: dayId },
      data: { targetBudget, eventName, expectedVisitors, notes, employeeOnDuty },
    });
    return NextResponse.json({ ok: true });
  }

  // 元に戻す／やり直し用: シフト期間全体のスナップショットを一括で復元
  if (action === "restoreSnapshot") {
    const { periodId, days, shiftRequests } = body as {
      periodId: string;
      days: Array<{
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
      }>;
      /**
       * 期間全体のシフト希望スナップショット。createdAt/updatedAt を保持して復元する
       * （未提出キャスト一覧の「最終操作日時」が Undo/Redo で書き換わらないように）。
       * 旧クライアント互換のため省略可。省略時はシフト希望側は触らない。
       */
      shiftRequests?: Array<{
        castId: string;
        date: string;
        startTime: number;
        endTime: number;
        notes: string | null;
        status?: string;
        createdAt?: string;
        updatedAt?: string;
      }>;
    };

    if (!periodId || !Array.isArray(days)) {
      return NextResponse.json({ error: "periodId and days are required" }, { status: 400 });
    }

    const period = await prisma.shiftPeriod.findUnique({
      where: { id: periodId },
      select: { id: true },
    });
    if (!period) {
      return NextResponse.json({ error: "Period not found" }, { status: 404 });
    }
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

      // shiftRequests スナップショットがあれば、期間内の希望を完全置換する。
      // createdAt/updatedAt も渡された値で復元する（@updatedAt は create では尊重される）。
      if (Array.isArray(shiftRequests)) {
        await tx.shiftRequest.deleteMany({ where: { periodId } });
        if (shiftRequests.length > 0) {
          await tx.shiftRequest.createMany({
            data: shiftRequests.map((r) => ({
              castId: r.castId,
              periodId,
              date: new Date(r.date),
              startTime: r.startTime,
              endTime: r.endTime,
              notes: r.notes ?? null,
              status: r.status ?? "approved",
              ...(r.createdAt ? { createdAt: new Date(r.createdAt) } : {}),
              ...(r.updatedAt ? { updatedAt: new Date(r.updatedAt) } : {}),
            })),
          });
        }
      }
    });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
