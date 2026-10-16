# Android 系统返回（返回键/手势）修复 · 实测材料

> 起因：用户真机/模拟器实测「按返回**直接退出 app**」。根因＝全工程没有 `BackHandler` 接线，
> 系统返回落到 Activity 默认行为＝`finish()`。修法＝在 Compose 根 `AppRoot` 接一键
> `BackHandler(enabled = state.screen != Screen.LIBRARY) { state.back() }`，复用已有的 `AppState.back()`。
> 出材料的会话：`android-app-navigator-backha-166e0e8f`（工作树分支同名）。日期：2026-10-16。

## 用什么拍的（可复跑）

| 项 | 值 |
|---|---|
| 设备 | `emulator-5556`（`ro.serialno=EMULATOR36X1X9X0`，`sdk_gphone64_x86_64`，Pixel_6，android-35）。**只碰这一台**；没碰 `emulator-5554`(PD2364)、`YOCTO`、`127.0.0.1:7776`、用户手机 |
| 屏幕 | 1080×2400，默认密度 |
| 安装的包 | 本工作树 `assembleDebug` 的 **debug 变体**（`dev.sopho.suofei`，`versionCode 3` / `0.1.2`），`adb install -r` 覆盖安装 |
| 内容 | 真实内容：1 组 19 首（首＝行行重行行、末＝明月何皎皎），APK 内置，**未触发 pending 更新**（无「新内容」横幅） |
| 导航模式 | 原为 **gestural**；三键那一段临时切到 `threebutton`，**拍完已切回 gestural**（见下） |

## 证据对照（每一步都留了 png ＋ uiautomator dump 的可见文本/坐标）

| 文件 | 这一步在验证什么 | 结果 |
|---|---|---|
| `00-launch-library.png` | 冷启停在目录（首态全收起） | ✅ |
| `01-library-scrolled.png` / `.dump.txt` | 先把目录**展开**并**滚动到非零位置**（首可见项＝西北有高楼），记录坐标 | ✅ |
| `02-poem.png` / `.dump.txt` | 目录 → 诗「庭中有奇树」 | ✅ |
| `03-detail.png` / `.dump.txt` | 诗 → 详情（同一首） | ✅ |
| `04-systemback-detail-to-poem.png` / `.dump.txt` | **系统返回（KEYCODE_BACK）** 详情 → **那首诗**（仍是「庭中有奇树」），app 仍在前台 | ✅ |
| `05-systemback-poem-to-library.png` / `.dump.txt` | **系统返回** 诗 → 目录；展开仍在（`[−]`／19 首）、滚动位置与 `01` **逐字相同**（首可见项仍是「西北有高楼」，bounds 相同 `[165,173][402,238]`） | ✅ |
| `06-systemback-library-exits.png` | **系统返回** 目录根 → **退出 app**（focus 回 `com.wsqsy.home`；logcat `TransitionRequestInfo type=CLOSE` + `CoreBackPreview … Setting back callback null`） | ✅ |
| `07-gesture-detail-to-poem.png` / `.dump.txt` | **手势**（gestural 模式，从左沿内滑）详情 → 那首诗（「行行重行行」） | ✅ |
| `08-gesture-poem-to-library.png` / `.dump.txt` | **手势** 诗 → 目录（展开保留） | ✅ |
| `09-gesture-library-exits.png` | **手势** 目录根 → 退出（`CLOSE`） | ✅ |
| `10-about.png` | 目录 → 关于 | ✅ |
| `11-about-systemback-to-library.png` | **系统返回** 关于 → 目录 | ✅ |
| `12-detail-tapback-to-poem.png` | 详情页**点顶部「返回」** → 那首诗（与 `04` 系统返回**结果一致**） | ✅ |
| `13-threebutton-detail.png`、`14-threebutton-detail-fullscreen.png` | 切到 **threebutton** 导航后的详情页（图里可见底部 ◀ ● ■ 三键） | ✅ |
| `15-threebutton-chevron-detail-to-poem.png` | **真实点按三键返回 ◀**（坐标 252,2322）详情 → 那首诗（app 仍前台） | ✅ |
| `16-threebutton-chevron-library-exits.png` | **真实点按三键返回 ◀** 目录根 → 退出（`CLOSE`，回 home） | ✅ |
| `17-restored-gestural-final.png` | 切回 gestural 后再做一次手势返回（诗 → 目录），确认恢复后仍生效 | ✅ |

### 标题返回 与 系统返回 的一致性（要求 3）

| 页面 | 点顶部「返回」 | 系统返回 | 一致？ |
|---|---|---|---|
| 诗页（← 目录） | `12` 前序步骤：→ 目录 | `05` → 目录 | ✅ |
| 详情页（← 返回这首诗） | `12` → 那一首 | `04`/`15` → 那一首 | ✅ |
| 关于页（← 目录） | 与诗页同一按钮逻辑（`onBack = { state.back() }`），单测 + 源码守卫钉住 | `11` → 目录 | ✅ |

## 导航模式切换的留痕（可还原）

```
改动前：[x] com.android.internal.systemui.navbar.gestural
临时改：cmd overlay enable  com.android.internal.systemui.navbar.threebutton
        cmd overlay disable com.android.internal.systemui.navbar.gestural
改动后：[x] com.android.internal.systemui.navbar.threebutton
拍完还原：cmd overlay enable  com.android.internal.systemui.navbar.gestural
          cmd overlay disable com.android.internal.systemui.navbar.threebutton
还原后：[x] com.android.internal.systemui.navbar.gestural   （与改动前一致）
```

## 边界（**没有**做的部分）

- **横竖屏旋转 / 进程重建**：`AppState` 是用 `remember { }` 建的，本就**不跨配置变更保存**（无 `configChanges`，也无 `rememberSaveable`）⇒ 旋转/重建后回到**目录首页**，返回栈不保留。这是**既有行为**，本次修复**没有改变**它，也没有引入新的返回栈异常。
- **predictive back 动画**：没做手势预测动画改造。设备侧 logcat 出现 `CoreBackPreview`（说明走的是 `OnBackInvokedCallback` 路径），Compose 的 `BackHandler` 在该路径下已正常拦截；但**未**验证预测动画的视觉表现。
- **双按退出 / 返回二次确认 / 先收起笔记再返回**：均**未**实现（用户没要）。
- **只测了本工作树的 debug 变体**：没测 release/正式签名包（那是发布另一条线）。

## 未核 / 做不到

- 没有做「真实 pending 更新下的详情→诗不采用新内容」的**端到端**演示：`pendingVersion` 的 setter 是私有的、`manifestUrl` 不可注入 ⇒ JVM 单测造不出 pending，真机也没在本次触发到 pending 横幅。该不变量由**源码级守卫**（`AppStateNavigationTest.backFromPoemDetail_doesNotGoThroughOpenLibrary_soPendingIsNotAdopted`，断言 `back()` 的 `POEM_DETAIL` 分支不经过 `openLibrary()`）钉住，**未**做实机整链演示。
