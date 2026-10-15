/*
 * check-responsive.mjs —— 「跨页宽度自适应」讨论原型的【页面行为】自证脚本（可复跑）。
 *
 * ⚠ 它验的是**这一个原型页面**的页面行为，**不是产品代码**：
 *   对象只有本目录下的 q-responsive.html（**只读打开**：Page.navigate 到 file:// URL，脚本不写、不改它）。
 *   它不跑 web/ 与 android/ 的任何测试，也不读产品实现。额外读的文件只有两个，都是**只读**：
 *     ① prototype/css/theme-tech.css      —— 用来逐项比对页面内嵌的令牌快照；
 *     ② content/poems/gushi-shijiu-shou-01.md —— 用它的正文 8 行做「原文逐行一致」的基准。
 *
 * 它回答的问题只有一条：**换宽度时怎么办**。所以它的核心断言是「**每个宽度用真实 CSS px**」：
 *   innerWidth === 目标宽、documentElement.scrollWidth === 目标宽、没有横向溢出、可见元素都在视口内。
 *
 * 覆盖的视口（**每档都单独跑一遍全部断言，并各出一张 PNG**）：
 *   360×932 ／ 390×844 ／ 412×915 ／ 430×932（手机，mobile=true）
 *   834×1112（平板）／ 1180×900（桌面）（mobile=false）
 *   740×360（横屏，mobile=true）
 *   ⚠ 图是**一个宽度一张**（真实 CSS px @DPR 2）；**没有**把不同宽度拼成缩放对照图。
 *
 * 断言清单（失败任一即 exit 1）：
 *  [G] 全局（只跑一次）：令牌快照逐项比对（值不一致数必须 0）、自包含（非 file:// 请求 0 个／页面文本无
 *      <link / src= / @import / http(s)://）、无 JS 报错、页面里写明了覆盖宽度清单与「诗页水平对齐未选定」这条限制。
 *  [1] 结构：5 个档位块；每块（未折叠时）含 目录页 ＋ 诗页 两页；目录页有「关于」1 个、组头 1 个、19+1 行；
 *      诗页有 返回 1 个、详情 1 个、题名 1 个、身份行 1 个、原文恰好 **8 行**且**逐行与源文件逐字相同**；
 *      反向：可见文本里不出现 搜索／笔记标记／版本号／应用名／底名／来源／异文。
 *  [2] 每个视口：innerWidth／innerHeight 精确等于目标；docW === bodyW === 目标宽；所有可见元素在 0…目标宽 内。
 *  [3] **折叠判定**：页面自己标的 data-folded 集合，必须与脚本**独立按规格重算**的集合完全一致
 *      （「本视口下与前面某档全同」的档位折叠成一行说明；这是页面自己的响应行为，必须两边一致）。
 *  [4] **宽度行为逐档实测**：列宽 ＝ min(视口宽, 该档上限)（目录页与诗页分别算）；两侧留白 ＝(视口宽−列宽)/2 且左右相等；
 *      ② 的上限**必须**是令牌 --measure 的值（660px）—— 不是本轮新取的数。
 *  [5] 已定的目录页关系在**每个宽度**都成立：记号左沿＝列左沿；缝＝0.4rem；记号与组名首字竖直居中对齐；
 *      题名左沿＝组名左沿（缩进 0）；作者紧随题名、不右对齐；「关于」右沿＝列右沿−行内沿。
 *  [6] 已定的诗页关系在**每个宽度**都成立：题名／身份行／正文 三块同一竖线（＝列左沿＋行内沿）；
 *      题名→身份 0.7rem、身份→原文 2.1rem；返回与详情**同一行的两端**且都在正文之上；诗页内**没有**页脚行。
 *  [7] **字号不随宽度缩放**：7 个视口下，题名／身份行／正文／诗题／作者／组名／计数／记号／关于／控件 的
 *      字号·行高·字距 **完全一致**（每个都只有 1 个取值），并与令牌一致。
 *  [8] **正文行长**：8 行全部未折行；最长一行＝12 字 ×（17px＋0.045em）＝213.19px（±2）；每条都 ≤ 正文可用宽。
 *  [9] **页面自报数字 ＝ 脚本独立实测**（±0.6px）：列宽／留白／行内沿／组名左沿／记号左沿／缝／正文可用宽／
 *      「≈多少汉字/行」／最长行文字宽／顶部行左右沿／「关于」右沿／题名→身份／身份→原文／夹具行折几行。
 *  [10] 目录页交互（真鼠标）：首态**全部收起**（可见诗目 0 行）⇒ 点组头展开（可见 20 行：19 首＋1 条夹具行）⇒ 再点收起。
 *  [11] **夹具行的折行是「上限」这一条在这个内容上唯一看得见的作用**：360 折 3 行、430 折 2 行、
 *      1180 且上限 660 折 2 行、1180 且上限 860 折 1 行（同一段文字，只有列宽不同）。
 *  [12] 窄屏（≤430）单独证：无横向溢出；组头单行；正文 8 行不折行；⑤ 在 ≤400 视口下把行内沿收到 0.75rem
 *      （与 ① 相差 4.8px），而 412／430 下 ⑤ 与 ② 相同（⇒ 折叠）。
 *  [13] 横屏 740×360 单独证：innerHeight＝360；文档必须滚动（docH > 360）；诗页实例高度 > 360（8 行放不下）
 *      ⇒ 打印「首屏可见的完整行数」；⑤ 的横屏档确实收紧了题头（11.2→5.6、33.6→19.2），而 ② 没有。
 *  [14] 展开之后再查一次「无横向溢出」（每个视口）。
 *  [15] 看图态（#shot）：① 首态仍是**全收起**（重查一次）；② **不改变任何排布规则**（列宽／留白／内沿与
 *      普通态逐一相等）；③ 每块目录页只显示前 3 行 ＋ 1 条说明条。
 *  [16] PNG：每个视口一张；像素宽 ＝ 视口宽 × 2、像素高 ＝ 截图区 CSS 高 × 2（自己解析 PNG 头读 IHDR，
 *      不装图片库）；文件非空。
 *
 * 怎么跑（在仓库根或任意目录都行）：
 *   node items/app-ui/prototypes/check-responsive.mjs
 *   node items/app-ui/prototypes/check-responsive.mjs --no-shot    # 只跑断言，不重出 PNG
 *   node items/app-ui/prototypes/check-responsive.mjs --only=1180  # 只跑某一个视口（排查用）
 *
 * 需要什么：
 *   - Node（用到内置的 fetch / WebSocket / net，故需较新的 Node；本机实测 v25.9.0 通过）；
 *   - **本机无头 Chromium**。顺序：环境变量 `CHROME_BIN` → 否则按 `%LOCALAPPDATA%\Chromium\Application\chrome.exe` 推。
 *     找不到就**如实报错并 exit 2**（`CHROME_BIN` 指到错路径也走这一条，不会假装通过）。
 *   - **不需要**任何 npm 依赖：不装包、不联网、不起静态服务（直接开 file://）。
 *   - **端口**：CDP 调试端口**先向内核要一个空闲端口**（net 监听 0 再关掉），**不写死**
 *     —— 本仓真的发生过「两边同时跑撞端口」。
 *   - **仓库根**：从脚本所在目录**向上查找 prototype/css/theme-tech.css** 来定位，
 *     **不写死层级**（整轮搬进 history/ 也不会指错）。
 *
 * 副作用（说清，免得复跑后以为工作树坏了）：
 *   - 会在**临时目录**建一个 Chromium profile，结束时删掉；
 *   - **默认会重写**本目录下的 7 张 PNG（q-responsive.<宽>.png / q-responsive.740x360.png）。
 *     不同 Chromium 版本／字体渲染可能让字节数变化 ⇒ **复跑可能让这些 PNG 变脏**，那是正常现象。
 *     只想看断言就加 `--no-shot`。
 *   - q-responsive.html 本身**只读打开**，不写、不改。
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const OUT = dirname(fileURLToPath(import.meta.url));       // 本脚本所在目录＝原型目录
const ROOT = (() => {
  // 搬迁时改成「向上查找」：原写法是 join(OUT,'..','..','..')，一旦整轮搬进 history/ 就会指到 items/。
  let d = OUT;
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(d, 'prototype', 'css', 'theme-tech.css'))) return d;
    d = dirname(d);
  }
  throw new Error('找不到仓库根：从 ' + OUT + ' 向上查找 prototype/css/theme-tech.css 失败');
})();
const SHOT = !process.argv.includes('--no-shot');
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const ONLY = onlyArg ? onlyArg.slice(7) : null;

/* 覆盖的视口（任务书要求的最低覆盖：360/390/412/430/834/1180 ＋ 横屏至少一档） */
const CASES = [
  { key: '360', w: 360, h: 932, mobile: true, label: '手机 · 窄屏' },
  { key: '390', w: 390, h: 844, mobile: true, label: '手机' },
  { key: '412', w: 412, h: 915, mobile: true, label: '手机' },
  { key: '430', w: 430, h: 932, mobile: true, label: '手机（前几轮的验收宽）' },
  { key: '834', w: 834, h: 1112, mobile: false, label: '平板' },
  { key: '1180', w: 1180, h: 900, mobile: false, label: '桌面' },
  { key: '740x360', w: 740, h: 360, mobile: true, label: '横屏（矮而宽）' },
];
const MD_PATH = join(ROOT, 'content', 'poems', 'gushi-shijiu-shou-01.md');

/* ── 规格（脚本这一侧的独立实现；页面那一侧是它自己写的，两边必须一致）──────────
 * 每档只改自己那一条：
 *   ① 无上限 · ② 上限 660px（令牌 --measure）· ③ 上限 860px · ④ 正文 660／目录页 860
 *   ⑤ ＝② ＋ 窄屏（≤400px 行内沿 12px）／矮横屏（高≤420 且宽≥600 时收紧诗页题头）
 */
const EDGE = 16.8;          // 1.05rem —— 行内沿（列内那一层）
const EDGE_NARROW = 12;     // 0.75rem —— ⑤ 的窄屏档
const SEAM = 6.4;           // 0.4rem —— 记号右沿 → 组名左沿（已定）
const CAPS = {
  b1: { hub: Infinity, poem: Infinity, knob: '无上限（对照）' },
  b2: { hub: 660, poem: 660, knob: '上限 660px（令牌 --measure）' },
  b3: { hub: 860, poem: 860, knob: '上限 860px' },
  b4: { hub: 860, poem: 660, knob: '正文 660 ／ 目录页 860' },
  b5: { hub: 660, poem: 660, knob: '＝② ＋ 窄屏／矮横屏密度档' },
};
const ORDER = ['b1', 'b2', 'b3', 'b4', 'b5'];
function plan(inst, W, H) {
  const c = CAPS[inst];
  return {
    colHub: Math.min(W, c.hub),
    colPoem: Math.min(W, c.poem),
    edge: (inst === 'b5' && W <= 400) ? EDGE_NARROW : EDGE,
    tight: (inst === 'b5' && W >= 600 && H <= 420),
  };
}
const sig = (p) => [p.colHub, p.colPoem, p.edge, p.tight].join('|');
function expectedFold(W, H) {
  const plans = ORDER.map((b) => plan(b, W, H));
  const folded = {};
  ORDER.forEach((b, i) => {
    for (let j = 0; j < i; j += 1) if (sig(plans[j]) === sig(plans[i])) { folded[b] = ORDER[j]; return; }
  });
  return { plans, folded };
}

/* ── 找 Chromium：CHROME_BIN 优先，否则 %LOCALAPPDATA%\Chromium\Application\chrome.exe */
const CHROME = process.env.CHROME_BIN
  || join(process.env.LOCALAPPDATA || '', 'Chromium', 'Application', 'chrome.exe');
if (!CHROME || !existsSync(CHROME)) {
  console.error('找不到无头 Chromium：' + (CHROME || '(未设置)'));
  console.error('请用环境变量指定，例如：');
  console.error("  CHROME_BIN='C:/Users/wsqsy/AppData/Local/Chromium/Application/chrome.exe' \\");
  console.error('    node items/app-ui/prototypes/check-responsive.mjs');
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
const mdStanzas = [];
{
  let cur = [];
  for (const raw of mdLines.slice(bodyStart)) {
    const t = raw.trim();
    if (t === '') { if (cur.length) { mdStanzas.push(cur); cur = []; } } else cur.push(t);
  }
  if (cur.length) mdStanzas.push(cur);
}
const mdFlat = mdStanzas.flat();
if (mdFlat.length !== 8) {
  console.error('源文件正文不是 8 行（而是 ' + mdFlat.length + ' 行）⇒ 本轮口径向变了，先看需求再改断言：' + MD_PATH);
  process.exit(2);
}

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
const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;
const uniq = (a) => Array.from(new Set(a));
function pngSize(buf) { return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }; }
function parseTokens(cssText) {
  const m = new Map();
  const clean = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /(--[A-Za-z0-9_-]+)\s*:\s*([^;]+);/g;
  let x;
  while ((x = re.exec(clean))) m.set(x[1], x[2].replace(/\s+/g, ' ').trim());
  return m;
}
function declarationBlock(htmlText, begin, end) {
  const a = htmlText.indexOf(begin), b = htmlText.indexOf(end);
  if (a < 0 || b < 0 || b < a) return null;
  return htmlText.slice(a, b);
}

/* 页面侧量测：一次性把所有需要的几何取回来（脚本自己的实现，不依赖页面的自报数字） */
const MEASURE = `(function(){
  var R = function(e){ var r = e.getBoundingClientRect(); return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height }; };
  var px = function(v){ return Math.round(v*100)/100; };
  var textW = function(e){ var rg = document.createRange(); rg.selectNodeContents(e); var rs = rg.getClientRects(), w = 0;
    for (var i=0;i<rs.length;i++) w = Math.max(w, rs[i].width); return px(w); };
  var cs = function(e, props){ var c = getComputedStyle(e), o = {}; props.forEach(function(p){ o[p] = c[p]; }); return o; };
  var demos = [];
  var ds = document.querySelectorAll('[data-test="demo"]');
  for (var i=0;i<ds.length;i++){
    var d = ds[i];
    var capEl = d.querySelector('[data-test="cap"]');
    var o = { block: d.dataset.block, folded: d.dataset.folded === '1',
      capSrc: capEl.dataset.mSrc || null, cap: {}, topDelta: d.dataset.mTopDelta || null,
      pages: [], hub: null, poem: null };
    ['mW','mH','mColHub','mColPoem','mGlHub','mGlPoem','mEdge','mNameX','mMarkLeft','mSeam','mAvail','mCpl','mMaxLine','mTopL','mTopR','mAboutR','mTitleGap','mBodyGap','mFxLines','mFxW'].forEach(function(k){ o.cap[k] = capEl.dataset[k]; });
    var pgs = d.querySelectorAll('[data-test="page"]');
    for (var p=0;p<pgs.length;p++){
      var pg = pgs[p];
      var col = pg.querySelector('[data-test="col"]');
      var cr = R(col), pr = R(pg);
      var gs = pg.querySelectorAll('[data-test="guide"]');
      o.pages.push({ page: pg.dataset.page, colLeft: px(cr.left), colRight: px(cr.right), colW: px(cr.width),
        pageLeft: px(pr.left), pageW: px(pr.width),
        guides: Array.prototype.map.call(gs, function(g){ return px(R(g).left); }) });
    }
    if (!o.folded) {
      var hub = d.querySelector('[data-page="hub"]');
      var hcol = hub.querySelector('[data-test="col"]');
      var hcr = R(hcol);
      var gname = hub.querySelector('[data-test="gname"]'), gmark = hub.querySelector('[data-test="gmark"]');
      var about = hub.querySelector('[data-test="about"]'), gcount = hub.querySelector('[data-test="gcount"]');
      var ghead = hub.querySelector('[data-test="ghead"]'), list = hub.querySelector('[data-test="glist"]');
      var gr = R(gname), mr = R(gmark), ar = R(about), gcr = R(gcount), hr = R(ghead);
      var rows = [];
      var rws = hub.querySelectorAll('[data-test="row"]');
      for (var k=0;k<rws.length;k++){
        var rw = rws[k];
        var pt = rw.querySelector('.ptitle'), pa = rw.querySelector('.pauthor');
        var plink = rw.querySelector('.plink');
        var vis = rw.getBoundingClientRect().height > 0;
        rows.push({ fx: rw.dataset.fx === '1', visible: vis,
          plinkPadLeft: parseFloat(getComputedStyle(plink).paddingLeft),
          plinkPadRight: parseFloat(getComputedStyle(plink).paddingRight),
          rowW: px(R(rw).width), rowH: px(R(rw).height),
          titleLeft: px(R(pt).left), titleRight: textW(pt) === 0 ? null : px(R(pt).left + textW(pt)),
          badgeLeft: rw.querySelector('.fxbadge') ? px(R(rw.querySelector('.fxbadge')).left) : null,
          titleLineBoxes: pt.getClientRects().length, titleMaxLineW: textW(pt),
          authorLeft: px(R(pa).left), authorRight: px(R(pa).right), authorTop: px(R(pa).top),
          titleTop: px(R(pt).top), titleBottom: px(R(pt).bottom) });
      }
      var gheadFonts = cs(ghead, ['fontSize']), listHidden = list.hidden;
      var ns = cs(gname, ['fontSize','lineHeight','letterSpacing','color']);
      var ms = cs(gmark, ['fontSize','lineHeight','letterSpacing','color']);
      var ctlTop = hub.querySelector('[data-test="topline"]');
      o.hub = { colLeft: px(hcr.left), colRight: px(hcr.right), colW: px(hcr.width),
        gnameLeft: px(gr.left), gnameRight: px(gr.right), nameX: px(gr.left - hcr.left),
        gmarkLeft: px(mr.left), gmarkRight: px(mr.right), gmarkW: px(mr.width),
        markLeftRel: px(mr.left - hcr.left), seam: px(gr.left - mr.right),
        gmarkCenter: px((mr.top + mr.bottom) / 2), gnameCenter: px((gr.top + gr.bottom) / 2),
        gheadH: px(hr.height), gcountRight: px(hcr.right - gcr.right),
        aboutLeft: px(ar.left - hcr.left), aboutRight: px(hcr.right - ar.right),
        topLineBottom: px(R(ctlTop).bottom), gheadTop: px(hr.top),
        listHidden: listHidden, gheadExpanded: ghead.getAttribute('aria-expanded'),
        gheadTag: ghead.tagName, gheadType: ghead.getAttribute('type'),
        markText: gmark.textContent, gheadFontSize: gheadFonts.fontSize,
        gnameFont: ns, gmarkFont: ms, rows: rows,
        visibleRows: rows.filter(function(x){ return x.visible; }).length };
      var poem = d.querySelector('[data-page="poem"]');
      var pcol = poem.querySelector('[data-test="col"]');
      var pcr = R(pcol);
      var back = poem.querySelector('[data-test="back"]'), detail = poem.querySelector('[data-test="detail"]');
      var title = poem.querySelector('[data-test="title"]'), ident = poem.querySelector('[data-test="ident"]');
      var body = poem.querySelector('[data-test="poem"]'), head = poem.querySelector('[data-test="head"]');
      var br = R(back), dr = R(detail), tr = R(title), ir = R(ident), bor = R(body);
      var lines = poem.querySelectorAll('[data-test="line"]');
      var ls = [];
      for (var q=0;q<lines.length;q++){
        var rr = R(lines[q]);
        ls.push({ text: lines[q].textContent, w: textW(lines[q]), left: px(rr.left), right: px(rr.right),
          top: px(rr.top), bottom: px(rr.bottom), h: px(rr.height) });
      }
      var bodyFont = cs(body, ['fontSize','lineHeight','letterSpacing','paddingTop','paddingBottom']);
      o.poem = { colLeft: px(pcr.left), colRight: px(pcr.right), colW: px(pcr.width),
        backLeft: px(br.left - pcr.left), detailRight: px(pcr.right - dr.right),
        backTop: px(br.top), detailTop: px(dr.top),
        titleLeft: px(tr.left - pcr.left), identLeft: px(ir.left - pcr.left),
        firstLineLeft: px(ls[0].left - pcr.left), firstLineTop: px(ls[0].top),
        lastLineBottom: px(ls[ls.length-1].bottom),
        titleBottom: px(tr.bottom), identTop: px(ir.top), identBottom: px(ir.bottom),
        bodyTop: px(bor.top), bodyContentTop: px(bor.top + parseFloat(bodyFont.paddingTop)),
        headBottom: px(R(head).bottom),
        titleGap: px(ir.top - tr.bottom), bodyGap: px(bor.top + parseFloat(bodyFont.paddingTop) - ir.bottom),
        headBorderBottom: getComputedStyle(head).borderBottomWidth,
        footCount: poem.querySelectorAll('[data-test="foot"]').length,
        lines: ls, lineCount: ls.length,
        wrappedLines: ls.filter(function(l){ return l.h > parseFloat(bodyFont.lineHeight) + 1; }).length,
        maxLine: Math.max.apply(null, ls.map(function(l){ return l.w; })),
        bodyFont: bodyFont,
        fonts: { title: cs(title, ['fontSize','lineHeight','letterSpacing']),
                 ident: cs(ident, ['fontSize','lineHeight','letterSpacing']),
                 ctl: cs(back, ['fontSize','lineHeight','letterSpacing']) },
        po: {} };
      o.poem.po = { title: cs(title,['fontSize']).fontSize };
    }
    demos.push(o);
  }
  var all = document.querySelectorAll('body *'), maxRight = -1e9, minLeft = 1e9, mrEl = '', mlEl = '';
  var name = function(e){ return e.tagName.toLowerCase() + ((typeof e.className === 'string' && e.className) ? '.' + e.className.trim().split(/\\s+/).join('.') : ''); };
  for (var z=0;z<all.length;z++){
    var r = all[z].getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.right > maxRight) { maxRight = r.right; mrEl = name(all[z]); }
    if (r.left < minLeft) { minLeft = r.left; mlEl = name(all[z]); }
  }
  var ro = demos.filter(function(d){ return !d.folded; })[0];
  return JSON.stringify({ innerW: window.innerWidth, innerH: window.innerHeight,
    docW: document.documentElement.scrollWidth, docH: document.documentElement.scrollHeight,
    bodyW: document.body.scrollWidth, maxRight: px(maxRight), maxRightEl: mrEl,
    minLeft: px(minLeft), minLeftEl: mlEl,
    shot: document.documentElement.dataset.shot === '1',
    deck: (function(){ var e = document.querySelector('[data-shotframe]'); if (!e) return null;
      var r = e.getBoundingClientRect(); return { x: px(r.left), y: px(r.top + window.scrollY), w: px(r.width), h: px(r.height) }; })(),
    globalFonts: ro ? { ptitle: (function(){ var e = document.querySelector('[data-page="hub"] .ptitle'); return cs(e, ['fontSize','lineHeight','letterSpacing']); })(),
      about: (function(){ var e = document.querySelector('[data-test="about"]'); return cs(e, ['fontSize','lineHeight','letterSpacing']); })(),
      gname: ro.hub.gnameFont, gmark: ro.hub.gmarkFont, gcount: (function(){ var e = document.querySelector('[data-test="gcount"]'); return cs(e, ['fontSize','lineHeight','letterSpacing']); })(),
      pauthor: (function(){ var e = document.querySelector('[data-page="hub"] .pauthor'); return cs(e, ['fontSize','lineHeight','letterSpacing']); })() } : null,
    demos: demos });
})()`;

async function run() {
  const port = await freePort();
  const profile = mkdtempSync(join(tmpdir(), 'qresp-'));
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--disable-background-networking',
    '--disable-component-update', '--disable-sync', '--remote-allow-origins=*',
    '--user-data-dir=' + profile, '--remote-debugging-port=' + port, 'about:blank',
  ], { stdio: 'ignore' });
  log(`CDP 端口（内核分配的空闲端口）：${port}`);
  log(`仓库根（从脚本目录向上查找 prototype/css/theme-tech.css）：${ROOT}`);

  try {
    for (let i = 0; i < 100; i += 1) {
      try { const r = await fetch(`http://127.0.0.1:${port}/json/version`); if (r.ok) break; } catch { /* 起得慢，继续等 */ }
      if (i === 99) throw new Error('Chromium 的 devtools 端口没起来');
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
    async function clickGhead(block) {
      const c = JSON.parse(await js(`(function(){
        var d = document.querySelector('[data-test="demo"][data-block="${block}"]');
        var e = d.querySelector('[data-test="ghead"]');
        e.scrollIntoView({ block: 'center' });
        var r = e.getBoundingClientRect();
        var x = (r.left + r.right) / 2, y = (r.top + r.bottom) / 2;
        var hit = document.elementFromPoint(x, y);
        return JSON.stringify({ x: Math.round(x*10)/10, y: Math.round(y*10)/10,
          hitIsE: hit ? (hit === e || e.contains(hit)) : false, hitTag: hit ? hit.tagName : '(无)',
          tag: e.tagName, type: e.getAttribute('type') });
      })()`));
      if (!c.hitIsE) return c;
      await clickAt(c.x, c.y);
      await sleep(120);
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

    const htmlFile = join(OUT, 'q-responsive.html');
    const htmlText = readFileSync(htmlFile, 'utf8');
    const url = 'file:///' + htmlFile.replace(/\\/g, '/');
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
    log(`原型页（只读打开）：${htmlFile}`);
    log(`源文件基准（只读）：${MD_PATH}  段数=${mdStanzas.length}  行数=${mdFlat.length}`);
    log(`当前 HEAD=${gitHead}；theme-tech.css 相对 HEAD ${themeClean === null ? '未知' : (themeClean ? '无改动' : '有未提交改动')}`);

    /* ═══ [G] 全局断言（只跑一次）══════════════════════════════════ */
    log('\n═══════════ [G] 全局：令牌快照 / 自包含 / 页面里写明的口径 ═══════════');
    const snapText = declarationBlock(htmlText, '== TOKEN-SNAPSHOT-BEGIN ==', '== TOKEN-SNAPSHOT-END ==');
    const draftText = declarationBlock(htmlText, '== DRAFT-VALUES-BEGIN ==', '== DRAFT-VALUES-END ==');
    const snap = snapText ? parseTokens(snapText) : new Map();
    const draft = draftText ? parseTokens(draftText) : new Map();
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
    check('快照里没有「声明了却没用」的令牌；页面里用到的每个 var() 都有声明（快照或草案块）',
      undeclared.length === 0 && unusedSnap.length === 0,
      `未声明=${JSON.stringify(undeclared)} 快照未用=${JSON.stringify(unusedSnap)}`);
    const shaRecorded = (htmlText.match(/仓库提交：([0-9a-f]{7,40})/) || [])[1] || '(没记录)';
    check('页面记录了令牌快照的来源提交（短 sha）＋写明「权威仍是 docs/design/visual-tokens.md」',
      /^[0-9a-f]{7,40}$/.test(shaRecorded) && htmlText.includes('权威仍是 docs/design/visual-tokens.md'),
      `记录=${shaRecorded}（当前 HEAD=${gitHead}）`);
    check('页面里写明了覆盖宽度清单（360/390/412/430/834/1180/740×360）',
      ['360', '390', '412', '430', '834', '1180', '740×360'].every((s) => htmlText.includes(s)),
      '覆盖宽度与图名在说明段落里写明');
    check('页面里写明了「诗页水平对齐尚未选定」这条限制（本轮不把它当已选项）',
      htmlText.includes('诗页的「水平对齐」尚未选定') && htmlText.includes('不是一个已选项'),
      '限制写在说明段落里，且写明本页用的是「三块同一竖线」基线');
    check('页面里写明了「选某一档 ≠ 采纳整页规格」与「不决定 JSON/MD 分界、不决定产物字段」',
      htmlText.includes('选某一档 ≠ 采纳整页规格') && htmlText.includes('本页不决定 JSON/MD 分界'),
      '两条口径都在说明段落里');
    check('页面里写明了「关于页／详情页本轮不含」',
      htmlText.includes('关于页／详情页的表达还没做 ⇒ 本轮不含'), '范围限制写明');

    /* ═══ 逐视口 ═════════════════════════════════════════════════ */
    const fontBag = [];    // [7] 字号不随宽度缩放
    const rowsOut = [];    // 给 .md 用的实测数字
    const cases = ONLY ? CASES.filter((c) => c.key === ONLY) : CASES;
    if (!cases.length) throw new Error('--only= 没匹配到视口：' + ONLY);

    for (const C of cases) {
      const { w: W, h: H } = C;
      const exp = expectedFold(W, H);
      log(`\n═══════════════════════════════════════════════════════════════`);
      log(`═══ 视口 ${C.key}（${C.w}×${C.h}，${C.label}，mobile=${C.mobile}，DPR 2）═══`);
      log(`═══════════════════════════════════════════════════════════════`);
      await load(url, W, H, C.mobile);
      let M = await measure();
      let shownDemos = M.demos.filter((d) => !d.folded);

      // ---- [2] 真实 CSS px + 无横向溢出 ----
      log('\n[2] 真实 CSS px：innerWidth／scrollWidth 精确等于目标宽，无横向溢出');
      check(`innerWidth === ${W}，innerHeight === ${H}`,
        M.innerW === W && M.innerH === H, `实测 innerWidth=${M.innerW} innerHeight=${M.innerH}`);
      check(`documentElement.scrollWidth === body.scrollWidth === ${W}（没有横向溢出）`,
        M.docW === W && M.bodyW === W, `docScrollWidth=${M.docW} bodyScrollWidth=${M.bodyW}`);
      check(`所有可见元素都在 0…${W} 之内`,
        M.maxRight <= W + 0.5 && M.minLeft >= -0.5,
        `maxRight=${M.maxRight}(${M.maxRightEl}) minLeft=${M.minLeft}(${M.minLeftEl})`);

      // ---- [3] 折叠判定 ----
      log('\n[3] 折叠判定：页面自报 vs 脚本按规格独立重算');
      const pageFolded = {};
      M.demos.forEach((d) => { pageFolded[d.block] = d.folded ? true : false; });
      const expFoldOk = ORDER.every((b) => (pageFolded[b] === true) === (exp.folded[b] !== undefined));
      check('5 个档位块都渲染出来了（顺序 b1…b5）',
        M.demos.length === 5 && M.demos.map((d) => d.block).join(',') === ORDER.join(','),
        M.demos.map((d) => d.block + (d.folded ? '(折叠)' : '(渲染)')).join(' '));
      check('每个档位的「渲染／折叠」与脚本按规格重算的一致',
        expFoldOk,
        ORDER.map((b) => {
          const p = plan(b, W, H);
          return `${b}:${pageFolded[b] ? '折叠' : '渲染'}（列宽 ${r2(p.colHub)}/${r2(p.colPoem)}，内沿 ${p.edge}${p.tight ? '，横屏紧' : ''}${exp.folded[b] ? '＝' + exp.folded[b] : ''}）`;
        }).join(' | '));
      log(`      折叠的档位：${ORDER.filter((b) => pageFolded[b]).join(',') || '（没有）'}；渲染的档位：${ORDER.filter((b) => !pageFolded[b]).join(',')}`);

      // ---- [4] 宽度行为 ----
      log('\n[4] 宽度行为逐档实测（列宽／两侧留白／行内沿）');
      const colOk = [], gutOk = [], edgeOk = [];
      shownDemos.forEach((d) => {
        const p = plan(d.block, W, H);
        const hubPg = d.pages.find((x) => x.page === 'hub'), poemPg = d.pages.find((x) => x.page === 'poem');
        const okHub = near(hubPg.colW, p.colHub, 0.6), okPoem = near(poemPg.colW, p.colPoem, 0.6);
        const glHub = hubPg.colLeft, grHub = W - hubPg.colRight;
        const glPoem = poemPg.colLeft, grPoem = W - poemPg.colRight;
        colOk.push(okHub && okPoem);
        gutOk.push(near(glHub, (W - p.colHub) / 2, 0.6) && near(grHub, (W - p.colHub) / 2, 0.6)
          && near(glPoem, (W - p.colPoem) / 2, 0.6) && near(grPoem, (W - p.colPoem) / 2, 0.6)
          && near(glHub, grHub, 0.01) && near(glPoem, grPoem, 0.01));
        edgeOk.push(d.pages.every((x) => near(x.pageLeft, 0, 0.6) && near(x.pageW, W, 0.6)));
        log(`      ${d.block}（${CAPS[d.block].knob}）：目录页列宽 ${hubPg.colW}／诗页列宽 ${poemPg.colW}｜留白 ${r2(glHub)}＋${r2(grHub)}／${r2(glPoem)}＋${r2(grPoem)}｜行内沿 ${d.cap.mEdge}（脚本按规格 ${p.edge}）` +
          `｜脚本推算列宽 ${r2(p.colHub)}／${r2(p.colPoem)}`);
      });
      check('列宽 ＝ min(视口宽, 该档上限)（目录页与诗页分别算；±0.6px）',
        colOk.every(Boolean), shownDemos.map((d) => `${d.block}:${d.pages.map((x) => r2(x.colW)).join('/')}`).join(' '));
      check('两侧留白 ＝(视口宽−列宽)/2，且左右相等（居中；±0.6px）',
        gutOk.every(Boolean), shownDemos.map((d) => `${d.block}:${r2(d.pages[0].colLeft)}`).join(' '));
      check('每个「应用页面」本身就展满视口宽（.pg 宽＝视口宽、左沿 0）—— 留白是**列外**那一层',
        edgeOk.every(Boolean), shownDemos.map((d) => `${d.block}:${d.pages.map((x) => r2(x.pageW)).join('/')}`).join(' '));
      check('② 的上限就是令牌 --measure 的值（660px），不是本轮新取的数',
        plan('b2', W, H).colHub === Math.min(W, 660) && htmlText.includes('--cmax: var(--measure)'),
        `--measure=${themeTokens.get('--measure')}；② 在 ${W} 下实测列宽 ${r2(plan('b2', W, H).colHub)}`);

      // ---- [5] 已定的目录页关系：【移到展开之后】见下面 [5] 段 ----

      // ---- [6] 已定的诗页关系 ----
      log('\n[6] 已定的诗页关系（三块同一竖线／间距／返回与详情同一行／没有页脚行）');
      const alignOk = [], gapOk = [], topOk = [], footOk = [];
      shownDemos.forEach((d) => {
        const p = plan(d.block, W, H);
        const P = d.poem;
        alignOk.push(near(P.titleLeft, P.identLeft, 0.6) && near(P.titleLeft, P.firstLineLeft, 0.6) && near(P.titleLeft, p.edge, 0.6));
        gapOk.push(near(P.titleGap, p.tight ? 5.6 : 11.2, 1.0) && near(P.bodyGap, p.tight ? 19.2 : 33.6, 1.0));
        topOk.push(near(P.backTop, P.detailTop, 1.0) && P.backTop < P.firstLineTop && near(P.backLeft, p.edge, 0.6) && near(P.detailRight, p.edge, 0.6));
        footOk.push(P.footCount === 0 && P.lastLineBottom < P.lines[P.lines.length - 1].bottom + 1);
        log(`      ${d.block}：题名/身份/正文左沿 ${P.titleLeft}／${P.identLeft}／${P.firstLineLeft}（行内沿 ${p.edge}）` +
          `｜题名→身份 ${P.titleGap}、身份→原文 ${P.bodyGap}${p.tight ? '（⑤ 横屏档收紧）' : ''}` +
          `｜返回 +${P.backLeft} 与详情 −${P.detailRight} 同一行（顶差 ${r2(Math.abs(P.backTop - P.detailTop))}，都高于正文首行 ${P.firstLineTop}）｜页脚行 ${P.footCount} 个`);
      });
      check('诗页 题名／身份行／正文 三块同一竖线（＝列左沿＋行内沿；本页用的是这条基线，**不是**已选项）',
        alignOk.every(Boolean), shownDemos.map((d) => `${d.block}:${d.poem.titleLeft}`).join(' '));
      check('题名→身份 0.7rem、身份→原文 2.1rem（⑤ 的矮横屏档收成 0.35rem／1.2rem；±1px）',
        gapOk.every(Boolean), shownDemos.map((d) => `${d.block}:${d.poem.titleGap}/${d.poem.bodyGap}`).join(' '));
      check('返回与详情**同在顶部一行**的两端，且都在正文之上',
        topOk.every(Boolean), shownDemos.map((d) => `${d.block}:Δtop${r2(Math.abs(d.poem.backTop - d.poem.detailTop))}`).join(' '));
      check('诗页正文之后**没有**页脚行（本轮已定）', footOk.every(Boolean), '诗页内 [data-test="foot"] 计数为 0');

      // ---- [7] 字号不随宽度缩放 ----
      const gf = M.globalFonts;
      const first = shownDemos[0];
      fontBag.push({
        w: W,
        title: JSON.stringify(first.poem.fonts.title),
        ident: JSON.stringify(first.poem.fonts.ident),
        line: JSON.stringify({ f: first.poem.bodyFont.fontSize, l: first.poem.bodyFont.lineHeight, s: first.poem.bodyFont.letterSpacing }),
        ctl: JSON.stringify(first.poem.fonts.ctl),
        ptitle: JSON.stringify(gf.ptitle), about: JSON.stringify(gf.about),
        gname: JSON.stringify(gf.gname), gmark: JSON.stringify(gf.gmark), gcount: JSON.stringify(gf.gcount),
        pauthor: JSON.stringify(gf.pauthor),
      });
      check('正文 = 17px／行高 34px／字距 0.765px（这套视觉的核心，本轮**任何宽度都不缩放**）',
        first.poem.bodyFont.fontSize === '17px' && first.poem.bodyFont.lineHeight === '34px' && first.poem.bodyFont.letterSpacing === '0.765px',
        `${first.poem.bodyFont.fontSize}/${first.poem.bodyFont.lineHeight}/${first.poem.bodyFont.letterSpacing}`);
      check('题名 = 24px、身份行 = 12.48px（任何宽度都不缩放）',
        first.poem.fonts.title.fontSize === '24px' && first.poem.fonts.ident.fontSize === '12.48px',
        `题名 ${first.poem.fonts.title.fontSize}／身份 ${first.poem.fonts.ident.fontSize}`);

      // ---- [8] 正文行长 ----
      log('\n[8] 正文行长（8 行真实原文）');
      const lineOk = [], textOk = [];
      shownDemos.forEach((d) => {
        const P = d.poem, p = plan(d.block, W, H);
        lineOk.push(P.lineCount === 8 && P.wrappedLines === 0 && P.lines.every((l) => l.w <= P.colW - 2 * p.edge + 0.6));
        textOk.push(P.lines.map((l) => l.text).join('\n') === mdFlat.join('\n'));
        log(`      ${d.block}：${P.lineCount} 行 / 折行 ${P.wrappedLines} 行｜最长一行文字宽 ${r2(P.maxLine)}px（正文可用宽 ${r2(P.colW - 2 * p.edge)}）`);
      });
      check('原文恰好 8 行、**逐行与 content/poems/gushi-shijiu-shou-01.md 的正文逐字相同**',
        textOk.every(Boolean), shownDemos.map((d) => `${d.block}:${d.poem.lines.map((l) => l.text).join('') === mdFlat.join('') ? '＝源文件' : '⚠ 不同'}`).join(' '));
      if (cases.indexOf(C) === 0) {
        log('      逐行实测（取第一个渲染块的目录页之外的诗页）：');
        shownDemos[0].poem.lines.forEach((l, i) => log(`        ${i + 1}  ${l.text}　宽 ${r2(l.w)}px${l.text === mdFlat[i] ? '  ＝源文件第 ' + (i + 1) + ' 行' : '  ⚠ 与源文件第 ' + (i + 1) + ' 行不同'}`));
      }
      check('8 行全部**未折行**，且每行都放得进正文可用宽（每档都查）',
        lineOk.every(Boolean), shownDemos.map((d) => `${d.block}:最长 ${r2(d.poem.maxLine)}/${r2(d.poem.colW - 2 * plan(d.block, W, H).edge)}`).join(' '));
      check('最长一行的文字宽 ＝ 12 字 ×（17px＋0.045em）＝213.19px（±2px，每档相同）',
        shownDemos.every((d) => near(d.poem.maxLine, 213.19, 2)),
        shownDemos.map((d) => `${d.block}:${r2(d.poem.maxLine)}`).join(' '));

      // ---- [9] 自报数字 vs 脚本实测：【移到展开之后】见下面 [5][9] 段 ----

      // ---- [10][11] 交互 ＋ 夹具行折行 ----
      log('\n[10][11] 目录页交互（真鼠标）＋ 夹具行长题名的折行');
      check('首态：**全部收起**（每个组头 aria-expanded=false、诗目列表 hidden、可见诗目 0 行）',
        shownDemos.every((d) => d.hub.gheadExpanded === 'false' && d.hub.listHidden === true && d.hub.visibleRows === 0),
        shownDemos.map((d) => `${d.block}:expanded=${d.hub.gheadExpanded} hidden=${d.hub.listHidden} 可见行=${d.hub.visibleRows}`).join(' '));
      check('组头是 <button type="button"> ＋ aria-expanded（不是 div 冒充）',
        shownDemos.every((d) => d.hub.gheadTag === 'BUTTON' && d.hub.gheadType === 'button'),
        shownDemos.map((d) => `${d.block}:${d.hub.gheadTag}/${d.hub.gheadType}`).join(' '));
      const clickRes = [];
      for (const d of shownDemos) clickRes.push(await clickGhead(d.block));
      M = await measure();
      shownDemos = M.demos.filter((d) => !d.folded);
      const expDemos = shownDemos;
      check('真鼠标点组头 ⇒ 展开（aria-expanded=true、可见 20 行 ＝ 19 首 ＋ 1 条夹具行）',
        clickRes.every((c) => c.hitIsE) && expDemos.every((d) => d.hub.gheadExpanded === 'true' && d.hub.visibleRows === 20 && d.hub.markText === '[\u2212]'),
        clickRes.map((c, i) => `${ORDER.filter((b) => pageFolded[b] !== true)[i]}:命中${c.hitIsE ? '自身' : c.hitTag}`).join(' ') + ' ｜ ' +
        expDemos.map((d) => `${d.block}:${d.hub.visibleRows}行`).join(' '));

      // ---- [5] 已定的目录页关系（展开后逐行实测）----
      log('\n[5] 已定的目录页关系（记号悬挂／缝／竖直居中／缩进 0／作者紧随／关于左沿；展开后逐行实测）');
      const markOk = [], vertOk = [], indentOk = [], authorOk = [], aboutOk = [];
      shownDemos.forEach((d) => {
        markOk.push(near(d.hub.markLeftRel, 0, 0.6) && near(d.hub.seam, SEAM, 0.6));
        vertOk.push(near(d.hub.gmarkCenter, d.hub.gnameCenter, 1.0));
        const short = d.hub.rows.filter((r) => r.visible && !r.fx);
        const fx = d.hub.rows.filter((r) => r.visible && r.fx)[0];
        const fxBoxes = fx.titleLineBoxes;
        indentOk.push(short.length === 19 && short.every((r) => near(r.titleLeft, d.hub.gnameLeft, 1))
          // 夹具行的题名会折行 ⇒ 它的**联合盒左沿**是各行的最小值，不能拿来量「文字起点」；
          // 改用行首那个单行小标（.fxbadge）的左沿 —— 它就是这一行的文字起点。
          && near(fx.badgeLeft, d.hub.gnameLeft, 1));        authorOk.push(short.every((r) => near(r.authorLeft - (r.titleLeft + r.titleMaxLineW), 5.76, 1.5)
          && (d.hub.colRight - plan(d.block, W, H).edge - r.authorRight) > 50));
        aboutOk.push(near(d.hub.aboutRight, plan(d.block, W, H).edge, 0.6) && d.hub.topLineBottom <= d.hub.gheadTop + 0.6);
        log(`      ${d.block}：记号左沿 ${d.hub.markLeftRel}（列左沿 0）· 槽 ${r2(d.hub.markLeftRel + d.hub.gmarkW + d.hub.seam)} · 缝 ${d.hub.seam}` +
          `｜竖直：记号盒中心 ${d.hub.gmarkCenter} vs 组名盒中心 ${d.hub.gnameCenter}（差 ${r2(Math.abs(d.hub.gmarkCenter - d.hub.gnameCenter))}）` +
          `｜组名左沿 ${d.hub.gnameLeft}＝题名左沿（逐行）｜「关于」右沿距列右沿 ${d.hub.aboutRight}`);
        log(`        ${short.length} 条真实诗目逐条：左沿 ${uniq(short.map((r) => r.titleLeft)).join('/')}；作者距题名末端 ${uniq(short.map((r) => r2(r.authorLeft - r.titleLeft - r.titleMaxLineW))).join('/')}；列右内沿在 ${r2(d.hub.colRight - plan(d.block, W, H).edge)}`);
        log(`        夹具行（行首先有一个「夹具行」小标）：小标左沿 ${fx.badgeLeft}（组名左沿 ${d.hub.gnameLeft}，列左沿 ${r2(d.hub.gnameLeft - d.hub.nameX)}）⇒ 差 ${r2(fx.badgeLeft - d.hub.gnameLeft)}px；题名折成 ${fxBoxes} 个行盒（联合盒左沿 ${fx.titleLeft} —— 折行时它是各行的最小值，不用它量起点）`);
      });
      check('记号在列左沿之外的槽里（记号左沿＝列左沿）、缝＝0.4rem（±0.6px）',
        markOk.every(Boolean), shownDemos.map((d) => `${d.block}:${d.hub.markLeftRel}/${d.hub.seam}`).join(' '));
      check('记号与组名首字**竖直居中**对齐（两个排版盒的中心差 ≤1px）',
        vertOk.every(Boolean), shownDemos.map((d) => `${d.block}:Δ${r2(Math.abs(d.hub.gmarkCenter - d.hub.gnameCenter))}`).join(' '));
      check('19 条真实诗目**逐条**：题名左沿＝组名左沿（缩进 0，±1px；夹具行也一样）',
        indentOk.every(Boolean), shownDemos.map((d) => `${d.block}:${r2(d.hub.nameX)}`).join(' '));
      check('作者紧随题名、不右对齐（距题名末端 ≈0.45em＝5.76px；且离列右内沿很远）',
        authorOk.every(Boolean), shownDemos.map((d) => `${d.block}:${r2(d.hub.rows.filter((r) => r.visible && !r.fx)[0].authorLeft - d.hub.rows.filter((r) => r.visible && !r.fx)[0].titleLeft - d.hub.rows.filter((r) => r.visible && !r.fx)[0].titleMaxLineW)}`).join(' '));
      check('「关于」在第一个组头之上，且右沿＝列右沿−行内沿',
        aboutOk.every(Boolean), shownDemos.map((d) => `${d.block}:${d.hub.aboutRight}`).join(' '));
      check('行内沿是**列内**的一层：诗目左内沿＝组名左沿、右内沿＝列右沿−行内沿',
        shownDemos.every((d) => d.hub.rows.filter((r) => r.visible).every((r) => near(r.plinkPadLeft, d.hub.nameX, 0.01) && near(r.plinkPadRight, plan(d.block, W, H).edge, 0.01))),
        shownDemos.map((d) => `${d.block}:nameX ${d.hub.nameX}/edge ${d.cap.mEdge}`).join(' '));

      // ---- [9] 页面自报数字 ＝ 脚本独立实测 ----
      log('\n[9] 页面自报数字 ＝ 脚本独立实测（±0.6px）');
      const selfBad = [];
      shownDemos.forEach((d) => {
        const p = plan(d.block, W, H), P = d.poem, Hh = d.hub, c = d.cap;
        const pairs = [
          ['列宽(目录页)', parseFloat(c.mColHub), d.pages.find((x) => x.page === 'hub').colW],
          ['列宽(诗页)', parseFloat(c.mColPoem), d.pages.find((x) => x.page === 'poem').colW],
          ['留白(目录页)', parseFloat(c.mGlHub), d.pages.find((x) => x.page === 'hub').colLeft],
          ['行内沿', parseFloat(c.mEdge), p.edge],
          ['组名左沿', parseFloat(c.mNameX), Hh.nameX],
          ['记号左沿', parseFloat(c.mMarkLeft), Hh.markLeftRel],
          ['缝', parseFloat(c.mSeam), Hh.seam],
          ['正文可用宽', parseFloat(c.mAvail), P.colW - 2 * p.edge],
          ['最长行文字宽', parseFloat(c.mMaxLine), P.maxLine],
          ['顶部行左沿', parseFloat(c.mTopL), P.backLeft],
          ['顶部行右沿', parseFloat(c.mTopR), P.detailRight],
          ['关于右沿', parseFloat(c.mAboutR), Hh.aboutRight],
          ['题名→身份', parseFloat(c.mTitleGap), P.titleGap],
          ['身份→原文', parseFloat(c.mBodyGap), P.bodyGap],
          ['夹具行行数', parseFloat(c.mFxLines), Hh.rows.filter((r) => r.visible && r.fx)[0].titleLineBoxes],
        ];
        pairs.forEach(([k, a, b]) => {
          if (!(Math.abs(a - b) <= 0.6)) selfBad.push(`${d.block}/${k}: 页面 ${a} vs 实测 ${r2(b)}`);
        });
        log(`      ${d.block}（capSrc=${d.capSrc}）：${pairs.map(([k, a, b]) => `${k} ${a}≈${r2(b)}`).join(' ')}`);
      });
      check(`页面自报的每一格数字都与脚本实测一致（${selfBad.length} 处不一致，要求 0）`,
        selfBad.length === 0, selfBad.length ? selfBad.join(' | ') : '15 项 × 每个渲染档 全部一致');
      check('自报数字里标明了来源（实测 = dom ／ 折叠块 = plan），没有把推算数字说成实测',
        shownDemos.every((d) => d.capSrc === 'dom') && M.demos.filter((d) => d.folded).every((d) => d.capSrc === 'plan'),
        '渲染块 data-m-src=dom；折叠块 data-m-src=plan');
      log(`      展开后夹具行折行数（每档）：${expDemos.map((d) => `${d.block}:${d.hub.rows.filter((r) => r.visible && r.fx)[0].titleLineBoxes} 行（题名最宽行 ${r2(d.hub.rows.filter((r) => r.visible && r.fx)[0].titleMaxLineW)}）`).join(' ｜ ')}`);
      const fxByBlock = {};
      expDemos.forEach((d) => { fxByBlock[d.block] = d.hub.rows.filter((r) => r.visible && r.fx)[0].titleLineBoxes; });
      const expFx = { 360: { b1: 3, b5: 3 }, 430: { b1: 2 }, 834: { b1: 1, b2: 2, b4: 1 }, 1180: { b1: 1, b2: 2, b3: 1, b4: 1 }, '740x360': { b1: 1, b2: 2, b4: 1, b5: 2 } };
      if (expFx[C.key]) {
        const bad = Object.entries(expFx[C.key]).filter(([b, n]) => fxByBlock[b] !== n).map(([b, n]) => `${b}: 实测 ${fxByBlock[b]} ≠ 预期 ${n}`);
        check(`[11] 夹具行折行：同一段文字在**不同列宽**下折成几行（本视口预期 ${JSON.stringify(expFx[C.key])}）`,
          bad.length === 0, bad.length ? bad.join(' | ') : Object.entries(fxByBlock).map(([b, n]) => `${b}:${n} 行`).join(' '));
      }
      // 再点一次 ⇒ 收起（只在第一个渲染块上做，剩下的保持展开供后面截图）
      const back = await clickGhead(expDemos[0].block);
      let M2 = await measure();
      check('再点一次 ⇒ 该组收起（aria-expanded=false、可见诗目 0 行、记号回到 [+]）',
        back.hitIsE && M2.demos.filter((d) => d.block === expDemos[0].block)[0].hub.visibleRows === 0
        && M2.demos.filter((d) => d.block === expDemos[0].block)[0].hub.markText === '[+]',
        `${expDemos[0].block} 收起后可见 ${M2.demos.filter((d) => d.block === expDemos[0].block)[0].hub.visibleRows} 行`);
      // 其余块重新展开（截图要看到行）
      for (const d of expDemos) {
        const cur = M2.demos.filter((x) => x.block === d.block)[0];
        if (cur.hub.visibleRows === 0) await clickGhead(d.block);
      }
      M2 = await measure();

      // ---- [12] 窄屏 ----
      if (W <= 430) {
        log(`\n[12] 窄屏 ${W} 单独证`);
        const b1 = M2.demos.filter((d) => d.block === 'b1')[0];
        const b5 = M2.demos.filter((d) => d.block === 'b5')[0];
        check('无横向溢出；组头单行（高度 < 60px）；正文 8 行不折行',
          M2.docW === W && M2.maxRight <= W + 0.5 && b1.hub.gheadH < 60 && b1.poem.wrappedLines === 0 && b1.poem.lineCount === 8,
          `docW=${M2.docW} maxRight=${M2.maxRight} 组头高=${b1.hub.gheadH} 折行=${b1.poem.wrappedLines}`);
        if (W <= 400) {
          check('⑤ 的窄屏档：行内沿收成 0.75rem（12px），① 仍是 1.05rem（16.8px）⇒ 相差 4.8px',
            b5 && near(b5.hub.rows.filter((r) => r.visible && !r.fx)[0].plinkPadRight, 12, 0.01)
            && near(b1.hub.rows.filter((r) => r.visible && !r.fx)[0].plinkPadRight, 16.8, 0.01),
            `⑤ 右内沿 ${b5 ? b5.hub.rows.filter((r) => r.visible && !r.fx)[0].plinkPadRight : '(折叠)'} vs ① ${b1.hub.rows.filter((r) => r.visible && !r.fx)[0].plinkPadRight}`);
        } else {
          check('412／430（>400px）：⑤ 与 ② 相同 ⇒ 已折叠（窄屏档不生效）', pageFolded.b5 === true, `⑤ folded=${pageFolded.b5}`);
        }
      }

      // ---- [13] 横屏 ----
      if (C.key === '740x360') {
        log('\n[13] 横屏 740×360 单独证');
        const b2 = M2.demos.filter((d) => d.block === 'b2')[0];
        const b5 = M2.demos.filter((d) => d.block === 'b5')[0];
        check('innerHeight ＝ 360，且文档高度 > 360 ⇒ **必须滚动**（矮而宽放不下一屏）',
          M2.innerH === 360 && M2.docH > 360, `innerHeight=${M2.innerH} docH=${M2.docH}`);
        const poemH = r2(b2.poem.poemH === undefined ? (b2.poem.lastLineBottom - b2.poem.backTop) : b2.poem.poemH);
        check('诗页内容高（顶部行→正文末行底）> 视口高 360 ⇒ 8 行原文**一屏放不下**',
          (b2.poem.lastLineBottom - b2.poem.backTop) > 360,
          `诗页内容高 ${poemH}px > 360px（差 ${r2(b2.poem.lastLineBottom - b2.poem.backTop - 360)}px）`);
        check('⑤ 的横屏档确实收紧了题头（11.2→5.6、33.6→19.2），而 ② 没有',
          near(b2.poem.titleGap, 11.2, 1) && near(b2.poem.bodyGap, 33.6, 1)
          && near(b5.poem.titleGap, 5.6, 1) && near(b5.poem.bodyGap, 19.2, 1),
          `②:${b2.poem.titleGap}/${b2.poem.bodyGap} ⑤:${b5.poem.titleGap}/${b5.poem.bodyGap}`);
        check('740 宽下 ② 列宽 660、两侧留白各 40（上限已生效）',
          near(b2.pages.find((x) => x.page === 'hub').colW, 660, 0.6) && near(b2.pages.find((x) => x.page === 'hub').colLeft, 40, 0.6),
          `列宽 ${b2.pages.find((x) => x.page === 'hub').colW} 左留白 ${b2.pages.find((x) => x.page === 'hub').colLeft}`);
      }

      // ---- [14] 展开后仍无横向溢出 ----
      log('\n[14] 展开之后重查「无横向溢出」');
      check(`展开 20 行之后：scrollWidth 仍 === ${W}，所有可见元素仍在 0…${W} 内`,
        M2.docW === W && M2.bodyW === W && M2.maxRight <= W + 0.5 && M2.minLeft >= -0.5,
        `docW=${M2.docW} maxRight=${M2.maxRight}(${M2.maxRightEl}) minLeft=${M2.minLeft}`);

      rowsOut.push({
        key: C.key, w: W, h: H, label: C.label,
        docW: M2.docW, docH: M2.docH,
        blocks: M2.demos.map((d) => ({
          block: d.block, folded: d.folded,
          cap: CAPS[d.block].knob,
          colHub: d.folded ? plan(d.block, W, H).colHub : d.pages.find((x) => x.page === 'hub').colW,
          colPoem: d.folded ? plan(d.block, W, H).colPoem : d.pages.find((x) => x.page === 'poem').colW,
          gut: d.folded ? (W - plan(d.block, W, H).colHub) / 2 : d.pages.find((x) => x.page === 'hub').colLeft,
          edge: d.folded ? plan(d.block, W, H).edge : parseFloat(d.cap.mEdge),
          nameX: d.folded ? null : d.hub.nameX,
          maxLine: d.folded ? null : r2(d.poem.maxLine),
          avail: d.folded ? r2(plan(d.block, W, H).colPoem - 2 * plan(d.block, W, H).edge) : parseFloat(d.cap.mAvail),
          cpl: d.folded ? r2((plan(d.block, W, H).colPoem - 2 * plan(d.block, W, H).edge) / 17.765) : parseFloat(d.cap.mCpl),
          topL: d.folded ? null : d.poem.backLeft, topR: d.folded ? null : d.poem.detailRight,
          fxLines: d.folded ? null : d.hub.rows.filter((r) => r.visible && r.fx)[0].titleLineBoxes,
          titleGap: d.folded ? null : d.poem.titleGap, bodyGap: d.folded ? null : d.poem.bodyGap,
          poemH: d.folded ? null : r2(d.poem.lastLineBottom - d.poem.backTop),
        })),
      });

      // ---- [15][16] 看图态 + PNG ----
      if (!SHOT) { log('\n[15][16] 已跳过（--no-shot）：不查看图态、不重出 PNG'); continue; }
      // ⚠ 先回 about:blank：直接 navigate 到 url+'#shot' 只是**同文档**改 hash，页面不会重新加载，
      //   上一步展开的状态会留着 ⇒「#shot 下首态仍全收起」这条就无从验起了。
      await send('Page.navigate', { url: 'about:blank' });
      await sleep(150);
      await load(url + '#shot', W, H, C.mobile);
      let S = await measure();
      log('\n[15] 看图态（#shot）：不改变任何排布规则，且首态仍全收起');
      check('#shot 下首态仍是**全部收起**（图里的展开态是点出来的）',
        S.demos.filter((d) => !d.folded).every((d) => d.hub.gheadExpanded === 'false' && d.hub.visibleRows === 0),
        S.demos.filter((d) => !d.folded).map((d) => `${d.block}:${d.hub.gheadExpanded}`).join(' '));
      const sDemos = S.demos.filter((d) => !d.folded);
      for (const d of sDemos) await clickGhead(d.block);
      const S2 = await measure();
      const s2Demos = S2.demos.filter((d) => !d.folded);
      const diff = [];
      s2Demos.forEach((d, i) => {
        const o = shownDemos.filter((x) => x.block === d.block)[0];
        const oc = o.pages.find((x) => x.page === 'hub'), nc = d.pages.find((x) => x.page === 'hub');
        if (!near(oc.colW, nc.colW, 0.01) || !near(oc.colLeft, nc.colLeft, 0.01)) diff.push(`${d.block}: 列 ${oc.colLeft}/${oc.colW} → ${nc.colLeft}/${nc.colW}`);
        if (o.hub.nameX !== d.hub.nameX) diff.push(`${d.block}: 组名左沿 ${o.hub.nameX} → ${d.hub.nameX}`);
        if (o.poem.titleGap !== d.poem.titleGap) diff.push(`${d.block}: 题名→身份 ${o.poem.titleGap} → ${d.poem.titleGap}`);
      });
      check('#shot 下排布数字与普通态逐一相同（列宽／留白／组名左沿／诗页间距都没变）',
        diff.length === 0, diff.length ? diff.join(' | ') : `${s2Demos.length} 个渲染档全部一致`);
      check('图中每块目录页只显示前 3 行（1 条夹具行 ＋ 2 条真实行）＋ 1 条青色说明条',
        s2Demos.every((d) => d.hub.visibleRows === 3 && d.hub.rows.filter((r) => r.visible)[0].fx === true),
        s2Demos.map((d) => `${d.block}:${d.hub.visibleRows} 行`).join(' '));
      check(`#shot 下仍无横向溢出（scrollWidth === ${W}）`,
        S2.docW === W && S2.maxRight <= W + 0.5 && S2.minLeft >= -0.5,
        `docW=${S2.docW} maxRight=${S2.maxRight} maxH=${S2.docH}`);
      const pngName = C.key === '740x360' ? 'q-responsive.740x360.png' : `q-responsive.${C.key}.png`;
      const pngPath = join(OUT, pngName);
      const shot = await send('Page.captureScreenshot', {
        format: 'png', captureBeyondViewport: true,
        clip: { x: 0, y: S2.deck.y, width: W, height: S2.deck.h, scale: 1 },
      });
      writeFileSync(pngPath, Buffer.from(shot.data, 'base64'));
      const buf = readFileSync(pngPath);
      const size = pngSize(buf);
      log(`\n[16] PNG：${pngPath}`);
      log(`      截图区 CSS 尺寸 ${W}×${r2(S2.deck.h)} @DPR 2 → 像素 ${W * 2}×${r2(S2.deck.h * 2)} → 文件实测 ${size.w}×${size.h}，${statSync(pngPath).size} 字节`);
      check(`PNG 像素宽 ＝ 视口宽 × 2 ＝ ${W * 2}（**真实 CSS px @DPR 2，不是缩放图**）`,
        size.w === W * 2, `实测 ${size.w}`);
      check('PNG 像素高 ＝ 截图区 CSS 高 × 2', Math.abs(size.h - S2.deck.h * 2) <= 2, `实测 ${size.h}，期望 ${r2(S2.deck.h * 2)}`);
      check('PNG 文件非空且一张图只含**一个**视口宽（没有把不同宽度拼在一起）',
        statSync(pngPath).size > 1000 && size.w === W * 2,
        `${statSync(pngPath).size} 字节，宽 ${size.w}px ＝ 1 个视口 × 2`);
    }

    /* ═══ [7] 跨视口：字号不缩放 ═══════════════════════════════════ */
    log('\n═══════════ [7] 跨视口：字号／行高／字距**不随宽度变化** ═══════════');
    const kinds = ['title', 'ident', 'line', 'ctl', 'ptitle', 'about', 'gname', 'gmark', 'gcount', 'pauthor'];
    const bad7 = [];
    kinds.forEach((k) => {
      const vals = uniq(fontBag.map((f) => f[k]));
      log(`      ${k}: ${vals.length === 1 ? '1 个取值' : '⚠ ' + vals.length + ' 个取值'} → ${vals.join('  //  ')}`);
      if (vals.length !== 1) bad7.push(k);
    });
    check('10 类文字在 7 个视口下的「字号·行高·字距」都只有 1 个取值（＝完全没有随宽度缩放）',
      bad7.length === 0, bad7.length ? bad7.join(' ') : 'title/ident/line/ctl/ptitle/about/gname/gmark/gcount/pauthor 全部恒定');

    /* ═══ [16] 图片清单 ═══════════════════════════════════════════ */
    if (SHOT) {
      log('\n═══════════ [16] 图清单 ═══════════');
      CASES.forEach((C) => {
        const p = join(OUT, C.key === '740x360' ? 'q-responsive.740x360.png' : `q-responsive.${C.key}.png`);
        const ok = existsSync(p);
        const size = ok ? pngSize(readFileSync(p)) : null;
        log(`      ${p}  ${ok ? size.w + '×' + size.h + '（' + statSync(p).size + ' 字节）' : '⚠ 不存在'}`);
        if (!ONLY) check(`图存在且像素宽 ＝ ${C.w * 2}（${C.key}）`, ok && size.w === C.w * 2, ok ? `${size.w}×${size.h}` : '缺失');
      });
    }

    /* ═══ 自包含 / 无 JS 报错 ═══════════════════════════════════ */
    log('\n═══════════ [G] 自包含 ＋ 无 JS 报错 ═══════════');
    const ext = requests.filter((u) => !u.startsWith('file:///') && !u.startsWith('data:'));
    check('CDP 记录的网络请求里没有任何 http(s) 外部引用',
      ext.length === 0, `${requests.length} 个请求，非 file:// 的=${ext.length} ${JSON.stringify(ext.slice(0, 4))}`);
    const textHits = ['<link', 'src=', '@import', 'http://', 'https://'].filter((t) => htmlText.indexOf(t) >= 0);
    check('页面文本里没有 <link / src= / @import / http(s)://（零外部引用）',
      textHits.length === 0, textHits.length ? '命中：' + textHits.join(' ') : '0 处');
    check('全程无 JS 报错（加载 ＋ 各视口的交互）', pageErrors.length === 0,
      pageErrors.length ? pageErrors.join(' | ') : '0 条');

    /* ── 给 .md 用的一张表（直接打印） ── */
    log('\n═══════════ 实测数字汇总（可直接抄进 q-responsive.md）═══════════');
    rowsOut.forEach((r) => {
      log(`  ${r.key}（${r.w}×${r.h}，${r.label}）：docW=${r.docW} docH=${r.docH}`);
      r.blocks.forEach((b) => {
        log(`    ${b.block}${b.folded ? '（折叠）' : ''} 列宽 ${r2(b.colHub)}/${r2(b.colPoem)} 留白 ${r2(b.gut)} 行内沿 ${b.edge} ` +
          `${b.folded ? '' : '｜组名左沿 ' + b.nameX + ' ｜正文可用 ' + b.avail + '（≈' + b.cpl + ' 汉字/行）最长行 ' + b.maxLine +
            ' ｜顶部行 ' + b.topL + '/' + b.topR + ' ｜夹具行 ' + b.fxLines + ' 行 ｜题名→身份 ' + b.titleGap + ' 身份→原文 ' + b.bodyGap + ' ｜诗页内容高 ' + b.poemH}`);
      });
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
