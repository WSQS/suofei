# 接口决定清单（待用户确认）

> 2026-10-14 建立。依据 `docs/review-gates.md` v3：**接口性质的东西由用户拍板**。
> 判据：**如果明天要改它，是不是有别人也得跟着改？** 是 ⇒ 接口。
> 本文件是接口的**唯一汇总入口**：每条写明「暂定值、谁依赖它、改一次的代价、状态」。
> 状态含义：**已定**＝用户拍过板；**暂定**＝负责人定的草案，正在被使用（改动要连带返工）；**待补**＝等对应工作线报回后填入。

## 第一批：契约层接口（负责人起草，用户尚未确认）

| 编号 | 接口 | 暂定值 | 谁依赖它 | 改一次的代价 | 状态 |
|---|---|---|---|---|---|
| IF-1 | **一诗一 Markdown 的 front matter 字段与 ID 规则** | `docs/design/content-contract.md` §1：`id/title/author/dynasty/dynastyOrder/era/genre/source/variants/notes`；id 形如 `gushi-shijiu-shou-01` | 内容线正在按它写 **19 个真实文件**；编译脚本按它解析 | 改字段名 = 重写 19 个内容文件 + 编译脚本 + schema | 暂定（内容线已开工） |
| IF-2 | **`dist/content.json` 的读取接口**（两端唯一的读取入口） | 契约 §2：`formatVersion/contentVersion/generatedAt/dynasties[]/poems[]`，诗内含 `stanzas/notes/…` | Android 端读取、Web 端读取、编译脚本、JSON Schema、测试 | 改结构 = 两端代码 + 编译 + schema + 已缓存内容失效 | 暂定（C 线正在实现） |
| IF-3 | **分段表示**（正文分行与空行怎么表达） | `stanzas: 段数组，内层行数组`；空行 = 段边界 | 两端渲染（必须两端一致地保留分行与空行）、编译 | 两端渲染代码 + 编译 + 19 个文件的写法 | 暂定 |
| IF-4 | **排序键与「佚名排最后」** | 编译期算好 `authorSortKey/titleSortKey`（拼音 `Intl.Collator`）；未知作者在该组内排最后 | 两端列表顺序都照它，不自算 | 编译 + 两端（若两端各自算则要同步改） | 暂定 |
| IF-5 | **版本语义** | `formatVersion`（结构）与 `contentVersion`（内容）分开；比较规则待 C 线定死 | 更新检查、缓存键、两端降级行为 | 改了会让已更新过的客户端认不出新旧 | 部分待 C |
| IF-9 | **目录与模块边界** | `content/`（一诗一 MD）、`dist/`（编译产物，gitignore）、`tools/`+`schema/`+`tests/`、`android/`、`web/`、`prototype/`、`docs/` | 所有工作线 | 跨线同时改 | 已定（本行即记录） |

## 第二批：平台层接口（等 C/D/E 报回后填入）

| 编号 | 接口 | 状态 |
|---|---|---|
| IF-6 | 编译脚本 CLI 参数、退出码、产物路径 | 待 C |
| IF-7 | **更新检查协议**：远端文件格式与地址形态 | 待 D（Android）、E（Web） |
| IF-8 | **本地存储接口**：内容文件路径、版本记录方式、Cache 名与 localStorage 键 | 待 D、E |
| IF-10 | **Web 的 URL 形态**（可分享链接长什么样） | 待 E |

## 第三批：对外与发布接口

| 编号 | 接口 | 暂定值 | 状态 |
|---|---|---|---|
| IF-11 | 应用展示名 | **索斐** | **已定**（2026-10-14） |
| IF-12 | Android 包名 `applicationId` | **`dev.sopho.suofei`** | **已定**（2026-10-14） |
| IF-13 | GitHub 仓库名与 Pages 地址 | 默认 `suofei` → `https://wsqs.github.io/suofei/` | 待建仓时确认（A4.1，需单独授权） |
| IF-14 | 固定签名方案（keystore 位置、是否用 secrets） | 无 | 待正式发布前（A4.4） |
