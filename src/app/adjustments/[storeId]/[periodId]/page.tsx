import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { NavHeader } from "@/components/nav-header";
import { AdjustmentTable } from "@/components/adjustment-table";
import { CastPeriodSelector } from "@/components/cast-period-selector";
import { ShiftPeriodLocksPanel } from "@/components/shift-period-locks-panel";
import { AdjustmentConfirmedPublishPanel } from "@/components/adjustment-confirmed-publish-panel";
import Link from "next/link";
import { periodFromNow, nextPeriod, periodIndex } from "@/lib/period-utils";
import { assertStorePageAccess, canEditStore } from "@/lib/store-access";

export default async function AdjustmentsPage({
  params,
}: {
  params: Promise<{ storeId: string; periodId: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  const role = (session.user as any).role as string | undefined;
  const userId = session.user.id;

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

  if (role !== "cast") {
    assertStorePageAccess(session.user as any, storeId);
  }

  const selectablePeriods = await (async () => {
    if (role !== "cast") return [];
    const now = new Date();
    const maxFuture = nextPeriod(periodFromNow(now));
    const maxIdx = periodIndex(maxFuture);
    const all = await prisma.shiftPeriod.findMany({
      where: { storeId },
      select: { id: true, year: true, month: true, half: true },
      orderBy: [{ year: "asc" }, { month: "asc" }, { half: "asc" }],
    });
    return all.filter((p) => periodIndex({ year: p.year, month: p.month, half: p.half as any }) <= maxIdx) as any[];
  })();

  if (role === "cast") {
    // 表示もデータも自分の分だけに絞る
    for (const day of period.shiftDays) {
      (day.shiftSlots as any[]) = day.shiftSlots.filter((s) => s.castId === userId);
    }
  }

  const dayIds = period.shiftDays.map((d) => d.id);
  const adjustments = await prisma.shiftAdjustment.findMany({
    where: { dayId: { in: dayIds }, ...(role === "cast" ? { castId: userId } : {}) },
    include: {
      cast: { select: { id: true, name: true, store: { select: { name: true } } } },
      day: { select: { id: true, date: true, dayOfWeek: true } },
    },
    orderBy: [{ day: { date: "asc" } }, { createdAt: "asc" }],
  });

  // 所属キャストの他店舗での調整も取得
  const storeCasts = await prisma.user.findMany({
    where: role === "cast" ? { id: userId } : { storeId, role: "cast", isTrialGuest: false },
    select: { id: true },
  });
  const storeCastIds = storeCasts.map((c) => c.id);

  const otherPeriods = await prisma.shiftPeriod.findMany({
    where: {
      year: period.year, month: period.month, half: period.half,
      storeId: { not: storeId },
    },
    include: {
      store: { select: { name: true } },
      shiftDays: { select: { id: true, date: true, dayOfWeek: true, shiftSlots: { where: { castId: { in: storeCastIds } }, include: { cast: { select: { id: true, name: true } } }, orderBy: { timeSlot: "asc" } } } },
    },
  });

  // 他店舗の調整
  const otherDayIds: string[] = [];
  for (const op of otherPeriods) {
    for (const d of op.shiftDays) {
      otherDayIds.push(d.id);
    }
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
    where: { periodId, ...(role === "cast" ? { castId: userId } : {}) },
    select: { castId: true, date: true, startTime: true, endTime: true },
  });

  // 他店舗のシフト希望
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
    period.shiftDays.map((d) => [new Date(d.date).toISOString().slice(0, 10), d.id] as const),
  );
  for (const op of otherPeriods) {
    for (const opDay of op.shiftDays) {
      if (opDay.shiftSlots.length === 0) continue;
      const dateKey = new Date(opDay.date).toISOString().slice(0, 10);
      const localDayId = localDayByDate.get(dateKey);
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

  // dayIdマッピング
  const dayMap = new Map(period.shiftDays.map((d) => [new Date(d.date).toISOString().slice(0, 10), d.id]));
  // 他店舗のdayIdも自店舗のdayIdにマッピング
  for (const op of otherPeriods) {
    for (const opDay of op.shiftDays) {
      const dateKey = new Date(opDay.date).toISOString().slice(0, 10);
      if (!dayMap.has(dateKey)) {
        dayMap.set(dateKey, opDay.id);
      }
    }
  }
  // 同一日付で自店舗 period の希望が他店 period（ヘルプ先に作られた希望など）で上書きされないよう、自店を最優先
  const requestByCastAndDate = new Map<
    string,
    { castId: string; dayId: string; startTime: number; endTime: number }
  >();
  const toDateKey = (d: Date) => new Date(d).toISOString().slice(0, 10);
  for (const r of otherShiftRequests) {
    const dk = toDateKey(r.date);
    const dayId = dayMap.get(dk);
    if (!dayId) continue;
    requestByCastAndDate.set(`${r.castId}|${dk}`, {
      castId: r.castId,
      dayId,
      startTime: r.startTime,
      endTime: r.endTime,
    });
  }
  for (const r of shiftRequests) {
    const dk = toDateKey(r.date);
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
    where: role === "cast" ? { id: userId } : { role: "cast", isTrialGuest: false },
    include: { store: { select: { name: true } } },
    orderBy: { name: "asc" },
  });

  // 調整がある／他店でシフトに入っているキャスト一覧
  const adjustedCastIds = new Set([
    ...allAdjustments.map((a) => a.castId),
    ...remoteHelpShifts.map((r) => r.castId),
  ]);
  const adjustedCasts = allCasts.filter((c) => adjustedCastIds.has(c.id));

  const halfLabel = period.half === "first" ? "前半" : "後半";
  const isStaffEditor = role !== "cast" && canEditStore(session.user as any, storeId);

  return (
    <div className="min-h-dvh">
      <NavHeader
        user={{
          name: session.user.name,
          role: (session.user as any).role,
          storeName: (session.user as any).storeName,
        }}
      />
      <main className="max-w-[1800px] mx-auto w-full min-w-0 px-3 sm:px-4 py-4">
        <div className="mb-4 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0 flex-1">
            {role !== "cast" && (
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
            {role !== "cast" && isStaffEditor && (
              <div className="mt-2 flex flex-wrap items-center gap-1">
                <ShiftPeriodLocksPanel
                  periodId={periodId}
                  initialRequestsLocked={Boolean(period.shiftRequestsLocked)}
                  initialSlotsLocked={Boolean(period.shiftSlotsLocked)}
                />
                <AdjustmentConfirmedPublishPanel
                  periodId={periodId}
                  initialPublished={Boolean(period.adjustmentConfirmedPublished)}
                />
              </div>
            )}
          </div>
          {role !== "cast" && (
            <Link
              href={`/shifts/${storeId}/${periodId}`}
              className="inline-flex shrink-0 items-center justify-center self-start rounded-md border border-pink-200 bg-white px-2.5 py-1.5 text-xs font-medium text-pink-600 shadow-sm hover:bg-pink-50 sm:self-center sm:text-sm"
            >
              シフト表を見る &rarr;
            </Link>
          )}
          {role === "cast" && (
            <div className="flex w-full min-w-0 flex-col gap-2 sm:ml-auto sm:w-auto sm:max-w-none sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-3">
              <CastPeriodSelector storeId={storeId} currentPeriodId={periodId} periods={selectablePeriods as any} />
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
        <AdjustmentTable
          periodId={periodId}
          month={period.month}
          days={JSON.parse(JSON.stringify(period.shiftDays))}
          initialAdjustments={JSON.parse(JSON.stringify(allAdjustments))}
          shiftRequests={requestsByDayAndCast}
          remoteHelpShifts={remoteHelpShifts}
          adjustedCasts={adjustedCasts.map((c) => ({
            id: c.id,
            name: c.name,
            storeName: c.store?.name ?? null,
          }))}
          allCasts={allCasts.map((c) => ({
            id: c.id,
            name: c.name,
            storeName: c.store?.name ?? null,
          }))}
          showConfirmedShiftColumn={Boolean(period.adjustmentConfirmedPublished)}
          showCastSelector={role !== "cast"}
        />
      </main>
    </div>
  );
}
