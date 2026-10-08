/**
 * cyber-horse-model.js
 * サイバーナイト専用重装バイク「サイバーホース」3D モデルモジュール
 * 騎士の兜を模したフロントカウル(縦スリットの面当て + 十字エンブレム)、金のトレリスフレーム、
 * 発光するエナジーホイール、ツインマフラー兼リアスラスター。
 * 乗り手の座る位置・グリップ・ステップの目印つき(LUNA と同じ約束ごと)。Three.js r128 〜 r170。
 */
(function (global) {
  'use strict';

  global.CyberHorseModel = {
    /* モデルの約束ごと（MODEL_SPEC.md）：info と create を持つ */
    info: {
      id: 'cyber-horse', kind: 'model', version: '2026.10.09', name: 'サイバーホース（バイク）',
      desc: 'サイバーナイト専用の重装バイク。兜の面当てを模したフロントカウル、十字エンブレム、エナジーホイール、リアスラスター。乗り手の座る位置・グリップ・ステップの目印つき',
      create: 'create(THREE, parent, options) → { root, chassis, steerPivot, steer, frontW, rearW, seatMarker, gripTarget, pegMark, update, setSteer, setLean, setBoost, setStand, setColor, ... }',
      colors: ['normal', 'red', 'black', 'bloodred', 'gold'],
    },

    create: function (THREE, parentNode, options) {
      options = options || {};
      const V2 = (x, y) => new THREE.Vector2(x, y);
      const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
      const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

      /* ---------- マテリアル（r128 と r152+ の色管理の差を吸収） ---------- */
      const CM = !!(THREE.ColorManagement && THREE.ColorManagement.enabled && THREE.SRGBColorSpace);
      const C = (hex) => { const c = new THREE.Color(hex); return CM ? c : c.convertSRGBToLinear(); };
      function srgbTex(t) {
        if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace; else t.encoding = THREE.sRGBEncoding;
        t.anisotropy = 4;
        return t;
      }
      const gk = options.glowIntensity !== undefined ? options.glowIntensity : 1;
      const GLOW = C(0x2fa4ff);
      const M = {
        silver: new THREE.MeshPhysicalMaterial({ color: C(0xc4cad4), metalness: 1, roughness: 0.28, clearcoat: 0.6, clearcoatRoughness: 0.12, side: THREE.DoubleSide }),
        paint: new THREE.MeshPhysicalMaterial({ color: C(0x1f4fb8), metalness: 0.45, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08, side: THREE.DoubleSide }),
        gold: new THREE.MeshPhysicalMaterial({ color: C(0xd9ad55), metalness: 1, roughness: 0.26, side: THREE.DoubleSide }),
        metal: new THREE.MeshStandardMaterial({ color: C(0xb5bcc7), metalness: 0.9, roughness: 0.25 }),
        darkMetal: new THREE.MeshStandardMaterial({ color: C(0x2c3038), metalness: 0.7, roughness: 0.35 }),
        dark: new THREE.MeshStandardMaterial({ color: C(0x1a1d23), metalness: 0.35, roughness: 0.5 }),
        seat: new THREE.MeshStandardMaterial({ color: C(0x16181d), metalness: 0.1, roughness: 0.8 }),
        tire: new THREE.MeshStandardMaterial({ color: C(0x14161b), metalness: 0.02, roughness: 0.85 }),
        disc: new THREE.MeshStandardMaterial({ color: C(0xccd3dd), metalness: 0.95, roughness: 0.22 }),
        slit: new THREE.MeshStandardMaterial({ color: C(0x030406), roughness: 0.9 }),
        glow: new THREE.MeshStandardMaterial({ color: C(0x0b3a7a), emissive: GLOW, emissiveIntensity: 7 * gk }),
        glowSoft: new THREE.MeshStandardMaterial({ color: C(0x0b3a7a), emissive: GLOW, emissiveIntensity: 3 * gk }),
        red: new THREE.MeshStandardMaterial({ color: C(0x400810), emissive: C(0xff2a40), emissiveIntensity: 5 * gk }),
        screen: new THREE.MeshPhysicalMaterial({ color: C(0x0b1a2a), metalness: 0.15, roughness: 0.04, clearcoat: 1, transparent: true, opacity: 0.6, side: THREE.DoubleSide }),
      };
      const addMat = (color, op) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
      const FX = { flame: addMat(0x58c8ff, 0.75), core: addMat(0xffffff, 0.9) };
      const NO_OUTLINE = [M.glow, M.glowSoft, M.red, M.screen, M.slit];

      const COLORS = {
        normal: { silver: 0xc4cad4, paint: 0x1f4fb8, trim: 0xd9ad55, glow: 0x2fa4ff },
        red: { silver: 0xc4cad4, paint: 0xa01e2a, trim: 0xd9ad55, glow: 0xff6a3a },
        black: { silver: 0x2b2e35, paint: 0x111216, trim: 0xb08a45, glow: 0xff2a3a },
        bloodred: { silver: 0x8c1822, paint: 0x3a0a12, trim: 0xc9a050, glow: 0xb05cff },
        gold: { silver: 0xd4ae5a, paint: 0x1f4fb8, trim: 0xf2d590, glow: 0xffc04a },
      };
      let colorId = 'normal';
      function setColor(id) {
        const v = COLORS[id];
        if (!v) return;
        colorId = id;
        M.paint.color.copy(C(v.paint)); M.silver.color.copy(C(v.silver)); M.gold.color.copy(C(v.trim));
        GLOW.copy(C(v.glow)); M.glow.emissive.copy(GLOW); M.glowSoft.emissive.copy(GLOW);
        swirlMat.color.copy(GLOW).lerp(C(0xffffff), 0.35);
        crossBase.copy(GLOW).lerp(C(0xffffff), 0.55);
      }

      /* ---------- 形状ヘルパー ---------- */
      function grp(x, y, z, p) { const g = new THREE.Group(); g.position.set(x, y, z); if (p) p.add(g); return g; }
      function mesh(geo, mat, p, pos, rot, sc) {
        const m = new THREE.Mesh(geo, mat);
        if (pos) m.position.set(pos[0], pos[1], pos[2]);
        if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
        if (sc) m.scale.set(sc[0], sc[1], sc[2]);
        m.castShadow = true; m.receiveShadow = true;
        p.add(m);
        return m;
      }
      const cylX = (r, len, seg) => { const g = new THREE.CylinderGeometry(r, r, len, seg || 32); g.rotateZ(Math.PI / 2); return g; };
      const cylZ = (r, len, seg) => { const g = new THREE.CylinderGeometry(r, r, len, seg || 32); g.rotateX(Math.PI / 2); return g; };
      const torusX = (R, r, arc) => { const g = new THREE.TorusGeometry(R, r, 12, 48, arc === undefined ? Math.PI * 2 : arc); g.rotateY(Math.PI / 2); return g; };
      function annulus(rIn, rOut, th) {
        const g = new THREE.LatheGeometry([[rIn, -th / 2], [rOut, -th / 2], [rOut, th / 2], [rIn, th / 2], [rIn, -th / 2]].map((q) => V2(q[0], q[1])), 48);
        g.rotateZ(Math.PI / 2);
        return g;
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
      function rbox(w, h, d, r) {
        const b = Math.min(d * 0.3, r * 0.8, 0.04);
        const g = new THREE.ExtrudeGeometry(rrShape(w - 2 * b, h - 2 * b, Math.max(0.002, r - b)), { depth: Math.max(0.002, d - 2 * b), bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 3, curveSegments: 8 });
        g.translate(0, 0, -(d - 2 * b) / 2);
        return g;
      }
      function polyShape(pts) {
        const s = new THREE.Shape();
        pts.forEach((q, i) => (i ? s.lineTo(q[0], q[1]) : s.moveTo(q[0], q[1])));
        s.closePath();
        return s;
      }
      function extrude(shape, depth, bevel) {
        const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel || 0.01, bevelSize: bevel || 0.01, bevelSegments: 2, curveSegments: 16 });
        g.translate(0, 0, -depth / 2);
        return g;
      }
      // 2 点間の円柱(フレーム材)
      function beam(a, b, r, mat, p) {
        const d = V3(0, 0, 0).subVectors(b, a);
        const m = mesh(new THREE.CylinderGeometry(r, r, d.length(), 20), mat, p);
        m.position.copy(a).addScaledVector(d, 0.5);
        m.quaternion.setFromUnitVectors(V3(0, 1, 0), d.normalize());
        return m;
      }
      // 断面(超楕円)を z 方向に並べてなめらかにつないだ外装。secs: [z, 半幅, 上端, 下端, 上の角張り, 下の角張り]
      function crs(p0, p1, p2, p3, t) {
        const t2 = t * t, t3 = t2 * t;
        return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
      }
      function loft(secs, mat, parent, steps) {
        const A = 56, S = steps || 10, rows = [];
        for (let i = 0; i < secs.length - 1; i++) {
          const p0 = secs[Math.max(0, i - 1)], p1 = secs[i], p2 = secs[i + 1], p3 = secs[Math.min(secs.length - 1, i + 2)];
          for (let k = 0; k < S; k++) { const r = []; for (let c = 0; c < 6; c++) r.push(crs(p0[c], p1[c], p2[c], p3[c], k / S)); rows.push(r); }
        }
        rows.push(secs[secs.length - 1].slice());
        const pos = [], idx = [], R = rows.length;
        rows.forEach((r) => {
          const w = Math.max(0.001, r[1]), yc = (r[2] + r[3]) / 2, h = Math.max(0.001, (r[2] - r[3]) / 2);
          for (let j = 0; j < A; j++) {
            const th = (j / A) * Math.PI * 2, cs = Math.cos(th), sn = Math.sin(th), n = sn >= 0 ? r[4] : r[5];
            pos.push(w * Math.sign(cs) * Math.pow(Math.abs(cs), 2 / n), yc + h * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / n), r[0]);
          }
        });
        for (let i = 0; i < R - 1; i++) for (let j = 0; j < A; j++) {
          const a = i * A + j, b = i * A + ((j + 1) % A), c = (i + 1) * A + j, d = (i + 1) * A + ((j + 1) % A);
          idx.push(a, c, b, b, c, d);
        }
        [0, R - 1].forEach((ri, e) => {
          const r = rows[ri], ci = pos.length / 3;
          pos.push(0, (r[2] + r[3]) / 2, r[0]);
          for (let j = 0; j < A; j++) { const u = ri * A + j, v = ri * A + ((j + 1) % A); if (e === 0) idx.push(ci, u, v); else idx.push(ci, v, u); }
        });
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setIndex(idx);
        g.computeVertexNormals();
        return mesh(g, mat, parent);
      }
      // 外装へ投影(デカール・ライン用)。targets は親の変換なしで判定
      const rayc = new THREE.Raycaster(), _o = V3(0, 0, 0), _d = V3(0, 0, 0);
      function prep(m) { const pm = m.parent; m.parent = null; m.updateMatrixWorld(true); m.parent = pm; return m; }
      function projPt(targets, p, dir, off) {
        _d.copy(dir).normalize(); _o.copy(p).addScaledVector(_d, -6);
        rayc.set(_o, _d); rayc.far = 12;
        const h = rayc.intersectObjects(targets, false)[0];
        return h ? h.point.clone().addScaledVector(_d, -off) : null;
      }
      function stick(geo, targets, dir, off) {
        const p = geo.attributes.position, v = V3(0, 0, 0);
        for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const q = projPt(targets, v, dir, off); if (q) p.setXYZ(i, q.x, q.y, q.z); }
        p.needsUpdate = true; geo.computeVertexNormals();
        return geo;
      }
      function surfLine(pts, targets, dir, off, rad, mat, parent) {
        const on = pts.map((p) => projPt(targets, p, dir, off)).filter((p) => p);
        if (on.length < 2) return null;
        return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(on), on.length * 6, rad, 8, false), mat, parent);
      }

      /* ---------- ルート & シャーシ ---------- */
      const root = grp(0, 0, 0, parentNode);
      root.name = 'CyberHorse';
      if (options.scale) root.scale.setScalar(options.scale);
      const chassis = grp(0, 0, 0, root);
      const bike = chassis;

      /* ---------- エナジーホイール ---------- */
      const swirlTex = (function () {
        const c = document.createElement('canvas'); c.width = c.height = 256;
        const g = c.getContext('2d');
        g.translate(128, 128);
        g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineCap = 'round';
        g.shadowColor = 'rgba(255,255,255,1)'; g.shadowBlur = 10;
        for (let i = 0; i < 7; i++) {
          g.save(); g.rotate((i / 7) * Math.PI * 2);
          g.lineWidth = 7; g.beginPath(); g.moveTo(40, 0); g.quadraticCurveTo(95, 30, 118, 88); g.stroke();
          g.lineWidth = 3; g.beginPath(); g.moveTo(55, -10); g.quadraticCurveTo(100, 12, 122, 60); g.stroke();
          g.restore();
        }
        const rg = g.createRadialGradient(0, 0, 30, 0, 0, 128);
        rg.addColorStop(0, 'rgba(255,255,255,0.0)'); rg.addColorStop(0.75, 'rgba(255,255,255,0.22)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = rg; g.beginPath(); g.arc(0, 0, 128, 0, 7); g.fill();
        return srgbTex(new THREE.CanvasTexture(c));
      })();
      const swirlMat = new THREE.MeshBasicMaterial({ map: swirlTex, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
      function makeWheel(half) {
        const w = new THREE.Group(), spin = new THREE.Group();
        w.add(spin);
        const tire = mesh(torusX(0.74, 0.21), M.tire, spin);
        tire.scale.set(half / 0.21, 1, 1);
        // トレッドの発光ライン(V 字)
        for (let i = 0; i < 20; i++) {
          const g = grp(0, 0, 0, spin);
          g.rotation.x = (i / 20) * Math.PI * 2;
          [-1, 1].forEach((s) => {
            const m = mesh(new THREE.BoxGeometry(half * 0.75, 0.025, 0.05), M.glowSoft, g, [s * half * 0.38, 0.945, 0]);
            m.rotation.y = s * 0.45;
          });
        }
        [-1, 1].forEach((s) => {
          const x = s * half * 0.62;
          mesh(annulus(0.5, 0.58, 0.07), M.dark, spin, [x, 0, 0]);
          mesh(torusX(0.52, 0.022), M.glow, spin, [x + s * 0.04, 0, 0]);
          // エネルギーの渦(スポークの代わり)
          const disc = mesh(new THREE.CircleGeometry(0.52, 48), swirlMat, spin, [x + s * 0.01, 0, 0], [0, Math.PI / 2, 0]);
          disc.castShadow = false;
          mesh(cylX(0.17, 0.1), M.metal, spin, [x + s * 0.02, 0, 0]);
          mesh(torusX(0.11, 0.014), M.glow, spin, [x + s * 0.075, 0, 0]);
          mesh(annulus(0.27, 0.42, 0.016), M.disc, spin, [x + s * 0.09, 0, 0]);
        });
        return { root: w, spin };
      }

      const rearWheelObj = makeWheel(0.42);
      rearWheelObj.root.position.set(0, 0.95, -1.95);
      bike.add(rearWheelObj.root);
      mesh(cylX(0.06, 1.2), M.metal, bike, [0, 0.95, -1.95]);

      /* ---------- フレーム(金のトレリス)・スイングアーム・サスペンション ---------- */
      [-1, 1].forEach((s) => {
        const head = V3(s * 0.2, 2.55, 0.95), piv = V3(s * 0.45, 1.15, -0.45), mid = V3(s * 0.5, 1.95, 0.15), low = V3(s * 0.42, 1.25, 0.45);
        beam(head, mid, 0.06, M.gold, bike);
        beam(mid, piv, 0.06, M.gold, bike);
        beam(head, low, 0.05, M.gold, bike);
        beam(low, piv, 0.05, M.gold, bike);
        beam(low, mid, 0.04, M.gold, bike);
        beam(V3(s * 0.25, 2.1, -0.35), V3(s * 0.2, 2.15, -1.6), 0.04, M.gold, bike); // シートレール
        beam(mid, V3(s * 0.25, 2.1, -0.35), 0.045, M.gold, bike);
        const arm = mesh(rbox(0.12, 0.22, 1.5, 0.06), M.silver, bike, [s * 0.52, 1.02, -1.2]);
        arm.rotation.x = -0.05;
        mesh(cylX(0.1, 0.06), M.darkMetal, bike, [s * 0.52, 1.15, -0.45]);
        mesh(rbox(0.07, 0.22, 0.13, 0.04), M.gold, bike, [s * 0.34, 1.25, -1.72], [-0.85, 0, 0]);
      });
      const shock = grp(0, 1.45, -0.85, bike);
      shock.rotation.x = 0.6;
      mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.6, 16), M.metal, shock);
      for (let i = 0; i < 6; i++) mesh(new THREE.TorusGeometry(0.075, 0.016, 8, 24), M.gold, shock, [0, -0.15 + i * 0.06, 0], [Math.PI / 2, 0, 0]);

      /* ---------- エンジン(露出したメカ) ---------- */
      mesh(rbox(0.56, 0.62, 0.78, 0.08), M.darkMetal, bike, [0, 1.42, 0.25]);
      for (let i = 0; i < 6; i++) mesh(rbox(0.62, 0.035, 0.42, 0.015), M.metal, bike, [0, 1.8 + i * 0.055, 0.42], [-0.25, 0, 0]);
      mesh(rbox(0.4, 0.16, 0.36, 0.05), M.dark, bike, [0, 2.15, 0.36], [-0.25, 0, 0]);
      [-1, 1].forEach((s) => {
        mesh(cylX(0.24, 0.06), M.metal, bike, [s * 0.31, 1.3, 0.18]);
        mesh(torusX(0.17, 0.018), M.glow, bike, [s * 0.345, 1.3, 0.18]);
        mesh(cylX(0.09, 0.03), M.darkMetal, bike, [s * 0.35, 1.3, 0.18]);
      });
      // エキパイ(エンジン前から下をくぐって右のマフラーへ)
      [-0.12, 0.12].forEach((x, i) => {
        const pts = [V3(x, 1.7, 0.66), V3(x * 1.2, 1.25, 0.85), V3(x * 1.4, 0.75, 0.55), V3(-0.25 - i * 0.05, 0.72, -0.2), V3(-0.45, 0.95, -0.8)];
        mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.05, 12, false), M.metal, bike);
      });

      /* ---------- ツインマフラー兼リアスラスター(右側) ---------- */
      const flames = [];
      [0, 1].forEach((i) => {
        const a = V3(-0.5 - i * 0.03, 1.0 + i * 0.22, -0.85), b = V3(-0.58 - i * 0.03, 1.55 + i * 0.22, -2.15);
        const d = V3(0, 0, 0).subVectors(b, a);
        const g = grp(0, 0, 0, bike);
        g.position.copy(a).addScaledVector(d, 0.5);
        g.quaternion.setFromUnitVectors(V3(0, 1, 0), d.clone().normalize());
        mesh(new THREE.CylinderGeometry(0.13, 0.11, d.length(), 28), M.silver, g);
        mesh(new THREE.TorusGeometry(0.13, 0.014, 8, 32), M.gold, g, [0, d.length() * 0.3, 0], [Math.PI / 2, 0, 0]);
        mesh(new THREE.TorusGeometry(0.115, 0.022, 10, 32), M.glow, g, [0, d.length() / 2, 0], [Math.PI / 2, 0, 0]);
        mesh(new THREE.CircleGeometry(0.1, 24), M.darkMetal, g, [0, d.length() / 2 - 0.01, 0], [-Math.PI / 2, 0, 0]);
        const fl = grp(0, d.length() / 2 + 0.02, 0, g);
        const fg = new THREE.ConeGeometry(1, 1, 18, 1, true); fg.translate(0, -0.5, 0); fg.rotateX(Math.PI);
        const o = new THREE.Mesh(fg, FX.flame), cc = new THREE.Mesh(fg, FX.core);
        o.scale.set(0.11, 0.9, 0.11); cc.scale.set(0.05, 0.55, 0.05);
        fl.add(o); fl.add(cc);
        fl.visible = false;
        flames.push(fl);
      });

      /* ---------- 外装：タンク〜アッパーカウル / シート / テール ---------- */
      const upper = loft([
        [2.18, 0.05, 2.5, 2.3, 2.2, 2.2],
        [2.08, 0.26, 2.72, 2.05, 2.4, 2.6],
        [1.88, 0.42, 2.9, 1.92, 2.6, 3.0],
        [1.55, 0.55, 3.02, 1.85, 2.6, 3.4],
        [1.22, 0.6, 3.05, 1.7, 2.6, 3.8],
        [0.95, 0.6, 3.04, 1.95, 2.6, 3.6],
        [0.62, 0.56, 3.0, 2.12, 2.5, 3.0],
        [0.3, 0.5, 2.94, 2.12, 2.4, 2.8],
        [-0.05, 0.44, 2.82, 2.12, 2.4, 2.4],
        [-0.35, 0.3, 2.62, 2.15, 2.2, 2.2],
        [-0.52, 0.08, 2.5, 2.22, 2.0, 2.0],
      ], M.silver, bike, 12);
      const seat = loft([
        [-0.38, 0.2, 2.45, 2.18, 2.6, 2.0],
        [-0.55, 0.32, 2.42, 2.12, 3.0, 2.2],
        [-0.85, 0.34, 2.38, 2.1, 3.2, 2.2],
        [-1.12, 0.3, 2.42, 2.1, 3.0, 2.2],
        [-1.3, 0.22, 2.5, 2.18, 2.6, 2.0],
        [-1.4, 0.08, 2.52, 2.28, 2.0, 2.0],
      ], M.seat, bike);
      const tail = loft([
        [-0.95, 0.14, 2.24, 1.98, 2.2, 2.2],
        [-1.12, 0.38, 2.34, 1.92, 2.6, 2.8],
        [-1.48, 0.42, 2.48, 1.96, 2.6, 3.0],
        [-1.9, 0.38, 2.62, 2.08, 2.6, 2.8],
        [-2.25, 0.3, 2.74, 2.26, 2.4, 2.6],
        [-2.5, 0.16, 2.78, 2.42, 2.2, 2.2],
        [-2.62, 0.04, 2.76, 2.56, 2.0, 2.0],
      ], M.silver, bike);
      const belly = loft([
        [0.98, 0.06, 1.02, 0.86, 2.2, 2.2],
        [0.88, 0.32, 1.06, 0.7, 2.6, 3.0],
        [0.4, 0.38, 1.08, 0.62, 2.6, 3.2],
        [-0.1, 0.34, 1.05, 0.66, 2.6, 3.0],
        [-0.38, 0.06, 1.02, 0.84, 2.2, 2.2],
      ], M.paint, bike);
      const shellT = [prep(upper)], tailT = [prep(tail)], seatT = [prep(seat)];
      const X = V3(1, 0, 0), Z = V3(0, 0, 1), DOWN = V3(0, -1, 0);

      // 兜の頭頂のような青いドーム(カウル上部)と十字エンブレム
      const dome = loft([
        [2.15, 0.05, 2.56, 2.44, 2.2, 2.2],
        [2.07, 0.25, 2.76, 2.4, 2.4, 2.4],
        [1.88, 0.42, 2.93, 2.38, 2.6, 2.4],
        [1.55, 0.54, 3.05, 2.42, 2.6, 2.4],
        [1.25, 0.565, 3.07, 2.52, 2.6, 2.4],
        [1.05, 0.47, 3.06, 2.62, 2.4, 2.2],
        [0.95, 0.05, 3.05, 2.72, 2.0, 2.0],
      ], M.paint, bike, 10);
      const domeT = [prep(dome)];
      // 十字エンブレム: 細かく分割した板に発光テクスチャを貼り、ドームの曲面へ投影
      const crossTex = (function () {
        const c = document.createElement('canvas'); c.width = c.height = 256;
        const g = c.getContext('2d');
        g.translate(128, 128);
        g.shadowColor = 'rgba(255,255,255,1)'; g.shadowBlur = 18; g.fillStyle = '#ffffff';
        const bar = (w, h) => {
          g.beginPath();
          g.moveTo(-w, -h + 26); g.lineTo(-w * 2.3, -h); g.lineTo(0, -h - 18); g.lineTo(w * 2.3, -h); g.lineTo(w, -h + 26);
          g.lineTo(w, h - 26); g.lineTo(w * 2.3, h); g.lineTo(0, h + 18); g.lineTo(-w * 2.3, h); g.lineTo(-w, h - 26);
          g.closePath(); g.fill();
        };
        g.save(); g.translate(0, 8); bar(12, 98); g.restore();
        g.save(); g.translate(0, -22); g.rotate(Math.PI / 2); bar(12, 72); g.restore();
        return srgbTex(new THREE.CanvasTexture(c));
      })();
      const crossBase = new THREE.Color(1, 1, 1);
      const crossMat = new THREE.MeshBasicMaterial({ map: crossTex, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 });
      const cg = new THREE.PlaneGeometry(0.62, 0.62, 24, 24);
      cg.rotateX(-0.95); // ドーム前面の傾きに合わせて置き、斜め上から貼り付ける
      cg.translate(0, 2.9, 1.7);
      const crossMesh = mesh(stick(cg, domeT, V3(0, -0.6, -0.8), 0.006), crossMat, bike);
      crossMesh.renderOrder = 2; crossMesh.castShadow = false;
      // ドームの縁の金ライン(面当てとの境目)
      const rimPts = [];
      for (let i = -8; i <= 8; i++) { const u = i / 8; rimPts.push(V3(u * 0.6, 2.42 + 0.06 * (1 - u * u), 3)); }
      surfLine(rimPts, shellT, Z.clone().negate(), 0.012, 0.022, M.gold, bike);
      // 面当て(フロントの縦スリット)と奥のヘッドライト
      [-0.3, -0.18, -0.06, 0.06, 0.18, 0.3].forEach((x) => {
        const g = new THREE.PlaneGeometry(0.06, 0.32, 1, 6);
        g.translate(x, 2.17, 3);
        mesh(stick(g, shellT, Z.clone().negate(), 0.004), M.slit, bike);
      });
      const vRidge = [];
      for (let i = 0; i <= 6; i++) vRidge.push(V3(0, 2.0 + i * 0.07, 3));
      surfLine(vRidge, shellT, Z.clone().negate(), 0.01, 0.018, M.gold, bike);
      mesh(new THREE.PlaneGeometry(0.5, 0.3), M.glowSoft, bike, [0, 2.17, 1.98]);
      // サイドの青パネル・金ライン・発光ライン
      [-1, 1].forEach((sd) => {
        const dir = X.clone().multiplyScalar(-sd);
        const sh = polyShape([[1.75, 2.05], [1.4, 2.55], [0.7, 2.6], [0.35, 2.3], [0.55, 1.95], [1.2, 1.88]]);
        const g = new THREE.ShapeGeometry(sh, 8); g.rotateY(-Math.PI / 2);
        mesh(stick(g, shellT, dir, 0.006), M.paint, bike);
        surfLine([1.78, 1.45, 1.1, 0.75, 0.4].map((z, i) => V3(0, 2.62 - i * 0.015, z)), shellT, dir, 0.012, 0.016, M.gold, bike);
        surfLine([1.6, 1.25, 0.9, 0.6].map((z, i) => V3(0, 2.0 + i * 0.03, z)), shellT, dir, 0.012, 0.013, M.glow, bike);
        const tg = new THREE.ShapeGeometry(polyShape([[-1.1, 2.12], [-1.5, 2.2], [-2.2, 2.45], [-2.1, 2.3], [-1.5, 2.05]]), 6);
        tg.rotateY(-Math.PI / 2);
        mesh(stick(tg, tailT, dir, 0.006), M.paint, bike);
        surfLine([-1.2, -1.6, -2.0, -2.35].map((z, i) => V3(0, 2.3 + i * 0.07, z)), tailT, dir, 0.01, 0.012, M.glow, bike);
      });
      // タンク上面の金ライン
      surfLine([0.9, 0.6, 0.3, 0.0, -0.3].map((z) => V3(0, 4, z)), shellT, DOWN, 0.01, 0.016, M.gold, bike);

      /* ---------- テール: テールランプと左右のリアスラスター ---------- */
      const tailLight = [];
      for (let i = -4; i <= 4; i++) tailLight.push(V3(i / 4 * 0.13, 2.62, -4));
      surfLine(tailLight, tailT, Z, 0.008, 0.028, M.red, bike);
      [-1, 1].forEach((s) => {
        const g = grp(s * 0.27, 2.25, -2.12, bike);
        mesh(cylZ(0.11, 0.16), M.darkMetal, g);
        mesh(new THREE.TorusGeometry(0.1, 0.02, 8, 32), M.silver, g, [0, 0, -0.08]);
        mesh(new THREE.CircleGeometry(0.075, 24), M.glow, g, [0, 0, -0.085], [0, Math.PI, 0]);
      });
      mesh(new THREE.TorusGeometry(1.04, 0.035, 8, 30, 1.5), M.dark, bike, [0, 0.95, -1.95], [0, Math.PI / 2, Math.PI / 2 - 0.2]);

      /* ---------- フロントフォーク・ハンドル・メーター ---------- */
      const steerPivot = grp(0, 2.7, 1.0, bike);
      steerPivot.rotation.x = -0.497;
      const steer = grp(0, 0, 0, steerPivot);
      const frontWheelObj = makeWheel(0.3);
      frontWheelObj.root.position.set(0, -1.99, 0);
      steer.add(frontWheelObj.root);
      mesh(cylX(0.045, 0.85), M.metal, steer, [0, -1.99, 0]);
      [-1, 1].forEach((s) => {
        mesh(new THREE.CylinderGeometry(0.055, 0.055, 1.05, 20), M.darkMetal, steer, [s * 0.36, -0.52, 0]);
        mesh(new THREE.CylinderGeometry(0.044, 0.044, 1.0, 20), M.gold, steer, [s * 0.36, -1.48, 0]);
        mesh(rbox(0.07, 0.24, 0.13, 0.04), M.gold, steer, [s * 0.26, -1.69, -0.26], [0.85, 0, 0]);
        // セパレートハンドル(クリップオン)とグリップ
        beam(V3(s * 0.33, 0.05, -0.05), V3(s * 0.66, 0.2, -0.22), 0.035, M.metal, steer);
        mesh(cylX(0.042, 0.3), M.dark, steer, [s * 0.8, 0.22, -0.24], [0, 0, s * 0.12]);
        mesh(cylX(0.03, 0.03), M.glow, steer, [s * 0.96, 0.24, -0.24]);
        const lev = mesh(new THREE.BoxGeometry(0.02, 0.03, 0.22), M.metal, steer, [s * 0.74, 0.2, -0.1]);
        lev.rotation.y = s * 0.35;
      });
      mesh(rbox(0.85, 0.1, 0.24, 0.04), M.darkMetal, steer, [0, 0.0, 0]);
      mesh(new THREE.SphereGeometry(1, 32, 16), M.paint, steer, [0, -0.93, 0.06], 0, [0.3, 0.07, 0.72]);
      const gripTarget = {};
      [-1, 1].forEach((s) => {
        const o = new THREE.Object3D();
        o.position.set(s * 0.8, 0.22, -0.24);
        steer.add(o);
        gripTarget[s] = o;
      });

      // メーター(乗り手側を向くデジタル表示)
      const meterCv = document.createElement('canvas'); meterCv.width = 256; meterCv.height = 112;
      const meterTex = srgbTex(new THREE.CanvasTexture(meterCv));
      function drawMeter(kmh, mode) {
        const g = meterCv.getContext('2d');
        g.fillStyle = '#07121f'; g.fillRect(0, 0, 256, 112);
        g.lineWidth = 8; g.lineCap = 'round';
        g.strokeStyle = 'rgba(120,200,255,0.2)'; g.beginPath(); g.arc(70, 62, 40, Math.PI * 0.75, Math.PI * 2.25); g.stroke();
        g.strokeStyle = '#3aa8ff'; g.beginPath(); g.arc(70, 62, 40, Math.PI * 0.75, Math.PI * 0.75 + Math.PI * 1.5 * Math.min(1, kmh / 240)); g.stroke();
        g.fillStyle = '#e8f4ff'; g.font = 'bold 32px sans-serif'; g.textAlign = 'center'; g.fillText(String(Math.round(kmh)), 70, 72);
        g.font = '10px sans-serif'; g.fillStyle = '#8fd0ff'; g.fillText('KM/H', 70, 90);
        g.textAlign = 'left'; g.font = 'bold 13px sans-serif'; g.fillStyle = '#d9ad55'; g.fillText('CYBER HORSE', 128, 32);
        g.font = '11px sans-serif'; g.fillStyle = '#8fd0ff'; g.fillText('KNIGHT LINK: OK', 128, 56);
        g.font = 'bold 12px sans-serif'; g.fillStyle = '#bfe6ff'; g.fillText('MODE: ' + (mode || 'PARK'), 128, 80);
        meterTex.needsUpdate = true;
      }
      drawMeter(0, 'PARK');
      const meter = grp(0, 3.05, 0.62, bike);
      meter.rotation.set(0.6, Math.PI, 0);
      mesh(rbox(0.6, 0.3, 0.07, 0.05), M.dark, meter);
      mesh(new THREE.PlaneGeometry(0.5, 0.22), new THREE.MeshBasicMaterial({ map: meterTex, toneMapped: false }), meter, [0, 0, 0.038]);
      // スクリーン
      (function () {
        const U = 12, Vn = 6, pos = [], idx = [];
        for (let v = 0; v <= Vn; v++) for (let u = 0; u <= U; u++) {
          const uu = (u / U) * 2 - 1, vv = v / Vn, k = uu * uu;
          const B = projPt(domeT, V3(uu * 0.42, 4, 1.15 - 0.12 * k), DOWN, -0.01) || V3(uu * 0.42, 3.05, 1.15);
          const T = V3(uu * 0.32, 3.4 - 0.1 * k, 0.72 - 0.08 * k);
          const P = B.clone().lerp(T, vv);
          P.y += 0.05 * Math.sin(Math.PI * vv);
          pos.push(P.x, P.y, P.z);
        }
        for (let v = 0; v < Vn; v++) for (let u = 0; u < U; u++) { const a = v * (U + 1) + u, b = a + 1, c = a + U + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
        const ws = mesh(g, M.screen, bike); ws.renderOrder = 1; ws.castShadow = false;
      })();

      /* ---------- ステップ・サイドスタンド・目印 ---------- */
      const pegMark = { L: new THREE.Object3D(), R: new THREE.Object3D() };
      [-1, 1].forEach((s) => {
        mesh(cylX(0.03, 0.26), M.metal, bike, [s * 0.5, 1.2, -0.55]);
        mesh(rbox(0.08, 0.3, 0.06, 0.02), M.gold, bike, [s * 0.44, 1.35, -0.52], [0.3, 0, 0]);
      });
      pegMark.L.position.set(0.5, 1.24, -0.55); pegMark.R.position.set(-0.5, 1.24, -0.55);
      bike.add(pegMark.L); bike.add(pegMark.R);
      const seatMarker = new THREE.Object3D();
      seatMarker.position.set(0, 2.38, -0.8);
      bike.add(seatMarker);
      const standPivot = grp(0.45, 0.85, -0.4, bike);
      const standBar = grp(0, 0, 0, standPivot);
      mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.88, 12), M.metal, standBar, [0, -0.42, 0]);
      mesh(new THREE.BoxGeometry(0.12, 0.03, 0.14), M.darkMetal, standBar, [0, -0.86, 0]);
      function setStand(r) { standBar.rotation.z = (1 - r) * -0.25; standBar.rotation.x = (1 - r) * -1.35; }
      setStand(1);

      /* ---------- 輪郭線(サイバーナイトと同じ方式) ---------- */
      const outlineU = { value: options.outlineWidth !== undefined ? options.outlineWidth : 0.012 };
      const outlineMat = new THREE.MeshBasicMaterial({ color: C(0x06080c), side: THREE.BackSide });
      outlineMat.onBeforeCompile = (sh) => {
        sh.uniforms.uOutline = outlineU;
        sh.vertexShader = 'uniform float uOutline;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(normal) * uOutline;');
      };
      const targets = [];
      root.traverse((o) => { if (o.isMesh && o.material && !o.material.transparent && o.material.isMeshBasicMaterial !== true && NO_OUTLINE.indexOf(o.material) < 0) targets.push(o); });
      targets.forEach((o) => { const ol = new THREE.Mesh(o.geometry, outlineMat); ol.castShadow = false; o.add(ol); });
      function setOutline(on, width) { outlineMat.visible = !!on; if (width !== undefined) outlineU.value = width; }
      setOutline(options.outline !== false);
      setColor(options.color || 'normal');

      /* ---------- 状態 ---------- */
      let speed = 0, boost = 0, time = 0, steerA = 0, lean = 0;
      const WHEEL_R = 0.95;
      // speed: 単位/秒(ホイールの回転と表示に使う)
      function update(dt, sp) {
        dt = Math.min(dt || 0, 1 / 20);
        time += dt;
        if (sp !== undefined) speed = sp;
        const w = (speed / WHEEL_R) * dt;
        frontWheelObj.spin.rotation.x += w;
        rearWheelObj.spin.rotation.x += w;
        crossMat.color.copy(crossBase).multiplyScalar(gk * (1.6 + 0.4 * Math.sin(time * 2.2)));
        swirlMat.opacity = 0.75 + 0.2 * Math.sin(time * 3) + Math.min(0.2, Math.abs(speed) * 0.01);
        flames.forEach((f) => {
          f.visible = boost > 0.02;
          if (f.visible) f.scale.set(1, boost * (0.85 + 0.15 * Math.random()), 1);
        });
        const pulse = Math.sin(time * 2.2);
        M.glow.emissiveIntensity = (6.5 + pulse * 1.2 + boost * 3) * gk;
        if (Math.floor(time * 4) !== Math.floor((time - dt) * 4)) drawMeter(Math.abs(speed) * 3.6 * 2.4, boost > 0.5 ? 'BOOST' : speed > 0.1 ? 'RIDE' : 'PARK');
      }
      function setSteer(a) { steerA = clamp(a, -0.6, 0.6); steer.rotation.y = steerA; }
      function setLean(a) { lean = clamp(a, -0.8, 0.8); chassis.rotation.z = lean; }
      function setBoost(b) { boost = clamp(b, 0, 1); }

      return {
        root, chassis, bike, steerPivot, steer,
        frontW: frontWheelObj.spin, rearW: rearWheelObj.spin, frontWheelObj, rearWheelObj,
        seatMarker, gripTarget, pegMark, standPivot, standBar, setStand,
        meterTex, drawMeter, flames, materials: M, COLORS,
        update, setSteer, setLean, setBoost, setColor, getColor: () => colorId, setOutline,
        getSpeed: () => speed, wheelRadius: WHEEL_R,
      };
    },
  };
})(typeof window !== 'undefined' ? window : this);
