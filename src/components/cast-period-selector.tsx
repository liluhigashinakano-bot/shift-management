"use client";

import { useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { halfLabel } from "@/lib/period-utils";

type PeriodOption = {
  id: string;
  year: number;
  month: number;
  half: "first" | "second";
};

type Props = {
  storeId: string;
  currentPeriodId: string;
  periods: PeriodOption[]; // 表示可能な範囲だけ（未来は次の期間まで）を渡す
};

export function CastPeriodSelector({ storeId, currentPeriodId, periods }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const kind = useMemo(() => {
    if (pathname.startsWith("/requests/")) return "requests";
    if (pathname.startsWith("/confirmed/")) return "confirmed";
    if (pathname.startsWith("/adjustments/")) return "adjustments";
    return null;
  }, [pathname]);

  const idx = periods.findIndex((p) => p.id === currentPeriodId);
  const prev = idx >= 0 ? periods[idx - 1] : undefined;
  const next = idx >= 0 ? periods[idx + 1] : undefined;

  const go = (periodId: string) => {
    if (!kind) return;
    router.push(`/${kind}/${storeId}/${periodId}`);
  };

  if (!kind || periods.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        type="button"
        className="px-2 py-1 text-xs rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
        disabled={!prev}
        onClick={() => prev && go(prev.id)}
      >
        前の期間
      </button>

      <select
        className="border border-gray-200 rounded px-2 py-1 text-sm bg-white"
        value={currentPeriodId}
        onChange={(e) => go(e.target.value)}
      >
        {periods.map((p) => (
          <option key={p.id} value={p.id}>
            {p.year}年{p.month}月{halfLabel(p.half)}
          </option>
        ))}
      </select>

      <button
        type="button"
        className="px-2 py-1 text-xs rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
        disabled={!next}
        onClick={() => next && go(next.id)}
      >
        次の期間
      </button>
    </div>
  );
}

