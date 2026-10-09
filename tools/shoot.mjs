// 撮影: node shoot.mjs shots/cyber-knight-baseline.json [--out out/before] [--page index.html] [--size 900x800] [--ui]
// shots の各要素: { name, js?, cam?: [x,y,z], target?: [x,y,z], wait?: ms }
//   js はページ内で実行するコード。スタジオでは __studio(K = ナイト, H = バイク, G = 天馬, step(n) で n フレーム進める)
import fs from 'node:fs';
import path from 'node:path';
import { openPage, TOOLS } from './lib/browser.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const file = argv.find((a) => a.endsWith('.json'));
if (!file) { console.error('使い方: node shoot.mjs <shots.json> [--out dir] [--page index.html] [--size WxH] [--ui]'); process.exit(1); }
const conf = JSON.parse(fs.readFileSync(path.resolve(TOOLS, file), 'utf8'));
const shots = Array.isArray(conf) ? conf : conf.shots;
const pagePath = opt('--page', conf.page || 'index.html');
const [w, h] = opt('--size', conf.size || '900x800').split('x').map(Number);
const out = path.resolve(TOOLS, opt('--out', 'out/shots'));
fs.mkdirSync(out, { recursive: true });

const { browser, page, errors } = await openPage(pagePath, { width: w, height: h });
await page.waitForTimeout(conf.startWait || 2500);
await page.evaluate(() => { const S = window.__studio || window.__stage; if (S && S.prepare) S.prepare(); });
if (!argv.includes('--ui')) await page.addStyleTag({ content: '.panel,.hint,#topbar,#title,#touch{display:none!important}' });
for (const s of shots) {
  if (s.js) await page.evaluate(s.js);
  if (s.focus) { // 部位にカメラを向ける: { object: 'hands.R.root', offset: [x, y, z](m), model: 'K' }
    await page.evaluate((f) => {
      const S = window.__studio || window.__stage, M = S[f.model || 'K'];
      const o = f.object.split('.').reduce((a, k) => a[k], M);
      const p = o.getWorldPosition(S.camera.position.clone());
      S.camera.position.copy(p).add(new p.constructor(...(f.offset || [0, 0, 0.6])));
      if (S.controls) { S.controls.target.copy(p); S.controls.update(); } else S.camera.lookAt(p);
    }, s.focus);
  } else if (s.cam) {
    await page.evaluate(([c, t]) => {
      const S = window.__studio || window.__stage;
      S.camera.position.set(...c);
      if (S.controls) { S.controls.target.set(...t); S.controls.update(); } else S.camera.lookAt(...t);
    }, [s.cam, s.target || [0, 1, 0]]);
  }
  await page.waitForTimeout(s.wait ?? 1200);
  await page.screenshot({ path: path.join(out, s.name + '.png') });
  console.log('撮影', s.name);
}
await browser.close();
if (errors.length) { console.error('ページのエラー:\n' + errors.join('\n')); process.exit(2); }
console.log(`完了: ${shots.length} 枚 → ${path.relative(process.cwd(), out)}`);
