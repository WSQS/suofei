# Web 端取证：三首杜甫诗 `orderInSource` 改为 1/2/3 后，**两个视图的三行次序**（2026-10-19）

> 本目录是**演练/取证材料**，不是规格、不进 CI。口径与底本事实见
> [`../../sources/wangyue-intake.md`](../../sources/wangyue-intake.md) **§6.5**；
> Android 侧同一次改动的设备帧在 [`../../device-acceptance/wangyue-order/`](../../device-acceptance/wangyue-order/README.md)。

## 为什么还要这一份

仓库既有 `web/tests/e2e-cdp.mjs`（本轮 **567 / 567 通过，exit 0**）覆盖了更广的行为面，但它的断言分布在整轮
流程里，**没有一处**把「朝代页『唐』组三行」与「标签页『唐诗三百首』三行」**并排**取出来做对照。
本次改动的**唯一目的**就是让这两处一致，所以单独取一次证：

- `web-two-views.mjs`：起 `web/scripts/serve.mjs` 托管 `web/`（基座 = `web/content.json`，
  与 `dist/content.json`、APK 内置 assets **同一份字节**，见下表），跑无头 Chromium ＋ CDP，
  按用户可见的路径**点** tab／组头，然后把两个视图的行**读出来**逐项比。

## 怎么复跑

```sh
CHROME_BIN='C:/Users/wsqsy/AppData/Local/Chromium/Application/chrome.exe' \
  node docs/reviews/ui-review/materials-wangyue-order/web-two-views.mjs
```

产物写回本目录（覆盖同名文件）：`01-dynasty-tang-expanded.png`（朝代页 3 组全展开）、
`02-dynasty-tang-rows.png`（「唐」组滚到视口顶）、`03-tags-tang300-3-rows.png`（标签页两组都展开）、
`dom-dumps.txt`（两屏 `innerText`）、`web-two-views.log`（逐条 PASS/FAIL）。

## 结果：**14 / 14 通过，exit 0**

| 断言 | 实测 |
|---|---|
| 组序仍是 汉／唐／近现代 | `["汉","唐","近现代"]` |
| 组头计数 | `["19 首","3 首","1 首"]` |
| **【朝代页】「唐」组** | `["望岳","梦李白二首·其一","梦李白二首·其二"]` |
| 【朝代页】「唐」组 id 同序 | `["杜甫-望岳","杜甫-梦李白二首·其一","杜甫-梦李白二首·其二"]` |
| 【朝代页】「唐」组作者行 | `["杜甫","杜甫","杜甫"]` |
| 【朝代页】「汉」19 首**逐首**未变 | 行行重行行 … 明月何皎皎（19 项与产物逐项相等） |
| 【朝代页】「近现代」1 首未变 | `["七律·和郭沫若同志"]` |
| 目录总诗数 | `23` |
| 标签组序仍是 古诗十九首 → 唐诗三百首 | `["古诗十九首","唐诗三百首"]` |
| **【标签页】「唐诗三百首」** | `["望岳","梦李白二首·其一","梦李白二首·其二"]` |
| 【标签页】同上三行 id 同序 | `["杜甫-望岳","杜甫-梦李白二首·其一","杜甫-梦李白二首·其二"]` |
| **两视图三行次序完全一致** | `["望岳","梦李白二首·其一","梦李白二首·其二"]` == 同 |
| 无未捕获异常 / JS error | `[]` |

⚠ **期望值不是手抄的**：脚本直接读 `web/content.json` 里 `poems[]`（按 `dynasty` 过滤）当作期望，
再与 DOM 渲染出来的行相比 —— 所以它钉的是「**客户端渲染 == 产物次序**」，不是「我以为应该是这样」。

## 本次构建的三份同一字节

| 路径 | sha256 |
|---|---|
| `dist/content.json` | `8fae0954af16c104f6e5cd20c89c74df575908833d32b7e374f0dad9601b7683` |
| `android/app/src/main/assets/content/content.json` | 同上 |
| `web/content.json`（gitignore 的本地产物） | 同上 |

`formatVersion=3` / **`contentVersion=2026.10.19.2`（本地测试号，非发布）** / 23 首 / 2 标签。
单调性检查：`2026.10.19.1 → 2026.10.19.2` 通过。

## 没验的（如实写）

| # | 没验的事 | 说明 |
|---|---|---|
| 1 | **线上站点** | 本轮只本地构建与本地托管。线上仍是 `0.1.4 + 2026.10.18.3`，**未推、未 tag、未发布**。 |
| 2 | 真机/浏览器差异 | 只在**本机无头 Chromium**、窄屏 420 下看；别的浏览器/字号未验。 |
| 3 | 观感 | 截图能看行序与组头，**不承担**「好看不好看」的结论。 |
