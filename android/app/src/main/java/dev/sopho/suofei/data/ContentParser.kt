package dev.sopho.suofei.data

class ContentParseException(message: String) : Exception(message)

/**
 * `content.json` 解析。规则来自 `docs/design/content-contract.md` 第 3 节：
 * 缺必填键、`dynasty` 未在顶层 `dynasties` 里声明、`stanzas` 全空等一律**报错**，不静默兜底 ——
 * 兜底会让损坏的内容看起来「读成功了」，这正是更新路径上最危险的事。
 *
 * **字段新形状（2026-10-16，`formatVersion` 2）**：
 * - 顶层 `dynasties` ＝ **有序的中文值数组**（旧形状的对象数组〔key／label／order 三元组〕不再接受）；
 * - 每首 **10 键**：`id,title,author,dynasty,genre,source,orderInSource,detail,stanzas,notes`；
 * - **分组与身份行都用每首的中文 `dynasty`**，与顶层数组**精确匹配**（不做别名/繁简折叠）；
 * - `detail` / `notes` **空节 ⇒ `null`（键仍在）**：`notes == null` 是「没有笔记」这个真实状态，
 *   界面**连入口都不出现**（见 `ui/Screens.kt`），绝不生成占位笔记。
 *
 * ⚠ **与另一条线（S1S2 编译器）同批**：产物必须由新版编译器产出。本端**不再认识**旧形状
 * （`dynastyKey`/`dynastyLabel`/`dynastyOrder`/`era`/`variants`）—— 这正是不升版就会被
 * 老客户端读错的那一类变更（`formatVersion` 1 → 2，不可逆）。
 */
object ContentParser {

    /** 本应用能解析的结构版本。远端 `formatVersion` 更高时必须拒绝激活、保留旧内容。 */
    const val SUPPORTED_FORMAT_VERSION = 2

    /** 新形状的顶层键（机器可读契约＝`schema/content.schema.json` 的 `required`／`properties`）。 */
    val TOP_LEVEL_KEYS = listOf("formatVersion", "contentVersion", "generatedAt", "dynasties", "poems")

    /**
     * 新形状每首的键（**次序即产物里的键序**）。单测 `ContentParserTest` 拿它去比对
     * `tests/fixtures/contract/real-01-full.json` 的**真实键序**，所以它不是「另一份副本」，
     * 而是被那份产物钉住的接口。（2026-10-16：原先比对的是会被归档的原型目录 `…/rules-v4/json/`。）
     */
    val POEM_KEYS = listOf(
        "id", "title", "author", "dynasty", "genre", "source",
        "orderInSource", "detail", "stanzas", "notes",
    )

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

        val poemsJson = root.optJSONArray("poems")
            ?: throw ContentParseException("缺少 poems 数组")
        if (poemsJson.length() == 0) throw ContentParseException("poems 为空")

        val poems = (0 until poemsJson.length()).map { i ->
            val o = poemsJson.optJSONObject(i)
                ?: throw ContentParseException("poems[$i] 不是对象")

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

            Poem(
                id = Json.requiredString(o, "id"),
                title = Json.requiredString(o, "title"),
                author = Json.requiredString(o, "author"),
                dynasty = dynasty,
                // 以下五项：**空节/缺值 ⇒ null（键仍在）**。客户端把 null 当真实状态，不当失败。
                genre = Json.optNonBlankString(o, "genre"),
                source = Json.optNonBlankString(o, "source"),
                orderInSource = Json.optInt(o, "orderInSource"),
                detail = Json.optNonBlankString(o, "detail"),
                stanzas = stanzas,
                notes = Json.optNonBlankString(o, "notes"),
                originIndex = i,
            )
        }

        return Content(
            formatVersion = formatVersion,
            contentVersion = contentVersion,
            generatedAt = generatedAt,
            dynasties = dynasties,
            poems = poems,
        )
    }
}
