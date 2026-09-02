import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { NavHeader } from "@/components/nav-header";
import { ConfirmedShift } from "@/components/confirmed-shift";
import { CastPeriodSelector } from "@/components/cast-period-selector";
import Link from "next/link";
import { assertStorePageAccess } from "@/lib/store-access";
import { castSuffixForShiftBadge } from "@/lib/cast-display-name";
import { listCastSelectablePeriods } from "@/lib/cast-periods";

export const dynamic = "force-dynamic";

export default async function ConfirmedPage({
  params,
}: {
  params: Promise<{ storeId: string; periodId: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  const role = session.user.role;
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
            include: { cast: { select: { id: true, name: true, isTrialGuest: true } } },
            orderBy: { timeSlot: "asc" },
          },
        },
      },
    },
  });

  if (!period || period.storeId !== storeId) redirect("/dashboard");

  const isCast = role === "cast";
  if (!isCast) {
    assertStorePageAccess(session.user, storeId);
  }

  const selectablePeriods = isCast ? await listCastSelectablePeriods(storeId) : [];

  const halfLabel = period.half === "first" ? "前半" : "後半";
  const published = Boolean(period.adjustmentConfirmedPublished);
  // 確定前の作業中のシフトはキャストに見せない
  const castMustWait = isCast && !published;

  // キャストは自分の分だけ（自店舗分）
  const visibleDays = isCast
    ? period.shiftDays.map((day) => ({
        ...day,
        shiftSlots: day.shiftSlots.filter((s) => s.castId === userId),
      }))
    : period.shiftDays;

  const header = (
    <div className="mb-4 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0 flex-1">
        {!isCast && (
          <Link
            href={`/shifts/${storeId}/${periodId}`}
            className="mb-1 inline-block text-xs text-gray-500 hover:text-gray-700 sm:text-sm"
          >
            &larr; シフト表に戻る
          </Link>
        )}
        <h1 className="text-[11px] font-bold leading-tight sm:text-sm md:text-base whitespace-nowrap overflow-x-auto [scrollbar-width:thin]">
          {period.store.name}‐{period.year}年{period.month}月{halfLabel}
        </h1>
      </div>
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
              href={`/adjustments/${storeId}/${periodId}`}
              className="inline-flex min-h-9 items-center justify-center rounded-md border border-purple-200 bg-white px-2.5 py-1.5 text-xs font-medium text-purple-700 shadow-sm hover:bg-purple-50 sm:text-sm whitespace-nowrap"
            >
              調整一覧
            </Link>
          </div>
        </div>
      )}
    </div>
  );

  if (castMustWait) {
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
          {header}
          <p className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-10 text-center text-sm text-gray-600">
            この期間のシフトはまだ確定していません。
            <br />
            確定するとここに表示されます。
          </p>
        </main>
      </div>
    );
  }

  // この店舗のシフトに入っているキャスト一覧
  const castMap = new Map<string, string>();
  for (const day of visibleDays) {
    for (const slot of day.shiftSlots) {
      castMap.set(slot.castId, castSuffixForShiftBadge(slot.cast));
    }
  }

  // 他店舗ヘルプ出勤（staff: 店舗所属キャスト全員 / cast: 自分の分だけ）
  const storeCasts = await prisma.user.findMany({
    where: isCast ? { id: userId } : { storeId, role: "cast", isTrialGuest: false },
    select: { id: true, name: true },
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
        orderBy: { date: "asc" },
        include: {
          shiftSlots: {
            where: { castId: { in: storeCastIds } },
            include: { cast: { select: { id: true, name: true, isTrialGuest: true } } },
            orderBy: { timeSlot: "asc" },
          },
        },
      },
    },
  });

  const dayDateMap = new Map(
    visibleDays.map((d) => [new Date(d.date).toISOString().slice(0, 10), d.id]),
  );

  type HelpSlot = {
    castId: string;
    castName: string;
    isTrialGuest?: boolean;
    storeName: string;
    timeSlot: number;
    isStart: boolean;
    isEnd: boolean;
  };
  const helpSlotsByDay = new Map<string, HelpSlot[]>();

  for (const op of otherPeriods) {
    for (const opDay of op.shiftDays) {
      if (opDay.shiftSlots.length === 0) continue;
      const dateKey = new Date(opDay.date).toISOString().slice(0, 10);
      const myDayId = dayDateMap.get(dateKey);
      if (!myDayId) continue;

      if (!helpSlotsByDay.has(myDayId)) helpSlotsByDay.set(myDayId, []);
      for (const slot of opDay.shiftSlots) {
        castMap.set(slot.castId, castSuffixForShiftBadge(slot.cast));
        helpSlotsByDay.get(myDayId)!.push({
          castId: slot.castId,
          castName: slot.cast.name,
          isTrialGuest: Boolean(slot.cast.isTrialGuest),
          storeName: op.store.name,
          timeSlot: slot.timeSlot,
          isStart: slot.isStart,
          isEnd: slot.isEnd,
        });
      }
    }
  }

  if (isCast && session.user.name && !castMap.has(userId)) {
    castMap.set(userId, castSuffixForShiftBadge({ name: session.user.name }));
  }

  const assignedCasts = [...castMap.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));

  const allCasts = await prisma.user.findMany({
    where: isCast ? { id: userId } : { role: "cast", isTrialGuest: false },
    select: { id: true, name: true, store: { select: { name: true } } },
    orderBy: { name: "asc" },
  });

  const shiftRequestsForHide = await prisma.shiftRequest.findMany({
    where: { periodId },
    select: { castId: true, endTime: true, date: true },
  });

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
        {header}
        {!published && !isCast && (
          <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            このシフトはまだ確定していません。キャストにはまだ表示されていません。
          </p>
        )}
        <ConfirmedShift
          initialData={{
            id: period.id,
            year: period.year,
            month: period.month,
            half: period.half,
            store: { id: period.store.id, name: period.store.name },
            shiftDays: visibleDays.map((d) => ({
              id: d.id,
              date: d.date.toISOString(),
              dayOfWeek: d.dayOfWeek,
              targetBudget: d.targetBudget,
              eventName: d.eventName,
              expectedVisitors: d.expectedVisitors,
              notes: d.notes,
              employeeOnDuty: d.employeeOnDuty,
              shiftSlots: d.shiftSlots.map((s) => ({
                id: s.id,
                timeSlot: s.timeSlot,
                castId: s.castId,
                cast: {
                  id: s.cast.id,
                  name: s.cast.name,
                  isTrialGuest: s.cast.isTrialGuest,
                },
                isStart: s.isStart,
                isEnd: s.isEnd,
                memo: s.memo,
              })),
            })),
          }}
          assignedCasts={assignedCasts}
          defaultSelectedCastId={isCast ? userId : undefined}
          allCasts={allCasts.map((c) => ({
            id: c.id,
            name: c.name,
            store: c.store,
          }))}
          helpSlotsByDay={Object.fromEntries(helpSlotsByDay)}
          shiftRequests={shiftRequestsForHide.map((r) => ({
            castId: r.castId,
            endTime: r.endTime,
            date: r.date.toISOString(),
          }))}
        />
      </main>
    </div>
  );
}
