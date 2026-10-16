# 归档轮次：A 路线整合字段稿 v2（round-2026-10-15-a-route-v2）

> 本轮材料（27 个文件）已整轮搬入本目录。**它作为「字段方案」的并列陈述已被取代**：用户 2026-10-15 又确认 4 条规则（见下）⇒ 后继轮 `items/content-format/prototypes/rules-v3/` 出**完整 MD→顶层 JSON 样例 ＋ 规则稿**，**不再并列旧选择**。

## 这一轮回答过什么

- 落实用户当时三条选择：每首只留一个**中文** `dynasty`／删 `era`／保 `genre`＋`stanzas`；
- `fields.md`：草案键序 `id,title,author,dynasty,genre,source,orderInSource,detail,stanzas,notes`；
- `md-json.md`／`samples/`／`json/`：MD↔JSON 对照与缺省样例；
- `source-vs-derived.md`：**源字段 vs 产物派生字段**（v1 里作者写的 `dynasty` 从不进产物 ⇒ 新规则下它是透传还是规范化快照，当时列为未定）；
- `top-level-dynasties.md`＋`top-level-candidates/`：顶层 `dynasties`／组序 **4 案并列**（**已被用户规则①取代**：产物带头有序中文朝代数组、客户端照序、不从 `poems` 首次出现推断）；
- `era-removal.md`：删 `era` 原值处置 4 案（**属未再确认项**）；
- `undecided.md`：当时列的未定项（**其中 `source` 留否、`detail` 名、`null` 语义已被用户规则③与「字段没问题」认可取代**）；
- `demo.mjs`／`demo-output.txt`：负责人复跑过三条路径 —— 正常 **EXIT 0**／歧义详情夹具 **EXIT 1**／旧键残留在源里 **EXIT 1**。

## 取代它的用户确认（2026-10-15，4 条）

1. 顶层**有序朝代列表**（中文数组）；客户端照序；**不从 `poems` 首次出现推断**。
2. **ID 由文件名生成**（去 `.md`）；**MD 不再手填 `id`**。
3. `notes`／`detail` **缺失可 `null`（保留键）**；界面不显示 `null`；**无笔记隐藏规则照旧**。
4. **固定分界**：前元数据、后原文；`## 详情`／`## 笔记` 为节；**缺节可不写**。

## 仍未确认（别当成已定）

- 未知节／重复节／**围栏里的 `##`**／**空节** 的正式处理，以及**支持的 Markdown 渲染范围**（`rules-v3` 轮会给**清楚建议**，等用户回话）；
- 删 `era` 原值的处置；
- 任何实施动作（迁移 19 首、改编译器/schema、升 `formatVersion`、发布）。

## 复跑（归档后仍可复跑）

```bash
node items/content-format/history/round-2026-10-15-a-route-v2/demo.mjs
node items/content-format/history/round-2026-10-15-a-route-v2/demo.mjs --parse items/content-format/history/round-2026-10-15-a-route-v2/fixtures-ambiguous/ambiguous-detail.md
```

- 脚本按自身所在目录解析样例，**仓库根靠向上查找 `prototype/css/theme-tech.css`**（不写死层级）；**只读本目录、不写任何东西**。
