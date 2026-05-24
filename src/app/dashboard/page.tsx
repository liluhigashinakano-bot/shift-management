import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { ensureShiftPeriod } from "@/lib/ensure-shift-period";
import { NavHeader } from "@/components/nav-header";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getAccessibleStoreIds } from "@/lib/store-access";

// クエリ（searchParams）の変更（例: ?year=...&start=...）を必ず反映する
export const dynamic = "force-dynamic";

type ShiftHalf = "first" | "second";
type ShiftPeriodKey = { year: number; month: number; half: ShiftHalf };

function periodIndex(p: ShiftPeriodKey): number {
  // 半月を 0/1 として単純に連番化して比較する
  const halfIdx = p.half === "first" ? 0 : 1;
  return p.year * 24 + (p.month - 1) * 2 + halfIdx;
}

function nextPeriod(p: ShiftPeriodKey): ShiftPeriodKey {
  if (p.half === "first") return { year: p.year, month: p.month, half: "second" };
  const nextMonth = p.month === 12 ? 1 : p.month + 1;
  const nextYear = p.month === 12 ? p.year + 1 : p.year;
  return { year: nextYear, month: nextMonth, half: "first" };
}

function periodFromNow(now: Date): ShiftPeriodKey {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const half: ShiftHalf = now.getDate() <= 15 ? "first" : "second";
  return { year, month, half };
}

function halfLabel(half: ShiftHalf): string {
  return half === "first" ? "前半" : "後半";
}

function makePeriodKeyString(p: ShiftPeriodKey): string {
  return `${p.year}-${p.month}-${p.half}`;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = searchParams ? await searchParams : undefined;
  const session = await auth();
  if (!session) redirect("/login");

  const role = (session.user as any).role as string | undefined;
  if (role === "cast") redirect("/mypage");

  const allStores = await prisma.store.findMany({ orderBy: { name: "asc" } });
  const allowedIds = getAccessibleStoreIds(session.user as any);
  const stores =
    allowedIds === null
      ? allStores
      : allStores.filter((s) => allowedIds.includes(s.id));

  // 表示対象（現在= now から、未来は「次の期間」まで）
  const now = new Date();
  const currentPeriod = periodFromNow(now);
  const maxFuturePeriod = nextPeriod(currentPeriod); // ここまでが選択/表示可能

  // 年は UI では選ばせず、常に「今の年」を基準（未来上限を超えないようクリップ）
  let selectedYear = currentPeriod.year;
  if (selectedYear > maxFuturePeriod.year) selectedYear = maxFuturePeriod.year;

  // 初期表示は「現在の期間」を起点にする（未来は次の期間まで表示できる）
  const candidateDefaultStart: ShiftPeriodKey = { year: selectedYear, month: currentPeriod.month, half: currentPeriod.half };
  const defaultStart: ShiftPeriodKey =
    periodIndex(candidateDefaultStart) <= periodIndex(maxFuturePeriod)
      ? candidateDefaultStart
      : { year: selectedYear, month: maxFuturePeriod.month, half: "first" };
  const selectedStart = (() => {
    const rawStart = sp?.start;
    const s = Array.isArray(rawStart) ? rawStart[0] : rawStart;
    if (!s) return defaultStart;
    // "month-half" (ex: "4-first")
    const [mRaw, hRaw] = s.split("-");
    const month = Number(mRaw);
    const half = hRaw === "second" ? "second" : "first";
    if (!month || month < 1 || month > 12) return defaultStart;
    const candidate: ShiftPeriodKey = { year: selectedYear, month, half };
    // futureを超えていたらデフォルトに戻す（=表示可能な範囲を担保）
    if (periodIndex(candidate) > periodIndex(maxFuturePeriod)) return defaultStart;
    return candidate;
  })();

  const startOptionsForSelectedYear: ShiftPeriodKey[] = (() => {
    const maxIdx = periodIndex(maxFuturePeriod);
    const opts: ShiftPeriodKey[] = [];
    for (let m = 1; m <= 12; m++) {
      const first: ShiftPeriodKey = { year: selectedYear, month: m, half: "first" };
      const second: ShiftPeriodKey = { year: selectedYear, month: m, half: "second" };
      if (periodIndex(first) <= maxIdx) opts.push(first);
      if (periodIndex(second) <= maxIdx) opts.push(second);
    }
    return opts;
  })();

  // 過去はすべて選択可能、未来は selectedStart 作成時点で上限チェック済み。
  // ここで defaultStart に戻してしまうと「URLは変わるのに表示が変わらない」状態になるため、
  // 検証済みの selectedStart をそのまま採用する。
  const effectiveStart = selectedStart;

  const effectiveNext = nextPeriod(effectiveStart);
  const effectiveShowSecondRow = periodIndex(effectiveNext) <= periodIndex(maxFuturePeriod);
  const effectiveDisplayPeriods: ShiftPeriodKey[] = effectiveShowSecondRow ? [effectiveStart, effectiveNext] : [effectiveStart];

  // 表示対象の店舗×期間は未作成なら自動で作成（手動「＋作成」不要）
  for (const store of stores) {
    for (const p of effectiveDisplayPeriods) {
      await ensureShiftPeriod(store.id, p.year, p.month, p.half);
    }
  }

  // 各店舗のシフト期間を取得（表示に必要な期間だけ）
  const periods = await prisma.shiftPeriod.findMany({
    where: {
      OR: effectiveDisplayPeriods.map((p) => ({
        year: p.year,
        month: p.month,
        half: p.half,
      })),
    },
    include: { store: true, _count: { select: { shiftDays: true } } },
  });

  const periodMap = new Map<string, (typeof periods)[number]>();
  for (const p of periods) {
    periodMap.set(
      `${p.storeId}-${makePeriodKeyString({ year: p.year, month: p.month, half: p.half as ShiftHalf })}`,
      p
    );
  }

  return (
    <div className="min-h-dvh">
      <NavHeader
        user={{
          name: session.user.name,
          role: (session.user as any).role,
          storeName: (session.user as any).storeName,
        }}
      />
      <main className="max-w-[1800px] mx-auto w-full min-w-0 px-3 sm:px-4 py-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4 mb-6">
          <h1 className="text-xl sm:text-2xl font-bold break-words">
            {effectiveDisplayPeriods[0].year}年{effectiveDisplayPeriods[0].month}月 {halfLabel(effectiveDisplayPeriods[0].half)}〜
            {effectiveDisplayPeriods.length === 2
              ? `${effectiveDisplayPeriods[1].year !== effectiveDisplayPeriods[0].year ? effectiveDisplayPeriods[1].year + "年" : ""}${effectiveDisplayPeriods[1].month}月${halfLabel(effectiveDisplayPeriods[1].half)}`
              : ""}
            {' '}シフト管理
          </h1>

          <form method="get" className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            <label className="text-sm font-bold text-gray-600">
              期間
              <select name="start" defaultValue={`${effectiveStart.month}-${effectiveStart.half}`} className="ml-2 border border-gray-300 rounded-md px-2 py-1 text-sm">
                {startOptionsForSelectedYear.length === 0 ? (
                  <option value={`${effectiveStart.month}-${effectiveStart.half}`}>
                    {effectiveStart.month}月{halfLabel(effectiveStart.half)}
                  </option>
                ) : (
                  startOptionsForSelectedYear.map((p) => (
                    <option key={makePeriodKeyString(p)} value={`${p.month}-${p.half}`}>
                      {p.month}月{halfLabel(p.half)}
                    </option>
                  ))
                )}
              </select>
            </label>
            <button
              type="submit"
              className="text-sm text-gray-600 hover:text-pink-600 font-medium border border-gray-200 rounded-md px-3 py-1"
            >
              表示
            </button>
          </form>
        </div>

        {stores.length === 0 ? (
          <p className="text-sm text-muted-foreground border rounded-lg border-dashed p-6 text-center">
            表示できる店舗がありません。管理者に所属店舗の設定を確認してください。
          </p>
        ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {stores.map((store) => {
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
                </CardHeader>
                <CardContent className="space-y-2">
                  {effectiveDisplayPeriods.map((p) => {
                    const period = periodFor(p);
                    const label = halfLabel(p.half);
                    const isCurrent = p.year === currentPeriod.year && p.month === currentPeriod.month && p.half === currentPeriod.half;

                    return (
                      <div key={makePeriodKeyString(p)} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">
                            {p.month}月{label}
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
                          <div className="flex items-center gap-2">
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
