# 测试 fixture（不是内容，不要发布）

这里的 Markdown **只服务于自动化测试**，不是 `content/poems/` 的真实内容，也不要被当成
用户笔记或已核底本。凡引用真实诗题的 fixture，`source` 字段都明确写了「测试 fixture」，
正文是占位行。

> ⚠ **2026-10-16 起 fixture 是 `formatVersion=2` 源格式**：`id` 不写（由相对路径派生）、单一中文
> `dynasty`、考据进 `## 详情`、笔记进 `## 笔记`。**2026-10-18 起（`formatVersion=3`）多一个可选
> `tags`（`{id, orderInTag}`）**——不写就是 `tags: []`。旧格式的四个 dir（`fail-id-mismatch`、
> `fail-id-duplicate`、`fail-dynasty-order-not-integer`、`fail-variant-invalid`、
> `fail-stanzas-all-empty`）已删：它们在 v2 下**不再非法**（`id`/`dynastyOrder`/`variants` 三个键整个
> 被去掉，`STANZAS_ALL_EMPTY` 并入 `BODY_EMPTY`）。删掉的非法形状改由下面两组覆盖。
>
> ⚠ **2026-10-19 起 `orderInSource` 是必填正整数**（用户拍板 B：**同一朝代内唯一**、跨朝代各自从 1 起、
> **允许留空号**；缺/`null` ⇒ `ORDER_IN_SOURCE_REQUIRED`，非正整数 ⇒ `ORDER_IN_SOURCE_NOT_INTEGER`，
> 同朝代同序 ⇒ `ORDER_IN_SOURCE_DUP`）。所以下面每个 fixture 都写了 `orderInSource`——**那些数字全部是
> 夹具测试值**（文件里用 `#` 注释标明），不是真实底本次序，不得引用。

## 通用（编译器自身的用例）

- `ok-basic`：最小合法文件（必填键齐全，不含两个节）。
- `ok-sorting`：组序（顶层 `dynasties` 有序中文数组）、组内 `orderInSource` 升序、空行分段保留。
  ⚠ 2026-10-19（拍板 B）后**组内次序不再由作者/诗名拼音决定**：夹具里的 汉 1/2/3、唐 1/2/3/4 就是次序本身。
- `ok-order-source`：`orderInSource`（底本原次序）与 `--order source|pinyin` 两种策略的对比（**每首都带值**）。
- `ok-order-dynasty`：**B 口径的正面证据**：朝代组序 → `orderInSource` 升序；汉组 1/5/9（**故意留空号**）、
  唐组 1/2/3（**又从 1 起**）；杜甫（序号 3）排在最后——若按作者拼音他会排第一（反证）。
- `ok-notes-variants`：`## 笔记` 进 `notes`（保留换行）、`## 详情` 进 `detail`、缺省键写 `null`。
- `ok-shi19-order`：19 首真实诗题 ＋《文选》卷二十九原次序（排序策略的固化证据）。
- `shape-v2`：旧字段集形状夹具（列全 10 键、无标签）；保留作无标签内容的输入。
- `shape-v3`：**当前字段集形状夹具**（列全 11 键，且**至少一首带标签**——否则 `tags[].id`／
  `tags[].members` 这几条路径会因空数组而不出现；`tools/check-fieldset.mjs` 默认编译它）。
- `tags-ok`：**多标签/多组**合法夹具（一首诗两个标签、同一标签多首诗、标签之间按拼音古<宋<唐、
  members 按 `orderInTag`）。⚠ 里面的 `orderInTag`（2/9 等）全是**测试样例**，**不得**当作任何选本的编次引用。
- `tags-order-required`：缺 `orderInTag` ⇒ `TAG_ORDER_REQUIRED`（非零退出）。
- `tags-order-dup`：同一标签内两首诗同一个 `orderInTag` ⇒ `TAG_ORDER_DUP`（非零退出，不用 id 兜底）。
- `fail-empty-body` / `fail-missing-key` / `fail-unknown-key` / `fail-unknown-dynasty` /
  `fail-order-not-integer`（`"第一"`/`0`/`-1`/`1.5` 四首）：单条校验失败用例。
- `fail-order-required`：缺 `orderInSource` ⇒ `ORDER_IN_SOURCE_REQUIRED`（必填、不可省略）。
- `fail-order-null`：`orderInSource: null` ⇒ `ORDER_IN_SOURCE_REQUIRED`（不可 null）。
- `fail-order-dup`：同一朝代内两首（**不同作者**）同一个号 ⇒ `ORDER_IN_SOURCE_DUP`，诊断列出全部
  冲突的诗 id 与源路径；同目录里那首号不冲突的诗**不得**出现在冲突名单里。
- `fail-non-markdown`：内容根里的非 `.md` 文件 ⇒ `SOURCE_NOT_MARKDOWN`。
- `ignored-files`：`README.md`／`_` 前缀／隐藏／临时文件 ⇒ **忽略并计数**（不是错误）。
- `dash-collision`：两个不同路径（`古诗十九首/行行重行行.md` 与 `古诗十九首-行行重行行.md`）
  算出同一个 id ⇒ **判重必红**（`ID_DUPLICATE`，列出冲突路径）。

## rules-v4（用户 2026-10-16 已通过的语法/细则）

- `rules-v4-legal/`：**5 份合法样例**（复制自 `items/content-format/history/round-2026-10-16-rules-v4/` —— 该原型轮**已归档**，2026-10-16），
  逐条对应 `node tools/build-content.mjs --check` **EXIT 0**。
- `rules-v4-invalid/`：**12 份故意非法夹具**（同一来源），每份一个目录（`content/poems/<名字>.md`）；
  逐条诊断的**码 + 行号 + 文案**账本在 `rules-v4-invalid/expected-diagnostics.json`，
  由 `tests/rules-v4.test.mjs` 钉住。
- 为什么是**复制**而不是直接引用原型目录：原型材料完成使命后会被归档（`items/**/history/**`），
  测试不能依赖一个会移动的路径。
