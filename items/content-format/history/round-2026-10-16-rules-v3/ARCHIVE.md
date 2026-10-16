# 归档轮次：rules-v3 —— MD → 顶层 JSON 样例对＋规则稿，以及中文路径 ID 收口稿

> 材料已**整轮**搬入本目录（2026-10-16，负责人）。原路径 `items/content-format/prototypes/rules-v3/` 不再存在。
> ⚠ 本目录是**材料**，不是实施授权、也不是规则本身；规则的实施在 `tools/`／`schema/`，采纳锚见 `docs/status.md`。

## 这一轮回答过什么

1. **MD → 顶层 JSON 的样例对＋规则稿**：把用户 2026-10-15 已确认的 4 条规则写成规范语句（`rules-v3.md`），配一份**完整（不省略）**的样例对（`samples/` ↔ `json/`），并对未逐项批准的细则给出**单一建议＋理由**（`unapproved-details.md`）。
2. **中文路径 ID 收口稿**（用户 2026-10-16 审阅通过）：ID ＝ 相对内容根的完整相对路径、去 `.md`、`/` 统一写成 `-`；`id-final.md` 是收口稿，`id-migration.md`／`id-and-naming-v2.md` 是迁移与命名的过程稿。
3. **源字段 vs 产物派生字段**（`source-vs-derived.md`）：把「源里作者写的值」与「编译期查表/规范化得到的值」分开（例如 `dynasty` 在 v1 里从不进产物）。
4. **目录组织与判重**：`manifest/19-changes.json`（19 首的层级与改名清单）＋ `name-tree-*`／`fixtures*` 几组夹具。

## 用户的选择（**采纳锚**，2026-10-16）

- **C2 路径 ID**：ID ＝ **相对内容根的完整相对路径**、去 `.md`、`/` 写成 `-`（例 `古诗十九首/行行重行行.md` ⇒ `古诗十九首-行行重行行`）。
- **直接换、不做兼容**：不做 `legacyId`、不做映射表、不做重定向 ⇒ **接受旧 ASCII 深链接失效**（用户明确接受）。⇒ 材料里并列的「双 ID 期」与「Web 构建期静态映射」**已被否决**，只作历史候选。
- **目录层级任意**：允许根直接文件／一层／多层，不强制按朝代或作者分组、不设固定深度；**目录纯整理**（分组与组内次序仍由 `dynasty` ＋ 顶层有序朝代数组 ＋ `orderInSource` 决定）。
- **生成后全库判重**：路径拼接后的 `-` 与文件名里原有的 `-` 碰撞 ⇒ **报错并列路径**，不静默覆盖。
- **19 首的具体层级与清单**：`古诗十九首/<诗题>.md`，目标 ID ＝ `古诗十九首-<诗题>`（`manifest/19-changes.json`，已随本稿审阅通过）。

## 未采纳 / 未决（**别当成已批准**）

- 旧的双 ID 期、Web 静态映射表：**已否决**（见上）。
- 未逐项批准的细则（未知节／重复节／围栏里的 `##`／空节／最小 Markdown 范围）在本轮只给**建议**；它们**另由 rules-v4 收口**（见 `../round-2026-10-16-rules-v4/`）。
- 本轮的 MD 样例不是发布产物：`json/*.json` 是样例。

## 契约迁址（2026-10-16，`1a84e86`）—— 归档前先做的前置动作

本目录有两份文件**曾被运行期脚本当输入读**；归档前已把**权威副本**迁到稳定位置（**复制**，本目录原稿保留为历史快照、不再是测试输入）：

| 原路径（本目录内，历史快照） | 稳定副本（现被脚本读） |
|---|---|
| `manifest/19-changes.json` | `content/migration/19-changes.json` |
| `samples/real-01-full.md` | `tests/fixtures/contract/real-01-full.md` |

两份都经 sha256 确认**逐字节相同**。消费方 `content/migration/migrate-19-to-v2.mjs`／`verify-19-to-v2.mjs` 与归档轮的 `check-detail.mjs` 已同步改读稳定副本（**没有**把历史原稿改写成新规格）。

## 复跑（归档后仍可复跑）

```bash
node items/content-format/history/round-2026-10-16-rules-v3/demo.mjs
node items/content-format/history/round-2026-10-16-rules-v3/demo-id-v2.mjs
node items/content-format/history/round-2026-10-16-rules-v3/demo-id-final.mjs
```

脚本按**自身目录**解析夹具、并**向上查找仓库根**（`ROOT_MARKER`）⇒ 整轮搬动后仍可跑。
