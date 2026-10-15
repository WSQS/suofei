package dev.sopho.suofei

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import dev.sopho.suofei.data.ContentRepository
import dev.sopho.suofei.data.ContentStore
import dev.sopho.suofei.ui.AppRoot
import dev.sopho.suofei.ui.AppState
import dev.sopho.suofei.ui.PoetryTheme
import dev.sopho.suofei.ui.PoetryTokens
import java.io.File
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        // 内容目录：filesDir/content（见 docs/design/android-offline-update.md 第 4 节）。
        val store = ContentStore(File(filesDir, "content"))
        val repository = ContentRepository(applicationContext, store)
        val versionCode = packageVersionCode()
        val versionName = packageVersionName()

        setContent {
            // 「静默终端」单主题（用户 2026-10-14 选定）：令牌唯一来源 docs/design/visual-tokens.md
            PoetryTheme {
                Surface(color = PoetryTokens.bg, modifier = Modifier.fillMaxSize()) {
                    val state = remember {
                        AppState(repository, appVersionCode = versionCode, appVersionName = versionName)
                    }
                    val scope = rememberCoroutineScope()

                    // 打开时：先载入内容（来自已安装版本或 APK 内置），再自动检查一次更新。
                    LaunchedEffect(Unit) {
                        state.initialLoad()
                        state.checkForUpdate()
                    }

                    AppRoot(state = state, onCheckUpdate = { scope.launch { state.checkForUpdate() } })
                }
            }
        }
    }

    private fun packageVersionCode(): Int = runCatching {
        packageManager.getPackageInfo(packageName, 0).longVersionCode.toInt()
    }.getOrDefault(0)

    private fun packageVersionName(): String = runCatching {
        packageManager.getPackageInfo(packageName, 0).versionName ?: "?"
    }.getOrDefault("?")
}
