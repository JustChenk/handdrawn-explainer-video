#!/usr/bin/env node
'use strict';
/* =========================================================
   render.js —— 逐帧渲染 video.html → JPEG 帧序列
   用法:
     node render.js <html_path> <frames_dir> [--fps 24] [--dur 170] [--test "3.2,8,14"]
   示例:
     node render.js /workspace/video.html ./frames --fps 24 --dur 170
     node render.js /workspace/video.html ./testframes --test "3.2,8,24,58"   # 自检模式
   依赖: playwright-core (npm i playwright-core, 不会下载浏览器)
   ========================================================= */
const fs = require('fs');
const path = require('path');

function arg(name, dflt) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}
const HTML = process.argv[2];
const OUT_DIR = process.argv[3];
const FPS = parseInt(arg('--fps', '24'), 10);
const DUR = parseFloat(arg('--dur', '170'));
const TEST = arg('--test', null);

if (!HTML || !OUT_DIR) {
  console.error('用法: node render.js <html_path> <frames_dir> [--fps 24] [--dur 170] [--test "3.2,8"]');
  process.exit(1);
}

/* 自动探测 Chromium 可执行文件 */
function findChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const base = path.join(process.env.HOME || '/root', '.cache/ms-playwright');
  const candidates = [];
  if (fs.existsSync(base)) {
    for (const d of fs.readdirSync(base)) {
      candidates.push(path.join(base, d, 'chrome-linux64', 'chrome'));
      candidates.push(path.join(base, d, 'chrome-linux', 'chrome'));
      candidates.push(path.join(base, d, 'chrome-headless-shell-linux64', 'chrome-headless-shell'));
    }
  }
  candidates.push('/usr/bin/chromium', '/usr/bin/google-chrome');
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}

/* 多路径加载 playwright-core：本地 node_modules → 全局 → 提示安装 */
function loadPlaywright() {
  const tries = [];
  try { return require('playwright-core'); } catch (e) { tries.push('local'); }
  try {
    const { execSync } = require('child_process');
    const g = execSync('npm root -g').toString().trim();
    return require(require('path').join(g, 'playwright-core'));
  } catch (e) { tries.push('global'); }
  console.error('未找到 playwright-core，请先执行：PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright-core（或在全局安装）');
  process.exit(1);
}

(async () => {
  const { chromium } = loadPlaywright();
  const exe = findChrome();
  if (!exe) { console.error('未找到 Chromium，请设置 CHROME_PATH 环境变量'); process.exit(1); }
  console.log('chromium:', exe);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({
    executablePath: exe,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=1', '--hide-scrollbars']
  });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('console', m => { if (m.type() === 'error') console.error('[console.error]', m.text()); });
  page.on('pageerror', e => console.error('[pageerror]', e.message));
  await page.goto('file://' + path.resolve(HTML));
  // 等待字体完全加载（防止豆腐块/字体回退）
  await page.evaluate(async () => {
    await Promise.all([
      document.fonts.load('400 100px "ZCOOL KuaiLe"', '认字'),
      document.fonts.load('400 100px "Patrick Hand"', '123'),
      document.fonts.load('700 100px "Caveat"', 'abc'),
    ]).catch(() => {});
    await document.fonts.ready;
  });
  const fontsOk = await page.evaluate(() => document.fonts.check('100px "ZCOOL KuaiLe"'));
  console.log('fonts loaded:', fontsOk);

  if (TEST) {
    for (const t of TEST.split(',').map(Number)) {
      await page.evaluate(t => window.renderFrame(t), t);
      const f = path.join(OUT_DIR, `test_${String(t).replace('.', '_')}s.jpg`);
      await page.screenshot({ path: f, type: 'jpeg', quality: 92 });
      console.log('rendered', t, '->', f);
    }
  } else {
    const total = Math.round(DUR * FPS);
    const t0 = Date.now();
    for (let i = 0; i < total; i++) {
      await page.evaluate(t => window.renderFrame(t), i / FPS);
      await page.screenshot({
        path: path.join(OUT_DIR, `f${String(i).padStart(5, '0')}.jpg`),
        type: 'jpeg', quality: 92
      });
      if (i % 240 === 0) {
        const el = (Date.now() - t0) / 1000;
        console.log(`frame ${i}/${total}  ${el.toFixed(0)}s elapsed  ${(i / Math.max(el, 0.01)).toFixed(1)} fps`);
      }
    }
    console.log('DONE', total, 'frames in', ((Date.now() - t0) / 1000).toFixed(0), 's');
  }
  await browser.close();
})();
