// Cyber Knight Studio: cyber-knight-model.js を読み込んで表示・操作するビューア
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const Model = window.CyberKnightModel;

// ---------- レンダラ / シーン ----------
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070b14);
scene.fog = new THREE.Fog(0x070b14, 7, 18);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.45;

const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 50);
camera.position.set(2.3, 1.55, 3.8);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 1.0, 0);
controls.enableDamping = true;
controls.minDistance = 0.6;
controls.maxDistance = 9;
controls.maxPolarAngle = Math.PI * 0.53;
controls.autoRotateSpeed = 0.8;

scene.add(new THREE.HemisphereLight(0x9fb8ff, 0x101018, 0.25));
const key = new THREE.DirectionalLight(0xfff4e8, 1.6);
key.position.set(3, 5, 4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -2.2, right: 2.2, top: 2.2, bottom: -2.2 });
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
scene.add(key);
const rim = new THREE.DirectionalLight(0x4aa8ff, 2.2);
rim.position.set(-3, 3, -4);
scene.add(rim);
const fill = new THREE.DirectionalLight(0xffd9a8, 0.6);
fill.position.set(-4, 2, 3);
scene.add(fill);

const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 64), new THREE.MeshStandardMaterial({ color: 0x0b111c, roughness: 0.7, metalness: 0.2 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
for (const [r, o] of [[1.2, 0.5], [1.26, 0.25], [2.4, 0.15]]) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.012, 128), new THREE.MeshBasicMaterial({ color: 0x2fa4ff, transparent: true, opacity: o, toneMapped: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.002;
  scene.add(ring);
}
const grid = new THREE.GridHelper(12, 48, 0x15223a, 0x0e1626);
grid.position.y = 0.001;
scene.add(grid);

const sparkGeo = new THREE.BufferGeometry();
const sparkPos = new Float32Array(260 * 3);
for (let i = 0; i < 260; i++) sparkPos.set([(Math.random() - 0.5) * 7, Math.random() * 3.5, (Math.random() - 0.5) * 7], i * 3);
sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
scene.add(new THREE.Points(sparkGeo, new THREE.PointsMaterial({ color: 0x6cc6ff, size: 0.018, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })));

// ---------- ナイト ----------
const K = Model.create(THREE, scene, { scale: 1 });

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
  // 縦長画面では画角を広げ、下部パネルの分だけ画面を上にずらす
  camera.fov = camera.aspect < 1 ? Math.min(62, 26 / camera.aspect) : 32;
  if (w <= 760) camera.setViewOffset(w, h, 0, h * 0.2, w, h);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);
resize();

// ---------- UI ----------
const $ = (s) => document.querySelector(s);
function button(parent, label, onClick, cls = '') {
  const b = document.createElement('button');
  b.textContent = label;
  b.className = cls;
  b.addEventListener('click', onClick);
  $(parent).appendChild(b);
  return b;
}
const group = (sel, b) => document.querySelectorAll(`${sel} button`).forEach((x) => x.classList.toggle('on', x === b));

const MODE_LABELS = { idle: '待機', guard: '構え', block: '防御', visor: '素顔', walk: '歩く', run: '走る' };
const ACTION_LABELS = { spin: '回転斬り', charge: '突進' };
const modeBtns = {};
for (const [m, label] of Object.entries(MODE_LABELS)) modeBtns[m] = button('#modes', label, () => K.setMode(m));
for (const [m, label] of Object.entries(ACTION_LABELS)) modeBtns[m] = button('#actions', label, () => K.setMode(m), 'action');

for (const [k, v] of Object.entries(K.COLORS)) {
  const b = button('#variants', v.label, () => { K.setColor(k); group('#variants', b); });
  b.style.setProperty('--sw', `#${new THREE.Color(v.paint).getHexString()}`);
  if (k === K.getColor()) b.classList.add('on');
}

// 手の差し替え(握り手・持ち手・開き手)と装備
const HAND_LABELS = { grip: '持ち手', fist: '握り手', open: '開き手', relax: '自然' };
for (const s of ['R', 'L']) {
  for (const [h, label] of Object.entries(HAND_LABELS)) {
    button(`#hand-${s}`, label, () => { K.setHand(s, h === 'grip' ? null : h); syncEquip(); });
  }
}
const eqSword = $('#eq-sword'), eqShield = $('#eq-shield');
eqSword.addEventListener('change', () => { K.setEquip({ sword: eqSword.checked }); syncEquip(); });
eqShield.addEventListener('change', () => { K.setEquip({ shield: eqShield.checked }); syncEquip(); });
function syncEquip() {
  const e = K.getEquip();
  eqSword.checked = e.sword;
  eqShield.checked = e.shield;
  for (const s of ['R', 'L']) {
    const holding = s === 'R' ? e.sword : e.shield;
    const cur = holding ? 'grip' : K.getHand(s) || 'grip';
    document.querySelectorAll(`#hand-${s} button`).forEach((b, i) => b.classList.toggle('on', Object.keys(HAND_LABELS)[i] === cur));
  }
}
syncEquip();

const clr = $('#clearance');
clr.value = K.getShieldClearance() * 100;
$('#clearance-out').textContent = `${Math.round(clr.value)} cm`;
clr.addEventListener('input', () => {
  K.setShieldClearance(clr.value / 100);
  $('#clearance-out').textContent = `${Math.round(clr.value)} cm`;
});

const olOn = $('#outline-on'), olW = $('#outline-w');
olOn.checked = K.getOutline().on;
olW.value = K.getOutline().width * 1000;
olOn.addEventListener('change', () => K.setOutline(olOn.checked));
olW.addEventListener('input', () => K.setOutline(true, olW.value / 1000) || (olOn.checked = true));

let markersOn = false;
const toggles = {
  markers: (on) => { markersOn = on; K.markers.forEach((m) => (m.visible = on)); highlight(); },
  ik: (on) => { K.setIK(on); syncEditor(true); },
  physics: (on) => K.setPhysics(on),
  look: (on) => K.setLook(on),
  spin: (on) => (controls.autoRotate = on),
};
document.querySelectorAll('[data-toggle]').forEach((el) => el.addEventListener('change', () => toggles[el.dataset.toggle](el.checked)));

// 関節エディタ
const ui = { selected: 'shoulder_R' };
const sel = $('#joint');
sel.add(new Option('重心(腰の位置)', 'root'));
for (const j of K.JOINTS) sel.add(new Option(j.label, j.name));
sel.addEventListener('change', () => select(sel.value));
const sliders = ['x', 'y', 'z'].map((ax) => {
  const row = $(`#ax-${ax}`);
  const input = row.querySelector('input');
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    if (ui.selected === 'root') K.editRoot(ax, v / 100);
    else K.editJoint(ui.selected, ax, v);
  });
  return { ax, row, input, out: row.querySelector('output') };
});
$('#reset-joint').addEventListener('click', () => {
  if (ui.selected === 'root') ['x', 'y', 'z'].forEach((a) => K.editRoot(a, 0));
  else ['x', 'y', 'z'].forEach((a) => K.editJoint(ui.selected, a, 0));
});
function select(name) {
  ui.selected = name;
  sel.value = name;
  highlight();
  syncEditor(true);
}
function highlight() {
  for (const m of K.markers) {
    const on = m.userData.joint === ui.selected;
    m.material.color.set(on ? 0xffa53a : 0x7fd8ff);
    m.scale.setScalar(on ? 1.5 : 1);
  }
}
const AX = { x: 'X 前後', y: 'Y ひねり', z: 'Z 左右' };
const AXR = { x: '左右 cm', y: '上下 cm', z: '前後 cm' };
const JL = Object.fromEntries(K.JOINTS.map((j) => [j.name, j]));
function syncEditor(full = false) {
  const n = ui.selected, isRoot = n === 'root', j = JL[n];
  const locked = !isRoot && K.getState().ik && K.isLeg(n);
  const P = K.getPose();
  $('#ik-note').hidden = !locked;
  for (const s of sliders) {
    const lim = isRoot ? (s.ax === 'y' ? [-35, 5] : [-25, 25]) : j.lim[s.ax];
    s.row.hidden = lim[0] === lim[1];
    if (s.row.hidden) continue;
    if (full) {
      Object.assign(s.input, { min: lim[0], max: lim[1], step: isRoot ? 0.5 : 1 });
      s.row.querySelector('span').textContent = isRoot ? AXR[s.ax] : AX[s.ax];
    }
    s.input.disabled = locked;
    const i = 'xyz'.indexOf(s.ax);
    const v = isRoot ? P.root[i] * 100 : P.j[n][i];
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
let down = null;
canvas.addEventListener('pointerdown', (e) => (down = [e.clientX, e.clientY]));
canvas.addEventListener('pointerup', (e) => {
  if (!down || !markersOn || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
  const r = canvas.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
  const hit = ray.intersectObjects(K.markers)[0];
  if (hit) select(hit.object.userData.joint);
});

// スマホ幅: パネル → 関節エディタ → 非表示
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
let t = 0;
function simulate(dt) {
  t += dt;
  K.update(dt, t, camera);
  const sp = sparkGeo.attributes.position.array;
  for (let i = 1; i < sp.length; i += 3) sp[i] = sp[i] > 3.5 ? 0 : sp[i] + dt * 0.08;
  sparkGeo.attributes.position.needsUpdate = true;
}
function frame() {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  if (!window.__studio?.paused) simulate(dt);
  const m = K.getMode();
  for (const [k, b] of Object.entries(modeBtns)) b.classList.toggle('on', k === m);
  syncEditor();
  controls.update();
  composer.render();
  requestAnimationFrame(frame);
}
frame();

// テスト・デバッグ用
window.__studio = {
  K, camera, controls, bloom, select,
  step: (n, dt = 1 / 60) => { for (let i = 0; i < n; i++) simulate(dt); },
};
