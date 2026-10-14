# release/ — 发布流水线（工作线 F）

把「一次发布要发生什么」写成能真跑的两个脚本。**设计、取舍、就绪检查全表、演练证据、未验证边界都在
[`../docs/design/release-pipeline.md`](../docs/design/release-pipeline.md)**，本文件只讲怎么跑。

> ⚠️ 本目录**不做**发布动作：不推远端、不打 tag、不启用 Pages/Release、不签名、不装设备。
> 产物只落在 `release/out/`（已由 `release/.gitignore` 忽略；**没有改根 `.gitignore`**）。

## 怎么跑

```bash
# 1) 正式发布形态：tag 同时带两个号（用户 2026-10-16 拍板）
#      v<应用资源版本>+content-<内容版本>
node release/build-release.mjs --tag 'v0.2.0+content-2026.10.16.5'

# 2) 就绪检查：0 = 全绿（可以推进最新版）；1 = 有红项（禁止推进）
node release/check-ready.mjs                    # 含两个「真跑」门，约 70 秒（条数见汇总行）
node release/check-ready.mjs --skip-live        # 不跑真跑门（它们会标黄，**不是绿**）
node release/check-ready.mjs --live-only        # 只跑真跑门（迭代时用）
```

**tag 里两个号都必须解析得出来**，缺号或形状不符会直接拒绝并打印期望格式（fail-closed，不猜默认）。
`--content-version` 只作**本地演练**用途：

```bash
node release/build-release.mjs --content-version 2026.10.16.5   # 只给内容版本（演练）
node release/build-release.mjs --version-source date            # UTC 当天日期 + 当日递增（演练）
```

**变体与签名**（正式发布必须用 release 变体 + 正式签名）：

```bash
node release/build-release.mjs --tag 'v0.2.0+content-2026.10.16.5' --android-variant release
```

- `--android-variant` 默认 `debug`（`assembleDebug`，debug 签名，**绝不能用于正式发布**）；
- `release` ⇒ `assembleRelease`，**要求四项环境变量齐全**：`SUOFEI_KEYSTORE` / `SUOFEI_KEYSTORE_PASSWORD` /
  `SUOFEI_KEY_ALIAS` / `SUOFEI_KEY_PASSWORD`（CI 由仓库 secrets 注入）。缺任何一项就**在动任何东西之前**
  非零退出，**不生成密钥、不退回 debug 签名**；
- 就绪检查的 `apk-signing` 门：release 变体会用 `apksigner verify --print-certs` 断言证书**不是** debug 证书
  （是 ⇒ 红）并把证书 DN 打进回执；debug 变体如实标**黄**（「不能用于正式发布」，结论行也会写「演练口径就绪」）。

常用开关（`--help` 有全量）：`--out <dir>`、`--previous-version <v>`（严格大于它，否则拒绝）、
`--skip-apk`（只出内容/Web；就绪检查会因缺 APK 报红）、`--android-feed none`（不产出小纸条清单，仅演练用）、
`--source-date-epoch <秒>`（固定 `generatedAt`，让产物字节可复现）、`--online`（Gradle 默认 `--offline`）。

## 产物（`release/out/`）

| 路径 | 是什么 | 谁用 |
|---|---|---|
| `dist/content.json` | **唯一一次编译**的规范产物（单行压缩 JSON，`--minify`；**不产边车**） | 留档；其它几处都是它的字节复制 |
| `web/` | **站点根**（整目录部署）：`index.html`、`styles.css`、`manifest.json`、`sw.js`、`app/` | 浏览器 |
| `web/content.json` | ＝`dist/content.json`（字节复制）；**必需**（契约 §4：内容单独取，不内联） | Web 端（SW 与壳同批缓存） |
| `web/content/latest.json` + `web/content/<版本>/content.json` | 远端小纸条清单（含 `sha256` 字段）+ 快照 | Android 端 |
| `apk/suofei-<内容版本>-debug.apk` | 内置同版内容的 APK（**debug 签名**） | 手动安装；正式 Release 前必须换固定签名 |
| `release-manifest.json` | 本次发布的机器可读记录；**也是下一版的基线**（内容版本 + APP_VERSION） | 审计；就绪检查输入之一（哈希都会重算） |
| `.work/` | 构建中间态：`android/`（只读副本）、`e2e/`（真跑门镜像根）、`logs/` | 无，可整个删 |

**不再产出任何 `content.json.sha256` 边车**（Web 侧与 `dist/` 都不产、不检查、不登记）；Android 清单里的 `sha256` **字段**保留。

## 三条硬规则

1. **只写 `release/out/`**：`content/`、`tools/`、`schema/`、`android/`、`web/` 只读/被调用；
   APK 与单测都在 `android/` 的**只读副本**里做（内容注入到副本的 assets），跑完 `git status` 应当是干净的。
   副本里的**代码**必须与仓库逐字节一致，否则直接拒绝跑（防「改副本里的测试让它变绿」）。
2. **同源靠重算，不靠声明**：`web/content.json`、Android 快照、APK 内 `assets/content/content.json`
   都要求与 `dist/content.json` **逐字节相同**（构建时比对 + 就绪检查重算 + 从 APK 里读回来比对）。不一致就非零退出。
3. **两个真跑门**：用 `out/web` 的构建产物真跑 **E 自己的** e2e（真 Chromium；事后机械核对被测站点就是本次产物），
   以及 Android 单测（`--rerun-tasks` 强制，内置内容＝本次产物）。**跑不了就标黄写明原因，绝不静默跳过、也不当通过。**
   手跑单测时请自己加 `--rerun-tasks`：不加的话 Gradle 会因为 `src/main/assets/**` 不是声明输入而
   `UP-TO-DATE`/`FROM-CACHE` —— 实测「故意删掉内置内容里的一首、照样退出码 0」，那是假绿。

**接缝（仓库级文件）**：被测的 e2e 需要**仓库级**文件（如 `schema/unknown-authors.json` —— 匿名作者清单的唯一来源）时，
门用**环境变量**把它指回仓库（`UNKNOWN_AUTHORS_FILE`），**不**把 `schema/` 复制进产物工作目录（免得后人以为产物里该有它）；
开跑前还会**预检**被测脚本会读的仓库级路径，缺了直接报红（**不跳过、不降级成黄**），失败信息里写出实际传的路径。
要临时换来源就自己设这个环境变量（门会校验它确实存在）。

另外：`build-release.mjs` **开跑时会先清掉本次产物目录里的残留** —— `web/`、`apk/` 整份删（派生物，每次重建），
`dist/` 只剪掉「本产物集之外」的文件（不整删：编译失败要保留上一版的规范产物与 manifest，它们同时是下一版的基线）。
所以**一次失败的构建会让 `out/` 缺 `web/`**：这时就绪检查会报「产物目录不完整」——那是“上次构建失败”的信号，不是产物坏了。

## 演练约定

想用**同一个 `APP_VERSION`** 重跑演练时，先 `rm -rf release/out`（或换个 `--out`）：
否则上一版的 `release-manifest.json` 还在，`app-version-bumped` 会按规则报「APP_VERSION 没递增」——
那是**正确**的红（真发布本就不该同版本重发），不是流水线的毛病。

## 现在没有已知红项（以及看到红项时怎么读）

2026-10-16 两个真跑门都已转绿：那两条历史问题（「内置产物是旧的」+ D 线那条写死异文条数的断言；
真跑门的接缝：镜像根缺仓库级 `schema/`）都已修好 —— 详贴与判据见设计文档 §9.3。

判读规则（本目录不再列「已知红」清单，因为**问题一修它就过时**）：

- **红**＝查过且不通过，**必须修**，不得推进最新版；失败点会**原样**列出来（含实际/期望值）与完整日志路径。
- **黄**＝环境不可用/需人工确认（例如找不到浏览器、Gradle 拉不到依赖、源树有未提交改动）——**不是通过**。
- **跳过**＝没查（例如没有上一版 manifest 时无法判断 APP_VERSION 是否递增）——同样**不是通过**。
- 数字（断言条数、用例数、诗数）**一律取自本次运行结果**，本目录不写死任何会随别线变化的数。

## 需要授权才能做的（本目录里没有实现）

创建/推送仓库（A4.1）、启用 Pages（A4.2）、打 tag/挂 Release（A4.3）、固定签名（A4.4）、装设备验收（A5）。
