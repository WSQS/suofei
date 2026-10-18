package dev.sopho.suofei.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
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
import androidx.compose.foundation.lazy.LazyListScope
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalUriHandler
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
 *   **初态只有按钮、不生成状态文本元素**、仓库链接置底（C1 完整 URL，**可点**：外部应用打开）。
 *
 * 视觉＝「静默终端」：颜色/字号/间距一律取自 [PoetryTokens]，本文件不写硬编码色值或字号。
 */
@Composable
fun AppRoot(state: AppState, onCheckUpdate: () -> Unit) {
    // 系统返回（三键返回键与手势导航都走这里）：**复用同一份导航状态与转移** —— 直接调 `AppState.back()`，
    // 不另写一套规则（详情→那首诗、诗/关于→目录就由它一份实现决定）。
    // **目录根不拦**：`enabled = screen != LIBRARY` ⇒ 在目录页不注册回调，系统照旧按默认行为离开 app
    // （不加二次确认、不加双按退出、不吃掉事件）。
    BackHandler(enabled = state.screen != Screen.LIBRARY) { state.back() }

    val content: Content? = state.loaded?.content

    // 跨屏保留：目录的滚动位置（IF-45）与**各组的展开状态**（从诗页返回目录时不该被重置）。
    // 「首态全部收起」＝这两个容器一开始就是空的/false（不是靠额外判断）。
    // 2026-10-18：目录页有两个视图（朝代／标签）⇒ **各一套**滚动与展开状态。
    // 切走再切回仍在；从诗页返回也仍停在进入它的那个视图上（`state.libraryTab` 一直没变）。
    val dynastyListState = rememberLazyListState()
    val tagListState = rememberLazyListState()
    val dynastyExpanded = remember { mutableStateMapOf<String, Boolean>() }
    val tagExpanded = remember { mutableStateMapOf<String, Boolean>() }

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
                    tab = state.libraryTab,
                    onSelectTab = { state.selectLibraryTab(it) },
                    dynastyListState = dynastyListState,
                    dynastyExpanded = dynastyExpanded,
                    tagListState = tagListState,
                    tagExpanded = tagExpanded,
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
 * **2026-10-18 起顶部是「朝代 ｜ 标签」两个 tab ＋「关于」**（采纳锚 `q-tag-views.html`）：
 * 标签视图与朝代视图**同构**（同一段 `groupItems` 渲染：悬挂记号、整行可点、初态全收起、各组独立）。
 * 信息只有：**两个 tab（顶部）＋「关于」入口**、**组名（＋朝代页的数量）**、**题名＋作者**。
 * 标签视图 **不显示任何数量**（组头无计数、行前无序号——序号 `orderInTag` 只在数据里，不渲染），
 * **零成员的标签整组不出现**（连空态文字都没有）。
 * 🚫 不出现：应用名（用户 `q-52a14e2c`：不在目录重复显示）、搜索、笔记标记、题名预览、
 * 状态位／版本号（原页脚已按采纳锚移除——诗页「正文之后没有页脚行」同理）。
 * 行为：**首次全部收起（含只有一个组）**、**整块组头可点**、**各组独立展开**、
 * 题名与组名首字**同一左沿（缩进 0）**、作者**紧随题名**。
 */
@Composable
private fun LibraryScreen(
    content: Content,
    pendingVersion: String?,
    tab: LibraryTab,
    onSelectTab: (LibraryTab) -> Unit,
    dynastyListState: LazyListState,
    dynastyExpanded: MutableMap<String, Boolean>,
    tagListState: LazyListState,
    tagExpanded: MutableMap<String, Boolean>,
    onPick: (Poem) -> Unit,
    onAbout: () -> Unit,
) {
    ContentColumn { _ ->
        // 两个视图**各自一份**滚动状态：切走再切回，位置还在（用户 2026-10-18 的验收项）。
        val listState = if (tab == LibraryTab.DYNASTY) dynastyListState else tagListState
        val expandedMap = if (tab == LibraryTab.DYNASTY) dynastyExpanded else tagExpanded
        LazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
            item(key = "top-tabs") {
                LibraryTopRow(tab = tab, onSelectTab = onSelectTab, onAbout = onAbout)
            }
            if (pendingVersion != null) {
                item(key = "pending-banner") { PendingBanner(pendingVersion) }
            }
            // 两个视图**同一段渲染**（组头＋子诗目）：只有「是否有数量」与数据源不同。
            when (tab) {
                LibraryTab.DYNASTY -> groupItems(
                    scopeKey = "dynasty",
                    groups = content.groups.map { it.name to it.poems },
                    // 朝代页计数照旧（用户 2026-10-18：只去标签页的统计）
                    showCount = true,
                    expanded = expandedMap,
                    onPick = onPick,
                )

                LibraryTab.TAG -> groupItems(
                    scopeKey = "tag",
                    // 零成员的标签**不渲染**：`tagGroups` 已按成员数 ≥ 1 过滤（`Content.tagGroups`）
                    groups = content.tagGroups.map { it.name to it.poems },
                    // 标签页**不显示任何数量**（组头没有计数、行前没有序号）
                    showCount = false,
                    expanded = expandedMap,
                    onPick = onPick,
                )
            }
            item(key = "tail") { Spacer(Modifier.height(PoetryTokens.rem(PoetryTokens.COL_BOTTOM_REM))) }
        }
    }
}

/**
 * 目录页的分组列表（**朝代与标签两个视图共用同一段渲染**）：组头（悬挂记号＋组名＋可选计数）
 * ＋展开后的子诗目。`scopeKey` 只用于 LazyColumn 的 item key（同一首诗可属于多个标签，
 * 直接用诗 id 会撞 key），不影响渲染内容。
 */
private fun LazyListScope.groupItems(
    scopeKey: String,
    groups: List<Pair<String, List<Poem>>>,
    showCount: Boolean,
    expanded: MutableMap<String, Boolean>,
    onPick: (Poem) -> Unit,
) {
    groups.forEach { (name, poems) ->
        val groupKey = "$scopeKey-$name"
        val isExpanded = expanded[name] == true
        item(key = groupKey) {
            GroupHeaderRow(
                name = name,
                count = if (showCount) poems.size else null,
                expanded = isExpanded,
                onToggle = { expanded[name] = !isExpanded },
            )
        }
        if (isExpanded) {
            items(poems, key = { "$groupKey/${it.id}" }) { poem -> PoemRow(poem, onPick) }
        }
    }
}

/**
 * 目录页顶部：**「朝代 ｜ 标签」两个 tab（左）＋「关于」（右）**，下方一条发丝线
 * （形状照采纳锚 `q-tag-views.html` 的 `.topline`）。
 *
 * 两个 tab 是**同一份目录的两个视图**，不是两个页面：切 tab 不改 `Screen`。
 * 「关于」仍然只是入口，不导航到别的 tab。
 */
@Composable
private fun LibraryTopRow(tab: LibraryTab, onSelectTab: (LibraryTab) -> Unit, onAbout: () -> Unit) {
    Column(Modifier.fillMaxWidth()) {
        Row(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = edgeX)
                .padding(vertical = PoetryTokens.rem(PoetryTokens.CTL_TOP_PAD_REM)),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Top,
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(PoetryTokens.rem(PoetryTokens.TAB_GAP_REM)),
                verticalAlignment = Alignment.Top,
            ) {
                TabLabel(LABEL_TAB_DYNASTY, selected = tab == LibraryTab.DYNASTY) {
                    onSelectTab(LibraryTab.DYNASTY)
                }
                TabLabel(LABEL_TAB_TAG, selected = tab == LibraryTab.TAG) {
                    onSelectTab(LibraryTab.TAG)
                }
            }
            // 「关于」与两个 tab **同一行、同一个字号**（0.86rem＝原型 `--about-size`；Web 已按此对齐）：
            // 不要单独给它 `--ctl-size`（0.82rem），否则同一行两种字号。
            Text("关于", style = PoetryTextStyles.tab, modifier = Modifier.clickable { onAbout() })
        }
        HairLine()
    }
}

/**
 * 一个顶部 tab：文字＋选中时下方一条 1px `accent-line` 下划线（原型 `.tab[aria-selected]`）。
 * 未选中不画线（透明占位，宽度不变 ⇒ 点击/选中切换不会让排版跳动）。
 * 宽度靠内容的固有宽度（`IntrinsicSize.Max`），下划线因此恰好与文字等宽。
 */
@Composable
private fun TabLabel(text: String, selected: Boolean, onClick: () -> Unit) {
    Column(
        Modifier
            .width(IntrinsicSize.Max)
            .clickable { onClick() },
    ) {
        Text(
            text,
            style = PoetryTextStyles.tab,
            color = if (selected) PoetryTokens.text else PoetryTokens.textDim,
        )
        Spacer(Modifier.height(PoetryTokens.rem(PoetryTokens.TAB_UNDERLINE_GAP_REM)))
        Box(
            Modifier
                .fillMaxWidth()
                .height(PoetryTokens.TAB_UNDERLINE_DP.dp)
                .background(if (selected) PoetryTokens.accentLine else Color.Transparent),
        )
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
 *
 * `count == null` ＝ **不显示计数**（用户 2026-10-18：标签页不显示任何数量；朝代页计数照旧）。
 */
@Composable
private fun GroupHeaderRow(name: String, count: Int?, expanded: Boolean, onToggle: () -> Unit) {
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
            if (count != null) {
                Text(groupCountAnnotated(count), style = PoetryTextStyles.monoDim)
            }
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
 * - 仓库链接＝**C1 完整 URL**，置底，**可点**（点了用外部应用打开同一条 URL，`LocalUriHandler` ⇒ `ACTION_VIEW`），
 *   **不给**「会打开浏览器」的提示（用户没选 C3 那句）。
 *
 * ⚠ 2026-10-16：共享字段集已同步为 **4 项**（应用名／应用版本／内容版本／仓库链接，见 `AboutFields`）；
 * **不再渲染**「一句话说明」与「诚实的限制」两行（后者在本端**没有任何别处保留**，见 `AboutFields` 注释）。
 */
@Composable
private fun AboutScreen(state: AppState, onBack: () -> Unit, onCheckUpdate: () -> Unit) {
    // 返修①：仓库链接是可点的**链接**，点了交给**外部**应用（浏览器）打开。
    // `LocalUriHandler` 就是平台那条 `Intent.ACTION_VIEW` 通道（Compose 的标准入口），
    // 不自己拼 Intent、也不内嵌 WebView（用户要的是「外部浏览器」）。
    val uriHandler = LocalUriHandler.current
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
                // ① 应用名当页标题（1.5rem ＋ 品牌字距）。共享字段集的第 1 项就在这里，只是**不另画标签行**。
                Text(AboutFields.APP_NAME, style = PoetryTextStyles.brand, textAlign = TextAlign.Start)
                Spacer(Modifier.height(PoetryTokens.rem(PoetryTokens.SEC_GAP_REM)))

                // ② 版本相邻组（**不含「来源」行**；2026-10-16 起也**不再有**「一句话说明」副标题）：标签列 + 值列。
                // LABELS[1]＝应用版本、LABELS[2]＝内容版本（字段集删掉两项后下标整体上移，不是手写标签）。
                KeyValueRow(
                    label = AboutFields.LABELS[1],
                    value = state.appVersionName,
                )
                Spacer(Modifier.height(PoetryTokens.rem(PoetryTokens.ROW_GAP_REM)))
                KeyValueRow(
                    label = AboutFields.LABELS[2],
                    value = state.contentVersionText(),
                )

                // ③ Android 额外一块「内容更新」：**上方按钮 ＋ 下方状态文本**，**无框**。
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

                // ④ 仓库链接置底（C1 完整 URL）。共享字段集的第 4 项；在本端就是这段 URL 文本，
                //    同样**不另画标签行**（采纳锚 A3/V3：应用名与仓库链接都在内容左沿、都不是标签行）。
                //    ⚠ 2026-10-16 返修①：C1＝**可点的链接**（Web 那份 C1 就是 `<a href>`，两端同锚），
                //    所以这段文字**可点**——点了用外部应用打开同一条 URL（`LocalUriHandler` ⇒ `ACTION_VIEW`）。
                Spacer(Modifier.height(PoetryTokens.rem(PoetryTokens.SEC_GAP_REM)))
                Text(
                    AboutFields.REPO_URL,
                    style = PoetryTextStyles.aboutMono,
                    modifier = Modifier
                        .testTag("about-repo")
                        .clickable { uriHandler.openUri(AboutFields.REPO_URL) },
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
private fun KeyValueRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth()) {
        Text(
            label,
            style = PoetryTextStyles.aboutLabel,
            modifier = Modifier.width(PoetryTokens.labelColumnDp().dp),
        )
        Spacer(Modifier.width(PoetryTokens.rem(PoetryTokens.K_GAP_REM)))
        // 采纳锚 `about-min`：值列里**只有版本号本身**用等宽（`.ver`），说明文字用常规字（`.v`）。
        // ⇒ 样式由**值本身**决定，不是调用方写死 `mono = true`：未载入兜底「尚未载入」是说明文字 ⇒ 常规字。
        Text(
            value,
            style = if (looksLikeVersionNumber(value)) PoetryTextStyles.aboutMono else PoetryTextStyles.aboutValue,
        )
    }
}

/**
 * 唯一的动作：**检查更新**（检查中禁用）。按钮自身保留边框/底色/圆角（那不是「区域外框」）。
 *
 * ⚠ 2026-10-16（用户在看页面上报「背景矩形与外框之间上下各有一条暗缝」）：
 * 原来边框画在 `TextButton` 的 **外层 `Modifier` 链**上，而底色由按钮**自己的 Surface** 画
 * ⇒ 两个矩形不是同一个 box。material3 的 Surface 链是
 * `modifier.minimumInteractiveComponentSize().surface(shape, color, border, …).clickable(…)`
 * （已在本机缓存里的 `material3-android-1.3.2` 的 `SurfaceKt$Surface$2` 字节码里核过），
 * 而 `surface(...)` 里是 `border(border, shape) → background(color, shape) → clip(shape)`
 * ——**边框与底色由同一个 draw 节点、按同一个 bounds 画**。
 * 所以（a）外层 `Modifier.border` 跟着 `minimumInteractiveComponentSize()` 一起被撑到最小交互高度
 * **48dp**（`check-update` 节点实测 126px＝48dp），（b）按钮自己的 Surface 只有内容高度
 * 40dp（material3 `ButtonDefaults.MinHeight = 40.dp`，内容行 `defaultMinSize(MinWidth, MinHeight)`，
 * 本机实测 105px＝40dp）⇒ 上下各露出约 10.5px（4dp）的页面底色，就是那两条暗缝。
 * 修法：把边框交给按钮自己的 `border = BorderStroke(...)`（与 `containerColor` 同一个 Surface、
 * 同一个 `shape`）⇒ 边框与底色**同 bounds**；不改最小触控（`minimumInteractiveComponentSize`
 * 一行没动，`check-update` 节点仍是 48dp、可点区仍是那个 40dp 的内容盒）。
 */
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
        // 边框与底色画在同一个 Surface 节点上（同 bounds）——**不**放到外层 `Modifier.border`。
        border = BorderStroke(
            width = PoetryTokens.HAIRLINE_DP.dp,
            color = if (enabled) PoetryTokens.accentLine else PoetryTokens.line,
        ),
        contentPadding = PaddingValues(
            horizontal = PoetryTokens.rem(PoetryTokens.CTL_PAD_X_REM),
            vertical = PoetryTokens.rem(PoetryTokens.CTL_PAD_Y_REM),
        ),
        modifier = Modifier.testTag("check-update"),
    ) {
        Text("检查更新", style = PoetryTextStyles.ctl)
    }
}
