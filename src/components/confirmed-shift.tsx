"use client";

import React, { useState, useMemo } from "react";
import {
  TIME_SLOTS,
  displaySlotForClockOut,
  formatTimeSlot,
  getJapaneseDayOfWeek,
  hideEndCastNameForWishEnd29,
} from "@/lib/shift-utils";
import { Modal } from "@/components/modal";
import { Button } from "@/components/ui/button";

type Cast = { id: string; name: string };
type ShiftSlot = {
  id: string;
  timeSlot: number;
  castId: string;
  cast: Cast;
  isStart: boolean;
  isEnd: boolean;
  memo: string | null;
  /** 他店舗ヘルプでマージしたスロットのみ（送付用一覧に店名を出す） */
  _helpStore?: string;
};
type ShiftDay = {
  id: string;
  date: string;
  dayOfWeek: string;
  targetBudget: number | null;
  eventName: string | null;
  expectedVisitors: string | null;
  notes: string | null;
  employeeOnDuty: string | null;
  shiftSlots: ShiftSlot[];
};
type Period = {
  id: string;
  year: number;
  month: number;
  half: string;
  store: { id: string; name: string };
  shiftDays: ShiftDay[];
};

type HelpSlot = { castId: string; castName: string; storeName: string; timeSlot: number; isStart: boolean; isEnd: boolean };

type Props = {
  initialData: Period;
  assignedCasts: { id: string; name: string }[];
  allCasts: { id: string; name: string; store: { name: string } | null }[];
  helpSlotsByDay?: Record<string, HelpSlot[]>;
  storeName?: string;
  /** 退勤29:00希望時に退勤列の名前を隠す判定用 */
  shiftRequests?: { castId: string; endTime: number; date: string }[];
};

function dayHeaderBg(dow: string): string {
  if (dow === "土") return "bg-sky-200 text-sky-800";
  if (dow === "日" || dow === "祝") return "bg-pink-200 text-pink-800";
  return "bg-purple-100/60 text-purple-800";
}

function timeRowBg(slot: number): string {
  const hour = Math.floor(slot);
  if (hour >= 25) return "bg-gray-50";
  return hour % 2 === 0 ? "bg-white" : "bg-slate-50/50";
}

// 人数グラデーション
const COUNT_COLORS: [string, string][] = [
  ["", ""],
  ["#f0f9ff", "#38bdf8"],
  ["#e0f2fe", "#0ea5e9"],
  ["#d4eeff", "#0284c7"],
  ["#c8e6fd", "#0273ab"],
  ["#bcdcfb", "#1a65c4"],
  ["#b4d4fa", "#2558c0"],
  ["#aec8f8", "#3050b8"],
  ["#b5bef6", "#4245b0"],
  ["#bcb4f4", "#4c3daa"],
  ["#c4adf2", "#5535a4"],
  ["#cba6ef", "#5f2d9e"],
  ["#d3a0ec", "#6a2598"],
  ["#be8de6", "#ffffff"],
  ["#a975dc", "#ffffff"],
  ["#8b5cf6", "#ffffff"],
];

function countStyle(count: number): React.CSSProperties {
  if (count === 0) return {};
  const idx = Math.min(count, 15);
  const [bg, fg] = COUNT_COLORS[idx];
  return { backgroundColor: bg, color: fg };
}

export function ConfirmedShift({
  initialData,
  assignedCasts,
  allCasts,
  helpSlotsByDay,
  storeName,
  shiftRequests = [],
}: Props) {
  const [selectedCast, setSelectedCast] = useState("");
  const [showSendList, setShowSendList] = useState(false);
  const data = initialData;

  // ヘルプスロットをマージしたデータ
  const mergedDays = useMemo(() => {
    return data.shiftDays.map((day) => {
      const helpSlots = helpSlotsByDay?.[day.id] || [];
      const mergedSlots = [
        ...day.shiftSlots,
        ...helpSlots.map((h) => ({
          id: `help_${h.castId}_${h.timeSlot}`,
          timeSlot: h.timeSlot,
          castId: h.castId,
          cast: { id: h.castId, name: h.castName },
          isStart: h.isStart,
          isEnd: h.isEnd,
          memo: null,
          _helpStore: h.storeName,
        })),
      ];
      return { ...day, shiftSlots: mergedSlots };
    });
  }, [data.shiftDays, helpSlotsByDay]);

  // 選択キャストでフィルタ
  const filteredDays = useMemo(() => {
    if (!selectedCast) return mergedDays;
    return mergedDays.map((day) => ({
      ...day,
      shiftSlots: day.shiftSlots.filter((s) => s.castId === selectedCast),
    }));
  }, [mergedDays, selectedCast]);

  const mid = Math.min(8, filteredDays.length);
  const weeks = [filteredDays.slice(0, mid), filteredDays.slice(mid)];

  return (
    <div className="space-y-4">
      {/* キャスト選択 */}
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-2">
        <div className="flex min-w-0 items-center gap-2">
          <label className="shrink-0 whitespace-nowrap text-[10px] font-bold text-purple-700 sm:text-sm">
            キャスト選択:
          </label>
          <select
            className="min-h-9 min-w-0 flex-1 border border-gray-300 rounded-md bg-white px-2 py-1.5 text-[11px] sm:min-w-[200px] sm:flex-none sm:px-3 sm:py-2 sm:text-sm"
            value={selectedCast}
            onChange={(e) => setSelectedCast(e.target.value)}
          >
            <option value="">全キャスト表示</option>
            {assignedCasts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {selectedCast && (
          <button
            type="button"
            className="inline-flex min-h-9 shrink-0 items-center justify-center self-start rounded-md border border-purple-200 bg-white px-2.5 py-1.5 text-[10px] font-medium text-purple-700 shadow-sm hover:bg-purple-50 sm:self-center sm:text-xs whitespace-nowrap"
            onClick={() => setShowSendList(true)}
          >
            送付用一覧
          </button>
        )}
      </div>

      {/* シフト表 */}
      {weeks.map((week, weekIdx) => {
        if (week.length === 0) return null;
        return (
          <div key={weekIdx} className="overflow-x-auto rounded-lg border border-gray-300 shadow-sm">
            <table className="border-collapse text-xs w-full" style={{ tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "38px" }} />
                {week.map((_, i) => (
                  <React.Fragment key={i}>
                    <col style={{ width: "46px" }} />
                    <col style={{ width: "46px" }} />
                    <col style={{ width: "14px" }} />
                    <col style={{ width: "38px" }} />
                  </React.Fragment>
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th className="border-r-[3px] border-b border-gray-500 px-1 py-0.5 w-14 sticky left-0 bg-gradient-to-b from-purple-600 to-pink-500 text-white z-20 text-[11px]">
                  </th>
                  {week.map((day, idx) => {
                    const d = new Date(day.date);
                    const dow = getJapaneseDayOfWeek(d);
                    const bg = dayHeaderBg(dow);
                    const isLast = idx === week.length - 1;
                    return (
                      <th
                        key={day.id}
                        colSpan={4}
                        className={`border-b border-gray-400 px-0.5 py-0.5 text-center font-bold text-[11px] relative ${bg} ${!isLast ? "border-r-[3px] border-r-gray-500" : ""}`}
                      >
                        <span>{d.getDate()}</span>
                        <span className="ml-1 text-[10px] font-normal">({dow})</span>
                      </th>
                    );
                  })}
                </tr>
                <tr className="bg-gray-100">
                  <th className="border-r-2 border-b border-gray-300 px-0.5 py-0.5 sticky left-0 bg-gray-100 z-20 text-[8px] text-gray-500">時間</th>
                  {week.map((day, dayIdx) => {
                    const isLast = dayIdx === week.length - 1;
                    return (
                      <React.Fragment key={day.id}>
                        <th className="border-b border-gray-300 px-0.5 py-0.5 text-center text-[8px] text-gray-500">出勤</th>
                        <th className="border-b border-gray-300 px-0.5 py-0.5 text-center text-[8px] text-gray-500">退勤</th>
                        <th className="border-b border-gray-300 px-0.5 py-0.5 text-center text-[8px] text-gray-500">人</th>
                        <th className={`border-b border-gray-300 px-0.5 py-0.5 text-center text-[8px] text-gray-500 ${!isLast ? "border-r-[3px] border-r-gray-500" : ""}`}>メモ</th>
                      </React.Fragment>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {TIME_SLOTS.map((slot) => {
                  const isHourBoundary = slot % 1 === 0;
                  const rowBg = timeRowBg(slot);
                  const hourBorder = isHourBoundary ? "border-t border-t-gray-400" : "border-t border-t-gray-200";

                  return (
                    <tr key={slot} className={rowBg} style={{ height: "28px", maxHeight: "28px" }}>
                      <td style={{ height: "28px" }} className={`border-r-[3px] border-gray-500 ${hourBorder} px-0.5 py-0 font-mono sticky left-0 z-10 text-[10px] ${isHourBoundary ? "text-center font-bold text-gray-700 bg-gray-100" : "text-right text-gray-400 bg-gray-50"}`}>
                        {isHourBoundary ? `${Math.floor(slot)}:00` : `:30`}
                      </td>
                      {week.map((day, dayIdx) => {
                        const daySlots = day.shiftSlots.filter((s) => s.timeSlot === slot);
                        const startCasts = daySlots.filter((s) => s.isStart);
                        const endCasts = day.shiftSlots.filter((s) => {
                          if (!s.isEnd) return false;
                          return displaySlotForClockOut(day.shiftSlots, s.castId) === slot;
                        });
                        const count = daySlots.length;
                        const isLast = dayIdx === week.length - 1;
                        const hasWorking = count > 0;

                        return (
                          <React.Fragment key={day.id}>
                            <td
                              style={{ boxShadow: "inset 1px 0 0 #9ca3af" }}
                              className={`${hourBorder} px-0 py-0 text-[10px] ${hasWorking ? "bg-amber-50/40" : ""}`}
                            >
                              <div style={{ height: "28px", overflow: "hidden", display: "flex", flexWrap: "wrap", alignItems: "center", padding: "0 2px" }}>
                                {startCasts.map((s) => {
                                  const helpStore = (s as any)._helpStore;
                                  const castInfo = allCasts.find((c) => c.id === s.castId);
                                  const isHelp = helpStore || (castInfo?.store?.name && castInfo.store.name !== data.store.name);
                                  const displayName = helpStore
                                    ? `→${helpStore} ${s.cast.name}`
                                    : (castInfo?.store?.name && castInfo.store.name !== data.store.name)
                                      ? `${castInfo!.store!.name}${s.cast.name}`
                                      : s.cast.name;
                                  const tagBg = helpStore ? "#fef3c7" : "#fbcfe8"; // ヘルプ先は黄色系
                                  const tagColor = helpStore ? "#92400e" : "#9d174d";
                                  return (
                                    <span
                                      key={s.castId + (helpStore || "")}
                                      style={{ backgroundColor: tagBg, color: tagColor, fontSize: "9px" }}
                                      className="inline-block rounded px-1 py-0 mr-0.5 font-medium leading-tight whitespace-nowrap"
                                    >
                                      {displayName}
                                    </span>
                                  );
                                })}
                              </div>
                            </td>
                            <td
                              style={{ boxShadow: "inset 1px 0 0 #d1d5db" }}
                              className={`${hourBorder} px-0 py-0 text-[10px] ${hasWorking ? "bg-amber-50/40" : ""}`}
                            >
                              <div style={{ height: "28px", overflow: "hidden", display: "flex", flexWrap: "wrap", alignItems: "center", padding: "0 2px" }}>
                                {endCasts.map((s) => {
                                  const reqHide = shiftRequests.find(
                                    (r) =>
                                      r.castId === s.castId &&
                                      new Date(r.date).toISOString().slice(0, 10) ===
                                        new Date(day.date).toISOString().slice(0, 10) &&
                                      hideEndCastNameForWishEnd29(r.endTime),
                                  );
                                  if (reqHide) return null;
                                  const helpStore = (s as any)._helpStore;
                                  const castInfo = allCasts.find((c) => c.id === s.castId);
                                  const displayName = helpStore
                                    ? `→${helpStore} ${s.cast.name}`
                                    : (castInfo?.store?.name && castInfo.store.name !== data.store.name)
                                      ? `${castInfo!.store!.name}${s.cast.name}`
                                      : s.cast.name;
                                  return (
                                    <span
                                      key={s.castId + (helpStore || "")}
                                      style={{ backgroundColor: "#e5e7eb", color: "#4b5563", fontSize: "9px" }}
                                      className="inline-block rounded px-1 py-0 mr-0.5 leading-tight whitespace-nowrap"
                                    >
                                      {displayName}
                                    </span>
                                  );
                                })}
                              </div>
                            </td>
                            <td style={{ boxShadow: "inset 1px 0 0 #d1d5db", ...countStyle(count) }} className={`${hourBorder} px-0 py-0 text-center font-bold text-[9px]`}>
                              {count || ""}
                            </td>
                            <td style={{ boxShadow: `inset 1px 0 0 #d1d5db${!isLast ? ", inset -3px 0 0 #6b7280" : ""}` }} className={`${hourBorder} px-0 py-0 overflow-hidden ${hasWorking ? "bg-amber-50/40" : ""}`}>
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  );
                })}
                {/* 集計行 */}
                <tr className="bg-emerald-50 border-t-[3px] border-gray-500">
                  <td className="border-r-[3px] border-gray-500 px-0.5 py-0.5 text-[7px] font-bold sticky left-0 bg-emerald-50 z-10 text-emerald-800 whitespace-nowrap">
                    <span className="text-emerald-800">予算</span>/<span className="text-sky-700">時間</span>
                  </td>
                  {week.map((day, dayIdx) => {
                    const budget = day.targetBudget;
                    const totalHours = day.shiftSlots.length * 0.5;
                    const isLast = dayIdx === week.length - 1;
                    return (
                      <React.Fragment key={day.id}>
                        <td className="px-0.5 py-0.5 text-[9px] font-bold text-emerald-800 whitespace-nowrap">
                          {budget ? budget.toLocaleString() : "-"}
                        </td>
                        <td colSpan={2} className="px-0.5 py-0.5 text-[9px] font-bold text-sky-700 whitespace-nowrap">
                          {totalHours || "-"}
                        </td>
                        <td className={`px-0.5 py-0.5 text-[8px] text-purple-700 whitespace-nowrap ${!isLast ? "border-r-[3px] border-r-gray-500" : ""}`}>
                          {day.eventName || "-"}
                        </td>
                      </React.Fragment>
                    );
                  })}
                </tr>
                <tr className="bg-orange-50">
                  <td className="border-r-[3px] border-gray-500 px-0.5 py-0.5 text-[8px] font-bold sticky left-0 bg-orange-50 z-10 text-orange-800 whitespace-nowrap">社員</td>
                  {week.map((day, dayIdx) => {
                    const isLast = dayIdx === week.length - 1;
                    return (
                      <td key={day.id} colSpan={4} className={`px-0.5 py-0.5 text-[8px] text-orange-800 whitespace-nowrap ${!isLast ? "border-r-[3px] border-r-gray-500" : ""}`}>
                        {day.employeeOnDuty || "-"}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        );
      })}

      {/* 送付用一覧モーダル */}
      {showSendList && selectedCast && (
        <SendListModal
          castName={assignedCasts.find((c) => c.id === selectedCast)?.name || ""}
          days={mergedDays}
          castId={selectedCast}
          month={data.month}
          onClose={() => setShowSendList(false)}
        />
      )}
    </div>
  );
}

// 送付用一覧モーダル
function SendListModal({
  castName, days, castId, month, onClose,
}: {
  castName: string;
  days: ShiftDay[];
  castId: string;
  month: number;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  // シフトテキスト生成
  const text = useMemo(() => {
    const lines: string[] = [`【確定シフト】`];
    for (const day of days) {
      const castSlots = day.shiftSlots
        .filter((s) => s.castId === castId)
        .sort((a, b) => a.timeSlot - b.timeSlot);
      if (castSlots.length === 0) continue;

      const startTime = castSlots[0].timeSlot;
      const endTime = castSlots[castSlots.length - 1].timeSlot + 0.5;
      const d = new Date(day.date);
      const dateStr = `${month}月${d.getDate()}日(${getJapaneseDayOfWeek(d)})`;
      const helpStores = [
        ...new Set(castSlots.map((s) => s._helpStore).filter((x): x is string => Boolean(x))),
      ];
      const helpSuffix = helpStores.length > 0 ? `　${helpStores.join("・")}` : "";
      lines.push(`${dateStr}　${formatTimeSlot(startTime)}～${formatTimeSlot(endTime)}${helpSuffix}`);
    }
    return lines.join("\n");
  }, [days, castId, month]);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal open title={`${castName} - 送付用一覧`} onClose={onClose}>
      <div className="space-y-3">
        <pre className="bg-gray-50 border border-gray-200 rounded-md p-3 text-sm whitespace-pre-wrap font-sans">
          {text}
        </pre>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>閉じる</Button>
          <Button onClick={handleCopy} className="bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white">
            {copied ? "コピーしました！" : "テキストをコピー"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
