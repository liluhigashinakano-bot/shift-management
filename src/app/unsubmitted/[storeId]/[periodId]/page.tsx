import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { NavHeader } from "@/components/nav-header";
import Link from "next/link";
import { assertStorePageAccess } from "@/lib/store-access";

export const dynamic = "force-dynamic";

export default async function UnsubmittedCastsPage({
  params,
}: {
  params: Promise<{ storeId: string; periodId: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const { storeId, periodId } = await params;

  // assertStorePageAccess は cast を /mypage に、店舗アクセス権が無いユーザーを /dashboard にリダイレクトする
  assertStorePageAccess(session.user as any, storeId);

  const period = await prisma.shiftPeriod.findUnique({
    where: { id: periodId },
    include: { store: true },
  });

  if (!period || period.storeId !== storeId) redirect("/dashboard");

  // 該当店舗所属のキャスト全員
  const storeCasts = await prisma.user.findMany({
    where: { role: "cast", storeId },
    select: { id: true, name: true, castLoginId: true, hourlyRate: true },
    orderBy: { name: "asc" },
  });

  // この期間にシフト希望を提出したキャストの ID 集合
  const submittedRows = await prisma.shiftRequest.findMany({
    where: { periodId },
    select: { castId: true },
    distinct: ["castId"],
  });
  const submittedSet = new Set(submittedRows.map((r) => r.castId));

  // 未提出キャストのみ抽出
  const unsubmitted = storeCasts.filter((c) => !submittedSet.has(c.id));

  const halfLabel = period.half === "first" ? "前半" : "後半";

  return (
    <div className="min-h-dvh bg-gradient-to-b from-rose-50/30 to-white">
      <NavHeader
        user={{
          name: session.user.name,
          role: (session.user as any).role,
          storeName: (session.user as any).storeName,
        }}
      />
      <main className="max-w-3xl mx-auto w-full min-w-0 px-3 sm:px-4 py-4 sm:py-6">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <Link
              href={`/shifts/${storeId}/${periodId}`}
              className="mb-1 inline-block text-xs text-gray-500 hover:text-gray-700 sm:text-sm"
            >
              &larr; シフト表に戻る
            </Link>
            <h1 className="text-base font-bold text-gray-900 sm:text-lg">
              未提出キャスト一覧
            </h1>
            <p className="mt-0.5 text-xs text-gray-500 sm:text-sm">
              {period.store.name}‐{period.year}年{period.month}月{halfLabel}
            </p>
          </div>
          <div className="shrink-0">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold sm:text-sm ${
                unsubmitted.length === 0
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-rose-200 bg-rose-50 text-rose-700"
              }`}
            >
              {unsubmitted.length === 0
                ? "全員提出済"
                : `未提出 ${unsubmitted.length}名`}
            </span>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          {unsubmitted.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-gray-500">
              この期間のシフト希望は、所属キャスト全員から提出済みです。
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {unsubmitted.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-3 px-3 py-2.5 sm:px-4 sm:py-3"
                >
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-100 text-xs font-bold text-rose-700 sm:h-9 sm:w-9 sm:text-sm">
                    {Array.from(c.name)[0] ?? "?"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-gray-900 sm:text-base">
                      {c.name}
                    </div>
                    <div className="truncate text-[10px] text-gray-500 sm:text-xs">
                      {c.castLoginId ? `ID: ${c.castLoginId}` : "ログインID未設定"}
                      {c.hourlyRate ? ` ・ 時給 ${c.hourlyRate.toLocaleString()}円` : ""}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
