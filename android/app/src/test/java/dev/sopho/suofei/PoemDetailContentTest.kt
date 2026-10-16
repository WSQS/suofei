package dev.sopho.suofei

import dev.sopho.suofei.data.ContentParser
import dev.sopho.suofei.ui.Markdown
import java.io.File
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 诗歌详情页要呈现的东西**从产物里真解析出来**算，不是「页面不为空」。
 *
 * ⚠ **2026-10-16 的实质变化（必须写清）**：字段集升版（`formatVersion` 2）后，产物里**不再有 `variants`**——
 * 异文（24 条 / 13 首）改由每首的 `## 详情` 节整段进 `detail`（Markdown），那一步是**内容迁移（S3）**，
 * 并且**已经落进内置产物**：`content/poems/古诗十九首/` 里 13 首有 `## 详情` ⇒ 内置产物这 13 首的
 * `detail` **非空**，其余 6 首 `null`（真实状态，不是丢数据）；`notes` 仍全为 `null`。
 * ⇒ 详情页那句「这一首在产物里没有详情正文。」现在只对**那 6 首**显示（逐首与源文对照的强断言在
 * `ContentParserTest.detailAndNotes_reflectTheSourceProduct_forEveryPoem`）。
 */
class PoemDetailContentTest {

    private val content = ContentParser.parse(
        File("src/main/assets/content/content.json").readText(Charsets.UTF_8),
    )

    @Test
    fun detailIsPresentWhereTheSourceHasASection_andTheEmptyHintCoversOnlyTheRest() {
        assertEquals(19, content.poems.size)
        val withDetail = content.poems.filter { it.detail != null }
        val withoutDetail = content.poems.filter { it.detail == null }
        // 与源文一致（`content/poems/古诗十九首/` 里 13 首有 `## 详情`）。
        assertEquals("带 `## 详情` 的应是 13 首", 13, withDetail.size)
        assertEquals("没有详情正文的应是 6 首（详情页只对它们显示「没有详情正文」这句实话）", 6, withoutDetail.size)
        assertTrue("带详情的正文不得是空白占位", withDetail.all { !it.detail!!.isBlank() })
        // 详情页的最小 Markdown 渲染要吃的就是 `### 小标题` 这种形状（S3 写的是「异文／分段依据」）
        assertTrue("带详情的正文应含 Markdown 小标题", withDetail.all { it.detail!!.contains("### ") })
    }

    @Test
    fun notesAreNullForEveryPoem_untilSomeoneWritesOne() {
        // 「没有笔记」是真实状态：不得生成占位笔记（AGENTS：agent 不代写第一人称内容）
        assertTrue("本版内容不应出现任何笔记文本", content.poems.all { it.notes == null })
    }

    @Test
    fun product_hasNoVariantsAnyMore_becauseTheFieldSetChanged() {
        val raw = File("src/main/assets/content/content.json").readText(Charsets.UTF_8)
        for (removed in listOf("variants", "era", "dynastyKey", "dynastyLabel", "dynastyOrder")) {
            assertFalse("新形状里不该再有 $removed（旧形状被 formatVersion 2 取代）", raw.contains("\"$removed\""))
        }
    }

    @Test
    fun theRealDetailSample_onlyUsesTheClosedMarkdownSubset() {
        // 唯一被核过的完整详情样例（行行重行行）：它用到的东西**必须都在闭集 8 样里**，
        // 否则「最小 Markdown 渲染」就是缺的 —— 这也是详情页将来真正要渲染的形状。
        val detail = JSONObject(
            TestRepoFiles.read(
                "items/content-format/prototypes/rules-v4/json/real-01-full.json",
                "真实详情样例（rules-v4 产物）是详情页渲染的锚；读不到即失败，不跳过。",
            ),
        ).getJSONArray("poems").getJSONObject(0).getString("detail")

        val blocks = Markdown.parse(detail)
        val kinds = blocks.map { it::class.simpleName }.toSet()
        assertEquals("真实详情只用到段落／三级标题／无序列表", setOf("Paragraph", "Heading3", "UnorderedList"), kinds)
        assertEquals("第一块是 `### 异文`", "异文", (blocks[0] as Markdown.Heading3).text)
        assertEquals("异文是 3 条无序列表项", 3, (blocks[1] as Markdown.UnorderedList).items.size)
        assertEquals("然后是 `### 分段依据`", "分段依据", (blocks[2] as Markdown.Heading3).text)
        // 每条异文开头的 `**…**` 是行内粗体
        val firstItem = (blocks[1] as Markdown.UnorderedList).items.first()
        assertTrue("异文条目里应有粗体：$firstItem", Markdown.inline(firstItem).spanStyles.isNotEmpty())
        assertTrue("去掉标记后不丢字", Markdown.inline(firstItem).text.startsWith("游子不顾返 —— "))
    }
}
