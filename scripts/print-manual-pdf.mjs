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

/**
 * 各 ##（h2）ブロックを section で包み、印刷時は「本文と画像が離れにくい」よう CSS で調整する。
 * （セクション全体を 1 ページに固定しない。固定すると画像だけのページが増えやすい。）
 */
function wrapManualSheets(html) {
  const parts = html.split(/(?=<h2\b[^>]*>)/i);
  if (parts.length <= 1) return html;
  const [head, ...rest] = parts;
  const sheets = rest.map((block) => `<section class="manual-sheet">\n${block}\n</section>`).join("\n");
  const preface = head.trim()
    ? `<div class="manual-preface">\n${head}\n</div>`
    : "";
  return `${preface}\n${sheets}`;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const docs = join(root, "docs");
const mdFile = process.argv[2] || "USER_MANUAL.md";
const pdfFile = process.argv[3] || "USER_MANUAL.pdf";
const mdPath = join(docs, mdFile);
const htmlPath = join(docs, "_manual-print-temp.html");
const pdfPath = join(docs, pdfFile);

const md = readFileSync(mdPath, "utf8");
const body = wrapManualSheets(marked.parse(md));
const docTitle = mdFile.replace(/\.md$/i, "").replace(/_/g, " ");
const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<title>${docTitle}</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  body { font-family: system-ui, "Segoe UI", "Hiragino Sans", sans-serif; line-height: 1.55; max-width: 900px; margin: 24px auto; padding: 0 16px; color: #222; }
  .manual-preface h1 { margin-bottom: 0.35em; }
  .manual-sheet h2 { margin-top: 0 !important; padding-top: 0.15em; font-size: 1.15rem; }
  .manual-sheet > *:last-child { margin-bottom: 0; }
  img {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 0.5em auto 0;
  }
  .manual-sheet p:has(img) { margin-top: 0.6em; margin-bottom: 0; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 0.95rem; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; }
  blockquote { border-left: 4px solid #ddd; margin: 1em 0; padding-left: 12px; color: #444; }
  pre, code { font-family: ui-monospace, monospace; }
  pre { background: #f6f6f6; padding: 12px; overflow: auto; }
  h1 { border-bottom: 1px solid #eee; padding-bottom: 8px; }
  h2 { margin-top: 1.6em; }
  @media print {
    body { margin: 0; padding: 0 2mm; }
    a { color: inherit; text-decoration: none; }
    .manual-preface {
      page-break-after: auto;
      break-inside: auto;
    }
    /* セクション内は改ページ可（全体 avoid だと「画像だけ次ページ」が起きやすい） */
    .manual-sheet {
      page-break-inside: auto;
      break-inside: auto;
      margin: 0 0 8mm 0;
      padding: 0;
    }
    .manual-sheet h2 {
      page-break-after: avoid;
      break-after: avoid-page;
    }
    /* 見出しの直後に続く本文を、見出しの孤立を防ぐ */
    .manual-sheet h2 + p {
      page-break-before: avoid;
      break-before: avoid;
    }
    /* 直前のブロックと「画像だけの段落」を同じページに寄せる */
    .manual-sheet p:not(:has(img)) + p:has(img),
    .manual-sheet h2 + p:has(img),
    .manual-sheet ul + p:has(img),
    .manual-sheet ol + p:has(img),
    .manual-sheet blockquote + p:has(img),
    .manual-sheet table + p:has(img) {
      page-break-before: avoid;
      break-before: avoid-page;
    }
    .manual-sheet p,
    .manual-sheet li {
      orphans: 2;
      widows: 2;
    }
    .manual-sheet p:has(img) {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    img {
      page-break-inside: avoid;
      break-inside: avoid;
      max-height: 46vh;
      max-width: 100%;
      width: auto;
    }
    table { break-inside: auto; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    hr { break-inside: avoid; margin: 0.6em 0; }
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
