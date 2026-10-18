# 新增杜甫《望岳》＋《唐诗三百首》标签内三首次序 —— 模拟器验收留痕（2026-10-18）

> 本目录是**实测证据**，不是规格。内容依据（底本/异文/次序）见
> [`../../sources/wangyue-intake.md`](../../sources/wangyue-intake.md)；
> 标签视图的上位说明见 [`../tag-tab/README.md`](../tag-tab/README.md)。
> 本轮只验三件新事实：**① 多了一首（23 首）**；**② 标签页「唐诗三百首」从 2 行变 3 行且次序 望岳 → 其一 → 其二**；
> **③ 从两个视图分别进《望岳》再逐层返回，展开与滚动都没丢**。

## 0 · 设备身份（每次操作前核对，只碰这一台）

| 项 | 值 |
|---|---|
| 序列号 | `emulator-5556`，`ro.serialno` = **`EMULATOR36X1X9X0`**（`ro.kernel.qemu=1` ⇒ 是模拟器） |
| 系统 | `sdk_gphone64_x86_64`／`emu64xa`，`ro.build.version.release` = **15**，`wm size` = **1080x2400** |
| 其它设备 | 同机还有 `emulator-5554`（vivo V2364A，别人在用）、`YOCTO`、`127.0.0.1:7776` —— **一律未碰**（全程显式 `-s emulator-5556`） |
| 占用核对 | 操作前 `dumpsys activity activities` 的 `topResumedActivity` 是 `com.wsqsy.home/.HomeActivity`（**不是本工程**）；本包当时**未安装**。⚠ 这台模拟器上还装着别人的应用（`com.xingin.xhs`、`com.tencent.android.qqdownloader`、`com.ns.matrix.rpa.demo`），**未触碰任何别人的应用与数据**；只做了本包的安装、启动、点击与截图。 |

## 1 · 装的是哪一个包，读的是哪一份内容

| 项 | 值 |
|---|---|
| 包 | `dev.sopho.suofei`；**`versionCode=5` / `versionName=0.1.4`（本轮未改）** |
| APK | 本工作树 `./gradlew :app:assembleDebug --offline`（`app/build/outputs/apk/debug/app-debug.apk`），sha256 **`2b72d487c9ad2e365c39b1fba49e69638ce5fc028b19b9391bca46b7388dd565`**，debug 签名 |
| 内置内容 | 从 APK 里读回 `assets/content/content.json` 的 sha256 = **`b6bd70f253bc9fb6aea888d10b55f59ac9b1ef1e17190f3d96672c6d680c529e`**（＝ `dist/content.json` ＝ `web/content.json`，**同一次构建的同一份字节**；`formatVersion=3` / `contentVersion=2026.10.19.1` / **23 首** / 2 标签） |
| 设备上读的是哪一份 | 没有已激活的热更快照（本轮没喂远端内容，`检查更新` 回「已是最新内容（远端 2026.10.18.3）」⇒ 远端更旧、不切换）⇒ 读的就是**内置 assets** |
| 关于页实测 | 「应用版本 **0.1.4**」「内容版本 **2026.10.19.1**」——`13-about-content-version.png` / `ui-about.xml` |

## 2 · 逐条实测

### 2.1 朝代页：三组、唐组 3 首

`ui-library-dynasty-collapsed.xml`：`汉 [19] 首` / `唐 [3] 首` / `近现代 [1] 首` ⇒ 全库 **23 首**、**3 个组**
（`01-library-dynasty-collapsed.png`）。

展开「唐」（`02-library-dynasty-tang-expanded.png` / `ui-library-dynasty-tang-expanded.xml`）：

```
梦李白二首·其一   杜甫
梦李白二首·其二   杜甫
望岳              杜甫
```

⚠ **注意这个次序**：朝代页里**《望岳》排在两首《梦李白》之后**。这不是随手排的，是
`orderInSource` 的取舍后果——《望岳》在《全唐诗》**卷二百一十六**、两首《梦李白》在**卷二百一十八**，
按底本次序本应《望岳》在前；但该键要求 **≥1 的整数**、而两首《梦李白》已占 1/2，
**本轮不擅自改别人的键** ⇒ 《望岳》**不写 `orderInSource`**（产物 `null`），
于是 `source` 策略把它排在有键者之后（详见 `../../sources/wangyue-intake.md` §6）。
**要不要改成「三首同时改成 1/2/3」是留给负责人/用户拍板的事，本轮没动。**

### 2.2 诗页：《望岳》能读

`03-poem-wangyue.png` / `ui-poem-wangyue.xml`：

```
望岳
杜甫 · 唐 · 五言古诗
岱宗夫如何，齐鲁青未了。
造化钟神秀，阴阳割昏晓。
荡胸生曾云，决眦入归鸟。
会当凌绝顶，一览众山小。
```

4 个印刷行与 `dist/content.json` 的 `stanzas` 逐行一致；页面**不显示 id**、**不显示笔记块**（`notes: null`）。

### 2.3 详情页：《望岳》能开，底本与来源就是本轮实际所据

`04-detail-wangyue.png` / `ui-detail-wangyue.xml`：「底本与来源」显示
**《全唐诗》卷二百一十六**·杜甫（扬州诗局本）＋ S1 的 URL＋**电子转录**性质＋**未目验影像**的声明；
「异文」小节渲染出 1 条（曾／层）。

⚠ **观察到的既有观感问题（不是本轮引入，也未修）**：**「底本与来源」块不解析 Markdown**，所以
`source` 里的 `**电子转录**` 会**原样显示星号**。同一现象在既有条目上一模一样
（`05-detail-menglibai-source-asterisk-check.png`：两首《梦李白》的「底本与来源」同样露出 `**`）。
本轮**沿用既有写法**（保持一致），**没有**为了这一处去改别人的 `source`，也没有动 UI。**是否统一处理请负责人定。**

### 2.4 标签页：「唐诗三百首」3 成员，次序 望岳 → 其一 → 其二

`06-tags-collapsed.png`（两个组头、**无任何计数**）→ 展开「唐诗三百首」
（`07-tags-tang300-3-members.png` / `ui-tags-tang300-3-members.xml`）：

```
望岳              杜甫
梦李白二首·其一   杜甫
梦李白二首·其二   杜甫
```

＝ 产物 `tags[1].members` 的次序（`orderInTag` 1 / 2 / 3），客户端**没有重排**。

### 2.5 返回链①（标签视图）：进《望岳》再返回 ⇒ 回到标签视图、展开与滚动保持

1. 先把两个组都展开，再向上滚一段，让「唐诗三百首」进视野：
   `08-tags-scrolled-before-enter.png` / `ui-tags-scrolled-before-enter.xml`
   （实测坐标：「唐诗三百首」组头 `y=1792`，`望岳` `y=1934`，其一 `y=2078`，其二 `y=2222`）。
2. 点「望岳」→ 诗页（`09-poem-from-tagview.png`）。
3. 点「返回」→ **回到标签视图**（不是朝代页）：`10-tags-after-return-restored.png` /
   `ui-tags-after-return-restored.xml`，坐标与第 1 步**逐项相同**
   （`1792 / 1934 / 2078 / 2222`），两组**仍是展开**。
   ⚠ 第 1 步与第 3 步的截图**字节完全相同**（137,265 B），即**同一帧**——滚动位置没动过。

### 2.6 返回链②（朝代视图）：同样进《望岳》再返回 ⇒ 回到朝代视图、展开与滚动保持

1. 「唐」「汉」都展开、向上滚一段：`11-dynasty-before-enter.png` / `ui-dynasty-scrolled-before-enter.xml`
   （「唐」组头 `y=1645`，`望岳` `y=2075`）。
2. 点「望岳」→ 诗页；点「返回」→ `12-dynasty-after-return-restored.png` /
   `ui-dynasty-after-return-restored.xml`，坐标与第 1 步**逐项相同**，两个组**仍是展开**。
   两张截图同样**字节相同**（133,483 B）。

> 两个 tab 的展开/滚动状态**各自独立**：从标签视图切到朝代页时，看到的是朝代页**自己**的状态
> （`ui15`：唐展开、汉收起），不是标签页的状态。

## 3 · 本轮**没有**验的（如实写）

| # | 没验的事 | 说明 |
|---|---|---|
| 1 | **热更（远端内容切换）** | 本轮只验**内置内容**能不能读；没有喂远端清单。远端现为 `2026.10.18.3`（比本轮内置旧）⇒ 检查更新如实回「已是最新」。 |
| 2 | **真机观感** | 只在模拟器上看。字体/DPI/观感是否好看，**模拟器证明不了**。 |
| 3 | **「曾／层」两读的取舍** | 界面只呈现本仓选择（从底本作「曾」），异文在两处文字里说明；**没有**做任何切换 UI。 |
| 4 | 别人的应用与设备 | `emulator-5554`、`YOCTO`、`127.0.0.1:7776` 一律未碰。 |
