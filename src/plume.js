import * as THREE from 'three';

// 兜の羽飾り: 形状を保とうとするバネ付き Verlet 鎖を、先細りのチューブで描く
const SEG = 10;
const RAD = 6;
const SUB = 3;

export class Plume {
  constructor(knight, material, strands = 11) {
    this.head = knight.joints.head.obj;
    this.group = new THREE.Group();
    this.strands = [];
    const base = knight.extras.plumeBase;
    for (let s = 0; s < strands; s++) {
      const u = s / (strands - 1) - 0.5;
      const len = 1 - Math.abs(u) * 0.5;
      const curve = new THREE.CubicBezierCurve3(
        new THREE.Vector3(base.x + u * 0.03, base.y, base.z),
        new THREE.Vector3(u * 0.08, base.y + 0.2 * len, base.z - 0.05),
        new THREE.Vector3(u * 0.16, base.y + 0.1 * len, base.z - 0.36 * len),
        new THREE.Vector3(u * 0.22, base.y - 0.24 * len, base.z - 0.5 * len),
      );
      const rest = curve.getPoints(SEG - 1);
      const n = (SEG - 1) * SUB + 1;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * RAD * 3), 3));
      const idx = [];
      for (let i = 0; i < n - 1; i++) {
        for (let j = 0; j < RAD; j++) {
          const a = i * RAD + j, b = i * RAD + ((j + 1) % RAD);
          idx.push(a, a + RAD, b, b, a + RAD, b + RAD);
        }
      }
      geo.setIndex(idx);
      const mesh = new THREE.Mesh(geo, material);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.strands.push({
        rest, mesh, n, width: 0.034 * (0.7 + len * 0.4),
        p: rest.map((v) => v.clone()), q: rest.map((v) => v.clone()),
        lens: rest.slice(1).map((v, i) => v.distanceTo(rest[i])),
      });
    }
    this.enabled = true;
  }

  reset() {
    this.head.updateWorldMatrix(true, false);
    for (const st of this.strands) {
      st.rest.forEach((r, i) => {
        st.p[i].copy(r).applyMatrix4(this.head.matrixWorld);
        st.q[i].copy(st.p[i]);
      });
    }
    this.draw();
  }

  update(dt) {
    dt = Math.min(dt, 1 / 30);
    const mw = this.head.matrixWorld;
    const w = new THREE.Vector3();
    const g = -6 * dt * dt;
    for (const st of this.strands) {
      const { p, q, rest } = st;
      for (let i = 0; i < SEG; i++) {
        w.copy(rest[i]).applyMatrix4(mw);
        if (i < 2 || !this.enabled) {
          p[i].copy(w);
          q[i].copy(w);
          continue;
        }
        const k = 0.22 * (1 - i / SEG) ** 1.5 + 0.015;
        const v = p[i].clone().sub(q[i]).multiplyScalar(0.94);
        q[i].copy(p[i]);
        p[i].add(v).add(w.sub(p[i]).multiplyScalar(k));
        p[i].y += g;
      }
      for (let it = 0; it < 3; it++) {
        for (let i = 2; i < SEG; i++) {
          const a = p[i - 1], b = p[i];
          const d = b.clone().sub(a);
          const l = d.length() || 1e-6;
          if (i > 2) {
            const c = d.multiplyScalar((l - st.lens[i - 1]) / l * 0.5);
            a.add(c);
            b.sub(c);
          } else b.copy(a).add(d.multiplyScalar(st.lens[i - 1] / l));
        }
      }
    }
    this.draw();
  }

  draw() {
    const side = new THREE.Vector3(1, 0, 0).applyQuaternion(this.head.getWorldQuaternion(new THREE.Quaternion()));
    const t = new THREE.Vector3(), nrm = new THREE.Vector3(), bin = new THREE.Vector3(), c = new THREE.Vector3();
    for (const st of this.strands) {
      const curve = new THREE.CatmullRomCurve3(st.p);
      const pts = curve.getPoints(st.n - 1);
      const arr = st.mesh.geometry.attributes.position.array;
      for (let i = 0; i < st.n; i++) {
        const f = i / (st.n - 1);
        t.copy(pts[Math.min(i + 1, st.n - 1)]).sub(pts[Math.max(i - 1, 0)]).normalize();
        bin.copy(side).sub(t.clone().multiplyScalar(side.dot(t))).normalize();
        nrm.crossVectors(t, bin);
        const r = st.width * Math.sin(Math.min(1, f * 6 + 0.25) * Math.PI / 2) * (1 - f * 0.9);
        for (let j = 0; j < RAD; j++) {
          const a = (j / RAD) * Math.PI * 2;
          // 平たい羽根の断面
          c.copy(pts[i]).addScaledVector(bin, Math.cos(a) * r * 1.6).addScaledVector(nrm, Math.sin(a) * r * 0.45);
          arr.set([c.x, c.y, c.z], (i * RAD + j) * 3);
        }
      }
      st.mesh.geometry.attributes.position.needsUpdate = true;
      st.mesh.geometry.computeVertexNormals();
    }
  }
}
