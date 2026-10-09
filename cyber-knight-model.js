/**
 * cyber-knight-model.js
 * サイバーナイト 3D モデル＆モーション モジュール
 * 共通基盤 humanoid-core.js(骨格・IK・手・ポーズ・物理・輪郭線・乗車)の上に、
 * サイバーナイト固有の「関節(バイザー)・甲冑の形状・剣と盾・静止ポーズと技・カラーバリエーション」を定義する。
 * 読み込み順: humanoid-core.js → cyber-knight-model.js。Three.js r128 〜 r170。
 */
(function (global) {
  'use strict';

    const COLORS = {
      // steel=甲冑の地金 / paint=塗装 / trim=金縁 / glow=発光色
      normal: { label: '通常', steel: 0xc4cad4, paint: 0x1f4fb8, trim: 0xd9ad55, glow: 0x2fa4ff, cloth: '#1d3c9a', clothDark: '#0e1f55', plume: 0x2b5cff },
      red: { label: 'レッド', steel: 0xc4cad4, paint: 0xa01e2a, trim: 0xd9ad55, glow: 0xff6a3a, cloth: '#8c1822', clothDark: '#45090f', plume: 0xe02b36 },
      black: { label: '漆黒', steel: 0x2b2e35, paint: 0x111216, trim: 0xb08a45, glow: 0xff2a3a, cloth: '#4a0c14', clothDark: '#140306', plume: 0xc01c26, cross: '#c8202e' },
      bloodred: { label: 'ブラッドレッド', steel: 0x8c1822, paint: 0x3a0a12, trim: 0xc9a050, glow: 0xb05cff, cloth: '#5a0f18', clothDark: '#22050a', plume: 0x6b3fb0, cross: '#d8c8ff' },
      gold: { label: 'ゴールド', steel: 0xd4ae5a, paint: 0x1f4fb8, trim: 0xf2d590, glow: 0xffc04a, cloth: '#1d3c9a', clothDark: '#0e1f55', plume: 0xe0a53a },
    };

  // マント用テクスチャ(グラデーション + 金縁 + 背中の十字)
    function capeTexture(THREE, U, v) {
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
      g.fillStyle = '#' + new THREE.Color(v.trim).getHexString();
      g.fillRect(0, 996, 512, 22); g.fillRect(4, 0, 10, 1024); g.fillRect(498, 0, 10, 1024);
      g.fillStyle = 'rgba(217,173,85,0.7)'; g.fillRect(0, 976, 512, 6);
      g.save(); g.translate(256, 380);
      g.shadowColor = 'rgba(160,220,255,0.9)'; g.shadowBlur = 24; g.fillStyle = v.cross || '#eef3ff';
      const bar = (w, h) => {
        g.beginPath();
        g.moveTo(-w, -h + 30); g.lineTo(-w * 2.2, -h); g.lineTo(0, -h - 26); g.lineTo(w * 2.2, -h); g.lineTo(w, -h + 30);
        g.lineTo(w, h - 30); g.lineTo(w * 2.2, h); g.lineTo(0, h + 26); g.lineTo(-w * 2.2, h); g.lineTo(-w, h - 30);
        g.closePath(); g.fill();
      };
      bar(13, 170); g.rotate(Math.PI / 2); g.translate(-60, 0); bar(13, 115);
      g.restore();
      return U.srgbTex(new THREE.CanvasTexture(c));
    }

  // 静止ポーズ(角度は度。脚は IK なので feet=[x, z, 向き, 持ち上げ, つま先の傾き] で指定)
    const POSES = {
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

  const SPEC = {
    name: 'CyberKnight',
    // 標準の人型骨格に、兜のバイザー(ヒンジで開閉)を足す
    joints: { extra: [['visor', 'head', [0, 0.165, 0], { x: [-100, 0] }, 'バイザー']] },
    materials(ctx) {
      ctx.M.tabard = new ctx.THREE.MeshStandardMaterial({ color: ctx.U.C(0x1f4fb8), roughness: 0.75, side: ctx.THREE.DoubleSide });
    },
    poses: POSES,
    colors: COLORS,
    applyColor(ctx, v) {
      const M = ctx.M;
      M.tabard.color.copy(ctx.U.C(v.paint)).multiplyScalar(0.9);
      if (M.cloth.map) M.cloth.map.dispose();
      M.cloth.map = capeTexture(ctx.THREE, ctx.U, v);
      M.cloth.needsUpdate = true;
    },

    build(ctx) {
      const { THREE, U, M, J, ex, colliders, options } = ctx;
      const { add, sphere, capsule, shell, band, lathe, radiusAt, surfaceLine, torus, polyShape, extrude, rbox, cylX, cylZ, curvePts, flaredBar, clamp, V2, V3 } = U;

      /* ---------- 胴体 ---------- */
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

      /* ---------- 頭部(バイザーはヒンジで開閉) ---------- */
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
      })();
      // 兜をシャープに: 丸い回転体を、小さく・細く・前へ尖る形に変形する(頭部空間で全パーツ一括)
      const sharpen = (p) => {
        p.y = 0.02 + (p.y - 0.02) * 0.92;
        if (p.y > 0.2) p.y = 0.2 + (p.y - 0.2) * 0.85; // 頭頂を低く(丸すぎないように)
        p.x *= 0.84; p.z *= 0.95;
        const front = clamp(1 - Math.abs(p.x) / 0.12, 0, 1);
        if (p.z > 0) {
          p.z += 0.05 * front * Math.exp(-Math.pow((p.y - 0.15) / 0.09, 2)); // 中央が前へ出る V 字のフェイスガード
          if (p.y < 0.1) p.z += (0.1 - p.y) * 0.35 * front; // 顎を前へ尖らせる
        }
        if (p.y < 0.1) p.x *= 1 - (0.1 - p.y) * 1.6; // 顎を細く
        if (p.y > 0.24) p.y += 0.022 * clamp(1 - Math.abs(p.x) / 0.1, 0, 1) * (p.y - 0.24) / 0.08; // 頭頂の稜線
        return p;
      };
      U.deformUnder(ctx.root, J.head, sharpen, (o) => ctx.markers.indexOf(o) >= 0);
      sharpen(ex.plumeBase); // 羽飾りの付け根も同じ変形で動かす

      /* ---------- 腕(肘は曲げのみ、ひねりは前腕関節で。手は共通基盤が作る) ---------- */
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
      }
      buildArm('L');
      buildArm('R');

      /* ---------- 脚(つま先関節つき) ---------- */
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

      /* ---------- 武装: 剣(右手の握り点)・盾(左手で裏面の取っ手を握る) ---------- */
      const sword = new THREE.Group(); // 柄の軸 = 手の Z。刃は +Z(人差し指側)へ
      sword.rotation.x = Math.PI / 2;
      ctx.hands.R.grip.add(sword);
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
      ctx.hands.L.grip.add(shield);
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
      ctx.items.R = { name: 'sword', obj: sword, trail: { base: swordBase, tip: swordTip } };
      ctx.items.L = { name: 'shield', obj: shield };
      ex.setShieldClearance = setShieldClearance;
      ex.getShieldClearance = () => clearance;

      /* ---------- 兜の羽飾り(毛の束) ---------- */
      const base = ex.plumeBase;
      for (let s = 0; s < 11; s++) {
        const u = s / 10 - 0.5, len = 1 - Math.abs(u) * 0.5;
        const pts = new THREE.CubicBezierCurve3(
          V3(base.x + u * 0.03, base.y, base.z),
          V3(u * 0.08, base.y + 0.2 * len, base.z - 0.05),
          V3(u * 0.16, base.y + 0.1 * len, base.z - 0.36 * len),
          V3(u * 0.22, base.y - 0.24 * len, base.z - 0.5 * len),
        ).getPoints(9).map((v) => [v.x, v.y, v.z]);
        ctx.strands.push({ anchor: 'head', points: pts, width: 0.034 * (0.7 + len * 0.4), mat: M.plume });
      }
      // マントは共通基盤の既定(胸の後ろの弧に固定)を使う
    },

    // 技と構え
    modes(h) {
      const { fromStatic, breathe, seq, ease, clamp } = h;
      return {
        guard: (P, t) => { fromStatic(P, 'guard'); breathe(P, t, 0.6); P.look = 0.6; },
        block: (P, t) => { fromStatic(P, 'block'); breathe(P, t, 0.4); P.look = 0.4; },
        visor: (P, t) => { fromStatic(P, 'visor'); breathe(P, t); P.look = 1; },
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
      };
    },
    actions: { spin: { dur: 1.95, next: 'guard' }, charge: { dur: 1.5, next: 'guard' } },
    jump: { height: 0.42, flip: 0, tuck: 0.55 }, // 重い甲冑なので低めに跳び、宙返りはしない

    // 連動パーツ: 肩アーマーは腕に、草摺・前垂れ・後ろ垂れは太ももに部分追従
    linked(ctx) {
      const J = ctx.J, ex = ctx.ex;
      ['L', 'R'].forEach((s) => {
        const sr = J['shoulder_' + s].rotation;
        ex['pauldron_' + s].rotation.set(sr.x * 0.3, sr.y * 0.25, sr.z * 0.5);
        const hr = J['hip_' + s].rotation;
        ex['tasset_' + s].rotation.set(hr.x * 0.6, 0, hr.z * 0.75);
      });
      const l = J.hip_L.rotation, r = J.hip_R.rotation;
      ex.tabardF.rotation.x = Math.min(0, l.x, r.x) * 0.9;
      ex.tabardB.rotation.x = Math.max(0, l.x, r.x) * 0.9;
    },

    // サイバーナイト固有の公開 API(以前の名前も残す)
    api(ctx, api) {
      return {
        knight: api.figure,
        sword: ctx.items.R.obj,
        shield: ctx.items.L.obj,
        plume: api.strands,
        setShieldClearance: ctx.ex.setShieldClearance,
        getShieldClearance: ctx.ex.getShieldClearance,
      };
    },
  };

  global.CyberKnightModel = {
    /* モデルの約束ごと（MODEL_SPEC.md）：info と create を持つ */
    info: {
      id: 'cyber-knight', kind: 'model', version: '2026.10.09', name: 'サイバーナイト',
      desc: '古の騎士の意志を継ぐ機械仕掛けの騎士。関節リグ(可動域つき)・脚IK・3節の指・拳で握る盾・連動装甲・マントと羽飾りの物理・剣の軌跡・輪郭線',
      create: 'create(THREE, parent, options) → { root, setMode, update, setColor, setHand, setEquip, setOutline, editJoint, ride, ... }',
      requires: ['humanoid-core.js'],
      modes: ['idle', 'guard', 'block', 'visor', 'walk', 'run', 'spin', 'charge', 'jump'],
      colors: Object.keys(COLORS),
      hands: ['grip', 'fist', 'open', 'relax'],
      height: 1.97, // scale=1 のときの全高(メートル)
    },
    spec: SPEC,
    create(THREE, parentNode, options) {
      if (!global.HumanoidCore) throw new Error('cyber-knight-model.js の前に humanoid-core.js を読み込んでください');
      return global.HumanoidCore.create(THREE, parentNode, options, SPEC);
    },
  };
})(typeof window !== 'undefined' ? window : this);
