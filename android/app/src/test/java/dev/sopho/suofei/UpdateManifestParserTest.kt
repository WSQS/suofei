package dev.sopho.suofei

import dev.sopho.suofei.data.ContentParseException
import dev.sopho.suofei.update.UpdateManifestParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** 更新清单是跨端接口，字段名与校验规则在这里钉死。 */
class UpdateManifestParserTest {

    @Test
    fun fullManifest_parses() {
        val json = """
            {"formatVersion":1,"contentVersion":"2026.10.14.2",
             "url":"content/2026.10.14.2/content.json",
             "sha256":"${"a".repeat(64)}","size":4096,"minAppVersionCode":1}
        """.trimIndent()
        val m = UpdateManifestParser.parse(json)
        assertEquals(1, m.formatVersion)
        assertEquals("2026.10.14.2", m.contentVersion)
        assertEquals("content/2026.10.14.2/content.json", m.url)
        assertEquals(4096L, m.size)
        assertEquals(1, m.minAppVersionCode)
    }

    @Test
    fun optionalFieldsMayBeAbsent() {
        val json = """
            {"formatVersion":1,"contentVersion":"2026.10.14.2",
             "url":"https://example.invalid/x.json","sha256":"${"b".repeat(64)}"}
        """.trimIndent()
        val m = UpdateManifestParser.parse(json)
        assertEquals(null, m.size)
        assertEquals(null, m.minAppVersionCode)
    }

    @Test
    fun uppercaseSha_isNormalised() {
        val json = """
            {"formatVersion":1,"contentVersion":"1","url":"u","sha256":"${"A".repeat(64)}"}
        """.trimIndent()
        assertEquals("a".repeat(64), UpdateManifestParser.parse(json).sha256)
    }

    @Test(expected = ContentParseException::class)
    fun missingSha_isRejected_failClosed() {
        UpdateManifestParser.parse("""{"formatVersion":1,"contentVersion":"1","url":"u"}""")
    }

    @Test(expected = ContentParseException::class)
    fun shortSha_isRejected_failClosed() {
        UpdateManifestParser.parse("""{"formatVersion":1,"contentVersion":"1","url":"u","sha256":"abc"}""")
    }

    @Test(expected = ContentParseException::class)
    fun nonJson_isRejected() {
        UpdateManifestParser.parse("<html>404</html>")
    }

    @Test
    fun fieldNames_areTheInterface() {
        // 字段名一旦发布就不好改（Web 端与已发布客户端都依赖），这里显式钉住。
        assertEquals(
            listOf("formatVersion", "contentVersion", "url", "sha256", "size", "minAppVersionCode"),
            listOf(
                UpdateManifestParser.FIELD_FORMAT_VERSION,
                UpdateManifestParser.FIELD_CONTENT_VERSION,
                UpdateManifestParser.FIELD_URL,
                UpdateManifestParser.FIELD_SHA256,
                UpdateManifestParser.FIELD_SIZE,
                UpdateManifestParser.FIELD_MIN_APP_VERSION_CODE,
            ),
        )
        assertTrue(UpdateManifestParser.FIELD_SHA256 == "sha256")
    }
}
