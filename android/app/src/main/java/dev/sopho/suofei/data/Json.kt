package dev.sopho.suofei.data

import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

/**
 * org.json 的薄封装：把「缺键 / 类型不对」变成明确的异常，而不是 0 / "" 这种看起来成功的默认值。
 * Android 运行时用平台自带的 org.json；JVM 单元测试用 org.json:json 依赖提供实现。
 */
internal object Json {

    fun tryParseObject(text: String): JSONObject? = try {
        // 契约允许 BOM/空白差异，交给 json 自己处理前先去 BOM。
        JSONObject(text.removePrefix("\uFEFF").trim())
    } catch (e: JSONException) {
        null
    }

    fun requiredString(o: JSONObject, key: String): String {
        if (!o.has(key) || o.isNull(key)) throw ContentParseException("缺少字符串字段 $key")
        val v = o.optString(key, "")
        if (v.isBlank()) throw ContentParseException("字段 $key 为空")
        return v
    }

    fun optNonBlankString(o: JSONObject, key: String): String? {
        if (!o.has(key) || o.isNull(key)) return null
        val v = o.optString(key, "").trim()
        return v.ifBlank { null }
    }

    fun requiredInt(o: JSONObject, key: String): Int {
        if (!o.has(key) || o.isNull(key)) throw ContentParseException("缺少整数字段 $key")
        val v = o.opt(key)
        if (v !is Number) throw ContentParseException("字段 $key 不是整数：$v")
        val asLong = v.toLong()
        if (asLong < Int.MIN_VALUE || asLong > Int.MAX_VALUE) {
            throw ContentParseException("字段 $key 超出整数范围：$v")
        }
        return asLong.toInt()
    }

    fun optLong(o: JSONObject, key: String): Long? {
        if (!o.has(key) || o.isNull(key)) return null
        val v = o.opt(key)
        return if (v is Number) v.toLong() else null
    }

    /**
     * 可选整数：缺键 / null / **类型不对** → 一律返回 null（＝视为「产物没给这个信息」）。
     * 与 Web 端（E 线）口径一致：非整数不静默当作 0，也不让整份内容解析失败——
     * 阅读器宁可按兜底次序把诗显示出来并如实告知，也不该因为一个字段类型不对就什么都读不到。
     * 产物形状的严格性由编译期（tools/）与构建门（ContentParserTest 真解析内置产物）保证。
     */
    fun optInt(o: JSONObject, key: String): Int? {
        if (!o.has(key) || o.isNull(key)) return null
        val v = o.opt(key)
        if (v !is Number) return null
        val asLong = v.toLong()
        if (asLong < Int.MIN_VALUE || asLong > Int.MAX_VALUE) return null
        return asLong.toInt()
    }

    fun optObject(o: JSONObject, key: String): JSONObject? = o.optJSONObject(key)

    fun optArray(o: JSONObject, key: String): JSONArray? = o.optJSONArray(key)

    fun optString(o: JSONObject, key: String): String? {
        if (!o.has(key) || o.isNull(key)) return null
        return o.optString(key, "")
    }
}
