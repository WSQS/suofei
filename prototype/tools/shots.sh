#!/usr/bin/env bash
# 重新生成 prototype/screenshots/ 下的**已采纳方向（静默终端）**评审截图。
# ⚠ 另两个方向（宣纸/清爽）已被取代，其截图已移到 items/app-ui/history/ —— 本脚本**不再重生成它们**
#   （要重生成得先把它们搬回来；历史材料按「保留、标注」处理）。
# 用法： 在 prototype/ 下执行  bash tools/shots.sh
# 依赖：本机真 Chromium；CHROME_BIN 未设时默认取 %LOCALAPPDATA%\Chromium\Application\chrome.exe
set -u
export CHROME_BIN="${CHROME_BIN:-C:/Users/wsqsy/AppData/Local/Chromium/Application/chrome.exe}"
cd "$(dirname "$0")/.." || exit 1

DUAN='index.html?theme=%s#/p/cao-cao-duan-ge-xing'     # 短歌行：多段、有异文、无笔记
XING='index.html?theme=%s#/p/gushi-shijiu-shou-xingxing-zhong-xingxing' # 行行重行行：带长测试笔记

# 1) 手机竖屏（430x932 @2x）：三个方向各一张首屏 + 一张诗页
for t in tech; do
  node tools/shot.mjs --out "screenshots/mobile-hub-$t.png"  --url "index.html?theme=$t#/"        --w 430 --h 932 --dpr 2
  node tools/shot.mjs --out "screenshots/mobile-poem-$t.png" --url "$(printf "$DUAN" "$t")"       --w 430 --h 932 --dpr 2
done

# 2) 整页（看完整分行/分节/空行 + 空笔记状态 + 异文 + 来源）
for t in tech; do
  node tools/shot.mjs --out "screenshots/full-poem-$t.png" --url "$(printf "$DUAN" "$t")" --w 430 --h 932 --dpr 2 --full 1
done

# 3) 笔记的折叠 / 展开（同一首诗，长测试笔记）
# （原来这里生成 paper 方向的笔记折叠/展开两图；那两张已随方向被取代而移入 history/，不再重生成）

# 4) 组内诗目 与 跨组搜索
# （原来这里生成 paper 方向的组内诗目与跨组搜索两图；同样已移入 history/，不再重生成）

# 5) 桌面宽度（Web 端观感）
for t in tech; do
  node tools/shot.mjs --out "screenshots/desktop-hub-$t.png"  --url "index.html?theme=$t#/"  --w 1280 --h 860 --dpr 2
  node tools/shot.mjs --out "screenshots/desktop-poem-$t.png" --url "$(printf "$DUAN" "$t")" --w 1280 --h 860 --dpr 2
done

# 6) 数据来源自检：file://（双击，必回退 fixture）与 http（外部 JSON 分支）
node tools/shot.mjs --out screenshots/verify-01-file-protocol.png \
  --url 'index.html?theme=clean#/p/gushi-shijiu-shou-xingxing-zhong-xingxing' --w 430 --h 932 --dpr 2 --full 1
node tools/serve.mjs 8137 >/dev/null 2>&1 &
SRV=$!
sleep 1.2
node tools/shot.mjs --out screenshots/verify-02-http-fallback.png \
  --url 'http://127.0.0.1:8137/index.html?theme=paper#/' --w 430 --h 932 --dpr 2
node tools/shot.mjs --out screenshots/verify-03-http-dist-json.png \
  --url 'http://127.0.0.1:8137/index.html?theme=paper&dist=data/sample-content.json#/' --w 430 --h 932 --dpr 2
kill $SRV 2>/dev/null
