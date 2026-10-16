# 内容格式契约 v0

- 状态：**草案 v0**，2026-10-14 由负责人（主会话）发起。
- 作用：Android 端、Web 端、内容线、编译线共用的**唯一约定**。字段名/语义的改动属于「统一契约变更」，先协调再同步承接者，不各自改名。
- 本文只定契约，不定视觉。视觉以原型评审结果为准。
- **2026-10-14 契约线 C 补充实现细节**（只补细节，不改 v0 的范围与字段名）：第 1 节 `orderInSource` 与 §1.1–1.4，第 2 节 §2.1，第 3 节 §3.1，第 4 节 §4.1，新增第 5 节。待用户拍板项已在 §2.1 就地标注。
- **2026-10-14 第二轮用户拍板**：产物**只发布 `orderInSource`**，两个拼音名次（`authorSortKey`/`titleSortKey`）**只在编译期内部使用、不写进产物**；排序默认 `source`（保留底本原次序）；客户端不得重排（客户端约定与理由见 §2.1.1，版本影响见 §4.1 末条）。
- **2026-10-14 第三轮用户拍板**：`阙名` 并入匿名作者清单，且清单钉成文件 **`schema/unknown-authors.json`**（唯一机器可读来源，三方一致；编译器改为直接读它）——见 §2.1.1。
- **2026-10-16 第四轮（S1＋S2.1 落地，`formatVersion` 1 → 2，不可逆）**：源格式改成——每首 **10 键**（`id,title,author,dynasty,genre,source,orderInSource,detail,stanzas,notes`）；**`id` 不再写在源里**（由相对路径派生，§1.4）；顶层 `dynasties` 改为**有序中文值数组**；`## 详情`／`## 笔记` 两个节分别承载 `detail`／`notes`；**最小 Markdown 闭集**与四条细则（未知节/重复节报错、空节 `⇒ null` 保键、围栏先跟踪）落地；朝代组名**精确匹配（去掉实现里的 `trim()`）**；码表见 §3.1。
  - ⚠ **本次只到编译/校验/字段**：**两端渲染（S2.2）与 19 首迁移（S3）不在本次范围内**。全文里凡写「两端要改」的都是**代价陈述，不是已完成的工作**；`content/poems/` 里的 19 首在 S3 之前仍是 v1 源，**用新编译器编不过**（过渡期的真实状态，不是缺陷）。
  - ⚠ 被取代的旧写法（`id`／`dynastyOrder`／`era`／`variants`／源里的 `notes`／旧 ASCII `id` 形状）**就地标注**，不再当作可实现路径；旧文保留只为可回溯。

## 1. 源文件：一诗一 Markdown

> ⚠ **本节 2026-10-16 已改写（`formatVersion=2`）**：路径可以递归、`id` 由相对路径派生、字段表换成新的一张。**旧写法**（`content/poems/<id>.md`、全小写 ASCII 且以 `-数字` 结尾的 `id`、`id`/`dynastyOrder`/`era`/`variants`/源里的 `notes` 五个键）**就地标注为已作废**——出现即报错（`FORBIDDEN_ID_KEY`／`REMOVED_KEY`），**不静默转换**。

路径：`content/poems/**/<名字>.md`（一个文件一首诗，UTF-8，LF 换行）。**允许任意层级**（根直接文件／一层／多层）；目录**只是整理**，**不参与分组**——分组由 `dynasty` ＋ 顶层有序朝代数组决定（用户 2026-10-16 已定「目录层级任意」）。

`id`：**不写在源里**，由「相对 `content/poems/` 的完整相对路径、去 `.md`、`/` 统一写成 `-`」派生（用户 2026-10-16 已定 **C2**）。例：`古诗十九首/行行重行行.md` ⇒ `古诗十九首-行行重行行`。**全局唯一**（判重见 §3.1 `ID_DUPLICATE`）。**直接换、不做兼容**：不做 `legacyId`、不做映射表、不做重定向；旧 ASCII 链接失效是**已接受的代价**。

YAML front matter（`---` 包围）字段（`formatVersion=2`）：

| 键 | 必填 | 含义 | 约定 |
|---|---|---|---|
| `title` | 是 | 诗题 | 如 `行行重行行` |
| `author` | 是 | 作者 | 真正佚名/无名氏写 `佚名`；**不编造、不推断具体人名**。判定用的匿名作者清单见 §2.1.1（唯一来源 `schema/unknown-authors.json`） |
| `dynasty` | 是 | 时代/朝代，**分组依据** | **一个中文组名**，必须**逐字符等于**注册表 label（精确匹配，不做别名；未知写 `未详`） |
| `source` | 是 | 文本所据底本/校录来源 | 必须可核，如 `《文选》卷二十九（维基文库校录，2026-10-14 访问）` |
| `genre` | 否 | 体裁 | 如 `五言古诗`；可空 |
| `orderInSource` | 否 | 该诗在底本中的**原次序**（整数，1 起） | 缺失 = 未提供（不是错误）。用途见第 2 节「组内排序策略」 |

**已从源格式去掉的键**（就地替代，出现即报错、**不静默转换**）：

| 旧键 | 现在写在哪 | 报什么码 |
|---|---|---|
| `id` | 不写（由相对路径派生，§1.4） | `FORBIDDEN_ID_KEY` |
| `dynastyOrder` | 不写（组序由注册表 order 决定，顶层 `dynasties` 数组即次序） | `REMOVED_KEY` |
| `era` | 用户已定删掉该字段（更细的时代不再单独承载） | `REMOVED_KEY` |
| `variants` | 考据文本整段写进 `## 详情` 节 | `REMOVED_KEY` |
| `dynastyKey` / `dynastyLabel` | 产物只留一个中文 `dynasty` | `REMOVED_KEY` |
| `notes` | 用户笔记写进 `## 笔记` 节 | `REMOVED_KEY` |

正文（front matter 之后到第一个 `## ` 之前）：

- 每印刷行一行，行内保留全角标点（如 `行行重行行，与君生别离。`）。
- **空行表示分段**（对应纸本空行/段落边界），段内不插空行。
- 正文区不重复写标题，不写解释、译注、赏析等非原文字句。
- **正文区不走 Markdown**：诗行里的 `**`、`- `、`#` 一律原样显示（唯一的例外检查是**行首 `#`** ⇒ `MD_HEADING`，理由见 §3.1）。

两个节（可选、顺序不限；`### ` 不是分界）：

- `## 详情` ⇒ 产物 `detail`（考据/来源等，**最小 Markdown 文本**）；
- `## 笔记` ⇒ 产物 `notes`（**用户个人笔记**，最小 Markdown 文本；agent 不代写第一人称内容）；
- **空节 = 缺失** ⇒ 值写 `null`，**键仍在**（不是 `""`，也不是删键）；**空白节也算空节**。**无诊断、退出码 0**。
- **未知节报错**（`UNKNOWN_SECTION`）；**重复节报错**（`DUPLICATE_SECTION`，落在第二次出现的那一行）。分界要求：行首**恰好** `## ` 后跟**非空**节名。

### 1.0 最小 Markdown 闭集（**源语法**这一份，8 样，闭集）

| # | 语法 | 写法 | 渲染成什么 |
|---|---|---|---|
| 1 | 段落 | 连续非空行 | 一整段 |
| 2 | 段内换行 | 段落里的每一行 | 段内一次换行 |
| 3 | 无序列表 | 行首 `- ` | 列表（每行一项） |
| 4 | 有序列表 | 行首 `1. `、`2. `… | 有序列表（按出现次序编号） |
| 5 | 粗体 | 行内 `**文字**` | 加粗 |
| 6 | 斜体 | 行内 `*文字*` | 斜体 |
| 7 | 三级标题 | 行首 `### ` | 小标题块 |
| 8 | 引用 | 行首 `> ` | 引用块 |

**块标记边界（2026-10-16 收严：四样标记共用一个口径）**：块级标记（`- `／`1. `／`### `／`> `）只在**行首第 0 列**（不许行首缩进）且标记后是**恰好一个 ASCII 空格（U+0020）**、其后第一个字符**非空白**时成立；块内文字 ＝ 标记之后的余下部分**逐字保留**（**两端都不许 trim**）。行首缩进、制表符、多个空格、裸标记（`###`／`-`／`>` 后无内容）一律越界 ⇒ `MD_MARKER_FORM`；`## ` 节分界同理（恰好一个空格，`##\t` 不再是分界、落入 `MD_HEADING`）。
⚠ 起因是**可达的分叉**（不是假想边界）：此前编译器与 Web 用 `\s+`、Android 要字面空格 ⇒ `###\t甲`／`-\t甲`／`1.\t甲` **一端当标题/列表、另一端当段落**，而编译器**放行** ⇒ 那种行真能到达两端；`-  甲` 的项文字与 `### 甲 ` 的尾空格也一端一差。正反例固定在 `tests/fixtures/contract/md-boundary.json`，**编译器／Web／Android 三方都读它**（规则条文也在 `schema/markdown-subset.json` 的 `boundary`）。

> **机器可读的唯一来源＝`schema/markdown-subset.json`**（`constructs[].id` ＝ 上表 8 样；`excluded[].code` ＝ 下面那批越界码；夹具路径也在里面）。
> 两端的**范围定义**都必须与它逐项一致（Android `MarkdownTest` **真读该文件**；Web 侧见 `tests/`）。
> ⚠ 2026-10-16 建立：此前 Android 单测直接读原型目录 `items/content-format/prototypes/rules-v4/expectations.json`——那个目录**会被归档，归档即断**；现已迁到上面这个稳定契约位置（原型那份随 `items/content-format/history/round-2026-10-16-rules-v4/` 归档，仅作历史快照）。

**闭集之外出现即报错**（码见 §3.1）：表格／图片／链接／行内代码／代码围栏／行首任务列表／脚注／行首 HTML／`* ` 星号列表／`# ` 与 `#### ` 及更深（`### ` 是**恰好三级**）／**块标记形式不合规**（`MD_MARKER_FORM`，见上）。**未闭合的行内强调**（落单 `**`／`*`）也报错（`MD_EMPHASIS_UNCLOSED`，负责人 2026-10-16 落定；闭集不含转义写法）。
开闭两个「围栏」行本身报 `MD_CODE_FENCE`，**未闭合**再报 `MD_FENCE_UNCLOSED`；但解析**先跟踪围栏**——围栏内的 `## x` **不算节分界**（否则一个未闭合围栏会静默吞掉后面所有内容）。
**一行一码**：同一行同时越界多种写法时只报优先级最高的那一种（避免刷屏）。

### 1.1 front matter 语法子集（实现细节，契约线 C 定，2026-10-14）

编译器**不引第三方 YAML 依赖**，只接受下列子集；遇到子集外的写法**直接失败**（`YAML_UNSUPPORTED`，不静默半解析）：

- 顶层 `key: value`，key 为 `[A-Za-z][A-Za-z0-9_-]*`；
- 标量：纯文本（可含中文/全角标点）、整数、小数、`true`/`false`、`null`/`~`/空；
- 引号标量：双引号（JSON 转义）与单引号（`''` 表示一个单引号）；
- 空数组字面量 `[]`；缩进块序列（`- 标量` 或 `- key: value` 对象项）；缩进块映射；
- 块标量 `|` / `|-` / `|+`（保留换行）与 `>` / `>-` / `>+`（折行）。**统一去掉尾部空行、不补尾部换行**（不区分 chomping 指示符，这是刻意的简化）——`notes` 是 Markdown 多行文本，用 `|` 或 `|-` 均可；
- 整行注释 `# ...`。
- **不支持**：行内 flow 集合（`{}`、`[a, b]`）、锚点/别名、标签、多文档、tab 缩进、行内（行尾）注释。行内注释尤其危险：正文/来源里可能出现 `#`，静默截断比报错更糟。

其他容错：文件开头允许 BOM；换行 CRLF 会被归一为 LF（契约仍要求 LF）。

### 1.2 未声明的键（`UNKNOWN_KEY`）

front matter 出现必填/可选两张表以外的键时，编译**失败并列出该键**，不静默忽略（避免拼错键名变成「悄悄少了一个字段」）。本轮新增可选键需同时改 `tools/lib/interface.mjs`、`schema/content.schema.json` 与本文件。

### 1.3 朝代分组注册表（`dynastyKey` 的来源）

v0 定了产物里有 `dynastyKey`，但没定它从哪来。定死如下（实现见 `tools/lib/dynasties.mjs`）：

- `dynasty` **精确匹配**注册表的某个中文 label（**逐字符相等，不做 `trim`、不做别名归一、不做繁简折叠**：`汉 `、`漢`、`东汉`、`三国` 都报 `DYNASTY_UNDECLARED`，诊断里列出全部 11 个可用组名，并在「只是首尾空白/NFC 差异」时直接给出归一后的写法）→ 注册表条目 `{key,label,order}`；
  ⚠ **2026-10-16（`formatVersion=2`）就地取代**：order **不再写进每首诗**（它只决定顶层 `dynasties` 数组次序与组序）；旧句「产物同时写 `dynastyKey`/`dynastyLabel`/`dynastyOrder`」**已作废**。
- 注册表 order 直接采用本文件第 1 节那张表：先秦 0 / 汉 100 / 魏晋 200 / 南北朝 300 / 唐 400 / 宋 500 / 元 600 / 明 700 / 清 800 / 近现代 900 / 未详 9999；key 为 `pre-qin`/`han`/`wei-jin`/`nanbei`/`tang`/`song`/`yuan`/`ming`/`qing`/`modern`/`unknown`；
- ~~文件里的 `dynastyOrder` 必须等于注册表 order，否则 `DYN_ORDER_MISMATCH`（防两份排序键打架）~~ ⚠ **2026-10-16 作废**：`dynastyOrder` 已删（`REMOVED_KEY`），`DYN_ORDER_MISMATCH`／`DYN_ORDER_NOT_INTEGER` 两个码随之作废（见 §3.1「已作废的码」）；
- `dynasty` 未在注册表中声明 → `DYNASTY_UNDECLARED`。**不做别名猜测**（`东汉`/`三国` 不会静默归到 `汉`/`魏晋`）；新分组必须显式登记并同步本文件。

### 1.4 `id` 形状（**正面约束**，2026-10-16 就地取代旧正则）

- **非空**；
- **不含 `/`**（路由 `/p/<id>` 用 `[^/]+`，含 `/` 会与 `/detail` 后缀相撞）；
- **不含控制字符与反斜杠**（控制字符在产物/终端里不可见；反斜杠是 Windows 路径分隔符）；
- 其余（中文、大小写、`-`、数字）都允许 —— ID 由磁盘上的真实路径派生，不在这里做「命名风格」的二次发明。

同一正则的源码字符串与 JSON Schema 的 `pattern` 由 `tests/interface.test.mjs` 比对（`ID_REGEX` / `ID_PATTERN`）。
~~`^[a-z0-9]+(?:-[a-z0-9]+)*-\d+$`，且必须等于文件名（不含 `.md`）。末段序号至少一位数字，两位是约定写法。~~
⚠ **本段旧正则已作废**（2026-10-16）：中文 ID 违反它（中文不在 `[a-z0-9]`，且 `古诗十九首-行行重行行` 不以 `-数字` 结尾）；且 `id` 已不由文件名直接决定，而是由**相对路径**派生。

## 2. 编译产物：`dist/content.json`

由 `content/poems/*.md` 编译而来，两端**只读这个 JSON**，客户端不解析 Markdown。

```json
{
  "formatVersion": 2,
  "contentVersion": "2026.10.14.1",
  "generatedAt": "2026-10-14T12:00:00Z",
  "dynasties": ["汉"],
  "poems": [
    {
      "id": "古诗十九首-行行重行行",
      "title": "行行重行行",
      "author": "佚名",
      "dynasty": "汉",
      "genre": "五言古诗",
      "source": "…",
      "orderInSource": 1,
      "detail": "### 异文\n\n- **游子不顾返** —— …",
      "stanzas": [["行行重行行，与君生别离。", "…"], ["…"]],
      "notes": null
    }
  ]
}
```

> ⚠ 上面是 **`formatVersion=2`** 的形状（2026-10-16）。v1 的旧形状（`dynastyKey`/`dynastyLabel`/`dynastyOrder`/`era`/`variants`、顶层 `dynasties: [{key,label,order}]`）**已作废**；旧文见 `items/content-format/history/` 与 `schema/format-version.json` 的 v1 记录（**旧条保留**：它记录着老客户端认得的形状）。

- `dynasties`：**有序中文值数组**（用户 2026-10-15 已定 ①）。**只列实际有内容的组**，次序即显示次序（注册表 order 升序）；每首诗的 `dynasty` 必须逐字等于其中一个值。**分组权威就是它**（不再有每首自带的 key/label/order）。
- `stanzas`：分段数组，内层为行数组；空行→段边界。原文空行信息不得丢失。**正文不走 Markdown**。
- `detail` / `notes`：`null` 或**最小 Markdown 文本**（§1.0）；`notes` 客户端按需展开、默认折叠；`null` 时整块不出现。
- 排序：组内先按作者、再按诗名。排序键由编译期算好写入（`authorSortKey`/`titleSortKey` 用拼音排序：`Intl.Collator('zh-Hans-CN-u-co-pinyin')`）。**佚名/未知作者在该组内排最后**，这是显式规则，不靠字符串碰巧。
  ⚠️ **本 bullet 已被 §2.1 的排序策略取代**：最终规则是「先按 `orderInSource`（有值者，升序），无值者再按作者/诗名拼音；佚名最后」，**默认 `source`**（**已由用户拍板 2026-10-14**）；且**编译期是唯一排序权威，客户端不得重排**。⚠️ 本 bullet 里「排序键写入产物」也**已作废**（见 §2.1.1）：两个拼音名次只在编译期内部用，**不发布**。
- ~~搜索：客户端对 `title`、`author` 做子串匹配（v0 最低要求；拼音增强可后加，不阻塞）。~~ ⚠ **〔2026-10-15 就地替代〕第一版不做搜索**（用户拍板「第一版不做搜索，后续什么时候做再说，我不认为这是必须的」；留痕 `docs/interface-decisions.md` IF-46）⇒ **本条不再是客户端的期望行为**，两端现有搜索实现（含其断言）已随之移除。原文保留（删除线）只为可回溯：**不要按它实现、也不要按它写断言**。

### 2.1 产物形状与排序的实现细节（契约线 C 定，2026-10-14）

上面那段 JSON 是**示意图**（省略了 `orderInSource`）。规范的键与键序如下，编译产物按此固定插入顺序输出（字节可复现、diff 稳定）：

- 顶层：`formatVersion`、`contentVersion`、`generatedAt`、`dynasties`、`poems`；
- ~~分组：`key`、`label`、`order`；~~ ⚠ **2026-10-16 作废**：顶层 `dynasties` 现在是**字符串数组**（每项一个中文组名），没有对象键；
- 每首诗：`id`、`title`、`author`、`dynasty`、`genre`、`source`、`orderInSource`、`detail`、`stanzas`、`notes`（**10 键**；~~`id`、`title`、`author`、`dynastyKey`、`dynastyLabel`、`dynastyOrder`、`era`、`genre`、`source`、`orderInSource`、`variants`、`stanzas`、`notes` 十三个键~~ 已作废）；
- ~~异文：`text`、`note`。~~ ⚠ **2026-10-16 作废**：`variants` 已删，考据文本整段进 `detail`。

**每首诗没有也不应有任何排序字段**：含 `orderInSource` 的产物**不必**再提供排序字段——排序是编译期算出来的**数组性质**，不是每首诗的数据属性。后人看到诗对象里没有排序字段，不要以为漏了。

形状恒定：可选字段缺失时写 `null`（`genre`/`orderInSource`/`detail`/`notes`），不省略键，客户端无需判 undefined。

~~**朝代字段是冗余快照，以声明表为准**：诗对象里的 `dynastyKey`/`dynastyLabel`/`dynastyOrder` 是**冗余快照**（客户端按诗直接渲染时不必先建组索引），**权威是顶层的 `dynasties` 声明表**；任何冲突以 `dynasties` 为准。~~
⚠ **2026-10-16 就地取代**：冗余快照已删 —— 每首只留一个中文 `dynasty`（它是**分组键**，必须逐字等于顶层 `dynasties` 里的某个值）；**权威仍是顶层 `dynasties`**（次序以它为准），编译器保证两者一致。

### 2.1.1 排序：编译期是唯一权威，名次不发布（2026-10-14 用户拍板）

决策：**编译期是唯一排序权威，客户端不得重排**。因此：

- `poems` 数组**已由编译期排好**，客户端照数组顺序渲染即可；
- 编译期算的两个**拼音整数名次**（实现内部的 `authorSortKey`/`titleSortKey`，用 `Intl.Collator('zh-Hans-CN-u-co-pinyin')` 排序取名次，collator 判等时用码位序兜底保证确定）**只在编译期内部使用，不写进 `dist/content.json`**。理由：客户端既然不得重排，两端在正式路径上一个排序字段都不用，产物应保持最小；这两个名次的价值只在编译期算次序时体现。将来若真要做「按诗名排序」视图或拼音搜索，再作为**新字段增量发布**（那是一次接口变更，需同步两端 + `schema/content.schema.json` + 本文）。
- 所以：**不要为了排序去产物里找字段**；没有这样的字段。

**客户端约定（产物与客户端不一致时的兜底）**：

- 组内**只要有任何一首**带整数 `orderInSource` ⇒ 视为「产物已排好」，客户端**照数组次序渲染，不重排**；
- 组内**一首都没有**（例如内容线尚未填 `orderInSource`）⇒ 允许客户端本机兜底排序（作者拼音 → 诗名拼音，佚名排最后），但要**如实告知用户这次用的是兜底次序**，不要把兜底当成权威次序；
- 两种情况下都不得静默改变次序，也不得自行用 `Intl.Collator` 重排一个已排好的数组（两端各自重排会导致两端次序不一致）。

**组内排序策略（编译期一处可切，`--order <source|pinyin>`）**：

- `source`（**用户已拍板为默认**）：先按 `orderInSource`（有值者在组内排在前、升序），无值者再接在后面按作者/诗名拼音；
- `pinyin`：等价于 v0 写的规则——先作者拼音、再诗名拼音；佚名/未知作者（散文列表仅供参考：`佚名`/`无名氏`/`阙名`/`未知`/`未详`/`不详`/空）在组内**排最后**，实现方式是它们的内部名次统一大于所有具名作者（显式规则，不靠字符串碰巧）。

两者共用同一套内部名次，差别只在「底本原次序」这一层的优先级。**当内容尚未提供 `orderInSource` 时两种策略输出完全一致**。

默认值**已由用户拍板（2026-10-14）：`source`**——保留《文选》卷二十九原次序（A 线已按 1..19 写入 `orderInSource`）。本机实测：按 `pinyin` 会把《古诗十九首》19 首里的 18 首换位，「行行重行行」从第 1 位掉到第 19 位。

**匿名作者清单的唯一机器可读来源是 `schema/unknown-authors.json`**（`["佚名", "无名氏", "阙名", "未知", "未详", "不详"]`）。

- **三方（编译器内部、Android、Web）都必须与这个文件一致**；本节与第 1 节里的散文列表**仅供参考**，不得当作实现依据。
- 为什么钉成文件（2026-10-14 用户拍板）：这份清单以前只写在契约散文里，三端各抄一份、抄歪过（编译器 `['佚名','无名氏','未知','未详','不详']`、Android 曾是 `['佚名','未详','无名氏','阙名']`、Web 曾是 `['佚名','无名氏','未详','不详','']`），Web 的 e2e 还用**正则解析契约散文**取清单——一改措辞就红。
- 编译器侧的做法：**直接读该文件**（`tools/lib/interface.mjs` 不再内置第二份常量），文件缺失/形状非法时**直接报错、不静默回退**——回退到内置列表恰好就是当初的问题本身。这样编译器侧的漂移在结构上不可能发生。
- `阙名` 已并入（用户 2026-10-14 拍板）：现有《古诗十九首》19 首作者都是「佚名」，因此这次并入**对当前内容无可见影响**（已实跑验证：产物除 `contentVersion`/`generatedAt` 外逐字不变）。

## 3. 校验（编译必须失败的情形）

> ⚠ **2026-10-16（`formatVersion=2`）就地取代**：下面旧五条已重写（旧文保留为可回溯）：
>
> ~~1. `id` 重复，或与文件名不一致；~~ → `id` 由相对路径派生，判重改成「NFC＋大小写折叠后撞车」（`ID_DUPLICATE`）；
> ~~2. 缺必填键、`dynastyOrder` 非整数；~~ → 缺必填键仍在（`MISSING_REQUIRED_KEY`），`dynastyOrder` 已删；
> ~~3. 正文为空（只有 front matter）；~~ → 正文区没有非空行 ⇒ `BODY_EMPTY`（不再分「无正文区 / 只有空行」两种）；
> ~~4. `dynastyKey` 未在 `dynasties` 中声明；~~ → `dynasty` 不等于注册表任何中文组名 ⇒ `DYNASTY_UNDECLARED`；
> ~~5. 同一诗内 `stanzas` 全空。~~ → 已并入 `BODY_EMPTY`（`STANZAS_ALL_EMPTY` 作废）。

`formatVersion=2` 的校验清单：

1. front matter 缺必填键、类型不对、或出现未声明/已删键；
2. `dynasty` 不是注册表里的中文组名（精确匹配）；
3. 正文区没有任何非空行（`BODY_EMPTY`）；
4. `orderInSource` 写了但不是 ≥ 1 的整数；
5. 节层面的错误（未知节／重复节）与 Markdown 越界（§1.0）；
6. 按相对路径派生的 `id` 撞车；
7. 内容根里的非 `.md` 文件／符号链接（扫描阶段）。

校验失败时编译以非零退出码失败，不产出半成品 `content.json`。

### 3.1 错误码与判定细节（契约线 C；下表已在 2026-10-16 披成 `formatVersion=2`）

每条校验对应一个稳定错误码（测试与流水线按它断言）。编译**一次报出全部错误**，不是只报第一条。诊断格式：`<file>:<line>: [CODE] message`（无文件位置的用 `<cli>`），且 message 里必须能看出**原因与建议动作**（不可见字符要写成 `\uXXXX` 转义）。

| 错误码 | 触发条件 |
|---|---|
| `FRONT_MATTER_MISSING` | 文件第一行不是 `---` |
| `FRONT_MATTER_UNTERMINATED` | front matter 没有结束行 `---` |
| `YAML_UNSUPPORTED` | front matter 用了 §1.1 子集外写法（行内集合、非法转义等） |
| `YAML_DUPLICATE_KEY` | front matter 里重复的键 |
| `MISSING_REQUIRED_KEY` | 任一必填键（`title`/`author`/`dynasty`/`source`）缺失或值为空（逐个报） |
| `UNKNOWN_KEY` | front matter 出现声明之外的键 |
| `FORBIDDEN_ID_KEY` | 源 MD 写了 `id`（已改由相对路径派生） |
| `REMOVED_KEY` | 源 MD 写了 `formatVersion=2` 已去掉的旧键（`dynastyOrder`/`era`/`variants`/`dynastyKey`/`dynastyLabel`/源里的 `notes`） |
| `FIELD_TYPE` | `title`/`author`/`dynasty`/`source` 非字符串，或 `genre` 不是字符串/空 |
| `DYNASTY_UNDECLARED` | `dynasty` 不等于注册表任何中文 label（列出全部可用组名；不做别名/繁简折叠；只差首尾空白或 NFC 时给出归一后的写法） |
| `ORDER_IN_SOURCE_NOT_INTEGER` | `orderInSource` 写了但不是 ≥ 1 的整数（不写不报错） |
| `BODY_EMPTY` | 正文区（front matter 之后、第一个 `## ` 之前）没有任何非空行 |
| `UNKNOWN_SECTION` | `## <名字>` 不在 `{详情, 笔记}` 里（列出本文件已出现的已知节与行号） |
| `DUPLICATE_SECTION` | 同一节名出现 ≥ 2 次（诊断落在**第二次**出现的那一行，并列出全部行号） |
| `MD_CODE_FENCE` | 出现代码围栏行（` ``` `/`~~~`）；围栏内 `##` 不算分界 |
| `MD_FENCE_UNCLOSED` | 围栏到文件末尾都没有闭合（必须先跟踪围栏才能报出来） |
| `MD_HEADING` | 行首标题不是恰好三级（`# `、`#### ` 及更深），或节标题 `##` 后缺空格（后者在**原文区也检查**） |
| `MD_TASK_LIST` / `MD_TABLE` / `MD_IMAGE` / `MD_LINK` / `MD_INLINE_CODE` / `MD_FOOTNOTE` / `MD_HTML` / `MD_STAR_LIST` | §1.0 闭集外的对应写法（一行一码） |
| `MD_MARKER_FORM` | 块标记**形式不合规**：行首缩进，或标记后不是恰好一个空格（制表符／多个空格／裸标记 `###`·`-`·`>` 后无内容）；口径见 §1.0「块标记边界」 |
| `MD_EMPHASIS_UNCLOSED` | 行内强调未闭合（落单 `**`/`*`），落在该行 |
| `ID_DUPLICATE` | 按相对路径派生的 `id`（NFC ＋ 大小写折叠后）撞车 ⇒ 列出全部冲突路径 |
| `ID_INVALID` | 由路径派生的 `id` 不满足 §1.4 的正面约束 |
| `SOURCE_NOT_MARKDOWN` | 内容根里出现不在排除清单里的非 `.md` 文件 |
| `SOURCE_SYMLINK` | 内容根里出现符号链接（**不跟随、报错**；旧实现对 `isFile()` 为假的项静默丢弃） |
| `NO_POEMS` | 内容根下没有任何 `.md` 文件（拒绝产出空目录内容） |
| `CONTENT_DIR_MISSING` | 内容目录不存在 |
| `VERSION_FORMAT` / `VERSION_NOT_MONOTONIC` | 见第 4 节 |
| `ORDER_STRATEGY_INVALID` | `--order` 取值不在 `source`/`pinyin` 里（退出码 2） |

**已作废 / 已改语义的码（`formatVersion=2` 起）：**
`ID_FILENAME_MISMATCH`（源里不再写 `id`）；`DYN_ORDER_NOT_INTEGER`、`DYN_ORDER_MISMATCH`（每首不再自带组排序键）；`VARIANT_INVALID`（`variants` 已删，考据改写成 `## 详情`）；`STANZAS_ALL_EMPTY`（与 `BODY_EMPTY` 合并：正文区没有非空行一律 `BODY_EMPTY`，不再区分「无正文区 / 只有空行」）；`ID_INVALID` **保留但含义已换**（不再是「ASCII 形状不符」而是「不符合 §1.4 正面约束」）。

**扫描阶段的排除规则**（均属**忽略并计数**，不是错误）：`README*`；`_` 前缀（文件或目录）；隐藏（`.` 开头）；临时（`~` 开头或结尾、`#…#`）；空目录。计数出现在 CLI 摘要与 `--json` 的 `ignoredFiles`/`ignoredByReason` 里。

行为约定：

- 退出码：`0` 成功，`1` 校验/构建失败，`2` 命令行用法错误（未知选项、非法 `--order` 等）；
- **失败不写产物，也不动已有产物**（先全量构建到内存，成功后才用临时文件 + rename 原子写入），即「失败保留旧版本」；
- 扫描阶段报错时不进入诗级校验（目录里究竟有什么还说不清），其余情况一次报出全部错误。

## 4. 版本与更新（契约层）

- `formatVersion`：JSON 结构版本。**结构不兼容变更时递增**，旧客户端遇到更高 `formatVersion` 必须保留旧内容、不去解析。
- `contentVersion`：内容版本字符串，单调递增，供更新比较使用。**【已被 §4.1 取代】** v0 默认的「按 ISO 日期前缀＋递增序号的字典序比较」对 `2026.10.9.1` / `2026.10.10.1` 会判错；实际规则以 §4.1 为准（数值逐段比较 + 发布版本由显式输入并强制单调）。
- **应用/资源版本与内容版本分开**：Android 端严格分开（资源版本＝`versionCode`/`versionName`；内容版本＝`contentVersion`；本地快照目录按内容版本命名）。
- **Web 端自 2026-10-14 起不再有「独立内容版本通道」**（用户拍板）：内容与壳（HTML/JS/CSS）**同一次部署一起发布**，所以 Web 的「内容更新」本质就是「站点更新」，交由 **Service Worker 的更新生命周期**负责——站点缓存按应用资源版本命名，内容与壳一起缓存、一起更新，**不再用 `contentVersion` 做更新判断，也没有独立的「已下载/待切换」暂存**。
  - 产物里的 `contentVersion` **仍保留**（发布审计、Android 端、以及产物自身身份）；只是 Web 不用它做更新决策。
  - 理由：① 内容与壳总是同一次发布，Web 不该有第二套并行机制；② 这样不可能出现「旧壳配新内容」（旧 JS 遇到不认识的新字段）——SW 切换时新旧成对生效；③ 代价是 Web 上不能「只更内容、不重新部署站点」（本就不需要）。
  - **但内容仍要「单独取」，不得内联进 HTML/JS**：单独取才能在外壳到达后立即渲染框架并如实显示「正在取内容／失败原因」；内联则一次请求拿全，坏网时没有可显示的中间状态（浏览器拿到 HTML 前渲染不出任何东西），失败即白屏。实测参考：外壳约 59 KB、内容本体约 18 KB。
  - 因此 Web 侧的 `content.json.sha256` 边车**不再是必需**（完整性由 SW 缓存 + HTTPS 承担）；Android 端仍以远端清单里的 `sha256` 为必需。
- 更新语义：完整下载＋校验通过才切换引用；阅读中不替换；失败/损坏保留旧版；新版可删改（不是只累积）。

### 4.1 `contentVersion` 的产生与比较（契约线 C 定死，2026-10-14）

v0 默认的「字典序比较」换成两条明确路径（字典序在 `2026.10.9.1` 与 `2026.10.10.1` 上会错，日期段必须按数值比）：

- **发布版本**：`YYYY.MM.DD.N`（年 4 位、月/日 2 位零填充、`N` ≥ 1 整数），由发布流水线/ tag 通过 `--content-version` 显式给出。只有这个形状用于更新比较；
- **本地派生版本**：`0.0.0-dev+<内容 sha256 前 12 位十六进制>`，未给 `--content-version` 时自动派生。同一份内容重复编译得到**同一个字符串**（不会“变化无常”），但它**永不发布**；
- **比较**：release 与 release 按 `[年,月,日,N]` 数值逐段比较；dev 与 dev 按十六进制串比较；dev < 任意 release（core `0.0.0` 最小）；
- **单调性强制**：给出显式 release 版本时，如果知道「上一版」（`--previous-version`，默认读已有产物里的值），要求新版本 **严格大于** 上一版，否则 `VERSION_NOT_MONOTONIC` 非零退出。dev 版本不做单调检查（它只用于本地/测试）；
- **内容摘要口径**：对 `{formatVersion, dynasties, poems}` 的规范 JSON 求 sha256，**不含** `generatedAt`/`contentVersion`；
- `generatedAt`：UTC 秒精度（`2026-10-14T12:00:00Z`），可用环境变量 `SOURCE_DATE_EPOCH` 固定以复现构建。
- **删字段不升 `formatVersion`（2026-10-14 用户拍板记录）**：删掉 `authorSortKey`/`titleSortKey` 仍保持 `formatVersion: 1`。
  - **用户的选择与理由（原话意思）**：**不升，理由是我们还没进入发布阶段**——现在根本不存在「已经装在用户手机里的旧客户端」，而这个字段删除**没有任何人需要保护**。
  - 技术依据：按 §2.1.1 的客户端约定，客户端本来就不该读这两个键（正式路径上一个排序字段都不用），删掉对合规客户端无影响。
  - ⚠️ **仍未定：发布之后的判据**。等真正发布过第一个版本之后，再改字段集时用哪种口径？候选：① **只在「旧客户端会读错」时才升**（推荐：对应用户实际受到的影响）；② **字段集一变就升**（严格，但每次删字段都会冻结已发布的旧客户端——旧 APK 将拒绝新内容，用户需装新 APK 才能拿到）。**该口径在进入发布阶段前必须定，已在 `docs/status.md` 待决清单里登记。**
  - 升版的真实代价（供上一条参考）：一次 `formatVersion` 递增 + 旧客户端拒绝解析新内容 ⇒ **旧 APK 停止拿到内容更新**（Android 需发新 APK）。
  - ⚠️ **上面那个「仍未定」已在 2026-10-15 定了＝B「字段集一变就升」**（用户拍板，代价不可逆、用户明确接受）⇒ **不要再列为待定**。
- **`1 → 2`（2026-10-16，S1＋S2.1 落地）**：每首从 13 键变 **10 键**（`dynastyKey`/`dynastyLabel`/`dynastyOrder`/`era`/`variants` 消失，新增 `dynasty`/`detail`），顶层 `dynasties` 从对象数组变**字符串数组**（`dynasties[].key/label/order` 三条路径消失，变成 `dynasties[]`）⇒ 字段路径 **28 → 19** 条。
  - 口径与实现：**产物 JSON 的键路径**（`tools/lib/field-set.mjs`）；门＝`tools/check-fieldset.mjs` ＋ 冻结记录 `schema/format-version.json`（**旧条保留**：它记录着老客户端认得的形状）；断言在 `tests/format-version.test.mjs`。
  - ⚠ **过渡期**：S2 落地时 `content/poems/` 还是 v1 源、编不过 ⇒ 字段集门默认编译 `tests/fixtures/shape-v2/content`（形状夹具）；S3 迁移后可 `--content content` 回到真实内容。
  - ⚠ 2026-10-14 那次「删两个拼音名次键仍保持 1」的理由（**还没进入发布阶段**）**已经不再成立**（首个公开版本 `v0.1.1` 已发布），所以本次按 B 判据升。

为什么“单调递增”必须来自显式输入：从内容本身派生（哈希、最大日期）无法保证「改了内容版本一定变大」；能保证单调的只有“人来定这个数”，所以把它做成流水线的显式参数 + 编译器强制检查。

## 5. 编译实现与命令（契约线 C，2026-10-14）

实现只依赖 Node 内置模块；JSON Schema 校验单独用项目本地 devDependency（`ajv@8`，`npm install` 装到本工程 `node_modules`，不装全局）。

| 文件 | 作用 |
|---|---|
| `schema/unknown-authors.json` | **匿名作者清单的唯一机器可读来源**（编译器直接读它；Android/Web 必须与它一致，见 §2.1.1） |
| `schema/content.schema.json` | `dist/content.json` 的 JSON Schema（第 2 节结构的机器可校验形式，随 `formatVersion=2`） |
| `schema/format-version.json` | `formatVersion` 的字段集冻结记录（v1 与 v2 两条） |
| `tools/build-content.mjs` | 编译器 CLI |
| `tools/lib/interface.mjs` | **接口唯一定义处**：产物键序/字段集、front matter 字段集、节名、id 正面约束、路径与 CLI 默认值、退出码、排序策略 |
| `tools/lib/scan.mjs` | 内容根扫描：递归、排除并计数、按相对路径派生 id、符号链接报错 |
| `tools/lib/frontmatter.mjs` | front matter 最小子集解析器（无依赖） |
| `tools/lib/markdown.mjs` | 最小 Markdown 闭集的行分类与越界文案（§1.0） |
| `tools/lib/dynasties.mjs` | 朝代分组注册表（精确匹配） |
| `tools/lib/content-build.mjs` | 校验、分段、排序、组装产物（纯函数） |
| `tools/lib/version.mjs` | `contentVersion` 产生/比较/单调检查 |
| `tools/lib/field-set.mjs` | 「字段集」的机械口径（键路径） |
| `tools/check-fieldset.mjs` | 字段集门（字段集变了却没升 `formatVersion` ⇒ 红） |
| `tools/validate-content.mjs` | 用 schema 校验产物（开发期检查） |
| `tests/` | 单元测试 + CLI 端到端测试 + fixture（含 rules-v4 的 5 份合法样例与 12 份非法夹具） |

命令：

```bash
node tools/build-content.mjs --check                  # 只校验（默认读 content/poems/ 之下，递归）
node tools/build-content.mjs                          # 产出 dist/content.json
node tools/build-content.mjs --check --content tests/fixtures/ok-sorting/content
node tools/build-content.mjs --out dist/content.json --content-version 2026.10.16.1 \
     --previous-version 2026.10.13.1 --order source
node tools/validate-content.mjs dist/content.json     # schema 校验
node tools/check-fieldset.mjs                         # 字段集门（过渡期编译形状夹具）
node --test                                            # 全部测试
```

产物为 2 空格缩进 JSON（便于评审与 diff），`--minify` 可得单行；`dist/` 被 `.gitignore` 忽略，**产物不进仓库**。

接口一致性由 `tests/interface.test.mjs` 守住：它比对 `tools/lib/interface.mjs` 与 `schema/content.schema.json` 的键集/键序/正则，任一侧漂移就测试失败。
