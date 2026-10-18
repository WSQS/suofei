package dev.sopho.suofei.ui

import dev.sopho.suofei.data.Poem

/**
 * 各页面的**纯内容**（可被 JVM 单测直接断言的「这一页放了什么」）。
 *
 * 为什么单独一个文件：界面（`Screens.kt`）只负责把这些值摆到 Compose 上，值本身在这里，
 * 于是「诗页题下那行是什么」「关于页有哪些字段」这类事实**不靠人看**也能被单测钉住。
 * 页面集合＝**目录 / 诗 / 诗歌详情 / 关于** 四页（用户 2026-10-15 定）。
 */

/**
 * 诗页题下那行（身份行）：**作者 · 朝代 · 体裁**。
 *
 * 采纳锚（诗页 P1 基线，`round-2026-10-15-poem-expression` 与 `…-detail`／`…-width-pct` 都这么写）：
 * 内容＝作者 · 朝代 · 体裁，`0.78rem`／`--text-faint`。
 * **细时代（如「东汉末」）不上阅读页**（用户已定）；新字段形状里连 `era` 键都没有了。
 * 组名/朝代用的是**中文单值** `poem.dynasty`（与顶层 `dynasties` 精确匹配）。
 *
 * ⚠ 一处**历史口径差异（已收敛，留痕）**：原型轮 `items/content-format/prototypes/rules-v4/expectations.json`
 * （**历史快照，已不是测试输入**）的 Web 那一列写的是 `dynasty · author · genre`（朝代在前），而采纳锚写的是
 * **作者 · 朝代 · 体裁**。**两端现已都按采纳锚实现**（本端 `poemMetaLine` 与 Web `render.js` 的
 * `[poem.author, poem.dynasty, poem.genre]` 都是作者在前）⇒ **该差异已不成立**，此处只作留痕。
 */
fun poemMetaLine(poem: Poem): String =
    listOfNotNull(poem.author, poem.dynasty, poem.genre).joinToString(" · ")

/**
 * 「关于」页的共享字段集 —— **唯一来源 `web/about-fields.json`**（机器可读，跨端用）。
 *
 * 应用运行期读不到那个文件（它不是 APK 资源），所以这里写一份**运行时副本**；
 * 单测 `AboutFieldsTest` 读文件与这里**逐项比对**（读不到文件即失败，不跳过）——与
 * Data 侧的 `ANONYMOUS_AUTHORS` 对着 `schema/unknown-authors.json` 是同一套纪律。
 * 字段的**值**是平台相关的（Android 的版本号是 APK 版本），这里只钉「同一批字段」。
 *
 * ⚠ 2026-10-16 **同步到位**（此前本端落后 Web 一轮，现已对齐同一采纳锚）：用户 `q-9f9eca3d`
 * 定的共用信息＝**应用名／应用版本／内容版本／仓库链接**（4 项），并明确「没有因此采纳介绍文案
 * 或长篇限制说明」。随之本端：
 * - **删掉两行**：未采纳的「一句话说明」（原 `TAGLINE`）与「诚实的限制」（原 `ABOUT_LIMITS_ANDROID`）；
 *   标签「内容版本与来源」收成「**内容版本**」（值里本就没有「来源：」，见 `AppState.contentVersionText`）。
 * - **仓库链接与 Web 用同一来源**：唯一来源仍是 `web/about-fields.json` 的 `repoUrl`，两端各持一份
 *   运行时副本（这里是 [REPO_URL]，Web 是 `app/config.js` 的 `ABOUT.repoUrl`），各自的测试对着那个
 *   文件比（`AboutFieldsTest.appNameAndRepoUrl_matchTheSharedSource`）。本端**读不到**该文件
 *   （它不是 APK 资源）⇒ **只能硬编码**，这正是「唯一来源在文件、副本在代码、测试做比对」那套
 *   纪律的适用场景（与 Data 侧 `ANONYMOUS_AUTHORS` 对着 `schema/unknown-authors.json` 同理）。
 * - ⚠ **「诚实的限制」原文在本端整段撤掉，不是在别处保留**：Web 那侧它另有去处（仍留在**页脚状态
 *   面板**里，见 `web/app/config.js` 的 `HONEST_STORAGE_NOTE`），而 **Android 没有这样的页脚/状态
 *   面板**（原页脚已按采纳锚移除，诗页/目录页都没有页脚行）⇒ 这段 Android 专有文案在 APK 里
 *   **不再出现在任何位置**。已在交付报告里点名（不静默）。
 *
 * 排布沿用采纳锚（A3／V3，`round-2026-10-16-about-min`）：**应用名当页标题 → 版本相邻组（标签左
 * 对齐、一行一条）→ 更新块 → 仓库链接置底（完整 URL）**。因此 `LABELS[0]`「应用名」与
 * `LABELS[3]`「仓库链接」在本端**不作为标签行画出**（分别是页标题与置底的 URL 文本）；Web 的
 * 关于页则 4 项都带标签行 —— 这是两端**排布**的差异，共享字段集只钉「同一批字段」，不钉怎么画。
 */
object AboutFields {
    const val APP_NAME = "索斐"

    /** 仓库链接（用户 `q-9f9eca3d` 定的共用信息之一；C1＝**完整 URL 的链接**：
     *  文字就是这条完整 URL、**可点**，点了用外部应用（浏览器）打开；不加「在浏览器打开」提示）。 */
    const val REPO_URL = "https://github.com/WSQS/suofei"

    /** 共享字段集（顺序与 `web/about-fields.json` 的 `fields` 一致；单测逐个比对）。 */
    val LABELS = listOf("应用名", "应用版本", "内容版本", "仓库链接")
}

/**
 * 值是不是**版本号本身** —— **只有它**走等宽（采纳锚 `about-min`：值列里 `.v` 是常规字，只有 `.ver` 是等宽）。
 *
 * 判据：**以数字开头**。本项目的版本形如 `0.1.1`／`2026.10.16.22`；
 * 而**说明文字**（如未载入兜底 [CONTENT_VERSION_NOT_LOADED]）以汉字开头 ⇒ 自动落常规字。
 * ❓ 为什么由**值本身**判定而不是调用方写死：写死 `mono = true` 时，任何非版本号的兜底文案
 * 都会被涂成等宽字（2026-10-16 对话侧确认：这条钟也适用于未载入兜底，汉字不作为版本号）。
 */
fun looksLikeVersionNumber(value: String): Boolean =
    value.isNotEmpty() && value.first().isDigit()

/** 内容**尚未载入**时版本值的兜底文案。⚠ 它**不是版本号**（汉字开头）⇒ 按常规字呈现，见 [looksLikeVersionNumber]。 */
const val CONTENT_VERSION_NOT_LOADED = "尚未载入"

/**
 * 顶部行/详情页里的固定控件文案（原型逐字）：`返回` / `详情` / `笔记`。
 * 笔记入口的记号随展开状态翻（`[+]笔记` ↔ `[−]笔记`）——见 [noteEntryLabel]。
 */
const val LABEL_BACK = "返回"
const val LABEL_DETAIL = "详情"
const val LABEL_NOTE = "笔记"

/** 笔记入口文案：`[+]笔记`（收起）／`[−]笔记`（展开）。记号只表达状态。 */
fun noteEntryLabel(expanded: Boolean): String =
    (if (expanded) PoetryTokens.MARKER_EXPANDED else PoetryTokens.MARKER_COLLAPSED) + LABEL_NOTE

/** 详情页来源块上的标签（原型 D0 的 ① 档：来源前带标签）。 */
const val LABEL_SOURCE_BLOCK = "底本与来源"

/**
 * 目录页顶部两个 tab 的文字（原型逐字：**「朝代 ｜ 标签」**）。
 * 竖线不是文本：原型用 tab 之间的间距与选中下划线分隔，这里同样不把「｜」画成字。
 */
const val LABEL_TAB_DYNASTY = "朝代"
const val LABEL_TAB_TAG = "标签"

/** 产物里没有详情正文时的**如实**空状态（不编内容、不留空白让人以为没加载出来）。 */
const val DETAIL_EMPTY_HINT = "这一首在产物里没有详情正文。"
