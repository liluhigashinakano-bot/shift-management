/**
 * 日本時間の暦日を出す。
 *
 * 動かしている機械の時計は、Railway の既定だと世界標準時（日本より 9 時間遅れ）。
 * そのまま new Date().getDate() を使うと、日本の 16 日 0:00〜9:00 を「15 日」と判定し、
 * ちょうど営業時間（〜29:00）に「今の期間」が前の期間になる。
 */
export type JstYmd = { year: number; month: number; day: number };

export function jstYmd(now: Date = new Date()): JstYmd {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const pick = (type: string): number => {
    const raw = parts.find((p) => p.type === type)?.value;
    return raw ? Number(raw) : NaN;
  };

  const year = pick("year");
  const month = pick("month");
  const day = pick("day");

  // Intl が使えない環境でも止めない（その場合だけ機械の時計に落ちる）
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
  }
  return { year, month, day };
}
