package dev.sopho.suofei.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
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
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.compose.ui.unit.dp
import dev.sopho.suofei.data.Content
import dev.sopho.suofei.data.Poem

/**
 * 界面结构：**四个页面**（用户 2026-10-15 定）——目录 / 诗 / **诗歌详情** / **关于**（原「更新页」改名）。
 *
 * 每页的信息清单（用户 2026-10-15）落在本文件：
 *  - **目录**（[LibraryScreen]）　应用名（顶栏「索斐」）、组头（组名＋`[n] 首`＋左沿竖线，**保持卡片**）、
 *    诗行（题名＋作者）、**「关于」入口**（顶栏）——**没有**搜索入口、**没有**「有笔记」标记、**没有**折叠（IF-44 本版不做）；
 *  - **诗**（[PoemScreen]）　题名、`时代 · 作者 · 年代 · 体裁`、正文（依底本分行、段间空行）、笔记区（折叠；无笔记如实）、
 *    「详情」入口——**没有**底本与来源（搬去详情页）；
 *  - **诗歌详情**（[PoemDetailScreen]）　底本与来源 ＋ 异文（每条 `variants[].text` ＋ 其 note）；
 *  - **关于**（[AboutScreen]）　应用名/一句话说明/应用版本/内容版本与来源/诚实的限制 ＋ **Android 额外的「更新」块**。
 *
 * 视觉＝「静默终端」（用户 2026-10-14 选定）：**所有颜色/字号/间距都取自 [PoetryTokens]**
 * （唯一来源 `docs/design/visual-tokens.md`），本文件不写任何硬编码色值或字号。
 * 三种结构记号（组名竖线 / `[n] 首` 计数 / 题头无下划线）见 `StructuralMarks.kt` 与 `PoemHead.kt`。
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppRoot(state: AppState, onCheckUpdate: () -> Unit) {
    val content: Content? = state.loaded?.content

    // IF-45：目录的滚动位置**提升到这一层**（跨屏切换时保留）——LibraryScreen 离开组合后，
    // 这个状态仍活在这里 ⇒ 从诗页返回目录时落回原位置。
    // 「深链接直开目录从顶部」在 Android 上没有 URL 概念，对应的是「新开应用」：那时它是 0，
    // 所以天然从顶部开始（不是靠额外判断）。
    val libraryListState = rememberLazyListState()

    Scaffold(
        containerColor = PoetryTokens.bg,
        topBar = {
            TopAppBar(
                title = {
                    when (state.screen) {
                        // 品牌名用规范的字距（0.3em）
                        Screen.LIBRARY -> Text("索斐", style = PoetryTextStyles.brand)
                        Screen.POEM -> Text(state.selectedPoem?.title ?: "诗", style = PoetryTextStyles.ui)
                        Screen.POEM_DETAIL -> Text("诗歌详情", style = PoetryTextStyles.ui)
                        Screen.ABOUT -> Text("关于", style = PoetryTextStyles.ui)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = PoetryTokens.bgSticky,
                    titleContentColor = PoetryTokens.text,
                    actionIconContentColor = PoetryTokens.accentStrong,
                ),
                actions = {
                    when (state.screen) {
                        // 目录页的「关于」入口（用户 2026-10-15：目录要有它）
                        Screen.LIBRARY -> TextButton(onClick = { state.openAbout() }, colors = textActionColors()) {
                            Text("关于")
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
                    listState = libraryListState,
                    onPick = { state.openPoem(it) },
                )

                Screen.POEM -> state.selectedPoem?.let { PoemScreen(it, onDetail = { state.openPoemDetail() }) }

                Screen.POEM_DETAIL -> state.selectedPoem?.let { PoemDetailScreen(it) }

                Screen.ABOUT -> AboutScreen(state, onCheckUpdate)
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
private fun LibraryScreen(
    content: Content,
    pendingVersion: String?,
    listState: LazyListState,
    onPick: (Poem) -> Unit,
) {
    LazyColumn(
        state = listState,
        modifier = Modifier
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
                // ⚠ 本版**不做折叠**（IF-44 的四个细节还没定）：保持静态卡片，不顺手加交互。
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

/** 诗行：原型 `.poemrow` 是**平铺行**（不是卡片）—— 上下发丝线 + `row-pad`.
 *  ⚠ 用户 2026-10-15：目录行**不要「有笔记」标记**（与 Web 同）——所以这里只有题名＋作者。 */
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

/** 诗页：题名 / `时代 · 作者 · 年代 · 体裁` / 正文 / 笔记（折叠；无笔记如实）/ 「详情」入口。
 *  ⚠ 用户 2026-10-15：诗页**不要底本与来源**（它已搬去 [PoemDetailScreen]），
 *  也**不得**出现任何 `variants[].text`（反向断言在 `ScreenInventoryTest`）。 */
@Composable
private fun PoemScreen(poem: Poem, onDetail: () -> Unit) {
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
                contentPadding = PaddingValues(0.dp),
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

        // 「详情」入口（第四页＝诗歌详情，用户 2026-10-15 定）。这里原来放的是底本/来源，已搬走。
        Spacer(Modifier.height(PoetryTokens.rem(2f)))
        TextButton(
            onClick = onDetail,
            colors = textActionColors(),
            contentPadding = PaddingValues(0.dp),
        ) {
            Text("这一首的考据与来源 →", style = PoetryTextStyles.notesToggle)
        }
        Spacer(Modifier.height(PoetryTokens.rem(3f)))
    }
}

/**
 * 诗歌详情页（第四页）：这一首的考据与来源。
 *  ① 底本与来源（原来诗页那一块，搬到这里）
 *  ② 异文：产物里**每一条** `variants[].text` ＋ 它的 note，用有序列表呈现
 *     （⚠ 上游正在重审数据组织方式 IF-48，含 variants 字段形状 ⇒ 这里**只此一处**集中渲染）
 * 行为：「返回」由顶层 [AppRoot] 的「返回」按钮处理，落在**那首诗**（`AppState.back()`）。
 */
@Composable
private fun PoemDetailScreen(poem: Poem) {
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = PoetryTokens.rem(PoetryTokens.PAD_REM)),
    ) {
        Spacer(Modifier.height(PoetryTokens.rem(0.6f)))
        Text(poem.title, style = PoetryTextStyles.poemTitle)
        Spacer(Modifier.height(PoetryTokens.rem(0.35f)))
        Text("这一首的考据与来源", style = PoetryTextStyles.notesTitle)

        // ① 底本与来源
        Spacer(Modifier.height(PoetryTokens.rem(1.2f)))
        Text("底本与来源", style = PoetryTextStyles.notesTitle)
        Spacer(Modifier.height(PoetryTokens.rem(0.3f)))
        Text(poem.source, style = PoetryTextStyles.meta)

        // ② 异文
        Spacer(Modifier.height(PoetryTokens.rem(1.6f)))
        HairLine()
        Column(Modifier.padding(top = PoetryTokens.rem(0.8f))) {
            Text("异文", style = PoetryTextStyles.notesTitle)
            if (poem.variants.isEmpty()) {
                // 没有异文＝真实状态，如实说明（不编内容）。
                Spacer(Modifier.height(PoetryTokens.rem(0.6f)))
                Text("这首诗在产物里没有记录异文。", style = PoetryTextStyles.faint)
            } else {
                poem.variants.forEachIndexed { index, variant ->
                    Spacer(Modifier.height(PoetryTokens.rem(0.9f)))
                    Text("${index + 1}. ${variant.text}", style = PoetryTextStyles.poem)
                    Spacer(Modifier.height(PoetryTokens.rem(0.2f)))
                    Text(variant.note, style = PoetryTextStyles.meta)
                }
            }
        }
        Spacer(Modifier.height(PoetryTokens.rem(3f)))
    }
}

/**
 * 「关于」页（原「更新页」改名，用户 2026-10-15 定）：**两端同一批字段**（`web/about-fields.json`）。
 * 字段值平台相关（这里是 APK 版本 / Android 的限制）；Web 的更新交给 SW，所以只有本端有下面那块「更新」。
 * 「诚实的限制」沿用已有文案原文（见 [ABOUT_LIMITS_ANDROID]），不新写。
 */
@Composable
private fun AboutScreen(state: AppState, onCheckUpdate: () -> Unit) {
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = PoetryTokens.rem(PoetryTokens.PAD_REM)),
    ) {
        Spacer(Modifier.height(PoetryTokens.rem(0.6f)))

        // ── 与 Web 同一批字段 ──────────────────────────────────────────
        Text(AboutFields.LABELS[0], style = PoetryTextStyles.notesTitle)
        Text(AboutFields.APP_NAME, style = PoetryTextStyles.ui)
        Spacer(Modifier.height(PoetryTokens.rem(0.75f)))

        Text(AboutFields.LABELS[1], style = PoetryTextStyles.notesTitle)
        Text(AboutFields.TAGLINE, style = PoetryTextStyles.ui)
        Spacer(Modifier.height(PoetryTokens.rem(0.75f)))

        Text(AboutFields.LABELS[2], style = PoetryTextStyles.notesTitle)
        Text("${state.appVersionName}（versionCode ${state.appVersionCode}）", style = PoetryTextStyles.ui)
        Spacer(Modifier.height(PoetryTokens.rem(0.75f)))

        Text(AboutFields.LABELS[3], style = PoetryTextStyles.notesTitle)
        Text(state.contentVersionLine(), style = PoetryTextStyles.ui)
        Spacer(Modifier.height(PoetryTokens.rem(0.75f)))

        Text(AboutFields.LABELS[4], style = PoetryTextStyles.notesTitle)
        Text(ABOUT_LIMITS_ANDROID, style = PoetryTextStyles.meta)
        Spacer(Modifier.height(PoetryTokens.rem(1.4f)))

        // ── Android 额外一块「更新」（Web 的更新交给 SW，那端没有这一块）──
        HairLine()
        Column(Modifier.padding(top = PoetryTokens.rem(0.8f))) {
            // 这行原来写「更新源（占位地址，见代码常量）」——2026-10-15 更新源已换成**真实站点**
            // （`update/UpdateProtocol.kt` 的 `BASE_URL`），再写「占位」就跟事实不符了。现在只说「更新源」，
            // 真实地址由下一行照常显示出来；这里不写数字/版本，免得随发布过期。
            Text("更新源", style = PoetryTextStyles.notesTitle)
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
                contentPadding = PaddingValues(0.dp),
            ) {
                Text("检查更新")
            }
        }
        Spacer(Modifier.height(PoetryTokens.rem(2f)))
    }
}
