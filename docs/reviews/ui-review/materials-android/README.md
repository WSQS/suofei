# Android 逐屏材料（模拟器实拍）

> 用途：供对话侧在 `docs/reviews/ui-review-checklist.md` 上**逐格过账**。**不是**原型图、**不是**夹具数据。
> 出材料的会话：调度侧（负责人）。日期：2026-10-15。

## 这一套是用什么拍的（可复跑）

| 项 | 值 |
|---|---|
| 设备 | `emulator-5556`（本机自用实例，AVD `Pixel_6`，android-35 x86_64）。**没碰**别人的设备：`YOCTO`、`127.0.0.1:7776`、以及 adb 里的残留条目 `emulator-5554`（端口拒连，是死条目） |
| 屏幕 | 1080×2400，默认密度 420dpi；**窄屏那张**用 `wm density 480`（≈**360dp** 宽，拍完已 `wm density reset`） |
| 安装的包 | **正式签名 release 变体 `0.1.1`（`versionCode 2`）**：用本机正式密钥在 `android/` 里 `assembleRelease` 产出（`apksigner` 证书 `CN=Suofei, OU=suofei, O=WSQS, C=CN`）；从已装的 `0.1.0` **覆盖安装成功** |
| 内容 | **真实内容：1 组 19 首**（首＝行行重行行、末＝明月何皎皎） |
| 生效内容版本 | 见每张图页脚。先验到 `2026.10.16.9（来源：APK 内置）`，后经**真实站点**更新为 `2026.10.16.18（来源：已下载）` |

复跑命令（PowerShell/Git Bash 均可用，`$ADB` = `$ANDROID_HOME/platform-tools/adb.exe`）：

```bash
# 起我自己的模拟器（注意：这台 AVD 的 AVD 目录要显式给，因为本机 ANDROID_SDK_HOME 指向别处的 avd/）
export ANDROID_AVD_HOME="C:\\Users\\wsqsy\\.android\\avd"
"$ANDROID_HOME/emulator/emulator.exe" -avd Pixel_6 -no-boot-anim &

# 装当前版本的正式包
cd android && ./gradlew assembleRelease -PextraMavenMirror=https://maven.aliyun.com/repository/public
"$ADB" -s emulator-5556 install -r app/build/outputs/apk/release/app-release.apk
"$ADB" -s emulator-5556 shell am start -n dev.sopho.suofei/.MainActivity

# 截图 / 取屏上文本（文本用于核对，不靠眼看）
"$ADB" -s emulator-5556 exec-out screencap -p > shot.png
"$ADB" -s emulator-5556 shell uiautomator dump /sdcard/w.xml && "$ADB" -s emulator-5556 shell cat /sdcard/w.xml
```

## 图与格子的对应

| 文件 | 对应格子 | 这一张证明了什么（含实测文本） |
|---|---|---|
| `a-index.png` | A1/A2/A3 | 目录默认：组头「汉」＋左沿发丝竖线＋**`[19] 首`**；组内 19 首＝底本原次序；页脚 `应用 0.1.1 (2) · 内容 2026.10.16.9（来源：APK 内置）` |
| `a-index-narrow-360dp.png` | **G1**（窄屏不许裁切） | 360dp 下计数节点仍完整：`[19] 首` 的 bounds＝`[830,363][970,415]`（在 1080 宽内）⇒ **没有被裁成 `[19`**（原型在 420px 视口下会裁） |
| `b-poem.png` | B1–B6 | 诗页：`汉 · 东汉末 · 五言古诗`；正文 8 行；**没有「异文」栏、没有诗 id 行**；题头无下划线 |
| `b-notes-collapsed.png` | B7（折叠态） | 与 `b-poem.png` 同一张：**笔记默认折叠**，屏上只有「笔记」两字（不含空状态文案） |
| `b-notes-expanded.png` | B7（展开态） | 点开后：按钮变「收起笔记」，正文出现 **「（无笔记）」**（真实空状态，不是占位文案） |
| `c-search-empty.png` | C1 | 空输入：输入框提示 `搜索诗名或作者（跨时代）`＋一句 `输入诗名或作者即可跨组搜索。` |
| `c-search-results.png` | C2 | 查询「明月」：结果 `明月皎夜光`、`明月何皎皎`（各带 `汉`／`佚名`）⇒ 跨组、同组内次序一致 |
| `c-search-none.png` | C3 | 查询 `zzzz`：输入框里就是 `zzzz`，屏上 `无匹配结果。`（如实说没有，不假装有） |
| `d-update-activated.png` | D2/D3 | **真实站点成功路径**：状态＝`新内容 2026.10.16.18 已下载、校验通过并已切换生效（23011 字节）；返回目录后采用。`，页脚变 `内容 2026.10.16.18（来源：已下载）`；更新源＝`https://wsqs.github.io/suofei/content/latest.json` |
| `d-update-failed-offline.png` | D2/E2（失败面） | 断网（飞行模式）后检查：状态＝`更新未生效，旧内容保留：取更新清单失败：Unable to resolve host "wsqs.github.io": …`，而**生效内容版本仍是 `2026.10.16.18（来源：已下载）`** ⇒ 失败不动已有内容 |
| `e-offline-hub.png` / `e-offline-poem.png` | E3（Android 侧） | **断网状态**下目录仍 19 首、诗页仍可读（内置/已下载内容兜底） |

## 拍不到 / 只能部分拍到的格子（老实话）

| 格子 | 情况 | 原因与说明 |
|---|---|---|
| **D1 Idle（「尚未检查。」）** | ❌ **没拍到** | 应用**启动即自动检查**（`MainActivity` 的 `LaunchedEffect` → `checkForUpdate()`），所以能打开更新页时状态已过 Idle。我试过 `pm clear` 后密集 dump 去捕「尚未检查。」，**没捕到**。⇒ 待评审判断「这个状态用户到底能不能看到」；它目前只由单测 `UpdateStatusTextTest` 保证非空 |
| **Checking（「正在检查…」）** | ❌ 没拍到 | 同上：瞬态，且本机网络下很快就过去 |
| **D2 的「有更新/下载中/不兼容」三个状态** | ❌ 没拍到 | 需要远端**故意造**一个更高版本或不兼容清单；本次真实站点给的是更高版本 ⇒ 直接走到「下载→校验→切换」，屏上留下的是那句 Activated 文案。**要构造这几个状态得另做一次演练**（我这边认领，属发布线验证，不是评审材料） |
| **B8 长笔记可读性** | ❌ 无可核材料 | 真实内容里 **0 条笔记**（用户还没写过；清单明令不许用夹具）⇒ 只能等用户写下第一条 |
| **G3 超长题名/作者** | ❌ 无可核材料 | 真实内容的题名最长 6 字、作者一律「佚名」⇒ 没有超长样本 |
| **F1/F2 图标** | ⏳ 待补 | 由图标那条线产出后补拍（本条线不填） |

## 两条会绊倒复跑者的事实（记下来）

1. **模拟器没有中文输入法**，`adb shell input text` 只吃 ASCII（输入中文会抛 `Exception occurred while executing 'text'`）。**不装任何东西**的办法：用**宿主机剪贴板 ＋ 模拟器剪贴板共享**——
   `powershell -c "Set-Clipboard -Value '明月'"` → 点一下输入框 → `adb shell input keyevent 279`（KEYCODE_PASTE）。
   `c-search-results.png` 就是这么拍的（`c-search-none.png` 的 `zzzz` 同样走粘贴，保持一致）。
2. **⚠ 飞行模式可能被上一次「真断网」验收留在开着**：那时 `ip route` 空、`ping` 回 `Network is unreachable`，症状看起来像「网点坏了」。排查先看 `adb shell settings get global airplane_mode_on`（应为 `0`）。
