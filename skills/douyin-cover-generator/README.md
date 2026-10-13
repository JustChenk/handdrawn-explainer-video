# douyin-cover-generator

抖音高点击封面生成 skill —— 输入视频稿件或主题，产出 **3:4 竖版（1080×1440）+ 4:3 横版（1920×1440）** 两张高点击率封面。

纯代码渲染：HTML + Canvas 2D + playwright-core 截图，与 [handdrawn-explainer-video](../handdrawn-explainer-video/) 的 `render.js` 完全同栈、同依赖、同 Chromium 探测逻辑。**零积分、零外部生成能力依赖**（硬性禁止 ImageGen/VideoGen）。

## 快速使用

```bash
# 竖版 3:4（默认比例）：大字报风程序化背景
node scripts/render-cover.js --title "别再踩这5个坑" --subtitle "90%的新手都中招" \
  --tag "避坑指南" --style dazibao --out 封面_竖版3x4_避坑.png

# 横版 4:3：成片抽帧当背景（已有成片时最推荐）
ffmpeg -ss 5 -i 成片.mp4 -frames:v 1 frame.png
node scripts/render-cover.js --title "信的人多了，假的也成了真？" --subtitle "信念一变，现实也跟着变" \
  --tag "反身性" --ratio 4:3 --bg frame.png --darken 0.35 --out 封面_横版4x3_反身性.png
```

`--ratio` 支持 `3:4`（默认）/ `4:3` / `9:16` / `16:9` / `1:1`，也可用 `--size WxH` 自定义。

完整方法论（8 项强制标准、版式规范、标题类型匹配表、视觉风格选型表、参数表）见 [SKILL.md](SKILL.md)。

## 结构

```
douyin-cover-generator/
├── SKILL.md                    # 方法论 + 执行流程 + 参数表
├── scripts/render-cover.js     # 渲染 CLI（playwright-core 截图）
└── templates/
    ├── cover.html              # 画布页面
    └── cover.js                # Canvas 2D 绘制引擎（5 种程序化背景 + 图片背景）
```
