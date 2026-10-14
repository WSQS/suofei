# 内容格式契约 v0

- 状态：**草案 v0**，2026-10-14 由负责人（主会话）发起。
- 作用：Android 端、Web 端、内容线、编译线共用的**唯一约定**。字段名/语义的改动属于「统一契约变更」，先协调再同步承接者，不各自改名。
- 本文只定契约，不定视觉。视觉以原型评审结果为准。
- **2026-10-14 契约线 C 补充实现细节**（只补细节，不改 v0 的范围与字段名）：第 1 节 `orderInSource` 与 §1.1–1.4，第 2 节 §2.1，第 3 节 §3.1，第 4 节 §4.1，新增第 5 节。待用户拍板项已在 §2.1 就地标注。

## 1. 源文件：一诗一 Markdown

路径：`content/poems/<id>.md`（一个文件一首诗，UTF-8，LF 换行）。

`id` 规则：全小写 ASCII，`<来源集合>-<两位序号>`，例如 `gushi-shijiu-shou-01`。全局唯一，且等于文件名（不含 `.md`）。

YAML front matter（`---` 包围）字段：

| 键 | 必填 | 含义 | 约定 |
|---|---|---|---|
| `id` | 是 | 标识 | 与文件名一致，全局唯一 |
| `title` | 是 | 诗题 | 如 `行行重行行` |
| `author` | 是 | 作者 | 真正佚名/无名氏写 `佚名`；**不编造、不推断具体人名** |
| `dynasty` | 是 | 时代/朝代，**分组依据** | 未知写 `未详` |
| `dynastyOrder` | 是 | 组排序键，整数 | 先秦 0 / 汉 100 / 魏晋 200 / 南北朝 300 / 唐 400 / 宋 500 / 元 600 / 明 700 / 清 800 / 近现代 900 / 未详 9999 |
| `era` | 否 | 更细的时代或创作年代说明 | 如 `东汉末`；可空 |
| `genre` | 否 | 体裁 | 如 `五言古诗`；可空 |
| `source` | 是 | 文本所据底本/校录来源 | 必须可核，如 `《文选》卷二十九（维基文库校录，2026-10-14 访问）` |
| `orderInSource` | 否 | 该诗在底本中的**原次序**（整数，1 起） | 缺失 = 未提供（不是错误）。用途见第 2 节「组内排序策略」 |
| `variants` | 否 | 异文记录 | 数组，元素 `{text, note}`；**异文不进正文** |
| `notes` | 否 | **用户个人笔记**（Markdown 文本） | 没写就省略该键；agent 不代写第一人称内容 |

正文（front matter 之后的 Markdown 正文区）：

- 每印刷行一行，行内保留全角标点（如 `行行重行行，与君生别离。`）。
- **空行表示分段**（对应纸本空行/段落边界），段内不插空行。
- 正文区不重复写标题，不写解释、译注、赏析等非原文字句。

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

- `dynasty`（精确匹配 label）→ 注册表条目 `{key,label,order}`，产物同时写 `dynastyKey`/`dynastyLabel`/`dynastyOrder`；
- 注册表 order 直接采用本文件第 1 节那张表：先秦 0 / 汉 100 / 魏晋 200 / 南北朝 300 / 唐 400 / 宋 500 / 元 600 / 明 700 / 清 800 / 近现代 900 / 未详 9999；key 为 `pre-qin`/`han`/`wei-jin`/`nanbei`/`tang`/`song`/`yuan`/`ming`/`qing`/`modern`/`unknown`；
- 文件里的 `dynastyOrder` 必须等于注册表 order，否则 `DYN_ORDER_MISMATCH`（防两份排序键打架）；
- `dynasty` 未在注册表中声明 → `DYNASTY_UNDECLARED`。**不做别名猜测**（`东汉`/`三国` 不会静默归到 `汉`/`魏晋`）；新分组必须显式登记并同步本文件。

### 1.4 `id` 形状（正则固定）

`^[a-z0-9]+(?:-[a-z0-9]+)*-\d+$`，且必须等于文件名（不含 `.md`）。末段序号至少一位数字，两位是约定写法。

## 2. 编译产物：`dist/content.json`

由 `content/poems/*.md` 编译而来，两端**只读这个 JSON**，客户端不解析 Markdown。

```json
{
  "formatVersion": 1,
  "contentVersion": "2026.10.14.1",
  "generatedAt": "2026-10-14T12:00:00Z",
  "dynasties": [{ "key": "han", "label": "汉", "order": 100 }],
  "poems": [
    {
      "id": "gushi-shijiu-shou-01",
      "title": "行行重行行",
      "author": "佚名",
      "dynastyKey": "han",
      "dynastyLabel": "汉",
      "dynastyOrder": 100,
      "era": "东汉末",
      "genre": "五言古诗",
      "source": "…",
      "variants": [],
      "stanzas": [["行行重行行，与君生别离。", "…"], ["…"]],
      "notes": null
    }
  ]
}
```

- `dynasties`：**只列实际有内容的组**，按 `order` 升序。
- `stanzas`：分段数组，内层为行数组；空行→段边界。原文空行信息不得丢失。
- `notes`：`null` 或 Markdown 字符串；客户端按需展开，默认折叠。
- 排序：组内先按作者、再按诗名。排序键由编译期算好写入（`authorSortKey`/`titleSortKey` 用拼音排序：`Intl.Collator('zh-Hans-CN-u-co-pinyin')`）。**佚名/未知作者在该组内排最后**，这是显式规则，不靠字符串碰巧。
- 搜索：客户端对 `title`、`author` 做子串匹配（v0 最低要求；拼音增强可后加，不阻塞）。

### 2.1 产物形状与排序的实现细节（契约线 C 定，2026-10-14）

上面那段 JSON 是**示意图**（省略了 `orderInSource` 与两个排序键）。规范的键与键序如下，编译产物按此固定插入顺序输出（字节可复现、diff 稳定）：

- 顶层：`formatVersion`、`contentVersion`、`generatedAt`、`dynasties`、`poems`；
- 分组：`key`、`label`、`order`；
- 每首诗：`id`、`title`、`author`、`dynastyKey`、`dynastyLabel`、`dynastyOrder`、`era`、`genre`、`source`、`orderInSource`、`variants`、`stanzas`、`notes`、`authorSortKey`、`titleSortKey`；
- 异文：`text`、`note`。

形状恒定：可选字段缺失时写 `null`（`era`/`genre`/`orderInSource`/`notes`）或 `[]`（`variants`），不省略键，客户端无需判 undefined。

`poems` 数组**已由编译期排好**，客户端按数组顺序渲染即可，不需要也不应重排（若两端各自用 `Intl.Collator` 重排，会出现两端次序不一致）。

排序键是**整数名次**（拼音排序的名次），不是拼音字符串：取去重后的作者名/诗名用 `Intl.Collator('zh-Hans-CN-u-co-pinyin')` 排序后给名次；collator 判等时用码位序兜底，保证名次确定。这样客户端用整数比较就能复现同一序，而无须自己带 collator。

**组内排序策略（编译期一处可切，`--order <source|pinyin>`）**：

- `pinyin`：等价于 v0 写的规则——先作者拼音、再诗名拼音；佚名/未知作者（`佚名`/`无名氏`/`未知`/`未详`/`不详`/空）在组内**排最后**，实现方式是它们的 `authorSortKey` 统一大于所有具名作者（显式规则，不靠字符串碰巧）；
- `source`：先按 `orderInSource`（有值者在组内排在前、升序），无值者再接在后面按上面那套作者/诗名拼音。

两者共用同一份 `authorSortKey`/`titleSortKey`，差别只在「底本原次序」这一层的优先级。**当内容尚未提供 `orderInSource` 时两种策略输出完全一致**。

默认值暂定为 `source`，理由：内容尚未提供 `orderInSource` 时与 `pinyin` 输出完全一致（不会静默改变现有行为），一旦补上该键就自然遵守底本原次序。**该默认值等用户拍板**（由负责人转交）——本机实测：按 `pinyin` 会把《古诗十九首》19 首里的 18 首换位，「行行重行行」从第 1 位掉到第 19 位。

## 3. 校验（编译必须失败的情形）

1. `id` 重复，或与文件名不一致；
2. 缺必填键、`dynastyOrder` 非整数；
3. 正文为空（只有 front matter）；
4. `dynastyKey` 未在 `dynasties` 中声明；
5. 同一诗内 `stanzas` 全空。

校验失败时编译以非零退出码失败，不产出半成品 `content.json`。

### 3.1 错误码与判定细节（契约线 C 定，2026-10-14）

每条校验对应一个稳定错误码（测试与流水线按它断言）。编译**一次报出全部错误**，不是只报第一条。

| 契约条目 | 错误码 | 触发条件 |
|---|---|---|
| 1 | `ID_INVALID` | `id` 不匹配 `^[a-z0-9]+(?:-[a-z0-9]+)*-\d+$` |
| 1 | `ID_FILENAME_MISMATCH` | `id` ≠ 文件名（不含 `.md`） |
| 1 | `ID_DUPLICATE` | 两个文件的 `id` 相同 |
| 2 | `MISSING_REQUIRED_KEY` | 任一必填键缺失或值为空（逐个报） |
| 2 | `DYN_ORDER_NOT_INTEGER` | `dynastyOrder` 不是整数 |
| 3 | `BODY_EMPTY` | 关闭 `---` 之后**没有正文区**（或正文区为空字符串） |
| 4 | `DYNASTY_UNDECLARED` | `dynasty` 未在分组注册表中声明（第 1.3 节） |
| 5 | `STANZAS_ALL_EMPTY` | 正文区**存在但只有空行**，构建出的 `stanzas` 为空/全空 |
| 新增 | `UNKNOWN_KEY` | front matter 出现未声明的键（第 1.2 节） |
| 新增 | `DYN_ORDER_MISMATCH` | `dynastyOrder` ≠ 该朝代的注册值 |
| 新增 | `FIELD_TYPE` | `title`/`author`/`source` 非字符串，或 `era`/`genre`/`notes` 不是字符串/空 |
| 新增 | `VARIANT_INVALID` | `variants` 不是数组，或元素缺少非空 `text`，或 `note` 不是字符串/空 |
| 新增 | `ORDER_IN_SOURCE_NOT_INTEGER` | `orderInSource` 写了但不是整数（不写不报错） |
| 语法 | `FRONT_MATTER_MISSING` / `FRONT_MATTER_UNTERMINATED` / `YAML_UNSUPPORTED` / `YAML_DUPLICATE_KEY` | front matter 缺失、未闭合、用了子集外写法、重复键 |
| 版本 | `VERSION_FORMAT` / `VERSION_NOT_MONOTONIC` | 见第 4 节 |
| 其他 | `NO_POEMS` / `CONTENT_DIR_MISSING` | 无 `.md` 文件（拒绝产出空目录内容）/ 内容目录不存在 |

第 3 条与第 5 条不再混为一谈，可区分输入：文件在关闭 `---` 后直接结束（无正文区）→ `BODY_EMPTY`；关了 `---` 但底下只有空白行 → `STANZAS_ALL_EMPTY`。

行为约定：

- 退出码：`0` 成功，`1` 校验/构建失败，`2` 命令行用法错误（未知选项、非法 `--order` 等）；
- **失败不写产物，也不动已有产物**（先全量构建到内存，成功后才用临时文件 + rename 原子写入），即「失败保留旧版本」；
- 错误输出格式：`<file>:<line>: [CODE] message`（无文件位置的用 `<cli>`）。

## 4. 版本与更新（契约层）

- `formatVersion`：JSON 结构版本。**结构不兼容变更时递增**，旧客户端遇到更高 `formatVersion` 必须保留旧内容、不去解析。
- `contentVersion`：内容版本字符串，单调递增，供更新比较使用。**【已被 §4.1 取代】** v0 默认的「按 ISO 日期前缀＋递增序号的字典序比较」对 `2026.10.9.1` / `2026.10.10.1` 会判错；实际规则以 §4.1 为准（数值逐段比较 + 发布版本由显式输入并强制单调）。
- **应用/资源版本与内容版本分开**，Web 端两种缓存也分开（资源缓存 vs 内容存储），不得混用一个版本号。
- 更新语义：完整下载＋校验通过才切换引用；阅读中不替换；失败/损坏保留旧版；新版可删改（不是只累积）。

### 4.1 `contentVersion` 的产生与比较（契约线 C 定死，2026-10-14）

v0 默认的「字典序比较」换成两条明确路径（字典序在 `2026.10.9.1` 与 `2026.10.10.1` 上会错，日期段必须按数值比）：

- **发布版本**：`YYYY.MM.DD.N`（年 4 位、月/日 2 位零填充、`N` ≥ 1 整数），由发布流水线/ tag 通过 `--content-version` 显式给出。只有这个形状用于更新比较；
- **本地派生版本**：`0.0.0-dev+<内容 sha256 前 12 位十六进制>`，未给 `--content-version` 时自动派生。同一份内容重复编译得到**同一个字符串**（不会“变化无常”），但它**永不发布**；
- **比较**：release 与 release 按 `[年,月,日,N]` 数值逐段比较；dev 与 dev 按十六进制串比较；dev < 任意 release（core `0.0.0` 最小）；
- **单调性强制**：给出显式 release 版本时，如果知道「上一版」（`--previous-version`，默认读已有产物里的值），要求新版本 **严格大于** 上一版，否则 `VERSION_NOT_MONOTONIC` 非零退出。dev 版本不做单调检查（它只用于本地/测试）；
- **内容摘要口径**：对 `{formatVersion, dynasties, poems}` 的规范 JSON 求 sha256，**不含** `generatedAt`/`contentVersion`；
- `generatedAt`：UTC 秒精度（`2026-10-14T12:00:00Z`），可用环境变量 `SOURCE_DATE_EPOCH` 固定以复现构建。

为什么“单调递增”必须来自显式输入：从内容本身派生（哈希、最大日期）无法保证「改了内容版本一定变大」；能保证单调的只有“人来定这个数”，所以把它做成流水线的显式参数 + 编译器强制检查。

## 5. 编译实现与命令（契约线 C，2026-10-14）

实现只依赖 Node 内置模块；JSON Schema 校验单独用项目本地 devDependency（`ajv@8`，`npm install` 装到本工程 `node_modules`，不装全局）。

| 文件 | 作用 |
|---|---|
| `schema/content.schema.json` | `dist/content.json` 的 JSON Schema（第 2 节结构的机器可校验形式） |
| `tools/build-content.mjs` | 编译器 CLI |
| `tools/lib/interface.mjs` | **接口唯一定义处**：产物键序/字段集、front matter 字段集、id 正则、路径与 CLI 默认值、退出码、排序策略 |
| `tools/lib/frontmatter.mjs` | front matter 最小子集解析器（无依赖） |
| `tools/lib/dynasties.mjs` | 朝代分组注册表 |
| `tools/lib/content-build.mjs` | 校验、分段、排序、组装产物（纯函数） |
| `tools/lib/version.mjs` | `contentVersion` 产生/比较/单调检查 |
| `tools/validate-content.mjs` | 用 schema 校验产物（开发期检查） |
| `tests/` | 单元测试 + CLI 端到端测试 + fixture |

命令：

```bash
node tools/build-content.mjs --check                  # 只校验（默认读 content/poems/*.md）
node tools/build-content.mjs                          # 产出 dist/content.json
node tools/build-content.mjs --check --content tests/fixtures/ok-sorting/content
node tools/build-content.mjs --out dist/content.json --content-version 2026.10.14.1 \
     --previous-version 2026.10.13.1 --order source
node tools/validate-content.mjs dist/content.json     # schema 校验
node --test                                            # 全部测试
```

产物为 2 空格缩进 JSON（便于评审与 diff），`--minify` 可得单行；`dist/` 被 `.gitignore` 忽略，**产物不进仓库**。

接口一致性由 `tests/interface.test.mjs` 守住：它比对 `tools/lib/interface.mjs` 与 `schema/content.schema.json` 的键集/键序/正则，任一侧漂移就测试失败。
