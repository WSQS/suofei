# 实施落点与依赖清单（S1–S5 的“具体打在哪”）

> 用途：**落点明细**（S1–S5 具体打在哪、阶段出口、依赖顺序）。
> ⚠ **状态已变（2026-10-16，负责人就地更正）**：本文件原来那句「**准备，不执行**／**当前没有新授权**」**已作废** —— 用户已就 `q-2d2e3a1c` 答复：**允许已采纳范围的工程实现 ＋ 19 首迁移 ＋ 本地构建/测试 ＋ 项目独立模拟器核验**（**仍不发 tag／不部署 Pages／不建 Release／不改远端最新版／不碰用户手机**）。⇒ **表中 S1／S2／S3 已做完、S4 已做过一轮**（见 `docs/status.md`）；本表转为**已完成项的落点记录 ＋ 剩余项清单**（S5＝发布，**仍未授权**）。
> 关系：阶段划分与阶段出口见 `docs/status.md` 的「规则采用 ＋ 下一步实施/迁移/核验计划」；本文件是它的**落点明细**。
> ⚠ **一条验收口径（写死）**：**测试绿 ≠ 设计符合**。每项 UI 必须按**归档原型逐项对照**（下表给了每项的采纳锚所在轮次）；测试只证明“没坏”，**不能代替对照**。

## 1. S1 · 规则在编译器落地（打在哪）

| 落点 | 改什么 |
|---|---|
| `tools/build-content.mjs` | `readRecords`（现第 114–140 行）→ **递归**扫描 `content/poems/` 之下；**ID＝相对路径去 `.md`、`/`→`-`**；**排除**（`README*`、`_` 前缀、隐藏/临时文件⇒忽略并计数；非 `.md` ⇒ 报错）；**判重**（NFC＋大小写折叠后比拼接 ID，撞⇒报错并列路径）。同时：`## 详情`/`## 笔记` 解析＋**围栏状态机**（围栏内 `##` 不切、围栏出现即报错、未闭合报错）＋**未知节/重复节报错**＋**空节⇒`null` 保键**＋**未闭合强调报错** |
| `tools/lib/interface.mjs` | `ID_REGEX`／`ID_PATTERN` → **正面约束**（非空／不含 `/`／不含控制字符） |
| `tools/lib/dynasties.mjs` | **去掉 `trim()`** ⇒ 精确匹配（**与契约统一；不得称“当前已符合”**） |
| `tests/` | 逐条断言 **12 份非法夹具的诊断码与文案**＋合法样例 EXIT 0＋判重夹具必红＋空节 `null` 保键 |
| `docs/design/content-contract.md` | **码表进契约**（`UNKNOWN_SECTION`／`DUPLICATE_SECTION`／`MD_*`／`MD_EMPHASIS_UNCLOSED`／`DYNASTY_UNDECLARED` …）＋精确匹配写法与源一致 |

**阶段出口**：合法样例 EXIT 0；12 份非法夹具逐条诊断；`npm test` 全绿（含新增例）。

## 2. S2 · 字段集升版＋**四页 UI 落地**（不只是 Markdown 渲染）

### 2.1 字段与产物
| 落点 | 改什么 |
|---|---|
| `tools/build-content.mjs` | 每首 **10 键**：`id,title,author,dynasty,genre,source,orderInSource,detail,stanzas,notes`（缺值 `null` 保键）；顶层 `dynasties` ＝ **有序中文值数组**（不再是 `[{key,label,order}]`） |
| `schema/content.schema.json` | 键集与 `id` pattern 同步 |
| `schema/format-version.json` ＋ `tools/check-fieldset.mjs` | **`formatVersion` 1 → 2（不可逆）**；冻结记录更新 |

### 2.2 两端 UI（**每一项都要有采纳锚可对照**）
| 页面/项 | 采纳锚（归档轮次） | Web 落点 | Android 落点 |
|---|---|---|---|
| 目录页（悬挂＋竖直居中／缩进 0／作者紧随题名／关于在顶） | `round-2026-10-15-hub-hierarchy`／`hub-horizontal`／`hub-align` | `web/styles.css`、`web/app/render.js` | `ui/Theme.kt`、`ui/StructuralMarks.kt`、`ui/Screens.kt` |
| 诗页 P1/P2 ＋ **全部居中** | `round-2026-10-15-poem-expression`／`poem-align`（锚 `#d4-all`） | `render.js`、`styles.css` | `ui/PoemHead.kt`、`ui/Screens.kt` |
| **语义断行**（够宽保原行；超宽按句读；多标点取当前行放得下最后一个；无标点或半句超宽⇒行尾字符断且余文续行；逗号句号不起行） | `round-2026-10-16-break-semantic`／`round-2026-10-16-break` | `render.js`（渲染层分行；**不改源 MD**） | 同一规则**各做一次**（Compose 侧无现成能力） |
| **宽度口径** `C=min(V,max(320,0.88×(V−24)))`（24 是扣除总量、上界=视口 V） | `round-2026-10-16-width-pct` | `styles.css` | `ui/Theme.kt` |
| 笔记：**② 顶部入口 ＋ 正文下方内联（无框）**；无笔记整块隐藏 | `round-2026-10-16-poem-note` | `render.js`、`styles.css` | `ui/Screens.kt` |
| 详情页：诗题①左对齐／来源①正文前带标签／小标题①eyebrow **无竖线** | `round-2026-10-16-detail` | `render.js`＋**Markdown 渲染**（补 `### `/`> `/`1. `） | `ui/Screens.kt`＋**从零新增最小 Markdown 渲染** |
| 关于页：**A3 次序／无来源／C1 完整 URL／无框**／更新处**V3 标签左对齐**／**初态只按钮无占位**／状态文案取自 `UpdateStatusText` | `round-2026-10-16-about`／`about-min`／`about-update` | `render.js`、`styles.css` | `ui/Screens.kt`、`ui/UpdateStatusText.kt` |
| 分组/身份行随字段变 | — | `content.js`（组名精确匹配）、`render.js`（身份行＝作者·朝代·体裁） | `data/ContentParser.kt`、`data/Domain.kt`（`groupBy` 用中文 `dynasty`）、`ui/ScreenContent.kt`（身份行顺序） |

**两端一致**：**同一份最小范围定义**＋**对照测试**（同一 MD 两端渲染结果对照）；机器可读的范围定义＝ `schema/markdown-subset.json`（人类可读＝ `docs/design/content-contract.md` §1.0）；原型轮 `items/content-format/history/round-2026-10-16-rules-v4/md-subset.md`（已归档）。

### 2.3 **不自动纳入**（用户未选／未授权）
「来源」是否显示；失败态是否换色；1180 行长是否设限；U1–U5/折叠/步骤/分区/多动作；未批准的新状态功能（有新内容可用／下载中+进度／校验中／待切换／延后）。

**阶段出口**：`check-fieldset` 键路径逐项一致；**逐项原型对照清单签核**（按上表锚点）；两端测试绿。

## 3. S3 · 19 首迁移
| 落点 | 改什么 |
|---|---|
| `content/poems/**` | 按 `manifest/19-changes.json` 搬进 `content/poems/古诗十九首/<诗题>.md` |
| 内置产物同源 | `tools/check-bundled-content.mjs`＋Android `assets/content/content.json`＋Web 本地内容（发布线一并同步） |

**阶段出口**：dry-run 报告＋19 首新旧对照；**判重夹具必红**；组内次序仍 `orderInSource`。

## 4. 依赖顺序（别并行到一半撞车）
**S1 → S2（字段与两端渲染必须同批，否则新内容解析不了）→ S3（依赖 S1 的递归扫描与判重）→ S4（覆盖升级与热更验收）→ S5（发布）**。
S4/S5 的授权见 `docs/status.md`；**S3 动真实内容、S5 对外发布，各自单独授权**。

## 4b. 一条硬约束：过渡件不许冒充契约支持（2026-10-16）

- Web 线为过渡引入的 `web/scripts/lib/upgrade-content.mjs`（v1→v2 幂等适配）**只是过渡件**：**S1 产出真实 v2 产物后必须二选一** —— ① **删除它**，或 ② **只留在构建/CI 的临时流程里**（不得进入发布产物或客户端运行路径）。
- ✅ **已执行选择 ①（2026-10-16，Web 过渡件清理）：整份删除** —— 涉及 `import` 与调用（`web/scripts/prepare-dev-content.mjs`、`web/tests/e2e-cdp.mjs`）一并移除，并改回**严格断言**：基座产物的 `formatVersion` 必须是 `2`，否则直接报错（不再偷偷升版；`prepare-dev-content.mjs` 与 e2e 都是这样）。
- ⚠ **客户端不得把 v1 静默升成 v2 后自称支持 formatVersion 2**：契约支持以「**产物本身是 v2**」为准；`SUPPORTED_FORMAT_VERSION` 只认 2，v1 内容照样**如实拒绝**（这正是「字段集一变就升」的代价）。

## 4c. 三条范围纪律（2026-10-16 更正，别泛化）

1. **显式用户选择 > 旧令牌**：此前口头说的「token 唯一权威、原型数值不是」**只适用于用户未选的数值**。用户**显式选过**的那套（题名 **1.5rem/500/0.1em**、身份行 **0.78rem**、题名→身份 **0.7rem**、身份→原文 **2.1rem**、正文 **17px/行高2/字距0.045em**）**必须照做**；若它与旧令牌冲突，**要同步契约（`docs/design/visual-tokens.md`）并把冲突写进差异报告**，**不许静默按旧 token 盖过用户选择**。
2. **有意偏离要单独列差异报告供审**：目录页「新内容已下载」提示条这类**有意偏离**，可以保留并给出验收理由，但**必须在阶段交付的图/报告里单独列成「差异清单」供用户审**；**测试通过 ≠ 用户已采纳** —— 不得以「测试绿」把它写成已定。
3. **过渡态与真机口径都不许冒充**：① Android 内置 `detail` 现为 `null` 是**过渡态**（S3 修），**不得宣称 24 条异文已显示**；② Android 宽度取的 V 是 **Scaffold 内容区宽**（扣系统栏 inset）⇒ 与 Web 视口口径的差异**记入核验范围**（横屏带侧栏时未验）；③ **保住安全区**，**不许机械抹掉 inset 去凑像素一致**。

## 5. 本文件的性质
**准备材料**：不含任何代码改动、不改 `content/`、不迁移、不发布。落地与否**等用户对 `q-2d2e3a1c` 的答复**。
