"use client";

import React, { useState, useMemo } from "react";
import { TIME_SLOTS, formatTimeSlot, getJapaneseDayOfWeek } from "@/lib/shift-utils";

type ShiftSlot = {
  id: string;
  timeSlot: number;
  castId: string;
  cast: { id: string; name: string };
  isStart: boolean;
  isEnd: boolean;
  memo: string | null;
};
type Day = {
  id: string;
  date: string;
  dayOfWeek: string;
  shiftSlots: ShiftSlot[];
};
type Cast = { id: string; name: string; storeName: string | null };
type Adjustment = {
  id: string;
  dayId: string;
  castId: string;
  originalStart: number;
  originalEnd: number;
  adjustedStart: number | null;
  adjustedEnd: number | null;
  action: string;
  reason: string | null;
  cast: { id: string; name: string; store: { name: string } | null };
  day: { id: string; date: string; dayOfWeek: string };
};
type ShiftRequest = {
  castId: string;
  dayId: string | null;
  startTime: number;
  endTime: number;
};

type RemoteHelpShift = {
  localDayId: string;
  castId: string;
  startTime: number;
  endTime: number;
  remoteStoreName: string;
};

type Props = {
  periodId: string;
  month: number;
  days: Day[];
  initialAdjustments: Adjustment[];
  shiftRequests: ShiftRequest[];
  /** 自店舗日付に紐づく「他店で実際に入っているシフト」（確定列に店名付きで出す） */
  remoteHelpShifts?: RemoteHelpShift[];
  adjustedCasts: Cast[];
  allCasts: Cast[];
  /** false のとき「確定」列は空（希望列のみ比較表示） */
  showConfirmedShiftColumn: boolean;
};

function dayHeaderBg(dow: string): string {
  if (dow === "土") return "bg-sky-200 text-sky-800";
  if (dow === "日" || dow === "祝") return "bg-pink-200 text-pink-800";
  return "bg-purple-100/60 text-purple-800";
}

type CurrentShiftInfo = {
  startTime: number;
  endTime: number;
  /** 他店ヘルプのとき確定列に併記 */
  remoteStoreName?: string;
};

export function AdjustmentTable({
  periodId,
  month,
  days,
  initialAdjustments,
  shiftRequests,
  remoteHelpShifts = [],
  adjustedCasts,
  allCasts,
  showConfirmedShiftColumn,
}: Props) {
  const [selectedCast, setSelectedCast] = useState(adjustedCasts[0]?.id || "");
  const adjustments = initialAdjustments;

  // 選択キャストの調整データ
  const castAdjs = useMemo(() => {
    return adjustments.filter((a) => a.castId === selectedCast);
  }, [adjustments, selectedCast]);

  // 選択キャストの希望データ（dayId でマッピング。同一 dayId の重複は先勝ち＝サーバーで自店優先済み）
  const castRequests = useMemo(() => {
    const map = new Map<string, { startTime: number; endTime: number }>();
    for (const r of shiftRequests) {
      if (r.castId !== selectedCast || !r.dayId) continue;
      if (!map.has(r.dayId)) map.set(r.dayId, { startTime: r.startTime, endTime: r.endTime });
    }
    return map;
  }, [shiftRequests, selectedCast]);

  // 確定は「実際に入っている勤務」。他店ヘルプがある日は自店にスロットが残っていても他店の実勤務を優先する
  const castCurrentShifts = useMemo(() => {
    const map = new Map<string, CurrentShiftInfo>();
    for (const day of days) {
      const remote = remoteHelpShifts.find(
        (r) => r.castId === selectedCast && r.localDayId === day.id,
      );
      if (remote) {
        map.set(day.id, {
          startTime: remote.startTime,
          endTime: remote.endTime,
          remoteStoreName: remote.remoteStoreName,
        });
        continue;
      }
      const castSlots = day.shiftSlots
        .filter((s) => s.castId === selectedCast)
        .sort((a, b) => a.timeSlot - b.timeSlot);
      if (castSlots.length > 0) {
        map.set(day.id, {
          startTime: castSlots[0].timeSlot,
          endTime: castSlots[castSlots.length - 1].timeSlot + 0.5,
        });
      }
    }
    return map;
  }, [days, selectedCast, remoteHelpShifts]);

  // 選択キャストの調整データ（dayIdでマッピング）
  const adjByDay = useMemo(() => {
    const map = new Map<string, Adjustment[]>();
    castAdjs.forEach((a) => {
      if (!map.has(a.dayId)) map.set(a.dayId, []);
      map.get(a.dayId)!.push(a);
    });
    return map;
  }, [castAdjs]);

  const castName = adjustedCasts.find((c) => c.id === selectedCast)?.name || "";

  // 8日ずつ分割
  const mid = Math.min(8, days.length);
  const weeks = [days.slice(0, mid), days.slice(mid)];

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
            {adjustedCasts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}{c.storeName ? ` (${c.storeName})` : ""}
              </option>
            ))}
          </select>
        </div>
        <span className="shrink-0 whitespace-nowrap text-[10px] text-gray-500 sm:text-sm">
          調整: {castAdjs.filter((a) => a.action !== "cut" && a.action !== "help").length}件
          {" / "}ヘルプ: {castAdjs.filter((a) => a.action === "help").length}件
          {" / "}削除: {castAdjs.filter((a) => a.action === "cut").length}件
        </span>
      </div>

      {/* シフト表形式の差分表示 */}
      {weeks.map((week, weekIdx) => {
        if (week.length === 0) return null;
        return (
          <div key={weekIdx} className="overflow-x-auto rounded-lg border border-gray-300 shadow-sm">
            <table className="border-collapse text-xs w-full" style={{ tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "38px" }} />
                {week.map((_, i) => (
                  <React.Fragment key={i}>
                    <col style={{ width: "60px" }} />{/* 希望 */}
                    <col style={{ width: "60px" }} />{/* 確定 */}
                  </React.Fragment>
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th className="border-r-[3px] border-b border-gray-500 px-1 py-0.5 sticky left-0 bg-gradient-to-b from-purple-600 to-pink-500 text-white z-20 text-[10px]">
                  </th>
                  {week.map((day, idx) => {
                    const d = new Date(day.date);
                    const dow = getJapaneseDayOfWeek(d);
                    const bg = dayHeaderBg(dow);
                    const isLast = idx === week.length - 1;
                    return (
                      <th
                        key={day.id}
                        colSpan={2}
                        className={`border-b border-gray-400 px-0.5 py-0.5 text-center font-bold text-[11px] ${bg} ${!isLast ? "border-r-[3px] border-r-gray-500" : ""}`}
                      >
                        {d.getDate()}({dow})
                      </th>
                    );
                  })}
                </tr>
                <tr className="bg-gray-100">
                  <th className="border-r-[3px] border-b border-gray-300 px-0.5 py-0.5 sticky left-0 bg-gray-100 z-20 text-[8px] text-gray-500">時間</th>
                  {week.map((day, dayIdx) => {
                    const isLast = dayIdx === week.length - 1;
                    return (
                      <React.Fragment key={day.id}>
                        <th className="border-b border-gray-300 px-0.5 py-0.5 text-center text-[8px] text-blue-600 bg-blue-50">希望</th>
                        <th className={`border-b border-gray-300 px-0.5 py-0.5 text-center text-[8px] text-pink-600 bg-pink-50 ${!isLast ? "border-r-[3px] border-r-gray-500" : ""}`}>確定</th>
                      </React.Fragment>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {TIME_SLOTS.map((slot) => {
                  const isHourBoundary = slot % 1 === 0;
                  const hourBorder = isHourBoundary ? "border-t border-t-gray-400" : "border-t border-t-gray-200";

                  return (
                    <tr key={slot} style={{ height: "20px" }}>
                      <td className={`border-r-[3px] border-gray-500 ${hourBorder} px-0.5 py-0 font-mono sticky left-0 z-10 text-[10px] ${isHourBoundary ? "text-center font-bold text-gray-700 bg-gray-100" : "text-right text-gray-400 bg-gray-50"}`}>
                        {isHourBoundary ? `${Math.floor(slot)}:00` : `:30`}
                      </td>
                      {week.map((day, dayIdx) => {
                        const isLast = dayIdx === week.length - 1;
                        const req = castRequests.get(day.id);
                        const current = castCurrentShifts.get(day.id);
                        const dayAdj = adjByDay.get(day.id);
                        const isCut = dayAdj?.some((a) => a.action === "cut");
                        const isHelp = dayAdj?.some((a) => a.action === "help");

                        // 希望セル: この時間が希望範囲内か
                        const inRequest = req && slot >= req.startTime && slot < req.endTime;
                        // 確定セル: この時間が現在のシフト範囲内か（他店ヘルプは remote の時間帯）
                        const inCurrent = current && slot >= current.startTime && slot < current.endTime;

                        // 希望セルの色
                        let reqBg = "";
                        if (inRequest && isHelp) {
                          reqBg = "bg-orange-100";
                        } else if (inRequest && isCut) {
                          reqBg = "bg-red-100"; // 削除された希望
                        } else if (inRequest) {
                          reqBg = "bg-blue-100";
                        }

                        // 確定セルの色。カットのみ空。帯は希望列と同様に inCurrent で塗る（公開後は希望との一致で濃淡）
                        let curBg = "";
                        if (isCut) {
                          curBg = "";
                        } else if (inCurrent) {
                          if (showConfirmedShiftColumn && !inRequest) {
                            curBg = "bg-pink-200";
                          } else {
                            curBg = "bg-pink-100";
                          }
                        }

                        // 出勤/退勤マーク
                        const isReqStart = inRequest && req && slot === req.startTime;
                        const isReqEnd = inRequest && req && slot + 0.5 >= req.endTime;
                        const isCurStart = inCurrent && current && slot === current.startTime;
                        const isCurEnd = inCurrent && current && slot + 0.5 >= current.endTime;
                        const isRemoteHelpRow = Boolean(current?.remoteStoreName);
                        /** 公開前でも「他店での実勤務」は調整一覧で見える（色付き帯は上記 inCurrent） */
                        const showConfirmedText = Boolean(current);

                        return (
                          <React.Fragment key={day.id}>
                            {/* 希望セル */}
                            <td className={`${hourBorder} px-0.5 py-0 text-[8px] text-center align-top ${reqBg}`} style={{ boxShadow: "inset 1px 0 0 #d1d5db" }}>
                              {isReqStart && <span className="text-blue-700 font-bold">{formatTimeSlot(req!.startTime)}</span>}
                              {isReqEnd && !isReqStart && <span className="text-blue-500">{formatTimeSlot(req!.endTime)}</span>}
                              {inRequest && !isReqStart && !isReqEnd && <span className="text-blue-300">│</span>}
                              {isCut && isReqStart && <span className="line-through text-red-400 ml-0.5">削除</span>}
                              {isHelp && isReqStart && !isCut && (
                                <span className="text-orange-600 ml-0.5">ヘルプ</span>
                              )}
                            </td>
                            {/* 確定セル：他店ヘルプは参考画像どおり「開始時刻 → 改行 → 店名」＋帯内に縦線＋終了時刻 */}
                            <td
                              className={`${hourBorder} px-0.5 py-0 text-[8px] text-center align-top ${curBg} ${!isLast ? "border-r-[3px] border-r-gray-500" : ""}`}
                            >
                              {showConfirmedText && isCurStart && isRemoteHelpRow && current && (
                                <span className="inline-flex flex-col items-center gap-0 leading-[1.05]">
                                  <span className="font-bold text-rose-700">{formatTimeSlot(current.startTime)}</span>
                                  <span className="text-[10.5px] font-semibold leading-none text-rose-700">{current.remoteStoreName}</span>
                                </span>
                              )}
                              {showConfirmedText && isCurStart && !isRemoteHelpRow && current && (
                                <span className="font-bold text-rose-700">{formatTimeSlot(current.startTime)}</span>
                              )}
                              {showConfirmedText && isCurEnd && !isCurStart && current && (
                                <span className="text-rose-600">{formatTimeSlot(current.endTime)}</span>
                              )}
                              {showConfirmedText && inCurrent && !isCurStart && !isCurEnd && (
                                <span className="text-rose-300">│</span>
                              )}
                              {showConfirmedShiftColumn && isCut && inRequest && !inCurrent && (
                                <span className="text-red-400">×</span>
                              )}
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}

      {/* テキスト形式の調整詳細 */}
      {castAdjs.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-bold text-purple-700 mb-2">{castName} の調整詳細</h3>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-3 py-1.5 text-left">日付</th>
                <th className="border border-gray-300 px-3 py-1.5 text-center">希望時間</th>
                <th className="border border-gray-300 px-3 py-1.5 text-center">アクション</th>
                <th className="border border-gray-300 px-3 py-1.5 text-center">調整後</th>
                <th className="border border-gray-300 px-3 py-1.5 text-left">理由</th>
              </tr>
            </thead>
            <tbody>
              {castAdjs.map((a) => {
                const d = new Date(a.day.date);
                const dateStr = `${d.getMonth() + 1}/${d.getDate()}(${getJapaneseDayOfWeek(d)})`;
                const remote =
                  a.action === "help"
                    ? remoteHelpShifts.find(
                        (r) => r.castId === a.castId && r.localDayId === a.dayId,
                      )
                    : undefined;
                const actionLabel =
                  a.action === "cut"
                    ? "カット"
                    : a.action === "shorten"
                      ? "短縮"
                      : a.action === "help"
                        ? "ヘルプ"
                        : "時間変更";
                const actionClass =
                  a.action === "cut"
                    ? "bg-red-100 text-red-700"
                    : a.action === "shorten"
                      ? "bg-yellow-100 text-yellow-700"
                      : a.action === "help"
                        ? "bg-orange-100 text-orange-800"
                        : "bg-blue-100 text-blue-700";
                const afterText =
                  a.action === "cut"
                    ? "削除"
                    : a.action === "help" && remote
                      ? `${formatTimeSlot(remote.startTime)}–${formatTimeSlot(remote.endTime)}（${remote.remoteStoreName}）`
                      : a.action === "help"
                        ? a.reason || "他店へ出勤"
                        : a.adjustedStart !== null && a.adjustedEnd !== null
                          ? `${formatTimeSlot(a.adjustedStart)} - ${formatTimeSlot(a.adjustedEnd)}`
                          : "-";
                return (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="border border-gray-300 px-3 py-1.5">{dateStr}</td>
                    <td className="border border-gray-300 px-3 py-1.5 text-center">
                      {formatTimeSlot(a.originalStart)} - {formatTimeSlot(a.originalEnd)}
                    </td>
                    <td className="border border-gray-300 px-3 py-1.5 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${actionClass}`}>
                        {actionLabel}
                      </span>
                    </td>
                    <td className="border border-gray-300 px-3 py-1.5 text-center">{afterText}</td>
                    <td className="border border-gray-300 px-3 py-1.5 text-xs text-gray-500">{a.reason || ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {adjustedCasts.length === 0 && (
        <div className="border border-gray-300 rounded-md px-3 py-8 text-center text-gray-400">
          調整されたキャストはまだいません
        </div>
      )}
    </div>
  );
}
