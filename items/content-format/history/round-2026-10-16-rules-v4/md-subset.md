# 主线 2：Markdown 支持子集 —— **最小闭集** ＋ 合法/非法样例 ＋ 诊断原文

> **性质：材料，不是实施。** 本页给出**建议的闭集**（8 样），每样都有：合法样例（在哪个文件里真出现过）、
> 两端预期效果（现状 / 要改）；被排除的写法各有：具体非法样例（逐行）、**诊断原文（逐字）**、两端预期。
> 诊断原文由 `node demo.mjs --dump-diagnostics` 产生（`--verify-docs` 会断言本页引用与演示输出**逐字一致**）。

---

## 1. 建议的最小闭集（**闭集**，不是「至少支持这些」）

| # | 语法 | 写法 | 渲染成什么 |
|---|---|---|---|
| 1 | 段落 `paragraph` | 连续非空行 | 一整段 |
| 2 | 段内换行 `line-break` | 段落里的每一行 | 段内一次换行（不在段间多留白） |
| 3 | 无序列表 `ul-dash` | 行首 `- ` | 列表（每行一项） |
| 4 | 有序列表 `ol-number` | 行首 `1. `、`2. `… | 有序列表（**按出现次序编号**，源里的数字不决定显示编号） |
| 5 | 粗体 `bold` | 行内 `**文字**` | 加粗 |
| 6 | 斜体 `italic` | 行内 `*文字*` | 斜体 |
| 7 | 三级标题 `h3` | 行首 `### ` | 小标题块 |
| 8 | 引用 `quote` | 行首 `> ` | 引用块 |

**为什么是这 8 样**：现有材料够用（真实详情的 `### 异文` 分块 ＋ `- ` 列表 ＋ 行内粗体；考据要引校语 ⇒ `> `）；
范围**小到可以机械判定**（闭集才让「越界会响」成立）；两端各自实现成本可控（Web 补 2 样、Android 从零新增 8 样）。

**闭集里两条易被忽略的边界**：

- `### ` 是**恰好三级**：`# ` 与 `#### ` 都报错（理由：`## ` 是**节分界**，若再放 `# `/`#### ` 进来，「几级标题」就没有唯一定义）。
- `- ` 是**连字符 + 一个空格**：`* ` 不收（见 §3 `MD_STAR_LIST` —— 现状 Web 会把它当列表、Android 不会，两端不一致）。

---

## 2. 每样语法：合法样例 ＋ 两端预期

**哪份文件行使了哪一样**（由 demo 按行分类**探测**，不是口头声明）：

| 样例 | 行使的语法 |
|---|---|
| `samples/real-01-full.md`（真实诗） | 段落、`### `、`- `、粗体 |
| `fixtures/md-subset-legal-fixture.md`（夹具） | 段落、段内换行、`- `、`1. `、粗体、斜体、`### `、`> ` |

⚠ **真实《行行重行行》里没有 `> ` 与 `1. ` 与斜体** —— 因为我不在用户批准前**重排真实考据文本**（把校语抽成引用块是编排，
不是抄录）。所以这三样只在**明确标注的夹具**里演示。这是刻意的选择，不是我漏了样例。

合法样例片段（`fixtures/md-subset-legal-fixture.md` 的笔记节）：

```text
夹具。这一段不是真实数据，也不是用户笔记：只用来演示最小 Markdown 范围的八样写法各长什么样。

### 夹具：段落与段内换行

这一行是段落的第一行，段里有**粗体**；
这一行是同一个段落里的第二行（段内换行＝渲染成一次换行）。
这一段里还有*斜体*。

### 夹具：列表

- 无序列表第一项
- 无序列表第二项

1. 有序列表第一项
2. 有序列表第二项

### 夹具：引用

> 这一行是引用（夹具）：它不是任何真实校语，只用来演示引用块渲染成什么样。
```

### 逐样的两端预期

| 语法 | Web 现状（只读核到） | Web 要改 | Android 现状 | Android 要改 |
|---|---|---|---|---|
| 段落 | **已支持**（`<p data-test="notes-paragraph">`，`web/app/render.js:166-201`） | 不改 | **零 Markdown**：整段笔记是一个 `Text` | 从零新增 |
| 段内换行 | **已支持**（同段第 2 行起插 `<br>`，`web/app/render.js:174-178`） | 不改 | 零 Markdown | 从零新增（段内 `\n`） |
| `- ` 列表 | **已支持**（`<ul data-test="notes-list">`，`:188-194`） | 收窄：只收 `- `（现在也收 `* `） | 零 Markdown | 从零新增 |
| `1. ` 列表 | **不支持**：`1. ` 落进段落、字面显示（`:188` 只匹配 `/^[-*]\s+/`） | **要扩**（`<ol>`） | 零 Markdown | 从零新增 |
| 粗体 | **已支持**（`<strong>`，`:149-162`） | 不改 | 零 Markdown | 从零新增（`SpanStyle` 字重） |
| 斜体 | **已支持**（`<em>`，`:149-162`） | 不改 | 零 Markdown | 从零新增（`SpanStyle` 字形） |
| `### ` | **不支持**：会落进段落、把 `### 异文` 字面画出来 | **要扩**（小标题元素）—— 真实详情依赖它 | 零 Markdown（详情页的小标题是硬编码的） | 从零新增 |
| `> ` | **不支持**：会落进段落、把 `> ` 字面画出来 | **要扩**（`<blockquote>`） | 零 Markdown | 从零新增（缩进 ＋ 左侧竖线） |

> 「零 Markdown」的证据：Android 的笔记是 `Text(poem.notes ?: "（无笔记）")`（`android/app/src/main/java/dev/sopho/suofei/ui/Screens.kt:305-309`），
> 详情页是硬编码小标题 ＋ 逐条 `variants`（同文件 `:339-380`）；全端没有任何行内解析。
> 而 Web 那份子集是**笔记**用的（`renderNotesBody`），详情页现在走的是**结构化**渲染（`web/app/render.js:335-380`）——
> 也就是说：**两端都要为「详情也变成一段 Markdown」做改动**，Web 是「复用 ＋ 扩 3 样」，Android 是「从零」。

---

## 3. 明确排除（出现即报错）

| 排除项 | 写法 | 码 | 为什么排除 |
|---|---|---|---|
| 表格 | 行首 `\|` | `MD_TABLE` | Compose 端要自绘；离线阅读收益低 |
| 图片 | `![` | `MD_IMAGE` | 离线应用没有图片资源通道 |
| 链接 | `](` | `MD_LINK` | 离线应用里点外链的行为未定（是否打开浏览器、是否提示） |
| 行内代码 | 反引号 | `MD_INLINE_CODE` | 与诗歌考据无关 |
| 代码围栏 | 行首 ``` 或 ~~~ | `MD_CODE_FENCE` | 同上；且要引入围栏状态机（见 `sections.md §4`） |
| `# ` / `#### ` / 更深 / `##` 后缺空格 | 行首 | `MD_HEADING` | `## ` 是节分界 ⇒ 标题级别必须唯一 |
| 任务列表 | 行首 `- [ ]` / `- [x]` | `MD_TASK_LIST` | 阅读应用里无收益；且会被误当普通列表 |
| 脚注 | `[^…]` | `MD_FOOTNOTE` | 与诗歌考据无关 |
| 行首 HTML | 行首 `<标签>` | `MD_HTML` | 两端都不执行 HTML；放任它会让「绝不执行 HTML」的安全约定模糊 |
| 星号列表 | 行首 `* ` | `MD_STAR_LIST` | **现状两端不一致**（Web 当列表、Android 当纯文本） |

非法样例（`fixtures-invalid/out-of-range-inline-and-block.md` 的详情节，一处一行；表格按真表写＝表头 ＋ 分隔行）：

```text
### 夹具：越界写法（表格占两行：表头 ＋ 分隔行）

- [ ] 任务列表（夹具）
| 本子 | 异文 |
| --- | --- |
![图片](x.png)（夹具）
[某站](https://example.invalid/x)（夹具）
行内代码：`x`（夹具）
脚注写法[^1]（夹具）
<br>（夹具：行首 HTML 标签）
* 星号列表项（夹具）
```

上面的输入会产生下面这些诊断（**逐字**，`node demo.mjs --all-invalid` 的输出）：

```text
items/content-format/prototypes/rules-v4/fixtures-invalid/out-of-range-inline-and-block.md:16: [MD_TASK_LIST] 详情/笔记里出现任务列表："- [ ] 任务列表（夹具）"。最小范围不含任务列表；请改成普通列表项（`- `）或去掉复选框。
items/content-format/prototypes/rules-v4/fixtures-invalid/out-of-range-inline-and-block.md:17: [MD_TABLE] 详情/笔记里出现表格（行首 `|`）："| 本子 | 异文 |"。最小范围不含表格（Compose 端要自绘）；请改成段落或列表。
items/content-format/prototypes/rules-v4/fixtures-invalid/out-of-range-inline-and-block.md:18: [MD_TABLE] 详情/笔记里出现表格（行首 `|`）："| --- | --- |"。最小范围不含表格（Compose 端要自绘）；请改成段落或列表。
items/content-format/prototypes/rules-v4/fixtures-invalid/out-of-range-inline-and-block.md:19: [MD_IMAGE] 详情/笔记里出现图片："![图片](x.png)（夹具）"。最小范围不含图片（离线应用没有图片资源通道）；请改成文字说明。
items/content-format/prototypes/rules-v4/fixtures-invalid/out-of-range-inline-and-block.md:20: [MD_LINK] 详情/笔记里出现链接："[某站](https://example.invalid/x)（夹具）"。最小范围不含链接（离线应用里点外链的行为未定）；请把地址写成纯文本。
items/content-format/prototypes/rules-v4/fixtures-invalid/out-of-range-inline-and-block.md:21: [MD_INLINE_CODE] 详情/笔记里出现反引号（行内代码或代码围栏）："行内代码：`x`（夹具）"。最小范围不含行内代码与围栏；请改成普通文字。
items/content-format/prototypes/rules-v4/fixtures-invalid/out-of-range-inline-and-block.md:22: [MD_FOOTNOTE] 详情/笔记里出现脚注写法："脚注写法[^1]（夹具）"。最小范围不含脚注；请把注释直接写进正文。
items/content-format/prototypes/rules-v4/fixtures-invalid/out-of-range-inline-and-block.md:23: [MD_HTML] 详情/笔记行首出现 HTML 标签："<br>（夹具：行首 HTML 标签）"。最小范围不含 HTML（两端都不会执行它）；请删掉标签。
items/content-format/prototypes/rules-v4/fixtures-invalid/out-of-range-inline-and-block.md:24: [MD_STAR_LIST] 详情/笔记出现 `* ` 星号列表项："* 星号列表项（夹具）"。闭集只收 `- `（现状 Web 会把 `* ` 当列表、Android 不会 ⇒ 两端不一致）；请改用 `- `。
```

标题越界（`fixtures-invalid/heading-levels.md`：一个 `# `、一个 `#### `）：

```text
items/content-format/prototypes/rules-v4/fixtures-invalid/heading-levels.md:14: [MD_HEADING] 节正文里出现不在最小范围里的标题："# 一级标题（夹具）"。最小范围只收行首恰好 `### `（三级标题）；`# `、`#### ` 及更深都要报错。
items/content-format/prototypes/rules-v4/fixtures-invalid/heading-levels.md:18: [MD_HEADING] 节正文里出现不在最小范围里的标题："#### 四级标题（夹具）"。最小范围只收行首恰好 `### `（三级标题）；`# `、`#### ` 及更深都要报错。
```

围栏（两件事一起说，详见 `sections.md §4`）：

```text
items/content-format/prototypes/rules-v4/fixtures-invalid/fence-with-heading.md:18: [MD_CODE_FENCE] 正文里出现代码围栏："```text"。① 围栏内不算节分界（所以不会另报未知节）；② 最小范围不含围栏，所以这里报错。若确实要贴代码，请先把围栏加进范围并同步两端渲染。
items/content-format/prototypes/rules-v4/fixtures-invalid/fence-unclosed.md:14: [MD_FENCE_UNCLOSED] 第 14 行打开的围栏到文件末尾都没有闭合。必须先跟踪围栏状态才能报出这一条（否则后面所有内容都会被吞进当前节，静默丢内容）。
```

**两端预期（排除项）**：两端都**不需要**为这些写法加渲染分支 —— 它们只出现在**源文件**里，编译期就报错、产物里不会有。
唯一的例外是 `MD_STAR_LIST`：Web 现在**会**把它当列表渲染（`web/app/render.js:188`），所以「报错」同时意味着一处**收窄**。

---

## 4. 两端的代价（照实说，不是已完成的工作）

| 项 | Web | Android |
|---|---|---|
| 复用 | 已有一份笔记渲染器（段落/`<br>`/列表/粗体/斜体），详情页可以改用它 | 无 |
| 要补 | `### `、`> `、`1. ` 三样 ＋ 收窄 `* `；详情页改成渲染 `detail` 文本 | **从零**：逐行解析 → Compose 块；行内 → `AnnotatedString`；替换详情页的结构化渲染；笔记区同用 |
| 共用 | 这一份「闭集」定义要**两端共用一份**（否则两端会漂），并各配一份对照测试（钉 8 样 ＋ 越界） | 同左 |

---

## 5. 已知缺口（本稿**没**解决，如实列出）

1. **未闭合的行内强调不报错**：`**粗体` 少了收尾、或一个落单的 `*`，本稿**不报**（现状 Web 会把 `**` 原样画出来）。
   要补的话需要一条新码（如 `MD_EMPHASIS_UNCLOSED`）＋ 两端一致判定；**我没有替你决定**。
2. **表格只按「行首 `|`」判**：`| a | b |` 这种一行没有分隔行、看着不像表的行也会报。这是**宁可响**的取舍（真表格必然以 `|` 开头）。
3. **`* ` 的两端现状不一致**：Web 当列表（`:188`），Android 当文本 ⇒ 就算不报错，两端也已经不同；本稿建议**报错**把它挡在源文件里。
4. **HTML 现状是「字面显示」而不是「被忽略」**：Web 全部走 `textContent`（`web/app/render.js:132-147`），所以 `<b>` 会**显示成字**。
   报错是为了让这条约定明确，而不是因为现在会执行它。
5. **引用/有序列表的真实用例为空**：真实 19 首里没有出现 `> ` 与 `1. `（只有夹具行使）——因为我不重排真实考据文本。
   若你希望真实详情也用引用块，那是一次**内容编排**决定，需要你点头。

---

## 6. 若你不同意会怎样

- **想收得更小**（去掉 `> ` 或 `### `）：`### ` 去掉的话，真实详情文本（现在用 `### 异文` / `### 分段依据` 分块）就得改写法或退化成一大段；
  `> ` 去掉的话，引校语只能用普通段落表示（读者分不清「谁在说话」）。
- **想放得更宽**（加入表格/链接/代码/围栏）：每多一样，**两端各加实现 ＋ 测试**，且范围定义必须两端共用；
  表格在 Compose 要**自绘**，链接要**先定离线外链行为**，代码要从**围栏状态机**开始（与 `sections.md §4` 联动）。
- **想保留 `* ` 列表**：那就把 `MD_STAR_LIST` 从排除表里拿掉，并**要求 Web 与 Android 同时支持 `* `**（否则两端不一致会留在仓库里）。
