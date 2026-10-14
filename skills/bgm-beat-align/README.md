# bgm-beat-align · 视频配乐卡点与合成

[vibe-video-skills](https://github.com/JustChenk/vibe-video-skills) 合集仓库的环节型 skill：成片配 BGM 的**节拍量化分析 → 卡点决策 → 合成执行**全流程。用法与纪律见 [SKILL.md](SKILL.md)。

## 一句话

> 别凭感觉卡点。先跑 `scripts/beat_align.py` 拿到 BPM、节拍网格、能量轮廓与幕边界偏差（精确到帧），按 A/B/C 板决策树选方案，再用 `scripts/merge_audio.sh` 一键合成——多数情况「B0 零渲染验听」（贴点模式，视频零重编码，秒级）就能过，少数值得为它重渲染几帧。

## 组成

| 文件 | 作用 |
|---|---|
| `SKILL.md` | 方法论：管线位置、硬性纪律、A/B/C 板决策树、B0/B1 执行深度、四步工作流、验收清单 |
| `scripts/beat_align.py` | 节拍分析（librosa）：对齐报告 + 微调帧表 + 截断点建议 + ffmpeg 命令模板 |
| `scripts/merge_audio.sh` | 配乐合成（ffmpeg）：铺底模式（变速压窗铺满全片）+ 贴点模式（B0：视频原样，BGM 变速/偏移/截断/fade） |

## 快速上手

```bash
# 依赖（一次）：python -m pip install librosa；ffmpeg/ffprobe 自动探测
#   （PATH → BBA_FFMPEG_DIR 环境变量 → 从视频/脚本向上 4 层找 tools/）

# ① 分析：节拍网格 + 幕边界偏差 + 截断点
python scripts/beat_align.py <BGM.mp3> --scenes <幕边界秒列表> --speed 1.5 --json beats.json

# ② A 板一键铺底：画面自动压进 50~60s 窗口 + BGM 1.5x 铺满 + fade 收尾
bash scripts/merge_audio.sh -a <BGM.mp3> <成片.mp4>

# ③ B0 卡点贴点：视频原样零重编码，offset = 幕边界 - 最近拍（负=掐头，正=后移）
bash scripts/merge_audio.sh --align -a <BGM.mp3> -s 1.5 --offset -0.08 <成片.mp4>
```

- `--speed`/`-s` 必须完全一致（默认 1.5），否则全盘错位
- 偏差 ≤0.08s 已在拍上，≤0.12s 微调 1~2 帧，>0.12s 才进微调表（人耳感知阈值约 50~100ms）
- 已固化经验：atempo 超 2.0 自动级联、amix `normalize=0`、画面优先（音频 atrim/apad 迁就）、收尾 fade out

## 设计来源

首个版本（v1.0.0）提炼自「人生高性价比指南」Ep00 配乐卡点实战：We_Never.mp3 × 74s 成片，7 个幕边界 2 个天然在拍、4 个微调 2~4 帧即全部踩拍——验证了「先量化再决定」的价值。v1.1.0 并入 `merge_audio.sh`（项目 `merge-audio.sh` 的泛化版，参数用法向后兼容，并补齐 fade 收尾与零重编码择路），形成分析-决策-合成闭环。本 skill 与 `series-video-planner`（前置规划）、`handdrawn-explainer-video` / `dark-field-explainer-video`（两条风格线）、`douyin-cover-generator`（后置封面）串联使用。

## License

与合集仓库一致。
