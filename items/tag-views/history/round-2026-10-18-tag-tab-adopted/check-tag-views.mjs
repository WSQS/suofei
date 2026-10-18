/*
 * check-tag-views.mjs —— 「标签 tab」（朝代 ｜ 标签）可操作原型的【行为自检 ＋ 关键截图】脚本（可复跑）。
 *
 * 它验的是**这一个原型页面**（items/tag-views/prototypes/q-tag-views.html），**不是产品代码**：
 *   · 只读打开页面（file:// URL，脚本不写、不改它）；
 *   · 额外只读的文件只有一个：content/poems/<朝代>/<诗题>.md（用来逐行核对诗页正文）。
 *
 * 本轮断言口径（按用户 2026-10-18 的新决定**重写**，不是沿用上一版「8 条点名」）：
 *   标签 tab 与朝代页同构；组头＝悬挂 [−]/[+] ＋ 标签名、整行可点、初态全部收起；
 *   子诗目题名左沿＝标签名首字左沿（缩进 0）、作者紧随、**无序号**；
 *   **标签页不出现任何数量**（无组头计数、无「本库已收录 N 首」、无 001）；
 *   **零成员的标签不渲染**（用户 2026-10-18：「标签下面没有诗就该没有标签」）：
 *     数据里那条零成员标签仍然存在（反例），页面上没有它的组头／展开按钮／空态文字；
 *     有诗的标签照常渲染，对齐规则不变；
 *   进诗 → 返回后仍在标签视图，且**展开状态与滚动位置**都保持；
 *   朝代 ↔ 标签来回切各自保持状态；朝代 tab 的计数（[19] 首）**未被改动**。
 *
 * 用法（在仓库根目录）：
 *   node items/tag-views/prototypes/check-tag-views.mjs
 *   node items/tag-views/prototypes/check-tag-views.mjs --no-shot        # 只跑断言，不写 PNG
 *
 * 依赖：本机无头 Chromium。顺序：环境变量 CHROME_BIN → 否则推 %LOCALAPPDATA%\Chromium\Application\chrome.exe。
 *   找不到就**如实报错并 exit 2**（不会假装通过）。
 *
 * 每张图都是**一个真实视口**（真实 CSS px，@DPR 2），没有把不同宽度拼成缩放对照图。
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import net from 'node:net';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const PAGE = join(HERE, 'q-tag-views.html');
const NO_SHOT = process.argv.includes('--no-shot');

/* ── 找 Chromium：CHROME_BIN 优先，否则 %LOCALAPPDATA%\Chromium\Application\chrome.exe ── */
const CHROME = process.env.CHROME_BIN
  || (process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Chromium', 'Application', 'chrome.exe') : '');
if (!CHROME) {
  console.error('找不到 Chromium：请设 CHROME_BIN（本机通常在 %LOCALAPPDATA%\\Chromium\\Application\\chrome.exe）。');
  process.exit(2);
}
try { readFileSync(CHROME); } catch {
  console.error("CHROME_BIN='" + CHROME + "' 指到的路径不存在 —— 如实失败，不假装通过。");
  process.exit(2);
}

/* ── 结果收集 ── */
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (detail ? '　—　' + detail : ''));
  return !!ok;
}
function section(t) { console.log('\n── ' + t + ' ──'); }

/* ── CDP 客户端（Node 自带 WebSocket）── */
function mkClient(ws) {
  let seq = 0;
  const pend = new Map();
  const listeners = [];
  ws.addEventListener('message', (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.id !== undefined && pend.has(msg.id)) {
      const { resolve: res, reject } = pend.get(msg.id);
      pend.delete(msg.id);
      if (msg.error) reject(new Error(msg.method + ': ' + msg.error.message));
      else res(msg.result);
      return;
    }
    for (const fn of listeners) fn(msg);
  });
  return {
    send(method, params = {}, sessionId) {
      const id = ++seq;
      const p = new Promise((res, reject) => pend.set(id, { resolve: res, reject }));
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      return p;
    },
    on(fn) { listeners.push(fn); },
    waitFor(method, sessionId, timeoutMs = 15000) {
      return new Promise((res, reject) => {
        const t = setTimeout(() => reject(new Error('等 ' + method + ' 超时')), timeoutMs);
        const fn = (msg) => {
          if (msg.method === method && (!sessionId || msg.sessionId === sessionId)) {
            clearTimeout(t);
            listeners.splice(listeners.indexOf(fn), 1);
            res(msg.params);
          }
        };
        listeners.push(fn);
      });
    },
  };
}

async function freePort() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.on('error', rej);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── 主流程 ── */
let chrome, ws, client;
try {
  const port = await freePort();
  const profile = mkdtempSync(join(tmpdir(), 'tv-chrome-'));
  chrome = spawn(CHROME, [
    '--headless=new',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + profile,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--hide-scrollbars',
    '--force-device-scale-factor=2',
    '--allow-file-access-from-files',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  let wsUrl = null;
  for (let i = 0; i < 100 && !wsUrl; i++) {
    await sleep(100);
    try {
      const r = await fetch('http://127.0.0.1:' + port + '/json/version');
      const j = await r.json();
      wsUrl = j.webSocketDebuggerUrl;
    } catch { /* 还没起来 */ }
  }
  if (!wsUrl) throw new Error('Chromium 的 CDP 端口没起来（如实失败）');

  ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', () => rej(new Error('CDP WebSocket 连不上')), { once: true }); });
  client = mkClient(ws);

  const { targetId } = await client.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId: S } = await client.send('Target.attachToTarget', { targetId, flatten: true });

  const netUrls = [];
  client.on((m) => {
    if (m.method === 'Network.requestWillBeSent' && m.sessionId === S) netUrls.push(m.params.request.url);
  });

  await client.send('Page.enable', {}, S);
  await client.send('Runtime.enable', {}, S);
  await client.send('Network.enable', {}, S);

  const fileUrl = pathToFileURL(PAGE).href;

  async function setViewport(w, h) {
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: w, height: h, deviceScaleFactor: 2, mobile: true,
    }, S);
  }
  async function open(route, nonce) {
    const loaded = client.waitFor('Page.loadEventFired', S);
    await client.send('Page.navigate', { url: fileUrl + '?shot=' + nonce + '#' + route }, S);
    await loaded;
    await sleep(140);
  }
  async function js(expression) {
    const r = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, S);
    if (r.exceptionDetails) throw new Error('页面 JS 报错：' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  }
  async function shot(name, opts) {
    opts = opts || {};
    if (NO_SHOT) return;
    await sleep(260);
    /* 默认用「整页渲染 + 裁出视口那一块」（captureBeyondViewport + clip）：
     * 直接捕视口会带上无头 Chromium 的陈旧图块（上一轮实测过一块没意义的浅色矩形）。
     * ⚠ 但 captureBeyondViewport 会在内部重排：页面高度一变，滚动会被夹到一个不同的值，
     *    而**顶部的 sticky 原型条**已按那个值贴住 ⇒ 图里条的位置与 clip 起点对不上（本轮真撞到：
     *    JS 读到 y=520，图里条却画在 688、条上的读数也是 688）。
     *    所以「滚动位置本身就是证据」的图（返回后保持滚动）改用**视口直捕**（不再重排）。 */
    if (opts.viewport) {
      const y0 = await js('window.scrollY');
      const r = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true }, S);
      writeFileSync(join(HERE, name), Buffer.from(r.data, 'base64'));
      console.log('  ▣ 图 → items/tag-views/prototypes/' + name + '（视口直捕，y=' + y0 + '）');
      return;
    }
    const y = await js('window.scrollY');
    const vw = await js('window.innerWidth');
    const vh = await js('window.innerHeight');
    const docH = await js('document.documentElement.scrollHeight');
    const h = Math.max(1, Math.min(vh, docH - y));
    const r = await client.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: 0, y, width: vw, height: h, scale: 1 },
    }, S);
    writeFileSync(join(HERE, name), Buffer.from(r.data, 'base64'));
    console.log('  ▣ 图 → items/tag-views/prototypes/' + name + '（y=' + y + '）');
  }
  async function clickSel(sel) {
    const ok = await js(`(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e)return false;e.click();return true;})()`);
    await sleep(110);
    return ok;
  }
  async function txt(sel) {
    return js(`(function(){var e=document.querySelector(${JSON.stringify(sel)});return e?e.textContent:null;})()`);
  }
  async function routeOf() { return js('document.querySelector(\'[data-test="pg"]\').getAttribute("data-route")'); }
  async function viewOf() { return js('document.querySelector(\'[data-test="pg"]\').getAttribute("data-view")'); }
  async function pgText() { return js('document.querySelector(\'[data-test="pg"]\').textContent'); }
  async function colW() { return js('document.querySelector(\'[data-test="col"]\').getBoundingClientRect().width'); }

  /* ── 阈值：宽度口径（已定）── */
  const widthOf = (V) => Math.min(V, Math.max(320, 0.88 * (V - 24)));

  /* ══ 0 · 静态自检（自包含 / 夹具标注 / 本轮只有一版）══ */
  section('0 · 静态：自包含、夹具标注、只有一版（无 A/B/C）');
  const html = readFileSync(PAGE, 'utf8');
  check('页面自包含：没有 <link、没有 src=、没有 @import、没有 http(s):// 引用',
    !/<link\b/i.test(html) && !/\bsrc\s*=/.test(html) && !/@import/.test(html) && !/https?:\/\//.test(html),
    '文件 ' + Buffer.byteLength(html) + ' 字节');
  check('页面里明确标着「夹具」（原型条），不是产品实施', /夹具/.test(html));
  check('页面里印着宽度口径的四个参数（deduct 24 / pct 88 / floor 320 / 上界 viewport）',
    /deduct_total : 24/.test(html) && /pct\s*: 88/.test(html) && /floor\s*: 320/.test(html) && /cap\s*: viewport/.test(html));
  check('页面里写清「诗 ↔ 标签的归属是夹具、正文取自真实内容、不给真诗打标签」',
    /只读抄自 content\/poems/.test(html) && /不给真诗打标签/.test(html));
  check('本轮只有一版：页面里没有 A/B/C 候选切换（无 data-mode 控件）',
    !/data-mode/.test(html) && !/入口候选/.test(html));
  check('夹具数据里**保留** orderInTag（不显示序号 ≠ 删除数据）', /orderInTag/.test(html));

  /* ══ 1 · 朝代 tab（计数照旧，未被本轮改动）══ */
  section('1 · 朝代 tab：原目录形态与计数都还在');
  await setViewport(430, 932);
  await open('/hub', 'd1');
  check('默认进入朝代视图（route /hub，data-view=dynasty）',
    (await routeOf()) === '/hub' && (await viewOf()) === 'dynasty');
  check('内容宽 C = min(V, max(320, 0.88×(V−24))) 实测＝公式值（V=430 → 357.28）',
    Math.abs((await colW()) - widthOf(430)) < 0.02,
    '实测 ' + (await colW()).toFixed(2) + ' / 公式 ' + widthOf(430).toFixed(2));
  const gut = await js('(function(){var r=document.querySelector(\'[data-test="col"]\').getBoundingClientRect();return {l:r.left,r:window.innerWidth-r.right};})()');
  check('内容列居中，列外余白 = (V−C)/2（两侧相等）', Math.abs(gut.l - gut.r) < 0.5, '左 ' + gut.l.toFixed(2) + '／右 ' + gut.r.toFixed(2));
  const groups0 = await js('Array.prototype.map.call(document.querySelectorAll(\'[data-test="ghead"]\'),function(e){return e.textContent;})');
  check('朝代分组仍是 3 组，计数 19 / 2 / 1 首（**本轮未改动**）',
    groups0.length === 3 && /19 首/.test(groups0[0]) && /2 首/.test(groups0[1]) && /1 首/.test(groups0[2]),
    JSON.stringify(groups0));
  check('朝代首态全部收起（没有展开的诗目）', (await js('document.querySelectorAll(".glist").length')) === 0);
  check('顶部是「朝代 ｜ 标签」两个 tab（文案就是「标签」，不是「选本」）',
    (await js('Array.prototype.map.call(document.querySelectorAll(".tab"),function(e){return e.textContent;}).join("|")')) === '朝代|标签');
  check('顶部只有「关于」这一个额外入口；没有搜索/编辑器/版本/页脚',
    (await js('document.querySelectorAll(\'[data-test="about"]\').length')) === 1
    && !/搜索|编辑|版本|v0\./.test(await pgText()));
  await js('document.querySelector(\'[data-ghead="dyn:汉"]\').click()');
  await sleep(90);
  check('朝代组头可展开：汉 组展开后 19 行诗目（序号在这里也不出现，与已选一致）',
    (await js('document.querySelectorAll(".glist .poemrow").length')) === 19
    && (await js('document.querySelectorAll(".pord").length')) === 0);
  await shot('01-dynasty.430.png');

  /* ══ 2 · 标签 tab：与朝代同构、初态全收起、**任何数量都不出现** ══ */
  section('2 · 标签 tab：一份同构的列表（组头可点、初态收起、无数量）');
  await open('/tags', 't1');
  check('深链 #/tags 直接落在标签视图（data-view=tags）', (await viewOf()) === 'tags', await routeOf());
  const tagHeads = await js('Array.prototype.map.call(document.querySelectorAll(\'[data-test="ghead"]\'),function(e){return e.getAttribute("data-ghead")+":"+e.textContent;})');
  check('标签 tab 是 4 个组头（只渲染有诗的标签），**组头文字里只有记号与标签名**',
    tagHeads.length === 4 && /^tag:gushi-shijiu-shou:\[\+\]古诗十九首$/.test(tagHeads[0]), JSON.stringify(tagHeads));
  check('标签页组头不带任何计数（没有 .gcount 元素）',
    (await js('document.querySelectorAll(\'[data-test="gcount"]\').length')) === 0);
  check('标签页初态全部收起（既没有诗目也没有空态）',
    (await js('document.querySelectorAll(".glist").length')) === 0
    && (await js('document.querySelectorAll(\'[data-test="tempty"]\').length')) === 0);
  const tagPgText0 = await pgText();
  /* ══ 本轮返修的核心（成对断言 1–3）：数据里仍有零成员标签，页面上没有它 ══ */
  /* ① 反例仍然存在：在**运行中的页面**里读夹具（window.__TAGFIX 是原型给自检脚本的出口）*/
  const fix = await js(`(function(){
    var f=window.__TAGFIX;
    if(!f) return {err:'no fixture hook'};
    var empty=f.tags.filter(function(t){return f.members(t.id).length===0;}).map(function(t){return t.id+'/'+t.name;});
    var withP=f.tags.filter(function(t){return f.members(t.id).length>=1;}).map(function(t){return t.name;});
    return {total:f.tags.length, empty:empty, rawEmpty:(f.tagging['yutai-xinyong']||[]).length, withPoems:withP};
  })()`);
  check('① 夹具数据里**确实还有**那条零成员标签（玉台新咏：成员数 0，定义未删）',
    !fix.err && fix.total === 5 && fix.empty.length === 1 && fix.empty[0] === 'yutai-xinyong/玉台新咏' && fix.rawEmpty === 0,
    JSON.stringify(fix));
  /* ② 页面上不出现它的名字（组头不存在），也没有任何「还没有诗」类空态文案 */
  const yutaiInPage = await js(`(function(){
    var t=document.querySelector('[data-test="pg"]').textContent;
    return {name:/玉台新咏/.test(t), head:!!document.querySelector('[data-ghead="tag:yutai-xinyong"]'),
            tempty:document.querySelectorAll('[data-test="tempty"]').length,
            phrase:/还没有诗|该标签下|本标签下|空的标签/.test(t)};
  })()`);
  check('② 页面上既不出现「玉台新咏」的组头，也没有任何空态说明文字',
    yutaiInPage.name === false && yutaiInPage.head === false && yutaiInPage.tempty === 0 && yutaiInPage.phrase === false,
    JSON.stringify(yutaiInPage));
  /* ③ 有诗的 4 个标签照常出现（名字全在，顺序不变）*/
  check('③ 有诗的 4 个标签照常出现，且条目名与夹具一致（顺序不变）',
    fix.withPoems.length === 4 && fix.withPoems.join('|') === '古诗十九首|唐诗三百首|汉魏六朝诗选|咏怀'
    && tagHeads.map((h) => h.split(':')[2].replace(/^\[\+\]/, '')).join('|') === fix.withPoems.join('|'),
    JSON.stringify(fix.withPoems));
  /* 「去掉数量」的准确范围：只去**统计与条目前编次**（组头计数／「本库已收录 N 首」／001 这类编号）；
   * 标签名本身里的数字字样（古诗十九首／唐诗三百首）**照原样显示**，不得为「去数字」改名或截断。 */
  check('标签页没有任何数量（无组头计数、无「本库已收录」、无 001 类编号；不是 ASCII 数字出现就判错）',
    !/[0-9]/.test(tagPgText0) && !/收录|本库已收录/.test(tagPgText0) && !/\[\s*\d+\s*\]/.test(tagPgText0),
    JSON.stringify(tagPgText0.slice(0, 60)));
  check('标签名里的数字字样照原样保留（「古诗十九首」「唐诗三百首」未被改名/截断）',
    /古诗十九首/.test(tagPgText0) && /唐诗三百首/.test(tagPgText0));
  check('标签页不出现「选本」字样（文案一律叫「标签」）', !/选本/.test(tagPgText0));
  await shot('02-tags-collapsed.430.png');
  /* 来回切：朝代 ↔ 标签 都能走通（且各自是独立视图） */
  await clickSel('.tab[data-tab="dynasty"]');
  const backDyn = (await routeOf()) === '/hub';
  await clickSel('.tab[data-tab="tags"]');
  check('顶部 tab 来回切成立（/hub ↔ /tags）', backDyn && (await routeOf()) === '/tags', await routeOf());

  /* ══ 3 · 单个组展开：整行可点、悬挂记号、子诗题左沿对齐、无序号 ══ */
  section('3 · 单个组展开：悬挂记号、整行可点、题名左沿＝标签名首字、作者紧随');
  /* 点在**组名**上（不是记号），验「整行可点」 */
  await js('document.querySelector(\'[data-ghead="tag:gushi-shijiu-shou"] .gname\').click()');
  await sleep(120);
  check('点组名（不是点记号）也能展开：古诗十九首 展开后 19 行',
    (await js('document.querySelectorAll(".glist .poemrow").length')) === 19,
    '第 1 行＝' + (await txt('.glist .poemrow .plink')));
  check('展开后记号变 [−]、aria-expanded=true',
    (await txt('[data-ghead="tag:gushi-shijiu-shou"] [data-test="gmark"]')) === '[−]'
    && (await js('document.querySelector(\'[data-ghead="tag:gushi-shijiu-shou"]\').getAttribute("aria-expanded")')) === 'true');
  const geom = await js(`(function(){
    var head=document.querySelector('[data-ghead="tag:gushi-shijiu-shou"]');
    var mk=head.querySelector('[data-test="gmark"]').getBoundingClientRect();
    var nm=head.querySelector('[data-test="gname"]').getBoundingClientRect();
    var tt=document.querySelector('.glist .poemrow .ptitle').getBoundingClientRect();
    var au=document.querySelector('.glist .poemrow .pauthor').getBoundingClientRect();
    var col=document.querySelector('[data-test="col"]').getBoundingClientRect();
    return {markR:mk.right,markC:(mk.top+mk.bottom)/2,nameL:nm.left,nameC:(nm.top+nm.bottom)/2,
            titleL:tt.left,titleR:tt.right,titleC:(tt.top+tt.bottom)/2,authorL:au.left,authorC:(au.top+au.bottom)/2,colL:col.left};
  })()`);
  check('记号悬挂在标签名左沿之外（记号右沿 < 标签名左沿）',
    geom.markR < geom.nameL, 'mark.right ' + geom.markR.toFixed(2) + ' < name.left ' + geom.nameL.toFixed(2));
  check('记号与标签名**竖直居中**（笔画盒中心差 ≤ 1.5px）',
    Math.abs(geom.markC - geom.nameC) <= 1.5, '差 ' + Math.abs(geom.markC - geom.nameC).toFixed(2) + 'px');
  check('子诗题左沿＝标签名首字左沿（0 缩进，差值 ≤ 0.6px）',
    Math.abs(geom.titleL - geom.nameL) <= 0.6, '题名 ' + geom.titleL.toFixed(2) + '／标签名 ' + geom.nameL.toFixed(2));
  check('同一条左沿＝内容列 + 27.52（与朝代页/目录同一悬挂槽）',
    Math.abs((geom.titleL - geom.colL) - 27.52) <= 0.6, '实测 +' + (geom.titleL - geom.colL).toFixed(2));
  check('作者紧随题名（同一行、紧跟题名右侧，间隙 < 12px）',
    geom.authorL > geom.titleR && geom.authorL - geom.titleR < 12
    && Math.abs(geom.authorC - geom.titleC) < 2,
    '题名右 ' + geom.titleR.toFixed(2) + ' → 作者左 ' + geom.authorL.toFixed(2) + '（差 ' + (geom.authorL - geom.titleR).toFixed(2) + 'px，基线差 ' + Math.abs(geom.authorC - geom.titleC).toFixed(2) + 'px）');
  check('子诗目**不显示任何序号**（没有 .pord、诗目文本里没有 ASCII 数字）',
    (await js('document.querySelectorAll(".pord").length')) === 0
    && !/[0-9]/.test(await js('document.querySelector(".glist").textContent')));
  check('其余组仍收起（只有 1 个展开的诗目列表）',
    (await js('document.querySelectorAll(".glist").length')) === 1);
  await shot('03-tag-one-open.430.png');

  /* ══ 4 · 多个组独立展开 ══ */
  section('4 · 多个组各自独立展开');
  await js('document.querySelector(\'[data-ghead="tag:yonghuai"] .gname\').click()');
  await sleep(120);
  const expandedNow = await js('Array.prototype.map.call(document.querySelectorAll(\'[data-test="ghead"]\'),function(e){return e.getAttribute("data-ghead")+"="+e.getAttribute("aria-expanded");})');
  check('再展开「咏怀」⇒ 两个组同时展开（19 + 3 行），其余两个仍收起',
    (await js('document.querySelectorAll(".glist").length')) === 2
    && (await js('document.querySelectorAll(".glist .poemrow").length')) === 22
    && /tag:tangshi-sanbai-shou=false/.test(expandedNow.join('|'))
    && /tag:hanwei-liuchao=false/.test(expandedNow.join('|')), JSON.stringify(expandedNow));
  /* 图要能看出「多个组同时展开」：滚到第二个展开的组（咏怀）附近（否则 19 行的第一组会把视口占满，
   * 两个展开态的截图会一模一样——第一次跑就撞上了，字节完全相同）。 */
  const yMulti = await js('(function(){var h=document.querySelector(\'[data-ghead="tag:yonghuai"]\');return Math.max(0, h.getBoundingClientRect().top + window.scrollY - 240);})()');
  await js('window.scrollTo(0, ' + yMulti + ')');
  await sleep(120);
  await shot('04-tags-multi-open.430.png');

  /* ══ 5 · 进诗 → 返回：仍在标签视图，且展开状态与滚动位置都保持 ══ */
  section('5 · 进诗 → 返回：回到标签视图（不是朝代），展开状态与滚动位置都保持');
  await js('window.scrollTo(0, 520)');
  await sleep(120);
  const yBefore = await js('window.scrollY');
  check('（前置）多组展开后页面足够长，滚动到 ' + yBefore + 'px 没有被截断', yBefore > 400, 'y=' + yBefore);
  await clickSel('.glist .poemrow:nth-child(12) .plink');
  check('从标签页点第 12 行进入诗页（route /p/…）', /^\/p\//.test(await routeOf()), await routeOf());
  const ply = await js('Array.prototype.map.call(document.querySelectorAll(".poem-body .line"),function(e){return e.textContent;})');
  const ptitle = await txt('.p-title');
  const srcDir = join(ROOT, 'content/poems');
  let srcPath = null;
  for (const d of readdirSync(srcDir)) {
    const cand = join(srcDir, d, ptitle + '.md');
    try { readFileSync(cand); srcPath = cand; break; } catch { /* 下一组 */ }
  }
  const srcLines = srcPath
    ? readFileSync(srcPath, 'utf8').split('---').slice(2).join('---').split('## 详情')[0]
      .split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
    : [];
  check('诗页正文与源文件逐行一致（' + ptitle + '，' + srcLines.length + ' 行）',
    ply.length > 0 && JSON.stringify(ply) === JSON.stringify(srcLines), JSON.stringify(ply.slice(0, 2)));
  check('诗页继承已选形态：返回（左）／详情（右）＋ 居中的题名与身份行',
    (await txt('[data-test="back"]')) === '返回'
    && (await txt('[data-test="detail-entry"]')) === '详情'
    && (await js('getComputedStyle(document.querySelector(".poem-head")).textAlign')) === 'center');
  check('诗页没有笔记入口（本库这些诗没有笔记 ⇒ 整块不出现）', !/笔记/.test(await js('document.querySelector(".col").textContent')));
  await shot('07-poem.430.png');
  await clickSel('[data-test="back"]');
  check('返回后回到**标签视图**（不是朝代目录）', (await routeOf()) === '/tags', await routeOf());
  const afterBack = await js(`(function(){
    var open=Array.prototype.map.call(document.querySelectorAll('[data-test="ghead"]'),function(e){
      return e.getAttribute('data-ghead')+'='+e.getAttribute('aria-expanded');});
    return {y:window.scrollY, open:open, rows:document.querySelectorAll('.glist .poemrow').length,
            lists:document.querySelectorAll('.glist').length,
            mark:document.querySelector('[data-ghead="tag:gushi-shijiu-shou"] [data-test="gmark"]').textContent};
  })()`);
  check('返回后两个组**仍然展开**（19+3 行、记号仍是 [−]）',
    afterBack.lists === 2 && afterBack.rows === 22 && afterBack.mark === '[−]', JSON.stringify(afterBack));
  check('返回后滚动位置保持（回到离开时的 y，容差 2px）',
    Math.abs(afterBack.y - yBefore) <= 2, '离开 ' + yBefore + ' → 回来 ' + afterBack.y);
  check('原型条上的 scroll 读数与实测 y 一致（图里可直接看出位置保持）',
    Math.abs(Number(await txt('[data-test="sy"]')) - afterBack.y) <= 0.6, '条上 ' + (await txt('[data-test="sy"]')));
  await shot('05-tag-return-restored.430.png', { viewport: true });
  /* 浏览器后退（不是页面里的「返回」）也回标签视图，展开状态同样还在 */
  await clickSel('.glist .poemrow:nth-child(3) .plink');
  await js('history.back()');
  await sleep(260);
  check('浏览器后退也回到标签视图，且展开状态仍保持',
    (await routeOf()) === '/tags' && (await js('document.querySelectorAll(".glist").length')) === 2, await routeOf());

  /* ══ 6 · 返回链**两步**：详情 → 诗页 → 标签视图（不许跳层）══ */
  section('6 · 返回链两步：详情「返回」→ 诗页，「返回」→ 原标签视图（不跳层）');
  await open('/tags', 't5b');
  await js('document.querySelector(\'[data-ghead="tag:gushi-shijiu-shou"] .gname\').click()');
  await js('document.querySelector(\'[data-ghead="tag:yonghuai"] .gname\').click()');
  await sleep(140);
  await js('window.scrollTo(0, 520)');
  await sleep(120);
  const yChain = await js('window.scrollY');
  await clickSel('.glist .poemrow:nth-child(12) .plink');
  const poemRouteChain = await routeOf();
  await clickSel('[data-test="detail-entry"]');
  check('标签视图 → 诗 → 详情（route 以 /detail 结尾）', /\/detail$/.test(await routeOf()), await routeOf());
  await clickSel('[data-test="back"]');
  check('详情「返回」只退一层：回到**这首诗的诗页**（不是标签视图）',
    (await routeOf()) === poemRouteChain && !/detail$/.test(await routeOf()), await routeOf());
  await clickSel('[data-test="back"]');
  const chainEnd = await js(`(function(){return {y:window.scrollY,
    route:document.querySelector('[data-test="pg"]').getAttribute('data-route'),
    lists:document.querySelectorAll('.glist').length,
    rows:document.querySelectorAll('.glist .poemrow').length,
    hanOpen:document.querySelector('[data-ghead="tag:gushi-shijiu-shou"]').getAttribute('aria-expanded')};})()`);
  check('诗页「返回」再退一层：回到**原来的标签视图**，原组仍展开（19+3 行）',
    chainEnd.route === '/tags' && chainEnd.lists === 2 && chainEnd.rows === 22 && chainEnd.hanOpen === 'true', JSON.stringify(chainEnd));
  check('两步返回后滚动位置仍保持（±2px）', Math.abs(chainEnd.y - yChain) <= 2, '离开 ' + yChain + ' → 回来 ' + chainEnd.y);
  /* 浏览器后退按同一层级：历史里每页一条，后退一次退一层 */
  await clickSel('.glist .poemrow:nth-child(2) .plink');
  await clickSel('[data-test="detail-entry"]');
  const detailRouteB = await routeOf();
  await js('history.back()');
  await sleep(260);
  const afterB1 = await routeOf();
  await js('history.back()');
  await sleep(260);
  const afterB2 = await js('document.querySelector(\'[data-test="pg"]\').getAttribute("data-route")');
  check('浏览器后退也一次退一层：详情 → 诗页 → 标签视图',
    /\/detail$/.test(detailRouteB) && afterB1 === detailRouteB.replace(/\/detail$/, '') && afterB2 === '/tags',
    [detailRouteB, afterB1, afterB2].join(' → '));

  /* ══ 7 · 零成员的标签：不渲染（组头／展开按钮／空态文字都不出现）══ */
  section('7 · 零成员的标签不渲染：没有组头、没有展开按钮、没有任何空态文字');
  await open('/tags', 't6');
  /* 连点两下“本该在那里”的位置：一个不存在的控件点不动，页面状态也不变 */
  const ghostClick = await js(`(function(){
    var y=document.querySelector('[data-ghead="tag:yutai-xinyong"]');
    if(y) y.click();
    return {existed:!!y, heads:document.querySelectorAll('[data-test="ghead"]').length,
            lists:document.querySelectorAll('.glist').length,
            tempty:document.querySelectorAll('[data-test="tempty"]').length,
            emptyClass:document.querySelectorAll('.gempty').length};
  })()`);
  check('零成员标签的组头压根不存在（点不到、页面不变：4 个组头、0 个诗目列表、0 个空态）',
    ghostClick.existed === false && ghostClick.heads === 4 && ghostClick.lists === 0
    && ghostClick.tempty === 0 && ghostClick.emptyClass === 0, JSON.stringify(ghostClick));
  check('标签页文本里没有「还没有诗」这类空态句，也没有「0 首」',
    !/还没有诗/.test(await pgText()) && !/0\s*首|共\s*0/.test(await pgText()));
  check('零成员标签不渲染后，标签页仍然没有任何数字（无计数、无编号）', !/[0-9]/.test(await pgText()));
  /* 截图：02 已经是“零成员标签不在、其余 4 个组头在”那一屏，不再造新状态图 */

  /* ══ 8 · 两个 tab 各自保持状态（同一会话内）══ */
  section('8 · 朝代 ↔ 标签：各自保持展开状态与滚动位置');
  await open('/hub', 't7');
  await js('document.querySelector(\'[data-ghead="dyn:汉"]\').click()');
  await sleep(120);
  await js('window.scrollTo(0, 200)');
  await sleep(100);
  await clickSel('.tab[data-tab="tags"]');
  const tagStateAfterSwitch = await js('document.querySelectorAll(".glist").length');
  await js('document.querySelector(\'[data-ghead="tag:hanwei-liuchao"]\').click()');
  await sleep(120);
  await clickSel('.tab[data-tab="dynasty"]');
  const dynState = await js(`(function(){return {
    y:window.scrollY,
    open:document.querySelector('[data-ghead="dyn:汉"]').getAttribute('aria-expanded'),
    rows:document.querySelectorAll('.glist .poemrow').length};})()`);
  check('切回朝代后：汉 组仍然展开（19 行）',
    dynState.open === 'true' && dynState.rows === 19, JSON.stringify(dynState));
  check('切回朝代后：朝代自己的滚动位置也回来了（容差 2px）', Math.abs(dynState.y - 200) <= 2, 'y=' + dynState.y);
  await clickSel('.tab[data-tab="tags"]');
  check('再切到标签：标签页刚才展开的组也还在（两个视图互不干扰）',
    tagStateAfterSwitch === 0 && (await js('document.querySelectorAll(".glist").length')) === 1, '切走时标签页展开数 ' + tagStateAfterSwitch);
  /* 从**朝代视图**进的诗：返回也回到朝代视图（不是标签），且展开与滚动保持 */
  await clickSel('.tab[data-tab="dynasty"]');
  await js('window.scrollTo(0, 300)');
  await sleep(130);
  const yDyn = await js('window.scrollY');
  await clickSel('.glist .poemrow:nth-child(5) .plink');
  const dynPoemRoute = await routeOf();
  await clickSel('[data-test="back"]');
  const backDyn2 = await js(`(function(){return {r:document.querySelector('[data-test="pg"]').getAttribute('data-route'),
    y:window.scrollY, open:document.querySelector('[data-ghead="dyn:汉"]').getAttribute('aria-expanded'),
    rows:document.querySelectorAll('.glist .poemrow').length};})()`);
  check('从朝代视图进的诗，返回回到**朝代视图**（不是标签），汉组仍展开、滚动 ±2px',
    /^\/p\//.test(dynPoemRoute) && backDyn2.r === '/hub' && backDyn2.open === 'true'
    && backDyn2.rows === 19 && Math.abs(backDyn2.y - yDyn) <= 2,
    [dynPoemRoute, backDyn2.r, 'y=' + backDyn2.y + '/' + yDyn].join(' | '));

  /* ══ 9 · 详情页（入口始终显示）══ */
  section('9 · 详情：「详情」入口始终显示；无 ## 详情 的诗也有详情页');
  await open('/tags', 't8');
  await js('document.querySelector(\'[data-ghead="tag:gushi-shijiu-shou"] .gname\').click()');
  await sleep(120);
  await clickSel('.glist .poemrow:nth-child(2) .plink');
  const titleNoDetail = await txt('.p-title');
  check('无 `## 详情` 的诗，诗页顶部**仍有「详情」入口**（已选：入口始终显示）',
    /详情/.test(await txt('[data-test="detail-entry"]') || ''), titleNoDetail);
  const nullInFixture = await js('(function(){var j=JSON.parse(document.querySelector("[data-test=poems-json]").textContent);var t=' + JSON.stringify(titleNoDetail) + ';var p=j.filter(function(x){return x.title===t;})[0];return !!p&&p.detail==null;})()');
  check('这首诗在夹具里确实没有 detail（22 首里 7 首之一）', nullInFixture === true, titleNoDetail);
  await clickSel('[data-test="detail-entry"]');
  check('其详情页可打开：有「底本与来源」，且没有详情正文块（.detail 不存在）',
    /\/detail$/.test(await routeOf()) && /底本与来源/.test(await txt('.prov'))
    && !(await js('!!document.querySelector(".detail")')), await routeOf());
  check('详情页：诗题左对齐 ＋ 「底本与来源」标签（继承 D0）',
    (await js('getComputedStyle(document.querySelector(".d-head")).textAlign')) !== 'center'
    && (await js('document.querySelectorAll(".d-head .d-title").length')) === 1
    && (await txt('.prov-label')) === '底本与来源');
  await shot('08-detail.430.png');
  await clickSel('[data-test="back"]');
  check('详情页「返回」回到这首诗（不是标签页）', /^\/p\//.test(await routeOf()) && !/detail$/.test(await routeOf()), await routeOf());
  /* 有 ## 详情 的诗：小标题仍是 eyebrow（无竖线、与正文同左沿）——继承已选的防回退断言 */
  await open('/p/古诗十九首-行行重行行', 't8b');
  await clickSel('[data-test="detail-entry"]');
  check('有 `## 详情` 的诗：详情正文小标题是 eyebrow（border-left 0、与列表项同左沿）',
    (await js('getComputedStyle(document.querySelector(".d-sub")).borderLeftWidth')) === '0px'
    && Math.abs((await js('document.querySelector(".d-sub").getBoundingClientRect().left'))
      - (await js('document.querySelector(".d-li").getBoundingClientRect().left'))) < 0.6);

  /* ══ 10 · 320 窄屏 ══ */
  section('10 · 320 窄屏：C=320、无横向溢出');
  await setViewport(320, 640);
  await open('/tags', 'n1');
  check('V=320 时 C=320（下限触发，列外余白 0）', Math.abs((await colW()) - 320) < 0.02);
  check('V=320 标签页不横向溢出（scrollWidth ≤ 320）', (await js('document.documentElement.scrollWidth')) <= 320,
    'scrollWidth=' + (await js('document.documentElement.scrollWidth')));
  await js('document.querySelector(\'[data-ghead="tag:gushi-shijiu-shou"] .gname\').click()');
  await sleep(120);
  check('V=320 展开后仍不横向溢出，且题名左沿仍对齐标签名',
    (await js('document.documentElement.scrollWidth')) <= 320
    && Math.abs((await js('document.querySelector(".glist .ptitle").getBoundingClientRect().left'))
      - (await js('document.querySelector(\'[data-ghead="tag:gushi-shijiu-shou"] [data-test="gname"]\').getBoundingClientRect().left'))) <= 0.6,
    'scrollWidth=' + (await js('document.documentElement.scrollWidth')));
  await js('window.scrollTo(0,0)');
  await shot('09-tags-320.320.png');

  /* ══ 10 · 自包含（运行期没有外部请求）══ */
  section('11 · 运行期：没有外部网络请求');
  const external = netUrls.filter((u) => !u.startsWith('file:') && !u.startsWith('data:'));
  check('CDP 记录的网络请求里没有任何 http(s) 外部引用', external.length === 0, JSON.stringify(external));

  /* ══ 汇总 ══ */
  const bad = results.filter((r) => !r.ok);
  console.log('\n══════════════════════════════════════');
  console.log('断言 ' + results.length + ' 条，失败 ' + bad.length + ' 条');
  if (bad.length) {
    for (const b of bad) console.log('  ✗ ' + b.name + (b.detail ? '　—　' + b.detail : ''));
    process.exitCode = 1;
  }
} catch (err) {
  console.error('\n【如实失败】' + (err && err.message ? err.message : err));
  process.exitCode = 2;
} finally {
  try { ws && ws.close(); } catch {}
  try { chrome && chrome.kill(); } catch {}
}
