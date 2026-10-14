# 项目状态入口

> 只此一份台账。当前版本、阶段、并行工作线/写入范围、下一步、未决问题都在这里。

- 更新时间：2026-10-14（立项当天）
- 阶段：**原型 + 骨架并行**（尚无生产代码，尚无发布）

## 已确认

- 范围与边界见 [CONTEXT.md](../CONTEXT.md)；工作约定见 [AGENTS.md](../AGENTS.md)。
- 技术选型（负责人判断）：**Kotlin + Jetpack Compose（Android 原生）+ 独立轻量静态 DOM Web**。理由见工作线 D 的报告；
  已核实的备选是共享 Web + Capacitor 壳（一套 UI），若在意「只维护一套 UI」可换，见 `../../misc/sophomore/reference/exploration/personal-poetry-app-platform-options.md`。

## 并行工作线（写入范围互不重叠）

| 线 | 内容 | 写入范围 | 会话（分支/工作树） | 状态 |
|---|---|---|---|---|
| A | 《古诗十九首》原文核对与来源 | `content/`、`docs/sources/` | `1fcd6f3b`（`wt/a-e7e627bc`） | 进行中 |
| B | 阅读原型（视觉与交互，可评审） | `prototype/` | `820562cf`（`wt/b-bc5853db`） | 进行中 |
| C | 内容契约实现 + Markdown→JSON 编译与校验 | `tools/`、`schema/`、`tests/` + 契约文档 | `ccfeee5d`（`wt/c-23417088`） | 进行中 |
| D | Android 骨架（Compose）+ Android 离线更新 | `android/` | `3ce1b5e0`（`wt/d-android-d8070ef4`） | 进行中 |
| E | Web 骨架 + 静态离线缓存与内容切换 | `web/` | 未派 | 未开始（等 C 产物先落地） |

并行方式：每条线一个隔离 git worktree（`C:\Users\wsqsy\Documents\android\.sopho-wt\<线>`），互不写同一目录；负责人读回、验收、再并入主线。任务完成后归档已落定的 worker（归档不删分支/工作树）。建议合并后回收工作树，命令与状态见 `git worktree list`。

契约（`docs/design/content-contract.md`）由负责人维护，工作线不得各自改名；需要扩展先协调。

## 下一步

1. 原型（B）出可运行预览 → 交用户评审视觉与交互。
2. C 落地后，E 按同一契约做 Web 离线缓存与内容切换。
3. A 的底本核对结果 → 若存在需要用户拍板的底本/异文取舍，交用户评审。

## 未决 / 待用户确认

- 应用展示名（当前只有工程名 PoetryCollection）。
- 原型视觉与交互（评审后冻结，再落到两端实现）。
- 底本文字取舍（如《文选》与《玉台新咏》异文）。

## 诚实边界

- 原型是**可丢弃的设计探索**，不等于最终实现；两端表现追求约定一致，不要求像素级一致。
- 尚未做过真机/模拟器验收，尚未有任何公开发布动作（授权另行确认）。
- 本机环境事实（JDK/SDK/Gradle 位置等）以工作线报告中的**实测**为准，不以记忆为准。
