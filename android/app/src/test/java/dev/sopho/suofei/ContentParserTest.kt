package dev.sopho.suofei

import dev.sopho.suofei.data.ContentParseException
import dev.sopho.suofei.data.ContentParser
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** 真实的 APK 内置夹具（src/main/assets/content/content.json）必须能被解析 —— 内置内容坏掉＝首次断网读不了。 */
class ContentParserTest {

    private val fixtureFile = File("src/main/assets/content/content.json")

    @Test
    fun fixtureAsset_parsesAndGroupsByDynastyOrder() {
        assertTrue("夹具文件应存在：${fixtureFile.absolutePath}", fixtureFile.isFile)
        val content = ContentParser.parse(fixtureFile.readText(Charsets.UTF_8))

        assertEquals(1, content.formatVersion)
        assertEquals("2026.10.14.1", content.contentVersion)

        // 只列实际有内容的组，按 order 升序：汉(100) → 唐(400) → 未详(9999)
        assertEquals(listOf("汉", "唐", "未详"), content.groups.map { it.dynasty.label })

        // 组内排序：佚名在最后（契约显式规则）
        val han = content.groups.first { it.dynasty.key == "han" }
        assertEquals(listOf("佚名", "佚名"), han.poems.map { it.author })
        // 佚名并列时按 titleSortKey：jia < yi
        assertEquals(listOf("占位诗题甲", "占位诗题乙"), han.poems.map { it.title })
    }

    @Test
    fun fixtureAsset_keepsStanzaBreaksAndLineBreaks() {
        val content = ContentParser.parse(fixtureFile.readText(Charsets.UTF_8))
        val poem = content.poems.first { it.id == "fixture-han-01" }
        assertEquals(2, poem.stanzas.size)
        assertEquals(2, poem.stanzas[0].size)
        assertEquals(2, poem.stanzas[1].size)
    }

    @Test
    fun fixtureAsset_noNotesIsNull_andTestFixtureNoteIsMarked() {
        val content = ContentParser.parse(fixtureFile.readText(Charsets.UTF_8))
        assertNull(content.poems.first { it.id == "fixture-han-01" }.notes)
        val note = content.poems.first { it.id == "fixture-tang-01" }.notes
        assertTrue("夹具笔记必须写明自己是测试夹具", note!!.contains("测试夹具笔记"))
    }

    @Test
    fun search_matchesTitleAndAuthorAcrossGroups() {
        val content = ContentParser.parse(fixtureFile.readText(Charsets.UTF_8))
        assertEquals(1, content.search("占位诗题丙").size)
        // 作者搜索跨组
        assertEquals(1, content.search("占位作者甲").size)
        // 「佚名」命中汉组两首
        assertEquals(2, content.search("佚名").size)
        assertTrue(content.search("不存在的诗").isEmpty())
        assertTrue(content.search("   ").isEmpty())
    }

    @Test
    fun variants_areParsedButNeverEnterStanzas() {
        val content = ContentParser.parse(fixtureFile.readText(Charsets.UTF_8))
        val poem = content.poems.first { it.id == "fixture-han-02" }
        assertEquals(1, poem.variants.size)
        assertTrue(poem.stanzas.flatten().none { it.contains("异文") })
    }

    @Test(expected = ContentParseException::class)
    fun missingRequiredField_isRejected() {
        // 缺 source（契约里的必填项）；era/genre/notes/variants 才是可缺省的。
        ContentParser.parse(
            """
            {"formatVersion":1,"contentVersion":"1.0.0","dynasties":[{"key":"han","label":"汉","order":100}],
             "poems":[{"id":"a","title":"t","author":"佚名","dynastyKey":"han",
                       "stanzas":[["line"]]}]}
            """.trimIndent(),
        )
    }

    @Test
    fun optionalFields_mayBeAbsent() {
        // era / genre / notes / variants 缺省必须能解析，且 notes 读成 null（真实空状态）。
        val content = ContentParser.parse(
            """
            {"formatVersion":1,"contentVersion":"1.0.0","dynasties":[{"key":"han","label":"汉","order":100}],
             "poems":[{"id":"a","title":"t","author":"佚名","dynastyKey":"han","source":"s",
                       "stanzas":[["line"]]}]}
            """.trimIndent(),
        )
        val poem = content.poems.single()
        assertNull(poem.notes)
        assertNull(poem.era)
        assertNull(poem.genre)
        assertTrue(poem.variants.isEmpty())
        // dynastyLabel/dynastyOrder 以 dynasties 声明表为准，不要求诗对象里重复出现
        assertEquals("汉", poem.dynastyLabel)
        assertEquals(100, poem.dynastyOrder)
    }

    @Test(expected = ContentParseException::class)
    fun undeclaredDynastyKey_isRejected() {
        ContentParser.parse(
            """
            {"formatVersion":1,"contentVersion":"1.0.0","dynasties":[{"key":"han","label":"汉","order":100}],
             "poems":[{"id":"a","title":"t","author":"佚名","dynastyKey":"song","dynastyLabel":"宋",
                       "dynastyOrder":500,"source":"s","stanzas":[["line"]],"variants":[]}]}
            """.trimIndent(),
        )
    }

    @Test(expected = ContentParseException::class)
    fun emptyStanzas_areRejected() {
        ContentParser.parse(
            """
            {"formatVersion":1,"contentVersion":"1.0.0","dynasties":[{"key":"han","label":"汉","order":100}],
             "poems":[{"id":"a","title":"t","author":"佚名","dynastyKey":"han","source":"s",
                       "stanzas":[[],[]],"variants":[]}]}
            """.trimIndent(),
        )
    }

    @Test(expected = ContentParseException::class)
    fun nonIntegerDynastyOrder_isRejected() {
        ContentParser.parse(
            """
            {"formatVersion":1,"contentVersion":"1.0.0","dynasties":[{"key":"han","label":"汉","order":"100"}],
             "poems":[{"id":"a","title":"t","author":"佚名","dynastyKey":"han","source":"s",
                       "stanzas":[["line"]],"variants":[]}]}
            """.trimIndent(),
        )
    }
}
