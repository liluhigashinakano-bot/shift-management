"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/modal";
import { TIME_SLOTS, formatTimeSlot, getJapaneseDayOfWeek } from "@/lib/shift-utils";

type Day = { id: string; date: string; dayOfWeek: string };
type Cast = { id: string; name: string; storeName: string | null };
type Request = {
  id: string;
  periodId: string;
  castId: string;
  date: string;
  startTime: number;
  endTime: number;
  status: string;
  notes: string | null;
  cast: { id: string; name: string; store: { name: string } | null };
};

type Props = {
  periodId: string;
  /** periodId → 締切済みか */
  periodLocks: Record<string, boolean>;
  days: Day[];
  initialRequests: Request[];
  allCasts: Cast[];
  userRole: string;
  userId: string;
};

export function RequestForm({
  periodId,
  periodLocks,
  days,
  initialRequests,
  allCasts,
  userRole,
  userId,
}: Props) {
  const [requests, setRequests] = useState(initialRequests);
  const [addModal, setAddModal] = useState(false);
  const [selectedCast, setSelectedCast] = useState("");
  const [entries, setEntries] = useState<
    Record<string, { checked: boolean; start: string; end: string; notes: string }>
  >(() => {
    const init: Record<string, { checked: boolean; start: string; end: string; notes: string }> = {};
    days.forEach((d) => {
      init[d.date] = { checked: false, start: "20", end: "25", notes: "" };
    });
    return init;
  });
  const [saving, setSaving] = useState(false);

  const isAdmin = userRole === "admin" || userRole === "employee";

  const lockedFor = (pid: string) => periodLocks[pid] ?? false;
  const currentLocked = lockedFor(periodId);

  const reload = async () => {
    const res = await fetch(`/api/requests?periodId=${periodId}`);
    if (res.ok) setRequests(await res.json());
  };

  const handleSubmit = async () => {
    if (currentLocked) return;
    const castId = isAdmin ? selectedCast : userId;
    if (!castId) return;

    const selected = Object.entries(entries)
      .filter(([, v]) => v.checked)
      .map(([date, v]) => ({
        date,
        startTime: parseFloat(v.start),
        endTime: parseFloat(v.end),
        notes: v.notes || undefined,
      }));

    if (selected.length === 0) return;
    setSaving(true);

    await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "bulkCreate",
        castId,
        periodId,
        entries: selected,
      }),
    });

    setSaving(false);
    setAddModal(false);
    // チェックをリセット
    setEntries((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => { next[k] = { ...next[k], checked: false }; });
      return next;
    });
    reload();
  };

  const updateStatus = async (id: string, status: string) => {
    const row = requests.find((x) => x.id === id);
    if (row && lockedFor(row.periodId)) return;
    await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "updateStatus", id, status }),
    });
    reload();
  };

  const deleteRequest = async (id: string) => {
    const row = requests.find((x) => x.id === id);
    if (row && lockedFor(row.periodId)) return;
    if (!confirm("この希望を削除しますか？")) return;
    await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    reload();
  };

  // キャストごとにグループ化
  const groupedByCast = new Map<string, Request[]>();
  requests.forEach((r) => {
    const key = r.castId;
    if (!groupedByCast.has(key)) groupedByCast.set(key, []);
    groupedByCast.get(key)!.push(r);
  });

  const statusLabel: Record<string, { label: string; color: string }> = {
    pending: { label: "未反映", color: "bg-yellow-100 text-yellow-700" },
    approved: { label: "反映済み", color: "bg-green-100 text-green-700" },
    rejected: { label: "却下", color: "bg-red-100 text-red-700" },
    adjusted: { label: "調整済", color: "bg-blue-100 text-blue-700" },
  };

  return (
    <div className="space-y-4">
      {currentLocked && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          この店舗・期間のシフト希望は締め切りです。登録・削除はできません（解除はシフト表画面の「締め切り解除」から）。
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button
          className="bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white"
          onClick={() => setAddModal(true)}
          disabled={currentLocked}
        >
          + シフト希望を登録
        </Button>
        <span className="text-sm text-gray-500">
          登録済み: {requests.length}件（{groupedByCast.size}名）
        </span>
      </div>

      {/* 希望一覧テーブル（スマホは余白・文字を詰め、備考は横スクロール） */}
      <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
        <table className="w-full border-collapse text-[11px] leading-tight sm:text-sm sm:leading-normal">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-1.5 py-1 text-left sm:px-3 sm:py-2">キャスト</th>
              <th className="border border-gray-300 px-1.5 py-1 text-left sm:px-3 sm:py-2">所属</th>
              <th className="border border-gray-300 px-1.5 py-1 text-left sm:px-3 sm:py-2">日付</th>
              <th className="border border-gray-300 px-1 py-1 text-center sm:px-3 sm:py-2">出勤</th>
              <th className="border border-gray-300 px-1 py-1 text-center sm:px-3 sm:py-2">退勤</th>
              <th className="border border-gray-300 px-1 py-1 text-center sm:px-3 sm:py-2">時間</th>
              <th className="border border-gray-300 px-1 py-1 text-center sm:px-3 sm:py-2">ステータス</th>
              <th className="border border-gray-300 px-1.5 py-1 text-left sm:px-3 sm:py-2 min-w-[5.5rem]">
                備考
              </th>
              {isAdmin && (
                <th className="border border-gray-300 px-1.5 py-1 text-center sm:px-3 sm:py-2">操作</th>
              )}
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 ? (
              <tr>
                <td
                  colSpan={isAdmin ? 9 : 8}
                  className="border border-gray-300 px-2 py-4 text-center text-gray-400 sm:py-8"
                >
                  シフト希望がまだ登録されていません
                </td>
              </tr>
            ) : (
              requests.map((r) => {
                const d = new Date(r.date);
                const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
                const hours = r.endTime - r.startTime;
                const st = statusLabel[r.status] || statusLabel.pending;
                const cell =
                  "border border-gray-300 px-1.5 py-0.5 align-middle sm:px-3 sm:py-1.5";
                return (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className={`${cell} font-medium`}>{r.cast.name}</td>
                    <td className={`${cell} text-gray-500 text-[10px] sm:text-xs`}>
                      {r.cast.store?.name || "-"}
                    </td>
                    <td className={cell}>{dateStr}</td>
                    <td className={`${cell} text-center`}>{formatTimeSlot(r.startTime)}</td>
                    <td className={`${cell} text-center`}>{formatTimeSlot(r.endTime)}</td>
                    <td className={`${cell} text-center`}>{hours}h</td>
                    <td className={`${cell} text-center`}>
                      <span
                        className={`inline-block whitespace-nowrap px-1 py-0.5 rounded-full text-[10px] sm:px-2 sm:text-xs ${st.color}`}
                      >
                        {st.label}
                      </span>
                    </td>
                    <td className={`${cell} text-gray-500`}>
                      <div className="max-w-[7rem] overflow-x-auto overflow-y-hidden whitespace-nowrap py-0.5 [scrollbar-width:thin] sm:max-w-[20rem] sm:whitespace-normal sm:overflow-visible">
                        {r.notes || ""}
                      </div>
                    </td>
                    {isAdmin && (
                      <td className={`${cell} text-center px-1 sm:px-2`}>
                        <button
                          type="button"
                          disabled={lockedFor(r.periodId)}
                          className={`text-[10px] sm:text-xs ${
                            lockedFor(r.periodId)
                              ? "text-gray-300 cursor-not-allowed"
                              : "text-red-400 hover:text-red-600"
                          }`}
                          onClick={() => deleteRequest(r.id)}
                        >
                          削除
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 希望登録モーダル */}
      {addModal && (
        <Modal open title="シフト希望登録" onClose={() => setAddModal(false)}>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            {isAdmin && (
              <div className="space-y-2">
                <Label>キャスト</Label>
                <select
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  value={selectedCast}
                  onChange={(e) => setSelectedCast(e.target.value)}
                >
                  <option value="">キャストを選択</option>
                  {allCasts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.storeName ? ` (${c.storeName})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-2">
              <Label>出勤希望日を選択</Label>
              {days.map((day) => {
                const d = new Date(day.date);
                const dow = getJapaneseDayOfWeek(d);
                const dateStr = `${d.getMonth() + 1}/${d.getDate()}(${dow})`;
                const entry = entries[day.date];
                const isWeekend = dow === "土" || dow === "日";

                return (
                  <div
                    key={day.date}
                    className={`border rounded-md p-2 ${
                      entry?.checked ? "border-pink-300 bg-pink-50" : "border-gray-200"
                    }`}
                  >
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={entry?.checked || false}
                        onChange={(e) =>
                          setEntries((prev) => ({
                            ...prev,
                            [day.date]: { ...prev[day.date], checked: e.target.checked },
                          }))
                        }
                        className="accent-pink-600"
                      />
                      <span className={`font-medium ${isWeekend ? "text-red-500" : ""}`}>
                        {dateStr}
                      </span>
                    </label>
                    {entry?.checked && (
                      <div className="mt-2 ml-6 flex items-center gap-2">
                        <select
                          className="border border-gray-300 rounded px-2 py-1 text-xs"
                          value={entry.start}
                          onChange={(e) =>
                            setEntries((prev) => ({
                              ...prev,
                              [day.date]: { ...prev[day.date], start: e.target.value },
                            }))
                          }
                        >
                          {TIME_SLOTS.map((s) => (
                            <option key={s} value={s.toString()}>
                              {formatTimeSlot(s)}
                            </option>
                          ))}
                        </select>
                        <span className="text-xs">〜</span>
                        <select
                          className="border border-gray-300 rounded px-2 py-1 text-xs"
                          value={entry.end}
                          onChange={(e) =>
                            setEntries((prev) => ({
                              ...prev,
                              [day.date]: { ...prev[day.date], end: e.target.value },
                            }))
                          }
                        >
                          {TIME_SLOTS.filter((s) => s > parseFloat(entry.start)).map((s) => (
                            <option key={s} value={s.toString()}>
                              {formatTimeSlot(s)}
                            </option>
                          ))}
                        </select>
                        <Input
                          className="w-24 h-7 text-xs"
                          placeholder="備考"
                          value={entry.notes}
                          onChange={(e) =>
                            setEntries((prev) => ({
                              ...prev,
                              [day.date]: { ...prev[day.date], notes: e.target.value },
                            }))
                          }
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4 pt-3 border-t">
            <Button variant="outline" onClick={() => setAddModal(false)}>
              キャンセル
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={saving || (isAdmin && !selectedCast) || currentLocked}
              className="bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white"
            >
              {saving ? "登録中..." : "希望を登録"}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
