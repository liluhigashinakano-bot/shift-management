/**
 * デスクトップ配下にバックアップフォルダを作成する。
 * - DB: pg_dump が使えれば database-dump.sql、無ければ database-export.json（public 表一式）
 * - prisma/schema.prisma と prisma/migrations をコピー
 * - .git がある場合は git bundle（repo.bundle）
 * --daily のときは前回記録以降のコミット・変更ファイル・作業ツリーをテキスト化し、
 *   バックアップルート直下の「開発作業ログ.jsonl」に 1 行追記する。
 *
 * 保存先（既定）: デスクトップ/OneDrive の Desktop 直下の「POSshiftバックアップ」
 * （例: C:\\Users\\…\\OneDrive\\Desktop\\POSshiftバックアップ）
 * 別パスにしたい場合: 環境変数 SHIFT_BACKUP_ROOT にフォルダのフルパス
 *
 * 使い方: プロジェクト直下で  npm run backup  |  npm run backup:daily
 * DATABASE_URL は .env / .env.local から読込（DB バックアップ用。無ければスキップ）
 */
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  copyFileSync,
  readFileSync,
  readdirSync,
  appendFileSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const isDailyMode = process.argv.includes("--daily");
const MAX_GIT_OUT = 8 * 1024 * 1024;

function gitTry(args) {
  try {
    return execFileSync("git", ["-C", root, ...args], {
      encoding: "utf8",
      maxBuffer: MAX_GIT_OUT,
    });
  } catch {
    return null;
  }
}

function readLastDailyPath(backupRoot) {
  const p = join(backupRoot, "last-daily-backup.json");
  if (!existsSync(p)) return null;
  try {
    const j = JSON.parse(readFileSync(p, "utf8"));
    if (j?.lastCompletedAt && typeof j.lastCompletedAt === "string")
      return j.lastCompletedAt;
  } catch {
    /* ignore */
  }
  return null;
}

function writeLastDaily(backupRoot) {
  const p = join(backupRoot, "last-daily-backup.json");
  writeFileSync(
    p,
    JSON.stringify(
      { lastCompletedAt: new Date().toISOString(), updatedBy: "backup.mjs --daily" },
      null,
      2,
    ),
    "utf8",
  );
}

/**
 * 前回バックアップ時刻〜今までのアプリ変更・コミット・未コミット差分を記録する。
 * @param {{ backupRoot: string, outDir: string, folderName: string }} o
 */
function captureDevelopmentLog(o) {
  const { backupRoot, outDir, folderName } = o;
  const gitDir = join(root, ".git");
  const sinceIso =
    readLastDailyPath(backupRoot) ||
    new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const devJson = {
    generatedAt: new Date().toISOString(),
    since: sinceIso,
    projectRoot: root,
    note: "前回の自動バックアップ完了時刻以降のコミット。初回は過去24時間。未コミットは作業ツリー欄。",
  };

  if (!existsSync(gitDir)) {
    const msg = "（.git なし: 開発作業ログはスキップ）\n";
    writeFileSync(join(outDir, "development-work-summary.txt"), msg, "utf8");
    writeFileSync(join(outDir, "development-work.json"), JSON.stringify({ ...devJson, git: null }, null, 2), "utf8");
    console.log(msg.trim());
    return { commitCount: 0, porcelainLines: 0 };
  }

  const branch = (gitTry(["rev-parse", "--abbrev-ref", "HEAD"]) || "").trim() || "(unknown)";
  const headShort = (gitTry(["rev-parse", "--short", "HEAD"]) || "").trim();

  const logPretty =
    gitTry([
      "log",
      `--since=${sinceIso}`,
      "--pretty=format:%h %ad %s",
      "--date=short",
      "--no-decorate",
    ]) || "";
  const logNames =
    gitTry([
      "log",
      `--since=${sinceIso}`,
      "--name-status",
      "--pretty=format:---%n%h %ad %s",
      "--date=short",
    ]) || "";

  const statusSb = gitTry(["status", "-sb"]) || "";
  const diffStat = gitTry(["diff", "--stat", "HEAD"]) || "";
  const stagedStat = gitTry(["diff", "--stat", "--cached"]) || "";

  const commitCountStr = (gitTry(["rev-list", `--since=${sinceIso}`, "--count", "HEAD"]) || "0").trim();
  const commitCount = parseInt(commitCountStr, 10) || 0;
  const porcelain = gitTry(["status", "--porcelain"]) || "";
  const porcelainLines = porcelain
    .split("\n")
    .filter((l) => l.trim().length > 0).length;

  devJson.git = {
    branch,
    headShort,
    commitCountSincePreviousBackup: commitCount,
    uncommittedFileHints: porcelainLines,
  };

  const summary =
    `=== 開発・作業ログ（自動バックアップ） ===
記録時刻(UTC): ${devJson.generatedAt}
基準時刻以降のコミット: ${sinceIso} 〜
現在ブランチ: ${branch} @ ${headShort}
前回記録以降のコミット件数: ${commitCount}
未コミットの行数（status --porcelain 行数）: ${porcelainLines}

--- git log（前回バックアップ完了以降） ---
${logPretty || "(該当なし)"}

--- 変更があったファイル（コミット単位・名前付き） ---
${logNames || "(該当なし)"}

--- git status -sb ---
${statusSb || ""}

--- ステージ済み diff --stat（HEAD との差） ---
${stagedStat || "(なし)"}

--- 作業ツリー全体 diff --stat（未ステージ含む・HEAD 基準） ---
${diffStat || "(なし)"}
`;

  writeFileSync(join(outDir, "development-work-summary.txt"), summary, "utf8");
  writeFileSync(
    join(outDir, "development-work.json"),
    JSON.stringify(devJson, null, 2),
    "utf8",
  );

  const jsonlLine = JSON.stringify({
    at: devJson.generatedAt,
    backupFolder: folderName,
    branch,
    commitCountSincePreviousBackup: commitCount,
    uncommittedFileHints: porcelainLines,
    backupPath: outDir,
  });
  const cumulative = join(backupRoot, "開発作業ログ.jsonl");
  appendFileSync(cumulative, jsonlLine + "\n", "utf8");
  console.log("作成: development-work-summary.txt / development-work.json");
  console.log("追記:", cumulative);

  return { commitCount, porcelainLines };
}


function loadEnvFiles() {
  for (const name of [".env.local", ".env"]) {
    const p = join(root, name);
    if (!existsSync(p)) continue;
    const text = readFileSync(p, "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1).replace(/\\n/g, "\n");
      }
      if (process.env[key] == null || process.env[key] === "") {
        process.env[key] = val;
      }
    }
  }
}

function getDesktopDir() {
  const override = process.env.SHIFT_BACKUP_DESKTOP;
  if (override) return override;
  const oneDrive = join(homedir(), "OneDrive", "Desktop");
  if (existsSync(oneDrive)) return oneDrive;
  const desk = join(homedir(), "Desktop");
  if (existsSync(desk)) return desk;
  return homedir();
}

/** バックアップのルート（日時フォルダ・ログの親）。既定はデスクトップ直下の POSshiftバックアップ。 */
function getBackupRootDir() {
  const full = process.env.SHIFT_BACKUP_ROOT?.trim();
  if (full) return full;
  return join(getDesktopDir(), "POSshiftバックアップ");
}

function stampDir() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function copyDirRecursive(src, dest) {
  if (!existsSync(src)) return;
  mkdirSync(dest, { recursive: true });
  for (const ent of readdirSync(src, { withFileTypes: true })) {
    const s = join(src, ent.name);
    const d = join(dest, ent.name);
    if (ent.isDirectory()) copyDirRecursive(s, d);
    else copyFileSync(s, d);
  }
}

async function exportTablesToJson(client, outPath) {
  const { rows: tables } = await client.query(`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `);
  const payload = {
    exportedAt: new Date().toISOString(),
    note:
      "PostgreSQL public スキーマの全表。復元は専用スクリプトまたは SQL が必要です。database-dump.sql がある場合はそちらを優先してください。",
    tables: {},
  };
  for (const { tablename } of tables) {
    const r = await client.query(`SELECT * FROM ${quoteIdent(tablename)}`);
    payload.tables[tablename] = r.rows;
  }
  writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");
}

/** @returns {boolean} */
function tryPgDump(url, outSql) {
  try {
    execFileSync(
      "pg_dump",
      [url, "--format=plain", "--no-owner", "--no-acl", "--file", outSql],
      { stdio: "pipe", env: process.env },
    );
    return existsSync(outSql);
  } catch {
    return false;
  }
}

function sslOptionForUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("railway"))
      return { rejectUnauthorized: false };
    if (u.searchParams.get("sslmode") === "require")
      return { rejectUnauthorized: false };
  } catch {
    /* ignore */
  }
  return undefined;
}

function tryGitBundle(outFile) {
  const gitDir = join(root, ".git");
  if (!existsSync(gitDir)) {
    console.log("（.git なし: git bundle はスキップ）");
    return;
  }
  try {
    execFileSync(
      "git",
      ["-C", root, "bundle", "create", outFile, "--all"],
      { stdio: "inherit" },
    );
    console.log("作成:", outFile);
  } catch (e) {
    console.warn("git bundle をスキップ:", e?.message || e);
  }
}

async function main() {
  loadEnvFiles();
  const url = process.env.DATABASE_URL;
  const backupRoot = getBackupRootDir();
  const folderName = stampDir();
  const outDir = join(backupRoot, folderName);
  mkdirSync(outDir, { recursive: true });

  console.log("出力先:", outDir);
  if (isDailyMode) console.log("モード: daily（開発作業ログを含む）");

  const meta = {
    createdAt: new Date().toISOString(),
    node: process.version,
    project: root,
  };
  writeFileSync(join(outDir, "backup-meta.json"), JSON.stringify(meta, null, 2), "utf8");

  try {
    copyFileSync(
      join(root, "prisma", "schema.prisma"),
      join(outDir, "prisma-schema.prisma"),
    );
    const mig = join(root, "prisma", "migrations");
    if (existsSync(mig)) {
      copyDirRecursive(mig, join(outDir, "prisma-migrations"));
    }
    console.log("コピー: prisma-schema.prisma, prisma-migrations/");
  } catch (e) {
    console.warn("Prisma ファイルコピーで警告:", e?.message || e);
  }

  tryGitBundle(join(outDir, "repo.bundle"));

  const dumpSql = join(outDir, "database-dump.sql");
  let dumped = false;
  if (url && url.startsWith("postgresql")) {
    dumped = tryPgDump(url, dumpSql);
    if (dumped) {
      console.log("作成: database-dump.sql（pg_dump）");
    } else {
      console.log(
        "pg_dump が使えないか失敗したため、JSON にフォールバックします（PostgreSQL クライアントを入れると SQL ダンプ推奨）。",
      );
    }
  } else {
    console.warn(
      "DATABASE_URL が未設定、または postgresql 以外です。DB バックアップをスキップします。",
    );
  }

  if (url && url.startsWith("postgresql") && !dumped) {
    const { default: pg } = await import("pg");
    const client = new pg.Client({
      connectionString: url,
      ssl: sslOptionForUrl(url),
    });
    try {
      await client.connect();
      const jsonPath = join(outDir, "database-export.json");
      await exportTablesToJson(client, jsonPath);
      console.log(
        "作成: database-export.json（全表 JSON）※パスワードハッシュを含みます。取り扱い注意",
      );
    } catch (e) {
      console.error("DB JSON エクスポート失敗:", e?.message || e);
      process.exitCode = 1;
    } finally {
      await client.end().catch(() => {});
    }
  }

  if (isDailyMode) {
    try {
      captureDevelopmentLog({ backupRoot, outDir, folderName });
      writeLastDaily(backupRoot);
    } catch (e) {
      console.warn("開発作業ログの記録で警告:", e?.message || e);
    }
  }

  console.log("\n完了。復元の目安:");
  console.log(
    "  - SQL … database-dump.sql を psql またはホストの Query で流す（既存データ消去に注意）",
  );
  console.log("  - Git … git clone repo.bundle backup-restore && cd backup-restore");
  if (isDailyMode) {
    console.log(
      "  - 作業ログ … 各フォルダの development-work-*.txt/json と 開発作業ログ.jsonl",
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
