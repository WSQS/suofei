package dev.sopho.suofei

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
        assertTrue("「关于」在顶部（列表第一项）", library.contains("AboutEntryRow"))
        // 用户 q-52a14e2c：不在目录重复显示应用名
        assertFalse("目录页不得出现应用名", library.contains("AboutFields.APP_NAME"))
        assertFalse("目录页不得出现「索斐」", library.contains("索斐"))
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
        // 首态全收起 ⇒ 用「有没有被点开」的映射，且初值不存在
        assertTrue("展开状态由外部持有（跨屏保留）", body("LibraryScreen").contains("expandedGroups"))
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
        // 共享字段集：索引 0/1 按采纳锚（A3）分别当**页标题**与**副标题**渲染（不另加标签行），
        // 版本组的两个标签与「诚实的限制」则直接取 LABELS[…]。
        assertTrue("关于页要有应用名", about.contains("AboutFields.APP_NAME"))
        assertTrue("关于页要有一句话说明", about.contains("AboutFields.TAGLINE"))
        for (i in 2..4) {
            assertTrue("关于页没有渲染 AboutFields.LABELS[$i]", about.contains("AboutFields.LABELS[$i]"))
        }
        assertTrue("关于页要有诚实的限制", about.contains("ABOUT_LIMITS_ANDROID"))
        assertTrue("关于页（Android）要有检查更新动作", about.contains("onCheckUpdate"))
        assertTrue("仓库链接置底（C1 完整 URL）", about.contains("AboutFields.REPO_URL"))
        assertTrue("版本组＝标签列＋值列（V3 标签左对齐）", about.contains("KeyValueRow("))
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
}
