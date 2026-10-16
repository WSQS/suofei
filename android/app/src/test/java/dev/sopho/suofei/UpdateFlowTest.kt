package dev.sopho.suofei

import dev.sopho.suofei.data.ContentStore
import dev.sopho.suofei.update.ContentUpdater
import dev.sopho.suofei.update.FailureKind
import dev.sopho.suofei.update.UpdateOutcome
import java.io.File
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.security.MessageDigest
import kotlin.concurrent.thread
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * 端到端跑一遍「检查 → 完整下载 → 校验 → 原子切换」，用本机临时 HTTP 服务（127.0.0.1 高位端口）。
 * 覆盖的是真实的 HttpURLConnection 路径，只是没有真机、没有 HTTPS、没有真发布源。
 *
 * 服务端刻意用裸 ServerSocket 写（`com.sun.net.httpserver` 不在 Android 单测的编译类路径上）：
 * 只实现「读请求行 → 回 Content-Length + Connection: close」够用的那一点 HTTP/1.1。
 *
 * 本机坑：`~/.gradle/gradle.properties` 里配了 `systemProp.http.proxyHost=localhost:7890`，
 * 会被测试 JVM 继承；这里显式清掉代理，否则连 127.0.0.1 也会被塞进那个代理。
 */
class UpdateFlowTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private lateinit var server: ServerSocket
    private lateinit var acceptThread: Thread
    private lateinit var base: String
    private val responses = mutableMapOf<String, Pair<Int, ByteArray>>()
    private val requestedPaths = mutableListOf<String>()

    @Before
    fun setUp() {
        listOf("http.proxyHost", "http.proxyPort", "https.proxyHost", "https.proxyPort").forEach {
            System.clearProperty(it)
        }
        System.setProperty("http.nonProxyHosts", "localhost|127.0.0.1|[::1]")

        server = ServerSocket(0, 16, InetAddress.getByName("127.0.0.1"))
        base = "http://127.0.0.1:${server.localPort}"
        acceptThread = thread(isDaemon = true, name = "test-http") {
            while (!server.isClosed) {
                val socket = try {
                    server.accept()
                } catch (e: Exception) {
                    break
                }
                handle(socket)
            }
        }
    }

    @After
    fun tearDown() {
        server.close()
        acceptThread.join(2_000)
    }

    private fun handle(socket: Socket) {
        socket.use { s ->
            val reader = s.getInputStream().bufferedReader()
            val requestLine = reader.readLine() ?: return
            while (true) {
                val line = reader.readLine() ?: break
                if (line.isEmpty()) break
            }
            val path = requestLine.split(" ").getOrNull(1) ?: "/"
            synchronized(requestedPaths) { requestedPaths += path }
            val (status, body) = responses[path] ?: (404 to ByteArray(0))
            val reason = if (status == 200) "OK" else "Error"
            val out = s.getOutputStream()
            out.write(
                ("HTTP/1.1 $status $reason\r\n" +
                    "Content-Type: application/json; charset=utf-8\r\n" +
                    "Content-Length: ${body.size}\r\n" +
                    "Connection: close\r\n\r\n").toByteArray(Charsets.ISO_8859_1),
            )
            if (body.isNotEmpty()) out.write(body)
            out.flush()
        }
    }

    private fun payload(version: String, formatVersion: Int = 2): String =
        """
        {"formatVersion":$formatVersion,"contentVersion":"$version","generatedAt":"2026-10-16T12:00:00Z",
         "dynasties":["汉"],
         "poems":[{"id":"p1","title":"$version","author":"佚名","dynasty":"汉","genre":null,
                   "source":"占位","orderInSource":1,"detail":null,"stanzas":[["行一。"]],"notes":null}]}
        """.trimIndent()

    private fun sha256(text: String): String =
        MessageDigest.getInstance("SHA-256").digest(text.toByteArray())
            .joinToString("") { "%02x".format(it) }

    private fun manifest(
        version: String,
        sha: String,
        formatVersion: Int = 1,
        size: Long? = null,
        minAppVersionCode: Int? = null,
        url: String = "/content.json",
    ): String = buildString {
        append("{\"formatVersion\":$formatVersion,")
        append("\"contentVersion\":\"$version\",")
        append("\"url\":\"$url\",")
        append("\"sha256\":\"$sha\"")
        if (size != null) append(",\"size\":$size")
        if (minAppVersionCode != null) append(",\"minAppVersionCode\":$minAppVersionCode")
        append("}")
    }

    private fun store(): ContentStore = ContentStore(tmp.newFolder("content"))

    private fun stagedFiles(store: ContentStore): List<String> {
        val d = File(store.stagingDirPath())
        return (d.listFiles() ?: emptyArray()).map { it.name }
    }

    private fun currentVersionOf(store: ContentStore): String? = store.activeVersion()

    @Test
    fun happyPath_downloadsVerifiesAndSwitchesAtomically() {
        val store = store()
        val body = payload("2026.10.14.2")
        responses["/latest.json"] = 200 to manifest("2026.10.14.2", sha256(body), size = body.toByteArray().size.toLong()).toByteArray()
        responses["/content.json"] = 200 to body.toByteArray()

        val outcome = ContentUpdater.checkAndUpdate(
            manifestUrl = "$base/latest.json",
            currentVersion = null,
            appVersionCode = 1,
            store = store,
        )

        assertTrue("实际结果：$outcome", outcome is UpdateOutcome.Activated)
        outcome as UpdateOutcome.Activated
        assertEquals("2026.10.14.2", outcome.version)
        assertEquals(sha256(body), outcome.sha256)
        assertEquals("2026.10.14.2", currentVersionOf(store))
        val loaded = store.loadActive()
        assertNotNull(loaded)
        assertEquals("2026.10.14.2", loaded!!.content.contentVersion)
        assertTrue("必须留下安装元信息（sha256/来源）", File(tmp.root, "content/versions/2026.10.14.2/meta.json").isFile)
        assertTrue("staging 必须清空", stagedFiles(store).isEmpty())
        assertEquals(listOf("/latest.json", "/content.json"), requestedPaths)
    }

    @Test
    fun checksumMismatch_keepsOldVersion_andDiscardsDownload() {
        val store = store()
        // 先有一个旧版生效
        val old = payload("2026.10.14.1")
        responses["/latest.json"] = 200 to manifest("2026.10.14.1", sha256(old)).toByteArray()
        responses["/content.json"] = 200 to old.toByteArray()
        ContentUpdater.checkAndUpdate("$base/latest.json", null, 1, store)
        assertEquals("2026.10.14.1", currentVersionOf(store))

        // 新版：清单声明的 sha 与载荷不符（下载损坏/被篡改）
        val tampered = payload("2026.10.14.2")
        responses["/latest.json"] = 200 to manifest("2026.10.14.2", "0".repeat(64)).toByteArray()
        responses["/content.json"] = 200 to tampered.toByteArray()

        val outcome = ContentUpdater.checkAndUpdate("$base/latest.json", "2026.10.14.1", 1, store)
        assertTrue(outcome is UpdateOutcome.Failed)
        assertEquals(FailureKind.CHECKSUM_MISMATCH, (outcome as UpdateOutcome.Failed).kind)
        assertEquals("旧版必须仍是生效版本", "2026.10.14.1", currentVersionOf(store))
        assertTrue("坏下载必须被丢弃", stagedFiles(store).isEmpty())
        assertEquals(false, File(tmp.root, "content/versions/2026.10.14.2").exists())
    }

    @Test
    fun formatTooNew_isRefusedAndNothingDownloads() {
        val store = store()
        val body = payload("2027.1.1.1", formatVersion = 3)
        responses["/latest.json"] = 200 to manifest("2027.1.1.1", sha256(body), formatVersion = 3).toByteArray()
        responses["/content.json"] = 200 to body.toByteArray()

        val outcome = ContentUpdater.checkAndUpdate("$base/latest.json", null, 1, store)
        assertEquals(FailureKind.FORMAT_TOO_NEW, (outcome as UpdateOutcome.Failed).kind)
        assertEquals(null, currentVersionOf(store))
        assertEquals("结构不兼容时连内容都不该去下载", listOf("/latest.json"), requestedPaths)
    }

    @Test
    fun appTooOld_isRefusedAndNothingDownloads() {
        val store = store()
        val body = payload("2026.10.14.2")
        responses["/latest.json"] = 200 to manifest("2026.10.14.2", sha256(body), minAppVersionCode = 99).toByteArray()
        responses["/content.json"] = 200 to body.toByteArray()

        val outcome = ContentUpdater.checkAndUpdate("$base/latest.json", null, appVersionCode = 1, store = store)
        assertEquals(FailureKind.APP_TOO_OLD, (outcome as UpdateOutcome.Failed).kind)
        assertEquals(listOf("/latest.json"), requestedPaths)
    }

    @Test
    fun notNewer_isUpToDate_andNothingDownloads() {
        val store = store()
        val body = payload("2026.10.14.2")
        responses["/latest.json"] = 200 to manifest("2026.10.14.2", sha256(body)).toByteArray()
        responses["/content.json"] = 200 to body.toByteArray()

        val outcome = ContentUpdater.checkAndUpdate("$base/latest.json", "2026.10.14.2", 1, store)
        assertTrue(outcome is UpdateOutcome.UpToDate)
        assertEquals(listOf("/latest.json"), requestedPaths)
    }

    @Test
    fun sizeMismatch_isRefused() {
        val store = store()
        val body = payload("2026.10.14.2")
        responses["/latest.json"] =
            200 to manifest("2026.10.14.2", sha256(body), size = body.toByteArray().size + 7L).toByteArray()
        responses["/content.json"] = 200 to body.toByteArray()

        val outcome = ContentUpdater.checkAndUpdate("$base/latest.json", null, 1, store)
        assertEquals(FailureKind.SIZE_MISMATCH, (outcome as UpdateOutcome.Failed).kind)
        assertEquals(null, currentVersionOf(store))
    }

    @Test
    fun serverError_isNetworkFailure_oldVersionKept() {
        val store = store()
        responses["/latest.json"] = 500 to "boom".toByteArray()

        val outcome = ContentUpdater.checkAndUpdate("$base/latest.json", "2026.10.14.1", 1, store)
        assertEquals(FailureKind.NETWORK, (outcome as UpdateOutcome.Failed).kind)
        assertTrue((outcome as UpdateOutcome.Failed).reason.contains("HTTP 500"))
    }

    @Test
    fun malformedManifest_isRefused() {
        val store = store()
        responses["/latest.json"] = 200 to "<html>not json</html>".toByteArray()
        val outcome = ContentUpdater.checkAndUpdate("$base/latest.json", null, 1, store)
        assertEquals(FailureKind.MANIFEST_INVALID, (outcome as UpdateOutcome.Failed).kind)
    }

    @Test
    fun pointerWriteFailure_surfacesAsIoFailure_notAsException_oldVersionKept() {
        val store = store()
        val v1 = payload("2026.10.14.1")
        responses["/latest.json"] = 200 to manifest("2026.10.14.1", sha256(v1)).toByteArray()
        responses["/content.json"] = 200 to v1.toByteArray()
        assertTrue(ContentUpdater.checkAndUpdate("$base/latest.json", null, 1, store) is UpdateOutcome.Activated)

        // 让生效指针写不下去（模拟磁盘满 / IO 错误）：临时指针文件的位置被非空目录占住
        val blocker = File(tmp.root, "content/current.tmp")
        assertTrue(blocker.mkdirs())
        File(blocker, "occupied").writeText("x")

        val v2 = payload("2026.10.14.2")
        responses["/latest.json"] = 200 to manifest("2026.10.14.2", sha256(v2)).toByteArray()
        responses["/content.json"] = 200 to v2.toByteArray()

        val outcome = ContentUpdater.checkAndUpdate("$base/latest.json", "2026.10.14.1", 1, store)

        // 调用方拿到的是一个与其它失败**同类**的 Failed(IO)，而不是异常——
        // 因此「关于」页的「状态」行会照常显示「更新未生效，旧内容保留：<原因>」，不会变成静默什么都没发生。
        assertTrue("实际结果：$outcome", outcome is UpdateOutcome.Failed)
        val failed = outcome as UpdateOutcome.Failed
        assertEquals(FailureKind.IO, failed.kind)
        assertTrue("原因要能直接给人看：${failed.reason}", failed.reason.contains("指针写入失败"))
        assertEquals("旧内容仍在生效", "2026.10.14.1", currentVersionOf(store))
        assertFalse("不留孤儿快照目录", File(tmp.root, "content/versions/2026.10.14.2").exists())
    }

    @Test
    fun secondUpdate_switchesAgainAndLeavesOnlyCurrentSnapshot() {
        val store = store()
        for (v in listOf("2026.10.14.1", "2026.10.14.2", "2026.10.14.3")) {
            val body = payload(v)
            responses["/latest.json"] = 200 to manifest(v, sha256(body)).toByteArray()
            responses["/content.json"] = 200 to body.toByteArray()
            val outcome = ContentUpdater.checkAndUpdate("$base/latest.json", currentVersionOf(store), 1, store)
            assertTrue("$v -> $outcome", outcome is UpdateOutcome.Activated)
            // 每次激活后，磁盘上就只剩刚刚生效的那一个快照
            assertEquals(listOf(v), store.installedVersions())
        }
        assertEquals("2026.10.14.3", currentVersionOf(store))
        assertEquals(listOf("2026.10.14.3"), store.installedVersions())
        assertFalse(File(tmp.root, "content/versions/2026.10.14.1").exists())
        assertFalse(File(tmp.root, "content/versions/2026.10.14.2").exists())
    }
}
