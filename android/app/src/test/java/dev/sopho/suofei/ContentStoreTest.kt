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
 * 失败/损坏/不兼容 ⇒ **旧版一个字节都不动**；成功 ⇒ 指针原子切换、旧快照被清理（只留当前那一个）。
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
    fun install_secondVersion_leavesExactlyOneSnapshot() {
        val store = ContentStore(tmp.newFolder("content"))
        store.install(stage(store, "2026.10.14.1", payload("2026.10.14.1")), "2026.10.14.1", null, null)
        assertEquals(listOf("2026.10.14.1"), store.installedVersions())

        store.install(stage(store, "2026.10.14.2", payload("2026.10.14.2")), "2026.10.14.2", null, null)

        assertEquals("2026.10.14.2", store.activeVersion())
        // 新语义（用户 2026-10-14 决定）：磁盘上**只剩当前这一个**版本目录。
        // 既不是「留两个」，也不是含糊的「至少留一个」。
        assertEquals(listOf("2026.10.14.2"), store.installedVersions())
        assertEquals(
            "versions/ 下有且只有一个子目录",
            1,
            File(tmp.root, "content/versions").listFiles()!!.count { it.isDirectory },
        )
        assertTrue(
            "切换后 staging 必须为空",
            (File(tmp.root, "content/staging").listFiles() ?: emptyArray()).isEmpty(),
        )
        // 存储层不再有「上一个版本」这个状态：内容根目录就这三项，多一个少一个都算回归。
        assertEquals(
            "filesDir/content 下只有 current / versions / staging",
            setOf("current", "versions", "staging"),
            File(tmp.root, "content").listFiles()!!.map { it.name }.toSet(),
        )
        assertTrue(File(tmp.root, "content/current").isFile)
    }

    @Test
    fun upgrade_deletesOldVersionDirectory() {
        val store = ContentStore(tmp.newFolder("content"))
        store.install(stage(store, "2026.10.14.1", payload("2026.10.14.1")), "2026.10.14.1", null, null)
        val oldDir = File(tmp.root, "content/versions/2026.10.14.1")
        assertTrue("升级前旧快照确实在磁盘上：${oldDir.absolutePath}", oldDir.isDirectory)

        store.install(stage(store, "2026.10.14.2", payload("2026.10.14.2")), "2026.10.14.2", null, null)

        // 这就是「删掉上一个快照」这次决策的可见后果：旧目录连同里面的 content.json 都必须消失。
        assertFalse("旧版本目录必须被清掉", oldDir.exists())
        assertFalse("旧版本内容文件也必须消失", File(oldDir, ContentStore.CONTENT_FILE).exists())
        assertTrue(
            "当前版本的内容文件在",
            File(tmp.root, "content/versions/2026.10.14.2/${ContentStore.CONTENT_FILE}").isFile,
        )
        assertEquals("2026.10.14.2", store.loadActive()!!.content.contentVersion)
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
        // 被删掉的旧内容不会以「累积副本」的形式留在磁盘上
        assertEquals(listOf("2026.10.14.2"), store.installedVersions())
        assertFalse(File(tmp.root, "content/versions/2026.10.14.1").exists())
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
        assertEquals("失败后仍然只剩那一个旧快照", listOf("2026.10.14.1"), store.installedVersions())
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
    fun pointerWriteFailure_isRefused_leavesNoOrphanSnapshot_oldVersionUntouched() {
        val store = ContentStore(tmp.newFolder("content"))
        store.install(stage(store, "2026.10.14.1", payload("2026.10.14.1")), "2026.10.14.1", null, null)
        assertEquals("2026.10.14.1", store.activeVersion())

        // 模拟「指针写不下去」（磁盘满 / IO 错误）：让临时指针文件的位置被一个非空目录占住，
        // 于是 current.tmp 的写入必然抛 IOException。旧指针文件本身没被动过。
        val blocker = File(tmp.root, "content/current.tmp")
        assertTrue(blocker.mkdirs())
        File(blocker, "occupied").writeText("x", Charsets.UTF_8)

        val result = store.install(
            stage(store, "2026.10.14.2", payload("2026.10.14.2")),
            "2026.10.14.2",
            null,
            null,
        )

        assertTrue("指针写入失败必须是明确的 Refused，而不是抛异常上去", result is InstallResult.Refused)
        val refused = result as InstallResult.Refused
        assertEquals(RefusalKind.IO, refused.kind)
        assertTrue("原因要能直接给人看：${refused.reason}", refused.reason.contains("指针写入失败"))
        // 当前生效版本不变，旧内容仍读得到
        assertEquals("2026.10.14.1", store.activeVersion())
        assertEquals("2026.10.14.1", store.loadActive()!!.content.contentVersion)
        // 不留「没有被指针引用的目录」
        assertEquals(listOf("2026.10.14.1"), store.installedVersions())
        assertFalse("孤儿快照目录必须被清掉", File(tmp.root, "content/versions/2026.10.14.2").exists())
    }

    @Test
    fun pointerRenameFailure_isRefused_andCleansTempPointerFile() {
        val store = ContentStore(tmp.newFolder("content"))
        store.install(stage(store, "2026.10.14.1", payload("2026.10.14.1")), "2026.10.14.1", null, null)

        // 让「覆盖 current」这一步失败：同名的非空目录无法被文件覆盖。
        // 与上一个用例不同，这里是 current.tmp 写入成功、失败发生在 rename 那一步。
        val occupied = File(tmp.root, "content/current")
        assertTrue(File(tmp.root, "content/current").isFile)
        assertTrue(File(tmp.root, "content/current").delete())
        assertTrue(occupied.mkdirs())
        File(occupied, "occupied").writeText("x", Charsets.UTF_8)

        val result = store.install(
            stage(store, "2026.10.14.2", payload("2026.10.14.2")),
            "2026.10.14.2",
            null,
            null,
        )

        assertTrue(result is InstallResult.Refused)
        assertEquals(RefusalKind.IO, (result as InstallResult.Refused).kind)
        assertFalse("孤儿快照目录必须被清掉", File(tmp.root, "content/versions/2026.10.14.2").exists())
        assertFalse("失败留下的半个临时指针文件要清掉", File(tmp.root, "content/current.tmp").exists())
        // 没有发生任何切换：旧快照仍在，且占位物没被我们破坏
        assertEquals(listOf("2026.10.14.1"), store.installedVersions())
        assertTrue(occupied.isDirectory)
    }

    @Test
    fun reinstallOfSameVersion_repairsActiveSnapshot_withoutPointerSwap() {
        // 场景：已装快照损坏，远端又提供了同一版本 ⇒ 重下一次同一版。
        // 此时指针本来就指着这个版本，无需切换；“重下一次同版”就是一次修复。
        val store = ContentStore(tmp.newFolder("content"))
        store.install(
            stage(store, "2026.10.14.1", payload("2026.10.14.1", title = "损坏前的载荷")),
            "2026.10.14.1",
            null,
            null,
        )
        File(tmp.root, "content/versions/2026.10.14.1/content.json").writeText("{ broken")
        assertNull("损坏后读不出来", store.loadActive())

        val result = store.install(
            stage(store, "2026.10.14.1", payload("2026.10.14.1", title = "重下的载荷")),
            "2026.10.14.1",
            null,
            null,
        )

        assertTrue("同名重装应当直接生效：$result", result is InstallResult.Activated)
        assertEquals("2026.10.14.1", store.activeVersion())
        assertEquals(listOf("重下的载荷"), store.loadActive()!!.content.poems.map { it.title })
        assertEquals(listOf("2026.10.14.1"), store.installedVersions())
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
