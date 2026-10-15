package dev.sopho.suofei

import dev.sopho.suofei.data.Content
import java.io.File
import org.json.JSONArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 门：「匿名作者清单」在 Android 端必须与**唯一机器可读来源** `schema/unknown-authors.json` 逐字一致。
 *
 * 为什么要有这道门：这份清单曾经三端各抄一份（编译器 / Web / Android），改一处忘一处不会有人发现，
 * 而它直接决定「匿名作者类是否排在该组最后」。现在唯一来源是仓库根的
 * `schema/unknown-authors.json`，编译器（C 线）直接读它；本端这份是它的副本，**由本测试把关**。
 *
 * 本测试**不持任何副本**：清单只从那个文件读，再与 `Content.ANONYMOUS_AUTHORS` 比；
 * 本文件里**一个作者名字面量都没有**（连注释里也不写），这样「清单只有一处字面量」可以用 grep 直接证。
 * 文件读不到时**直接失败并列出尝试过的路径**——不跳过、不当成通过：静默跳过正是当初「三端各抄一份」
 * 能活下来的原因。
 */
class UnknownAuthorsSourceTest {

    private companion object {
        const val RELATIVE_SOURCE = "schema/unknown-authors.json"

        const val HINT =
            "修法：确认仓库根下有 schema/unknown-authors.json（清单的唯一来源），不要在本测试里放副本。"

        /** 从 cwd 逐级向上找唯一来源（cwd 实测是模块目录 `android/app`，不是 `android/`）。 */
        fun locateSource(): File = TestRepoFiles.repoFile(RELATIVE_SOURCE, HINT)
    }

    @Test
    fun androidAnonymousAuthorList_matchesTheSingleSourceOfTruth() {
        val source = locateSource()
        println("匿名作者清单唯一来源：${source.absolutePath}（cwd=${System.getProperty("user.dir")}）")

        val array = try {
            JSONArray(source.readText(Charsets.UTF_8))
        } catch (e: Exception) {
            throw AssertionError("$RELATIVE_SOURCE 不是合法 JSON 数组：${e.message}")
        }

        val fromFile = (0 until array.length()).map { i ->
            val value = array.opt(i)
            if (value !is String || value.isBlank()) {
                throw AssertionError("$RELATIVE_SOURCE 第 ${i + 1} 项不是非空字符串：$value")
            }
            value
        }
        assertTrue("$RELATIVE_SOURCE 不能为空数组", fromFile.isNotEmpty())
        assertEquals(
            "$RELATIVE_SOURCE 里有重复项：$fromFile",
            fromFile.size,
            fromFile.toSet().size,
        )

        val fromCode = Content.ANONYMOUS_AUTHORS.toList()

        // 逐项 diff（顺序无所谓，但必须两项都不多不少）——失败信息要能一眼看出多了谁、少了谁。
        val missing = fromFile.filterNot { it in fromCode }
        val extra = fromCode.filterNot { it in fromFile }
        assertTrue(
            buildString {
                appendLine("Android 端匿名作者清单与唯一来源不一致：$RELATIVE_SOURCE")
                appendLine("  少了（文件里有、Domain.kt 里没有）：$missing")
                appendLine("  多了（Domain.kt 里有、文件里没有）：$extra")
                appendLine("  文件内容：$fromFile")
                appendLine("  Android 端（Domain.kt）：$fromCode")
            },
            missing.isEmpty() && extra.isEmpty(),
        )
    }
}
