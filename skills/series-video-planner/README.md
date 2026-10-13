# series-video-planner

把大主题（万字长文 / 大专题 / 大部头材料）拆成 N 集系列视频并做成合集的规划方法论 skill。

单集生产不在本 skill 范围 —— 拆完之后每集交给 [handdrawn-explainer-video](../handdrawn-explainer-video/) 制作，封面交给 [douyin-cover-generator](../douyin-cover-generator/)。本 skill 管的是「集以上」的所有决策与协作模式。

## 核心内容

- **拆分逻辑四原则**：不按章节机械切 → 按认知弧重组 → 每集一个可独立成立的心智模型 → 番外机制
- **链接强度三档光谱**：完全独立 / **模块化系列（默认推荐）** / 强连载；模块化系列的三件链接器 = 共享主图点亮层 + 回指一句话 + 片尾预告与菜单
- **落盘系列规划**：`系列规划.md`（集目清单 / 全局约定 / 勘误台账 / 制作进度表）
- **双线制作模式**：主线负责调研与独立验收，SubAgent 封闭在单集文件夹里并行制作（一次 2 集）

## 结构

```
series-video-planner/
├── SKILL.md                              # 5 步工作流完整手册
├── references/
│   └── case-study-linux-memory.md        # 首个实战案例（Linux 内存管理 7 集系列全记录）
└── assets/
    └── 系列规划-模板.md                     # 系列规划文档模板，开工第一步复制即用
```
