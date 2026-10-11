#!/usr/bin/env node
'use strict';
/* =========================================================
   precheck.js —— 渲染前静态自检（阶段 4 第一步，必须先跑）
   用法:
     node precheck.js [scenes.js] [handdrawn.js] [framework.js]

   为什么需要它：
     本库的绘制函数参数多（ctx,x,y,s,txt,seed,o），且不少参数有默认值，
     一旦调用时少传/错位（典型：漏掉中间的 scale/s，把 seed 顶到 txt 位），
     JS 不报错，只是"把数字当文字画出来"或"文字消失"。
     这类 bug 肉眼容易误判成设计元素，必须靠静态检查提前拦下。

   退出码：0 = 无 ERROR；1 = 有 ERROR（不要进入全量渲染）
   ========================================================= */
const fs = require('fs');
const path = require('path');

const files = process.argv.slice(2).filter(a => !a.startsWith('--'));
const SCENES = files[0] || 'scenes.js';
const LIB    = files[1] || 'handdrawn.js';
const FRAME  = files[2] || 'framework.js';
/* 诊断：--dump <函数名> 打印每个调用点解析出的参数，便于核对错位 */
const dumpIdx = process.argv.indexOf('--dump');
const DUMP = dumpIdx >= 0 ? process.argv[dumpIdx + 1] : null;

/* 取 function 定义的花括号内的函数体（配平，兼容单行写法） */
function matchBrace(src, openIdx) {
  let d = 0, q = null;
  for (let i = openIdx; i < src.length; i++) {
    const ch = src[i];
    if (q) { if (ch === '\\') { i++; continue; } if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { q = ch; continue; }
    if (ch === '{') d++;
    if (ch === '}') { d--; if (d === 0) return src.slice(openIdx + 1, i); }
  }
  return null;
}

const errors = [];
const warns  = [];
const err  = (f, l, m) => errors.push(`[ERROR] ${f}:${l}  ${m}`);
const warn = (f, l, m) => warns.push(`[WARN ] ${f}:${l}  ${m}`);

/* ---------- 工具：括号配平 / 顶层逗号切分 ---------- */
function splitTop(s) {
  const out = []; let d = 0, q = null, cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) { cur += ch; if (ch === '\\') { cur += s[++i] || ''; continue; } if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { q = ch; cur += ch; continue; }
    if ('([{'.includes(ch)) d++;
    if (')]}'.includes(ch)) d--;
    if (ch === ',' && d === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
function matchCall(src, openIdx) {
  let d = 0, q = null;
  for (let i = openIdx; i < src.length; i++) {
    const ch = src[i];
    if (q) { if (ch === '\\') { i++; continue; } if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { q = ch; continue; }
    if (ch === '(') d++;
    if (ch === ')') { d--; if (d === 0) return src.slice(openIdx + 1, i); }
  }
  return null;
}
const lineOf = (src, idx) => src.slice(0, idx).split('\n').length;
const readF = f => { try { return fs.readFileSync(f, 'utf8'); } catch (e) { return null; } };

/* =========================================================
   1. 提取函数真实签名 —— 库文件 + 场景文件里自定义的辅助函数
      （项目常自己写 priceTag/badge/tile 这类小 helper，它们同样会参数错位，
        所以必须一起纳入签名表，否则调用点不会被校验）
   ========================================================= */
const sigs = {};        // name -> {params:[{name,def}], required, usesCtx}
const libSrc = readF(LIB);
if (!libSrc) { console.error(`读取不到库文件：${LIB}`); process.exit(1); }

function extractSigs(src, fromLabel) {
  const re = /function\s+([A-Za-z_$][\w$]*)\s*\(/g; let m;
  while ((m = re.exec(src))) {
    const name = m[1];
    const inner = matchCall(src, m.index + m[0].length - 1);
    if (inner === null) continue;
    const params = splitTop(inner).map(p => {
      const eq = p.indexOf('=');
      return eq < 0 ? { name: p.trim(), def: null } : { name: p.slice(0, eq).trim(), def: p.slice(eq + 1).trim() };
    });
    let required = 0;
    for (const p of params) { if (p.def === null && p.name !== '') required++; else break; }
    const bIdx = src.indexOf('{', m.index + m[0].length);
    const body = bIdx < 0 ? '' : (matchBrace(src, bIdx) || '');
    const usesCtx = params.length > 0 && params[0].name === 'ctx' && /\bctx\s*[.;)]/.test(body);
    sigs[name] = { params, required, usesCtx, from: fromLabel };
  }
}
extractSigs(libSrc, LIB);
const sceneSrcForSigs = readF(SCENES);
if (sceneSrcForSigs) extractSigs(sceneSrcForSigs, SCENES);
const N = Object.keys(sigs).length;
const nOwn = Object.values(sigs).filter(s => s.from === SCENES).length;
console.log(`— 提取到 ${N} 个函数签名（库 ${N - nOwn} 个 + 场景自定义 ${nOwn} 个）`);

/* =========================================================
   2. 检查场景/框架里对库函数的每一次调用
   ========================================================= */
function checkCalls(file, src, opts = {}) {
  const { skipCtxCheck = false } = opts;
  if (!src) { warn(file, 0, '文件不存在，已跳过'); return; }
  const re = new RegExp(`(?<![\\w$.])((?:${Object.keys(sigs).join('|')}))\\s*\\(`, 'g');
  let m;
  while ((m = re.exec(src))) {
    const name = m[1];
    const ln = lineOf(src, m.index);
    // 跳过函数定义行本身
    const before = src.slice(Math.max(0, m.index - 40), m.index);
    if (/function\s+$/.test(before)) continue;

    const inner = matchCall(src, src.indexOf('(', m.index));
    if (inner === null) continue;
    const args = splitTop(inner);
    const sig = sigs[name];

    if (DUMP && name === DUMP) {
      console.log(`\n[DUMP] ${file}:${ln}  ${name}()`);
      console.log(`  签名: (${sig.params.map(p => p.def === null ? p.name : p.name + '=' + p.def).join(', ')})`);
      args.forEach((a, k) => {
        const p = sig.params[k];
        console.log(`  [${k}] ${(p ? p.name : '—').padEnd(8)} <= ${a}`);
      });
    }

    // (a) 必填参数不足 —— 一定错位
    if (args.length < sig.required) {
      err(file, ln, `${name}() 需要至少 ${sig.required} 个参数，实际只传了 ${args.length} 个 → 参数错位！` +
        `\n          签名: ${name}(${sig.params.map(p => p.def === null ? p.name : p.name + '=' + p.def).join(', ')})` +
        `\n          调用: ${inner.trim().slice(0, 140)}`);
      continue;
    }
    if (args.length > sig.params.length) {
      warn(file, ln, `${name}() 只声明了 ${sig.params.length} 个参数，实际传了 ${args.length} 个（多传的会被忽略）`);
    }
    // (b) 第 1 个参数必须是 ctx（仅对真正用 ctx 的绘制函数）
    if (!skipCtxCheck && sig.usesCtx && args[0] !== 'ctx' && args[0] !== 'CTX' && !/ctx/i.test(args[0])) {
      err(file, ln, `${name}() 第 1 个参数应是 ctx，实际是「${args[0]}」`);
    }
    // (c) 位置类型检查（双向）：
    //     数值位 → 字符串 = 文本被顶到后面（例：漏传 scale，'卖方' 落进数值位 s）
    //     文本位 → 数字   = 数值被顶进文本位（例：seed 落进 txt，画面上凭空多个数字）
    const TEXT_PARAM = /^(txt|label|sub|num|ch|title|name|text|str|note)$/;
    for (let i = 1; i < args.length; i++) {
      const p = sig.params[i];
      if (!p) break;
      const numericPos = /^(x|y|z|cx|cy|x1|y1|x2|y2|r|rx|ry|w|h|s|size|scale|width|height|rad|radius|amp|n|per|alpha|rot|t|a|b|a0|a1|dx|dy|gap|dash|seed|steps|len|deg)$/.test(p.name);
      if (numericPos && /^['"`]/.test(args[i])) {
        err(file, ln, `${name}() 第 ${i + 1} 个参数「${p.name}」是数值位，实际传入字符串 ${args[i]} → 参数错位（其后每个参数都被顶后一位）` +
          `\n          签名: ${name}(${sig.params.map(q => q.def === null ? q.name : q.name + '=' + q.def).join(', ')})` +
          `\n          调用: ${inner.trim().slice(0, 150)}`);
      }
      // 文本位传数字：跳过本身是数值语义的参数名（如 num 用于画数字）
      if (TEXT_PARAM.test(p.name) && p.name !== 'num' && /^-?\d+(\.\d+)?$/.test(args[i])) {
        err(file, ln, `${name}() 第 ${i + 1} 个参数「${p.name}」是文本位，却传入数字 ${args[i]} → 会把数字画到画面上（经典 seed 串位）` +
          `\n          签名: ${name}(${sig.params.map(q => q.def === null ? q.name : q.name + '=' + q.def).join(', ')})` +
          `\n          调用: ${inner.trim().slice(0, 150)}`);
      }
    }
    // 文本位传入纯数字已由 rule (c) 的对称检查覆盖
  }
}

console.log('— 检查 scenes.js 调用点');
checkCalls(SCENES, readF(SCENES));

/* =========================================================
   3. framework.js：检查 SCENES 与场景函数是否对齐
   ========================================================= */
console.log('— 检查 framework.js 场景注册表');
{
  const fSrc = readF(FRAME);
  const sSrc = readF(SCENES);
  if (fSrc && sSrc) {
    const block = fSrc.match(/const\s+SCENES\s*=\s*\[([\s\S]*?)\];/);
    if (!block) {
      err(FRAME, 0, '找不到 SCENES 数组');
    } else {
      const entries = [...block[1].matchAll(/start:\s*([\d.]+)\s*,\s*dur:\s*([\d.]+)/g)]
        .map(mm => ({ start: parseFloat(mm[1]), dur: parseFloat(mm[2]) }));
      const ln = lineOf(fSrc, block.index);
      if (!entries.length) err(FRAME, ln, 'SCENES 里没解析到 start/dur');

      // 时间轴必须首尾相接：后一幕 start == 前一幕 start+dur
      for (let i = 1; i < entries.length; i++) {
        const exp = entries[i - 1].start + entries[i - 1].dur;
        if (Math.abs(entries[i].start - exp) > 1e-6) {
          err(FRAME, ln, `SCENES 时间轴不连续：第 ${i + 1} 幕 start=${entries[i].start}，` +
            `但第 ${i} 幕结束于 ${exp} → wipe 转场与场景函数里的时间码会对不上`);
        }
      }
      const total = entries.reduce((a, e) => Math.max(a, e.start + e.dur), 0);
      if (total > 180) err(FRAME, ln, `总时长 ${total}s 超过 180s 上限`);
      else console.log(`  总时长 ${total}s，共 ${entries.length} 幕`);

      // 每一幕引用的 sceneN 必须存在
      const refs = [...block[1].matchAll(/typeof\s+(scene\d+)\s*!==/g)].map(mm => mm[1]);
      for (const r of refs) {
        if (!new RegExp(`function\\s+${r}\\s*\\(`).test(sSrc)) {
          err(FRAME, ln, `SCENES 引用了 ${r}()，但 ${SCENES} 里没有定义它 → 该幕会渲染成空白`);
        }
      }
      // 定义了却没注册的场景函数（提示级）
      const defined = [...sSrc.matchAll(/function\s+(scene\d+)\s*\(/g)].map(mm => mm[1]);
      for (const d of defined) if (!refs.includes(d)) warn(SCENES, 0, `定义了 ${d}() 但 SCENES 未注册，不会被渲染`);
    }
  }
}

/* =========================================================
   4. 场景函数时间基准：用的是全局 t 还是幕内相对时间
      特征：同一场景里 seg(t, 小数字, 小数字) 与 SCENES 的 start 明显不符
   ========================================================= */
console.log('— 检查场景时间基准（全局 t 约定）');
{
  const sSrc = readF(SCENES);
  const fSrc = readF(FRAME);
  if (sSrc && fSrc) {
    const b = fSrc.match(/const\s+SCENES\s*=\s*\[([\s\S]*?)\];/);
    if (b) {
      const starts = [...b[1].matchAll(/start:\s*([\d.]+)/g)].map(mm => parseFloat(mm[1]));
  const headRe = /function\s+(scene(\d+))\s*\([^)]*\)\s*\{/g;
      let hm;
      while ((hm = headRe.exec(sSrc))) {
        const name = hm[1], idx = parseInt(hm[2], 10) - 1;
        const bIdx = sSrc.indexOf('{', hm.index);
        const body = matchBrace(sSrc, bIdx) || '';
        const start = starts[idx];
        if (start === undefined) continue;
        const ln = lineOf(sSrc, hm.index);
        // seg 的起始时间可以是数字字面量，也可以是变量/表达式（如 seg(t, c.st, c.st+0.8)），
        // 两种都算"用了全局 t"；只有第一参数不是 t 才是时间基准问题。
        const anchored = [...body.matchAll(/\bseg\(\s*t\s*,/g)].length;
        const times = [...body.matchAll(/seg\(\s*t\s*,\s*([\d.]+)\s*,/g)].map(mm => parseFloat(mm[1]));
        const anySeg = (body.match(/\bseg\s*\(/g) || []).length;
        if (!anchored) {
          // 有 seg( 调用但一个都不是 seg(t,...) —— 多半把时间基准换掉了
          if (anySeg >= 3) {
            err(SCENES, ln, `${name}() 里有 ${anySeg} 处 seg( 调用，但没有一处是 seg(t, ...)` +
              ` → 时间基准不是全局 t，该幕会整段空白或错位（约定：场景函数一律用全局 t）`);
          }
          continue;
        }
        if (!times.length) continue;   // 起始时间全为变量，无需区间校验
        const maxT = Math.max(...times), minT = Math.min(...times);
        console.log(`  ${name}: 幕起点=${start}s，seg 时间码范围 ${minT}~${maxT}s`);
        // 幕起点明显大于 0，但时间码全挤在 0 附近 = 误用了幕内相对时间
        if (start >= 3 && maxT < start * 0.4) {
          err(SCENES, ln, `${name}() 的 seg 时间码最大只有 ${maxT}s，而该幕 start=${start}s。` +
            `看起来用的是幕内相对时间，但约定是全局 t → 该幕会整段空白或错位` +
            `（应写成 seg(t, ${start}+a, ...)，或直接用全局秒数）`);
        } else if (start >= 3 && minT < start - 0.001) {
          warn(SCENES, ln, `${name}(): 存在早于本幕起点(${start}s)的时间码 ${minT}s，确认不是笔误`);
        }
      }
    }
  }
}

/* ---------- 汇总 ---------- */
console.log('');
for (const w of warns) console.log(w);
for (const e of errors) console.log(e);
console.log('');
if (errors.length) {
  console.log(`✗ precheck 未通过：${errors.length} 个 ERROR，${warns.length} 个 WARN`);
  console.log('  先修掉 ERROR 再进入渲染，否则错误会以"画面上多了个数字/少了段文字"的形式混进成片。');
  process.exit(1);
} else {
  console.log(`✓ precheck 通过（${warns.length} 个 WARN，可自行判断）`);
  process.exit(0);
}
