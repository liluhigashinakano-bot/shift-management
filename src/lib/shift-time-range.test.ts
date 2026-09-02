import assert from "node:assert/strict";
import {
  clampEndToStart,
  isValidShiftRange,
  LAST_SLOT_END,
} from "./shift-time-range";

// ==========================================================================
// isValidShiftRange
// 画面の退勤の選択肢は「出勤より後」に絞られるが、選んであった値は残る。
// 出勤を 26:00 にすると退勤欄は空に見えるのに、裏では 25:00 のまま送られていた。
// ==========================================================================

// ふつうの入力
assert.equal(isValidShiftRange(20, 25), true);
assert.equal(isValidShiftRange(19, 19.5), true);
assert.equal(isValidShiftRange(19, LAST_SLOT_END), true);

// 退勤が出勤より前（これが保存されると「26:00〜25:00 -1h」の希望ができる）
assert.equal(isValidShiftRange(26, 25), false);
// 退勤と出勤が同じ（スロットが 1 つも作られない）
assert.equal(isValidShiftRange(22, 22), false);

// 30 分刻みから外れた値
assert.equal(isValidShiftRange(19.25, 25), false);
assert.equal(isValidShiftRange(20, 25.75), false);

// 表の範囲の外
assert.equal(isValidShiftRange(18.5, 25), false);
assert.equal(isValidShiftRange(20, LAST_SLOT_END + 0.5), false);

// 数値でない・壊れた値
assert.equal(isValidShiftRange("20", 25), false);
assert.equal(isValidShiftRange(20, undefined), false);
assert.equal(isValidShiftRange(NaN, 25), false);
assert.equal(isValidShiftRange(20, Infinity), false);
assert.equal(isValidShiftRange(null, null), false);

// ==========================================================================
// clampEndToStart — 出勤を変えたときの退勤の寄せ先
// ==========================================================================

// 退勤が出勤より後ならそのまま
assert.equal(clampEndToStart(20, 25), 25);
// 出勤を退勤より遅くしたら「出勤の 30 分後」に寄せる
assert.equal(clampEndToStart(26, 25), 26.5);
// 同じ時刻も寄せる
assert.equal(clampEndToStart(22, 22), 22.5);
// 表のいちばん後ろを超えない
assert.equal(clampEndToStart(LAST_SLOT_END, 20), LAST_SLOT_END);

// 寄せたあとの値は必ず正しい範囲になる
for (let start = 19; start <= 29; start += 0.5) {
  const fixed = clampEndToStart(start, 19);
  if (start < LAST_SLOT_END) {
    assert.equal(
      isValidShiftRange(start, fixed),
      true,
      `寄せたのに範囲が不正: ${start} → ${fixed}`,
    );
  }
}

console.log("shift-time-range (isValidShiftRange + clampEndToStart): 24 patterns OK");
