/**
 * Googleフォーム回答シートの日付セルを YYYY-MM-DD に統一する。
 * 文字列（ハイフン・スラッシュ）と、Sheets の日付シリアル値に対応。
 */
export function normalizeSheetDateToYmd(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const s = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (m) {
      return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    }
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const whole = Math.floor(value);
    const ms = (whole - 25569) * 86400000;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  return null;
}
