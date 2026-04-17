"use client";

import { useState } from "react";
import { Modal } from "@/components/modal";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { getJapaneseDayOfWeek } from "@/lib/shift-utils";

type ShiftDay = {
  id: string;
  date: string;
  dayOfWeek: string;
  targetBudget: number | null;
  eventName: string | null;
  expectedVisitors: string | null;
  notes: string | null;
  employeeOnDuty: string | null;
};

type Props = {
  day: ShiftDay;
  onClose: () => void;
  onSaved: () => void;
};

export function DayInfoEditor({ day, onClose, onSaved }: Props) {
  const d = new Date(day.date);
  const label = `${d.getMonth() + 1}/${d.getDate()}(${getJapaneseDayOfWeek(d)})`;

  const [targetBudget, setTargetBudget] = useState(
    day.targetBudget?.toString() ?? ""
  );
  const [eventName, setEventName] = useState(day.eventName ?? "");
  const [expectedVisitors, setExpectedVisitors] = useState(
    day.expectedVisitors ?? ""
  );
  const [notes, setNotes] = useState(() => {
    if (!day.notes) return "";
    try {
      const parsed = JSON.parse(day.notes);
      return parsed.text || "";
    } catch {
      return day.notes;
    }
  });
  const [employeeOnDuty, setEmployeeOnDuty] = useState(
    day.employeeOnDuty ?? ""
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await fetch("/api/shifts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "updateDay",
        dayId: day.id,
        targetBudget: targetBudget ? parseInt(targetBudget) : null,
        eventName: eventName || null,
        expectedVisitors: expectedVisitors || null,
        notes: (() => {
          // slotMemosを保持してtextだけ更新
          let parsed: any = {};
          if (day.notes) {
            try { parsed = JSON.parse(day.notes); } catch { parsed = {}; }
          }
          parsed.text = notes || "";
          return JSON.stringify(parsed);
        })(),
        employeeOnDuty: employeeOnDuty || null,
      }),
    });
    setSaving(false);
    onSaved();
    onClose();
  };

  return (
    <Modal open title={`${label} - 日別情報`} onClose={onClose}>
      <div className="space-y-3">
        <div className="space-y-1">
          <Label>目標予算 (円)</Label>
          <Input
            type="number"
            value={targetBudget}
            onChange={(e) => setTargetBudget(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>出勤社員</Label>
          <Input
            value={employeeOnDuty}
            onChange={(e) => setEmployeeOnDuty(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>企画名</Label>
          <Input
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>ご来店予定</Label>
          <Input
            value={expectedVisitors}
            onChange={(e) => setExpectedVisitors(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>備考</Label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
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
