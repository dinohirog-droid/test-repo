import * as THREE from 'three';

// カラーバリエーション(設定資料の 通常 / レッド / ブラック / ゴールド)
export const VARIANTS = {
  normal: { label: '通常', paint: 0x1f4fb8, cloth: '#1d3c9a', clothDark: '#0e1f55', plume: 0x2b5cff },
  red: { label: 'レッド', paint: 0xa01e2a, cloth: '#8c1822', clothDark: '#45090f', plume: 0xe02b36 },
  black: { label: 'ブラック', paint: 0x23262e, cloth: '#24262c', clothDark: '#0b0c10', plume: 0x2a2c33 },
  gold: { label: 'ゴールド', paint: 0xb88a2a, cloth: '#a87a22', clothDark: '#4f3608', plume: 0xe0a53a },
};

export const GLOW_COLOR = new THREE.Color(0x2fa4ff);

export function createMaterials() {
  const metal = (color, roughness, extra = {}) =>
    new THREE.MeshPhysicalMaterial({ color, metalness: 1, roughness, side: THREE.DoubleSide, ...extra });

  const M = {
    steel: metal(0xc4cad4, 0.3, { clearcoat: 0.5, clearcoatRoughness: 0.15 }),
    steelDark: metal(0x8a93a3, 0.38),
    gold: metal(0xd9ad55, 0.26),
    paint: new THREE.MeshPhysicalMaterial({
      color: VARIANTS.normal.paint, metalness: 0.45, roughness: 0.32,
      clearcoat: 1, clearcoatRoughness: 0.08, side: THREE.DoubleSide,
    }),
    suit: new THREE.MeshStandardMaterial({ color: 0x15181f, metalness: 0.35, roughness: 0.62 }),
    joint: new THREE.MeshStandardMaterial({ color: 0x2b303b, metalness: 0.85, roughness: 0.32 }),
    leather: new THREE.MeshStandardMaterial({ color: 0x5b3a22, roughness: 0.72 }),
    slit: new THREE.MeshStandardMaterial({ color: 0x030406, roughness: 0.95 }),
    glow: new THREE.MeshStandardMaterial({ color: 0x0b3a7a, emissive: GLOW_COLOR, emissiveIntensity: 8 }),
    glowSoft: new THREE.MeshStandardMaterial({ color: 0x0b3a7a, emissive: GLOW_COLOR, emissiveIntensity: 3 }),
    blade: new THREE.MeshPhysicalMaterial({
      color: 0x3f8fe0, emissive: 0x1a7cff, emissiveIntensity: 2.2, metalness: 0.1, roughness: 0.12,
      transparent: true, opacity: 0.88, side: THREE.DoubleSide,
    }),
    bladeCore: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x9fe0ff, emissiveIntensity: 6 }),
    tabard: new THREE.MeshStandardMaterial({ color: VARIANTS.normal.paint, roughness: 0.75, side: THREE.DoubleSide }),
    cloth: new THREE.MeshPhysicalMaterial({
      roughness: 0.82, sheen: 1, sheenRoughness: 0.45, sheenColor: new THREE.Color(0x7090ff),
      side: THREE.DoubleSide,
    }),
    plume: new THREE.MeshStandardMaterial({ color: VARIANTS.normal.plume, roughness: 0.55, side: THREE.DoubleSide }),
    emblem: metal(0xf2f4f8, 0.2),
  };
  M.capeTexture = new THREE.CanvasTexture(document.createElement('canvas'));
  applyVariant(M, 'normal');
  return M;
}

// マント用テクスチャ(グラデーション + 金縁 + 背中の十字)
function drawCape(v) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 1024;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 1024);
  grad.addColorStop(0, v.clothDark);
  grad.addColorStop(0.25, v.cloth);
  grad.addColorStop(1, v.cloth);
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 1024);
  // 織り目ノイズ
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(255,255,255,${Math.random() * 0.035})`;
    g.fillRect(Math.random() * 512, Math.random() * 1024, 2, 1);
  }
  // 金の縁取り
  g.fillStyle = '#d9ad55';
  g.fillRect(0, 1000, 512, 24);
  g.fillRect(0, 0, 12, 1024);
  g.fillRect(500, 0, 12, 1024);
  g.fillStyle = 'rgba(217,173,85,0.7)';
  g.fillRect(0, 978, 512, 6);
  // 背中の十字
  g.save();
  g.translate(256, 380);
  g.shadowColor = 'rgba(160,220,255,0.9)';
  g.shadowBlur = 24;
  g.fillStyle = '#eef3ff';
  const bar = (w, h) => {
    g.beginPath();
    g.moveTo(-w, -h + 30); g.lineTo(-w * 2.2, -h); g.lineTo(0, -h - 26); g.lineTo(w * 2.2, -h); g.lineTo(w, -h + 30);
    g.lineTo(w, h - 30); g.lineTo(w * 2.2, h); g.lineTo(0, h + 26); g.lineTo(-w * 2.2, h); g.lineTo(-w, h - 30);
    g.closePath(); g.fill();
  };
  bar(13, 170);
  g.rotate(Math.PI / 2);
  g.translate(-60, 0);
  bar(13, 115);
  g.restore();
  return c;
}

export function applyVariant(M, key) {
  const v = VARIANTS[key];
  M.paint.color.setHex(v.paint);
  M.tabard.color.setHex(v.paint).multiplyScalar(0.9);
  M.plume.color.setHex(v.plume);
  const tex = new THREE.CanvasTexture(drawCape(v));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  M.capeTexture.dispose();
  M.capeTexture = tex;
  M.cloth.map = tex;
  M.cloth.needsUpdate = true;
}
