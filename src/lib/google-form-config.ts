/**
 * フォーム URL の検証（テスト用にも使用）
 */
export function parseGoogleFormUrl(raw: string | undefined | null): string | null {
  const s = raw?.trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.href;
  } catch {
    return null;
  }
}

/**
 * キャスト向け Google フォームの公開 URL（.env の NEXT_PUBLIC_GOOGLE_FORM_URL など）
 */
export function getGoogleFormPublicUrl(): string | null {
  const raw =
    process.env.NEXT_PUBLIC_GOOGLE_FORM_URL?.trim() ||
    process.env.GOOGLE_FORM_URL?.trim();
  return parseGoogleFormUrl(raw);
}
