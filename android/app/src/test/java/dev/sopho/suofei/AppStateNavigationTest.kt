package dev.sopho.suofei

import dev.sopho.suofei.ui.Screen
import dev.sopho.suofei.data.ContentRepository
import dev.sopho.suofei.data.ContentStore
import dev.sopho.suofei.data.Poem
import dev.sopho.suofei.ui.AppState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * 四个页面之间的**导航行为**（JVM 上真跑 `AppState` 的转移，无需设备）。
 *
 * 用户 2026-10-15 定的两条（属同一族，必须一起成立）：
 *  ① 详情页的「返回」落到**那首诗**（不是目录）；
 *  ② 诗页返回目录、关于页返回目录 → 目录。
 * 这里连 `openPoemDetail()` 不改 `selectedPoem` 这一点也钉住 —— 那正是「返回能回到那一首」的依据。
 */
class AppStateNavigationTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private fun poem(id: String) = Poem(
        id = id,
        title = "题$id",
        author = "佚名",
        dynastyKey = "han",
        dynastyLabel = "汉",
        dynastyOrder = 100,
        era = "东汉末",
        genre = "五言古诗",
        source = "底本",
        variants = emptyList(),
        stanzas = listOf(listOf("行一。")),
        notes = null,
        orderInSource = 1,
        originIndex = 0,
    )

    private fun state(): AppState {
        val store = ContentStore(tmp.newFolder("content"))
        val repo = ContentRepository(store, { "{}" }, "assets/content/content.json")
        return AppState(repo, appVersionCode = 2, appVersionName = "0.1.1")
    }

    @Test
    fun libraryToPoemToDetail_andBack() {
        val s = state()
        val p = poem("p1")

        assertEquals(Screen.LIBRARY, s.screen)

        s.openPoem(p)
        assertEquals(Screen.POEM, s.screen)
        assertEquals(p, s.selectedPoem)

        s.openPoemDetail()
        assertEquals("诗页的「详情」入口进入诗歌详情页", Screen.POEM_DETAIL, s.screen)
        assertEquals("详情页不改变选中的诗（返回才能回到那一首）", p, s.selectedPoem)

        s.back()
        assertEquals("详情页返回 → 那首诗（不是目录）", Screen.POEM, s.screen)
        assertEquals(p, s.selectedPoem)

        s.back()
        assertEquals("诗页返回 → 目录", Screen.LIBRARY, s.screen)
        assertNull("回到目录后不再持有选中的诗", s.selectedPoem)
    }

    @Test
    fun openPoemDetail_withoutASelectedPoem_doesNothing() {
        val s = state()
        s.openPoemDetail()
        assertEquals("没有选中的诗时详情页不可达（不跳到一个空页）", Screen.LIBRARY, s.screen)
    }

    @Test
    fun aboutPage_entryAndBack() {
        val s = state()
        assertEquals(Screen.LIBRARY, s.screen)

        s.openAbout()
        assertEquals(Screen.ABOUT, s.screen)
        assertEquals("「关于」页不需要先选一首诗", null, s.selectedPoem)

        s.back()
        assertEquals("关于页返回 → 目录", Screen.LIBRARY, s.screen)
    }

    @Test
    fun backFromAbout_neverLandsOnAPoem() {
        val s = state()
        s.openPoem(poem("p1"))
        s.openAbout()
        s.back()
        assertEquals("关于页返回 → 目录（不是上一首诗）", Screen.LIBRARY, s.screen)
        assertNull(s.selectedPoem)
    }
}
