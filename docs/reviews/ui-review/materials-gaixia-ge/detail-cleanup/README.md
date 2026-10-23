# 《垓下歌》`detail` 去脚手架后的预览实拍（contentVersion `2026.10.23.2`）

- 工作树：`C:\Users\wsqsy\Documents\android\.sopho-wt\content-detail-1-detail-inta-a3f656ad`（分支 `wt/content-detail-1-detail-inta-a3f656ad`），内容提交 `ae50114`。
- 预览：`node web/scripts/serve.mjs --port 8178 --root web`（新起点，**未动 8177**），`GET /content.json` sha256 = `5d505b6a353dc6afd24bb1dde36e75b29bd9ac7239fa7410fd6c8087e2961671`（与 `dist/content.json` 同字节）。
- 图由无头 Chromium 抓本机预览页（430px 宽视口），**不是**发布产物，也不是真机观感。

| 图 | 看的是什么 |
|---|---|
| `web-detail-2026.10.23.2.png` | `#/p/项羽-垓下歌/detail`：题名／体裁／时代归属／异文。已无「注册表只有…」「本次未新增分组」「按终止符分行」等维护口径；体裁写「本库以『楚歌』标注（…本库的体裁取值）」；柰/奈 写「本库依所选底本作『柰』…不据此作版本定论」。 |
| `web-poem-2026.10.23.2.png` | 诗页：正文仍是 2 行、身份行「项羽 · 汉 · 楚歌」、无笔记入口（正文与 `genre` 值**未改**）。 |
| `web-index-2026.10.23.2.png` | 目录：汉 [20] / 唐 [4] / 近现代 [6]**未变**。 |

未核（本轮不做）：任何影像／印本目验、版本学定论、Android 端与真机观感、离线与更新流程。
