/*
 * check-poem-note.mjs —— 「诗页·有笔记的入口与展开」原型的【页面行为 ＋ 真鼠标点开 ＋ 几何】自证脚本（可复跑）。
 *
 * ⚠ 它验的是**这一个原型页面**（q-poem-note.html）的页面行为，**不是产品代码**，也不是任何规格的采纳。
 *   对象只有本目录下的 q-poem-note.html（**只读打开**：Page.navigate 到 file:// URL，脚本不写、不改它）。
 *   额外读的文件都是**只读**：
 *     ① prototype/css/theme-tech.css          —— 用来逐项比对页面内嵌的令牌快照；
 *     ② content/poems/gushi-shijiu-shou-01.md —— 用它的正文 8 行做「原文逐字一致」的基准；
 *     ③ content/poems/*.md                    —— 断言**没有任何一首**声明 notes:（⇒ 有笔记态只能用夹具）。
 *
 * 断言清单（失败任一即 exit 1；当前失败数 0）：
 *  [G] 令牌快照逐项比对（不一致数必须 0）／没有「声明了却没用」的令牌／每个 var() 都有声明／
 *      记录快照来源短 sha ＋「权威仍是 docs/design/visual-tokens.md」／写明 430 视口与宽度口径 C／
 *      已定项逐条在页面上（题名 1.5rem/500/0.1em、身份行 0.78rem、0.7rem、2.1rem、17px/2/0.045em、1.05rem）／
 *      「材料不是实施｜选某一档 ≠ 采纳整页规格｜不决定 JSON／MD 分界｜原型说明 · 不属于应用页面」都在／
 *      ③ 那一档在页面上写明了「与更新处去框相抵、若外推则应退化为不用框、未决」／
 *      自包含（非 file:// 请求 0 个、无 <link / src= / @import / http(s)://）／无 JS 报错／参数表可解析。
 *  [F] 夹具：真实内容 19 首**都没有 notes:** ⇒ 有笔记态只能靠夹具；页面里渲染的笔记正文**逐字**等于脚本自带的预期夹具；
 *      每个夹具的**第一段**就是「测试夹具笔记，不是用户笔记。」；夹具文本**不含第一人称**（我／咱／俺）；
 *      夹具区域有**黄色虚线警示标注**（fxbadge，border-style=dashed、色＝--line-warn）。
 *  [N] **无笔记对照**：那一块 `[data-test="notes"]` 用 querySelector 查**为 null**（整块不存在，不是 display:none 占位）；
 *      该块可见文本里**没有「笔记」二字**；该块里没有任何 button；其余 9 块都有 `[data-test="notes"]`。
 *  [S] 结构：图内 10 块（3 档 ×（收起／展开·短／展开·长）＋ 1 格无笔记对照）；每块恰＝视口宽、块左沿 0；
 *      每块 `.col` 宽 ＝ C ＝ min(V, max(320, 0.88×(V−24)))；正文 8 行**逐行与源文件逐字相同**。
 *  [B] **入口是 `<button type="button">`**（无内联 onclick、aria-controls 指到自己的面板）：
 *      ①③ 的入口在**正文之后**（入口顶 > 原文末行底），② 的入口在**正文之上**（在顶部行里、与返回/详情同行）；
 *      ③ **收起态就画了框**（分区 border-width > 0 且入口在框里），①② 收起态**没有框**（入口行 border-width = 0）。
 *  [C] **真鼠标点开**（CDP Input.dispatchMouseEvent，不是 el.click()）：每档的收起态块点一下 ⇒ aria-expanded=false→true、面板出现；
 *      再点一下 ⇒ 回到 false、面板又隐藏；展开态的 6 块点开并留在展开态。首态一律收起（aria-expanded=false、panel.hidden=true）。
 *  [H] 展开后的几何：**无横向溢出**（docW==bodyW==视觉视口宽、没有元素右沿越出视口、maxRight ≤ 视口宽）；
 *      内容列宽不变；**正文仍逐行居中**（每行文字盒中心 − 列中心，|差| ≤ center_tol＝0.01px，8 行全查）；
 *      题名／身份行也居中；**顶部行左右沿未被改动**（返回左沿 / 详情右沿：绝对位置未变 ＋ 与展开前逐块相同）。
 *  [P] PNG：430 真实 CSS px @DPR 2（像素宽 860）；**先量截图区高度**，超过内核上限（16384 设备 px）就按块边界拆图；
 *      各张高度之和 == 截图区高度（正好铺满）；每张非空且高 < 16384；文件非空。
 *  [17] **边界自证**：CHROME_BIN 指到不存在的路径 ⇒ 必须**如实报错并 exit 2**，**不能**打印「失败断言数：0」。
 *
 * 怎么跑：
 *   node items/app-ui/prototypes/check-poem-note.mjs
 *   node items/app-ui/prototypes/check-poem-note.mjs --no-shot         # 只跑断言，不重出 PNG
 *   node items/app-ui/prototypes/check-poem-note.mjs --selftest-chrome # 只跑「CHROME_BIN 指错 ⇒ 如实报错」边界
 *
 * 需要什么：
 *   - Node（用到内置 fetch / WebSocket / net）；**本机实测 v25.9.0 通过**；
 *   - 本机无头 Chromium：环境变量 CHROME_BIN 优先，否则按 %LOCALAPPDATA%\Chromium\Application\chrome.exe 推；
 *     找不到就**如实报错 exit 2**（CHROME_BIN 指到错路径也走这一条，不会假装通过）；
 *   - **不需要**任何 npm 依赖：不装包、不联网、不起静态服务（直接开 file://）；
 *   - **CDP 端口**向内核要一个空闲端口（本机撞过端口，不写死）；
 *   - **仓库根**从脚本所在目录**向上查找** prototype/css/theme-tech.css 来定位（不写死层级）。
 *
 * 副作用：临时目录建一个 Chromium profile 并删掉；默认重写本目录的 PNG（复跑会让 PNG 变脏，正常现象）；
 *         q-poem-note.html 本身**只读打开**，不写、不改。
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, statSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const OUT = dirname(fileURLToPath(import.meta.url));
const ROOT = (() => {
  let d = OUT;
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(d, 'prototype', 'css', 'theme-tech.css'))) return d;
    d = dirname(d);
  }
  throw new Error('找不到仓库根：从 ' + OUT + ' 向上查找 prototype/css/theme-tech.css 失败');
})();

/* ── [17] 边界自证：CHROME_BIN 指到不存在的路径 ⇒ 如实报错退出，不假装通过 ── */
if (process.argv.includes('--selftest-chrome')) {
  const bogus = 'C:/definitely/not/here/chrome.exe';
  const self = fileURLToPath(import.meta.url);
  const r = spawnSync(process.execPath, [self, '--no-shot'], {
    cwd: OUT, encoding: 'utf8', timeout: 300000,
    env: { ...process.env, CHROME_BIN: bogus },
  });
  const out = r.stdout || '', err = r.stderr || '';
  const saidReason = /找不到无头 Chromium/.test(err) && err.includes(bogus);
  const notFakePass = out.indexOf('失败断言数：0') < 0;
  console.log('【边界自证】CHROME_BIN = ' + bogus + '（该路径不存在）');
  console.log('  退出码：' + r.status + '（要求 ≠ 0，这里 2 表示环境缺失）');
  console.log('  stderr 说了原因：' + (saidReason ? '是' : '否') + ' → ' + JSON.stringify(err.trim().split(/\r?\n/)[0] || ''));
  console.log('  stdout 里没有「失败断言数：0」（不假装通过）：' + (notFakePass ? '是' : '否'));
  const ok = r.status === 2 && saidReason && notFakePass;
  console.log(`\n===== 边界自证：${ok ? '通过' : '失败'} =====`);
  process.exit(ok ? 0 : 1);
}

const SHOT = !process.argv.includes('--no-shot');
const VW = 430, VH = 932, DPR = 2;
const HTML_PATH = join(OUT, 'q-poem-note.html');
const MD_PATH = join(ROOT, 'content', 'poems', 'gushi-shijiu-shou-01.md');
const POEMS_DIR = join(ROOT, 'content', 'poems');
const PNG_HARD_LIMIT = 16384;   /* 设备像素上限：宁可拆图也不出一张被截断的图 */
const MAX_SHOT_CSS = 8000;      /* 单张图的截图区 CSS 高上限（×DPR 2 = 16000 < 16384） */

const CHROME = process.env.CHROME_BIN
  || join(process.env.LOCALAPPDATA || '', 'Chromium', 'Application', 'chrome.exe');
if (!CHROME || !existsSync(CHROME)) {
  console.error('找不到无头 Chromium：' + (CHROME || '(未设置)'));
  console.error('请用环境变量指定，例如：');
  console.error("  CHROME_BIN='C:/Users/wsqsy/AppData/Local/Chromium/Application/chrome.exe' \\");
  console.error('    node items/app-ui/prototypes/check-poem-note.mjs');
  console.error('（这就是 [17] 那条边界：CHROME_BIN 指到不存在的路径时，本脚本在这里如实退出，不假装通过。）');
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

/* ── 脚本自带的预期夹具（**独立于页面**的一份；页面渲染的东西必须逐字等于它）── */
const FIX_SHORT = ['测试夹具笔记，不是用户笔记。'];
const FIX_LONG = [
  '测试夹具笔记，不是用户笔记。',
  '第二段：这一段只为让「多段」这件事在屏幕上可见 —— 用来核对换行位置，以及段与段之间那条间距。文字本身没有意义。',
  '第三段：整个黄色区域都是测试夹具，不是任何人的阅读笔记，也不代表真实数据。',
];
const FIX_SENTENCE = '测试夹具笔记，不是用户笔记。';

/* ── 页面文本 ＋ 参数表 ＋ 令牌快照 ─────────────────────────────── */
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
const paramBlock = declarationBlock(htmlText, '== POEM-NOTE-PARAMS-BEGIN ==', '== POEM-NOTE-PARAMS-END ==');
if (!paramBlock) { console.error('页面里找不到 == POEM-NOTE-PARAMS-BEGIN ==/== POEM-NOTE-PARAMS-END == 参数表'); process.exit(2); }
function pnum(key) {
  const m = new RegExp('\\*\\s*' + key + '\\s*:\\s*(-?[0-9.]+)').exec(paramBlock);
  return m ? Number(m[1]) : NaN;
}
function pstr(key) {
  const m = new RegExp('\\*\\s*' + key + '\\s*:\\s*([^\\n*]+)').exec(paramBlock);
  return m ? m[1].trim() : null;
}
const P = {
  cwPct: pnum('cw_pct'), deduct: pnum('cw_deduct'), floor: pnum('cw_floor'),
  edge: pnum('edge'), viewport: pnum('viewport'), centerTol: pnum('center_tol'),
  blocks: pnum('blocks'), candidates: pnum('candidates'),
  fixShort: pnum('fixture_short'), fixLong: pnum('fixture_long'),
  noteMargin: pstr('note_margin'), noteGap: pstr('note_gap'),
};
const cwOf = (V) => Math.min(V, Math.max(P.floor, P.cwPct / 100 * (V - P.deduct)));
const COLW = cwOf(VW);
const COL_RIGHT = (VW - COLW) / 2 + COLW;   /* 内容列右沿（列居中，所以左沿 ＝ (V−C)/2） */

/* ── 无头 Chromium ＋ CDP ───────────────────────────────────────── */
async function freePort() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const log = (...a) => console.log(...a);
function check(label, ok, detail) {
  log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : '  →  ' + detail}`);
  if (!ok) failures += 1;
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const r2 = (n) => Math.round(n * 100) / 100;
const r4 = (n) => Math.round(n * 10000) / 10000;
const pngSize = (buf) => ({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) });

/* ══ 页面侧量测（脚本自己实现，不依赖页面自报）════════════════════ */
const MEASURE = `(function(){
  var px = function(n){ return Math.round(n*100)/100; };
  var f4 = function(n){ return Math.round(n*10000)/10000; };
  function txt(sp){ var rg=document.createRange(); rg.selectNodeContents(sp); var r=rg.getBoundingClientRect();
    return { l:r.left, r:r.right, w:r.width, cx:(r.left+r.right)/2 }; }
  var out = { innerW: innerWidth, vvW: (window.visualViewport ? visualViewport.width : null),
    docW: document.documentElement.scrollWidth, bodyW: document.body.scrollWidth,
    shot: document.documentElement.dataset.shot === '1', ready: document.documentElement.dataset.ready === '1',
    pages: [], maxRight: -1e9, minLeft: 1e9, over: [] };
  var ban = document.querySelector('[data-test="imgban"]');
  out.banner = ban ? { display: getComputedStyle(ban).display, hasText: ban.textContent.indexOf('原型说明 · 不属于应用页面') >= 0 } : null;
  var deck = document.querySelector('[data-shotframe]');
  var dr = deck.getBoundingClientRect();
  out.deck = { y: px(dr.top + scrollY), h: px(dr.height) };
  var pages = document.querySelectorAll('[data-test="page"]');
  for (var i = 0; i < pages.length; i += 1) {
    var pg = pages[i], pr = pg.getBoundingClientRect();
    var col = pg.querySelector('[data-test="col"]'), cr = col.getBoundingClientRect();
    var cc = cr.left + cr.width/2;
    var notes = pg.querySelector('[data-test="notes"]');
    var entry = pg.querySelector('[data-test="noteentry"]');
    var panel = pg.querySelector('[data-test="notebody"]');
    var poem = pg.querySelector('[data-test="poem"]');
    var head = pg.querySelector('[data-test="head"]');
    var o = { block: pg.dataset.block, cand: pg.dataset.cand, form: pg.dataset.form,
      expect: pg.dataset.expect, fixture: pg.dataset.fixture,
      pgW: px(pr.width), pgLeft: px(pr.left), pgTop: px(pr.top + scrollY), pgBottom: px(pr.bottom + scrollY),
      colW: px(cr.width), colLeft: px(cr.left), colRight: px(cr.right), colCenter: px(cc),
      colLeftGap: px(cr.left), hasNotes: !!notes,
      hasSection: !!pg.querySelector('[data-test="notesection"]'),
      entryTag: entry ? entry.tagName : null, entryType: entry ? entry.getAttribute('type') : null,
      entryOnclick: entry ? entry.hasAttribute('onclick') : null,
      entryAria: entry ? entry.getAttribute('aria-expanded') : null,
      entryControls: entry ? entry.getAttribute('aria-controls') : null,
      entryText: entry ? entry.textContent.replace(/\\s+/g,'').trim() : null,
      panelHidden: panel ? panel.hidden : null,
      panelId: panel ? panel.id : null,
      bodyBottom: px(poem.getBoundingClientRect().bottom + scrollY),
      headTop: px(head.getBoundingClientRect().top + scrollY),
      entryTop: entry ? px(entry.getBoundingClientRect().top + scrollY) : null,
      backLeftAbs: px(pg.querySelector('[data-test="back"]').getBoundingClientRect().left),
      backLeft: px(pg.querySelector('[data-test="back"]').getBoundingClientRect().left - cr.left),
      detailRight: px(cr.right - pg.querySelector('[data-test="detail"]').getBoundingClientRect().right),
      titleDev: null, identDev: null, bodyDevs: [], bodyDevMax: null,
      paras: [], paraGaps: [], panelH: null, panelTopGap: null,
      sectionBorderW: null, sectionPadTop: null, panelBorderW: null, entryBorderW: null, topbarBorderW: null,
      visibleText: pg.innerText.replace(/\\s+/g, ' ').trim(),
      nButton: pg.querySelectorAll('button').length };
    var t = pg.querySelector('[data-test="lt"][data-kind="title"]');
    var idn = pg.querySelector('[data-test="lt"][data-kind="ident"]');
    if (t) o.titleDev = f4(Math.abs(txt(t).cx - cc));
    if (idn) o.identDev = f4(Math.abs(txt(idn).cx - cc));
    var bl = pg.querySelectorAll('[data-test="lt"][data-kind="body"]');
    for (var k = 0; k < bl.length; k += 1) o.bodyDevs.push(f4(Math.abs(txt(bl[k]).cx - cc)));
    o.bodyDevMax = o.bodyDevs.length ? Math.max.apply(null, o.bodyDevs) : null;
    var nps = pg.querySelectorAll('[data-test="nparagraph"]');
    for (var m = 0; m < nps.length; m += 1) o.paras.push(nps[m].textContent);
    if (nps.length > 1) for (var q = 1; q < nps.length; q += 1) {
      o.paraGaps.push(px(nps[q].getBoundingClientRect().top - nps[q-1].getBoundingClientRect().bottom));
    }
    if (panel && !panel.hidden) {
      o.panelH = px(panel.getBoundingClientRect().height);
      o.panelTopGap = px(panel.getBoundingClientRect().top - poem.getBoundingClientRect().bottom);
    }
    var sec = pg.querySelector('[data-test="notesection"]');
    if (sec) { o.sectionBorderW = px(parseFloat(getComputedStyle(sec).borderTopWidth)); o.sectionPadTop = getComputedStyle(sec).paddingTop; }
    var row = pg.querySelector('[data-test="noterow"]');
    if (row) o.entryBorderW = px(parseFloat(getComputedStyle(row).borderTopWidth));
    o.topbarBorderW = px(parseFloat(getComputedStyle(pg.querySelector('[data-test="topbar"]')).borderTopWidth));
    if (panel) o.panelBorderW = px(parseFloat(getComputedStyle(panel).borderTopWidth));
    var badge = pg.querySelector('[data-test="fxbadge"]');
    if (badge) {
      var bcs = getComputedStyle(badge);
      o.badge = { style: bcs.borderTopStyle, color: bcs.borderTopColor, bg: bcs.backgroundColor,
        text: badge.textContent.replace(/\\s+/g,' ').trim(),
        visible: !!(badge.offsetWidth || badge.offsetHeight) };
    } else o.badge = null;
    if (entry) { var ecs = getComputedStyle(entry); o.entryBorderW2 = px(parseFloat(ecs.borderTopWidth)); o.entryBg = ecs.backgroundColor; }
    out.pages.push(o);
  }
  var all = document.querySelectorAll('body *');
  for (var z = 0; z < all.length; z += 1) {
    var e = all[z], cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    var r = e.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.right > out.maxRight) out.maxRight = r.right;
    if (r.left < out.minLeft) out.minLeft = r.left;
    if (r.right > innerWidth + 1) out.over.push(e.tagName.toLowerCase() + '.' + String(e.className || '').trim() + ' right=' + px(r.right));
  }
  return JSON.stringify(out);
})()`;

/* ── [G] 全局断言（不需要浏览器）───────────────────────────────── */
log('原型页（只读打开）：' + HTML_PATH);
log('源文件基准（只读）：' + MD_PATH + '  行数=' + mdFlat.length);
log('仓库根（从脚本目录向上查找 prototype/css/theme-tech.css）：' + ROOT);
log('截图口径：' + VW + ' 真实 CSS px @DPR ' + DPR + '；C=' + cwOf(VW) + '（公式 min(V, max(' + P.floor + ', ' + P.cwPct + '%×(V−' + P.deduct + ')))）');

log('\n═══════════ [G] 全局：令牌快照 / 已定项 / 标注 / 自包含 / ③ 的框说明 ═══════════');
const themeText = readFileSync(join(ROOT, 'prototype', 'css', 'theme-tech.css'), 'utf8');
const themeTokens = parseTokens(themeText);
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
  mismatches.length === 0 && snap.size > 10,
  mismatches.length ? mismatches.join(' | ') : `${snap.size} 个令牌逐字一致（空白已归一化）`);
check('快照里没有「声明了却没用」的令牌；页面里用到的每个 var() 都有声明',
  undeclared.length === 0 && unusedSnap.length === 0,
  `未声明=${JSON.stringify(undeclared)} 快照未用=${JSON.stringify(unusedSnap)}`);
const shaRecorded = (htmlText.match(/仓库提交：([0-9a-f]{7,40})/) || [])[1] || '(没记录)';
check('页面记录了令牌快照的来源提交（短 sha）＋写明「权威仍是 docs/design/visual-tokens.md」',
  /^[0-9a-f]{7,40}$/.test(shaRecorded) && htmlText.includes('权威仍是 docs/design/visual-tokens.md'),
  `记录=${shaRecorded}`);
check(`页面写明覆盖视口 ${VW} 与已选宽度口径 C = min(V, max(320, 0.88 × (V − 24)))`,
  htmlText.includes('C = min(V, max(320, 0.88 × (V − 24)))') && htmlText.includes(String(VW) + ' CSS px'),
  '宽度口径原文与 430 视口都在');
const fixedWant = [
  ['--title-size: 1.5rem', '题名 1.5rem'],
  ['--title-weight: 500', '题名 500'],
  ['--title-ls: 0.1em', '题名字距 0.1em'],
  ['--meta-size: 0.78rem', '身份行 0.78rem'],
  ['--title-gap: 0.7rem', '题名→身份 0.7rem'],
  ['--body-gap: 2.1rem', '身份→原文 2.1rem'],
  ['--poem-size: 17px', '正文 17px'],
  ['--poem-lh: 2', '正文行高 2'],
  ['--poem-ls: 0.045em', '正文字距 0.045em'],
  ['--edge-x: 1.05rem', '列内沿 1.05rem'],
];
const missingFixed = fixedWant.filter(([s]) => !htmlText.includes(s));
check('已定项（诗页字号/间距/内沿）逐条在页面上', missingFixed.length === 0,
  missingFixed.length ? '缺：' + missingFixed.map((x) => x[1]).join('、') : `${fixedWant.length} 条已定值全在`);
const mustSay = ['材料，不是实施', '选某一档 ≠ 采纳整页规格', '不决定', 'JSON／MD', '原型说明 · 不属于应用页面',
  '测试夹具笔记，不是用户笔记', '无笔记', '全部居中', '顶部行', '夹具'];
const notSaid = mustSay.filter((s) => !htmlText.includes(s));
check('页面写明了「材料不是实施／选某一档 ≠ 采纳整页规格／不决定 JSON／MD 分界／原型说明与夹具标注／无笔记隐藏／全部居中／顶部行」',
  notSaid.length === 0, notSaid.length ? '缺：' + notSaid.join('、') : mustSay.join('、'));
const frameSay = ['更新处', '去框', '退化为', '未决'];
const frameBad = frameSay.filter((s) => !htmlText.includes(s));
check('③ 那一档在页面上写明了它与「更新处已去框」相抵、若外推则应退化为不用框、且**未决**',
  frameBad.length === 0, frameBad.length ? '缺：' + frameBad.join('、') : frameSay.join('、'));
const textHits = ['<link', 'src=', '@import', 'http://', 'https://'].filter((t) => htmlText.indexOf(t) >= 0);
check('页面文本里没有 <link / src= / @import / http(s)://（零外部引用）',
  textHits.length === 0, textHits.length ? '命中：' + textHits.join(' ') : '0 处');
check(`参数表可解析：cw_pct=${P.cwPct} deduct=${P.deduct} floor=${P.floor} edge=${P.edge} viewport=${P.viewport}` +
  ` center_tol=${P.centerTol} blocks=${P.blocks} candidates=${P.candidates} fixture_short=${P.fixShort} fixture_long=${P.fixLong}`,
  P.cwPct === 88 && P.deduct === 24 && P.floor === 320 && P.edge === 16.8 && P.viewport === VW &&
  P.centerTol === 0.01 && P.blocks === 10 && P.candidates === 3 && P.fixShort === 1 && P.fixLong === 3 &&
  P.noteMargin === '2.6rem' && P.noteGap === '0.8rem',
  JSON.stringify(P));

/* ── [F] 夹具合法性：真实内容里没有任何 notes ────────────────────── */
log('\n═══════════ [F] 夹具：真实内容没有笔记 ⇒ 有笔记态只能靠夹具 ═══════════');
const poemFiles = readdirSync(POEMS_DIR).filter((f) => f.endsWith('.md'));
const withNotes = poemFiles.filter((f) => /^\s*notes\s*:/m.test(readFileSync(join(POEMS_DIR, f), 'utf8')));
check(`真实内容 ${poemFiles.length} 首里**没有任何一首**声明 notes:（⇒ 有笔记态只能用醒目标注的夹具）`,
  poemFiles.length >= 19 && withNotes.length === 0,
  withNotes.length ? '声明了 notes 的：' + withNotes.join('、') : `${poemFiles.length} 个文件，0 个有 notes:`);
check('夹具句子逐字正确，且不含第一人称（我／咱／俺）—— 不代写用户笔记',
  FIX_SHORT[0] === FIX_SENTENCE && FIX_LONG[0] === FIX_SENTENCE &&
  !/[我咱俺]/.test(FIX_SHORT.concat(FIX_LONG).join('')) &&
  FIX_LONG.length === P.fixLong && FIX_SHORT.length === P.fixShort,
  `短夹具 ${FIX_SHORT.length} 段／长夹具 ${FIX_LONG.length} 段；第一段＝「${FIX_SENTENCE}」；无第一人称`);

/* ── 浏览器：跑起来 ─────────────────────────────────────────────── */
async function run() {
  const port = await freePort();
  const profile = mkdtempSync(join(tmpdir(), 'qpnote-'));
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--disable-background-networking',
    '--disable-component-update', '--disable-sync', '--remote-allow-origins=*',
    '--user-data-dir=' + profile, '--remote-debugging-port=' + port, 'about:blank',
  ], { stdio: 'ignore' });
  log(`CDP 端口（内核分配的空闲端口）：${port}`);

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
    const evalJson = async (expr) => JSON.parse(await js(expr));
    const measure = async () => JSON.parse(await js(MEASURE));
    async function load(url) {
      requests.length = 0; pageErrors.length = 0; events.length = 0;
      await send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: DPR, mobile: true });
      await send('Page.navigate', { url });
      for (let i = 0; i < 150 && !events.includes('Page.loadEventFired'); i += 1) await sleep(100);
      for (let i = 0; i < 40; i += 1) {
        if (await js(`document.documentElement.dataset.ready === '1'`)) break;
        await sleep(100);
      }
      await sleep(250);
    }
    async function clickSel(sel) {
      const box = await evalJson(`(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e)return JSON.stringify({missing:true});`
        + `e.scrollIntoView({block:'center'});var r=e.getBoundingClientRect();`
        + `return JSON.stringify({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2),`
        + `inView:r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth});})()`);
      if (box.missing) return box;
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
      await sleep(160);
      return box;
    }

    await send('Runtime.enable'); await send('Log.enable');
    await send('Page.enable'); await send('Network.enable');

    const url = 'file:///' + HTML_PATH.replace(/\\/g, '/');
    let gitHead = '(git 不可用)';
    try {
      const a = spawnSync('git', ['-C', ROOT, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' });
      if (a.status === 0) gitHead = a.stdout.trim();
    } catch { /* 不影响断言 */ }
    log(`当前 HEAD=${gitHead}`);

    /* ═══ 普通态：首态 / 结构 / 无笔记 / 几何 ═════════════════════ */
    log('\n═══════════ [S] 普通态：块数 / 每块恰视口宽 / 列宽 = C / 正文逐字 ═══════════');
    await load(url);
    const M0 = await measure();
    check('[S] 页面到达 ready，且普通态**看不到**图内横幅（横幅只属于看图态）',
      M0.ready === true && M0.shot === false && !!M0.banner && M0.banner.display === 'none',
      `ready=${M0.ready} shot=${M0.shot} banner.display=${M0.banner && M0.banner.display}`);
    check(`[S] 图内 10 块（3 档 ×（收起／展开·短／展开·长）＋ 1 格无笔记对照）`,
      M0.pages.length === P.blocks &&
      M0.pages.filter((p) => p.cand === 'c1').length === 3 &&
      M0.pages.filter((p) => p.cand === 'c2').length === 3 &&
      M0.pages.filter((p) => p.cand === 'c3').length === 3 &&
      M0.pages.filter((p) => p.cand === 'none').length === 1,
      `${M0.pages.length} 块：${M0.pages.map((p) => p.block).join(' ')}`);
    const badW = M0.pages.filter((p) => !near(p.pgW, VW, 0.02) || !near(p.pgLeft, 0, 0.02));
    check('[S] 每块恰＝视口宽、块左沿 0', badW.length === 0,
      badW.length ? badW.map((p) => `${p.block} w=${p.pgW} left=${p.pgLeft}`).join(' ') : `${M0.pages.length} 块都是 ${VW}px / left 0`);
    const badCol = M0.pages.filter((p) => !near(p.colW, COLW, 0.02) || !near(p.colLeft, (VW - COLW) / 2, 0.02));
    check(`[S] 每块 .col 宽 ＝ C ＝ ${r2(COLW)}px、列左沿 ＝ (V−C)/2 ＝ ${r2((VW - COLW) / 2)}`,
      badCol.length === 0,
      badCol.length ? badCol.map((p) => `${p.block} colW=${p.colW} left=${p.colLeft}`).join(' ') : `${M0.pages.length} 块都一致`);
    const lineBad = [];
    for (const p of M0.pages) {
      if (p.bodyDevs.length !== 8) lineBad.push(`${p.block} 正文行数 ${p.bodyDevs.length}`);
    }
    check('[S] 每块的正文都是 8 行', lineBad.length === 0, lineBad.length ? lineBad.join(' ') : '10 块 × 8 行');
    const mdFlatCheck = JSON.parse(await js(`JSON.stringify((function(){var a=[];var ls=document.querySelectorAll('[data-block="c1a"] [data-test="lt"][data-kind="body"]');for(var i=0;i<ls.length;i++)a.push(ls[i].textContent);return a;})())`));
    check('[S] 正文 8 行与 content/poems/gushi-shijiu-shou-01.md **逐字相同**（原文本轮未改一字）',
      mdFlatCheck.length === 8 && mdFlatCheck.every((t, i) => t === mdFlat[i]),
      mdFlatCheck.join('|') === mdFlat.join('|') ? '8 行逐字一致' : JSON.stringify(mdFlatCheck));

    log('\n═══════════ [N] 无笔记对照：整块隐藏（不是 display:none 占位）═══════════');
    const n0 = M0.pages.filter((p) => p.expect === 'none')[0];
    check(`[N] ${n0.block}：\`[data-test="notes"]\` 用 querySelector 查**为 null**（整块不存在）`,
      n0.hasNotes === false, `hasNotes=${n0.hasNotes}`);
    check(`[N] ${n0.block}：该块可见文本里**没有「笔记」二字**（连标题都没有）`,
      n0.visibleText.indexOf('笔记') < 0, JSON.stringify(n0.visibleText.slice(0, 60)) + '…');
    check(`[N] ${n0.block}：该块里没有任何 button（没有空的展开按钮）`, n0.nButton === 0, `button 数＝${n0.nButton}`);
    const others = M0.pages.filter((p) => p.expect !== 'none');
    check('[N] 其余 9 块都**有** `[data-test="notes"]`（有笔记才显示入口）',
      others.length === 9 && others.every((p) => p.hasNotes === true),
      others.map((p) => p.block + '=' + p.hasNotes).join(' '));

    log('\n═══════════ [B] 入口：<button type=button> · 放哪 · 收起态有没有框 ═══════════');
    const entries = M0.pages.filter((p) => p.entryTag);
    check('[B] 入口都是 `<button type="button">`（不是 <a>／div），且没有内联 onclick',
      entries.length === 9 && entries.every((p) => p.entryTag === 'BUTTON' && p.entryType === 'button' && p.entryOnclick === false),
      `入口 ${entries.length} 个：${[...new Set(entries.map((p) => p.entryTag + '/' + p.entryType))].join(',')}；内联 onclick ${entries.filter((p) => p.entryOnclick).length} 个`);
    check('[B] 每个入口的 aria-controls 都指到自己那一块的面板 id，且该面板存在',
      entries.every((p) => p.entryControls === 'panel-' + p.block && p.panelId === p.entryControls),
      entries.map((p) => p.block + '→' + p.entryControls).slice(0, 3).join(' ') + ' …');
    const c1 = M0.pages.filter((p) => p.cand === 'c1');
    const c2 = M0.pages.filter((p) => p.cand === 'c2');
    const c3 = M0.pages.filter((p) => p.cand === 'c3');
    check('[B] ①③ 的入口在**正文之后**（入口顶 > 原文末行底）',
      c1.concat(c3).every((p) => p.entryTop > p.bodyBottom),
      c1.concat(c3).map((p) => `${p.block} 入口${p.entryTop} 正文末${p.bodyBottom}`).join('；'));
    check('[B] ② 的入口在**正文之上**（在顶部行里、与返回/详情同一行）',
      c2.every((p) => p.entryTop < p.headTop),
      c2.map((p) => `${p.block} 入口${p.entryTop} 题头顶${p.headTop}`).join('；'));
    const c3a = M0.pages.filter((p) => p.block === 'c3a')[0];
    const flatCollapsed = M0.pages.filter((p) => p.expect === 'collapsed' && p.cand !== 'c3');
    check('[B] ③ **收起态就画了框**（分区 border-width > 0，且入口在框里）',
      c3a.hasSection === true && c3a.sectionBorderW > 0,
      `c3a hasSection=${c3a.hasSection} border=${c3a.sectionBorderW}px padTop=${c3a.sectionPadTop}`);
    check('[B] ①② 收起态**没有框**（① 的入口行 border=0；② 的顶部行 border=0；两者面板 border=0）',
      flatCollapsed.every((p) => (p.entryBorderW === null ? p.topbarBorderW === 0 : p.entryBorderW === 0) && p.panelBorderW === 0),
      flatCollapsed.map((p) => `${p.block} rowB=${p.entryBorderW} topbarB=${p.topbarBorderW} panelB=${p.panelBorderW}`).join('；'));
    check('[B] 入口控件自身不带边框、不带底色（控件是「轻」的，与返回／详情同款）',
      entries.every((p) => p.entryBorderW2 === 0 && /rgba\(0, 0, 0, 0\)/.test(p.entryBg)),
      `边框非 0 的 ${entries.filter((p) => p.entryBorderW2 !== 0).length} 个`);

    log('\n═══════════ [F] 夹具渲染：逐字等于脚本自带的预期 ＋ 黄色警示标注 ═══════════');
    const fxPages = M0.pages.filter((p) => p.expect !== 'none');
    const fxBad = [];
    for (const p of fxPages) {
      const want = p.fixture === 'long' ? FIX_LONG : FIX_SHORT;
      if (p.paras.length !== want.length || !p.paras.every((t, i) => t === want[i])) {
        fxBad.push(`${p.block} 夹具段落与预期不一致（${p.paras.length} 段）`);
      }
      if (p.paras.length && p.paras[0] !== FIX_SENTENCE) fxBad.push(`${p.block} 第一段不是那句夹具标注`);
    }
    check('[F] 页面里渲染的笔记正文**逐字**等于脚本自带的预期夹具（短 1 段／长 3 段）',
      fxBad.length === 0, fxBad.length ? fxBad.join(' | ') : `${fxPages.length} 块的夹具正文逐字一致`);
    const allFixtures = fxPages.map((p) => p.paras.join('\n')).join('\n');
    check('[F] 全部夹具文本里**没有第一人称**（我／咱／俺）—— 页面没有代写用户笔记',
      !/[我咱俺]/.test(allFixtures), `夹具总字数 ${allFixtures.length}，第一人称 0 处`);
    check('[F] 夹具区域带**黄色虚线警示标注**（fxbadge：border-style=dashed、边框色＝--line-warn rgba(201,162,74,0.34)、底色＝--warn-soft）',
      fxPages.every((p) => p.badge && p.badge.style === 'dashed' &&
        p.badge.color === 'rgba(201, 162, 74, 0.34)' && p.badge.bg === 'rgba(201, 162, 74, 0.08)'),
      fxPages.map((p) => `${p.block}[${p.badge && p.badge.style}/${p.badge && p.badge.color}]`).slice(0, 3).join(' ') + ' …');
    check('[F] 夹具标注文字里写明「夹具」，且**不在应用页面里冒充用户笔记**',
      fxPages.every((p) => p.badge && /夹具/.test(p.badge.text)),
      JSON.stringify(fxPages[0].badge.text));

    log('\n═══════════ [C] 首态一律收起 ═══════════');
    check('[C] 页面正常打开时**一切收起**：9 个入口 aria-expanded=false、9 个面板 hidden',
      entries.every((p) => p.entryAria === 'false' && p.panelHidden === true),
      entries.map((p) => p.block + ':' + p.entryAria + '/' + p.panelHidden).join(' '));

    log('\n═══════════ [C] 真鼠标点开（CDP Input.dispatchMouseEvent）═══════════');
    /* ① 每档的**收起态**块：点一下展开、再点一下收起（证明 aria-expanded 跟着变） */
    for (const blk of ['c1a', 'c2a', 'c3a']) {
      const before = JSON.parse(await js(`JSON.stringify((function(){var p=document.querySelector('[data-block="${blk}"]');return {aria:p.querySelector('[data-test="noteentry"]').getAttribute('aria-expanded'),hidden:p.querySelector('[data-test="notebody"]').hidden};})())`));
      const box = await clickSel(`[data-block="${blk}"] [data-test="noteentry"]`);
      const after = JSON.parse(await js(`JSON.stringify((function(){var p=document.querySelector('[data-block="${blk}"]');var e=p.querySelector('[data-test="noteentry"]');return {aria:e.getAttribute('aria-expanded'),hidden:p.querySelector('[data-test="notebody"]').hidden,vis:!!p.querySelector('[data-test="notebody"]').offsetHeight};})())`));
      const box2 = await clickSel(`[data-block="${blk}"] [data-test="noteentry"]`);
      const back = JSON.parse(await js(`JSON.stringify((function(){var p=document.querySelector('[data-block="${blk}"]');var e=p.querySelector('[data-test="noteentry"]');return {aria:e.getAttribute('aria-expanded'),hidden:p.querySelector('[data-test="notebody"]').hidden};})())`));
      check(`[C] ${blk} 真鼠标点一下 ⇒ aria-expanded false→true、面板出现（且真的在视口内点到：y=${box.y}）`,
        box.inView === true && before.aria === 'false' && before.hidden === true &&
        after.aria === 'true' && after.hidden === false && after.vis === true,
        `before ${before.aria}/${before.hidden} → after ${after.aria}/${after.hidden} vis=${after.vis}`);
      check(`[C] ${blk} 再点一下 ⇒ 回到 false、面板又隐藏（y=${box2.y}）`,
        back.aria === 'false' && back.hidden === true, `back ${back.aria}/${back.hidden}`);
    }
    /* ② 展开态那 6 块：点开并留在展开态 */
    for (const blk of ['c1b', 'c1c', 'c2b', 'c2c', 'c3b', 'c3c']) {
      const box = await clickSel(`[data-block="${blk}"] [data-test="noteentry"]`);
      const st = JSON.parse(await js(`JSON.stringify((function(){var p=document.querySelector('[data-block="${blk}"]');var e=p.querySelector('[data-test="noteentry"]');var b=p.querySelector('[data-test="notebody"]');return {aria:e.getAttribute('aria-expanded'),hidden:b.hidden,vis:!!b.offsetHeight};})())`));
      check(`[C] ${blk} 真鼠标点开并留在展开态（aria-expanded=true、面板可见）`,
        box.inView === true && st.aria === 'true' && st.hidden === false && st.vis === true,
        `aria=${st.aria} hidden=${st.hidden} vis=${st.vis}`);
    }

    log('\n═══════════ [H] 展开后的几何：无溢出 / 正文仍逐行居中 / 顶部行未动 ═══════════');
    const M1 = await measure();
    await send('Runtime.evaluate', { expression: 'window.scrollTo(0,0)', returnByValue: true });
    check(`[H] 展开后**无横向溢出**：docW = bodyW = 视觉视口宽 = ${VW}`,
      M1.docW === VW && M1.bodyW === VW && M1.vvW === VW,
      `docW=${M1.docW} bodyW=${M1.bodyW} vvW=${M1.vvW}`);
    check(`[H] 展开后**没有任何元素的右沿越出视口**（含最长夹具态）；maxRight = ${r2(M1.maxRight)} ≤ ${VW}（minLeft=${r2(M1.minLeft)} ≥ 0）`,
      M1.over.length === 0 && M1.maxRight <= VW + 0.5 && M1.minLeft >= -0.5,
      M1.over.length ? '越界：' + M1.over.slice(0, 5).join(' | ') : `越界 0 个（maxRight=${r2(M1.maxRight)}）`);
    check('[H] 展开**没有改动内容列**：每块列宽仍＝C、列左沿仍＝(V−C)/2',
      M1.pages.every((p) => near(p.colW, COLW, 0.02) && near(p.colLeft, (VW - COLW) / 2, 0.02)),
      `列宽集合 ${[...new Set(M1.pages.map((p) => p.colW))].join(',')}`);
    const devBad = [];
    M1.pages.forEach((p) => { if (!(p.bodyDevMax <= P.centerTol)) devBad.push(`${p.block} max=${p.bodyDevMax}`); });
    check(`[H] **正文仍逐行居中**：每块 8 行的「文字盒中心 − 列中心」|差| ≤ ${P.centerTol}px`,
      devBad.length === 0,
      devBad.length ? '超差：' + devBad.join(' ') : `10 块 × 8 行，最大偏差 ${Math.max(...M1.pages.map((p) => p.bodyDevMax))}px（容差 ±${P.centerTol}）`);
    const tiBad = M1.pages.filter((p) => !(p.titleDev <= P.centerTol) || !(p.identDev <= P.centerTol));
    check(`[H] 题名与身份行也居中（|差| ≤ ${P.centerTol}px）`, tiBad.length === 0,
      tiBad.length ? tiBad.map((p) => `${p.block} title=${p.titleDev} ident=${p.identDev}`).join(' ') :
        `题名最大 ${Math.max(...M1.pages.map((p) => p.titleDev))}，身份行最大 ${Math.max(...M1.pages.map((p) => p.identDev))}`);
    const edgeBad = M1.pages.filter((p) => !near(p.backLeft, P.edge, 0.6) || !near(p.detailRight, P.edge, 1.0));
    check(`[H] 顶部行为**返回左沿 ${P.edge}px / 详情右沿 ${P.edge}px**（未参与居中）`,
      edgeBad.length === 0,
      edgeBad.length ? edgeBad.map((p) => `${p.block} back=${p.backLeft} detailR=${p.detailRight}`).join(' ') :
        `${M1.pages.length} 块一致：返回左沿 ${M1.pages[0].backLeft}、详情右沿 ${M1.pages[0].detailRight}`);
    const movedBad = [];
    for (const a of M1.pages) {
      const b = M0.pages.filter((x) => x.block === a.block)[0];
      if (!near(a.backLeftAbs, b.backLeftAbs, 0.05) || !near(a.detailRight, b.detailRight, 0.05)) {
        movedBad.push(`${a.block} backΔ=${r4(a.backLeftAbs - b.backLeftAbs)} detailRΔ=${r4(a.detailRight - b.detailRight)}`);
      }
    }
    check('[H] 展开／收起**一点都没有挪动顶部行左右沿**（逐块与展开前相同）',
      movedBad.length === 0, movedBad.length ? movedBad.join(' ') : '10 块前后一致（差 0）');
    const expandedDetail = M1.pages.filter((p) => p.expect === 'expanded');
    check('[H] 展开态的 6 块：面板真的在（有高）、且面板顶在原文末行底之下（展开内容出现在正文之后）',
      expandedDetail.every((p) => p.panelH > 0 && p.panelTopGap > 0),
      expandedDetail.map((p) => `${p.block} 面板高${p.panelH} 顶距正文${p.panelTopGap}`).join('；'));
    const longP = M1.pages.filter((p) => p.fixture === 'long' && p.expect === 'expanded');
    check('[F] 长夹具（3 段）**段间距 > 0** 且面板明显比短夹具高（多段/换行看得出来）',
      longP.every((p) => p.paraGaps.length === 2 && p.paraGaps.every((g) => g > 0)),
      longP.map((p) => `${p.block} 段间距 ${p.paraGaps.join('/')} 段数${p.paras.length} 面板高${p.panelH}`).join('；'));

    /* 页面自己印的数字 vs 脚本独立实测 */
    const printed = await evalJson(`JSON.stringify(Array.prototype.map.call(document.querySelectorAll('[data-test="metrics"]'), function(e){return e.textContent.replace(/\\s+/g,' ').trim();}))`);
    const pC = [], pDev = [];
    printed.forEach((t) => {
      (t.match(/C=([0-9.]+)px/g) || []).forEach((m) => pC.push(Number(m.slice(2, -2))));
      (t.match(/中心差 max ([0-9.]+)px/g) || []).forEach((m) => pDev.push(Number(/([0-9.]+)/.exec(m)[1])));
    });
    check('[G] 页面自报的每块 C 与脚本独立实测一致；页面自报的「正文逐行中心差 max」都 ≤ center_tol',
      pC.length === 10 && pC.every((v) => near(v, COLW, 0.02)) && pDev.length === 10 && pDev.every((v) => v <= P.centerTol),
      `页面自报 C=${[...new Set(pC)].join(',')}（实测 ${r2(COLW)}）；自报 dBox max=${Math.max(...pDev)}`);

    rowsOut.push({
      colW: r2(COLW), colLeft: r2((VW - COLW) / 2), colRight: r2(COL_RIGHT),
      bodyDevMax: Math.max(...M1.pages.map((p) => p.bodyDevMax)),
      backLeft: M1.pages[0].backLeft, detailRight: M1.pages[0].detailRight,
      n0: `${n0.block}: notes=${n0.hasNotes}, text含「笔记」=${n0.visibleText.indexOf('笔记') >= 0}`,
      collapsedEntryTop: M1.pages.filter((p) => p.expect === 'collapsed').map((p) => p.block + '=' + (p.entryTop - p.bodyBottom) + 'px').join(' '),
      panel: M1.pages.filter((p) => p.expect === 'expanded').map((p) => `${p.block}:${p.panelH}/${p.panelTopGap}`).join(' '),
      over: M1.over.length, maxRight: r2(M1.maxRight),
    });

    /* ═══ [P] 看图态 ＋ PNG ═════════════════════════════════════ */
    if (!SHOT) { log('\n[P] 已跳过（--no-shot）：不查看图态、不重出 PNG'); }
    else {
      log('\n═══════════ [P] 看图态 ＋ PNG（真实 430 CSS px @DPR 2）═══════════');
      await send('Page.navigate', { url: 'about:blank' });
      await sleep(150);
      await load(url + '#shot');
      const S0 = await measure();
      check('[P] 看图态：#shot 让图内横幅出现（普通态看不到），且**一切仍然收起**',
        S0.shot === true && S0.banner.display === 'block' && S0.banner.hasText === true &&
        S0.pages.filter((p) => p.expect !== 'none').every((p) => p.entryAria === 'false'),
        `shot=${S0.shot} banner=${S0.banner && S0.banner.display}/${S0.banner && S0.banner.hasText}`);
      check(`[P] 看图态仍无横向溢出（docW = ${VW}、maxRight = ${r2(S0.maxRight)}）`,
        S0.docW === VW && S0.over.length === 0 && S0.maxRight <= VW + 0.5,
        `docW=${S0.docW} maxRight=${r2(S0.maxRight)} over=${S0.over.length}`);
      for (const blk of ['c1b', 'c1c', 'c2b', 'c2c', 'c3b', 'c3c']) {
        const box = await clickSel(`[data-block="${blk}"] [data-test="noteentry"]`);
        if (!box.inView) check(`[P] ${blk} 拍照前点开的入口在视口内`, false, JSON.stringify(box));
      }
      const S1 = await measure();
      check('[P] 看图态：结构与排布数字与普通态一致（10 块、列宽同 C、展开态 6 块面板可见）',
        S1.pages.length === M1.pages.length &&
        S1.pages.every((p, i) => p.block === M1.pages[i].block && near(p.colW, M1.pages[i].colW, 0.02)) &&
        S1.pages.filter((p) => p.expect === 'expanded').every((p) => p.entryAria === 'true' && p.panelHidden === false),
        `10 块列宽一致；展开态面板可见 ${S1.pages.filter((p) => p.expect === 'expanded' && p.panelHidden === false).length}/6`);
      check(`[P] 看图态（展开后）仍然无横向溢出、正文仍逐行居中（≤ ${P.centerTol}px）`,
        S1.docW === VW && S1.over.length === 0 && S1.maxRight <= VW + 0.5 &&
        S1.pages.every((p) => p.bodyDevMax <= P.centerTol),
        `docW=${S1.docW} maxRight=${r2(S1.maxRight)} 最大行偏 ${Math.max(...S1.pages.map((p) => p.bodyDevMax))}`);
      await send('Runtime.evaluate', { expression: 'window.scrollTo(0,0)', returnByValue: true });
      await sleep(150);
      const S2 = await measure();
      const deckTop = S2.deck.y, deckH = S2.deck.h;
      const parts = [];
      let start = deckTop;
      for (const bl of S2.pages) {
        if (bl.pgBottom - start <= MAX_SHOT_CSS) continue;
        const cut = (bl.pgTop - start > 60) ? bl.pgTop : (start + MAX_SHOT_CSS);
        parts.push({ y: r2(start), h: r2(cut - start) });
        start = cut;
      }
      parts.push({ y: r2(start), h: r2(deckTop + deckH - start) });
      const partsH = parts.reduce((a, p) => a + p.h, 0);
      log(`[P] 截图区（先量高度）：${r2(deckH)} CSS px ⇒ ${r2(deckH * 2)} 设备 px；上限 ${PNG_HARD_LIMIT}` +
        ` ⇒ 拆成 ${parts.length} 张（单张 ≤ ${MAX_SHOT_CSS} CSS px）`);
      check('[P] 每张的高度**先量过**且在单张上限内（超过就按块边界拆图，不假装拍到）',
        parts.every((p) => p.h <= MAX_SHOT_CSS + 0.01 && p.h > 0),
        parts.map((p, i) => `#${i + 1} y=${p.y} h=${p.h}`).join(' '));
      check('[P] 各张高度之和 == 截图区高度（正好铺满、不重不漏）',
        near(partsH, deckH, 0.05), `Σ${r2(partsH)} vs ${r2(deckH)}`);
      for (let pi = 0; pi < parts.length; pi += 1) {
        const p = parts[pi];
        const name = parts.length === 1 ? `q-poem-note.${VW}.png` : `q-poem-note.${VW}.part${pi + 1}.png`;
        const pngPath = join(OUT, name);
        const shot = await send('Page.captureScreenshot', {
          format: 'png', captureBeyondViewport: true,
          clip: { x: 0, y: p.y, width: VW, height: p.h, scale: 1 },
        });
        writeFileSync(pngPath, Buffer.from(shot.data, 'base64'));
        const buf = readFileSync(pngPath);
        const size = pngSize(buf);
        log(`      ${name}：clip y=${p.y} h=${p.h} → 像素 ${size.w}×${size.h}，${statSync(pngPath).size} 字节`);
        check(`[P] ${name} 像素宽 = 视口宽 × 2 = ${VW * DPR}（真实 CSS px @DPR 2，不是缩放图、不是拼图）`,
          size.w === VW * DPR, `实测 ${size.w}`);
        check(`[P] ${name} 像素高 = 该张截图区高 × 2（±2px）`, Math.abs(size.h - p.h * DPR) <= 2,
          `实测 ${size.h}，期望 ${r2(p.h * DPR)}`);
        check(`[P] ${name} 非空且高 < ${PNG_HARD_LIMIT}（没有被截断）`,
          statSync(pngPath).size > 1000 && size.h < PNG_HARD_LIMIT,
          `${statSync(pngPath).size} 字节，${size.w}×${size.h}`);
      }
    }

    /* ═══ 自包含 / 无 JS 报错 ═══════════════════════════════════ */
    log('\n═══════════ [G] 自包含 ＋ 无 JS 报错 ═══════════');
    const ext = requests.filter((u) => !u.startsWith('file:///') && !u.startsWith('data:') && !u.startsWith('about:'));
    check('CDP 记录的网络请求里没有任何 http(s) 外部引用',
      ext.length === 0, `${requests.length} 个请求，非 file:// 的=${ext.length} ${JSON.stringify(ext.slice(0, 4))}`);
    check('全程无 JS 报错（加载 ＋ 点击 ＋ 各态）', pageErrors.length === 0,
      pageErrors.length ? pageErrors.join(' | ') : '0 条');

    log('\n═══════════ 汇总（可直接抄进 q-poem-note.md）═══════════');
    rowsOut.forEach((r) => {
      log(`  C=${r.colW}（列 [${r.colLeft} … ${r.colRight}]）｜正文逐行中心差 max=${r.bodyDevMax}px｜返回左沿 ${r.backLeft}／详情右沿 ${r.detailRight}`);
      log(`  无笔记对照：${r.n0}`);
      log(`  收起态「入口顶 − 原文末行底」：${r.collapsedEntryTop}`);
      log(`  展开态「面板高/面板顶距正文」：${r.panel}`);
      log(`  溢出：越界 ${r.over} 个，maxRight=${r.maxRight}`);
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
