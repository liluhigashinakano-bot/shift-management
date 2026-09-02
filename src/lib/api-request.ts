import { toast } from "sonner";

/**
 * 裏側が返したエラー文を取り出す。JSON でなければ状態コードで代用する。
 */
export async function errorMessageFromResponse(
  res: Response,
  fallback = "保存に失敗しました",
): Promise<string> {
  try {
    const data = (await res.json()) as { error?: unknown; message?: unknown };
    for (const value of [data.error, data.message]) {
      if (typeof value === "string" && value.trim()) return value;
    }
  } catch {
    // JSON ではない（HTML のエラーページなど）
  }
  return `${fallback}（HTTP ${res.status}）`;
}

export type PostJsonResult =
  | { ok: true; data: unknown }
  | { ok: false; message: string };

/**
 * 画面からの保存・削除はこれを通す。
 *
 * 失敗したら理由を画面に出して ok:false を返す。呼び出し側は ok を見て、
 * 失敗なら窓を閉じない・一覧を書き換えない。
 * これを通さないと「締切中なのに窓が閉じて成功に見える」が起きる。
 */
export async function postJson(
  url: string,
  body: unknown,
  options: { fallbackMessage?: string; method?: string } = {},
): Promise<PostJsonResult> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: options.method ?? "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });
  } catch {
    const message =
      "通信できませんでした。電波と接続を確かめて、もう一度お試しください。";
    toast.error(message);
    return { ok: false, message };
  }

  if (!res.ok) {
    const message = await errorMessageFromResponse(
      res,
      options.fallbackMessage ?? "保存に失敗しました",
    );
    toast.error(message);
    return { ok: false, message };
  }

  const data = await res.json().catch(() => null);
  return { ok: true, data };
}
