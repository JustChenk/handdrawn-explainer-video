#!/usr/bin/env node
'use strict';
/* =========================================================
 * render-cover.js — 抖音封面渲染 CLI（HTML+Canvas → PNG）
 * douyin-cover-generator skill 配套，与视频管线 render.js 同栈同依赖。
 *
 * 用法:
 *   node render-cover.js --title "别再踩这5个坑" --subtitle "90%的人中招" --tag "避坑" \
 *     --ratio 3:4 --style dazibao --out 封面_竖版3x4.png
 *   node render-cover.js --title "..." --ratio 4:3 --bg frame.png --darken 0.25 --out 封面_横版4x3.png
 *
 * 默认比例: 竖版 3:4（1080x1440）; 横版 4:3（1920x1440）
 * 可选比例: 3:4 / 4:3 / 9:16 / 16:9 / 1:1 / 自定义 --size WxH
 *
 * 依赖: playwright-core（npm i playwright-core，不下载浏览器）
 * Chromium 自动探测顺序: CHROME_PATH → ms-playwright/puppeteer 缓存
 *   → 系统 Chrome/Edge → agent-browser 缓存
 * ========================================================= */
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

function arg(name, dflt) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}
const hasFlag = (name) => process.argv.indexOf(name) >= 0;

/* ---------- Chromium 探测（覆盖视频管线全部路径 + agent-browser 缓存） ---------- */
function findChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const home = process.env.HOME || process.env.USERPROFILE || '/root';
  const candidates = [];
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
  const ppBase = path.join(home, '.cache', 'puppeteer', 'chrome');
  if (fs.existsSync(ppBase)) {
    for (const d of fs.readdirSync(ppBase)) {
      candidates.push(path.join(ppBase, d, 'chrome-win64', 'chrome.exe'));
      candidates.push(path.join(ppBase, d, 'chrome-win', 'chrome.exe'));
      candidates.push(path.join(ppBase, d, 'chrome-linux64', 'chrome'));
    }
  }
  if (process.env.ProgramFiles) {
    candidates.push(path.join(process.env.ProgramFiles, 'Google/Chrome/Application/chrome.exe'));
    candidates.push(path.join(process.env.ProgramFiles, 'Microsoft/Edge/Application/msedge.exe'));
  }
  if (process.env['ProgramFiles(x86)']) {
    candidates.push(path.join(process.env['ProgramFiles(x86)'], 'Google/Chrome/Application/chrome.exe'));
    candidates.push(path.join(process.env['ProgramFiles(x86)'], 'Microsoft/Edge/Application/msedge.exe'));
  }
  candidates.push('/usr/bin/chromium', '/usr/bin/google-chrome');
  // agent-browser 安装的 Chrome
  const abBase = path.join(home, '.agent-browser', 'browsers');
  if (fs.existsSync(abBase)) {
    for (const d of fs.readdirSync(abBase)) {
      candidates.push(path.join(abBase, d, 'chrome-win64', 'chrome.exe'));
      candidates.push(path.join(abBase, d, 'chrome-linux64', 'chrome'));
    }
  }
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}

/* ---------- playwright-core 多路径加载（与 render.js 一致） ---------- */
function loadPlaywright() {
  try { return require('playwright-core'); } catch (e) {}
  try {
    const home = process.env.USERPROFILE || process.env.HOME;
    return require(path.join(home, '.workbuddy', 'binaries', 'node', 'workspace', 'node_modules', 'playwright-core'));
  } catch (e) {}
  try {
    const { execSync } = require('child_process');
    const g = execSync('npm root -g').toString().trim();
    return require(path.join(g, 'playwright-core'));
  } catch (e) {}
  console.error('未找到 playwright-core，请先执行：PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright-core（或在全局安装）');
  process.exit(1);
}

/* ---------- 参数 → 配置 ---------- */
function buildConfig() {
  const ratio = arg('--ratio', '3:4');
  const sizeArg = arg('--size', '');
  let size = null;
  if (sizeArg) {
    const m = sizeArg.toLowerCase().split('x');
    if (m.length !== 2 || isNaN(+m[0]) || isNaN(+m[1])) {
      console.error('--size 格式应为 WxH，如 1080x1920');
      process.exit(1);
    }
    size = [+m[0], +m[1]];
  }

  const bgPath = arg('--bg', '');
  const cfg = {
    title: arg('--title', ''),
    subtitle: arg('--subtitle', ''),
    tag: arg('--tag', ''),
    ratio,
    size,
    bg: bgPath
      ? { type: 'image', src: pathToFileURL(path.resolve(bgPath)).href, darken: parseFloat(arg('--darken', '0.25')), scrim: !hasFlag('--no-scrim') }
      : { type: 'gradient', style: arg('--style', 'grid') },
    colors: {
      title: arg('--title-color', '#FFD400'),
      stroke: arg('--stroke-color', '#141414'),
      subtitle: arg('--subtitle-color', '#FFFFFF'),
      tag: arg('--tag-color', '#FF3B30'),
      tagText: arg('--tag-text-color', '#FFFFFF')
    },
    bar: arg('--bar-color', ''),
    shadow: !hasFlag('--no-shadow'),
    font: arg('--font', '')
  };

  // --config 文件合并（CLI 参数优先）
  const cfgFile = arg('--config', '');
  if (cfgFile) {
    const fromFile = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
    const merged = Object.assign({}, fromFile, cfg, {
      bg: Object.assign({}, fromFile.bg, cfg.bg),
      colors: Object.assign({}, fromFile.colors, cfg.colors)
    });
    // CLI 未显式传的字段回退为文件值
    for (const k of ['title', 'subtitle', 'tag', 'ratio', 'size', 'bar', 'shadow', 'font']) {
      if (!process.argv.includes('--' + k.replace(/([A-Z])/g, '-$1').toLowerCase()) && fromFile[k] !== undefined) merged[k] = fromFile[k];
    }
    return merged;
  }
  return cfg;
}

(async () => {
  const cfg = buildConfig();
  const OUT = arg('--out', '');
  if (!cfg.title) { console.error('缺少 --title（主标题必填）'); process.exit(1); }
  if (!OUT) { console.error('缺少 --out（输出路径必填）'); process.exit(1); }
  if (cfg.bg.type === 'image' && !fs.existsSync(arg('--bg', ''))) {
    console.error('背景图不存在: ' + arg('--bg', '')); process.exit(1);
  }

  const size = cfg.size || {
    '3:4': [1080, 1440],   // 竖版（默认）
    '4:3': [1920, 1440],   // 横版（默认，与成片同宽 1920）
    '9:16': [1080, 1920],
    '16:9': [1920, 1080],
    '1:1': [1080, 1080]
  }[cfg.ratio] || [1080, 1440];
  const [w, h] = size;

  const { chromium } = loadPlaywright();
  const exe = findChrome();
  if (!exe) { console.error('未找到 Chromium，请设置 CHROME_PATH 环境变量'); process.exit(1); }

  const html = path.join(__dirname, '..', 'templates', 'cover.html');
  const browser = await chromium.launch({
    executablePath: exe,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=1', '--hide-scrollbars', '--font-render-hinting=none']
  });
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error') console.error('[console.error]', m.text()); });
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  await page.goto('file://' + path.resolve(html));
  await page.evaluate(async () => { await document.fonts.ready; });

  await page.evaluate((c) => window.renderCover(c), cfg);

  const outDir = path.dirname(path.resolve(OUT));
  fs.mkdirSync(outDir, { recursive: true });
  await page.screenshot({ path: OUT, type: 'png', clip: { x: 0, y: 0, width: w, height: h } });
  await browser.close();
  console.log(`[render-cover] 已生成 ${OUT} (${w}x${h})`);
})().catch((e) => { console.error('[render-cover] 失败:', e.message); process.exit(1); });
