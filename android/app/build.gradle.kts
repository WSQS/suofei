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
