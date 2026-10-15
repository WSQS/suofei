package dev.sopho.suofei

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 四个页面在**代码层**对得上用户 2026-10-15 的页面清单（本机不跑模拟器，所以这是源码级的门，
 * 不是「观感验证」）。行为级的转移在 `AppStateNavigationTest`，内容级的在 `PoemDetailContentTest`。
 *
 * ⚠ 它是**结构守卫**，不是渲染验证：它只能证明「诗页的代码里不再引用 variants / poem.source」
 * 这种「有没有接线」的事实。观感与真机行为仍需模拟器验收（用户已定验收基准＝模拟器）。
 */
class ScreenInventoryTest {

    private val raw = TestRepoFiles.read(
        "android/app/src/main/java/dev/sopho/suofei/ui/Screens.kt",
        "四个页面都在 Screens.kt 里",
    )

    /** 去掉注释再扫——注释里可以随意提到 `variants` 这类词（说明性文字不算渲染）。 */
    private fun codeOnly(text: String): String = text
        .replace(Regex("""/\*.*?\*/""", RegexOption.DOT_MATCHES_ALL), "")
        .lines()
        .filterNot { it.trim().startsWith("//") || it.trim().startsWith("*") }
        .joinToString("\n")
        .replace(Regex("""//.*"""), "")

    private val code = codeOnly(raw)

    /** 取某个 Composable 的函数体（到下一个 `@Composable` 注解为止）。 */
    private fun body(name: String): String {
        val start = Regex("""fun\s+$name\s*\(""").find(code)?.range?.first
            ?: throw AssertionError("Screens.kt 里找不到 $name")
        val next = Regex("""\n@Composable""").find(code, start)?.range?.first ?: code.length
        return code.substring(start, next)
    }

    @Test
    fun exactlyFourScreens_exist_andTheOldUpdateScreenIsGone() {
        for (name in listOf("LibraryScreen", "PoemScreen", "PoemDetailScreen", "AboutScreen")) {
            assertTrue("缺少页面 $name", code.contains("fun $name("))
        }
        assertFalse("「更新页」已改名为「关于页」：不该再叫 UpdateScreen", code.contains("UpdateScreen"))
    }

    @Test
    fun poemScreen_showsNoVariantsAndNoSource() {
        val poem = body("PoemScreen")
        assertFalse("诗页不得出现异文（variants）", poem.contains("variants"))
        assertFalse("诗页不得出现底本/来源（poem.source）", poem.contains("poem.source"))
    }

    @Test
    fun poemScreen_hasTheDetailEntry() {
        assertTrue("诗页要有「详情」入口", body("PoemScreen").contains("onDetail"))
    }

    @Test
    fun poemDetailScreen_rendersSourceAndEveryVariantField() {
        val detail = body("PoemDetailScreen")
        assertTrue("详情页要有底本与来源（poem.source）", detail.contains("poem.source"))
        assertTrue("详情页要渲染异文（poem.variants）", detail.contains("poem.variants"))
        assertTrue("详情页要渲染异文文本（variant.text）", detail.contains("variant.text"))
        assertTrue("详情页要渲染异文 note（variant.note）", detail.contains("variant.note"))
        assertTrue("详情页要有「异文」标题", detail.contains("\"异文\""))
        // 遍历**全部**（不是只取第一条 / 只画一个代表）。无设备时的最强牙：产物那边有 24 条，
        // 渲染这边必须是对 variants 的遍历。
        assertTrue(
            "详情页要遍历全部异文（variants.forEach…），不是只取第一条",
            Regex("""variants\s*\.\s*forEach""").containsMatchIn(detail),
        )
    }

    @Test
    fun libraryScreen_offersTheAboutEntry_andKeepsTheGroupCardStatic() {
        assertTrue("目录页要有「关于」入口", body("AppRoot").contains("openAbout"))
        val library = body("LibraryScreen")
        assertFalse("IF-44（组可折叠）本版不做：组头保持静态卡片，不得加点击", library.contains("clickable"))
        assertFalse("目录行不得再有「有笔记」标记", library.contains("有笔记"))
        assertFalse("目录行不得再有「有笔记」标记（PoemRow 同看）", body("PoemRow").contains("有笔记"))
    }

    @Test
    fun aboutScreen_carriesTheSharedFieldSet_andTheAndroidUpdateBlock() {
        val about = body("AboutScreen")
        for (i in 0..4) {
            assertTrue("关于页没有渲染 AboutFields.LABELS[$i]", about.contains("AboutFields.LABELS[$i]"))
        }
        assertTrue("关于页要有应用名", about.contains("AboutFields.APP_NAME"))
        assertTrue("关于页要有诚实的限制", about.contains("ABOUT_LIMITS_ANDROID"))
        assertTrue("关于页（Android）要有检查更新动作", about.contains("onCheckUpdate"))
        assertTrue("关于页（Android）要显示更新源", about.contains("manifestUrlForDisplay"))
    }
}
