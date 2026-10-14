package dev.sopho.suofei

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import dev.sopho.suofei.data.ContentRepository
import dev.sopho.suofei.data.ContentStore
import dev.sopho.suofei.ui.AppRoot
import dev.sopho.suofei.ui.AppState
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
            MaterialTheme {
                Surface {
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
