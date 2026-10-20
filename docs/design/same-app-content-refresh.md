# 同 app 版本的内容刷新（`--same-app-content-refresh`）

> 2026-10-16 建立。起因是用户的一句话，分两轮：
>
> 1. 「先把内容更新吧，也就是版本号不变只更新内容吧」
> 2. 「不对，应该更新 Release 和 apk，这样下载新的 apk 不用联网；不用添加新的工作流，直接复用已有工作流」
>
> 所以本文件描述的是**最终口径**：**应用对外版本号不变**（`versionName 0.1.3` / `versionCode 4` /
> `APP_VERSION 0.1.3` / `formatVersion 2`），**照常产出一份新 APK 与一个 Release**，只有内容的
> `contentVersion` 递增。第一轮曾被理解成「不发 APK」，那是**错的**，已在代码里作废
> （`--content-only` 现在会直接报错并指回本路径）。

## 1. 这条路径是什么

一次「同 app 内容刷新」发布 ＝

| 产物 | 变不变 |
|---|---|
| `dist/content.json` / 站点 `content.json` / Android 快照 `content/<ver>/content.json` | **新**（`contentVersion` 递增，严格大于线上真值） |
| `content/latest.json`（Android 前馈清单） | **新**（`contentVersion`/`sha256`/`size` 新的；`minAppVersionCode` 显式写 **3**：0.1.2/vc3 也能读 format 2） |
| APK | **重新打包**（内置新内容；**同版本号**——`versionName`/`versionCode` 一个都不动） |
| Release | **新建**（新 tag）；历史 Release 与旧 tag 的资产**不动** |
| 站点壳（HTML/JS/CSS） | 只有**内容修订协议**那几个文件（见 §7）；渲染/解析/样式/标记逐字节不变 |

**它不是什么**：

- 不是升版发布：应用版本与 `versionCode` **不变**，所以**不能**用默认（升版）模式的门来放行，
  也不能声称「应用更新了」。
- 不是「同一个版本号随便重发」：`contentVersion` 仍必须严格递增，缓存名仍必须变（见 §2）。
- 不是「不产 APK」：这一点是本文件第一版写错、被用户当场纠正的地方。

## 2. 为什么 Web 端**必须**换 `sw.js` 的字节

Web 的更新通道是 Service Worker。浏览器只在 **`sw.js` 的字节变化**时才去装新 SW。
站点缓存名原本只由 `APP_VERSION` 决定（`pc-resources-0.1.3`）。于是「同 app 版本重发新内容」会坏在两处：

1. `sw.js` 字节没变 ⇒ 浏览器不会装新 SW ⇒ **老缓存继续服务**，用户永远看不到新内容。
   而且**所有门都还是绿的**：内容产物是新的、哈希是对的、部署目录也好好的。
2. 就算硬塞一个新 SW，缓存名相同 ⇒ 新旧内容挤进**同一个** cache ⇒「壳与内容成对切换」这条保证破了
   （可能出现旧壳配新内容，或者两次部署的字节混在同一个 cache 里）。

由此定下的做法：

- 缓存名 = `<前缀><APP_VERSION>+<CONTENT_REVISION>`，即 `pc-resources-0.1.3+2026.10.16.26`；
- **前缀 `pc-resources-` 一个字都不动**：`sw.js` 的 activate 靠它认出「本前缀的旧 cache 才删」，
  改了前缀就会删错（或不再删自己的旧数据）；
- 仓库里的 `CONTENT_REVISION` 恒为 `dev`；**发布构建把产物里的那一份盖章成本次 `contentVersion`**
  （`release/lib/content-refresh.mjs: stampWebShell`，逐文件自检「恰好一处常量」＋写盘后读回核对
  ＋断言 `APP_VERSION` 一个字节都没变）。

## 3. 为什么 Android 也重打包（而不是只更新内容）

用户的理由很直接：**「这样下载新的 apk 不用联网」** —— 首次安装（或清除数据后冷启）就能读到新内容，
不必先连网拉一次。所以：

- APK 内置内容**与 `dist` 同源逐字节相同**（`apk-builtin-same-source` 真跑）；
- `versionName`/`versionCode` 不变 ⇒ 这是**同版本号重打包**；覆盖安装的合法性与签名一致性照旧由
  平台校验（同签名 + 同 code 允许 `-r` 覆盖）；
- 因为应用代码没变，**`android/` 的进包源码必须与基线 tag 逐字节相同**（只允许
  `assets/content/content.json` 变）。这条在 `same-app-android-source-identical` 里是硬门。

## 4. 门在两种模式下的对照

默认模式（正常升版）的守卫**一字未改**；两种模式共用的门也照旧。

| 门 | 默认（升版） | 同 app 内容刷新 | 说明 |
|---|---|---|---|
| `app-version-agree`（两处常量 + tag 应用版本） | 跑 | 跑 | **追加**了内容修订对账：`config.js == sw.js == manifest.contentVersion`、缓存名形状、前缀未变 |
| `app-version-bumped`（APP_VERSION 必须递增） | **跑** | **SKIP** | 本模式的定义就是「不变」⇒ 前提被取代；由 `same-app-app-version-unchanged` **正面断言**它 == 线上现值 == 基线 tag 里的值 |
| `apk-versioncode-bumped`（versionCode 必须递增） | **跑** | **SKIP** | 同上；由 `same-app-version-code-unchanged` 正面断言它 == 同 app 版本旧 tag 里的值 |
| `apk-present` | 跑 | **跑** | 本模式**确实产 APK** |
| `apk-builtin-same-source`（APK 内置 == dist == Web） | 跑 | **跑** | 最关键的一条 |
| `apk-identity`（包名 / versionCode / versionName） | 跑 | **跑** | 会显示 versionCode 4 / versionName 0.1.3 |
| `apk-signing`（正式证书、非 debug） | 跑 | **跑** | debug 变体时如实标黄（不能用于正式发布） |
| `version-monotonic` / `same-app-content-bumped` | 前者跑 | 两条都跑 | 后者比**线上真值**（站点 `content/<ver>/content.json` 对应的已发布版本）与**基线 tag 的内容版本**，取严 |
| `same-app-baseline-tag` | — | 跑 | 挑「同 app 版本的旧发布 tag」（`v0.1.3+content-*`，排除本次 tag，取内容版本最大者） |
| `same-app-android-source-identical` | — | 跑 | `git diff --name-only <基线tag> -- android/` 只许 `assets/content/content.json`；未跟踪文件必须为 0 |
| `same-app-web-source-scope` | — | 跑 | 已发布文件中：冻结集（`index.html`/`styles.css`/`app/content.js`/`app/render.js`）不许变；改动必须逐条登记在 `WEB_PRODUCT_CHANGE_ALLOWLIST`（带理由）；其余一律红 |
| `same-app-content-delta` | — | 跑 | 相对**线上已发布那一份内容**：已发布作品**逐首逐字段**未变（不删、不改字句）、确有新增、组名不删不乱序。**唯一的例外**是 `PUBLISHED_POEM_FIELD_EDITS` 里逐首登记的**排序键**改动（只许 `orderInSource` / `tags[].orderInTag`，且标签 id/数量不许变；`orderInSource` 只放行「正整数 → 正整数」与「**null → 正整数**」——后者是必填键补齐的迁移方向，整数 → null 仍红）；登记了却没变（声明过期）也红 |
| `content-revision-stamped` | 跑 | 跑 | 缓存名含修订、前缀未变、修订 == contentVersion、不是 `dev` |
| 三条真跑门（Web e2e / Android JVM 单测 / MD 契约对照） | 跑 | 跑 | 同 app 模式还**要求** e2e 拿到「真旧基底」才许跑（见 §6） |

结论行也分开：本模式只会写
**「结论：same-app 内容刷新就绪（APK 为同版本号重打包、内置 N 首；APP_VERSION x / versionCode y 未变，内容 A → B）」**，
不会写「三样产物就绪」，也不会混说成升版发布。

## 5. 一手来源（门去读谁，不读自我声明）

| 要证明的事 | 来源 |
|---|---|
| 应用版本没变 | 线上站点 `${BASE_URL}/app/config.js` 的 `APP_VERSION`（`release/lib/live-version.mjs`） |
| `versionCode` 没变 | **同 app 版本的旧发布 tag** 里的 `android/app/build.gradle.kts`（不写死数字 4） |
| 应用代码没变 | 同一个 tag 的 git 树（`git diff --name-only`） |
| 已发布内容是什么 | 线上已发布的内容快照 `content/<旧contentVersion>/content.json`（**不是**仓库里的内置副本） |
| 旧站点是什么字节 | 同一个 tag 的 `web/**`（`git show <tag>:web/<file>`，二进制原样） |

## 6. 同 app 版本旧包 → 新内容的更新链（实测口径）

Web e2e 的第 9 节用**真·旧基底**跑：`tag 的 web/** ＋ 线上已发布的内容快照`（不是「新 main ＋ 20 首夹具」），
在同一个 origin 上换成新部署（同 `APP_VERSION`、新修订、22 首）：

- 旧包能**发现**新版本：它的逻辑是「有没有 waiting」，**不比较版本号**，所以同 app 版本也能发现；
- 旧包的提示会显示**两个相同的版本号**（`应用资源 v0.1.3，当前 v0.1.3`）——它不理解 `contentRevision`。
  这是**已发布包的固有限制**：新内容对它的意义就是「站点有新版本」，提示文案没有信息量但**发现与切换是安全的**。
  安全（同 cache 原子等待/切换、不裂）优先于文案完美。
- 新旧 cache ID 都记下来：旧 `pc-resources-0.1.3` → 新 `pc-resources-0.1.3+<修订>`；
  切换后 activate 只删**本前缀**的旧 cache；
- 新 cache 里壳与内容是**同一批**（读缓存里的 `content.json` 与 `app/config.js` 两个都断言）；
- 失败（预缓存取不到 `content.json` ⇒ install 失败）⇒ **保旧**：旧 SW 继续服务、旧内容还在、
  页面不出「有新版本」、半套的新 cache 里没有可用的 `content.json`；
- 不兼容（`formatVersion` 更高，能装上）⇒ **未接受时仍读旧内容**、页面不裂；接受之后如实报错
  （不是白屏、也不是新旧混排）；
- 离线（CDP 断网 + 关掉本地服务）重载仍读缓存里的新内容，不白屏、不报错。

## 7. 内容修订协议的改动清单（与基线 tag 的逐条差异）

这条路径对外声称「应用没变」。所以凡是**已发布文件**相对基线 tag 有变化，都必须能逐条说出「为什么属协议必需」。
当前清单在 `release/lib/content-refresh.mjs: WEB_PRODUCT_CHANGE_ALLOWLIST`（`same-app-web-source-scope`
门会逐条核对；以后纯内容刷新时这张表应当变空）：

| 文件 | 为什么必须改 |
|---|---|
| `web/sw.js` | 缓存名改成复合键（同 app 版本时必须换 SW 字节，否则浏览器不装新 SW）；新增 `CONTENT_REVISION` 常量；缓存报告里加 `contentRevision` |
| `web/app/config.js` | 新增 `CONTENT_REVISION`；`resourceCacheName(appVersion, contentRevision)` 的复合键派生 |
| `web/app/main.js` | 「有新版本」提示写明内容修订（同 app 版本时只说 `v0.1.3 → v0.1.3` 会误导）；并把修订带进内部诊断 `summary()` 供测试断言 |

**冻结不变**（改了就不是「只换内容」）：`web/index.html`、`web/styles.css`、`web/app/content.js`、`web/app/render.js`。
**不进 APK、也不参与判定**：`web/tests/**`、`web/scripts/**`、`web/fixtures/**`、`web/README.md`。

Android 侧：`android/` 的**进包源码**与基线 tag 逐字节相同（只允许 `assets/content/content.json`）；
`android/app/src/test/**`（JVM 单测）跟着内容线更新是正当的，但**不进 APK**，门会单列出来供审查。

## 8. 未做 / 不声称

- **没有**新增工作流：复用 `.github/workflows/release.yml`（`v*` tag 照旧触发），2026-10-19 起该文件的 `workflow_dispatch`
  多了一个**显式 `mode` 选项**把 `--same-app-content-refresh` 传给 `build` 与 `check-ready`（见 §10）。
- **没有**在 CI 上真跑过（与所有既往工作流一样）：本地证据是 debug 变体 + debug 签名；
  正式证书那条门（`apk-signing`）只有在 CI 的 release 变体下才会真跑。
- **没有**在真机上安装/覆盖升级验证；模拟器上的同版本号覆盖安装是**另一条证据**，不等于真机。
- **没有**做「旧包理解内容修订」：0.1.3 的旧包看到的就是「站点有新版本」，文案无信息量。
- **没有**把这条路径接进 App 的自动安装：应用代码升级照旧只提示下载（第一版共识）。
- 不声称原子性：Pages 与 Release 的生效延迟由服务商决定。

## 9. 怎么跑（本地演练）

```bash
# 1) 构建（debug 变体演练；正式发布由 CI 用 release 变体 + 四项签名 secrets）
node release/build-release.mjs \
  --tag "v0.1.4+content-2026.10.19.3" \
  --android-variant debug \
  --same-app-content-refresh \
  --min-app-version-code 5

# 2) 就绪检查（三条真跑门会真的起浏览器/跑 Gradle；要 CHROME_BIN 与 JAVA_HOME）
#    ⚠ 退出码：结论不是「就绪」时**一定**非 0（曾黄/跳过也 exit 0，那会让 CI 照发 —— 见 §10.4）
CHROME_BIN='C:/Users/wsqsy/AppData/Local/Chromium/Application/chrome.exe' \
  JAVA_HOME='C:/Users/wsqsy/.jdks/ms-17.0.17' \
  node release/check-ready.mjs --same-app-content-refresh --out release/out

# 单独迭代 Web e2e：
node release/check-ready.mjs --same-app-content-refresh --live-only
```

⚠ 同一份产物目录里重复跑同一个 `contentVersion` 会被编译器拦住（`VERSION_NOT_MONOTONIC`，这是对的）：
演练前先 `rm -rf release/out`，或换一个 `--out`。

## 10. CI 接线（2026-10-19）

### 10.1 只有 `workflow_dispatch` 能选这个模式

`push`（`v*` tag）**永远**走正常升版模式（`RELEASE_MODE` 落到 `release`）；`workflow_dispatch` 多了一个显式选项：

```yaml
workflow_dispatch:
  inputs:
    tag:  …          # 要发布的 tag（同时是 checkout 的 ref）
    mode: choice(release | same-app-content-refresh)   # 默认 release
    dry_run: boolean # 默认 true（要真发布必须显式 false）
```

### 10.2 四条硬要求（用户 2026-10-19 指定）落到哪一步

| 要求 | 落实处 |
|---|---|
| 1. checkout **显式取这次 tag 的 commit**，并校验 `RELEASE_TAG` ↔ `release-manifest.sourceCommit` ↔ `HEAD` 三者一致 | `checkout.with.ref = inputs.tag`（dispatch）／`github.ref_name`（push）；`校验 tag ↔ HEAD ↔ 模式` 与 `校验产物清单 ↔ tag ↔ HEAD` 两步，不一致即 exit 1（在建 Pages/Release **之前**） |
| 2. 新选项必须在**可 dispatch 的 ref** 上 | 先把本文件（及工作流）合进 `master` 再 dispatch；`push` 路径根本不读 `inputs`，所以**旧 tag/Release 不受影响** |
| 3. 同一 tag 的两次 run：只有「显式 same-app + `dry_run=false` + 全 ready」能碰 Pages/Release/`latest` | ① 正常模式在**构建前的 preflight 就红**（「应用版本已有别的发布 tag ⇒ 这不是升版，请用 dispatch 选 same-app」），**不构建、不部署**；② 发布步骤的 `if` 同时要求 `push` 或（dispatch 且 `dry_run==false`）；③ 门在发布步骤**之前**，且结论不 ready 时**退出码非 0**；④ 两条 run 共用一个 `concurrency` 组（`cancel-in-progress: false`）⇒ 排队、不互相 cancel、不会同时写 `latest.json` |
| 4. 两种模式各自真回归 | 正常模式的门**一字未改**（`app-version-bumped` / `apk-versioncode-bumped`）；same-app 用 `same-app-*` 的**替代正面断言**（相等而非递增） |

### 10.3 Release 说明按模式换模板

- 升版：`release/notes/release-notes.md`；
- 同 app 内容刷新：`release/notes/release-notes-same-app.md`（写清「应用版本没变、只有内容变」）。
  CI 用 `@TAG@` / `@APP_VERSION@` / `@CONTENT_VERSION@` / `@PREVIOUS_CONTENT_VERSION@` / `@VERSION_CODE@` 注入真实值。

### 10.4 修掉的一个真缺陷：结论说「不推进」却 exit 0

原先 `check-ready` 两个「不满足推进条件」的分支**只打印、不改退出码**（末尾统一 `process.exit(0)`）⇒
只要不是 `FAIL` 而是 `WARN`（没跑）/`SKIP`（没查），工作流就**照样**进 Pages/Release。
现在结论与退出码都读同一个纯函数 `release/lib/readiness.mjs: decideReadiness()`（四情形有单测，另有源码守卫禁止
再出现写死的 `process.exit(0)`）：**没有 PASS 就不是绿**这条判据终于是可执行的，不再只是一句打印。

### 10.4b 顺带补上的一处漏洞：same-app 的判据里原本没有 APK 五门

本模式文档一直写「APK 五门照旧真跑」，但那五门**没有被放进 same-app 的结论判据** ⇒
只要不是 `FAIL`（例如 `apk-signing` 在缺 `apksigner` 时报 `WARN`），结论仍会写「就绪」并放行发布。
2026-10-19 起：`apk-present` / `apk-builtin-same-source` / `apk-identity` / `apk-signing` 与
`content-revision-stamped` 一起进 `sameAppGating`；某门**没出现在本次运行里**（如 `--live-only`）
按 `SKIP` 算「没查」，不许被静默忽略。
另：`debug` 变体在**两种模式**下都先判成演练口径（`ready=false, exit 0`）—— debug 签名过不了
`apk-signing`，所以 debug 构建永远不许说出「可以按新 tag 建 Release」那句话。

### 10.5 未做的

- 仍未在真机上安装/覆盖升级（模拟器为验收基准）；
- CI 上的第一次 same-app dispatch 结果以当次 run 回执为准，不预先宣称。

