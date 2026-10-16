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
cd web && CHROME_BIN='C:/Users/wsqsy/AppData/Local/Chromium/Application/chrome.exe' node tests/e2e-cdp.mjs
cd android && JAVA_HOME='C:/Users/wsqsy/.jdks/ms-17.0.17' ./gradlew testDebugUnitTest --offline --no-build-cache --rerun-tasks
```
