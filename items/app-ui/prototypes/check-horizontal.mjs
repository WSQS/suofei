/*
 * check-horizontal.mjs —— 目录页「水平排布／对齐」讨论原型的【页面行为】自证脚本（可复跑）。
 *
 * ⚠ 它验的是这三个原型页面的页面行为，**不是产品代码**：
 *   对象只有本目录下的 q-hub-horizontal.head.html / .body.html / .title.html；
 *   三个 HTML 是**只读打开**的（Page.navigate 到 file:// URL，脚本不写、不改它们）。
 *   它不跑 web/ 与 android/ 的任何测试，也不读产品实现。唯一额外读的文件是
 *   prototype/css/theme-tech.css（**只读**），用来逐项比对页面内嵌的令牌快照。
 *
 * 断言清单（失败任一即 exit 1），三页在 **430 宽（规格里的移动口径，DPR 2）** 下各跑一遍：
 *  [1] 首态：三页每个块的**所有组头** `aria-expanded="false"`，且组内诗目**一项都不可见**
 *      —— 即「首次（无既有状态）全部收起，单组也收起」。
 *  [2] 组头节点是 `<button type="button">` 且带 `aria-expanded` 与 `aria-controls`（不是 div 冒充可点元素）。
 *  [3] 「关于」入口在**顶部**（每个块恰好 1 个，其 top < 第一个组头 top）；块里除「关于」与诗目
 *      以外的 `<a>` 个数＝0，且块的可见文字里不含搜索／笔记／版本／应用名等未采纳项。
 *  [4] **整个组头可点击**：用 CDP `Input.dispatchMouseEvent` 派发**真实鼠标事件**（不是页面里的
 *      `.click()`），逐块点**四个位置**（① 组名处 ② 中缝空白处 ③ 数量处 ④ 记号处；坐标由各元素的
 *      实测矩形给出，命中的 DOM 元素会被打印出来）。每次都必须：该组状态翻转，且**整页所有组头
 *      的状态快照只差这一组**。
 *  [5] 多组夹具块：可**同时展开两组**（点第 1 组 → 点第 2 组 ⇒ 恰好 2 组展开）；再点第 1 组
 *      ⇒ 只有它收起、第 2 组**仍然展开**（各组独立，不是手风琴）。
 *  [6] **无横向溢出**：`innerWidth === 430`、`documentElement.scrollWidth === 430`，全文档所有可见
 *      元素右沿 ≤ 430（左沿 ≥ 0），且**每个块（.hub）宽度恰好 430**。收起态与「点开后的看图态」各查一次。
 *  [7] **超长题名的折行与作者不被挤出/不重叠**：夹具长题名行确实折行，并按该块的对齐方式
 *      （作者右列／紧随题名／另起一行）分别断言作者没有被挤出、没有与题名重叠、行内无横向滚动。
 *  [8] **自包含**：CDP 的 `Network.requestWillBeSent` 记录里非 `file://` 的请求为 0 个，
 *      且三个 HTML 的文本里没有 `<link` / `src=` / `@import` / `http(s)://`。
 *      另：整页加载与交互期间**无 JS 报错**（uncaught / console.error / Log error）。
 *  [9] **页级维度实测**（每页只测它自己那一维度，数字全部打印出来）：
 *      head 页：基线「记号紧贴组名之前」且数量右对齐到右内沿；选项 A 记号在组名左沿之外（悬挂）
 *               且数量仍右对齐；选项 B 数量紧跟组名之后（不右对齐）。
 *      body 页：三块题名左沿 = 1.6rem(25.6) / 0.8rem(12.8) / **组名首字**（±1px）。
 *      title 页：基线作者右对齐成列且长题名折行时仍固定在右列；选项 A 作者紧随题名（短线距）；
 *                选项 B 作者在题名**下一行**（作者 top ≥ 题名 bottom）。
 *  [10] **令牌快照逐项比对**：页面里 `TOKEN-SNAPSHOT-BEGIN/END` 之间的每个令牌，与
 *      prototype/css/theme-tech.css 的同名值**逐字**比较（空白归一化后）⇒ **值不一致数必须为 0**；
 *      反过来也查：页面用到的每个 `var(--x)` 都必须有声明（快照或明示的草案值），
 *      且快照里不许有「声明了却没用」的令牌。页内只做**报告**：记录的 git 短 sha、当前 HEAD、
 *      theme-tech.css 是否有未提交改动。
 *
 * 三个 **430 宽 PNG**（860 px 宽 @DPR 2）怎么拍（**这一步会重写图片，见下面的副作用**）：
 *   1. 先在**普通页面**上跑完上面全部断言（不动页面）；
 *   2. 再 navigate 到 `…html#shot`：**#shot 只是页面自带的「看图模式」**——它把每个展开的组显示为
 *      **前 3 行 + 一条说明条**（否则 19 首 × 4 块会让图过长）并显示一条横幅；
 *      **它不改变任何排布、也不改变首态**（脚本会在 #shot 下重查一次「首态全收起」）。
 *   3. 在 #shot 下用**真实鼠标**逐个点开各块的第 1 组（夹具块点开前两组）；
 *   4. 量出 `.shotframe` 的矩形，`Page.captureScreenshot` 截 x=0、宽 430、DPR 2 ⇒ **860 px 宽**，
 *      每块在其中都恰好 430 CSS px 宽、纵向排列。
 *   所以：图是「页面加载后点开各组」的状态；**页面加载时的首态仍是全收起**（断言 [1] 先跑过）。
 *
 * 怎么跑（在仓库根或任意目录都行）：
 *   node items/app-ui/prototypes/check-horizontal.mjs
 *   node items/app-ui/prototypes/check-horizontal.mjs --no-shot    # 只跑断言，不重出 PNG
 *
 * 需要什么：
 *   - Node（用到内置的 fetch / WebSocket，故需较新的 Node；本机实测 v25.9.0 通过）；
 *   - **本机无头 Chromium 的可执行文件**。顺序：环境变量 `CHROME_BIN` → 否则按
 *     `%LOCALAPPDATA%\Chromium\Application\chrome.exe` 推（与本仓既有做法一致，见
 *     `web/tests/e2e-cdp.mjs` 与 `prototype/tools/shot.mjs` 的同名回退）。
 *     找不到就**如实报错并 exit 2**（CHROME_BIN 指到错路径也走这一条，不会假装通过）。
 *   - **不需要**任何 npm 依赖：不装包、不联网、不起静态服务（直接开 file://）。
 *
 * 副作用（说清，免得复跑后以为工作树坏了）：
 *   - 会在**临时目录**建一个 Chromium profile，结束时删掉；
 *   - **默认会重写**本目录下的 3 个 PNG：q-hub-horizontal.{head,body,title}.430.png。
 *     不同 Chromium 版本/字体渲染可能让字节数变化 ⇒ **复跑可能让这些 PNG 变脏**，那是正常现象，
 *     不是脚本改坏了什么。只想看断言就加 `--no-shot`。
 *   - 三个 HTML 本身**只读打开**，不写、不改；夹具数据只在页面脚本里，脚本不碰 content/。
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = dirname(fileURLToPath(import.meta.url)); // 本脚本所在目录＝原型目录
const ROOT = join(OUT, '..', '..', '..');            // 仓库根
const SHOT = !process.argv.includes('--no-shot');
const W = 430;                                       // 规格：真实 430 CSS px 移动宽度
const DPR = 2;                                       // 图：860 px 宽
const EDGE_X = 16.8;                                 // 草案值 --edge-x: 1.05rem ⇒ 16.8px（右内沿）
const PAGES = ['head', 'body', 'title'];

// ── 找 Chromium：CHROME_BIN 优先，否则 %LOCALAPPDATA%\Chromium\Application\chrome.exe
const CHROME = process.env.CHROME_BIN
  || join(process.env.LOCALAPPDATA || '', 'Chromium', 'Application', 'chrome.exe');
if (!CHROME || !existsSync(CHROME)) {
  console.error('找不到无头 Chromium：' + (CHROME || '(未设置)'));
  console.error('请用环境变量指定，例如：');
  console.error("  CHROME_BIN='C:/Users/wsqsy/AppData/Local/Chromium/Application/chrome.exe' \\");
  console.error('    node items/app-ui/prototypes/check-horizontal.mjs');
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'horizproto-'));
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
    if (midX <= n.right + 2 || midX >= c.left - 2) midX = (n.right + c.left) / 2;   // 缝太窄也照样报出来
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
  // 单个块内某一行的题名/作者实测（含折行、重叠、行内滚动）
  const rowInfo = async (sel) => JSON.parse(await js(`(function(){
    var li = document.querySelector('${sel}');
    if (!li) return JSON.stringify({ missing: '${sel}' });
    var hub = li.closest('[data-test="hub"]');
    var t = li.querySelector('[data-test="ptitle"]'), a = li.querySelector('[data-test="pauthor"]');
    var rt = t.getBoundingClientRect(), ra = a.getBoundingClientRect(), rl = li.getBoundingClientRect(), rh = hub.getBoundingClientRect();
    return JSON.stringify({ inst: hub.dataset.inst, rel: hub.dataset.rel, title: t.textContent, author: a.textContent,
      t_left: rt.left - rh.left, t_right: rt.right - rh.left, t_h: rt.height, t_bottom: rt.bottom,
      a_left: ra.left - rh.left, a_right: ra.right - rh.left, a_top: ra.top, a_bottom: ra.bottom,
      row_left: rl.left - rh.left, row_right: rl.right - rh.left,
      hscroll: li.scrollWidth > li.clientWidth });
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

  for (const page of PAGES) {
    const file = `${OUT}/q-hub-horizontal.${page}.html`;
    const htmlText = readFileSync(file, 'utf8');
    const url = 'file:///' + file.replace(/\\/g, '/');

    // ── 普通页面：先跑完全部断言 ─────────────────────────────────
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: 932, deviceScaleFactor: DPR, mobile: true });
    requests.length = 0; pageErrors.length = 0; events.length = 0;
    await send('Page.navigate', { url });   // 只读打开，不写文件
    for (let i = 0; i < 120 && !events.includes('Page.loadEventFired'); i++) await sleep(100);
    await sleep(400);

    log(`\n═══════════ 页 ${page}：q-hub-horizontal.${page}.html（430 宽 · DPR ${DPR}）═══════════`);
    const list = await insts();

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
    check('四个块的所有组头 aria-expanded=false 且诗目一项都不可见', allCollapsed, stateDump.join(' | '));

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
      about.length === 4 && about.every((h) => h.n === 1 && h.text === '关于' && h.above === true),
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
    check('四个块宽度恰好 430 CSS px',
      ov.hubs.length === 4 && ov.hubs.every((h) => h.w === W),
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

    // ---- [5] 多组夹具：可同时展开两组、各组独立 ----
    log('\n[5] 多组夹具块：可同时展开两组（不是手风琴）');
    const fxInst = (await js(`(function(){ var h = document.querySelector('[data-block="fx"]'); return h ? h.dataset.inst : null; })()`));
    const fxHeadsBefore = (await instHeads(fxInst)).map((h) => h.expanded);
    for (const gi of [0, 1]) {
      await ensureOpen(fxInst, gi, true);
    }
    let fs = await instHeads(fxInst);
    check('点开夹具块的前两组 ⇒ 恰好 2 组展开（各组独立，不是手风琴）',
      fs.filter((h) => h.expanded === 'true').length === 2,
      `${fxHeadsBefore.join(',')} → ${fs.map((h) => h.group + '=' + h.expanded + '(可见' + h.visibleRows + '/' + h.rows + '行)').join(' ')}`);
    check('展开时记号＝[−]，收起时记号＝[+]',
      fs.every((h) => h.mark === (h.expanded === 'true' ? '[\u2212]' : '[+]')),
      fs.map((h) => h.group + ':' + h.mark).join(' '));
    await ensureOpen(fxInst, 0, false);
    fs = await instHeads(fxInst);
    check('再点第 1 组 ⇒ 只有它收起，第 2 组仍然展开',
      fs[0].expanded === 'false' && fs[1].expanded === 'true' && fs[2].expanded === 'false',
      fs.map((h) => h.group + '=' + h.expanded).join(' '));

    // ---- [7] 超长题名折行 + 作者不被挤出/不重叠 ----
    log('\n[7] 430：超长夹具题名行的折行与作者（按各自的对齐方式断言）');
    const wrapCases = [];
    for (const inst of list) {
      const has = JSON.parse(await js(`JSON.stringify(!!document.querySelector('[data-inst="${inst}"] .poemrow[data-fx="1"]'))`));
      if (has) wrapCases.push({ inst, gi: 0, sel: `[data-inst="${inst}"] .poemrow[data-fx="1"]`, kind: '每块第 1 行的夹具长题名' });
    }
    if (page === 'title') {
      check('页 3：每个真实内容块都有那条夹具长题名行（标为夹具行）',
        wrapCases.length === 3, `有夹具行的块：${wrapCases.map((c) => c.inst).join(' ')}`);
    }
    wrapCases.push({ inst: fxInst, gi: 0, sel: `[data-inst="${fxInst}"] .glist .poemrow:first-child`, kind: '夹具块第 1 组的长题名' });
    wrapCases.push({ inst: 'b1', gi: 0, sel: `[data-inst="b1"] .glist .poemrow:first-child`, kind: '块 ① 第 1 行的题名' });
    for (const c of wrapCases) {
      await ensureOpen(c.inst, c.gi, true);
      const w = await rowInfo(c.sel);
      if (w.missing) { check(`${c.kind}（${c.inst}）能找到`, false, w.missing); continue; }
      const isLong = w.t_h > 30;
      if (c.kind.indexOf('长题名') >= 0) {
        check(`${c.inst} ${c.kind} 在 430 下确实折行`,
          isLong, `题名框高=${r1(w.t_h)}（单行约 26px）题名=「${w.title}」`);
      }
      const insideRow = w.a_left >= w.row_left - 0.5 && w.a_right <= w.row_right + 0.5 && !w.hscroll;
      if (w.rel === 'right') {
        check(`${c.inst} 作者右列：不被挤出、不与题名重叠（rel=right）`,
          w.a_left >= w.t_right - 0.5 && insideRow,
          `题名[${r1(w.t_left)}…${r1(w.t_right)}] 作者[${r1(w.a_left)}…${r1(w.a_right)}] 行[${r1(w.row_left)}…${r1(w.row_right)}] 行内横向滚动=${w.hscroll}`);
      } else if (w.rel === 'follow') {
        check(`${c.inst} 作者紧随题名：不出行、不越过题名左沿、行内无滚动（rel=follow）`,
          w.a_left >= w.t_left - 0.5 && insideRow,
          `题名[${r1(w.t_left)}…${r1(w.t_right)}] 作者[${r1(w.a_left)}…${r1(w.a_right)}] 行[${r1(w.row_left)}…${r1(w.row_right)}] 行内横向滚动=${w.hscroll}`);
      } else {
        check(`${c.inst} 作者另起一行：作者在题名下方、不出行（rel=line）`,
          w.a_top >= w.t_bottom - 1 && insideRow,
          `题名底=${r1(w.t_bottom)} 作者顶=${r1(w.a_top)} 差=${r1(w.a_top - w.t_bottom)} 行内横向滚动=${w.hscroll}`);
      }
    }

    // ---- [9] 页级维度实测 ----
    log(`\n[9] 页 ${page} 的维度实测`);
    if (page === 'head') {
      for (const inst of list) await ensureOpen(inst, 0, false);   // 只看组头
      const b1 = await headGeom('b1', 0), bA = await headGeom('b2', 0), bB = await headGeom('b3', 0);
      log(`      基线 b1：记号[${r1(b1.markLeft)}…${r1(b1.markRight)}] 组名[${r1(b1.nameLeft)}…${r1(b1.nameRight)}] 数量[${r1(b1.countLeft)}…${r1(b1.countRight)}] 右内沿=${r1(430 - EDGE_X)}`);
      log(`      选项A b2：记号[${r1(bA.markLeft)}…${r1(bA.markRight)}] 组名[${r1(bA.nameLeft)}…${r1(bA.nameRight)}] 数量[${r1(bA.countLeft)}…${r1(bA.countRight)}]`);
      log(`      选项B b3：记号[${r1(bB.markLeft)}…${r1(bB.markRight)}] 组名[${r1(bB.nameLeft)}…${r1(bB.nameRight)}] 数量[${r1(bB.countLeft)}…${r1(bB.countRight)}]`);
      check('基线：记号紧贴组名之前（记号右沿 ≤ 组名左沿，缝 0…8px）',
        b1.markRight <= b1.nameLeft + 0.5 && b1.gapMarkName >= -0.5 && b1.gapMarkName <= 8,
        `缝=${r1(b1.gapMarkName)}px 记号右=${r1(b1.markRight)} 组名左=${r1(b1.nameLeft)}`);
      check('基线：数量右对齐到块的右内沿（1.05rem 草案值 ⇒ 413.2）',
        near(b1.countRight, 430 - EDGE_X, 1), `数量右沿=${r1(b1.countRight)} 期望=${r1(430 - EDGE_X)}`);
      check('选项 A：记号悬挂在组名左沿之外，且组名左沿比基线更靠左',
        bA.markRight <= bA.nameLeft + 0.5 && bA.nameLeft < b1.nameLeft - 5 && bA.markLeft <= 4,
        `记号[${r1(bA.markLeft)}…${r1(bA.markRight)}] 组名左=${r1(bA.nameLeft)}（基线 ${r1(b1.nameLeft)}）`);
      check('选项 A：数量仍右对齐（与基线的数量右沿同一条线）',
        near(bA.countRight, b1.countRight, 0.5), `A=${r1(bA.countRight)} 基线=${r1(b1.countRight)}`);
      check('选项 B：数量紧跟组名之后（与组名缝 0…8px），且明显不在右沿',
        bB.countLeft - bB.nameRight >= -0.5 && bB.countLeft - bB.nameRight <= 8 && bB.countRight < 430 - EDGE_X - 60,
        `缝=${r1(bB.countLeft - bB.nameRight)}px 数量[${r1(bB.countLeft)}…${r1(bB.countRight)}] 右内沿=${r1(430 - EDGE_X)}`);
      check('选项 B：组名位置与基线一致（本选项只动数量）',
        near(bB.nameLeft, b1.nameLeft, 0.5), `B=${r1(bB.nameLeft)} 基线=${r1(b1.nameLeft)}`);
    }
    if (page === 'body') {
      const rows = {};
      const names = {};
      for (const inst of list) {
        await ensureOpen(inst, 0, true);
        const w = await rowInfo(`[data-inst="${inst}"] .glist .poemrow:first-child`);
        const g = await headGeom(inst, 0);
        rows[inst] = w.t_left;
        names[inst] = g.nameLeft;
        log(`      ${inst} 题名左沿=${r1(w.t_left)}px（块左沿=0；= ${r1(w.t_left / 16)}rem）  组名首字左沿=${r1(g.nameLeft)}px  右内沿=${r1(430 - EDGE_X)}`);
      }
      check('基线：题名左沿 = 1.6rem（草案值 25.6px）', near(rows.b1, 25.6, 1), `实测 ${r1(rows.b1)}px`);
      check('选项 A：题名左沿 = 0.8rem（草案值 12.8px）', near(rows.b2, 12.8, 1), `实测 ${r1(rows.b2)}px`);
      check('选项 B：题名左沿 = 组名首字左沿（±1px）',
        near(rows.b3, names.b3, 1), `题名=${r1(rows.b3)}px 组名首字=${r1(names.b3)}px`);
      check('三条左沿互不相同（1.6rem ≠ 0.8rem ≠ 组名首字）',
        !near(rows.b1, rows.b2, 1) && !near(rows.b2, rows.b3, 1) && !near(rows.b1, rows.b3, 1),
        `${r1(rows.b1)} / ${r1(rows.b2)} / ${r1(rows.b3)}`);
    }
    if (page === 'title') {
      for (const inst of ['b1', 'b2', 'b3']) await ensureOpen(inst, 0, true);
      const short1 = await rowInfo('[data-inst="b1"] .glist .poemrow:nth-child(3)');
      const long1 = await rowInfo('[data-inst="b1"] .poemrow[data-fx="1"]');
      const short2 = await rowInfo('[data-inst="b2"] .glist .poemrow:nth-child(3)');
      const short3 = await rowInfo('[data-inst="b3"] .glist .poemrow:nth-child(3)');
      const long3 = await rowInfo('[data-inst="b3"] .poemrow[data-fx="1"]');
      log(`      基线 b1：短题名作者右沿=${r1(short1.a_right)} 长题名作者右沿=${r1(long1.a_right)}（行右沿=${r1(long1.row_right)}）长题名折行高=${r1(long1.t_h)}`);
      log(`      选项A b2：短题名 题名右=${r1(short2.t_right)} 作者左=${r1(short2.a_left)} 缝=${r1(short2.a_left - short2.t_right)}（0.45em of 12px ⇒ 5.4）`);
      log(`      选项B b3：短题名 题名底=${r1(short3.t_bottom)} 作者顶=${r1(short3.a_top)}；长题名 题名底=${r1(long3.t_bottom)} 作者顶=${r1(long3.a_top)}`);
      check('基线：作者右对齐成列（短题名与长题名行的作者右沿同一条线，±1px）',
        near(short1.a_right, long1.a_right, 1), `${r1(short1.a_right)} vs ${r1(long1.a_right)}`);
      check('基线：作者贴在右内沿（= 413.2）',
        near(short1.a_right, 430 - EDGE_X, 1), `实测 ${r1(short1.a_right)}px 期望 ${r1(430 - EDGE_X)}px`);
      check('基线：长题名折行时作者仍固定在右列（没有被挤出、不重叠）',
        long1.t_h > 30 && long1.a_left >= long1.t_right - 0.5 && long1.a_right <= long1.row_right + 0.5,
        `折行高=${r1(long1.t_h)} 题名右=${r1(long1.t_right)} 作者[${r1(long1.a_left)}…${r1(long1.a_right)}]`);
      check('选项 A：作者紧随题名（短题名行缝 = 0.45em ≈ 5.4px，±2px）',
        near(short2.a_left - short2.t_right, 5.4, 2), `缝=${r1(short2.a_left - short2.t_right)}px`);
      const long2 = await rowInfo('[data-inst="b2"] .poemrow[data-fx="1"]');
      log(`      选项A b2（长题名）：题名[${r1(long2.t_left)}…${r1(long2.t_right)}] 折行高=${r1(long2.t_h)} 作者[${r1(long2.a_left)}…${r1(long2.a_right)}] 行右沿=${r1(long2.row_right)} 行内横向滚动=${long2.hscroll}`);
      check('选项 A：长题名折行时作者仍不出行、不越过行的左沿、行内无滚动',
        long2.t_h > 30 && long2.a_left >= long2.row_left + 25.6 - 0.5 && long2.a_right <= long2.row_right + 0.5 && !long2.hscroll,
        `题名折行高=${r1(long2.t_h)} 作者左=${r1(long2.a_left)} 行左沿=${r1(long2.row_left)} 行右沿=${r1(long2.row_right)} 作者=${long2.author}`);
      check('选项 B：作者另起一行（短题名与长题名行都是 作者顶 ≥ 题名底）',
        short3.a_top >= short3.t_bottom - 1 && long3.a_top >= long3.t_bottom - 1,
        `短：${r1(short3.a_top - short3.t_bottom)}px 长：${r1(long3.a_top - long3.t_bottom)}px（≥0 即在下一行）`);
    }

    // ---- [8] 自包含 + 无 JS 报错 ----
    const ext = requests.filter((u) => !u.startsWith('file:///') && !u.startsWith('data:'));
    check('CDP 记录的网络请求里没有任何 http(s) 外部引用',
      ext.length === 0, `${requests.length} 个请求，非 file:// 的=${ext.length} ${JSON.stringify(ext)}`);
    const textHits = ['<link', 'src=', '@import', 'http://', 'https://'].filter((t) => htmlText.indexOf(t) >= 0);
    check('页面文本里没有 <link / src= / @import / http(s)://', textHits.length === 0, textHits.length ? '命中：' + textHits.join(' ') : '0 处');
    check('页面无 JS 报错', pageErrors.length === 0, pageErrors.length ? pageErrors.join(' | ') : '0 条');

    // ---- [10] 令牌快照逐项比对 ----
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

    // ── 看图态（#shot）：点开各组 → 量高 → 截图 ──────────────────
    if (!SHOT) { log('\n[PNG] 已跳过（--no-shot）'); continue; }
    await send('Page.navigate', { url: 'about:blank' });   // 先离开本页：#shot 是【新加载】，不是同页 fragment 跳转
    await sleep(200);
    await send('Page.navigate', { url: url + '#shot' });
    for (let i = 0; i < 120 && !events.includes('Page.loadEventFired'); i++) await sleep(100);
    await sleep(400);
    log('\n[shot] #shot（看图模式）：先重查一次首态，再用真实鼠标点开各组');
    let stillCollapsed = true;
    for (const inst of list) {
      const s = await instHeads(inst);
      if (!s.every((h) => h.expanded === 'false' && h.visibleRows === 0)) stillCollapsed = false;
    }
    check('#shot 不改变首态：仍是全部收起', stillCollapsed, stillCollapsed ? '四个块全收起' : '有块不是收起的');
    for (const inst of list) {
      await ensureOpen(inst, 0, true);
      const s = await instHeads(inst);
      if (s.length > 1) await ensureOpen(inst, 1, true);   // 夹具块：点开前两组
    }
    ov = await overflowScan();
    check('430：点开各组（看图态）后仍无横向溢出，且每块仍是 430 宽',
      ov.docScrollWidth === W && ov.maxRight <= W + 0.5 && ov.minLeft >= -0.5 && ov.hubs.every((h) => h.w === W),
      `scrollWidth=${ov.docScrollWidth} maxRight=${ov.maxRight}(${ov.maxEl}) minLeft=${ov.minLeft} 块宽=${ov.hubs.map((h) => h.w).join(',')}`);
    const frame = JSON.parse(await js(`(function(){
      var f = document.querySelector('[data-shotframe]');
      var r = f.getBoundingClientRect();
      return JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top + window.scrollY), w: Math.round(r.width), h: Math.round(r.height) });
    })()`));
    const png = `${OUT}/q-hub-horizontal.${page}.430.png`;
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
  log('\n═══════════ 宽屏 1180：块宽固定 430（宽屏／桌面排布本身不在本轮表达）═══════════');
  await send('Emulation.setDeviceMetricsOverride', { width: 1180, height: 900, deviceScaleFactor: 1, mobile: false });
  for (const page of PAGES) {
    const file = `${OUT}/q-hub-horizontal.${page}.html`;
    await send('Page.navigate', { url: 'file:///' + file.replace(/\\/g, '/') });
    for (let i = 0; i < 120 && !events.includes('Page.loadEventFired'); i++) await sleep(100);
    await sleep(300);
    const o = await overflowScan();
    check(`1180 · 页 ${page}：无横向溢出，且每个块仍是 430 CSS px 宽`,
      o.innerWidth === 1180 && o.docScrollWidth === 1180 && o.hubs.length === 4 && o.hubs.every((h) => h.w === W),
      `innerWidth=${o.innerWidth} scrollWidth=${o.docScrollWidth} 块宽=${o.hubs.map((h) => h.w).join(',')} 块左沿=${o.hubs.map((h) => h.left).join(',')}`);
  }

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
