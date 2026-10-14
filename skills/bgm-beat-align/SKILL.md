---
name: bgm-beat-align
description: "视频配乐卡点：给成片配 BGM 前，用 librosa 量化音乐节拍（BPM/拍网格/能量轮廓），把视频幕边界放到变速后的节拍网格上量偏差，产出 A/B/C 板决策与微调建议（精确到帧），并用 scripts/merge_audio.sh 一键执行合成（变速铺底 / 卡点贴点 B0 零渲染）。适用于任何风格的科普/解说短片在合成配乐前的卡点分析、幕边界微调与配乐合成。触发词：卡点、踩拍、BGM 对齐、节拍对齐、配乐方案、幕边界卡拍、音乐卡点、配乐合成、beat 同步"
version: "1.1.0"

author: "CodeBuddy AI"

created: "2026-10-14"

changelog: "1.0.0 首个版本。源自「人生高性价比指南」Ep00 配乐卡点实战（librosa 实测 We_Never.mp3 × 74s 成片，7 幕边界 2 个天然在拍、4 个微调 2~4 帧全踩拍）：固化 A/B/C 板决策树、B0/B1 执行深度、贴点精度标准（人耳感知阈值 50~100ms）与截断点选取规则，附带 scripts/beat_align.py 节拍分析工具。1.1.0 并入 scripts/merge_audio.sh（项目 merge-audio.sh 泛化版），形成「节拍分析 → A/B/C 板决策 → 合成执行」全流程闭环：铺底模式沿用项目默认风格（自动压窗 + BGM 变速）并按纪律补齐 fade out 收尾；新增 --align 贴点模式承接 B0（-c:v copy 零重编码，--offset/--cut/--fade 参数表直接换算 beat_align 输出）；ffmpeg/ffprobe 探测仿 encode.sh（BBA_FFMPEG_DIR → 向上 4 层 tools/ → PATH）。"
---

# 视频配乐卡点（BGM Beat Align）

> **Goal**：成片配 BGM 前，用量化数据回答三个问题——**幕切换踩不踩拍？值不值得为卡点改分镜？音频在哪里截断？** 产出一份有数据支撑的配乐方案（决策树选板 + 微调帧表），并直接合成成片（铺底 / 贴点），而不是"凭感觉对齐"。

## 概述

本 skill **分析与执行一体**：`beat_align.py` 量化音乐节拍与视频幕边界的关系、产出方案与建议；`merge_audio.sh` 把方案落成成片（铺底 / 卡点贴点两种模式）。只有幕边界改动（B1 微调重渲染）需要回各风格 skill 的管线。风格无关——手绘卡通（handdrawn-explainer-video）与暗场图文（dark-field-explainer-video）的成片都走同一套卡点方法。

**核心认识**：一部 74s 的短片在 1.5x 下含约 205 拍，任意时刻落在拍 ±80ms 内的概率本就不低。所以**先量化、再决定**——别凭感觉宣布"天然卡点"，也别凭感觉放弃。运气好（边界全部 ≤161ms）时要抓住，运气差时用数据说话：要么微调 N 帧重渲染，要么接受 B0 验听版。

## 安装（Installation）

本 skill 是 [vibe-video-skills](https://github.com/JustChenk/vibe-video-skills) 合集仓库里的标准 Agent Skill 包，位于 `skills/bgm-beat-align/`。安装方法 = 把 skill 目录链接进所用工具的 skill 加载目录（Windows 推荐 junction 零复制，改完实时同步）：

```bash
# Windows 零复制（无需管理员权限）：
cmd //c "mklink /J <skill加载目录>/bgm-beat-align <仓库>/skills/bgm-beat-align"
# 任意平台：
#   ln -s <仓库>/skills/bgm-beat-align <skill加载目录>/bgm-beat-align
```

**运行时依赖（首次使用前装一次）**

| 依赖 | 安装 | 用途 |
|---|---|---|
| Python + librosa | `python -m pip install librosa`（含 numpy 依赖） | 节拍分析；仅 `scripts/beat_align.py` 需要 |
| ffmpeg / ffprobe | 见下方探测规则 | 合成执行（`scripts/merge_audio.sh`）；手工执行命令模板也用它 |
| bash | Windows 用 Git Bash | `scripts/merge_audio.sh` 的运行环境 |

**ffmpeg/ffprobe 探测顺序**（`merge_audio.sh` 内置，encode.sh 同款规则）：PATH → 环境变量 `BBA_FFMPEG_DIR`（指向含 ffmpeg 的目录）→ 从视频文件与脚本路径向上最多 4 层找 `tools/`。

## When to Use（管线位置）

```
分镜/动画定稿 → 【本 skill：卡点分析 + 选板 + 合成执行】→ (B1 时回风格管线微调重渲染) → 封面
                    ↑ 数据输入：scenes.js 幕边界 + BGM 音频      ↑ scripts/merge_audio.sh
```

**用**：成片已渲染（或分镜时刻表已定）、BGM 已选定，要做配乐合成之前。

**不用**：
- 成片要按 50~60s 窗口自动压缩、且幕内没有"必须逐字读"的密集文字/贴纸 → 直接走 `merge_audio.sh` 铺底模式（A 板），卡点收益低
- 无 BGM（纯旁白片）——本 skill 只处理音乐节拍

## 硬性纪律（不可妥协）

1. **先跑 `beat_align.py` 量化，再谈方案。** 禁止不跑数据就宣布"卡上了"或"卡不上"。
2. **`--speed` 必须与实际合成时的变速完全一致**（`merge_audio.sh` 的 `-s`，默认 1.5）。分析用 1.5x、合成用 1.2x = 全盘错位。
3. **贴点精度以人耳感知阈值为准**（约 50~100ms）：偏差 ≤0.08s（24fps 下 ≤2 帧）视为已在拍上；≤0.12s 微调 1~2 帧即完美；>0.12s 才值得进微调表。不要为 30ms 的偏差重渲染全片。
4. **音频截断必须落在节拍点 + 0.5s fade out**，禁止硬切（突兀收尾是卡点的反面）。
5. **B1 改了幕边界必须回风格 skill 管线走完全流程**（precheck → 全量重渲染 → encode），禁止只改 scenes.js 不重渲染。
6. **诚实说明 downbeat**：librosa `beat_track` 的拍网格不区分强弱拍。"幕切换踩强拍"的段落感需额外 downbeat 检测，对 2~3 分钟短片收益有限，默认不做，除非用户明确要。

## 工作流（四步）

### 第 1 步 · 节拍分析

```bash
# 本工作区 venv python（其他机器换成各自的 python）：
"C:/Users/yangck/.workbuddy/binaries/python/envs/default/Scripts/python.exe" \
  <skill>/scripts/beat_align.py <BGM音频> --scenes <幕边界秒列表,逗号分隔> --speed 1.5 --json <落盘>.json
```

- `--scenes` 来自分镜脚本 / scenes.js 的幕边界时刻（含 0 与片尾）。
- 输出四块，逐一解读：
  1. **总览行**：BPM、变速后时长与拍间隔——先看音乐 1.5x 后是否长于视频（长 → 走截断；短 → `apad` 补静音或换板）
  2. **能量轮廓**（2s/桶，`#`/`+`/`.` 三档）：识别 intro/drop/quiet 段，判断情绪起伏与幕结构是否吻合
  3. **对齐报告**：每个幕边界的最近拍、偏差、帧数与判断（已在拍上 / 微调 / 需调整），附逐边界微调建议
  4. **截断点建议**：片尾边界之后最近节拍 + 现成的 ffmpeg 命令模板（`-c:v copy` 零重编码；也可直接用 `merge_audio.sh --align` 执行，见第 3 步）

### 第 2 步 · A/B/C 板决策树

| 板 | 做法 | 适用 | 代价 |
|---|---|---|---|
| **A** | `merge_audio.sh` 铺底模式（视频自动压进 50~60s 窗口 + BGM 截断） | 内容型成片、幕内无密集需读文字、目标短平快 | 零额外工作；**视频时间轴整体压缩，卡点分析全部作废** |
| **B**（默认推荐） | 视频保持原速，音乐变速后从 0 对齐，节拍点截断 | 有幕结构、追求节奏感的解说片 | B0 秒级；B1 需重渲染 |
| **C** | 音乐完整播完，视频放完接尾帧定格 | 仅"完整作品欣赏"场景 | 静止结尾拖沓，预告片性质不适用 |

**A 板的否决信号**：幕内有密集贴纸/文字需要观众逐个读（如系列总览的片名墙）→ 加速后可读性受损，禁止 A 板。

**B 板两个执行深度（先 B0 后 B1，不要跳步）**：
- **B0 零渲染验听**：不动视频，用 `merge_audio.sh --align` 一步合音（见第 3 步）。人耳阈值内（≤~160ms）的偏差先听——听不出就不用重渲染。`-c:v copy` 零重编码，秒级完成。
- **B1 完美卡点**：按微调表改 scenes.js 幕边界（秒 → 帧：`帧 = round(秒 × 24)`）→ precheck → 全量重渲染 → encode → 再合音。只在 B0 验听不满意、或边界偏差 >0.12s 较多时上。

### 第 3 步 · 合成执行（merge_audio.sh）

决策树选定方案后，用 `scripts/merge_audio.sh` 落地。实战经验已固化进脚本，不用（也不能）绕过：`atempo` 超 2.0 自动级联、`amix` 带 `normalize=0`、音频侧 atrim/apad 迁就画面（画面优先）、收尾自动 fade out、画面无需变速时 `-c:v copy` 零重编码。手写 ffmpeg 命令时这些规则仍要自觉遵守（`atempo` 单级上限 2.0，3x = `atempo=2.0,atempo=1.5`）。

**A 板（铺底模式）**——一条命令：画面自动压进 50~60s 窗口 + BGM 变速铺满全片：

```bash
bash <skill>/scripts/merge_audio.sh -a assets/We_Never.mp3 成片.mp4
# 常用变体：-s 2（BGM 2x）、--keep-audio（保留原声混音）、-V 1（画面不动，自动落 1x 走零重编码）
```

**B0（贴点模式）**——视频原样零重编码，只动音频。参数直接由第 1 步分析结果换算，从分析到合成一条龙：

```bash
# ① 分析（第 1 步）
python <skill>/scripts/beat_align.py assets/We_Never.mp3 \
  --scenes 0,5,18,30,41,51,62,74 --speed 1.5 --json tmp/beats.json
#    → 对齐报告示例：幕边界 5.0s 最近拍 5.08s 偏差 +0.08；截断点建议 73.9s

# ② 决策（第 2 步）：偏差 ≤0.12s → B0 验听。
#    贴点换算：--offset = 幕边界 - 最近拍 = 5.0 - 5.08 = -0.08（负=掐头，正=后移）

# ③ 合成（B0 零渲染验听版）
bash <skill>/scripts/merge_audio.sh --align \
  -a assets/We_Never.mp3 -s 1.5 --offset -0.08 成片.mp4
```

- `--offset`：把选定的拍精确贴上幕边界。一个偏移量服务全片，优先贴最重要的幕边界（通常是第一幕或副歌入口），其余边界听 B0 版再定。
- `--cut`：成片时间轴上的音频截断点（= beat_align 建议截断点 + offset）。恰在片尾时可省略（默认=视频时长），超出会被钳回并提示；脚本自动带 0.5s fade out（`--fade` 可调），满足纪律 4。
- `--keep-audio`：成片自带旁白/原声时混音（`amix normalize=0`，电平不被压低）。
- C 板本脚本不直接支持（画面优先原则不延长视频，需手工 tpad 定格）——预告片场景本就少用。

**B1（微调重渲染）**——把第 1 步的微调表带回视频管线：

1. 微调表逐条改 scenes.js 幕边界（画面去就音乐；秒 → 帧：`帧 = round(秒 × 24)`）；
2. 回风格 skill 管线走完全流程：precheck → 全量重渲染 → encode；
3. 重跑 `beat_align.py` 复核偏差归零，再用 `merge_audio.sh --align`（此时无 `--offset`）合成最终版。

### 第 4 步 · 验收

交付前逐项过一遍下方验收清单。

## 与其他 skill 的串联（同属 vibe-video-skills）

| Skill | 关系 |
|---|---|
| `series-video-planner` | 系列若统一 BGM，规划期即定卡点策略（同一决策树全系列复用，勘误台账可记录"BGM 更换后全系列重卡点"） |
| `handdrawn-explainer-video` / `dark-field-explainer-video` | B1 微调 = 改各管线工程的 scenes.js 幕边界，改完必须回该管线 precheck + 重渲染；本 skill 只出微调帧表 |
| （项目级 `merge-audio.sh`） | 已并入本 skill（`scripts/merge_audio.sh` 即其泛化版，参数用法兼容）；项目内原脚本保留为该工作区默认风格的一键捷径（含 We_Never 默认曲、`_配乐版` 后缀） |

## 技术备忘（已踩过的坑）

- **新版 librosa 的 `beat_track` tempo 返回数组**：取值须 `np.atleast_1d(tempo)[0]`，脚本已处理，别改回去。
- **节拍网格随时间漂移累积**：不要用"拍间隔 × n"外推远处的拍，一切以 librosa 实测的 `beats_spd` 时间戳为准。
- **变速不变调**：`atempo` 只改速度不改音高，是 BGM 变速的正确选择；`asetrate` 会变调（鸭子嗓），除非刻意做效果。
- **音乐长于画面是常态**（2~3 分钟 BGM × 1~2 分钟成片）：走截断分支是预期行为，截断点取片尾边界最近的节拍。
- **`--json` 落盘**：节拍数据存 `tmp/` 或工程目录，后续重卡点/换板直接复用，不必重复分析。
- **`merge_audio.sh` 已固化的规则**：atempo 级联、amix `normalize=0`、apad/atrim 画面优先、收尾 fade out（项目版原为硬切，v1.1.0 起按纪律 4 统一补上，`--fade 0` 可关）、画面无需变速时 `-c:v copy`。手写 ffmpeg 命令时这些规则仍需自觉遵守；`--offset` 换算口诀：**offset = 幕边界 - 最近拍 = -(beat_align 偏差列)**。
- **中文/空格路径**：`merge_audio.sh` 中文文件名只经 `-i` 传入、不内嵌 ffmpeg filter，规避 filter 转义坑；Git Bash 下直接跑。

## 验收清单（交付前逐项过）

- [ ] 所有幕边界 ≤0.12s，或已列入微调表且用户拍板（B0 接受 / B1 重渲染）
- [ ] 截断点落在节拍上，且带 0.5s fade out
- [ ] 合成的变速参数（`merge_audio.sh -s`）与分析时 `--speed` 一致
- [ ] B1 路径：scenes.js 改动已过 precheck，全量重渲染后帧数/时长复核一致
- [ ] B0 版已实际验听（不是只看数据），用户确认后再决定是否升级 B1
