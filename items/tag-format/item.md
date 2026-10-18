# 项：标签的 MD 标注写法 ＋ JSON 数据稿（候选 · 待审）

> 父项：[`content-tags`](../content-tags/item.md)；语义与反例见 [`tag-semantics`](../tag-semantics/item.md)。
> **本期只出候选**：不改 `schema/`、不改 `content/`、不改两端、不升 `formatVersion`、不发布。

## 要交付什么（一个 worker 同交付三层对照）

1. **第一层：现有真实诗**（取现库一首真诗，如《行行重行行》或《梦李白二首·其一》），展示它现在的**完整产物**（字段、`source`、`orderInSource`、由路径派生的 `id`）。
2. **第二层：候选 frontmatter 写法**（源 `.md` 里怎么标标签）——**至少两种**候选（例如 `tags:` 列表 vs 单独一节），对比**可读性/与既有 frontmatter 的相容性/改名的代价**。
3. **第三层：完整 JSON**（编译产物形状）：**归属怎么落**（诗上的标签 / 或全局标签表 + 引用 / 或两者）、**标签的稳定 ID 与显示名**、**选本内次序**怎么表达（与 `orderInSource` **分开**）、**无标签/多标签/同名不同选本** 各长什么样。

## 必须分清（不许混）

- 标签 ≠ `source`（底本/出处）≠ `orderInSource`（底本次序）≠ 路径派生 **ID** ≠ 朝代 `dynasty`；
- **不许为不同标签复制作品**；**朝代分组必须保持可用**（现有目录行为不能被破坏）；
- 若需要新字段 ⇒ **写候选并注明「将来按已选方案 B 升 `formatVersion`」**，**本期不动正式 schema/内容**。

## 交付物落点

- `items/tag-format/prototypes/`：① 三层对照（`q-tag-format.md` 或 `.html`，逐层贴片段）② **完整 JSON 例子**（`tag-data-draft.json`，可直接被人读）③ 一张「字段 → 语义 → 反例」的对照表。
- 回答：**这份候选能表达 §2 的哪几条例子、哪几条表达不了**；未表达清单；对 `formatVersion` 的影响**只是候选结论**。
