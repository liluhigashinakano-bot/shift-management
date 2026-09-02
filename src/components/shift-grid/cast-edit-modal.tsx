"use client";

import { useState, useEffect, useMemo } from "react";
import { Modal } from "@/components/modal";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  TIME_SLOTS,
  findShiftRequestByDate,
  formatTimeSlot,
} from "@/lib/shift-utils";
import { clampEndToStart } from "@/lib/shift-time-range";
import { postJson } from "@/lib/api-request";

type Props = {
  dayId: string;
  dayLabel: string;
  /**
   * 対象日の UTC 日付キー（YYYY-MM-DD）。
   * シフト希望のマッチングは dayLabel ではなくこのキーで完全一致させる。
   */
  dayDateIso: string;
  castId: string;
  castName: string;
  /** 体入で追加した仮キャスト（ヘルプ出勤タブを出さない） */
  isTrialGuest?: boolean;
  currentStart: number;
  currentEnd: number;
  memo: string | null;
  periodId: string;
  /** ヘルプ出勤タブで「追加先店舗」候補を作るための全キャスト一覧 */
  allCasts: { id: string; name: string; store: { name: string } | null }[];
  /** ヘルプ先に選べる店舗名（キャストが 0 人の店舗も選べるように別で渡す） */
  storeNames?: string[];
  /** 現在のシフト表の店舗名（=「自店」、ヘルプタブでは追加先候補から除外する） */
  currentStoreName: string;
  /** シフト希望の締切（ヘルプ追加もこの締切に従う） */
  shiftRequestsLocked?: boolean;
  /** シフト表の追加・変更締切 */
  shiftSlotsLocked?: boolean;
  /** 「シフトを確定する」後 */
  periodShiftConfirmed?: boolean;
  /** 閲覧のみ（他店舗など） */
  readOnly?: boolean;
  onClose: () => void;
  onSaved: () => void;
};

type RequestInfo = {
  startTime: number;
  endTime: number;
  notes: string | null;
  date: string;
} | null;

export function CastEditModal({
  dayId,
  dayLabel,
  dayDateIso,
  castId,
  castName,
  isTrialGuest = false,
  currentStart,
  currentEnd,
  memo,
  periodId,
  allCasts,
  storeNames,
  currentStoreName,
  shiftRequestsLocked = false,
  shiftSlotsLocked = false,
  periodShiftConfirmed = false,
  readOnly = false,
  onClose,
  onSaved,
}: Props) {
  const sheetEditBlocked = readOnly || shiftSlotsLocked || periodShiftConfirmed;
  const helpAddBlocked =
    readOnly || shiftRequestsLocked || shiftSlotsLocked || periodShiftConfirmed;
  const [mode, setMode] = useState<"menu" | "edit">("menu");
  const [tab, setTab] = useState<"edit" | "help">("edit");
  const [newStart, setNewStart] = useState(currentStart.toString());
  const [newEnd, setNewEnd] = useState(currentEnd.toString());
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [requestInfo, setRequestInfo] = useState<RequestInfo>(null);
  const [loading, setLoading] = useState(true);

  // ヘルプ出勤タブ: 「誰を」は固定。「どの店舗へ」だけ選んでもらう
  const [helpStore, setHelpStore] = useState("");
  const [helpStart, setHelpStart] = useState(currentStart.toString());
  const [helpEnd, setHelpEnd] = useState(currentEnd.toString());
  const [helpMemo, setHelpMemo] = useState("");
  const [helpSaving, setHelpSaving] = useState(false);

  const homeStoreName = useMemo(() => {
    return allCasts.find((c) => c.id === castId)?.store?.name ?? null;
  }, [allCasts, castId]);

  const otherStores = useMemo(() => {
    const storeSet = new Set<string>();
    const source =
      storeNames && storeNames.length > 0
        ? storeNames
        : allCasts.map((c) => c.store?.name).filter((n): n is string => Boolean(n));
    for (const name of source) {
      if (name === currentStoreName) continue;
      if (homeStoreName && name === homeStoreName) continue;
      storeSet.add(name);
    }
    return [...storeSet].sort((a, b) => a.localeCompare(b, "ja"));
  }, [allCasts, currentStoreName, homeStoreName, storeNames]);

  useEffect(() => {
    if (isTrialGuest) setTab("edit");
  }, [isTrialGuest, castId]);

  // シフト希望情報を取得
  useEffect(() => {
    let cancelled = false;
    async function fetchRequest() {
      try {
        const res = await fetch(
          `/api/requests?periodId=${encodeURIComponent(periodId)}&castId=${encodeURIComponent(castId)}`,
          { credentials: "same-origin" },
        );
        if (res.ok) {
          const requests = (await res.json()) as Array<{
            castId: string;
            date: string;
            startTime: number;
            endTime: number;
            notes: string | null;
          }>;
          const match = findShiftRequestByDate(requests, castId, dayDateIso);
          if (match && !cancelled) {
            setRequestInfo({
              startTime: match.startTime,
              endTime: match.endTime,
              notes: match.notes,
              date: match.date,
            });
          }
        }
      } catch {
        /* 取れなくても編集はできる */
      }
      if (!cancelled) setLoading(false);
    }
    fetchRequest();
    return () => {
      cancelled = true;
    };
  }, [periodId, castId, dayDateIso]);

  /** 出勤を変えたら、退勤が出勤以下にならないように寄せる */
  const handleStartChange = (value: string, isHelp = false) => {
    const nextStart = parseFloat(value);
    if (isHelp) {
      setHelpStart(value);
      const cur = parseFloat(helpEnd);
      if (Number.isFinite(nextStart) && Number.isFinite(cur)) {
        const fixed = clampEndToStart(nextStart, cur);
        if (fixed !== cur) setHelpEnd(String(fixed));
      }
      return;
    }
    setNewStart(value);
    const cur = parseFloat(newEnd);
    if (Number.isFinite(nextStart) && Number.isFinite(cur)) {
      const fixed = clampEndToStart(nextStart, cur);
      if (fixed !== cur) setNewEnd(String(fixed));
    }
  };

  const handleDelete = async () => {
    if (sheetEditBlocked || saving) return;
    setSaving(true);
    try {
      const result = await postJson(
        "/api/shifts",
        { action: "removeCast", dayId, castId, reason: reason || null },
        { fallbackMessage: "シフトを削除できませんでした" },
      );
      if (!result.ok) return;
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (sheetEditBlocked || saving) return;
    setSaving(true);
    try {
      const result = await postJson(
        "/api/shifts",
        {
          action: "editCast",
          dayId,
          castId,
          newStart: parseFloat(newStart),
          newEnd: parseFloat(newEnd),
          reason: reason || null,
        },
        { fallbackMessage: "時間を変更できませんでした" },
      );
      if (!result.ok) return;
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleHelpAdd = async () => {
    if (!helpStore || helpAddBlocked || helpSaving) return;
    setHelpSaving(true);
    try {
      const result = await postJson(
        "/api/shifts",
        {
          action: "addCastHelp",
          sourceDayId: dayId,
          targetStoreName: helpStore,
          castId,
          startTime: parseFloat(helpStart),
          endTime: parseFloat(helpEnd),
          memo: helpMemo || null,
        },
        { fallbackMessage: "ヘルプ追加に失敗しました" },
      );
      if (!result.ok) return;
      onSaved();
      onClose();
    } finally {
      setHelpSaving(false);
    }
  };

  const currentHours = currentEnd - currentStart;
  const hasChanged =
    requestInfo &&
    (requestInfo.startTime !== currentStart || requestInfo.endTime !== currentEnd);

  if (mode === "menu") {
    return (
      <Modal open title={`${castName} - ${dayLabel}`} onClose={onClose}>
        {/* タブ切り替え（時間編集モード中は表示しない） */}
        {!isTrialGuest && (
          <div className="flex border-b border-gray-300 mb-3 -mt-1">
            <button
              type="button"
              className={`px-4 py-1.5 text-sm font-medium border-b-2 transition-colors ${
                tab === "edit"
                  ? "border-purple-500 text-purple-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
              onClick={() => setTab("edit")}
            >
              シフト編集
            </button>
            <button
              type="button"
              className={`px-4 py-1.5 text-sm font-medium border-b-2 transition-colors ${
                tab === "help"
                  ? "border-orange-500 text-orange-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
              onClick={() => setTab("help")}
            >
              ヘルプ出勤
            </button>
          </div>
        )}

        {tab === "edit" || isTrialGuest ? (
          <>
            <div className="space-y-3 mb-4">
              {readOnly && (
                <p className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
                  この店舗は閲覧のみです。内容の確認だけできます。
                </p>
              )}
              {shiftSlotsLocked && !readOnly && (
                <p className="text-xs text-sky-900 bg-sky-50 border border-sky-200 rounded-md px-3 py-2">
                  シフト追加が締め切られているため、時間の変更・削除はできません。内容の確認はできます。
                </p>
              )}
              {periodShiftConfirmed && !readOnly && (
                <p className="text-xs text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
                  シフトが確定済みのため、時間の変更・削除はできません。シフト表の「シフトロック中」ボタンでロックを解除してください。
                </p>
              )}
              {/* シフト希望情報 */}
              {loading ? (
                <div className="text-xs text-gray-400">読み込み中...</div>
              ) : requestInfo ? (
                <div className="bg-blue-50 border border-blue-200 rounded-md p-2.5 space-y-1.5">
                  <div className="text-[11px] font-bold text-blue-700">
                    シフト希望（提出時）
                  </div>
                  <div className="text-sm text-blue-800">
                    {formatTimeSlot(requestInfo.startTime)} 〜{" "}
                    {formatTimeSlot(requestInfo.endTime)}
                    <span className="text-xs text-blue-600 ml-1">
                      （{requestInfo.endTime - requestInfo.startTime}h）
                    </span>
                  </div>
                  {requestInfo.notes && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded px-2 py-1.5 text-xs text-yellow-800">
                      <span className="font-bold">メモ: </span>
                      {requestInfo.notes}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-gray-400 bg-gray-50 rounded p-2">
                  シフト希望の登録なし（直接配置）
                </div>
              )}

              {/* 現在のシフト */}
              <div
                className={`rounded-md p-2.5 space-y-1 ${
                  hasChanged
                    ? "bg-orange-50 border border-orange-200"
                    : "bg-gray-50 border border-gray-200"
                }`}
              >
                <div className="text-[11px] font-bold text-gray-700">
                  現在のシフト
                  {hasChanged && (
                    <span className="text-orange-600 ml-1">（希望から変更済）</span>
                  )}
                </div>
                <div className="text-sm text-gray-800">
                  {formatTimeSlot(currentStart)} 〜 {formatTimeSlot(currentEnd)}
                  <span className="text-xs text-gray-500 ml-1">（{currentHours}h）</span>
                </div>
                {hasChanged && requestInfo && (
                  <div className="text-[10px] text-orange-600">
                    差分: 出勤{" "}
                    {requestInfo.startTime !== currentStart
                      ? `${formatTimeSlot(requestInfo.startTime)}→${formatTimeSlot(currentStart)}`
                      : "変更なし"}
                    {" / "}退勤{" "}
                    {requestInfo.endTime !== currentEnd
                      ? `${formatTimeSlot(requestInfo.endTime)}→${formatTimeSlot(currentEnd)}`
                      : "変更なし"}
                  </div>
                )}
              </div>

              {/* メモ（出勤スロットのmemo） */}
              {memo && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-md p-2.5">
                  <div className="text-[11px] font-bold text-yellow-800">希望メモ</div>
                  <div className="text-sm text-yellow-900">{memo}</div>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                className="justify-start text-blue-600 border-blue-200 hover:bg-blue-50"
                onClick={() => setMode("edit")}
                disabled={sheetEditBlocked}
              >
                時間を編集
              </Button>
              <Button
                variant="outline"
                className="justify-start text-red-600 border-red-200 hover:bg-red-50"
                onClick={handleDelete}
                disabled={saving || sheetEditBlocked}
              >
                {saving ? "削除中..." : "シフトを削除（カット）"}
              </Button>
              <Button variant="outline" onClick={onClose}>
                閉じる
              </Button>
            </div>
          </>
        ) : (
          // ヘルプ出勤タブ: このキャスト自身を別店舗のシフト表に追加する
          <div className="space-y-4">
            {readOnly && (
              <p className="text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
                この店舗は閲覧のみです。ヘルプの登録はできません。
              </p>
            )}
            {shiftRequestsLocked && !readOnly && (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                シフト希望が締め切られているため、ここからの追加はできません。「締め切り解除」後に再度お試しください。
              </p>
            )}
            {shiftSlotsLocked && !readOnly && (
              <p className="text-sm text-sky-900 bg-sky-50 border border-sky-200 rounded-md px-3 py-2">
                シフト追加が締め切られているため、ここからの追加はできません。「シフト追加締切を解除」後に再度お試しください。
              </p>
            )}
            {periodShiftConfirmed && !readOnly && (
              <p className="text-sm text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
                シフトが確定済みのため、ここからの追加はできません。シフト表の「シフトロック中」ボタンでロックを解除してから編集してください。
              </p>
            )}

            <div className="bg-orange-50 border border-orange-200 rounded-md p-2.5 text-xs text-orange-900">
              <span className="font-bold">{castName}</span>{" "}
              さんを別店舗のシフト表へヘルプ出勤として追加します。
            </div>

            <div className="space-y-1">
              <Label>追加先の店舗</Label>
              <select
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                value={helpStore}
                onChange={(e) => setHelpStore(e.target.value)}
              >
                <option value="">店舗を選択</option>
                {otherStores.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              {otherStores.length === 0 && (
                <p className="text-xs text-gray-400">追加先となる他店舗がありません。</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>出勤時間</Label>
                <select
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  value={helpStart}
                  onChange={(e) => handleStartChange(e.target.value, true)}
                >
                  {TIME_SLOTS.map((slot) => (
                    <option key={slot} value={slot.toString()}>
                      {formatTimeSlot(slot)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>退勤時間</Label>
                <select
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  value={helpEnd}
                  onChange={(e) => setHelpEnd(e.target.value)}
                >
                  {TIME_SLOTS.filter((s) => s > parseFloat(helpStart)).map((slot) => (
                    <option key={slot} value={slot.toString()}>
                      {formatTimeSlot(slot)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <Label>メモ（任意）</Label>
              <Input
                value={helpMemo}
                onChange={(e) => setHelpMemo(e.target.value)}
                placeholder="他店ヘルプ、当日対応など"
                autoComplete="off"
                name="cast-edit-help-memo"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>
                キャンセル
              </Button>
              <Button
                onClick={handleHelpAdd}
                disabled={!helpStore || helpSaving || helpAddBlocked}
                className="bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white"
              >
                {helpSaving ? "保存中..." : "追加"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    );
  }

  // 編集モード
  return (
    <Modal open title={`${castName} - 時間編集`} onClose={onClose}>
      {requestInfo && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-2 mb-3 text-xs">
          <span className="font-bold text-blue-700">希望時間: </span>
          <span className="text-blue-800">
            {formatTimeSlot(requestInfo.startTime)} 〜{" "}
            {formatTimeSlot(requestInfo.endTime)}
          </span>
          {requestInfo.notes && (
            <span className="text-yellow-700 ml-2">メモ: {requestInfo.notes}</span>
          )}
        </div>
      )}
      <div className="text-xs text-gray-500 mb-3">
        現在: {formatTimeSlot(currentStart)} 〜 {formatTimeSlot(currentEnd)}（
        {currentHours}h）
      </div>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>出勤時間</Label>
            <select
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              value={newStart}
              disabled={sheetEditBlocked}
              onChange={(e) => handleStartChange(e.target.value)}
            >
              {TIME_SLOTS.map((s) => (
                <option key={s} value={s.toString()}>
                  {formatTimeSlot(s)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>退勤時間</Label>
            <select
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              value={newEnd}
              disabled={sheetEditBlocked}
              onChange={(e) => setNewEnd(e.target.value)}
            >
              {TIME_SLOTS.filter((s) => s > parseFloat(newStart)).map((s) => (
                <option key={s} value={s.toString()}>
                  {formatTimeSlot(s)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-1">
          <Label>変更理由（任意）</Label>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="人数調整、予算超過など"
            disabled={sheetEditBlocked}
            autoComplete="off"
            name="cast-edit-reason"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setMode("menu")}>
            戻る
          </Button>
          <Button
            onClick={handleEdit}
            disabled={saving || sheetEditBlocked}
            className="bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white"
          >
            {saving ? "保存中..." : "変更を保存"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
