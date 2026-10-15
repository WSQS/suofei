/*
 * check-align.mjs —— 目录页「展开记号 ↔ 组名 对齐关系」聚焦讨论原型的【页面行为】自证脚本（可复跑）。
 *
 * ⚠ 它验的是**这一个原型页面的页面行为，不是产品代码**：
 *   对象只有本目录下的 q-hub-align.html（唯一一页）；
 *   该 HTML 是**只读打开**的（Page.navigate 到 file:// URL，脚本不写、不改它）。
 *   它不跑 web/ 与 android/ 的任何测试，也不读产品实现。唯一额外读的文件是
 *   prototype/css/theme-tech.css（**只读**），用来逐项比对页面内嵌的令牌快照。
 *
 * 【这一页要回答的问题】记号与组名怎么对齐才不显得「没对齐」？
 *   六个块（5 聚焦——其中 ② 两个档——＋ 1 夹具）**只在这几条 CSS 上不同**（其余一切相同——检查脚本 [8][9] 就是守这条）：
 *     ① b1 悬挂＋固定缝 0.4rem（--seam-a，草案值）  ② b2 悬挂＋槽内居中（槽 2rem，--slot-b，草案值）
 *     ②-2 b2-2 悬挂＋槽内居中（槽 1.6rem，--slot-b-alt，草案值；与 ② 只差槽宽）
 *     ③ b3 不悬挂（对照）                          ④ b4 悬挂＋竖直居中（水平同 b1）
 *     ⑤ b5 ＝ b1 的排布 × 3 组夹具（夹具块）
 *   口径：悬挂＝记号的槽**从块左沿（0）量起**、组名左沿＝槽右沿；不悬挂＝记号落在**块左内沿**（--edge-x）上。
 *   六块共同：题名左沿 ＝ 组名左沿（缩进 0）、作者紧随题名（不右对齐）、「关于」在顶部、首态全收起。
 *   ⚠ 更正记录：② 的槽宽上一版是 1.2rem（19.2px），比记号自身的排版宽（21.13px）**还窄** ⇒ 当时实测缝为负
 *     （居中后右沿越过组名左沿 0.97px、实心笔画只剩 1.16px，看图是贴住）。本轮已按负责人决定改为 **2rem**，
 *     并另出 **1.6rem** 一档；本脚本现在断言的是更正后的数字（两个槽宽都 > 记号宽 ⇒ 缝为正、记号完全落在槽内）。
 *
 * 断言清单（失败任一即 exit 1），在 **430 宽（规格里的移动口径，DPR 2）** 下跑一遍：
 *  [1] 首态：六个块的**所有组头** `aria-expanded="false"`，且组内诗目**一项都不可见**
 *      —— 即「首次（无既有状态）全部收起，单组也收起」。
 *  [2] 组头节点是 `<button type="button">` 且带 `aria-expanded` 与 `aria-controls`（不是 div 冒充可点元素）。
 *  [3] 「关于」入口在**顶部**（每块恰好 1 个，其 top < 第一个组头 top）；块里除「关于」与诗目以外
 *      的 `<a>` 个数＝0，且块的可见文字里不含搜索／笔记／版本／应用名／预览等未采纳项。
 *  [4] **整个组头可点击**：用 CDP `Input.dispatchMouseEvent` 派发**真实鼠标事件**（不是页面里的
 *      `.click()`），逐块点**四个位置**（① 组名处 ② 中缝空白处 ③ 数量处 ④ 记号处；坐标由各元素的
 *      实测矩形给出，命中的 DOM 元素会被打印出来）。每次都必须：该组状态翻转，且**整页所有组头
 *      的状态快照只差这一组**。
 *  [5] 夹具块：可**同时展开两组**（点第 1 组 → 点第 2 组 ⇒ 恰好 2 组展开）；再点第 1 组
 *      ⇒ 只有它收起、第 2 组**仍然展开**（各组独立，不是手风琴）；记号：展开 `[−]`、收起 `[+]`。
 *  [6] **无横向溢出**：`innerWidth === 430`、`documentElement.scrollWidth === 430`，全文档所有可见
 *      元素右沿 ≤ 430（左沿 ≥ 0），且**每个块（.hub）宽度恰好 430**。收起态与「点开后的看图态」各查一次。
 *  [7] **题名左沿 == 组名左沿（缩进 0，±1px）**：逐块量（含夹具块那条故意写长的**折行**题名行，
 *      折行后左沿仍必须与组名首字同一条竖线）。
 *  [8] **四块的记号几何**：逐块打印 **记号左沿／右沿（版面盒）· 槽宽 · 缝（版面盒／实心笔画两种口径）·
 *      组名左沿 · 题名左沿 · 右内沿**，并按各块自己的口径断言：
 *        b1 缝 ＝ 0.4rem（6.4px，±0.5）且记号左沿 ＝ 块左沿（0）；
 *        b2 槽宽 ＝ 2rem（32px，±0.5）、b2-2 槽宽 ＝ 1.6rem（25.6px，±0.5），两块都要求：记号在槽内居中
 *           （|记号中心 − 槽中心| ≤ 0.5）、**记号完全落在槽内**、缝 ＝ （槽宽 − 记号宽）/2 > 0；
 *        b2 与 b2-2 的缝差 ＝ 两块槽宽差的一半（±0.3）（即两块只差槽宽）；
 *        b3 记号左沿 ＝ 块左内沿（--edge-x＝16.8px，±0.5）且组名左沿 ＝ 记号右沿 ＋ 0.35rem（±1）；
 *        b4 的水平几何与 b1 **完全一致**（±0.5px）；b5 与 b1 相同。
 *  [9] **竖直关系**：b4 的「记号版面盒中心 − 组名版面盒中心」= 0（±0.5px）；b1/b2/b2-2/b3/b5 是基线对齐、
 *      同一个差 > 1.5px ⇒ ④ 与 ① 的差别确实在竖直方向，而不在水平方向（水平那一条由 [8] 守）。
 *      另用 canvas 的字体盒基线把同一件事在**实心笔画**上再量一遍：④ 把记号抬高 2.5px、
 *      「记号笔画中心 − 组名笔画中心」从 ① 的 3.5px 收到 ④ 的 1.0px。
 *  [10] **实心笔画（不是版面盒）**：用 canvas 量出 `[+]` 与汉字在同一字号下的着墨左右侧距，
 *      逐块打印记号的**着墨左沿／右沿**与**着墨缝**，并断言**着墨左沿 ≥ 0**（记号没有被块左沿裁掉）；
 *      另断言 canvas 量的 advance 与 DOM 里记号的**文字范围宽**一致（±0.5px）——否则打印「字体不一致」并跳过
 *      这条，不假装量到了。（注意：块 ② 的记号**盒宽**被槽宽限定，文字居中后会溢出盒外，所以不能拿盒宽比。）
 *  [11] **自包含**：CDP 的 `Network.requestWillBeSent` 记录里非 `file://` 的请求为 0 个，
 *      且页面文本里没有 `<link` / `src=` / `@import` / `http(s)://`。另：整页加载与交互期间**无 JS 报错**。
 *  [12] **令牌快照逐项比对**：页面里 `TOKEN-SNAPSHOT-BEGIN/END` 之间的每个令牌，与
 *      prototype/css/theme-tech.css 的同名值**逐字**比较（空白归一化后）⇒ **值不一致数必须为 0**；
 *      反过来也查：页面用到的每个 `var(--x)` 都必须有声明（快照或明示的草案值），
 *      且快照里不许有「声明了却没用」的令牌。页内只做**报告**：记录的 git 短 sha、当前 HEAD、
 *      theme-tech.css 是否有未提交改动。
 *  [13] **宽屏 1180**：无横向溢出，且每个块仍是 430 CSS px 宽（宽屏排布本身不在本轮表达）。
 *  [14] **一张 430 宽的图**：`q-hub-align.430.png`，860 px 宽（430 CSS px × DPR 2），六个块纵向排列。
 *
 * 这张 **430 宽 PNG**（860 px 宽 @DPR 2）怎么拍（**这一步会重写图片，见下面的副作用**）：
 *   1. 先在**普通页面**上跑完上面全部断言（不动页面）；
 *   2. 再 navigate 到 `…q-hub-align.html#shot`：**#shot 只是页面自带的「看图模式」**——它把每个展开的组
 *      显示为**前 3 行 + 一条说明条**（否则 19 首 × 5 块会让图过长）并显示一条横幅；
 *      **它不改变任何排布、也不改变首态**（脚本会在 #shot 下重查一次「首态全收起」）。
 *   3. 在 #shot 下用**真实鼠标**逐个点开各块的各组（夹具块点开前两组）；
 *   4. 量出 `.shotframe` 的矩形，`Page.captureScreenshot` 截 x=0、宽 430、DPR 2 ⇒ **860 px 宽**，
 *      五个块在其中都恰好 430 CSS px 宽、纵向排列。
 *   所以：图是「页面加载后点开各组」的状态；**页面加载时的首态仍是全收起**（断言 [1] 先跑过）。
 *
 * 怎么跑（在仓库根或任意目录都行）：
 *   node items/app-ui/prototypes/check-align.mjs
 *   node items/app-ui/prototypes/check-align.mjs --no-shot    # 只跑断言，不重出 PNG
 *
 * 需要什么：
 *   - Node（用到内置的 fetch / WebSocket，故需较新的 Node；本机实测 v25.9.0 通过）；
 *   - **本机无头 Chromium 的可执行文件**。顺序：环境变量 `CHROME_BIN` → 否则按
 *     `%LOCALAPPDATA%\Chromium\Application\chrome.exe` 推（与本仓既有做法一致，见
 *     `web/tests/e2e-cdp.mjs` 与 `prototype/tools/shot.mjs` 的同名回退）。
 *     找不到就**如实报错并 exit 2** —— CHROME_BIN 指到错路径也走这一条，不会假装通过
 *     （已实测：见同目录 q-hub-align.md §9）。
 *   - **不需要**任何 npm 依赖：不装包、不联网、不起静态服务（直接开 file://）。
 *
 * 副作用（说清，免得复跑后以为工作树坏了）：
 *   - 会在**临时目录**建一个 Chromium profile，结束时删掉；
 *   - **默认会重写**本目录下的 q-hub-align.430.png。
 *     不同 Chromium 版本/字体渲染可能让字节数变化 ⇒ **复跑可能让这张 PNG 变脏**，那是正常现象，
 *     不是脚本改坏了什么。只想看断言就加 `--no-shot`。
 *   - q-hub-align.html 本身**只读打开**，不写、不改；夹具数据只在页面脚本里，脚本不碰 content/。
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = dirname(fileURLToPath(import.meta.url)); // 本脚本所在目录＝原型目录
const ROOT = (() => {
  // 搬迁时改成「向上查找」：原写法是 join(OUT, '..','..','..')，一旦整轮搬进 history/ 就会指到 items/。
  let d = OUT;
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(d, 'prototype', 'css', 'theme-tech.css'))) return d;
    d = dirname(d);
  }
  throw new Error('找不到仓库根：从 ' + OUT + ' 向上查找 prototype/css/theme-tech.css 失败');
})();
const SHOT = !process.argv.includes('--no-shot');
const PAGE = 'q-hub-align.html';
const PNG = 'q-hub-align.430.png';
const W = 430;                                       // 规格：真实 430 CSS px 移动宽度
const DPR = 2;                                       // 图：860 px 宽
const EDGE_X = 16.8;                                 // 草案值 --edge-x: 1.05rem ⇒ 16.8px（块的左右内沿）
const SEAM_A = 6.4;                                  // 草案值 --seam-a: 0.4rem  ⇒ 6.4px（块 ① 的固定缝）
const SLOT_B = 32;                                   // 草案值 --slot-b: 2rem ⇒ 32px（块 ② 的槽宽；**已由 1.2rem 更正而来**）
const SLOT_B_ALT = 25.6;                             // 草案值 --slot-b-alt: 1.6rem ⇒ 25.6px（块 ②-2 的槽宽）
const MARK_ADVANCE = 21.13;                          // 记号（等宽 0.8rem 的 [+]）的排版宽（实测；canvas advance 21.11）
const INLINE_GAP = 5.6;                              // 草案值 --inline-gap: 0.35rem ⇒ 5.6px（块 ③ 的段内间距）
const BLOCKS = ['b1', 'b2', 'b2-2', 'b3', 'b4', 'b5'];   // 5 聚焦块（② 两个档） + 1 夹具块
const FX = 'b5';                                     // 夹具块

// ── 找 Chromium：CHROME_BIN 优先，否则 %LOCALAPPDATA%\Chromium\Application\chrome.exe
const CHROME = process.env.CHROME_BIN
  || join(process.env.LOCALAPPDATA || '', 'Chromium', 'Application', 'chrome.exe');
if (!CHROME || !existsSync(CHROME)) {
  console.error('找不到无头 Chromium：' + (CHROME || '(未设置)'));
  console.error('请用环境变量指定，例如：');
  console.error("  CHROME_BIN='C:/Users/wsqsy/AppData/Local/Chromium/Application/chrome.exe' \\");
  console.error('    node items/app-ui/prototypes/check-align.mjs');
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'alignproto-'));
const port = 9222 + Math.floor(Math.random() * 500);

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--disable-extensions', '--disable-background-networking',
  '--disable-component-update', '--disable-sync', '--remote-allow-origins=*',
  '--user-data-dir=' + profile, '--remote-debugging-port=' + port, 'about:blank',
], { stdio: 'ignore' });

async function waitDevtools() {
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/json/version`); if (r.ok) return; } catch { /* 起得慢，继续等 */ }
    await sleep(150);
  }
  throw new Error('Chromium 的 devtools 端口没起来');
}

let failures = 0;
const log = (...a) => console.log(...a);
function check(label, ok, detail) {
  log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : '  →  ' + detail}`);
  if (!ok) failures++;
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const r1 = (n) => Math.round(n * 10) / 10;

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
  await waitDevtools();
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
  // 真实鼠标事件（不是页面里的 .click()）
  async function clickAt(x, y) {
    const base = { x, y, button: 'left', buttons: 1, clickCount: 1 };
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...base });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base });
  }

  /* ── 页面状态读取 ─────────────────────────────────────────────── */
  // 整页所有组头的状态（用于证明「只影响该组」）
  const allHeads = async () => JSON.parse(await js(`JSON.stringify(Array.from(document.querySelectorAll('[data-test="hub"] .ghead')).map(function(h){
      var hub = h.closest('[data-test="hub"]');
      return { inst: hub.dataset.inst, block: hub.dataset.block, group: h.dataset.group, expanded: h.getAttribute('aria-expanded') };
    }))`));
  const instHeads = async (inst) => JSON.parse(await js(`JSON.stringify(Array.from(document.querySelectorAll('[data-inst="${inst}"] .ghead')).map(function(h){
      var list = document.getElementById(h.getAttribute('aria-controls'));
      var rows = list ? Array.from(list.querySelectorAll('.poemrow')) : [];
      return { group: h.dataset.group, tag: h.tagName, type: h.getAttribute('type'),
               hasControls: h.hasAttribute('aria-controls'), hasExpanded: h.hasAttribute('aria-expanded'),
               expanded: h.getAttribute('aria-expanded'), mark: (h.querySelector('[data-test="gmark"]')||{}).textContent,
               listHidden: list ? list.hasAttribute('hidden') : null,
               rows: rows.length,
               visibleRows: rows.filter(function(li){ return li.getBoundingClientRect().height > 0; }).length };
    }))`));
  const insts = async () => JSON.parse(await js(`JSON.stringify(Array.from(document.querySelectorAll('[data-test="hub"]')).map(function(h){ return h.dataset.inst; }))`));
  // 组头几何 + 四个探测点（每次点击前重新量：展开会改变布局）
  const headGeom = async (inst, gi) => JSON.parse(await js(`(function(){
    var hub = document.querySelector('[data-inst="${inst}"]');
    var h = hub.querySelectorAll('.ghead')[${gi}];
    h.scrollIntoView({block:'center'});
    var hr = hub.getBoundingClientRect(), r = h.getBoundingClientRect();
    var m = h.querySelector('[data-test="gmark"]').getBoundingClientRect();
    var n = h.querySelector('[data-test="gname"]').getBoundingClientRect();
    var c = h.querySelector('[data-test="gcount"]').getBoundingClientRect();
    var y = r.top + r.height/2;
    var midX = (n.right + c.left) / 2;
    var at = function(x){ var e = document.elementFromPoint(x, y);
      if (!e) return '(无)';
      var cls = (typeof e.className === 'string' && e.className) ? '.' + e.className.trim().split(/\\s+/).join('.') : '';
      return e.tagName.toLowerCase() + cls + (h.contains(e) ? '(在组头内)' : '(不在组头内)'); };
    var pts = [
      { name: '① 组名处', x: (n.left + n.right)/2 },
      { name: '② 中缝空白处', x: midX },
      { name: '③ 数量处', x: (c.left + c.right)/2 },
      { name: '④ 记号处', x: (m.left + m.right)/2 }
    ];
    return JSON.stringify({ tag: h.tagName, hubLeft: hr.left, hubW: hr.width,
      headLeft: r.left - hr.left, headRight: r.right - hr.left, headW: r.width, headH: r.height,
      nameLeft: n.left - hr.left, nameRight: n.right - hr.left,
      countLeft: c.left - hr.left, countRight: c.right - hr.left,
      markLeft: m.left - hr.left, markRight: m.right - hr.left, markText: h.querySelector('[data-test="gmark"]').textContent,
      gapMarkName: n.left - m.right, y: y,
      pos: pts.map(function(p){ return { name: p.name, x: p.x, hit: at(p.x) }; }) });
  })()`));
  /* 一个块的全部几何：记号（版面盒 + 文字的范围盒）、组名、数量、缝、题名的左右沿、右内沿 */
  const blockGeom = async (inst) => JSON.parse(await js(`(function(){
    var hub = document.querySelector('[data-inst="${inst}"]');
    var hr = hub.getBoundingClientRect();
    var h = hub.querySelector('.ghead');
    var m = h.querySelector('[data-test="gmark"]'), n = h.querySelector('[data-test="gname"]'), c = h.querySelector('[data-test="gcount"]');
    var mb = m.getBoundingClientRect(), nb = n.getBoundingClientRect(), cb = c.getBoundingClientRect();
    var rg = document.createRange(); rg.selectNodeContents(m); var mi = rg.getBoundingClientRect();
    var rr = function(b){ return { l: Math.round((b.left-hr.left)*100)/100, r: Math.round((b.right-hr.left)*100)/100,
      w: Math.round(b.width*100)/100, h: Math.round(b.height*100)/100,
      cy: Math.round(((b.top+b.bottom)/2 - hr.top)*100)/100, top: Math.round((b.top-hr.top)*100)/100, bottom: Math.round((b.bottom-hr.top)*100)/100 }; };
    var rowL = null, rowLinks = [];
    return JSON.stringify({ inst: hub.dataset.inst, block: hub.dataset.block, mark: hub.dataset.mark, valign: hub.dataset.valign,
      hubW: Math.round(hr.width*100)/100,
      markBox: rr(mb), markTextRange: rr(mi), nameBox: rr(nb), countBox: rr(cb),
      dcyBox: Math.round(((mb.top+mb.bottom)/2 - (nb.top+nb.bottom)/2)*100)/100,
      seamBox: Math.round((nb.left - mb.right)*100)/100,
      seamText: Math.round((nb.left - mi.right)*100)/100,
      markText: m.textContent, nameText: n.textContent, countText: c.textContent });
  })()`));
  // 单个块内某一行的题名/作者实测（含折行、与组名左沿的关系、行内滚动）
  const rowInfo = async (sel) => JSON.parse(await js(`(function(){
    var li = document.querySelector('${sel}');
    if (!li) return JSON.stringify({ missing: '${sel}' });
    var hub = li.closest('[data-test="hub"]');
    var t = li.querySelector('[data-test="ptitle"]'), a = li.querySelector('[data-test="pauthor"]');
    var rt = t.getBoundingClientRect(), ra = a.getBoundingClientRect(), rl = li.getBoundingClientRect(), rh = hub.getBoundingClientRect();
    var rn = hub.querySelector('[data-test="gname"]').getBoundingClientRect();
    return JSON.stringify({ inst: hub.dataset.inst, block: hub.dataset.block, title: t.textContent, author: a.textContent,
      name_left: Math.round((rn.left - rh.left)*100)/100,
      t_left: Math.round((rt.left - rh.left)*100)/100, t_right: Math.round((rt.right - rh.left)*100)/100,
      t_h: Math.round(rt.height*100)/100, t_bottom: Math.round(rt.bottom*100)/100,
      a_left: Math.round((ra.left - rh.left)*100)/100, a_right: Math.round((ra.right - rh.left)*100)/100,
      row_left: Math.round((rl.left - rh.left)*100)/100, row_right: Math.round((rl.right - rh.left)*100)/100,
      hscroll: li.scrollWidth > li.clientWidth });
  })()`));
  // 实心笔画（canvas 量 [+] 与汉字的着墨左右侧距；用来自证「字号一致」与「没有被块左沿裁掉」）
  const paint = async (inst) => JSON.parse(await js(`(function(){
    var hub = document.querySelector('[data-inst="${inst}"]');
    var m = hub.querySelector('[data-test="gmark"]'), n = hub.querySelector('[data-test="gname"]');
    var cs = getComputedStyle(m), ns = getComputedStyle(n);
    var font = cs.fontSize + ' ' + cs.fontFamily, nfont = ns.fontSize + ' ' + ns.fontFamily;
    function extent(text, f){
      var Wd = 160, Hd = 70, ox = 50, oy = 48;
      var c = document.createElement('canvas'); c.width = Wd; c.height = Hd;
      var x = c.getContext('2d'); x.font = f; x.textBaseline = 'alphabetic'; x.fillStyle = '#fff';
      var mm = x.measureText(text);
      var adv = mm.width;
      x.fillText(text, ox, oy);
      var d = x.getImageData(0, 0, Wd, Hd).data, min = 1e9, max = -1e9, top = 1e9, bot = -1e9;
      for (var yy = 0; yy < Hd; yy++) for (var xx = 0; xx < Wd; xx++) { if (d[(yy*Wd+xx)*4+3] > 16) { if (xx < min) min = xx; if (xx > max) max = xx; if (yy < top) top = yy; if (yy > bot) bot = yy; } }
      if (min === 1e9) return { advance: Math.round(adv*100)/100, empty: true };
      return { advance: Math.round(adv*100)/100, left: min - ox, right: max - ox,
               top: top - oy, bottom: bot - oy, ascent: mm.fontBoundingBoxAscent, descent: mm.fontBoundingBoxDescent };
    }
    var pm = extent('[+]', font), pn = extent(n.textContent, nfont);
    var mb = m.getBoundingClientRect(), hr = hub.getBoundingClientRect(), nb = n.getBoundingClientRect();
    // 记号文字在块坐标系里的起点：由 Range 盒（＝文字排版宽）与 canvas 量的 advance 推出
    // （槽内居中时文字会相对盒左沿偏移，甚至溢出到块左沿之外）
    var rg = document.createRange(); rg.selectNodeContents(m); var mi = rg.getBoundingClientRect();
    var rn2 = document.createRange(); rn2.selectNodeContents(n); var ni = rn2.getBoundingClientRect();
    var originX = mi.left - hr.left - ((mi.width - pm.advance) / 2);
    // 竖直：Range 盒 ＝ 字体盒 ⇒ 基线 ＝ Range 顶 + fontBoundingBoxAscent（canvas 量）
    var relBaseline = Math.round(((mi.top + pm.ascent) - (ni.top + pn.ascent))*100)/100;
    var paintedCenterDiff = Math.round((relBaseline + (pm.top + pm.bottom)/2 - (pn.top + pn.bottom)/2)*100)/100;
    return JSON.stringify({ inst: hub.dataset.inst, markFont: font, nameFont: nfont,
      markAdvance: pm.advance, nameAdvance: pn.advance, markPaint: { left: pm.left, right: pm.right },
      namePaint: { left: pn.left, right: pn.right },
      markPaintV: { top: pm.top, bottom: pm.bottom }, namePaintV: { top: pn.top, bottom: pn.bottom },
      relBaseline: relBaseline, paintedCenterDiff: paintedCenterDiff,
      domMarkBoxW: Math.round(mb.width*100)/100, domMarkTextRangeW: Math.round(mi.width*100)/100,
      domMarkBoxLeft: Math.round((mb.left-hr.left)*100)/100,
      textOriginX: Math.round(originX*100)/100,
      paintedLeftX: Math.round((originX + pm.left)*100)/100,
      paintedRightX: Math.round((originX + pm.right)*100)/100,
      namePaintedLeftX: Math.round((nb.left - hr.left + pn.left)*100)/100,
      paintedSeam: Math.round((nb.left - hr.left + pn.left - (originX + pm.right))*100)/100 });
  })()`));
  // 确保某组的展开状态（需要展开时用真实鼠标点）
  async function ensureOpen(inst, gi, want) {
    const s = await instHeads(inst);
    if ((s[gi].expanded === 'true') === want) return false;
    const g = await headGeom(inst, gi);
    await clickAt(g.pos[0].x, g.y);
    await sleep(120);
    return true;
  }
  // 溢出扫描
  const overflowScan = async () => JSON.parse(await js(`(function(){
    var all = document.querySelectorAll('body *'), maxRight = -1e9, minLeft = 1e9, mr = null, ml = null;
    var name = function(e){ return e.tagName.toLowerCase() + ((typeof e.className === 'string' && e.className) ? '.' + e.className.trim().split(/\\s+/).join('.') : ''); };
    for (var i = 0; i < all.length; i++) {
      var r = all[i].getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.right > maxRight) { maxRight = r.right; mr = all[i]; }
      if (r.left < minLeft) { minLeft = r.left; ml = all[i]; }
    }
    return JSON.stringify({ innerWidth: window.innerWidth, docScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth, maxRight: Math.round(maxRight*10)/10, maxEl: name(mr),
      minLeft: Math.round(minLeft*10)/10, minEl: name(ml),
      hubs: Array.from(document.querySelectorAll('[data-test="hub"]')).map(function(h){
        var r = h.getBoundingClientRect();
        return { inst: h.dataset.inst, w: Math.round(r.width*10)/10, left: Math.round(r.left*10)/10 }; }) });
  })()`));

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

  const file = `${OUT}/${PAGE}`;
  const htmlText = readFileSync(file, 'utf8');
  const url = 'file:///' + file.replace(/\\/g, '/');

  // ── 普通页面：先跑完全部断言 ─────────────────────────────────
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: 932, deviceScaleFactor: DPR, mobile: true });
  requests.length = 0; pageErrors.length = 0; events.length = 0;
  await send('Page.navigate', { url });   // 只读打开，不写文件
  for (let i = 0; i < 120 && !events.includes('Page.loadEventFired'); i++) await sleep(100);
  await sleep(400);

  log(`\n═══════════ ${PAGE}（430 宽 · DPR ${DPR}）：4 个聚焦块 ＋ 1 个夹具块 ═══════════`);
  const list = await insts();
  check('页面里恰好 6 个块（5 聚焦，其中 ② 两个档 ＋ 1 夹具），inst 顺序 b1…b5',
    JSON.stringify(list) === JSON.stringify(BLOCKS), JSON.stringify(list));

  // ---- [1] 首态全收起 ----
  log('\n[1] 首态：首次进入（无既有状态）全部收起（单组也收起）');
  let allCollapsed = true;
  const stateDump = [];
  for (const inst of list) {
    const s = await instHeads(inst);
    const ok = s.length > 0 && s.every((h) => h.expanded === 'false' && h.listHidden === true && h.visibleRows === 0);
    if (!ok) allCollapsed = false;
    stateDump.push(`${inst}:${s.map((h) => `${h.group}=${h.expanded}/可见${h.visibleRows}行`).join(',')}`);
  }
  check('五个块的所有组头 aria-expanded=false 且诗目一项都不可见', allCollapsed, stateDump.join(' | '));

  // ---- [2] 组头节点 ----
  const nodes = JSON.parse(await js(`JSON.stringify(Array.from(document.querySelectorAll('[data-test="hub"] .ghead')).map(function(h){
      return h.tagName + '/' + h.getAttribute('type') + '/' + (h.hasAttribute('aria-controls')?'有controls':'无controls') + '/' + (h.hasAttribute('aria-expanded')?'有expanded':'无expanded'); }))`));
  check('全部组头是 <button type=button> 且带 aria-controls 与 aria-expanded',
    nodes.length > 0 && nodes.every((t) => t === 'BUTTON/button/有controls/有expanded'),
    `${nodes.length} 个组头：${nodes.filter((t, i) => i < 2).join(' , ')} …`);

  // ---- [3] 关于在顶部 + 不夹带 ----
  const about = JSON.parse(await js(`JSON.stringify(Array.from(document.querySelectorAll('[data-test="hub"]')).map(function(hub){
    var a = hub.querySelector('[data-test="about"]');
    var ar = a.getBoundingClientRect();
    var head = hub.querySelector('.ghead').getBoundingClientRect();
    var hr = hub.getBoundingClientRect();
    var extra = Array.from(hub.querySelectorAll('a')).filter(function(x){ return x !== a && !x.classList.contains('plink'); });
    var banned = ['搜索','笔记','版本','应用名','预览'].filter(function(w){ return hub.innerText.indexOf(w) >= 0; });
    return { inst: hub.dataset.inst, n: hub.querySelectorAll('[data-test="about"]').length, text: a.textContent,
             above: ar.top < head.top, dy: Math.round((head.top - ar.bottom)*10)/10,
             相对左沿: Math.round((ar.left - hr.left)*10)/10, 其它链接: extra.map(function(x){ return x.textContent; }), 禁用词: banned };
  }))`));
  check('「关于」入口：每个块恰好 1 个、在顶部（在第一个组头之上）',
    about.length === 6 && about.every((h) => h.n === 1 && h.text === '关于' && h.above === true),
    about.map((h) => `${h.inst}:${h.n}个/${h.above ? '在组头之上' : '不在组头之上'}(${h.dy}px)`).join(' '));
  check('块里没有别的入口链接（不夹带应用名／搜索／状态位／版本号）',
    about.every((h) => h.其它链接.length === 0 && h.禁用词.length === 0),
    about.map((h) => `${h.inst}:${JSON.stringify(h.其它链接)}${h.禁用词.length ? '禁用词=' + h.禁用词 : ''}`).join(' '));

  // ---- [6a] 收起态的 430 无溢出 ----
  log('\n[6a] 430：无横向溢出（收起态）');
  let ov = await overflowScan();
  check('innerWidth === 430 且 documentElement.scrollWidth === 430',
    ov.innerWidth === W && ov.docScrollWidth === W,
    `innerWidth=${ov.innerWidth} scrollWidth=${ov.docScrollWidth} bodyScrollWidth=${ov.bodyScrollWidth}`);
  check('所有可见元素都在 0…430 之内',
    ov.maxRight <= W + 0.5 && ov.minLeft >= -0.5,
    `maxRight=${ov.maxRight}(${ov.maxEl}) minLeft=${ov.minLeft}(${ov.minEl})`);
  check('五个块宽度恰好 430 CSS px',
    ov.hubs.length === 6 && ov.hubs.every((h) => h.w === W),
    ov.hubs.map((h) => h.inst + ':' + h.w).join(' '));

  // ---- [4] 真实鼠标：整组头四个位置 ----
  log('\n[4] 真实鼠标点击（CDP Input.dispatchMouseEvent，不是 JS .click()）：每块的组头四个位置');
  for (const inst of list) {
    const g = await headGeom(inst, 0);
    log(`      ${inst} 组头 ${Math.round(g.headW)}x${Math.round(g.headH)}  组名[${r1(g.nameLeft)}…${r1(g.nameRight)}]  数量[${r1(g.countLeft)}…${r1(g.countRight)}]  记号[${r1(g.markLeft)}…${r1(g.markRight)}] ${g.markText}`);
    for (let pi = 0; pi < 4; pi++) {
      const gg = await headGeom(inst, 0);
      const p = gg.pos[pi];
      const before = await allHeads();
      const firstOfInst = before.filter((h) => h.inst === inst)[0];
      const wasOpen = firstOfInst.expanded === 'true';
      await clickAt(p.x, gg.y);
      await sleep(130);
      const after = await allHeads();
      const changed = after.map((h, i) => ({ k: `${h.inst}|${h.group}`, from: before[i].expanded, to: h.expanded })).filter((d) => d.from !== d.to);
      const target = `${inst}|${firstOfInst.group}`;
      check(`${inst} 点「${p.name}」(x=${Math.round(p.x)} 命中 ${p.hit}) ⇒ 只影响该组`,
        changed.length === 1 && changed[0].k === target && changed[0].to === (wasOpen ? 'false' : 'true'),
        `变化=${JSON.stringify(changed)} 期望=${target} ${wasOpen ? 'true→false' : 'false→true'}`);
    }
  }

  // ---- [5] 夹具块：可同时展开两组、各组独立 ----
  log('\n[5] 夹具块（b5）：可同时展开两组（不是手风琴）');
  const fxHeadsBefore = (await instHeads(FX)).map((h) => h.expanded);
  for (const gi of [0, 1]) await ensureOpen(FX, gi, true);
  let fs = await instHeads(FX);
  check('点开夹具块的前两组 ⇒ 恰好 2 组展开（各组独立，不是手风琴）',
    fs.filter((h) => h.expanded === 'true').length === 2,
    `${fxHeadsBefore.join(',')} → ${fs.map((h) => h.group + '=' + h.expanded + '(可见' + h.visibleRows + '/' + h.rows + '行)').join(' ')}`);
  check('展开时记号＝[−]，收起时记号＝[+]',
    fs.every((h) => h.mark === (h.expanded === 'true' ? '[\u2212]' : '[+]')),
    fs.map((h) => h.group + ':' + h.mark).join(' '));
  await ensureOpen(FX, 0, false);
  fs = await instHeads(FX);
  check('再点第 1 组 ⇒ 只有它收起，第 2 组仍然展开',
    fs[0].expanded === 'false' && fs[1].expanded === 'true' && fs[2].expanded === 'false',
    fs.map((h) => h.group + '=' + h.expanded).join(' '));

  // ---- [8] 四块记号几何（收起态测得，避免展开影响布局）----
  log('\n[8] 六块的记号几何（块左沿＝0，右内沿＝430 − 1.05rem ＝ 413.2）');
  log('      ⚠ 「缝(按盒)」在 ②/②-2 里恒为 0——那两块记号的**盒宽被槽宽限定**，盒右沿就是槽右沿、也就是组名左沿；');
  log('        那两块要读的缝是「缝(按文字范围)」（= (槽宽 − 记号排版宽) / 2）。');
  const geom = {};
  const paints = {};                                  // canvas 量的实心笔画结果（[9][10] 共用，只量一次）
  const inkOf = async (i) => (paints[i] = paints[i] || await paint(i));
  for (const inst of list) {    const g = await blockGeom(inst);
    geom[inst] = g;
    log(`      ${inst}（${g.block}／记号${g.mark}${g.valign === 'center' ? '／竖直居中' : '／基线'}）`
      + ` 记号盒[${g.markBox.l}…${g.markBox.r}] 记号文字范围[${g.markTextRange.l}…${g.markTextRange.r}]（宽 ${g.markTextRange.w}）`
      + ` 槽宽=${g.nameBox.l} 缝(按文字范围)=${g.seamText} 缝(按盒)=${g.seamBox}`
      + ` 组名左沿=${g.nameBox.l} 数量右沿=${g.countBox.r} 记号盒高=${g.markBox.h} 组名盒高=${g.nameBox.h} Δ中心=${g.dcyBox}`);
  }
  check('块 ①（悬挂＋固定缝 0.4rem）：缝 ＝ 6.4px（±0.5），且记号左沿 ＝ 块左沿（0，±0.5）',
    near(geom.b1.seamBox, SEAM_A, 0.5) && near(geom.b1.markBox.l, 0, 0.5),
    `缝=${geom.b1.seamBox} 记号左沿=${geom.b1.markBox.l} 记号[${geom.b1.markBox.l}…${geom.b1.markBox.r}] 组名左沿=${geom.b1.nameBox.l}`);
  // 块 ② 与 ②-2：悬挂＋槽内居中。两块只差槽宽，都要求「槽宽 > 记号的排版宽 ⇒ 缝为正、记号完全落在槽内」。
  const centered = (i, slot) =>
    near(geom[i].nameBox.l, slot, 0.5) &&
    near((geom[i].markTextRange.l + geom[i].markTextRange.r) / 2, slot / 2, 0.5) &&
    near(geom[i].markTextRange.w, MARK_ADVANCE, 0.3) &&
    geom[i].markTextRange.l >= -0.5 && geom[i].markTextRange.r <= slot + 0.5 &&
    near(geom[i].seamText, (slot - MARK_ADVANCE) / 2, 0.4) && geom[i].seamText > 0;
  check('块 ②（悬挂＋槽内居中）槽宽 ＝ 2rem（32px，±0.5）：记号在槽内居中（|记号中心 − 槽中心| ≤ 0.5）、记号完全落在槽内、缝为正',
    centered('b2', SLOT_B),
    `槽宽=${geom.b2.nameBox.l} 记号文字范围[${geom.b2.markTextRange.l}…${geom.b2.markTextRange.r}]（宽 ${geom.b2.markTextRange.w}）中心=${r1((geom.b2.markTextRange.l + geom.b2.markTextRange.r) / 2)} 槽中心=${r1(geom.b2.nameBox.l / 2)} 缝=${geom.b2.seamText}`);
  check('块 ②-2（悬挂＋槽内居中，另一档）槽宽 ＝ 1.6rem（25.6px，±0.5）：同样居中、记号完全落在槽内、缝为正',
    centered('b2-2', SLOT_B_ALT),
    `槽宽=${geom['b2-2'].nameBox.l} 记号文字范围[${geom['b2-2'].markTextRange.l}…${geom['b2-2'].markTextRange.r}] 中心=${r1((geom['b2-2'].markTextRange.l + geom['b2-2'].markTextRange.r) / 2)} 槽中心=${r1(geom['b2-2'].nameBox.l / 2)} 缝=${geom['b2-2'].seamText}`);
  check('② 与 ②-2 只差槽宽：两块的缝都为正且 ②（2rem）> ②-2（1.6rem），差＝两块槽宽差的一半（±0.3）',
    geom.b2.seamText > geom['b2-2'].seamText &&
    near(geom.b2.seamText - geom['b2-2'].seamText, (SLOT_B - SLOT_B_ALT) / 2, 0.3),
    `② 缝=${geom.b2.seamText}（槽 ${geom.b2.nameBox.l}）②-2 缝=${geom['b2-2'].seamText}（槽 ${geom['b2-2'].nameBox.l}）差=${r1(geom.b2.seamText - geom['b2-2'].seamText)}`);
  check('块 ③（不悬挂对照）：记号左沿 ＝ 块左内沿 16.8px（±0.5）、组名左沿 ＝ 记号右沿 ＋ 0.35rem（±1）',
    near(geom.b3.markBox.l, EDGE_X, 0.5) && near(geom.b3.nameBox.l - geom.b3.markBox.r, INLINE_GAP, 1),
    `记号左沿=${geom.b3.markBox.l} 记号右沿=${geom.b3.markBox.r} 组名左沿=${geom.b3.nameBox.l} 段内间距=${r1(geom.b3.nameBox.l - geom.b3.markBox.r)}`);
  check('块 ④（悬挂＋竖直居中）的水平几何与块 ① 完全一致（记号左右沿、槽宽、缝、组名左沿都相同，±0.5）',
    near(geom.b4.markBox.l, geom.b1.markBox.l, 0.5) && near(geom.b4.markBox.r, geom.b1.markBox.r, 0.5) &&
    near(geom.b4.nameBox.l, geom.b1.nameBox.l, 0.5) && near(geom.b4.seamBox, geom.b1.seamBox, 0.5),
    `④ 记号[${geom.b4.markBox.l}…${geom.b4.markBox.r}] 组名左沿=${geom.b4.nameBox.l} 缝=${geom.b4.seamBox} vs ① [${geom.b1.markBox.l}…${geom.b1.markBox.r}] 组名左沿=${geom.b1.nameBox.l} 缝=${geom.b1.seamBox}`);
  check('块 ⑤（夹具块）用块 ① 的排布（记号左右沿、缝、组名左沿都与 ① 相同，±0.5）',
    near(geom.b5.markBox.l, geom.b1.markBox.l, 0.5) && near(geom.b5.seamBox, geom.b1.seamBox, 0.5) &&
    near(geom.b5.nameBox.l, geom.b1.nameBox.l, 0.5),
    `⑤ 记号[${geom.b5.markBox.l}…${geom.b5.markBox.r}] 缝=${geom.b5.seamBox} 组名左沿=${geom.b5.nameBox.l}`);
  check('六块的数量都右对齐到块的右内沿（413.2px，±1）',
    list.every((i) => near(geom[i].countBox.r, W - EDGE_X, 1)),
    list.map((i) => i + ':' + geom[i].countBox.r).join(' '));
  check('六块的槽宽（＝组名左沿）分三套：① ④ ⑤ ＝ 27.5（记号宽＋0.4rem）· ②-2 ＝ 25.6（1.6rem，中间）· ② ＝ 32（2rem）· ③ ＝ 43.5（不悬挂）',
    near(geom.b1.nameBox.l, geom.b4.nameBox.l, 0.5) && near(geom.b4.nameBox.l, geom.b5.nameBox.l, 0.5) &&
    near(geom['b2-2'].nameBox.l, SLOT_B_ALT, 0.5) && near(geom.b2.nameBox.l, SLOT_B, 0.5) &&
    !near(geom.b2.nameBox.l, geom['b2-2'].nameBox.l, 1) && !near(geom.b3.nameBox.l, geom.b1.nameBox.l, 1),
    `组名左沿：①${geom.b1.nameBox.l} ②${geom.b2.nameBox.l} ②-2${geom['b2-2'].nameBox.l} ③${geom.b3.nameBox.l} ④${geom.b4.nameBox.l} ⑤${geom.b5.nameBox.l}`);

  // ---- [9] 竖直关系 ----
  log('\n[9] 竖直关系（版面盒中心差 Δ ＝ 记号盒中心 − 组名盒中心）');
  check('块 ④：Δ ＝ 0（±0.5px）⇒ 记号在竖直方向与组名居中',
    near(geom.b4.dcyBox, 0, 0.5), `④ Δ=${geom.b4.dcyBox}（记号盒高 ${geom.b4.markBox.h}、组名盒高 ${geom.b4.nameBox.h}）`);
  check('块 ① ② ②-2 ③ ⑤：基线对齐 ⇒ Δ > 1.5px（与 ④ 显著不同，说明 ④ 改的确实是竖直方向）',
    ['b1', 'b2', 'b2-2', 'b3', 'b5'].every((i) => geom[i].dcyBox > 1.5),
    ['b1', 'b2', 'b2-2', 'b3', 'b5'].map((i) => i + ':Δ=' + geom[i].dcyBox).join(' ') + ` ④:Δ=${geom.b4.dcyBox}`);
  check('块 ① 与 ④ 的组名排版盒的上下位置相同（top ±0.5）⇒ ④ 只动了记号、没有把组名挤上或挤下',
    near(geom.b1.nameBox.top, geom.b4.nameBox.top, 0.5),
    `①组名盒top=${geom.b1.nameBox.top} ④组名盒top=${geom.b4.nameBox.top}（盒高都是 ${geom.b1.nameBox.h}）`);
  await ensureOpen('b1', 0, true);
  await ensureOpen('b4', 0, true);
  const g1 = await blockGeom('b1'), g4 = await blockGeom('b4');
  check('展开第 1 组后，① 与 ④ 的组名左沿仍相同（±0.5）⇒ 竖直方案不影响水平',
    near(g1.nameBox.l, g4.nameBox.l, 0.5), `①${g1.nameBox.l} ④${g4.nameBox.l}`);
  await ensureOpen('b1', 0, false);
  await ensureOpen('b4', 0, false);
  // 竖直偏移在**实心笔画**上也是一样的（不只是版面盒）：① 是基线对齐、④ 把记号整体抬高 2.5px
  const inks = {};
  for (const i of ['b1', 'b2', 'b2-2', 'b3', 'b4', 'b5']) inks[i] = await inkOf(i);
  log(`      实心笔画竖直：① 记号相对组名基线=${inks.b1.relBaseline}px、笔画中心差=${inks.b1.paintedCenterDiff}px；`
    + `④ 记号相对组名基线=${inks.b4.relBaseline}px、笔画中心差=${inks.b4.paintedCenterDiff}px`);
  check('块 ① ② ②-2 ③ ⑤：记号与组名基线对齐（相对基线偏移 ＝ 0，±0.5px；由 canvas 的字体盒基线算出，不是只看盒中心）',
    ['b1', 'b2', 'b2-2', 'b3', 'b5'].every((i) => near(inks[i].relBaseline, 0, 0.5)),
    ['b1', 'b2', 'b2-2', 'b3', 'b5'].map((i) => i + ':' + inks[i].relBaseline).join(' '));
  check('块 ④：记号相对组名基线被抬高 2.5px（＝盒中心差），与「不抬高」的 ① 差 2.5px（±0.5）',
    near(inks.b4.relBaseline, -2.5, 0.5) && near(inks.b4.relBaseline - inks.b1.relBaseline, -2.5, 0.5),
    `④=${inks.b4.relBaseline} ①=${inks.b1.relBaseline} 差=${r1(inks.b4.relBaseline - inks.b1.relBaseline)}`);
  check('块 ④：实心笔画的竖直中心差（|记号笔画中心 − 组名笔画中心|）≤ 1.5px，且小于 ① 的 3.5px ⇒ 「上下居中」在笔画上也能看出来',
    Math.abs(inks.b4.paintedCenterDiff) <= 1.5 && Math.abs(inks.b4.paintedCenterDiff) < Math.abs(inks.b1.paintedCenterDiff) - 1,
    `① 笔画中心差=${inks.b1.paintedCenterDiff}px（记号比组名中心低）④ 笔画中心差=${inks.b4.paintedCenterDiff}px`);

  // ---- [10] 实心笔画 ----
  log('\n[10] 实心笔画（canvas 量的着墨范围，不是版面盒）：记号有没有被块左沿裁掉');
  for (const inst of list) {
    const p = await inkOf(inst);
    const fontOk = Math.abs(p.markAdvance - p.domMarkTextRangeW) <= 0.5;
    log(`      ${inst} 记号字体=${p.markFont}（canvas advance=${p.markAdvance} vs DOM 记号文字范围宽=${p.domMarkTextRangeW}${fontOk ? ' 一致' : ' 不一致'}）`
      + ` 着墨[${p.paintedLeftX}…${p.paintedRightX}] 组名着墨左=${p.namePaintedLeftX} 着墨缝=${p.paintedSeam}`);
    check(`${inst} 记号着墨左沿 ≥ 0（没有被块左沿裁掉）`, p.paintedLeftX >= -0.5, `着墨左沿=${p.paintedLeftX}px`);
    check(`${inst} canvas 量的记号 advance 与 DOM 里记号的文字范围宽一致（±0.5）⇒ 上面那行数字量的是同一个字体`,
      fontOk, `canvas=${p.markAdvance} DOM 文字范围=${p.domMarkTextRangeW}（DOM 盒宽 ${p.domMarkBoxW}${p.domMarkBoxW !== p.domMarkTextRangeW ? '：这一块的盒宽被槽宽限定，文字居中溢出' : ''}）`);
    check(`${inst} 记号着墨与组名着墨不相交（实心笔画不重叠，缝可以是 0）`,
      p.paintedRightX <= p.namePaintedLeftX + 0.5, `记号着墨右=${p.paintedRightX} 组名着墨左=${p.namePaintedLeftX}`);
  }
  log('      着墨缝对照（＝记号实心笔画右沿 → 组名实心笔画左沿）：'
    + list.map((i) => `${i}:${paints[i].paintedSeam}`).join('  ')
    + `   ／ 版面盒缝：${list.map((i) => `${i}:${geom[i].seamBox}`).join('  ')}`);

  // ---- [7] 题名左沿 == 组名左沿（缩进 0）----
  log('\n[7] 题名左沿 == 组名左沿（缩进 0，±1px）：逐块量，含夹具块那条折行的长题名行');
  for (const inst of list) {
    await ensureOpen(inst, 0, true);
    const first = await rowInfo(`[data-inst="${inst}"] .glist .poemrow:first-child`);
    const wrapped = inst === FX;
    check(`${inst} 第一条诗目：题名左沿 == 组名左沿（±1px）`,
      near(first.t_left, first.name_left, 1),
      `题名左沿=${first.t_left} 组名左沿=${first.name_left} 差=${r1(first.t_left - first.name_left)} 作者左沿=${first.a_left} 题名「${first.title}」`);
    const short = await rowInfo(`[data-inst="${inst}"] .glist .poemrow:nth-child(3)`);
    log(`      ${inst} 第 3 行 题名[${short.t_left}…${short.t_right}]「${short.title}」 作者[${short.a_left}…${short.a_right}]「${short.author}」 右内沿=${r1(W - EDGE_X)}`);
    check(`${inst} 作者紧随题名（不右对齐）：作者左沿 ≥ 题名右沿 − 1 且明显不在右内沿（413.2）`,
      short.a_left >= short.t_right - 1 && short.a_right < W - EDGE_X - 20,
      `题名[${short.t_left}…${short.t_right}] 作者[${short.a_left}…${short.a_right}] 右内沿=${r1(W - EDGE_X)}`);
    if (wrapped) {
      const w = await rowInfo(`[data-inst="${inst}"] .glist .poemrow[data-fx="1"]`);
      if (w.missing) check(`夹具块能找到折行的长题名行`, false, w.missing);
      else check(`${inst} 折行的长题名：确实折行（题名框高 > 30px）且折行后左沿仍 == 组名左沿（±1px）`,
        w.t_h > 30 && near(w.t_left, w.name_left, 1),
        `折行高=${w.t_h} 题名左沿=${w.t_left} 组名左沿=${w.name_left} 题名右沿=${w.t_right} 行内横向滚动=${w.hscroll}`);
      const short0 = await rowInfo(`[data-inst="${inst}"] .glist .poemrow:nth-child(3)`);
      check(`${inst} 折行行不影响别的行：第 3 行题名左沿仍 == 组名左沿（±1px）`,
        near(short0.t_left, short0.name_left, 1), `第3行题名左沿=${short0.t_left} 组名左沿=${short0.name_left}`);
    }
    await ensureOpen(inst, 0, false);
  }
  check('四块 + 夹具块的题名左沿各不相同（跟着各自的组名左沿走）⇒ 缩进 0 是真的「与组名首字同一竖线」',
    (() => {
      const t = { b1: geom.b1.nameBox.l, b2: geom.b2.nameBox.l, b3: geom.b3.nameBox.l };
      return !near(t.b1, t.b2, 1) && !near(t.b1, t.b3, 1) && !near(t.b2, t.b3, 1);
    })(),
    `组名左沿：①${geom.b1.nameBox.l} ②${geom.b2.nameBox.l} ③${geom.b3.nameBox.l}`);

  // ---- [11] 自包含 + 无 JS 报错 ----
  const ext = requests.filter((u) => !u.startsWith('file:///') && !u.startsWith('data:'));
  check('CDP 记录的网络请求里没有任何 http(s) 外部引用',
    ext.length === 0, `${requests.length} 个请求，非 file:// 的=${ext.length} ${JSON.stringify(ext)}`);
  const textHits = ['<link', 'src=', '@import', 'http://', 'https://'].filter((t) => htmlText.indexOf(t) >= 0);
  check('页面文本里没有 <link / src= / @import / http(s)://', textHits.length === 0, textHits.length ? '命中：' + textHits.join(' ') : '0 处');
  check('页面无 JS 报错', pageErrors.length === 0, pageErrors.length ? pageErrors.join(' | ') : '0 条');

  // ---- [12] 令牌快照逐项比对 ----
  const snapText = declarationBlock(htmlText, '== TOKEN-SNAPSHOT-BEGIN ==', '== TOKEN-SNAPSHOT-END ==');
  const draftText = declarationBlock(htmlText, '== DRAFT-VALUES-BEGIN ==', '== DRAFT-VALUES-END ==');
  const snap = snapText ? parseTokens(snapText) : new Map();
  const draft = draftText ? parseTokens(draftText) : new Map();
  const mismatches = [];
  for (const [k, v] of snap) {
    if (!themeTokens.has(k)) mismatches.push(`${k}: 规范里没有这个令牌（快照值 ${v}）`);
    else if (themeTokens.get(k) !== v) mismatches.push(`${k}: 快照 ${v} ≠ theme-tech.css ${themeTokens.get(k)}`);
  }
  const used = new Set((htmlText.match(/var\(--[A-Za-z0-9_-]+\)/g) || []).map((s) => s.slice(4, -1)));   // 扫全文件：样式与页面脚本都算
  const undeclared = [...used].filter((k) => !snap.has(k) && !draft.has(k));
  const unused = [...snap.keys()].filter((k) => !used.has(k));
  const unusedDraft = [...draft.keys()].filter((k) => !used.has(k));
  check(`令牌快照与 prototype/css/theme-tech.css 逐项比对：值不一致数 = ${mismatches.length}（要求 0）`,
    mismatches.length === 0,
    mismatches.length ? mismatches.join(' | ') : `${snap.size} 个令牌逐字一致（空白已归一化）`);
  check('快照里只列了实际用到的令牌／草案值（且用到的都有声明）',
    undeclared.length === 0 && unused.length === 0 && unusedDraft.length === 0,
    `未声明的 var()=${JSON.stringify(undeclared)} 声明了没用=${JSON.stringify(unused.concat(unusedDraft))}`);
  const shaRecorded = (htmlText.match(/仓库提交：([0-9a-f]{7,40})/) || [])[1] || '(没记录)';
  log(`      令牌来源记录：页面写的是提交 ${shaRecorded}；当前 HEAD=${gitHead}；theme-tech.css 相对 HEAD ${themeClean === null ? '未知' : (themeClean ? '无改动' : '有未提交改动')}`);
  check('页面记录了令牌快照的来源提交（短 sha）', /^[0-9a-f]{7,40}$/.test(shaRecorded), `记录=${shaRecorded}`);
  check('页面写明「权威仍是 docs/design/visual-tokens.md；这只是为自包含复制的快照、不是新权威」',
    htmlText.indexOf('权威仍是 docs/design/visual-tokens.md') >= 0 && htmlText.indexOf('不是新权威') >= 0,
    '两处措辞都在页面 CSS 注释里');

  // ---- [14] 看图态（#shot）：点开各组 → 量高 → 截图 ----
  if (!SHOT) { log('\n[14 / PNG] 已跳过（--no-shot）'); }
  else {
    await send('Page.navigate', { url: 'about:blank' });   // 先离开本页：#shot 是【新加载】，不是同页 fragment 跳转
    await sleep(200);
    await send('Page.navigate', { url: url + '#shot' });
    for (let i = 0; i < 120 && !events.includes('Page.loadEventFired'); i++) await sleep(100);
    await sleep(400);
    log('\n[14] #shot（看图模式）：先重查一次首态，再用真实鼠标点开各组，然后截一张 430 宽的图');
    let stillCollapsed = true;
    for (const inst of list) {
      const s = await instHeads(inst);
      if (!s.every((h) => h.expanded === 'false' && h.visibleRows === 0)) stillCollapsed = false;
    }
    check('#shot 不改变首态：仍是全部收起', stillCollapsed, stillCollapsed ? '五个块全收起' : '有块不是收起的');
    for (const inst of list) {
      await ensureOpen(inst, 0, true);
      const s = await instHeads(inst);
      if (s.length > 1) await ensureOpen(inst, 1, true);   // 夹具块：点开前两组
    }
    check('看图模式里每个展开的组都显示为「前 3 行 + 一条说明条」（页面本身是完整的）',
      JSON.parse(await js(`JSON.stringify(Array.from(document.querySelectorAll('[data-test="hub"]')).map(function(hub){
        var lists = Array.from(hub.querySelectorAll('.glist'));
        return { inst: hub.dataset.inst, 组数: lists.length,
          可见行: lists.map(function(l){ return Array.from(l.querySelectorAll('.poemrow')).filter(function(li){ return li.getBoundingClientRect().height > 0; }).length; }),
          说明条: lists.map(function(l){ return l.querySelectorAll('.shotnote').length; }) };
      }))`)).every((b) => b.可见行.every((n) => n <= 3) && b.说明条.every((n) => n >= 1)),
      JSON.stringify(await js(`JSON.stringify(Array.from(document.querySelectorAll('[data-test="hub"]')).map(function(hub){
        var lists = Array.from(hub.querySelectorAll('.glist'));
        return hub.dataset.inst + ':' + lists.map(function(l){ return Array.from(l.querySelectorAll('.poemrow')).filter(function(li){ return li.getBoundingClientRect().height > 0; }).length + '行/' + l.querySelectorAll('.shotnote').length + '条'; }).join(',');
      }))`)));
    ov = await overflowScan();
    check('430：点开各组（看图态）后仍无横向溢出，且每块仍是 430 宽',
      ov.docScrollWidth === W && ov.maxRight <= W + 0.5 && ov.minLeft >= -0.5 && ov.hubs.every((h) => h.w === W),
      `scrollWidth=${ov.docScrollWidth} maxRight=${ov.maxRight}(${ov.maxEl}) minLeft=${ov.minLeft} 块宽=${ov.hubs.map((h) => h.w).join(',')}`);
    const frame = JSON.parse(await js(`(function(){
      var f = document.querySelector('[data-shotframe]');
      var r = f.getBoundingClientRect();
      return JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top + window.scrollY), w: Math.round(r.width), h: Math.round(r.height) });
    })()`));
    const png = `${OUT}/${PNG}`;
    const shot = await send('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: true,
      clip: { x: 0, y: frame.y, width: W, height: frame.h, scale: 1 },
    });
    writeFileSync(png, Buffer.from(shot.data, 'base64'));
    check('截图块区宽度 ＝ 430 CSS px（六块纵向排列；图在文件系统里的像素宽 ＝ 430 × DPR 2 ＝ 860）',
      frame.w === W && statSync(png).size > 0,
      `${png} 块区 CSS ${frame.w}x${frame.h} @DPR ${DPR} → 像素 ${W * DPR}x${frame.h * DPR} → 文件 ${statSync(png).size} 字节`);
  }

  // ---- [13] 宽屏一遍：块宽固定 430，不随视口拉伸、不溢出 ----
  log('\n[13] 宽屏 1180：块宽固定 430（宽屏／桌面排布本身不在本轮表达）');
  await send('Emulation.setDeviceMetricsOverride', { width: 1180, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'file:///' + file.replace(/\\/g, '/') });
  for (let i = 0; i < 120 && !events.includes('Page.loadEventFired'); i++) await sleep(100);
  await sleep(300);
  const o = await overflowScan();
  check('1180：无横向溢出，且每个块仍是 430 CSS px 宽',
    o.innerWidth === 1180 && o.docScrollWidth === 1180 && o.hubs.length === 6 && o.hubs.every((h) => h.w === W),
    `innerWidth=${o.innerWidth} scrollWidth=${o.docScrollWidth} 块宽=${o.hubs.map((h) => h.w).join(',')} 块左沿=${o.hubs.map((h) => h.left).join(',')}`);

  ws.close();
}

try {
  await run();
} catch (e) {
  console.error('\n校验脚本失败：' + ((e && e.stack) || e));
  failures++;
} finally {
  chrome.kill();
  await sleep(300);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* 临时 profile 删不掉不影响结果 */ }
}
console.log(`\n===== 失败断言数：${failures} =====`);
process.exit(failures ? 1 : 0);
