package dev.sopho.suofei

import dev.sopho.suofei.data.Poem
import dev.sopho.suofei.ui.AboutFields
import dev.sopho.suofei.ui.LABEL_BACK
import dev.sopho.suofei.ui.LABEL_DETAIL
import dev.sopho.suofei.ui.PoetryTokens
import dev.sopho.suofei.ui.noteEntryLabel
import dev.sopho.suofei.ui.poemMetaLine
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 跨页**宽度口径**（采纳锚 `round-2026-10-16-width-pct`，用户 2026-10-15 选定）：
 * `C = min(V, max(320, 0.88 × (V − 24)))`，其中 `V`＝视口宽；列外余白＝`(V−C)/2`；
 * 行内沿 `1.05rem`＝16.8px 是**列内**一层 ⇒ 正文可用宽＝`C − 33.6`。
 *
 * 期望值逐字照采纳锚那张实测表写（8 个视口 × 公式复算），以及两条硬纠正：
 * ① `24` 是**一次性扣除总量**（V=320 时 C=320 > A=296 ⇒ 不可能是「左右各 12px 页边」）；
 * ② 上界是**视口 V**、**不夹** 660／860（834 上 C=712.8 > 660、1180 上 C=1017.28 > 860）。
 *
 * 另外把两处**纯内容**（身份行、笔记入口文案）钉在这里：它们是采纳锚里的逐字内容。
 */
class ContentWidthTest {

    private fun c(viewport: Float) = PoetryTokens.contentColumnWidth(viewport)

    @Test
    fun contentWidth_matchesTheChosenFormula_atEveryMeasuredViewport() {
        val table = mapOf(
            320f to 320f, // 下限命中
            360f to 320f, // 下限命中
            390f to 322.08f,
            412f to 341.44f,
            430f to 357.28f,
            834f to 712.8f,
            1180f to 1017.28f,
            740f to 630.08f,
        )
        for ((viewport, expected) in table) {
            assertEquals("V=$viewport 的内容列宽 C", expected, c(viewport), 0.02f)
        }
    }

    @Test
    fun twentyFourIsDeductedOnce_notTwelvePerSide() {
        // 机器可查的形式：V=320 时 C=320 > A=296 —— 若真是「两侧各 12」，内容宽不可能超过 296。
        assertEquals(320f, c(320f), 0.001f)
        assertTrue("C 必须大于 V−24（否则就是把 24 当成左右各 12 了）", c(320f) > 320f - PoetryTokens.CONTENT_WIDTH_DEDUCT)
    }

    @Test
    fun upperBoundIsTheViewport_andThereIsNo660or860Cap() {
        assertTrue("834 上 C 应超过 660", c(834f) > 660f)
        assertTrue("1180 上 C 应超过 860", c(1180f) > 860f)
        // 上界＝V：极窄视口下也不会超过视口本身
        assertTrue("C 不得超过视口 V", c(280f) <= 280f)
    }

    @Test
    fun columnOuterMargin_isHalfOfTheRemainder() {
        // 列外余白＝(V−C)/2：320 上恰好 0；430 上 36.36；1180 上 81.36
        assertEquals(0f, (320f - c(320f)) / 2f, 0.02f)
        assertEquals(36.36f, (430f - c(430f)) / 2f, 0.02f)
        assertEquals(81.36f, (1180f - c(1180f)) / 2f, 0.02f)
    }

    @Test
    fun bodyAvailableWidth_subtractsTheTwoInnerEdges() {
        assertEquals(286.4f, PoetryTokens.bodyAvailableWidth(c(320f)), 0.02f)
        assertEquals(323.68f, PoetryTokens.bodyAvailableWidth(c(430f)), 0.02f)
        assertEquals(983.68f, PoetryTokens.bodyAvailableWidth(c(1180f)), 0.02f)
        // 行内沿＝1.05rem＝16.8px（与令牌 row-pad 的横向分量同值）
        assertEquals(16.8f, PoetryTokens.remToDpValue(PoetryTokens.EDGE_X_REM), 0.001f)
        assertEquals(PoetryTokens.ROW_PAD_HORIZONTAL_REM, PoetryTokens.EDGE_X_REM, 0.0001f)
    }

    @Test
    fun aboutPageLabelColumn_isFivePointTwoEmOfTheLabelSize() {
        // 标签列 5.2em（作用在 0.82rem 上）＝68.22px ⇒ 值列左沿＝16.8＋68.22＋8＝93.02px（V3 实测）
        assertEquals(68.224f, PoetryTokens.labelColumnDp(), 0.02f)
        assertEquals(
            93.024f,
            PoetryTokens.remToDpValue(PoetryTokens.EDGE_X_REM) + PoetryTokens.labelColumnDp() +
                PoetryTokens.remToDpValue(PoetryTokens.K_GAP_REM),
            0.02f,
        )
    }

    @Test
    fun identityLine_isAuthorThenDynastyThenGenre() {
        // 采纳锚（诗页 P1 基线 ＋ width-pct §3）：身份行＝作者 · 朝代 · 体裁
        assertEquals("佚名 · 汉 · 五言古诗", poemMetaLine(poem(genre = "五言古诗")))
        // 体裁缺失时省略（不写空段）
        assertEquals("佚名 · 汉", poemMetaLine(poem(genre = null)))
    }

    @Test
    fun noteEntryLabel_flipsTheBracketSignOnly() {
        assertEquals("[+]笔记", noteEntryLabel(expanded = false))
        // U+2212 减号（不是连字符）
        assertEquals("[\u2212]笔记", noteEntryLabel(expanded = true))
        assertEquals("返回", LABEL_BACK)
        assertEquals("详情", LABEL_DETAIL)
    }

    @Test
    fun repoLink_isTheCompleteUrl_ofTheProject() {
        // C1：显示**完整 URL**（不给「会打开浏览器」的提示）
        assertEquals("https://github.com/WSQS/suofei", AboutFields.REPO_URL)
        assertTrue("应是 https 的完整 URL", AboutFields.REPO_URL.startsWith("https://"))
    }

    /**
     * 逐项拿**采纳锚的原型实测值**对一遍版面常量（转成 dp：px→dp 1:1、rem→×16）。
     * 这些数字在原型的自检脚本里都有实测记录，所以它们不是「我觉得差不多」：
     * 目录页（`q-hub-align.md` §3）、诗页（`q-poem-note.md` §2）、详情页（`q-detail.md` §6.3）、
     * 关于页（`q-about-min.md` §1／§2）。
     */
    @Test
    fun layoutSpacing_matchesTheAdoptedPrototypeMeasurements() {
        fun rem(v: Float) = PoetryTokens.remToDpValue(v)

        // 目录页：悬挂槽 27.52px（＝记号排版宽 21.13 ＋ 固定缝 0.4rem）；组名左沿＝题名左沿＝槽宽
        assertEquals(27.52f, rem(PoetryTokens.MARKER_SLOT_REM), 0.02f)
        assertEquals(6.4f, rem(PoetryTokens.MARKER_SEAM_REM), 0.001f)
        // 诗页：题名→身份 0.7rem＝11.2px；身份→原文 2.1rem＝33.6px；正文下留白 0.6rem＝9.6px
        assertEquals(11.2f, rem(PoetryTokens.TITLE_GAP_REM), 0.02f)
        assertEquals(33.6f, rem(PoetryTokens.POEM_BODY_TOP_REM), 0.02f)
        assertEquals(9.6f, rem(PoetryTokens.POEM_BODY_BOTTOM_REM), 0.02f)
        // 顶部行：上内边距 0.7rem；顶部行→诗题 1.5rem＝24px；「笔记」↔「详情」缝 1.1rem
        assertEquals(11.2f, rem(PoetryTokens.CTL_TOP_PAD_REM), 0.02f)
        assertEquals(24f, rem(PoetryTokens.HEAD_PAD_TOP_REM), 0.02f)
        assertEquals(17.6f, rem(PoetryTokens.CTL_GAP_REM), 0.02f)
        // 笔记（档②）：入口在顶部行，展开内容在正文之后（上间距 2.6rem＝41.6px）；段间距 0.7em
        assertEquals(41.6f, rem(PoetryTokens.NOTES_TOP_REM), 0.02f)
        assertEquals(9.45f, PoetryTokens.NOTE_SIZE * PoetryTokens.NOTE_PARA_GAP_EM, 0.02f)
        // 详情页：诗题→来源 1.6rem；标签→文本 0.35rem；来源→正文 1.6rem；小标题上 1.6rem／下 0.5rem；
        // 列表项 0.6rem；段落 0.9rem（`q-detail.md` §6.3 的逐项 computed 实测）
        assertEquals(25.6f, rem(PoetryTokens.SRC_GAP_TOP_REM), 0.02f)
        assertEquals(5.6f, rem(PoetryTokens.SRC_LABEL_GAP_REM), 0.02f)
        assertEquals(25.6f, rem(PoetryTokens.SEC_GAP_TOP_REM), 0.02f)
        assertEquals(25.6f, rem(PoetryTokens.SUB_GAP_TOP_REM), 0.02f)
        assertEquals(8f, rem(PoetryTokens.SUB_GAP_BOTTOM_REM), 0.02f)
        assertEquals(9.6f, rem(PoetryTokens.LI_GAP_REM), 0.02f)
        assertEquals(14.4f, rem(PoetryTokens.PARA_GAP_REM), 0.02f)
        // 关于页：版本组→按钮 0.9rem＝14.4px；按钮→状态/两行之间 0.5rem＝8px；
        // 按钮左右内边距 0.7rem＝11.2px（原型「按钮自身 1px 边框＋11.2px 内边距」那个数）
        assertEquals(14.4f, rem(PoetryTokens.SEC_GAP_REM), 0.02f)
        assertEquals(8f, rem(PoetryTokens.ROW_GAP_REM), 0.02f)
        assertEquals(11.2f, rem(PoetryTokens.CTL_PAD_X_REM), 0.02f)
    }

    @Test
    fun repoLink_showsTheCompleteUrl_notAPromptToOpenABrowser() {
        assertEquals("https://github.com/WSQS/suofei", AboutFields.REPO_URL)
    }

    private fun poem(genre: String?) = Poem(
        id = "p",
        title = "行行重行行",
        author = "佚名",
        dynasty = "汉",
        genre = genre,
        source = "底本",
        orderInSource = 1,
        detail = null,
        stanzas = listOf(listOf("行行重行行，与君生别离。")),
        notes = null,
        originIndex = 0,
    )
}
