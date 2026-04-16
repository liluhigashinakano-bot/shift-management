import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { NavHeader } from "@/components/nav-header";
import { ConfirmedShift } from "@/components/confirmed-shift";
import Link from "next/link";

export default async function ConfirmedPage({
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

  // この店舗のシフトに入っているキャスト一覧
  const castMap = new Map<string, string>();
  for (const day of period.shiftDays) {
    for (const slot of day.shiftSlots) {
      castMap.set(slot.castId, slot.cast.name);
    }
  }

  // この店舗所属キャストの他店舗ヘルプ出勤も取得
  const storeCasts = await prisma.user.findMany({
    where: { storeId, role: "cast" },
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
            include: { cast: { select: { id: true, name: true } } },
            orderBy: { timeSlot: "asc" },
          },
        },
      },
    },
  });

  // ヘルプ出勤情報を自店舗のday構造にマージ
  // dayIdマッピング（同じ日付の自店舗dayId）
  const dayDateMap = new Map(period.shiftDays.map((d) => [new Date(d.date).toISOString().slice(0, 10), d.id]));

  type HelpSlot = { castId: string; castName: string; storeName: string; timeSlot: number; isStart: boolean; isEnd: boolean };
  const helpSlotsByDay = new Map<string, HelpSlot[]>();

  for (const op of otherPeriods) {
    for (const opDay of op.shiftDays) {
      if (opDay.shiftSlots.length === 0) continue;
      const dateKey = new Date(opDay.date).toISOString().slice(0, 10);
      const myDayId = dayDateMap.get(dateKey);
      if (!myDayId) continue;

      if (!helpSlotsByDay.has(myDayId)) helpSlotsByDay.set(myDayId, []);
      for (const slot of opDay.shiftSlots) {
        castMap.set(slot.castId, slot.cast.name); // キャスト一覧にも追加
        helpSlotsByDay.get(myDayId)!.push({
          castId: slot.castId,
          castName: slot.cast.name,
          storeName: op.store.name,
          timeSlot: slot.timeSlot,
          isStart: slot.isStart,
          isEnd: slot.isEnd,
        });
      }
    }
  }

  const assignedCasts = [...castMap.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));

  const allCasts = await prisma.user.findMany({
    where: { role: "cast" },
    include: { store: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  });

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
        <div className="flex items-center gap-4 mb-4 flex-wrap">
          <Link
            href={`/shifts/${storeId}/${periodId}`}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            &larr; シフト表に戻る
          </Link>
          <h1 className="text-xl font-bold">
            {period.store.name} - {period.year}年{period.month}月{halfLabel} 確定シフト
          </h1>
        </div>
        <ConfirmedShift
          initialData={JSON.parse(JSON.stringify(period))}
          assignedCasts={assignedCasts}
          allCasts={allCasts.map((c) => ({ id: c.id, name: c.name, store: c.store }))}
          helpSlotsByDay={JSON.parse(JSON.stringify(Object.fromEntries(helpSlotsByDay)))}
          storeName={period.store.name}
        />
      </main>
    </div>
  );
}
