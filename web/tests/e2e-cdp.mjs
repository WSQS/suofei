#!/usr/bin/env node
/* 端到端验证：无头 Chromium + CDP（零第三方依赖，只用 node 自带的 fetch / WebSocket）。
 *
 *   node web/tests/e2e-cdp.mjs
 *   CHROME_BIN=/path/to/chrome node web/tests/e2e-cdp.mjs
 *
 * 覆盖：
 *   0. 纯逻辑自测（版本比较 / 切换决策 / 结构校验，直接 import app/content.js）
 *   1. 首访在线：内容装载、时代分组、组内排序（含排序键缺失时的 Collator 回退）
 *   2. 跨组搜索：诗名 / 作者子串命中
 *   3. 诗页：分行（逐行文本与 JSON 完全一致）、分节/空行、笔记按需展开、
 *      无笔记的真实空状态、笔记里的 HTML 原样显示（不解析）
 *   4. Service Worker 注册 + 资源缓存；并断言 content.json **没有**进资源缓存；
 *      交叉核对 config.js 与 sw.js 的接口常量
 *   5. 真离线（CDP Network.emulateNetworkConditions offline=true）下重载仍可读
 *   6. 内容更新：完整下载 + 校验通过才切换；阅读中不突然替换（staged）；
 *      回到目录自动原子切换；删除/修改/新增都生效
 *   7. 四种失败：校验和损坏、非法 JSON、formatVersion 不兼容、远端不比本地新 → 全部保留旧版
 *   8. 切换后的新版在离线重载后仍可用
 *   9. 整轮没有未捕获 JS 异常
 *
 * 产物（截图 + DOM 转储）写到 web/tests/artifacts/（已 gitignore）。
 */

import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SUPPORTED_FORMAT_VERSION, compareContentVersion, decideUpdate, validateContent,
} from '../app/content.js';
import { APP_VERSION, CONTENT_DB, RESOURCE_CACHE_PREFIX, resourceCacheName } from '../app/config.js';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const artifactsDir = resolve(webRoot, 'tests', 'artifacts');
const PORT = Number(process.env.TEST_PORT || 8137);
const DEBUG_PORT = Number(process.env.TEST_DEBUG_PORT || 9237);
const CHROME_BIN = process.env.CHROME_BIN
  || 'C:/Users/wsqsy/AppData/Local/Chromium/Application/chrome.exe';
const BASE = `http://127.0.0.1:${PORT}/`;
const NODE = process.execPath;

// ------------------------------------------------------------------ 断言工具

const results = [];
let currentSection = '';

function section(title) {
  currentSection = title;
  console.log(`\n=== ${title} ===`);
}

function check(name, ok, detail = '') {
  results.push({ name: `${currentSection} · ${name}`, ok: Boolean(ok), detail: String(detail) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `\n        ${detail}` : ''}`);
}

const dump = (v) => JSON.stringify(v);
const eq = (name, actual, expected) => check(name, dump(actual) === dump(expected),
  `actual=${dump(actual)}  expected=${dump(expected)}`);
const includes = (name, haystack, needle) => check(name, String(haystack).includes(needle),
  `“${haystack}” 应包含 “${needle}”`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchOk(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
    } catch { /* 还没起来 */ }
    if (Date.now() > deadline) throw new Error(`等待 ${url} 超时`);
    await sleep(150);
  }
}

// ------------------------------------------------------------------ CDP 薄客户端

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.seq = 0;
    this.pending = new Map();
    this.listeners = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve: res, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.code})`));
        else res(msg.result);
        return;
      }
      for (const fn of this.listeners.get(msg.method) || []) fn(msg.params);
    });
  }

  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true });
      ws.addEventListener('error', () => rej(new Error(`无法连接 CDP：${url}`)), { once: true });
    });
    return new CDP(ws);
  }

  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(fn);
  }

  send(method, params = {}, timeoutMs = 30000) {
    const id = ++this.seq;
    return new Promise((res, rej) => {
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) rej(new Error(`CDP 超时：${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); res(v); },
        reject: (e) => { clearTimeout(timer); rej(e); },
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

let cdp = null;
const pageErrors = [];

async function evaluate(expression) {
  const r = await cdp.send('Runtime.evaluate', {
    expression, awaitPromise: true, returnByValue: true, userGesture: true,
  });
  if (r.exceptionDetails) {
    throw new Error(`页面内异常：${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
  }
  return r.result.value;
}

async function waitFor(expression, { label = expression, timeout = 20000, interval = 120 } = {}) {
  const deadline = Date.now() + timeout;
  let lastErr = null;
  for (;;) {
    try {
      if (await evaluate(expression)) return true;
    } catch (err) { lastErr = err; }
    if (Date.now() > deadline) {
      throw new Error(`等待条件超时（${label}）${lastErr ? ` 最后错误：${lastErr.message}` : ''}`);
    }
    await sleep(interval);
  }
}

const APP_READY = 'Boolean(window.__app && window.__app.ready)';
const waitForIndex = () => waitFor('Boolean(document.querySelector(\'[data-test="view-index"]\'))', { label: '目录视图' });
const waitForPoemView = (id) => waitFor(
  `Boolean(document.querySelector('[data-test="view-poem"][data-poem-id=${JSON.stringify(id)}]'))`,
  { label: `诗页 ${id}` },
);

/** 文档标识：用来确认「确实换了一个新文档」，避免在新旧文档之间读错 DOM。 */
const docToken = () => evaluate('window.__app ? performance.timeOrigin : null').catch(() => null);

async function goto(url) {
  const before = await docToken();
  await cdp.send('Page.navigate', { url });
  await waitFor(`${APP_READY} && performance.timeOrigin !== ${before}`, { label: `新文档就绪 ${url}` });
  await sleep(60);
}

async function reload() {
  const before = await docToken();
  await cdp.send('Page.reload', { ignoreCache: false });
  await waitFor(`${APP_READY} && performance.timeOrigin !== ${before}`, { label: '重载后就绪' });
  await sleep(60);
}

/** 只改 hash（同文档导航），随后等对应视图出现。 */
async function hashTo(hash) {
  await evaluate(`location.hash = ${JSON.stringify(hash)}; true`);
}

const summary = () => evaluate('JSON.parse(JSON.stringify(window.__app.summary()))');

async function setQuery(text) {
  await evaluate(`(() => {
    const el = document.querySelector('[data-test="search-input"]');
    el.value = ${JSON.stringify(text)};
    el.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
}

async function screenshot(name) {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(resolve(artifactsDir, name), Buffer.from(data, 'base64'));
  return name;
}

async function prepareContent(variant) {
  const child = spawn(NODE, [resolve(webRoot, 'scripts', 'prepare-dev-content.mjs'), '--variant', variant], { stdio: 'pipe' });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  const code = await new Promise((r) => child.on('exit', r));
  if (code !== 0) throw new Error(`prepare-dev-content --variant ${variant} 失败：${out}`);
  return out.trim().split('\n');
}

const rowsInGroup = (key) => evaluate(`(() => {
  const g = document.querySelector('[data-test="dynasty-group"][data-dynasty-key=${JSON.stringify(key)}]');
  if (!g) return null;
  return [...g.querySelectorAll('[data-test="poem-row"]')].map(r => ({
    id: r.dataset.poemId,
    title: r.querySelector('.poem-row-title').textContent,
    author: r.querySelector('.poem-row-author').textContent,
    notes: Boolean(r.querySelector('.poem-row-notes')),
  }));
})()`);

const groupKeys = () => evaluate(`[...document.querySelectorAll('[data-test="dynasty-group"]')].map(g => g.dataset.dynastyKey)`);
const searchTitles = () => evaluate(`[...document.querySelectorAll('[data-test="poem-row"] .poem-row-title')].map(e => e.textContent)`);
const idbRows = () => evaluate(`(async () => {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open(${JSON.stringify(CONTENT_DB.name)});
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const rows = await new Promise((res, rej) => {
    const r = db.transaction(${JSON.stringify(CONTENT_DB.store)}, 'readonly')
      .objectStore(${JSON.stringify(CONTENT_DB.store)}).getAll();
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  db.close();  // 不关连接会阻塞后面的 deleteDatabase（测「清站点数据」时被阻塞过）
  return rows.map(r => [r.k, r.doc.contentVersion, r.meta.integrity]);
})()`);

// ------------------------------------------------------------------ 0. 纯逻辑自测

function unitTests() {
  section('0 纯逻辑自测（node 直接 import app/content.js）');
  check('版本比较：2026.10.14.2 > 2026.10.14.1', compareContentVersion('2026.10.14.2', '2026.10.14.1') > 0);
  check('版本比较逐段数值：2026.10.14.10 > 2026.10.14.9（纯字典序会判反）',
    compareContentVersion('2026.10.14.10', '2026.10.14.9') > 0);
  check('版本比较相等', compareContentVersion('2026.10.14.1', '2026.10.14.1') === 0);
  check('版本比较更旧', compareContentVersion('2026.10.14.0', '2026.10.14.2') < 0);

  eq('本地无内容 → first', decideUpdate(null, { formatVersion: 1, contentVersion: 'x' }).action, 'first');
  eq('更高内容版本 → accept', decideUpdate({ contentVersion: '2026.10.14.1' }, { formatVersion: 1, contentVersion: '2026.10.14.2' }).action, 'accept');
  eq('同版本 → up-to-date', decideUpdate({ contentVersion: '2026.10.14.2' }, { formatVersion: 1, contentVersion: '2026.10.14.2' }).action, 'up-to-date');
  eq('远端更旧 → up-to-date（不降级）', decideUpdate({ contentVersion: '2026.10.14.2' }, { formatVersion: 1, contentVersion: '2026.10.14.0' }).action, 'up-to-date');
  eq('formatVersion 更高 → refuse-format（不解析）',
    decideUpdate({ contentVersion: '2026.10.14.2' }, { formatVersion: SUPPORTED_FORMAT_VERSION + 1, contentVersion: '2026.10.15.1' }).action,
    'refuse-format');

  const badKey = validateContent({ formatVersion: 1, contentVersion: 'x', dynasties: [{ key: 'han', label: '汉', order: 100 }], poems: [{ id: 'a', title: 't', author: '佚名', dynastyKey: 'tang', dynastyLabel: '唐', dynastyOrder: 400, stanzas: [['一']] }] });
  check('结构校验：dynastyKey 未声明 → 失败', badKey.ok === false, badKey.errors.join(' / '));
  const emptyStanza = validateContent({ formatVersion: 1, contentVersion: 'x', dynasties: [], poems: [{ id: 'a', title: 't', author: '佚名', dynastyKey: 'han', dynastyLabel: '汉', dynastyOrder: 100, stanzas: [[]] }] });
  check('结构校验：stanzas 全空 → 失败', emptyStanza.ok === false, emptyStanza.errors.join(' / '));
}

// ------------------------------------------------------------------ 浏览器主流程

let server = null;
let chrome = null;
let userDataDir = null;

async function startServer() {
  server = spawn(NODE, [resolve(webRoot, 'scripts', 'serve.mjs'), '--port', String(PORT)], { stdio: ['ignore', 'pipe', 'pipe'] });
  await fetchOk(BASE);
}

/** 真的把本地服务关掉。光靠 CDP 的 offline 模拟并不够：Service Worker 自己的 fetch
 *  属于另一个 target，不会被页面的 offline 条件挡住，所以必须让服务器进程消失，
 *  才能证明那一次 200 真的来自本地缓存。 */
async function stopServer() {
  if (!server) return;
  server.kill();
  server = null;
  for (let i = 0; i < 50; i += 1) {
    try { await fetch(BASE); } catch { return; }
    await sleep(100);
  }
}

async function isServerDown() {
  try { await fetch(BASE); return false; } catch { return true; }
}

async function main() {
  await mkdir(artifactsDir, { recursive: true });
  unitTests();

  const prep = await prepareContent('placeholder');
  console.log(`\n内容准备：${prep.join(' | ')}`);

  await startServer();
  console.log(`静态服务已启动：${BASE}（node web/scripts/serve.mjs --port ${PORT}）`);

  userDataDir = await mkdtemp(join(tmpdir(), 'poetry-e2e-'));
  chrome = spawn(CHROME_BIN, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-component-update', '--disable-sync',
    '--remote-allow-origins=*', '--window-size=900,1100',
    `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${userDataDir}`,
    'about:blank',
  ], { stdio: 'ignore' });

  await fetchOk(`http://127.0.0.1:${DEBUG_PORT}/json/version`, 30000);
  const targets = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('没有找到可用的 page target');
  cdp = await CDP.connect(page.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');
  await cdp.send('Log.enable');
  cdp.on('Runtime.exceptionThrown', (p) => pageErrors.push(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text));
  cdp.on('Log.entryAdded', (p) => { if (p.entry.level === 'error' && p.entry.source === 'javascript') pageErrors.push(p.entry.text); });
  console.log(`无头 Chromium 已连接：${CHROME_BIN}`);

  const domDump = [];
  const pushDump = async (label, selector = '[data-test="view"]') => {
    const text = await evaluate(`document.querySelector(${JSON.stringify(selector)}).innerText`);
    domDump.push(`----- ${label} -----\n${text}`);
    return text;
  };

  // ---------------------------------------------------------------- 1. 首访
  section('1 首访（在线）：内容装载 / 时代分组 / 组内排序');
  await goto(BASE);
  await waitForIndex();
  let s = await summary();
  eq('站点标题（用户拍板的展示名）', await evaluate('document.title'), '索斐');
  eq('页面标题文字', await evaluate('document.querySelector("[data-test=\\"site-title\\"]").textContent'), '索斐');
  eq('首访从网络取得的内容版本', s.contentVersion, '2026.10.14.1');
  eq('首访记录为「已取得内容」', s.lastCheck.result, '已取得内容');
  includes('完整性标注了校验和边车', s.integrity, 'sha256-sidecar');
  eq('诗数量', s.poems, 8);
  check('占位夹具提示可见（不把夹具当真实内容）',
    await evaluate('Boolean(document.querySelector("[data-test=\\"placeholder-notice\\"]"))'));

  eq('时代分组顺序与 label', await evaluate(`[...document.querySelectorAll('[data-test="dynasty-group"]')]
    .map(g => [g.dataset.dynastyKey, g.querySelector('[data-test="dynasty-label"]').textContent])`),
  [['qianqin', '先秦'], ['han', '汉'], ['weijin', '魏晋'], ['tang', '唐']]);

  eq('汉组：按诗名拼音排序（涉江采芙蓉缺 titleSortKey，走 Collator 回退）',
    (await rowsInGroup('han')).map((r) => r.title), ['青青河畔草', '涉江采芙蓉', '行行重行行']);
  eq('唐组：先按作者（李白在张继前），再按诗名',
    (await rowsInGroup('tang')).map((r) => `${r.author}/${r.title}`),
    ['李白/静夜思', '李白/望庐山瀑布', '张继/枫桥夜泊']);
  eq('先秦组', (await rowsInGroup('qianqin')).map((r) => r.title), ['关雎']);
  eq('有笔记的诗在目录里有标记', (await rowsInGroup('tang')).filter((r) => r.notes).map((r) => r.title), ['枫桥夜泊']);

  const jsonOrder = await evaluate(`(async () => {
    const doc = JSON.parse(await (await fetch('content.json?t=' + Date.now(), { cache: 'no-store' })).text());
    return doc.poems.map(p => p.id);
  })()`);
  const domOrder = await evaluate(`[...document.querySelectorAll('[data-test="poem-row"]')].map(r => r.dataset.poemId)`);
  check('DOM 顺序 ≠ JSON 文件顺序（证明真的按排序键排，而不是照抄文件顺序）',
    dump(jsonOrder) !== dump(domOrder), `JSON=${dump(jsonOrder)}\n        DOM =${dump(domOrder)}`);
  await pushDump('首访目录');
  await screenshot('01-index-online.png');

  // ---------------------------------------------------------------- 2. 搜索
  section('2 跨组搜索（诗名 / 作者子串）');
  await setQuery('行');
  eq('搜索「行」命中', await searchTitles(), ['行行重行行']);
  await setQuery('李白');
  eq('搜索作者「李白」：命中 2 首并标出时代', await evaluate(`[...document.querySelectorAll('[data-test="poem-row"]')].map(r => [r.querySelector('.poem-row-dynasty').textContent, r.querySelector('.poem-row-title').textContent])`),
    [['唐', '静夜思'], ['唐', '望庐山瀑布']]);
  await setQuery('佚名');
  const crossGroup = await evaluate(`[...document.querySelectorAll('[data-test="poem-row"]')].map(r => r.querySelector('.poem-row-dynasty').textContent)`);
  eq('搜索作者「佚名」跨 2 个时代分组', [...new Set(crossGroup)], ['先秦', '汉']);
  eq('「佚名」命中数', crossGroup.length, 4);
  await pushDump('搜索结果（佚名）', '[data-test="view-search"]');
  await screenshot('02-search.png');
  await setQuery('青');
  eq('搜索诗名片段「青」', await searchTitles(), ['青青河畔草']);
  await setQuery('没有这首诗');
  check('无命中时给真实空状态', await evaluate('Boolean(document.querySelector("[data-test=\\"search-empty\\"]"))'));
  await setQuery('');

  // ---------------------------------------------------------------- 3. 诗页
  section('3 诗页：分行 / 分节（空行）/ 笔记');
  await hashTo('#/p/gushi-shijiu-shou-01');
  await waitForPoemView('gushi-shijiu-shou-01');
  const poemJson = await evaluate(`(async () => {
    const doc = JSON.parse(await (await fetch('content.json?t=' + Date.now(), { cache: 'no-store' })).text());
    return doc.poems.find(p => p.id === 'gushi-shijiu-shou-01');
  })()`);
  const lines = await evaluate(`[...document.querySelectorAll('[data-test="poem-line"]')].map(e => e.textContent)`);
  eq('逐行文本与 JSON 完全一致（分行没被 HTML 折叠/合并）', lines, poemJson.stanzas.flat());
  eq('分节数量与 JSON 一致', await evaluate(`document.querySelectorAll('[data-test="stanza"]').length`), poemJson.stanzas.length);
  eq('每节的行数', await evaluate(`[...document.querySelectorAll('[data-test="stanza"]')].map(s => s.querySelectorAll('[data-test="poem-line"]').length)`), poemJson.stanzas.map((x) => x.length));
  eq('按节拼回的文本与 JSON 一致（节间是两个换行）',
    await evaluate(`[...document.querySelectorAll('[data-test="stanza"]')].map(s => [...s.querySelectorAll('[data-test="poem-line"]')].map(l => l.textContent).join("\\n")).join("\\n\\n")`),
    poemJson.stanzas.map((x) => x.join('\n')).join('\n\n'));
  eq('行元素 white-space=pre-wrap（防止行内空白被折叠）', await evaluate('getComputedStyle(document.querySelector("[data-test=\\"poem-line\\"]")).whiteSpace'), 'pre-wrap');
  check('第二节与第一节之间有间距（空行由 stanzas 分段表达）',
    await evaluate('parseFloat(getComputedStyle(document.querySelectorAll("[data-test=\\"stanza\\"]")[1]).marginTop) > 0'));
  check('notes: null → 如实空状态，不伪造笔记', await evaluate('Boolean(document.querySelector("[data-test=\\"notes-empty\\"]"))'));
  const poemText = await pushDump('诗页 行行重行行');
  console.log(`\n---- 诗页 innerText（原样输出，供人工核对分行/空行）----\n${poemText}\n-----------------------------------------------`);
  await screenshot('03-poem.png');

  await hashTo('#/p/gushi-shijiu-shou-06');
  await waitForPoemView('gushi-shijiu-shou-06');
  check('notes 为空字符串也按「无笔记」处理（与 null 一致）',
    await evaluate('Boolean(document.querySelector("[data-test=\\"notes-empty\\"]")) && !document.querySelector("[data-test=\\"notes-details\\"]")'));

  await hashTo('#/p/tang-zhangji-fengqiaoyebo');
  await waitForPoemView('tang-zhangji-fengqiaoyebo');
  eq('笔记默认折叠', await evaluate('document.querySelector("[data-test=\\"notes-details\\"]").open'), false);
  check('展开前笔记正文为空（按需展开）',
    (await evaluate('document.querySelector("[data-test=\\"notes-body\\"]").innerText')).trim() === '');
  await evaluate('document.querySelector("[data-test=\\"notes-summary\\"]").click()');
  await waitFor('document.querySelector("[data-test=\\"notes-details\\"]").open === true', { label: '笔记展开' });
  const notes = await evaluate(`({
    listItems: [...document.querySelectorAll('[data-test="notes-list"] li')].map(li => li.textContent),
    bold: [...document.querySelectorAll('[data-test="notes-body"] strong')].map(e => e.textContent),
    rawHtmlShown: document.querySelector('[data-test="notes-body"]').innerText.includes('<b>不应被当作标签</b>'),
    parsedTags: document.querySelectorAll('[data-test="notes-body"] b').length,
  })`);
  eq('笔记列表项数', notes.listItems.length, 2);
  eq('最小 Markdown 子集：**粗体** → strong', notes.bold, ['粗体']);
  check('笔记里的 HTML 原样显示（不解析、不注入）', notes.rawHtmlShown && notes.parsedTags === 0,
    `rawHtmlShown=${notes.rawHtmlShown} parsedTags=${notes.parsedTags}`);
  await pushDump('诗页 枫桥夜泊（笔记已展开）');
  await screenshot('04-notes-open.png');

  // ---------------------------------------------------------------- 4. SW / 存储分离
  section('4 Service Worker 与存储分离（资源缓存 vs 内容存储）');
  const swInfo = await evaluate(`(async () => {
    const reg = await navigator.serviceWorker.ready;
    return {
      scope: reg.scope,
      hasController: Boolean(navigator.serviceWorker.controller),
      cacheKeys: await caches.keys(),
      cacheEntries: (await (await caches.open(${JSON.stringify(resourceCacheName())})).keys()).map(r => new URL(r.url).pathname),
    };
  })()`);
  check('Service Worker 已注册并控制页面', swInfo.hasController, `scope=${swInfo.scope}`);
  eq('资源缓存只有一个，名字 = 前缀 + 应用资源版本', swInfo.cacheKeys, [resourceCacheName()]);
  check('资源缓存里有应用外壳',
    swInfo.cacheEntries.some((p) => p.endsWith('/index.html'))
    && swInfo.cacheEntries.some((p) => p.endsWith('/app/main.js'))
    && swInfo.cacheEntries.some((p) => p.endsWith('/styles.css')),
    dump(swInfo.cacheEntries));
  check('content.json 不在资源缓存里（内容与资源两套缓存分开）',
    !swInfo.cacheEntries.some((p) => p.includes('content.json')), dump(swInfo.cacheEntries));

  const rows = await idbRows();
  eq('内容副本存在 IndexedDB，只有 active', rows.map((r) => r[0]), ['active']);
  eq('IndexedDB 里的版本', rows.map((r) => r[1]), ['2026.10.14.1']);

  section('4b config.js 与 sw.js 的接口常量一致（经典 worker 不能 import 模块）');
  const swSource = await readFile(resolve(webRoot, 'sw.js'), 'utf8');
  eq('sw.js APP_VERSION ←→ app/config.js', /const APP_VERSION = '([^']+)'/.exec(swSource)?.[1], APP_VERSION);
  eq('sw.js CACHE_PREFIX ←→ app/config.js', /const CACHE_PREFIX = '([^']+)'/.exec(swSource)?.[1], RESOURCE_CACHE_PREFIX);

  // ---------------------------------------------------------------- 5. 离线
  section('5 真离线（CDP 断网 + 关掉本地服务）下重载仍可读');
  await hashTo('#/');
  await waitForIndex();
  await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await stopServer();
  check('本地 HTTP 服务确实已经关掉（否则「离线」可能只是页面的错觉）', await isServerDown());
  await reload();
  await waitForIndex();
  s = await summary();
  check('浏览器报告离线', s.online === false);
  includes('状态面板如实显示离线', await evaluate('document.querySelector("[data-test=\\"status-network\\"]").textContent'), '离线');
  includes('更新检查失败时如实说明并保留本地版本', s.lastCheck.result, '失败（保留本地版本）');
  eq('离线仍能读到内容版本', s.contentVersion, '2026.10.14.1');
  eq('离线目录仍是 4 个时代分组', (await groupKeys()).length, 4);
  const offlineProbe = await evaluate(`(async () => {
    const shell = await fetch('index.html', { cache: 'reload' }).then(r => r.status).catch(e => 'rejected:' + e.name);
    const missing = await fetch('definitely-missing-xyz.txt', { cache: 'reload' }).then(r => r.status).catch(e => 'rejected:' + e.name);
    return { shell, missing, controller: Boolean(navigator.serviceWorker.controller) };
  })()`);
  eq('服务关掉后应用外壳仍由 Service Worker 缓存应答（200）', offlineProbe.shell, 200);
  check('同一次请求里去取一个未缓存的文件确实拿不到（服务不可达 ⇒ 上面的 200 只能来自本地缓存）',
    offlineProbe.missing !== 200 && offlineProbe.missing !== 404, `missing=${offlineProbe.missing}`);
  check('离线页仍受 Service Worker 控制', offlineProbe.controller);
  await pushDump('离线目录（本地服务已关）');
  await screenshot('05-offline.png');
  await setQuery('佚名');
  eq('离线搜索可用（内容来自 IndexedDB，不是网络）', (await evaluate(`document.querySelectorAll('[data-test="poem-row"]').length`)), 4);
  await setQuery('');
  await startServer();
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  console.log('（已恢复联网 + 重新起服务）');

  // ---------------------------------------------------------------- 6. 阅读中不突然替换
  section('6 内容更新：完整下载 + 校验通过才切换；阅读中不替换');
  await hashTo('#/p/gushi-shijiu-shou-01');
  await waitForPoemView('gushi-shijiu-shou-01');
  const beforeText = await evaluate('document.querySelector("[data-test=\\"poem-body\\"]").innerText');
  console.log(`准备新版内容：${(await prepareContent('update')).join(' | ')}`);
  const beforeCount = (await summary()).checkCount;
  await evaluate('document.querySelector("[data-test=\\"check-update\\"]").click(); true');
  await waitFor(`window.__app.summary().checkCount > ${beforeCount}`, { label: '手动检查完成（真实按钮点击）' });
  s = await summary();
  eq('检查结果：已下载、因阅读中而暂不切换', s.lastCheck.result, '已下载，待切换（阅读中）');
  eq('当前生效版本没变（阅读中不突然替换）', s.contentVersion, '2026.10.14.1');
  eq('新版落到 staged', s.stagedVersion, '2026.10.14.2');
  eq('屏幕上正在读的诗文本没被替换', await evaluate('document.querySelector("[data-test=\\"poem-body\\"]").innerText'), beforeText);
  check('界面提示「已暂存、回到目录后生效」', await evaluate('Boolean(document.querySelector("[data-test=\\"update-staged\\"]"))'));
  eq('IndexedDB 里 active/staged 同时存在（旧版还在，新版已就绪）',
    (await idbRows()).map((r) => [r[0], r[1]]), [['active', '2026.10.14.1'], ['staged', '2026.10.14.2']]);
  await screenshot('06-staged-while-reading.png');

  section('6b staged 跨刷新保持，深链进诗页仍算「阅读中」');
  await reload();
  await waitForPoemView('gushi-shijiu-shou-01');
  s = await summary();
  eq('刷新后仍是旧版在生效', s.contentVersion, '2026.10.14.1');
  eq('刷新后 staged 仍在', s.stagedVersion, '2026.10.14.2');
  check('刷新后仍提示待切换', await evaluate('Boolean(document.querySelector("[data-test=\\"update-staged\\"]"))'));

  section('6c 回到目录 → 自动原子切换；删除/修改/新增都生效');
  await evaluate('document.querySelector("[data-test=\\"back-to-index\\"]").click()');
  await waitForIndex();
  await waitFor('!window.__app.summary().stagedVersion', { label: '回到目录后自动切换' });
  s = await summary();
  eq('生效版本更新到新版', s.contentVersion, '2026.10.14.2');
  eq('staged 已清空', s.stagedVersion, null);
  check('待切换提示消失', !(await evaluate('Boolean(document.querySelector("[data-test=\\"update-staged\\"]"))')));
  eq('切换后 IndexedDB 只剩 active（新版本）',
    (await idbRows()).map((r) => [r[0], r[1]]), [['active', '2026.10.14.2']]);
  eq('被删掉的整组（先秦）消失', await groupKeys(), ['han', 'weijin', 'tang']);
  eq('魏晋组：新加的诗进来了，且按作者排（曹操 在 陶渊明 前）',
    (await rowsInGroup('weijin')).map((r) => r.title), ['观沧海', '饮酒·其五']);
  eq('被删掉的诗在目录里没有', await evaluate(`[...document.querySelectorAll('[data-test="poem-row"]')].some(r => r.dataset.poemId === 'tang-zhangji-fengqiaoyebo')`), false);
  await evaluate('document.querySelector("[data-test=\\"poem-row\\"][data-poem-id=\\"gushi-shijiu-shou-06\\"]").click()');
  await waitForPoemView('gushi-shijiu-shou-06');
  eq('被动过的那一行文本已是新版', await evaluate('document.querySelector("[data-test=\\"poem-line\\"]").textContent'), '涉江采芙蓉，兰泽多芳草。（占位夹具·新版改了这一行）');
  await hashTo('#/');
  await waitForIndex();
  await setQuery('枫桥');
  check('被删掉的诗搜不到了', await evaluate('Boolean(document.querySelector("[data-test=\\"search-empty\\"]"))'));
  await setQuery('陶渊明');
  eq('新增的诗可搜到', await searchTitles(), ['饮酒·其五']);
  await setQuery('');
  await pushDump('切换后的目录（v2026.10.14.2）');
  await screenshot('07-after-switch.png');

  // ---------------------------------------------------------------- 7. 失败保留旧版
  section('7 四种失败都保留旧版（校验和 / 非法 JSON / 格式版本 / 远端更旧）');
  const baseline = (await summary()).contentVersion;
  eq('基线版本', baseline, '2026.10.14.2');

  const cases = [
    { variant: 'corrupt', result: '失败（保留本地版本）', detail: '校验和', note: '内容合法但边车哈希不匹配、且版本更高' },
    { variant: 'broken', result: '失败（保留本地版本）', detail: 'JSON', note: '截断的非法 JSON' },
    { variant: 'future', result: '拒绝（格式版本不兼容，保留旧版）', detail: '格式版本 2', note: 'formatVersion=2 → 不解析、不切换' },
    { variant: 'older', result: '已是最新', detail: '不比本地新', note: '远端版本更旧 → 不降级' },
  ];
  for (const c of cases) {
    await prepareContent(c.variant);
    const r = await evaluate('(async () => JSON.parse(JSON.stringify(await window.__app.checkForUpdate({ manual: true }))))()');
    eq(`[${c.variant}] ${c.note} → 结论`, r.result, c.result);
    includes(`[${c.variant}] 失败原因如实`, r.detail, c.detail);
    const after = await summary();
    eq(`[${c.variant}] 生效版本没被改动`, after.contentVersion, baseline);
    eq(`[${c.variant}] 没有留下 staged`, after.stagedVersion, null);
    eq(`[${c.variant}] 目录仍正常渲染`, (await groupKeys()).length, 3);
  }
  await pushDump('四次失败之后（内容未变）');
  await screenshot('08-after-refusals.png');

  // ------------------------------------------------ 8. 离线下持久化 + 清站点数据
  section('8 服务不可达时：切换后的新版仍可读');
  await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await stopServer();
  await reload();
  await waitForIndex();
  s = await summary();
  eq('服务关掉后重载仍是最新版本', s.contentVersion, '2026.10.14.2');
  await setQuery('陶渊明');
  eq('离线可搜到新版新增的诗', await searchTitles(), ['饮酒·其五']);
  await setQuery('');
  includes('状态面板写明「清除站点数据」可能丢失离线副本（不承诺永久存储）',
    await evaluate('document.querySelector("[data-test=\\"honest-storage-note\\"]").textContent'), '清除站点数据');
  await screenshot('09-offline-persisted.png');

  section('8b 模拟「用户清除站点数据」：内容副本没了，就如实说首次需要网络');
  await evaluate('window.__app.closeContentStore()');
  // 浏览器自己的「清除站点数据」会把连接一并强制关掉；在页面里模拟时只能先关掉应用的连接
  // 再删库。若还有别的连接，删除先报 blocked、连接释放后继续，所以带重试并把每次结果如实打出来。
  const deleteResult = await evaluate(`(async () => {
    const attempt = () => new Promise((res) => {
      const r = indexedDB.deleteDatabase(${JSON.stringify(CONTENT_DB.name)});
      r.onsuccess = () => res('ok'); r.onerror = () => res('error'); r.onblocked = () => res('blocked');
    });
    const seen = [];
    for (let i = 0; i < 8; i += 1) {
      const s = await attempt();
      seen.push(s);
      if (s === 'ok') break;
      await new Promise((r) => setTimeout(r, 250));
    }
    return { state: seen[seen.length - 1], seen };
  })()`);
  check('内容副本数据库已被删除（模拟「清除站点数据」）', deleteResult.state === 'ok', `每次尝试：${dump(deleteResult.seen)}`);
  await reload();
  await waitFor('Boolean(document.querySelector(\'[data-test="view-fatal"]\'))', { label: '首次访问不可用时的如实状态' });
  eq('重新打开时本地内容副本确实是空的', (await idbRows()).map((r) => r[0]), []);
  const fatal = await evaluate(`document.querySelector('[data-test="fatal-text"]').textContent`);
  check('如实说明首次访问需要网络（不假装还能读）', fatal.includes('需要网络'), fatal);
  await screenshot('10-cleared-content-offline.png');

  section('8c 服务恢复后重新取得内容（自愈）');
  await prepareContent('update');
  await startServer();
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await reload();
  await waitForIndex();
  s = await summary();
  eq('重新取得内容后的版本', s.contentVersion, '2026.10.14.2');
  eq('内容副本重新落盘', (await idbRows()).map((r) => [r[0], r[1]]), [['active', '2026.10.14.2']]);

  // ---------------------------------------------------------------- 9. 无异常
  section('9 运行时没有 JS 异常');
  check('整轮没有未捕获异常 / JS 级 error 日志', pageErrors.length === 0, pageErrors.join(' | ') || '（无）');

  await writeFile(resolve(artifactsDir, 'dom-dumps.txt'), domDump.join('\n\n'), 'utf8');
  console.log('\n产物：web/tests/artifacts/（截图 + dom-dumps.txt，已 gitignore）');
}

// ------------------------------------------------------------------ 收尾

async function cleanup() {
  try { cdp?.ws?.close(); } catch { /* ignore */ }
  if (chrome) chrome.kill();
  if (server) server.kill();
  await sleep(200);
  if (userDataDir) await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
}

main()
  .catch((err) => { check('测试脚本自身未抛异常', false, err.stack || err.message); })
  .finally(async () => {
    await cleanup();
    const failed = results.filter((r) => !r.ok);
    console.log('\n================ 汇总 ================');
    console.log(`通过 ${results.length - failed.length} / ${results.length}`);
    if (failed.length) {
      console.log('\n失败项：');
      for (const f of failed) console.log(`  ✗ ${f.name}\n      ${f.detail}`);
    }
    process.exitCode = failed.length ? 1 : 0;
  });
