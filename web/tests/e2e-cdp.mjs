#!/usr/bin/env node
/* 端到端验证：无头 Chromium + CDP（零第三方依赖，只用 node 自带的 fetch / WebSocket）。
 *
 *   node web/tests/e2e-cdp.mjs
 *   CHROME_BIN=/path/to/chrome node web/tests/e2e-cdp.mjs
 *
 * 本轮重点（用户 2026-10-14 拍板：Web 的内容更新 = 站点更新，由 Service Worker 负责）：
 *   - 内容与壳进**同一个站点缓存**、按 APP_VERSION 成对切换，**不可能旧壳配新内容**；
 *   - 没有任何独立内容版本通道（不比对 contentVersion、不用 IndexedDB 暂存、不依赖 sha256 边车）；
 *   - 内容仍然**单独取**（不内联进 HTML/JS）：外壳先到就渲染框架并如实显示「正在取内容」；
 *   - **真发两版**验证：新 SW 安装并等待、提示「有新版本」、阅读中不自动刷新、
 *     点刷新后新旧成对切换、旧 cache 被删；
 *   - 失败状态：非法 JSON / 结构不合法 / 格式版本不兼容 / 内容缺失 → 显示原因而不是白屏。
 *
 * 基座内容：`dist/content.json`（真实产物）；不存在则现场调 tools/build-content.mjs 编一份。
 * 产物（截图 + DOM 转储 + 部署目录）写到 web/tests/artifacts/（已 gitignore）。
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SUPPORTED_FORMAT_VERSION, checkCompatibility, validateContent,
} from '../app/content.js';
import { APP_VERSION, CONTENT_URL, resourceCacheName } from '../app/config.js';
import {
  comparePoems, groupPoems, hasProductOrder, isUnknownAuthor, productOrderStatus, searchPoems, UNKNOWN_AUTHORS,
} from '../app/render.js';
import { buildVariants } from '../scripts/lib/variants.mjs';
import { DEPLOY_FILES, makeDeployment } from './lib/deploy.mjs';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const repoRoot = resolve(webRoot, '..');
const artifactsDir = resolve(webRoot, 'tests', 'artifacts');
const deployRoot = resolve(artifactsDir, 'deploy');
const PORT = Number(process.env.TEST_PORT || 8137);
const DEBUG_PORT = Number(process.env.TEST_DEBUG_PORT || 9237);
const CHROME_BIN = process.env.CHROME_BIN
  || 'C:/Users/wsqsy/AppData/Local/Chromium/Application/chrome.exe';
const BASE = `http://127.0.0.1:${PORT}/`;
const NODE = process.execPath;

/** 用户 2026-10-14 拍板：组内次序 `--order source`（《文选》卷二十九原次序）。硬编码以便钉住重排。 */
const SOURCE_ORDER_TITLES = [
  '行行重行行', '青青河畔草', '青青陵上柏', '今日良宴会', '西北有高楼',
  '涉江采芙蓉', '明月皎夜光', '冉冉孤生竹', '庭中有奇树', '迢迢牵牛星',
  '回车驾言迈', '东城高且长', '驱车上东门', '去者日以疏', '生年不满百',
  '凛凛岁云暮', '孟冬寒气至', '客从远方来', '明月何皎皎',
];

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
  `actual=${dump(actual)}\n        expected=${dump(expected)}`);
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

// ------------------------------------------------------------------ oracle（独立于 app 代码）

/** 期望的目录次序：组的次序照产物 dynasties 数组，组内照产物 poems 数组次序。 */
function expectedDomOrder(doc) {
  const out = [];
  for (const d of doc.dynasties) {
    for (const p of doc.poems) if (p.dynastyKey === d.key) out.push(p.id);
  }
  return out;
}

/** 本机拼音兜底会排成什么样（只在「产物一首都没带 orderInSource」时才该被用到）。 */
function fallbackOrder(doc) {
  const byD = new Map();
  for (const p of doc.poems) {
    if (!byD.has(p.dynastyKey)) byD.set(p.dynastyKey, []);
    byD.get(p.dynastyKey).push(p);
  }
  const out = [];
  for (const d of doc.dynasties) out.push(...(byD.get(d.key) ?? []).slice().sort(comparePoems).map((p) => p.id));
  return out;
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

async function waitFor(expression, { label = expression, timeout = 25000, interval = 120 } = {}) {
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
const waitForIndex = () => waitFor(`Boolean(document.querySelector('[data-test="view-index"]'))`, { label: '目录视图' });
const waitForPoemView = (id) => waitFor(
  `Boolean(document.querySelector('[data-test="view-poem"][data-poem-id=${JSON.stringify(id)}]'))`,
  { label: `诗页 ${id}` },
);
const waitForErrorView = () => waitFor(`Boolean(document.querySelector('[data-test="view-error"]'))`, { label: '失败状态' });

/** 文档标识：确认「确实换了一个新文档」，避免在新旧文档之间读错 DOM。 */
const docToken = () => evaluate('window.__app ? performance.timeOrigin : null').catch(() => null);

async function waitForNewDocument(prevToken, label = '新文档就绪') {
  await waitFor(`${APP_READY} && performance.timeOrigin !== ${prevToken}`, { label });
  await sleep(80);
}

async function goto(url) {
  const before = await docToken();
  await cdp.send('Page.navigate', { url });
  await waitForNewDocument(before, `新文档就绪 ${url}`);
}

async function reload() {
  const before = await docToken();
  await cdp.send('Page.reload', { ignoreCache: false });
  await waitForNewDocument(before, '重载后就绪');
}

const hashTo = async (hash) => { await evaluate(`location.hash = ${JSON.stringify(hash)}; true`); };
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

const domPoemIds = () => evaluate(`[...document.querySelectorAll('[data-test="poem-row"]')].map(r => r.dataset.poemId)`);
const groupKeys = () => evaluate(`[...document.querySelectorAll('[data-test="dynasty-group"]')].map(g => g.dataset.dynastyKey)`);
const searchTitles = () => evaluate(`[...document.querySelectorAll('[data-test="poem-row"] .poem-row-title')].map(e => e.textContent)`);
const errorText = () => evaluate(`document.querySelector('[data-test="error-text"]').textContent`);
const cacheKeys = () => evaluate('caches.keys()');
const cacheEntries = (name) => evaluate(`(async () => (await (await caches.open(${JSON.stringify(name)})).keys()).map(r => new URL(r.url).pathname))()`);
const cacheText = (name, path) => evaluate(`(async () => {
  const res = await (await caches.open(${JSON.stringify(name)})).match(${JSON.stringify(path)});
  return res ? await res.text() : null;
})()`);

// ------------------------------------------------------------------ 服务与部署

let server = null;
let chrome = null;
let userDataDir = null;
let currentRoot = null;

async function startServer(rootDir) {
  server = spawn(NODE, [resolve(webRoot, 'scripts', 'serve.mjs'), '--port', String(PORT), '--root', rootDir], { stdio: ['ignore', 'pipe', 'pipe'] });
  currentRoot = rootDir;
  await fetchOk(BASE);
}

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

/** 换一个部署（同一 origin 指向另一个目录）= 同站点发新版。 */
async function redeploy(rootDir) {
  await stopServer();
  await startServer(rootDir);
}

// ------------------------------------------------------------------ 0. 纯逻辑 + 「内容不内联」自证

function unitTests(baseDoc, variants) {
  section('0 纯逻辑自测（node 直接 import app/content.js 与 app/render.js）');

  const real = validateContent(baseDoc);
  check('真实产物通过结构校验', real.ok, real.errors.join(' / ') || 'ok');
  eq('真实产物格式版本兼容', checkCompatibility(baseDoc), { ok: true });
  const bad = validateContent(variants.schemaBroken.doc);
  check('结构不合法的内容被拒（并给出可读条目）', bad.ok === false && bad.errors.length >= 2, bad.errors.join(' / '));
  check('非对象内容被拒', validateContent('nope').ok === false);
  const future = checkCompatibility(variants.futureFormat.doc);
  check('格式版本更高 → 判定为部署不一致', future.ok === false && future.message.includes('部署不一致'), future.message);
  check('格式版本更低 → 也判不兼容', checkCompatibility({ formatVersion: 0 }).ok === false);
  eq('支持的内容格式版本', SUPPORTED_FORMAT_VERSION, 1);

  section('0b 次序策略：产物带了 orderInSource 时一律不重排（回归）');
  eq('真实产物被判定为「产物次序权威」', hasProductOrder(baseDoc), true);
  eq('判定依据是 orderInSource（19 首全是整数）', productOrderStatus(baseDoc),
    { present: baseDoc.poems.length, usable: baseDoc.poems.length, productOrderAuthoritative: true, wrongType: false });
  eq('真实产物 19 首的诗名次序 == 用户拍板的《文选》原次序', baseDoc.poems.map((p) => p.title), SOURCE_ORDER_TITLES);
  eq('目录次序 == 产物数组次序', groupPoems(baseDoc).flatMap((g) => g.poems.map((p) => p.id)), expectedDomOrder(baseDoc));
  eq('本机拼音排序会把第 1 首推到队列末尾', fallbackOrder(baseDoc)[baseDoc.poems.length - 1], baseDoc.poems[0].id);
  check('本机拼音排序与产物次序不同（这条断言才有牙齿）', dump(fallbackOrder(baseDoc)) !== dump(expectedDomOrder(baseDoc)));
  eq('搜索命中保持产物数组相对次序', searchPoems(baseDoc, '佚名').map((p) => p.id), baseDoc.poems.map((p) => p.id));

  section('0c 客户端不读两个拼音名次键（即使产物里还带着）');
  const keysButNoIndex = structuredClone(baseDoc);
  keysButNoIndex.poems.forEach((p) => { p.authorSortKey = 0; p.titleSortKey = 0; delete p.orderInSource; });
  eq('只带拼音键、没有 orderInSource → 不认，退回兜底', productOrderStatus(keysButNoIndex),
    { present: 0, usable: 0, productOrderAuthoritative: false, wrongType: false });
  eq('最小产物形状（只有 orderInSource）→ 仍认产物次序', hasProductOrder(variants.minimal.doc), true);
  eq('最小形状的目录次序 == 其数组次序',
    groupPoems(variants.minimal.doc).flatMap((g) => g.poems.map((p) => p.id)), expectedDomOrder(variants.minimal.doc));

  section('0d 老产物（一首都没带 orderInSource）才退回本机拼音兜底');
  eq('无 orderInSource → 需要兜底', hasProductOrder(variants.noOrderIndex.doc), false);
  eq('兜底次序 == 本机拼音序',
    groupPoems(variants.noOrderIndex.doc).flatMap((g) => g.poems.map((p) => p.id)), fallbackOrder(variants.noOrderIndex.doc));
  check('兜底次序 ≠ 数组次序', dump(groupPoems(variants.noOrderIndex.doc).flatMap((g) => g.poems.map((p) => p.id)))
    !== dump(expectedDomOrder(variants.noOrderIndex.doc)));
  const stringIndex = structuredClone(baseDoc);
  stringIndex.poems.forEach((p) => { p.orderInSource = String(p.orderInSource); });
  eq('orderInSource 非整数 → 不认，退回兜底', productOrderStatus(stringIndex),
    { present: stringIndex.poems.length, usable: 0, productOrderAuthoritative: false, wrongType: true });

  section('0e 佚名/未知作者清单逐字对齐契约 §2.1（三端曾不一致）');
  const contractText = readFileSync(resolve(repoRoot, 'docs', 'design', 'content-contract.md'), 'utf8');
  const contractList = /`佚名`\/`无名氏`\/`未知`\/`未详`\/`不详`\/空/.exec(contractText);
  check('契约 §2.1 里能找到那份清单（否则这条测试自身先失效）', Boolean(contractList), contractList ? contractList[0] : '没找到');
  eq('UNKNOWN_AUTHORS 与契约清单逐字一致', [...UNKNOWN_AUTHORS], ['佚名', '无名氏', '未知', '未详', '不详']);
  check('清单里不含空串（空白由 isUnknownAuthor 处理）',
    !UNKNOWN_AUTHORS.has('') && [...UNKNOWN_AUTHORS].every((a) => a.trim() !== ''));
  check('「阙名」不在清单里（是否并入待用户拍板，不自行加入）', !UNKNOWN_AUTHORS.has('阙名'));
  const anonDoc = {
    dynasties: [{ key: 'song', label: '宋', order: 500 }],
    poems: ['苏轼', '杨万里', '阙名', '佚名', '未详', '未知', '无名氏', ''].map((author, i) => ({
      id: `t-${i}`, title: `戏题${i}`, author, dynastyKey: 'song', dynastyLabel: '宋',
      dynastyOrder: 500, orderInSource: null, stanzas: [['一']], notes: null,
    })),
  };
  const orderedAuthors = groupPoems(anonDoc)[0].poems.map((p) => p.author);
  check('具名作者（含暂未并入的「阙名」）排在前面',
    [...orderedAuthors.slice(0, 3)].sort().join() === ['杨万里', '苏轼', '阙名'].sort().join(), dump(orderedAuthors));
  check('五个「未知作者」（含空白）排在最后',
    orderedAuthors.slice(3).length === 5 && orderedAuthors.slice(3).every((a) => isUnknownAuthor(a)), dump(orderedAuthors));

  section('0f 仓库里两份夹具自身合法（防止夹具自己慢慢烂掉）');
  for (const name of ['content.placeholder.json', 'content.no-sortkeys.json']) {
    const doc = JSON.parse(readFileSync(resolve(webRoot, 'fixtures', name), 'utf8'));
    const v = validateContent(doc);
    check(`fixtures/${name} 通过结构校验`, v.ok, v.errors.join(' / ') || 'ok');
    check(`fixtures/${name} 带上「夹具」标记（不会被当成发布内容）`, doc.placeholder === true, `placeholder=${doc.placeholder}`);
  }
}

/** 「内容必须单独取、不许内联」的自证 + 体积报告。 */
async function inlineChecks(contentText) {
  section('0g 内容必须单独取、不许内联进 HTML/JS（自证 + 体积）');
  const texts = new Map();
  for (const rel of DEPLOY_FILES) texts.set(rel, await readFile(resolve(webRoot, rel), 'utf8'));
  const shellBytes = [...texts.values()].reduce((a, t) => a + Buffer.byteLength(t, 'utf8'), 0);
  const contentBytes = Buffer.byteLength(contentText, 'utf8');

  const firstLine = JSON.parse(contentText).poems[0].stanzas[0][0];
  const firstTitle = JSON.parse(contentText).poems[0].title;
  const offenders = [...texts.entries()]
    .filter(([, t]) => t.includes(firstTitle) || t.includes(firstLine))
    .map(([rel]) => rel);
  eq('部署文件里没有任何诗题/正文（内容没有内联进壳）', offenders, []);
  includes('index.html 里有静态的「正在装载站点…」（JS/内容没到时也不是白屏）',
    texts.get('index.html'), '正在装载站点');
  check('外壳里只有 content.json 这个**地址**，没有它的内容',
    texts.get('sw.js').includes('content.json') && !texts.get('sw.js').includes(firstTitle));
  console.log(`  实测体积：壳 ${(shellBytes / 1024).toFixed(1)} KB（${DEPLOY_FILES.length} 个文件）`
    + ` / 内容 content.json ${(contentBytes / 1024).toFixed(1)} KB`);
}

// ------------------------------------------------------------------ 浏览器主流程

/** 超时/失败时把现场状态打出来，避免只能猜。 */
async function diagnose(label) {
  try {
    const info = await evaluate(`(async () => ({
      url: location.href,
      hasApp: Boolean(window.__app),
      summary: window.__app ? window.__app.summary() : null,
      errorText: document.querySelector('[data-test="error-text"]')?.textContent ?? null,
      loadingText: document.querySelector('[data-test="view-loading"]')?.textContent ?? null,
      caches: await caches.keys(),
      hasController: Boolean(navigator.serviceWorker.controller),
    }))()`);
    console.log(`\n--- 诊断（${label}）---\n${JSON.stringify(info, null, 2)}\n`);
  } catch (err) {
    console.log(`\n--- 诊断也取不到现场（${label}）：${err.message} ---\n`);
  }
}

async function main() {
  await mkdir(artifactsDir, { recursive: true });
  await rm(deployRoot, { recursive: true, force: true });
  await mkdir(deployRoot, { recursive: true });

  // ---- 基座内容：真实产物优先 ----
  const distPath = resolve(repoRoot, 'dist', 'content.json');
  if (!existsSync(distPath)) {
    console.log('dist/content.json 不存在 → 现场编译一份（tools/build-content.mjs）');
    const child = spawn(NODE, [resolve(repoRoot, 'tools', 'build-content.mjs'),
      '--out', distPath, '--content-version', '2026.10.14.1', '--order', 'source'], { stdio: 'inherit' });
    const code = await new Promise((r) => child.on('exit', r));
    if (code !== 0) throw new Error('tools/build-content.mjs 编译失败');
  }
  const baseText = await readFile(distPath, 'utf8');
  const baseDoc = JSON.parse(baseText);
  const total = baseDoc.poems.length;
  console.log(`\n基座内容：dist/content.json（真实产物）`);
  console.log(`  formatVersion=${baseDoc.formatVersion} contentVersion=${baseDoc.contentVersion} poems=${total}`
    + ` dynasties=${baseDoc.dynasties.map((d) => d.key).join(',')}`);
  console.log(`  基座是否还带两个拼音名次键：${baseDoc.poems.some((p) => 'authorSortKey' in p || 'titleSortKey' in p)
    ? '还带着（C 线的移除还没到 master；客户端已不读）' : '已移除'}`);

  const variants = buildVariants(baseDoc);
  for (const [k, v] of Object.entries(variants)) console.log(`  变体 ${k}: ${v.note}`);

  unitTests(baseDoc, variants);
  await inlineChecks(baseText);

  // ---- 部署 v1（真实内容，站点版本 APP_VERSION）----
  const v1 = await makeDeployment({ destDir: join(deployRoot, 'v1'), appVersion: APP_VERSION, contentText: baseText });
  await startServer(v1.destDir);
  console.log(`\n静态服务已启动：${BASE}（root=${v1.destDir}，站点版本 v${v1.appVersion}）`);

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

  // ---------------------------------------------------------------- 1. 首访：外壳先到 + 加载中状态
  section('1 首访：外壳先到并显示「正在取内容」，内容单独取（用 CDP 加 1.2s 延迟放大）');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 1200, downloadThroughput: -1, uploadThroughput: -1 });
  await cdp.send('Page.navigate', { url: BASE });
  // 阶段 A：HTML 一到就有静态占位（JS 还没跑也不白屏）
  await waitFor(`Boolean(document.querySelector('[data-test="site-title"]'))`
    + ` && Boolean(document.querySelector('[data-test="view-loading"]'))`,
  { label: '外壳 + 静态装载占位可见', timeout: 20000 });
  const staticInfo = await evaluate(`({
    title: document.querySelector('[data-test="site-title"]').textContent,
    loading: document.querySelector('[data-test="view-loading"]').textContent,
    hasRows: document.querySelectorAll('[data-test="poem-row"]').length,
  })`);
  includes('延迟下先看到外壳标题（不是白屏）', staticInfo.title, '索斐');
  includes('页面上先有静态的装载提示', staticInfo.loading, '正在装载站点');
  eq('此刻还没有任何诗行（内容确实还没到）', staticInfo.hasRows, 0);
  // 阶段 B：JS 跑起来了、正在等内容 → 如实显示「正在取内容」
  await waitFor(`window.__app && window.__app.summary().loading === true && !window.__app.summary().hasDoc`,
    { label: 'JS 已运行且仍在等内容' });
  const jsLoading = await evaluate(`document.querySelector('[data-test="view-loading"]').textContent`);
  includes('并且如实显示正在取内容（内容确实单独取）', jsLoading, '正在取内容');
  eq('此刻内容仍未到达', (await summary()).hasDoc, false);
  await screenshot('01-loading-shell-first.png');

  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await waitFor(`${APP_READY} && Boolean(document.querySelector('[data-test="view-index"]'))`, { label: '内容到达并渲染目录' });
  let s = await summary();
  eq('站点标题（用户拍板的展示名）', await evaluate('document.title'), '索斐');
  eq('站点资源版本', s.appVersion, APP_VERSION);
  eq('内容版本（仅展示）', s.contentVersion, baseDoc.contentVersion);
  eq('诗数量', s.poems, total);
  eq('内容格式版本', s.formatVersion, baseDoc.formatVersion);
  check('真实产物没有夹具黄条', !(await evaluate(`Boolean(document.querySelector('[data-test="fixture-notice"]'))`)));
  eq('汉组目录的诗名次序 == 用户拍板的《文选》卷二十九原次序（19 首，确定性）',
    await evaluate(`[...document.querySelectorAll('[data-test="poem-row"] .poem-row-title')].map(e => e.textContent)`),
    SOURCE_ORDER_TITLES);
  eq('目录次序 == 产物数组次序（整串）', await domPoemIds(), expectedDomOrder(baseDoc));
  eq('汉组首尾两端', await evaluate(`(() => {
    const t = [...document.querySelectorAll('[data-test="poem-row"] .poem-row-title')].map(e => e.textContent);
    return [t[0], t[t.length - 1], t.length];
  })()`), ['行行重行行', '明月何皎皎', 19]);
  eq('真实产物第 1 首是 行行重行行 且 orderInSource === 1', [baseDoc.poems[0].title, baseDoc.poems[0].orderInSource], ['行行重行行', 1]);
  eq('本机拼音重排会把它推到第 19 位（所以上一条断言有牙齿）', fallbackOrder(baseDoc).indexOf(baseDoc.poems[0].id), total - 1);
  eq('笔记全空：产物 19 首 notes 都是 null', baseDoc.poems.filter((p) => p.notes !== null).length, 0);
  includes('状态面板写明次序由产物决定',
    await evaluate(`document.querySelector('[data-test="status-order-mode"]').textContent`), '照产物数组次序');
  await pushDump('首访目录（真实内容）');
  await screenshot('02-index-real-content.png');

  // ---------------------------------------------------------------- 2. 站点缓存 = 壳 + 内容成对
  section('2 站点缓存：壳与内容在同一个 cache 里成对；独立内容通道已不存在');
  const expectedCache = resourceCacheName(APP_VERSION);
  const entries = await cacheEntries(expectedCache);
  eq('站点缓存名 = 前缀 + 站点版本', (await cacheKeys()).filter((n) => n.startsWith('pc-resources-')), [expectedCache]);
  check('缓存里有外壳', entries.some((p) => p.endsWith('/index.html'))
    && entries.some((p) => p.endsWith('/app/main.js')) && entries.some((p) => p.endsWith('/styles.css')), dump(entries));
  check('缓存里有 content.json（内容与壳同一份清单、同一个 cache）',
    entries.some((p) => p.endsWith(`/${CONTENT_URL}`)), dump(entries));
  includes('状态面板也显示缓存里含 content.json',
    await evaluate(`document.querySelector('[data-test="status-site-cache"]').textContent`), '含 content.json');
  eq('缓存里的 content.json 就是当前渲染的这一版', JSON.parse(await cacheText(expectedCache, `/${CONTENT_URL}`)).contentVersion, baseDoc.contentVersion);

  section('2b 独立内容版本通道已删干净');
  eq('没有 IndexedDB 数据库（原 active/staged 暂存已删除）', await evaluate('(async () => (await indexedDB.databases()).length)()'), 0);
  eq('没有用 localStorage', await evaluate('localStorage.length'), 0);
  const servedSource = (await readFile(resolve(webRoot, 'app/main.js'), 'utf8'))
    + (await readFile(resolve(webRoot, 'app/content.js'), 'utf8'));
  check('代码里没有 contentVersion 比对/暂存机制', !/compareContentVersion|decideUpdate|putStaged|promoteStaged/.test(servedSource));
  check('SW 里没有把内容排除在站点缓存之外的特例', !readFileSync(resolve(webRoot, 'sw.js'), 'utf8').includes('isContentRequest'));

  section('2c cache-first：服务器上换了 content.json（未换站点版本）也带不跑页面');
  const swapped = variants.fixtureContent.text;
  await writeFile(resolve(v1.destDir, CONTENT_URL), swapped, 'utf8');
  const probe = await evaluate(`(async () => {
    const res = await fetch('content.json', { cache: 'no-cache' });
    const doc = JSON.parse(await res.text());
    return { contentVersion: doc.contentVersion, poems: doc.poems.length };
  })()`);
  eq('页面取到的仍是本版本缓存里的内容（不会被服务器上的新内容配上旧壳）',
    probe.contentVersion, baseDoc.contentVersion);
  await writeFile(resolve(v1.destDir, CONTENT_URL), baseText, 'utf8');
  await reload();
  await waitForIndex();

  // ---------------------------------------------------------------- 3. 真离线
  section('3 真离线（CDP 断网 + 关掉本地服务）下重载仍可读');
  await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await stopServer();
  check('本地 HTTP 服务确实已经关掉', await isServerDown());
  await reload();
  await waitForIndex();
  s = await summary();
  check('浏览器报告离线', s.online === false);
  includes('状态面板如实显示离线', await evaluate(`document.querySelector('[data-test="status-network"]').textContent`), '离线');
  eq('离线仍能读到内容版本', s.contentVersion, baseDoc.contentVersion);
  eq('离线目录次序仍是产物次序', await domPoemIds(), expectedDomOrder(baseDoc));
  const offlineProbe = await evaluate(`(async () => {
    const shell = await fetch('index.html').then(r => r.status).catch(e => 'rejected:' + e.name);
    const missing = await fetch('definitely-missing-xyz.txt').then(r => r.status).catch(e => 'rejected:' + e.name);
    return { shell, missing, controller: Boolean(navigator.serviceWorker.controller) };
  })()`);
  eq('服务关掉后外壳由站点缓存应答（200）', offlineProbe.shell, 200);
  check('未缓存资源确实拿不到（服务不可达 ⇒ 上面的 200 只能来自本地缓存）',
    offlineProbe.missing !== 200 && offlineProbe.missing !== 404, `missing=${offlineProbe.missing}`);
  check('离线页仍受 Service Worker 控制', offlineProbe.controller);
  await screenshot('03-offline.png');
  await startServer(v1.destDir);
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  console.log('（已恢复联网 + 重新起服务）');
  await reload();
  await waitForIndex();

  // ---------------------------------------------------------------- 4. 两版本切换
  section('4 真发两版：新 SW 安装并等待 / 不打断阅读 / 点刷新成对切换 / 旧 cache 被删');
  const v2App = '0.2.0';
  const v2 = await makeDeployment({ destDir: join(deployRoot, 'v2'), appVersion: v2App, contentText: variants.fixtureContent.text });
  console.log(`部署 v2：appVersion=${v2App} cache=${v2.cacheName} 内容 ${variants.fixtureContent.doc.poems.length} 首（含测试夹具诗）`);
  await redeploy(v2.destDir);

  // 4a 旧 SW 还在控制：页面仍是旧壳 + 旧内容（即使服务器已经是新版本）
  await reload();
  await waitForIndex();
  s = await summary();
  eq('服务器已换成 v2，但页面仍是旧壳（cache-first：不能旧壳配新内容）', s.appVersion, APP_VERSION);
  eq('页面内容也仍是旧内容（末首仍是 明月何皎皎）', (await evaluate(`[...document.querySelectorAll('[data-test="poem-row"] .poem-row-title')].map(e => e.textContent)`)).at(-1), '明月何皎皎');
  eq('旧站点缓存仍在', (await cacheKeys()).filter((n) => n.startsWith('pc-resources-')), [expectedCache]);

  // 4b 新版本被发现并等待（提示 + 不自动刷新）
  await waitFor(`Boolean(document.querySelector('[data-test="update-available"]'))`, { label: '出现「有新版本」提示' });
  includes('提示写明不会自动刷新',
    await evaluate(`document.querySelector('[data-test="update-available-text"]').textContent`), '不会自动刷新');
  await waitFor(`window.__app.summary().sw.waitingVersion === ${JSON.stringify(v2App)}`,
    { label: '问到 waiting SW 的站点版本' });
  s = await summary();
  eq('新版本在等待（waiting SW 的站点版本已问到）', s.sw.waitingVersion, v2App);
  eq('两个缓存同时存在：旧的在服务、新的已就绪',
    (await cacheKeys()).filter((n) => n.startsWith('pc-resources-')).sort(), [expectedCache, v2.cacheName].sort());
  const newCacheContent = JSON.parse(await cacheText(v2.cacheName, `/${CONTENT_URL}`));
  eq('新缓存里的内容是新版本（新缓存内部也是成对的）', newCacheContent.contentVersion, variants.fixtureContent.doc.contentVersion);
  eq('新缓存里有新壳', (await cacheEntries(v2.cacheName)).some((p) => p.endsWith('/app/main.js')), true);
  eq('生效的仍是旧版本（新版本只是就绪）', s.contentVersion, baseDoc.contentVersion);
  includes('状态面板写明有新版本在等待',
    await evaluate(`document.querySelector('[data-test="status-sw"]').textContent`), '有新版本在等待');
  await screenshot('04-update-available.png');

  // 4c 阅读中不自动刷新、不中途替换
  const poemId = baseDoc.poems[0].id;
  await hashTo(`#/p/${poemId}`);
  await waitForPoemView(poemId);
  const tokenBeforeWait = await docToken();
  const textBeforeWait = await evaluate(`document.querySelector('[data-test="poem-body"]').innerText`);
  await sleep(2500);
  check('阅读中不会被自动刷新（文档没换）', (await docToken()) === tokenBeforeWait);
  eq('阅读中的正文也没被中途替换', await evaluate(`document.querySelector('[data-test="poem-body"]').innerText`), textBeforeWait);
  check('此时仍能看到「有新版本」提示（而且提示里没有自动刷新）',
    await evaluate(`Boolean(document.querySelector('[data-test="update-available"]'))`));
  includes('提示里给出「刷新到新版本」按钮',
    await evaluate(`document.querySelector('[data-test="apply-update"]').textContent`), '刷新');
  await screenshot('05-reading-not-interrupted.png');

  // 4d 点「刷新」→ 新旧成对切换
  const tokenBeforeApply = await docToken();
  await evaluate(`document.querySelector('[data-test="apply-update"]').click(); true`);
  await waitForNewDocument(tokenBeforeApply, '点刷新后新文档就绪');
  s = await summary();
  eq('切换后站点资源版本 = 新版本', s.appVersion, v2App);
  eq('切换后内容版本 = 新版本内容', s.contentVersion, variants.fixtureContent.doc.contentVersion);
  includes('界面上的站点版本也换了', await evaluate(`document.querySelector('[data-test="app-version"]').textContent`), v2App);
  check('新版本生效后提示消失', !(await evaluate(`Boolean(document.querySelector('[data-test="update-available"]'))`)));
  await hashTo('#/');
  await waitForIndex();
  eq('切换后目录次序 == 新产物数组次序', await domPoemIds(), expectedDomOrder(variants.fixtureContent.doc));
  eq('新内容生效：末首变成测试夹具诗', (await evaluate(`[...document.querySelectorAll('[data-test="poem-row"] .poem-row-title')].map(e => e.textContent)`)).at(-1), '测试夹具诗（非诗文）');
  eq('旧内容已不在：明月何皎皎搜不到', await (async () => { await setQuery('明月何皎皎'); return searchTitles(); })(), []);
  await setQuery('');
  eq('旧 cache 已被新 SW 删掉', (await cacheKeys()).filter((n) => n.startsWith('pc-resources-')), [v2.cacheName]);
  check('部署内容带夹具标记 → 界面明确标出（不是发布内容）',
    await evaluate(`document.querySelector('[data-test="fixture-notice"]').innerText.includes('测试夹具')`));
  await screenshot('06-after-update.png');

  section('4e 新版本里的渲染路径：空行分段 + 笔记按需展开（夹具诗）');
  await hashTo('#/');
  await waitForIndex();
  await evaluate(`document.querySelector('[data-test="poem-row"][data-poem-id="fixture-test-poem-01"]').click()`);
  await waitForPoemView('fixture-test-poem-01');
  const fixturePoem = variants.fixtureContent.doc.poems.find((p) => p.id === 'fixture-test-poem-01');
  eq('分节数量与 JSON 一致（空行表达的分段）', await evaluate(`document.querySelectorAll('[data-test="stanza"]').length`), fixturePoem.stanzas.length);
  eq('每节的行数', await evaluate(`[...document.querySelectorAll('[data-test="stanza"]')].map(s => s.querySelectorAll('[data-test="poem-line"]').length)`), fixturePoem.stanzas.map((x) => x.length));
  check('第二节与第一节之间有间距（空行由 stanzas 分段表达）',
    await evaluate(`parseFloat(getComputedStyle(document.querySelectorAll('[data-test="stanza"]')[1]).marginTop) > 0`));
  eq('笔记默认折叠', await evaluate(`document.querySelector('[data-test="notes-details"]').open`), false);
  await evaluate(`document.querySelector('[data-test="notes-summary"]').click()`);
  await waitFor(`document.querySelector('[data-test="notes-details"]').open === true`, { label: '笔记展开' });
  const notes = await evaluate(`({
    listItems: [...document.querySelectorAll('[data-test="notes-list"] li')].length,
    bold: [...document.querySelectorAll('[data-test="notes-body"] strong')].map(e => e.textContent),
    rawHtmlShown: document.querySelector('[data-test="notes-body"]').innerText.includes('<b>不应被当作标签</b>'),
    parsedTags: document.querySelectorAll('[data-test="notes-body"] b').length,
  })`);
  eq('笔记列表项数', notes.listItems, 2);
  eq('最小 Markdown 子集：**粗体** → strong', notes.bold, ['粗体']);
  check('笔记里的 HTML 原样显示（不解析、不注入）', notes.rawHtmlShown && notes.parsedTags === 0, dump(notes));
  await pushDump('夹具诗（笔记已展开）');

  // ---------------------------------------------------------------- 5. 回目录后自动切换
  section('5 第三个版本：阅读中只有提示，回到目录后自动切换');
  const v3App = '0.3.0';
  const v3 = await makeDeployment({ destDir: join(deployRoot, 'v3'), appVersion: v3App, contentText: baseText });
  await hashTo(`#/p/${poemId}`);
  await redeploy(v3.destDir);
  await reload();                                   // 真导航才会触发 SW 更新检查
  await waitForPoemView(poemId);
  await waitFor(`Boolean(document.querySelector('[data-test="update-available"]'))`, { label: 'v3 提示出现（在诗页）' });
  await waitFor(`window.__app.summary().sw.waitingVersion === ${JSON.stringify(v3App)}`,
    { label: '问到 v3 的站点版本' });
  s = await summary();
  eq('诗页里仍然生效的是旧版本', s.contentVersion, variants.fixtureContent.doc.contentVersion);
  eq('v3 也在等待', s.sw.waitingVersion, v3App);
  eq('旧壳也没变（还是 v2 的站点版本）', s.appVersion, v2App);
  const tokenBeforeBack = await docToken();
  await evaluate(`document.querySelector('[data-test="back-to-index"]').click(); true`);
  await waitForNewDocument(tokenBeforeBack, '回到目录后自动切换（刷新）');
  await waitForIndex();
  s = await summary();
  eq('回到目录后自动切到 v3', s.appVersion, v3App);
  eq('内容也回到真实产物那一版', s.contentVersion, baseDoc.contentVersion);
  eq('目录次序 == 真实产物数组次序', await domPoemIds(), expectedDomOrder(baseDoc));
  eq('只留下 v3 的站点缓存', (await cacheKeys()).filter((n) => n.startsWith('pc-resources-')), [v3.cacheName]);
  await screenshot('07-auto-after-back.png');

  // ---------------------------------------------------------------- 6. 失败状态
  section('6 失败状态：非法 JSON / 结构不合法 / 格式版本不兼容（各发一版）');
  const failureCases = [
    {
      appVersion: '0.4.0',
      contentText: variants.broken.text,
      expect: '不是合法 JSON',
      label: '截断的非法 JSON',
      hint: '损坏',
    },
    {
      appVersion: '0.5.0',
      contentText: variants.schemaBroken.text,
      expect: '结构校验失败',
      label: '合法 JSON 但结构不合法',
      hint: '结构不符合契约',
    },
    {
      appVersion: '0.6.0',
      contentText: variants.futureFormat.text,
      expect: '格式版本',
      label: 'formatVersion 更高（部署不一致）',
      hint: '部署',
    },
  ];
  for (const c of failureCases) {
    const dep = await makeDeployment({ destDir: join(deployRoot, c.appVersion.replace(/\./g, '_')), appVersion: c.appVersion, contentText: c.contentText });
    await redeploy(dep.destDir);
    await reload();
    await waitFor(`Boolean(document.querySelector('[data-test="update-available"]'))`, { label: `${c.label}：新版本提示` });
    const tokenBeforeApplyErr = await docToken();
    await evaluate(`document.querySelector('[data-test="apply-update"]').click(); true`);
    await waitForNewDocument(tokenBeforeApplyErr, `${c.label}：切换后新文档`);
    await waitFor(`Boolean(document.querySelector('[data-test="site-title"]'))`, { label: '外壳仍在' });
    await waitForErrorView();
    const text = await errorText();
    includes(`[${c.label}] 失败状态说清原因`, text, c.expect);
    check(`[${c.label}] 外壳与状态面板仍然渲染（不是白屏）`,
      (await evaluate(`document.querySelector('[data-test="site-title"]').textContent`)) === '索斐'
      && (await evaluate(`Boolean(document.querySelector('[data-test="status-site-cache"]'))`)));
    check(`[${c.label}] 给出可操作的重试入口`,
      await evaluate(`Boolean(document.querySelector('[data-test="retry-load"]'))`));
    includes(`[${c.label}] 提示里说明了可能的原因`, await evaluate(`document.querySelector('[data-test="error-hint"]').textContent`), c.hint);
    eq(`[${c.label}] 新站点的壳版本确实生效了（成对：壳换了、内容坏了也不假装能读）`,
      (await summary()).appVersion, c.appVersion);
    await screenshot(`08-error-${c.appVersion}.png`);
  }

  section('6b 坏内容下点「重试取内容」仍是同样的失败状态（不会假装修好）');
  const beforeRetry = await errorText();
  await evaluate(`document.querySelector('[data-test="retry-load"]').click(); true`);
  await sleep(600);
  await waitForErrorView();
  eq('重试后仍是同一失败原因', await errorText(), beforeRetry);
  await screenshot('09-error-after-retry.png');

  section('6c 发布一版好的内容 → 自愈');
  const v7 = await makeDeployment({ destDir: join(deployRoot, 'v7'), appVersion: '0.7.0', contentText: baseText });
  await redeploy(v7.destDir);
  await reload();
  await waitFor(`Boolean(document.querySelector('[data-test="update-available"]'))`, { label: 'v7 新版本提示' });
  const tokenBeforeV7 = await docToken();
  await evaluate(`document.querySelector('[data-test="apply-update"]').click(); true`);
  await waitForNewDocument(tokenBeforeV7, 'v7 切换后新文档');
  await waitForIndex();
  s = await summary();
  eq('恢复后的站点版本', s.appVersion, '0.7.0');
  eq('恢复后的内容版本', s.contentVersion, baseDoc.contentVersion);
  eq('恢复后有完整 19 首', s.poems, total);
  eq('恢复后次序正确', await domPoemIds(), expectedDomOrder(baseDoc));
  check('恢复后没有残留失败状态', !(await evaluate(`Boolean(document.querySelector('[data-test="view-error"]'))`)));

  // ---------------------------------------------------------------- 7. 清站点数据的两种后果
  section('7 模拟「清除站点数据」（服务不可用）：外壳还在 → 应用自己的失败状态');
  await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await stopServer();
  await evaluate(`(async () => {
    const c = await caches.open(${JSON.stringify(v7.cacheName)});
    await c.delete(new URL('content.json', self.location.href).href);
  })()`);
  await reload();
  await waitFor(`Boolean(document.querySelector('[data-test="site-title"]'))`, { label: '外壳仍能从缓存到达' });
  await waitForErrorView();
  includes('内容缺失 + 离线 → 应用如实报错（HTTP 状态）', await errorText(), 'HTTP');
  check('外壳仍在（不是白屏），并且给出重试', await evaluate(`Boolean(document.querySelector('[data-test="site-title"]')) && Boolean(document.querySelector('[data-test="retry-load"]'))`));
  await pushDump('内容缺失 + 离线（应用自己的失败状态）');
  await screenshot('10-missing-content-offline.png');

  section('7b 连外壳都没了（清掉整个站点缓存 + 注销 SW）→ 只能靠网络的错误页');
  await evaluate(`(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) await reg.unregister();
    for (const k of await caches.keys()) await caches.delete(k);
  })()`);
  check('站点缓存确实清空了', (await cacheKeys()).length === 0);
  const tokenBeforeDead = await docToken();
  await cdp.send('Page.navigate', { url: BASE });
  await sleep(1500);
  const deadState = await evaluate(`({
    hasShell: Boolean(document.querySelector('[data-test="site-title"]')),
    hasApp: Boolean(window.__app),
  })`).catch(() => ({ hasShell: null, hasApp: null, unreachable: true }));
  check('没有外壳可缓存 + 服务不可达 ⇒ 应用没机会显示任何东西（浏览器只能给错误页）',
    deadState.hasShell === false || deadState.unreachable === true, dump(deadState));
  void tokenBeforeDead;
  await screenshot('11-no-shell-offline.png');
  await startServer(v7.destDir);
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

  section('7c 恢复服务后重新访问 → 重新缓存并正常阅读（自愈）');
  await goto(BASE);
  await waitForIndex();
  s = await summary();
  eq('重新访问后内容版本', s.contentVersion, baseDoc.contentVersion);
  eq('重新访问后有完整 19 首', s.poems, total);
  eq('重新访问后站点缓存重新建立', (await cacheKeys()).filter((n) => n.startsWith('pc-resources-')), [v7.cacheName]);
  eq('缓存里重新含 content.json', (await cacheEntries(v7.cacheName)).some((p) => p.endsWith('/content.json')), true);

  // ---------------------------------------------------------------- 8. 收尾断言
  section('8 常量一致与运行时无异常');
  const swSource = await readFile(resolve(webRoot, 'sw.js'), 'utf8');
  eq('sw.js APP_VERSION ←→ app/config.js', /const APP_VERSION = '([^']+)'/.exec(swSource)?.[1], APP_VERSION);
  eq('sw.js CACHE_PREFIX ←→ app/config.js', /const CACHE_PREFIX = '([^']+)'/.exec(swSource)?.[1], 'pc-resources-');
  eq('deploy 目录里没有测试/脚本文件', DEPLOY_FILES.filter((f) => f.startsWith('tests/') || f.startsWith('scripts/') || f.startsWith('fixtures/')), []);
  check('整轮没有未捕获异常 / JS 级 error 日志', pageErrors.length === 0, pageErrors.join(' | ') || '（无）');

  await writeFile(resolve(artifactsDir, 'dom-dumps.txt'), domDump.join('\n\n'), 'utf8');
  console.log('\n产物：web/tests/artifacts/（截图 + dom-dumps.txt + deploy/ 各版本部署目录，均已 gitignore）');
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
  .catch(async (err) => {
    await diagnose(err.message);
    check('测试脚本自身未抛异常', false, err.stack || err.message);
  })
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
