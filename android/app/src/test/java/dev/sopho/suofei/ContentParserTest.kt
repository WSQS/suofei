package dev.sopho.suofei

import dev.sopho.suofei.data.ContentParseException
import dev.sopho.suofei.data.ContentParser
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * `content.json` 解析的**新字段形状**（`formatVersion` 2，2026-10-16）：
 * 顶层 `dynasties` 是**有序的中文值数组**、每首 **10 键**、`dynasty` 是**中文单值**并与顶层数组
 * **精确匹配**、`detail`/`notes` **空节 ⇒ `null`（键仍在）**。
 *
 * 两道「真解析」的牙：
 * 1. **APK 内置产物**（`src/main/assets/content/content.json`）必须真能解析 —— 内置内容坏掉＝首次断网读不了；
 * 2. **稳定契约侧的机器可读产物**（`tests/fixtures/contract/real-01-full.json`）必须是同一套键序 ——
 *    单测不持副本，键序从那份产物读出来与 [ContentParser.POEM_KEYS] 比。
 *    （2026-10-16 改：原先读 `items/content-format/prototypes/rules-v4/json/` —— 那是会被归档的原型目录。）
 */
class ContentParserTest {

    private val assetFile = File("src/main/assets/content/content.json")
    private val assetText: String get() = assetFile.readText(Charsets.UTF_8)

    // ── 合成数据：新形状的最小合法产物 ────────────────────────────────────

    private fun poemJson(
        id: String,
        title: String = "题",
        author: String = "佚名",
        dynasty: String = "汉",
        orderInSource: String = "null",
        detail: String = "null",
        notes: String = "null",
        stanzas: String = """[["一。"]]""",
        tags: String? = null,
    ): String =
        """{"id":"$id","title":"$title","author":"$author","dynasty":"$dynasty","genre":null,""" +
            """"source":"底本","orderInSource":$orderInSource,""" +
            (if (tags == null) "" else "\"tags\":$tags,") +
            """"detail":$detail,"stanzas":$stanzas,"notes":$notes}"""

    private fun product(
        vararg poems: String,
        dynasties: String = """"汉"""",
        formatVersion: Int = 2,
        tags: String? = null,
    ): String =
        """{"formatVersion":$formatVersion,"contentVersion":"1.0.0","generatedAt":"2026-10-16T00:00:00Z",""" +
            """"dynasties":[$dynasties],""" +
            (if (tags == null) "" else "\"tags\":$tags,") +
            """"poems":[${poems.joinToString(",")}]}"""

    // ── 内置产物（真解析）───────────────────────────────────────────────

    @Test
    fun embeddedContent_parsesInTheNewShape_andKeepsCompiledOrder() {
        assertTrue("内置内容文件应存在：${assetFile.absolutePath}", assetFile.isFile)
        val content = ContentParser.parse(assetText)

        // ⚠ 不断言字面版本号：内置产物的 `formatVersion` 由整合时统一生成（本端不手改 assets）。
        //   这里只钉「可解析且在支持范围内」，以及下面的「目录与次序照产物」。
        assertTrue(
            "内置产物的 formatVersion 应在 2..${ContentParser.SUPPORTED_FORMAT_VERSION} 之间，实际 ${content.formatVersion}",
            content.formatVersion in 2..ContentParser.SUPPORTED_FORMAT_VERSION,
        )
        assertTrue(
            "contentVersion 应是发布版本（YYYY.MM.DD.N）或本地派生版本（0.0.0-dev+12 位十六进制）——" +
                "后者是未指定版本号时编译器的本地版本（不可发布）：${content.contentVersion}",
            content.contentVersion.matches(Regex("""\d{4}\.\d{2}\.\d{2}\.\d+""")) ||
                content.contentVersion.matches(Regex("""0\.0\.0-dev\+[0-9a-f]{12}""")),
        )

        // 组名＝顶层数组里的中文串；只列实际有内容的组（注册表 order 升序：先秦…近现代）。
        // ⚠ 2026-10-16（新增杜甫《梦李白二首》两条）：**不再写死「20 首」与固定组清单** ——
        //   期望值从内容的**唯一来源** `content/poems/**` 派生（见 `ContentSources`）。
        //   这比字面量**更强**：源文加了诗而内置产物忘了重编 ⇒ 这里就报红（2026-10-14 那次
        //   「内置内容落后于内容源」的真实事故形态，当时谁也没发现）。
        assertEquals(
            "内置产物首数应等于 content/poems/** 的源文数（产物 == 源）",
            ContentSources.poemCount, content.poems.size,
        )
        val registry = ContentSources.dynastiesRegistry
        val sourceGroups = ContentSources.dynastiesInSources
        assertTrue(
            "源文里出现的组名都必须在注册表 tools/lib/dynasties.mjs 里声明（精确匹配）：$sourceGroups",
            sourceGroups.all { registry.containsKey(it) },
        )
        assertEquals(
            "顶层 dynasties == 源文里出现过的组，按注册表 order 升序（组序唯一权威＝注册表）",
            sourceGroups.sortedBy { registry.getValue(it) },
            content.dynasties,
        )
        assertEquals(
            "顶层 dynasties 只列**实际有内容**的组（空组不得声明）",
            content.groups.size, content.dynasties.size,
        )

        // 契约：编译产物已按底本原次序排好，客户端不得重排。
        assertEquals("行行重行行", content.poems.first().title)
        // 「汉」组＝《古诗十九首》19 首：首＝行行重行行、末＝明月何皎皎，orderInSource 1..19。
        val han = content.groups.first { it.name == "汉" }
        assertEquals(19, han.poems.size)
        assertEquals("行行重行行", han.poems.first().title)
        assertEquals("明月何皎皎", han.poems.last().title)
        assertEquals((1..19).toList(), han.poems.map { it.orderInSource })
        // 新增的「近现代」组：1 首；**没有** orderInSource（该键可选，未写就是 null —— 不替用户编）。
        val modern = content.groups.first { it.name == "近现代" }
        assertEquals(1, modern.poems.size)
        assertEquals("七律·和郭沫若同志", modern.poems.single().title)
        assertEquals(null, modern.poems.single().orderInSource)

        // v3：内置产物必须带标签，而且**标签内次序照产物**（客户端不重排）。
        // 真实事实（内容线 2026-10-18）：《古诗十九首》19 首各有一条真实归属，1…19。
        if (content.formatVersion >= 3) {
            val tag = content.tags.firstOrNull { it.id == "古诗十九首" }
            assertNotNull("v3 内置产物应有「古诗十九首」标签", tag)
            assertEquals(
                "标签内的成员次序必须与朝代组内次序（底本原次序 1…19）一致",
                han.poems.map { it.id },
                tag!!.memberIds,
            )
            assertEquals(
                "标签视图的组数 = 至少一个成员的标签数（零成员不渲染）",
                content.tags.count { it.memberIds.isNotEmpty() },
                content.tagGroups.size,
            )
            // 没有标签的诗仍在朝代页（标签是附加轴，不把人从目录里抽走）
            val tagged = content.tags.flatMap { it.memberIds }.toSet()
            assertTrue("应有没打标签的诗（梦李白二首、毛诗）", content.poems.any { it.id !in tagged })
        }
    }

    @Test
    fun embeddedContent_keepsEveryPrintedLine() {
        val content = ContentParser.parse(assetText)
        // v2 布局（2026-10-16）里 id 是「组名-题名」，不再是 `gushi-shijiu-shou-01` 那种旧序号。
        val poem = content.poems.first { it.id == "古诗十九首-行行重行行" }
        // 《行行重行行》底本共 8 个印刷行，每行两句，底本无空行分段
        assertEquals(1, poem.stanzas.size)
        assertEquals(8, poem.stanzas[0].size)
        assertEquals("行行重行行，与君生别离。", poem.stanzas[0][0])
        assertEquals("弃捐勿复道，努力加餐饭。", poem.stanzas[0][7])
        // 中文单值组名（不再有 dynastyKey/dynastyLabel/dynastyOrder）
        assertEquals("汉", poem.dynasty)
        assertEquals("佚名", poem.author)
        assertEquals("五言古诗", poem.genre)
    }

    @Test
    fun embeddedContent_usesTheDeclaredKeyShape_andHasNoRemovedKey() {
        val content = ContentParser.parse(assetText)
        val keys = keysOfFirstPoem(assetText)
        // v2 产物没有 `tags` 键；v3 起每首都有。两者都是「本轮认得的形状」。
        val declared = if (content.formatVersion >= 3) ContentParser.POEM_KEYS else ContentParser.POEM_KEYS_V2
        assertEquals("每首的键与键序应等于 ContentParser 声明的键", declared, keys)
        for (removed in listOf("variants", "era", "dynastyKey", "dynastyLabel", "dynastyOrder")) {
            assertFalse("新形状里不该再有 $removed", assetText.contains("\"$removed\""))
        }
        assertTrue("顶层 dynasties 是有序中文值数组", content.dynasties.all { it.isNotBlank() })
    }

    @Test
    fun detailAndNotes_reflectTheSourceProduct_forEveryPoem() {
        val content = ContentParser.parse(assetText)
        // 「没有笔记」是真实状态：不得生成占位笔记（AGENTS：agent 不代写第一人称内容）
        assertTrue("本版内容不应出现任何笔记文本", content.poems.all { it.notes == null })
        // 详情正文来自每首的 `## 详情` 节。S3 迁移（v2，2026-10-16）已把它写进内置产物 ⇒
        // 有这一节的 13 首 detail **非空**，其余 6 首**没有这一节 ⇒ null（不是空串、也不是占位）**。
        // ⚠ 不看硬编码的条数：**逐首对着唯一来源**（`content/poems/古诗十九首/<题名>.md`）核
        // 「源里有 `## 详情` ⟺ 产物里 detail 非 null」——内容线日后增删详情，这条会真报红。
        // ⚠ 2026-10-16：真实内容现在**两个组**（`古诗十九首/` 与 `毛泽东/`）⇒ 不再假定单一目录，
        //   改为在 `content/poems/` 下**按题名递归查找**唯一来源（找不到即失败，不跳过）。
        // ⚠ 2026-10-16：源文根与「有 `## 详情` 的源文数」都走 `ContentSources`（同一份忽略规则，不各写一遍）。
        val poemsRoot = ContentSources.poemsRoot
        // ⚠ 按**路径 id** 找源文（见 ContentSources.idOf 的注释）：作者的目录层级/文件名可以自由，
        //   例如 `杜甫/梦李白二首/其一.md`（id `杜甫-梦李白二首-其一`）也能对上。
        val withDetail = content.poems.filter { it.detail != null }
        assertTrue("至少应有带 `## 详情` 的诗（S3 迁移已进产物）", withDetail.isNotEmpty())
        assertTrue("也应有**没有** `## 详情` 的诗（否则这条对照就白做了）", withDetail.size < content.poems.size)
        for (poem in content.poems) {
            val src = ContentSources.byId[poem.id]
                ?: throw AssertionError(
                    "按路径 id 找不到源文：${poem.id}（查找基于 content/poems/ 的相对路径派生 id，" +
                        "**不要求**文件名等于题名）",
                )
            val hasSection = src.readText(Charsets.UTF_8).lineSequence().any { it.trim() == "## 详情" }
            assertEquals(
                "「${poem.title}」的 detail 与源里的 `## 详情` 节不一致（有节 ⇒ 非 null；无节 ⇒ null）",
                hasSection,
                poem.detail != null,
            )
            if (poem.detail != null) {
                assertTrue("detail 不得是空白占位", poem.detail!!.isNotBlank())
            }
        }
    }

    /**
     * 规范侧的机器可读产物（唯一来源，不持副本）：键序必须与 [ContentParser.POEM_KEYS] 一致。
     *
     * ⚠ **如实记下一处已知差异**：那份产物（rules-v4 的 demo 输出）每首只有 **9** 个键 ——
     * **没有 `source`**；而实施计划 §2.1 写的每首 10 键**含 `source`**（本端按 10 键实现，并且
     * 对 `source` 缺失是容错的）。这条断言把「相对键序一致」钉住，并把那一个差异写进失败信息。
     */
    @Test
    fun canonicalNewShapeFixture_keyOrderMatchesTheInterface() {
        val raw = TestRepoFiles.read(
            "tests/fixtures/contract/real-01-full.json",
            "新字段形状的机器可读产物（稳定契约副本）是这套键序的锚；读不到即失败，不跳过。",
        )
        val keys = keysOfFirstPoem(raw)
        // 2026-10-18：该夹具已升到 v3（每首 11 键，`tags` 在末尾；顶层多一个 `tags`）
        // ⇒ 它直接钉住 [ContentParser.POEM_KEYS] 的全序；v3 就是在 v2 后面多一个 `tags`。
        assertEquals("每首的键与键序应等于 ContentParser.POEM_KEYS（v3）", ContentParser.POEM_KEYS, keys)
        assertEquals(
            "v3 只是 v2 的末尾多一个 tags（不多不少、不改序）",
            ContentParser.POEM_KEYS_V2,
            ContentParser.POEM_KEYS.dropLast(1),
        )
        assertEquals("v3 末尾那个键就是 tags", "tags", ContentParser.POEM_KEYS.last())
        assertEquals(
            "顶层同样只多一个 tags（在 dynasties 之后、poems 之前）",
            ContentParser.TOP_LEVEL_KEYS.filter { it != "tags" },
            ContentParser.TOP_LEVEL_KEYS_V2,
        )

        // 那份产物真的行使了 detail（含 `### 异文`，正是最小 Markdown 渲染要处理的东西）与 tags
        val content = ContentParser.parse(raw)
        assertEquals(3, content.formatVersion)
        assertEquals(listOf("汉"), content.dynasties)
        assertEquals("夹具里的顶层 tags", listOf("古诗十九首"), content.tags.map { it.id })
        assertEquals(listOf("real-01-full"), content.tags.single().memberIds)
        assertEquals(listOf("古诗十九首" to 1), content.poems.single().tags.map { it.id to it.orderInTag })
        assertEquals(listOf("古诗十九首"), content.tagGroups.map { it.name })
        val detail = content.poems.single().detail
        assertTrue("真实样例的 detail 应含 `### 异文`：$detail", detail != null && detail.contains("### 异文"))
        assertNull("真实样例的 notes 是空节 ⇒ null（键仍在）", content.poems.single().notes)
    }

    // ── 标签（v3）：两处字段、次序、引用完整性、零成员不渲染 ──────────────────

    /** v3 的最小合法产物：两首诗、两个标签（其中一个零成员，用来验「不渲染」）。 */
    private fun v3Product(): String = product(
        poemJson("a", title = "甲诗", orderInSource = "1", tags = """[{"id":"古诗十九首","orderInTag":2}]"""),
        poemJson("b", title = "乙诗", orderInSource = "2", tags = """[{"id":"古诗十九首","orderInTag":1},{"id":"咏怀","orderInTag":1}]"""),
        formatVersion = 3,
        // 标签次序就是**产物次序**（编译期已按拼音排好；本端不重排——所以这里故意写成非拼音序）。
        tags = """[{"id":"咏怀","members":["b"]},{"id":"古诗十九首","members":["b","a"]},{"id":"玉台新咏","members":[]}]""",
    )

    @Test
    fun tags_areParsed_andBothV3KeysAreInTheDeclaredShape() {
        val content = ContentParser.parse(v3Product())
        assertEquals(3, content.formatVersion)
        // 顶层 tags 照产物次序（含零成员的那一个仍在数据里）
        assertEquals(listOf("咏怀", "古诗十九首", "玉台新咏"), content.tags.map { it.id })
        assertEquals(listOf("b", "a"), content.tags[1].memberIds)
        // 每首的 tags 与 orderInTag 都在（orderInTag 不是可选：它是标签内位置的唯一来源）
        assertEquals(listOf("古诗十九首" to 2), content.poems.first { it.id == "a" }.tags.map { it.id to it.orderInTag })

        // 标签视图：**照产物次序、不重排**；成员次序也是产物给的（b 的 orderInTag=1 在前）
        assertEquals(listOf("咏怀", "古诗十九首"), content.tagGroups.map { it.name })
        assertEquals(listOf("乙诗"), content.tagGroups[0].poems.map { it.title })
        assertEquals(listOf("乙诗", "甲诗"), content.tagGroups[1].poems.map { it.title })
        // 零成员标签**不渲染**（整组不出现），但它仍在数据里（不是删除标签定义）
        assertTrue("零成员标签仍在 tags 数据里", content.tags.any { it.id == "玉台新咏" })
        assertFalse("零成员标签不得进 tagGroups（不渲染组头/按钮/空态文字）", content.tagGroups.any { it.name == "玉台新咏" })
    }

    @Test(expected = ContentParseException::class)
    fun v3Payload_withoutTopLevelTags_isRejected() {
        // v3 要求两处 tags 键**在位**；缺了不是「没有标签」而是产物坏了。
        ContentParser.parse(
            product(poemJson("a", tags = "[]"), formatVersion = 3),
        )
    }

    @Test(expected = ContentParseException::class)
    fun v3Payload_withoutPoemTags_isRejected() {
        ContentParser.parse(
            product(poemJson("a"), formatVersion = 3, tags = "[]"),
        )
    }

    @Test(expected = ContentParseException::class)
    fun poemTag_referringToUndeclaredTag_isRejected() {
        ContentParser.parse(
            product(
                poemJson("a", tags = """[{"id":"未声明","orderInTag":1}]"""),
                formatVersion = 3,
                tags = """[{"id":"古诗十九首","members":["a"]}]""",
            ),
        )
    }

    @Test(expected = ContentParseException::class)
    fun orderInTag_missing_isRejected_notTreatedAsOptional() {
        ContentParser.parse(
            product(
                poemJson("a", tags = """[{"id":"古诗十九首"}]"""),
                formatVersion = 3,
                tags = """[{"id":"古诗十九首","members":["a"]}]""",
            ),
        )
    }

    @Test(expected = ContentParseException::class)
    fun tagMember_pointingToMissingPoem_isRejected() {
        ContentParser.parse(
            product(
                poemJson("a"),
                formatVersion = 3,
                tags = """[{"id":"古诗十九首","members":["不存在"]}]""",
            ),
        )
    }

    @Test(expected = ContentParseException::class)
    fun tagMembers_andPoemSideTags_disagreeingIsRejected() {
        // `tags[].members` 是编译期派生的索引；两处事实打架时报错，不静默挑一边。
        ContentParser.parse(
            product(
                poemJson("a", tags = """[{"id":"古诗十九首","orderInTag":1}]"""),
                poemJson("b"),
                formatVersion = 3,
                tags = """[{"id":"古诗十九首","members":["a"]},{"id":"咏怀","members":["b"]}]""",
            ),
        )
    }

    @Test(expected = ContentParseException::class)
    fun tagMemberOrder_thatContradictsOrderInTagIsRejected() {
        // 客户端**不重排**（编译期是唯一排序权威）⇒ 产物给的 members 次序必须真的是 orderInTag 升序。
        ContentParser.parse(
            product(
                poemJson("a", tags = """[{"id":"古诗十九首","orderInTag":2}]"""),
                poemJson("b", tags = """[{"id":"古诗十九首","orderInTag":1}]"""),
                formatVersion = 3,
                tags = """[{"id":"古诗十九首","members":["a","b"]}]""",
            ),
        )
    }

    @Test(expected = ContentParseException::class)
    fun duplicateTagIdInOnePoem_isRejected() {
        ContentParser.parse(
            product(
                poemJson("a", tags = """[{"id":"古诗十九首","orderInTag":1},{"id":"古诗十九首","orderInTag":2}]"""),
                formatVersion = 3,
                tags = """[{"id":"古诗十九首","members":["a"]}]""",
            ),
        )
    }

    // ── 「照产物次序渲染、不重排」（Web 端 e2e 同一条口径；这里两条都要有）─────────────────

    /**
     * 口径一：**标签之间**的次序＝产物 `tags[]` 的次序。
     * 夹具故意给一个「不是按名字排序」的次序；若客户端自行按名排（或按拼音再排一次），这条就红。
     */
    @Test
    fun tagOrder_isTheProductOrder_andTheClientNeverResorts() {
        val content = ContentParser.parse(
            product(
                poemJson("p1", tags = """[{"id":"汉魏六朝诗选","orderInTag":1}]"""),
                poemJson("p2", tags = """[{"id":"古诗十九首","orderInTag":1}]"""),
                formatVersion = 3,
                tags = """[{"id":"汉魏六朝诗选","members":["p1"]},{"id":"古诗十九首","members":["p2"]}]""",
            ),
        )
        val rendered = content.tagGroups.map { it.name }
        assertEquals(listOf("汉魏六朝诗选", "古诗十九首"), rendered)
        assertNotEquals(
            "客户端不得按名字自己排（那就推翻了编译期按拼音定好的次序）",
            rendered.sorted(),
            rendered,
        )
    }

    /**
     * 口径二：**标签内部**的次序＝产物 `members[]` 的次序（它本身就是 `orderInTag` 升序）。
     * 夹具里题名的码位序恰好相反，所以「客户端按题名重排」会被抓住。
     */
    @Test
    fun tagMembers_keepTheProductOrder_whichIsOrderInTagAscending() {
        val content = ContentParser.parse(
            product(
                poemJson("a", title = "甲诗", tags = """[{"id":"古诗十九首","orderInTag":1}]"""),
                poemJson("b", title = "乙诗", tags = """[{"id":"古诗十九首","orderInTag":2}]"""),
                formatVersion = 3,
                tags = """[{"id":"古诗十九首","members":["a","b"]}]""",
            ),
        )
        val group = content.tagGroups.single()
        assertEquals(listOf("甲诗", "乙诗"), group.poems.map { it.title })
        assertNotEquals("不得按题名重排（题名的码位序恰好相反）", group.poems.map { it.title }.sorted(), group.poems.map { it.title })
        assertEquals(
            "成员次序必须就是 orderInTag 升序（编译期语义）",
            listOf(1, 2),
            group.poems.map { p -> p.tags.single { it.id == "古诗十九首" }.orderInTag },
        )
    }

    // ── 段结构 / 空值 / 分组次序 ────────────────────────────────────────

    @Test
    fun stanzaBreaks_areKeptWhenPresent() {
        // 真实 19 首都没有空行分段，所以「空行 = 段边界」只能用合成数据测。
        val content = ContentParser.parse(
            product(poemJson("a", stanzas = """[["一。","二。"],["三。"]]""")),
        )
        val poem = content.poems.single()
        assertEquals(2, poem.stanzas.size)
        assertEquals(2, poem.stanzas[0].size)
        assertEquals(1, poem.stanzas[1].size)
    }

    @Test
    fun groups_followTheTopLevelDynastiesOrder_andEmptyGroupsAreOmitted() {
        val content = ContentParser.parse(
            product(
                poemJson("a", dynasty = "魏晋", orderInSource = "2"),
                poemJson("b", dynasty = "汉", orderInSource = "1"),
                dynasties = """"未详","魏晋","汉","先秦"""",
            ),
        )
        // 组次序＝顶层数组次序；没有内容的组（未详／先秦）不出现
        assertEquals(listOf("魏晋", "汉"), content.groups.map { it.name })
        // 组内次序仍由产物给（编译期是唯一排序权威）
        assertEquals(listOf("a"), content.groups[0].poems.map { it.id })
        assertEquals(listOf("b"), content.groups[1].poems.map { it.id })
    }

    // ── 中文单值组名的**精确匹配**（不做 trim／繁简折叠／别名）──────────

    @Test(expected = ContentParseException::class)
    fun dynastyWithTrailingSpace_isRejected_notTrimmed() {
        ContentParser.parse(product(poemJson("a", dynasty = "汉 ")))
    }

    @Test(expected = ContentParseException::class)
    fun traditionalForm_isRejected_notFolded() {
        ContentParser.parse(product(poemJson("a", dynasty = "漢")))
    }

    @Test(expected = ContentParseException::class)
    fun undeclaredDynasty_isRejected() {
        ContentParser.parse(product(poemJson("a", dynasty = "宋")))
    }

    @Test(expected = ContentParseException::class)
    fun duplicateDynastyNames_areRejected() {
        ContentParser.parse(product(poemJson("a"), dynasties = """"汉","汉""""))
    }

    @Test(expected = ContentParseException::class)
    fun oldShapeDynastyObjects_areRejected() {
        // 旧形状（对象数组）不再接受：这正是「不升版就会被老客户端读错」的那一类变更。
        ContentParser.parse(
            """{"formatVersion":1,"contentVersion":"1.0.0","dynasties":[{"key":"han","label":"汉","order":100}],
               "poems":[{"id":"a","title":"t","author":"佚名","dynastyKey":"han","source":"s","stanzas":[["line"]]}]}""".trimIndent(),
        )
    }

    // ── 次序 / 必填 / 可选 ─────────────────────────────────────────────

    @Test
    fun nonIntegerOrderInSource_isTreatedAsAbsent_notAsAnError() {
        // 与 Web 端口径一致：类型不对既不静默当 0、也不让整份内容解析失败——按「产物没给」处理，走兜底。
        val content = ContentParser.parse(
            product(
                poemJson("a", title = "乙诗", orderInSource = "\"2\""),
                poemJson("b", title = "甲诗", author = "曹植", orderInSource = "\"1\""),
            ),
        )
        assertTrue(content.poems.all { it.orderInSource == null })
        assertEquals(listOf("曹植", "佚名"), content.groups.single().poems.map { it.author })
    }

    @Test
    fun fallbackOrdering_appliesOnlyWhenProductGivesNoOrderInSource() {
        val content = ContentParser.parse(
            product(
                poemJson("a", title = "乙诗"),
                poemJson("b", title = "甲诗", author = "曹植"),
            ),
        )
        assertEquals(listOf("曹植", "佚名"), content.groups.single().poems.map { it.author })
    }

    @Test(expected = ContentParseException::class)
    fun missingRequiredField_isRejected() {
        // 缺 author（必填）；genre/source/orderInSource/detail/notes 才是可缺省的
        ContentParser.parse(
            """{"formatVersion":2,"contentVersion":"1.0.0","dynasties":["汉"],"poems":[
                 {"id":"a","title":"t","dynasty":"汉","stanzas":[["line"]]}]}""".trimIndent(),
        )
    }

    @Test
    fun optionalFields_mayBeAbsent() {
        val content = ContentParser.parse(
            """{"formatVersion":2,"contentVersion":"1.0.0","dynasties":["汉"],"poems":[
                 {"id":"a","title":"t","author":"佚名","dynasty":"汉","stanzas":[["line"]]}]}""".trimIndent(),
        )
        val poem = content.poems.single()
        assertNull(poem.notes)
        assertNull(poem.detail)
        assertNull(poem.source)
        assertNull(poem.genre)
        assertNull(poem.orderInSource)
    }

    @Test(expected = ContentParseException::class)
    fun emptyStanzas_areRejected() {
        ContentParser.parse(product(poemJson("a", stanzas = """[[],[]]""")))
    }

    @Test(expected = ContentParseException::class)
    fun blankLineInsideStanza_isRejected() {
        ContentParser.parse(product(poemJson("a", stanzas = """[["一。","  "]]""")))
    }

    // ── 工具：从**原始 JSON 文本**里取第一首诗对象的键序（org.json 不保序）──

    private fun keysOfFirstPoem(raw: String): List<String> {
        val poemsAt = raw.indexOf("\"poems\"")
        val objStart = raw.indexOf('{', poemsAt)
        val keys = mutableListOf<String>()
        var i = objStart
        var depth = 0
        var arrayDepth = 0
        var expectKey = false
        while (i < raw.length) {
            when (raw[i]) {
                '"' -> {
                    val sb = StringBuilder()
                    i++
                    while (i < raw.length && raw[i] != '"') {
                        if (raw[i] == '\\') {
                            i++
                        }
                        if (i < raw.length) sb.append(raw[i])
                        i++
                    }
                    // 诗对象里：arrayDepth 为 0 就是它的「顶层」（外层 `poems` 数组的 `[` 不在扫描范围内）
                    if (depth == 1 && arrayDepth == 0 && expectKey) {
                        keys += sb.toString()
                        expectKey = false
                    }
                    i++
                }

                '{' -> {
                    depth++
                    if (depth == 1) expectKey = true
                    i++
                }

                '}' -> {
                    depth--
                    i++
                    if (depth == 0) return keys
                }

                '[' -> {
                    arrayDepth++
                    i++
                }

                ']' -> {
                    arrayDepth--
                    i++
                }

                ',' -> {
                    if (depth == 1 && arrayDepth == 0) expectKey = true
                    i++
                }

                else -> i++
            }
        }
        return keys
    }
}
