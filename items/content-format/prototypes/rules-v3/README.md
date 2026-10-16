# rules-v3：MD → 顶层 JSON 的**样例对 ＋ 规则稿**（**材料**）

> ## ⚠️ 这只是**材料**：**不是实施授权，也不是已采纳规格**
> 本目录里的 MD／JSON／脚本**全部是样例、规则稿与演示**：**不迁移 19 首**、**不改正式 schema／工具／契约**（`schema/**`、`tools/**`、`content/**` 一字未动）、**不升 `formatVersion`**、**不发布**、**不 push**。
> `json/*.json` 是**样例**，**不是**正式 `dist/content.json`，不参与发布。
> **看完请拍板 `unapproved-details.md` 里的未批细则；拍板之前不做正式实现。**

任务：把用户 2026-10-15 **已确认的 4 条规则**写成**规范语句**，配**一份完整不省略的样例对**，并对**未逐项批准的细则**给出**清楚的单一建议**。

---

> **〔2026-10-16 增补〕** 用户新明确「文件夹与文件名都用**中文**、生成的 ID **带上文件夹名字**去重」⇒ 目录/文件名与 ID 的**后继稿**在 **`id-and-naming-v2.md`**（映射链／仅父目录冲突／中文编码与路由现状／旧 ASCII ID 迁移并列）；本 README 下列条目原样保留。
> **〔2026-10-16 收口〕** 用户随后已定：**取案 C2（路径 ID ＋ 连字符）、直接换不做兼容、层级任意** ⇒ **收口稿 `id-final.md`**（完整样例 ＋ 逐项变更清单 ＋ 判重规则）；v2 稿 §5 的 ③④ 已就地标注被否决。

## 1. 先看哪一页

| 你关心什么 | 看哪份 |
|---|---|
| **4 条规则落成的规范语句** ＋ **顶层键序** ＋ **每首键序** ＋ 缺省 | **`rules-v3.md`**（§0–§6） |
| **源文件的目录组织（目录/文件名候选）** | **`rules-v3.md` §7** |
| **未批准细则的单一建议**（未知节/重复节、围栏里的 `##`、空节、最小 Markdown 范围） | **`unapproved-details.md`** |
| **源字段 vs 产物派生字段**、`dynasty` 与 `dynasties` 的分工 | **`source-vs-derived.md`** |
| **文件名 ID 迁移核查**（两种结果 ＋ 建议） | **`id-migration.md`** |
| 完整样例：真实《行行重行行》的 MD ↔ 顶层 JSON | `samples/real-01-full.md` ↔ `json/real-01-full.json` |
| 「只有原文」的缺省样例 | `samples/real-01-text-only.md` ↔ `json/real-01-text-only.json` |
| 笔记非空的形状（**夹具**） | `fixtures/real-01-with-note.md` ↔ `json/real-01-with-note.json` |
| 实跑自证（EXIT 码、告警、逐字节比对、搬迁） | **`demo-output.txt`** ＋ 下节命令 |

---

## 2. 用户 2026-10-15 已确认的 4 条（**已定，照它写；不并列旧选择、不重问**）

| # | 规则（规范语句见 `rules-v3.md §0`） |
|---|---|
| ① | 产物顶层带**有序朝代列表**，是**中文值数组**（如 `["汉"]`）；客户端**照这个序**，**不从 `poems` 首次出现顺序推断** |
| ② | **ID 由文件名生成**（去 `.md`）；**源 MD 不再手填 `id`** |
| ③ | `notes`／`detail` **缺失写 `null`**（**保留键**）；界面不显示 `null`；**无笔记时隐藏整个笔记区** |
| ④ | **固定分界**：前面元数据（front matter）、后面原文；`## 详情`／`## 笔记` 是**节**；**缺节可以不写** |

⚠️ 规则 ④ 里**没有逐项批准**的 5 件事（未知节／重复节／围栏里的 `##`／空节／最小 Markdown 范围）见 `unapproved-details.md` —— 那里给的是**单一建议**，**等用户拍板**。

---

## 3. 文件清单

| 文件 | 是什么 |
|---|---|
| `rules-v3.md` | **规则稿**：4 条规范语句、顶层键序、每首键序、缺省、`formatVersion` 只提一次、目录组织候选（§7） |
| `unapproved-details.md` | 未批细则的**单一建议**（逐条：建议＋理由＋「若你不同意会怎样」） |
| `source-vs-derived.md` | **源字段 vs 派生字段**；`dynasty`（中文单值）与 `dynasties`（中文数组）的分工 |
| `id-final.md` | **〔收口稿〕** C2 路径 ID（`/`→`-`）＋ 完整样例（三种层级）＋ **19 项变更清单** ＋ 判重碰撞规则 ＋ 契约/两端/`formatVersion` 要点 |
| `manifest/19-changes.json` | **变更清单（机器可读）**：19 行 oldRelPath/oldId/title/newRelPath/newId（newId 由 demo 复算比对） |
| `name-tree-final/` | ⚠️ **夹具目录树**：`three-levels/`（根直接／一层／多层，含真实 01/02/06） |
| `demo-id-final.mjs` ＋ `demo-id-final-output.txt` | 上面这一稿的演示与实跑输出（只读本目录、不写；正常 EXIT 0、碰撞/非法 EXIT≠0） |
| `id-and-naming-v2.md` | **〔后继稿〕** 中文目录/文件名 → ID → 路由（映射链、仅父目录冲突、中文编码与路由现状、旧 ASCII ID 迁移并列、边界＋两条）（⚠ §1.2 的 C1/C2 与 §5 的 ③④ 已被 2026-10-16 决定取代/否决） |
| `demo-id-v2.mjs` ＋ `demo-id-v2-output.txt` | 上面这一稿的演示与实跑输出（只读本目录、不写；正常 EXIT 0、冲突/非法 EXIT≠0） |
| `name-tree-fixture-v2/` | ⚠️ **夹具目录树**：中文目录/文件名布局、仅父目录冲突、分隔符冲突、边界夹具 |
| `id-migration.md` | **文件名 ID 迁移核查**：实际结果（19/19 相同）＋ 反事实（假如不同）＋ 建议（⚠ 结论部分已被 2026-10-16 决定取代） |
| `samples/real-01-full.md` | 真实《行行重行行》源 MD（固定结构写全：front matter ＋ 原文 ＋ `## 详情`） |
| `samples/real-01-text-only.md` | 同上但**只有原文**（无节 ⇒ `detail`/`notes` 都 `null`） |
| `fixtures/real-01-with-note.md` | ⚠️ **夹具**（正文自己写明「不是真实数据、不是用户笔记」）：演示 `## 笔记` 非空时 `notes` 是字符串 |
| `fixtures-invalid/*.md` | ⚠️ **故意非法**的夹具（未知节 / 重复节 / 围栏里的 `##` / 未闭合围栏 / 越界 Markdown / 源里写了 `id`）⇒ 演示**非零退出** |
| `json/*.json` | 上面 3 份合法样例的**顶层 JSON**（含 `dynasties` 中文数组、每诗键序、`null` 缺省） |
| `name-tree-fixture/` | ⚠️ **夹具目录树**（见 `rules-v3.md §7`）：目录/文件名候选布局 ＋ 边界夹具（重名 basename / 非 `.md` / 排除项 / 空目录） |
| `demo.mjs` | **演示脚本**（头注写明「**演示用，不是编译器**」）。只读本目录，**绝不读 `content/`／`tools/`、不写任何东西** |
| `demo-output.txt` | 上面脚本的**真实输出**（多次运行，各带自己的 EXIT 码） |

---

## 4. 自证（实跑，贴原文见 `demo-output.txt`）

```bash
D=items/content-format/prototypes/rules-v3

# ① 无参数：自检 ＋ 自证（含目录组织候选）⇒ 正常 EXIT=0
node $D/demo.mjs

# ② 故意非法（未知节）⇒ 必须 EXIT≠0
node $D/demo.mjs --parse $D/fixtures-invalid/invalid-unknown-section.md
# ③ 源里写了 id（规则 ② 已改为由文件名生成）⇒ 必须 EXIT≠0
node $D/demo.mjs --parse $D/fixtures-invalid/invalid-has-id-key.md
# ④ 正常样例 ⇒ EXIT=0
node $D/demo.mjs --parse $D/samples/real-01-full.md

# ⑤ 目录扫描：重复 basename ⇒ 必须 EXIT≠0
node $D/demo.mjs --scan $D/name-tree-fixture/invalid-dup-basename
# ⑥ 目录扫描：排除项/空目录 ⇒ EXIT=0（排除并计数）
node $D/demo.mjs --scan $D/name-tree-fixture/exclusions-ok
```

自证覆盖：

1. **正文切分不污染**：真实《行行重行行》**8 行逐行相等、单段**；`## 详情` 里的 `### 异文` 不会变成诗行。
2. **键序**：顶层 ＝ `formatVersion, contentVersion, generatedAt, dynasties, poems`；每首 ＝ `id, title, author, dynasty, genre, source, orderInSource, detail, stanzas, notes`（逐份断言）。
3. **ID 由文件名生成**（规则 ②），**源里不写 `id`**；写了就响。
4. **顶层 `dynasties` 是中文值数组**（元素类型 `string`，不是对象）⇒ 客户端照序、不首次出现推断。
5. **缺省**：`detail`／`notes` 缺失＝`null`（保留键）。
6. **3 份 `json/*.json` 与解析结果逐字节一致**（防手抄漂移）。
7. **故意非法的输入都响并非零退出**（6 份 MD 夹具 ＋ 1 个目录夹具）。
8. **目录组织**：四种候选布局都扫得通；案 A 的 ID ＝ 旧 ID（零迁移）；三种变化（移动目录／重复 basename／改文件名）的具体后果可复跑。
9. **仓库根不写死层级**：脚本从**自身所在目录向上查找** `prototype/css/theme-tech.css` 定位仓库根；找不到就抛错。实测：整棵目录复制到仓库内**另一位置**后跑 ⇒ EXIT=0；复制到**仓库之外**跑 ⇒ 抛「找不到仓库根」并 EXIT=1（不静默、不猜）。

---

## 5. 硬边界（本材料**没有**做什么）

- **只新增**文件，写入范围**只有** `items/content-format/prototypes/rules-v3/`。
- **没碰**：`items/**/history/**`（只读）、`items/**/item.md`、`content/**`（19 首一字未动）、`tools/**`、`schema/**`、`tests/**`、`docs/**`、`android/**`、`web/**`、`prototype/**`、`release/**`，以及别条会话正在写的 `items/app-ui/prototypes/q-width-pct.*`／`q-poem-align.*`。
- **没改**正式契约、**没有升** `formatVersion`（`schema/format-version.json` 一字未动；样例 JSON 里的 `formatVersion: 2` 只是**示意值**）、**没有发布**、**没有 push**、没有打 tag、没有碰设备/密钥。
- `demo.mjs` **只读**本目录，**不写任何东西**；它是**演示**，**不是** `tools/` 里的正式编译器。
- 笔记/详情夹具**明确标注「不是真实数据」**；**不代用户写任何第一人称笔记**。
- 引用上一稿时用归档路径 `../../history/round-2026-10-15-a-route-draft/`；v2 稿在 `../../prototypes/a-route-v2/`（负责人将把它搬入 `../../history/round-2026-10-15-a-route-v2/`）。

---

## 6. 没表达什么（本材料**没有**声称的事）

- **没有**声称用户已采纳未批细则（未知节/重复节处理、围栏里的 `##`、空节语义、最小 Markdown 范围）—— 全部是**单一建议**，**待用户拍板**。
- **没有**对**目录/文件名风格**、**ID 规则（案 A / 案 B）**表态 —— 一律**并列**（`rules-v3.md §7`）。
- **没有**批准 `dynasty` 的「透传 vs 规范化」（`source-vs-derived.md §3`）。
- **没有**在真实设备/模拟器上验收，**没有**改任何客户端代码；「两端要改什么」是**只读核到的现状 ＋ 代价陈述**，**不是已完成的工作**。
