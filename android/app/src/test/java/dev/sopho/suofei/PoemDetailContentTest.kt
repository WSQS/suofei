package dev.sopho.suofei

import dev.sopho.suofei.data.ContentParser
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 诗歌详情页要呈现的**每一条**异文，就是产物里的那 **24 条 / 13 首** —— 用 APK 内置产物**真解析**出来算，
 * 不是「页面不为空」。诗页**不得**出现它们（反向断言在 `ScreenInventoryTest`；那一条有牙齿，
 * 因为它同时断言 `PoemScreen` 不引用 `variants`/`poem.source`）。
 */
class PoemDetailContentTest {

    private val content = ContentParser.parse(
        File("src/main/assets/content/content.json").readText(Charsets.UTF_8),
    )

    @Test
    fun theProductCarries24VariantsAcross13Poems() {
        val withVariants = content.poems.filter { it.variants.isNotEmpty() }
        assertEquals("带异文的诗", 13, withVariants.size)
        assertEquals("异文总条数", 24, content.poems.sumOf { it.variants.size })
    }

    @Test
    fun everyVariantHasTextAndNote_soTheDetailPageRendersEachOne() {
        val all = content.poems.flatMap { it.variants }
        assertEquals(24, all.size)
        assertTrue(
            "每条异文都要有 text 与 note（详情页逐条渲染它们）",
            all.all { it.text.isNotBlank() && it.note.isNotBlank() },
        )
    }

    @Test
    fun poemsWithoutVariants_exist_soTheDetailPageMustSaySoHonestly() {
        // 19 - 13 = 6：它们进去详情页时应看到「没有记录异文」这句实话，而不是空白或编造。
        assertEquals("没有异文的诗", 6, content.poems.count { it.variants.isEmpty() })
    }
}
