package dev.sopho.suofei.data

/**
 * 内容领域模型 —— 与 `docs/design/content-contract.md` 第 2 节的 `dist/content.json` 一一对应。
 * 这里只有「读」的模型：客户端不解析 Markdown 源文件，也不写回 JSON。
 *
 * **字段形状（2026-10-16，`formatVersion` 2）**：顶层 `dynasties` 是**有序的中文值数组**（不再是
 * `[{key,label,order}]`）；每首 **10 键** `id,title,author,dynasty,genre,source,orderInSource,detail,stanzas,notes`，
 * 缺值**保键**写 `null`；分组用每首的**中文 `dynasty`** 与顶层数组**精确匹配**。
 * 机器可读的预期见夹具 `tests/fixtures/contract/real-01-full.json`（＋契约 `schema/content.schema.json`）；
 * 原型轮那份 `expectations.json` 是**历史快照**，已不是测试输入。
 *
 * ⚠ 这条与**另一条线（S1S2 编译器）**同批：字段形状变了，产物必须由新版编译器产出；
 * 本端不再认识旧形状（`dynastyKey`/`dynastyLabel`/`dynastyOrder`/`era`/`variants`）。
 */

/** 一个分组：**组名就是顶层 `dynasties` 数组里的那个中文串**（不再有 key/label/order 三元组）。 */
data class DynastyGroup(val name: String, val poems: List<Poem>)

data class Poem(
    val id: String,
    val title: String,
    val author: String,
    /** 组名（中文单值）；必须精确等于顶层 `dynasties` 里的某一项，不做别名/繁简折叠。 */
    val dynasty: String,
    /** 体裁；缺值 `null`（键仍在）。 */
    val genre: String?,
    /** 底本与来源；缺值 `null`。详情页在它前面挂「底本与来源」标签。 */
    val source: String?,
    /** 底本原次序（编译期写入的整数）。**产物公开发布的唯一次序字段**。 */
    val orderInSource: Int?,
    /** `## 详情` 节的**整段 Markdown 文本**；空节/缺节 ⇒ `null`（键仍在）。 */
    val detail: String?,
    /** 分段数组，内层为行数组。契约要求：纸本空行 → 段边界，原文分行不得丢失。 */
    val stanzas: List<List<String>>,
    /** `## 笔记` 节的整段 Markdown 文本。`null` 表示「没有笔记」这个真实状态——**连入口都不出现**。 */
    val notes: String?,
    /** 在 JSON 数组里的原始下标，用于兜底排序键相同时保持确定性。 */
    val originIndex: Int,
) {
    /**
     * 产物是否带了次序信息。带了就**照数组次序原样渲染**：编译期是唯一排序权威，客户端不得重排
     * —— 否则用户在编译期选定的次序（如《文选》原次序）会被两端各自重排静默推翻。
     * 判定依据＝整数 orderInSource（与 Web 端口径一致）。
     */
    val hasOrderingInfo: Boolean get() = orderInSource != null
}

data class Content(
    val formatVersion: Int,
    val contentVersion: String,
    val generatedAt: String,
    /** **有序的中文组名数组**（显示次序＝数组次序）。 */
    val dynasties: List<String>,
    val poems: List<Poem>,
) {
    /**
     * 目录：按顶层数组的次序分组，**只包含实际有内容的组**（空组不出现）；
     * 组名文字直接用数组里的那个串（两端同一份）。
     * 组内次序：产物已排好 ⇒ 原样；产物一个排序键都没给（老产物/手写 JSON）⇒ 本地兜底排序。
     */
    val groups: List<DynastyGroup> by lazy {
        dynasties.mapNotNull { name ->
            val members = poems.filter { it.dynasty == name }
            if (members.isEmpty()) {
                null
            } else {
                val ordered =
                    if (members.any { it.hasOrderingInfo }) members else members.sortedWith(POEM_ORDER)
                DynastyGroup(name, ordered)
            }
        }
    }

    companion object {
        /** 契约 §2.1 的显式规则：佚名/未知作者排在该组最后，不靠字符串碰巧。
         *
         *  **唯一机器可读来源＝仓库根 `schema/unknown-authors.json`**（用户 2026-10-14 拍板）：
         *  编译器直接读那个文件；本端这一份是它的**逐字副本**，并由单测 `UnknownAuthorsSourceTest`
         *  逐项比对把关（读不到文件即失败，不跳过）；Web 端同理。
         *  所以改清单＝改那个文件，然后三端同步——不要只改这一行。
         *  空串/空白由 isBlank 处理，不写进集合。
         *  `阙名` 已按用户 2026-10-14 决定并入（对现有 19 首无可见影响——它们都是「佚名」）。 */
        internal val ANONYMOUS_AUTHORS = setOf("佚名", "无名氏", "阙名", "未知", "未详", "不详")

        private fun authorRank(author: String): Int =
            if (author.isBlank() || author in ANONYMOUS_AUTHORS) 1 else 0

        /** 兜底排序（仅在产物未给任何次序信息时使用）：具名作者在前、佚名类在后，然后作者名/诗名/原始下标。 */
        internal val POEM_ORDER: Comparator<Poem> = compareBy<Poem> { authorRank(it.author) }
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
