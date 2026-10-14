# CI、签名与 secrets（索斐）

> 2026-10-14 起草。用户已拍板：**正式密钥放 GitHub Actions secrets，由 CI 签名**。
> 本文记录：正式签名需要什么、谁来做、本地怎么演练、**哪些已实测、哪些还没**。

## 一、正式签名需要什么

Android 要求：同一 `applicationId`（`dev.sopho.suofei`）的后续版本必须用**同一枚密钥**签名，否则系统拒绝覆盖安装，用户只能先卸载——而卸载会清掉应用私有目录，**已下载的内容快照会一起消失**（退回 APK 内置那一版）。

我们的构建从**环境变量**读四项（都在 `android/app/build.gradle.kts` 顶层声明）：

| 环境变量 | 含义 |
|---|---|
| `SUOFEI_KEYSTORE` | keystore 文件路径（CI 里是解码后的临时文件） |
| `SUOFEI_KEYSTORE_PASSWORD` | keystore 口令 |
| `SUOFEI_KEY_ALIAS` | 密钥别名（当前 `suofei`） |
| `SUOFEI_KEY_PASSWORD` | 该别名口令（PKCS12 下与 keystore 口令同值） |

**四项齐全**才配置 release 签名；**缺任何一项、并请求 release 产物时构建 fail-closed 明确失败**——绝不悄悄退回 debug 签名（那样产出的包会被误当成正式包，而这种错发出去收不回）。

## 二、这四项怎么来的（已做过，可复跑）

脚本：`release/init-signing-key.sh`（可读、可复跑、不含任何密钥材料）。

它做四件事：

1. 在**仓库之外**（默认 `~/.suofei/`）生成 `suofei-release.jks`（RSA 4096、有效期 10000 天）与口令文件；
2. 口令经 `keytool -storepass:env` 传递 ⇒ **不进命令行参数**；
3. 用管道把四项写进仓库 secrets（`base64 -keystore | gh secret set …`）⇒ **不打印任何密钥值**；
4. 删除/覆盖都要显式 `--force`（密钥一旦用于发布就不能换）。

已写入 `WSQS/suofei` 的 secrets（**只有名字是公开信息**）：

```
SUOFEI_KEYSTORE
SUOFEI_KEYSTORE_PASSWORD
SUOFEI_KEY_ALIAS
SUOFEI_KEY_PASSWORD
```

> ⚠️ **必须离线备份** `~/.suofei/suofei-release.jks` 与 `~/.suofei/store-password.txt`。丢了 = 已装用户永远无法升级。
> 它们**不在仓库里**，也**不该**出现在任何聊天/截图里。

## 三、已验证 / 未验证（诚实边界）

| 环节 | 状态 |
|---|---|
| 无签名变量时 release 构建 fail-closed | **已实测**（明确失败 + 指引） |
| debug 构建不受影响 | **已实测**（`assembleDebug` 成功） |
| **带正式密钥的 `assembleRelease`** | **已实测**：BUILD SUCCESSFUL，产出 `app-release.apk`（7,029,170 字节） |
| **签名证书正确** | **已实测**：`apksigner verify --print-certs` → `CN=Suofei, OU=suofei, O=WSQS, C=CN`（**不是** `CN=Android Debug`） |
| 仓库 secrets 写入 | **已实测**（`gh secret list` 见到四个名字） |
| **CI 上由 secrets 注入并签名** | **未验证**（工作流尚未跑过；CI 环境的 JDK/SDK/Chromium/依赖下载都未验证） |
| 覆盖升级（装 v1 再装 v2） | **未验证**（需要两台真机版本，且从未在设备上装过） |

## 四、本地演练（可选，用同一枚密钥）

```bash
export JAVA_HOME="C:/Users/<你>/.jdks/ms-17.0.17"
export SUOFEI_KEYSTORE="$HOME/.suofei/suofei-release.jks"
export SUOFEI_KEYSTORE_PASSWORD="$(cat "$HOME/.suofei/store-password.txt")"
export SUOFEI_KEY_ALIAS="suofei"
export SUOFEI_KEY_PASSWORD="$SUOFEI_KEYSTORE_PASSWORD"
cd android && ./gradlew assembleRelease
"$ANDROID_HOME/build-tools/36.0.0/apksigner.bat" verify --print-certs app/build/outputs/apk/release/app-release.apk
```

（命令里只有 `$(cat 文件)`，没有明文口令。）

## 五、还没做的

- CI 工作流本身（tag → 签名构建 → 发 Release；master → 部署 Pages）：待发布线把 `--android-variant release` 落地后再写，且**第一次跑 CI 一定会需要迭代**（Chromium 路径、Gradle 是否离线、依赖镜像这些都是 CI 侧新环境）。
- 覆盖升级验证（装旧版再装新版）：需要设备，属真机验收的一部分。
