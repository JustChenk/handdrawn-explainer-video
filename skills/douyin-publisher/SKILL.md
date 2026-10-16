---
name: douyin-publisher
description: "抖音成品视频批量发布：把一个系列的成片 mp4 批量上传到抖音创作者平台并逐集填标题话题/定时发布。引导 Agent 用 douyin-publisher CLI（login 扫码 / gen 生成清单 / publish 批量发布，dry-run 默认）完成发布全流程，包括：从分镜脚本提取每集标题话题填清单、首跑校准页面选择器、非交互批处理模式、失败集补跑、风控纪律与合集处理建议。触发词：发布抖音、批量上传、上传抖音、发布视频到抖音、抖音发布清单、douyin publisher、发抖音、系列视频发布"
version: "1.0.0"

author: "CodeBuddy AI"

created: "2026-10-16"

changelog: "1.0.0 首个版本。源自 douyin-publisher 项目（D:/github/douyin-publisher，独立开源仓库）实战立项：调研确认抖音开放平台 OpenAPI 对个人主体不可行（个人仅限小玩法；2025-08 公告 348 要求企业注册资本≥50万+注册满1年），故走创作者中心网页端 + Playwright 浏览器自动化路线。为配合 Agent 批处理，工具已加 --non-interactive 模式。本 skill 是『项目给人用、skill 给 Agent 用』配对模式的第一个实例：工具本体在独立仓库（单一事实源），本 skill 只沉淀 Agent 视角的工作流与坑。"
---

# 抖音成品视频批量发布（douyin-publisher）

> **Goal**：用户说"把这批视频发到抖音"时，Agent 能独立走完：确认范围 → 生成清单 → 提取标题话题 → dry-run 校准 → 批量发布 → 验收补跑。不逐集手动操作，但**每一步有截图留痕、批次发布必须用户明确批准**。

## 概述

- **工具本体**：`D:\github\douyin-publisher`（独立 git 仓库，开源项目，给人用：README 完整文档）。
- **本 skill**：Agent 视角的调用手册。工具改版改仓库，工作流经验沉淀在这里。
- **原理**：Playwright 驱动本机 Chrome 操作 creator.douyin.com 发布页。**官方 OpenAPI 对个人主体不可行**（详见工具仓库 docs/openapi-research.md），别再往 API 路线上浪费时间。

## 前置条件（每次会话先检查）

1. **CLI 可用**：`douyin-publisher --version`。不可用则
   `"C:/Users/yangck/.workbuddy/binaries/python/envs/default/Scripts/pip.exe" install -e D:/github/douyin-publisher`。
2. **登录态存在**：`~/.douyin_publisher/state.json`。不存在 → 提醒用户回家/在场，跑
   `douyin-publisher login` 后**用户用手机扫码**（Agent 无法代扫，这一步必须等用户）。
3. **登录态失效**（publish 时报跳转登录页）→ 重跑 `login`。

## 工作流

### 第 1 步：确认发布范围

向用户确认：哪个系列、哪几集（默认整个系列目录）、立即发还是定时、是否已建合集。
**不要自作主张全发**——新号/主力号单次批量 ≤10 集，先问。

### 第 2 步：生成清单骨架

```bash
douyin-publisher gen "<系列目录>" -o <系列目录>/发布清单.json
```

生成后**Agent 主动填 text**（这是 Agent 比 CLI 强的地方，也是用户最省事的环节）：
- 标题来源优先级：该集 `分镜脚本-Opus5.5版.md` 的钩子文案 / `变更记录.md` 的集名与一句话主旨 / 集目录名。
- 话题：从系列已有发布惯例取（如 #人生攻略 类），2~4 个，不堆砌。
- 填完把完整清单展示给用户过目一遍再进第 3 步。
- `publish_at` 留空=立即；用户要错峰就按集序填 `YYYY-MM-DD HH:MM`。

### 第 3 步：dry-run 校准（首跑或抖音改版后必做）

```bash
douyin-publisher publish <清单> --only 1 --non-interactive
```

跑一集 dry-run（**不会真发**，自动走完上传+填文案后关页）：
- 全程截图在 `logs/`，`ready_1.png` 能看到填好的发布页即为通过。
- 若报"找不到 file input / 编辑器 / 发布按钮"：打开对应 `err_*.png` 截图，改
  `D:\github\douyin-publisher\douyin_publisher\config.py` 的 `SELECTORS`（每键一组候选，按序取首个可见命中），改完重跑。
- 校准通过后**把选择器改动 commit 进工具仓库**（惠及所有人）。

### 第 4 步：批量发布（必须用户批准）

```bash
# 推荐：逐集人工确认（用户在场时）
douyin-publisher publish <清单> --execute
# Agent 批处理（用户明确批准本批次后）：
douyin-publisher publish <清单> --execute --non-interactive
```

**纪律（不可违反）**：
- `--execute --non-interactive` 视同逐集免确认自动发布，**必须先拿到用户对这批内容的明确批准**（展示过清单 + 用户点头）， Agent 不得自行决定真发。
- 默认集间隔 120s 基准（实际 0.8~1.5 倍随机），单批 ≤10 集；想更快用 `--interval 60` 但别更低。
- 只用真实浏览器（工具已固化 headless=False），别为省资源改 headless——风控概率大增。

### 第 5 步：验收与收尾

- 看输出末尾"结果汇总"；失败/未知集用 `--only <序号>` 补跑。
- 提醒用户（或代操作）：发布页默认自动取帧当封面，对封面有要求的一集在 App 里手动换；合集在创作者中心「合集管理」**批量勾选**已发布视频加入（单次约 50 条上限），之后新视频发布时勾"添加到合集"。
- 登录态等同账号 cookie，绝不写进任何入库文件、不外传。

## 坑表

| 坑 | 处理 |
|---|---|
| OpenAPI 路线幻想 | 个人主体建不了网站/移动应用，别再试；有企业资质需求看工具仓库 docs/openapi-research.md |
| Agent 跑 publish 卡住不动 | 用了交互模式，`input()` 在等回车——批处理必须 `--non-interactive` |
| 选择器突然全失效 | 抖音改版了，回第 3 步校准，改 config.py 后 commit |
| 带水印/logo 的片源 | 大概率降权/下架，发布前提醒用户 |
| 封面自动化 | v0.1 未实现（封面编辑器是复杂弹层），manifest 的 cover 字段仅提示；Roadmap v0.2 |
| 用户语音输入 | "发布清单"可能被识别成别的词，涉及发布操作一律先复述清单内容再执行 |

## 配对模式（本 skill 确立的惯例）

**项目给人用（CLI + README + License），skill 给 Agent 用（触发词 + 工作流 + 坑表）**——同一工具两份界面，单一事实源在项目仓库。今后新工具（如抖音封面批量、其他平台发布）立项时默认按此双轨沉淀：项目独立建仓库，skill 进 vibe-video-skills 合集并 junction 进 `.workbuddy/skills/`。
