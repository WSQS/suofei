package dev.sopho.suofei

import java.io.File

/**
 * 单测里读**仓库里的规范文件**（唯一来源）的公共入口。
 *
 * 两条纪律（都是踩过的坑）：
 * 1. **读不到就直接失败**并把 cwd 与尝试过的路径全列出来 —— 绝不静默跳过、绝不当成通过：
 *    静默跳过正是当初「三端各抄一份」能活下来的原因；
 * 2. 测试里**不持副本**：值只从规范文件读，代码里的值只从代码读，两边比。
 *
 * Gradle 单测的 cwd 实测是**模块目录**（`android/app`），不是 `android/`，所以这里从 cwd 逐级向上找，
 * 不写死相对层数。
 */
object TestRepoFiles {

    /** 从 cwd 逐级向上找到仓库根下的 [relative]，找不到就失败并说明尝试过哪些路径。 */
    fun repoFile(relative: String, hint: String): File {
        val cwd = System.getProperty("user.dir") ?: "."
        var dir: File? = File(cwd).absoluteFile
        val tried = mutableListOf<String>()
        var up = 0
        while (dir != null && up <= 8) {
            val candidate = File(dir, relative)
            tried += candidate.absolutePath
            if (candidate.isFile) return candidate
            dir = dir.parentFile
            up++
        }
        throw AssertionError(
            buildString {
                appendLine("读不到仓库文件 $relative —— 这道门无法验证，按失败处理（不跳过）。")
                appendLine("  cwd = $cwd")
                appendLine("  已尝试过这些路径：")
                tried.forEach { appendLine("    $it") }
                appendLine("  $hint")
            },
        )
    }

    /** 读规范/清单文件全文（UTF-8）。 */
    fun read(relative: String, hint: String): String =
        repoFile(relative, hint).readText(Charsets.UTF_8)

    /** Gradle 单测的 cwd 就是模块目录（`android/app`）；找不到就失败，不猜。 */
    fun moduleDir(): File {
        val cwd = System.getProperty("user.dir") ?: "."
        var dir: File? = File(cwd).absoluteFile
        var up = 0
        while (dir != null && up <= 4) {
            if (File(dir, "src/main/java").isDirectory) return dir
            dir = dir.parentFile
            up++
        }
        throw AssertionError(
            "找不到 Android 模块目录（应含 src/main/java）。cwd=$cwd",
        )
    }

    /** 模块内的源码目录，例如 `ui`。 */
    fun mainSourceDir(packagePath: String): File {
        val dir = File(moduleDir(), "src/main/java/dev/sopho/suofei/$packagePath")
        if (!dir.isDirectory) throw AssertionError("找不到源码目录：${dir.absolutePath}")
        return dir
    }
}
