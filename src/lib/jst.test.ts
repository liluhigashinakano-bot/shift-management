import assert from "node:assert/strict";
import { jstYmd } from "./jst";
import { periodFromNow } from "./period-utils";

// ==========================================================================
// 日本時間の暦日
//
// Railway の入れ物は既定で世界標準時（日本より 9 時間遅れ）。
// そのまま機械の時計を見ると、日本の 16 日 0:00〜9:00 を「15 日」と判定し、
// ちょうど営業時間（〜29:00）に「いまの期間」が前の期間になっていた。
// ==========================================================================

// 日本の 9/16 8:30（= 世界標準時 9/15 23:30）
{
  const t = new Date("2026-09-15T23:30:00.000Z");
  assert.deepEqual(jstYmd(t), { year: 2026, month: 9, day: 16 });
  assert.deepEqual(periodFromNow(t), { year: 2026, month: 9, half: "second" });
}

// 日本の 9/15 23:30（= 世界標準時 9/15 14:30）はまだ前半
{
  const t = new Date("2026-09-15T14:30:00.000Z");
  assert.deepEqual(jstYmd(t), { year: 2026, month: 9, day: 15 });
  assert.deepEqual(periodFromNow(t), { year: 2026, month: 9, half: "first" });
}

// 月をまたぐ深夜。日本の 10/1 5:00（= 世界標準時 9/30 20:00）
{
  const t = new Date("2026-09-30T20:00:00.000Z");
  assert.deepEqual(jstYmd(t), { year: 2026, month: 10, day: 1 });
  assert.deepEqual(periodFromNow(t), { year: 2026, month: 10, half: "first" });
}

// 年をまたぐ深夜。日本の 2027/1/1 2:00（= 世界標準時 2026/12/31 17:00）
{
  const t = new Date("2026-12-31T17:00:00.000Z");
  assert.deepEqual(jstYmd(t), { year: 2027, month: 1, day: 1 });
  assert.deepEqual(periodFromNow(t), { year: 2027, month: 1, half: "first" });
}

// 1 日の境目ちょうど（日本の 9/16 0:00）
{
  const t = new Date("2026-09-15T15:00:00.000Z");
  assert.deepEqual(jstYmd(t), { year: 2026, month: 9, day: 16 });
  assert.deepEqual(periodFromNow(t), { year: 2026, month: 9, half: "second" });
}

// 15 日の終わりぎりぎり（日本の 9/15 23:59:59）
{
  const t = new Date("2026-09-15T14:59:59.000Z");
  assert.deepEqual(jstYmd(t), { year: 2026, month: 9, day: 15 });
  assert.deepEqual(periodFromNow(t), { year: 2026, month: 9, half: "first" });
}

console.log("jst (jstYmd + periodFromNow): 12 patterns OK");
