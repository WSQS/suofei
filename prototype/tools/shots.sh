#!/usr/bin/env bash
# 重新生成 prototype/screenshots/ 下的全部评审截图。
# 用法： 在 prototype/ 下执行  bash tools/shots.sh
# 依赖：本机真 Chromium；CHROME_BIN 未设时默认取 %LOCALAPPDATA%\Chromium\Application\chrome.exe
set -u
export CHROME_BIN="${CHROME_BIN:-C:/Users/wsqsy/AppData/Local/Chromium/Application/chrome.exe}"
cd "$(dirname "$0")/.." || exit 1

DUAN='index.html?theme=%s#/p/cao-cao-duan-ge-xing'     # 短歌行：多段、有异文、无笔记
XING='index.html?theme=%s#/p/gushi-shijiu-shou-xingxing-zhong-xingxing' # 行行重行行：带长测试笔记

# 1) 手机竖屏（430x932 @2x）：三个方向各一张首屏 + 一张诗页
for t in paper clean tech; do
  node tools/shot.mjs --out "screenshots/mobile-hub-$t.png"  --url "index.html?theme=$t#/"        --w 430 --h 932 --dpr 2
  node tools/shot.mjs --out "screenshots/mobile-poem-$t.png" --url "$(printf "$DUAN" "$t")"       --w 430 --h 932 --dpr 2
done

# 2) 整页（看完整分行/分节/空行 + 空笔记状态 + 异文 + 来源）
for t in paper clean tech; do
  node tools/shot.mjs --out "screenshots/full-poem-$t.png" --url "$(printf "$DUAN" "$t")" --w 430 --h 932 --dpr 2 --full 1
done

# 3) 笔记的折叠 / 展开（同一首诗，长测试笔记）
node tools/shot.mjs --out screenshots/full-note-collapsed-paper.png --url "$(printf "$XING" paper)" \
  --w 430 --h 932 --dpr 2 --full 1
node tools/shot.mjs --out screenshots/full-note-expanded-paper.png --url "$(printf "$XING" paper)" \
  --w 430 --h 932 --dpr 2 --full 1 --setup "document.querySelector('.notes-head').click()"

# 4) 组内诗目 与 跨组搜索
node tools/shot.mjs --out screenshots/mobile-group-paper.png --url 'index.html?theme=paper#/g/han' \
  --w 430 --h 932 --dpr 2 --full 1
node tools/shot.mjs --out screenshots/mobile-search-paper.png --url 'index.html?theme=paper#/' \
  --w 430 --h 932 --dpr 2 --full 1 \
  --setup "var i=document.getElementById('q');i.value='佚名';i.dispatchEvent(new Event('input',{bubbles:true}));"

# 5) 桌面宽度（Web 端观感）
for t in paper clean tech; do
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
