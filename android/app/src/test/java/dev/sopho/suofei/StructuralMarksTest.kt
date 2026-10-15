package dev.sopho.suofei

import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.em
import dev.sopho.suofei.ui.PoetryTokens
import dev.sopho.suofei.ui.highlightMatches
import dev.sopho.suofei.ui.groupCountAnnotated
import dev.sopho.suofei.ui.groupCountText
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 结构记号（规范 §4.1）的**行为**断言：`[3] 首` 的形状、括号段的色与字号、
 * 搜索命中高亮用的是 `mark-bg`/`mark-text`。（值本身与规范的比对在 `VisualTokensConsistencyTest`。）
 */
class StructuralMarksTest {

    @Test
    fun countIsBracketedAndSuffixed() {
        assertEquals("[3] 首", groupCountText(3))
        assertEquals("[19] 首", groupCountText(19))
    }

    @Test
    fun bracketsAreFaintAndSmallerThanTheNumber() {
        val annotated = groupCountAnnotated(19)
        assertEquals("[19] 首", annotated.text)

        val spans = annotated.spanStyles
        assertEquals("两个方括号各一段样式", 2, spans.size)
        // "[19] 首"：'[' 在 0，']' 在 3
        assertEquals(0, spans[0].start)
        assertEquals(1, spans[0].end)
        assertEquals(3, spans[1].start)
        assertEquals(4, spans[1].end)
        for (span in spans) {
            assertEquals("括号色＝text-faint", PoetryTokens.textFaint, span.item.color)
            assertEquals(
                "括号字号＝${PoetryTokens.COUNT_BRACKET_SCALE}em（相对数字字号）",
                PoetryTokens.COUNT_BRACKET_SCALE.em,
                span.item.fontSize,
            )
        }
        // 数字与「首」不带括号样式（沿用外层等宽次要色）
        assertEquals(" 首", annotated.text.substring(4))
    }

    @Test
    fun searchHighlightUsesMarkTokens() {
        val annotated = highlightMatches("行行重行行", "行行")
        assertEquals("文本不变", "行行重行行", annotated.text)
        assertEquals("两处命中", 2, annotated.spanStyles.size)
        for (span in annotated.spanStyles) {
            assertEquals("命中底色＝mark-bg", PoetryTokens.markBg, span.item.background)
            assertEquals("命中文字＝mark-text", PoetryTokens.markText, span.item.color)
        }
        // 命中段文字确实是查询词
        val first = annotated.spanStyles[0]
        assertEquals("行行", annotated.text.substring(first.start, first.end))
    }

    @Test
    fun highlightHandlesCaseAndAbsence() {
        val upper = highlightMatches("ABC Song", "bc")
        assertEquals(1, upper.spanStyles.size)
        assertEquals("BC", upper.text.substring(upper.spanStyles[0].start, upper.spanStyles[0].end))

        assertEquals("查不到时文本原样", "行行重行行", highlightMatches("行行重行行", "唐诗").text)
        assertTrue("查不到时没有命中段", highlightMatches("行行重行行", "唐诗").spanStyles.isEmpty())
        assertTrue("空查询不高亮", highlightMatches("行行重行行", "  ").spanStyles.isEmpty())
    }

    @Test
    fun numberKeepsTheMonoStyleOfTheOuterText() {
        // 数字本身不额外设置样式：由外层（等宽 0.76rem 次要色）决定
        val annotated = groupCountAnnotated(19)
        val numberIndex = annotated.text.indexOf("19")
        assertTrue(
            "数字不该被括号样式覆盖",
            annotated.spanStyles.none { numberIndex in it.start until it.end },
        )
    }

    @Test
    fun sansAndMonoFamiliesAreTheSystemOnes() {
        assertEquals(FontFamily.SansSerif, PoetryTokens.fontSans)
        assertEquals(FontFamily.Monospace, PoetryTokens.fontMono)
    }
}
