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
        for (i in AboutFields.LABELS.indices) {
            assertTrue("AboutScreen 没有渲染 AboutFields.LABELS[$i]", screens.contains("AboutFields.LABELS[$i]"))
        }
        assertTrue("AboutScreen 要用 AboutFields.APP_NAME", screens.contains("AboutFields.APP_NAME"))
        assertTrue("Android 的关于页要显示更新源", screens.contains("manifestUrlForDisplay"))
        assertTrue("Android 的关于页要有检查更新动作", screens.contains("onCheckUpdate"))
    }
}
