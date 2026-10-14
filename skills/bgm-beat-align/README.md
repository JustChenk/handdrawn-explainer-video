# bgm-beat-align · 视频配乐卡点

[vibe-video-skills](https://github.com/JustChenk/vibe-video-skills) 合集仓库的环节型 skill：成片配 BGM 前的**节拍量化分析与卡点决策**。用法与纪律见 [SKILL.md](SKILL.md)。

## 一句话

> 别凭感觉卡点。先跑 `scripts/beat_align.py` 拿到 BPM、节拍网格、能量轮廓与幕边界偏差（精确到帧），再按 A/B/C 板决策树选方案——多数情况是「B0 零渲染验听」就能过，少数值得为它重渲染几帧。

## 组成

| 文件 | 作用 |
|---|---|
| `SKILL.md` | 方法论：管线位置、硬性纪律、A/B/C 板决策树、B0/B1 执行深度、验收清单 |
| `scripts/beat_align.py` | 节拍分析工具（librosa）：对齐报告 + 微调帧表 + 截断点建议 + ffmpeg 命令模板 |

## 快速上手

```bash
# 依赖（一次）：python -m pip install librosa

python scripts/beat_align.py <BGM.mp3> --scenes <幕边界秒列表> --speed 1.5 --json beats.json
```

- `--speed` 必须与实际合成的 `atempo` 完全一致（默认 1.5）
- 偏差 ≤0.08s 已在拍上，≤0.12s 微调 1~2 帧，>0.12s 才进微调表（人耳感知阈值约 50~100ms）
- 脚本直接输出音频截断点的 ffmpeg 命令（`-c:v copy` 零重编码，秒级出 B0 验听版）

## 设计来源

首个版本（v1.0.0）提炼自「人生高性价比指南」Ep00 配乐卡点实战：We_Never.mp3 × 74s 成片，7 个幕边界 2 个天然在拍、4 个微调 2~4 帧即全部踩拍——验证了「先量化再决定」的价值。本 skill 与 `series-video-planner`（前置规划）、`handdrawn-explainer-video` / `dark-field-explainer-video`（两条风格线）、`douyin-cover-generator`（后置封面）串联使用。

## License

与合集仓库一致。
