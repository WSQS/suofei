# S3 迁移：19 首 v1 平铺 ASCII 源 → v2 中文相对路径布局

> 一次性迁移（2026-10-16，S3）。**内容不变，只搬家与改源格式**。
> 迁移范围：`content/poems/`。清单：`content/migration/19-changes.json`（只读；**稳定副本**——原稿随 `rules-v3` 轮已归档）。

## 1. 两个脚本

| 文件 | 作用 |
|---|---|
| `migrate-19-to-v2.mjs` | 执行迁移：读 v1 源 → 写 v2 源（新路径）→ 删旧文件；落盘前自校验 |
| `verify-19-to-v2.mjs` | **独立**核验（与迁移脚本分开写）：新旧字段/正文逐行/24 条异文进产物 detail |

```bash
# 只预览，不落盘
node content/migration/migrate-19-to-v2.mjs --dry-run
# 真迁移
node content/migration/migrate-19-to-v2.mjs
# 独立核验（--old-ref 指向迁移前的提交；迁移提交落地后必须显式给上一个提交）
node content/migration/verify-19-to-v2.mjs --old-ref HEAD~1
```

## 2. 迁移做了什么（逐条）

- 19 份 `content/poems/gushi-shijiu-shou-NN.md` 移到 `content/poems/古诗十九首/<诗题>.md`；旧文件删除。
- `id` 从源里删掉（丢给路径派生：`古诗十九首/<诗题>.md` ⇒ `古诗十九首-<诗题>`）。
- `dynastyOrder` 删掉（组序改由注册表/顶层 `dynasties` 决定）。
- `variants` 删掉，**整段**搬进 `## 详情` 的 `### 异文` 列表：每条 `- **<text>** —— <note>`。
- `title/author/dynasty/genre/orderInSource/source` **原行原值**保留（不重新序列化，引号与空白不动）。
- 正文（诗行与空行）**逐行原样**保留；空行＝分段，未改一处。

## 3. 幂等 / 可复跑 / 失败行为

- 旧文件已删、新文件已在 ⇒ 该首跳过并计 `alreadyDone`，**不读不写**（再跑一次输出 `已完成 19 首`，改动为零）。
- 旧、新**同时存在**，或**两个都不存在** ⇒ 报错退出，**不静默覆盖**。
- 任何一首自校验不过 ⇒ 全体不落盘（先在内存里算好全部 19 首）。
- 回滚：`git revert` 迁移提交即可（旧文件在 Git 里，没有额外状态）。

## 4. 没迁（列进交付报告，等裁决，**不偷偷塞进别处**）

- `era`（19 首全是「东汉末」）：用户 2026-10-15 已定不设该字段、也不自动塞进详情 ⇒ **直接丢弃**。
- `分段依据`：不在 v1 源里（v1 源只有 `variants`），本次未生造。真实 19 首在底本里通篇连排、
  篇内无空行（`docs/sources/gushi-shijiu-shou.md` 第 93 行），分段依据是否补、怎么补由负责人定。
