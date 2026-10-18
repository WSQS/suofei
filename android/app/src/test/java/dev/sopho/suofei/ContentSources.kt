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

    /**
     * 源文 front matter 里的 `orderInSource` —— **独立于编译器与产物**地读（源侧真值）。
     *
     * 为什么要这一个：若期望值也从产物取，就是「产物自证」—— 编译器写错了、或内置产物过期了，
     * 断言两边一起错、仍然全绿。所以对「源文说了什么」必须直接读源文。
     *
     * 读法：只扫 **front matter 块**（第一对 `---` 之间）。没有该行 ⇒ `null`（编译器把「不写」读成 null，
     * 不替用户编）；有该行但值不是整数 ⇒ **直接失败**（不静默当 null，否则源文写坏了也无人报警）。
     */
    fun orderInSourceOf(file: File): Int? {
        val lines = file.readText(Charsets.UTF_8).lines()
        val start = lines.indexOfFirst { it.trim() == "---" }
        val end = if (start < 0) -1 else lines.withIndex().firstOrNull { it.index > start && it.value.trim() == "---" }?.index ?: -1
        if (start < 0 || end < 0) throw AssertionError("源文读不出 front matter：${file.absolutePath}")
        val line = lines.subList(start + 1, end).firstOrNull { it.startsWith("orderInSource:") } ?: return null
        val raw = line.removePrefix("orderInSource:").trim().removeSurrounding("\"")
        return raw.toIntOrNull()
            ?: throw AssertionError("源文 front matter 的 `orderInSource` 不是整数：${file.absolutePath}\n  $line")
    }

    /** 源文里写了 `## 详情` 节的文件数 —— 产物里 `detail` 非 `null` 的条数必须等于它。 */
    val sourcesWithDetail: Int get() = poemSources.count { file ->
        file.readText(Charsets.UTF_8).lineSequence().any { it.trim() == "## 详情" }
    }

    /**
     * 源文的 **id**：与编译器同一条规则 —— 相对 `content/poems/` 的路径、去 `.md`、路径分隔符 → `-`、NFC 归一。
     *
     * ⚠ 2026-10-16（对话侧纠正）：查找源文要**按 id**，**不再要求「文件名 == 题名」**。
     * 那条「文件名 == 题名」只是我先前写进单测的**查找办法**，**不是**用户的
     * 「相对路径派生 ID / 中文任意目录」契约；把它当成对作者的文件命名约束是**越界**的
     * （例如组诗 `梦李白二首/其一.md` 这种自然层级会被误红）。
     */
    fun idOf(file: File): String =
        java.text.Normalizer.normalize(
            file.absoluteFile.relativeTo(poemsRoot.absoluteFile).path.removeSuffix(".md").replace(File.separatorChar, '-'),
            java.text.Normalizer.Form.NFC,
        )

    /** id → 源文（**id 撞车直接失败**：不静默取一个）。 */
    val byId: Map<String, File> by lazy {
        val m = HashMap<String, File>()
        for (f in poemSources) {
            val id = idOf(f)
            val prev = m.put(id, f)
            if (prev != null) {
                throw AssertionError("源文 id 撞车：$id\n  ${prev.absolutePath}\n  ${f.absolutePath}")
            }
        }
        m
    }

    /**
     * 源文 front matter 里声明的**一条**标签归属（`- id: X` + 紧随的 `orderInTag: N`）。
     * `tags: []` 与根本不写 `tags` 都读成「没有归属」。
     */
    data class DeclaredTag(val id: String, val orderInTag: Int)

    /**
     * 读一首源文里声明的标签（按**书写次序**，不重排）。
     *
     * ⚠ 这是「期望值」的来源：若产物与源文不一致（例如源文补了归属而内置产物忘了重编），
     * 用到本方法的断言就会**真报红**。读法认不出来时**直接失败**（不静默当成没标签）。
     */
    fun declaredTagsOf(file: File): List<DeclaredTag> {
        val lines = file.readText(Charsets.UTF_8).lines()
        val start = lines.indexOfFirst { it.trim() == "---" }
        val end = if (start < 0) -1 else lines.withIndex().firstOrNull { it.index > start && it.value.trim() == "---" }?.index ?: -1
        if (start < 0 || end < 0) throw AssertionError("源文读不出 front matter：${file.absolutePath}")
        val out = ArrayList<DeclaredTag>()
        var inTags = false
        for (raw in lines.subList(start + 1, end)) {
            if (raw.isNotEmpty() && !raw[0].isWhitespace()) {
                // 顶格的都是新的顶层键：`tags:` 起一个块，`tags: []` 当场就是空块。
                inTags = raw.startsWith("tags:") && !Regex("""^tags:\s*\[\s*]\s*$""").matches(raw.trim())
                continue
            }
            if (!inTags) continue
            val item = Regex("""^\s*-\s*id:\s*(.+)$""").find(raw)
            if (item != null) {
                val id = item.groupValues[1].trim().removeSurrounding("\"")
                out.add(DeclaredTag(id, Int.MIN_VALUE))
                continue
            }
            val order = Regex("""^\s*orderInTag:\s*(-?\d+)\s*$""").find(raw)
                ?: throw AssertionError("源文 tags 块里出现读不懂的行：${file.absolutePath}\n  $raw")
            if (out.isEmpty()) throw AssertionError("orderInTag 出现在任何 - id 之前：${file.absolutePath}")
            out[out.lastIndex] = out.last().copy(orderInTag = order.groupValues[1].toInt())
        }
        return out
    }

    /**
     * **标签 → 成员 id（按 orderInTag 升序）**，完全从源文派生。
     * 同标签同序 ⇒ 直接失败（编译器会报 `TAG_ORDER_DUP`，这里也不默默按 id 兜底）。
     */
    val tagsBySource: Map<String, List<String>> by lazy {
        val byTag = LinkedHashMap<String, MutableList<Pair<Int, String>>>()
        for (f in poemSources) {
            val poemId = idOf(f)
            for (t in declaredTagsOf(f)) {
                if (t.orderInTag == Int.MIN_VALUE) {
                    throw AssertionError("源文里标签「${t.id}」缺少 orderInTag：${f.absolutePath}")
                }
                byTag.getOrPut(t.id) { ArrayList() }.add(t.orderInTag to poemId)
            }
        }
        val out = LinkedHashMap<String, List<String>>()
        for ((tagId, list) in byTag) {
            val seen = HashSet<Int>()
            for ((order, _) in list) {
                if (!seen.add(order)) {
                    throw AssertionError("源文里「$tagId」有两条 orderInTag=$order（编译器会报 TAG_ORDER_DUP，这里不默默兜底）")
                }
            }
            out[tagId] = list.sortedBy { it.first }.map { it.second }
        }
        out
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
