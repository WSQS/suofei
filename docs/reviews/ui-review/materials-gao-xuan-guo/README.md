# Web 端取证：李贺《高轩过》入库后（内容版本 `2026.10.20.2`，**测试号、非发布**）

- 工作线：工作树 `.sopho-wt/1-216-218-source-url-detail--dd32efd3`（分支 `wt/1-216-218-source-url-detail--dd32efd3`）
- 日期：**2026-10-21**
- 基座内容：**`web/content.json`**（本工作树构建的同一份字节）
  - `contentVersion` = `2026.10.20.2`（**本地测试号，非发布**）
  - `sha256` = `cd22f583183f255cc1c863cf440cda5811ed231d495dc9b0e78908d6211ac609`（`dist` / APK 内置 / `web/content.json` **三份同 sha**）
- 预览 origin（**新起，不是 8471/8664**）：`http://127.0.0.1:8791/`，`--root` = 本工作树的 `web/`，`node web/scripts/serve.mjs --port 8791`
- 手法：无头 Chromium（本机用 **`msedge.exe`**）＋ CDP，零第三方依赖；脚本 [`web-gao-xuan-guo.mjs`](web-gao-xuan-guo.mjs)；
  结果 **36 / 36 PASS，EXIT 0**（逐条见 [`web-gao-xuan-guo.log`](web-gao-xuan-guo.log) 与 [`dom-dumps.txt`](dom-dumps.txt)）。

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
# 1) 预览（本机已在 8791 上跑着；若已退出，重开同一端口）
node web/scripts/serve.mjs --port 8791 --root "$PWD/web"
# 2) 取证
CHROME_BIN="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
PREVIEW_BASE="http://127.0.0.1:8791/" node docs/reviews/ui-review/materials-gao-xuan-guo/web-gao-xuan-guo.mjs
```

## 已知、且**本次未改**的呈现事实

- 详情页的「底本与来源」是**纯文本**渲染（`web/app/render.js` 用 `text:`），所以 `source:` 里的 `**` 会**原样显示成星号**。
  这不是本次引入的：`望岳`／两首《梦李白》等既有来源同样带 `**`、同样这样显示。**新诗沿用既有写法**，未单独改成无星号版本；
  若要统一去掉，是一次**动 29 首 `source`** 的内容决定，另开。
