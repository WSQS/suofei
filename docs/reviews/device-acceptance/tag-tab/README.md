# 标签 tab ＋ formatVersion 3 ＋ 真实系统返回链 —— 模拟器验收留痕（2026-10-18）

> 工程线 3／3（Android）。本目录是**实测证据**，不是规格；UI 形状的权威仍是
> [`items/tag-views/history/round-2026-10-18-tag-tab-adopted/q-tag-views.html`](../../../../items/tag-views/history/round-2026-10-18-tag-tab-adopted/q-tag-views.html)。
> **观感仍需用户在真机上看**：下面能证明「结构/行为对得上」，不能证明「好看」。

## 0 · 设备身份（每次操作前核对，只碰这一台）

| 项 | 值 |
|---|---|
| 序列号 | `emulator-5556`，`ro.serialno` = **`EMULATOR36X1X9X0`** |
| 系统 | API 35（`sdk_gphone64_x86_64`，`emu64xa`），`wm size` = **1080x2400** |
| 导航模式 | `com.android.internal.systemui.navbar.gestural`（手势导航） |
| 其它设备 | 同机还有 `emulator-5554`（别人在用）、`YOCTO`、`127.0.0.1:7776` —— **一律未碰** |

## 1 · 两个 APK 的身份（同名同号、同证书，只有代码代不同）

| | 旧 APK（format 2） | 新 APK（format 3） |
|---|---|---|
| 来源 | `git archive c6af69c` 解出后构建（= 已发布的 0.1.3 那一代 Android 代码） | 本分支 `b83d061` 之后的工作树（含本次改动） |
| `versionCode` / `versionName` | **4 / 0.1.3** | **4 / 0.1.3** |
| 签名证书 | `CN=Android Debug, O=Android, C=US`，SHA-256 `faff248f15977835c25c25ec8c0b865fa6c4207bada8cfc8e5785ea8aa94e956` | **同上**（同一个 debug keystore ⇒ 可覆盖安装） |
| APK sha256 | `0c7f5cab21e9d82f04bc70875e98e414de2ab64fd72f0517babd9072b2409b6d` | `34deefb73be504f661afefe6a94af51514af37e11f1d48d92872ed7493fe2844`（测试构建） |
| 设备上实测 | `dumpsys package` versionCode=4/0.1.3，`signatures=[a6bc0efa]` | 同上；`lastUpdateTime` 覆盖安装后更新 |

⚠ **测试构建的两处临时改动（未提交、已复原）**：为了让本机可控地喂入内容，两个 APK 都把
`UpdateEndpoint.BASE_URL` 指向本机 `http://10.0.2.2:8765/suofei`，并临时加了
`android:usesCleartextTraffic="true"`（Android 9+ 默认禁明文，否则会得到
`Cleartext HTTP traffic to 10.0.2.2 not permitted`）。**这两处只影响「从哪取内容」，
不参与任何被验证的判定**（版本门/校验/落盘/UI 都不看它）；两处改动已 `git checkout --` 复原，
复原后的干净树构建出的 APK sha256 = `25e5f0727a34458f67ba5c66a2ada578a8e5c66739cfebab69de506d3d9b5e47`
（同一棵树 `assembleDebug` 成功）。真实站点是 https，不需要这条豁免。

⚠ **截图与版本对齐的关系**：新 APK 在设备上**装过两次**：第一次是带内容门的构建，第二次是我按
「「关于」与 tab 同字号 0.86rem」对完 Web 后的重建（sha 见上）。所以：
- `new-a0*`／`new-b0*`／`old-*` 是第一次那个构建（「关于」还是 0.82rem）；
- `new-c0*` 及之后的全部截图（包括折叠态标签页 `new-c01-tag-tab-collapsed.png`）是**对齐后**的构建。
两边内容相同，同一画面以 `new-c01` 为准。

## 2 · 喂进去的内容（全部由脚本生成，不是手改产物）

| contentVersion | formatVersion | 是什么 | 用途 |
|---|---|---|---|
| `2026.10.18.2` | 2 | 旧产物形状（22 首，无 `tags`） | 让**旧 APK**先激活一份「已激活快照」 |
| `2026.10.18.5` | 3 | 编译器产出的真内容（`古诗十九首` 19 条真实归属）**＋ 3 条明确标注的测试夹具标签**：`汉魏六朝诗选`(1)、`咏怀`(1)、`玉台新咏`(**0**) | 验标签视图（多组、多标签、零成员隐藏）与热更 |
| `2026.10.18.6` | 3 | 同 5，但清单 sha 写错 / 载荷被截断 | 坏内容保旧 |
| `2026.10.18.7` | **4**（清单仍写 3） | 同 5 的内容，只把 `formatVersion` 抬到 4 | 载荷自己的版本门 |

夹具标签**只活在本机这份测试载荷里**（TEMP 目录），没有进仓库、没有进 `content/`，也不是任何选本归属声明。

## 3 · 三条必须实测 —— 过程与证据

### 3.1 更新协议：format 2 旧 APK 遇 format 3 ⇒ 拒激活、保已激活快照

1. `uninstall` → 装旧 APK → 启动：自动检查更新，清单 `formatVersion=2 / 2026.10.18.2`
   ⇒ 下载、校验、切换成功，回到目录后采用。
   - 服务端日志：`GET /suofei/content/latest.json`、`GET /suofei/content/2026.10.18.2/content.json`（UA `Suofei-Android/0.1.3 (4)`）
   - `run-as … ls files/content/versions` ⇒ `2026.10.18.2`；`current` ⇒ `2026.10.18.2`
   - `old-a02-library-adopted.png` / `old-a03-about-content-2026.10.18.2.png`（关于页「内容版本 2026.10.18.2」）
2. 把清单换成 `formatVersion=3 / 2026.10.18.5`，在关于页点「检查更新」：
   - 界面原文：**「更新未生效，旧内容保留：远端内容结构版本 3 高于本应用支持的 2；保留当前内容，请更新应用（需更新应用，内容不会被动）」**
   - 服务端日志**只有** `GET /latest.json`（**没有**去下载 content.json）
   - `versions/` 仍只有 `2026.10.18.2`，`current` 不变，**没有崩、内容没被清**
   - `old-b01-format3-refused.png` / `.xml`

### 3.2 新 APK 读得动旧快照；format 3 正常激活

1. 覆盖安装新 APK（同 versionCode、同证书）→ 启动：清单仍是 `2026.10.18.2` ⇒ 提示「已是最新内容」；
   关于页「内容版本 **2026.10.18.2**」——**这是新解析器读 v2 快照**（`tags` 两处键缺 ⇒ 空标签表）。
   - `new-a01-library-v2-snapshot.png`（顶部出现「朝代 ｜ 标签」）、`new-a02-tag-tab-empty-on-v2.png`（标签页空、**没有**空态文字）、`new-a03-about-v2-snapshot-read.png`
2. 清单换 `formatVersion=3 / 2026.10.18.5` → 点「检查更新」：下载 33702 字节、sha 校验通过、原子切换；
   回到目录后采用 ⇒ 标签页出现 3 组。
   - 服务端日志：`GET /latest.json`、`GET /suofei/content/2026.10.18.5/content.json`
   - `versions/` ⇒ 只剩 `2026.10.18.5`（设计就是只留当前快照）
   - `new-b01-about-format3-activated.png`、`new-b02-tag-tab-after-v3-adopted.png`

### 3.3 坏内容 ⇒ 保旧（新 APK）

| 场景 | 界面原文 | 磁盘 |
|---|---|---|
| 清单 sha 与载荷不符（`2026.10.18.6`） | 「更新未生效，旧内容保留：SHA-256 不符（清单 0000…，实际 628d…）；已丢弃下载结果，保留旧内容（下载/校验未通过）」 | `versions/` 仍只有 `2026.10.18.5`；`staging/` 空 |
| 载荷被截断（sha 与截断后的字节一致 ⇒ 过了校验） | 「更新未生效，旧内容保留：内容 JSON 非法：顶层不是 JSON 对象；保留旧内容」 | 同上 |
| 载荷 `formatVersion=4`、清单写 3 | 「更新未生效，旧内容保留：内容结构版本 4 高于本应用支持的 3；保留旧内容（需更新应用，内容不会被动）」 | 同上 |

证据：`new-e01-checksum-mismatch-keeps-old.png`、`new-e02-truncated-payload-keeps-old.png`、`new-e03-payload-format4-refused.png`。

### 3.4 真实系统返回链（详情 ⇒ 诗页 ⇒ 原视图，展开与滚动保持）

在**标签视图**里：展开「古诗十九首」（19 行）→ 上滑到「涉江采芙蓉」在顶部 → 点「冉冉孤生竹」→ 点「详情」：

| 动作 | 结果 |
|---|---|
| `input keyevent KEYCODE_BACK` ①（真返回键事件） | 回到**这首诗的诗页**（`冉冉孤生竹`） |
| `input keyevent KEYCODE_BACK` ② | 回到**标签视图**：`古诗十九首` 仍展开、滚动停在原位（首行 `涉江采芙蓉` y=128，与进入前逐字一致） |
| 手势滑返（`input swipe 2 1200 700 1200 250`，从屏幕左缘划入）① | 同样只退一层：详情 ⇒ 诗页 |
| 手势滑返 ② | 同样回到标签视图，且 dump 与上面「键返回」那次 **`diff` 完全一致**（逐字节 IDENTICAL） |

证据：`new-c03-poem-page.png`、`new-c04-detail-page.png`、`new-c05-back1-poem.png`、
`new-c06-back2-tag-view-restored.png/.xml`、`new-d02-gesture-back1-poem.png`、`new-d03-gesture-back2-tag-view.png/.xml`。

同一条链在**朝代视图**也跑了一遍：展开「汉」+ 上滑 → 点「明月皎夜光」→ 详情 → 返回×2 ⇒
朝代视图仍展开、滚动位置不变（`new-h01-dynasty-view-restored.png/.xml`，与进入前的 text+bounds 逐行相同）。

### 3.5 离线（模拟器飞行模式 + wifi/data 关闭）

1. **热更后离线可读**：已激活 `2026.10.18.5` 后关网、冷启动 ⇒ 朝代页与标签页都正常渲染
   （`new-f01-offline-hotupd-library.png`、`new-f02-offline-hotupd-tag-tab.png`）。
2. **新包断网首装可读**：`uninstall` → 关网 → 安装新 APK → 启动 ⇒ 直接读到**内置内容**：
   - 朝代页 3 组 22 首；标签页 **1 组「古诗十九首」，展开 19 行**（`new-g01…`、`new-g02…`、`new-g03-offline-firstinstall-tag-expanded.png`）
   - 关于页「内容版本 **0.0.0-dev+658f66676f94**」（内置产物的本地派生版本，未指定发布号时编译器就是这样）；
     更新检查如实失败：「取更新清单失败：Failed to connect to /10.0.2.2:8765」（`new-g04-offline-firstinstall-about.png`）
   - `run-as … ls files/content` ⇒ **不存在**（没有任何已安装快照，读的就是 assets）

## 4 · UI 逐条对照（与采纳锚）

| 锚上的要求 | 实测 |
|---|---|
| 顶部 **「朝代 ｜ 标签」两 tab ＋「关于」** | ✔ dump 文本依次 `朝代` / `标签` / `关于`；关于在右（`[843,120][969,246]`） |
| 标签页与朝代页**同构**、`[+]/[−]` 悬挂＋竖直居中、组头**整行可点**、**初态全收起**、**各组独立** | ✔ 同一段 `groupItems` 渲染；点在组名（x=500）也能展开；展开一组后其余仍是 `[+]` |
| 子诗题左沿＝标签名首字 | ✔ 实测标签名 x=165、首行诗题 x=165（槽 27.52 起算） |
| 作者**紧随**题名、无序号 | ✔ dump 里是「题名」「佚名」两个相邻文本块，没有 `001` 类序号 |
| 标签页**不显示任何数量** | ✔ 标签页 dump 里没有 `[N] 首` 之类文本（朝代页仍是 `[19] 首 / [2] 首 / [1] 首`） |
| **零成员标签不渲染** | ✔ 夹具里 `玉台新咏`（members 0）在数据中，但页面**没有**它的组头，也没有空态文字 |
| 「关于」与 tab **同号**（0.86rem，2026-10-18 与 Web 对齐） | ✔ 同一行同一个 `PoetryTextStyles.tab`；源码级门 `ScreenInventoryTest.libraryTopRow_hasBothTabs_andTheAboutEntry` |
| 组头下的发丝线：**两端同一条规则、不给标签页加额外线** | ✔ 标签页与朝代页共用 `GroupHeaderRow`（含既有那条 `HairLine`），**没有**为标签页另加 |
| 继承：静默终端、诗页/详情页已选形态、宽度口径、顶部只有「关于」 | ✔ 诗页/详情页未改（截图与既有形态一致）；宽度口径未改（`ContentWidthTest` 仍绿） |

## 5 · 未做 / 未核（诚实清单）

- **真机**：只在模拟器（`emulator-5556`）上跑过；触摸手感、字体回退、OLED 观感都没验——
  那只能由用户自己看。
- **`input keyevent KEYCODE_BACK` 是「真返回键事件」，不是物理键按下**；手势那条是**真实边缘滑动手势**
  （设备处于 `gestural` 导航）。没有第二个导航模式下的三键角标点击验过。
- **标签多到 20/50 个时的表现、长标签名折行、320 宽标签页**：本轮没出图（原型里 320 的图是 Web 的）。
- **无障碍**：没有核 TalkBack 朗读与焦点顺序。
- **关于页仓库链接的可点性**：只有源码级守卫，本机没有 UI 测试依赖，没做真实点击取证。
- 测试载荷里的 3 条夹具标签（汉魏六朝诗选／咏怀／玉台新咏）**不是真库归属**；真内容当前只有
  `古诗十九首` 19 条（`梦李白二首`、`毛诗` 为 `tags: []`）。
