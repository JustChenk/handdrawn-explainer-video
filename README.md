# handdrawn-explainer-video

把任意主题制作成 **3 分钟以内的手绘卡通风格科普教学短片**（JS + Canvas 逐帧渲染，1080p MP4，无配音）。

> 成品示例主题：《大模型是怎么"认字"的？—— Token 手绘科普》（基于 Google 等机构 154 页 Tokenization 综述）

## 🎬 作品演示

- **《大模型是怎么"认字"的？》**（AI / 科普 / 手绘动画 · 2 分 50 秒 · 无配音）
  抖音观看 👉 [https://v.douyin.com/FLSXm0kx4aQ/](https://v.douyin.com/FLSXm0kx4aQ/)

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

## 📥 安装为 Skill

本仓库是一个标准的 **Agent Skill 包**，任何支持 Agent Skill 机制的 AI 编程助手都能加载。安装 = 把仓库放进对应工具的 skill 加载目录，下面以 CodeBuddy 为例：

```bash
# 方式 A：用户级（所有项目可用，推荐）
git clone https://github.com/JustChenk/handdrawn-explainer-video.git \
  ~/.codebuddy/skills/handdrawn-explainer-video

# 方式 B：项目级（仅当前项目可用）
cd <项目根目录>
git clone https://github.com/JustChenk/handdrawn-explainer-video.git \
  .codebuddy/skills/handdrawn-explainer-video
```

其他工具（如 Claude Code、OpenCode 等）安装方法相同，只需把路径换成各自的 skill 目录（如 `~/.claude/skills/`）。新开会话后自动生效；对 AI 说 **"把 XX 主题做成教学/科普视频"** 即触发。
运行时依赖：`playwright-core`（`npm i -g playwright-core`）、Chromium/Chrome（自动探测）、`ffmpeg`、Node.js ≥ 18。详见 [SKILL.md 的安装章节](SKILL.md)。

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

## 📚 参考文献

示例视频《大模型是怎么"认字"的？》所依据的资料（仅在此列出，不随项目分发）：

1. Datawhale《这是一篇把"Token"讲明白的科普级综述！》 — [mp.weixin.qq.com](https://mp.weixin.qq.com/s/4FANqjqQevlNEaVg7-HqSA)
2. *Tokenization Survey: Modern NLP*（Google 牵头，20+ 机构，32 位作者，154 页综述） — [alphaxiv.org](https://www.alphaxiv.org/zh/abs/2609.tokenization-survey-modern-nlp)
3. Andrej Karpathy, *Let's build the GPT Tokenizer*（2024 教程） — [YouTube](https://www.youtube.com/watch?v=zduSFxRajkE)
4. Sennrich et al., *Neural Machine Translation of Rare Words with Subword Units*（BPE, ACL 2016） — [arXiv:1508.07909](https://arxiv.org/abs/1508.07909)
5. Kudo & Richardson, *SentencePiece*（EMNLP 2018） — [arXiv:1808.06226](https://arxiv.org/abs/1808.06226)
6. Petrov et al., *Language Model Tokenizers Introduce Unfairness Between Languages*（2023） — [arXiv:2305.15425](https://arxiv.org/abs/2305.15425)

## 📄 License

MIT
