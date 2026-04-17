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
          {role !== "cast" && (
            <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">
              &larr; ダッシュボード
            </Link>
          )}
          <h1 className="text-xl font-bold">
            {period.store.name} - {period.year}年{period.month}月{halfLabel} シフト希望
          </h1>
          {role !== "cast" && (
            <Link
              href={`/shifts/${storeId}/${periodId}`}
              className="text-sm text-pink-600 hover:text-pink-800 ml-auto"
            >
              シフト表を見る &rarr;
            </Link>
          )}
          {role === "cast" && (
            <div className="ml-auto flex items-center gap-3 text-sm">
              <CastPeriodSelector storeId={storeId} currentPeriodId={periodId} periods={selectablePeriods as any} />
              <Link className="text-purple-600 hover:text-purple-800" href={`/confirmed/${storeId}/${periodId}`}>
                確定シフト
              </Link>
              <Link className="text-purple-600 hover:text-purple-800" href={`/adjustments/${storeId}/${periodId}`}>
                調整一覧
              </Link>
            </div>
          )}
          {role !== "cast" && (
            <FormImportButton periodId={periodId} sheetsConfigured={sheetsOk} />
          )}
        </div>
        {role === "cast" && googleFormUrl && (
          <div className="mb-4">
            <CastGoogleFormBanner formUrl={googleFormUrl} validDatesYmd={validDatesYmd} />
          </div>
        )}
        <RequestForm
          periodId={periodId}
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
