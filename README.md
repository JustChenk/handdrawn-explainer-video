# handdrawn-explainer-video

把任意主题制作成 **3 分钟以内的手绘卡通风格科普教学短片**（JS + Canvas 逐帧渲染，1080p MP4，无配音）。

> 成品示例主题：《大模型是怎么"认字"的？—— Token 手绘科普》（基于 Google 等机构 154 页 Tokenization 综述）

## ✨ 特性

- 🎨 **纯代码手绘风**：抖动线条（boiling lines）、弹跳入出场、描画动画、纸张擦除转场、便利贴/气泡/手绘角色组件
- ⏱️ **确定性渲染**：同一时刻永远渲染出同一帧，逐帧录制零闪烁
- 🔇 **无配音**：全部信息靠画面与字幕传达，静音也好看
- 🧒 **零门槛**：类比优先 + 大数字 + 每屏一句话，初中生也能看懂
- 🪝 **钩子开场**：认知冲突式开头，让人想看下去

## 📦 结构

```
handdrawn-explainer-video/
├── SKILL.md                 # 完整工作流手册（调研→分镜→动画→自检→渲染→交付）
├── templates/
│   ├── handdrawn.js         # 手绘工具库（线条/卡片/角色/箭头/贴纸等）
│   ├── framework.js         # 通用主框架（场景调度/转场/进度条）
│   ├── scenes_example.js    # 完整示例场景（Tokenization 主题 8 幕）
│   └── video.html           # 页面模板（支持 ?play 交互预览）
├── assets/fonts/            # 三款手写字体（本地化，离线可渲染）
│   ├── ZCOOLKuaiLe.ttf      # 中文正文
│   ├── PatrickHand.ttf      # 英文/数字
│   └── CaveatBold.ttf       # 英文标题
└── scripts/
    ├── render.js            # Playwright 逐帧渲染（自动探测 Chromium）
    └── encode.sh            # ffmpeg 合成（编码器自动 fallback）
```

## 🚀 快速开始

**约定：每部视频的全部产物（调研/分镜/工程/帧/成片）统一放在项目根下一个以主题命名的文件夹**，如 `my-video/`。

```bash
# 1. 搭工程（在主题文件夹内）
mkdir my-video && cd my-video
cp <skill>/templates/handdrawn.js <skill>/templates/framework.js <skill>/templates/video.html .
cp -r <skill>/assets .
cp <skill>/templates/scenes_example.js scenes.js

# 2. 自检关键帧（产物落 ./testframes/）
node <skill>/scripts/render.js ./video.html ./testframes --test "3,8,24,58"

# 3. 全量渲染 + 合成（成片落主题文件夹内）
node <skill>/scripts/render.js ./video.html ./frames --fps 24 --dur 170
bash <skill>/scripts/encode.sh ./frames 24 ./my-video.mp4 4.5M
```

详细制作规范（叙事骨架、钩子公式、场景模式库、踩坑备忘）见 [SKILL.md](SKILL.md)。

## 🎬 制作管线

```
主题/材料 ──调研──► 分镜脚本 ──JS+Canvas──► 确定性动画
     → Playwright 逐帧截图（4080 帧）──ffmpeg──► 1080p24 MP4
```

## 📄 License

MIT
