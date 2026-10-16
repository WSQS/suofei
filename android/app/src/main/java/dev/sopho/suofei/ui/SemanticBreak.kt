package dev.sopho.suofei.ui

import kotlin.math.floor

/**
 * **语义折行**（采纳锚：`items/app-ui/history/round-2026-10-16-break-semantic/ARCHIVE.md`，
 * 用户 2026-10-16 逐项确认的 5 条）：
 *
 * 1. **宽度足够就保持原诗行**；只有真超宽才按句读拆；
 * 2. **多个标点取「当前行放得下范围内最后那个可用句读」**（不取越界的整条末尾；**不再用 rank 优先级表**）；
 * 3. **无标点或半句本身仍超宽 ⇒ 在行尾按放得下的字符断行，余文续行**；不删除/不截断/不加省略号/不缩字号/不允许溢出；
 * 4. **避免逗号、句号跑到行首；必要时把前一字连标点一起下移**；
 * 5. 两个视觉行都继承居中；`stanzas` 与正文**一字不改**（断行只是视觉折行）。
 *
 * **为什么纯 CSS 不行**：`line-break` 只有「字位＋禁则」，没有「优先在标点后断」这个表达
 * （`hanging-punctuation` 本机 Chromium 不支持）⇒ 断点必须由渲染层自己算，**两端各做一次、必须同一规则**。
 *
 * **字位模型**（与原型一致）：一个汉字或一个全角标点各占 1 个字位，推进宽＝`字号 × (1 + 字距)`；
 * 一行最多放 `floor(可用宽 ÷ 推进宽)` 个字位。换字体/改字号/系统字号放大都会改变这个数 ⇒
 * 它是运行期算出来的，不是写死的常量。
 *
 * ⚠ **诚实边界（禁则的两半）**：本条把参考实现里的**两种禁则**都做了 —— 收尾标点不起行（规则 4 写明的
 * 那一半）＋ 开局标点不留行尾（参考模型 `greedy`/`segs` 里同样有，但归档那 5 条里只写了前半）。
 * 真实《古诗十九首》正文里两种情形都不出现（12 字的行、最窄 320 上也放得下 16 字位 ⇒ 不折行）。
 */
object SemanticBreak {

    /** 断点候选（规则 2）：句读类标点。与参考实现的 `SEMI` 同表。 */
    const val BREAK_PUNCT = "，。！？；：、"

    /** 行首禁则（规则 4）：收尾类标点不得起行。与参考实现的 `CLOSE` 同表。 */
    const val CLOSING_PUNCT = "，。！？；：、）》」』】"

    /** 行尾禁则：开局类标点不得留在行尾。与参考实现的 `OPEN` 同表。 */
    const val OPENING_PUNCT = "（《「『【"

    /**
     * 一行最多几个字位。`charAdvancePx <= 0` 时返回 [Int.MAX_VALUE]（＝不折行，防御性：字号为 0 不该导致死循环）。
     */
    fun maxCharsPerLine(availableWidthPx: Float, charAdvancePx: Float): Int {
        if (charAdvancePx <= 0f || availableWidthPx <= 0f) return Int.MAX_VALUE
        return floor(availableWidthPx / charAdvancePx).toInt().coerceAtLeast(1)
    }

    /**
     * 把一行**原文**折成若干视觉行。纯函数（可 JVM 单测）：不碰 Compose、不碰设备。
     *
     * 规则 1：`line.length <= maxChars` ⇒ 原样一行（宽度足够就保持原诗行）。
     */
    fun breakLine(line: String, maxChars: Int): List<String> {
        if (maxChars <= 0) return listOf(line)
        if (line.length <= maxChars) return listOf(line)

        val out = ArrayList<String>(line.length / maxChars + 2)
        var start = 0
        while (start < line.length) {
            if (line.length - start <= maxChars) {
                out += line.substring(start)
                break
            }
            val windowEnd = start + maxChars // 本行最多放 [start, windowEnd) 这些字位
            // 规则 2：窗内**最后一个**可用句读（从右往左找；`p` 是「断在它之后」的下标）。
            var cut = -1
            for (p in windowEnd - 1 downTo start + 1) {
                if (line[p] in BREAK_PUNCT) {
                    cut = p + 1
                    break
                }
            }
            if (cut <= start) {
                // 规则 3：无标点（或半句仍超宽）⇒ 在行尾按放得下的字符断。
                cut = windowEnd
                // 规则 4：收尾标点不起行 ⇒ 把前一字连标点一起下移（退一个字）。
                if (cut < line.length && line[cut] in CLOSING_PUNCT && cut - 1 > start) {
                    cut -= 1
                } else if (cut - 1 > start && line[cut - 1] in OPENING_PUNCT) {
                    // 开局标点不留行尾（同属禁则的另一半，见类注释的诚实边界）。
                    cut -= 1
                }
                if (cut <= start) cut = windowEnd // 防御：退到空行时放弃禁则，宁可满行也不出空行
            }
            out += line.substring(start, cut)
            start = cut
        }
        return out
    }

    /**
     * 整段正文的视觉行（每行一条原文行 ⇒ 各自的视觉行列表；**段结构不动**）。
     * 段与段之间仍由调用方用 `stanza-gap` 表达。
     */
    fun breakStanza(lines: List<String>, maxChars: Int): List<List<String>> =
        lines.map { breakLine(it, maxChars) }
}
