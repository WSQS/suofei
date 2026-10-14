# 索斐 Android（工作线 D）

Kotlin + Jetpack Compose 的 Android 端骨架，含**最小可运行阅读实现**与**离线内容更新**。
离线与更新的语义、接口决定、失败处理见 [`../docs/design/android-offline-update.md`](../docs/design/android-offline-update.md)；
内容格式见 [`../docs/design/content-contract.md`](../docs/design/content-contract.md)。

> 应用展示名「索斐」、`applicationId = dev.sopho.suofei` 由用户 2026-10-14 拍板（发布后不可改）。

## 1. 构建与打包（本机实测命令）

```bash
cd android

# 需要 JDK 17。本机 java 不在 PATH，JAVA_HOME 已指向 ms-17.0.17：
#   JAVA_HOME=C:\Users\wsqsy\.jdks\ms-17.0.17
./gradlew assembleDebug          # 产物：android/app/build/outputs/apk/debug/app-debug.apk

./gradlew testDebugUnitTest      # 55 个 JVM 单测（无需设备/模拟器）
```

- 本机 `gradle` 不在 PATH，用 wrapper（`gradlew` + `gradle/wrapper/`，发行版已缓存在 `~/.gradle/wrapper/dists`，不需要联网下载）。
- 首份 SDK 路径来自 `android/local.properties`（**已 gitignore，不提交**）；缺失时在 `ANDROID_HOME` 或该文件里指到 Android SDK。

### 本机网络坑（实测）

`~/.gradle/gradle.properties`（**全局文件，本工作线不改它**）里配了 `systemProp.http(s).proxyHost=localhost:7890`。
那个代理**到不了** `dl.google.com` 与 `repo.maven.apache.org`（curl 直连 200，走代理 `000`/握手被断），
于是 Gradle 报 `Remote host terminated the handshake`。本工程的依赖大多已在本机 Gradle 缓存里，所以
`assembleDebug` 不受影响；**单元测试**需要下载 `org.json:json`，可用一个**可选镜像开关**绕开：

```bash
./gradlew testDebugUnitTest -PextraMavenMirror=https://maven.aliyun.com/repository/public
```

`settings.gradle.kts` 默认不配置任何镜像（保持工程可移植），只在传了 `-PextraMavenMirror` 时追加该仓库。

## 2. 版本组合与依据（不是凭记忆）

| 组件 | 采用版本 | 依据 |
|---|---|---|
| Gradle | **8.13**（wrapper） | 本机 `~/.gradle/wrapper/dists/gradle-8.13-bin/5xuhj0ry160q40clulazy9h7d` 已缓存，且该目录 hash 对应官方 URL `services.gradle.org/distributions/gradle-8.13-bin.zip`（实测用脚本算 md5-base36 比对一致）⇒ wrapper 无需下载 |
| AGP | **8.13.1** | 本机缓存 `~/.gradle/caches/.../com.android.tools.build/gradle/8.13.1`；官方兼容表：AGP 8.13 要求 Gradle ≥ 8.13、JDK 17、最高支持 compileSdk 36.1（`developer.android.com` 本机直连不通，经 `web_search` 取官方发布说明） |
| Kotlin | **2.1.21** | 本机缓存 `kotlin-gradle-plugin/2.1.21` 与 `compose-compiler-gradle-plugin/2.1.21`；Compose 编译器版本必须随 Kotlin 走（用的是 `org.jetbrains.kotlin.plugin.compose`） |
| Compose BOM | **2025.07.00**（Compose 1.8.3 / Material3 1.3.2） | 本机缓存 `androidx.compose/compose-bom/2025.07.00`，同 BOM 内的 `ui`/`foundation`/`material3` 均已缓存 ⇒ 可离线构建 |
| compileSdk / targetSdk / minSdk | **36 / 36 / 26** | 本机 SDK 有 `platforms/android-36`、`build-tools/36.0.0`；minSdk 26 是 `java.nio.file`（原子重命名）与现存 Compose 需求的自然下限 |
| JDK | **17**（`ms-17.0.17`） | `JAVA_HOME` 实测；AGP 8.13 要求 JDK 17 |
| JSON | Android 平台自带 `org.json` | 运行时不引第三方 JSON 库；JVM 单测用 `org.json:json:20240303` 提供实现 |

验证结果：`clean assembleDebug` 与 `testDebugUnitTest` 复测通过（`--rerun-tasks` 下 43 个任务全部实际执行、非缓存，BUILD SUCCESSFUL）；**55 例全绿**（2026-10-14 复测，含存储层「只留当前」与「落盘/写指针失败不留孤儿目录」两轮改动的回归）。
`aapt2 dump badging` 实测：`package: name='dev.sopho.suofei' versionCode='1' versionName='0.1.0'`、`minSdkVersion:'26'`、`targetSdkVersion:'36'`、`application-label:'索斐'`、`uses-permission: android.permission.INTERNET`。

## 3. 内置内容：已是真实产物（2026-10-14 由负责人替换完成）

替换已按下面步骤实际执行过（不是待办）：

1. ✅ 用编译线 C 产出的 `dist/content.json` 覆盖 `android/app/src/main/assets/content/content.json`；
2. ✅ 删掉占位的 `FIXTURE-README.md`，并更新本 README 与设计文档里「内置内容为占位夹具」的表述；
3. ✅ `ContentParserTest` 里原来点名 `fixture-*` 的断言已改成真实内容断言（首＝行行重行行、末＝明月何皎皎、8 个印刷行、首尾行原文、19 首均无笔记、异文不入正文）；
4. ✅ 重跑 `testDebugUnitTest` 与 `assembleDebug`，并用第 4 节命令确认 APK 内 JSON 与源文件 sha256 一致。

以后每次发新版内容，照上述 1–4 再做一次即可。要点：

- 路径常量只有一处：`ContentRepository.ASSET_PATH = "content/content.json"`。
- **内置内容必须与 `dist/content.json` 字节一致**（第 4 节的门就是查这个）；不一致就意味着 APK 内置的版本与你以为发布的内容不是同一份。
- **真实 19 首里没有任何笔记**（`notes` 全为 `null`），这是真实空状态，不是缺失；UI 显示「（无笔记）」，不得生成占位笔记。

## 4. 自证：确认 assets 里的 content.json 真的在 APK 内

```bash
cd android
APK=app/build/outputs/apk/debug/app-debug.apk

# 方式一：apkanalyzer（本机 SDK cmdline-tools/latest 有）
"C:/Users/wsqsy/AppData/Local/Android/Sdk/cmdline-tools/latest/bin/apkanalyzer.bat" files list "$APK" | grep assets/
# 实测输出（2026-10-14，真产物 19 首）：
# /assets/
# /assets/content/
# /assets/content/content.json

# 方式二（更硬）：从 APK 读出内容并和源文件比 sha256
uv run python - <<'EOF'
import zipfile, hashlib
z = zipfile.ZipFile("app/build/outputs/apk/debug/app-debug.apk")
a = z.read("assets/content/content.json")
b = open("app/src/main/assets/content/content.json","rb").read()
print("APK 内 :", hashlib.sha256(a).hexdigest())
print("源文件 :", hashlib.sha256(b).hexdigest())
print("一致   :", a == b)
EOF
```

实测结果（2026-10-14）：APK 内 `assets/content/content.json` 23899 字节，sha256 `f58f945adcfb94aa50cdc0570f10a53a4956ebd22dab5b99b7684812bb724503`，与源文件、且与 `dist/content.json` **三方字节一致**。

## 5. 目录结构

```
android/
├── app/src/main/
│   ├── assets/content/content.json          # APK 内置内容（＝ dist/content.json，真实 19 首）
│   ├── java/dev/sopho/suofei/
│   │   ├── MainActivity.kt                  # 装配：store + repository + AppState，打开时自动检查更新
│   │   ├── data/ContentModel…（Domain.kt）  # 内容领域模型 + 分组/排序/搜索规则
│   │   ├── data/ContentParser.kt            # content.json 解析与契约校验（失败即抛错）
│   │   ├── data/Json.kt                     # org.json 薄封装（缺键/类型错 → 明确异常）
│   │   ├── data/ContentVersion.kt           # contentVersion 比较
│   │   ├── data/ContentStore.kt             # 本地快照、指针、原子切换、旧快照清理（纯 java.io，可 JVM 测）
│   │   ├── data/ContentRepository.kt        # 应用内读取内容的唯一入口与降级
│   │   ├── update/UpdateProtocol.kt         # ⚠️ 接口区：远端地址 + 清单字段与解析
│   │   ├── update/ContentUpdater.kt         # 检查 → 下载 → 校验 → 移交 Store 切换
│   │   └── ui/{AppState,Screens}.kt         # 界面状态与三个页面
│   └── res/values/{strings,themes}.xml      # app_name = 索斐
└── app/src/test/java/dev/sopho/suofei/      # 55 个 JVM 单测（含本机 HTTP 端到端更新流程）
```

### 5.1 设备上的运行时存储层（用户 2026-10-14 决定：只留当前）

```
filesDir/content/                       # 应用私有目录，卸载即清空
├── current                             # 指针：当前生效的 contentVersion
├── staging/<version>.part              # 下载临时文件（读者看不到，失败即丢弃）
└── versions/<contentVersion>/          # 只会有「当前版本」这一个目录
    ├── content.json                    # 完整内容快照，落盘后只读
    └── meta.json                       # sha256 / 来源 / 安装时间
```

- **没有 `previous` 指针、没有 `rollbackToPrevious()`**：用户 2026-10-14 拍板删掉（它全项目无调用者、无界面入口）。
  保旧版只剩两道：① 下载/校验失败就不切换；② APK 内置 assets 永久兜底。详见设计文档第 6 节。
- 升级成功后旧快照目录会被删除，因此内容根目录**恰好只有** `current` / `versions` / `staging` 三项（单测里按集合相等断言，多一项少一项都算回归）。
- 落盘/写指针失败（磁盘满、IO 错误）不会把异常抛上去，而是走 `InstallResult.Refused(IO)`：**未切换、不留无人引用的快照目录**、清掉半个 `current.tmp`，旧内容继续生效，原因在「内容更新」页如实显示。
- 同名重装（已装快照损坏、远端又给同一版）指针无需切换，直接当一次**修复**（单测 `reinstallOfSameVersion_repairsActiveSnapshot_withoutPointerSwap`）。

## 6. 签名（重要）

- 当前 APK 用 **debug 签名**（`apksigner verify --print-certs` 实测 `CN=Android Debug, O=Android, C=US`）。
- **它不能替代正式固定签名**：正式发布必须用固定私钥签名才能支持覆盖升级；密钥不入公开 Git。
  本阶段未读取/生成任何签名私钥，也未配置签名 secrets（授权未到）。

## 7. 已验证 / 未验证

**已验证**：`clean assembleDebug` 通过；APK 内 assets 存在且字节一致；**55 个 JVM 单测通过**（含更新流程的成功/失败/不兼容/损坏路径、「升级后只剩当前一个快照、旧版本目录确被删除」，以及「写指针失败 ⇒ 存储层明确 `Refused(IO)`、调用方拿到同类 `Failed(IO)`、不留孤儿目录、生效版本不变」——后两条做过反向验证：还原修复后它们会红）；APK 包名、展示名、SDK 版本、权限、签名证书实测。另有一道契约一致性门 `UnknownAuthorsSourceTest`：断言匿名作者清单与唯一来源 `schema/unknown-authors.json` 逐项一致（读不到文件即失败并列出尝试过的路径，不跳过；测试自身不持副本）。

**未验证**：未在真机或模拟器上运行（本轮不操作 adb 与任何设备）；Compose 实际渲染与交互未在设备上观察；未对真实发布源（HTTPS/真实 CDN）跑过更新；未做断网/弱网/应用升级的真机验证；未在设备上验证「删掉上一个快照」对用户路径无影响（它无界面入口，预期无影响）。
