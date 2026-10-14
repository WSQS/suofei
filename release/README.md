# release/ — 发布流水线（工作线 F）

把「一次发布要发生什么」写成能真跑的两个脚本。**设计、取舍、就绪检查全表、演练证据、未验证边界都在
[`../docs/design/release-pipeline.md`](../docs/design/release-pipeline.md)**，本文件只讲怎么跑。

> ⚠️ 本目录**不做**发布动作：不推远端、不打 tag、不启用 Pages/Release、不签名、不装设备。
> 产物只落在 `release/out/`（已由 `release/.gitignore` 忽略；**没有改根 `.gitignore`**）。

## 怎么跑

```bash
# 1) 一次完整发布（内容 JSON + Web 部署目录 + 远端小纸条清单 + 内置同版内容的 APK）
node release/build-release.mjs --content-version 2026.10.16.5

# 2) 就绪检查：0 = 全绿（可以推进最新版）；1 = 有红项（禁止推进）
node release/check-ready.mjs            # 25 项，含两个「真跑」门，约 60 秒
node release/check-ready.mjs --skip-live    # 不跑真跑门（它们会标黄，**不是绿**）
node release/check-ready.mjs --live-only    # 只跑真跑门（迭代时用）
```

**版本号没有默认来源**（「发布时这个号由谁产生」尚未拍板，归负责人的决策点 5）：不给来源会直接失败。三种给法：

```bash
node release/build-release.mjs --content-version 2026.10.16.5   # 人工显式给
node release/build-release.mjs --tag content-2026.10.16.5       # 从 tag 名解析
node release/build-release.mjs --version-source date            # UTC 当天日期 + 当日递增
```

常用开关（`--help` 有全量）：`--out <dir>`、`--previous-version <v>`（严格大于它，否则拒绝）、
`--skip-apk`（只出内容/Web；就绪检查会因缺 APK 报红）、`--android-feed none`（不产出小纸条清单，仅演练用）、
`--source-date-epoch <秒>`（固定 `generatedAt`，让产物字节可复现）、`--online`（Gradle 默认 `--offline`）。

## 产物（`release/out/`）

| 路径 | 是什么 | 谁用 |
|---|---|---|
| `dist/content.json` + `.sha256` | **唯一一次编译**的规范产物（单行压缩 JSON，`--minify`） | 留档；其它几处都是它的字节复制 |
| `web/` | **站点根**（整目录部署）：`index.html`、`styles.css`、`manifest.json`、`sw.js`、`app/` | 浏览器 |
| `web/content.json` | ＝`dist/content.json`（字节复制）；**必需**（契约 §4：内容单独取，不内联） | Web 端（SW 缓存 + 页面读取） |
| `web/content.json.sha256` | 边车；**可选**（Web 不再用它做校验） | 人 |
| `web/content/latest.json` + `web/content/<版本>/content.json` | 远端小纸条清单 + 快照（IF-22，**已定形态**） | Android 端 |
| `apk/suofei-<版本>-debug.apk` | 内置同版内容的 APK（**debug 签名**） | 手动安装；正式 Release 前必须换固定签名 |
| `release-manifest.json` | 本次发布的机器可读记录（版本/来源/哈希/源提交/命令/耗时） | 审计；就绪检查的输入之一（哈希都会重算） |
| `.work/` | 构建中间态：`android/`（只读副本）、`e2e/`（真跑门的镜像根）、`logs/` | 无，可整个删 |

## 三条硬规则

1. **只写 `release/out/`**：`content/`、`tools/`、`schema/`、`android/`、`web/` 只读/被调用；
   APK 与单测都在 `android/` 的**只读副本**里做（内容注入到副本的 assets），跑完 `git status` 应当是干净的。
   副本里的**代码**必须与仓库逐字节一致，否则直接拒绝跑（防「改副本里的测试让它变绿」）。
2. **同源靠重算，不靠声明**：`web/content.json`、Android 快照、APK 内 `assets/content/content.json`
   都要求与 `dist/content.json` **逐字节相同**（构建时比对 + 就绪检查重算 + 从 APK 里读回来比对）。不一致就非零退出。
3. **两个真跑门**：Web e2e 用 `out/web` 当站点真跑（真 Chromium，167 条断言）；Android 单测真跑
   （`--rerun-tasks` 强制，内置内容＝本次产物）。**跑不了就标黄并写明原因，绝不静默跳过、也不当通过。**
   手跑单测时请自己加 `--rerun-tasks`：不加的话 Gradle 会因为 `src/main/assets/**` 不是声明输入而
   `UP-TO-DATE`/`FROM-CACHE` —— 实测「内容改成 18 首也照样退出码 0」，那是假绿。

## 当前已知的红（不是流水线缺陷）

`live-android-unit-tests` 会红在 `ContentParserTest > variants_areParsedButNeverEnterStanzas`：
该测试断言第 9 首《庭中有奇树》恰好 **1** 条异文，而 G 线补核后全部异文由 13 条增至 21 条、该首为 2 条。
需要 D 线把那条「条数」断言换成内容断言（详见设计文档 §9.3）。

## 需要授权才能做的（本目录里没有实现）

创建/推送仓库（A4.1）、启用 Pages（A4.2）、打 tag/挂 Release（A4.3）、固定签名（A4.4）、装设备验收（A5）。
