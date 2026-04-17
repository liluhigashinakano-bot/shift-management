import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { NavHeader } from "@/components/nav-header";
import { ShiftGrid } from "@/components/shift-grid/shift-grid";
import { SyncButtons } from "@/components/sync-buttons";
import { ShiftRequestLockToggle } from "@/components/shift-request-lock-toggle";
import { ShiftSlotsLockToggle } from "@/components/shift-slots-lock-toggle";
import Link from "next/link";

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
            include: { cast: { select: { id: true, name: true } } },
            orderBy: { timeSlot: "asc" },
          },
        },
      },
    },
  });

  if (!period || period.storeId !== storeId) redirect("/dashboard");

  const allCasts = await prisma.user.findMany({
    where: { role: "cast" },
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
    where: { storeId, role: "cast" },
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

  const helpInfo: Record<string, { castName: string; storeName: string; startTime: number; endTime: number }[]> = {};
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
          castName,
          storeName: op.store.name,
          startTime: Math.min(...slots),
          endTime: Math.max(...slots) + 0.5,
        });
      }
    }
  }

  const halfLabel = period.half === "first" ? "前半" : "後半";
  const isAdmin = (session.user as any).role === "admin" || (session.user as any).role === "employee";

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
        <div className="flex flex-col gap-3 mb-4">
        <div className="flex items-center gap-4 flex-wrap">
          <Link
            href="/dashboard"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            &larr; ダッシュボード
          </Link>
          <h1 className="text-xl font-bold">
            {period.store.name} - {period.year}年{period.month}月{halfLabel}
          </h1>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href={`/confirmed/${storeId}/${periodId}`}
              className="text-xs text-purple-600 hover:text-purple-800 px-2 py-1 border border-purple-200 rounded"
            >
              確定シフト
            </Link>
            <Link
              href={`/requests/${storeId}/${periodId}`}
              className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 border border-blue-200 rounded"
            >
              希望一覧
            </Link>
            <Link
              href={`/adjustments/${storeId}/${periodId}`}
              className="text-xs text-orange-600 hover:text-orange-800 px-2 py-1 border border-orange-200 rounded"
            >
              調整一覧
            </Link>
            {isAdmin && (
              <SyncButtons
                periodId={periodId}
                sheetsImportDisabled={Boolean(period.shiftSlotsLocked)}
              />
            )}
          </div>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap items-start gap-3">
            <ShiftRequestLockToggle
              periodId={periodId}
              initialLocked={Boolean(period.shiftRequestsLocked)}
            />
            <ShiftSlotsLockToggle
              periodId={periodId}
              initialLocked={Boolean(period.shiftSlotsLocked)}
            />
          </div>
        )}
        </div>
        <ShiftGrid
          initialData={JSON.parse(JSON.stringify({ ...period, shiftRequests, helpInfo }))}
          allCasts={allCasts.map((c) => ({
            id: c.id,
            name: c.name,
            store: c.store,
          }))}
        />
      </main>
    </div>
  );
}
