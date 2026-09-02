"use client";

import { useState } from "react";
import { Modal } from "@/components/modal";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { getJapaneseDayOfWeek } from "@/lib/shift-utils";
import { postJson } from "@/lib/api-request";

type ShiftDay = {
  id: string;
  date: string;
  dayOfWeek: string;
  targetBudget: number | null;
  eventName: string | null;
  expectedVisitors: string | null;
  notes: string | null;
  employeeOnDuty: string | null;
  shiftSlots?: { id: string }[];
};

type Props = {
  day: ShiftDay;
  onClose: () => void;
  onSaved: () => void;
};

/** ShiftDay.notes は {"text":..., "slotMemos":{...}} の JSON。壊れていても落とさない */
function parseNotes(raw: string | null): { text: string; rest: Record<string, unknown> } {
  if (!raw) return { text: "", rest: {} };
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== "object") return { text: "", rest: {} };
    const { text, ...rest } = parsed;
    return { text: typeof text === "string" ? text : "", rest };
  } catch {
    return { text: raw, rest: {} };
  }
}

export function DayInfoEditor({ day, onClose, onSaved }: Props) {
  const d = new Date(day.date);
  const label = `${d.getMonth() + 1}/${d.getDate()}(${getJapaneseDayOfWeek(d)})`;

  const totalHours = (day.shiftSlots?.length ?? 0) * 0.5;
  const autoBudget = totalHours > 0 ? totalHours * 6000 : 0;

  const initialNotes = parseNotes(day.notes);

  const [eventName, setEventName] = useState(day.eventName ?? "");
  const [expectedVisitors, setExpectedVisitors] = useState(day.expectedVisitors ?? "");
  const [notes, setNotes] = useState(initialNotes.text);
  const [employeeOnDuty, setEmployeeOnDuty] = useState(day.employeeOnDuty ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      // slotMemos などを保ったまま text だけ入れ替える
      const nextNotes = JSON.stringify({ ...initialNotes.rest, text: notes || "" });
      const result = await postJson(
        "/api/shifts",
        {
          action: "updateDay",
          dayId: day.id,
          targetBudget: autoBudget || null,
          eventName: eventName || null,
          expectedVisitors: expectedVisitors || null,
          notes: nextNotes,
          employeeOnDuty: employeeOnDuty || null,
        },
        { fallbackMessage: "日別情報を保存できませんでした" },
      );
      // 失敗したら窓を閉じない（閉じると成功したように見える）
      if (!result.ok) return;
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open title={`${label} - 日別情報`} onClose={onClose}>
      <div className="space-y-3">
        <div className="space-y-1">
          <Label>予算（自動計算）</Label>
          <div className="rounded border bg-gray-50 px-3 py-2 text-sm text-gray-700">
            {autoBudget > 0 ? `${autoBudget.toLocaleString()} 円` : "-"}
            <span className="ml-2 text-xs text-gray-500">
              （労働時間 {totalHours} h × 6,000 円）
            </span>
          </div>
        </div>
        <div className="space-y-1">
          <Label>出勤社員</Label>
          <Input
            value={employeeOnDuty}
            onChange={(e) => setEmployeeOnDuty(e.target.value)}
            autoComplete="off"
            name={`employeeOnDuty-${day.id}`}
          />
        </div>
        <div className="space-y-1">
          <Label>企画名</Label>
          <Input
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
            autoComplete="off"
            name={`eventName-${day.id}`}
          />
        </div>
        <div className="space-y-1">
          <Label>ご来店予定</Label>
          <Input
            value={expectedVisitors}
            onChange={(e) => setExpectedVisitors(e.target.value)}
            autoComplete="off"
            name={`expectedVisitors-${day.id}`}
          />
        </div>
        <div className="space-y-1">
          <Label>備考</Label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            autoComplete="off"
            name={`notes-${day.id}`}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            キャンセル
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white"
          >
            {saving ? "保存中..." : "保存"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
