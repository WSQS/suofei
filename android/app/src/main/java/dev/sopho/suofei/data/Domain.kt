package dev.sopho.suofei.data

/**
 * 内容领域模型 —— 与 docs/design/content-contract.md 第 2 节的 `dist/content.json` 一一对应。
 * 这里只有「读」的模型：客户端不解析 Markdown，也不写回 JSON。
 */

data class Dynasty(val key: String, val label: String, val order: Int)

data class Variant(val text: String, val note: String)

data class Poem(
    val id: String,
    val title: String,
    val author: String,
    val dynastyKey: String,
    val dynastyLabel: String,
    val dynastyOrder: Int,
    val era: String?,
    val genre: String?,
    val source: String,
    val variants: List<Variant>,
    /** 分段数组，内层为行数组。契约要求：纸本空行 → 段边界，原文分行不得丢失。 */
    val stanzas: List<List<String>>,
    /** null 表示「没有笔记」这个真实状态；客户端不得用占位内容顶替。 */
    val notes: String?,
    /** 编译期算好的拼音排序**名次**（整数，不是拼音字符串）；缺失时退回 author/title 本身。 */
    val authorSortKey: Int?,
    val titleSortKey: Int?,
    /** 在 JSON 数组里的原始下标，用于排序键相同时保持确定性。 */
    val originIndex: Int,
) {
    /**
     * 产物是否带了次序信息。带了就**照数组次序原样渲染**：编译期是唯一排序权威，客户端不得重排
     * —— 否则用户在编译期选定的次序（如《文选》原次序）会被两端各自重排静默推翻。
     */
    val hasOrderingInfo: Boolean get() = authorSortKey != null || titleSortKey != null
}

data class DynastyGroup(val dynasty: Dynasty, val poems: List<Poem>)

data class Content(
    val formatVersion: Int,
    val contentVersion: String,
    val generatedAt: String,
    val dynasties: List<Dynasty>,
    val poems: List<Poem>,
) {
    /** 目录：按组 order 升序，只包含实际有内容的组；组内按契约规则排序。 */
    val groups: List<DynastyGroup> by lazy {
        poems.groupBy { it.dynastyKey }
            .mapNotNull { (key, poems) ->
                val dynasty = dynasties.firstOrNull { it.key == key } ?: return@mapNotNull null
                // 契约：产物已按组内规则排好，客户端不得重排。
                // 只有产物一个排序键都没给（老产物 / 手写 JSON）时，才退回本地排序兜底。
                val ordered =
                    if (poems.any { it.hasOrderingInfo }) poems else poems.sortedWith(POEM_ORDER)
                DynastyGroup(dynasty, ordered)
            }
            .sortedBy { it.dynasty.order }
    }

    /** v0 最低要求：对 title / author 做子串匹配（不做拼音增强）。 */
    fun search(rawQuery: String): List<Poem> {
        val q = rawQuery.trim()
        if (q.isEmpty()) return emptyList()
        return groups.flatMap { group ->
            group.poems.filter { p ->
                p.title.contains(q, ignoreCase = true) || p.author.contains(q, ignoreCase = true)
            }
        }
    }

    companion object {
        /** 契约的显式规则：佚名/未知作者排在该组最后，不靠字符串碰巧。 */
        private val ANONYMOUS_AUTHORS = setOf("佚名", "未详", "无名氏", "阙名")

        private fun authorRank(author: String): Int =
            if (author.isBlank() || author in ANONYMOUS_AUTHORS) 1 else 0

        internal val POEM_ORDER: Comparator<Poem> = compareBy<Poem> { authorRank(it.author) }
            .thenBy(nullsLast()) { it.authorSortKey }
            .thenBy(nullsLast()) { it.titleSortKey }
            .thenBy { it.author }
            .thenBy { it.title }
            .thenBy { it.originIndex }
    }
}

/** 这段内容是从哪儿来的：APK 内置 assets，还是已下载并校验通过、切换生效的版本。 */
enum class ContentOrigin { BUNDLED_ASSET, INSTALLED }

data class LoadedContent(
    val content: Content,
    val origin: ContentOrigin,
    /** 生效内容文件所在位置的可读描述（用于自证与排查）。 */
    val location: String,
)
