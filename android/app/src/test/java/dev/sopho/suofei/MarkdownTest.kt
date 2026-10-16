package dev.sopho.suofei

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * **最小 Markdown 渲染**——范围＝**闭集 8 样**（人类可读规范＝`docs/design/content-contract.md` §1.0；
 * **机器可读的唯一来源＝`schema/markdown-subset.json`** 的 `constructs`）。
 * ⚠ 2026-10-16 改：原先读的是 `items/content-format/prototypes/rules-v4/expectations.json` —— 那是**会被归档的原型
 * 目录**，归档即断；已迁到稳定契约位置（原型那份保留为历史快照，不再当测试输入）。
 *
 * 这里只测**纯解析**（[dev.sopho.suofei.ui.Markdown.parse]／`inline`）：不碰 Compose、不碰设备。
 * 界面上怎么摆（块间距、小标题样式）由 `ScreenInventoryTest` 作源码级守卫，观感仍需模拟器验收。
 *
 * 牙有两颗：
 * 1. **范围定义从稳定契约侧读**（`schema/markdown-subset.json` 的 `constructs[].id`）与 `Markdown.CONSTRUCT_IDS` 逐项比 ——
 *    两端必须共用同一份定义，所以它不能是「我们这边自己列的 8 样」；
 * 2. **合法夹具的产物**（`tests/fixtures/contract/md-subset-legal.json` 的 `notes`）真解析成预期的块序列 ——
 *    那份文本是编译器的输出，也是八样写法各出现一次的唯一样例。
 */
class MarkdownTest {

    private val legalNotes = org.json.JSONObject(
        TestRepoFiles.read(
            "tests/fixtures/contract/md-subset-legal.json",
            "合法夹具的产物是新形状的机器可读样例；读不到即失败，不跳过。",
        ),
    ).getJSONArray("poems").getJSONObject(0).getString("notes")

    @Test
    fun constructIds_matchTheMachineReadableRangeDefinition() {
        val spec = org.json.JSONObject(
            TestRepoFiles.read(
                "schema/markdown-subset.json",
                "闭集范围定义在这个文件里；读不到即失败（不跳过）。",
            ),
        )
        val constructs = spec.getJSONArray("constructs")
        val ids = (0 until constructs.length()).map { constructs.getJSONObject(it).getString("id") }
        assertEquals("两端共用的最小范围定义（8 样）", ids, dev.sopho.suofei.ui.Markdown.CONSTRUCT_IDS)
        assertEquals(8, ids.size)
    }

    @Test
    fun legalFixture_parsesIntoTheExpectedBlocks() {
        val blocks = dev.sopho.suofei.ui.Markdown.parse(legalNotes)
        val kinds = blocks.map { it::class.simpleName }
        assertEquals(
            listOf(
                "Paragraph", // 段落
                "Heading3", "Paragraph", // ### ＋ 段内换行（同段 3 行）
                "Heading3", "UnorderedList", "OrderedList", // ### ＋ - 列表 ＋ 1. 列表
                "Heading3", "Quote", // ### ＋ > 引用
            ),
            kinds,
        )
        // 段内换行＝同一段里多个元素（不是新段落）
        val multiLine = blocks[2] as dev.sopho.suofei.ui.Markdown.Paragraph
        assertEquals(3, multiLine.lines.size)
        // 列表：每行一项
        assertEquals(2, (blocks[4] as dev.sopho.suofei.ui.Markdown.UnorderedList).items.size)
        assertEquals(2, (blocks[5] as dev.sopho.suofei.ui.Markdown.OrderedList).items.size)
        // 行内：粗体与斜体
        assertTrue("粗体应被解析成带字重的 span", dev.sopho.suofei.ui.Markdown.inline("有**粗体**。").spanStyles.isNotEmpty())
        assertTrue("斜体应被解析成带字形的 span", dev.sopho.suofei.ui.Markdown.inline("有*斜体*。").spanStyles.isNotEmpty())
        // 去掉标记后不丢字、不加字
        assertEquals("有粗体。", dev.sopho.suofei.ui.Markdown.inline("有**粗体**。").text)
        assertEquals("有斜体。", dev.sopho.suofei.ui.Markdown.inline("有*斜体*。").text)
    }

    @Test
    fun orderedList_numbersByOccurrence_notByTheSourceNumbers() {
        val blocks = dev.sopho.suofei.ui.Markdown.parse("3. 甲\n7. 乙\n")
        val list = blocks.single() as dev.sopho.suofei.ui.Markdown.OrderedList
        // 源里的 3 / 7 不决定显示编号 ⇒ 渲染时按出现次序 1. 2.
        assertEquals(listOf("甲", "乙"), list.items)
    }

    @Test
    fun paragraphLineBreak_staysInsideTheSameParagraph() {
        val blocks = dev.sopho.suofei.ui.Markdown.parse("第一行\n第二行\n\n另起一段")
        assertEquals(2, blocks.size)
        assertEquals(listOf("第一行", "第二行"), (blocks[0] as dev.sopho.suofei.ui.Markdown.Paragraph).lines)
        assertEquals(listOf("另起一段"), (blocks[1] as dev.sopho.suofei.ui.Markdown.Paragraph).lines)
    }

    @Test
    fun blankLines_separateBlocks_andAreNotContent() {
        assertEquals(
            listOf("Paragraph", "Paragraph"),
            dev.sopho.suofei.ui.Markdown.parse("\n\n甲\n\n\n\n乙\n\n").map { it::class.simpleName },
        )
    }

    @Test
    fun h3_isExactlyThreeHashes_andOtherLevelsAreNotHeadings() {
        assertTrue(dev.sopho.suofei.ui.Markdown.isHeading3("### 异文"))
        assertEquals("异文", (dev.sopho.suofei.ui.Markdown.parse("### 异文").single() as dev.sopho.suofei.ui.Markdown.Heading3).text)

        // 闭集之外的标题层级**不渲染成标题**（也不删字）：它们按字面落进段落
        for (outOfRange in listOf("# 一级", "#### 四级", "## 二级", "###缺空格")) {
            val blocks = dev.sopho.suofei.ui.Markdown.parse(outOfRange)
            assertEquals("「$outOfRange」不该被当成标题", "Paragraph", blocks.single()::class.simpleName)
            val text = (blocks.single() as dev.sopho.suofei.ui.Markdown.Paragraph).lines.joinToString("\n")
            assertEquals("标记应原样留在文本里（不渲染、不删字）", outOfRange, text)
        }
    }

    @Test
    fun starList_isNotAList_theDashIs() {
        // 闭集只收 `- `；`* ` 是闭集之外的写法（两端不一致的根源，编译期报 MD_STAR_LIST）
        assertEquals("Paragraph", dev.sopho.suofei.ui.Markdown.parse("* 星号项").single()::class.simpleName)
        assertEquals("UnorderedList", dev.sopho.suofei.ui.Markdown.parse("- 连字符项").single()::class.simpleName)
        // `- ` 必须是「连字符＋一个空格」
        assertEquals("Paragraph", dev.sopho.suofei.ui.Markdown.parse("-没有空格").single()::class.simpleName)
    }

    @Test
    fun otherOutOfRangeSyntax_isRenderedLiterally_notParsed() {
        // 表格 / 图片 / 链接 / 行内代码 / 脚注 / HTML：渲染层**不加分支**，只按字面显示
        val sample = """
            | 本子 | 异文 |
            ![图片](x.png)
            [某站](https://example.invalid/x)
            行内代码：`x`
            脚注写法[^1]
            <br>
        """.trimIndent()
        val blocks = dev.sopho.suofei.ui.Markdown.parse(sample)
        val text = blocks.joinToString("\n") { block ->
            when (block) {
                is dev.sopho.suofei.ui.Markdown.Paragraph -> block.lines.joinToString("\n")
                is dev.sopho.suofei.ui.Markdown.Quote -> block.lines.joinToString("\n")
                else -> ""
            }
        }
        assertTrue(text.contains("| 本子 | 异文 |"))
        assertTrue(text.contains("![图片](x.png)"))
        assertTrue(text.contains("[某站](https://example.invalid/x)"))
        assertTrue(text.contains("`x`"))
        assertTrue(text.contains("[^1]"))
        assertTrue(text.contains("<br>"))
    }

    @Test
    fun unclosedEmphasis_staysLiteral_andLosesNoCharacters() {
        // 未闭合的强调由**编译期**（MD_EMPHASIS_UNCLOSED）挡住；渲染层不猜、不报错，按字面显示。
        val annotated = dev.sopho.suofei.ui.Markdown.inline("**没有收尾")
        assertEquals("**没有收尾", annotated.text)
        assertTrue("没有闭合就不该产生强调样式", annotated.spanStyles.isEmpty())
    }

    @Test
    fun quote_lines_joinIntoOneBlock() {
        val blocks = dev.sopho.suofei.ui.Markdown.parse("> 第一行\n> 第二行")
        assertEquals(listOf("第一行", "第二行"), (blocks.single() as dev.sopho.suofei.ui.Markdown.Quote).lines)
    }
}
