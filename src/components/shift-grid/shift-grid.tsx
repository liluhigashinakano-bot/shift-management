"use client";

import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  TIME_SLOTS,
  displaySlotForClockOut,
  findShiftRequestByDayId,
  formatTimeSlot,
  getJapaneseDayOfWeek,
  hideEndCastNameForWishEnd29,
  toUtcDateKey,
} from "@/lib/shift-utils";
import { CastAddDialog } from "./cast-add-dialog";
import { CastEditModal } from "./cast-edit-modal";
import { DayInfoEditor } from "./day-info-editor";
import { Modal } from "@/components/modal";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ShiftPrintStyles } from "./shift-print-styles";
import { AutoFitText } from "./auto-fit-text";

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
  status?: string;
  createdAt?: string;
  updatedAt?: string;
};
type Period = {
  id: string;
  year: number;
  month: number;
  half: string;
  store: { id: string; name: string };
  shiftDays: ShiftDay[];
  shiftRequestsLocked?: boolean;
  /** true のときシフト表の追加・変更不可 */
  shiftSlotsLocked?: boolean;
  /** true のときシフト確定済み（締切と同様に表・希望・調整系をロック） */
  adjustmentConfirmedPublished?: boolean;
  shiftRequests?: ShiftRequestInfo[];
  helpInfo?: Record<
    string,
    | { castName: string; storeName: string; startTime: number; endTime: number }[]
    | { castId: string; castName: string; storeName: string; startTime: number; endTime: number }[]
  >;
};

type Props = {
  initialData: Period;
  allCasts: { id: string; name: string; store: { name: string } | null }[];
  /** 閲覧者など: 編集・追加・ドラッグ不可（締切と同様の扱い） */
  readOnly?: boolean;
  /** 管理者・従業員: キャスト向けの希望/表の締切は無視（シフト確定ロックと readOnly のみ制限） */
  bypassShiftPeriodLocks?: boolean;
};

type EditTarget = {
  dayId: string;
  dayLabel: string;
  /** UTC ベースの YYYY-MM-DD（cast-edit-modal 内のシフト希望マッチに使用） */
  dayDateIso: string;
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

/** 印刷プレビュー用：1〜8日・9〜15日・16〜23日・24〜31日のブロックに分割 */
const PRINT_CALENDAR_RANGES: readonly [number, number][] = [
  [1, 8],
  [9, 15],
  [16, 23],
  [24, 31],
];

function chunkShiftDaysByCalendarPrint(days: ShiftDay[]): ShiftDay[][] {
  const chunks: ShiftDay[][] = [];
  for (const [lo, hi] of PRINT_CALENDAR_RANGES) {
    const chunk = days.filter((d) => {
      const dom = new Date(d.date).getDate();
      return dom >= lo && dom <= hi;
    });
    if (chunk.length > 0) chunks.push(chunk);
  }
  return chunks;
}

/** 46px 出勤・退勤列の内側幅（div の横パディング除く） */
const CLOCK_COL_INNER_PX = 42;

/**
 * タグ1つに割り当てられた幅（px）と表示文字列からフォントサイズを決める（キャスト名ごと）
 */
function castNameTagFontSizePx(displayName: string, widthBudgetPx: number): number {
  const chars = Array.from(displayName).length;
  if (chars < 1) return 9;
  // 表示側: 5文字超は px-0.5、それ以下は px-1
  const spanPad = chars > 4 ? 4 : 8;
  const textWidth = Math.max(8, widthBudgetPx - spanPad);
  const raw = Math.floor((textWidth / chars) * 1.22);
  return Math.max(4, Math.min(10, raw));
}

/** サーバーから変わったときだけ grid state を差し替える（ロック解除後の再描画用） */
function periodLockSignature(p: Period): string {
  return [
    p.id,
    Boolean(p.adjustmentConfirmedPublished),
    Boolean(p.shiftSlotsLocked),
    Boolean(p.shiftRequestsLocked),
  ].join("|");
}

export function ShiftGrid({
  initialData,
  allCasts,
  readOnly = false,
  bypassShiftPeriodLocks = false,
}: Props) {
  const [data, setData] = useState(initialData);
  const lockSigRef = useRef(periodLockSignature(initialData));

  useEffect(() => {
    const next = periodLockSignature(initialData);
    if (next !== lockSigRef.current) {
      lockSigRef.current = next;
      setData(initialData);
    }
  }, [initialData]);
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
    /** UTC ベースの YYYY-MM-DD（cast-edit-modal に渡す） */
    dayDateIso: string;
    currentStart: number;
    currentEnd: number;
  } | null>(null);

  const reload = useCallback(async () => {
    const res = await fetch(`/api/shifts?periodId=${data.id}`);
    if (res.ok) setData(await res.json());
  }, [data.id]);

  const periodShiftConfirmed = Boolean(data.adjustmentConfirmedPublished);
  const effectiveReqLocked = bypassShiftPeriodLocks ? false : Boolean(data.shiftRequestsLocked);
  const effectiveSlotLocked = bypassShiftPeriodLocks ? false : Boolean(data.shiftSlotsLocked);
  const slotsLocked = effectiveSlotLocked || periodShiftConfirmed || readOnly;
  const addShiftBlocked = effectiveReqLocked || slotsLocked;

  // ====== 履歴（元に戻す／やり直し） ======
  type HistorySnapshot = {
    days: Array<{
      id: string;
      targetBudget: number | null;
      eventName: string | null;
      expectedVisitors: string | null;
      notes: string | null;
      employeeOnDuty: string | null;
      slots: Array<{
        timeSlot: number;
        castId: string;
        isStart: boolean;
        isEnd: boolean;
        memo: string | null;
      }>;
    }>;
    /**
     * 期間全体のシフト希望スナップショット。removeCast によって希望が削除されると
     * 「未提出キャスト」一覧の判定が変わるため、Undo/Redo 時にも一緒に巻き戻す。
     * createdAt/updatedAt も保持して「最終操作日時」がリセットされないようにする。
     */
    shiftRequests: Array<{
      castId: string;
      date: string;
      startTime: number;
      endTime: number;
      notes: string | null;
      status: string;
      createdAt: string;
      updatedAt: string;
    }>;
  };
  const MAX_HISTORY = 50;
  const snapshotFromData = useCallback((d: typeof data): HistorySnapshot => ({
    days: d.shiftDays.map((day) => ({
      id: day.id,
      targetBudget: day.targetBudget,
      eventName: day.eventName,
      expectedVisitors: day.expectedVisitors,
      notes: day.notes,
      employeeOnDuty: day.employeeOnDuty,
      slots: day.shiftSlots.map((s) => ({
        timeSlot: s.timeSlot,
        castId: s.castId,
        isStart: s.isStart,
        isEnd: s.isEnd,
        memo: s.memo ?? null,
      })),
    })),
    shiftRequests: (d.shiftRequests ?? []).map((r) => ({
      castId: r.castId,
      date: typeof r.date === "string" ? r.date : new Date(r.date).toISOString(),
      startTime: r.startTime,
      endTime: r.endTime,
      notes: r.notes ?? null,
      status: r.status ?? "approved",
      createdAt:
        typeof r.createdAt === "string"
          ? r.createdAt
          : r.createdAt
            ? new Date(r.createdAt).toISOString()
            : new Date().toISOString(),
      updatedAt:
        typeof r.updatedAt === "string"
          ? r.updatedAt
          : r.updatedAt
            ? new Date(r.updatedAt).toISOString()
            : new Date().toISOString(),
    })),
  }), []);

  const historyRef = useRef<HistorySnapshot[]>([]);
  const indexRef = useRef<number>(-1);
  const prevSnapJsonRef = useRef<string>("");
  const suppressHistoryRef = useRef<boolean>(false);
  const [, setHistoryVersion] = useState(0);
  const [historyBusy, setHistoryBusy] = useState(false);

  useEffect(() => {
    const snap = snapshotFromData(data);
    const snapJson = JSON.stringify(snap);

    if (suppressHistoryRef.current) {
      suppressHistoryRef.current = false;
      prevSnapJsonRef.current = snapJson;
      return;
    }

    if (snapJson === prevSnapJsonRef.current) return;

    historyRef.current = historyRef.current.slice(0, indexRef.current + 1);
    historyRef.current.push(snap);
    if (historyRef.current.length > MAX_HISTORY) {
      historyRef.current.shift();
    } else {
      indexRef.current++;
    }
    prevSnapJsonRef.current = snapJson;
    setHistoryVersion((v) => v + 1);
  }, [data, snapshotFromData]);

  const canUndo = indexRef.current > 0 && !historyBusy && !slotsLocked;
  const canRedo =
    indexRef.current < historyRef.current.length - 1 && !historyBusy && !slotsLocked;

  const applySnapshot = useCallback(
    async (snap: HistorySnapshot) => {
      setHistoryBusy(true);
      try {
        const res = await fetch("/api/shifts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "restoreSnapshot",
            periodId: data.id,
            days: snap.days,
            shiftRequests: snap.shiftRequests,
          }),
        });
        if (!res.ok) {
          const r = await fetch(`/api/shifts?periodId=${data.id}`);
          if (r.ok) setData(await r.json());
          return false;
        }
        suppressHistoryRef.current = true;
        const r = await fetch(`/api/shifts?periodId=${data.id}`);
        if (r.ok) setData(await r.json());
        return true;
      } finally {
        setHistoryBusy(false);
      }
    },
    [data.id],
  );

  const handleUndo = useCallback(async () => {
    if (indexRef.current <= 0 || historyBusy || slotsLocked) return;
    const targetIdx = indexRef.current - 1;
    const snap = historyRef.current[targetIdx];
    const ok = await applySnapshot(snap);
    if (ok) {
      indexRef.current = targetIdx;
      setHistoryVersion((v) => v + 1);
    }
  }, [applySnapshot, historyBusy, slotsLocked]);

  const handleRedo = useCallback(async () => {
    if (indexRef.current >= historyRef.current.length - 1 || historyBusy || slotsLocked) return;
    const targetIdx = indexRef.current + 1;
    const snap = historyRef.current[targetIdx];
    const ok = await applySnapshot(snap);
    if (ok) {
      indexRef.current = targetIdx;
      setHistoryVersion((v) => v + 1);
    }
  }, [applySnapshot, historyBusy, slotsLocked]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;
      if (!isMod) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) return;
      }
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleUndo, handleRedo]);

  const handleCastClick = (day: ShiftDay, castId: string, castName: string) => {
    if (slotsLocked) return;
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
    const dayDateIso = toUtcDateKey(day.date);
    setEditTarget({
      dayId: day.id,
      dayLabel,
      dayDateIso,
      castId,
      castName,
      currentStart,
      currentEnd,
      memo,
    });
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
    if (slotsLocked) {
      e.preventDefault();
      return;
    }
    setDragging({ dayId, castId, castName, type, originalStart, originalEnd });
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", castName);
  };

  const handleDrop = async (e: React.DragEvent, targetDayId: string, targetSlot: number) => {
    e.preventDefault();
    if (slotsLocked) {
      setDragging(null);
      return;
    }
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
      // 退勤: 行の timeSlot は「その行の開始時刻」＝ここまで勤務したら終了する境界（API の newEnd と同じ）
      // targetSlot+0.5 だと 24:30 行(24.5)→25:00・25:30 行(25.5)→26:00 となり誤配置・無変更になる
      newEnd = targetSlot;
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

  /** 他店ヘルプで出勤先が決まっているキャストは、自店の表示から除外（DB に古い slot が残っても二重表示しない） */
  const gridShiftDays = useMemo(() => {
    return data.shiftDays.map((day) => {
      const raw = data.helpInfo?.[day.id] ?? [];
      const away = new Set(
        raw
          .map((h) => ("castId" in h && h.castId ? h.castId : ""))
          .filter(Boolean),
      );
      return {
        ...day,
        shiftSlots: away.size === 0 ? day.shiftSlots : day.shiftSlots.filter((s) => !away.has(s.castId)),
      };
    });
  }, [data.shiftDays, data.helpInfo]);

  const days = gridShiftDays;
  const DAYS_PER_TABLE = 8;
  const TIME_COL_WIDTH = 38; // 左の時刻列（px）
  const DAY_COL_WIDTH = 46 + 46 + 14 + 38; // 出勤/退勤/人数/メモ（px）
  const TABLE_MIN_WIDTH = TIME_COL_WIDTH + DAYS_PER_TABLE * DAY_COL_WIDTH; // 全体幅を揃える（px）

  const splitForPrint = chunkShiftDaysByCalendarPrint(days);
  const weeks = splitForPrint.length > 0 ? splitForPrint : [days];

  const padWeek = (week: ShiftDay[]): (ShiftDay | null)[] => {
    const diff = DAYS_PER_TABLE - week.length;
    if (diff <= 0) return week;
    return [...week, ...new Array(diff).fill(null)];
  };

  const blockReasons: string[] = [];
  if (!readOnly && addShiftBlocked) {
    if (periodShiftConfirmed) {
      blockReasons.push(
        "シフト確定ロック中です。ツールバーの「シフトロック中」をクリックすると解除され、編集・追加ができるようになります。",
      );
    }
    if (effectiveReqLocked) {
      blockReasons.push(
        "シフト希望が締切です。「締切を解除」で希望とシフト表の追加変更の締切をまとめて外せます。",
      );
    }
    if (effectiveSlotLocked && !periodShiftConfirmed) {
      blockReasons.push("シフト表の追加・変更が締切です。「締切を解除」で外せます。");
    }
  }

  return (
    <div className="shift-print-grid-root space-y-8">
      <ShiftPrintStyles />
      {!readOnly && (
        <div className="no-print flex items-center gap-1">
          <button
            type="button"
            onClick={handleUndo}
            disabled={!canUndo}
            title="元に戻す (Ctrl+Z)"
            aria-label="元に戻す"
            className={`inline-flex h-8 w-8 items-center justify-center rounded-md border shadow-sm transition ${
              canUndo
                ? "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 active:bg-gray-100"
                : "border-gray-200 bg-gray-50 text-gray-300 cursor-not-allowed"
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path d="M9 14 4 9l5-5" />
              <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
            </svg>
          </button>
          <button
            type="button"
            onClick={handleRedo}
            disabled={!canRedo}
            title="やり直し (Ctrl+Y / Ctrl+Shift+Z)"
            aria-label="やり直し"
            className={`inline-flex h-8 w-8 items-center justify-center rounded-md border shadow-sm transition ${
              canRedo
                ? "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 active:bg-gray-100"
                : "border-gray-200 bg-gray-50 text-gray-300 cursor-not-allowed"
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path d="m15 14 5-5-5-5" />
              <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
            </svg>
          </button>
          {historyBusy && (
            <span className="ml-1 text-[10px] text-gray-500">反映中...</span>
          )}
        </div>
      )}
      {blockReasons.length > 0 && (
        <div className="no-print rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 space-y-1">
          <p className="font-medium">いまシフトの編集・追加ができない理由:</p>
          <ul className="list-disc pl-4 space-y-0.5">
            {blockReasons.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      )}
      {weeks.map((week, weekIdx) => {
        const weekDays = padWeek(week);
        return (
        <div
          key={weekIdx}
          className={cn(
            "shift-print-chunk",
            weekIdx < weeks.length - 1 && "shift-print-chunk-break",
          )}
        >
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
                    type="button"
                    disabled={slotsLocked}
                    className={`inline-flex items-center justify-center rounded border px-0.5 py-0.5 text-[7px] font-medium shadow-sm whitespace-nowrap ${
                      slotsLocked
                        ? "border-gray-200 bg-gray-50 text-gray-300 cursor-not-allowed"
                        : "border-blue-200 bg-white text-blue-600 hover:border-blue-300 hover:bg-blue-50"
                    }`}
                    onClick={() => {
                      if (slotsLocked) return;
                      setEditDay(day);
                    }}
                  >
                    ＋営業情報
                  </button>
                ) : (
                  <div className="h-4" />
                )}
              </div>
            ))}
          </div>
          <div
            className="shift-print-table-shell overflow-x-auto rounded-lg border border-gray-300 shadow-sm"
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
                        type="button"
                        disabled={addShiftBlocked}
                        className={`absolute right-0 top-0 inline-flex items-center justify-center rounded border px-0.5 py-0.5 text-[7px] font-bold no-print shadow-sm whitespace-nowrap ${
                          addShiftBlocked
                            ? "border-gray-200 bg-gray-50 text-gray-300 cursor-not-allowed"
                            : "border-pink-200 bg-white text-pink-600 hover:border-pink-300 hover:bg-pink-50"
                        }`}
                        onClick={() => {
                          if (addShiftBlocked) return;
                          const label = `${d.getMonth() + 1}/${d.getDate()}(${dow})`;
                          setAddDialog({ dayId: day.id, dayLabel: label });
                        }}
                      >
                        ＋追加シフト
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
                      const endCasts = day.shiftSlots.filter((s) => {
                        if (!s.isEnd) return false;
                        return displaySlotForClockOut(day.shiftSlots, s.castId) === slot;
                      });
                      const count = daySlots.length;
                      const memos = daySlots.filter((s) => s.memo).map((s) => s.memo);

                      const hasWorking = count > 0;

                      // ドロップ判定用: ドラッグ中の同じ日かどうか
                      const isDragTarget = dragging && dragging.dayId === day.id;

                      const nStart = startCasts.length;
                      const stackStartTags = nStart > 1;
                      const startTagWidthBudget = stackStartTags
                        ? CLOCK_COL_INNER_PX - 2
                        : (CLOCK_COL_INNER_PX - 2 * Math.max(0, nStart - 1)) / Math.max(1, nStart);

                      const nEnd = endCasts.length;
                      const stackEndTags = nEnd > 1;
                      const endTagWidthBudget = stackEndTags
                        ? CLOCK_COL_INNER_PX - 2
                        : (CLOCK_COL_INNER_PX - 2 * Math.max(0, nEnd - 1)) / Math.max(1, nEnd);

                      return (
                        <React.Fragment key={day.id}>
                          {/* 出勤 */}
                          <td
                            style={{ boxShadow: "inset 1px 0 0 #9ca3af" }}
                            className={`${hourBorder} px-0 py-0 text-[10px] ${hasWorking ? "bg-amber-50/40" : ""} ${isDragTarget ? "hover:bg-blue-50" : ""}`}
                            onDragOver={handleDragOver}
                            onDrop={(e) => handleDrop(e, day.id, slot)}
                          >
                            <div
                              style={{
                                height: "28px",
                                overflow: "hidden",
                                display: "flex",
                                flexDirection: stackStartTags ? "column" : "row",
                                flexWrap: stackStartTags ? "nowrap" : "wrap",
                                alignItems: stackStartTags ? "stretch" : "center",
                                justifyContent: stackStartTags ? "center" : undefined,
                                gap: stackStartTags ? 1 : undefined,
                                padding: "0 2px",
                              }}
                            >
                            {startCasts.map((s) => {
                              // ヘルプ出勤: 所属店舗が現在のシフト表と異なる場合「店舗名+名前」
                              const castInfo = allCasts.find((c) => c.id === s.castId);
                              const isHelp = castInfo?.store?.name && castInfo.store.name !== data.store.name;
                              const displayName = isHelp ? `${castInfo!.store!.name}${s.cast.name}` : s.cast.name;
                              const nameLen = Array.from(displayName).length;
                              const nameFontSize = castNameTagFontSizePx(displayName, startTagWidthBudget);
                              const hasMemo = !!s.memo;
                              const castSlots = day.shiftSlots.filter((sl) => sl.castId === s.castId).sort((a, b) => a.timeSlot - b.timeSlot);
                              const origStart = castSlots[0]?.timeSlot ?? slot;
                              const origEnd = (castSlots[castSlots.length - 1]?.timeSlot ?? slot) + 0.5;

                              // 希望時間と現在の時間を比較して変更済みか判定（dayIdで確実にマッチ）
                              const req = data.shiftRequests?.find(
                                (r) => r.castId === s.castId && r.dayId === day.id
                              );
                              // 出勤タグの色は「出勤時刻の変更」のみで判定する。
                              // 退勤のみ変更された場合は退勤タグ側で濃いグレー表示するので、出勤タグはピンクのまま。
                              const isStartAdjusted = !!req && req.startTime !== origStart;
                              const isEndAdjustedForTitle = !!req && req.endTime !== origEnd;

                              // 色: メモあり→黄色系, 出勤時間変更済み→濃いピンク, 通常→ピンク（インラインstyleで確実適用）
                              let tagColor: React.CSSProperties = { backgroundColor: "#fbcfe8", color: "#9d174d" }; // 通常ピンク
                              if (hasMemo && isStartAdjusted) {
                                tagColor = { backgroundColor: "#fed7aa", color: "#9a3412", boxShadow: "0 0 0 1px #fdba74" }; // 薄いオレンジ
                              } else if (hasMemo) {
                                tagColor = { backgroundColor: "#fef08a", color: "#713f12", boxShadow: "0 0 0 1px #facc15" }; // 黄色
                              } else if (isStartAdjusted) {
                                tagColor = { backgroundColor: "#ec4899", color: "#ffffff" }; // 濃いピンク
                              }

                              return (
                                <span
                                  key={s.castId}
                                  draggable={!slotsLocked}
                                  onDragStart={(e) => handleDragStart(e, day.id, s.castId, s.cast.name, "start", origStart, origEnd)}
                                  style={{
                                    ...tagColor,
                                    fontSize: `${nameFontSize}px`,
                                    lineHeight: 1.1,
                                    letterSpacing: nameLen > 7 ? "-0.03em" : nameLen > 5 ? "-0.015em" : undefined,
                                  }}
                                  className={`${stackStartTags ? "inline-flex w-full min-h-0 flex-[1_1_0] max-w-full items-center justify-center" : "inline-block mr-0.5"} rounded py-0 cursor-grab active:cursor-grabbing hover:shadow-sm font-medium hover:brightness-90 whitespace-nowrap ${nameLen > 4 ? "px-0.5" : "px-1"}`}
                                  onClick={() => {
                                    if (slotsLocked) return;
                                    if (hasMemo) {
                                      const dd = new Date(day.date);
                                      setMemoView({
                                        castName: s.cast.name,
                                        memo: s.memo!,
                                        castId: s.castId,
                                        dayId: day.id,
                                        dayLabel: `${dd.getMonth() + 1}/${dd.getDate()}(${getJapaneseDayOfWeek(dd)})`,
                                        dayDateIso: toUtcDateKey(day.date),
                                        currentStart: origStart,
                                        currentEnd: origEnd,
                                      });
                                    } else {
                                      handleCastClick(day, s.castId, s.cast.name);
                                    }
                                  }}
                                  title={
                                    isStartAdjusted && req
                                      ? `出勤変更: ${formatTimeSlot(req.startTime)}→${formatTimeSlot(origStart)}${isEndAdjustedForTitle ? ` / 退勤: ${formatTimeSlot(req.endTime)}→${formatTimeSlot(origEnd)}` : ""}`
                                      : isEndAdjustedForTitle && req
                                        ? `退勤変更: ${formatTimeSlot(req.endTime)}→${formatTimeSlot(origEnd)}`
                                        : hasMemo
                                          ? `メモ: ${s.memo}`
                                          : displayName
                                  }
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
                            <div
                              style={{
                                height: "28px",
                                overflow: "hidden",
                                display: "flex",
                                flexDirection: stackEndTags ? "column" : "row",
                                flexWrap: stackEndTags ? "nowrap" : "wrap",
                                alignItems: stackEndTags ? "stretch" : "center",
                                justifyContent: stackEndTags ? "center" : undefined,
                                gap: stackEndTags ? 1 : undefined,
                                padding: "0 2px",
                              }}
                            >
                            {endCasts.map((s) => {
                              const endCastInfo = allCasts.find((c) => c.id === s.castId);
                              const endIsHelp = endCastInfo?.store?.name && endCastInfo.store.name !== data.store.name;
                              const endDisplayName = endIsHelp ? `${endCastInfo!.store!.name}${s.cast.name}` : s.cast.name;
                              const endNameLen = Array.from(endDisplayName).length;
                              const endNameFontSize = castNameTagFontSizePx(endDisplayName, endTagWidthBudget);
                              const castSlots = day.shiftSlots.filter((sl) => sl.castId === s.castId).sort((a, b) => a.timeSlot - b.timeSlot);
                              const origStart = castSlots[0]?.timeSlot ?? slot;
                              const origEnd = (castSlots[castSlots.length - 1]?.timeSlot ?? slot) + 0.5;

                              // 退勤時間が希望から変更されているか判定（dayIdで確実にマッチ）
                              const req = data.shiftRequests?.find(
                                (r) => r.castId === s.castId && r.dayId === day.id
                              );
                              // 希望退勤29:00で実退勤も29:00（変更なし）の場合のみ名前を出さない。
                              // 29:00希望でも 27:00 などにカットされた場合は、変更を示すため濃いグレーで表示する。
                              if (req && hideEndCastNameForWishEnd29(req.endTime, origEnd)) {
                                return null;
                              }
                              const isEndAdjusted = req && req.endTime !== origEnd;
                              const endColor: React.CSSProperties = isEndAdjusted
                                ? { backgroundColor: "#6b7280", color: "#ffffff" }
                                : { backgroundColor: "#e5e7eb", color: "#4b5563" };

                              return (
                              <span
                                key={s.castId}
                                draggable={!slotsLocked}
                                onDragStart={(e) => handleDragStart(e, day.id, s.castId, s.cast.name, "end", origStart, origEnd)}
                                style={{
                                  ...endColor,
                                  fontSize: `${endNameFontSize}px`,
                                  lineHeight: 1.1,
                                  letterSpacing: endNameLen > 7 ? "-0.03em" : endNameLen > 5 ? "-0.015em" : undefined,
                                }}
                                className={`${stackEndTags ? "inline-flex w-full min-h-0 flex-[1_1_0] max-w-full items-center justify-center" : "inline-block mr-0.5"} rounded py-0 cursor-grab active:cursor-grabbing hover:brightness-90 whitespace-nowrap ${endNameLen > 4 ? "px-0.5" : "px-1"}`}
                                title={isEndAdjusted && req ? `退勤変更: ${formatTimeSlot(req.endTime)}→${formatTimeSlot(origEnd)}` : endDisplayName}
                                onClick={() => {
                                  if (slotsLocked) return;
                                  handleCastClick(day, s.castId, s.cast.name);
                                }}
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
                            <SlotMemoInput dayId={day.id} timeSlot={slot} notes={day.notes} disabled={slotsLocked} />
                          </td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
            <tbody className="shift-print-summary-tbody">
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

                  const totalHours = day.shiftSlots.length * 0.5;
                  const budget = totalHours > 0 ? totalHours * 6000 : 0;
                  return (
                    <React.Fragment key={day.id}>
                      <td
                        className={`px-0.5 py-0.5 text-[9px] font-bold text-emerald-800 whitespace-nowrap ${slotsLocked ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-emerald-100"}`}
                        onClick={() => {
                          if (slotsLocked) return;
                          setEditDay(day);
                        }}
                      >
                        {budget ? budget.toLocaleString() : "-"}
                      </td>
                      <td colSpan={2} className="px-0.5 py-0.5 text-[9px] font-bold text-sky-700 whitespace-nowrap">
                        {totalHours || "-"}
                      </td>
                      <td
                        className={`px-0.5 py-0.5 text-purple-700 overflow-hidden ${slotsLocked ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-purple-100"} ${!isLast ? "border-r-[3px] border-r-gray-500" : ""}`}
                        onClick={() => {
                          if (slotsLocked) return;
                          const dd = new Date(day.date);
                          setEditField({ dayId: day.id, dayLabel: `${dd.getMonth()+1}/${dd.getDate()}(${getJapaneseDayOfWeek(dd)})`, field: "eventName", label: "企画名", value: day.eventName || "" });
                        }}
                      >
                        <AutoFitText text={day.eventName || "-"} baseSize={8} minSize={5} />
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
                    <td
                      key={day.id}
                      colSpan={4}
                      className={`px-0.5 py-0.5 text-orange-800 overflow-hidden ${slotsLocked ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-orange-100"} ${!isLast ? "border-r-[3px] border-r-gray-500" : ""}`}
                      onClick={() => {
                        if (slotsLocked) return;
                        const dd = new Date(day.date);
                        setEditField({ dayId: day.id, dayLabel: `${dd.getMonth()+1}/${dd.getDate()}(${getJapaneseDayOfWeek(dd)})`, field: "employeeOnDuty", label: "社員", value: day.employeeOnDuty || "" });
                      }}
                    >
                      <AutoFitText text={day.employeeOnDuty || "-"} baseSize={8} minSize={5} />
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
                    <td
                      key={day.id}
                      colSpan={4}
                      className={`px-0.5 py-0.5 text-gray-600 overflow-hidden ${slotsLocked ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-gray-100"} ${!isLast ? "border-r-[3px] border-r-gray-500" : ""}`}
                      onClick={() => {
                        if (slotsLocked) return;
                        const dd = new Date(day.date);
                        setEditField({ dayId: day.id, dayLabel: `${dd.getMonth()+1}/${dd.getDate()}(${getJapaneseDayOfWeek(dd)})`, field: "expectedVisitors", label: "来店予定", value: day.expectedVisitors || "" });
                      }}
                    >
                      <AutoFitText text={day.expectedVisitors || "-"} baseSize={8} minSize={5} />
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
                    <td
                      key={day.id}
                      colSpan={4}
                      className={`px-1 py-0.5 text-[9px] text-gray-600 ${slotsLocked ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-gray-100"} ${!isLast ? "border-r-[3px] border-r-gray-500" : ""}`}
                      onClick={() => {
                        if (slotsLocked) return;
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
          shiftRequestsLocked={effectiveReqLocked}
          shiftSlotsLocked={effectiveSlotLocked}
          periodShiftConfirmed={periodShiftConfirmed}
          onClose={() => setAddDialog(null)}
          onSaved={reload}
        />
      )}
      {editDay && <DayInfoEditor day={editDay} onClose={() => setEditDay(null)} onSaved={reload} />}
      {editTarget && (
        <CastEditModal
          dayId={editTarget.dayId}
          dayLabel={editTarget.dayLabel}
          dayDateIso={editTarget.dayDateIso}
          castId={editTarget.castId}
          castName={editTarget.castName}
          currentStart={editTarget.currentStart}
          currentEnd={editTarget.currentEnd}
          memo={editTarget.memo}
          periodId={data.id}
          allCasts={allCasts}
          currentStoreName={data.store.name}
          shiftRequestsLocked={effectiveReqLocked}
          shiftSlotsLocked={effectiveSlotLocked}
          periodShiftConfirmed={periodShiftConfirmed}
          onClose={() => setEditTarget(null)}
          onSaved={reload}
        />
      )}
      {memoView && (
        <MemoViewModal
          memoView={memoView}
          shiftRequests={data.shiftRequests}
          shiftSlotsLocked={slotsLocked}
          onClose={() => setMemoView(null)}
          onEdit={() => {
            setMemoView(null);
            setEditTarget({
              dayId: memoView.dayId,
              dayLabel: memoView.dayLabel,
              dayDateIso: memoView.dayDateIso,
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
            autoComplete="off"
            name={`${field}-${dayId}`}
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
  shiftSlotsLocked,
  onClose,
  onEdit,
}: {
  shiftSlotsLocked?: boolean;
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
  // dayId で完全一致させる。旧実装の dayLabel.includes("4/1") は "4/10" や "4/11"
  // にも誤マッチしていたため、shiftRequests に含まれる dayId で厳密に突き合わせる。
  const req = findShiftRequestByDayId(
    shiftRequests,
    memoView.castId,
    memoView.dayId,
  );

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
        <button
          type="button"
          className={`text-xs ${shiftSlotsLocked ? "text-gray-400 cursor-not-allowed" : "text-blue-600 hover:text-blue-800"}`}
          onClick={() => {
            if (shiftSlotsLocked) return;
            onEdit();
          }}
        >
          シフトを編集/削除
        </button>
        <Button variant="outline" onClick={onClose}>閉じる</Button>
      </div>
    </Modal>
  );
}

// 管理者メモ（スロット単位インライン入力）
function SlotMemoInput({
  dayId,
  timeSlot,
  notes,
  disabled = false,
}: {
  dayId: string;
  timeSlot: number;
  notes: string | null;
  disabled?: boolean;
}) {
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
    if (disabled) return;
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
      readOnly={disabled}
      style={{
        backgroundColor: disabled ? "#f3f4f6" : bgColor,
        fontSize: `${fontSize}px`,
        lineHeight: "1.2",
        height: "28px",
        resize: "none",
        wordBreak: "break-all",
      }}
      className={`w-full border-0 px-0.5 py-0 outline-none overflow-hidden ${value ? "text-gray-700" : "text-gray-300"} ${disabled ? "cursor-not-allowed" : ""}`}
      value={value}
      placeholder=""
      onChange={(e) => {
        if (disabled) return;
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
