package dev.sopho.suofei.ui

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp

/**
 * 「静默终端」令牌 —— **唯一来源 `docs/design/visual-tokens.md`**（其源头是评审通过的原型
 * `prototype/css/theme-tech.css`）。**值必须逐项一致，不得自行微调**；改这里＝改视觉决定，
 * 要先经用户评审。
 *
 * 本文件是 Android 端**唯一**放令牌的地方（界面不得各写各的颜色/字号）。
 * 一致性由单测 `VisualTokensConsistencyTest` 把关：它读那份规范文件、逐项与这里的值比对，
 * 规范文件读不到就失败（不跳过）。
 *
 * 单位换算（Web → Android）：
 * - 颜色：`#rrggbb` → `0xFFrrggbb`；`rgba(r,g,b,a)` → 同基色 `.copy(alpha = a)`
 * - 文字大小：`px` → `sp`（跟随系统字体缩放）；`1.5rem` 之类先按 `1rem = 16px` 折成 px（见 [REM_DP]）
 * - 间距/圆角：`px`/`rem` → `dp`（1:1，见 [REM_DP]）
 * - 行高：规范给的是倍数（`lh`/`poem-lh`）→ `lineHeight = fontSize × 倍数`
 * - 字距：`em` → Compose 的 `em` 单位（不折算成 sp，避免与字号脱钩）
 */
object PoetryTokens {

    /** Web 的 `1rem = 16px` 换算基准；px/rem → dp 也是它。 */
    const val REM_DP: Float = 16f

    // ── 颜色（规范 §2，逐项对应）──────────────────────────────────────
    /** 页面底色 `bg`. */
    val bg = Color(0xFF0E1315)

    /** 吸顶栏 `bg-sticky` = rgba(14,19,21,0.92). */
    val bgSticky = Color(0xFF0E1315).copy(alpha = 0.92f)

    /** `bg-pattern`（极淡网格）。规范 §5 明确「移动端可省、但不得用别的方式替代科技感」，故本端不渲染，仅保留令牌。 */
    val bgPattern = Color(0xFFFFFFFF).copy(alpha = 0.028f)

    /** 卡片/行 `surface`. */
    val surface = Color(0xFF141B1E)

    /** 行悬停 `surface-hover`。触摸端没有 hover，仅保留令牌以便与规范逐项对齐。 */
    val surfaceHover = Color(0xFF182124)

    /** 凹陷区（搜索结果）`surface-sunken`. */
    val surfaceSunken = Color(0xFF111719)

    /** 正文 `text`. */
    val text = Color(0xFFDDE5E4)

    /** 次要文字 `text-dim`. */
    val textDim = Color(0xFF98A8A6)

    /** 更淡的小字（来源/计数）`text-faint`。 */
    val textFaint = Color(0xFF788A88)

    /** 发丝分隔线 `line`. */
    val line = Color(0xFF233034)

    /** 稍强分隔线 `line-strong`. */
    val lineStrong = Color(0xFF35494D)

    /** 强调 `accent`（低饱和青绿）。 */
    val accent = Color(0xFF4FB3A5)

    /** 强调-强 `accent-strong`. */
    val accentStrong = Color(0xFF62C6B7)

    /** 强调文字 `accent-text`. */
    val accentText = Color(0xFF7FD4C6)

    /** 强调底 `accent-soft` = rgba(79,179,165,0.10). */
    val accentSoft = Color(0xFF4FB3A5).copy(alpha = 0.10f)

    /** 强调边 `accent-line` = rgba(79,179,165,0.38). */
    val accentLine = Color(0xFF4FB3A5).copy(alpha = 0.38f)

    /** 提示 `warn`（如「测试数据」横幅）。 */
    val warn = Color(0xFFC9A24A)

    /** 提示文字 `warn-text`. */
    val warnText = Color(0xFFDCC078)

    /** 提示底色 `warn-soft` = rgba(201,162,74,0.08). */
    val warnSoft = Color(0xFFC9A24A).copy(alpha = 0.08f)

    /** 提示边框 `line-warn` = rgba(201,162,74,0.34). */
    val lineWarn = Color(0xFFC9A24A).copy(alpha = 0.34f)

    /** 搜索命中底色 `mark-bg` = rgba(79,179,165,0.22). 本端搜索暂不高亮命中，令牌先就位。 */
    val markBg = Color(0xFF4FB3A5).copy(alpha = 0.22f)

    /** 搜索命中文字 `mark-text`. */
    val markText = Color(0xFFEAF5F3)

    // ── 字体与排版（规范 §3）──────────────────────────────────────────
    /** 全部无衬线（规范：Android 退到系统无衬线即可，**不需要宋体**）。 */
    val fontSans = FontFamily.SansSerif

    /** 仅用于 id/计数这类技术性文字。 */
    val fontMono = FontFamily.Monospace

    /** 界面文字 `font-size` 15px. */
    const val UI_SIZE = 15f

    /** 界面行高 `lh` 1.75. */
    const val UI_LINE_HEIGHT = 1.75f

    /** 界面字距 `ls` 0.005em. */
    const val UI_LETTER_SPACING = 0.005f

    /** **正文（读诗区）** `poem-size` 17px —— 这套视觉的核心之一。 */
    const val POEM_SIZE = 17f

    /** **正文行高** `poem-lh` 2 —— 核心之二。 */
    const val POEM_LINE_HEIGHT = 2f

    /** **正文字距** `poem-ls` 0.045em —— 核心之三。 */
    const val POEM_LETTER_SPACING = 0.045f

    /** 笔记 `note-size` 13.5px. */
    const val NOTE_SIZE = 13.5f

    /** 笔记最大宽度 `note-measure` 36em（移动端本来就窄于它，不施加；令牌保留）。 */
    const val NOTE_MEASURE_EM = 36f

    /** 诗题 `title-size` 1.5rem. */
    const val TITLE_REM = 1.5f

    /** 诗题字重 `title-weight` 500. */
    const val TITLE_WEIGHT = 500

    /** 诗题字距 `title-ls` 0.1em. */
    const val TITLE_LETTER_SPACING = 0.1f

    /** 诗题行高 1.4（规范未列，取原型 `base.css` 的 `.poem-head h1 { line-height: 1.4 }`）。 */
    const val TITLE_LINE_HEIGHT = 1.4f

    /** 品牌名「索斐」字距 `brand-ls` 0.3em. */
    const val BRAND_LETTER_SPACING = 0.3f

    /** 品牌字号 1.02rem（规范未列字号，取原型 `base.css` 的 `.brand`）。 */
    const val BRAND_REM = 1.02f

    /** 组名字号 1.3rem（规范只给 `gname-ls`，字号取原型 `.grouprow .gname`）。 */
    const val GROUP_NAME_REM = 1.3f

    /** 组名字距 `gname-ls` 0.16em. */
    const val GROUP_NAME_LETTER_SPACING = 0.16f

    /** 列表里的诗题 1.08rem（原型 `.poemrow .ptitle`）. */
    const val LIST_TITLE_REM = 1.08f

    /** 列表里的诗题字距 `ptitle-ls` 0.06em. */
    const val LIST_TITLE_LETTER_SPACING = 0.06f

    /** 诗页作者行 0.95rem / 0.14em（原型 `.p-author`）。 */
    const val AUTHOR_REM = 0.95f
    const val AUTHOR_LETTER_SPACING = 0.14f

    /** 诗页元信息行（时代·体裁）0.78rem / 0.06em（原型 `.p-meta`）。 */
    const val META_REM = 0.78f
    const val META_LETTER_SPACING = 0.06f

    /** 技术性小字（版本号等）0.76rem（原型 `.gcount`）. */
    const val MONO_REM = 0.76f

    /** 搜索输入 0.92rem（原型 `.search input`）. */
    const val SEARCH_INPUT_REM = 0.92f

    /** 笔记标题 0.82rem / 0.1em（原型 `.notes-head .n-title`）。 */
    const val NOTES_TITLE_REM = 0.82f
    const val NOTES_TITLE_LETTER_SPACING = 0.1f

    /** 列表里的作者 0.8rem（原型 `.poemrow .pauthor`, 规范未列）. */
    const val LIST_AUTHOR_REM = 0.8f

    /** 搜索结果诗题 1.05rem（原型 `.resultrow .r-title`）. */
    const val RESULT_TITLE_REM = 1.05f

    /** 搜索结果里的时代小标签 0.66rem / 0.08em（原型 `.resultrow .r-dyn`：accent-strong + accent-line 边框 + 圆角 pill）. */
    const val RESULT_CHIP_REM = 0.66f
    const val RESULT_CHIP_LETTER_SPACING = 0.08f
    const val RESULT_CHIP_PAD_VERTICAL_REM = 0.05f
    const val RESULT_CHIP_PAD_HORIZONTAL_REM = 0.4f

    /** 搜索结果次级行 0.74rem（原型 `.resultrow .r-sub`）. */
    const val RESULT_SUB_REM = 0.74f

    /** 空状态 0.84rem（原型 `.blank`），上下各 2.4rem 留白. */
    const val BLANK_REM = 0.84f
    const val BLANK_PAD_VERTICAL_REM = 2.4f

    /** 笔记展开开关 0.76rem（原型 `.notes-head .n-toggle`）. */
    const val NOTES_TOGGLE_REM = 0.76f

    // ── 间距与形状（规范 §4）──────────────────────────────────────────
    /** 段间空行 `stanza-gap` **1.2em**：正文分段靠它表达，**不得为 0**。 */
    const val STANZA_GAP_EM = 1.2f

    /** 组间距 `group-gap` 0.6rem. */
    const val GROUP_GAP_REM = 0.6f

    /** 行内边距 `row-pad` 0.9rem 1.05rem. */
    const val ROW_PAD_VERTICAL_REM = 0.9f
    const val ROW_PAD_HORIZONTAL_REM = 1.05f

    /** 页面留白 `pad` 1.25rem. */
    const val PAD_REM = 1.25f

    /** 正文最大宽度 `measure` 660px：手机屏本来就窄于它，Android 端不施加（规范 §5 也未映射）。 */
    const val MEASURE_PX = 660f

    /** 圆角 `radius` / `radius-s` / `radius-pill` = 4px / 3px / 3px. */
    const val RADIUS_DP = 4f
    const val RADIUS_SMALL_DP = 3f
    const val RADIUS_PILL_DP = 3f

    /** `shadow: none` —— 本端不用 elevation（见 `PoetryShapes` 与各处的 `elevation = 0.dp`）。 */
    const val USE_SHADOW = false

    /** 动效：仅颜色/边框/底色 0.15s；**不做位移/缩放/发光动画**。 */
    const val TRANSITION_MS = 150

    /** 行内发丝线宽度（原型 `border: 1px solid var(--line)`）. */
    const val HAIRLINE_DP = 1f

    /** 诗页正文上/下留白 2.1rem / 0.6rem（原型 `.poem-body { padding: 2.1rem 0 0.6rem }`）. */
    const val POEM_BODY_TOP_REM = 2.1f
    const val POEM_BODY_BOTTOM_REM = 0.6f

    /** 笔记区：上间距 2.6rem、上内边距 1rem、上方一条发丝线（原型 `.notes`）. */
    const val NOTES_TOP_REM = 2.6f
    const val NOTES_PAD_TOP_REM = 1f

    /** 结果行：列间距 0.7rem、两行行距 0.2rem（原型 `.resultrow { gap: 0.2rem 0.7rem }`）. */
    const val RESULT_ROW_GAP_REM = 0.7f
    const val RESULT_LINE_GAP_REM = 0.2f

    /** 搜索命中高亮内边距 0.05em（原型 `mark { padding: 0 0.05em }`）. */
    const val MARK_PAD_EM = 0.05f

    // ── 结构记号（规范 §4.1，两端都要有）────────────────────────────
    /** §4.1-1 组名左沿一条发丝竖线：2px 宽 + 左内边距 .6rem. */
    const val GROUP_BAR_WIDTH_DP = 2f
    const val GROUP_BAR_PADDING_LEFT_REM = 0.6f

    /** §4.1-2 计数 `[3] 首`：括号 0.85em、内外各 1px、色＝text-faint；数字后方是「首」. */
    const val COUNT_BRACKET_SCALE = 0.85f
    const val COUNT_BRACKET_MARGIN_DP = 1f
    const val COUNT_SUFFIX = " 首"

    /** §4.1-3 诗页题头**不画下划线**：由 `ui/PoemHead.kt` 的实现不出现任何分割线/边框来落实，并由单测门守住。 */
    const val POEM_HEAD_HAS_BOTTOM_RULE = false

    /** 组名/品牌等在文本前留出的内缩，按 rem 折算。 */
    fun rem(value: Float): Dp = (value * REM_DP).dp

    fun remToDpValue(value: Float): Float = value * REM_DP
}

/** 颜色与排版的语义样式；界面只用这些，不各自写字号/颜色。 */
object PoetryTextStyles {

    /** 界面文字：15px / 1.75 / 0.005em. */
    val ui = TextStyle(
        fontFamily = PoetryTokens.fontSans,
        fontSize = PoetryTokens.UI_SIZE.sp,
        lineHeight = (PoetryTokens.UI_SIZE * PoetryTokens.UI_LINE_HEIGHT).sp,
        letterSpacing = PoetryTokens.UI_LETTER_SPACING.em,
        color = PoetryTokens.text,
    )

    /** 正文：17px / 行高 2 / 字距 0.045em —— 读诗区的核心排版。 */
    val poem = TextStyle(
        fontFamily = PoetryTokens.fontSans,
        fontSize = PoetryTokens.POEM_SIZE.sp,
        lineHeight = (PoetryTokens.POEM_SIZE * PoetryTokens.POEM_LINE_HEIGHT).sp,
        letterSpacing = PoetryTokens.POEM_LETTER_SPACING.em,
        color = PoetryTokens.text,
    )

    /** 笔记：13.5px（行高沿用界面文字的 1.75 —— 规范未给笔记行高）. */
    val note = TextStyle(
        fontFamily = PoetryTokens.fontSans,
        fontSize = PoetryTokens.NOTE_SIZE.sp,
        lineHeight = (PoetryTokens.NOTE_SIZE * PoetryTokens.UI_LINE_HEIGHT).sp,
        letterSpacing = PoetryTokens.UI_LETTER_SPACING.em,
        color = PoetryTokens.text,
    )

    /** 诗题：1.5rem / 500 / 0.1em / 行高 1.4. */
    val poemTitle = TextStyle(
        fontFamily = PoetryTokens.fontSans,
        fontSize = PoetryTokens.remToDpValue(PoetryTokens.TITLE_REM).sp,
        fontWeight = FontWeight(PoetryTokens.TITLE_WEIGHT),
        letterSpacing = PoetryTokens.TITLE_LETTER_SPACING.em,
        lineHeight = (PoetryTokens.remToDpValue(PoetryTokens.TITLE_REM) * PoetryTokens.TITLE_LINE_HEIGHT).sp,
        color = PoetryTokens.text,
    )

    /** 品牌名「索斐」：1.02rem / 0.3em（顶栏） */
    val brand = TextStyle(
        fontFamily = PoetryTokens.fontSans,
        fontSize = PoetryTokens.remToDpValue(PoetryTokens.BRAND_REM).sp,
        letterSpacing = PoetryTokens.BRAND_LETTER_SPACING.em,
        color = PoetryTokens.text,
    )

    /** 组名：1.3rem / 0.16em（字重规范未给，用默认 400，不再自设 SemiBold）. */
    val groupName = TextStyle(
        fontFamily = PoetryTokens.fontSans,
        fontSize = PoetryTokens.remToDpValue(PoetryTokens.GROUP_NAME_REM).sp,
        letterSpacing = PoetryTokens.GROUP_NAME_LETTER_SPACING.em,
        color = PoetryTokens.text,
    )

    /** 列表里的诗题：1.08rem / 0.06em. */
    val listTitle = TextStyle(
        fontFamily = PoetryTokens.fontSans,
        fontSize = PoetryTokens.remToDpValue(PoetryTokens.LIST_TITLE_REM).sp,
        letterSpacing = PoetryTokens.LIST_TITLE_LETTER_SPACING.em,
        color = PoetryTokens.text,
    )

    /** 列表里的作者：0.8rem + 次要色（原型 `.pauthor`）. */
    val listAuthor = TextStyle(
        fontFamily = PoetryTokens.fontSans,
        fontSize = PoetryTokens.remToDpValue(PoetryTokens.LIST_AUTHOR_REM).sp,
        color = PoetryTokens.textDim,
    )

    /** 搜索结果诗题：1.05rem / 0.06em. */
    val resultTitle = TextStyle(
        fontFamily = PoetryTokens.fontSans,
        fontSize = PoetryTokens.remToDpValue(PoetryTokens.RESULT_TITLE_REM).sp,
        letterSpacing = PoetryTokens.LIST_TITLE_LETTER_SPACING.em,
        color = PoetryTokens.text,
    )

    /** 搜索结果里的时代小标签：等宽 0.66rem / 0.08em / 强调色. */
    val resultChip = TextStyle(
        fontFamily = PoetryTokens.fontMono,
        fontSize = PoetryTokens.remToDpValue(PoetryTokens.RESULT_CHIP_REM).sp,
        letterSpacing = PoetryTokens.RESULT_CHIP_LETTER_SPACING.em,
        color = PoetryTokens.accentStrong,
    )

    /** 搜索结果次级行：0.74rem / 更淡色. */
    val resultSub = TextStyle(
        fontFamily = PoetryTokens.fontSans,
        fontSize = PoetryTokens.remToDpValue(PoetryTokens.RESULT_SUB_REM).sp,
        color = PoetryTokens.textFaint,
    )

    /** 空状态：0.84rem / 更淡色. */
    val blank = TextStyle(
        fontFamily = PoetryTokens.fontSans,
        fontSize = PoetryTokens.remToDpValue(PoetryTokens.BLANK_REM).sp,
        color = PoetryTokens.textFaint,
    )

    /** 诗页作者行：0.95rem / 0.14em / 次要色. */
    val author = TextStyle(
        fontFamily = PoetryTokens.fontSans,
        fontSize = PoetryTokens.remToDpValue(PoetryTokens.AUTHOR_REM).sp,
        letterSpacing = PoetryTokens.AUTHOR_LETTER_SPACING.em,
        color = PoetryTokens.textDim,
    )

    /** 诗页元信息/来源：0.78rem / 0.06em / 更淡色. */
    val meta = TextStyle(
        fontFamily = PoetryTokens.fontSans,
        fontSize = PoetryTokens.remToDpValue(PoetryTokens.META_REM).sp,
        letterSpacing = PoetryTokens.META_LETTER_SPACING.em,
        color = PoetryTokens.textFaint,
    )

    /** 技术性小字（版本号等）：等宽 0.76rem / 更淡色. */
    val monoFaint = TextStyle(
        fontFamily = PoetryTokens.fontMono,
        fontSize = PoetryTokens.remToDpValue(PoetryTokens.MONO_REM).sp,
        color = PoetryTokens.textFaint,
    )

    /** 计数等：等宽 0.76rem / 次要色（原型 `.gcount`）. */
    val monoDim = TextStyle(
        fontFamily = PoetryTokens.fontMono,
        fontSize = PoetryTokens.remToDpValue(PoetryTokens.MONO_REM).sp,
        color = PoetryTokens.textDim,
    )

    /** 笔记标题：0.82rem / 0.1em / 次要色. */
    val notesTitle = TextStyle(
        fontFamily = PoetryTokens.fontSans,
        fontSize = PoetryTokens.remToDpValue(PoetryTokens.NOTES_TITLE_REM).sp,
        letterSpacing = PoetryTokens.NOTES_TITLE_LETTER_SPACING.em,
        color = PoetryTokens.textDim,
    )

    /** 笔记展开开关：0.76rem / 强调色. */
    val notesToggle = TextStyle(
        fontFamily = PoetryTokens.fontSans,
        fontSize = PoetryTokens.remToDpValue(PoetryTokens.NOTES_TOGGLE_REM).sp,
        color = PoetryTokens.accentStrong,
    )

    /** 次要说明（提示/空状态）：界面字号 + 次要色. */
    val muted = ui.copy(color = PoetryTokens.textDim)

    /** 更淡的说明：界面字号 + 更淡色. */
    val faint = ui.copy(color = PoetryTokens.textFaint)
}

/** 段间空行＝正文字号的 1.2em（跟随系统字体缩放换算成 dp）。 */
@Composable
fun poemStanzaGap(): Dp = with(LocalDensity.current) {
    (PoetryTokens.POEM_SIZE * PoetryTokens.STANZA_GAP_EM).sp.toDp()
}

private val PoetryColorScheme = darkColorScheme(
    primary = PoetryTokens.accent,
    onPrimary = PoetryTokens.bg,
    primaryContainer = PoetryTokens.accentSoft,
    onPrimaryContainer = PoetryTokens.accentText,
    secondary = PoetryTokens.accentStrong,
    onSecondary = PoetryTokens.bg,
    tertiary = PoetryTokens.accentText,
    onTertiary = PoetryTokens.bg,
    background = PoetryTokens.bg,
    onBackground = PoetryTokens.text,
    surface = PoetryTokens.surface,
    onSurface = PoetryTokens.text,
    surfaceVariant = PoetryTokens.surfaceSunken,
    onSurfaceVariant = PoetryTokens.textDim,
    surfaceTint = PoetryTokens.accent,
    surfaceBright = PoetryTokens.surface,
    surfaceDim = PoetryTokens.surfaceSunken,
    // 下面这几个 surface 角色在 Material3 里各有一批组件默认取用（Card/菜单等）。
    // 不留默认值，否则会漏出 Material 默认的紫灰底 —— 规范里只有一套颜色。
    surfaceContainerLowest = PoetryTokens.surfaceSunken,
    surfaceContainerLow = PoetryTokens.surface,
    surfaceContainer = PoetryTokens.surface,
    surfaceContainerHigh = PoetryTokens.surface,
    surfaceContainerHighest = PoetryTokens.surface,
    inverseSurface = PoetryTokens.text,
    inverseOnSurface = PoetryTokens.bg,
    inversePrimary = PoetryTokens.accent,
    outline = PoetryTokens.line,
    outlineVariant = PoetryTokens.lineStrong,
    error = PoetryTokens.warn,
    onError = PoetryTokens.bg,
    errorContainer = PoetryTokens.warnSoft,
    onErrorContainer = PoetryTokens.warnText,
    scrim = PoetryTokens.bg,
)

private val PoetryTypography = Typography(
    bodyLarge = PoetryTextStyles.ui,
    bodyMedium = PoetryTextStyles.ui,
    bodySmall = PoetryTextStyles.ui,
    labelLarge = PoetryTextStyles.ui,
    labelMedium = PoetryTextStyles.ui,
    labelSmall = PoetryTextStyles.ui,
    titleSmall = PoetryTextStyles.listTitle,
    titleMedium = PoetryTextStyles.groupName,
    titleLarge = PoetryTextStyles.groupName,
    headlineSmall = PoetryTextStyles.poemTitle,
    headlineMedium = PoetryTextStyles.poemTitle,
    displaySmall = PoetryTextStyles.poemTitle,
)

private val PoetryShapes = Shapes(
    extraSmall = RoundedCornerShape(PoetryTokens.RADIUS_PILL_DP.dp),
    small = RoundedCornerShape(PoetryTokens.RADIUS_SMALL_DP.dp),
    medium = RoundedCornerShape(PoetryTokens.RADIUS_DP.dp),
    large = RoundedCornerShape(PoetryTokens.RADIUS_DP.dp),
    extraLarge = RoundedCornerShape(PoetryTokens.RADIUS_DP.dp),
)

/**
 * 单主题（用户已定）：只有这一套颜色，**不做浅色备选、不做切换开关**。
 * Web 侧同源：`web/styles.css` 用同名 CSS 变量。
 */
@Composable
fun PoetryTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = PoetryColorScheme,
        typography = PoetryTypography,
        shapes = PoetryShapes,
        content = content,
    )
}
