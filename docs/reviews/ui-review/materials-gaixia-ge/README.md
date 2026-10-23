# 项羽《垓下歌》本地新增：核对材料与实测回执（2026-10-23）

> 工作树：`C:\Users\wsqsy\Documents\android\.sopho-wt\1-url-2-content-poems-md-tit-98defaaf`
> 分支：`wt/1-url-2-content-poems-md-tit-98defaaf`，基线提交 `a43f3d4`，**本批提交 `0e74de7`**（本文件与材料就在该提交里）
> **未 push、未 tag、未 Pages/Release、未动远端 latest**；应用版本 `0.1.4` / `versionCode 5` / `formatVersion 3` **均未变**。
> 来源、题名/时代口径、异文与未核项写在 [`docs/sources/xiang-yu-gaixia-ge-intake.md`](../../../sources/xiang-yu-gaixia-ge-intake.md)，本文只记**门与实测**。

## 0 本批改了什么（共 7 处写入）

| 文件 | 性质 |
|---|---|
| `content/poems/项羽/垓下歌.md` | **新增诗源**（`title: 垓下歌`、`author: 项羽`、`dynasty: 汉`、`genre: 楚歌`、`orderInSource: 20`、`tags` 不写⇒`[]`、`notes` 不写⇒`null`） |
| `docs/sources/xiang-yu-gaixia-ge-intake.md` | **新增**来源记录（作者/题名/时代口径/是否目验/异文未核） |
| `content/tracked-poems.json` | 由 `gen-tracked-poems-manifest` 重生成：**29 → 30 条** |
| `dist/content.json`（未跟踪产物） | 一次编译，`contentVersion=2026.10.23.1`（> 上一演练号 `2026.10.20.3`） |
| `android/app/src/main/assets/content/content.json` | 与 `dist` **同字节**复制（APK 内置） |
| `web/content.json`（gitignore 的本地产物） | 与 `dist` **同字节**复制（Web 端单独取） |
| `web/tests/e2e-cdp.mjs`、`android/.../ContentParserTest.kt` | **两处把「汉组＝《古诗十九首》19 首」写死的断言改成派生**（理由与不减弱说明见 §3） |

**未改**：现有 29 首的原文 / `source` / `id` / `orderInSource` / `tags`；分组注册表 `tools/lib/dynasties.mjs`；`APP_VERSION`；`CONTEXT.md`、`items/**`。

## 1 三份产物同字节（跑完所有会写产物的测试之后再核）

```
a5081749c5fd669c8c87804a6ff78ef9fbfe77301bb4b1123b5020fbe02c90dd  dist/content.json
a5081749c5fd669c8c87804a6ff78ef9fbfe77301bb4b1123b5020fbe02c90dd  android/app/src/main/assets/content/content.json
a5081749c5fd669c8c87804a6ff78ef9fbfe77301bb4b1123b5020fbe02c90dd  web/content.json
```

产物事实（从 `dist/content.json` 读回，不是从源文数）：`formatVersion=3`、`contentVersion=2026.10.23.1`、
`dynasties=汉/唐/近现代`、**30 首（汉 20 / 唐 4 / 近现代 6）**、标签 `古诗十九首:19` ＋ `唐诗三百首:3`、
新作 `tags: []`、`notes: null`、`stanzas` 1 段 2 行、`source` 里没有 `**`。

## 2 各门实测 exit（本树，见首页工作树与基线）

| 门 | 命令 | 结果 |
|---|---|---|
| 编译校验 | `node tools/build-content.mjs --check` | **exit 0**，30 首诗 / 3 个分组 |
| 单调性 | `node tools/build-content.mjs --content-version 2026.10.23.1 --previous-version 2026.10.20.3` | **通过**：2026.10.20.3 → 2026.10.23.1 |
| 主测试 | `npm test` | **exit 0**，`tests 210 / pass 210 / fail 0 / skipped 0` |
| 字段集门 | `node tools/check-fieldset.mjs` ＋ `--content content` | 两条都 **exit 0**（28 条路径，指纹 `1ec5811d9c04…`） |
| 内置一致性 | `node tools/check-bundled-content.mjs` | **exit 0**，已查 2 处（Android 内置 + Web 本地），诗=30、带详情=18 |
| Web e2e | `node web/tests/e2e-cdp.mjs` | **exit 0**，**通过 612 / 612** |
| Android 单测 | `./gradlew testDebugUnitTest` | **BUILD SUCCESSFUL**，**175 用例 / 0 失败 / 0 跳过**（`ContentParserTest` 32 条） |
| 打包 | `./gradlew assembleDebug` | **BUILD SUCCESSFUL**，`app/build/outputs/apk/debug/app-debug.apk` |

> 备注：本树本无 `node_modules`（`npm test` 首跑报 `ERR_MODULE_NOT_FOUND: ajv`），已在本树 `npm ci` 装齐 5 个包后重跑；**未动主树的 `node_modules`**。

**在提交 `0e74de7` 上复跑（无写）**：`build --check` =0、`check-fieldset` =0、`check-fieldset --content content` =0、`check-bundled` =0、`npm test` 210/210 =0；三份 sha 复核仍为 `a5081749…`（工作树 `git status` 干净）。Web e2e 612/612 与 Android 175 例是在同一份源上、提交前跑的（本提交未改它们的输入）。

## 3 改了两处测试：为什么改、有没有改弱

两条断言原先写死「**汉组 ＝《古诗十九首》19 首**」。汉组进了第 20 首（《垓下歌》，`orderInSource: 20`，**无标签**）后它们必然红——那是**把批次当永久契约**，不是内容错了。

改法是**换成派生 ＋ 加牙齿**，不是放宽：

- **Web e2e（`web/tests/e2e-cdp.mjs`）**：`SOURCE_ORDER_TITLES`（《文选》卷二十九原次序）**保留**，但只用来钉**《古诗十九首》这一子集**：
  - 新增 `sourcePoemsOfDynasty(label)`（直接从 `content/poems/**` 前端派生，不借产物自证）；
  - 汉组次序断言改为「== 源文按 `orderInSource` 升序」＋「源侧 `orderInSource` 非空且唯一」（否则是空断言）；
  - 新增两条：**产物 `tags[]` 里「古诗十九首」的成员次序 == 《文选》原次序（19 首）**、**汉组里带该标签的子集相对次序 == 《文选》原次序**（追加不得插队、不得重排）。
  - 断言总数 **608 → 612**（净增 4 条），全绿。
- **Android 单测（`ContentParserTest.kt`）**：同样改为 `ContentSources.orderedPoemsOfDynasty("汉")` 派生（诗数 / 题名次序 / `orderInSource` 逐条），并新增：**《古诗十九首》子集在汉组的相对次序 == 标签 members**、**首末仍是 行行重行行／明月何皎皎**、**该子集 `orderInSource` 仍是 1..19**。175 用例全绿。

## 4 设备实测（`emulator-5556`，只 debug）

身份与占用核对写在 [`DEVICE-IDENTITY.txt`](DEVICE-IDENTITY.txt)：起模拟器**之前** `adb devices` 只有别人的 `YOCTO` 与 `127.0.0.1:7666`（vext）；起之后**新出现**的 `emulator-5556` 才是我的；`adb -s emulator-5556 emu avd name` = **`Pixel_6`**（不是只凭序列号认 AVD）；每条命令都显式 `-s emulator-5556`，**从未按 `emulator-*` 模式杀进程**。装的只有 debug 包（`versionCode=5 / versionName=0.1.4`）。

| 图 | 实测内容 |
|---|---|
| `android-01-index-20-4-6.png` | 首屏 **汉 [20] 首 / 唐 [4] 首 / 近现代 [6] 首**（APK 内置产物读出来的就是 30 首） |
| `android-02-han-expanded-bottom.png` | 展开汉组滚到底：**明月何皎皎 → 垓下歌（项羽）**，即 20 首里的第 20 位 |
| `android-03-poem.png` | 读本诗：题名「垓下歌」、身份行「项羽 · 汉 · 楚歌」、正文 **2 行**（`力拔山兮气盖世，时不利兮骓不逝。` / `骓不逝兮可柰何，虞兮虞兮柰若何！`）、**没有「笔记」入口**（notes 为 null） |
| `android-04-detail-source.png` | 详情页：「底本与来源」**可见**（`source` 全文），下接「题名」 |
| `android-05-detail-era-xiewen.png` | 详情页滚到底：「时代归属」写清**这是本库分组、不宣称作者是汉朝臣民**；「异文」四条为列表 |
| `android-06-back-to-han-state.png` | 两次系统返回后**回到原朝代视图与状态**：汉组仍展开、滚动位置仍在底部、垓下歌仍在末行、唐/近现代仍收起 |
| `android-07-tags-gushi.png` | 标签页「古诗十九首」仍是《文选》原次序、**不含垓下歌**（新作无标签） |
| `android-dump-*.xml` | 上述状态对应的 `uiautomator dump`（诗页 / 详情底部 / 返回后目录） |

⚠ **两处设备副作用，如实记下**：
1. 该 AVD 上原先装着旧 `dev.sopho.suofei`，其**应用数据里有一份更早的下载内容**（首装截图 `00` 显示 汉19/唐3/近现代6）。为确保核的是**本次 APK 内置产物**，执行了 `pm clear dev.sopho.suofei`（**清掉的是那份旧下载内容**，不可恢复）；之后重开即读到 30 首。
2. 该模拟器**原本没在运行**，是本会话用 `-avd Pixel_6 -port 5556 -no-snapshot` 冷启的；收尾按精确序列号关闭。

## 5 Web 预览（新 origin）＋我看过的图

```
URL  : http://127.0.0.1:8177/
root : C:\Users\wsqsy\Documents\android\.sopho-wt\1-url-2-content-poems-md-tit-98defaaf\web
cwd  : C:\Users\wsqsy\Documents\android\.sopho-wt\1-url-2-content-poems-md-tit-98defaaf
PID  : 43225  (node web/scripts/serve.mjs --port 8177 --root web)
JSON : GET http://127.0.0.1:8177/content.json 的 sha256 = a5081749c5fd669c8c87804a6ff78ef9fbfe77301bb4b1123b5020fbe02c90dd（与 dist 同字节）
```

| 图 | 实测内容 |
|---|---|
| `web-01-index-20-4-6.png` | 目录：汉 [20] 首 / 唐 [4] 首 / 近现代 [6] 首 |
| `web-02-poem.png` | `#/p/项羽-垓下歌` 深链接直开：项羽 · 汉 · 楚歌、正文 2 行、无笔记入口 |
| `web-03-detail.png` | `#/p/项羽-垓下歌/detail`：底本与来源 / 题名 / 体裁 / 时代归属 / 异文 全部渲染 |

## 6 已核 / 未核

**已核（本次真跑过）**：§2 全部门的 exit；三份产物同字节；设备上目录 20/4/6、本诗 2 行、详情 `source` 可见、无笔记、返回保留朝代视图与滚动位置、标签子集不含新作；Web 预览经真取的 `content.json` sha 与 `dist` 一致。

**未核（不许当成已通过）**：
- 任何**影像**：《史记》卷七的纸本/影印点校本（如中华书局本）**未目验**，三份见证都是电子转录或影印 OCR（详见 intake §2、§4）。
- 「柰 / 奈」的**版本判定**：三份见证 2:1 分裂，本仓从「柰」；未目验任何印本。
- 《乐府诗集》等是否另收此题、题作何名：**未核**，故不写别名。
- Android **未做**发布包（release 签名）验证；只 debug。
- 未做**离线首装 / 更新流程 / 删除作品 / 阅读中延期切换**等发布级验收（本批不涉及更新与发布）。
- 模拟器**不是真机**：观感（深色长文阅读疲劳等）**不由此证明**。
