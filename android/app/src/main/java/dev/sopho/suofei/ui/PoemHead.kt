package dev.sopho.suofei.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import dev.sopho.suofei.data.Poem

/**
 * 诗页题头：诗题 / 作者行 / 元信息行（时代·体裁）。
 *
 * ⚠️ **规范 §4.1-3：题头不画下划线**（原型 `theme-tech.css`：`.poem-head { border-bottom: none;
 * padding-bottom: 0 }`，覆盖了 `base.css` 里那条 `border-bottom`）。所以**这个文件里不允许出现
 * 任何分割线或边框** —— `VisualTokensConsistencyTest` 会扫这个文件来守这条（谁加回那条线，门就红）。
 * 笔记区上方那条发丝线属于 `.notes { border-top }`，不在题头里，由诗页正文下方那条负责。
 */
@Composable
fun PoemHead(poem: Poem, modifier: Modifier = Modifier) {
    Column(modifier) {
        Text(poem.title, style = PoetryTextStyles.poemTitle)
        Spacer(Modifier.height(PoetryTokens.rem(0.35f)))
        Text(poem.author, style = PoetryTextStyles.author)
        Spacer(Modifier.height(PoetryTokens.rem(0.2f)))
        Text(
            listOfNotNull(poem.dynastyLabel, poem.era, poem.genre).joinToString(" · "),
            style = PoetryTextStyles.meta,
        )
    }
}
