import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { NavHeader } from "@/components/nav-header";
import { prisma } from "@/lib/db";
import { assertStorePageAccess } from "@/lib/store-access";
import { castSuffixForShiftBadge } from "@/lib/cast-display-name";

export const dynamic = "force-dynamic";

type CastSummary = {
  castId: string;
  name: string;
  storeName: string | null;
  slotCount: number;
  dayKeys: Set<string>;
  details: Map<string, number>;
};

function formatHours(hours: number): string {
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
}

function formatDateLabel(date: Date, dayOfWeek: string): string {
  const d = new Date(date);
  return `${d.getMonth() + 1}/${d.getDate()}(${dayOfWeek})`;
}

export default async function WorkHoursPage({
  params,
}: {
  params: Promise<{ storeId: string; periodId: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const role = session.user.role;
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
            include: {
              cast: {
                select: {
                  id: true,
                  name: true,
                  isTrialGuest: true,
                  store: { select: { name: true } },
                },
              },
            },
            orderBy: { timeSlot: "asc" },
          },
        },
      },
    },
  });

  if (!period || period.storeId !== storeId) redirect("/dashboard");

  assertStorePageAccess(session.user, storeId);

  const storeCasts = await prisma.user.findMany({
    where: { storeId, role: "cast", isTrialGuest: false },
    select: {
      id: true,
      name: true,
      store: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  });

  const summaries = new Map<string, CastSummary>();
  const ensureSummary = (
    castId: string,
    name: string,
    storeName: string | null,
  ) => {
    const existing = summaries.get(castId);
    if (existing) return existing;
    const summary: CastSummary = {
      castId,
      name,
      storeName,
      slotCount: 0,
      dayKeys: new Set<string>(),
      details: new Map<string, number>(),
    };
    summaries.set(castId, summary);
    return summary;
  };

  for (const cast of storeCasts) {
    ensureSummary(cast.id, cast.name, cast.store?.name ?? null);
  }

  for (const day of period.shiftDays) {
    const dateKey = day.date.toISOString().slice(0, 10);
    const dateLabel = formatDateLabel(day.date, day.dayOfWeek);

    for (const slot of day.shiftSlots) {
      const summary = ensureSummary(
        slot.castId,
        castSuffixForShiftBadge(slot.cast),
        slot.cast.store?.name ?? null,
      );
      summary.slotCount += 1;
      summary.dayKeys.add(dateKey);
      summary.details.set(dateLabel, (summary.details.get(dateLabel) ?? 0) + 0.5);
    }
  }

  const rows = [...summaries.values()].sort((a, b) => {
    const hourDiff = b.slotCount - a.slotCount;
    if (hourDiff !== 0) return hourDiff;
    return a.name.localeCompare(b.name, "ja");
  });
  const totalHours = rows.reduce((sum, row) => sum + row.slotCount * 0.5, 0);
  const activeCastCount = rows.filter((row) => row.slotCount > 0).length;
  const halfLabel = period.half === "first" ? "前半" : "後半";

  return (
    <div className="min-h-dvh">
      <NavHeader
        user={{
          name: session.user.name,
          role: session.user.role,
          storeName: session.user.storeName,
        }}
      />
      <main className="mx-auto w-full max-w-[1200px] min-w-0 px-3 py-4 sm:px-4">
        <div className="mb-4 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <Link
              href="/dashboard"
              className="mb-1 inline-block text-xs text-gray-500 hover:text-gray-700 sm:text-sm"
            >
              &larr; ダッシュボード
            </Link>
            <h1 className="text-lg font-bold leading-tight sm:text-xl">
              {period.store.name}‐{period.year}年{period.month}月{halfLabel}
            </h1>
            <p className="mt-1 text-sm text-gray-500">キャスト別 総労働時間</p>
          </div>
          <Link
            href={`/shifts/${storeId}/${periodId}`}
            className="inline-flex min-h-9 shrink-0 items-center justify-center self-start rounded-md border border-pink-200 bg-white px-3 py-1.5 text-xs font-medium text-pink-600 shadow-sm hover:bg-pink-50 sm:self-center sm:text-sm"
          >
            シフト表を見る
          </Link>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-gray-200 bg-white p-3">
            <div className="text-xs font-medium text-gray-500">店舗合計</div>
            <div className="mt-1 text-2xl font-bold text-gray-900">{formatHours(totalHours)}</div>
          </div>
          <div className="rounded-md border border-gray-200 bg-white p-3">
            <div className="text-xs font-medium text-gray-500">勤務キャスト</div>
            <div className="mt-1 text-2xl font-bold text-gray-900">{activeCastCount}人</div>
          </div>
          <div className="rounded-md border border-gray-200 bg-white p-3">
            <div className="text-xs font-medium text-gray-500">表示キャスト</div>
            <div className="mt-1 text-2xl font-bold text-gray-900">{rows.length}人</div>
          </div>
        </div>

        <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead className="bg-gray-50 text-xs text-gray-600">
              <tr>
                <th className="border-b border-gray-200 px-3 py-2 text-left">キャスト</th>
                <th className="border-b border-gray-200 px-3 py-2 text-left">所属</th>
                <th className="border-b border-gray-200 px-3 py-2 text-right">勤務日数</th>
                <th className="border-b border-gray-200 px-3 py-2 text-right">総労働時間</th>
                <th className="border-b border-gray-200 px-3 py-2 text-left">内訳</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td className="px-3 py-8 text-center text-gray-500" colSpan={5}>
                    表示できるキャストがいません
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const hours = row.slotCount * 0.5;
                  const detailText = [...row.details.entries()]
                    .map(([date, dayHours]) => `${date} ${formatHours(dayHours)}`)
                    .join(" / ");

                  return (
                    <tr key={row.castId} className="odd:bg-white even:bg-gray-50/40">
                      <td className="border-t border-gray-100 px-3 py-2 font-medium text-gray-900">
                        {row.name}
                      </td>
                      <td className="border-t border-gray-100 px-3 py-2 text-gray-600">
                        {row.storeName ?? "-"}
                      </td>
                      <td className="border-t border-gray-100 px-3 py-2 text-right text-gray-700">
                        {row.dayKeys.size}日
                      </td>
                      <td className="border-t border-gray-100 px-3 py-2 text-right font-bold text-emerald-700">
                        {formatHours(hours)}
                      </td>
                      <td className="border-t border-gray-100 px-3 py-2 text-xs text-gray-500">
                        {detailText || "-"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
