import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { NavHeader } from "@/components/nav-header";
import { ConfirmedShift } from "@/components/confirmed-shift";
import { CastPeriodSelector } from "@/components/cast-period-selector";
import Link from "next/link";
import { periodFromNow, nextPeriod, periodIndex } from "@/lib/period-utils";
import { assertStorePageAccess } from "@/lib/store-access";
import { castSuffixForShiftBadge } from "@/lib/cast-display-name";

export default async function ConfirmedPage({
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
            include: { cast: { select: { id: true, name: true, isTrialGuest: true } } },
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
    // 自分の分だけ（自店舗分）
    for (const day of period.shiftDays) {
      (day.shiftSlots as any[]) = day.shiftSlots.filter((s) => s.castId === userId);
    }
  }

  // この店舗のシフトに入っているキャスト一覧
  const castMap = new Map<string, string>();
  for (const day of period.shiftDays) {
    for (const slot of day.shiftSlots) {
      castMap.set(
        slot.castId,
        castSuffixForShiftBadge(slot.cast as { name: string; isTrialGuest?: boolean }),
      );
    }
  }

  // 他店舗ヘルプ出勤
  // staff: 店舗所属キャスト全員分
  // cast: 自分の分だけ
  const storeCasts = await prisma.user.findMany({
    where: role === "cast" ? { id: userId } : { storeId, role: "cast", isTrialGuest: false },
    select: { id: true, name: true },
  });
  const storeCastIds = storeCasts.map((c) => c.id);

  // 他店舗のシフト期間から所属キャストのスロットを取得
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

  // ヘルプ出勤情報を自店舗のday構造にマージ
  // dayIdマッピング（同じ日付の自店舗dayId）
  const dayDateMap = new Map(period.shiftDays.map((d) => [new Date(d.date).toISOString().slice(0, 10), d.id]));

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
        castMap.set(
          slot.castId,
          castSuffixForShiftBadge(slot.cast as { name: string; isTrialGuest?: boolean }),
        ); // キャスト一覧にも追加
        helpSlotsByDay.get(myDayId)!.push({
          castId: slot.castId,
          castName: slot.cast.name,
          isTrialGuest: Boolean((slot.cast as { isTrialGuest?: boolean }).isTrialGuest),
          storeName: op.store.name,
          timeSlot: slot.timeSlot,
          isStart: slot.isStart,
          isEnd: slot.isEnd,
        });
      }
    }
  }

  if (role === "cast" && session.user.name && !castMap.has(userId)) {
    castMap.set(userId, castSuffixForShiftBadge({ name: session.user.name }));
  }

  const assignedCasts = [...castMap.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));

  const allCasts = await prisma.user.findMany({
    where: role === "cast" ? { id: userId } : { role: "cast", isTrialGuest: false },
    include: { store: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  });

  const shiftRequestsForHide = await prisma.shiftRequest.findMany({
    where: { periodId },
    select: { castId: true, endTime: true, date: true },
  });

  const halfLabel = period.half === "first" ? "前半" : "後半";

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
                  href={`/adjustments/${storeId}/${periodId}`}
                  className="inline-flex min-h-9 items-center justify-center rounded-md border border-purple-200 bg-white px-2.5 py-1.5 text-xs font-medium text-purple-700 shadow-sm hover:bg-purple-50 sm:text-sm whitespace-nowrap"
                >
                  調整一覧
                </Link>
              </div>
            </div>
          )}
        </div>
        <ConfirmedShift
          initialData={JSON.parse(JSON.stringify(period))}
          assignedCasts={assignedCasts}
          defaultSelectedCastId={role === "cast" ? userId : undefined}
          allCasts={allCasts.map((c) => ({ id: c.id, name: c.name, store: c.store }))}
          helpSlotsByDay={JSON.parse(JSON.stringify(Object.fromEntries(helpSlotsByDay)))}
          storeName={period.store.name}
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
