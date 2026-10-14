pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
        // 受限网络下（例如本机某代理到不了 dl.google.com / repo.maven.apache.org）可加一个镜像：
        //   ./gradlew -PextraMavenMirror=https://maven.aliyun.com/repository/public <task>
        // 默认不配置任何镜像，工程保持可移植。
        providers.gradleProperty("extraMavenMirror").orNull?.let { maven { url = uri(it) } }
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        providers.gradleProperty("extraMavenMirror").orNull?.let { maven { url = uri(it) } }
    }
}

rootProject.name = "PoetryCollection"
include(":app")
