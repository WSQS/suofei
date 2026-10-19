# 「索斐」本地实施与核验 · 阶段交付包（2026-10-16）

> **只读这一份就够。** 它自足地写清：做着什么、到哪了、候选在哪、验过什么、还剩什么。
> 历史过程／多层台账在 [`docs/status.md`](status.md)、`items/*/item.md` 与各轮 `history/`，**不必翻**。

---

## 0. 结论（先看这两句）

1. **已授权范围的实现与核验已全部完成**：内容（19 首／127 行正文／24 条异文）、格式 `formatVersion: 2`、两端四页实现、契约对照与宽度实测、最新构建上的四页复核、页脚诊断面板移除。
   ⚠ **这句曾经过早，如实记下来**：2026-10-16 用户在本机预览时发现**页脚诊断面板**（缓存名／SW／配额／长诚实说明＋三个调试动作）**四页都在**——我此前那句「四页全部命中」只查了 `view-*` 子树、**没查整页**。已整块移除并补了**全页面**断言（见 §2 更正与 §6.9）。**教训**：负向断言要盖住整份文档（header/main/footer/notice），只查子树会恒真。
2. **S5 发布已执行（用户 2026-10-16 授权，版本 0.1.2）**：tag `v0.1.2+content-2026.10.16.23` 已推、CI 全绿、Pages 已部署、Release 已建、Android 前馈清单已推进 ⇒ **线上读回见 §0b**。
   ⚠ **不许洗成「整个阶段从未 push」**：`origin/master` 停在 **`eb33f11`**，那是**前任在被要求停手之前推的**（已披露）；本地 master 领先它若干提交 ⇒ 准确说法是「**本阶段**未推、也**不回退/不改写**已推历史」。
   ⇒ **下一步只剩**：**用户看实际效果**（用线上站点，见 §0b 链接）。

**事实锚（别数错）**：发布前后的代码改动都在 `a9c6a3a`（0.1.2 版本 bump ＋两处发布路径修复）之后的几个发布提交里（`559563f` 基线回退、`0ef61fd` 门自比修复、`b738456` CI 中文字体）；
**实现/内容的最后状态＝ tag `v0.1.2+content-2026.10.16.23` 指向的提交**。Android 四页复核的**构建基底是 `1291063`**（与**当时**的应用代码零差异）—— ⚠ **它早于块标记 boundary 收严（`8a6a083`）**，但收严对**真实内容**的渲染结果无影响（近失标记行实测 **0** 处）⇒ 四页照面结论仍成立，只是**不冒充「同一构建」**。

---

## 0b. **发布结果（2026-10-16，S5 已执行完成）**

**tag ＝ `v0.1.2+content-2026.10.16.23`**｜CI run `38884967123`（tag push 触发；workflow [release.yml](../../.github/workflows/release.yml)）

| 项 | 实测值（**已读回**） |
|---|---|
| **就绪门（CI、release 变体）** | **绿 26 / 黄 0 / 跳过 0 / 红 0（共 26 项）**；结论行「三样产物就绪（release 变体）。可以推进最新版」 |
| 真跑门（CI） | Web e2e **443/443**；Android JVM 单测 **146 例 / 失败 0**；Web↔契约 MD 对照（绿） |
| **正式签名** | `apksigner verify` → `CN=Suofei, OU=suofei, O=WSQS, C=CN`；SHA-256 `1346444c189aa50aa81b76eeeb28ff61aeb8b9b2ba972ed77d2fd2ca74bdf345` — **与上一版 `v0.1.1` 的证书指纹逐字相同**（⇒ 可覆盖安装） |
| **APK** | `suofei-2026.10.16.23.apk`，**7,050,994 字节**，`versionCode=3` / `versionName=0.1.2` / `dev.sopho.suofei` / 应用名 `索斐`（**文件名不带 `-debug`**） |
| **APK 内置内容 vs 线上内容** | sha256 **两侧相同**：`2728ca84e43bad245c143648a0bda8a10f1a8b4fe3be889b7ea786a175e30cfb`（22026 字节） |
| **线上站点** | `APP_VERSION=0.1.2`（`app/config.js` 与 `sw.js` 两处都读到）；`content.json`：`formatVersion=2`、`contentVersion=2026.10.16.23`、19 首（13 首带详情） |
| **Android 更新前馈清单** | `content/latest.json`：`formatVersion 2`、`contentVersion 2026.10.16.23`、`url 2026.10.16.23/content.json`、`sha256`（同上）、`size 22026`、**`minAppVersionCode 3`**（＝本次正式 APK） |

**链接**：站点 <https://wsqs.github.io/suofei/>｜Release <https://github.com/WSQS/suofei/releases/tag/v0.1.2%2Bcontent-2026.10.16.23>（附件即上面那个 APK）

**发布说明**：用 `release/notes/release-notes.md` 模板由 CI 注入两个版本号生成（已上线，含 format2 旧 APK 保旧、需同签名新 APK 覆盖、旧 ASCII 深链接失效、真机未验/本地 debug 演练边界）。

**本版发布路径上修掉的三处真实缺陷（都是真门挡下的）**：
1. 流水线的 `SUPPORTED_FORMAT_VERSION` 还停在 1（两端客户端已是 2） ⇒ `format-version` 门报红；
2. 发布工作副本里 Android 单测在**配置阶段**就 BUILD FAILED（输入声明取 `android/` 的父目录） ⇒ `live-android-unit-tests` 在真实发布路径上永远跑不起来；
3. 新增的 `apk-versioncode-bumped` 门自己没排除「本次正在发的 tag」（CI 的 `fetch-depth: 0` 把它取到本地）⇒ 自比自；已修。
   另：CI 无中文字体 ⇒ 无头浏览器把汉字量得很窄 ⇒ 「超宽行折行」两条断言前提不成立（已装 `fonts-noto-cjk`，并把该**前提**显式断言掉）。

**已核 / 未核**：以上数值均为**线上读回**（HTTP 拉取 + 下载正式 APK 后用 `apksigner`/`aapt2`/解包比对）。
**未核**：物理真机安装与冷启动观感、升级覆盖安装的真机行为（验收基准仍是模拟器）、系统字号放大/字体回退/WebView、
更新链路的损坏/不兼容两种状态端到端。（本页 §6 的未验证清单仍然有效。）

---

## 0c. **发布结果 0.1.3（2026-10-16，S5 第二次）**

**tag `v0.1.3+content-2026.10.16.24`**｜CI run **`38905672593`**（success）｜站点 <https://wsqs.github.io/suofei/>｜Release <https://github.com/WSQS/suofei/releases/tag/v0.1.3%2Bcontent-2026.10.16.24>

- **就绪门（CI、release 变体）：绿 26 / 黄 0 / 跳过 0 / 红 0**；结论行「三样产物就绪（release 变体）· 可以推进最新版」。
- 真跑门：Web e2e **445/445**｜Android JVM 单测 **151 例 / 失败 0**。
- **正式签名**：`CN=Suofei, OU=suofei, O=WSQS, C=CN`，SHA-256 `1346444c…` —— **与 0.1.2 逐字相同**（可覆盖安装）。
- **APK**：`suofei-2026.10.16.24.apk`（**7,051,210 字节**，文件名不带 `-debug`），**`versionCode 4` / `versionName 0.1.3`**；**内置内容 sha256 ＝ 线上内容 sha256**（`81d4d2bf…`）。
- **线上**：`APP_VERSION=0.1.3`（`config.js` 与 `sw.js` 两处）；内容 `contentVersion=2026.10.16.24`、`formatVersion=2`、**20 首 / 2 组（汉 19 ＋ 近现代 1）**、`notes` 全 null；前馈 `content/latest.json` → `minAppVersionCode **3**`（内容仍 format 2，vc3 就能读 ⇒ 不白白拒掉 0.1.2 用户一次更新）。
- **本版内容**＝《古诗十九首》19 首＋用户自行录入并提交的《七律·和郭沫若同志》（近现代组，用户提供原文，**未从网补诗/注**；来源与许可的**未核**事实未改写）。
- 两个 Android 修复都在本版正式源里：**系统返回键/手势**按层级返回（目录根才退出）＋关于页**按钮上下暗缝**（边框与底色同 Surface）。

> ⚠ **本次为「多组」真修了 4 处门与测试（不是绕过）**：`check-ready` 的 `order-in-source` 改为**逐组**核；
> e2e 改为**按组取行**并从产物派生计数（并新增「近现代组单独成组·1 首」断言）；两个 Android 测试同步；
> 另给 `build-release` 加了 `--min-app-version-code`（本次＝3）。
> 发布后另行把**已提交的内置资产版本字段**同步为 `.24`（它是**下一版的单调性基线**，不是发布结果）。

---

## 0d. **内容刷新发布（2026-10-18，同 app 版本、含新 APK）**

**tag `v0.1.3+content-2026.10.16.26`**｜CI run **`39083735474`**（success）｜Release <https://github.com/WSQS/suofei/releases/tag/v0.1.3%2Bcontent-2026.10.16.26>

- **应用版本没变**：`APP_VERSION` / `versionName` **0.1.3**、`versionCode` **4**、`formatVersion` **2**；**只有内容** `.24 → .26`。
- **但打了新 APK**（用户要求：新下载不联网也能读 22）：`suofei-2026.10.16.26.apk`（7,052,306 B），**同版本号同证书**（`CN=Suofei` `1346444c…`），**内置内容 sha256 ＝ 线上内容 sha256**（`9281d03e…`）。
- **线上读回**：`APP_VERSION=0.1.3`；**`CONTENT_REVISION=2026.10.16.26`**（config.js 与 sw.js 都读到了）；**缓存键 `pc-resources-0.1.3+2026.10.16.26`**；内容 **22 首 / 3 组 `["汉","唐","近现代"]`**、26083 字节；`latest.json` 同 sha、**`minAppVersionCode 3`**（0.1.2/vc3 仍能读 format 2）。
- **门**：绿 **32** / 黄 0 / 跳 2 / 红 0（共 34）；真跑门 e2e **500/500**、Android **151/0**。那 2 跳是 `app-version-bumped` 与 `apk-versioncode-bumped`，**被同模式下的正面断言取代**（`same-app-app-version-unchanged`：线上现值 == 基线 tag == 本次；`same-app-version-code-unchanged`：与同 app 版本旧 tag 相等，**不写死数字**）。
- **不用新工作流**：仍走 `release.yml`（只多了 `--same-app-content-refresh` 两处）；`v*` tag 触发。
- **旧历史未动**：`v0.1.3+content-2026.10.16.24` 的 tag（对象 `d32e1f6` → commit `f2c2490`）/Release/APK 均在；**GitHub 自动把新 Release 标为 Latest**，旧包仍可下载。
- **Web 缓存迁移**：旧键 `pc-resources-0.1.3` → 新键 `pc-resources-0.1.3+2026.10.16.26`；activate 仍只删**本前缀**的旧 cache（壳与内容同一 cache、停 waiting、不自动刷新）。

> ⚠ 已知边界（如实）：① **已发布旧包的首轮提示无信息量**（旧 `main.js` 只拿 `report.appVersion`，同 0.1.3 时显示两个相同版本号）——发现与切换是安全的，但文案要等新壳；② 本地只跑了 debug 仿真，**正式签名断言由 CI 的 release 变体真跑**；③ **真机未验**（只有本项目模拟器）。

---

## 0e. **23 首正式发布（2026-10-19；同 app 版本 + 新 APK）**

**tag `v0.1.4+content-2026.10.19.3`**（annotated tag 对象 `431b984` → commit `8d81fe6`）｜
**CI run `39184862870`（success，5m28s，`workflow_dispatch` + `mode=same-app-content-refresh` + `dry_run=false`）**｜
站点 <https://wsqs.github.io/suofei/>｜Release <https://github.com/WSQS/suofei/releases/tag/v0.1.4%2Bcontent-2026.10.19.3>

- **应用版本没变**：`APP_VERSION` / `versionName` **0.1.4**、`versionCode` **5**、`formatVersion` **3**；只有内容 `.18.3 → .19.3`。
- **就绪门（CI、release 变体）**：**绿 32 / 黄 0 / 跳过 2 / 红 0（共 34）**；结论行「**same-app 内容刷新就绪**（内置 23 首；APP_VERSION 0.1.4 / versionCode 5 未变，内容 2026.10.18.3 → 2026.10.19.3）」。
  那 2 跳＝`app-version-bumped` / `apk-versioncode-bumped`，**被同模式下的正面断言取代**（线上现值 == 基线 tag == 本次；versionCode/versionName 与同 app 版本旧 tag 相等，不写死数字）。
  真跑门：Web e2e **687/687**（带**真旧基底** = tag `.18.3` 的 `web/**` ＋ 线上 `content/2026.10.18.3/content.json`）、Android JVM 单测 **174 例 / 失败 0**、Web↔契约 MD 对照 **204/204**。
- **同一份字节**（`dist` ＝ `web/content.json` ＝ `web/content/.19.3/content.json` ＝ **APK 内置** ＝ `latest.json.sha256` ＝ 线上 `content.json`）：
  `a38eb577485e8a78f9d1bca623f7ba3ea1f590b8c0ed2aabac0e07c7460f4e9e`（29494 字节）。
- **APK**：`suofei-2026.10.19.3.apk`（7,069,334 字节；asset digest `3cfb2b1b…`），`apksigner` 验过：`CN=Suofei, OU=suofei, O=WSQS, C=CN`，SHA-256 `1346444c…`（**与 0.1.4 同一张证书**）；`versionCode 5` / `versionName 0.1.4` / `dev.sopho.suofei` / 应用名「索斐」；**内置 23 首**。
- **线上读回**：`APP_VERSION=0.1.4`、`CONTENT_REVISION=2026.10.19.3`（`app/config.js` 与 `sw.js` 两处同值）；缓存键 `pc-resources-0.1.4+2026.10.19.3`；`content.json` **23 首 / 3 组 `["汉","唐","近现代"]`**、tags **古诗十九首 19 ／ 唐诗三百首 3**（members 望岳 → 梦李白其一 → 梦李白其二，朝代页「唐」组同次序）；`content/latest.json` → `minAppVersionCode 5` 且 sha 与 content 相同。
- **同一 tag 的两次 run（用户 2026-10-19 第 3 条要求）**：`push` 触发的 `39184828558` **red** —— 它停在**构建前**的前置闸（「tag 的应用版本 0.1.4 已有别的发布 tag ⇒ 这是同 app 内容刷新，请用 dispatch 选 same-app」），**没构建、没部署 Pages、没建 Release、没动 latest**（步骤表：后面全部 skipped）；真正发布的是**显式 dispatch** 那条。
- **旧历史未动**：`v0.1.4+content-2026.10.18.3` 的 tag 对象 `dd2f819` → commit `463ce05` 未变；它的 Release 与 APK 重新下载核过 —— asset digest `f704907f…`、证书同上、**内置内容仍是 `.18.3` / 22 首**（sha `1ab3f330…`），即没有被本次覆盖。
- **本轮顺带修掉的两个「判据漏洞」**（不是门没过，是该查的没查）：① `check-ready` 的两个「不满足推进条件」分支原先**只打印、不改退出码**（黄/跳 时工作流照样发）⇒ 现在结论与退出码同源（`release/lib/readiness.mjs`，有单测 + 源码守卫）；② same-app 的结论判据原先**不含 APK 五门** ⇒ `apk-signing` 黄也放行；现在五门进判据，`debug` 变体在两种模式下都只能是演练口径。
- **发布接线（用户四条硬要求）**：`workflow_dispatch` 显式 `mode`（`push` 永远正常升版）；checkout 按 `inputs.tag` 取 commit 并两步自检 `RELEASE_TAG ↔ release-manifest.sourceCommit ↔ HEAD` 三者一致；发布步骤要 `push` 或 `dry_run=false`；同一 tag 的两次 run 同 concurrency 组（`cancel-in-progress: false`）⇒ 排队、不互相 cancel。
- **未验（如实）**：物理真机安装/覆盖升级（验收基准仍是本项目模拟器，本轮**未在模拟器上装这个正式包**）、无障碍（键盘/TalkBack/对比度）、缺字回退与 OLED 观感、组头发丝线的两端差异、系统字号放大、WebView 内核；**更新链的中间态**（下载中/校验中/待切换）只在 e2e 的本地真部署里演练过，**不是线上站点**；Pages/Release 的生效延迟由服务商决定，不声称原子性。

---

## 1. 候选在哪（两端 ＋ 构建身份与签名）（历史轮次记录，见 §0b/§0c/§0d/§0e 的最新发布）

（⚠ 下表的「本机候选」是**发布前**的表述；**正式发布已按 §0b 完成**（tag `v0.1.2+…`、正式签名包已上线），
本表保留下来是为了说明两端候选与线上现行的对应关系。）

| 端 | 位置 | 身份 / 签名 | 能当发布候选吗 |
|---|---|---|---|
| **Android（本地候选）** | 源码 `android/`；本机候选 ＝ `./gradlew assembleDebug` | `applicationId dev.sopho.suofei`、`versionCode 2`／`versionName 0.1.1`、**debug 证书** | ⚠ **不是**发布候选（debug 签名） |
| **Android（线上现行）** | `suofei-2026.10.16.23.apk`（**7,050,994 字节**，Release 附件） | **release 签名 `CN=Suofei`**、`versionCode 3`／`0.1.2` | ✅ **已发布**（上一版 `suofei-2026.10.16.20.apk` 仍在 Release 页可下载） |
| **Web（本地候选）** | 源码 `web/`（外壳 ＋ 真实 `dist/content.json`），本机以静态服务打开 | `APP_VERSION = '0.1.1'` | 本机可看；**未部署** |
| **Web（线上现行）** | https://wsqs.github.io/suofei/ | 线上 `APP_VERSION` **0.1.2**、内容 `2026.10.16.23`（读回见 §0b） | ✅ **已发布**（站点由 Service Worker 后台更新） |

⚠ **debug ≠ release，不许混说**：本机 Android 候选是 **debug 签名**。正式签名（`CN=Suofei`）的密钥与口令在仓库之外，本轮**没有读取**。因此本轮**不宣称**「已用正式签名覆盖升级验证过」——那条结论只对旧的 release 演练成立。

---

## 2. 已验证据（亲眼看过的图 ＋ 与原型差异）

**实拍/预览在哪**
- **Android 四页（在该次验收当时的合并后代码上复核）**：`docs/reviews/ui-review/materials-android-latest-4pages/` —— **11 张 PNG ＋ 同名 `uiautomator` dump 原文** ＋ `DEVICE-IDENTITY.txt`／`apksigner-verify-certs.txt`／三次构建日志／`check-bundled-content.log`／`install.txt`。
  - **构建基底 `1291063`；⚠ 现在已不是「当前构建」**：该次验收时它与主树一致，但**此后 `8a6a083` 的块标记边界收严改了三端实现**（compiler／Web／Android）⇒ **与主树当前代码已有差异，不是同一构建**（对齐 §0）。**对真实内容的渲染结果零影响**（真实 19 首近失标记行实测 **0**），所以四页照面结论仍成立 —— 只是**不当作当前构建**。
  - **APK 身份**：`app-debug.apk`、sha256 `a5851499…b787`、`versionCode 2`／`versionName 0.1.1`、**签名 `CN=Android Debug`**（⚠ **不是** `CN=Suofei`）。
  - **结论：四页视图区对照采纳锚全部命中**——目录页（悬挂记号／竖直居中差 0／**缩进 0**／《文选》原次序／无搜索无笔记标记）；诗页（全居中／8 行不折／返回左·详情右）；详情页（题名**左对齐**／来源带标签／`### ` 小标题**无竖线且同左沿**／无 detail 如实说明）；关于页（4 字段／无「来源」／无冗余副标题／**四条线合一**／初态只按钮）。**我自己亲眼看了 4 张**（目录页、诗页、无 detail 详情页、初态关于页）。
  - ⚠ **2026-10-16 更正（用户实际预览发现的验收漏项）**：上面那句「全部命中」当时只看**各页视图区**（`view-*`），**没查整页**——那个**页脚诊断面板**（缓存名／SW／内容体积与取到时间／配额／长诚实说明 ＋ 三个调试动作）在 `footer` 里，**四页都在**。它是 Web 骨架期脚手架、**不属于已采纳的页面集合**（`IF-46`）⇒ **已整块移除**（非 CSS 隐藏），并补了**全页面**断言，见 §6.9。
- **Web 四页**：`web/tests/evidence/`（如 `about-after.png`／`index-after.png`，关于页修偏后的实拍）＋ `web/tests/artifacts/`（每次跑 e2e 自动刷新全套）＋ 宽度 4 图 `docs/design/width-audit/{about,detail}-{320,1180}.png`。
- **原型（采纳锚，对照用）**：`items/app-ui/history/round-*/q-*.html` ＋ 各轮 `ARCHIVE.md`。
- **跨端块标记边界的正反例（新增）**：`tests/fixtures/contract/md-boundary.json`（30 例，**编译器／Web／Android 三方同读**）—— 与 §6.5 的收严配套，见 §3。
- **「四页都没有页脚面板／没有外壳顶栏」的整页证据（新增）**：`web/tests/evidence/no-panel-{index,poem,detail,about}.png`（**整页截图**，每张先滚到底；我**逐张亲眼看过**）＋ 可复跑断言在 e2e 的 §1c-3（见 §6.9）。

**与原型差异（逐条，都不是缺陷）**
1. **原型是静态 HTML 材料，实装是真实内容＋真实交互**（例：关于页「检查站点更新」真发请求、真显示在线/缓存状态）。
2. **关于页「仓库链接」**：⚠ **更正**——**原采纳锚 C1 本身就是 `<a href>`**（`round-2026-10-16-about/q-about.html` 里 `a.href = APP.repoFull;`，ARCHIVE 也写着「仓库链接＝C1 完整 URL」）⇒ 实装做成**可点是「把锚做回来」的修偏**，**不是**新增改进。（我第一版把它写成「原型里是纯文本」——**错的**。）
3. **详情页**：锚 **D0** 的 `### ` 小标题**无竖线、左沿＝正文左沿**；实装一致。**未采纳**的 L2 另两档与 L3 ②③ 未做。
4. **宽度**：原型是固定容器；实装用已选口径 `C = min(V, max(320, 0.88×(V−24)))`，8 视口实测 Δ ∈ **[0, −0.0144]px**（Chrome 1/64px 舍入），**无横向溢出**。
5. **18 项状态功能**（有新内容可用／下载中＋进度／校验中／待切换／延后等）**一律未批准、未实现**；实装只有初态与「测到新版本→提示手动刷新」。
6. 未采纳但保留：关于页「一句话说明」「诚实的限制」「来源」是否显示、失败态是否换色。

---

## 3. 全套最终复跑（本文件落定时的树，真 exit）

| 检查 | 结果 | 谁跑的 |
|---|---|---|
| `npm test` | **141 / 141，exit 0** | 负责人亲跑 |
| Web e2e（无头 Chromium） | **442 / 442，EXIT 0**（含 §1c-3 **全页面**负向扫描：面板＋外壳顶栏） | 负责人亲跑 |
| Android 单元测试（`--no-build-cache --rerun-tasks`） | **146 / 146，EXIT 0**（19 个测试类，0 失败 0 跳过） | 负责人亲跑 |
| Web Markdown 契约对照 | **204 / 204，EXIT 0**（含新增的 30 例块标记边界三方对账） | 负责人亲跑 |
| 编译器侧契约绑定 | **6 / 6，EXIT 0** | 负责人亲跑 |
| 宽度实测（**带图重跑**，基线 `fe65ff1`） | **86 / 86，EXIT 0**，观察项 0 | 负责人亲跑 |
| 宽度实测 `--no-shot`（复跑用） | **80 / 80，EXIT 0** | 负责人亲跑 |
| 发布门语义守卫 `tests/release-gate.test.mjs` | **3 / 3，EXIT 0**（并已证伪：摘掉门 or 放宽判据 ⇒ 变红） | 负责人亲跑 |
| `tools/check-doc-tables.mjs` | **exit 0**（29 个文件，表格结构完好） | 负责人亲跑 |
| `tools/check-bundled-content.mjs` | **exit 0** | 负责人亲跑 |

**没跑、以及为什么（诚实）**
- **`release/check-ready.mjs` 的总表没跑**：它在本模式（未授权发布）下会走到**正式签名路径**（读 `~/.suofei/` 的密钥与口令）——**本阶段不许读签名私钥**。⇒ 改为**逐个亲跑它所消费的三道真跑门**（e2e／Android 单测／契约对照）并列数如上。
- 未跑：真机（用户手机，明令不碰）、系统字号放大、字体回退、WebView 内核、<320 或 >1180 视口、笔记面板真实长笔记（产物 `notes` 全空，长笔记只用测试 fixture 验证过）。

---

## 4. 内容保真（源 19 首 ＋ 24 条异文）

- **19 首**，`dynasty` 统一为「汉」，**次序＝《文选》原次序**（`orderInSource` 1–19，逐字对）。
- **正文原始 127 行**（每首单节）—— **这是源文件里的行数**。
- **视觉折行是另一件事**（别把两者混为一谈）：窄屏放不下时才按句读/半句边界再断（5 条采纳锚已收口），所以**同一首在不同宽度下的显示行数不同**（宽度实测：详情页正文 320 上 25 行、1180 上 9 行）——**原始 127 行始终未变**。
- **24 条异文校记，分布在 13 首**（源笔记 `docs/sources/gushi-shijiu-shou.md` §7「异文清单（逐首）」覆盖的正是这 13 首）。
- ⇒ **剩下 6 首的 `detail` 为 `null` 是内容事实，不是未完成**：源笔记里这 6 首没有校记；详情页对无 `detail` 有**如实说明**路径（不编内容）。
- **`notes` 19 首全为 `null`**（不代用户创作；长笔记 fixture 只在测试里，**不进产物**）。

---

## 5. 新格式与旧 ID 的影响（读一次就够）

- **格式 `formatVersion: 1 → 2`（基线＝**正式 tag** `v0.1.1+content-2026.10.16.20`，按该 tag 的实际字节核过）**：`poem` 对象在**上线基线是 13 键**（`id,title,author,dynastyKey,dynastyLabel,dynastyOrder,era,genre,source,orderInSource,variants,stanzas,notes`）⇒ v2 **10 键**（`id,title,author,dynasty,genre,source,orderInSource,detail,stanzas,notes`）。逐项：
  - **三个 dynasty 键（`dynastyKey`／`dynastyLabel`／`dynastyOrder`）→ 单个中文 `dynasty`**；
  - **−`era`**（19 首全是「东汉末」，丢掉，不迁就）；**−`variants`**（24 条 `text`/`note` **逐字**折进 `detail` 的 `### 异文` 列表）；**+`detail`**（正文整节最小 Markdown）；
  - **`notes` 不是新增键**：上线基线**已有**（19/19，值都是 `null`）；
  - **顶层 `dynasties`**：上线基线 `[{key:"han",label:"汉",order:100}]` → v2 **中文数组 `["汉"]`**。
  ⚠ 两处更正痕迹：我第一版写成「新增 `notes` 键」（**错**）；第二版拿更早的 `8a92bc3`（15 键）当基线——那**不是上线基线**，`authorSortKey`／`titleSortKey` 的删除发生在更早，**不计入本轮变更**。
- **旧 App（只认 v1）遇到 v2 内容**：版本不匹配 ⇒ 走既有的**「版本不兼容保旧版」**路径，不撕裂显示。**两端同一份键集**（我核过：19 首完全一致）。
- **旧 ID 已不存在**：`gushi-shijiu-shou-NN` 全数换成 **`古诗十九首-<题名>`**（如 `古诗十九首-行行重行行`）；源文件/路径同理（`content/poems/古诗十九首/<题名>.md`）。⇒ **旧深链接会失效**（用户已接受）。我核过产物里 **0 个旧 ASCII id、0 个目录残留、无题名内多余连字符**。
- **Markdown 闭集（我按源码核过，不只看文书）**：**闭集 8 样＝段落／段内换行／`- ` 无序列表／`1. ` 有序列表／`**粗体**`／`*斜体*`／`### ` 三级标题／`> ` 引用**（`schema/markdown-subset.json` 的 `constructs`）。⚠ **行内代码与表格都在 `excluded` 里 ⇒ 出现即报错**（我第一版把这两样错列进闭集，已更正）。
- **块标记边界（2026-10-16 收严，见 §6.5）**：四个块标记必须**行首第 0 列 ＋ 恰好一个 ASCII 空格 ＋ 其后非空白**，块内文字**逐字保留不 trim**；三端同一套判据。

---

## 6. 已知未验 / 不阻塞（留痕，不让它们假装成已决）

1. **320px 档没有安全余量**（实测）：列外余白＝0，最紧的三行余量 0.434px／0.512px／2.575px —— **未越界**，但字体或字号一改就可能推出去。⇒ 纳入后续字体验收（脚本已能给数）。
2. **URL 有长度预算**：关于页仓库链接是等宽 `.about-repo`，步进 **7.7031px/字符** ⇒ 320/360 **单行上限 37 字符**（现 30 字符、单行余 55.309px；38 字符起折行；再长也不溢出）。⇒ 以后换 URL 或改字号要重量。
3. 详情页 1180 上正文行长 **55.4 字位**是否设限 ⇒ **未决**，等用户偏好。
4. 内置 `detail` 的 6 首为 `null` ⇒ **内容事实**（见 §4），非缺口。
5. ~~两端「标记后空白边缘」不一致~~ ⇒ **本轮已修（不是留着的小提案）**：这不是假想边缘，是**可达的分叉** —— 编译器与 Web 用 `\s+`、Android 要字面空格，`###\t甲`／`-\t甲`／`1.\t甲` **一端当标题/列表、另一端当段落**，而编译器**放行** ⇒ 产物真能到达两端；`-  甲` 的项文字与 `### 甲 ` 的尾空格也一端一差。现已：**把边界写进共同定义**（`schema/markdown-subset.json` 的 `boundary` ＋ `content-contract.md` §1.0）、**三端同一套判据**（compiler `classifyLine`／`web/app/render.js`／`android/.../Markdown.kt`，文字一律不 trim）、**不合规形式统一越界拒绝**（新码 `MD_MARKER_FORM`；`##\t` 不再是节分界）。**正反例 30 例固定在 `tests/fixtures/contract/md-boundary.json`，编译器／Web／Android 三方同读**。
   **证据**：Web 对照 **204/204**（含这 30 例）、Android **146/146**、编译器 **6/6**；**证伪**：把 Web 的 `RE_H3` 换回收严前的 `\s+` ⇒ 立刻**红在恰好那两例**（`###\t甲`、`### `）。**未让用户选空格/Tab 算法**，也没有把它归成小提案放着。
6. 关于页是否显示「来源」、失败态是否换色 ⇒ **用户未选**，现按「不显示／不换色」实现。
7. **关于页「初态只按钮」那张图是 instrumented 的（引用时别弄错）**：一进应用就自动 `checkForUpdate()`，`Idle` 窗口比一次 `screencap` 还短 ⇒ 原包上截不到；该图由**临时注释一行、未提交**的构建截得，**截完已 revert ＋ 重建（位级同 sha）＋ 重装原包**；文件名与 README 均带 `INSTRUMENTED`，**不得**当成原包直接截图。旁证（不依赖该图）：源码守卫 `if (updateStatus !is Idle) { … }` ＋ 块高算术（有状态时链接 top＝708、Idle 时 638 ⇒ **Δ70px 整个消失**）。
8. **一条未复现的观察（只记账，不当缺陷）**：复核时**第一次**冷启动后的一条 `input tap`（坐标只可能落在组头）把屏幕带到**关于页**（其 dump 与随后正常到达的关于页 dump **逐字节相同** ⇒ 是稳定页，不是半渲染态）。**受控复跑 6 次全部正常**，期间无 crash/ANR。⇒ **不据此宣称「目录页会乱跳」**；原文与产物见 `…/90-ANOMALY-first-tap-landed-on-about.*` 与 README §6。再有人复现再当缺陷追。
9. **~~页脚诊断面板（用户实际预览发现）~~ ⇒ 已修（不是留下的小瑕疵）**：整块「站点资源版本／缓存名／SW／内容体积与取到时间／格式／次序／网络／持久化配额」＋三个调试动作（检查站点更新／请求持久化存储／重新取内容）＋长诚实说明，**四页都在**。它是 Web 骨架期的开发/核验脚手架，**不属于已采纳的页面集合**（`IF-46`：目录／诗／详情／关于）⇒ 已**整块从产品 UI 移除**（`web/index.html` 去掉页脚与外壳版本徽标＝**版本只在关于页**；`main.js` 删 `renderStatus()` 与那三个动作；`styles.css` 删 `.status*`／`.app-version`）。**不是** CSS 隐藏、没移进关于页、没加开发者入口。
   **机制一个没删**（否则就是为截图删功能）：SW 离线缓存、后台更新检测、「有新版本→点刷新」必要提示、加载/失败可见反馈照旧；诊断事实改由测试钩子 `window.__app.summary()`（非产品 UI）读取。
   **断言改成查整份文档，不是某个 `view` 子树**（此前那条查 `view-about` 后代的负向断言就**恒真**过）：e2e §1c-3 对四页逐个断言 14 个诊断词汇不存在、`<footer>` 数 0、status 元素 0、调试动作 0，**并带正向对照**（关于页确实显示 `v0.1.1`、目录确实渲染 19 首）⇒ 不会因「把版本/内容整个删掉」而假绿。证据：`web/tests/evidence/no-panel-{index,poem,detail,about}.png`（整页、先滚到底、我逐张看过）。
10. **顺带被 §6.9 暴露、并一并修掉的真缺陷**：`afterViewChange` 原来只等**一帧**再恢复目录滚动位置；之前是页脚面板的 DOM 写入恰好把布局顶完才显得正确。面板移除后，从诗页返回目录会**回到顶部**（e2e 实测：捕获 373、回来 0）⇒ 改成等**两帧**（`web/app/main.js`），e2e 那条断言随即恢复通过。
11. **~~全局外壳顶栏~~ ⇒ 已修（同轮，用户接着指出的第二处偏差）**：每页顶部还有一条 sticky 的「索斐」横栏（外壳 `.site-header`＋`site-title`）。采纳锚写着**目录页顶部只有「关于」这一个入口、不重复应用名**（`round-2026-10-15-hub-align/`；**Android 端也没有这条横栏**）⇒ 它在目录/诗/详情三页上都是**冗余产品壳**，已整块删除（`index.html` 删整个 `<header>`；`main.js` 删 `els.siteHeader` 与「关于页把它 hidden」那段；`styles.css` 删两条规则）。
    **没动**：关于入口、顶部返回（← 目录／← 返回这首诗）、详情导航；浏览器 `<title>` 与 `manifest.json` 名称照旧；关于页**自己的**应用名页标题（`about-app-name`）照旧——它是关于页内的页面标题，不是外壳品牌。
    **断言**：e2e 从「index.html 里有外壳顶栏」**反转为没有**；四页扫描新增「无 `.site-header`／`site-title`」；目录页断言**整页可见文本里「索斐」出现 0 次**、`index-bar` 里**只有「关于」一个入口**；关于页断言仍「索斐恰好一次」（那一份就是它自己的页标题）。

---

## 7. 授权边界（本阶段实际做了什么、没做什么）

- **已授权并已执行（S5）**：`git push`（`eb33f11..b738456`）、打/推 tag `v0.1.2+content-2026.10.16.23`、CI 正式签名构建、Pages 部署、建 GitHub Release、
  推进 Android 前馈清单（`content/latest.json` ⇒ `minAppVersionCode 3`）。**这五项都是用户为本次发布明确授权的**。
- **没做**：**没有**在本地读/打印签名私钥或口令（正式签名完全在 CI 用仓库 secrets 完成，本地只用 debug 变体演练）；
  **没有**造新 key/secret；**没有**安装到用户手机；**没有**碰其它项目的模拟器/设备。
- **重新打 tag 前删过同名远端 tag**（因为本次没发布成功就报了红、Release 步骤从未执行；已在本包与提交信息里披露）。
- **没有**把 debug 签名说成正式签名（§0b 的证书指纹与上版逐字相同）；**没有**把「构建成功」当成读诗体验通过。

---

## 8. 下一步

1. **用户看实际效果**：**线上站点 <https://wsqs.github.io/suofei/>**（已是 0.1.2；浏览器可能仍拿旧壳交给 Service Worker 后台更新——
   看到「有新版本」提示点刷新即可，或清除本站站点数据）。Android 用 Release 附件 `suofei-2026.10.16.23.apk` 覆盖安装（同签名 `CN=Suofei`）。
2. **下一版发布**：`APP_VERSION` 递增（0.1.3…）、`versionCode` **+1**（已定策略，不用公式）、新 `contentVersion` 递增、
   `release/notes/release-notes.md` 按需改，其余步骤同本次（`check-ready` 全绿 ⇒ 打 tag ⇒ CI）。
3. 若用户提出视觉调整（§6 的 1–3、6），按新反馈开一轮；**不主动开无穷原型**。
