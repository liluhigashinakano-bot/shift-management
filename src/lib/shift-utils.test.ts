import assert from "node:assert/strict";
import {
  displaySlotForClockOut,
  hideEndCastNameForWishEnd29,
} from "./shift-utils";

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

// hideEndCastNameForWishEnd29: 希望29:00 かつ 実退勤も29:00 の場合のみ非表示
// 希望29:00、実退勤29:00 → 非表示（変更なし）
assert.equal(hideEndCastNameForWishEnd29(29, 29), true);
// 希望29:00、実退勤27:00（カット） → 表示（変更を示すため）
assert.equal(hideEndCastNameForWishEnd29(29, 27), false);
// 希望29:00、実退勤25:30（カット） → 表示
assert.equal(hideEndCastNameForWishEnd29(29, 25.5), false);
// 希望27:00、実退勤27:00 → 表示（そもそも29:00ルールの対象外）
assert.equal(hideEndCastNameForWishEnd29(27, 27), false);
// 希望25:00、実退勤29:00（延長） → 表示（希望が29:00ではない）
assert.equal(hideEndCastNameForWishEnd29(25, 29), false);

console.log("shift-utils (displaySlotForClockOut + hideEndCastNameForWishEnd29): 9 patterns OK");
