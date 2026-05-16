import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { NavHeader } from "@/components/nav-header";
import { ShiftGrid } from "@/components/shift-grid/shift-grid";
import { SyncButtons } from "@/components/sync-buttons";
import { ShiftPeriodLocksPanel } from "@/components/shift-period-locks-panel";
import { AdjustmentConfirmedPublishPanel } from "@/components/adjustment-confirmed-publish-panel";
import Link from "next/link";
import { assertStorePageAccess, canEditStore, getAccessibleStoreIds } from "@/lib/store-access";
import { ShiftSheetStoreTitle } from "@/components/shift-sheet-store-title";
import { SnsShiftExportButton } from "@/components/sns-shift-export-button";

export const dynamic = "force-dynamic";

export default async function ShiftPage({
  params,
}: {
  params: Promise<{ storeId: string; periodId: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  const role = (session.user as any).role as string | undefined;
  if (role === "cast") redirect("/mypage");

  const { storeId, periodId } = await params;

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

  if (!period || period.storeId !== storeId) redirect("/dashboard");

  assertStorePageAccess(session.user as any, storeId);

  const allCasts = await prisma.user.findMany({
    where: { role: "cast", isTrialGuest: false },
    include: { store: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  });

  // シフト希望情報（dayIdを紐付け）
  const rawRequests = await prisma.shiftRequest.findMany({
    where: { periodId },
    select: { castId: true, date: true, startTime: true, endTime: true, notes: true },
  });
  const dayMap = new Map(period.shiftDays.map((d) => [new Date(d.date).toISOString().slice(0, 10), d.id]));
  const shiftRequests = rawRequests.map((r) => ({
    castId: r.castId,
    dayId: dayMap.get(new Date(r.date).toISOString().slice(0, 10)) || null,
    date: r.date,
    startTime: r.startTime,
    endTime: r.endTime,
    notes: r.notes,
  }));

  // ヘルプ出勤情報: この店舗所属のキャストが他店舗のシフトに入っている情報
  const storeCasts = await prisma.user.findMany({
    where: { storeId, role: "cast", isTrialGuest: false },
    select: { id: true, name: true },
  });
  const storeCastIds = storeCasts.map((c) => c.id);
  const castNameMap = new Map(storeCasts.map((c) => [c.id, c.name]));

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

  const helpInfo: Record<
    string,
    { castId: string; castName: string; storeName: string; startTime: number; endTime: number }[]
  > = {};
  const dayMapForHelp = new Map(period.shiftDays.map((d) => [new Date(d.date).toISOString().slice(0, 10), d.id]));

  for (const op of otherPeriods) {
    for (const opDay of op.shiftDays) {
      if (opDay.shiftSlots.length === 0) continue;
      const dateKey = new Date(opDay.date).toISOString().slice(0, 10);
      const myDayId = dayMapForHelp.get(dateKey);
      if (!myDayId) continue;

      const castSlots = new Map<string, number[]>();
      for (const slot of opDay.shiftSlots) {
        if (!castSlots.has(slot.castId)) castSlots.set(slot.castId, []);
        castSlots.get(slot.castId)!.push(slot.timeSlot);
      }

      for (const [castId, slots] of castSlots) {
        const castName = castNameMap.get(castId) || "不明";
        if (!helpInfo[myDayId]) helpInfo[myDayId] = [];
        helpInfo[myDayId].push({
          castId,
          castName,
          storeName: op.store.name,
          startTime: Math.min(...slots),
          endTime: Math.max(...slots) + 0.5,
        });
      }
    }
  }

  const halfLabel = period.half === "first" ? "前半" : "後半";

  const accessible = getAccessibleStoreIds(session.user as any);
  let storeOptions: { id: string; name: string; periodId: string | null }[];
  if (accessible === null) {
    const stores = await prisma.store.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    const periodRows = await prisma.shiftPeriod.findMany({
      where: {
        year: period.year,
        month: period.month,
        half: period.half,
        storeId: { in: stores.map((s) => s.id) },
      },
      select: { id: true, storeId: true },
    });
    const pidByStore = new Map(periodRows.map((r) => [r.storeId, r.id]));
    storeOptions = stores.map((s) => ({
      id: s.id,
      name: s.name,
      periodId: pidByStore.get(s.id) ?? null,
    }));
  } else if (accessible.length > 1) {
    const stores = await prisma.store.findMany({
      where: { id: { in: accessible } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    const periodRows = await prisma.shiftPeriod.findMany({
      where: {
        year: period.year,
        month: period.month,
        half: period.half,
        storeId: { in: stores.map((s) => s.id) },
      },
      select: { id: true, storeId: true },
    });
    const pidByStore = new Map(periodRows.map((r) => [r.storeId, r.id]));
    storeOptions = stores.map((s) => ({
      id: s.id,
      name: s.name,
      periodId: pidByStore.get(s.id) ?? null,
    }));
  } else {
    storeOptions = [
      {
        id: period.storeId,
        name: period.store.name,
        periodId: period.id,
      },
    ];
  }

  const canEditCurrentStore = canEditStore(session.user as any, storeId);
  const snsExportShiftDays = period.shiftDays.map((day) => ({
    id: day.id,
    date: day.date.toISOString(),
    shiftSlots: day.shiftSlots.map((slot) => ({
      castId: slot.castId,
      timeSlot: slot.timeSlot,
      cast: {
        name: slot.cast.name,
        isTrialGuest: slot.cast.isTrialGuest,
      },
    })),
  }));

  return (
    <div className="min-h-dvh shift-sheet-print-page">
      <NavHeader
        user={{
          name: session.user.name,
          role: (session.user as any).role,
          storeName: (session.user as any).storeName,
        }}
      />
      <main className="max-w-[1800px] mx-auto w-full min-w-0 px-3 sm:px-4 py-4">
        <div className="shift-sheet-toolbar-print-hide mb-4 min-w-0 print:hidden">
        <div className="flex items-center gap-1 sm:gap-2 flex-nowrap overflow-x-auto max-w-full pb-0.5 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]">
          <Link
            href="/dashboard"
            className="text-[10px] sm:text-xs text-gray-500 hover:text-gray-700 shrink-0 whitespace-nowrap"
          >
            &larr; ダッシュボード
          </Link>
          <ShiftSheetStoreTitle
            currentStoreId={storeId}
            year={period.year}
            month={period.month}
            halfLabel={halfLabel}
            storeOptions={JSON.parse(JSON.stringify(storeOptions))}
          />
          {canEditCurrentStore && (
            <div className="shrink-0 flex flex-wrap items-center gap-1">
              <ShiftPeriodLocksPanel
                periodId={periodId}
                initialRequestsLocked={Boolean(period.shiftRequestsLocked)}
                initialSlotsLocked={Boolean(period.shiftSlotsLocked)}
              />
              <AdjustmentConfirmedPublishPanel
                periodId={periodId}
                initialPublished={Boolean(period.adjustmentConfirmedPublished)}
              />
              <SnsShiftExportButton
                storeName={period.store.name}
                year={period.year}
                month={period.month}
                half={period.half}
                shiftDays={snsExportShiftDays}
              />
            </div>
          )}
          <div className="ml-auto flex items-center gap-1 sm:gap-2 flex-nowrap shrink-0">
            <Link
              href={`/unsubmitted/${storeId}/${periodId}`}
              className="inline-flex min-h-8 items-center justify-center rounded-md border border-rose-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-rose-700 shadow-sm hover:bg-rose-50 sm:min-h-9 sm:px-2.5 sm:py-1 sm:text-xs whitespace-nowrap"
            >
              未提出キャスト
            </Link>
            <Link
              href={`/confirmed/${storeId}/${periodId}`}
              className="inline-flex min-h-8 items-center justify-center rounded-md border border-purple-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-purple-700 shadow-sm hover:bg-purple-50 sm:min-h-9 sm:px-2.5 sm:py-1 sm:text-xs whitespace-nowrap"
            >
              確定シフト
            </Link>
            <Link
              href={`/requests/${storeId}/${periodId}`}
              className="inline-flex min-h-8 items-center justify-center rounded-md border border-blue-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-blue-700 shadow-sm hover:bg-blue-50 sm:min-h-9 sm:px-2.5 sm:py-1 sm:text-xs whitespace-nowrap"
            >
              希望一覧
            </Link>
            <Link
              href={`/adjustments/${storeId}/${periodId}`}
              className="inline-flex min-h-8 items-center justify-center rounded-md border border-orange-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-orange-700 shadow-sm hover:bg-orange-50 sm:min-h-9 sm:px-2.5 sm:py-1 sm:text-xs whitespace-nowrap"
            >
              調整一覧
            </Link>
            {canEditCurrentStore && (
              <SyncButtons
                periodId={periodId}
                sheetsImportDisabled={Boolean(period.adjustmentConfirmedPublished)}
              />
            )}
          </div>
        </div>
        </div>
        <p className="mb-3 hidden text-center text-base font-semibold text-gray-900 print:block print:border-b print:border-gray-400 print:pb-2">
          {period.store.name} ‐ {period.year}年{period.month}月{halfLabel}
        </p>
        <ShiftGrid
          key={`${periodId}-${period.adjustmentConfirmedPublished}-${period.shiftSlotsLocked}-${period.shiftRequestsLocked}`}
          initialData={JSON.parse(JSON.stringify({ ...period, shiftRequests, helpInfo }))}
          allCasts={allCasts.map((c) => ({
            id: c.id,
            name: c.name,
            store: c.store,
          }))}
          readOnly={!canEditCurrentStore}
          bypassShiftPeriodLocks={canEditCurrentStore}
        />
      </main>
    </div>
  );
}
