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
    crimson: { label: '紅', steel: 0x3c3d48, paint: 0xa3142a, trim: 0xb89a5a, glow: 0xff3a4a, cloth: '#15131a', accent: '#a3142a', iris: ['#2a1a5a', '#6a4ad8', '#c8b4ff'] },
    indigo: { label: '藍', steel: 0x2c3448, paint: 0x1f3f8a, trim: 0xa8a8b8, glow: 0x4a8aff, cloth: '#12141c', accent: '#2a4aa0', iris: ['#10204a', '#3a6ad8', '#b4d0ff'] },
    green: { label: '緑', steel: 0x2a3631, paint: 0x1f6a3a, trim: 0xb8a060, glow: 0x4adf8a, cloth: '#121712', accent: '#2a7a46', iris: ['#0e2a1a', '#2f9a5a', '#b8ffd0'] },
    purple: { label: '紫', steel: 0x382c44, paint: 0x6a2a9a, trim: 0xc0a0d8, glow: 0xc06aff, cloth: '#17121c', accent: '#7a3aaa', iris: ['#2a0e3a', '#9a4ad8', '#e8c8ff'] },
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

  // 目の絵(表情・まばたき)。顔の曲面に貼る
  const EYE_W = 512, EYE_H = 190;
  function drawEyes(g, iris, expr, open) {
    g.clearRect(0, 0, EYE_W, EYE_H);
    [-1, 1].forEach((side) => {
      const cx = 256 + side * 120, cy = 100;
      g.save();
      g.translate(cx, cy);
      g.scale(side, 1); // 右目は鏡像(目頭が中央側)
      const ex = expr;
      // 上まぶたの傾き: 怒りは目頭が下がる、悲しみは目頭が上がる
      const tilt = ex === 'angry' ? 0.28 : ex === 'sad' ? -0.22 : 0.06;
      const op = ex === 'surprise' ? 1.18 : ex === 'angry' ? 0.72 : ex === 'sad' ? 0.82 : 1;
      if (ex === 'smile' || open < 0.12) {
        // 閉じた目 / 笑い目(弧)
        g.strokeStyle = '#1a1020'; g.lineWidth = 9; g.lineCap = 'round';
        g.beginPath();
        if (ex === 'smile') g.arc(0, 18, 46, Math.PI * 1.15, Math.PI * 1.85); else g.arc(0, -10, 50, Math.PI * 0.18, Math.PI * 0.82);
        g.stroke();
        g.lineWidth = 4; g.beginPath(); g.moveTo(-50, ex === 'smile' ? 6 : 14); g.lineTo(-62, ex === 'smile' ? 0 : 10); g.stroke();
        g.restore();
        return;
      }
      const H = 60 * op * open, W = 64;
      // 白目(上まぶたと下まぶたで切り抜き)
      g.save();
      g.beginPath();
      g.moveTo(-W, 6 + tilt * 30);
      g.bezierCurveTo(-W * 0.6, -H - tilt * 26, W * 0.5, -H + tilt * 10, W, -4 - tilt * 12);
      g.bezierCurveTo(W * 0.6, H * 0.85, -W * 0.5, H * 0.95, -W, 6 + tilt * 30);
      g.closePath();
      g.fillStyle = '#fbf8ff'; g.fill();
      g.clip();
      // 虹彩(上が濃く下が明るいグラデーション)・瞳孔・ハイライト
      const ir = ex === 'surprise' ? 36 : 43, iy = 4;
      const grad = g.createLinearGradient(0, iy - ir, 0, iy + ir);
      grad.addColorStop(0, iris[0]); grad.addColorStop(0.55, iris[1]); grad.addColorStop(1, iris[2]);
      g.fillStyle = grad; g.beginPath(); g.ellipse(4, iy, ir * 0.86, ir, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(10,6,20,0.9)'; g.beginPath(); g.ellipse(4, iy + 2, ir * 0.34, ir * 0.46, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(30,10,50,0.35)'; g.fillRect(-W, -H, W * 2, H * 0.45); // 上まぶたの影
      g.fillStyle = '#ffffff';
      g.beginPath(); g.ellipse(-10, iy - ir * 0.42, 11, 13, -0.3, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(16, iy + ir * 0.45, 5, 5, 0, 0, Math.PI * 2); g.fill();
      if (ex === 'sad') { g.fillStyle = 'rgba(200,230,255,0.75)'; g.beginPath(); g.ellipse(-24, H * 0.55, 9, 6, 0, 0, Math.PI * 2); g.fill(); }
      g.restore();
      // 上まつげ(太い線)と目尻のはね、下まつげ
      g.strokeStyle = '#140c1c'; g.lineCap = 'round';
      g.lineWidth = 10;
      g.beginPath(); g.moveTo(-W - 2, 6 + tilt * 30); g.bezierCurveTo(-W * 0.6, -H - tilt * 26, W * 0.5, -H + tilt * 10, W + 4, -4 - tilt * 12); g.stroke();
      g.lineWidth = 6; g.beginPath(); g.moveTo(W + 2, -4 - tilt * 12); g.lineTo(W + 18, -14 - tilt * 12); g.stroke();
      g.lineWidth = 3; g.beginPath(); g.moveTo(-W * 0.4, H * 0.92); g.quadraticCurveTo(W * 0.2, H * 1.02, W * 0.8, H * 0.6); g.stroke();
      // 眉(前髪のすき間から少し見える)
      g.lineWidth = 5;
      const by = -H - 26;
      g.beginPath();
      if (ex === 'angry') { g.moveTo(-W * 0.9, by + 16); g.lineTo(W * 0.8, by - 6); }
      else if (ex === 'sad') { g.moveTo(-W * 0.9, by - 8); g.lineTo(W * 0.8, by + 6); }
      else if (ex === 'surprise') { g.moveTo(-W * 0.8, by - 6); g.quadraticCurveTo(0, by - 18, W * 0.8, by - 4); }
      else { g.moveTo(-W * 0.8, by + 2); g.quadraticCurveTo(0, by - 8, W * 0.8, by); }
      g.stroke();
      g.restore();
    });
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
    noOutline: ['eyes', 'skin'],

    materials(ctx) {
      const { THREE, U, M } = ctx;
      const C = U.C;
      M.suit = new THREE.MeshPhysicalMaterial({ color: C(0x26252e), metalness: 0.2, roughness: 0.4, clearcoat: 0.3, clearcoatRoughness: 0.45 });
      M.steel = new THREE.MeshPhysicalMaterial({ color: C(0x1d1e26), metalness: 0.6, roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.12, side: THREE.DoubleSide });
      M.gold = new THREE.MeshPhysicalMaterial({ color: C(0xb89a5a), metalness: 1, roughness: 0.3, side: THREE.DoubleSide });
      M.paint = new THREE.MeshStandardMaterial({ color: C(0xa3142a), roughness: 0.55, metalness: 0.1, side: THREE.DoubleSide });
      M.skin = new THREE.MeshStandardMaterial({ color: C(0xf6dccf), roughness: 0.62, emissive: C(0x3a2a24) }); // フードの影でも肌が沈まないよう少し自発光
      M.hair = new THREE.MeshStandardMaterial({ color: C(0x2a2238), roughness: 0.45, side: THREE.DoubleSide });
      M.hood = new THREE.MeshStandardMaterial({ color: C(0x24222b), roughness: 0.8, side: THREE.DoubleSide });
      M.mask = new THREE.MeshStandardMaterial({ color: C(0x18171e), roughness: 0.65, side: THREE.DoubleSide });
      M.leather = new THREE.MeshStandardMaterial({ color: C(0x2a1c1a), roughness: 0.7 });
      // 刀身は発光させない(共通基盤の色替えはエネルギー刃用の素材を発光色に塗るので、刀は別の素材にする)
      M.katana = new THREE.MeshPhysicalMaterial({ color: C(0xdde3ea), metalness: 1, roughness: 0.14, side: THREE.DoubleSide });
      M.cloth = new THREE.MeshStandardMaterial({ roughness: 0.88, side: THREE.DoubleSide, alphaTest: 0.5 });
      M.hamon = new THREE.MeshPhysicalMaterial({ color: C(0xffffff), metalness: 0.6, roughness: 0.05 });
      ctx.eyeCanvas = document.createElement('canvas');
      ctx.eyeCanvas.width = EYE_W; ctx.eyeCanvas.height = EYE_H;
      ctx.eyeTex = U.srgbTex(new THREE.CanvasTexture(ctx.eyeCanvas));
      M.eyes = new THREE.MeshBasicMaterial({ map: ctx.eyeTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, toneMapped: false });
      M.eyes.color.setScalar(0.92);
    },

    build(ctx) {
      const { THREE, U, M, J, ex, colliders } = ctx;
      const { add, sphere, capsule, shell, band, lathe, torus, polyShape, extrude, rbox, cylX, cylZ, loftY, V3, clamp } = U;

      /* ---------- 胴(断面をつないだ細身のライン) ---------- */
      add(J.hips, loftY([[-0.13, 0.05, 0.04, -0.04], [-0.09, 0.128, 0.075, -0.085], [-0.03, 0.16, 0.088, -0.1], [0.03, 0.152, 0.082, -0.09], [0.09, 0.124, 0.07, -0.075]], 8), M.suit);
      add(J.spine, loftY([[-0.03, 0.125, 0.07, -0.076], [0.04, 0.11, 0.065, -0.07], [0.1, 0.111, 0.067, -0.07], [0.18, 0.123, 0.074, -0.075]], 8), M.suit);
      add(J.chest, loftY([[-0.03, 0.123, 0.074, -0.075], [0.04, 0.134, 0.088, -0.078], [0.09, 0.143, 0.094, -0.082], [0.14, 0.148, 0.086, -0.085], [0.19, 0.146, 0.072, -0.082], [0.23, 0.108, 0.055, -0.065], [0.26, 0.055, 0.04, -0.045]], 8), M.suit);
      add(J.neck, capsule(0.034, 0.06), M.suit, [0, 0.0, 0]);

      // 胸当て(漆塗り風)と紅の縁、金の細線
      const CZ = 0.62;
      add(J.chest, shell([[0.142, 0.035], [0.156, 0.1], [0.153, 0.165], [0.13, 0.205]], 0.006, 32, -1.15, 2.3), M.steel, 0, 0, [1.02, 1, CZ]);
      add(J.chest, band(0.144, 0.035, 0.012, -1.15, 2.3), M.paint, 0, 0, [1.02, 1, CZ]);
      add(J.chest, band(0.132, 0.205, 0.01, -1.15, 2.3), M.paint, 0, 0, [1.02, 1, CZ]);
      add(J.chest, band(0.156, 0.12, 0.004, -1.0, 2.0, 0.003), M.gold, 0, 0, [1.03, 1, CZ * 1.02]);
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
      add(head, sphere(1, 32, 20), M.skin, [0, 0.09, 0.0], 0, [0.08, 0.1, 0.088]);
      // 目(顔の曲面に沿った帯に絵を貼る)
      const eyeGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.054, 32, 1, true, -0.78, 1.56);
      ctx.eyeMesh = add(head, eyeGeo, M.eyes, [0, 0.106, 0.0], 0, [0.93, 1, 1]);
      ctx.eyeMesh.castShadow = false;
      // マスク(顎から目の下まで)
      add(head, shell([[0.045, -0.06], [0.06, -0.02], [0.08, 0.01], [0.09, 0.04], [0.093, 0.068], [0.091, 0.081]], 0.004, 40, -1.65, 3.3), M.mask, 0, 0, [1, 1, 1.04]);
      add(head, U.surfaceLine([[0, -0.01, 0.094], [0, 0.03, 0.1], [0, 0.06, 0.1]], 0.004), M.mask); // 鼻筋のしわ
      add(head, band(0.092, 0.081, 0.006, -1.4, 2.8, 0.002), M.paint, 0, 0, [1, 1, 1.04]);
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
      // フードのひさしを前へ、頭頂を少しとがらせる
      U.deformUnder(ctx.root, head, (p) => {
        if (p.y > 0.14 && p.z > 0) p.z += (p.y - 0.14) * 0.35 * clamp(1 - Math.abs(p.x) / 0.12, 0, 1);
        if (p.y > 0.2) p.y += (p.y - 0.2) * 0.6 * clamp(1 - Math.abs(p.x) / 0.06, 0, 1);
        return p;
      }, (o) => o === ctx.eyeMesh || o.material === M.skin || ctx.markers.indexOf(o) >= 0 || o.material === M.mask);

      // 前髪・横髪(フードの縁からのぞく)
      for (let i = 0; i < 8; i++) {
        const u = (i / 7) * 2 - 1, x = u * 0.064, L = 0.028 + 0.012 * Math.abs(Math.sin(i * 1.7)) + (Math.abs(u) > 0.7 ? 0.035 : 0); // 中央は短く目にかからない
        ctx.strands.push({ anchor: 'head', mat: M.hair, width: 0.013, stiff: 0.45, flat: 0.3,
          points: [[x * 0.9, 0.172, 0.088], [x, 0.166, 0.1], [x * 1.08, 0.172 - L * 0.5, 0.104], [x * 1.12 + u * 0.006, 0.172 - L, 0.1], [x * 1.14 + u * 0.01, 0.168 - L * 1.12, 0.097]] });
      }
      [-1, 1].forEach((m) => ctx.strands.push({ anchor: 'head', mat: M.hair, width: 0.02, stiff: 0.25, flat: 0.3,
        points: [[m * 0.078, 0.15, 0.072], [m * 0.088, 0.11, 0.075], [m * 0.094, 0.06, 0.072], [m * 0.096, 0.01, 0.066], [m * 0.094, -0.03, 0.058], [m * 0.09, -0.06, 0.05]] }));
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
      add(katana, U.extrude(bl, 0.003, 0.0015, 4), M.katana, [0, 0.095, 0]);
      const hamon = [];
      for (let i = 0; i <= 18; i++) { const t = i / 18 * 0.93; hamon.push([0.006 + sori(t) - 0.003 * Math.sin(t * 40), 0.095 + t * L, 0.0026]); }
      add(katana, U.surfaceLine(hamon, 0.0011), M.hamon);
      const reach = new THREE.Object3D(); // 左手を添える位置(両手持ち)。X = 柄の向き(刃と逆)、Y = 手の甲の向き
      reach.position.set(0, -0.12, 0);
      reach.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V3(0, -1, 0), V3(-1, 0, 0), V3(0, 0, -1)));
      katana.add(reach);
      ctx.reach.katanaGrip = reach;
      ctx.items.R = { name: 'katana', obj: katana, trail: { base: V3(0, 0.15, 0), tip: V3(sori(1), 0.095 + L, 0) } };

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

      // マント(胸の後ろの細い弧に固定、破れ裾)
      ctx.cape = { anchor: 'chest', cols: 13, rows: 20, length: 0.86, flare: 0.7, topY: 0.24,
        pins: (u) => [u * 0.16, 0.22 - u * u * 0.02, -0.06 - 0.07 * (1 - u * u)] };
    },

    poses: POSES,
    modes(h) {
      const { fromStatic, breathe, addJ } = h;
      return {
        // 構え: 中段。右手で柄の鍔元、左手を柄頭側に添える(腕 IK)
        guard: (P, t) => {
          fromStatic(P, 'guard'); breathe(P, t, 0.6);
          P.reach.L = 'katanaGrip'; P.reachW.L = 1;
          P.hand.L = { c: h.HANDS.grip.c.slice(), th: h.HANDS.grip.th, sp: 0 };
          P.look = 0.5;
        },
        // 隠密: 低く構えてしのび足
        stealth: (P, t) => {
          fromStatic(P, 'stealth');
          const w = t * 2.6, s = Math.sin(w), c = Math.cos(w);
          P.feet.L = [0.13, 0.05 + 0.13 * s, 20, Math.max(0, c) * 0.035, 0, 0];
          P.feet.R = [-0.12, -0.08 - 0.13 * s, -20, Math.max(0, -c) * 0.035, 10, 0];
          P.root[1] += 0.01 * Math.cos(2 * w);
          addJ(P, 'hips', 0, 4 * s); addJ(P, 'head', 0, -6 * s);
          P.look = 0.6;
        },
      };
    },
    actions: {},

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
      ctx.iris = v.iris;
      ctx.eyeKey = '';
    },

    // 目: 表情とまばたき(数秒おき。ときどき二度まばたき)
    update(ctx, dt, time) {
      if (ctx.nextBlink === undefined) { ctx.nextBlink = 2; ctx.blinkT = 0; ctx.expr = ctx.expr || 'normal'; }
      ctx.nextBlink -= dt;
      if (ctx.nextBlink <= 0) { ctx.blinkT = 0.15; ctx.nextBlink = 2.5 + Math.random() * 3; if (Math.random() < 0.2) ctx.nextBlink = 0.3; }
      let open = 1;
      if (ctx.blinkT > 0) { ctx.blinkT -= dt; open = Math.abs(Math.cos(Math.PI * Math.max(0, ctx.blinkT) / 0.15)); }
      if (!ctx.blinkOn) open = 1;
      const key = ctx.expr + '|' + open.toFixed(1) + '|' + (ctx.iris || []).join();
      if (key !== ctx.eyeKey) {
        ctx.eyeKey = key;
        drawEyes(ctx.eyeCanvas.getContext('2d'), ctx.iris || COLORS.crimson.iris, ctx.expr, open);
        ctx.eyeTex.needsUpdate = true;
      }
    },

    api(ctx, api) {
      ctx.blinkOn = ctx.options.blink !== false;
      return {
        katana: ctx.items.R.obj,
        setExpr: (e) => { if (EXPRESSIONS.indexOf(e) >= 0) ctx.expr = e; },
        getExpr: () => ctx.expr || 'normal',
        setBlink: (on) => { ctx.blinkOn = !!on; },
        EXPRESSIONS,
      };
    },
  };
  const EXPRESSIONS = ['normal', 'surprise', 'angry', 'smile', 'sad'];

  global.KunoichiModel = {
    /* モデルの約束ごと（MODEL_SPEC.md）：info と create を持つ */
    info: {
      id: 'kunoichi', kind: 'model', version: '2026.10.09', name: 'くのいち',
      desc: '月夜に紛れる女忍。フードとマスクで顔を覆い、大きな目だけを見せる。6.5頭身・156cm。刀(構えは両手持ち)・破れ裾のマント・前髪とマフラーの物理',
      create: 'create(THREE, parent, options) → { root, setMode, update, setColor, setExpr, ... }',
      requires: ['humanoid-core.js'],
      modes: ['idle', 'guard', 'stealth', 'walk', 'run'],
      expressions: EXPRESSIONS,
      colors: Object.keys(COLORS),
      height: 1.56,
      modeLabels: { idle: '待機', guard: '構え', stealth: '隠密', walk: '歩く', run: '走る' },
      expressionLabels: { normal: '通常', surprise: '驚き', angry: '怒り', smile: '笑い', sad: '悲しみ' },
    },
    spec: SPEC,
    create(THREE, parentNode, options) {
      if (!global.HumanoidCore) throw new Error('kunoichi-model.js の前に humanoid-core.js を読み込んでください');
      return global.HumanoidCore.create(THREE, parentNode, options, SPEC);
    },
  };
})(typeof window !== 'undefined' ? window : this);
