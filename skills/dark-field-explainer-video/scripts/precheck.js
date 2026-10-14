#!/usr/bin/env node
'use strict';
/* =========================================================
   precheck.js —— 暗场发光图文工程 · 渲染前静态自检
   用法:
     node precheck.js <html_path> [渲染时长秒] [--json]
   示例:
     node precheck.js video.html            # 只做静态检查
     node precheck.js video.html 168        # 同时校验 TIMELINE 总长 == --dur
   检查项（ERROR 会阻止渲染）:
     1. 缺少 window.renderFrame        → render.js 无法驱动
     2. 缺少 __hostDriven 让位          → rAF 抢帧（抽多个时间点得到同一画面）
     3. 缺少 __meta.duration            → 无法交叉校验时长
     4. TIMELINE 总长 != 传入的渲染时长  → 尾部场景根本没被渲染
     5. 外链资源（img/@font-face/脚本）  → 无头浏览器离线渲染失败
     6. glow-r/glow-w 元素无显式 color   → 黑字橙晕伪发光（坑 2.7，渲染后才发现）
   WARN 项：Math.random、Date/performance.now 出现在渲染路径、canvas 非 1920×1080 等
   ========================================================= */
const fs = require('fs');

const HTML = process.argv[2];
const JSON_OUT = process.argv.includes('--json');
const DUR = process.argv.slice(3).find(a => /^\d+(\.\d+)?$/.test(a));

if (!HTML || HTML === '-h' || HTML === '--help') {
  console.error('用法: node precheck.js <html_path> [渲染时长秒] [--json]');
  process.exit(1);
}
if (!fs.existsSync(HTML)) {
  console.error('找不到文件:', HTML);
  process.exit(1);
}

const src = fs.readFileSync(HTML, 'utf8');
const lineOf = idx => src.slice(0, idx).split('\n').length;
const issues = [];
const add = (lvl, code, msg, line) => issues.push({ lvl, code, msg, line: line || null });

/* ---- 1. renderFrame 宿主接口 ---- */
const mRF = src.match(/window\s*\.\s*renderFrame\s*=/);
if (!mRF) add('ERROR', 'NO_RENDERFRAME', '未找到 window.renderFrame，render.js 无法逐帧驱动');

/* ---- 2. __hostDriven 让位机制 ---- */
const mHD = src.match(/__hostDriven/);
if (!mHD) {
  add('ERROR', 'NO_HOSTDRIVEN',
    '未发现 __hostDriven 标志。实时预览的 rAF 循环会覆盖宿主设定的帧，' +
    '典型症状：--test 抽多个时间点却渲染出同一幕。' +
    '正确写法：window.renderFrame = t => { window.__hostDriven = true; frame(t); }，' +
    '并在 rAF 回调首行 if (window.__hostDriven) return 之外再调用 frame');
}

/* ---- 3. __meta.duration ---- */
const mMeta = src.match(/__meta\s*=\s*\{[^}]*\}/);
if (!mMeta) add('ERROR', 'NO_META', '未找到 window.__meta = { fps, duration }');
else if (!/duration\s*:/.test(mMeta[0])) add('ERROR', 'NO_META_DUR', '__meta 缺少 duration 字段');

/* ---- 4. TIMELINE 总长 ---- */
const lens = [...src.matchAll(/\{\s*id\s*:\s*['"][^'"]+['"]\s*,\s*len\s*:\s*([\d.]+)\s*\}/g)]
  .map(m => parseFloat(m[1]));
if (!lens.length) {
  add('WARN', 'NO_TIMELINE', '未解析到 TIMELINE 条目（约定格式：{ id: \'xxx\', len: 8 }）');
} else {
  const total = lens.reduce((a, b) => a + b, 0);
  if (DUR && Math.abs(total - parseFloat(DUR)) > 0.15) {
    add('ERROR', 'DUR_MISMATCH',
      `TIMELINE 总长 ${total}s 与渲染时长 ${DUR}s 不符 —— 幕尾部（或渲染尾段）会不匹配。` +
      `要么补/删幕，要么把渲染参数改成 --dur ${total}`);
  } else if (DUR) {
    add('INFO', 'DUR_OK', `TIMELINE 总长 ${total}s = 渲染时长 ${DUR}s，共 ${lens.length} 幕`);
  } else {
    add('INFO', 'DUR_INFO', `TIMELINE 总长 ${total}s，共 ${lens.length} 幕；渲染时请用 --dur ${total}`);
  }
  lens.forEach((L, i) => {
    if (L < 6) add('WARN', 'SCENE_SHORT', `第 ${i + 1} 幕只有 ${L}s，低于建议下限 6s（旁白一句话都念不完）`);
    if (L > 12) add('WARN', 'SCENE_LONG', `第 ${i + 1} 幕长达 ${L}s，高于建议上限 12s（观众开始走神）`);
  });
}

/* ---- 5. 外链资源（离线渲染杀手） ---- */
const extImg = [...src.matchAll(/<img[^>]+src\s*=\s*["'](https?:)?\/\/[^"']+/gi)];
const extUrl = [...src.matchAll(/url\(\s*["']?(https?:)?\/\/[^)"']+/gi)];
const extFont = [...src.matchAll(/@font-face[\s\S]{0,300}?url\(\s*["']?(https?:)?\/\/[^)"']+/gi)];
[...extImg, ...extUrl].forEach(m => add('ERROR', 'EXTERNAL_RESOURCE', `外链资源会导致离线渲染失败: ${m[0].slice(0, 70)}`, lineOf(m.index)));
extFont.forEach(m => add('ERROR', 'EXTERNAL_FONT', `外链字体会回退成系统字体，请改用本地/系统字体栈`, lineOf(m.index)));

/* ---- 6. 运行时非确定性来源 ---- */
const runtimeMark = Math.max(
  src.indexOf('function frame'),
  src.indexOf('const SCENES'),
  src.indexOf('window.renderFrame')
);
/* performance.now 在「预览循环」里是合法的：判定条件是同一行出现 __hostDriven */
const lines = src.split('\n');
const previewLineNo = new Set();
lines.forEach((ln, i) => {
  if (ln.includes('__hostDriven') && ln.includes('performance.now')) previewLineNo.add(i + 1);
});
const scan = (re, code, msg) => {
  for (const m of src.matchAll(re)) {
    if (m.index <= runtimeMark || runtimeMark <= 0) continue;
    const n = lineOf(m.index);
    if (previewLineNo.has(n)) continue;          // 合法的实时预览循环
    add('WARN', code, msg, n);
  }
};
scan(/Math\.random\s*\(/g, 'RANDOM', '渲染路径里出现 Math.random()：抽帧与全量渲染的粒子分布会不一致，请改用模板内置的 rnd()（mulberry32）');
scan(/Date\.now\s*\(/g, 'DATE_NOW', '渲染路径里出现 Date.now()：同一 t 无法得到同一画面（违反确定性）');
scan(/performance\.now\s*\(/g, 'PERF_NOW', '渲染路径里出现 performance.now()：应只在预览循环内使用');

/* ---- 7. canvas 尺寸 ---- */
const canvases = [...src.matchAll(/<canvas[^>]*width\s*=\s*["']?(\d+)[^>]*height\s*=\s*["']?(\d+)/gi)];
canvases.forEach(m => {
  if (+m[1] !== 1920 || +m[2] !== 1080) {
    add('WARN', 'CANVAS_SIZE', `canvas 尺寸为 ${m[1]}×${m[2]}，非 1920×1080`, lineOf(m.index));
  }
});

/* ---- 8. 预览循环唯一性 ---- */
const rafCount = (src.match(/requestAnimationFrame/g) || []).length;
if (rafCount > 1) add('WARN', 'MULTI_RAF', `出现 ${rafCount} 处 requestAnimationFrame，应只有一处实时预览循环`);

/* ---- 9. 焦点发光字必须有显式 color（防「黑字橙晕」伪发光，坑 2.7） ----
   glow-r/glow-w 元素的 class 链上（含 id、行内 style）找不到任何显式 color 声明时，
   浏览器默认继承到黑色字身，只剩 text-shadow 橙晕 —— 渲染前看不出来，渲染后是暗红浮雕。 */
(function checkGlowColor() {
  const css = [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]).join('\n');
  const colorByClass = new Set(), colorById = new Set();
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/(^|[^-\w])color\s*:/.test(m[2])) continue;   // 排除 background-color / border-color 等
    for (const sel of m[1].split(',')) {
      const ids = [...sel.matchAll(/#([\w-]+)/g)].map(x => x[1]);
      const cls = [...sel.matchAll(/\.([\w-]+)/g)];
      ids.forEach(id => colorById.add(id));
      if (cls.length) colorByClass.add(cls[cls.length - 1][1]);   // 按「最内层 class」记账
    }
  }
  for (const m of src.matchAll(/<[^>]+\bclass\s*=\s*["']([^"']+)["'][^>]*>/g)) {
    const classes = m[1].split(/\s+/);
    if (!classes.some(c => c === 'glow-r' || c === 'glow-w')) continue;
    const tag = m[0];
    const inlineColor = /\bstyle\s*=\s*["'][^"']*\bcolor\s*:/.test(tag);
    const idM = tag.match(/\bid\s*=\s*["']([\w-]+)["']/);
    const covered = inlineColor
      || (idM && colorById.has(idM[1]))
      || classes.some(c => colorByClass.has(c));
    if (!covered) {
      add('ERROR', 'GLOW_NO_COLOR',
        `发光元素 class="${m[1].trim()}" 的 class 链上没有任何显式 color —— 会渲染成黑字+橙晕伪发光。` +
        `给定位 class 补 color:var(--accent-lo)（白发光用 #f2f2f4），别依赖继承`,
        lineOf(m.index));
    }
  }
})();

/* ---- 输出 ---- */
const order = { ERROR: 0, WARN: 1, INFO: 2 };
issues.sort((a, b) => order[a.lvl] - order[b.lvl] || (a.line || 0) - (b.line || 0));
const errN = issues.filter(i => i.lvl === 'ERROR').length;
const warnN = issues.filter(i => i.lvl === 'WARN').length;

if (JSON_OUT) {
  console.log(JSON.stringify({ file: HTML, errors: errN, warns: warnN, issues }, null, 2));
} else {
  console.log(`precheck: ${HTML}`);
  if (!issues.length) console.log('  (无输出项)');
  for (const i of issues) {
    const loc = i.line ? `  (L${i.line})` : '';
    console.log(`  [${i.lvl.padEnd(5)}] ${i.code}${loc}\n      ${i.msg}`);
  }
  console.log('----');
  console.log(`${errN} ERROR / ${warnN} WARN  ${errN ? '❌ 修掉 ERROR 再渲染' : '✅ 可以渲染'}`);
}
process.exit(errN ? 1 : 0);
