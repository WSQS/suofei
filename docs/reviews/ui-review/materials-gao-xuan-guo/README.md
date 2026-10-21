# Web 端取证：李贺《高轩过》入库后（内容版本 `2026.10.20.3`，**测试号、非发布**）

- 工作线：工作树 `.sopho-wt/1-216-218-source-url-detail--dd32efd3`（分支 `wt/1-216-218-source-url-detail--dd32efd3`）
- 日期：**2026-10-21**
- 基座内容：**`web/content.json`**（本工作树构建的同一份字节）
  - `contentVersion` = `2026.10.20.3`（**本地测试号，非发布**；`.20.2` → `.20.3` 只因本首 `source`/`detail` 文字修偏）
  - `sha256` = `d3aab34710fb01dbdf1c899a9ea07be37d15128ed6427e392007fbd0a2de3079`（`dist` / APK 内置 / `web/content.json` **三份同 sha**）
- 预览 origin（**新起，不是 8471/8664，也不是上一轮 `.20.2` 的 8791**）：`http://127.0.0.1:8823/`，`--root` = 本工作树的 `web/`，`node web/scripts/serve.mjs --port 8823`
- 手法：无头 Chromium（本机用 **`msedge.exe`**）＋ CDP，零第三方依赖；脚本 [`web-gao-xuan-guo.mjs`](web-gao-xuan-guo.mjs)；
  结果 **40 / 40 PASS，EXIT 0**（逐条见 [`web-gao-xuan-guo.log`](web-gao-xuan-guo.log) 与 [`dom-dumps.txt`](dom-dumps.txt)）。
  其中新增的三条断钉住了本轮文字修偏：`source` 整段**没有任何 `*`**、`detail` 不再出现「本内容格式」「字段」「未写入正文」这类工程说明。

## 看过的图（本目录）

| 文件 | 核到的事 |
|---|---|
| `01-dynasty-all-expanded.png` | 组序 汉／唐／近现代；组头计数 **19／4／6**；目录总诗数 **29** |
| `02-dynasty-tang-4-rows.png` | 「唐」组四行：望岳／梦李白其一／梦李白其二／**高轩过（李贺）** —— 李贺无标签但**仍在朝代页** |
| `03-poem-gao-xuan-guo.png` | 诗页：题名「高轩过」、身份行「李贺 · 唐 · 七言古诗」、正文 **7 个印刷行**（含「笔补造化天无功」）、**没有「笔记」入口**、有「详情」入口 |
| `04-detail-gao-xuan-guo.png` | 详情页：底本与来源（卷三百九十三／两个 URL／2026-10-21／未目验影像）、**题下小序（明写本格式无小序字段）**、体裁、4 条异文 |
| `05-back-to-dynasty-state.png` | 详情 →（返回）诗页 →（返回）**朝代 tab 原视图**，「唐」组仍展开 4 行、总诗数仍 29 |
| `06-tags-still-2-groups.png` | 标签页仍 **2 组**：古诗十九首 → 唐诗三百首（高轩过没有标签，不产生第三组） |

标签页里「唐诗三百首」仍 **3 首**、且**不含**高轩过（脚本断言）⇒ **「唐组 ≠ 唐300 子集」**在界面上也成立。

## 重跑

```bash
# 1) 预览（本机已在 8823 上跑着；若已退出，重开同一端口）
node web/scripts/serve.mjs --port 8823 --root "$PWD/web"
# 2) 取证
CHROME_BIN="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
PREVIEW_BASE="http://127.0.0.1:8823/" node docs/reviews/ui-review/materials-gao-xuan-guo/web-gao-xuan-guo.mjs
```

## 已知、且**本次未改**的呈现事实

- 详情页的「底本与来源」是**纯文本**渲染（`web/app/render.js` 用 `text:`）⇒ 该字段里写 Markdown 强调会被**原样显示成星号**。
  **本轮已把本首 `source` 里的 `**` 全部去掉**（`2026.10.20.3`），所以本首不再显示星号；
  但 **旧 28 首的 `source` 未动**，它们里的 `**` 仍会这样显示（这不是本次引入的，也不在本轮改动范围内）。
