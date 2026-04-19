"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/modal";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { TIME_SLOTS, formatTimeSlot } from "@/lib/shift-utils";

type Props = {
  dayId: string;
  dayLabel: string;
  castId: string;
  castName: string;
  currentStart: number;
  currentEnd: number;
  memo: string | null;
  periodId: string;
  /** シフト表の追加・変更締切 */
  shiftSlotsLocked?: boolean;
  /** 「シフトを確定する」後 */
  periodShiftConfirmed?: boolean;
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
  castId,
  castName,
  currentStart,
  currentEnd,
  memo,
  periodId,
  shiftSlotsLocked = false,
  periodShiftConfirmed = false,
  onClose,
  onSaved,
}: Props) {
  const sheetEditBlocked = shiftSlotsLocked || periodShiftConfirmed;
  const [mode, setMode] = useState<"menu" | "edit">("menu");
  const [newStart, setNewStart] = useState(currentStart.toString());
  const [newEnd, setNewEnd] = useState(currentEnd.toString());
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [requestInfo, setRequestInfo] = useState<RequestInfo>(null);
  const [loading, setLoading] = useState(true);

  // シフト希望情報を取得
  useEffect(() => {
    async function fetchRequest() {
      try {
        const res = await fetch(`/api/requests?periodId=${periodId}&castId=${castId}`);
        if (res.ok) {
          const requests = await res.json();
          // dayLabelから日付を特定して該当日の希望を探す
          const match = requests.find((r: any) => {
            const d = new Date(r.date);
            const label = `${d.getMonth() + 1}/${d.getDate()}`;
            return dayLabel.includes(label);
          });
          if (match) {
            setRequestInfo({
              startTime: match.startTime,
              endTime: match.endTime,
              notes: match.notes,
              date: match.date,
            });
          }
        }
      } catch { /* ignore */ }
      setLoading(false);
    }
    fetchRequest();
  }, [periodId, castId, dayLabel]);

  const handleDelete = async () => {
    if (sheetEditBlocked) return;
    setSaving(true);
    await fetch("/api/shifts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "removeCast",
        dayId,
        castId,
        reason: reason || null,
      }),
    });
    setSaving(false);
    onSaved();
    onClose();
  };

  const handleEdit = async () => {
    if (sheetEditBlocked) return;
    setSaving(true);
    await fetch("/api/shifts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "editCast",
        dayId,
        castId,
        newStart: parseFloat(newStart),
        newEnd: parseFloat(newEnd),
        reason: reason || null,
      }),
    });
    setSaving(false);
    onSaved();
    onClose();
  };

  const currentHours = currentEnd - currentStart;
  const hasChanged = requestInfo && (requestInfo.startTime !== currentStart || requestInfo.endTime !== currentEnd);

  if (mode === "menu") {
    return (
      <Modal open title={`${castName} - ${dayLabel}`} onClose={onClose}>
        <div className="space-y-3 mb-4">
          {shiftSlotsLocked && (
            <p className="text-xs text-sky-900 bg-sky-50 border border-sky-200 rounded-md px-3 py-2">
              シフト追加が締め切られているため、時間の変更・削除はできません。
            </p>
          )}
          {periodShiftConfirmed && (
            <p className="text-xs text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
              シフトが確定済みのため、時間の変更・削除はできません。シフト表の「シフトを編集する」で解除してください。
            </p>
          )}
          {/* シフト希望情報 */}
          {loading ? (
            <div className="text-xs text-gray-400">読み込み中...</div>
          ) : requestInfo ? (
            <div className="bg-blue-50 border border-blue-200 rounded-md p-2.5 space-y-1.5">
              <div className="text-[11px] font-bold text-blue-700">シフト希望（提出時）</div>
              <div className="text-sm text-blue-800">
                {formatTimeSlot(requestInfo.startTime)} 〜 {formatTimeSlot(requestInfo.endTime)}
                <span className="text-xs text-blue-600 ml-1">
                  （{requestInfo.endTime - requestInfo.startTime}h）
                </span>
              </div>
              {requestInfo.notes && (
                <div className="bg-yellow-50 border border-yellow-200 rounded px-2 py-1.5 text-xs text-yellow-800">
                  <span className="font-bold">メモ: </span>{requestInfo.notes}
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-gray-400 bg-gray-50 rounded p-2">シフト希望の登録なし（直接配置）</div>
          )}

          {/* 現在のシフト */}
          <div className={`rounded-md p-2.5 space-y-1 ${hasChanged ? "bg-orange-50 border border-orange-200" : "bg-gray-50 border border-gray-200"}`}>
            <div className="text-[11px] font-bold text-gray-700">
              現在のシフト
              {hasChanged && <span className="text-orange-600 ml-1">（希望から変更済）</span>}
            </div>
            <div className="text-sm text-gray-800">
              {formatTimeSlot(currentStart)} 〜 {formatTimeSlot(currentEnd)}
              <span className="text-xs text-gray-500 ml-1">（{currentHours}h）</span>
            </div>
            {hasChanged && requestInfo && (
              <div className="text-[10px] text-orange-600">
                差分: 出勤 {requestInfo.startTime !== currentStart ? `${formatTimeSlot(requestInfo.startTime)}→${formatTimeSlot(currentStart)}` : "変更なし"}
                {" / "}退勤 {requestInfo.endTime !== currentEnd ? `${formatTimeSlot(requestInfo.endTime)}→${formatTimeSlot(currentEnd)}` : "変更なし"}
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
            キャンセル
          </Button>
        </div>
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
            {formatTimeSlot(requestInfo.startTime)} 〜 {formatTimeSlot(requestInfo.endTime)}
          </span>
          {requestInfo.notes && (
            <span className="text-yellow-700 ml-2">メモ: {requestInfo.notes}</span>
          )}
        </div>
      )}
      <div className="text-xs text-gray-500 mb-3">
        現在: {formatTimeSlot(currentStart)} 〜 {formatTimeSlot(currentEnd)}（{currentHours}h）
      </div>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>出勤時間</Label>
            <select
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              value={newStart}
              disabled={sheetEditBlocked}
              onChange={(e) => setNewStart(e.target.value)}
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
