package dev.sopho.suofei.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import dev.sopho.suofei.data.ContentOrigin
import dev.sopho.suofei.data.ContentRepository
import dev.sopho.suofei.data.LoadedContent
import dev.sopho.suofei.data.Poem
import dev.sopho.suofei.update.ContentUpdater
import dev.sopho.suofei.update.FailureKind
import dev.sopho.suofei.update.UpdateEndpoint
import dev.sopho.suofei.update.UpdateOutcome
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

enum class Screen { LIBRARY, POEM, UPDATE_SETTINGS }

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

    var selectedPoem: Poem? by mutableStateOf(null)
        private set

    var updateStatus: UpdateStatus by mutableStateOf(UpdateStatus.Idle)
        private set

    /** 已下载并切换生效，但**尚未**被本次阅读会话采用的新版本号。 */
    var pendingVersion: String? by mutableStateOf(null)
        private set

    var loadError: String? by mutableStateOf(null)
        private set

    val manifestUrlForDisplay: String get() = UpdateEndpoint.displayUrl()

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

    fun openPoem(poem: Poem) {
        selectedPoem = poem
        screen = Screen.POEM
    }

    fun back() {
        when (screen) {
            Screen.POEM -> openLibrary()
            Screen.UPDATE_SETTINGS -> openLibrary()
            Screen.LIBRARY -> Unit
        }
    }

    fun openUpdateSettings() {
        screen = Screen.UPDATE_SETTINGS
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
                    manifestUrl = manifestUrlForDisplay,
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

    fun contentVersionLine(): String = loaded?.let {
        "${it.content.contentVersion}（来源：${
            when (it.origin) {
                ContentOrigin.BUNDLED_ASSET -> "APK 内置"
                ContentOrigin.INSTALLED -> "已下载"
            }
        }）"
    } ?: "尚未载入"
}
