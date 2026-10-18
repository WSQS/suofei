package dev.sopho.suofei

import dev.sopho.suofei.ui.PoetryTokens
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 四个页面在**代码层**对得上各自采纳锚的落点（本机不跑模拟器，所以这是源码级的门，
 * **不是**渲染验证，更不能代替观感验收）。行为级转移在 `AppStateNavigationTest`。
 *
 * 每一项都点名它守的是哪个采纳锚；「逐项对照原型」的结论写在交付报告里，这份文件只保证
 * 「接线没断」这类回归会报红（例如谁把卡片、应用名或页脚加回目录页，谁把笔记入口做成常显）。
 */
class ScreenInventoryTest {

    private val raw = TestRepoFiles.read(
        "android/app/src/main/java/dev/sopho/suofei/ui/Screens.kt",
        "四个页面都在 Screens.kt 里",
    )

    /** 去掉注释再扫——注释里可以随意提到 `variants` 这类词（说明性文字不算渲染）。 */
    private fun codeOnly(text: String): String = text
        .replace(Regex("""/\*.*?\*/""", RegexOption.DOT_MATCHES_ALL), "")
        .lines()
        .filterNot { it.trim().startsWith("//") || it.trim().startsWith("*") }
        .joinToString("\n")
        .replace(Regex("""//.*"""), "")

    private val code = codeOnly(raw)

    /** 取某个 Composable 的函数体（到下一个 `@Composable` 注解为止）。 */
    private fun body(name: String): String {
        val start = Regex("""fun\s+$name\s*\(""").find(code)?.range?.first
            ?: throw AssertionError("Screens.kt 里找不到 $name")
        val next = Regex("""\n@Composable""").find(code, start)?.range?.first ?: code.length
        return code.substring(start, next)
    }

    @Test
    fun exactlyFourScreens_exist_andTheOldUpdateScreenIsGone() {
        for (name in listOf("LibraryScreen", "PoemScreen", "PoemDetailScreen", "AboutScreen")) {
            assertTrue("缺少页面 $name", code.contains("fun $name("))
        }
        assertFalse("「更新页」已改名为「关于页」：不该再叫 UpdateScreen", code.contains("UpdateScreen"))
    }

    @Test
    fun everyPage_usesTheChosenWidthRule() {
        // 宽度口径只有一处实现（PoetryTokens.contentColumnWidth），四个页面都必须经过它
        assertTrue("列宽必须来自令牌层", code.contains("PoetryTokens.contentColumnWidth"))
        for (name in listOf("LibraryScreen", "PoemScreen", "PoemDetailScreen", "AboutScreen")) {
            assertTrue("$name 没有走统一的内容列（ContentColumn）", body(name).contains("ContentColumn"))
        }
    }

    // ── 目录页（采纳锚 hub-hierarchy／hub-horizontal／hub-align）────────────

    @Test
    fun libraryScreen_hasTheAboutEntryAtTheTop_andNoAppName() {
        val library = body("LibraryScreen")
        assertTrue("目录页要有「关于」入口", library.contains("onAbout"))
        assertTrue("顶部行（两个 tab ＋ 关于）在列表第一项", library.contains("LibraryTopRow"))
        // 用户 q-52a14e2c：不在目录重复显示应用名
        assertFalse("目录页不得出现应用名", library.contains("AboutFields.APP_NAME"))
        assertFalse("目录页不得出现「索斐」", library.contains("索斐"))
    }

    // ── 顶部两个 tab（2026-10-18：用户定「朝代 ｜ 标签」，标签页与朝代页同构）────────────────

    @Test
    fun libraryTopRow_hasBothTabs_andTheAboutEntry() {
        val top = body("LibraryTopRow")
        assertTrue("左：朝代 tab", top.contains("LABEL_TAB_DYNASTY"))
        assertTrue("左：标签 tab", top.contains("LABEL_TAB_TAG"))
        assertTrue("右：「关于」入口仍然只在顶部一个", top.contains("\"关于\"") && top.contains("onAbout()"))
        // tab 是切换目录页的两个视图，不是两个页面：点它们只调 selectLibraryTab
        assertTrue("tab 只切视图", top.contains("onSelectTab("))
        assertFalse("tab 不得直接改 Screen（页面集合仍是四个）", top.contains("openPoem") || top.contains("openAbout("))
        // 选中态：文字色变 text ＋ 下方一条 accent-line 下划线（原型 .tab[aria-selected]）
        val tab = body("TabLabel")
        assertTrue("选中时文字用主色", tab.contains("PoetryTokens.text"))
        assertTrue("下划线用 accent-line 令牌", tab.contains("PoetryTokens.accentLine"))
        assertEquals("下划线 1px", PoetryTokens.TAB_UNDERLINE_DP, 1f, 1e-6f)
    }

    @Test
    fun bothLibraryViews_renderThroughTheSameGroupItems() {
        // 「标签页与朝代页同构」不只靠相似的值：两个视图都走 `groupItems` 同一段渲染。
        val library = body("LibraryScreen")
        assertEquals("两个 tab 都必须走同一段分组渲染", 2, Regex("""->\s*groupItems\(""").findAll(library).count())
        assertTrue("朝代视图用 content.groups", library.contains("content.groups"))
        assertTrue("标签视图用 content.tagGroups", library.contains("content.tagGroups"))
    }

    @Test
    fun tagView_showsNoCounts_andHidesZeroMemberTags() {
        val library = body("LibraryScreen")
        // 标签页**不显示任何数量**：showCount = false 那一支；零成员标签由 Content.tagGroups 已过滤
        assertTrue("标签视图显式不显示计数", Regex("""showCount\s*=\s*false""").containsMatchIn(library))
        assertTrue("朝代视图计数照旧", Regex("""showCount\s*=\s*true""").containsMatchIn(library))
        // 组头：count == null 时不画计数；标签页没有序号（orderInTag 不上界面）
        assertTrue("组头按 count 可选", body("GroupHeaderRow").contains("count: Int?"))
        assertTrue("null 不画计数", body("GroupHeaderRow").contains("if (count != null)"))
        assertFalse("标签视图不得渲染序号 orderInTag", code.contains("orderInTag"))
    }

    @Test
    fun libraryScreen_foldsGroups_withoutACard_andWithAHangingMarker() {
        val header = body("GroupHeaderRow")
        // IF-44 的行为（用户已定）：首次全收起、整块组头可点、各组独立展开
        assertTrue("整块组头可点（组名/数量/空白同属一个操作）", header.contains("toggleable("))
        assertTrue("悬挂记号（方括号）", header.contains("HangingMarker("))
        assertTrue("组名＋数量", header.contains("groupCountAnnotated("))
        // 采纳锚：**不画卡片**（组头与页底同色，层级靠留白与发丝线）
        assertFalse("组头不得是卡片（不得有底色）", header.contains(".background("))
        assertFalse("组头不得是卡片（不得有边框）", header.contains(".border("))
        assertFalse("组头不得是卡片（不得有圆角）", header.contains("RoundedCornerShape"))
        assertTrue("组头下方一条发丝线", header.contains("HairLine("))
        // 首态全收起 ⇒ 用「有没有被点开」的映射，且初值不存在；两个 tab 各一份（切走再切回仍在）
        assertTrue("展开状态由外部持有（跨屏保留）", body("LibraryScreen").contains("expandedMap"))
    }

    @Test
    fun poemRow_startsAtTheMarkerSlot_soTitleAndGroupNameShareOneLeftEdge() {
        // 采纳锚：诗目题名与组名首字**同一条竖线（缩进 0）** ⇒ 两者都从悬挂槽的右沿开始。
        assertTrue("诗行起点＝悬挂槽宽", body("PoemRow").contains("MARKER_SLOT_REM"))
        assertTrue("组头的槽从列左沿量起（记号在槽内）", body("GroupHeaderRow").contains("HangingMarker("))
    }

    @Test
    fun poemRow_keepsTitleAndAuthorOnly() {
        val row = body("PoemRow")
        assertFalse("目录行不得再有「有笔记」标记", row.contains("有笔记"))
        assertFalse("目录行不得有题名预览/版本号", row.contains("版本"))
        assertTrue("题名与作者", row.contains("poem.title") && row.contains("poem.author"))
        assertTrue("作者紧随题名（用 gap，不右对齐）", row.contains("authorGap()"))
    }

    // ── 诗页（采纳锚 poem-expression／poem-align／break／poem-note）─────────

    @Test
    fun poemScreen_centersEverything_andBreaksSemantically() {
        val poem = body("PoemScreen")
        assertTrue("正文按语义折行", poem.contains("SemanticBreak.breakStanza"))
        assertTrue("每一个视觉行都各自居中", poem.contains("TextAlign.Center"))
        assertTrue("题头走 PoemHead（题名/身份行也居中）", poem.contains("PoemHead("))
    }

    @Test
    fun poemScreen_showsNoSourceNoDetailAndNoVariants() {
        val poem = body("PoemScreen")
        assertFalse("诗页不得出现异文（variants）", poem.contains("variants"))
        assertFalse("诗页不得出现底本/来源（poem.source）", poem.contains("poem.source"))
        assertFalse("诗页不得出现详情正文（poem.detail）", poem.contains("poem.detail"))
    }

    @Test
    fun poemScreen_hasTheDetailEntry_andNoFooterRow() {
        val poem = body("PoemScreen")
        assertTrue("诗页要有「详情」入口（顶部行右端）", poem.contains("onDetail"))
        assertTrue("顶部行＝返回左／详情右", poem.contains("TopRow("))
        // 采纳锚（P2 选项 A）：**正文之后没有页脚行**
        assertFalse("诗页不得再在正文之后放页脚/入口行", poem.contains("这一首的考据与来源"))
        assertFalse("版本页脚已移除", body("AppRoot").contains("VersionFooter"))
    }

    @Test
    fun poemScreen_notesAreHiddenWhenThereIsNoNote() {
        val poem = body("PoemScreen")
        // 用户 q-bed9e64e：没有笔记 ⇒ 连入口都不出现
        assertTrue("笔记入口只在有笔记时出现", poem.contains("poem.notes != null"))
        assertTrue("入口在顶部行（档②）", poem.contains("noteEntryLabel("))
        assertTrue("展开内容在正文之后、无框", poem.contains("MarkdownBody("))
        assertFalse("笔记区不得画框（采纳锚 ② 是无框内联块）", poem.contains("RoundedCornerShape"))
        assertFalse("不得再出现「（无笔记）」占位", raw.contains("（无笔记）"))
    }

    // ── 详情页（采纳锚 round-2026-10-16-detail）────────────────────────────

    @Test
    fun poemDetailScreen_rendersMarkdownDetail_withTaggedSource_andNoSubTitle() {
        val detail = body("PoemDetailScreen")
        assertTrue("详情页要有底本与来源（poem.source）", detail.contains("poem.source"))
        assertTrue("来源前要有标签", detail.contains("LABEL_SOURCE_BLOCK"))
        assertTrue("详情正文走最小 Markdown 渲染", detail.contains("MarkdownBody("))
        assertTrue("详情正文来自产物字段 detail", detail.contains("poem.detail"))
        assertTrue("没有详情正文时如实说明", detail.contains("DETAIL_EMPTY_HINT"))
        assertFalse("不再重复身份信息", detail.contains("poemMetaLine"))
        assertFalse("不再有固定副题「这一首的考据与来源」", detail.contains("这一首的考据与来源"))
        assertFalse("不再有硬编码的「异文」小标题（改由 Markdown 的 ### 承担）", detail.contains("\"异文\""))
        assertTrue("顶部行只有返回", detail.contains("TopRow(left = LABEL_BACK"))
    }

    // ── 关于页（采纳锚 about-min 的 V3 ＋ about-update 的两条）──────────────

    @Test
    fun aboutScreen_carriesTheSharedFieldSet_theRepoLink_andTheAndroidUpdateBlock() {
        val about = body("AboutScreen")
        // 共享字段集（2026-10-16 同步为 4 项：应用名／应用版本／内容版本／仓库链接）：
        // 索引 0「应用名」按采纳锚（A3）当**页标题**、索引 3「仓库链接」是置底的**完整 URL 文本**
        // （两者都不另画标签行）；版本组的两个标签（LABELS[1] 应用版本、LABELS[2] 内容版本）直接取 LABELS[…]。
        assertTrue("关于页要有应用名（当页标题）", about.contains("AboutFields.APP_NAME"))
        for (i in 1..2) {
            assertTrue("关于页没有渲染 AboutFields.LABELS[$i]", about.contains("AboutFields.LABELS[$i]"))
        }
        assertTrue("关于页（Android）要有检查更新动作", about.contains("onCheckUpdate"))
        assertTrue("仓库链接置底（C1 完整 URL）", about.contains("AboutFields.REPO_URL"))
        assertTrue("版本组＝标签列＋值列（V3 标签左对齐）", about.contains("KeyValueRow("))
        // 删掉的两条（未采纳）：不再渲染
        assertFalse("关于页不该再渲染「一句话说明」", about.contains("TAGLINE"))
        assertFalse("关于页不该再渲染「诚实的限制」", about.contains("ABOUT_LIMITS_ANDROID"))
    }

    @Test
    fun aboutScreen_repoLink_isClickable_andOpensItExternally() {
        // 返修①（2026-10-16）：C1 是**完整 URL 的链接**（Web 那份 C1 就是 `<a href>`，两端同锚），
        // 此前两端都把它降成不可点的纯文本 ⇒ 本端把它改回**可点、且点了用外部应用打开**。
        // ⚠ 这是**源码级**守卫，不是点击级：本机单测没有 Robolectric/Compose UI 测试依赖
        //   （`app/build.gradle.kts` 的 testImplementation 只有 junit ＋ org.json），
        //   跑不了 Compose 的语义树/点击。截图的**实际点击**在真机/模拟器上另做（见交付报告）。
        val about = body("AboutScreen")
        assertTrue("仓库链接要可点", about.contains(".clickable"))
        assertTrue("用平台的 URL 处理器（LocalUriHandler 就是 Intent.ACTION_VIEW 那条通道）",
            about.contains("LocalUriHandler"))
        assertTrue("打开的就是共享字段集里那条 URL", about.contains("openUri(AboutFields.REPO_URL)"))
        // 把两件事绑在一起：可点动作挂在那段 URL 文本（`testTag("about-repo")`）上，
        // 而不是挂在页面上别的元素上（否则上面两条会空洞地通过）。
        assertTrue(
            "clickable 要与 testTag(\"about-repo\") 那段文本在同一处",
            Regex("""testTag\("about-repo"\)(.|\n){0,300}?clickable""").containsMatchIn(about),
        )
        // 仍不加「会打开浏览器」类提示（用户没选 C3 那句）。
        assertFalse("不得出现「在浏览器打开」类提示", about.contains("浏览器打开"))
    }

    @Test
    fun aboutScreen_hasNoFrame_andNoStatusPlaceholderInTheInitialState() {
        val about = body("AboutScreen")
        // 「无框」：按钮与状态文本是内容流里的元素，没有容器边框/底色/阴影/分隔线
        assertFalse("关于页不得有区域外框（边框）", about.contains(".border("))
        assertFalse("关于页不得有区域外框（底色）", about.contains(".background("))
        assertFalse("关于页不得有区域外框（圆角）", about.contains("RoundedCornerShape"))
        assertFalse("关于页不得有区域分隔线", about.contains("HairLine("))
        assertFalse("关于页不得有分区小标题「更新源」/「状态」", about.contains("更新源") || about.contains("\"状态\""))
        // 初态（尚未检查）**不生成状态文本元素**（用户已认可）；不是清空、也不占位
        assertTrue("初态必须不渲染状态行", about.contains("updateStatus !is UpdateStatus.Idle"))
        assertTrue("状态文本原地替换的文案函数", about.contains("updateStatusText("))
    }

    @Test
    fun aboutScreen_neverShowsTheContentSourceInTheSharedVersionGroup() {
        // 用户明确：共用版本信息里不要「来源：已下载／内置」
        val about = body("AboutScreen")
        assertTrue("内容版本走纯版本号的取值", about.contains("contentVersionText()"))
        assertFalse("不得再拼「来源：」", code.contains("来源："))
    }

    @Test
    fun aboutScreen_putsTheButtonAboveTheStatusLine() {
        // 用户 2026-10-16 确认的次序：**上方按钮＋下方一段状态文本**（原地替换）。
        // 本轮任务书曾把这条写成「label 在按钮上方」并由用户当场纠正 ⇒ 在此钉死，防倒过来。
        val about = body("AboutScreen")
        val button = about.indexOf("UpdateButton(")
        val status = about.indexOf("update-status")
        assertTrue("关于页必须同时有按钮与状态行", button >= 0 && status >= 0)
        assertTrue("按钮必须在上、状态文本在下（不许颠倒）", button < status)
    }

    /**
     * 「检查更新」按钮的**边框与底色必须画在同一个 box 上**。
     *
     * 背景（用户在看页面上报的真实缺陷）：背景矩形与外框之间**上下各有一条暗缝**。
     * 已核的根因（本机缓存里 `material3-android-1.3.2` 的 `SurfaceKt$Surface$2` 字节码 + 模拟器实测）：
     * 可点 `Surface` 的链是 `modifier.minimumInteractiveComponentSize().surface(shape, color, border, …)`，
     * 而 `surface(...)` 内部是 `border(border, shape) → background(color, shape) → clip(shape)`
     * ——**底色与边框同一个 draw 节点、同一 bounds**。所以把边框写在按钮**外面的**
     * `Modifier.border(...)` 上时，它会跟着 `minimumInteractiveComponentSize()` 被撑到最小交互高度
     * 48dp，而按钮自己的 Surface 只有内容高度 40dp（`ButtonDefaults.MinHeight`）
     * ⇒ 上下各露出约 4dp 页面底色 = 那两条暗缝（实测：边框盒 126px、底色盒 105px，density 2.625）。
     *
     * 这是**源码级守卫**——屏幕观感本身在设备上看，取证与像素测量见
     * `docs/reviews/ui-review/materials-android-update-button/`。
     */
    @Test
    fun updateButton_drawsItsBorderOnTheSameBoxAsItsBackground() {
        val button = body("UpdateButton")
        assertTrue(
            "边框必须交给按钮自己的 Surface（border = BorderStroke(...)，与 containerColor 同节点）",
            button.contains("border = BorderStroke("),
        )
        assertFalse(
            "边框不得画在外层 Modifier 链上：那会跟着最小交互尺寸被撑到 48dp，露出暗缝",
            button.contains(".border("),
        )
        // 不许用的手段（用户明确不要）：外卡片／双边框（外层再加底色），也不许硬裁
        assertFalse("不得在外层再加一层底色／外卡片", button.contains(".background("))
        assertFalse("不得硬裁（clip）", button.contains(".clip("))
        // 行为不许退化：检查中禁用仍由 enabled 参数接线；四个字与唯一一次 onClick 不变
        assertTrue("检查中禁用必须仍由 enabled 传入", button.contains("enabled = enabled"))
        assertTrue("按钮文字仍是「检查更新」", button.contains("\"检查更新\""))
        assertEquals("onClick 只接一次", 1, Regex("""onClick = onClick""").findAll(button).count())
    }

    // ── 系统返回（BackHandler，用户 2026-10-16 实测「按返回直接退出 app」）───────────────

    /**
     * 系统返回（返回键/手势）必须**接上**导航，且与三个标题返回按钮**走同一份** `AppState.back()`。
     *
     * 背景（真实缺陷）：此前全工程没有 `BackHandler` 接线 ⇒ 系统返回落到 Activity 默认行为
     * ＝`finish()`（退出 app），与用户实测吻合。本机 JVM 单测没有 Compose UI 测试依赖，跑不了
     * Compose 的语义树/返回分发 ⇒ 这是**源码级守卫**（行为级转移在 `AppStateNavigationTest`，
     * 真机/模拟器上的真实返回事件在交付报告里另记）。
     */
    @Test
    fun appRoot_wiresSystemBack_toTheSameStateBack() {
        val root = body("AppRoot")
        assertTrue("AppRoot 必须接系统返回（BackHandler）", root.contains("BackHandler("))
        // 必须复用同一份转移：BackHandler 的动作体就是 `state.back()`。
        assertTrue(
            "系统返回的动作必须直接调 state.back()（不另写一套转移规则）",
            Regex("""BackHandler\([^)]*\)\s*\{\s*state\.back\(\)\s*\}""").containsMatchIn(root),
        )
        // 目录根不拦：enabled 必须排除 LIBRARY ⇒ 该页不注册回调，系统照旧按默认行为离开 app。
        assertTrue(
            "enabled 必须排除 Screen.LIBRARY（目录页让系统照旧离开 app）",
            Regex("""BackHandler\(\s*enabled\s*=\s*state\.screen\s*!=\s*Screen\.LIBRARY\s*\)""")
                .containsMatchIn(root),
        )
        // 用户没要的功能：不许加二次确认 / 双按退出 / 手势预测改造 / 导航库。
        assertFalse("不得加二次确认弹窗", root.contains("AlertDialog"))
        assertFalse("不得加双按退出", root.contains("Toast") || root.contains("双按"))
        assertFalse("不得引入 NavHost/导航库", code.contains("NavHost") || code.contains("rememberNavController"))
    }

    @Test
    fun allTitleBackButtons_goThroughTheSameStateBack_asSystemBack() {
        // 诗页/详情页/关于页的「返回」三个按钮：全部直连 `state.back()`，与系统返回同一条逻辑。
        val wireUps = Regex("""onBack\s*=\s*\{\s*state\.back\(\)\s*\}""").findAll(code).count()
        assertEquals("三个页面返回按钮都应直连 state.back()", 3, wireUps)
        // 全文件只有这一份返回逻辑的入口：3 处按钮 ＋ 1 处系统返回。
        assertEquals(
            "state.back() 的调用点应恰好是 3 处标题返回 ＋ 1 处系统返回",
            4,
            Regex("""state\.back\(\)""").findAll(code).count(),
        )
    }
}
