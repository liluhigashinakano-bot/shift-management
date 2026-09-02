/**
 * docs/manual-images/*.png からブラウザ上端（タブ・ツールバー）と
 * Windows タスクバー相当の下端を切り取る（上書き保存）。
 * 依存: sharp（devDependencies）
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const imgDir = join(root, "docs", "manual-images");

/** タブバー＋アドレスバー等（高さに比例、上下限あり） */
function topCropPx(h) {
  return Math.max(40, Math.min(120, Math.round(h * 0.125)));
}

/** タスクバー相当（高さに比例、上下限あり） */
function bottomCropPx(h) {
  return Math.max(28, Math.min(56, Math.round(h * 0.068)));
}

async function cropOne(absPath) {
  const buf = await readFile(absPath);
  const img = sharp(buf);
  const meta = await img.metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h) throw new Error(`サイズ取得不可: ${absPath}`);

  const top = topCropPx(h);
  const bottom = bottomCropPx(h);
  let newH = h - top - bottom;
  if (newH < 64) {
    const scale = (h - 64) / (top + bottom);
    const t = Math.floor(top * scale);
    const b = Math.floor(bottom * scale);
    newH = h - t - b;
    if (newH < 48) throw new Error(`トリミング後が小さすぎます: ${absPath}`);
    const out = await sharp(buf).extract({ left: 0, top: t, width: w, height: newH }).png().toBuffer();
    await writeFile(absPath, out);
    console.log(`${absPath}: ${w}x${h} → ${w}x${newH} (top=${t}, bottom=${b}, 縮小適用)`);
    return;
  }

  const out = await sharp(buf).extract({ left: 0, top, width: w, height: newH }).png().toBuffer();
  await writeFile(absPath, out);
  console.log(`${absPath}: ${w}x${h} → ${w}x${newH} (top=${top}, bottom=${bottom})`);
}

async function main() {
  const names = (await readdir(imgDir)).filter((f) => extname(f).toLowerCase() === ".png").sort();
  if (names.length === 0) {
    console.error("PNG が見つかりません:", imgDir);
    process.exit(1);
  }
  for (const f of names) {
    await cropOne(join(imgDir, f));
  }
  console.log("完了:", names.length, "ファイル");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
