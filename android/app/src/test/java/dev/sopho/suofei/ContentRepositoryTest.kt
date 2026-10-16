package dev.sopho.suofei

import dev.sopho.suofei.data.ContentOrigin
import dev.sopho.suofei.data.ContentParser
import dev.sopho.suofei.data.ContentRepository
import dev.sopho.suofei.data.ContentStore
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * 「应用内读取 content.json」的入口与降级行为（JVM 上真跑一遍，无需设备）：
 * 已安装版本优先；已安装版本损坏或结构版本过新 ⇒ 退回 APK 内置内容（首装断网也有得读）。
 */
class ContentRepositoryTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private val bundledJson = File("src/main/assets/content/content.json").readText(Charsets.UTF_8)

    /** 内置内容的版本号从**同一份文件**读出来：写死的话每次换内容都要改测试，而且看不出这行到底在断言什么。 */
    private val bundledVersion = ContentParser.parse(bundledJson).contentVersion

    private fun payload(version: String, formatVersion: Int = 2): String =
        """
        {"formatVersion":$formatVersion,"contentVersion":"$version","generatedAt":"2026-10-16T12:00:00Z",
         "dynasties":["汉"],
         "poems":[{"id":"p1","title":"$version","author":"佚名","dynasty":"汉","genre":null,"source":"占位",
                   "orderInSource":1,"detail":null,"stanzas":[["行一。"]],"notes":null}]}
        """.trimIndent()

    private fun repo(): Pair<ContentRepository, ContentStore> {
        val store = ContentStore(tmp.newFolder("content"))
        return ContentRepository(store, { bundledJson }, "assets/content/content.json") to store
    }

    private fun install(store: ContentStore, version: String, json: String) {
        val staged = store.newStagingFile(version)
        staged.parentFile?.mkdirs()
        staged.writeText(json, Charsets.UTF_8)
        store.install(staged, version, null, null)
    }

    @Test
    fun noInstalledContent_readsBundledAssets() {
        val (repository, store) = repo()
        val loaded = repository.load()
        assertEquals(ContentOrigin.BUNDLED_ASSET, loaded.origin)
        assertEquals("assets/content/content.json", loaded.location)
        assertEquals(bundledVersion, loaded.content.contentVersion)
        assertFalse(repository.installedContentBroken())
        assertEquals(null, store.activeVersion())
    }

    @Test
    fun installedContent_takesPrecedenceOverBundled() {
        val (repository, store) = repo()
        install(store, "2026.10.14.2", payload("2026.10.14.2"))

        val loaded = repository.load()
        assertEquals(ContentOrigin.INSTALLED, loaded.origin)
        assertEquals("2026.10.14.2", loaded.content.contentVersion)
        assertTrue(loaded.location.endsWith("versions${File.separator}2026.10.14.2${File.separator}content.json"))
    }

    @Test
    fun corruptedInstalledContent_fallsBackToBundled() {
        val (repository, store) = repo()
        install(store, "2026.10.14.2", payload("2026.10.14.2"))
        // 模拟磁盘损坏
        File(tmp.root, "content/versions/2026.10.14.2/content.json").writeText("{ broken")

        val loaded = repository.load()
        assertEquals("损坏时必须退回内置内容", ContentOrigin.BUNDLED_ASSET, loaded.origin)
        assertEquals(bundledVersion, loaded.content.contentVersion)
        assertTrue("并且要能如实报告「已安装版本坏了」", repository.installedContentBroken())
    }

    @Test
    fun installedContentWithNewerFormatVersion_isNotParsed_fallsBackToBundled() {
        val (repository, store) = repo()
        // 直接往目录里塞一个 formatVersion=3 的快照（模拟：新版应用装过，随后应用被降级）
        val dir = File(tmp.root, "content/versions/2027.1.1.1")
        dir.mkdirs()
        File(dir, "content.json").writeText(payload("2027.1.1.1", formatVersion = 3), Charsets.UTF_8)
        File(tmp.root, "content/current").writeText("2027.1.1.1", Charsets.UTF_8)

        val loaded = repository.load()
        assertEquals("结构版本更高 ⇒ 不去解析，退回内置", ContentOrigin.BUNDLED_ASSET, loaded.origin)
        assertTrue(repository.installedContentBroken())
    }

    @Test
    fun pointerAndPayloadDisagree_isTreatedAsBroken() {
        val (repository, store) = repo()
        install(store, "2026.10.14.2", payload("2026.10.14.2"))
        File(tmp.root, "content/current").writeText("2029.9.9.9", Charsets.UTF_8)

        assertEquals(ContentOrigin.BUNDLED_ASSET, repository.load().origin)
        assertTrue(repository.installedContentBroken())
    }

    @Test
    fun bundledFixtureItself_parses() {
        val (repository, _) = repo()
        val bundled = repository.bundled()
        assertTrue(bundled.content.poems.isNotEmpty())
        assertTrue(bundled.content.groups.isNotEmpty())
    }
}
