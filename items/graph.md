# 索斐 · 工作项与依赖图

> 依据 `engineering-workflow` 技能与它的 `references/work-surface.md` 默认形状。
> **用户 2026-10-15 拍板**：按 skill 默认形状建完整的 `items/<项>/item.md` 树（含 `prototypes/`、`history/`）。
> ⚠️ **诚实交代**：这条决定当时**没有被记进任何项目文件、也没有落地**——直到用户 2026-10-15 问「为什么现在的组织方式还不是按 item 组织的？」才补上。经过写在 [`project-surface/item.md`](project-surface/item.md)。
> **权责**：`item.md` 里的**理解／采纳版本锚／开放区域**属对话侧；**依赖边与排期**（本文件 Edges）权威在调度侧——对话侧整理的那几条标了「待调度侧更正」。

## Items

| 项 | 一句话 | 状态 |
|---|---|---|
| [`first-version`](first-version/item.md) | 第一版整体（内容＋两端实现＋离线更新＋发布链） | 已发布 `v0.1.0`、`v0.1.1`；**屏级未过审** |
| [`content-and-sources`](content-and-sources/item.md) | 《古诗十九首》原文、异文、来源分级 | 已交付；异文已改「上界面」（详情页） |
| [`app-ui`](app-ui/item.md) | 页面集合与屏级（四页／每页信息／屏级评审） | 四页已落地；若干待答 |
| [`app-icon`](app-icon/item.md) | 应用图标 `N1` 与 favicon | **已随 `v0.1.1` 发布** |
| [`content-format`](content-format/item.md) | 源文件与产物的数据组织（H 组） | 待答（两项） |
| [`release-line`](release-line/item.md) | 版本号／CI／发布（含 `v0.1.2` 时机） | `v0.1.2` 待用户批 |
| [`project-surface`](project-surface/item.md) | 工作台迁移（本目录本身） | 本轮补做 |

## Edges（**硬边**＝从"缺的那个结果"指向"被它挡住的范围"）

- 用户未答「详情节在产物里怎么装」（`q-06b547dc`）**--blocks-->** `content-format` · 详情页的**「分段依据」显示**（**不挡**详情页其余部分——它已用现有字段跑通）
- 用户未答「集合级字段上提要不要做」**--blocks-->** `content-format` · 源文件瘦身
- 用户未批「现在发 `0.1.2`」**--blocks-->** `release-line` · 本次发布
- 屏级逐屏过审（**未做**）**--blocks-->** `first-version` · 「屏级符合」的宣称（**不挡**发布，用户已定先发）
- H 组（数据组织）**--blocks-->** `app-ui` · 详情页/关于页的**数据形状**（**不挡**用现有形状渲染）
- `content-format` 若真改字段集 ⇒ **`formatVersion` 升 2、断一次热更（不可逆）** ~related~ `release-line`（**相关不阻塞**，调度侧已保证不塞进同一次发布）

**待调度侧更正**：以上边是对话侧按自己看到的事实整理的；排期与合并顺序以调度侧为准。

## Open regions（还没能表达成项的）

- **「最近读／我的笔记」类入口**：用户 2026-10-15 定「有笔记的诗在一级页零线索＝先这样」⇒ 现在不是一个项；等他真写了笔记再看要不要立项。
- **物理真机验收**：用户已定「验收基准＝模拟器、物理真机不做」⇒ 不是待办项，是**已接受的风险**（记在 `docs/interface-decisions.md` `IF-42`）。
- **上游未表达的**：搜索（已定第一版不做）与它将来何时回来，没有排期，也不构成项。
