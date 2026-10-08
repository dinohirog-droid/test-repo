/**
 * cyber-knight-model.js
 * サイバーナイト 3D モデル＆モーション モジュール
 * すべての形状をコードで生成。関節リグ(可動域つき)、脚 IK(接地)、3 節の指、
 * 盾を拳で握る保持方式、連動装甲、マントと羽飾りの物理、剣の軌跡、輪郭線、カラーバリエーション。
 * Three.js r128 〜 r170 で動作(色管理・テクスチャ色空間の差を吸収)。
 */
(function (global) {
  'use strict';

  global.CyberKnightModel = {
    /* モデルの約束ごと（MODEL_SPEC.md）：info と create を持つ */
    info: {
      id: 'cyber-knight', kind: 'model', version: '2026.10.08', name: 'サイバーナイト',
      desc: '古の騎士の意志を継ぐ機械仕掛けの騎士。関節リグ(可動域つき)・脚IK・3節の指・拳で握る盾・連動装甲・マントと羽飾りの物理・剣の軌跡・輪郭線',
      create: 'create(THREE, parent, options) → { root, setMode, update, setColor, setHand, setEquip, setOutline, editJoint, ... }',
      modes: ['idle', 'guard', 'block', 'visor', 'walk', 'run', 'spin', 'charge'],
      colors: ['normal', 'red', 'black', 'gold'],
      hands: ['grip', 'fist', 'open', 'relax'],
      height: 1.97, // scale=1 のときの全高(メートル)
    },

    create: function (THREE, parentNode, options) {
      options = options || {};
      const SCALE = options.scale !== undefined ? options.scale : 2.4; // 既定はセリナ(全高 約4.7)と同じ世界の縮尺
      const D2R = Math.PI / 180, R2D = 180 / Math.PI;
      const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
      const lerp = (a, b, k) => a + (b - a) * k;
      const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
      const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
      const V2 = (x, y) => new THREE.Vector2(x, y);
      const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

      /* ========================================================
         1. マテリアル（r128 と r152+ の色管理の差を吸収）
         ======================================================== */
      const CM = !!(THREE.ColorManagement && THREE.ColorManagement.enabled && THREE.SRGBColorSpace);
      const lin = (c) => (CM ? c : c.convertSRGBToLinear());
      const C = (hex) => lin(new THREE.Color(hex));
      function srgbTex(t) {
        if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace; else t.encoding = THREE.sRGBEncoding;
        t.anisotropy = 8;
        return t;
      }

      const GLOW = C(0x2fa4ff);
      const gk = options.glowIntensity !== undefined ? options.glowIntensity : 1;
      const metal = (hex, roughness, extra) => new THREE.MeshPhysicalMaterial(Object.assign(
        { color: C(hex), metalness: 1, roughness, side: THREE.DoubleSide }, extra || {}));
      const M = {
        steel: metal(0xc4cad4, 0.3, { clearcoat: 0.5, clearcoatRoughness: 0.15 }),
        steelDark: metal(0x8a93a3, 0.38),
        gold: metal(0xd9ad55, 0.26),
        paint: new THREE.MeshPhysicalMaterial({ color: C(0x1f4fb8), metalness: 0.45, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08, side: THREE.DoubleSide }),
        suit: new THREE.MeshStandardMaterial({ color: C(0x15181f), metalness: 0.35, roughness: 0.62 }),
        joint: new THREE.MeshStandardMaterial({ color: C(0x2b303b), metalness: 0.85, roughness: 0.32 }),
        leather: new THREE.MeshStandardMaterial({ color: C(0x5b3a22), roughness: 0.72 }),
        slit: new THREE.MeshStandardMaterial({ color: C(0x030406), roughness: 0.95 }),
        glow: new THREE.MeshStandardMaterial({ color: C(0x0b3a7a), emissive: GLOW, emissiveIntensity: 8 * gk }),
        glowSoft: new THREE.MeshStandardMaterial({ color: C(0x0b3a7a), emissive: GLOW, emissiveIntensity: 3 * gk }),
        blade: new THREE.MeshPhysicalMaterial({ color: C(0x3f8fe0), emissive: C(0x1a7cff), emissiveIntensity: 2.2 * gk, metalness: 0.1, roughness: 0.12, transparent: true, opacity: 0.88, side: THREE.DoubleSide }),
        bladeCore: new THREE.MeshStandardMaterial({ color: C(0xffffff), emissive: C(0x9fe0ff), emissiveIntensity: 6 * gk }),
        tabard: new THREE.MeshStandardMaterial({ color: C(0x1f4fb8), roughness: 0.75, side: THREE.DoubleSide }),
        cloth: new THREE.MeshStandardMaterial({ roughness: 0.82, side: THREE.DoubleSide }),
        plume: new THREE.MeshStandardMaterial({ color: C(0x2b5cff), roughness: 0.55, side: THREE.DoubleSide }),
        emblem: metal(0xf2f4f8, 0.2),
      };
      const NO_OUTLINE = [M.glow, M.glowSoft, M.blade, M.bladeCore, M.slit];

      // カラーバリエーション(設定資料の 通常 / レッド / ブラック / ゴールド)
      const COLORS = {
        normal: { label: '通常', paint: 0x1f4fb8, cloth: '#1d3c9a', clothDark: '#0e1f55', plume: 0x2b5cff },
        red: { label: 'レッド', paint: 0xa01e2a, cloth: '#8c1822', clothDark: '#45090f', plume: 0xe02b36 },
        black: { label: 'ブラック', paint: 0x23262e, cloth: '#24262c', clothDark: '#0b0c10', plume: 0x2a2c33 },
        gold: { label: 'ゴールド', paint: 0xb88a2a, cloth: '#a87a22', clothDark: '#4f3608', plume: 0xe0a53a },
      };
      // マント用テクスチャ(グラデーション + 金縁 + 背中の十字)
      function capeTexture(v) {
        const c = document.createElement('canvas');
        c.width = 512; c.height = 1024;
        const g = c.getContext('2d');
        const grad = g.createLinearGradient(0, 0, 0, 1024);
        grad.addColorStop(0, v.clothDark); grad.addColorStop(0.25, v.cloth); grad.addColorStop(1, v.cloth);
        g.fillStyle = grad; g.fillRect(0, 0, 512, 1024);
        for (let i = 0; i < 9000; i++) {
          g.fillStyle = `rgba(255,255,255,${Math.random() * 0.035})`;
          g.fillRect(Math.random() * 512, Math.random() * 1024, 2, 1);
        }
        g.fillStyle = '#0a0d14'; // 輪郭線のかわりの濃い縁
        g.fillRect(0, 1018, 512, 6); g.fillRect(0, 0, 4, 1024); g.fillRect(508, 0, 4, 1024);
        g.fillStyle = '#d9ad55';
        g.fillRect(0, 996, 512, 22); g.fillRect(4, 0, 10, 1024); g.fillRect(498, 0, 10, 1024);
        g.fillStyle = 'rgba(217,173,85,0.7)'; g.fillRect(0, 976, 512, 6);
        g.save(); g.translate(256, 380);
        g.shadowColor = 'rgba(160,220,255,0.9)'; g.shadowBlur = 24; g.fillStyle = '#eef3ff';
        const bar = (w, h) => {
          g.beginPath();
          g.moveTo(-w, -h + 30); g.lineTo(-w * 2.2, -h); g.lineTo(0, -h - 26); g.lineTo(w * 2.2, -h); g.lineTo(w, -h + 30);
          g.lineTo(w, h - 30); g.lineTo(w * 2.2, h); g.lineTo(0, h + 26); g.lineTo(-w * 2.2, h); g.lineTo(-w, h - 30);
          g.closePath(); g.fill();
        };
        bar(13, 170); g.rotate(Math.PI / 2); g.translate(-60, 0); bar(13, 115);
        g.restore();
        return srgbTex(new THREE.CanvasTexture(c));
      }
      let colorId = 'normal';
      function setColor(id) {
        const v = COLORS[id];
        if (!v) return;
        colorId = id;
        M.paint.color.copy(C(v.paint));
        M.tabard.color.copy(C(v.paint)).multiplyScalar(0.9);
        M.plume.color.copy(C(v.plume));
        if (M.cloth.map) M.cloth.map.dispose();
        M.cloth.map = capeTexture(v);
        M.cloth.needsUpdate = true;
      }

      /* ========================================================
         2. 形状ヘルパー
         ======================================================== */
      function add(parent, geo, mat, p, r, s) {
        const o = new THREE.Mesh(geo, mat);
        if (p) o.position.set(p[0], p[1], p[2]);
        if (r) o.rotation.set(r[0], r[1], r[2]);
        if (s !== undefined) { if (typeof s === 'number') o.scale.setScalar(s); else o.scale.set(s[0], s[1], s[2]); }
        o.castShadow = true; o.receiveShadow = true;
        parent.add(o);
        return o;
      }
      const curvePts = (pts, div) => new THREE.SplineCurve(pts.map((q) => V2(q[0], q[1]))).getPoints(pts.length * (div || 8));
      // 回転体(LatheGeometry は phi=0 が +Z 方向)
      const lathe = (pts, seg, ps, pl) => new THREE.LatheGeometry(curvePts(pts), seg || 48, ps || 0, pl === undefined ? Math.PI * 2 : pl);
      // 厚みのある回転体シェル(縁に厚みが見える)
      function shell(pts, t, seg, ps, pl) {
        t = t || 0.006;
        const outer = curvePts(pts);
        const inner = outer.slice().reverse().map((p) => V2(p.x - t, p.y));
        return new THREE.LatheGeometry(outer.concat(inner, [outer[0].clone()]), seg || 48, ps || 0, pl === undefined ? Math.PI * 2 : pl);
      }
      function radiusAt(pts, y) {
        const c = curvePts(pts, 12);
        for (let i = 0; i < c.length - 1; i++) {
          const a = c[i], b = c[i + 1];
          if ((y - a.y) * (y - b.y) <= 0 && a.y !== b.y) return a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x);
        }
        return c[0].x;
      }
      // 細い帯(金縁など)
      const band = (r, y, h, ps, pl, bulge) => new THREE.LatheGeometry(
        [V2(r, y - (h || 0.012) / 2), V2(r + (bulge === undefined ? 0.004 : bulge), y), V2(r, y + (h || 0.012) / 2)],
        48, ps || 0, pl === undefined ? Math.PI * 2 : pl);
      const torus = (r, tube, arc, rad, tub) => new THREE.TorusGeometry(r, tube, rad || 10, tub || 48, arc === undefined ? Math.PI * 2 : arc);
      const sphere = (r, w, h) => new THREE.SphereGeometry(r, w || 24, h || 16);
      const cylX = (r, len, seg) => { const g = new THREE.CylinderGeometry(r, r, len, seg || 24); g.rotateZ(Math.PI / 2); return g; };
      const cylZ = (r, len, seg) => { const g = new THREE.CylinderGeometry(r, r, len, seg || 24); g.rotateX(Math.PI / 2); return g; };
      function extrude(shape, depth, bevel, curve) {
        bevel = bevel === undefined ? 0.004 : bevel;
        const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: curve || 24 });
        g.translate(0, 0, -depth / 2);
        g.computeVertexNormals();
        return g;
      }
      function polyShape(pts) {
        const s = new THREE.Shape();
        pts.forEach((q, i) => (i ? s.lineTo(q[0], q[1]) : s.moveTo(q[0], q[1])));
        s.closePath();
        return s;
      }
      function rrShape(w, h, r) {
        const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
        r = Math.min(r, w / 2, h / 2);
        s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
        s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
        s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
        return s;
      }
      // 角丸の箱: w=X h=Y d=Z
      function rbox(w, h, d, r) {
        const b = Math.min(d * 0.3, r * 0.8, 0.02);
        return extrude(rrShape(w - 2 * b, h - 2 * b, Math.max(0.001, r - b)), Math.max(0.001, d - 2 * b), b, 6);
      }
      const flaredBar = (L, a, f) => polyShape([
        [-a, -L + 0.05], [-f, -L], [0, -L - 0.035], [f, -L], [a, -L + 0.05],
        [a, L - 0.05], [f, L], [0, L + 0.035], [-f, L], [-a, L - 0.05],
      ]);
      const surfaceLine = (points, r) => new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points.map((p) => V3(p[0], p[1], p[2]))), 48, r || 0.005, 8, false);
      // カプセル(r128 には CapsuleGeometry がないので回転体で作る)
      const capCache = {};
      function capsule(r, L) {
        const key = r.toFixed(4) + '|' + L.toFixed(4);
        if (capCache[key]) return capCache[key];
        const pts = [], n = 8;
        for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + (Math.PI / 2) * (i / n); pts.push(V2(Math.cos(a) * r, -L / 2 + Math.sin(a) * r)); }
        for (let i = 0; i <= n; i++) { const a = (Math.PI / 2) * (i / n); pts.push(V2(Math.cos(a) * r, L / 2 + Math.sin(a) * r)); }
        pts[0].x = 0; pts[pts.length - 1].x = 0;
        return (capCache[key] = new THREE.LatheGeometry(pts, 20));
      }

      /* ========================================================
         3. 関節定義と骨格（座標系: Y 上 / Z 前 / +X がナイトの左。単位 m）
         ======================================================== */
      const BASE = [
        ['hips', null, [0, 0.98, 0], { x: [-35, 35], y: [-60, 60], z: [-25, 25] }, '腰'],
        ['spine', 'hips', [0, 0.1, 0], { x: [-25, 45], y: [-40, 40], z: [-25, 25] }, '背骨'],
        ['chest', 'spine', [0, 0.2, 0], { x: [-20, 30], y: [-35, 35], z: [-15, 15] }, '胸'],
        ['neck', 'chest', [0, 0.33, 0], { x: [-25, 25], y: [-35, 35], z: [-15, 15] }, '首'],
        ['head', 'neck', [0, 0.03, 0], { x: [-30, 25], y: [-50, 50], z: [-20, 20] }, '頭'],
        ['visor', 'head', [0, 0.165, 0], { x: [-100, 0] }, 'バイザー'],
      ];
      const SIDE = [
        ['shoulder', 'chest', [0.25, 0.25, 0], { x: [-180, 60], y: [-90, 90], z: [-15, 170] }, '肩'],
        ['elbow', 'shoulder', [0, -0.3, 0], { x: [-150, 0] }, '肘'],
        ['forearm', 'elbow', [0, 0, 0], { y: [-90, 90] }, '前腕ひねり'],
        ['wrist', 'forearm', [0, -0.27, 0], { x: [-70, 70], y: [-30, 30], z: [-40, 40] }, '手首'],
        ['hip', 'hips', [0.11, -0.07, 0], { x: [-120, 45], y: [-45, 45], z: [-20, 70] }, '股関節'],
        ['knee', 'hip', [0, -0.42, 0], { x: [0, 150] }, '膝'],
        ['ankle', 'knee', [0, -0.42, 0], { x: [-45, 45], y: [-25, 25], z: [-25, 25] }, '足首'],
        ['toe', 'ankle', [0, -0.05, 0.09], { x: [-45, 30] }, 'つま先'],
      ];
      const ANKLE_H = 0.07;
      const LEGS = ['hip', 'knee', 'ankle', 'toe'];
      const DEFS = BASE.slice();
      ['L', 'R'].forEach((s) => {
        const m = s === 'L' ? 1 : -1;
        SIDE.forEach((d) => {
          const lim = Object.assign({}, d[3]);
          if (m < 0) {
            if (lim.y) lim.y = [-lim.y[1], -lim.y[0]];
            if (lim.z) lim.z = [-lim.z[1], -lim.z[0]];
          }
          const parent = d[1] === 'chest' || d[1] === 'hips' ? d[1] : d[1] + '_' + s;
          DEFS.push([d[0] + '_' + s, parent, [d[2][0] * m, d[2][1], d[2][2]], lim, (m > 0 ? '左' : '右') + d[4]]);
        });
      });

      const root = new THREE.Group(); // 外側(呼び出し側が置く)。縮尺はかけない
      root.name = 'CyberKnight';
      if (parentNode) parentNode.add(root);
      const model = new THREE.Group(); // 縮尺 SCALE。ここから下が騎士本体
      model.scale.setScalar(SCALE);
      root.add(model);
      const knight = new THREE.Group(); // 向き(回転斬りの回転など)
      model.add(knight);
      const fx = new THREE.Group(); // マント・羽飾り・軌跡の物理空間(単位 m)
      fx.scale.setScalar(SCALE);
      root.add(fx);

      const J = {}, JOINTS = [], markers = [];
      const markerGeo = new THREE.SphereGeometry(0.022, 16, 8);
      DEFS.forEach((d) => {
        const g = new THREE.Group();
        g.name = d[0];
        g.position.set(d[2][0], d[2][1], d[2][2]);
        (d[1] ? J[d[1]] : knight).add(g);
        J[d[0]] = g;
        const mk = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: 0x7fd8ff, depthTest: false, transparent: true, opacity: 0.9 }));
        mk.renderOrder = 999; mk.visible = false; mk.userData.joint = d[0];
        g.add(mk); markers.push(mk);
        const lim = { x: d[3].x || [0, 0], y: d[3].y || [0, 0], z: d[3].z || [0, 0] };
        JOINTS.push({ name: d[0], label: d[4], lim, rest: V3(d[2][0], d[2][1], d[2][2]), obj: g });
      });
      const JL = {};
      JOINTS.forEach((j) => (JL[j.name] = j));
      const isLeg = (n) => LEGS.indexOf(n.split('_')[0]) >= 0 && n.indexOf('_') > 0;

      const ex = {};      // 連動パーツなど
      const colliders = []; // マント用の球コライダー(関節ローカル)

      /* ========================================================
         4. 胴体
         ======================================================== */
      (function torso() {
        const hips = J.hips, spine = J.spine, chest = J.chest;
        add(hips, sphere(0.15, 32, 16), M.suit, [0, -0.03, 0], 0, [1.12, 0.78, 0.85]);
        add(spine, capsule(0.125, 0.16), M.suit, [0, 0.08, 0], 0, [1.1, 1, 0.8]);
        // 腹部の蛇腹(青いインナーフレーム + 鋼の板)
        add(spine, shell([[0.152, 0], [0.16, 0.03], [0.152, 0.058]]), M.paint, [0, 0.03, 0], 0, [1.08, 1, 0.8]);
        add(spine, shell([[0.16, 0], [0.168, 0.03], [0.162, 0.06]]), M.steel, [0, 0.085, 0], 0, [1.08, 1, 0.8]);
        add(spine, band(0.163, 0.085, 0.008), M.gold, 0, 0, [1.08, 1, 0.8]);

        // 胸甲
        const prof = [[0.15, -0.05], [0.19, 0.02], [0.226, 0.12], [0.226, 0.22], [0.19, 0.3], [0.12, 0.345]];
        const SZ = 0.74;
        add(chest, lathe(prof), M.steel, 0, 0, [1, 1, SZ]);
        [1, -1].forEach((m) => add(chest, lathe([[0.205, 0.04], [0.232, 0.13], [0.228, 0.215]], 24, m > 0 ? 0.6 : -1.3, 0.7), M.paint, 0, 0, [1.025, 1, SZ * 1.03]));
        const onChest = (phi, y, off) => {
          off = off || 0.005;
          const r = radiusAt(prof, y) + off;
          return [r * Math.sin(phi), y, r * Math.cos(phi) * SZ + off];
        };
        [1, -1].forEach((m) => {
          const a = [], b = [];
          for (let i = 0; i <= 10; i++) a.push(onChest(m * (0.04 + i * 0.08), 0.27 - i * 0.012));
          for (let i = 0; i <= 10; i++) b.push(onChest(m * (0.05 + i * 0.06), 0.01 + i * 0.006));
          add(chest, surfaceLine(a, 0.0065), M.gold);
          add(chest, surfaceLine(b, 0.006), M.gold);
        });
        const keel = [];
        for (let i = 0; i <= 10; i++) keel.push(onChest(0, i * 0.03));
        add(chest, surfaceLine(keel, 0.007), M.gold);
        const coreZ = radiusAt(prof, 0.14) * SZ;
        add(chest, new THREE.CylinderGeometry(0.03, 0.03, 0.02, 6), M.glow, [0, 0.14, coreZ + 0.006], [Math.PI / 2, 0, 0]);
        add(chest, torus(0.036, 0.008, Math.PI * 2, 8, 6), M.gold, [0, 0.14, coreZ + 0.006], [0, 0, Math.PI / 6]);
        // 喉当て
        add(chest, lathe([[0.15, 0.3], [0.135, 0.345], [0.105, 0.38], [0.088, 0.4]]), M.steel, 0, 0, [1, 1, 0.85]);
        add(chest, torus(0.09, 0.008), M.gold, [0, 0.398, 0], [Math.PI / 2, 0, 0], [1, 0.85, 1]);
        // マント基部(背中側の立ち襟)
        add(chest, shell([[0.15, 0.31], [0.16, 0.36], [0.17, 0.42]], 0.008, 32, Math.PI / 2 + 0.35, Math.PI - 0.7), M.paint, 0, 0, [1.05, 1, 0.9]);
        add(chest, band(0.171, 0.42, 0.012, Math.PI / 2 + 0.35, Math.PI - 0.7), M.gold, 0, 0, [1.05, 1, 0.9]);
        [1, -1].forEach((m) => add(chest, cylZ(0.016, 0.02), M.gold, [m * 0.14, 0.33, -0.1], [0, -m * 0.6, 0]));

        // ベルト
        add(hips, torus(0.152, 0.022, Math.PI * 2, 12, 64), M.leather, [0, 0.035, 0], [Math.PI / 2, 0, 0], [1.12, 0.86, 1]);
        add(hips, new THREE.BoxGeometry(0.08, 0.055, 0.02), M.gold, [0, 0.035, 0.145]);
        add(hips, sphere(0.019, 16, 8), M.glow, [0, 0.035, 0.157], 0, [1, 1, 0.5]);
        [1, -1].forEach((m) => {
          add(hips, rbox(0.05, 0.065, 0.04, 0.01), M.leather, [m * 0.15, 0.02, 0.07], [0, m * 0.6, 0]);
          add(hips, new THREE.BoxGeometry(0.052, 0.02, 0.042), M.leather, [m * 0.15, 0.055, 0.07], [0, m * 0.6, 0]);
        });

        // 前垂れ / 後ろ垂れ(太ももの動きに追従)
        const tab = [[-0.1, 0], [0.1, 0], [0.09, -0.34], [0, -0.4], [-0.09, -0.34]];
        const rim = polyShape(tab);
        rim.holes.push(polyShape([[-0.083, -0.012], [0.083, -0.012], [0.075, -0.33], [0, -0.38], [-0.075, -0.33]]));
        [['tabardF', 0.14, 1], ['tabardB', -0.13, -1]].forEach((d) => {
          const t = new THREE.Group();
          t.position.set(0, 0.015, d[1]);
          hips.add(t);
          add(t, extrude(polyShape(tab), 0.008, 0.002), M.tabard);
          add(t, extrude(rim, 0.012, 0.002), M.gold);
          // 紋章: 金縁の小盾 + クロスパテ + 小さな王冠
          const crest = new THREE.Group();
          crest.position.set(0, -0.19, d[2] * 0.006);
          if (d[2] < 0) crest.rotation.y = Math.PI;
          t.add(crest);
          add(crest, extrude(heater(0.115, 0.15), 0.004, 0.0015), M.gold);
          add(crest, extrude(heater(0.115, 0.15, 0.011), 0.004, 0.001), M.paint, [0, 0, 0.002]);
          const a = 0.0065, c = 0.017, h = 0.042;
          const pattee = polyShape([
            [-a, a], [-c, h], [c, h], [a, a], [h, c], [h, -c], [a, -a], [c, -h],
            [-c, -h], [-a, -a], [-h, -c], [-h, c],
          ]);
          add(crest, extrude(pattee, 0.004, 0.0015), M.emblem, [0, -0.004, 0.005]);
          add(crest, sphere(0.007, 12, 8), M.glow, [0, -0.004, 0.008], 0, [1, 1, 0.5]);
          const crown = polyShape([[-0.03, 0], [0.03, 0], [0.034, 0.03], [0.017, 0.016], [0, 0.036], [-0.017, 0.016], [-0.034, 0.03]]);
          add(crest, extrude(crown, 0.004, 0.0015), M.gold, [0, 0.07, 0.002]);
          ex[d[0]] = t;
        });

        colliders.push({ obj: chest, c: [0, 0.12, 0.02], r: 0.215 });
        colliders.push({ obj: spine, c: [0, 0.06, 0], r: 0.17 });
        colliders.push({ obj: hips, c: [0, -0.03, 0], r: 0.185 });
      })();

      /* ========================================================
         5. 頭部(バイザーはヒンジで開閉)
         ======================================================== */
      (function headUnit() {
        const head = J.head, visor = J.visor;
        const prof = [[0.105, 0.02], [0.14, 0.05], [0.158, 0.11], [0.162, 0.17], [0.156, 0.23], [0.13, 0.29], [0.08, 0.325], [0.0, 0.338]];
        const SZ = 1.08, sc = [1, 1, SZ];
        const pts = curvePts(prof, 12);
        const range = (a, b) => pts.filter((p) => p.y >= a && p.y <= b);

        add(J.neck, capsule(0.055, 0.05), M.suit, [0, 0.01, 0]);
        add(J.neck, torus(0.056, 0.008), M.joint, [0, -0.01, 0], [Math.PI / 2, 0, 0]);
        // 兜: 頭頂 / 側後頭部(前方に顔の開口) / 顎
        add(head, new THREE.LatheGeometry(range(0.225, 1), 48), M.steel, 0, 0, sc);
        add(head, new THREE.LatheGeometry(range(0.085, 0.235), 48, 1.0, Math.PI * 2 - 2.0), M.steel, 0, 0, sc);
        add(head, new THREE.LatheGeometry(range(0.0, 0.1), 48), M.steel, 0, 0, sc);
        add(head, band(radiusAt(prof, 0.03) + 0.002, 0.03, 0.014), M.gold, 0, 0, sc);
        [1, -1].forEach((m) => add(head, band(radiusAt(prof, 0.255) + 0.001, 0.255, 0.02, m > 0 ? 0.9 : Math.PI * 2 - 2.5, 1.6, 0.003), M.paint, 0, 0, sc));
        // 顔(バイザーを上げると見える)
        add(head, sphere(0.135, 32, 16), M.slit, [0, 0.16, 0]);
        [1, -1].forEach((m) => add(head, capsule(0.009, 0.03), M.glow, [m * 0.045, 0.19, 0.126], [0, 0, Math.PI / 2 + m * 0.15]));
        // 耳のヒンジ
        [1, -1].forEach((m) => {
          const x = m * 0.166;
          add(head, new THREE.CylinderGeometry(0.045, 0.048, 0.022, 32), M.steel, [x, 0.165, 0], [0, 0, Math.PI / 2]);
          add(head, torus(0.046, 0.006), M.gold, [x, 0.165, 0], [0, Math.PI / 2, 0]);
          add(head, torus(0.024, 0.006), M.glow, [x + m * 0.012, 0.165, 0], [0, Math.PI / 2, 0]);
          add(head, cylX(0.016, 0.02), M.joint, [x + m * 0.01, 0.165, 0]);
        });
        add(head, torus(0.165, 0.011, Math.PI / 2 + 0.45, 8, 48), M.gold, [0, 0.17, 0], [0, Math.PI / 2, 0]);
        add(head, new THREE.CylinderGeometry(0.02, 0.026, 0.06, 16), M.gold, [0, 0.33, -0.06], [-0.5, 0, 0]);
        ex.plumeBase = V3(0, 0.35, -0.075);

        const vy = -0.165;
        add(visor, new THREE.LatheGeometry(range(0.085, 0.24).map((p) => V2(p.x + 0.007, p.y + vy)), 40, -1.12, 2.24), M.steel, 0, 0, sc);
        add(visor, band(radiusAt(prof, 0.236) + 0.008, 0.236 + vy, 0.012, -1.12, 2.24), M.gold, 0, 0, sc);
        add(visor, band(radiusAt(prof, 0.09) + 0.008, 0.09 + vy, 0.012, -1.12, 2.24), M.gold, 0, 0, sc);
        add(visor, band(radiusAt(prof, 0.2) + 0.009, 0.2 + vy, 0.014, -0.8, 1.6, 0.001), M.slit, 0, 0, sc);
        [-0.48, -0.32, -0.16, 0.16, 0.32, 0.48].forEach((a) => {
          const r = radiusAt(prof, 0.14) + 0.009;
          add(visor, new THREE.BoxGeometry(0.014, 0.07, 0.006), M.slit, [r * Math.sin(a), 0.14 + vy, r * Math.cos(a) * SZ], [0, a, 0]);
        });
        const ridge = [];
        for (let i = 0; i <= 8; i++) { const y = 0.09 + i * 0.019; ridge.push([0, y + vy, (radiusAt(prof, y) + 0.011) * SZ]); }
        add(visor, surfaceLine(ridge, 0.008), M.gold);

        // 兜をシャープに: 丸い回転体を、小さく・細く・前へ尖る形に変形する(頭部空間で全パーツ一括)
        const sharpen = (p) => {
          p.y = 0.02 + (p.y - 0.02) * 0.92;
          if (p.y > 0.2) p.y = 0.2 + (p.y - 0.2) * 0.85; // 頭頂を低く(丸すぎないように)
          p.x *= 0.84; p.z *= 0.95;
          const front = clamp(1 - Math.abs(p.x) / 0.12, 0, 1);
          if (p.z > 0) {
            const band = Math.exp(-Math.pow((p.y - 0.15) / 0.09, 2));
            p.z += 0.05 * front * band; // 中央が前へ出る V 字のフェイスガード
            if (p.y < 0.1) p.z += (0.1 - p.y) * 0.35 * front; // 顎を前へ尖らせる
          }
          if (p.y < 0.1) p.x *= 1 - (0.1 - p.y) * 1.6; // 顎を細く
          if (p.y > 0.24) p.y += 0.022 * clamp(1 - Math.abs(p.x) / 0.1, 0, 1) * (p.y - 0.24) / 0.08; // 頭頂の稜線
          return p;
        };
        root.updateMatrixWorld(true);
        const toHead = new THREE.Matrix4().copy(head.matrixWorld).invert();
        const meshes = [];
        head.traverse((o) => { if (o.isMesh && markers.indexOf(o) < 0) meshes.push(o); });
        const mm = new THREE.Matrix4(), mi = new THREE.Matrix4(), v = V3(0, 0, 0);
        meshes.forEach((o) => {
          mm.multiplyMatrices(toHead, o.matrixWorld);
          mi.copy(mm).invert();
          const g = o.geometry = o.geometry.clone(); // カプセルなど共有形状を壊さないよう複製
          const pa = g.attributes.position;
          for (let i = 0; i < pa.count; i++) {
            v.fromBufferAttribute(pa, i).applyMatrix4(mm);
            sharpen(v).applyMatrix4(mi);
            pa.setXYZ(i, v.x, v.y, v.z);
          }
          g.computeVertexNormals();
          g.computeBoundingSphere();
        });
        sharpen(ex.plumeBase);
      })();

      /* ========================================================
         6. 手(3 節の指 + 親指)。手は -Y に垂れ、手のひらは体の側(-m·X)を向く
         ======================================================== */
      const HANDS = {
        grip: { c: [0.82, 0.82, 0.82, 0.82], th: 0.8, sp: 0 },   // 持ち手(武器の柄を握る)
        fist: { c: [1, 1, 1, 1], th: 1, sp: 0 },                  // 握り手
        open: { c: [0.05, 0.05, 0.05, 0.05], th: 0.05, sp: 0.8 }, // 開き手
        relax: { c: [0.35, 0.4, 0.45, 0.5], th: 0.3, sp: 0.3 },
      };
      const hands = {};
      function buildHand(s) {
        const m = s === 'L' ? 1 : -1;
        const wr = J['wrist_' + s];
        const h = { side: m, fingers: [], thumb: [] };
        add(wr, lathe([[0.05, 0.0], [0.057, -0.025], [0.064, -0.042]]), M.steel);
        add(wr, sphere(0.03), M.joint, [0, -0.012, 0]);
        add(wr, rbox(0.034, 0.08, 0.088, 0.012), M.suit, [0, -0.062, 0]);
        add(wr, rbox(0.075, 0.072, 0.012, 0.008), M.steel, [m * 0.022, -0.06, 0], [0, Math.PI / 2, 0]);
        add(wr, new THREE.BoxGeometry(0.004, 0.012, 0.07), M.gold, [m * 0.03, -0.028, 0]);
        add(wr, new THREE.BoxGeometry(0.004, 0.04, 0.008), M.glow, [m * 0.03, -0.063, 0]);
        add(wr, cylZ(0.012, 0.088), M.joint, [0, -0.1, 0]);
        const zs = [0.031, 0.0105, -0.0105, -0.031], ks = [0.95, 1.05, 1.0, 0.85];
        const digit = (parent, pos, segs, r) => {
          const nodes = [];
          let cur = new THREE.Group();
          cur.position.set(pos[0], pos[1], pos[2]);
          parent.add(cur);
          segs.forEach((len, i) => {
            if (i > 0) { const g = new THREE.Group(); g.position.y = -segs[i - 1]; cur.add(g); cur = g; }
            add(cur, sphere(r * 1.05, 12, 8), M.joint);
            const rr = r * (1 - i * 0.07);
            add(cur, capsule(rr, Math.max(0.001, len - rr * 1.6)), M.suit, [0, -len / 2, 0]);
            // 指の甲の装甲(外側 +m·X)
            add(cur, rbox(0.007, len * 0.78, rr * 1.9, 0.003), M.steel, [m * rr * 0.8, -len / 2, 0]);
            nodes.push(cur);
          });
          return nodes;
        };
        for (let i = 0; i < 4; i++) {
          const k = ks[i];
          h.fingers.push(digit(wr, [0, -0.104, zs[i]], [0.034 * k, 0.025 * k, 0.021 * k], 0.0098));
        }
        add(wr, sphere(0.022), M.suit, [-m * 0.012, -0.05, 0.034], 0, [1, 1.3, 1]);
        h.thumb = digit(wr, [-m * 0.014, -0.045, 0.045], [0.03, 0.024, 0.02], 0.0105);
        // 握る点: 指を曲げたときに柄が通る位置(柄の軸は手の Z)
        h.grip = new THREE.Object3D();
        h.grip.position.set(-m * 0.03, -0.112, 0);
        wr.add(h.grip);
        hands[s] = h;
      }
      // c: 4 本の曲げ(0=伸ばす 1=握る)、th: 親指、sp: 指の開き
      function poseHand(s, c, th, sp) {
        const h = hands[s], m = h.side;
        h.fingers.forEach((f, i) => {
          const k = c[i];
          f[0].rotation.set(-(1.5 - i) * 0.13 * sp, 0, -m * k * 1.45);
          f[1].rotation.z = -m * k * 1.75;
          f[2].rotation.z = -m * k * 1.15;
        });
        h.thumb[0].rotation.set(-0.55 + th * 0.35, 0, -m * (0.25 + th * 0.85 - sp * 0.3));
        h.thumb[1].rotation.set(th * 0.4, 0, -m * th * 0.7);
        h.thumb[2].rotation.z = -m * th * 0.6;
      }

      /* ========================================================
         7. 腕(肘は曲げのみ、ひねりは前腕関節で)
         ======================================================== */
      function buildArm(s) {
        const m = s === 'L' ? 1 : -1;
        const sh = J['shoulder_' + s], el = J['elbow_' + s], fa = J['forearm_' + s], chest = J.chest;
        add(sh, sphere(0.07), M.joint, [0, -0.01, 0]);
        add(sh, capsule(0.052, 0.2), M.suit, [0, -0.15, 0]);
        add(sh, shell([[0.064, -0.07], [0.071, -0.14], [0.066, -0.235]]), M.steel);
        add(sh, band(0.066, -0.075, 0.01), M.gold);
        add(sh, lathe([[0.075, -0.11], [0.077, -0.16], [0.073, -0.2]], 24, m > 0 ? Math.PI / 2 - 0.5 : -Math.PI / 2 - 0.5, 1.0), M.paint);

        // 肩アーマー(胸に付き、腕の回転に部分追従)
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
        // 十字の刻印(設定資料の肩アーマー)
        const crossG = new THREE.Group();
        crossG.rotation.set(0, 0, 0);
        cap.add(crossG);
        add(crossG, new THREE.BoxGeometry(0.012, 0.06, 0.006), M.glowSoft, [0, 0.07, 0.03], [-0.5, 0, 0]);
        add(crossG, new THREE.BoxGeometry(0.04, 0.012, 0.006), M.glowSoft, [0, 0.077, 0.027], [-0.5, 0, 0]);
        add(p, torus(0.03, 0.007), M.glow, [m * 0.135, -0.05, 0], [0, Math.PI / 2, 0]);
        add(p, cylX(0.03, 0.012), M.joint, [m * 0.13, -0.05, 0]);
        ex['pauldron_' + s] = p;

        // 肘(ヒンジ軸 + 肘当て)
        add(el, sphere(0.058), M.joint);
        add(el, cylX(0.04, 0.13), M.joint);
        add(el, new THREE.SphereGeometry(0.07, 24, 12, 0, Math.PI * 2, 0, 1.0), M.steel, [0, 0, -0.004], [-Math.PI / 2, 0, 0]);
        add(el, torus(0.07 * Math.sin(1.0), 0.006), M.gold, [0, 0, -0.004 - 0.07 * Math.cos(1.0)]);
        add(el, cylX(0.03, 0.012), M.steelDark, [m * 0.064, 0, 0]);
        add(el, torus(0.026, 0.006), M.glow, [m * 0.07, 0, 0], [0, Math.PI / 2, 0]);

        // 前腕(ひねり関節の子)
        add(fa, capsule(0.047, 0.17), M.suit, [0, -0.13, 0]);
        add(fa, shell([[0.058, -0.035], [0.065, -0.1], [0.059, -0.19], [0.053, -0.235]]), M.steel);
        add(fa, band(0.06, -0.04, 0.01), M.gold);
        add(fa, lathe([[0.067, -0.08], [0.065, -0.14], [0.061, -0.19]], 24, m > 0 ? Math.PI / 2 - 0.45 : -Math.PI / 2 - 0.45, 0.9), M.paint);
        add(fa, new THREE.BoxGeometry(0.004, 0.08, 0.012), M.glow, [m * 0.069, -0.135, 0]);
        buildHand(s);
      }
      buildArm('L');
      buildArm('R');

      /* ========================================================
         8. 脚(つま先関節つき)
         ======================================================== */
      function buildLeg(s) {
        const m = s === 'L' ? 1 : -1;
        const hp = J['hip_' + s], kn = J['knee_' + s], an = J['ankle_' + s], toe = J['toe_' + s], hips = J.hips;
        add(hp, sphere(0.08), M.joint);
        add(hp, capsule(0.072, 0.28), M.suit, [0, -0.21, 0]);
        add(hp, shell([[0.084, -0.06], [0.093, -0.17], [0.089, -0.28], [0.081, -0.345]], 0.006, 40, -0.8 * Math.PI, 1.6 * Math.PI), M.steel);
        add(hp, lathe([[0.099, -0.1], [0.096, -0.2], [0.093, -0.29]], 24, -0.32, 0.64), M.paint);
        add(hp, band(0.087, -0.065, 0.012, -0.8 * Math.PI, 1.6 * Math.PI), M.gold);
        // 太もも側面の丸い関節カバー
        add(hp, cylX(0.042, 0.016), M.steelDark, [m * 0.098, -0.2, 0]);
        add(hp, torus(0.034, 0.007), M.glow, [m * 0.106, -0.2, 0], [0, Math.PI / 2, 0]);
        add(hp, torus(0.044, 0.005), M.gold, [m * 0.1, -0.2, 0], [0, Math.PI / 2, 0]);

        // 草摺(腰に付き、太ももに追従)
        const t = new THREE.Group();
        t.position.set(0.11 * m, 0, 0);
        hips.add(t);
        const c = m > 0 ? Math.PI / 2 : -Math.PI / 2;
        add(t, shell([[0.1, 0.03], [0.112, -0.05], [0.118, -0.12]], 0.005, 24, c - 0.95, 1.9), M.steel);
        add(t, band(0.118, -0.12, 0.01, c - 0.95, 1.9), M.gold);
        add(t, shell([[0.116, -0.1], [0.124, -0.16], [0.128, -0.2]], 0.005, 24, c - 0.85, 1.7), M.paint);
        add(t, band(0.128, -0.2, 0.01, c - 0.85, 1.7), M.gold);
        ex['tasset_' + s] = t;

        // 膝(ヒンジ軸 + 膝当て)
        add(kn, sphere(0.066), M.joint);
        add(kn, cylX(0.048, 0.15), M.joint);
        add(kn, new THREE.SphereGeometry(0.084, 32, 12, 0, Math.PI * 2, 0, 1.0), M.steel, [0, 0, 0.012], [Math.PI / 2, 0, 0]);
        add(kn, torus(0.084 * Math.sin(1.0), 0.007), M.gold, [0, 0, 0.012 + 0.084 * Math.cos(1.0)]);
        add(kn, new THREE.SphereGeometry(0.045, 24, 8, 0, Math.PI * 2, 0, 0.9), M.paint, [0, 0, 0.058], [Math.PI / 2, 0, 0]);
        add(kn, cylX(0.036, 0.014), M.steelDark, [m * 0.075, 0, 0]);
        add(kn, torus(0.03, 0.007), M.glow, [m * 0.082, 0, 0], [0, Math.PI / 2, 0]);
        // すね
        add(kn, capsule(0.062, 0.28), M.suit, [0, -0.2, 0]);
        add(kn, shell([[0.072, -0.05], [0.083, -0.13], [0.079, -0.25], [0.067, -0.34], [0.074, -0.4]]), M.steel);
        add(kn, lathe([[0.088, -0.09], [0.085, -0.2], [0.075, -0.3]], 24, -0.35, 0.7), M.paint);
        add(kn, band(0.07, -0.345, 0.012), M.gold);
        add(kn, band(0.075, -0.055, 0.01), M.gold);
        add(kn, new THREE.BoxGeometry(0.004, 0.09, 0.012), M.glow, [m * 0.083, -0.2, 0]);

        // 足首(ヒンジ軸)・足(サバトン: かかと側 + つま先)
        add(an, sphere(0.05, 20, 12), M.joint);
        add(an, cylX(0.036, 0.12), M.joint);
        const sideways = (g) => { g.rotateY(-Math.PI / 2); return g; }; // 形状の X を前(Z)へ
        const rear = new THREE.Shape();
        rear.moveTo(-0.075, -0.07); rear.lineTo(0.1, -0.07); rear.lineTo(0.1, -0.005);
        rear.quadraticCurveTo(0.03, 0.025, -0.01, 0.05); rear.lineTo(-0.06, 0.045);
        rear.quadraticCurveTo(-0.095, 0.02, -0.075, -0.07);
        add(an, sideways(extrude(rear, 0.085, 0.012)), M.steel);
        add(an, new THREE.BoxGeometry(0.1, 0.014, 0.17), M.joint, [0, -0.069, 0.01]);
        add(an, torus(0.058, 0.006, Math.PI, 8, 24), M.gold, [0, -0.035, 0.05], 0, [1, 0.72, 1]);
        add(an, torus(0.024, 0.006), M.glow, [m * 0.058, -0.01, -0.01], [0, Math.PI / 2, 0]);
        // つま先(関節は足の甲の付け根。ローカル原点 = 足首から (0,-0.05,0.09))
        const tp = new THREE.Shape();
        tp.moveTo(-0.012, -0.02); tp.lineTo(0.06, -0.02);
        tp.quadraticCurveTo(0.115, -0.02, 0.105, 0.012);
        tp.quadraticCurveTo(0.085, 0.04, 0.0, 0.05); tp.lineTo(-0.012, 0.045);
        add(toe, sideways(extrude(tp, 0.08, 0.012)), M.steel);
        add(toe, new THREE.BoxGeometry(0.1, 0.014, 0.12), M.joint, [0, -0.019, 0.05]);
        add(toe, torus(0.05, 0.006, Math.PI, 8, 24), M.gold, [0, -0.005, 0.02], 0, [1, 0.72, 1]);
        add(toe, cylX(0.012, 0.1), M.joint);

        colliders.push({ obj: hp, c: [0, -0.1, 0], r: 0.115 });
        colliders.push({ obj: hp, c: [0, -0.3, 0], r: 0.105 });
        colliders.push({ obj: kn, c: [0, -0.12, 0], r: 0.095 });
        colliders.push({ obj: kn, c: [0, -0.32, 0], r: 0.085 });
      }
      buildLeg('L');
      buildLeg('R');

      /* ========================================================
         9. 武装：剣(右手の握り点)・盾(左手で裏面の取っ手を握る)
         ======================================================== */
      const sword = new THREE.Group(); // 柄の軸 = 手の Z。刃は +Z(人差し指側)へ
      sword.rotation.x = Math.PI / 2;
      hands.R.grip.add(sword);
      (function () {
        add(sword, new THREE.CylinderGeometry(0.017, 0.019, 0.17, 16), M.suit);
        [-0.07, 0, 0.07].forEach((y) => add(sword, torus(0.019, 0.004, Math.PI * 2, 6, 16), M.gold, [0, y, 0], [Math.PI / 2, 0, 0]));
        add(sword, sphere(0.028, 20, 12), M.gold, [0, -0.11, 0]);
        add(sword, new THREE.OctahedronGeometry(0.018), M.glow, [0, -0.135, 0]);
        const guard = polyShape([
          [0, 0.05], [0.03, 0.035], [0.065, 0.02], [0.12, 0.045], [0.145, 0.03], [0.11, -0.005], [0.04, -0.02], [0, -0.03],
          [-0.04, -0.02], [-0.11, -0.005], [-0.145, 0.03], [-0.12, 0.045], [-0.065, 0.02], [-0.03, 0.035],
        ]);
        add(sword, extrude(guard, 0.03, 0.006), M.gold, [0, 0.1, 0]);
        add(sword, new THREE.OctahedronGeometry(0.026), M.glow, [0, 0.105, 0], 0, [1, 1.3, 0.7]);
        add(sword, extrude(polyShape([[-0.034, 0], [-0.04, 0.6], [-0.03, 0.75], [0, 0.86], [0.03, 0.75], [0.04, 0.6], [0.034, 0]]), 0.006, 0.006), M.blade, [0, 0.12, 0]);
        add(sword, extrude(polyShape([[-0.007, 0.02], [-0.009, 0.6], [0, 0.78], [0.009, 0.6], [0.007, 0.02]]), 0.016, 0.002), M.bladeCore, [0, 0.12, 0]);
      })();
      const swordBase = V3(0, 0.16, 0), swordTip = V3(0, 0.98, 0);

      function heater(w, h, inset) {
        inset = inset || 0;
        const W = w / 2 - inset, top = h * 0.42 - inset, bot = -h * 0.58 + inset * 1.7;
        const s = new THREE.Shape();
        s.moveTo(-W, top); s.quadraticCurveTo(0, top + 0.035, W, top); s.lineTo(W, 0.0);
        s.quadraticCurveTo(W * 0.95, bot * 0.6, 0, bot); s.quadraticCurveTo(-W * 0.95, bot * 0.6, -W, 0.0);
        s.closePath();
        return s;
      }
      function bend(geo, k) {
        const p = geo.attributes.position;
        for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) - (k || 1.1) * p.getX(i) * p.getX(i));
        geo.computeVertexNormals();
        return geo;
      }
      // 盾: 取っ手(縦の棒)を拳で握る。盾の上(+Y)= 手の Z、盾の表(+Z)= 手の甲側(+X)
      const shield = new THREE.Group();
      shield.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V3(0, 1, 0), V3(0, 0, 1), V3(1, 0, 0)));
      hands.L.grip.add(shield);
      const shieldBody = new THREE.Group();
      shield.add(shieldBody);
      const HANDLE_Y = 0.03, BACK_Z = -0.02;
      let clearance = options.shieldClearance !== undefined ? options.shieldClearance : 0.055;
      const brackets = [];
      (function () {
        const W = 0.44, H = 0.6, B = shieldBody;
        add(B, bend(extrude(heater(W, H, 0.02), 0.024, 0.006)), M.paint);
        const rim = heater(W, H);
        rim.holes.push(new THREE.Path(heater(W, H, 0.035).getPoints(48)));
        add(B, bend(extrude(rim, 0.04, 0.006)), M.gold);
        add(B, bend(extrude(rim, 0.03, 0.004)), M.steel, [0, 0, 0.004], 0, [0.965, 0.965, 1]);
        add(B, bend(extrude(flaredBar(0.2, 0.02, 0.042), 0.01, 0.003)), M.glowSoft, [0, -0.03, 0.024]);
        const hb = extrude(flaredBar(0.13, 0.02, 0.042), 0.01, 0.003);
        hb.rotateZ(Math.PI / 2);
        add(B, bend(hb), M.glowSoft, [0, 0.06, 0.024]);
        // 裏面: 取っ手と接続ジョイント
        add(B, cylZ(0.035, 0.012), M.joint, [0, HANDLE_Y + 0.085, BACK_Z - 0.004]);
        add(B, cylZ(0.035, 0.012), M.joint, [0, HANDLE_Y - 0.085, BACK_Z - 0.004]);
        ex.handle = add(B, new THREE.CylinderGeometry(0.016, 0.016, 0.15, 16), M.leather, [0, HANDLE_Y, 0]);
        [1, -1].forEach((d) => {
          const b = add(B, new THREE.BoxGeometry(0.024, 0.018, 1), M.steelDark, [0, HANDLE_Y + d * 0.075, 0]);
          brackets.push(b);
          add(B, torus(0.018, 0.004, Math.PI * 2, 6, 16), M.gold, [0, HANDLE_Y + d * 0.06, 0], [Math.PI / 2, 0, 0]);
        });
      })();
      function setShieldClearance(v) {
        clearance = clamp(v, 0.03, 0.2);
        const handleZ = BACK_Z - 0.008 - clearance;
        shieldBody.position.set(0, -HANDLE_Y, -handleZ); // 取っ手が握り点に来る
        ex.handle.position.z = handleZ;
        brackets.forEach((b) => { b.scale.z = clearance + 0.01; b.position.z = (BACK_Z + handleZ) / 2; });
      }
      setShieldClearance(clearance);
      ex.sword = sword;
      ex.shield = shield;

      /* ========================================================
         10. 輪郭線(背面を法線方向に太らせて描く)
         ======================================================== */
      const outlineU = { value: options.outlineWidth !== undefined ? options.outlineWidth : 0.005 };
      const outlineMat = new THREE.MeshBasicMaterial({ color: C(0x06080c), side: THREE.BackSide });
      outlineMat.onBeforeCompile = (sh) => {
        sh.uniforms.uOutline = outlineU;
        sh.vertexShader = 'uniform float uOutline;\n' + sh.vertexShader.replace(
          '#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(normal) * uOutline;');
      };
      const outlines = [], outlineTargets = [];
      model.traverse((o) => {
        if (o.isMesh && markers.indexOf(o) < 0 && NO_OUTLINE.indexOf(o.material) < 0) outlineTargets.push(o);
      });
      outlineTargets.forEach((o) => {
        const ol = new THREE.Mesh(o.geometry, outlineMat);
        ol.castShadow = false; ol.receiveShadow = false;
        o.add(ol);
        outlines.push(ol);
      });
      function setOutline(on, width) {
        outlineMat.visible = !!on;
        if (width !== undefined) outlineU.value = width;
      }
      setOutline(options.outline !== false);

      /* ========================================================
         11. ポーズ（角度は度。脚は IK なので feet=[x,z,向き,持ち上げ,つま先傾き] で指定）
         ======================================================== */
      const STATIC = {
        idle: {
          root: [0, -0.015, 0],
          j: {
            spine: [2, 0, 0], chest: [3, 0, 0], neck: [-2, 0, 0], head: [-3, 0, 0],
            shoulder_L: [25, 0, 15], elbow_L: [-54, 0, 0], forearm_L: [0, 17, 0], wrist_L: [-68, 9, -36],
            shoulder_R: [-10, -46, 1], elbow_R: [-13, 0, 0], forearm_R: [0, 29, 0], wrist_R: [47, 0, -10],
          },
          feet: { L: [0.15, 0.03, 12], R: [-0.15, -0.03, -14] },
        },
        guard: {
          root: [0, -0.1, -0.02],
          j: {
            hips: [6, 28, 0], spine: [8, -12, 0], chest: [6, -12, 0], neck: [-3, -3, 0], head: [-5, -3, 0],
            shoulder_L: [-6, -30, 50], elbow_L: [-120, 0, 0], forearm_L: [0, 60, 0], wrist_L: [41, -22, -32],
            shoulder_R: [-6, 4, 6], elbow_R: [-100, 0, 0], forearm_R: [0, 6, 0], wrist_R: [17, 0, 0],
          },
          feet: { L: [0.14, 0.22, 20], R: [-0.17, -0.2, -45] },
        },
        block: {
          root: [0, -0.18, -0.04],
          j: {
            hips: [10, 10, 0], spine: [14, -8, 0], chest: [6, -8, 0], neck: [-4, 0, 0], head: [-6, 0, 0],
            shoulder_L: [-38, -30, 3], elbow_L: [-140, 0, 0], forearm_L: [0, 38, 0], wrist_L: [48, -14, -22],
            shoulder_R: [51, -18, 0], elbow_R: [-107, 0, 0], forearm_R: [0, -15, 0], wrist_R: [-12, -15, 0],
          },
          feet: { L: [0.17, 0.18, 15], R: [-0.18, -0.16, -30] },
        },
        visor: {
          root: [0, -0.015, 0],
          j: {
            neck: [-3, 0, 0], head: [-4, 0, 0], visor: [-95, 0, 0],
            shoulder_L: [33, 0, 15], elbow_L: [-73, 0, 0], forearm_L: [0, 25, 0], wrist_L: [-32, -12, -30],
            shoulder_R: [-107, 21, 15], elbow_R: [-83, 0, 0], forearm_R: [0, -44, 0], wrist_R: [53, -15, -10],
          },
          feet: { L: [0.15, 0.03, 12], R: [-0.15, -0.03, -14] },
        },
        charge: {
          root: [0, -0.16, 0.12],
          j: {
            hips: [18, 12, 0], spine: [16, -6, 0], chest: [8, -6, 0], neck: [-12, 0, 0], head: [-14, 0, 0],
            shoulder_L: [-5, -30, 35], elbow_L: [-141, 0, 0], forearm_L: [0, 30, 0], wrist_L: [55, -28, -29],
            shoulder_R: [-52, 22, 15], elbow_R: [-133, 0, 0], forearm_R: [0, -90, 0], wrist_R: [61, -30, 0],
          },
          feet: { L: [0.15, 0.42, 10], R: [-0.14, -0.36, -15, 0.03, 35] },
        },
        spinWind: {
          root: [0, -0.14, 0],
          j: {
            hips: [8, 38, 0], spine: [10, 22, 0], chest: [4, 20, 0], neck: [-4, -12, 0], head: [-6, -18, 0],
            shoulder_L: [-10, -90, 44], elbow_L: [-66, 0, 0], forearm_L: [0, 22, 0], wrist_L: [-28, 12, -40],
            shoulder_R: [-65, -90, -50], elbow_R: [-150, 0, 0], forearm_R: [0, 23, 0], wrist_R: [-20, 30, 30],
          },
          feet: { L: [0.16, 0.12, 20], R: [-0.17, -0.12, -30] },
        },
        spinStrike: {
          root: [0, -0.16, 0],
          j: {
            hips: [8, -30, 0], spine: [10, -25, 0], chest: [4, -18, 0], neck: [-4, 6, 0], head: [-6, 9, 0],
            shoulder_L: [60, -12, -7], elbow_L: [-53, 0, 0], forearm_L: [0, -11, 0], wrist_L: [-70, -30, 40],
            shoulder_R: [-43, 88, -40], elbow_R: [-37, 0, 0], forearm_R: [0, -71, 0], wrist_R: [70, -22, 10],
          },
          feet: { L: [0.16, 0.12, 20], R: [-0.17, -0.12, -30] },
        },
      };
      const JNAMES = JOINTS.map((j) => j.name);
      function newPose() {
        const P = { j: {}, root: [0, 0, 0], yaw: 0, feet: { L: [0.13, 0, 8, 0, 0], R: [-0.13, 0, -8, 0, 0] }, hand: {}, look: 0, trail: 0 };
        JNAMES.forEach((n) => (P.j[n] = [0, 0, 0]));
        ['L', 'R'].forEach((s) => (P.hand[s] = { c: HANDS.relax.c.slice(), th: HANDS.relax.th, sp: HANDS.relax.sp }));
        return P;
      }
      function clonePose(P) {
        const Q = newPose();
        copyPose(Q, P);
        return Q;
      }
      function copyPose(Q, P) {
        JNAMES.forEach((n) => { const a = P.j[n] || [0, 0, 0]; Q.j[n][0] = a[0]; Q.j[n][1] = a[1]; Q.j[n][2] = a[2]; });
        for (let i = 0; i < 3; i++) Q.root[i] = P.root[i];
        Q.yaw = P.yaw; Q.look = P.look; Q.trail = P.trail;
        ['L', 'R'].forEach((s) => {
          Q.feet[s] = P.feet[s].slice(); while (Q.feet[s].length < 5) Q.feet[s].push(0);
          Q.hand[s] = { c: P.hand[s].c.slice(), th: P.hand[s].th, sp: P.hand[s].sp };
        });
      }
      function fromStatic(P, name) {
        const S = STATIC[name];
        JNAMES.forEach((n) => { const a = S.j[n] || [0, 0, 0]; P.j[n][0] = a[0]; P.j[n][1] = a[1]; P.j[n][2] = a[2]; });
        for (let i = 0; i < 3; i++) P.root[i] = S.root[i];
        ['L', 'R'].forEach((s) => { P.feet[s] = S.feet[s].slice(); while (P.feet[s].length < 5) P.feet[s].push(0); });
        return P;
      }
      // 2 つのポーズの補間。足が移動するときは自動で持ち上げる(ステップ)
      function blendPose(out, A, B, k) {
        JNAMES.forEach((n) => { for (let i = 0; i < 3; i++) out.j[n][i] = lerp(A.j[n][i], B.j[n][i], k); });
        for (let i = 0; i < 3; i++) out.root[i] = lerp(A.root[i], B.root[i], k);
        out.yaw = lerp(A.yaw, B.yaw, k); out.look = lerp(A.look, B.look, k); out.trail = lerp(A.trail, B.trail, k);
        ['L', 'R'].forEach((s) => {
          const a = A.feet[s], b = B.feet[s], o = out.feet[s];
          for (let i = 0; i < 5; i++) o[i] = lerp(a[i], b[i], k);
          o[3] += Math.sin(Math.PI * k) * Math.min(0.12, Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.45);
          const ha = A.hand[s], hb = B.hand[s], ho = out.hand[s];
          for (let i = 0; i < 4; i++) ho.c[i] = lerp(ha.c[i], hb.c[i], k);
          ho.th = lerp(ha.th, hb.th, k); ho.sp = lerp(ha.sp, hb.sp, k);
        });
        return out;
      }
      const addJ = (P, n, x, y, z) => { P.j[n][0] += x; P.j[n][1] += y || 0; P.j[n][2] += z || 0; };
      function breathe(P, t, k) {
        const b = Math.sin(t * 1.7) * (k === undefined ? 1 : k);
        addJ(P, 'chest', 1.4 * b); addJ(P, 'shoulder_L', 0, 0, 1.2 * b); addJ(P, 'shoulder_R', 0, 0, -1.2 * b);
        P.root[1] += 0.004 * b;
        addJ(P, 'head', Math.sin(t * 0.9) * 1.2 * (k === undefined ? 1 : k));
      }
      const tmpA = newPose(), tmpB = newPose();
      // キーフレーム列 [[時刻, 静止ポーズ名], ...] を t で再生
      function seq(P, t, frames) {
        let i = 0;
        while (i < frames.length - 2 && t >= frames[i + 1][0]) i++;
        const a = frames[i], b = frames[i + 1];
        const k = ease(clamp((t - a[0]) / (b[0] - a[0]), 0, 1));
        blendPose(P, fromStatic(tmpA, a[1]), fromStatic(tmpB, b[1]), k);
      }

      const MODES = {
        idle: (P, t) => { fromStatic(P, 'idle'); breathe(P, t); P.look = 1; },
        guard: (P, t) => { fromStatic(P, 'guard'); breathe(P, t, 0.6); P.look = 0.6; },
        block: (P, t) => { fromStatic(P, 'block'); breathe(P, t, 0.4); P.look = 0.4; },
        visor: (P, t) => { fromStatic(P, 'visor'); breathe(P, t); P.look = 1; },
        // その場歩き: 足首目標を前後に動かし、脚 IK で接地を保つ
        walk: (P, t) => {
          fromStatic(P, 'idle');
          const w = t * 5.4, s = Math.sin(w), c = Math.cos(w);
          P.feet.L = [0.13, 0.17 * s, 6, Math.max(0, c) * 0.07, Math.max(0, -s) * 12 * Math.max(0, -c)];
          P.feet.R = [-0.13, -0.17 * s, -6, Math.max(0, -c) * 0.07, Math.max(0, s) * 12 * Math.max(0, c)];
          P.root[1] = -0.03 + 0.012 * Math.cos(2 * w);
          addJ(P, 'hips', 0, 6 * s, 2 * c); addJ(P, 'spine', 2, -4 * s); addJ(P, 'chest', 0, -3 * s);
          addJ(P, 'shoulder_R', -12 * s); addJ(P, 'shoulder_L', 6 * s);
          P.look = 0.4;
        },
        run: (P, t) => {
          fromStatic(P, 'idle');
          const w = t * 9, s = Math.sin(w), c = Math.cos(w);
          P.feet.L = [0.12, 0.3 * s + 0.04, 4, Math.max(0, c) * 0.2, Math.max(0, -s) * 25];
          P.feet.R = [-0.12, -0.3 * s + 0.04, -4, Math.max(0, -c) * 0.2, Math.max(0, s) * 25];
          P.root = [0, -0.07 + 0.035 * Math.abs(Math.cos(w)), 0.04];
          addJ(P, 'hips', 6, 10 * s); addJ(P, 'spine', 10, -7 * s); addJ(P, 'chest', 4, -5 * s);
          P.j.neck = [-6, 0, 0]; P.j.head = [-8, 0, 0];
          P.j.shoulder_R = [-15 - 35 * s, -20, -10]; P.j.elbow_R = [-70, 0, 0]; P.j.forearm_R = [0, 20, 0]; P.j.wrist_R = [40, 0, 0];
          P.j.shoulder_L = [-30 + 20 * s, 0, 18]; P.j.elbow_L = [-95, 0, 0];
          P.look = 0;
        },
        spin: (P, t) => {
          seq(P, t, [[0, 'guard'], [0.35, 'guard'], [0.7, 'spinWind'], [1.45, 'spinStrike'], [1.95, 'guard']]);
          P.yaw = t < 0.7 ? 0 : -360 * ease(clamp((t - 0.7) / 0.75, 0, 1));
          P.trail = t > 0.72 && t < 1.5 ? 1 : 0;
          P.look = 0;
        },
        charge: (P, t) => {
          seq(P, t, [[0, 'guard'], [0.3, 'guard'], [0.6, 'charge'], [0.95, 'charge'], [1.5, 'guard']]);
          P.trail = t > 0.3 && t < 0.7 ? 1 : 0;
          P.look = 0;
        },
        hold: (P) => copyPose(P, held), // 関節エディタで手動編集中
      };
      const ACTIONS = { spin: { dur: 1.95, next: 'guard' }, charge: { dur: 1.5, next: 'guard' } };

      /* ========================================================
         12. 状態・IK・適用
         ======================================================== */
      const state = { ik: options.ik !== false, physics: options.physics !== false, look: options.look !== false, pulse: options.glowPulse !== false };
      const equip = { sword: options.sword !== false, shield: options.shield !== false };
      const handOverride = { L: null, R: null };
      let currentMode = options.mode || 'idle', mt = 0;
      const cur = newPose(), from = newPose(), target = newPose(), held = newPose();
      let blendT = 1, blendDur = 0.5;
      let external = null;
      let lookYaw = 0, lookPitch = 0;
      MODES[currentMode](cur, 0);

      function setMode(m) {
        if (!MODES[m]) return;
        copyPose(from, cur);
        from.yaw = ((from.yaw % 360) + 540) % 360 - 180; // 回転斬りの後の -360 を 0 に戻す
        blendT = 0;
        blendDur = m === 'spin' || m === 'charge' ? 0.25 : 0.55;
        mt = 0;
        currentMode = m;
        external = null;
      }

      const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
      const _m = new THREE.Matrix4(), _e = new THREE.Euler(), XA = V3(1, 0, 0);
      // 2 ボーン解析 IK: 足首を目標位置に置き、膝を足先の方向へ曲げる。足裏は地面に合わせる
      function solveLeg(s, P) {
        const hip = J['hip_' + s], knee = J['knee_' + s], ankle = J['ankle_' + s], toe = J['toe_' + s], hips = J.hips;
        const L1 = knee.position.length(), L2 = ankle.position.length();
        const f = P.feet[s];
        const tgt = knight.localToWorld(_v.set(f[0], ANKLE_H + Math.max(0, f[3]), f[1]));
        hips.worldToLocal(tgt);
        const d = tgt.sub(hip.position);
        const dist = clamp(d.length(), 0.08, (L1 + L2) * 0.9995);
        const aim = d.normalize().clone();
        const yaw = f[2] * D2R;
        const pole = V3(Math.sin(yaw) * 0.9, 0, Math.cos(yaw)).normalize();
        pole.applyQuaternion(knight.getWorldQuaternion(_q));
        pole.applyQuaternion(hips.getWorldQuaternion(_q2).invert());
        const perp = pole.sub(aim.clone().multiplyScalar(pole.dot(aim))).normalize();
        const a = Math.acos(clamp((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1));
        const thigh = aim.clone().multiplyScalar(Math.cos(a)).add(perp.clone().multiplyScalar(Math.sin(a)));
        const yAx = thigh.clone().negate();
        const zAx = perp.clone().sub(thigh.clone().multiplyScalar(perp.dot(thigh))).normalize();
        const xAx = V3(0, 0, 0).crossVectors(yAx, zAx);
        hip.quaternion.setFromRotationMatrix(_m.makeBasis(xAx, yAx, zAx));
        knee.quaternion.setFromAxisAngle(XA, Math.PI - Math.acos(clamp((L1 * L1 + L2 * L2 - dist * dist) / (2 * L1 * L2), -1, 1)));
        const want = knight.getWorldQuaternion(_q).multiply(_q2.setFromEuler(_e.set(f[4] * D2R, yaw, 0, 'YXZ')));
        ankle.quaternion.copy(knee.getWorldQuaternion(_q3).invert().multiply(want));
        toe.rotation.set(clamp(-f[4], -45, 30) * D2R, 0, 0); // つま先立ちでも指先は地面に
        [hip, knee, ankle, toe].forEach((o) => {
          const n = o.name, a3 = P.j[n];
          a3[0] = o.rotation.x * R2D; a3[1] = o.rotation.y * R2D; a3[2] = o.rotation.z * R2D;
        });
      }

      function applyPose(P) {
        JOINTS.forEach((j) => {
          if (state.ik && isLeg(j.name)) return;
          const a = P.j[j.name], l = j.lim;
          let x = a[0], y = a[1], z = a[2];
          if (j.name === 'neck') { x += lookPitch * 0.35 * R2D; y += lookYaw * 0.35 * R2D; }
          if (j.name === 'head') { x += lookPitch * 0.65 * R2D; y += lookYaw * 0.65 * R2D; }
          j.obj.rotation.set(clamp(x, l.x[0], l.x[1]) * D2R, clamp(y, l.y[0], l.y[1]) * D2R, clamp(z, l.z[0], l.z[1]) * D2R);
        });
        J.hips.position.copy(JL.hips.rest).add(_v.set(P.root[0], P.root[1], P.root[2]));
        knight.rotation.y = P.yaw * D2R;
        root.updateMatrixWorld(true);
        if (state.ik) { solveLeg('L', P); solveLeg('R', P); }
        ['L', 'R'].forEach((s) => {
          const holding = s === 'R' ? equip.sword : equip.shield;
          const h = holding ? HANDS.grip : handOverride[s] ? HANDS[handOverride[s]] : P.hand[s];
          poseHand(s, h.c, h.th, h.sp);
        });
        syncLinked();
        root.updateMatrixWorld(true);
      }

      // 連動パーツ: 肩アーマーは腕に、草摺・前垂れ・後ろ垂れは太ももに部分追従
      function syncLinked() {
        ['L', 'R'].forEach((s) => {
          const sr = J['shoulder_' + s].rotation;
          ex['pauldron_' + s].rotation.set(sr.x * 0.3, sr.y * 0.25, sr.z * 0.5);
          const hr = J['hip_' + s].rotation;
          ex['tasset_' + s].rotation.set(hr.x * 0.6, 0, hr.z * 0.75);
        });
        const l = J.hip_L.rotation, r = J.hip_R.rotation;
        ex.tabardF.rotation.x = Math.min(0, l.x, r.x) * 0.9;
        ex.tabardB.rotation.x = Math.max(0, l.x, r.x) * 0.9;
      }

      /* ========================================================
         13. マント(Verlet 布)・羽飾り・剣の軌跡（fx 空間 = 単位 m）
         ======================================================== */
      const fxInv = new THREE.Matrix4(), relM = new THREE.Matrix4();
      function toFx(obj) { return relM.multiplyMatrices(fxInv, obj.matrixWorld); }

      const cape = (function () {
        const cols = 15, rows = 22, length = 1.12, n = cols * rows;
        const pos = new Float32Array(n * 3), prev = new Float32Array(n * 3);
        const pinsLocal = [];
        for (let c = 0; c < cols; c++) {
          const u = (c / (cols - 1)) * 2 - 1;
          pinsLocal.push(V3(u * 0.27, 0.3 - u * u * 0.03, -0.07 - 0.11 * (1 - u * u)));
        }
        let top = 0;
        for (let c = 1; c < cols; c++) top += pinsLocal[c].distanceTo(pinsLocal[c - 1]);
        const dx = top / (cols - 1), dy = length / (rows - 1);
        const Cn = [];
        const id = (r, c) => r * cols + c;
        for (let r = 0; r < rows; r++) {
          const flare = 1 + 0.55 * (r / (rows - 1));
          for (let c = 0; c < cols; c++) {
            if (c < cols - 1) Cn.push(id(r, c), id(r, c + 1), dx * flare);
            if (r < rows - 1) Cn.push(id(r, c), id(r + 1, c), dy);
            if (r < rows - 2) Cn.push(id(r, c), id(r + 2, c), dy * 2);
            if (r < rows - 1 && c < cols - 1) {
              const dd = Math.hypot(dx * flare, dy);
              Cn.push(id(r, c), id(r + 1, c + 1), dd, id(r, c + 1), id(r + 1, c), dd);
            }
          }
        }
        const CA = new Float32Array(Cn);
        const geo = new THREE.PlaneGeometry(1, 1, cols - 1, rows - 1);
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const mesh = new THREE.Mesh(geo, M.cloth);
        mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
        fx.add(mesh);
        const pins = pinsLocal.map(() => V3(0, 0, 0));
        const cols3 = colliders.map((c) => ({ obj: c.obj, c: V3(c.c[0], c.c[1], c.c[2]), r: c.r, w: V3(0, 0, 0) }));
        const chestInv = new THREE.Matrix4(), chestM = new THREE.Matrix4(), tv = V3(0, 0, 0);
        let time = 0;
        function updatePins() {
          chestM.copy(toFx(J.chest));
          pinsLocal.forEach((p, i) => pins[i].copy(p).applyMatrix4(chestM));
        }
        function collide() {
          chestInv.copy(chestM).invert();
          for (let i = cols; i < n; i++) {
            const k = i * 3;
            // 胸ローカルで「背中側・肩より下」に留める(高速回転で前に回り込まないように)
            tv.set(pos[k], pos[k + 1], pos[k + 2]).applyMatrix4(chestInv);
            const zMax = -0.02 + Math.max(0, Math.abs(tv.x) - 0.24) * 1.2;
            if (tv.z > zMax || tv.y > 0.31) {
              tv.z = Math.min(tv.z, zMax); tv.y = Math.min(tv.y, 0.31);
              tv.applyMatrix4(chestM);
              pos[k] = tv.x; pos[k + 1] = tv.y; pos[k + 2] = tv.z;
            }
            for (let j = 0; j < cols3.length; j++) {
              const c = cols3[j], r = c.r + 0.018;
              const ddx = pos[k] - c.w.x, ddy = pos[k + 1] - c.w.y, ddz = pos[k + 2] - c.w.z;
              const d2 = ddx * ddx + ddy * ddy + ddz * ddz;
              if (d2 < r * r) {
                const s = r / (Math.sqrt(d2) || 1e-6);
                pos[k] = c.w.x + ddx * s; pos[k + 1] = c.w.y + ddy * s; pos[k + 2] = c.w.z + ddz * s;
              }
            }
            const ground = -root.position.y / SCALE + 0.01;
            if (pos[k + 1] < ground) pos[k + 1] = ground;
          }
        }
        function step(dt) {
          time += dt;
          updatePins();
          cols3.forEach((c) => c.w.copy(c.c).applyMatrix4(toFx(c.obj)));
          const g = -9.8 * dt * dt, wind = (0.6 + Math.sin(time * 0.7) * 0.4) * dt * dt, damp = 0.985;
          for (let i = cols; i < n; i++) {
            const k = i * 3, x = pos[k], y = pos[k + 1], z = pos[k + 2];
            const gust = Math.sin(time * 2.3 + i * 0.37) * 0.6;
            pos[k] += (x - prev[k]) * damp + gust * wind * 0.4;
            pos[k + 1] += (y - prev[k + 1]) * damp + g;
            pos[k + 2] += (z - prev[k + 2]) * damp - wind * (1 + gust);
            prev[k] = x; prev[k + 1] = y; prev[k + 2] = z;
          }
          for (let it = 0; it < 12; it++) {
            for (let c = 0; c < cols; c++) { const k = c * 3; pos[k] = pins[c].x; pos[k + 1] = pins[c].y; pos[k + 2] = pins[c].z; }
            for (let j = 0; j < CA.length; j += 3) {
              const a = CA[j] * 3, b = CA[j + 1] * 3, rest = CA[j + 2];
              const ddx = pos[b] - pos[a], ddy = pos[b + 1] - pos[a + 1], ddz = pos[b + 2] - pos[a + 2];
              const d = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz) || 1e-6;
              const diff = d > rest ? (d - rest) / d : ((d - rest) / d) * 0.25; // 布は伸びにくく縮みやすい
              const pa = CA[j] < cols ? 0 : 0.5, pb = CA[j + 1] < cols ? 0 : 0.5;
              const s = pa + pb ? diff / (pa + pb) : 0;
              pos[a] += ddx * s * pa; pos[a + 1] += ddy * s * pa; pos[a + 2] += ddz * s * pa;
              pos[b] -= ddx * s * pb; pos[b + 1] -= ddy * s * pb; pos[b + 2] -= ddz * s * pb;
            }
            if (it % 3 === 2) collide();
          }
          collide();
        }
        function reset() {
          updatePins();
          for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
            const i = (r * cols + c) * 3, p = pins[c];
            pos[i] = p.x; pos[i + 1] = p.y - r * dy; pos[i + 2] = p.z - 0.05;
          }
          prev.set(pos);
          for (let i = 0; i < 90; i++) step(1 / 60);
          geo.attributes.position.needsUpdate = true;
          geo.computeVertexNormals();
        }
        function update(dt) {
          if (!state.physics) { updatePins(); return; }
          const h = Math.min(dt, 1 / 30) / 2;
          step(h); step(h);
          geo.attributes.position.needsUpdate = true;
          geo.computeVertexNormals();
        }
        return { mesh, reset, update };
      })();

      const plume = (function () {
        const SEG = 10, RAD = 6, SUB = 3, strands = [], group = new THREE.Group();
        fx.add(group);
        const base = ex.plumeBase;
        for (let s = 0; s < 11; s++) {
          const u = s / 10 - 0.5, len = 1 - Math.abs(u) * 0.5;
          const rest = new THREE.CubicBezierCurve3(
            V3(base.x + u * 0.03, base.y, base.z),
            V3(u * 0.08, base.y + 0.2 * len, base.z - 0.05),
            V3(u * 0.16, base.y + 0.1 * len, base.z - 0.36 * len),
            V3(u * 0.22, base.y - 0.24 * len, base.z - 0.5 * len),
          ).getPoints(SEG - 1);
          const nn = (SEG - 1) * SUB + 1;
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nn * RAD * 3), 3));
          const idx = [];
          for (let i = 0; i < nn - 1; i++) for (let j = 0; j < RAD; j++) {
            const a = i * RAD + j, b = i * RAD + ((j + 1) % RAD);
            idx.push(a, a + RAD, b, b, a + RAD, b + RAD);
          }
          geo.setIndex(idx);
          const mesh = new THREE.Mesh(geo, M.plume);
          mesh.castShadow = true; mesh.frustumCulled = false;
          group.add(mesh);
          strands.push({ rest, mesh, n: nn, width: 0.034 * (0.7 + len * 0.4), p: rest.map((v) => v.clone()), q: rest.map((v) => v.clone()), lens: rest.slice(1).map((v, i) => v.distanceTo(rest[i])) });
        }
        const w = V3(0, 0, 0), hm = new THREE.Matrix4();
        function draw() {
          const side = V3(1, 0, 0).transformDirection(hm);
          const t = V3(0, 0, 0), nrm = V3(0, 0, 0), bin = V3(0, 0, 0), c = V3(0, 0, 0);
          strands.forEach((st) => {
            const pts = new THREE.CatmullRomCurve3(st.p).getPoints(st.n - 1);
            const arr = st.mesh.geometry.attributes.position.array;
            for (let i = 0; i < st.n; i++) {
              const f = i / (st.n - 1);
              t.copy(pts[Math.min(i + 1, st.n - 1)]).sub(pts[Math.max(i - 1, 0)]).normalize();
              bin.copy(side).sub(t.clone().multiplyScalar(side.dot(t))).normalize();
              nrm.crossVectors(t, bin);
              const r = st.width * Math.sin(Math.min(1, f * 6 + 0.25) * Math.PI / 2) * (1 - f * 0.9);
              for (let j = 0; j < RAD; j++) {
                const a = (j / RAD) * Math.PI * 2;
                c.copy(pts[i]).addScaledVector(bin, Math.cos(a) * r * 1.6).addScaledVector(nrm, Math.sin(a) * r * 0.45);
                const o = (i * RAD + j) * 3;
                arr[o] = c.x; arr[o + 1] = c.y; arr[o + 2] = c.z;
              }
            }
            st.mesh.geometry.attributes.position.needsUpdate = true;
            st.mesh.geometry.computeVertexNormals();
          });
        }
        function update(dt, snap) {
          dt = Math.min(dt, 1 / 30);
          hm.copy(toFx(J.head));
          const g = -6 * dt * dt;
          strands.forEach((st) => {
            const p = st.p, q = st.q;
            for (let i = 0; i < SEG; i++) {
              w.copy(st.rest[i]).applyMatrix4(hm);
              if (i < 2 || snap || !state.physics) { p[i].copy(w); q[i].copy(w); continue; }
              const k = 0.22 * Math.pow(1 - i / SEG, 1.5) + 0.015;
              const v = p[i].clone().sub(q[i]).multiplyScalar(0.94);
              q[i].copy(p[i]);
              p[i].add(v).add(w.sub(p[i]).multiplyScalar(k));
              p[i].y += g;
            }
            for (let it = 0; it < 3; it++) for (let i = 2; i < SEG; i++) {
              const a = p[i - 1], b = p[i], d = b.clone().sub(a), l = d.length() || 1e-6;
              if (i > 2) { const c = d.multiplyScalar(((l - st.lens[i - 1]) / l) * 0.5); a.add(c); b.sub(c); }
              else b.copy(a).add(d.multiplyScalar(st.lens[i - 1] / l));
            }
          });
          draw();
        }
        return { group, update };
      })();

      const trail = (function () {
        const n = 32, LIFE = 0.22, samples = [], color = GLOW.clone();
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3));
        geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 6), 3));
        const idx = [];
        for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
        geo.setIndex(idx);
        const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
        mesh.frustumCulled = false;
        fx.add(mesh);
        // 直近 LIFE 秒ぶんだけ残す(フレームレートに依存しない)
        function update(strength, time) {
          const sm = toFx(sword);
          samples.push({ b: swordBase.clone().applyMatrix4(sm), t: swordTip.clone().applyMatrix4(sm), s: equip.sword ? strength : 0, time });
          while (samples.length > 2 && (samples.length > n * 4 || time - samples[0].time > LIFE)) samples.shift();
          const pos = geo.attributes.position.array, col = geo.attributes.color.array;
          for (let i = 0; i < n; i++) {
            const smp = samples[Math.round((i / (n - 1)) * (samples.length - 1))];
            const age = 1 - Math.min(1, (time - smp.time) / LIFE), k = smp.s * age * age, o = i * 6;
            pos[o] = smp.b.x; pos[o + 1] = smp.b.y; pos[o + 2] = smp.b.z; pos[o + 3] = smp.t.x; pos[o + 4] = smp.t.y; pos[o + 5] = smp.t.z;
            col[o] = color.r * k * 0.3; col[o + 1] = color.g * k * 0.3; col[o + 2] = color.b * k * 0.3;
            col[o + 3] = color.r * k * 2.2; col[o + 4] = color.g * k * 2.2; col[o + 5] = color.b * k * 2.2;
          }
          geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
          mesh.visible = samples.some((s) => s.s > 0.01 && time - s.time < LIFE);
        }
        return { mesh, update };
      })();

      /* ========================================================
         14. 更新ループ
         ======================================================== */
      let time = 0, started = false;
      const camLocal = V3(0, 0, 0);
      function update(dt, t, camera) {
        dt = Math.min(dt || 0, 1 / 20);
        time += dt;
        mt += dt;
        const act = ACTIONS[currentMode];
        if (act && mt >= act.dur) setMode(act.next);

        if (external) {
          copyPose(cur, external);
        } else {
          MODES[currentMode](target, mt);
          if (blendT < 1) {
            blendT = Math.min(1, blendT + dt / blendDur);
            blendPose(cur, from, target, smooth(blendT));
          } else copyPose(cur, target);
        }
        // カメラ目線(首 35% / 頭 65% に分配)
        let ty = 0, tp = 0;
        if (state.look && camera && cur.look > 0.001) {
          J.chest.updateWorldMatrix(true, false);
          camLocal.copy(camera.position);
          J.chest.worldToLocal(camLocal);
          camLocal.y -= 0.5;
          ty = clamp(Math.atan2(camLocal.x, camLocal.z), -1.1, 1.1) * cur.look;
          if (camLocal.z < 0) ty *= Math.max(0, 1 + camLocal.z / Math.hypot(camLocal.x, camLocal.z)); // 真後ろからは向かない
          tp = clamp(-Math.atan2(camLocal.y, Math.hypot(camLocal.x, camLocal.z)), -0.45, 0.35) * cur.look;
        }
        const lk = Math.min(1, dt * 4);
        lookYaw += (ty - lookYaw) * lk; lookPitch += (tp - lookPitch) * lk;

        applyPose(cur);
        fxInv.copy(fx.matrixWorld).invert();
        if (!started) { started = true; cape.reset(); plume.update(1 / 60, true); }
        cape.update(dt);
        plume.update(dt);
        trail.update(cur.trail, time);
        const pulse = state.pulse ? Math.sin(time * 2.2) : 0; // 発光の点滅(ゆっくり明滅)
        M.glow.emissiveIntensity = (7.5 + pulse * 1.5) * gk;
        M.glowSoft.emissiveIntensity = (3 + pulse * 0.6) * gk;
      }

      /* ========================================================
         15. 関節エディタ用(手動編集は 'hold' モードで保持)
         ======================================================== */
      function ensureHold() {
        if (currentMode !== 'hold') {
          copyPose(held, cur);
          held.yaw = 0; held.trail = 0; held.look = cur.look;
          currentMode = 'hold'; blendT = 1; external = null;
        }
      }
      function editJoint(name, axis, deg) {
        ensureHold();
        held.j[name]['xyz'.indexOf(axis)] = deg;
      }
      function editRoot(axis, m) { ensureHold(); held.root['xyz'.indexOf(axis)] = m; }
      function setHand(side, preset) {
        if (preset && !HANDS[preset]) return;
        handOverride[side] = preset || null;
        // 開いた手では武器を持てないので外す
        if (preset && preset !== 'grip') setEquip(side === 'R' ? { sword: false } : { shield: false });
      }
      function setEquip(o) {
        if (o.sword !== undefined) { equip.sword = !!o.sword; sword.visible = equip.sword; if (equip.sword) handOverride.R = null; }
        if (o.shield !== undefined) { equip.shield = !!o.shield; shield.visible = equip.shield; if (equip.shield) handOverride.L = null; }
      }
      setEquip(equip);
      setColor(options.color || 'normal');
      applyPose(cur);

      // 関節ごとのチャンネル一覧(UI 用)
      const CH = [];
      JOINTS.forEach((j) => ['x', 'y', 'z'].forEach((a) => {
        if (j.lim[a][0] !== j.lim[a][1]) CH.push({ k: j.name + '.' + a, joint: j.name, axis: a, l: j.label, mn: j.lim[a][0], mx: j.lim[a][1], u: 'deg', leg: isLeg(j.name) });
      }));

      /* ========================================================
         16. 公開インターフェース
         ======================================================== */
      return {
        root, model, knight, fx, joints: J, JOINTS, CH, markers, hands, sword, shield, cape: cape.mesh, plume: plume.group,
        materials: M, MODES, ACTIONS, COLORS, HANDS, poses: STATIC, colliders, scale: SCALE,
        setMode, getMode: () => currentMode,
        update,
        setColor, getColor: () => colorId,
        setHand, getHand: (s) => handOverride[s],
        setEquip, getEquip: () => Object.assign({}, equip),
        setShieldClearance, getShieldClearance: () => clearance,
        setOutline, getOutline: () => ({ on: outlineMat.visible, width: outlineU.value }),
        setIK: (on) => { state.ik = !!on; },
        setPhysics: (on) => { state.physics = !!on; },
        setLook: (on) => { state.look = !!on; },
        setGlowPulse: (on) => { state.pulse = !!on; },
        setGlowPulse: (on) => { state.pulse = !!on; },
        getState: () => Object.assign({}, state),
        editJoint, editRoot,
        getPose: () => clonePose(cur),
        newPose, clonePose,
        applyPose: (P) => applyPose(P),
        setExternalPose: (P) => { external = P || null; },
        syncLinked,
        resetPhysics: () => { cape.reset(); plume.update(1 / 60, true); },
        isLeg,
      };
    },
  };
})(typeof window !== 'undefined' ? window : this);
