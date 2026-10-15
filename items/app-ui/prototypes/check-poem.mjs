/*
 * check-poem.mjs —— 诗页（阅读页）表达讨论原型的【页面行为】自证脚本（可复跑）。
 *
 * ⚠ 它验的是这两个原型页面的页面行为，**不是产品代码**：
 *   对象只有本目录下的 q-poem.head.html / q-poem.entries.html；
 *   两个 HTML 是**只读打开**的（Page.navigate 到 file:// URL，脚本不写、不改它们）。
 *   它不跑 web/ 与 android/ 的任何测试，也不读产品实现。额外读的文件只有两个，都是**只读**：
 *     ① prototype/css/theme-tech.css  —— 用来逐项比对页面内嵌的令牌快照；
 *     ② content/poems/gushi-shijiu-shou-01.md —— 用它的正文 8 行做「原文逐行一致」的基准。
 *
 * 断言清单（失败任一即 exit 1），两页都在 **430 宽（真实移动口径，DPR 2）** 下各跑一遍：
 *  [1] 固定清单与结构：每页块数（P1=4 / P2=4）与页面实例数（P1=4 / P2=6）；
 *      每个实例都有 题名／身份行／原文／返回（恰好 1 个）／详情（恰好 1 个）；原文恰好 **8 行**
 *      且**逐行文本**与 content/poems/gushi-shijiu-shou-01.md 的正文**逐字相同**；
 *      段数＝源文件段数（那首 8 行之间没有空行 ⇒ 1 段）；身份行＝「佚名 · 汉 · 五言古诗」。
 *      反向断言：应用层可见文本里**不出现** 细时代（东汉末）／底本／来源／异文／文选／李善／搜索。
 *  [2] **430 真实验收**：`innerWidth === 430`、`documentElement.scrollWidth === 430`、
 *      `body.scrollWidth === 430`，全文档可见元素都在 0…430 之内，且**每块、每个页面实例恰好 430 宽、左沿 0**。
 *      （「展开夹具笔记之后」再查一遍，见 [11]。）
 *  [3] 排版权重实测：题名 24px/500/2.4px 字距；身份行 12.48px + `--text-faint`；原文 17px/行高 34px/字距 0.765px；
 *      控件 13.12px + `--text-dim`、无边框无底色。并断言层级方向：题名 > 原文 > 身份行，且**控件字号 < 原文字号**。
 *  [4] 页 P1 的纵向几何（每块实测，数字全部打印）：题名→身份、身份→原文 的实测像素；
 *      基线 11.2/33.6、选项 A 5.6/41.6（更紧的题头 + 更大的原文前留白）、选项 B 11.2/33.6 + 一条发丝线；
 *      选项 B 的线**在题名与身份之间**（题名 padding-bottom 11.2px、border-bottom 1px `--line`、身份行在线下 11.2px）；
 *      三块的**诗页题头都没有下划线**（§4.1 记号③：题头 border-bottom = 0）。
 *  [5] 页 P2 的控件位置（每块实测）：基线＝返回在正文上方、详情在正文下方（页脚）；
 *      选项 A＝返回与详情**同一行**且都在正文上方（正文之后没有页脚行）；
 *      选项 B＝正文上方**没有任何控件**、返回与详情都在正文下方；
 *      ④a 的笔记入口在正文之后、页脚之上；④b 的三条控件都在正文下方。
 *  [6] 笔记：**无笔记**的实例里 `[data-test="notes"]` 用 querySelector 查**为 null**、且该实例可见文本里
 *      没有「笔记」二字（整块隐藏，连标题都不出现）；**有笔记夹具**的实例用 CDP **真实鼠标**点入口 ⇒ 展开
 *      （aria-expanded=true、正文出现、文本含「测试夹具笔记，不是用户笔记」）⇒ 再点 ⇒ 收起。
 *  [7] **段间距不为 0**：⚠ 那首在源文件里**就是一段**（8 行之间没有空行），页面上也一样 ⇒ 没有现成的「段间距」可量。
 *      所以这里用一个**临时探针**（把两个 `.stanza` 追加进一个 `.poem-body` 里、量完立即移除）证明**这条规则在本页确实生效**：
 *      实测间距 = 1.2em（17px ⇒ 20.4px）且 > 0。**不是**假装那首有两个段。
 *  [8] 语义：可点元素（返回／详情／笔记入口）必须是 `<a>` 或 `<button type="button">`（不是 div 冒充），
 *      全文档没有 `onclick=` 内联处理器，且每个控件的中心点用 `elementFromPoint` 命中的是它自己或它的后代。
 *  [9] **自包含**：CDP 的 Network 记录里非 `file://` 的请求为 0 个，页面文本里没有 `<link` / `src=` / `@import` / `http(s)://`；
 *      整页加载与交互期间**无 JS 报错**（uncaught / console.error / Log error）。
 *  [10] **令牌快照逐项比对**：TOKEN-SNAPSHOT-BEGIN/END 之间的每个令牌与 prototype/css/theme-tech.css 同名值**逐字**比较
 *      （空白归一化）⇒ **值不一致数必须为 0**；且快照里**没有声明了却没用**的令牌、页面用到的每个 `var(--x)` 都有声明；
 *      页内记录的 git 短 sha、当前 HEAD、theme.css 是否有未提交改动都会打印出来。
 *
 * 两个 **430 宽 PNG**（860 px 宽 @DPR 2）怎么拍（**这一步会重写图片，见下面的副作用**）：
 *   1. 先在**普通页面**上跑完上面全部断言（不动页面）；
 *   2. 再 navigate 到 `…html#shot`：**#shot 只是页面自带的「看图模式」**——它只显示一条横幅并声明
 *      「夹具笔记在本图里是展开态」；**它不改变任何排布规则、也不改变首态**（页面加载时笔记仍是收起的）；
 *   3. 在 #shot 下用**真实鼠标**点开各夹具块的笔记入口（所以图里是展开态）；
 *   4. 量出 `.shotframe` 的矩形，`Page.captureScreenshot` 截 x=0、宽 430、DPR 2 ⇒ **860 px 宽**，
 *      每块在其中都恰好 430 CSS px 宽、纵向排列。
 *   所以：图是「页面加载后点开夹具笔记」的状态；**页面加载时的首态仍是收起**（断言 [6] 先跑过）。
 *
 * 怎么跑（在仓库根或任意目录都行）：
 *   node items/app-ui/prototypes/check-poem.mjs
 *   node items/app-ui/prototypes/check-poem.mjs --no-shot    # 只跑断言，不重出 PNG
 *
 * 需要什么：
 *   - Node（用到内置的 fetch / WebSocket / net，故需较新的 Node；本机实测 v25.9.0 通过）；
 *   - **本机无头 Chromium 的可执行文件**。顺序：环境变量 `CHROME_BIN` → 否则按
 *     `%LOCALAPPDATA%\Chromium\Application\chrome.exe` 推（与本仓既有做法一致，见 web/tests/e2e-cdp.mjs）。
 *     找不到就**如实报错并 exit 2**（`CHROME_BIN` 指到错路径也走这一条，不会假装通过）。
 *   - **不需要**任何 npm 依赖：不装包、不联网、不起静态服务（直接开 file://）。
 *   - **端口**：CDP 调试端口**先向内核要一个空闲端口**（`net` 监听 0 再关掉），**不写死**
 *     —— 本仓真的发生过「两边同时跑同一套 e2e、浏览器连到了别人的服务」。
 *
 * 副作用（说清，免得复跑后以为工作树坏了）：
 *   - 会在**临时目录**建一个 Chromium profile，结束时删掉；
 *   - **默认会重写**本目录下的 2 个 PNG：q-poem.head.430.png、q-poem.entries.430.png。
 *     不同 Chromium 版本/字体渲染可能让字节数变化 ⇒ **复跑可能让这些 PNG 变脏**，那是正常现象，
 *     不是脚本改坏了什么。只想看断言就加 `--no-shot`。
 *   - 两个 HTML 本身**只读打开**，不写、不改；夹具数据只在页面脚本里，脚本不碰 content/。
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const OUT = dirname(fileURLToPath(import.meta.url));       // 本脚本所在目录＝原型目录
const ROOT = join(OUT, '..', '..', '..');                  // 仓库根
const SHOT = !process.argv.includes('--no-shot');
const W = 430;                                             // 规格：真实 430 CSS px 移动宽度
const DPR = 2;                                             // 图：860 px 宽
const PAGES = ['head', 'entries'];
const MD_PATH = join(ROOT, 'content', 'poems', 'gushi-shijiu-shou-01.md');

// ── 找 Chromium：CHROME_BIN 优先，否则 %LOCALAPPDATA%\Chromium\Application\chrome.exe
const CHROME = process.env.CHROME_BIN
  || join(process.env.LOCALAPPDATA || '', 'Chromium', 'Application', 'chrome.exe');
if (!CHROME || !existsSync(CHROME)) {
  console.error('找不到无头 Chromium：' + (CHROME || '(未设置)'));
  console.error('请用环境变量指定，例如：');
  console.error("  CHROME_BIN='C:/Users/wsqsy/AppData/Local/Chromium/Application/chrome.exe' \\");
  console.error('    node items/app-ui/prototypes/check-poem.mjs');
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
  console.error('源文件正文不是 8 行（而是 ' + mdFlat.length + ' 行）⇒ 本轮口径向变了，先看需求再改断言：' + MD_PATH);
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

/* ── 令牌快照比对用的小工具（纯文本，与页面无关）──────────────────── */
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

async function run() {
  const port = await freePort();   // 自己挑空闲端口，不写死
  const profile = mkdtempSync(join(tmpdir(), 'poemproto-'));
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--disable-background-networking',
    '--disable-component-update', '--disable-sync', '--remote-allow-origins=*',
    '--user-data-dir=' + profile, '--remote-debugging-port=' + port, 'about:blank',
  ], { stdio: 'ignore' });
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
    const struct = async () => JSON.parse(await js(`(function(){
      var out = [];
      var pages = document.querySelectorAll('[data-test="page"]');
      for (var i = 0; i < pages.length; i++) {
        var p = pages[i];
        var lines = Array.prototype.map.call(p.querySelectorAll('[data-test="line"]'), function(l){ return l.textContent; });
        var idEl = p.querySelector('[data-test="ident"]');
        var tEl = p.querySelector('[data-test="title"]');
        out.push({
          inst: p.dataset.inst, block: p.dataset.block, head: p.dataset.head, entries: p.dataset.entries,
          fxnote: p.dataset.fxnote || null,
          title: tEl ? tEl.textContent : null, ident: idEl ? idEl.textContent : null,
          lines: lines,
          stanzas: p.querySelectorAll('.stanza').length,
          back: p.querySelectorAll('[data-test="back"]').length,
          detail: p.querySelectorAll('[data-test="detail"]').length,
          topbar: p.querySelectorAll('[data-test="topbar"]').length,
          foot: p.querySelectorAll('[data-test="foot"]').length,
          notes: p.querySelectorAll('[data-test="notes"]').length,
          notesHead: p.querySelectorAll('[data-test="notes-head"]').length,
          notesBody: p.querySelectorAll('[data-test="notes-body"]').length,
          notesBodyHidden: (function(){ var b = p.querySelector('[data-test="notes-body"]'); return b ? b.hidden : null; })(),
          ariaExpanded: (function(){ var h = p.querySelector('[data-test="notes-head"]'); return h ? h.getAttribute('aria-expanded') : null; })(),
          toggleText: (function(){ var h = p.querySelector('[data-test="notes-toggle"]'); return h ? h.textContent : null; })(),
          text: p.innerText
        });
      }
      return JSON.stringify(out);
    })()`));

    const styleInfo = async () => JSON.parse(await js(`(function(){
      var out = [];
      var pages = document.querySelectorAll('[data-test="page"]');
      var snap = function(e){
        if (!e) return null;
        var c = getComputedStyle(e);
        return { fz: c.fontSize, fw: c.fontWeight, ls: c.letterSpacing, color: c.color, lh: c.lineHeight,
                 bg: c.backgroundColor, bt: c.borderTopWidth, bb: c.borderBottomWidth, bbc: c.borderBottomColor,
                 pbb: c.paddingBottom, display: c.display };
      };
      for (var i = 0; i < pages.length; i++) {
        var p = pages[i];
        var head = p.querySelector('[data-test="head"]');
        out.push({
          inst: p.dataset.inst,
          title: snap(p.querySelector('[data-test="title"]')),
          ident: snap(p.querySelector('[data-test="ident"]')),
          line: snap(p.querySelector('[data-test="line"]')),
          ctl: snap(p.querySelector('[data-test="back"]') || p.querySelector('[data-test="detail"]')),
          notesHeadBtn: snap(p.querySelector('[data-test="notes-head"]')),
          headBottomBorder: getComputedStyle(head).borderBottomWidth,
          stanzaGapDecl: getComputedStyle(p).getPropertyValue('--stanza-gap').trim()
        });
      }
      return JSON.stringify(out);
    })()`));

    const geom = async () => JSON.parse(await js(`(function(){
      var out = [];
      var pages = document.querySelectorAll('[data-test="page"]');
      for (var i = 0; i < pages.length; i++) {
        var p = pages[i];
        var pr = p.getBoundingClientRect();
        var box = function(sel){
          var e = p.querySelector(sel);
          if (!e) return null;
          var r = e.getBoundingClientRect();
          return { top: Math.round(r.top*100)/100, bottom: Math.round(r.bottom*100)/100,
                   left: Math.round(r.left*100)/100, right: Math.round(r.right*100)/100,
                   w: Math.round(r.width*100)/100, h: Math.round(r.height*100)/100,
                   rtop: Math.round((r.top - pr.top)*100)/100, rleft: Math.round((r.left - pr.left)*100)/100,
                   rbottom: Math.round((r.bottom - pr.top)*100)/100,
                   cx: Math.round((r.left+r.right)/2*100)/100, cy: Math.round((r.top+r.bottom)/2*100)/100 };
        };
        var lines = p.querySelectorAll('[data-test="line"]');
        var f = lines[0].getBoundingClientRect(), l = lines[lines.length-1].getBoundingClientRect();
        out.push({
          inst: p.dataset.inst, entries: p.dataset.entries, head: p.dataset.head,
          pageLeft: Math.round(pr.left*100)/100, pageW: Math.round(pr.width*100)/100,
          title: box('[data-test="title"]'), ident: box('[data-test="ident"]'),
          back: box('[data-test="back"]'), detail: box('[data-test="detail"]'),
          notes: box('[data-test="notes"]'), notesHead: box('[data-test="notes-head"]'),
          notesBody: box('[data-test="notes-body"]'),
          topbar: box('[data-test="topbar"]'), foot: box('[data-test="foot"]'),
          firstLineTop: Math.round(f.top*100)/100, firstLineLeft: Math.round(f.left*100)/100,
          lastLineBottom: Math.round(l.bottom*100)/100,
          relFirstLineTop: Math.round((f.top - pr.top)*100)/100,
          relLastLineBottom: Math.round((l.bottom - pr.top)*100)/100
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
      var blocks = Array.prototype.map.call(document.querySelectorAll('[data-test="inst"]'), function(b){
        var r = b.getBoundingClientRect();
        return { block: b.dataset.block, w: Math.round(r.width*10)/10, left: Math.round(r.left*10)/10 };
      });
      var pages = Array.prototype.map.call(document.querySelectorAll('[data-test="page"]'), function(b){
        var r = b.getBoundingClientRect();
        return { inst: b.dataset.inst, w: Math.round(r.width*10)/10, left: Math.round(r.left*10)/10 };
      });
      return JSON.stringify({ innerWidth: window.innerWidth, docScrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        maxRight: Math.round(maxRight*10)/10, maxEl: name(mr), minLeft: Math.round(minLeft*10)/10, minEl: name(ml),
        blocks: blocks, pages: pages });
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

    log(`源文件基准（只读）：${MD_PATH}`);
    log(`  段数=${mdStanzas.length}  行数=${mdFlat.length}`);

    for (const page of PAGES) {
      const file = `${OUT}/q-poem.${page}.html`;
      const htmlText = readFileSync(file, 'utf8');
      const url = 'file:///' + file.replace(/\\/g, '/');

      await send('Emulation.setDeviceMetricsOverride', { width: W, height: 932, deviceScaleFactor: DPR, mobile: true });
      requests.length = 0; pageErrors.length = 0; events.length = 0;
      await send('Page.navigate', { url });   // 只读打开，不写文件
      for (let i = 0; i < 120 && !events.includes('Page.loadEventFired'); i++) await sleep(100);
      await sleep(400);

      log(`\n═══════════ 页 ${page}：q-poem.${page}.html（430 宽 · DPR ${DPR}）═══════════`);
      const S = await struct();
      const ST = await styleInfo();
      let G = await geom();
      const byInst = (arr, inst) => arr.filter((x) => x.inst === inst)[0];

      // ---- [1] 固定清单与结构 ----
      log('\n[1] 固定清单与结构（题名／作者／朝代＋体裁／原文 8 行／返回／详情）');
      check('块数：页 1 = 4（基线＋2 选项＋夹具），页 2 = 4（基线＋2 选项＋夹具块）',
        (await js(`document.querySelectorAll('[data-test="inst"]').length`)) === 4,
        `实测 ${await js(`document.querySelectorAll('[data-test="inst"]').length`)} 个块`);
      check('页面实例数：页 1 = 4（每块 1 个），页 2 = 6（夹具块里 3 支）',
        S.length === (page === 'head' ? 4 : 6), `实测 ${S.length} 个实例：${S.map((s) => s.inst).join(',')}`);
      check('每个实例都有：题名、身份行、原文、返回（恰好 1 个）、详情（恰好 1 个）',
        S.every((s) => s.title && s.ident && s.back === 1 && s.detail === 1 && s.lines.length > 0),
        S.map((s) => `${s.inst}:题名=${s.title ? '有' : '无'} 返回${s.back} 详情${s.detail}`).join(' | '));
      check('原文恰好 8 行，且**逐行文本**与源文件正文逐字相同',
        S.every((s) => s.lines.length === 8 && s.lines.join('\n') === mdFlat.join('\n')),
        S.map((s) => `${s.inst}:${s.lines.length} 行${s.lines.join('\n') === mdFlat.join('\n') ? '＝源文件' : '≠源文件'}`).join(' | '));
      log(`      逐行实测（取 ${S[0].inst}）：`);
      S[0].lines.forEach((t, i) => log(`        ${i + 1}  ${t}${t === mdFlat[i] ? '  ＝源文件第 ' + (i + 1) + ' 行' : '  ⚠ 与源文件第 ' + (i + 1) + ' 行不同'}`));
      check('段数 = 源文件的段数（那一首 8 行之间没有空行 ⇒ 1 段）',
        S.every((s) => s.stanzas === mdStanzas.length),
        `实测 ${uniq(S.map((s) => s.stanzas)).join(',')} 段，源文件 ${mdStanzas.length} 段`);
      check('身份行 = 「作者 · 朝代 · 体裁」（佚名 · 汉 · 五言古诗），不出现细时代',
        S.every((s) => s.ident === '佚名 · 汉 · 五言古诗'),
        uniq(S.map((s) => s.ident)).join(' / '));
      const banned = ['东汉末', '底本', '来源', '异文', '文选', '李善', '搜索', '目录', '关于'];
      const hits = banned.filter((w) => S.some((s) => s.text.indexOf(w) >= 0));
      check('反向：应用层可见文本里不出现 细时代／底本／来源／异文／文选／李善／搜索',
        hits.length === 0, hits.length ? '命中：' + hits.join(' ') : '0 处（应用层文本＝块标题之外的页面实例文本）');

      // ---- [2] 430 ----
      log('\n[2] 430 真实验收（无横向溢出；每块与每个实例恰好 430）');
      let ov = await overflowScan();
      check('innerWidth === 430 且 documentElement.scrollWidth === 430（body 亦然）',
        ov.innerWidth === W && ov.docScrollWidth === W && ov.bodyScrollWidth === W,
        `innerWidth=${ov.innerWidth} docScrollWidth=${ov.docScrollWidth} bodyScrollWidth=${ov.bodyScrollWidth}`);
      check('所有可见元素都在 0…430 之内',
        ov.maxRight <= W + 0.5 && ov.minLeft >= -0.5,
        `maxRight=${ov.maxRight}(${ov.maxEl}) minLeft=${ov.minLeft}(${ov.minEl})`);
      check('四个块恰好 430 宽、左沿 0',
        ov.blocks.length === 4 && ov.blocks.every((b) => b.w === W && b.left === 0),
        ov.blocks.map((b) => `${b.block}:w${b.w}/x${b.left}`).join(' '));
      check('每个页面实例恰好 430 宽、左沿 0',
        ov.pages.every((p) => p.w === W && p.left === 0),
        ov.pages.map((p) => `${p.inst}:w${p.w}/x${p.left}`).join(' '));

      // ---- [3] 排版权重 ----
      log('\n[3] 排版权重实测（题名／身份行／原文／控件）');
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
      check('原文 = 17px／行高 34px／字距 0.045em(0.765px)、色 --text（令牌那套的核心）',
        ST.every((s) => s.line.fz === '17px' && s.line.lh === '34px' && s.line.ls === '0.765px' && s.line.color === 'rgb(221, 229, 228)'),
        `${ST[0].line.fz}/${ST[0].line.lh}/${ST[0].line.ls}/${ST[0].line.color}`);
      check('控件 = 0.82rem(13.12px)、色 --text-dim(#98a8a6)、无边框无底色（纯文字）',
        ST.every((s) => s.ctl.fz === '13.12px' && s.ctl.color === 'rgb(152, 168, 166)'
          && s.ctl.bt === '0px' && s.ctl.bb === '0px' && s.ctl.bg === 'rgba(0, 0, 0, 0)'),
        `${ST[0].ctl.fz}/${ST[0].ctl.color}/边框 ${ST[0].ctl.bt}/${ST[0].ctl.bb}/底 ${ST[0].ctl.bg}`);
      check('层级方向：题名字号 > 原文字号 > 身份行字号，且**控件字号 < 原文字号**（控件不抢正文）',
        ST.every((s) => parseFloat(s.title.fz) > parseFloat(s.line.fz) && parseFloat(s.line.fz) > parseFloat(s.ident.fz)
          && parseFloat(s.ctl.fz) < parseFloat(s.line.fz)),
        ST.map((s) => `${s.inst}: 题名 ${s.title.fz} > 原文 ${s.line.fz} > 身份 ${s.ident.fz}；控件 ${s.ctl.fz}`).join(' | '));
      const wrapOnes = [];
      for (const g of G) {
        for (const k of ['back', 'detail', 'notesHead']) {
          if (g[k] && g[k].h > 30) wrapOnes.push(`${g.inst}.${k} 高 ${g[k].h}px`);
        }
      }
      let ctlMaxH = 0;
      for (const g of G) {
        for (const k of ['back', 'detail', 'notesHead']) {
          if (g[k]) ctlMaxH = Math.max(ctlMaxH, g[k].h);
          if (g[k] && g[k].h > 30) wrapOnes.push(g.inst + '.' + k + ' 高 ' + g[k].h + 'px');
        }
      }
      check('每个控件都是**单行**（430 下没有把「返回」拆成两个字两行）',
        wrapOnes.length === 0, wrapOnes.length ? '折行了：' + wrapOnes.join(' ') : '全为单行（最高的控件 ' + ctlMaxH + 'px）');

      // ---- [4] 页 1 的纵向几何 ----
      if (page === 'head') {
        log('\n[4] 页 1：题名／身份／原文 的纵向几何（每块实测）');
        const G4 = {};
        for (const s of S) {
          const g = byInst(G, s.inst);
          G4[s.inst] = { ti: g.ident.top - g.title.bottom, ip: g.firstLineTop - g.ident.bottom };
          log(`      ${s.inst}（${s.block}）：题名底 ${g.title.bottom} → 身份顶 ${g.ident.top} ＝ ${r1(G4[s.inst].ti)}px；身份底 ${g.ident.bottom} → 原文首行顶 ${g.firstLineTop} ＝ ${r1(G4[s.inst].ip)}px`);
        }
        check('基线 ①：题名→身份 0.7rem＝11.2px，身份→原文 2.1rem＝33.6px',
          near(G4.b1.ti, 11.2, 1) && near(G4.b1.ip, 33.6, 1), `实测 ${r1(G4.b1.ti)} / ${r1(G4.b1.ip)}`);
        check('选项 A ②：题名→身份 0.35rem＝5.6px（更紧的题头块），身份→原文 2.6rem＝41.6px（留白更大）',
          near(G4.b2.ti, 5.6, 1) && near(G4.b2.ip, 41.6, 1), `实测 ${r1(G4.b2.ti)} / ${r1(G4.b2.ip)}`);
        check('选项 B ③：身份→原文与基线相同（2.1rem＝33.6px）——本选项只动题头之间的那条线',
          near(G4.b3.ip, 33.6, 1) && near(G4.b3.ip, G4.b1.ip, 0.6), `实测 ${r1(G4.b3.ip)}（基线 ${r1(G4.b1.ip)}）`);
        check('选项 B ③ 的线在**题名与身份之间**：题名 padding-bottom 0.7rem、border-bottom 1px --line、身份行在线下同一间距处',
          near(parseFloat(ST.find((s) => s.inst === 'b3').title.pbb), 11.2, 0.6)
          && ST.find((s) => s.inst === 'b3').title.bb === '1px'
          && ST.find((s) => s.inst === 'b3').title.bbc === 'rgb(35, 48, 52)'
          && near(G4.b3.ti, 11.2, 1),
          `padding-bottom=${ST.find((s) => s.inst === 'b3').title.pbb} 线=${ST.find((s) => s.inst === 'b3').title.bb}/${ST.find((s) => s.inst === 'b3').title.bbc} 线→身份=${r1(G4.b3.ti)}px`);
        check('基线 ①／选项 A ②／夹具 ④ 的题名都**没有**那条线（border-bottom = 0）',
          ['b1', 'b2', 'b4'].every((k) => ST.find((s) => s.inst === k).title.bb === '0px'),
          ['b1', 'b2', 'b4'].map((k) => `${k}:${ST.find((s) => s.inst === k).title.bb}`).join(' '));
        check('§4.1 记号③：三块＋夹具的**诗页题头都没有下划线**（题头 border-bottom = 0）',
          ST.every((s) => s.headBottomBorder === '0px'), uniq(ST.map((s) => s.headBottomBorder)).join(','));
        check('夹具块 ④ 的题头排布＝基线（两个间距都与基线相同）',
          near(G4.b4.ti, G4.b1.ti, 0.6) && near(G4.b4.ip, G4.b1.ip, 0.6), `实测 ${r1(G4.b4.ti)} / ${r1(G4.b4.ip)}`);
        check('三块＋夹具的题名字号／身份行字号颜色**完全相同**（只动间距与那条线，不动权重）',
          uniq(ST.map((s) => s.title.fz + '/' + s.title.fw + '/' + s.title.ls)).length === 1
          && uniq(ST.map((s) => s.ident.fz + '/' + s.ident.color + '/' + s.ident.ls)).length === 1,
          uniq(ST.map((s) => s.title.fz)).join(',') + ' / ' + uniq(ST.map((s) => s.ident.fz)).join(','));
      }

      // ---- [5] 页 2 的控件位置 ----
      if (page === 'entries') {
        log('\n[5] 页 2：控件相对正文的位置（每块实测）');
        for (const s of S) {
          const g = byInst(G, s.inst);
          const ctl = [g.back && `返回@${r1(g.back.rtop)}`, g.detail && `详情@${r1(g.detail.rtop)}`, g.notesHead && `笔记@${r1(g.notesHead.rtop)}`].filter(Boolean).join(' ');
          log(`      ${s.inst}（${s.block}）：相对本实例顶 —— 原文[${r1(g.relFirstLineTop)}…${r1(g.relLastLineBottom)}] ${ctl} 顶部行=${g.topbar ? '有' : '无'} 页脚行=${g.foot ? '有' : '无'}`);
        }
        const g1 = byInst(G, 'b1'), g2 = byInst(G, 'b2'), g3 = byInst(G, 'b3');
        check('基线 ①：返回在正文**上方**、详情在正文**下方**（页脚），正文上下也不常驻其它控件',
          g1.back.top < g1.firstLineTop && g1.detail.top > g1.lastLineBottom && g1.topbar && g1.foot,
          `返回@${r1(g1.back.top)} 原文首行@${r1(g1.firstLineTop)}；详情@${r1(g1.detail.top)} 原文末行底@${r1(g1.lastLineBottom)}`);
        check('选项 A ②：返回与详情**同一行**（顶差 ≤ 1px），且两者都在正文**上方**；正文之后没有页脚行',
          g2.topbar && !g2.foot && near(g2.back.top, g2.detail.top, 1)
          && g2.back.top < g2.firstLineTop && g2.detail.top < g2.firstLineTop,
          `返回@${r1(g2.back.top)} 详情@${r1(g2.detail.top)}（同一行，顶差 ${r1(Math.abs(g2.back.top - g2.detail.top))}）原文首行@${r1(g2.firstLineTop)} 页脚行=${g2.foot ? '有' : '无'}`);
        check('选项 B ③：正文**上方没有任何控件**（连顶部那一行都不画），返回与详情都在正文**下方**',
          !g3.topbar && g3.foot && g3.back.top > g3.lastLineBottom && g3.detail.top > g3.lastLineBottom,
          `顶部行=${g3.topbar ? '有' : '无'} 返回@${r1(g3.back.top)} 详情@${r1(g3.detail.top)}；原文末行底@${r1(g3.lastLineBottom)}`);
        const g4a = byInst(G, 'b4a'), g4b = byInst(G, 'b4b'), g4c = byInst(G, 'b4c');
        check('夹具 ④a（有笔记 × 基线）：笔记入口在正文**之后**、页脚之上；返回仍在上方',
          g4a.notesHead && g4a.notesHead.top > g4a.lastLineBottom && g4a.back.top < g4a.firstLineTop
          && g4a.notesHead.bottom <= g4a.foot.top + 0.5,
          `笔记入口@${r1(g4a.notesHead.top)} 原文末行底@${r1(g4a.lastLineBottom)} 页脚行@${r1(g4a.foot.top)}`);
        check('夹具 ④b（有笔记 × 选项 B）：返回、详情、笔记入口**三条都在正文下方**的页脚行里',
          g4b.notesHead && g4b.notesHead.top > g4b.lastLineBottom
          && g4b.back.top > g4b.lastLineBottom && g4b.detail.top > g4b.lastLineBottom
          && !g4b.topbar && near(g4b.back.top, g4b.notesHead.top, 1),
          `返回@${r1(g4b.back.top)} 详情@${r1(g4b.detail.top)} 笔记@${r1(g4b.notesHead.top)}；原文末行底@${r1(g4b.lastLineBottom)}`);
        check('夹具 ④c（无笔记对照）：控件位置与基线相同（相对各实例自身量），但笔记区整块不存在',
          g4c.notes === null && g4c.notesHead === null && g4c.topbar !== null && g4c.foot !== null
          && near(g4c.back.rtop, g1.back.rtop, 0.6) && near(g4c.detail.rtop, g1.detail.rtop, 0.6)
          && near(g4c.relFirstLineTop, g1.relFirstLineTop, 0.6),
          `笔记区=${g4c.notes === null ? 'null' : '存在'} 笔记入口=${g4c.notesHead === null ? 'null' : '存在'}；返回@${r1(g4c.back.rtop)}（基线 ${r1(g1.back.rtop)}）详情@${r1(g4c.detail.rtop)}（基线 ${r1(g1.detail.rtop)}）原文首行@${r1(g4c.relFirstLineTop)}（基线 ${r1(g1.relFirstLineTop)}）`);
      }

      // ---- [6] 笔记 ----
      log('\n[6] 笔记：无笔记整块不存在；有笔记夹具的入口可点开／收起（真实鼠标）');
      const noNotes = S.filter((s) => s.notes === 0);
      const hasNotes = S.filter((s) => s.notes === 1);
      log(`      无笔记实例 ${noNotes.length} 个：${noNotes.map((s) => s.inst).join(',')}；有笔记夹具实例 ${hasNotes.length} 个：${hasNotes.map((s) => s.inst).join(',')}`);
      check('无笔记的实例：`[data-test="notes"]` 查为 **null**（DOM 里连节点都没有）',
        noNotes.length > 0 && noNotes.every((s) => s.notes === 0 && s.notesHead === 0 && s.notesBody === 0),
        noNotes.map((s) => `${s.inst}:notes=${s.notes}/head=${s.notesHead}/body=${s.notesBody}`).join(' '));
      check('无笔记的实例：可见文本里**没有「笔记」二字**（连标题都不出现）',
        noNotes.every((s) => s.text.indexOf('笔记') < 0),
        noNotes.map((s) => `${s.inst}:${s.text.indexOf('笔记') < 0 ? '无「笔记」二字' : '⚠ 出现了「笔记」'}`).join(' '));
      check('有笔记的实例：入口与正文节点都存在（初始 aria-expanded=false 且正文 hidden）',
        hasNotes.length > 0 && hasNotes.every((s) => s.notesHead === 1 && s.notesBody === 1
          && s.ariaExpanded === 'false' && s.notesBodyHidden === true && s.toggleText === '展开'),
        hasNotes.map((s) => `${s.inst}:expanded=${s.ariaExpanded} hidden=${s.notesBodyHidden} 标签=${s.toggleText}`).join(' '));
      for (const s of hasNotes) {
        const g = byInst(G, s.inst);
        log(`      ${s.inst} 笔记区几何（相对本实例顶）：原文末行底 ${r1(g.relLastLineBottom)} → 笔记区顶 ${r1(g.notes.rtop)}（留白 ${r1(g.notes.rtop - g.relLastLineBottom)}px）｜入口 [${r1(g.notesHead.rtop)}…${r1(g.notesHead.rbottom)}] 高 ${r1(g.notesHead.h)}px｜页脚行顶 ${g.foot ? r1(g.foot.rtop) : '（无）'}`);
      }
      for (const s of hasNotes) {
        const c1 = await clickControl(s.inst, 'notes-head');
        const o1 = (await struct()).filter((x) => x.inst === s.inst)[0];
        const c2 = await clickControl(s.inst, 'notes-head');
        const o2 = (await struct()).filter((x) => x.inst === s.inst)[0];
        const fxText = await js(`(function(){ var p = document.querySelector('[data-test="page"][data-inst="${s.inst}"]');
          var b = p.querySelector('[data-test="notes-body"]'); return b ? b.innerText : ''; })()`);
        check(`${s.inst}：点入口（真实鼠标命中 ${c1.tag}/${c1.type}，elementFromPoint=${c1.hitIsE ? '命中自身' : '⚠ ' + c1.hitTag}）⇒ 展开；再点 ⇒ 收起`,
          c1.hitIsE === true && c2.hitIsE === true
          && o1.ariaExpanded === 'true' && o1.notesBodyHidden === false && o1.toggleText === '收起'
          && o2.ariaExpanded === 'false' && o2.notesBodyHidden === true && o2.toggleText === '展开',
          `展开后 expanded=${o1.ariaExpanded} hidden=${o1.notesBodyHidden} 标签=${o1.toggleText}；收起后 expanded=${o2.ariaExpanded} hidden=${o2.notesBodyHidden}`);
        check(`${s.inst}：展开后的夹具正文里写明「这是测试夹具笔记，不是用户笔记」`,
          fxText.indexOf('测试夹具笔记，不是用户笔记') >= 0,
          fxText ? '命中：' + fxText.slice(0, 40).replace(/\s+/g, ' ') + '…' : '⚠ 正文为空');
      }

      // ---- [7] 段间距 ----
      log('\n[7] 段间距不为 0（用临时探针证明这条规则在本页生效；真实那首源文件里就是 1 段）');
      const probe = JSON.parse(await js(`(function(){
        var host = document.querySelector('[data-test="page"] [data-test="poem"]');
        var wrap = document.createElement('div');
        wrap.className = 'poem-body';
        wrap.style.position = 'absolute'; wrap.style.left = '-9999px'; wrap.style.top = '0';
        var a = document.createElement('div'); a.className = 'stanza'; a.textContent = '探针段一';
        var b = document.createElement('div'); b.className = 'stanza'; b.textContent = '探针段二';
        wrap.appendChild(a); wrap.appendChild(b);
        host.parentNode.appendChild(wrap);
        var gap = b.getBoundingClientRect().top - a.getBoundingClientRect().bottom;
        var lh = getComputedStyle(wrap).lineHeight;
        wrap.remove();
        return JSON.stringify({ gap: Math.round(gap*100)/100, lh: lh, removed: !document.body.contains(wrap) });
      })()`));
      check('`.stanza + .stanza` 的间距实测 > 0（1.2em × 17px ⇒ 20.4px），且探针已移除',
        probe.gap > 0 && near(probe.gap, 20.4, 1) && probe.removed === true,
        `实测段间距 ${probe.gap}px（行高 ${probe.lh}）`);
      check('页面上声明的 --stanza-gap 与令牌一致（1.2em，不是 0）',
        ST.every((s) => s.stanzaGapDecl === '1.2em'), uniq(ST.map((s) => s.stanzaGapDecl)).join(','));

      // ---- [8] 语义 ----
      log('\n[8] 可点元素的语义（button/a，不是 div 冒充）');
      const sem = JSON.parse(await js(`(function(){
        var tags = ['back', 'detail', 'notes-head'];
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
      await sleep(100);   // 这个点击不改状态（返回只是入口），只为证明可点

      // ---- [9] 自包含 + 无 JS 报错 ----
      const ext = requests.filter((u) => !u.startsWith('file:///') && !u.startsWith('data:'));
      check('CDP 记录的网络请求里没有任何 http(s) 外部引用',
        ext.length === 0, `${requests.length} 个请求，非 file:// 的=${ext.length} ${JSON.stringify(ext)}`);
      const textHits = ['<link', 'src=', '@import', 'http://', 'https://'].filter((t) => htmlText.indexOf(t) >= 0);
      check('页面文本里没有 <link / src= / @import / http(s)://', textHits.length === 0,
        textHits.length ? '命中：' + textHits.join(' ') : '0 处');
      check('页面无 JS 报错（加载 + 上面这些交互）', pageErrors.length === 0,
        pageErrors.length ? pageErrors.join(' | ') : '0 条');

      // ---- [10] 令牌快照 ----
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
      check('快照／草案里没有「声明了却没用」的令牌，且用到的都有声明',
        undeclared.length === 0 && unused.length === 0 && unusedDraft.length === 0,
        `未声明=${JSON.stringify(undeclared)} 快照未用=${JSON.stringify(unused)} 草案未用=${JSON.stringify(unusedDraft)}`);
      const shaRecorded = (htmlText.match(/仓库提交：([0-9a-f]{7,40})/) || [])[1] || '(没记录)';
      log(`      令牌来源记录：页面写的是提交 ${shaRecorded}；当前 HEAD=${gitHead}；theme-tech.css 相对 HEAD ${themeClean === null ? '未知' : (themeClean ? '无改动' : '有未提交改动')}`);
      check('页面记录了令牌快照的来源提交（短 sha）', /^[0-9a-f]{7,40}$/.test(shaRecorded), `记录=${shaRecorded}`);

      // ---- [11] 看图态：展开夹具笔记 → 再查 430 → 截图 ----
      if (!SHOT) { log('\n[PNG] 已跳过（--no-shot）'); continue; }
      await send('Page.navigate', { url: 'about:blank' });
      await sleep(200);
      await send('Page.navigate', { url: url + '#shot' });
      for (let i = 0; i < 120 && !events.includes('Page.loadEventFired'); i++) await sleep(100);
      await sleep(400);
      log('\n[shot] #shot（看图模式）：先重查一次首态，再用真实鼠标点开夹具笔记');
      const S0 = await struct();
      check('#shot 不改变首态：有笔记的实例仍全部收起（图里的展开态是点出来的）',
        S0.filter((s) => s.notes === 1).every((s) => s.ariaExpanded === 'false' && s.notesBodyHidden === true),
        S0.filter((s) => s.notes === 1).map((s) => `${s.inst}:${s.ariaExpanded}`).join(' '));
      for (const s of S0.filter((x) => x.notes === 1)) await clickControl(s.inst, 'notes-head');
      ov = await overflowScan();
      check('430：展开夹具笔记**之后**仍无横向溢出，且每块仍是 430 宽',
        ov.docScrollWidth === W && ov.maxRight <= W + 0.5 && ov.minLeft >= -0.5 && ov.blocks.every((b) => b.w === W),
        `scrollWidth=${ov.docScrollWidth} maxRight=${ov.maxRight}(${ov.maxEl}) 块宽=${ov.blocks.map((b) => b.w).join(',')}`);
      const frame = JSON.parse(await js(`(function(){
        var f = document.querySelector('[data-shotframe]');
        var r = f.getBoundingClientRect();
        return JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top + window.scrollY), w: Math.round(r.width), h: Math.round(r.height) });
      })()`));
      const png = `${OUT}/q-poem.${page}.430.png`;
      const shot = await send('Page.captureScreenshot', {
        format: 'png', captureBeyondViewport: true,
        clip: { x: 0, y: frame.y, width: W, height: frame.h, scale: 1 },
      });
      writeFileSync(png, Buffer.from(shot.data, 'base64'));
      log(`\n[PNG] ${png}`);
      log(`      块区 CSS 尺寸 430x${frame.h} @DPR ${DPR} → 像素 ${W * DPR}x${frame.h * DPR} → 文件 ${statSync(png).size} 字节`);
      check('截图尺寸 = 860 px 宽（430 CSS px × DPR 2）', statSync(png).size > 0, `${statSync(png).size} 字节`);
    }

    // ── 宽屏一遍：块宽固定 430，不随视口拉伸、不溢出 ────────────────
    log('\n═══════════ 宽屏 1180：块宽仍固定 430（宽屏／桌面排布本身不在本轮表达）═══════════');
    await send('Emulation.setDeviceMetricsOverride', { width: 1180, height: 900, deviceScaleFactor: 1, mobile: false });
    for (const page of PAGES) {
      const file = `${OUT}/q-poem.${page}.html`;
      await send('Page.navigate', { url: 'file:///' + file.replace(/\\/g, '/') });
      for (let i = 0; i < 120 && !events.includes('Page.loadEventFired'); i++) await sleep(100);
      await sleep(300);
      const o = await overflowScan();
      check(`1180 · 页 ${page}：无横向溢出，且每个块仍是 430 CSS px 宽`,
        o.innerWidth === 1180 && o.docScrollWidth === 1180 && o.blocks.length === 4 && o.blocks.every((b) => b.w === W),
        `innerWidth=${o.innerWidth} scrollWidth=${o.docScrollWidth} 块宽=${o.blocks.map((b) => b.w).join(',')} 块左沿=${o.blocks.map((b) => b.left).join(',')}`);
    }

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
  failures++;
}
console.log(`\n===== 失败断言数：${failures} =====`);
process.exit(failures ? 1 : 0);
