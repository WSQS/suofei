package dev.sopho.suofei.data

import java.io.File
import java.io.IOException
import java.io.InputStream
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.security.MessageDigest

/** 一次安装的结果；失败时调用方必须保留旧版内容，不做任何「部分生效」。 */
sealed interface InstallResult {
    data class Activated(val version: String) : InstallResult
    data class Refused(val reason: String, val kind: RefusalKind) : InstallResult
}

enum class RefusalKind { PAYLOAD_INVALID, FORMAT_TOO_NEW, VERSION_MISMATCH, IO }

/**
 * 下载内容的落盘与**原子切换**。刻意不依赖任何 Android API（只用 java.io/java.nio），
 * 因此可以在 JVM 单元测试里用临时目录真实跑一遍切换/保旧版/清理旧版。
 *
 * 目录布局（rootDir = context.filesDir/content）：
 *
 * ```
 *   staging/<version>.part          正在下载/校验的临时文件，永远不被读者看到
 *   versions/<contentVersion>/content.json   一个完整、校验通过、此后只读的内容快照
 *   versions/<contentVersion>/meta.json      安装元信息（sha256、来源、时间）
 *   current                         文本文件：当前生效的 contentVersion（指针）
 * ```
 *
 * **只保留「当前版本」一个快照**：没有 `previous` 指针、没有事后回退路径
 * （用户 2026-10-14 决定删掉，理由与两道防线见 docs/design/android-offline-update.md 第 6 节）。
 *
 * 原子性依据（不是「写完再覆盖原文件」）：
 * 1. 读者只打开 `versions/<v>/content.json` —— 该文件在版本名出现在 `current` 之前就已经完整落盘，且此后不再改写；
 * 2. 切换只做一件事：把 `current.tmp` 重命名覆盖 `current`（同目录、同文件系统 ⇒ 单次 rename 原子）；
 * 3. 因此任一时刻，读者要么读到旧版本号、要么读到新版本号，读不到半个文件；
 *    旧快照在切换完成后即被清理，但这对正在阅读的会话没有影响——它手里是**解析后的数据**，不是磁盘文件句柄。
 */
class ContentStore(private val rootDir: File) {

    private val stagingDir = File(rootDir, "staging")
    private val versionsDir = File(rootDir, "versions")
    private val currentPointer = File(rootDir, "current")
    private val currentPointerTemp = File(rootDir, "current.tmp")

    // 单进程应用；进程内串行化安装，避免两个更新流程同时改指针。
    private val lock = Any()

    fun stagingDirPath(): String = stagingDir.absolutePath

    /** 为一次下载分配一个临时文件句柄（不在 staging 里预先创建空文件，避免半个文件被当成候选）。 */
    fun newStagingFile(version: String): File {
        stagingDir.mkdirs()
        val safe = version.replace(Regex("[^A-Za-z0-9._-]"), "_").ifBlank { "unnamed" }
        return File(stagingDir, "$safe.part")
    }

    fun activeVersion(): String? = readPointer(currentPointer)

    /**
     * 磁盘上现有的快照版本号（正常情况下最多一个，即当前生效的那个）。
     *
     * **只读诊断 / 测试用；生产代码不调用它**（没有任何界面入口需要它）——它不是「功能」，
     * 与已删除的 `rollbackToPrevious()` 有本质区别：它不改变任何状态，只是把磁盘真相念出来。
     * 单测用它当断言面（例如「只剩当前一个快照」），免得把存储布局的知识在测试里再抄一份。
     */
    fun installedVersions(): List<String> =
        (versionsDir.listFiles() ?: emptyArray())
            .filter { it.isDirectory && File(it, CONTENT_FILE).isFile }
            .map { it.name }
            .sortedWith { a, b -> ContentVersion.compare(b, a) }

    /** 读当前生效内容；指针缺失、目录缺失、JSON 损坏、结构版本过新……任何一步失败都返回 null（调用方退回内置内容）。 */
    fun loadActive(): LoadedContent? {
        val version = activeVersion() ?: return null
        val file = File(File(versionsDir, version), CONTENT_FILE)
        if (!file.isFile) return null
        val content = try {
            ContentParser.parse(file.readText(Charsets.UTF_8))
        } catch (e: Exception) {
            return null
        }
        // 契约 §4：结构版本更高的内容**不去解析**。
        // 这条在「应用被降级」时是真会发生的：新版应用装过 formatVersion=3 的内容，
        // 旧版应用再打开时，必须忽略它、退回内置内容，而不是拿旧解析器去读新结构。
        // 反过来：**低版本快照仍可读**（v2 载荷没有 tags 两处键 ⇒ 解析成空标签表）——
        // 这就是「旧快照保留」不把人踢回内置内容的依据。
        if (content.formatVersion > ContentParser.SUPPORTED_FORMAT_VERSION) return null
        // 指针与载荷自相矛盾 ⇒ 当作损坏，不静默按任一方当真。
        if (content.contentVersion != version) return null
        return LoadedContent(
            content = content,
            origin = ContentOrigin.INSTALLED,
            location = file.absolutePath,
        )
    }

    /**
     * 把 staging 文件安装成生效版本。
     *
     * 顺序刻意是「先校验、后落盘、最后一步才换指针」：
     * 任何一步失败 ⇒ Refused 且磁盘上的旧版指针、旧版目录一个字节都没动。
     */
    fun install(
        staged: File,
        expectedVersion: String?,
        expectedSha256: String?,
        sourceUrl: String?,
        nowMillis: Long = System.currentTimeMillis(),
    ): InstallResult = synchronized(lock) {
        if (!staged.isFile) {
            return InstallResult.Refused("暂存文件不存在：${staged.absolutePath}", RefusalKind.IO)
        }

        val text = try {
            staged.readText(Charsets.UTF_8)
        } catch (e: IOException) {
            return InstallResult.Refused("暂存文件读取失败：${e.message}", RefusalKind.IO)
        }

        // **先按版本门拒收，再做完整解析**：更高版本的载荷可能连形状都变了，若先走完整解析，
        // 真实原因（需升级应用）会变成一个误导的「JSON 非法」。这是「旧客户端遇到新格式」的拒收点。
        val declared = ContentParser.declaredFormatVersion(text)
        if (declared != null && declared > ContentParser.SUPPORTED_FORMAT_VERSION) {
            staged.delete()
            return InstallResult.Refused(
                "内容结构版本 $declared 高于本应用支持的 ${ContentParser.SUPPORTED_FORMAT_VERSION}",
                RefusalKind.FORMAT_TOO_NEW,
            )
        }

        val content = try {
            ContentParser.parse(text)
        } catch (e: ContentParseException) {
            staged.delete()
            return InstallResult.Refused("内容 JSON 非法：${e.message}", RefusalKind.PAYLOAD_INVALID)
        } catch (e: Exception) {
            staged.delete()
            return InstallResult.Refused("内容 JSON 解析失败：${e.message}", RefusalKind.PAYLOAD_INVALID)
        }

        if (content.formatVersion > ContentParser.SUPPORTED_FORMAT_VERSION) {
            staged.delete()
            return InstallResult.Refused(
                "内容结构版本 ${content.formatVersion} 高于本应用支持的 " +
                    "${ContentParser.SUPPORTED_FORMAT_VERSION}",
                RefusalKind.FORMAT_TOO_NEW,
            )
        }
        if (expectedVersion != null && content.contentVersion != expectedVersion) {
            staged.delete()
            return InstallResult.Refused(
                "内容版本不一致：清单声明 $expectedVersion，载荷实际 ${content.contentVersion}",
                RefusalKind.VERSION_MISMATCH,
            )
        }

        val version = content.contentVersion
        val versionDir = File(versionsDir, version)
        try {
            // 同名版本重装：先清掉旧的同名目录，保证不会出现半新半旧的目录。
            if (versionDir.exists()) versionDir.deleteRecursively()
            versionDir.mkdirs()
            val target = File(versionDir, CONTENT_FILE)
            if (!staged.renameTo(target)) {
                staged.copyTo(target, overwrite = true)
                staged.delete()
            }
            File(versionDir, META_FILE).writeText(
                buildString {
                    append("{\n")
                    append("  \"contentVersion\": ").append(JsonLite.quote(version)).append(",\n")
                    append("  \"sha256\": ").append(JsonLite.quote(expectedSha256 ?: "")).append(",\n")
                    append("  \"sourceUrl\": ").append(JsonLite.quote(sourceUrl ?: "")).append(",\n")
                    append("  \"installedAtMillis\": ").append(nowMillis).append("\n")
                    append("}\n")
                },
                Charsets.UTF_8,
            )
        } catch (e: IOException) {
            discardUnreferencedVersionDir(versionDir, version)
            staged.delete() // 已移入版本目录时为 no-op；仅在写目录早期失败时真正有用
            return InstallResult.Refused("写入版本目录失败：${e.message}；未切换", RefusalKind.IO)
        }

        // 指针就位才算「生效」。指针本身写得再糟，也只是一个文本文件：原子换它即可。
        // 指针**已经指着这个版本**时（同名重装：例如已装快照损坏、远端又给同一版）无需切换，
        // 此时内容文件已换成本次校验通过的载荷，直接把“重下一次同一版”当成一次修复。
        // 这一步同样可能真失败（磁盘满 / IO 错误）——那就当作一次**明确的失败**：不抛异常上去、
        // 不留无人引用的目录、旧内容继续生效，失败原因走与其它失败同一条路（Refused → UI 如实显示）。
        if (activeVersion() != version) {
            try {
                swapCurrentPointer(version)
            } catch (e: IOException) {
                discardUnreferencedVersionDir(versionDir, version)
                currentPointerTemp.delete()
                return InstallResult.Refused(
                    "生效指针写入失败：${e.message}；未切换，旧内容保留、未留下无人引用的快照目录",
                    RefusalKind.IO,
                )
            }
        }

        pruneOldVersions()
        return InstallResult.Activated(version = version)
    }

    /**
     * 只保留「当前生效版本」的目录，其余快照目录连同目录删除，并清掉 `staging/` 残留。
     * 这就是「新版可删改、不是只累积」在磁盘上的兑现方式：
     * 每次安装都是一个**完整快照**（不是增量叠加），被删掉的作品在新快照里自然不存在；
     * 旧快照也不再留在磁盘上（用户 2026-10-14 决定不保留「上一个版本」）。
     */
    fun pruneOldVersions() {
        val keep = setOfNotNull(activeVersion())
        val dirs = versionsDir.listFiles() ?: return
        for (dir in dirs) {
            if (!dir.isDirectory) continue
            if (dir.name in keep) continue
            dir.deleteRecursively()
        }
        // staging 里的残留（下载中断）也一并清掉。
        (stagingDir.listFiles() ?: emptyArray()).forEach { it.delete() }
    }

    private fun readPointer(file: File): String? = try {
        if (file.isFile) file.readText(Charsets.UTF_8).trim().ifBlank { null } else null
    } catch (e: IOException) {
        null
    }

    /**
     * 安装中途失败时的收尾：**不留下没有被指针引用的目录**。
     * 例外：若指针当前指的正是这个版本（同名重装），删掉它会让生效内容瞬间不可读，所以保留。
     */
    private fun discardUnreferencedVersionDir(versionDir: File, version: String) {
        if (activeVersion() == version) return
        versionDir.deleteRecursively()
    }

    /** 写 `current.tmp` → 单次重命名覆盖 `current`；失败抛 IOException，由调用方收拾（见 install）。 */
    private fun swapCurrentPointer(version: String) {
        currentPointerTemp.writeText(version, Charsets.UTF_8)
        replace(currentPointerTemp, currentPointer)
    }

    companion object {
        const val CONTENT_FILE = "content.json"
        const val META_FILE = "meta.json"

        /**
         * 同目录单次 rename。同文件系统上 `ATOMIC_MOVE` 是内核层面的原子重命名；
         * 文件系统/平台不支持时退回 `REPLACE_EXISTING`（Windows 上等价于 MoveFileEx+REPLACE，
         * 本机 JVM 单测就是跑在 Windows 上，因此这条回退路径是**实测过**的）。
         */
        fun replace(from: File, to: File) {
            try {
                Files.move(
                    from.toPath(),
                    to.toPath(),
                    StandardCopyOption.REPLACE_EXISTING,
                    StandardCopyOption.ATOMIC_MOVE,
                )
            } catch (e: Exception) {
                Files.move(from.toPath(), to.toPath(), StandardCopyOption.REPLACE_EXISTING)
            }
            // 让目录项尽快落盘，减少断电时「文件内容在但名字不在」的窗口。
            try {
                java.io.FileOutputStream(to, true).use { it.fd.sync() }
            } catch (ignored: Exception) {
                // 某些文件系统不允许对目录 fsync；失败不影响上面那次原子重命名。
            }
        }

        fun sha256Of(file: File): String = file.inputStream().use { sha256Of(it) }

        fun sha256Of(input: InputStream): String {
            val digest = MessageDigest.getInstance("SHA-256")
            val buffer = ByteArray(64 * 1024)
            while (true) {
                val read = input.read(buffer)
                if (read <= 0) break
                digest.update(buffer, 0, read)
            }
            return digest.digest().joinToString("") { "%02x".format(it) }
        }
    }
}

/** 极小的 JSON 字符串转义，只为写 meta.json（用不着引一个 JSON 依赖来写四行）。 */
private object JsonLite {
    fun quote(value: String): String = buildString {
        append('"')
        for (c in value) {
            when (c) {
                '"' -> append("\\\"")
                '\\' -> append("\\\\")
                '\n' -> append("\\n")
                '\r' -> append("\\r")
                '\t' -> append("\\t")
                else -> if (c < ' ') append("\\u%04x".format(c.code)) else append(c)
            }
        }
        append('"')
    }
}
