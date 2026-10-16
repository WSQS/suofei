# 杜甫《梦李白二首》入库后的**两端本地演练**（内容版本 `2026.10.16.25`）

> **这一份是什么**：一次**本地演练取证**。把《梦李白二首》其一/其二录成**两条独立条目**（新增「唐」组）后，
> 用**演练用内容版本 `2026.10.16.25`** 编译一次内容，把三份产物同步成同一 sha，再在 **Web（无头 Chromium）**
> 与 **Android（`emulator-5556` 上的 debug 构建）** 上各看一眼「唐组」这一段。
>
> **它不是什么**（别读成已完成的事）：
> - **不是发布**：没有 push、没有打 tag、没有部署 Pages、没有建 Release；**`APP_VERSION` 未改**（仍是 `0.1.3`）。
> - **不是真机验收**：Android 侧是 **debug 签名**的 debug APK，跑在 AVD 上，**没有碰用户手机**。
> - **不是像素级设计定稿**：只核结构、次序、路由、返回行为与文案。
> - ⚠ **线上仍是 0.1.3 / 20 首 / 2 组**。本文里的 `2026.10.16.25` 是**演练版本**，**不是**已发布内容版本。

---

## 1 · 被演练的内容与底本

| 项 | 值 |
|---|---|
| 新增条目 | `content/poems/杜甫/梦李白二首·其一.md`、`…其二.md`（**两条独立条目**，不合并） |
| 内容源 | **22 首 / 3 组**（`["汉","唐","近现代"]`），「唐」组＝这 2 首 |
| **底本** | **《全唐诗》卷二百一十八·杜甫〈梦李白二首〉（扬州诗局本）**；电子文本：汉典古籍 <https://gj.zdic.net/jibu/1230/34640.html>（2026-10-16 访问） |
| 校本（异文来源） | 识典古籍影印本《杜诗详注》卷七（清·仇兆鳌，四库全书本）、四部丛刊景宋刊本《分门集注杜工部诗》卷三、《御定全唐詩》卷二百十八、《杜诗论文》卷十二 等 |
| 来源与异文记录 | `docs/sources/dream-li-bai-intake.md`（R2 工作线） |
| 正文规模 | **每首 8 个印刷行（八联十六句）**，依底本原样分行；两首之间底本原文有空行 ⇒ 两条条目 |
| 三份产物同一 sha256 | `d2537787947fd9a6b2907d5351d0999ec7b7fd9a52ddd27accc56bdcd6283754`（`dist/content.json` ＝ `android/app/src/main/assets/content/content.json` ＝ `web/content.json`） |

**⚠ 两处标点的整理说明（不是异文）**：底本电子文本（汉典《全唐诗》）的排印标点一律「，。」，不分疑问句；
本仓**已在 A 线登过标点口径**（`docs/sources/gushi-shijiu-shou.md` §4：「疑问句用「？」，其余用「。」」），
故正文在 **其一「君今在罗网，何以有羽翼？」** 与 **其二「孰云网恢恢？」** 两处用「？」。
**只动标点、一个字未动**；另有一处异体字转写（`顦顇`→`憔悴`）按 A 线同样口径处理，不算异文。

## 2 · 门（本轮实跑，均为真 exit 状态）

| 门 | 命令 | 结果 |
|---|---|---|
| 内容校验 | `node tools/build-content.mjs --check --content-version 2026.10.16.25 --previous-version 2026.10.16.24` | **22 首 / 3 组，exit 0**（单调性检查通过；无 ID 撞车、无 `DYNASTY_UNDECLARED`） |
| 单元/契约套件 | `npm test` | **141 / 141 通过，exit 0** |
| 内置内容一致性 | `node tools/check-bundled-content.mjs` | **exit 0**（同步前**预期红**：内置 20 首/13 详情 vs 源 22 首/15 详情；同步后一致） |
| Android 单测 | `JAVA_HOME=<jdk17> ./gradlew :app:testDebugUnitTest --offline --no-build-cache --rerun-tasks` | **BUILD SUCCESSFUL，exit 0** |
| Web 端到端 | `CHROME_BIN=<chromium> node web/tests/e2e-cdp.mjs` | **460 / 460 通过，exit 0** |

## 3 · Web 演练（`web-dryrun.mjs`：无头 Chromium ＋ CDP，零第三方依赖）

- 脚本：`docs/reviews/ui-review/materials-dream-libai/web-dryrun.mjs`（**演练脚本**，不属于产品代码、不进任何测试套件）
- 结果：**35 / 35 通过，exit 0**（原文见 `web/web-dryrun.log`；页面文本转储见 `web/dom-dumps.txt`）
- 取证：`web/01-index-3groups-tang.png`（目录 3 组）、`02-poem-1.png`／`03-poem-2.png`（两首诗页）、
  `05-detail-1.png`／`06-detail-2.png`（两首详情页）
- 核到的结论：
  1. 目录**3 个组**：`汉 [19] 首` ／ `唐 [2] 首` ／ `近现代 [1] 首`；「汉」19 首首尾仍是行行重行行／明月何皎皎（**已发布内容未被改动**）。
  2. 「唐」组**2 首且次序 其一 → 其二**；两条 `data-poem-id` 不同（**两条独立条目**）。
  3. 两首**各自一条路由**：各自能打开自己的诗页（`data-poem-id` 各自相符、正文 8 行）与自己的详情页（`异文` ＋ 底本来源块）。
  4. 详情页「← 返回这首诗」**真点击**后回到**那一首**（不是目录、也不是另一首）；诗页「← 目录」照旧回到目录（`#/`）。
  5. 诗页**不出现**详情正文（detail 只在详情页）；整轮无未捕获异常。

## 4 · Android 演练（**只用 `emulator-5556`**）

设备身份原文见 [`android/DEVICE-IDENTITY.txt`](android/DEVICE-IDENTITY.txt)。

| 项 | 值 |
|---|---|
| serial（`-s` 用的） | **`emulator-5556`** |
| `ro.serialno` | **`EMULATOR36X1X9X0`**（与任务指定的身份一致 ⇒ 认定是**本仓自己的 AVD 实例**） |
| `ro.product.model` / `ro.product.device` | `sdk_gphone64_x86_64` / `emu64xa`（API 35） |
| **没碰** | `emulator-5554`（`model=V2364A`，**不是本仓镜像**）、`YOCTO`、`127.0.0.1:7776`、**用户手机** |
| 构建 | `JAVA_HOME=<jdk17> ./gradlew :app:assembleDebug --offline` ⇒ **exit 0** |
| 构建基底 | `git rev-parse HEAD` = **`e0a4e2c96b4605be4339d7d322204198e86e8cd3`** |
| APK | `android/app/build/outputs/apk/debug/app-debug.apk`（9,625,111 字节）<br>sha256 `de8028da59ac3d542fad8fde789286ed1ce4b4ef21b4b3ca44fab96f53c125a4` |
| `versionCode` / `versionName` | **4 / 0.1.3**（`output-metadata.json` 与设备 `dumpsys package` 两侧一致）——**`APP_VERSION` 未动** |
| ⚠ 签名 | **debug 证书**。**不得**表述为「发布同签名覆盖验证」。 |

**步骤与结论**（每一步都先 `uiautomator dump` 断言界面**再**点，点位取自 dump 的 `bounds`；每步都有 `.dump.xml` ＋ `.png`）：

| # | 动作 | 结论 | 取证 |
|---|---|---|---|
| 1 | 冷启（`am start dev.sopho.suofei/.MainActivity`，内容取自 APK 内置） | 目录 **3 组**：`[+] 汉 [19] 首`、`[+] 唐 [2] 首`、`[+] 近现代 [1] 首`；**首态全部收起** | `01-index.dump.xml` / `01-index.png` |
| 2 | 点「唐」组头 | 展开为 `[−] 唐 [2] 首`，**2 行**：`梦李白二首·其一 杜甫`、`梦李白二首·其二 杜甫`（**次序 1→2**） | `02-tang-expanded.*` |
| 3 | 点「其一」 | 诗页：题名 `梦李白二首·其一`、`杜甫 · 唐 · 五言古诗`、**正文 8 行**、有「详情」入口 | `03-poem-1.*` |
| 4 | 点「详情」 | 详情页：`底本与来源`（逐字含《全唐诗》卷二百一十八…）＋ `异文` **2 条** | `04-detail-1.*` |
| 5 | 点「返回」 | **回到 `梦李白二首·其一` 的诗页**（不是目录、也不是其二） | `05-after-back-from-detail-1.*` |
| 6 | 再点「返回」 | 回到目录，且「唐」组展开状态保留 | `06-back-to-library.*` |
| 7 | 点「其二」→「详情」→「返回」 | 诗页 8 行（含 `孰云网恢恢？`）；详情页 `异文` 2 条；**返回落在 `梦李白二首·其二` 自己的诗页** | `07-poem-2.*` / `08-detail-2.*` / `09-after-back-from-detail-2.*` |

### ⚠ 一处如实记录的**两端差异（标签，不是行为）**

详情页返回：**行为两端一致**（都回到**那一首**），但**按钮文案不同**——
Web 作「**← 返回这首诗**」，Android 作「**返回**」（Android 三个页面共用同一个 `LABEL_BACK` 常量，
`ui/ScreenContent.kt:86`）。这是**既有差异、不是本次改动引入的**；按「两端表现遵守同一约定、不要求像素级一致」，
本次**未改**它，在此如实登记，是否需要统一由负责人/用户定。

## 5 · 未做 / 边界

- **未 push、未打 tag、未部署 Pages、未建 Release、未预定 0.1.4**；**未改 `APP_VERSION`**。
- **未在真机验收**，**未安装到用户手机**；**未读签名私钥**。
- **未回收**任何工作树/分支（含 R2 研究会话的工作树）。
- 演练脚本（`web-dryrun.mjs`）是**一次性取证用**，不属于产品代码，也不加入 `npm test` / e2e 套件。
