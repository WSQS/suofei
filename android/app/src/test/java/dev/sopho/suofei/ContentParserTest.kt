package dev.sopho.suofei

import dev.sopho.suofei.data.ContentParseException
import dev.sopho.suofei.data.ContentParser
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** 真实的 APK 内置内容（src/main/assets/content/content.json）必须能被解析 —— 内置内容坏掉＝首次断网读不了。 */
class ContentParserTest {

    private val assetFile = File("src/main/assets/content/content.json")

    @Test
    fun embeddedContent_parsesAndKeepsCompiledOrder() {
        assertTrue("内置内容文件应存在：${assetFile.absolutePath}", assetFile.isFile)
        val content = ContentParser.parse(assetFile.readText(Charsets.UTF_8))

        assertEquals(1, content.formatVersion)
        assertEquals("2026.10.14.1", content.contentVersion)

        // 只列实际有内容的组：本版内容只有「汉」
        assertEquals(listOf("汉"), content.groups.map { it.dynasty.label })
        assertEquals(19, content.poems.size)

        // 契约 IF-16：编译产物已按底本原次序（《文选》卷二十九）排好，客户端不得重排。
        // 首＝行行重行行、末＝明月何皎皎；若客户端自己按拼音重排，这两条会失败。
        assertEquals("行行重行行", content.poems.first().title)
        assertEquals("明月何皎皎", content.poems.last().title)
    }

    @Test
    fun embeddedContent_keepsEveryPrintedLine() {
        val content = ContentParser.parse(assetFile.readText(Charsets.UTF_8))
        val poem = content.poems.first { it.id == "gushi-shijiu-shou-01" }
        // 《行行重行行》底本共 8 个印刷行，每行两句，底本无空行分段
        assertEquals(1, poem.stanzas.size)
        assertEquals(8, poem.stanzas[0].size)
        assertEquals("行行重行行，与君生别离。", poem.stanzas[0][0])
        assertEquals("弃捐勿复道，努力加餐饭。", poem.stanzas[0][7])
    }

    @Test
    fun stanzaBreaks_areKeptWhenPresent() {
        // 真实 19 首都没有空行分段，所以「空行 = 段边界」只能用合成数据测。
        val content = ContentParser.parse(
            """
            {"formatVersion":1,"contentVersion":"1.0.0","dynasties":[{"key":"han","label":"汉","order":100}],
             "poems":[{"id":"a","title":"t","author":"佚名","dynastyKey":"han","source":"s",
                       "stanzas":[["一。","二。"],["三。"]],"variants":[]}]}
            """.trimIndent(),
        )
        val poem = content.poems.single()
        assertEquals(2, poem.stanzas.size)
        assertEquals(2, poem.stanzas[0].size)
        assertEquals(1, poem.stanzas[1].size)
    }

    @Test
    fun notesAreNullForEveryPoem_untilTheUserWritesOne() {
        val content = ContentParser.parse(assetFile.readText(Charsets.UTF_8))
        // 「没有笔记」是真实状态：不得生成占位笔记（AGENTS：agent 不代写第一人称内容）
        assertTrue("本版内容不应出现任何笔记文本", content.poems.all { it.notes == null })
    }

    @Test
    fun search_matchesTitleAndAuthorAcrossGroups() {
        val content = ContentParser.parse(assetFile.readText(Charsets.UTF_8))
        assertEquals(19, content.search("佚名").size)
        assertEquals(1, content.search("行行重行行").size)
        assertEquals(listOf("明月皎夜光", "明月何皎皎"), content.search("明月").map { it.title })
        assertTrue(content.search("不存在的诗").isEmpty())
        assertTrue(content.search("   ").isEmpty())
    }

    @Test
    fun variants_areParsedButNeverEnterStanzas() {
        val content = ContentParser.parse(assetFile.readText(Charsets.UTF_8))
        val poem = content.poems.first { it.id == "gushi-shijiu-shou-09" }
        assertEquals(1, poem.variants.size)
        assertTrue(poem.variants.first().text.contains("贵"))
        // 正文用底本（李善注本）「贡」；异文绝不混入正文
        assertTrue(poem.stanzas.flatten().any { it.contains("此物何足贡") })
        assertTrue(poem.stanzas.flatten().none { it.contains("何足贵") })
    }

    @Test
    fun clientDoesNotResort_arrayOrderEqualsSourceOrder() {
        val content = ContentParser.parse(assetFile.readText(Charsets.UTF_8))
        // 契约：编译期是唯一排序权威，客户端不得重排。产物只发布 orderInSource（底本原次序）。
        assertEquals("行行重行行", content.poems.first().title)
        assertEquals(1, content.poems.first().orderInSource)
        assertEquals("明月何皎皎", content.poems.last().title)
        assertEquals(19, content.poems.last().orderInSource)
        // 整串必须严格递增 1..19 ⇒ 数组次序＝底本原次序（本机拼音序会把「行行重行行」推到第 19 位，
        // 所以这条就是「没重排」的牙齿）。
        assertEquals((1..19).toList(), content.poems.map { it.orderInSource })
        // 目录里也必须是同一份次序
        assertEquals("行行重行行", content.groups.single().poems.first().title)
    }

    @Test
    fun nonIntegerOrderInSource_isTreatedAsAbsent_notAsAnError() {
        // 与 Web 端口径一致：类型不对既不静默当 0、也不让整份内容解析失败——按「产物没给」处理，走兜底。
        // 理由：阅读器宁可按兜底次序把诗显示出来，也不该因为一个字段类型不对就什么都读不到；
        // 产物形状的严格性由编译期与「真解析内置产物」的构建门保证。
        val content = ContentParser.parse(
            """
            {"formatVersion":1,"contentVersion":"1.0.0","dynasties":[{"key":"han","label":"汉","order":100}],
             "poems":[
               {"id":"a","title":"乙诗","author":"佚名","dynastyKey":"han","source":"s","stanzas":[["a"]],"orderInSource":"2"},
               {"id":"b","title":"甲诗","author":"曹植","dynastyKey":"han","source":"s","stanzas":[["b"]],"orderInSource":"1"}]}
            """.trimIndent(),
        )
        assertTrue(content.poems.all { it.orderInSource == null })
        // 无可用次序信息 ⇒ 兜底规则生效：具名作者在前、佚名在后
        assertEquals(listOf("曹植", "佚名"), content.groups.single().poems.map { it.author })
    }

    @Test
    fun fallbackOrdering_appliesOnlyWhenProductGivesNoOrderInSource() {
        // 老产物 / 手写 JSON 没有任何 orderInSource 时，才退回本地规则：具名作者在前、佚名在后。
        val content = ContentParser.parse(
            """
            {"formatVersion":1,"contentVersion":"1.0.0","dynasties":[{"key":"han","label":"汉","order":100}],
             "poems":[
               {"id":"a","title":"乙诗","author":"佚名","dynastyKey":"han","source":"s","stanzas":[["a"]]},
               {"id":"b","title":"甲诗","author":"曹植","dynastyKey":"han","source":"s","stanzas":[["b"]]}]}
            """.trimIndent(),
        )
        assertEquals(listOf("曹植", "佚名"), content.groups.single().poems.map { it.author })
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
