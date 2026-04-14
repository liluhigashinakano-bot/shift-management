import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { NavHeader } from "@/components/nav-header";
import { RequestForm } from "@/components/request-form";
import Link from "next/link";

export default async function RequestsPage({
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
      shiftDays: { orderBy: { date: "asc" } },
    },
  });

  if (!period || period.storeId !== storeId) redirect("/dashboard");

  const requests = await prisma.shiftRequest.findMany({
    where: { periodId },
    include: {
      cast: { select: { id: true, name: true, store: { select: { name: true } } } },
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });

  const allCasts = await prisma.user.findMany({
    where: { role: "cast" },
    include: { store: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  });

  const halfLabel = period.half === "first" ? "前半" : "後半";
  const userRole = (session.user as any).role;

  return (
    <div className="min-h-screen">
      <NavHeader
        user={{
          name: session.user.name,
          role: userRole,
          storeName: (session.user as any).storeName,
        }}
      />
      <main className="max-w-[1400px] mx-auto px-4 py-4">
        <div className="flex items-center gap-4 mb-4">
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">
            &larr; ダッシュボード
          </Link>
          <h1 className="text-xl font-bold">
            {period.store.name} - {period.year}年{period.month}月{halfLabel} シフト希望
          </h1>
          <Link
            href={`/shifts/${storeId}/${periodId}`}
            className="text-sm text-pink-600 hover:text-pink-800 ml-auto"
          >
            シフト表を見る &rarr;
          </Link>
        </div>
        <RequestForm
          periodId={periodId}
          days={period.shiftDays.map((d) => ({
            id: d.id,
            date: d.date.toISOString(),
            dayOfWeek: d.dayOfWeek,
          }))}
          initialRequests={JSON.parse(JSON.stringify(requests))}
          allCasts={allCasts.map((c) => ({
            id: c.id,
            name: c.name,
            storeName: c.store?.name ?? null,
          }))}
          userRole={userRole}
          userId={session.user.id}
        />
      </main>
    </div>
  );
}
