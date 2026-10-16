# rules-v3：MD → 顶层 JSON 的**规则稿**（规范语句）

> **性质：材料，不是实施。** 本文件把**用户 2026-10-15 已确认的 4 条规则**写成规范语句（「必须／不得／照…序」），并给出**顶层键序**与**每首诗键序**。
> 它**不是**实施授权：**不改** `tools/**`、`schema/**`、`content/**`（19 首一字未动）、**不升** `formatVersion`、**不发布**。
> `samples/*.md`、`fixtures/*.md`、`json/*.json` 是配套样例；`demo.mjs` 是**演示**（不是编译器）。未批准细则的**单一建议**在 `unapproved-details.md`。

---

## 0. 已确认 4 条（**已定，不在本材料里当待答**）

### 规则 ① 顶层带一个**有序朝代列表**，元素是**中文值字符串**

- 产物**必须**含顶层键 `dynasties`，其值是**有序数组**，元素是**中文朝代名字符串**（如 `["汉"]`）。
- **排序权威 = 这个数组的次序**：客户端**必须照数组次序**渲染朝代分组。
- 客户端**不得**从 `poems` 里各诗 `dynasty` 的**首次出现顺序**去推断组序。
- 因此 `dynasties` **不得**是 `[{key,label,order}]` 形状（那是 `formatVersion=1` 的现状，不是本稿）；组序（`order`）与稳定键（`key`）**退出产物**，只留在编译工具内部（注册表）。
- 数组**只含实际有内容的组**（空组不出现）。

**规范语句（一句话）**：*产物必须携带一个按渲染次序排好的中文朝代名数组 `dynasties`；客户端照它的次序分组，且不得用 `poems` 的首次出现次序反推组序。*

### 规则 ② **ID 由文件名生成**；源 MD **不再手填 `id`**

- 源文件的 ID = **文件名去掉 `.md`**（如 `gushi-shijiu-shou-01.md` ⇒ `gushi-shijiu-shou-01`）。
- 源 MD 的 front matter **不得**再写 `id:`；写了就**报错**（演示口径：`forbidden-id-key`），**不得**静默采信。
- 产物**保留** `id` 键（值＝文件名派生值）—— **删源里的键 ≠ 删产物里的键**。
- 由此，「源里两个文件手填同一个 `id`」这类**重复 ID** 在源层面不再可能发生（文件名天然唯一）；重复 ID 的失败模式从「手填撞车」变成「同名文件」（文件系统本身不允许）。

### 规则 ③ `notes`／`detail` **缺失写 `null`**（**保留键**）；界面不显示 `null`

- `detail`、`notes` **缺失时必须写 `null`**，且**键必须保留**（不得省略键）—— 三态可区分：`null`＝「明确知道没有」；键不存在＝「不知道该有没有」（**禁止**）。
- 界面**不得**把 `null` 当内容显示（不得出现字面「null」）。
- 「**无笔记时隐藏整个笔记区**」的规则**照旧**：`notes` 为 `null`（或空）时，笔记区整体不出现。
- 同理，`detail` 为 `null` 时详情页没有可渲染的详情内容。

### 规则 ④ **固定分界**：前面元数据、后面原文；`## 详情`／`## 笔记` 是节；缺节可省

- 一份源文件的结构**固定**为三段，次序固定：

  ```text
  ┌ front matter ─ 文件第一行必须是 `---`，元数据键值对，结束于下一个 `---`
  │ （元数据：title / author / dynasty / genre / orderInSource / source）
  ├ 原文 ─ front matter 之后、第一个节标题之前的全部正文行（**必须**存在，按行承载）
  └ 节 ─ 0..2 个具名节：`## 详情`、`## 笔记`（节次序不强制；**缺节可以不写**）
  ```

- **分界点** = 行首**恰好** `## ` 后跟非空节名（`^##\s+\S`）。`###`（三级标题）**不是**分界点，`#`、行中的 `#` 都不是。
- `## 详情`／`## 笔记` 的内容 = 从该行之后，到**下一个分界点**或文件末尾。
- **缺节** ⇒ 对应产物键写 `null`（规则 ③）。
- 原文里的**空行 = 分段信息**：一段 = 一组连续非空行；产物 `stanzas` 是「段的数组、每段是行的数组」。
- ⚠ 规则 ④ 里**没有逐项批准**的细则（未知节／重复节／围栏里的 `##`／空节／最小 Markdown 范围）见 **`unapproved-details.md`** —— 那里给的是**单一建议**，不是已定规则。

**规范语句（一句话）**：*front matter 之后、第一个 `## ` 之前的正文是原文；`## 详情`／`## 笔记` 是两个具名节，边界到下一个 `## ` 或 EOF 为止；缺节则不写（产物写 `null`）。*

---

## 1. 顶层键序（**必须按此序输出**）

| # | 键 | 类型 | 来源 |
|---|---|---|---|
| 1 | `formatVersion` | integer | 结构版本（见 §6，只提一次） |
| 2 | `contentVersion` | string | 内容版本（发布形如 `YYYY.MM.DD.N`；本地/样例形如 `0.0.0-dev+<sha前12>`） |
| 3 | `generatedAt` | string | UTC 秒精度 ISO-8601，`Z` 结尾 |
| 4 | `dynasties` | string[] | **编译期派生**（规则 ①）：有序中文朝代名，只含有内容的组 |
| 5 | `poems` | object[] | 所有诗，**编译期已排好序**；客户端照数组次序渲染 |

规范语句：*`formatVersion` → `contentVersion` → `generatedAt` → `dynasties` → `poems`，次序不得变。*

## 2. 每首诗键序（**必须按此序输出**）

| # | 键 | 类型 | 源 / 派生 |
|---|---|---|---|
| 1 | `id` | string | **派生**：文件名去 `.md`（规则 ②） |
| 2 | `title` | string | 源：front matter `title` |
| 3 | `author` | string | 源：front matter `author`（佚名／未知照写，不编造人名） |
| 4 | `dynasty` | string | 源：front matter `dynasty`（**中文单值**，如 `汉`） |
| 5 | `genre` | string \| null | 源：front matter `genre`（可缺 ⇒ `null`） |
| 6 | `source` | string | 源：front matter `source`（底本/来源，必填） |
| 7 | `orderInSource` | integer \| null | 源：front matter `orderInSource`（可缺 ⇒ `null`） |
| 8 | `detail` | string \| null | **派生**：`## 详情` 节正文（缺节/空节 ⇒ `null`） |
| 9 | `stanzas` | string[][] | **派生**：原文按空行分段（段的数组、每段是行的数组） |
| 10 | `notes` | string \| null | **派生**：`## 笔记` 节正文（缺节/空节 ⇒ `null`） |

规范语句：*每首诗的键按 `id, title, author, dynasty, genre, source, orderInSource, detail, stanzas, notes` 次序输出；这 10 个键**始终存在**（缺值写 `null` 而不是删键）。*

⚠ 键序是**输出约定**（保证逐字节可比、diff 稳定），**不是**语义依赖：客户端**按名取键**，不得依赖键在对象里的位置。

---

## 3. 缺省（三态）

| 情形 | 写法 | 客户端 |
|---|---|---|
| 有内容 | `"detail": "### 异文\n…"` | 渲染 Markdown（最小范围见 `unapproved-details.md §4`） |
| 明确没有（缺节／空节） | `"detail": null` | **不显示**任何详情内容（不出现字面 `null`） |
| 键不存在 | ✗ **禁止** | ——（会与「漏写/旧产物」无法区分） |

`genre`／`orderInSource` 同理：可缺，缺则 `null`。

---

## 4. 「只有原文」的缺省样例（本材料实测）

`samples/real-01-text-only.md`（无任何节）⇒

```json
{
  "id": "real-01-text-only",
  "title": "行行重行行",
  "author": "佚名",
  "dynasty": "汉",
  "genre": "五言古诗",
  "source": "《文选》卷二十九·杂诗上「古诗一十九首」（李善注本）。……",
  "orderInSource": 1,
  "detail": null,
  "stanzas": [["行行重行行，与君生别离。", "……", "弃捐勿复道，努力加餐饭。"]],
  "notes": null
}
```

（完整顶层 JSON 见 `json/real-01-text-only.json`；有详情节的见 `json/real-01-full.json`。）

---

## 5. 规则 ④ 的隐含后果（**必须一起满足**，否则固定分界会被静默破坏）

1. **编译器必须在切分点停住**：`## ` 之后的内容**不得**被当作诗行编进 `stanzas`（历史上 `### 异文` 曾被当成诗行 ⇒ 静默污染）。
2. **正文隔离验证逐诗逐行**：编译出的每首诗正文行与预期原文行**完全相等**，并检查段落边界、分行数（`demo.mjs` 对真实《行行重行行》做 8 行逐行相等断言）。
3. **围栏状态必须先跟踪**：一个未闭合的 ` ``` ` 会把后面所有内容吞进当前节（静默吞节）⇒ 必须响（见 `unapproved-details.md §2`）。

---

## 6. `formatVersion`：**只如实说一次**

本稿的产物字段集相对 `formatVersion=1` **确有变化**（顶层 `dynasties` 由 `[{key,label,order}]` 变为**中文字符串数组**；每首去掉 `era`／`dynastyKey`／`dynastyLabel`／`dynastyOrder`／`variants`，新增 `detail`）。按**用户已定的 B 判据**（字段集一变就升、**不可逆**），一旦本稿被采纳并实施，`formatVersion` **必须升**，且老客户端会拒收更高版本的内容、退回内置内容。

**本材料不执行升版**：`schema/format-version.json` 一字未动、样例 JSON 的 `formatVersion` 只是**示意值**（不是已注册的版本）。此处**只说一次**，不拿它当门槛，也不在别处反复当理由。

---

## 7. 源文件的**目录组织**（候选；**用户新要求**，仍是材料）

> **〔已被 2026-10-16 的决定取代〕见 `id-and-naming-v2.md`。** 用户 2026-10-16 明确「文件夹与文件名都用**中文**、生成的 ID **带上文件夹名字**来去重」⇒ 本节 §7.3 的「**案 A（basename 全库唯一）**」方向**已被取代**；§7.2 的思考与 §7.4 的边界规则**仍然有效**（并已在 v2 稿里保留、补上两条）。本节**原样保留**，只作留痕。

> 用户要求：**源文件要允许用文件夹组织**。本节给**目录/文件名设计候选**（**不排推荐**），并写清**要改什么**。
> ⚠️ 本节**仍是材料**：**不实际搬 19 首源文件、不改 `tools/`、不改 `schema/`**。

### 7.0 现状（**我独立核过**，不是转述）

| 事实 | 核验 |
|---|---|
| 19 首**平铺**在 `content/poems/`，**无子目录、无 README、无非 `.md`、无符号链接** | `find content/poems -type f`＝19，全为 `.md`；`-type d`／`-type l` 无输出；`! -name '*.md'` 无输出 |
| 编译器 `readRecords`（`tools/build-content.mjs` 第 114–140 行）**只读直接子文件 `.md`、不递归** | `fs.readdirSync(poemsDir, {withFileTypes:true})` ＋ `.filter((d) => d.isFile() && d.name.toLowerCase().endsWith('.md'))`，无 `recursive`、无 `withFileTypes` 之外的遍历 |
| 现状 ID ＝ basename，且**要求** front matter `id` 等于 basename | `tools/lib/content-build.mjs` 第 124 行 `ID_FILENAME_MISMATCH`；`record.base = name.slice(0, -'.md'.length)` |
| ⚠ 现状对符号链接是**静默**的：`d.isFile()` 对 symlink 返回 `false` ⇒ 链接被**无声丢弃** | `Dirent.isFile()` 语义；与应用「宁可响，不许静默」相冲 |

**要支持目录，必须改的（本轮只写清，不真改）**：
1. `readRecords` 改为**递归**扫 `content/poems/` 的后代；
2. ID 派生从「直接子文件名」改为**本节选定的 ID 规则**（案 A 或案 B）；
3. 加**basename 唯一性**校验（案 A）／**相对路径唯一性**校验（案 B）；
4. 加**排除规则**与**响亮报错**（见 §7.4），替换现状的静默过滤；
5. 现状 `ID_FILENAME_MISMATCH` / `ID_DUPLICATE` 的口径随规则 ② 一起重述（规则 ② 下源里不再有 `id`）。

### 7.1 完整示例链：目录树 → 实际文件名 → 生成的 ID

**风格 1：可读中文目录 ＋ 稳定 ASCII basename（不排推荐）**

```text
content/poems/
└─ 汉/
   ├─ gushi-shijiu-shou-01.md   （真实诗：《行行重行行》）
   ├─ gushi-shijiu-shou-02.md   （真实诗：《青青河畔草》）
   └─ gushi-shijiu-shou-06.md   （真实诗：《涉江采芙蓉》）
```

| 实际文件名 | 相对路径 | 案 A ID（basename） | 案 B ID（相对路径） |
|---|---|---|---|
| `gushi-shijiu-shou-01.md` | `汉/gushi-shijiu-shou-01.md` | `gushi-shijiu-shou-01` | `汉/gushi-shijiu-shou-01` |
| `gushi-shijiu-shou-02.md` | `汉/gushi-shijiu-shou-02.md` | `gushi-shijiu-shou-02` | `汉/gushi-shijiu-shou-02` |
| `gushi-shijiu-shou-06.md` | `汉/gushi-shijiu-shou-06.md` | `gushi-shijiu-shou-06` | `汉/gushi-shijiu-shou-06` |

**风格 2a：拼音/ASCII 目录（不引入中文目录名）**

```text
content/poems/
└─ han/
   ├─ gushi-shijiu-shou-01.md
   ├─ gushi-shijiu-shou-02.md
   └─ gushi-shijiu-shou-06.md
```

| 实际文件名 | 案 A ID | 案 B ID |
|---|---|---|
| `gushi-shijiu-shou-01.md` | `gushi-shijiu-shou-01` | `han/gushi-shijiu-shou-01` |
| `gushi-shijiu-shou-02.md` | `gushi-shijiu-shou-02` | `han/gushi-shijiu-shou-02` |
| `gushi-shijiu-shou-06.md` | `gushi-shijiu-shou-06` | `han/gushi-shijiu-shou-06` |

**风格 2b：全平铺（＝现状，也列为候选）**

```text
content/poems/
├─ gushi-shijiu-shou-01.md
├─ gushi-shijiu-shou-02.md
└─ gushi-shijiu-shou-06.md
```

**子变体：中文 basename（**不预先禁掉中文文件名**，但要让后果可见）**

```text
content/poems/汉/行行重行行.md   ⇒ 案 A ID ＝ 行行重行行（中文 ID）
```

⚠️ 后果（**不是判断，是事实**）：案 A 下中文 basename ⇒ **中文 ID**；而**现状** `id` 的模式是 `^[a-z0-9]+(?:-[a-z0-9]+)*-\d+$`（全小写 ASCII）⇒ 中文 ID **与该模式不符**，两件随之要定：URL 深链接的形状（`#/p/<id>` 里放中文需要 URL 编码）与该模式是否放宽。**中文文件名是否使用，由用户选**，本节不预先禁掉、也不推荐。

> 目录**不强制**按朝代或作者：上面只是示例；目录名与朝代/作者/排序**都没有绑定**（§7.5）。

### 7.2 三种变化的**具体后果**

**① 移动目录**（同一份源文件搬家）

```text
改前：content/poems/gushi-shijiu-shou-01.md                    ⇒ 案 A ID = gushi-shijiu-shou-01；案 B ID = gushi-shijiu-shou-01
改后：content/poems/汉/gushi-shijiu-shou-01.md                  ⇒ 案 A ID = gushi-shijiu-shou-01（**不变**）；案 B ID = 汉/gushi-shijiu-shou-01（**变**）
```

后果：**案 A 下移动目录不改 ID**，旧深链接 `#/p/gushi-shijiu-shou-01` 仍能打开；**案 B 下移动目录就换 ID**，旧链接打不开（Web 会落到「找不到这首诗：…」页面，**不会**回退到目录，见 `id-migration.md`）。

**② 出现重复 basename**（同一 basename 出现在两个子目录）

```text
content/poems/汉/行行重行行.md
content/poems/魏晋/行行重行行.md
```

后果：**案 A 无法为它们生成不同 ID** ⇒ 必须**报错**（本目录的 `name-tree-fixture/invalid-dup-basename/` 就是这种真实夹具，`--scan` 会**非零退出**）；**案 B 会给两个不同 ID**（`汉/行行重行行` 与 `魏晋/行行重行行`）而不报错。

**③ 改文件名**（ID 跟着变）

```text
改前：gushi-shijiu-shou-01.md     ⇒ ID = gushi-shijiu-shou-01
改后：gushi-shijiu-shou-001.md    ⇒ ID = gushi-shijiu-shou-001
```

后果：**旧深链接 `#/p/gushi-shijiu-shou-01` 断**（两案都断——basename 变了，案 A 也变）。是否**值得**为改名保留一个「显式覆盖字段」的讨论见 `id-migration.md §4`（它会与「不再手填 `id`」相抵）。

### 7.3 ID 规则两案**并列**（＋代价）

| | **案 A：basename（去 `.md`）** | **案 B：相对路径（去 `.md`）** |
|---|---|---|
| ID 例子 | `gushi-shijiu-shou-01` | `汉/gushi-shijiu-shou-01` |
| 唯一性要求 | **全库 basename 必须唯一**（NFC＋小写后）⇒ **重名报错** | 全库相对路径唯一（文件系统天然保证） |
| 移动目录 | **ID 不变** | **ID 变 ⇒ 旧链接断** |
| 与旧 ID | **19 个旧 ID 保持**（已核：文件名去 `.md` 与产物 `id` **逐字相同** ⇒ 案 A **零迁移代价**） | 把 19 首搬进目录就会改 ID ⇒ **非零迁移代价**、旧链接成批断 |
| 代价 | 不能有两个同名文件（哪怕在不同目录）；中文 basename ⇒ 中文 ID（要另定 URL/模式） | 目录名成了**身份的一部分** ⇒ 目录一动就是一次 ID 迁移；需要路径分隔符/URL 编码约定；且「由文件名生成 ID」的实际含义被扩成「由路径生成」 |

⚠️ **必须写明的一条**：用户已选的是「**由文件名生成 ID**」。案 B 是「由**相对路径**生成 ID」，**不等于**用户那句话 —— **不能悄悄把「文件名」偷换为「相对路径」**。要用案 B，必须作为一个**新的、显式的选择**提出（并接受上面的迁移代价）。因此：

- **本材料把案 A 当作与已定规则 ② 直接一致的那个读法**（文件名＝basename）；
- 案 B 只在用户**明确点头**后才成立。

### 7.4 安全边界（每条一个**清楚建议** ＋ 理由）

| 边界 | 建议 | 理由（＋若不同意会怎样） |
|---|---|---|
| **扫描根** | **只扫 `content/poems/` 之下（含递归子目录），不越出该根**；`--content <dir>` 只换根本身，不换「根之下」的语义 | 源码树里 `docs/`、`tests/`、`release/` 也有 `.md`，一旦越根就会把它们当内容编进产物。若改成「扫仓库全库 `.md`」，必须另立白名单，否则一次编译就把文档/夹具吃进内容 |
| **README 与说明文件** | **约定：`_` 开头（文件或目录）＝非内容；`README.md`（不分大小写）也排除。两者都**忽略并计数**（打印数量，不静默） | 目录组织**需要** README 与别的说明文件 coexisting；一加 README 就编译失败会把「写文档」变成「弄坏构建」。若改成「README 也当内容」，那它就必须有完整 front matter ＋ 正文，否则每次都得给文档凑一套假诗 |
| **符号链接** | **不跟随；且在 poems 根之内遇到符号链接（文件或目录）即报错（非零退出）** | 现状 `d.isFile()` 把链接**静默丢弃**（已核实），与「宁可响」相冲；而跟随链接又可能把**根之外**的内容拉进产物（复制品/多份真相）。若改成「忽略并计数」，那么「内容到底来自哪里」就不再可断言，旧链接/旧 ID 可能指向不存在的目标 |
| **隐藏文件与临时文件** | **`.` 开头的文件/目录、`~$` 前缀或 `~` 后缀的临时文件 ⇒ 忽略并计数** | 它们是编辑器/系统产物（`.DS_Store`、`~$xxx.md`），不是作者笔误；若改成「报错」，一个 OS 临时文件就能阻塞整批编译，且作者无法在源码里预防（文件是工具生成的）。隐患：**隐藏的 `.md`（如 `.草稿.md`）也被忽略** —— 配「计数」可见，若你希望这是错，就把它改成报错 |
| **同名不同 Unicode 形 / 大小写** | **规范化（NFC ＋ 小写）后比较 basename 唯一性 ⇒ 当作重复，报错** | 案 A 要求 basename 全库唯一；同一个字可能有两种 Unicode 形（例：`é` 写作单码点 `U+00E9`（NFC）或 `e`＋组合符 `U+0301`（NFD）；两个文件名**看起来一样**）或大小写差异，而它们在**不同文件系统上会有不同结果**（Windows/macOS 大小写不敏感，Linux/CI 敏感）⇒ 一旦只在部分平台重复，产物会随机器而变。若改成「按字节比较、不规范化」，同一个库在不同平台上可能编出不同 ID 而无人发觉 |
| **空目录** | **忽略并计数**（不报错） | 空目录不是内容，也不可能是作者笔误（git 本身不跟踪空目录）；若改成「报错」，任何刚建好的空目录都会阻塞编译，收益为零 |
| **非 `.md` 文件** | **在 poems 根之内、且不在上面排除清单里的非 `.md` 文件 ⇒ 报错（非零退出）** | 放在诗集目录里的 `x.txt` 几乎总是「以为是 md」的笔误；忽略它就是**静默丢内容**。若改成「忽略并计数」，就必须另立「哪些非 md 文件是素材（图片/字体）」的白名单，而那已经超出本站的存储设计 |

以上建议在 `demo.mjs` 里**可跑、可断**：真实夹具 `exclusions-ok/`（0 错 ＋ 排除 4 项 ＋ 空目录 1 个）、`invalid-nonmd/`（响）、`invalid-dup-basename/`（响）；符号链接/大小写/Unicode 形因为**在 Windows 上做不了可靠的真实夹具**，改用**同一函数**的**合成条目列表**自证（不是真实文件，已在输出里写明）。

### 7.5 这条**与已定规则不冲突**（目录只是组织）

- **不是元数据继承**：诗属于哪个朝代，仍只由 front matter `dynasty` 决定；目录叫 `汉/` **不会**替诗写 `dynasty`（字段缺失照样报 `missing-required-key`）。
- **不是页面分组**：客户端的分组仍由**顶层有序朝代数组 `dynasties`**（规则 ①）决定；目录名**不进产物**。
- **不是排序来源**：组内次序仍由 `orderInSource` 决定；目录名/目录里的文件名字符序**都不**是排序依据。⇒ 案 A 下把目录 `汉/` 改名为 `han/`（或把诗在两个同朝代目录间搬家），产物**逐字节不变**。
- **不影响规则 ②**：ID 只是「从文件名取」还是「从相对路径取」的选择（§7.3）；若取案 A，规则 ② 的历史结论（19 个旧 ID 不变、旧深链接不断）**原样保留**。

---

## 8. 本稿**没有**说什么

- **没有**声称用户已采纳任何**字段名**之外的新东西（`detail`／`source` 等字段名属 `item.md` 已认可的 10 键清单）。
- **没有**批准未批细则：未知节／重复节／围栏里的 `##`／空节／最小 Markdown 范围 —— 那些是 `unapproved-details.md` 里的**单一建议**，**等用户拍板**。
- **没有**改任何生产代码/契约，**没有**迁移 19 首，**没有**发布。
- **没有**决定 `dynasty` 是「源值透传」还是「按注册表规范化」在全量内容上的取舍（当前 19 首源值都等于表里的 `汉`，两种做法输出相同；边界输入差异见 `source-vs-derived.md §2`）。
