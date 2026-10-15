# 归档轮次：A 路线整合待审稿（round-2026-10-15-a-route-draft）

> 本目录 = 该轮的**材料本身**（原样保留，含它自己的 `README.md`）＋**本归档记录**。
> 依据**用户常设要求**：一轮用完后整轮搬入 `history/<round-id>/`；本轮的**后继**是 `items/content-format/prototypes/a-route-v2/`（体现用户 2026-10-15 的字段选择）。

## 这一轮回答什么问题

把用户已选的 **A 路线**（① 每首 MD 单文件自足、不做集合上提 ② 详情留在正文、编译后**整节保留为 Markdown 文本**、不重新提取）落成**可审的材料**：

- `fields.md`：**逐字段对照**（A 路线 canonical 键序：`id,title,author,dynastyKey,dynastyLabel,dynastyOrder,era,genre,source,orderInSource,detail,stanzas,notes`；每字段的**来源**与**页面用途**）
- `undecided.md`：**未定清单**（两案并列、不排推荐）
- `ambiguity.md` ／ `fixtures-ambiguous/`：**歧义与最小 Markdown**（含故意有歧义的夹具）
- `samples/`（含缺省三态）＋ `samples-alt/`（`source` 两案、`id` 候选）＋ `json/`（4 份产物样例）＋ `demo.mjs`／`demo-output.txt`

## 来源提交链

- `47be87f`（首版：17 个新文件、1191 行，全部新增、未改既有文件）
- 负责人读回时**亲自复跑**：`demo.mjs` ⇒ **EXIT=0**；`--parse fixtures-ambiguous/ambiguous-detail.md` ⇒ **EXIT=1**（真的"响"，不静默）

## 用户从这一轮得出/延伸的选择（**采纳锚**）

| 时间 | 选择 |
|---|---|
| 2026-10-15（早先） | **A 路线**：单文件自足＋详情留正文整节保留为 Markdown 文本 |
| 2026-10-15（本轮之后） | ① **每首只保留 `dynasty` 字段、用中文表示朝代**（不再每首发 `dynastyKey`/`dynastyLabel`/`dynastyOrder` 三份；MD 也不必写 `dynastyOrder`）② **`era` 可以去掉**；**`genre` 与 `stanzas` 保留** |

⚠ **没有被这些选择解决的**（明确继承到下一稿，别当成已审）：逐首手填的 `id` 归谁产生／`source` 留元数据还是归详情／`detail` 字段名／`detail` 的 `null` vs 缺键语义／`## 详情` 分界／围栏里的 `##`／重复与未知节／**最小 Markdown 渲染范围**（Web 要扩子集、Android 要从零新增渲染能力）／何时升 `formatVersion`。
⚠ **也没被解决**：顶层 `dynasties` 是否保留、怎么存；朝代**组序**注册表的内部结构（⇒ 下一稿按「**工具派生 vs 正式产物**」并列方案，不自行定）。
⚠ **不要误读**：中文 `dynasty` **不等于**取消**朝代组序**或 `orderInSource`（组内次序的权威仍是 `orderInSource`）。

## 后继

- `items/content-format/prototypes/a-route-v2/`：体现上述选择的**字段稿／MD↔JSON 对照**＋「源字段 vs 产物派生字段」的解释＋顶层 `dynasties` 与注册表的方案并列＋删 `era` 的**迁移建议**（不自动迁）。

## 复跑（归档后仍可复跑）

```bash
node items/content-format/history/round-2026-10-15-a-route-draft/demo.mjs
node items/content-format/history/round-2026-10-15-a-route-draft/demo.mjs --parse items/content-format/history/round-2026-10-15-a-route-draft/fixtures-ambiguous/ambiguous-detail.md
```

- 脚本按**自身所在目录**解析 `samples/` ⇒ 整轮搬迁后路径仍有效（**搬迁后已实跑复核**）。
- ⚠ 它**只读**本目录下的样例，**绝不**读 `content/`、**不写任何东西**；它是**演示，不是编译器**。
