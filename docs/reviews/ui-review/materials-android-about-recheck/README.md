# 关于页复核（最新合并代码在项目 AVD 上重建，2026-10-16，会话 `wt/child-a4ed5a79`）

> 范围：**只在本项目自己的 AVD（`emulator-5556`）上重建并复核「关于」页**。未发布、未打 tag、未推远端、未部署 Pages、未建 Release、未碰用户手机，也未碰另外三台设备。
> ⚠ 写死的一条纪律：**测试绿 ≠ 观感符合**。下面每条结论都对应**一张我看过的截图**＋`uiautomator` 几何，`dumps/` 里留着原始 XML。
> ⚠ **本轮不发布**，所以**任何一条都不得当成「发布过的 release 包的同签名覆盖验证」**（见 §7 D3）。

---

## 0. 一句话结论

**关于页 4 项字段集 ✅、V3 四线合一 ✅、初态只按钮 ✅、更新块可复现的三种真实状态 ✅**——四项要求逐项在设备上对上了采纳锚（`items/app-ui/history/round-2026-10-16-about-min/`）。
**S4 报告里那两条不达标（去审的 D1 标签含「来源」、D2 残留「一句话说明／诚实的限制」）都已消失**。
**一条待确认的口径**：仓库链接在本端是**不可点的纯文本裸 URL**（原型是 `<a href>`）——见 §6 D1，**需要负责人/用户拍板，我没有替它决定**。

---

## 1. 设备身份与占用（证据：`DEVICE-IDENTITY.txt`）

| 序列号 | 型号 / 身份 | 判定 | 本会话 |
|---|---|---|---|
| **`emulator-5556`** | `sdk_gphone64_x86_64`，`ro.boot.qemu.avd_name=Pixel_6`，SDK 35，x86_64，1080×2400 / density 420 / font_scale 1.0 | **本项目 AVD** | ✅ **只用它**，每条命令都带 `-s emulator-5556` |
| `emulator-5554` | `PD2364 / V2364A` | vivo 机型，**非本项目** | 🚫 未触碰 |
| `YOCTO` | 车机 | **非本项目** | 🚫 未触碰 |
| `127.0.0.1:7776` | `vext_auto8668p1_64_vm_paravirt` | **非本项目** | 🚫 未触碰 |

- **本项目在前台**（实测）：`mCurrentFocus=Window{eeabe14 u0 dev.sopho.suofei/dev.sopho.suofei.MainActivity}`、`mFocusedApp=ActivityRecord{7963ee u0 dev.sopho.suofei/.MainActivity t87}`。
- **本会话没有重启过模拟器** ⇒ 不涉及「启动前后新出现的序列号」那一步；因此 `ANDROID_AVD_HOME` 也未用到。

---

## 2. 重建用的基底与产物

| 项 | 值 |
|---|---|
| 工作树 | `<worktree>`（分支 `wt/child-a4ed5a79`） |
| **基底 sha** | **`23f4757`**（`merge(android): 关于页字段集同步为 4 项 …`）＝ 本工作树 HEAD ＝ 我构建时本地 `master` 的 tip |
| 内核事实 | 复核时本地 `master` 已前进到 **`abc1e2b`**；`git diff --name-only 23f4757 abc1e2b` ⇒ 只动 `docs/design/implementation-plan.md`、`docs/status.md`、`items/graph.md`，**`android/` 一个字没动** ⇒ 构建输入与我这次用的完全相同 |
| `origin/master` | **`eb33f11`**（落后本地 6 个提交）—— 本轮**没有 push**，所以「最新合并代码」目前**只存在于本地** |
| 构建 | `cd android && JAVA_HOME=…ms-17.0.17 ./gradlew assembleDebug --offline` ⇒ **EXIT=0** |
| 产物 | `android/app/build/outputs/apk/debug/app-debug.apk`，`package=dev.sopho.suofei versionCode=2 versionName=0.1.1`，label `索斐`，targetSdk 36，**debug 签名** |
| 设备上那个包的 sha256 | `470662e4e571b8bf5bc3f7eb592865dade626fb8ca4b2d5a2e330b1e3794488f` |
| 证书 | `signatures:[a6bc0efa]`（**Android Debug**）—— 与上一会话留在设备上的 vc3 演练包**同一把 debug 证书**（两者都是 debug 构建） |

> ⚠ **APK 不是逐字节可复现的**：同一份源码我第一次构建得 `fb8366ee…`、revert 之后重建得 `470662e4…`，sha 不同。
> 所以上表记的是**设备上那个包**的 sha，而不是「本源码的唯一 sha」。

---

## 3. 复核项 1 —— 关于页 4 项字段集

**证据**：截图 [`00-about-uptodate.png`](00-about-uptodate.png)（**我亲眼看过**）＋ [`dumps/ui-about-uptodate.xml`](dumps/ui-about-uptodate.xml)

整页可见文本**逐字**只有这些（`uiautomator` 全量列出，不是挑选）：

```
返回
索斐
应用版本   0.1.1
内容版本   2026.10.16.22
检查更新
已是最新内容（远端 2026.10.16.20）。
https://github.com/WSQS/suofei
```

| 要求 | 实测 | 结论 |
|---|---|---|
| **应用名当页标题** | 「索斐」＝品牌字号大号标题，在 `[137,259][235,320]`，位于整页最上（顶行「返回」之下） | ✅ |
| **应用版本** | 标签「应用版本」，值 `0.1.1`（＝`PackageInfo.versionName`） | ✅ |
| **内容版本（标签不带「来源」）** | 标签**逐字＝「内容版本」**，值 `2026.10.16.22`；**全页 `来源` 命中数 = 0**（5 份 dump 全为 0） | ✅ **S4 的 D1 已修复** |
| **仓库链接置底裸 URL** | `https://github.com/WSQS/suofei`，是**最后一个**内容元素（其下无任何元素） | ✅（但**不可点**，见 §6 D1） |
| **不再有「一句话说明」** | 「个人诗歌阅读（离线可读）。」等文字**全页命中 0** | ✅ **S4 的 D2 已删** |
| **不再有「诚实的限制」** | 同上，命中 0 | ✅ |
| **页次序＝A3** | 返回 → 应用名 → 版本相邻组 → 更新块 → 仓库链接置底 | ✅ |

---

## 4. 复核项 2 —— V3「四条线合一」对齐

**证据**：同一张 [`00-about-uptodate.png`](00-about-uptodate.png) ＋ dump；另在 4 个不同状态下重复量过（对齐线与状态无关）。

采纳锚 V3 的定义：**版本标签文字左沿 ＝ 内容左沿（线 A）＝ 按钮外沿 ＝ 状态文本左沿**，**值仍落在右侧同一条值列**。

| 线 / 元素 | 实测 x（屏幕 px） | 换算 dp（density 2.625） | 结论 |
|---|---|---|---|
| 内容列盒子 | `[93, 988]` | — | 页面容器 |
| **线 A 内容左沿**（行内沿 `--edge-x` 1.05rem） | **137** | 52.2 | 基准 |
| 应用名「索斐」左沿 | **137** | 52.2 | ✅ 在线 A |
| **标签文字**左沿（应用版本 / 内容版本） | **137** | 52.2 | ✅ 在线 A（左对齐） |
| **按钮外沿**（`check-update` 节点 `[137,516][339,642]`） | **137** | 52.2 | ✅ 在线 A |
| **状态文本**左沿（`update-status`） | **137** | 52.2 | ✅ 在线 A |
| 仓库链接左沿（`about-repo`） | **137** | 52.2 | ✅ 在线 A |
| **值列左沿**（`0.1.1` / `2026.10.16.22`） | **337** | **76.19 dp**（距线 A） | ✅ 采纳锚算的是 `5.2em×0.82rem + 0.5rem = 68.22 + 8 = 76.22 px` ⇒ **Δ0.03px** |
| 标签列宽（137→316） | 179 px | **68.19 dp** | ✅ 采纳锚 `68.22` |
| 〔观测量〕按钮文字墨迹左沿（166）− 按钮外沿（137） | **+29 px** | **+11.05 dp** | ⚠ 采纳锚观测值是 **+12.18 px**，差 ≈1px：原因可读码确认——Compose 的 `Modifier.border` **只画不占布局**，所以本端只有 0.7rem＝11.2dp 内边距；CSS 的 `border` 占 1px，所以是 `1 + 11.2`。**采纳锚自己把它列为「观测量」，不是要求** |
| 状态文本**第二行**左沿 − 第一行左沿（离线失败是多行） | **0** | 0 | ✅ 无按行缩进 |

**行数与折行（真实文案）**：`已是最新内容（远端 2026.10.16.20）。` 1 行；离线失败文案 2 行（第二行 `timeout`）—— 两行左沿同为 137（截图可见第二行与第一行齐头）。

> 一处**如实说明**：本地两条标签都是**4 个字**（应用版本/内容版本），所以采纳锚点名的 V3 代价「长短不等的标签会让标签↔值间隔参差」**在本机看不出来**——和采纳锚的原话一致，我没有假装验过它。

---

## 5. 复核项 3 —— 初态只按钮（Idle 不生成状态元素）

**证据**：截图 [`03-about-idle-initial-INSTRUMENTED.png`](03-about-idle-initial-INSTRUMENTED.png)（**我亲眼看过**）＋ [`dumps/ui-about-idle.xml`](dumps/ui-about-idle.xml)

### 5.1 先说清楚这张图是怎么来的（**重要，别误用**）

**真机上截不到 Idle**：`MainActivity` 里 `LaunchedEffect(Unit) { state.initialLoad(); state.checkForUpdate() }`
⇒ **一进应用就自动检查**，Idle 只活几毫秒，而关于页要点击才到达 ⇒ 到达时 Idle 必然已经过去。

所以我**临时改了一处、单独构建了一份包**来把它截出来（**未提交、未推送、截图后立刻 revert**）：

```diff
-                        state.initialLoad()
-                        state.checkForUpdate()
+                        state.initialLoad()
+                        // TEMP-INSTRUMENTED (uncommitted, for capturing the Idle initial state only)
+                        // state.checkForUpdate()
```

- 该临时包 APK sha256 `2c16f980d9372f1e734ca72d6730ce618465d501ba082790f917ef45991f07cc`（**不随本报告提交**，9.6 MB）。
- **revert 后重建并重装**了原包（`git checkout -- …/MainActivity.kt`，`git status` 干净），随后**冷启动实测自动检查确实又生效**（见 [`04-about-after-revert.png`](04-about-after-revert.png)：没点按钮就已经是「已是最新内容（远端 2026.10.16.20）。」）⇒ 设备上现在跑的是**未改动的构建**。
- 文件名与本节都标了 `INSTRUMENTED`，**防止这张图被当成「原包的直接截图」**。

### 5.2 三个独立证据

| 证据 | 实测 | 结论 |
|---|---|---|
| ① **元素存在性** | Idle 页 dump 里 `update-status` 命中数 = **0**（不是空串、不是不可见占位） | ✅ |
| ② **块高算术**（采纳锚用的同一招） | 有 1 行状态时仓库链接 top=**749**；Idle 时 top=**679** ⇒ **Δ70px**；而状态行自身高 **49px** ＋ 按钮→状态间距 **21px**（0.5rem×16×2.625）＝ **70px** ✅ 差为 0 | ✅ 那 70px **整个消失**，没有留空位 |
| ③ **节间距**（Idle 时按钮直接接仓库链接） | 按钮底 642 → 仓库 top 679 ＝ **37px ＝ 14.1dp** ≈ `--sec-gap` 0.9rem＝14.4dp | ✅ 直接跳节间距，不是 0.5rem 行间距 |
| ④ **源码守卫**（读码，不是测出来的） | `Screens.kt`：`if (state.updateStatus !is UpdateStatus.Idle) { … Text(updateStatusText(…)) }`；`AppState.updateStatus` 初值 = `UpdateStatus.Idle` | ✅ 与①一致 |

> 「尚未检查。」这句仍在 `UpdateStatusText.kt` 里，但被④那道守卫挡住 ⇒ **本端渲染不出来**（`updateStatusText` 的 JVM 单测仍覆盖它）。

---

## 6. 复核项 4 —— 更新块的真实状态

**证据**：`00`（已在最新）、`01`（检查中）、`02`（离线失败）三张截图，**我都亲眼看过**。

| 状态 | 截图 | 实测文案（逐字） | 结论 |
|---|---|---|---|
| **已是最新** `UpToDate` | [`00-about-uptodate.png`](00-about-uptodate.png) | 「已是最新内容（远端 2026.10.16.20）。」 | ✅ 稳定复现（联网即可） |
| **检查中** `Checking` | [`01-about-checking.png`](01-about-checking.png) | 「正在检查…」；`check-update` 节点 `enabled="false"`（**按钮真禁用**，视觉上边框与文字都变暗） | ✅ 真实状态；本轮因为断网后请求要等到超时，所以**这次能截到**（约 60 秒窗口） |
| **离线失败** `Failed` | [`02-about-offline-failed.png`](02-about-offline-failed.png) | 「**更新未生效，旧内容保留：取更新清单失败：timeout**」（2 行） | ✅ 稳定复现 |
| `Activated`（新内容已切换生效） | — | — | ⚠ **本轮未复现**，见 §7 D2 |

**离线是怎么断的（可复现）**：

```bash
adb -s emulator-5556 shell cmd connectivity airplane-mode enable
adb -s emulator-5556 shell svc wifi disable ; adb -s emulator-5556 shell svc data disable
adb -s emulator-5556 shell dumpsys connectivity | grep "Active default network"   # -> none
# …点「检查更新」…
adb -s emulator-5556 shell cmd connectivity airplane-mode disable
adb -s emulator-5556 shell svc data enable                                        # -> Active default network: 102 (eth0)
```

- **失败后旧内容确实没被动**：状态文本出来的同一份 dump 里，「内容版本」**仍是 `2026.10.16.22`**（＝内置产物版本）。
- **没有发明任何未批准的状态**：本轮**没有出现也没有去画** 进度/取消/待切换/延后/新内容可用。整页可见文本只有 §3 列的那 9 条 ＋ 状态行。
- 一个**如实的小差别**：S4 报告里的离线失败原因是「…失败：Unable to resolve host "wsqs.github.io": No address associated with hostname」，我这次拿到的是「…失败：**timeout**」——飞行模式下**没有默认网络**，请求等到了超时，而不是 DNS 立刻报错。**两者都是真实文案**，区别只是失败原因字符串。

---

## 7. 差异清单（逐条给性质 / 理由 / 代价）

| # | 差异 | 性质 | 依据 / 理由 / 代价 |
|---|---|---|---|
| **D1** | **仓库链接在本端是「不可点的纯文本」**：`about-repo` 节点 `clickable="false"`；**实测点它没任何反应**（前台仍是 `dev.sopho.suofei/.MainActivity`，没有浏览器 Activity 起来） | ⚠ **待定口径（求审，我没替它决定）** | 采纳锚 ④ 写的是 `<a href="https://github.com/WSQS/suofei">…</a>`（**可点**）；而本轮任务书写的是「仓库链接置底**裸 URL**」（指向纯文本）。两条**指向不同**。代价：若判为要可点，本端需加 `LinkAnnotation`/`LocalUriHandler`＋一条可核断言；若判为纯文本，原型那侧要说明为何不点。**我不改代码、也不开提问卡**，把两条并列交上去。 |
| **D2** | `Activated`（「新内容 … 已下载、校验通过并已切换生效」）**本轮未复现** | ⚠ **未验范围**（不是差异、不是缺陷） | 真实更新源的清单版本是 **2026.10.16.20 < 内置 2026.10.16.22** ⇒ 真实端点**给不出更新的内容**，`checkAndUpdate` 只会返回 `UpToDate`。要在设备上复现必须像 S4 那样**改 `BASE_URL` 起本地源** ⇒ 那会变成**另一个构建**，超出「用最新代码重建复核关于页」的范围，本轮没做。**S4 已在旧基底 `eb33f11` 上验过这一条**（那份证据仍然有效，但**不是**最新基底）。 |
| **D3** | 设备上**不是**「发布过的 release 包的同签名覆盖安装」 | ⚠ **有意偏离 + 口径必须说清** | 最新代码 `versionCode=2`，而设备上原有的是**上一会话自己升到 vc3 的 debug 演练包** ⇒ 覆盖安装会是**降级**（`INSTALL_FAILED_VERSION_DOWNGRADE`）。我于是：`adb uninstall dev.sopho.suofei`（**卸载的是上一会话的 debug 演练产物，不是用户设备上的东西**）→ `adb install` 全新装 vc2 debug。**本轮不发布**，所以不得表述成 release 同签名覆盖验证。**上一会话「为装 debug 包而卸载了模拟器上原装 release 签名包」这一事实原样保留**（我没有、也无法把那个 release 包装回去）。 |
| **D4** | `03` 那张 Idle 图来自**临时改过的构建** | ⚠ **过渡态证据（已显著标注）** | 见 §5.1；已 revert＋重建＋重装，并实测原包自动检查恢复。若把这张图当成原包截图会误导 ⇒ 文件名带 `INSTRUMENTED`、正文单独成节。 |
| **D5** | 关于页**没有**「来源（内置／已下载）」、**没有**失败态换色 | ⚠ **未批准，因此正确地没有** | 采纳锚「本页不画『来源』」「失败态按原话不换色」；本轮实测：全页 `来源` 命中 0，失败态与「已是最新」是**同一形态、只换文本**。**符合**，登记在此只为对抗「以后有人以为该有」。 |
| **D6** | 断网时 `ping 8.8.8.8` **在联网状态下也是 100% 丢包** | ⚠ 环境事实（避免误判） | 所以**不能用 ping 判断这台模拟器有没有网**；我用的是 `dumpsys connectivity` 的 `Active default network`（`none` ↔ `102`）＋应用侧真实结果。ICMP 被 NAT/宿主挡掉，HTTP 是通的。 |

---

## 8. 我没做 / 没验的部分（如实列出）

1. **没发布**：没 `git push`、没打 tag、没建 Release、没部署 Pages、没改远端。
2. **只用了 `emulator-5556`**；`emulator-5554`、`YOCTO`、`127.0.0.1:7776`、**用户手机**一律没碰；**没重启模拟器**、没按 `emulator-*` 模式批量操作。
3. **没碰** `web/`、`tools/`、`schema/`、`content/poems/**`、`items/**`（只读）、任何 `item.md`；**没碰主树**。
4. **没跑单测 / 没跑 Web 门 / 没跑 CI**：本轮是**设备复核**；「单测绿」本来也不能证明观感，所以我没拿它当证据，也没重跑它。
5. **没验**：`Activated` 状态（D2）；横屏；压窄到 560px 的关于页；系统字号放大；深浅色；真机手感（用户已定不做）。
6. **没验**：仓库链接该不该可点（D1，交给负责人/用户）。
7. **没验**：`Checking` 的**时长**是否可接受（这次能截到它，是因为断网让请求等到超时；联网时它极短）。这是**观感/体验**问题，我只能说「截到了」，不能说它慢或快。
8. **临时构建的那份 instrumented APK 没进仓库**（只记 sha）。
9. **本会话没有新建子会话、没有开 `question_ask`**（按任务书）。

---

## 9. 每张图我有没有亲眼看过（明确交代）

| 文件 | 亲眼看？ | 我看到的 |
|---|---|---|
| `00-about-uptodate.png` | ✅ 看过原图 | 返回/索斐/应用版本 0.1.1/内容版本 2026.10.16.22/检查更新按钮/已是最新内容（远端 2026.10.16.20）。/置底完整 URL；无说明段、无限制段、标签无「来源」 |
| `01-about-checking.png` | ✅ 看过原图 | 同上，状态行「正在检查…」，**按钮明显变暗（禁用）** |
| `02-about-offline-failed.png` | ✅ 看过原图 | 状态行两行：「更新未生效，旧内容保留：取更新清单失败：」＋「timeout」；内容版本仍 2026.10.16.22；仓库链接下移 |
| `03-about-idle-initial-INSTRUMENTED.png` | ✅ 看过原图 | **按钮下方直接是仓库链接**，没有状态行、也没有空位 |
| `04-about-after-revert.png` | ✅ 看过原图 | revert 后的原包冷启动：**没点按钮**状态行已是「已是最新内容（远端 2026.10.16.20）。」⇒ 自动检查确实恢复了 |

---

## 10. 收尾状态（我离开时设备上是什么）

- 设备上装的是：**`dev.sopho.suofei` vc2 / 0.1.1 / debug 签名（`a6bc0efa`）**，即 `470662e4…` 那个**未改动的构建**。
- **不是** release 签名包（上一会话起就不在了，我没恢复、也恢复不了）；**不是** instrumented 包（截图后已 revert 重装）。
- 网络：飞行模式**已关**、`svc data enable`、默认网络恢复（`102`）。
- 模拟器：**没重启、没改尺寸、没改密度、没改 font_scale**。
- 工作树：只有本目录（＋未提交的临时文件，收尾已删）新增；`git status` 里**没有对源码的改动**。

---

## 11. 复现要点

```bash
# 设备（只认这一台）
adb devices -l
adb -s emulator-5556 shell getprop ro.boot.qemu.avd_name     # -> Pixel_6
adb -s emulator-5556 shell dumpsys window | grep mCurrentFocus

# 用最新合并代码重建（基底 23f4757）
cd android && JAVA_HOME='<JDK 17>' ./gradlew assembleDebug --offline

# 安装（vc2 < 设备上原有 vc3 ⇒ 必须先卸载，见差异 D3）
adb -s emulator-5556 uninstall dev.sopho.suofei
adb -s emulator-5556 install android/app/build/outputs/apk/debug/app-debug.apk
adb -s emulator-5556 shell monkey -p dev.sopho.suofei -c android.intent.category.LAUNCHER 1

# 到关于页（先 dump 定位、不盲点）
adb -s emulator-5556 shell "uiautomator dump /sdcard/ui.xml" ; adb -s emulator-5556 shell "cat /sdcard/ui.xml"
adb -s emulator-5556 shell input tap 908 162          # 目录页右上「关于」
adb -s emulator-5556 exec-out screencap -p > about.png

# 离线失败态
adb -s emulator-5556 shell cmd connectivity airplane-mode enable
adb -s emulator-5556 shell svc wifi disable ; adb -s emulator-5556 shell svc data disable
adb -s emulator-5556 shell input tap 238 579          # 「检查更新」按钮
# 恢复
adb -s emulator-5556 shell cmd connectivity airplane-mode disable ; adb -s emulator-5556 shell svc data enable
```

- **几何口径**：屏幕 1080×2400、density 420（2.625 px/dp）、font_scale 1.0；内容列盒子 `[93,988]`，关于页行内沿（线 A）`137`，值列 `337`。
- 正文里每个 dp 数都是 `px ÷ 2.625` 算的；采纳锚的 px 是 CSS px（根字号 16px）。
