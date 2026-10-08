/**
 * cyber-steed-model.js
 * サイバーナイトの愛馬「天馬(装甲ペガサス)」3D モデル＆モーション モジュール
 * 面甲(チャンフロン)・首甲・胸甲・鞍・紋章入りの馬衣・脚甲・翼・たてがみ・尾・手綱。
 * 動き: 待機 / 歩く / 駆ける / いななき / 飛翔。表情: 通常 / 喜び / 驚き / 怒り。
 * 乗り手の座る位置・手綱・鐙の目印つき(サイバーホース / LUNA と同じ約束ごと)。Three.js r128 〜 r170。
 */
(function (global) {
  'use strict';

  global.CyberSteedModel = {
    /* モデルの約束ごと（MODEL_SPEC.md）：info と create を持つ */
    info: {
      id: 'cyber-steed', kind: 'model', version: '2026.10.09', name: '天馬（装甲ペガサス）',
      desc: 'サイバーナイトの愛馬。白い装甲ペガサス。面甲・首甲・胸甲・鞍・紋章入りの馬衣・翼・たてがみと尾の物理。乗り手の座る位置・手綱・鐙の目印つき',
      create: 'create(THREE, parent, options) → { root, chassis, seatMarker, gripTarget, pegMark, setMode, update, setWings, setExpr, setColor, ... }',
      modes: ['idle', 'walk', 'gallop', 'rear', 'fly'],
      expressions: ['normal', 'joy', 'surprise', 'angry'],
      colors: ['normal', 'red', 'black', 'bloodred', 'gold'],
    },

    create: function (THREE, parentNode, options) {
      options = options || {};
      const S = options.scale !== undefined ? options.scale : 2.4; // サイバーナイトと同じ世界の縮尺
      const V2 = (x, y) => new THREE.Vector2(x, y);
      const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
      const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
      const lerp = (a, b, k) => a + (b - a) * k;
      const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

      /* ---------- マテリアル ---------- */
      const CM = !!(THREE.ColorManagement && THREE.ColorManagement.enabled && THREE.SRGBColorSpace);
      const C = (hex) => { const c = new THREE.Color(hex); return CM ? c : c.convertSRGBToLinear(); };
      function srgbTex(t) {
        if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace; else t.encoding = THREE.sRGBEncoding;
        t.anisotropy = 4;
        return t;
      }
      const gk = options.glowIntensity !== undefined ? options.glowIntensity : 1;
      const metal = (hex, r, extra) => new THREE.MeshPhysicalMaterial(Object.assign({ color: C(hex), metalness: 1, roughness: r, side: THREE.DoubleSide }, extra || {}));
      const M = {
        coat: new THREE.MeshStandardMaterial({ color: C(0xe9ecf1), roughness: 0.55, metalness: 0.05 }),
        muzzle: new THREE.MeshStandardMaterial({ color: C(0x9aa0aa), roughness: 0.5 }),
        hoof: new THREE.MeshStandardMaterial({ color: C(0x2a2c31), roughness: 0.45, metalness: 0.2 }),
        eye: new THREE.MeshStandardMaterial({ color: C(0x0c0d10), roughness: 0.15, metalness: 0.3 }),
        steel: metal(0xc4cad4, 0.3, { clearcoat: 0.5, clearcoatRoughness: 0.15 }),
        gold: metal(0xd9ad55, 0.26),
        leather: new THREE.MeshStandardMaterial({ color: C(0x5b3a22), roughness: 0.7 }),
        strap: new THREE.MeshStandardMaterial({ color: C(0x2e2018), roughness: 0.75 }),
        cloth: new THREE.MeshStandardMaterial({ roughness: 0.85, side: THREE.DoubleSide }),
        mane: new THREE.MeshStandardMaterial({ color: C(0x2b4cc8), roughness: 0.55, side: THREE.DoubleSide }),
        tail: new THREE.MeshStandardMaterial({ color: C(0xf2f4f8), roughness: 0.6, side: THREE.DoubleSide }),
        feather: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }),
        glow: new THREE.MeshStandardMaterial({ color: C(0x0b3a7a), emissive: C(0x2fa4ff), emissiveIntensity: 6 * gk }),
      };
      const NO_OUTLINE = [M.glow, M.eye];
      const COLORS = {
        normal: { steel: 0xc4cad4, trim: 0xd9ad55, cloth: '#1d3c9a', clothDark: '#0e1f55', mane: 0x2b4cc8, wing: 0x2f5fd0, glow: 0x2fa4ff },
        red: { steel: 0xc4cad4, trim: 0xd9ad55, cloth: '#8c1822', clothDark: '#45090f', mane: 0xc8202c, wing: 0xb82a36, glow: 0xff6a3a },
        black: { steel: 0x2b2e35, trim: 0xb08a45, cloth: '#3a0a10', clothDark: '#140306', mane: 0xb81c26, wing: 0x8a1820, glow: 0xff2a3a },
        bloodred: { steel: 0x8c1822, trim: 0xc9a050, cloth: '#3a1050', clothDark: '#16061f', mane: 0x6b3fb0, wing: 0x6b3fb0, glow: 0xb05cff },
        gold: { steel: 0xd4ae5a, trim: 0xf2d590, cloth: '#1d3c9a', clothDark: '#0e1f55', mane: 0xe0a53a, wing: 0xd8a040, glow: 0xffc04a },
      };
      // 馬衣のテクスチャ(青地 + 金縁 + 金の十字)
      function clothTexture(v, trimHex) {
        const c = document.createElement('canvas'); c.width = 512; c.height = 512;
        const g = c.getContext('2d');
        const grad = g.createLinearGradient(0, 0, 0, 512);
        grad.addColorStop(0, v.clothDark); grad.addColorStop(0.3, v.cloth); grad.addColorStop(1, v.cloth);
        g.fillStyle = grad; g.fillRect(0, 0, 512, 512);
        for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.03})`; g.fillRect(Math.random() * 512, Math.random() * 512, 2, 1); }
        const trim = '#' + new THREE.Color(trimHex).getHexString();
        g.fillStyle = trim;
        g.fillRect(0, 470, 512, 30); g.fillRect(0, 0, 12, 512); g.fillRect(500, 0, 12, 512);
        g.fillStyle = '#0a0d14'; g.fillRect(0, 500, 512, 12);
        for (let x = 16; x < 512; x += 48) { g.fillStyle = trim; g.beginPath(); g.moveTo(x, 470); g.lineTo(x + 24, 470); g.lineTo(x + 12, 455); g.fill(); }
        // 金の十字(先端が三つ葉のボトニー十字)
        g.save(); g.translate(256, 250); g.fillStyle = trim; g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 6;
        const arm = (len) => {
          g.fillRect(-9, -len, 18, len);
          [[-14, -len], [14, -len], [0, -len - 14]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 10, 0, 7); g.fill(); });
        };
        for (let i = 0; i < 4; i++) { g.save(); g.rotate((i * Math.PI) / 2); arm(i === 2 ? 110 : 70); g.restore(); }
        g.restore();
        return srgbTex(new THREE.CanvasTexture(c));
      }
      let colorId = 'normal';
      const wingTint = C(0x2f5fd0), GLOW = C(0x2fa4ff);

      /* ---------- 形状ヘルパー ---------- */
      const sphereGeo = new THREE.SphereGeometry(1, 32, 20);
      function add(parent, geo, mat, p, r, s) {
        const o = new THREE.Mesh(geo, mat);
        if (p) o.position.set(p[0], p[1], p[2]);
        if (r) o.rotation.set(r[0], r[1], r[2]);
        if (s !== undefined) { if (typeof s === 'number') o.scale.setScalar(s); else o.scale.set(s[0], s[1], s[2]); }
        o.castShadow = true; o.receiveShadow = true;
        parent.add(o);
        return o;
      }
      const ell = (parent, mat, p, r, rot) => add(parent, sphereGeo, mat, p, rot, r);
      const curvePts = (pts, div) => new THREE.SplineCurve(pts.map((q) => V2(q[0], q[1]))).getPoints(pts.length * (div || 8));
      const lathe = (pts, seg, ps, pl) => new THREE.LatheGeometry(curvePts(pts), seg || 40, ps || 0, pl === undefined ? Math.PI * 2 : pl);
      function shell(pts, t, seg, ps, pl) {
        const outer = curvePts(pts);
        const inner = outer.slice().reverse().map((p) => V2(p.x - (t || 0.006), p.y));
        return new THREE.LatheGeometry(outer.concat(inner, [outer[0].clone()]), seg || 40, ps || 0, pl === undefined ? Math.PI * 2 : pl);
      }
      const band = (r, y, h, ps, pl) => new THREE.LatheGeometry([V2(r, y - h / 2), V2(r + 0.004, y), V2(r, y + h / 2)], 40, ps || 0, pl === undefined ? Math.PI * 2 : pl);
      const torus = (r, tube, arc) => new THREE.TorusGeometry(r, tube, 8, 40, arc === undefined ? Math.PI * 2 : arc);
      const cylX = (r, len) => { const g = new THREE.CylinderGeometry(r, r, len, 20); g.rotateZ(Math.PI / 2); return g; };
      function grp(parent, p, r) { const g = new THREE.Group(); if (p) g.position.set(p[0], p[1], p[2]); if (r) g.rotation.set(r[0], r[1], r[2]); parent.add(g); return g; }
      function polyShape(pts) { const s = new THREE.Shape(); pts.forEach((q, i) => (i ? s.lineTo(q[0], q[1]) : s.moveTo(q[0], q[1]))); s.closePath(); return s; }
      function extrude(shape, depth, bevel) {
        const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel || 0.003, bevelSize: bevel || 0.003, bevelSegments: 2, curveSegments: 12 });
        g.translate(0, 0, -depth / 2);
        return g;
      }

      // 断面(超楕円)を z 方向に並べてなめらかにつないだ形。secs: [z, 半幅, 上端, 下端, 上の角張り, 下の角張り]
      function crs(p0, p1, p2, p3, t) {
        const t2 = t * t, t3 = t2 * t;
        return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
      }
      function loftGeo(secs, steps) {
        const A = 48, St = steps || 8, rows = [];
        for (let i = 0; i < secs.length - 1; i++) {
          const p0 = secs[Math.max(0, i - 1)], p1 = secs[i], p2 = secs[i + 1], p3 = secs[Math.min(secs.length - 1, i + 2)];
          for (let k = 0; k < St; k++) { const r = []; for (let c = 0; c < 6; c++) r.push(crs(p0[c], p1[c], p2[c], p3[c], k / St)); rows.push(r); }
        }
        rows.push(secs[secs.length - 1].slice());
        const pos = [], idx = [], R = rows.length;
        const fwd = secs[secs.length - 1][0] > secs[0][0]; // 並びの向きで面の表裏が変わるのを補正
        const tri = (a, b, c) => (fwd ? idx.push(a, c, b) : idx.push(a, b, c));
        rows.forEach((r) => {
          const w = Math.max(0.001, r[1]), yc = (r[2] + r[3]) / 2, h = Math.max(0.001, (r[2] - r[3]) / 2);
          for (let j = 0; j < A; j++) {
            const th = (j / A) * Math.PI * 2, cs = Math.cos(th), sn = Math.sin(th), n = sn >= 0 ? r[4] : r[5];
            pos.push(w * Math.sign(cs) * Math.pow(Math.abs(cs), 2 / n), yc + h * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / n), r[0]);
          }
        });
        for (let i = 0; i < R - 1; i++) for (let j = 0; j < A; j++) {
          const a = i * A + j, b = i * A + ((j + 1) % A), c = (i + 1) * A + j, d = (i + 1) * A + ((j + 1) % A);
          tri(a, c, b); tri(b, c, d);
        }
        [0, R - 1].forEach((ri, e) => {
          const r = rows[ri], ci = pos.length / 3;
          pos.push(0, (r[2] + r[3]) / 2, r[0]);
          for (let j = 0; j < A; j++) { const u = ri * A + j, v = ri * A + ((j + 1) % A); if (e === 0) tri(ci, u, v); else tri(ci, v, u); }
        });
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setIndex(idx);
        g.computeVertexNormals();
        return g;
      }

      /* ---------- ルート ---------- */
      const root = new THREE.Group();
      root.name = 'CyberSteed';
      if (parentNode) parentNode.add(root);
      const chassis = new THREE.Group(); // 体の上下・前後傾き(乗り手はここに乗る。縮尺なし)
      root.add(chassis);
      const body = new THREE.Group(); // 単位 m、縮尺 S
      body.scale.setScalar(S);
      chassis.add(body);
      const fx = new THREE.Group(); // たてがみ・尾の物理空間(単位 m)
      fx.scale.setScalar(S);
      root.add(fx);

      /* ========================================================
         胴体
         ======================================================== */
      add(body, loftGeo([
        [0.95, 0.05, 1.42, 1.2, 2.2, 2.2],
        [0.88, 0.2, 1.52, 1.0, 2.4, 2.2],
        [0.7, 0.29, 1.6, 0.9, 2.4, 2.4],
        [0.45, 0.31, 1.63, 0.86, 2.4, 2.6],
        [0.15, 0.32, 1.57, 0.85, 2.4, 2.6],
        [-0.2, 0.32, 1.56, 0.88, 2.4, 2.5],
        [-0.5, 0.33, 1.61, 0.96, 2.5, 2.3],
        [-0.76, 0.3, 1.62, 1.04, 2.3, 2.1],
        [-0.92, 0.2, 1.55, 1.14, 2.1, 2.0],
        [-1.0, 0.05, 1.47, 1.3, 2.0, 2.0],
      ], 10), M.coat);

      // 胸甲(ペイトラル)
      const pey = grp(body, [0, 1.22, 0.5]);
      add(pey, shell([[0.33, -0.22], [0.37, -0.05], [0.36, 0.12], [0.31, 0.24]], 0.008, 32, -1.05, 2.1), M.steel, 0, 0, [1, 1, 1.05]);
      add(pey, band(0.335, -0.22, 0.02, -1.05, 2.1), M.gold, 0, 0, [1, 1, 1.05]);
      add(pey, band(0.312, 0.24, 0.02, -1.05, 2.1), M.gold, 0, 0, [1, 1, 1.05]);
      const crossS = (L) => polyShape([[-0.018, -L], [0.018, -L], [0.018, -0.018], [L * 0.7, -0.018], [L * 0.7, 0.018], [0.018, 0.018], [0.018, L * 0.6], [-0.018, L * 0.6], [-0.018, 0.018], [-L * 0.7, 0.018], [-L * 0.7, -0.018], [-0.018, -0.018]]);
      add(pey, extrude(crossS(0.08), 0.01), M.gold, [0, 0.02, 0.38], [-0.1, 0, 0]);
      ell(pey, M.glow, [0, 0.02, 0.39], [0.02, 0.02, 0.012]);

      // 鞍(サドル)と鞍下の布、腹帯
      const saddle = grp(body, [0, 1.6, -0.02]);
      // 鞍: 前橋と後橋が高く、座面が低い形
      const SAD = [
        [0.3, 0.06, 0.17, 0.02, 2.0, 2.0], [0.24, 0.15, 0.15, -0.02, 2.4, 2.0], [0.1, 0.22, 0.07, -0.03, 2.6, 2.0],
        [-0.1, 0.23, 0.06, -0.03, 2.6, 2.0], [-0.24, 0.21, 0.13, -0.02, 2.4, 2.0], [-0.31, 0.12, 0.19, 0.0, 2.0, 2.0],
      ];
      add(saddle, loftGeo(SAD, 8), M.leather);
      add(saddle, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(SAD.map((r) => V3(0, r[2] + 0.004, r[0]))), 30, 0.008, 6, false), M.gold);
      [-1, 1].forEach((m) => add(saddle, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(SAD.map((r) => V3(m * r[1] * 0.92, (r[2] + r[3]) / 2 + 0.02, r[0]))), 30, 0.007, 6, false), M.gold));
      [-1, 1].forEach((m) => add(saddle, shell([[0.31, -0.32], [0.33, -0.12], [0.3, 0.02]], 0.006, 32, m * Math.PI / 2 - 1.0, 2.0), M.cloth, 0, 0, [1, 1, 1.3])); // 鞍下の布
      add(body, torus(0.34, 0.018), M.strap, [0, 1.2, 0.18], [0, Math.PI / 2, 0], [1, 1.05, 1]);
      // 鐙と鐙革(ステップの目印)
      const pegMark = { L: new THREE.Object3D(), R: new THREE.Object3D() };
      [-1, 1].forEach((m) => {
        const s = m > 0 ? 'L' : 'R';
        const top = V3(m * 0.3, 1.55, 0.04), bot = V3(m * 0.42, 1.05, 0.06);
        const d = V3(0, 0, 0).subVectors(bot, top);
        const strap = add(body, new THREE.BoxGeometry(0.035, d.length(), 0.008), M.strap);
        strap.position.copy(top).addScaledVector(d, 0.5);
        strap.quaternion.setFromUnitVectors(V3(0, 1, 0), d.normalize());
        const st = grp(body, [m * 0.43, 1.0, 0.06]);
        add(st, torus(0.055, 0.009, Math.PI), M.gold, [0, 0, 0], [0, Math.PI / 2, 0]);
        add(st, new THREE.BoxGeometry(0.03, 0.012, 0.12), M.steel, [0, 0.0, 0]);
        pegMark[s].position.set(m * 0.43, 1.012, 0.06);
        body.add(pegMark[s]);
      });
      const seatMarker = new THREE.Object3D();
      seatMarker.position.set(0, 1.71, -0.04);
      body.add(seatMarker);

      // 馬衣(カパリソン): 脇は胴に、前後は脚に部分追従
      const clothMat = M.cloth;
      function drape(parent, p, rIn, rOut, y0, y1, ps, pl) {
        return add(parent, lathe([[rIn, y0], [(rIn + rOut) / 2 + 0.01, (y0 + y1) / 2], [rOut, y1]], 24, ps, pl), clothMat, p);
      }
      [-1, 1].forEach((m) => {
        const c = m > 0 ? Math.PI / 2 : -Math.PI / 2;
        drape(body, [0, 0, 0.0], 0.33, 0.37, 1.48, 0.82, c - 0.62, 1.24);
      });

      /* ========================================================
         首・頭
         ======================================================== */
      const neck = grp(body, [0, 1.48, 0.72]);
      const NECK_REST = 0.72;
      const neckGeo = loftGeo([
        [-0.12, 0.18, 0.22, -0.28, 2.4, 2.4],
        [0.08, 0.155, 0.21, -0.22, 2.4, 2.4],
        [0.3, 0.125, 0.19, -0.16, 2.4, 2.3],
        [0.5, 0.105, 0.17, -0.12, 2.3, 2.2],
        [0.66, 0.095, 0.15, -0.1, 2.2, 2.2],
        [0.76, 0.06, 0.1, -0.05, 2.0, 2.0],
      ], 8);
      neckGeo.rotateX(-Math.PI / 2); // 断面の並びを首の軸(+Y)へ。上端 = たてがみ側(-Z)
      add(neck, neckGeo, M.coat);
      // 首甲(クリネット): たてがみ側(-Z)の重ね板
      for (let i = 0; i < 5; i++) {
        const y = 0.06 + i * 0.12, r = 0.2 - i * 0.017;
        add(neck, shell([[r + 0.012, y - 0.055], [r + 0.02, y], [r + 0.012, y + 0.07]], 0.006, 24, Math.PI - 1.15, 2.3), M.steel, 0, 0, [0.82, 1, 1.12]);
        add(neck, band(r + 0.012, y - 0.055, 0.012, Math.PI - 1.15, 2.3), M.gold, 0, 0, [0.82, 1, 1.12]);
      }
      const head = grp(neck, [0, 0.66, 0]);
      // 頭部は頭ジョイントの姿勢がほぼ水平になるよう組む(首の傾きは姿勢側で打ち消す)
      // 頭蓋〜鼻先は鼻筋の向き(前下がり)の空間 skull で作る
      const skull = grp(head, [0, 0.04, 0], [0.62, 0, 0]);
      const HEAD = [
        [-0.15, 0.04, 0.06, 0.0, 2.0, 2.0],
        [-0.1, 0.105, 0.105, -0.11, 2.2, 2.4],
        [0.0, 0.118, 0.1, -0.15, 2.4, 2.6],
        [0.12, 0.095, 0.075, -0.115, 2.4, 2.5],
        [0.26, 0.078, 0.062, -0.085, 2.3, 2.4],
        [0.37, 0.082, 0.058, -0.082, 2.2, 2.3],
        [0.44, 0.07, 0.045, -0.065, 2.0, 2.1],
        [0.48, 0.03, 0.02, -0.03, 2.0, 2.0],
      ];
      add(skull, loftGeo(HEAD, 8), M.coat);
      add(skull, loftGeo(HEAD.slice(4).map((r) => [r[0], r[1] * 1.03, r[2] + 0.002, r[3] - 0.002, r[4], r[5]]).concat([[0.485, 0.02, 0.015, -0.02, 2, 2]]), 6), M.muzzle, [0, 0, 0.004]);
      [-1, 1].forEach((m) => {
        ell(skull, M.eye, [m * 0.108, 0.02, -0.01], [0.022, 0.028, 0.032]);
        ell(skull, M.hoof, [m * 0.038, -0.02, 0.475], [0.012, 0.018, 0.01]); // 鼻孔
      });
      // 耳(表情で動く)
      const ears = {};
      [-1, 1].forEach((m) => {
        const e = grp(head, [m * 0.055, 0.17, -0.03], [0, 0, -m * 0.25]);
        const g = new THREE.ConeGeometry(0.035, 0.13, 12); g.translate(0, 0.065, 0);
        add(e, g, M.coat, 0, 0, [1, 1, 0.6]);
        ears[m > 0 ? 'L' : 'R'] = e;
      });
      // 面甲(チャンフロン): 顔の上面を覆う鋼板 + 金の稜線と十字
      // 面甲(チャンフロン): 鼻筋の上半分を覆う鋼板(目の上で終わる) + 金の稜線と十字
      const CH = HEAD.slice(1, 7).map((r, i) => [r[0], r[1] * 1.07 + 0.004, r[2] + 0.012, (r[2] + r[3]) / 2 + 0.035 - (i > 2 ? 0.012 : 0), 2.4, 6]);
      add(skull, loftGeo(CH, 6), M.steel);
      const ridge = new THREE.CatmullRomCurve3(CH.map((r) => V3(0, r[2] + 0.004, r[0])));
      add(skull, new THREE.TubeGeometry(ridge, 30, 0.009, 6, false), M.gold);
      [-1, 1].forEach((m) => {
        const edge = new THREE.CatmullRomCurve3(CH.map((r) => V3(m * r[1] * 0.98, r[3] + 0.004, r[0])));
        add(skull, new THREE.TubeGeometry(edge, 30, 0.007, 6, false), M.gold);
      });
      add(skull, extrude(crossS(0.045), 0.008), M.gold, [0, 0.118, 0.06], [-Math.PI / 2 - 0.12, 0, 0]);
      ell(skull, M.glow, [0, 0.122, 0.06], [0.012, 0.006, 0.012]);
      [-1, 1].forEach((m) => {
        ell(skull, M.steel, [m * 0.11, 0.0, -0.08], [0.028, 0.075, 0.07]); // 頬当て
        add(skull, torus(0.04, 0.006), M.gold, [m * 0.135, 0.0, -0.08], [0, Math.PI / 2, 0]);
        add(skull, torus(0.018, 0.005), M.glow, [m * 0.138, 0.0, -0.08], [0, Math.PI / 2, 0]);
      });
      // 頭絡(鼻革・頬革)とハミ
      add(skull, torus(1, 0.012), M.strap, [0, -0.012, 0.3], 0, [0.085, 0.075, 1]); // 鼻革
      const bit = {};
      [-1, 1].forEach((m) => {
        add(skull, new THREE.BoxGeometry(0.01, 0.022, 0.32), M.strap, [m * 0.1, -0.02, 0.14], [0.1, 0, 0]); // 頬革
        add(skull, torus(0.022, 0.005), M.gold, [m * 0.075, -0.07, 0.36], [0, Math.PI / 2, 0]);
        bit[m] = new THREE.Object3D(); bit[m].position.set(m * 0.078, -0.07, 0.36); skull.add(bit[m]);
      });

      /* ========================================================
         脚(前脚: 肩→肘→膝→球節 / 後脚: 股→膝(スタイフル)→飛節→球節)
         ======================================================== */
      const legs = {};
      function legSeg(parent, len, r0, r1, armor) {
        add(parent, lathe([[r0, 0.02], [r0 * 1.02, -len * 0.3], [r1, -len]]), M.coat, 0, 0, [1, 1, 1.1]);
        if (armor) {
          add(parent, shell([[r0 + 0.012, -len * 0.12], [r0 * 1.03 + 0.014, -len * 0.45], [r1 + 0.014, -len * 0.88]], 0.005, 24, -2.1, 4.2), M.steel, 0, 0, [1, 1, 1.12]);
          add(parent, band(r1 + 0.014, -len * 0.88, 0.016, -2.1, 4.2), M.gold, 0, 0, [1, 1, 1.12]);
          add(parent, band(r0 + 0.013, -len * 0.12, 0.014, -2.1, 4.2), M.gold, 0, 0, [1, 1, 1.12]);
        }
      }
      function hoofUnit(parent) {
        add(parent, lathe([[0.045, 0.0], [0.05, -0.05], [0.062, -0.1], [0.07, -0.13]]), M.coat);
        add(parent, lathe([[0.062, -0.1], [0.072, -0.135], [0.078, -0.17], [0.0, -0.17]]), M.hoof, [0, 0, 0.012]);
        add(parent, band(0.074, -0.142, 0.014), M.gold, [0, 0, 0.012]);
      }
      function makeFront(m) {
        const s = m > 0 ? 'L' : 'R';
        const sh = grp(body, [m * 0.19, 1.2, 0.6]);
        ell(sh, M.coat, [0, -0.08, 0], [0.12, 0.2, 0.14]);
        const el = grp(sh, [0, -0.28, -0.05]);
        legSeg(el, 0.38, 0.095, 0.062, true);
        const kn = grp(el, [0, -0.38, 0]);
        ell(kn, M.steel, [0, 0, 0.035], [0.06, 0.065, 0.04]);
        add(kn, torus(0.045, 0.006), M.gold, [0, 0, 0.06]);
        legSeg(kn, 0.34, 0.052, 0.045, true);
        const fl = grp(kn, [0, -0.36, 0]);
        hoofUnit(fl);
        // 肩の板: 外側を覆う湾曲した鋼板
        const oc = m > 0 ? Math.PI / 2 : -Math.PI / 2;
        add(sh, shell([[0.12, 0.1], [0.145, -0.04], [0.14, -0.2]], 0.006, 24, oc - 1.0, 2.0), M.steel, [0, 0, 0.01], 0, [1, 1, 1.15]);
        add(sh, band(0.14, -0.2, 0.016, oc - 1.0, 2.0), M.gold, [0, 0, 0.01], 0, [1, 1, 1.15]);
        legs['f' + s] = { sh, el, kn, fl };
      }
      function makeHind(m) {
        const s = m > 0 ? 'L' : 'R';
        const hp = grp(body, [m * 0.2, 1.27, -0.65]);
        ell(hp, M.coat, [0, -0.12, 0.02], [0.15, 0.26, 0.2]);
        const st = grp(hp, [0, -0.35, 0.12]);
        add(st, lathe([[0.095, 0.03], [0.09, -0.15], [0.065, -0.4]]), M.coat, 0, 0, [1, 1, 1.15]);
        st.children[st.children.length - 1].rotation.x = 0.42;
        const hk = grp(st, [0, -0.37, -0.17]);
        ell(hk, M.steel, [0, 0, -0.03], [0.055, 0.06, 0.045]);
        add(hk, torus(0.042, 0.006), M.gold, [0, 0, -0.06]);
        legSeg(hk, 0.38, 0.055, 0.045, true);
        const fl = grp(hk, [0, -0.38, 0]);
        hoofUnit(fl);
        legs['h' + s] = { hp, st, hk, fl };
      }
      makeFront(1); makeFront(-1); makeHind(1); makeHind(-1);
      // 前後の馬衣(脚の付け根に追従)
      const drapes = [];
      ['fL', 'fR', 'hL', 'hR'].forEach((k) => {
        const front = k[0] === 'f', m = k[1] === 'L' ? 1 : -1;
        const L = legs[k];
        const g = grp(body, front ? [m * 0.19, 1.2, 0.6] : [m * 0.2, 1.27, -0.65]);
        const c = front ? (m > 0 ? 0.55 : -0.55) : (m > 0 ? Math.PI - 0.55 : -Math.PI + 0.55);
        add(g, lathe([[0.2, 0.22], [0.25, -0.05], [0.29, -0.4]], 20, c - 0.7, 1.4), clothMat, [-m * 0.19 * (front ? 1 : 1.05), 0, front ? -0.08 : 0.08]);
        drapes.push({ g, L, front });
      });

      /* ========================================================
         翼(肩→肘→手首。羽根は白から先端へ向けて色づく)
         ======================================================== */
      function featherGeo(len, w) {
        const sh = new THREE.Shape();
        sh.moveTo(0, 0);
        sh.quadraticCurveTo(w, len * 0.25, w * 0.8, len * 0.75);
        sh.quadraticCurveTo(w * 0.4, len * 1.02, 0, len);
        sh.quadraticCurveTo(-w * 0.45, len * 0.8, -w * 0.6, len * 0.4);
        sh.quadraticCurveTo(-w * 0.5, len * 0.1, 0, 0);
        const g = new THREE.ShapeGeometry(sh, 10);
        g.rotateX(-Math.PI / 2); // 長さ方向 +Y → -Z(後ろ)
        const p = g.attributes.position, col = [];
        for (let i = 0; i < p.count; i++) { const f = clamp(-p.getZ(i) / len, 0, 1); col.push(f, f, f); }
        g.setAttribute('t', new THREE.Float32BufferAttribute(col, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(p.count * 3), 3));
        return g;
      }
      const featherGeos = [];
      function tintFeathers() {
        const white = C(0xf4f6fa), tmp = new THREE.Color();
        featherGeos.forEach(({ g, k }) => {
          const t = g.attributes.t, c = g.attributes.color;
          for (let i = 0; i < t.count; i++) {
            const f = smooth((t.getX(i) - 0.3) / 0.7) * k;
            tmp.copy(white).lerp(wingTint, f);
            c.setXYZ(i, tmp.r, tmp.g, tmp.b);
          }
          c.needsUpdate = true;
        });
      }
      const wings = {};
      [-1, 1].forEach((m) => {
        const s = m > 0 ? 'L' : 'R';
        const base = grp(body, [m * 0.27, 1.58, 0.34]); // 羽ばたき(Z 回転)
        const yaw = grp(base);                          // 後ろへたたむ(Y 回転)
        const roll = grp(yaw);                          // 翼面を立てる(X 回転)
        const arm = grp(roll);
        add(arm, cylX(0.04, 0.46), M.coat, [m * 0.23, 0, 0]);
        add(arm, cylX(0.045, 0.3), M.steel, [m * 0.18, 0.005, 0]);
        add(arm, band(0.046, 0, 0.012), M.gold, [m * 0.33, 0.005, 0], [0, 0, Math.PI / 2]);
        const elb = grp(arm, [m * 0.46, 0, 0]);
        add(elb, cylX(0.032, 0.5), M.coat, [m * 0.25, 0, 0]);
        const wr = grp(elb, [m * 0.5, 0, 0]);
        add(wr, cylX(0.024, 0.42), M.coat, [m * 0.21, 0, 0]);
        const feathers = [];
        const put = (parent, x, len, w, ang, y, k) => {
          const g = featherGeo(len, w);
          featherGeos.push({ g, k });
          const f = add(parent, g, M.feather, [m * x, y, 0], [0, -m * ang, 0]);
          f.castShadow = true;
          feathers.push(f);
          return f;
        };
        for (let i = 0; i < 6; i++) put(arm, 0.08 + i * 0.07, 0.38 - i * 0.01, 0.06, -0.15 + i * 0.03, -0.004, 0.4);   // 三列風切
        for (let i = 0; i < 9; i++) put(elb, 0.02 + i * 0.058, 0.62 + i * 0.012, 0.075, 0.05 + i * 0.03, -0.006, 0.9); // 次列風切
        for (let i = 0; i < 9; i++) put(wr, 0.02 + i * 0.05, 0.95 - i * 0.025, 0.08, 0.32 + i * 0.13, -0.008, 1.0); // 初列風切
        for (let i = 0; i < 8; i++) put(elb, 0.03 + i * 0.065, 0.3, 0.06, 0.1 + i * 0.02, 0.012, 0.15);  // 雨覆
        for (let i = 0; i < 6; i++) put(wr, 0.03 + i * 0.065, 0.32, 0.06, 0.4 + i * 0.1, 0.012, 0.2);
        for (let i = 0; i < 5; i++) put(arm, 0.1 + i * 0.07, 0.22, 0.05, -0.1, 0.016, 0.05);
        wings[s] = { m, base, yaw, roll, arm, elb, wr };
      });

      /* ========================================================
         毛の束(たてがみ・前髪・頭の羽飾り・尾): 形を保とうとするバネ付き Verlet 鎖
         ======================================================== */
      const strands = [];
      const strandGroup = new THREE.Group();
      fx.add(strandGroup);
      function addStrand(anchor, pts, width, mat, stiff, flat) {
        const SEG = pts.length, RAD = 6, SUB = 3, n = (SEG - 1) * SUB + 1;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * RAD * 3), 3));
        const idx = [];
        for (let i = 0; i < n - 1; i++) for (let j = 0; j < RAD; j++) { const a = i * RAD + j, b = i * RAD + ((j + 1) % RAD); idx.push(a, a + RAD, b, b, a + RAD, b + RAD); }
        geo.setIndex(idx);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true; mesh.frustumCulled = false;
        strandGroup.add(mesh);
        const rest = pts.map((p) => V3(p[0], p[1], p[2]));
        strands.push({ anchor, rest, base: rest.map((v) => v.clone()), mesh, n, RAD, SEG, width, stiff: stiff || 0.2, flat: flat || 0.45,
          p: rest.map((v) => v.clone()), q: rest.map((v) => v.clone()), lens: rest.slice(1).map((v, i) => v.distanceTo(rest[i])) });
      }
      const bez = (a, b, c, d, n) => new THREE.CubicBezierCurve3(V3(...a), V3(...b), V3(...c), V3(...d)).getPoints(n - 1).map((v) => [v.x, v.y, v.z]);
      // 頭の羽飾り(大きな青い房)
      for (let i = 0; i < 11; i++) {
        const u = i / 10 - 0.5, L = 1 - Math.abs(u) * 0.45;
        addStrand(head, bez([u * 0.03, 0.2, -0.04], [u * 0.08, 0.38 * L, -0.06], [u * 0.16, 0.36 * L, -0.3 * L], [u * 0.2 - 0.06, 0.12 * L, -0.45 * L], 10), 0.04 * (0.7 + L * 0.4), M.mane, 0.2);
      }
      // 前髪
      for (let i = 0; i < 4; i++) addStrand(head, bez([(i - 1.5) * 0.02, 0.17, 0.0], [(i - 1.5) * 0.03, 0.2, 0.08], [(i - 1.5) * 0.035, 0.1, 0.14], [(i - 1.5) * 0.04, 0.02, 0.15], 6), 0.022, M.mane, 0.25);
      // たてがみ(首の稜線から片側へ流れる)
      for (let i = 0; i < 12; i++) {
        const y = 0.02 + i * 0.054, z = -(0.19 - i * 0.006) * 1.1;
        const L = 0.32 + 0.12 * Math.sin((i / 11) * Math.PI);
        addStrand(neck, bez([0, y, z], [0.06, y + 0.05, z - 0.05], [0.16, y - L * 0.4, z - 0.06], [0.2, y - L, z - 0.02], 8), 0.036, M.mane, 0.16);
      }
      // 尾
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2, rx = Math.cos(a) * 0.04, ry = Math.sin(a) * 0.03;
        const L = 0.85 + 0.15 * Math.sin(a * 2.3);
        addStrand(body, bez([rx, 1.47 + ry, -0.92], [rx * 2, 1.5 + ry, -1.12], [rx * 3, 1.05, -1.2], [rx * 3.5, 1.5 - L, -1.15], 10), 0.04, M.tail, 0.12);
      }
      const fxInv = new THREE.Matrix4(), relM = new THREE.Matrix4(), w3 = V3(0, 0, 0);
      let physicsOn = options.physics !== false;
      function updateStrands(dt, snap) {
        dt = Math.min(dt, 1 / 30);
        fxInv.copy(fx.matrixWorld).invert();
        const g = -6 * dt * dt;
        strands.forEach((st) => {
          relM.multiplyMatrices(fxInv, st.anchor.matrixWorld);
          const p = st.p, q = st.q;
          for (let i = 0; i < st.SEG; i++) {
            w3.copy(st.rest[i]).applyMatrix4(relM);
            if (i < 2 || snap || !physicsOn) { p[i].copy(w3); q[i].copy(w3); continue; }
            const k = st.stiff * Math.pow(1 - i / st.SEG, 1.5) + 0.012;
            const v = p[i].clone().sub(q[i]).multiplyScalar(0.94);
            q[i].copy(p[i]);
            p[i].add(v).add(w3.sub(p[i]).multiplyScalar(k));
            p[i].y += g;
            p[i].z -= windV * 0.5 * dt * dt;
          }
          for (let it = 0; it < 3; it++) for (let i = 2; i < st.SEG; i++) {
            const a = p[i - 1], b = p[i], d = b.clone().sub(a), l = d.length() || 1e-6;
            if (i > 2) { const c = d.multiplyScalar(((l - st.lens[i - 1]) / l) * 0.5); a.add(c); b.sub(c); }
            else b.copy(a).add(d.multiplyScalar(st.lens[i - 1] / l));
          }
          // 描画: 平たい束
          const side = V3(1, 0, 0).transformDirection(relM);
          const pts = new THREE.CatmullRomCurve3(p).getPoints(st.n - 1);
          const arr = st.mesh.geometry.attributes.position.array;
          const t = V3(0, 0, 0), nrm = V3(0, 0, 0), bin = V3(0, 0, 0), c = V3(0, 0, 0);
          for (let i = 0; i < st.n; i++) {
            const f = i / (st.n - 1);
            t.copy(pts[Math.min(i + 1, st.n - 1)]).sub(pts[Math.max(i - 1, 0)]).normalize();
            bin.copy(side).sub(t.clone().multiplyScalar(side.dot(t))).normalize();
            nrm.crossVectors(t, bin);
            const r = st.width * Math.sin(Math.min(1, f * 6 + 0.25) * Math.PI / 2) * (1 - f * 0.85);
            for (let j = 0; j < st.RAD; j++) {
              const a = (j / st.RAD) * Math.PI * 2;
              c.copy(pts[i]).addScaledVector(bin, Math.cos(a) * r * 1.6).addScaledVector(nrm, Math.sin(a) * r * st.flat);
              const o = (i * st.RAD + j) * 3;
              arr[o] = c.x; arr[o + 1] = c.y; arr[o + 2] = c.z;
            }
          }
          st.mesh.geometry.attributes.position.needsUpdate = true;
          st.mesh.geometry.computeVertexNormals();
        });
      }

      /* ---------- 手綱(ハミから乗り手の手元へ) ---------- */
      const gripTarget = {};
      [-1, 1].forEach((m) => {
        const o = new THREE.Object3D();
        o.position.set(m * 0.13, 1.84, 0.42);
        body.add(o);
        gripTarget[m] = o;
      });
      const reinGeo = [], reinMeshes = [];
      [-1, 1].forEach(() => {
        const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V3(0, 0, 0), V3(0, 1, 0), V3(0, 2, 0)]), 16, 0.008, 6, false);
        const mesh = add(fx, g, M.strap);
        mesh.frustumCulled = false;
        reinMeshes.push(mesh);
      });
      const _a = V3(0, 0, 0), _b = V3(0, 0, 0);
      function updateReins() {
        [-1, 1].forEach((m, i) => {
          bit[m].getWorldPosition(_a); fx.worldToLocal(_a);
          gripTarget[m].getWorldPosition(_b); fx.worldToLocal(_b);
          const mid = _a.clone().lerp(_b, 0.5); mid.y -= 0.06;
          const old = reinMeshes[i].geometry;
          reinMeshes[i].geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([_a.clone(), mid, _b.clone()]), 12, 0.008, 5, false);
          old.dispose();
        });
      }

      /* ---------- 輪郭線(サイバーナイトと同じ方式) ---------- */
      const outlineU = { value: options.outlineWidth !== undefined ? options.outlineWidth : 0.005 };
      const outlineMat = new THREE.MeshBasicMaterial({ color: C(0x06080c), side: THREE.BackSide });
      outlineMat.onBeforeCompile = (sh) => {
        sh.uniforms.uOutline = outlineU;
        sh.vertexShader = 'uniform float uOutline;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(normal) * uOutline;');
      };
      const olTargets = [];
      body.traverse((o) => { if (o.isMesh && NO_OUTLINE.indexOf(o.material) < 0 && o.material !== M.feather) olTargets.push(o); });
      olTargets.forEach((o) => { const ol = new THREE.Mesh(o.geometry, outlineMat); ol.castShadow = false; ol.scale.setScalar(1); o.add(ol); });
      function setOutline(on, width) { outlineMat.visible = !!on; if (width !== undefined) outlineU.value = width; }
      setOutline(options.outline !== false);

      function setColor(id) {
        const v = COLORS[id];
        if (!v) return;
        colorId = id;
        M.steel.color.copy(C(v.steel)); M.gold.color.copy(C(v.trim)); M.mane.color.copy(C(v.mane));
        wingTint.copy(C(v.wing)); tintFeathers();
        GLOW.copy(C(v.glow)); M.glow.emissive.copy(GLOW);
        if (M.cloth.map) M.cloth.map.dispose();
        M.cloth.map = clothTexture(v, v.trim);
        M.cloth.needsUpdate = true;
      }
      setColor(options.color || 'normal');

      /* ========================================================
         モーション(角度はラジアン)
         ======================================================== */
      const KEYS = ['y', 'pitch', 'roll', 'neck', 'headX', 'headY', 'earF', 'earS', 'fold', 'flap', 'tail', 'speed'];
      ['fL', 'fR', 'hL', 'hR'].forEach((k) => ['a', 'b', 'c', 'd'].forEach((j) => KEYS.push(k + j)));
      const newPose = () => { const P = {}; KEYS.forEach((k) => (P[k] = 0)); P.fold = 1; return P; };
      // 1 本の脚の歩様: p = 位相(0..1)、stance = 接地している割合
      function legCycle(P, k, p, A, lift, stance) {
        const front = k[0] === 'f';
        let swing, flex;
        if (p < stance) { swing = lerp(-A, A, p / stance); flex = 0; }
        else { const s = (p - stance) / (1 - stance); swing = lerp(A, -A, smooth(s)); flex = Math.sin(Math.PI * s) * lift; }
        if (front) { P[k + 'a'] += swing; P[k + 'b'] += flex * 0.35; P[k + 'c'] += flex * 1.5; P[k + 'd'] += flex * 0.6; }
        else { P[k + 'a'] += swing; P[k + 'b'] -= flex * 0.5; P[k + 'c'] += flex * 1.0; P[k + 'd'] += flex * 0.7; }
      }
      const MODES = {
        idle: (P, t) => {
          const b = Math.sin(t * 1.2);
          P.y = 0.004 * b; P.neck = 0.04 * Math.sin(t * 0.5); P.headX = 0.05 * Math.sin(t * 0.7); P.headY = 0.12 * Math.sin(t * 0.3);
          P.earF = 0.15 * Math.max(0, Math.sin(t * 1.7) * Math.sin(t * 0.4)); P.tail = Math.sin(t * 0.9);
          P.fold = 1;
          if (Math.sin(t * 0.25) > 0.92) legCycle(P, 'fR', (t * 1.2) % 1, 0.05, 0.6, 0.3); // ときどき前掻き
        },
        walk: (P, t) => {
          const T = 1.15, ph = { hL: 0, fL: 0.25, hR: 0.5, fR: 0.75 };
          Object.keys(ph).forEach((k) => legCycle(P, k, (t / T + ph[k]) % 1, 0.24, 0.55, 0.62));
          P.y = -0.012 + 0.012 * Math.cos((t / T) * Math.PI * 4); P.neck = 0.06 * Math.sin((t / T) * Math.PI * 2);
          P.headX = -0.04 * Math.sin((t / T) * Math.PI * 2); P.tail = 0.5 * Math.sin(t * 2); P.fold = 1; P.speed = 1.6;
        },
        gallop: (P, t) => {
          const T = 0.56, ph = { hL: 0, hR: 0.1, fL: 0.42, fR: 0.52 }, u = (t / T) * Math.PI * 2;
          Object.keys(ph).forEach((k) => legCycle(P, k, (t / T + ph[k]) % 1, 0.5, 0.95, 0.42));
          P.y = 0.05 * Math.sin(u) - 0.02; P.pitch = 0.07 * Math.sin(u + 1.2); P.neck = 0.18 * Math.sin(u - 0.6) - 0.1; P.headX = 0.05;
          P.earF = -0.1; P.tail = 1.2; P.fold = 0.85; P.speed = 8;
        },
        // いななき: 後脚を支点に立ち上がり、前脚で宙を掻く
        rear: (P, t) => {
          const c = t % 2.6, up = c < 0.6 ? smooth(c / 0.6) : c < 1.8 ? 1 : 1 - smooth((c - 1.8) / 0.8);
          P.pitch = -0.78 * up;
          ['hL', 'hR'].forEach((k) => { P[k + 'a'] += 0.78 * up - 0.25 * up; P[k + 'b'] -= 0.55 * up; P[k + 'c'] += 0.7 * up; P[k + 'd'] += 0.2 * up; });
          ['fL', 'fR'].forEach((k, i) => {
            const paw = Math.sin(c * 7 + i * 1.6) * up;
            P[k + 'a'] += (-0.85 + 0.35 * paw) * up; P[k + 'c'] += (1.6 + 0.4 * paw) * up; P[k + 'd'] += 0.6 * up;
          });
          P.neck = -0.25 * up; P.headX = -0.45 * up + 0.1 * Math.sin(c * 5) * up; P.earF = -0.6 * up; P.tail = 1.4 * up;
          P.fold = 1 - 0.95 * up; P.flap = 0.25 * up;
        },
        // 飛翔: 前脚をたたみ、後脚を後ろへ伸ばし、翼で羽ばたく
        fly: (P, t) => {
          const u = t * Math.PI * 2 * 0.9;
          P.y = 0.9 + 0.08 * Math.sin(u + Math.PI / 2); P.pitch = -0.08 + 0.03 * Math.sin(u);
          ['fL', 'fR'].forEach((k) => { P[k + 'a'] += -0.55; P[k + 'c'] += 1.9; P[k + 'd'] += 0.7; });
          ['hL', 'hR'].forEach((k) => { P[k + 'a'] += 0.75; P[k + 'b'] -= 0.1; P[k + 'c'] += 0.45; P[k + 'd'] += 0.3; });
          P.neck = -0.12; P.headX = 0.05; P.earF = -0.2; P.tail = 1.5; P.fold = 0; P.flap = 1; P.speed = 10;
        },
      };
      const EXPR = {
        normal: { earF: 0, earS: 0, head: 0, eye: 1 },
        joy: { earF: 0.25, earS: -0.15, head: -0.15, eye: 0.75 },
        surprise: { earF: 0.45, earS: -0.3, head: -0.3, eye: 1.35 },
        angry: { earF: -1.0, earS: 0.5, head: 0.12, eye: 0.85 },
      };
      let expr = 'normal';
      const exprCur = Object.assign({}, EXPR.normal);

      let mode = options.mode || 'idle', mt = 0, blendT = 1, wingOverride = null;
      const cur = newPose(), from = newPose(), target = newPose();
      MODES[mode](cur, 0);
      function setMode(m) {
        if (!MODES[m]) return;
        KEYS.forEach((k) => (from[k] = cur[k]));
        blendT = 0; mt = 0; mode = m;
      }

      let time = 0, flapPhase = 0, windV = 0;
      const eyes = body.children.filter(() => false);
      skull.children.forEach((o) => { if (o.material === M.eye && o.scale.x > 0.02) eyes.push(o); });
      function apply(P) {
        chassis.position.y = P.y * S;
        // ピッチの支点: 立ち上がりは後脚、それ以外は胴の中心
        const pivotZ = P.pitch < 0 ? -0.7 : 0, pivotY = P.pitch < 0 ? 0.05 : 1.2;
        chassis.rotation.set(P.pitch, 0, P.roll);
        const c = Math.cos(P.pitch), s = Math.sin(P.pitch);
        chassis.position.z = (pivotZ - (s * pivotY + c * pivotZ)) * S;
        chassis.position.y += (pivotY - (c * pivotY - s * pivotZ)) * S;
        neck.rotation.x = NECK_REST + P.neck;
        head.rotation.set(-NECK_REST - P.neck + 0.15 + P.headX + exprCur.head, P.headY, 0);
        ['L', 'R'].forEach((s2, i) => {
          const m = i ? -1 : 1;
          ears[s2].rotation.set(-(P.earF + exprCur.earF) * 0.8, 0, -m * (0.25 + P.earS + exprCur.earS));
        });
        eyes.forEach((e) => (e.scale.y = 0.028 * exprCur.eye));
        ['fL', 'fR'].forEach((k) => {
          const L = legs[k];
          L.sh.rotation.x = P[k + 'a']; L.el.rotation.x = P[k + 'b']; L.kn.rotation.x = P[k + 'c']; L.fl.rotation.x = P[k + 'd'];
        });
        ['hL', 'hR'].forEach((k) => {
          const L = legs[k];
          L.hp.rotation.x = P[k + 'a']; L.st.rotation.x = P[k + 'b']; L.hk.rotation.x = P[k + 'c']; L.fl.rotation.x = P[k + 'd'];
        });
        drapes.forEach((d) => { d.g.rotation.x = (d.front ? d.L.sh.rotation.x : d.L.hp.rotation.x) * 0.55; });
        // 翼: fold=1 で背に沿ってたたむ、0 で広げる。flap で羽ばたく
        const fold = wingOverride === null ? P.fold : wingOverride === 'spread' ? 0 : 1;
        const fl = (wingOverride === 'spread' && P.flap < 0.2 ? 0.25 : P.flap) * (1 - fold);
        ['L', 'R'].forEach((s2) => {
          const W = wings[s2], m = W.m;
          const beat = Math.sin(flapPhase), lag = Math.sin(flapPhase - 0.7);
          W.base.rotation.z = m * (0.18 * (1 - fold) + fl * 0.75 * beat);
          W.yaw.rotation.y = m * lerp(0.25, 1.3, fold);
          W.roll.rotation.x = lerp(-0.12, -2.15, fold); // たたむと羽根先が下・外向きになり胴に沿う
          W.yaw.scale.setScalar(lerp(1, 0.82, fold)); // たたむと羽根が重なって短く見える
          W.elb.rotation.y = m * lerp(0.12 + fl * 0.25 * lag, 0.35, fold);
          W.elb.rotation.z = m * fl * 0.35 * lag;
          W.wr.rotation.y = m * lerp(0.22, 0.55, fold);
          W.wr.rotation.z = m * fl * 0.45 * Math.sin(flapPhase - 1.2);
        });
        // 尾の振り(根元の形を左右へ)
        strands.forEach((st) => {
          if (st.anchor !== body) return;
          st.rest.forEach((r, i) => {
            const b = st.base[i], f = i / (st.rest.length - 1);
            r.x = b.x + Math.sin(time * 1.3) * 0.08 * f * (1 - Math.min(1, Math.abs(P.tail)) * 0.5);
            r.y = b.y + (P.tail * 0.35) * f * f;
            r.z = b.z - (P.tail * 0.25) * f;
          });
        });
      }

      let started = false;
      function update(dt, t) {
        dt = Math.min(dt || 0, 1 / 20);
        time += dt; mt += dt;
        MODES[mode](Object.assign(target, newPose()), mt);
        if (blendT < 1) {
          blendT = Math.min(1, blendT + dt / 0.6);
          const k = smooth(blendT);
          KEYS.forEach((key) => (cur[key] = lerp(from[key], target[key], k)));
        } else KEYS.forEach((key) => (cur[key] = target[key]));
        const ex = EXPR[expr];
        Object.keys(exprCur).forEach((k) => (exprCur[k] += (ex[k] - exprCur[k]) * Math.min(1, dt * 6)));
        flapPhase += dt * Math.PI * 2 * (0.9 * cur.flap + 0.15);
        apply(cur);
        root.updateMatrixWorld(true);
        updateStrands(dt, !started);
        updateReins();
        started = true;
        M.glow.emissiveIntensity = (5.5 + Math.sin(time * 2.2) * 1.2) * gk;
      }

      // 乗り手の姿勢(サイバーナイトの ride() が読む)と、マントのコライダー
      const riderStyle = { hips: [4, 0, 0], spine: [3, 0, 0], chest: [0, 0, 0], neck: [-3, 0, 0], head: [-4, 0, 0], kneeOut: 55, seatLift: 0.1 };
      const riderColliders = [
        { obj: body, c: [0, 1.33, -0.5], r: 0.42 }, { obj: body, c: [0, 1.3, -0.1], r: 0.4 },
        { obj: body, c: [0, 1.33, -0.85], r: 0.32 },
      ];
      update(0);

      return {
        root, chassis, body, fx, seatMarker, gripTarget, pegMark, legs, wings, head, neck, materials: M, COLORS, MODES,
        riderStyle, riderColliders,
        update, setMode, getMode: () => mode,
        setExpr: (e) => { if (EXPR[e]) expr = e; }, getExpr: () => expr,
        setWings: (w) => { wingOverride = w === 'spread' || w === 'fold' ? w : null; }, // 'spread' | 'fold' | null(モーション任せ)
        setColor, getColor: () => colorId, setOutline,
        setPhysics: (on) => { physicsOn = !!on; },
        setWind: (v) => { windV = Math.max(0, v || 0); },
        getSpeed: () => cur.speed, // m/s(走行感の演出用)
      };
    },
  };
})(typeof window !== 'undefined' ? window : this);
