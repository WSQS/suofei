package dev.sopho.suofei.update

import dev.sopho.suofei.data.ContentParseException
import dev.sopho.suofei.data.ContentParser
import dev.sopho.suofei.data.ContentStore
import dev.sopho.suofei.data.ContentVersion
import dev.sopho.suofei.data.InstallResult
import dev.sopho.suofei.data.RefusalKind
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL

/** 更新尝试的结果。**任何 Failed 都意味着旧内容原封不动**。 */
sealed interface UpdateOutcome {

    /** 远端不比本地新（或版本相同）——什么都不做。 */
    data class UpToDate(val remoteVersion: String, val currentVersion: String?) : UpdateOutcome

    /** 下载 + 校验通过 + 指针已原子切换。 */
    data class Activated(
        val version: String,
        val previousVersion: String?,
        val bytes: Long,
        val sha256: String,
    ) : UpdateOutcome

    data class Failed(val kind: FailureKind, val reason: String) : UpdateOutcome
}

enum class FailureKind {
    /** 连不上/超时/HTTP 错误码。 */
    NETWORK,

    /** 清单缺失、字段不全、sha256 格式不合法。 */
    MANIFEST_INVALID,

    /** 远端内容结构版本高于本应用支持：拒绝激活，保留旧版，提示升级应用。 */
    FORMAT_TOO_NEW,

    /** 远端要求更高版本的应用（minAppVersionCode）：不动内容，提示升级应用。 */
    APP_TOO_OLD,

    /** 下载字节数与清单不符。 */
    SIZE_MISMATCH,

    /** SHA-256 与清单不符（下载损坏/被篡改）。 */
    CHECKSUM_MISMATCH,

    /** 下载完了但内容 JSON 非法/版本自相矛盾。 */
    PAYLOAD_INVALID,

    /** 落盘失败。 */
    IO,
}

/**
 * 检查 → 完整下载 → 校验 → 原子切换。
 *
 * 关键取舍：
 * - **不做增量**：每次都是一份完整内容快照。代价是流量，换来的是「切换只改一个指针」的原子性，
 *   以及「新版可删改」（旧作品在新快照里自然消失，不需要删除逻辑去追）。
 * - **fail-closed**：清单没给 sha256 就拒绝更新；宁可停在旧版，也不激活一份没校验过的内容。
 * - **下载只写 staging**：整个过程中，读者看得到的内容文件一个字节都不改。
 */
object ContentUpdater {

    /** 内容体积上限，防止远端返回失控大小的载荷。32 MiB 对纯文本诗集绰绰有余。 */
    const val MAX_CONTENT_BYTES: Long = 32L * 1024 * 1024

    private const val CONNECT_TIMEOUT_MS = 10_000
    private const val READ_TIMEOUT_MS = 30_000

    fun checkAndUpdate(
        manifestUrl: String,
        currentVersion: String?,
        appVersionCode: Int,
        store: ContentStore,
        userAgent: String = "Suofei-Android",
        onProgress: (downloaded: Long, total: Long?) -> Unit = { _, _ -> },
    ): UpdateOutcome {
        val manifestText = try {
            getText(manifestUrl, userAgent)
        } catch (e: IOException) {
            return UpdateOutcome.Failed(FailureKind.NETWORK, "取更新清单失败：${e.message}")
        } catch (e: Exception) {
            return UpdateOutcome.Failed(FailureKind.NETWORK, "取更新清单失败：${e.message}")
        }

        val manifest = try {
            UpdateManifestParser.parse(manifestText)
        } catch (e: ContentParseException) {
            return UpdateOutcome.Failed(FailureKind.MANIFEST_INVALID, "更新清单非法：${e.message}")
        }

        if (manifest.formatVersion > ContentParser.SUPPORTED_FORMAT_VERSION) {
            return UpdateOutcome.Failed(
                FailureKind.FORMAT_TOO_NEW,
                "远端内容结构版本 ${manifest.formatVersion} 高于本应用支持的 " +
                    "${ContentParser.SUPPORTED_FORMAT_VERSION}；保留当前内容，请更新应用",
            )
        }

        val minApp = manifest.minAppVersionCode
        if (minApp != null && minApp > appVersionCode) {
            return UpdateOutcome.Failed(
                FailureKind.APP_TOO_OLD,
                "该内容需要应用版本 ≥ $minApp（当前 $appVersionCode）；保留当前内容，请更新应用",
            )
        }

        if (!ContentVersion.isNewer(manifest.contentVersion, currentVersion)) {
            return UpdateOutcome.UpToDate(manifest.contentVersion, currentVersion)
        }

        val absoluteUrl = resolveUrl(manifestUrl, manifest.url)
        val staged = store.newStagingFile(manifest.contentVersion)
        val digest: String
        val bytes: Long
        try {
            val (d, b) = download(absoluteUrl, staged, manifest.size, userAgent, onProgress)
            digest = d
            bytes = b
        } catch (e: SizeMismatchException) {
            staged.delete()
            return UpdateOutcome.Failed(FailureKind.SIZE_MISMATCH, e.message ?: "字节数不符")
        } catch (e: Exception) {
            staged.delete()
            return UpdateOutcome.Failed(FailureKind.NETWORK, "下载内容失败：${e.message}")
        }

        if (!digest.equals(manifest.sha256, ignoreCase = true)) {
            staged.delete()
            return UpdateOutcome.Failed(
                FailureKind.CHECKSUM_MISMATCH,
                "SHA-256 不符（清单 ${manifest.sha256}，实际 $digest）；已丢弃下载结果，保留旧内容",
            )
        }

        return when (val result = store.install(
            staged = staged,
            expectedVersion = manifest.contentVersion,
            expectedSha256 = digest,
            sourceUrl = absoluteUrl,
        )) {
            is InstallResult.Activated -> UpdateOutcome.Activated(
                version = result.version,
                previousVersion = result.previousVersion,
                bytes = bytes,
                sha256 = digest,
            )

            is InstallResult.Refused -> UpdateOutcome.Failed(
                kind = when (result.kind) {
                    RefusalKind.FORMAT_TOO_NEW -> FailureKind.FORMAT_TOO_NEW
                    RefusalKind.PAYLOAD_INVALID -> FailureKind.PAYLOAD_INVALID
                    RefusalKind.VERSION_MISMATCH -> FailureKind.PAYLOAD_INVALID
                    RefusalKind.IO -> FailureKind.IO
                },
                reason = "${result.reason}；保留旧内容",
            )
        }
    }

    private class SizeMismatchException(message: String) : IOException(message)

    private fun resolveUrl(base: String, candidate: String): String {
        if (candidate.startsWith("http://") || candidate.startsWith("https://")) return candidate
        // 相对路径按 BASE_URL 解析（清单里允许写相对路径，便于换域名）。
        return try {
            URL(URL(base), candidate).toString()
        } catch (e: Exception) {
            candidate
        }
    }

    private fun getText(url: String, userAgent: String): String =
        openConnection(url, userAgent).let { conn ->
            conn.inputStream.use { it.readBytes() }.toString(Charsets.UTF_8)
        }

    private fun download(
        url: String,
        target: File,
        expectedSize: Long?,
        userAgent: String,
        onProgress: (Long, Long?) -> Unit,
    ): Pair<String, Long> {
        if (expectedSize != null && expectedSize > MAX_CONTENT_BYTES) {
            throw IOException("清单声明体积 $expectedSize 超过上限 $MAX_CONTENT_BYTES")
        }
        val conn = openConnection(url, userAgent)
        val declared = expectedSize ?: conn.contentLengthLong.takeIf { it > 0 }
        if (declared != null && declared > MAX_CONTENT_BYTES) {
            conn.disconnect()
            throw IOException("远端内容体积 $declared 超过上限 $MAX_CONTENT_BYTES")
        }
        target.parentFile?.mkdirs()
        var written = 0L
        val digest = java.security.MessageDigest.getInstance("SHA-256")
        try {
            conn.inputStream.use { input: InputStream ->
                target.outputStream().use { out ->
                    val buffer = ByteArray(64 * 1024)
                    while (true) {
                        val read = input.read(buffer)
                        if (read <= 0) break
                        written += read
                        if (written > MAX_CONTENT_BYTES) {
                            throw IOException("下载体积超过上限 $MAX_CONTENT_BYTES")
                        }
                        digest.update(buffer, 0, read)
                        out.write(buffer, 0, read)
                        onProgress(written, declared)
                    }
                    out.flush()
                }
            }
        } finally {
            conn.disconnect()
        }
        if (expectedSize != null && written != expectedSize) {
            throw SizeMismatchException("字节数不符：清单 $expectedSize，实际 $written")
        }
        return digest.digest().joinToString("") { "%02x".format(it) } to written
    }

    private fun openConnection(url: String, userAgent: String): HttpURLConnection {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.connectTimeout = CONNECT_TIMEOUT_MS
        conn.readTimeout = READ_TIMEOUT_MS
        conn.instanceFollowRedirects = true
        conn.setRequestProperty("User-Agent", userAgent)
        conn.setRequestProperty("Accept", "application/json")
        // 明确表示本端不做 gzip 协商以外的花活；内容是小文本，保持简单可核。
        conn.setRequestProperty("Cache-Control", "no-cache")
        conn.connect()
        val code = conn.responseCode
        if (code !in 200..299) {
            val body = try {
                conn.errorStream?.use { it.readBytes() }?.toString(Charsets.UTF_8)?.take(200)
            } catch (ignored: Exception) {
                null
            }
            conn.disconnect()
            throw IOException("HTTP $code${if (body.isNullOrBlank()) "" else "：$body"}")
        }
        return conn
    }
}
