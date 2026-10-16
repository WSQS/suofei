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
 * ⚠ 一处**两端待统一的口径**（如实记下）：`items/content-format/prototypes/rules-v4/expectations.json`
 * 的 Web 那一列写的是 `dynasty · author · genre`（朝代在前），而诗页/详情页/宽度的采纳锚与本端任务书
 * 都写的是 **作者 · 朝代 · 体裁**。本端按**采纳锚**实现；两端要统一时改这一处即可。
 */
fun poemMetaLine(poem: Poem): String =
    listOfNotNull(poem.author, poem.dynasty, poem.genre).joinToString(" · ")

/**
 * 「关于」页的共享字段集 —— **唯一来源 `web/about-fields.json`**（机器可读，跨端用）。
 *
 * 应用运行期读不到那个文件（它不是 APK 资源），所以这里写一份**运行时副本**；
 * 单测 `AboutFieldsTest` 读文件与这里**逐项比对**（读不到文件即失败，不跳过）——与
 * Data 侧的 `ANONYMOUS_AUTHORS` 对着 `schema/unknown-authors.json` 是同一套纪律。
 * 字段的**值**是平台相关的（Android 的版本号是 APK 版本、限制写的是 Android 的限制），
 * 这里只钉「同一批字段」。
 *
 * ⚠ **一处已记录的偏离（需两端同批改，本端不单方面改）**：用户 `q-9f9eca3d` 定的共用信息是
 * **应用名、应用版本、内容版本、仓库链接**，并明确「没有因此采纳介绍文案或长篇限制说明」；
 * 而这份共享字段集里仍有「一句话说明」与「诚实的限制」。删它们＝改**跨端契约**（要同时改
 * `web/about-fields.json`、Web 端与 Web 的 e2e），属「先协调、再同步」，所以本端只按采纳锚改了
 * **排布**（V3／无框／初态只按钮／仓库链接置底／版本组不带「来源」），字段集原样保留。
 */
object AboutFields {
    const val APP_NAME = "索斐"
    const val TAGLINE = "个人诗歌阅读（离线可读）。"

    /** 仓库链接（用户 `q-9f9eca3d` 定的共用信息之一；C1＝显示**完整 URL**，不加「在浏览器打开」提示）。 */
    const val REPO_URL = "https://github.com/WSQS/suofei"

    val LABELS = listOf("应用名", "一句话说明", "应用版本", "内容版本与来源", "诚实的限制")
}

/**
 * Android 端「诚实的限制」原文：**沿用现有说明，不新写**。
 * 只做了一处**事实更正**：把「见诗页底部」改成「见诗歌详情页」——底本与来源在 2026-10-15
 * 已从诗页搬到诗歌详情页（`IF-47`），照旧写「诗页底部」就成了假话。
 */
const val ABOUT_LIMITS_ANDROID =
    "说明：更新只替换内容数据，不安装新 APK；应用代码升级只提示下载（本版未实现下载 APK）。\n" +
        "内置内容＝本次发布的完整内容（随 APK 打包，首次断网即可读）；每首诗的底本与来源见诗歌详情页。"

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

/** 产物里没有详情正文时的**如实**空状态（不编内容、不留空白让人以为没加载出来）。 */
const val DETAIL_EMPTY_HINT = "这一首在产物里没有详情正文。"
