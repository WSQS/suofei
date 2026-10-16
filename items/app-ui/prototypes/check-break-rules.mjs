/*
 * check-break-rules.mjs —— 「已选断行规则」原型的【页面行为 ＋ 逐行几何 ＋ 断点逐字 ＋ 模型独立复算】自证脚本（可复跑）。
 *
 * ⚠ 它验的是**这一个原型页面**（q-break-rules.html）的页面行为，**不是产品代码**，也不是任何规格的采纳。
 *   对象只有本目录下的 q-break-rules.html（**只读打开**：Page.navigate 到 file:// URL，脚本不写、不改它）。
 *   额外读的文件只有两个，都是**只读**：
 *     ① prototype/css/theme-tech.css          —— 用来逐项比对页面内嵌的令牌快照；
 *     ② content/poems/gushi-shijiu-shou-01.md —— 用它的正文 8 行做「原文逐字一致」的基准。
 *
 * 覆盖的视口（**每个视口都单独跑一遍全部断言，并各出一张图；图太高就按块边界拆图**）：320 ／ 430 ／ 1180。
 *   ⚠ 一个视口一组图（真实 CSS px @DPR 2）；**不做**缩放拼图。
 *
 * 本脚本自带**两份独立实现**的断行模型，把页面渲染出来的每一行**逐字**与它们比对 —— 不一致就报错：
 *   [B] `__qbr.lines`（注入页面的一段脚本，**自己另建一把量宽台**，逐候选实测前缀宽）—— 与页面模型同尺不同码；
 *   [C] Node 侧 `slotLines`（把每个字的推进宽从页面**单独取回来**，在 Node 里**求和**，按「累加宽 ≤ 容器」判放得下）。
 *
 * 断言清单（失败任一即 exit 1；当前失败数 0）：
 *  [G] 令牌快照逐项比对（不一致数必须 0）／没有「声明了却没用」的令牌／每个 var() 都有声明／
 *      记录快照来源短 sha ＋「权威仍是 docs/design/visual-tokens.md」／写明三个覆盖视口与宽度口径 C／
 *      已定项逐条在页面上／「材料不是实施｜选某档 ≠ 采纳整页规格｜不决定 JSON／MD 分界」都在／
 *      已选 5 条规则**原文**在参数块里逐条可解析／自包含（非 file:// 请求 0 个、无 <link / src= / @import / http(s)://）／
 *      无 JS 报错／夹具都带 data-fx="1"／参数表与夹具表可解析。
 *  [P] 每个全角字的推进宽**独立实测**（脚本自己另建元素，不信页面自报）＝ 参数表 char_advance；
 *      每个「N 个全角字宽」容器的宽度 ＝ 脚本自己量出的 N 字宽 ＋ epsilon（±0.02px）；
 *      每个块的 .pg 宽 = 视口宽、.col 宽 = C = min(V, max(320, 0.88×(V−24)))、正文可用宽 = C − 33.6。
 *  [1] 结构：图内 8 块（S0／R1／R2／R2d／R3／R3B／R4／R5）；S0 的 8 行**逐行与源文件逐字相同**。
 *  [2] 每个视口：innerWidth 与 visualViewport.width 精确等于目标；docW == bodyW == 目标宽、所有可见元素都在 0…目标宽 内
 *      （**无横向溢出**，含最长夹具态；唯一例外是「整条末尾」那一格：它的越界是**故意的**，外面套了 overflow:hidden 裁剪框）。
 *  [3] **逐行实测**（逐字 Range 量墨迹盒）：每块每个被测盒每一行的 左沿／右沿／宽／中心相对本列容器中心 与 相对页内容列中心；
 *      断言**没有任何一行越出它所在的容器**（>0.05px 即失败；裁剪那格除外），且所有非裁剪盒每一行 |dBox| ≤ 0.5px（＝两个视觉行都继承居中）。
 *  [4] **断点位置逐字**：逐行给出「上一行末字 → 下一行首字 ＋ 两者的标点类别」；并断言每种情形的断点（见 [8]–[14]）。
 *  [5] **页面模型 == 页面渲染**：每个自带模型的盒子，渲染出来的每一行逐字等于它自报的 data-model。
 *  [6] **[B] 独立复算 == 实测** 与 **[C] Node 侧独立复算 == 实测**（两份实现都与页面渲染逐字一致）。
 *  [7] S0：真实 8 行与 content/poems/gushi-shijiu-shou-01.md **逐字相同**（且本视口不折行 ⇒ 规则 1）。
 *  [8] R1（规则 1）：宽容器 1 行（原诗行未动）、窄容器 2 行「行行重行行，／与君生别离。」（＝用户给的例子）。
 *  [9] R2（规则 2）：同一容器下 r2a 的三个第一行断点**互不相同**（①「、」第 4 字后 ≠ ②「。」第 2 字后 ≠ ③「，」第 11 字后）；
 *      r2b 上 ③ 取到窗口外的「…」且**越界 > 0**；② 是 rank 表那一档。
 *  [10] R2d（规则 2 的边界例）：容器刚好放得下「。」⇒ 断在第 8 字后；窄 1px ⇒ 断点前移到第 6 字后「、」；两列都没有溢出。
 *  [11] R3（规则 3 · 无标点/混排）：a① 6／6／2；b① 的断点**落在西文串内部**（末字与下一字都是字母）、b②（未采纳候选）回退到串首；
 *      c① 引号内照断且不违反禁则。
 *  [12] R3B（规则 3 · 半句仍超宽）：宽容器 9／8（只在句读处断）、窄容器 5／4／5／3；余文拼回与夹具**逐字相同**；
 *      **没有任何一行溢出**；没有省略号（页面全文不含「…」被塞进溢出行）。        ← 真夹具里有一个「…」（r2b），单独排除
 *  [13] R4（规则 4 · 禁则）：① ON 里断点前移（前一字连标点下移）、行首无收尾标点；② OFF **确实**把「，」/「）」放到行首、把「（」留在行尾；
 *      ③ 浏览器不施禁则（line-break:anywhere）与 ② **逐字相同**。
 *  [14] R5（实现代价）：①（逐行 span）与 ②（分段块）逐字相同；③④（读回浏览器断点／纯 CSS）与 ① **不同**且 ③＝④。
 *  [15] 字号／行高／字距**不随宽度变**：正文 17px/34px/0.765px、题名 24px、身份行 12.48px 各只有一个取值。
 *  [16] PNG：每个视口一组；像素宽 = 视口宽 × 2；**先量截图区高度**，超过内核上限（16384 设备 px）就按**块边界**拆成多张；
 *      每张的像素高都必须 < 16384；各张高度之和 == 截图区高度（**正好铺满、不重不漏**）；文件非空。
 *  [17] **边界自证**：CHROME_BIN 指到不存在的路径 ⇒ 必须**如实报错并 exit 2**，**不能**打印「失败断言数：0」。
 *
 * 怎么跑：
 *   node items/app-ui/prototypes/check-break-rules.mjs
 *   node items/app-ui/prototypes/check-break-rules.mjs --no-shot          # 只跑断言，不重出 PNG
 *   node items/app-ui/prototypes/check-break-rules.mjs --only=320         # 只跑一个视口
 *   node items/app-ui/prototypes/check-break-rules.mjs --selftest-chrome  # 只跑「CHROME_BIN 指错 ⇒ 如实报错」边界
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
 *         q-break-rules.html 本身**只读打开**，不写、不改。
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
  { key: '320', w: 320, h: 568, mobile: true, label: '手机 · 最窄' },
  { key: '430', w: 430, h: 932, mobile: true, label: '手机（前几轮的验收宽）' },
  { key: '1180', w: 1180, h: 900, mobile: false, label: '桌面（宽而矮）' },
];
const MD_PATH = join(ROOT, 'content', 'poems', 'gushi-shijiu-shou-01.md');
const HTML_PATH = join(OUT, 'q-break-rules.html');
const PNG_HARD_LIMIT = 16384;                 /* 设备像素上限：宁可拆图也不出一张被截断的图 */
const MAX_SHOT_CSS = 8000;                    /* 单张图的截图区 CSS 高上限（×DPR 2 = 16000 < 16384） */

const CHROME = process.env.CHROME_BIN
  || join(process.env.LOCALAPPDATA || '', 'Chromium', 'Application', 'chrome.exe');
if (!CHROME || !existsSync(CHROME)) {
  console.error('找不到无头 Chromium：' + (CHROME || '(未设置)'));
  console.error('请用环境变量指定，例如：');
  console.error("  CHROME_BIN='C:/Users/wsqsy/AppData/Local/Chromium/Application/chrome.exe' \\");
  console.error('    node items/app-ui/prototypes/check-break-rules.mjs');
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
const paramBlock = declarationBlock(htmlText, '== BREAK-PARAMS-BEGIN ==', '== BREAK-PARAMS-END ==');
if (!paramBlock) { console.error('页面里找不到 == BREAK-PARAMS-BEGIN ==/== BREAK-PARAMS-END == 参数表'); process.exit(2); }
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
  deduct: pnum('deduct_total'),
  pct: pnum('pct'),
  floor: pnum('floor'),
  edge: pnum('edge_x'),
  epsw: pnum('epsilon_w'),
  edgeDelta: pnum('edge_delta'),
  cjkR1: pnum('cjk_r1'), cjkR2: pnum('cjk_r2'), cjkR3: pnum('cjk_r3'), cjkR3c: pnum('cjk_r3c'),
  cjkR3B: pnum('cjk_r3B'), cjkR3BW: pnum('cjk_r3BW'), cjkR4: pnum('cjk_r4'), cjkR5: pnum('cjk_r5'),
  wR3B: pnum('w_r3b'), wR4C: pnum('w_r4c'),
};
const VIEWPORTS = (pstr('viewports') || '').split(/\s+/).map(Number);
const RULES = { r1: pstr('rule1'), r2: pstr('rule2'), r3: pstr('rule3'), r4: pstr('rule4'), r5: pstr('rule5') };
const SETS = {
  punct: pstr('punct_set') || '', close: pstr('close_set') || '', open: pstr('open_set') || '',
};
const FX = {};
['r1', 'r2a', 'r2b', 'r2c', 'r3a', 'r3b', 'r3c', 'r3B', 'r4a', 'r4b', 'r4c', 'r5'].forEach((k) => { FX[k] = pstr('fx_' + k); });
const RANK_LAST = prank('rank_last');
const fxAfterColon = (k) => {
  const s = pstr('fx_' + k);
  return s ? s.replace(/^.*?：\s*/, '') : null;
};

/* ── 标点类别（与页面同表；这里独立写一份，用来判行首/行末标点）────── */
const isPunct = (ch) => SETS.punct.indexOf(ch) >= 0;
const isCloseC = (ch) => SETS.close.indexOf(ch) >= 0;
const isOpenC = (ch) => SETS.open.indexOf(ch) >= 0;
const cat = (ch) => (isCloseC(ch) ? '收尾标点' : (isOpenC(ch) ? '开局标点' : '普通字'));
const isLatinCh = (ch) => /[0-9A-Za-z]/.test(ch);

/* ══ [B] 注入页面的一段**独立**复算（自己另建量宽台；不与页面共用任何函数）══ */
const INJECT = `(function(){
  if (window.__qbr) return 'cached';
  var host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-987654px;top:0;visibility:hidden;width:max-content;' +
    'white-space:nowrap;margin:0;padding:0;text-align:left;' +
    'font-family:"Microsoft YaHei UI","Microsoft YaHei",system-ui,sans-serif;' +
    'font-size:17px;line-height:2;letter-spacing:0.045em';
  document.body.appendChild(host);
  var cache = {};
  var mw = function(s){ if (cache[s] === undefined){ host.textContent = s; cache[s] = host.getBoundingClientRect().width; } return cache[s]; };
  var PUNCT = '${SETS.punct}', CLOSE = '${SETS.close}', OPEN = '${SETS.open}';
  var RANK = ${JSON.stringify(RANK_LAST || {})};
  var iP = function(c){ return PUNCT.indexOf(c) >= 0; };
  var iC = function(c){ return CLOSE.indexOf(c) >= 0; };
  var iO = function(c){ return OPEN.indexOf(c) >= 0; };
  var isL = function(c){ return /[0-9A-Za-z]/.test(c); };
  /* 独立实现：与页面同规则、不同代码（这里用 while + break 之外的结构，且用自己的量宽台）*/
  function lines(text, w, opt){
    opt = opt || {};
    var kin = opt.kin !== false, sel = opt.sel || 'last', noTok = opt.noTok === true;
    var res = [], k = 0, n = text.length;
    while (k < n) {
      var rest = text.substring(k);
      if (mw(rest) <= w + 1e-6) { res.push(rest); break; }
      var cut = -1, i;
      if (sel === 'whole') {
        for (i = n; i > k; i -= 1) { if (iP(text.charAt(i - 1))) { cut = i; break; } }
        res.push(text.substring(k, cut > k ? cut : n));
        break;
      }
      if (sel === 'rank') {
        var win = [], best = -1, br = -1, rk;
        for (i = k + 1; i <= n; i += 1) { if (mw(text.substring(k, i)) > w + 1e-6) break; win.push(i); }
        for (i = 0; i < win.length; i += 1) {
          rk = RANK[text.charAt(win[i] - 1)];
          if (rk === undefined) continue;
          if (rk > br || (rk === br && win[i] > best)) { best = win[i]; br = rk; }
        }
        cut = best;
      } else {
        var cands = [];
        for (i = k + 1; i <= n; i += 1) { if (mw(text.substring(k, i)) > w + 1e-6) break; cands.push(i); }
        for (i = 0; i < cands.length; i += 1) { if (iP(text.charAt(cands[i] - 1))) cut = cands[i]; }
      }
      if (cut < 0) {
        var fit = k;
        while (fit < n && mw(text.substring(k, fit + 1)) <= w + 1e-6) fit += 1;
        cut = (fit > k) ? fit : k + 1;
        if (noTok) { while (cut > k + 1 && isL(text.charAt(cut - 1)) && isL(text.charAt(cut))) cut -= 1; }
        if (kin) {
          if (iC(text.charAt(cut)) && cut - 1 > k) cut -= 1;
          else if (iO(text.charAt(cut - 1)) && cut - 1 > k) cut -= 1;
        }
      }
      res.push(text.substring(k, cut));
      k = cut;
    }
    return res;
  }
  window.__qbr = { mw: mw, lines: lines, adv: mw };
  return 'ok';
})()`;

/* ══ 页面侧量测（脚本自己实现，不依赖页面自报）════════════════════ */
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
      top: px(pr.top + window.scrollY), bottom: px(pr.bottom + window.scrollY),
      items: [], capData: {}, capText: cap.textContent.replace(/\\s+/g,' ').trim() };
    Array.prototype.forEach.call(cap.attributes, function(a){ if (a.name.indexOf('data-m-') === 0) o.capData[a.name] = a.value; });
    var boxes = d.querySelectorAll('[data-test="line"]');
    for (var b=0;b<boxes.length;b++){
      var bx = boxes[b];
      var clip = bx.parentNode && /clipwrap/.test(bx.parentNode.className || '');
      var lb = lineBoxes(bx);
      o.items.push({ tag: 'line', fx: bx.getAttribute('data-fx') === '1',
        real: bx.getAttribute('data-real') === '1',
        cand: bx.getAttribute('data-cand') || '', mode: bx.getAttribute('data-mode') || '',
        sel: bx.getAttribute('data-sel') || '', kin: bx.getAttribute('data-kin'),
        notok: bx.getAttribute('data-notok') === '1',
        firstOnly: bx.getAttribute('data-firstonly') === '1',
        fxkey: bx.getAttribute('data-fxkey') || '', clipped: !!clip,
        dw: Number(bx.getAttribute('data-w')),
        rule: bx.getAttribute('data-rule') || '',
        text: bx.getAttribute('data-text') || bx.textContent,
        model: JSON.parse(bx.getAttribute('data-model') || 'null'),
        lines: lb.map(function(x){
          return { t:x.t, n:x.n, l:x.l, r:x.r, w:x.w, cx:x.cx,
            dBox:px(x.cx - bx.getBoundingClientRect().width/2),
            dCol:px((bx.getBoundingClientRect().left + x.cx) - cc),
            over:px(x.r - bx.getBoundingClientRect().width) };
        }),
        overMax: lb.length ? Math.max.apply(null, lb.map(function(x){ return px(x.r - bx.getBoundingClientRect().width); })) : null });
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
  return JSON.stringify({ innerW: window.innerWidth,
    visualW: window.visualViewport ? px(window.visualViewport.width) : null,
    docW: document.documentElement.scrollWidth, docH: document.documentElement.scrollHeight,
    bodyW: document.body.scrollWidth, maxRight: px(maxRight), maxRightEl: mrEl, minLeft: px(minLeft), minLeftEl: mlEl,
    deck: { x: px(deckP.left), y: px(deckP.top + window.scrollY), w: px(deckP.width), h: px(deckP.height) },
    cwVar: String(getComputedStyle(document.documentElement).getPropertyValue('--cw')).trim(),
    avail: document.documentElement.dataset.avail, charAdvP: document.documentElement.dataset.charAdvance,
    fonts: { poem: cs(bodyEl, ['fontSize','lineHeight','letterSpacing']),
             title: cs(titleEl, ['fontSize','letterSpacing']),
             ident: cs(identEl, ['fontSize','letterSpacing']) },
    shot: document.documentElement.dataset.shot === '1',
    fxTags: document.querySelectorAll('.fxtag').length,
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

/* ── [C] Node 侧独立复算：按「每个字的推进宽求和 ≤ 容器」判放得下 ──────
 *   这份实现把「一个字占多少宽」单独从页面取回来，然后**在 Node 里求和**（不调页面的前缀量宽）。 */
function slotLines(text, w, advMap, opt) {
  const kin = opt.kin !== false, noTok = opt.noTok === true;
  const AW = (s) => { let t = 0; for (let i = 0; i < s.length; i += 1) t += advMap[s.charAt(i)] || 0; return t; };
  opt = opt || {};
  const out = [];
  let k = 0;
  const n = text.length;
  while (k < n) {
    if (AW(text.slice(k)) <= w + 1e-6) { out.push(text.slice(k)); break; }
    let cut = -1;
    if (opt.sel === 'whole') {
      for (let q = n; q > k; q -= 1) { if (isPunct(text.charAt(q - 1))) { cut = q; break; } }
      out.push(text.slice(k, cut > k ? cut : n));
      break;
    }
    if (opt.sel === 'rank') {
      let best = -1, br = -1;
      for (let q = k + 1; q <= n; q += 1) {
        if (AW(text.slice(k, q)) > w + 1e-6) break;
        const rk = (RANK_LAST || {})[text.charAt(q - 1)];
        if (rk === undefined) continue;
        if (rk > br || (rk === br && q > best)) { best = q; br = rk; }
      }
      cut = best;
    } else {
      for (let q = k + 1; q <= n; q += 1) {
        if (AW(text.slice(k, q)) > w + 1e-6) break;
        if (isPunct(text.charAt(q - 1))) cut = q;
      }
    }
    if (cut < 0) {
      let fit = k;
      while (fit < n && AW(text.slice(k, fit + 1)) <= w + 1e-6) fit += 1;
      cut = (fit > k) ? fit : k + 1;
      if (noTok) { while (cut > k + 1 && isLatinCh(text.charAt(cut - 1)) && isLatinCh(text.charAt(cut))) cut -= 1; }
      if (kin) {
        if (isCloseC(text.charAt(cut)) && cut - 1 > k) cut -= 1;
        else if (isOpenC(text.charAt(cut - 1)) && cut - 1 > k) cut -= 1;
      }
    }
    out.push(text.slice(k, cut));
    k = cut;
  }
  return out;
}

async function run() {
  const port = await freePort();
  const profile = mkdtempSync(join(tmpdir(), 'qbrules-'));
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
  log(`参数：adv=${P.charAdvance} 尺=${P.pct}%×(V−${P.deduct}) 下限 ${P.floor} edge=${P.edge} ε=${P.epsw} Δ=${P.edgeDelta}`);
  log(`字宽档：R1=${P.cjkR1} R2=${P.cjkR2} R3=${P.cjkR3} R3c=${P.cjkR3c} R3B=${P.cjkR3B}/${P.cjkR3BW} R4=${P.cjkR4} R5=${P.cjkR5}；非整字宽 ${P.wR3B}px／${P.wR4C}px`);

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
    log('\n═══════════ [G] 全局：令牌快照 / 已选规则原文 / 参数 / 已定项 / 标注 / 自包含 ═══════════');
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
    check('页面写明三个覆盖视口（320／430／1180）与已选宽度口径 C = min(V, max(320, 0.88 × (V − 24)))',
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
    const mustSay = ['材料，不是实施', '选某档 ≠ 采纳整页规格', '不决定', 'JSON／MD', '全部居中',
      '夹具 · 不是真实数据', '原型说明 · 不属于应用页面', '标点归前句', '两个视觉行都继承居中', '已选'];
    const notSaid = mustSay.filter((s) => !htmlText.includes(s));
    check('页面写明了「材料不是实施／选某档 ≠ 采纳整页规格／不决定 JSON／MD 分界／夹具标注／图内标注／标点归前句／两个视觉行都继承居中」',
      notSaid.length === 0, notSaid.length ? '缺：' + notSaid.join('、') : mustSay.join('、'));
    const ruleWant = {
      r1: '宽度足够 ⇒ 保持原诗行；只有真超宽才按句读拆',
      r2: '多个标点 ⇒ 取「当前行放得下范围内最后那个可用句读」（不取越界的整条末尾；不要再用 rank 优先级表）',
      r3: '无标点、或半句本身仍超宽 ⇒ 在行尾按放得下的字符断行，余文续行；不删除、不截断、不加省略号、不缩字号、不允许溢出',
      r4: '逗号、句号不得跑到行首；必要时把前一字连标点一起下移',
      r5: '两个视觉行都继承居中；stanzas 与正文一字不改（断行只是视觉折行，原文文件只读）',
    };
    const ruleBad = Object.keys(ruleWant).filter((k) => RULES[k] !== ruleWant[k]);
    check('已选 5 条规则在参数块里**逐字**（与任务书原文一致）可解析',
      ruleBad.length === 0, ruleBad.length
        ? ruleBad.map((k) => `${k}: ${JSON.stringify(RULES[k])}`).join(' | ')
        : '5 条原文逐字一致');
    const textHits = ['<link', 'src=', '@import', 'http://', 'https://'].filter((t) => htmlText.indexOf(t) >= 0);
    check('页面文本里没有 <link / src= / @import / http(s)://（零外部引用）',
      textHits.length === 0, textHits.length ? '命中：' + textHits.join(' ') : '0 处');
    check('参数表可解析：adv=17.765／24／88／320／16.8／ε=0.05／Δ=1／字宽档 8,8,6,5,5,12,5,8／非整字宽 78／60',
      P.charAdvance === 17.765 && P.deduct === 24 && P.pct === 88 && P.floor === 320 && P.edge === 16.8 &&
      P.epsw === 0.05 && P.edgeDelta === 1 &&
      P.cjkR1 === 8 && P.cjkR2 === 8 && P.cjkR3 === 6 && P.cjkR3c === 5 && P.cjkR3B === 5 &&
      P.cjkR3BW === 12 && P.cjkR4 === 5 && P.cjkR5 === 8 && P.wR3B === 78 && P.wR4C === 60,
      JSON.stringify(P));
    const fxAll = Object.keys(FX).every((k) => FX[k] && FX[k].length > 0);
    check('夹具字符串可解析（12 段；r1 是真实原文第 1 行）', fxAll,
      Object.keys(FX).map((k) => `${k}=${FX[k] && FX[k].length}字`).join(' '));
    check('标点集合可解析：句读候选集含「，。！？；：、…」；收尾类含「，。）》」；开局类含「（《「」',
      SETS.punct === '，。！？；：、…' && SETS.close.indexOf('，') >= 0 && SETS.close.indexOf('。') >= 0 &&
      SETS.close.indexOf('）') >= 0 && SETS.open === '（《「『【',
      `punct=${SETS.punct} close=${SETS.close} open=${SETS.open}`);
    check('上一轮的 rank 表可解析（。！？ ＞ ，、；：）—— 它在本页只作对照列',
      RANK_LAST && RANK_LAST['。'] === 2 && RANK_LAST['，'] === 1 && RANK_LAST['、'] === 1,
      JSON.stringify(RANK_LAST));

    /* ═══ 逐视口 ═══════════════════════════════════════════════════ */
    const fontBag = [];
    for (const C of CASES) {
      if (ONLY && ONLY !== C.key) continue;
      const W = C.w, H = C.h;
      log(`\n═══════════ 视口 ${C.key}（${W}×${H}，DPR 2）· ${C.label} ═══════════`);
      await load(url, W, H, C.mobile);
      const M = await measure();
      const injected = await js(INJECT);
      const byId = (bid) => M.blocks.filter((b) => b.block === bid)[0] || null;
      const cw = cwOf(W);
      const AVAIL = r2(cw - 2 * P.edge);
      const itemsOf = (b) => (b ? b.items : []);
      const firstOf = (bid, cand) => itemsOf(byId(bid)).filter((i) => i.cand === cand)[0];
      const textsOf = (i) => i.lines.map((x) => x.t);
      const brkTxt = (i) => {
        const t = textsOf(i);
        if (t.length < 2) return '无（一行装得下）';
        let acc = 0;
        return t.slice(0, -1).map((s, k) => {
          acc += s.length;
          return `第${acc}字后「${s.slice(-1)}」(${cat(s.slice(-1))})→「${t[k + 1].charAt(0)}」(${cat(t[k + 1].charAt(0))})`;
        }).join('；');
      };
      /* 脚本自己量：全角字推进宽（不信页面自报）*/
      const advJson = await js(`(function(){
        var h = document.createElement('div');
        h.style.cssText = 'position:absolute;left:-987654px;top:0;visibility:hidden;width:max-content;white-space:nowrap;margin:0;padding:0;' +
          'font-family:"Microsoft YaHei UI","Microsoft YaHei",system-ui,sans-serif;font-size:17px;line-height:2;letter-spacing:0.045em';
        document.body.appendChild(h);
        h.textContent = '甲'; var a1 = h.getBoundingClientRect().width;
        h.textContent = '甲乙'; var a2 = h.getBoundingClientRect().width;
        h.textContent = '甲乙丙丁戊己庚辛'; var a8 = h.getBoundingClientRect().width;
        h.textContent = '甲，乙；丙、丁。'; var ref8 = h.getBoundingClientRect().width;
        h.parentNode.removeChild(h);
        return JSON.stringify({ one: a1, two: a2, eight: a8, ref8: ref8 });
      })()`);
      const A = JSON.parse(advJson);
      /* ⚠ 单字的 getBoundingClientRect 会被 Chrome 舍入到 1/64px（本机量到 17.75，真值 17.765）
       *   ⇒ 用「8 个字的实测宽 ÷ 8」反推推进宽（两个字的 35.5 也是舍入值，同样不作为依据）*/ 
      const ADV = A.eight / 8;
      const cjkExp = (n) => r2(n * ADV + P.epsw);

      check(`[P] 全角字推进宽独立实测 ${r2(ADV)}px（参数表 ${P.charAdvance}）—— 用 8 个字的实测宽 ÷ 8 反推（单字量会被 Chrome 舍入到 1/64px）`,
        near(ADV, P.charAdvance, 0.01) && near(A.ref8 / 8, ADV, 0.01),
        `1 字 ${r2(A.one)}（舍入值，不作依据）／2 字 ${r2(A.two)}／8 字 ${r2(A.eight)} ⇒ ÷8 = ${r2(ADV)}；含标点的 8 字 ${r2(A.ref8)} ⇒ ÷8 = ${r2(A.ref8 / 8)}；注入页面独立实现 = ${injected}`);

      /* [2] 视口与收敛 */
      check(`innerWidth = ${W}、visualViewport.width = ${W}（真实 CSS px，没有 shrink-to-fit）`,
        M.innerW === W && near(Number(M.visualW), W, 0.5), `innerW=${M.innerW} visualW=${M.visualW}`);
      check(`[2] 无横向溢出（**含最长夹具态**）：docW = bodyW = ${W}，所有可见元素都在 0…${W} 内`,
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
      check('[1] 结构：图内 8 块（S0／R1／R2／R2d／R3／R3B／R4／R5）',
        ids.join(',') === 'S0,R1,R2,R2d,R3,R3B,R4,R5' && M.blocks.every((b) => b.inShot), `图内 ${ids.join(',')}`);
      const s0 = byId('S0');
      const s0Lines = itemsOf(s0).filter((i) => i.tag === 'line');
      check('[1] S0 是真实诗页：顶部行（返回／详情）＋ 题名 ＋ 身份行 ＋ 正文恰好 8 行',
        s0Lines.length === 8 && htmlText.includes('返回') && htmlText.includes('详情'), `${s0Lines.length} 行`);
      const verbatim = s0Lines.map((i) => textsOf(i).join('')).join('\u0001') === mdFlat.join('\u0001');
      check('[7] S0 的 8 行与 content/poems/gushi-shijiu-shou-01.md **逐字相同**（顺序也相同）', verbatim,
        verbatim ? '8/8 逐字一致' : JSON.stringify({ page: s0Lines.map((i) => textsOf(i).join('')), md: mdFlat }));
      check('[7] 规则 1 在真实内容上：S0 的 8 行**都没有折行**（本视口可用宽放得下）',
        s0Lines.every((i) => i.lines.length === 1),
        s0Lines.map((i) => i.lines.length).join('/'));
      const fxItems = [];
      M.blocks.forEach((b) => b.items.forEach((i) => { if (i.fx) fxItems.push({ b: b.block, i }); }));
      const realItems = [];
      M.blocks.forEach((b) => b.items.forEach((i) => { if (i.real) realItems.push({ b: b.block, i }); }));
      check('[1] 夹具都带 data-fx="1"，且每一格旁边都有「夹具 · 不是真实数据」小标（图内可读）；真实原文那几格带 data-real="1"、不带夹具标',
        fxItems.length > 0 && realItems.length === 2 && realItems.every((x) => x.b === 'R1') &&
        fxItems.filter((x) => x.b === 'R1').length === 0 && M.fxTags === fxItems.length,
        `夹具格 ${fxItems.length}（R2 ${fxItems.filter((x) => x.b === 'R2').length}／R2d ${fxItems.filter((x) => x.b === 'R2d').length}／R3 ${fxItems.filter((x) => x.b === 'R3').length}／R3B ${fxItems.filter((x) => x.b === 'R3B').length}／R4 ${fxItems.filter((x) => x.b === 'R4').length}／R5 ${fxItems.filter((x) => x.b === 'R5').length}）；真实格 ${realItems.length}；小标 ${M.fxTags} 个`);

      /* [P] 每个「N 个全角字宽」容器的宽度 = 脚本自己量出的 N 字宽 ＋ ε */
      const expWs = {
        R1: [AVAIL, cjkExp(P.cjkR1)],
        R2: [cjkExp(P.cjkR2), cjkExp(P.cjkR2), cjkExp(P.cjkR2), cjkExp(P.cjkR2), cjkExp(P.cjkR2), cjkExp(P.cjkR2)],
        R2d: [r2(A.ref8 + P.epsw), r2(A.ref8 + P.epsw - P.edgeDelta)],
        R3: [cjkExp(P.cjkR3), P.wR3B, P.wR3B, cjkExp(P.cjkR3c)],
        R3B: [cjkExp(P.cjkR3BW), cjkExp(P.cjkR3B)],
        R4: [cjkExp(P.cjkR4), cjkExp(P.cjkR4), cjkExp(P.cjkR4), cjkExp(P.cjkR4), cjkExp(P.cjkR4), P.wR4C, P.wR4C],
        R5: [cjkExp(P.cjkR5), cjkExp(P.cjkR5), cjkExp(P.cjkR5), cjkExp(P.cjkR5)],
      };
      const slotBad = [];
      Object.keys(expWs).forEach((bid) => {
        const items = itemsOf(byId(bid));
        if (items.length !== expWs[bid].length) slotBad.push(`${bid} 列数 ${items.length} ≠ 期望 ${expWs[bid].length}`);
        expWs[bid].forEach((exp, k) => {
          const it = items[k];
          if (!it) { slotBad.push(`${bid}#${k} 缺`); return; }
          if (!near(it.dw, exp, 0.02)) slotBad.push(`${bid}#${k}(${it.cand}) 实测 ${it.dw} ≠ 期望 ${exp}`);
        });
      });
      check(`[P] 每个「N 个全角字宽」容器宽 = 脚本自己量出的 N 字宽 ＋ ${P.epsw}px（±0.02）；${P.wR3B}px／${P.wR4C}px 两格按声明值；R1 宽容器＝真实可用宽 ${AVAIL}`,
        slotBad.length === 0, slotBad.length ? slotBad.join(' | ') : '逐档复算一致（含 R2d 窄 1px 那一列）');
      const r1w = itemsOf(byId('R1')).filter((i) => i.cand === '宽容器')[0];
      check('[P] R1「宽容器」列用的是**本视口真实可用宽**（不是压窄的容器）',
        r1w && near(r1w.dw, AVAIL, 0.02), r1w ? `${r1w.dw} vs ${AVAIL}` : '缺');

      /* [3] 逐行几何 */
      log('\n[3] 逐行实测（逐字 Range 的**墨迹盒**；dBox＝相对本列容器中心，dCol＝相对整页内容列中心，over＝越出容器）');
      const overBad = [];
      M.blocks.forEach((b) => b.items.forEach((i) => {
        if (i.clipped) return;      /* 「整条末尾」那一格：越界是**故意**的，由 [9] 单独断言 > 0 */
        if (i.overMax !== null && i.overMax > 0.05) overBad.push(`${b.block}/${i.cand}:${i.overMax}`);
      }));
      check('[3] 除「整条末尾（裁剪）」那一列外，**没有任何一行越出它所在的容器**（>0.05px 即失败，含最长夹具态）',
        overBad.length === 0, overBad.length ? overBad.join(' ') : '全部 ≤ 0.05px');
      const devAll = Math.max.apply(null, M.blocks.reduce((a, b) => a.concat(b.items.reduce((c, i) =>
        c.concat(i.clipped ? [] : i.lines.map((x) => Math.abs(x.dBox))), [])), [0]));
      check(`[3] 规则 5「两个视觉行都继承居中」：所有非裁剪盒每一行与**本列容器中心**的差 ≤ 0.5px`,
        devAll <= 0.5, `最大 |dBox| = ${r2(devAll)}px`);
      const poemDev = Math.max.apply(null, s0Lines.reduce((c, i) => c.concat(i.lines.map((x) => Math.abs(x.dCol))), [0]));
      check('[3] S0 的每一行与**整页内容列中心**的差 ≤ 0.5px', poemDev <= 0.5, `最大 |dCol| = ${r2(poemDev)}px`);
      M.blocks.forEach((b) => {
        log(`      ${b.block}（列宽 ${b.colW} · ${b.head.slice(0, 40)}）：`);
        b.items.forEach((i) => {
          if (!i.lines.length) return;
          log(`        ${String(i.cand).padEnd(9)} w=${String(i.dw).padStart(8)} ${i.lines.map((x) => `${x.n}字 L${x.l} R${x.r} W${x.w} dBox${x.dBox} dCol${x.dCol}${x.over > 0.05 ? ' OVER' + x.over : ''}`).join(' | ')}`);
        });
      });

      /* [4] 断点位置（逐字） */
      log('\n[4] 断点位置（行末字 → 行首字 ＋ 标点类别）');
      M.blocks.forEach((b) => b.items.forEach((i) => {
        if (i.lines.length > 1) log(`      ${b.block}/${i.cand}: ${brkTxt(i)}`);
      }));
      check('[4] 断点位置都用文字范围量出来了（不靠 offsetHeight 猜）',
        M.blocks.every((b) => b.items.every((i) => i.lines.length === 0 || typeof i.lines[0].r === 'number')));

      /* [5] 页面模型 == 页面渲染 */
      const selfBad = [];
      M.blocks.forEach((b) => b.items.forEach((i) => {
        if (i.model === null) return;
        if (i.model.join('|') !== textsOf(i).join('|')) {
          selfBad.push(`${b.block}/${i.cand}: 渲染 ${textsOf(i).join('|')} ≠ 自报模型 ${i.model.join('|')}`);
        }
      }));
      check('[5] **页面模型 == 页面渲染**：每个自带模型的盒子，渲染出来的每一行逐字等于它自报的 data-model',
        selfBad.length === 0, selfBad.length ? selfBad.join(' ; ') : '逐字一致');

      /* [6] [B] 注入页面的独立复算 == 实测；[C] Node 侧独立复算 == 实测 */
      const allChars = new Set();
      M.blocks.forEach((b) => b.items.forEach((i) => { for (const ch of i.text) allChars.add(ch); }));
      const advMapJson = await js(`(function(){
        var out = {}, cs = ${JSON.stringify([...allChars].join(''))};
        for (var i = 0; i < cs.length; i += 1) out[cs.charAt(i)] = window.__qbr.adv(cs.charAt(i));
        return JSON.stringify(out);
      })()`);
      const advMap = JSON.parse(advMapJson);
      const bBad = [], cBad = [];
      for (const b of M.blocks) {
        for (const i of b.items) {
          if (i.model === null) continue;                        /* 只有自带模型的盒子可比 */
          const opt = { sel: i.sel || 'last', kin: i.kin !== '0', noTok: i.notok };
          const bAll = JSON.parse(await js(`JSON.stringify(window.__qbr.lines(${JSON.stringify(i.text)}, ${i.dw}, ${JSON.stringify(opt)}))`));
          const cAll = slotLines(i.text, i.dw, advMap, opt);
          const bl = i.firstOnly ? bAll.slice(0, 1) : bAll;
          const cl = i.firstOnly ? cAll.slice(0, 1) : cAll;
          if (bl.join('|') !== textsOf(i).join('|')) {
            bBad.push(`${b.block}/${i.cand}: [B]${bl.join('|')} ≠ 实测 ${textsOf(i).join('|')}（w=${i.dw} ${JSON.stringify(opt)}）`);
          }
          if (cl.join('|') !== textsOf(i).join('|')) {
            cBad.push(`${b.block}/${i.cand}: [C]${cl.join('|')} ≠ 实测 ${textsOf(i).join('|')}（w=${i.dw} ${JSON.stringify(opt)}）`);
          }
        }
      }
      check('[6] **[B] 注入页面的独立复算 == 实测**（另建量宽台、另写一份规则实现，逐行比对）',
        bBad.length === 0, bBad.length ? bBad.join(' ; ') : '逐字一致（全部自带模型的盒子）');
      check('[6] **[C] Node 侧独立复算 == 实测**（每字推进宽单独取回，在 Node 里**求和**判放得下）',
        cBad.length === 0, cBad.length ? cBad.join(' ; ') : '逐字一致（全部自带模型的盒子）');

      /* [8] R1 规则 1 */
      const r1n = itemsOf(byId('R1')).filter((i) => i.cand === '窄容器')[0];
      check('[8] R1（规则 1）：宽容器 ⇒ **1 行**（真实原文第 1 行原封不动，一个字都没动）',
        r1w && r1w.lines.length === 1 && textsOf(r1w).join('') === FX.r1,
        r1w ? `${r1w.lines.length} 行「${textsOf(r1w).join('')}」` : '缺');
      check('[8] R1：窄容器 ⇒ **2 行**「行行重行行，／与君生别离。」＝用户给过的那个例子（规则 2 取第 6 字后的「，」）',
        r1n && r1n.lines.length === 2 && textsOf(r1n).join('|') === ['行行重行行，', '与君生别离。'].join('|') &&
        r1n.lines.map((x) => x.n).join('/') === '6/6',
        r1n ? `${textsOf(r1n).join('｜')}（${r1n.lines.map((x) => x.n).join('/')}）` : '缺');

      /* [9] R2 规则 2 */
      const r2a = ['①已选', '②rank', '③末尾'].map((c, k) => itemsOf(byId('R2'))[k]);
      const r2b = ['①已选', '②rank', '③末尾'].map((c, k) => itemsOf(byId('R2'))[3 + k]);
      const firstBreak = (i) => (i.lines.length
        ? { after: i.lines[0].n, endChar: i.lines[0].t.slice(-1), startChar: i.text.charAt(i.lines[0].n) }
        : null);
      const bpA = r2a.map(firstBreak), bpB = r2b.map(firstBreak);
      check('[9] R2（r2a）同一容器下三个第一行断点**互不相同**：① 最后可用「、」第 4 字后／② rank 表「。」第 2 字后／③ 整条末尾「，」第 11 字后',
        r2a.length === 3 && bpA.every(Boolean) &&
        bpA[0].after === 4 && bpA[0].endChar === '、' &&
        bpA[1].after === 2 && bpA[1].endChar === '。' &&
        bpA[2].after === 11 && bpA[2].endChar === '，' &&
        bpA[0].after !== bpA[1].after && bpA[1].after !== bpA[2].after && bpA[0].after !== bpA[2].after,
        r2a.map((i, k) => `${i && i.cand}: 第${bpA[k] && bpA[k].after}字后「${bpA[k] && bpA[k].endChar}」`).join(' ／ '));
      check('[9] R2（r2a）① 是**完整**渲染（3 行 4／7／2），② 只画第一行（对照列），③ 只画第一行且**越出容器 > 0**',
        r2a[0] && r2a[0].lines.length === 3 && r2a[0].lines.map((x) => x.n).join('/') === '4/7/2' &&
        r2a[0].lines.map((x) => x.t).join('') === FX.r2a &&
        r2a[1] && r2a[1].lines.length === 1 && r2a[2] && r2a[2].lines.length === 1 &&
        r2a[1].overMax <= 0.05 && r2a[2].overMax > 0.05 && r2a[2].clipped,
        `① ${r2a[0] && textsOf(r2a[0]).join('｜')}；② 越出 ${r2a[1] && r2a[1].overMax}；③ 越出 ${r2a[2] && r2a[2].overMax}（整行宽 ${r2a[2] && r2a[2].lines[0].w}，容器 ${r2a[2] && r2a[2].dw}）`);
      check('[9] R2（r2b）①＝②＝第 8 字后「。」（这里两档刚好一致），③＝第 10 字后「…」且**越界** —— 说明「不取越界的整条末尾」',
        r2b.length === 3 && bpB.every(Boolean) && bpB[0].after === 8 && bpB[0].endChar === '。' &&
        bpB[1].after === 8 && bpB[2].after === 10 && bpB[2].endChar === '…' &&
        r2b[2].overMax > 0.05 && r2b[0].lines.map((x) => x.t).join('') === FX.r2b,
        r2b.map((i, k) => `${i && i.cand}: 第${bpB[k] && bpB[k].after}字后「${bpB[k] && bpB[k].endChar}」越出${i && i.overMax}`).join(' ／ '));
      check('[9] R2 的 ① 列**没有**任何一行以收尾标点起行（规则 4 在句读断点上也成立）',
        r2a[0] && r2a[0].lines.every((x, k) => k === 0 || !isCloseC(x.t.charAt(0))),
        r2a[0] ? textsOf(r2a[0]).join('｜') : '缺');

      /* [10] R2d 边界例 */
      const rf = firstOf('R2d', '恰好放下'), rn = itemsOf(byId('R2d'))[1];
      const bpF = rf && firstBreak(rf), bpN = rn && firstBreak(rn);
      check('[10] R2d（边界例）：容器**刚好**放得下「。」⇒ 第一行断在第 8 字后「。」（整行 8 字＝' + r2(8 * ADV) + 'px）',
        rf && bpF && bpF.after === 8 && bpF.endChar === '。' &&
        near(rf.dw, 8 * ADV + P.epsw, 0.03) && rf.lines[0].n === 8,
        rf ? `第一行 ${rf.lines[0].n} 字、断在第 ${bpF && bpF.after} 字后「${bpF && bpF.endChar}」，容器 ${rf.dw}` : '缺');
      check(`[10] R2d：容器窄 ${P.edgeDelta}px ⇒ 「。」放不下 ⇒ 断点**前移**到第 6 字后「、」，且两列**都没有溢出**`,
        rn && bpN && bpN.after === 6 && bpN.endChar === '、' &&
        near(rn.dw, rf.dw - P.edgeDelta, 0.02) &&
        rf.lines.map((x) => x.t).join('') === FX.r2c && rn.lines.map((x) => x.t).join('') === FX.r2c &&
        rf.overMax <= 0.05 && rn.overMax <= 0.05 && rf.lines.length === 2 && rn.lines.length === 2,
        rn ? `第一行 ${rn.lines[0].n} 字、断在第 ${bpN.after} 字后「${bpN.endChar}」；越出 ${rf.overMax}／${rn.overMax}` : '缺');

      /* [11] R3 规则 3 */
      const r3a1 = firstOf('R3', 'a①'), r3b1 = firstOf('R3', 'b①'), r3b2 = firstOf('R3', 'b②'), r3c1 = firstOf('R3', 'c①');
      check('[11] R3-a①（14 字**完全无标点**，容器 6 字宽）：退到行尾字符断 ⇒ 6／6／2，且拼回与夹具逐字相同',
        r3a1 && r3a1.lines.map((x) => x.n).join('/') === '6/6/2' &&
        textsOf(r3a1).join('') === FX.r3a && r3a1.overMax <= 0.05,
        r3a1 ? textsOf(r3a1).join('｜') + `（${r3a1.lines.map((x) => x.n).join('/')}）` : '缺');
      const insideLatin = r3b1 && isLatinCh(r3b1.lines[0].t.slice(-1)) && isLatinCh(FX.r3b.charAt(r3b1.lines[0].n));
      check(`[11] R3-b①（含西文 ABC，容器 ${P.wR3B}px）：**已选字面读法**的断点落在**西文串内部**（末字「${r3b1 && r3b1.lines[0].t.slice(-1)}」与下一字「${r3b1 && FX.r3b.charAt(r3b1.lines[0].n)}」都是字母）`,
        r3b1 && insideLatin && textsOf(r3b1).join('') === FX.r3b && r3b1.overMax <= 0.05,
        r3b1 ? textsOf(r3b1).join('｜') : '缺');
      check('[11] R3-b②（**候选、未采纳**：不拆西文串）：断点回退到串首 ⇒ 第一行「甲乙丙」，与 b① 不同',
        r3b2 && r3b2.lines[0].t === '甲乙丙' && textsOf(r3b2).join('') === FX.r3b &&
        r3b1.lines[0].t !== r3b2.lines[0].t,
        r3b2 ? `${textsOf(r3b2).join('｜')}（≠ b① ${r3b1.lines[0].t}）` : '缺');
      check('[11] R3-c①（一对「」，容器 5 字宽）：引号**内**照断，且没有任何一行以收尾标点起行／以开局标点收尾',
        r3c1 && textsOf(r3c1).join('') === FX.r3c &&
        r3c1.lines.every((x, k) => k === 0 || !isCloseC(x.t.charAt(0))) &&
        r3c1.lines.every((x, k) => k + 1 === r3c1.lines.length || !isOpenC(x.t.slice(-1))) && r3c1.overMax <= 0.05,
        r3c1 ? textsOf(r3c1).join('｜') : '缺');
      check('[11] 真实内容（源文件正文 8 行）里**没有一个西文／数字** ⇒ 「不拆西文串」这条候选在**真实内容**上不会产生差别（b①／b② 只在夹具上不同）',
        !/[0-9A-Za-z]/.test(mdFlat.join('')), `8 行里的 ASCII 字母/数字数 = ${(mdFlat.join('').match(/[0-9A-Za-z]/g) || []).length}`);

      /* [12] R3B 规则 3（半句仍超宽） */
      const r3Bw = firstOf('R3B', '宽容器'), r3Bn = itemsOf(byId('R3B'))[1];
      check('[12] R3B 宽容器（12 字宽）：两个半句都放得下 ⇒ **只在句读处断** 9／8（第一行末字是「，」＝标点归前句）',
        r3Bw && r3Bw.lines.map((x) => x.n).join('/') === '9/8' &&
        r3Bw.lines[0].t.slice(-1) === '，' && r3Bw.lines[0].t.charAt(0) === '甲' &&
        textsOf(r3Bw).join('') === FX.r3B && r3Bw.overMax <= 0.05,
        r3Bw ? textsOf(r3Bw).join('｜') + `（${r3Bw.lines.map((x) => x.n).join('/')}）` : '缺');
      check('[12] R3B 窄容器（5 字宽）：半句本身超宽 ⇒ **退到行尾字符断**、余文续行 ⇒ 5／4／5／3；' +
        '第一行 5 字（无标点可用）、第二行断在第 9 字后「，」',
        r3Bn && r3Bn.lines.map((x) => x.n).join('/') === '5/4/5/3' &&
        r3Bn.lines[1].t.slice(-1) === '，' && r3Bn.lines[0].t === '甲乙丙丁戊',
        r3Bn ? textsOf(r3Bn).join('｜') + `（${r3Bn.lines.map((x) => x.n).join('/')}）` : '缺');
      check('[12] R3B：两列的**余文拼回**与夹具逐字相同（不删除、不截断）；**没有任何一行溢出**（含最长夹具态）；' +
        '行首没有收尾标点、行尾没有开局标点',
        r3Bw && r3Bn && r3Bw.lines.map((x) => x.t).join('') === FX.r3B && r3Bn.lines.map((x) => x.t).join('') === FX.r3B &&
        r3Bw.overMax <= 0.05 && r3Bn.overMax <= 0.05 &&
        [r3Bw, r3Bn].every((i) => i.lines.every((x, k) => k === 0 || !isCloseC(x.t.charAt(0)))),
        `拼回＝「${r3Bn && r3Bn.lines.map((x) => x.t).join('')}」；越出最大 ${r3Bn && Math.max(r3Bw.overMax, r3Bn.overMax)}px`);
      check('[12] R3B：窄容器那 4 行**都不是**被截断的（没有一行以「…」结尾、没有省略号被塞进溢出行），' +
        '唯一含「…」的夹具是 r2b 且它在 R2 块里',
        r3Bn && r3Bn.lines.every((x) => x.t.indexOf('…') < 0) &&
        (r3Bn.lines.map((x) => x.t).join('') === FX.r3B),
        r3Bn ? JSON.stringify(textsOf(r3Bn)) : '缺');

      /* [13] R4 禁则 */
      const r4aON = firstOf('R4', '①ON'), r4aOFF = itemsOf(byId('R4'))[1], r4aBr = itemsOf(byId('R4'))[2];
      const r4bON = itemsOf(byId('R4'))[3], r4bOFF = itemsOf(byId('R4'))[4];
      const r4cON = itemsOf(byId('R4'))[5], r4cOFF = itemsOf(byId('R4'))[6];
      const violOf = (i) => {
        const t = textsOf(i), o = [];
        t.forEach((s, k) => {
          if (k > 0 && isCloseC(s.charAt(0))) o.push(`行${k + 1}首字「${s.charAt(0)}」是收尾标点`);
          if (k + 1 < t.length && isOpenC(s.slice(-1))) o.push(`行${k + 1}末字「${s.slice(-1)}」是开局标点`);
        });
        return o;
      };
      check('[13] R4-a①（禁则 ON）：断点**前移一位**（第 5 字后 → 第 4 字后）⇒「戊」连「，」一起下移；行首无收尾标点',
        r4aON && r4aON.lines.map((x) => x.n).join('/') === '4/5' &&
        r4aON.lines[0].t === '甲乙丙丁' && r4aON.lines[1].t === '戊，己庚辛' && violOf(r4aON).length === 0,
        r4aON ? textsOf(r4aON).join('｜') : '缺');
      check('[13] R4-a②（**反例**：同一模型只关掉禁则）⇒ **「，」起行**（违反规则 4）—— 这就是禁则真的在工作的证据',
        r4aOFF && r4aOFF.lines.map((x) => x.n).join('/') === '5/4' && r4aOFF.lines[1].t.charAt(0) === '，' &&
        violOf(r4aOFF).length > 0,
        r4aOFF ? `${textsOf(r4aOFF).join('｜')} ⇒ ${JSON.stringify(violOf(r4aOFF))}` : '缺');
      check('[13] R4-a③（浏览器默认、不施禁则 line-break:anywhere）与 ② **逐字相同**（自证「关掉禁则」这件事复现了）',
        r4aBr && r4aOFF && textsOf(r4aBr).join('|') === textsOf(r4aOFF).join('|') &&
        r4aBr.lines[1].t.charAt(0) === '，',
        r4aBr ? textsOf(r4aBr).join('｜') : '缺');
      check('[13] R4-b（收尾类「）」）：① ON 不起行（行 2 首字「戊」）／② OFF「）」起行',
        r4bON && r4bOFF && violOf(r4bON).length === 0 && r4bOFF.lines[1].t.charAt(0) === '）' &&
        violOf(r4bOFF).length > 0 && textsOf(r4bON).join('') === FX.r4b && textsOf(r4bOFF).join('') === FX.r4b,
        r4bON && r4bOFF ? `ON ${textsOf(r4bON).join('｜')} ／ OFF ${textsOf(r4bOFF).join('｜')}` : '缺');
      check('[13] R4-c（开局类「（」）：① ON 断点前移（首行「甲乙」，不留「（」在行尾）／② OFF 把「（」留在行尾（违反禁则的另一半）',
        r4cON && r4cOFF && r4cON.lines[0].t === '甲乙' && violOf(r4cON).length === 0 &&
        isOpenC(r4cOFF.lines[0].t.slice(-1)) && violOf(r4cOFF).length > 0,
        r4cON && r4cOFF ? `ON ${textsOf(r4cON).join('｜')} ／ OFF ${textsOf(r4cOFF).join('｜')} ⇒ ${JSON.stringify(violOf(r4cOFF))}` : '缺');

      /* [14] R5 实现代价 */
      const r5 = itemsOf(byId('R5'));
      check('[14] R5：①（逐行 span）＝ ②（分段块）逐字相同；两列都等于规则给出的 6／5「甲乙丙丁戊，／己庚辛壬癸」',
        r5.length === 4 && textsOf(r5[0]).join('|') === textsOf(r5[1]).join('|') &&
        r5[0].lines.map((x) => x.n).join('/') === '6/5' &&
        textsOf(r5[0]).join('') === FX.r5 && r5[0].lines[0].t === '甲乙丙丁戊，',
        r5[0] ? textsOf(r5[0]).join('｜') : '缺');
      check('[14] R5：③（读回浏览器断点）＝ ④（纯 CSS strict），且**与 ① 不同**（8／3）⇒ 这两条路拿不到规则 2 的断点',
        r5.length === 4 && textsOf(r5[2]).join('|') === textsOf(r5[3]).join('|') &&
        textsOf(r5[2]).join('|') !== textsOf(r5[0]).join('|') && r5[2].lines.map((x) => x.n).join('/') === '8/3',
        r5[2] ? `③ ${textsOf(r5[2]).join('｜')}（${r5[2].lines.map((x) => x.n).join('/')}）≠ ① ${textsOf(r5[0]).join('｜')}` : '缺');

      /* [15] 字号不缩放 */
      fontBag.push({ k: C.key, poem: M.fonts.poem, title: M.fonts.title, ident: M.fonts.ident });
      check(`[15] 正文 ${M.fonts.poem.fontSize}/${M.fonts.poem.lineHeight}/${M.fonts.poem.letterSpacing}、` +
        `题名 ${M.fonts.title.fontSize}、身份行 ${M.fonts.ident.fontSize} 与本视口无关`,
        M.fonts.poem.fontSize === '17px' && M.fonts.poem.lineHeight === '34px' && M.fonts.poem.letterSpacing === '0.765px' &&
        M.fonts.title.fontSize === '24px' && M.fonts.ident.fontSize === '12.48px',
        `${M.fonts.poem.fontSize} / ${M.fonts.poem.lineHeight} / ${M.fonts.poem.letterSpacing}`);

      /* 页面自报 = 独立实测（抽查） */
      /* 页面自报 = 独立实测（抽查） */
      const markerLeak = await js(`(function(){
        var d = document.querySelector('[data-shotframe]'), t = d ? d.textContent : '';
        return JSON.stringify({ star: t.indexOf('**') >= 0, code: t.indexOf('<code>') >= 0, span: t.indexOf('<span>') >= 0 });
      })()`);
      const ML = JSON.parse(markerLeak);
      check('[15] 图内的文字里**没有漏渲染的标记**（没有字面的 **／<code>／<span>）—— 块标题、列标签、夹具横幅都走 rich 渲染',
        !ML.star && !ML.code && !ML.span, JSON.stringify(ML));
      check('[15] 页面自报的数字 = 本脚本独立实测（±0.02px），且每块都带 data-m-* 标记',
        near(Number(M.charAdvP), ADV, 0.02) && near(Number(byId('R2').capData['data-m-narroww']), cjkExp(P.cjkR2), 0.03) &&
        ['S0', 'R1', 'R2', 'R2d', 'R3', 'R3B', 'R4', 'R5'].every((k) => Object.keys((byId(k) || {}).capData || {}).length > 0),
        `charAdvance 自报 ${M.charAdvP}（实测 ${r2(ADV)}）；R2 窄容器自报 ${byId('R2').capData['data-m-narroww']}`);

      rowsOut.push({
        key: C.key, w: W, cw: r2(cw), avail: AVAIL, docW: M.docW, deckH: M.deck.h,
        r1wide: r1w.lines.length, r1narrow: r1n.lines.map((x) => x.n).join('/'),
        r2a: r2a.map((i) => `${i.lines[0].n}${i.lines[0].t.slice(-1)}`).join('/'),
        r2b: r2b.map((i) => `${i.lines[0].n}${i.lines[0].t.slice(-1)}`).join('/'),
        r2d: `${rf.lines[0].n}${rf.lines[0].t.slice(-1)}→${rn.lines[0].n}${rn.lines[0].t.slice(-1)}`,
        r3a: r3a1.lines.map((x) => x.n).join('/'),
        r3b: `${r3b1.lines[0].t}/${r3b2.lines[0].t}`,
        r3B: `${r3Bw.lines.map((x) => x.n).join('/')} | ${r3Bn.lines.map((x) => x.n).join('/')}`,
        r3Bover: Math.max(r3Bw.overMax, r3Bn.overMax),
        r4a: `${r4aON.lines.map((x) => x.n).join('/')} | ${r4aOFF.lines.map((x) => x.n).join('/')}`,
        r5: `${r5[0].lines.map((x) => x.n).join('/')} | ${r5[2].lines.map((x) => x.n).join('/')}`,
      });

      /* [16] PNG */
      if (!SHOT) { log('\n[16] 已跳过（--no-shot）：不查看图态、不重出 PNG'); continue; }
      await send('Page.navigate', { url: 'about:blank' });
      await sleep(150);
      await load(url + '#shot', W, H, C.mobile);
      const S = await measure();
      check('[16] 看图态：#shot 只隐去说明性文字；块结构与排布数字与普通态一致',
        S.shot === true && S.blocks.length === M.blocks.length &&
        S.blocks.every((b, i) => b.block === M.blocks[i].block && near(b.colW, M.blocks[i].colW, 0.02)),
        `shot=${S.shot}；${S.blocks.length} 块列宽与普通态一致`);
      check(`[16] 看图态仍无横向溢出（docW = ${W}）`, S.docW === W && S.maxRight <= W + 0.5,
        `docW=${S.docW} maxRight=${S.maxRight}`);
      /* 先量高度，再决定拆不拆 */
      const deckTop = S.deck.y, deckH = S.deck.h;
      const blocksY = S.blocks.map((b) => ({ top: b.top, bottom: b.bottom }));
      const parts = [];
      let start = deckTop;
      for (const bl of blocksY) {
        if (bl.bottom - start <= MAX_SHOT_CSS) continue;
        const cut = (bl.top - start > 40) ? bl.top : (start + MAX_SHOT_CSS);   /* 单块过高一刀切在 MAX 处 */
        parts.push({ y: start, h: r2(cut - start) });
        start = cut;
      }
      parts.push({ y: start, h: r2(deckTop + deckH - start) });
      const partsH = parts.reduce((a, p) => a + p.h, 0);
      log(`\n[16] 截图区（先量高度）：${r2(deckH)} CSS px ⇒ ${r2(deckH * 2)} 设备 px；上限 ${PNG_HARD_LIMIT}` +
        ` ⇒ 拆成 ${parts.length} 张（单张 ≤ ${MAX_SHOT_CSS} CSS px）`);
      check('[16] 每张的**高度先量过**且在单张上限内（超过就按块边界拆图，不假装拍到）',
        parts.every((p) => p.h <= MAX_SHOT_CSS + 0.01 && p.h > 0),
        parts.map((p, i) => `#${i + 1} y=${p.y} h=${p.h}`).join(' '));
      check('[16] 各张高度之和 == 截图区高度（正好铺满、不重不漏）',
        near(partsH, deckH, 0.05), `Σ${r2(partsH)} vs ${r2(deckH)}`);
      for (let pi = 0; pi < parts.length; pi += 1) {
        const p = parts[pi];
        const name = parts.length === 1 ? `q-break-rules.${C.key}.png` : `q-break-rules.${C.key}.part${pi + 1}.png`;
        const pngPath = join(OUT, name);
        const shot = await send('Page.captureScreenshot', {
          format: 'png', captureBeyondViewport: true,
          clip: { x: 0, y: p.y, width: W, height: p.h, scale: 1 },
        });
        writeFileSync(pngPath, Buffer.from(shot.data, 'base64'));
        const buf = readFileSync(pngPath);
        const size = pngSize(buf);
        log(`      ${name}：clip y=${p.y} h=${p.h} → 像素 ${size.w}×${size.h}，${statSync(pngPath).size} 字节`);
        check(`[16] ${name} 像素宽 = 视口宽 × 2 = ${W * 2}（真实 CSS px @DPR 2，不是缩放图、不是拼图）`,
          size.w === W * 2, `实测 ${size.w}`);
        check(`[16] ${name} 像素高 = 该张截图区高 × 2（±2px）`, Math.abs(size.h - p.h * 2) <= 2,
          `实测 ${size.h}，期望 ${r2(p.h * 2)}`);
        check(`[16] ${name} 非空且高 < ${PNG_HARD_LIMIT}（没有被截断）`,
          statSync(pngPath).size > 1000 && size.h < PNG_HARD_LIMIT,
          `${statSync(pngPath).size} 字节，${size.w}×${size.h}`);
      }
    }

    /* ═══ [15] 跨视口：字号不缩放 ═════════════════════════════════ */
    log('\n═══════════ [15] 跨视口：字号／行高／字距**不随宽度变** ═══════════');
    if (fontBag.length > 1) {
      const kinds = ['poem', 'title', 'ident'];
      const bad = kinds.filter((k) => new Set(fontBag.map((f) => `${f[k].fontSize}/${f[k].lineHeight}/${f[k].letterSpacing}`)).size !== 1);
      kinds.forEach((k) => {
        const vals = [...new Set(fontBag.map((f) => `${f[k].fontSize}/${f[k].lineHeight}/${f[k].letterSpacing}`))];
        log(`      ${k}: ${vals.length} 个取值 → ${vals.join('  //  ')}`);
      });
      check(`[15] ${kinds.length} 类文字在 ${fontBag.length} 个视口下只有一个取值（完全没随宽度缩放）`,
        bad.length === 0, bad.length ? bad.join(' ') : '全部恒定');
    } else {
      log('      （--only 只跑了一个视口，跨视口这条跳过）');
    }

    /* ═══ 自包含 / 无 JS 报错 ═══════════════════════════════════ */
    log('\n═══════════ [G] 自包含 ＋ 无 JS 报错 ═══════════');
    const ext = requests.filter((u) => !u.startsWith('file:///') && !u.startsWith('data:'));
    check('CDP 记录的网络请求里没有任何 http(s) 外部引用',
      ext.length === 0, `${requests.length} 个请求，非 file:// 的=${ext.length} ${JSON.stringify(ext.slice(0, 4))}`);
    check('全程无 JS 报错（加载 ＋ 各视口）', pageErrors.length === 0,
      pageErrors.length ? pageErrors.join(' | ') : '0 条');

    /* ═══ 汇总表 ═══════════════════════════════════════════════ */
    log('\n═══════════ 汇总（可直接抄进 q-break-rules.md）═══════════');
    rowsOut.forEach((r) => {
      log(`  ${r.key}: C=${r.cw} 可用宽=${r.avail} | R1 宽=${r.r1wide}行 窄=${r.r1narrow} | R2a 第一行断点 ${r.r2a} | R2b ${r.r2b}` +
        ` | R2d ${r.r2d} | R3a ${r.r3a} | R3b ${r.r3b} | R3B ${r.r3B} 越出=${r.r3Bover} | R4 ${r.r4a} | R5 ${r.r5} | docW=${r.docW} 截图区=${r2(r.deckH)}`);
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
