package dev.sopho.suofei.ui

import dev.sopho.suofei.data.Poem

/**
 * 各页面的**纯内容**（可被 JVM 单测直接断言的「这一页放了什么」）。
 *
 * 为什么单独一个文件：界面（`Screens.kt`）只负责把这些值摆到 Compose 上，值本身在这里，
 * 于是「诗页题下那行是什么」「详情页有哪些异文」这类事实**不靠人看**也能被单测钉住。
 * 用户 2026-10-15 把页面集合定为 **目录 / 诗 / 诗歌详情 / 关于** 四页，本文件服务于后两个新页。
 */

/**
 * 诗页题下那行：**时代 · 作者 · 年代 · 体裁**（与 Web `renderPoemPage` 同一口径与顺序）。
 *
 * 端上原来把作者单占一行、题下那行只有「时代·年代·体裁」；用户 2026-10-15 的页面清单
 * 写的是四者一行，Web 也早就是一行 ⇒ 这里统一成同一句（两端守同一句话）。
 */
fun poemMetaLine(poem: Poem): String =
    listOfNotNull(poem.dynastyLabel, poem.author, poem.era, poem.genre).joinToString(" · ")

/**
 * 「关于」页的共享字段集 —— **唯一来源 `web/about-fields.json`**（机器可读，跨端用）。
 *
 * 应用运行期读不到那个文件（它不是 APK 资源），所以这里写一份**运行时副本**；
 * 单测 `AboutFieldsTest` 读文件与这里**逐项比对**（读不到文件即失败，不跳过）——与
 * `Data` 侧的 `ANONYMOUS_AUTHORS` 对着 `schema/unknown-authors.json` 是同一套纪律。
 * 字段的**值**是平台相关的（Android 的版本号是 APK 版本、限制写的是 Android 的限制），
 * 这里只钉「同一批字段」。
 */
object AboutFields {
    const val APP_NAME = "索斐"
    const val TAGLINE = "个人诗歌阅读（离线可读）。"
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
