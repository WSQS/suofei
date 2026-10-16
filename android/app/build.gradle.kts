import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

// ── 正式签名（发布用）─────────────────────────────────────────────────
// 约定见 docs/design/ci-and-signing.md：四项全部从环境变量读，**缺任何一项就让 release 构建明确失败**——
// 绝不悄悄退回 debug 签名（那样产出的 APK 会被误当成正式包，而这种错发出去就收不回）。
// 本地开发与验收一律用 assembleDebug（debug 签名），不受影响。
// ⚠️ 这几个值必须在**顶层**声明：android{} 里要用，下面的 taskGraph 守卫也要用。
val suofeiKeystore = System.getenv("SUOFEI_KEYSTORE")
val suofeiKeystorePassword = System.getenv("SUOFEI_KEYSTORE_PASSWORD")
val suofeiKeyAlias = System.getenv("SUOFEI_KEY_ALIAS")
val suofeiKeyPassword = System.getenv("SUOFEI_KEY_PASSWORD")
val suofeiSigningReady =
    listOf(suofeiKeystore, suofeiKeystorePassword, suofeiKeyAlias, suofeiKeyPassword)
        .all { !it.isNullOrBlank() }

android {
    namespace = "dev.sopho.suofei"
    compileSdk = 36

    defaultConfig {
        applicationId = "dev.sopho.suofei"
        minSdk = 26
        targetSdk = 36
        // 应用/资源版本，与内容版本（content.json 的 contentVersion）完全分开，不共用一个号。
        versionCode = 2
        versionName = "0.1.1"
    }

    // ── 正式签名（发布用）——四项环境变量见文件顶部注释 ──
    signingConfigs {
        if (suofeiSigningReady) {
            create("release") {
                storeFile = file(suofeiKeystore!!)
                storePassword = suofeiKeystorePassword
                keyAlias = suofeiKeyAlias
                keyPassword = suofeiKeyPassword
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            if (suofeiSigningReady) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

// fail-closed：想要 release 产物但没有正式签名环境变量 ⇒ 构建前就失败，并说清怎么办。
// 放在 taskGraph 阶段（而不是配置阶段），这样 assembleDebug / testDebugUnitTest 完全不受影响。
gradle.taskGraph.whenReady {
    val wantsSignedRelease = allTasks.any {
        val n = it.name
        (n.startsWith("assemble") || n.startsWith("bundle") || n.startsWith("package")) && n.contains("Release")
    }
    if (wantsSignedRelease && !suofeiSigningReady) {
        throw GradleException(
            """缺少正式签名所需的环境变量，已按约定停止（fail-closed）。
               |  需要：SUOFEI_KEYSTORE / SUOFEI_KEYSTORE_PASSWORD / SUOFEI_KEY_ALIAS / SUOFEI_KEY_PASSWORD
               |  本地怎么走：① 只想开发和验收 ⇒ 用 ./gradlew assembleDebug（debug 签名）；
               |              ② 想验证正式签名链路 ⇒ 按 docs/design/ci-and-signing.md 的「一次性测试密钥演练」；
               |              ③ 真发布 ⇒ 由 CI 从仓库 secrets 注入这四项（见同一文档）。
               |  绝不退回 debug 签名：那样产出的 APK 会被误当成正式包。""".trimMargin(),
        )
    }
}

// ── 单测的「仓库文件」输入声明 ────────────────────────────────────────────
// 这些单测在**运行期读仓库文件**（`TestRepoFiles` 那一套）：`web/about-fields.json`、
// `schema/unknown-authors.json`、`items/content-format/prototypes/rules-v4/json/`、`content/poems/**`，
// 还有**用相对路径读**的内置产物 `app/src/main/assets/content/content.json`。
// Gradle 看不到这些读取 ⇒ 文件一变，`testDebugUnitTest` 仍可能 `FROM-CACHE` **回放旧结果**：
// 实测（2026-10-16）`web/about-fields.json` 已改成 4 项、单测必红，裸 `./gradlew testDebugUnitTest
// --offline` 却照样 `BUILD SUCCESSFUL`（结果从 build cache 回放的旧绿）。所以这里把它们显式声明为
// 输入，改这些文件时让测试**真的重跑**；不改变任何构建产物（只影响缓存/最新性判定，方向是更保守）。
val repoRootDir = rootProject.projectDir.parentFile
run {
    val repoInputs = listOf(
        "web/about-fields.json",
        "schema/unknown-authors.json",
        "items/content-format/prototypes/rules-v4/json",
        "content/poems",
    )
    tasks.withType<Test>().configureEach {
        repoInputs.forEach { rel ->
            val f = File(repoRootDir, rel)
            val prop = "repoInput-" + rel.replace('/', '-')
            if (f.isDirectory) inputs.dir(f).withPropertyName(prop).optional()
            else inputs.file(f).withPropertyName(prop).optional()
        }
        // 用相对路径（cwd＝模块目录）读的内置产物 —— 不在 unit test 的 classpath 上，所以也得声明。
        inputs.dir(File(projectDir, "src/main/assets/content"))
            .withPropertyName("bundledContent").optional()
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.foundation)
    implementation(libs.androidx.material3)

    testImplementation(libs.junit)
    // Android 运行时用平台自带的 org.json；JVM 单测需要一个真实实现，
    // 否则 mockable android.jar 里的 org.json 会抛 "not mocked"。
    testImplementation(libs.orgjson)
}
