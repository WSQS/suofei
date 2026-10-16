/*
 * check-poem-align.mjs —— 「诗页（阅读页）水平对齐」讨论原型的【页面行为 + 水平几何】自证脚本（可复跑）。
 *
 * ⚠ 它验的是这一个原型页面的页面行为，**不是产品代码**：
 *   对象只有本目录下的 q-poem-align.html（**只读打开**：Page.navigate 到 file:// URL，脚本不写、不改它）。
 *   它不跑 web/ 与 android/ 的任何测试，也不读产品实现。额外读的文件只有两个，都是**只读**：
 *     ① prototype/css/theme-tech.css  —— 用来逐项比对页面内嵌的令牌快照（权威仍是 docs/design/visual-tokens.md）；
 *     ② content/poems/gushi-shijiu-shou-01.md —— 用它的正文 8 行做「原文逐行一致」的基准。
 *
 * 它断言什么（失败任一即 exit 1；全部在 **430 宽、DPR 2** 下量）：
 *  [1] 结构：**4 个维度组**（d1 4 块 / d2 3 块 / d3 2 块 / d4 4 块，共 **13 块**）；每块一个页面实例，实例必有
 *      题名／身份行／返回（恰 1）／详情（恰 1）／原文 8 行（**唯一例外**：d4-fx-line 多一行夹具长句 ⇒ 9 行、2 段）；
 *      **正文之后没有页脚行**（`[data-test="foot"]` 全页 0 个）；
 *      原文前 8 行逐行＝源文件 8 行；身份行＝「佚名 · 汉 · 五言古诗」；d1／d2 的题名＝真实题名，d3／d4-fx-title 的题名是**夹具**
 *      （≠真实题名、自身写明「不是真实数据」），d4-fx-line 多出来那一行也是**夹具长句**（自身写明「不是真实数据」）。
 *      反向断言：应用层文本里不出现 细时代／底本／来源／异文／文选／李善／搜索；
 *      **整页可见文本里没有「笔记」二字**，`[data-test="notes"]` 用 querySelector 查 **为 null**（本轮不收那个入口，也不留占位）。
 *  [2] 430 真实验收：`innerWidth === 430 === documentElement.scrollWidth === body.scrollWidth`；所有可见元素的矩形、
 *      以及**所有文本矩形**（Range 逐行量的字形范围）都在 0…430 之内；13 个块**各恰 430 宽、左沿 0**；13 个页面实例同样。
 *  [3] 排版权重：题名 24px/500/字距 2.4px；身份行 12.48px + --text-faint；原文 17px/行高 34px/字距 0.765px；
 *      控件 13.12px/--text-dim/无边框无底色；且 13 个实例**完全一致**（本轮固定）。
 *  [4] 固定不变的纵向几何：13 个实例一律 题名→身份 11.2px、身份→原文首行 33.6px、顶部行顶到题名顶的差**同一个值**
 *      ⇒ 四个维度里动的只有水平方向（这是「逐维度干净对照」的实测依据）。
 *  [5] 维度一（左沿关系，4 块实测）：① 基线 题名/身份行/正文首行 左沿都是 16.8px；
 *      ② 题名更左 0px（身份行/正文仍 16.8px）；③ 题名更右 50.8px（＝16.8＋2 字符 34px）；④ 正文首行缩进 2 字符 ⇒ 50.8px，
 *      正文其余行 16.8px，题名/身份行仍 16.8px。四块的内容右沿都 ≤ 413.2px（不挤进右内沿）。
 *  [6] 维度二（顶部行内沿，3 块实测）：① 基线 返回左沿 16.8px／详情右沿 413.2px（与内容内沿差 0）；
 *      ② 更靠外 0px／430px（各向外 16.8px）；③ 更靠内 33.6px／396.4px（各向内 16.8px）；
 *      三块的内容三块左沿不动（仍 16.8px），顶部行**纵向位置也同一值**（只动水平）。
 *  [7] 维度三（长题名折行，夹具块 2 块实测）：夹具题名折成**恰好 2 行**（"第二行"才有意义）；
 *      ① 基线 第二行左沿 ＝ 首行左沿 ＝ 16.8px（同一竖线），身份行/正文首行也 16.8px；
 *      ② 悬挂缩进 第二行左沿 ＝ 50.8px（＝16.8＋34px），首行/身份行/正文首行仍 16.8px；
 *      两块都有醒目标注的夹具横幅（含「夹具」「不是真实数据」），且正文仍是真实文本 8 行。
 *  [8] 水平几何总表：每块打印 题名/身份行/正文/顶部行 的**左右沿**、顶部行与内容内沿的差、折行第二行左沿、
 *      行长与右沿余量（右沿余量 ＝ 内容右沿 413.2px − 该行文本右沿）。
 *  [9] 语义：可点元素必须是 `<a>` 或 `<button type="button">`，无内联 onclick，控件中心点 elementFromPoint 命中自身。
 *  [10] 自包含：CDP Network 里非 file:// 请求 0 个；页面文本无 `<link`／`src=`／`@import`／`http(s)://`；全程无 JS 报错。
 *  [11] 令牌快照逐项比对：快照里每个令牌与 prototype/css/theme-tech.css **同名值逐字相同**（不一致数必须 0）；
 *      没有「声明了却没用」的令牌，页面用到的每个 `var(--x)` 都有声明；并打印页内记录的短 sha / 当前 HEAD / 该 css 是否干净。
 *  [12] **维度四（居中范围，4 块实测）**：④a `d4-all` 全部居中 —— 题名（逐视觉行）／身份行／正文**每一行**的文字中心
 *      ≈ **列中心 215px**（＝[16.8, 413.2] 的中点）；④b `d4-head` 仅题头居中 —— 题名/身份行居中、**正文逐行与维度一① 基线完全一致**；
 *      ④d `d4-fx-title` 长夹具题名折 2 行、**两行各自居中**；④e `d4-fx-line` 夹具长句在 430 下折成**恰好 2 个视觉行**、
 *      **两行各自居中**（逐视觉行打印 左沿/右沿/中心）；且四块的**顶部行左右沿一点不变**（16.8／413.2 —— 居中不作用于顶部行）。
 *  [13] 430 图：`#shot` 看图模式**只显示一条横幅**（不改排布）；截图 `q-poem-align.430.png`，PNG 头里的宽必须 ＝ **860px**（430×DPR2）。
 *  [14] 宽屏 1180：仍无横向溢出，13 块仍固定 430 宽。
 *  [15] **边界（两种「找不到就如实退出，不假装通过」，都是真的把本脚本再跑一遍）**：
 *      a. `CHROME_BIN` 指到一个不存在的路径 ⇒ 子进程必须 **exit 2** 并在 stderr 写「找不到无头 Chromium」；
 *      b. 把脚本拷到**仓库外**再跑（向上找不到 `prototype/css/theme-tech.css`）⇒ 子进程必须 **exit 2** 并在 stderr 写「找不到仓库根」。
 *
 * 怎么跑：
 *   CHROME_BIN='C:/Users/wsqsy/AppData/Local/Chromium/Application/chrome.exe' \
 *     node items/app-ui/prototypes/check-poem-align.mjs
 *   node items/app-ui/prototypes/check-poem-align.mjs --no-shot        # 只跑断言，不重出 PNG
 *   node items/app-ui/prototypes/check-poem-align.mjs --no-boundary    # 跳过 [15] 的自调子进程
 * 需要什么：
 *   - Node（用内置 fetch／WebSocket／net，本机实测 v25.9.0 通过）；
 *   - **本机无头 Chromium 的可执行文件**：环境变量 `CHROME_BIN` → 否则按
 *     `%LOCALAPPDATA%\Chromium\Application\chrome.exe` 推。找不到就**如实报错 exit 2**（CHROME_BIN 指错路径也走这条）。
 *   - 不需要任何 npm 依赖；不联网；不起静态服务（直接 file://）。
 *   - **端口**：CDP 调试端口**先向内核要一个空闲端口**（net 监听 0 再关掉），**不写死**
 *     —— 本仓真的发生过「两边同时跑同一套 e2e、浏览器连到了别人的服务」。
 *   - **仓库根不写死层级**：从本脚本所在目录**逐级向上找** `prototype/css/theme-tech.css`，找到那一级就是仓库根；
 *     找不到就**如实报错 exit 2**（本仓发生过：脚本写死 `../../..`，材料一搬进 `history/` 就指到错目录、ENOENT）。
 *
 * 副作用：
 *   - 在临时目录建一个 Chromium profile，结束时删掉；
 *   - **默认会重写**本目录下的 `q-poem-align.430.png`（不同 Chromium/字体渲染会让字节数变化，属正常）；只看断言加 `--no-shot`；
 *   - q-poem-align.html **只读打开**，不写、不改；脚本不碰 content/ 与其他原型文件。
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, statSync, existsSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const SELF = fileURLToPath(import.meta.url);
const OUT = dirname(SELF);                     // 本脚本所在目录＝原型目录
// 仓库根**不写死层级**：向上找 prototype/css/theme-tech.css（找到那一级就是根）。
function findRoot(start) {
  let d = start;
  for (let i = 0; i < 16; i++) {
    if (existsSync(join(d, 'prototype', 'css', 'theme-tech.css'))) return d;
    const up = dirname(d);
    if (up === d) break;
    d = up;
  }
  return null;
}
const ROOT = findRoot(OUT);
if (!ROOT) {
  console.error('从脚本所在目录向上找不到仓库根（判据：存在 prototype/css/theme-tech.css）：' + OUT);
  console.error('本脚本不写死相对层级 —— 材料被搬走后也能自己找到根；找不到就如实退出，不假装通过。');
  process.exit(2);
}
const SHOT = !process.argv.includes('--no-shot');
const BOUNDARY = !process.argv.includes('--no-boundary');
const W = 430;                                 // 真实 430 CSS px
const DPR = 2;                                 // 图：860 px 宽
const HTML_PATH = join(OUT, 'q-poem-align.html');
const PNG_PATH = join(OUT, 'q-poem-align.430.png');
const MD_PATH = join(ROOT, 'content', 'poems', 'gushi-shijiu-shou-01.md');

// ── 本页的口径（都是「草案值／固定值」的推导结果，见 q-poem-align.html 的 DRAFT-VALUES）──
const EDGE = 16.8;          // --edge-x = 1.05rem：内容左右内沿
const CONTENT_RIGHT = W - EDGE;   // 413.2：内容右沿
const COL_CENTER = (EDGE + CONTENT_RIGHT) / 2;   // 215.0：内容列的中点（＝「列中心」，两边刚好对称）
const UNIT2 = 34;           // --indent-2ch = 2 × 17px：「2 字符」= 34px
const TOL = 0.6;            // 左沿／行高等的容差
const TOL_R = 1.0;          // 右沿（控件尾部字距可能算进字符推进宽度）→ 松一点

// ── 找 Chromium：CHROME_BIN 优先，否则 %LOCALAPPDATA%\Chromium\Application\chrome.exe
const CHROME = process.env.CHROME_BIN
  || join(process.env.LOCALAPPDATA || '', 'Chromium', 'Application', 'chrome.exe');
if (!CHROME || !existsSync(CHROME)) {
  console.error('找不到无头 Chromium：' + (CHROME || '(未设置)'));
  console.error('请用环境变量指定，例如：');
  console.error("  CHROME_BIN='C:/Users/wsqsy/AppData/Local/Chromium/Application/chrome.exe' \\");
  console.error('    node items/app-ui/prototypes/check-poem-align.mjs');
  process.exit(2);
}

// ── 源文件基准（只读）：正文 8 行与段结构
const mdText = readFileSync(MD_PATH, 'utf8');
const mdLines = mdText.split(/\r?\n/);
let sepCount = 0, bodyStart = -1;
for (let i = 0; i < mdLines.length; i++) {
  if (mdLines[i].trim() === '---') { sepCount++; if (sepCount === 2) { bodyStart = i + 1; break; } }
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
  console.error('源文件正文不是 8 行（而是 ' + mdFlat.length + ' 行）⇒ 本轮口径变了，先看需求再改断言：' + MD_PATH);
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function freePort() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => res(p));
    });
  });
}

let failures = 0;
const log = (...a) => console.log(...a);
function check(label, ok, detail) {
  log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : '  →  ' + detail}`);
  if (!ok) failures++;
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const r1 = (n) => Math.round(n * 10) / 10;
const uniq = (a) => Array.from(new Set(a));

/* ── 令牌快照比对用的小工具（纯文本）────────────────────────────── */
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
// PNG 头里的宽高（IHDR：bytes 16..24）
function pngSize(buf) {
  if (buf.length < 24 || buf.toString('ascii', 1, 4) !== 'PNG') return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

async function run() {
  const htmlText = readFileSync(HTML_PATH, 'utf8');
  const url = 'file:///' + HTML_PATH.replace(/\\/g, '/');
  const port = await freePort();   // 自己挑空闲端口，不写死
  const profile = mkdtempSync(join(tmpdir(), 'poemalign-'));
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--disable-background-networking',
    '--disable-component-update', '--disable-sync', '--remote-allow-origins=*',
    '--user-data-dir=' + profile, '--remote-debugging-port=' + port, 'about:blank',
  ], { stdio: 'ignore' });
  log(`原型页（只读打开）：${HTML_PATH}`);
  log(`源文件基准（只读）：${MD_PATH}  段数=${mdStanzas.length} 行数=${mdFlat.length}`);
  log(`CDP 端口（内核分配的空闲端口）：${port}`);

  try {
    for (let i = 0; i < 100; i++) {
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
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
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
    async function clickAt(x, y) {
      const base = { x, y, button: 'left', buttons: 1, clickCount: 1 };
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...base });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base });
    }

    /* ── 页面读取工具 ─────────────────────────────────────────────── */
    // 关键：字形范围（不是块盒）用 Range.getClientRects() 逐行量 —— 只有它给得出「文本左右沿」。
    const geom = async () => JSON.parse(await js(`(function(){
      function rr(r){ return { left: Math.round(r.left*10)/10, right: Math.round(r.right*10)/10,
                               top: Math.round(r.top*10)/10, bottom: Math.round(r.bottom*10)/10,
                               w: Math.round(r.width*10)/10, h: Math.round(r.height*10)/10 }; }
      function elRect(e){ return e ? rr(e.getBoundingClientRect()) : null; }
      function textRects(e){
        var out = [];
        if (!e) return out;
        var w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT, null);
        var n;
        while ((n = w.nextNode())) {
          if (!n.nodeValue || n.nodeValue.trim() === '') continue;
          var r = document.createRange();
          r.selectNodeContents(n);
          var list = r.getClientRects();
          for (var i = 0; i < list.length; i++) out.push(rr(list[i]));
        }
        return out;
      }
      var out = [];
      var pages = document.querySelectorAll('[data-test="page"]');
      for (var i = 0; i < pages.length; i++) {
        var p = pages[i];
        var tEl = p.querySelector('[data-test="title"]');
        var iEl = p.querySelector('[data-test="ident"]');
        var bEl = p.querySelector('[data-test="poem"]');
        var tbEl = p.querySelector('[data-test="topbar"]');
        var lineEls = p.querySelectorAll('[data-test="line"]');
        var tBox = elRect(tEl), iBox = elRect(iEl), bBox = elRect(bEl), tbBox = elRect(tbEl);
        var pBox = p.getBoundingClientRect();
        var line1Box = elRect(lineEls[0]);
        var bodyLineTexts = Array.prototype.map.call(lineEls, function(l){ return textRects(l); });
        var minLeft = Infinity, maxRight = -Infinity;
        var all = [].concat(textRects(tEl), textRects(iEl), textRects(p.querySelector('[data-test="back"]')),
                           textRects(p.querySelector('[data-test="detail"]')));
        for (var j = 0; j < bodyLineTexts.length; j++) all = all.concat(bodyLineTexts[j]);
        for (var k = 0; k < all.length; k++) {
          if (all[k].left < minLeft) minLeft = all[k].left;
          if (all[k].right > maxRight) maxRight = all[k].right;
        }
        out.push({
          inst: p.dataset.inst, dim: p.dataset.dim, fx: p.dataset.fx || null,
          pageTop: Math.round(p.getBoundingClientRect().top*10)/10,
          styleVars: p.getAttribute('style') || '',
          inlineVarNames: (function(){ var s = p.getAttribute('style') || ''; var m = s.match(/--[A-Za-z0-9_-]+/g); return m || []; })(),
          title: tEl.textContent,
          titleLines: textRects(tEl),
          ident: textRects(iEl),
          identText: iEl.textContent,
          back: textRects(p.querySelector('[data-test="back"]')),
          detail: textRects(p.querySelector('[data-test="detail"]')),
          bodyLineBoxes: Array.prototype.map.call(lineEls, elRect),
          bodyLineTexts: bodyLineTexts,
          boxes: { title: tBox, ident: iBox, body: bBox, topbar: tbBox, line1: line1Box },
          rel: { topbar: Math.round((tbBox.top - pBox.top)*100)/100,
                 title: Math.round((tBox.top - pBox.top)*100)/100,
                 body: Math.round((bBox.top - pBox.top)*100)/100,
                 line1: Math.round((line1Box.top - pBox.top)*100)/100 },
          gaps: {
            titleToIdent: Math.round((iBox.top - tBox.bottom)*10)/10,
            identToBody: Math.round((line1Box.top - iBox.bottom)*10)/10,
            topbarToTitle: Math.round((tBox.top - tbBox.bottom)*10)/10
          },
          textMinLeft: minLeft === Infinity ? null : Math.round(minLeft*10)/10,
          textMaxRight: maxRight === -Infinity ? null : Math.round(maxRight*10)/10
        });
      }
      var insts = Array.prototype.map.call(document.querySelectorAll('[data-test="inst"]'), function(b){
        var r = b.getBoundingClientRect();
        return { inst: b.dataset.inst, dim: b.dataset.dim, w: Math.round(r.width*10)/10, left: Math.round(r.left*10)/10 };
      });
      var pg = Array.prototype.map.call(pages, function(b){
        var r = b.getBoundingClientRect();
        return { inst: b.dataset.inst, w: Math.round(r.width*10)/10, left: Math.round(r.left*10)/10 };
      });
      return JSON.stringify({ pages: out, insts: insts, pageBoxes: pg });
    })()`));

    const struct = async () => JSON.parse(await js(`(function(){
      var out = [];
      var pages = document.querySelectorAll('[data-test="page"]');
      for (var i = 0; i < pages.length; i++) {
        var p = pages[i];
        out.push({
          inst: p.dataset.inst, dim: p.dataset.dim, fx: p.dataset.fx || null,
          title: (p.querySelector('[data-test="title"]') || {}).textContent || null,
          ident: (p.querySelector('[data-test="ident"]') || {}).textContent || null,
          lines: Array.prototype.map.call(p.querySelectorAll('[data-test="line"]'), function(l){ return l.textContent; }),
          stanzas: p.querySelectorAll('.stanza').length,
          back: p.querySelectorAll('[data-test="back"]').length,
          detail: p.querySelectorAll('[data-test="detail"]').length,
          topbar: p.querySelectorAll('[data-test="topbar"]').length,
          foot: p.querySelectorAll('[data-test="foot"]').length,
          notes: p.querySelectorAll('[data-test="notes"]').length,
          notesHead: p.querySelectorAll('[data-test="notes-head"]').length,
          fxban: p.querySelectorAll('[data-test="fxban"]').length,
          fxLineCount: p.querySelectorAll('[data-test="line"][data-fx]').length,
          fxLineText: (function(){ var e = p.querySelector('[data-test="line"][data-fx]'); return e ? e.textContent : null; })(),
          text: p.innerText,
          topbarHtml: (p.querySelector('[data-test="topbar"]') || {}).innerHTML || ''
        });
      }
      return JSON.stringify(out);
    })()`));

    const styleInfo = async () => JSON.parse(await js(`(function(){
      var out = [];
      var snap = function(e){
        if (!e) return null;
        var c = getComputedStyle(e);
        return { fz: c.fontSize, fw: c.fontWeight, ls: c.letterSpacing, color: c.color, lh: c.lineHeight,
                 bg: c.backgroundColor, bt: c.borderTopWidth, bb: c.borderBottomWidth,
                 pl: c.paddingLeft, pr: c.paddingRight, ml: c.marginLeft };
      };
      var pages = document.querySelectorAll('[data-test="page"]');
      for (var i = 0; i < pages.length; i++) {
        var p = pages[i];
        var head = p.querySelector('[data-test="head"]');
        var styleAttr = p.getAttribute('style') || '';
        var decl = {};
        if (styleAttr) {
          var parts = styleAttr.split(';');
          for (var q = 0; q < parts.length; q++) {
            var kv = parts[q].split(':');
            if (kv.length >= 2) decl[kv[0].trim()] = kv.slice(1).join(':').trim();
          }
        }
        out.push({
          inst: p.dataset.inst,
          title: snap(p.querySelector('[data-test="title"]')),
          ident: snap(p.querySelector('[data-test="ident"]')),
          line: snap(p.querySelector('[data-test="line"]')),
          ctl: snap(p.querySelector('[data-test="back"]')),
          headBottomBorder: getComputedStyle(head).borderBottomWidth,
          bodyPad: (function(){ var b = p.querySelector('[data-test="poem"]');
            var c = getComputedStyle(b);
            return { pl: c.paddingLeft, pr: c.paddingRight }; })(),
          inlineDecl: decl,
          resolved: {
            titleEdge: getComputedStyle(p).getPropertyValue('--title-edge').trim(),
            identEdge: getComputedStyle(p).getPropertyValue('--ident-edge').trim(),
            bodyEdge: getComputedStyle(p).getPropertyValue('--body-edge').trim(),
            bodyIndent: getComputedStyle(p).getPropertyValue('--body-first-indent').trim(),
            ctlEdge: getComputedStyle(p).getPropertyValue('--ctl-edge').trim(),
            titleHang: getComputedStyle(p).getPropertyValue('--title-hang').trim(),
            indent2ch: getComputedStyle(p).getPropertyValue('--indent-2ch').trim(),
            alignHead: getComputedStyle(p).getPropertyValue('--align-head').trim(),
            alignBody: getComputedStyle(p).getPropertyValue('--align-body').trim()
          }
        });
      }
      return JSON.stringify(out);
    })()`));

    const overflowScan = async () => JSON.parse(await js(`(function(){
      var all = document.querySelectorAll('body *'), maxRight = -1e9, minLeft = 1e9, mr = null, ml = null;
      var name = function(e){ return e.tagName.toLowerCase() + ((typeof e.className === 'string' && e.className) ? '.' + e.className.trim().split(/\\s+/).join('.') : ''); };
      for (var i = 0; i < all.length; i++) {
        var r = all[i].getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (r.right > maxRight) { maxRight = r.right; mr = all[i]; }
        if (r.left < minLeft) { minLeft = r.left; ml = all[i]; }
      }
      // 文本矩形（逐行字形范围）的最大右边／最小左边
      function textRects(e){
        var w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT, null), n, o = [];
        while ((n = w.nextNode())) {
          if (!n.nodeValue || n.nodeValue.trim() === '') continue;
          var rg = document.createRange(); rg.selectNodeContents(n);
          var list = rg.getClientRects();
          for (var i2 = 0; i2 < list.length; i2++) o.push(list[i2]);
        }
        return o;
      }
      var trAll = textRects(document.body), tMin = 1e9, tMax = -1e9;
      for (var j = 0; j < trAll.length; j++) {
        if (trAll[j].left < tMin) tMin = trAll[j].left;
        if (trAll[j].right > tMax) tMax = trAll[j].right;
      }
      var blocks = Array.prototype.map.call(document.querySelectorAll('[data-test="inst"]'), function(b){
        var r = b.getBoundingClientRect();
        return { inst: b.dataset.inst, w: Math.round(r.width*10)/10, left: Math.round(r.left*10)/10 };
      });
      var pages = Array.prototype.map.call(document.querySelectorAll('[data-test="page"]'), function(b){
        var r = b.getBoundingClientRect();
        return { inst: b.dataset.inst, w: Math.round(r.width*10)/10, left: Math.round(r.left*10)/10 };
      });
      return JSON.stringify({ innerWidth: window.innerWidth, docScrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        maxRight: Math.round(maxRight*10)/10, maxEl: name(mr), minLeft: Math.round(minLeft*10)/10, minEl: name(ml),
        textMinLeft: Math.round(tMin*10)/10, textMaxRight: Math.round(tMax*10)/10,
        blocks: blocks, pages: pages,
        notesNull: document.querySelector('[data-test="notes"]') === null,
        docText: document.documentElement.innerText });
    })()`));

    async function clickControl(inst, test) {
      const c = JSON.parse(await js(`(function(){
        var p = document.querySelector('[data-test="page"][data-inst="${inst}"]');
        var e = p.querySelector('[data-test="${test}"]');
        if (!e) return JSON.stringify({ missing: true });
        e.scrollIntoView({ block: 'center' });
        var r = e.getBoundingClientRect();
        var x = (r.left + r.right)/2, y = (r.top + r.bottom)/2;
        var hit = document.elementFromPoint(x, y);
        return JSON.stringify({ x: Math.round(x*10)/10, y: Math.round(y*10)/10,
          hitTag: hit ? hit.tagName : '(无)', hitIsE: hit ? (hit === e || e.contains(hit)) : false,
          tag: e.tagName, type: e.getAttribute('type') });
      })()`));
      if (c.missing) return c;
      await clickAt(c.x, c.y);
      await sleep(150);
      return c;
    }

    await send('Runtime.enable'); await send('Log.enable');
    await send('Page.enable'); await send('Network.enable');

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

    await send('Emulation.setDeviceMetricsOverride', { width: W, height: 932, deviceScaleFactor: DPR, mobile: true });
    requests.length = 0; pageErrors.length = 0; events.length = 0;
    await send('Page.navigate', { url });   // 只读打开，不写文件
    for (let i = 0; i < 120 && !events.includes('Page.loadEventFired'); i++) await sleep(100);
    await sleep(400);

    log(`\n═══════════ q-poem-align.html（430 宽 · DPR ${DPR}）═══════════`);
    const S = await struct();
    const ST = await styleInfo();
    const G = await geom();
    const GP = G.pages;
    const byInst = (inst) => GP.filter((x) => x.inst === inst)[0];
    const sByInst = (inst) => S.filter((x) => x.inst === inst)[0];
    const stByInst = (inst) => ST.filter((x) => x.inst === inst)[0];
    const dimCount = await js(`document.querySelectorAll('[data-test="dim"]').length`);
    const dimIds = await js(`Array.prototype.map.call(document.querySelectorAll('[data-test="dim"]'), function(d){ return d.dataset.dim; }).join(',')`);

    // ---- [1] 结构与固定清单 ----
    log('\n[1] 结构与固定清单（4 个维度组 · 13 个块 · 每块一个页面实例）');
    check('维度组 = 4，且分别是 d1／d2／d3／d4',
      dimCount === 4 && dimIds === 'd1,d2,d3,d4', `实测 ${dimCount} 组：${dimIds}`);
    check('块数 = 13（维度一 4 ／ 维度二 3 ／ 维度三 2 ／ 维度四 4），且每个块恰 1 个页面实例',
      G.insts.length === 13 && GP.length === 13 && uniq(GP.map((g) => g.inst)).length === 13
      && G.insts.every((b) => G.pageBoxes.filter((p) => p.inst === b.inst).length === 1)
      && ['d1', 'd2', 'd3', 'd4'].map((d) => G.insts.filter((b) => b.dim === d).length).join(',') === '4,3,2,4',
      `块：${G.insts.map((b) => b.inst).join(' ')}；每维度 ${['d1', 'd2', 'd3', 'd4'].map((d) => d + ':' + G.insts.filter((b) => b.dim === d).length).join(' ')}`);
    check('每个实例都有：题名／身份行／返回（恰 1）／详情（恰 1）／顶部行（恰 1），且原文 8 行（唯一例外：d4-fx-line 多一行夹具长句）',
      S.every((s) => s.title && s.ident && s.back === 1 && s.detail === 1 && s.topbar === 1
        && (s.lines.length === 8 || (s.inst === 'd4-fx-line' && s.lines.length === 9))),
      S.filter((s) => s.lines.length !== 8).map((s) => `${s.inst}:${s.lines.length} 行`).join(' ') || '全部 8 行');
    check('**正文之后没有页脚行**：全页 `[data-test="foot"]` 数 = 0（顶部行是唯一一行控件）',
      S.every((s) => s.foot === 0) && (await js(`document.querySelectorAll('[data-test="foot"]').length`)) === 0,
      `每实例 ${uniq(S.map((s) => s.foot)).join(',')} 个页脚行`);
    check('返回与详情**同在顶部行**、且返回在左、详情在右',
      S.every((s) => s.topbarHtml.indexOf('back') >= 0 && s.topbarHtml.indexOf('detail') > s.topbarHtml.indexOf('back')
        && s.topbarHtml.lastIndexOf('data-test="detail"') > s.topbarHtml.lastIndexOf('data-test="back"')),
      '9 个实例的顶部行都是 返回 → 详情 同一行');
    check('原文**前 8 行**逐行与源文件正文逐字相同（d4-fx-line 第 9 行是夹具长句，不属于原文）',
      S.every((s) => s.lines.slice(0, 8).join('\n') === mdFlat.join('\n')),
      S.map((s) => `${s.inst}:${s.lines.slice(0, 8).join('\n') === mdFlat.join('\n') ? '＝源文件' : '≠源文件'}`).join(' | '));
    log(`      逐行实测（取 ${S[0].inst}）：`);
    S[0].lines.forEach((t, i) => log(`        ${i + 1}  ${t}${t === mdFlat[i] ? '  ＝源文件第 ' + (i + 1) + ' 行' : '  ⚠ 与源文件第 ' + (i + 1) + ' 行不同'}`));
    check('段数：除 d4-fx-line（多一整段夹具长句 ⇒ 2 段）外，其余都 = 源文件的段数（1 段）',
      S.every((s) => (s.inst === 'd4-fx-line' ? s.stanzas === mdStanzas.length + 1 : s.stanzas === mdStanzas.length)),
      `除 ${S.filter((s) => s.stanzas !== mdStanzas.length).map((s) => s.inst + ':' + s.stanzas + ' 段').join(' ') || '（无）'} 外都是 ${mdStanzas.length} 段`);
    check('身份行 = 「作者 · 朝代 · 体裁」（佚名 · 汉 · 五言古诗），不出现细时代',
      S.every((s) => s.ident === '佚名 · 汉 · 五言古诗'),
      uniq(S.map((s) => s.ident)).join(' / '));
    const realTitle = '行行重行行';
    check('维度一／二的题名 = 真实题名「行行重行行」（原文只用真实文本）',
      S.filter((s) => s.dim === 'd1' || s.dim === 'd2').every((s) => s.title === realTitle),
      uniq(S.filter((s) => s.dim === 'd1' || s.dim === 'd2').map((s) => s.title)).join(' / '));
    const d3t = uniq(S.filter((s) => s.dim === 'd3' || s.inst === 'd4-fx-title').map((s) => s.title));
    check('夹具题名（维度三 2 块 ＋ 维度四 ④d）：题名 ≠ 真实题名、自身写明「不是真实数据」、彼此相同',
      d3t.length === 1 && d3t[0] !== realTitle && d3t[0].indexOf('不是真实数据') >= 0,
      `夹具题名="${d3t[0]}"（${[...d3t[0]].length} 字）`);
    check('夹具长句（维度四 ④e）：那多出来的一行是**醒目标注的夹具**（`data-fx="long-line"`、自身写明「不是真实数据」）',
      S.filter((s) => s.fxLineCount === 1).length === 1
      && sByInst('d4-fx-line').fxLineCount === 1
      && (sByInst('d4-fx-line').fxLineText || '').indexOf('不是真实数据') >= 0
      && (sByInst('d4-fx-line').fxLineText || '').indexOf('夹具') >= 0,
      `带 data-fx 的行：${S.filter((s) => s.fxLineCount === 1).map((s) => s.inst).join(',') || '(无)'}；文本开头="${(sByInst('d4-fx-line').fxLineText || '').slice(0, 20)}…"`);
    check('夹具横幅（`[data-test="fxban"]`）2 条（维度三／维度四各 1），两条都含「夹具」与「不是真实数据」',
      (await js(`document.querySelectorAll('[data-test="fxban"]').length`)) === 2
      && (await js(`Array.prototype.every.call(document.querySelectorAll('[data-test="fxban"]'), function(b){ return b.innerText.indexOf('夹具') >= 0 && b.innerText.indexOf('不是真实数据') >= 0; })`)) === true,
      (await js(`document.querySelectorAll('[data-test="fxban"]').length`)) + ' 条横幅');
    const banned = ['东汉末', '底本', '来源', '异文', '文选', '李善', '搜索'];
    const hits = banned.filter((w) => S.some((s) => s.text.indexOf(w) >= 0));
    check('反向：应用层可见文本里不出现 细时代／底本／来源／异文／文选／李善／搜索',
      hits.length === 0, hits.length ? '命中：' + hits.join(' ') : '0 处（应用层文本＝页面实例文本）');

    // ---- [2] 430 ----
    log('\n[2] 430 真实验收（无横向溢出；13 个块各恰 430、左沿 0）');
    let ov = await overflowScan();
    check('innerWidth === 430 且 documentElement.scrollWidth === 430（body 亦然）',
      ov.innerWidth === W && ov.docScrollWidth === W && ov.bodyScrollWidth === W,
      `innerWidth=${ov.innerWidth} docScrollWidth=${ov.docScrollWidth} bodyScrollWidth=${ov.bodyScrollWidth}`);
    check('所有可见元素都在 0…430 之内',
      ov.maxRight <= W + 0.5 && ov.minLeft >= -0.5,
      `maxRight=${ov.maxRight}(${ov.maxEl}) minLeft=${ov.minLeft}(${ov.minEl})`);
    check('**所有文本矩形**（逐行字形范围）也都在 0…430 之内',
      ov.textMaxRight <= W + 0.5 && ov.textMinLeft >= -0.5,
      `文本 maxRight=${ov.textMaxRight} minLeft=${ov.textMinLeft}`);
    check('13 个块恰好 430 宽、左沿 0',
      ov.blocks.length === 13 && ov.blocks.every((b) => b.w === W && b.left === 0),
      ov.blocks.map((b) => `${b.inst}:w${b.w}/x${b.left}`).join(' '));
    check('13 个页面实例恰好 430 宽、左沿 0',
      ov.pages.length === 13 && ov.pages.every((p) => p.w === W && p.left === 0),
      ov.pages.map((p) => `${p.inst}:w${p.w}/x${p.left}`).join(' '));
    check('**无笔记区**：`[data-test="notes"]` 用 querySelector 查为 null，且整页可见文本里没有「笔记」二字',
      ov.notesNull === true && ov.docText.indexOf('笔记') < 0 && htmlText.indexOf('笔记') < 0,
      `notes 查为 ${ov.notesNull ? 'null' : '存在'}；可见文本「笔记」${ov.docText.indexOf('笔记') < 0 ? '0 处' : '⚠ 出现了'}；HTML 文本「笔记」${htmlText.indexOf('笔记') < 0 ? '0 处' : '⚠ 出现了'}`);

    // ---- [3] 排版权重 ----
    log('\n[3] 排版权重实测（题名／身份行／原文／控件；13 个实例应完全一致）');
    log(`      ${ST[0].inst}: 题名 ${ST[0].title.fz}/${ST[0].title.fw}/字距 ${ST[0].title.ls} ${ST[0].title.color}`);
    log(`      ${ST[0].inst}: 身份行 ${ST[0].ident.fz}/字距 ${ST[0].ident.ls} ${ST[0].ident.color}`);
    log(`      ${ST[0].inst}: 原文 ${ST[0].line.fz}/行高 ${ST[0].line.lh}/字距 ${ST[0].line.ls} ${ST[0].line.color}`);
    log(`      ${ST[0].inst}: 控件 ${ST[0].ctl.fz}/${ST[0].ctl.color} 边框 ${ST[0].ctl.bt}/${ST[0].ctl.bb} 底色 ${ST[0].ctl.bg}`);
    check('题名 = 1.5rem(24px)、字重 500、字距 0.1em(2.4px)、色 --text',
      ST.every((s) => s.title.fz === '24px' && s.title.fw === '500' && s.title.ls === '2.4px' && s.title.color === 'rgb(221, 229, 228)'),
      `${ST[0].title.fz}/${ST[0].title.fw}/${ST[0].title.ls}/${ST[0].title.color}`);
    check('身份行 = 0.78rem(12.48px)、色 --text-faint(#788a88)',
      ST.every((s) => s.ident.fz === '12.48px' && s.ident.color === 'rgb(120, 138, 136)'),
      `${ST[0].ident.fz}/${ST[0].ident.color}`);
    check('原文 = 17px／行高 34px／字距 0.045em(0.765px)、色 --text',
      ST.every((s) => s.line.fz === '17px' && s.line.lh === '34px' && s.line.ls === '0.765px' && s.line.color === 'rgb(221, 229, 228)'),
      `${ST[0].line.fz}/${ST[0].line.lh}/${ST[0].line.ls}/${ST[0].line.color}`);
    check('控件 = 0.82rem(13.12px)、色 --text-dim(#98a8a6)、无边框无底色（纯文字）、单行',
      ST.every((s) => s.ctl.fz === '13.12px' && s.ctl.color === 'rgb(152, 168, 166)'
        && s.ctl.bt === '0px' && s.ctl.bb === '0px' && s.ctl.bg === 'rgba(0, 0, 0, 0)')
      && GP.every((g) => g.back.length === 1 && g.detail.length === 1),
      `${ST[0].ctl.fz}/${ST[0].ctl.color}/边框 ${ST[0].ctl.bt}/${ST[0].ctl.bb}/底 ${ST[0].ctl.bg}`);
    check('层级方向：题名 24px > 原文 17px > 身份行 12.48px，且控件 13.12px < 原文 17px',
      ST.every((s) => parseFloat(s.title.fz) > parseFloat(s.line.fz) && parseFloat(s.line.fz) > parseFloat(s.ident.fz)
        && parseFloat(s.ctl.fz) < parseFloat(s.line.fz)),
      `题名 ${uniq(ST.map((s) => s.title.fz)).join(',')} > 原文 ${uniq(ST.map((s) => s.line.fz)).join(',')} > 身份 ${uniq(ST.map((s) => s.ident.fz)).join(',')}；控件 ${uniq(ST.map((s) => s.ctl.fz)).join(',')}`);
    check('题头**没有**下划线（§4.1 记号③：`poem-head` 的 border-bottom = 0px）',
      ST.every((s) => s.headBottomBorder === '0px'), uniq(ST.map((s) => s.headBottomBorder)).join(','));
    check('原文 8 行**每行都不折行**（每行恰好 1 个文本矩形）；唯一例外是 ④e 的夹具长句：它折成 **2 个视觉行**',
      g_lineOk(GP), g_lineDetail(GP));

    // ---- [4] 纵向几何固定 ----
    log('\n[4] 固定不变的纵向几何（13 个实例应同一值 ⇒ 四个维度只动水平）');
    for (const g of GP) {
      log(`      ${g.inst}：题名→身份 ${r1(g.gaps.titleToIdent)}px；身份→原文首行 ${r1(g.gaps.identToBody)}px；顶部行底→题名顶 ${r1(g.gaps.topbarToTitle)}px`);
    }
    check('每块：题名→身份 0.7rem＝11.2px',
      GP.every((g) => near(g.gaps.titleToIdent, 11.2, TOL)), uniq(GP.map((g) => r1(g.gaps.titleToIdent))).join(','));
    check('每块：身份行→原文首行 2.1rem＝33.6px',
      GP.every((g) => near(g.gaps.identToBody, 33.6, TOL)), uniq(GP.map((g) => r1(g.gaps.identToBody))).join(','));
    check('每块：顶部行底 → 题名顶 同一个值（维度二只动水平，不动纵向）',
      uniq(GP.map((g) => r1(g.gaps.topbarToTitle))).length === 1,
      uniq(GP.map((g) => r1(g.gaps.topbarToTitle))).join(','));
    check('每块：顶部行自身的顶边（相对本实例顶）同一个值（±0.1px 的子像素取整）',
      Math.max(...GP.map((g) => g.rel.topbar)) - Math.min(...GP.map((g) => g.rel.topbar)) <= 0.1,
      uniq(GP.map((g) => g.rel.topbar)).join(','));
    const TALL = ['d3-same', 'd3-hang', 'd4-fx-title'];   // 题名占两行的块（维度三两块 ＋ 维度四 ④d）
    const relBodyOne = GP.filter((g) => TALL.indexOf(g.inst) < 0).map((g) => g.rel.body);
    const relBodyTwo = GP.filter((g) => TALL.indexOf(g.inst) >= 0).map((g) => g.rel.body);
    check('每块：正文块的相对顶 —— 单行题名的块同一值；两行题名的块（d3 两块 ＋ ④d）恰好比它低 33.6px（多一行题名 1.4×24）',
      Math.max(...relBodyOne) - Math.min(...relBodyOne) <= 0.15
      && relBodyTwo.every((v) => Math.abs((v - relBodyOne[0]) - 33.6) <= 0.3)
      && Math.max(...relBodyTwo) - Math.min(...relBodyTwo) <= 0.15,
      `单行题名 ${uniq(relBodyOne).join(',')}；两行题名 ${uniq(relBodyTwo).join(',')}（差 ${r1(relBodyTwo[0] - relBodyOne[0])}px）`);

    // ---- [5][6][7] 三个维度 ----
    const L = (rects) => rects[0].left;
    const R = (rects) => rects[rects.length - 1].right;
    const bodyL = (g) => g.bodyLineTexts[0][0].left;
    const bodyR2 = (g) => g.bodyLineTexts[1][0].left;

    log('\n[5] 维度一：三块内容的左沿关系（4 块实测）');
    const d1 = (inst) => byInst(inst);
    const d1s = {
      base: d1('d1-base'), tleft: d1('d1-tleft'), tright: d1('d1-tright'), bindent: d1('d1-bindent')
    };
    for (const k of ['base', 'tleft', 'tright', 'bindent']) {
      const g = d1s[k];
      log(`      ${g.inst}：题名左沿 ${r1(L(g.titleLines))}（右沿 ${r1(R(g.titleLines))}，${g.titleLines.length} 行）｜身份行左沿 ${r1(L(g.ident))}（右沿 ${r1(R(g.ident))}）｜正文首行左沿 ${r1(bodyL(g))}（右沿 ${r1(R(g.bodyLineTexts[0]))}）｜正文第 2 行左沿 ${r1(bodyR2(g))}｜文本最右 ${r1(g.textMaxRight)}`);
    }
    check('① 基线：题名／身份行／正文首行 **同一条竖线**（左沿都是 16.8px）',
      near(L(d1s.base.titleLines), EDGE, TOL) && near(L(d1s.base.ident), EDGE, TOL) && near(bodyL(d1s.base), EDGE, TOL)
      && near(L(d1s.base.titleLines), L(d1s.base.ident), TOL) && near(L(d1s.base.ident), bodyL(d1s.base), TOL),
      `题名 ${r1(L(d1s.base.titleLines))} / 身份行 ${r1(L(d1s.base.ident))} / 正文首行 ${r1(bodyL(d1s.base))}`);
    check('② 题名另起一沿·更左：题名左沿 0px，而身份行与正文仍在 16.8px',
      near(L(d1s.tleft.titleLines), 0, TOL) && near(L(d1s.tleft.ident), EDGE, TOL) && near(bodyL(d1s.tleft), EDGE, TOL),
      `题名 ${r1(L(d1s.tleft.titleLines))} / 身份行 ${r1(L(d1s.tleft.ident))} / 正文首行 ${r1(bodyL(d1s.tleft))}`);
    check('③ 题名另起一沿·更右：题名左沿 50.8px（＝16.8＋2 字符 34px），身份行与正文仍在 16.8px',
      near(L(d1s.tright.titleLines), EDGE + UNIT2, TOL) && near(L(d1s.tright.ident), EDGE, TOL) && near(bodyL(d1s.tright), EDGE, TOL),
      `题名 ${r1(L(d1s.tright.titleLines))}（期望 ${r1(EDGE + UNIT2)}）/ 身份行 ${r1(L(d1s.tright.ident))} / 正文首行 ${r1(bodyL(d1s.tright))}`);
    check('④ 正文首行缩进 2 字符：正文**首行**左沿 50.8px、**其余 7 行**仍 16.8px，题名与身份行仍在 16.8px',
      near(bodyL(d1s.bindent), EDGE + UNIT2, TOL) && near(bodyR2(d1s.bindent), EDGE, TOL)
      && near(L(d1s.bindent.titleLines), EDGE, TOL) && near(L(d1s.bindent.ident), EDGE, TOL)
      && d1s.bindent.bodyLineTexts.slice(1).every((t) => near(t[0].left, EDGE, TOL)),
      `首行 ${r1(bodyL(d1s.bindent))}（期望 ${r1(EDGE + UNIT2)}）/ 其余行左沿 ${uniq(d1s.bindent.bodyLineTexts.slice(1).map((t) => r1(t[0].left))).join(',')} / 题名 ${r1(L(d1s.bindent.titleLines))} / 身份行 ${r1(L(d1s.bindent.ident))}`);
    check('维度一的四块里，**顶部行不动**（返回左沿 16.8px、详情右沿 413.2px —— 与基线相同）',
      ['base', 'tleft', 'tright', 'bindent'].every((k) => near(L(d1s[k].back), EDGE, TOL) && near(R(d1s[k].detail), CONTENT_RIGHT, TOL_R)),
      ['base', 'tleft', 'tright', 'bindent'].map((k) => `${k}:返回${r1(L(d1s[k].back))}/详情右${r1(R(d1s[k].detail))}`).join(' '));
    check('维度一的四块：**内容右沿都在 413.2px 之内**（没有挤进右内沿）',
      ['base', 'tleft', 'tright', 'bindent'].every((k) => d1s[k].textMaxRight <= CONTENT_RIGHT + TOL_R),
      ['base', 'tleft', 'tright', 'bindent'].map((k) => `${k}:${r1(d1s[k].textMaxRight)}`).join(' '));

    log('\n[6] 维度二：顶部行（返回 …… 详情）的左右内沿（3 块实测）');
    const d2 = { base: byInst('d2-base'), out: byInst('d2-out'), inn: byInst('d2-in') };
    for (const k of ['base', 'out', 'inn']) {
      const g = d2[k];
      log(`      ${g.inst}：返回左沿 ${r1(L(g.back))}（右沿 ${r1(R(g.back))}）｜详情左沿 ${r1(L(g.detail))}（右沿 ${r1(R(g.detail))}）｜与内容内沿差 左 ${r1(L(g.back) - EDGE)} / 右 ${r1(R(g.detail) - CONTENT_RIGHT)}｜内容：题名 ${r1(L(g.titleLines))} 身份行 ${r1(L(g.ident))} 正文 ${r1(bodyL(g))} → ${r1(g.textMaxRight)}`);
    }
    check('① 基线：顶部行与内容**同一内沿** —— 返回左沿 16.8px、详情右沿 413.2px、差 0px',
      near(L(d2.base.back), EDGE, TOL) && near(R(d2.base.detail), CONTENT_RIGHT, TOL_R),
      `返回左沿 ${r1(L(d2.base.back))}；详情右沿 ${r1(R(d2.base.detail))}（差 左 ${r1(L(d2.base.back) - EDGE)} / 右 ${r1(R(d2.base.detail) - CONTENT_RIGHT)}）`);
    check('② 更靠外（栏外）：返回左沿 0px、详情右沿 430px ⇒ 各自比内容内沿**外 16.8px**',
      near(L(d2.out.back), 0, TOL) && near(R(d2.out.detail), W, TOL_R)
      && near(L(d2.out.back) - EDGE, -EDGE, TOL) && near(R(d2.out.detail) - CONTENT_RIGHT, EDGE, TOL_R),
      `返回左沿 ${r1(L(d2.out.back))}；详情右沿 ${r1(R(d2.out.detail))}（差 左 ${r1(L(d2.out.back) - EDGE)} / 右 ${r1(R(d2.out.detail) - CONTENT_RIGHT)}）`);
    check('③ 更靠内：返回左沿 33.6px、详情右沿 396.4px ⇒ 各自比内容内沿**内 16.8px**',
      near(L(d2.inn.back), EDGE * 2, TOL) && near(R(d2.inn.detail), CONTENT_RIGHT - EDGE, TOL_R)
      && near(L(d2.inn.back) - EDGE, EDGE, TOL) && near(R(d2.inn.detail) - CONTENT_RIGHT, -EDGE, TOL_R),
      `返回左沿 ${r1(L(d2.inn.back))}；详情右沿 ${r1(R(d2.inn.detail))}（差 左 ${r1(L(d2.inn.back) - EDGE)} / 右 ${r1(R(d2.inn.detail) - CONTENT_RIGHT)}）`);
    check('维度二的三块里，**内容三块不动**：题名／身份行／正文首行左沿都仍 16.8px',
      ['base', 'out', 'inn'].every((k) => near(L(d2[k].titleLines), EDGE, TOL) && near(L(d2[k].ident), EDGE, TOL) && near(bodyL(d2[k]), EDGE, TOL)),
      ['base', 'out', 'inn'].map((k) => `${k}:题名${r1(L(d2[k].titleLines))}/身份行${r1(L(d2[k].ident))}/正文${r1(bodyL(d2[k]))}`).join(' '));
    check('维度二的三块里，**顶部行与内容的左右关系只有内沿在动**：返回左沿三种取值恰为 16.8／0／33.6',
      uniq(['base', 'out', 'inn'].map((k) => r1(L(d2[k].back)))).join(',') === '16.8,0,33.6',
      uniq(['base', 'out', 'inn'].map((k) => r1(L(d2[k].back)))).join(','));

    log('\n[7] 维度三：长题名折行（夹具块 2 块实测）');
    const d3 = { same: byInst('d3-same'), hang: byInst('d3-hang') };
    for (const k of ['same', 'hang']) {
      const g = d3[k];
      log(`      ${g.inst}：题名 ${g.titleLines.length} 行 —— 首行 [${r1(g.titleLines[0].left)}…${r1(g.titleLines[0].right)}]｜第 2 行 [${r1(g.titleLines[1] ? g.titleLines[1].left : NaN)}…${r1(g.titleLines[1] ? g.titleLines[1].right : NaN)}]｜身份行左沿 ${r1(L(g.ident))}｜正文首行左沿 ${r1(bodyL(g))}｜文本最右 ${r1(g.textMaxRight)}`);
    }
    check('夹具题名在 430 下折成**恰好 2 行**（"第二行"才是有意义的问题）',
      d3.same.titleLines.length === 2 && d3.hang.titleLines.length === 2,
      `基线 ${d3.same.titleLines.length} 行 / 悬挂 ${d3.hang.titleLines.length} 行`);
    check('① 基线：折行**第二行与首行同一竖线**（两行左沿都是 16.8px），身份行与正文也与首行同沿',
      near(d3.same.titleLines[0].left, EDGE, TOL) && near(d3.same.titleLines[1].left, EDGE, TOL)
      && near(L(d3.same.ident), EDGE, TOL) && near(bodyL(d3.same), EDGE, TOL),
      `首行 ${r1(d3.same.titleLines[0].left)} / 第 2 行 ${r1(d3.same.titleLines[1].left)} / 身份行 ${r1(L(d3.same.ident))} / 正文首行 ${r1(bodyL(d3.same))}`);
    check('② 悬挂缩进：第二行左沿 50.8px（＝16.8＋2 字符 34px），首行／身份行／正文仍在 16.8px',
      near(d3.hang.titleLines[0].left, EDGE, TOL) && near(d3.hang.titleLines[1].left, EDGE + UNIT2, TOL)
      && near(L(d3.hang.ident), EDGE, TOL) && near(bodyL(d3.hang), EDGE, TOL),
      `首行 ${r1(d3.hang.titleLines[0].left)} / 第 2 行 ${r1(d3.hang.titleLines[1].left)}（期望 ${r1(EDGE + UNIT2)}）/ 身份行 ${r1(L(d3.hang.ident))} / 正文首行 ${r1(bodyL(d3.hang))}`);
    check('维度三两块：右沿都在 413.2px 之内（折行不会越过右内沿）',
      d3.same.textMaxRight <= CONTENT_RIGHT + TOL_R && d3.hang.textMaxRight <= CONTENT_RIGHT + TOL_R,
      `基线最右 ${r1(d3.same.textMaxRight)} / 悬挂最右 ${r1(d3.hang.textMaxRight)}`);

    // ---- [8] 总表 ----
    log('\n[8] 水平几何总表（每块实测；右沿余量 ＝ 内容右沿 413.2px − 该行文本右沿）');
    log('      块          dim  题名左/右沿            身份行左/右沿          正文首行左沿  正文右沿max  顶部行 返回左/详情右   内沿差 左/右     折行2行左沿');
    for (const g of GP) {
      const t = g.titleLines[0], i = g.ident[0];
      const maxLine = g.bodyLineTexts.map((t2) => t2[0]).reduce((a, b) => (b.right > a.right ? b : a));
      log(`      ${g.inst.padEnd(11)} ${g.dim}   ${String(r1(t.left) + '/' + r1(t.right)).padEnd(20)} ${String(r1(i.left) + '/' + r1(i.right)).padEnd(22)} ${String(r1(g.bodyLineTexts[0][0].left)).padEnd(12)} ${String(r1(maxLine.right)).padEnd(12)} ${String(r1(L(g.back)) + '/' + r1(R(g.detail))).padEnd(16)} ${String(r1(L(g.back) - EDGE) + '/' + r1(R(g.detail) - CONTENT_RIGHT)).padEnd(16)} ${g.titleLines.length > 1 ? r1(g.titleLines[1].left) : '-'}`);
      log(`                  ↳ 正文最长行 [${r1(maxLine.left)}…${r1(maxLine.right)}] 行长 ${r1(maxLine.right - maxLine.left)}px，右沿余量 ${r1(CONTENT_RIGHT - maxLine.right)}px；题名右沿余量 ${r1(CONTENT_RIGHT - t.right)}px；本块文本最右 ${r1(g.textMaxRight)}px`);
    }

    // ---- [9] 语义 ----
    log('\n[9] 可点元素的语义（button/a，不是 div 冒充）');
    const sem = JSON.parse(await js(`(function(){
      var tags = ['back', 'detail'];
      var bad = [], list = [];
      var pages = document.querySelectorAll('[data-test="page"]');
      for (var i = 0; i < pages.length; i++) {
        for (var j = 0; j < tags.length; j++) {
          var els = pages[i].querySelectorAll('[data-test="' + tags[j] + '"]');
          for (var k = 0; k < els.length; k++) {
            var e = els[k], t = e.tagName, ty = e.getAttribute('type');
            list.push(pages[i].dataset.inst + ':' + tags[j] + '=' + t + (ty ? '/' + ty : ''));
            if (t !== 'BUTTON' && t !== 'A') bad.push(pages[i].dataset.inst + ':' + tags[j] + '=' + t);
            if (t === 'BUTTON' && ty !== 'button') bad.push(pages[i].dataset.inst + ':' + tags[j] + '=BUTTON 但 type=' + ty);
            if (e.hasAttribute('onclick')) bad.push(pages[i].dataset.inst + ':' + tags[j] + ' 带内联 onclick');
          }
        }
      }
      return JSON.stringify({ bad: bad, count: list.length, sample: list.slice(0, 6),
        inlineOnclick: document.querySelectorAll('[onclick]').length });
    })()`));
    check('所有可点元素都是 <a> 或 <button type="button">，且没有内联 onclick',
      sem.bad.length === 0 && sem.inlineOnclick === 0,
      `${sem.count} 个可点元素（${sem.sample.join(' ')}…）${sem.bad.length ? ' 问题：' + sem.bad.join(' ') : ''}`);
    const hit = await clickControl(S[0].inst, 'back');
    check('控件的中心点用 elementFromPoint 命中的是它自己或其后代（真的能点到）',
      hit.hitIsE === true, `${S[0].inst} 返回：命中 ${hit.hitTag}${hit.hitIsE ? '' : ' ⚠ 不是控件自身'}`);
    await sleep(100);

    // ---- [10] 自包含 ----
    log('\n[10] 自包含 + 无 JS 报错');
    const ext = requests.filter((u) => !u.startsWith('file:///') && !u.startsWith('data:'));
    check('CDP 记录的网络请求里没有任何 http(s) 外部引用',
      ext.length === 0, `${requests.length} 个请求，非 file:// 的=${ext.length} ${JSON.stringify(ext)}`);
    const textHits = ['<link', 'src=', '@import', 'http://', 'https://'].filter((t) => htmlText.indexOf(t) >= 0);
    check('页面文本里没有 <link / src= / @import / http(s)://', textHits.length === 0,
      textHits.length ? '命中：' + textHits.join(' ') : '0 处');
    check('页面无 JS 报错（加载 + 上面的点按）', pageErrors.length === 0,
      pageErrors.length ? pageErrors.join(' | ') : '0 条');

    // ---- [11] 令牌快照 ----
    log('\n[11] 令牌快照逐项比对（权威 prototype/css/theme-tech.css；docs/design/visual-tokens.md 是上游权威）');
    const snapText = declarationBlock(htmlText, '== TOKEN-SNAPSHOT-BEGIN ==', '== TOKEN-SNAPSHOT-END ==');
    const draftText = declarationBlock(htmlText, '== DRAFT-VALUES-BEGIN ==', '== DRAFT-VALUES-END ==');
    const snap = snapText ? parseTokens(snapText) : new Map();
    const draft = draftText ? parseTokens(draftText) : new Map();
    const mismatches = [];
    for (const [k, v] of snap) {
      if (!themeTokens.has(k)) mismatches.push(`${k}: theme-tech.css 里没有这个令牌（快照值 ${v}）`);
      else if (themeTokens.get(k) !== v) mismatches.push(`${k}: 快照 ${v} ≠ theme-tech.css ${themeTokens.get(k)}`);
    }
    const used = new Set((htmlText.match(/var\(--[A-Za-z0-9_-]+\)/g) || []).map((s) => s.slice(4, -1)));
    const undeclared = [...used].filter((k) => !snap.has(k) && !draft.has(k));
    const unused = [...snap.keys()].filter((k) => !used.has(k));
    const unusedDraft = [...draft.keys()].filter((k) => !used.has(k));
    check(`令牌快照与 prototype/css/theme-tech.css 逐项比对：值不一致数 = ${mismatches.length}（要求 0）`,
      mismatches.length === 0,
      mismatches.length ? mismatches.join(' | ') : `${snap.size} 个令牌逐字一致（空白已归一化）`);
    check('快照／草案里没有「声明了却没用」的令牌，且用到的每个 var(--x) 都有声明',
      undeclared.length === 0 && unused.length === 0 && unusedDraft.length === 0,
      `未声明=${JSON.stringify(undeclared)} 快照未用=${JSON.stringify(unused)} 草案未用=${JSON.stringify(unusedDraft)}`);
    const shaRecorded = (htmlText.match(/仓库提交：([0-9a-f]{7,40})/) || [])[1] || '(没记录)';
    log(`      令牌来源记录：页面写的是提交 ${shaRecorded}；当前 HEAD=${gitHead}；theme-tech.css 相对 HEAD ${themeClean === null ? '未知' : (themeClean ? '无改动' : '有未提交改动')}`);
    check('页面记录了令牌快照的来源提交（短 sha）', /^[0-9a-f]{7,40}$/.test(shaRecorded), `记录=${shaRecorded}`);
    // 「逐维度干净对照」的实测依据：每块**只**覆盖自己那一维度要动的那个自定义属性，别的块一个都不覆盖。
    const WANT_VARS = {
      'd1-base': {}, 'd1-tleft': { '--title-edge': '0px' },
      'd1-tright': { '--title-edge': 'calc(var(--edge-x) + var(--indent-2ch))' },
      'd1-bindent': { '--body-first-indent': 'var(--indent-2ch)' },
      'd2-base': {}, 'd2-out': { '--ctl-edge': '0px' }, 'd2-in': { '--ctl-edge': 'calc(var(--edge-x) * 2)' },
      'd3-same': {}, 'd3-hang': { '--title-hang': 'var(--indent-2ch)' },
      'd4-all': { '--align-head': 'center', '--align-body': 'center' },
      'd4-head': { '--align-head': 'center' },
      'd4-fx-title': { '--align-head': 'center', '--align-body': 'center' },
      'd4-fx-line': { '--align-head': 'center', '--align-body': 'center' },
    };
    const varProblems = [];
    for (const inst of Object.keys(WANT_VARS)) {
      const got = stByInst(inst).inlineDecl;
      const want = WANT_VARS[inst];
      const gk = Object.keys(got).sort().join(',');
      const wk = Object.keys(want).sort().join(',');
      if (gk !== wk) { varProblems.push(`${inst}: 覆盖了 [${gk}]，期望 [${wk}]`); continue; }
      for (const k of Object.keys(want)) if (got[k] !== want[k]) varProblems.push(`${inst}: ${k}=${got[k]}，期望 ${want[k]}`);
    }
    check('逐维度干净对照：每块**只**覆盖自己那一维度要动的自定义属性（名单与值逐项相符）',
      varProblems.length === 0,
      varProblems.length ? varProblems.join(' | ') : Object.keys(WANT_VARS).map((i) => i + ':' + (Object.entries(WANT_VARS[i]).map(([k, v]) => k + '=' + v).join('') || '(无)')).join(' '));
    check('被覆盖的属性都能解析出实际值（--title-edge 0px／--ctl-edge 0px 与 calc(1.05rem×2)／--body-first-indent 34px／--title-hang 34px；2 字符单位 = 34px）',
      stByInst('d1-tleft').resolved.titleEdge === '0px' && stByInst('d2-out').resolved.ctlEdge === '0px'
      && stByInst('d2-in').resolved.ctlEdge === 'calc(1.05rem * 2)' && stByInst('d1-bindent').resolved.bodyIndent === '34px'
      && stByInst('d3-hang').resolved.titleHang === '34px' && uniq(ST.map((s) => s.resolved.indent2ch)).join(',') === '34px'
      && stByInst('d1-base').resolved.titleEdge === stByInst('d2-base').resolved.titleEdge,
      `d1-tleft:${stByInst('d1-tleft').resolved.titleEdge} d2-out:${stByInst('d2-out').resolved.ctlEdge} d2-in:${stByInst('d2-in').resolved.ctlEdge} d1-bindent:${stByInst('d1-bindent').resolved.bodyIndent} d3-hang:${stByInst('d3-hang').resolved.titleHang} indent2ch:${stByInst('d1-base').resolved.indent2ch}`);
    check('居中的两个变量也解析得出来：④a／④d／④e 题头与正文都 center，**④b 只有题头 center、正文仍是 left**',
      stByInst('d4-all').resolved.alignHead === 'center' && stByInst('d4-all').resolved.alignBody === 'center'
      && stByInst('d4-fx-title').resolved.alignBody === 'center' && stByInst('d4-fx-line').resolved.alignBody === 'center'
      && stByInst('d4-head').resolved.alignHead === 'center' && stByInst('d4-head').resolved.alignBody === 'left'
      && stByInst('d1-base').resolved.alignHead === 'left' && stByInst('d1-base').resolved.alignBody === 'left',
      `d4-all:${stByInst('d4-all').resolved.alignHead}/${stByInst('d4-all').resolved.alignBody} d4-head:${stByInst('d4-head').resolved.alignHead}/${stByInst('d4-head').resolved.alignBody} d1-base:${stByInst('d1-base').resolved.alignHead}/${stByInst('d1-base').resolved.alignBody}`);

    // ---- [12] 维度四：居中范围 ----
    log('\n[12] 维度四：居中范围（4 块实测；列中心 ＝ [16.8, 413.2] 的中点 ＝ 215px）');
    const CTOL = 1.5;
    const rowC = (r) => Math.round((r.left + r.right) / 2 * 100) / 100;
    const d4 = { all: byInst('d4-all'), head: byInst('d4-head'), fxt: byInst('d4-fx-title'), fxl: byInst('d4-fx-line') };

    log('      ④a d4-all（全部居中）逐行实测：');
    log('        行        左沿      右沿      宽度      中心      与列中心差');
    const rowsA = [];
    d4.all.titleLines.forEach((r, i) => rowsA.push(['题名行' + (i + 1), r]));
    d4.all.ident.forEach((r, i) => rowsA.push(['身份行' + (i + 1), r]));
    d4.all.bodyLineTexts.forEach((t, i) => t.forEach((r, k) => rowsA.push(['正文行' + (i + 1) + (t.length > 1 ? '/视觉' + (k + 1) : ''), r])));
    for (const [nm, r] of rowsA) {
      log(`        ${nm.padEnd(9)} ${String(r1(r.left)).padEnd(9)} ${String(r1(r.right)).padEnd(9)} ${String(r1(r.w)).padEnd(9)} ${String(r1(rowC(r))).padEnd(9)} ${r1(rowC(r) - COL_CENTER)}`);
    }
    check('④a 全部居中：**每一行的文字中心 ≈ 列中心 215px**（题名逐视觉行／身份行／正文 8 行逐行）',
      rowsA.length === 10 && rowsA.every(([, r]) => Math.abs(rowC(r) - COL_CENTER) <= CTOL),
      `${rowsA.length} 行，最大偏差 ${r1(Math.max(...rowsA.map(([, r]) => Math.abs(rowC(r) - COL_CENTER))))}px（容差 ±${CTOL}px）`);
    check('④a 居中**不改列、也不动顶部行**：正文的内容左右内沿仍 16.8／413.2；顶部行 返回左沿 16.8px、详情右沿 413.2px',
      near(d4.all.boxes.body.left + parseFloat(stByInst('d4-all').bodyPad.pl), EDGE, TOL)
      && near(d4.all.boxes.body.right - parseFloat(stByInst('d4-all').bodyPad.pr), CONTENT_RIGHT, TOL)
      && near(L(d4.all.back), EDGE, TOL) && near(R(d4.all.detail), CONTENT_RIGHT, TOL_R),
      `正文内容内沿 ${r1(d4.all.boxes.body.left + parseFloat(stByInst('d4-all').bodyPad.pl))}／${r1(d4.all.boxes.body.right - parseFloat(stByInst('d4-all').bodyPad.pr))}（内边距 ${stByInst('d4-all').bodyPad.pl}／${stByInst('d4-all').bodyPad.pr}）；返回左沿 ${r1(L(d4.all.back))}；详情右沿 ${r1(R(d4.all.detail))}`);

    const baseRows = d1s.base.bodyLineTexts.map((t) => t[0]);
    const headRows = d4.head.bodyLineTexts.map((t) => t[0]);
    log('      ④b d4-head（仅题头居中）逐行对照基线 d1-base：');
    for (let i = 0; i < headRows.length; i++) {
      log(`        正文行${i + 1}  ④b [${r1(headRows[i].left)}…${r1(headRows[i].right)}] 中心 ${r1(rowC(headRows[i]))}｜基线 [${r1(baseRows[i].left)}…${r1(baseRows[i].right)}] 中心 ${r1(rowC(baseRows[i]))}｜左沿差 ${r1(headRows[i].left - baseRows[i].left)}`);
    }
    check('④b 仅题头居中：题名与身份行**居中**（中心 ≈ 215px）',
      Math.abs(rowC(d4.head.titleLines[0]) - COL_CENTER) <= CTOL && Math.abs(rowC(d4.head.ident[0]) - COL_CENTER) <= CTOL,
      `题名中心 ${r1(rowC(d4.head.titleLines[0]))}；身份行中心 ${r1(rowC(d4.head.ident[0]))}`);
    check('④b 的**正文仍与基线（维度一①）逐行一致**（左对齐没被改掉）：8 行逐行左右沿相同',
      headRows.length === 8 && headRows.every((r, i) => near(r.left, baseRows[i].left, 0.2) && near(r.right, baseRows[i].right, 0.2)),
      `逐行左沿差 max ${r1(Math.max(...headRows.map((r, i) => Math.abs(r.left - baseRows[i].left))))}px；右沿差 max ${r1(Math.max(...headRows.map((r, i) => Math.abs(r.right - baseRows[i].right))))}px`);
    check('④b：顶部行也不变（返回左沿 16.8px、详情右沿 413.2px）',
      near(L(d4.head.back), EDGE, TOL) && near(R(d4.head.detail), CONTENT_RIGHT, TOL_R),
      `返回左沿 ${r1(L(d4.head.back))}；详情右沿 ${r1(R(d4.head.detail))}`);

    log(`      ④d d4-fx-title（长夹具题名 ＋ 全部居中）：题名 ${d4.fxt.titleLines.length} 个视觉行 —— ${d4.fxt.titleLines.map((r, i) => '第' + (i + 1) + '行 [' + r1(r.left) + '…' + r1(r.right) + '] 中心 ' + r1(rowC(r))).join('｜')}`);
    check('④d 长夹具题名在居中下仍折成 **2 行**，且**两行各自居中**（每行中心 ≈ 215px）；身份行也居中',
      d4.fxt.titleLines.length === 2
      && d4.fxt.titleLines.every((r) => Math.abs(rowC(r) - COL_CENTER) <= CTOL)
      && Math.abs(rowC(d4.fxt.ident[0]) - COL_CENTER) <= CTOL,
      `两行中心 ${d4.fxt.titleLines.map((r) => r1(rowC(r))).join('／')}（与列中心差 ${d4.fxt.titleLines.map((r) => r1(rowC(r) - COL_CENTER)).join('／')}）；身份行中心 ${r1(rowC(d4.fxt.ident[0]))}`);

    const fxlRows = d4.fxl.bodyLineTexts[8] || [];
    log(`      ④e d4-fx-line（夹具长句 ＋ 全部居中）：前 8 行是真实原文、第 9 行是夹具长句（${[...(sByInst('d4-fx-line').fxLineText || '')].length} 字）在 430 下折成 ${fxlRows.length} 个视觉行`);
    fxlRows.forEach((r, i) => log(`        夹具长句视觉行${i + 1}  左沿 ${r1(r.left)}  右沿 ${r1(r.right)}  宽度 ${r1(r.w)}  中心 ${r1(rowC(r))}  与列中心差 ${r1(rowC(r) - COL_CENTER)}`));
    check('④e 夹具长句在 430 下**恰好折成 2 个视觉行**（「第二行」才是有意义的问题）',
      fxlRows.length === 2, `实测 ${fxlRows.length} 个视觉行`);
    check('④e **折行的第二行也居中**（两个视觉行的中心都 ≈ 215px，且彼此相同）',
      fxlRows.length === 2 && fxlRows.every((r) => Math.abs(rowC(r) - COL_CENTER) <= CTOL)
      && Math.abs(rowC(fxlRows[0]) - rowC(fxlRows[1])) <= CTOL,
      `两行中心 ${fxlRows.map((r) => r1(rowC(r))).join('／')}（与列中心差 ${fxlRows.map((r) => r1(rowC(r) - COL_CENTER)).join('／')}）`);
    check('④e 真实原文那 8 行也逐行居中，且夹具长句那一行是**醒目标注的夹具**（`data-fx` ＋ 文本含「不是真实数据」）',
      d4.fxl.bodyLineTexts.slice(0, 8).every((t) => Math.abs(rowC(t[0]) - COL_CENTER) <= CTOL)
      && sByInst('d4-fx-line').fxLineCount === 1,
      `8 行最大偏差 ${r1(Math.max(...d4.fxl.bodyLineTexts.slice(0, 8).map((t) => Math.abs(rowC(t[0]) - COL_CENTER))))}px；夹具行数 ${sByInst('d4-fx-line').fxLineCount}`);
    check('④e 夹具长句与前 8 行之间是真的第二段（段间距 1.2em ＝ 20.4px，页面上真实存在两段、不是探针）',
      sByInst('d4-fx-line').stanzas === 2
      && near(d4.fxl.bodyLineBoxes[8].top - d4.fxl.bodyLineBoxes[7].bottom, 20.4, TOL),
      `段数 ${sByInst('d4-fx-line').stanzas}；实测第 8 行元素底 → 夹具行元素顶 ＝ ${r1(d4.fxl.bodyLineBoxes[8].top - d4.fxl.bodyLineBoxes[7].bottom)}px`);
    check('维度四四块的顶部行左右沿**完全一致**（16.8／413.2）⇒ 居中确实不作用于顶部行',
      ['all', 'head', 'fxt', 'fxl'].every((k) => near(L(d4[k].back), EDGE, TOL) && near(R(d4[k].detail), CONTENT_RIGHT, TOL_R)),
      ['all', 'head', 'fxt', 'fxl'].map((k) => `${k}:${r1(L(d4[k].back))}/${r1(R(d4[k].detail))}`).join(' '));

    // ---- [13] #shot 与图 ----
    if (!SHOT) { log('\n[PNG] 已跳过（--no-shot）'); }
    else {
      await send('Page.navigate', { url: 'about:blank' });
      await sleep(200);
      await send('Page.navigate', { url: url + '#shot' });
      for (let i = 0; i < 120 && !events.includes('Page.loadEventFired'); i++) await sleep(100);
      await sleep(400);
      log('\n[13] #shot（看图模式：只显示一条「原型标注不属于应用页面」的横幅，不改排布）');
      const bannerVisible = await js(`(function(){ var b = document.querySelector('.shotbanner');
        return !!b && getComputedStyle(b).display !== 'none' && b.innerText.indexOf('不属于应用页面') >= 0; })()`);
      check('看图模式的横幅可见，且写明「不属于应用页面」', bannerVisible === true, `横幅可见=${bannerVisible}`);
      const ov2 = await overflowScan();
      check('看图模式下仍是 430、无横向溢出、13 块各 430 宽',
        ov2.docScrollWidth === W && ov2.maxRight <= W + 0.5 && ov2.minLeft >= -0.5
        && ov2.textMaxRight <= W + 0.5 && ov2.blocks.every((b) => b.w === W),
        `scrollWidth=${ov2.docScrollWidth} maxRight=${ov2.maxRight}(${ov2.maxEl}) 文本 maxRight=${ov2.textMaxRight} 块宽=${uniq(ov2.blocks.map((b) => b.w)).join(',')}`);
      const frame = JSON.parse(await js(`(function(){
        var f = document.querySelector('[data-shotframe]');
        var r = f.getBoundingClientRect();
        return JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top + window.scrollY), w: Math.round(r.width), h: Math.round(r.height) });
      })()`));
      const shot = await send('Page.captureScreenshot', {
        format: 'png', captureBeyondViewport: true,
        clip: { x: 0, y: frame.y, width: W, height: frame.h, scale: 1 },
      });
      writeFileSync(PNG_PATH, Buffer.from(shot.data, 'base64'));
      const size = pngSize(readFileSync(PNG_PATH));
      log(`\n[PNG] ${PNG_PATH}`);
      log(`      块区 CSS 尺寸 430x${frame.h} @DPR ${DPR} → 像素 ${W * DPR}x${frame.h * DPR} → 文件 ${statSync(PNG_PATH).size} 字节`);
      check('图存在且 PNG 头里的宽 ＝ 860px（430 CSS px × DPR 2）',
        size !== null && size.w === W * DPR, `PNG 实测 ${size ? size.w + 'x' + size.h : '(读不出)'}，文件 ${statSync(PNG_PATH).size} 字节`);
      check('图里块区高 ≥ 10000px（13 个块纵向排列）', size !== null && size.h >= 10000, `高 ${size ? size.h : '?'}px`);
    }

    // ---- [14] 宽屏 ----
    log('\n[14] 宽屏 1180（宽屏／桌面排布本身不在本轮表达 —— 只看块是否仍固定 430）');
    await send('Emulation.setDeviceMetricsOverride', { width: 1180, height: 900, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url });
    for (let i = 0; i < 120 && !events.includes('Page.loadEventFired'); i++) await sleep(100);
    await sleep(300);
    const o = await overflowScan();
    check('1180 下无横向溢出，且 13 个块仍是 430 CSS px 宽',
      o.innerWidth === 1180 && o.docScrollWidth === 1180 && o.blocks.length === 13 && o.blocks.every((b) => b.w === W),
      `innerWidth=${o.innerWidth} scrollWidth=${o.docScrollWidth} 块宽=${uniq(o.blocks.map((b) => b.w)).join(',')} 块左沿=${uniq(o.blocks.map((b) => b.left)).join(',')}`);

    ws.close();
  } finally {
    chrome.kill();
    await sleep(300);
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* 临时 profile 删不掉不影响结果 */ }
  }
}

// [3] 辅助：正文每行恰好 1 个文本矩形（未折行）；唯一例外：④e 的夹具长句折成 2 个视觉行
function g_lineOk(GP) {
  return GP.every((g) => g.bodyLineTexts.length >= 8
    && g.bodyLineTexts.slice(0, 8).every((t) => t.length === 1)
    && (g.bodyLineTexts.length === 8
      || (g.inst === 'd4-fx-line' && g.bodyLineTexts.length === 9 && g.bodyLineTexts[8].length === 2)));
}
function g_lineDetail(GP) {
  return GP.map((g) => `${g.inst}:${g.bodyLineTexts.map((t) => t.length).join('')}`).join(' ');
}

// ---- [15] 边界：两种「找不到就如实退出，不假装通过」----
//   (a) CHROME_BIN 指到不存在的路径 ⇒ exit 2；
//   (b) 脚本被搬到仓库外（找不到 prototype/css/theme-tech.css）⇒ exit 2。
// 两条都是**真的把本脚本再跑一遍**（子进程），不是对自己喊口号。
function boundaryChecks() {
  const bogus = join(OUT, 'no-such-chrome-' + Date.now() + '.exe');
  const r = spawnSync(process.execPath, [SELF, '--no-shot', '--no-boundary'], {
    encoding: 'utf8',
    env: { ...process.env, CHROME_BIN: bogus },
  });
  check('边界 a：CHROME_BIN 指到不存在的路径 ⇒ 子进程 exit 2 且 stderr 写「找不到无头 Chromium」（不假装通过）',
    r.status === 2 && (r.stderr || '').indexOf('找不到无头 Chromium') >= 0,
    `exit=${r.status}；stderr 首行="${(r.stderr || '').split('\n')[0]}"；stdout 长度=${(r.stdout || '').length}`);

  const away = mkdtempSync(join(tmpdir(), 'poemalign-away-'));
  const copy = join(away, 'check-poem-align.mjs');
  copyFileSync(SELF, copy);
  const r2 = spawnSync(process.execPath, [copy, '--no-shot', '--no-boundary'], {
    encoding: 'utf8',
    env: { ...process.env, CHROME_BIN: process.env.CHROME_BIN || CHROME },
  });
  check('边界 b：脚本被搬到仓库外（向上找不到 prototype/css/theme-tech.css）⇒ 子进程 exit 2 且 stderr 写「找不到仓库根」',
    r2.status === 2 && (r2.stderr || '').indexOf('找不到仓库根') >= 0,
    `exit=${r2.status}；stderr 首行="${(r2.stderr || '').split('\n')[0]}"`);
  try { rmSync(away, { recursive: true, force: true }); } catch { /* 临时目录删不掉不影响结果 */ }
}

try {
  await run();
  if (BOUNDARY) {
    log('\n[15] 边界：用坏掉的 CHROME_BIN／把脚本搬到仓库外，各再跑一次本脚本（子进程；对本进程无副作用）');
    boundaryChecks();
  } else {
    log('\n[14] 已跳过边界自测（--no-boundary）');
  }
} catch (e) {
  console.error('\n校验脚本失败：' + ((e && e.stack) || e));
  failures++;
}
console.log(`\n===== 失败断言数：${failures} =====`);
process.exit(failures ? 1 : 0);
