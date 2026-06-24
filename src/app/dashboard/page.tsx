import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { ensureShiftPeriod } from "@/lib/ensure-shift-period";
import { NavHeader } from "@/components/nav-header";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { canEditStore, getAccessibleStoreIds } from "@/lib/store-access";
import {
  nextPeriod,
  periodFromNow,
  periodIndex,
  type ShiftHalf,
  type ShiftPeriodKey,
} from "@/lib/period-utils";
import { Download } from "lucide-react";

export const dynamic = "force-dynamic";

function halfLabel(half: ShiftHalf): string {
  return half === "first" ? "前半" : "後半";
}

function makePeriodKeyString(p: ShiftPeriodKey): string {
  return `${p.year}-${p.month}-${p.half}`;
}

function periodParamName(storeId: string): string {
  return `period_${storeId}`;
}

function parsePeriodParam(
  value: string | string[] | undefined,
  fallback: ShiftPeriodKey,
  maxFuturePeriod: ShiftPeriodKey,
): ShiftPeriodKey {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return fallback;

  const [yearRaw, monthRaw, halfRaw] = raw.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const half: ShiftHalf = halfRaw === "second" ? "second" : "first";
  const candidate = { year, month, half };

  if (!year || !month || month < 1 || month > 12) return fallback;
  if (periodIndex(candidate) > periodIndex(maxFuturePeriod)) return fallback;

  return candidate;
}

function periodOptionValue(p: ShiftPeriodKey): string {
  return `${p.year}-${p.month}-${p.half}`;
}

function periodLabel(p: ShiftPeriodKey): string {
  return `${p.year}年${p.month}月${halfLabel(p.half)}`;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = searchParams ? await searchParams : undefined;
  const session = await auth();
  if (!session) redirect("/login");

  const role = session.user.role;
  if (role === "cast") redirect("/mypage");

  const allStores = await prisma.store.findMany({ orderBy: { name: "asc" } });
  const allowedIds = getAccessibleStoreIds(session.user);
  const stores =
    allowedIds === null
      ? allStores
      : allStores.filter((s) => allowedIds.includes(s.id));

  const now = new Date();
  const currentPeriod = periodFromNow(now);
  const maxFuturePeriod = nextPeriod(currentPeriod);
  const defaultStart = currentPeriod;
  const maxIdx = periodIndex(maxFuturePeriod);
  const csvExportHref = `/api/work-hours/export?year=${currentPeriod.year}`;

  const periodOptions: ShiftPeriodKey[] = [];
  for (let year = currentPeriod.year - 1; year <= maxFuturePeriod.year; year++) {
    for (let month = 1; month <= 12; month++) {
      const first: ShiftPeriodKey = { year, month, half: "first" };
      const second: ShiftPeriodKey = { year, month, half: "second" };
      if (periodIndex(first) <= maxIdx) periodOptions.push(first);
      if (periodIndex(second) <= maxIdx) periodOptions.push(second);
    }
  }

  const selectedStartByStore = new Map<string, ShiftPeriodKey>();
  const displayPeriodsByStore = new Map<string, ShiftPeriodKey[]>();
  for (const store of stores) {
    const selectedStart = parsePeriodParam(
      sp?.[periodParamName(store.id)],
      defaultStart,
      maxFuturePeriod,
    );
    const next = nextPeriod(selectedStart);
    const displayPeriods =
      periodIndex(next) <= maxIdx ? [selectedStart, next] : [selectedStart];

    selectedStartByStore.set(store.id, selectedStart);
    displayPeriodsByStore.set(store.id, displayPeriods);
  }

  for (const store of stores) {
    if (!canEditStore(session.user, store.id)) continue;
    for (const p of displayPeriodsByStore.get(store.id) ?? []) {
      await ensureShiftPeriod(store.id, p.year, p.month, p.half);
    }
  }

  const periodFilters = Array.from(displayPeriodsByStore.values())
    .flat()
    .map((p) => ({
      year: p.year,
      month: p.month,
      half: p.half,
    }));

  const periods =
    periodFilters.length > 0
      ? await prisma.shiftPeriod.findMany({
          where: {
            storeId: { in: stores.map((s) => s.id) },
            OR: periodFilters,
          },
          include: { store: true, _count: { select: { shiftDays: true } } },
        })
      : [];

  const periodMap = new Map<string, (typeof periods)[number]>();
  for (const p of periods) {
    periodMap.set(
      `${p.storeId}-${makePeriodKeyString({
        year: p.year,
        month: p.month,
        half: p.half as ShiftHalf,
      })}`,
      p,
    );
  }

  return (
    <div className="min-h-dvh">
      <NavHeader
        user={{
          name: session.user.name,
          role: session.user.role,
          storeName: session.user.storeName,
        }}
      />
      <main className="max-w-[1800px] mx-auto w-full min-w-0 px-3 sm:px-4 py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4 mb-6">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold break-words">
              シフト管理
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              店舗ごとに表示する期間を変更できます。
            </p>
          </div>

          <a
            href={csvExportHref}
            className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-md border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 shadow-sm hover:bg-emerald-50 sm:text-sm whitespace-nowrap"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            半月別CSV出力
          </a>
        </div>

        {stores.length === 0 ? (
          <p className="text-sm text-muted-foreground border rounded-lg border-dashed p-6 text-center">
            表示できる店舗がありません。管理者に所属店舗の設定を確認してください。
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {stores.map((store) => {
              const selectedStart = selectedStartByStore.get(store.id) ?? defaultStart;
              const displayPeriods = displayPeriodsByStore.get(store.id) ?? [selectedStart];
              const periodFor = (p: ShiftPeriodKey) => {
                const key = `${store.id}-${makePeriodKeyString(p)}`;
                return periodMap.get(key);
              };

              return (
                <Card key={store.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      {store.name}
                    </CardTitle>
                    <form method="get" className="flex items-center gap-2 pt-2">
                      {stores
                        .filter((s) => s.id !== store.id)
                        .map((s) => {
                          const p = selectedStartByStore.get(s.id);
                          if (!p) return null;
                          return (
                            <input
                              key={s.id}
                              type="hidden"
                              name={periodParamName(s.id)}
                              value={periodOptionValue(p)}
                            />
                          );
                        })}
                      <label className="text-sm font-bold text-gray-600">
                        期間
                        <select
                          name={periodParamName(store.id)}
                          defaultValue={periodOptionValue(selectedStart)}
                          className="ml-2 border border-gray-300 rounded-md px-2 py-1 text-sm bg-white"
                        >
                          {periodOptions.map((p) => (
                            <option key={makePeriodKeyString(p)} value={periodOptionValue(p)}>
                              {periodLabel(p)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="submit"
                        className="text-sm text-gray-600 hover:text-pink-600 font-medium border border-gray-200 rounded-md px-3 py-1"
                      >
                        表示
                      </button>
                    </form>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {displayPeriods.map((p) => {
                      const period = periodFor(p);
                      const isCurrent =
                        p.year === currentPeriod.year &&
                        p.month === currentPeriod.month &&
                        p.half === currentPeriod.half;

                      return (
                        <div
                          key={makePeriodKeyString(p)}
                          className="flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm whitespace-nowrap">
                              {periodLabel(p)}
                            </span>
                            {isCurrent && (
                              <Badge
                                variant="secondary"
                                className="bg-pink-100 text-pink-700 text-xs"
                              >
                                現在
                              </Badge>
                            )}
                          </div>
                          {period && (
                            <div className="flex items-center gap-2 shrink-0">
                              <Link
                                href={`/work-hours/${store.id}/${period.id}`}
                                className="text-xs text-emerald-600 hover:text-emerald-800"
                              >
                                総時間
                              </Link>
                              <Link
                                href={`/requests/${store.id}/${period.id}`}
                                className="text-xs text-blue-600 hover:text-blue-800"
                              >
                                希望
                              </Link>
                              <Link
                                href={`/adjustments/${store.id}/${period.id}`}
                                className="text-xs text-orange-600 hover:text-orange-800"
                              >
                                調整
                              </Link>
                              <Link
                                href={`/shifts/${store.id}/${period.id}`}
                                className="text-sm text-pink-600 hover:text-pink-800 font-medium"
                              >
                                シフト表
                              </Link>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}