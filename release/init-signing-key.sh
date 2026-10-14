#!/usr/bin/env bash
# 生成「索斐」正式签名密钥，并把四项写入 GitHub 仓库 secrets。
#
# 设计要点（都是刻意的）：
#   1. 密钥与口令都落在**仓库之外**（默认 ~/.suofei/），绝不进 git、绝不进产物目录；
#   2. 口令用 keytool 的 `-storepass:env` 传递 ⇒ **不出现在命令行参数里**（不进进程列表）；
#   3. 写入 secrets 时用管道/重定向 ⇒ **不打印任何密钥值**；
#   4. 默认**拒绝覆盖**已存在的密钥（密钥一旦用于发布，换了就等于换应用）；
#   5. 本脚本可被人阅读、可被重复执行；它**不含**任何密钥材料。
#
# 用法：
#   bash release/init-signing-key.sh                    # 生成 + 写 secrets（仓库默认 WSQS/suofei）
#   bash release/init-signing-key.sh --repo WSQS/suofei
#   bash release/init-signing-key.sh --dir /d/keys       # 换密钥存放目录
#   bash release/init-signing-key.sh --force             # 覆盖已有密钥（危险，需自己想清楚）
#   bash release/init-signing-key.sh --no-secrets        # 只生成密钥，不碰 GitHub
#
# 生成后你会得到（示例路径）：
#   ~/.suofei/suofei-release.jks      正式签名密钥（**必须离线备份！丢了就无法给已装用户升级**）
#   ~/.suofei/store-password.txt      口令（同样必须备份，别放仓库、别发聊天）
set -euo pipefail

REPO_DEFAULT="WSQS/suofei"
KEYDIR_DEFAULT="${HOME}/.suofei"
ALIAS="suofei"

REPO="$REPO_DEFAULT"
KEYDIR="$KEYDIR_DEFAULT"
FORCE=0
PUSH_SECRETS=1

while [ $# -gt 0 ]; do
  case "$1" in
    --repo) REPO="$2"; shift 2 ;;
    --dir) KEYDIR="$2"; shift 2 ;;
    --force) FORCE=1; shift ;;
    --no-secrets) PUSH_SECRETS=0; shift ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "未知参数：$1" >&2; exit 2 ;;
  esac
done

# keytool 来自 JDK；本机 java 不在 PATH，所以优先用 JAVA_HOME。
if [ -n "${JAVA_HOME:-}" ] && [ -x "${JAVA_HOME}/bin/keytool" ]; then
  KEYTOOL="${JAVA_HOME}/bin/keytool"
elif command -v keytool >/dev/null 2>&1; then
  KEYTOOL="$(command -v keytool)"
else
  echo "找不到 keytool：请设置 JAVA_HOME（本机通常在 C:/Users/<你>/.jdks/ms-17.*）" >&2
  exit 1
fi

KEYSTORE="${KEYDIR}/suofei-release.jks"
PW_FILE="${KEYDIR}/store-password.txt"

mkdir -p "$KEYDIR"

if [ -f "$KEYSTORE" ] && [ "$FORCE" -ne 1 ]; then
  echo "已存在密钥：$KEYSTORE" >&2
  echo "  密钥一旦用于发布就不能更换（换了已装用户只能卸载重装）。" >&2
  echo "  确实要覆盖请显式加 --force。" >&2
  exit 1
fi

# ── 1. 生成口令（只用一次、只写文件；终端不打印）──────────────────
if [ -f "$PW_FILE" ] && [ "$FORCE" -ne 1 ]; then
  echo "已存在口令文件：$PW_FILE（继续复用它）" >&2
else
  # 32 字符、去掉 shell 里需要转义的字符。
  # 用 cut 而不是 head：head 会提前关管道，在 pipefail 下 openssl 收到 SIGPIPE 会让整条管道失败。
  umask 077
  openssl rand -base64 96 | tr -dc 'A-Za-z0-9' | cut -c1-32 > "$PW_FILE"
  chmod 600 "$PW_FILE" 2>/dev/null || true
  echo "已生成口令 → $PW_FILE（**请离线备份**）"
fi

# ── 2. 生成密钥（口令经 :env 传递，不进 argv）──────────────────────
export SUOFEI_PW
SUOFEI_PW="$(cat "$PW_FILE")"

KEYDIR_WIN="$KEYDIR"
if command -v cygpath >/dev/null 2>&1; then
  KEYDIR_WIN="$(cygpath -w "$KEYDIR")"
fi
KEYSTORE_WIN="${KEYDIR_WIN}\\suofei-release.jks"

if [ ! -f "$KEYSTORE" ] || [ "$FORCE" -eq 1 ]; then
  "$KEYTOOL" -genkeypair \
    -keystore "$KEYSTORE_WIN" \
    -storetype PKCS12 \
    -alias "$ALIAS" \
    -keyalg RSA -keysize 4096 -validity 10000 \
    -dname "CN=Suofei, OU=suofei, O=WSQS, C=CN" \
    -storepass:env SUOFEI_PW -keypass:env SUOFEI_PW
  echo "已生成签名密钥 → $KEYSTORE"
fi

# ── 3. 核对密钥确实可用、并打印证书信息（证书信息是公开信息，不是秘密）──
echo "--- 密钥自检（证书 DN / 有效期）---"
"$KEYTOOL" -list -v -keystore "$KEYSTORE_WIN" -storepass:env SUOFEI_PW 2>/dev/null \
  | grep -E "^别名|^Alias|有效期|Valid from|所有者|Owner" | head -6

# ── 4. 写入 GitHub secrets（值经管道，不打印）──────────────────────
if [ "$PUSH_SECRETS" -eq 1 ]; then
  if ! command -v base64 >/dev/null 2>&1; then
    echo "找不到 base64，无法编码密钥；用 --no-secrets 先只生成密钥。" >&2
    exit 1
  fi
  echo "--- 写入 $REPO 的四个 secrets（值不打印）---"
  base64 -w0 "$KEYSTORE" | gh secret set SUOFEI_KEYSTORE -R "$REPO"
  gh secret set SUOFEI_KEYSTORE_PASSWORD -R "$REPO" < "$PW_FILE"
  gh secret set SUOFEI_KEY_PASSWORD -R "$REPO" < "$PW_FILE"
  printf '%s' "$ALIAS" | gh secret set SUOFEI_KEY_ALIAS -R "$REPO"
  echo "--- 现有 secrets（只有名字）---"
  gh secret list -R "$REPO"
fi

cat <<EOF

完成。请立刻做两件事，否则将来会付出真实代价：
  1) **离线备份**这两个文件（它们丢了，已装用户就永远无法覆盖升级）：
       $KEYSTORE
       $PW_FILE
  2) 不要把它们放进仓库、不要发进聊天；仓库里只需有那四个 secrets 的名字。

本地用这枚密钥跑一次正式签名（可选；命令里不含明文口令）：
  export JAVA_HOME=".../ms-17.0.17"
  export SUOFEI_KEYSTORE="$KEYSTORE"
  export SUOFEI_KEYSTORE_PASSWORD="\$(cat "$PW_FILE")"
  export SUOFEI_KEY_ALIAS="$ALIAS"
  export SUOFEI_KEY_PASSWORD="\$(cat "$PW_FILE")"
  cd android && ./gradlew assembleRelease
EOF
