/**
 * kunoichi-model.js
 * くのいち 3D モデル＆モーション モジュール(humanoid-core.js の上に定義)
 * 6.5 頭身・身長 156cm。フードとマスクで顔を覆い、目だけを大きく見せる(顔の曲面に描いた目、表情とまばたき)。
 * 黒い漆塗り風の小札(こざね)装甲と紅の縁取り、破れ裾のマント、前髪とマフラーの物理、刀(構えでは両手持ち)。
 * 読み込み順: humanoid-core.js → kunoichi-model.js。Three.js r128 〜 r170。
 */
(function (global) {
  'use strict';

  // カラーバリエーション(設定資料の 紅 / 藍 / 緑 / 紫)。paint = 差し色(縁取り・マフラー・帯)
  const COLORS = {
    crimson: { label: '紅', steel: 0x55566a, paint: 0xc81c34, trim: 0xb89a5a, glow: 0xff3a4a, cloth: '#15131a', accent: '#a3142a', iris: ['#2a1a5a', '#6a4ad8', '#c8b4ff'] },
    indigo: { label: '藍', steel: 0x46506c, paint: 0x2a55b8, trim: 0xa8a8b8, glow: 0x4a8aff, cloth: '#12141c', accent: '#2a4aa0', iris: ['#10204a', '#3a6ad8', '#b4d0ff'] },
    green: { label: '緑', steel: 0x3f5249, paint: 0x26884a, trim: 0xb8a060, glow: 0x4adf8a, cloth: '#121712', accent: '#2a7a46', iris: ['#0e2a1a', '#2f9a5a', '#b8ffd0'] },
    purple: { label: '紫', steel: 0x544266, paint: 0x8434c0, trim: 0xc0a0d8, glow: 0xc06aff, cloth: '#17121c', accent: '#7a3aaa', iris: ['#2a0e3a', '#9a4ad8', '#e8c8ff'] },
  };

  // 破れ裾のマント(裾と穴は透明。alphaTest で切り抜く)
  function capeTexture(THREE, U, v) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 1024;
    const g = c.getContext('2d');
    g.fillStyle = v.cloth; g.fillRect(0, 0, 512, 1024);
    for (let i = 0; i < 8000; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.03})`; g.fillRect(Math.random() * 512, Math.random() * 1024, 2, 1); }
    g.fillStyle = v.accent; g.fillRect(0, 0, 10, 1024); g.fillRect(502, 0, 10, 1024);
    // 背中の家紋(花菱)
    g.save(); g.translate(256, 330); g.strokeStyle = v.accent; g.fillStyle = v.accent; g.lineWidth = 8;
    g.beginPath(); g.arc(0, 0, 92, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 4; i++) {
      g.save(); g.rotate((i * Math.PI) / 2);
      g.beginPath(); g.moveTo(0, -12); g.quadraticCurveTo(34, -46, 0, -78); g.quadraticCurveTo(-34, -46, 0, -12); g.fill();
      g.restore();
    }
    g.restore();
    // 破れた裾: 下端をギザギザに消し、ところどころ裂け目を入れる
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.moveTo(0, 1024);
    for (let x = 0; x <= 512; x += 24) g.lineTo(x, 900 + Math.random() * 110 - (x % 96 === 0 ? 120 : 0));
    g.lineTo(512, 1024); g.closePath(); g.fill();
    for (let i = 0; i < 7; i++) {
      const x = 40 + Math.random() * 430, y = 640 + Math.random() * 240, w = 6 + Math.random() * 10, h = 40 + Math.random() * 90;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y + h * 0.5); g.lineTo(x, y + h); g.lineTo(x - w, y + h * 0.5); g.closePath(); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    return U.srgbTex(new THREE.CanvasTexture(c));
  }

  // 静止ポーズ(度)。feet = [x, z, 向き, 持ち上げ, つま先の傾き]
  const POSES = {
    idle: {
      root: [0, -0.01, 0],
      j: {
        spine: [3, 0, 0], chest: [2, 0, 0], neck: [-2, 0, 0], head: [-4, 0, 0],
        shoulder_L: [6, 0, 9], elbow_L: [-18, 0, 0], forearm_L: [0, 30, 0], wrist_L: [0, 0, 8],
        shoulder_R: [-10, -19, -4], elbow_R: [-9, 0, 0], forearm_R: [0, 14, 0], wrist_R: [62, -4, -8],
      },
      feet: { L: [0.11, 0.03, 12], R: [-0.11, -0.03, -12] },
    },
    guard: {
      root: [0, -0.12, -0.02],
      j: {
        hips: [8, 22, 0], spine: [8, -10, 0], chest: [4, -10, 0], neck: [-6, -2, 0], head: [-6, -2, 0],
        shoulder_L: [-40, 20, 20], elbow_L: [-70, 0, 0],
        shoulder_R: [-22, 13, 15], elbow_R: [-79, 0, 0], forearm_R: [0, 3, 0], wrist_R: [33, 0, 0],
      },
      feet: { L: [0.11, 0.2, 15], R: [-0.13, -0.18, -35] },
    },
    // 上段(振りかぶり): 刀を頭上へ、切っ先は後ろ上
    jodan: {
      root: [0, -0.06, 0],
      j: {
        hips: [2, 12, 0], spine: [-6, -6, 0], chest: [-6, -4, 0], neck: [6, -2, 0], head: [4, 0, 0],
        shoulder_L: [-120, 10, 20], elbow_L: [-60, 0, 0],
        shoulder_R: [-112, 21, 15], elbow_R: [-94, 0, 0], forearm_R: [0, -22, 0], wrist_R: [64, 0, 0],
      },
      feet: { L: [0.11, 0.16, 15], R: [-0.13, -0.16, -30] },
    },
    // 斬り下ろしの終わり: 踏み込んで低く、切っ先は前の下
    slashLow: {
      root: [0, -0.24, 0.06],
      j: {
        hips: [16, 18, 0], spine: [14, -8, 0], chest: [8, -8, 0], neck: [-12, -2, 0], head: [-10, 0, 0],
        shoulder_L: [-50, 20, 20], elbow_L: [-40, 0, 0],
        shoulder_R: [-22, 12, 15], elbow_R: [-92, 0, 0], forearm_R: [0, -88, 0], wrist_R: [75, -8, 0],
      },
      feet: { L: [0.12, 0.34, 12], R: [-0.14, -0.3, -30, 0, 28] },
    },
    // 手裏剣: 左手を右肩の前へ引き(振りかぶり)、体を左へひねりながら横へ投げ放つ
    throwWind: {
      root: [0, -0.1, 0],
      j: {
        hips: [4, -14, 0], spine: [4, -14, 0], chest: [2, -16, 0], neck: [-4, 22, 0], head: [-4, 20, 0],
        shoulder_L: [-80, -40, 0], elbow_L: [-125, 0, 0], forearm_L: [0, -40, 0], wrist_L: [20, 0, -10],
        shoulder_R: [-10, -19, -4], elbow_R: [-9, 0, 0], forearm_R: [0, 14, 0], wrist_R: [62, -4, -8],
      },
      feet: { L: [0.12, 0.14, 20], R: [-0.13, -0.14, -25] },
    },
    throwRelease: {
      root: [0, -0.12, 0.02],
      j: {
        hips: [6, 14, 0], spine: [6, 10, 0], chest: [4, 12, 0], neck: [-6, -18, 0], head: [-4, -14, 0],
        shoulder_L: [-88, 10, 30], elbow_L: [-8, 0, 0], forearm_L: [0, -20, 0], wrist_L: [-10, 0, 10],
        shoulder_R: [-10, -19, -4], elbow_R: [-9, 0, 0], forearm_R: [0, 14, 0], wrist_R: [62, -4, -8],
      },
      feet: { L: [0.12, 0.2, 20], R: [-0.13, -0.14, -25, 0, 12] },
    },
    // 流れ星(構え。ポーズ編集で作成): 柄は右肩の前、刀は体の前を左前へ。左手の人差し指と中指の間で切っ先を挟み、
    // 指を鞘の代わりにして溜める
    ryuseiSet: {
      root: [0.005, -0.23, -0.02],
      yaw: -1,
      j: {
        hips: [25, 22, 0], spine: [8, -10, 0], chest: [4, -10, 0], neck: [-6, -2, 0],
        head: [-6, -2, 0], shoulder_L: [-41, 16, 113], elbow_L: [-107, 0, 0], forearm_L: [0, 34, 0],
        wrist_L: [-16, 30, 6], shoulder_R: [-44, 61, -73], elbow_R: [-55, 0, 0], forearm_R: [0, -16, 0],
        wrist_R: [-2, 9, -1],
      },
      feet: { L: [0.285, 0.2, 15, 0, 0, 0], R: [-0.4, -0.18, -35, 0, 0, 0] },
      hand: { L: { f: [[0.42, 0.56, 0.4], [0.73, 0.02, 0.02], [1, 1, 0.9], [1, 1, 0.9]], spr: [0.33, -0.16, -0.05, -0.08], t: { o: 1.1, r: 0.3, f: [0.6, 0.7, 0.6] } }, R: 'grip' },
    },
    // 流れ星(振り終わり): 構えから右肩のひねり・前後と右肘だけを動かし、刃は水平に右前へ。左手は放して開く
    ryuseiCut: {
      root: [0.005, -0.23, -0.02],
      yaw: -1,
      j: {
        hips: [25, 22, 0], spine: [8, -10, 0], chest: [4, -10, 0], neck: [-6, -2, 0],
        head: [-6, -2, 0], shoulder_L: [-41, 16, 113], elbow_L: [-107, 0, 0], forearm_L: [0, 34, 0],
        wrist_L: [-16, 30, 6], shoulder_R: [-10, -90, -73], elbow_R: [-45, 0, 0], forearm_R: [0, -16, 0],
        wrist_R: [-2, 9, -1],
      },
      feet: { L: [0.285, 0.2, 15, 0, 0, 0], R: [-0.4, -0.18, -35, 0, 0, 0] },
      hand: { L: 'open', R: 'grip' },
    },
    stealth: {
      root: [0, -0.3, 0],
      j: {
        hips: [20, 0, 0], spine: [18, 0, 0], chest: [10, 0, 0], neck: [-14, 0, 0], head: [-16, 0, 0],
        shoulder_L: [-45, 0, 15], elbow_L: [-35, 0, 0], wrist_L: [-20, 0, 0],
        shoulder_R: [-7, 47, -10], elbow_R: [-8, 0, 0], forearm_R: [0, 90, 0], wrist_R: [55, 30, 0],
      },
      feet: { L: [0.13, 0.16, 20], R: [-0.12, -0.24, -20, 0, 25] },
    },
  };

  const SPEC = {
    name: 'Kunoichi',
    ankleHeight: 0.06,
    // 6.5 頭身・身長 156cm の骨格(肩は狭く、手足は細長め)
    joints: {
      base: [
        ['hips', null, [0, 0.89, 0], { x: [-35, 35], y: [-60, 60], z: [-25, 25] }, '腰'],
        ['spine', 'hips', [0, 0.09, 0], { x: [-30, 50], y: [-45, 45], z: [-30, 30] }, '背骨'],
        ['chest', 'spine', [0, 0.16, 0], { x: [-25, 30], y: [-40, 40], z: [-20, 20] }, '胸'],
        ['neck', 'chest', [0, 0.22, 0], { x: [-25, 25], y: [-40, 40], z: [-15, 15] }, '首'],
        ['head', 'neck', [0, 0.03, 0], { x: [-30, 25], y: [-55, 55], z: [-20, 20] }, '頭'],
      ],
      side: [
        ['shoulder', 'chest', [0.165, 0.17, 0], { x: [-180, 60], y: [-90, 90], z: [-15, 175] }, '肩'],
        ['elbow', 'shoulder', [0, -0.25, 0], { x: [-155, 0] }, '肘'],
        ['forearm', 'elbow', [0, 0, 0], { y: [-90, 90] }, '前腕ひねり'],
        ['wrist', 'forearm', [0, -0.22, 0], { x: [-75, 75], y: [-30, 30], z: [-45, 45] }, '手首'],
        ['hip', 'hips', [0.09, -0.07, 0], { x: [-130, 45], y: [-45, 45], z: [-20, 80] }, '股関節'],
        ['knee', 'hip', [0, -0.38, 0], { x: [0, 155] }, '膝'],
        ['ankle', 'knee', [0, -0.38, 0], { x: [-50, 50], y: [-25, 25], z: [-25, 25] }, '足首'],
        ['toe', 'ankle', [0, -0.045, 0.08], { x: [-50, 30] }, 'つま先'],
      ],
    },
    handStyle: { scale: 0.8, armor: true, cuff: false, glow: false, glove: 'suit', knuckle: 'suit', plate: 'steel' },
    noOutline: ['eyes', 'skin', 'faceFull'],
    face: { full: { sx: 0.93, mouthY: 0.04, mouthScale: 3.3, cheekY: 0.068, eyeScale: 1.22 } }, // 目は共通基盤のアニメ調の目(M.eyes)。素顔は顔全体の絵(M.faceFull)

    materials(ctx) {
      const { THREE, U, M } = ctx;
      const C = U.C;
      M.suit = new THREE.MeshPhysicalMaterial({ color: C(0x3d3b4a), metalness: 0.2, roughness: 0.4, clearcoat: 0.3, clearcoatRoughness: 0.45 });
      M.steel = new THREE.MeshPhysicalMaterial({ color: C(0x1d1e26), metalness: 0.6, roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.12, side: THREE.DoubleSide });
      M.gold = new THREE.MeshPhysicalMaterial({ color: C(0xb89a5a), metalness: 1, roughness: 0.3, side: THREE.DoubleSide });
      M.paint = new THREE.MeshStandardMaterial({ color: C(0xa3142a), roughness: 0.55, metalness: 0.1, side: THREE.DoubleSide });
      M.skin = new THREE.MeshStandardMaterial({ color: C(0xf6dccf), roughness: 0.62, emissive: C(0x3a2a24) }); // フードの影でも肌が沈まないよう少し自発光
      M.hair = new THREE.MeshStandardMaterial({ color: C(0x3a2e50), roughness: 0.62, side: THREE.DoubleSide });
      M.hairHi = new THREE.MeshStandardMaterial({ color: C(0x4c3e68), roughness: 0.58, side: THREE.DoubleSide }); // 束の明るい側(色の変化を付ける)
      // 頭を覆う髪のつやの輪(天使の輪): 縦方向の明るい帯を描いた絵を貼る
      M.hairCap = new THREE.MeshStandardMaterial({ color: C(0xffffff), roughness: 0.6, map: (function () {
        const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256;
        const g = cv.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
        gr.addColorStop(0, '#3a2e50'); gr.addColorStop(0.2, '#3a2e50'); gr.addColorStop(0.235, '#7c6aa8'); gr.addColorStop(0.255, '#9a88c8');
        gr.addColorStop(0.275, '#7c6aa8'); gr.addColorStop(0.31, '#3a2e50'); gr.addColorStop(1, '#3a2e50');
        g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
        // 毛流れの筋(頭頂から下へ)
        for (let i = 0; i < 90; i++) {
          const x = (i / 90) * 256 + Math.sin(i * 7.3) * 2, a = 0.12 + 0.12 * Math.abs(Math.sin(i * 3.1));
          g.strokeStyle = i % 2 ? `rgba(15,8,30,${a})` : `rgba(150,130,200,${a * 0.6})`; g.lineWidth = 1 + (i % 3) * 0.6;
          g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 3, 80, x - 3, 170, x + Math.sin(i) * 4, 256); g.stroke();
        }
        return U.srgbTex(new THREE.CanvasTexture(cv));
      })() });
      M.hood = new THREE.MeshStandardMaterial({ color: C(0x3a3746), roughness: 0.8, side: THREE.DoubleSide });
      M.mask = new THREE.MeshStandardMaterial({ color: C(0x2c2a36), roughness: 0.65, side: THREE.DoubleSide });
      M.leather = new THREE.MeshStandardMaterial({ color: C(0x4a3028), roughness: 0.7 });
      // 刀身は発光させない(共通基盤の色替えはエネルギー刃用の素材を発光色に塗るので、刀は別の素材にする)
      M.katana = new THREE.MeshPhysicalMaterial({ color: C(0x9aa2ac), metalness: 0.9, roughness: 0.32, side: THREE.DoubleSide });
      M.cloth = new THREE.MeshStandardMaterial({ roughness: 0.88, side: THREE.DoubleSide, alphaTest: 0.5 });
      M.hamon = new THREE.MeshPhysicalMaterial({ color: C(0xffffff), metalness: 0.6, roughness: 0.05 });
    },

    build(ctx) {
      const { THREE, U, M, J, ex, colliders } = ctx;
      const { add, sphere, capsule, shell, band, lathe, torus, polyShape, extrude, rbox, cylX, cylZ, loftY, V3, clamp } = U;

      /* ---------- 胴(断面をつないだ細身のライン) ---------- */
      add(J.hips, loftY([[-0.13, 0.05, 0.04, -0.04], [-0.09, 0.128, 0.075, -0.085], [-0.03, 0.17, 0.09, -0.108], [0.03, 0.158, 0.082, -0.094], [0.09, 0.118, 0.068, -0.074]], 8), M.suit);
      add(J.spine, loftY([[-0.03, 0.118, 0.068, -0.074], [0.04, 0.097, 0.06, -0.066], [0.1, 0.1, 0.062, -0.067], [0.18, 0.12, 0.072, -0.074]], 8), M.suit);
      const bust = new THREE.Group();
      J.chest.add(bust);
      add(bust, loftY([[-0.03, 0.12, 0.072, -0.074], [0.04, 0.134, 0.088, -0.078], [0.09, 0.143, 0.094, -0.082], [0.14, 0.148, 0.086, -0.085], [0.19, 0.146, 0.072, -0.082], [0.23, 0.108, 0.055, -0.065], [0.26, 0.055, 0.04, -0.045]], 8), M.suit);
      add(J.neck, capsule(0.034, 0.06), M.suit, [0, 0.0, 0]);

      // 胸当て(漆塗り風)と紅の縁、金の細線
      const CZ = 0.62;
      add(bust, shell([[0.142, 0.035], [0.156, 0.1], [0.153, 0.165], [0.13, 0.205]], 0.006, 32, -1.15, 2.3), M.steel, 0, 0, [1.02, 1, CZ]);
      add(bust, band(0.144, 0.035, 0.012, -1.15, 2.3), M.paint, 0, 0, [1.02, 1, CZ]);
      add(bust, band(0.132, 0.205, 0.01, -1.15, 2.3), M.paint, 0, 0, [1.02, 1, CZ]);
      add(bust, band(0.156, 0.12, 0.004, -1.0, 2.0, 0.003), M.gold, 0, 0, [1.03, 1, CZ * 1.02]);
      // 胸のふくらみ: 左右ふたつのなだらかな山を前へ押し出す(下側はやや急にして下乳のラインを出す)
      U.deformUnder(ctx.root, bust, (p) => {
        if (p.z <= 0) return p;
        let k = 0;
        [-1, 1].forEach((m) => {
          const dx = (p.x - m * 0.058) / 0.042, dy = p.y - 0.105, sy = dy < 0 ? 0.032 : 0.05;
          k = Math.max(k, Math.exp(-0.5 * (dx * dx + (dy / sy) * (dy / sy))));
        });
        p.z += 0.036 * k * clamp(p.z / 0.06, 0, 1);
        return p;
      }, (o) => o.material === M.suit); // 中の胴は動かさない(胸当てだけを張り出す)
      // 襟(マフラー)
      add(J.chest, torus(0.06, 0.024, Math.PI * 2, 10, 32), M.paint, [0, 0.235, -0.005], [Math.PI / 2 + 0.15, 0, 0], [1.05, 0.95, 1]);
      // 帯・ベルトとポーチ
      add(J.spine, torus(0.117, 0.018, Math.PI * 2, 10, 48), M.paint, [0, 0.0, 0], [Math.PI / 2, 0, 0], [1.03, 0.62, 1]);
      add(J.hips, torus(0.152, 0.012, Math.PI * 2, 8, 48), M.leather, [0, 0.055, 0], [Math.PI / 2, 0, 0], [1.03, 0.6, 1]);
      add(J.hips, rbox(0.035, 0.025, 0.012, 0.006), M.gold, [0, 0.055, 0.094]);
      [[0.15, 0.03, 0.02, 0.5], [-0.15, 0.03, 0.02, -0.5], [0.07, 0.03, -0.085, 2.6], [-0.07, 0.03, -0.085, -2.6]].forEach(([x, y, z, ry]) => {
        add(J.hips, rbox(0.045, 0.055, 0.03, 0.01), M.leather, [x, y, z], [0, ry, 0]);
        add(J.hips, rbox(0.047, 0.016, 0.032, 0.005), M.steel, [x, y + 0.022, z], [0, ry, 0]);
      });
      // 草摺(腰の左右。太ももに部分追従)
      ['L', 'R'].forEach((s) => {
        const m = s === 'L' ? 1 : -1, c = m > 0 ? Math.PI / 2 : -Math.PI / 2;
        const t = new THREE.Group();
        t.position.set(0.09 * m, 0.0, 0);
        J.hips.add(t);
        add(t, shell([[0.085, 0.04], [0.098, -0.04], [0.104, -0.11]], 0.005, 24, c - 0.85, 1.7), M.steel);
        add(t, band(0.104, -0.11, 0.01, c - 0.85, 1.7), M.paint);
        add(t, band(0.09, 0.02, 0.004, c - 0.8, 1.6, 0.003), M.gold);
        ex['tasset_' + s] = t;
      });
      colliders.push({ obj: J.chest, c: [0, 0.1, 0.01], r: 0.16 }, { obj: J.spine, c: [0, 0.06, 0], r: 0.13 }, { obj: J.hips, c: [0, -0.02, 0], r: 0.15 });

      /* ---------- 頭: 顔・目・マスク・フード ---------- */
      const head = J.head;
      // 頭の地肌: 楕円の下半分を細くして、アニメ顔らしい小さなあごにする
      const headGeo = sphere(1, 48, 32);
      headGeo.scale(0.08, 0.1, 0.088); headGeo.translate(0, 0.09, 0);
      (function () {
        const pa = headGeo.attributes.position;
        for (let i = 0; i < pa.count; i++) {
          let x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
          const t = clamp((0.075 - y) / 0.085, 0, 1);
          x *= 1 - 0.36 * Math.pow(t, 1.5);
          z *= z < 0 ? 1 - 0.35 * t : 1 - 0.1 * t;
          if (y < 0.0) y -= 0.006 * t;
          pa.setXYZ(i, x, y, z);
        }
        headGeo.computeVertexNormals();
      })();
      const headMesh = add(head, headGeo, M.skin);
      // 素顔の絵(目・眉・頬・鼻・口)。地肌と同じ形を少し大きくして貼る。マスクを着けている間は隠す
      ctx.faceMesh = add(head, U.faceUV(headGeo.clone(), ctx.face.full), M.faceFull);
      ctx.faceMesh.scale.setScalar(1.004); ctx.faceMesh.position.y = -0.09 * 0.004;
      ctx.faceMesh.castShadow = false; ctx.faceMesh.renderOrder = 2;
      ctx.ears = []; // 耳は髪で隠れるので作らない
      // 目(顔の曲面に沿った帯に絵を貼る)
      const eyeGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.066, 32, 1, true, -0.78, 1.56);
      ctx.eyeMesh = add(head, eyeGeo, M.eyes, [0, 0.106, 0.0], 0, [0.93, 1, 1]);
      ctx.eyeMesh.castShadow = false;
      // マスク(顎から目の下まで)
      const nMask = head.children.length;
      add(head, shell([[0.045, -0.06], [0.06, -0.02], [0.08, 0.01], [0.09, 0.04], [0.093, 0.068], [0.091, 0.081]], 0.004, 40, -1.65, 3.3), M.mask, 0, 0, [1, 1, 1.04]);
      add(head, U.surfaceLine([[0, -0.01, 0.094], [0, 0.03, 0.1], [0, 0.06, 0.1]], 0.004), M.mask); // 鼻筋のしわ
      add(head, band(0.092, 0.081, 0.006, -1.4, 2.8, 0.002), M.paint, 0, 0, [1, 1, 1.04]);
      ctx.maskParts = head.children.slice(nMask);
      const nHood = head.children.length;
      // フード(顔の窓を開けた頭巾)と首まわりの垂れ
      const HP = [[0.106, -0.01], [0.113, 0.05], [0.115, 0.11], [0.108, 0.16], [0.088, 0.196], [0.048, 0.217], [0.0, 0.224]];
      const pts = U.curvePts(HP, 12), rng = (a, b) => pts.filter((p) => p.y >= a && p.y <= b);
      const HZ = 1.14;
      add(head, new THREE.LatheGeometry(rng(0.15, 1), 40), M.hood, [0, 0, -0.012], 0, [1, 1, HZ]);
      add(head, new THREE.LatheGeometry(rng(-0.02, 0.16), 40, 0.82, Math.PI * 2 - 1.64), M.hood, [0, 0, -0.012], 0, [1, 1, HZ]);
      add(head, lathe([[0.1, 0.0], [0.13, -0.06], [0.17, -0.12], [0.2, -0.16]], 40, 0.45, Math.PI * 2 - 0.9), M.hood, [0, 0, -0.01], 0, [1, 1, 0.95]);
      // フードの縁の紅(顔の窓に沿って)
      const sideEdge = (m) => { const out = []; for (let k = 0; k <= 8; k++) { const y = 0.155 - k * 0.021, r = U.radiusAt(HP, y) + 0.004; out.push([m * Math.sin(0.82) * r, y, Math.cos(0.82) * r * HZ - 0.012]); } return out; };
      const topEdge = [];
      for (let i = 0; i <= 16; i++) { const a = -0.82 + (i / 16) * 1.64, r = U.radiusAt(HP, 0.155) + 0.004; topEdge.push([Math.sin(a) * r, 0.155 + 0.012 * Math.cos(a * 1.9), Math.cos(a) * r * HZ - 0.012]); }
      add(head, U.surfaceLine(topEdge, 0.0032), M.paint);
      add(head, U.surfaceLine(sideEdge(1), 0.0032), M.paint);
      add(head, U.surfaceLine(sideEdge(-1), 0.0032), M.paint);
      ctx.hoodParts = head.children.slice(nHood);
      // フードのひさしを前へ、頭頂を少しとがらせる
      U.deformUnder(ctx.root, head, (p) => {
        if (p.y > 0.14 && p.z > 0) p.z += (p.y - 0.14) * 0.35 * clamp(1 - Math.abs(p.x) / 0.12, 0, 1);
        if (p.y > 0.2) p.y += (p.y - 0.2) * 0.6 * clamp(1 - Math.abs(p.x) / 0.06, 0, 1);
        return p;
      }, (o) => o === ctx.eyeMesh || o === ctx.faceMesh || o.material === M.skin || ctx.markers.indexOf(o) >= 0 || o.material === M.mask);

      /* ---------- 髪(フードを外したとき): 頭を覆う髪・結び目・高めのポニーテール ---------- */
      // 頭を覆う髪: 球を頭より少し大きく置き、顔と耳とうなじの下の部分は地肌の内側へ沈める(生え際がなめらかに残る)
      const capGeo = (function () {
        const g = new THREE.SphereGeometry(1, 72, 48), pa = g.attributes.position, nrm = g.attributes.normal, n = V3(0, 0, 0);
        const sm = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
        const SX = 0.088, SY = 0.107, SZ = 0.098;
        for (let i = 0; i < pa.count; i++) {
          n.set(pa.getX(i), pa.getY(i), pa.getZ(i)).normalize();
          const hairline = 0.56 - 0.22 * Math.max(0, Math.abs(n.x) - 0.45); // 生え際(こめかみ側は少し下がる)
          const zth = 0.5 - 0.45 * sm((0.05 - n.y) / 0.6); // 顔の縁: こめかみは前寄り、あごに向かって耳の下へ斜めに下がる
          const face = sm((n.z - zth) / 0.12) * sm((hairline - n.y) / 0.06);
          const ear = 0; // 耳は横の房で隠れる
          const below = sm((-0.62 - n.y) / 0.08) * sm((n.z + 0.3) / 0.2) + sm((-0.78 - n.y) / 0.06); // 首まわり(うなじは少し下まで)
          const k = 1 - 0.2 * Math.min(1, face + ear + below);
          pa.setXYZ(i, n.x * SX * k, n.y * SY * k + 0.094, n.z * SZ * k - 0.006);
          nrm.setXYZ(i, n.x / SX, n.y / SY, n.z / SZ); // 楕円の法線(なめらかな陰影)
        }
        for (let i = 0; i < nrm.count; i++) { n.fromBufferAttribute(nrm, i).normalize(); nrm.setXYZ(i, n.x, n.y, n.z); }
        return g;
      })();
      const tieAt = V3(0, 0.176, -0.072), tieN = V3(0, 0.74, -0.67).normalize();
      ctx.hairParts = [
        add(head, capGeo, M.hairCap),
        add(head, torus(0.017, 0.0065, Math.PI * 2, 8, 20), M.paint, [tieAt.x, tieAt.y, tieAt.z], [Math.atan2(tieN.z, tieN.y) + Math.PI / 2, 0, 0]), // 結び紐
        add(head, sphere(1, 16, 12), M.hair, [0, 0.183, -0.08], 0, [0.022, 0.016, 0.022]), // 結び目の髪のふくらみ
      ];
      // ふんわりした髪の房: 頭頂から横・後ろへふくらみながら耳を覆って下り、毛先は少し内へ。2 層に重ねる(顔の前は空ける)
      (function () {
        const HC = V3(0, 0.094, -0.006), SX = 0.088, SY = 0.107, SZ = 0.098, D2 = Math.PI / 180;
        const lock = (phiDeg, layer) => {
          const phi = phiDeg * D2, back = Math.max(0, -Math.cos(phi)), sideK = Math.abs(Math.sin(phi));
          // 始まり: 横は頭頂近く、後ろは結び目の下から(上の髪はポニーテールにまとめる)
          const th0 = 0.32 + 0.62 * back * back, th1 = 1.72;
          const jag = 0.014 * Math.sin(phiDeg * 0.37 + layer * 2.1) + 0.008 * Math.sin(phiDeg * 1.13); // 毛先の長さを不ぞろいに
          const yEnd = 0.022 - 0.035 * back - 0.012 * sideK + (Math.abs(phiDeg) < 70 ? 0.02 : 0) + layer * 0.014 + jag;
          const pts = [];
          for (let k = 0; k <= 5; k++) {
            const th = th0 + (th1 - th0) * (k / 5), puff = 1.05 + 0.1 * Math.sin(Math.PI * Math.min(1, (k / 5) * 1.2)) + layer * 0.05;
            pts.push(V3(SX * puff * Math.sin(th) * Math.sin(phi), HC.y + SY * puff * Math.cos(th), HC.z + SZ * puff * Math.sin(th) * Math.cos(phi)));
          }
          const last = pts[pts.length - 1], dir = V3(Math.sin(phi), 0, Math.cos(phi));
          const yA = last.y;
          [0.45, 0.8, 1].forEach((f, i) => { // まっすぐ下りて、毛先は内へ巻く
            const y = yA + (yEnd - yA) * f;
            pts.push(V3(last.x - dir.x * (0.004 + i * 0.006) * (i ? 1 : 0.3), y, last.z - dir.z * (0.004 + i * 0.006) * (i ? 1 : 0.3)));
          });
          return add(head, U.hairLock(pts, 0.026 + 0.004 * layer, 0.009, HC, 0.86), layer ? M.hairHi : M.hair);
        };
        for (let a = 56; a <= 304; a += 14) ctx.hairParts.push(lock(a > 180 ? a - 360 : a, 0));
        for (let a = 63; a <= 297; a += 14) ctx.hairParts.push(lock(a > 180 ? a - 360 : a, 1));
      })();

      // ポニーテール: 結び目から後ろ上へ跳ね、背中へ流れる。頭と背中の球で押し出す
      const ptCols = [{ obj: 'head', c: [0, 0.09, 0], r: 0.1 }, { obj: 'chest', c: [0, 0.14, -0.02], r: 0.13 }, { obj: 'spine', c: [0, 0.06, -0.01], r: 0.12 }];
      // 細い束を長さ違いで重ね、毛先はとがらせる。束ごとに色を少し変える
      ctx.ponytail = [[0, 1, 0.026, 0], [-0.6, 0.94, 0.022, 1], [0.6, 0.97, 0.022, 1], [-1.2, 0.86, 0.02, 0], [1.2, 0.9, 0.02, 0],
        [-1.8, 0.74, 0.016, 1], [1.8, 0.78, 0.016, 1], [-0.3, 0.82, 0.018, 1], [0.3, 0.7, 0.016, 0]].map(([o, len, w, hi], i) => {
        const x = o * 0.011, dz = (i % 3 - 1) * 0.008, pts = [[x * 0.4, 0.18, -0.074 + dz * 0.3], [x * 0.7, 0.193, -0.098 + dz * 0.5], [x, 0.197, -0.13 + dz], [x * 1.25, 0.181, -0.165 + dz]];
        for (let k = 1; k <= 6; k++) pts.push([x * (1.3 + k * 0.16) + Math.sin(k * 0.9 + i) * 0.004, 0.18 - 0.072 * k * len * 1.05, -0.185 - 0.01 * Math.min(k, 3) + dz]);
        const st = { anchor: 'head', mat: hi ? M.hairHi : M.hair, width: w, stiff: 0.1 + 0.02 * (i % 2), flat: 0.7, taper: 0.97, colliders: ptCols, points: pts };
        ctx.strands.push(st);
        return st;
      });

      // 前髪・横髪(フードの縁からのぞく): 奥と手前の 2 層。分け目(やや左)から外へ流れ、毛先はとがる。中央は短く目にかからない
      const PART = 0.012;
      ctx.hoodBangs = [];
      const bang = (x, L, w, z, mat) => {
        const dir = Math.sign(x - PART) || 1, flow = 0.012 + Math.abs(x - PART) * 0.18;
        ctx.hoodBangs.push({ anchor: 'head', mat, width: w, stiff: 0.45, flat: 0.32, taper: 0.97,
          points: [[x * 0.9, 0.174, z - 0.012], [x, 0.168, z], [x + dir * flow * 0.3, 0.172 - L * 0.5, z + 0.004], [x + dir * flow * 0.75, 0.172 - L, z + 0.002], [x + dir * flow, 0.168 - L * 1.12, z - 0.001]] });
        ctx.strands.push(ctx.hoodBangs[ctx.hoodBangs.length - 1]);
      };
      for (let i = 0; i < 7; i++) { // 奥の層
        const u = (i / 6) * 2 - 1, x = u * 0.066;
        bang(x, 0.03 + 0.008 * Math.abs(Math.sin(i * 1.7)) + Math.pow(Math.abs(u), 2) * 0.04, 0.016, 0.098, M.hair);
      }
      for (let i = 0; i < 6; i++) { // 手前の層(奥の束のあいだに)
        const u = ((i + 0.5) / 6) * 2 - 1, x = u * 0.062;
        bang(x, 0.022 + 0.006 * Math.abs(Math.cos(i * 2.1)) + Math.pow(Math.abs(u), 2) * 0.03, 0.011, 0.104, M.hairHi);
      }
      // 横髪: 頬に沿って下り、毛先は少し内へ向く
      [-1, 1].forEach((m) => [[0.02, 0.018, M.hair, 0], [0.013, 0.012, M.hairHi, 0.006]].forEach(([w, , mat, dz]) => { const st = { anchor: 'head', mat, width: w, stiff: 0.25, flat: 0.32, taper: 0.95,
        points: [[m * 0.078, 0.15, 0.072 + dz], [m * 0.088, 0.11, 0.075 + dz], [m * 0.093, 0.06, 0.072 + dz], [m * 0.092, 0.01, 0.068 + dz], [m * 0.086, -0.03, 0.064 + dz], [m * 0.076, -0.055, 0.062 + dz]] };
        ctx.strands.push(st); ctx.hoodBangs.push(st); }));
      // フードを外したときの前髪と横髪: 頭頂から頭の丸みに沿って額へ下りる房(後ろの髪と一続きに見える)。分け目(やや左)から外へ流れる
      (function () {
        const HC = V3(0, 0.094, -0.006), SX = 0.088, SY = 0.107, SZ = 0.098, D2 = Math.PI / 180, PARTD = 8;
        const skinZ = (y) => 0.088 * Math.sqrt(Math.max(0, 1 - ((y - 0.09) / 0.1) ** 2)); // 地肌の前面
        const front = (phiDeg, yEnd, w, layer) => {
          const dir = Math.sign(phiDeg - PARTD) || 1, flow = (6 + Math.abs(phiDeg - PARTD) * 0.35) * D2, pts = [];
          for (let k = 0; k <= 5; k++) {
            const f = k / 5, th = 0.18 + 0.82 * f, phi = phiDeg * D2 + dir * flow * f * f, puff = 1.07 + 0.05 * Math.sin(Math.PI * f) + layer * 0.03;
            pts.push(V3(SX * puff * Math.sin(th) * Math.sin(phi), HC.y + SY * puff * Math.cos(th), HC.z + SZ * puff * Math.sin(th) * Math.cos(phi)));
          }
          const last = pts[pts.length - 1], phiE = phiDeg * D2 + dir * flow;
          [0.5, 1].forEach((f) => { // 額の前を下り、毛先は少し顔側へ
            const y = last.y + (yEnd - last.y) * f, r = Math.max(Math.hypot(last.x, last.z - HC.z), skinZ(y) + 0.012 + layer * 0.004 - f * 0.002);
            pts.push(V3(r * Math.sin(phiE + dir * 0.04 * f), y, HC.z + r * Math.cos(phiE + dir * 0.04 * f)));
          });
          return add(head, U.hairLock(pts, w, 0.006, HC, 0.99), layer ? M.hairHi : M.hair);
        };
        // 奥の層(中央は短く目にかからない、外ほど長い)と手前の層
        // 毛先の長さをばらつかせ、束を細めにして間から額をのぞかせる(奥の層の中央付近は束を減らす)
        const J = [0.012, -0.016, 0.004, -0.022, 0.018, -0.008, 0.02, -0.014, 0.006];
        [-46, -32, -18, -2, 20, 34, 48].forEach((a, i) => ctx.hairParts.push(front(a, 0.13 - Math.pow(Math.abs(a - PARTD) / 50, 2) * 0.05 + J[i], 0.0125, 0)));
        [-40, -25, -10, 9, 27, 41].forEach((a, i) => ctx.hairParts.push(front(a, 0.138 - Math.pow(Math.abs(a - PARTD) / 50, 2) * 0.04 + J[(i + 4) % 9] * 1.2, 0.0095, 1)));
        // 横髪(顔の横を頬まで)
        [-1, 1].forEach((m) => ctx.hairParts.push(front(m * 58, 0.03, 0.017, 0), front(m * 52, 0.05, 0.013, 1)));
      })();
      // マフラーの端(紅、背中へ流れる)
      [-1, 1].forEach((m) => ctx.strands.push({ anchor: 'chest', mat: M.paint, width: 0.04, stiff: 0.06, flat: 0.25,
        points: [[m * 0.03, 0.24, -0.06], [m * 0.04, 0.21, -0.1], [m * 0.05, 0.14, -0.13], [m * 0.06, 0.05, -0.15], [m * 0.065, -0.05, -0.16], [m * 0.07, -0.15, -0.17], [m * 0.07, -0.25, -0.17]] }));

      /* ---------- 腕 ---------- */
      ['L', 'R'].forEach((s) => {
        const m = s === 'L' ? 1 : -1;
        const sh = J['shoulder_' + s], el = J['elbow_' + s], fa = J['forearm_' + s];
        add(sh, sphere(0.045), M.suit, [0, -0.005, 0]);
        add(sh, capsule(0.036, 0.17), M.suit, [0, -0.125, 0]);
        // 肩当て(胸に付き、腕に部分追従)
        const p = new THREE.Group();
        p.position.set(0.165 * m, 0.17, 0);
        J.chest.add(p);
        const cap = new THREE.Group();
        cap.rotation.z = -0.6 * m; cap.position.set(0.012 * m, 0.01, 0);
        p.add(cap);
        add(cap, new THREE.SphereGeometry(0.072, 28, 12, 0, Math.PI * 2, 0, 0.95), M.steel, [0, -0.03, 0]);
        add(cap, torus(0.072 * Math.sin(0.95), 0.005), M.paint, [0, -0.03 + 0.072 * Math.cos(0.95), 0], [Math.PI / 2, 0, 0]);
        add(cap, new THREE.SphereGeometry(0.078, 28, 8, 0, Math.PI * 2, 0.85, 0.4), M.steel, [0, -0.045, 0]);
        add(cap, torus(0.078 * Math.sin(1.25), 0.005), M.paint, [0, -0.045 + 0.078 * Math.cos(1.25), 0], [Math.PI / 2, 0, 0]);
        add(cap, torus(0.06, 0.0025, Math.PI * 2, 6, 32), M.gold, [0, -0.03 + 0.072 * Math.cos(0.55), 0], [Math.PI / 2, 0, 0]);
        ex['pauldron_' + s] = p;
        add(el, sphere(0.034), M.suit);
        add(fa, capsule(0.031, 0.15), M.suit, [0, -0.105, 0]);
        // 手甲(前腕の籠手)
        add(fa, shell([[0.038, -0.04], [0.043, -0.1], [0.04, -0.17], [0.035, -0.205]], 0.004, 32), M.steel);
        add(fa, band(0.04, -0.045, 0.01), M.paint);
        add(fa, band(0.036, -0.2, 0.008), M.paint);
        add(fa, U.lathe([[0.046, -0.08], [0.047, -0.12], [0.044, -0.16]], 20, m > 0 ? Math.PI / 2 - 0.3 : -Math.PI / 2 - 0.3, 0.6), M.gold);
      });

      /* ---------- 脚 ---------- */
      ['L', 'R'].forEach((s) => {
        const m = s === 'L' ? 1 : -1;
        const hp = J['hip_' + s], kn = J['knee_' + s], an = J['ankle_' + s], toe = J['toe_' + s];
        add(hp, sphere(0.06), M.suit);
        add(hp, U.loftY([[-0.36, 0.044, 0.044, -0.046], [-0.26, 0.052, 0.054, -0.056], [-0.12, 0.06, 0.062, -0.064], [0.0, 0.064, 0.064, -0.066]], 6), M.suit);
        // 腿当てと紅の帯(ベルト)
        add(hp, shell([[0.064, -0.1], [0.068, -0.18], [0.062, -0.27]], 0.004, 28, -1.1, 2.2), M.steel, 0, 0, [1, 1, 1.05]);
        add(hp, band(0.066, -0.1, 0.008, -1.1, 2.2), M.paint, 0, 0, [1, 1, 1.05]);
        [-0.06, -0.3].forEach((y) => add(hp, torus(0.06, 0.006, Math.PI * 2, 6, 32), M.leather, [0, y, 0], [Math.PI / 2, 0, 0], [1.02, 1.08, 1]));
        // 膝当て
        add(kn, sphere(0.045), M.suit);
        add(kn, new THREE.SphereGeometry(0.058, 28, 12, 0, Math.PI * 2, 0, 1.0), M.steel, [0, 0, 0.012], [Math.PI / 2, 0, 0]);
        add(kn, torus(0.058 * Math.sin(1.0), 0.005), M.paint, [0, 0, 0.012 + 0.058 * Math.cos(1.0)]);
        // すねとすね当て(ブーツ)
        add(kn, U.loftY([[-0.36, 0.034, 0.036, -0.036], [-0.2, 0.042, 0.042, -0.05], [-0.06, 0.044, 0.044, -0.046], [0.0, 0.042, 0.042, -0.042]], 6), M.suit);
        add(kn, shell([[0.049, -0.06], [0.054, -0.15], [0.048, -0.27], [0.044, -0.37]], 0.004, 32), M.steel, 0, 0, [1, 1, 1.08]);
        add(kn, band(0.05, -0.06, 0.01), M.paint, 0, 0, [1, 1, 1.08]);
        add(kn, U.lathe([[0.056, -0.12], [0.057, -0.17], [0.054, -0.22]], 16, -0.1, 0.2), M.gold, 0, 0, [1, 1, 1.08]);
        add(an, sphere(0.038, 16, 12), M.steel);
        const sideways = (g) => { g.rotateY(-Math.PI / 2); return g; };
        const rear = new THREE.Shape();
        rear.moveTo(-0.058, -0.06); rear.lineTo(0.085, -0.06); rear.lineTo(0.085, -0.004);
        rear.quadraticCurveTo(0.03, 0.02, -0.006, 0.042); rear.lineTo(-0.048, 0.038);
        rear.quadraticCurveTo(-0.072, 0.015, -0.058, -0.06);
        add(an, sideways(U.extrude(rear, 0.064, 0.009)), M.steel);
        add(an, new THREE.BoxGeometry(0.075, 0.012, 0.15), M.leather, [0, -0.058, 0.008]);
        const tp = new THREE.Shape();
        tp.moveTo(-0.01, -0.015); tp.lineTo(0.05, -0.015);
        tp.quadraticCurveTo(0.095, -0.015, 0.086, 0.01);
        tp.quadraticCurveTo(0.07, 0.034, 0.0, 0.04); tp.lineTo(-0.01, 0.036);
        add(toe, sideways(U.extrude(tp, 0.06, 0.009)), M.steel);
        add(toe, new THREE.BoxGeometry(0.075, 0.012, 0.1), M.leather, [0, -0.014, 0.04]);
        colliders.push({ obj: hp, c: [0, -0.1, 0], r: 0.075 }, { obj: hp, c: [0, -0.28, 0], r: 0.062 }, { obj: kn, c: [0, -0.12, 0], r: 0.055 }, { obj: kn, c: [0, -0.3, 0], r: 0.05 });
      });
      // 右腿のクナイ
      [-0.012, 0.012].forEach((z, i) => {
        const k = new THREE.Group();
        k.position.set(-0.062, -0.17, 0.02 + z); k.rotation.set(0.15, 0, 0.1 + i * 0.05);
        J.hip_R.add(k);
        add(k, U.capsule(0.006, 0.05), M.leather, [0, 0.03, 0]);
        add(k, torus(0.008, 0.002, Math.PI * 2, 6, 12), M.steel, [0, 0.065, 0]);
        add(k, U.extrude(polyShape([[-0.012, 0], [0, -0.07], [0.012, 0]]), 0.003, 0.001), M.katana, [0, 0, 0]);
      });

      /* ---------- 刀(右手の握り点。刃は手の +Z = 人差し指側へ) ---------- */
      const katana = new THREE.Group();
      katana.rotation.x = Math.PI / 2;
      ctx.hands.R.grip.add(katana);
      add(katana, new THREE.CylinderGeometry(0.0145, 0.016, 0.25, 12), M.suit, [0, -0.055, 0]); // 柄(両手で握る長さ)
      for (let i = 0; i < 9; i++) [1, -1].forEach((sd) => add(katana, new THREE.BoxGeometry(0.008, 0.008, 0.003), M.paint, [sd * 0.011, -0.165 + i * 0.026, 0.012], [0, 0, Math.PI / 4]));
      add(katana, new THREE.CylinderGeometry(0.017, 0.017, 0.014, 12), M.gold, [0, -0.183, 0]); // 柄頭
      add(katana, new THREE.CylinderGeometry(0.034, 0.034, 0.007, 8), M.steel, [0, 0.074, 0]); // 鍔
      add(katana, torus(0.034, 0.003, Math.PI * 2, 6, 8), M.gold, [0, 0.074, 0], [Math.PI / 2, 0, 0]);
      add(katana, new THREE.BoxGeometry(0.02, 0.018, 0.012), M.gold, [0, 0.087, 0]); // はばき
      // 刀身: 反りのある片刃
      const L = 0.66, bl = new THREE.Shape(), sori = (t) => 0.022 * t * t;
      bl.moveTo(-0.011, 0);
      for (let i = 1; i <= 20; i++) { const t = i / 20; bl.lineTo(-0.011 + sori(t) - (t > 0.93 ? (t - 0.93) * 0.1 : 0), t * L); }
      bl.lineTo(0.004 + sori(1) + 0.006, L * 0.985);
      for (let i = 20; i >= 0; i--) { const t = i / 20; bl.lineTo(0.012 - t * 0.002 + sori(t), t * L * (t > 0.95 ? 0.985 : 1)); }
      const bladeMesh = add(katana, U.extrude(bl, 0.003, 0.0015, 4), M.katana, [0, 0.095, 0]);
      const hamon = [];
      for (let i = 0; i <= 18; i++) { const t = i / 18 * 0.93; hamon.push([0.006 + sori(t) - 0.003 * Math.sin(t * 40), 0.095 + t * L, 0.0026]); }
      const hamonMesh = add(katana, U.surfaceLine(hamon, 0.0011), M.hamon);
      const reach = new THREE.Object3D(); // 左手を添える位置(両手持ち)。X = 柄の向き(刃と逆)、Y = 手の甲の向き
      reach.position.set(0, -0.12, 0);
      reach.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V3(0, -1, 0), V3(-1, 0, 0), V3(0, 0, -1)));
      katana.add(reach);
      ctx.reach.katanaGrip = reach;
      const trail = { base: V3(0, 0.15, 0), tip: V3(sori(1), 0.095 + L, 0) };
      ctx.items.R = { name: 'katana', obj: katana, trail };
      // 刀身のしなり(流れ星): はばきから先を弓なりに曲げる。軌跡の刃先と、切っ先をつまむ左手の目標も一緒に動かす
      const bender = U.makeBender(katana, [bladeMesh, hamonMesh], 0.095, L, 'x'); // 刃の向きへしならせる(横薙ぎの面内)
      const tip0 = trail.tip.clone(), pinch0 = V3(sori(0.9), 0.095 + L * 0.9, 0);
      const tipReach = new THREE.Object3D(); // 切っ先をつまむ位置。手は峰の側に置き、刀身を人差し指と中指の間に通して挟む
      katana.add(tipReach);
      ctx.reach.katanaTip = tipReach;
      const _t = V3(0, 0, 0), _x = V3(1, 0, 0), _z = V3(0, 0, 0), _m4 = new THREE.Matrix4();
      ctx.bendKatana = (th, md) => {
        bender(th, md);
        bender.point(tip0, trail.tip);
        bender.point(pinch0, tipReach.position);
        bender.tangent(pinch0, _t);
        tipReach.position.addScaledVector(_t, -0.035); // 指の間を刃が抜け、切っ先が手の甲の先に少し出る
        _x.set(-_t.y, _t.x, 0); // 峰(刃の反対側)の向き(しなりで傾く)
        _z.crossVectors(_t, _x);
        // 腕 IK の目標: X = 握る棒の向き(刀身)、Y = 手の甲の向き(峰の側)。手は刀の峰の側にあり、刃の向きへは指を出さない
        tipReach.quaternion.setFromRotationMatrix(_m4.makeBasis(_t, _x, _z));
      };
      ctx.bendKatana(0);

      // 腰の鞘(左)と背の短刀
      const saya = new THREE.Group();
      saya.position.set(0.15, 0.03, 0.07); saya.rotation.set(-1.95, -0.2, 0.0); // 鯉口が前、こじりが後ろ下
      J.hips.add(saya);
      add(saya, U.loftY([[0.0, 0.012, 0.018, -0.018], [0.3, 0.012, 0.017, -0.017], [0.6, 0.011, 0.016, -0.016], [0.7, 0.008, 0.012, -0.012]], 6, 16), M.steel);
      [0.05, 0.2].forEach((y) => add(saya, torus(0.019, 0.003, Math.PI * 2, 6, 16), M.paint, [0, y, 0], [Math.PI / 2, 0, 0], [0.75, 1.05, 1]));
      const tanto = new THREE.Group();
      tanto.position.set(0, 0.04, -0.105); tanto.rotation.set(0, 0, Math.PI / 2 - 0.15);
      J.hips.add(tanto);
      add(tanto, U.loftY([[-0.16, 0.009, 0.013, -0.013], [0.0, 0.009, 0.013, -0.013], [0.12, 0.007, 0.01, -0.01]], 4, 16), M.steel);
      add(tanto, new THREE.CylinderGeometry(0.011, 0.012, 0.1, 10), M.suit, [0, -0.21, 0]);
      add(tanto, torus(0.013, 0.003, Math.PI * 2, 6, 12), M.gold, [0, -0.162, 0], [Math.PI / 2, 0, 0]);

      // 手裏剣(四方手裏剣)。投げる直前だけ左手に持ち、放つと飛び道具として飛ぶ
      const starGeo = (() => {
        const sh = new THREE.Shape();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2, r = i % 2 ? 0.018 : 0.062;
          const x = Math.sin(a) * r, y = Math.cos(a) * r;
          if (i === 0) sh.moveTo(x, y); else sh.lineTo(x, y);
        }
        sh.closePath();
        sh.holes.push(new THREE.Path().absarc(0, 0, 0.008, 0, Math.PI * 2, true));
        const g = extrude(sh, 0.004, 0.0015);
        g.translate(0, 0, -0.002);
        return g;
      })();
      const glowRing = torus(0.03, 0.0035, Math.PI * 2, 6, 24);
      // 飛ぶ手裏剣には発光色の輪を付けて、遠くでも軌跡が見えるようにする
      const makeStar = (lit) => {
        const m = new THREE.Mesh(starGeo, M.katana); m.castShadow = true;
        if (lit) m.add(new THREE.Mesh(glowRing, M.glowSoft));
        return m;
      };
      const held = makeStar();
      held.position.set(0, -0.015, 0.03); held.rotation.set(0, Math.PI / 2, 0.4);
      held.visible = false;
      ctx.hands.L.grip.add(held);
      ctx.shuriken = { held, make: makeStar, flying: [], t: -1, live: 0, thrown: false };

      // マント(胸の後ろの細い弧に固定、破れ裾)
      ctx.cape = { anchor: 'chest', cols: 13, rows: 20, length: 0.86, flare: 0.7, topY: 0.24,
        pins: (u) => [u * 0.16, 0.22 - u * u * 0.02, -0.06 - 0.07 * (1 - u * u)] };
    },

    poses: POSES,
    modes(h) {
      const { fromStatic, breathe, addJ, seq, clamp, ctx, air, squat, mood, win, bump } = h;
      const twoHands = (P) => { P.reach.L = 'katanaGrip'; P.reachW.L = 1; P.hand.L = { c: h.HANDS.grip.c.slice(), th: h.HANDS.grip.th, sp: 0 }; };
      return {
        // 構え: 中段。右手で柄の鍔元、左手を柄頭側に添える(腕 IK)
        guard: (P, t) => {
          fromStatic(P, 'guard'); breathe(P, t, 0.6);
          twoHands(P);
          P.look = 0.5;
        },
        // 隠密: 低い姿勢のしのび足(歩行の仕組みをゆっくり・低く・小さく使う)
        stealth: (P, t) => {
          fromStatic(P, 'stealth');
          h.gait(P, t, Object.assign({}, h.WALK, { freq: 0.5, stride: 0.4, lift: 0.07, low: 0.3, heel: 4, toeOff: 12, heelOff: 0.7,
            twist: 4, drop: 2, sway: 0.025, bob: 0.006, lean: 0, pitch: 0.5, width: 1.15, toeOut: 16, zOff: -0.02, arms: false }));
          addJ(P, 'head', 0, 10 * Math.sin(t * 0.7), 0); // 辺りをうかがう
          P.look = 0.3;
        },
        // 空中攻撃: 跳び上がって振りかぶり、落ちながら斬り下ろして低く着地
        airAttack: (P, t) => {
          seq(P, t, [[0, 'guard'], [0.24, 'guard'], [0.6, 'jodan'], [0.82, 'jodan'], [1.05, 'slashLow'], [1.6, 'slashLow'], [2.1, 'guard']]);
          twoHands(P);
          const c = t < 0.24 ? win(t, 0, 0.24) : 1 - win(t, 0.24, 0.32);
          const u = clamp((t - 0.3) / 0.88, 0, 1), hgt = t > 0.3 && t < 1.18 ? 4 * u * (1 - u) * 0.95 : 0;
          const tuck = bump(t, 0.36, 1.1) * 0.6;
          const land = t < 1.18 ? 0 : t < 1.3 ? win(t, 1.18, 1.3) : 1 - win(t, 1.3, 1.9);
          squat(P, c * 0.8 + land * 0.6);
          air(P, hgt, tuck);
          P.flip = -20 * bump(t, 0.5, 0.85) + 18 * bump(t, 0.85, 1.25); // 振りかぶりで反り、斬り下ろしで前へ
          P.trail = t > 0.8 && t < 1.2 ? 1 : 0;
          if (t > 0.2 && t < 1.7) mood('angry');
          P.look = 0;
        },
        // 流れ星(虎眼流の奥義に倣った技): 切っ先を左手の指で挟んで刀身をしならせ、溜めた力を離して横薙ぎの一閃
        //   0〜0.6 構えへ / 0.6〜1.6 溜め(刀身が弓なりにふくらみ、震える)/ 1.6 離す / 〜1.76 一閃 / 〜2.5 残心 / 〜3.2 構えへ戻る
        //   一閃は右肩のひねり・前後と右肘だけを連動させる。途中で刃先が下がらないよう、中ほどで肩を少し上げ、肘を伸ばす
        ryusei: (P, t) => {
          const REL = 1.6, SWING = 0.16, charge = win(t, 0.6, 1.55);
          if (t < REL) seq(P, t, [[0, 'guard'], [0.6, 'ryuseiSet'], [REL, 'ryuseiSet']]);
          else seq(P, t, [[REL, 'ryuseiSet'], [2.5, 'ryuseiSet'], [3.2, 'guard']]);
          if (t >= REL && t < 2.5) {
            const u = 1 - Math.pow(1 - Math.min(1, (t - REL) / SWING), 2), bm = Math.sin(Math.PI * u); // 離した直後が最も速い
            const A = POSES.ryuseiSet.j, B = POSES.ryuseiCut.j;
            P.j.shoulder_R = [A.shoulder_R[0] + (B.shoulder_R[0] - A.shoulder_R[0]) * u - 8 * bm, A.shoulder_R[1] + (B.shoulder_R[1] - A.shoulder_R[1]) * u, A.shoulder_R[2]];
            P.j.elbow_R = [A.elbow_R[0] + (B.elbow_R[0] - A.elbow_R[0]) * u - 12 * bm, 0, 0];
            P.hand.L = h.blendHand(POSES.ryuseiSet.hand.L, h.HANDS.open, Math.min(1, (t - REL) / 0.08));
          }
          if (t < 0.4) twoHands(P); // 構えに入るまでは両手持ち
          // 溜め: 腰をわずかに沈める
          if (t < REL) P.root[1] -= 0.03 * charge;
          // 刀のしなり: 溜めは両端を止めた弓なり(切っ先は指の間から動かない)、離すと先が自由になって震えながら戻る
          if (t < REL) { ctx.katanaBendMode = 'bow'; ctx.katanaBendTarget = 0.05 * charge + 0.002 * charge * Math.sin(t * 70); }
          else { const v = t - REL; ctx.katanaBendMode = 'arc'; ctx.katanaBendTarget = -0.35 * Math.cos(v * 2 * Math.PI * 7) * Math.exp(-v / 0.09); }
          ctx.katanaBendLive = 3;
          P.trail = t > REL - 0.01 && t < REL + 0.3 ? 1 : 0;
          if (t > 0.5 && t < 2.6) mood('angry');
          P.look = 0;
        },
        // 斬撃: 上段から踏み込んで斬り下ろす
        slash: (P, t) => {
          seq(P, t, [[0, 'guard'], [0.32, 'jodan'], [0.42, 'jodan'], [0.62, 'slashLow'], [0.9, 'slashLow'], [1.35, 'guard']]);
          twoHands(P);
          P.trail = t > 0.47 && t < 0.72 ? 1 : 0;
          if (t < 1.1) mood('angry');
          P.look = 0;
        },
        // 手裏剣投げ: 左手を引いて横投げ。手を離す瞬間(0.56 秒)に 3 枚を扇状に放つ
        shuriken: (P, t) => {
          seq(P, t, [[0, 'idle'], [0.12, 'idle'], [0.46, 'throwWind'], [0.6, 'throwRelease'], [0.95, 'throwRelease'], [1.45, 'idle']]);
          P.hand.L = t < 0.56 ? { c: [0.7, 0.75, 0.9, 0.95], th: 0.75, sp: 0 } : { c: [0.1, 0.15, 0.2, 0.25], th: 0.2, sp: 0.6 };
          const S = ctx.shuriken;
          S.t = t; S.live = 3;
          if (t < 1.2) mood('angry');
          P.look = 0;
        },
      };
    },
    actions: {
      airAttack: { dur: 2.1, next: 'guard', blend: 0.2 },
      slash: { dur: 1.35, next: 'guard', blend: 0.2 },
      ryusei: { dur: 3.2, next: 'guard', blend: 0.2 },
      shuriken: { dur: 1.45, next: 'idle', blend: 0.2 },
    },


    // 連動パーツ: 肩当ては腕に、草摺は太ももに部分追従
    linked(ctx) {
      const J = ctx.J, ex = ctx.ex;
      ['L', 'R'].forEach((s) => {
        const sr = J['shoulder_' + s].rotation;
        ex['pauldron_' + s].rotation.set(sr.x * 0.3, sr.y * 0.25, sr.z * 0.5);
        const hr = J['hip_' + s].rotation;
        ex['tasset_' + s].rotation.set(hr.x * 0.65, 0, hr.z * 0.75);
      });
    },

    colors: COLORS,
    applyColor(ctx, v) {
      const M = ctx.M;
      if (M.cloth.map) M.cloth.map.dispose();
      M.cloth.map = capeTexture(ctx.THREE, ctx.U, v);
      M.cloth.needsUpdate = true;
    },

    update(ctx, dt) {
      // 刀のしなり(流れ星の間だけ。終われば真っすぐに戻す)
      const live = ctx.katanaBendLive > 0;
      ctx.katanaBendLive = Math.max(0, (ctx.katanaBendLive || 0) - 1);
      ctx.bendKatana(live ? ctx.katanaBendTarget : 0, live ? ctx.katanaBendMode : 'arc');
      updateShuriken(ctx, dt);
    },

    api(ctx, api) {
      // フードとマスクの付け外し。フードを外すと髪(ポニーテール)と耳、マスクを外すと素顔(口・頬)が見える
      const look = { hood: ctx.options.hood !== false, mask: ctx.options.mask !== false };
      const sync = () => {
        ctx.hoodParts.forEach((o) => (o.visible = look.hood));
        ctx.maskParts.forEach((o) => (o.visible = look.mask));
        ctx.hairParts.concat(ctx.ears).forEach((o) => (o.visible = !look.hood));
        ctx.ponytail.forEach((st) => st.mesh && (st.mesh.visible = !look.hood));
        ctx.hoodBangs.forEach((st) => st.mesh && (st.mesh.visible = look.hood)); // フードの縁からのぞく前髪はフードのときだけ
        ctx.eyeMesh.visible = look.mask;
        ctx.faceMesh.visible = !look.mask;
      };
      sync();
      return {
        katana: ctx.items.R.obj,
        setHood: (on) => { look.hood = !!on; sync(); },
        setMask: (on) => { look.mask = !!on; sync(); },
        getHood: () => look.hood, getMask: () => look.mask,
        shuriken: ctx.shuriken,
      };
    },
  };

  /* 手裏剣: 投げる動きの間は左手に持ち、手を離す瞬間に 3 枚を扇状に放つ。
     飛んでいる手裏剣はキャラの親(ワールド側)に置くので、キャラが動いても置いていかれない */
  const RELEASE = 0.56, STAR_SPEED = 14, STAR_LIFE = 1.1;
  function updateShuriken(ctx, dt) {
    const S = ctx.shuriken, T = ctx.THREE;
    if (!S) return;
    const active = S.live > 0;
    S.live = Math.max(0, S.live - 1);
    if (active && S.t < 0.3) S.thrown = false;
    S.held.visible = active && S.t > 0.14 && S.t < RELEASE;
    const space = ctx.root.parent || ctx.root;
    const ws = ctx.model.getWorldScale(new T.Vector3()).x, ps = space.getWorldScale(new T.Vector3()).x;
    if (active && !S.thrown && S.t >= RELEASE) {
      S.thrown = true;
      const p0 = S.held.getWorldPosition(new T.Vector3());
      const fwd = new T.Vector3(0, 0, 1).applyQuaternion(ctx.J.chest.getWorldQuaternion(new T.Quaternion()));
      fwd.y = -0.03; fwd.normalize();
      [-1, 0, 1].forEach((k) => {
        const m = S.make(true);
        m.scale.setScalar(ws / ps);
        space.add(m);
        const v = fwd.clone().applyAxisAngle(new T.Vector3(0, 1, 0), k * 0.13).multiplyScalar(STAR_SPEED * ws);
        S.flying.push({ m, p: p0.clone(), v, life: 0, spin: k });
      });
    }
    S.flying = S.flying.filter((f) => {
      f.life += dt;
      if (f.life > STAR_LIFE) { space.remove(f.m); return false; }
      f.v.y -= 0.6 * ws * dt;
      f.p.addScaledVector(f.v, dt);
      f.m.position.copy(space.worldToLocal(f.p.clone()));
      f.m.rotation.set(-Math.PI / 2 + 0.15, 0, f.spin + f.life * 42);
      return true;
    });
  }

  global.KunoichiModel = {
    /* モデルの約束ごと（MODEL_SPEC.md）：info と create を持つ */
    info: {
      id: 'kunoichi', kind: 'model', version: '2026.10.09', name: 'くのいち',
      desc: '月夜に紛れる女忍。フードとマスクで顔を覆い、大きな目だけを見せる。6.5頭身・156cm。刀(構えは両手持ち)・破れ裾のマント・前髪とマフラーの物理',
      create: 'create(THREE, parent, options) → { root, setMode, update, setColor, setExpr, ... }',
      requires: ['humanoid-core.js'],
      modes: ['idle', 'guard', 'stealth', 'walk', 'run', 'jump', 'airAttack', 'slash', 'shuriken', 'ryusei'],
      expressions: ['normal', 'surprise', 'angry', 'smile', 'sad', 'shy', 'wink'],
      colors: Object.keys(COLORS),
      height: 1.56,
      modeLabels: { idle: '待機', guard: '構え', stealth: '隠密', walk: '歩く', run: '走る' },
      actionLabels: { jump: '跳躍', airAttack: '空中攻撃', slash: '斬撃', shuriken: '手裏剣', ryusei: '流れ星' },
      expressionLabels: { normal: '通常', surprise: '驚き', angry: '怒り', smile: '笑い', sad: '悲しみ', shy: '照れ', wink: 'ウィンク' },
      irisStyleLabels: { normal: '瞳: 通常', sparkle: '瞳: 星空', magic: '瞳: 魔法陣' },
      irisStyles: ['normal', 'sparkle', 'magic'],
    },
    spec: SPEC,
    create(THREE, parentNode, options) {
      if (!global.HumanoidCore) throw new Error('kunoichi-model.js の前に humanoid-core.js を読み込んでください');
      return global.HumanoidCore.create(THREE, parentNode, options, SPEC);
    },
  };
})(typeof window !== 'undefined' ? window : this);
