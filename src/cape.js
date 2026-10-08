import * as THREE from 'three';

// Verlet 積分の布シミュレーション。上端を胸に固定し、体の球コライダーと衝突させる。
export class Cape {
  constructor(knight, material, { cols = 15, rows = 22, length = 1.12 } = {}) {
    this.k = knight;
    this.cols = cols;
    this.rows = rows;
    this.anchor = knight.joints.chest.obj;
    this.enabled = true;
    const n = cols * rows;
    this.pos = new Float32Array(n * 3);
    this.prev = new Float32Array(n * 3);

    // 肩の後ろを回る固定点(胸ローカル座標)
    this.pinsLocal = [];
    for (let c = 0; c < cols; c++) {
      const u = (c / (cols - 1)) * 2 - 1;
      this.pinsLocal.push(new THREE.Vector3(u * 0.27, 0.29 - Math.abs(u) ** 2 * 0.03, -0.06 - 0.115 * (1 - u * u)));
    }
    let top = 0;
    for (let c = 1; c < cols; c++) top += this.pinsLocal[c].distanceTo(this.pinsLocal[c - 1]);
    const dx = top / (cols - 1), dy = length / (rows - 1);

    const C = [];
    const id = (r, c) => r * cols + c;
    for (let r = 0; r < rows; r++) {
      const flare = 1 + 0.55 * (r / (rows - 1));
      for (let c = 0; c < cols; c++) {
        if (c < cols - 1) C.push(id(r, c), id(r, c + 1), dx * flare);
        if (r < rows - 1) C.push(id(r, c), id(r + 1, c), dy);
        if (r < rows - 2) C.push(id(r, c), id(r + 2, c), dy * 2);
        if (r < rows - 1 && c < cols - 1) {
          const d = Math.hypot(dx * flare, dy);
          C.push(id(r, c), id(r + 1, c + 1), d, id(r, c + 1), id(r + 1, c), d);
        }
      }
    }
    this.C = new Float32Array(C);

    const geo = new THREE.PlaneGeometry(1, 1, cols - 1, rows - 1);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;

    this.colliders = knight.colliders.map((c) => ({ ...c, w: new THREE.Vector3(), cv: new THREE.Vector3(...c.c) }));
    this.pinsWorld = this.pinsLocal.map(() => new THREE.Vector3());
    this.time = 0;
    this.inv = new THREE.Matrix4();
    this.tmp = new THREE.Vector3();
  }

  updatePins() {
    this.anchor.updateWorldMatrix(true, false);
    this.pinsLocal.forEach((p, i) => this.pinsWorld[i].copy(p).applyMatrix4(this.anchor.matrixWorld));
  }

  reset() {
    this.updatePins();
    const { cols, rows, pos, prev } = this;
    const dy = 1.12 / (rows - 1);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = (r * cols + c) * 3, p = this.pinsWorld[c];
        pos[i] = p.x * (1 + r * 0.02);
        pos[i + 1] = p.y - r * dy;
        pos[i + 2] = p.z - 0.05 - r * 0.004;
      }
    }
    prev.set(pos);
    for (let i = 0; i < 90; i++) this.step(1 / 60);
  }

  update(dt) {
    if (!this.enabled) return;
    const h = Math.min(dt, 1 / 30) / 2;
    this.step(h);
    this.step(h);
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
  }

  step(dt) {
    this.time += dt;
    this.updatePins();
    for (const c of this.colliders) c.w.copy(c.cv).applyMatrix4(c.obj.matrixWorld);
    const { cols, pos, prev, C } = this;
    const n = pos.length / 3;
    const g = -9.8 * dt * dt;
    const t = this.time;
    const wind = (0.6 + Math.sin(t * 0.7) * 0.4) * dt * dt;
    const damp = 0.985;

    for (let i = 0; i < n; i++) {
      const k = i * 3;
      if (i < cols) continue;
      const x = pos[k], y = pos[k + 1], z = pos[k + 2];
      const gust = Math.sin(t * 2.3 + i * 0.37) * 0.6;
      pos[k] += (x - prev[k]) * damp + gust * wind * 0.4;
      pos[k + 1] += (y - prev[k + 1]) * damp + g;
      pos[k + 2] += (z - prev[k + 2]) * damp - wind * (1 + gust);
      prev[k] = x; prev[k + 1] = y; prev[k + 2] = z;
    }

    for (let it = 0; it < 12; it++) {
      for (let c = 0; c < cols; c++) {
        const p = this.pinsWorld[c], k = c * 3;
        pos[k] = p.x; pos[k + 1] = p.y; pos[k + 2] = p.z;
      }
      for (let j = 0; j < C.length; j += 3) {
        const a = C[j] * 3, b = C[j + 1] * 3, rest = C[j + 2];
        const dx = pos[b] - pos[a], dy = pos[b + 1] - pos[a + 1], dz = pos[b + 2] - pos[a + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        // 布は伸びにくく縮みやすい
        const diff = d > rest ? (d - rest) / d : ((d - rest) / d) * 0.25;
        const pa = C[j] < cols ? 0 : 0.5, pb = C[j + 1] < cols ? 0 : 0.5;
        const s = pa + pb ? diff / (pa + pb) : 0;
        pos[a] += dx * s * pa; pos[a + 1] += dy * s * pa; pos[a + 2] += dz * s * pa;
        pos[b] -= dx * s * pb; pos[b + 1] -= dy * s * pb; pos[b + 2] -= dz * s * pb;
      }
      if (it % 3 === 2) this.collide();
    }
    this.collide();
  }

  collide() {
    const { pos, cols } = this;
    const n = pos.length / 3;
    const inv = this.inv.copy(this.anchor.matrixWorld).invert();
    const fw = this.anchor.matrixWorld;
    const v = this.tmp;
    for (let i = cols; i < n; i++) {
      const k = i * 3;
      // 胸ローカルで「背中側・肩より下」に留める(高速回転で前に回り込まないように)
      v.set(pos[k], pos[k + 1], pos[k + 2]).applyMatrix4(inv);
      const zMax = -0.02 + Math.max(0, Math.abs(v.x) - 0.24) * 1.2;
      if (v.z > zMax || v.y > 0.3) {
        v.z = Math.min(v.z, zMax);
        v.y = Math.min(v.y, 0.3);
        v.applyMatrix4(fw);
        pos[k] = v.x; pos[k + 1] = v.y; pos[k + 2] = v.z;
      }
      for (const c of this.colliders) {
        const r = c.r + 0.018;
        const dx = pos[k] - c.w.x, dy = pos[k + 1] - c.w.y, dz = pos[k + 2] - c.w.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < r * r) {
          const d = Math.sqrt(d2) || 1e-6, s = r / d;
          pos[k] = c.w.x + dx * s; pos[k + 1] = c.w.y + dy * s; pos[k + 2] = c.w.z + dz * s;
        }
      }
      if (pos[k + 1] < 0.01) pos[k + 1] = 0.01;
    }
  }
}
