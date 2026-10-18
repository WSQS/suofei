package dev.sopho.suofei.data

class ContentParseException(message: String) : Exception(message)

/**
 * `content.json` 解析。规则来自 `docs/design/content-contract.md` 第 3 节：
 * 缺必填键、`dynasty` 未在顶层 `dynasties` 里声明、`stanzas` 全空等一律**报错**，不静默兜底 ——
 * 兜底会让损坏的内容看起来「读成功了」，这正是更新路径上最危险的事。
 *
 * **字段新形状（2026-10-18，`formatVersion` 3）**：在 v2 形状上新增两处标签字段
 * - 顶层 `tags[] = [{ id: 中文标签名, members: [诗 id …] }]`（**可为空数组**；次序＝显示次序）；
 * - 每首 `poems[].tags[] = [{ id: 中文标签名, orderInTag: 整数（必填） }]`（**可为空数组**）。
 * 标签之间与标签内的次序**都由产物给定**（编译期已按拼音／`orderInTag` 排好），客户端**不重排**；
 * 本端还校验「`members` 与诗侧 `tags` 两处不打架」「`members` 次序确实与 `orderInTag` 升序一致」，
 * 因为客户端的「不重排」正建立在这个前提上。
 *
 * **v2 载荷仍可解析**（`tags` 两处都缺 ⇒ 空表）：这是「旧快照保留且可读」的实现基础；
 * v3 载荷则要求这两处**在位**（缺了是真错误，不是「没有标签」）。
 *
 * 仍有效的 v2 事实：顶层 `dynasties` ＝有序中文值数组；每首 10 键
 * `id,title,author,dynasty,genre,source,orderInSource,detail,stanzas,notes`；
 * `detail`/`notes` 空节 ⇒ `null`（键仍在）。旧形状（`dynastyKey`/`dynastyLabel`/`dynastyOrder`/
 * `era`/`variants`）不再认识。
 *
 * ⚠ 产物必须由新版编译器产出（`v3` 不可逆：老客户端会拒收更高 `formatVersion`）。
 */
object ContentParser {

    /** 本应用能解析的结构版本。远端 `formatVersion` 更高时必须拒绝激活、保留旧内容。 */
    const val SUPPORTED_FORMAT_VERSION = 3

    /** v2 的顶层键（旧产物形状；解析仍接受，`tags` 缺省为空表）。 */
    val TOP_LEVEL_KEYS_V2 = listOf("formatVersion", "contentVersion", "generatedAt", "dynasties", "poems")

    /**
     * 现行（v3）顶层键。机器可读契约＝`schema/content.schema.json` 的 `required`／`properties`。
     * `tags` 在 `dynasties` 之后、`poems` 之前（与 `items/tag-format/prototypes/tag-data-draft.json` 的已采纳形状一致）。
     */
    val TOP_LEVEL_KEYS = listOf("formatVersion", "contentVersion", "generatedAt", "dynasties", "tags", "poems")

    /** v2 每首的键（**次序即产物里的键序**）。 */
    val POEM_KEYS_V2 = listOf(
        "id", "title", "author", "dynasty", "genre", "source",
        "orderInSource", "detail", "stanzas", "notes",
    )

    /**
     * 现行（v3）每首的键：**`tags` 在末尾**（与编译器产物逐字同序：`…detail,stanzas,notes,tags`）。
     * 单测 `ContentParserTest` 拿它去比对真实产物的**键序**，所以它不是「另一份副本」，
     * 而是被那份产物钉住的接口；值以 `schema/content.schema.json` 为唯一权威。
     */
    val POEM_KEYS = listOf(
        "id", "title", "author", "dynasty", "genre", "source",
        "orderInSource", "detail", "stanzas", "notes", "tags",
    )

    /**
     * 只读顶层 `formatVersion`（不完整解析）。
     *
     * 用途：更新路径要**先**按版本门拒收（否则一个结构大改的更高版本载荷会先被本解析器
     * 当成「JSON 非法」报成 PAYLOAD_INVALID，把真实的「需要升级应用」盖掉）。
     * 读不到就返回 null，交给完整解析去报具体错误。
     */
    fun declaredFormatVersion(json: String): Int? = try {
        val root = Json.tryParseObject(json) ?: return null
        if (!root.has("formatVersion") || root.isNull("formatVersion")) null
        else (root.opt("formatVersion") as? Number)?.toInt()
    } catch (e: Exception) {
        null
    }

    fun parse(json: String): Content {
        val root = Json.tryParseObject(json) ?: throw ContentParseException("顶层不是 JSON 对象")

        val formatVersion = Json.requiredInt(root, "formatVersion")
        val contentVersion = Json.requiredString(root, "contentVersion")
        val generatedAt = root.optString("generatedAt") ?: ""

        // 顶层 dynasties：**有序的中文值数组**。元素必须是非空字符串。
        val dynastiesJson = root.optJSONArray("dynasties")
            ?: throw ContentParseException("缺少 dynasties 数组")
        if (dynastiesJson.length() == 0) throw ContentParseException("dynasties 为空")
        val dynasties = (0 until dynastiesJson.length()).map { i ->
            val raw = dynastiesJson.opt(i)
            if (raw !is String || raw.isBlank()) {
                throw ContentParseException("dynasties[$i] 不是非空字符串（新形状是中文值数组，不是对象数组）：$raw")
            }
            raw
        }
        val declaredNames = dynasties.toSet()
        if (declaredNames.size != dynasties.size) {
            throw ContentParseException("dynasties 里有重复的组名：$dynasties")
        }

        // v3 起 `formatVersion >= 3` 要求 `tags` **在位**（缺了一律报错，不把它当成「没有标签」）：
        // 「字段缺了」与「本集确实没有标签」是两件事，后者写成空数组 `[]`。
        val tagsRequirePresence = formatVersion >= 3
        val tagsJson = root.optJSONArray("tags")
        if (tagsJson == null && tagsRequirePresence) {
            throw ContentParseException("formatVersion=$formatVersion 要求顶层有 tags 数组（没有标签请写 []）")
        }
        val tags = (0 until (tagsJson?.length() ?: 0)).map { i ->
            val o = tagsJson!!.optJSONObject(i)
                ?: throw ContentParseException("tags[$i] 不是对象")
            val id = Json.requiredString(o, "id")
            val membersJson = o.optJSONArray("members")
                ?: throw ContentParseException("tags[$i]（$id）缺少 members 数组")
            val members = (0 until membersJson.length()).map { m ->
                val raw = membersJson.opt(m)
                if (raw !is String || raw.isBlank()) {
                    throw ContentParseException("tags[$i].members[$m] 不是非空诗 id：$raw")
                }
                raw
            }
            if (members.toSet().size != members.size) {
                throw ContentParseException("tags[$i]（$id）的 members 里有重复诗 id：$members")
            }
            Tag(id = id, memberIds = members)
        }
        if (tags.map { it.id }.toSet().size != tags.size) {
            throw ContentParseException("tags 里有重复的标签 id：${tags.map { it.id }}")
        }
        val declaredTagIds = tags.map { it.id }.toSet()

        val poemsJson = root.optJSONArray("poems")
            ?: throw ContentParseException("缺少 poems 数组")
        if (poemsJson.length() == 0) throw ContentParseException("poems 为空")

        val poems = (0 until poemsJson.length()).map { i ->
            val o = poemsJson.optJSONObject(i)
                ?: throw ContentParseException("poems[$i] 不是对象")

            val poemId = Json.requiredString(o, "id")

            val stanzasJson = o.optJSONArray("stanzas")
                ?: throw ContentParseException("poems[$i] 缺少 stanzas")
            if (stanzasJson.length() == 0) throw ContentParseException("poems[$i].stanzas 为空")
            val stanzas = (0 until stanzasJson.length()).map { s ->
                val lines = stanzasJson.optJSONArray(s)
                    ?: throw ContentParseException("poems[$i].stanzas[$s] 不是数组")
                (0 until lines.length()).map { l ->
                    val line = lines.optString(l, "")
                    if (line.isBlank()) {
                        throw ContentParseException("poems[$i].stanzas[$s][$l] 是空行（空行应为段边界，不是行）")
                    }
                    line
                }
            }
            if (stanzas.all { it.isEmpty() }) {
                throw ContentParseException("poems[$i].stanzas 全部为空")
            }

            // 组名：中文单值，**精确匹配**顶层数组（与编译器同口径：不去空白、不折叠繁简、不做别名）。
            val dynasty = Json.requiredString(o, "dynasty")
            if (dynasty !in declaredNames) {
                throw ContentParseException(
                    "poems[$i].dynasty=$dynasty 未在顶层 dynasties 中声明（精确匹配，不做别名归一）；" +
                        "已声明：$dynasties",
                )
            }

            // 标签归属（v3）：`tags` 键在位时逐项校验；v2 载荷没有这个键 ⇒ 空表。
            // ⚠ `orderInTag` 是**必填**（不是可选）：它与 `orderInSource` 是两个不同的字段，
            //   前者是「这一首在标签内的位置」，后者是「底本原次序」，互不顶替。
            val tagsJsonOfPoem = o.optJSONArray("tags")
            if (tagsJsonOfPoem == null && tagsRequirePresence) {
                throw ContentParseException("poems[$i]（$poemId）缺 tags 数组（formatVersion=$formatVersion；无所属标签请写 []）")
            }
            val poemTags = (0 until (tagsJsonOfPoem?.length() ?: 0)).map { t ->
                val e = tagsJsonOfPoem!!.optJSONObject(t)
                    ?: throw ContentParseException("poems[$i].tags[$t] 不是对象")
                val tagId = Json.requiredString(e, "id")
                if (tagId !in declaredTagIds) {
                    throw ContentParseException(
                        "poems[$i]（$poemId）.tags[$t].id=$tagId 未在顶层 tags 中声明；已声明：$declaredTagIds",
                    )
                }
                TagRef(id = tagId, orderInTag = Json.requiredInt(e, "orderInTag"))
            }
            if (poemTags.map { it.id }.toSet().size != poemTags.size) {
                throw ContentParseException("poems[$i]（$poemId）重复声明了同一个标签：${poemTags.map { it.id }}")
            }

            Poem(
                id = poemId,
                title = Json.requiredString(o, "title"),
                author = Json.requiredString(o, "author"),
                dynasty = dynasty,
                // 以下五项：**空节/缺值 ⇒ null（键仍在）**。客户端把 null 当真实状态，不当失败。
                genre = Json.optNonBlankString(o, "genre"),
                source = Json.optNonBlankString(o, "source"),
                orderInSource = Json.optInt(o, "orderInSource"),
                tags = poemTags,
                detail = Json.optNonBlankString(o, "detail"),
                stanzas = stanzas,
                notes = Json.optNonBlankString(o, "notes"),
                originIndex = i,
            )
        }

        validateTagIndex(tags, poems)

        return Content(
            formatVersion = formatVersion,
            contentVersion = contentVersion,
            generatedAt = generatedAt,
            dynasties = dynasties,
            poems = poems,
            tags = tags,
        )
    }

    /**
     * 标签索引与诗侧归属的**双向**校验 —— 客户端的「照产物次序渲染、不重排」正建在这上面：
     *
     * 1. `members` 里的每个诗 id 必须真实存在（不存在的 id ⇒ 这一组会静默少一首）；
     * 2. **两处事实不得打架**：声明了某标签的诗集合 == 该标签 `members` 的集合
     *    （`tags[].members` 是编译期派生的索引，不是人写的第二份事实来源）；
     * 3. `members` 的次序必须确实是 `orderInTag` 升序（且同一标签内不出现同序）。
     *    本端**不会**按 `orderInTag` 重新排序——所以「产物说有序」必须是真的。
     *
     * 三条都是「产物坏了就拒收（更新时保留旧内容）」，不是静默兜底。
     *
     * ⚠ **`members: []` 本端不报错**：编译器不会产出这种标签（schema 的 `minItems: 1`），
     * 但界面要求「零成员的标签不渲染」（用户 2026-10-18）⇒ 这里容忍它、由 `Content.tagGroups` 过滤。
     */
    private fun validateTagIndex(tags: List<Tag>, poems: List<Poem>) {
        val byId = poems.associateBy { it.id }
        for (poem in poems) {
            for (ref in poem.tags) {
                if (ref.orderInTag < 1) {
                    throw ContentParseException(
                        "诗「${poem.title}」（${poem.id}）在标签「${ref.id}」上的 orderInTag 应为 ≥ 1 的整数，实际 ${ref.orderInTag}",
                    )
                }
            }
        }
        for (tag in tags) {
            for (memberId in tag.memberIds) {
                if (!byId.containsKey(memberId)) {
                    throw ContentParseException("标签「${tag.id}」的成员 $memberId 不指向任何诗")
                }
            }
            val declared = poems.filter { p -> p.tags.any { it.id == tag.id } }.map { it.id }.toSet()
            if (declared != tag.memberIds.toSet()) {
                val onlyInMembers = tag.memberIds.filterNot { it in declared }
                val onlyInPoems = declared.filterNot { it in tag.memberIds }
                throw ContentParseException(
                    "标签「${tag.id}」的 members 与诗侧 tags 不一致：只在 members 里 $onlyInMembers；" +
                        "只在诗侧 $onlyInPoems",
                )
            }
            val orders = tag.memberIds.map { id ->
                byId.getValue(id).tags.first { it.id == tag.id }.orderInTag
            }
            if (orders != orders.sorted() || orders.toSet().size != orders.size) {
                throw ContentParseException(
                    "标签「${tag.id}」的 members 次序与 orderInTag 升序不符（还要求同标签内不同序）：$orders",
                )
            }
        }
    }
}
