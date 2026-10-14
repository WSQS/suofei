package dev.sopho.suofei.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import dev.sopho.suofei.data.Content
import dev.sopho.suofei.data.ContentOrigin
import dev.sopho.suofei.data.Poem
import dev.sopho.suofei.update.FailureKind

/**
 * v1 界面：横排、清爽、无特效。视觉最终以原型（工作线 B）评审结果为准，
 * 这里只保证四条交互真实可用：时代分组目录 / 跨组搜索 / 正文分行分节 / 笔记按需展开。
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppRoot(state: AppState, onCheckUpdate: () -> Unit) {
    val content: Content? = state.loaded?.content

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        when (state.screen) {
                            Screen.LIBRARY -> "索斐"
                            Screen.SEARCH -> "搜索"
                            Screen.POEM -> state.selectedPoem?.title ?: "诗"
                            Screen.UPDATE_SETTINGS -> "内容更新"
                        },
                    )
                },
                actions = {
                    when (state.screen) {
                        Screen.LIBRARY -> {
                            TextButton(onClick = { state.openSearch() }) { Text("搜索") }
                            TextButton(onClick = { state.openUpdateSettings() }) { Text("更新") }
                        }

                        else -> TextButton(onClick = { state.back() }) { Text("返回") }
                    }
                },
            )
        },
        bottomBar = { VersionFooter(state) },
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            val error = state.loadError
            if (error != null) {
                Text(
                    "内容不可用：$error",
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(16.dp),
                )
                return@Column
            }
            if (content == null) {
                Text("载入中…", modifier = Modifier.padding(16.dp))
                return@Column
            }
            when (state.screen) {
                Screen.LIBRARY -> LibraryScreen(
                    content = content,
                    pendingVersion = state.pendingVersion,
                    onPick = { state.openPoem(it) },
                )

                Screen.SEARCH -> SearchScreen(
                    content = content,
                    query = state.query,
                    onQueryChange = { state.query = it },
                    onPick = { state.openPoem(it) },
                )

                Screen.POEM -> state.selectedPoem?.let { PoemScreen(it) }

                Screen.UPDATE_SETTINGS -> UpdateScreen(state, onCheckUpdate)
            }
        }
    }
}

/** 底部只读事实：应用版本与生效内容版本分开显示，绝不共用同一个号。 */
@Composable
private fun VersionFooter(state: AppState) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp)) {
        HorizontalDivider()
        Spacer(Modifier.height(4.dp))
        Text(
            "应用 ${state.appVersionName} (${state.appVersionCode}) · 内容 ${state.contentVersionLine()}",
            style = MaterialTheme.typography.labelSmall,
        )
    }
}

@Composable
private fun LibraryScreen(content: Content, pendingVersion: String?, onPick: (Poem) -> Unit) {
    LazyColumn(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
        if (pendingVersion != null) {
            item {
                Card(Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
                    Text(
                        "新内容 $pendingVersion 已下载并校验通过，返回本目录后生效（阅读中不替换）。",
                        style = MaterialTheme.typography.labelMedium,
                        modifier = Modifier.padding(10.dp),
                    )
                }
            }
        }
        content.groups.forEach { group ->
            item(key = "dynasty-${group.dynasty.key}") {
                Text(
                    group.dynasty.label,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(top = 16.dp, bottom = 4.dp),
                )
                HorizontalDivider()
            }
            items(group.poems, key = { it.id }) { poem -> PoemRow(poem, onPick) }
        }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun PoemRow(poem: Poem, onPick: (Poem) -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .clickable { onPick(poem) }
            .padding(vertical = 12.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(poem.title, style = MaterialTheme.typography.bodyLarge)
        Text(
            poem.author,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun SearchScreen(
    content: Content,
    query: String,
    onQueryChange: (String) -> Unit,
    onPick: (Poem) -> Unit,
) {
    val results = remember(query, content) { content.search(query) }
    Column(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
        OutlinedTextField(
            value = query,
            onValueChange = onQueryChange,
            label = { Text("搜索诗名或作者（跨时代）") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
        )
        when {
            query.isBlank() -> Text(
                "输入诗名或作者即可跨组搜索。",
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(top = 12.dp),
            )

            results.isEmpty() -> Text("无匹配结果。", modifier = Modifier.padding(top = 12.dp))

            else -> LazyColumn(Modifier.fillMaxSize()) {
                items(results, key = { it.id }) { poem ->
                    Column(
                        Modifier
                            .fillMaxWidth()
                            .clickable { onPick(poem) }
                            .padding(vertical = 12.dp),
                    ) {
                        Text(poem.title, style = MaterialTheme.typography.bodyLarge)
                        Text(
                            "${poem.dynastyLabel} · ${poem.author}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun PoemScreen(poem: Poem) {
    var notesExpanded by remember(poem.id) { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        Text(poem.title, style = MaterialTheme.typography.headlineSmall)
        Text(
            listOfNotNull(poem.dynastyLabel, poem.author, poem.era, poem.genre).joinToString(" · "),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 4.dp),
        )
        Spacer(Modifier.height(16.dp))

        // 正文：一段一块、段内一行一个 Text —— 原文分行与分节（纸本空行）都不丢。
        poem.stanzas.forEach { stanza ->
            Column(Modifier.padding(bottom = 14.dp)) {
                stanza.forEach { line -> Text(line, style = MaterialTheme.typography.bodyLarge) }
            }
        }

        HorizontalDivider()
        TextButton(onClick = { notesExpanded = !notesExpanded }) {
            Text(if (notesExpanded) "收起笔记" else "笔记")
        }
        if (notesExpanded) {
            val notes = poem.notes
            Card(Modifier.fillMaxWidth()) {
                Text(
                    notes ?: "（无笔记）",
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(12.dp),
                )
            }
            if (notes != null && notes.contains("测试夹具笔记")) {
                Text(
                    "注：以上是测试夹具笔记，不是用户笔记。",
                    style = MaterialTheme.typography.labelSmall,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
        }
        Spacer(Modifier.height(28.dp))
        Text(
            "底本/来源：${poem.source}",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(32.dp))
    }
}

@Composable
private fun UpdateScreen(state: AppState, onCheckUpdate: () -> Unit) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        Text("应用版本", fontWeight = FontWeight.SemiBold)
        Text("${state.appVersionName}（versionCode ${state.appVersionCode}）")
        Spacer(Modifier.height(12.dp))

        Text("生效内容版本", fontWeight = FontWeight.SemiBold)
        Text(state.contentVersionLine())
        Spacer(Modifier.height(12.dp))

        Text("更新源（占位地址，见代码常量）", fontWeight = FontWeight.SemiBold)
        Text(state.manifestUrlForDisplay, style = MaterialTheme.typography.bodySmall)
        Spacer(Modifier.height(12.dp))

        Text("状态", fontWeight = FontWeight.SemiBold)
        Text(
            when (val s = state.updateStatus) {
                is UpdateStatus.Idle -> "尚未检查。"
                is UpdateStatus.Checking -> "正在检查…"
                is UpdateStatus.UpToDate -> "已是最新内容（远端 ${s.remoteVersion}）。"
                is UpdateStatus.Activated ->
                    "新内容 ${s.version} 已下载、校验通过并已切换生效（${s.bytes} 字节）；返回目录后采用。"

                is UpdateStatus.Failed -> "更新未生效，旧内容保留：${s.reason}" +
                    when (s.kind) {
                        FailureKind.FORMAT_TOO_NEW, FailureKind.APP_TOO_OLD -> "（需更新应用，内容不会被动）"
                        FailureKind.CHECKSUM_MISMATCH, FailureKind.SIZE_MISMATCH -> "（下载/校验未通过）"
                        else -> ""
                    }
                is UpdateStatus.Error -> s.message
            },
        )
        Spacer(Modifier.height(16.dp))
        TextButton(onClick = onCheckUpdate, enabled = state.updateStatus !is UpdateStatus.Checking) {
            Text("检查更新")
        }
        Spacer(Modifier.height(8.dp))
        Text(
            "说明：更新只替换内容数据，不安装新 APK；应用代码升级只提示下载（本版未实现下载 APK）。\n" +
                "当前内置内容为占位夹具，非校对文本。",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
