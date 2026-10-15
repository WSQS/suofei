# 索斐

个人诗集阅读应用：读中国古典诗歌，自己的笔记按需展开，**Android 与 Web 两端**，内容与阅读行为尽量一致，**首次断网也能读**。

（仓库目录名 `PoetryCollection` 是工程名；应用展示名是**索斐**，Android 包名 `dev.sopho.suofei`。）

## 当前状态（**这里不写数字**）

**已发布**：`v0.1.1+content-2026.10.16.20`——签名 APK（GitHub Release）＋ 线上站点（GitHub Pages），CI 真发布全绿。
**当前可运行版本、交付分类（符合／偏离／未验证）、以及每道门的最新数字，只有一处**：

→ **[docs/status.md](docs/status.md)**

> 本 README 不再手写会过期的测试数与发布状态——它曾经写着「**尚未发布任何版本**」「Android 单测 55 项／Web e2e 151 项」「未做：签名/Release/Pages」，全都被事实推翻了。数字放一处，改一处。

## 工程工作台（**本项目对 skill 默认形状的映射——声明一次**）

工作面的默认形状见 `engineering-workflow` 技能的 `references/work-surface.md`。本项目**已经以别的方式组织**，所以按技能要求在这里声明映射，**不搬家**：

| 默认形状 | 本项目实际位置 |
|---|---|
| `items/graph.md`（项与依赖边） | **[items/graph.md](items/graph.md)** |
| `items/<项>/item.md`（理解／采纳版本锚／开放区域） | **[items/](items/)** —— 各项就在那里 |
| `current-version.md`（现在能跑的版本） | **[docs/status.md](docs/status.md)** 的「当前可运行版本」一节（不另立第二份） |
| 代码与公开契约 | **留在原处**（`content/`、`tools/`、`schema/`、`android/`、`web/`、`release/`）——工作面**不搬迁代码库**，项里只放**链接** |
| 原型（`prototypes/`、`history/`） | `prototype/` **留在原处**（⚠ Web e2e 与发布就绪门会读 `prototype/css/theme-tech.css`，它是**活输入**）；项里的 `prototypes/` 放**指针与「它没表达什么」**，`history/` 放**被取代的原型与理解** |

**谁决定什么**：**用户**拍板产品与视觉方向（留痕 `docs/interface-decisions.md`、`docs/review-gates.md`）；**对话型会话**持有理解／采纳版本锚／开放区域，并负责把问题问到用户；**调度型会话**（负责人）负责**依赖边、派活、验收、整合与发布**（分工表见 [docs/status.md](docs/status.md)）。

## 内容

首批内容是**完整的《古诗十九首》**。

- **底本**：《文选》卷二十九李善注本（三个独立电子本互校）。
- **正文＝一本可核的古书**：与今天通行读法不同的地方**只存档、不改正文**（差异表见 [docs/sources/modern-readings.md](docs/sources/modern-readings.md)）。
- **异文（`variants`）** 记录在编译产物里，并在**「诗歌详情」页**逐条显示（诗页本身不显示异文与来源；2026-10-15 用户决定把考据与来源移进独立的详情页，见 `docs/interface-decisions.md` IF-47）。
- 来源、异文、未核到的条目、以及每条的依据与限制都在 [docs/sources/](docs/sources/) 里；**不复制任何现代译注、赏析或译文**。

## 工程结构

| 目录 | 内容 |
|---|---|
| `content/poems/` | 一诗一 Markdown（人写、人改的源头） |
| `tools/`、`schema/`、`tests/` | 内容编译、校验、schema 与测试 |
| `android/` | Kotlin + Jetpack Compose 应用（含离线更新） |
| `web/` | 静态 DOM 站点 + Service Worker（离线缓存） |
| `prototype/` | 设计探索原型（可丢弃，不是产品代码） |
| `release/` | 发布流水线与产物就绪检查 |
| `docs/` | 契约、状态、来源记录、设计文档 |

内容与两端的**唯一约定**是 [docs/design/content-contract.md](docs/design/content-contract.md)：一诗一 Markdown → 编译成一份 `content.json`，两端只读它。

## 在本机跑

```bash
# 内容：校验 / 编译
node tools/build-content.mjs --check
node tools/build-content.mjs --out dist/content.json --content-version 2026.10.16.13 --order source --minify

# 一致性自检（内置产物是否跟着内容源走）
node tools/check-bundled-content.mjs

# Android
cd android && ./gradlew assembleDebug          # 需要 JDK 17 与 Android SDK
./gradlew testDebugUnitTest

# Web（零依赖、无构建步骤）
node web/scripts/prepare-dev-content.mjs       # 把 dist/content.json 放到站点根
node web/scripts/serve.mjs                     # http://127.0.0.1:8080/
node web/tests/e2e-cdp.mjs                     # 端到端（真无头 Chromium）

# 发布流水线（本地演练，不推远端、不打 tag、不签名）
node release/build-release.mjs --tag 'v0.1.0+content-2026.10.16.13'
node release/check-ready.mjs --out release/out
```

## 边界与诚实说明

- **仓库里没有密钥、签名文件或私人物料**；`.gitignore` 排除 `*.apk`、`dist/`、`node_modules/`、`local.properties` 等。
- **APK 目前是 debug 签名**，不能用于正式发布；正式签名走 CI secrets（做法见 [docs/design/ci-and-signing.md](docs/design/ci-and-signing.md)）。
- **从未在真机或模拟器上运行过**：所有「通过」都只到「本机演练」这一层。真机验收计划见 [docs/design/device-acceptance-plan.md](docs/design/device-acceptance-plan.md)。
- 深色主题是当前唯一视觉方向；它在「强光下、长时间阅读」的实际疲劳**未经真机验证**。
- 更新失败时保留旧版；**没有「回退到上一版」的能力**（刻意的选择）。
- 应用代码升级只**提示**下载，不自动安装。

## 许可证

**尚未指定**（仓库暂无 `LICENSE`）。在明确之前，默认保留所有权利。
