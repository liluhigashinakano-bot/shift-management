import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { NavHeader } from "@/components/nav-header";
import { AdjustmentTable } from "@/components/adjustment-table";
import { CastPeriodSelector } from "@/components/cast-period-selector";
import { ShiftPeriodLocksPanel } from "@/components/shift-period-locks-panel";
import { AdjustmentConfirmedPublishPanel } from "@/components/adjustment-confirmed-publish-panel";
import Link from "next/link";
import { assertStorePageAccess, canEditStore } from "@/lib/store-access";
import { listCastSelectablePeriods } from "@/lib/cast-periods";
import { toUtcDateKey } from "@/lib/shift-utils";

export const dynamic = "force-dynamic";

export default async function AdjustmentsPage({
  params,
}: {
  params: Promise<{ storeId: string; periodId: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  const role = session.user.role;
  const userId = session.user.id;
  const isCast = role === "cast";

  const { storeId, periodId } = await params;

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

  if (!period || period.storeId !== storeId) redirect("/dashboard");

  if (!isCast) {
    assertStorePageAccess(session.user, storeId);
  }

  const selectablePeriods = isCast ? await listCastSelectablePeriods(storeId) : [];

  // キャストは自分の分だけに絞る
  const visibleDays = isCast
    ? period.shiftDays.map((day) => ({
        ...day,
        shiftSlots: day.shiftSlots.filter((s) => s.castId === userId),
      }))
    : period.shiftDays;

  const dayIds = visibleDays.map((d) => d.id);
  const adjustments = await prisma.shiftAdjustment.findMany({
    where: { dayId: { in: dayIds }, ...(isCast ? { castId: userId } : {}) },
    include: {
      cast: { select: { id: true, name: true, store: { select: { name: true } } } },
      day: { select: { id: true, date: true, dayOfWeek: true } },
    },
    orderBy: [{ day: { date: "asc" } }, { createdAt: "asc" }],
  });

  // 所属キャストの他店舗での調整も取得
  const storeCasts = await prisma.user.findMany({
    where: isCast ? { id: userId } : { storeId, role: "cast", isTrialGuest: false },
    select: { id: true },
  });
  const storeCastIds = storeCasts.map((c) => c.id);

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
          id: true,
          date: true,
          dayOfWeek: true,
          shiftSlots: {
            where: { castId: { in: storeCastIds } },
            include: { cast: { select: { id: true, name: true } } },
            orderBy: { timeSlot: "asc" },
          },
        },
      },
    },
  });

  const otherDayIds: string[] = [];
  for (const op of otherPeriods) {
    for (const d of op.shiftDays) otherDayIds.push(d.id);
  }
  const otherAdjustments = await prisma.shiftAdjustment.findMany({
    where: { dayId: { in: otherDayIds }, castId: { in: storeCastIds } },
    include: {
      cast: { select: { id: true, name: true, store: { select: { name: true } } } },
      day: { select: { id: true, date: true, dayOfWeek: true } },
    },
    orderBy: [{ day: { date: "asc" } }, { createdAt: "asc" }],
  });

  const allAdjustments = [...adjustments, ...otherAdjustments];

  // シフト希望データ（自店舗 + 他店舗の所属キャスト分）
  const shiftRequests = await prisma.shiftRequest.findMany({
    where: { periodId, ...(isCast ? { castId: userId } : {}) },
    select: { castId: true, date: true, startTime: true, endTime: true },
  });

  const otherPeriodIds = otherPeriods.map((op) => op.id);
  const otherShiftRequests = await prisma.shiftRequest.findMany({
    where: { periodId: { in: otherPeriodIds }, castId: { in: storeCastIds } },
    select: { castId: true, date: true, startTime: true, endTime: true },
  });

  /** 所属キャストが他店で実際に働いている時間（調整一覧「確定」列に店舗名付きで表示） */
  type RemoteHelp = {
    localDayId: string;
    castId: string;
    startTime: number;
    endTime: number;
    remoteStoreName: string;
  };
  const remoteHelpShifts: RemoteHelp[] = [];
  const localDayByDate = new Map(
    visibleDays.map((d) => [toUtcDateKey(d.date), d.id] as const),
  );
  for (const op of otherPeriods) {
    for (const opDay of op.shiftDays) {
      if (opDay.shiftSlots.length === 0) continue;
      const localDayId = localDayByDate.get(toUtcDateKey(opDay.date));
      if (!localDayId) continue;
      const byCast = new Map<string, typeof opDay.shiftSlots>();
      for (const s of opDay.shiftSlots) {
        if (!byCast.has(s.castId)) byCast.set(s.castId, []);
        byCast.get(s.castId)!.push(s);
      }
      for (const [cid, sls] of byCast) {
        if (!storeCastIds.includes(cid)) continue;
        const tss = sls.map((x) => x.timeSlot);
        remoteHelpShifts.push({
          localDayId,
          castId: cid,
          startTime: Math.min(...tss),
          endTime: Math.max(...tss) + 0.5,
          remoteStoreName: op.store.name,
        });
      }
    }
  }

  // dayIdマッピング（他店舗の日付も自店舗の dayId に寄せる）
  const dayMap = new Map(visibleDays.map((d) => [toUtcDateKey(d.date), d.id]));
  for (const op of otherPeriods) {
    for (const opDay of op.shiftDays) {
      const dateKey = toUtcDateKey(opDay.date);
      if (!dayMap.has(dateKey)) dayMap.set(dateKey, opDay.id);
    }
  }
  // 同一日付で自店舗 period の希望が他店 period で上書きされないよう、自店を最優先
  const requestByCastAndDate = new Map<
    string,
    { castId: string; dayId: string; startTime: number; endTime: number }
  >();
  for (const r of [...otherShiftRequests, ...shiftRequests]) {
    const dk = toUtcDateKey(r.date);
    const dayId = dayMap.get(dk);
    if (!dayId) continue;
    requestByCastAndDate.set(`${r.castId}|${dk}`, {
      castId: r.castId,
      dayId,
      startTime: r.startTime,
      endTime: r.endTime,
    });
  }
  const requestsByDayAndCast = Array.from(requestByCastAndDate.values());

  const allCasts = await prisma.user.findMany({
    where: isCast ? { id: userId } : { role: "cast", isTrialGuest: false },
    select: { id: true, name: true, store: { select: { name: true } } },
    orderBy: { name: "asc" },
  });

  // 調整がある／他店でシフトに入っているキャスト一覧
  const adjustedCastIds = new Set([
    ...allAdjustments.map((a) => a.castId),
    ...remoteHelpShifts.map((r) => r.castId),
  ]);
  const adjustedCasts = allCasts.filter((c) => adjustedCastIds.has(c.id));

  const halfLabel = period.half === "first" ? "前半" : "後半";
  const isStaffEditor = !isCast && canEditStore(session.user, storeId);
  const published = Boolean(period.adjustmentConfirmedPublished);
  // 確定前の作業中のシフトはキャストに見せない
  const confirmedVisible = !isCast || published;

  return (
    <div className="min-h-dvh">
      <NavHeader
        user={{
          name: session.user.name,
          role: session.user.role,
          storeName: session.user.storeName,
        }}
      />
      <main className="max-w-[1800px] mx-auto w-full min-w-0 px-3 sm:px-4 py-4">
        <div className="mb-4 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0 flex-1">
            {!isCast && (
              <Link
                href="/dashboard"
                className="mb-1 inline-block text-xs text-gray-500 hover:text-gray-700 sm:text-sm"
              >
                &larr; ダッシュボード
              </Link>
            )}
            <h1 className="text-[11px] font-bold leading-tight sm:text-sm md:text-base whitespace-nowrap overflow-x-auto [scrollbar-width:thin]">
              {period.store.name}‐{period.year}年{period.month}月{halfLabel}
            </h1>
            {isStaffEditor && (
              <div className="mt-2 flex flex-wrap items-center gap-1">
                <ShiftPeriodLocksPanel
                  periodId={periodId}
                  initialRequestsLocked={Boolean(period.shiftRequestsLocked)}
                  initialSlotsLocked={Boolean(period.shiftSlotsLocked)}
                />
                <AdjustmentConfirmedPublishPanel
                  periodId={periodId}
                  initialPublished={published}
                />
              </div>
            )}
          </div>
          {!isCast && (
            <Link
              href={`/shifts/${storeId}/${periodId}`}
              className="inline-flex shrink-0 items-center justify-center self-start rounded-md border border-pink-200 bg-white px-2.5 py-1.5 text-xs font-medium text-pink-600 shadow-sm hover:bg-pink-50 sm:self-center sm:text-sm"
            >
              シフト表を見る &rarr;
            </Link>
          )}
          {isCast && (
            <div className="flex w-full min-w-0 flex-col gap-2 sm:ml-auto sm:w-auto sm:max-w-none sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-3">
              <CastPeriodSelector
                storeId={storeId}
                currentPeriodId={periodId}
                periods={selectablePeriods}
              />
              <div className="flex shrink-0 flex-row flex-wrap items-center gap-2">
                <Link
                  href={`/requests/${storeId}/${periodId}`}
                  className="inline-flex min-h-9 items-center justify-center rounded-md border border-purple-200 bg-white px-2.5 py-1.5 text-xs font-medium text-purple-700 shadow-sm hover:bg-purple-50 sm:text-sm whitespace-nowrap"
                >
                  希望一覧
                </Link>
                <Link
                  href={`/confirmed/${storeId}/${periodId}`}
                  className="inline-flex min-h-9 items-center justify-center rounded-md border border-purple-200 bg-white px-2.5 py-1.5 text-xs font-medium text-purple-700 shadow-sm hover:bg-purple-50 sm:text-sm whitespace-nowrap"
                >
                  確定シフト
                </Link>
              </div>
            </div>
          )}
        </div>
        {!confirmedVisible && (
          <p className="mb-3 rounded-md border border-dashed border-gray-300 bg-white px-3 py-2 text-xs text-gray-600">
            この期間のシフトはまだ確定していません。「確定」の欄は、確定後に表示されます。
          </p>
        )}
        {!published && !isCast && (
          <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            このシフトはまだ確定していません。「確定」の欄はキャストには表示されていません。
          </p>
        )}
        <AdjustmentTable
          days={visibleDays.map((d) => ({
            id: d.id,
            date: d.date.toISOString(),
            dayOfWeek: d.dayOfWeek,
            shiftSlots: d.shiftSlots.map((s) => ({
              id: s.id,
              timeSlot: s.timeSlot,
              castId: s.castId,
              cast: { id: s.cast.id, name: s.cast.name },
              isStart: s.isStart,
              isEnd: s.isEnd,
              memo: s.memo,
            })),
          }))}
          initialAdjustments={allAdjustments.map((a) => ({
            id: a.id,
            dayId: a.dayId,
            castId: a.castId,
            originalStart: a.originalStart,
            originalEnd: a.originalEnd,
            adjustedStart: a.adjustedStart,
            adjustedEnd: a.adjustedEnd,
            action: a.action,
            reason: a.reason,
            cast: {
              id: a.cast.id,
              name: a.cast.name,
              store: a.cast.store,
            },
            day: {
              id: a.day.id,
              date: a.day.date.toISOString(),
              dayOfWeek: a.day.dayOfWeek,
            },
          }))}
          shiftRequests={requestsByDayAndCast}
          remoteHelpShifts={remoteHelpShifts}
          adjustedCasts={adjustedCasts.map((c) => ({
            id: c.id,
            name: c.name,
            storeName: c.store?.name ?? null,
          }))}
          showConfirmedShiftColumn={published}
          confirmedVisible={confirmedVisible}
        />
      </main>
    </div>
  );
}
