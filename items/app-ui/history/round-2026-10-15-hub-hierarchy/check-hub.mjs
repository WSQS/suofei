/*
 * check-hub.mjs —— 目录页层级讨论原型的【页面行为】自证脚本（可复跑）。
 *
 * ⚠ 它验的是这两个原型页面的行为，**不是产品代码**：
 *   对象只有本目录下的 q-hub-hierarchy.a.html 与 q-hub-hierarchy.b.html；
 *   两个 HTML 是**只读打开**的（Page.navigate 到 file:// URL，脚本不写、不改它们）。
 *   它不跑 web/ 与 android/ 的任何测试，也不读产品实现。
 *
 * 它跑**两遍**：1180 宽（长图口径）与 **430 宽（规格里的移动口径）**，两遍都跑同一套断言，
 * 430 那遍另加四项窄栏专项。
 *
 * 断言清单（失败任一即 exit 1）：
 *  [1] 首态：两个「首态实例」（b1＝真实 1 组 19 首、b3＝多组夹具）的**所有组头**
 *      `aria-expanded="false"`，且组内诗目**一项都不可见**（可见行数＝0）——即
 *      「首次（无既有状态）全部收起，单组也收起」。
 *  [2] 组头节点是 `<button type="button">` 且带 `aria-expanded` 与 `aria-controls`
 *      （不是 div 冒充可点元素）。
 *  [3] **整个组头可点击**：用 CDP 的 `Input.dispatchMouseEvent` 派发**真实鼠标事件**（不是页面里
 *      的 `.click()`），落点取组头矩形左侧（`elementFromPoint` 实测命中的是**组名** `.gname`，
 *      不是记号），并要求**只有该组变化**——同时抓取整页 11 个组头的状态快照，前后必须只差这一组。
 *      各组**独立、可同时展开两组**（不是手风琴）：点第二个组头 ⇒ 恰好 2 个展开；
 *      再点同一个组头 ⇒ 只有它收起，另一组**仍然展开**。
 *      「关于」入口：每个实例**恰好 1 个**，位置符合该候选（A＝上部、B＝下部），
 *      且「关于」与诗目以外的 `<a>` 个数＝0（不夹带应用名／搜索／状态位／版本号等未采纳项）。
 *  [4] **自包含**：CDP 的 `Network.requestWillBeSent` 记录的整页请求里，**非 `file://` 的为 0 个**。
 *  [5] **无 JS 报错**：整页加载与交互期间没有 uncaught / console.error / Log error。
 *
 * 430 那遍另加的窄栏专项（[6]–[8]）：
 *  [6] **无横向溢出**：`innerWidth === 430`、`documentElement.scrollWidth === 430`，
 *      且全文档**所有可见元素的右沿都 ≤ 430**（左沿 ≥ 0），超出就报出是哪个元素。
 *  [7] **整组头四个位置**（左/组名、中/空白、右侧、最右/记号）逐个用真实鼠标点，
 *      每次都必须：该组状态翻转、且**同一实例里另外两组一个都没动**。
 *  [8] **题名/作者换行**：超长夹具题名那一行在 430 下**确实折行**，并且**作者没有被挤出、
 *      没有与题名重叠**（作者右沿 ≤ 行右沿、作者左沿 ≥ 题名右沿）；普通行同样不重叠、不溢出。
 *  窄栏专项之外，[1]–[5] 在 430 下**重跑一遍**（关于入口位置、首态全收起、独立展开都在 430 下复验）。
 *
 * 输出：两张整页长图（1180 宽）与**两张 430 宽的单实例窄图**（把「真实 1 组 19 首」那两个实例
 *   ①首态收起＋②展开 一起框进去），并把每张图的尺寸与字节数打出来。
 *   ⚠ 截图在**交互测试之前**拍：否则拍到的是被点过的状态，与块标题对不上（初版就是这么错的）。
 *
 * 怎么跑（在仓库根或任意目录都行）：
 *   node items/app-ui/prototypes/check-hub.mjs
 *   node items/app-ui/prototypes/check-hub.mjs --no-shot    # 只跑断言，不重出 PNG
 *
 * 需要什么：
 *   - Node（用到内置的 fetch / WebSocket，故需较新的 Node；本机实测 v25.9.0 通过）；
 *   - **本机无头 Chromium 的可执行文件**。顺序：环境变量 `CHROME_BIN` → 否则按
 *     `%LOCALAPPDATA%\Chromium\Application\chrome.exe` 推（与本仓既有做法一致，见
 *     `web/tests/e2e-cdp.mjs` 的 CHROME_BIN 与 `prototype/tools/shot.mjs` 的同名回退）。
 *     找不到就**如实报错并 exit 2**，不假装通过。
 *   - **不需要**任何 npm 依赖：不装包、不联网、不起静态服务（直接开 file://）。
 *
 * 副作用（说清，免得复跑后以为工作树坏了）：
 *   - 会在**临时目录**建一个 Chromium profile，结束时删掉；
 *   - **默认会重写**本目录下的 4 个 PNG：q-hub-hierarchy.{a,b}.png（1180 长图）与
 *     q-hub-hierarchy.{a,b}.430.png（430 窄图）。不同 Chromium 版本/字体渲染可能让字节数变化
 *     ⇒ **复跑可能让这些 PNG 变脏**，那是正常现象，不是脚本改坏了什么。只想看断言就加 `--no-shot`。
 *   - 两个 HTML 本身**只读打开**，不写、不改。
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = dirname(fileURLToPath(import.meta.url)); // 本脚本所在目录＝原型目录
const SHOT = !process.argv.includes('--no-shot');

// ── 两遍：1180 长图口径、430 移动口径（规格写的是移动 430px）
const PASSES = [
  { tag: '1180 宽 · 长图口径', W: 1180, H: 1000, DPR: 1, mobile: false, shot: 'long' },
  { tag: '430 宽 · 移动口径', W: 430, H: 932, DPR: 2, mobile: true, shot: 'narrow' },
];

// ── 找 Chromium：CHROME_BIN 优先，否则 %LOCALAPPDATA%\Chromium\Application\chrome.exe
//    （与 web/tests/e2e-cdp.mjs、prototype/tools/shot.mjs 的回退一致）
const CHROME = process.env.CHROME_BIN
  || join(process.env.LOCALAPPDATA || '', 'Chromium', 'Application', 'chrome.exe');
if (!CHROME || !existsSync(CHROME)) {
  console.error('找不到无头 Chromium：' + (CHROME || '(未设置)'));
  console.error('请用环境变量指定，例如：');
  console.error("  CHROME_BIN='C:/Users/wsqsy/AppData/Local/Chromium/Application/chrome.exe' \\");
  console.error('    node items/app-ui/prototypes/check-hub.mjs');
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'hubproto-'));
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
  // 把某个组头滚到视口中间并量出矩形 —— ⚠ 每次点击前都要重新量：展开会改变布局，
  //   复用过期坐标会点到别的组头上（初版就是这么错的）。
  const headGeometry = (inst, gi) => js(`(function(){
    var h = document.querySelectorAll('[data-inst="${inst}"] .ghead')[${gi}];
    h.scrollIntoView({block:'center'});
    var r = h.getBoundingClientRect();
    var mid = r.left + r.width*0.5, p75 = r.left + r.width*0.78;
    var at = function(x){ return (document.elementFromPoint(x, r.top + r.height/2)||{}).className || '(无)'; };
    return JSON.stringify({tag:h.tagName, left:r.left, top:r.top, w:r.width, h:r.height,
      y: r.top + r.height/2,
      pos: [
        {name:'左（组名处）', x: r.left + 18},
        {name:'中（空白处）', x: mid},
        {name:'右侧',        x: p75},
        {name:'最右（记号处）', x: r.right - 14}
      ].map(function(p){ return {name:p.name, x:p.x, at: at(p.x)}; }) });
  })()`);

  const stateOf = (inst) => js(`JSON.stringify({
    heads: Array.from(document.querySelectorAll('[data-inst="${inst}"] .ghead')).map(function(h){
      var list = document.getElementById(h.getAttribute('aria-controls'));
      var vis = !!list && !list.hasAttribute('hidden') && getComputedStyle(list).display !== 'none'
                && list.getBoundingClientRect().height > 0;
      var rows = list ? Array.from(list.querySelectorAll('.poemrow')) : [];
      var visibleRows = rows.filter(function(li){ return li.getBoundingClientRect().height > 0; }).length;
      return { group: h.dataset.group, tag: h.tagName, expanded: h.getAttribute('aria-expanded'),
               mark: (h.querySelector('.gmark')||{}).textContent, listVisible: vis,
               rows: rows.length, visibleRows: visibleRows, listId: list ? list.id : null };
    })
  })`);

  // 整页 11 个组头的状态快照：用来证明「只有该组变化」
  const allHeads = () => js(`JSON.stringify(Array.from(document.querySelectorAll('[data-inst] .ghead')).map(function(h){
      return h.dataset.group + '@' + h.closest('[data-inst]').dataset.inst + '=' + h.getAttribute('aria-expanded');
    }))`);

  await send('Runtime.enable'); await send('Log.enable');
  await send('Page.enable'); await send('Network.enable');

  for (const cfg of PASSES) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: cfg.W, height: cfg.H, deviceScaleFactor: cfg.DPR, mobile: cfg.mobile,
    });
    for (const v of ['a', 'b']) {
      const file = `${OUT}/q-hub-hierarchy.${v}.html`;
      const url = 'file:///' + file.replace(/\\/g, '/');
      requests.length = 0; pageErrors.length = 0; events.length = 0;
      await send('Page.navigate', { url });   // 只读打开，不写文件
      for (let i = 0; i < 120 && !events.includes('Page.loadEventFired'); i++) await sleep(100);
      await sleep(400);

      log(`\n═══ 候选 ${v.toUpperCase()}：${file}（${cfg.tag}）═══`);

      // ---- 截图：必须在下面的点击测试【之前】拍，否则拍到的是被点过的状态 ----
      if (SHOT) {
        const m = await send('Page.getLayoutMetrics');
        const size = m.cssContentSize || m.contentSize;
        let clip, png, note;
        if (cfg.shot === 'long') {
          clip = { x: 0, y: 0, width: Math.ceil(size.width), height: Math.ceil(size.height), scale: 1 };
          png = OUT + '/q-hub-hierarchy.' + v + '.png';
          note = '整页';
        } else {
          // 430 窄图：只框住「真实 1 组 19 首」那两个实例（① 首态收起 ＋ ② 展开），
          //   横向取**整个 430 视口宽**（图上就是这条窄栏的真实观感，不是裁到实例边框）
          const box = JSON.parse(await js(`(function(){
            var e = document.querySelector('.grid');
            var r = e.getBoundingClientRect();
            return JSON.stringify({y: Math.floor(r.top + scrollY), h: Math.ceil(r.height)});
          })()`));
          clip = { x: 0, y: box.y, width: cfg.W, height: box.h, scale: 1 };
          png = OUT + '/q-hub-hierarchy.' + v + '.430.png';
          note = '窄图（只含真实 1 组 19 首的两个实例）';
        }
        const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip });
        writeFileSync(png, Buffer.from(shot.data, 'base64'));
        log('\n[PNG] ' + png);
        log('      ' + note + ' CSS 尺寸 ' + Math.ceil(clip.width) + 'x' + Math.ceil(clip.height)
          + ' @DPR ' + cfg.DPR + ' → 像素 ' + Math.ceil(clip.width * cfg.DPR) + 'x' + Math.ceil(clip.height * cfg.DPR)
          + ' → 文件 ' + statSync(png).size + ' 字节');
      } else {
        log('\n[PNG] 已跳过（--no-shot）');
      }

      // ---- [1] 首态：首次（无既有状态）全部收起 + 诗目不可见 ----
      log('\n[1] 首态（首态实例 b1=真实单组 / b3=夹具多组）');
      for (const inst of ['b1', 'b3']) {
        const s = JSON.parse(await stateOf(inst));
        check(`${inst} 所有组头 aria-expanded=false`,
          s.heads.every((h) => h.expanded === 'false'),
          s.heads.map((h) => h.group + ':' + h.expanded).join(' '));
        check(`${inst} 组内诗目全部不可见`,
          s.heads.every((h) => h.listVisible === false && h.visibleRows === 0),
          s.heads.map((h) => `${h.group} listVisible=${h.listVisible} 可见行=${h.visibleRows}/${h.rows}`).join(' | '));
        check(`${inst} 收起时记号＝${v === 'a' ? '▸' : '[+]'}`,
          s.heads.every((h) => h.mark === (v === 'a' ? '\u25b8' : '[+]')),
          s.heads.map((h) => h.group + ':' + h.mark).join(' '));
      }

      // ---- [2] 组头是 <button type=button> + aria-expanded + aria-controls ----
      const tags = JSON.parse(await js(`JSON.stringify(Array.from(document.querySelectorAll('[data-inst] .ghead')).map(function(h){
          return h.tagName + '/' + (h.type||'') + '/' + (h.getAttribute('aria-controls')?'有list':'无list') +
                 '/' + (h.hasAttribute('aria-expanded')?'有expanded':'无expanded'); }))`));
      check('全部组头节点是 <button type=button> 且带 aria-controls 与 aria-expanded',
        tags.length > 0 && tags.every((t) => t.startsWith('BUTTON/button/有list/有expanded')),
        `${tags.length} 个：${tags.slice(0, 3).join(', ')} …`);

      // ---- [3] 真实鼠标点「组头左侧（组名那一带）」→ 只有该组变化 ----
      log('\n[2] 真实鼠标点击（CDP Input.dispatchMouseEvent，不是 JS .click()）');
      const before = await allHeads();
      const g1 = JSON.parse(await headGeometry('b1', 0));
      log(`      b1 组头 rect=${g1.w.toFixed(0)}x${g1.h.toFixed(0)} 点(${g1.pos[0].x.toFixed(0)},${g1.y.toFixed(0)}) 命中 .${g1.pos[0].at}`);
      await clickAt(g1.pos[0].x, g1.y);
      await sleep(150);
      const s1 = JSON.parse(await stateOf('b1'));
      check('点 b1 组头左侧（组名处，非记号）⇒ 该组展开',
        s1.heads[0].expanded === 'true' && s1.heads[0].listVisible === true && s1.heads[0].visibleRows === 19,
        `expanded=${s1.heads[0].expanded} 可见诗目=${s1.heads[0].visibleRows}/19 记号=${s1.heads[0].mark}`);
      check('只有 b1 那组变化，页面上其它组头一个都没动',
        (await allHeads()) === before.replace('han@b1=false', 'han@b1=true'),
        `${before}\n           → ${await allHeads()}`);

      // ---- 多组：可同时展开两组（不是手风琴）----
      log('\n[3] 多组：可同时展开两组（不是手风琴）');
      const g2 = JSON.parse(await headGeometry('b3', 1));
      await clickAt(g2.pos[0].x, g2.y);
      await sleep(150);
      let s3 = JSON.parse(await stateOf('b3'));
      check('点 b3 第 2 个组头 ⇒ 只有它展开（第 1、3 组仍收起）',
        s3.heads.map((h) => h.expanded).join(',') === 'false,true,false',
        s3.heads.map((h) => h.group + ':' + h.expanded).join(' '));
      const g3 = JSON.parse(await headGeometry('b3', 2));
      await clickAt(g3.pos[0].x, g3.y);
      await sleep(150);
      s3 = JSON.parse(await stateOf('b3'));
      check('再点 b3 第 3 个组头 ⇒ 两组同时展开的组数=2',
        s3.heads.filter((h) => h.expanded === 'true').length === 2 &&
        s3.heads.map((h) => h.expanded).join(',') === 'false,true,true',
        s3.heads.map((h) => `${h.group}:${h.expanded}(可见${h.visibleRows}/${h.rows}行)`).join(' '));
      check(`展开时记号＝${v === 'a' ? '▾' : '[−]'}`,
        s3.heads[1].mark === (v === 'a' ? '\u25be' : '[\u2212]') && s3.heads[2].mark === (v === 'a' ? '\u25be' : '[\u2212]'),
        s3.heads.map((h) => h.group + ':' + h.mark).join(' '));

      // ---- 再点一次 ⇒ 该组收起，另一组不受影响 ----
      const g2b = JSON.parse(await headGeometry('b3', 1));   // 重新量坐标（布局已变）
      await clickAt(g2b.pos[0].x, g2b.y);
      await sleep(150);
      s3 = JSON.parse(await stateOf('b3'));
      check('再点 b3 第 2 个组头 ⇒ 只有它收起，第 3 组仍展开',
        s3.heads.map((h) => h.expanded).join(',') === 'false,false,true' && s3.heads[1].listVisible === false,
        s3.heads.map((h) => h.group + ':' + h.expanded).join(' '));

      // ---- 点最右记号那一带也能开关（记号在按钮内，且只表达状态）----
      const g1b = JSON.parse(await headGeometry('b1', 0));
      await clickAt(g1b.pos[3].x, g1b.y);
      await sleep(150);
      const s1b = JSON.parse(await stateOf('b1'));
      check('点 b1 组头最右（记号处）⇒ 收起（记号同样在按钮内，只表达状态）',
        s1b.heads[0].expanded === 'false' && s1b.heads[0].listVisible === false,
        `命中 .${g1b.pos[3].at} → expanded=${s1b.heads[0].expanded} 记号=${s1b.heads[0].mark}`);

      // ---- 「关于」入口：恰好 1 个、位置符合该候选、不夹带未采纳入口 ----
      const about = JSON.parse(await js(`(function(){
        var hubs = document.querySelectorAll('[data-test="hub"]');
        return JSON.stringify(Array.from(hubs).map(function(hub){
          var a = hub.querySelector('[data-test="about"]');
          var r = a.getBoundingClientRect(), hr = hub.getBoundingClientRect();
          return { inst: hub.dataset.inst, about: hub.querySelectorAll('[data-test="about"]').length,
                   text: a.textContent, 相对位置: (r.top - hr.top) < hr.height/2 ? '上部' : '下部',
                   关于以外的非诗目链接: Array.from(hub.querySelectorAll('a')).filter(function(x){ return x!==a && !x.classList.contains('plink'); }).map(function(x){return x.className+':'+x.textContent;}) };
        })); })()`));
      check(`关于入口：每个实例恰好 1 个，位置＝${v === 'a' ? '上部' : '下部'}`,
        about.length === 5 && about.every((h) => h.about === 1 && h.text === '关于' && h.相对位置 === (v === 'a' ? '上部' : '下部')),
        about.map((h) => `${h.inst}:${h.about}个/${h.相对位置}`).join(' '));
      check('实例里没有别的入口链接（不含应用名/搜索/状态位/版本号等未采纳项）',
        about.every((h) => h.关于以外的非诗目链接.length === 0),
        '断言口径＝「关于」与诗目链接以外的 <a> 个数为 0 —— ' +
        about.map((h) => h.inst + ':' + JSON.stringify(h.关于以外的非诗目链接)).join(' '));

      // ---- [4][5] 自包含 + 无 JS 报错 ----
      const ext = requests.filter((u) => !u.startsWith('file:///'));
      check('CDP 记录的网络请求里没有任何 http(s) 外部引用',
        ext.length === 0,
        `${requests.length} 个请求，非 file:// 的=${ext.length} ${JSON.stringify(requests)}`);
      check('页面无 JS 报错', pageErrors.length === 0, pageErrors.length ? pageErrors.join(' | ') : '0 条');

      // =============== 430 移动口径的窄栏专项 ===============
      if (cfg.shot !== 'narrow') continue;

      // ---- [6] 无横向溢出 ----
      log('\n[6] 430：无横向溢出');
      const ov = JSON.parse(await js(`(function(){
        var all = document.querySelectorAll('body *'), maxRight = -1e9, minLeft = 1e9, mr = null, ml = null;
        for (var i = 0; i < all.length; i++) {
          var r = all[i].getBoundingClientRect();
          if (r.width === 0 && r.height === 0) continue;
          if (r.right > maxRight) { maxRight = r.right; mr = all[i]; }
          if (r.left < minLeft) { minLeft = r.left; ml = all[i]; }
        }
        var name = function(e){ if (!e) return null;
          return e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\\s+/).join('.') : ''); };
        return JSON.stringify({ innerWidth: window.innerWidth, docScrollWidth: document.documentElement.scrollWidth,
          bodyScrollWidth: document.body.scrollWidth, maxRight: Math.round(maxRight*10)/10, maxEl: name(mr),
          minLeft: Math.round(minLeft*10)/10, minEl: name(ml) });
      })()`));
      check(`innerWidth === ${cfg.W}`, ov.innerWidth === cfg.W, 'innerWidth=' + ov.innerWidth);
      check(`documentElement.scrollWidth === ${cfg.W}（无横向滚动）`,
        ov.docScrollWidth === cfg.W, 'scrollWidth=' + ov.docScrollWidth + ' bodyScrollWidth=' + ov.bodyScrollWidth);
      check(`所有可见元素右沿 ≤ ${cfg.W}（最右元素=${ov.maxEl}）`,
        ov.maxRight <= cfg.W + 0.5 && ov.minLeft >= -0.5,
        `maxRight=${ov.maxRight} minLeft=${ov.minLeft}`);

      // ---- [7] 整组头四个位置逐个点 ----
      //   注：此时 b3 可能已有别的组开着（上一节留下的状态），所以「只影响该组」按**点前/点后对比**判，
      //   不假定其它组一定是收起的。
      log('\n[7] 430：整组头四个位置逐个点（每次都必须只影响该组）');
      const othersOf = () => js(`JSON.stringify(Array.from(document.querySelectorAll('[data-inst="b3"] .ghead')).filter(function(h,i){return i!==1}).map(function(h){return h.dataset.group+'='+h.getAttribute('aria-expanded')}))`);
      log('      （进本节时 b3 的另两组状态：' + (await othersOf()) + '）');
      for (let pi = 0; pi < 4; pi++) {
        const othersBefore = await othersOf();
        const g = JSON.parse(await headGeometry('b3', 1));
        const p = g.pos[pi];
        const wasOpen = JSON.parse(await stateOf('b3')).heads[1].expanded === 'true';
        await clickAt(p.x, g.y);
        await sleep(150);
        const now = JSON.parse(await stateOf('b3'));
        const othersAfter = await othersOf();
        check(`430 点「${p.name}」(x=${p.x.toFixed(0)}, 命中 .${p.at}) ⇒ 该组状态翻转且只有它变化`,
          now.heads[1].expanded === (wasOpen ? 'false' : 'true') && othersAfter === othersBefore,
          `expanded: ${wasOpen} → ${now.heads[1].expanded}（记号 ${now.heads[1].mark}），另两组 ${othersBefore} → ${othersAfter}`);
      }

      // ---- [8] 题名/作者换行：超长夹具题名 + 普通行 ----
      log('\n[8] 430：题名/作者换行（含超长夹具题名）');
      const wr = JSON.parse(await js(`(function(){
        var g1 = document.querySelectorAll('[data-inst="b5"] .glist')[0];
        var rows = g1.querySelectorAll('.poemrow');
        var info = function(li){
          var t = li.querySelector('.ptitle'), a = li.querySelector('.pauthor');
          var rt = t.getBoundingClientRect(), ra = a.getBoundingClientRect(), rl = li.getBoundingClientRect();
          return { 题名: t.textContent, 题名框: Math.round(rt.width)+'x'+Math.round(rt.height),
                   作者: a.textContent, 题名右沿: Math.round(rt.right), 作者左沿: Math.round(ra.left),
                   作者右沿: Math.round(ra.right), 行右沿: Math.round(rl.right), 行宽: Math.round(rl.width),
                   重叠: ra.left < rt.right - 0.5, 溢出: Math.round(ra.right - rl.right) };
        };
        var longRow = rows[rows.length-1], normalRow = rows[0];
        return JSON.stringify({ long: info(longRow), normal: info(normalRow),
          行内横向滚动: longRow.scrollWidth > longRow.clientWidth });
      })()`));
      check('超长夹具题名在 430 下确实折行（题名框高 > 单行）',
        parseInt(wr.long.题名框.split('x')[1], 10) > 30,
        `题名框=${wr.long.题名框}（单行约 26px） 题名=「${wr.long.题名}」`);
      check('超长行：作者没有被挤出、也没有与题名重叠',
        wr.long.重叠 === false && wr.long.溢出 <= 0 && wr.行内横向滚动 === false,
        `作者左沿=${wr.long.作者左沿} 题名右沿=${wr.long.题名右沿} 作者右沿=${wr.long.作者右沿} 行右沿=${wr.long.行右沿} 行内横向滚动=${wr.行内横向滚动}`);
      check('普通行：作者不与题名重叠、不溢出',
        wr.normal.重叠 === false && wr.normal.溢出 <= 0,
        `${wr.normal.题名}｜作者左沿=${wr.normal.作者左沿} 题名右沿=${wr.normal.题名右沿} 作者右沿=${wr.normal.作者右沿} 行右沿=${wr.normal.行右沿}`);
    }
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
