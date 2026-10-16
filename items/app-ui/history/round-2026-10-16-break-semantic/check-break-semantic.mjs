/*
 * check-break-semantic.mjs —— 「按句读／半句边界断行」讨论原型的【页面行为 ＋ 逐行几何 ＋ 断点位置 ＋ 模型一致性】自证脚本（可复跑）。
 *
 * ⚠ 它验的是**这一个原型页面**（q-break-semantic.html）的页面行为，**不是产品代码**，也不是任何规格的采纳。
 *   对象只有本目录下的 q-break-semantic.html（**只读打开**：Page.navigate 到 file:// URL，脚本不写、不改它）。
 *   额外读的文件只有两个，都是**只读**：
 *     ① prototype/css/theme-tech.css          —— 用来逐项比对页面内嵌的令牌快照；
 *     ② content/poems/gushi-shijiu-shou-01.md —— 用它的正文 8 行做「原文逐行一致」的基准。
 *
 * 覆盖的视口（**每个视口都单独跑一遍全部断言，并各出一张 PNG**）：320×568 ／ 430×932 ／ 1180×900。
 *   ⚠ 一个视口一张图（真实 CSS px @DPR 2）；**不做**缩放拼图。
 *
 * 本脚本自带**独立实现**的两个断行模型（greedy ＝ ①浏览器默认的「凑满字位＋禁则」；
 *   segs ＝ ②「按句读断」），把页面渲染出来的每一行**逐字**与模型复算的行比对 —— 两边不一致就报错。
 *
 * 断言清单（失败任一即 exit 1；当前失败数 0）：
 *  [G] 令牌快照逐项比对（值不一致数必须 0）／没有「声明了却没用」的令牌／页面里每个 var() 都有声明／
 *      记录快照来源短 sha ＋「权威仍是 docs/design/visual-tokens.md」／写明三个覆盖视口与已选宽度口径／
 *      已定项逐条在页面上／「不排推荐、并列、选某档≠采纳整页规格、不决定 JSON／MD 分界」都在／
 *      自包含（非 file:// 请求 0 个、无 <link / src= / @import / http(s)://）／无 JS 报错／夹具都带标注／
 *      参数表与三张 rank 表可解析且与预期一致。
 *  [P] 每汉字推进宽用页面里临时插入的 max-content 元素**独立实测**，与参数表声明的 17.766／26.4 一致；
 *      各「字位」容器宽 = 字位 × 推进宽（逐档复算）；A 块的容器 = 真实可用宽（C − 33.6）。
 *  [1] 结构：图内 8 块（S0／S1／A／B／C／D／E／F）；S0 的 8 行**逐行与源文件逐字相同**；夹具都带 data-fx="1"。
 *  [2] 每个视口：innerWidth 与 visualViewport.width 精确等于目标；docW === 目标宽、所有可见元素都在 0…目标宽 内
 *      （无横向溢出；`nowrap` 那两格外面套了裁剪框，它的溢出是**故意的**、由 [7] 单独断言）；
 *      每个 .pg 宽 = 视口宽、每个 .col 宽 = C（复算一致）。
 *  [3] **逐行实测**（逐字 Range 量「墨迹盒」）：每块每个被测盒每一行的 左沿／右沿／宽／中心相对本列容器中心
 *      与相对整页内容列中心的差；断言没有一行越出它所在的容器（>0.05px 即失败），**唯一例外**是
 *      data-mode="nowrap" 的那两格（允许溢出＝候选本身）。
 *  [4] **断点位置**（用文字范围量）：逐行给出「上一行末字 → 下一行首字」＋两者的标点类别。
 *  [5] **①模型 == ①实测**：每个 mode="plain" 的盒子，页面渲染的行**逐字**等于本脚本 greedy 复算的行。
 *  [6] **②模型 == ②实测 ＋ 标点归前句**：每个 segs 盒子，页面渲染的行逐字等于本脚本 segs 复算的行；
 *      且凡由「句读候选」断开的段（why=punct）**段末字必是句读类标点**、段首字必不是收尾标点；
 *      凡由「字位下界」断开的段（why=floor）段长必为 cap 或 cap−1。
 *  [7] S1（真实原文 · 压窄容器）：①＝8／4、②＝6／6，逐字等于「行行重行行，／与君生别离。」（用户给的例子）。
 *  [8] A（边界 a）：a-①＝1 行（装得下就不拆）、a-②＝2 行；两列只差断法这一条。
 *  [9] B（边界 b）：三组优先级在两组夹具上给出**不同**断点（b-①＝b-③ ≠ b-② ／ b-①＝b-② ≠ b-③），逐字断言。
 *  [10] C（边界 c）：c-① **逐字等于** c-②（无标点 ⇒ 禁则无作用）；c-③ 1 行且**越出容器 > 0**；c-④ 1 行且不越出。
 *  [11] D（边界 d）：d-①／d-②／d-③／d-④ 逐档断点与越出量断言（含 d-① 与 ② 默认在这里逐字相同）。
 *  [12] E（边界 e）：e-①／e-③ **确实**把收尾标点放到行首／把开局标点留在行尾（违反禁则的实测证据）；
 *      e-②／e-④ 不违反（行首无收尾标点、行末无开局标点）。
 *  [13] F（实现代价）：f-① 与 ② 的段逐字一致；f-④（纯 CSS）**拿不到** f-① 的断点。
 *  [14] 字号／行高／字距**不随宽度变**：正文 17px/34px/0.765px、题名 24px、身份行 12.48px 各只有一个取值。
 *  [15] 页面自报的数字 ＝ 本脚本独立实测（±0.6px）；页面自报带 data-m-* 标记。
 *  [16] PNG：每个视口一张；像素宽 = 视口宽 × 2、像素高 = 截图区 CSS 高 × 2（自己解析 PNG 头读 IHDR）；
 *      文件非空；**高度必须 < 16384**（截图高度上限，避免出现被截断的图还假装成功）。
 *  [17] **边界自证**：CHROME_BIN 指到不存在的路径 ⇒ 必须**如实报错并 exit 2**，**不能**打印「失败断言数：0」。
 *
 * 怎么跑：
 *   node items/app-ui/prototypes/check-break-semantic.mjs
 *   node items/app-ui/prototypes/check-break-semantic.mjs --no-shot          # 只跑断言，不重出 PNG
 *   node items/app-ui/prototypes/check-break-semantic.mjs --only=320         # 只跑一个视口
 *   node items/app-ui/prototypes/check-break-semantic.mjs --selftest-chrome  # 只跑「CHROME_BIN 指错 ⇒ 如实报错」边界
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
 *         q-break-semantic.html 本身**只读打开**，不写、不改。
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, statSync, existsSync } from 'node:fs';
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
  { key: '320', w: 320, h: 568, mobile: true, label: '手机 · 最窄' },
  { key: '430', w: 430, h: 932, mobile: true, label: '手机（前几轮的验收宽）' },
  { key: '1180', w: 1180, h: 900, mobile: false, label: '桌面（宽而矮）' },
];
const MD_PATH = join(ROOT, 'content', 'poems', 'gushi-shijiu-shou-01.md');
const HTML_PATH = join(OUT, 'q-break-semantic.html');
const PNG_HARD_LIMIT = 16384;
const MAX_SHOT_CSS = PNG_HARD_LIMIT / 2;

const CHROME = process.env.CHROME_BIN
  || join(process.env.LOCALAPPDATA || '', 'Chromium', 'Application', 'chrome.exe');
if (!CHROME || !existsSync(CHROME)) {
  console.error('找不到无头 Chromium：' + (CHROME || '(未设置)'));
  console.error('请用环境变量指定，例如：');
  console.error("  CHROME_BIN='C:/Users/wsqsy/AppData/Local/Chromium/Application/chrome.exe' \\");
  console.error('    node items/app-ui/prototypes/check-break-semantic.mjs');
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
const paramBlock = declarationBlock(htmlText, '== SEMANTIC-PARAMS-BEGIN ==', '== SEMANTIC-PARAMS-END ==');
if (!paramBlock) { console.error('页面里找不到 == SEMANTIC-PARAMS-BEGIN ==/== SEMANTIC-PARAMS-END == 参数表'); process.exit(2); }
function pnum(key) {
  const m = new RegExp('\\*\\s*' + key + '\\s*:\\s*(-?[0-9.]+)').exec(paramBlock);
  return m ? Number(m[1]) : NaN;
}
function pstr(key) {
  const m = new RegExp('\\*\\s*' + key + '\\s*:\\s*([^\\n*]+)').exec(paramBlock);
  return m ? m[1].trim() : null;
}
function prank(key) {
  const s = pstr(key);
  if (!s) return null;
  const out = {};
  s.split(/\s+/).forEach((t) => {
    const i = t.indexOf('=');
    if (i > 0) out[t.slice(0, i)] = Number(t.slice(i + 1));
  });
  return out;
}
const P = {
  charAdvance: pnum('char_advance'),
  titleAdvance: pnum('title_advance'),
  slotS1: pnum('slot_s1'),
  slotA: pnum('slot_a'),
  slotB: pnum('slot_b'),
  slotC: pnum('slot_c'),
  slotD: pnum('slot_d'),
  slotE: pnum('slot_e'),
  slotF: pnum('slot_f'),
  slotsMin: pnum('slots_min'),
  slotsMax: pnum('slots_max'),
  deduct: pnum('deduct_total'),
  pct: pnum('pct'),
  floor: pnum('floor'),
  edge: pnum('edge_x'),
};
const VIEWPORTS = (pstr('viewports') || '').split(/\s+/).map(Number);
const FX = {
  s1a: pstr('fx_s1a'), s1b: pstr('fx_s1b'), a: pstr('fx_a'),
  b1: pstr('fx_b1'), b2: pstr('fx_b2'), c: pstr('fx_c'), d: pstr('fx_d'),
  eclose: pstr('fx_eclose'), eopen: pstr('fx_eopen'), f: pstr('fx_f'),
};
const RANKS = {
  rank2: prank('rank_2'), b1: prank('rank_b1'), b2: prank('rank_b2'),
  b3: prank('rank_b3'), dsec: prank('rank_d_sec'),
};

/* ── 标点类别（与页面同表；独立写在这里，用来判定行首/行末标点）────── */
const CLOSE = '，。！？；：、）》」』】';
const OPEN = '（《「『【';
const SEMI = '，。！？；：、';
const cat = (ch) => (CLOSE.indexOf(ch) >= 0 ? '收尾标点' : (OPEN.indexOf(ch) >= 0 ? '开局标点' : '普通字'));

/* ══ 独立实现的两个模型（页面里也有一份；两边必须给出同样的行）══════ */
function greedy(text, cap, kin) {
  const rows = []; let k = 0; const n = text.length;
  while (k < n) {
    let w = k + cap;
    if (w >= n) { rows.push(text.slice(k)); break; }
    if (kin) {
      if (CLOSE.indexOf(text.charAt(w)) >= 0) w -= 1;
      else if (OPEN.indexOf(text.charAt(w - 1)) >= 0) w -= 1;
    }
    if (w <= k) w = k + cap;
    rows.push(text.slice(k, w)); k = w;
  }
  return rows;
}
function pick(text, k, w, rank) {
  let best = -1, br = -1;
  for (let p = k + 1; p <= w; p += 1) {
    const rk = rank[text.charAt(p - 1)];
    if (rk === undefined) continue;
    if (rk > br || (rk === br && p > best)) { best = p; br = rk; }
  }
  return best;
}
function segs(text, cap, rank, kin, second) {
  const out = []; let k = 0; const n = text.length;
  while (k < n) {
    const w = k + cap;
    if (w >= n) { out.push({ from: k, to: n, why: 'tail', endChar: text.slice(-1) }); break; }
    let p = pick(text, k, w, rank);
    let why = p >= 0 ? 'punct' : null;
    if (p < 0 && second) { p = pick(text, k, w, second); if (p >= 0) why = 'punct'; }
    if (p < 0) {
      let ww = w;
      if (kin) {
        if (CLOSE.indexOf(text.charAt(ww)) >= 0) ww -= 1;
        else if (OPEN.indexOf(text.charAt(ww - 1)) >= 0) ww -= 1;
      }
      if (ww <= k) ww = w;
      p = ww; why = 'floor';
    }
    out.push({ from: k, to: p, why, endChar: text.charAt(p - 1) });
    k = p;
  }
  return out;
}
const segRows = (text, sp) => sp.map((s) => text.slice(s.from, s.to));
/* 「一律按句读拆」：装得下也拆 —— 每个句读边界都断 */
function segAlways(text) {
  const out = []; let st = 0;
  for (let p = 1; p < text.length; p += 1) {
    if (SEMI.indexOf(text.charAt(p - 1)) >= 0) { out.push({ from: st, to: p, why: 'punct', endChar: text.charAt(p - 1) }); st = p; }
  }
  out.push({ from: st, to: text.length, why: 'tail' });
  return out;
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
const r2 = (n) => Math.round(n * 100) / 100;
const pngSize = (buf) => ({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) });
const dm = (b, name) => (b && b.capData ? b.capData['data-m-' + name.toLowerCase()] : undefined);
const cwOf = (V) => Math.min(V, Math.max(P.floor, P.pct / 100 * (V - P.deduct)));
const adv = (k) => r2(k * P.charAdvance);

/* ── 页面侧量测（脚本自己实现，不依赖页面自报）── */
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
        if (!cur || Math.abs(r.top - cur.top) > 1) { cur = { from: idx, to: idx+1, text: data.charAt(i), l: r.left, r: r.right, top: r.top }; out.push(cur); }
        else { cur.to = idx+1; cur.text += data.charAt(i); cur.l = Math.min(cur.l, r.left); cur.r = Math.max(cur.r, r.right); }
        idx += 1;
      }
    }
    return out.map(function(x){
      return { from:x.from, to:x.to, t:x.text, n:x.to-x.from, l:px(x.l-br.left), r:px(x.r-br.left), w:px(x.r-x.l), cx:px((x.l+x.r)/2-br.left) };
    });
  }
  var blocks = [];
  var ds = document.querySelectorAll('[data-test="demo"]');
  for (var k=0;k<ds.length;k++){
    var d = ds[k];
    var col = d.querySelector('[data-test="col"]');
    var pg = d.querySelector('[data-test="page"]');
    var cap = d.querySelector('[data-test="cap"]');
    var cr = col.getBoundingClientRect(), pr = pg.getBoundingClientRect();
    var cc = cr.left + cr.width/2;
    var o = { block: d.dataset.block, kind: d.dataset.kind || '',
      inShot: !!d.closest('[data-shotframe]'),
      head: d.querySelector('[data-test="dhead"]').textContent.replace(/\\s+/g,' ').trim(),
      colW: px(cr.width), colLeft: px(cr.left), pgW: px(pr.width),
      items: [], capData: {}, capText: cap.textContent.replace(/\\s+/g,' ').trim() };
    Array.prototype.forEach.call(cap.attributes, function(a){ if (a.name.indexOf('data-m-') === 0) o.capData[a.name] = a.value; });
    var boxes = d.querySelectorAll('[data-test="line"]');
    for (var b=0;b<boxes.length;b++){
      var bx = boxes[b];
      var rb = bx.getBoundingClientRect();
      var lb = lineBoxes(bx);
      o.items.push({ tag: 'line', fx: bx.getAttribute('data-fx') === '1',
        real: bx.getAttribute('data-real') === '1',
        cand: bx.getAttribute('data-cand') || '', mode: bx.getAttribute('data-mode') || '',
        fxkey: bx.getAttribute('data-fxkey') || '', kin: bx.getAttribute('data-kin'),
        rule: bx.getAttribute('data-rule') || '', segs: bx.getAttribute('data-segs'),
        cap: Number(bx.getAttribute('data-cap')),
        shrink: bx.getAttribute('data-shrink-size'),
        w: px(rb.width), left: px(rb.left - cr.left),
        text: Array.prototype.map.call(bx.querySelectorAll('[data-seg]'), function(s){ return s.textContent; }).join('') || bx.textContent,
        segTexts: Array.prototype.map.call(bx.querySelectorAll('[data-seg]'), function(s){ return s.textContent; }),
        lines: lb.map(function(x){
          return { t:x.t, n:x.n, l:x.l, r:x.r, w:x.w, cx:x.cx,
            dBox:px((x.l+x.r)/2 - rb.width/2), dCol:px((rb.left + (x.l+x.r)/2) - cc), over:px(x.r - rb.width) };
        }),
        overMax: lb.length ? Math.max.apply(null, lb.map(function(x){ return px(x.r - rb.width); })) : null });
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
  var host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden';
  document.body.appendChild(host);
  var mk = function(cls, ch){
    var e = document.createElement('div'); e.className = cls; e.style.width = 'max-content';
    e.textContent = ch; host.appendChild(e);
    return px(e.getBoundingClientRect().width);
  };
  var advP = mk('pfont', '行'), advT = mk('ttitle', '【');
  host.parentNode.removeChild(host);
  return JSON.stringify({ innerW: window.innerWidth,
    visualW: window.visualViewport ? px(window.visualViewport.width) : null,
    docW: document.documentElement.scrollWidth, docH: document.documentElement.scrollHeight,
    bodyW: document.body.scrollWidth, maxRight: px(maxRight), maxRightEl: mrEl, minLeft: px(minLeft), minLeftEl: mlEl,
    deck: { x: px(deckP.left), y: px(deckP.top + window.scrollY), w: px(deckP.width), h: px(deckP.height) },
    cwVar: String(getComputedStyle(document.documentElement).getPropertyValue('--cw')).trim(),
    avail: document.documentElement.dataset.avail, advP: advP, advT: advT,
    fonts: { poem: cs(bodyEl, ['fontSize','lineHeight','letterSpacing']),
             title: cs(titleEl, ['fontSize','lineHeight','letterSpacing']),
             ident: cs(identEl, ['fontSize','letterSpacing']) },
    shot: document.documentElement.dataset.shot === '1',
    blocks: blocks });
})()`;

async function run() {
  const port = await freePort();
  const profile = mkdtempSync(join(tmpdir(), 'qbsem-'));
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
  log(`参数：adv=${P.charAdvance}/${P.titleAdvance} 字位 S1=${P.slotS1} B=${P.slotB} C=${P.slotC} D=${P.slotD} E=${P.slotE} F=${P.slotF} A=真实可用宽 尺=${P.slotsMin}…${P.slotsMax} C=min(V,max(${P.floor},${P.pct}%×(V−${P.deduct}))) edge=${P.edge}`);

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
    async function load(url, w, h, mobile) {
      requests.length = 0; pageErrors.length = 0; events.length = 0;
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile });
      await send('Page.navigate', { url });
      for (let i = 0; i < 150 && !events.includes('Page.loadEventFired'); i += 1) await sleep(100);
      for (let i = 0; i < 40; i += 1) {
        if (await js(`document.documentElement.dataset.ready === '1'`)) break;
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
    ];
    const missingFixed = fixedList.filter(([, s]) => !htmlText.includes(s));
    check('已定项（诗页字号/间距/行内沿）逐条在页面上，且写明「水平对齐＝全部居中」与顶部行不参与居中',
      missingFixed.length === 0 && htmlText.includes('水平对齐＝全部居中') &&
      htmlText.includes('顶部行＝返回左／详情右、不参与居中'),
      missingFixed.length ? '缺：' + missingFixed.map((x) => x[0]).join('、') : `${fixedList.length} 条已定值全在`);
    const mustSay = ['不排推荐', '并列', '选某档 ≠ 采纳整页规格', '不决定', 'JSON／MD', '材料，不是实施',
      '全部居中', '夹具 · 不是真实数据', '标点归前句', '两个视觉行都继承居中'];
    const notSaid = mustSay.filter((s) => !htmlText.includes(s));
    check('页面写明了「不排推荐／并列／选某档 ≠ 采纳整页规格／不决定 JSON／MD 分界／材料不是实施／标点归前句／两个视觉行都继承居中」',
      notSaid.length === 0, notSaid.length ? '缺：' + notSaid.join('、') : mustSay.join('、'));
    const textHits = ['<link', 'src=', '@import', 'http://', 'https://'].filter((t) => htmlText.indexOf(t) >= 0);
    check('页面文本里没有 <link / src= / @import / http(s)://（零外部引用）',
      textHits.length === 0, textHits.length ? '命中：' + textHits.join(' ') : '0 处');
    check('参数表可解析：字位 S1=8／B=12／C=6／D=8／E=5／F=8、尺 4…12、C 公式 24/88/320、edge=16.8、推进 17.766/26.4',
      P.charAdvance === 17.766 && P.titleAdvance === 26.4 && P.slotS1 === 8 && P.slotB === 12 &&
      P.slotC === 6 && P.slotD === 8 && P.slotE === 5 && P.slotF === 8 && P.slotA === 0 &&
      P.slotsMin === 4 && P.slotsMax === 12 && P.deduct === 24 && P.pct === 88 && P.floor === 320 && P.edge === 16.8,
      JSON.stringify(P));
    const fxAll = Object.keys(FX).every((k) => FX[k] && FX[k].length > 0);
    check('夹具字符串可解析（10 段，含两行真实原文）', fxAll,
      Object.keys(FX).map((k) => `${k}=${FX[k] && FX[k].length}字`).join(' '));
    check('三张 rank 表可解析：rank_2＝rank_b1；b-② 把「；：」放「，、」之上；b-③ 把「，」放最高',
      RANKS.rank2 && RANKS.b1 && RANKS.b2 && RANKS.b3 &&
      JSON.stringify(RANKS.rank2) === JSON.stringify(RANKS.b1) &&
      RANKS.b2['；'] > RANKS.b2['，'] && RANKS.b3['，'] > RANKS.b3['。'],
      `b2=${JSON.stringify(RANKS.b2)} b3=${JSON.stringify(RANKS.b3)}`);

    /* ═══ 逐视口 ═══════════════════════════════════════════════════ */
    const fontBag = [];
    for (const C of CASES) {
      if (ONLY && ONLY !== C.key) continue;
      const W = C.w, H = C.h;
      log(`\n═══════════ 视口 ${C.key}（${W}×${H}，DPR 2）· ${C.label} ═══════════`);
      await load(url, W, H, C.mobile);
      const M = await measure();
      const byId = (bid) => M.blocks.filter((b) => b.block === bid)[0] || null;
      const cw = cwOf(W);
      const AVAIL = r2(cw - 2 * P.edge);
      const slotPx = { S1: adv(P.slotS1), B: adv(P.slotB), C: adv(P.slotC), D: adv(P.slotD), E: adv(P.slotE), F: adv(P.slotF) };
      const itemsOf = (b) => (b ? b.items : []);
      const findItem = (bid, cand) => itemsOf(byId(bid)).filter((i) => i.cand === cand)[0] || null;
      const rowsOf = (i) => i.lines.map((x) => x.t);

      /* [P] 独立实测每汉字推进宽 */
      check(`每汉字推进宽独立实测：正文 ${M.advP}px（参数表 ${P.charAdvance}）、题名 ${M.advT}px（参数表 ${P.titleAdvance}）`,
        near(Number(M.advP), P.charAdvance, 0.02) && near(Number(M.advT), P.titleAdvance, 0.02),
        `量出来的两个元素宽 = ${M.advP} ／ ${M.advT}（容差 0.02px 是 Chrome 布局舍入 1/64px＋本脚本保留 2 位小数）`);

      /* [2] 视口与收敛 */
      check(`innerWidth = ${W}、visualViewport.width = ${W}（真实 CSS px，没有 shrink-to-fit）`,
        M.innerW === W && near(Number(M.visualW), W, 0.5), `innerW=${M.innerW} visualW=${M.visualW}`);
      check(`无横向溢出：docW = bodyW = ${W}，所有可见元素都在 0…${W} 内`,
        M.docW === W && M.bodyW === W && M.maxRight <= W + 0.5 && M.minLeft >= -0.5,
        `docW=${M.docW} bodyW=${M.bodyW} minLeft=${M.minLeft}(${M.minLeftEl}) maxRight=${M.maxRight}(${M.maxRightEl})`);
      const badPg = M.blocks.filter((b) => !near(b.pgW, W, 0.02));
      check(`[1] 每个块的「屏幕」宽都 = 视口宽 ${W}`, badPg.length === 0,
        badPg.length ? badPg.map((b) => `${b.block}:${b.pgW}`).join(' ') : `${M.blocks.length} 块全部一致`);
      const badCol = M.blocks.filter((b) => !near(b.colW, cw, 0.02));
      check(`[2] 每个块的内容列宽都 = C = min(V, max(320, 0.88×(V−24))) = ${r2(cw)}px（复算±0.02）`,
        badCol.length === 0, badCol.length ? badCol.map((b) => `${b.block}:${b.colW}`).join(' ') : `${M.blocks.length} 块全部一致`);
      check(`[2] 本视口正文可用宽 = C − 2×16.8 = ${AVAIL}px（页面自报 ${M.avail}）`,
        near(Number(M.avail), AVAIL, 0.02), `${M.avail} vs 复算 ${AVAIL}`);

      /* [1] 结构 */
      const ids = M.blocks.map((b) => b.block);
      check('[1] 结构：图内 8 块（S0／S1／A／B／C／D／E／F）',
        ids.join(',') === 'S0,S1,A,B,C,D,E,F' && M.blocks.every((b) => b.inShot),
        `图内 ${ids.join(',')}`);
      check(`[P] 各「字位」容器宽 = 字位 × 17.766：S1=${slotPx.S1} B=${slotPx.B} C=${slotPx.C} D=${slotPx.D} E=${slotPx.E} F=${slotPx.F}`,
        itemsOf(byId('S1')).filter((i) => i.real).every((i) => near(i.w, slotPx.S1, 0.02)) &&
        itemsOf(byId('B')).filter((i) => i.fx).every((i) => near(i.w, slotPx.B, 0.02)) &&
        itemsOf(byId('C')).filter((i) => i.fx).every((i) => near(i.w, slotPx.C, 0.02)) &&
        itemsOf(byId('D')).filter((i) => i.fx).every((i) => near(i.w, slotPx.D, 0.02)) &&
        itemsOf(byId('E')).filter((i) => i.fx).every((i) => near(i.w, slotPx.E, 0.02)) &&
        itemsOf(byId('F')).filter((i) => i.fx).every((i) => near(i.w, slotPx.F, 0.02)) &&
        itemsOf(byId('A')).every((i) => near(i.w, AVAIL, 0.02)),
        '逐档复算一致（A 块 = 真实可用宽）');
      const s0 = byId('S0');
      const s0Lines = itemsOf(s0).filter((i) => i.tag === 'line');
      check('[1] S0 是真实诗页：顶部行（返回／详情）＋ 题名 ＋ 身份行 ＋ 正文恰好 8 行',
        s0Lines.length === 8 && htmlText.includes('返回') && htmlText.includes('详情'), `${s0Lines.length} 行`);
      const verbatim = rowsOf(s0Lines[0]) && s0Lines.map((i) => i.text).join('\u0001') === mdFlat.join('\u0001');
      check('[1] S0 的 8 行与 content/poems/gushi-shijiu-shou-01.md **逐字相同**（顺序也相同）', verbatim,
        verbatim ? '8/8 逐字一致' : JSON.stringify({ page: s0Lines.map((i) => i.text), md: mdFlat }));
      const fxItems = [];
      M.blocks.forEach((b) => b.items.forEach((i) => { if (i.fx) fxItems.push({ b: b.block, i }); }));
      check('[1] 夹具都带 data-fx="1"（S1 四格是真实原文、A 两格也是真实原文、都不带夹具标）',
        fxItems.length === 25 && fxItems.filter((x) => x.b === 'S1').length === 0 && fxItems.filter((x) => x.b === 'A').length === 0 &&
        fxItems.filter((x) => x.b === 'B').length === 6 && fxItems.filter((x) => x.b === 'C').length === 4 &&
        fxItems.filter((x) => x.b === 'D').length === 4 && fxItems.filter((x) => x.b === 'E').length === 8 &&
        fxItems.filter((x) => x.b === 'F').length === 3,
        `夹具格数 = ${fxItems.length}（B6＋C4＋D4＋E8＋F3）`);

      /* [3] 逐行几何 */
      log('\n[3] 逐行实测（逐字 Range 的**墨迹盒**；dBox＝相对本列容器中心，dCol＝相对整页内容列中心，over＝越出容器）');
      const overBad = [];
      M.blocks.forEach((b) => b.items.forEach((i) => {
        if (i.mode === 'nowrap') return;   /* 允许溢出＝候选本身，由 [10]/[11] 单独断言 */
        if (i.overMax !== null && i.overMax > 0.05) overBad.push(`${b.block}/${i.cand}:${i.overMax}`);
      }));
      check('[3] 除「允许溢出」那两格外，没有任何一行越出它所在的容器（>0.05px 即失败）',
        overBad.length === 0, overBad.length ? overBad.join(' ') : '全部 ≤ 0.05px');
      const devAll = Math.max.apply(null, M.blocks.reduce((a, b) => a.concat(b.items.reduce((c, i) =>
        c.concat(i.mode === 'nowrap' ? [] : i.lines.map((x) => Math.abs(x.dBox))), [])), [0]));
      check(`[3] 所有被测盒每一行与**本列容器中心**的差 ≤ 0.5px（「两个视觉行都继承居中」；偏差来自末字之后那一份字距 ${r2(P.charAdvance * 0.045 / 1.045)}px）`,
        devAll <= 0.5, `最大 |dBox| = ${r2(devAll)}px`);
      const poemDev = Math.max.apply(null, s0Lines.reduce((c, i) => c.concat(i.lines.map((x) => Math.abs(x.dCol))), [0]));
      check(`[3] S0 的每一行与**整页内容列中心**的差 ≤ 0.5px`, poemDev <= 0.5, `最大 |dCol| = ${r2(poemDev)}px`);
      M.blocks.forEach((b) => {
        log(`      ${b.block}（列宽 ${b.colW} · ${b.head.slice(0, 40)}）：`);
        b.items.forEach((i) => {
          if (!i.lines.length) return;
          log(`        ${String(i.cand).padEnd(6)} w=${String(i.w).padStart(8)} ${i.lines.map((x) => `${x.n}字 L${x.l} R${x.r} dBox${x.dBox} dCol${x.dCol}`).join(' | ')}`);
        });
      });

      /* [4] 断点位置（逐字） */
      const brkDesc = (i) => i.lines.map((x, k) => (k + 1 < i.lines.length
        ? `第${i.lines[k].n}字后「${x.t.slice(-1)}」(${cat(x.t.slice(-1))})→「${i.lines[k + 1].t.charAt(0)}」(${cat(i.lines[k + 1].t.charAt(0))})` : '')).filter(Boolean);
      log('\n[4] 断点位置（行末字 → 行首字 ＋ 标点类别）');
      M.blocks.forEach((b) => b.items.forEach((i) => {
        if (i.lines.length > 1) log(`      ${b.block}/${i.cand}: ${brkDesc(i).join('；')}`);
      }));
      check('[4] 断点位置都用文字范围量出来了（不靠 offsetHeight 猜）',
        M.blocks.every((b) => b.items.every((i) => i.lines.length === 0 || typeof i.lines[0].r === 'number')));

      /* [5] ①模型 == ①实测 */
      const plainBad = [];
      M.blocks.forEach((b) => b.items.forEach((i) => {
        if (i.mode !== 'plain') return;
        const cap = i.cap;
        const kin = !/anywhere/.test(i.rule);
        const expect = greedy(FX[i.fxkey] || i.text, cap, kin);
        if (rowsOf(i).join('|') !== expect.join('|')) {
          plainBad.push(`${b.block}/${i.cand}: 实测 ${rowsOf(i).join('|')} ≠ 模型 ${expect.join('|')}（cap=${cap} kin=${kin}）`);
        }
      }));
      check(`[5] **①模型 == ①实测**：每个「浏览器默认/anywhere」盒子的每一行逐字等于本脚本 greedy 复算的行`,
        plainBad.length === 0, plainBad.length ? plainBad.join(' ; ') : '逐字一致');

      /* [6] ②模型 == ②实测 ＋ 标点归前句 */
      const segBad = [], punctBad = [];
      M.blocks.forEach((b) => b.items.forEach((i) => {
        if (!/^segs/.test(i.mode)) return;
        const text = FX[i.fxkey] || i.text;
        const cap = i.cap;
        let rank = RANKS.rank2, second = null, kin = i.kin !== '0';
        if (i.mode === 'segs-b1') rank = RANKS.b1;
        if (i.mode === 'segs-b2') rank = RANKS.b2;
        if (i.mode === 'segs-b3') rank = RANKS.b3;
        if (i.mode === 'segs-nosec') { rank = RANKS.rank2; second = RANKS.dsec; }
        const sp = i.mode === 'segs-always' ? segAlways(text) : segs(text, cap, rank, kin, second);
        if (rowsOf(i).join('|') !== segRows(text, sp).join('|')) {
          segBad.push(`${b.block}/${i.cand}: 实测 ${rowsOf(i).join('|')} ≠ 模型 ${segRows(text, sp).join('|')}`);
        }
        if (i.segTexts.join('|') !== segRows(text, sp).join('|')) {
          segBad.push(`${b.block}/${i.cand}: 页面里的段 ${i.segTexts.join('|')} ≠ 模型段 ${segRows(text, sp).join('|')}`);
        }
        sp.forEach((s, k) => {
          const seg = text.slice(s.from, s.to);
          if (k + 1 < sp.length) {
            if (s.why === 'punct') {
              if (SEMI.indexOf(seg.slice(-1)) < 0) punctBad.push(`${b.block}/${i.cand} 段${k}末字「${seg.slice(-1)}」不是句读类（why=punct）`);
              if (CLOSE.indexOf(text.charAt(s.to)) >= 0) punctBad.push(`${b.block}/${i.cand} 段${k + 1}首字是收尾标点「${text.charAt(s.to)}」`);
            } else if (s.why === 'floor' && i.mode !== 'segs-always') {
              if (seg.length !== cap && seg.length !== cap - 1) punctBad.push(`${b.block}/${i.cand} 段${k}长 ${seg.length} 既不是 cap=${cap} 也不是 cap−1`);
            }
          }
        });
      }));
      check('[6] **②模型 == ②实测**：每个 segs 盒子的每一行与页面里的每个段都逐字等于本脚本 segs 复算的段',
        segBad.length === 0, segBad.length ? segBad.join(' ; ') : '逐字一致（行与段两边都对过）');
      check('[6] **标点归前句**：凡由句读候选断开的段，段末字必是句读类标点、下一段首字必不是收尾标点；由字位下界断开的段，段长必为 cap 或 cap−1',
        punctBad.length === 0, punctBad.length ? punctBad.join(' ; ') : '全部满足');

      /* [7] S1 真实原文：用户给的例子 */
      const s1rows = itemsOf(byId('S1')).filter((i) => i.cand === '① 默认');
      const s1rows2 = itemsOf(byId('S1')).filter((i) => i.cand === '② 句读');
      const expectS1a1 = [['行行重行行，与君', '生别离。'], ['相去万余里，各在', '天一涯。']];
      const expectS1a2 = [['行行重行行，', '与君生别离。'], ['相去万余里，', '各在天一涯。']];
      check('[7] S1（真实原文 · 压窄到 8 字位＝142.13px）：①默认＝8／4 字「行行重行行，与君生／别离。」',
        s1rows.length === 2 && s1rows.every((i, k) => rowsOf(i).join('|') === expectS1a1[k].join('|') &&
          i.lines.map((x) => x.n).join('/') === '8/4'),
        s1rows.map((i) => rowsOf(i).join('｜') + '(' + i.lines.map((x) => x.n).join('/') + ')').join(' ／ '));
      check('[7] S1：②按句读＝6／6 字「行行重行行，／与君生别离。」**就是用户给的那个例子**',
        s1rows2.length === 2 && s1rows2.every((i, k) => rowsOf(i).join('|') === expectS1a2[k].join('|') &&
          i.lines.map((x) => x.n).join('/') === '6/6'),
        s1rows2.map((i) => rowsOf(i).join('｜') + '(' + i.lines.map((x) => x.n).join('/') + ')').join(' ／ '));
      check('[7] S1 四格都是真实原文（data-real=1）—— 两行各自逐字等于源文件对应行',
        itemsOf(byId('S1')).length === 4 && itemsOf(byId('S1')).every((i) => i.real && !i.fx) &&
        new Set(itemsOf(byId('S1')).map((i) => i.text)).size === 2 &&
        [...new Set(itemsOf(byId('S1')).map((i) => i.text))].sort().join('\u0001') === [mdFlat[0], mdFlat[1]].sort().join('\u0001'),
        `${itemsOf(byId('S1')).length} 格，两段不同文字＝源文件第 1、2 行`);

      /* [8] A：边界 a */
      const a1 = findItem('A', 'a-①'), a2 = findItem('A', 'a-②');
      check('[8] A（边界 a）：a-① 只在真超宽时才拆 ⇒ 真实原文**1 行**（本视口可用宽放得下）',
        a1 && a1.lines.length === 1 && rowsOf(a1).join('') === FX.a,
        `a-① ${a1 ? a1.lines.length : '缺'} 行；可用宽 ${AVAIL}px ≥ 原文 ${r2(FX.a.length * P.charAdvance)}px`);
      check('[8] A：a-② 一律按句读拆 ⇒ **2 行**「行行重行行，／与君生别离。」',
        a2 && a2.lines.length === 2 && rowsOf(a2).join('|') === expectS1a2[0].join('|'),
        a2 ? rowsOf(a2).join('｜') : '缺');
      check('[8] A：两列的容器宽都 = **本视口真实可用宽**（不是压窄的容器）',
        itemsOf(byId('A')).every((i) => near(i.w, AVAIL, 0.02)),
        itemsOf(byId('A')).map((i) => i.w).join(' / '));

      /* [9] B：边界 b —— 一夹具一行、三列；DOM 顺序就是 b1(3) 然后 b2(3) */
      const bItems = itemsOf(byId('B'));
      const bCands = ['b-①', 'b-②', 'b-③'];
      const bGot = {};
      const bBad = [];
      [['b1', FX.b1], ['b2', FX.b2]].forEach(([rowKey, text], ri) => {
        bCands.forEach((cand, ci) => {
          const it = bItems[ri * 3 + ci];
          if (!it || it.cand !== cand) { bBad.push(`${rowKey}/${cand} 位置不对（实际 ${it && it.cand}）`); return; }
          const cap = it.cap;
          const rk = ci === 0 ? RANKS.b1 : (ci === 1 ? RANKS.b2 : RANKS.b3);
          const sp = segs(text, cap, rk, true, null);
          bGot[rowKey + '/' + cand] = rowsOf(it).join('|');
          if (rowsOf(it).join('|') !== segRows(text, sp).join('|')) {
            bBad.push(`${rowKey}/${cand}: 实测 ${rowsOf(it).join('|')} ≠ 模型 ${segRows(text, sp).join('|')}（cap=${cap}）`);
          }
        });
      });
      check('[9] B（边界 b）：三组优先级各有两行（两组夹具 × 三列），逐行与模型一致',
        bBad.length === 0 && bItems.length === 6, bBad.length ? bBad.join(' ; ') : '六格逐字一致');
      const b1key = bCands.map((c) => bGot['b1/' + c]);
      const b2key = bCands.map((c) => bGot['b2/' + c]);
      check('[9] B：三组顺序**真的会给出不同断点** ⇒ 夹具 b1 上 b-①＝b-③ ≠ b-②，夹具 b2 上 b-①＝b-② ≠ b-③',
        b1key[0] === b1key[2] && b1key[0] !== b1key[1] && b2key[0] === b2key[1] && b2key[0] !== b2key[2],
        `b1: ${b1key.join(' || ')} ／ b2: ${b2key.join(' || ')}`);

      /* [10] C：边界 c */
      const c1 = findItem('C', 'c-①'), c2 = findItem('C', 'c-②'), c3 = findItem('C', 'c-③'), c4 = findItem('C', 'c-④');
      check('[10] C（边界 c · 无标点长句 14 字 · 容器 6 字位）：c-① 与 c-② **逐字相同**（没有标点 ⇒ 禁则无作用对象）',
        c1 && c2 && rowsOf(c1).join('|') === rowsOf(c2).join('|') && c1.lines.length === 3,
        `c-① ${c1 && rowsOf(c1).join('｜')}（${c1 && c1.lines.map((x) => x.n).join('/')}）｜c-② ${c2 && rowsOf(c2).join('｜')}`);
      check('[10] C：c-③ 允许溢出 ⇒ 1 行且**越出容器 > 0**（照实量出来）',
        c3 && c3.lines.length === 1 && c3.overMax > 0.05,
        c3 ? `${c3.lines.length} 行，越出 ${c3.overMax}px` : '缺');
      check('[10] C：c-④ 缩字号 ⇒ 1 行且不越出容器（代价是字号）',
        c4 && c4.lines.length === 1 && c4.overMax <= 0.05,
        c4 ? `${c4.lines.length} 行，越出 ${c4.overMax}px，字号自报 ${c4.shrink}px` : '缺');

      /* [11] D：边界 d */
      const d1 = findItem('D', 'd-①'), d2 = findItem('D', 'd-②'), d3 = findItem('D', 'd-③'), d4 = findItem('D', 'd-④');
      const dcap = findItem('D', 'd-①') ? findItem('D', 'd-①').cap : 0;
      check('[11] D（边界 d · 半句本身仍超宽）：d-① 在更小边界断 ⇒ 逐段/逐行等于模型，且**会出现一个 1 字的尾行**（如实记下这个代价）',
        d1 && d1.segTexts.join('|') === segRows(FX.d, segs(FX.d, dcap, RANKS.rank2, true, RANKS.dsec)).join('|') &&
        d1.lines.length === 3 && d1.lines[2].n === 1,
        d1 ? `d-① ${rowsOf(d1).join('｜')}（${d1.lines.map((x) => x.n).join('/')}）` : '缺');
      check('[11] D：d-② 在字位处断＋禁则 ⇒ 逐字等于模型 greedy，且**与 d-① 的断点不同**（这才是「下一级怎么降」的真实差别）',
        d1 && d2 && rowsOf(d2).join('|') === greedy(FX.d, dcap, true).join('|') &&
        rowsOf(d1).join('|') !== rowsOf(d2).join('|') && d2.lines.length === 2,
        d1 && d2 ? `d-① ${d1.lines.map((x) => x.n).join('/')} vs d-② ${d2.lines.map((x) => x.n).join('/')}（${rowsOf(d2).join('｜')}）` : '缺');
      check('[11] D：d-③ 允许溢出 ⇒ 1 行且越出容器 > 0；d-④ 缩字号 ⇒ 1 行且不越出',
        d3 && d4 && d3.lines.length === 1 && d3.overMax > 0.05 && d4.lines.length === 1 && d4.overMax <= 0.05,
        d3 && d4 ? `d-③ 越出 ${d3.overMax}px；d-④ 越出 ${d4.overMax}px，字号 ${d4.shrink}px` : '缺');

      /* [12] E：边界 e */
      const eBad = [];
      const viol = (i) => i.lines.map((x, k) => {
        const out = [];
        if (CLOSE.indexOf(x.t.charAt(0)) >= 0 && k > 0) out.push('行首是收尾标点「' + x.t.charAt(0) + '」');
        if (k + 1 < i.lines.length && OPEN.indexOf(x.t.slice(-1)) >= 0) out.push('行末是开局标点「' + x.t.slice(-1) + '」');
        return out;
      }).reduce((a, b) => a.concat(b), []);
      const eCloseNoKin = findItem('E', 'e-①'), eCloseKin = findItem('E', 'e-②');
      const eOpenNoKin = itemsOf(byId('E')).filter((i) => i.cand === 'e-①')[1];
      const eOpenKin = itemsOf(byId('E')).filter((i) => i.cand === 'e-②')[1];
      const eOpenAny = itemsOf(byId('E')).filter((i) => i.cand === 'e-③')[1];
      const eOpenDef = itemsOf(byId('E')).filter((i) => i.cand === 'e-④')[1];
      if (!eCloseNoKin || !eCloseKin || !eOpenNoKin || !eOpenKin || !eOpenAny || !eOpenDef) eBad.push('E 块的六格没找齐');
      check('[12] E（边界 e）：e-①（句读断、不施禁则）**确实**把收尾标点放到行首 —— 违反「收尾类标点不起行」的实测证据',
        eCloseNoKin && viol(eCloseNoKin).length > 0 && eCloseNoKin.lines[1] && eCloseNoKin.lines[1].t.charAt(0) === '，',
        eCloseNoKin ? rowsOf(eCloseNoKin).join('｜') + ' ⇒ ' + JSON.stringify(viol(eCloseNoKin)) : '缺');
      check('[12] E：e-③（字位断、不施禁则＝anywhere）在同一夹具上**同样**违反',
        findItem('E', 'e-③') && viol(findItem('E', 'e-③')).length > 0 &&
        rowsOf(findItem('E', 'e-③')).join('|') === rowsOf(eCloseNoKin).join('|'),
        findItem('E', 'e-③') ? rowsOf(findItem('E', 'e-③')).join('｜') : '缺');
      check('[12] E：e-②（句读断＋禁则）与 e-④（字位断＋禁则＝默认）在收尾夹具上都不违反禁则（「，」留在上一行行末）',
        eCloseKin && eOpenDef && viol(eCloseKin).length === 0 && viol(findItem('E', 'e-④')).length === 0 &&
        rowsOf(eCloseKin).join('|') === rowsOf(findItem('E', 'e-④')).join('|'),
        eCloseKin ? rowsOf(eCloseKin).join('｜') : '缺');
      check('[12] E：开局标点夹具上，e-①／e-③ **确实**把「（」留在行尾；e-②／e-④ 不违反',
        eOpenNoKin && eOpenAny && eOpenKin && eOpenDef &&
        viol(eOpenNoKin).some((s) => /开局标点/.test(s)) && viol(eOpenAny).some((s) => /开局标点/.test(s)) &&
        viol(eOpenKin).length === 0 && viol(eOpenDef).length === 0 &&
        rowsOf(eOpenKin).join('|') === rowsOf(eOpenDef).join('|'),
        eOpenNoKin ? `e-① ${rowsOf(eOpenNoKin).join('｜')} ⇒ ${JSON.stringify(viol(eOpenNoKin))}；e-② ${rowsOf(eOpenKin).join('｜')}` : '缺');

      /* [13] F：实现代价 */
      const f1 = findItem('F', 'f-①'), f2 = findItem('F', 'f-②'), f4 = findItem('F', 'f-④');
      const fcap = findItem('F', 'f-①') ? findItem('F', 'f-①').cap : 0;
      check('[13] F：f-① 分段块（＝② 的渲染）逐字等于模型 segs，且其段末字是句读标点（标点归前句）',
        f1 && f1.segTexts.join('|') === segRows(FX.f, segs(FX.f, fcap, RANKS.rank2, true, null)).join('|') &&
        SEMI.indexOf(f1.segTexts[0].slice(-1)) >= 0,
        f1 ? `段＝${f1.segTexts.join('｜')}` : '缺');
      check('[13] F：f-④（纯 CSS：只有字位＋禁则）**拿不到** f-① 的断点 ⇒ 「按标点优先断」纯 CSS 做不到',
        f4 && f1 && rowsOf(f4).join('|') !== rowsOf(f1).join('|') &&
        rowsOf(f4).join('|') === greedy(FX.f, fcap, true).join('|'),
        f4 && f1 ? `f-④ ${rowsOf(f4).join('｜')}（${f4.lines.map((x) => x.n).join('/')}）≠ f-① ${rowsOf(f1).join('｜')}（${f1.lines.map((x) => x.n).join('/')}）` : '缺');
      check('[13] F：f-②（＝不做任何处理）逐字等于模型 greedy，F 三格都是同一段夹具同一容器',
        f2 && rowsOf(f2).join('|') === greedy(FX.f, fcap, true).join('|') &&
        itemsOf(byId('F')).every((i) => i.w === itemsOf(byId('F'))[0].w && i.text === FX.f),
        f2 ? rowsOf(f2).join('｜') : '缺');

      /* [14] 字号不缩放 */
      fontBag.push({ k: C.key, poem: M.fonts.poem, title: M.fonts.title, ident: M.fonts.ident });
      check(`[14] 正文 ${M.fonts.poem.fontSize}/${M.fonts.poem.lineHeight}/${M.fonts.poem.letterSpacing}、` +
        `题名 ${M.fonts.title.fontSize}、身份行 ${M.fonts.ident.fontSize} 与本视口无关`,
        M.fonts.poem.fontSize === '17px' && M.fonts.poem.lineHeight === '34px' && M.fonts.poem.letterSpacing === '0.765px' &&
        M.fonts.title.fontSize === '24px' && M.fonts.ident.fontSize === '12.48px',
        `${M.fonts.poem.fontSize} / ${M.fonts.poem.lineHeight} / ${M.fonts.poem.letterSpacing}`);

      /* [15] 页面自报 = 独立实测 */
      const selfBad = [];
      if (Number(dm(s0, 'wrapped')) !== 0) selfBad.push('S0 自报折行数 ≠ 0');
      if (!near(Number(dm(s0, 'avail')), AVAIL, 0.02)) selfBad.push(`S0 avail 自报 ${dm(s0, 'avail')} ≠ ${AVAIL}`);
      if (!near(Number(dm(s0, 'maxline')), s0Lines[0].lines[0].w, 0.02)) selfBad.push('S0 maxLine 自报 ≠ 实测');
      if (!near(Number(dm(byId('S1'), 'narroww')), slotPx.S1, 0.02)) selfBad.push('S1 narrowW 不符');
      if (!near(Number(dm(byId('B'), 'narroww')), slotPx.B, 0.02)) selfBad.push('B narrowW 不符');
      const datakeys = ['S0', 'S1', 'A', 'B', 'C', 'D', 'E', 'F'].every((k) => Object.keys((byId(k) || {}).capData || {}).length > 0);
      check('[15] 页面自报的数字 = 本脚本独立实测（±0.02px），且每块都带 data-m-* 标记',
        selfBad.length === 0 && datakeys, selfBad.length ? selfBad.join(' | ') : '抽查 5 项一致，8 块 data-m-* 齐全');

      rowsOut.push({
        key: C.key, w: W, h: H, cw: r2(cw), avail: AVAIL, docW: M.docW, deckH: M.deck.h,
        s0wrapped: Number(dm(s0, 'wrapped')),
        s1_1: rowsOf(s1rows[0]).join('｜'), s1_2: rowsOf(s1rows2[0]).join('｜'),
        a1: a1 ? a1.lines.length : '-', a2: a2 ? a2.lines.length : '-',
        c1: c1 && c1.lines.map((x) => x.n).join('/'), c3over: c3 && c3.overMax,
        d1: d1 && d1.lines.map((x) => x.n).join('/'), d3over: d3 && d3.overMax,
        f1: f1 && f1.lines.map((x) => x.n).join('/'), f4: f4 && f4.lines.map((x) => x.n).join('/'),
      });

      /* [16] PNG */
      if (!SHOT) { log('\n[16] 已跳过（--no-shot）：不查看图态、不重出 PNG'); continue; }
      await send('Page.navigate', { url: 'about:blank' });
      await sleep(150);
      await load(url + '#shot', W, H, C.mobile);
      const S = await measure();
      check('[16] 看图态：#shot 只隐去说明性文字；排布数字与普通态逐一相同',
        S.shot === true && near(byId('C') && S.blocks.filter((b) => b.block === 'C')[0].colW, cw, 0.02),
        `shot=${S.shot}；C 列宽 ${S.blocks.filter((b) => b.block === 'C')[0].colW}`);
      check(`[16] 看图态仍无横向溢出（docW = ${W}）`, S.docW === W && S.maxRight <= W + 0.5,
        `docW=${S.docW} maxRight=${S.maxRight}`);
      check(`[16] 截图区高度 ${r2(S.deck.h)} CSS px ⇒ ${r2(S.deck.h * 2)} 设备 px，必须 < ${PNG_HARD_LIMIT}（不出一张被截断的图）`,
        S.deck.h * 2 < PNG_HARD_LIMIT, `${r2(S.deck.h)} CSS px（上限 ${MAX_SHOT_CSS}）`);
      const pngPath = join(OUT, `q-break-semantic.${C.key}.png`);
      const shot = await send('Page.captureScreenshot', {
        format: 'png', captureBeyondViewport: true,
        clip: { x: 0, y: S.deck.y, width: W, height: S.deck.h, scale: 1 },
      });
      writeFileSync(pngPath, Buffer.from(shot.data, 'base64'));
      const buf = readFileSync(pngPath);
      const size = pngSize(buf);
      log(`\n[16] PNG：${pngPath}`);
      log(`      截图区 CSS ${W}×${r2(S.deck.h)} @DPR 2 → 像素 ${W * 2}×${r2(S.deck.h * 2)} → 文件实测 ${size.w}×${size.h}，${statSync(pngPath).size} 字节`);
      check(`[16] PNG 像素宽 = 视口宽 × 2 = ${W * 2}（真实 CSS px @DPR 2，不是缩放图、不是拼图）`,
        size.w === W * 2, `实测 ${size.w}`);
      check('[16] PNG 像素高 = 截图区 CSS 高 × 2', Math.abs(size.h - S.deck.h * 2) <= 2,
        `实测 ${size.h}，期望 ${r2(S.deck.h * 2)}`);
      check('[16] PNG 非空且没有被截断（高 < 16384）', statSync(pngPath).size > 1000 && size.h < PNG_HARD_LIMIT,
        `${statSync(pngPath).size} 字节，${size.w}×${size.h}`);
    }

    /* ═══ [14] 跨视口：字号不缩放 ═════════════════════════════════ */
    log('\n═══════════ [14] 跨视口：字号／行高／字距**不随宽度变** ═══════════');
    if (fontBag.length > 1) {
      const kinds = ['poem', 'title', 'ident'];
      const bad = kinds.filter((k) => new Set(fontBag.map((f) => `${f[k].fontSize}/${f[k].lineHeight}/${f[k].letterSpacing}`)).size !== 1);
      kinds.forEach((k) => {
        const vals = [...new Set(fontBag.map((f) => `${f[k].fontSize}/${f[k].lineHeight}/${f[k].letterSpacing}`))];
        log(`      ${k}: ${vals.length} 个取值 → ${vals.join('  //  ')}`);
      });
      check(`[14] ${kinds.length} 类文字在 ${fontBag.length} 个视口下只有一个取值（完全没随宽度缩放）`,
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
    log('\n═══════════ 汇总（可直接抄进 q-break-semantic.md）═══════════');
    rowsOut.forEach((r) => {
      log(`  ${r.key}: C=${r.cw} 可用宽=${r.avail} 真实8行折行=${r.s0wrapped} | S1①=${r.s1_1} S1②=${r.s1_2} | A a-①=${r.a1}行 a-②=${r.a2}行 ` +
        `| C c-①=${r.c1} c-③越出=${r.c3over}px | D d-①=${r.d1} d-③越出=${r.d3over}px | F f-①=${r.f1} f-④=${r.f4} | docW=${r.docW} 截图区=${r2(r.deckH)}`);
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
