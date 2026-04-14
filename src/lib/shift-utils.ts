// 時間スロット: 19:00〜28:00（翌4:00）、30分刻み
export const TIME_SLOTS = Array.from({ length: 19 }, (_, i) => 19 + i * 0.5);

// 時間スロットを表示用文字列に変換
export function formatTimeSlot(slot: number): string {
  const hour = Math.floor(slot);
  const min = slot % 1 === 0.5 ? "30" : "00";
  return `${hour}:${min}`;
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
