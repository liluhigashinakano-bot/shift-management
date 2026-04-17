/**
 * 英小文字・大文字・数字・記号を必ず含むランダムパスワード（Web Crypto API）。
 */
export function generateStrongPassword(length = 20): string {
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const digits = "0123456789";
  const symbols = "!@#$%&*-_";
  const all = lower + upper + digits + symbols;
  const n = Math.max(12, Math.min(length, 64));
  const buf = new Uint8Array(n * 2);
  crypto.getRandomValues(buf);
  const chars: string[] = [
    lower[buf[0]! % lower.length],
    upper[buf[1]! % upper.length],
    digits[buf[2]! % digits.length],
    symbols[buf[3]! % symbols.length],
  ];
  for (let i = 4; i < n; i++) {
    chars.push(all[buf[i]! % all.length]);
  }
  for (let j = chars.length - 1; j > 0; j--) {
    const r = new Uint8Array(1);
    crypto.getRandomValues(r);
    const k = r[0]! % (j + 1);
    [chars[j], chars[k]] = [chars[k]!, chars[j]!];
  }
  return chars.join("");
}
