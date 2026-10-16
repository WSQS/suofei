/*
 * check-detail.mjs —— 「诗歌详情页完整表达」原型的【页面行为 ＋ 逐项几何 ＋ 文本逐字 ＋ 自包含 ＋ PNG】自证脚本（可复跑）。
 *
 * ⚠ 它验的是**这一个原型页面**（q-detail.html）的页面行为，**不是产品代码**，也不是任何规格的采纳。
 *   对象只有本目录下的 q-detail.html（**只读打开**：Page.navigate 到 file:// URL，脚本不写、不改它）。
 *   额外读的文件只有两个，都是**只读**：
 *     ① prototype/css/theme-tech.css                                   —— 用来逐项比对页面内嵌的令牌快照；
 *     ② items/content-format/prototypes/rules-v3/samples/real-01-full.md —— 详情正文／底本与来源／诗题的**基准**。
 *
 * 覆盖的视口（**每个视口都单独跑一遍全部断言，并各出一组图；图太高就按块边界拆图**）：320 ／ 430 ／ 1180。
 *   ⚠ 一个视口一组图（真实 CSS px @DPR 2）；**不做**缩放拼图。
 *
 * 断言清单（失败任一即 exit 1；当前失败数 0）：
 *  [G] 令牌快照逐项比对（不一致数必须 0）／没有「声明了却没用」的令牌／每个 var() 都有声明／
 *      记录快照来源短 sha ＋「权威仍是 docs/design/visual-tokens.md」／写明三个覆盖视口与宽度口径 C（含「不夹 660／860」）／
 *      已定项逐条在页面上／「材料不是实施｜选某档 ≠ 采纳整页规格｜不决定 JSON／MD 分界｜整页规格尚未采纳」都在／
 *      **Markdown 语法与两端支持如实标注**（样例真实出现 ### ／ - ／ ** ／段落、没有 > ；Web 子集不含 ###（要扩）；
 *      Android 无任何 Markdown 渲染（要从零做））／自包含（非 file:// 请求 0 个、无 <link / src= / @import / http(s)://）／
 *      无 JS 报错／参数块可解析。
 *  [T] **文本与只读源逐字一致**：页面内嵌的 raw-title／source-txt／detail-md 与只读源文件的 front matter title／source／
 *      `## 详情` 节**逐字相同**（仅归一化行尾 CRLF 与首尾空白）；且**渲染出来的可见文字**＝种子去掉 Markdown 标记后的逐行文字
 *      （小标题去掉「### 」、列表项去掉「- 」、去掉「**」）—— 不丢字、不加字。
 *  [P] 每个块的 .pg 宽 = 视口宽、.col 宽 = C = min(V, max(320, 0.88×(V−24)))；正文可用宽 = C − 33.6（复算±0.02）。
 *  [1] 结构：图内 4 块（D0／L1／L2／L3）；D0 每块都在截图范围内。
 *  [2] 每个视口：innerWidth 与 visualViewport.width 精确等于目标；docW == bodyW == 目标宽、所有可见元素都在 0…目标宽 内（**无横向溢出**）。
 *  [3] **逐项几何**（逐字 Range 量墨迹盒）：D0 的 返回／诗题／来源标签／来源文本／小标题／列表项／段落 的**左沿都＝行内沿 16.8px**；
 *      每一行右沿 ≤ 列宽 − 行内沿（**不溢出**）；L1 的 ① 左沿＝16.8 且 ② 居中；L2 三档来源文本左沿＝16.8；
 *      L3 三档小标题左沿（① 因发丝竖线＋0.6rem 内边距右移，②③＝16.8）。
 *  [4] **几何与已定值**：详情正文 17px／行高 34px／字距 0.765px；诗题 24px／字距 2.4px；来源与小标题 13.5px；返回 13.12px；
 *      间距（来源块上 25.6／详情正文上 25.6／小标题上 25.6 下 8／列表项 9.6／段落 14.4）**逐项实测**。
 *  [5] **可点元素语义**：图内唯一的应用层链接＝「返回」，它是 <a>、有 href、文本非空、href = `#/p/<id>`（**落到这首诗**，不是目录）；
 *      没有空文本链接、没有 javascript:／外部 href。
 *  [6] 字号／行高／字距**不随宽度变**（三个视口各只有一个取值）。
 *  [7] PNG：每个视口一组；像素宽 = 视口宽 × 2；**先量截图区高度**，超过内核上限就按**块边界**拆成多张；
 *      每张的像素高都必须 < 16384；各张高度之和 == 截图区高度（**正好铺满、不重不漏**）；文件非空。
 *  [8] **边界自证**：CHROME_BIN 指到不存在的路径 ⇒ 必须**如实报错并 exit 2**，**不能**打印「失败断言数：0」。
 *
 * 怎么跑：
 *   node items/app-ui/prototypes/check-detail.mjs
 *   node items/app-ui/prototypes/check-detail.mjs --no-shot          # 只跑断言，不重出 PNG
 *   node items/app-ui/prototypes/check-detail.mjs --only=430         # 只跑一个视口
 *   node items/app-ui/prototypes/check-detail.mjs --selftest-chrome  # 只跑「CHROME_BIN 指错 ⇒ 如实报错」边界
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
 *         q-detail.html 本身**只读打开**，不写、不改。
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

/* ── [8] 边界自证：CHROME_BIN 指到不存在的路径 ⇒ 如实报错退出，不假装通过 ── */
if (process.argv.includes('--selftest-chrome')) {
  const bogus = 'C:/definitely/not/here/chrome.exe';
  const self = fileURLToPath(import.meta.url);
  const r = spawnSync(process.execPath, [self, '--no-shot'], {
    cwd: OUT, encoding: 'utf8', timeout: 240000,
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
  { key: '320', w: 320, h: 568, mobile: true, label: '手机 · 最窄（C 触下限 320）' },
  { key: '430', w: 430, h: 932, mobile: true, label: '手机（任务书要求的验收宽）' },
  { key: '1180', w: 1180, h: 900, mobile: false, label: '桌面（宽而矮，行长最长）' },
];
const MD_PATH = join(ROOT, 'items', 'content-format', 'prototypes', 'rules-v3', 'samples', 'real-01-full.md');
const HTML_PATH = join(OUT, 'q-detail.html');
const PNG_HARD_LIMIT = 16384;                 /* 设备像素上限：宁可拆图也不出一张被截断的图 */
const MAX_SHOT_CSS = 8000;                    /* 单张图的截图区 CSS 高上限（×DPR 2 = 16000 < 16384） */
const EDGE = 16.8;

const CHROME = process.env.CHROME_BIN
  || join(process.env.LOCALAPPDATA || '', 'Chromium', 'Application', 'chrome.exe');
if (!CHROME || !existsSync(CHROME)) {
  console.error('找不到无头 Chromium：' + (CHROME || '(未设置)'));
  console.error('请用环境变量指定，例如：');
  console.error("  CHROME_BIN='C:/Users/wsqsy/AppData/Local/Chromium/Application/chrome.exe' \\");
  console.error('    node items/app-ui/prototypes/check-detail.mjs');
  console.error('（这就是 [8] 那条边界：CHROME_BIN 指到不存在的路径时，本脚本在这里如实退出，不假装通过。）');
  process.exit(2);
}

/* ── 只读源文件基准：front matter 的 title／source ＋ `## 详情` 节 ─────────── */
const mdText = readFileSync(MD_PATH, 'utf8').replace(/\r\n?/g, '\n');
const mdLines = mdText.split('\n');
let sepCount = 0, fmEnd = -1;
for (let i = 0; i < mdLines.length; i += 1) {
  if (mdLines[i].trim() === '---') { sepCount += 1; if (sepCount === 2) { fmEnd = i; break; } }
}
if (fmEnd < 0) { console.error('源文件里找不到 front matter 结束标记：' + MD_PATH); process.exit(2); }
const fmLines = mdLines.slice(1, fmEnd);
const fmGet = (k) => {
  const ln = fmLines.find((l) => l.startsWith(k + ':'));
  if (!ln) { console.error('源文件 front matter 缺 ' + k + '：' + MD_PATH); process.exit(2); }
  let v = ln.slice(k.length + 1).trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  return v;
};
const MD_TITLE = fmGet('title');
const MD_SOURCE = fmGet('source');
const h2At = mdLines.findIndex((l) => l.trim() === '## 详情');
if (h2At < 0) { console.error('源文件没有 ## 详情 节：' + MD_PATH); process.exit(2); }
const MD_DETAIL = mdLines.slice(h2At + 1).join('\n').replace(/^\n+/, '').replace(/\s+$/, '');
if (!/^### /.test(MD_DETAIL)) { console.error('## 详情 节形状不像预期，先看需求：' + MD_PATH); process.exit(2); }

/* 期望的详情块序列（自检侧**独立**算一份；页面渲染必须与它逐字一致）*/
const expectBlocks = (() => {
  const out = [];
  for (const raw of MD_DETAIL.split('\n')) {
    const s = raw.replace(/\s+$/, '');
    if (s.trim() === '') continue;
    if (s.startsWith('### ')) out.push({ role: 'sub', from: '### ', text: s.slice(4) });
    else if (s.startsWith('- ')) out.push({ role: 'li', from: '- ', text: s.slice(2) });
    else out.push({ role: 'p', from: '', text: s });
  }
  return out;
})();
const stripMd = (s) => s.replace(/\*\*/g, '');

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
const paramBlock = declarationBlock(htmlText, '== DETAIL-PARAMS-BEGIN ==', '== DETAIL-PARAMS-END ==');
if (!paramBlock) { console.error('页面里找不到 == DETAIL-PARAMS-BEGIN ==/== DETAIL-PARAMS-END == 参数表'); process.exit(2); }
function pnum(key) {
  const m = new RegExp('\\*\\s*' + key + '\\s*:\\s*(-?[0-9.]+)').exec(paramBlock);
  return m ? Number(m[1]) : NaN;
}
function pstr(key) {
  const m = new RegExp('\\*\\s*' + key + '\\s*:\\s*([^\\n*]+)').exec(paramBlock);
  return m ? m[1].trim() : null;
}
const P = {
  deduct: pnum('deduct_total'), pct: pnum('pct'), floor: pnum('floor'), clamp: pnum('clamp_measure'),
  edge: pnum('edge_x'),
  poemSize: pnum('poem_size'), poemLh: pnum('poem_lh_px'), poemLs: pnum('poem_ls_px'),
  titleSize: pnum('title_size'), titleLs: pnum('title_ls_px'),
  noteSize: pnum('note_size'), ctlSize: pnum('ctl_size'), subLs: pnum('sub_ls_px'),
  dHeadTop: pnum('d_head_top'), srcGapTop: pnum('src_gap_top'), srcGapIn: pnum('src_gap_in'),
  secGapTop: pnum('sec_gap_top'), subGapTop: pnum('sub_gap_top'), subGapBottom: pnum('sub_gap_bottom'),
  liGap: pnum('li_gap'), paraGap: pnum('para_gap'),
};
const PID = pstr('poem_id'), POEM_ROUTE = pstr('poem_route'), DETAIL_ROUTE = pstr('detail_route');
const VIEWPORTS = (pstr('viewports') || '').split(/\s+/).map(Number);

/* ── 自检侧独立抽出的三个内嵌 text/plain 种子（从**页面文件**里读，不是从生成器）── */
function rawBlock(name) {
  const a = htmlText.indexOf('data-test="' + name + '">');
  if (a < 0) return null;
  const b = htmlText.indexOf('</scr' + 'ipt>', a);
  if (b < 0) return null;
  return htmlText.slice(a + ('data-test="' + name + '">').length, b);
}
const SEED_TITLE = (rawBlock('raw-title') || '').trim();
const SEED_SOURCE = (rawBlock('source-txt') || '').trim();
const SEED_DETAIL = (rawBlock('detail-md') || '').trim();

/* ══ 页面侧量测（脚本自己实现，不依赖页面自报）════════════════════ */
const MEASURE = String.raw`(function(){
  var px = function(n){ return Math.round(n*100)/100; };
  function lineBoxes(e){
    var tns = [], w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT, null), n;
    while ((n = w.nextNode())) tns.push(n);
    if (!tns.length) return [];
    var rg = document.createRange(), out = [], cur = null, idx = 0;
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
      return { t: x.text, n: x.to-x.from, l: px(x.l), r: px(x.r), w: px(x.r-x.l) };
    });
  }
  var blocks = [];
  var ds = document.querySelectorAll('[data-test="demo"]');
  for (var k=0;k<ds.length;k++){
    var d = ds[k];
    var cols = [];
    var colEls = d.querySelectorAll('[data-test="col"]');
    for (var c=0;c<colEls.length;c++){
      var col = colEls[c];
      var cr = col.getBoundingClientRect();
      var pg = col.parentNode;
      var pr = pg.getBoundingClientRect();
      var rows = [];
      var els = col.querySelectorAll('[data-role]');
      for (var e=0;e<els.length;e++){
        var el2 = els[e];
        var er = el2.getBoundingClientRect();
        var lb = lineBoxes(el2);
        var minL = 1e9, maxR = -1e9;
        lb.forEach(function(x){ minL = Math.min(minL, x.l); maxR = Math.max(maxR, x.r); });
        var cs = getComputedStyle(el2);
        rows.push({ role: el2.getAttribute('data-role') || '', test: el2.getAttribute('data-test') || '',
          variant: el2.getAttribute('data-variant') || '', align: el2.getAttribute('data-align') || '',
          tag: el2.tagName.toLowerCase(), text: el2.textContent,
          boxL: px(er.left), boxR: px(er.right), boxW: px(er.width),
          lines: lb, nLines: lb.length,
          minLeft: lb.length ? px(minL) : null, maxRight: lb.length ? px(maxR) : null,
          fs: cs.fontSize, lh: cs.lineHeight, ls: cs.letterSpacing, color: cs.color });
      }
      cols.push({ colLeft: px(cr.left), colRight: px(cr.right), colW: px(cr.width), pgW: px(pr.width), cand: col.getAttribute('data-cand') || '', rows: rows });
    }
    blocks.push({ block: d.dataset.block, kind: d.getAttribute('data-kind') || '', cols: cols,
      caps: (function(){ var cp = d.querySelector('[data-test="cap"]'); var o = {}; if (cp) { Array.prototype.forEach.call(cp.attributes, function(a){ if (a.name.indexOf('data-m-')===0) o[a.name]=a.value; }); } return o; })(),
      protomarks: d.querySelectorAll('[data-test="protomark"]').length,
      d0: d.getAttribute('data-d0') });
  }
  var all = document.querySelectorAll('body *'), maxRight = -1e9, minLeft = 1e9, mrEl = '', mlEl = '';
  var name = function(e){ return e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).join('.') : ''); };
  for (var z=0;z<all.length;z++){
    var rr = all[z].getBoundingClientRect();
    if (rr.width === 0 && rr.height === 0) continue;
    if (rr.right > maxRight) { maxRight = rr.right; mrEl = name(all[z]); }
    if (rr.left < minLeft) { minLeft = rr.left; mlEl = name(all[z]); }
  }
  var deck = document.querySelector('[data-shotframe]');
  var deckP = deck.getBoundingClientRect();
  var d0n = document.querySelector('[data-block="D0"]');
  function csOf(sel){
    var e = d0n.querySelector(sel);
    if (!e) return null;
    var c = getComputedStyle(e);
    return { fs: c.fontSize, lh: c.lineHeight, ls: c.letterSpacing, color: c.color,
      mt: c.marginTop, mb: c.marginBottom, pt: c.paddingTop, pb: c.paddingBottom };
  }
  var subs = d0n.querySelectorAll('.detail .d-sub');
  var links = [];
  var as = document.querySelectorAll('[data-shotframe] a');
  for (var q1=0;q1<as.length;q1++){
    links.push({ text: as[q1].textContent.trim(), href: as[q1].getAttribute('href'), tag: as[q1].tagName.toLowerCase(),
      test: as[q1].getAttribute('data-test') || '', title: as[q1].getAttribute('title') || '' });
  }
  var badHref = [];
  var hs = document.querySelectorAll('[data-shotframe] [href]');
  for (var q2=0;q2<hs.length;q2++){
    var hv = hs[q2].getAttribute('href') || '';
    if (!hv) { badHref.push('empty href on ' + hs[q2].tagName); continue; }
    if (/^(javascript|http|https|data):/i.test(hv)) badHref.push(hv);
  }
  var l2pAll = [];
  var pvAll = document.querySelectorAll('[data-shotframe] [data-test="prov-text"]');
  for (var q3=0;q3<pvAll.length;q3++) l2pAll.push(pvAll[q3].textContent);
  return JSON.stringify({ innerW: window.innerWidth,
    visualW: window.visualViewport ? px(window.visualViewport.width) : null,
    docW: document.documentElement.scrollWidth, docH: document.documentElement.scrollHeight,
    bodyW: document.body.scrollWidth, maxRight: px(maxRight), maxRightEl: mrEl, minLeft: px(minLeft), minLeftEl: mlEl,
    cwVar: String(getComputedStyle(document.documentElement).getPropertyValue('--cw')).trim(),
    avail: document.documentElement.dataset.avail, vAttr: document.documentElement.dataset.v,
    deck: { x: px(deckP.left), y: px(deckP.top + window.scrollY), w: px(deckP.width), h: px(deckP.height) },
    shot: document.documentElement.dataset.shot === '1',
    styles: { detail: csOf('.detail'), prov: csOf('.prov-text'), provLabel: csOf('.prov-label'),
      li: csOf('.detail .d-li'), p: csOf('.detail .d-p'), title: csOf('.d-title'), back: csOf('.ctl'),
      subFirst: csOf('.detail .d-sub'),
      provBox: csOf('.prov'),
      subSecond: subs.length > 1 ? (function(c){ return { fs: c.fontSize, ls: c.letterSpacing, pt: c.paddingTop, pb: c.paddingBottom }; })(getComputedStyle(subs[1])) : null },
    links: links, badHref: badHref, allProvText: l2pAll,
    seeds: { title: document.querySelector('[data-test="raw-title"]').textContent,
             source: document.querySelector('[data-test="source-txt"]').textContent,
             detail: document.querySelector('[data-test="detail-md"]').textContent },
    /* 渲染出来的可见文字（按文档顺序，逐个 data-role 元素）——自检拿它与种子逐字比 */
    rendered: (function(){
      var out = [], els = d0n.querySelectorAll('[data-role]');
      for (var i=0;i<els.length;i++){
        var r = els[i].getAttribute('data-role');
        if (r === 'sub' || r === 'li' || r === 'p' || r === 'provText' || r === 'provLabel' || r === 'title' || r === 'back')
          out.push({ role: r, text: els[i].textContent });
      }
      return out;
    })(),
    blocks: blocks });
})()`;

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
const cwOf = (V) => Math.min(V, Math.max(P.floor, P.pct / 100 * (V - P.deduct)));

async function run() {
  const port = await freePort();
  const profile = mkdtempSync(join(tmpdir(), 'qdetail-'));
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--disable-background-networking',
    '--disable-component-update', '--disable-sync', '--remote-allow-origins=*',
    '--user-data-dir=' + profile, '--remote-debugging-port=' + port, 'about:blank',
  ], { stdio: 'ignore' });
  log(`原型页（只读打开）：${HTML_PATH}`);
  log(`只读源基准：${MD_PATH}`);
  log(`  front matter title=${JSON.stringify(MD_TITLE)}；source ${MD_SOURCE.length} 字；## 详情 节 ${MD_DETAIL.length} 字／${expectBlocks.length} 块`);
  log(`仓库根（从脚本目录向上查找 prototype/css/theme-tech.css）：${ROOT}`);
  log(`CDP 端口（内核分配的空闲端口）：${port}`);
  log(`参数：C = min(V, max(${P.floor}, ${P.pct}%×(V−${P.deduct})))；行内沿 ${P.edge}；正文 ${P.poemSize}px／${P.poemLh}px／${P.poemLs}px`);

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
    log('\n═══════════ [G] 全局：令牌快照 / 已定项 / 标注 / Markdown 支持如实 / 自包含 / 参数 ═══════════');
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
    check(`[G] 令牌快照与 prototype/css/theme-tech.css 逐项比对：值不一致数 = ${mismatches.length}（要求 0）`,
      mismatches.length === 0,
      mismatches.length ? mismatches.join(' | ') : `${snap.size} 个令牌逐字一致（空白已归一化）`);
    check('[G] 快照里没有「声明了却没用」的令牌；页面里用到的每个 var() 都有声明',
      undeclared.length === 0 && unusedSnap.length === 0,
      `未声明=${JSON.stringify(undeclared)} 快照未用=${JSON.stringify(unusedSnap)}`);
    const shaRecorded = (htmlText.match(/仓库提交：([0-9a-f]{7,40})/) || [])[1] || '(没记录)';
    check('[G] 页面记录了令牌快照的来源提交（短 sha）＋写明「权威仍是 docs/design/visual-tokens.md」',
      /^[0-9a-f]{7,40}$/.test(shaRecorded) && htmlText.includes('权威仍是 docs/design/visual-tokens.md'),
      `记录=${shaRecorded}（当前 HEAD=${gitHead}）`);
    check('[G] 页面写明三个覆盖视口（320／430／1180）与已定宽度口径 C = min(V, max(320, 0.88 × (V − 24)))、24 是一次性扣除、不夹 660／860',
      htmlText.includes('C = min(V, max(320, 0.88 × (V − 24)))') && VIEWPORTS.join(' ') === '320 430 1180' &&
      htmlText.includes('一次性扣除总量') && htmlText.includes('不夹 660／860') && P.clamp === 0,
      `参数块 viewports = ${VIEWPORTS.join(' ')}；clamp_measure = ${P.clamp}`);
    const fixedList = [
      ['诗题 1.5rem', '--title-size: 1.5rem'],
      ['诗题 500', '--title-weight: 500'],
      ['诗题字距 0.1em', '--title-ls: 0.1em'],
      ['小字 13.5px', '--note-size: 13.5px'],
      ['正文 17px', '--poem-size: 17px'],
      ['正文行高 2', '--poem-lh: 2'],
      ['正文字距 0.045em', '--poem-ls: 0.045em'],
      ['组名字距 0.16em', '--gname-ls: 0.16em'],
      ['行内沿 1.05rem', '--edge-x: 1.05rem'],
    ];
    const missingFixed = fixedList.filter(([, s]) => !htmlText.includes(s));
    check('[G] 已定项（诗题／小字／正文／字距／行内沿）逐条在页面上，且写明路由 #/p/<id>/detail 与「返回落到这首诗」',
      missingFixed.length === 0 && htmlText.includes('#/p/&lt;id&gt;/detail') &&
      htmlText.includes('落到<b>这首诗</b>') && P.poemSize === 17 && P.poemLh === 34 && P.poemLs === 0.765 &&
      P.titleSize === 24 && P.titleLs === 2.4 && P.noteSize === 13.5 && P.subLs === 2.16,
      missingFixed.length ? '缺：' + missingFixed.map((x) => x[0]).join('、') : `${fixedList.length} 条已定值全在（参数 ${JSON.stringify(P)}）`);
    const mustSay = ['材料，不是实施', '选某档 ≠ 采纳整页规格', '不决定', 'JSON／MD', '整页规格尚未采纳',
      '不重复身份信息', '原型说明 · 不属于应用页面', '不编内容', '候选完整页'];
    const notSaid = mustSay.filter((s) => !htmlText.includes(s));
    check('[G] 页面写明了「材料不是实施／选某档 ≠ 采纳整页规格／不决定 JSON／MD 分界／整页规格尚未采纳／不重复身份信息／图内标注／不编内容／候选完整页」',
      notSaid.length === 0, notSaid.length ? '缺：' + notSaid.join('、') : mustSay.join('、'));
    const mdSupport = [
      ['样例真实语法 ### ', '### </code> <b>小标题</b>'],
      ['样例真实语法 - 列表', '<code>- </code> <b>列表</b>'],
      ['样例真实语法 **粗体**', '<code>**粗体**</code>'],
      ['样例没有 > 引用', '没有</b> <code>&gt; </code> 引用块'],
      ['Web 子集不含 ### （要扩子集）', '不含</b> <code>### </code> 小标题 ⇒ 要用就得<b>扩子集</b>'],
      ['Android 无任何 Markdown 渲染（要从零做）', 'Android 目前完全没有 Markdown 渲染'],
    ];
    const mdMissing = mdSupport.filter(([, s]) => !htmlText.includes(s));
    check('[G] **Markdown 语法与两端支持如实标注**：样例真实出现 ###／- ／**／段落、没有 > ；Web 子集不含 ###（要扩）；Android 无任何渲染（要从零做）',
      mdMissing.length === 0, mdMissing.length ? '缺：' + mdMissing.map((x) => x[0]).join('、') : mdSupport.map((x) => x[0]).join('、'));
    const textHits = ['<link', 'src=', '@import', 'http://', 'https://'].filter((t) => htmlText.indexOf(t) >= 0);
    check('[G] 页面文本里没有 <link / src= / @import / http(s)://（零外部引用）',
      textHits.length === 0, textHits.length ? '命中：' + textHits.join(' ') : '0 处');
    check('[G] 参数块可解析：deduct=24／88%／320／不夹／edge=16.8／正文 17-34-0.765／诗题 24-2.4／小字 13.5／小标题字距 2.16',
      P.deduct === 24 && P.pct === 88 && P.floor === 320 && P.clamp === 0 && P.edge === 16.8 &&
      P.poemSize === 17 && P.poemLh === 34 && P.poemLs === 0.765 && P.titleSize === 24 && P.titleLs === 2.4 &&
      P.noteSize === 13.5 && P.ctlSize === 13.12 && P.subLs === 2.16,
      JSON.stringify(P));
    check(`[G] 路由与 id 可解析：poem_id=${JSON.stringify(PID)}／poem_route=${JSON.stringify(POEM_ROUTE)}／detail_route=${JSON.stringify(DETAIL_ROUTE)}`,
      PID === 'gushi-shijiu-shou-01' && POEM_ROUTE === '#/p/gushi-shijiu-shou-01' &&
      DETAIL_ROUTE === '#/p/gushi-shijiu-shou-01/detail',
      `${PID} / ${POEM_ROUTE} / ${DETAIL_ROUTE}`);

    /* ═══ [T] 文本与只读源逐字一致（只跑一次）═══════════════════════ */
    log('\n═══════════ [T] 文本与只读源（real-01-full.md）逐字一致 ═══════════');
    check('[T] 内嵌 raw-title == front matter title（逐字）', SEED_TITLE === MD_TITLE,
      `页面=${JSON.stringify(SEED_TITLE)} 源=${JSON.stringify(MD_TITLE)}`);
    check('[T] 内嵌 source-txt == front matter source（逐字）', SEED_SOURCE === MD_SOURCE,
      SEED_SOURCE === MD_SOURCE ? `${MD_SOURCE.length} 字逐字一致` : `页面=${JSON.stringify(SEED_SOURCE)}`);
    check('[T] 内嵌 detail-md == 只读源的 `## 详情` 节（逐字；仅归一化行尾与首尾空白）', SEED_DETAIL === MD_DETAIL,
      SEED_DETAIL === MD_DETAIL ? `${MD_DETAIL.length} 字逐字一致（${expectBlocks.length} 块）` : '不一致（见 console）');
    if (SEED_DETAIL !== MD_DETAIL) {
      log('    页面 detail-md = ' + JSON.stringify(SEED_DETAIL.slice(0, 200)));
      log('    源   ## 详情   = ' + JSON.stringify(MD_DETAIL.slice(0, 200)));
    }
    const expectSeq = expectBlocks.map((b) => b.role + ':' + stripMd(b.text)).join('\u0001');
    log(`  期望的详情块序列（自检侧独立算）：${expectBlocks.map((b) => b.role + '（' + b.text.slice(0, 10) + '…）').join(' → ')}`);

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
      const AVAIL = r2(cw - 2 * EDGE);
      const d0 = byId('D0');
      const d0col = d0.cols[0];
      const rowOf = (col, role) => col.rows.filter((r) => r.role === role)[0] || null;

      /* [2] 视口与收敛 */
      check(`[2] innerWidth = ${W}、visualViewport.width = ${W}（真实 CSS px，没有 shrink-to-fit）`,
        M.innerW === W && near(Number(M.visualW), W, 0.5), `innerW=${M.innerW} visualW=${M.visualW}`);
      check(`[2] 无横向溢出：docW = bodyW = ${W}，所有可见元素都在 0…${W} 内`,
        M.docW === W && M.bodyW === W && M.maxRight <= W + 0.5 && M.minLeft >= -0.5,
        `docW=${M.docW} bodyW=${M.bodyW} minLeft=${M.minLeft}(${M.minLeftEl}) maxRight=${M.maxRight}(${M.maxRightEl})`);
      const badPg = M.blocks.filter((b) => b.cols.some((c) => !near(c.pgW, W, 0.02)));
      check(`[P] 每个块的「屏幕」宽都 = 视口宽 ${W}`, badPg.length === 0,
        badPg.length ? badPg.map((b) => `${b.block}:${b.cols.map((c) => c.pgW)}`).join(' ') : `${M.blocks.length} 块全部一致`);
      const badCol = M.blocks.filter((b) => b.cols.some((c) => !near(c.colW, cw, 0.02)));
      check(`[P] 每个内容列宽都 = C = min(V, max(320, 0.88×(V−24))) = ${r2(cw)}px（复算±0.02）`,
        badCol.length === 0, badCol.length ? badCol.map((b) => `${b.block}:${b.cols.map((c) => c.colW)}`).join(' ') : `${M.blocks.reduce((a, b) => a + b.cols.length, 0)} 列全部一致`);
      check(`[P] 本视口正文可用宽 = C − 2×16.8 = ${AVAIL}px（页面自报 ${M.avail}）`,
        near(Number(M.avail), AVAIL, 0.02), `${M.avail} vs 复算 ${AVAIL}`);

      /* [1] 结构 */
      const ids = M.blocks.map((b) => b.block);
      check('[1] 结构：图内 4 块（D0 候选完整页 ／ L1 题头对齐 ／ L2 来源块 ／ L3 小标题）',
        ids.join(',') === 'D0,L1,L2,L3', `图内 ${ids.join(',')}`);
      check('[1] D0 是候选完整页：顶部行（返回）＋ 诗题 ＋ 来源块（标签＋文本）＋ 详情正文；且 L2 带「原型脚手架」小标',
        d0 && rowOf(d0col, 'back') && rowOf(d0col, 'title') && rowOf(d0col, 'provLabel') && rowOf(d0col, 'provText') &&
        rowOf(d0col, 'sub') && byId('L2').protomarks >= 1,
        `D0 行 role＝${d0col.rows.map((r) => r.role).join('/')}；L2 脚手架小标 ${byId('L2').protomarks} 个`);

      /* [T] 渲染出来的可见文字 == 种子去掉 Markdown 标记后的逐行文字 */
      const renderedDetail = M.rendered.filter((r) => r.role === 'sub' || r.role === 'li' || r.role === 'p')
        .map((r) => r.role + ':' + r.text).join('\u0001');
      check('[T] **渲染出来的可见文字 == 种子去掉 Markdown 标记后的逐行文字**（小标题去「### 」／列表项去「- 」／去「**」；不丢字、不加字）',
        renderedDetail === expectSeq,
        renderedDetail === expectSeq ? `${expectBlocks.length} 块逐字一致` : `渲染=${JSON.stringify(renderedDetail.slice(0, 160))} 期望=${JSON.stringify(expectSeq.slice(0, 160))}`);
      const renderedSrc = M.allProvText;
      check('[T] 「底本与来源」每一处文字 == front matter source（逐字；D0 1 处 ＋ L2 3 处）',
        renderedSrc.length === 4 && renderedSrc.every((s) => s === MD_SOURCE),
        `${renderedSrc.length} 处，逐字一致=${renderedSrc.every((s) => s === MD_SOURCE)}`);
      check('[T] D0 的诗题 == front matter title（逐字）；返回标签 == 「返回」',
        M.rendered.filter((r) => r.role === 'title').every((r) => r.text === MD_TITLE) &&
        M.rendered.filter((r) => r.role === 'back').every((r) => r.text === '返回'),
        `title 出现 ${M.rendered.filter((r) => r.role === 'title').length} 处`);

      /* [3] 逐项几何：D0 左沿 */
      log('\n[3] 逐项几何（逐字 Range 的**墨迹盒**；dCol＝相对本列左沿；over＝越出「列宽 − 行内沿」）');
      const SUB_LEFT = r2(EDGE + 9.6 + 2);          /* 发丝竖线 2px ＋ 内边距 0.6rem＝9.6px */
      const edgeRows = ['back', 'title', 'provLabel', 'provText', 'li', 'p'];
      const leftBad = [];
      edgeRows.forEach((role) => {
        const r = rowOf(d0col, role);
        if (!r) { leftBad.push(role + ' 缺'); return; }
        const d = r2(r.minLeft - d0col.colLeft);
        if (Math.abs(d - EDGE) > 0.5) leftBad.push(`${role} 左沿 dCol=${d}（要求 ${EDGE}±0.5）`);
      });
      const subRowD0 = rowOf(d0col, 'sub');
      const subD = r2(subRowD0.minLeft - d0col.colLeft);
      check(`[3] D0 逐项左沿：返回／诗题／来源标签／来源文本／列表项／段落 都 = 行内沿 ${EDGE}px；小标题（eyebrow ①）＝竖线 2px ＋ 0.6rem 内边距 ⇒ ${SUB_LEFT}px`,
        leftBad.length === 0 && Math.abs(subD - SUB_LEFT) <= 0.5,
        (leftBad.length ? leftBad.join(' | ') + ' | ' : '') + `sub=${subD}（要求 ${SUB_LEFT}±0.5）`);
      const overBad = [];
      d0colsIterate(d0col, (r) => {
        if (r.maxRight === null) return;
        const over = r2(r.maxRight - (d0col.colLeft + d0col.colW - EDGE));
        if (over > 0.5) overBad.push(`${r.role} 右沿越出 ${over}`);
      });
      check(`[3] D0 每一行右沿 ≤ 列宽 − 行内沿（＝${r2(d0col.colW - EDGE)}px）⇒ **没有一行溢出**`,
        overBad.length === 0, overBad.length ? overBad.join(' ') : '全部 ≤ 0.5px');
      const detailRows = d0col.rows.filter((r) => r.role === 'sub' || r.role === 'li' || r.role === 'p');
      const nLines = detailRows.reduce((a, r) => a + r.nLines, 0);
      const allLineWs = [];
      detailRows.forEach((r) => r.lines.forEach((x) => allLineWs.push(x.w)));
      const maxLineW = Math.max(...allLineWs);
      check(`[3] D0 详情正文共 ${nLines} 行（${expectBlocks.length} 块），最长行**宽** ${r2(maxLineW)}px ≤ 可用宽 ${AVAIL}px（行宽＝墨迹宽；左沿另算）`,
        nLines >= expectBlocks.length && maxLineW <= AVAIL + 0.5,
        `行数=${nLines} 最长行宽=${r2(maxLineW)} 可用宽=${AVAIL}`);
      /* 逐行打印（可抄进报告） */
      detailRows.forEach((r) => {
        log(`      ${r.role.padEnd(3)} ${r.lines.map((x) => `${x.n}字 L${r2(x.l - d0col.colLeft)} R${r2(x.r - d0col.colLeft)} W${x.w}`).join(' | ')}`);
      });
      /* 行内几何：行高（相邻行 top 差）＋ 段间距 */
      check('[3] 详情正文的正文行（列表项／段落）都以同一左沿（行内沿 16.8px）起排，没有一行居中/右移；小标题另有自己的左沿',
        detailRows.filter((r) => r.role !== 'sub').every((r) => Math.abs(r2(r.minLeft - d0col.colLeft) - EDGE) <= 0.5) &&
        detailRows.filter((r) => r.role === 'sub').every((r) => Math.abs(r2(r.minLeft - d0col.colLeft) - SUB_LEFT) <= 0.5),
        detailRows.map((r) => r.role + ':' + r2(r.minLeft - d0col.colLeft)).join(' '));

      /* [4] 几何与已定值 */
      const S = M.styles;
      check(`[4] 详情正文 ${S.detail.fs}／行高 ${S.detail.lh}／字距 ${S.detail.ls}（已定 17px／34px／0.765px）`,
        S.detail.fs === '17px' && S.detail.lh === '34px' && S.detail.ls === '0.765px',
        `${S.detail.fs} / ${S.detail.lh} / ${S.detail.ls}`);
      check(`[4] 诗题 ${S.title.fs}／字距 ${S.title.ls}（已定 24px／2.4px）；来源与小标题 ${S.prov.fs}／${S.subFirst.fs}（令牌 --note-size 13.5px）；返回 ${S.back.fs}（草案 13.12px）`,
        S.title.fs === '24px' && S.title.ls === '2.4px' && S.prov.fs === '13.5px' &&
        S.subFirst.fs === '13.5px' && S.subFirst.ls === '2.16px' && S.back.fs === '13.12px',
        `title ${S.title.fs}/${S.title.ls}；prov ${S.prov.fs}；sub ${S.subFirst.fs}/${S.subFirst.ls}；back ${S.back.fs}`);
      check(`[4] 间距逐项实测：来源块上 ${S.provBox.mt}（25.6）／详情正文上 ${S.detail.mt}（25.6）／小标题上 ${S.subSecond.pt} 下 ${S.subSecond.pb}（25.6／8）／列表项 ${S.li.pb}（9.6）／段落 ${S.p.pb}（14.4）`,
        S.provBox.mt === '25.6px' && S.detail.mt === '25.6px' && S.subSecond && S.subSecond.pt === '25.6px' && S.subSecond.pb === '8px' &&
        S.li.pb === '9.6px' && S.p.pb === '14.4px' && S.subFirst.pt === '0px',
        `prov.mt=${S.provBox.mt} detail.mt=${S.detail.mt} sub1.pt=${S.subFirst.pt} sub2.pt=${S.subSecond && S.subSecond.pt} sub2.pb=${S.subSecond && S.subSecond.pb} li.pb=${S.li.pb} p.pb=${S.p.pb}`);

      /* [3] 局部对照格几何 */
      const l1 = byId('L1');
      const l1t = l1.cols.map((c) => rowOf(c, 'title'));
      check('[3] L1：① 诗题左对齐 ⇒ 左沿 = 行内沿 16.8px；② 诗题居中 ⇒ 左右留白相等（|左−右| ≤ 0.5）',
        l1t.length === 2 && Math.abs(r2(l1t[0].minLeft - l1.cols[0].colLeft) - EDGE) <= 0.5 &&
        (() => { const c = l1.cols[1]; const r = l1t[1]; return Math.abs((r.minLeft - c.colLeft) - (c.colRight - r.maxRight)) <= 0.5; })(),
        l1t.map((r, i) => `${i === 0 ? '①左' : '②中'} L=${r2(r.minLeft - l1.cols[i].colLeft)} R=${r2(l1.cols[i].colRight - r.maxRight)}`).join(' ／ '));
      const l2 = byId('L2');
      const l2p = l2.cols.map((c) => rowOf(c, 'provText'));
      check('[3] L2：三档来源文本左沿都 = 行内沿 16.8px（只换位置／色／发丝线，不动左沿）',
        l2p.length === 3 && l2p.every((r, i) => Math.abs(r2(r.minLeft - l2.cols[i].colLeft) - EDGE) <= 0.5),
        l2p.map((r, i) => `${i}→${r2(r.minLeft - l2.cols[i].colLeft)}`).join(' '));
      const l3 = byId('L3');
      const l3s = l3.cols.map((c) => rowOf(c, 'sub'));
      check('[3] L3：① 小标题（发丝竖线＋0.6rem 内边距）左沿 > 16.8px；②③ 左沿 = 16.8px；③ 的文字以「### 」原样可见',
        l3s.length === 3 && r2(l3s[0].minLeft - l3.cols[0].colLeft) > EDGE + 1 &&
        Math.abs(r2(l3s[1].minLeft - l3.cols[1].colLeft) - EDGE) <= 0.5 &&
        Math.abs(r2(l3s[2].minLeft - l3.cols[2].colLeft) - EDGE) <= 0.5 &&
        l3s[2].text.indexOf('### ') === 0,
        l3s.map((r, i) => `${i}→L${r2(r.minLeft - l3.cols[i].colLeft)}${i === 2 ? ' text=' + JSON.stringify(r.text.slice(0, 8)) : ''}`).join(' ／ '));
      check('[3] L3：三档小标题字号 ①＝②＝13.5px（--note-size）；③＝17px（与正文同字号 ⇒ 层级消失）',
        l3s.length === 3 && l3s[0].fs === '13.5px' && l3s[1].fs === '13.5px' && l3s[2].fs === '17px',
        l3s.map((r) => r.fs).join(' / '));

      /* [5] 可点元素语义 */
      check('[5] **可点元素语义**：图内应用层链接**全是**「返回」，都是 <a>、文本非空，且 href = `#/p/<id>`（**落到这首诗**，不是目录）',
        M.links.length >= 1 && M.links.every((l) => l.tag === 'a' && l.test === 'back' && l.text === '返回' && l.href === POEM_ROUTE) &&
        POEM_ROUTE === '#/p/' + PID,
        `${M.links.length} 个链接：` + M.links.map((l) => `<${l.tag} data-test=${l.test} href=${l.href}>${l.text}</${l.tag}>`).join(' '));
      check('[5] 没有空文本链接、没有 javascript:／外部 href（每个 [href] 都是页内 #/ 路由或非空）',
        M.badHref.length === 0, M.badHref.length ? JSON.stringify(M.badHref) : '0 处');

      /* [6] 字号不随宽度变 */
      fontBag.push({ k: C.key, detail: `${S.detail.fs}/${S.detail.lh}/${S.detail.ls}`, title: `${S.title.fs}/${S.title.ls}`,
        note: S.prov.fs, sub: `${S.subFirst.fs}/${S.subFirst.ls}`, back: S.back.fs });
      check(`[6] 本视口字号固定：详情正文 ${S.detail.fs}、诗题 ${S.title.fs}、来源/小标题 ${S.prov.fs}、返回 ${S.back.fs}`,
        S.detail.fs === '17px' && S.title.fs === '24px' && S.prov.fs === '13.5px' && S.back.fs === '13.12px');

      rowsOut.push({
        key: C.key, v: W, cw: r2(cw), avail: AVAIL, docW: M.docW, deckH: M.deck.h,
        lefts: edgeRows.map((r) => `${r}=${r2(rowOf(d0col, r).minLeft - d0col.colLeft)}`).join(' ') + ` sub=${subD}`,
        nLines, maxLineW: r2(maxLineW),
        l1: `①${r2(l1t[0].minLeft - l1.cols[0].colLeft)} ②中`, l3: l3s.map((r, i) => r2(r.minLeft - l3.cols[i].colLeft)).join('/'),
        detail: `${S.detail.fs}/${S.detail.lh}/${S.detail.ls}`,
      });

      /* [7] PNG */
      if (!SHOT) { log('\n[7] 已跳过（--no-shot）：不查看图态、不重出 PNG'); continue; }
      await send('Page.navigate', { url: 'about:blank' });
      await sleep(150);
      await load(url + '#shot', W, H, C.mobile);
      const SM = await measure();
      check('[7] 看图态：#shot 只隐去说明性文字；块结构与列宽数字与普通态一致',
        SM.shot === true && SM.blocks.length === M.blocks.length &&
        SM.blocks.every((b, i) => b.block === M.blocks[i].block && near(b.cols[0].colW, M.blocks[i].cols[0].colW, 0.02)),
        `shot=${SM.shot}；${SM.blocks.length} 块列宽与普通态一致`);
      check(`[7] 看图态仍无横向溢出（docW = ${W}）`, SM.docW === W && SM.maxRight <= W + 0.5,
        `docW=${SM.docW} maxRight=${SM.maxRight}`);
      const deckTop = SM.deck.y, deckH = SM.deck.h;
      /* 各块的 y 边界（看图态重算） */
      const bounds = await js(String.raw`(function(){
        var out = [], ds = document.querySelectorAll('[data-test="demo"]');
        for (var i=0;i<ds.length;i++){ var r = ds[i].getBoundingClientRect(); out.push({ block: ds[i].dataset.block, top: r.top + window.scrollY, bottom: r.bottom + window.scrollY }); }
        return JSON.stringify(out);
      })()`);
      const blocksY = JSON.parse(bounds);
      const parts = [];
      let start = deckTop;
      for (const bl of blocksY) {
        if (bl.bottom - start <= MAX_SHOT_CSS) continue;
        const cut = (bl.top - start > 40) ? bl.top : (start + MAX_SHOT_CSS);
        parts.push({ y: start, h: r2(cut - start) });
        start = cut;
      }
      parts.push({ y: start, h: r2(deckTop + deckH - start) });
      const partsH = parts.reduce((a, p) => a + p.h, 0);
      log(`\n[7] 截图区（先量高度）：${r2(deckH)} CSS px ⇒ ${r2(deckH * 2)} 设备 px；上限 ${PNG_HARD_LIMIT}` +
        ` ⇒ 拆成 ${parts.length} 张（单张 ≤ ${MAX_SHOT_CSS} CSS px）`);
      check('[7] 每张的**高度先量过**且在单张上限内（超过就按块边界拆图，不假装拍到）',
        parts.every((p) => p.h <= MAX_SHOT_CSS + 0.01 && p.h > 0),
        parts.map((p, i) => `#${i + 1} y=${p.y} h=${p.h}`).join(' '));
      check('[7] 各张高度之和 == 截图区高度（正好铺满、不重不漏）',
        near(partsH, deckH, 0.05), `Σ${r2(partsH)} vs ${r2(deckH)}`);
      for (let pi = 0; pi < parts.length; pi += 1) {
        const p = parts[pi];
        const name = parts.length === 1 ? `q-detail.${C.key}.png` : `q-detail.${C.key}.part${pi + 1}.png`;
        const pngPath = join(OUT, name);
        const shot = await send('Page.captureScreenshot', {
          format: 'png', captureBeyondViewport: true,
          clip: { x: 0, y: p.y, width: W, height: p.h, scale: 1 },
        });
        writeFileSync(pngPath, Buffer.from(shot.data, 'base64'));
        const size = pngSize(readFileSync(pngPath));
        log(`      ${name}：clip y=${p.y} h=${p.h} → 像素 ${size.w}×${size.h}，${statSync(pngPath).size} 字节`);
        check(`[7] ${name} 像素宽 = 视口宽 × 2 = ${W * 2}（真实 CSS px @DPR 2，不是缩放图、不是拼图）`,
          size.w === W * 2, `实测 ${size.w}`);
        check(`[7] ${name} 像素高 = 该张截图区高 × 2（±2px）`, Math.abs(size.h - p.h * 2) <= 2,
          `实测 ${size.h}，期望 ${r2(p.h * 2)}`);
        check(`[7] ${name} 非空且高 < ${PNG_HARD_LIMIT}（没有被截断）`,
          statSync(pngPath).size > 1000 && size.h < PNG_HARD_LIMIT, `${statSync(pngPath).size} 字节，${size.w}×${size.h}`);
      }
    }

    /* ═══ [6] 跨视口：字号不缩放 ═════════════════════════════════ */
    log('\n═══════════ [6] 跨视口：字号／行高／字距**不随宽度变** ═══════════');
    if (fontBag.length > 1) {
      const kinds = ['detail', 'title', 'note', 'sub', 'back'];
      const bad = kinds.filter((k) => new Set(fontBag.map((f) => f[k])).size !== 1);
      kinds.forEach((k) => log(`      ${k}: ${new Set(fontBag.map((f) => f[k])).size} 个取值 → ${[...new Set(fontBag.map((f) => f[k]))].join('  //  ')}`));
      check(`[6] 5 类文字在 ${fontBag.length} 个视口下只有一个取值（完全没随宽度缩放）`,
        bad.length === 0, bad.length ? bad.join(' ') : '全部恒定');
    } else {
      log('      （--only 只跑了一个视口，跨视口这条跳过）');
    }

    /* ═══ 自包含 / 无 JS 报错 ═══════════════════════════════════ */
    log('\n═══════════ [G] 自包含 ＋ 无 JS 报错 ═══════════');
    const ext = requests.filter((u) => !u.startsWith('file:///') && !u.startsWith('data:'));
    check('[G] CDP 记录的网络请求里没有任何 http(s) 外部引用',
      ext.length === 0, `${requests.length} 个请求，非 file:// 的=${ext.length} ${JSON.stringify(ext.slice(0, 4))}`);
    check('[G] 全程无 JS 报错（加载 ＋ 各视口）', pageErrors.length === 0,
      pageErrors.length ? pageErrors.join(' | ') : '0 条');

    /* ═══ 汇总表 ═══════════════════════════════════════════════ */
    log('\n═══════════ 汇总（可直接抄进 q-detail.md）═══════════');
    rowsOut.forEach((r) => log(`  ${r.key}: C=${r.cw} 可用宽=${r.avail} | 左沿 ${r.lefts} | 正文 ${r.nLines} 行 最长行宽 ${r.maxLineW} | L1 ${r.l1} | L3 ${r.l3} | 正文 ${r.detail} | docW=${r.docW} 截图区=${r2(r.deckH)}`));

    ws.close();
  } finally {
    chrome.kill();
    await sleep(300);
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* 临时 profile 删不掉不影响结果 */ }
  }
}

function d0colsIterate(col, fn) { col.rows.forEach(fn); }

try {
  await run();
} catch (e) {
  console.error('\n校验脚本失败：' + ((e && e.stack) || e));
  failures += 1;
}
console.log(`\n===== 失败断言数：${failures} =====`);
process.exit(failures ? 1 : 0);
