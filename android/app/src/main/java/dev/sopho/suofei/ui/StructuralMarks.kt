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
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.dp

/**
 * **结构记号**（规范 `docs/design/visual-tokens.md` §4.1，两端都要有）。
 *
 * 这三样不是装饰细节，而是「静默终端」表达结构感的方式；漏掉它们，目录页/诗页会与用户评审
 * 通过的那一版长得不一样。所以它们集中在**一个文件**里，值由 `VisualTokensConsistencyTest`
 * 从规范文件逐项比对，行为（`[3] 首` 的形状）由 `StructuralMarksTest` 断言。
 */

/** §4.1-1 组名左沿一条发丝竖线：2dp 宽、色＝`accent-line`. */
@Composable
fun GroupNameBar() {
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
 * 组名行：`[竖线] 组名 ………… [n] 首`（§4.1-1 + §4.1-2）。
 * 外层卡片（边框/圆角/底色/行内边距）由调用方给，这里只管这一行的内容。
 */
@Composable
fun GroupNameRow(name: String, count: Int) {
    Row(Modifier.height(IntrinsicSize.Min)) {
        GroupNameBar()
        Spacer(Modifier.width(PoetryTokens.rem(PoetryTokens.GROUP_BAR_PADDING_LEFT_REM)))
        Text(name, style = PoetryTextStyles.groupName, modifier = Modifier.weight(1f))
        Text(groupCountAnnotated(count), style = PoetryTextStyles.monoDim)
    }
}
