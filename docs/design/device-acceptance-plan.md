# 真机/模拟器验收计划（待授权执行）

> 2026-10-14 由负责人起草。**状态：未执行**——需要用户单独授权（工程约定：涉及设备的动作要先核对设备身份与占用）。
> 这份文档的作用：授权后可以**照着跑**，不用再临时设计；也让用户先看清「我会做什么、不会做什么」。

## 一、这次要验证什么（以及明确不验证什么）

| # | 要验证 | 怎么验证 | 证据 |
|---|---|---|---|
| 1 | APK 能装、能启动、不闪退 | `adb install -r` + 启动 Activity + 看是否有 `FATAL EXCEPTION` | 安装输出、`logcat` 片段 |
| 2 | 首屏：分组目录渲染正确（1 组「汉」、19 首、次序＝《文选》原次序） | `uiautomator dump` 取界面节点断言（**不盲点**） | dump 片段 + 截图 |
| 3 | 诗页：正文分行、分节、空行与产物一致 | dump 文案与 `dist/content.json` 逐行比对 | dump 片段 + 截图 |
| 4 | 搜索跨组命中诗名/作者 | 输入「明月」等，断言命中集合 | dump 片段 |
| 5 | 笔记空状态（真实状态：19 首全无笔记） | 断言显示「（无笔记）」而**不是**空白或占位笔记 | dump 片段 |
| 6 | **断网可读**（首装断网也有完整内容） | 关掉模拟器网络（或 `adb shell svc wifi/data disable`）后重启应用 | 截图 + dump |
| 7 | **更新流程真跑**：下载→校验→原子切换→阅读中不替换 | 本机起一个静态服务当「远端」，放一份新内容 + 小纸条清单；点检查更新 | 服务日志、切换前后 dump |
| 8 | 失败保旧版：坏内容/不兼容不进 | 刻意发坏 JSON / 更高 `formatVersion` | dump 文案 |
| 9 | 应用名与图标下方文字＝「索斐」、包名 `dev.sopho.suofei` | `aapt2 dump badging` + 桌面截图 | 命令输出 + 截图 |
| 10 | **深色长文的阅读疲劳** | **只有用户肉眼能判**（模拟器观感 ≠ 真机） | **用户自己的判断** |

**明确不做的**：① 不做任何对外发布动作；② 不改系统设置/不 root；③ **不按 `emulator-*` 模式杀进程**（本机有别人的模拟器实例）；④ 不把 APK 装到用户手机（除非用户明确要求并确认设备）；⑤ 不声称第 10 项「已验证」——那是用户的主观感受。

## 二、设备选择与身份核对（最容易出事故的一步）

已核实事实（2026-10-14 实测，可能过期，执行时**重新实测**）：

- AVD 在 `~/.android/avd`，有 `Pixel_6`、`UE_pixel_6_API_35`（android-35 google_apis x86_64）。
- 本机设了 `ANDROID_SDK_HOME=<SDK 目录>`，所以 `emulator -avd <名字>` 会去 `$ANDROID_SDK_HOME\avd` 找而不认 AVD ⇒ 必须 `export ANDROID_AVD_HOME=C:/Users/wsqsy/.android/avd`。
- 启动参数：`-no-window -no-audio -no-boot-anim -no-snapshot -gpu swiftshader_indirect`（WHPX 可用，冷启约 12 秒）。
- **本机还跑着别人正在用的模拟器实例**（`emulator-5554` 报 `model=V2364A`，那是 vivo 机型、**不是 AVD 镜像**）⇒ 自己起的那台很可能是 `5556`。

**身份核对步骤（执行时逐条做）**：

1. 启动前记录 `adb devices` 的完整序列号列表。
2. 启动自己的 AVD。
3. 启动后再取一次，**新出现**的那个序列号才是自己的。
4. 之后所有 `adb` 命令都带 `-s <那个序列号>`。
5. 收尾只按**精确序列号**关闭（`adb -s <serial> emu kill`），绝不用模式匹配。

## 三、执行步骤（照抄即可）

```bash
# 0. 环境
export ANDROID_AVD_HOME=C:/Users/wsqsy/.android/avd
export ANDROID_HOME=C:/Users/wsqsy/AppData/Local/Android/Sdk
ADB="$ANDROID_HOME/platform-tools/adb.exe"

# 1. 记录启动前的设备（用于识别自己那台）
"$ADB" devices -l

# 2. 启动（冷启约 12 秒）
"$ANDROID_HOME/emulator/emulator.exe" -avd Pixel_6 -no-window -no-audio -no-boot-anim \
  -no-snapshot -gpu swiftshader_indirect &

# 3. 等 boot 完成（轮询 sys.boot_completed），再确认「新出现的序列号」
"$ADB" wait-for-device
until [ "$("$ADB" -s <SERIAL> shell getprop sys.boot_completed | tr -d '\r')" = "1" ]; do sleep 2; done

# 4. 装 APK（用发布流水线产出的那份，它内置的正是本次内容）
"$ADB" -s <SERIAL> install -r release/out/apk/suofei-<版本>-debug.apk

# 5. 启动 + 断言界面（**先 dump 再点**，绝不盲点）
"$ADB" -s <SERIAL> shell am start -n dev.sopho.suofei/.MainActivity
"$ADB" -s <SERIAL> shell uiautomator dump /sdcard/ui.xml
"$ADB" -s <SERIAL> shell cat /sdcard/ui.xml   # 断言：1 组「汉」、19 首、《文选》原次序首＝行行重行行

# 6. 读一首诗 + 截图
"$ADB" -s <SERIAL> exec-out screencap -p > acceptance/poem.png

# 7. 断网可读
"$ADB" -s <SERIAL> shell svc wifi disable; "$ADB" -s <SERIAL> shell svc data disable
#    重启应用，断言仍能读；截图

# 8. 更新流程（本机起服务当「远端」，只在本机、不对外）
node release/…（或自写小静态服务）提供 latest.json + 新版本内容
#    断言：检查更新 → 提示「已下载，回到目录后生效」；阅读中不替换；回目录切换成功；坏内容/更高 formatVersion ⇒ 保留旧版
```

## 四、每步的期望结果与「这不算通过」的情形

- 界面**必须先 `uiautomator dump` 再断言/点击**：盲点会点开快捷设置面板或系统对话框，之后所有输入都打在系统 UI 上（本机踩过三次）。
- `dumpsys alarm` 之类包含历史的输出**不能当「待触发」的证据**。
- 模拟器上的观感**不等于**真机：字体回退、OLED 观感、滚动阻尼都测不到 ⇒ 第 10 项只能由用户判。
- 任何一步失败都要**原样保留输出**（截图 / dump / logcat），不许「重试一下就好了」当结论。

## 五、验收产出

- `acceptance/` 目录：每步截图 + `ui.xml` dump + `logcat` 关键片段 + 一份「实测/未实测」清单；
- 结论写回 `docs/status.md` 的诚实边界：**明确区分**「模拟器上验证过」与「真机上验证过」。
