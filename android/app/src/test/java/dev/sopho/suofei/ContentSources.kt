package dev.sopho.suofei

import java.io.File

/**
 * 单测里**从内容的唯一来源**（`content/poems/` 下的 v2 源文件，递归）取事实的公共入口。
 *
 * 为什么要有它（2026-10-16 新增杜甫《梦李白二首》两条时立的）：内置产物
 * （`android/app/src/main/assets/content/content.json`）里的**首数**与**组清单**曾以字面量写进断言
 * （`assertEquals(20, content.poems.size)`、`assertEquals(listOf("汉", "近现代"), …)`）——
 * 每加一首诗都要改测试；而真正该被抓住的事故形态是 **「源文加了诗、内置产物忘了重编」**
 * （2026-10-14 真实发生过：内置内容落后于内容源，Android 单测全绿、发布线注入新产物后才红）。
 * 于是把期望值改成**从源文派生**：源文首数、源文里出现过的组名、写了 `## 详情` 的源文数。
 * ⇒ 源与产物一旦不同步，这里**真报红**，而且**不是放松**：断言的是更强的「产物 == 源」一致性。
 *
 * 纪律与 [TestRepoFiles] 相同：**读不到就直接失败**并列出尝试过的路径，绝不静默跳过、绝不当成通过。
 */
object ContentSources {

    /** 内容根 `content/poems/`（v2 布局：允许任意层级）。 */
    val poemsRoot: File = TestRepoFiles.repoFile(
        "content/poems/古诗十九首/行行重行行.md",
        "内容的唯一来源（v2 布局）；读不到即失败，不跳过。",
    ).parentFile!!.parentFile!!

    /**
     * 与编译器 `tools/lib/scan.mjs` 的 `ignoredReason` 同一套忽略规则：
     * `.` 前缀（隐藏）、`_` 前缀（说明/占位）、`README*`、`~` 前缀或后缀（临时文件）。
     * 这里**故意复刻**它：本对象要数的是「编译器会当成诗的那些文件」，不是「磁盘上所有文件」。
     */
    private fun isPoemSource(name: String): Boolean =
        !name.startsWith(".") &&
            !name.startsWith("_") &&
            !name.startsWith("~") &&
            !name.endsWith("~") &&
            !name.startsWith("README", ignoreCase = true)

    /** 编译器会读的源文清单（已排除说明/占位/隐藏/临时文件）。 */
    val poemSources: List<File> = poemsRoot.walkTopDown()
        .filter { it.isFile && isPoemSource(it.name) }
        .sortedBy { it.absolutePath }
        .toList()

    /** 源文数 —— 内置产物的首数必须**等于**它（产物 == 源）。 */
    val poemCount: Int get() = poemSources.size

    /** 源文 front matter 里的 `dynasty:` 值（**不做任何归一**：契约是精确匹配）。 */
    fun dynastyOf(file: File): String {
        val line = file.readText(Charsets.UTF_8).lineSequence().firstOrNull { it.startsWith("dynasty:") }
            ?: throw AssertionError("源文缺少 front matter 行 `dynasty:`：${file.absolutePath}")
        return line.removePrefix("dynasty:").trim().removeSurrounding("\"")
    }

    /** 源文里**出现过的**组名（按首次出现次序去重）。 */
    val dynastiesInSources: List<String> get() = poemSources.map { dynastyOf(it) }.distinct()

    /** 源文里写了 `## 详情` 节的文件数 —— 产物里 `detail` 非 `null` 的条数必须等于它。 */
    val sourcesWithDetail: Int get() = poemSources.count { file ->
        file.readText(Charsets.UTF_8).lineSequence().any { it.trim() == "## 详情" }
    }

    /**
     * 朝代注册表 **`tools/lib/dynasties.mjs`**（组名与组序的唯一权威）解析出的 `label → order`。
     *
     * 本端**不持副本**（不在这里写死组名或 order 表）：注册表加了新朝代，这里自动跟上；
     * 写法一旦变化导致解析不出条目，就**按失败处理**（不跳过、不猜）。
     */
    val dynastiesRegistry: Map<String, Int> by lazy {
        val text = TestRepoFiles.read(
            "tools/lib/dynasties.mjs",
            "朝代注册表是组名与组序的唯一权威；读不到即失败，不跳过。",
        )
        val entries = Regex("""key:\s*'[^']*',\s*label:\s*'([^']+)',\s*order:\s*(\d+)""")
            .findAll(text)
            .associate { it.groupValues[1] to it.groupValues[2].toInt() }
        if (entries.isEmpty()) {
            throw AssertionError(
                "从 tools/lib/dynasties.mjs 里解析不出任何 {key, label, order} 条目 —— " +
                    "注册表写法已变，这道门无法验证，按失败处理（不跳过、不猜）。",
            )
        }
        entries
    }
}
