# 发布流水线设计（工作线 F）

- 状态：**设计 + 本地演练通过**（2026-10-14 建立；2026-10-16 三轮返修：压缩产物、两个「真跑」门、解耦 E 的内部结构、去边车、tag 双号）。
  **未推远端、未签名、未发布**（公开发布需用户单独授权，见 §10）。
- 依据：`CONTEXT.md` 的发布硬需求（tag 触发「最新 JSON + Web + 内置同版内容的 APK」；**等产物全部构建/检查就绪再推进最新版**；不声称不同发布服务具有绝对原子性；APK 固定签名、密钥不入公开 Git）、`AGENTS.md`、契约 §2/§4/§4.1、**决策点 5（tag 同时带两个号）**、`web/README.md`（APP_VERSION 两处递增、内容同批、sw.js 不长缓存）。
- 实现：`release/build-release.mjs`（构建）、`release/check-ready.mjs`（就绪检查）、`release/lib/`（共享约定 + 两个真跑门）、`release/README.md`。

## 0. 本轮的改动与理由

| 改动 | 为什么 |
|---|---|
| **tag 作版本来源**：`v<应用资源版本>+content-<内容版本>`（用户 2026-10-16 拍板）。用 tag 时必须解析出**两个号**，缺号/形状不符 ⇒ **拒绝发布并说明期望格式** | 一次发布同时决定站点版本（SW 缓存键）与内容版本；两个号必须来自同一个锚点，否则会出现「壳与内容版本对不上」 |
| 产物改**压缩 JSON**（`--minify`） | 站点/APK 传的就是这份字节（实测 26029 → 20964 字节，**-19.5%**）；且仓库里已提交的 Android 内置产物也是压缩的 |
| **不再产出任何 `sha256` 边车**（`dist/` 与 Web 侧都去掉：不产出、不检查、不登记） | 2026-10-16 已定：Web 的校验靠「同一次部署 + HTTPS + SW 预缓存整体性」，没人消费的边车只会让人以为还有一道校验环节。**Android 小纸条清单里的 `sha256` 字段保留**（那是真在用的） |
| **不再解析 E 的 `sw.js` 内部结构** | E 重写 `sw.js`（`SHELL` → 内容与壳同一份预缓存清单）时，我那条按常量名解析的检查在主线报了假红。SW 的**行为**（预缓存是否完整、离线可读、新旧成对切换、旧 cache 被删）交给 E 的 e2e；我这一层只断言**部署契约**与**契约常量** |
| 加两个**真跑门**：E 的 Web e2e（用 `out/web` 的构建产物）+ Android JVM 单测（内置内容＝本次产物） | 静态断言不证明页面能跑、也不证明产物能被客户端解析 |
| 加 `--android-variant debug\|release`（默认 debug）与 `apk-signing` 门 | 之前产出的 APK 是 `assembleDebug` 的，即 **debug 签名** —— 而正式发布要 release 变体 + 正式签名。这条门防的正是「以为发的是正式签名包、实际是 debug 包」（发出去收不回）|
| 编译失败**不再清空产物目录** | 早期在第 3 步 `rmrf(outDir)`，一次编译失败就把上一版的 manifest 也删了 —— 既违背「失败保留旧版」，又弄丢了下一版做单调性/APP_VERSION 递增比对的基线 |
| 真跑门的**接缝**：仓库级文件（如 `schema/unknown-authors.json`）用**环境变量**指回仓库唯一来源，并在开跑前**预检**被测脚本会读的仓库级路径 | 镜像根是仓库的**部分**副本；E 的 e2e 会读 `<repoRoot>/schema/unknown-authors.json` ⇒ 在镜像里找不到就报红（同一天主线跑同一份 `out/web` 是 151/151 全绿 —— 那条红纯粹是接缝，不是产物问题）。预检把「E 以后再加一个仓库级读取」变成**开跑前的响亮报错**，而不是它脚本深处一条莫名的红 |
| 开跑时**清理本次输出目录**：`web/`、`apk/` 整份删掉；`dist/` 只剪掉「本产物集之外」的文件 | 改了产物集（例如去边车）之后，**上一版留下的文件会一直躺在那里**，就绪检查每次都报「多出不该发布的条目」，而真因只是历史残留（负责人实测撞过）。为什么不整删 `dist/`：编译器是「成功后才 rename、失败不写产物」，整删就破坏了「编译失败保留旧版」，也弄丢下一版的基线（内容版本与 APP_VERSION 都从上一版 manifest 取） |

## 1. 范围与不做什么

**做**：把「一次发布要发生什么」写清楚，并**真能在本机跑一遍**——编译内容、构建 APK、准备 Web 部署目录、算哈希、做产物就绪检查（含两个真跑门），每步打印真实命令与关键数值，失败非零退出。

**不做**：创建/推送远端仓库、打 tag、创建 Release、启用 Pages、读取或生成签名私钥、配置 secrets、装设备（见 §10）。

**硬约束**：流水线**只写 `release/out/`**，不改 `content/`、`tools/`、`schema/`、`android/`、`web/` 里的任何文件。APK 与单测都在 `android/` 的**只读副本**里做；跑完 `git status --porcelain -- android web content tools schema` 为空。

## 2. 一次发布到底要发生什么

```bash
node release/build-release.mjs --tag 'v0.2.0+content-2026.10.16.5'     # 正式发布形态
node release/build-release.mjs --content-version 2026.10.16.5          # 本地演练形态
```

| 步 | 做什么 | 关键产物/事实 |
|---|---|---|
| 1 | 记前置事实：node/JDK/SDK、`git HEAD`、五个源目录是否干净、应用版本、**Web 站点版本 APP_VERSION**、已提交的 APK 内置内容版本、上次的 manifest（上一版基线来源） | 进 `release-manifest.json`；源目录脏 ⇒ 就绪检查报**黄** |
| 2 | 解析版本来源与单调性基线 | 例：`tag(v0.2.0+content-2026.10.16.5 → 应用 0.2.0 / 内容 2026.10.16.5)`；基线 `2026.10.16.4` |
| 3 | **编译内容，只此一次**：`node tools/build-content.mjs --out <out>/dist/content.json --order source --content-version <v> --minify --previous-version <v-1>` | `dist/content.json`（单行压缩）；编译器自己做校验与单调性闸。**失败不清空产物目录**，上一版原样保留 |
| 4 | 准备 Web 部署目录：按白名单复制 `web/` 的静态文件，把第 3 步那份 `content.json` **字节复制**过去 | `<out>/web/`（＝站点根），含 `content.json`（**必需**，内容单独取、不内联）；**不产边车** |
| 5 | 产出**远端小纸条清单**：`content/latest.json` + 快照 `content/<版本>/content.json` | 同一份字节；`--android-feed none` 只用于本地演练 |
| 0 | **变体与签名的前置检查**（在做任何事之前）：`--android-variant release` 时要求四项 `SUOFEI_*` 环境变量齐全，缺任何一项**立刻非零退出**（实测 `out/` 都不会被创建） | 不生成密钥、**不退回 debug 签名**；这一检查刻意放在最前面，避免做了一半才失败 |
| 6 | 构建 APK：复制 `android/` 到 `<out>/.work/android`，把同一份 `content.json` 写进副本的 `app/src/main/assets/content/content.json`，按变体跑 `assembleDebug` / `assembleRelease` | 从 APK 里把内置内容读回来比对（逐字节），不一致**当场失败**；release 时只记录「四项是否齐全」（**从不打印取值**），签名真伪交给 `apk-signing` 门 |
| 7 | 写 `release-manifest.json`（版本、来源、tag、基线、哈希、源提交、脏标记、应用身份、各步命令与耗时、产物清单、没做的事） | 就绪检查读它，但**不靠它当证据**（哈希全部重算） |
| 8 | 摘要 + 下一步：`node release/check-ready.mjs` | —— |

**顺序是硬需求**：`build` → `check-ready` **全绿**（含两个真跑门）→ 才允许把 tag / Release 指向这一版 → 才允许部署 Web。

## 3. 接口决定：版本号从哪来（**已拍板**）

**用户 2026-10-16 拍板（决策点 5 前半）**：发布 tag **同时带两个号**

```
v<应用资源版本>+content-<内容版本>       例如  v0.2.0+content-2026.10.14.2
```

- `APP_VERSION` ＝ Web 站点版本（SW 缓存键 `pc-resources-<APP_VERSION>`，必须先子）＝ 应用资源版本；
- `contentVersion` ＝ 内容版本（契约 §4.1：`YYYY.MM.DD.N`、逐段数值比较、**必须严格大于上一版**）。

行为：`--tag` 时**两个号都必须解析得出来**，缺号或形状不符 ⇒ 非零退出并打印期望格式（不猜默认）。`--content-version` / `--version-source date` 保留但只是**本地演练用途**，流水线会明说「正式发布以 tag 为准」。所有来源都是显式输入，没有默认值 —— 「发布锚点必须是人给的」。

发布前由就绪检查校验（§7）：`APP_VERSION` 在 `web/app/config.js` 与 `web/sw.js` **两处一致**（`app-version-agree`，并与 tag 里的应用版本对上）、`APP_VERSION` 比上一版**递增**（`app-version-bumped`，没有上一版记录时如实跳过并说明）、`contentVersion` 严格递增（`version-monotonic`）。

其它控制点：`--previous-version`（基线，显式给了就只用它）、`--source-date-epoch`（固定 `generatedAt`，让产物字节可复现）。

## 4. 产物清单：文件名 + 用途 + 谁消费

| 文件（`<out>`＝`release/out/`） | 内容 | 用途 | 消费者 |
|---|---|---|---|
| `dist/content.json` | **唯一一次编译**的规范产物（压缩 JSON，**无边车**） | 一切副本的源头；留档 | 人 / 流水线 |
| `web/`（整目录＝站点根） | `index.html`、`styles.css`、`manifest.json`、`sw.js`、`app/` | 部署到 Pages | 浏览器 |
| `web/content.json` | ＝`dist/content.json`（字节复制）；**必需** | Web 端**单独取**的内容（契约 §4：不得内联） | Web 端（SW 与壳同批缓存） |
| `web/content/latest.json` + `web/content/<版本>/content.json` | 远端小纸条清单（IF-22，含 `sha256` 字段）+ 快照 | Android 每次先取的小文件 | Android 端（D） |
| `apk/suofei-<内容版本>[-debug].apk` | 内置同版内容的 APK。文件名带 `-debug` 与否取决于 `--android-variant`：debug（默认）⇒ **debug 签名，不能用于正式发布**；release ⇒ 由四项 `SUOFEI_*` 环境变量签名（证书 DN 见 `apk-signing` 门） | 手动安装 / 挂 Release | 用户 |
| `release-manifest.json` | 本次发布的机器可读记录 | 审计、就绪检查输入之一、**下一版的基线**（内容版本 + APP_VERSION） | 人 / 流水线（**不进站点**） |
| `.work/` | 构建中间态：`android/`（只读副本）、`e2e/`（真跑门镜像根）、`logs/` | 只在构建/检查期用 | 无（可整个删） |

**部署白名单**（精确比对，多一个就红）：顶层只允许 `index.html`、`styles.css`、`manifest.json`、`sw.js`、`app/`、`content.json`、`content/`；`fixtures/`、`tests/`、`scripts/`、`node_modules/`、`README.md`、`.gitignore`、`package.json`、**`content.json.sha256`** **绝不发布**。必需项：顶层白名单 ∪ `content.json`，**并与 E 线的 `web/tests/lib/deploy.mjs: DEPLOY_FILES` 求并**（它改了发布集我自动跟上，不另写一份清单）。

## 5. 同源：一份字节，怎么保证不是「各建一次」

**只有一次编译**：`dist/content.json` 是三样产物唯一的源头，其它都是**字节复制**，每步复制后当场比对、就绪检查再重算一遍：

```
content/poems/*.md
      │  node tools/build-content.mjs --minify      ← 唯一一次编译
      ▼
dist/content.json ──字节复制──► web/content.json ──►（Web 单独取它）
      │                    └──字节复制──► web/content/<版本>/content.json ──►（Android 清单指向它）
      └──字节复制──► .work/android/app/src/main/assets/content/content.json
                     ├─► 进 APK（构建后从 APK 里读回来比对）
                     └─► Android 单测的输入（ContentParserTest 真解析它）
```

## 6. APK 与 Android 单测共用同一个只读副本

`release/lib/android-work.mjs`：

1. 把 `android/` 复制到 `<out>/.work/android`（排除构建缓存/IDE 状态）；按**源提交**记账，源码变了就重建。
2. 把本次发布的 `content.json` **写进副本的 `app/src/main/assets/content/content.json`**（逐字节校验）。这一个文件同时是两个消费者：APK 打包取它、`ContentParserTest` 用相对路径读它 ⇒ **一处替换、两处一致**。（早期用 Gradle init script 覆盖 `assets.srcDirs`，对单测**无效**：它不经过 assets 合并，会造成「APK 里是新内容、单测读的是旧内容」，已废弃。）
3. **代码一致性闸**：副本里的代码（`app/src/test`、`app/src/main/java`、`app/src/main/res`、`AndroidManifest.xml`、`*.gradle.kts`、`gradle.properties`）必须与仓库**逐字节一致**，否则拒绝构建/测试（`ANDROID_COPY_DIRTY`）。它防的是「改副本里的测试让它变绿」这种自欺，也防副本被别的改动污染 —— 只有 `app/src/main/assets` 是故意不同的。

**未验证**：只在 `assembleDebug` 上跑过；`assembleRelease` + 固定签名未跑（未授权）。

## 7. 产物就绪检查（条目总数由工具在汇总行自报：`（共 N 项）`）

`node release/check-ready.mjs` → 退出码 `0`＝全绿（可以推进），`1`＝有红项（**禁止推进**），`2`＝用法错误。`--skip-live`（不跑真跑门，**标黄不是绿**）、`--live-only`（只跑真跑门）、`--json`。

**语义**：**绿**＝查过且通过；**红**＝查过且不通过（必须修）；**黄**＝环境不可用/需人工确认（**没通过**）；**跳过**＝没查（不是「查过了」）。红/黄/跳过分别列出，绝不合并成「差不多就行」。

| # | id | 查什么 | 红了意味着什么 |
|---|---|---|---|
| 1 | `out-dir` | 产物目录存在且**完整**（缺 `dist`/`web` 直接报红并提示「上次构建可能失败」） | 还没构建，或上次构建失败/正在跑（产物目录只由本流水线管理，不要与别的构建共用 `--out`） |
| 2 | `manifest` | `release-manifest.json` 可解析、必需字段齐 | 构建没跑完/清单坏了 |
| 3 | `source-tree-clean` | 构建时的源树脏标记 | **黄**：本地演练可以，真发布必须先从干净提交构建 |
| 4 | `dist-json` | 规范产物可解析，打印首/末诗名、诗数、分组数 | 产物坏了 |
| 5 | `schema-validation` | **调用 `node tools/validate-content.mjs`**（C 线的 schema） | 产物不满足契约（**不写死字段清单**：契约一改就不会假红） |
| 6 | `format-version` | `formatVersion === 1`（IF-30） | 结构变了却没同步两端客户端 |
| 7 | `content-version-shape` | `YYYY.MM.DD.N` | 派生版本被当成发布版本发了 |
| 8 | `content-version-matches-manifest` | 产物 vs 清单 | 清单和产物不是同一次发布 |
| 9 | `version-monotonic` | 内容版本严格大于上一版 | 已更新的客户端不会采用它 |
| 10 | `poem-count` | 诗数 > 0 且与清单一致 | 空内容 / 产物与清单不符 |
| 11 | `order-in-source` | **数组次序** + `orderInSource` 严格升序 | 组内次序被弄错（此前真实发生过的系统性问题） |
| 12 | `dist-sha256` | 重算 sha256 与字节数 vs 清单 | 产物被改过 |
| 13 | `web-same-source` | 部署内容是 `dist` 的**字节复制** | APK 与 Web 发的不是同一份内容（核心事故） |
| 14 | `web-required-files` | **部署契约**：白名单∪`content.json`∪E 的 `DEPLOY_FILES` 都在部署目录里 | 站点缺文件（少 `content.json` ⇒ Web 没内容可读） |
| 15 | `app-version-agree` | **契约常量** `APP_VERSION`：`app/config.js` 与 `sw.js` 两处都写了、且相等；给了 tag 时还要与 tag 一致 | 站点缓存的版本键两处不一致 ⇒ 站点更新机制坏；或发布锚点与代码不一致 |
| 16 | `app-version-bumped` | `APP_VERSION` 比上一版大 | 同版本重发会让浏览器沿用旧 cache（无上一版记录时如实**跳过**：**真发布必须保留上一版的 `release-manifest.json`，否则这一项只能跳过**） |
| 17 | `web-no-unexpected` | 部署目录顶层精确比对（含 E 的发布清单顶层名） | 夹具/测试/脚本/边车泄漏到公开站点 |
| 18 | `android-manifest` | 清单字段齐、`sha256` 64 位小写十六进制、版本一致、`size` 与实际字节一致；**按 Android 端语义解析 `url`** 并核对它指回同一份字节 | Android 端会 404 / `SIZE_MISMATCH` / 拒绝更新 |
| 19 | `apk-present` | APK 存在且文件哈希与清单一致 | 三样产物少一样 |
| 20 | `apk-builtin-same-source` | **从 APK 里读回 `assets/content/content.json`** 与 `dist` 逐字节比对 | **最关键的一条**：用户以为发的是这一版内容，APK 里却是别的 |
| 21 | `apk-identity` | `aapt2 dump badging`：包名 == `dev.sopho.suofei`、`versionCode` == 清单 | 打错包名（发布后不可改） |
| 22 | `apk-signing` | 变体是 `release` ⇒ `apksigner verify --print-certs`：**证书不得是 debug 证书**（`CN=Android Debug` ⇒ 红），把证书 DN 打进回执；未签名/验不过 ⇒ 红；缺 apksigner ⇒ 黄。变体是 `debug` ⇒ **黄** + 明写「debug 签名，不能用于正式发布」 | 「以为发的是正式签名包、实际是 debug 包」（或压根没签名） |
| 23 | `live-web-e2e` | **真跑**：用 `out/web` 当站点跑 **E 自己的** `web/tests/e2e-cdp.mjs` | 页面/离线/更新流程真有断言失败 |
| 24 | `live-android-unit-tests` | **真跑**：Android JVM 单测，内置内容＝本次产物 | 产物让 Android 解析器读不进去，或仓库测试真有失败 |

### 7.1 两个「真跑」门（`release/lib/live.mjs`）

**Web e2e**：在 `<out>/.work/e2e/` 搭镜像根 —— `dist/content.json` 放本次产物（E 的脚本把 `repoRoot/dist/content.json` 当首选基座）、`docs/design/content-contract.md` 与 `tools/` 从仓库复制、`web/` 是仓库 `web/` 的镜像**再覆盖上 `out/web` 的全部载荷**。于是站点载荷 = `out/web`，内容基座 = `out/dist/content.json`，仓库里的 `web/content.json` 全程不参与。

**事后核对是机械的，不 grep 它的日志文本**（它改断言我这边不该假红）：E 的 harness 会把每个版本真发到 `<镜像根>/web/tests/artifacts/deploy/v1`，所以直接量那个目录 —— 里面的 `content.json` 必须与我的 `dist` 逐字节相同，`index.html`/`sw.js`/`app/*` 必须与 `out/web` 一致（只允许 `APP_VERSION` 一行被 harness 改成同一个值），且被测站点的 `APP_VERSION` 必须等于我构建的那一版。

**Android 单测**：在 §6 的只读副本里跑 `gradlew testDebugUnitTest --rerun-tasks -PextraMavenMirror=…`（本机 Gradle 到不了 `dl.google.com`/`mavenCentral`，`org.json` 走阿里云镜像；`--offline` 失败会自动去掉 `--offline` 重试一次并如实记录）。

**必须 `--rerun-tasks`（真踩过）**：`src/main/assets/**` **不是** `testDebugUnitTest` 的声明输入（测试运行时用相对路径读它），热缓存下 Gradle 直接 `UP-TO-DATE`/`FROM-CACHE` 什么也不跑。实测：故意把内置内容改成 18 首，**不带**该参数时退出码仍是 0（**静默通过**）；带上就按预期红。因此这一门还**再断言任务行不是 UP-TO-DATE/FROM-CACHE**。

**环境不可用 ⇒ 标黄并写明原因**（不许静默跳过、也不当通过）：找不到 Chromium（提示 `CHROME_BIN`）、找不到 JDK/SDK、Gradle 拉不到依赖、端口全被占、e2e 连汇总都没打印出来。**真跑起来但断言失败 ⇒ 红，并原样列出失败断言/用例名与完整日志路径**（`<out>/.work/logs/*.log`）。
⚠️ 边界（负责人已确认并让 E 修）：**E 的 e2e 在本机负载高时有偶发的时序敏感失败**。这一门**不因此被删**；红了先看失败点是不是时序相关，日志路径就在回执里。

**数字不写死**：这一层打印的任何计数（断言条数、用例数、诗数、异文数）都**取自本次运行结果** ——
回执里出现一个具体的数，就一定是这次跑出来的值（用例数取自 JUnit XML、断言数取自 e2e 的汇总行、
诗数与首末诗名取自本次产物），而不是源码里写死的常量。
（真踩过：收尾文案曾写死「Android 单测 49 例」而门实际跑到 55 例 ⇒「门是绿的、文案在说谎」——
这是最难查的一类假象，所以定成硬规则。）

**接缝（仓库级文件）**：镜像根是仓库的部分副本，而被测脚本可能读**仓库级**文件 —— 例如
`schema/unknown-authors.json`（匿名作者清单的唯一来源）。这类文件用**环境变量指回仓库**
（`REPO_FILE_ENV`：`schema/unknown-authors.json → UNKNOWN_AUTHORS_FILE`），**不复制进产物工作目录**
（否则会让人以为产物里该有 `schema/`）。开跑前还有一道**预检**：扫出被测脚本里所有
`resolve(repoRoot, …)` 读取，逐个确认够得着（镜像里已有 / 有环境变量指回），否则**开跑前报红**并要求
人工二选一；环境变量指向的文件缺失也报红。**一律不跳过、不降级成黄。**

**端口**：门在跑前用同步探针找一对空闲端口（`8137+`/`9237+`）并显式传 `TEST_PORT`/`TEST_DEBUG_PORT`。真踩过：并行的另一个会话占着默认 8137，我的站点没抢到端口，脚本却对着**别人的服务器**跑完了整套断言（报出 `pc-resources-0.3.0`、内容 `2026.10.14.1` —— 都不是本树的值），运气反过来就是**假绿**。

### 7.2 分工：什么由我查、什么由 E 的 e2e 查

| 层面 | 归谁 | 为什么 |
|---|---|---|
| 部署目录里**该有哪些文件**、`content.json` 是否单独取、边车是否泄漏、白名单有没有多出东西 | **我（静态，部署契约）** | 这是发布契约，不需要跑浏览器；且 E 一改内部结构我不该受影响 |
| **契约常量** `APP_VERSION` 两处一致、与 tag 一致、比上一版递增 | **我（静态）** | 用户明确要求「发布前校验两处写入」；只读这一个公开常量，**不读** `sw.js` 的数组/缓存名 |
| SW **行为**：预缓存清单是否完整、离线可读、新旧成对切换、旧 cache 被删、壳与内容成对 | **E 的 e2e**（我把它作为门真跑） | 那是 E 的实现与它的断言集；我复制一套必然漂移。我只负责「真跑、并机械核对被测的就是我的产物」 |
| Android 能否解析这份内容、次序/异文/空笔记等客户端约定 | **android/ 的单测**（我把它作为门真跑） | 同上：跑它的测试，不复制它的断言 |

这套分工的由来见 §9.3.1（我曾在主线报过一次假红）。

两条明确的「不重复」：

- **不把 `tools/check-bundled-content.mjs` 包进我的检查**（负责人要求，我同意）。它管的是「**仓库里已提交的内置产物** vs 当前内容源」——那是**仓库一致性**，属于发布前的 CI 前置门；我这一层的对应保证是「**本次发布的每一处副本都与 `dist` 逐字节相同**」（`web-same-source` + `apk-builtin-same-source` + Android 单测注入的就是本次产物）。两者是不同的问题，包一层只会让「红在哪」变模糊。建议：CI 里**先**跑它的门，再跑发布流水线。
- **匿名作者清单**：我的检查**不引用**那份清单（不解析契约散文）；读契约 §2.1 散文那份清单的是 E 的 e2e。用户已拍板清单的机器可读来源改为 `schema/unknown-authors.json` ⇒ 需要改的是 E 的 e2e，不是我的层。

### 7.3 变体与签名（CI 注入 / 本地演练 / debug 永不发布）

| 事项 | 约定 | 谁做 |
|---|---|---|
| 正式签名密钥 | 四项：`SUOFEI_KEYSTORE` / `SUOFEI_KEYSTORE_PASSWORD` / `SUOFEI_KEY_ALIAS` / `SUOFEI_KEY_PASSWORD`（`SUOFEI_KEYSTORE` 在本地是 `.jks` 的路径，在仓库 secrets 里是它的 base64）。**约定见 [`docs/design/ci-and-signing.md`](ci-and-signing.md)**；CI 侧见 `.github/workflows/release.yml`；生成密钥并写 secrets 的脚本是 `release/init-signing-key.sh`（密钥落在**仓库之外**，如 `~/.suofei/`，全程不打印取值） | 用户/负责人（生成与写入）；CI（注入） |
| 本地开发与验收 | 用默认的 `--android-variant debug`（`assembleDebug`，debug 签名） | 任何人 |
| 本地验证**签名链路本身** | 用一枚测试密钥（或负责人授权下的正式密钥）跑 `--android-variant release` + `check-ready`，看 `apk-signing` 报出的证书 DN | 负责人/用户 |
| 正式发布 | 必须 `--android-variant release` + 四项齐全；**debug 变体永不用于正式发布** | CI |
| 缺环境变量 | `build-release.mjs` 在**动任何东西之前**非零退出并列出缺哪几项；**不生成密钥、不退回 debug 签名** | 流水线（fail-closed） |
| 签名真伪 | 就绪检查的 `apk-signing` 门（§7 第 22 项）：release 变体断言「能验签且证书不是 debug 证书」并把 DN 打进回执；debug 变体如实标黄 | 流水线 |
| 本工作线**不做** | 不生成密钥、不写 secrets、不执行 `release/init-signing-key.sh`；**不在文档或输出里写任何密钥取值**（只写证书 DN 与「四项是否已设」的布尔） | — |

**验证状态（2026-10-14 更新）**：

- **release 变体的「签名成功路径」已实测通过**：负责人本机用生成的正式密钥跑 `assembleRelease` 得到
  `app-release.apk`（**7,029,170 字节**），`apksigner` 读出 **`CN=Suofei, OU=suofei, O=WSQS, C=CN`**。
  我在本地用**同一枚密钥**复核了整条链路（`--android-variant release` → `check-ready`）：
  `apk-signing` **绿**，回执里的 DN 正是 `CN=Suofei, OU=suofei, O=WSQS, C=CN`，整轮 `绿 23 / 黄 0 / 跳 1 / 红 0`。
- **CI 路径仍未验证**：`secrets` 注入 + `.github/workflows/release.yml` 的端到端没有跑过（真正推 tag 才会跑）。
- 其余已验证：缺环境变量 ⇒ fail-closed（**动任何东西之前**就停，`out/` 都不会被创建）；debug 变体全门通过且如实标黄；
  两个反例 —— 把 debug 证书的包当 release 产物 ⇒ 红并打出 `CN=Android Debug, O=Android, C=US`；
  未签名的 release 产物 ⇒ 红（`DOES NOT VERIFY / Missing META-INF/MANIFEST.MF`）。

### 7.4 CI 的前置条件（本流水线对 workflow 的接口要求）

`.github/workflows/release.yml` 现在按这个接口调我（**接口对得上**：`--tag` + `--android-variant release`、
`check-ready --out release/out`、Pages 用 `release/out/web`、Release 附 `release/out/apk/*.apk`、`CHROME_BIN` 已设）。
但**静态读它能看出两个会让「第一次 tag」失败的前置条件**（2026-10-14 观察，**未在 CI 上实跑**）：

| # | 前置条件 | 现状 | 修法（二选一） |
|---|---|---|---|
| 1 | 就绪检查的 `schema-validation` 要跑 `tools/validate-content.mjs`，它需要项目本地 `ajv` | workflow 里**没有** `npm ci`/`npm install` 步骤 ⇒ 这一门会**红**（我的门是 fail-closed，不会静默降级） | 在「就绪检查」之前加一步 `npm ci`（ajv 是 devDependency，不进仓库） |
| 2 | 本流水线默认给 Gradle 传 `--offline`（正式构建不该悄悄依赖网络） | workflow **没传** `--online`，而 GitHub runner 是**冷 Gradle 缓存** ⇒ 缺依赖会失败 | 给 `build-release.mjs` 传 `--online`，或先跑一步预热 Gradle 缓存 |

另外两条已经满足：`CHROME_BIN`（真跑门用）、`apksigner`/`aapt2`（来自 setup-android 装的 build-tools）。
CI 侧真正跑通之前，**不要把「CI 发布路径」当成已验证**（见 §12）。

## 8. 失败 / 中断了怎么办

**共同不变量：不推进最新版，旧版本一个字节都不动、仍然可下载可读。**

| 情形 | 流水线行为 |
|---|---|
| 版本来源解析失败（tag 缺号/形状不符） | 非零退出，打印期望格式；**不产物、不动旧产物** |
| 内容编译失败（契约校验/单调性） | 非零退出；编译器**失败不写产物**，且流水线**不删 `dist/`** ⇒ 上一版的**规范产物与 `release-manifest.json`（下一版的基线）逐字节保留**（实测）。派生物 `web/`、`apk/` 在开跑时已被清掉，所以此时 `out/` 是不完整的 —— 就绪检查会据此报「产物目录不完整（缺 web）」而不是一堆莫名其妙的红 |
| `--android-variant release` 缺签名环境变量 | **在动任何东西之前**非零退出（`SIGNING_ENV_MISSING`），列出缺哪几项；**不生成密钥、不退回 debug 签名**（实测：`release/out` 都不会被创建） |
| 复制后字节不一致 / APK 注入没生效 / 副本代码被改 | 非零退出（`COPY_MISMATCH` / `APK_CONTENT_MISMATCH` / `ANDROID_COPY_DIRTY`） |
| Gradle 构建失败 | 非零退出 ⇒ 无 APK ⇒ 就绪检查必红 |
| 就绪检查有红项 | 非零退出，列出红项，明说「不推进最新版；旧版仍可下载」 |
| 真跑门跑不起来（环境） | 标**黄**并写明原因；结论行明确说「真跑门未全绿 ⇒ 页面/客户端是否真能跑没被完整证明」 |
| 部署了一半 | **本流水线不管部署**；见下 |

**不声称原子性**：GitHub Pages 部署是一批静态文件，**没有**「三样产物一起生效」的保证，CDN 缓存/生效延迟由服务商决定；Release APK 与站点内容的生效也不是同一个原子动作。可接受的策略是「先内容后 APK」或「先 APK 后内容」。流水线保证的是**同一份字节**，不是「同时生效」。

**部署侧要求（我没部署权限，只写要求）**：一次发布 = 新 `content.json` + **递增的 `APP_VERSION`**（`web/app/config.js` 与 `web/sw.js` **两处**）+ **同批发布**（不能只换服务器上的 `content.json`）；**`sw.js` 不要设长 `max-age`**（否则浏览器拿不到新 SW）。

## 9. 跨线发现（本流水线未擅自改别人的文件）

### 9.1 IF-22 的 `url` 语义（**已由负责人修正文档**）

`ContentUpdater.resolveUrl(manifestUrl, manifest.url)` 用**清单自己的 URL** 作基址解析；示例写成 `content/<版本>/content.json` 会解析成 `…/content/content/<版本>/…`（404）。本流水线产出**相对清单所在目录**的 `<版本>/content.json`（唯一定义处 `release/lib/artifacts.mjs: androidSnapshotUrl()`），并就绪检查按 Android 端语义解析回来验证。负责人已改正文档，此条闭环。

### 9.2 两端更新协议（**已拍板**）

Web 的内容更新交给 SW 生命周期（内容与壳同一次部署、同一份预缓存清单、同一个 cache）；Android 保留小纸条清单。本流水线据此：默认产出清单、不再加分支；**Web 侧边车彻底去掉**。

### 9.3 演练/返修中抓到的真问题

1. **我解析了 E 的内部结构 ⇒ 在主线上报过一次假红**（已修）。E 重写 `sw.js`（`SHELL` → 同一份预缓存清单、内容与壳成对）后，我那条「按常量名找预缓存数组」的检查在主线上报了 `[红] 从 sw.js 里没解析出 SHELL 预缓存清单` —— 报得没错（没静默放过），但根因是我在断言**别人文件的内部形状**。现在：静态层只断言**部署契约**与**契约常量 `APP_VERSION`**，SW 行为交给 E 的 e2e（§7.2）。
2. **「内置产物是旧的」＋「测试断言写死了异文条数」—— 已清零（负责人修的，我的门是发现它的那道）**：
   当时仓库里**已提交的内置产物**停在 **13 条异文（`2026.10.16.4`）**，而 `dist`/内容源已是 **21 条**；
   `ContentParserTest.variants_areParsedButNeverEnterStanzas` 又断言第 9 首《庭中有奇树》**恰好 1 条**异文。
   两个错配叠在一起：单测读的是**旧内置**、看着全绿；而我的门把**本次发布的内容**注入副本后立刻炸
   （`54 tests completed, 1 failed`，`expected:<1> but was:<2>`）——**我的门正是靠「注入本次发布的内容」把这件事暴露出来的**。
   负责人已修完并合入：① 重编并把内置/本地内容同步到 21 条（`.7`）；② 那条断言从「恰好 1 条」改成**内容断言**
   （至少一条、含「贵」、正文含「贡」且不含「贵」）；③ 新增 `tools/check-bundled-content.mjs`（内置产物 vs 内容源逐字段比对，实测对 19 首/21 条通过，反向验证也做过）。
   **实测复核**：对齐主线后 `live-android-unit-tests` = **54 例 / 0 失败**。
   我没改 `android/`：不在我的写入范围，且 §6 的代码一致性闸正是为这种情况设的。
3. **Gradle 缓存的静默通过**：见 §7.1。任何人手跑单测验证内容改动时都应加 `--rerun-tasks`。
4. **并行的另一个会话会让门测到别人的站点**：见 §7.1 的端口处理。
5. **编译失败会清空产物目录**（我自己的缺陷）：已修，见 §0/§8。
6. **真跑门的接缝：镜像根缺仓库级文件 ⇒ 假红（已修，归我的层）**。
   E 的 e2e 改为从**机器可读的唯一来源** `schema/unknown-authors.json` 读匿名作者清单（默认 `<repoRoot>/schema/unknown-authors.json`，并支持 `UNKNOWN_AUTHORS_FILE` 覆盖）。
   我的镜像根 `release/out/.work/e2e/` 只是仓库的**部分**副本（`dist/ docs/ tools/ web/`）⇒ 那里没有 `schema/`，于是被测脚本报「唯一来源清单文件存在」红。
   **关键判据：那不是产物问题** —— 同一天在主线拿同一份 `out/web` 跑 E 的 e2e 是 **151/151 全绿**。
   修法（采纳负责人的**方案 A**）：起 e2e 时传 **`UNKNOWN_AUTHORS_FILE=<仓库根>/schema/unknown-authors.json`**，让被测脚本读**仓库的唯一来源**；
   **不**把 `schema/` 复制进产物工作目录（免得后人以为「产物里该有 schema/」）。
   并加了一道**预检**：扫出被测脚本里所有 `resolve(repoRoot, …)` 的仓库级读取，逐个确认「镜像根里够得着」或「有环境变量指回仓库」，否则**开跑前就红**并给出二选一的修法；环境变量指到的文件**必须存在**，缺了也红（**绝不跳过、绝不降级成黄**），失败信息里写出实际传给它的路径。
   实测：修好后 `live-web-e2e` = **151/151** 绿。
## 10. 需要用户单独授权的步骤（一个都没做）

| 步骤 | 对应 | 授权前流水线会怎样 |
|---|---|---|
| 创建/推送公开仓库、定仓库名 | A4.1 / IF-13 | 不做；产物只在本地 `release/out/` |
| 启用 GitHub Pages、定部署地址 | A4.2 | 不做；清单里是**相对**地址，不绑定站点 URL |
| 打 tag / 挂 Release | A4.3 | 不做；`--tag` 只**解析** tag 名（本机没有该 tag 时只提示，不创建） |
| 固定签名 | A4.4 | 不做；APK 是 debug 签名（清单里 `signed: false`） |
| 装到真机/模拟器验收 | A5 | 不做（一次都没做过） |

## 11. 本地演练证据（真实命令与输出）

工作树 `C:\Users\wsqsy\Documents\android\.sopho-wt\f-003ac2f6`（分支 `wt/f-003ac2f6`，含 G 线补核后的 19 首 / 21 条异文）。

### 11.1 主路径（tag 作发布锚点）—— **本轮红项清零**

> 下面的哈希是**那一次演练**的产物字节；不固定 `SOURCE_DATE_EPOCH` 时 `generatedAt` 会变，
> 所以同一份内容重编也会得到不同的哈希（这正是 `--source-date-epoch` 存在的理由）。

```bash
$ node release/build-release.mjs --tag 'v0.1.0+content-2026.10.16.11'      # exit 0
[2/8] 本次 contentVersion: 2026.10.16.11
      ← 来源：tag(v0.1.0+content-2026.10.16.11 → 应用 0.1.0 / 内容 2026.10.16.11)
      单调性基线（上一版）: 2026.10.16.9  ← 来源：已提交的内置内容
[3/8] 产物: dist/content.json  23011 字节  sha256=3898634603fc69275c1aebf64d9434d1c9c80877cdad2609acec7c341c2b3f85
[4/8] 部署内容: content.json 23011 字节（与 dist 字节一致）；Web 侧**不产出** sha256 边车
[6/8] APK 内置内容校验: assets/content/content.json 23011 字节 sha256=38986346… == dist ✓
      APK: apk/suofei-2026.10.16.11-debug.apk  9568808 字节  sha256=eccb9f1edab74d3c…

$ node release/check-ready.mjs                                             # 61s，**exit 0**
[绿] live-web-e2e              通过 151 / 151（37s，真 Chromium，端口 8137/9237）
       基座 = out/dist/content.json（sha256 38986346…），站点载荷 = out/web（APP_VERSION=0.1.0）
       接缝：UNKNOWN_AUTHORS_FILE → schema/unknown-authors.json（镜像根故意不带 schema/，指回仓库唯一来源）
       机械核对：E 发的 v1 目录里 content.json 与 dist 逐字节相同；index.html/sw.js/app/* 与 out/web 一致
[绿] live-android-unit-tests   用例 55 / 失败 0 / 跳过 0（23s，真 JVM）
       本次产物是 19 首（首＝行行重行行、末＝明月何皎皎）；ContentParserTest 真解析的就是它
[跳] app-version-bumped        没有上一版记录（首次发布 / 换了产物目录）⇒ 无法自动判断是否递增
绿 22 / 黄 0 / 跳过 1 / 红 0
结论：**三样产物就绪**（本地演练口径）。可以推进「最新版」。
本轮含真跑：E 线的 Web e2e（真无头 Chromium，站点＝out/web 的构建产物，实测 151/151）+
  Android JVM 单测（内置内容＝本次产物，强制 --rerun-tasks，实测 55 例 / 失败 0）。
   ↑ 这两个数字来自**本次运行**（e2e 汇总行 / JUnit XML），源码里没有写死的条数
```

**本轮红项清零**：唯一的红（真跑门的接缝，§9.3.6）修好后两个真跑门都绿。
`app-version-bumped` 是**跳过**（本次演练没有上一版 manifest）；按已定规则，**真发布必须保留上一版的
`release-manifest.json`**，否则这一项只能跳过 —— 它不会被当成通过。
另外这次还实测到单调性闸的反向：用 `.8` 重发（基线已到 `.9`）被拒，且 `out/` 变成「不完整」，
就绪检查准确报「产物目录不完整，缺：web」。

**演练约定（真踩过）**：想用**同一个 `APP_VERSION`** 重跑演练时，先 `rm -rf release/out`（或换个 `--out`）。
否则上一版 `release-manifest.json` 还在 ⇒ `app-version-bumped` 会按规则报红「APP_VERSION 没递增
（本次 0.1.0 ≤ 上一版 0.1.0）」—— 那是**正确**的红（真发布确实不该同版本重发），不是流水线的毛病。

### 11.2 拒绝路径（fail-closed）

```bash
$ node release/build-release.mjs --tag 'v0.2.0'          # 缺内容版本号
用法错误：tag 名解析不出两个版本号：v0.2.0
  期望格式：v<应用资源版本>+content-<内容版本>，例如 v0.2.0+content-2026.10.14.2
  （缺号或形状不符一律拒绝 —— 不猜、不填默认）                             exit=2

$ node release/build-release.mjs --tag 'v0.9.9+content-2026.10.16.6' --out <demo>   # tag 与代码不符
[红] app-version-agree  tag 里的应用版本 0.9.9 ≠ 代码里的 APP_VERSION 0.1.0
                        —— 发布锚点与代码不一致（改代码或改 tag）

$ node release/build-release.mjs --tag 'v0.1.0+content-2026.10.16.1'   # 内容版本比上一版旧
  - <cli>: [VERSION_NOT_MONOTONIC] contentVersion 必须单调递增：新版本 2026.10.16.1 不大于上一版 2026.10.16.5
未产出任何内容文件（失败保留旧版本）。                                    exit=1
# 事后核对：release/out/dist/content.json 的哈希与失败前逐字节相同，release-manifest.json 仍在
```

### 11.3 真跑门有牙齿 / 环境边界

```bash
# 故障注入：产物少一首（dist 与 web 同步，静态检查自洽）
$ node release/check-ready.mjs --live-only --out release/out-bad
[红] live-web-e2e           e2e 真跑了并失败：通过 136 / 140
[红] live-android-unit-tests 真跑了并失败（3 个用例：arrayOrderEqualsSourceOrder / search / parsesAndKeepsCompiledOrder）
绿 0 / 黄 0 / 跳过 0 / 红 2

# 明确不跑 ⇒ 黄，不是绿
$ node release/check-ready.mjs --skip-live
[黄] live-web-e2e / live-android-unit-tests：本次用 --skip-live 跳过（没跑，不是通过）
绿 21 / 黄 2 / 跳过 0 / 红 0

# 防自欺：把副本里的测试断言改松 → 拒绝跑
[红] live-android-unit-tests  准备 Android 副本失败：Android 副本里的代码与仓库不一致（1 处）：
       - app/src/test/java/dev/sopho/suofei/ContentParserTest.kt：副本与仓库内容不同

# APP_VERSION 递增门（有基线时）：内容发新版但站点版本没动
[红] app-version-bumped  APP_VERSION 没递增：本次 0.1.0 ≤ 上一版 0.1.0
                         （内容与壳在同一个 pc-resources-<APP_VERSION> cache 里成对切换）
```

### 11.3.1 实测到的「偶发时序失败」（E 的 e2e，同一份产物）

同一份产物、同一套代码，连跑三次 `check-ready`：

| 第几次 | 结果 | 失败点（原样） |
|---|---|---|
| 1 | 通过 140/140 | —— |
| 2 | 通过 139/140 → 红 | `4 真发两版…· 旧站点缓存仍在`：`actual=["pc-resources-0.1.0","pc-resources-0.2.0"] expected=["pc-resources-0.1.0"]`（旧 cache 还没被删就断言了） |
| 3 | 通过 140/140 | —— |

结论：**这是 E 自己那条断言的时序敏感**（负责人已确认并让 E 修），不是我的产物问题（我的机械核对三项都通过）。
门**不因此被删**：它把这失败原样列出来（含实际/期望值）并提示「怀疑偶发就重跑 `--live-only` 再定」——
**红了照样算红，不算通过**。

### 11.3.2 开跑清理残留 / 编译失败保留旧版（本轮新增的两条实测）

```bash
# 复现负责人撞到的那次：上一版构建留下的陈旧边车 + dist 里的旧文件
$ touch release/out/web/content.json.sha256 release/out/dist/content.json.sha256
$ node release/build-release.mjs --tag 'v0.1.0+content-2026.10.16.5'
[1/8] 清理上次残留: 3 项
      · 删除 release/out/web/（上一版派生物，12 个文件）
      · 删除 release/out/apk/（上一版派生物，1 个文件）
      · 删除 release/out/dist/content.json.sha256（不在本次产物集里）
# 之后 web-no-unexpected 绿：7 个顶层条目（app content content.json index.html manifest.json styles.css sw.js）

# 「编译失败保留旧版」仍然成立（只清派生物，不动规范产物与基线）
$ node release/build-release.mjs --tag 'v0.1.0+content-2026.10.16.1'     # 内容版本倒退
  - <cli>: [VERSION_NOT_MONOTONIC] …新版本 2026.10.16.1 不大于上一版 2026.10.16.5
  未产出任何内容文件（失败保留旧版本）。                                  exit=1
# 核对：dist/content.json 与 release-manifest.json 的哈希与失败前逐字节相同；
#       派生物 web/、apk/ 已被清掉 ⇒ out/ 变成「不完整」，就绪检查会说：
[红] out-dir  产物目录不完整，缺：web（上次构建可能失败或正在跑…）
```

E 的 e2e 在合并 E 线后续提交后已到 **147 条**，本轮实测 **147/147**；§11.3.1 那张表是更早那次（140 条时代）的同一现象。

### 11.4 其它已实测的路径

```bash
# 产物字节可复现：固定 SOURCE_DATE_EPOCH 两次编译字节相同；不固定则不同（generatedAt 变）
# 旧的三次静态红仍在：产物未构建（20 红/2 跳）、--skip-apk（红 1）、APK 内置内容不同源（红 1，只有那一项）
# 压缩对比：同一份内容 格式化 26029 字节 → 压缩 20964 字节（-19.5%）
```

演练中修好的自家缺陷（都留了断言）：init script 占位符只替换第一处导致 assets 全空（已彻底弃用该机制）；`--out` 写成仓库相对路径；显式 `--previous-version` 被本地旧 manifest 盖掉；`import` 即跑主流程；`gradlew.bat` 没经 `cmd.exe` 导致 `spawnSync EINVAL`；**编译失败清空产物目录**；**相对 outDir + cwd 叠成两层路径**；**按名字解析 E 的 `sw.js`（假红）**。

## 12. 已验证 / 未验证

**已验证（本机实跑，可复现）**

- tag 双号解析（含缺号/形状不符的拒绝路径）；`--content-version` 演练路径仍可用。
- 真实 19 首/21 条异文编译为**压缩产物** 20964 字节；单调性闸通过；**编译失败保留旧产物**（哈希逐字节不变）。
- Web 部署目录准备（字节一致、白名单精确、**无任何边车**）；`app-version-agree` 两处一致 + 与 tag 一致。
- APK 构建 + **从 APK 读回 assets 与 `dist` 逐字节相同**；APK 身份 `dev.sopho.suofei` / versionCode 1 / 应用名「索斐」。
- **变体与签名**：**release 成功路径已实测**（2026-10-14，负责人本机的正式密钥与我用同一枚密钥的复核）：`assembleRelease` 成功、APK 7,029,170 字节、`apk-signing` 绿并报出 `CN=Suofei, OU=suofei, O=WSQS, C=CN`、整轮 `绿 23 / 黄 0 / 跳 1 / 红 0`；**CI 路径（secrets + workflow）未验证**。`--android-variant release` 缺环境变量 ⇒ 动任何东西之前就非零退出（实测 `out/` 未被创建）；`--android-variant debug`（默认）全门通过，`apk-signing` 如实标黄「debug 签名，不能用于正式发布」，结论行也改成「演练口径就绪」。反例两条都实测红：伪装成 release 变体的 debug 证书包 ⇒ 红并打出 `CN=Android Debug, O=Android, C=US`；未签名的 release 产物（本树里 `assembleRelease` 的产出）⇒ 红 `DOES NOT VERIFY / Missing META-INF/MANIFEST.MF`。
- **真跑门（本轮全绿）**：E 的 Web e2e **151/151**（真无头 Chromium，站点＝`out/web`，机械核对被测站点就是本次产物；仓库级来源用 `UNKNOWN_AUTHORS_FILE` 指回 `schema/unknown-authors.json`）；Android JVM 单测 **55 例 / 0 失败**（真执行，内置内容＝本次产物）。整轮 `check-ready` = 绿 22 / 黄 0 / 跳 1 / 红 0，退出码 0。
- 红/黄路径：tag 缺号、tag 与代码不一致、内容版本倒退、产物未构建、`--skip-apk`、APK 不同源、产物少一首（两门同时红）、`--skip-live`（黄）、副本被改（拒跑）、APP_VERSION 未递增。
- 跑完五个源目录 `git status` 干净。

**未验证（不要当成已成立）**

- **没有推任何远端、没有 tag、没有 Release、没有 Pages**；`--tag` 只解析名字，本机**没有任何 tag**（所以 tag 候选的解析是"名字级"验证，不是在真实 tag 对象上跑的）。
- **没有在真实 Pages（https + 子路径）上部署过**；子路径下的相对路径**按代码应该成立但没实测**。
- **APK 是 debug 签名**；`assembleRelease`、覆盖升级（`versionCode` 增长）没跑过。
- **没有在真机/模拟器上装过**：能否安装、内置内容能否被阅读器读出来、更新能否连真实站点，都没验证。单测/真跑门证明的是「解析器/页面能处理这份字节」，**不等于「设备上体验正确」**。
- **E 的 e2e 在本机负载高时有偶发时序敏感失败**（负责人已确认并让 E 修）；这一门如实呈现失败点，但「偶发红」不等于产物坏，也不等于通过。
- 未做故障注入以外的失败路径演练（磁盘满、Gradle 中途崩、杀进程）；未在干净机器/CI 上跑过（CI 会撞本机那个到不了 `dl.google.com` 的 Gradle 代理，真跑门已内置 `-PextraMavenMirror`）。
- **端口并发**：门用的是「跑之前探测到的空闲端口」；两个会话几乎同时探到同一个空闲端口仍有极小竞态（探针→启动之间）。

## 13. 脚本清单与调用方式

```bash
node release/build-release.mjs --tag 'v0.2.0+content-2026.10.16.5'  # 正式发布形态（tag 双号）
node release/build-release.mjs --tag 'v0.2.0+content-2026.10.16.5' --android-variant release   # 正式发布变体（要四项 SUOFEI_*）
node release/build-release.mjs --content-version 2026.10.16.5       # 本地演练（正式发布以 tag 为准）
node release/build-release.mjs --version-source date                # 演练：日期+当日递增
node release/build-release.mjs --out release/out --skip-apk         # 只出内容/Web（就绪检查会因缺 APK 报红）
node release/build-release.mjs --android-feed none                  # 不产出小纸条清单（仅演练）
node release/build-release.mjs --source-date-epoch 1760000000       # 让产物字节可复现
node release/check-ready.mjs                                        # 就绪检查（条数见其汇总行；0=可以推进，1=禁止推进）
node release/check-ready.mjs --skip-live                            # 不跑两个真跑门（标黄，不是绿）
node release/check-ready.mjs --live-only                            # 只跑真跑门
node release/check-ready.mjs --out <dir> --json                     # 指定产物目录 / 机器可读结果
```

两个脚本**退出码**一致：`0` 成功/就绪，`1` 构建失败/有红项（**禁止推进最新版**），`2` 用法错误。（`import` 两者都不会触发主流程。）

| 文件 | 作用 |
|---|---|
| `release/build-release.mjs` | 8 步编排；只写 `<out>`；打印真实命令与关键数值；失败非零退出 |
| `release/check-ready.mjs` | 就绪检查（含 2 个真跑门；条数由汇总行自报）；绿/黄/跳过/红 + 结论；`--skip-live`/`--live-only`/`--json` |
| `release/lib/artifacts.mjs` | **产物布局、部署白名单、必需项的唯一处**（build 与 check 共用，防漂移） |
| `release/lib/version-source.mjs` | **tag 双号解析**、内容版本来源候选项、单调性基线解析 |
| `release/lib/android-work.mjs` | Android 只读副本、内容注入、**代码一致性闸** |
| `release/lib/live.mjs` | 两个**真跑门**（E 的 e2e 镜像根与机械核对 / Android 单测与静默通过防线） |
| `release/lib/zip.mjs` | 零依赖最小 zip 读取器（从 APK 读回内置内容） |
| `release/lib/util.mjs` | 哈希/进程/文件/打印；仓库根固定，从任何 cwd 调用结果一致 |
| `release/.gitignore` + `release/README.md` | 忽略 `/out/`（**不动根 `.gitignore`**）；面向人的用法说明 |
