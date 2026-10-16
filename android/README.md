# 索斐 Android（工作线 D）

Kotlin + Jetpack Compose 的 Android 端骨架，含**最小可运行阅读实现**与**离线内容更新**。
离线与更新的语义、接口决定、失败处理见 [`../docs/design/android-offline-update.md`](../docs/design/android-offline-update.md)；
内容格式见 [`../docs/design/content-contract.md`](../docs/design/content-contract.md)。

> 应用展示名「索斐」、`applicationId = dev.sopho.suofei` 由用户 2026-10-14 拍板（发布后不可改）。

> ⚠ **跨组搜索已移除**（用户 2026-10-15 决定：**第一版不做搜索**，原话「我不认为这是必须的」）：
> 本端原有的目录页「搜索」入口、独立搜索屏、`Content.search()`、命中高亮与相关单测**已删除**
> （不是隐藏，留着将来也不会有入口）。留痕见 [`../docs/interface-decisions.md`](../docs/interface-decisions.md)
> 的 **IF-46**。视觉令牌 `mark-bg`/`mark-text` 与结果行字号等仍留在 `ui/Theme.kt`，但**已无任何界面使用者**
> —— 它们只为与规范 §2 的「颜色一一对应」门保持一致（规范侧条目待负责人删除）。

> **页面集合＝四个（用户 2026-10-15）**：**目录 / 诗 / 诗歌详情（新增第四页）/ 关于（原「更新页」改名）**。
> ⚠ **2026-10-16 起详情页的呈现方式变了**（见下节）：不再是「`variants` 结构化渲染」，而是渲染
> 产物的 `detail` **整段 Markdown**（最小子集）。

## 0. 2026-10-16 变更：字段集升版 + 四页按采纳锚重排 + 从零的最小 Markdown 渲染

用户 2026-10-16 授权「实现＋迁移 19 首、本地核验」（**严禁公开发布**），本端这一批做的是
**字段新形状 ＋ 四页 UI（按归档原型逐项对照）+ 最小 Markdown 渲染**。逐项对照结论在交付报告里。

| 变更 | 落点 | 说明 |
|---|---|---|
| **字段新形状（`formatVersion` 2）** | `data/Domain.kt`、`data/ContentParser.kt` | 顶层 `dynasties`＝**有序中文值数组**；每首 **10 键** `id,title,author,dynasty,genre,source,orderInSource,detail,stanzas,notes`；`dynasty` 是**中文单值**并与顶层数组**精确匹配**；`detail`/`notes` 空节 ⇒ `null`（**键仍在**）。旧形状（`dynastyKey`/`dynastyLabel`/`dynastyOrder`/`era`/`variants`）**不再认识** |
| **目录页** | `ui/Screens.kt`、`ui/StructuralMarks.kt` | 采纳锚 `hub-hierarchy`／`hub-horizontal`／`hub-align`：**不画卡片**、记号**悬挂＋竖直居中**（槽 27.52px／固定缝 0.4rem）、**组名左沿＝题名左沿（缩进 0）**、作者**紧随题名**、「关于」在**顶部**；行为＝**首态全收起（含单组）**、**整块组头可点**、**各组独立展开**（IF-44）；顶部**不重复显示应用名**（`q-52a14e2c`）、**版本页脚已移除**。⇒ **不再画** §4.1-1 那条组名竖线（负责人 2026-10-16 已把该条标为被取代，Web 同步） |
| **诗页** | `ui/Screens.kt`、`ui/PoemHead.kt`、`ui/SemanticBreak.kt` | 题名／身份行／**每个视觉行都居中**；顶部行＝**返回左／笔记 · 详情右**（不参与居中）；**正文之后没有页脚行**；身份行＝**作者 · 朝代 · 体裁**；**语义折行**（够宽保原行；超宽按句读；多标点取窗内最后一个；无标点或半句超宽⇒字位断；收尾标点不起行） |
| **笔记（档②）** | `ui/Screens.kt` | 入口在**顶部行**（`[+]笔记`／`[−]笔记`），展开内容在**正文之后、同一列、无框**；**`notes == null` ⇒ 连入口都不出现**（不再有「（无笔记）」占位） |
| **详情页** | `ui/Screens.kt`、`ui/Markdown.kt` | 诗题①**左对齐**／来源①**正文前带标签「底本与来源」**／`detail` 整段走**最小 Markdown 渲染**（`### ` 小标题**无竖线**、`> ` 引用块＝缩进＋左边线）；**不重复身份信息**、不再有固定副题与硬编码「异文」标题 |
| **关于页** | `ui/Screens.kt` | 采纳锚 `about-min` 的 **V3（标签左对齐）**＋`about-update` 的两条：**无区域框**、**初态只显示按钮**（不生成状态文本元素、不占位）；**仓库链接（C1 完整 URL）置底**；**不再显示更新源地址**（`q-9f9eca3d` 未采纳它）；共用版本信息里**不出现「来源：」**。⚠ 2026-10-16 又补一步：共享字段集**同步为 4 项**（应用名／应用版本／内容版本／仓库链接）——**不再渲染**「一句话说明」与「诚实的限制」；标签「内容版本与来源」收成「内容版本」。⚠ **2026-10-16 返修（实现偏离已采纳锚）**：仓库链接改成**可点的链接**（C1 本来就是 `<a href>`；点了用外部浏览器打开同一条 URL，`LocalUriHandler` ⇒ `ACTION_VIEW`，仍不加任何提示文案）——守卫见 `ScreenInventoryTest.aboutScreen_repoLink_isClickable_andOpensItExternally`（源码级，非点击级） |
| **最小 Markdown 渲染** | `ui/Markdown.kt` | **从零新增**：逐行解析成段落／无序列表／有序列表／三级标题／引用块，行内 `**粗体**`／`*斜体*` 用 `AnnotatedString`；范围＝**闭集 8 样**（唯一来源 `items/content-format/prototypes/rules-v4/md-subset.md` 与机器可读的 `expectations.json`），**闭集之外不加分支**（编译期报错挡住） |
| **内置产物** | `app/src/main/assets/content/content.json` | **机械转换**成 v2 形状（不新写一个字）：19 首的 `id/title/author/genre/source/orderInSource/stanzas` 逐字保留，`dynasty`＝`汉`，`notes`＝`null`；⚠ **`detail` 已不是全 null**（S3 迁移把 `## 详情` 写进去了，13 首非空、6 首源里本就没有这一节 ⇒ `null`，见「已知依赖」2）。⚠ **`variants`（24 条异文）不在新形状里** ⇒ 见「已知依赖」 |

**已知依赖（合并前必须由负责人/编译器线处理，本端不单方面动）**

1. **`tools/check-bundled-content.mjs` 会崩**（它读 `p.variants.length`，v1 时代的门）—— 字段集一变它就必须与编译器线/S3 同批更新；`npm test` 里包含它。
2. ~~**24 条异文不在内置产物里**~~ ⇒ **2026-10-16 已解决**：S3 迁移把 `content/poems/古诗十九首/` 的 `## 详情` 节写进了内置产物 ⇒ **13 首的 `detail` 非空**，其余 6 首源里本就没有那一节 ⇒ `null`（不是空串、不是占位），详情页只对那 6 首显示「这一首在产物里没有详情正文。」。本端单测随之改写：不再断言「全是 null」，而是**逐首对着源文**核（`ContentParserTest.detailAndNotes_reflectTheSourceProduct_forEveryPoem`）——本轮真跑时发现这条旧断言与另两条依赖旧 id 的断言**已被 build cache 的陈旧结果掩盖**（见下）。
3. ~~**`web/about-fields.json`（跨端共用字段集）落后于 `q-9f9eca3d`**~~ ⇒ **2026-10-16 已同步**：Web 线在 `3394fd5` 把唯一来源改成 **4 项**，本端这次跟上——`AboutFields.LABELS`＝**应用名／应用版本／内容版本／仓库链接**，关于页**不再渲染**「一句话说明」与「诚实的限制」，标签收成「内容版本」、值里不带「来源」，仓库链接与 Web 同一来源（唯一来源仍是那个文件的 `repoUrl`，本端只能硬编码 ⇒ 由 `AboutFieldsTest.appNameAndRepoUrl_matchTheSharedSource` 钉回去）。⚠ **「诚实的限制」那段文案在本端随之整段撤掉（`ABOUT_LIMITS_ANDROID` 已删）**：Web 那侧它仍留在**页脚状态面板**里，而 **Android 没有那样的页脚/状态面板**（原页脚已按采纳锚移除）⇒ 本端再没有它的位置。那两条「未采纳」记在 [`../items/ui-about/item.md`](../items/ui-about/item.md)。
4. **两端待统一的一处口径**：身份行顺序。`expectations.json` 的 Web 一列写 `dynasty · author · genre`，而诗页/详情页/宽度的采纳锚与本端任务书都是 **作者 · 朝代 · 体裁** ⇒ 本端按采纳锚实现（`ui/ScreenContent.kt` 的 `poemMetaLine`）。
5. **宽度口径的 V 取的是「Scaffold 内容区宽」**（已扣掉系统栏 inset），不是 Web 意义的视口宽：竖屏下两者差不多，横屏带侧栏时会略小。这是为了避免列被系统栏裁掉（本端一处**未在设备上验证**的口径差异）。

> **本机核验（2026-10-16）**：`./gradlew testDebugUnitTest --offline` ⇒ **143 例全绿**（基线 97 例；新增/改写 46 例；0 skip）。
> ⚠ 一如既往：**单测绿 ≠ 体验符合** —— 四页 UI 的逐项对照结论在交付报告里，观感仍需模拟器验收（本轮不碰设备）。
>
> ⚠⚠ **同一天实测到的一处假绿（已修）**：这些单测会在**运行期读仓库文件**（`web/about-fields.json`、
> `content/poems/**`、`schema/unknown-authors.json`、`items/…/real-01-full.json`）并用**相对路径**读内置产物，
> 而 Gradle **不知道它们是输入** ⇒ 文件一变，`testDebugUnitTest` 仍可能 `FROM-CACHE` **回放旧结果**：
> `about-fields.json` 已改成 4 项、单测必红，裸 `./gradlew testDebugUnitTest --offline` 却照样 `BUILD SUCCESSFUL`。
> 已在 `app/build.gradle.kts` 里把这些文件显式声明为单测输入（只影响「要不要重跑/能不能回放」，不改构建产物）。
> 要不要留这条声明由负责人定；**在此之前，任何「全绿」结论都必须用 `--rerun-tasks`（或 `--no-build-cache`）复核**。

## 1. 构建与打包（本机实测命令）

```bash
cd android

# 需要 JDK 17。本机 java 不在 PATH，JAVA_HOME 已指向 ms-17.0.17：
#   JAVA_HOME=C:\Users\wsqsy\.jdks\ms-17.0.17
./gradlew assembleDebug          # 产物：android/app/build/outputs/apk/debug/app-debug.apk

./gradlew testDebugUnitTest      # 143 个 JVM 单测（无需设备/模拟器；2026-10-16 实测全绿）
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

验证结果：`clean assembleDebug` 与 `testDebugUnitTest` 复测通过（`--rerun-tasks` 下 44 个任务：43 个实际执行、1 个最新，BUILD SUCCESSFUL）；**81 例全绿**（2026-10-15；含视觉令牌门与结构记号门，以及换更新源时新增的 `UpdateEndpointTest` 4 例）。

> ⚠️ **`assembleRelease` 在本机会以「缺少正式签名环境变量，fail-closed」直接失败**——这是发布线的设计（见 §8），不是编译错误；本地开发/验收一律用 `assembleDebug`。
`aapt2 dump badging` 实测：`package: name='dev.sopho.suofei' versionCode='1' versionName='0.1.0'`、`minSdkVersion:'26'`、`targetSdkVersion:'36'`、`application-label:'索斐'`、`uses-permission: android.permission.INTERNET`。

## 3. 内置内容：已是真实产物（2026-10-14 由负责人替换完成；**2026-10-16 机械转成 v2 形状**）

⚠ **现状（2026-10-16）**：内置产物已按**新字段形状**（`formatVersion` 2）写成，
但 `content/poems/` 还没有 `## 详情` 节 ⇒ `detail` 全为 `null`，**24 条异文暂时不在内置产物里**
（它们仍在 `content/poems/*.md` 与 `docs/sources/`）。⇒ 下面这套「与 `dist/content.json` 字节一致」的
流程**当前不成立**：`dist/content.json` 由 v1 编译器产出，`tools/check-bundled-content.mjs` 也还是 v1 时代的门
（它会崩）。**字段集升版必须与编译器同批** —— 那一步（S1/S3）由负责人管的另一条线做，落定后重跑下面 1–4 步即可。

1. ✅ 用编译线 C 产出的 `dist/content.json` 覆盖 `android/app/src/main/assets/content/content.json`；
2. ✅ 删掉占位的 `FIXTURE-README.md`，并更新本 README 与设计文档里「内置内容为占位夹具」的表述；
3. ✅ `ContentParserTest` 里原来点名 `fixture-*` 的断言已改成真实内容断言（首＝行行重行行、末＝明月何皎皎、8 个印刷行、首尾行原文、19 首均无笔记、异文不入正文）；
4. ✅ 重跑 `testDebugUnitTest` 与 `assembleDebug`，并用第 4 节命令确认 APK 内 JSON 与源文件 sha256 一致。

以后每次发新版内容，照上述 1–4 再做一次即可。要点：

- 路径常量只有一处：`ContentRepository.ASSET_PATH = "content/content.json"`。
- **内置内容必须与 `dist/content.json` 字节一致**（第 4 节的门就是查这个）；不一致就意味着 APK 内置的版本与你以为发布的内容不是同一份。
- **真实 19 首里没有任何笔记**（`notes` 全为 `null`），这是真实空状态，不是缺失。
  ⚠ **2026-10-16 更正**：新形状下 `notes == null` ⇒ **界面连笔记入口都不出现**（用户 `q-bed9e64e`）；
  原来那句「（无笔记）」占位已删除。

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

⚠ **2026-10-16 起这条不成立**：内置产物已机械转成新的 v2 形状（13 802 字节、`detail`/`notes` 全为 `null`），
而 `dist/content.json` 仍由 v1 编译器产出 ⇒ **不再字节一致**；`tools/check-bundled-content.mjs`（v1 时代的门）
会直接崩。字段集升版必须与编译器同批（见 §0 的「已知依赖」）。

## 5. 目录结构

```
android/
├── app/src/main/
│   ├── assets/content/content.json          # APK 内置内容（真实 19 首；2026-10-16 起为 v2 形状，见 §0）
│   ├── java/dev/sopho/suofei/
│   │   ├── MainActivity.kt                  # 装配：store + repository + AppState，打开时自动检查更新
│   │   ├── data/ContentModel…（Domain.kt）  # 内容领域模型 + 分组/排序规则
│   │   ├── data/ContentParser.kt            # content.json 解析与契约校验（失败即抛错）
│   │   ├── data/Json.kt                     # org.json 薄封装（缺键/类型错 → 明确异常）
│   │   ├── data/ContentVersion.kt           # contentVersion 比较
│   │   ├── data/ContentStore.kt             # 本地快照、指针、原子切换、旧快照清理（纯 java.io，可 JVM 测）
│   │   ├── data/ContentRepository.kt        # 应用内读取内容的唯一入口与降级
│   │   ├── update/UpdateProtocol.kt         # ⚠️ 接口区：远端地址 + 清单字段与解析
│   │   ├── update/ContentUpdater.kt         # 检查 → 下载 → 校验 → 移交 Store 切换
│   │   ├── ui/Theme.kt                     # ⚠️ 视觉令牌唯一集中处（值＝visual-tokens.md）+ Material3 主题
│   │   ├── ui/StructuralMarks.kt           # 规范 §4.1 结构记号：组名竖线 / `[n] 首`
│   │   ├── ui/PoemHead.kt                  # 诗页题头（§4.1-3：不画下划线，该文件不得出现分割线）
│   │   ├── ui/UpdateStatusText.kt          # 关于页「状态」行文案（纯函数，可单测）
│   │   ├── ui/ScreenContent.kt             # 各页纯内容（题下那行 / 关于页共享字段）+ 关于页限制原文
│   │   └── ui/{AppState,Screens}.kt         # 界面状态与四个页面
│   └── res/values/{strings,themes}.xml      # app_name = 索斐；窗口底色 #0e1315
│   └── res/drawable/ic_launcher_{background,foreground,monochrome}.xml   # 自适应图标三层（矢量）
│   └── res/mipmap-anydpi-v26/ic_launcher{,_round}.xml                    # 自适应图标入口（API 26+）
├── tools/make-launcher-icon.mjs             # 从只读交付源生成上面五个资源（内置自检，见 §6.4）
└── app/src/test/java/dev/sopho/suofei/      # 143 个 JVM 单测（含更新流程、视觉令牌门、更新源地址门、图标门、四页导航/清单门）```

### 5.2 四个页面与各页信息清单（⚠ **2026-10-16 已按采纳锚重排，下表是旧版描述，就地保留作留痕**）

下表描述的是 **2026-10-15 的候选实现**（四页已落地那次）。**2026-10-16 的现状以 §0 与交付报告为准**：
目录页不再有卡片/应用名/版本页脚、组头可折叠；诗页顶部行＝返回左／笔记 · 详情右、**正文之后无页脚行**；
详情页渲染 `detail` 的 Markdown（不再逐条渲染 `variants`）；关于页去框、初态无状态占位、多一条仓库链接、
不再显示更新源地址、**共享字段集同步为 4 项**（不再有「一句话说明」与「诚实的限制」）。

| 页 | 在代码里放了什么 | 明确**不放** | 守着它的断言 |
|---|---|---|---|
| **目录** `Screen.LIBRARY` / `LibraryScreen` | 应用名（顶栏「索斐」）、组头卡片（组名＋`[n] 首`＋左沿 2dp 竖线，**保持静态**）、诗行（题名＋作者）、**「关于」入口**（顶栏）、底部版本页脚 | 搜索入口、「有笔记」标记、组内题名预览、**组可折叠（IF-44 本版不做）** | `ScreenInventoryTest`（目录无「有笔记」、组头无 `clickable`、有「关于」入口） |
| **诗** `Screen.POEM` / `PoemScreen` | 题名、`时代 · 作者 · 年代 · 体裁`（`poemMetaLine`，与 Web 同一句）、正文（依底本分行、段间空行 1.2em）、笔记区（折叠；无笔记如实「（无笔记）」）、**「详情」入口**、顶部「返回」、页脚 | **底本与来源**（搬去详情页）、**任何 `variants[].text`** | `ScreenInventoryTest`（`PoemScreen` 不引用 `variants`/`poem.source`、有 `onDetail`）；`PoemDetailContentTest` |
| **诗歌详情** `Screen.POEM_DETAIL` / `PoemDetailScreen` | 诗题、「这一首的考据与来源」、**底本与来源**（`poem.source`）、**异文**（`poem.variants` 逐条：`n.` ＋ `variant.text` ＋ `variant.note`；无则如实说明） | —— | `ScreenInventoryTest`（引用 `poem.source`、`poem.variants`、`variant.text`、`variant.note`、**遍历全部** `variants.forEach…`）；`PoemDetailContentTest`（产物 **24 条/13 首**、每条 text/note 非空、6 首无异议） |
| **关于** `Screen.ABOUT` / `AboutScreen` | 应用名、一句话说明、应用版本（versionName/code）、内容版本与来源、诚实的限制（`ABOUT_LIMITS_ANDROID`）；**Android 额外一块「更新」**：更新源地址、状态文案、检查更新按钮 | —— | `AboutFieldsTest`（`AboutFields` 与 `web/about-fields.json` 逐项一致；`AboutScreen` 渲染每个字段与更新块）；`ScreenInventoryTest` |

行为规则（同一族，已一起写断言）：**详情页返回＝那首诗**（`AppState.back()` 在 `POEM_DETAIL` 只改 `screen`、不动 `selectedPoem`）；**诗页/关于页返回＝目录**（`openLibrary()`）；
**从诗页回目录恢复原滚动位置（IF-45）**：`AppRoot` 用 `rememberLazyListState()` 把列表状态**提升到跨屏的那一层**，`LibraryScreen` 离开组合后再回来时用同一个 state ⇒ 位置保留；
新开应用时它的初值是 0 ⇒ 「直开目录从顶部」自然成立。见 `AppStateNavigationTest`（四条转移）。

> ⚠ **诚实边界**：Android 侧没有跑模拟器/Compose UI 测试（本任务不碰设备），所以上表右侧是**源码级门 + 纯逻辑/内容级门**，
> 不是渲染验证。它们能挡住「接线断了 / 诗页又把异文画回来 / 详情页只画第一条」这类回归，**不能**代替观感验收。

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

## 6. 视觉：静默终端（用户 2026-10-14 选定）

**唯一来源＝`docs/design/visual-tokens.md`**（其源头是评审通过的原型 `prototype/css/theme-tech.css`）。
令牌**集中一处**：`app/src/main/java/dev/sopho/suofei/ui/Theme.kt`（`PoetryTokens` 值 + `PoetryTextStyles` 语义样式 +
`PoetryTheme` 接到 Material3 的 `darkColorScheme`/`Typography`/`Shapes`）。界面不写任何硬编码色值/字号。

- 单主题：无浅色备选、无切换开关、无偏好持久化（规范 §6）。
- **正文排版是这套视觉的核心**：17sp / 行高 2 / 字距 0.045em；**段间空行＝1.2em**（≈20.4dp，不得为 0）。
- 圆角 4/3dp、**无阴影**（不用 elevation）、仅 0.15s 颜色过渡、**不做位移/缩放/发光动画**。
- `res/values/themes.xml` 的窗口底色也改成 `#0e1315`（避免启动白闪）——浅色 Material 的默认白底正是这轮「评审过的视觉没接线」的表现之一。

### 6.1 三道结构记号（规范 §4.1，两端都要有）

| 记号 | Android 落点 |
|---|---|
| 组名左沿 2dp 发丝竖线（色＝`accent-line`）+ 左内边距 0.6rem | `ui/StructuralMarks.kt` 的 `GroupNameBar()` / `GroupNameRow()` |
| 计数 `[3] 首`（括号 `text-faint`、0.85em） | 同文件 `groupCountAnnotated()` |
| 诗页题头**不画下划线** | `ui/PoemHead.kt`（该文件不允许出现任何分割线/边框） |

### 6.2 让「值一致」可检查（门）

| 门 | 断言 |
|---|---|
| `VisualTokensConsistencyTest` | 读规范文件**逐项**比对：§2 颜色（22 个键一一对应，多一个少一个都报出来）、§3 字体与排版、§4 间距/圆角/无阴影/0.15s、§4.1 三样记号；另有源码守卫：ui 里不得出现 `Modifier.shadow(`、缩放/位移动画、渐变，`elevation` 只能 0.dp，`PoemHead.kt` 不得含分割线/边框 |
| `StructuralMarksTest` | `groupCountText(3) == "[3] 首"`、括号段带 `text-faint` 与 0.85em |
| `UpdateStatusTextTest` | 每种更新状态都给出非空文案；空 message 也有兜底（见 §7） |

**变异验证**（证明门不是空过）：临时把 `bg` 改成 `#0e1316`、`poem-lh` 改成 1.5、括号字号改成 0.8em，三条断言各自报红并点名：

```
colors…   : bg 的值（规范 #0e1315） expected:<#0e1315> but was:<#0e1316>
typography: poem-lh（行高倍数） expected:<2.0> but was:<1.5>
structural: 括号字号（规范 0.85em） expected:<0.85> but was:<0.8>
```

### 6.3 规范未覆盖 / 无法逐值对齐的地方（如实列出）

先对齐规范 §4.2「与原型的有意差异」（负责人 2026-10-15 补，用户可否决）——与本端实现一致的三条：
① 搜索**已按 2026-10-15 决定整体移除**（连入口带搜索屏一起删了，所以「文字按钮 vs 放大镜」这条有意差异已失效）；② 笔记头**不加** `n-badge` 夹具徽标（本端不画）；
③ 状态色只有两档 accent/warn、**不新增红/error 令牌**——本端 M3 的 `error` 就映射到 `warn`、`errorContainer`=`warn-soft`。
规范 §4.2 的第 4 条（目录页结构）与下面第 8 项是同一件事，**仍待台账确认**。

1. **字体族**：Web 是 `'Microsoft YaHei UI', system-ui, sans-serif`；Android 退到系统无衬线（`FontFamily.SansSerif`）——规范 §3 明确说这样即可（**不出宋体**）。
2. **`bg-pattern`（1px 网格）**：规范 §5 说移动端可省 ⇒ 令牌保留、**不渲染**。
3. **`surface-hover` / `line-strong` / `accent-soft`**：前两个原型的用途是「行悬停」（鼠标），触摸端没有 hover，所以只进了 M3 方案（`outlineVariant` 等）而**没有直接用在某个可组合项上**；`accent-soft` 同理（挂 `primaryContainer`）。值都在令牌表里、都被门对比着，只是目前没有界面位置用它们。
4. **`measure` 660px / `note-measure` 36em**：手机屏本来就窄于它 ⇒ 不施加（令牌保留）。
5. **括号内外各 1px 的间距**：`[3] 首` 用一个 `AnnotatedString` 拼出，那一层微间距**未逐值实现**（要逐值得拆成多个 Text）。
6. **动效 0.15s**：本版界面没有需要颜色过渡的状态（笔记是显/隐），令牌已就位、暂无动画使用。
7. **组名字重**：规范与原型都没给 ⇒ 用默认 400（此前代码自设 SemiBold，已按「不得自行调整」去掉）。
8. **结构形态差异（不是令牌值）**：原型首页是「组卡片（含计数+预览）→ 进组看行列表」；Android 是一页平铺（组头卡片 + 该组诗行）——因为 `CONTEXT.md` 要求「组内直接列标题＋作者、不强制作者页」。观感对比时会看到这个差别。
9. **关于页在原型里没有对照片** ⇒ 用同一套令牌排版（小标题 0.82rem 次要色、正文 15sp、说明 0.78rem 更淡色）；**诗歌详情页**同理（异文用正文排版 `poem`、note 用 `meta`，都在既有令牌里，不新增令牌）。
10. 真机/强光下长时间阅读疲劳**未验证**，且单主题**没有退路**——规范 §6 已声明为已知风险。

### 6.4 应用图标（启动器图标 N1，用户 2026-10-15 选定）

形态、字体、交付源与硬约束：

- **形态 N1**：单字「索」＋ 右下一条 accent 发丝角标（用户 2026-10-15 原话「我觉得 N1 不错」）。
- **字体 = `Noto Sans SC`**（SIL OFL 1.1）⇒ 可自由使用 ⇒ **转成矢量轮廓**（`prototype/icons/outline.py`
  在取轮廓前先实例化到 `wght=500`，所以字重不靠系统去合成）。
- **交付源（只读，在 master 上）**：`prototype/icons/svg/r4-N1-{bg,fg,mono}.svg`；三份都已断言**不含 `<text>`**。
- 生成：`node android/tools/make-launcher-icon.mjs`（`--check` 只核对不写盘）。它把原型 SVG 的
  `translate(33.0353 70.0574) scale(0.042 -0.042)` **烘进坐标**（x' = tx + sx·x，y' = ty + sy·y），
  于是 Android 的 pathData 与原型 SVG 的 `d` **逐点对应**。
  为何不用 `<group android:scaleY="-0.042">`：本机**没有设备/模拟器可验证渲染**（任务要求不碰），
  而烘进坐标只依赖「绝对 M/L/H/V/Q/Z 的解析」这一条最稳的语义。两者几何（含环绕方向、填充规则）
  是同一件事：仿射行列式为负 ⇒ 所有轮廓的绕向一致反转 ⇒ 非零填充判定不变（字腔不会被填死）。

产物（五个文件，全部由生成器写，手改会被覆盖）：

| 文件 | 层 |
|---|---|
| `res/drawable/ic_launcher_background.xml` | `bg` 满幅 108×108，色 `#0e1315`＝视觉令牌 `bg`（与 `themes.xml` 的 `windowBackground` 同值） |
| `res/drawable/ic_launcher_foreground.xml` | `fg`＝字形轮廓（`text` 色）＋ 17×2.5 的 accent 角标 |
| `res/drawable/ic_launcher_monochrome.xml` | 单色层（Android 13+ 主题图标）：形状同上，但**只有一个颜色** |
| `res/mipmap-anydpi-v26/ic_launcher.xml` | 自适应图标入口（`background`/`foreground`/`monochrome`） |
| `res/mipmap-anydpi-v26/ic_launcher_round.xml` | 圆形入口（launcher 请求 `roundIcon` 时用同一套图层） |

`AndroidManifest.xml` 的 `android:icon="@mipmap/ic_launcher"`、`android:roundIcon="@mipmap/ic_launcher_round"`。

**为什么只有矢量、没有 legacy 位图 mipmap**：`minSdk = 26` ⇒ API 26 起系统**一律**读 `mipmap-anydpi-v26/`
下的 XML（那正是自适应图标的机制），低密度位图兜底没有任何设备会用到，只会多出一份会过期的副本。
实测：APK 里只有 `res/mipmap-anydpi-v26/ic_launcher{,_round}.xml`，没有 `mipmap-*dpi/*.png`。

**实测数字（2026-10-15，`aapt2 dump badging` + 生成器自检）**：

```
application-icon-160/240/320/65534:'res/mipmap-anydpi-v26/ic_launcher.xml'
字形轮廓：116 条绘图命令 / pathData 3128 字符（源 6580），命令集 HLMQVZ
fg 到中心 (54,54) 的最远点：字形 24.971、角标 33.812 ⇒ 取大者 33.812（路径 32 步/段采样 + 角标四角）
保证可见区（中心 72 方的内切圆 r=36）：余量 2.188 ✔
```

**一处与原型自述不完全一致的地方（如实记下来，不是实现走样）**：`prototype/icons/README.md` 写「前景内容
全部控制在中心直径 66 的圆内」（r=33），而 N1 的 accent 角标外角实测在最远 **33.812** 处
（超 **0.812** 单位 = 画布的 **0.75%**；字形本身没超，24.971）。它仍在系统保证可见的中心 72 方里
（余量 2.188）。**我没有为了凑这个数去挪角标** —— 那是改已评审的设计，由用户/负责人定；
改完重跑生成器即可（`LauncherIconTest` 断言的是**系统保证可见区**，不是那个 66 圆）。

**未验证**：图标**没在任何真机/启动器上看过**（本轮不操作模拟器与任何设备）；真实遮罩形状随厂商与系统版本
不同（原型预览里的三种遮罩只是近似，所以也没写进任何注释当规范）；`<monochrome>` 的实际观感取决于系统的
「主题图标」开关（Android 13+）。有一条 JVM 门 `LauncherIconTest` 把这些**能静态查的**事盯住了
（清单连线、三层齐全、108 画布、无字体依赖、fg 在保证可见区内、bg 满幅且与窗口底色同值、
mono 单色且与 fg 同形、**两端轮廓逐点一致**），但它**不渲染、不看像素**。

## 7. 「关于」页（原更新页）与更新源（2026-10-15）
> ⚠ **2026-10-16 取代**：本节 (a) 讲的**那段「诚实的限制」文案已从本端删除**（`ABOUT_LIMITS_ANDROID` 连同它的
> 渲染行一并去掉）——共享字段集按采纳锚收成 4 项，那两条未采纳的不再渲染；而 **Android 侧没有「页脚状态面板」**
> 可以安置它（Web 有，所以 Web 仍保留同一段原文）。⇒ 本节 (a) 仅作留痕，**不再描述现状**（现状见 §0 的「关于页」行）。

**(a) 过期文案已改**（留痕）：原来写「当前内置内容为占位夹具，非校对文本」。内置内容从 2026-10-14 起就是本次发布的**真实**编译产物（与 `dist/content.json` 字节一致），再那么写会让用户以为读到的是测试数据。
现在写（`ScreenContent.kt` 的 `ABOUT_LIMITS_ANDROID`）：「内置内容＝本次发布的完整内容（随 APK 打包，首次断网即可读）；每首诗的底本与来源见**诗歌详情页**」——
**不写具体数字**（数字会过期）。代码里留了注释说明为何不再提「夹具」。
> ⚠ 2026-10-15 页面集合落地时，这句里「见诗页底部」改成了「见诗歌详情页」：底本与来源已搬到新增的诗歌详情页（`IF-47`），
> 照旧写「诗页底部」就成了假话。这是**一处事实更正**，不是重写文案。

**(b) 「状态」行渲染为空的待查项**：模拟器验收记录里写着「原始 UI XML：`状态` → `''` → 按钮」，但代码里六个状态分支都有非空文案。
我做的事实核查：

- `updateStatusText` 的六个分支均为非空；`UpdateStatus.Error` **在生产代码里从未被构造**（只有 `Idle/Checking/UpToDate/Activated/Failed` 会被设置）；
- 同屏「说明」那段用的是同一种样式（`labelSmall`/`onSurfaceVariant`）且**渲染正常**——所以「样式导致不可见」解释不了；
- 因此**成因仍未查清**：从代码无法复现（本轮按授权不操作模拟器/真机）。

已做的两件事（把「悬着」变成「可查」）：

1. 文案抽成纯函数 `ui/UpdateStatusText.kt`，并加 `UpdateStatusTextTest`：**每个状态都必须给出非空文案**，空 message 也有兜底文案（不会再渲染成空行）；
2. `AppRoot` 根节点开了 `testTagsAsResourceId`，状态那行挂了 `Modifier.testTag("update-status")` ⇒ 下次 `uiautomator dump` 里该节点会带 `resource-id="update-status"`，能直接定位到底是不是这一行、内容是什么。

仍需要负责人这边提供：那次 dump 的**原始 XML 片段**（或该行截图）以及「点击检查更新后过了多久」，才能定论。

**(c) 更新源不再是占位地址，那行文案同步改（用户 2026-10-15 拍板推进更新源）**：原来写「更新源（占位地址，见代码常量）」，现在只写「更新源」——地址照常显示在它下一行（`UpdateEndpoint.displayUrl()`），不再说「占位」。

> ⚠ **2026-10-16 再次变更**：用户 `q-9f9eca3d` 定的关于页共用信息是「应用名 / 应用版本 / 内容版本 / 仓库链接」——
> **更新源地址没有被一并采纳** ⇒ 关于页**不再显示更新源那一行**（地址仍由 `UpdateEndpointTest` 逐字钉住，
> 且它仍是检查更新的实际入口）。与之一起按采纳锚改的还有：**V3 标签左对齐**、**无区域框**、
> **初态只显示按钮**（不生成状态文本元素）、**仓库链接置底**、共用版本信息里去掉了「来源：」。
>
> ⚠ **2026-10-16 返修①（实现偏离已采纳锚，不改设计）**：上一条里的「仓库链接置底」指的是 **C1＝完整 URL 的链接**
> （Web 那侧的 C1 就是 `<a href>`；用户没选的只是 C3 那句「在浏览器打开」提示）——但两端此前都把它降成了
> **不可点的纯文本** ⇒ 本端改回**可点**：`Modifier.clickable { uriHandler.openUri(AboutFields.REPO_URL) }`，
> `uriHandler` 来自 `LocalUriHandler.current`（就是平台那条 `Intent.ACTION_VIEW`，交给外部浏览器；不内嵌 WebView、
> 也不自己拼 Intent）。可见文字与位置不变（仍是置底的完整 URL、无标签行、无提示）。
> **实测（`emulator-5556`，不是只读代码）**：点那段文字 ⇒ `ActivityTaskManager: START u0 {act=android.intent.action.VIEW
> dat=https://github.com/WSQS/suofei cmp=com.android.chrome/com.google.android.apps.chrome.IntentDispatcher}`，
> `mCurrentFocus` 从 `dev.sopho.suofei/.MainActivity` 变为 `com.android.chrome/...ChromeTabbedActivity`
> ⇒ 确实交给了外部浏览器（本机模拟器无外网，页面本身打不开，但意图与 URL 都对）。

- 换的是 `update/UpdateProtocol.kt` 的 `UpdateEndpoint.BASE_URL`：占位 `https://example.invalid/suofei` → **真实站点** `https://wsqs.github.io/suofei`（GitHub Pages，强制 https）。走到位后的 URL＝`https://wsqs.github.io/suofei/content/latest.json`。**换的判据**：站点侧 `content/latest.json` 与 `content/<版本>/content.json` **已在发布白名单里**（发布脚本的产物，不必为此新增产物），且站点已上线。
- 判据有断言：新增 `UpdateEndpointTest`，把该 URL **逐字写死**（写死是故意的——它就是本次发布的接口值），地址改错一位即报红点名；顺带钉住「清单里的相对 `url` 按清单所在目录解析」这条语义（真实站点产出的清单给的正是相对路径）。
- **只读探测（2026-10-15，本机 HTTP 请求，不是应用内验收）**：`https://wsqs.github.io/suofei/content/latest.json` → `HTTP 200`；再按清单里的**相对** `url`（`<版本>/content.json`）解析后请求 → `HTTP 200`、字节数与 sha256 **与清单逐字一致** ⇒ **这条地址链在 HTTP 层是通的**（清单里的版本号与 `minAppVersionCode` 随每次发布变化，故不写进本文）。
- ⚠️ **诚实边界**：地址与协议正确 ≠ 联网验收通过。**尚未在真实站点上验证「取到更高版本 → 下载 → 校验 → 切换」**（那需要在远端故意造一个更高版本的清单与快照），这条归负责人在模拟器上做。另外，指向真实站点后**应用每次打开都会请求 GitHub Pages**——多了一条外部依赖与一条用户可见的网络行为（无网/失败按既有实现如实降级，有单测覆盖）。

## 8. 签名（重要）

- 当前 APK 用 **debug 签名**（`apksigner verify --print-certs` 实测 `CN=Android Debug, O=Android, C=US`）。
- **它不能替代正式固定签名**：正式发布必须用固定私钥签名才能支持覆盖升级；密钥不入公开 Git。
  本阶段未读取/生成任何签名私钥，也未配置签名 secrets（授权未到）。

## 9. 已验证 / 未验证

**已验证**：`clean testDebugUnitTest assembleDebug` 通过；APK 内 assets 存在；**144 个 JVM 单测通过**（**2026-10-16**：基线 97 例 → 143 例；新增/改写 46 例 —— 字段新形状（含从规范侧读键序、旧形状被拒）、**最小 Markdown 渲染 10 例**、**语义折行 10 例**、**宽度口径 11 例**、四页源码级对照 14 例；均在 `--offline` 下复跑过。⚠ **当日返修再 +1 ⇒ 144**（`ScreenInventoryTest.aboutScreen_repoLink_isClickable_andOpensItExternally`）），含更新流程的成功/失败/不兼容/损坏路径、**视觉令牌与规范逐项一致**、**结构记号**、**更新状态文案非空**、**更新源 URL 逐字断言**。图标落地后（2026-10-15）新增 **`LauncherIconTest` 8 例**：清单连线 / 三层齐全 / 108 画布 / 不依赖字体 / fg 在保证可见区内 / bg 满幅且与窗口底色同值 / mono 单色且与 fg 同形 / **与 Web 侧同一份轮廓逐点一致**（详见 §6.4；它不渲染、不看像素）。另有一道契约一致性门 `UnknownAuthorsSourceTest`：断言匿名作者清单与唯一来源 `schema/unknown-authors.json` 逐项一致（读不到文件即失败并列出尝试过的路径，不跳过；测试自身不持副本）。

**页面集合落地（2026-10-15，新增 16 例）**：`AppStateNavigationTest`（4）——四页转移，含「详情页返回→那首诗」「关于页返回→目录」「详情页不改变选中的诗」；`ScreenInventoryTest`（6）——四页存在且 `UpdateScreen` 已消失、**诗页不引用 `variants`/`poem.source`**、诗页有详情入口、详情页渲染 source/variants/variant.text/variant.note 且**遍历全部**、目录无「有笔记」/组头无 `clickable`/有「关于」入口、关于页带共享字段＋更新块；
`PoemDetailContentTest`（3）——内置产物 **24 条/13 首**、每条 text/note 非空、6 首无异议；`AboutFieldsTest`（3）——`AboutFields` 与唯一来源 `web/about-fields.json` 逐项一致、关于页渲染每个字段。
**证伪实测**：给诗页加一句 `Text(poem.variants…)` ⇒ `poemScreen_showsNoVariantsAndNoSource` 报红「诗页不得出现异文（variants）」；把详情页改成只取 `variants.first()` ⇒ `poemDetailScreen_rendersSourceAndEveryVariantField` 报红「详情页要遍历全部异文（variants.forEach…），不是只取第一条」（均已还原）。

> ⚠ **2026-10-16 取代**：上面那段里的 `ScreenInventoryTest`／`PoemDetailContentTest`／`AboutFieldsTest` 的**具体断言已随字段集与四页重排重写**（如「详情页逐条渲染 variants」不再成立——详情页现在渲染 `detail` 的 Markdown；「诗页不得引用 variants」仍成立，另加「不得引用 poem.detail」；「关于页要显示更新源」改为「要有仓库链接」）。现例数：`ScreenInventoryTest` 15、`PoemDetailContentTest` 4、`AboutFieldsTest` 4、新增 `MarkdownTest` 10／`SemanticBreakTest` 10／`ContentWidthTest` 11。⚠ **2026-10-16 返修当日再 +1**：`ScreenInventoryTest` 14 → **15**（`aboutScreen_repoLink_isClickable_andOpensItExternally`，仓库链接可点）；总数 **143 → 144**（`144 例 / 0 失败`，`--offline --no-build-cache --rerun-tasks` 真 exit 0）。源码级守卫仍然是**结构守卫、不是渲染验证** —— 观感需模拟器验收。
**未验证**：**强光/长时间阅读疲劳**未验（用户 2026-10-15 已决定不做物理真机验收 ⇒ 这一条以「已知并接受、未验证」记录）；
**图标没在任何真机/启动器上看过**（真实遮罩形状随厂商变、`<monochrome>` 的实际观感取决于系统「主题图标」开关；
`LauncherIconTest` 只做静态断言、不渲染、不看像素）——见 §6.4；未在真机/弱网上验更新流程；
未在设备上验证「删掉上一个快照」对用户路径无影响（它无界面入口，预期无影响）。

**已在模拟器上验过（2026-10-15，口径＝模拟器）**：深色主题与三样结构记号的**实际观感**、目录/诗页/笔记折叠与展开、搜索三态（当时的确验过；该功能已按用户 2026-10-15 决定移除，见文首）、
更新页状态行；**更新检查的成功路径（真实站点 HTTPS：下载 → sha256 校验 → 切换生效）与失败路径（断网：旧内容保留）都实测通过**
（记录见 `docs/status.md` 与 `docs/reviews/ui-review/materials-android/`）。

**仍未验**：`assembleRelease` 在本机**按设计 fail-closed**（缺签名环境变量即停，我没有做任何绕过）；
更新页「状态行渲染为空」**已结案**：旧空行是 Idle 态当时文案为空（现为「尚未检查。」＋空串兜底），且应用启动即自动检查，设备上复现不出（见 §7）。