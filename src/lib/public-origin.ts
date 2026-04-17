/**
 * ログアウト後の遷移先などに使う「公開URLのオリジン」。
 * 0.0.0.0 はブラウザ向けに無効なので、127.0.0.1 に置き換える。
 * 本番では Railway の Variables に NEXT_PUBLIC_APP_URL を入れると確実。
 */
export function getPublicOrigin(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;

  if (typeof window === "undefined") return "";

  const { hostname, port, protocol } = window.location;
  if (hostname === "0.0.0.0") {
    const p = port ? `:${port}` : "";
    return `${protocol}//127.0.0.1${p}`;
  }
  return window.location.origin;
}
