# 项目状态入口

> 只此一份台账。当前版本、阶段、并行工作线/写入范围、下一步、未决问题都在这里。

- 更新时间：2026-10-14（立项当天）
- 阶段：**原型 + 骨架并行**（尚无生产代码，尚无发布）

## 已确认

- **应用展示名：索斐**（2026-10-14 用户定；工程目录名 `PoetryCollection` 保持不变，两者互不冲突）。
- **Android 包名 `applicationId`：`dev.sopho.suofei`**（2026-10-14 用户定）。仅影响 Android 工程标识，与工程目录名无关。
- 评审门槛：v3 —— **A/B 两类都需用户确定**，且**接口性质的事项归「先问后做」**，判据与分档见 [review-gates.md](review-gates.md)。
- **接口清单见 [interface-decisions.md](interface-decisions.md)**：已定 3 条（展示名、包名、目录边界），待确认 1 批（契约层 IF-1…IF-4），待补 1 批（平台层 IF-6…IF-10，等 C/D/E 报回）。
- 范围与边界见 [CONTEXT.md](../CONTEXT.md)；工作约定见 [AGENTS.md](../AGENTS.md)；**哪些事需要用户评审见 [review-gates.md](review-gates.md)**。
- 技术选型（负责人判断）：**Kotlin + Jetpack Compose（Android 原生）+ 独立轻量静态 DOM Web**。理由见工作线 D 的报告；
  已核实的备选是共享 Web + Capacitor 壳（一套 UI），若在意「只维护一套 UI」可换，见 `../../misc/sophomore/reference/exploration/personal-poetry-app-platform-options.md`。

## 并行工作线（写入范围互不重叠）

| 线 | 内容 | 写入范围 | 会话（分支/工作树） | 状态 |
|---|---|---|---|---|
| A | 《古诗十九首》原文核对与来源 | `content/`、`docs/sources/` | `1fcd6f3b`（`wt/a-e7e627bc`） | 进行中 |
| B | 阅读原型（视觉与交互，可评审） | `prototype/` | `820562cf`（`wt/b-bc5853db`） | **已交付并入主线**（`e1146e3` → merge `326cafa`），已归档 |
| C | 内容契约实现 + Markdown→JSON 编译与校验 | `tools/`、`schema/`、`tests/` + 契约文档 | `ccfeee5d`（`wt/c-23417088`） | **已交付并入主线**（`00d84c2` → merge `27f52ea`），已归档 |
| D | Android 骨架（Compose）+ Android 离线更新 | `android/` | `3ce1b5e0`（`wt/d-android-d8070ef4`） | 进行中 |
| E | Web 骨架 + 静态离线缓存与内容切换 | `web/` | `2715e86a`（`wt/e-web-367f9289`） | 进行中（视觉留给原型评审后） |

并行方式：每条线一个隔离 git worktree（`C:\Users\wsqsy\Documents\android\.sopho-wt\<线>`），互不写同一目录；负责人读回、验收、再并入主线。任务完成后归档已落定的 worker（归档不删分支/工作树）。建议合并后回收工作树，命令与状态见 `git worktree list`。

契约（`docs/design/content-contract.md`）由负责人维护，工作线不得各自改名；需要扩展先协调。

## 下一步

1. **视觉与交互评审**：原型已入主线，等用户选方向（A 宣纸 / B 清爽 / C「清爽骨架＋衬线正文」）。评审前两端实现保持视觉占位。
2. A 的底本核对结果 → 若存在需要用户拍板的底本/异文取舍，交用户评审。
3. C 编译 / E Web 报告 → 「接口决定（暂定）」集中列给用户；C 已填完第四批（见 [interface-decisions.md](interface-decisions.md)）。
4. IF-4 排序仍待拍板；拍板后需同步内容线（`orderInSource`）与两端排序实现。
5. 原型评审通过后：视觉统一落到两端，再谈 tag 发布流程与产物就绪检查。

## 已交付

- **原型 B**（`prototype/`，commit `e1146e3`）：三个视觉方向（宣纸/清爽/静默终端）、22 张实拍截图、`#/` 与 `#/p/<id>` 路由、file:// 与 http 两种数据来源分支。
  打开：双击 `prototype/index.html`，或 `cd prototype && node tools/serve.mjs`（http://127.0.0.1:8137/）。
  诚实边界（见 `prototype/README.md`）：示例数据为 fixture；未在 Android/WebView 验证；未验真机字体（宣纸方向的宋体在 Android 上大概率没有）；未做无障碍检查；真实笔记 Markdown 只渲染段落/引用/列表/粗体。
- **内容编译 C**（`tools/`、`schema/`、`tests/`，commit `00d84c2`）：`node tools/build-content.mjs [--check]`、`node tools/validate-content.mjs dist/content.json`、`npm test`（75 tests）。负责人**自己复跑过**：75/75 pass；6 条失败用例全部 exit=1；未知键 `translator` 被拒（去掉后 exit=0）；fixture 编译 + schema 校验通过。
  诚实边界：**未对真实 19 首跑过**（A 线内容尚未落地到主树，现在跑得到 `CONTENT_DIR_MISSING`）；未做两端消费验证；未碰构建/设备/发布。

## 本地踩到的坑（值得记住）

- **Windows 上 `chrome.exe --version` 不打印版本且进程不退出** —— 用它探测版本会把整个会话卡死（E 线为此卡了 5 分钟）。要查版本用 `--headless=new --dump-dom` 或直接看安装目录；kill 时按 **pid + 完整命令行 + 启动时刻** 核实，绝不按 `chrome` 模式杀（本机可能有你自己的浏览器）。
- 用管道接 `cmd | head` 时 `$?` 是 `head` 的退出码；要断言退出码就别接管道（或看 `PIPESTATUS`）。

## 未决 / 待用户确认

- 评审门槛 v3：**已由用户确认**（接口性与返工贵的先问，其余先做后报可否决）。
- 契约层接口 IF-1…IF-4：已按要求写出逐条说明 [brief-1-contract-interfaces.md](reviews/brief-1-contract-interfaces.md)；**待用户就 IF-4 排序拍板**（其余若无异议即标为已定）。
- 原型视觉与交互（评审后冻结，再落到两端实现）。
- 仓库名与 Pages 地址：默认 `suofei`；建仓属 A4.1，需单独授权时一并确认。
- 底本文字取舍（如《文选》与《玉台新咏》异文）——仅在两个文本都有出处且影响观感时升级为用户决定。

## 诚实边界

- 原型是**可丢弃的设计探索**，不等于最终实现；两端表现追求约定一致，不要求像素级一致。
- 尚未做过真机/模拟器验收，尚未有任何公开发布动作（授权另行确认）。
- 本机环境事实（JDK/SDK/Gradle 位置等）以工作线报告中的**实测**为准，不以记忆为准。
