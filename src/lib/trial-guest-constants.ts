/** クライアント可（DB を import しない）。体入名の検証と上限。 */
export const TRIAL_GUEST_NAME_MAX_LEN = 60;

/** 体入モーダル用。空・長すぎは例外。 */
export function parseTrialGuestName(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) throw new Error("EMPTY");
  if (s.length > TRIAL_GUEST_NAME_MAX_LEN) throw new Error("LONG");
  return s;
}
