import * as THREE from 'three';

// 剣の軌跡: 刃の根元と先端の位置を記録してリボンを描く(加算合成)
export class SwordTrail {
  constructor(color, n = 32) {
    this.n = n;
    this.samples = [];
    this.color = new THREE.Color(color);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
    const idx = [];
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(idx);
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        vertexColors: true, transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
      }),
    );
    this.mesh.frustumCulled = false;
  }

  // 直近 0.22 秒ぶんの軌跡だけを残す(フレームレートに依存しない)
  update(base, tip, strength, time) {
    this.samples.push({ b: base.clone(), t: tip.clone(), s: strength, time });
    while (this.samples.length > 2 && (this.samples.length > this.n * 4 || time - this.samples[0].time > 0.22)) {
      this.samples.shift();
    }
    const pos = this.mesh.geometry.attributes.position.array;
    const col = this.mesh.geometry.attributes.color.array;
    const S = this.samples;
    for (let i = 0; i < this.n; i++) {
      const smp = S[Math.round((i / (this.n - 1)) * (S.length - 1))];
      const age = 1 - Math.min(1, (time - smp.time) / 0.22);
      const k = smp.s * age * age;
      pos.set([smp.b.x, smp.b.y, smp.b.z, smp.t.x, smp.t.y, smp.t.z], i * 6);
      const c = this.color;
      col.set([c.r * k * 0.3, c.g * k * 0.3, c.b * k * 0.3, c.r * k * 2.2, c.g * k * 2.2, c.b * k * 2.2], i * 6);
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.color.needsUpdate = true;
    this.mesh.visible = S.some((s) => s.s > 0.01 && time - s.time < 0.22);
  }
}
