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

    /** 凹陷区 `surface-sunken`. */
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

    /** 搜索命中底色 `mark-bg` = rgba(79,179,165,0.22)。
     *  ⚠ 使用者已随「跨组搜索」一并移除（用户 2026-10-15 决定：第一版不做搜索）。
     *  令牌暂留只为与规范 §2 及 `VisualTokensConsistencyTest` 的「颜色一一对应」门保持一致；
     *  规范里对应条目由负责人删除后，这里应一并移除。 */
    val markBg = Color(0xFF4FB3A5).copy(alpha = 0.22f)

    /** 搜索命中文字 `mark-text`。⚠ 使用者已随跨组搜索移除（2026-10-15），暂留只为规范对齐，同上。 */
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

    /** 笔记标题 0.82rem / 0.1em（原型 `.notes-head .n-title`）。 */
    const val NOTES_TITLE_REM = 0.82f
    const val NOTES_TITLE_LETTER_SPACING = 0.1f

    /** 列表里的作者 0.8rem（原型 `.poemrow .pauthor`, 规范未列）. */
    const val LIST_AUTHOR_REM = 0.8f

    /** 更新提示条等次级行 0.74rem（原型 `.resultrow .r-sub`——原型里那行只在搜索结果用，
     *  本端改成只用在目录页的「新内容已就绪」提示条上）。 */
    const val RESULT_SUB_REM = 0.74f

    /** 空状态 0.84rem（原型 `.blank`），上下各 2.4rem 留白. */
    const val BLANK_REM = 0.84f
    const val BLANK_PAD_VERTICAL_REM = 2.4f

    /** 笔记展开开关 0.76rem（原型 `.notes-head .n-toggle`）. */
    const val NOTES_TOGGLE_REM = 0.76f

    // ── 宽度口径（用户 2026-10-15 选定；采纳锚 `round-2026-10-16-width-pct`）──
    /** `C = min(V, max(320, 0.88 × (V − 24)))` 里的 88%。 */
    const val CONTENT_WIDTH_PCT = 0.88f
    /** 基准 `A = V − 24`：**24 是一次性从视口宽扣掉的总量**，不是「左右各 12px 的外层页边」。
     *  可机器查的形式：V=320 时 C=320 > A=296（若真是两侧各 12，内容宽不可能超过 296）。 */
    const val CONTENT_WIDTH_DEDUCT = 24f
    /** 内容宽下限 320px（最小内容宽）。 */
    const val CONTENT_WIDTH_FLOOR = 320f
    /** 行内沿 `1.05rem`＝16.8px：**列内**的一层（与列外余白 `(V−C)/2` 不是同一件事）。
     *  与令牌 `row-pad` 的横向分量同值（原型写的就是 `--edge-x: 1.05rem`）。 */
    const val EDGE_X_REM = 1.05f

    /**
     * 内容列宽 `C = min(V, max(320, 0.88 × (V − 24)))`；`V`＝视口/窗口宽（dp）。
     *
     * 上界是**视口 V**（不是 A），且**不夹** 660／860 这类上限：320 上列外余白恰好 0，
     * 1180 上 `C=1017.28 > 860` 说明它没有被夹住。列外余白＝`(V−C)/2`。
     */
    fun contentColumnWidth(viewportWidthDp: Float): Float = minOf(
        viewportWidthDp,
        maxOf(CONTENT_WIDTH_FLOOR, CONTENT_WIDTH_PCT * (viewportWidthDp - CONTENT_WIDTH_DEDUCT)),
    )

    /** 正文可用宽＝`C − 2 × 16.8`（列内左右各一条行内沿）。 */
    fun bodyAvailableWidth(contentColumnDp: Float): Float =
        contentColumnDp - 2f * remToDpValue(EDGE_X_REM)

    // ── 顶部行 / 题头（诗页与详情页共用；原型草案值，见 `round-2026-10-16-poem-note`／`…-detail`）──
    /** 顶部行上内边距 `--ctl-top-pad` 0.7rem. */
    const val CTL_TOP_PAD_REM = 0.7f
    /** 顶部行 → 诗题 `--head-pad-top` / `--d-head-top` 1.5rem. */
    const val HEAD_PAD_TOP_REM = 1.5f
    /** 题名 → 身份行 `--title-gap` 0.7rem（本轮任务书固定值）. */
    const val TITLE_GAP_REM = 0.7f
    /** 控件（返回／详情／笔记入口）字号 `--ctl-size` 0.82rem＝13.12px. */
    const val CTL_REM = 0.82f
    /** 控件与身份行的字距 `--ctl-ls` 0.06em. */
    const val CTL_LETTER_SPACING = 0.06f
    /** 顶部行右侧「笔记」与「详情」的缝 `--ctl-gap` 1.1rem（笔记②内部的一个草案值）. */
    const val CTL_GAP_REM = 1.1f

    // ── 目录页（采纳锚 `round-2026-10-15-hub-align`：**悬挂 ＋ 竖直居中**，槽 27.52px／固定缝 0.4rem）──
    /** 悬挂槽宽 27.52px＝1.72rem＝（记号自身宽 21.13px ＋ 固定缝 0.4rem）。
     *  槽从**内容列左沿**量起 ⇒ 组名左沿＝题名左沿＝槽宽（不随宽度变）。 */
    const val MARKER_SLOT_REM = 1.72f
    /** 记号右沿 → 组名左沿的**固定缝** 0.4rem（＝槽内剩下的那一段）. */
    const val MARKER_SEAM_REM = 0.4f
    /** 记号字号 0.8rem、等宽、**不设字距**（设了字距会把空白算进「缝」，量出来的数失真）. */
    const val MARKER_REM = 0.8f
    /** 收起态记号（方括号，方向已由用户局部选定 2026-10-15）. */
    const val MARKER_COLLAPSED = "[+]"
    /** 展开态记号（U+2212 减号，不是连字符）. */
    const val MARKER_EXPANDED = "[\u2212]"
    /** 作者紧**随**题名（不右对齐）：距题名末端 ≈0.45em（实测 5.75px）. */
    const val AUTHOR_GAP_EM = 0.45f

    // ── 详情页（采纳锚 `round-2026-10-16-detail` 的 D0 三项）──
    /** 诗题 → 来源块 `--src-gap-top` 1.6rem. */
    const val SRC_GAP_TOP_REM = 1.6f
    /** 「底本与来源」标签 → 来源文本 `--src-gap-in` 0.35rem. */
    const val SRC_LABEL_GAP_REM = 0.35f
    /** 来源块 → 详情正文 `--sec-gap-top` 1.6rem. */
    const val SEC_GAP_TOP_REM = 1.6f
    /** `### ` 小标题上间距 `--sub-gap-top` 1.6rem（**首个上间距＝0**）. */
    const val SUB_GAP_TOP_REM = 1.6f
    /** `### ` 小标题下间距 `--sub-gap-bottom` 0.5rem. */
    const val SUB_GAP_BOTTOM_REM = 0.5f
    /** 段落之间 `--para-gap` 0.9rem. */
    const val PARA_GAP_REM = 0.9f
    /** 列表项之间 `--li-gap` 0.6rem. */
    const val LI_GAP_REM = 0.6f
    /** 引用块（`> `）左内边距（缩进）—— 左边线复用 [GROUP_BAR_WIDTH_DP] 那条发丝竖线. */
    const val QUOTE_PAD_LEFT_REM = 0.6f
    /** 列表项里「记号 → 文本」的缝. */
    const val LIST_MARKER_GAP_REM = 0.5f
    /** 无序列表项记号（与 Web 的 `<ul>` 默认圆点同义）／有序列表项按出现次序编号. */
    const val UL_MARKER = "•"

    // ── 关于页（采纳锚 `round-2026-10-16-about-min` 的 **V3 标签左对齐**）──
    /** 标签列固定宽 `--kcol` 5.2em＝68.22px（作用在标签字号上）⇒ 值列左沿＝16.8＋68.22＋8＝93.02px. */
    const val KCOL_EM = 5.2f
    /** 标签列 → 值列固定缝 `--k-gap` 0.5rem. */
    const val K_GAP_REM = 0.5f
    /** 节间距 `--sec-gap` 0.9rem（版本组→按钮、状态文本→仓库链接）. */
    const val SEC_GAP_REM = 0.9f
    /** 同组内两行之间／按钮→状态文本 `--row-gap` 0.5rem. */
    const val ROW_GAP_REM = 0.5f
    /** 标签字号 `--label-size` 0.82rem、字距 0.02em. */
    const val ABOUT_LABEL_REM = 0.82f
    const val ABOUT_LABEL_LETTER_SPACING = 0.02f
    /** 值字号 `--value-size` 0.88rem. */
    const val ABOUT_VALUE_REM = 0.88f
    /** 版本号与仓库链接的等宽字号 `--mono-size` 0.86rem. */
    const val ABOUT_MONO_REM = 0.86f
    /** 按钮左右内边距 `--ctl-pad-x` 0.7rem＝11.2px；上下 `--ctl-pad-y` 0.3rem. */
    const val CTL_PAD_X_REM = 0.7f
    const val CTL_PAD_Y_REM = 0.3f
    /** 内容列上下留白 `--col-top` 1.25rem / `--col-bottom` 1rem. */
    const val COL_TOP_REM = 1.25f
    const val COL_BOTTOM_REM = 1f

    /** 关于页标签列宽 `--kcol` 5.2em（作用在标签字号上）＝0.82rem × 5.2 ＝ 68.22px. */
    fun labelColumnDp(): Float = remToDpValue(ABOUT_LABEL_REM) * KCOL_EM

    /**
     * 语义折行的**字位**模型：每个汉字/全角标点占 1 个字位，推进宽＝字号 × (1 + 字距)。
     * 与采纳锚里的口径一致（本机实测 17px×(1+0.045)＝17.766px，独立实测 17.77px）。
     */
    fun charAdvancePx(fontSizePx: Float, letterSpacingEm: Float): Float = fontSizePx * (1f + letterSpacingEm)

    /** 笔记正文相邻两段之间 `--note-gap-p` 0.7em（相对笔记字号）. */
    const val NOTE_PARA_GAP_EM = 0.7f

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

    /** 更新提示条等次级行：0.74rem / 更淡色（原型 `.resultrow .r-sub`；本端只用在目录页提示条）. */
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

    /** 笔记展开开关：0.76rem / 强调色（旧的「笔记」按钮样式，现由顶部行控件样式承担）。 */
    val notesToggle = TextStyle(
        fontFamily = PoetryTokens.fontSans,
        fontSize = PoetryTokens.remToDpValue(PoetryTokens.NOTES_TOGGLE_REM).sp,
        color = PoetryTokens.accentStrong,
    )

    /**
     * 顶部行控件（返回／详情／笔记入口）：`--ctl-size` 0.82rem／0.06em／`--text-dim`，
     * **无边框、无底色**（原型 `.ctl`）。它的字号低于正文，颜色也低于正文 ⇒ 不抢注意力。
     */
    val ctl = TextStyle(
        fontFamily = PoetryTokens.fontSans,
        fontSize = PoetryTokens.remToDpValue(PoetryTokens.CTL_REM).sp,
        letterSpacing = PoetryTokens.CTL_LETTER_SPACING.em,
        color = PoetryTokens.textDim,
    )

    /** 目录页悬挂记号（方括号）：等宽 0.8rem、`--text-faint`、**不设字距**. */
    val marker = TextStyle(
        fontFamily = PoetryTokens.fontMono,
        fontSize = PoetryTokens.remToDpValue(PoetryTokens.MARKER_REM).sp,
        color = PoetryTokens.textFaint,
    )

    /** 详情页「底本与来源」标签：`--note-size` / 500 / `--gname-ls` 0.16em / `--text-faint`. */
    val provLabel = TextStyle(
        fontFamily = PoetryTokens.fontSans,
        fontSize = PoetryTokens.NOTE_SIZE.sp,
        fontWeight = FontWeight(500),
        letterSpacing = PoetryTokens.GROUP_NAME_LETTER_SPACING.em,
        color = PoetryTokens.textFaint,
    )

    /** 详情页来源文本：`--note-size` / 界面行高 1.75 / `--text-dim`. */
    val provText = TextStyle(
        fontFamily = PoetryTokens.fontSans,
        fontSize = PoetryTokens.NOTE_SIZE.sp,
        lineHeight = (PoetryTokens.NOTE_SIZE * PoetryTokens.UI_LINE_HEIGHT).sp,
        letterSpacing = PoetryTokens.UI_LETTER_SPACING.em,
        color = PoetryTokens.textDim,
    )

    /**
     * `### ` 小标题（详情页与笔记同一份 Markdown 渲染器的 heading 块）：
     * `--note-size` 13.5px / 500 / `--gname-ls` 0.16em / `--accent-text`；
     * **没有左侧那条装饰竖线**（返修 2026-10-16：小标题左沿回到正文共同左沿 16.8px）。
     */
    val subHead = TextStyle(
        fontFamily = PoetryTokens.fontSans,
        fontSize = PoetryTokens.NOTE_SIZE.sp,
        fontWeight = FontWeight(500),
        letterSpacing = PoetryTokens.GROUP_NAME_LETTER_SPACING.em,
        color = PoetryTokens.accentText,
    )

    /** 关于页标签：`--label-size` 0.82rem / 0.02em / `--text-dim`. */
    val aboutLabel = TextStyle(
        fontFamily = PoetryTokens.fontSans,
        fontSize = PoetryTokens.remToDpValue(PoetryTokens.ABOUT_LABEL_REM).sp,
        letterSpacing = PoetryTokens.ABOUT_LABEL_LETTER_SPACING.em,
        color = PoetryTokens.textDim,
    )

    /** 关于页值：`--value-size` 0.88rem / `--text`. */
    val aboutValue = TextStyle(
        fontFamily = PoetryTokens.fontSans,
        fontSize = PoetryTokens.remToDpValue(PoetryTokens.ABOUT_VALUE_REM).sp,
        color = PoetryTokens.text,
    )

    /** 关于页里的版本号与仓库链接：等宽 `--mono-size` 0.86rem. */
    val aboutMono = TextStyle(
        fontFamily = PoetryTokens.fontMono,
        fontSize = PoetryTokens.remToDpValue(PoetryTokens.ABOUT_MONO_REM).sp,
        color = PoetryTokens.text,
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
