# 「检查更新」按钮上下暗缝 —— 修前/修后实测取证（2026-10-16，会话 `wt/android-docs-reviews-ui-revi-299bac3d`）

> 范围：**只修按钮自身的绘制**（背景/边框同一个 box）。未发布、未打 tag、未推远端、未建 Release、未碰内容线。
> 设备：**只用 `emulator-5556`**（`ro.serialno=EMULATOR36X1X9X0`／`sdk_gphone64_x86_64`／SDK 35／1080×2400／density 420＝2.625 px/dp／font_scale 1.0，见 `DEVICE-IDENTITY.txt`）。
> ⚠ 纪律：**单测绿 ≠ 观感对**。下面每条结论都对应**一张我看过的图**＋`uiautomator` 几何＋**逐像素扫描**。

---

## 0. 一句话结论

用户报的「背景矩形与外框之间、上下各有一条暗缝」**真实存在、根因已证实**：
**边框画在两个不同的 box 上**——外框跟着 `minimumInteractiveComponentSize()` 被撑到 **48dp**（126px），
而按钮自己的 Surface（底色）只有 **40dp**（105px）⇒ 上下各露出约 **4dp 页面底色**。
修法：把边框交给按钮自己的 `border = BorderStroke(...)`（与 `containerColor` 同一个 Surface、同一个 `shape`）。
**修后边框盒 = 底色盒 = 105px（40dp），缝为 0**；`check-update` 节点（48dp）与可点节点（40dp）**修前修后逐字节相同**，
点击只发一次请求、Checking 禁用、关于页次序（按钮在上／状态在下）全部无变化。

---

## 1. 根因：**已证实**（两条独立证据）

### 1.1 源码/字节码证据（本机实际解析到的 material3 版本）

`android/gradle/libs.versions.toml` 的 `composeBom = 2025.07.00` ⇒ 本机 Gradle 缓存里解析到
`androidx.compose.material3:material3-android:1.3.2`（`~/.gradle/caches/.../material3-android/1.3.2/`）。

1. `ButtonKt.TextButton(...)` **确实有** `border: BorderStroke?` 形参（第 7 个）——
   `javap -classpath classes.jar androidx.compose.material3.ButtonKt` 的签名逐字：
   `TextButton(Function0, Modifier, boolean, Shape, ButtonColors, ButtonElevation, androidx.compose.foundation.BorderStroke, PaddingValues, MutableInteractionSource, Function3, Composer, int, int)`
   ⇒ 本任务第 2 步（交给按钮自己画）**可用**。
2. 可点 `Surface` 的链顺序（`javap -c androidx.compose.material3.SurfaceKt$Surface$2`）：
   `$modifier.minimumInteractiveComponentSize()` → `access$surface-XO-JAsU(modifier, shape, color, border, elevation)` → `clickable(...)`
   ⇒ **`minimumInteractiveComponentSize()` 在外，`surface(...)` 在内**。
3. `surface-XO-JAsU` 内部（`javap -c androidx.compose.material3.SurfaceKt`）：
   `graphicsLayer(阴影) → BorderKt.border(border, shape) → BackgroundKt.background(color, shape) → ClipKt.clip(shape)`
   ⇒ **底色与边框由同一个 draw 节点、按同一个 bounds 画**（`Modifier.border` 先 `drawContent()` 再描边，所以描边压在底色上、可见）。
4. 按钮内容行（`javap -c androidx.compose.material3.ButtonKt$Button$2$1`）：
   `Row(Modifier.defaultMinSize(MinWidth, MinHeight).padding(contentPadding))`，且
   `ButtonDefaults$1.<clinit>` 里 `MinWidth = 58`、`MinHeight = 40`（`bipush 40 ... putstatic Field MinHeight`）
   ⇒ 按钮**自己的 Surface 高度至少 40dp**，而最小交互盒是 48dp。
5. 原代码把边框写在 `TextButton(modifier = Modifier.border(...))` —— **用户传入的 modifier 是最外层**，
   所以它跟着 `minimumInteractiveComponentSize()` 一起被撑到 48dp。

⇒ 48dp（边框盒）vs 40dp（底色盒）＝上下各 4dp 露底 ⇒ **就是那两条暗缝**。

### 1.2 设备逐像素证据（`emulator-5556`，enabled 态，按钮竖中线 x=150）

修前（`before/01-about-enabled-before.png`，`ffmpeg -f rawvideo -pix_fmt rgb24` 后逐像素扫）：

```
500..514  (15 px)  #0e1315   ← 页面底色
515..517   (3 px)  #27504c   ← 上边框描边（1dp≈2.6px）
518..525   (8 px)  #0e1315   ← ★ 暗缝（上）
526..630 (105 px)  #152324   ← 按钮自己的底色（40dp）
631..637   (7 px)  #0e1315   ← ★ 暗缝（下）
638..640   (3 px)  #27504c   ← 下边框描边
641..660  (20 px)  #0e1315
```
另扫一条横线 y=521（正在「缝」里）：`137..139` 是左边框描边、**`140..334` 整段是页面底色**（194px）、`336..338` 是右边框
⇒ 缝是**通长一条**，不是圆角处的局部现象。

修后（`after/01-about-enabled-after.png`，同一列、同一区间）：

```
500..525  (26 px)  #0e1315
526..528   (3 px)  #2b5a55   ← 上边框描边
529..627  (99 px)  #152324   ← 按钮底色
628..630   (3 px)  #2b5a55   ← 下边框描边
631..660  (30 px)  #0e1315
```
⇒ 边框盒 `526..630` ＝ 底色盒 `526..630` ＝ **105px（40dp），缝 0**。

### 1.3 三组 bounds（uiautomator，修前 vs 修后**完全相同**）

| 组 | 修前 | 修后 | 说明 |
|---|---|---|---|
| **触摸/最小交互区**：`resource-id="check-update"`（testTag 语义节点；`minimumInteractiveComponentSize()` 的布局盒） | `[137,516][339,642]`＝202×126px＝**76.95×48.0 dp** | **同左，逐字节相同** | 未改；«保持至少平台建议的触摸大小» 的 48dp 盒还在 |
| **可点节点**：`class="android.widget.Button"`（material3 内部 `clickable(...)` 节点） | `[137,526][339,631]`＝202×105px＝**76.95×40.0 dp** | **同左，逐字节相同** | 这是**真正能点**的区域（见 §4 实测）；本次未动 |
| **按钮自身表面**（底色盒；修后＝边框盒） | 底色 105px／边框 **126px**（两者不同 ⇒ 缺陷） | **两者都是 105px** | 修的就是这一条 |

可见矩形宽度：修前修后都是 `[137,338]`＝202px（宽度由内容决定，本来就没有差异）。

---

## 2. 修法（`android/app/src/main/java/dev/sopho/suofei/ui/Screens.kt` 只动 `UpdateButton`）

```kotlin
border = BorderStroke(                                   // ← 交给按钮自己的 Surface
    width = PoetryTokens.HAIRLINE_DP.dp,
    color = if (enabled) PoetryTokens.accentLine else PoetryTokens.line,
),
...
modifier = Modifier.testTag("check-update"),             // ← 原来这里是 Modifier.border(...).testTag(...)
```
**为什么现在两者同 bounds**：material3 1.3.2 的 `Surface(...)` 内部是
`modifier.minimumInteractiveComponentSize().surface(shape, color, border, …).clickable(…)`，
而 `surface(...)` 里 `border(border, shape) → background(color, shape) → clip(shape)` **是同一个节点上的同一段链**
⇒ 边框和 `containerColor` 由**同一个 draw 节点、同一个 shape、同一份 bounds** 画出，结构上不可能再错位。
（同仓 `PendingBanner` 早就是这种「同一链里 `.background()`＋`.border()`」的写法：那里两个 modifier 也在**同一个盒子**上。）

**没有用的手段**（用户明确不要）：没关全局最小触控、没动可点区、没加外卡片、没做双边框、没硬裁文字。

**一个必须说清的可见后果**：**可见盒子由 48dp 变 40dp**（40dp 来自 material3 `ButtonDefaults.MinHeight`，不是我改的令牌）。
可点区**没变**（105px，修前修后同一个节点同一 bounds）；变的只是「原来那条画大了一圈的边框」。若负责人口径是
「可见盒子也要 48dp」，那不是这次的口径，做法也不同（要显式把按钮自己的表面撑到 48dp），**本次没做**。

---

## 3. 两个状态的图（每张都亲眼看：局部放大 4× ＋ 完整关于页）

| 文件 | 状态 | 我看到的 |
|---|---|---|
| `before/01-zoom-button-before.png`（4×） | enabled，修前 | 青色外框**明显比**深绿底色大一圈，上下各有一条**底色露出来**的暗带，暗带通长 |
| `before/01-about-enabled-before-page.png` | enabled，修前 | 整页：返回／索斐／应用版本 0.1.2／内容版本 2026.10.16.23／检查更新按钮／「已是最新内容（远端 2026.10.16.23）。」／置底 URL；按钮在上、状态在下 |
| `after/01-zoom-button-after.png`（4×） | enabled，修后 | 边框**直接压在底色矩形上**，上下再无暗带；盒子比修前略矮（48→40dp） |
| `after/01-about-enabled-after-page.png` | enabled，修后 | 与修前整页**逐项相同**（次序、文案、字段集都没变），只有按钮盒子矮了 4dp |
| `after/03-about-enabled-cleanbuild.png` | enabled，修后（**当前设备上那个干净包**） | 复核用：像素扫描与 `after/01-…` **逐段相同** |
| `before/02-zoom-button-checking-before.png`（4×） | Checking（禁用），修前 | 暗色轮廓**高一些**（48dp），文字与状态「正在检查…」都在 |
| `after/02-zoom-button-checking-after.png`（4×） | Checking（禁用），修后 | 暗色轮廓 = 40dp，与 enabled 态同一盒子 |
| `after/02-about-checking-after-page.png` | Checking，修后 | 整页：按钮变暗（禁用）、下方「正在检查…」；次序不变 |
| `before/hub.png` | 目录页 | 定位「关于」入口用（顺带可见 `[19] 首`＝**APK 内置仍是 19 首**，本轮**未碰**内容线） |

> 禁用态一句实话：`disabledContainerColor = PoetryTokens.bg` ＝ 页面底色 ⇒ 禁用态**底色与页面同色**，
> 所以「缝」在禁用态**本来就看不出颜色差**；修前修后能看出的是**轮廓盒高**（126px→105px）。
> 逐像素（x=150）：修前描边在 `515..517` 与 `638..640`（126px），修后 `526..528` 与 `628..630`（105px）。

---

## 4. 行为：一次点击 = 一次请求、Checking 真禁用（**临时 instrumented 包**，已 revert）

**为什么用 instrumented**：应用**没有任何日志**（`grep -rn "Log\." android/app/src/main/java` 为空），
真机要点清「一次点击几个请求」就必须有个观测点。所以**临时、未提交**地加了一行：

```kotlin
private fun openConnection(url: String, userAgent: String): HttpURLConnection {
    // TEMP-INSTRUMENTED-2026-10-16（未提交；只为在真机上数「一次点击 = 几个请求」）
    android.util.Log.i("suofei-update-probe", "REQ $url")
```
（`openConnection` 是 `getText`/`download` 的唯一出口 ⇒ 这一行 = 每个 HTTP 请求一行。）

- instrumented APK sha256 `d937180fb8563b61d791c6b514fcc255033a1b2ee421442045ccff7f8a162b17`（**不随本报告提交**）。
- **截完/量完已 revert＋重建＋重装原包**：`git status --short` 只余 `Screens.kt` 与未跟踪的本目录；
  重装后 `12f0fb27…`→（又一次干净构建）`34049408a11932035b1e9bf5125cf6bb932da1597ad4c473ba049467bedfcaab`，**设备上跑的是未改动源码的包**。

| 测 | 逐字结果 |
|---|---|
| 冷启动自动检查（`LaunchedEffect` 那条） | `probe 行数 = 1`：`I suofei-update-probe: REQ https://wsqs.github.io/suofei/content/latest.json` |
| **正常网络下真实点一次**「检查更新」 | **`probe 行数 = 1`**（同上同一条 URL），随后状态文本 `已是最新内容（远端 2026.10.16.23）。` |
| 飞行模式下：点一次 + **追加 3 次**（全在同一个 Checking 窗口内） | `check-update enabled="false"`、状态仍是 `正在检查…`、**`probe 行数 = 1`** ⇒ 追加的 3 次点击**一个请求都没发** |
| 恢复网络后 | 单一终态：`更新未生效，旧内容保留：取更新清单失败：timeout`；内容版本仍是 `2026.10.16.23`（旧内容没被动） |

**可点区实测（root 临时 iptables 计数链，只数该 UID 到 :443 的包，测完已删）**：

| 点在哪 | 结果 |
|---|---|
| (238, 579) 按钮中心（40dp 可点盒内） | 有出向包（`3→7` 个 SYN；GitHub Pages 有多个 A 记录，一次请求会试多条连接 ⇒ **SYN 数 ≠ 请求数**，只当「有没有发」的开关用） |
| **(238, 520)**：48dp 盒内、40dp 可点盒**外** | **0 个包** ⇒ **不可点** |
| (238, 530)：40dp 可点盒内 | 有出向包 ⇒ 可点 |

⇒ 那句「48dp 最小交互盒」是**布局/无障碍盒**；material3 里真正 `clickable` 的节点是 **40dp** 的内容盒
（`minimumInteractiveComponentSize()` 在 `clickable` 之外，见 §1.1）。**这是 material3 既有行为，修前修后一致，不是本次引入的。**

---

## 5. 构建 / 单测（真 exit）

```bash
# 修前
cd android && JAVA_HOME='C:/Users/wsqsy/.jdks/ms-17.0.17' ./gradlew assembleDebug --offline > 日志 2>&1; echo $?   # EXIT=0
# → android/app/build/outputs/apk/debug/app-debug.apk  sha256 1c9ae7488076847cbf592274f534d83c265c9782733ebc15219a1ce0f60f4fb5
# 修后（干净）
... assembleDebug --offline   # EXIT=0 → sha256 12f0fb27eedab1b407b010c2f56ac36ec44e973aada3e2864d8c2d59c61b7764
# instrumented（+probe 一行）  # EXIT=0 → sha256 d937180fb8563b61d791c6b514fcc255033a1b2ee421442045ccff7f8a162b17
# revert 后干净重建           # EXIT=0 → sha256 34049408a11932035b1e9bf5125cf6bb932da1597ad4c473ba049467bedfcaab（当前设备装的就是它）
# 单测
JAVA_HOME='C:/Users/wsqsy/.jdks/ms-17.0.17' ./gradlew testDebugUnitTest --offline --no-build-cache --rerun-tasks > 日志 2>&1; echo $?   # UNIT EXIT=0
```
⚠ **APK 不是逐字节可复现的**（同一份源码不同次构建 sha 不同），所以上面记的是**每次构建实际产物的 sha**。
⚠ 屏幕观感类的东西**单测测不到**；本轮加的守卫是**源码级**的（见 §6），它只保证「接线没断」，**不代替看图**。

设备上安装包与本地产物核对：`adb shell pm path dev.sopho.suofei` → `exec-out cat … | sha256sum` ＝ 本地 APK 的 sha256（逐字相等）。

---

## 6. 本轮新增的源码级守卫（`android/app/src/test/java/dev/sopho/suofei/ScreenInventoryTest.kt`）

1. `updateButton_drawsItsBorderOnTheSameBoxAsItsBackground`：
   `border = BorderStroke(` 必须在、`UpdateButton` 里**不得**出现 `.border(`／`.background(`／`.clip(`；
   并钉住 `enabled = enabled`、文字「检查更新」、`onClick = onClick` 只出现一次。
2. `aboutScreen_putsTheButtonAboveTheStatusLine`：`UpdateButton(` 的位置必须在 `update-status` **之前**
   （防把次序倒过来——本轮任务书曾把这条写反并由用户当场纠正）。

---

## 7. 未做 / 边界（**只报不改**）

1. **没碰内容线**：`content/poems/毛泽东/…` 一字未动、`android/app/src/main/assets/content/content.json` 未重编
   （目录页仍显示 `[19] 首`），没跑发布门，没同步内置产物。
2. **没发布**：没 `git push`、没打 tag、没建 Release、没部署 Pages、没读签名私钥。
3. **只用了 `emulator-5556`**；`emulator-5554`(PD2364)、`YOCTO`、`127.0.0.1:7776`、用户手机一律未碰。
   为此轮取证临时 `adb root` 过（用 iptables 计数），**结束时已 `adb unroot`**，并核对 `adb devices -l` 与开始时一致。
4. **其它按钮有没有同样画法**：全工程只有**一个** `TextButton`（`UpdateButton` 自己）；
   另一个「边框＋底色」的盒子是 `PendingBanner`（`Screens.kt` 约 283–288），它把 `.background()` 与 `.border()`
   写在**同一条链**上（同一个节点）⇒ **没有**这个缺陷。`StructuralMarks.kt` 只画底色、无边框。**只报不改**。
5. **主题**：本端只有 `darkColorScheme` 一套（`Theme.kt` 只有 `PoetryColorScheme`）⇒ 没有「另一套主题下再验」这回事。
6. **没验**：横屏／旋转、系统字号放大、关于页压窄到 560px、真机手感。
7. **没验**：「可见盒子该不该是 48dp」——这是**口径问题**（见 §2 末尾），我没替它决定。
8. **没验**：`Activated`（新内容切换生效）态——与按钮绘制无关，且真实远端清单版本**不高于**内置版本，本轮不涉及。

---

## 8. 复现要点

```bash
export MSYS_NO_PATHCONV=1      # 否则 adb pull /sdcard/... 会被 Git-Bash 改写成 C:/Program Files/Git/sdcard/...
adb -s emulator-5556 shell "getprop ro.serialno"          # -> EMULATOR36X1X9X0
cd android && JAVA_HOME='C:/Users/wsqsy/.jdks/ms-17.0.17' ./gradlew assembleDebug --offline
adb -s emulator-5556 install -r app/build/outputs/apk/debug/app-debug.apk
adb -s emulator-5556 shell "am force-stop dev.sopho.suofei; monkey -p dev.sopho.suofei -c android.intent.category.LAUNCHER 1"
adb -s emulator-5556 shell "input tap 908 162"            # 目录页右上「关于」
adb -s emulator-5556 shell "uiautomator dump /sdcard/ui.xml"
adb -s emulator-5556 shell "screencap -p /sdcard/x.png"   # 注意：整条命令要加引号，且 -p 后面带文件名
# 逐像素：png -> rgb24 裸数据 -> node tools/scan-column.mjs <raw> 1080 2400 col 150 500 660
ffmpeg -y -i x.png -f rawvideo -pix_fmt rgb24 x.raw
# 局部放大 4×
ffmpeg -y -i x.png -vf "crop=282:206:107:486,scale=1128:824:flags=neighbor" x-zoom.png
# Checking 态（约 60s 窗口，无需改代码）
adb -s emulator-5556 shell "cmd connectivity airplane-mode enable; svc wifi disable; svc data disable"
adb -s emulator-5556 shell "input tap 238 579"
adb -s emulator-5556 shell "cmd connectivity airplane-mode disable; svc data enable"   # 记得恢复
```

工具：`tools/scan-column.mjs`（沿竖线/横线按颜色跳变切段，打印每段的像素区间与 RGB；见文件头注释）。
