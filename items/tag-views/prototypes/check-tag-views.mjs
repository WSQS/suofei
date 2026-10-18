/*
 * check-tag-views.mjs —— 「多浏览视图（朝代 ／ 选本）」可操作原型的【行为自检 ＋ 关键截图】脚本（可复跑）。
 *
 * 它验的是**这一个原型页面**（items/tag-views/prototypes/q-tag-views.html），**不是产品代码**：
 *   · 只读打开页面（file:// URL，脚本不写、不改它）；
 *   · 额外只读的文件只有一个：content/poems/古诗十九首/行行重行行.md（用来逐行核对诗页正文）。
 *
 * 为什么要有它：交付里会写「进入诗 → 返回后回到选本视图且滚动位置保留」「本库已收录 N 首」这类话，
 * 这些话必须能被别人重新跑一遍验出来，而不是靠一张图。
 *
 * 用法（在仓库根目录）：
 *   node items/tag-views/prototypes/check-tag-views.mjs
 *   node items/tag-views/prototypes/check-tag-views.mjs --no-shot        # 只跑断言，不写 PNG
 *
 * 依赖：本机无头 Chromium。顺序：环境变量 CHROME_BIN → 否则推 %LOCALAPPDATA%\Chromium\Application\chrome.exe。
 *   找不到就**如实报错并 exit 2**（不会假装通过）。
 *   例：CHROME_BIN='C:/Users/wsqsy/AppData/Local/Chromium/Application/chrome.exe' node items/tag-views/prototypes/check-tag-views.mjs
 *
 * 每张图都是**一个真实视口**（真实 CSS px，@DPR 2），没有把不同宽度拼成缩放对照图。
 */
import { spawn, spawnSync } from 'node:child_process';
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
  function freshUrl(mode, nonce) {
    return fileUrl + '?shot=' + nonce + '#/' + mode;
  }
  async function open(mode, nonce) {
    const loaded = client.waitFor('Page.loadEventFired', S);
    await client.send('Page.navigate', { url: freshUrl(mode, nonce) }, S);
    await loaded;
    await sleep(120);
  }
  async function js(expression) {
    const r = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, S);
    if (r.exceptionDetails) throw new Error('页面 JS 报错：' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  }
  async function shot(name) {
    if (NO_SHOT) return;
    await sleep(200);
    /* 用「整页渲染 + 裁出视口那一块」（captureBeyondViewport + clip）：
     * 直接捕视口会带上无头 Chromium 的陈旧图块（实测过一块没意义的浅色矩形），整页渲染没有。
     * clip 用**页面坐标**（y = scrollY），所以图的尺寸就是当前视口能看到的那一块。 */
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
    console.log('  ▣ 图 → items/tag-views/prototypes/' + name);
  }
  async function clickSel(sel) {
    const ok = await js(`(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e)return false;e.click();return true;})()`);
    await sleep(90);
    return ok;
  }
  async function txt(sel) {
    return js(`(function(){var e=document.querySelector(${JSON.stringify(sel)});return e?e.textContent:null;})()`);
  }
  async function routeOf() { return js('document.querySelector(\'[data-test="pg"]\').getAttribute("data-route")'); }

  /* ── 阈值：宽度口径（已定）── */
  const widthOf = (V) => Math.min(V, Math.max(320, 0.88 * (V - 24)));

  /* ══ 0 · 静态自检（自包含 / 夹具标注 / 不加哪些东西）══ */
  section('0 · 静态：自包含、夹具标注、明确不加的东西');
  const html = readFileSync(PAGE, 'utf8');
  check('页面自包含：没有 <link、没有 src=、没有 @import、没有 http(s):// 引用',
    !/<link\b/i.test(html) && !/\bsrc\s*=/.test(html) && !/@import/.test(html) && !/https?:\/\//.test(html),
    '文件 ' + readFileSync(PAGE).length + ' 字节');
  check('页面里明确标着「夹具」（原型条），不是产品实施', /夹具/.test(html));
  check('页面里印着宽度口径的四个参数（deduct 24 / pct 88 / floor 320 / 上界 viewport）',
    /deduct_total : 24/.test(html) && /pct\s*: 88/.test(html) && /floor\s*: 320/.test(html) && /cap\s*: viewport/.test(html));
  check('页面里写清「诗 ↔ 选本的归属是夹具、正文取自真实内容」', /夹具/.test(html) && /只读抄自 content\/poems/.test(html));

  /* ══ 1 · 候选 A：默认朝代视图仍可用 ＋ 入口 ══ */
  section('1 · 候选 A（顶部 tab）：默认朝代视图没被挤掉');
  await setViewport(430, 932);
  await open('A', 'a1');
  check('内容宽 C = min(V, max(320, 0.88×(V−24))) 实测＝公式值（V=430 → 357.28）',
    Math.abs((await js('document.querySelector(\'[data-test="col"]\').getBoundingClientRect().width')) - widthOf(430)) < 0.02,
    '实测 ' + (await js('document.querySelector(\'[data-test="col"]\').getBoundingClientRect().width.toFixed(2)')) + ' / 公式 ' + widthOf(430).toFixed(2));
  const gut = await js('(function(){var r=document.querySelector(\'[data-test="col"]\').getBoundingClientRect();return {l:r.left,r:window.innerWidth-r.right};})()');
  check('内容列居中，列外余白 = (V−C)/2（两侧相等）', Math.abs(gut.l - gut.r) < 0.5, '左 ' + gut.l.toFixed(2) + '／右 ' + gut.r.toFixed(2));
  const groups0 = await js('Array.prototype.map.call(document.querySelectorAll(\'[data-test="ghead"]\'),function(e){return e.textContent;})');
  check('朝代分组仍是 3 组，计数 19 / 2 / 1 首',
    groups0.length === 3 && /19 首/.test(groups0[0]) && /2 首/.test(groups0[1]) && /1 首/.test(groups0[2]),
    JSON.stringify(groups0));
  check('首态全部收起（没有诗目 ul）', (await js('document.querySelectorAll(".glist").length')) === 0);
  check('候选 A 的入口是顶部两个 tab（朝代／选本）',
    (await js('Array.prototype.map.call(document.querySelectorAll(".tab"),function(e){return e.textContent;}).join("|")')) === '朝代|选本');
  /* 切换过去**还要能切回来**（要求 3） */
  await clickSel('.tab[data-tab="tags"]');
  const inTags = /^\/A\/hub\/tags$/.test(await routeOf());
  await clickSel('.tab[data-tab="dynasty"]');
  check('切到「选本」再切回「朝代」都成立（route /A/hub ↔ /A/hub/tags）',
    inTags && (await routeOf()) === '/A/hub');
  check('顶部只有「关于」这一个额外入口，没有搜索框/编辑器/页脚',
    (await js('document.querySelectorAll(\'[data-test="about"]\').length')) === 1
    && !(await js('/搜索|编辑|版本|v0\\./.test(document.querySelector(\'[data-test="pg"]\').textContent)')));
  await js('document.querySelector(\'[data-ghead="汉"]\').click()');
  await sleep(80);
  check('组头可展开：汉 组展开后 19 行诗目', (await js('document.querySelectorAll(".glist .poemrow").length')) === 19,
    '第 1 行＝' + (await txt('.glist .poemrow .plink')));
  await shot('01-a-hub-dynasty.430.png');

  /* ══ 2 · 选本列表：本库已收录 N 首 ══ */
  section('2 · 选本列表（候选 A 的「选本」tab）：计数口径');
  await open('A', 'a2');
  await clickSel('.tab[data-tab="tags"]');
  check('切到「选本」tab 后是选本列表，4 个选本', (await js('document.querySelectorAll(".tlist .titem").length')) === 4);
  const rows = await js('Array.prototype.map.call(document.querySelectorAll(".titem .tlink"),function(e){return e.textContent;})');
  /* 方括号 [ ] 是 CSS 伪元素画的（§4.1 记号②），textContent 里看不到 ⇒ 单独断言伪元素内容 */
  const bracket = await js('getComputedStyle(document.querySelector(".tcount b"),"::before").content');
  check('每个选本都写「本库已收录 N 首」（N=19/1/2/0）',
    rows.length === 4 && /本库已收录 19 首/.test(rows[0]) && /本库已收录 1 首/.test(rows[1])
    && /本库已收录 2 首/.test(rows[2]) && /本库已收录 0 首/.test(rows[3]), JSON.stringify(rows));
  check('计数两侧的方括号是 CSS 记号（与目录页 [N] 首 同一套）', bracket === '"["', '::before=' + bracket);
  check('全页不出现「共 N 首／已全收／全部收录」这类错误口径',
    !/共\s*\[?\d+\]?\s*首|已全收|全部收录|已收录全部/.test(await js('document.querySelector(\'[data-test="pg"]\').textContent')));
  await shot('02-a-taglist.430.png');

  /* ══ 3 · 选本页：诗 ＋ 选本内次序 ══ */
  section('3 · 选本页（古诗十九首）：19 首 ＋ 选本内次序');
  await clickSel('.titem .tlink[data-tag="gushi-shijiu-shou"]');
  check('进入选本页（route 是 /A/t/…，不是目录）', (await routeOf()) === '/A/t/gushi-shijiu-shou');
  const meta19 = await txt('[data-test="tagmeta"]');
  check('选本页写明「本库已收录 19 首 · 按选本次序」', /本库已收录 19 首/.test(meta19) && /按选本次序/.test(meta19), meta19);
  const ords = await js('Array.prototype.map.call(document.querySelectorAll(".pord"),function(e){return e.textContent;})');
  check('诗目带选本内次序 001…019（19 行，序号连续）',
    ords.length === 19 && ords[0] === '001' && ords[18] === '019' && ords[11] === '012', ords.slice(0, 3).join(',') + ' … ' + ords[18]);
  check('选本页与目录页共用同一条左沿（诗题左沿＝内容列 + 27.52）',
    Math.abs((await js('document.querySelector(".prow .ptitle").getBoundingClientRect().left - document.querySelector(\'[data-test="col"]\').getBoundingClientRect().left')) - 27.52) < 0.6);
  await shot('03-a-tag-19.430.png');

  /* ══ 4 · 未收全（只有 1 首）与 0 首 ══ */
  section('4 · 未收全（只有 1 首）／空选本（0 首）');
  await open('A', 'a4');
  await clickSel('.tab[data-tab="tags"]');
  await clickSel('.titem .tlink[data-tag="tangshi-sanbai-shou"]');
  check('唐诗三百首：本库只有 1 首 ⇒ 1 行、元信息 1 首、仍标「按选本次序」',
    (await js('document.querySelectorAll(".plist .pitem").length')) === 1
    && /本库已收录 1 首/.test(await txt('[data-test="tagmeta"]')));
  check('这一行的选本次序＝夹具 172（与底本次序 orderInSource=1 明显不同，用来区分两个字段）',
    (await txt('.pord')) === '172');
  await shot('04-a-tag-1.430.png');
  await open('A', 'a5');
  await clickSel('.tab[data-tab="tags"]');
  await clickSel('.titem .tlink[data-tag="yutai-xinyong"]');
  check('玉台新咏：本库 0 首 ⇒ 没有诗目行，元信息 0 首，出现空状态文案',
    (await js('document.querySelectorAll(".plist .pitem").length')) === 0
    && /本库已收录 0 首/.test(await txt('[data-test="tagmeta"]'))
    && /本库尚未收录这个选本的诗/.test(await txt('[data-test="empty"]')));
  check('空状态里没有把它说成「该选本共 0 首」', !/共\s*0\s*首/.test(await js('document.body.textContent')));
  await shot('05-a-tag-0.430.png');

  /* ══ 5 · 进入诗 → 返回原视图 ＋ 滚动位置 ══ */
  section('5 · 进入诗 → 返回：回到选本视图（不是目录）＋ 滚动位置保留');
  await open('A', 'a6');
  await clickSel('.tab[data-tab="tags"]');
  await clickSel('.titem .tlink[data-tag="gushi-shijiu-shou"]');
  await js('window.scrollTo(0, 520)');
  await sleep(80);
  const yBefore = await js('window.scrollY');
  await clickSel('.plist .pitem:nth-child(12) .prow');
  check('从选本页点第 12 行进入诗页（route 是 /A/p/…）', /^\/A\/p\//.test(await routeOf()));
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
  check('诗页继承已选形态：顶部 返回（左）／详情（右）＋ 居中的题名与身份行',
    (await txt('[data-test="back"]')) === '返回'
    && /详情/.test(await js('Array.prototype.map.call(document.querySelectorAll(".topbar .ctl"),function(e){return e.textContent;}).join("|")'))
    && (await js('getComputedStyle(document.querySelector(".poem-head")).textAlign')) === 'center');
  check('诗页没有笔记入口（本库这些诗没有笔记 ⇒ 整块不出现）', !/笔记/.test(await js('document.querySelector(".col").textContent')));
  await shot('06-a-poem.430.png');
  await clickSel('[data-test="back"]');
  check('返回后回到**选本视图**（不是默认目录）', (await routeOf()) === '/A/t/gushi-shijiu-shou', await routeOf());
  const yAfter = await js('window.scrollY');
  check('返回后滚动位置保留（回到离开时的 y，容差 2px）', Math.abs(yAfter - yBefore) <= 2, '离开 ' + yBefore + ' → 回来 ' + yAfter);
  /* 图里也要看得见：原型条上的 scroll 读数（不属于应用页面） */
  check('原型条上的 scroll 读数与实测 y 一致（图里可直接看出位置保留）',
    Math.abs(Number(await txt('[data-test="sy"]')) - yAfter) <= 0.6, '条上 ' + (await txt('[data-test="sy"]')));
  await shot('07-a-back-restored.430.png');

  /* 浏览器后退（不是页面里的「返回」）也回到选本视图 */
  await clickSel('.plist .pitem:nth-child(3) .prow');
  await js('history.back()');
  await sleep(220);
  check('浏览器后退也回到选本视图（同一层级）', (await routeOf()) === '/A/t/gushi-shijiu-shou', await routeOf());

  /* ══ 6 · 候选 B：顶部下拉 ══ */
  section('6 · 候选 B（顶部下拉）：入口与切换');
  await open('B', 'b1');
  check('候选 B 的入口是一个「浏览」选择器', (await txt('[data-test="picker"]')).indexOf('浏览：朝代') === 0);
  await clickSel('[data-test="picker"]');
  const menu = await js('Array.prototype.map.call(document.querySelectorAll(".menu .mitem"),function(e){return e.textContent;})');
  check('下拉里同时给出「朝代」与 4 个选本，选本各自带「N 首」',
    menu.length === 5 && /朝代/.test(menu[0]) && /古诗十九首.*19 首/.test(menu[1]) && /玉台新咏.*0 首/.test(menu[4]), JSON.stringify(menu));
  await shot('08-b-menu.430.png');
  await clickSel('.menu .mitem[data-go="/B/t/gushi-shijiu-shou"]');
  check('从下拉直接进选本页', (await routeOf()) === '/B/t/gushi-shijiu-shou');
  await shot('09-b-tag.430.png');
  await clickSel('[data-test="back"]');
  check('候选 B 的「返回」只能回到朝代视图（没有「选本列表」这一层可回）', (await routeOf()) === '/B');

  /* ══ 7 · 候选 C：独立页 ══ */
  section('7 · 候选 C（独立页）：入口 → 选本页 → 选本 → 返回两层');
  await open('C', 'c1');
  check('候选 C 在目录顶部给一个「选本 ›」入口', /选本/.test(await txt('[data-test="entrylink"]')));
  await shot('10-c-hub-entry.430.png');
  await clickSel('[data-test="entrylink"]');
  check('独立选本页：route /C/tags，4 个选本', (await routeOf()) === '/C/tags' && (await js('document.querySelectorAll(".titem").length')) === 4);
  await shot('11-c-taglist.430.png');
  await clickSel('.titem .tlink[data-tag="gushi-shijiu-shou"]');
  await clickSel('[data-test="back"]');
  check('从选本页返回 ⇒ 回到独立选本页（多一层）', (await routeOf()) === '/C/tags');
  await clickSel('[data-test="back"]');
  check('再返回 ⇒ 回到目录', (await routeOf()) === '/C');

  /* ══ 8 · 详情页（继承 D0）══ */
  section('8 · 详情页（继承已选 D0 形态）');
  await open('A', 'd1');
  await js('location.hash="#/A/p/古诗十九首-行行重行行"');
  await sleep(150);
  await clickSel('.topbar a.ctl');
  check('从诗页进详情页（route …/detail）', /\/detail$/.test(await routeOf()));
  check('详情页：诗题 ＋ 返回 ＋ 「底本与来源」标签 ＋ 正文前来源块',
    (await js('document.querySelectorAll(".prov-label").length')) === 1
    && (await txt('.prov-label')) === '底本与来源'
    && (await js('document.querySelectorAll(".d-head .d-title").length')) === 1);
  check('详情正文的小标题是 eyebrow（无左侧竖线、与正文同一左沿）',
    (await js('getComputedStyle(document.querySelector(".d-sub")).borderLeftWidth')) === '0px'
    && Math.abs((await js('document.querySelector(".d-sub").getBoundingClientRect().left')) - (await js('document.querySelector(".d-li").getBoundingClientRect().left'))) < 0.6,
    '小标题与列表项左沿差 ' + Math.abs((await js('document.querySelector(".d-sub").getBoundingClientRect().left')) - (await js('document.querySelector(".d-li").getBoundingClientRect().left'))).toFixed(2) + 'px');
  await shot('12-detail.430.png');
  await clickSel('[data-test="back"]');
  check('详情页「返回」回到这首诗（不是目录）', (await routeOf()) === '/A/p/古诗十九首-行行重行行', await routeOf());

  /* ══ 9 · 窄屏（320）不横向溢出 ══ */
  section('9 · 320 窄屏：内容宽贴到视口、不横向溢出');
  await setViewport(320, 640);
  await open('A', 'n1');
  await clickSel('.tab[data-tab="tags"]');
  check('V=320 时 C=320（下限触发，列外余白 0）',
    Math.abs((await js('document.querySelector(\'[data-test="col"]\').getBoundingClientRect().width')) - 320) < 0.02);
  check('V=320 时页面不横向溢出（scrollWidth ≤ 320）', (await js('document.documentElement.scrollWidth')) <= 320,
    'scrollWidth=' + (await js('document.documentElement.scrollWidth')));
  await clickSel('.titem .tlink[data-tag="gushi-shijiu-shou"]');
  check('V=320 选本页同样不横向溢出', (await js('document.documentElement.scrollWidth')) <= 320,
    'scrollWidth=' + (await js('document.documentElement.scrollWidth')));
  await shot('13-a-tag-19.320.png');

  /* ══ 10 · 自包含（运行期没有外部请求）══ */
  section('10 · 运行期：没有外部网络请求');
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
