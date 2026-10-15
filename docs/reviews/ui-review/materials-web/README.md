# Web 端逐屏评审 · 实拍材料

> 给用户逐格过账用的图。清单在 [`../../ui-review-checklist.md`](../../ui-review-checklist.md)。
> **本目录由调度侧的一条子会话产出**（写入范围仅此目录：图、抓图脚本、本 README）。
>
> ⚠ **历史材料（2026-10-15）**：本目录里与**搜索**有关的图（`c-search-empty/results/none.png`）以及清单 C1/C2/C4 三格，记录的是**当天那一刻的状态**。用户当天稍后拍板「**第一版不做搜索**」，两端实现将在下一版移除 ⇒ **这部分是历史记录，不是现状**；别再拿它当"我们应该有搜索"的依据。

## 0. 一句话：这些图是从哪跑出来的

**真实运行 + 真实内容**，在本机无头 Chromium 上跑本地静态服务拍下来的：

| 项 | 值（本次抓图当时） |
|---|---|
| 站点（壳） | 本工作树 `web/` 的**当前文件**（`index.html` / `styles.css` / `manifest.json` / `sw.js` / `app/*.js`） |
| 站点资源版本 `APP_VERSION` | **v0.1.1**（`web/app/config.js`；与止损版一致） |
| 内容 | `dist/content.json` —— `node tools/build-content.mjs` 从 `content/poems/` 编出来的**真实产物** |
| 内容的形状 | **1 组（汉）/ 19 首**（`汉` 19 首全在）· `notes` 非空 **0 首**（全部 `null`）· 28218 字节 |
| 内容版本 | `0.0.0-dev+bd271b49068a`（内容 sha256 前 12 位 `c5257ae86c89`，全值见 `capture-manifest.json`） |
| 仓库 HEAD | `68099e5`（`web/index.html` 的 blob hash 前缀 `ac706ed`） |
| 浏览器 | 本机 `%LOCALAPPDATA%\Chromium\Application\chrome.exe`（`--headless=new`），临时全新 profile |
| 语言/页面错误 | 整轮 **0 条**未捕获异常（见 `capture-manifest.json` 的 `pageErrors`） |

**站点是每次临时组装的**：`web/tests/lib/deploy.mjs: makeDeployment()` 把「壳 + 真实内容」写进
`%TEMP%\suofei-ui-review\site-real\`，再用 `web/scripts/serve.mjs` 起服务，**一个字节都不写进仓库的 `web/`**。
`capture.mjs` 每次自己起、自己关服务，端口用系统分配的空闲端口（不写死端口 —— 写死会连到上一轮遗留的服务）。

---

## 1. 怎么重跑

```bash
# ① 全量重拍（约 2–4 分钟；会重建临时部署目录并覆盖本目录里的图 + capture-manifest.json）
node docs/reviews/ui-review/materials-web/capture.mjs

# 指定浏览器（默认已指向本机 Chromium）
CHROME_BIN=/path/to/chrome node docs/reviews/ui-review/materials-web/capture.mjs

# ② 「能亲手点」的本地站点：和拍的是同一套壳 + 同一份内容
node docs/reviews/ui-review/materials-web/serve-local.mjs        # → http://127.0.0.1:8137/
node docs/reviews/ui-review/materials-web/serve-local.mjs --port 8138
```

要点（重跑时会被脚本自己检查，失败会明说原因）：

- `dist/content.json` 不存在时脚本会先跑 `tools/build-content.mjs`；**编译出来的形状不是「1 组 19 首」或带夹具标记时，脚本直接停下不拍**（材料的前提是真实内容）。
- 输出图与台账都落在**本目录**；浏览器 profile 跑完删除，部署目录留在 `%TEMP%\suofei-ui-review\`（脚本会打印路径）—— 两者都不进仓库。
- 台账 `capture-manifest.json` 是**机器可读**的同一批事实：每张图的视口/像素尺寸/字节数/URL/站点与内容版本/DOM 文本摘录/脚本实测数字（含下面 §4 引用的那些）。

### 每张图对应「哪个状态、什么视口、哪些 CDP 操作」

| 图 | 状态与到达方式（都在同一个无头 Chromium 里） | 视口·密度 | 像素 / 体积 |
|---|---|---|---|
| `a-index-desktop-viewport.png` | 新 origin 首次访问 → 等目录渲染 → 等站点缓存里出现 `content.json`（拍到的是**稳定态**，不是「SW 还在装」的中间态） | 1280×860 @2× | 2560×1720 / 116 KB |
| `a-index-desktop.png` | 同上状态；`Page.getLayoutMetrics` 取 `cssContentSize` + `captureBeyondViewport:true` 整页 | 1280 宽 @1× | 1280×1960 / 112 KB |
| `a-index-narrow-viewport.png` | `Emulation.setDeviceMetricsOverride{width:420,height:900}` 后 hash 到 `#/` | 420×900 @2× | 840×1800 / 99 KB |
| `a-index-narrow.png` | 同上；整页 | 420 宽 @1× | 420×2425 / 101 KB |
| `b-poem.png` | hash 到 `#/p/gushi-shijiu-shou-01` | 1280 宽 @1×，整页 | 1280×1337 / 109 KB |
| `b-notes-collapsed.png` | 同上诗页；**元素裁剪** `[data-test="notes-section"]`（pad 28px） | 1280×860 @2× | 1352×280 / 14 KB |
| `b-poem-foot-source.png` | 同上诗页；元素裁剪 `[data-test="source-block"]` | 1280×860 @2× | 1352×278 / 45 KB |
| `_raw-b-deeplink.png` → `b-deeplink.png` | 先 `Page.navigate(about:blank)`，再**新开**到 `<origin>/#/p/gushi-shijiu-shou-01`（避开「同文档改 hash」） | 1280×860 @2× | 2560×1720 / 187 KB（合成图 2664×2316 / 362 KB） |
| `c-search-empty.png` | hash 到 `#/`；对 `[data-test="search-input"]` 派发 `input` 事件（值 `''`） | 1280×860 @2× | 2560×1720 / 116 KB |
| `c-search-results.png` | 同样派发 `input`，值 `明月` | 1280×860 @2× | 2560×1720 / 267 KB |
| `c-search-none.png` | 同样派发 `input`，值 `这首诗不存在` | 1280×860 @2× | 2560×1720 / 264 KB |
| `e-storage-honest-note.png` | 目录页；元素裁剪 `[data-test="honest-storage-note"]` | 1280×860 @2× | 1320×256 / 84 KB |
| `_raw-e-first-visit.png` → `e-first-visit.png` | **又一个新的 origin**（即无 SW、无缓存）→ `Network.emulateNetworkConditions{latency:1500}` → 导航 → 等外壳与装载提示出现 | 1280×860 @2× | 2560×1720 / 187 KB（合成图 2664×2310 / 364 KB） |
| `e-offline.png` | 已缓存后：`Network.emulateNetworkConditions{offline:true}` **且把静态服务关掉** → `Page.reload` | 1280 宽 @1×，整页 | 1280×1960 / 112 KB |
| `e-content-failed.png` | 换一份**没有 `content.json` 的部署**（HTTP 404）→ 导航 → 等 `[data-test="view-error"]` | 1280 宽 @1×，整页 | 1280×860 / 69 KB |
| `e-content-failed-then-retry.png` | 把 `content.json` 补回该部署 → 点 `[data-test="retry-load"]` → 等目录渲染 | 1280×860 @2× | 2560×1720 / 116 KB |
| `e-cleared.png` | 另一个 origin：访问到缓存就位 → `Storage.clearDataForOrigin{storageTypes:'all'}`（＝用户「清除站点数据」）→ 断网 + 关服务 → 再导航 | 1280×860 @2× | 2560×1720 / 48 KB |
| `f-favicon-current-inline-glyph.png` | **对照页**（见 §3）：把 `web/index.html` 里那条 `<link rel="icon">` 的真实字节按 16/32px 与 8× 放大画出 | 1280×900 @1× | 1280×900 / 53 KB |
| `_raw-b-notes-expanded-fixture.png` → `b-notes-expanded--fixture-supplement.png` | **夹具部署**（`buildVariants().fixtureContent`）→ hash 到 `#/p/fixture-test-poem-01` → 点 `[data-test="notes-summary"]` 展开 | 1280 宽 @1× | 1280×1422 / 117 KB（合成图 2664×3380 / 709 KB） |

**密度约定**（避免「为什么这张字大」的误会）：近看的图（viewport / 元素裁剪）用 **2×**；一屏装不完的长图（整页）
用 **1×** —— 1× 就是**真实渲染宽度**（1280 / 420），文字是与真机相同的 17px。

---

## 2. 逐张图：它证明什么 / 看图时要注意什么

- **`a-index-desktop*.png`**（A1/A2/A3）：组头「汉」＋左沿 2px 发丝竖线＋计数渲染成 **`[19] 首`**（方括号是 CSS 伪元素，
  所以 DOM 文本里只有「19 首」）；屏上是**真实内容 19 首**、次序＝底本原次序（《文选》卷二十九：行行重行行 → 明月何皎皎）。
  图里没有夹具黄条（`fixture-notice` 不存在）。整页图能把 19 行逐行看全。
- **`a-index-narrow*.png`**（G1）：420px 下计数、长题名的实测在台账里：计数右沿 **143px / 视口 420px**、
  整页**无横向溢出**（`docScrollWidth = innerWidth = 420`）、组头自身也没溢出、最长题名 91.6px。
  也就是**原型里那个 `[19` 被裁的问题，在实现里不存在**。
- **`b-poem.png`**（B1/B2/B3/B4/B5/B6）：题下那行是 `汉 · 佚名 · 东汉末 · 五言古诗`；正文 8 行＝底本分行；
  **没有异文栏、页面上不出现诗的 id**（DOM 文本里搜不到 `gushi-shijiu-shou-01`）；页脚只有「底本」一项；
  题头没有下划线。B3「全无衬线」我用 CDP 问了**实际渲染用的字体**（不是声明的 font stack）：正文/题/界面
  全是 `Microsoft YaHei UI`，计数 `19` 是 `Consolas`（等宽）—— 见台账 `platformFonts`。
- **`b-notes-collapsed.png`**（B7）：真实内容里 19 首全是 `notes: null`，所以屏上只有这一个态，
  原文是 **「这首诗还没有笔记（未记录）。」** —— 这句请与 Android 的「（无笔记）」并排看（B7 尚未定）。
- **`b-poem-foot-source.png`**（B5）：页脚只有「底本」一项，异文只出现在**底本文字内部的**「异文校记见 …」里。
- **`b-deeplink.png`**（B9）：地址栏问题见 §3；台账里记的是 `location.href = http://127.0.0.1:PORT/#/p/gushi-shijiu-shou-01`，
  `location.hash` 与 DOM 的 `data-poem-id` 一致，且 hash 里**没有标题**（改标题不会让老链接失效）。
- **`c-search-empty.png`**（C1）：**照实**：没有单独的「请输入」提示 —— 空输入时就是**目录默认页**，
  唯一的提示是输入框 placeholder「搜索诗名或作者」。
- **`c-search-results.png`**（C2）：`搜索「明月」：2 条`（明月皎夜光、明月何皎皎），每行带时代标签「汉」。
  ⚠ **没有命中高亮**：DOM 里 `<mark>` 元素 **0 个**、用 `--mark-bg` 颜色的元素 **0 个**（台账 `searchHit.highlightScan`）。
  `styles.css` 声明了 `--mark-bg/--mark-text`，但**没有任何规则用到它们**。
- **`c-search-none.png`**（C3）：如实写「没有匹配的诗名或作者。」（`search-summary` 显示 `0 条`）。
  `c-search-results/…none` 两图的台账 URL 都是 `#/`、不含 `?q=`（C4 的那半边证据 —— 图上**看不到地址栏**，见 §3）。
- **`e-storage-honest-note.png`**（E4）：页脚「诚实说明」原文 —— 写明「用户『清除站点数据』或浏览器回收存储都可能让它丢失，
  离线副本不承诺永久保存」。**注意图里那句星号**，见 §5 第 1 条。
- **`e-first-visit.png`**（E1）：外壳先到 → 屏上是 `索斐` + 「正在取内容…（外壳已经到达，内容单独取）」+ 诗行数 0。
  ⚠ 这一瞬**自然状态拍不到**（同机实测：外壳 22ms、目录 105ms、FCP 30ms、内容到达 33ms），
  所以图是**注入 1500ms 延迟**拍的，注入这件事与真实耗时都写在了图内。
- **`e-offline.png`**（E3）：已缓存 → 断网 + 关服务 → 重载，19 首仍可读，`网络` 一行显示「浏览器报告：离线」，
  `index.html` 仍能 200（只能来自本地缓存），未缓存资源拿不到（504）。**这不是「首次访问就离线」**：前提是先访问过一次。
- **`e-content-failed.png`**（E2）：这次部署里没有 `content.json` → 界面上是「内容没能取到 / 取内容失败：服务器返回
  HTTP 404 Not Found …」+「重试取内容」按钮，外壳与状态面板仍在渲染（不是白屏）；`e-content-failed-then-retry.png`
  是补回内容再点重试后**真的恢复**（19 首）。
- **`e-cleared.png`**（E4）：清掉站点数据后：`caches` 从 1 → **0**、SW 注册从有 → **无**；
  此时断网 + 服务已关再访问，**只剩浏览器的错误页**（`chrome-error://chromewebdata/`，`ERR_INTERNET_DISCONNECTED`）。
  也就是说：**离线副本确实会丢**，界面上也没有任何东西可显示。
- **`f-favicon-current-inline-glyph.png`**（F2）：见 §3 最后一条 —— 它是**现状**，不是 F2 的交付物。

---

## 3. 哪些图**不是**普通站点截图（逐条说清）

1. **带说明条的三张**（`b-deeplink.png`、`e-first-visit.png`、`b-notes-expanded--fixture-supplement.png`）：
   图的上半部分是**脚本生成的说明条**，下半部分是**未被改动的真实截图**（原图另存为 `_raw-*.png`，可以自己比对）。
   说明条存在的理由分别是：本机截不到地址栏 / 那一瞬自然拍不到 / 那一态在真实内容下不存在。
2. **`f-favicon-current-inline-glyph.png` 是一个对照页**（`file://`），不是站点：它把站点 `index.html` 里
   那条 `<link rel="icon">` 的**真实字节**按 16/32px 原样与 8× 最近邻放大画出来。它只回答「16px 下还看不清」，
   **不代替**「浏览器标签页里长什么样」的实拍。
3. **地址栏**：本机**没有可用的交互桌面会话**（实测：有头 Chromium 主窗口 rect = `-32000,-32000`，即最小化），
   所以**截不到带浏览器地址栏的窗口**。`b-deeplink.png` 里那一行 `location.href` 是**抓图同一时刻由 CDP 从页面读回的原文**
   （脚本文本，不是浏览器界面），图内已标明。
4. **favicon 的第二半（F2 交付物）没有**：本树里 `web/icons/` **不存在**（图标线还没并入），
   脚本对此的判断与台账（`iconsDirExists: false`）一致。**我没有自己造 favicon**。
   图标线并入后请重跑 `capture.mjs`：脚本会自动改名为 `f-favicon-from-site-icons.png` 并把 `web/icons/` 里的文件一并列出。

---

## 4. 我**没有**用真实内容拍到 / 只能拍一半的格子（老实话）

| 格子 | 情况 |
|---|---|
| **A4**（将来多组还能扫读） | 真实内容只有 **1 组**，这一态**拍不到**；材料只能证明「1 组 19 首」的现状。 |
| **A5**（目录结构 vs 原型） | 不是本材料能回答的问题（正是待 grill 的那件）。材料只给**实现现状**（组头＋19 首全部内联、没有二级页）。 |
| **B8**（长笔记展开后是否好读） | 真实产物 19 首**全部 `notes: null`** ⇒ 这一态**在真实内容下不存在**。给了 `b-notes-expanded--fixture-supplement.png`，它是**夹具内容**、图内带横幅、**不能用于过账**。 |
| **B7**（无笔记时空态两端同一句话） | 我只拍到 **Web 半边**：`这首诗还没有笔记（未记录）。`；Android 那半（「（无笔记）」）由调度侧出。 |
| **C1 / C2 的期望项** | 不是「拍不到」，而是**拍出来与期望不符**：C1 没有单独提示语；C2 **没有命中高亮**（0 个 `<mark>`）。这就是待改的证据。 |
| **C4**（搜索不进 URL） | **只能算拍到一半**：图上**看不到地址栏**（§3.3）；证据是台账里 `location.href` = `…/#/`、不含 `?q=`。 |
| **E1 的「那一刻」** | 只能**注入延迟**才拍得到（真实 22–105ms，见台账 `realFirstVisitTiming`）。 |
| **E3 的另一种口径** | 「**首次**访问就断网也能读」（众测口径）**我没拍**：材料拍的是「已缓存后断网仍可读」。前者需要预置缓存，本质要靠分发渠道。 |
| **G3**（超长题名/作者不撑破布局） | 真实内容里最长题名 5 字、作者都是「佚名」⇒ **超长这一态拍不到**。唯一的相关实测是 420px 下无横向溢出、最长题名 91.6px。 |
| **G2**（从诗页返回目录的行为、是否回到原滚动位置） | 图里只有「← 目录」这个入口；**滚动位置行为没拍**（清单里它本来就是「未决」）。 |
| **G4**（两端一致性） | 我只能出 Web 半边；要并排得等 Android 材料。 |
| **D1/D2/D3（Android 更新页）、F1（启动图标）、F3（应用名/包名）** | 不在本条线的材料范围（Android 由调度侧出；F3 已有 `apk-identity` 门在守）。 |
| **A2 的「命中」等断言** | 本材料**不做**行为断言（那是 `web/tests/e2e-cdp.mjs` 的活）。这里除了看图，只记了少量**直接实测**（窄屏几何、字体、`<mark>` 计数、缓存与 SW 状态），都在台账里。 |

---

## 5. 拍这些图时**看见**的问题（都不在我的写入范围内，只是报告）

1. **界面上有字面 markdown 星号**：页脚「诚实说明」里那句渲染成了
   `本站**不会自动刷新**：发现新版本只给提示…`（`web/app/main.js:293` 的字符串里带了 `**`）。
   每一张含页脚的图（目录/搜索/诗页都含）都能看到。建议改成不带标记的文字或真正加粗。
2. **搜索命中没有高亮**（C2）：`styles.css` 有 `--mark-bg/--mark-text` 令牌，但没有任何规则/代码用到它们
   （`render.js` 的 `poemRow` 只写 `textContent`）。台账里是 0 个 `<mark>`、0 个用该底色的元素。
3. **搜索空输入没有提示语**（C1）：现状是回到目录默认页，唯一提示是输入框 placeholder。
4. **状态面板（页脚）体量很大**：它把站点版本、缓存条目、内容版本、次序口径、持久化配额、「诚实说明」等
   全部摊在每一屏底部 —— 在「搜索无结果」这种内容很少的屏上，它占了屏幕高度的一大半。
   清单里**没有这一格**；要不要给「屏级排布」加一格（面板是否默认展开/是否只在开发态出现），交对话侧决定。
5. **`b-notes-collapsed.png` 与 `b-notes-expanded--fixture-supplement.png` 的一端差异**：Web 用的是
   `details/summary`（有笔记时才有），无笔记时是一句提示 —— 与 Android 的文案不同（B7 未决）。

## 6. 诚实边界（总结）

- 这里**没有**做像素级对比（原型截图与实现截图不在此目录；那件事在 `../dir-structure/compare.png`）。
- 颜色/行高/字距这些**已有逐值断言**在守（`web/tests/e2e-cdp.mjs` §1d），本材料不重复承担这个职责。
- 图里的时间、端口、内容取到时间等会随重跑变化（`127.0.0.1:PORT`、`内容取到时间`），**不是稳定事实**；
  稳定事实以 `capture-manifest.json` 里的版本号、sha256、HEAD 为准。
- `e-*` 各图**都是在一台机器上的本地站点**拍的：不涉及线上站点、不涉及 Android、不动任何设备。
