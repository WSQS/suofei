package dev.sopho.suofei

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.em
import dev.sopho.suofei.ui.PoetryTokens
import java.io.File
import kotlin.math.abs
import kotlin.math.roundToInt
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 门：**主题里的每个值都必须等于 `docs/design/visual-tokens.md` 里写的值**。
 *
 * 让「值一致」可检查，而不是靠人看截图。测试**不持任何副本**：值一律从规范文件读出来，
 * 再与 `PoetryTokens` 里的值比 —— 规范改了而代码没改（或反过来）都会红。
 * 规范文件读不到 ⇒ 直接失败（不跳过）。
 *
 * 覆盖面：§2 颜色、§3 字体与排版、§4 间距与形状、§4.1 三样结构记号。
 * 另有源码守卫：无阴影/无位移缩放发光动画（§1、§4）、诗页题头不含分割线（§4.1-3）。
 */
class VisualTokensConsistencyTest {

    private companion object {
        const val SPEC_PATH = "docs/design/visual-tokens.md"
        const val SPEC_HINT =
            "修法：确认仓库根下有 $SPEC_PATH（视觉令牌的唯一来源）；本测试不持副本，也不许跳过。"

        val BACKTICK = Regex("`([^`]+)`")
        val HEX = Regex("""#[0-9a-fA-F]{6}""")
        val RGBA = Regex("""rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([0-9.]+)\s*\)""")
        val FLOAT = """([0-9]*\.?[0-9]+)"""

        fun specText(): String = TestRepoFiles.read(SPEC_PATH, SPEC_HINT)

        fun section(text: String, heading: String): String {
            val start = text.indexOf(heading)
            if (start < 0) throw AssertionError("规范里找不到小节「$heading」——本测试据此取值，找不到即失败。")
            val next = text.indexOf("\n## ", start + heading.length)
            return if (next < 0) text.substring(start) else text.substring(start, next)
        }

        fun ticked(cell: String): List<String> = BACKTICK.findAll(cell).map { it.groupValues[1] }.toList()

        /** 一节的表格行（按列拆好）；表头/分隔行去掉。 */
        fun rowsOf(sectionText: String): List<List<String>> = sectionText.lines()
            .filter { it.trim().startsWith("|") }
            .map { line -> line.trim().trim('|').split('|').map { it.trim() } }
            .filter { it.size >= 2 }
            .filterNot { it[0] == "令牌" || it[0] == "#" || it[0].all { c -> c == '-' || c == ':' } }

        /** 把一节里的表格解析成 `令牌 -> 值`；多键行按「键数 == 值数」才一一对应。 */
        fun tokenTable(sectionText: String): Map<String, String> {
            val out = mutableMapOf<String, String>()
            for (cells in rowsOf(sectionText)) {
                val keyCell = cells[0]
                val keys = ticked(keyCell).flatMap { it.split("/") }.map { it.trim() }.filter { it.isNotEmpty() }
                val values = ticked(cells[1])
                if (keys.isNotEmpty() && keys.size == values.size) {
                    keys.forEachIndexed { i, k -> out[k] = values[i] }
                } else {
                    val k = ticked(keyCell).firstOrNull() ?: keyCell
                    out[k] = values.firstOrNull() ?: cells[1]
                }
            }
            return out
        }

        fun hexOf(color: Color): String = "#%02x%02x%02x".format(
            (color.red * 255f).roundToInt(),
            (color.green * 255f).roundToInt(),
            (color.blue * 255f).roundToInt(),
        )

        fun numberIn(value: String): Float {
            val m = Regex(FLOAT).find(value)
                ?: throw AssertionError("从规范值里读不出数字：$value")
            return m.groupValues[1].toFloat()
        }

        /** 规范里 px/rem/em 之类的值 → Android 端的数值（px→sp/dp 1:1，rem→×16）。 */
        fun toAndroidUnit(value: String): Float = when {
            value.endsWith("rem") -> numberIn(value) * PoetryTokens.REM_DP
            value.endsWith("px") -> numberIn(value)
            else -> numberIn(value)
        }

        fun uiSourceFiles(): List<File> =
            TestRepoFiles.mainSourceDir("ui").listFiles { f -> f.name.endsWith(".kt") }?.toList()
                ?: throw AssertionError("ui 源码目录里没有 .kt 文件？")

        fun uiSource(name: String): String =
            File(TestRepoFiles.mainSourceDir("ui"), name).readText(Charsets.UTF_8)

        /** 去掉注释后再扫——注释里允许出现「border-bottom」这类说明性文字。 */
        fun codeOnly(text: String): String = text
            .replace(Regex("""/\*.*?\*/""", RegexOption.DOT_MATCHES_ALL), "")
            .lines()
            .filterNot { it.trim().startsWith("//") || it.trim().startsWith("*") }
            .joinToString("\n")
            .replace(Regex("""//.*"""), "")
    }

    // ── §2 颜色 ────────────────────────────────────────────────────────
    @Test
    fun colors_matchTheSpecExactly_noneMissingNoneInvented() {
        val doc = tokenTable(section(specText(), "## 2. 颜色"))
        val code = mapOf(
            "bg" to PoetryTokens.bg,
            "bg-sticky" to PoetryTokens.bgSticky,
            "bg-pattern" to PoetryTokens.bgPattern,
            "surface" to PoetryTokens.surface,
            "surface-hover" to PoetryTokens.surfaceHover,
            "surface-sunken" to PoetryTokens.surfaceSunken,
            "text" to PoetryTokens.text,
            "text-dim" to PoetryTokens.textDim,
            "text-faint" to PoetryTokens.textFaint,
            "line" to PoetryTokens.line,
            "line-strong" to PoetryTokens.lineStrong,
            "accent" to PoetryTokens.accent,
            "accent-strong" to PoetryTokens.accentStrong,
            "accent-text" to PoetryTokens.accentText,
            "accent-soft" to PoetryTokens.accentSoft,
            "accent-line" to PoetryTokens.accentLine,
            "warn" to PoetryTokens.warn,
            "warn-text" to PoetryTokens.warnText,
            "warn-soft" to PoetryTokens.warnSoft,
            "line-warn" to PoetryTokens.lineWarn,
            "mark-bg" to PoetryTokens.markBg,
            "mark-text" to PoetryTokens.markText,
        )

        // 规范里有的颜色 Android 都必须有；Android 也不许多出规范里没有的颜色。
        val docKeys = doc.keys.filter { it in code.keys || doc.containsKey(it) }.sorted()
        assertEquals(
            buildString {
                appendLine("规范 §2 的颜色与 Android 令牌不是一一对应：")
                appendLine("  只在规范里（Android 少了）：${docKeys - code.keys}")
                appendLine("  只在 Android 里（规范没有）：${(code.keys - docKeys).sorted()}")
                appendLine("  规范解析出的键：$docKeys")
                appendLine("  Android 令牌的键：${code.keys.sorted()}")
            },
            docKeys,
            code.keys.sorted(),
        )

        for ((key, value) in doc) {
            val color = code[key] ?: continue
            val rgba = RGBA.find(value)
            if (rgba != null) {
                val (r, g, b, a) = rgba.destructured
                assertEquals("$key 红通道（规范 $value）", r.toInt(), (color.red * 255f).roundToInt())
                assertEquals("$key 绿通道（规范 $value）", g.toInt(), (color.green * 255f).roundToInt())
                assertEquals("$key 蓝通道（规范 $value）", b.toInt(), (color.blue * 255f).roundToInt())
                assertEquals(
                    "$key 透明度（规范 $value）",
                    a.toFloat(),
                    color.alpha,
                    1f / 255f + 1e-4f,
                )
            } else {
                val hex = HEX.find(value)?.value?.lowercase()
                    ?: throw AssertionError("规范里 $key 的值既不是 #rrggbb 也不是 rgba(...)：$value")
                assertEquals("$key 的值（规范 $value）", hex, hexOf(color))
            }
        }
    }

    // ── §3 字体与排版（正文排版是这套视觉的核心）────────────────────────
    @Test
    fun typography_matchesTheSpecExactly() {
        val doc = tokenTable(section(specText(), "## 3. 字体与排版"))
        fun docNum(key: String) = toAndroidUnit(doc[key] ?: throw AssertionError("规范 §3 里没有 $key"))

        // 界面文字
        assertEquals("font-size", docNum("font-size"), PoetryTokens.UI_SIZE, 1e-3f)
        assertEquals("lh", docNum("lh"), PoetryTokens.UI_LINE_HEIGHT, 1e-3f)
        assertEquals("ls", docNum("ls"), PoetryTokens.UI_LETTER_SPACING, 1e-4f)
        // 正文（读诗区）：17px / 行高 2 / 字距 0.045em
        assertEquals("poem-size", docNum("poem-size"), PoetryTokens.POEM_SIZE, 1e-3f)
        assertEquals("poem-lh（行高倍数）", docNum("poem-lh"), PoetryTokens.POEM_LINE_HEIGHT, 1e-3f)
        assertEquals("poem-ls", docNum("poem-ls"), PoetryTokens.POEM_LETTER_SPACING, 1e-4f)
        // 笔记
        assertEquals("note-size", docNum("note-size"), PoetryTokens.NOTE_SIZE, 1e-3f)
        assertEquals("note-measure", docNum("note-measure"), PoetryTokens.NOTE_MEASURE_EM, 1e-3f)
        // 诗题
        assertEquals("title-size", docNum("title-size"), PoetryTokens.remToDpValue(PoetryTokens.TITLE_REM), 1e-3f)
        assertEquals("title-weight", docNum("title-weight"), PoetryTokens.TITLE_WEIGHT.toFloat(), 1e-3f)
        assertEquals("title-ls", docNum("title-ls"), PoetryTokens.TITLE_LETTER_SPACING, 1e-4f)
        // 字距三项
        assertEquals("brand-ls", docNum("brand-ls"), PoetryTokens.BRAND_LETTER_SPACING, 1e-4f)
        assertEquals("gname-ls", docNum("gname-ls"), PoetryTokens.GROUP_NAME_LETTER_SPACING, 1e-4f)
        assertEquals("ptitle-ls", docNum("ptitle-ls"), PoetryTokens.LIST_TITLE_LETTER_SPACING, 1e-4f)

        // 字体族：规范要求全部无衬线（Android 退到系统无衬线）；等宽只用于技术性文字
        assertTrue("规范 §3 应写明全部无衬线", doc.keys.any { it.contains("font-body") })
        assertEquals("Android 正文/界面字体应为系统无衬线", FontFamily.SansSerif, PoetryTokens.fontSans)
        assertEquals("Android 技术性文字应为等宽", FontFamily.Monospace, PoetryTokens.fontMono)
    }

    // ── §4 间距与形状 ──────────────────────────────────────────────────
    @Test
    fun spacingAndShape_matchTheSpecExactly() {
        val doc = tokenTable(section(specText(), "## 4. 间距与形状"))
        fun docNum(key: String) = toAndroidUnit(doc[key] ?: throw AssertionError("规范 §4 里没有 $key"))

        // 段间空行：正文分段靠它表达，不得为 0
        assertEquals("stanza-gap", docNum("stanza-gap"), PoetryTokens.STANZA_GAP_EM, 1e-3f)
        assertTrue("段间空行不得为 0", PoetryTokens.STANZA_GAP_EM > 0f)

        assertEquals("group-gap", docNum("group-gap"), PoetryTokens.remToDpValue(PoetryTokens.GROUP_GAP_REM), 1e-3f)
        assertEquals("pad", docNum("pad"), PoetryTokens.remToDpValue(PoetryTokens.PAD_REM), 1e-3f)
        assertEquals("measure", docNum("measure"), PoetryTokens.MEASURE_PX, 1e-3f)
        assertEquals("radius", docNum("radius"), PoetryTokens.RADIUS_DP, 1e-3f)
        assertEquals("radius-s", docNum("radius-s"), PoetryTokens.RADIUS_SMALL_DP, 1e-3f)
        assertEquals("radius-pill", docNum("radius-pill"), PoetryTokens.RADIUS_PILL_DP, 1e-3f)

        // row-pad 是一格两值（`0.9rem 1.05rem`），单独拆
        val rowPad = doc["row-pad"] ?: throw AssertionError("规范 §4 里没有 row-pad")
        val parts = Regex("""$FLOAT\s*rem""").findAll(rowPad).map { it.groupValues[1].toFloat() }.toList()
        assertEquals("row-pad 应是两个 rem 值：$rowPad", 2, parts.size)
        assertEquals("row-pad 纵向", parts[0] * PoetryTokens.REM_DP, PoetryTokens.remToDpValue(PoetryTokens.ROW_PAD_VERTICAL_REM), 1e-3f)
        assertEquals("row-pad 横向", parts[1] * PoetryTokens.REM_DP, PoetryTokens.remToDpValue(PoetryTokens.ROW_PAD_HORIZONTAL_REM), 1e-3f)

        // 无阴影
        assertEquals("规范 §4 的 shadow 应为 none", "none", doc["shadow"]?.trim())
        assertFalse("shadow: none ⇒ 不得用阴影", PoetryTokens.USE_SHADOW)

        // 动效：仅 0.15s
        val transition = Regex("""$FLOAT\s*s""").find(section(specText(), "## 4. 间距与形状"))
            ?: throw AssertionError("规范 §4 里读不到动效时长（形如 0.15s）")
        assertEquals(
            "动效时长",
            transition.groupValues[1].toFloat() * 1000f,
            PoetryTokens.TRANSITION_MS.toFloat(),
            1f,
        )
    }

    // ── §4.1 三样结构记号（两端都要有）──────────────────────────────────
    @Test
    fun structuralMarks_matchTheSpecExactly() {
        val marks = section(specText(), "## 4.1 结构记号")
        // §4.1 是一张 3 行表：从「原型实现」那一列（第 3 列）取值，按原型真实写的 CSS / prose 解析
        val rows = rowsOf(marks)
        assertEquals("§4.1 应有三行记号（1 竖线 / 2 计数 / 3 题头）", 3, rows.size)
        val barRow = rows[0][2]
        val countRow = rows[1][2]

        // 记号 1：组名左沿发丝竖线 —— padding-left .6rem; border-left 2px solid var(--accent-line)
        val bar = Regex("""border-left:\s*$FLOAT\s*px\s+solid\s+var\(--([a-z-]+)\)""").find(barRow)
            ?: throw AssertionError("规范 §4.1 里读不到组名竖线规则（border-left: Npx solid var(--…))：$barRow")
        assertEquals("竖线宽（规范 ${bar.groupValues[1]}px）", bar.groupValues[1].toFloat(), PoetryTokens.GROUP_BAR_WIDTH_DP, 1e-3f)
        // 色值必须是规范颜色令牌里的那个（不是随手写的色）
        val lineColorToken = bar.groupValues[2]
        assertEquals("竖线用的颜色令牌应为 accent-line", "accent-line", lineColorToken)
        assertTrue(
            "StructuralMarks.kt 的组名竖线必须用 accentLine 令牌，而不是另写颜色",
            codeOnly(uiSource("StructuralMarks.kt")).contains("accentLine"),
        )
        assertTrue(
            "组名竖线必须取 GROUP_BAR_WIDTH_DP 令牌",
            codeOnly(uiSource("StructuralMarks.kt")).contains("GROUP_BAR_WIDTH_DP"),
        )
        val padLeft = Regex("""padding-left:\s*$FLOAT\s*rem""").find(barRow)
            ?: throw AssertionError("规范 §4.1 里读不到组名左内边距（padding-left: Nrem）：$barRow")
        assertEquals(
            "组名左内边距（规范 ${padLeft.groupValues[1]}rem）",
            padLeft.groupValues[1].toFloat() * PoetryTokens.REM_DP,
            PoetryTokens.remToDpValue(PoetryTokens.GROUP_BAR_PADDING_LEFT_REM),
            1e-3f,
        )

        // 记号 2：计数写成 `[3] 首`
        assertTrue("规范 §4.1 应写明计数形状 `[3] 首`", marks.contains("[3] 首"))
        assertEquals("计数形状必须与规范一致", "[3] 首", dev.sopho.suofei.ui.groupCountText(3))
        assertTrue("括号应写进实现（content:'[' / content:']'）", countRow.contains("content:'['") && countRow.contains("content:']'"))
        // 括号色必须指明用规范里的 text-faint 令牌（而不是另写一个色）
        assertTrue("§4.1 应指明括号色是 text-faint：${ticked(countRow)}", ticked(countRow).any { it == "--text-faint" })
        val bracketScale = Regex("""$FLOAT\s*em""").find(countRow)
            ?: throw AssertionError("规范 §4.1 里读不到括号字号（Nem）：$countRow")
        assertEquals(
            "括号字号（规范 ${bracketScale.groupValues[1]}em）",
            bracketScale.groupValues[1].toFloat(),
            PoetryTokens.COUNT_BRACKET_SCALE,
            1e-3f,
        )
        val bracketMargin = Regex("""$FLOAT\s*px""").find(countRow)
            ?: throw AssertionError("规范 §4.1 里读不到括号内外留白（Npx）：$countRow")
        assertEquals(
            "括号内外留白（规范 ${bracketMargin.groupValues[1]}px）",
            bracketMargin.groupValues[1].toFloat(),
            PoetryTokens.COUNT_BRACKET_MARGIN_DP,
            1e-3f,
        )
        assertEquals(
            "括号字号在实现里应是 ${PoetryTokens.COUNT_BRACKET_SCALE}em（相对数字字号）",
            PoetryTokens.COUNT_BRACKET_SCALE.em,
            dev.sopho.suofei.ui.groupCountAnnotated(3).spanStyles.first().item.fontSize,
        )
        // 括号色＝text-faint（且与 §2 的 text-faint 同一个值）
        val docTextFaint = HEX.find(
            tokenTable(section(specText(), "## 2. 颜色"))["text-faint"]
                ?: throw AssertionError("规范 §2 里没有 text-faint"),
        )?.value?.lowercase()
        assertEquals("括号色应为 text-faint", docTextFaint, hexOf(PoetryTokens.textFaint))
        assertEquals(
            "括号段必须用 textFaint 色",
            PoetryTokens.textFaint,
            dev.sopho.suofei.ui.groupCountAnnotated(3).spanStyles.first().item.color,
        )

        // 记号 3：诗页题头不画下划线
        assertTrue("规范 §4.1 应写明题头 border-bottom: none", rows[2][2].contains("border-bottom: none"))
        assertFalse("题头不得加下划线", PoetryTokens.POEM_HEAD_HAS_BOTTOM_RULE)
        val head = codeOnly(uiSource("PoemHead.kt"))
        for (pattern in listOf("HorizontalDivider", "Divider(", "border(", "BorderStroke")) {
            assertFalse(
                "题头（PoemHead.kt）里不得出现分割线/边框（规范 §4.1-3），但出现了：$pattern",
                head.contains(pattern),
            )
        }
    }

    // ── 源码守卫：无阴影、无位移/缩放/发光动画 ───────────────────────────
    @Test
    fun uiHasNoShadowAndNoMotionAnimations() {
        val forbidden = listOf(
            "Modifier.shadow(" to "阴影（规范：shadow: none）",
            "animateFloatAsState" to "位移/缩放式动画（规范：不做位移/缩放动画）",
            "Modifier.scale(" to "缩放（规范：不做缩放）",
            "Modifier.rotate(" to "旋转（规范未允许）",
            "Modifier.graphicsLayer" to "位移/变换（规范：不做位移动画）",
            "radialGradient" to "发光/径向渐变（规范：不用霓虹/发光）",
            "horizontalGradient" to "渐变高光（规范：不用渐变高光）",
            "verticalGradient" to "渐变高光（规范：不用渐变高光）",
        )
        val elevationRegex = Regex("""elevation\s*=\s*([0-9.]+)\s*\.dp""")
        for (file in uiSourceFiles()) {
            val code = codeOnly(file.readText(Charsets.UTF_8))
            for ((pattern, why) in forbidden) {
                assertFalse("${file.name} 里出现了 $pattern —— $why", code.contains(pattern))
            }
            elevationRegex.findAll(code).forEach { m ->
                assertTrue(
                    "${file.name} 里 elevation 只能是 0.dp（规范：无阴影），实际是 ${m.groupValues[1]}.dp",
                    abs(m.groupValues[1].toFloat()) < 0.001f,
                )
            }
        }
    }
}
