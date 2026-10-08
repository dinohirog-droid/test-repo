import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createMaterials, applyVariant, VARIANTS, GLOW_COLOR } from './materials.js';
import { buildKnight } from './knight.js';
import { Rig } from './rig.js';
import { POSES, ACTIONS } from './poses.js';
import { Cape } from './cape.js';
import { Plume } from './plume.js';
import { SwordTrail } from './trail.js';

// ---------- レンダラ / シーン ----------
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070b14);
scene.fog = new THREE.Fog(0x070b14, 7, 18);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.45;

const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 50);
camera.position.set(2.3, 1.55, 3.8);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 1.0, 0);
controls.enableDamping = true;
controls.minDistance = 0.8;
controls.maxDistance = 9;
controls.maxPolarAngle = Math.PI * 0.53;
controls.autoRotateSpeed = 0.8;

scene.add(new THREE.HemisphereLight(0x9fb8ff, 0x101018, 0.25));
const key = new THREE.DirectionalLight(0xfff4e8, 1.6);
key.position.set(3, 5, 4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = key.shadow.camera.bottom = -2.2;
key.shadow.camera.right = key.shadow.camera.top = 2.2;
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
scene.add(key);
const rim = new THREE.DirectionalLight(0x4aa8ff, 2.2);
rim.position.set(-3, 3, -4);
scene.add(rim);
const fill = new THREE.DirectionalLight(0xffd9a8, 0.6);
fill.position.set(-4, 2, 3);
scene.add(fill);

// 台座
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(6, 64),
  new THREE.MeshStandardMaterial({ color: 0x0b111c, roughness: 0.7, metalness: 0.2 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
for (const [r, o] of [[1.2, 0.5], [1.26, 0.25], [2.4, 0.15]]) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(r, r + 0.012, 128),
    new THREE.MeshBasicMaterial({ color: GLOW_COLOR, transparent: true, opacity: o, toneMapped: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.002;
  scene.add(ring);
}
const grid = new THREE.GridHelper(12, 48, 0x15223a, 0x0e1626);
grid.position.y = 0.001;
scene.add(grid);

// 漂う光の粒
const sparkGeo = new THREE.BufferGeometry();
const sparkN = 260;
const sparkPos = new Float32Array(sparkN * 3);
for (let i = 0; i < sparkN; i++) {
  sparkPos.set([(Math.random() - 0.5) * 7, Math.random() * 3.5, (Math.random() - 0.5) * 7], i * 3);
}
sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({
  color: 0x6cc6ff, size: 0.018, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false,
}));
scene.add(sparks);

// ---------- ナイト ----------
const M = createMaterials();
const knight = buildKnight(M);
scene.add(knight.root);
const rig = new Rig(knight, POSES);
rig.setPose('idle', 0.01);
rig.update(0.02);

const cape = new Cape(knight, M.cloth);
scene.add(cape.mesh);
cape.reset();
const plume = new Plume(knight, M.plume);
scene.add(plume.group);
plume.reset();
const trail = new SwordTrail(0x3aa8ff);
scene.add(trail.mesh);

// ---------- ポストエフェクト ----------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.7, 0.5, 3.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  // 縦長画面では画角を広げて全身を収める
  camera.fov = camera.aspect < 1 ? Math.min(62, 26 / camera.aspect) : 32;
  // スマホ幅では下部パネルの分だけ画面を上にずらす
  if (w <= 760) camera.setViewOffset(w, h, 0, h * 0.2, w, h);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);
resize();

// ---------- UI ----------
const $ = (s) => document.querySelector(s);
const ui = { selected: 'shoulder_R', markers: false };

function button(parent, label, onClick, cls = '') {
  const b = document.createElement('button');
  b.textContent = label;
  b.className = cls;
  b.addEventListener('click', onClick);
  parent.appendChild(b);
  return b;
}

const poseBtns = {};
for (const [k, p] of Object.entries(POSES)) {
  if (p.hidden || k === 'spinStrike' || k === 'charge') continue;
  poseBtns[k] = button($('#poses'), p.label, () => {
    rig.stop();
    rig.setPose(k, 0.7);
    markPose(k);
  });
}
function markPose(k) {
  for (const [n, b] of Object.entries(poseBtns)) b.classList.toggle('on', n === k);
}
markPose('idle');

for (const [k, a] of Object.entries(ACTIONS)) {
  button($('#actions'), a.label, () => {
    rig.stop();
    markPose('guard');
    rig.playAction(a.steps);
  }, 'action');
}

for (const [k, v] of Object.entries(VARIANTS)) {
  const b = button($('#variants'), v.label, () => {
    applyVariant(M, k);
    document.querySelectorAll('#variants button').forEach((x) => x.classList.toggle('on', x === b));
  });
  b.style.setProperty('--sw', `#${new THREE.Color(v.paint).getHexString()}`);
  if (k === 'normal') b.classList.add('on');
}

const toggles = {
  markers: (on) => {
    ui.markers = on;
    for (const j of Object.values(knight.joints)) j.marker.visible = on;
    highlight();
  },
  ik: (on) => {
    rig.ik = on;
    syncEditor();
  },
  physics: (on) => {
    cape.enabled = on;
    plume.enabled = on;
  },
  breath: (on) => (rig.breath = on),
  spin: (on) => (controls.autoRotate = on),
};
document.querySelectorAll('[data-toggle]').forEach((el) => {
  el.addEventListener('change', () => toggles[el.dataset.toggle](el.checked));
});

// 関節エディタ
const sel = $('#joint');
const rootOpt = document.createElement('option');
rootOpt.value = 'root';
rootOpt.textContent = '重心(腰の位置)';
sel.appendChild(rootOpt);
for (const [n, j] of Object.entries(knight.joints)) {
  const o = document.createElement('option');
  o.value = n;
  o.textContent = j.label;
  sel.appendChild(o);
}
sel.value = ui.selected;
sel.addEventListener('change', () => select(sel.value));

const sliders = ['x', 'y', 'z'].map((ax) => {
  const row = $(`#ax-${ax}`);
  const input = row.querySelector('input');
  const out = row.querySelector('output');
  input.addEventListener('input', () => {
    rig.stop();
    rig.current = null;
    markPose(null);
    const v = parseFloat(input.value);
    if (ui.selected === 'root') rig.rootOff[ax] = v / 100;
    else rig.angles[ui.selected][ax] = v;
  });
  return { ax, row, input, out };
});

$('#reset-joint').addEventListener('click', () => {
  rig.stop();
  if (ui.selected === 'root') rig.rootOff.set(0, 0, 0);
  else rig.angles[ui.selected].set(0, 0, 0);
});

function select(name) {
  ui.selected = name;
  sel.value = name;
  highlight();
  syncEditor(true);
}

function highlight() {
  for (const [n, j] of Object.entries(knight.joints)) {
    j.marker.material.color.set(n === ui.selected ? 0xffa53a : 0x7fd8ff);
    j.marker.scale.setScalar(n === ui.selected ? 1.5 : 1);
  }
}

const AX_NAMES = { x: 'X 前後', y: 'Y ひねり', z: 'Z 左右' };
const ROOT_NAMES = { x: '左右 cm', y: '上下 cm', z: '前後 cm' };
function syncEditor(full = false) {
  const n = ui.selected;
  const isRoot = n === 'root';
  const j = knight.joints[n];
  const locked = !isRoot && rig.ik && rig.isLeg(n);
  $('#ik-note').hidden = !locked;
  for (const s of sliders) {
    const lim = isRoot ? (s.ax === 'y' ? [-35, 5] : [-25, 25]) : j.lim[s.ax];
    const fixed = lim[0] === lim[1];
    s.row.hidden = fixed;
    if (fixed) continue;
    if (full) {
      s.input.min = lim[0];
      s.input.max = lim[1];
      s.input.step = isRoot ? 0.5 : 1;
      s.row.querySelector('span').textContent = isRoot ? ROOT_NAMES[s.ax] : AX_NAMES[s.ax];
    }
    s.input.disabled = locked;
    const v = isRoot ? rig.rootOff[s.ax] * 100 : rig.angles[n][s.ax];
    if (document.activeElement !== s.input) s.input.value = v;
    s.out.textContent = `${Math.round(v)}`;
  }
  $('#range').textContent = isRoot
    ? '腰を下げると脚 IK が膝を曲げて接地を保ちます'
    : `可動域 ${['x', 'y', 'z'].filter((a) => j.lim[a][0] !== j.lim[a][1]).map((a) => `${a.toUpperCase()} ${j.lim[a][0]}〜${j.lim[a][1]}°`).join(' / ')}`;
}
select(ui.selected);

// クリックで関節を選択(マーカー表示中)
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let down = null;
canvas.addEventListener('pointerdown', (e) => (down = [e.clientX, e.clientY]));
canvas.addEventListener('pointerup', (e) => {
  if (!down || !ui.markers || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(Object.values(knight.joints).map((j) => j.marker))[0];
  if (hit) select(hit.object.userData.joint);
});

// スマホ幅: パネル → 関節エディタ → 非表示 を切り替え
const panelModes = ['', 'editor', 'collapsed'];
let panelMode = 0;
$('#panel-toggle').addEventListener('click', () => {
  document.body.classList.remove('editor', 'collapsed');
  panelMode = (panelMode + 1) % panelModes.length;
  if (panelModes[panelMode]) document.body.classList.add(panelModes[panelMode]);
  $('#panel-toggle').textContent = ['パネル', '関節', '表示'][panelMode];
});

// ---------- ループ ----------
const clock = new THREE.Clock();
const wb = new THREE.Vector3(), wt = new THREE.Vector3();
function simulate(dt) {
  rig.update(dt);
  cape.update(dt);
  plume.update(dt);
  knight.extras.sword.updateWorldMatrix(true, false);
  wb.copy(knight.extras.swordBase).applyMatrix4(knight.extras.sword.matrixWorld);
  wt.copy(knight.extras.swordTip).applyMatrix4(knight.extras.sword.matrixWorld);
  trail.update(wb, wt, rig.trail, rig.time);

  const sp = sparkGeo.attributes.position.array;
  for (let i = 1; i < sp.length; i += 3) sp[i] = sp[i] > 3.5 ? 0 : sp[i] + dt * 0.08;
  sparkGeo.attributes.position.needsUpdate = true;

  const pulse = Math.sin(rig.time * 2.2);
  M.glow.emissiveIntensity = 7.5 + pulse * 1.5;
  M.glowSoft.emissiveIntensity = 3 + pulse * 0.6;
}

function frame() {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  if (!window.__knight?.paused) simulate(dt);
  if (!rig.tween && !rig.action && rig.current && poseBtns[rig.current]) markPose(rig.current);
  syncEditor();
  controls.update();
  composer.render();
  requestAnimationFrame(frame);
}
frame();

// テスト・デバッグ用
window.__knight = {
  step: (n, dt = 1 / 60) => { for (let i = 0; i < n; i++) simulate(dt); },
  bloom, renderer, rig, knight, cape, plume, camera, controls, select, POSES };
