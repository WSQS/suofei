package dev.sopho.suofei

import dev.sopho.suofei.ui.SemanticBreak
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * **语义折行**的纯函数断言（采纳锚：`round-2026-10-16-break-semantic/ARCHIVE.md` 里用户确认的 5 条）。
 *
 * 期望值**逐字照采纳锚里的实测**写（那些数是自检脚本用独立模型复算出来的），所以这不是「我自己想的样子」：
 * 容器＝N 个字位时该断在哪、断点是否落在句读之后、收尾标点是否被推下去。
 * 另外两类不变量：**不丢字**（各段拼回去＝原文）与**不出空行**。
 */
class SemanticBreakTest {

    /** 原型里的「字位」推进宽：17px × (1 + 0.045) ＝ 17.766px（容器宽＝字位数 × 它）。 */
    private val unit = 17.766f

    private fun maxCharsFor(viewports: List<Int>, viewport: Int): Int {
        // 与界面同一条口径：正文可用宽＝C−33.6；C＝min(V, max(320, 0.88×(V−24)))
        val c = minOf(viewport.toFloat(), maxOf(320f, 0.88f * (viewport - 24)))
        return SemanticBreak.maxCharsPerLine(c - 33.6f, unit)
    }

    @Test
    fun wideEnough_keepsTheOriginalLine() {
        // 规则 1：宽度足够就保持原诗行。真实 12 字的诗行在 320／430／1180 上都不折行（采纳锚实测 0 行）。
        val line = "行行重行行，与君生别离。"
        for (viewport in listOf(320, 430, 1180)) {
            assertEquals("V=$viewport 不该折行", listOf(line), SemanticBreak.breakLine(line, maxCharsFor(emptyList(), viewport)))
        }
        // 320 最多放 16 个字位、430 放 18、1180 放 55（采纳锚的实测数字）
        assertEquals(16, maxCharsFor(emptyList(), 320))
        assertEquals(18, maxCharsFor(emptyList(), 430))
        assertEquals(55, maxCharsFor(emptyList(), 1180))
    }

    @Test
    fun breaksAfterTheLastFittingPunctuation() {
        // 采纳锚 S1（容器压到 8 字位）：② 按句读断 ＝ 6／6 —— 断点正在「，」之后
        assertEquals(
            listOf("行行重行行，", "与君生别离。"),
            SemanticBreak.breakLine("行行重行行，与君生别离。", 8),
        )
        // b-①：窗内**最后那个**可用句读（不取越界的整条末尾）
        assertEquals(
            listOf("甲乙丙丁；戊己庚辛，", "壬癸子丑"),
            SemanticBreak.breakLine("甲乙丙丁；戊己庚辛，壬癸子丑", 12),
        )
        assertEquals(
            listOf("甲乙丙丁戊，己庚辛壬癸。", "子丑寅卯"),
            SemanticBreak.breakLine("甲乙丙丁戊，己庚辛壬癸。子丑寅卯", 12),
        )
        // 真实原文折到 11 字位：窗内只有「，」，断在它之后（不是「10／2」那种字位断）
        assertEquals(
            listOf("行行重行行，", "与君生别离。"),
            SemanticBreak.breakLine("行行重行行，与君生别离。", 11),
        )
    }

    @Test
    fun noPunctuation_fallsBackToCharacterBoundary() {
        // 规则 3：无标点 ⇒ 在行尾按放得下的字符断，余文续行（不删字、不缩字号、不允许溢出）
        assertEquals(
            listOf("甲乙丙丁戊己", "庚辛壬癸子丑", "寅卯"),
            SemanticBreak.breakLine("甲乙丙丁戊己庚辛壬癸子丑寅卯", 6),
        )
    }

    @Test
    fun halfClauseTooWide_stepsDownToCharacterBoundary() {
        // d-①：半句仍超宽时用更小的边界断（这里只有那个「、」）⇒ 6／8／1
        assertEquals(
            listOf("甲乙丙丁戊、", "己庚辛壬癸子丑寅", "卯"),
            SemanticBreak.breakLine("甲乙丙丁戊、己庚辛壬癸子丑寅卯", 8),
        )
    }

    @Test
    fun closingPunctuationIsPushedDown_neverStartsALine() {
        // 规则 4（e-② 实测）：收尾标点不起行 ⇒ 把前一字连标点一起下移
        assertEquals(
            listOf("甲乙丙丁", "戊，己庚辛"),
            SemanticBreak.breakLine("甲乙丙丁戊，己庚辛", 5),
        )
    }

    @Test
    fun openingPunctuationNeverEndsALine() {
        // 同属禁则的另一半（参考模型 greedy/segs 里也有；归档那 5 条只写了收尾一半，见类注释）
        assertEquals(
            listOf("甲乙丙丁", "（戊己庚）"),
            SemanticBreak.breakLine("甲乙丙丁（戊己庚）", 5),
        )
    }

    @Test
    fun fixtureF_breaksAfterThePunctuation_notAtTheCharacterBoundary() {
        // f-①（容器 8 字位）：`甲乙丙丁戊，己庚辛壬癸` ⇒ 6／5（断在「，」之后）
        assertEquals(
            listOf("甲乙丙丁戊，", "己庚辛壬癸"),
            SemanticBreak.breakLine("甲乙丙丁戊，己庚辛壬癸", 8),
        )
    }

    @Test
    fun breaking_neverDropsOrAddsCharacters_andNeverEmitsAnEmptyLine() {
        val samples = listOf(
            "行行重行行，与君生别离。",
            "道路阻且长，会面安可知？",
            "甲乙丙丁戊、己庚辛壬癸子丑寅卯",
            "弃捐勿复道，努力加餐饭。",
            "无标点的一整行汉字用来验证字位断行",
        )
        for (text in samples) {
            for (cap in 1..text.length) {
                val rows = SemanticBreak.breakLine(text, cap)
                assertEquals("cap=$cap 不许丢字/加字：$text", text, rows.joinToString(""))
                assertTrue("cap=$cap 不许出空行：$text", rows.all { it.isNotEmpty() })
                assertTrue("cap=$cap 每行不超过上限：$text", rows.all { it.length <= cap })
                // 标点归前句：凡由句读断开的行，行末字必是句读、下一行首字必不是收尾标点
                for (i in 0 until rows.size - 1) {
                    val end = rows[i].last()
                    val next = rows[i + 1].first()
                    if (end in SemanticBreak.BREAK_PUNCT) {
                        assertTrue(
                            "行首不该是收尾标点：cap=$cap「${rows[i]}」/「${rows[i + 1]}」",
                            next !in SemanticBreak.CLOSING_PUNCT,
                        )
                    }
                    assertTrue("行末不该是开局标点：cap=$cap「${rows[i]}」", end !in SemanticBreak.OPENING_PUNCT)
                }
            }
        }
    }

    @Test
    fun breakStanza_keepsTheStanzaStructure() {
        val stanza = listOf("行行重行行，与君生别离。", "相去万余里，各在天一涯。")
        val laid = SemanticBreak.breakStanza(stanza, 6)
        assertEquals("原文行数不变（折行只是视觉）", stanza.size, laid.size)
        assertEquals(listOf("行行重行行，", "与君生别离。"), laid[0])
        assertEquals(listOf("相去万余里，", "各在天一涯。"), laid[1])
    }

    @Test
    fun charAdvance_followsFontSizeAndLetterSpacing() {
        // 17px × (1 + 0.045) ＝ 17.765px；本机原型实测 17.77px
        assertEquals(17.765f, dev.sopho.suofei.ui.PoetryTokens.charAdvancePx(17f, 0.045f), 0.001f)
        // 系统字号放大 ⇒ 每行字位变少（同一个可用宽）
        assertTrue(
            "字号变大时每行装得下的字位应变少",
            SemanticBreak.maxCharsPerLine(300f, dev.sopho.suofei.ui.PoetryTokens.charAdvancePx(17f * 1.3f, 0.045f)) <
                SemanticBreak.maxCharsPerLine(300f, dev.sopho.suofei.ui.PoetryTokens.charAdvancePx(17f, 0.045f)),
        )
    }
}
