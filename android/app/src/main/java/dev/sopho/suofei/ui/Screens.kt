package dev.sopho.suofei.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.ButtonDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.dp
import dev.sopho.suofei.data.Content
import dev.sopho.suofei.data.Poem

/**
 * 界面结构：**四个页面**（目录 / 诗 / **诗歌详情** / 关于）。每页的排布都按**归档原型的采纳锚**做，
 * 逐项对照结论见交付报告；本文件只负责「把这些值摆到 Compose 上」。
 *
 * 采纳锚与落点（`docs/design/implementation-plan.md` §2.2 的表）：
 * - **宽度口径** `C = min(V, max(320, 0.88×(V−24)))`（`round-2026-10-16-width-pct`）：
 *   每个页面都先算内容列宽 C、再居中（`(V−C)/2` 的列外余白），列内左右各一条**行内沿 16.8px**。
 * - **目录页**（`…-hub-hierarchy`／`…-hub-horizontal`／`…-hub-align`）：**不画卡片**、
 *   记号**悬挂＋竖直居中**（槽 27.52px／固定缝 0.4rem）、诗目题名与组名首字**同一左沿（缩进 0）**、
 *   作者**紧随题名、不右对齐**、「关于」在**顶部**、信息只有「组名＋数量」「题名＋作者」。
 * - **诗页**（`…-poem-expression`＋`…-poem-align`）：题名／身份行／**每一行正文都居中**、
 *   顶部行＝返回左／详情右（**不参与居中**）、正文之后**没有页脚行**；身份行＝作者 · 朝代 · 体裁。
 * - **语义折行**（`…-break-semantic`／`…-break`）：见 [SemanticBreak]。
 * - **笔记②**（`…-poem-note`）：入口在**顶部行**（`[+]笔记`／`[−]笔记`），展开内容在**正文之后、
 *   同一列、无框**；**没有笔记时整块不存在**（连入口都没有）。
 * - **详情页**（`…-detail`）：诗题①**左对齐**／来源①**正文前带标签**／小标题**无竖线**＋
 *   `detail` 整段走最小 Markdown 渲染。
 * - **关于页**（`…-about-min`／`…-about-update`）：**V3 标签左对齐**、**无区域框**、
 *   **初态只有按钮、不生成状态文本元素**、仓库链接置底（C1 完整 URL）。
 *
 * 视觉＝「静默终端」：颜色/字号/间距一律取自 [PoetryTokens]，本文件不写硬编码色值或字号。
 */
@Composable
fun AppRoot(state: AppState, onCheckUpdate: () -> Unit) {
    val content: Content? = state.loaded?.content

    // 跨屏保留：目录的滚动位置（IF-45）与**各组的展开状态**（从诗页返回目录时不该被重置）。
    // 「首态全部收起」＝这两个容器一开始就是空的/false（不是靠额外判断）。
    val libraryListState = rememberLazyListState()
    val expandedGroups = remember { mutableStateMapOf<String, Boolean>() }

    Scaffold(containerColor = PoetryTokens.bg) { padding ->
        Box(
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
                return@Box
            }
            if (content == null) {
                Text(
                    "载入中…",
                    style = PoetryTextStyles.blank,
                    modifier = Modifier.padding(horizontal = PoetryTokens.rem(PoetryTokens.PAD_REM))
                        .padding(vertical = PoetryTokens.rem(PoetryTokens.BLANK_PAD_VERTICAL_REM)),
                )
                return@Box
            }
            when (state.screen) {
                Screen.LIBRARY -> LibraryScreen(
                    content = content,
                    pendingVersion = state.pendingVersion,
                    listState = libraryListState,
                    expandedGroups = expandedGroups,
                    onPick = { state.openPoem(it) },
                    onAbout = { state.openAbout() },
                )

                Screen.POEM -> state.selectedPoem?.let {
                    PoemScreen(
                        poem = it,
                        onBack = { state.back() },
                        onDetail = { state.openPoemDetail() },
                    )
                }

                Screen.POEM_DETAIL -> state.selectedPoem?.let {
                    PoemDetailScreen(poem = it, onBack = { state.back() })
                }

                Screen.ABOUT -> AboutScreen(state = state, onBack = { state.back() }, onCheckUpdate = onCheckUpdate)
            }
        }
    }
}

/** 行内沿 `1.05rem`＝16.8px（列内一层，与列外余白 `(V−C)/2` 不是同一件事）. */
private val edgeX: Dp get() = PoetryTokens.rem(PoetryTokens.EDGE_X_REM)

/** 一次算好的版面数值：内容列宽 C、正文可用宽、每行最多几个字位（语义折行用）. */
private data class PageLayout(val columnWidth: Dp, val contentWidthUnits: Float, val maxChars: Int)

/**
 * 所有页面共用的骨架：算出内容列宽 C、把列**居中**（列外余白＝`(V−C)/2`），列内由各页排布。
 * 单测门 `ScreenInventoryTest` 钉住「四个页面都用这条口径」。
 */
@Composable
private fun ContentColumn(
    modifier: Modifier = Modifier,
    content: @Composable (PageLayout) -> Unit,
) {
    val density = LocalDensity.current
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val viewport = maxWidth.value
        val column = PoetryTokens.contentColumnWidth(viewport)
        val bodyWidth = PoetryTokens.bodyAvailableWidth(column)
        val advance = with(density) { PoetryTokens.POEM_SIZE.sp.toPx() } *
            (1f + PoetryTokens.POEM_LETTER_SPACING)
        val layout = PageLayout(
            columnWidth = column.dp,
            contentWidthUnits = column,
            maxChars = SemanticBreak.maxCharsPerLine(with(density) { bodyWidth.dp.toPx() }, advance),
        )
        Box(Modifier.fillMaxSize()) {
            Box(
                modifier
                    .width(layout.columnWidth)
                    .fillMaxHeight()
                    .align(Alignment.TopCenter),
            ) {
                content(layout)
            }
        }
    }
}

/**
 * 顶部行（诗页／详情页／关于页共用）：左一件、右一件或多件，**不参与整页居中**。
 * 控件样式＝`--ctl-size` 0.82rem／0.06em／`--text-dim`、**无边框无底色**。
 */
@Composable
private fun TopRow(left: String, onLeft: () -> Unit, right: @Composable () -> Unit = {}) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = edgeX)
            .padding(top = PoetryTokens.rem(PoetryTokens.CTL_TOP_PAD_REM)),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(left, style = PoetryTextStyles.ctl, modifier = Modifier.clickable { onLeft() })
        Row(
            horizontalArrangement = Arrangement.spacedBy(PoetryTokens.rem(PoetryTokens.CTL_GAP_REM)),
            verticalAlignment = Alignment.CenterVertically,
        ) { right() }
    }
}

/** 顶部行里的一个控件（可点、无框、无底色）. */
@Composable
private fun CtlText(text: String, onClick: () -> Unit) {
    Text(text, style = PoetryTextStyles.ctl, modifier = Modifier.clickable { onClick() })
}

// ── 目录页 ────────────────────────────────────────────────────────────────

/**
 * 目录页（采纳锚 `round-2026-10-15-hub-align` 的 ④ 档「悬挂＋竖直居中」＋层级轮的三条行为）。
 *
 * 信息只有：**「关于」入口（顶部）**、**组名＋数量**、**题名＋作者**。
 * 🚫 不出现：应用名（用户 `q-52a14e2c`：不在目录重复显示）、搜索、笔记标记、题名预览、
 * 状态位／版本号（原页脚已按采纳锚移除——诗页「正文之后没有页脚行」同理）。
 * 行为：**首次全部收起（含只有一个组）**、**整块组头可点**、**各组独立展开**、
 * 题名与组名首字**同一左沿（缩进 0）**、作者**紧随题名**。
 */
@Composable
private fun LibraryScreen(
    content: Content,
    pendingVersion: String?,
    listState: LazyListState,
    expandedGroups: MutableMap<String, Boolean>,
    onPick: (Poem) -> Unit,
    onAbout: () -> Unit,
) {
    ContentColumn { _ ->
        LazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
            item(key = "about-entry") { AboutEntryRow(onAbout) }
            if (pendingVersion != null) {
                item(key = "pending-banner") { PendingBanner(pendingVersion) }
            }
            content.groups.forEach { group ->
                val expanded = expandedGroups[group.name] == true
                item(key = "dynasty-${group.name}") {
                    GroupHeaderRow(
                        name = group.name,
                        count = group.poems.size,
                        expanded = expanded,
                        onToggle = { expandedGroups[group.name] = !expanded },
                    )
                }
                if (expanded) {
                    items(group.poems, key = { it.id }) { poem -> PoemRow(poem, onPick) }
                }
            }
            item(key = "tail") { Spacer(Modifier.height(PoetryTokens.rem(PoetryTokens.COL_BOTTOM_REM))) }
        }
    }
}

/** 「关于」入口：在顶部、右沿＝列右沿 − 行内沿（实测距列右沿 16.8px）。 */
@Composable
private fun AboutEntryRow(onAbout: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = edgeX)
            .padding(top = PoetryTokens.rem(PoetryTokens.CTL_TOP_PAD_REM)),
        horizontalArrangement = Arrangement.End,
    ) {
        Text("关于", style = PoetryTextStyles.ctl, modifier = Modifier.clickable { onAbout() })
    }
}

/** 「新内容已下载并校验通过，返回本目录后生效」——阅读中不替换的可见事实（如实呈现，不伪造进度）。 */
@Composable
private fun PendingBanner(version: String) {
    Box(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = edgeX)
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
            "新内容 $version 已下载并校验通过，返回本目录后生效（阅读中不替换）。",
            style = PoetryTextStyles.resultSub,
            color = PoetryTokens.warnText,
        )
    }
}

/**
 * 组头：`[悬挂记号槽] 组名 ………… [n] 首`，**不画卡片**（组头与页底同色），其下一条发丝线。
 * **整块可点**（组名、数量、空白同属一个操作，`q-d28c4e4e`）；记号只表达状态。
 */
@Composable
private fun GroupHeaderRow(name: String, count: Int, expanded: Boolean, onToggle: () -> Unit) {
    Column(Modifier.fillMaxWidth()) {
        Row(
            Modifier
                .fillMaxWidth()
                .toggleable(value = expanded, role = Role.Button, onValueChange = { onToggle() })
                .padding(end = edgeX)
                .padding(top = PoetryTokens.rem(0.85f), bottom = PoetryTokens.rem(0.7f)),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            HangingMarker(expanded)
            Text(name, style = PoetryTextStyles.groupName, modifier = Modifier.weight(1f))
            Text(groupCountAnnotated(count), style = PoetryTextStyles.monoDim)
        }
        HairLine()
    }
}

/**
 * 诗行：**平铺行**（不是卡片）。题名左沿＝组名左沿（缩进 0＝悬挂槽宽），作者**紧随题名**、不右对齐
 * （原型 `.pauthor { margin-left: 0.45em }`，实测 5.75px）。
 */
@Composable
private fun PoemRow(poem: Poem, onPick: (Poem) -> Unit) {
    Column(Modifier.fillMaxWidth()) {
        Row(
            Modifier
                .fillMaxWidth()
                .clickable { onPick(poem) }
                .padding(start = PoetryTokens.rem(PoetryTokens.MARKER_SLOT_REM), end = edgeX)
                .padding(vertical = PoetryTokens.rem(PoetryTokens.ROW_PAD_VERTICAL_REM)),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(poem.title, style = PoetryTextStyles.listTitle)
            Spacer(Modifier.width(authorGap()))
            Text(poem.author, style = PoetryTextStyles.listAuthor)
            Spacer(Modifier.weight(1f))
        }
        HairLine()
    }
}

/** 作者与题名之间的缝：题名末端 → 作者左沿 ≈0.45em（相对作者字号，原型 `.pauthor` 的 margin-left）. */
@Composable
private fun authorGap(): Dp = with(LocalDensity.current) {
    (PoetryTokens.remToDpValue(PoetryTokens.LIST_AUTHOR_REM) * PoetryTokens.AUTHOR_GAP_EM).dp
}

// ── 诗页 ──────────────────────────────────────────────────────────────────

/**
 * 诗页（采纳锚：P1 基线 ＋ P2 选项A ＋ **全部居中** ＋ 笔记②）。
 * - 顶部行＝**返回（左）**／**笔记 · 详情（右）**，不参与居中；
 * - 题名、身份行、**正文的每一个视觉行**都居中（不是容器居中）；
 * - 正文按 [SemanticBreak] 语义折行（`stanzas` 与正文**一字不改**，折行只是视觉）;
 * - 笔记：**没有笔记 ⇒ 连入口都不出现**；有笔记 ⇒ 顶部行入口 `[+]笔记`／`[−]笔记`，
 *   展开内容在**正文之后、同一列、无框**；
 * - **正文之后没有页脚行**（底本/来源/异文/版本号都不在这里）。
 */
@Composable
private fun PoemScreen(poem: Poem, onBack: () -> Unit, onDetail: () -> Unit) {
    var notesExpanded by remember(poem.id) { mutableStateOf(false) }

    ContentColumn { layout ->
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState()),
        ) {
            TopRow(left = LABEL_BACK, onLeft = onBack) {
                if (poem.notes != null) {
                    CtlText(noteEntryLabel(notesExpanded)) { notesExpanded = !notesExpanded }
                }
                CtlText(LABEL_DETAIL, onDetail)
            }

            // 题头：**不画下划线**（规范 §4.1-3）—— 见 PoemHead.kt
            Column(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = edgeX)
                    .padding(top = PoetryTokens.rem(PoetryTokens.HEAD_PAD_TOP_REM)),
            ) {
                PoemHead(poem)
            }

            // 正文：段内每一行按语义折行；**每个视觉行都各自居中**。
            Column(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = edgeX)
                    .padding(top = PoetryTokens.rem(PoetryTokens.POEM_BODY_TOP_REM)),
            ) {
                val gap = poemStanzaGap()
                poem.stanzas.forEachIndexed { index, stanza ->
                    if (index > 0) Spacer(Modifier.height(gap))
                    SemanticBreak.breakStanza(stanza, layout.maxChars).forEach { sourceLine ->
                        sourceLine.forEach { visualLine ->
                            Text(
                                visualLine,
                                style = PoetryTextStyles.poem,
                                textAlign = TextAlign.Center,
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                    }
                }
            }
            Spacer(Modifier.height(PoetryTokens.rem(PoetryTokens.POEM_BODY_BOTTOM_REM)))

            // 笔记②：入口在顶部行；展开出来的正文在**正文之后**、同一列、**没有任何框**。
            val notes = poem.notes
            if (notes != null && notesExpanded) {
                Column(
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = edgeX)
                        .padding(top = PoetryTokens.rem(PoetryTokens.NOTES_TOP_REM)),
                ) {
                    MarkdownBody(
                        markdown = notes,
                        bodyStyle = PoetryTextStyles.note,
                        paragraphGap = noteParagraphGap(),
                        itemGap = PoetryTokens.rem(PoetryTokens.LI_GAP_REM),
                    )
                }
            }
            Spacer(Modifier.height(PoetryTokens.rem(2f)))
        }
    }
}

/** 笔记正文里相邻两段之间 `--note-gap-p` 0.7em（相对笔记字号）. */
@Composable
private fun noteParagraphGap(): Dp = with(LocalDensity.current) {
    (PoetryTokens.NOTE_SIZE * PoetryTokens.NOTE_PARA_GAP_EM).sp.toDp()
}

// ── 诗歌详情页 ────────────────────────────────────────────────────────────

/**
 * 诗歌详情页（采纳锚 `round-2026-10-16-detail` 的 D0 三项）：
 * 内容只用四样 —— **诗题**（① 左对齐）、**返回**（落到这首诗）、**底本与来源**（① 正文前带标签）、
 * **`detail` 正文**（**最小 Markdown 渲染**，小标题 eye brow **无竖线**）。
 * **不重复身份信息**（作者/朝代/体裁不出现，也没有「这一首的考据与来源」这类固定副题）。
 */
@Composable
private fun PoemDetailScreen(poem: Poem, onBack: () -> Unit) {
    ContentColumn { _ ->
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState()),
        ) {
            TopRow(left = LABEL_BACK, onLeft = onBack)

            Column(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = edgeX)
                    .padding(top = PoetryTokens.rem(PoetryTokens.HEAD_PAD_TOP_REM)),
            ) {
                Text(poem.title, style = PoetryTextStyles.poemTitle, textAlign = TextAlign.Start)

                poem.source?.let { source ->
                    Column(Modifier.padding(top = PoetryTokens.rem(PoetryTokens.SRC_GAP_TOP_REM))) {
                        Text(LABEL_SOURCE_BLOCK, style = PoetryTextStyles.provLabel)
                        Spacer(Modifier.height(PoetryTokens.rem(PoetryTokens.SRC_LABEL_GAP_REM)))
                        Text(source, style = PoetryTextStyles.provText)
                    }
                }

                Column(Modifier.padding(top = PoetryTokens.rem(PoetryTokens.SEC_GAP_TOP_REM))) {
                    val detail = poem.detail
                    if (detail == null) {
                        // 空节＝真实状态，如实说明（不编内容、也不留空白让人以为没加载出来）。
                        Text(DETAIL_EMPTY_HINT, style = PoetryTextStyles.faint)
                    } else {
                        MarkdownBody(
                            markdown = detail,
                            bodyStyle = PoetryTextStyles.poem,
                            paragraphGap = PoetryTokens.rem(PoetryTokens.PARA_GAP_REM),
                            itemGap = PoetryTokens.rem(PoetryTokens.LI_GAP_REM),
                        )
                    }
                }
            }
            Spacer(Modifier.height(PoetryTokens.rem(3f)))
        }
    }
}

// ── 关于页 ────────────────────────────────────────────────────────────────

/**
 * 「关于」页（采纳锚 `round-2026-10-16-about-min` 的 **V3** ＋ `…-about-update` 的两条）：
 * - 整页次序＝**A3**：应用名作页标题 → 版本相邻组 →（Android）更新块 → 仓库链接置底；
 * - **V3 标签左对齐**：版本标签文字左沿＝内容左沿＝按钮外沿＝状态文本左沿（四条线合一）；
 *   版本数值仍在右侧同一个**值列**（`edge + 5.2em + 0.5rem`）；
 * - **无框**：按钮与状态文本是内容流里的元素，没有容器边框/底色/阴影/标题/分隔线；
 * - **初态（尚未检查）只显示按钮**：不生成状态文本元素，也不用空字符串占位；
 * - 仓库链接＝**C1 完整 URL**，置底，**不给**「会打开浏览器」的提示。
 */
@Composable
private fun AboutScreen(state: AppState, onBack: () -> Unit, onCheckUpdate: () -> Unit) {
    ContentColumn { _ ->
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState()),
        ) {
            TopRow(left = LABEL_BACK, onLeft = onBack)

            Column(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = edgeX)
                    .padding(top = PoetryTokens.rem(PoetryTokens.COL_TOP_REM)),
            ) {
                // ① 应用名当页标题（1.5rem ＋ 品牌字距）
                Text(AboutFields.APP_NAME, style = PoetryTextStyles.brand, textAlign = TextAlign.Start)
                Spacer(Modifier.height(PoetryTokens.rem(PoetryTokens.SEC_GAP_REM)))
                // ② 一句话说明
                Text(AboutFields.TAGLINE, style = PoetryTextStyles.aboutValue)
                Spacer(Modifier.height(PoetryTokens.rem(PoetryTokens.SEC_GAP_REM)))

                // ③ 版本相邻组（**不含「来源」行**）：标签列 + 值列
                KeyValueRow(
                    label = AboutFields.LABELS[2],
                    value = state.appVersionName,
                    mono = true,
                )
                Spacer(Modifier.height(PoetryTokens.rem(PoetryTokens.ROW_GAP_REM)))
                KeyValueRow(
                    label = AboutFields.LABELS[3],
                    value = state.contentVersionText(),
                    mono = true,
                )

                // ④ Android 额外一块「内容更新」：**上方按钮 ＋ 下方状态文本**，**无框**。
                Spacer(Modifier.height(PoetryTokens.rem(PoetryTokens.SEC_GAP_REM)))
                UpdateButton(
                    enabled = state.updateStatus !is UpdateStatus.Checking,
                    onClick = onCheckUpdate,
                )
                // 初态（尚未检查）**不生成状态文本元素** —— 不是清空、也不占位（用户已认可）。
                if (state.updateStatus !is UpdateStatus.Idle) {
                    Spacer(Modifier.height(PoetryTokens.rem(PoetryTokens.ROW_GAP_REM)))
                    Text(
                        updateStatusText(state.updateStatus),
                        style = PoetryTextStyles.aboutLabel,
                        modifier = Modifier.testTag("update-status"),
                    )
                }

                // ⑤ 诚实的限制（沿用现有文案原文）
                Spacer(Modifier.height(PoetryTokens.rem(PoetryTokens.SEC_GAP_REM)))
                Text(AboutFields.LABELS[4], style = PoetryTextStyles.aboutLabel)
                Spacer(Modifier.height(PoetryTokens.rem(PoetryTokens.ROW_GAP_REM)))
                Text(ABOUT_LIMITS_ANDROID, style = PoetryTextStyles.meta)

                // ⑥ 仓库链接置底（C1 完整 URL）
                Spacer(Modifier.height(PoetryTokens.rem(PoetryTokens.SEC_GAP_REM)))
                Text(
                    AboutFields.REPO_URL,
                    style = PoetryTextStyles.aboutMono,
                    modifier = Modifier.testTag("about-repo"),
                )
            }
            Spacer(Modifier.height(PoetryTokens.rem(PoetryTokens.COL_BOTTOM_REM)))
        }
    }
}

/**
 * 版本组的一行：**标签列（固定宽 `--kcol` 5.2em＝68.22px）＋ 值列**。V3 ⇒ 标签**左对齐**
 * （文字左沿＝内容左沿），值在固定的值列上（`edge + kcol + 0.5rem` ＝ 93.02px）。
 * 标签与值都是**一行一条**（不改成两行）。
 */
@Composable
private fun KeyValueRow(label: String, value: String, mono: Boolean) {
    Row(Modifier.fillMaxWidth()) {
        Text(
            label,
            style = PoetryTextStyles.aboutLabel,
            modifier = Modifier.width(PoetryTokens.labelColumnDp().dp),
        )
        Spacer(Modifier.width(PoetryTokens.rem(PoetryTokens.K_GAP_REM)))
        Text(value, style = if (mono) PoetryTextStyles.aboutMono else PoetryTextStyles.aboutValue)
    }
}

/** 唯一的动作：**检查更新**（检查中禁用）。按钮自身保留边框/底色/圆角（那不是「区域外框」）. */
@Composable
private fun UpdateButton(enabled: Boolean, onClick: () -> Unit) {
    TextButton(
        onClick = onClick,
        enabled = enabled,
        shape = RoundedCornerShape(PoetryTokens.RADIUS_SMALL_DP.dp),
        colors = ButtonDefaults.textButtonColors(
            contentColor = PoetryTokens.accentText,
            containerColor = PoetryTokens.accentSoft,
            disabledContentColor = PoetryTokens.textFaint,
            disabledContainerColor = PoetryTokens.bg,
        ),
        contentPadding = PaddingValues(
            horizontal = PoetryTokens.rem(PoetryTokens.CTL_PAD_X_REM),
            vertical = PoetryTokens.rem(PoetryTokens.CTL_PAD_Y_REM),
        ),
        modifier = Modifier
            .border(
                width = PoetryTokens.HAIRLINE_DP.dp,
                color = if (enabled) PoetryTokens.accentLine else PoetryTokens.line,
                shape = RoundedCornerShape(PoetryTokens.RADIUS_SMALL_DP.dp),
            )
            .testTag("check-update"),
    ) {
        Text("检查更新", style = PoetryTextStyles.ctl)
    }
}
