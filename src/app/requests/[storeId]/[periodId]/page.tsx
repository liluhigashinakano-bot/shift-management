import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { NavHeader } from "@/components/nav-header";
import { RequestForm } from "@/components/request-form";
import { CastPeriodSelector } from "@/components/cast-period-selector";
import Link from "next/link";
import { periodFromNow, nextPeriod, periodIndex } from "@/lib/period-utils";
import { getGoogleFormPublicUrl } from "@/lib/google-form-config";
import { isSheetsConfigured } from "@/lib/google-sheets";
import { CastGoogleFormBanner } from "@/components/cast-google-form-banner";
import { FormImportButton } from "@/components/form-import-button";

export default async function RequestsPage({
  params,
}: {
  params: Promise<{ storeId: string; periodId: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  const role = (session.user as any).role as string | undefined;

  const { storeId, periodId } = await params;

  const period = await prisma.shiftPeriod.findUnique({
    where: { id: periodId },
    include: {
      store: true,
      shiftDays: { orderBy: { date: "asc" } },
    },
  });

  if (!period || period.storeId !== storeId) redirect("/dashboard");

  const userId = session.user.id;

  // キャスト向け: 過去〜次の期間まで切り替え可能
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

  // 希望一覧: staff は従来通り（店舗所属キャスト全員 + 他店舗ヘルプ）
  // cast は「自分の分だけ」（同じ年月/半月の他店舗ヘルプ分も含む）
  const allRequests = await (async () => {
    if (role === "cast") {
      const my = await prisma.shiftRequest.findMany({
        where: {
          castId: userId,
          period: { year: period.year, month: period.month, half: period.half },
        },
        include: {
          cast: { select: { id: true, name: true, store: { select: { name: true } } } },
          period: { select: { store: { select: { name: true } }, year: true, month: true, half: true } },
        },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
      });

      return my.map((r) => ({
        ...r,
        notes:
          r.periodId === periodId
            ? r.notes
            : r.notes
              ? `[${r.period.store.name}] ${r.notes}`
              : `[${r.period.store.name}ヘルプ]`,
      }));
    }

    const requests = await prisma.shiftRequest.findMany({
      where: { periodId },
      include: {
        cast: { select: { id: true, name: true, store: { select: { name: true } } } },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    });

    // この店舗所属キャストの他店舗での希望
    const storeCasts = await prisma.user.findMany({
      where: { storeId, role: "cast" },
      select: { id: true },
    });
    const storeCastIds = storeCasts.map((c) => c.id);

    const otherRequests = await prisma.shiftRequest.findMany({
      where: {
        castId: { in: storeCastIds },
        period: {
          year: period.year,
          month: period.month,
          half: period.half,
          storeId: { not: storeId },
        },
      },
      include: {
        cast: { select: { id: true, name: true, store: { select: { name: true } } } },
        period: { select: { store: { select: { name: true } } } },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    });

    return [
      ...requests,
      ...otherRequests.map((r) => ({
        ...r,
        notes: r.notes ? `[${r.period.store.name}] ${r.notes}` : `[${r.period.store.name}ヘルプ]`,
      })),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  })();

  const periodIdSet = new Set<string>([periodId, ...allRequests.map((r) => r.periodId)]);
  const lockRows = await prisma.shiftPeriod.findMany({
    where: { id: { in: [...periodIdSet] } },
    select: { id: true, shiftRequestsLocked: true },
  });
  const periodLocks = Object.fromEntries(lockRows.map((x) => [x.id, x.shiftRequestsLocked]));

  const allCasts = await prisma.user.findMany({
    where: role === "cast" ? { id: userId } : { role: "cast" },
    include: { store: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  });

  const halfLabel = period.half === "first" ? "前半" : "後半";
  const userRole = role || "";
  const googleFormUrl = getGoogleFormPublicUrl();
  const validDatesYmd = period.shiftDays.map((d) =>
    new Date(d.date).toISOString().slice(0, 10),
  );
  const sheetsOk = isSheetsConfigured();

  return (
    <div className="min-h-dvh">
      <NavHeader
        user={{
          name: session.user.name,
          role: userRole,
          storeName: (session.user as any).storeName,
        }}
      />
      <main className="max-w-[1400px] mx-auto w-full min-w-0 px-3 sm:px-4 py-4">
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
          </div>
          {role !== "cast" && (
            <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:ml-auto sm:w-auto sm:justify-end">
              <Link
                href={`/shifts/${storeId}/${periodId}`}
                className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-md border border-pink-200 bg-white px-2.5 py-1.5 text-xs font-medium text-pink-600 shadow-sm hover:bg-pink-50 sm:text-sm whitespace-nowrap"
              >
                シフト表を見る &rarr;
              </Link>
              <FormImportButton
                periodId={periodId}
                sheetsConfigured={sheetsOk}
                disabled={period.shiftRequestsLocked || period.shiftSlotsLocked}
              />
            </div>
          )}
          {role === "cast" && (
            <div className="flex w-full min-w-0 flex-col gap-2 sm:ml-auto sm:w-auto sm:max-w-none sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-3">
              <CastPeriodSelector storeId={storeId} currentPeriodId={periodId} periods={selectablePeriods as any} />
              <div className="flex shrink-0 flex-row flex-wrap items-center gap-2">
                <Link
                  href={`/confirmed/${storeId}/${periodId}`}
                  className="inline-flex min-h-9 items-center justify-center rounded-md border border-purple-200 bg-white px-2.5 py-1.5 text-xs font-medium text-purple-700 shadow-sm hover:bg-purple-50 sm:text-sm whitespace-nowrap"
                >
                  確定シフト
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
        {role === "cast" && googleFormUrl && (
          <div className="mb-4">
            <CastGoogleFormBanner formUrl={googleFormUrl} validDatesYmd={validDatesYmd} />
          </div>
        )}
        <RequestForm
          periodId={periodId}
          periodLocks={periodLocks}
          days={period.shiftDays.map((d) => ({
            id: d.id,
            date: d.date.toISOString(),
            dayOfWeek: d.dayOfWeek,
          }))}
          initialRequests={JSON.parse(JSON.stringify(allRequests))}
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
