/**
 * ログインの失敗回数を数える。
 *
 * キャストのパスワードは 6 桁の数字（100 万通り）で、ID もキャスト名から推測しやすい。
 * 回数制限が無いと外から順に試せるので、同じ ID で続けて失敗したら少し待たせる。
 *
 * ⚠️ 数は 1 つのサーバーの中だけで持つ。サーバーを増やすと台数ぶん甘くなる。
 *    現状の Railway は 1 台構成のため、まずはこれで足りる。
 */
const MAX_ATTEMPTS = 5;
const BLOCK_MS = 10 * 60 * 1000;
/** 最後の失敗からこれだけ経ったら数を忘れる */
const FORGET_MS = 30 * 60 * 1000;
/** 覚えておく ID の数の上限（際限なく増えないように） */
const MAX_KEYS = 5000;

type Attempt = { count: number; lastAt: number; blockedUntil: number };

const attempts = new Map<string, Attempt>();

function sweep(now: number) {
  if (attempts.size < MAX_KEYS) return;
  for (const [key, value] of attempts) {
    if (now - value.lastAt > FORGET_MS && value.blockedUntil < now) {
      attempts.delete(key);
    }
  }
  // それでも減らなければ古い順に捨てる
  if (attempts.size >= MAX_KEYS) {
    const oldest = [...attempts.entries()]
      .sort((a, b) => a[1].lastAt - b[1].lastAt)
      .slice(0, Math.floor(MAX_KEYS / 2));
    for (const [key] of oldest) attempts.delete(key);
  }
}

/** いま試してよいか。false なら待たせる */
export function canAttemptLogin(loginKey: string, now = Date.now()): boolean {
  const key = loginKey.toLowerCase();
  const entry = attempts.get(key);
  if (!entry) return true;
  if (entry.blockedUntil > now) return false;
  if (now - entry.lastAt > FORGET_MS) {
    attempts.delete(key);
    return true;
  }
  return true;
}

export function recordLoginFailure(loginKey: string, now = Date.now()): void {
  const key = loginKey.toLowerCase();
  sweep(now);
  const entry = attempts.get(key);
  if (!entry || now - entry.lastAt > FORGET_MS) {
    attempts.set(key, { count: 1, lastAt: now, blockedUntil: 0 });
    return;
  }
  entry.count += 1;
  entry.lastAt = now;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.blockedUntil = now + BLOCK_MS;
    entry.count = 0;
  }
}

export function recordLoginSuccess(loginKey: string): void {
  attempts.delete(loginKey.toLowerCase());
}

/** テスト用 */
export function resetLoginAttempts(): void {
  attempts.clear();
}
