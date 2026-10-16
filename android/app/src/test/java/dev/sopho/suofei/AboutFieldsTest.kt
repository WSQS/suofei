package dev.sopho.suofei

import dev.sopho.suofei.ui.AboutFields
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 「关于」页（原「更新页」改名）两端**同一批字段**：**唯一来源 `web/about-fields.json`**。
 *
 * 应用运行期读不到那个文件（它不是 APK 资源），所以 Android 侧有一份运行时副本（[AboutFields]）——
 * 这里读文件与它**逐项比对**（读不到文件即失败，不跳过）。与 `UnknownAuthorsSourceTest`
 * 对着 `schema/unknown-authors.json` 是同一套纪律：改字段集＝改那个文件，然后两端同步。
 *
 * 字段的**值**是平台相关的（Android 的版本号是 APK 版本、限制写的是 Android 的限制），
 * 所以这里只比 appName / tagline / 字段标签，不比值。
 */
class AboutFieldsTest {

    private val spec = JSONObject(
        TestRepoFiles.read(
            "web/about-fields.json",
            "Android 的 AboutFields 要与 Web 的「关于」页同一批字段；缺了它就说明两棵树没对齐。",
        ),
    )

    @Test
    fun appNameAndTagline_matchTheSharedSource() {
        assertEquals(spec.getString("appName"), AboutFields.APP_NAME)
        assertEquals(spec.getString("tagline"), AboutFields.TAGLINE)
    }

    @Test
    fun fieldLabels_areExactlyTheSharedFieldSet_inOrder() {
        val arr = spec.getJSONArray("fields")
        val fromFile = (0 until arr.length()).map { arr.getString(it) }
        assertEquals("字段集（顺序也要一致）", fromFile, AboutFields.LABELS)
    }

    @Test
    fun aboutScreen_rendersTheSharedFields_andTheAndroidUpdateBlock() {
        // 「这一页确实放了这些字段」的代码级检查：AboutScreen 用 AboutFields 渲染每一行。
        val screens = TestRepoFiles.read(
            "android/app/src/main/java/dev/sopho/suofei/ui/Screens.kt",
            "「关于」页在 Screens.kt 里",
        )
        for (i in 2..4) {
            assertTrue("AboutScreen 没有渲染 AboutFields.LABELS[$i]", screens.contains("AboutFields.LABELS[$i]"))
        }
        assertTrue("AboutScreen 要用 AboutFields.APP_NAME", screens.contains("AboutFields.APP_NAME"))
        assertTrue("AboutScreen 要用 AboutFields.TAGLINE", screens.contains("AboutFields.TAGLINE"))
        assertTrue("Android 的关于页要有检查更新动作", screens.contains("onCheckUpdate"))
        // ⚠ 2026-10-16 起「更新源地址」不再显示（用户 `q-9f9eca3d` 没把它列进共用信息）⇒
        // 这条旧断言改成「仓库链接（C1 完整 URL）在场」。地址本身仍由 `UpdateEndpointTest` 逐字钉住。
        assertTrue("Android 的关于页要有仓库链接（C1 完整 URL）", screens.contains("AboutFields.REPO_URL"))
    }

    @Test
    fun sharedFieldSet_isStillRenderedOnBothEnds_evenThoughTwoEntriesAreNotAdopted() {
        // ⚠ 如实记一处**已知偏离**（不是实现错，是契约文件落后）：用户 `q-9f9eca3d` 定的共用信息是
        // 「应用名 / 应用版本 / 内容版本 / 仓库链接」，并明确「没有因此采纳介绍文案或长篇限制说明」；
        // 而 `web/about-fields.json` 里仍有「一句话说明」与「诚实的限制」。
        // 删它们＝改**跨端契约**（要同时改 Web 端与其 e2e）⇒ 必须先协调。所以本端**保留**这五项
        // （与 Web 仍一致，不制造新的两端分歧），只按采纳锚改排布：V3／无框／初态只按钮／仓库链接置底。
        // 这条断言的作用：把两件事实同时钉住 —— ① 字段集仍是文件里的那五项；② 页面确实逐项渲染它们。
        assertEquals(
            "共享字段集（落后于 q-9f9eca3d）：一句话说明与诚实的限制仍在里面",
            listOf("应用名", "一句话说明", "应用版本", "内容版本与来源", "诚实的限制"),
            AboutFields.LABELS,
        )
        val screens = TestRepoFiles.read(
            "android/app/src/main/java/dev/sopho/suofei/ui/Screens.kt",
            "「关于」页在 Screens.kt 里",
        )
        // 每一项共享字段都要真的被渲染：索引 0/1 按采纳锚（A3）当页标题与副标题，其余取 LABELS[2..4]。
        assertTrue("AboutScreen 没有渲染应用名", screens.contains("AboutFields.APP_NAME"))
        assertTrue("AboutScreen 没有渲染一句话说明", screens.contains("AboutFields.TAGLINE"))
        for (i in 2..4) {
            assertTrue("AboutScreen 没有渲染 AboutFields.LABELS[$i]", screens.contains("AboutFields.LABELS[$i]"))
        }
        assertTrue("AboutScreen 没有渲染诚实的限制", screens.contains("ABOUT_LIMITS_ANDROID"))
    }
}
