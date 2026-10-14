# 发布流水线设计（工作线 F）

- 状态：**设计 + 本地演练通过**（2026-10-14 建立，2026-10-16 按要求加「真跑」门与压缩产物）。
  **未推远端、未签名、未发布**（公开发布需用户单独授权，见 §10）。
- 依据：`CONTEXT.md` 的发布硬需求（tag 触发「最新 JSON + Web + 内置同版内容的 APK」三样产物；**等产物全部构建/检查就绪再推进最新版**；不声称不同发布服务具有绝对原子性；APK 固定签名支持覆盖升级、密钥不入公开 Git）、`AGENTS.md`、契约 §2/§4/§4.1（产物形状、版本语义、**Web 更新改为交给 SW 生命周期**）、IF-16/IF-19/IF-22/IF-26/IF-30。
- 实现：`release/build-release.mjs`（构建）、`release/check-ready.mjs`（就绪检查）、`release/lib/`（共享约定与两个真跑门）、`release/README.md`。
- 本文件只讲**发布**，不讲内容格式与两端各自的离线实现。

## 0. 本轮（2026-10-16）改了什么

| 改动 | 为什么 |
|---|---|
| 产物改**压缩 JSON**（`--minify`） | 站点/APK 传的就是这份字节（实测 26029 → 20964 字节，**-19.5%**）；且仓库里已提交的 Android 内置产物也是压缩的，不压缩就会每次发布都产生无谓的格式差异 |
| 加两个**真跑门**：Web e2e（真 Chromium，站点＝`out/web`）+ Android JVM 单测（内置内容＝本次产物） | 之前全是静态断言（文件在不在、字节一不一致），**不证明页面能跑、也不证明产物能被客户端解析** |
| 跟随契约 §4（用户 2026-10-16 拍板）：Web 的 `content.json.sha256` 边车**不再必需**；`sw.js`/`app/config.js` 的检查改成**结构无关**的比对 | Web 的内容更新交给 SW 生命周期，不再有独立内容版本通道；检查不能假设旧机制（否则一改就假红） |
| Android 侧从小纸条清单**保持**（`--android-feed manifest` 成为最终形态，不再有分支判断） | 决策点 2 已拍板：Android 保留清单，Web 不再需要独立通道 |
| Android 构建副本从「Gradle init script 覆盖 `assets.srcDirs`」改成**直接替换副本的源码 assets**，并加**代码一致性闸** | 单测用相对路径直接读 `app/src/main/assets/content/content.json`，init script 覆盖对它无效（会出现「APK 里是新内容、单测读的还是旧内容」）；顺便去掉一类静默失败 |

## 1. 范围与不做什么

**做**：把「一次发布要发生什么」写清楚，并**真能在本机跑一遍**——编译内容、构建 APK、准备 Web 部署目录、算哈希、做产物就绪检查（含两个真跑门），每步打印真实命令与关键数值，失败非零退出。

**不做**：创建/推送远端仓库、打 tag、创建 Release、启用 Pages、读取或生成签名私钥、配置 secrets、装设备（全部需用户单独授权，见 §10）。

**硬约束**：流水线**只写 `release/out/`**，不改 `content/`、`tools/`、`schema/`、`android/`、`web/` 里的任何文件（只读取/调用它们）。APK 与单测都在 `android/` 的**只读副本**里进行；跑完 `git status --porcelain -- android web content tools schema` 为空。

## 2. 一次发布到底要发生什么

`node release/build-release.mjs --content-version 2026.10.16.5` 的 8 步：

| 步 | 做什么 | 关键产物/事实 |
|---|---|---|
| 1 | 记前置事实：node/JDK/SDK、`git HEAD`、五个源目录是否干净、应用版本、**已提交的 APK 内置内容版本** | 进 `release-manifest.json`；源目录脏 ⇒ 就绪检查报**黄** |
| 2 | 解析 `contentVersion`（来源可配置、**无默认值**，见 §3）与单调性基线（默认取「已提交内置内容版本」与「上次 manifest」的较大者） | 例：`2026.10.16.5`，基线 `2026.10.16.4` |
| 3 | **编译内容，只此一次**：`node tools/build-content.mjs --out <out>/dist/content.json --order source --content-version <v> --minify --previous-version <v-1>` | `dist/content.json`（单行压缩）+ `.sha256` 边车；编译器自己做校验与单调性闸 |
| 4 | 准备 Web 部署目录：按白名单复制 `web/` 的静态文件，再把第 3 步那份 `content.json` **字节复制**过去 | `<out>/web/`（＝站点根），含 `content.json`（**必需**，内容单独取、不内联）与可选边车 |
| 5 | 产出**远端小纸条清单**（决策点 2 已定：Android 保留）：`content/latest.json` + 快照 `content/<版本>/content.json` | 同一份字节；`--android-feed none` 只用于本地演练 |
| 6 | 构建 APK：复制 `android/` 到 `<out>/.work/android`，把同一份 `content.json` 写进副本的 `app/src/main/assets/content/content.json`，`assembleDebug` | APK 内置内容必须与 `dist/content.json` **逐字节相同**（从 APK 里读回来比对），否则**当场失败** |
| 7 | 写 `release-manifest.json`（版本、来源、基线、哈希、字节数、源提交、脏标记、应用身份、各步命令与耗时、产物清单、跳过项、没做的事） | 就绪检查读它，但**不靠它当证据**（哈希全部重算） |
| 8 | 摘要 + 下一步：`node release/check-ready.mjs` | —— |

**发布动作的顺序（硬需求）**：`build` → `check-ready` **全绿**（含两个真跑门）→ 才允许把 tag / Release 指向这一版 → 才允许部署 Web。

## 3. 接口决定：`contentVersion` 从哪来（**未拍板**，归负责人的「决策点 5」）

> 交接说明：本工作线不再自开提问（子会话的问题不会进用户队列，会隐形阻塞）；需要用户拍板的事项一律写进报告交负责人。待办：负责人的决策点 5 给出结论后，按结论把这里的默认来源固定下来（只改 `release/lib/version-source.mjs` 一处）。

**已定的部分没有选择余地**（契约 §4.1）：发布版本必须 `YYYY.MM.DD.N`、按 `[年,月,日,N]` 逐段数值比较、**必须严格大于上一版**（编译器强制，`VERSION_NOT_MONOTONIC`）；本地派生的 `0.0.0-dev+<sha256前12位>` **永不发布**。

**这个号由谁产生，尚未拍板**（原属 IF-19 尾部；负责人已把它并入自己的「决策点 5：版本语义」，与「`formatVersion` 是否升 2」一起统一带用户过）。
本工作线自己开过的那条问题已**关掉**（负责人实测：子会话自开的提问不会出现在用户待答队列里，会隐形阻塞）；结论由负责人转达。故流水线把它做成**可配置点**且在**没有来源时直接失败**：

```
✗ 发布构建失败 [VERSION_SOURCE_NOT_DECIDED]：没给 contentVersion 的来源，且**没有默认值**：
「发布时这个号由谁产生」是接口决定，尚未由用户拍板（IF-19 尾部），流水线不替你选。
```

已实现/未实现的候选（改哪一个都只动 `release/lib/version-source.mjs` 一处）：

| 候选 | 含义 | 代价 / 风险 | 状态 |
|---|---|---|---|
| A. 显式参数 `--content-version` | 人在命令行写出版本号 | 最笨最可控；容易忘，且仓库里不留「哪一版什么时候发的」记录 | ✅ 已实现 |
| B. tag 名 `--tag` | 接受 `2026.10.16.5` / `v2026.10.16.5` / `content-2026.10.16.5`（含 `refs/tags/` 前缀） | 人工拍板 + 可追溯、CI 触发天然可得；代价：tag 名与版本形状耦合，包装前缀必须与仓库约定一致；tag 一旦推出不能改 | ✅ 已实现（解析） |
| C. 日期 + 当日递增 `--version-source date` | UTC 当天 + 「当天已有最大 N」+1，N 从 **git tag** 里数 | 全自动；代价：依赖当天已有版本的可见性（数不准就**重复发同一个号**），跨 UTC 零点与直觉不一致 | ✅ 已实现（git 不可用则失败，不猜） |
| D. 仓库里的版本文件 | 人工改文件＝发布动作 | 状态在仓库里、review 可见；代价：多一份要与 tag 同步的状态 | ⛔ 未实现（会明确报未实现，不假装支持） |

其它已实现的控制点：`--previous-version`（单调性基线；显式给了就**只用它**）、`--source-date-epoch`（固定 `generatedAt`，让产物字节可复现）。

## 4. 产物清单：文件名 + 用途 + 谁消费

| 文件（`<out>`＝`release/out/`） | 内容 | 用途 | 消费者 |
|---|---|---|---|
| `dist/content.json` + `.sha256` | **唯一一次编译**的规范产物（压缩 JSON） | 一切副本的源头；留档 | 人 / 流水线 |
| `web/`（整目录＝站点根） | `index.html`、`styles.css`、`manifest.json`、`sw.js`、`app/` | 部署到 Pages | 浏览器 |
| `web/content.json` | ＝`dist/content.json`（字节复制）；**必需** | Web 端**单独取**的内容（契约 §4 要求不得内联） | Web 端（`sw.js` 缓存 + 页面读取） |
| `web/content.json.sha256` | 边车（sha256sum 格式）；**可选** | 便于人核对；Web 不再需要它做校验（完整性由 SW 缓存 + HTTPS 承担） | 人 / Android **不用** |
| `web/content/latest.json` + `web/content/<版本>/content.json` | 远端小纸条清单 + 快照（IF-22；**已定形态**） | Android 每次先取的小文件 | Android 端（D） |
| `apk/suofei-<版本>-debug.apk` | 内置同版内容的 APK（**debug 签名**） | 手动安装 / 将来挂 Release | 用户 |
| `release-manifest.json` | 本次发布的机器可读记录 | 审计、就绪检查的输入之一 | 人 / 流水线（**不进站点**） |
| `.work/` | 构建中间态：`android/`（副本）、`e2e/`（真跑门用的镜像根）、`logs/` | 只在构建/检查期用 | 无（可整个删） |

**部署白名单**（精确比对，多一个就红）：顶层只允许 `index.html`、`styles.css`、`manifest.json`、`sw.js`、`app/`、`content.json`、`content.json.sha256`、`content/`；`fixtures/`、`tests/`、`scripts/`、`node_modules/`、`README.md`、`.gitignore`、`package.json` **绝不发布**。`web/` 以后新增顶层文件 ⇒ 检查报红并要求人工确认（**不静默带上**）。必需项见 `release/lib/artifacts.mjs: DEPLOY_REQUIRED`（含 `content.json`）。

## 5. 同源：一份字节，怎么保证不是「各建一次」

**只有一次编译**。`dist/content.json` 是三样产物唯一的源头，其它都是**字节复制**，每一步复制后当场比对、就绪检查再重算一遍：

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

三道机械保证：**构建时**每次复制都 `Buffer.equals`（不一致立即非零退出）；**构建时**从 APK 里把 assets 读回来（自带最小 zip 读取器，零依赖）比对哈希；**就绪检查时**用重算的哈希再验一遍（§7 的 14/22/20 三项）。

## 6. APK 与 Android 单测共用同一个只读副本

`release/lib/android-work.mjs`：

1. 把 `android/` 复制到 `<out>/.work/android`（排除 `build/`、`.gradle/`、`.idea/`、`.kotlin/`）；副本按**源提交**记账，源码变了就重建（避免拿旧代码跑测试）。
2. 把本次发布的 `content.json` **写进副本的 `app/src/main/assets/content/content.json`**（逐字节校验）。
   - 这一个文件同时是两个消费者：APK 打包取它；`ContentParserTest` 用相对路径 `src/main/assets/content/content.json` 读它。**一处替换、两处一致**。
   - 早期用 Gradle init script 覆盖 `assets.srcDirs`，对单测**无效**（它不经过 assets 合并）⇒ 会出现「APK 里是新内容、单测读的还是旧内容」的错位。已废弃该机制。
3. **代码一致性闸**：副本里的代码区域（`app/src/test`、`app/src/main/java`、`app/src/main/res`、`AndroidManifest.xml`、`*.gradle.kts`、`gradle.properties`）必须与仓库逐字节一致，否则**拒绝**在这份副本上构建或跑测试。
   - 它防的是「为了让就绪检查变绿去改副本里的测试」这种自欺，也防副本被别的东西改过 —— 否则「APK 是用仓库代码构建的」「测试跑的是仓库里的测试」这两句话就不成立。实测：改副本里一行断言 ⇒ 立即报 `副本里的代码与仓库不一致`（`ANDROID_COPY_DIRTY`）。
   - 只有 `app/src/main/assets` 是故意不同的（那就是本次发布的内容）。

**未验证**：这条路径只在 `assembleDebug`（debug 构建类型）上跑过；`assembleRelease` + 固定签名未跑（未授权）。正式签名后 APK 名字里不该再有 `-debug`。

## 7. 产物就绪检查：25 项

`node release/check-ready.mjs` → 退出码 `0`＝全绿（可以推进），`1`＝有红项（**禁止推进**），`2`＝用法错误。`--skip-live`（不跑两个真跑门，**标黄不是绿**）、`--live-only`（只跑真跑门，迭代时用）、`--json`。

**语义**：**绿**＝查过且通过；**红**＝查过且不通过（必须修）；**黄**＝环境不可用/需人工确认（**没通过**）；**跳过**＝没查（不是「查过了」）。红/黄/跳过分别列出，绝不合并成「差不多就行」。

| # | id | 查什么（都重算，不看构建的自我声明） | 红了意味着什么 |
|---|---|---|---|
| 1 | `out-dir` | 产物目录存在 | 还没构建 |
| 2 | `manifest` | `release-manifest.json` 可解析、必需字段齐 | 构建没跑完/清单坏了 |
| 3 | `source-tree-clean` | 构建时的源树脏标记 | **黄**：本地演练可以，真发布必须先从干净提交构建（不可复现） |
| 4 | `dist-json` | 规范产物可解析，打印首/末诗名、诗数、分组数 | 产物坏了 |
| 5 | `schema-validation` | **调用 `node tools/validate-content.mjs`（C 线的 schema）** | 产物不满足契约。**刻意不写死字段清单**——契约一改（如用户拍板只发 `orderInSource`），硬编码清单就会假红 |
| 6 | `format-version` | `formatVersion === 1`（IF-30） | 结构变了却没同步两端客户端 |
| 7 | `content-version-shape` | `YYYY.MM.DD.N` | 本地派生版本被当成发布版本发了 |
| 8 | `content-version-matches-manifest` | 产物 vs 清单 | 清单和产物不是同一次发布 |
| 9 | `version-monotonic` | 严格大于上一版 | 已更新的客户端不会采用它 |
| 10 | `poem-count` | 诗数 > 0 且与清单一致 | 空内容 / 产物与清单不符 |
| 11 | `order-in-source` | **数组次序** + `orderInSource` 严格升序（`source` 策略下，有值者必须在数组前面） | 组内次序被弄错（此前真实发生过的系统性问题） |
| 12 | `dist-sha256` | 重算 sha256 与字节数 vs 清单 | 产物被改过 |
| 13 | `dist-sidecar` | 边车格式与哈希 | 边车写错 |
| 14 | `web-same-source` | 部署内容是 `dist` 的**字节复制** | APK 与 Web 发的不是同一份内容（核心事故） |
| 15 | `web-sidecar` | 边车**可选**：出了就必须匹配，没出不算错（契约 §4） | 出了但写错 ⇒ 会误导人 |
| 16 | `web-required-files` | `DEPLOY_REQUIRED` 齐（含**单独取**的 `content.json`） | 站点缺文件；缺 `content.json` ⇒ Web 没内容可读 |
| 17 | `web-no-unexpected` | 部署目录顶层**精确**比对，且无开发期条目 | 夹具/测试/脚本泄漏到公开站点 |
| 18 | `sw-shell-files` | 从 `sw.js` **结构无关**地找出预缓存数组（含 `index.html` 的那个），逐个确认文件存在；找不到该数组 ⇒ 报红要求人工对齐 | 任一缺失 ⇒ `cache.addAll` reject ⇒ **SW 装不上、离线能力直接没有**（内容随壳走之后更致命） |
| 19 | `sw-config-agree` | `sw.js` 与 `app/config.js` 的版本常量**结构无关地**两两比对；`SUPPORTED_FORMAT_VERSION` 若已不存在则明示「不适用」；**找不到任何可比对项 ⇒ 报红要求人工对齐** | 缓存名不同步 ⇒ 新旧壳/内容可能混用；或 Web 结构变了却没人更新这条检查 |
| 20 | `android-manifest` | 清单字段齐、`sha256` 64 位小写十六进制、版本/结构版本与产物一致、`size` 与实际字节一致；**并按 Android 端的 URL 语义解析 `url`**，确认它落回部署目录里的同一份字节 | Android 端会 404 / `SIZE_MISMATCH` / 拒绝更新 |
| 21 | `apk-present` | APK 存在且文件哈希与清单一致 | 三样产物少一样 |
| 22 | `apk-builtin-same-source` | **从 APK 里读回 `assets/content/content.json`**，与 `dist` 逐字节比对（含内容版本号） | **最关键的一条**：用户以为发的是这一版内容，APK 里却是别的 |
| 23 | `apk-identity` | `aapt2 dump badging`：包名 == `dev.sopho.suofei`、`versionCode` == 清单 | 打错包名（发布后不可改） |
| 24 | `live-web-e2e` | **真跑**：用 `out/web` 当站点跑 E 线的 `web/tests/e2e-cdp.mjs`（真无头 Chromium） | 页面/离线/更新流程真有断言失败 |
| 25 | `live-android-unit-tests` | **真跑**：Android JVM 单测，内置内容＝本次产物 | 产物让 Android 解析器读不进去，或仓库测试真有失败 |

### 7.1 两个「真跑」门（`release/lib/live.mjs`）

**Web e2e**：在 `<out>/.work/e2e/` 搭一个**镜像根**——`dist/content.json` 放本次产物（这是 e2e 的首选基座）、`docs/design/content-contract.md` 与 `tools/` 从仓库复制、`web/` 是仓库 `web/` 的镜像（tests/scripts/fixtures 属测试基础设施）**再覆盖上 `out/web` 的全部载荷**。于是：**站点载荷 = `out/web`，内容基座 = `out/dist/content.json`**，仓库里的 `web/content.json` 全程不参与。跑之前断言基座与站点内容都是本次产物、抽查 `index.html`/`sw.js`/`app/*.js` 与 `out/web` 逐字节相同；跑完再断言站点 `content.json` 仍是本次产物、且脚本自带的「本次跑的是真实产物」断言通过。
**调用的是 E 线自己的脚本，不复制它的断言** —— 它改断言我这边不会假红（本轮它已从 110 条涨到 167 条，我这边一字未改）。

**Android 单测**：在 §6 的只读副本里跑 `gradlew testDebugUnitTest --rerun-tasks -PextraMavenMirror=…`（本机 Gradle 到不了 `dl.google.com`/`mavenCentral`，测试要用的 `org.json` 走阿里云镜像；`--offline` 失败时会**自动去掉 `--offline` 重试一次**并如实记录）。

**必须 `--rerun-tasks` 的原因（真踩过）**：`src/main/assets/**` **不是** `testDebugUnitTest` 的声明输入（测试是在运行时用相对路径读它的），热缓存下 Gradle 直接 `UP-TO-DATE`/`FROM-CACHE` 什么也不跑。实测：故意把内置内容改成 18 首，**不带** `--rerun-tasks` 时退出码仍是 0（**静默通过**）；带上就按预期红在 `ContentParserTest` 的 19 首/次序断言上。因此这一门还**再断言一次任务行不是 `UP-TO-DATE`/`FROM-CACHE`**。

**环境不可用一律标黄并写明原因**（不许静默跳过、不当通过）：找不到 Chromium（提示 `CHROME_BIN`）、找不到 JDK/SDK、Gradle 拉不到依赖、e2e 连「通过 N / N」汇总都没打印出来（说明没跑完）。真跑起来但断言失败 ⇒ **红**，并列出失败用例/失败断言名与完整日志路径（`<out>/.work/logs/*.log`）。

## 8. 失败 / 中断了怎么办

**共同不变量：不推进最新版，旧版本一个字节都不动、仍然可下载可读。**

| 情形 | 流水线行为 |
|---|---|
| 内容编译失败（契约校验/单调性） | `build` 非零退出；编译器**失败时不写产物也不动已有产物** |
| 复制后字节不一致 / APK 注入没生效 / 副本代码被改 | `build` 非零退出（`COPY_MISMATCH` / `APK_CONTENT_MISMATCH` / `ANDROID_COPY_DIRTY`） |
| Gradle 构建失败 | `build` 非零退出 ⇒ 无 APK ⇒ 就绪检查必红 |
| 就绪检查有红项 | `check-ready` 非零退出，列出红项，明说「不推进最新版；旧版仍可下载」 |
| 真跑门跑不起来（环境） | 标**黄**并写明原因；结论行会明确说「真跑门未全绿 ⇒ 页面/客户端是否真能跑没被完整证明」 |
| 构建到一半被打断 | `release/out/` 是中间态；重跑 `build-release.mjs` 会先清掉它再重来；站点上什么都没变 |
| 部署了一半 | **本流水线不管部署**。见下面的诚实边界 |

**不声称原子性**：GitHub Pages 部署是一批静态文件，**没有**「三样产物一起生效」的保证，CDN 缓存/生效延迟由服务商决定；Release APK 与站点内容的生效也不是同一个原子动作。可接受的策略是「先内容后 APK」或「先 APK 后内容」——两端本来就是按各自协议独立判断并实现「完整下载/校验通过才切换、失败保留旧版」。流水线提供的保证是**同一份字节**，不是「同时生效」。

## 9. 跨线发现（本流水线未擅自改别人的文件）

### 9.1 IF-22 的 `url` 语义（**已由负责人修正文档**）

`ContentUpdater.resolveUrl(manifestUrl, manifest.url)` 用**清单自己的 URL** 作基址解析；文档示例写成 `content/<版本>/content.json` 会解析成 `…/content/content/<版本>/…`（404）。本流水线产出**相对清单所在目录**的 `<版本>/content.json`（唯一定义处 `release/lib/artifacts.mjs: androidSnapshotUrl()`），并就绪检查按 Android 端的语义解析回来验证。负责人已把 `docs/design/android-offline-update.md` 改正（2026-10-16），此条已闭环。

### 9.2 两端更新协议（**已由用户拍板**）

Web 的内容更新改由 SW 生命周期负责（内容与壳同一次部署），不再有独立内容版本通道；**Android 保留小纸条清单**。本流水线据此：默认产出清单、不再加分支；Web 边车降为可选；§7 的第 15/18/19 项按「结构无关」重写。

### 9.3 真跑门抓到的两个真问题（本轮新增，都需要别人改）

1. **D 线一条测试断言写死了异文条数**：`ContentParserTest.variants_areParsedButNeverEnterStanzas` 断言 `assertEquals(1, poem.variants.size)`（第 9 首《庭中有奇树》恰好 1 条异文）。G 线补核把全部异文从 **13 条增到 21 条**，该首变成 **2 条** ⇒ 实测 `49 tests completed, 1 failed`。
   - 这是**真实的过时断言**（该测试的意图「异文被解析、但绝不混入正文」仍然有效，只是条数写死了）。
   - 影响：就绪检查的 `live-android-unit-tests` 现在是**红**（其余 48 例与 167 条 e2e 全绿）。改法建议：把条数断言换成「至少 1 条且其 `text` 含『贵』」这类**内容断言**，或按 id 断言具体条目。
   - 我没有改它：`android/` 不在我的写入范围（改了就会撞上 §6 的代码一致性闸，那道闸正是为这种情况设的）。
2. **Gradle 缓存的静默通过**（§7.1）：手动跑单测时若命中缓存/`UP-TO-DATE`，等于**没测**却报成功。任何人在本机手跑 `./gradlew testDebugUnitTest` 验证内容改动时，都应加 `--rerun-tasks`。
3. **并行的另一个会话会让门测到别人的站点（本轮真实发生，已修）**：E 线 e2e 默认用 `127.0.0.1:8137`（调试端口 9237），而**这个仓库同时跑着多条会话**。实测一次：我的镜像站点没抢到 8137，脚本却对着**别人的服务器**跑完了整套断言并报红 —— 失败值（缓存名 `pc-resources-0.3.0`、内容版本 `2026.10.14.1`）在我这棵树里根本不存在（本机所有 worktree 现在都是 `APP_VERSION=0.1.0`），所以那不是本次产物的问题。运气反过来就是**假绿**（对着别人的站点报 167/167）。
   - 修法：门在跑之前用同步探针找一对**空闲**端口（`8137+` / `9237+`）并显式传 `TEST_PORT`/`TEST_DEBUG_PORT`；全部被占则**标黄**并说清「不能对着别人的服务器跑」；日志里出现 `EADDRINUSE` 也标黄。
   - 实测：修好后立即自动换到 **8138/9238** 并拿到真的 167/167（反向印证占用确实存在）。

## 10. 需要用户单独授权的步骤（一个都没做）

| 步骤 | 对应 | 授权前流水线会怎样 |
|---|---|---|
| 创建/推送公开仓库、定仓库名 | A4.1 / IF-13 | 不做；产物只在本地 `release/out/` |
| 启用 GitHub Pages、定部署地址 | A4.2 | 不做；清单里是**相对**地址，不绑定站点 URL |
| 打 tag / 挂 Release | A4.3 | 不做；`--tag` 只**解析**已有 tag 名，不创建 tag |
| 固定签名 | A4.4 | 不做；APK 是 debug 签名，清单里 `signed: false`，摘要会警告它不能作为正式产物 |
| 装到真机/模拟器验收 | A5 | 不做（一次都没做过） |

## 11. 本地演练证据

工作树 `C:\Users\wsqsy\Documents\android\.sopho-wt\f-003ac2f6`（分支 `wt/f-003ac2f6`），源提交 `8233189`（含 G 线补核后的 19 首/21 条异文）。

### 11.1 绿：完整一次发布 + 两个真跑门

```bash
$ node release/build-release.mjs --content-version 2026.10.16.5          # 10s，exit 0
[3/8] $ node tools/build-content.mjs --out release/out/dist/content.json --order source \
            --content-version 2026.10.16.5 --minify --previous-version 2026.10.16.4
      内容编译成功：19 首诗 / 1 个分组    单调性检查通过：2026.10.16.4 → 2026.10.16.5
      产物: dist/content.json  20964 字节  sha256=82f94705d11b5815fa5db9f5a68e42c92fd7ae50d0a724b79e10c7ec9ab748cc
      内容: formatVersion=1  contentVersion=2026.10.16.5  poems=19  dynasties=1
[4/8] 部署内容: content.json 20964 字节（与 dist 字节一致）；部署目录顶层: app, content, content.json, content.json.sha256, index.html, manifest.json, styles.css, sw.js
[5/8] 快照: release/out/web/content/2026.10.16.5/content.json 20964 字节 ｜ 清单: content/latest.json url=2026.10.16.5/content.json
[6/8] 只读副本: release/out/.work/android（android/ 本身一个字节都没被写）
      内置内容已就位: …/app/src/main/assets/content/content.json  20964 字节（与 dist 字节一致）
      BUILD SUCCESSFUL in 29s（副本重建后；增量 8s）/ 37 actionable tasks: 17 executed, 20 from cache
      APK 内置内容校验: assets/content/content.json 20964 字节 sha256=82f94705… == dist ✓
      APK: apk/suofei-2026.10.16.5-debug.apk  9568032 字节  sha256=14dc241399e824358c9509d7e97fd934c41059ef9281055a66cf6872eb3020bf

$ node release/check-ready.mjs                                            # 61s
… 1..23 静态项全绿 …
[跑] live-web-e2e      正在真跑（可能要 20~40 秒）…
[绿] live-web-e2e      通过 167 / 167（36s，真 Chromium，端口 8138/9238（默认端口被别人占着，已自动换开））
       基座 = out/dist/content.json（sha256 82f94705…），站点载荷 = out/web，仓库 web/content.json 未参与
       脚本自带断言「本次跑的是真实产物」通过；跑完后站点 content.json 仍是本次产物
[跑] live-android-unit-tests  正在真跑…
[红] live-android-unit-tests  Android 单测真跑了并失败（退出码 1，15s）
       失败用例：ContentParserTest > variants_areParsedButNeverEnterStanzas    ← 见 §9.3.1（D 线过时断言）
绿 24 / 黄 0 / 跳过 0 / 红 1        真跑门：live-web-e2e=PASS，live-android-unit-tests=FAIL
```

复跑压缩产物体积对比（同一份内容、同一版本号）：**格式化 26029 字节 → 压缩 20964 字节（-19.5%）**。

### 11.2 真跑门有牙齿：故障注入（产物少一首）

把 `out-bad/dist/content.json` 删掉最后一首（`dist` 与 `web` 同步，静态检查全部自洽），然后只跑真跑门：

```bash
$ node release/check-ready.mjs --live-only --out release/out-bad          # 52s，exit 1
[红] live-web-e2e              e2e 真跑了并失败：通过 163 / 167
       失败项：0b 次序策略… · 1 真实内容首访… · 汉组目录的诗名次序 ==《文选》原次序 …
[红] live-android-unit-tests   Android 单测真跑了并失败（退出码 1，17s）
       失败用例：ContentParserTest > clientDoesNotResort_arrayOrderEqualsSourceOrder
                ContentParserTest > search_matchesTitleAndAuthorAcrossGroups
                ContentParserTest > embeddedContent_parsesAndKeepsCompiledOrder
绿 0 / 黄 0 / 跳过 0 / 红 2
```

### 11.3 环境不可用/明确不跑 ⇒ 黄，不是绿

```bash
$ node release/check-ready.mjs --skip-live
[黄] live-web-e2e               本次用 --skip-live 跳过（没跑，不是通过）
[黄] live-android-unit-tests    本次用 --skip-live 跳过（没跑，不是通过）
绿 23 / 黄 2 / 跳过 0 / 红 0
```
（找不到 Chromium / 拉不到依赖 / e2e 没打印汇总，都走同一条「黄 + 写明原因」的路。）

### 11.4 结构无关性验证（模拟 E 线改 Web 结构，E 的改动尚未落地）

| 注入的变异 | 期望 | 实测 |
|---|---|---|
| `const SHELL` → `const PRECACHE_URLS`，并删掉 `config.js` 的 `SUPPORTED_FORMAT_VERSION` | 不假红 | 18/19 项仍绿（exit 0）；`sw-shell-files` 仍报「9 条预缓存路径全部存在」；`sw-config-agree` 报「APP_VERSION 两处一致；缓存名前缀两处一致；SUPPORTED_FORMAT_VERSION 未声明 ⇒ 本项不适用」 |
| 两侧都删掉 `APP_VERSION` 与缓存前缀 | 报红（fail-closed，不许假绿） | `[红] sw-config-agree：找不到任何两处都声明的版本常量 ⇒ …必须人工重新对齐` |
| 预缓存清单改成 `buildShellList()` 动态生成 | 报红并要求人工对齐 | `[红] sw-shell-files：找不到包含 index.html 的字符串数组…若清单已改成由别的文件驱动，请把本项改成与那个来源比对` |

### 11.5 代码一致性闸（防自欺）

```bash
# 把副本里的 assertEquals(1, poem.variants.size) 改成 assertTrue(poem.variants.size >= 1)
[红] live-android-unit-tests  准备 Android 副本失败：Android 副本里的代码与仓库不一致（1 处）：
       - app/src/test/java/dev/sopho/suofei/ContentParserTest.kt：副本与仓库内容不同
       （只有内容 assets 是故意替换的。删掉 release/out/.work 后重跑即可刷新副本。）
# 从仓库拷回后哈希一致，闸放行，红的是那条真实断言
```

### 11.6 其它已实测的路径

```bash
# 没给版本号来源 ⇒ 拒绝跑
$ node release/build-release.mjs        → [VERSION_SOURCE_NOT_DECIDED] exit 1
# 非法选项 → exit 2；tag 名候选解析：2026.10.16.5 / v… / content-… 三种都能解析，release-1.2.3 → null（不猜）
# 产物字节可复现：固定 SOURCE_DATE_EPOCH 两次编译字节相同（424c2a1b…）；不固定则不同（generatedAt 变）
# 旧的三次红仍在：产物未构建（20 红/2 跳）、--skip-apk（红 1）、APK 内置内容不同源（红 1，只有那一项）
```

演练中修好的自家缺陷（都留了断言）：init script 占位符只替换第一处导致 assets 全空（已彻底弃用该机制）；`--out` 写成仓库相对路径；显式 `--previous-version` 被本地旧 manifest 盖掉；`import` 即跑主流程；`gradlew.bat` 没经 `cmd.exe` 导致 `spawnSync EINVAL`。

## 12. 已验证 / 未验证

**已验证（本机实跑，可复现）**

- 真实 19 首（含 G 线补核后的 21 条异文）编译为**压缩产物** 20964 字节；单调性闸通过。
- Web 部署目录准备（字节一致、白名单精确、`sw.js` 9 条预缓存路径齐全）。
- APK 构建（`assembleDebug --offline`，8 秒）+ **从 APK 读回 assets 与 `dist` 逐字节相同**；APK 身份 `dev.sopho.suofei` / versionCode 1 / 应用名「索斐」。
- **真跑门**：Web e2e **167/167**（真无头 Chromium，站点＝`out/web`，基座＝本次产物）；Android JVM 单测 **49 例真执行**（`--rerun-tasks`，内置内容＝本次产物），其中 **1 例红**已定位为 D 线的过时断言（§9.3.1）。
- 就绪检查的多种红/黄：产物未构建、`--skip-apk`、APK 不同源、产物少一首（两个真跑门同时红）、`--skip-live`（黄）、副本代码被改（拒跑）、Web 结构变异（不假红 + fail-closed）。
- 版本来源四候选解析与退出门；产物字节可复现性（固定/不固定 `SOURCE_DATE_EPOCH` 对比）。
- 跑完五个源目录 `git status` 干净：流水线确实没改别人的文件。

**未验证（不要当成已成立）**

- **没有推任何远端、没有 tag、没有 Release、没有 Pages**：全部是本地目录演练。
- **没有在真实 GitHub Pages（https + 子路径）上部署过**；子路径下的相对路径**按代码应该成立但没实测**。
- **APK 是 debug 签名**；`assembleRelease`、覆盖升级（`versionCode` 增长）没跑过。
- **没有在真机/模拟器上装过**：能否安装、内置内容能否被阅读器读出来、更新能否连真实站点，都没验证。单测/真跑门证明的是「解析器/页面能处理这份字节」，**不等于「设备上体验正确」**。
- **Web e2e 的结论边界**：真跑的是无头 Chromium + 本机静态服务；未覆盖真断网/弱网/移动浏览器（E 线文档已写明这些边界）。
- **E 线的 Web 更新机制改动尚未落地**：本轮按「结构无关」重写了 15/18/19 项并做了变异验证，但**没有对着 E 的新代码跑过**。E 落地后需要复跑；若结构变化超出我的容错范围，我会看到明确的「需人工重新对齐」而不是假红/假绿。
- 未做故障注入以外的失败路径演练（磁盘满、Gradle 中途崩、杀进程）；未在干净机器/CI 上跑过（CI 会撞本机那个到不了 `dl.google.com` 的 Gradle 代理，届时需要 `-PextraMavenMirror` 或换环境；真跑门已内置该镜像开关）。
- **端口并发**：e2e 门的端口是「跑之前探测到的空闲端口」；若两个会话几乎同时探到同一个空闲端口，仍有极小竞态（探针→启动之间）。本轮已把「默认端口被别人占」从「默默测别人的站点」降成「自动换端口/标黄」，但没有做锁或随机端口分配。

## 13. 脚本清单与调用方式

```bash
node release/build-release.mjs --content-version 2026.10.16.5      # 完整一次发布（内容+Web+清单+APK）
node release/build-release.mjs --tag content-2026.10.16.5          # 从 tag 名取版本
node release/build-release.mjs --version-source date               # 候选 C：日期+当日递增
node release/build-release.mjs --out release/out --skip-apk        # 只出内容/Web（就绪检查会因缺 APK 报红）
node release/build-release.mjs --android-feed none                 # 不产出小纸条清单（只用于本地演练）
node release/build-release.mjs --source-date-epoch 1760000000      # 让产物字节可复现
node release/check-ready.mjs                                       # 25 项就绪检查（0=可以推进，1=禁止推进）
node release/check-ready.mjs --skip-live                           # 不跑两个真跑门（标黄，不是绿）
node release/check-ready.mjs --live-only                           # 只跑真跑门
node release/check-ready.mjs --out <dir> --json                    # 指定产物目录 / 机器可读结果
```

两个脚本的**退出码**一致：`0` 成功/就绪，`1` 构建失败/有红项（**禁止推进最新版**），`2` 用法错误。（`import` 两者都不会触发主流程。）

| 文件 | 作用 |
|---|---|
| `release/build-release.mjs` | 8 步编排；只写 `<out>`；打印真实命令与关键数值；失败非零退出 |
| `release/check-ready.mjs` | 25 项就绪检查；绿/黄/跳过/红 + 结论；`--skip-live`/`--live-only`/`--json` |
| `release/lib/artifacts.mjs` | **产物布局、部署白名单、必需项的唯一处**（build 与 check 共用，防漂移） |
| `release/lib/version-source.mjs` | **`contentVersion` 来源的可配置点** + 单调性基线解析 |
| `release/lib/android-work.mjs` | Android 只读副本的准备、内容注入、**代码一致性闸** |
| `release/lib/live.mjs` | 两个**真跑门**（Web e2e 镜像根 / Android 单测与静默通过防线） |
| `release/lib/zip.mjs` | 零依赖最小 zip 读取器（从 APK 读回内置内容） |
| `release/lib/util.mjs` | 哈希/进程/文件/打印；仓库根固定，从任何 cwd 调用结果一致 |
| `release/.gitignore` + `release/README.md` | 忽略 `/out/`（**不动根 `.gitignore`**）；面向人的用法说明 |
