import { TIME_SLOTS } from "@/lib/shift-utils";

export const FIRST_SLOT = TIME_SLOTS[0]!;
/** 最後のスロットの終わり（= 退勤に選べるいちばん遅い時刻） */
export const LAST_SLOT_END = TIME_SLOTS[TIME_SLOTS.length - 1]! + 0.5;

/**
 * 出勤・退勤の組み合わせが正しいか。
 *
 * 画面の退勤の選択肢は「出勤より後」に絞られるが、既に選んであった値は残る。
 * 出勤を退勤より遅くすると、古い退勤の値がそのまま送られ、
 * 「26:00〜25:00」の希望が保存されてスロットが 1 つも作られない。
 * 画面と裏側の両方でここを通す。
 */
export function isValidShiftRange(start: unknown, end: unknown): boolean {
  if (typeof start !== "number" || typeof end !== "number") return false;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  if (start >= end) return false;
  // 30 分刻みから外れた値（19.25 など）も弾く
  if (Math.round(start * 2) !== start * 2) return false;
  if (Math.round(end * 2) !== end * 2) return false;
  if (start < FIRST_SLOT || end > LAST_SLOT_END) return false;
  return true;
}

export const INVALID_RANGE_MESSAGE =
  "退勤は出勤より後の時刻にしてください。";

/**
 * 出勤を変えたときの退勤の寄せ先。
 * 退勤が出勤以下になっていたら「出勤の 30 分後」に直す。
 */
export function clampEndToStart(start: number, end: number): number {
  if (end > start) return end;
  return Math.min(start + 0.5, LAST_SLOT_END);
}
