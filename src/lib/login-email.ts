/**
 * ログイン時のメールでよくある打ち間違いを補正する（例: @shift.loca → @shift.local）。
 * DB のシード形式（*@shift.local / *@cast.local）に合わせる。
 */
export function normalizeCommonLoginEmail(email: string): string {
  const trimmed = email.trim();
  return trimmed
    .replace(/@shift\.loca$/i, "@shift.local")
    .replace(/@cast\.loca$/i, "@cast.local");
}

/** ログイン入力の共通整形（全角@、よくあるドメイン誤字） */
export function normalizeLoginCredential(raw: string): string {
  const t = raw.trim().replace(/\uFF20/g, "@");
  return normalizeCommonLoginEmail(t);
}
