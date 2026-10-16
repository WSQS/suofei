package dev.sopho.suofei.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** Markdown 块（闭集 8 样里除行内两样外的全部块类型）。 */
sealed interface MarkdownBlock

/**
 * **最小 Markdown 渲染**（从零新增；**唯一范围定义＝`schema/markdown-subset.json`** 的**闭集 8 样**，
 * 人类可读规范＝`docs/design/content-contract.md` §1.0）。
 *
 * | # | 语法 | 渲染成什么 |
 * |---|---|---|
 * | 1 | 段落（连续非空行） | 一整段 |
 * | 2 | 段内换行（段落里的每一行） | 段内一次换行（同段，不在段间多留白） |
 * | 3 | 无序列表（行首 `- `） | 列表，每行一项（圆点记号） |
 * | 4 | 有序列表（行首 `1. ` 等） | 有序列表，**按出现次序编号**（源里的数字不决定显示编号） |
 * | 5 | 粗体（`**文字**`） | 加粗（`SpanStyle` 字重） |
 * | 6 | 斜体（`*文字*`） | 斜体（`SpanStyle` 字形） |
 * | 7 | 三级标题（行首恰好 `### `） | 小标题块（用既有 `notesTitle` 系的样式，见 [PoetryTextStyles.subHead]） |
 * | 8 | 引用（行首 `> `） | 引用块（缩进 ＋ 左侧一条发丝竖线） |
 *
 * **闭集之外一律不渲染，也不在这里加分支**（表格 `|`、图片 `![`、链接 `](`、行内代码反引号、
 * 代码围栏、`# `／`#### `、任务列表 `- [ ]`、脚注 `[^…]`、行首 HTML、星号列表 `* `）——
 * 它们在**编译期**就被 `tools/` 报错挡住（诊断码 `MD_TABLE`／`MD_IMAGE`／`MD_LINK`／…），产物里不会出现；
 * 真出现时它们只会落到「段落」这一支里**按字面显示**（＝不渲染），这与详情页「不解析」那一档的后果一致。
 * 唯一需要说明的是 `- [ ] x`：它确实以 `- ` 开头，所以按普通列表项渲染 —— 这正是诊断 `MD_TASK_LIST`
 * 存在的理由（「会被误当普通列表」）。
 *
 * ⚠ **`### ` 恰好三级**：`# ` 与 `#### ` 都**不是**标题（会落进段落、标记原样可见）。`## ` 是**节分界**，
 * 由编译器切节，不到渲染层。
 */
object Markdown {

    /** 闭集 8 样的机器可读 id（与 `expectations.json` 的 `constructs[].id` 逐字相同）。 */
    val CONSTRUCT_IDS = listOf(
        "paragraph", "line-break", "ul-dash", "ol-number", "bold", "italic", "h3", "quote",
    )

    /** 段落（段内换行 ⇒ 每个元素是一次换行，不是新段落）。 */
    data class Paragraph(val lines: List<String>) : MarkdownBlock

    /** 无序列表（`- `），每行一项。 */
    data class UnorderedList(val items: List<String>) : MarkdownBlock

    /** 有序列表（`N. `），显示编号**按出现次序**，不看源里的数字。 */
    data class OrderedList(val items: List<String>) : MarkdownBlock

    /** 三级标题（行首恰好 `### `）。 */
    data class Heading3(val text: String) : MarkdownBlock

    /** 引用块（`> `），连续 `> ` 行合成一个块。 */
    data class Quote(val lines: List<String>) : MarkdownBlock

    private val OL = Regex("""^(\d{1,9})\. (.*)$""")

    /** 逐行解析。空行分隔块；标题/列表/引用各自起新块（不与前后段落合并）。 */
    fun parse(markdown: String): List<MarkdownBlock> {
        val lines = markdown.replace("\r\n", "\n").replace('\r', '\n').split('\n')
        val out = ArrayList<MarkdownBlock>()
        var i = 0
        while (i < lines.size) {
            val line = lines[i]
            if (line.isBlank()) {
                i++
                continue
            }
            when {
                isHeading3(line) -> {
                    out += Heading3(line.removePrefix("### ").trim())
                    i++
                }

                isUnorderedItem(line) -> {
                    val items = ArrayList<String>()
                    while (i < lines.size && isUnorderedItem(lines[i])) {
                        items += lines[i].removePrefix("- ")
                        i++
                    }
                    out += UnorderedList(items)
                }

                isOrderedItem(line) -> {
                    val items = ArrayList<String>()
                    while (i < lines.size && isOrderedItem(lines[i])) {
                        items += OL.matchEntire(lines[i])!!.groupValues[2]
                        i++
                    }
                    out += OrderedList(items)
                }

                isQuoteLine(line) -> {
                    val quoted = ArrayList<String>()
                    while (i < lines.size && isQuoteLine(lines[i])) {
                        quoted += lines[i].removePrefix("> ")
                        i++
                    }
                    out += Quote(quoted)
                }

                else -> {
                    val paragraph = ArrayList<String>()
                    while (i < lines.size && lines[i].isNotBlank() && !startsBlock(lines[i])) {
                        paragraph += lines[i]
                        i++
                    }
                    out += Paragraph(paragraph)
                }
            }
        }
        return out
    }

    /** 行首恰好 `### `（`# `、`#### `、`## ` 都不算）。 */
    fun isHeading3(line: String): Boolean = line.startsWith("### ")

    /** 行首 `- `（连字符＋一个空格；`* ` 不收）。 */
    fun isUnorderedItem(line: String): Boolean = line.startsWith("- ")

    /** 行首 `数字.` ＋ 一个空格。 */
    fun isOrderedItem(line: String): Boolean = OL.matches(line)

    /** 行首 `> `。 */
    fun isQuoteLine(line: String): Boolean = line.startsWith("> ")

    private fun startsBlock(line: String): Boolean =
        isHeading3(line) || isUnorderedItem(line) || isOrderedItem(line) || isQuoteLine(line)

    /**
     * 行内：`**粗体**` 与 `*斜体*`。
     *
     * 未闭合的强调**不报错也不猜**：它按字面留在文本里（编译期另有 `MD_EMPHASIS_UNCLOSED` 把它挡住，
     * 所以产物里不应出现）。这一点与「两端同一份范围定义」有关：渲染层不做编译器该做的事。
     */
    fun inline(text: String): AnnotatedString = buildAnnotatedString {
        var i = 0
        while (i < text.length) {
            if (text.startsWith("**", i)) {
                val close = text.indexOf("**", i + 2)
                if (close > i + 2) {
                    withStyle(SpanStyle(fontWeight = FontWeight.Bold)) {
                        append(text.substring(i + 2, close))
                    }
                    i = close + 2
                    continue
                }
            }
            if (text[i] == '*') {
                val close = text.indexOf('*', i + 1)
                if (close > i + 1) {
                    withStyle(SpanStyle(fontStyle = FontStyle.Italic)) {
                        append(text.substring(i + 1, close))
                    }
                    i = close + 1
                    continue
                }
            }
            append(text[i])
            i++
        }
    }
}

/**
 * 把 [Markdown.parse] 的结果摆到 Compose 上。样式全部从调用方给（详情页用正文排版、
 * 笔记用笔记排版），**块间距按采纳锚的草案值**：
 * `### ` 上 1.6rem（首个＝0）／下 0.5rem；段落之间 0.9rem（详情）或 0.7em（笔记）；列表项之间 0.6rem。
 */
@Composable
fun MarkdownBody(
    markdown: String,
    bodyStyle: TextStyle,
    paragraphGap: Dp,
    itemGap: Dp,
    modifier: Modifier = Modifier,
) {
    val blocks = Markdown.parse(markdown)
    Column(modifier) {
        blocks.forEachIndexed { index, block ->
            when (block) {
                is Markdown.Heading3 -> {
                    if (index > 0) Spacer(Modifier.height(PoetryTokens.rem(PoetryTokens.SUB_GAP_TOP_REM)))
                    Text(Markdown.inline(block.text), style = PoetryTextStyles.subHead)
                    Spacer(Modifier.height(PoetryTokens.rem(PoetryTokens.SUB_GAP_BOTTOM_REM)))
                }

                is Markdown.Paragraph -> {
                    // 段内换行：一个 Text 里的 \n ⇒ 换行但**段间距不变大**。
                    Text(Markdown.inline(block.lines.joinToString("\n")), style = bodyStyle)
                    if (index != blocks.lastIndex) Spacer(Modifier.height(paragraphGap))
                }

                is Markdown.UnorderedList -> {
                    ListBlock(block.items, bodyStyle, itemGap, numbered = false)
                    if (index != blocks.lastIndex) Spacer(Modifier.height(paragraphGap))
                }

                is Markdown.OrderedList -> {
                    ListBlock(block.items, bodyStyle, itemGap, numbered = true)
                    if (index != blocks.lastIndex) Spacer(Modifier.height(paragraphGap))
                }

                is Markdown.Quote -> {
                    Row(Modifier.height(IntrinsicSize.Min)) {
                        // 引用块的左边线：复用 StructuralMarks 里那条发丝竖线的画法
                        // （`visual-tokens.md` §6 建议：引用块用 `--accent-line` 作左边线 + 缩进）
                        AccentBar()
                        Spacer(Modifier.width(PoetryTokens.rem(PoetryTokens.QUOTE_PAD_LEFT_REM)))
                        Text(
                            Markdown.inline(block.lines.joinToString("\n")),
                            style = bodyStyle,
                            modifier = Modifier.weight(1f),
                        )
                    }
                    if (index != blocks.lastIndex) Spacer(Modifier.height(paragraphGap))
                }
            }
        }
    }
}

@Composable
private fun ListBlock(items: List<String>, bodyStyle: TextStyle, itemGap: Dp, numbered: Boolean) {
    Column {
        items.forEachIndexed { i, item ->
            if (i > 0) Spacer(Modifier.height(itemGap))
            Row {
                // 有序列表的编号**按出现次序**（源里的数字不决定显示编号）。
                Text(if (numbered) "${i + 1}." else PoetryTokens.UL_MARKER, style = bodyStyle)
                Spacer(Modifier.width(PoetryTokens.rem(PoetryTokens.LIST_MARKER_GAP_REM)))
                Text(Markdown.inline(item), style = bodyStyle, modifier = Modifier.weight(1f))
            }
        }
    }
}
