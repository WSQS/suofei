# 关于页「已选锚偏差」返修证据（2026-10-16）

这三条**不是新设计**，是**实现偏离了已采纳锚**：

| # | 偏差 | 采纳锚 | 修法 |
|---|---|---|---|
| ① | 仓库链接被降成**不可点的纯文本**（两端） | `items/app-ui/history/round-2026-10-16-about/ARCHIVE.md`：**C1＝完整 URL**（那份原型里 C1 就是 `<a href>`；用户没选的只是 C3 那句提示） | Web 改回 `<a href>`（可见文本仍是完整 URL、不加提示）；Android 那段文字改回**可点**（`LocalUriHandler` ⇒ `ACTION_VIEW`） |
| ② | Web 的版本值**整串等宽**（`站点资源版本 v0.1.1` 全部 mono） | 同轮归档原型：只有**版本号**是等宽（`.kv > .v > .ver`） | 值这一层改回常规字，只有版本号那一段 `.about-v-num` 是 mono（可见文字一字不改，同一个 `data-test`） |
| ③ | Web 关于页**品牌与版本各出现两次**（外壳顶栏 ＋ 页标题/版本组） | A3：应用名当**页标题**；顶栏是 Web 外壳、不属四页规格（`web/README.md` §4 原文） | **只在关于页**把那份外壳顶栏 `hidden`（该页自带「← 目录」返回）；目录页/诗页顶栏语义一字不改 |

本目录只放**交付证据**（`web/tests/artifacts/` 是每次跑测试重写的、且被 `web/.gitignore` 忽略，
留在那里会随工作树回收一起消失，所以挑出这四张放进版本库）。

## 图（均已被交付人**亲眼看过**）

| 文件 | 是什么 | 看出什么 |
|---|---|---|
| `about-before.png` | Web 关于页**返修前**（基线 `400/400` 那轮 e2e 出的 `03c-about.png`） | ① 底部 URL 是与正文同色的裸文本；② `应用版本` 的值**整串等宽**；③ 顶栏「索斐 ＋ 站点资源版本 0.1.1」与页面上的页标题/版本组**各重复一次** |
| `about-after.png` | Web 关于页**返修后**（`412/412` 那轮 e2e 出的图） | ① URL 是链接色（`--accent-text`）的可点 `<a>`；② 只有 `v0.1.1`/`v2…` 是等宽，「站点资源版本」四个汉字是常规字；③ 顶栏在这一页消失（「索斐」整页只出现一次），页面其余排布与 `about-before.png` 逐项对得上（四条线合一、值列位置不变） |
| `index-after.png` | Web **目录页**返修后 | ③ 的反向证据：顶栏在目录页**照旧可见**、目录本身仍不含应用名（「索斐」整页仍恰好一次）；① ② 与目录页无关 |
| `android-about-after.png` | Android 关于页（`emulator-5556`，`dev.sopho.suofei`，debug APK） | ① 底部 `https://github.com/WSQS/suofei` 可点；② 实测两个值是 `0.1.1` / `2026.10.16.22`，**裸版本号、没有汉字混在等宽里** ⇒ 本端 ② 不用改 |

Android ①的**点击级**证据（不是截图能表达的）：点那段 URL 后

```
ActivityTaskManager: START u0 {act=android.intent.action.VIEW dat=https://github.com/WSQS/suofei
  cmp=com.android.chrome/com.google.android.apps.chrome.IntentDispatcher} from uid 10217
mCurrentFocus: dev.sopho.suofei/dev.sopho.suofei.MainActivity
            → com.android.chrome/org.chromium.chrome.browser.ChromeTabbedActivity
```

即：确实以 `ACTION_VIEW` 把**那条完整 URL** 交给了**外部浏览器**（Chrome，本机模拟器上 https 的唯一处理者）。
该模拟器**没有外网**（`ping github.com` 100% 丢包），所以 Chrome 里那一页打不开——这是环境事实，不是返修没生效。

## 复跑

```bash
cd web && CHROME_BIN=/path/to/chrome node tests/e2e-cdp.mjs
cd android && JAVA_HOME=/path/to/jdk17 ./gradlew testDebugUnitTest --offline --no-build-cache --rerun-tasks
```

> ⚠ 公开仓库卫生：本文件里的**本机绝对路径已替换为占位符**（仓库、浏览器、JDK），
> 以免把个人目录写进公开仓库；图与结论逐字未改。

---

# 页脚诊断面板 ＋ 全局外壳顶栏 移除的证据（2026-10-16，**用户实际预览时发现的**）

## ① 页脚诊断面板

**缺陷**：整块「站点资源版本／缓存名／SW／内容体积与取到时间／格式／次序／网络／持久化配额」＋三个调试动作
（检查站点更新／请求持久化存储／重新取内容）＋一段长诚实说明，**在四页都显示**。它是 Web 骨架期的
开发/核验脚手架，**不属于已采纳的页面集合**（`IF-46`：只有目录／诗／详情／关于）⇒ 已**整块从产品 UI 移除**
（不是 CSS 隐藏、没移进关于页、没加开发者入口）：`web/index.html` 去掉页脚与外壳版本徽标，
`web/app/main.js` 删掉 `renderStatus()` 与那三个动作，`web/styles.css` 删掉 `.status*`／`.app-version` 规则。
**机制一个没删**：SW 离线缓存、后台更新检测、「有新版本→点刷新」必要提示、加载/失败可见反馈照旧。

## ② 全局外壳顶栏（同轮、用户接着指出的第二处偏差）

**缺陷**：每页顶部还有一条 sticky 的「索斐」横栏（外壳 `.site-header`＋`site-title`）。采纳锚写着
**目录页顶部只有「关于」这一个入口、不重复应用名**（`items/app-ui/history/round-2026-10-15-hub-align/`，
Android 端也没有这条横栏）⇒ 那条横栏在目录/诗/详情三页上都是**冗余产品壳**。
**修法**：`web/index.html` 删整个 `<header class="site-header">`；`main.js` 删 `els.siteHeader` 与
「关于页把它 hidden」那段（**已没有东西可藏**）；`styles.css` 删 `.site-header`／`.site-title` 规则。
**没动**：关于入口、顶部返回（← 目录／← 返回这首诗）、详情导航；浏览器 `<title>` 与 `manifest.json` 名称照旧；
关于页自己的应用名页标题（`about-app-name`）照旧。

## 图（四张**同时**证明上面两件事；全部**用 read 工具亲眼看过**；**整页截图**，每张先 `scrollTo(bottom)` 再截）

| 文件 | 是什么 | 看出什么 |
|---|---|---|
| `no-panel-index.png` | 目录页（真实内容 19 首） | 顶部**只有右侧一个「关于」**、**没有「索斐」横栏**；页面**在最后一首诗之后就直接结束**——没有面板、没有缓存名/配额、没有长诚实说明 |
| `no-panel-poem.png` | 诗页（`行行重行行`） | 顶部直接是「← 目录／详情」行（**上方没有外壳品牌横栏**）；题名与 8 行正文居中；正文之后**没有任何页脚块** |
| `no-panel-detail.png` | 详情页（含 `detail` 的那首） | 顶部直接是「← 返回这首诗」（**无外壳横栏**）／题名左对齐／「底本与来源」带标签／`异文` 三个列表项；之后**没有页脚块** |
| `no-panel-about.png` | 关于页 | **没有外壳横栏**，页面只有自己的「← 目录」＋页标题「索斐」（**整页只出现一次**）＋三行**已选**字段；**没有**长限制说明、**没有**「检查更新」按钮、没有面板 |

## 可复跑的断言（比图更硬）

`web/tests/e2e-cdp.mjs` 的 **§1c-3 全页面负向扫描**：对四页逐个断言（查**整份文档**，不是某个 view 子树
—— 此前那条查 `view-about` 后代的负向断言就**恒真**过）：

- 全页可见文本里没有 14 个诊断面板词汇（站点缓存／Service Worker／内容体积／内容生成时间／内容取到时间／
  内容格式版本／组内次序／持久化存储／配额／检查站点更新／请求持久化存储／重新取内容／诚实说明…）；
- **没有全局外壳顶栏**（`.site-header`／`site-title` 在四页都不存在），外壳只剩视图区＋通知区；
- 目录页**整页可见文本里「索斐」出现 0 次**、顶部 `index-bar` 里**只有「关于」一个入口**；
- 「站点资源版本」**只允在关于页出现且恰好一次**（它在那儿是采纳锚的合法可见文字，所以单列）；
- 页面里 `<footer>` 数 **0**、`[data-test^="status"]` 数 **0**、三个调试动作 **0**；
- **正向对照**（防「把版本/内容整个删掉也能过」）：关于页确实显示 `v0.1.1`、目录确实渲染出 19 首。

⚠ 同轮还修了一个**被这次移除暴露出来的真缺陷**：`afterViewChange` 原来只等**一帧**再恢复目录滚动位置，
而那之前是页脚面板的 DOM 写入恰好把布局顶完才显得正确；面板没了以后，从诗页返回目录会**回到顶部**
（e2e 实测：捕获 `373`、回来却是 `0`）⇒ 改成等**两帧**（`web/app/main.js`），断言随即恢复通过。

