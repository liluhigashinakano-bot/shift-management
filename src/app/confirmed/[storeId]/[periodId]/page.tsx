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

  // シフトに入っているキャスト一覧（重複排除）
  const castMap = new Map<string, string>();
  for (const day of period.shiftDays) {
    for (const slot of day.shiftSlots) {
      castMap.set(slot.castId, slot.cast.name);
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
        />
      </main>
    </div>
  );
}
