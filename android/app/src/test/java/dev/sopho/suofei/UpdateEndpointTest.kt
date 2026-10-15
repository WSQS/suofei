package dev.sopho.suofei

import dev.sopho.suofei.update.ContentUpdater
import dev.sopho.suofei.update.UpdateEndpoint
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 更新源地址是**接口值**：一旦发出去，已安装的客户端就照着它取清单，改它等于改协议。
 *
 * 所以这里把走到位后的 URL **逐字写死**。写死是故意的——它就是本次发布的接口值；
 * 若写成「用常量算常量」，地址被改错一位也照样绿，这门就等于没有。
 *
 * 2026-10-15：更新源由占位 `https://example.invalid/suofei` 换成真实站点（GitHub Pages，强制 https）。
 */
class UpdateEndpointTest {

    /** 刚换上的真实站点地址：`{BASE_URL}/{MANIFEST_PATH}`，逐字算好写在这里。 */
    private val realManifestUrl = "https://wsqs.github.io/suofei/content/latest.json"

    @Test
    fun manifestUrl_isLiteralRealEndpoint() {
        assertEquals(realManifestUrl, UpdateEndpoint.manifestUrl())
    }

    /** 界面上那一行显示的就是真正去取的地址（显示与实际不能是两回事）。 */
    @Test
    fun displayUrl_isTheSameAsTheUrlWeFetch() {
        assertEquals(UpdateEndpoint.manifestUrl(), UpdateEndpoint.displayUrl())
    }

    /** 站点强制 https；拼接也不许出现多余斜杠（`//content` 这类会真 404）。 */
    @Test
    fun endpoint_isHttpsAndHasNoDoubledSlash() {
        val url = UpdateEndpoint.manifestUrl()
        assertTrue("更新源必须是 https：$url", url.startsWith("https://"))
        assertFalse("路径里不该出现多余斜杠：$url", url.removePrefix("https://").contains("//"))
    }

    /**
     * 清单里的 `url` 发布侧给的是**相对路径**（如 `2026.10.16.19/content.json`，没有前导斜杠），
     * 按既有逻辑相对清单文件所在目录解析 ⇒ 落在站点的 `content/` 目录下。这里钉的是这条语义，
     * 不是再算一遍常量。版本号用明显合成的值，避免被当成真实发布版本。
     */
    @Test
    fun relativeManifestUrl_resolvesUnderSiteContentDirectory() {
        assertEquals(
            "https://wsqs.github.io/suofei/content/2099.1.1.1/content.json",
            ContentUpdater.resolveUrl(realManifestUrl, "2099.1.1.1/content.json"),
        )
        // 清单给绝对地址时原样使用（换 CDN 不必改清单形状）。
        assertEquals(
            "https://wsqs.github.io/suofei/content/2099.1.1.1/content.json",
            ContentUpdater.resolveUrl(
                realManifestUrl,
                "https://wsqs.github.io/suofei/content/2099.1.1.1/content.json",
            ),
        )
    }
}
