"use client";

import { useRouter } from "next/navigation";

export type ShiftSheetStoreOption = {
  id: string;
  name: string;
  /** 同一の年月・半月のシフト期間が無い店舗は null */
  periodId: string | null;
};

type Props = {
  currentStoreId: string;
  year: number;
  month: number;
  halfLabel: string;
  /** 2店舗以上のときだけプルダウン表示 */
  storeOptions: ShiftSheetStoreOption[];
};

/**
 * 複数店舗権限のとき、タイトル左の店舗名だけプルダウンで切り替え（同一の年月・半月の期間へ遷移）
 */
export function ShiftSheetStoreTitle({
  currentStoreId,
  year,
  month,
  halfLabel,
  storeOptions,
}: Props) {
  const router = useRouter();
  const suffix = `‐${year}年${month}月${halfLabel}`;

  if (storeOptions.length <= 1) {
    const name = storeOptions[0]?.name ?? "";
    return (
      <h1 className="text-[11px] sm:text-base md:text-xl font-bold shrink-0 whitespace-nowrap">
        {name}
        {suffix}
      </h1>
    );
  }

  return (
    <h1 className="text-[11px] sm:text-base md:text-xl font-bold shrink-0 flex flex-wrap items-baseline gap-x-0 gap-y-0 min-w-0">
      <label className="inline-flex items-baseline gap-1 min-w-0">
        <span className="sr-only">店舗を切り替え</span>
        <select
          className="max-w-[42vw] sm:max-w-[14rem] md:max-w-[18rem] truncate rounded-md border border-purple-200/80 bg-white px-1 py-0.5 text-[11px] sm:text-base md:text-xl font-bold text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-400 sm:px-2"
          value={currentStoreId}
          aria-label="店舗を選択"
          onChange={(e) => {
            const id = e.target.value;
            const opt = storeOptions.find((o) => o.id === id);
            if (!opt?.periodId) return;
            router.push(`/shifts/${opt.id}/${opt.periodId}`);
          }}
        >
          {storeOptions.map((o) => (
            <option key={o.id} value={o.id} disabled={!o.periodId}>
              {o.name}
              {!o.periodId ? "（この期間は未作成）" : ""}
            </option>
          ))}
        </select>
      </label>
      <span className="whitespace-nowrap">{suffix}</span>
    </h1>
  );
}
