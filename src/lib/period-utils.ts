import { jstYmd } from "@/lib/jst";

export type ShiftHalf = "first" | "second";
export type ShiftPeriodKey = { year: number; month: number; half: ShiftHalf };

export function periodIndex(p: ShiftPeriodKey): number {
  const halfIdx = p.half === "first" ? 0 : 1;
  return p.year * 24 + (p.month - 1) * 2 + halfIdx;
}

export function nextPeriod(p: ShiftPeriodKey): ShiftPeriodKey {
  if (p.half === "first") return { year: p.year, month: p.month, half: "second" };
  const nextMonth = p.month === 12 ? 1 : p.month + 1;
  const nextYear = p.month === 12 ? p.year + 1 : p.year;
  return { year: nextYear, month: nextMonth, half: "first" };
}

/**
 * 「いまの期間」を日本時間の暦日で決める。
 * 機械の時計が世界標準時でも、16 日の 0:00〜9:00 を前半と判定しない。
 */
export function periodFromNow(now: Date = new Date()): ShiftPeriodKey {
  const { year, month, day } = jstYmd(now);
  const half: ShiftHalf = day <= 15 ? "first" : "second";
  return { year, month, half };
}

export function halfLabel(half: ShiftHalf): string {
  return half === "first" ? "前半" : "後半";
}
