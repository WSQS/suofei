# 签名密钥：现在存在哪、怎么恢复、怎么确认恢复对了

> **边界**：本文只写**路径与步骤**。**任何密钥或口令的值都不得出现在本文、仓库、终端输出或会话里**。
> 来源：用户 2026-10-15 定「**先补一份『怎么从 secrets 恢复』的步骤文档**」；**是否再做一份真正独立的离线副本＝未决**（用户是**暂缓**，不是接受后果）。

## 1. 密钥现在存在两处（都不在仓库里）

| # | 位置 | 内容 | 用途 |
|---|---|---|---|
| 1 | 本机 `~/.suofei/suofei-release.jks` + `~/.suofei/store-password.txt` | 密钥库本体（PKCS12）与库口令 | 本机做正式签名/验签时 |
| 2 | 仓库 secrets 四项：`SUOFEI_KEYSTORE`、`SUOFEI_KEYSTORE_PASSWORD`、`SUOFEI_KEY_ALIAS`、`SUOFEI_KEY_PASSWORD` | 同上，供 CI | 每次发布由 CI 注入 |

三个必须记准的事实：

1. **`SUOFEI_KEYSTORE` 这个 secret 就是密钥本体**（base64 编码的 `.jks`），**不是路径**。CI 里是 `printf '%s' "$KS_B64" | base64 -d > "$RUNNER_TEMP/suofei-release.jks"`（见 `.github/workflows/release.yml`）。
2. **secrets 只写不可读**：GitHub 的界面与 API 都**看不到值**，也**下载不到**。所以「从 secrets 恢复」必须**自己写一个临时 workflow** 才能把本体取出来。
3. **两处不独立**：仓库访问权一失，两处同时不可用（同一个账号/组织）。这正是「要不要再做一份真正独立的离线副本」这个问题存在的理由。

## 2. 从 secrets 恢复密钥库

前提：对仓库有 admin 权限（能建/改 secrets 与 workflow）。

1. 加一个**临时** workflow（例如 `.github/workflows/__recover-key.yml`），只做一件事——把 base64 secret 解码后**作为 artifact 上传**：

   ```yaml
   name: __recover-key
   on: workflow_dispatch
   jobs:
     dump:
       runs-on: ubuntu-latest
       steps:
         - name: decode keystore into an artifact
           env:
             KS_B64: ${{ secrets.SUOFEI_KEYSTORE }}
           run: |
             set -euo pipefail
             mkdir -p out
             printf '%s' "$KS_B64" | base64 -d > out/suofei-release.jks
         - uses: actions/upload-artifact@v4
           with:
             name: suofei-keystore
             path: out/
   ```

2. 手动 **Run workflow** → 下载 artifact `suofei-keystore`。
   - **别用 `echo "$KS_B64"` 打印**：日志会被掩码，但掩码不是加密——artifact 才是干净通道。
3. 把解出来的 `suofei-release.jks` 放到目标机器（本机就是 `~/.suofei/`）。
4. **恢复完立刻删掉那个临时 workflow**（连同该次 run 的 artifact）。

口令与 alias 也在这四项 secret 里：要么用同样办法取（临时 workflow 写进 artifact），要么**从你自己的离线记录里取**（本机是 `~/.suofei/store-password.txt`）。

## 3. 怎么确认「恢复对了」（最关键的一步）

恢复出来却**签不对**的密钥比没有更糟：它能让包装上去，却**覆盖不了已发布版本**——Android 要求同一包名的升级包签名一致。

### 3.1 第一重：证书指纹逐字节等于已发布版本

```bash
# keytool 用本机任一 JDK 里的即可，例如 C:/Users/wsqsy/.jdks/ms-17.0.17/bin/keytool.exe
keytool -list -v -keystore <恢复出来的 .jks> -storepass:env <存放口令的环境变量名>
```

期望输出（**公开信息**，每个已发布的 APK 里都带着，可照抄）：

| 项 | 期望值 |
|---|---|
| Alias name | `suofei` |
| Owner | `CN=Suofei, OU=suofei, O=WSQS, C=CN` |
| 有效期 | `2026-10-14 23:01:46 CST` → `2054-03-01 23:01:46 CST` |
| **SHA256 证书指纹** | `13:46:44:4C:18:9A:A5:0A:A8:1B:76:EE:EB:28:FF:61:AE:B8:B9:B2:BA:97:2E:D7:7D:2F:D2:CA:74:BD:F3:45` |

### 3.2 第二重：端到端覆盖升级（真正的判据）

```bash
./release/build-release.mjs --android-variant release --offline   # 需要四项环境变量，见 ci-and-signing.md
apksigner verify --print-certs <产物.apk> | grep -i sha-256        # 必须等于上表那串
adb install -r <产物.apk>                                          # 在装过 v0.1.0 的设备上必须 Success（同签名覆盖）
```

（`apksigner` 的定位与用法见 `release/selftest-apksigner.mjs`。）

## 4. 残余风险（诚实写清）

1. **两处不独立**：本机与 secrets 依赖同一账号/组织；账号失权 ⇒ 两处同时不可用。
2. **丢钥即断升级**：密钥彻底丢失后**无法**用新密钥覆盖升级已装用户（换密钥＝老用户卸载重装），而项目**没有回退能力**。
3. **本文刻意不含任何密钥/口令值** ⇒ 它**不能**替代一份真正的独立备份。
4. **「是否再做真正独立的离线副本」＝未决**：台账见 `docs/interface-decisions.md` IF-14 与 `docs/review-gates.md` A4.4。

## 5. 别做的事

- 不把 `.jks`、口令、base64 串提交进仓库，也不贴进文档/日志/会话；
- 不在命令行里直接写口令（用 `-storepass:env`；本机做法见 `release/init-signing-key.sh`）；
- 不为省事退回 debug 签名——构建里有 fail-closed 闸（少了四项变量就停，绝不静默降级）。
