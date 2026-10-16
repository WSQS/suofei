package dev.sopho.suofei

import dev.sopho.suofei.ui.AboutFields
import dev.sopho.suofei.ui.CONTENT_VERSION_NOT_LOADED
import dev.sopho.suofei.ui.looksLikeVersionNumber
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 「关于」页（原「更新页」改名）两端**同一批字段**：**唯一来源 `web/about-fields.json`**。
 *
 * 应用运行期读不到那个文件（它不是 APK 资源），所以 Android 侧有一份运行时副本（[AboutFields]）——
 * 这里读文件与它**逐项比对**（读不到文件即失败，不跳过）。与 `UnknownAuthorsSourceTest`
 * 对着 `schema/unknown-authors.json` 是同一套纪律：改字段集＝改那个文件，然后两端同步。
 *
 * 字段的**值**是平台相关的（Android 的版本号是 APK 版本），所以这里只比 `appName`／`repoUrl`／
 * 字段标签，不比值。
 *
 * ⚠ 2026-10-16 **同步到位**（此前本端落后一轮）：采纳锚＝用户 `q-9f9eca3d` 的 **4 项**
 * （应用名／应用版本／内容版本／仓库链接）。原来的 5 项里有「一句话说明」与「诚实的限制」，
 * 两条都**未采纳** ⇒ 已从 `AboutFields.LABELS` 与关于页上删掉（Web 的 `about-fields.json`
 * 在 `3394fd5` 就已改成 4 项，本端这次跟上）。这里同时钉住「**不再**渲染那两条」。
 */
class AboutFieldsTest {

    private val spec = JSONObject(
        TestRepoFiles.read(
            "web/about-fields.json",
            "Android 的 AboutFields 要与 Web 的「关于」页同一批字段；缺了它就说明两棵树没对齐。",
        ),
    )

    @Test
    fun appNameAndRepoUrl_matchTheSharedSource() {
        assertEquals(spec.getString("appName"), AboutFields.APP_NAME)
        // 仓库链接＝**与 Web 同一来源**：唯一来源是该文件的 `repoUrl`，两端各持一份运行时副本
        // （Android 是 `AboutFields.REPO_URL`，Web 是 `app/config.js` 的 `ABOUT.repoUrl`）。
        // 本端读不到那个文件（不是 APK 资源）⇒ 只能硬编码，靠这条断言把它钉回唯一来源。
        assertEquals(spec.getString("repoUrl"), AboutFields.REPO_URL)
        assertTrue("应是 https 的完整 URL（C1）", AboutFields.REPO_URL.startsWith("https://"))
    }

    @Test
    fun fieldLabels_areExactlyTheSharedFieldSet_inOrder() {
        val arr = spec.getJSONArray("fields")
        val fromFile = (0 until arr.length()).map { arr.getString(it) }
        assertEquals("字段集（顺序也要一致）", fromFile, AboutFields.LABELS)
        assertEquals(listOf("应用名", "应用版本", "内容版本", "仓库链接"), AboutFields.LABELS)
        // 「内容版本」是**收窄后**的标签（原「内容版本与来源」），值里也**不带**「来源：」
        assertTrue("标签应已收成「内容版本」", AboutFields.LABELS.contains("内容版本"))
        assertFalse("不该再有「内容版本与来源」", AboutFields.LABELS.contains("内容版本与来源"))
    }

    @Test
    fun onlyTheVersionNumberItselfIsMonospaced_theNotLoadedFallbackIsNot() {
        // 采纳锚 `about-min`（用户 2026-10-15/16）：值列里**只有版本号本身**走等宽（`.ver`），
        // 说明文字走常规字（`.v`）。对话侧 2026-10-16 确认：**这条钟也适用于未载入兜底**，
        // 「尚未载入」是一句说明、不是版本号 ⇒ 必须落常规字（不是「等宽里夹汉字」）。
        assertTrue("0.1.1 是版本号", looksLikeVersionNumber("0.1.1"))
        assertTrue("2026.10.16.22 是版本号", looksLikeVersionNumber("2026.10.16.22"))
        assertFalse("未载入兜底不是版本号（汉字开头）", looksLikeVersionNumber(CONTENT_VERSION_NOT_LOADED))
        assertEquals("尚未载入", CONTENT_VERSION_NOT_LOADED)
        // 也钉住源文件层面：值列的样式来自**值本身**，不是调用方写死 mono 参数
        // —— 否则以后任何非版本号的兜底文案又会被涂成等宽。
        // ⚠ 这里断言的是**函数签名**（无 `mono` 参数）而不是搜字符串 «mono = true»：
        //    后者会命中本函数上方那段**注释**里的同一个字样，变成一条永远为假的断言（我自己踩过）。
        val screens = TestRepoFiles.read(
            "android/app/src/main/java/dev/sopho/suofei/ui/Screens.kt",
            "「关于」页在 Screens.kt 里",
        )
        assertTrue(
            "版本行不再接收 mono 参数（样式改由值本身决定）",
            screens.contains("private fun KeyValueRow(label: String, value: String) {"),
        )
        assertTrue("版本行的样式应由 looksLikeVersionNumber(value) 决定", screens.contains("looksLikeVersionNumber(value)"))
    }

    @Test
    fun aboutScreen_rendersTheSharedFields_andTheAndroidUpdateBlock() {
        // 「这一页确实放了这些字段」的代码级检查：AboutScreen 用 AboutFields 渲染每一行。
        val screens = TestRepoFiles.read(
            "android/app/src/main/java/dev/sopho/suofei/ui/Screens.kt",
            "「关于」页在 Screens.kt 里",
        )
        // 字段集 4 项都要真的落到页面上：
        //   ①「应用名」→ 页标题（采纳锚 A3：应用名当页标题，不另画标签行）＝ `AboutFields.APP_NAME`
        //   ②「应用版本」③「内容版本」→ 版本相邻组的两个**标签行**，标签直接取 `LABELS[…]`
        //   ④「仓库链接」→ 置底的**完整 URL 文本**＝ `AboutFields.REPO_URL`（采纳锚 C1，也不另画标签行）
        assertTrue("AboutScreen 要用 AboutFields.APP_NAME 当页标题", screens.contains("AboutFields.APP_NAME"))
        for (i in 1..2) {
            assertTrue("AboutScreen 没有渲染 AboutFields.LABELS[$i]", screens.contains("AboutFields.LABELS[$i]"))
        }
        assertTrue("AboutScreen 要用 AboutFields.REPO_URL 置底", screens.contains("AboutFields.REPO_URL"))
        assertTrue("Android 的关于页要有检查更新动作", screens.contains("onCheckUpdate"))
        // ⚠ 2026-10-16 起「更新源地址」不再显示（用户 `q-9f9eca3d` 没把它列进共用信息）。
        // 地址本身仍由 `UpdateEndpointTest` 逐字钉住（那条是**更新接口**的地址，与仓库链接不是一回事）。
    }

    @Test
    fun aboutScreen_noLongerRendersTheTwoUnadoptedEntries() {
        // 如实钉住「删掉的两条」：它们在共享字段集里**没有**，在关于页上也**不再**渲染。
        val screens = TestRepoFiles.read(
            "android/app/src/main/java/dev/sopho/suofei/ui/Screens.kt",
            "「关于」页在 Screens.kt 里",
        )
        assertFalse("共享字段集里不该再有「一句话说明」", AboutFields.LABELS.contains("一句话说明"))
        assertFalse("共享字段集里不该再有「诚实的限制」", AboutFields.LABELS.contains("诚实的限制"))
        assertFalse("关于页不该再渲染「一句话说明」（TAGLINE 已删）", screens.contains("TAGLINE"))
        assertFalse(
            "关于页不该再渲染「诚实的限制」（ABOUT_LIMITS_ANDROID 已删）",
            screens.contains("ABOUT_LIMITS_ANDROID"),
        )
        // 也钉住源文件层面：那个常量连同它的文案在本端已整体撤掉（不是留着不用）。
        val content = TestRepoFiles.read(
            "android/app/src/main/java/dev/sopho/suofei/ui/ScreenContent.kt",
            "关于页的共享字段集在 ScreenContent.kt 里",
        )
        assertFalse("ABOUT_LIMITS_ANDROID 常量应已删除", content.contains("const val ABOUT_LIMITS_ANDROID"))
        assertFalse("TAGLINE 常量应已删除", content.contains("const val TAGLINE"))
    }
}
