"use client";

import React, { useState, useCallback } from "react";
import {
  TIME_SLOTS,
  formatTimeSlot,
  getJapaneseDayOfWeek,
  hideEndCastNameForWishEnd29,
} from "@/lib/shift-utils";
import { CastAddDialog } from "./cast-add-dialog";
import { CastEditModal } from "./cast-edit-modal";
import { DayInfoEditor } from "./day-info-editor";
import { Modal } from "@/components/modal";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type Cast = { id: string; name: string };
type ShiftSlot = {
  id: string;
  timeSlot: number;
  castId: string;
  cast: Cast;
  isStart: boolean;
  isEnd: boolean;
  memo: string | null;
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
type ShiftRequestInfo = {
  castId: string;
  dayId: string | null;
  date: string;
  startTime: number;
  endTime: number;
  notes: string | null;
};
type Period = {
  id: string;
  year: number;
  month: number;
  half: string;
  store: { id: string; name: string };
  shiftDays: ShiftDay[];
  shiftRequests?: ShiftRequestInfo[];
  helpInfo?: Record<string, { castName: string; storeName: string; startTime: number; endTime: number }[]>;
};

type Props = {
  initialData: Period;
  allCasts: { id: string; name: string; store: { name: string } | null }[];
};

type EditTarget = {
  dayId: string;
  dayLabel: string;
  castId: string;
  castName: string;
  currentStart: number;
  currentEnd: number;
  memo: string | null;
};

// 人数に応じた背景色（1〜15: 薄い水色→明るい紫、緩やかなグラデーション）
const COUNT_COLORS: [string, string][] = [
  /* 0  */ ["", ""],
  /* 1  */ ["#f0f9ff", "#38bdf8"], // ごく薄い水色
  /* 2  */ ["#e0f2fe", "#0ea5e9"], // 薄い水色
  /* 3  */ ["#d4eeff", "#0284c7"], // 水色
  /* 4  */ ["#c8e6fd", "#0273ab"], // やや濃い水色
  /* 5  */ ["#bcdcfb", "#1a65c4"], // 水色→青の間
  /* 6  */ ["#b4d4fa", "#2558c0"], // 薄い青
  /* 7  */ ["#aec8f8", "#3050b8"], // 青
  /* 8  */ ["#b5bef6", "#4245b0"], // 青→インディゴ
  /* 9  */ ["#bcb4f4", "#4c3daa"], // インディゴ
  /* 10 */ ["#c4adf2", "#5535a4"], // インディゴ→バイオレット
  /* 11 */ ["#cba6ef", "#5f2d9e"], // 薄バイオレット
  /* 12 */ ["#d3a0ec", "#6a2598"], // バイオレット
  /* 13 */ ["#be8de6", "#ffffff"], // 明るい紫（白文字）
  /* 14 */ ["#a975dc", "#ffffff"], // 紫（白文字）
  /* 15 */ ["#8b5cf6", "#ffffff"], // 鮮やか紫（白文字）
];
function countBg(count: number): string {
  if (count === 0) return "";
  const idx = Math.min(count, 15);
  const [bg, fg] = COUNT_COLORS[idx];
  return "";
}
function countStyle(count: number): React.CSSProperties {
  if (count === 0) return {};
  const idx = Math.min(count, 15);
  const [bg, fg] = COUNT_COLORS[idx];
  return { backgroundColor: bg, color: fg };
}

// 曜日に応じたヘッダー色
function dayHeaderBg(dow: string): string {
  if (dow === "土") return "bg-sky-200 text-sky-800";
  if (dow === "日" || dow === "祝") return "bg-pink-200 text-pink-800";
  return "bg-purple-100/60 text-purple-800";
}

// 時間帯ごとの背景色（薄いストライプ）
function timeRowBg(slot: number): string {
  const hour = Math.floor(slot);
  if (hour >= 25) return "bg-gray-50"; // 深夜帯は薄いグレー
  return hour % 2 === 0 ? "bg-white" : "bg-slate-50/50";
}

export function ShiftGrid({ initialData, allCasts }: Props) {
  const [data, setData] = useState(initialData);
  const [addDialog, setAddDialog] = useState<{ dayId: string; dayLabel: string } | null>(null);
  const [editDay, setEditDay] = useState<ShiftDay | null>(null);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [editField, setEditField] = useState<{ dayId: string; dayLabel: string; field: "employeeOnDuty" | "expectedVisitors" | "notes" | "eventName"; label: string; value: string } | null>(null);
  const [memoView, setMemoView] = useState<{
    castName: string;
    memo: string;
    castId: string;
    dayId: string;
    dayLabel: string;
    currentStart: number;
    currentEnd: number;
  } | null>(null);

  const reload = useCallback(async () => {
    const res = await fetch(`/api/shifts?periodId=${data.id}`);
    if (res.ok) setData(await res.json());
  }, [data.id]);

  const handleCastClick = (day: ShiftDay, castId: string, castName: string) => {
    const castSlots = day.shiftSlots
      .filter((s) => s.castId === castId)
      .sort((a, b) => a.timeSlot - b.timeSlot);
    if (castSlots.length === 0) return;
    const currentStart = castSlots[0].timeSlot;
    const currentEnd = castSlots[castSlots.length - 1].timeSlot + 0.5;
    const startSlot = castSlots.find((s) => s.isStart);
    const memo = startSlot?.memo || null;
    const d = new Date(day.date);
    const dayLabel = `${d.getMonth() + 1}/${d.getDate()}(${getJapaneseDayOfWeek(d)})`;
    setEditTarget({ dayId: day.id, dayLabel, castId, castName, currentStart, currentEnd, memo });
  };

  // ドラッグ＆ドロップ: 出勤/退勤タグを別の時間行にドロップして時間変更
  const [dragging, setDragging] = useState<{
    dayId: string;
    castId: string;
    castName: string;
    type: "start" | "end";
    originalStart: number;
    originalEnd: number;
  } | null>(null);

  const handleDragStart = (
    e: React.DragEvent,
    dayId: string,
    castId: string,
    castName: string,
    type: "start" | "end",
    originalStart: number,
    originalEnd: number,
  ) => {
    setDragging({ dayId, castId, castName, type, originalStart, originalEnd });
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", castName);
  };

  const handleDrop = async (e: React.DragEvent, targetDayId: string, targetSlot: number) => {
    e.preventDefault();
    if (!dragging || dragging.dayId !== targetDayId) {
      setDragging(null);
      return;
    }

    let newStart = dragging.originalStart;
    let newEnd = dragging.originalEnd;

    if (dragging.type === "start") {
      newStart = targetSlot;
      if (newStart >= newEnd) { setDragging(null); return; } // 無効
    } else {
      newEnd = targetSlot + 0.5;
      if (newEnd <= newStart) { setDragging(null); return; } // 無効
    }

    // APIで時間変更 + 調整記録
    await fetch("/api/shifts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "editCast",
        dayId: dragging.dayId,
        castId: dragging.castId,
        newStart,
        newEnd,
        reason: "ドラッグで時間変更",
      }),
    });

    setDragging(null);
    reload();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const days = data.shiftDays;
  const DAYS_PER_TABLE = 8;
  const TIME_COL_WIDTH = 38; // 左の時刻列（px）
  const DAY_COL_WIDTH = 46 + 46 + 14 + 38; // 出勤/退勤/人数/メモ（px）
  const TABLE_MIN_WIDTH = TIME_COL_WIDTH + DAYS_PER_TABLE * DAY_COL_WIDTH; // 全体幅を揃える（px）

  const mid = Math.min(DAYS_PER_TABLE, days.length); // 前半8日、後半は残り
  const weeks = [days.slice(0, mid), days.slice(mid)];

  const padWeek = (week: ShiftDay[]): (ShiftDay | null)[] => {
    const diff = DAYS_PER_TABLE - week.length;
    if (diff <= 0) return week;
    return [...week, ...new Array(diff).fill(null)];
  };

  return (
    <div className="space-y-8">
      {weeks.map((week, weekIdx) => {
        const weekDays = padWeek(week);
        return (
        <div key={weekIdx}>
          {/* 営業情報ボタン行（テーブルの外） */}
          <div
            className="flex no-print"
            style={{ paddingLeft: `${TIME_COL_WIDTH}px`, minWidth: `${TABLE_MIN_WIDTH}px` }}
          >
            {weekDays.map((day, idx) => (
              <div
                key={day ? day.id : `empty-${idx}`}
                className="flex-1 text-right px-0.5"
              >
                {day ? (
                  <button
                    className="text-[7px] text-blue-500 hover:text-blue-700"
                    onClick={() => setEditDay(day)}
                  >
                    営業情報
                  </button>
                ) : (
                  <div className="h-4" />
                )}
              </div>
            ))}
          </div>
          <div
            className="overflow-x-auto rounded-lg border border-gray-300 shadow-sm"
            style={{ minWidth: `${TABLE_MIN_WIDTH}px` }}
          >
          <table className="border-collapse text-xs w-full" style={{ tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "38px" }} />{/* 時間 */}
              {weekDays.map((_, i) => (
                <React.Fragment key={i}>
                  <col style={{ width: "46px" }} />{/* 出勤 */}
                  <col style={{ width: "46px" }} />{/* 退勤 */}
                  <col style={{ width: "14px" }} />{/* 人 */}
                  <col style={{ width: "38px" }} />{/* メモ */}
                </React.Fragment>
              ))}
            </colgroup>
            <thead>
              {/* 日付ヘッダー */}
              <tr>
                <th className="border-r-2 border-b border-purple-300 px-1 py-0.5 w-14 sticky left-0 bg-gradient-to-b from-purple-600 to-pink-500 text-white z-20 text-[11px]">
                </th>
                {weekDays.map((day, idx) => {
                  const isLast = idx === DAYS_PER_TABLE - 1;
                  if (!day) {
                    return (
                      <th
                        key={`empty-${idx}`}
                        colSpan={4}
                        className={`border-b border-gray-400 px-0.5 py-0.5 text-center font-bold text-[11px] relative bg-white ${!isLast ? "border-r-[3px] border-r-gray-500" : ""}`}
                      />
                    );
                  }

                  const d = new Date(day.date);
                  const dow = getJapaneseDayOfWeek(d);
                  const bg = dayHeaderBg(dow);
                  return (
                    <th
                      key={day.id}
                      colSpan={4}
                      className={`border-b border-gray-400 px-0.5 py-0.5 text-center font-bold text-[11px] relative ${bg} ${!isLast ? "border-r-[3px] border-r-gray-500" : ""}`}
                    >
                      <span>{d.getDate()}</span>
                      <span className="ml-1 text-[10px] font-normal">({dow})</span>
                      <button
                        className="absolute right-0 top-0 text-[7px] text-pink-500 hover:text-pink-700 font-bold px-0.5 no-print"
                        onClick={() => {
                          const label = `${d.getMonth() + 1}/${d.getDate()}(${dow})`;
                          setAddDialog({ dayId: day.id, dayLabel: label });
                        }}
                      >
                        追加シフト
                      </button>
                    </th>
                  );
                })}
              </tr>
              {/* サブヘッダー */}
              <tr className="bg-gray-100">
                <th className="border-r-2 border-b border-gray-300 px-0.5 py-0.5 sticky left-0 bg-gray-100 z-20 text-[9px] text-gray-500" style={{ width: "42px" }}>時間</th>
                {weekDays.map((day, dayIdx) => {
                  const isLast = dayIdx === DAYS_PER_TABLE - 1;
                  return (
                    <React.Fragment key={day ? day.id : `empty-${dayIdx}`}>
                      {/* 空列の場合も枠だけ維持する */}
                      <th className="border-b border-gray-300 px-0.5 py-0.5 text-center text-[8px] text-gray-500">{day ? "出勤" : ""}</th>
                      <th className="border-b border-gray-300 px-0.5 py-0.5 text-center text-[8px] text-gray-500">{day ? "退勤" : ""}</th>
                      <th className="border-b border-gray-300 px-0.5 py-0.5 text-center text-[8px] text-gray-500">{day ? "人" : ""}</th>
                      <th className={`border-b border-gray-300 px-0.5 py-0.5 text-center text-[8px] text-gray-500 ${!isLast ? "border-r-[3px] border-r-gray-500" : ""}`}>{day ? "メモ" : ""}</th>
                    </React.Fragment>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {TIME_SLOTS.map((slot, slotIdx) => {
                const isHourBoundary = slot % 1 === 0;
                const rowBg = timeRowBg(slot);
                const hourBorder = isHourBoundary ? "border-t border-t-gray-400" : "border-t border-t-gray-200";
                return (
                  <tr key={slot} className={rowBg} style={{ height: "28px", maxHeight: "28px" }}>
                    <td style={{ height: "28px" }} className={`border-r-[3px] border-gray-500 ${hourBorder} px-0.5 py-0 font-mono sticky left-0 z-10 text-[10px] ${isHourBoundary ? "text-center font-bold text-gray-700 bg-gray-100" : "text-right text-gray-400 bg-gray-50"}`}>
                      {isHourBoundary ? `${Math.floor(slot)}:00` : `:30`}
                    </td>
                    {weekDays.map((day, dayIdx) => {
                      const isLast = dayIdx === DAYS_PER_TABLE - 1;
                      if (!day) {
                        return (
                          <React.Fragment key={`empty-${dayIdx}`}>
                            <td
                              style={{ boxShadow: "inset 1px 0 0 #9ca3af" }}
                              className={`${hourBorder} px-0 py-0 text-[10px]`}
                            />
                            <td
                              style={{ boxShadow: "inset 1px 0 0 #d1d5db" }}
                              className={`${hourBorder} px-0 py-0 text-[10px]`}
                            />
                            <td
                              style={{ boxShadow: "inset 1px 0 0 #d1d5db", height: "28px", maxHeight: "28px", ...countStyle(0) }}
                              className={`${hourBorder} px-0 py-0 text-center font-bold text-[9px]`}
                            />
                            <td
                              style={{ boxShadow: `inset 1px 0 0 #d1d5db${!isLast ? ", inset -3px 0 0 #6b7280" : ""}`, height: "28px", maxHeight: "28px", overflow: "hidden" }}
                              className={`${hourBorder} px-0 py-0`}
                            />
                          </React.Fragment>
                        );
                      }

                      const daySlots = day.shiftSlots.filter((s) => s.timeSlot === slot);
                      const startCasts = daySlots.filter((s) => s.isStart);
                      const endCasts = daySlots.filter((s) => s.isEnd);
                      const count = daySlots.length;
                      const memos = daySlots.filter((s) => s.memo).map((s) => s.memo);

                      const hasWorking = count > 0;

                      // ドロップ判定用: ドラッグ中の同じ日かどうか
                      const isDragTarget = dragging && dragging.dayId === day.id;

                      return (
                        <React.Fragment key={day.id}>
                          {/* 出勤 */}
                          <td
                            style={{ boxShadow: "inset 1px 0 0 #9ca3af" }}
                            className={`${hourBorder} px-0 py-0 text-[10px] ${hasWorking ? "bg-amber-50/40" : ""} ${isDragTarget ? "hover:bg-blue-50" : ""}`}
                            onDragOver={handleDragOver}
                            onDrop={(e) => handleDrop(e, day.id, slot)}
                          >
                            <div style={{ height: "28px", overflow: "hidden", display: "flex", flexWrap: "wrap", alignItems: "center", padding: "0 2px" }}>
                            {startCasts.map((s) => {
                              // ヘルプ出勤: 所属店舗が現在のシフト表と異なる場合「店舗名+名前」
                              const castInfo = allCasts.find((c) => c.id === s.castId);
                              const isHelp = castInfo?.store?.name && castInfo.store.name !== data.store.name;
                              const displayName = isHelp ? `${castInfo!.store!.name}${s.cast.name}` : s.cast.name;
                              const castCount = startCasts.length;
                              const nameFontSize = castCount <= 1 ? 9 : castCount <= 2 ? 8 : castCount <= 3 ? 7 : 6;
                              const hasMemo = !!s.memo;
                              const castSlots = day.shiftSlots.filter((sl) => sl.castId === s.castId).sort((a, b) => a.timeSlot - b.timeSlot);
                              const origStart = castSlots[0]?.timeSlot ?? slot;
                              const origEnd = (castSlots[castSlots.length - 1]?.timeSlot ?? slot) + 0.5;

                              // 希望時間と現在の時間を比較して変更済みか判定（dayIdで確実にマッチ）
                              const req = data.shiftRequests?.find(
                                (r) => r.castId === s.castId && r.dayId === day.id
                              );
                              const isAdjusted = req && (req.startTime !== origStart || req.endTime !== origEnd);

                              // 色: メモあり→黄色系, 変更済み→濃い色, 通常→ピンク（インラインstyleで確実適用）
                              let tagColor: React.CSSProperties = { backgroundColor: "#fbcfe8", color: "#9d174d" }; // 通常ピンク
                              if (hasMemo && isAdjusted) {
                                tagColor = { backgroundColor: "#fed7aa", color: "#9a3412", boxShadow: "0 0 0 1px #fdba74" }; // 薄いオレンジ
                              } else if (hasMemo) {
                                tagColor = { backgroundColor: "#fef08a", color: "#713f12", boxShadow: "0 0 0 1px #facc15" }; // 黄色
                              } else if (isAdjusted) {
                                tagColor = { backgroundColor: "#ec4899", color: "#ffffff" }; // 濃いピンク
                              }

                              return (
                                <span
                                  key={s.castId}
                                  draggable
                                  onDragStart={(e) => handleDragStart(e, day.id, s.castId, s.cast.name, "start", origStart, origEnd)}
                                  style={{ ...tagColor, fontSize: `${nameFontSize}px` }}
                                  className="inline-block rounded px-1 py-0 mr-0.5 cursor-grab active:cursor-grabbing hover:shadow-sm font-medium leading-tight hover:brightness-90 whitespace-nowrap"
                                  onClick={() => {
                                    if (hasMemo) {
                                      const dd = new Date(day.date);
                                      setMemoView({
                                        castName: s.cast.name,
                                        memo: s.memo!,
                                        castId: s.castId,
                                        dayId: day.id,
                                        dayLabel: `${dd.getMonth() + 1}/${dd.getDate()}(${getJapaneseDayOfWeek(dd)})`,
                                        currentStart: origStart,
                                        currentEnd: origEnd,
                                      });
                                    } else {
                                      handleCastClick(day, s.castId, s.cast.name);
                                    }
                                  }}
                                  title={isAdjusted && req ? `変更済: ${req.startTime}→${origStart} / ${req.endTime}→${origEnd}` : hasMemo ? `メモ: ${s.memo}` : displayName}
                                >
                                  {displayName}
                                </span>
                              );
                            })}
                            </div>
                          </td>
                          {/* 退勤 */}
                          <td
                            style={{ boxShadow: "inset 1px 0 0 #d1d5db" }}
                            className={`${hourBorder} px-0 py-0 text-[10px] ${hasWorking ? "bg-amber-50/40" : ""} ${isDragTarget ? "hover:bg-blue-50" : ""}`}
                            onDragOver={handleDragOver}
                            onDrop={(e) => handleDrop(e, day.id, slot)}
                          >
                            <div style={{ height: "28px", overflow: "hidden", display: "flex", flexWrap: "wrap", alignItems: "center", padding: "0 2px" }}>
                            {endCasts.map((s) => {
                              const endCastInfo = allCasts.find((c) => c.id === s.castId);
                              const endIsHelp = endCastInfo?.store?.name && endCastInfo.store.name !== data.store.name;
                              const endDisplayName = endIsHelp ? `${endCastInfo!.store!.name}${s.cast.name}` : s.cast.name;
                              const endCastCount = endCasts.length;
                              const endNameFontSize = endCastCount <= 1 ? 9 : endCastCount <= 2 ? 8 : endCastCount <= 3 ? 7 : 6;
                              const castSlots = day.shiftSlots.filter((sl) => sl.castId === s.castId).sort((a, b) => a.timeSlot - b.timeSlot);
                              const origStart = castSlots[0]?.timeSlot ?? slot;
                              const origEnd = (castSlots[castSlots.length - 1]?.timeSlot ?? slot) + 0.5;

                              // 退勤時間が希望から変更されているか判定（dayIdで確実にマッチ）
                              const req = data.shiftRequests?.find(
                                (r) => r.castId === s.castId && r.dayId === day.id
                              );
                              if (req && hideEndCastNameForWishEnd29(req.endTime)) {
                                return null;
                              }
                              const isEndAdjusted = req && req.endTime !== origEnd;
                              const endColor: React.CSSProperties = isEndAdjusted
                                ? { backgroundColor: "#6b7280", color: "#ffffff" }
                                : { backgroundColor: "#e5e7eb", color: "#4b5563" };

                              return (
                              <span
                                key={s.castId}
                                draggable
                                onDragStart={(e) => handleDragStart(e, day.id, s.castId, s.cast.name, "end", origStart, origEnd)}
                                style={{ ...endColor, fontSize: `${endNameFontSize}px` }}
                                className="inline-block rounded px-1 py-0 mr-0.5 cursor-grab active:cursor-grabbing leading-tight hover:brightness-90 whitespace-nowrap"
                                title={isEndAdjusted && req ? `退勤変更: ${formatTimeSlot(req.endTime)}→${formatTimeSlot(origEnd)}` : endDisplayName}
                                onClick={() => handleCastClick(day, s.castId, s.cast.name)}
                              >
                                {endDisplayName}
                              </span>
                              );
                            })}
                            </div>
                          </td>
                          {/* 人数（グラデーション） */}
                          <td style={{ boxShadow: "inset 1px 0 0 #d1d5db", height: "28px", maxHeight: "28px", ...countStyle(count) }} className={`${hourBorder} px-0 py-0 text-center font-bold text-[9px]`}>
                            {count || ""}
                          </td>
                          {/* 管理者メモ（直接入力可能） */}
                          <td style={{ boxShadow: `inset 1px 0 0 #d1d5db${!isLast ? ", inset -3px 0 0 #6b7280" : ""}`, height: "28px", maxHeight: "28px", overflow: "hidden" }} className={`${hourBorder} px-0 py-0 ${hasWorking ? "bg-amber-50/40" : ""}`}>
                            <SlotMemoInput dayId={day.id} timeSlot={slot} notes={day.notes} />
                          </td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                );
              })}

              {/* 集計1行目: 予算 | 時間 | 社員 */}
              <tr className="bg-emerald-50 border-t-[3px] border-gray-500">
                <td className="border-r-[3px] border-gray-500 px-0.5 py-0.5 text-[7px] sticky left-0 bg-emerald-50 z-10 whitespace-nowrap">
                  <span className="text-emerald-800 font-bold">予算</span><span className="text-sky-700 font-bold">/時間</span>
                </td>
                {weekDays.map((day, dayIdx) => {
                  const isLast = dayIdx === DAYS_PER_TABLE - 1;
                  if (!day) {
                    return (
                      <React.Fragment key={`empty-${dayIdx}`}>
                        <td className="px-0.5 py-0.5 text-[9px] font-bold text-emerald-800 whitespace-nowrap" />
                        <td colSpan={2} className="px-0.5 py-0.5 text-[9px] font-bold text-sky-700 whitespace-nowrap" />
                        <td className={`px-0.5 py-0.5 text-[8px] text-purple-700 whitespace-nowrap ${!isLast ? "border-r-[3px] border-r-gray-500" : ""}`} />
                      </React.Fragment>
                    );
                  }

                  const budget = day.targetBudget;
                  const totalHours = day.shiftSlots.length * 0.5;
                  return (
                    <React.Fragment key={day.id}>
                      <td className="px-0.5 py-0.5 text-[9px] font-bold text-emerald-800 whitespace-nowrap cursor-pointer hover:bg-emerald-100" onClick={() => setEditDay(day)}>
                        {budget ? budget.toLocaleString() : "-"}
                      </td>
                      <td colSpan={2} className="px-0.5 py-0.5 text-[9px] font-bold text-sky-700 whitespace-nowrap">
                        {totalHours || "-"}
                      </td>
                      <td className={`px-0.5 py-0.5 text-[8px] text-purple-700 whitespace-nowrap cursor-pointer hover:bg-purple-100 ${!isLast ? "border-r-[3px] border-r-gray-500" : ""}`}
                        onClick={() => {
                          const dd = new Date(day.date);
                          setEditField({ dayId: day.id, dayLabel: `${dd.getMonth()+1}/${dd.getDate()}(${getJapaneseDayOfWeek(dd)})`, field: "eventName", label: "企画名", value: day.eventName || "" });
                        }}
                      >
                        {day.eventName || "-"}
                      </td>
                    </React.Fragment>
                  );
                })}
              </tr>
              {/* 社員 */}
              <tr className="bg-orange-50">
                <td className="border-r-[3px] border-gray-500 px-0.5 py-0.5 text-[8px] font-bold sticky left-0 bg-orange-50 z-10 text-orange-800 whitespace-nowrap">社員</td>
                {weekDays.map((day, dayIdx) => {
                  const isLast = dayIdx === DAYS_PER_TABLE - 1;
                  if (!day) {
                    return (
                      <td key={`empty-${dayIdx}`} colSpan={4} className={`px-0.5 py-0.5 text-[8px] text-orange-800 whitespace-nowrap ${!isLast ? "border-r-[3px] border-r-gray-500" : ""}`} />
                    );
                  }
                  return (
                    <td key={day.id} colSpan={4} className={`px-0.5 py-0.5 text-[8px] text-orange-800 whitespace-nowrap cursor-pointer hover:bg-orange-100 ${!isLast ? "border-r-[3px] border-r-gray-500" : ""}`}
                      onClick={() => {
                        const dd = new Date(day.date);
                        setEditField({ dayId: day.id, dayLabel: `${dd.getMonth()+1}/${dd.getDate()}(${getJapaneseDayOfWeek(dd)})`, field: "employeeOnDuty", label: "社員", value: day.employeeOnDuty || "" });
                      }}
                    >
                      {day.employeeOnDuty || "-"}
                    </td>
                  );
                })}
              </tr>
              {/* 来店予定 */}
              <tr>
                <td className="border-r-[3px] border-gray-500 px-0.5 py-0.5 text-[8px] sticky left-0 bg-white z-10 text-gray-600 whitespace-nowrap">来店予定</td>
                {weekDays.map((day, dayIdx) => {
                  const isLast = dayIdx === DAYS_PER_TABLE - 1;
                  if (!day) {
                    return (
                      <td key={`empty-${dayIdx}`} colSpan={4} className={`px-0.5 py-0.5 text-[8px] text-gray-600 whitespace-nowrap ${!isLast ? "border-r-[3px] border-r-gray-500" : ""}`} />
                    );
                  }
                  return (
                    <td key={day.id} colSpan={4} className={`px-0.5 py-0.5 text-[8px] text-gray-600 whitespace-nowrap cursor-pointer hover:bg-gray-100 ${!isLast ? "border-r-[3px] border-r-gray-500" : ""}`}
                      onClick={() => {
                        const dd = new Date(day.date);
                        setEditField({ dayId: day.id, dayLabel: `${dd.getMonth()+1}/${dd.getDate()}(${getJapaneseDayOfWeek(dd)})`, field: "expectedVisitors", label: "来店予定", value: day.expectedVisitors || "" });
                      }}
                    >
                      {day.expectedVisitors || "-"}
                    </td>
                  );
                })}
              </tr>
              <tr>
                <td className="border-r-[3px] border-gray-500 px-0.5 py-0.5 text-[8px] sticky left-0 bg-white z-10 text-gray-600 whitespace-nowrap">備考</td>
                {weekDays.map((day, dayIdx) => {
                  const isLast = dayIdx === DAYS_PER_TABLE - 1;
                  if (!day) {
                    return (
                      <td key={`empty-${dayIdx}`} colSpan={4} className={`px-1 py-0.5 text-[9px] text-gray-600 ${!isLast ? "border-r-[3px] border-r-gray-500" : ""}`} />
                    );
                  }
                  return (
                    <td key={day.id} colSpan={4} className={`px-1 py-0.5 text-[9px] text-gray-600 cursor-pointer hover:bg-gray-100 ${!isLast ? "border-r-[3px] border-r-gray-500" : ""}`}
                      onClick={() => {
                        const dd = new Date(day.date);
                        let notesVal = "";
                        if (day.notes) { try { notesVal = JSON.parse(day.notes).text || ""; } catch { notesVal = day.notes; } }
                        setEditField({ dayId: day.id, dayLabel: `${dd.getMonth()+1}/${dd.getDate()}(${getJapaneseDayOfWeek(dd)})`, field: "notes", label: "備考", value: notesVal });
                      }}
                    >
                      {(() => {
                        let notesText = "-";
                        if (day.notes) {
                          try {
                            const parsed = JSON.parse(day.notes);
                            notesText = parsed.text || "-";
                          } catch {
                            notesText = day.notes;
                          }
                        }
                        const helps = data.helpInfo?.[day.id];
                        return (
                          <div>
                            {helps && helps.length > 0 && (
                              <div className="text-orange-600 font-medium">
                                {helps.map((h, i) => (
                                  <div key={i}>{h.castName} → {h.storeName}（{formatTimeSlot(h.startTime)}〜{formatTimeSlot(h.endTime)}）</div>
                                ))}
                              </div>
                            )}
                            {notesText !== "-" && <div>{notesText}</div>}
                            {!helps?.length && notesText === "-" && "-"}
                          </div>
                        );
                      })()}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
          </div>
        </div>
      );
      })}

      {addDialog && (
        <CastAddDialog
          dayId={addDialog.dayId}
          dayLabel={addDialog.dayLabel}
          allCasts={allCasts}
          currentStoreName={data.store.name}
          existingSlots={
            data.shiftDays.find((d) => d.id === addDialog.dayId)?.shiftSlots.map((s) => s.castId) ?? []
          }
          onClose={() => setAddDialog(null)}
          onSaved={reload}
        />
      )}
      {editDay && <DayInfoEditor day={editDay} onClose={() => setEditDay(null)} onSaved={reload} />}
      {editTarget && (
        <CastEditModal
          dayId={editTarget.dayId}
          dayLabel={editTarget.dayLabel}
          castId={editTarget.castId}
          castName={editTarget.castName}
          currentStart={editTarget.currentStart}
          currentEnd={editTarget.currentEnd}
          memo={editTarget.memo}
          periodId={data.id}
          onClose={() => setEditTarget(null)}
          onSaved={reload}
        />
      )}
      {memoView && (
        <MemoViewModal
          memoView={memoView}
          shiftRequests={data.shiftRequests}
          onClose={() => setMemoView(null)}
          onEdit={() => {
            setMemoView(null);
            setEditTarget({
              dayId: memoView.dayId,
              dayLabel: memoView.dayLabel,
              castId: memoView.castId,
              castName: memoView.castName,
              currentStart: memoView.currentStart,
              currentEnd: memoView.currentEnd,
              memo: memoView.memo,
            });
          }}
        />
      )}
      {editField && (
        <FieldEditModal
          dayId={editField.dayId}
          dayLabel={editField.dayLabel}
          field={editField.field}
          label={editField.label}
          initialValue={editField.value}
          onClose={() => setEditField(null)}
          onSaved={reload}
        />
      )}
    </div>
  );
}

// 個別フィールド編集モーダル
function FieldEditModal({
  dayId, dayLabel, field, label, initialValue, onClose, onSaved,
}: {
  dayId: string;
  dayLabel: string;
  field: "employeeOnDuty" | "expectedVisitors" | "notes" | "eventName";
  label: string;
  initialValue: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const updateData: Record<string, unknown> = {};
    if (field === "notes") {
      // notesの更新はupdateNotesText専用アクションで処理
      await fetch("/api/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "updateNotesText", dayId, text: value || "" }),
      });
      setSaving(false);
      onSaved();
      onClose();
      return;
    } else {
      updateData[field] = value || null;
    }
    await fetch("/api/shifts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "updateDay",
        dayId,
        ...updateData,
      }),
    });
    setSaving(false);
    onSaved();
    onClose();
  };

  return (
    <Modal open title={`${dayLabel} - ${label}`} onClose={onClose}>
      <div className="space-y-3">
        <div className="space-y-1">
          <Label>{label}</Label>
          <input
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={`${label}を入力`}
            autoFocus
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-4 pt-3 border-t">
        <Button variant="outline" onClick={onClose}>キャンセル</Button>
        <Button onClick={handleSave} disabled={saving} className="bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white">
          {saving ? "保存中..." : "保存"}
        </Button>
      </div>
    </Modal>
  );
}

// メモ確認モーダル（希望時間・現在時間・メモを表示）
function MemoViewModal({
  memoView,
  shiftRequests,
  onClose,
  onEdit,
}: {
  memoView: {
    castName: string;
    memo: string;
    castId: string;
    dayId: string;
    dayLabel: string;
    currentStart: number;
    currentEnd: number;
  };
  shiftRequests?: ShiftRequestInfo[];
  onClose: () => void;
  onEdit: () => void;
}) {
  // このキャスト・この日の希望情報を取得
  // dayLabelは "4/1(水)" 形式。requestのdateからも同形式を生成して比較
  const req = shiftRequests?.find((r) => {
    if (r.castId !== memoView.castId) return false;
    // UTC日付文字列をパースして月/日を取得（タイムゾーンずれ回避）
    const parts = r.date.slice(0, 10).split("-");
    const m = parseInt(parts[1]);
    const d = parseInt(parts[2]);
    const label = `${m}/${d}`;
    return memoView.dayLabel.includes(label);
  });

  const hasChanged = req && (req.startTime !== memoView.currentStart || req.endTime !== memoView.currentEnd);

  return (
    <Modal open title={`${memoView.castName} - ${memoView.dayLabel}`} onClose={onClose}>
      <div className="space-y-3 mb-4">
        {/* シフト希望（提出時） */}
        {req ? (
          <div className="bg-blue-50 border border-blue-200 rounded-md p-2.5 space-y-1">
            <div className="text-[11px] font-bold text-blue-700">シフト希望（提出時）</div>
            <div className="text-sm text-blue-800">
              {formatTimeSlot(req.startTime)} 〜 {formatTimeSlot(req.endTime)}
              <span className="text-xs text-blue-600 ml-1">（{req.endTime - req.startTime}h）</span>
            </div>
          </div>
        ) : (
          <div className="text-xs text-gray-400 bg-gray-50 rounded p-2">シフト希望の登録なし</div>
        )}

        {/* 現在のシフト */}
        <div className={`rounded-md p-2.5 space-y-1 ${hasChanged ? "bg-orange-50 border border-orange-200" : "bg-gray-50 border border-gray-200"}`}>
          <div className="text-[11px] font-bold text-gray-700">
            現在のシフト
            {hasChanged && <span className="text-orange-600 ml-1">（希望から変更済）</span>}
          </div>
          <div className="text-sm text-gray-800">
            {formatTimeSlot(memoView.currentStart)} 〜 {formatTimeSlot(memoView.currentEnd)}
            <span className="text-xs text-gray-500 ml-1">（{memoView.currentEnd - memoView.currentStart}h）</span>
          </div>
          {hasChanged && req && (
            <div className="text-[10px] text-orange-600">
              差分: 出勤 {req.startTime !== memoView.currentStart ? `${formatTimeSlot(req.startTime)}→${formatTimeSlot(memoView.currentStart)}` : "変更なし"}
              {" / "}退勤 {req.endTime !== memoView.currentEnd ? `${formatTimeSlot(req.endTime)}→${formatTimeSlot(memoView.currentEnd)}` : "変更なし"}
            </div>
          )}
        </div>

        {/* 希望メモ */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-2.5">
          <div className="text-[11px] font-bold text-yellow-800">希望メモ</div>
          <div className="text-sm text-yellow-900">{memoView.memo}</div>
        </div>
      </div>

      <div className="flex justify-between pt-3 border-t">
        <button className="text-xs text-blue-600 hover:text-blue-800" onClick={onEdit}>
          シフトを編集/削除
        </button>
        <Button variant="outline" onClick={onClose}>閉じる</Button>
      </div>
    </Modal>
  );
}

// 管理者メモ（スロット単位インライン入力）
function SlotMemoInput({ dayId, timeSlot, notes }: { dayId: string; timeSlot: number; notes: string | null }) {
  // notesからslotMemosを取得
  let slotMemos: Record<string, string> = {};
  try {
    const parsed = notes ? JSON.parse(notes) : {};
    slotMemos = parsed.slotMemos || {};
  } catch { /* notesが通常テキストの場合は無視 */ }

  const currentMemo = slotMemos[timeSlot.toString()] || "";
  const [value, setValue] = useState(currentMemo);
  const [dirty, setDirty] = useState(false);

  const save = async () => {
    if (value === currentMemo) { setDirty(false); return; }
    await fetch("/api/shifts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "updateSlotMemo", dayId, timeSlot, memo: value }),
    });
    setDirty(false);
  };

  // 文字数に応じてフォントサイズ自動調整 + 折り返し
  const len = value.length;
  const fontSize = len <= 4 ? 9 : len <= 8 ? 8 : len <= 14 ? 7 : len <= 20 ? 6 : 5;
  const bgColor = value ? "#dcfce7" : dirty ? "#fefce8" : "transparent";

  return (
    <textarea
      style={{
        backgroundColor: bgColor,
        fontSize: `${fontSize}px`,
        lineHeight: "1.2",
        height: "28px",
        resize: "none",
        wordBreak: "break-all",
      }}
      className={`w-full border-0 px-0.5 py-0 outline-none overflow-hidden ${value ? "text-gray-700" : "text-gray-300"}`}
      value={value}
      placeholder=""
      onChange={(e) => {
        setValue(e.target.value);
        setDirty(true);
      }}
      onBlur={() => {
        save();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    />
  );
}
