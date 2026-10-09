// 腕ポーズの自動調整: node optimize-arms.mjs targets/cyber-knight-arms.json [--pose idle] [--side L]
// 持ち物(盾・剣など)の位置と向きが目標に近づくように、肩・肘・前腕ひねり・手首の角度を探す(座標降下法)。
// 結果は静止ポーズにそのまま貼り付けられる形で表示する。
//
// targets の形式:
// { "page": "index.html", "model": "K",
//   "sides": { "L": { "object": "items.L.obj.children.0", "axis": [0,0,1], "upAxis": [0,1,0], "upWeight": 0.8,
//                     "avoid": { "joint": "chest", "offset": [0,0.12,0], "radius": 0.33, "weight": 6 },
//                     "poses": { "idle": { "pos": [x,y,z], "dir": [x,y,z] }, ... } },
//              "R": { "object": "items.R.obj", "axis": [0,1,0], "posObject": "joints.wrist_R", "poses": {...} } } }
//   object: 向きを測る物(モデルの公開 API からのパス)/ axis: その物のローカル軸を dir へ向ける
//   posObject: 位置を pos に合わせる物(省略時は object)/ upAxis・upWeight: その軸をなるべく上へ
//   avoid: 関節の近くに入り込まないための罰則 / 座標はスタジオのワールド座標(メートル)
import fs from 'node:fs';
import path from 'node:path';
import { openPage, TOOLS } from './lib/browser.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const file = argv.find((a) => a.endsWith('.json'));
if (!file) { console.error('使い方: node optimize-arms.mjs <targets.json> [--pose name] [--side L|R]'); process.exit(1); }
const conf = JSON.parse(fs.readFileSync(path.resolve(TOOLS, file), 'utf8'));
const onlyPose = opt('--pose'), onlySide = opt('--side');

const { browser, page, errors } = await openPage(conf.page || 'index.html', { width: 400, height: 300 });
await page.waitForTimeout(2500);
const result = await page.evaluate(([conf, onlyPose, onlySide]) => {
  const S = window.__studio;
  S.paused = true;
  const K = S[conf.model || 'K'];
  K.setLook(false);
  const V = S.camera.position.constructor;
  const get = (p) => p.split('.').reduce((o, k) => o[k], K);
  const JL = {};
  K.JOINTS.forEach((j) => (JL[j.name] = j));
  const out = {};
  for (const [side, T] of Object.entries(conf.sides)) {
    if (onlySide && side !== onlySide) continue;
    const obj = get(T.object), posObj = get(T.posObject || T.object);
    const axis = new V(...(T.axis || [0, 0, 1])), upAxis = T.upAxis ? new V(...T.upAxis) : null;
    const vars = ['shoulder.x', 'shoulder.y', 'shoulder.z', 'elbow.x', 'forearm.y', 'wrist.x', 'wrist.y', 'wrist.z']
      .map((k) => { const [j, a] = k.split('.'); return [j + '_' + side, a]; });
    for (const [poseName, goal] of Object.entries(T.poses)) {
      if (onlyPose && poseName !== onlyPose) continue;
      const st = K.poses[poseName];
      const P = K.newPose();
      K.JOINTS.forEach((j) => { P.j[j.name] = (st.j[j.name] || [0, 0, 0]).slice(); });
      P.root = st.root.slice();
      ['L', 'R'].forEach((s) => { P.feet[s] = st.feet[s].slice(); while (P.feet[s].length < 6) P.feet[s].push(0); });
      const tp = new V(...goal.pos), tv = new V(...goal.dir).normalize();
      const n = new V(), u = new V(), c = new V(), a = new V();
      const score = () => {
        K.applyPose(P);
        n.copy(axis).transformDirection(obj.matrixWorld);
        posObj.getWorldPosition(c);
        let s = n.dot(tv) - 5 * c.distanceTo(tp);
        if (upAxis) s += (T.upWeight ?? 0.8) * u.copy(upAxis).transformDirection(obj.matrixWorld).y;
        if (T.avoid) {
          K.joints[T.avoid.joint].getWorldPosition(a);
          a.add(new V(...(T.avoid.offset || [0, 0, 0])));
          s -= Math.max(0, T.avoid.radius - c.distanceTo(a)) * (T.avoid.weight ?? 6);
        }
        return s;
      };
      let best = score();
      for (const step of [30, 15, 8, 4, 2]) {
        let improved = true, guard = 0;
        while (improved && guard++ < 40) {
          improved = false;
          for (const [j, ax] of vars) {
            const lim = JL[j].lim[ax];
            if (lim[0] === lim[1]) continue;
            const i = 'xyz'.indexOf(ax);
            for (const d of [step, -step]) {
              const old = P.j[j][i], nv = Math.min(lim[1], Math.max(lim[0], old + d));
              if (nv === old) continue;
              P.j[j][i] = nv;
              const s = score();
              if (s > best + 1e-4) { best = s; improved = true; } else P.j[j][i] = old;
            }
          }
        }
      }
      score();
      const r = { score: +best.toFixed(3), dot: +n.dot(tv).toFixed(3), dist: +c.distanceTo(tp).toFixed(3), joints: {} };
      vars.forEach(([j]) => (r.joints[j] = P.j[j].map(Math.round)));
      (out[poseName] = out[poseName] || {})[side] = r;
    }
  }
  return out;
}, [conf, onlyPose, onlySide]);
await browser.close();
if (errors.length) { console.error('ページのエラー:\n' + errors.join('\n')); process.exit(2); }
for (const [pose, sides] of Object.entries(result)) {
  console.log(`\n# ${pose}`);
  for (const [side, r] of Object.entries(sides)) {
    console.log(`  // ${side}: 向きの一致 ${r.dot}、位置のずれ ${(r.dist * 100).toFixed(1)} cm`);
    console.log('  ' + Object.entries(r.joints).map(([j, v]) => `${j}: [${v.join(', ')}]`).join(', ') + ',');
  }
}
fs.mkdirSync(path.join(TOOLS, 'out'), { recursive: true });
fs.writeFileSync(path.join(TOOLS, 'out', 'optimize-result.json'), JSON.stringify(result, null, 2));
console.log('\nJSON: tools/out/optimize-result.json');
