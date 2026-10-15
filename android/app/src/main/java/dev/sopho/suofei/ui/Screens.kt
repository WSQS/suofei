package dev.sopho.suofei.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.sopho.suofei.data.Content
import dev.sopho.suofei.data.Poem

/**
 * 界面结构（v1）：时代分组目录 / 跨组搜索 / 正文分行分节 / 笔记按需展开。
 *
 * 视觉＝「静默终端」（用户 2026-10-14 选定）：**所有颜色/字号/间距都取自 [PoetryTokens]**
 * （唯一来源 `docs/design/visual-tokens.md`），本文件不写任何硬编码色值或字号。
 * 三种结构记号（组名竖线 / `[n] 首` 计数 / 题头无下划线）见 `StructuralMarks.kt` 与 `PoemHead.kt`。
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppRoot(state: AppState, onCheckUpdate: () -> Unit) {
    val content: Content? = state.loaded?.content

    Scaffold(
        containerColor = PoetryTokens.bg,
        topBar = {
            TopAppBar(
                title = {
                    when (state.screen) {
                        // 品牌名用规范的字距（0.3em）
                        Screen.LIBRARY -> Text("索斐", style = PoetryTextStyles.brand)
                        Screen.SEARCH -> Text("搜索", style = PoetryTextStyles.brand)
                        Screen.POEM -> Text(state.selectedPoem?.title ?: "诗", style = PoetryTextStyles.ui)
                        Screen.UPDATE_SETTINGS -> Text("内容更新", style = PoetryTextStyles.ui)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = PoetryTokens.bgSticky,
                    titleContentColor = PoetryTokens.text,
                    actionIconContentColor = PoetryTokens.accentStrong,
                ),
                actions = {
                    when (state.screen) {
                        Screen.LIBRARY -> {
                            TextButton(onClick = { state.openSearch() }, colors = textActionColors()) {
                                Text("搜索")
                            }
                            TextButton(onClick = { state.openUpdateSettings() }, colors = textActionColors()) {
                                Text("更新")
                            }
                        }

                        else -> TextButton(onClick = { state.back() }, colors = textActionColors()) {
                            Text("返回")
                        }
                    }
                },
            )
        },
        bottomBar = { VersionFooter(state) },
    ) { padding ->
        // testTagsAsResourceId：让 uiautomator / uiautomator dump 能看到 testTag（便于验收时定位节点）
        Column(
            Modifier
                .padding(padding)
                .fillMaxSize()
                .semantics { testTagsAsResourceId = true },
        ) {
            val error = state.loadError
            if (error != null) {
                Text(
                    "内容不可用：$error",
                    style = PoetryTextStyles.ui,
                    color = PoetryTokens.warnText,
                    modifier = Modifier.padding(
                        horizontal = PoetryTokens.rem(PoetryTokens.PAD_REM),
                        vertical = PoetryTokens.rem(PoetryTokens.BLANK_PAD_VERTICAL_REM),
                    ),
                )
                return@Column
            }
            if (content == null) {
                Text(
                    "载入中…",
                    style = PoetryTextStyles.blank,
                    modifier = Modifier.padding(horizontal = PoetryTokens.rem(PoetryTokens.PAD_REM))
                        .padding(vertical = PoetryTokens.rem(PoetryTokens.BLANK_PAD_VERTICAL_REM)),
                )
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

@Composable
private fun textActionColors() = ButtonDefaults.textButtonColors(contentColor = PoetryTokens.accentStrong)

/** 底部只读事实：应用版本与生效内容版本分开显示，绝不共用同一个号（等宽小字＝技术性信息）. */
@Composable
private fun VersionFooter(state: AppState) {
    Column(
        Modifier
            .fillMaxWidth()
            .padding(
                horizontal = PoetryTokens.rem(PoetryTokens.PAD_REM),
                vertical = PoetryTokens.rem(0.35f),
            ),
    ) {
        HairLine()
        Spacer(Modifier.height(PoetryTokens.rem(0.25f)))
        Text(
            "应用 ${state.appVersionName} (${state.appVersionCode}) · 内容 ${state.contentVersionLine()}",
            style = PoetryTextStyles.monoFaint,
        )
    }
}

@Composable
private fun LibraryScreen(content: Content, pendingVersion: String?, onPick: (Poem) -> Unit) {
    LazyColumn(
        Modifier
            .fillMaxSize()
            .padding(horizontal = PoetryTokens.rem(PoetryTokens.PAD_REM)),
        verticalArrangement = Arrangement.spacedBy(PoetryTokens.rem(PoetryTokens.GROUP_GAP_REM)),
    ) {
        if (pendingVersion != null) {
            item {
                // 提示类横幅：规范 §2 的 warn-soft / line-warn / warn-text
                Box(
                    Modifier
                        .fillMaxWidth()
                        .padding(top = PoetryTokens.rem(PoetryTokens.GROUP_GAP_REM))
                        .background(PoetryTokens.warnSoft)
                        .border(
                            width = PoetryTokens.HAIRLINE_DP.dp,
                            color = PoetryTokens.lineWarn,
                            shape = RoundedCornerShape(PoetryTokens.RADIUS_SMALL_DP.dp),
                        )
                        .padding(rowPadding()),
                ) {
                    Text(
                        "新内容 $pendingVersion 已下载并校验通过，返回本目录后生效（阅读中不替换）。",
                        style = PoetryTextStyles.resultSub,
                        color = PoetryTokens.warnText,
                    )
                }
            }
        }
        content.groups.forEach { group ->
            item(key = "dynasty-${group.dynasty.key}") {
                // 组头＝一张卡片（原型 .grouprow）：1px line 边框 + radius + surface 底 + row-pad
                Box(
                    Modifier
                        .fillMaxWidth()
                        .background(PoetryTokens.surface)
                        .border(
                            width = PoetryTokens.HAIRLINE_DP.dp,
                            color = PoetryTokens.line,
                            shape = RoundedCornerShape(PoetryTokens.RADIUS_DP.dp),
                        )
                        .padding(rowPadding()),
                ) {
                    GroupNameRow(name = group.dynasty.label, count = group.poems.size)
                }
            }
            items(group.poems, key = { it.id }) { poem -> PoemRow(poem, onPick) }
        }
        item { Spacer(Modifier.height(PoetryTokens.rem(1f))) }
    }
}

/** 诗行：原型 `.poemrow` 是**平铺行**（不是卡片）—— 上下发丝线 + `row-pad`. */
@Composable
private fun PoemRow(poem: Poem, onPick: (Poem) -> Unit) {
    Column(Modifier.fillMaxWidth()) {
        HairLine()
        Row(
            Modifier
                .fillMaxWidth()
                .clickable { onPick(poem) }
                .padding(rowPadding()),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(poem.title, style = PoetryTextStyles.listTitle, modifier = Modifier.weight(1f))
            Text(poem.author, style = PoetryTextStyles.listAuthor)
        }
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
    Column(
        Modifier
            .fillMaxSize()
            .padding(horizontal = PoetryTokens.rem(PoetryTokens.PAD_REM)),
    ) {
        OutlinedTextField(
            value = query,
            onValueChange = onQueryChange,
            label = { Text("搜索诗名或作者（跨时代）", style = PoetryTextStyles.resultSub) },
            singleLine = true,
            textStyle = PoetryTextStyles.ui.copy(
                fontSize = PoetryTokens.remToDpValue(PoetryTokens.SEARCH_INPUT_REM).sp,
            ),
            shape = RoundedCornerShape(PoetryTokens.RADIUS_PILL_DP.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = PoetryTokens.accent,
                unfocusedBorderColor = PoetryTokens.line,
                focusedTextColor = PoetryTokens.text,
                unfocusedTextColor = PoetryTokens.text,
                focusedLabelColor = PoetryTokens.accentText,
                unfocusedLabelColor = PoetryTokens.textFaint,
                cursorColor = PoetryTokens.accent,
                focusedContainerColor = Color.Transparent,
                unfocusedContainerColor = Color.Transparent,
            ),
            modifier = Modifier.fillMaxWidth().padding(top = PoetryTokens.rem(0.5f)),
        )
        when {
            query.isBlank() -> Text(
                "输入诗名或作者即可跨组搜索。",
                style = PoetryTextStyles.blank,
                modifier = Modifier.padding(vertical = PoetryTokens.rem(PoetryTokens.BLANK_PAD_VERTICAL_REM)),
            )

            results.isEmpty() -> Text(
                "无匹配结果。",
                style = PoetryTextStyles.blank,
                modifier = Modifier.padding(vertical = PoetryTokens.rem(PoetryTokens.BLANK_PAD_VERTICAL_REM)),
            )

            else -> LazyColumn(
                // 结果区是凹陷区（规范 §2 的 surface-sunken）
                Modifier
                    .fillMaxSize()
                    .padding(top = PoetryTokens.rem(PoetryTokens.GROUP_GAP_REM))
                    .background(PoetryTokens.surfaceSunken),
            ) {
                items(results, key = { it.id }) { poem ->
                    Column(Modifier.fillMaxWidth()) {
                        HairLine()
                        Column(
                            Modifier
                                .fillMaxWidth()
                                .clickable { onPick(poem) }
                                .padding(rowPadding()),
                        ) {
                            Row(
                                Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(
                                    PoetryTokens.rem(PoetryTokens.RESULT_ROW_GAP_REM),
                                ),
                            ) {
                                Text(
                                    highlightMatches(poem.title, query),
                                    style = PoetryTextStyles.resultTitle,
                                    modifier = Modifier.weight(1f),
                                )
                                DynastyChip(poem.dynastyLabel)
                            }
                            Spacer(Modifier.height(PoetryTokens.rem(PoetryTokens.RESULT_LINE_GAP_REM)))
                            Text(highlightMatches(poem.author, query), style = PoetryTextStyles.resultSub)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PoemScreen(poem: Poem) {
    var notesExpanded by remember(poem.id) { mutableStateOf(false) }
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = PoetryTokens.rem(PoetryTokens.PAD_REM)),
    ) {
        Spacer(Modifier.height(PoetryTokens.rem(0.6f)))
        // 题头：**不画下划线**（规范 §4.1-3）—— 见 PoemHead.kt
        PoemHead(poem)

        // 正文：一段一块、段内一行一个 Text —— 原文分行与分节（纸本空行）都不丢。
        Column(Modifier.padding(top = PoetryTokens.rem(PoetryTokens.POEM_BODY_TOP_REM))) {
            val gap = poemStanzaGap()
            poem.stanzas.forEachIndexed { index, stanza ->
                if (index > 0) Spacer(Modifier.height(gap))
                Column {
                    stanza.forEach { line -> Text(line, style = PoetryTextStyles.poem) }
                }
            }
        }
        Spacer(Modifier.height(PoetryTokens.rem(PoetryTokens.POEM_BODY_BOTTOM_REM)))

        // 笔记：上间距 2.6rem + 一条发丝线（原型 `.notes { border-top }`）+ 1rem 上内边距
        Spacer(Modifier.height(PoetryTokens.rem(PoetryTokens.NOTES_TOP_REM)))
        HairLine()
        Column(Modifier.padding(top = PoetryTokens.rem(PoetryTokens.NOTES_PAD_TOP_REM))) {
            TextButton(
                onClick = { notesExpanded = !notesExpanded },
                colors = textActionColors(),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp),
            ) {
                Text(if (notesExpanded) "收起笔记" else "笔记", style = PoetryTextStyles.notesToggle)
            }
            if (notesExpanded) {
                val notes = poem.notes
                Box(
                    Modifier
                        .fillMaxWidth()
                        .background(PoetryTokens.surface)
                        .border(
                            width = PoetryTokens.HAIRLINE_DP.dp,
                            color = PoetryTokens.line,
                            shape = RoundedCornerShape(PoetryTokens.RADIUS_SMALL_DP.dp),
                        )
                        .padding(PoetryTokens.rem(0.75f)),
                ) {
                    // 没有笔记时显示真实空状态；**绝不生成占位笔记**。
                    Text(
                        notes ?: "（无笔记）",
                        style = if (notes == null) PoetryTextStyles.faint else PoetryTextStyles.note,
                    )
                }
                if (notes != null && notes.contains("测试夹具笔记")) {
                    Spacer(Modifier.height(PoetryTokens.rem(0.25f)))
                    Text("注：以上是测试夹具笔记，不是用户笔记。", style = PoetryTextStyles.meta)
                }
            }
        }

        Spacer(Modifier.height(PoetryTokens.rem(2f)))
        Text("底本/来源：${poem.source}", style = PoetryTextStyles.meta)
        Spacer(Modifier.height(PoetryTokens.rem(3f)))
    }
}

@Composable
private fun UpdateScreen(state: AppState, onCheckUpdate: () -> Unit) {
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = PoetryTokens.rem(PoetryTokens.PAD_REM)),
    ) {
        Spacer(Modifier.height(PoetryTokens.rem(0.6f)))

        Text("应用版本", style = PoetryTextStyles.notesTitle)
        Text("${state.appVersionName}（versionCode ${state.appVersionCode}）", style = PoetryTextStyles.ui)
        Spacer(Modifier.height(PoetryTokens.rem(0.75f)))

        Text("生效内容版本", style = PoetryTextStyles.notesTitle)
        Text(state.contentVersionLine(), style = PoetryTextStyles.ui)
        Spacer(Modifier.height(PoetryTokens.rem(0.75f)))

        Text("更新源（占位地址，见代码常量）", style = PoetryTextStyles.notesTitle)
        Text(state.manifestUrlForDisplay, style = PoetryTextStyles.meta)
        Spacer(Modifier.height(PoetryTokens.rem(0.75f)))

        Text("状态", style = PoetryTextStyles.notesTitle)
        Text(
            updateStatusText(state.updateStatus),
            style = PoetryTextStyles.ui,
            modifier = Modifier.testTag("update-status"),
        )
        Spacer(Modifier.height(PoetryTokens.rem(1f)))
        TextButton(
            onClick = onCheckUpdate,
            enabled = state.updateStatus !is UpdateStatus.Checking,
            colors = textActionColors(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp),
        ) {
            Text("检查更新")
        }
        Spacer(Modifier.height(PoetryTokens.rem(0.5f)))
        Text(
            // 这句话以前写的是「当前内置内容为占位夹具，非校对文本」—— 2026-10-14 起内置内容已经
            // 就是本次发布的**真实**编译产物（与 dist/content.json 字节一致，19 首/24 条异文），
            // 再那么写会让用户以为读到的是测试数据。所以改成按事实陈述，且不写具体数字（数字会过期）。
            "说明：更新只替换内容数据，不安装新 APK；应用代码升级只提示下载（本版未实现下载 APK）。\n" +
                "内置内容＝本次发布的完整内容（随 APK 打包，首次断网即可读）；每首诗的底本与来源见诗页底部。",
            style = PoetryTextStyles.meta,
        )
        Spacer(Modifier.height(PoetryTokens.rem(2f)))
    }
}
