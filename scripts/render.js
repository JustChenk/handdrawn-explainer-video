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

/* 自动探测 Chromium 可执行文件（Windows + Linux） */
function findChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const home = process.env.HOME || process.env.USERPROFILE || '/root';
  const candidates = [];
  // Playwright 缓存（Linux: ~/.cache/ms-playwright；Windows: %LOCALAPPDATA%\ms-playwright）
  const pwBases = [path.join(home, '.cache/ms-playwright')];
  if (process.env.LOCALAPPDATA) pwBases.push(path.join(process.env.LOCALAPPDATA, 'ms-playwright'));
  for (const base of pwBases) {
    if (!fs.existsSync(base)) continue;
    for (const d of fs.readdirSync(base)) {
      candidates.push(path.join(base, d, 'chrome-linux64', 'chrome'));
      candidates.push(path.join(base, d, 'chrome-linux', 'chrome'));
      candidates.push(path.join(base, d, 'chrome-headless-shell-linux64', 'chrome-headless-shell'));
      candidates.push(path.join(base, d, 'chrome-win64', 'chrome.exe'));
      candidates.push(path.join(base, d, 'chrome-win', 'chrome.exe'));
    }
  }
  // Puppeteer 缓存（Windows: ~\.cache\puppeteer\chrome\<ver>\chrome-win64\chrome.exe）
  const ppBase = path.join(home, '.cache', 'puppeteer', 'chrome');
  if (fs.existsSync(ppBase)) {
    for (const d of fs.readdirSync(ppBase)) {
      candidates.push(path.join(ppBase, d, 'chrome-win64', 'chrome.exe'));
      candidates.push(path.join(ppBase, d, 'chrome-win', 'chrome.exe'));
      candidates.push(path.join(ppBase, d, 'chrome-linux64', 'chrome'));
    }
  }
  // Windows 系统 Chrome / Edge
  if (process.env.ProgramFiles) {
    candidates.push(path.join(process.env.ProgramFiles, 'Google/Chrome/Application/chrome.exe'));
    candidates.push(path.join(process.env.ProgramFiles, 'Microsoft/Edge/Application/msedge.exe'));
  }
  if (process.env['ProgramFiles(x86)']) {
    candidates.push(path.join(process.env['ProgramFiles(x86)'], 'Google/Chrome/Application/chrome.exe'));
    candidates.push(path.join(process.env['ProgramFiles(x86)'], 'Microsoft/Edge/Application/msedge.exe'));
  }
  // Linux 系统浏览器
  candidates.push('/usr/bin/chromium', '/usr/bin/google-chrome');
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}

/* 多路径加载 playwright-core：本地 node_modules → 托管工作区 → 全局 → 提示安装 */
function loadPlaywright() {
  const tries = [];
  try { return require('playwright-core'); } catch (e) { tries.push('local'); }
  try {
    // WorkBuddy 托管 node 工作区（Windows 下本地 node_modules 常不存在）
    const home = process.env.USERPROFILE || process.env.HOME;
    return require(path.join(home, '.workbuddy', 'binaries', 'node', 'workspace', 'node_modules', 'playwright-core'));
  } catch (e) { tries.push('workbuddy-workspace'); }
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
