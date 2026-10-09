// ヘッドレス Chromium でリポジトリのページを開く。
// CDN(cdn.jsdelivr.net)の three はローカルの node_modules に差し替えるので、オフラインでも動く。
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const TOOLS = path.resolve(HERE, '..');
export const REPO = path.resolve(TOOLS, '..');
const NM = path.join(TOOLS, 'node_modules');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };

function threeFile(urlPath) {
  // /npm/three@0.170.0/build/three.module.js → node_modules/three/build/three.module.js
  const m = urlPath.match(/^\/npm\/three@([\d.]+)\/(.*)$/);
  if (!m) return null;
  const pkg = m[1].startsWith('0.128') ? 'three128' : 'three';
  return path.join(NM, pkg, m[2]);
}

export async function openPage(pagePath, { width = 1280, height = 800, gl = true } = {}) {
  const args = gl ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [];
  // CHROME_PATH を指定すると、そのブラウザを使う(Playwright のブラウザを入れていない環境向け)
  const browser = await chromium.launch({ args, executablePath: process.env.CHROME_PATH || undefined });
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  await page.route('**/*', async (route) => {
    const u = new URL(route.request().url());
    if (u.hostname === 'cdn.jsdelivr.net') {
      const f = threeFile(u.pathname);
      if (f && fs.existsSync(f)) return route.fulfill({ path: f, contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' } });
      return route.fulfill({ status: 404, body: '' });
    }
    if (u.hostname === 'local') {
      const f = path.join(REPO, decodeURIComponent(u.pathname));
      if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ path: f, contentType: TYPES[path.extname(f)] || 'application/octet-stream' });
    }
    return route.fulfill({ status: 200, body: '' }); // フォントなど外部は空で返す
  });
  await page.goto('http://local/' + pagePath.replace(/^\.?\//, ''));
  return { browser, page, errors };
}
