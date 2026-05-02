"use client";

import { useState, useMemo } from "react";
import { Modal } from "@/components/modal";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { TIME_SLOTS, formatTimeSlot } from "@/lib/shift-utils";
import { TRIAL_GUEST_NAME_MAX_LEN } from "@/lib/trial-guest-constants";

type Props = {
  dayId: string;
  dayLabel: string;
  allCasts: { id: string; name: string; store: { name: string } | null }[];
  currentStoreName: string;
  /** その日の自店スロット（重複チェック用）。時間帯が重ならなければ同じ日に再度追加可能 */
  existingDaySlots: { castId: string; timeSlot: number }[];
  /** 他店ヘルプでこの日占有している半日（自店DBに無い時間も重複扱い） */
  helpAwayHalfSlots?: { castId: string; timeSlot: number }[];
  /** true のとき希望締切のため追加不可 */
  shiftRequestsLocked?: boolean;
  /** true のときシフト表の追加締切のため追加不可 */
  shiftSlotsLocked?: boolean;
  /** 「シフトを確定する」後（締切とは別） */
  periodShiftConfirmed?: boolean;
  onClose: () => void;
  onSaved: () => void;
};

export function CastAddDialog({
  dayId,
  dayLabel,
  allCasts,
  currentStoreName,
  existingDaySlots,
  helpAwayHalfSlots = [],
  shiftRequestsLocked = false,
  shiftSlotsLocked = false,
  periodShiftConfirmed = false,
  onClose,
  onSaved,
}: Props) {
  const [castId, setCastId] = useState("");
  const [trialGuestName, setTrialGuestName] = useState("");
  const [startTime, setStartTime] = useState("20");
  const [endTime, setEndTime] = useState("25");
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"own" | "help" | "trial">("own");
  const [helpStore, setHelpStore] = useState("");

  // 店舗一覧（現在の店舗以外）
  const otherStores = useMemo(() => {
    const storeSet = new Set<string>();
    allCasts.forEach((c) => {
      if (c.store && c.store.name !== currentStoreName) {
        storeSet.add(c.store.name);
      }
    });
    return [...storeSet].sort();
  }, [allCasts, currentStoreName]);

  // タブに応じたキャスト一覧（体入タブはテキスト入力のため未使用）
  const filteredCasts = useMemo(() => {
    if (tab === "own") {
      return allCasts.filter((c) => c.store?.name === currentStoreName);
    }
    if (tab === "trial") return [];
    if (!helpStore) return [];
    return allCasts.filter((c) => c.store?.name === helpStore);
  }, [tab, helpStore, allCasts, currentStoreName]);

  const addBlocked = shiftRequestsLocked || shiftSlotsLocked || periodShiftConfirmed;

  const startNum = parseFloat(startTime);
  const endNum = parseFloat(endTime);

  /** 選択した [出勤, 退勤) と自店既存または他店ヘルプの占有が重なるキャストは追加不可 */
  const overlapByCastId = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const c of filteredCasts) {
      const hitLocal = existingDaySlots.some(
        (s) => s.castId === c.id && s.timeSlot >= startNum && s.timeSlot < endNum,
      );
      const hitAway = helpAwayHalfSlots.some(
        (s) => s.castId === c.id && s.timeSlot >= startNum && s.timeSlot < endNum,
      );
      m.set(c.id, hitLocal || hitAway);
    }
    return m;
  }, [filteredCasts, existingDaySlots, helpAwayHalfSlots, startNum, endNum]);

  const canSubmit =
    tab === "trial"
      ? trialGuestName.trim().length > 0
      : Boolean(castId);

  const handleSave = async () => {
    if (!canSubmit || addBlocked) return;
    setSaving(true);

    const body =
      tab === "trial"
        ? {
            action: "addCast",
            dayId,
            trialGuestName: trialGuestName.trim(),
            startTime: parseFloat(startTime),
            endTime: parseFloat(endTime),
            memo: memo || null,
          }
        : {
            action: "addCast",
            dayId,
            castId,
            startTime: parseFloat(startTime),
            endTime: parseFloat(endTime),
            memo: memo || null,
          };

    await fetch("/api/shifts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setSaving(false);
    onSaved();
    onClose();
  };

  return (
    <Modal open title={`${dayLabel} - キャスト追加`} onClose={onClose}>
      <div className="space-y-4">
        {shiftRequestsLocked && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            シフト希望が締め切られているため、ここからの追加はできません。「締め切り解除」後に再度お試しください。
          </p>
        )}
        {shiftSlotsLocked && (
          <p className="text-sm text-sky-900 bg-sky-50 border border-sky-200 rounded-md px-3 py-2">
            シフト追加が締め切られているため、ここからの追加はできません。「シフト追加締切を解除」後に再度お試しください。
          </p>
        )}
        {periodShiftConfirmed && (
          <p className="text-sm text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
            シフトが確定済みのため、ここからの追加はできません。シフト表の「シフトロック中」ボタンでロックを解除してから編集してください。
          </p>
        )}
        {/* タブ切り替え */}
        <div className="flex flex-wrap gap-x-1 border-b border-gray-300" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "own"}
            className={`shrink-0 whitespace-nowrap px-4 py-1.5 text-sm font-medium border-b-2 transition-colors ${
              tab === "own"
                ? "border-purple-500 text-purple-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => {
              setTab("own");
              setCastId("");
              setTrialGuestName("");
            }}
          >
            {currentStoreName}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "help"}
            className={`shrink-0 whitespace-nowrap px-4 py-1.5 text-sm font-medium border-b-2 transition-colors ${
              tab === "help"
                ? "border-orange-500 text-orange-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => {
              setTab("help");
              setCastId("");
              setTrialGuestName("");
            }}
          >
            ヘルプ
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "trial"}
            className={`shrink-0 whitespace-nowrap px-4 py-1.5 text-sm font-medium border-b-2 transition-colors ${
              tab === "trial"
                ? "border-purple-500 text-purple-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => {
              setTab("trial");
              setCastId("");
              setTrialGuestName("");
            }}
          >
            体入
          </button>
        </div>

        {/* ヘルプタブ: 店舗選択 */}
        {tab === "help" && (
          <div className="space-y-1">
            <Label>店舗を選択</Label>
            <select
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              value={helpStore}
              onChange={(e) => {
                setHelpStore(e.target.value);
                setCastId("");
              }}
            >
              <option value="">店舗を選択</option>
              {otherStores.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* 体入は登録キャストの select と DOM を共有しない（ネイティブ text で確実に区別） */}
        {tab === "trial" && (
          <div key="trial-guest-fields" className="space-y-1">
            <label htmlFor="shift-add-trial-guest-name" className="text-sm font-medium leading-none">
              キャスト名（必須）
            </label>
            <input
              id="shift-add-trial-guest-name"
              name="trialGuestName"
              type="text"
              value={trialGuestName}
              onChange={(e) => setTrialGuestName(e.target.value)}
              placeholder="例: あい（表では「体入あい」と表示）"
              maxLength={TRIAL_GUEST_NAME_MAX_LEN}
              autoComplete="off"
              className="h-9 w-full min-w-0 rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-sm outline-none focus-visible:border-purple-500 focus-visible:ring-2 focus-visible:ring-purple-200"
            />
            <p className="text-xs text-gray-500">
              登録キャストではなく自由入力です（最大{TRIAL_GUEST_NAME_MAX_LEN}文字）。シフト表では先頭に「体入」が付きます。
            </p>
          </div>
        )}
        {(tab === "own" || tab === "help") && (
          <div key="registered-cast-fields" className="space-y-1">
            <Label>キャスト</Label>
            <select
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              value={castId}
              onChange={(e) => setCastId(e.target.value)}
            >
              <option value="">キャストを選択</option>
              {filteredCasts.map((cast) => {
                const overlaps = overlapByCastId.get(cast.id) ?? false;
                return (
                  <option key={cast.id} value={cast.id} disabled={overlaps}>
                    {cast.name}
                    {overlaps ? " [この時間帯は配置済]" : ""}
                  </option>
                );
              })}
            </select>
            {tab === "help" && !helpStore && (
              <p className="text-xs text-gray-400">先に店舗を選択してください</p>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>出勤時間</Label>
            <select
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            >
              {TIME_SLOTS.map((slot) => (
                <option key={slot} value={slot.toString()}>
                  {formatTimeSlot(slot)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>退勤時間</Label>
            <select
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            >
              {TIME_SLOTS.filter((s) => s > parseFloat(startTime)).map((slot) => (
                <option key={slot} value={slot.toString()}>
                  {formatTimeSlot(slot)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-2">
          <Label>メモ（任意）</Label>
          <Input
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="他店ヘルプ、当日対応など"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            キャンセル
          </Button>
          <Button
            onClick={handleSave}
            disabled={!canSubmit || saving || addBlocked}
            className="bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white"
          >
            {saving ? "保存中..." : "追加"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
