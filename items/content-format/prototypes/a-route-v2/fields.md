# A 路线 v2：逐字段稿（canonical 键序 ＋ 每字段的来源与页面用途）

> **性质：待审材料，不是实施授权，也不是已采纳规格。**
> 本表用的是**草案名**（`detail` 等，见 `undecided.md`）。产物样例见 `json/*.json`，实际输出见 `demo-output.txt`。
> 「页」＝三个页面（`docs/interface-decisions.md` IF-46）：**目录**（一级列表，跨组不搜索）／**诗**（正文＋笔记）／**关于**（版本与限制）；「详情」＝**诗歌详情页**（IF-47）。
> 上一稿（只读归档）：`../../history/round-2026-10-15-a-route-draft/`（本稿是它的后继）。

---

## 0. 这一稿相对上一稿改了什么（**用户 2026-10-15 已定，照它写**）

| # | 用户的选择 | 落到这一稿 |
|---|---|---|
| 1 | **每首只保留一个 `dynasty` 字段、用中文表示朝代**（如 `"dynasty": "汉"`） | 不再每首发 `dynastyKey`／`dynastyLabel`／`dynastyOrder` **三份**；**源 MD 也不必写 `dynastyOrder`** |
| 2 | **删掉 `era`** | 键序里没有 `era`；源文件再写 `era` ⇒ 演示会响（`removed-key`）；原值怎么处置**未定**（`era-removal.md`，**不自动迁**） |
| 3 | **`genre` 与 `stanzas` 保留** | 都留在键序里。`genre`＝体裁（**诗页身份行要用**）；`stanzas`＝原文的段/行载体（**删它必须先有替代载体并保住分行/空行**，所以保留） |

⚠️ **两处不要误读**：

- 中文 `dynasty` **不等于**取消**朝代组序**。组序原来由每首诗的 `dynastyOrder` 携带，现在**必须由别处提供** ⇒ 见 `top-level-dynasties.md`（**并列方案，本稿不自行定**）。
- 删 `dynastyOrder` **不等于**取消 `orderInSource`。**组内次序的权威仍是 `orderInSource`**（＝底本原次序，用户 2026-10-14 拍板 `--order source` 为默认）；`orderInSource` 不在本稿的改动范围里。

---

## 1. canonical 键序（本稿草案）

**顶层**（键序不变；`dynasties` 的**去留未被拍板** ⇒ 见 `top-level-dynasties.md`）：

```
formatVersion, contentVersion, generatedAt, dynasties, poems
```

**每首诗**（＝上一稿键序经上面三条选择后的结果）：

```
id, title, author, dynasty, genre, source, orderInSource, detail, stanzas, notes
```

与 v1 契约键序（`docs/design/content-contract.md` §2.1）的净对照：

```
v1   ： id, title, author, dynastyKey, dynastyLabel, dynastyOrder, era, genre, source, orderInSource, variants,   stanzas, notes
本稿 ： id, title, author, dynasty,                                                genre, source, orderInSource, detail, stanzas, notes
                          └── 3 键压成 1 键 ──┘                                   ↑−era                      ↑＋detail  ↑−variants
```

**这张键序里哪些是「已经是用户定的」、哪些只是「草案占位」**：

| 位置 | 状态 |
|---|---|
| `dynasty`（单个中文值）／无 `era`／`genre`／`stanzas` | **用户 2026-10-15 已定**（§0） |
| `orderInSource` | 不变（既有契约；组内次序权威） |
| `title`／`author`／`notes` | 不变 |
| `id` | 键在、**「归谁产生」未定**（手填／文件名／派生 ⇒ `undecided.md` §1） |
| `source` | **归属未定**：留字段（案 A1，本稿样例主线）↔ 归入 `detail`（案 A2，那样**没有** `source` 键；`samples/real-01-alt-source-in-detail.md` 是它的样例） |
| `detail` | A 路线新增；**字段名未定**（`detail` 只是草案）＋**缺省语义未定**（写 `null` ↔ 缺键 ⇒ `undecided.md` §2、§3） |
| `stanzas` 的**切分点** | 来源被切分点收窄；**切分规则未定**（`undecided.md` §4） |

---

## 2. 逐字段：从源文件哪一处来 ＋ 供哪个页用

| 字段 | 从源文件哪一处来 | 供哪个页用 | 状态 |
|---|---|---|---|
| `id` | front matter `id:`（现契约要求 ＝ 文件名） | 目录（列表行的路由/深链接锚点）、诗（路由）。**Web 不显示 id**（2026-10-15 已定） | 形状不变；**「怎么来」未定** |
| `title` | front matter `title:` | 目录（列表行）、诗（页面标题）、详情（页面标题） | 不变 |
| `author` | front matter `author:` | 目录（列表行，作者紧随题名）、诗（身份行） | 不变 |
| **`dynasty`** | front matter `dynasty:`（**中文值**，如 `汉`） | **目录（分组：组名 ＋ 组序）**、**诗（身份行「作者·朝代·体裁」）** | **本稿变化**：由 3 键变 1 键；**组序不再由诗携带** ⇒ `top-level-dynasties.md` |
| ~~`era`~~ | —— | —— | **已删**（用户 2026-10-15）；原 `东汉末` 的去处**未定**（`era-removal.md`） |
| `genre` | front matter `genre:` | 诗（身份行「作者·朝代·体裁」） | **保留**（用户 2026-10-15）；可空 |
| `source` | front matter `source:` | 详情（「底本与来源」那一块） | **归属未定**（A1／A2，两案都有样例） |
| `orderInSource` | front matter `orderInSource:` | **编译期排序**（界面不直接显示）。**组内次序的权威** | **不变**（可空；缺失＝未提供） |
| **`detail`** | 正文里 **`## 详情` 整节**（从该行之后到切分点为止） | **详情**（整块按 Markdown 渲染） | A 路线新增；字段名/缺省语义**未定** |
| `stanzas` | 正文里**第一个 `##` 之前**、且**不在代码围栏内**的行；**空行＝段边界** | 诗（正文分行/分节/空行） | **保留**（用户 2026-10-15）；来源被切分点收窄（规则未定） |
| `notes` | 正文里 **`## 笔记` 整节** | 诗（「我的笔记」按需展开；无笔记如实留空） | 承载位置从 front matter 移到**正文区段**；真实数据 **0/19** 行使（形状未被真实内容检验） |
| ~~`variants`~~（含 `variants[]`／`.text`／`.note`） | —— | —— | **移除**（异文进 `## 详情` 文本） |

**「集合级字段没有上提」这条 A 路线骨架仍然成立**：不存在集合文件，上面这些字段在**每首诗里各写一遍**（`source` 这类 19 首逐字相同的值也一样重复）——这是**已选路线的维护代价**，不在本稿重开讨论。

---

## 3. 删掉 `dynastyOrder` 之后，组序落在哪？

- **v1／上一稿**：作者在**每首诗**里写 `dynastyOrder`，且必须等于注册表值（否则 `DYN_ORDER_MISMATCH`）；产物每首带一份**冗余快照**（契约 §2.1：「朝代字段是冗余快照，权威是顶层 `dynasties` 声明表」）。
- **本稿**：作者**不写**。组序是**编译期按 `dynasty` 查注册表得到的**（`tools/lib/dynasties.mjs` 现在是一张手写表：`label → {key, order}`，11 条，含 `汉 → 100`）。它**最终进不进产物、以什么形状进** ⇒ `top-level-dynasties.md` 的并列方案。
- **受影响的读取路径（只读核到的现状，本材料不改它们）**：

| 位置 | 现在怎么用朝代三键 |
|---|---|
| `web/app/render.js:93-98` | 按 `poem.dynastyKey` 建组，组名用 `dynastyLabel`、组序用 `dynastyOrder`（**不读顶层 `dynasties`**） |
| `web/app/render.js:292-293` | 诗页身份行 `[poem.dynastyLabel, poem.author]`（`era` 追加在末尾） |
| `web/app/content.js:51-74` | 校验：`dynastyKey` 必须是顶层 `dynasties` 里的 key |
| `android/.../data/ContentParser.kt:62-75` | 同（解析时用顶层 `dynasties` 的 `label`/`order` **覆盖**诗里的冗余值） |
| `android/.../data/Domain.kt:51` | `poems.groupBy { it.dynastyKey }` |
| `android/.../ui/ScreenContent.kt:20` | 身份行 `listOfNotNull(dynastyLabel, author, era, genre)` |

⇒ **无论顶层方案选哪个，这几处都要动**（本稿只是把代价写清，不动手）。

---

## 4. 字段集净变化（按用户已定的 B 判据 ⇒ 要求升 `formatVersion`，且**不可逆**）

> **本材料只在这里提一次**；不拿「升版成本」当作阻拦任何候选表达的理由（用户已明确接受 B 规则）。

「字段集」的唯一口径在 `tools/lib/field-set.mjs`（**产物 JSON 的键路径**；数组下标折叠为 `[]`；只看键不看值），冻结记录在 `schema/format-version.json`（现在只有 v1 一条）。

按本稿草案（A1 ＋ 顶层保留注册表）对照 v1 的键路径：

- **消失**：`poems[].dynastyKey`、`poems[].dynastyLabel`、`poems[].dynastyOrder`、`poems[].era`、`poems[].variants`、`poems[].variants[]`、`poems[].variants[].text`、`poems[].variants[].note`
- **新增**：`poems[].dynasty`、`poems[].detail`

⇒ 按 B（**字段集一变就升**）**要求**升 `formatVersion`，且这是**不可逆**动作。

**其它选项各自还会再加/减多少（同一口径）**：

| 选 | 键路径增减 |
|---|---|
| 案 A2（`source` 归详情） | 再少 `poems[].source` |
| 顶层案 ①（保留注册表）/ ①b / ①c | 保持 `dynasties`、`dynasties[]`、`dynasties[].key`、`dynasties[].label`、`dynasties[].order`（①b/①c 则少掉其中的字段路径） |
| 顶层案 ②a（组序＝数组次序） | 少 `dynasties` 及其 4 条子路径（共 5 条） |
| 顶层案 ②b（每首再带组序整数） | 同 ②a，且**加回** `poems[].dynastyOrder` |
| 顶层案 ③（`groups` 两层） | 少那 5 条；多 `groups`、`groups[]`、`groups[].dynasty`、`groups[].poems`、`groups[].poems[]` 与组内诗的整棵子树 |

⚠️ **另有一件不是「升版成本」而是「口径冲突」的事**：若 `detail` 选「缺键不写 `null`」，那么当**没有任何一首有详情**时，`detail` 这条路径**根本不会出现在产物里** ⇒ 字段集变成**内容相关**，与 B 判据「机械、可自动断言」的前提相冲（门是按实际产物的键路径并集+指纹算的）。详见 `undecided.md` §3。

**本材料没有执行升版**：没碰 `schema/format-version.json`、没碰 `tools/lib/interface.mjs`、没改契约。

---

## 5. 两端各自的代价（**只读核到的现状**，不是已完成的工作）

| 页/块 | Web 现状 | Android 现状 | 本稿要改什么 |
|---|---|---|---|
| 目录·分组 | `render.js` 按 `poem.dynastyKey` 建组，组名/组序取诗里的快照 | `Domain.kt` `groupBy { it.dynastyKey }` | 改为按 `dynasty` 分组；**组序改从顶层方案取**（未定） |
| 诗·身份行 | `render.js:292` `[dynastyLabel, author]`（`era` 追加） | `ScreenContent.kt:20` `listOfNotNull(dynastyLabel, author, era, genre)` | 改成 `作者 · dynasty · genre`（`era` 删除）。⚠ 已定口径是「**作者·朝代·体裁**」，而现状是**朝代在前** ⇒ 顺序也要动 |
| 诗·笔记 | `renderNotesBody` **最小子集**（段落/换行/`- ` 列表/`**粗体**`/`*斜体*`；**不含标题/引用/代码/链接**） | `Text(notes)`：**纯文本**，不解析 Markdown | 若 `detail` 用 Markdown，**两端都要一套渲染器** |
| 详情·底本与来源 | 读结构化 `poem.source`，硬编码标题「底本与来源」 | 同 | **A1**：照旧（只改渲染 `detail` 那一块）；**A2**：改读 Markdown，标题由内容提供 |
| 详情·考据 | 逐条渲染 `variants[].text/.note` | 同（有序列表 `1. text` ＋ note） | 改成**渲染一段 Markdown**（两端都改） |
| 诗·`id` | 不显示（2026-10-15 已定） | 不显示 | 无 |

⚠️ **这笔代价里最贵的一条**：**Android 现在是纯文本**，`detail` 若是 Markdown，**Android 需要新增渲染能力**（从零到一）；**Web 的现有子集不含标题与引用**，而样例详情用的正是 `### 小标题`＋列表 ⇒ **Web 也要扩**。范围到底含哪几样，**未定**（`undecided.md` §5）。

---

## 6. 这份字段稿**没有**说什么

- 没有声称任何**字段名**（`detail` 等）、任何**子节名**、任何**切分规则**或**最小 Markdown 范围**已被采纳 —— 全部标为草案/候选。
- 没有对**顶层 `dynasties` 与组序**、**删 `era` 的迁移**、**`source` 的 A1/A2** 表态（分别见 `top-level-dynasties.md`、`era-removal.md`、`undecided.md`）。
- 没有把「A 路线」当成「连 A 的旧字段名与旧解析规则一起批准」。
