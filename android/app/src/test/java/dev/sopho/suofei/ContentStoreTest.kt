package dev.sopho.suofei

import dev.sopho.suofei.data.ContentStore
import dev.sopho.suofei.data.InstallResult
import dev.sopho.suofei.data.RefusalKind
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * 离线更新的核心不变量，在 JVM 上用临时目录真跑一遍（ContentStore 不依赖任何 Android API）：
 * 失败/损坏/不兼容 ⇒ **旧版一个字节都不动**；成功 ⇒ 指针原子切换、旧快照被清理。
 */
class ContentStoreTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private fun payload(version: String, formatVersion: Int = 1, title: String = "占位诗题甲"): String =
        """
        {"formatVersion":$formatVersion,"contentVersion":"$version","generatedAt":"2026-10-14T12:00:00Z",
         "dynasties":[{"key":"han","label":"汉","order":100}],
         "poems":[{"id":"p1","title":"$title","author":"佚名","dynastyKey":"han","dynastyLabel":"汉",
                   "dynastyOrder":100,"source":"占位夹具","variants":[],"stanzas":[["行一。"]]}]}
        """.trimIndent()

    private fun stage(store: ContentStore, version: String, json: String): File {
        val f = store.newStagingFile(version)
        f.parentFile?.mkdirs()
        f.writeText(json, Charsets.UTF_8)
        return f
    }

    @Test
    fun install_activatesVersion_andSurvivesReload() {
        val store = ContentStore(tmp.newFolder("content"))
        val staged = stage(store, "2026.10.14.1", payload("2026.10.14.1"))

        val result = store.install(staged, "2026.10.14.1", "deadbeef", "https://x/y.json")
        assertTrue(result is InstallResult.Activated)

        assertEquals("2026.10.14.1", store.activeVersion())
        val loaded = store.loadActive()
        assertNotNull(loaded)
        assertEquals("2026.10.14.1", loaded!!.content.contentVersion)
        assertEquals(1, loaded.content.poems.size)
        assertTrue("staging 不应留下残留", (File(tmp.root, "content/staging").listFiles() ?: emptyArray()).isEmpty())
    }

    @Test
    fun install_secondVersion_keepsPreviousReadable_thenPrunesOlderOnes() {
        val store = ContentStore(tmp.newFolder("content"))
        store.install(stage(store, "2026.10.14.1", payload("2026.10.14.1")), "2026.10.14.1", null, null)
        store.install(stage(store, "2026.10.14.2", payload("2026.10.14.2")), "2026.10.14.2", null, null)

        assertEquals("2026.10.14.2", store.activeVersion())
        assertEquals("2026.10.14.1", store.previousVersion())
        // 上一个版本仍在磁盘上（唯一回滚候选）
        assertTrue(File(tmp.root, "content/versions/2026.10.14.1/content.json").isFile)
        assertTrue(store.rollbackToPrevious())
        assertEquals("2026.10.14.1", store.activeVersion())
        store.rollbackToPrevious()

        // 装第三个：最早那个必须被删掉（新版可删改，不是只累积）
        store.install(stage(store, "2026.10.14.3", payload("2026.10.14.3")), "2026.10.14.3", null, null)
        assertEquals(listOf("2026.10.14.3", "2026.10.14.2"), store.installedVersions())
        assertFalse(File(tmp.root, "content/versions/2026.10.14.1").exists())
    }

    @Test
    fun newerSnapshotCanDeletePoems_notJustAccumulate() {
        val store = ContentStore(tmp.newFolder("content"))
        store.install(stage(store, "2026.10.14.1", payload("2026.10.14.1")), "2026.10.14.1", null, null)
        assertEquals(1, store.loadActive()!!.content.poems.size)

        // 一个「删掉所有作品」的新快照同样是合法内容（只是空集）——但契约要求 poems 非空，
        // 所以用「换了另一首诗」来表达删改：旧标题在新快照里不存在。
        store.install(
            stage(store, "2026.10.14.2", payload("2026.10.14.2", title = "另一首占位诗")),
            "2026.10.14.2",
            null,
            null,
        )
        val now = store.loadActive()!!.content
        assertEquals(listOf("另一首占位诗"), now.poems.map { it.title })
    }

    @Test
    fun corruptPayload_isRefused_andOldVersionUntouched() {
        val store = ContentStore(tmp.newFolder("content"))
        store.install(stage(store, "2026.10.14.1", payload("2026.10.14.1")), "2026.10.14.1", null, null)

        val result = store.install(
            stage(store, "2026.10.14.2", "{ \"formatVersion\": 1, \"poems\": [ "),
            "2026.10.14.2",
            null,
            null,
        )
        assertTrue(result is InstallResult.Refused)
        assertEquals(RefusalKind.PAYLOAD_INVALID, (result as InstallResult.Refused).kind)
        assertEquals("旧版必须原封不动", "2026.10.14.1", store.activeVersion())
        assertEquals("2026.10.14.1", store.loadActive()!!.content.contentVersion)
        assertFalse(File(tmp.root, "content/versions/2026.10.14.2").exists())
    }

    @Test
    fun higherFormatVersion_isRefused_oldVersionUntouched() {
        val store = ContentStore(tmp.newFolder("content"))
        store.install(stage(store, "2026.10.14.1", payload("2026.10.14.1")), "2026.10.14.1", null, null)

        val result = store.install(
            stage(store, "2027.1.1.1", payload("2027.1.1.1", formatVersion = 2)),
            "2027.1.1.1",
            null,
            null,
        )
        assertTrue(result is InstallResult.Refused)
        assertEquals(RefusalKind.FORMAT_TOO_NEW, (result as InstallResult.Refused).kind)
        assertEquals("2026.10.14.1", store.activeVersion())
        assertFalse(File(tmp.root, "content/versions/2027.1.1.1").exists())
    }

    @Test
    fun manifestVersionMismatch_isRefused() {
        val store = ContentStore(tmp.newFolder("content"))
        val result = store.install(
            stage(store, "2026.10.14.2", payload("2026.10.14.9")),
            expectedVersion = "2026.10.14.2",
            expectedSha256 = null,
            sourceUrl = null,
        )
        assertTrue(result is InstallResult.Refused)
        assertEquals(RefusalKind.VERSION_MISMATCH, (result as InstallResult.Refused).kind)
        assertNull(store.activeVersion())
    }

    @Test
    fun brokenActiveFile_fallsBackAsNull_soCallerCanUseBundledAssets() {
        val store = ContentStore(tmp.newFolder("content"))
        store.install(stage(store, "2026.10.14.1", payload("2026.10.14.1")), "2026.10.14.1", null, null)
        // 模拟磁盘损坏：文件在，但内容不再是合法 JSON
        File(tmp.root, "content/versions/2026.10.14.1/content.json").writeText("{ broken")

        assertNotNull("指针还在", store.activeVersion())
        assertNull("读不出来时必须返回 null，由调用方退回内置内容", store.loadActive())
    }

    @Test
    fun sha256_ofKnownBytes_matches() {
        val f = tmp.newFile("x.txt")
        f.writeText("abc", Charsets.UTF_8)
        assertEquals(
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
            ContentStore.sha256Of(f),
        )
    }
}
