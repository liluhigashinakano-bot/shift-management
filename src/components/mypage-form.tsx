"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/modal";
import { TIME_SLOTS, formatTimeSlot } from "@/lib/shift-utils";

type Period = {
  id: string;
  year: number;
  month: number;
  half: string;
  store: { id: string; name: string };
  shiftDays: { id: string; date: string; dayOfWeek: string }[];
};

type Request = {
  id: string;
  castId: string;
  periodId: string;
  date: string;
  startTime: number;
  endTime: number;
  status: string;
  notes: string | null;
  period: { store: { name: string }; year: number; month: number; half: string };
};

type Props = {
  userId: string;
  userName: string;
  storeName: string | null;
  periods: Period[];
  initialRequests: Request[];
};

export function MypageForm({ userId, userName, storeName, periods, initialRequests }: Props) {
  const [requests, setRequests] = useState(initialRequests);
  const [addModal, setAddModal] = useState(false);
  const [editModal, setEditModal] = useState<Request | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState(periods[0]?.id || "");
  const [selectedDate, setSelectedDate] = useState("");
  const [startTime, setStartTime] = useState("20");
  const [endTime, setEndTime] = useState("25");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    const res = await fetch(`/api/requests?castId=${userId}`);
    if (res.ok) setRequests(await res.json());
  };

  // 追加
  const handleAdd = async () => {
    if (!selectedPeriod || !selectedDate) return;
    setSaving(true);
    await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create",
        castId: userId,
        periodId: selectedPeriod,
        date: selectedDate,
        startTime: parseFloat(startTime),
        endTime: parseFloat(endTime),
        notes: notes || null,
      }),
    });
    setSaving(false);
    setAddModal(false);
    setNotes("");
    reload();
  };

  // 編集
  const handleEdit = async () => {
    if (!editModal) return;
    setSaving(true);
    // 既存を削除して再作成
    await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id: editModal.id }),
    });
    await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create",
        castId: userId,
        periodId: editModal.periodId,
        date: editModal.date,
        startTime: parseFloat(startTime),
        endTime: parseFloat(endTime),
        notes: notes || null,
      }),
    });
    setSaving(false);
    setEditModal(null);
    setNotes("");
    reload();
  };

  // 削除
  const handleDelete = async (id: string) => {
    if (!confirm("このシフト希望を削除しますか？")) return;
    await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    reload();
  };

  const openEdit = (req: Request) => {
    setStartTime(req.startTime.toString());
    setEndTime(req.endTime.toString());
    setNotes(req.notes || "");
    setEditModal(req);
  };

  // 選択中の期間の日付一覧
  const currentPeriod = periods.find((p) => p.id === selectedPeriod);

  return (
    <div className="space-y-6">
      {/* 提出済みシフト希望一覧 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-purple-700">提出済みシフト希望</h2>
          <Button
            className="bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white"
            onClick={() => setAddModal(true)}
          >
            + シフト希望を追加
          </Button>
        </div>

        {requests.length === 0 ? (
          <div className="border border-gray-300 rounded-md px-3 py-8 text-center text-gray-400">
            シフト希望がまだ提出されていません
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-purple-50">
                  <th className="border border-gray-300 px-3 py-2 text-left">店舗</th>
                  <th className="border border-gray-300 px-3 py-2 text-left">期間</th>
                  <th className="border border-gray-300 px-3 py-2 text-left">日付</th>
                  <th className="border border-gray-300 px-3 py-2 text-center">出勤</th>
                  <th className="border border-gray-300 px-3 py-2 text-center">退勤</th>
                  <th className="border border-gray-300 px-3 py-2 text-center">時間</th>
                  <th className="border border-gray-300 px-3 py-2 text-left">メモ</th>
                  <th className="border border-gray-300 px-3 py-2 text-center w-24">操作</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => {
                  const d = new Date(r.date);
                  const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
                  const hours = r.endTime - r.startTime;
                  const halfLabel = r.period.half === "first" ? "前半" : "後半";
                  return (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="border border-gray-300 px-3 py-1.5 text-xs">{r.period.store.name}</td>
                      <td className="border border-gray-300 px-3 py-1.5 text-xs">{r.period.month}月{halfLabel}</td>
                      <td className="border border-gray-300 px-3 py-1.5">{dateStr}</td>
                      <td className="border border-gray-300 px-3 py-1.5 text-center">{formatTimeSlot(r.startTime)}</td>
                      <td className="border border-gray-300 px-3 py-1.5 text-center">{formatTimeSlot(r.endTime)}</td>
                      <td className="border border-gray-300 px-3 py-1.5 text-center">{hours}h</td>
                      <td className="border border-gray-300 px-3 py-1.5 text-xs text-gray-500">{r.notes || ""}</td>
                      <td className="border border-gray-300 px-2 py-1.5 text-center">
                        <button className="text-xs text-blue-600 hover:text-blue-800 mr-2" onClick={() => openEdit(r)}>
                          編集
                        </button>
                        <button className="text-xs text-red-400 hover:text-red-600" onClick={() => handleDelete(r.id)}>
                          削除
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 追加モーダル */}
      {addModal && (
        <Modal open title="シフト希望を追加" onClose={() => setAddModal(false)}>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>シフト期間</Label>
              <select
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                value={selectedPeriod}
                onChange={(e) => { setSelectedPeriod(e.target.value); setSelectedDate(""); }}
              >
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.store.name} - {p.month}月{p.half === "first" ? "前半" : "後半"}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>日付</Label>
              <select
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              >
                <option value="">日付を選択</option>
                {currentPeriod?.shiftDays.map((d) => {
                  const dt = new Date(d.date);
                  const isWeekend = d.dayOfWeek === "土" || d.dayOfWeek === "日";
                  return (
                    <option key={d.id} value={d.date}>
                      {dt.getMonth() + 1}/{dt.getDate()}({d.dayOfWeek}){isWeekend ? " ★" : ""}
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>出勤時間</Label>
                <select className="w-full border border-gray-300 rounded px-2 py-2 text-sm" value={startTime} onChange={(e) => setStartTime(e.target.value)}>
                  {TIME_SLOTS.map((s) => <option key={s} value={s.toString()}>{formatTimeSlot(s)}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label>退勤時間</Label>
                <select className="w-full border border-gray-300 rounded px-2 py-2 text-sm" value={endTime} onChange={(e) => setEndTime(e.target.value)}>
                  {TIME_SLOTS.filter((s) => s > parseFloat(startTime)).map((s) => <option key={s} value={s.toString()}>{formatTimeSlot(s)}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>メモ（任意）</Label>
              <input
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="ラストまで残れます、等"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4 pt-3 border-t">
            <Button variant="outline" onClick={() => setAddModal(false)}>キャンセル</Button>
            <Button onClick={handleAdd} disabled={saving || !selectedPeriod || !selectedDate} className="bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white">
              {saving ? "保存中..." : "提出"}
            </Button>
          </div>
        </Modal>
      )}

      {/* 編集モーダル */}
      {editModal && (
        <Modal open title="シフト希望を編集" onClose={() => setEditModal(null)}>
          <div className="text-sm text-gray-500 mb-3">
            {editModal.period.store.name} - {new Date(editModal.date).getMonth() + 1}/{new Date(editModal.date).getDate()}
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>出勤時間</Label>
                <select className="w-full border border-gray-300 rounded px-2 py-2 text-sm" value={startTime} onChange={(e) => setStartTime(e.target.value)}>
                  {TIME_SLOTS.map((s) => <option key={s} value={s.toString()}>{formatTimeSlot(s)}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label>退勤時間</Label>
                <select className="w-full border border-gray-300 rounded px-2 py-2 text-sm" value={endTime} onChange={(e) => setEndTime(e.target.value)}>
                  {TIME_SLOTS.filter((s) => s > parseFloat(startTime)).map((s) => <option key={s} value={s.toString()}>{formatTimeSlot(s)}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>メモ（任意）</Label>
              <input
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="ラストまで残れます、等"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4 pt-3 border-t">
            <Button variant="outline" onClick={() => setEditModal(null)}>キャンセル</Button>
            <Button onClick={handleEdit} disabled={saving} className="bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white">
              {saving ? "保存中..." : "変更を保存"}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
