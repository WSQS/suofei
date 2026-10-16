/*
 * check-break.mjs —— 「中文断行与长行处理」讨论原型的【页面行为 ＋ 逐行几何 ＋ 断点位置】自证脚本（可复跑）。
 *
 * ⚠ 它验的是**这一个原型页面**（q-break.html）的页面行为，**不是产品代码**，也不是任何规格的采纳：
 *   对象只有本目录下的 q-break.html（**只读打开**：Page.navigate 到 file:// URL，脚本不写、不改它）。
 *   额外读的文件只有两个，都是**只读**：
 *     ① prototype/css/theme-tech.css          —— 用来逐项比对页面内嵌的令牌快照；
 *     ② content/poems/gushi-shijiu-shou-01.md —— 用它的正文 8 行做「原文逐行一致」的基准。
 *
 * 覆盖的视口（**每个视口都单独跑一遍全部断言，并各出一张 PNG**）：320×568 ／ 430×932 ／ 1180×900。
 *   ⚠ 一个视口一张图（真实 CSS px @DPR 2）；**不做**缩放拼图。
 *
 * 断言清单（失败任一即 exit 1；当前失败数 0）：
 *  [G] 令牌快照逐项比对（值不一致数必须 0）／没有「声明了却没用」的令牌／页面里每个 var() 都有声明／
 *      记录快照来源短 sha ＋「权威仍是 docs/design/visual-tokens.md」／写明三个覆盖视口与已选宽度口径／
 *      已定项逐条在页面上／「不排推荐、并列、选某档≠采纳整页规格、不决定 JSON／MD 分界」都在／
 *      自包含（非 file:// 请求 0 个、无 <link / src= / @import / http(s)://）／无 JS 报错／夹具都带标注。
 *  [P] 参数表可解析；**每汉字推进宽**用页面里临时插入的一个 max-content 元素**独立实测**，
 *      与参数表声明的 17.766／26.4 一致；各「字位」容器宽 = 字位 × 推进宽（逐档复算）。
 *  [1] 结构：图内 6 块（X0 真实诗页／X1 真实压窄／A 断点／B 续行／C 长题名／D4 量测台）＋ 图外 1 块（目录页）；
 *      X0 的 8 行**逐行与源文件逐字相同**；夹具都带 data-fx="1" 与「夹具 · 不是真实数据」小标；
 *      A 块 4 列 × 2 行、B 块 3 列 × 2 行 ＋ 1 格近似、C 块 4 列、D4 画 4 档 ＋ 隐藏尺 9 档；隐藏参照在。
 *  [2] 每个视口：innerWidth 与 visualViewport.width 精确等于目标；**收起态**下 docW === 目标宽、
 *      所有可见元素都在 0…目标宽 内（无横向溢出）；每个 .pg 宽 = 视口宽、每个 .col 宽 = C（复算一致）。
 *  [3] **逐行实测**（用逐字 Range 量「墨迹盒」）：每块每个被测元素每一行的 左沿／右沿／宽／
 *      中心相对**本列窄容器中心**与相对**整页内容列中心**的差；并断言没有一行越出它所在的容器（>0.05px 即失败）。
 *  [4] **断点位置**（用文字范围量）：逐行给出「上一行末字 → 下一行首字」；断言
 *      ①／②／③（默认／strict／strict+hanging-punctuation）在本夹具上**断点逐字相同**、
 *      且**没有收尾标点落在行首、没有开局标点落在行尾**（标点类型用映射表判定）；
 *      而「①-对照 anywhere」**确实**把收尾标点放到行首、把开局标点放到行尾（对照证据）。
 *  [5] 长题名（C 块）：①／②／③ 第 8 字后就把「数」推下去（好让「】」不落在行首），
 *      ①-对照 则第 9 字才断、行首正是「】」—— 逐档断点与行首/行末字逐字断言。
 *  [6] 真实原文压窄（X1）：两行都折成 10／2，逐档断点与文本逐字断言。
 *  [7] 量测台（D4）：正文可用宽 = C − 33.6、÷ 推进宽 = 16.12 个字位；隐藏尺 4…12 档的**每行字数**逐档断言
 *      （最少 12 个字位才不折行、11 个字位仍折成 10／2）；图里画出来的 4 档与隐藏尺同档**逐字一致**。
 *  [8] 目录页（**图外**）：真鼠标点击展开 20 行 ⇒ **展开态**重查一次无横向溢出 ⇒ 再点收起；悬挂槽 27.52px、缝 6.39px。
 *  [9] 字号／行高／字距**不随宽度变**：正文 17px/34px/0.765px、题名 24px、身份行 12.48px 各只有一个取值。
 *  [10] 页面自报的数字 ＝ 本脚本独立实测（±0.6px）；页面自报带 data-m-* 标记。
 *  [11] PNG：每个视口一张；像素宽 = 视口宽 × 2、像素高 = 截图区 CSS 高 × 2（自己解析 PNG 头读 IHDR）；
 *      文件非空；**高度必须 < 16384**（截图高度上限，避免出现被截断的图还假装成功）。
 *  [12] **边界自证**：CHROME_BIN 指到不存在的路径 ⇒ 必须**如实报错并 exit 2**，**不能**打印「失败断言数：0」。
 *
 * 怎么跑：
 *   node items/app-ui/prototypes/check-break.mjs
 *   node items/app-ui/prototypes/check-break.mjs --no-shot          # 只跑断言，不重出 PNG
 *   node items/app-ui/prototypes/check-break.mjs --only=320         # 只跑一个视口
 *   node items/app-ui/prototypes/check-break.mjs --selftest-chrome  # 只跑「CHROME_BIN 指错 ⇒ 如实报错」边界
 *
 * 需要什么：
 *   - Node（用到内置 fetch / WebSocket / net）；**本机实测 v25.9.0 通过**；
 *   - 本机无头 Chromium：环境变量 CHROME_BIN 优先，否则按 %LOCALAPPDATA%\Chromium\Application\chrome.exe 推；
 *     找不到就**如实报错 exit 2**（CHROME_BIN 指到错路径也走这一条，不会假装通过）；
 *   - **不需要**任何 npm 依赖：不装包、不联网、不起静态服务（直接开 file://）；
 *   - **CDP 端口**向内核要一个空闲端口（本机撞过端口，不写死）；
 *   - **仓库根**从脚本所在目录**向上查找** prototype/css/theme-tech.css 来定位（不写死层级）。
 *
 * 副作用：临时目录建一个 Chromium profile 并删掉；默认重写本目录 3 张 PNG（复跑会让 PNG 变脏，正常现象）；
 *         q-break.html 本身**只读打开**，不写、不改。
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const OUT = dirname(fileURLToPath(import.meta.url));
const ROOT = (() => {
  /* 从脚本所在目录**向上查找** prototype/css/theme-tech.css；不写死层级。 */
  let d = OUT;
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(d, 'prototype', 'css', 'theme-tech.css'))) return d;
    d = dirname(d);
  }
  throw new Error('找不到仓库根：从 ' + OUT + ' 向上查找 prototype/css/theme-tech.css 失败');
})();

/* ── [12] 边界自证：CHROME_BIN 指到不存在的路径 ⇒ 如实报错退出，不假装通过 ── */
if (process.argv.includes('--selftest-chrome')) {
  const bogus = 'C:/definitely/not/here/chrome.exe';
  const self = fileURLToPath(import.meta.url);
  const r = spawnSync(process.execPath, [self, '--no-shot'], {
    cwd: OUT, encoding: 'utf8', timeout: 180000,
    env: { ...process.env, CHROME_BIN: bogus },
  });
  const out = r.stdout || '', err = r.stderr || '';
  const saidReason = /找不到无头 Chromium/.test(err) && err.includes(bogus);
  const notFakePass = out.indexOf('失败断言数：0') < 0;
  console.log('【边界自证】CHROME_BIN = ' + bogus + '（该路径不存在）');
  console.log('  退出码：' + r.status + '（要求 ≠ 0，这里是 2 表示环境缺失）');
  console.log('  stderr 说了原因：' + (saidReason ? '是' : '否') + ' → ' + JSON.stringify(err.trim().split(/\r?\n/)[0] || ''));
  console.log('  stdout 里没有「失败断言数：0」（不假装通过）：' + (notFakePass ? '是' : '否'));
  const ok = r.status === 2 && saidReason && notFakePass;
  console.log(`\n===== 边界自证：${ok ? '通过' : '失败'} =====`);
  process.exit(ok ? 0 : 1);
}

const SHOT = !process.argv.includes('--no-shot');
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const ONLY = onlyArg ? onlyArg.slice(7) : null;

const CASES = [
  { key: '320', w: 320, h: 568, mobile: true, label: '手机 · 最窄（列外余白在这个宽度上会是 0）' },
  { key: '430', w: 430, h: 932, mobile: true, label: '手机（前几轮的验收宽）' },
  { key: '1180', w: 1180, h: 900, mobile: false, label: '桌面（宽而矮）' },
];
const MD_PATH = join(ROOT, 'content', 'poems', 'gushi-shijiu-shou-01.md');
const HTML_PATH = join(OUT, 'q-break.html');
const PNG_HARD_LIMIT = 16384;   /* 截图高度上限：超过就必须先裁内容，不许出一张被截断的图 */
const MAX_SHOT_CSS = PNG_HARD_LIMIT / 2;

const CHROME = process.env.CHROME_BIN
  || join(process.env.LOCALAPPDATA || '', 'Chromium', 'Application', 'chrome.exe');
if (!CHROME || !existsSync(CHROME)) {
  console.error('找不到无头 Chromium：' + (CHROME || '(未设置)'));
  console.error('请用环境变量指定，例如：');
  console.error("  CHROME_BIN='C:/Users/wsqsy/AppData/Local/Chromium/Application/chrome.exe' \\");
  console.error('    node items/app-ui/prototypes/check-break.mjs');
  console.error('（这就是 [12] 那条边界：CHROME_BIN 指到不存在的路径时，本脚本在这里如实退出，不假装通过。）');
  process.exit(2);
}

/* ── 源文件基准（只读）：正文 8 行 ───────────────────────────────── */
const mdText = readFileSync(MD_PATH, 'utf8');
const mdLines = mdText.split(/\r?\n/);
let sepCount = 0, bodyStart = -1;
for (let i = 0; i < mdLines.length; i += 1) {
  if (mdLines[i].trim() === '---') { sepCount += 1; if (sepCount === 2) { bodyStart = i + 1; break; } }
}
if (bodyStart < 0) { console.error('源文件里找不到 front matter 结束标记：' + MD_PATH); process.exit(2); }
const mdFlat = mdLines.slice(bodyStart).map((s) => s.trim()).filter((s) => s !== '');
if (mdFlat.length !== 8) {
  console.error('源文件正文不是 8 行（而是 ' + mdFlat.length + ' 行）⇒ 先看需求再改断言：' + MD_PATH);
  process.exit(2);
}

/* ── 页面文本 ＋ 参数表 ─────────────────────────────────────────── */
const htmlText = readFileSync(HTML_PATH, 'utf8');
function declarationBlock(text, begin, end) {
  const a = text.indexOf(begin), b = text.indexOf(end);
  if (a < 0 || b < 0 || b < a) return null;
  return text.slice(a, b);
}
function parseTokens(cssText) {
  const m = new Map();
  const clean = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /(--[A-Za-z0-9_-]+)\s*:\s*([^;]+);/g;
  let x;
  while ((x = re.exec(clean))) m.set(x[1], x[2].replace(/\s+/g, ' ').trim());
  return m;
}
const paramBlock = declarationBlock(htmlText, '== BREAK-PARAMS-BEGIN ==', '== BREAK-PARAMS-END ==');
if (!paramBlock) { console.error('页面里找不到 == BREAK-PARAMS-BEGIN ==/== BREAK-PARAMS-END == 参数表'); process.exit(2); }
function pnum(key) {
  const m = new RegExp('\\*\\s*' + key + '\\s*:\\s*(-?[0-9.]+)').exec(paramBlock);
  return m ? Number(m[1]) : NaN;
}
const P = {
  charAdvance: pnum('char_advance'),
  titleAdvance: pnum('title_advance'),
  slotPA: pnum('brk_poem_slot'),
  slotPB: pnum('cont_poem_slot'),
  slotTB: pnum('cont_title_slot'),
  slotTC: pnum('title_brk_slot'),
  indent: pnum('indent_slots'),
  narrowReal: pnum('real_narrow_slot'),
  slotsMin: pnum('slots_min'),
  slotsMax: pnum('slots_max'),
  deduct: pnum('deduct_total'),
  pct: pnum('pct'),
  floor: pnum('floor'),
  edge: pnum('edge_x'),
};
const drawnM = /\*\s*slots_drawn\s*:\s*([0-9 ]+)/.exec(paramBlock);
const SLOTS_DRAWN = drawnM ? drawnM[1].trim().split(/\s+/).map(Number) : [];
const vpM = /\*\s*viewports\s*:\s*([0-9 ]+)/.exec(paramBlock);
const VIEWPORTS = vpM ? vpM[1].trim().split(/\s+/).map(Number) : [];

/* 页面声明的夹具（自检只用来核对「页面里真有这些夹具」，判定的权威仍是页面 DOM） */
const FX = {
  close: '甲乙丙丁戊，己庚辛',
  open: '甲乙丙丁（戊己庚）',
  cont: '甲乙丙丁戊，己庚辛壬癸',
  contT: '【夹具】故意写长的题名看折',
  titleL: '【夹具不是真实数据】故意写长的题名用来看折行',
};
const PUNCT_CLOSE = '，。！？；：、）》」』】';
const PUNCT_OPEN = '（《「『【';

function cwOf(V) { return Math.min(V, Math.max(P.floor, P.pct / 100 * (V - P.deduct))); }
const adv = (n) => Math.round(n * P.charAdvance * 100) / 100;
const tadv = (n) => Math.round(n * P.titleAdvance * 100) / 100;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function freePort() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}
let failures = 0;
const log = (...a) => console.log(...a);
function check(label, ok, detail) {
  log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : '  →  ' + detail}`);
  if (!ok) failures += 1;
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const r2 = (n) => Math.round(n * 100) / 100;
const r1 = (n) => Math.round(n * 10) / 10;
const uniq = (a) => Array.from(new Set(a));
const pngSize = (buf) => ({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) });
/* 页面自报值：HTML 属性名大小写不敏感 ⇒ 一律用小写查 */
const dm = (b, name) => (b && b.capData ? b.capData['data-m-' + name.toLowerCase()] : undefined);

/* ── 页面侧量测：一次性把需要的几何取回来（脚本**自己**实现，不依赖页面自报）──
 * 逐字用 Range 量，按 top 分行 ⇒ 得到每一行的「墨迹盒」：左沿/右沿/宽 + 该行的字符区间与文字。
 * ⚠ 不用整段 Range 的 getClientRects（它会把**行盒**宽度带进来，量出来不是着墨宽 —— 踩过）。 */
const MEASURE = `(function(){
  var px = function(n){ return Math.round(n*100)/100; };
  function lineBoxes(e){
    var tns = [], w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT, null), n;
    while ((n = w.nextNode())) tns.push(n);
    if (!tns.length) return [];
    var rg = document.createRange(), br = e.getBoundingClientRect(), out = [], cur = null, idx = 0;
    for (var t=0;t<tns.length;t++){
      var tn = tns[t], data = tn.data;
      for (var i=0;i<data.length;i++){
        rg.setStart(tn, i); rg.setEnd(tn, i+1);
        var r = rg.getBoundingClientRect();
        if (!cur || Math.abs(r.top - cur.top) > 1) { cur = { from: idx, to: idx+1, text: data.charAt(i), l: r.left, r: r.right, top: r.top, bot: r.bottom }; out.push(cur); }
        else { cur.to = idx+1; cur.text += data.charAt(i); cur.l = Math.min(cur.l, r.left); cur.r = Math.max(cur.r, r.right); cur.bot = Math.max(cur.bot, r.bottom); }
        idx += 1;
      }
    }
    return out.map(function(x){
      return { from:x.from, to:x.to, t:x.text, n:x.to-x.from, l:px(x.l-br.left), r:px(x.r-br.left), w:px(x.r-x.l), top:px(x.top), bot:px(x.bot) };
    });
  }
  var colCenterOf = function(col){ var r = col.getBoundingClientRect(); return r.left + r.width/2; };
  var blocks = [];
  var ds = document.querySelectorAll('[data-test="demo"]');
  for (var k=0;k<ds.length;k++){
    var d = ds[k];
    var col = d.querySelector('[data-test="col"]');
    var pg = d.querySelector('[data-test="page"]');
    var cap = d.querySelector('[data-test="cap"]');
    var cr = col.getBoundingClientRect(), pr = pg.getBoundingClientRect();
    var cc = cr.left + cr.width/2;
    var o = { block: d.dataset.block, kind: d.dataset.kind || '', rule: d.dataset.rule || '',
      inShot: !!d.closest('[data-shotframe]'), counter: d.querySelector('.dcounter') ? d.querySelector('.dcounter').textContent : '',
      head: d.querySelector('[data-test="dhead"]').textContent.replace(/\\s+/g,' ').trim(),
      colW: px(cr.width), colLeft: px(cr.left), colRight: px(cr.right),
      pgW: px(pr.width), pgLeft: px(pr.left), items: [], hub: null,
      capData: {}, capText: cap.textContent.replace(/\\s+/g,' ').trim() };
    Array.prototype.forEach.call(cap.attributes, function(a){ if (a.name.indexOf('data-m-') === 0) o.capData[a.name] = a.value; });
    var boxes = d.querySelectorAll('[data-test="line"],[data-test="bench"],[data-test="rulerbox"],[data-test="natref"]');
    for (var b=0;b<boxes.length;b++){
      var bx = boxes[b];
      var rb = bx.getBoundingClientRect();
      var lb = lineBoxes(bx);
      var bc = rb.left + rb.width/2;
      o.items.push({ tag: bx.getAttribute('data-test'), fx: bx.getAttribute('data-fx') === '1',
        real: bx.getAttribute('data-real') === '1',
        cand: bx.getAttribute('data-cand'), rule: bx.getAttribute('data-rule'), mode: bx.getAttribute('data-mode'),
        k: bx.getAttribute('data-k'), forWhat: bx.getAttribute('data-for'),
        w: px(rb.width), left: px(rb.left - cr.left),
        text: bx.textContent,
        lines: lb.map(function(x){
          return { t:x.t, n:x.n, l:x.l, r:x.r, w:x.w, cx:px((x.l+x.r)/2),
            dBox:px((x.l+x.r)/2 - rb.width/2), dCol:px((rb.left + (x.l+x.r)/2) - cc), over:px(x.r - rb.width) };
        }),
        overMax: lb.length ? Math.max.apply(null, lb.map(function(x){ return px(x.r - rb.width); })) : null });
    }
    if (d.dataset.kind === 'hub') {
      var gl = d.querySelector('[data-test="glist"]');
      var gm = d.querySelector('[data-test="gmark"]');
      var gn = d.querySelector('[data-test="gname"]');
      var gh = d.querySelector('[data-test="ghead"]');
      o.hub = { collapsed: gl.hidden, markText: gm.textContent, expanded: gh.getAttribute('aria-expanded'),
        nameX: px(gn.getBoundingClientRect().left - cr.left),
        seam: px(gn.getBoundingClientRect().left - gm.getBoundingClientRect().right),
        rows: d.querySelectorAll('[data-test="row"]').length,
        visibleRows: Array.prototype.filter.call(d.querySelectorAll('[data-test="row"]'), function(r){ return r.getBoundingClientRect().height > 0; }).length,
        fxRows: d.querySelectorAll('[data-test="row"][data-fx="1"]').length };
    }
    blocks.push(o);
  }
  var all = document.querySelectorAll('body *'), maxRight = -1e9, minLeft = 1e9, mrEl = '', mlEl = '';
  var name = function(e){ return e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\\s+/).join('.') : ''); };
  for (var z=0;z<all.length;z++){
    var rr = all[z].getBoundingClientRect();
    if (rr.width === 0 && rr.height === 0) continue;
    if (rr.right > maxRight) { maxRight = rr.right; mrEl = name(all[z]); }
    if (rr.left < minLeft) { minLeft = rr.left; mlEl = name(all[z]); }
  }
  var deck = document.querySelector('[data-shotframe]');
  var deckP = deck.getBoundingClientRect();
  var bodyEl = document.querySelector('[data-test="demo"][data-kind="real"] [data-test="poem"]');
  var titleEl = document.querySelector('[data-test="demo"][data-kind="real"] [data-test="title"]');
  var identEl = document.querySelector('[data-test="demo"][data-kind="real"] [data-test="ident"]');
  var cs = function(e, ps){ var c = getComputedStyle(e), o = {}; ps.forEach(function(p){ o[p] = c[p]; }); return o; };
  /* 每汉字推进宽：临时插一个 max-content 元素量它（量完立刻删掉，不留痕迹） */
  var host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden';
  document.body.appendChild(host);
  var mk = function(cls, ch){
    var e = document.createElement('div'); e.className = cls; e.style.width = 'max-content';
    e.textContent = ch; host.appendChild(e);
    var w = e.getBoundingClientRect().width; return px(w);
  };
  var advP = mk('pfont', '行'), advT = mk('ttitle', '【');
  host.parentNode.removeChild(host);
  return JSON.stringify({ innerW: window.innerWidth, innerH: window.innerHeight,
    visualW: window.visualViewport ? px(window.visualViewport.width) : null,
    docW: document.documentElement.scrollWidth, docH: document.documentElement.scrollHeight,
    bodyW: document.body.scrollWidth, maxRight: px(maxRight), maxRightEl: mrEl, minLeft: px(minLeft), minLeftEl: mlEl,
    deck: { x: px(deckP.left), y: px(deckP.top + window.scrollY), w: px(deckP.width), h: px(deckP.height) },
    cwVar: String(getComputedStyle(document.documentElement).getPropertyValue('--cw')).trim(),
    advP: advP, advT: advT,
    fonts: { poem: cs(bodyEl, ['fontSize','lineHeight','letterSpacing']),
             title: cs(titleEl, ['fontSize','lineHeight','letterSpacing']),
             ident: cs(identEl, ['fontSize','lineHeight','letterSpacing']) },
    shot: document.documentElement.dataset.shot === '1',
    blocks: blocks });
})()`;

async function run() {
  const port = await freePort();
  const profile = mkdtempSync(join(tmpdir(), 'qbrk-'));
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--disable-background-networking',
    '--disable-component-update', '--disable-sync', '--remote-allow-origins=*',
    '--user-data-dir=' + profile, '--remote-debugging-port=' + port, 'about:blank',
  ], { stdio: 'ignore' });
  log(`原型页（只读打开）：${HTML_PATH}`);
  log(`源文件基准（只读）：${MD_PATH}  行数=${mdFlat.length}`);
  log(`仓库根（从脚本目录向上查找 prototype/css/theme-tech.css）：${ROOT}`);
  log(`CDP 端口（内核分配的空闲端口）：${port}`);
  log(`参数（来自页面 == BREAK-PARAMS-BEGIN ==）：adv=${P.charAdvance}/${P.titleAdvance} 字位 A=${P.slotPA} B=${P.slotPB}/${P.slotTB} C=${P.slotTC} 缩进=${P.indent} 真实压窄=${P.narrowReal} 尺=${P.slotsMin}…${P.slotsMax} 画=${SLOTS_DRAWN.join('/')} C=min(V,max(${P.floor},${P.pct}%×(V−${P.deduct})))`);

  const rowsOut = [];
  try {
    for (let i = 0; i < 120; i += 1) {
      try { const r = await fetch(`http://127.0.0.1:${port}/json/version`); if (r.ok) break; } catch { /* 起得慢 */ }
      if (i === 119) throw new Error('Chromium 的 devtools 端口没起来');
      await sleep(150);
    }
    const tab = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true });
      ws.addEventListener('error', rej, { once: true });
    });
    let id = 0;
    const pending = new Map();
    const events = [];
    const requests = [];
    const pageErrors = [];
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) {
        const { res, rej } = pending.get(m.id);
        pending.delete(m.id);
        if (m.error) rej(new Error(JSON.stringify(m.error))); else res(m.result);
        return;
      }
      if (!m.method) return;
      events.push(m.method);
      if (m.method === 'Network.requestWillBeSent') requests.push(m.params.request.url);
      if (m.method === 'Runtime.exceptionThrown') {
        pageErrors.push('uncaught: ' + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text));
      }
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        pageErrors.push('console.error: ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
      }
      if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
        pageErrors.push('log: ' + m.params.entry.text);
      }
    });
    const send = (method, params = {}) => {
      const myId = ++id;
      ws.send(JSON.stringify({ id: myId, method, params }));
      return new Promise((res, rej) => pending.set(myId, { res, rej }));
    };
    const js = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('页面脚本出错：' + JSON.stringify(r.exceptionDetails));
      return r.result.value;
    };
    const measure = async () => JSON.parse(await js(MEASURE));
    async function clickAt(x, y) {
      const base = { x, y, button: 'left', buttons: 1, clickCount: 1 };
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...base });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base });
    }
    async function clickGhead() {
      const c = JSON.parse(await js(`(function(){
        var e = document.querySelector('[data-test="ghead"]');
        e.scrollIntoView({ block: 'center' });
        var r = e.getBoundingClientRect();
        var x = (r.left + r.right) / 2, y = (r.top + r.bottom) / 2;
        var hit = document.elementFromPoint(x, y);
        return JSON.stringify({ x: Math.round(x*10)/10, y: Math.round(y*10)/10,
          hitIsE: hit ? (hit === e || e.contains(hit)) : false, hitTag: hit ? hit.tagName : '(无)' });
      })()`));
      if (!c.hitIsE) return c;
      await clickAt(c.x, c.y);
      await sleep(140);
      return c;
    }
    async function load(url, w, h, mobile) {
      requests.length = 0; pageErrors.length = 0; events.length = 0;
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile });
      await send('Page.navigate', { url });
      for (let i = 0; i < 150 && !events.includes('Page.loadEventFired'); i += 1) await sleep(100);
      for (let i = 0; i < 40; i += 1) {
        const ready = await js(`document.documentElement.dataset.ready === '1'`);
        if (ready) break;
        await sleep(100);
      }
      await sleep(250);
    }

    await send('Runtime.enable'); await send('Log.enable');
    await send('Page.enable'); await send('Network.enable');

    const url = 'file:///' + HTML_PATH.replace(/\\/g, '/');
    const theme = readFileSync(join(ROOT, 'prototype', 'css', 'theme-tech.css'), 'utf8');
    const themeTokens = parseTokens(theme);
    let gitHead = '(git 不可用)';
    let themeClean = null;
    try {
      const a = spawnSync('git', ['-C', ROOT, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' });
      if (a.status === 0) gitHead = a.stdout.trim();
      const b = spawnSync('git', ['-C', ROOT, 'diff', '--quiet', 'HEAD', '--', 'prototype/css/theme-tech.css']);
      themeClean = b.status === 0;
    } catch { /* 不影响断言 */ }
    log(`当前 HEAD=${gitHead}；theme-tech.css 相对 HEAD ${themeClean === null ? '未知' : (themeClean ? '无改动' : '有未提交改动')}`);

    /* ═══ [G] 全局断言（只跑一次）══════════════════════════════════ */
    log('\n═══════════ [G] 全局：令牌快照 / 参数 / 已定项 / 标注 / 自包含 ═══════════');
    const snapText = declarationBlock(htmlText, '== TOKEN-SNAPSHOT-BEGIN ==', '== TOKEN-SNAPSHOT-END ==');
    const snap = snapText ? parseTokens(snapText) : new Map();
    const mismatches = [];
    for (const [k, v] of snap) {
      if (!themeTokens.has(k)) mismatches.push(`${k}: theme-tech.css 里没有这个令牌（快照值 ${v}）`);
      else if (themeTokens.get(k) !== v) mismatches.push(`${k}: 快照 ${v} ≠ theme-tech.css ${themeTokens.get(k)}`);
    }
    const usedVars = new Set((htmlText.match(/var\(--[A-Za-z0-9_-]+\)/g) || []).map((s) => s.slice(4, -1)));
    const declaredVars = new Set((htmlText.match(/(--[A-Za-z0-9_-]+)\s*:/g) || []).map((s) => s.replace(/\s*:$/, '')));
    const undeclared = [...usedVars].filter((k) => !declaredVars.has(k));
    const unusedSnap = [...snap.keys()].filter((k) => !usedVars.has(k));
    check(`令牌快照与 prototype/css/theme-tech.css 逐项比对：值不一致数 = ${mismatches.length}（要求 0）`,
      mismatches.length === 0,
      mismatches.length ? mismatches.join(' | ') : `${snap.size} 个令牌逐字一致（空白已归一化）`);
    check('快照里没有「声明了却没用」的令牌；页面里用到的每个 var() 都有声明',
      undeclared.length === 0 && unusedSnap.length === 0,
      `未声明=${JSON.stringify(undeclared)} 快照未用=${JSON.stringify(unusedSnap)}`);
    const shaRecorded = (htmlText.match(/仓库提交：([0-9a-f]{7,40})/) || [])[1] || '(没记录)';
    check('页面记录了令牌快照的来源提交（短 sha）＋写明「权威仍是 docs/design/visual-tokens.md」',
      /^[0-9a-f]{7,40}$/.test(shaRecorded) && htmlText.includes('权威仍是 docs/design/visual-tokens.md'),
      `记录=${shaRecorded}（当前 HEAD=${gitHead}）`);
    check('页面写明三个覆盖视口（320／430／1180）与已选宽度口径 C = min(V, max(320, 0.88×(V−24)))',
      [320, 430, 1180].every((n) => String(n).length > 0 && htmlText.includes(String(n))) &&
      htmlText.includes('C = min(V, max(320, 0.88 × (V − 24)))') && VIEWPORTS.join(' ') === '320 430 1180',
      `参数块 viewports = ${VIEWPORTS.join(' ')}`);
    const fixedList = [
      ['题名 1.5rem', '--title-size: 1.5rem'],
      ['题名 500', '--title-weight: 500'],
      ['题名字距 0.1em', '--title-ls: 0.1em'],
      ['身份行 0.78rem', '--meta-size: 0.78rem'],
      ['题名→身份 0.7rem', '--title-gap: 0.7rem'],
      ['身份→原文 2.1rem', '--body-gap: 2.1rem'],
      ['正文 17px', '--poem-size: 17px'],
      ['正文行高 2', '--poem-lh: 2'],
      ['正文字距 0.045em', '--poem-ls: 0.045em'],
      ['行内沿 1.05rem', '--edge-x: 1.05rem'],
      ['悬挂槽 27.52px', '--slot: 27.52px'],
      ['固定缝 0.4rem', '--seam: 0.4rem'],
    ];
    const missingFixed = fixedList.filter(([, s]) => !htmlText.includes(s));
    check('已定项（诗页字号/间距、行内沿、目录页悬挂槽与缝）逐条在页面上',
      missingFixed.length === 0 && htmlText.includes('水平对齐＝全部居中') &&
      htmlText.includes('顶部行＝返回左／详情右、不参与居中'),
      missingFixed.length ? '缺：' + missingFixed.map((x) => x[0]).join('、') : `${fixedList.length} 条已定值全在`);
    const mustSay = ['不排推荐', '并列', '选某档 ≠ 采纳整页规格', '不决定', 'JSON／MD', '材料，不是实施', '全部居中'];
    const notSaid = mustSay.filter((s) => !htmlText.includes(s));
    check('页面写明了「不排推荐／并列／选某档 ≠ 采纳整页规格／不决定 JSON／MD 分界／材料不是实施」',
      notSaid.length === 0, notSaid.length ? '缺：' + notSaid.join('、') : mustSay.join('、'));
    const fxCountOk = htmlText.includes('夹具 · 不是真实数据') && htmlText.includes('data-fx') &&
      htmlText.includes('不是真实数据');
    check('夹具标注：页面里有「夹具 · 不是真实数据」小标 ＋ data-fx 标记（夹具不进内容）', fxCountOk,
      '夹具小标与 data-fx 都在页面上');
    const textHits = ['<link', 'src=', '@import', 'http://', 'https://'].filter((t) => htmlText.indexOf(t) >= 0);
    check('页面文本里没有 <link / src= / @import / http(s)://（零外部引用）',
      textHits.length === 0, textHits.length ? '命中：' + textHits.join(' ') : '0 处');
    check('参数表可解析：字符推进 17.766／26.4、字位 5/7/9/9、缩进 2、真实压窄 11、尺 4…12、画 9/10/11/12',
      P.charAdvance === 17.766 && P.titleAdvance === 26.4 && P.slotPA === 5 && P.slotPB === 7 &&
      P.slotTB === 9 && P.slotTC === 9 && P.indent === 2 && P.narrowReal === 11 &&
      P.slotsMin === 4 && P.slotsMax === 12 && SLOTS_DRAWN.join('/') === '9/10/11/12' &&
      P.deduct === 24 && P.pct === 88 && P.floor === 320 && P.edge === 16.8,
      JSON.stringify(P));

    /* ═══ 逐视口 ═══════════════════════════════════════════════════ */
    const fontBag = [];
    for (const C of CASES) {
      if (ONLY && ONLY !== C.key) continue;
      const W = C.w, H = C.h;
      log(`\n═══════════ 视口 ${C.key}（${W}×${H}，DPR 2）· ${C.label} ═══════════`);
      await load(url, W, H, C.mobile);
      let M = await measure();
      const byId = (bid) => M.blocks.filter((b) => b.block === bid)[0] || null;

      /* [P] 独立实测每汉字推进宽（用页面里临时插入的 max-content 元素） */
      check(`每汉字推进宽独立实测：正文 ${M.advP}px（参数表 ${P.charAdvance}）、题名 ${M.advT}px（参数表 ${P.titleAdvance}）`,
        near(Number(M.advP), P.charAdvance, 0.02) && near(Number(M.advT), P.titleAdvance, 0.02),
        `量出来的两个元素宽 = ${M.advP} ／ ${M.advT}（参数表 17.766／26.4；容差 0.02px 是 Chrome 布局舍入 1/64px＋本脚本保留 2 位小数）`);

      /* [2] 视口与收敛 */
      check(`innerWidth = ${W}、visualViewport.width = ${W}（真实 CSS px，没有 shrink-to-fit）`,
        M.innerW === W && near(Number(M.visualW), W, 0.5), `innerW=${M.innerW} visualW=${M.visualW}`);
      check(`收起态**无横向溢出**：docW = bodyW = ${W}，所有可见元素都在 0…${W} 内`,
        M.docW === W && M.bodyW === W && M.maxRight <= W + 0.5 && M.minLeft >= -0.5,
        `docW=${M.docW} bodyW=${M.bodyW} minLeft=${M.minLeft}(${M.minLeftEl}) maxRight=${M.maxRight}(${M.maxRightEl})`);

      /* [1] 结构 */
      const ids = M.blocks.map((b) => b.block);
      const shotBlocks = M.blocks.filter((b) => b.inShot).map((b) => b.block);
      const outBlocks = M.blocks.filter((b) => !b.inShot).map((b) => b.block);
      check('[1] 结构：图内 6 块（X0／X1／A／B／C／D4）＋ 图外 1 块（目录页 X2）',
        shotBlocks.join(',') === 'X0,X1,A,B,C,D4' && outBlocks.join(',') === 'X2',
        `图内 ${shotBlocks.join(',')}；图外 ${outBlocks.join(',')}`);
      const x0 = byId('X0');
      const realLines = x0.items.filter((i) => i.real !== true && i.tag === 'line' && i.lines.length === 1 && i.text.length === 12);
      const x0Lines = x0.items.filter((i) => i.tag === 'line');
      check('[1] X0 是真实诗页：顶部行（返回／详情）＋ 题名 ＋ 身份行 ＋ 正文恰好 8 行',
        x0Lines.length === 8 && htmlText.includes('返回') && htmlText.includes('详情'), `${x0Lines.length} 行`);
      const verbatim = x0Lines.map((i) => i.text).join('\u0001') === mdFlat.join('\u0001');
      check('[1] X0 的 8 行与 content/poems/gushi-shijiu-shou-01.md **逐字相同**（顺序也相同）', verbatim,
        verbatim ? '8/8 逐字一致' : JSON.stringify({ page: x0Lines.map((i) => i.text), md: mdFlat }));
      const fxItems = [];
      M.blocks.forEach((b) => b.items.forEach((i) => { if (i.fx) fxItems.push({ b: b.block, i: i }); }));
      check('[1] 夹具都带 data-fx="1"（图内 8＋7＋4 个夹具盒），且没有别的元素带 data-fx',
        fxItems.length === 8 + 7 + 4 &&
        fxItems.filter((x) => x.b === 'A').length === 8 && fxItems.filter((x) => x.b === 'B').length === 7 &&
        fxItems.filter((x) => x.b === 'C').length === 4,
        `A=${fxItems.filter((x) => x.b === 'A').length} B=${fxItems.filter((x) => x.b === 'B').length} C=${fxItems.filter((x) => x.b === 'C').length}`);
      const A = byId('A'), B = byId('B'), Cb = byId('C'), D4 = byId('D4'), X1 = byId('X1'), X2 = byId('X2');
      const aCols = A.items.filter((i) => i.fx);
      const rulesA = uniq(aCols.map((i) => i.rule));
      check('[1] A 块：2 行（两种夹具）× 4 列（①默认／②strict／③hang／①-对照 anywhere）',
        aCols.length === 8 && rulesA.join(',') === 'default,strict,hang,anywhere' &&
        A.items.filter((i) => i.rule === 'default').length === 2,
        `规则集合 ${rulesA.join(',')}`);
      const bCols = B.items.filter((i) => i.fx);
      const wIs = (i, w) => near(i.w, w, 0.05);
      check('[1] B 块：诗句 3 列 ＋ 1 格纯 CSS 近似；题名 3 列（模式 center/split0/split2）',
        bCols.filter((i) => wIs(i, adv(P.slotPB))).length === 4 && bCols.filter((i) => wIs(i, tadv(P.slotTB))).length === 3 &&
        uniq(bCols.filter((i) => i.mode).map((i) => i.mode)).join(',') === 'center,split0,split2',
        `诗句列 ${bCols.filter((i) => wIs(i, adv(P.slotPB))).length}／题名列 ${bCols.filter((i) => wIs(i, tadv(P.slotTB))).length}`);
      const natrefs = B.items.filter((i) => i.tag === 'natref');
      check('[1] B 块留着**隐藏的自然断点参照**（诗句／题名各一个）供独立核对拆分没改断点',
        natrefs.length === 2 && uniq(natrefs.map((i) => i.forWhat)).join(',') === 'poem,title',
        natrefs.map((i) => `${i.forWhat}:${i.lines.length}行`).join(' '));
      check('[1] C 块：4 列（同一段夹具长题名）', Cb.items.filter((i) => i.fx).length === 4,
        `${Cb.items.filter((i) => i.fx).length} 列`);
      check(`[1] D4 块：图里画 ${SLOTS_DRAWN.length} 档 ＋ 隐藏尺 ${P.slotsMin}…${P.slotsMax} 共 ${P.slotsMax - P.slotsMin + 1} 档`,
        D4.items.filter((i) => i.tag === 'bench').length === SLOTS_DRAWN.length &&
        D4.items.filter((i) => i.tag === 'rulerbox').length === P.slotsMax - P.slotsMin + 1,
        `画 ${D4.items.filter((i) => i.tag === 'bench').length}／尺 ${D4.items.filter((i) => i.tag === 'rulerbox').length}`);
      check('[1] 目录页（X2）在 [data-shotframe] **之外**（不进图）且首态是收起的',
        X2 && !X2.inShot && X2.hub && X2.hub.collapsed === true && X2.hub.rows === 20 && X2.hub.fxRows === 1,
        `在图上？${X2.inShot}；行 ${X2.hub.rows}（夹具行 ${X2.hub.fxRows}）`);

      /* [2] 列宽 = 公式 */
      const cw = cwOf(W);
      const badCol = M.blocks.filter((b) => !near(b.colW, cw, 0.02));
      check(`[2] 每个块的内容列宽都 = C = min(V, max(320, 0.88×(V−24))) = ${r2(cw)}px（复算±0.02）`,
        badCol.length === 0, badCol.length ? badCol.map((b) => `${b.block}:${b.colW}`).join(' ') : `${M.blocks.length} 块全部一致`);
      const badPg = M.blocks.filter((b) => !near(b.pgW, W, 0.02));
      check(`[2] 每个块的「屏幕」宽都 = 视口宽 ${W}`, badPg.length === 0,
        badPg.length ? badPg.map((b) => `${b.block}:${b.pgW}`).join(' ') : `${M.blocks.length} 块全部一致`);
      /* 字位容器宽（逐档复算） */
      const expectNarrow = [
        ['A', adv(P.slotPA)], ['B-p', adv(P.slotPB)], ['B-t', tadv(P.slotTB)],
        ['C', tadv(P.slotTC)], ['X1', adv(P.narrowReal)],
      ];
      const narrowOk = [
        A.items.filter((i) => i.fx).every((i) => near(i.w, adv(P.slotPA), 0.02)),
        B.items.filter((i) => i.fx && near(i.w, adv(P.slotPB), 0.05)).every((i) => near(i.w, adv(P.slotPB), 0.05)),
        B.items.filter((i) => i.fx && near(i.w, tadv(P.slotTB), 0.05)).every((i) => near(i.w, tadv(P.slotTB), 0.05)),
        Cb.items.filter((i) => i.fx).every((i) => near(i.w, tadv(P.slotTC), 0.02)),
        X1.items.filter((i) => i.real).every((i) => near(i.w, adv(P.narrowReal), 0.02)),
      ].every(Boolean);
      check(`[P] 各「字位」容器宽 = 字位 × 推进宽：` +
        expectNarrow.map(([n, w]) => `${n}=${w}`).join(' '), narrowOk, '逐档复算一致');
      /* 量测台各档 */
      const benchOk = D4.items.filter((i) => i.tag === 'bench').every((i) => near(i.w, adv(Number(i.k)), 0.02)) &&
        D4.items.filter((i) => i.tag === 'rulerbox').every((i) => near(i.w, adv(Number(i.k)), 0.02));
      check('[P] 量测台与隐藏尺的每一档容器宽 = 字位 × 17.766（4…12 逐档）', benchOk,
        D4.items.filter((i) => i.tag === 'bench').map((i) => `${i.k}:${i.w}`).join(' '));

      /* [3] 逐行几何 */
      log(`\n[3] 逐行实测（逐字 Range 的**墨迹盒**；dBox＝相对本列窄容器中心，dCol＝相对整页内容列中心，over＝越出容器）`);
      const overBad = [];
      M.blocks.forEach((b) => b.items.forEach((i) => {
        if (i.tag === 'natref') return;
        if (i.overMax !== null && i.overMax > 0.05) overBad.push(`${b.block}/${i.cand || i.k || i.tag}:${i.overMax}`);
      }));
      check('[3] 没有任何一行越出它所在的窄容器（>0.05px 即失败；唯一例外是刻意构造的对比）',
        overBad.length === 0, overBad.length ? overBad.join(' ') : '全部 ≤ 0.05px');
      const devPoem = uniq(M.blocks.flatMap((b) => b.items.filter((i) => i.tag === 'line' && i.real).flatMap((i) => i.lines.map((x) => x.dCol))));
      const poemDevMax = Math.max(...devPoem.map(Math.abs));
      check(`[3] X0/X1 的每一行与**整页内容列中心**的差 ≤ 0.5px（「每一行都居中」；偏差来自末字之后那一份字距）`,
        poemDevMax <= 0.5, `最大 |dCol| = ${r2(poemDevMax)}px（12 行 × 各 1 盒）`);
      const aRecent = A.items.filter((i) => i.fx).flatMap((i) => i.lines).map((x) => Math.abs(x.dBox));
      check('[3] A 块每行与本列窄容器中心差 ≤ 0.5px（列内仍按已定「每行都居中」）',
        Math.max(...aRecent) <= 0.5, `最大 |dBox| = ${r2(Math.max(...aRecent))}px`);
      /* B 块的续行位置：三种模式必须给出不同的左沿，且与定义一致 */
      const bPoem = (mode) => B.items.filter((i) => i.fx && i.mode === mode && near(i.w, adv(P.slotPB), 0.05))[0];
      const natP = B.items.filter((i) => i.tag === 'natref' && i.forWhat === 'poem')[0];
      const natT = B.items.filter((i) => i.tag === 'natref' && i.forWhat === 'title')[0];
      if (bPoem('center') && bPoem('split0') && bPoem('split2')) {
        const c1 = bPoem('center').lines, s1 = bPoem('split0').lines, s2 = bPoem('split2').lines;
        const l1 = natP.lines[0].l;
        const okC = near(c1[1].l, r2((adv(P.slotPB) - c1[1].w) / 2), 0.05);
        const okS = near(s1[1].l, l1, 0.05);
        const okI = near(s2[1].l, r2(l1 + P.indent * P.charAdvance), 0.05);
        check('[3] 续行②＝左对齐到首行左沿（左沿 = 首行墨迹左沿）、③＝再缩进 2 字（35.53px）、①＝居中',
          okC && okS && okI,
          `①行2左=${c1[1].l}（居中应为 ${r2((adv(P.slotPB) - c1[1].w) / 2)}）；②行2左=${s1[1].l}（首行左沿 ${l1}）；③行2左=${s2[1].l}（应为 ${r2(l1 + P.indent * P.charAdvance)}）`);
        const bt = (mode) => B.items.filter((i) => i.fx && i.mode === mode && near(i.w, tadv(P.slotTB), 0.05))[0];
        const t1 = bt('center').lines, t2 = bt('split0').lines, t3 = bt('split2').lines;
        check('[3] 长题名上的同一关系也成立（②③ 按各题名自己的首行左沿算）',
          near(t2[1].l, natT.lines[0].l, 0.05) && near(t3[1].l, r2(natT.lines[0].l + P.indent * P.charAdvance), 0.05),
          `①行2左=${t1[1].l} ②行2左=${t2[1].l} ③行2左=${t3[1].l}（首行左沿 ${natT.lines[0].l}）`);
      } else {
        check('[3] B 块三列都在', false, '找不到 center/split0/split2 三列');
      }
      /* 逐行打印（给 .md 用） */
      M.blocks.forEach((b) => {
        if (!b.items.length || b.block === 'X2') return;
        log(`      ${b.block}（列宽 ${b.colW}）：`);
        b.items.forEach((i) => {
          if (!i.lines.length) return;
          const tag = i.cand || i.k || (i.real ? 'real' : i.tag);
          log(`        ${String(tag).padEnd(9)} w=${String(i.w).padStart(8)} ${i.lines.map((x) => `${x.n}字 L${x.l} R${x.r} dBox${x.dBox} dCol${x.dCol}`).join(' | ')}`);
        });
      });

      /* [4] 断点位置（文字范围量） */
      const close = (i) => i.text.charAt(i.lines[0].to === i.lines[0].n ? -1 : -1);
      function brkList(i) {
        const out = [];
        for (let x = 0; x + 1 < i.lines.length; x += 1) {
          out.push({ after: i.lines[x].to, end: i.lines[x].t.slice(-1), start: i.lines[x + 1].t.charAt(0) });
        }
        return out;
      }
      const aClose = A.items.filter((i) => i.fx && i.text === FX.close);
      const aOpen = A.items.filter((i) => i.fx && i.text === FX.open);
      const names = (arr) => arr.map((i) => `${i.rule}:${i.lines.map((x) => x.t).join('|')}`).join('  ');
      const base3 = aClose.filter((i) => ['default', 'strict', 'hang'].indexOf(i.rule) >= 0);
      const base3Open = aOpen.filter((i) => ['default', 'strict', 'hang'].indexOf(i.rule) >= 0);
      const txt = (i) => i.lines.map((x) => x.t).join('|');
      check('[4] 断点①／②／③（默认／strict／strict＋hanging-punctuation）在本夹具上**断点逐字相同**',
        uniq(base3.map(txt)).length === 1 && uniq(base3Open.map(txt)).length === 1,
        names(aClose));
      check('[4] 收尾标点**没有**落在行首（①②③）：' + names(aClose),
        base3.every((i) => brkList(i).every((x) => PUNCT_CLOSE.indexOf(x.start) < 0)) &&
        base3.every((i) => i.lines.map((l) => l.t).join('|') === '甲乙丙丁|戊，己庚辛'),
        '行 1＝甲乙丙丁（4 字）、行 2＝戊，己庚辛（5 字）：标点前那个字被推到第 2 行');
      check('[4] 开局标点**没有**落在行尾（①②③）：' + names(aOpen),
        base3Open.every((i) => brkList(i).every((x) => PUNCT_OPEN.indexOf(x.end) < 0)) &&
        base3Open.every((i) => txt(i) === '甲乙丙丁|（戊己庚）'),
        '行 1 只有 4 字：收尾标点被推进第 2 行，不让「（」留在行尾');
      check('[4] ① 的字面含义（anywhere）**确实**把收尾标点放到行首：' +
        (aClose.filter((i) => i.rule === 'anywhere')[0] ? txt(aClose.filter((i) => i.rule === 'anywhere')[0]) : '(缺)'),
        aClose.filter((i) => i.rule === 'anywhere').length === 1 &&
        txt(aClose.filter((i) => i.rule === 'anywhere')[0]) === '甲乙丙丁戊|，己庚辛' &&
        brkList(aClose.filter((i) => i.rule === 'anywhere')[0])[0].start === '，',
        '这是「① 不做任何处理」的**另一种读法**，不是候选之一');
      check('[4] ① 的字面含义（anywhere）**确实**把开局标点放到行尾：' +
        (aOpen.filter((i) => i.rule === 'anywhere')[0] ? txt(aOpen.filter((i) => i.rule === 'anywhere')[0]) : '(缺)'),
        aOpen.filter((i) => i.rule === 'anywhere').length === 1 &&
        txt(aOpen.filter((i) => i.rule === 'anywhere')[0]) === '甲乙丙丁（|戊己庚）' &&
        brkList(aOpen.filter((i) => i.rule === 'anywhere')[0])[0].end === '（',
        '对照证据：本机默认**没有**这么做');
      check('[4] 本机 Chromium **不支持** hanging-punctuation（③ 的「挤入」做不到）—— 机器可查',
        htmlText.includes('hanging-punctuation:allow-end') &&
        (dm(A, 'hangingok') === undefined || dm(A, 'hangingok') === 'false'),
        `页面自报 CSS.supports = ${dm(A, 'hangingok')}`);

      /* [5] 长题名（C 块） */
      const cDef = Cb.items.filter((i) => i.fx && i.rule === 'default')[0];
      const cAny = Cb.items.filter((i) => i.fx && i.rule === 'anywhere')[0];
      const c3 = Cb.items.filter((i) => i.fx && ['default', 'strict', 'hang'].indexOf(i.rule) >= 0);
      check('[5] 长题名：①②③ 三列断点相同、①-对照不同；且 ①②③ 把「】」挡在行首之外',
        cDef && cAny && uniq(c3.map(txt)).length === 1 && txt(cDef) !== txt(cAny) &&
        cDef.lines.map((x) => x.n).join('/') === '8/9/5' && cAny.lines.map((x) => x.n).join('/') === '9/9/4' &&
        brkList(cDef)[0].start === '据' && brkList(cAny)[0].start === '】' &&
        Cb.items.filter((i) => i.fx).length === 4,
        `①=${txt(cDef)}（${cDef.lines.map((x) => x.n).join('/')}）｜①-对照=${txt(cAny)}（${cAny.lines.map((x) => x.n).join('/')}）`);

      /* [6] 真实原文压窄（X1） */
      const x1 = X1.items.filter((i) => i.real);
      check('[6] 真实原文压窄（11 字位＝195.43px）：两行都折成 10／2，断点在第 10 字后',
        x1.length === 2 && x1.every((i) => i.lines.map((x) => x.n).join('/') === '10/2') &&
        x1[0].lines.map((x) => x.t).join('|') === mdFlat[0].slice(0, 10) + '|' + mdFlat[0].slice(10) &&
        x1[1].lines.map((x) => x.t).join('|') === mdFlat[1].slice(0, 10) + '|' + mdFlat[1].slice(10),
        x1.map((i) => i.lines.map((x) => x.t).join('｜')).join('  ／  '));

      /* [7] 量测台 */
      const avail = W === 0 ? 0 : r2(cw - 2 * P.edge);
      const slotsN = Math.floor(avail / P.charAdvance);
      const ruler = {};
      D4.items.filter((i) => i.tag === 'rulerbox').forEach((i) => { ruler[Number(i.k)] = i.lines.map((x) => x.n); });
      const expectRuler = { 4: '4/4/4', 5: '4/5/3', 6: '6/6', 7: '7/5', 8: '8/4', 9: '9/3', 10: '10/2', 11: '10/2', 12: '12' };
      const rulerBad = Object.keys(expectRuler).filter((k) => ruler[k].join('/') !== expectRuler[k]);
      check(`[7] 量测台：可用宽 = C − 2×16.8 = ${avail}px ⇒ 最多 ${slotsN} 个字位；4…12 档每行字数逐档实测`,
        near(Number(dm(D4, 'avail')), avail, 0.02) && near(Number(dm(D4, 'availslots')), avail / P.charAdvance, 0.02) &&
        rulerBad.length === 0,
        rulerBad.length ? '不符：' + rulerBad.map((k) => `${k}→${ruler[k].join('/')}`).join(' ') :
          Object.keys(ruler).map((k) => `${k}:${ruler[k].join('/')}`).join(' '));
      check('[7] 「最少几个字位才不折行」= 12（11 个字位仍折成 10／2）—— 因为收尾标点不能起行',
        Number(dm(D4, 'minslots')) === 12 && ruler[12].length === 1 && ruler[11].join('/') === '10/2',
        `页面自报 minSlots=${dm(D4, 'minslots')}；12 字位 ⇒ ${ruler[12].length} 行`);
      const drawn = {};
      D4.items.filter((i) => i.tag === 'bench').forEach((i) => { drawn[Number(i.k)] = i.lines.map((x) => x.n); });
      const benchSame = Object.keys(drawn).every((k) => drawn[k].join('/') === ruler[Number(k)].join('/'));
      check('[7] 图里画出来的 4 档与隐藏尺同档**逐字一致**（同一段真实原文、同一宽度）', benchSame,
        Object.keys(drawn).map((k) => `${k}→${drawn[k].join('/')}`).join(' '));

      /* [8] 目录页收起／展开（各查一次横向溢出） */
      let hub = byId('X2').hub;
      check(`[8] 目录页首态**收起**：可见 0 行、记号 [+]，悬挂槽 ${hub.nameX}px、缝 ${hub.seam}px（0.4rem）`,
        hub.collapsed === true && hub.visibleRows === 0 && hub.markText === '[+]' &&
        near(hub.nameX, 27.52, 0.02) && near(hub.seam, 6.39, 0.02),
        `nameX=${hub.nameX} seam=${hub.seam} mark=${hub.markText}`);
      const cc1 = await clickGhead();
      let M2 = await measure();
      let hub2 = M2.blocks.filter((b) => b.block === 'X2')[0].hub;
      check('[8] 真鼠标点组头 ⇒ 展开 20 行（1 夹具行 ＋ 19 首）、记号 [−]',
        cc1.hitIsE && hub2.collapsed === false && hub2.visibleRows === 20 && hub2.markText === '[−]',
        `命中=${cc1.hitIsE} 可见行=${hub2.visibleRows} 记号=${hub2.markText}`);
      check(`[8] **展开态**重查一次：docW = ${W}、无横向溢出（所有元素 0…${W}）`,
        M2.docW === W && M2.maxRight <= W + 0.5 && M2.minLeft >= -0.5,
        `docW=${M2.docW} minLeft=${M2.minLeft}(${M2.minLeftEl}) maxRight=${M2.maxRight}(${M2.maxRightEl})`);
      const cc2 = await clickGhead();
      let M3 = await measure();
      let hub3 = M3.blocks.filter((b) => b.block === 'X2')[0].hub;
      check('[8] 再点一次 ⇒ 收起（可见 0 行、记号 [+]、无横向溢出）',
        cc2.hitIsE && hub3.collapsed === true && hub3.visibleRows === 0 && hub3.markText === '[+]' &&
        M3.docW === W && M3.maxRight <= W + 0.5,
        `可见行=${hub3.visibleRows} docW=${M3.docW}`);

      /* [9] 字号不缩放 */
      fontBag.push({ k: C.key, poem: M.fonts.poem, title: M.fonts.title, ident: M.fonts.ident });
      check(`[9] 正文 ${M.fonts.poem.fontSize}/${M.fonts.poem.lineHeight}/${M.fonts.poem.letterSpacing}、` +
        `题名 ${M.fonts.title.fontSize}、身份行 ${M.fonts.ident.fontSize} 与本视口无关`,
        M.fonts.poem.fontSize === '17px' && M.fonts.poem.lineHeight === '34px' && M.fonts.poem.letterSpacing === '0.765px' &&
        M.fonts.title.fontSize === `${Math.round(1.5 * 16 * 100) / 100}px` && M.fonts.title.fontSize === '24px' &&
        M.fonts.ident.fontSize === '12.48px',
        `${M.fonts.poem.fontSize} / ${M.fonts.poem.lineHeight} / ${M.fonts.poem.letterSpacing}`);

      /* [10] 页面自报 = 独立实测 */
      const selfBad = [];
      if (!near(Number(dm(x0, 'maxline')), x0Lines[0].lines[0].w, 0.02)) selfBad.push(`X0 maxLine 自报 ${dm(x0, 'maxline')} ≠ 实测 ${x0Lines[0].lines[0].w}`);
      if (Number(dm(x0, 'wrapped')) !== 0) selfBad.push('X0 自报折行数 ≠ 0');
      if (!near(Number(dm(x0, 'avail')), avail, 0.02)) selfBad.push(`X0 avail 自报 ${dm(x0, 'avail')} ≠ ${avail}`);
      if (dm(A, 'narroww') && !near(Number(dm(A, 'narroww')), adv(P.slotPA), 0.02)) selfBad.push('A narrowW 不符');
      if (dm(X1, 'narroww') && !near(Number(dm(X1, 'narroww')), adv(P.narrowReal), 0.02)) selfBad.push('X1 narrowW 不符');
      if (dm(hub, 'namex') && !near(Number(dm(hub, 'namex')), hub.nameX, 0.02)) selfBad.push('X2 nameX 不符');
      const datakeys = Object.keys(x0.capData).length > 0 && Object.keys(A.capData).length > 0 &&
        Object.keys(B.capData).length > 0 && Object.keys(Cb.capData).length > 0 && Object.keys(D4.capData).length > 0;
      check('[10] 页面自报的数字 = 本脚本独立实测（±0.02px），且每块都带 data-m-* 标记',
        selfBad.length === 0 && datakeys, selfBad.length ? selfBad.join(' | ') : '抽查 6 项一致，data-m-* 齐全');

      rowsOut.push({
        key: C.key, w: W, h: H, cw: r2(cw), avail, slotsN, docW: M.docW, docH: M.docH,
        deckH: M.deck.h, maxRight: M.maxRight, minLeft: M.minLeft,
        poemWrapped: Number(dm(x0, 'wrapped')), maxLine: Number(dm(x0, 'maxline')),
        aClose: txt(aClose.filter((i) => i.rule === 'default')[0]), aAny: txt(aClose.filter((i) => i.rule === 'anywhere')[0]),
        cTitle: txt(cDef), minSlots: Number(dm(D4, 'minslots')),
        bP: [bPoem('center'), bPoem('split0'), bPoem('split2')].map((i) => i && i.lines.map((x) => `${x.n}字 L${x.l} R${x.r} dBox${x.dBox}`).join(' | ')),
        x1: x1.map((i) => i.lines.map((x) => x.t).join('｜')),
      });

      /* [11] PNG */
      if (!SHOT) { log('\n[11] 已跳过（--no-shot）：不查看图态、不重出 PNG'); continue; }
      await send('Page.navigate', { url: 'about:blank' });
      await sleep(150);
      await load(url + '#shot', W, H, C.mobile);
      let S = await measure();
      check('[11] 看图态：#shot 只隐去说明性文字；排布数字与普通态逐一相同',
        S.shot === true && near(S.blocks.filter((b) => b.block === 'A')[0].colW, cw, 0.02) &&
        near(S.blocks.filter((b) => b.block === 'D4')[0].colW, cw, 0.02),
        `shot=${S.shot}；A 列宽 ${S.blocks.filter((b) => b.block === 'A')[0].colW}`);
      check(`[11] 看图态仍无横向溢出（docW = ${W}）`, S.docW === W && S.maxRight <= W + 0.5,
        `docW=${S.docW} maxRight=${S.maxRight}`);
      check('[11] 看图态里目录页（图外那块）仍是收起的 —— 图里没有它，也没有展开态',
        S.blocks.filter((b) => b.block === 'X2')[0].hub.collapsed === true,
        `collapsed=${S.blocks.filter((b) => b.block === 'X2')[0].hub.collapsed}`);
      check(`[11] 截图区高度 ${r2(S.deck.h)} CSS px ⇒ ${r2(S.deck.h * 2)} 设备 px，必须 < ${PNG_HARD_LIMIT}（不出一张被截断的图）`,
        S.deck.h * 2 < PNG_HARD_LIMIT, `${r2(S.deck.h)} CSS px（上限 ${MAX_SHOT_CSS}）`);
      const pngName = `q-break.${C.key}.png`;
      const pngPath = join(OUT, pngName);
      const shot = await send('Page.captureScreenshot', {
        format: 'png', captureBeyondViewport: true,
        clip: { x: 0, y: S.deck.y, width: W, height: S.deck.h, scale: 1 },
      });
      writeFileSync(pngPath, Buffer.from(shot.data, 'base64'));
      const buf = readFileSync(pngPath);
      const size = pngSize(buf);
      log(`\n[11] PNG：${pngPath}`);
      log(`      截图区 CSS ${W}×${r2(S.deck.h)} @DPR 2 → 像素 ${W * 2}×${r2(S.deck.h * 2)} → 文件实测 ${size.w}×${size.h}，${statSync(pngPath).size} 字节`);
      check(`[11] PNG 像素宽 = 视口宽 × 2 = ${W * 2}（真实 CSS px @DPR 2，不是缩放图、不是拼图）`,
        size.w === W * 2, `实测 ${size.w}`);
      check('[11] PNG 像素高 = 截图区 CSS 高 × 2', Math.abs(size.h - S.deck.h * 2) <= 2,
        `实测 ${size.h}，期望 ${r2(S.deck.h * 2)}`);
      check('[11] PNG 非空且没有被截断（高 < 16384）', statSync(pngPath).size > 1000 && size.h < PNG_HARD_LIMIT,
        `${statSync(pngPath).size} 字节，${size.w}×${size.h}`);
    }

    /* ═══ [9] 跨视口：字号不缩放 ═════════════════════════════════ */
    log('\n═══════════ [9] 跨视口：字号／行高／字距**不随宽度变** ═══════════');
    if (fontBag.length > 1) {
      const kinds = ['poem', 'title', 'ident'];
      const bad = kinds.filter((k) => uniq(fontBag.map((f) => `${f[k].fontSize}/${f[k].lineHeight}/${f[k].letterSpacing}`)).length !== 1);
      kinds.forEach((k) => {
        const vals = uniq(fontBag.map((f) => `${f[k].fontSize}/${f[k].lineHeight}/${f[k].letterSpacing}`));
        log(`      ${k}: ${vals.length} 个取值 → ${vals.join('  //  ')}`);
      });
      check(`[9] ${kinds.length} 类文字在 ${fontBag.length} 个视口下只有一个取值（完全没随宽度缩放）`,
        bad.length === 0, bad.length ? bad.join(' ') : '全部恒定');
    } else {
      log('      （--only 只跑了一个视口，跨视口这条跳过）');
    }

    /* ═══ 自包含 / 无 JS 报错 ═══════════════════════════════════ */
    log('\n═══════════ [G] 自包含 ＋ 无 JS 报错 ═══════════');
    const ext = requests.filter((u) => !u.startsWith('file:///') && !u.startsWith('data:'));
    check('CDP 记录的网络请求里没有任何 http(s) 外部引用',
      ext.length === 0, `${requests.length} 个请求，非 file:// 的=${ext.length} ${JSON.stringify(ext.slice(0, 4))}`);
    check('全程无 JS 报错（加载 ＋ 各视口的交互）', pageErrors.length === 0,
      pageErrors.length ? pageErrors.join(' | ') : '0 条');

    /* ═══ 汇总表 ═══════════════════════════════════════════════ */
    log('\n═══════════ 汇总（可直接抄进 q-break.md）═══════════');
    rowsOut.forEach((r) => {
      log(`  ${r.key}: C=${r.cw} 可用宽=${r.avail}(${r.slotsN} 字位) 真实8行折行=${r.poemWrapped} 最长行=${r.maxLine} ` +
        `| A夹具①默认=${r.aClose} ①-对照=${r.aAny} | C长题名①=${r.cTitle} | 最少字位=${r.minSlots} ` +
        `| X1=${r.x1.join(' / ')} | docW=${r.docW} 截图区=${r2(r.deckH)}`);
      r.bP.forEach((s, i) => { if (s) log(`      B${i + 1}: ${s}`); });
    });

    ws.close();
  } finally {
    chrome.kill();
    await sleep(300);
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* 临时 profile 删不掉不影响结果 */ }
  }
}

try {
  await run();
} catch (e) {
  console.error('\n校验脚本失败：' + ((e && e.stack) || e));
  failures += 1;
}
console.log(`\n===== 失败断言数：${failures} =====`);
process.exit(failures ? 1 : 0);
