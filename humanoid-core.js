/**
 * humanoid-core.js
 * 人型モデルの共通基盤。キャラクターのファイル(例: cyber-knight-model.js)は
 * 「関節表・形状・静止ポーズ・技・カラーバリエーション」だけを書き、残りはここが受け持つ。
 *
 *   骨格(関節表 → Group 階層、可動域、関節マーカー)/ 3 節の指の手と握り点 /
 *   ポーズ補間・キーフレーム・歩く・走る・乗車・手動編集 / 脚 IK(接地・つま先)/ 腕 IK(グリップを握る)/
 *   カメラ目線 / マント(Verlet 布)/ 毛の束(羽飾り・髪など)/ 武器の軌跡 / 輪郭線 / 発光の点滅 /
 *   乗り物(seatMarker・gripTarget・pegMark・riderStyle・riderColliders)への乗り降り
 *
 * Three.js r128 〜 r170(色管理・テクスチャ色空間の差を吸収)。
 * 座標系: Y 上 / Z 前 / +X がキャラの左。単位はメートル(縮尺 options.scale は外側でかける)。
 */
(function (global) {
  'use strict';

  // 標準の人型骨格: [名前, 親, 位置, 可動域(度), 表示名]。SIDE は左(L)基準で、右(R)は鏡像を自動生成
  const STANDARD_BASE = [
    ['hips', null, [0, 0.98, 0], { x: [-35, 35], y: [-60, 60], z: [-25, 25] }, '腰'],
    ['spine', 'hips', [0, 0.1, 0], { x: [-25, 45], y: [-40, 40], z: [-25, 25] }, '背骨'],
    ['chest', 'spine', [0, 0.2, 0], { x: [-20, 30], y: [-35, 35], z: [-15, 15] }, '胸'],
    ['neck', 'chest', [0, 0.33, 0], { x: [-25, 25], y: [-35, 35], z: [-15, 15] }, '首'],
    ['head', 'neck', [0, 0.03, 0], { x: [-30, 25], y: [-50, 50], z: [-20, 20] }, '頭'],
  ];
  const STANDARD_SIDE = [
    ['shoulder', 'chest', [0.25, 0.25, 0], { x: [-180, 60], y: [-90, 90], z: [-15, 170] }, '肩'],
    ['elbow', 'shoulder', [0, -0.3, 0], { x: [-150, 0] }, '肘'],
    ['forearm', 'elbow', [0, 0, 0], { y: [-90, 90] }, '前腕ひねり'],
    ['wrist', 'forearm', [0, -0.27, 0], { x: [-70, 70], y: [-30, 30], z: [-40, 40] }, '手首'],
    ['hip', 'hips', [0.11, -0.07, 0], { x: [-120, 45], y: [-45, 45], z: [-20, 70] }, '股関節'],
    ['knee', 'hip', [0, -0.42, 0], { x: [0, 150] }, '膝'],
    ['ankle', 'knee', [0, -0.42, 0], { x: [-45, 45], y: [-25, 25], z: [-25, 25] }, '足首'],
    ['toe', 'ankle', [0, -0.05, 0.09], { x: [-45, 30] }, 'つま先'],
  ];
  // 手首パーツのプリセット: c=4 本の曲げ(0 伸ばす〜1 握る) / th=親指 / sp=指の開き
  const HANDS = {
    grip: { c: [0.82, 0.82, 0.82, 0.82], th: 0.8, sp: 0 },   // 持ち手(柄を握る)
    fist: { c: [1, 1, 1, 1], th: 1, sp: 0 },                  // 握り手
    open: { c: [0.05, 0.05, 0.05, 0.05], th: 0.05, sp: 0.8 }, // 開き手
    relax: { c: [0.35, 0.4, 0.45, 0.5], th: 0.3, sp: 0.3 },   // 自然
  };

  // 形状・色のヘルパー(キャラクターのファイルからも ctx.U として使う)
  function makeUtils(THREE) {
    const V2 = (x, y) => new THREE.Vector2(x, y);
    const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const CM = !!(THREE.ColorManagement && THREE.ColorManagement.enabled && THREE.SRGBColorSpace);
    const C = (hex) => { const c = new THREE.Color(hex); return CM ? c : c.convertSRGBToLinear(); };
    const U = {
      V2, V3, clamp, C, D2R: Math.PI / 180, R2D: 180 / Math.PI,
      lerp: (a, b, k) => a + (b - a) * k,
      smooth: (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); },
      ease: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
      srgbTex(t) {
        if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace; else t.encoding = THREE.sRGBEncoding;
        t.anisotropy = 8;
        return t;
      },
      add(parent, geo, mat, p, r, s) {
        const o = new THREE.Mesh(geo, mat);
        if (p) o.position.set(p[0], p[1], p[2]);
        if (r) o.rotation.set(r[0], r[1], r[2]);
        if (s !== undefined) { if (typeof s === 'number') o.scale.setScalar(s); else o.scale.set(s[0], s[1], s[2]); }
        o.castShadow = true; o.receiveShadow = true;
        parent.add(o);
        return o;
      },
      curvePts: (pts, div) => new THREE.SplineCurve(pts.map((q) => V2(q[0], q[1]))).getPoints(pts.length * (div || 8)),
      sphere: (r, w, h) => new THREE.SphereGeometry(r, w || 24, h || 16),
      torus: (r, tube, arc, rad, tub) => new THREE.TorusGeometry(r, tube, rad || 10, tub || 48, arc === undefined ? Math.PI * 2 : arc),
      cylX: (r, len, seg) => { const g = new THREE.CylinderGeometry(r, r, len, seg || 24); g.rotateZ(Math.PI / 2); return g; },
      cylZ: (r, len, seg) => { const g = new THREE.CylinderGeometry(r, r, len, seg || 24); g.rotateX(Math.PI / 2); return g; },
      polyShape(pts) {
        const s = new THREE.Shape();
        pts.forEach((q, i) => (i ? s.lineTo(q[0], q[1]) : s.moveTo(q[0], q[1])));
        s.closePath();
        return s;
      },
      rrShape(w, h, r) {
        const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
        r = Math.min(r, w / 2, h / 2);
        s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
        s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
        s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
        return s;
      },
      surfaceLine: (points, r) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((p) => V3(p[0], p[1], p[2]))), 48, r || 0.005, 8, false),
    };
    // 回転体(LatheGeometry は phi=0 が +Z 方向)
    U.lathe = (pts, seg, ps, pl) => new THREE.LatheGeometry(U.curvePts(pts), seg || 48, ps || 0, pl === undefined ? Math.PI * 2 : pl);
    // 厚みのある回転体シェル(縁に厚みが見える)
    U.shell = (pts, t, seg, ps, pl) => {
      t = t || 0.006;
      const outer = U.curvePts(pts);
      const inner = outer.slice().reverse().map((p) => V2(p.x - t, p.y));
      return new THREE.LatheGeometry(outer.concat(inner, [outer[0].clone()]), seg || 48, ps || 0, pl === undefined ? Math.PI * 2 : pl);
    };
    // プロファイル上の半径(折れ線補間)
    U.radiusAt = (pts, y) => {
      const c = U.curvePts(pts, 12);
      for (let i = 0; i < c.length - 1; i++) {
        const a = c[i], b = c[i + 1];
        if ((y - a.y) * (y - b.y) <= 0 && a.y !== b.y) return a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x);
      }
      return c[0].x;
    };
    // 細い帯(金縁など)
    U.band = (r, y, h, ps, pl, bulge) => new THREE.LatheGeometry(
      [V2(r, y - (h || 0.012) / 2), V2(r + (bulge === undefined ? 0.004 : bulge), y), V2(r, y + (h || 0.012) / 2)],
      48, ps || 0, pl === undefined ? Math.PI * 2 : pl);
    U.extrude = (shape, depth, bevel, curve) => {
      bevel = bevel === undefined ? 0.004 : bevel;
      const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: curve || 24 });
      g.translate(0, 0, -depth / 2);
      g.computeVertexNormals();
      return g;
    };
    // 角丸の箱: w=X h=Y d=Z
    U.rbox = (w, h, d, r) => {
      const b = Math.min(d * 0.3, r * 0.8, 0.02);
      return U.extrude(U.rrShape(w - 2 * b, h - 2 * b, Math.max(0.001, r - b)), Math.max(0.001, d - 2 * b), b, 6);
    };
    // 先端が広がった十字の棒
    U.flaredBar = (L, a, f) => U.polyShape([
      [-a, -L + 0.05], [-f, -L], [0, -L - 0.035], [f, -L], [a, -L + 0.05],
      [a, L - 0.05], [f, L], [0, L + 0.035], [-f, L], [-a, L - 0.05],
    ]);
    // カプセル(r128 には CapsuleGeometry がないので回転体で作る)
    const capCache = {};
    U.capsule = (r, L) => {
      const key = r.toFixed(4) + '|' + L.toFixed(4);
      if (capCache[key]) return capCache[key];
      const pts = [], n = 8;
      for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + (Math.PI / 2) * (i / n); pts.push(V2(Math.cos(a) * r, -L / 2 + Math.sin(a) * r)); }
      for (let i = 0; i <= n; i++) { const a = (Math.PI / 2) * (i / n); pts.push(V2(Math.cos(a) * r, L / 2 + Math.sin(a) * r)); }
      pts[0].x = 0; pts[pts.length - 1].x = 0;
      return (capCache[key] = new THREE.LatheGeometry(pts, 20));
    };
    // ある関節の空間で、配下の形状すべてを点の関数で変形する(兜を尖らせる等)
    // 刀身などを弓なりにしならせる(頂点を CPU で曲げる。輪郭線は同じ形状を使うので一緒に曲がる)。
    // group の座標で y = start から先(長さ len)を、z の向きへ全体で theta ラジアン曲げる。
    // 戻り値 bend(theta) で曲げ、bend.point(p) で曲げた後の位置、bend.tangent(p) で刃の向きを得る
    U.makeBender = (group, meshes, start, len) => {
      const v = V3(0, 0, 0);
      const recs = meshes.map((m) => {
        m.updateMatrix();
        const mm = m.matrix.clone(), mi = mm.clone().invert(), pa = m.geometry.attributes.position;
        const orig = new Float32Array(pa.count * 3);
        for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i).applyMatrix4(mm); orig[i * 3] = v.x; orig[i * 3 + 1] = v.y; orig[i * 3 + 2] = v.z; }
        return { m, mi, pa, orig };
      });
      let cur = 0;
      const map = (x, y, z, th, out) => {
        const s = y - start;
        if (Math.abs(th) < 1e-5 || s <= 0) return out.set(x, y, z);
        const k = th / len, a = k * s; // 中心線 (y, z) = (start + sin a / k, (1 - cos a) / k)、法線 = (-sin a, cos a)
        return out.set(x, start + Math.sin(a) / k - z * Math.sin(a), (1 - Math.cos(a)) / k + z * Math.cos(a));
      };
      function bend(th) {
        if (Math.abs(th - cur) < 1e-4) return;
        cur = th;
        recs.forEach((r) => {
          const o = r.orig;
          for (let i = 0; i < r.pa.count; i++) { map(o[i * 3], o[i * 3 + 1], o[i * 3 + 2], th, v).applyMatrix4(r.mi); r.pa.setXYZ(i, v.x, v.y, v.z); }
          r.pa.needsUpdate = true;
          r.m.geometry.computeVertexNormals();
          r.m.geometry.computeBoundingSphere();
        });
      }
      bend.point = (p, out) => map(p.x, p.y, p.z, cur, out || V3(0, 0, 0));
      bend.tangent = (p, out) => { const a = Math.max(0, p.y - start) * cur / len; return (out || V3(0, 0, 0)).set(0, Math.cos(a), Math.sin(a)); };
      bend.get = () => cur;
      return bend;
    };
    U.deformUnder = (rootObj, space, fn, skip) => {
      rootObj.updateMatrixWorld(true);
      const toSpace = new THREE.Matrix4().copy(space.matrixWorld).invert();
      const meshes = [];
      space.traverse((o) => { if (o.isMesh && !(skip && skip(o))) meshes.push(o); });
      const mm = new THREE.Matrix4(), mi = new THREE.Matrix4(), v = V3(0, 0, 0);
      meshes.forEach((o) => {
        mm.multiplyMatrices(toSpace, o.matrixWorld);
        mi.copy(mm).invert();
        const g = (o.geometry = o.geometry.clone()); // 共有形状を壊さないよう複製
        const pa = g.attributes.position;
        for (let i = 0; i < pa.count; i++) {
          v.fromBufferAttribute(pa, i).applyMatrix4(mm);
          fn(v).applyMatrix4(mi);
          pa.setXYZ(i, v.x, v.y, v.z);
        }
        g.computeVertexNormals();
        g.computeBoundingSphere();
      });
    };
    // 断面(超楕円)を z 方向に並べてなめらかにつないだ形。secs: [z, 半幅, 上端, 下端, 上の角張り, 下の角張り](2 で楕円)
    const crs = (p0, p1, p2, p3, t) => {
      const t2 = t * t, t3 = t2 * t;
      return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
    };
    U.loftGeo = (secs, steps, around) => {
      const A = around || 48, St = steps || 8, rows = [];
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
    };
    // 縦向きのロフト(胴・手足など)。secs: [y, 半幅(X), 前(+Z), 後ろ(-Z の値), 前の角張り, 後ろの角張り]
    U.loftY = (secs, steps, around) => {
      const g = U.loftGeo(secs.map((r) => [r[0], r[1], -r[3], -r[2], r[5] || 2.2, r[4] || 2.2]), steps, around);
      g.rotateX(-Math.PI / 2); // 並び(Z)→ 縦(Y)、上端 → 後ろ(-Z)
      g.computeVertexNormals();
      return g;
    };
    return U;
  }

  // 甲冑キャラ向けの標準マテリアル(キャラ側で追加・上書きできる)
  function standardMaterials(THREE, U, gk, GLOW) {
    const C = U.C;
    const metal = (hex, roughness, extra) => new THREE.MeshPhysicalMaterial(Object.assign({ color: C(hex), metalness: 1, roughness, side: THREE.DoubleSide }, extra || {}));
    return {
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
      cloth: new THREE.MeshStandardMaterial({ roughness: 0.82, side: THREE.DoubleSide }),
      plume: new THREE.MeshStandardMaterial({ color: C(0x2b5cff), roughness: 0.55, side: THREE.DoubleSide }),
      emblem: metal(0xf2f4f8, 0.2),
    };
  }

/* ================= 顔: キャンバスに描く目 ================= */
  // アニメ調の目の絵(表情・まばたき)。顔の曲面に貼る(spec.face)。座標は 512×232 を基準に描き、RES 倍の解像度で出す
  const EYE_W = 512, EYE_H = 232, RES = 2;
  const IRIS_STYLES = ['normal', 'sparkle', 'magic'];
  const rnd = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }; // 描き直しても模様が変わらない乱数

  // 上まぶたの線(目頭 -W → 目尻 +W)
  function upperLid(g, W, H, tilt, move) {
    if (move) g.moveTo(-W, 6 + tilt * 30);
    g.bezierCurveTo(-W * 0.55, -H - tilt * 24, W * 0.45, -H * 1.04 + tilt * 8, W, -8 - tilt * 12);
  }
  function lowerLid(g, W, H, tilt) {
    g.bezierCurveTo(W * 0.62, H * 0.86, -W * 0.45, H * 0.98, -W, 6 + tilt * 30);
  }

  // 虹彩: ステンドグラス風の模様(同心円 × 放射の区画を明暗で塗り分け)、縦長の瞳孔、下側の照り返し
  function drawIris(g, iris, ix, iy, rx, ry, style, img) {
    g.save();
    g.beginPath(); g.ellipse(ix, iy, rx, ry, 0, 0, Math.PI * 2); g.clip();
    if (img) {
      g.drawImage(img, ix - rx, iy - ry, rx * 2, ry * 2);
    } else {
      const base = g.createRadialGradient(ix, iy + ry * 0.25, ry * 0.1, ix, iy, ry * 1.05);
      base.addColorStop(0, iris[2]); base.addColorStop(0.45, iris[1]); base.addColorStop(1, iris[0]);
      g.fillStyle = base; g.fillRect(ix - rx, iy - ry, rx * 2, ry * 2);
      // 区画(単位円の空間で描く)
      g.save(); g.translate(ix, iy); g.scale(rx, ry);
      const rings = [0.32, 0.52, 0.72, 0.9], N = 14;
      for (let r = 0; r < rings.length - 1; r++) {
        for (let k = 0; k < N; k++) {
          const a0 = (k / N) * Math.PI * 2 + r * 0.22, a1 = a0 + (Math.PI * 2) / N, v = rnd(r * 31 + k);
          g.beginPath(); g.arc(0, 0, rings[r + 1], a0, a1); g.arc(0, 0, rings[r], a1, a0, true); g.closePath();
          g.fillStyle = v > 0.5 ? `rgba(255,255,255,${(v - 0.5) * 0.36})` : `rgba(10,0,30,${(0.5 - v) * 0.34})`;
          g.fill();
        }
      }
      g.lineWidth = 0.018; g.strokeStyle = 'rgba(255,255,255,0.16)';
      rings.forEach((r) => { g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); });
      for (let k = 0; k < N; k++) { const a = (k / N) * Math.PI * 2; g.beginPath(); g.moveTo(Math.cos(a) * 0.3, Math.sin(a) * 0.3); g.lineTo(Math.cos(a), Math.sin(a)); g.stroke(); }
      if (style === 'magic') { // 魔法陣: 光る二重円と目盛り
        g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 0.03;
        [0.46, 0.78].forEach((r) => { g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); });
        for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2, l = k % 3 ? 0.06 : 0.12; g.beginPath(); g.moveTo(Math.cos(a) * 0.78, Math.sin(a) * 0.78); g.lineTo(Math.cos(a) * (0.78 - l), Math.sin(a) * (0.78 - l)); g.stroke(); }
        g.beginPath(); for (let k = 0; k <= 6; k++) { const a = (k * 4 * Math.PI) / 6 - Math.PI / 2; g.lineTo(Math.cos(a) * 0.46, Math.sin(a) * 0.46); } g.stroke();
      }
      g.restore();
      // 外周の濃い縁と、上まぶたの落とす影
      g.lineWidth = 3.5; g.strokeStyle = iris[0];
      g.beginPath(); g.ellipse(ix, iy, rx - 1.5, ry - 1.5, 0, 0, Math.PI * 2); g.stroke();
      const sh = g.createLinearGradient(0, iy - ry, 0, iy);
      sh.addColorStop(0, 'rgba(14,4,30,0.7)'); sh.addColorStop(1, 'rgba(14,4,30,0)');
      g.fillStyle = sh; g.fillRect(ix - rx, iy - ry, rx * 2, ry);
      // 下側の照り返し(弧状の明るい帯)
      g.globalCompositeOperation = 'lighter';
      const gl = g.createRadialGradient(ix, iy + ry * 0.75, 2, ix, iy + ry * 0.75, ry * 0.75);
      gl.addColorStop(0, iris[2]); gl.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = 0.55; g.fillStyle = gl; g.fillRect(ix - rx, iy, rx * 2, ry);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      // 瞳孔(縦長)と、そのまわりの明るい輪
      g.fillStyle = '#100822';
      g.beginPath(); g.ellipse(ix, iy + 2, rx * 0.22, ry * 0.36, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = iris[2]; g.globalAlpha = 0.45; g.lineWidth = 2;
      g.beginPath(); g.ellipse(ix, iy + 2, rx * 0.3, ry * 0.44, 0, 0, Math.PI * 2); g.stroke();
      g.globalAlpha = 1;
    }
    g.restore();
  }

  // 光: 大きな白い照り(左上)・小さな丸(右下)・粒。side をかけて両目とも同じ側に光が来るようにする
  function drawHighlights(g, side, ix, iy, rx, ry, style) {
    g.fillStyle = '#ffffff';
    g.beginPath(); g.ellipse(ix - 0.36 * rx * side, iy - ry * 0.42, rx * 0.3, ry * 0.24, -0.5 * side, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(ix + 0.4 * rx * side, iy + ry * 0.42, rx * 0.12, rx * 0.12, 0, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 0.85;
    g.beginPath(); g.ellipse(ix + 0.08 * rx * side, iy - ry * 0.1, 2.6, 2.6, 0, 0, Math.PI * 2); g.fill();
    if (style === 'sparkle') { // 星のきらめき
      for (let k = 0; k < 7; k++) {
        const x = ix + (rnd(k + 70) - 0.5) * rx * 1.4, y = iy + (rnd(k + 90) - 0.3) * ry * 1.2, s = 2 + rnd(k + 50) * 4;
        g.beginPath(); g.moveTo(x, y - s); g.quadraticCurveTo(x, y, x + s, y); g.quadraticCurveTo(x, y, x, y + s); g.quadraticCurveTo(x, y, x - s, y); g.quadraticCurveTo(x, y, x, y - s); g.fill();
      }
    }
    g.globalAlpha = 1;
  }

  // まつげ: 目尻へ向かって太くなる上まつげと、目尻のはね毛。色は黒から赤茶へ
  function drawLashes(g, W, H, tilt) {
    const lg = g.createLinearGradient(-W, 0, W, 0);
    lg.addColorStop(0, '#2a1420'); lg.addColorStop(0.5, '#160a18'); lg.addColorStop(1, '#3a141e');
    g.fillStyle = lg; g.strokeStyle = lg; g.lineCap = 'round'; g.lineJoin = 'round';
    // 太さの変わる帯: 上まぶたの線を上にずらした線と合わせて塗る
    g.beginPath();
    g.moveTo(-W - 2, 6 + tilt * 30);
    g.bezierCurveTo(-W * 0.55, -H - tilt * 24, W * 0.45, -H * 1.04 + tilt * 8, W + 4, -8 - tilt * 12);
    g.lineTo(W + 9, -19 - tilt * 12);
    g.bezierCurveTo(W * 0.45, -H * 1.04 - 15 + tilt * 8, -W * 0.55, -H - 9 - tilt * 24, -W - 2, 1 + tilt * 30);
    g.closePath(); g.fill();
    // はね毛(先細りの三角)
    const P = (t) => { const u = 1 - t, a = [-W, 6 + tilt * 30], b = [-W * 0.55, -H - tilt * 24], c = [W * 0.45, -H * 1.04 + tilt * 8], d = [W, -8 - tilt * 12];
      return [u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0], u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1]]; };
    [[0.3, 10, -0.5], [0.45, 13, -0.3], [0.6, 15, -0.05], [0.73, 18, 0.3], [0.86, 22, 0.65], [0.98, 26, 1.0]].forEach(([t, L, a]) => {
      const [x, y] = P(t), dx = Math.sin(a) * L, dy = -Math.cos(a) * L;
      g.beginPath(); g.moveTo(x - 3.5, y - 3); g.quadraticCurveTo(x + dx * 0.4, y + dy * 0.7, x + dx, y + dy); g.quadraticCurveTo(x + dx * 0.6, y + dy * 0.4, x + 3.5, y - 3); g.fill();
    });
    // 目尻の下へのはね
    g.lineWidth = 4; g.beginPath(); g.moveTo(W + 4, -10 - tilt * 12); g.quadraticCurveTo(W + 10, 4, W + 6, 14); g.stroke();
    // 二重まぶたの線
    g.strokeStyle = 'rgba(150,70,86,0.55)'; g.lineWidth = 2.2;
    g.beginPath(); g.moveTo(-W * 0.55, -H - 12 - tilt * 20); g.bezierCurveTo(-W * 0.2, -H - 24 - tilt * 14, W * 0.4, -H - 22 + tilt * 6, W * 0.85, -H * 0.55 - 14 - tilt * 10); g.stroke();
    // 下まつげ(赤茶の細線と短い毛)
    g.strokeStyle = 'rgba(110,40,56,0.85)'; g.lineWidth = 2.4;
    g.beginPath(); g.moveTo(-W * 0.3, H * 0.97); g.quadraticCurveTo(W * 0.3, H * 1.02, W * 0.86, H * 0.55); g.stroke();
    g.lineWidth = 1.8;
    [0.1, 0.4, 0.66].forEach((t) => { const x = -W * 0.3 + t * W * 1.16, y = H * (0.99 - t * t * 0.4); g.beginPath(); g.moveTo(x, y); g.lineTo(x + 3, y + 7); g.stroke(); });
  }

  // opt = { style: 虹彩の模様, images: { iris, full } }(読み込み済みの画像)
  function drawEyes(g, iris, expr, open, opt) {
    opt = opt || {};
    const imgs = opt.images || {};
    g.setTransform(RES, 0, 0, RES, 0, 0);
    g.clearRect(0, 0, EYE_W, EYE_H);
    // 画像を丸ごと貼る場合(表情ごとの両目の絵)。まばたきは縦につぶして表現する
    const full = imgs.full && (open < 0.12 ? imgs.full.closed : imgs.full[expr]);
    if (full) {
      const h = EYE_H * (open < 0.12 ? 1 : Math.max(open, 0.1));
      g.drawImage(full, 0, (EYE_H - h) / 2, EYE_W, h);
      return;
    }
    [-1, 1].forEach((side) => {
      const cx = 256 + side * 128, cy = 122;
      g.save();
      g.translate(cx, cy);
      g.scale(side, 1); // 片目は鏡像(目頭が中央側)
      const ex = expr;
      // 上まぶたの傾き: 怒りは目頭が下がる、悲しみは目頭が上がる
      const tilt = ex === 'angry' ? 0.28 : ex === 'sad' ? -0.22 : 0.06;
      const op = ex === 'surprise' ? 1.16 : ex === 'angry' ? 0.74 : ex === 'sad' ? 0.84 : 1;
      // まぶたのまわりの淡い紅(アイシャドウ)
      const sh = g.createRadialGradient(4, -18, 10, 4, -10, 90);
      sh.addColorStop(0, 'rgba(214,120,140,0.28)'); sh.addColorStop(1, 'rgba(214,120,140,0)');
      g.fillStyle = sh; g.fillRect(-100, -95, 200, 150);
      g.strokeStyle = '#2a1420'; g.fillStyle = '#2a1420'; g.lineCap = 'round';
      if (ex === 'smile' || open < 0.12) {
        // 閉じた目 / 笑い目(弧)。まつげのはねは残す
        g.lineWidth = 8;
        g.beginPath();
        if (ex === 'smile') g.arc(0, 18, 48, Math.PI * 1.13, Math.PI * 1.87); else g.arc(0, -14, 54, Math.PI * 0.2, Math.PI * 0.8);
        g.stroke();
        const ox = ex === 'smile' ? 44 : 34, oy = ex === 'smile' ? -2 : 26;
        g.lineWidth = 3.5;
        [[10, -12], [16, -4]].forEach(([dx, dy]) => { g.beginPath(); g.moveTo(ox, oy); g.lineTo(ox + dx, oy + (ex === 'smile' ? dy : -dy * 0.4)); g.stroke(); });
        g.restore();
        return;
      }
      const H = 64 * op * open, W = 74;
      // 白目(上まぶたの影で上側をくすませる)
      g.save();
      g.beginPath(); upperLid(g, W, H, tilt, true); lowerLid(g, W, H, tilt); g.closePath();
      const wg = g.createLinearGradient(0, -H, 0, H * 0.4);
      wg.addColorStop(0, '#c9b9d2'); wg.addColorStop(0.45, '#f4eef8'); wg.addColorStop(1, '#fdfbff');
      g.fillStyle = wg; g.fill();
      g.clip();
      const ir = ex === 'surprise' ? 43 : 51, ix = 5, iy = 7;
      drawIris(g, iris, ix, iy, ir * 0.82, ir * 1.04, opt.style, imgs.iris);
      if (imgs.highlight !== false) drawHighlights(g, side, ix, iy, ir * 0.82, ir * 1.04, opt.style);
      if (ex === 'sad') { g.fillStyle = 'rgba(200,230,255,0.75)'; g.beginPath(); g.ellipse(-24, H * 0.6, 10, 6, 0, 0, Math.PI * 2); g.fill(); }
      g.restore();
      drawLashes(g, W, H, tilt);
      // 眉(前髪のすき間から少し見える)
      g.strokeStyle = '#3a2440'; g.lineWidth = 4.5;
      const by = -H - 32;
      g.beginPath();
      if (ex === 'angry') { g.moveTo(-W * 0.9, by + 16); g.lineTo(W * 0.8, by - 6); }
      else if (ex === 'sad') { g.moveTo(-W * 0.9, by - 8); g.lineTo(W * 0.8, by + 6); }
      else if (ex === 'surprise') { g.moveTo(-W * 0.8, by - 8); g.quadraticCurveTo(0, by - 20, W * 0.8, by - 6); }
      else { g.moveTo(-W * 0.8, by + 2); g.quadraticCurveTo(0, by - 8, W * 0.8, by); }
      g.stroke();
      g.restore();
    });
  }

  const FACE_EXPRESSIONS = ['normal', 'surprise', 'angry', 'smile', 'sad'];

  /* 目の画像。描いた目の代わりに画像を使う(透過 PNG 推奨)
     spec = {
       iris: 'iris.png' または { crimson: 'red.png', indigo: 'blue.png', … }  … 虹彩だけ差し替え(まぶた・表情・まばたきは描画のまま)
       full: { normal: 'eyes_normal.png', smile: …, closed: … }               … 両目の絵を表情ごとに丸ごと差し替え(512:232 の比率)
       highlight: false                                                        … 虹彩画像に光が描き込み済みなら描き足さない
     }
     値は URL のほか、読み込み済みの Image / Canvas でもよい。null で描画に戻す */
  function setEyeImages(F, spec) {
    const ver = ++F.imgVer;
    const load = (src) => {
      if (!src || typeof src !== 'string') return src || null;
      const im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = () => { if (F.imgVer === ver) F.key = ''; }; // 読み終えたら描き直す
      im.src = src;
      return im;
    };
    const ready = (im) => im && (!(im instanceof Image) || (im.complete && im.naturalWidth > 0));
    const map = (o) => { const out = {}; Object.keys(o || {}).forEach((k) => (out[k] = load(o[k]))); return out; };
    if (!spec) { F.images = null; F.key = ''; return; }
    const iris = spec.iris;
    F.images = {
      iris: typeof iris === 'string' || (iris && !(iris.constructor === Object)) ? { '*': load(iris) } : map(iris),
      full: map(spec.full), highlight: spec.highlight, ready,
    };
    F.key = '';
  }
  function eyeImagesFor(F) {
    const E = F.images;
    if (!E) return null;
    const iris = E.iris[F.colorKey] || E.iris['*'];
    const full = {};
    Object.keys(E.full).forEach((k) => { if (E.ready(E.full[k])) full[k] = E.full[k]; });
    return { iris: E.ready(iris) ? iris : null, full: Object.keys(full).length ? full : null, highlight: E.highlight };
  }

  global.HumanoidCore = {
    version: '2026.10.10',
    HANDS,
    drawAnimeEyes: drawEyes, EYE_SIZE: { width: EYE_W, height: EYE_H, res: RES }, FACE_EXPRESSIONS, IRIS_STYLES,
    STANDARD_BASE,
    STANDARD_SIDE,
    makeUtils,

    /**
     * spec(キャラクターの定義):
     *   name, scale(既定 2.4), ankleHeight(既定 0.07)
     *   joints: { base, side, extra }      関節表(省略時は標準の人型。extra で追加: 例 バイザー)
     *   materials(ctx)                     ctx.M にマテリアルを追加・上書き
     *   noOutline: ['glow', ...]          輪郭線を付けないマテリアル名
     *   buildHand(ctx, side)               手の形状を差し替えるとき(省略時は標準の籠手)
     *   build(ctx)                         体の形状。ctx.items / ctx.strands / ctx.cape / ctx.colliders を設定
     *   poses: { idle: {root, j, feet}, ... }  静止ポーズ(度)。idle は必須
     *   modes(h)                           追加・上書きするモーション { name: (P, t) => {...} }
     *   actions: { name: { dur, next } }   終わると next へ戻るモーション
     *   linked(ctx)                        連動パーツ(肩当てなど)を毎フレーム合わせる
     *   colors: { id: { label, steel, trim, glow, paint, plume, ... } }
     *   applyColor(ctx, v)                 色替えでキャラ固有に行う処理(マントの柄など)
     *   api(ctx)                           公開 API に追加するもの
     *   update(ctx, dt, time, pose)        毎フレームの追加処理
     *   handStyle: { scale, armor, cuff, glow, glove, knuckle, plate }  標準の手の作り
     *   face: true | { draw, expressions, irisStyles, iris, width, height, res }  キャンバスに描く目(M.eyes を貼る形状はキャラが作る)
     *   trailWidth(既定 0.22)/ trailGain(既定 0.75)  武器の軌跡の幅(刃の長さに対する割合)と明るさ
     *   jump: { height, flip, tuck } | false  共通の跳躍(既定 高さ 0.75 m・前宙 360°)
     */
    create(THREE, parentNode, options, spec) {
      options = options || {};
      const U = makeUtils(THREE);
      const { V3, clamp, lerp, smooth, ease, C, D2R, R2D, add } = U;
      const SCALE = options.scale !== undefined ? options.scale : spec.scale !== undefined ? spec.scale : 2.4;
      const ANKLE_H = spec.ankleHeight !== undefined ? spec.ankleHeight : 0.07;
      const gk = options.glowIntensity !== undefined ? options.glowIntensity : 1;
      const GLOWC = C(0x2fa4ff); // 現在の発光色(カラーバリエーションで変わる)
      const M = standardMaterials(THREE, U, gk, GLOWC);

      /* ---------- 骨格 ---------- */
      const jdef = spec.joints || {};
      const BASE = (jdef.base || STANDARD_BASE).concat(jdef.extra || []);
      const SIDE = jdef.side || STANDARD_SIDE;
      const DEFS = BASE.slice();
      ['L', 'R'].forEach((s) => {
        const m = s === 'L' ? 1 : -1;
        SIDE.forEach((d) => {
          const lim = Object.assign({}, d[3]);
          if (m < 0) {
            if (lim.y) lim.y = [-lim.y[1], -lim.y[0]];
            if (lim.z) lim.z = [-lim.z[1], -lim.z[0]];
          }
          const parent = BASE.some((b) => b[0] === d[1]) ? d[1] : d[1] + '_' + s;
          DEFS.push([d[0] + '_' + s, parent, [d[2][0] * m, d[2][1], d[2][2]], lim, (m > 0 ? '左' : '右') + d[4]]);
        });
      });
      const LEGS = ['hip', 'knee', 'ankle', 'toe'];

      const root = new THREE.Group(); // 外側(呼び出し側が置く)。縮尺はかけない
      root.name = spec.name || 'Humanoid';
      if (parentNode) parentNode.add(root);
      const model = new THREE.Group(); // 縮尺 SCALE。ここから下が体
      model.scale.setScalar(SCALE);
      root.add(model);
      const figure = new THREE.Group(); // 向き(回転技など)
      model.add(figure);
      const fx = new THREE.Group(); // マント・毛の束・軌跡の物理空間(単位 m)
      fx.scale.setScalar(SCALE);
      root.add(fx);

      const J = {}, JOINTS = [], markers = [];
      const markerGeo = new THREE.SphereGeometry(0.022, 16, 8);
      DEFS.forEach((d) => {
        const g = new THREE.Group();
        g.name = d[0];
        g.position.set(d[2][0], d[2][1], d[2][2]);
        (d[1] ? J[d[1]] : figure).add(g);
        J[d[0]] = g;
        const mk = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: 0x7fd8ff, depthTest: false, transparent: true, opacity: 0.9 }));
        mk.renderOrder = 999; mk.visible = false; mk.userData.joint = d[0];
        g.add(mk); markers.push(mk);
        const lim = { x: d[3].x || [0, 0], y: d[3].y || [0, 0], z: d[3].z || [0, 0] };
        JOINTS.push({ name: d[0], label: d[4], lim, rest: V3(d[2][0], d[2][1], d[2][2]), obj: g });
      });
      const JL = {};
      JOINTS.forEach((j) => (JL[j.name] = j));
      const isLeg = (n) => n.indexOf('_') > 0 && LEGS.indexOf(n.split('_')[0]) >= 0;

      // キャラクター側に渡す作業用のコンテキスト
      const ctx = {
        THREE, U, M, J, JL, JOINTS, root, model, figure, fx, options, GLOWC, gk, markers,
        ex: {},             // 連動パーツなど、キャラ固有の部品置き場
        colliders: [],      // マント用の球コライダー { obj, c:[x,y,z], r }
        hands: {},
        items: {},          // { R: { name, obj, trail: { base, tip } }, L: {...} } 手に持つもの
        reach: {},          // 手を伸ばす目標 { 名前: Object3D }(ポーズの reach: { L: '名前' } で使う)
        strands: [],        // 毛の束 { anchor: 'head', points: [[x,y,z]...], width, mat, stiff }
        cape: { anchor: 'chest' }, // マント(null で無し)。pins(u) で上端の固定点を変えられる
      };
      /* ---------- 顔(spec.face): キャンバスに描く目 ----------
         M.eyes(目の絵の素材)を用意し、表情・まばたき・技の間の表情・瞳の模様・画像差し替えを受け持つ。
         目の絵を貼る形状はキャラ側が M.eyes で作る */
      let face = null;
      if (spec.face) {
        const fs = spec.face === true ? {} : spec.face;
        face = {
          draw: fs.draw || drawEyes, expressions: fs.expressions || FACE_EXPRESSIONS, irisStyles: fs.irisStyles || IRIS_STYLES,
          iris: fs.iris || ['#2a1a5a', '#6a4ad8', '#c8b4ff'], expr: 'normal', blinkOn: options.blink !== false,
          irisStyle: 'normal', colorKey: null, images: null, imgVer: 0, key: '', nextBlink: 2, blinkT: 0, autoExpr: null, autoLive: 0,
        };
        if (face.expressions.indexOf(options.expr) >= 0) face.expr = options.expr;
        if (face.irisStyles.indexOf(options.irisStyle) >= 0) face.irisStyle = options.irisStyle;
        face.canvas = document.createElement('canvas');
        face.canvas.width = (fs.width || EYE_W) * (fs.res || RES); face.canvas.height = (fs.height || EYE_H) * (fs.res || RES);
        face.tex = U.srgbTex(new THREE.CanvasTexture(face.canvas));
        M.eyes = new THREE.MeshBasicMaterial({ map: face.tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, toneMapped: false });
        M.eyes.color.setScalar(0.92);
        ctx.face = face;
        if (options.eyeImages) setEyeImages(face, options.eyeImages);
      }
      // まばたき(数秒おき。ときどき二度まばたき)と描き直し(見た目が変わったときだけ)
      function updateFace(dt) {
        if (!face) return;
        face.nextBlink -= dt;
        if (face.nextBlink <= 0) { face.blinkT = 0.15; face.nextBlink = 2.5 + Math.random() * 3; if (Math.random() < 0.2) face.nextBlink = 0.3; }
        let open = 1;
        if (face.blinkT > 0) { face.blinkT -= dt; open = Math.abs(Math.cos(Math.PI * Math.max(0, face.blinkT) / 0.15)); }
        if (!face.blinkOn) open = 1;
        let expr = face.expr;
        if (face.autoLive > 0) { face.autoLive--; expr = face.autoExpr; } // 技の間の表情
        const key = [expr, open.toFixed(1), face.iris.join(), face.irisStyle, face.colorKey, face.imgVer].join('|');
        if (key === face.key) return;
        face.key = key;
        face.draw(face.canvas.getContext('2d'), face.iris, expr, open, { style: face.irisStyle, images: eyeImagesFor(face) });
        face.tex.needsUpdate = true;
      }
      if (spec.materials) spec.materials(ctx);
      const NO_OUTLINE = ['glow', 'glowSoft', 'blade', 'bladeCore', 'slit'].concat(spec.noOutline || []).map((k) => M[k]).filter(Boolean);

      /* ---------- 手(3 節の指 + 親指)。-Y に垂れ、手のひらは体の側(-m·X)を向く ---------- */
      // 手の作り: scale(大きさ)/ armor(甲と指の装甲)/ cuff(手首の籠手)/ glow(甲の発光)/ glove・knuckle(手袋と関節の素材名)
      const HS = Object.assign({ scale: 1, armor: true, cuff: true, glow: true, glove: 'suit', knuckle: 'joint', plate: 'steel' }, spec.handStyle || {});
      function buildStandardHand(s) {
        const m = s === 'L' ? 1 : -1;
        const wr = new THREE.Group(); // 手の大きさはこのグループで変える(握り点も一緒に動く)
        wr.scale.setScalar(HS.scale);
        J['wrist_' + s].add(wr);
        const G = M[HS.glove], K = M[HS.knuckle], PL = M[HS.plate];
        const h = { side: m, fingers: [], thumb: [], root: wr };
        if (HS.cuff) add(wr, U.lathe([[0.05, 0.0], [0.057, -0.025], [0.064, -0.042]]), PL);
        add(wr, U.sphere(0.03), K, [0, -0.012, 0]);
        add(wr, U.rbox(0.034, 0.08, 0.088, 0.012), G, [0, -0.062, 0]);
        if (HS.armor) {
          add(wr, U.rbox(0.075, 0.072, 0.012, 0.008), PL, [m * 0.022, -0.06, 0], [0, Math.PI / 2, 0]);
          add(wr, new THREE.BoxGeometry(0.004, 0.012, 0.07), M.gold, [m * 0.03, -0.028, 0]);
        }
        if (HS.glow) add(wr, new THREE.BoxGeometry(0.004, 0.04, 0.008), M.glow, [m * 0.03, -0.063, 0]);
        add(wr, U.cylZ(0.012, 0.088), K, [0, -0.1, 0]);
        const zs = [0.031, 0.0105, -0.0105, -0.031], ks = [0.95, 1.05, 1.0, 0.85];
        const digit = (parent, pos, segs, r) => {
          const nodes = [];
          let cur = new THREE.Group();
          cur.position.set(pos[0], pos[1], pos[2]);
          parent.add(cur);
          segs.forEach((len, i) => {
            if (i > 0) { const g = new THREE.Group(); g.position.y = -segs[i - 1]; cur.add(g); cur = g; }
            add(cur, U.sphere(r * 1.05, 12, 8), K);
            const rr = r * (1 - i * 0.07);
            add(cur, U.capsule(rr, Math.max(0.001, len - rr * 1.6)), G, [0, -len / 2, 0]);
            if (HS.armor) add(cur, U.rbox(0.007, len * 0.78, rr * 1.9, 0.003), PL, [m * rr * 0.8, -len / 2, 0]); // 指の甲の装甲
            nodes.push(cur);
          });
          return nodes;
        };
        for (let i = 0; i < 4; i++) h.fingers.push(digit(wr, [0, -0.104, zs[i]], [0.034 * ks[i], 0.025 * ks[i], 0.021 * ks[i]], 0.0098));
        add(wr, U.sphere(0.022), G, [-m * 0.012, -0.05, 0.034], 0, [1, 1.3, 1]);
        h.thumb = digit(wr, [-m * 0.014, -0.045, 0.045], [0.03, 0.024, 0.02], 0.0105);
        // 握る点: 指を曲げたときに柄が通る位置(柄の軸は手の Z)
        h.grip = new THREE.Object3D();
        h.grip.position.set(-m * 0.03, -0.112, 0);
        wr.add(h.grip);
        return h;
      }
      ['L', 'R'].forEach((s) => (ctx.hands[s] = spec.buildHand ? spec.buildHand(ctx, s) : buildStandardHand(s)));
      function poseHand(s, c, th, sp) {
        const h = ctx.hands[s], m = h.side;
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

      /* ---------- キャラクター固有の形状 ---------- */
      spec.build(ctx);
      const ex = ctx.ex, colliders = ctx.colliders, items = ctx.items;

      /* ---------- 輪郭線(背面を法線方向に太らせて描く) ---------- */
      const outlineU = { value: options.outlineWidth !== undefined ? options.outlineWidth : 0.005 };
      const outlineMat = new THREE.MeshBasicMaterial({ color: C(0x06080c), side: THREE.BackSide });
      outlineMat.onBeforeCompile = (sh) => {
        sh.uniforms.uOutline = outlineU;
        sh.vertexShader = 'uniform float uOutline;\n' + sh.vertexShader.replace(
          '#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(normal) * uOutline;');
      };
      const outlineTargets = [];
      model.traverse((o) => { if (o.isMesh && markers.indexOf(o) < 0 && NO_OUTLINE.indexOf(o.material) < 0) outlineTargets.push(o); });
      outlineTargets.forEach((o) => {
        const ol = new THREE.Mesh(o.geometry, outlineMat);
        ol.castShadow = false; ol.receiveShadow = false;
        o.add(ol);
      });
      function setOutline(on, width) {
        outlineMat.visible = !!on;
        if (width !== undefined) outlineU.value = width;
      }
      setOutline(options.outline !== false);

      /* ---------- ポーズ(角度は度。脚は IK なので feet=[x, z, 向き, 持ち上げ, つま先の傾き, 膝の開き]) ---------- */
      const STATIC = spec.poses;
      const JNAMES = JOINTS.map((j) => j.name);
      function newPose() {
        const P = { j: {}, root: [0, 0, 0], yaw: 0, flip: 0, feet: { L: [0.13, 0, 8, 0, 0, 0], R: [-0.13, 0, -8, 0, 0, 0] }, hand: {}, look: 0, trail: 0, reach: { L: null, R: null }, reachW: { L: 0, R: 0 } };
        JNAMES.forEach((n) => (P.j[n] = [0, 0, 0]));
        ['L', 'R'].forEach((s) => (P.hand[s] = { c: HANDS.relax.c.slice(), th: HANDS.relax.th, sp: HANDS.relax.sp }));
        return P;
      }
      function copyPose(Q, P) {
        JNAMES.forEach((n) => { const a = P.j[n] || [0, 0, 0]; Q.j[n][0] = a[0]; Q.j[n][1] = a[1]; Q.j[n][2] = a[2]; });
        for (let i = 0; i < 3; i++) Q.root[i] = P.root[i];
        Q.yaw = P.yaw; Q.flip = P.flip || 0; Q.look = P.look; Q.trail = P.trail;
        const pr = P.reach || {}, pw = P.reachW || {};
        Q.reach = { L: pr.L || null, R: pr.R || null }; Q.reachW = { L: pw.L || 0, R: pw.R || 0 };
        ['L', 'R'].forEach((s) => {
          Q.feet[s] = P.feet[s].slice(); while (Q.feet[s].length < 6) Q.feet[s].push(0);
          Q.hand[s] = { c: P.hand[s].c.slice(), th: P.hand[s].th, sp: P.hand[s].sp };
        });
      }
      function clonePose(P) { const Q = newPose(); copyPose(Q, P); return Q; }
      function fromStatic(P, name) {
        const S = STATIC[name];
        JNAMES.forEach((n) => { const a = S.j[n] || [0, 0, 0]; P.j[n][0] = a[0]; P.j[n][1] = a[1]; P.j[n][2] = a[2]; });
        for (let i = 0; i < 3; i++) P.root[i] = S.root[i];
        P.flip = S.flip || 0;
        // 前のモードの手の目標・手の形を持ち越さない(ポーズを毎フレーム同じ入れ物に書くため)
        P.reach.L = P.reach.R = null; P.reachW.L = P.reachW.R = 0;
        ['L', 'R'].forEach((s) => { const hs = (S.hand && S.hand[s]) || HANDS.relax; P.hand[s] = { c: hs.c.slice(), th: hs.th, sp: hs.sp }; });
        P.trail = 0;
        ['L', 'R'].forEach((s) => { P.feet[s] = S.feet[s].slice(); while (P.feet[s].length < 6) P.feet[s].push(0); });
        return P;
      }
      // 2 つのポーズの補間。足が移動するときは自動で持ち上げる(ステップ)
      function blendPose(out, A, B, k) {
        JNAMES.forEach((n) => { for (let i = 0; i < 3; i++) out.j[n][i] = lerp(A.j[n][i], B.j[n][i], k); });
        for (let i = 0; i < 3; i++) out.root[i] = lerp(A.root[i], B.root[i], k);
        out.yaw = lerp(A.yaw, B.yaw, k); out.flip = lerp(A.flip || 0, B.flip || 0, k); out.look = lerp(A.look, B.look, k); out.trail = lerp(A.trail, B.trail, k);
        ['L', 'R'].forEach((s) => {
          out.reach[s] = B.reach[s] || A.reach[s];
          out.reachW[s] = lerp(A.reach[s] ? A.reachW[s] : 0, B.reach[s] ? B.reachW[s] : 0, k);
        });
        ['L', 'R'].forEach((s) => {
          const a = A.feet[s], b = B.feet[s], o = out.feet[s];
          for (let i = 0; i < 6; i++) o[i] = lerp(a[i] || 0, b[i] || 0, k);
          o[3] += Math.sin(Math.PI * k) * Math.min(0.12, Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.45);
          const ha = A.hand[s], hb = B.hand[s], ho = out.hand[s];
          for (let i = 0; i < 4; i++) ho.c[i] = lerp(ha.c[i], hb.c[i], k);
          ho.th = lerp(ha.th, hb.th, k); ho.sp = lerp(ha.sp, hb.sp, k);
        });
        return out;
      }
      const addJ = (P, n, x, y, z) => { P.j[n][0] += x; P.j[n][1] += y || 0; P.j[n][2] += z || 0; };
      function breathe(P, t, k) {
        k = k === undefined ? 1 : k;
        const b = Math.sin(t * 1.7) * k;
        addJ(P, 'chest', 1.4 * b); addJ(P, 'shoulder_L', 0, 0, 1.2 * b); addJ(P, 'shoulder_R', 0, 0, -1.2 * b);
        P.root[1] += 0.004 * b;
        addJ(P, 'head', Math.sin(t * 0.9) * 1.2 * k);
      }
      const tmpA = newPose(), tmpB = newPose();
      // キーフレーム列 [[時刻, 静止ポーズ名], ...] を t で再生
      function seq(P, t, frames) {
        let i = 0;
        while (i < frames.length - 2 && t >= frames[i + 1][0]) i++;
        const a = frames[i], b = frames[i + 1];
        blendPose(P, fromStatic(tmpA, a[1]), fromStatic(tmpB, b[1]), ease(clamp((t - a[0]) / (b[0] - a[0]), 0, 1)));
      }
      const held = newPose();
      let rideT = null;

      /* ---------- 歩行・走行 ----------
         片脚の周期を立脚(足が地面について後ろへ流れる)と遊脚(持ち上げて前へ運ぶ)に分ける。
         かかとから着地してつま先で蹴り出し、腰は上下・左右に揺れ、骨盤は脚と、肩は腕と逆にひねる */
      // 何も持っていない腕の自然な形(左基準。右は y・z を反転)
      const FREE_ARM = Object.assign({ shoulder: [4, 0, 8], elbow: [-14, 0, 0], forearm: [0, 8, 0], wrist: [-6, 0, 4] }, spec.freeArm);
      const freeW = { L: 0, R: 0 }; // 腕が空いている度合い(持ち物の付け外しで滑らかに変わる)
      const armOf = (P, s, part) => P.j[part + '_' + s];
      function freeArm(P, s, w, swing, bend) {
        if (w <= 0.001) return;
        const m = s === 'L' ? 1 : -1;
        ['shoulder', 'elbow', 'forearm', 'wrist'].forEach((part) => {
          const a = armOf(P, s, part), v = FREE_ARM[part];
          a[0] = lerp(a[0], v[0], w); a[1] = lerp(a[1], v[1] * m, w); a[2] = lerp(a[2], v[2] * m, w);
        });
        armOf(P, s, 'shoulder')[0] += (swing || 0) * w;
        armOf(P, s, 'elbow')[0] -= (bend || 0) * w;
        const h = P.hand[s], r = HANDS.relax;
        for (let i = 0; i < 4; i++) h.c[i] = lerp(h.c[i], r.c[i], w);
        h.th = lerp(h.th, r.th, w); h.sp = lerp(h.sp, r.sp, w);
      }
      function legGeom() {
        const L1 = J.knee_L.position.length(), L2 = J.ankle_L.position.length();
        const hipH = JL.hips.rest.y + J.hip_L.position.y - ANKLE_H; // 立った時の股関節から足首までの高さ
        const toe = J.toe_L ? J.toe_L.position : V3(0, -0.045, 0.09);
        return { L: L1 + L2, hipH, tz: toe.z, ty: -toe.y };
      }
      // つま先を支点にかかとを上げた時 / かかとを支点につま先を上げた時の足首の持ち上がり
      const toeLift = (g, p) => g.ty * (Math.cos(p * D2R) - 1) + g.tz * Math.sin(p * D2R);
      const heelLift = (g, q) => ANKLE_H * (Math.cos(q * D2R) - 1) + g.tz * 0.6 * Math.sin(q * D2R);
      function gait(P, t, o) {
        const g = legGeom();
        const ph = (t * o.freq) % 1, TAU = Math.PI * 2;
        const stride = o.stride * g.L, half = stride / 2;
        // 前後いっぱいに足を出しても脚が伸び切らないよう腰を下げる
        const drop = g.hipH - Math.sqrt(Math.max(0.01, g.L * g.L * 0.985 - half * half)) + o.crouch * g.L;
        const width = Math.abs(STATIC.idle.feet.L[0]) * o.width;
        ['L', 'R'].forEach((s, i) => {
          const m = s === 'L' ? 1 : -1;
          const p = (ph + i * 0.5) % 1;
          let z, lift, pitch;
          if (p < o.duty) { // 立脚: 前から後ろへ等速で流れる
            const u = p / o.duty;
            z = half * (1 - 2 * u);
            const hs = 1 - smooth(u / 0.18), ho = smooth((u - o.heelOff) / (1 - o.heelOff));
            pitch = -o.heel * hs + o.toeOff * ho;
            lift = (pitch < 0 ? heelLift(g, -pitch) : toeLift(g, pitch));
          } else { // 遊脚: 持ち上げて前へ。蹴り出しの傾きを戻し、着地前につま先を上げる
            const u = (p - o.duty) / (1 - o.duty);
            z = -half + stride * ease(u);
            const toePart = o.toeOff * (1 - smooth(u / 0.45)), heelPart = o.heel * smooth((u - 0.55) / 0.45);
            pitch = toePart - heelPart;
            lift = o.lift * g.L * Math.sin(Math.PI * Math.pow(u, 0.75)) + Math.max(toeLift(g, toePart), heelLift(g, heelPart));
          }
          P.feet[s] = [m * width, z + o.zOff * g.L, m * o.toeOut, lift, pitch, 0];
        });
        // 左脚の立脚のまん中 = ph = duty/2。重心はそこで(走りは最も低く / 歩きは最も高く)
        const mid = o.duty / 2;
        const bobW = 0.5 - 0.5 * Math.cos(TAU * (2 * ph - 2 * mid)); // 立脚のまん中で 0
        const bob = o.run ? bobW * o.bob * g.L : (1 - bobW) * o.bob * g.L;
        const sw = Math.cos(TAU * (ph - mid)); // +1: 左脚に乗る
        P.root = [sw * o.sway * g.L, -drop + bob - (o.low || 0) * g.L, 0];
        const fwd = Math.cos(TAU * ph); // +1: 左脚が前(右腕が前)
        addJ(P, 'hips', o.lean * 0.4, -o.twist * fwd, o.drop * sw);
        addJ(P, 'spine', o.lean * 0.6 + o.pitch * Math.cos(TAU * 2 * (ph - mid)), o.twist * 0.6 * fwd, -o.drop * 0.7 * sw);
        addJ(P, 'chest', o.lean * 0.3, o.twist * 0.9 * fwd, -o.drop * 0.3 * sw);
        addJ(P, 'neck', -o.lean * 0.5, -o.twist * 0.6 * fwd, 0);
        addJ(P, 'head', -o.lean * 0.4, -o.twist * 0.3 * fwd, 0);
        // 腕は脚と逆に振る(少し遅れて)。前に振るほど肘を曲げる
        const af = Math.cos(TAU * (ph - 0.04));
        ['L', 'R'].forEach((s) => {
          const k = s === 'L' ? -af : af; // +1: この腕が前
          const w = freeW[s];
          if (o.arms === false) return;
          freeArm(P, s, w, -o.arm * k + o.armBase, o.elbow + o.elbowSwing * Math.max(0, k));
          addJ(P, 'shoulder_' + s, -o.arm * 0.3 * k * (1 - w)); // 持ち物のある腕は控えめに
          if (o.run && w > 0) {
            const h = P.hand[s], f = HANDS.fist;
            for (let i = 0; i < 4; i++) h.c[i] = lerp(h.c[i], f.c[i] * 0.75, w);
            h.th = lerp(h.th, 0.7, w);
          }
        });
      }
      const WALK = { freq: 0.95, stride: 0.62, duty: 0.6, lift: 0.1, heel: 14, toeOff: 26, heelOff: 0.62, width: 0.75, toeOut: 7, zOff: 0.02, crouch: 0.012,
        bob: 0.022, sway: 0.03, twist: 7, drop: 3.5, lean: 3, pitch: 1, arm: 20, armBase: 2, elbow: 10, elbowSwing: 18, run: false };
      const RUN = { freq: 1.4, stride: 0.95, duty: 0.36, lift: 0.3, heel: 6, toeOff: 30, heelOff: 0.45, width: 0.6, toeOut: 4, zOff: 0.06, crouch: 0.05,
        bob: 0.05, sway: 0.012, twist: 12, drop: 3, lean: 11, pitch: 2.5, arm: 32, armBase: 6, elbow: 78, elbowSwing: 12, run: true };

      /* ---------- 跳躍(共通) ---------- */
      const win = (t, a, b) => smooth((t - a) / (b - a)); // a→b で 0→1
      const bump = (t, a, b) => (t > a && t < b ? Math.sin(Math.PI * (t - a) / (b - a)) : 0);
      // 宙に浮く: 腰を hgt だけ上げ、足は tuck だけさらに引き上げる(膝を抱える)
      function air(P, hgt, tuck) {
        P.root[1] += hgt;
        ['L', 'R'].forEach((s) => { const f = P.feet[s]; f[3] = Math.max(f[3], 0) + hgt + tuck * 0.34; f[1] += tuck * 0.1; f[4] = 20 * tuck; });
      }
      // しゃがみ込み(踏み切り前・着地): 腰を落として前へ倒す
      function squat(P, c) {
        P.root[1] -= 0.26 * c; P.root[2] -= 0.03 * c;
        addJ(P, 'hips', 28 * c); addJ(P, 'spine', 10 * c); addJ(P, 'neck', -14 * c); addJ(P, 'head', -10 * c);
      }
      // 技の間だけ表情を変える(spec.face があるとき)
      const mood = (e) => { if (face) { face.autoExpr = e; face.autoLive = 3; } };
      const JUMP = spec.jump === false ? null : Object.assign({ height: 0.75, flip: 360, tuck: 1 }, spec.jump);
      // しゃがんで腕を引き、つま先で踏み切る。宙では膝を抱えて(flip があれば前宙)、着地で衝撃を吸収する
      function jump(P, t) {
        fromStatic(P, 'idle');
        freeArm(P, 'L', freeW.L); freeArm(P, 'R', freeW.R);
        const c = t < 0.26 ? win(t, 0, 0.26) : 1 - win(t, 0.26, 0.36);
        const u = clamp((t - 0.33) / 0.8, 0, 1), hgt = t > 0.33 && t < 1.13 ? 4 * u * (1 - u) * JUMP.height : 0;
        const tuck = bump(t, 0.42, 1.08) * JUMP.tuck;
        const land = t < 1.13 ? 0 : t < 1.24 ? win(t, 1.13, 1.24) : 1 - win(t, 1.24, 1.75);
        squat(P, c + land * 0.85);
        air(P, hgt, tuck);
        P.flip = JUMP.flip * ease(clamp((t - 0.45) / 0.58, 0, 1));
        addJ(P, 'hips', 30 * tuck); addJ(P, 'spine', 22 * tuck); addJ(P, 'neck', 10 * tuck);
        // 腕(空いている腕ほど大きく): 踏み切り前に後ろへ引き、踏み切りで振り上げ、宙では膝を抱える
        const up = bump(t, 0.24, 0.5);
        ['L', 'R'].forEach((s) => {
          const w = 0.45 + 0.55 * freeW[s];
          addJ(P, 'shoulder_' + s, w * (45 * c - 130 * up - 40 * tuck), 0, (s === 'L' ? 1 : -1) * 10 * up * w);
          addJ(P, 'elbow_' + s, -95 * tuck * w);
        });
        if (t > 0.26 && t < 0.38) ['L', 'R'].forEach((s) => (P.feet[s][4] = 30 * bump(t, 0.26, 0.38))); // つま先で蹴る
        P.look = 0;
      }

      const MODES = {
        idle: (P, t) => { fromStatic(P, 'idle'); freeArm(P, 'L', freeW.L); freeArm(P, 'R', freeW.R); breathe(P, t); P.look = 1; },
        // その場歩き・走り(gait 参照)。脚は IK で接地を保つ
        walk: (P, t) => { fromStatic(P, 'idle'); gait(P, t, Object.assign({}, WALK, spec.walk)); P.look = 0.35; },
        run: (P, t) => { fromStatic(P, 'idle'); gait(P, t, Object.assign({}, RUN, spec.run)); P.look = 0; },
        hold: (P) => copyPose(P, held), // 関節エディタで手動編集中
        jump: (P, t) => (JUMP ? jump(P, t) : fromStatic(P, 'idle')),
        // 乗車: 腰を座席の目印に置き、脚 IK で足をステップへ。腕は applyPose で IK によりグリップへ
        ride: (P, t) => {
          fromStatic(P, 'idle');
          const st = Object.assign({ hips: [24, 0, 0], spine: [14, 0, 0], chest: [8, 0, 0], neck: [-16, 0, 0], head: [-20, 0, 0], kneeOut: 0, seatLift: 0.12 }, rideT && rideT.style);
          ['hips', 'spine', 'chest', 'neck', 'head'].forEach((n) => (P.j[n] = st[n].slice()));
          breathe(P, t, 0.5);
          P.look = 0.25;
          ['L', 'R'].forEach((s) => { P.hand[s] = { c: HANDS.grip.c.slice(), th: HANDS.grip.th, sp: 0 }; });
          if (!rideT) return;
          figure.updateWorldMatrix(true, false);
          const seat = figure.worldToLocal(rideT.seat.getWorldPosition(V3(0, 0, 0)));
          P.root = [seat.x, seat.y + st.seatLift - JL.hips.rest.y, seat.z + 0.02];
          ['L', 'R'].forEach((s) => {
            const pg = figure.worldToLocal(rideT.pegs[s].getWorldPosition(V3(0, 0, 0)));
            P.feet[s] = [pg.x, pg.z - 0.09, 0, pg.y + 0.07 - ANKLE_H, 15, (s === 'L' ? 1 : -1) * st.kneeOut];
          });
        },
      };
      const helpers = { fromStatic, breathe, seq, addJ, ease, clamp, lerp, smooth, newPose, copyPose, HANDS, gait, WALK, RUN, freeArm, freeW, ctx, air, squat, mood, win, bump };
      if (spec.modes) Object.assign(MODES, spec.modes(helpers));
      const ACTIONS = Object.assign(JUMP ? { jump: { dur: 1.75, next: 'idle', blend: 0.2 } } : {}, spec.actions);
      if (!JUMP) delete MODES.jump;

      /* ---------- 状態 ---------- */
      const state = { ik: options.ik !== false, physics: options.physics !== false, look: options.look !== false, pulse: options.glowPulse !== false };
      const equip = { L: true, R: true };
      ['L', 'R'].forEach((s) => { const it = items[s]; if (it && options[it.name] === false) equip[s] = false; });
      const handOverride = { L: null, R: null };
      const freeTarget = (s) => (items[s] && equip[s] && !(handOverride[s] && handOverride[s] !== 'grip') ? 0 : 1);
      ['L', 'R'].forEach((s) => (freeW[s] = freeTarget(s)));
      let currentMode = MODES[options.mode] ? options.mode : 'idle', mt = 0;
      const cur = newPose(), from = newPose(), target = newPose();
      let blendT = 1, blendDur = 0.5, external = null, lookYaw = 0, lookPitch = 0;
      let rideSaved = null, armW = 0, wind = 0;
      MODES[currentMode](cur, 0);

      function setMode(m) {
        if (!MODES[m]) return;
        copyPose(from, cur);
        from.yaw = ((from.yaw % 360) + 540) % 360 - 180; // 一回転した後の -360 を 0 に戻す
        blendT = 0;
        blendDur = ACTIONS[m] ? (ACTIONS[m].blend || 0.25) : 0.55;
        mt = 0;
        currentMode = m;
        external = null;
      }

      /* ---------- IK ---------- */
      const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
      const _m = new THREE.Matrix4(), _e = new THREE.Euler(), XA = V3(1, 0, 0);
      // 2 ボーン解析 IK: 足首を目標位置に置き、膝を足先の方向(+ 膝の開き)へ曲げる。足裏は地面に合わせる
      function solveLeg(s, P) {
        const hip = J['hip_' + s], knee = J['knee_' + s], ankle = J['ankle_' + s], toe = J['toe_' + s], hips = J.hips;
        const L1 = knee.position.length(), L2 = ankle.position.length();
        const f = P.feet[s];
        const tgt = figure.localToWorld(_v.set(f[0], ANKLE_H + Math.max(0, f[3]), f[1]));
        hips.worldToLocal(tgt);
        const d = tgt.sub(hip.position);
        const dist = clamp(d.length(), 0.08, (L1 + L2) * 0.9995);
        const aim = d.normalize().clone();
        const yaw = f[2] * D2R;
        const py = (f[2] + (f[5] || 0)) * D2R;
        const pole = V3(Math.sin(py) * 0.9, 0, Math.cos(py)).normalize();
        pole.applyQuaternion(figure.getWorldQuaternion(_q));
        pole.applyQuaternion(hips.getWorldQuaternion(_q2).invert());
        const perp = pole.sub(aim.clone().multiplyScalar(pole.dot(aim))).normalize();
        const a = Math.acos(clamp((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1));
        const thigh = aim.clone().multiplyScalar(Math.cos(a)).add(perp.clone().multiplyScalar(Math.sin(a)));
        const yAx = thigh.clone().negate();
        const zAx = perp.clone().sub(thigh.clone().multiplyScalar(perp.dot(thigh))).normalize();
        const xAx = V3(0, 0, 0).crossVectors(yAx, zAx);
        hip.quaternion.setFromRotationMatrix(_m.makeBasis(xAx, yAx, zAx));
        knee.quaternion.setFromAxisAngle(XA, Math.PI - Math.acos(clamp((L1 * L1 + L2 * L2 - dist * dist) / (2 * L1 * L2), -1, 1)));
        const want = figure.getWorldQuaternion(_q).multiply(_q2.setFromEuler(_e.set(f[4] * D2R, yaw, 0, 'YXZ')));
        ankle.quaternion.copy(knee.getWorldQuaternion(_q3).invert().multiply(want));
        if (toe) toe.rotation.set(clamp(-Math.max(0, f[4]), -45, 30) * D2R, 0, 0); // つま先立ちでも指先は地面に
        [hip, knee, ankle, toe].forEach((o) => {
          if (!o) return;
          const a3 = P.j[o.name];
          a3[0] = o.rotation.x * R2D; a3[1] = o.rotation.y * R2D; a3[2] = o.rotation.z * R2D;
        });
      }
      // 腕の 2 ボーン IK(乗車用): 握り点をグリップに合わせ、手の甲を上・人差し指を内側へ向ける
      const _a = V3(0, 0, 0), _b = V3(0, 0, 0), _c = V3(0, 0, 0), _hq = new THREE.Quaternion(), _ws = V3(0, 0, 0);
      // 手を目標に届かせる腕 IK。目標の X 軸 = 握る棒の向き、Y 軸 = 手の甲を向ける側
      function solveArm(s, P, w, grip) {
        const m = s === 'L' ? 1 : -1;
        const chest = J.chest, sh = J['shoulder_' + s], el = J['elbow_' + s], fa = J['forearm_' + s], wr = J['wrist_' + s];
        const gq = grip.getWorldQuaternion(_q);
        const Xb = _a.set(1, 0, 0).applyQuaternion(gq), Up = _b.set(0, 1, 0).applyQuaternion(gq);
        const Zh = Xb.clone().multiplyScalar(-m), Xh = Up.clone().multiplyScalar(m).normalize();
        const Yh = V3(0, 0, 0).crossVectors(Zh, Xh);
        _hq.setFromRotationMatrix(_m.makeBasis(Xh, Yh, Zh));
        model.getWorldScale(_ws);
        // 握り点の手首からのずれ(手の大きさ・縮尺込み)を、目標の手の向きで戻す
        const hg = ctx.hands[s].grip;
        wr.updateWorldMatrix(true, false); hg.updateWorldMatrix(true, false);
        const off = wr.worldToLocal(hg.getWorldPosition(V3(0, 0, 0))).multiplyScalar(_ws.x);
        const wristW = grip.getWorldPosition(_c).sub(off.applyQuaternion(_hq));
        const tl = chest.worldToLocal(wristW.clone());
        const L1 = el.position.length(), L2 = wr.position.length();
        const d = tl.sub(sh.position);
        const dist = clamp(d.length(), 0.05, (L1 + L2) * 0.999);
        const aim = d.normalize();
        const pole = V3(m * 0.75, -0.45, -0.5).normalize();
        const perp = pole.sub(aim.clone().multiplyScalar(pole.dot(aim))).normalize();
        const a = Math.acos(clamp((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1));
        const upper = aim.clone().multiplyScalar(Math.cos(a)).add(perp.clone().multiplyScalar(Math.sin(a)));
        const yAx = upper.clone().negate();
        const zAx = perp.clone().sub(upper.clone().multiplyScalar(perp.dot(upper))).normalize().negate();
        const xAx = V3(0, 0, 0).crossVectors(yAx, zAx);
        sh.quaternion.slerp(_q2.setFromRotationMatrix(_m.makeBasis(xAx, yAx, zAx)), w);
        el.quaternion.slerp(_q2.setFromAxisAngle(XA, -(Math.PI - Math.acos(clamp((L1 * L1 + L2 * L2 - dist * dist) / (2 * L1 * L2), -1, 1)))), w);
        fa.quaternion.slerp(_q2.identity(), w);
        fa.updateWorldMatrix(true, false);
        wr.quaternion.slerp(fa.getWorldQuaternion(_q3).invert().multiply(_hq), w);
        [sh, el, fa, wr].forEach((o) => {
          const a3 = P.j[o.name];
          a3[0] = o.rotation.x * R2D; a3[1] = o.rotation.y * R2D; a3[2] = o.rotation.z * R2D;
        });
      }

      function syncLinked() { if (spec.linked) spec.linked(ctx); }
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
        // 向き(yaw)と宙返り(flip: 腰を中心に前へ回る。度)
        figure.rotation.set((P.flip || 0) * D2R, P.yaw * D2R, 0, 'YXZ');
        const fl = (P.flip || 0) * D2R;
        if (fl) { // 宙返りは腰を中心に回す(向きは従来どおり原点まわり)
          _v.set(P.root[0], JL.hips.rest.y + P.root[1], P.root[2]);
          figure.position.copy(_v).sub(_v.clone().applyAxisAngle(XA, fl)).applyAxisAngle(_v.set(0, 1, 0), P.yaw * D2R);
        } else figure.position.set(0, 0, 0);
        root.updateMatrixWorld(true);
        if (state.ik) { solveLeg('L', P); solveLeg('R', P); }
        if (rideT && armW > 0.001) { solveArm('L', P, armW, rideT.grips.L); solveArm('R', P, armW, rideT.grips.R); }
        else ['R', 'L'].forEach((s) => { // ポーズが指定した目標へ手を伸ばす(刀の両手持ちなど)
          const tg = P.reach[s] && ctx.reach[P.reach[s]];
          if (tg && P.reachW[s] > 0.001) { root.updateMatrixWorld(true); solveArm(s, P, P.reachW[s], tg); }
        });
        ['L', 'R'].forEach((s) => {
          const holding = items[s] && equip[s];
          const h = holding ? HANDS[items[s].hand || 'grip'] : handOverride[s] ? HANDS[handOverride[s]] : P.hand[s];
          poseHand(s, h.c, h.th, h.sp);
        });
        syncLinked();
        root.updateMatrixWorld(true);
      }

      /* ---------- 物理(fx 空間 = 単位 m) ---------- */
      const fxInv = new THREE.Matrix4(), relM = new THREE.Matrix4();
      const toFx = (obj) => relM.multiplyMatrices(fxInv, obj.matrixWorld);

      // マント: Verlet 積分の布。上端を胸に固定し、体の球コライダーと衝突させる
      const cape = ctx.cape && (function (cfg) {
        const cols = cfg.cols || 15, rows = cfg.rows || 22, length = cfg.length || 1.12, n = cols * rows;
        const anchor = J[cfg.anchor || 'chest'];
        const pinFn = cfg.pins || ((u) => [u * 0.27, 0.3 - u * u * 0.03, -0.07 - 0.11 * (1 - u * u)]);
        const pos = new Float32Array(n * 3), prev = new Float32Array(n * 3);
        const pinsLocal = [];
        for (let c = 0; c < cols; c++) { const p = pinFn((c / (cols - 1)) * 2 - 1); pinsLocal.push(V3(p[0], p[1], p[2])); }
        let top = 0;
        for (let c = 1; c < cols; c++) top += pinsLocal[c].distanceTo(pinsLocal[c - 1]);
        const dx = top / (cols - 1), dy = length / (rows - 1), flareK = cfg.flare !== undefined ? cfg.flare : 0.55;
        const Cn = [];
        const id = (r, c) => r * cols + c;
        for (let r = 0; r < rows; r++) {
          const flare = 1 + flareK * (r / (rows - 1));
          for (let c = 0; c < cols; c++) {
            if (c < cols - 1) Cn.push(id(r, c), id(r, c + 1), dx * flare);
            if (r < rows - 1) Cn.push(id(r, c), id(r + 1, c), dy);
            if (r < rows - 2) Cn.push(id(r, c), id(r + 2, c), dy * 2);
            if (r < rows - 1 && c < cols - 1) { const dd = Math.hypot(dx * flare, dy); Cn.push(id(r, c), id(r + 1, c + 1), dd, id(r, c + 1), id(r + 1, c), dd); }
          }
        }
        const CA = new Float32Array(Cn);
        const geo = new THREE.PlaneGeometry(1, 1, cols - 1, rows - 1);
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const mesh = new THREE.Mesh(geo, cfg.material || M.cloth);
        mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
        fx.add(mesh);
        const pins = pinsLocal.map(() => V3(0, 0, 0));
        const mkCol = (c) => ({ obj: c.obj, c: V3(c.c[0], c.c[1], c.c[2]), r: c.r, w: V3(0, 0, 0), rw: c.r });
        const cols3 = colliders.map(mkCol), colScale = V3(0, 0, 0);
        let extra = [], time = 0;
        const aInv = new THREE.Matrix4(), aM = new THREE.Matrix4(), tv = V3(0, 0, 0);
        const backY = cfg.topY !== undefined ? cfg.topY : 0.31;
        function updatePins() { aM.copy(toFx(anchor)); pinsLocal.forEach((p, i) => pins[i].copy(p).applyMatrix4(aM)); }
        function collide() {
          aInv.copy(aM).invert();
          const ground = -root.position.y / SCALE + 0.01;
          for (let i = cols; i < n; i++) {
            const k = i * 3;
            // 固定点の空間で「背中側・肩より下」に留める(高速回転で前に回り込まないように)
            tv.set(pos[k], pos[k + 1], pos[k + 2]).applyMatrix4(aInv);
            const zMax = -0.02 + Math.max(0, Math.abs(tv.x) - 0.24) * 1.2;
            if (tv.z > zMax || tv.y > backY) {
              tv.z = Math.min(tv.z, zMax); tv.y = Math.min(tv.y, backY);
              tv.applyMatrix4(aM);
              pos[k] = tv.x; pos[k + 1] = tv.y; pos[k + 2] = tv.z;
            }
            for (let j = 0; j < cols3.length + extra.length; j++) {
              const c = j < cols3.length ? cols3[j] : extra[j - cols3.length], r = c.rw + 0.018;
              const ddx = pos[k] - c.w.x, ddy = pos[k + 1] - c.w.y, ddz = pos[k + 2] - c.w.z;
              const d2 = ddx * ddx + ddy * ddy + ddz * ddz;
              if (d2 < r * r) {
                const s = r / (Math.sqrt(d2) || 1e-6);
                pos[k] = c.w.x + ddx * s; pos[k + 1] = c.w.y + ddy * s; pos[k + 2] = c.w.z + ddz * s;
              }
            }
            if (pos[k + 1] < ground) pos[k + 1] = ground;
          }
        }
        function step(dt) {
          time += dt;
          updatePins();
          // コライダーの中心と半径を fx 空間へ(乗り物など縮尺の違う物体にも対応)
          cols3.concat(extra).forEach((c) => {
            const mtx = toFx(c.obj);
            c.w.copy(c.c).applyMatrix4(mtx);
            c.rw = c.r * colScale.setFromMatrixColumn(mtx, 0).length();
          });
          const g = -9.8 * dt * dt, breeze = (0.6 + Math.sin(time * 0.7) * 0.4 + wind) * dt * dt, damp = 0.985;
          for (let i = cols; i < n; i++) {
            const k = i * 3, x = pos[k], y = pos[k + 1], z = pos[k + 2];
            const gust = Math.sin(time * 2.3 + i * 0.37) * 0.6;
            pos[k] += (x - prev[k]) * damp + gust * breeze * 0.4;
            pos[k + 1] += (y - prev[k + 1]) * damp + g;
            pos[k + 2] += (z - prev[k + 2]) * damp - breeze * (1 + gust);
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
          time = 0; // 風のゆらぎも最初から(撮影の再現性のため)
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
        return { mesh, reset, update, setExtra: (list) => { extra = (list || []).map(mkCol); } };
      })(ctx.cape);

      // 毛の束(羽飾り・髪・尾など): 形を保とうとするバネ付き Verlet 鎖を、平たいチューブで描く
      const strandGroup = new THREE.Group();
      fx.add(strandGroup);
      const RAD = 6, SUB = 3;
      const strands = ctx.strands.map((d) => {
        const rest = d.points.map((p) => V3(p[0], p[1], p[2]));
        const SEG = rest.length, nn = (SEG - 1) * SUB + 1;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nn * RAD * 3), 3));
        const idx = [];
        for (let i = 0; i < nn - 1; i++) for (let j = 0; j < RAD; j++) { const a = i * RAD + j, b = i * RAD + ((j + 1) % RAD); idx.push(a, a + RAD, b, b, a + RAD, b + RAD); }
        geo.setIndex(idx);
        const mesh = new THREE.Mesh(geo, d.mat || M.plume);
        mesh.castShadow = true; mesh.frustumCulled = false;
        strandGroup.add(mesh);
        return { anchor: J[d.anchor] || d.anchor, rest, mesh, n: nn, SEG, width: d.width || 0.03, stiff: d.stiff !== undefined ? d.stiff : 0.22, flat: d.flat || 0.45,
          p: rest.map((v) => v.clone()), q: rest.map((v) => v.clone()), lens: rest.slice(1).map((v, i) => v.distanceTo(rest[i])) };
      });
      const sw3 = V3(0, 0, 0), sM = new THREE.Matrix4();
      function updateStrands(dt, snap) {
        dt = Math.min(dt, 1 / 30);
        const g = -6 * dt * dt;
        strands.forEach((st) => {
          sM.copy(toFx(st.anchor));
          const p = st.p, q = st.q;
          for (let i = 0; i < st.SEG; i++) {
            sw3.copy(st.rest[i]).applyMatrix4(sM);
            if (i < 2 || snap || !state.physics) { p[i].copy(sw3); q[i].copy(sw3); continue; }
            const k = st.stiff * Math.pow(1 - i / st.SEG, 1.5) + 0.015;
            const v = p[i].clone().sub(q[i]).multiplyScalar(0.94);
            q[i].copy(p[i]);
            p[i].add(v).add(sw3.sub(p[i]).multiplyScalar(k));
            p[i].y += g;
            p[i].z -= wind * 0.5 * dt * dt; // 走行風
          }
          for (let it = 0; it < 3; it++) for (let i = 2; i < st.SEG; i++) {
            const a = p[i - 1], b = p[i], d = b.clone().sub(a), l = d.length() || 1e-6;
            if (i > 2) { const c = d.multiplyScalar(((l - st.lens[i - 1]) / l) * 0.5); a.add(c); b.sub(c); }
            else b.copy(a).add(d.multiplyScalar(st.lens[i - 1] / l));
          }
          const side = V3(1, 0, 0).transformDirection(sM);
          const pts = new THREE.CatmullRomCurve3(p).getPoints(st.n - 1);
          const arr = st.mesh.geometry.attributes.position.array;
          const t = V3(0, 0, 0), nrm = V3(0, 0, 0), bin = V3(0, 0, 0), c = V3(0, 0, 0);
          for (let i = 0; i < st.n; i++) {
            const f = i / (st.n - 1);
            t.copy(pts[Math.min(i + 1, st.n - 1)]).sub(pts[Math.max(i - 1, 0)]).normalize();
            bin.copy(side).sub(t.clone().multiplyScalar(side.dot(t))).normalize();
            nrm.crossVectors(t, bin);
            const r = st.width * Math.sin(Math.min(1, f * 6 + 0.25) * Math.PI / 2) * (1 - f * 0.9);
            for (let j = 0; j < RAD; j++) {
              const a = (j / RAD) * Math.PI * 2;
              c.copy(pts[i]).addScaledVector(bin, Math.cos(a) * r * 1.6).addScaledVector(nrm, Math.sin(a) * r * st.flat);
              const o = (i * RAD + j) * 3;
              arr[o] = c.x; arr[o + 1] = c.y; arr[o + 2] = c.z;
            }
          }
          st.mesh.geometry.attributes.position.needsUpdate = true;
          st.mesh.geometry.computeVertexNormals();
        });
      }

      // 武器の軌跡: 刃先の直近 LIFE 秒からリボンを描く(フレームレートに依存しない)。
      // 幅は刃先から WIDTH(刃の長さに対する割合)だけの細い帯で、刃先側ほど明るく、根元側は透明へ消える
      const trailItem = ['R', 'L'].map((s) => items[s] && items[s].trail && { s, it: items[s] }).filter(Boolean)[0];
      const trail = trailItem && (function () {
        const n = 48, LIFE = 0.22, samples = [], color = GLOWC;
        const WIDTH = spec.trailWidth !== undefined ? spec.trailWidth : 0.22, GAIN = spec.trailGain !== undefined ? spec.trailGain : 0.75;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3));
        geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 6), 3));
        const idx = [];
        for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
        geo.setIndex(idx);
        const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
        mesh.frustumCulled = false;
        fx.add(mesh);
        const base = trailItem.it.trail.base, tip = trailItem.it.trail.tip;
        // サンプルの間をなめらかにつなぐ(速い振りでも折れ線にならない): Catmull-Rom 補間
        const _s = { b: V3(0, 0, 0), t: V3(0, 0, 0), s: 0, time: 0 };
        const cr = (out, p0, p1, p2, p3, u) => {
          const u2 = u * u, u3 = u2 * u;
          return out.set(0, 0, 0)
            .addScaledVector(p0, -0.5 * u3 + u2 - 0.5 * u).addScaledVector(p1, 1.5 * u3 - 2.5 * u2 + 1)
            .addScaledVector(p2, -1.5 * u3 + 2 * u2 + 0.5 * u).addScaledVector(p3, 0.5 * u3 - 0.5 * u2);
        };
        function sampleAt(f) {
          const last = samples.length - 1, i = Math.min(Math.floor(f), Math.max(0, last - 1)), u = Math.min(1, f - i);
          const a = samples[Math.max(0, i - 1)], b = samples[i], c = samples[Math.min(last, i + 1)], d = samples[Math.min(last, i + 2)];
          cr(_s.b, a.b, b.b, c.b, d.b, u); cr(_s.t, a.t, b.t, c.t, d.t, u);
          _s.s = b.s + (c.s - b.s) * u; _s.time = b.time + (c.time - b.time) * u;
          return _s;
        }
        function update(strength, time) {
          const sm = toFx(trailItem.it.obj);
          const bt = base.clone().applyMatrix4(sm), tt = tip.clone().applyMatrix4(sm);
          samples.push({ b: tt.clone().lerp(bt, WIDTH), t: tt, s: equip[trailItem.s] ? strength : 0, time });
          while (samples.length > 2 && (samples.length > n * 4 || time - samples[0].time > LIFE)) samples.shift();
          const pos = geo.attributes.position.array, col = geo.attributes.color.array;
          for (let i = 0; i < n; i++) {
            const smp = sampleAt((i / (n - 1)) * (samples.length - 1));
            const age = 1 - Math.min(1, (time - smp.time) / LIFE), k = smp.s * age * age * GAIN, o = i * 6;
            pos[o] = smp.b.x; pos[o + 1] = smp.b.y; pos[o + 2] = smp.b.z; pos[o + 3] = smp.t.x; pos[o + 4] = smp.t.y; pos[o + 5] = smp.t.z;
            col[o] = 0; col[o + 1] = 0; col[o + 2] = 0; // 根元側の縁は透明(加算合成なので黒 = 見えない)
            col[o + 3] = color.r * k; col[o + 4] = color.g * k; col[o + 5] = color.b * k;
          }
          geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
          mesh.visible = samples.some((s) => s.s > 0.01 && time - s.time < LIFE);
        }
        return { mesh, update };
      })();

      /* ---------- 色 ---------- */
      const COLORS = spec.colors || { normal: { label: '通常' } };
      let colorId = null;
      function setColor(id) {
        const v = COLORS[id];
        if (!v) return;
        colorId = id;
        if (face) { if (v.iris) face.iris = v.iris; face.colorKey = id; face.key = ''; }
        if (v.steel !== undefined) M.steel.color.copy(C(v.steel));
        if (v.trim !== undefined) M.gold.color.copy(C(v.trim));
        if (v.paint !== undefined) M.paint.color.copy(C(v.paint));
        if (v.plume !== undefined) M.plume.color.copy(C(v.plume));
        if (v.glow !== undefined) {
          GLOWC.copy(C(v.glow));
          M.glow.emissive.copy(GLOWC); M.glowSoft.emissive.copy(GLOWC);
          M.blade.emissive.copy(GLOWC).multiplyScalar(0.8); M.blade.color.copy(GLOWC).lerp(C(0xffffff), 0.25);
          M.bladeCore.emissive.copy(GLOWC).lerp(C(0xffffff), 0.6);
        }
        if (spec.applyColor) spec.applyColor(ctx, v);
      }

      /* ---------- 更新ループ ---------- */
      let time = 0, started = false;
      const camLocal = V3(0, 0, 0);
      const glowBase = spec.glowBase || { glow: 7.5, soft: 3 };
      function update(dt, t, camera) {
        dt = Math.min(dt || 0, 1 / 20);
        time += dt;
        mt += dt;
        const act = ACTIONS[currentMode];
        if (act && mt >= act.dur) setMode(act.next);
        ['L', 'R'].forEach((s) => (freeW[s] += (freeTarget(s) - freeW[s]) * Math.min(1, dt * 6)));
        if (external) copyPose(cur, external);
        else {
          MODES[currentMode](target, mt);
          if (blendT < 1) { blendT = Math.min(1, blendT + dt / blendDur); blendPose(cur, from, target, smooth(blendT)); }
          else copyPose(cur, target);
        }
        armW = rideT && currentMode === 'ride' && !external ? smooth(blendT) : 0;
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
        if (!started) { started = true; if (cape) cape.reset(); updateStrands(1 / 60, true); }
        if (cape) cape.update(dt);
        updateStrands(dt);
        if (trail) trail.update(cur.trail, time);
        updateFace(dt);
        if (spec.update) spec.update(ctx, dt, time, cur); // キャラ固有の毎フレーム処理(まばたきなど)
        const pulse = state.pulse ? Math.sin(time * 2.2) : 0; // 発光の点滅(ゆっくり明滅)
        M.glow.emissiveIntensity = (glowBase.glow + pulse * 1.5) * gk;
        M.glowSoft.emissiveIntensity = (glowBase.soft + pulse * 0.6) * gk;
      }

      /* ---------- 関節エディタ・手・装備 ---------- */
      function ensureHold() {
        if (currentMode !== 'hold') {
          copyPose(held, cur);
          held.yaw = 0; held.trail = 0; held.look = cur.look;
          currentMode = 'hold'; blendT = 1; external = null;
        }
      }
      function editJoint(name, axis, deg) { ensureHold(); held.j[name]['xyz'.indexOf(axis)] = deg; }
      function editRoot(axis, m) { ensureHold(); held.root['xyz'.indexOf(axis)] = m; }
      const sideOf = (k) => (k === 'L' || k === 'R' ? k : ['L', 'R'].find((s) => items[s] && items[s].name === k));
      // setEquip({ sword: true, shield: false }) のように、持ち物の名前か 'L' / 'R' で指定
      function setEquip(o) {
        Object.keys(o).forEach((k) => {
          const s = sideOf(k);
          if (!s || !items[s]) return;
          equip[s] = !!o[k];
          items[s].obj.visible = equip[s];
          if (equip[s]) handOverride[s] = null;
        });
      }
      function getEquip() {
        const r = {};
        ['L', 'R'].forEach((s) => { if (items[s]) r[items[s].name] = equip[s]; });
        return r;
      }
      function setHand(side, preset) {
        if (preset && !HANDS[preset]) return;
        handOverride[side] = preset || null;
        if (preset && preset !== 'grip' && items[side]) setEquip({ [side]: false }); // 開いた手では持てないので外す
      }
      ['L', 'R'].forEach((s) => { if (items[s]) items[s].obj.visible = equip[s]; });
      setColor(options.color || Object.keys(COLORS)[0]);
      applyPose(cur);

      const CH = [];
      JOINTS.forEach((j) => ['x', 'y', 'z'].forEach((a) => {
        if (j.lim[a][0] !== j.lim[a][1]) CH.push({ k: j.name + '.' + a, joint: j.name, axis: a, l: j.label, mn: j.lim[a][0], mx: j.lim[a][1], u: 'deg', leg: isLeg(j.name) });
      }));

      /* ---------- 公開インターフェース ---------- */
      const api = {
        root, model, figure, fx, joints: J, JOINTS, CH, markers, hands: ctx.hands, items,
        cape: cape ? cape.mesh : null, strands: strandGroup,
        materials: M, MODES, ACTIONS, COLORS, HANDS, poses: STATIC, colliders, scale: SCALE,
        setMode, getMode: () => currentMode,
        update,
        setColor, getColor: () => colorId,
        setHand, getHand: (s) => handOverride[s],
        setEquip, getEquip,
        setOutline, getOutline: () => ({ on: outlineMat.visible, width: outlineU.value }),
        setIK: (on) => { state.ik = !!on; },
        setPhysics: (on) => { state.physics = !!on; },
        setLook: (on) => { state.look = !!on; },
        setGlowPulse: (on) => { state.pulse = !!on; },
        // 乗り物に乗る(seatMarker・gripTarget[±1]・pegMark{L,R}・chassis。riderStyle / riderColliders があれば使う)
        ride: (vehicle) => {
          if (!vehicle) return;
          if (!rideT) rideSaved = { parent: root.parent, pos: root.position.clone(), quat: root.quaternion.clone(), equip: Object.assign({}, equip) };
          rideT = { vehicle, seat: vehicle.seatMarker, grips: { L: vehicle.gripTarget[1], R: vehicle.gripTarget[-1] }, pegs: vehicle.pegMark, style: vehicle.riderStyle };
          vehicle.chassis.add(root);
          root.position.set(0, 0, 0); root.quaternion.identity();
          setEquip({ L: false, R: false });
          if (cape) cape.setExtra(vehicle.riderColliders || []);
          setMode('ride');
        },
        dismount: () => {
          if (!rideT) return;
          const sv = rideSaved;
          rideT = null; rideSaved = null;
          if (sv.parent) sv.parent.add(root); else if (root.parent) root.parent.remove(root);
          root.position.copy(sv.pos); root.quaternion.copy(sv.quat);
          setEquip({ L: sv.equip.L, R: sv.equip.R });
          if (cape) cape.setExtra([]);
          wind = 0;
          setMode('idle');
        },
        isRiding: () => !!rideT,
        setWind: (v) => { wind = Math.max(0, v || 0); },
        getState: () => Object.assign({}, state),
        editJoint, editRoot,
        getPose: () => clonePose(cur),
        newPose, clonePose,
        applyPose: (P) => applyPose(P),
        setExternalPose: (P) => { external = P || null; },
        syncLinked,
        resetPhysics: () => { if (cape) cape.reset(); updateStrands(1 / 60, true); },
        isLeg,
        ctx,
      };
      if (face) Object.assign(api, {
        setExpr: (e) => { if (face.expressions.indexOf(e) >= 0) face.expr = e; },
        getExpr: () => face.expr,
        setBlink: (on) => { face.blinkOn = !!on; },
        setIrisStyle: (st) => { if (face.irisStyles.indexOf(st) >= 0) face.irisStyle = st; },
        getIrisStyle: () => face.irisStyle,
        setEyeImages: (s) => setEyeImages(face, s),
        EXPRESSIONS: face.expressions, IRIS_STYLES: face.irisStyles,
      });
      if (spec.api) Object.assign(api, spec.api(ctx, api));
      return api;
    },
  };
})(typeof window !== 'undefined' ? window : this);
