package dev.sopho.suofei

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 门：**启动器图标**（形态 N1：单字「索」轮廓 ＋ 右下 accent 发丝角标）落地后的静态自证。
 *
 * 为什么需要这道门（只靠「文件写对了」不够）：
 *  1. 图标是**资源连线**：`AndroidManifest` 的 `android:icon`/`android:roundIcon` → `mipmap-anydpi-v26` 的
 *     自适应图标 XML → 三个 `drawable` 图层。任何一环接错，编译照样过，只有装到设备上才看得出来
 *     —— 而本机**不碰模拟器/设备**（负责人明确要求），所以这里把这条链改造成可静态断言。
 *  2. 图标的**硬约束**（原型 README 与本次任务书都写了）里，有两条是能静态查的：
 *     ① **不许依赖运行时字体**（Android 上没有微软雅黑这类字体，字形必须自己带走 ⇒ 只能是轮廓）；
 *     ② 前景内容要落在系统**保证可见**的中心 72 方内（外侧 18dp 可能被遮罩吃掉）。
 *     这两条一旦漂了，观感上的表现是「装上去才发现字变成了另一个字形/被切掉」，最难查。
 *
 * 覆盖不到的地方（**如实写明，不当成已验证**）：
 *  - 没有**渲染**验证：本门不画图、不看像素 —— 真正长什么样要在设备/模拟器上看（本次未做）。
 *  - 遮罩效果（圆形/squircle/厂商自定义）无法在这里验证：原型预览里的遮罩是近似。
 *  - `<monochrome>` 的实际效果取决于系统的「主题图标」开关（Android 13+），这里只能查资源形状。
 *
 * 另一条与「原型自述」的**实测差距**（写在这里免得后人以为门漏了）：
 *  原型 README 写「前景内容全部控制在中心直径 66 的圆内」（r=33）；实测 N1 的 accent 角标外角在
 *  半径 **33.812** 处（超 0.812 单位 = 画布的 0.75%），字形本身没超（24.971）。
 *  产生这个差距的原因是**形态本身**，不是实现走样，所以本门**不**把 66 圆当硬判据（那等于要求改设计），
 *  而是断言系统保证可见区（内切圆 r=36，方框 18…90）—— N1 在里面还有 2.188 单位余量。
 */
class LauncherIconTest {

    private companion object {
        /** 画布（自适应图标 108×108dp）与判据 —— 与 `android/tools/make-launcher-icon.mjs` 同一套数字。 */
        const val CANVAS = 108.0
        /** 同样一个数字的文本形式（资源属性里写的就是 `108`）。 */
        const val CANVAS_TEXT = "108"

        /** 系统**保证可见**的是中心 72 方：18…90（内切圆 r=36）。 */
        const val GUARANTEED_MIN = 18.0
        const val GUARANTEED_MAX = 90.0
        const val GUARANTEED_R = 36.0
        const val CENTER = 54.0

        const val MIPMAP_ANYDPI_DIR = "mipmap-anydpi-v26"
        const val BG = "drawable/ic_launcher_background.xml"
        const val FG = "drawable/ic_launcher_foreground.xml"
        const val MONO = "drawable/ic_launcher_monochrome.xml"
        val ADAPTIVE = listOf("$MIPMAP_ANYDPI_DIR/ic_launcher.xml", "$MIPMAP_ANYDPI_DIR/ic_launcher_round.xml")
        val LAYERS = listOf(BG, FG, MONO)

        /** path 记号：命令字母或数字（与生成器同一套解析口径）。 */
        val TOKEN = Regex("[MmLlHhVvCcSsQqTtAaZz]|-?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][-+]?\\d+)?")

        /** 每个命令的参数个数（SVG 与 Android 矢量资源共用同一套 path 语法）。 */
        val ARITY = mapOf(
            'M' to 2, 'L' to 2, 'H' to 1, 'V' to 1, 'C' to 6, 'S' to 4, 'Q' to 4, 'T' to 2, 'A' to 7, 'Z' to 0,
        )
    }

    // ─────────────────────────── 读资源（读不到即失败，不跳过） ───────────────────────────

    private fun resText(rel: String): String {
        val f = File(TestRepoFiles.moduleDir(), "src/main/res/$rel")
        if (!f.isFile) {
            throw AssertionError("缺资源 ${f.absolutePath} —— 本门据此断言，读不到即失败（不跳过）")
        }
        return f.readText(Charsets.UTF_8)
    }

    private fun attr(text: String, name: String): String =
        Regex("${Regex.escape(name)}=\"([^\"]*)\"").find(text)?.groupValues?.get(1)
            ?: throw AssertionError("资源里找不到属性 $name：\n$text")

    private fun allAttrs(text: String, name: String): List<String> =
        Regex("${Regex.escape(name)}=\"([^\"]*)\"").findAll(text).map { it.groupValues[1] }.toList()

    /** 去掉 XML 注释再判内容：注释里提到 `<text>`/字体不算依赖（本仓的注释就会写到它们）。 */
    private fun markupOnly(xml: String): String = Regex("<!--[\\s\\S]*?-->").replace(xml, "")

    /** `#rrggbb` / `#aarrggbb` 归一成小写 8 位十六进制，供跨文件比较。 */
    private fun normalizeHexColor(value: String): String {
        val hex = value.trim().removePrefix("#").lowercase()
        return when (hex.length) {
            3 -> "ff" + hex.map { "$it$it" }.joinToString("")
            6 -> "ff$hex"
            8 -> hex
            else -> throw AssertionError("颜色不是 #rgb/#rrggbb/#aarrggbb 形状：${value}")
        }
    }

    // ─────────────────────────── path 解析（绝对命令；源里就是大写） ───────────────────────────

    /** pathData → [(命令, 参数…)]，并把 SVG 的**隐式续接**展开（M 之后的隐式 lineto → L，其他命令重复自身）。 */
    private fun commands(d: String): List<Pair<Char, List<Double>>> {
        val tokens = TOKEN.findAll(d).map { it.value }.toList()
        val out = mutableListOf<Pair<Char, List<Double>>>()
        var i = 0
        var implicit: Char? = null
        while (i < tokens.size) {
            val t = tokens[i]
            val cmd: Char = if (t[0].isLetter()) {
                i++
                implicit = null
                t[0]
            } else {
                implicit ?: throw AssertionError("pathData 里的数字前面没有命令字母：$d")
            }
            if (cmd.isLowerCase()) {
                throw AssertionError("本门只支持**绝对**大写命令（工具生成的资源都是大写）：$d")
            }
            val n = ARITY[cmd] ?: throw AssertionError("不认识的路径命令 $cmd：$d")
            if (n == 0) {
                out += cmd to emptyList<Double>()
                implicit = null
                continue
            }
            if (i + n > tokens.size) throw AssertionError("命令 $cmd 的参数不全：$d")
            out += cmd to (i until i + n).map { tokens[it].toDouble() }
            i += n
            implicit = if (cmd == 'M') 'L' else cmd
        }
        return out
    }

    /** 一条 pathData 上的所有点（H/V 用当前点补齐另一个坐标；Q/C 的控制点也算进去 → 是**保守**的外框）。 */
    private fun pointsOf(d: String): List<Pair<Double, Double>> {
        val pts = mutableListOf<Pair<Double, Double>>()
        var cur = 0.0 to 0.0
        var start = 0.0 to 0.0
        fun push(x: Double, y: Double) {
            pts += x to y
            cur = x to y
        }
        for ((cmd, a) in commands(d)) {
            when (cmd) {
                'M' -> { start = a[0] to a[1]; push(a[0], a[1]) }
                'L' -> push(a[0], a[1])
                'H' -> push(a[0], cur.second)
                'V' -> push(cur.first, a[0])
                'Q' -> { push(a[0], a[1]); push(a[2], a[3]) }
                'C' -> { push(a[0], a[1]); push(a[2], a[3]); push(a[4], a[5]) }
                'S', 'T' -> push(a[a.size - 2], a[a.size - 1])
                'Z' -> push(start.first, start.second)
                else -> throw AssertionError("pointsOf 未处理的命令 $cmd")
            }
        }
        return pts
    }

    // ─────────────────────────── 1. 清单与图层的连线 ───────────────────────────

    @Test
    fun manifest_wiresIconAndRoundIconToTheAdaptiveIcon() {
        val manifest = File(TestRepoFiles.moduleDir(), "src/main/AndroidManifest.xml")
        assertTrue("找不到 AndroidManifest.xml：${manifest.absolutePath}", manifest.isFile)
        val text = manifest.readText(Charsets.UTF_8)
        assertEquals(
            "android:icon 必须指向 mipmap-anydpi-v26 的自适应图标（minSdk 26 ⇒ 系统一律读它；"
                + "没有 legacy 位图兜底，接错了就是默认图标）",
            "@mipmap/ic_launcher", attr(text, "android:icon"),
        )
        assertEquals(
            "android:roundIcon 必须接上（有些启动器会单独请求圆形入口）",
            "@mipmap/ic_launcher_round", attr(text, "android:roundIcon"),
        )
    }

    @Test
    fun adaptiveIcon_hasAllThreeLayers_andTheyExist() {
        for (rel in ADAPTIVE) {
            val xml = resText(rel)
            val markup = markupOnly(xml)
            val layers = listOf(
                "background" to "@drawable/ic_launcher_background",
                "foreground" to "@drawable/ic_launcher_foreground",
                "monochrome" to "@drawable/ic_launcher_monochrome",
            )
            for ((layer, ref) in layers) {
                assertTrue(
                    "$rel 里缺 <$layer android:drawable=\"$ref\" /> —— 自适应图标三层（含 Android 13+ 的 monochrome）",
                    Regex("<$layer\\s+android:drawable=\"${Regex.escape(ref)}\"").containsMatchIn(markup),
                )
            }
        }
    }

    @Test
    fun allLayers_areVectorsOnTheSameCanvas() {
        for (rel in LAYERS) {
            val xml = resText(rel)
            assertEquals("$rel 必须用 vector（不许是位图）", "vector", Regex("<([a-zA-Z-]+)").find(markupOnly(xml))!!.groupValues[1])
            assertEquals("$rel 的 viewport 宽度必须是画布 $CANVAS_TEXT", CANVAS_TEXT, attr(xml, "android:viewportWidth"))
            assertEquals("$rel 的 viewport 高度必须是画布 $CANVAS_TEXT", CANVAS_TEXT, attr(xml, "android:viewportHeight"))
            assertEquals("$rel 的 dp 尺寸必须是画布", "${CANVAS_TEXT}dp", attr(xml, "android:width"))
            assertEquals("$rel 的 dp 尺寸必须是画布", "${CANVAS_TEXT}dp", attr(xml, "android:height"))
            val paths = allAttrs(xml, "android:pathData")
            assertTrue("$rel 里没有任何 android:pathData", paths.isNotEmpty())
            assertTrue("$rel 里有空的 android:pathData", paths.all { it.length > 20 })
        }
        // minSdk 26 ⇒ 矢量足够，**不该**有 legacy 位图 mipmap（有的话是一份会过期的副本）
        val resDir = File(TestRepoFiles.moduleDir(), "src/main/res")
        val bitmapMipmaps = resDir.listFiles().orEmpty()
            .filter { it.isDirectory && it.name.startsWith("mipmap-") && it.name != MIPMAP_ANYDPI_DIR }
        assertEquals(
            "只应有 mipmap-anydpi-v26（minSdk 26 ⇒ 不需要 legacy 位图兜底）；多出来的目录："
                + bitmapMipmaps.joinToString { it.name },
            emptyList<String>(), bitmapMipmaps.map { it.name },
        )
    }

    // ─────────────────────────── 2. 硬约束：不许依赖字体 / fg 在保证可见区内 ───────────────────────────

    @Test
    fun layers_neverDependOnRuntimeFonts() {
        for (rel in LAYERS) {
            val markup = markupOnly(resText(rel))
            assertTrue(
                "$rel 里出现了文字/字体元素 —— 图标不得依赖运行时字体（Android 上没有微软雅黑这类字体，"
                    + "字形必须是自带轮廓；参照 prototype/icons/README.md 那条「必须传下去的工程约束」）",
                !Regex("<text|<tspan|font").containsMatchIn(markup),
            )
        }
    }

    @Test
    fun foreground_staysInsideTheGuaranteedVisibleArea() {
        val fg = resText(FG)
        val paths = allAttrs(fg, "android:pathData")
        assertTrue("前景层里没有 path", paths.isNotEmpty())
        val pts = paths.flatMap { pointsOf(it) }
        assertTrue("前景层没有任何坐标", pts.isNotEmpty())
        val minX = pts.minOf { it.first }
        val maxX = pts.maxOf { it.first }
        val minY = pts.minOf { it.second }
        val maxY = pts.maxOf { it.second }
        val worst = pts.maxOf { Math.hypot(it.first - CENTER, it.second - CENTER) }
        assertTrue(
            "前景层超出了系统保证可见的中心 72 方（$GUARANTEED_MIN…$GUARANTEED_MAX）："
                + "x $minX…$maxX / y $minY…$maxY（含 Q 控制点的保守外框）",
            minX >= GUARANTEED_MIN && maxX <= GUARANTEED_MAX && minY >= GUARANTEED_MIN && maxY <= GUARANTEED_MAX,
        )
        assertTrue(
            "前景层最远点 ${"%.3f".format(worst)} 超过了保证可见区的内切圆半径 $GUARANTEED_R"
                + "（注意：这里算的是**含控制点的保守外框**，比真实墨迹更严）",
            worst <= GUARANTEED_R,
        )
    }

    // ─────────────────────────── 3. 背景与单色层 ───────────────────────────

    @Test
    fun background_coversTheWholeCanvas_andMatchesTheWindowBackground() {
        val bgPath = attr(resText(BG), "android:pathData")
        val pts = pointsOf(bgPath)
        val minX = pts.minOf { it.first }
        val minY = pts.minOf { it.second }
        val maxX = pts.maxOf { it.first }
        val maxY = pts.maxOf { it.second }
        assertEquals("背景层必须**满幅**：左/上是 0", 0.0 to 0.0, minX to minY)
        assertEquals("背景层必须**满幅**：右/下是画布尺寸", CANVAS to CANVAS, maxX to maxY)

        val themes = resText("values/themes.xml")
        val windowBg = Regex("name=\"android:windowBackground\">([^<]+)<").find(themes)?.groupValues?.get(1)
            ?: throw AssertionError("themes.xml 里找不到 android:windowBackground")
        assertEquals(
            "图标背景色必须与窗口底色一致（否则启动时图标与会话窗口是两块不同的底色）："
                + "图标 ${attr(resText(BG), "android:fillColor")} vs windowBackground $windowBg",
            normalizeHexColor(windowBg), normalizeHexColor(attr(resText(BG), "android:fillColor")),
        )
    }

    @Test
    fun monochrome_isAPureAlphaSilhouetteOfTheForeground() {
        val mono = resText(MONO)
        val fg = resText(FG)
        val monoColors = allAttrs(mono, "android:fillColor").map(::normalizeHexColor)
        assertTrue("monochrome 层没有填充色", monoColors.isNotEmpty())
        assertEquals(
            "monochrome 层必须是**单色**（系统只取 alpha 再按主题取色重绘；多色在这里不携带信息）",
            1, monoColors.toSet().size,
        )
        assertEquals(
            "monochrome 的剪影必须与前景层**形状相同**（只是没有颜色差异）",
            allAttrs(fg, "android:pathData"), allAttrs(mono, "android:pathData"),
        )
    }

    // ─────────────────────────── 4. 两端同一份轮廓 ───────────────────────────

    @Test
    fun bothEnds_useTheSameOutline() {
        // 交付源与 Web 端共用同一份轮廓：web/icons/icon.svg 保留原型 SVG 的 transform（浏览器原生支持变换），
        // Android 侧是同一份轮廓**烘进坐标**的副本。这条门把两者逐点对一遍：
        // 形状漂了（比如有人只重生成了一端）就会立刻红，而不是等到「两端的图标长得不一样」被人看出来。
        val web = TestRepoFiles.read(
            "web/icons/icon.svg",
            "两端一致这条断言要读 Web 侧的同一份轮廓；读不到即失败（不跳过）。",
        )
        val transform = Regex("transform=\"([^\"]+)\"").find(web)?.groupValues?.get(1)
            ?: throw AssertionError("web/icons/icon.svg 里找不到字形轮廓的 transform")
        val t = Regex("translate\\(\\s*([-\\d.eE]+)\\s+([-\\d.eE]+)\\s*\\)").find(transform)!!
        val s = Regex("scale\\(\\s*([-\\d.eE]+)\\s+([-\\d.eE]+)\\s*\\)").find(transform)!!
        val tx = t.groupValues[1].toDouble()
        val ty = t.groupValues[2].toDouble()
        val sx = s.groupValues[1].toDouble()
        val sy = s.groupValues[2].toDouble()

        val webGlyph = Regex("transform=\"[^\"]+\"\\s+d=\"([^\"]+)\"").find(web)?.groupValues?.get(1)
            ?: throw AssertionError("web/icons/icon.svg 里找不到带 transform 的字形 path")

        // Android 侧取「字形」那条（填色 = 视觉令牌 text）；另一条是 accent 角标。
        val fgPaths = Regex("<path\\s+android:fillColor=\"([^\"]+)\"\\s+android:pathData=\"([^\"]+)\"")
            .findAll(resText(FG)).map { it.groupValues[1] to it.groupValues[2] }.toList()
        val androidGlyph = fgPaths.firstOrNull { it.first.equals("#dde5e4", ignoreCase = true) }?.second
            ?: throw AssertionError("前景层里找不到填色为 text(#dde5e4) 的字形路径：${fgPaths.map { it.first }}")

        val fromWeb = commands(webGlyph)
        val fromAndroid = commands(androidGlyph)
        assertEquals(
            "两端的命令序列必须一致（不同则形状已经漂了）",
            fromWeb.map { it.first }, fromAndroid.map { it.first },
        )
        var checked = 0
        for (i in fromWeb.indices) {
            val cmd = fromWeb[i].first
            val webArgs = fromWeb[i].second
            val androidArgs = fromAndroid[i].second
            assertEquals("命令 $cmd 的参数个数不一致（第 $i 条）", webArgs.size, androidArgs.size)
            for (j in webArgs.indices) {
                val expected = when {
                    cmd == 'H' -> tx + sx * webArgs[j]
                    cmd == 'V' -> ty + sy * webArgs[j]
                    j % 2 == 0 -> tx + sx * webArgs[j]
                    else -> ty + sy * webArgs[j]
                }
                assertEquals(
                    "第 $i 条命令 $cmd 的第 $j 个参数与 Web 侧轮廓经同一仿射后的结果不一致",
                    expected, androidArgs[j], 0.01,
                )
                checked++
            }
        }
        assertTrue("逐点比对至少要覆盖到几个坐标（实际 $checked）", checked > 200)
    }
}
