// モードの切り替えの総当たり検査: node check-modes.mjs [ページ](既定 index.html)
// すべての「モード A → モード B」で、関節の値が壊れていないか(NaN)、
// 終わったあとに前のモードの手の目標(腕 IK)などが残っていないかを確かめる。
import { openPage } from './lib/browser.mjs';

const pagePath = process.argv[2] || 'index.html';
const { browser, page, errors } = await openPage(pagePath, { width: 400, height: 300 });
await page.waitForTimeout(2500);
const problems = await page.evaluate(() => {
  const S = window.__studio, K = S.K, out = [];
  S.prepare();
  const modes = Object.keys(K.MODES).filter((m) => m !== 'hold' && m !== 'ride');
  const broken = () => K.JOINTS.filter((j) => { const q = j.obj.quaternion; return ![q.x, q.y, q.z, q.w].every(Number.isFinite); }).map((j) => j.name);
  // 単独で評価したときの手の目標(比較の基準)
  const ref = {};
  for (const m of modes) { K.setMode(m); S.step(90); ref[m] = JSON.stringify(K.getPose().reach); }
  for (const a of modes) for (const b of modes) {
    K.setMode('idle'); S.step(60);
    K.setMode(a); S.step(45);
    K.setMode(b);
    const act = K.ACTIONS[b];
    for (let i = 0; i < 6; i++) { S.step(10); const bad = broken(); if (bad.length) { out.push(`${a}→${b}: 関節が壊れた ${bad.join(', ')}`); break; } }
    if (!act) { S.step(60); const r = JSON.stringify(K.getPose().reach); if (r !== ref[b]) out.push(`${a}→${b}: 手の目標が残っている ${r}(単独では ${ref[b]})`); }
    else {
      S.step(Math.ceil(act.dur * 60) + 60);
      const n = K.getMode(), r = JSON.stringify(K.getPose().reach);
      if (r !== ref[n]) out.push(`${a}→${b}→${n}: 手の目標が残っている ${r}(単独では ${ref[n]})`);
    }
  }
  return { modes, out };
});
await browser.close();
console.log(`モード ${problems.modes.length} 個、組み合わせ ${problems.modes.length ** 2} 通りを検査`);
problems.out.forEach((p) => console.log('NG ', p));
errors.forEach((e) => console.log('ERR', e));
console.log(problems.out.length || errors.length ? '問題あり' : 'すべて OK');
process.exit(problems.out.length || errors.length ? 3 : 0);
