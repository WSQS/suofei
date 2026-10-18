package dev.sopho.suofei.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import dev.sopho.suofei.data.ContentRepository
import dev.sopho.suofei.data.LoadedContent
import dev.sopho.suofei.data.Poem
import dev.sopho.suofei.update.ContentUpdater
import dev.sopho.suofei.update.FailureKind
import dev.sopho.suofei.update.UpdateEndpoint
import dev.sopho.suofei.update.UpdateOutcome
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** 四个页面（用户 2026-10-15 定）：目录 / 诗 / 诗歌详情 / 关于（原「更新页」改名）。 */
enum class Screen { LIBRARY, POEM, POEM_DETAIL, ABOUT }

/**
 * 目录页的两个视图（用户 2026-10-18 定：顶部「朝代 ｜ 标签」两个 tab，标签页与朝代页**同构**）。
 *
 * ⚠ 它们**不是**页面：页面集合仍是四个（`Screen`）。切 tab 不改变 `Screen`，所以
 * 「诗页返回 ⇒ 回到**进入它的那个原视图**」不需要额外记“从哪进的”——`libraryTab` 一直是那个值，
 * 两个 tab 各自的展开与滚动位置也各自留在 `AppRoot` 的 `remember` 里。
 */
enum class LibraryTab { DYNASTY, TAG }

/** 更新检查的可见状态。每种失败都明确写「旧版保留」。 */
sealed interface UpdateStatus {
    data object Idle : UpdateStatus
    data object Checking : UpdateStatus
    data class UpToDate(val remoteVersion: String) : UpdateStatus
    data class Activated(val version: String, val bytes: Long) : UpdateStatus
    data class Failed(val kind: FailureKind, val reason: String) : UpdateStatus
    data class Error(val message: String) : UpdateStatus
}

/**
 * 极简状态持有者（v1 不引入 ViewModel/DI）。只做三件事：
 * 载入内容、按需检查更新、把「新内容已就绪」推迟到用户回到目录时才生效。
 */
class AppState(
    private val repository: ContentRepository,
    val appVersionCode: Int,
    val appVersionName: String,
) {
    var loaded: LoadedContent? by mutableStateOf(null)
        private set

    var screen: Screen by mutableStateOf(Screen.LIBRARY)
        private set

    /** 目录页当前视图（朝代 / 标签）。回目录时**不改它** —— 这就是「返回回到进入它的原视图」。 */
    var libraryTab: LibraryTab by mutableStateOf(LibraryTab.DYNASTY)
        private set

    var selectedPoem: Poem? by mutableStateOf(null)
        private set

    var updateStatus: UpdateStatus by mutableStateOf(UpdateStatus.Idle)
        private set

    /** 已下载并切换生效，但**尚未**被本次阅读会话采用的新版本号。 */
    var pendingVersion: String? by mutableStateOf(null)
        private set

    var loadError: String? by mutableStateOf(null)
        private set

    /**
     * 更新清单地址（真实站点）。⚠ 2026-10-16：用户 `q-9f9eca3d` 定的关于页共用信息是
     * 应用名/应用版本/内容版本/仓库链接 —— **更新源地址没有被一并采纳**，所以它不再显示在界面上，
     * 只作为检查更新的实际入口；地址本身仍由 `UpdateEndpointTest` 逐字钉住。
     */
    val manifestUrl: String get() = UpdateEndpoint.displayUrl()

    suspend fun initialLoad() {
        val result = withContext(Dispatchers.IO) {
            try {
                Triple(repository.load(), null, null)
            } catch (e: Exception) {
                // 连 APK 内置内容都读不出来：如实报错，不伪造任何内容。
                Triple(null, "内置内容读取失败：${e.message}", null)
            }
        }
        loaded = result.first
        loadError = result.second
    }

    fun openLibrary() {
        // 回到目录时才采用等待中的新内容：阅读页不会在阅读中被换掉。
        val pending = pendingVersion
        if (pending != null) {
            loaded = try {
                repository.load()
            } catch (e: Exception) {
                loadError = "切换新内容失败：${e.message}"
                loaded
            }
            pendingVersion = null
        }
        selectedPoem = null
        screen = Screen.LIBRARY
    }

    /** 切目录页视图（朝代 ／ 标签）。两个 tab 的展开与滚动各自保留，见 `AppRoot`。 */
    fun selectLibraryTab(tab: LibraryTab) {
        libraryTab = tab
    }

    fun openPoem(poem: Poem) {
        selectedPoem = poem
        screen = Screen.POEM
    }

    /**
     * 诗歌详情页（第四页）：这一首的考据与来源（底本/来源 + 异文）。
     * 入口在诗页；它不改变 [selectedPoem] —— 所以详情页的「返回」会回到**那首诗**（不是目录）。
     */
    fun openPoemDetail() {
        if (selectedPoem == null) return
        screen = Screen.POEM_DETAIL
    }

    /**
     * 返回：详情页 → 那首诗；诗页/关于页 → 目录（回目录时会采用等待中的新内容，见 [openLibrary]）。
     * 深链接场景下 Android 没有独立 URL，但「直开＝从顶部开始」由 `AppRoot` 的列表状态初值保证。
     */
    fun back() {
        when (screen) {
            Screen.POEM -> openLibrary()
            Screen.POEM_DETAIL -> screen = Screen.POEM
            Screen.ABOUT -> openLibrary()
            Screen.LIBRARY -> Unit
        }
    }

    fun openAbout() {
        screen = Screen.ABOUT
    }

    /** 打开应用时自动调用；也由「检查更新」按钮手动调用。 */
    suspend fun checkForUpdate() {
        if (updateStatus is UpdateStatus.Checking) return
        updateStatus = UpdateStatus.Checking
        val current = loaded?.content?.contentVersion
        val store = repository.store
        val outcome = withContext(Dispatchers.IO) {
            try {
                ContentUpdater.checkAndUpdate(
                    manifestUrl = manifestUrl,
                    currentVersion = current,
                    appVersionCode = appVersionCode,
                    store = store,
                    userAgent = "Suofei-Android/$appVersionName ($appVersionCode)",
                )
            } catch (e: Exception) {
                UpdateOutcome.Failed(FailureKind.IO, "更新流程异常：${e.message}")
            }
        }
        updateStatus = when (outcome) {
            is UpdateOutcome.UpToDate -> UpdateStatus.UpToDate(outcome.remoteVersion)
            is UpdateOutcome.Activated -> {
                pendingVersion = outcome.version
                UpdateStatus.Activated(outcome.version, outcome.bytes)
            }

            is UpdateOutcome.Failed -> UpdateStatus.Failed(outcome.kind, outcome.reason)
        }
    }

    /**
     * 共享的「内容版本」值：**只有版本号本身**。
     * ⚠ 按用户 2026-10-16 的 `q-9f9eca3d` 与 about-update ①：「内容来源：已下载／内置」
     * **不该出现在两端共用的版本信息里**（Android 若要呈现来源，只能放进更新块，而那也尚未采纳）——
     * 所以这一行不再拼「（来源：…）」。
     */
    fun contentVersionText(): String = loaded?.content?.contentVersion ?: CONTENT_VERSION_NOT_LOADED
}
