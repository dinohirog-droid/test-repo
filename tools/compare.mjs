// 見た目の比較: node compare.mjs out/before out/after [--threshold 40] [--fail 0.02]
// 同じ名前の PNG どうしを比べ、差の大きい画素の割合を表示する。差分画像を <after>/diff/ に書き出す。
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { TOOLS } from './lib/browser.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? Number(argv[i + 1]) : d; };
const [a, b] = argv.filter((x) => !x.startsWith('--') && isNaN(Number(x))).map((d) => path.resolve(TOOLS, d));
if (!a || !b) { console.error('使い方: node compare.mjs <before dir> <after dir> [--threshold 40] [--fail 0.02]'); process.exit(1); }
const TH = opt('--threshold', 40), FAIL = opt('--fail', 0.02);
const diffDir = path.join(b, 'diff');
fs.mkdirSync(diffDir, { recursive: true });
let bad = 0;
const files = fs.existsSync(a) ? fs.readdirSync(a).filter((x) => x.endsWith('.png')) : [];
if (!files.length) { console.error(`比較元に PNG がありません: ${a}`); process.exit(1); }
for (const f of files) {
  if (!fs.existsSync(path.join(b, f))) { console.log(`${f}: 比較先がありません`); bad++; continue; }
  const A = PNG.sync.read(fs.readFileSync(path.join(a, f))), B = PNG.sync.read(fs.readFileSync(path.join(b, f)));
  if (A.width !== B.width || A.height !== B.height) { console.log(`${f}: サイズが違います`); bad++; continue; }
  const D = new PNG({ width: A.width, height: A.height });
  let n = 0;
  for (let i = 0; i < A.data.length; i += 4) {
    const d = Math.max(Math.abs(A.data[i] - B.data[i]), Math.abs(A.data[i + 1] - B.data[i + 1]), Math.abs(A.data[i + 2] - B.data[i + 2]));
    if (d > TH) n++;
    const v = Math.min(255, d * 4);
    D.data[i] = v; D.data[i + 1] = v; D.data[i + 2] = v; D.data[i + 3] = 255;
  }
  fs.writeFileSync(path.join(diffDir, f), PNG.sync.write(D));
  const ratio = n / (A.width * A.height);
  const mark = ratio > FAIL ? '要確認' : 'OK';
  if (ratio > FAIL) bad++;
  console.log(`${mark.padEnd(4)} ${f}: ${(ratio * 100).toFixed(2)}%`);
}
console.log(bad ? `要確認 ${bad} 件(差分画像: ${path.relative(process.cwd(), diffDir)})` : 'すべて許容範囲内です');
process.exit(bad ? 3 : 0);
