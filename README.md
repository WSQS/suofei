# 索斐

个人诗集阅读应用：读中国古典诗歌，自己的笔记按需展开，**Android 与 Web 两端**，内容与阅读行为尽量一致，**首次断网也能读**。

（仓库目录名 `PoetryCollection` 是工程名；应用展示名是**索斐**，Android 包名 `dev.sopho.suofei`。）

## 当前状态

**尚未发布任何版本**——没有公开的 APK、没有上线的网站。

本机（负责人 + 若干并行工作线）已完成：内容核对与来源记录、两端实现、离线与更新机制、发布流水线与就绪检查，全部有实测证据：

| 门 | 现状 |
|---|---|
| 内容编译与校验 | 83 项测试通过；产物 schema 校验通过 |
| 内置内容一致性 | 通过（`dist/content.json` == Android 内置 == Web 内容，字节一致） |
| Android 单元测试 | 55 项通过（含「内置产物能被真解析」这类门） |
| Web 端到端 | 151 项通过（真发 7 个版本、真无头浏览器、真离线、失败保旧版） |
| 发布就绪检查 | 0 红（含两项真跑门），但**只在本地演练口径** |

**未做**：真机/模拟器验收、固定签名、公开仓库的 Release、Pages 上线。

状态与待办只有一处：**[docs/status.md](docs/status.md)**（不另立台账）。

## 内容

首批内容是**完整的《古诗十九首》**。

- **底本**：《文选》卷二十九李善注本（三个独立电子本互校）。
- **正文＝一本可核的古书**：与今天通行读法不同的地方**只存档、不改正文**（差异表见 [docs/sources/modern-readings.md](docs/sources/modern-readings.md)）。
- **异文（`variants`）** 记录在编译产物里，**界面上不显示**（未做独立注释界面）。
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
