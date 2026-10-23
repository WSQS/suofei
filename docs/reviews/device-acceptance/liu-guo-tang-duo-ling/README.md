# Android 端实测：刘过《唐多令·芦叶满汀洲》入库后（debug 构建，内容 `2026.10.23.3`）

- 日期：**2026-10-23**；串行、逐条 `-s emulator-5556`
- 设备：**`emulator-5556`**（本次由本工作线**自行启动**的 AVD `godot_test`）
  - 身份实测：`ro.boot.qemu.avd_name = godot_test`、`ro.serialno = EMULATOR36X1X9X0`、`ro.kernel.qemu = 1`、
    `ro.build.version.sdk = 33`、`ro.product.model = Android SDK built for x86_64`
  - **先核再认**：本轮开跑前 `adb devices` 里**没有** `emulator-5556`，序号本身不足以认设备，所以按 AVD 名与进程核过一遍再起：
    - `emulator-5554` 跑的是**别人的** AVD `pf5rep01`（`pf5rep01.avd` 持有 `hardware-qemu.ini.lock`，`qemu-system-x86_64` 进程在跑）⇒ **本次一次都没碰**
    - `YOCTO`、`127.0.0.1:7666`、`127.0.0.1:7776` ⇒ **一次都没碰**
    - 本工作线自己的 `godot_test` 原先**没有**在跑（无对应 qemu 进程）⇒ 自行启动到 5556 端口
- 安装包：`android/app/build/outputs/apk/debug/app-debug.apk`（`assembleDebug`，**debug 签名，非发布**）
  - APK 内 `assets/content/content.json` 实测 `sha256 = 757aa5123ba146ad3722d5411cfc583f320759b93539a50cf0fb3c95fd57ed1c`
    （与 `dist/content.json`、`web/content.json` 同一份）
- 版本：**应用版本 `0.1.4`（未动）**、`versionCode 5`（未动）、**内容版本 `2026.10.23.3`**（本地测试号，**非发布**）
  - 覆盖安装（同 debug 签名、同 versionCode）成功：`firstInstallTime 2026-10-21 20:43:17` → `lastUpdateTime 2026-10-23 21:19`
  - app 私有目录 `files/` 里只有 `profileInstalled` ⇒ **没有已激活的下载快照**，下面看到的目录就是**内置内容**

## 看过的图（本目录）

| 文件 | 核到的事 |
|---|---|
| `01-library.png` | 目录页初态：四组全收起，**汉 [20] 首 / 唐 [4] 首 / 宋 [1] 首 / 近现代 [6] 首** —— 宋组出现 1 首，组序 汉→唐→宋→近现代 |
| `02-song-expanded.png` | 点开「宋」：**唐多令·芦叶满汀洲（刘过）** 一行 |
| `03-poem.png` | 诗页：题名、身份行「刘过 · 宋 · 词」、正文**两阕各 3 行**（上片止于「又中秋。」、下片止于「少年游。」），阕间空行；顶行只有「返回」「详情」——**没有「笔记」入口**（`notes` 为 null） |
| `04-detail.png` | 详情页顶部：「底本与来源」段（汲古阁本＋两条电子转录＋访问日＋未目验声明）与「题名」小节 |
| `05-detail-line-and-stanza.png` | 详情页下滚：「分行与分阕」小节（规则原文、本首两阕各三行的逐行引文、以及「不是词牌行数契约」的说明） |
| `06-detail-tixiazhu.png` | 「题下注」小节的身份段（不称作者序、第三人称口气）与 OCR 用字差异段，下面是「体裁」小节 |
| `07-back-to-poem.png` | 系统返回一次：详情 → 诗页 |
| `08-back-to-library.png` | 系统返回两次：诗页 → **目录原视图**，「宋」仍展开、其余三组仍收起 |
| `09-tag-tab.png` | 标签 tab：仍**两组**（古诗十九首／唐诗三百首）——**没有**因新增本首而扩出标签 |
| `10-about-version.png` | 关于页：应用版本 `0.1.4`、内容版本 `2026.10.23.3`；「远端 `2026.10.20.1`」——线上最新版**未被本工作线推动** |

## 未验 / 边界

- **只 debug 构建**：发布签名、Release 包、正式覆盖升级**本次都没做**（不在本工作线授权内）。
- 横屏/旋转、系统字号放大、其他 API 级别的模拟器**未验**。
- 触摸手感、字体回退、OLED 观感**未验**（只在模拟器上跑过）。
- 「检查更新」的失败/中断路径本轮**未验**（本轮不改更新语义）。
- `emulator-5554`、`YOCTO`、`127.0.0.1:7666`、`127.0.0.1:7776` 上**没有**安装或操作本 app，也没有清理任何别人的数据。
