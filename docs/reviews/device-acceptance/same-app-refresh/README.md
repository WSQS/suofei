# 同版本号重打包 + 断网首装：模拟器实测证据（2026-10-16）

设备：本项目自己的模拟器 `emulator-5556`，`ro.serialno=EMULATOR36X1X9X0`（**不碰其他设备、不碰用户手机**）。

被测：`release/out/apk/suofei-2026.10.16.26-debug.apk`（本地演练构建，**debug 签名**；
`versionName 0.1.3` / `versionCode 4` 与线上 0.1.3 **一致**）。文字内容 `contentVersion 2026.10.16.26`（22 首 / 3 组）。

## 1. 同版本号覆盖安装

装之前设备上已有 `dev.sopho.suofei` `versionCode=4 / versionName=0.1.3`（`firstInstallTime=2026-10-16 16:10:41`）。
`adb install -r` **成功**，装后：

- `versionCode=4`、`versionName=0.1.3`（**一个都没变**）；
- `lastUpdateTime=2026-10-18 08:30:44`（更新过），`firstInstallTime` 仍是 `2026-10-16 16:10:41`（是**覆盖**，不是重装）；
- 新旧包的签名证书**同一张**（debug）：`CN=Android Debug, O=Android, C=US`，
  SHA-256 `faff248f15977835c25c25ec8c0b865fa6c4207bada8cfc8e5785ea8aa94e956`。
  ⇒ 覆盖安装合法的两个前提（同签名 + code 不大于已装值）都在本机核过。

原始输出见 `install-and-identity.txt`。

## 2. 断网 + 清数据后的冷启：读到的是**内置**的 22 首

- `cmd connectivity airplane-mode enable` ⇒ `airplane_mode_on=1`、`Active default network: none`、
  `ping 8.8.8.8` 返回 `connect: Network is unreachable`（**真断网**，不是“看起来没网”）；
- `pm clear dev.sopho.suofei`（清掉已下载/已采用的内容与指针）＋ `am force-stop` ⇒ 冷启；
- 目录首屏（组默认收起）：`汉 [19] 首`、`唐 [2] 首`、`近现代 [1] 首` ⇒ **合计 22 首**，
  来源只能是 APK 内置的 `assets/content/content.json`（离线且数据已清空）。
  - 截图 `01-library-22-offline.png`；UI 树 `ui-library-22-bundled.xml`。
- 「关于」页：**应用版本 0.1.3 / 内容版本 2026.10.16.26** —— 截图
  `02-about-app0.1.3-content2026.10.16.26.png`、`ui-about.xml`。

## 3. 「已装的 0.1.3 能读新内容」的另一半证据：磁盘快照被真的读走

联网取内容那一步要等站点部署（发布由负责人做）才能真验，所以这里验的是**同一条解析/采用路径**：
把快照按 `ContentStore` 的布局写到应用私有目录（`files/content/versions/<版本>/content.json` ＋
`files/content/current` 指针），离线冷启看它读哪一份。

- 指针 ＝ `2026.10.16.24`（**线上已发布那一份字节**，22486 字节）⇒ 目录显示 `汉 [19] 首` ＋ `近现代 [1] 首`
  ＝ **20 首 / 2 组**（`ui-library-20-adopted-24.xml`）；
- 指针 ＝ `2026.10.16.26`（本次内容，26083 字节）⇒ 目录显示 `汉 [19]` ＋ `唐 [2]` ＋ `近现代 [1]`
  ＝ **22 首 / 3 组**（`ui-library-22.xml`）；「关于」页内容版本变 `2026.10.16.26`
  （`ui-about-adopted-26.xml`）。

⇒ 已装的 0.1.3（`versionCode 4`）**确实能解析并渲染** `.26` 这份 format 2 内容
（与 `latest.json` 里 `minAppVersionCode: 3` 的口径一致）。

## 4. 设备已还原

- `pm clear` 回清洁状态（指针与快照清空，内容回到内置的那一份）；
- 飞行模式关闭（`airplane_mode_on=0`）、`mobile_data=1`，与原状态一致；
- `/sdcard` 上的临时 dump/截图已删除。

## 未验（如实记）

- **真机**上的覆盖安装与升级（这里只有本项目的模拟器）；
- **联网热更新**（应用从站点 `content/latest.json` 取到 `.26` 并落盘）：需要线上已经部署 `.26`，
  那是发布步骤（负责人做）；本文件第 3 节验的是同一条解析/采用路径，**不是**HTTP 取件本身。
- 正式签名包（`--android-variant release` + 四项 secrets）的安装：本机不读签名私钥，由 CI 做。

## 5. 联网核对：线上仍是 `.24`（我没有部署任何东西）

还原网络后（`airplane_mode_on=0`、`mobile_data=1`、`Active default network` 恢复）在「关于」页看应用自己的检查结果：

```
应用版本 0.1.3 ／ 内容版本 2026.10.16.26（内置的那一份）
检查更新 →「已是最新内容（远端 2026.10.16.24）。」
```

这一条同时说明两件事：

1. **联网是通的**（应用真的取到了远端清单并读出了 `contentVersion`）；
2. **线上仍是 `.24`** —— 本次工作**没有部署、没有打 tag、没有建 Release**，发布由负责人做。

它**不**等于「热更新取到 22 首」：那要等线上部署 `.26` 之后才能真验（应用不允许降级，所以现在它当然
保留本地更新的那份）。截图 `03-about-live-remote-still-2026.10.16.24.png`、UI 树 `ui-about-live-remote-24.xml`。

---

## 发布后实测（负责人，2026-10-18，部署完成之后）

部署完成后补做此前**做不到**的那一条（worker 只能给等价证据）：**已装的 0.1.3 不重装也能热更新**。

1. 设备只装**已发布的 0.1.3 正式包**（`suofei-2026.10.16.24.apk`，`versionCode=4 / versionName=0.1.3`，证书 `CN=Suofei`）⇒ 内置内容是 20 首。
2. 联网启动（应用自带自动检查）后：**目录变成 汉[19] / 唐[2] / 近现代[1] ＝ 22 首**；关于页 **应用版本 0.1.3 / 内容版本 2026.10.16.26**，状态 **「已是最新内容（远端 2026.10.16.26）」**。
   ⇒ **没有重装、没有换包**，只是取了新内容（`minAppVersionCode=3` 允许 vc3 读 format 2）。
3. 证据：`11-installed-013-library-after-hotupdate.png`（22 首）、`12-installed-013-about-content-26.png`（版本行与状态）。
4. 过程说明：卸载 debug 包时模拟器弹了第三方清理提示，我按 BACK 关掉（**没有**点「立即清理」），再 force-stop + 重新启动应用。
