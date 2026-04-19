"use client";

import { useState, useMemo } from "react";
import { Modal } from "@/components/modal";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { TIME_SLOTS, formatTimeSlot } from "@/lib/shift-utils";

type Props = {
  dayId: string;
  dayLabel: string;
  allCasts: { id: string; name: string; store: { name: string } | null }[];
  currentStoreName: string;
  existingSlots: string[];
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
  existingSlots,
  shiftRequestsLocked = false,
  shiftSlotsLocked = false,
  periodShiftConfirmed = false,
  onClose,
  onSaved,
}: Props) {
  const [castId, setCastId] = useState("");
  const [startTime, setStartTime] = useState("20");
  const [endTime, setEndTime] = useState("25");
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"own" | "help">("own");
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

  // タブに応じたキャスト一覧
  const filteredCasts = useMemo(() => {
    if (tab === "own") {
      return allCasts.filter((c) => c.store?.name === currentStoreName);
    } else {
      if (!helpStore) return [];
      return allCasts.filter((c) => c.store?.name === helpStore);
    }
  }, [tab, helpStore, allCasts, currentStoreName]);

  const addBlocked = shiftRequestsLocked || shiftSlotsLocked || periodShiftConfirmed;

  const handleSave = async () => {
    if (!castId || addBlocked) return;
    setSaving(true);

    await fetch("/api/shifts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "addCast",
        dayId,
        castId,
        startTime: parseFloat(startTime),
        endTime: parseFloat(endTime),
        memo: memo || null,
      }),
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
            シフトが確定済みのため、ここからの追加はできません。シフト表の「シフトを編集する」で確定表示をオフにしてから編集してください。
          </p>
        )}
        {/* タブ切り替え */}
        <div className="flex border-b border-gray-300">
          <button
            className={`px-4 py-1.5 text-sm font-medium border-b-2 transition-colors ${
              tab === "own"
                ? "border-purple-500 text-purple-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => { setTab("own"); setCastId(""); }}
          >
            {currentStoreName}
          </button>
          <button
            className={`px-4 py-1.5 text-sm font-medium border-b-2 transition-colors ${
              tab === "help"
                ? "border-orange-500 text-orange-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => { setTab("help"); setCastId(""); }}
          >
            ヘルプ
          </button>
        </div>

        {/* ヘルプタブ: 店舗選択 */}
        {tab === "help" && (
          <div className="space-y-1">
            <Label>店舗を選択</Label>
            <select
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              value={helpStore}
              onChange={(e) => { setHelpStore(e.target.value); setCastId(""); }}
            >
              <option value="">店舗を選択</option>
              {otherStores.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
        )}

        {/* キャスト選択 */}
        <div className="space-y-1">
          <Label>キャスト</Label>
          <select
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            value={castId}
            onChange={(e) => setCastId(e.target.value)}
          >
            <option value="">キャストを選択</option>
            {filteredCasts.map((cast) => {
              const isAssigned = existingSlots.includes(cast.id);
              return (
                <option key={cast.id} value={cast.id} disabled={isAssigned}>
                  {cast.name}
                  {isAssigned ? " [配置済]" : ""}
                </option>
              );
            })}
          </select>
          {tab === "help" && !helpStore && (
            <p className="text-xs text-gray-400">先に店舗を選択してください</p>
          )}
        </div>

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
              {TIME_SLOTS.filter((s) => s > parseFloat(startTime)).map(
                (slot) => (
                  <option key={slot} value={slot.toString()}>
                    {formatTimeSlot(slot)}
                  </option>
                )
              )}
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
            disabled={!castId || saving || addBlocked}
            className="bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white"
          >
            {saving ? "保存中..." : "追加"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
