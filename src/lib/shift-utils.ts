// 時間スロット: 19:00〜29:00（翌5:00）、30分刻み
export const TIME_SLOTS = Array.from({ length: 21 }, (_, i) => 19 + i * 0.5);

// 時間スロットを表示用文字列に変換
export function formatTimeSlot(slot: number): string {
  const hour = Math.floor(slot);
  const min = slot % 1 === 0.5 ? "30" : "00";
  return `${hour}:${min}`;
}

/**
 * シフト表の退勤列にキャスト名を出さない判定。
 * シフト希望の退勤が 29:00（閉店）で、かつ実際の退勤も 29:00（=希望から変更なし）の場合のみ非表示にする。
 * 希望 29:00 でも実退勤が 29:00 より前にカットされた場合は、変更が分かるよう退勤列に名前を表示する。
 */
export function hideEndCastNameForWishEnd29(
  wishEndTime: number,
  actualEndTime: number,
): boolean {
  return wishEndTime === 29 && actualEndTime === 29;
}

/**
 * 退勤キャスト名を出す行の timeSlot（TIME_SLOTS の要素と一致）。
 * 退勤の排他終端（最後の勤務スロットの終了時刻 = last.timeSlot + 0.5）と同じ行に置く。
 * 例: 25:30 終了 → 25.5 行（:30）、25:00 終了 → 25 行（:00）。旧実装は :30 終了でも最後のスロット開始行に置き表とモーダルが食い違った。
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
  return last.timeSlot + 0.5;
}

// 日付を "M/D" 形式に
export function formatDate(date: Date): string {
  const d = new Date(date);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/**
 * 日付（Date / ISO 文字列）を UTC ベースの YYYY-MM-DD 文字列に変換する。
 * DB 上の日付は日本時間の暦日を UTC 0:00 で保存している前提なので、
 * 比較キーは toISOString().slice(0,10) を使う。
 */
export function toUtcDateKey(value: Date | string): string {
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
    return new Date(value).toISOString().slice(0, 10);
  }
  return value.toISOString().slice(0, 10);
}

/**
 * シフト希望リストから (castId, dayId) で完全一致する希望を 1 件返す。
 * 見つからない場合は undefined。
 *
 * dayLabel 部分一致（例: "4/1" が "4/10" にも含まれてしまう）バグを避けるため、
 * シフト表側のように dayId が利用できる経路ではこのヘルパーを使う。
 */
export function findShiftRequestByDayId<
  T extends { castId: string; dayId: string | null },
>(
  requests: readonly T[] | undefined,
  castId: string,
  dayId: string,
): T | undefined {
  if (!requests) return undefined;
  return requests.find((r) => r.castId === castId && r.dayId === dayId);
}

/**
 * シフト希望リストから (castId, UTC日付キー) で完全一致する希望を 1 件返す。
 *
 * dayId を持たない API（/api/requests など）から取得した希望と、
 * シフト表側で持っている日付（Date or ISO 文字列）を突き合わせる場合に使う。
 */
export function findShiftRequestByDate<
  T extends { castId: string; date: Date | string },
>(
  requests: readonly T[] | undefined,
  castId: string,
  day: Date | string,
): T | undefined {
  if (!requests) return undefined;
  const targetKey = toUtcDateKey(day);
  return requests.find(
    (r) => r.castId === castId && toUtcDateKey(r.date) === targetKey,
  );
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
