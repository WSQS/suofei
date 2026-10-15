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
 * 诗页题头：诗题 ／ 题下那一行（**时代 · 作者 · 年代 · 体裁**，见 [poemMetaLine]）。
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
        // 题下只有一行：**时代 · 作者 · 年代 · 体裁**（与 Web 同一口径与顺序；用户 2026-10-15 的页面清单）。
        Text(poemMetaLine(poem), style = PoetryTextStyles.meta)
    }
}
