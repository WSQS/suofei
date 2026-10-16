# 最新构建上的 Android 四页复核（目录／诗／详情／关于）—— 收口前的最后一块设备证据

> **这一份是什么**：**一次设备取证记录**。在**最新合并后代码**上重新构建 debug APK、装进
> `emulator-5556`，把四页逐项对照采纳锚，并附四页每页一张 `screencap` ＋ 一段 `uiautomator dump` 原文。
> **它不是什么**：**不是** release 同签名覆盖验证、**不是**发布、**不是**像素级设计定稿。
>
> ⚠ **这是 debug 构建的候选复核**。签名证书是 **debug 证书**（`CN=Android Debug`），
> **不得**表述为「已发布 release 同签名覆盖验证」。

## 为什么有这一轮（缺口）

S4 的四页验收跑在**旧基底 `eb33f11` ＋ debug 签名**上；S4-b 只在**最新基底**上复核了**关于页**。
⇒ **目录页／诗页／详情页**在最新合并后代码上**没有被复核过**。本轮补这三页 ＋ 关于页复跑。

## 1 · 构建基底与 APK 身份

| 项 | 值 |
|---|---|
| 本会话工作树 | `<worktree>`（分支 `wt/child-f25f0b74`） |
| **构建基底 SHA** | **`1291063985f42d8ed57b8bb51a63ca05b8736093`**（`1291063`）＝ 构建时 `git rev-parse HEAD` |
| 与主树最新（`master`）的关系 | 构建后 `master` 已前进到 `ffb324d99cddff533ef82c1049cd72f7ed9fb2b0`（3 个提交）。`git diff HEAD..master -- android/ items/app-ui/ content/ schema/ web/` **全部为空** ⇒ 本轮被复核的**应用代码与内容就是 master 当前的样子**；唯一差异是 `docs/`、`tests/` 三处文档/测试。 |
| 构建命令（**真 exit**） | `cd android && JAVA_HOME='<JDK 17>' ./gradlew assembleDebug --offline > 日志 2>&1; echo $?` ⇒ **EXIT=0**（原文见 `assembleDebug.log` 末行 `BUILD SUCCESSFUL in 12s`） |
| 产物 | `android/app/build/outputs/apk/debug/app-debug.apk`（9,623,839 字节） |
| `versionCode`／`versionName` | **2** ／ **0.1.1**（`output-metadata.json` 与 `dumpsys package` 两侧一致） |
| `applicationId` | `dev.sopho.suofei` |
| APK sha256（截图所依据的那一颗） | `a58514990caec358d97ef335f55b11b96401560abf9afdb69f8af148b904b787` |
| **签名证书（逐字）** | `Signer #1 certificate DN: CN=Android Debug, O=Android, C=US`；SHA-256 `faff248f15977835c25c25ec8c0b865fa6c4207bada8cfc8e5785ea8aa94e956`；SHA-1 `dd9e86ea950d78da58bf2cfb795a3058c3bf9294`（`apksigner verify --print-certs`，**只读证书，未读私钥**） |

**APK 位级可复现（本轮实测）**：改动 revert 后连跑两次
`./gradlew assembleDebug --offline --rerun-tasks` ⇒ 两次都得到 **`a5851499…b787`**，
与最初那颗**逐字节相同**。（增量构建会得到不同 sha——这是构建的缓存/打包顺序，不是源码差异。）

## 2 · 设备身份（**只用过 `emulator-5556`**）

原文见 [`DEVICE-IDENTITY.txt`](DEVICE-IDENTITY.txt)。

| 项 | 值 |
|---|---|
| serial（`-s` 用的） | `emulator-5556` |
| `ro.product.model` / `ro.product.device` | `sdk_gphone64_x86_64` / `emu64xa` |
| `ro.serialno` | `EMULATOR36X1X9X0` |
| SDK | 35（`ro.build.fingerprint` = `google/sdk_gphone64_x86_64/emu64xa:15/AE3A.240806.043/12960925:userdebug/dev-keys`） |
| 屏幕 | 1080×2400，density 420（⇒ 411.4 dp 宽），`font_scale=1.0` |
| **没碰** | `emulator-5554`(PD2364/V2364A)、`YOCTO`、`127.0.0.1:7776`(vext)、用户手机 —— 本会话每一条 `adb` 都显式带 `-s emulator-5556`，**未发生 uninstall**（`install -r` 直接 Success，无降级/签名冲突） |

## 3 · 四页逐页对照（锚 → 实测）

装置换算：1 dp = 2.625 px（density 420）。页面内容左内沿实测 `x=137`（＝ 16.8dp×2.625＝44.1px 上再加页边 93px），右内沿 `x=944`。

### 3.1 目录页 — 锚 `round-2026-10-15-hub-align/`（口径 A＋竖直居中）＋ `round-2026-10-16-width-pct/`

| 锚要求 | 实测（`uiautomator dump` 边界 px） | 判定 |
|---|---|---|
| 组头 `[+]/[−]` **悬挂**在组名左沿之外 | `[−]` `[93,262][153,301]`；组名 `汉` `[165,242][824,321]` ⇒ 记号右沿 153 < 组名左沿 165（差 12px＝槽内固定缝），记号左沿 93 ＝ **列表容器左沿** | ✅ |
| 记号与组名**竖直居中** | `[−]` 中心 y ＝ 281.5；`汉` 中心 y ＝ 281.5 ⇒ 差 **0** | ✅ |
| **缩进 0**：诗题与组名首字同一竖线 | 组名左沿 **165**；19 个诗题左沿**全部 165**（`行行重行行` `[165,391]` … `明月何皎皎` `[165,2189]`） | ✅ |
| 作者紧随题名、**不右对齐** | `佚名` 左沿 **417**（题名右沿 402 ＋ 缝 15）；右沿 483 ≪ 944 ⇒ 不右对齐 | ✅ |
| **19 首且次序＝《文选》原次序** | 行行重行行・青青河畔草・青青陵上柏・今日良宴会・西北有高楼・涉江采芙蓉・明月皎夜光・冉冉孤生竹・庭中有奇树・迢迢牵牛星・回车驾言迈・东城高且长・驱车上东门・去者日以疏・生年不满百・凛凛岁云暮・孟冬寒气至・客从远方来・明月何皎皎（**19/19，逐字与原次序一致**） | ✅ |
| **无搜索入口** | 全 dump 文本节点：`关于`／`[±]`／`汉`／`[19] 首`／19×(题名＋`佚名`) —— **没有**输入框、没有「搜索」 | ✅ |
| **无「有笔记」标记** | 同上，无「笔记」字样（`noteEntryLabel` 的 `[+]笔记` 在目录页**不出现**） | ✅ |
| 顶部**只有「关于」入口** | 顶行只有一个可点节点 `关于` `[845,119][971,206]`；无搜索、无应用名、无状态位 | ✅ |
| 数量右沿贴右内沿 | `[19] 首` 右沿 **944** ＝ 容器右沿 988 − 44（＝16.8dp） | ✅ |
| 首次进入**全部收起** | 冷启动后组头为 `[+]`，无诗题（见 `01-hub.png`）；点组头 → `[−]`，19 首出现 | ✅ |

图：`01-hub.png`（首态收起）、`02-hub-expanded-top.png`（展开·顶部）、`03-hub-expanded-mid.png`（展开·下半 19 首）、`04-hub-expanded-bottom.png`（**与 03 逐字节相同**，md5 `85d40449…`，说明已经滚到底、无更多内容）

### 3.2 诗页 — 锚 `round-2026-10-15-poem-expression/`＋`poem-align #d4-all`＋`round-2026-10-16-break-semantic/`

题：`行行重行行`（有 detail 的那首）；另一首 `青青河畔草`（无 detail）另测。

| 锚要求 | 实测 | 判定 |
|---|---|---|
| **全部居中** | 题名 `[137,269][944,360]`、身份行 `[137,389][944,435]`、正文**每一行** `[137,…][944,…]` —— 全部节点**占满内容列宽** ⇒ 文本居中 | ✅（见图：题名／身份行／8 行正文都在同一中轴） |
| 顶部行 **返回左・详情右** | `返回` `[110,119][236,245]`（左）／`详情` `[845,119][971,245]`（右） | ✅ |
| 身份行 ＝ **作者·朝代·体裁** | `佚名 · 汉 · 五言古诗`（一条文本节点，两处 `·` 分隔三个字段） | ✅ |
| 正文 **8 行不折** | 8 条独立文本节点，各占**一行**（`[137,523]` 起、行距 **64px**，共 8 行到 `[137,971]`），无一段被折成两行 | ✅ |
| **无底本/来源/异文** | 诗页节点里没有 `底本与来源`、没有 `异文`、没有来源文本 | ✅ |

图：`05-poem.png`

### 3.3 详情页 — 锚 `round-2026-10-16-detail/` D0（去竖线后）

| 锚要求 | 实测 | 判定 |
|---|---|---|
| 诗题**左对齐** | `行行重行行` `[137,269][479,360]` ⇒ 左沿 137 ＝ 正文左沿，宽度 342 ≪ 列宽（**不是**居中） | ✅ |
| 来源**正文前带标签「底本与来源」** | 标签 `底本与来源` `[137,427][336,478]` → 来源正文 `[137,493][944,796]`（**标签在上、正文在下**，同一左沿 137） | ✅ |
| `### ` 小标题**无竖线**且**左沿＝正文左沿** | `异文` `[137,863][214,914]` ⇒ 左沿 **137** ＝ 来源块 137 ＝ 列表项 137 ＝ 段落 137；节点文本**不含 `\|`／`###`**（eyebrow 真标题，字号小、accent 色，无装饰竖线） | ✅ |
| **无 detail 的那首如实说明** | `青青河畔草` 详情页：标签＋来源块照常，正文位置是 `这一首在产物里没有详情正文。` `[137,863][687,919]`（左沿 137，**不编内容、不留空白**） | ✅ |
| 不重复身份信息／无固定副题 | 详情页节点里**没有**作者/朝代/体裁，也没有「这一首的考据与来源」 | ✅ |

图：`06-detail.png`（有 detail）、`07-detail-empty.png`（无 detail 的如实说明）

### 3.4 关于页 — 锚 `round-2026-10-16-about/` A3 ＋ `round-2026-10-16-about-min/` V3

| 锚要求 | 实测 | 判定 |
|---|---|---|
| 4 项字段：**应用名页标题／应用版本／内容版本／仓库链接置底完整 URL** | `索斐`（页标题，top 259）／`应用版本` `0.1.1`／`内容版本` `2026.10.16.22`／`https://github.com/WSQS/suofei`（最底，完整 URL 逐字） | ✅ |
| **无「来源」** | 无 `来源` 标签行、也无「（来源：内置／已下载）」 | ✅ |
| **无「一句话说明」「诚实的限制」** | 全 dump 无这两个字样，也没有别的副标题 | ✅ |
| V3 **四条线合一** | 内容左沿 `索斐` **137** ＝ 标签文字左沿 `应用版本`/`内容版本` **137** ＝ **按钮外沿** `Button [137,526][339,631]` **137** ＝ 状态 label 左沿 `已是最新内容…` **137**（仓库链接同样 137） | ✅ |
| **初态只按钮** | **instrumented 图**（见 §4）：`resource-id="update-status"` 命中数 **0**（不是空串、不是不可见占位）；按钮下方**直接**是仓库链接，无空位。同一构建下"有状态"时该命中数为 1 | ✅ |
| 未验的（本轮不做） | 更新**失败/损坏/不兼容**各态、删除作品、阅读中延期切换 —— 本轮不在范围内 | — |

图：`08-about.png`（UpToDate 常态）、`09-about-idle-INSTRUMENTED.png`（**初态，instrumented**）、`10-about-after-revert.png`（revert 后原包，自动检查恢复）

## 4 · 「初态只按钮」是 **instrumented 图**（显著标注）

- **为什么**：`MainActivity` 里 `LaunchedEffect(Unit) { state.initialLoad(); state.checkForUpdate() }`
  ⇒ **一进应用就自动检查**，`Idle` 只活几毫秒，而关于页要点击才到达 ⇒ **原包上截不到 Idle**
  （而且 `Idle` 的窗口 ≈ `initialLoad()` 的耗时，比一次 `screencap` 还短）。
- **怎么截的**：**临时、未提交**地注释掉那一行 `state.checkForUpdate()`（就地标 `TEMP-INSTRUMENTED`），
  构建 → 安装 → 冷启动 → 点「关于」→ screenshot＋dump。instrumented APK 的 sha256 ＝
  `f32fe8bb90ce0d3265ac294cacdd2517bca3def23b041236897e937122ab9955`（**没进仓库**）。
- **截完已 revert ＋ 重建 ＋ 重装原包**：`git checkout -- android/app/src/main/java/dev/sopho/suofei/MainActivity.kt`
  ⇒ `git status` 只剩本取证目录；重建得到 **`a5851499…b787`**（与复核用的那颗逐字节相同）；重装后
  关于页自动检查**恢复**（`10-about-after-revert`：`已是最新内容（远端 2026.10.16.20）。` 回来了）。
- ⚠ **文件名与本节都带 `INSTRUMENTED`**，防止这张图被当成「原包的直接截图」。

**Idle 的旁证（不依赖那张图）**：源码守卫 `if (state.updateStatus !is UpdateStatus.Idle) { … Text(…) }`
（`Screens.kt`）＋ `AppState.updateStatus` 初值 `Idle` ⇒ Idle 时**不生成**状态元素。

**块高算术（与 S4-b 同一招，本构建自测）**：有 1 行状态时仓库链接 top＝**708**；Idle 时 top＝**638**
⇒ Δ ＝ **70px**，即那 70px **整个消失**（不是留空位）。

## 5 · 差异清单（有意偏离／过渡态／未验）

| # | 项 | 判定 | 理由 |
|---|---|---|---|
| D1 | **这是 debug 签名包**，不是 release | ⚠ **口径边界（必须逐字保留）** | 证书 `CN=Android Debug`（sha-256 `faff248f…`）。**不得**说成「已发布 release 同签名覆盖验证」；release 签名链路本轮**没有**碰（`SUOFEI_*` 四个环境变量一个都没设，按 fail-closed 设计也不会退回 debug） |
| D2 | 「初态只按钮」的图来自 **临时改动过的构建** | ⚠ **过渡态证据（已显著标注）** | 见 §4。原包上不可观测（Idle 比一次截图还短）；已 revert＋重建（位级同 sha）＋重装 |
| D3 | 内置 `detail` **不是**「全 null 的过渡态」 | ✅ **已是常态** | 内置产物 `android/.../assets/content/content.json`（`contentVersion 2026.10.16.22`，`formatVersion 2`）：**19 首里 13 首有 detail、6 首 `detail` 为 null**。核对源 `content/poems/古诗十九首/`：**恰好那 6 首没有 `## 详情` 节**（今日良宴会・回车驾言迈・明月皎夜光・生年不满百・青青河畔草・青青陵上柏）⇒ **null 是「源里真没有」，不是没编出来**。门 `node tools/check-bundled-content.mjs` ⇒ EXIT 0「已查 1 处（Android 内置内容）与当前 content/poems/ 编译结果一致（formatVersion=2，诗=19，带详情=13）」（`check-bundled-content.log`）|
| D4 | 目录页仅有 **1 个组**（汉·19 首） | ✅ 符合内容 | 本阶段只见《古诗十九首》，单一朝代组；V3/锚里的「多组」「折行长题名」在真机上**没有内容可测**（夹具才有多组） |
| D5 | **一次未解释、未复现的异常**：首次点组头后屏幕出现在**关于页** | ⚠ **观察记录，不当成缺陷结论** | 见 §6 |
| D6 | 未验：更新失败/损坏/不兼容保旧版、删除作品、阅读中延期切换 | ⚠ **未验** | 不在本轮范围（本轮只复核四页静态表达） |
| D7 | 未验：release 同签名覆盖安装 | ⚠ **未验，且本轮不做** | 需要正式签名材料，属授权边界之外 |

## 6 · 那次异常（如实记录，**不写成缺陷**）

**现象**：本会话第一次冷启动后，`01-hub.png` 记下的确实是**目录页（收起态）**；随后我只发了一条
`adb -s emulator-5556 shell input tap 540 278`（＝ 组头行中心，组头节点 `[93,206][988,350]`），
1.5s 后屏幕上是**关于页**（`90-ANOMALY-first-tap-landed-on-about.png` / `.dump.xml`）。

**证据**：那份 dump 与 4 分钟后正常到达关于页的 `08-about.dump.xml` **逐字节相同**（md5 两侧均 `9f7eb02c…`），
即那是一个**已经稳定**的关于页（含 `已是最新内容（远端 2026.10.16.20）。`），不是在途/半渲染态。

**为什么我不下结论**：

- 从 UI 树看，`(540,278)` 只可能落在组头上（当时唯一的另一个可点节点是 `关于 [845,119][971,206]`，x 不重叠）；
  源码里 `Screen.ABOUT` 的唯一入口是目录页那个 `关于` 节点（`grep openAbout|Screen.ABOUT` 全仓只有一处调用）。
- **受控复跑 6 次，一次都没复现**：
  ① 冷启动→点组头 ⇒ 正常展开；② 再点 ⇒ 正常收起；③ 再冷启动→点组头 ⇒ 正常展开；
  ⑤ `install -r`（从"停在关于页"的现场）→启动→点组头 ⇒ 正常展开；
  ⑥ 冷启动→点关于两次 ⇒ 正常到关于页。
- 另观察到**一次**「冷启动后第一条 `input tap` 被吞」（instrumented 那次的第一次点关于没反应，第二次才进）；
  **这**与上面那条异常方向相反，所以不能用一个机制解释两件事。
- 期间**没有任何** crash/ANR 症状（应用始终在前台 `mCurrentFocus=…dev.sopho.suofei/MainActivity`）。

⇒ **结论**：**一条观察，未解释、未复现**。建议按「待观察」记账（若再有人复现，再当缺陷追）；
本轮**不**据此宣称「目录页会乱跳」。

## 7 · 文件清单

| 文件 | 说明 |
|---|---|
| `01-hub.png` / `.dump.xml` | 目录页 · **首态全部收起**（`[+]` 汉 `[19] 首`，无诗题） |
| `02-hub-expanded-top.png` / `.dump.xml` | 目录页 · 展开 · 顶部（组头 `[−]` ＋ 前 14 首的前几首） |
| `03-hub-expanded-mid.png` / `.dump.xml` | 目录页 · 展开 · 下半（第 5–19 首全部在屏） |
| `04-hub-expanded-bottom.png` / `.dump.xml` | **与 03 逐字节相同**（再滚已到底 ⇒ 无更多内容） |
| `05-poem.png` / `.dump.xml` | 诗页 · `行行重行行`（居中／身份行／8 行不折／返回左·详情右） |
| `06-detail.png` / `.dump.xml` | 详情页 · 有 detail（诗题左对齐／来源带标签／`异文` 无竖线且同左沿） |
| `07-detail-empty.png` / `.dump.xml` | 详情页 · **无 detail 的如实说明**（`青青河畔草`） |
| `08-about.png` / `.dump.xml` | 关于页 · 常态（UpToDate）＋ 四条线合一 |
| `09-about-idle-INSTRUMENTED.png` / `.dump.xml` | 关于页 · **初态（instrumented 构建，见 §4）**：无状态元素、按钮下直接是链接 |
| `10-about-after-revert.png` / `.dump.xml` | 关于页 · **revert 后原包**，自动检查恢复（证明 §4 的 revert 干净） |
| `90-ANOMALY-first-tap-landed-on-about.png` / `.dump.xml` | §6 那次**未复现异常**的两份原始产物（**不是**正常流程的图） |
| `DEVICE-IDENTITY.txt` | `adb devices -l` ＋ `getprop` ＋ `wm size/density` ＋ 安装包身份 |
| `apksigner-verify-certs.txt` | `apksigner verify --print-certs` 原文（debug 证书） |
| `assembleDebug.log` | 首次构建（**真 exit 0**） |
| `assembleDebug-INSTRUMENTED.log` | instrumented 构建（**真 exit 0**） |
| `assembleDebug-after-revert.log` | revert 后重建（**真 exit 0**） |
| `check-bundled-content.log` | 内置内容一致性门（**真 exit 0**，§5-D3） |
| `install.txt` / `launch.txt` | `install -r` 回执 `Success` ／ `am start` 回执 |

**每一张 PNG 我都用 `read` 工具亲眼看过**（含上面列出的全部 **11 张**；其中 04 与 03 逐字节相同，我另按 md5 核对）。
