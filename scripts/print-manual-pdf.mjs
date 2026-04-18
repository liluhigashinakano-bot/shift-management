/**
 * Markdown マニュアル → HTML → Chrome headless で PDF を生成
 * デフォルト: USER_MANUAL.md → docs/USER_MANUAL.pdf
 * 例: node scripts/print-manual-pdf.mjs CAST_MANUAL.md CAST_MANUAL.pdf
 * 依存: marked（devDependencies）
 */
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { marked } from "marked";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const docs = join(root, "docs");
const mdFile = process.argv[2] || "USER_MANUAL.md";
const pdfFile = process.argv[3] || "USER_MANUAL.pdf";
const mdPath = join(docs, mdFile);
const htmlPath = join(docs, "_manual-print-temp.html");
const pdfPath = join(docs, pdfFile);

const md = readFileSync(mdPath, "utf8");
const body = marked.parse(md);
const docTitle = mdFile.replace(/\.md$/i, "").replace(/_/g, " ");
const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<title>${docTitle}</title>
<style>
  body { font-family: system-ui, "Segoe UI", "Hiragino Sans", sans-serif; line-height: 1.55; max-width: 900px; margin: 24px auto; padding: 0 16px; color: #222; }
  img { max-width: 100%; height: auto; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 0.95rem; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; }
  blockquote { border-left: 4px solid #ddd; margin: 1em 0; padding-left: 12px; color: #444; }
  pre, code { font-family: ui-monospace, monospace; }
  pre { background: #f6f6f6; padding: 12px; overflow: auto; }
  h1 { border-bottom: 1px solid #eee; padding-bottom: 8px; }
  h2 { margin-top: 1.6em; }
  @media print {
    a { color: inherit; text-decoration: none; }
    h2 { break-after: avoid; }
    img { break-inside: avoid; }
  }
</style>
</head>
<body>
${body}
</body>
</html>`;

writeFileSync(htmlPath, html, "utf8");

const chromeCandidates = [
  join(process.env["ProgramFiles"] || "C:\\Program Files", "Google/Chrome/Application/chrome.exe"),
  join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Google/Chrome/Application/chrome.exe"),
];

let chrome = chromeCandidates.find((p) => existsSync(p));
if (!chrome) {
  console.error("Google Chrome が見つかりません。Chrome をインストールするか、パスを確認してください。");
  process.exit(1);
}

const fileUrl = "file:///" + htmlPath.replace(/\\/g, "/");

execFileSync(
  chrome,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-pdf-header-footer",
    `--print-to-pdf=${pdfPath}`,
    fileUrl,
  ],
  { stdio: "inherit" },
);

unlinkSync(htmlPath);
console.log("作成しました:", pdfPath);
