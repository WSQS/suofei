package dev.sopho.suofei.update

import dev.sopho.suofei.data.ContentParseException
import dev.sopho.suofei.data.Json
import org.json.JSONObject

/**
 * ⚠️ 接口区：更新检查协议与远端地址**全部集中在本文件**，改协议只动这里。
 * 协议本身是「接口决定（暂定，待用户确认）」—— 详情与代价见 docs/design/android-offline-update.md 第 2 节。
 */
object UpdateEndpoint {

    /**
     * 更新源＝**真实站点**（2026-10-15 由占位地址换成它；用户拍板推进更新源，并要并进本次发布）。
     *
     * 换的判据：站点侧 `content/latest.json` 与 `content/<版本>/content.json` **已在发布白名单里**
     * （都是发布脚本的产物，不必为此新增产物），站点已上线且强制 https。
     * 走到位后的 URL＝`https://wsqs.github.io/suofei/content/latest.json` —— `UpdateEndpointTest`
     * 把它**逐字**断言（写死是故意的：它就是本次发布的接口值），地址改错一位即报红点名。
     * 旧占位值 `https://example.invalid/suofei`（`.invalid` 是保留域名，占位期保证不会误连真站点）已不再使用。
     *
     * 换域名/换路径时只改这两行。
     */
    const val BASE_URL: String = "https://wsqs.github.io/suofei"
    const val MANIFEST_PATH: String = "content/latest.json"

    /** 检查更新的入口 URL：`{BASE_URL}/{MANIFEST_PATH}`。 */
    fun manifestUrl(): String = "${BASE_URL.trimEnd('/')}/${MANIFEST_PATH.trimStart('/')}"

    /** 手动检查入口展示用（让用户看得见当前配的是哪）。 */
    fun displayUrl(): String = manifestUrl()
}

/**
 * 更新清单（远端 `content/latest.json`）的模型。
 *
 * 这是**跨端/跨版本接口**：Web 端与后续客户端都会读同一个文件，字段一旦发布就不能随意改名。
 */
data class UpdateManifest(
    val formatVersion: Int,
    val contentVersion: String,
    /** 完整 content.json 的下载地址（绝对 URL 或相对 BASE_URL 的路径）。 */
    val url: String,
    /** 完整 content.json 的 SHA-256（小写十六进制）。缺它就拒绝更新 —— 校验不通过宁可不动。 */
    val sha256: String,
    /** 字节数，可缺省；给了就强制比对。 */
    val size: Long?,
    /** 需要的最低应用 versionCode；更高 ⇒ 只提示升级应用，不动内容。 */
    val minAppVersionCode: Int?,
)

object UpdateManifestParser {

    /** 清单文件里必须出现的字段名（接口的一部分，文档与测试都依赖它）。 */
    const val FIELD_FORMAT_VERSION = "formatVersion"
    const val FIELD_CONTENT_VERSION = "contentVersion"
    const val FIELD_URL = "url"
    const val FIELD_SHA256 = "sha256"
    const val FIELD_SIZE = "size"
    const val FIELD_MIN_APP_VERSION_CODE = "minAppVersionCode"

    fun parse(json: String): UpdateManifest {
        val root = Json.tryParseObject(json) ?: throw ContentParseException("更新清单不是 JSON 对象")
        val sha = Json.requiredString(root, FIELD_SHA256).trim().lowercase()
        if (sha.length != 64 || sha.any { it !in "0123456789abcdef" }) {
            throw ContentParseException("$FIELD_SHA256 不是 64 位十六进制：$sha")
        }
        return UpdateManifest(
            formatVersion = Json.requiredInt(root, FIELD_FORMAT_VERSION),
            contentVersion = Json.requiredString(root, FIELD_CONTENT_VERSION),
            url = Json.requiredString(root, FIELD_URL),
            sha256 = sha,
            size = Json.optLong(root, FIELD_SIZE),
            minAppVersionCode = Json.optLong(root, FIELD_MIN_APP_VERSION_CODE)?.toInt(),
        )
    }
}

/** 供测试与文档使用的清单样例（不是真实内容，只描述形状）。 */
internal fun sampleManifestJson(
    contentVersion: String = "2026.10.14.2",
    sha256: String = "0".repeat(64),
    formatVersion: Int = 1,
): String = JSONObject()
    .put(UpdateManifestParser.FIELD_FORMAT_VERSION, formatVersion)
    .put(UpdateManifestParser.FIELD_CONTENT_VERSION, contentVersion)
    .put(UpdateManifestParser.FIELD_URL, "content/$contentVersion/content.json")
    .put(UpdateManifestParser.FIELD_SHA256, sha256)
    .put(UpdateManifestParser.FIELD_SIZE, 4096)
    .put(UpdateManifestParser.FIELD_MIN_APP_VERSION_CODE, 1)
    .toString(2)
