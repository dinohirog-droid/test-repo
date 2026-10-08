import * as THREE from 'three';
import { ANKLE_HEIGHT, LEG_JOINTS } from './knight.js';

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _e = new THREE.Euler();
const X = new THREE.Vector3(1, 0, 0);

// 関節角度(度)の状態、ポーズ補間、脚 IK、連動パーツを管理する
export class Rig {
  constructor(knight, poses) {
    this.k = knight;
    this.poses = poses;
    this.angles = {};
    for (const n of Object.keys(knight.joints)) this.angles[n] = new THREE.Vector3();
    this.rootOff = new THREE.Vector3();
    this.yaw = 0;
    this.feet = { L: { x: 0.13, z: 0, yaw: 8, lift: 0, pitch: 0 }, R: { x: -0.13, z: 0, yaw: -8, lift: 0, pitch: 0 } };
    this.ik = true;
    this.breath = true;
    this.tween = null;
    this.action = null;
    this.trail = 0;
    this.time = 0;
    this.onPoseApplied = null;
  }

  isLeg(n) {
    return LEG_JOINTS.includes(n);
  }

  snapshot() {
    const s = { angles: {}, rootOff: this.rootOff.clone(), yaw: this.yaw, feet: {} };
    for (const [n, v] of Object.entries(this.angles)) s.angles[n] = v.clone();
    for (const f of ['L', 'R']) s.feet[f] = { ...this.feet[f] };
    return s;
  }

  resolve(pose, from, yawAdd = 0) {
    const to = { angles: {}, rootOff: new THREE.Vector3(...(pose.root || [0, 0, 0])), yaw: from.yaw + yawAdd, feet: {} };
    for (const n of Object.keys(this.angles)) {
      if (this.isLeg(n)) to.angles[n] = from.angles[n].clone();
      else to.angles[n] = new THREE.Vector3(...(pose.joints[n] || [0, 0, 0]));
    }
    for (const f of ['L', 'R']) {
      const [x, z, yaw, lift = 0, pitch = 0] = pose.feet[f];
      to.feet[f] = { x, z, yaw, lift, pitch };
    }
    return to;
  }

  setPose(name, dur = 0.6, opts = {}) {
    const from = this.snapshot();
    this.tween = { from, to: this.resolve(this.poses[name], from, opts.yawAdd || 0), t: 0, dur, trail: !!opts.trail };
    this.current = name;
  }

  playAction(steps, onDone) {
    this.action = { steps, i: 0, onDone };
    this.startStep();
  }

  startStep() {
    const st = this.action.steps[this.action.i];
    this.setPose(st.pose, st.dur, st);
  }

  stop() {
    this.tween = null;
    this.action = null;
    this.trail = 0;
  }

  update(dt) {
    this.time += dt;
    if (this.tween) {
      const tw = this.tween;
      tw.t = Math.min(1, tw.t + dt / tw.dur);
      const e = ease(tw.t);
      for (const n of Object.keys(this.angles)) {
        if (this.ik && this.isLeg(n)) continue;
        this.angles[n].lerpVectors(tw.from.angles[n], tw.to.angles[n], e);
      }
      this.rootOff.lerpVectors(tw.from.rootOff, tw.to.rootOff, e);
      this.yaw = tw.from.yaw + (tw.to.yaw - tw.from.yaw) * e;
      for (const f of ['L', 'R']) {
        const a = tw.from.feet[f], b = tw.to.feet[f], o = this.feet[f];
        for (const k of ['x', 'z', 'yaw', 'pitch', 'lift']) o[k] = a[k] + (b[k] - a[k]) * e;
        // 足が移動するときは自動で持ち上げる(ステップ)
        const dist = Math.hypot(b.x - a.x, b.z - a.z);
        o.lift += Math.sin(Math.PI * e) * Math.min(0.12, dist * 0.45);
      }
      this.trail = tw.trail ? 1 : Math.max(0, this.trail - dt * 4);
      if (tw.t >= 1) {
        this.tween = null;
        if (this.action) {
          this.action.i++;
          if (this.action.i < this.action.steps.length) this.startStep();
          else {
            const done = this.action.onDone;
            this.action = null;
            this.yaw = ((this.yaw % 360) + 540) % 360 - 180;
            done && done();
          }
        }
      }
    } else {
      this.trail = Math.max(0, this.trail - dt * 4);
    }
    this.apply();
  }

  apply() {
    const { joints } = this.k;
    const t = this.time;
    const b = this.breath && !this.action ? 1 : 0;
    const breath = {
      chest: [Math.sin(t * 1.7) * 1.4 * b, 0, 0],
      shoulder_L: [0, 0, Math.sin(t * 1.7 + 0.4) * 1.2 * b],
      shoulder_R: [0, 0, -Math.sin(t * 1.7 + 0.4) * 1.2 * b],
      head: [Math.sin(t * 0.9) * 1.2 * b, Math.sin(t * 0.5) * 2 * b, 0],
    };
    for (const [n, j] of Object.entries(joints)) {
      if (this.ik && this.isLeg(n)) continue;
      const a = this.angles[n];
      const o = breath[n] || [0, 0, 0];
      j.obj.rotation.set(
        clamp(a.x + o[0], ...j.lim.x) * D2R,
        clamp(a.y + o[1], ...j.lim.y) * D2R,
        clamp(a.z + o[2], ...j.lim.z) * D2R,
      );
    }
    const hips = joints.hips;
    hips.obj.position.copy(hips.rest).add(this.rootOff);
    hips.obj.position.y += Math.sin(t * 1.7) * 0.004 * b;
    this.k.root.rotation.y = this.yaw * D2R;
    this.k.root.updateMatrixWorld(true);

    if (this.ik) {
      this.solveLeg('L');
      this.solveLeg('R');
    }
    this.followers();
    this.k.root.updateMatrixWorld(true);
  }

  // 2 ボーン解析 IK: 足首を目標位置に置き、膝を足先の方向へ曲げる
  solveLeg(s) {
    const J = this.k.joints;
    const root = this.k.root, hips = J.hips.obj;
    const hip = J[`hip_${s}`].obj, knee = J[`knee_${s}`].obj, ankle = J[`ankle_${s}`].obj;
    const L1 = knee.position.length(), L2 = ankle.position.length();
    const f = this.feet[s];

    const tgt = root.localToWorld(_v.set(f.x, ANKLE_HEIGHT + Math.max(0, f.lift), f.z));
    hips.worldToLocal(tgt);
    const d = tgt.sub(hip.position);
    const dist = clamp(d.length(), 0.08, (L1 + L2) * 0.9995);
    const aim = d.normalize().clone();

    const yaw = f.yaw * D2R;
    const pole = new THREE.Vector3(Math.sin(yaw) * 0.9, 0, Math.cos(yaw)).normalize();
    pole.applyQuaternion(root.getWorldQuaternion(_q));
    pole.applyQuaternion(hips.getWorldQuaternion(_q2).invert());
    const perp = pole.sub(aim.clone().multiplyScalar(pole.dot(aim))).normalize();

    const a = Math.acos(clamp((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1));
    const thigh = aim.clone().multiplyScalar(Math.cos(a)).add(perp.clone().multiplyScalar(Math.sin(a)));
    const yAx = thigh.clone().negate();
    const zAx = perp.clone().sub(thigh.clone().multiplyScalar(perp.dot(thigh))).normalize();
    const xAx = new THREE.Vector3().crossVectors(yAx, zAx);
    hip.quaternion.setFromRotationMatrix(_m.makeBasis(xAx, yAx, zAx));
    const kneeA = Math.PI - Math.acos(clamp((L1 * L1 + L2 * L2 - dist * dist) / (2 * L1 * L2), -1, 1));
    knee.quaternion.setFromAxisAngle(X, kneeA);

    // 足裏を地面に合わせる(つま先立ちは pitch)
    const want = root.getWorldQuaternion(_q).multiply(_q2.setFromEuler(_e.set(f.pitch * D2R, yaw, 0, 'YXZ')));
    ankle.quaternion.copy(knee.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(want));

    for (const [n, o] of [[`hip_${s}`, hip], [`knee_${s}`, knee], [`ankle_${s}`, ankle]]) {
      this.angles[n].set(o.rotation.x * R2D, o.rotation.y * R2D, o.rotation.z * R2D);
    }
  }

  // 肩当て・草摺・前垂れを関節に部分追従させる
  followers() {
    const J = this.k.joints, ex = this.k.extras;
    for (const s of ['L', 'R']) {
      const sr = J[`shoulder_${s}`].obj.rotation;
      ex[`pauldron_${s}`].rotation.set(sr.x * 0.3, sr.y * 0.25, sr.z * 0.5);
      const hr = J[`hip_${s}`].obj.rotation;
      ex[`tasset_${s}`].rotation.set(hr.x * 0.6, 0, hr.z * 0.75);
    }
    const l = J.hip_L.obj.rotation, r = J.hip_R.obj.rotation;
    ex.tabardF.rotation.x = Math.min(0, l.x, r.x) * 0.9;
    ex.tabardB.rotation.x = Math.max(0, l.x, r.x) * 0.9;
  }
}
