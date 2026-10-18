# 真实 **2 个标签** 后的两端复核 —— 模拟器验收留痕（2026-10-18）

> 本目录是**实测证据**，不是规格。上位说明见
> [`../tag-tab/README.md`](../tag-tab/README.md)（标签 tab 的采纳锚与逐条对照）。
> 本轮只验一件新事实：顶层标签从 **1 个** 变成 **2 个**（真实内容：`古诗十九首` 19 条 ＋ `唐诗三百首` 2 条），
> 以及 **唐300 那首诗从两条路各进一次**时的逐层返回。

## 0 · 设备身份（每次操作前核对，只碰这一台）

| 项 | 值 |
|---|---|
| 序列号 | `emulator-5556`，`ro.serialno` = **`EMULATOR36X1X9X0`** |
| 系统 | API 35（`sdk_gphone64_x86_64`／`emu64xa`），`wm size` = **1080x2400** |
| 导航模式 | `navigation_mode=2` ⇒ `com.android.internal.systemui.navbar.gestural`（手势导航） |
| 其它设备 | 同机还有 `emulator-5554`（vivo V2364A，别人在用）、`YOCTO`、`127.0.0.1:7776` —— **一律未碰** |

## 1 · 装的是哪一个包，读的是哪一份内容

| 项 | 值 |
|---|---|
| 包 | `dev.sopho.suofei`，`versionCode=4` / `versionName=0.1.3`，`lastUpdateTime=2026-10-18 18:33:23` |
| APK | 本工作树 `./gradlew :app:assembleDebug`（`app/build/outputs/apk/debug/app-debug.apk`） |
| 内置内容 | `assets/content/content.json`，sha256 **`2c4f84e9dac450d695eb9fa587548eea17e95703168526cdce15180849cebfdd`**（= `dist/content.json` = `web/content.json`，同一次构建，`formatVersion=3` / `contentVersion=2026.10.18.1` / 22 首 / 2 标签） |
| 设备上读的是哪一份 | `adb shell run-as dev.sopho.suofei ls -R files` ⇒ **只有 `profileInstalled`**，`files/content` **不存在** ⇒ 没有任何已安装快照，读的就是**内置 assets**（不是热更来的旧内容，也不是夹具） |
| 关于页实测 | 「内容版本 **2026.10.18.1**」；更新检查如实回报「已是最新内容（远端 2026.10.16.26）」 |

⚠ **没有任何测试夹具标签**：这份内容就是 `content/poems/**` 编译出来的真产物。
`../tag-tab/` 那三轮用过的 `汉魏六朝诗选` / `咏怀` / `玉台新咏` 三条夹具，本轮**一条都没有**。

## 2 · 标签页：两个组头 ＋ 唐300 两行（1 → 2）

| 断言 | 实测 | 证据 |
|---|---|---|
| 标签页有**两个**组头，顺序照产物（古 gǔ 在 唐 táng 前） | `古诗十九首`、`唐诗三百首`；标签页**没有**任何计数 | `02-tags-two-groups.png/.xml` |
| 标签页不显示数量（朝代页仍有 `[19] 首 / [2] 首 / [1] 首`） | 标签页 dump 里没有 `[N] 首`；朝代页有 | `02-*` vs `01-library-dynasty-22.png/.xml` |
| `唐诗三百首` 展开后**两行**、顺序 **其一 → 其二**、作者都是杜甫 | `梦李白二首·其一` / `梦李白二首·其二`（`[−]` 展开态） | `02b-tags-tang300-expanded-two-rows.png/.xml` |
| 两组同时展开时，行不串组（19 行 + 2 行） | 展开后各自成段，`唐诗三百首` 在 19 行之后 | `03-tags-both-expanded-scrolled.png/.xml` |

## 3 · 唐300 那首诗，**标签视图**那条链（返回键）

进入前先量一遍「原视图」：两组都展开、滚到 `唐诗三百首` 在底部 → dump 存为 `04-*`。

| 动作 | 结果 | 证据 |
|---|---|---|
| 点「梦李白二首·其一」 | 诗页，题名 `梦李白二首·其一`，副行 `杜甫 · 唐 · 五言古诗` | `05-poem-tang300-1.png/.xml` |
| 点「详情」 | 详情页（底本与来源／异文 两节都在） | `06-detail-tang300-1.png/.xml` |
| `input keyevent KEYCODE_BACK` ① | 回到**这首诗的诗页**（不是标签视图） | `07-backkey1-poem.png/.xml` |
| `KEYCODE_BACK` ② | 回到**标签视图**：两组仍展开、滚动停在原位 | `08-backkey2-tagview-restored.png/.xml` |
| 手势滑返（`input swipe 2 1200 700 1200 250`，从屏幕左缘划入）① | 只退一层：详情 ⇒ 诗页 | `10-gesture1-poem.png/.xml` |
| 手势滑返 ② | 回到标签视图，状态与进入前**逐字相同** | `11-gesture2-tagview-restored.png/.xml` |

「状态保持」不是形容：把 dump 的 `text + bounds` 逐行拼起来比较，`s05`（进入前）与
`s09`（键返回后）、`s13`（手势返回后）**完全相等**（脚本输出 `true` / `true`）。

## 4 · 同一首唐300 诗，**朝代视图**那条链（返回键 ＋ 手势）

回到朝代页，展开「汉」（滚得动）＋「唐」→ 滚到「唐」可见 → dump 存为 `12-*`（这一份就是「进入前」的状态）。

| 动作 | 结果 | 证据 |
|---|---|---|
| 朝代页「唐」组展开（进入前状态） | 两行：其一 / 其二（与标签页同一份产物次序） | `12-dynasty-tang-expanded.png/.xml` |
| 点「梦李白二首·其一」 | 诗页 | `14-dynasty-path-poem-tang300-1.png/.xml` |
| 详情 | 详情页 | `15-dynasty-path-detail.png/.xml` |
| `KEYCODE_BACK` ① / ② | 诗页 → **朝代视图**（「唐」仍展开、滚动不变） | `16-…back1-poem.png/.xml`、`17-…back2-restored.png/.xml` |
| 手势滑返 ① / ② | 同上，逐层 | `18-dynasty-gesture1-poem.png/.xml`、`19-dynasty-gesture2-restored.png/.xml` |

同样做过逐字比对：`s20`（进入前）与 `s24`（键返回后）、`s27`（手势返回后）**完全相等**。

## 5 · 唐300 的**两首**都可达

| 断言 | 证据 |
|---|---|
| 标签视图点「其二」⇒ 诗页题名 `梦李白二首·其二`（`杜甫 · 唐 · 五言古诗`） | `20-poem-tang300-2.png/.xml` |
| 从「其二」返回 ⇒ 标签视图，两组仍展开 | dump `t4`（同 `04-*` 的布局） |

## 6 · 未做 / 未核（诚实清单）

- **真机**：只在模拟器（`emulator-5556`）跑过。触摸手感、字体回退、OLED 观感**没验**。
- `input keyevent KEYCODE_BACK` 是**真返回键事件**，手势那条是**真实边缘滑动手势**（设备处于
  `gestural` 导航）；三键导航角标**没验**。
- **热更路径本轮没重跑**：这一轮装的是内置内容（`files/content` 为空即证据），
  「旧版 APK 拒 format 3／坏内容保旧／同 app 热更」这些仍以 `../tag-tab/` 那一轮为准
  （那一轮的内容里带 3 条夹具标签，**不是**真库归属）。
- 标签多到 20/50 个、长标签名折行、320 宽下的标签页：本轮**没出图**。
- 无障碍（TalkBack 朗读与焦点顺序）**没核**。
