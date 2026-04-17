// 時間スロット: 19:00〜29:00（翌5:00）、30分刻み
export const TIME_SLOTS = Array.from({ length: 21 }, (_, i) => 19 + i * 0.5);

// 時間スロットを表示用文字列に変換
export function formatTimeSlot(slot: number): string {
  const hour = Math.floor(slot);
  const min = slot % 1 === 0.5 ? "30" : "00";
  return `${hour}:${min}`;
}

/** シフト希望の退勤が 29:00 のとき、シフト表の退勤列にキャスト名を出さない */
export function hideEndCastNameForWishEnd29(endTime: number): boolean {
  return endTime === 29;
}

/**
 * 退勤キャスト名を出す行の timeSlot（TIME_SLOTS の要素と一致）。
 * 退勤時刻が整数時（例 20:00, 24:00）のときはその :00 行（timeSlot = 時）に表示する。
 * 半時（例 20:30, 24:30）のときは従来どおり isEnd が付いている行（最後の勤務スロット）に合わせる。
 */
export function displaySlotForClockOut(
  daySlots: { timeSlot: number; castId: string }[],
  castId: string,
): number | null {
  const castSlots = daySlots
    .filter((s) => s.castId === castId)
    .sort((a, b) => a.timeSlot - b.timeSlot);
  if (castSlots.length === 0) return null;
  const last = castSlots[castSlots.length - 1];
  const clockOutEnd = last.timeSlot + 0.5;
  if (clockOutEnd % 1 === 0) return clockOutEnd;
  return last.timeSlot;
}

// 日付を "M/D" 形式に
export function formatDate(date: Date): string {
  const d = new Date(date);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// 半月の週分割: 前半7日+後半8日、または前半8日+後半7-8日
export function splitIntoWeeks(
  days: { id: string; date: Date; dayOfWeek: string }[]
): [typeof days, typeof days] {
  const mid = Math.ceil(days.length / 2);
  return [days.slice(0, mid), days.slice(mid)];
}

// キャストの1日の総労働時間（時間単位）を計算
export function calcDailyHours(
  slots: { timeSlot: number; castId: string }[],
  castId: string
): number {
  const castSlots = slots.filter((s) => s.castId === castId);
  return castSlots.length * 0.5;
}

// 日付から曜日（日本語）を計算する（DBの `dayOfWeek` と表示のズレ対策）
export function getJapaneseDayOfWeek(date: Date): string {
  const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
  return dayNames[date.getDay()] ?? "";
}
