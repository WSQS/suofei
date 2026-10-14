package dev.sopho.suofei.data

/**
 * 应用内读取内容的**唯一入口**（接口决定，见 docs/design/android-offline-update.md 第 3 节）。
 *
 * 优先级与降级：
 * 1. 先试已安装并生效的版本（`filesDir/content/`，见 [ContentStore]）；
 * 2. 读不到（没装过 / 指针坏了 / 文件损坏 / JSON 非法 / 结构版本过新）→ 退回 **APK 内置 assets**；
 * 3. 内置内容也坏 → 抛 [ContentParseException]，UI 如实报错（不伪造内容）。
 *
 * 内置 assets 永远存在且只读，所以「首次断网也能读」不依赖任何网络步骤。
 *
 * 为了能在 JVM 单元测试里真跑降级路径，构造器不直接吃 Context，而是吃一个「内置内容读取器」。
 */
class ContentRepository(
    val store: ContentStore,
    private val readBundledJson: () -> String,
    private val bundledLocation: String,
) {

    constructor(context: android.content.Context, store: ContentStore, assetPath: String = ASSET_PATH) : this(
        store = store,
        readBundledJson = {
            context.applicationContext.assets.open(assetPath).use { it.readBytes().toString(Charsets.UTF_8) }
        },
        bundledLocation = "assets/$assetPath",
    )

    /** 读取当前生效内容；已安装版本不可用时静默退回内置（退回原因见 [installedContentBroken]）。 */
    fun load(): LoadedContent = store.loadActive() ?: bundled()

    /** APK 内置内容（assets）。 */
    fun bundled(): LoadedContent = LoadedContent(
        content = ContentParser.parse(readBundledJson()),
        origin = ContentOrigin.BUNDLED_ASSET,
        location = bundledLocation,
    )

    /** 指针指着一个已安装版本，但它读不出来（损坏/结构过新）—— 即本次读的是内置内容。 */
    fun installedContentBroken(): Boolean =
        store.activeVersion() != null && store.loadActive() == null

    companion object {
        /** assets 里的内置内容路径。替换成 A/C 线真实产物时只改这个（和文件本身）。 */
        const val ASSET_PATH = "content/content.json"
    }
}
