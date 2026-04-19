import assert from "node:assert/strict";
import { displaySlotForClockOut } from "./shift-utils";

function slotsForRange(castId: string, start: number, endExclusive: number) {
  const out: { timeSlot: number; castId: string }[] = [];
  for (let t = start; t < endExclusive; t += 0.5) {
    out.push({ timeSlot: t, castId });
  }
  return out;
}

// 25:00 終了 … 最後のスロット 24.5（24:30–25:00）→ 表示 25.0 行
{
  const day = slotsForRange("c1", 20, 25);
  assert.equal(displaySlotForClockOut(day, "c1"), 25);
}

// 25:30 終了 … 最後のスロット 25.0（25:00–25:30）→ 表示 25.5 行（:30）、25.0 行ではない
{
  const day = slotsForRange("c1", 20, 25.5);
  assert.equal(displaySlotForClockOut(day, "c1"), 25.5);
}

// 20:30 終了 … 最後 20.0 → 20.5 行
{
  const day = slotsForRange("c1", 20, 20.5);
  assert.equal(displaySlotForClockOut(day, "c1"), 20.5);
}

assert.equal(displaySlotForClockOut([], "x"), null);

console.log("shift-utils (displaySlotForClockOut): 4 patterns OK");
