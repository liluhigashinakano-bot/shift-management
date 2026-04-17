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

export function periodFromNow(now: Date): ShiftPeriodKey {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const half: ShiftHalf = now.getDate() <= 15 ? "first" : "second";
  return { year, month, half };
}

export function halfLabel(half: ShiftHalf): string {
  return half === "first" ? "前半" : "後半";
}

