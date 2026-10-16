# 归档轮次：rules-v4 —— 内容格式的**语法/细则**可审样例

> 材料已**整轮**搬入本目录（2026-10-16，负责人）。原路径 `items/content-format/prototypes/rules-v4/` 不再存在。
> ⚠ 本目录是**材料**（样例、建议、演示），不是实施授权；规则的实施在 `tools/`／`schema/`，采纳锚见 `docs/status.md`「规则采用（rules-v4）」。

## 这一轮回答过什么

上一轮 `../round-2026-10-16-rules-v3/` 已定下 ID／命名／迁移。本稿只补**语法与细则**层面：

- **合法 MD 怎么写 → 两端预期效果**（`legal-sample-and-effects.md`、`md-subset.md`、`sections.md`、`dynasty-groups.md`）；
- **写错会怎样 → 诊断怎么说**（`fixtures-invalid/` 12 份故意非法夹具 ＋ `demo.mjs` 的逐条诊断）；
- 四件**未逐项批准**的细则给出**明确单一建议＋理由**：未知节／重复节／围栏里的 `##`／空节；
- **朝代组名校验**；
- **机器可读预期** `expectations.json`（每个块／每样语法／每样被排除的语法 → 两端预期效果）。

## 用户的选择（**采纳锚**，2026-10-16）

- **Markdown 闭集＝8 样**：段落／段内换行／`- ` 无序／`1. ` 有序／`**粗体**`／`*斜体*`／`### `／`> `。
- **未知节 ⇒ 报错**；**重复节 ⇒ 报错**；**空节 ⇒ 视为缺失 ⇒ `null` 且保留键**；**朝代组名 ⇒ 精确匹配**（不做别名）。
- **闭集之外**（链接·图片·表格·行内代码·代码围栏·`#`／`####`·任务列表·脚注·行首 HTML·`* `）**本版不支持 ⇒ 越界诊断**。
- **围栏里的 `##` 不误切 ＝ 解析健壮性**（先跟踪围栏），**不扩成新的支持能力**（围栏仍然报错）。

## 由负责人落定的三条（不再让用户微选）

1. **未闭合强调**（落单 `**`／`*`）⇒ **报错**（`MD_EMPHASIS_UNCLOSED`，落在该行）。
2. **诊断码沿用 rules-v4 的命名**并**进契约码表**（`docs/design/content-contract.md` §3.1）；每条诊断必须带「文件:行号 ＋ 码 ＋ 中文说明 ＋ 建议动作」。
3. **符号边界**：**视觉折行规则**（另见 `items/app-ui/history/round-2026-10-16-break-semantic/`）与**本次 Markdown 闭集是两件事**，互不替代。

## 契约迁址（2026-10-16，`1a84e86`）—— 归档前先做的前置动作

本目录有三份文件**曾被运行期测试当输入读**（Android `MarkdownTest`／`ContentParserTest`／`PoemDetailContentTest`）；归档前已把**权威副本**迁到稳定位置（**复制**，本目录原稿保留为历史快照、不再是测试输入）：

| 原路径（本目录内，历史快照） | 稳定副本（现被测试读） |
|---|---|
| `expectations.json` 的 `constructs` | `schema/markdown-subset.json`（**跨端唯一的机器可读范围定义**；契约 §1.0 已加指针） |
| `json/md-subset-legal-fixture.json` | `tests/fixtures/contract/md-subset-legal.json` |
| `json/real-01-full.json` | `tests/fixtures/contract/real-01-full.json` |

三份都经 sha256 确认**逐字节相同**。Android 侧已改读稳定位置。

## 未采纳 / 未决

- 闭集之外的一切写法**本版不支持**（出现即越界诊断）。
- 本稿的 `json/*.json` 是**样例**，**不是**正式 `dist/content.json`。

## 复跑（归档后仍可复跑）

```bash
node items/content-format/history/round-2026-10-16-rules-v4/demo.mjs
```

脚本按**自身目录**解析夹具、并**向上查找仓库根** ⇒ 整轮搬动后仍可跑；输出见 `demo-output.txt`。
