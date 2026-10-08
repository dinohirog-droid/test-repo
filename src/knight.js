import * as THREE from 'three';

// 座標系: Y 上 / Z 前 / +X がナイトの左側。単位はメートル。
// 関節は Group の階層で、可動域(度)を持つ。L/R は左右で鏡像。
const BASE_JOINTS = [
  ['hips', null, [0, 0.98, 0], { x: [-35, 35], y: [-60, 60], z: [-25, 25] }, '腰'],
  ['spine', 'hips', [0, 0.1, 0], { x: [-25, 45], y: [-40, 40], z: [-25, 25] }, '背骨'],
  ['chest', 'spine', [0, 0.2, 0], { x: [-20, 30], y: [-35, 35], z: [-15, 15] }, '胸'],
  ['head', 'chest', [0, 0.36, 0], { x: [-40, 35], y: [-75, 75], z: [-30, 30] }, '頭'],
  ['visor', 'head', [0, 0.165, 0], { x: [-100, 0] }, 'バイザー'],
];

const SIDE_JOINTS = [
  ['shoulder', 'chest', [0.25, 0.25, 0], { x: [-180, 60], y: [-90, 90], z: [-15, 170] }, '肩'],
  ['elbow', 'shoulder', [0, -0.3, 0], { x: [-150, 0], y: [-90, 90] }, '肘'],
  ['wrist', 'elbow', [0, -0.27, 0], { x: [-70, 70], y: [-80, 80], z: [-40, 40] }, '手首'],
  ['hip', 'hips', [0.11, -0.07, 0], { x: [-120, 45], y: [-45, 45], z: [-20, 70] }, '股関節'],
  ['knee', 'hip', [0, -0.42, 0], { x: [0, 150] }, '膝'],
  ['ankle', 'knee', [0, -0.42, 0], { x: [-45, 45], y: [-25, 25], z: [-25, 25] }, '足首'],
];

export const ANKLE_HEIGHT = 0.07;
export const LEG_JOINTS = ['hip_L', 'knee_L', 'ankle_L', 'hip_R', 'knee_R', 'ankle_R'];

function jointDefs() {
  const defs = BASE_JOINTS.map((d) => [...d]);
  for (const s of ['L', 'R']) {
    const m = s === 'L' ? 1 : -1;
    for (const [n, p, pos, lim, label] of SIDE_JOINTS) {
      const l = { ...lim };
      if (m < 0) {
        if (l.y) l.y = [-l.y[1], -l.y[0]];
        if (l.z) l.z = [-l.z[1], -l.z[0]];
      }
      const parent = p === 'chest' || p === 'hips' ? p : `${p}_${s}`;
      defs.push([`${n}_${s}`, parent, [pos[0] * m, pos[1], pos[2]], l, `${s === 'L' ? '左' : '右'}${label}`]);
    }
  }
  defs.push(['shield', 'elbow_L', [0.095, -0.14, 0], { x: [-100, 100], y: [-110, 60] }, '盾マウント']);
  return defs;
}

// ---------- ジオメトリ ヘルパー ----------
const V2 = (x, y) => new THREE.Vector2(x, y);

function add(parent, geo, mat, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
  const o = new THREE.Mesh(geo, mat);
  o.position.set(...p);
  if (r) o.rotation.set(...r);
  o.scale.set(...(typeof s === 'number' ? [s, s, s] : s));
  o.castShadow = true;
  o.receiveShadow = true;
  parent.add(o);
  return o;
}

function curvePts(pts, div = 8) {
  return new THREE.SplineCurve(pts.map(([x, y]) => V2(x, y))).getPoints(pts.length * div);
}

// 滑らかな回転体(LatheGeometry は phi=0 が +Z 方向)
function lathe(pts, seg = 48, ps = 0, pl = Math.PI * 2) {
  return new THREE.LatheGeometry(curvePts(pts), seg, ps, pl);
}

// 厚みのある回転体シェル(縁に厚みが見える)
function shell(pts, t = 0.006, seg = 48, ps = 0, pl = Math.PI * 2) {
  const outer = curvePts(pts);
  const inner = outer.slice().reverse().map((p) => V2(p.x - t, p.y));
  return new THREE.LatheGeometry([...outer, ...inner, outer[0].clone()], seg, ps, pl);
}

// プロファイル上の半径(折れ線補間)
function radiusAt(pts, y) {
  const c = curvePts(pts, 12);
  for (let i = 0; i < c.length - 1; i++) {
    const a = c[i], b = c[i + 1];
    if ((y - a.y) * (y - b.y) <= 0 && a.y !== b.y) return a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x);
  }
  return c[0].x;
}

// 細い帯(金縁など)
function band(r, y, h = 0.012, ps = 0, pl = Math.PI * 2, bulge = 0.004) {
  return new THREE.LatheGeometry([V2(r, y - h / 2), V2(r + bulge, y), V2(r, y + h / 2)], 48, ps, pl);
}

function torus(r, tube, arc = Math.PI * 2, rad = 10, tub = 48) {
  return new THREE.TorusGeometry(r, tube, rad, tub, arc);
}

function extrude(shape, depth, bevel = 0.004, curve = 24) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: curve,
  });
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return g;
}

function polyShape(pts) {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return s;
}

// 先端が広がった十字の棒
function flaredBar(L, a, f) {
  return polyShape([
    [-a, -L + 0.05], [-f, -L], [0, -L - 0.035], [f, -L], [a, -L + 0.05],
    [a, L - 0.05], [f, L], [0, L + 0.035], [-f, L], [-a, L - 0.05],
  ]);
}

// 曲面に沿う細いチューブ(金のライン)
function surfaceLine(points, r = 0.005) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  return new THREE.TubeGeometry(curve, 48, r, 8, false);
}

// ---------- 本体 ----------
export function buildKnight(M) {
  const root = new THREE.Group();
  root.name = 'knight';
  const joints = {};
  const markerGeo = new THREE.SphereGeometry(0.022, 16, 8);

  for (const [name, parent, pos, lim, label] of jointDefs()) {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(...pos);
    (parent ? joints[parent].obj : root).add(g);
    const marker = new THREE.Mesh(
      markerGeo,
      new THREE.MeshBasicMaterial({ color: 0x7fd8ff, depthTest: false, transparent: true, opacity: 0.9 }),
    );
    marker.renderOrder = 999;
    marker.visible = false;
    marker.userData.joint = name;
    g.add(marker);
    joints[name] = {
      name, label, obj: g, marker, rest: new THREE.Vector3(...pos),
      lim: { x: lim.x || [0, 0], y: lim.y || [0, 0], z: lim.z || [0, 0] },
    };
  }

  const J = (n) => joints[n].obj;
  const extras = {};
  const colliders = [];

  buildTorso(M, J, extras, colliders);
  buildHead(M, J, extras);
  for (const s of ['L', 'R']) {
    buildArm(M, J, s, extras);
    buildLeg(M, J, s, extras, colliders);
  }
  buildSword(M, J('wrist_R'), extras);
  buildShield(M, J('shield'), extras);

  return { root, joints, extras, colliders };
}

// ---------- 胴体 ----------
function buildTorso(M, J, ex, colliders) {
  const hips = J('hips'), spine = J('spine'), chest = J('chest');

  // インナー
  add(hips, new THREE.SphereGeometry(0.15, 32, 16), M.suit, [0, -0.03, 0], 0, [1.12, 0.78, 0.85]);
  add(spine, new THREE.CapsuleGeometry(0.125, 0.16, 8, 24), M.suit, [0, 0.08, 0], 0, [1.1, 1, 0.8]);

  // 腹部の装甲(重なり合う板)
  add(spine, shell([[0.152, 0], [0.16, 0.03], [0.152, 0.058]], 0.006), M.paint, [0, 0.03, 0], 0, [1.08, 1, 0.8]);
  add(spine, shell([[0.16, 0], [0.168, 0.03], [0.162, 0.06]], 0.006), M.steel, [0, 0.085, 0], 0, [1.08, 1, 0.8]);
  add(spine, band(0.163, 0.085, 0.008), M.gold, [0, 0, 0], 0, [1.08, 1, 0.8]);

  // 胸甲
  const prof = [[0.15, -0.05], [0.19, 0.02], [0.226, 0.12], [0.226, 0.22], [0.19, 0.3], [0.12, 0.345]];
  const SZ = 0.74;
  add(chest, lathe(prof), M.steel, [0, 0, 0], 0, [1, 1, SZ]);
  // 青い側面パネル
  for (const m of [1, -1]) {
    const pts = [[0.205, 0.04], [0.232, 0.13], [0.228, 0.215]];
    add(chest, lathe(pts, 24, m > 0 ? 0.6 : -1.3, 0.7), M.paint, [0, 0, 0], 0, [1.025, 1, SZ * 1.03]);
  }
  // 金のライン(V字 + 中央キール)
  const onChest = (phi, y, off = 0.005) => {
    const r = radiusAt(prof, y) + off;
    return [r * Math.sin(phi), y, r * Math.cos(phi) * SZ + off];
  };
  for (const m of [1, -1]) {
    const pts = [];
    for (let i = 0; i <= 10; i++) pts.push(onChest(m * (0.04 + i * 0.08), 0.27 - i * 0.012));
    add(chest, surfaceLine(pts, 0.0065), M.gold);
    const pts2 = [];
    for (let i = 0; i <= 10; i++) pts2.push(onChest(m * (0.05 + i * 0.06), 0.01 + i * 0.006));
    add(chest, surfaceLine(pts2, 0.006), M.gold);
  }
  const keel = [];
  for (let i = 0; i <= 10; i++) keel.push(onChest(0, 0.0 + i * 0.03));
  add(chest, surfaceLine(keel, 0.007), M.gold);
  // 胸のコア
  const coreZ = radiusAt(prof, 0.14) * SZ;
  add(chest, new THREE.CylinderGeometry(0.03, 0.03, 0.02, 6), M.glow, [0, 0.14, coreZ + 0.006], [Math.PI / 2, 0, 0]);
  add(chest, torus(0.036, 0.008, Math.PI * 2, 8, 6), M.gold, [0, 0.14, coreZ + 0.006], [0, 0, Math.PI / 6]);

  // 喉当て
  add(chest, lathe([[0.15, 0.3], [0.135, 0.345], [0.105, 0.38], [0.088, 0.4]]), M.steel, [0, 0, 0], 0, [1, 1, 0.85]);
  add(chest, torus(0.09, 0.008), M.gold, [0, 0.398, 0], [Math.PI / 2, 0, 0], [1, 0.85, 1]);

  // ベルト
  add(hips, torus(0.152, 0.022, Math.PI * 2, 12, 64), M.leather, [0, 0.035, 0], [Math.PI / 2, 0, 0], [1.12, 0.86, 1]);
  add(hips, new THREE.BoxGeometry(0.08, 0.055, 0.02), M.gold, [0, 0.035, 0.145]);
  add(hips, new THREE.SphereGeometry(0.019, 16, 8), M.glow, [0, 0.035, 0.157], 0, [1, 1, 0.5]);
  for (const m of [1, -1]) {
    add(hips, new THREE.BoxGeometry(0.05, 0.065, 0.04), M.leather, [m * 0.15, 0.02, 0.07], [0, m * 0.6, 0]);
    add(hips, new THREE.BoxGeometry(0.052, 0.02, 0.042), M.leather, [m * 0.15, 0.055, 0.07], [0, m * 0.6, 0]);
  }

  // 前垂れ / 後ろ垂れ(太ももの動きに追従)
  const tabShape = polyShape([[-0.1, 0], [0.1, 0], [0.09, -0.34], [0, -0.4], [-0.09, -0.34]]);
  const tabInner = polyShape([[-0.083, -0.012], [0.083, -0.012], [0.075, -0.33], [0, -0.38], [-0.075, -0.33]]);
  const rim = polyShape([[-0.1, 0], [0.1, 0], [0.09, -0.34], [0, -0.4], [-0.09, -0.34]]);
  rim.holes.push(tabInner);
  for (const [key, z, flip] of [['tabardF', 0.14, 1], ['tabardB', -0.13, -1]]) {
    const t = new THREE.Group();
    t.position.set(0, 0.015, z);
    hips.add(t);
    add(t, extrude(tabShape, 0.008, 0.002), M.tabard);
    add(t, extrude(rim, 0.012, 0.002), M.gold);
    // 紋章(矢印型)
    const em = polyShape([[0, -0.11], [0.035, -0.17], [0.012, -0.16], [0.012, -0.29], [-0.012, -0.29], [-0.012, -0.16], [-0.035, -0.17]]);
    add(t, extrude(em, 0.006, 0.002), M.emblem, [0, 0, flip * 0.008]);
    ex[key] = t;
  }

  colliders.push({ obj: chest, c: [0, 0.12, 0.02], r: 0.215 });
  colliders.push({ obj: spine, c: [0, 0.06, 0], r: 0.17 });
  colliders.push({ obj: hips, c: [0, -0.03, 0], r: 0.185 });
}

// ---------- 頭部 ----------
function buildHead(M, J, ex) {
  const head = J('head'), visor = J('visor');
  const prof = [[0.105, 0.02], [0.14, 0.05], [0.158, 0.11], [0.162, 0.17], [0.156, 0.23], [0.13, 0.29], [0.08, 0.325], [0.0, 0.338]];
  const SZ = 1.08;
  const pts = curvePts(prof, 12);
  const range = (a, b) => pts.filter((p) => p.y >= a && p.y <= b);
  const sc = [1, 1, SZ];

  add(head, new THREE.CapsuleGeometry(0.055, 0.06, 6, 16), M.suit, [0, 0.0, 0]);
  // 兜: 頭頂 / 側後頭部(前方に顔の開口) / 顎
  add(head, new THREE.LatheGeometry(range(0.225, 1), 48), M.steel, [0, 0, 0], 0, sc);
  add(head, new THREE.LatheGeometry(range(0.085, 0.235), 48, 1.0, Math.PI * 2 - 2.0), M.steel, [0, 0, 0], 0, sc);
  add(head, new THREE.LatheGeometry(range(0.0, 0.1), 48), M.steel, [0, 0, 0], 0, sc);
  add(head, band(radiusAt(prof, 0.03) + 0.002, 0.03, 0.014), M.gold, [0, 0, 0], 0, sc);
  // 青いライン(側頭部)
  for (const m of [1, -1]) {
    add(head, band(radiusAt(prof, 0.255) + 0.001, 0.255, 0.02, m > 0 ? 0.9 : Math.PI * 2 - 2.5, 1.6, 0.003), M.paint, [0, 0, 0], 0, sc);
  }

  // 顔(バイザーを上げると見える)
  add(head, new THREE.SphereGeometry(0.135, 32, 16), M.slit, [0, 0.16, 0]);
  for (const m of [1, -1]) {
    add(head, new THREE.CapsuleGeometry(0.009, 0.03, 4, 8), M.glow, [m * 0.045, 0.19, 0.126], [0, 0, Math.PI / 2 + m * 0.15]);
  }

  // 耳のヒンジ
  for (const m of [1, -1]) {
    const x = m * 0.166;
    add(head, new THREE.CylinderGeometry(0.045, 0.048, 0.022, 32), M.steel, [x, 0.165, 0], [0, 0, Math.PI / 2]);
    add(head, torus(0.046, 0.006), M.gold, [x, 0.165, 0], [0, Math.PI / 2, 0]);
    add(head, torus(0.024, 0.006), M.glow, [x + m * 0.012, 0.165, 0], [0, Math.PI / 2, 0]);
    add(head, new THREE.CylinderGeometry(0.016, 0.016, 0.02, 24), M.joint, [x + m * 0.01, 0.165, 0], [0, 0, Math.PI / 2]);
  }

  // 頭頂の金の稜線(後ろから前へ)
  add(head, torus(0.165, 0.011, Math.PI / 2 + 0.45, 8, 48), M.gold, [0, 0.17, 0], [0, Math.PI / 2, 0], [1, 1, 1]);
  // 羽飾りの付け根
  add(head, new THREE.CylinderGeometry(0.02, 0.026, 0.06, 16), M.gold, [0, 0.33, -0.06], [-0.5, 0, 0]);
  ex.plumeBase = new THREE.Vector3(0, 0.35, -0.075);

  // バイザー(ヒンジ: 耳の位置。X 回転で開閉)
  const vy = -0.165;
  const vprof = range(0.085, 0.24).map((p) => V2(p.x + 0.007, p.y + vy));
  add(visor, new THREE.LatheGeometry(vprof, 40, -1.12, 2.24), M.steel, [0, 0, 0], 0, sc);
  add(visor, band(radiusAt(prof, 0.236) + 0.008, 0.236 + vy, 0.012, -1.12, 2.24), M.gold, [0, 0, 0], 0, sc);
  add(visor, band(radiusAt(prof, 0.09) + 0.008, 0.09 + vy, 0.012, -1.12, 2.24), M.gold, [0, 0, 0], 0, sc);
  // 目のスリット(横)
  add(visor, band(radiusAt(prof, 0.2) + 0.009, 0.2 + vy, 0.014, -0.8, 1.6, 0.001), M.slit, [0, 0, 0], 0, sc);
  // 縦スリット
  for (const a of [-0.48, -0.32, -0.16, 0.16, 0.32, 0.48]) {
    const r = radiusAt(prof, 0.14) + 0.009;
    add(visor, new THREE.BoxGeometry(0.014, 0.07, 0.006), M.slit, [r * Math.sin(a), 0.14 + vy, r * Math.cos(a) * SZ], [0, a, 0]);
  }
  // 中央の稜線
  const ridge = [];
  for (let i = 0; i <= 8; i++) {
    const y = 0.09 + i * 0.019;
    ridge.push([0, y + vy, (radiusAt(prof, y) + 0.011) * SZ]);
  }
  add(visor, surfaceLine(ridge, 0.008), M.gold);
}

// ---------- 腕 ----------
function buildArm(M, J, s, ex) {
  const m = s === 'L' ? 1 : -1;
  const sh = J(`shoulder_${s}`), el = J(`elbow_${s}`), wr = J(`wrist_${s}`), chest = J('chest');

  add(sh, new THREE.SphereGeometry(0.07, 24, 16), M.joint, [0, -0.01, 0]);
  add(sh, new THREE.CapsuleGeometry(0.052, 0.2, 6, 20), M.suit, [0, -0.15, 0]);
  add(sh, shell([[0.064, -0.07], [0.071, -0.14], [0.066, -0.235]]), M.steel);
  add(sh, band(0.066, -0.075, 0.01), M.gold);
  add(sh, lathe([[0.075, -0.11], [0.077, -0.16], [0.073, -0.2]], 24, m > 0 ? Math.PI / 2 - 0.5 : -Math.PI / 2 - 0.5, 1.0), M.paint);

  // 肩当て(胸に付き、腕の回転に部分追従)
  const p = new THREE.Group();
  p.position.set(0.25 * m, 0.25, 0);
  chest.add(p);
  const cap = new THREE.Group();
  cap.rotation.z = -0.55 * m;
  cap.position.set(0.012 * m, 0.015, 0);
  p.add(cap);
  add(cap, new THREE.SphereGeometry(0.128, 32, 16, 0, Math.PI * 2, 0, 0.95), M.steel, [0, -0.05, 0]);
  add(cap, torus(0.128 * Math.sin(0.95), 0.007), M.gold, [0, -0.05 + 0.128 * Math.cos(0.95), 0], [Math.PI / 2, 0, 0]);
  add(cap, new THREE.SphereGeometry(0.136, 32, 8, 0, Math.PI * 2, 0.82, 0.42), M.paint, [0, -0.07, 0]);
  add(cap, torus(0.136 * Math.sin(1.24), 0.007), M.gold, [0, -0.07 + 0.136 * Math.cos(1.24), 0], [Math.PI / 2, 0, 0]);
  add(cap, new THREE.SphereGeometry(0.142, 32, 8, 0, Math.PI * 2, 1.15, 0.38), M.steel, [0, -0.095, 0]);
  add(cap, torus(0.142 * Math.sin(1.53), 0.007), M.gold, [0, -0.095 + 0.142 * Math.cos(1.53), 0], [Math.PI / 2, 0, 0]);
  // 肩の発光リング
  add(p, torus(0.03, 0.007), M.glow, [m * 0.135, -0.05, 0], [0, Math.PI / 2, 0]);
  add(p, new THREE.CylinderGeometry(0.03, 0.03, 0.012, 24), M.joint, [m * 0.13, -0.05, 0], [0, 0, Math.PI / 2]);
  ex[`pauldron_${s}`] = p;

  // 肘
  add(el, new THREE.SphereGeometry(0.058, 24, 16), M.joint);
  add(el, new THREE.SphereGeometry(0.07, 24, 12, 0, Math.PI * 2, 0, 1.0), M.steel, [0, 0, -0.004], [-Math.PI / 2, 0, 0]);
  add(el, torus(0.07 * Math.sin(1.0), 0.006), M.gold, [0, 0, -0.004 + 0.07 * Math.cos(1.0) * -1], [0, 0, 0]);
  add(el, new THREE.CylinderGeometry(0.03, 0.03, 0.012, 24), M.steelDark, [m * 0.058, 0, 0], [0, 0, Math.PI / 2]);
  add(el, torus(0.026, 0.006), M.glow, [m * 0.064, 0, 0], [0, Math.PI / 2, 0]);

  // 前腕
  add(el, new THREE.CapsuleGeometry(0.047, 0.17, 6, 20), M.suit, [0, -0.13, 0]);
  add(el, shell([[0.058, -0.035], [0.065, -0.1], [0.059, -0.19], [0.053, -0.235]]), M.steel);
  add(el, band(0.06, -0.04, 0.01), M.gold);
  add(el, lathe([[0.067, -0.08], [0.065, -0.14], [0.061, -0.19]], 24, m > 0 ? Math.PI / 2 - 0.45 : -Math.PI / 2 - 0.45, 0.9), M.paint);
  add(el, new THREE.BoxGeometry(0.004, 0.08, 0.012), M.glow, [m * 0.069, -0.135, 0]);

  // 手(ガントレット)
  add(wr, lathe([[0.05, 0.0], [0.057, -0.03], [0.066, -0.05]]), M.steel);
  add(wr, new THREE.SphereGeometry(0.035, 16, 8), M.joint, [0, -0.02, 0]);
  add(wr, new THREE.CapsuleGeometry(0.038, 0.055, 6, 16), M.suit, [0, -0.085, 0.005], [Math.PI / 2, 0, 0]);
  add(wr, new THREE.BoxGeometry(0.014, 0.075, 0.085), M.steel, [m * 0.034, -0.075, 0.005]);
  add(wr, new THREE.BoxGeometry(0.03, 0.022, 0.09), M.steel, [m * 0.012, -0.118, 0.005]);
  add(wr, new THREE.BoxGeometry(0.006, 0.06, 0.012), M.gold, [m * 0.042, -0.075, 0.005]);
  add(wr, new THREE.CapsuleGeometry(0.015, 0.03, 4, 8), M.suit, [-m * 0.028, -0.065, 0.04], [0.6, 0, 0]);
}

// ---------- 脚 ----------
function buildLeg(M, J, s, ex, colliders) {
  const m = s === 'L' ? 1 : -1;
  const hp = J(`hip_${s}`), kn = J(`knee_${s}`), an = J(`ankle_${s}`), hips = J('hips');

  add(hp, new THREE.SphereGeometry(0.08, 24, 16), M.joint);
  add(hp, new THREE.CapsuleGeometry(0.072, 0.28, 6, 20), M.suit, [0, -0.21, 0]);
  add(hp, shell([[0.084, -0.06], [0.093, -0.17], [0.089, -0.28], [0.081, -0.345]], 0.006, 40, -0.8 * Math.PI, 1.6 * Math.PI), M.steel);
  add(hp, lathe([[0.099, -0.1], [0.096, -0.2], [0.093, -0.29]], 24, -0.32, 0.64), M.paint);
  add(hp, band(0.087, -0.065, 0.012, -0.8 * Math.PI, 1.6 * Math.PI), M.gold);

  // 草摺(腰に付き、太ももに追従)
  const t = new THREE.Group();
  t.position.set(0.11 * m, -0.0, 0);
  hips.add(t);
  const c = m > 0 ? Math.PI / 2 : -Math.PI / 2;
  add(t, shell([[0.1, 0.03], [0.112, -0.05], [0.118, -0.12]], 0.005, 24, c - 0.95, 1.9), M.steel);
  add(t, band(0.118, -0.12, 0.01, c - 0.95, 1.9), M.gold);
  add(t, shell([[0.116, -0.1], [0.124, -0.16], [0.128, -0.2]], 0.005, 24, c - 0.85, 1.7), M.paint);
  add(t, band(0.128, -0.2, 0.01, c - 0.85, 1.7), M.gold);
  ex[`tasset_${s}`] = t;

  // 膝
  add(kn, new THREE.SphereGeometry(0.066, 24, 16), M.joint);
  add(kn, new THREE.SphereGeometry(0.084, 32, 12, 0, Math.PI * 2, 0, 1.0), M.steel, [0, 0, 0.012], [Math.PI / 2, 0, 0]);
  add(kn, torus(0.084 * Math.sin(1.0), 0.007), M.gold, [0, 0, 0.012 + 0.084 * Math.cos(1.0)], [0, 0, 0]);
  add(kn, new THREE.SphereGeometry(0.045, 24, 8, 0, Math.PI * 2, 0, 0.9), M.paint, [0, 0, 0.058], [Math.PI / 2, 0, 0]);
  add(kn, new THREE.CylinderGeometry(0.036, 0.036, 0.014, 24), M.steelDark, [m * 0.07, 0, 0], [0, 0, Math.PI / 2]);
  add(kn, torus(0.03, 0.007), M.glow, [m * 0.077, 0, 0], [0, Math.PI / 2, 0]);

  // すね
  add(kn, new THREE.CapsuleGeometry(0.062, 0.28, 6, 20), M.suit, [0, -0.2, 0]);
  const gp = [[0.072, -0.05], [0.083, -0.13], [0.079, -0.25], [0.067, -0.34], [0.074, -0.4]];
  add(kn, shell(gp), M.steel);
  add(kn, lathe([[0.088, -0.09], [0.085, -0.2], [0.075, -0.3]], 24, -0.35, 0.7), M.paint);
  add(kn, band(0.07, -0.345, 0.012), M.gold);
  add(kn, band(0.075, -0.055, 0.01), M.gold);
  add(kn, new THREE.BoxGeometry(0.004, 0.09, 0.012), M.glow, [m * 0.083, -0.2, 0.0]);

  // 足首・足(サバトン)
  add(an, new THREE.SphereGeometry(0.05, 20, 12), M.joint);
  const foot = new THREE.Shape();
  foot.moveTo(-0.075, -0.07);
  foot.lineTo(0.15, -0.07);
  foot.quadraticCurveTo(0.205, -0.07, 0.195, -0.035);
  foot.quadraticCurveTo(0.175, -0.003, 0.095, 0.0);
  foot.quadraticCurveTo(0.03, 0.025, -0.01, 0.05);
  foot.lineTo(-0.06, 0.045);
  foot.quadraticCurveTo(-0.095, 0.02, -0.075, -0.07);
  const fg = extrude(foot, 0.085, 0.012);
  fg.rotateY(-Math.PI / 2);
  add(an, fg, M.steel);
  add(an, new THREE.BoxGeometry(0.1, 0.014, 0.27), M.joint, [0, -0.069, 0.06]);
  for (const [z, y, r] of [[0.11, -0.05, 0.05], [0.05, -0.035, 0.058]]) {
    add(an, torus(r, 0.006, Math.PI, 8, 24), M.gold, [0, y, z], [0, 0, 0], [1, 0.72, 1]);
  }
  add(an, torus(0.024, 0.006), M.glow, [m * 0.058, -0.01, -0.01], [0, Math.PI / 2, 0]);

  colliders.push({ obj: hp, c: [0, -0.1, 0], r: 0.115 });
  colliders.push({ obj: hp, c: [0, -0.3, 0], r: 0.105 });
  colliders.push({ obj: kn, c: [0, -0.12, 0], r: 0.095 });
  colliders.push({ obj: kn, c: [0, -0.32, 0], r: 0.085 });
}

// ---------- 剣 ----------
function buildSword(M, wr, ex) {
  const sw = new THREE.Group();
  sw.position.set(0, -0.085, 0.005);
  sw.rotation.x = Math.PI / 2; // 刃(+Y)を手の前方(+Z)へ
  wr.add(sw);
  add(sw, new THREE.CylinderGeometry(0.017, 0.019, 0.17, 16), M.suit);
  for (const y of [-0.07, 0, 0.07]) add(sw, torus(0.019, 0.004, Math.PI * 2, 6, 16), M.gold, [0, y, 0], [Math.PI / 2, 0, 0]);
  add(sw, new THREE.SphereGeometry(0.028, 20, 12), M.gold, [0, -0.11, 0]);
  add(sw, new THREE.OctahedronGeometry(0.018), M.glow, [0, -0.135, 0]);
  const guard = polyShape([
    [0, 0.05], [0.03, 0.035], [0.065, 0.02], [0.12, 0.045], [0.145, 0.03], [0.11, -0.005], [0.04, -0.02], [0, -0.03],
    [-0.04, -0.02], [-0.11, -0.005], [-0.145, 0.03], [-0.12, 0.045], [-0.065, 0.02], [-0.03, 0.035],
  ]);
  add(sw, extrude(guard, 0.03, 0.006), M.gold, [0, 0.1, 0]);
  add(sw, new THREE.OctahedronGeometry(0.026), M.glow, [0, 0.105, 0], 0, [1, 1.3, 0.7]);
  const blade = polyShape([[-0.034, 0], [-0.04, 0.6], [-0.03, 0.75], [0, 0.86], [0.03, 0.75], [0.04, 0.6], [0.034, 0]]);
  add(sw, extrude(blade, 0.006, 0.006), M.blade, [0, 0.12, 0]);
  const core = polyShape([[-0.007, 0.02], [-0.009, 0.6], [0, 0.78], [0.009, 0.6], [0.007, 0.02]]);
  add(sw, extrude(core, 0.016, 0.002), M.bladeCore, [0, 0.12, 0]);
  ex.sword = sw;
  ex.swordBase = new THREE.Vector3(0, 0.16, 0);
  ex.swordTip = new THREE.Vector3(0, 0.98, 0);
}

// ---------- 盾 ----------
function heater(w, h, inset = 0) {
  const W = w / 2 - inset, top = h * 0.42 - inset, bot = -h * 0.58 + inset * 1.7;
  const s = new THREE.Shape();
  s.moveTo(-W, top);
  s.quadraticCurveTo(0, top + 0.035, W, top);
  s.lineTo(W, 0.0);
  s.quadraticCurveTo(W * 0.95, bot * 0.6, 0, bot);
  s.quadraticCurveTo(-W * 0.95, bot * 0.6, -W, 0.0);
  s.closePath();
  return s;
}

function bend(geo, k = 1.1) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) - k * p.getX(i) ** 2);
  geo.computeVertexNormals();
  return geo;
}

function buildShield(M, mount, ex) {
  const sh = new THREE.Group();
  sh.rotation.y = Math.PI / 2; // 表面(+Z)を腕の外側(+X)へ
  sh.position.set(0.022, -0.02, 0);
  mount.add(sh);
  const W = 0.44, H = 0.6;
  add(sh, bend(extrude(heater(W, H, 0.02), 0.024, 0.006)), M.paint);
  const rim = heater(W, H);
  rim.holes.push(new THREE.Path(heater(W, H, 0.035).getPoints(48)));
  add(sh, bend(extrude(rim, 0.04, 0.006)), M.gold);
  add(sh, bend(extrude(rim, 0.03, 0.004)), M.steel, [0, 0, 0.004], 0, [0.965, 0.965, 1]);
  const v = bend(extrude(flaredBar(0.2, 0.02, 0.042), 0.01, 0.003));
  add(sh, v, M.glowSoft, [0, -0.03, 0.024]);
  const hbar = extrude(flaredBar(0.13, 0.02, 0.042), 0.01, 0.003);
  hbar.rotateZ(Math.PI / 2);
  add(sh, bend(hbar), M.glowSoft, [0, 0.06, 0.024]);
  // 裏側のストラップ
  for (const y of [0.1, -0.08]) add(sh, new THREE.BoxGeometry(0.14, 0.03, 0.012), M.leather, [0, y, -0.03]);
  ex.shield = sh;
}
