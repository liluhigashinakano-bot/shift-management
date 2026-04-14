"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/modal";
import { TIME_SLOTS, formatTimeSlot } from "@/lib/shift-utils";

type Day = { id: string; date: string; dayOfWeek: string };
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
  day: { date: string; dayOfWeek: string };
};

type Props = {
  periodId: string;
  days: Day[];
  initialAdjustments: Adjustment[];
  allCasts: Cast[];
};

export function AdjustmentTable({
  periodId,
  days,
  initialAdjustments,
  allCasts,
}: Props) {
  const [adjustments, setAdjustments] = useState(initialAdjustments);
  const [addModal, setAddModal] = useState(false);
  const [castId, setCastId] = useState("");
  const [dayId, setDayId] = useState("");
  const [originalStart, setOriginalStart] = useState("20");
  const [originalEnd, setOriginalEnd] = useState("25");
  const [adjustedStart, setAdjustedStart] = useState("");
  const [adjustedEnd, setAdjustedEnd] = useState("");
  const [adjustAction, setAdjustAction] = useState("cut");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    const res = await fetch(`/api/adjustments?periodId=${periodId}`);
    if (res.ok) setAdjustments(await res.json());
  };

  const handleSubmit = async () => {
    if (!castId || !dayId) return;
    setSaving(true);

    await fetch("/api/adjustments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create",
        dayId,
        castId,
        originalStart: parseFloat(originalStart),
        originalEnd: parseFloat(originalEnd),
        adjustedStart: adjustedStart ? parseFloat(adjustedStart) : null,
        adjustedEnd: adjustedEnd ? parseFloat(adjustedEnd) : null,
        adjustAction,
        reason: reason || null,
      }),
    });

    setSaving(false);
    setAddModal(false);
    setCastId("");
    setDayId("");
    setReason("");
    reload();
  };

  const deleteAdj = async (id: string) => {
    if (!confirm("この調整記録を削除しますか？")) return;
    await fetch("/api/adjustments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    reload();
  };

  const actionLabel: Record<string, { label: string; color: string }> = {
    cut: { label: "カット", color: "bg-red-100 text-red-700" },
    shorten: { label: "短縮", color: "bg-yellow-100 text-yellow-700" },
    move: { label: "時間変更", color: "bg-blue-100 text-blue-700" },
  };

  // 調整（shorten/move）と削除（cut）に分離
  const adjusted = adjustments.filter((a) => a.action !== "cut");
  const deleted = adjustments.filter((a) => a.action === "cut");
  const [tab, setTab] = useState<"adjusted" | "deleted">("adjusted");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button
          className="bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white"
          onClick={() => setAddModal(true)}
        >
          + 調整記録を追加
        </Button>
        <span className="text-sm text-gray-500">
          調整: {adjusted.length}件 / 削除: {deleted.length}件
        </span>
      </div>

      {/* タブ切り替え */}
      <div className="flex border-b border-gray-300">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "adjusted"
              ? "border-purple-500 text-purple-700"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
          onClick={() => setTab("adjusted")}
        >
          調整一覧（{adjusted.length}件）
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "deleted"
              ? "border-red-500 text-red-700"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
          onClick={() => setTab("deleted")}
        >
          削除一覧（{deleted.length}件）
        </button>
      </div>

      {/* 調整一覧タブ */}
      {tab === "adjusted" && (
        adjusted.length === 0 ? (
          <div className="border border-gray-300 rounded-md px-3 py-8 text-center text-gray-400">
            時間調整の記録はまだありません
          </div>
        ) : (
          (() => {
            const grouped = new Map<string, Adjustment[]>();
            adjusted.forEach((a) => {
              if (!grouped.has(a.castId)) grouped.set(a.castId, []);
              grouped.get(a.castId)!.push(a);
            });
            return [...grouped.entries()].map(([castId, castAdjs]) => {
              const cast = castAdjs[0].cast;
              return (
                <div key={castId} className="mb-4">
                  <h3 className="text-sm font-bold text-purple-700 bg-purple-50 px-3 py-1.5 rounded-t-md border border-purple-200">
                    {cast.name}
                    <span className="text-xs font-normal text-purple-500 ml-2">
                      {cast.store?.name || "未所属"} / {castAdjs.length}件
                    </span>
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="border border-gray-300 px-3 py-1.5 text-left">日付</th>
                          <th className="border border-gray-300 px-3 py-1.5 text-center">希望時間</th>
                          <th className="border border-gray-300 px-3 py-1.5 text-center">アクション</th>
                          <th className="border border-gray-300 px-3 py-1.5 text-center">調整後</th>
                          <th className="border border-gray-300 px-3 py-1.5 text-left">理由</th>
                          <th className="border border-gray-300 px-3 py-1.5 text-center w-16">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {castAdjs.map((a) => {
                          const d = new Date(a.day.date);
                          const dateStr = `${d.getMonth() + 1}/${d.getDate()}(${a.day.dayOfWeek})`;
                          const al = actionLabel[a.action] || actionLabel.move;
                          return (
                            <tr key={a.id} className="hover:bg-gray-50">
                              <td className="border border-gray-300 px-3 py-1.5">{dateStr}</td>
                              <td className="border border-gray-300 px-3 py-1.5 text-center">
                                {formatTimeSlot(a.originalStart)} - {formatTimeSlot(a.originalEnd)}
                              </td>
                              <td className="border border-gray-300 px-3 py-1.5 text-center">
                                <span className={`px-2 py-0.5 rounded-full text-xs ${al.color}`}>{al.label}</span>
                              </td>
                              <td className="border border-gray-300 px-3 py-1.5 text-center">
                                {a.adjustedStart !== null && a.adjustedEnd !== null
                                  ? `${formatTimeSlot(a.adjustedStart)} - ${formatTimeSlot(a.adjustedEnd)}`
                                  : "-"}
                              </td>
                              <td className="border border-gray-300 px-3 py-1.5 text-xs text-gray-500">{a.reason || ""}</td>
                              <td className="border border-gray-300 px-2 py-1.5 text-center">
                                <button className="text-xs text-gray-400 hover:text-red-500" onClick={() => deleteAdj(a.id)}>削除</button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            });
          })()
        )
      )}

      {/* 削除一覧タブ */}
      {tab === "deleted" && (
        deleted.length === 0 ? (
          <div className="border border-gray-300 rounded-md px-3 py-8 text-center text-gray-400">
            削除されたキャストはまだありません
          </div>
        ) : (
          (() => {
            const grouped = new Map<string, Adjustment[]>();
            deleted.forEach((a) => {
              if (!grouped.has(a.castId)) grouped.set(a.castId, []);
              grouped.get(a.castId)!.push(a);
            });
            return [...grouped.entries()].map(([castId, castAdjs]) => {
              const cast = castAdjs[0].cast;
              return (
                <div key={castId} className="mb-4">
                  <h3 className="text-sm font-bold text-red-700 bg-red-50 px-3 py-1.5 rounded-t-md border border-red-200">
                    {cast.name}
                    <span className="text-xs font-normal text-red-500 ml-2">
                      {cast.store?.name || "未所属"} / {castAdjs.length}件削除
                    </span>
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="bg-red-50/50">
                          <th className="border border-gray-300 px-3 py-1.5 text-left">日付</th>
                          <th className="border border-gray-300 px-3 py-1.5 text-center">希望出勤</th>
                          <th className="border border-gray-300 px-3 py-1.5 text-center">希望退勤</th>
                          <th className="border border-gray-300 px-3 py-1.5 text-left">理由</th>
                          <th className="border border-gray-300 px-3 py-1.5 text-center w-16">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {castAdjs.map((a) => {
                          const d = new Date(a.day.date);
                          const dateStr = `${d.getMonth() + 1}/${d.getDate()}(${a.day.dayOfWeek})`;
                          return (
                            <tr key={a.id} className="hover:bg-red-50/30">
                              <td className="border border-gray-300 px-3 py-1.5">{dateStr}</td>
                              <td className="border border-gray-300 px-3 py-1.5 text-center">{formatTimeSlot(a.originalStart)}</td>
                              <td className="border border-gray-300 px-3 py-1.5 text-center">{formatTimeSlot(a.originalEnd)}</td>
                              <td className="border border-gray-300 px-3 py-1.5 text-xs text-gray-500">{a.reason || ""}</td>
                              <td className="border border-gray-300 px-2 py-1.5 text-center">
                                <button className="text-xs text-gray-400 hover:text-red-500" onClick={() => deleteAdj(a.id)}>取消</button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            });
          })()
        )
      )}

      {/* 調整追加モーダル */}
      {addModal && (
        <Modal open title="調整記録を追加" onClose={() => setAddModal(false)}>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>キャスト</Label>
              <select
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                value={castId}
                onChange={(e) => setCastId(e.target.value)}
              >
                <option value="">選択</option>
                {allCasts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.storeName ? ` (${c.storeName})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>日付</Label>
              <select
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                value={dayId}
                onChange={(e) => setDayId(e.target.value)}
              >
                <option value="">選択</option>
                {days.map((d) => {
                  const dt = new Date(d.date);
                  return (
                    <option key={d.id} value={d.id}>
                      {dt.getMonth() + 1}/{dt.getDate()}({d.dayOfWeek})
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>元の出勤</Label>
                <select className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" value={originalStart} onChange={(e) => setOriginalStart(e.target.value)}>
                  {TIME_SLOTS.map((s) => <option key={s} value={s.toString()}>{formatTimeSlot(s)}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label>元の退勤</Label>
                <select className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" value={originalEnd} onChange={(e) => setOriginalEnd(e.target.value)}>
                  {TIME_SLOTS.filter((s) => s > parseFloat(originalStart)).map((s) => <option key={s} value={s.toString()}>{formatTimeSlot(s)}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>アクション</Label>
              <select
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                value={adjustAction}
                onChange={(e) => setAdjustAction(e.target.value)}
              >
                <option value="cut">カット（シフト削除）</option>
                <option value="shorten">短縮</option>
                <option value="move">時間変更</option>
              </select>
            </div>
            {adjustAction !== "cut" && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>調整後 出勤</Label>
                  <select className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" value={adjustedStart} onChange={(e) => setAdjustedStart(e.target.value)}>
                    <option value="">-</option>
                    {TIME_SLOTS.map((s) => <option key={s} value={s.toString()}>{formatTimeSlot(s)}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>調整後 退勤</Label>
                  <select className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" value={adjustedEnd} onChange={(e) => setAdjustedEnd(e.target.value)}>
                    <option value="">-</option>
                    {TIME_SLOTS.filter((s) => s > parseFloat(adjustedStart || "19")).map((s) => <option key={s} value={s.toString()}>{formatTimeSlot(s)}</option>)}
                  </select>
                </div>
              </div>
            )}
            <div className="space-y-1">
              <Label>理由</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="人数過多、予算調整など" />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4 pt-3 border-t">
            <Button variant="outline" onClick={() => setAddModal(false)}>キャンセル</Button>
            <Button onClick={handleSubmit} disabled={saving || !castId || !dayId} className="bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white">
              {saving ? "保存中..." : "追加"}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
