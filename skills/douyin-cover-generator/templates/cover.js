/* =========================================================
 * cover.js — 抖音封面 Canvas 绘制引擎（douyin-cover-generator skill）
 *
 * 运行环境：浏览器页面（templates/cover.html），由 scripts/render-cover.js
 * 通过 playwright-core 截图调用。纯 Canvas 2D，零外部依赖。
 * 与视频制作管线（handdrawn-explainer-video 的 render.js）完全同栈。
 *
 * 对外接口：window.renderCover(config) -> Promise<void>
 *   config = {
 *     title, subtitle, tag: string
 *     ratio: '3:4' | '4:3' | '9:16' | '16:9' | '1:1'   （默认 3:4 竖版）
 *     size: [w, h]                             （可选，覆盖 ratio 默认画布）
 *     bg: { type: 'gradient' | 'image', src?: string, darken?: number, scrim?: boolean, style?: string }
 *     colors: { title, stroke, subtitle, tag, tagText }
 *     bar: string        （标题色块底色；'' = 不使用色块）
 *     shadow: boolean    （标题柔和投影）
 *     font: string       （自定义字体族；'' = 默认字体栈）
 *   }
 * ========================================================= */
(function () {
  'use strict';

  /* 默认比例：竖版 3:4（1080x1440）/ 横版 4:3（1920x1440，与成片同宽 1920，分辨率更高）；
     9:16、16:9、1:1 仍然支持，作为可选比例保留 */
  var RATIOS = {
    '3:4': [1080, 1440],
    '4:3': [1920, 1440],
    '9:16': [1080, 1920],
    '16:9': [1920, 1080],
    '1:1': [1080, 1080]
  };

  /** 中文粗体字体栈：Windows 微软雅黑 → macOS 苹方 → Linux Noto Sans SC */
  var FONT_STACK = '"Microsoft YaHei","PingFang SC","Noto Sans SC","Source Han Sans SC","HarmonyOS Sans SC",sans-serif';

  var BREAK_PUNCT = '，。！？、；：,.!?;:~～—…';

  /* ---------- 工具：确定性随机（同一配置输出稳定可复现） ---------- */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ---------- 标题折行：>12 字折 2 行，优先按标点/空格断行 ---------- */
  function wrapTitle(text, wrapAt, maxLines) {
    /* 显式换行优先：标题里带 \n 就按 \n 切，便于人工控制断行位置（短行能拿到更大字号） */
    if (text.indexOf('\n') >= 0) {
      return text.split('\n').map(function (s) { return s.trim(); })
        .filter(function (s) { return s; }).slice(0, maxLines);
    }
    if (text.length <= wrapAt) return [text];
    var best = -1, bestScore = -1;
    for (var i = 1; i < text.length; i++) {
      if (BREAK_PUNCT.indexOf(text[i - 1]) >= 0 || text[i] === ' ') {
        var score = 100 - Math.abs(i - text.length / 2);
        if (score > bestScore) { best = i; bestScore = score; }
      }
    }
    if (best < 0) best = Math.ceil(text.length / 2);
    var lines = [text.slice(0, best).trim(), text.slice(best).trim()];
    if (text.length > wrapAt * maxLines) {
      var per = Math.ceil(text.length / maxLines);
      lines = [];
      for (var j = 0; j < text.length; j += per) lines.push(text.slice(j, j + per));
      lines = lines.slice(0, maxLines);
      console.warn('[cover] 标题 ' + text.length + ' 字已折 ' + lines.length + ' 行，建议压到 12 字以内');
    }
    return lines.filter(function (l) { return l; });
  }

  /* ---------- 字号自适应：从 maxSize 递减至最长行（含描边）放得下 ---------- */
  function fitTitle(ctx, lines, fontFamily, maxWidth, maxSize, minSize) {
    var size = maxSize;
    while (size > minSize) {
      ctx.font = '900 ' + size + 'px ' + fontFamily;
      var sw = Math.max(2, size / 12);
      var widest = 0;
      for (var i = 0; i < lines.length; i++) {
        var lw = ctx.measureText(lines[i]).width + sw * 2;
        if (lw > widest) widest = lw;
      }
      if (widest <= maxWidth) break;
      size -= 4;
    }
    ctx.font = '900 ' + size + 'px ' + fontFamily;
    return size;
  }

  /* ---------- 背景：程序化风格 ---------- */
  function drawProceduralBg(ctx, w, h, style) {
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0E1115');
    g.addColorStop(1, '#282F38');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    var rnd = mulberry32(20261013);
    var i, x, y;

    if (style === 'grid') {
      // 科技网格 + 底部辉光
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      var step = Math.round(w / 18);
      for (x = 0; x <= w; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (y = 0; y <= h; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      var rg = ctx.createRadialGradient(w * 0.5, h * 0.72, 0, w * 0.5, h * 0.72, w * 0.75);
      rg.addColorStop(0, 'rgba(64,164,224,0.16)');
      rg.addColorStop(1, 'rgba(64,164,224,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, w, h);
    } else if (style === 'glow') {
      // 多层径向辉光 + 粒子
      var blobs = [
        [0.28, 0.30, 0.42, 'rgba(56,152,236,0.30)'],
        [0.74, 0.62, 0.50, 'rgba(126,87,255,0.22)'],
        [0.50, 0.88, 0.36, 'rgba(255,184,0,0.10)']
      ];
      for (i = 0; i < blobs.length; i++) {
        var b = blobs[i];
        var bg2 = ctx.createRadialGradient(w * b[0], h * b[1], 0, w * b[0], h * b[1], w * b[2]);
        bg2.addColorStop(0, b[3]);
        bg2.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = bg2;
        ctx.fillRect(0, 0, w, h);
      }
      for (i = 0; i < 46; i++) {
        x = rnd() * w; y = rnd() * h;
        var r = 1.5 + rnd() * 4;
        ctx.fillStyle = 'rgba(255,255,255,' + (0.08 + rnd() * 0.22).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
    } else if (style === 'rays') {
      // 顶部斜射光束
      ctx.save();
      ctx.translate(w * 0.5, -h * 0.12);
      for (i = 0; i < 7; i++) {
        ctx.save();
        ctx.rotate((-0.9 + i * 0.28) + (rnd() - 0.5) * 0.06);
        var lg = ctx.createLinearGradient(0, 0, 0, h * 1.25);
        lg.addColorStop(0, 'rgba(120,190,255,0.13)');
        lg.addColorStop(1, 'rgba(120,190,255,0)');
        ctx.fillStyle = lg;
        var bw = w * (0.018 + rnd() * 0.03);
        ctx.fillRect(-bw / 2, 0, bw, h * 1.25);
        ctx.restore();
      }
      ctx.restore();
      var rg2 = ctx.createRadialGradient(w * 0.5, h * 0.18, 0, w * 0.5, h * 0.18, w * 0.6);
      rg2.addColorStop(0, 'rgba(90,160,255,0.14)');
      rg2.addColorStop(1, 'rgba(90,160,255,0)');
      ctx.fillStyle = rg2;
      ctx.fillRect(0, 0, w, h);
    } else if (style === 'dazibao') {
      // 大字报风：粗描边圆环 + 四角标
      // 圆环尺寸同时受宽与高约束（min），否则 3:4 / 4:3 这类较"矮"的画布上圆环会溢出画布或压住字幕
      var cy = h * 0.60;
      var r1 = Math.min(w * 0.36, h * 0.20);
      var r2 = Math.min(w * 0.42, h * 0.235);
      ctx.strokeStyle = 'rgba(255,212,0,0.20)';
      ctx.lineWidth = Math.max(4, w * 0.006);
      ctx.beginPath(); ctx.arc(w * 0.5, cy, r1, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,59,48,0.35)';
      ctx.lineWidth = Math.max(3, w * 0.004);
      ctx.beginPath(); ctx.arc(w * 0.5, cy, r2, 0, Math.PI * 2); ctx.stroke();
      var m = w * 0.06, arm = w * 0.09;
      ctx.strokeStyle = 'rgba(255,212,0,0.55)';
      ctx.lineWidth = Math.max(4, w * 0.007);
      var corners = [[m, m, 1, 1], [w - m, m, -1, 1], [m, h - m, 1, -1], [w - m, h - m, -1, -1]];
      for (i = 0; i < corners.length; i++) {
        var c = corners[i];
        ctx.beginPath();
        ctx.moveTo(c[0] + c[2] * arm, c[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(c[0], c[1] + c[3] * arm);
        ctx.stroke();
      }
    }
    // 'plain'：仅渐变底

    // 通用暗角，保证文字区对比
    var vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  }

  /* ---------- 背景：自有图片（居中裁切 + 压暗 + 横版左侧 scrim） ---------- */
  function drawImageBg(ctx, img, w, h, darken, scrim) {
    var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    var target = w / h, cur = iw / ih, sx = 0, sy = 0, sw = iw, sh = ih;
    if (cur > target) { sw = ih * target; sx = (iw - sw) / 2; }
    else { sh = iw / target; sy = (ih - sh) / 2; }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
    if (darken > 0) {
      ctx.fillStyle = 'rgba(0,0,0,' + darken + ')';
      ctx.fillRect(0, 0, w, h);
    }
    if (scrim) {
      var fade = w * 0.62;
      var lg = ctx.createLinearGradient(0, 0, fade, 0);
      lg.addColorStop(0, 'rgba(0,0,0,0.85)');
      lg.addColorStop(0.55, 'rgba(0,0,0,0.55)');
      lg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(0, 0, w, h);
    }
  }

  /* ---------- 标题块（align: 'center' 竖版居中 / 'left' 横版左对齐） ---------- */
  function drawTitle(ctx, lines, size, x, y, opts) {
    var fontFamily = opts.font || FONT_STACK;
    var align = opts.align || 'center';
    ctx.font = '900 ' + size + 'px ' + fontFamily;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    var sw = Math.max(2, size / 12);
    var lh = size * 1.22;
    var totalH = lh * (lines.length - 1) + size;
    var top = y - totalH / 2;
    var widest = 0;
    for (var i = 0; i < lines.length; i++) widest = Math.max(widest, ctx.measureText(lines[i]).width);

    // 标题色块（bar）：先画色块，再在其上反色排字
    if (opts.bar) {
      var bx = align === 'center' ? x - widest / 2 - size * 0.45 : x - size * 0.45;
      roundRect(ctx, bx, top - size * 0.30, widest + size * 0.9, totalH + size * 0.6, size * 0.12);
      ctx.fillStyle = opts.bar;
      ctx.fill();
    }

    for (var j = 0; j < lines.length; j++) {
      var ly = top + j * lh + size / 2;
      if (opts.bar) {
        ctx.lineWidth = sw * 0.6;
        ctx.strokeStyle = opts.bar;
        ctx.strokeText(lines[j], x, ly);
        ctx.fillStyle = '#141414';
        ctx.fillText(lines[j], x, ly);
      } else {
        if (opts.shadow) {
          ctx.shadowColor = 'rgba(0,0,0,0.55)';
          ctx.shadowBlur = size * 0.18;
          ctx.shadowOffsetY = size * 0.06;
        }
        ctx.lineWidth = sw;
        ctx.strokeStyle = opts.stroke;
        ctx.strokeText(lines[j], x, ly);
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        ctx.fillStyle = opts.title;
        ctx.fillText(lines[j], x, ly);
      }
    }
  }

  /* leftAlign=true 时 cx 为标签左缘（横版标题左对齐场景）；默认 cx 为标签中心 */
  function drawTag(ctx, text, cx, cy, size, bg, fg, leftAlign) {
    ctx.font = '900 ' + size + 'px ' + FONT_STACK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var tw = ctx.measureText(text).width;
    var padX = size * 0.6, padY = size * 0.32;
    var boxW = tw + padX * 2;
    if (leftAlign) cx = cx + boxW / 2;
    roundRect(ctx, cx - boxW / 2, cy - size / 2 - padY, boxW, size + padY * 2, (size + padY * 2) / 2);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.fillText(text, cx, cy);
  }

  function drawSubtitle(ctx, text, x, y, size, color, centered) {
    ctx.font = '700 ' + size + 'px ' + FONT_STACK;
    ctx.textAlign = centered ? 'center' : 'left';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, size / 14);
    ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  /* ---------- 系列标识（顶部小字，建立系列认知） ---------- */
  function drawKicker(ctx, text, x, y, size, color, align) {
    ctx.font = '700 ' + size + 'px ' + FONT_STACK;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, size / 8);
    ctx.strokeStyle = 'rgba(0,0,0,0.88)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  /* ---------- 大数字徽章（高点击核心锚点：一个数字/短词 + 可选小字说明） ---------- */
  function drawBadge(ctx, b, cx, cy, size, o) {
    var font = (o && o.font) || FONT_STACK;
    var capSize = size * 0.30;
    ctx.font = '900 ' + size + 'px ' + font;
    var tw = ctx.measureText(b.text).width;
    var cw = 0;
    if (b.caption) { ctx.font = '700 ' + capSize + 'px ' + font; cw = ctx.measureText(b.caption).width; }
    var innerW = Math.max(tw, cw);
    var padX = size * 0.44, padY = size * 0.26;
    var boxW = innerW + padX * 2;
    var boxH = size + (b.caption ? capSize * 1.40 : 0) + padY * 2;
    var bx = cx - boxW / 2, by = cy - boxH / 2, rad = boxH * 0.16;

    /* 投影 + 色块 */
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.50)';
    ctx.shadowBlur = size * 0.32;
    ctx.shadowOffsetY = size * 0.09;
    roundRect(ctx, bx, by, boxW, boxH, rad);
    ctx.fillStyle = b.color;
    ctx.fill();
    ctx.restore();

    /* 深色描边：保证压在任何背景上都立得住 */
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, size * 0.05);
    ctx.strokeStyle = b.stroke || 'rgba(0,0,0,0.55)';
    roundRect(ctx, bx, by, boxW, boxH, rad);
    ctx.stroke();

    /* 文字 */
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var ty = cy - (b.caption ? capSize * 0.66 : 0);
    ctx.font = '900 ' + size + 'px ' + font;
    ctx.fillStyle = b.textColor;
    ctx.fillText(b.text, cx, ty);
    if (b.caption) {
      ctx.font = '700 ' + capSize + 'px ' + font;
      ctx.fillStyle = b.captionColor || b.textColor;
      ctx.fillText(b.caption, cx, ty + size * 0.74);
    }
  }

  /* ---------- 主入口 ---------- */
  window.renderCover = function (config) {
    var cfg = {
      title: (config && config.title) || '',
      subtitle: (config && config.subtitle) || '',
      tag: (config && config.tag) || '',
      kicker: (config && config.kicker) || '',
      badge: Object.assign(
        { text: '', caption: '', color: '#FF3B30', textColor: '#FFFFFF', captionColor: '', stroke: '' },
        (config && config.badge) || {}
      ),
      ratio: (config && config.ratio) || '3:4',
      size: (config && config.size) || null,
      bg: Object.assign({ type: 'gradient', src: '', darken: 0.25, scrim: true, style: 'grid' }, config && config.bg),
      colors: Object.assign({ title: '#FFD400', stroke: '#141414', subtitle: '#FFFFFF', tag: '#FF3B30', tagText: '#FFFFFF' }, config && config.colors),
      bar: (config && config.bar) || '',
      shadow: config && config.shadow === undefined ? true : config.shadow,
      font: (config && config.font) || ''
    };

    var size = cfg.size || RATIOS[cfg.ratio] || RATIOS['3:4'];
    var w = size[0], h = size[1];
    var vertical = h >= w;

    var canvas = document.getElementById('cover');
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    var ctx = canvas.getContext('2d');

    function paint(bgImg) {
      ctx.clearRect(0, 0, w, h);
      if (bgImg) {
        drawImageBg(ctx, bgImg, w, h, cfg.bg.darken, cfg.bg.scrim && !vertical);
      } else {
        drawProceduralBg(ctx, w, h, cfg.bg.style || 'grid');
      }

      // 标题：折行 + 自适应字号
      var lines = wrapTitle(cfg.title, 12, 2);
      var maxSize = vertical ? h * 0.115 : h * 0.16;
      // 横版标题栏宽度：画布越"方"（4:3 比 16:9 窄）标题栏越宽，避免 4:3 下字号被压太小
      var aspect = w / h;
      var squash = Math.max(0, Math.min(1, (16 / 9 - aspect) / (16 / 9 - 4 / 3)));
      var maxWidth = vertical ? w * 0.86 : w * (0.46 + squash * 0.06);
      var fontSize = fitTitle(ctx, lines, cfg.font || FONT_STACK, maxWidth, maxSize, 30);

      if (vertical) {
        // 竖版：系列标识顶部 / 标题上半区居中 / 标签中部 / 大数字徽章中下 / 副标题底部
        if (cfg.kicker) drawKicker(ctx, cfg.kicker, w / 2, h * 0.060, h * 0.026, cfg.colors.subtitle, 'center');
        drawTitle(ctx, lines, fontSize, w / 2, h * 0.30, {
          font: cfg.font, title: cfg.colors.title, stroke: cfg.colors.stroke,
          bar: cfg.bar, shadow: cfg.shadow, align: 'center'
        });
        if (cfg.tag) drawTag(ctx, cfg.tag, w / 2, h * 0.545, h * 0.030, cfg.colors.tag, cfg.colors.tagText);
        if (cfg.badge.text) drawBadge(ctx, cfg.badge, w / 2, h * 0.705, h * 0.105, { font: cfg.font });
        if (cfg.subtitle) drawSubtitle(ctx, cfg.subtitle, w / 2, h * 0.885, h * 0.036, cfg.colors.subtitle, true);
      } else {
        // 横版：标识左上 / 标题左侧 / 标签标题上方 / 大数字徽章右侧 / 副标题标题下方
        if (cfg.kicker) drawKicker(ctx, cfg.kicker, w * 0.06, h * 0.115, h * 0.026, cfg.colors.subtitle, 'left');
        drawTitle(ctx, lines, fontSize, w * 0.06, h * 0.46, {
          font: cfg.font, title: cfg.colors.title, stroke: cfg.colors.stroke,
          bar: cfg.bar, shadow: cfg.shadow, align: 'left'
        });
        if (cfg.tag) drawTag(ctx, cfg.tag, w * 0.06, h * 0.225, h * 0.030, cfg.colors.tag, cfg.colors.tagText, true);
        if (cfg.badge.text) drawBadge(ctx, cfg.badge, w * 0.775, h * 0.50, h * 0.115, { font: cfg.font });
        if (cfg.subtitle) drawSubtitle(ctx, cfg.subtitle, w * 0.06, h * 0.78, h * 0.036, cfg.colors.subtitle, false);
      }
    }

    if (cfg.bg.type === 'image' && cfg.bg.src) {
      return new Promise(function (resolve, reject) {
        var img = new Image();
        img.onload = function () { paint(img); resolve(); };
        img.onerror = function () { reject(new Error('背景图加载失败: ' + cfg.bg.src)); };
        img.src = cfg.bg.src;
      });
    }
    paint(null);
    return Promise.resolve();
  };
})();
