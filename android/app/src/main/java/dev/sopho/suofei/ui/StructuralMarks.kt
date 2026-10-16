package dev.sopho.suofei.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em

/**
 * **结构记号**（规范 `docs/design/visual-tokens.md` §4.1，两端都要有）。
 *
 * 这三样不是装饰细节，而是「静默终端」表达结构感的方式；漏掉它们，目录页/诗页会与用户评审
 * 通过的那一版长得不一样。所以它们集中在**一个文件**里，值由 `VisualTokensConsistencyTest`
 * 从规范文件逐项比对，行为（`[3] 首` 的形状、悬挂槽的宽度）由 `StructuralMarksTest` 断言。
 *
 * ⚠ **§4.1-1（组名左沿 2px 发丝竖线）已被取代**（负责人 2026-10-16 的裁决，Web 端同步）：
 * 它与目录页的采纳锚相抵 —— 锚是「**悬挂＋竖直居中**」＋「**组名左沿＝题名左沿（缩进 0）**」，
 * 而优先画那条竖线会把组名首字推右约 11.6px（2px 线 ＋ 0.6rem 内边距），与实测
 * 「组名左沿＝27.52px ＝ 悬挂槽宽」不符。⇒ **两端都不画它**；**记号②③照旧**。
 * 本文件保留 [AccentBar]（令牌门要求 `accentLine` 与 `GROUP_BAR_WIDTH_DP` 出现在这里），
 * 它的使用者变成了 **Markdown 引用块（`> `）的左边线** —— 那是 `visual-tokens.md` §6
 * 明确建议的取法（`--accent-line` 作左边线）＋ `md-subset.md` 的「缩进 ＋ 左侧竖线」。
 */

/**
 * 一条发丝竖线：2dp 宽、色＝`accent-line`。
 * 当前使用者：**引用块（`> `）的左边线**；目录页组名旁的那条已按 2026-10-16 裁决取消（见类注释）。
 */
@Composable
fun AccentBar() {
    Box(
        Modifier
            .width(PoetryTokens.GROUP_BAR_WIDTH_DP.dp)
            .fillMaxHeight()
            .background(PoetryTokens.accentLine),
    )
}

/**
 * §4.1-2 计数写成 `[3] 首`：方括号是这套视觉的记号，括号段用 `text-faint` 色、字号 0.85em
 * （数字本身沿用外层的等宽次要色，原型 `.gcount`）。
 */
fun groupCountAnnotated(count: Int): AnnotatedString = buildAnnotatedString {
    val bracket = SpanStyle(
        color = PoetryTokens.textFaint,
        fontSize = PoetryTokens.COUNT_BRACKET_SCALE.em,
    )
    withStyle(bracket) { append("[") }
    append(count.toString())
    withStyle(bracket) { append("]") }
    append(PoetryTokens.COUNT_SUFFIX)
}

/** 同上，纯文本形态（单测/无障碍读取用；界面用带样式的 [groupCountAnnotated]）。 */
fun groupCountText(count: Int): String = groupCountAnnotated(count).text

/** 行内发丝线（原型 `border-bottom: 1px solid var(--line)` 的等价物）. */
@Composable
fun HairLine(modifier: Modifier = Modifier, color: Color = PoetryTokens.line) {
    Box(
        modifier
            .fillMaxWidth()
            .height(PoetryTokens.HAIRLINE_DP.dp)
            .background(color),
    )
}

/** 分组头/结果行的行内边距（原型 `row-pad: 0.9rem 1.05rem`）. */
fun rowPadding(): PaddingValues = PaddingValues(
    horizontal = PoetryTokens.rem(PoetryTokens.ROW_PAD_HORIZONTAL_REM),
    vertical = PoetryTokens.rem(PoetryTokens.ROW_PAD_VERTICAL_REM),
)

/**
 * 目录页的**悬挂记号**（采纳锚 `round-2026-10-15-hub-align` 的 ④ 档：悬挂＋**竖直居中**）。
 *
 * 槽从**内容列左沿**量起、宽＝[PoetryTokens.MARKER_SLOT_REM]（27.52px＝记号自身宽 ＋ 固定缝 0.4rem）；
 * 记号落在槽的起点，于是槽内剩下的那一段就是「固定缝」。组名与诗目题名都从槽的右沿开始（缩进 0）。
 * 记号**只表达状态**，整块组头才是可点区域（`round-2026-10-15-hub-hierarchy` 的 `q-d28c4e4e`）。
 */
@Composable
fun HangingMarker(expanded: Boolean, modifier: Modifier = Modifier) {
    Box(
        modifier.width(PoetryTokens.rem(PoetryTokens.MARKER_SLOT_REM)),
        contentAlignment = Alignment.CenterStart,
    ) {
        Text(
            text = if (expanded) PoetryTokens.MARKER_EXPANDED else PoetryTokens.MARKER_COLLAPSED,
            style = PoetryTextStyles.marker,
        )
    }
}

/**
 * 组名行：`[悬挂记号槽] 组名 ………… [n] 首`（竖直居中）。
 *
 * 外层的行内边距与发丝线由调用方给（**不画卡片**：`round-2026-10-15-hub-hierarchy` 的两个候选
 * 都明确「不画卡片、组头与页底同色」）。
 */
@Composable
fun GroupNameRow(name: String, count: Int, expanded: Boolean) {
    Row(Modifier.height(IntrinsicSize.Min)) {
        HangingMarker(expanded)
        Text(name, style = PoetryTextStyles.groupName, modifier = Modifier.weight(1f))
        Text(groupCountAnnotated(count), style = PoetryTextStyles.monoDim)
    }
}
