package dev.sopho.suofei.data

class ContentParseException(message: String) : Exception(message)

/**
 * `content.json` 解析。规则来自 docs/design/content-contract.md 第 3 节：
 * 缺必填键、`dynastyKey` 未声明、`stanzas` 全空等一律**报错**，不静默兜底 ——
 * 兜底会让损坏的内容看起来「读成功了」，这正是更新路径上最危险的事。
 */
object ContentParser {

    /** 本应用能解析的结构版本。远端 `formatVersion` 更高时必须拒绝激活、保留旧内容。 */
    const val SUPPORTED_FORMAT_VERSION = 1

    fun parse(json: String): Content {
        val root = Json.tryParseObject(json) ?: throw ContentParseException("顶层不是 JSON 对象")

        val formatVersion = Json.requiredInt(root, "formatVersion")
        val contentVersion = Json.requiredString(root, "contentVersion")
        val generatedAt = root.optString("generatedAt") ?: ""

        val dynastiesJson = root.optJSONArray("dynasties")
            ?: throw ContentParseException("缺少 dynasties 数组")
        if (dynastiesJson.length() == 0) throw ContentParseException("dynasties 为空")
        val dynasties = (0 until dynastiesJson.length()).map { i ->
            val o = dynastiesJson.optJSONObject(i)
                ?: throw ContentParseException("dynasties[$i] 不是对象")
            Dynasty(
                key = Json.requiredString(o, "key"),
                label = Json.requiredString(o, "label"),
                order = Json.requiredInt(o, "order"),
            )
        }
        val dynastyKeys = dynasties.map { it.key }.toSet()

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

            val dynastyKey = Json.requiredString(o, "dynastyKey")
            if (dynastyKey !in dynastyKeys) {
                throw ContentParseException("poems[$i].dynastyKey=$dynastyKey 未在 dynasties 中声明")
            }
            val declared = dynasties.first { it.key == dynastyKey }

            Poem(
                id = Json.requiredString(o, "id"),
                title = Json.requiredString(o, "title"),
                author = Json.requiredString(o, "author"),
                dynastyKey = dynastyKey,
                // 契约里 dynastyLabel/dynastyOrder 冗余存在；以声明表为准，冗余值冲突不静默采用。
                dynastyLabel = declared.label,
                dynastyOrder = declared.order,
                era = Json.optNonBlankString(o, "era"),
                genre = Json.optNonBlankString(o, "genre"),
                source = Json.requiredString(o, "source"),
                variants = parseVariants(o, index = i),
                stanzas = stanzas,
                notes = Json.optNonBlankString(o, "notes"),
                authorSortKey = Json.optNonBlankString(o, "authorSortKey"),
                titleSortKey = Json.optNonBlankString(o, "titleSortKey"),
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

    private fun parseVariants(o: org.json.JSONObject, index: Int): List<Variant> {
        val arr = o.optJSONArray("variants") ?: return emptyList()
        return (0 until arr.length()).map { v ->
            val vo = arr.optJSONObject(v)
                ?: throw ContentParseException("poems[$index].variants[$v] 不是对象")
            Variant(
                text = Json.requiredString(vo, "text"),
                note = vo.optString("note") ?: "",
            )
        }
    }
}
