package dev.sopho.suofei.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import dev.sopho.suofei.data.Poem

/**
 * 诗页题头：诗题 ／ 题下那一行（**作者 · 朝代 · 体裁**，见 [poemMetaLine]）。
 *
 * **全部居中**（采纳锚 `round-2026-10-15-poem-align`／`2026-10-16-width-pct` §3）：题名与身份行
 * 各自居中；间距＝题名→身份行 **0.7rem**（采纳锚的固定值），身份行→原文 2.1rem 由诗页正文块给。
 *
 * ⚠️ **规范 §4.1-3：题头不画下划线**（原型 `theme-tech.css`：`.poem-head { border-bottom: none;
 * padding-bottom: 0 }`）。所以**这个文件里不允许出现任何分割线或边框** ——
 * `VisualTokensConsistencyTest` 会扫这个文件来守这条（谁加回那条线，门就红）。
 */
@Composable
fun PoemHead(poem: Poem, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth()) {
        Text(
            poem.title,
            style = PoetryTextStyles.poemTitle,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(PoetryTokens.rem(PoetryTokens.TITLE_GAP_REM)))
        Text(
            poemMetaLine(poem),
            style = PoetryTextStyles.meta,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}
