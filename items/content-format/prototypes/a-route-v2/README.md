# a-route-v2：下一份 A 路线整合字段稿（**材料**）

> ## ⚠️ 这只是**待审材料**，**不是实施授权、也不是已采纳规格**
> 本目录里的 MD／JSON／脚本**全部是样例、方案示意与演示**：**不迁移 19 首**、**不改正式 schema／工具／契约**（`schema/**`、`tools/**`、`docs/design/content-contract.md` 一字未动）、**不升 `formatVersion`**、**不发布**、**不碰 `content/**`**。
> `json/*.json` 是**样例**，**不是**正式 `dist/content.json`，不参与发布。
> `top-level-candidates/*.json` 是**方案示意**（每个都带 `_note` 标明），**更不是**产物。
> **看完请你们拍板未定项；拍板之前不做正式实现。**

**上一稿（只读归档，本稿是它的后继）**：`../../history/round-2026-10-15-a-route-draft/`（含它自己的 `README.md`／`ARCHIVE.md`，记录了那一轮回答了什么问题、用户由此得出的选择、以及**明确继承下来的未审项**）。

---

## 1. 用户 2026-10-15 已明确的三条（**已定，照它写；不在本材料里当待答**）

| # | 选择 | 落到这一稿 |
|---|---|---|
| 1 | **每首只保留一个 `dynasty` 字段、用中文表示朝代**（如 `"dynasty": "汉"`） | 不再每首发 `dynastyKey`／`dynastyLabel`／`dynastyOrder` 三份；**源 MD 也不必写 `dynastyOrder`** |
| 2 | **删掉 `era`** | 键序里没有 `era`；源里再写 ⇒ 演示会响；原值怎么处置**未定**（`era-removal.md`，**不自动迁**） |
| 3 | **`genre` 与 `stanzas` 保留** | `genre`＝体裁（诗页身份行要用）；`stanzas`＝原文的段/行载体（**删它必须先有替代载体并保住分行/空行**，所以保留） |

⚠️ **不要误读**：中文 `dynasty` **不等于**取消**朝代组序**（组序改由别处提供 ⇒ `top-level-dynasties.md`），也**不等于**取消 `orderInSource`（**组内次序的权威仍是 `orderInSource`**＝底本原次序）。

---

## 2. 先看哪一页

| 你关心什么 | 看哪份 |
|---|---|
| 字段清单、每个字段从哪来／给哪个页用、键序怎么变 | **`fields.md`** |
| 源 MD 与产物 JSON 一处一处怎么对应（含缺省、含夹具） | **`md-json.md`** |
| 「源字段」与「产物派生字段」的界线，`dynasty` 单值后这条线怎么变 | **`source-vs-derived.md`** |
| 顶层 `dynasties` 怎么处置 ＋ 朝代组序注册表放哪（**并列方案**） | **`top-level-dynasties.md`** |
| 删 `era` 之后原值怎么处置（**并列建议**） | **`era-removal.md`** |
| 仍未审的项（**逐条并列、不排推荐**） | **`undecided.md`** |
| 实跑自证（EXIT 码、告警、逐字节比对） | **`demo-output.txt`** |

---

## 3. 文件清单

| 文件 | 是什么 |
|---|---|
| `fields.md` | **字段稿**：本稿 canonical 键序（顶层 ＋ 每首）＋ **每字段的来源与页面用途** ＋ 删 `dynastyOrder` 后组序落在哪 ＋ 字段集净变化 ＋ 两端代价 |
| `md-json.md` | **MD ↔ JSON 对照**：一览表、主线逐处对照（front matter／正文／`## 详情`／`## 笔记`）、三种缺省、A2 对照、**夹具**、产物形状的边界 |
| `source-vs-derived.md` | **源字段 vs 产物派生字段**（上一稿遗留的硬要求）：v1 现状表、本稿变化（那个「查表得来的 Label」现在是什么角色）、`key`／`dynastyOrder`／`era`／`variants` 的归类变化、总表 |
| `top-level-dynasties.md` | 顶层 `dynasties` 与组序注册表的**并列方案**（① 保留注册表／② 不留注册表·编译期算好〔②a 数组次序、②b 每首再带整数〕／③ 编译期输出两层 `groups`）＋ 每案代价 ＋ `key` 去留 ＋ 连带代码 |
| `era-removal.md` | 删 `era` 后的**并列迁移建议**（① 丢弃／② 移到 `detail`／③ 只留仓库文档／④ 如实列出「换名字保留」）＋ 每案代价 |
| `undecided.md` | **仍未审的项**：`id` 来源／`source` 归属／`detail` 字段名／`detail` 缺省语义／`## 详情` 分界／围栏里的 `##`／重复与未知节／最小 Markdown 范围（Web 扩子集、**Android 从零新增**）＋ 本稿新暴露的两条 |
| `samples/*.md` | 源 MD：**真实《行行重行行》** 5 份（含 A2 一案）＋ **多段夹具** 1 份 |
| `json/*.json` | 上述 6 份的**对应产物样例**（只到**每首诗对象**这一层，见 `md-json.md` §6） |
| `fixtures-ambiguous/ambiguous-detail.md` | ⚠️ **故意有歧义**的夹具（重复 `## 详情`／未知 `## 校本`／围栏里的 `##`／超范围表格与 `####`）⇒ 演示**非零退出** |
| `fixtures-ambiguous/removed-keys.md` | ⚠️ 夹具：源里写了本稿**已删除**的 `era`／`dynastyOrder` ⇒ 演示**非零退出**（`removed-key`） |
| `top-level-candidates/*.json` | 顶层方案的**示意**（4 个：①／②a／②b／③），每个都带 `_note`，**不是产物、不是 schema** |
| `demo.mjs` | **演示脚本**（文件头写明「**演示用，不是编译器**」）。只读本目录，**绝不读 `content/`／`tools/`、不写任何东西** |
| `demo-output.txt` | 上面脚本的**真实输出**（三次运行，各带自己的 EXIT 码） |

---

## 4. 自证（实跑，贴原文）

```bash
# ① 无参数：自检 ＋ 自证 ⇒ 正常 EXIT=0
node items/content-format/prototypes/a-route-v2/demo.mjs
# ② 故意有歧义的夹具 ⇒ 必须 EXIT≠0
node items/content-format/prototypes/a-route-v2/demo.mjs --parse <本目录>/fixtures-ambiguous/ambiguous-detail.md
# ③ 源里还写着已删除的旧键 ⇒ 必须 EXIT≠0
node items/content-format/prototypes/a-route-v2/demo.mjs --parse <本目录>/fixtures-ambiguous/removed-keys.md
```

本次实跑结果（原文见 `demo-output.txt`）：

1. **`EXIT=0`**（无参数）：6 份样例全部通过 ——
   - 真实《行行重行行》**8 行逐行相等、单段**；**多段夹具 3 段保真**（`3+3+2＝8`，一行不丢）；
   - **键序＝本稿草案键序**（`id,title,author,dynasty,genre,source,orderInSource,detail,stanzas,notes`）逐份断言；
   - **诗对象里没有 `dynastyKey`/`dynastyLabel`/`dynastyOrder`/`era`** 逐份断言；
   - 缺省三态如预期；样例 **0 告警**；
   - **6 份 `json/*.json` 与解析结果逐字节一致**（防手抄漂移）。
2. **`EXIT=1`**（②）：合成歧义正文抓到 4 类告警（`fence-heading`／`unknown-section`／`duplicate-section`／`md-out-of-range`）；歧义夹具文件抓到 **7 条**告警并**非零退出**。
3. **`EXIT=1`**（③）：`removed-key` **2 条**（`dynastyOrder`、`era`）并**非零退出**。
4. 顶层 4 个方案示意**都可解析**，且各自形状不同（**演示不对哪个更好表态**）。
5. **仓库根不写死层级**：脚本从**自身所在目录向上查找 `prototype/css/theme-tech.css`** 来定位仓库根；找不到就抛错（上一稿曾写死 `join(OUT,'..','..','..')`，整轮搬进 `history/` 后指到 `items/`）。因此本目录**整轮搬走后仍可复跑**，输出里的路径仍锚在仓库根。
   实测两例：① 把本目录整棵复制到仓库内**另一位置**（模拟整轮搬迁）后跑 ⇒ **EXIT=0**；② 复制到**仓库之外**跑 ⇒ 抛「找不到仓库根」并 **EXIT=1**（不静默、不猜）。
6. ⚠️ 输出里那一行「仓库根」打印的是**相对当前目录**的路径（不写机器绝对路径）；换一棵工作树复跑这行会不同，其余相同。

---

## 5. 硬边界（本材料**没有**做什么）

- **只新增**文件，写入范围**只有** `items/content-format/prototypes/a-route-v2/`。
- **没碰**：`items/**/history/**`（上一稿与候选轮整轮归档，**只读、一字未改**；本稿对它们的引用一律用归档路径）、`items/**/item.md`、`content/**`（19 首一字未动）、`tools/**`、`schema/**`、`tests/**`、`docs/**`、`android/**`、`web/**`、`prototype/**`、`release/**`，以及别条会话正在写的 `items/app-ui/prototypes/q-responsive.*`／`q-poem-align.*`。
- **没改**正式契约、没有**升** `formatVersion`（也在 `schema/format-version.json` 上没落地）、没有**发布**、没有 **push**、没有打 tag、没有碰设备/密钥。
- `demo.mjs` **只读**本目录文件，**不写任何东西**（连日志文件都不写）；它是**演示**，**不是** `tools/` 里的正式编译器；正式解析/校验/错误码仍以 `tools/` 与 `docs/design/content-contract.md` 为准。
- 笔记样例**明确是测试夹具**（正文里就写着「不是用户笔记」）；**不代用户写任何第一人称笔记**。
- 提交用 `git commit --only <本目录路径>`（不把别的会话已暂存的文件卷进来）。

---

## 6. 没表达什么（本材料**没有**声称的事）

- **没有**声称用户已采纳任何**字段名**（`detail` 等）、任何**子节名**、任何**切分规则**或**最小 Markdown 范围** —— 全部标为草案/候选。
- **没有**对**顶层 `dynasties` 与组序**、**删 `era` 的迁移**、**`source` 的 A1/A2**、**`dynasty` 透传 vs 规范化**、**`key` 去留**表态 —— 一律**并列**。
- **没有**把「A 路线」当成「连 A 的旧字段名与旧解析规则一起批准」；也**没有**把上一稿的字段名当成已定（`dynastyKey` 三个键与 `era` 恰恰是这一稿按用户选择**去掉**的）。
- **没有**行使**真实多段**：真实 19 首当前都是**单段**；多段只用**明确标注的夹具**验过机制，不据此断言真实内容需要分段。
- **没有**在真实设备/模拟器上验收，**没有**改任何客户端代码；`fields.md` §5 与 `undecided.md` §8 里那些「两端要改什么」是**只读核到的现状＋代价陈述**，**不是已完成的工作**。
- **没有**给出「正文为空」「围栏未闭合」「重复 `## 详情`」「未知 `## X`」这些情形的**正式产物**：演示只做到**会响**（计数 ＋ 告警 ＋ 非零退出），**正式策略未定**。
