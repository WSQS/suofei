# 三首杜甫诗 `orderInSource` 改为 1/2/3 后的**模拟器实测留痕**（2026-10-19）

> 本目录是**实测证据**，不是规格。内容口径（底本次序、为什么不称《全唐诗》全书编号）见
> [`../../sources/wangyue-intake.md`](../../sources/wangyue-intake.md) **§6.5**。
> 改动前那一轮的留痕在 [`../wangyue/README.md`](../wangyue/README.md)（其 §2.1 的「唐组：梦一 → 梦二 → 望岳」**已被本次替代**）。

## 0 · 本次改了什么（一句话）

用户答 `q-d148dbcf`：「调整为这个顺序（三首 orderInSource 设 1/2/3，正文和出处不变）」⇒
**只动排序键**：望岳 加 `orderInSource: 1`；梦李白其一 `1 → 2`；梦李白其二 `2 → 3`。
**正文、`source`（含其中的 `**` 星号）、`id`、`notes`、`detail`、`tags`/`orderInTag` 一律未动。**

改前的病：望岳**不写**该键（产物 `null`）⇒ `source` 策略把它排在有键者之后，
于是**朝代页把望岳排到两首《梦李白》之后**，而**标签页是 望岳 → 其一 → 其二** —— 同一批诗在两个视图里**次序相反**。

## 1 · 设备身份（每次操作前核对，只碰这一台）

| 项 | 值 |
|---|---|
| 序列号 | `emulator-5556`，`ro.serialno` = **`EMULATOR36X1X9X0`**（`ro.kernel.qemu=1` ⇒ 是模拟器） |
| 系统 | `sdk_gphone64_x86_64`／`emu64xa`，`ro.build.version.release` = **15**，`wm size` = **1080x2400** |
| 其它设备 | 同机还有 `emulator-5554`（vivo V2364A，别人在用）、`YOCTO`、`127.0.0.1:7776` —— **一律未碰**（全程显式 `-s emulator-5556`） |
| 占用核对 | 操作前 `topResumedActivity` = `dev.sopho.suofei/.MainActivity`（**本包自己**，上一轮留的实例）；未触碰别人的应用与数据 |

## 2 · 装的是哪一个包，读的是哪一份内容

| 项 | 值 |
|---|---|
| 包 | `dev.sopho.suofei`；**`versionCode=5` / `versionName=0.1.4`（本轮未改）** |
| APK | 本工作树 `./gradlew :app:assembleDebug --offline`，sha256 **`fa13e632bf2c07adbc649da22055289e54f62c49140728023f65ff16193090d3`**，debug 签名 |
| 内置内容 | 从 APK 里读回 `assets/content/content.json` 的 sha256 = **`8fae0954af16c104f6e5cd20c89c74df575908833d32b7e374f0dad9601b7683`**（＝ `dist/content.json` ＝ `web/content.json`，**同一次构建的同一份字节**；`formatVersion=3` / `contentVersion=2026.10.19.2` / **23 首** / 2 标签） |
| 设备上读的是哪一份 | 关于页实测「已是最新内容（远端 2026.10.18.3）」⇒ 远端比内置旧、**不切换** ⇒ 读的就是**内置 assets** |
| 关于页实测 | 「应用版本 **0.1.4**」「内容版本 **2026.10.19.2**」（`03-about-content-version.png` / `ui-05-about.xml`） |

## 3 · 两个视图的三行次序（**本轮的核心实测**）

### 3.1 朝代页「唐」组 → 望岳 → 其一 → 其二

`ui-02-dynasty-tang-expanded.xml`（点开「唐」组后的 uiautomator dump，按 `bounds` 的 y 递增即**自上而下**）：

```
"唐"              [165,435][843,514]     ← 组头，「[3] 首」
"望岳"            [165,584][259,649]
"梦李白二首·其一"  [165,728][512,793]
"梦李白二首·其二"  [165,872][512,937]
```

截图：`01-dynasty-tang-expanded.png`。

### 3.2 标签页「唐诗三百首」→ **同一次序**

`ui-04-tags-tang300-expanded.xml`（切到「标签」tab、点开「唐诗三百首」）：

```
"唐诗三百首"       [165,435][944,514]     ← 组头（**无计数**）
"望岳"            [165,584][259,649]
"梦李白二首·其一"  [165,728][512,793]
"梦李白二首·其二"  [165,872][512,937]
```

截图：`02-tags-tang300-3-rows.png`。

**两个视图的 y 坐标逐项相同**（`584 / 728 / 872`）——不是"看起来差不多"，而是同一相对次序。

### 3.3 其余 20 首没动

- 组头仍是 汉 `[19] 首` / 唐 `[3] 首` / 近现代 `[1] 首`，组序 汉 → 唐 → 近现代（`ui-01-initial.xml`）。
- 「汉」组展开后首几行仍是 行行重行行 → 青青河畔草 → 青青陵上柏 → 今日良宴会 → 西北有高楼 …
  （`ui-06-dynasty-han-expanded.xml`；⚠ 这一台只**目视到前 13 行**（可视区域），
  **19 首逐首**的次序由 Web 端与内容产物两端核（见下），不拿可视区域冒充全量）。

## 4 · 配套的另两端实测（本目录只放设备帧，另两端的材料在各自目录）

| 端 | 结果 | 材料 |
|---|---|---|
| 内容产物（三份同一份字节） | 朝代组「唐」= 望岳 → 梦一 → 梦二；标签组「唐诗三百首」= 同一序；「汉」19 首 title 逐首与改动前一致；近现代 1 首一致；**非排序键字段差异 = 0** | `dist/content.json`（本次构建） |
| Web（无头 Chromium ＋ CDP） | 渲染出的**两个视图**三行次序都是 望岳 → 梦一 → 梦二，且「汉」19 首逐首未变：**14 / 14 通过，exit 0**（截图 `01-dynasty-tang-expanded.png`、`02-dynasty-tang-rows.png`、`03-tags-tang300-3-rows.png`） | [`../../ui-review/materials-wangyue-order/`](../../ui-review/materials-wangyue-order/README.md) |
| Android 单测 | **173 / 173 通过，exit 0**；新增断言「朝代页『唐』组次序 == 标签页『唐诗三百首』次序」**在旧产物上真红**（实测：`expected:<[望岳, 其一, 其二]> but was:<[其一, 其二, 望岳]>`） | `android/app/src/test/java/dev/sopho/suofei/ContentParserTest.kt` |

## 5 · 本轮**没有**验的（如实写）

| # | 没验的事 | 说明 |
|---|---|---|
| 1 | **真机观感** | 只在模拟器上看。字体/DPI/观感，**模拟器证明不了**。 |
| 2 | **热更（远端内容切换）** | 本轮只验**内置内容**。远端现为 `2026.10.18.3`（比本轮内置旧）⇒ 关于页如实回「已是最新内容」。 |
| 3 | 「汉」19 首在**这一台**的逐行次序 | 只目视到可视区域前 13 行；全量次序由内容产物与 Web 端核过。 |
| 4 | 发布链（tag/Pages/Release） | 本轮**只本地**：不 push、不 tag、不上传；`0.1.4`/code 5 未动，线上 `0.1.4 + 2026.10.18.3` 保持不变。 |

## 6 · 本目录文件

| 文件 | 是什么 |
|---|---|
| `ui-01-initial.xml` | 冷启动后目录（3 组全收起）的 uiautomator dump |
| `ui-02-dynasty-tang-expanded.xml` | 点开「唐」组后的 dump（**三行次序的直接证据**） |
| `01-dynasty-tang-expanded.png` | 同时刻截图 |
| `ui-03-tags-view.xml` | 切到「标签」tab、两组都未展开时的 dump |
| `ui-04-tags-tang300-expanded.xml` | 点开「唐诗三百首」后的 dump（**三行次序的直接证据**） |
| `02-tags-tang300-3-rows.png` | 同时刻截图 |
| `ui-05-about.xml` / `03-about-content-version.png` | 关于页：应用 0.1.4 ／ 内容 2026.10.19.2 ／ 检查更新回「已是最新内容（远端 2026.10.18.3）」 |
| `ui-06-dynasty-han-expanded.xml` | 「汉」组展开后的 dump（可视区域内首几行次序未变） |
