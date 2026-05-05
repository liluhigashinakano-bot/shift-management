/**
 * DISCORD_SHIFT_SUBMIT_WEBHOOK_URL を .env.local から読み、テスト投稿を1件送る。
 * 使い方: node scripts/test-discord-shift-webhook.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

const envLocal = parseEnvFile(path.join(root, ".env"));
const local = parseEnvFile(path.join(root, ".env.local"));
const url =
  (local.DISCORD_SHIFT_SUBMIT_WEBHOOK_URL || envLocal.DISCORD_SHIFT_SUBMIT_WEBHOOK_URL || "").trim();

if (!url) {
  console.error(
    "DISCORD_SHIFT_SUBMIT_WEBHOOK_URL が .env.local（または .env）にありません。",
  );
  process.exit(1);
}

const content =
  "【テスト】シフト管理アプリからの接続確認です。\n" +
  `時刻: ${new Date().toISOString()}`;

const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ content }),
});

const body = await res.text().catch(() => "");
if (!res.ok) {
  console.error("失敗:", res.status, body.slice(0, 500));
  process.exit(1);
}
console.log("送信しました。Discord チャンネルを確認してください。");
