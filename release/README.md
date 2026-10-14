# release/ — 发布流水线（工作线 F）

把「一次发布要发生什么」写成能真跑的两个脚本。**设计、取舍、就绪检查全表、演练证据、未验证边界都在
[`../docs/design/release-pipeline.md`](../docs/design/release-pipeline.md)**，本文件只讲怎么跑。

> ⚠️ 本目录**不做**发布动作：不推远端、不打 tag、不启用 Pages/Release、不签名、不装设备。
> 产物只落在 `release/out/`（已由 `release/.gitignore` 忽略；**没有改根 `.gitignore`**）。

## 怎么跑

```bash
# 1) 一次完整发布（内容 JSON + Web 部署目录 + 远端清单 + 内置同版内容的 APK）
node release/build-release.mjs --content-version 2026.10.14.2

# 2) 就绪检查：0 = 三样产物就绪（可以推进最新版）；1 = 有红项（禁止推进）
node release/check-ready.mjs
```

**版本号没有默认来源**（「发布时这个号由谁产生」是待用户拍板的接口）：不给来源会直接失败。
三种给法：

```bash
node release/build-release.mjs --content-version 2026.10.14.2   # 人工显式给
node release/build-release.mjs --tag content-2026.10.14.2       # 从 tag 名解析（暂定方案）
node release/build-release.mjs --version-source date            # UTC 当天日期 + 当日递增
```

常用开关（`--help` 有全量）：`--out <dir>`、`--previous-version <v>`（严格大于它，否则拒绝）、
`--skip-apk`（只出内容/Web；就绪检查会因缺 APK 报红）、`--android-feed none`（不产出远端清单）、
`--source-date-epoch <秒>`（固定 `generatedAt`，让产物字节可复现）、`--online`（Gradle 默认 `--offline`）。

## 产物（`release/out/`）

| 路径 | 是什么 | 谁用 |
|---|---|---|
| `dist/content.json` + `.sha256` | **唯一一次编译**的规范产物 | 留档；其它两处都是它的字节复制 |
| `web/` | **站点根**（整目录部署）：`index.html`、`styles.css`、`manifest.json`、`sw.js`、`app/` | 浏览器 |
| `web/content.json` + `.sha256` | ＝`dist/content.json`（字节复制） | Web 端更新检查 |
| `web/content/latest.json` + `web/content/<版本>/content.json` | 远端更新清单 + 快照（IF-22） | Android 端（**是否产出它是待定接口**） |
| `apk/suofei-<版本>-debug.apk` | 内置同版内容的 APK（**debug 签名**） | 手动安装；正式 Release 前必须换固定签名 |
| `release-manifest.json` | 本次发布的机器可读记录（版本/来源/哈希/源提交/命令/耗时） | 审计；就绪检查的输入之一（哈希都会重算） |
| `.work/` | 构建中间态（android 只读副本、注入目录、init script） | 无，可整个删 |

## 两条硬规则

1. **只写 `release/out/`**：`content/`、`tools/`、`schema/`、`android/`、`web/` 只读/被调用。
   APK 是在 `android/` 的**只读副本**里构建的，用 Gradle init script 把 `assets.srcDirs` 指向注入目录
   —— 所以 `android/` 一个字节都不会被写（跑完 `git status` 应当是干净的）。
2. **同源靠重算，不靠声明**：`web/content.json`、Android 快照、APK 内 `assets/content/content.json`
   都要求与 `dist/content.json` **逐字节相同**（构建时比对 + 就绪检查重算 + 从 APK 里读回来比对）。
   不一致就非零退出，绝不把失败当成功。

## 需要授权才能做的（本目录里没有实现）

创建/推送仓库（A4.1）、启用 Pages（A4.2）、打 tag/挂 Release（A4.3）、固定签名（A4.4）、装设备验收（A5）。
