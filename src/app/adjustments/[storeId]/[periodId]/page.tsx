import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { NavHeader } from "@/components/nav-header";
import { AdjustmentTable } from "@/components/adjustment-table";
import Link from "next/link";

export default async function AdjustmentsPage({
  params,
}: {
  params: Promise<{ storeId: string; periodId: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

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

  const dayIds = period.shiftDays.map((d) => d.id);
  const adjustments = await prisma.shiftAdjustment.findMany({
    where: { dayId: { in: dayIds } },
    include: {
      cast: { select: { id: true, name: true, store: { select: { name: true } } } },
      day: { select: { id: true, date: true, dayOfWeek: true } },
    },
    orderBy: [{ day: { date: "asc" } }, { createdAt: "asc" }],
  });

  // シフト希望データ
  const shiftRequests = await prisma.shiftRequest.findMany({
    where: { periodId },
    select: { castId: true, date: true, startTime: true, endTime: true },
  });

  // dayIdマッピング
  const dayMap = new Map(period.shiftDays.map((d) => [new Date(d.date).toISOString().slice(0, 10), d.id]));
  const requestsByDayAndCast = shiftRequests.map((r) => ({
    castId: r.castId,
    dayId: dayMap.get(new Date(r.date).toISOString().slice(0, 10)) || null,
    startTime: r.startTime,
    endTime: r.endTime,
  }));

  const allCasts = await prisma.user.findMany({
    where: { role: "cast" },
    include: { store: { select: { name: true } } },
    orderBy: { name: "asc" },
  });

  // 調整があるキャスト一覧
  const adjustedCastIds = new Set(adjustments.map((a) => a.castId));
  const adjustedCasts = allCasts.filter((c) => adjustedCastIds.has(c.id));

  const halfLabel = period.half === "first" ? "前半" : "後半";

  return (
    <div className="min-h-screen">
      <NavHeader
        user={{
          name: session.user.name,
          role: (session.user as any).role,
          storeName: (session.user as any).storeName,
        }}
      />
      <main className="max-w-[1800px] mx-auto px-4 py-4">
        <div className="flex items-center gap-4 mb-4">
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">
            &larr; ダッシュボード
          </Link>
          <h1 className="text-xl font-bold">
            {period.store.name} - {period.year}年{period.month}月{halfLabel} 調整一覧
          </h1>
          <Link
            href={`/shifts/${storeId}/${periodId}`}
            className="text-sm text-pink-600 hover:text-pink-800 ml-auto"
          >
            シフト表を見る &rarr;
          </Link>
        </div>
        <AdjustmentTable
          periodId={periodId}
          month={period.month}
          days={JSON.parse(JSON.stringify(period.shiftDays))}
          initialAdjustments={JSON.parse(JSON.stringify(adjustments))}
          shiftRequests={requestsByDayAndCast}
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
        />
      </main>
    </div>
  );
}
