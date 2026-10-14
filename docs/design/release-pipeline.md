# 发布流水线设计（工作线 F）

- 状态：**设计 + 本地演练通过**（2026-10-14）。**未推远端、未签名、未发布**（公开发布需用户单独授权，见 §10）。
- 依据：`CONTEXT.md` 的发布硬需求（tag 触发「最新 JSON + Web + 内置同版内容的 APK」三样产物；**等产物全部构建/检查就绪再推进最新版**；不声称不同发布服务具有绝对原子性；APK 固定签名支持覆盖升级、密钥不入公开 Git）、`AGENTS.md` 授权与安全、契约 §2/§4.1（产物形状与版本语义）、IF-16/IF-19/IF-22/IF-26/IF-27/IF-30。
- 实现：`release/build-release.mjs`（构建）、`release/check-ready.mjs`（就绪检查）、`release/lib/`（共享约定）、`release/README.md`（怎么跑）。
- 本文件只讲**发布**，不讲内容格式（看 `content-contract.md`）与两端各自的离线实现（看 `android-offline-update.md`、`web/README.md`）。

---

## 1. 范围与不做什么

**做**：把「一次发布要发生什么」写清楚，并且**真能在本机跑一遍**——编译内容、构建 APK、准备 Web 部署目录、算哈希、做产物就绪检查，每步打印真实命令与关键数值，失败非零退出。

**不做（本轮明确没做，也没打算做）**：

| 不做的事 | 为什么 |
|---|---|
| 创建/推送远端仓库、打 tag、创建 Release | 需用户单独授权（A4.1/A4.3） |
| 启用 GitHub Pages、部署到真实站点 | 需用户单独授权（A4.2） |
| 读取或生成签名私钥、配置 secrets、正式签名 | 需用户单独授权（A4.4）；本轮 APK 是 **debug 签名** |
| 安装到真机/模拟器、操作设备 | 需用户单独授权（A5） |
| 声称「两端缓存/发布绝对原子」 | 服务商决定生效时机，只在 §8 写清实际延迟与失败后果 |

**硬约束**：流水线**只写 `release/out/`**，不改 `content/`、`tools/`、`schema/`、`android/`、`web/` 里的任何文件（只读取/调用它们）。演练中实测确认：跑完之后 `git status --porcelain -- android web content tools schema` 是空的。

---

## 2. 一次发布到底要发生什么

`node release/build-release.mjs --content-version 2026.10.14.2` 的 8 步：

| 步 | 做什么 | 关键产物/事实 |
|---|---|---|
| 1 | 记前置事实：node/JDK/SDK、`git HEAD`、五个源目录是否干净、应用版本（`versionCode`/`versionName`/`applicationId`）、**已提交的 APK 内置内容版本** | 这些进 `release-manifest.json`；源目录脏 ⇒ 就绪检查报**黄**（不红，但标明不可复现） |
| 2 | 解析 `contentVersion`（来源可配置，**无默认值**，见 §3）与单调性基线（默认取「已提交内置内容版本」与「上次 manifest」的较大者） | 例：`2026.10.14.2`，基线 `2026.10.14.1` |
| 3 | **编译内容，只此一次**：`node tools/build-content.mjs --out <out>/dist/content.json --order source --content-version <v> --previous-version <v-1>` | 规范产物 `dist/content.json` + `dist/content.json.sha256`；编译器自己做校验与单调性闸 |
| 4 | 准备 Web 部署目录：按白名单复制 `web/` 的静态文件，再把第 3 步那份 `content.json` **字节复制**过去 | `<out>/web/`（＝站点根）+ `content.json` + `content.json.sha256` |
| 5 | 准备**远端更新清单**（**接口待定，决策点 2** → 可开关，默认产出）：写 `content/latest.json` + 快照 `content/<版本>/content.json` | 见 §4 与 §9 |
| 6 | 构建 APK：复制 `android/` 到 `<out>/.work/android`，把同一份 `content.json` 放进注入目录，用 Gradle init script 替换 `assets.srcDirs`，`assembleDebug` | APK 内置内容必须与 `dist/content.json` **逐字节相同**，否则**当场失败** |
| 7 | 写 `release-manifest.json`（版本、来源、基线、哈希、字节数、源提交、脏标记、应用身份、各步命令与耗时、产物清单、跳过项、没做的事） | 就绪检查读它，但**不靠它当证据**（哈希全部重算） |
| 8 | 摘要 + 下一步：`node release/check-ready.mjs` | —— |

**发布动作的顺序（这是硬需求）**：`build` → `check-ready` **全绿** → 才允许把 tag / Release 指向这一版 → 才允许部署 Web。检查红着就推进最新版，是这套流程里唯一不能犯的错。

---

## 3. ★ 接口决定（暂定，待用户拍板）：`contentVersion` 从哪来

**这是本次唯一必须由用户拍板的接口**，流水线把它做成**可配置点**，并且在没给来源时**直接失败**：

```
✗ 发布构建失败 [VERSION_SOURCE_NOT_DECIDED]：没给 contentVersion 的来源，且**没有默认值**：
「发布时这个号由谁产生」是接口决定，尚未由用户拍板（IF-19 尾部），流水线不替你选。
```

### 已定的部分（不是本次要决定的）

契约 §4.1 已经定死，**没有选择余地**：发布版本必须是 `YYYY.MM.DD.N`（年 4 位、月/日 2 位零填充、`N` ≥ 1）、按 `[年,月,日,N]` **逐段数值**比较、**必须严格大于上一版**（编译器强制，`VERSION_NOT_MONOTONIC`）。本地派生的 `0.0.0-dev+<sha256前12位>` **永不发布**。

### 待定的部分：这个号由谁产生

| 候选 | 含义 | 代价 / 风险 | 实现状态 |
|---|---|---|---|
| **A. 显式参数** `--content-version` | 人在命令行写出版本号 | 最笨最可控；**容易忘**，且不会在仓库里留下「什么时候发的哪一版」的记录 | ✅ 已实现 |
| **B. tag 名**（**暂定方案**）`--tag` | tag 名里写版本，CI 触发天然可得；接受 `2026.10.14.2` / `v2026.10.14.2` / `content-2026.10.14.2`（含 `refs/tags/` 前缀） | 人工拍板 + 可追溯；**代价**：tag 名与版本形状耦合，包装前缀必须与仓库约定一致（已接受三种，其它形状直接失败）；**一次性**问题：tag 一旦推出就收不回，写错了不能改只能补 | ✅ 已实现（解析） |
| **C. 日期 + 当日递增** `--version-source date` | `UTC 当天` + 「当天已有最大 `N`」+1；`N` 从 **git tag** 里数出来 | 全自动、不靠人记；**代价**：依赖「当天已有版本」的可见性（tag 没推 / 不在本机 ⇒ 数不准，会**重复发同一个号**）；同一天第二次触发如果读不到第一个 tag 就会撞号；日期是 UTC，跨零点时与人的直觉不一致 | ✅ 已实现（读 `git tag --list`；git 不可用则**失败**，不猜） |
| **D. 仓库里的版本文件**（如 `release/version.json`） | 人工改这个文件＝发布动作，流水线读它 | 状态在仓库里、review 可见；**代价**：多一份需要与人同步的状态，且与「tag 才是发布锚点」并存时两者可能漂移 | ⛔ 未实现（流水线会明确报「候选 D 未实现」，不会假装支持） |

**暂定方案**：**B（tag 名）**——理由是它同时满足「人工拍板」和「可追溯」，且 tag 本来就是发布动作的天然触发点；A 保留为本地演练/补救手段。**但这是暂定，请用户拍板**；改选任何一个都不影响其它 7 步（只改 `release/lib/version-source.mjs` 一处）。

其它已实现的来源控制点：`--previous-version`（单调性基线；显式给了就**只用它**，不再与已有产物比大小——踩过一次：显式值被本地旧 manifest 盖掉，于是重发同一版本号得到一条莫名其妙的 `VERSION_NOT_MONOTONIC`）、`--source-date-epoch`（固定 `generatedAt`，让产物字节可复现，见 §11）。

---

## 4. 产物清单：文件名 + 用途 + 谁消费

一次发布产出（`<out> = release/out/`）：

| 文件 | 内容 | 用途 | 消费者 |
|---|---|---|---|
| `dist/content.json` | 本次发布的**规范内容产物**（唯一一次编译的结果） | 一切副本的源头；留档、比对 | 人 / 流水线自己 |
| `dist/content.json.sha256` | `<64hex>␠␠content.json` | 规范产物的完整性记录 | 人 / 流水线 |
| `web/`（整目录） | **站点根**：`index.html`、`styles.css`、`manifest.json`、`sw.js`、`app/` | 部署到 GitHub Pages | 浏览器（Web 端 E） |
| `web/content.json` | ＝`dist/content.json`（字节复制） | Web 端更新检查取的那份（IF-26/IF-27） | Web 端 |
| `web/content.json.sha256` | 边车（sha256sum 格式） | Web 端下载后真校验完整性（IF-27；取不到会降级并如实记录） | Web 端 |
| `web/content/latest.json` | 更新清单（IF-22，字段 `formatVersion`/`contentVersion`/`url`/`sha256`/`size`/`minAppVersionCode`） | **远端清单**：Android 每次先取的小文件 | Android 端（D）**※是否产出它是待定接口（决策点 2）** |
| `web/content/<版本>/content.json` | ＝`dist/content.json`（字节复制） | 清单 `url` 指向的内容快照 | Android 端 |
| `apk/suofei-<版本>-debug.apk` | 内置同版内容的 APK | 手动安装 / 将来挂 Release | 用户（现在只是演练产物） |
| `release-manifest.json` | 本次发布的机器可读记录 | 审计、就绪检查的输入之一 | 人 / 流水线（**不进站点**） |
| `.work/`（android 副本、注入目录、init script） | 构建中间态 | 只在构建期用 | 无（可整个删，重建即可） |

**产物数量随决策点 2 变**：选「统一走清单」⇒ Web 也改成读清单（要改 `web/app/config.js` + `web/app/content.js`）；选「保持现状」⇒ 就是上表；选「统一到无清单」⇒ `--android-feed none`，站点只留 `content.json` + 边车，Android 端的更新代码要改。**这三种都不需要改流水线的其它部分**——这就是把第 5 步做成开关的原因。

**部署白名单**（发布什么到站点上，精确比对，多一个都不行）：顶层只允许 `index.html`、`styles.css`、`manifest.json`、`sw.js`、`app/`、`content.json`、`content.json.sha256`、`content/`；`fixtures/`、`tests/`、`scripts/`、`node_modules/`、`README.md`、`.gitignore`、`package.json` **绝不发布**（就绪检查会红）。`web/` 以后新增顶层文件 ⇒ 检查报红并要求人工确认是否该发布，**不静默带上**。

---

## 5. 同源：一份字节，怎么保证不是「各建一次」

**只有一次编译**。`dist/content.json` 是三样产物唯一的源头，其它两处都是**字节复制**，而且每一步复制后当场比对、就绪检查再重算一遍：

```
content/poems/*.md
      │  node tools/build-content.mjs   ← 唯一一次编译
      ▼
dist/content.json ──字节复制──► web/content.json ──►（Web 端读它）
      │                    └──字节复制──► web/content/<版本>/content.json ──►（Android 端读它）
      └──字节复制──► .work/inject-assets/content/content.json ──Gradle 注入──► APK 内 assets/content/content.json
```

三道机械保证：

1. **构建时**：每次复制都 `Buffer.equals` 比对，不一致立即非零退出（`COPY_MISMATCH`）。
2. **构建时**：APK 建好后**从 APK 里把 assets 读回来**（自带的最小 zip 读取器，`release/lib/zip.mjs`，零依赖），哈希必须等于 `dist` 的哈希，否则 `APK_CONTENT_MISMATCH` 当场失败。
3. **就绪检查时**：`web-same-source` 与 `apk-builtin-same-source` 用重算的哈希再验一遍（§7），并且 `android-manifest` 还会顺着清单的 `url` 解析回部署目录、核对同一份字节。

不依赖「构建脚本说自己干了什么」——每一处都是重算。

---

## 6. APK 内置内容怎么进去（且不弄脏工作树）

`android/README.md` §3 的做法是「直接改 `android/app/src/main/assets/content/content.json` 再提交」。那是一种合法的落法，但它是**仓库可见的发布动作**（工作树变脏、注入是破坏性的、回看不出差异）。流水线采用的方式是：

1. 把 `android/` 复制到 `<out>/.work/android`（**只读地读源工程**，`android/` 一个字节都不写）；
2. 把本次发布的内容放到 `<out>/.work/inject-assets/content/content.json`；
3. 用 `release/lib/inject-assets.init.gradle` **替换** assets 源目录：
   `p.android.sourceSets.getByName('main').assets.srcDirs = [new File('<注入目录>')]`
   （`--init-script` 传入，不动 `android/` 里的任何构建文件）；
4. 在副本里 `gradlew assembleDebug --offline`。

于是 APK 内置内容 = 本次发布的 `content.json`，而 `android/` 保持干净。实测：APK 内 `assets/content/content.json` = 23899 字节、`sha256=8ab12af9…`，与 `dist/content.json` 逐字节相同；APK 内只有这一个 assets 条目。

**两个坑（都真踩过，已修 + 加了断言）**：

- 模板里若出现两次占位符，`String.replace` 只替换第一处 ⇒ init script 里留着字面量 `'__ASSETS_DIR__'` ⇒ **assets 全空**、APK 里没有内容。现在用 `replaceAll` 并在替换后断言不再残留、且注入目录里确有文件。
- `--offline` 是默认值（发布构建不该偷偷依赖网络）；本机实测 `assembleDebug --offline` 通过（37 个任务，8 秒，大部分命中 Gradle 构建缓存）。需要联网时传 `--online`。

**未验证**：这条路径只在 `assembleDebug`（debug 构建类型）上跑过；`assembleRelease` + 固定签名未跑（未授权）。正式签名后 APK 名字里就不该有 `-debug`。

---

## 7. 产物就绪检查：23 项，全绿才允许推进最新版

`node release/check-ready.mjs` → 退出码 `0`＝全绿（可以推进），`1`＝有红项（**禁止推进**），`2`＝用法错误。

| # | 检查项 | 查什么（都重算，不看构建的自我声明） | 红了意味着什么 |
|---|---|---|---|
| 1 | `out-dir` | 产物目录存在 | 还没构建 |
| 2 | `manifest` | `release-manifest.json` 可解析、必需字段齐 | 构建没跑完/清单坏了 |
| 3 | `source-tree-clean` | 构建时的源树脏标记 | **黄**：本地演练可以，真发布必须先从干净提交构建（不可复现） |
| 4 | `dist-json` | 规范产物可解析，并打印首/末诗名、诗数、分组数 | 产物坏了 |
| 5 | `schema-validation` | **调用 `node tools/validate-content.mjs`（C 线的 schema）** | 产物不满足契约。**本项刻意不写死字段清单**——契约一改（例如用户 2026-10-14 拍板「只发 `orderInSource`、不再发 `authorSortKey`/`titleSortKey`」），硬编码清单就会假红 |
| 6 | `format-version` | `formatVersion === 1`（IF-30） | 结构变了却没同步两端客户端 |
| 7 | `content-version-shape` | `YYYY.MM.DD.N` | 本地派生版本被当成发布版本发了（客户端不会采用） |
| 8 | `content-version-matches-manifest` | 产物 vs 清单 | 清单和产物不是同一次发布 |
| 9 | `version-monotonic` | 严格大于上一版 | 已更新的客户端不会采用它；发了个「更旧」的号 |
| 10 | `poem-count` | 诗数 > 0 且与清单一致 | 空内容 / 产物与清单不符 |
| 11 | `order-in-source` | **数组次序** + `orderInSource` 严格升序（`source` 策略下，有值者必须在数组前面） | 组内次序被弄错（此前真实发生过的系统性问题：客户端重排会静默推翻用户选定的次序） |
| 12 | `dist-sha256` | 重算 sha256 与字节数 vs 清单 | 产物被改过 |
| 13 | `dist-sidecar` | 边车格式（`<64hex>␠␠content.json`）与哈希 | 边车写错 ⇒ Web 端校验失败 |
| 14 | `web-same-source` | 部署内容是 `dist` 的**字节复制** | APK 与 Web 发的不是同一份内容（核心事故） |
| 15 | `web-sidecar` | 边车 vs 部署内容 | Web 端会拒绝/降级校验 |
| 16 | `web-required-files` | 白名单条目都在 | 站点缺文件 |
| 17 | `web-no-unexpected` | 部署目录顶层**精确**比对（多一个都红），且无开发期条目 | 夹具/测试/脚本泄漏到公开站点 |
| 18 | `sw-shell-files` | 解析 `sw.js` 的 `SHELL` 预缓存清单，逐个确认文件存在 | 任一缺失 ⇒ `cache.addAll` reject ⇒ **SW 装不上、离线能力直接没有** |
| 19 | `sw-config-agree` | `sw.js` 与 `app/config.js` 的 `APP_VERSION`/缓存前缀一致，且客户端支持的 `formatVersion` == 产物 | 资源缓存各自为政；或「新版内容谁都读不了」 |
| 20 | `android-manifest` | 清单字段齐、`sha256` 是 64 位小写十六进制、版本/结构版本与产物一致、`size` 与实际字节一致；**并按 Android 端的 URL 语义解析 `url`**，确认它落回部署目录里的同一份字节 | Android 端会 404 / `SIZE_MISMATCH` / 拒绝更新 |
| 21 | `apk-present` | APK 存在，且文件哈希与清单一致 | 三样产物少一样 |
| 22 | `apk-builtin-same-source` | **从 APK 里读回 `assets/content/content.json`**，与 `dist` 逐字节比对（含内容版本号） | **最关键的一条**：用户以为发的是这一版内容，APK 里却是别的 |
| 23 | `apk-identity` | `aapt2 dump badging`：包名 == `dev.sopho.suofei`、`versionCode` == 清单 | 打错包名（发布后不可改） |

**跳过（SKIP）与黄（WARN）不当成通过**，会单独列出来：
- SKIP 例子：没给「上一版」基线 ⇒ 单调性**没查**（不是「查过了没问题」）；`--skip-apk` ⇒ APK 那两条没查；找不到 `aapt2` ⇒ 身份没查；`--android-feed none` ⇒ 清单没查（会说明这是**待定接口**）。
- 黄例子：源树有未提交改动（不可复现）。

---

## 8. 失败 / 中断了怎么办

**共同不变量：不推进最新版，旧版本一个字节都不动、仍然可下载可读。**

| 情形 | 流水线行为 | 用户看到 |
|---|---|---|
| 内容编译失败（契约校验/单调性） | `build` 非零退出；编译器**失败时不写产物也不动已有产物** | 老样子，无事发生 |
| 复制后字节不一致、APK 注入没生效 | `build` 非零退出（`COPY_MISMATCH` / `APK_CONTENT_MISMATCH`） | 明确说「APK 内置内容与发布内容不是同一份」 |
| Gradle 构建失败 | `build` 非零退出 | 无 APK ⇒ 就绪检查必红 |
| 就绪检查有红项 | `check-ready` 非零退出 | 列出红项，并明说「不推进最新版；旧版仍可下载」 |
| 构建到一半被打断（Ctrl-C、机器崩） | `release/out/` 是中间态；重跑 `build-release.mjs` 会先整个清掉它再重来 | 站点上什么都没变（还没部署） |
| 部署了一半 | **本流水线不管部署**。GitHub Pages/Release 的生效时机由服务商决定 | 见下 |

**不声称原子性（写在这里，也写在检查的输出里）**：
- GitHub Pages：部署是一批静态文件，**没有**「三样产物一起生效」的保证；Pages 有 CDN 缓存，新文件可能先于/晚于旧文件被各节点看到，生效延迟由服务商决定。
- Release APK 与站点内容的生效也**不是**同一个原子动作：用户可能先拿到新 APK（内置新内容）再看旧站点，或反之。
- 因此可接受的状态只有两种策略：**(a) 先把内容/Web 就绪，再挂 APK**，或 **(b) 先挂 APK，再放内容**——无论哪种，两端客户端**本来就是按各自协议独立判断**「有没有新内容」，并且都实现为「完整下载 + 校验通过才切换、失败保留旧版」（`android-offline-update.md` §6、`web/README.md` §3.2）。流水线提供的保证是**同一份字节**，不是「同时生效」。

---

## 9. 演练中发现的跨线不一致（需要协调，本流水线未擅自改别人的文件）

### 9.1 IF-22 的 `url` 解析：Android 端文档示例与代码不一致（会 404）

- Android 代码：`ContentUpdater.resolveUrl(manifestUrl, manifest.url)` —— 基址是**清单自己的 URL**。
- `android-offline-update.md` §2 的示例写 `"url": "content/2026.10.14.2/content.json"`。按代码语义解析（清单在 `/suofei/content/latest.json`）：

  | 清单里的 `url` 写法 | 解析结果（实测 node `new URL`，与 Java `URL(URL,str)` 同为 RFC 3986） |
  |---|---|
  | `content/2026.10.14.2/content.json`（文档示例） | `/suofei/content/content/2026.10.14.2/content.json` ← **多一层，404** |
  | `2026.10.14.2/content.json`（相对清单所在目录） | `/suofei/content/2026.10.14.2/content.json` ← ✅ |
  | `/suofei/content/2026.10.14.2/content.json`（绝对路径） | 同 ✅（但换了域名/子路径就失效） |
  | `https://cdn.example/...`（绝对 URL） | 代码允许，但站点地址还没定（IF-13） |

- 流水线的选择：产出注释里能自证的那种，即**相对清单所在目录**的 `<版本>/content.json`，并在 `release/lib/artifacts.mjs: androidSnapshotUrl()` 里做成**唯一定义处**（改一行就能换形状）。
- 诚实边界：这是**静态阅读代码 + URL 语义实测**的结论，**未在 JVM/真机上实跑**；`resolveUrl` 的 catch 分支（解析失败时返回原串）也没有覆盖到。请 D 线确认：是改文档示例、还是把 `url` 的基准语义明确写进 IF-22。

### 9.2 两端更新协议不一致（＝决策点 2，用户未拍板）

Web 端直接取站点根的 `content.json`（IF-26/27，无清单）；Android 端先取 `content/latest.json` 小清单（IF-22）。**同一次部署必须同时满足两套形状**——流水线现在默认两套都产（`--android-feed manifest`）。用户拍板后只需改这一处开关或改 Web 端实现，流水线其它部分不动。已按要求把它做成**可配置的一步**，并列为**接口待定**。

---

## 10. 需要用户单独授权的步骤（一个都没做）

| 步骤 | 对应 | 授权前流水线会怎样 |
|---|---|---|
| 创建/推送公开仓库、定仓库名 | A4.1 / IF-13 | 不做。产物只在本地 `release/out/` |
| 启用 GitHub Pages、定部署地址 | A4.2 | 不做。`--android-feed` 产出的是**相对**地址，不绑定站点 URL |
| 打 tag / 挂 Release | A4.3 | 不做。`--tag` 只**解析**已有 tag 名，不创建 tag |
| 固定签名（keystore 放哪、是否用 secrets） | A4.4 | 不做。APK 是 **debug 签名**，`release-manifest.json` 里 `signed: false`，且摘要里会明确警告它不能作为正式产物 |
| 装到真机/模拟器验收 | A5 | 不做。**一次都没做过**（见 §12） |

---

## 11. 本地演练证据（真实命令与输出）

工作树：`C:\Users\wsqsy\Documents\android\.sopho-wt\f-003ac2f6`（分支 `wt/f-003ac2f6`），源提交 `257de5a`。

### 11.1 绿：完整一次发布

```bash
$ node release/build-release.mjs --content-version 2026.10.14.2
[1/8] 前置事实        node v25.9.0 / JAVA_HOME=…/ms-17.0.17 / ANDROID_HOME=…/Android/Sdk
                     应用版本 0.1.0 (versionCode 1), applicationId=dev.sopho.suofei
                     已提交的 APK 内置内容版本: 2026.10.14.1
[2/8] contentVersion  2026.10.14.2 ← 来源：explicit；单调性基线 2026.10.14.1（来自已提交的内置内容）
[3/8] $ node tools/build-content.mjs --out release/out/dist/content.json --order source \
            --content-version 2026.10.14.2 --previous-version 2026.10.14.1
      内容编译成功：19 首诗 / 1 个分组 → release/out/dist/content.json
        formatVersion=1 contentVersion=2026.10.14.2   组内排序策略：source   单调性检查通过：2026.10.14.1 → 2026.10.14.2
      产物: dist/content.json 23899 字节 sha256=8ab12af90e23be39ed6e8fad1be28ea49c013a74dad939e7a1108b5fb56413cf
      内容: formatVersion=1 contentVersion=2026.10.14.2 poems=19 dynasties=1 generatedAt=2026-10-14T13:05:24Z
[4/8] 复制自 web/: index.html, styles.css, manifest.json, sw.js, app
      部署内容: content.json 23899 字节 sha256=8ab12af9…（与 dist 字节一致）
      部署目录顶层: app, content, content.json, content.json.sha256, index.html, manifest.json, styles.css, sw.js
[5/8] 快照: release/out/web/content/2026.10.14.2/content.json 23899 字节 sha256=8ab12af9…
      清单: content/latest.json  url=2026.10.14.2/content.json
[6/8] $ gradlew.bat --init-script …/inject-assets.init.gradle assembleDebug --offline  (cwd: release/out/.work/android)
      BUILD SUCCESSFUL in 8s / 37 actionable tasks: 17 executed, 20 from cache
      APK 内置内容校验: assets/content/content.json 23899 字节 sha256=8ab12af9… == dist ✓
      APK: apk/suofei-2026.10.14.2-debug.apk  9567460 字节  sha256=db72b1a113009877813f4fee433d993501e50f837e997e2b19b259d313340dfc
      ! 这个 APK 是 debug 签名，只用于本地演练；它不能作为正式发布产物。
[7/8] 清单: release-manifest.json（3991 字节）
[8/8] 摘要  内容 JSON dist/content.json 23899 字节 / Web 部署目录 web/ 13 个文件
            远端更新清单 web/content/latest.json + content/2026.10.14.2/content.json
            APK apk/suofei-2026.10.14.2-debug.apk 9567460 字节
退出码：0

$ node release/check-ready.mjs
…
绿 23 / 黄 0 / 跳过 0 / 红 0
结论：**三样产物就绪**（本地演练口径）。可以推进「最新版」。
退出码：0
```

关键几项的实际 detail：`schema-validation`（走 C 的 schema）`poems=19 dynasties=1`；`order-in-source` `19/19 首有 orderInSource，1 起严格升序（1…19）`；`sw-shell-files` `9 条预缓存路径全部存在`；`android-manifest` `url=2026.10.14.2/content.json → /suofei/content/2026.10.14.2/content.json（同一份字节）`；`apk-identity` `dev.sopho.suofei versionCode=1 versionName=0.1.0 应用名=索斐`。

### 11.2 红之一：产物还没构建（干净的 20 红 / 2 跳，不是一串栈）

```bash
$ node release/check-ready.mjs          # release/out 不存在
[红] out-dir / [红] manifest / [红] dist-json / … 共 20 项
绿 1 / 黄 0 / 跳过 2 / 红 20
结论：**不满足推进条件**（有红项）。
影响：不推进「最新版」；旧版本仍然可以下载、可以读，没有东西被删掉。
退出码：1
```

（依赖项标成「前置未就绪（dist）—— 本项没查」，所以人一眼能看出真正的问题在哪。）

### 11.3 红之二：三样产物少一样

```bash
$ node release/build-release.mjs --content-version 2026.10.14.2 --out release/out-noapk --skip-apk
  ! 本次没有 APK ⇒ 就绪检查必然报红 ⇒ 不得推进最新版。
$ node release/check-ready.mjs --out release/out-noapk
[红] apk-present                  APK 构建产物存在
[跳] apk-builtin-same-source      前置未就绪（apkBuf, dist）—— 本项没查
绿 20 / 黄 0 / 跳过 2 / 红 1       退出码：1
```

### 11.4 红之三：故障注入——APK 里内置的其实是**别的版本**（这道门真会拦）

演练做法（**这是一次刻意的模拟事故，不是真实构建的输出**）：把 `release/out` 复制一份，在同一个副本里**不注入**再构建一次 APK（于是它内置的是仓库里那份 `2026.10.14.1` 的内容），替换掉已发布的 APK，并把清单里的 `apk.bytes/sha256` 同步成这个陈旧 APK——模拟「流水线如实记录了它构建的那个 APK，但那个 APK 的内容不是这次发布的」。

```
[红] apk-builtin-same-source      APK 内置内容与发布内容**逐字节相同**（发布门里最关键的一条）
     APK 内置内容 ≠ 本次发布内容：
          APK 内 f58f945adcfb94aa50cdc0570f10a53a4956ebd22dab5b99b7684812bb724503
          dist  de7e3f00bf4c5ca3c588b85e39b20ed8c6d843fb2c020aa43ad027f13c4cc3d3
          （这正是 android/README §4 那道门要拦的事故：用户以为发的是这一版内容，APK 里却是别的。）
绿 22 / 黄 0 / 跳过 0 / 红 1        退出码：1
```

（`f58f945a…` 正是已提交在 `android/app/src/main/assets/content/content.json` 的那份 2026.10.14.1 内容的哈希，与 `android/README.md` §4 记录的实测值一致——所以这不是随便哪份文件，而是「上一版内容被当成这一版发出去」的真实形态。`apk-present` 仍绿，因为清单被同步了，红的**只有**同源这一条。）

### 11.5 其它已实测的路径

```bash
# 没给版本号来源 ⇒ 拒绝跑（不替用户选默认来源）
$ node release/build-release.mjs
✗ 发布构建失败 [VERSION_SOURCE_NOT_DECIDED]：没给 contentVersion 的来源，且**没有默认值**：…   退出码 1

# tag 名候选的解析（单元级）
"2026.10.14.2" → 2026.10.14.2    "v2026.10.14.2" → 2026.10.14.2
"content-2026.10.14.2" → 2026.10.14.2    "refs/tags/content-2026.10.14.2" → 2026.10.14.2
"release-1.2.3" → null（不认识就不猜，直接失败）
date 候选：date(UTC 2026.10.14，当天 tag 里最大 N=0 → 2026.10.14.1)

# 产物字节可复现（同一内容 + 固定 SOURCE_DATE_EPOCH，两次编译）
run1: 424c2a1b994250c0a0792772eee210a27165fb135a7adc4d0be28c722212236e  "generatedAt": "2025-10-09T08:53:20Z"
run2: 424c2a1b994250c0a0792772eee210a27165fb135a7adc4d0be28c722212236e  （字符相同 ⇒ 可复现）
# 对照：不固定时间时两次编译字节不同（generatedAt 变）
run1: ce90a1a945a2d2dee12aa955750ab88f4c8f250c7c36c98c9a59210806f1e549
run2: 1bb0d8e79b5913cce83be3e14856ed88c989428e7babd79c875b9f088f2f9868
```

⇒ **哈希只在「一次发布内」可比**；要让同一次发布的产物字节可复现，正式流程应固定 `--source-date-epoch`（否则 `generatedAt` 让每次编译的字节都不同）。这一条已写进清单（`sourceDateEpoch`）。

演练中修好的自家缺陷（都留了断言，不是「记得小心」）：init script 占位符只替换第一处导致 assets 全空；编译器 `--out` 写成仓库相对路径导致产物落在仓库根；显式 `--previous-version` 被本地旧 manifest 盖掉导致重发同号时误报 `VERSION_NOT_MONOTONIC`。

---

## 12. 已验证 / 未验证

**已验证（本机实跑，可复现）**

- 真实 19 首内容编译（`--order source`，单调性通过）→ `dist/content.json` 23899 字节。
- Web 部署目录准备（白名单复制 + 字节一致 + 边车），`sw.js` 9 条预缓存路径齐全。
- APK 构建（`assembleDebug --offline`，8 秒，37 任务）+ **从 APK 读回 assets 与 `dist` 逐字节相同**。
- 就绪检查全绿一次（23/23）、红三次（未构建 / 少一样产物 / 故障注入的同源失败），红项退出码均为 1。
- APK 身份实测：`dev.sopho.suofei` / versionCode 1 / versionName 0.1.0 / 应用名「索斐」。
- 版本来源的四种候选解析（含拒绝不认识的形状）、`date` 候选、产物字节可复现性（固定/不固定 `SOURCE_DATE_EPOCH` 对比）。
- 跑完五个源目录 `git status` 干净：流水线确实没改别人的文件。

**未验证（不要当成已成立）**

- **没有推任何远端、没有 tag、没有 Release、没有 Pages**：以上全部是本地目录演练。
- **没有在真实 GitHub Pages 上部署过**，也没在 https + 子路径下实测（子路径下 `content.json`/`latest.json`/内容快照的相对路径**按代码应该成立但没实测**）。
- **APK 是 debug 签名**，未做正式固定签名；`assembleRelease`、覆盖升级（`versionCode` 增长）都没跑过。
- **没有在真机/模拟器上装过**（一次都没有）：APK 能否装、能否读内置内容、更新流程能否连真实站点，全都没验证。
- **没在 Android 端实跑过更新清单**：`url` 语义的结论来自静态阅读代码 + URL 解析语义实测，不是 JVM/设备实测（§9.1）。
- Web 端 e2e（110 项）是 E 线的成绩，**本流水线没有重跑它**，也没有在部署目录上跑过任何浏览器测试——就绪检查只做静态断言（文件齐、SW 预缓存路径存在、版本常量一致），**不证明页面能跑**。
- 未做故障注入以外的失败路径演练：磁盘满、Gradle 中途崩、杀进程。
- `release/out/` 首次构建约 30 秒（含 8 秒 Gradle，命中本机构建缓存）；**没在干净机器/CI 上跑过**，CI 会撞上本机 `~/.gradle/gradle.properties` 里那个到不了 `dl.google.com` 的代理（见 `docs/status.md` 的坑），届时需要 `-PextraMavenMirror` 或换 CI 环境。

---

## 13. 脚本清单与调用方式

```bash
node release/build-release.mjs --content-version 2026.10.14.2      # 完整一次发布（内容+Web+清单+APK）node release/build-release.mjs --tag content-2026.10.14.2          # 从 tag 名取版本（暂定方案 B）
node release/build-release.mjs --version-source date               # 候选 C：日期+当日递增
node release/build-release.mjs --out release/out --skip-apk        # 只出内容/Web（就绪检查会因缺 APK 报红）
node release/build-release.mjs --android-feed none                 # 不产出远端清单（接口待定项）
node release/build-release.mjs --source-date-epoch 1760000000      # 让产物字节可复现
node release/check-ready.mjs                                       # 就绪检查（0=可以推进，1=禁止推进）
node release/check-ready.mjs --out <dir> --json                    # 指定产物目录 / 机器可读结果
```

两个脚本的**退出码**一致：`0` 成功/就绪，`1` 构建失败/有红项（**禁止推进最新版**），`2` 用法错误。
（`import` 两者都不会触发主流程，只有直接当脚本跑才会。）

| 文件 | 作用 |
|---|---|
| `release/build-release.mjs` | 8 步编排；只写 `<out>`；打印真实命令与关键数值；失败非零退出 |
| `release/check-ready.mjs` | 23 项就绪检查；绿/黄/跳过/红 + 结论；`--json` |
| `release/lib/artifacts.mjs` | **产物布局与部署白名单的唯一定义处**（build 与 check 共用，防止两边漂移） |
| `release/lib/version-source.mjs` | **`contentVersion` 来源的可配置点** + 单调性基线解析 |
| `release/lib/util.mjs` | 哈希/进程/文件/打印；仓库根固定，从任何 cwd 调用结果一致 |
| `release/lib/zip.mjs` | 零依赖的最小 zip 读取器（从 APK 读回内置内容） |
| `release/lib/inject-assets.init.gradle` | 替换 `assets.srcDirs` 的 Gradle init script 模板 |
| `release/.gitignore` | 忽略 `/out/`（**不动根 `.gitignore`**） |
| `release/README.md` | 面向人的简要用法与产物说明 |
