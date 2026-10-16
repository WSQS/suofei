# S4 · 项目独立模拟器本机验收（2026-10-16，会话 `s4-3f34b3da`）

> 范围：**只在本项目自己的 AVD 上做本地验收与留证**。未发布、未打 tag、未推远端、未碰用户手机。
> 基线：本工作树 `wt/s4-3f34b3da`，HEAD `eb33f11`（`content: 重编为 v2 并同步 Android 内置产物`）。
> ⚠ 一条纪律（写死）：**测试绿 ≠ 观感符合**。下面每条都是**截图/命令输出**，逐项对照归档采纳锚；
> 与采纳锚不一致的写进「差异清单」，**不拿测试绿冒充**。

---

## 0. 设备身份与占用（自行复核过）

证据文件：[`DEVICE-IDENTITY.txt`](DEVICE-IDENTITY.txt)

| 序列号 | 型号 / 身份 | 判定 | 是否使用 |
|---|---|---|---|
| **`emulator-5556`** | `sdk_gphone64_x86_64`，`ro.boot.qemu.avd_name=Pixel_6`，SDK 35 | **本项目 AVD** | ✅ **只用它** |
| `emulator-5554` | `PD2364 / V2364A` | vivo 机型，**非本项目** | 🚫 未触碰 |
| `YOCTO` | 车机 | **非本项目** | 🚫 未触碰 |
| `127.0.0.1:7776` | `vext_auto8668p1_64_vm_paravirt` | **非本项目** | 🚫 未触碰 |

- **本项目在前台**（启动后实测）：`mCurrentFocus=Window{17d477b u0 dev.sopho.suofei/dev.sopho.suofei.MainActivity}`、
  `mFocusedApp=ActivityRecord{... dev.sopho.suofei/.MainActivity t80}`。
  启动前该串口前台是 `com.wsqsy.home`（另一应用），即**这台机没有别人在用本项目 app**。
- 屏幕 `1080x2400` / density `420`（即 411.4dp 宽）。本会话**每条 adb 命令都带 `-s emulator-5556`**，
  收尾也未按 `emulator-*` 模式批量操作。

---

## 1. 安装本地构建

| 项 | 值 |
|---|---|
| 构建 | `cd android && ./gradlew assembleDebug --offline`（**离线可构建**，EXIT 0） |
| 产物 | `android/app/build/outputs/apk/debug/app-debug.apk`（≈9.6 MB，**debug 签名**） |
| 身份 | `package=dev.sopho.suofei versionCode=2 versionName=0.1.1`，`application-label='索斐'`，minSdk 26 / targetSdk 36 |
| 安装 | `adb -s emulator-5556 install -r …` ⇒ `Success`；`lastUpdateTime` 更新 |
| 证书 | `CN=Android Debug`，SHA-256 `faff248f…`（**未使用正式私钥**，符合授权边界） |

> ⚠ **本机原来装的是 v0.1.1 的 release 签名包（`firstInstallTime=2026-10-15 14:58:56`）**。
> debug 签名与它不同 ⇒ 我先 `uninstall` 了它，才装上 debug 包。收尾时设备上留的是**本地 debug 构建**，
> **不是**原来那个正式签名包（我没有正式私钥、也不从线上拉发布物 ⇒ 无法恢复原包）。

---

## 2. 四页观感（逐项对照归档采纳锚）

### 2.1 目录页 —— 证据：[`00-launch.png`](00-launch.png)（首态）、[`01-hub-expanded.png`](01-hub-expanded.png)（展开）

采纳锚：`items/app-ui/history/round-2026-10-15-hub-align/`、`…-hub-hierarchy/`、`…-hub-horizontal/`（悬挂＋竖直居中／缩进 0／作者紧随题名／关于在顶、首态全收起、不画卡片）。
实测（`uiautomator` 几何，portrait，内容列 `[93,988]`＝895px/341dp；列中心 540.5）：

| 采纳锚项 | 实测 | 结论 |
|---|---|---|
| 记号**悬挂** | 记号 `[+]/[−]` 在 `[93,153]`（＝列左沿），组名/题名左沿在 `165` ⇒ 记号在文字左沿**之左** | ✅ |
| 记号**竖直居中** | 记号 `[93,262][153,301]` 中心 y=281.5；组名「汉」`[165,242][824,321]` 中心 y=281.5 | ✅ 差 0px |
| **缩进 0**（组名左沿＝题名左沿） | 组名左沿 165；19 行题名左沿均 165 | ✅ 同一竖线 |
| **作者紧随题名**（不右对齐） | 题名右沿 402、作者「佚名」左沿 417（每行皆如此） | ✅ |
| **关于在顶** | 「关于」`[845,119][971,206]`，右上 | ✅ |
| **首态全收起** | 首屏只有组头 `[+] 汉 … [19] 首`，无题名行 | ✅ |
| **不画卡片** | 全屏无卡片/边框；组头与树行之间一条发丝分隔线 | ✅ |
| 次序＝底本原次序 | 首＝行行重行行、次＝青青河畔草…（与产物 `orderInSource` 一致） | ✅ |
| 顶部不重复应用名 | 顶部只有「关于」，无「索斐」 | ✅ |

### 2.2 诗页 —— 证据：[`02-poem.png`](02-poem.png)（常规宽）、[`05-poem-narrow560.png`](05-poem-narrow560.png)（**压窄 560px**）

采纳锚：`…-poem-expression/`（P1/P2）、`…-poem-align/`（**全部居中** `#d4-all`）、`…-break-semantic/`。
实测（portrait）：

| 采纳锚项 | 实测 | 结论 |
|---|---|---|
| **顶部行＝返回左／详情右、不参与居中** | 「返回」`[110,236]` 左、「详情」`[845,971]` 右；两者在列两端，**不在中轴** | ✅ |
| **全部居中**：题名 | 题名墨迹 `left=371 right=707 center=539`（列中心 540.5 ⇒ Δ**1.5px**） | ✅ 居中 |
| 全部居中：身份行 | `center=540`（Δ**0.5px**） | ✅ 居中 |
| 全部居中：**正文每一行** | 第 1 行墨迹 `left=267 right=787 center=527`（Δ13.5px）；**若左对齐墨迹左沿应≈137（列内沿），实测 267** ⇒ 是居中，不是左对齐 | ✅ 居中 |
| 身份行＝**作者·朝代·体裁** | 「佚名 · 汉 · 五言古诗」（无「东汉末」细时代） | ✅ |
| 正文之后**无页脚行** | 正文末行后无「底本/来源/异文/版本」任何一行 | ✅ |
| **语义折行**（够宽保原行；超宽按句读拆） | 常规宽（正文可用宽 807px > 12 字宽≈535px）**不折行**；**压窄到 560px** 后 `行行重行行，与君生别离。` 拆成 `行行重行行，` ＋ `与君生别离。`（**在逗号后断、标点归前句**） | ✅（**折行只由「压窄」得到，不是真实内容在常见宽度折行——如实标注**） |
| 折行的两个视觉行**继承居中** | 拆分后两行墨迹 `center=266.5 / 267.5`（列中心 280；左对齐应≈44） | ✅ 均居中 |

> ⚠ **一个测量口径说明**：正文墨迹中心比列中心系统性偏左约 13px，原因是**全角标点（。，）的墨迹只占字格左侧、右侧留白**，属字体/标点的固有不对称，不是没居中。
> 判定依据是「墨迹左沿 267 ≠ 列内沿 137」——左对齐时墨迹必然贴着 137。

### 2.3 详情页 —— 证据：[`03-detail.png`](03-detail.png)（有 `detail`）、[`11-detail-empty.png`](11-detail-empty.png)（无 `detail`）

采纳锚：`…-detail/`（采纳锚 D0：题名①左对齐／来源①正文前带标签／小标题 eyebrow **无竖线**）。

| 采纳锚项 | 实测 | 结论 |
|---|---|---|
| 诗题①**左对齐** | 「行行重行行」节点 `[137,269][479,360]`，左沿 137＝内容左沿（诗页题名是居中，两者**不同**） | ✅ |
| 来源①**正文前带标签「底本与来源」** | 标签「底本与来源」`[137,427][336,478]` 在来源正文（`137,493` 起）**之前** | ✅ |
| 小标题 eyebrow**无竖线** | 「异文」`[137,863]`＝正文共同左沿，**左侧无 2px 竖线、无悬空缩进**（截图确认） | ✅ |
| `detail` **最小 Markdown 渲染** | `### ` → 小标题（eyebrow）「异文」；`- ` → 项目符号列表；`**粗体**` → 「游子不顾返」加粗；段落换行保留 | ✅ |
| **不重复身份信息** | 无作者/朝代/体裁、无固定副题 | ✅ |
| 「返回」落回这首诗 | 「返回」回到那首诗 | ✅ |
| 真实 `detail` 覆盖 | 产物里 **13 首有真实 `detail`**（＝24 条异文所在首数）；其余 6 首如实显示「这一首在产物里没有详情正文。」 | ✅（空态诚实） |

### 2.4 关于页 —— 证据：[`04-about.png`](04-about.png)（在线，自动检查后）、[`10-new-offline-update-failed.png`](10-new-offline-update-failed.png)

采纳锚：`…-about-min/`（**V3 标签左对齐**／无区域框／初态只按钮／C1 完整 URL／版本组无「来源」）。

| 采纳锚项 | 实测 | 结论 |
|---|---|---|
| **V3 四条线合一** | 版本标签文字左沿 137；**按钮外沿** `[137,655][339,781]`（可点节点）＝137；**状态说明左沿** 137；**内容左沿** 137 | ✅ 四条线同一竖线（137） |
| 值列在右侧固定列 | 值「0.1.1」/「2026.10.16.22」左沿 337（标签列后） | ✅ |
| **无区域框** | 更新块由「一个按钮＋下方一段状态文本」直接排在内容流里，**无外框/底色/阴影/分区标题** | ✅ |
| 仓库链接**完整 URL** | `https://github.com/WSQS/suofei`，完整可见、置底 | ✅ |
| **初态只按钮**（不显示「尚未检查」） | ⚠ **设备上不可观测**：`MainActivity` 启动即 `checkForUpdate()` ⇒ Idle 是瞬态（几毫秒）。**源码已核**：`if (state.updateStatus !is UpdateStatus.Idle) { …Text(状态) }` ⇒ Idle 时**不生成状态文本元素**（不占位、不清空）。**「尚未检查」已不在任何可达文案里**（`UpdateStatusText.kt` 仍有 `Idle -> "尚未检查。"` 一句，但被上面的守卫挡住、**渲染不出来**） | ⚠ **未设备留证（瞬态）**；由源码＋守卫支持 |
| **共用版本信息不含「来源」** | ❌ **实测标签＝「内容版本与来源」**（见差异清单 D1） | ❌ **偏离** |

---

## 3. 笔记② —— 无笔记态（真实）＋ 有笔记态（**测试夹具**）

采纳锚：`…-poem-note/`（② 入口在顶部行、展开在正文下方·内联**无框**；无笔记整块隐藏）。

| 情形 | 证据 | 实测 | 结论 |
|---|---|---|---|
| **真实 19 首 `notes` 全为 `null`** | [`02-poem.png`](02-poem.png)、[`03-detail.png`](03-detail.png) | 诗页顶部行**只有「返回／详情」，没有「笔记」入口**（`uiautomator` 里无「笔记」节点） | ✅ **无笔记时入口不出现（真实状态）** |
| 有笔记态（`notes` 非空） | [`13-poem-with-fixture-note-collapsed.png`](13-poem-with-fixture-note-collapsed.png)、[`14-poem-fixture-note-expanded.png`](14-poem-fixture-note-expanded.png) | 顶部行出现「`[+]笔记`」`[706,832]`（在「详情」左、同一行）；点开后变「`[−]笔记`」，内容**在正文下方、同一列、无框**内联展开 | ✅ 采用② |

> ⚠ **这条只由「醒目标注的测试夹具」得到，不是真实数据**：夹具正文第一句就是
> **「【测试夹具笔记，不是用户笔记】」**，并且它是**本地临时从更新源注入的快照**（版本 `2026.10.16.24`），
> **没有写进 `content/poems/**`、没有进仓库**；验收后已用干净快照 `2026.10.16.25` 覆盖，夹具快照已不在设备上。

---

## 4. 更新 / 失败 / 拒收路径

### 4.1 离线：如实报错 ＋ **旧内容保留** —— 证据：[`10-new-offline-update-failed.png`](10-new-offline-update-failed.png)

- 手段：`svc wifi disable` ＋ `svc data disable` ＋ `cmd connectivity airplane-mode enable`；设备侧 `ping 8.8.8.8` ⇒ `Network is unreachable`。
- 实测状态文本：**「更新未生效，旧内容保留：取更新清单失败：Unable to resolve host "wsqs.github.io": No address associated with hostname」**；
  「内容版本与来源」仍为 **`2026.10.16.23`**（旧内容未被动）。

### 4.2 **旧 APK 拒收 v2 内容 ⇒ `FORMAT_TOO_NEW`，且「已激活的 v1 快照继续生效」** —— 证据：[`08-old-FORMAT_TOO_NEW.png`](08-old-FORMAT_TOO_NEW.png)、[`07-old-update-page.png`](07-old-update-page.png)

> 这一条是 **v2 字段集升版的真实上线风险**（发布过的老 APK 只认 `formatVersion 1`）。
> 我用**本地从 tag `v0.1.1+content-2026.10.16.20` 构建的旧 APK**（`SUPPORTED_FORMAT_VERSION=1`，其内置内容 v1/`2026.10.16.9`），
> 临时把它的更新源指向本机静态服务（`http://127.0.0.1:8899` ＋ `adb reverse`，仅本地、不对外），复现三连：

| 步骤 | 实测 | 证据 |
|---|---|---|
| ① 老 APK 从本地源下载并激活 **v1 快照** `.20` | 页脚变「内容 `2026.10.16.20`（来源：**已下载**）」；服务日志 `200 /content/2026.10.16.20/content.json 23010` | [`06-old-hub-after-activated-v1.png`](06-old-hub-after-activated-v1.png) |
| ② 源改成 **v2 清单**（`formatVersion:2`），点「检查更新」 | 状态：「**更新未生效，旧内容保留：远端内容结构版本 2 高于本应用支持的 1；保留当前内容，请更新应用（需更新应用，内容不会被动）**」 | [`08-old-FORMAT_TOO_NEW.png`](08-old-FORMAT_TOO_NEW.png) |
| ③ **已激活的 v1 快照继续生效**（**没有退回内置**） | 「生效内容版本」仍＝**`2026.10.16.20（来源：已下载）`**；页脚仍「来源：已下载」；服务日志里 **只有 `latest.json` 的 200，没有对 v2 载荷的任何下载** ⇒ 在下载之前就被拒绝 | 同上 |

> **口径核实到位**：`回退内置` 只在 `loadActive()==null` 或「已激活快照自己过新」时发生（`ContentStore.loadActive()` 的两条判定）。
> 这里 ② 是在 **manifest 阶段**就 `FORMAT_TOO_NEW` 返回，**根本不动**已激活快照 ⇒ 事实正是「已激活的 v1 快照继续生效」。
> **不是**「退回内置」。

### 4.3 **同签名覆盖安装** —— `install -r` 成功、版本码递增

| 步骤 | 命令 / 输出 | 实测 |
|---|---|---|
| 旧包（tag 构建，vc2） → 新包（本线构建，vc3），**同一 debug 证书** | `adb -s emulator-5556 install -r app-current-vc3.apk` | `Success`，**无需卸载**；`versionCode 2 → 3`，`versionName 0.1.1`；`firstInstallTime` **保留**（未被重装清掉）、`lastUpdateTime` 更新 |
| 两包证书一致 | `apksigner verify --print-certs` 两个 APK | 均 `CN=Android Debug`，SHA-256 `faff248f1597…` **相同** |
| 数据保留 | `run-as dev.sopho.suofei find files/content` 覆盖安装前后 | `files/content/versions/2026.10.16.20/` ＋ `current` 指针**原样保留** |

### 4.4 三连补完：旧包 → 新包覆盖 → **v2 内容热更成功** —— 证据：[`09-new-hotupdate-v23.png`](09-new-hotupdate-v23.png)

- 覆盖安装后，新包（认 `formatVersion 2`）从本地源取到 **v2 载荷 `.23`**：
  状态「**新内容 `2026.10.16.23` 已下载、校验通过并已切换生效（22025 字节）；返回目录后采用**」；
- 返回目录再进关于页，**「内容版本与来源」＝`2026.10.16.23`**；磁盘 `files/content/current` ＝ `2026.10.16.23`（服务日志 `200 /content/2026.10.16.23/content.json 22025`）。
- ⇒ **v2 的「下载 → sha256 校验 → 原子切换」运行期路径在设备上真跑通了**（此前只有单测）。

---

## 5. 宽度口径（与 Web 的差异）

- 实测：目录/诗页**内容列** `C=[93,988]`＝895px＝**341dp**；由 `0.88×(V−24)` 反推 **V＝411.4dp＝整窗宽 1080px**，
  列外余白 `(V−C)/2=93px`。**竖屏下 Scaffold 侧向 inset＝0**，故 V＝整窗宽。
- 横屏实测（`user_rotation=1`）：窗 2400×1080，内容列 `[172,2229]`＝2057px＝783.6dp，反推 **V＝914.3dp＝整窗宽 2400px**（`0.88×(914.3−24)=783.5`），**侧向 inset 仍为 0**；Scaffold 只吃掉**上/下** inset（列 `y∈[63,1017]`，状态栏/导航栏那两条）。
- **结论**：本机（Pixel_6，AOSP 手势导航）**竖屏与横屏都没有侧向 inset**，所以「V＝Scaffold 内容区宽（扣系统栏）」与「V＝视口宽」在本设备上**数值相同、差异未显现**。
  ⇒ **该口径差异在本次设备上仍是「未验范围」**（要显现得有侧向系统的 inset：横屏三键导航侧栏、侧边挖孔等）。
  实现侧读码确认：`ContentColumn` 用 `BoxWithConstraints(Modifier.fillMaxSize())` 取 `maxWidth`，且它位于 `Scaffold{padding->Box(Modifier.padding(padding))}` 之内 ⇒ V 确实＝扣掉系统栏后的内容区宽；**安全区由 Scaffold 的 inset padding 保住，没有机械抹 inset**。

---

## 6. 差异清单（逐条给理由 / 标「待用户审」）

| # | 差异 | 性质 | 依据 / 理由 |
|---|---|---|---|
| **D1** | 关于页版本组标签实测＝**「内容版本与来源」**（含「来源」），且**折成两行**（「内容版本与」/「来源」） | ❌ **与采纳锚相抵**（待用户审） | 采纳锚 `about-min` 的**共用版本区无来源**、标签是「内容版本」。实现读的是跨端唯一来源 `web/about-fields.json` 的 `fields[3]="内容版本与来源"`（Web 端同值）⇒ 这是**两端一致的偏离**，不是 Android 单方面。`android/README.md` 已把它列为「已知依赖 3：`about-fields.json` 落后于 `q-9f9eca3d`」。**代价**：标签超宽换行，V3 四条线里「标签行」变成两行、观感受损。**修法**：改 `web/about-fields.json` ＋ 两端＋各自断言同批（跨端契约变更，不由本线单独动）。 |
| **D2** | 关于页仍有**「个人诗歌阅读（离线可读）。」（一句话说明）** 与**「诚实的限制」整段长文** | ⚠ **候选附加内容**（未采纳，非本线引入） | `ui-about/item.md`：「**介绍与长篇限制说明未采纳**」。它们和 D1 同属 `about-fields.json` 的落后字段集；本线按任务书**只做观感核对、不擅改跨端契约**。 |
| **D3** | 目录页组头**没有**「新内容已下载」提示条（本次未出现，因为验收没走「打开时正好激活新内容」那一刻） | ⚠ **未观察**（非差异） | 「新内容已下载」提示条是 `implementation-plan.md` 点名的**有意偏离**项；本次会话里没有在「激活瞬间」截到它，**未证其在设备上出现/不出现**。**不在本报告冒充已核。** |
| **D4** | 「初态只按钮」在设备上**没截到**（Idle 瞬态） | ⚠ **未设备留证** | 启动即自动检查；源码守卫保证 Idle 不渲染状态元素（见 §2.4）。**不是缺陷，是瞬态不可截**（与 `ui-review-checklist.md` D1 的历史结论同形）。 |
| **D5** | 关于页把「见**诗页底部**」改成「见**诗歌详情页**」 | 由本线 S2 做的**事实更正**（可核） | 采纳锚 `ui-poem`：「诗页不放底本与来源」⇒ 原文案会误导；属 `android/README.md` 已记的更正。 |
| **D6** | 本机模拟器**横竖屏都无侧向 inset**，宽度口径差异未显现 | ⚠ **未验范围**（非差异） | 见 §5；实现侧读码符合口径，安全区保住。 |

---

## 7. 我没做 / 没验的部分（如实列出）

1. **没发布**：没打 tag、没推远端、没建 Release、没部署 Pages、没改远端最新版、**没 `git push`**。
2. **没用正式签名私钥**：全程 debug 签名；因此**无法**恢复设备上原来那个 release 签名包（已如实记在 §1）。
3. **没从线上拉任何发布物**：`wsqs.github.io` 的 Release/站点产物一次都没下载当测试目标。
4. **没碰用户手机**，**没碰其它三台设备**（emulator-5554 / YOCTO / vext VM）。
5. **没碰** `content/poems/**`、`tools/`、`schema/`、`web/`、`items/**`、任何 `item.md`。
6. **没验**：物理真机观感（用户已定不做）；深色长文疲劳（主观，只能用户判）；侧向 inset 下的宽度口径（§5）；
   `Idle`/`Checking` 两个瞬态（不可截）；「新内容已下载」提示条（D3）；应用**降级安装**（低 versionCode 覆盖高 versionCode）的拒装我**没有单独做**——
   历史记录里那条「装 debug 被拒」的真实原因是 `INSTALL_FAILED_VERSION_DOWNGRADE` 而非签名不符，本次也**没有把它隔离验证**（不夸成验证过）。
7. **有笔记态只用了测试夹具**（§3），**真实 19 首无任何笔记**；夹具**没进仓库、已从设备清掉**。
8. **未在 Web/CI 侧复跑**：本会话只做设备验收，`npm test` / Web e2e / check-fieldset 等**均未在本会话重跑**（那是别的线的事）。

---

## 8. 复现要点（命令留痕）

```bash
# 设备（只用本项目那台）
adb devices -l                          # 认新出现的 sdk_gphone64_x86_64，不按 emulator-* 批量操作
adb -s emulator-5556 shell getprop ro.boot.qemu.avd_name   # -> Pixel_6
adb -s emulator-5556 shell dumpsys window | grep mCurrentFocus

# 构建（离线）
cd android && ./gradlew assembleDebug --offline
adb -s emulator-5556 install -r android/app/build/outputs/apk/debug/app-debug.apk

# 旧 APK 拒收 v2：从 tag 建一次性工作树、把 BASE_URL 指到本机静态服务 + 允许 cleartext
git worktree add --detach ../s4-old-apk v0.1.1+content-2026.10.16.20
#   改 UpdateProtocol.BASE_URL = http://127.0.0.1:8899 ／ AndroidManifest 加 usesCleartextTraffic="true"
#   ./gradlew assembleDebug --offline ；本机 node 静态服务 + adb reverse tcp:8899 tcp:8899
#   验收后：git worktree remove --force ../s4-old-apk ；adb reverse --remove tcp:8899

# 四页/笔记截图
adb -s emulator-5556 shell uiautomator dump /sdcard/ui.xml   # 先 dump 再按坐标点，绝不盲点
adb -s emulator-5556 exec-out screencap -p > out.png
adb -s emulator-5556 shell wm size 560x2400   # 压窄看语义折行；验收后 wm size reset
```

> 观感判定辅助：用 `System.Drawing` 逐像素量某 y 带的**墨迹左右沿/中心**（脚本见会话临时目录），用于「居中 vs 左对齐」的客观判据。
> 全部截图路径即本目录下的 `*.png`；设备证据见 `DEVICE-IDENTITY.txt`；本地服务日志见 `local-server.log`。

---

## 9. 一句话结论

**四页观感逐项对照采纳锚：目录/诗页/详情页**（含真实 `detail` 13 首、无 `detail` 6 首的空态）**均符合**；诗页「全部居中／顶部行不居中／语义折行（压窄才折）」与「无笔记入口不出现」均实测通过。
**两处不达标/待审**：① 关于页版本标签「内容版本与来源」与「共用版本区无来源」相抵且换行（**D1**，跨端字段集落后，待用户审）；② 关于页仍带未采纳的「一句话说明／诚实的限制」（**D2**）。
**路径证据**：**旧 APK 拒收 v2 ⇒ `FORMAT_TOO_NEW` 且「已激活的 v1 快照继续生效」（没退回内置）**、**离线报错且旧内容保留**、**同签名覆盖安装成功（vc2→vc3、数据保留）**、**新包 v2 热更成功**——四条全部实测有证。
