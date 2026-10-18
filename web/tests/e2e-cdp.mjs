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
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SUPPORTED_FORMAT_VERSION, checkCompatibility, validateContent,
} from '../app/content.js';
import { ABOUT, APP_VERSION, CONTENT_REVISION, CONTENT_URL, RESOURCE_CACHE_PREFIX, ROUTES, resourceCacheName } from '../app/config.js';
import {
  breakPoemLine, comparePoems, groupPoems, hasProductOrder, isUnknownAuthor, productOrderStatus, tagGroups, UNKNOWN_AUTHORS,
} from '../app/render.js';
import { buildVariants } from '../scripts/lib/variants.mjs';
import { TAG_FIXTURE_EMPTY_TAG, makeTagTabFixtureDoc, toV3TestDoc } from '../scripts/lib/v3-test-content.mjs';
import { DEPLOY_FILES, DEPLOY_TEXT_FILES, makeDeployment, makeDeploymentFromDir } from './lib/deploy.mjs';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const repoRoot = resolve(webRoot, '..');
const artifactsDir = resolve(webRoot, 'tests', 'artifacts');
const deployRoot = resolve(artifactsDir, 'deploy');

/** 取一个当前空闲的端口。
 *  为什么不能写死：**并发跑同一套 e2e 时会串台** —— 写死 8137 时，A 轮的 Chrome 会连到 B 轮
 *  的静态服务，断言会以极难看懂的方式报红（本人实测：看到的是另一个 tree 的部署版本号）。 */
async function freePort(exclude = []) {
  for (;;) {
    const port = await new Promise((res, rej) => {
      const probe = createServer();
      probe.on('error', rej);
      probe.listen(0, '127.0.0.1', () => {
        const p = probe.address().port;
        probe.close(() => res(p));
      });
    });
    if (!exclude.includes(port)) return port;
  }
}

const PORT = process.env.TEST_PORT ? Number(process.env.TEST_PORT) : await freePort();
const DEBUG_PORT = process.env.TEST_DEBUG_PORT
  ? Number(process.env.TEST_DEBUG_PORT)
  : await freePort([PORT]);

/** 起服务/起浏览器前先确认端口是空的：**不静默复用**别人的端口。
 *  否则「本轮的 Chrome 连到另一轮的服务器」会伪装成看不懂的断言失败，而不是一条清楚的错误。 */
async function assertPortFree(port, what) {
  try {
    await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(2000) });
  } catch {
    return; // 连不上 = 空闲
  }
  throw new Error(`端口 ${port}（${what}）已被占用：可能是另一个会话在并发跑同一套 e2e。`
    + '本轮直接停下，不静默复用；可以等它结束，或用 TEST_PORT / TEST_DEBUG_PORT 指定别的端口。');
}
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

/** 期望的目录次序：组的次序照顶层 `dynasties`（有序中文值数组），组内照 `poems` 数组次序。 */
function expectedDomOrder(doc) {
  const out = [];
  for (const d of doc.dynasties) {
    for (const p of doc.poems) if (p.dynasty === d) out.push(p.id);
  }
  return out;
}

/** 本机拼音兜底会排成什么样（只在「产物一首都没带 orderInSource」时才该被用到）。 */
function fallbackOrder(doc) {
  const byD = new Map();
  for (const p of doc.poems) {
    if (!byD.has(p.dynasty)) byD.set(p.dynasty, []);
    byD.get(p.dynasty).push(p);
  }
  const out = [];
  for (const d of doc.dynasties) out.push(...(byD.get(d) ?? []).slice().sort(comparePoems).map((p) => p.id));
  return out;
}

/**
 * 从当前站点版本派生一个「更大」的部署版本。
 * **绝不写死**具体版本号：真发布演练时仓库 APP_VERSION 可能正好就是写死的那个值（实测踩过），
 * 那时「部署的新版本」与当前版本相同 → 页面永远不会有「有新版本」提示 →
 * 超时症状会**伪装成时序问题**，排查半天才发现是版本号撞车。
 */
function nextAppVersion(base, step) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(base));
  if (!m) throw new Error(`APP_VERSION 不是 x.y.z 形状，无法派生部署版本：${base}`);
  return `${m[1]}.${Number(m[2]) + step}.0`;
}

/** 同 APP_VERSION 下的「下一个内容修订」：从当前修订派生一个**不同**的值（不写死任何版本号）。 */
function nextContentRevision(base) {
  const m = /^(\d{4})\.(\d{2})\.(\d{2})\.(\d+)$/.exec(String(base));
  if (!m) throw new Error(`内容修订不是 YYYY.MM.DD.N 形状：${base}`);
  return `${m[1]}.${m[2]}.${m[3]}.${Number(m[4]) + 1}`;
}

/**
 * 环境里交给本轮的「真·旧基底」：**已发布那一版**的 web/** 字节 ＋ 线上已发布的内容快照。
 * 由 release/lib/live.mjs 的 materializeBaselineForE2E() 准备（tag 里的字节 + 线上快照），
 * **不是**「新 main ＋ 20 首夹具」。没提供时本节**没跑**（不假装通过）。
 */
function readBaselineFromEnv() {
  const webDir = process.env.SUOFEI_BASELINE_WEB_DIR || null;
  const tag = process.env.SUOFEI_BASELINE_TAG || null;
  const contentVersion = process.env.SUOFEI_BASELINE_CONTENT_VERSION || null;
  const contentSha256 = process.env.SUOFEI_BASELINE_CONTENT_SHA || null;
  if (!webDir || !tag || !contentVersion) return { ok: false, reason: '环境里没有 SUOFEI_BASELINE_*（旧基底没准备）' };
  for (const rel of ['sw.js', 'app/config.js', 'app/main.js', 'content.json']) {
    if (!existsSync(resolve(webDir, rel))) return { ok: false, reason: '旧基底缺 ' + rel + '（' + webDir + '）' };
  }
  return { ok: true, webDir: resolve(webDir), tag, contentVersion, contentSha256 };
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
/** 浏览器身份（IF-45 的判定依据之一：不同 Chromium 版本的帧调度/字体度量可能不同）。 */
let browserVersion = null;

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

/** 等目录滚回 y，并把**轨迹**记下来（IF-45 用）。
 *  刻意不用 `waitFor`：那个只会给一句「等待条件超时」，看不出是「没记住」还是「没滚回去」，
 *  也看不出当时文档多高、滚动位置在哪一帧被夹住。超时阈值与原来一致（5s），不拿来掩盖根因。 */
async function waitForScrollRestore(y, timeout = 5000) {
  const t0 = Date.now();
  const trace = [];
  for (;;) {
    const snap = await evaluate(`({
      y: window.scrollY,
      docH: document.documentElement.scrollHeight,
      innerH: innerHeight,
      vis: document.visibilityState,
      tab: document.querySelector('[data-test="view-index"]')?.dataset.tab ?? null,
      mem: window.__app ? window.__app.summary().listScroll.index.y : null,
      expanded: window.__app ? window.__app.summary().expanded.index.length : null,
    })`).catch(() => null);
    const ms = Date.now() - t0;
    if (snap) {
      trace.push({ ms, y: snap.y, docH: snap.docH });
      const ok = Math.abs(snap.y - y) <= 2;
      if (ok || ms > timeout) return { ok, snapshot: snap, trace, ms };
    }
    await sleep(60);
  }
}

const APP_READY = 'Boolean(window.__app && window.__app.ready)';
const waitForIndex = () => waitFor(`Boolean(document.querySelector('[data-test="view-index"]'))`, { label: '目录视图' });

/** 目录首态**全部收起**（IF-44）⇒ 需要读诗目的地方先把各组展开。幂等。 */
async function expandAllGroups() {
  await waitFor(`Boolean(document.querySelector('[data-test="dynasty-group-title"]'))`, { label: '目录里有组头' });
  await evaluate(`(() => {
    for (const b of document.querySelectorAll('[data-test="dynasty-group-title"]')) {
      if (b.getAttribute('aria-expanded') !== 'true') b.click();
    }
    return true;
  })()`);
  await waitFor(`[...document.querySelectorAll('[data-test="dynasty-group"]')]`
    + `.every(g => !g.querySelector('[data-test="poem-list"]').hidden)`, { label: '目录各组已展开' });
}

const waitForIndexExpanded = async () => { await waitForIndex(); await expandAllGroups(); };
const waitForPoemView = (id) => waitFor(
  `Boolean(document.querySelector('[data-test="view-poem"][data-poem-id=${JSON.stringify(id)}]'))`,
  { label: `诗页 ${id}` },
);
const waitForErrorView = () => waitFor(`Boolean(document.querySelector('[data-test="view-error"]'))`, { label: '失败状态' });
const waitForAboutView = () => waitFor(`Boolean(document.querySelector('[data-test="view-about"]'))`, { label: '关于页' });

/** 目录页的「标签 tab」（同一个 view-index，`data-tab="tags"`）。 */
const waitForTagsView = () => waitFor(
  `Boolean(document.querySelector('[data-test="view-index"][data-tab="tags"]'))`,
  { label: '标签视图（view-index[data-tab=tags]）' },
);
const waitForDynastyView = () => waitFor(
  `Boolean(document.querySelector('[data-test="view-index"][data-tab="dynasty"]'))`,
  { label: '朝代视图（view-index[data-tab=dynasty]）' },
);

/** 切到某首诗的详情页并把表达式在那个页面上求值（省得每处都写一遍 hashTo + waitFor）。 */
async function evaluateOnDetail(id, expression) {
  await hashTo(`#/p/${id}/detail`);
  await waitFor(
    `Boolean(document.querySelector('[data-test="view-detail"]'))`
    + ` && document.querySelector('[data-test="view-detail"]').dataset.poemId === ${JSON.stringify(id)}`,
    { label: `详情页就位（${id}）` },
  );
  return evaluate(expression);
}

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

/** 以某个 URL **真·新开一次**（先跳到 about:blank 再过去）：
 *  用于验证「深链接直接打开」，避开「只改 hash 只是同文档切视图」这个区别。 */
async function openFresh(url) {
  await cdp.send('Page.navigate', { url: 'about:blank' });
  await sleep(200);
  await goto(url);
}
const summary = () => evaluate('JSON.parse(JSON.stringify(window.__app.summary()))');

const screenshotFailures = [];
const screenshotAttempts = [];

/** 截图只是**证据产物**，不是行为验证：超时/失败不应该把行为断言判红。
 *  所以这里给 20s 超时 + 一次重试，仍失败就如实记一笔 WARN（在汇总里单列）。 */
async function screenshot(name) {
  screenshotAttempts.push(name);
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }, 20000);
      await writeFile(resolve(artifactsDir, name), Buffer.from(data, 'base64'));
      return name;
    } catch (err) {
      if (attempt === 2) {
        screenshotFailures.push(`${name}：${err.message}`);
        console.log(`WARN  截图失败（不影响行为断言）：${name} —— ${err.message}`);
        return null;
      }
      await sleep(500);
    }
  }
  return null;
}

const domPoemIds = () => evaluate(`[...document.querySelectorAll('[data-test="poem-row"]')].map(r => r.dataset.poemId)`);
const groupKeys = () => evaluate(`[...document.querySelectorAll('[data-test="dynasty-group"]')].map(g => g.dataset.dynastyKey)`);
const errorText = () => evaluate(`document.querySelector('[data-test="error-text"]').textContent`);
const cacheKeys = () => evaluate('caches.keys()');
/** 站点缓存（pc-resources-*）集合。 */
const siteCaches = () => evaluate(`(async () => (await caches.keys())
  .filter(n => n.startsWith('pc-resources-')).sort())()`);

/** 等站点缓存集合**变成**期望值（而不是取一次快照就跟期望值比 —— 那是时序敏感的写法）。
 *  注意：比较必须放在 async IIFE **里面** —— 否则整表达式会变成一个 Promise 与字符串比、永远为假。 */
const waitForSiteCaches = (expected, label = `站点缓存 == ${expected.join(',')}`) => waitFor(
  `(async () => JSON.stringify((await caches.keys()).filter(n => n.startsWith('pc-resources-')).sort())`
  + ` === ${JSON.stringify(JSON.stringify([...expected].sort()))})()`,
  { label },
);

/** 等某个缓存里出现某个条目（例如 content.json）。 */
const waitForCacheEntry = (cacheName, path, label = `${cacheName} 含 ${path}`) => waitFor(
  `(async () => { const r = await (await caches.open(${JSON.stringify(cacheName)})).match(${JSON.stringify(path)}); return Boolean(r); })()`,
  { label },
);

/** 等某个缓存里有**至少一个**条目（安装刚完成时用）。 */
const waitForNonEmptyCache = (cacheName, label = `${cacheName} 已写入`) => waitFor(
  `(async () => (await (await caches.open(${JSON.stringify(cacheName)})).keys()).length > 0)()`,
  { label },
);
const cacheEntries = (name) => evaluate(`(async () => (await (await caches.open(${JSON.stringify(name)})).keys()).map(r => new URL(r.url).pathname))()`);
const cacheText = (name, path) => evaluate(`(async () => {
  const res = await (await caches.open(${JSON.stringify(name)})).match(${JSON.stringify(path)});
  return res ? await res.text() : null;
})()`);

/** 模拟「这台机器上什么都没缓存过」：注销 SW ＋ 删掉所有 cache。
 *  用于把旧壳/新壳各自当成**第一次访问**来看，避免上一段残留的站点缓存把本次部署遮住。 */
const clearSiteData = () => evaluate(`(async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  if (reg) await reg.unregister();
  for (const k of await caches.keys()) await caches.delete(k);
  return true;
})()`);

// ------------------------------------------------------------------ 服务与部署

let server = null;
let chrome = null;
let userDataDir = null;
let currentRoot = null;

async function startServer(rootDir) {
  await assertPortFree(PORT, '本站静态服务');
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

  // 字段集（formatVersion 3）：顶层 dynasties ＝有序中文值数组、顶层 tags ＝有序数组；每首 11 键。
  //    诗页**不得**出现详情文本（反向断言在 §1c）；**详情页必须渲染**（正断言在 §1c-2）。
  //    `tags` 是 v3 新加的键（`[{ id, orderInTag }]`，可为 `[]`——几何诗都没标签也不该编）。
  const KEY_SET = ['id', 'title', 'author', 'dynasty', 'genre', 'source', 'orderInSource', 'detail', 'stanzas', 'notes', 'tags'];
  const keySetOk = baseDoc.poems.every((p) => Object.keys(p).length === KEY_SET.length && KEY_SET.every((k) => k in p));
  check('每首恰好 11 键（id/title/author/dynasty/genre/source/orderInSource/detail/stanzas/notes/tags）', keySetOk,
    dump(baseDoc.poems.map((p) => Object.keys(p)).filter((ks) => ks.length !== KEY_SET.length || !KEY_SET.every((k) => ks.includes(k)))));
  check('顶层 tags 是**有序数组**（顺序即渲染顺序）',
    Array.isArray(baseDoc.tags) && baseDoc.tags.every((t) => t && typeof t.id === 'string' && Array.isArray(t.members)),
    dump(baseDoc.tags));
  check('顶层 dynasties 是**有序中文值数组**',
    baseDoc.dynasties.length > 0 && baseDoc.dynasties.every((d) => typeof d === 'string' && d !== ''), dump(baseDoc.dynasties));
  check('组名精确匹配：每首 dynasty 都在顶层 dynasties 里',
    baseDoc.poems.every((p) => baseDoc.dynasties.includes(p.dynasty)),
    dump([...new Set(baseDoc.poems.map((p) => p.dynasty).filter((d) => !baseDoc.dynasties.includes(d)))]));

  const withDetail = baseDoc.poems.filter((p) => typeof p.detail === 'string' && p.detail.trim() !== '');
  check('真实产物里确实带着详情文本（detail 字段；渲染位置见 §1c / §1c-2）', withDetail.length > 0,
    `${withDetail.length}/${baseDoc.poems.length} 首有 detail`);
  check('真实产物里没有任何 variants 字段（新形状已不发布它）',
    baseDoc.poems.every((p) => !('variants' in p)), dump(baseDoc.poems.filter((p) => 'variants' in p).map((p) => p.id)));
  const badDetail = structuredClone(baseDoc);
  badDetail.poems[0].detail = 123;
  badDetail.poems[1].notes = 456;
  const bv = validateContent(badDetail);
  check('detail/notes 形状不对 → 结构校验仍然失败（不只是不渲染）',
    bv.ok === false && bv.errors.length >= 2, bv.errors.join(' / '));
  const badDynasty = structuredClone(baseDoc);
  badDynasty.poems[0].dynasty = '不存在的朝代';
  const bd = validateContent(badDynasty);
  check('dynasty 未在顶层声明 → 结构校验失败（组名精确匹配）',
    bd.ok === false && bd.errors.some((e) => e.includes('dynasty')), bd.errors.join(' / '));
  const future = checkCompatibility(variants.futureFormat.doc);
  check('格式版本更高 → 判定为部署不一致', future.ok === false && future.message.includes('部署不一致'), future.message);
  check('格式版本更低 → 也判不兼容', checkCompatibility({ formatVersion: 0 }).ok === false);
  eq('支持的内容格式版本（字段集升版 2 → 3：每首加 tags、顶层加 tags，用户 2026-10-18 定）', SUPPORTED_FORMAT_VERSION, 3);
  // 版本门**不放宽**：比本站高的拒，比本站低的也拒（v2 产物现在就是「低版本」）。
  eq('v2 产物（本轮之前的旧内容）→ 判为格式版本不兼容（没有放宽版本门）',
    checkCompatibility({ formatVersion: 2 }).ok, false);
  eq('v3 正是本站支持的那一个版本', checkCompatibility({ formatVersion: 3 }), { ok: true });

  section('0b 次序策略：产物带了 orderInSource 时一律不重排（回归）');
  eq('真实产物被判定为「产物次序权威」', hasProductOrder(baseDoc), true);
  // ⚠ 真实内容现在有**三个组**（汉 19 首 ＋ 唐杜甫《梦李白二首》2 条 ＋ 近现代 1 首）；毛泽东那首**未写** orderInSource（该键**可选**，不编）。
  const withOrder = baseDoc.poems.filter((p) => p.orderInSource !== undefined && p.orderInSource !== null);
  const usableOrder = withOrder.filter((p) => Number.isInteger(p.orderInSource));
  eq(`判定依据是 orderInSource（${withOrder.length}/${baseDoc.poems.length} 首带整数次序）`,
    productOrderStatus(baseDoc),
    { present: withOrder.length, usable: usableOrder.length, productOrderAuthoritative: true, wrongType: false });
  const hanPoems = baseDoc.poems.filter((p) => p.dynasty === '汉');
  eq(`真实产物「汉」组 ${hanPoems.length} 首的诗名次序 == 用户拍板的《文选》原次序`,
    hanPoems.map((p) => p.title), SOURCE_ORDER_TITLES);
  eq('产物里的组与组序（＝注册表 order 升序：汉 → 唐 → 近现代）',
    baseDoc.dynasties, [...new Set(baseDoc.poems.map((p) => p.dynasty))]);
  eq('目录次序 == 产物数组次序', groupPoems(baseDoc).flatMap((g) => g.poems.map((p) => p.id)), expectedDomOrder(baseDoc));
  check('本机拼音排序与产物次序不同（这条断言才有牙齿）', dump(fallbackOrder(baseDoc)) !== dump(expectedDomOrder(baseDoc)));
  check('本机拼音兜底不会把产物第 1 首排在第 1 位', fallbackOrder(baseDoc)[0] !== baseDoc.poems[0].id, dump(fallbackOrder(baseDoc).slice(0, 3)));

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

  section('0e 匿名作者清单：与唯一来源 schema/unknown-authors.json 逐字一致');
  // 唯一来源是**机器可读的文件**（契约正文只说明来源）。以前这里正则解析契约散文，
  // 结果一改措辞（比如把「阙名」插进去）就报「找不到清单」——对排查毫无帮助，已改掉。
  const listPath = process.env.UNKNOWN_AUTHORS_FILE
    ? resolve(process.env.UNKNOWN_AUTHORS_FILE)
    : resolve(repoRoot, 'schema', 'unknown-authors.json');
  const listExists = existsSync(listPath);
  check('唯一来源清单文件存在', listExists, listExists
    ? listPath
    : `${listPath} 不在本树（可能还没合并到 master）——这一条先红；文件到位后会自动开始核对。`);
  if (listExists) {
    const fromFile = JSON.parse(readFileSync(listPath, 'utf8'));
    check('清单文件是非空字符串数组', Array.isArray(fromFile) && fromFile.length > 0
      && fromFile.every((a) => typeof a === 'string'), dump(fromFile));
    eq('UNKNOWN_AUTHORS 与唯一来源逐字一致（含顺序）', [...UNKNOWN_AUTHORS], fromFile);
    check('清单里没有空串/带空白的项（空白由 isUnknownAuthor 处理）',
      fromFile.every((a) => a !== '' && a.trim() === a), dump(fromFile));
  } else {
    console.log(`      当前 app 侧清单 = ${dump([...UNKNOWN_AUTHORS])}（等文件到位后自动核对）`);
  }

  section('0f 未知作者排最后（只验机制；清单内容由 0e 核对）');
  // 故意只用**无论清单怎么改都确定**的名字，不依赖清单文件是否存在：
  // 苏轼/杨万里 一定是具名作者；佚名 一定是未知作者；空串一定是空白作者。
  const anonDoc = {
    dynasties: ['宋'],
    poems: ['苏轼', '杨万里', '佚名', ''].map((author, i) => ({
      id: `t-${i}`, title: `戏题${i}`, author, dynasty: '宋',
      genre: null, source: null, orderInSource: null, detail: null, stanzas: [['一']], notes: null,
    })),
  };
  const orderedAuthors = groupPoems(anonDoc)[0].poems.map((p) => p.author);
  check('具名作者排在前面',
    [...orderedAuthors.slice(0, 2)].sort().join() === ['杨万里', '苏轼'].sort().join(), dump(orderedAuthors));
  check('未知作者（佚名）与空白作者排在最后',
    orderedAuthors.length === 4 && orderedAuthors.slice(2).every((a) => isUnknownAuthor(a)), dump(orderedAuthors));
  check('空白作者按未知处理', isUnknownAuthor('') && isUnknownAuthor('   '));

  section('0g 仓库里两份夹具自身合法（防止夹具自己慢慢烂掉）');
  for (const name of ['content.placeholder.json', 'content.no-sortkeys.json']) {
    const doc = JSON.parse(readFileSync(resolve(webRoot, 'fixtures', name), 'utf8'));
    const v = validateContent(doc);
    check(`fixtures/${name} 通过结构校验`, v.ok, v.errors.join(' / ') || 'ok');
    check(`fixtures/${name} 带上「夹具」标记（不会被当成发布内容）`, doc.placeholder === true, `placeholder=${doc.placeholder}`);
  }

  section('0g-2 路由形态：目录 / 诗 / 详情 + 关于（第四页）');
  eq('诗页路由', ROUTES.poem('abc/def'), '#/p/abc%2Fdef');
  eq('详情页路由', ROUTES.detail('abc'), '#/p/abc/detail');
  eq('关于页路由', ROUTES.about, '#/about');
  eq('诗页模式抓到的 id（id 不含 /）', ROUTES.poemPattern.exec('/p/abc')?.[1], 'abc');
  // 关键：详情页模式必须**先**匹配，否则 /p/<id>/detail 会被诗页模式当成 id 为 `<id>/detail`。
  check('详情页模式匹配 /p/<id>/detail', ROUTES.detailPattern.test('/p/abc/detail'));
  check('诗页模式不如详情页模式下得早（否则就吃错 id）',
    !ROUTES.poemPattern.test('/p/abc/detail'), dump(ROUTES.poemPattern.exec('/p/abc/detail')));
  eq('详情页模式抓到的 id', ROUTES.detailPattern.exec('/p/abc/detail')?.[1], 'abc');
  check('/about 不匹配诗页模式', !ROUTES.poemPattern.test('/about'));

  section('0j 语义折行（用户 2026-10-16 逐项确认的规则，纯函数钉住）');
  // 用确定性的合成量尺（每字符 1 单位）验规则，不依赖字体度量：
  //  1 够宽保原行・2 多标点取「放得下范围内最后那个句读」・3 无标点/半句超宽⇒行尾字符断・4 标点不起行。
  const m1 = (t) => t.length;
  eq('够宽就保原行（不折）', breakPoemLine('行行重行行，与君生别离。', 12, m1), ['行行重行行，与君生别离。']);
  eq('超宽：在句读后断（标点归前句），与用户给的例子逐字一致',
    breakPoemLine('行行重行行，与君生别离。', 8, m1), ['行行重行行，', '与君生别离。']);
  eq('多个标点：取当前行放得下范围内**最后**那个句读',
    breakPoemLine('甲乙丙丁；戊己庚辛，壬癸子丑', 10, m1), ['甲乙丙丁；戊己庚辛，', '壬癸子丑']);
  eq('无标点 ⇒ 行尾字符断，余文续行', breakPoemLine('甲乙丙丁戊己庚辛壬癸', 4, m1), ['甲乙丙丁', '戊己庚辛', '壬癸']);
  eq('避免收尾标点起行：必要时前一字连标点一起下移',
    breakPoemLine('甲乙丙丁，戊', 4, m1), ['甲乙丙', '丁，戊']);
  check('折行不删字/不加字（拼接后与原文逐字相同）',
    breakPoemLine('行行重行行，与君生别离。甲乙丙丁戊', 5, m1).join('') === '行行重行行，与君生别离。甲乙丙丁戊');

  section('0k 标签（formatVersion 3）：次序照产物、零成员不出组、引用闭合真的被查');
  const tagFix = makeTagTabFixtureDoc();
  const tagFixValid = validateContent(tagFix);
  check('标签夹具自身通过结构校验（夹具先得是干净的）', tagFixValid.ok, tagFixValid.errors.join(' / ') || 'ok');
  // 回退路径（若某条支线里 C 线产物还是 v2）：派生出来的 v3 也必须自己合法、且**不编造标签**。
  const v2Shaped = structuredClone(baseDoc);
  v2Shaped.formatVersion = 2;
  delete v2Shaped.tags;
  for (const p of v2Shaped.poems) delete p.tags;
  const derivedV3 = toV3TestDoc(v2Shaped);
  eq('v2 → v3 派生：formatVersion 变 3、TOP tags 是空数组', [derivedV3.formatVersion, derivedV3.tags], [3, []]);
  eq('v2 → v3 派生：不给任何诗编造标签（每首 tags 都是 []）',
    derivedV3.poems.every((p) => Array.isArray(p.tags) && p.tags.length === 0), true);
  check('v2 → v3 派生：派生内容通过结构校验', validateContent(derivedV3).ok, validateContent(derivedV3).errors.join(' / '));
  check('v2 → v3 派生：明确标成夹具（fixture: true ＋ 可读说明），不会被当成发布内容',
    derivedV3.fixture === true && /夹具/.test(derivedV3.fixtureNotice ?? ''), dump(derivedV3.fixtureNotice));
  // 独立 oracle：拼音序用 Intl.Collator 现算，**不引用 app 的任何排序函数**。
  const tagCollator = new Intl.Collator(['zh-Hans-CN-u-co-pinyin', 'zh-Hans-CN', 'zh'], {
    numeric: true, sensitivity: 'variant',
  });
  const nonEmptyTags = tagFix.tags.filter((t) => t.members.length > 0).map((t) => t.id);
  const renderedTagOrder = tagGroups(tagFix).map((g) => g.key);
  eq('标签组顺序 == 产物顶层 tags 数组顺序（客户端一处都不重排）', renderedTagOrder, nonEmptyTags);
  const tagPinyinOrder = [...nonEmptyTags].sort((a, b) => tagCollator.compare(a, b));
  check('产物的标签顺序**确实不是拼音序**（所以上一条断言有牙齿）',
    dump(renderedTagOrder) !== dump(tagPinyinOrder), dump({ renderedTagOrder, tagPinyinOrder }));
  const firstTagGroup = tagGroups(tagFix)[0];
  eq('标签内成员顺序 == 产物 members 数组顺序', firstTagGroup.poems.map((p) => p.id), tagFix.tags[0].members);
  const memberPinyinOrder = [...firstTagGroup.poems].sort((a, b) => tagCollator.compare(a.title, b.title)).map((p) => p.id);
  const poemsArrayOrder = tagFix.poems.map((p) => p.id).filter((id) => tagFix.tags[0].members.includes(id));
  check('成员顺序**确实不是拼音序**，也不是 poems 数组顺序（所以上一条断言有牙齿）',
    dump(firstTagGroup.poems.map((p) => p.id)) !== dump(memberPinyinOrder)
      && dump(firstTagGroup.poems.map((p) => p.id)) !== dump(poemsArrayOrder),
    dump({ rendered: firstTagGroup.poems.map((p) => p.id), memberPinyinOrder, poemsArrayOrder }));
  check('夹具里确实有一条零成员的标签（否则下一条是空的）',
    tagFix.tags.some((t) => t.id === TAG_FIXTURE_EMPTY_TAG && t.members.length === 0), dump(tagFix.tags.map((t) => [t.id, t.members.length])));
  check('零成员的标签**不成为组**（也不出空态文字：连组都没有）',
    !renderedTagOrder.includes(TAG_FIXTURE_EMPTY_TAG), dump(renderedTagOrder));
  eq('无标签的诗照旧在朝代页（只是不在标签页）', groupPoems(tagFix).flatMap((g) => g.poems.map((p) => p.id)).length, tagFix.poems.length);

  // 引用闭合（两个方向）与必填字段：这些是「结构校验真的在把关」，不是只画得出来就行。
  const noTopTags = structuredClone(tagFix);
  delete noTopTags.tags;
  check('缺顶层 tags → 结构校验失败（v3 必填键）', validateContent(noTopTags).ok === false,
    validateContent(noTopTags).errors.join(' / '));
  const nullOrderInTag = structuredClone(tagFix);
  nullOrderInTag.poems[0].tags = [{ id: '测试标签乙', orderInTag: null }];
  check('orderInTag 为 null → 结构校验失败（数据侧口径：必填整数，不可为 null）',
    validateContent(nullOrderInTag).ok === false, validateContent(nullOrderInTag).errors.join(' / '));
  const undeclaredTag = structuredClone(tagFix);
  undeclaredTag.poems[0].tags = [{ id: '没有这个标签', orderInTag: 1 }];
  check('诗的 tags[].id 未在顶层 tags 声明 → 结构校验失败（引用闭合①）',
    validateContent(undeclaredTag).ok === false, validateContent(undeclaredTag).errors.join(' / '));
  const danglingMember = structuredClone(tagFix);
  danglingMember.tags[0].members = [...danglingMember.tags[0].members, 'no-such-poem'];
  check('members 指向不存在的诗 → 结构校验失败（引用闭合②）',
    validateContent(danglingMember).ok === false, validateContent(danglingMember).errors.join(' / '));
  check('诗的 tags 为 [] 是合法的（不是每首诗都必须属于某个标签）',
    tagFix.poems.some((p) => p.tags.length === 0) && validateContent(tagFix).ok);
}

/** 「内容必须单独取、不许内联」的自证 + 体积报告。 */
async function inlineChecks(contentText) {
  section('0h 内容必须单独取、不许内联进 HTML/JS（自证 + 体积）');
  // 只把**文本**文件读进来：图标 PNG 读成 utf8 等于把字节当字符，搜诗题毫无意义、体积还会算错。
  const texts = new Map();
  for (const rel of DEPLOY_TEXT_FILES) texts.set(rel, await readFile(resolve(webRoot, rel), 'utf8'));
  // 体积分段报告：壳（html/css/js/manifest）／图标资源（icons/ 下的 svg+png，按字节读）／内容。
  // 图标是**二进制 + 矢量资源**，把它们算进「壳」会把壳的体积说成另一个数（这里就不那么算）。
  const shellFiles = DEPLOY_TEXT_FILES.filter((f) => !f.startsWith('icons/'));
  const shellBytes = shellFiles.reduce((a, f) => a + Buffer.byteLength(texts.get(f), 'utf8'), 0);
  const iconFiles = DEPLOY_FILES.filter((f) => f.startsWith('icons/'));
  let iconBytes = 0;
  for (const rel of iconFiles) iconBytes += (await readFile(resolve(webRoot, rel))).length;
  const contentBytes = Buffer.byteLength(contentText, 'utf8');

  const firstLine = JSON.parse(contentText).poems[0].stanzas[0][0];
  const firstTitle = JSON.parse(contentText).poems[0].title;
  const offenders = [...texts.entries()]
    .filter(([, t]) => t.includes(firstTitle) || t.includes(firstLine))
    .map(([rel]) => rel);
  eq('部署文件里没有任何诗题/正文（内容没有内联进壳）', offenders, []);
  includes('index.html 里有静态的「正在装载站点…」（JS/内容没到时也不是白屏）',
    texts.get('index.html'), '正在装载站点');
  // ⚠ 2026-10-16：**全局外壳顶栏已从产品壳整块删除**（原先那条 sticky「索斐」横栏＋版本徽标）。
  //   采纳锚：目录页顶部**只有「关于」**、不重复应用名（`round-2026-10-15-hub-align/`；Android 端也无此栏）；
  //   诗页/详情页各有返回工具栏；关于页自带应用名页标题。⇒ 从源码钉住它**不在**，免得日后又长回来。
  check('index.html 里没有外壳顶栏（无 site-header / site-title）—— 目录顶部只留视图内的「关于」',
    !/<header class="site-header">/.test(texts.get('index.html'))
      && !/data-test="site-title"/.test(texts.get('index.html')));
  check('index.html 里没有外壳版本徽标（版本只在关于页）',
    !/id="app-version"/.test(texts.get('index.html')));
  check('外壳里只有 content.json 这个**地址**，没有它的内容',
    texts.get('sw.js').includes('content.json') && !texts.get('sw.js').includes(firstTitle));
  console.log(`  实测体积：壳 ${(shellBytes / 1024).toFixed(1)} KB（${shellFiles.length} 个：html/css/js/manifest）`
    + ` ＋ 图标资源 ${(iconBytes / 1024).toFixed(1)} KB（${iconFiles.length} 个：icons/ 下的 svg + png）`
    + ` / 内容 content.json ${(contentBytes / 1024).toFixed(1)} KB`);
}

/**
 * 图标接线自证（纯静态，不看浏览器）。
 *
 * 为什么值得单列一节：「在 index.html 里写了一个 href」与「这个文件真的会跟着部署到达」
 * 是两件事：图标现在是**独立文件**（以前是内联 data: URI），漏进部署清单或漏进 SW 预缓存
 * 都不会在桌面浏览器上立刻暴露，而是以「离线时标签页/安装入口掉图」的形式出现。
 * 所以这里把三份清单（index.html 的 <link>、manifest 的 icons、sw.js 的 PRECACHE）互相对一遍。
 */
function iconChecks() {
  section('0i 图标接线：两套资产都会随部署到达，且 SW 预缓存清单跟着更新');
  const indexHtml = readFileSync(resolve(webRoot, 'index.html'), 'utf8');
  const manifest = JSON.parse(readFileSync(resolve(webRoot, 'manifest.json'), 'utf8'));
  const swSource = readFileSync(resolve(webRoot, 'sw.js'), 'utf8');

  // 1) index.html 的 <link rel=icon|apple-touch-icon> 指向的文件必须真的在部署清单里
  const linkTags = [...indexHtml.matchAll(/<link[^>]*rel="(?:icon|apple-touch-icon)"[^>]*>/g)].map((m) => m[0]);
  const hrefs = linkTags.map((tag) => /href="([^"]*)"/.exec(tag)?.[1] ?? null);
  check('index.html 声明了标签页图标与 apple-touch-icon（含 PNG 兜底）',
    linkTags.length >= 3 && hrefs.filter((h) => h?.endsWith('.png')).length >= 1
      && hrefs.some((h) => h?.endsWith('.svg')),
    hrefs.join(' | '));
  eq('favicon 不再用内联 data: URI（旧的那份用 <text> 画字，靠系统字体）',
    hrefs.filter((h) => h?.startsWith('data:')), []);
  eq('index.html 里每个图标 href 都在部署清单里（否则部署目录会缺文件）',
    hrefs.filter((h) => h && !h.startsWith('data:') && !DEPLOY_FILES.includes(h)), []);

  // 2) manifest 的 icons：字段齐、文件真在部署清单里、有 maskable
  const icons = manifest.icons ?? [];
  eq('manifest 的 icons 里每个 src 都在部署清单里',
    icons.map((i) => i.src).filter((s) => !DEPLOY_FILES.includes(s)), []);
  check('manifest 的每个 icon 都写明 sizes 与 type',
    icons.length >= 3 && icons.every((i) => i.sizes && i.type),
    icons.map((i) => `${i.src} ${i.sizes} ${i.type} purpose=${i.purpose ?? '（缺省 any）'}`).join(' | '));
  check('manifest 里至少有一个 purpose=maskable 的 512 图标',
    icons.some((i) => i.purpose === 'maskable' && i.sizes === '512x512'),
    icons.map((i) => `${i.src}:${i.purpose}`).join(' | '));
  check('manifest 声明了 192 与 512（安装所需的最小集）',
    icons.some((i) => i.sizes === '192x192') && icons.some((i) => i.sizes === '512x512'));

  // 3) SW 预缓存清单：必须是部署清单的子集，且把图标都包含进来
  const precacheMatch = /const PRECACHE = \[([\s\S]*?)\]/.exec(swSource);
  check('从 sw.js 里解析出了预缓存清单', Boolean(precacheMatch));
  const precache = [...(precacheMatch?.[1] ?? '').matchAll(/'([^']*)'/g)].map((m) => m[1]).filter((p) => p !== '');
  eq('预缓存清单里的每一项都在部署清单里（清单里有、部署目录没有 → install 直接失败）',
    precache.filter((p) => !DEPLOY_FILES.includes(p)), []);
  const iconFiles = DEPLOY_FILES.filter((f) => f.startsWith('icons/'));
  eq(`部署清单里的 ${iconFiles.length} 个图标资源全部进了预缓存（否则离线首屏缺图标）`,
    iconFiles.filter((f) => !precache.includes(f)), []);

  // 4) 图标不得靠运行时字体画字；favicon 是**另一套**记号（用户 2026-10-15 裁决）
  const svgPath = (rel) => {
    const markup = readFileSync(resolve(webRoot, rel), 'utf8').replace(/<!--[\s\S]*?-->/g, ''); // 注释里提到 <text> 不算依赖（本仓的注释就会提到）
    return { markup, d: [...markup.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1]) };
  };
  const n1 = svgPath('icons/icon.svg');
  const fav = svgPath('icons/favicon.svg');
  for (const [rel, s] of [['icons/icon.svg', n1], ['icons/favicon.svg', fav]]) {
    check(`${rel} 里没有 <text>/字体元素（字形必须是轮廓，不靠系统字体）`,
      !/<text|<tspan|font-family|font-size=/.test(s.markup), 'ok');
    check(`${rel} 里有非空的 path 轮廓`, s.d.length >= 1 && s.d.every((d) => d.length > 20), s.d.map((d) => d.length).join('/'));
  }
  eq('favicon 与启动图标是**两套不同形状**的资产（启动图标用 N1 的字形轮廓，favicon 另有极简记号）',
    n1.d.filter((d) => fav.d.includes(d)), []);
  check('favicon 的记号只用横竖线段（M/H/V/Z ⇒ 不含任何字形轮廓）',
    fav.d.every((d) => /^[MHVZ ]+$/.test(d.replace(/[-\d.,]/g, ''))),
    fav.d.join(' | '));
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
    // 内容修订不能落在已发布基底**之前**：§9 要求「新修订晚于已发布修订」。
    // 环境里给了已发布版本就派生 +1；没给才用默认值（默认值只是一个占位开发修订）。
    const publishedRev = process.env.SUOFEI_BASELINE_CONTENT_VERSION || null;
    const fallbackRev = publishedRev && /^\d{4}\.\d{2}\.\d{2}\.\d+$/.test(publishedRev)
      ? nextContentRevision(publishedRev) : '2026.10.18.1';
    console.log(`  现场编译的内容修订：${fallbackRev}（已发布基底：${publishedRev ?? '未提供'}）`);
    const child = spawn(NODE, [resolve(repoRoot, 'tools', 'build-content.mjs'),
      '--out', distPath, '--content-version', fallbackRev, '--order', 'source'], { stdio: 'inherit' });
    const code = await new Promise((r) => child.on('exit', r));
    if (code !== 0) throw new Error('tools/build-content.mjs 编译失败');
  }
  const distText = await readFile(distPath, 'utf8');
  const distDoc = JSON.parse(distText);
  // 基座必须是能渲染的**真实产物**：不能把 v1/v2 偷偷升版去冒充发布内容。
  // ⚠ 2026-10-18（标签字段集 v3）：本工作树里 C 线的编译产物还是 v2 ⇒ 走 `toV3TestDoc` 派生
  //   一份**明确标为夹具的 v3**（每首 tags: []、顶层 tags: []，**不给任何真实诗编造标签**）。
  //   C 线一旦真的编出 v3，这里自动直接用它（不再派生）。
  let baseText = distText;
  let baseDoc = distDoc;
  let baseIsFixture = distDoc.fixture === true || distDoc.placeholder === true;
  let baseOrigin = 'dist/content.json（真实产物，本身就是 formatVersion 3）';
  if (Number(distDoc.formatVersion) === 2) {
    baseDoc = toV3TestDoc(distDoc);
    baseText = `${JSON.stringify(baseDoc, null, 2)}\n`;
    baseIsFixture = true;
    baseOrigin = 'dist/content.json（真实 v2 产物）→ 派生 v3 测试夹具（fixture: true，未给任何诗编造标签）';
    console.log('⚠ dist/content.json 还是 formatVersion 2（C 线的 tags 字段未落）→ 用明确标为夹具的 v3 派生内容跑本轮。');
  } else if (Number(distDoc.formatVersion) !== 3) {
    throw new Error(`基座 dist/content.json 的 formatVersion 是 ${distDoc.formatVersion}，`
      + '既不是本壳支持的 3，也不是可派生的 2：不猜，直接失败（先跑 node tools/build-content.mjs）');
  }
  const total = baseDoc.poems.length;
  console.log(`\n基座内容：${baseOrigin}`);
  console.log(`  formatVersion=${baseDoc.formatVersion} contentVersion=${baseDoc.contentVersion} poems=${total}`
    + ` dynasties=${baseDoc.dynasties.join(',')} tags=${(baseDoc.tags ?? []).length}`);
  console.log(`  基座每首键集：${Object.keys(baseDoc.poems[0]).join(',')}`);

  const variants = buildVariants(baseDoc);
  for (const [k, v] of Object.entries(variants)) console.log(`  变体 ${k}: ${v.note}`);

  unitTests(baseDoc, variants);
  await inlineChecks(baseText);
  iconChecks();

  // ---- 各次部署的版本号一律从当前 APP_VERSION 派生（写死会撞车，见 nextAppVersion 注释）----
  section('1-1 部署版本派生自检（写死会与真发布的版本号撞车）');
  const deployVersions = {
    v2: nextAppVersion(APP_VERSION, 1),
    v3: nextAppVersion(APP_VERSION, 2),
    broken: nextAppVersion(APP_VERSION, 3),
    schemaBroken: nextAppVersion(APP_VERSION, 4),
    futureFormat: nextAppVersion(APP_VERSION, 5),
    good: nextAppVersion(APP_VERSION, 6),
  };
  const deployVersionList = Object.values(deployVersions);
  console.log(`  当前站点版本 v${APP_VERSION}；本轮部署版本：`
    + Object.entries(deployVersions).map(([k, v]) => `${k}=v${v}`).join(' '));
  check('派生的部署版本都与当前 APP_VERSION 不同（否则不会有「有新版本」）',
    deployVersionList.every((v) => v !== APP_VERSION),
    `APP_VERSION=${APP_VERSION} 派生=${dump(deployVersionList)}`);
  check('派生的部署版本互不相同',
    new Set(deployVersionList).size === deployVersionList.length, dump(deployVersionList));
  check('下一次部署的内容版本与基座不同（否则「新内容生效」的断言是空洞的）',
    variants.fixtureContent.doc.contentVersion !== baseDoc.contentVersion,
    `基座=${baseDoc.contentVersion} 部署内容=${variants.fixtureContent.doc.contentVersion}`);

  // ---- 部署 v1（真实内容，站点版本 APP_VERSION）----
  const v1 = await makeDeployment({ destDir: join(deployRoot, 'v1'), appVersion: APP_VERSION, contentText: baseText });
  await startServer(v1.destDir);
  console.log(`\n静态服务已启动：${BASE}（root=${v1.destDir}，站点版本 v${v1.appVersion}）`);

  console.log(`端口：静态服务 ${PORT}、CDP ${DEBUG_PORT}（可用 TEST_PORT / TEST_DEBUG_PORT 指定）`);
  userDataDir = await mkdtemp(join(tmpdir(), 'poetry-e2e-'));
  await assertPortFree(DEBUG_PORT, 'CDP 调试端口');
  chrome = spawn(CHROME_BIN, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    // 隐藏滚动条：与原型量测口径一致（视口宽＝布局宽），列宽公式/居中都用 V=innerWidth。
    '--hide-scrollbars',
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
  const browserInfo = await cdp.send('Browser.getVersion').catch(() => null);
  browserVersion = browserInfo ? `${browserInfo.product}（JS ${browserInfo.jsVersion ?? '?'}）` : null;
  console.log(`浏览器版本：${browserVersion ?? '浏览器没有回报版本'}`);

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
  // 阶段 A：HTML 一到就有可读状态（JS 还没跑也不白屏）。
  // 注意：这一步**不断言文案精确等于静态占位** —— JS 可能已经跑起来把文案换成「正在取内容」，
  // 两种都是对的；静态占位本身在 §0g 里从 index.html 源码直接断言过了。
  // 2026-10-16：外壳顶栏已删除 ⇒ 判「外壳到了」改用**静态装载占位**（index.html 里就有它）。
  await waitFor(`Boolean(document.querySelector('[data-test="view-loading"]'))`,
  { label: '装载提示可见（不是白屏）', timeout: 20000 });
  const staticInfo = await evaluate(`({
    loading: document.querySelector('[data-test="view-loading"]').textContent,
    hasRows: document.querySelectorAll('[data-test="poem-row"]').length,
    loadingShown: window.__app ? window.__app.summary().loading : null,
  })`);
  check('延迟下先看到可读的装载提示（不是白屏）',
    /正在/.test(staticInfo.loading), `loading=${dump(staticInfo.loading)}`);
  check('页面上有可读的装载提示（静态占位或 JS 的「正在取内容」都算）',
    /正在/.test(staticInfo.loading), `loading=${dump(staticInfo.loading)}`);
  eq('此刻还没有任何诗行（内容确实还没到）', staticInfo.hasRows, 0);
  // 阶段 B：JS 跑起来了、正在等内容 → 如实显示「正在取内容」
  await waitFor(`window.__app && window.__app.summary().loading === true && !window.__app.summary().hasDoc`,
    { label: 'JS 已运行且仍在等内容' });
  // 同一个 evaluate 里把「文案 + 是否还在等内容」一起读出来，避免两个往返之间内容刚好到达。
  const jsLoading = await evaluate(`({
    text: document.querySelector('[data-test="view-loading"]').textContent,
    loading: window.__app.summary().loading,
    hasDoc: window.__app.summary().hasDoc,
  })`);
  includes('并且如实显示正在取内容（内容确实单独取）', jsLoading.text, '正在取内容');
  eq('此刻内容仍未到达', [jsLoading.loading, jsLoading.hasDoc], [true, false]);
  await screenshot('01-loading-shell-first.png');

  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await waitFor(`${APP_READY} && Boolean(document.querySelector('[data-test="view-index"]'))`, { label: '内容到达并渲染目录' });
  // IF-44（用户 2026-10-15 定）：组这一层可折叠，且**首态全部收起**（单组也收起）——先查后展开。
  const firstState = await evaluate(`(() => {
    const heads = [...document.querySelectorAll('[data-test="dynasty-group-title"]')];
    return {
      groups: heads.length,
      allCollapsed: heads.length > 0 && heads.every(b => b.getAttribute('aria-expanded') === 'false'),
      visibleRows: [...document.querySelectorAll('[data-test="poem-row"]')].filter(r => r.offsetParent !== null).length,
      marks: heads.map(b => b.querySelector('[data-test="group-mark"]').textContent),
    };
  })()`);
  check('目录首态：组头是 `<button type=button>` ＋ aria-expanded=false（可折叠层，IF-44）',
    firstState.groups > 0 && firstState.allCollapsed, dump(firstState));
  eq('目录首态：可见诗目 0 行（首态全部收起，单组也收起）', firstState.visibleRows, 0);
  check('收起时记号＝[+]', firstState.marks.every((m) => m === '[+]'), dump(firstState.marks));
  await expandAllGroups();
  const expandedMarks = await evaluate(`[...document.querySelectorAll('[data-test="group-mark"]')].map(e => e.textContent)`);
  check('展开后记号＝[−]', expandedMarks.every((m) => m === '[−]'), dump(expandedMarks));
  let s = await summary();
  eq('站点标题（用户拍板的展示名）', await evaluate('document.title'), '索斐');
  eq('站点资源版本', s.appVersion, APP_VERSION);
  eq('内容版本（仅展示）', s.contentVersion, baseDoc.contentVersion);
  eq('诗数量', s.poems, total);
  eq('内容格式版本', s.formatVersion, baseDoc.formatVersion);
  if (baseIsFixture) {
    // 本轮基座是从真实 v2 产物**派生**的 v3 测试夹具（C 线 tags 字段还没落）⇒ 黄条**必须**出现，
    // 并明确说这是夹具 —— 不能把夹具当发布内容，也不能反向把真产物当成坏的。
    const noticeText = await evaluate(`(document.querySelector('[data-test="fixture-notice"]') || { innerText: '' }).innerText`);
    check('基座是派生的 v3 测试夹具 ⇒ 界面必须把它标出来（不把夹具当发布内容）',
      /夹具/.test(noticeText), dump(noticeText));
  } else {
    check('真实产物没有夹具黄条', !(await evaluate(`Boolean(document.querySelector('[data-test="fixture-notice"]'))`)));
  }
  // ⚠ 真实内容现在有三个组 ⇒ **按组**取行（拿全部 poem-row 当单组是更早的写法）。
  const groupRowTitles = (key) => evaluate(`(() => {
    const g = [...document.querySelectorAll('[data-test="dynasty-group"]')]
      .find((x) => x.dataset.dynastyKey === ${JSON.stringify(key)});
    return g ? [...g.querySelectorAll('[data-test="poem-row"] .poem-row-title')].map((e) => e.textContent) : [];
  })()`);
  eq('「汉」组目录的诗名次序 == 用户拍板的《文选》卷二十九原次序（19 首，确定性）',
    await groupRowTitles('汉'), SOURCE_ORDER_TITLES);
  eq('「近现代」组单独成组、只 1 首（用户新录入那首）', await groupRowTitles('近现代'), ['七律·和郭沫若同志']);
  eq('目录次序 == 产物数组次序（整串）', await domPoemIds(), expectedDomOrder(baseDoc));
  eq('「汉」组首尾两端', await evaluate(`(() => {
    const g = [...document.querySelectorAll('[data-test="dynasty-group"]')]
      .find((x) => x.dataset.dynastyKey === '汉');
    const t = [...g.querySelectorAll('[data-test="poem-row"] .poem-row-title')].map((e) => e.textContent);
    return [t[0], t[t.length - 1], t.length];
  })()`), ['行行重行行', '明月何皎皎', 19]);
  eq('真实产物第 1 首是 行行重行行 且 orderInSource === 1', [baseDoc.poems[0].title, baseDoc.poems[0].orderInSource], ['行行重行行', 1]);
  check('本机拼音重排不会把它排在第 1 位（所以上一条断言有牙齿）',
    fallbackOrder(baseDoc).indexOf(baseDoc.poems[0].id) !== 0, dump(fallbackOrder(baseDoc).slice(0, 3)));
  eq(`笔记全空：产物 ${baseDoc.poems.length} 首 notes 都是 null`, baseDoc.poems.filter((p) => p.notes !== null).length, 0);
  // （原读页脚状态面板；面板 2026-10-16 从产品 UI 移除 ⇒ 改读内部诊断 summary()，**不减弱**：
  //   仍要求「次序由产物决定」，并与下面的 DOM 次序断言合力。）
  check('组内次序由产物决定（内部诊断：orderMode.productOrderAuthoritative）',
    (await summary()).orderMode?.productOrderAuthoritative === true, dump((await summary()).orderMode));
  await pushDump('首访目录（真实内容）');
  await screenshot('02-index-real-content.png');

  // ------------------------------------------------ 1b 可分享 URL 形态（用户 2026-10-14 拍板：保持现状）
  section('1b 可分享 URL 形态：诗页深链接可直接打开、刷新仍在同一首');
  const deepPoem = baseDoc.poems[5];              // 挑一首非首首的，证明是按 id 定位、不是「碰巧第一首」
  await openFresh(`${BASE}#/p/${deepPoem.id}`);   // 真·新开一个文档落在这一首
  await waitForPoemView(deepPoem.id);
  eq('深链接直接打开就是这一首（按稳定 id 定位）',
    await evaluate(`document.querySelector('[data-test="view-poem"]').dataset.poemId`), deepPoem.id);
  // ⚠ 地址栏里是 **`ROUTES.poem(id)` ＝ `#/p/${encodeURIComponent(id)}`**（那也是浏览器对片段里非 ASCII
  // 的规范化结果）⇒ 期望值取 `ROUTES.poem`（唯一来源）；写死 `#/p/<中文 id>` 是 ASCII id 时代的写法。
  eq('地址栏用的是契约 id', await evaluate('location.hash'), ROUTES.poem(deepPoem.id));
  // ⚠ 旧断言「地址栏里没有把标题当路径（所以改标题不会让老链接失效）」的**前提已被取代**：
  // 用户 2026-10-16 已定 **C2（ID ＝ 相对内容根的完整相对路径、去 `.md`、`/`→`-`）** 并**接受旧 ASCII
  // 链接失效**（见 `docs/status.md`）⇒ ID 就是由文件名（诗题）拼出来的，**必然包含**诗题。
  // 改成断言「地址栏里是**整条契约 id**（含组目录前缀），不是裸诗题」—— 这才是现在还有牙的那半句。
  eq('地址栏里是整条契约 id（含组目录前缀），不是裸诗题',
    decodeURIComponent(await evaluate('location.hash')).slice('#/p/'.length), deepPoem.id);
  check('契约 id 确实与裸诗题不同（所以上一条不是空洞的）',
    deepPoem.id !== deepPoem.title, dump([deepPoem.id, deepPoem.title]));
  await reload();                                  // 刷新后仍定位到同一首
  await waitForPoemView(deepPoem.id);
  eq('刷新后仍在同一首',
    await evaluate(`document.querySelector('[data-test="view-poem"]').dataset.poemId`), deepPoem.id);
  eq('刷新后地址栏不变', await evaluate('location.hash'), ROUTES.poem(deepPoem.id));


  // ------------------------------------------------ 1c 诗页渲染（真实内容）
  section('1c 诗页渲染：全部居中／语义折行／无笔记整块隐藏；考据与来源搬去详情页');
  const p1 = baseDoc.poems[0];                                             // 行行重行行：8 行
  await hashTo(`#/p/${p1.id}`);
  await waitForPoemView(p1.id);
  eq('逐行文本与 JSON 完全一致',
    await evaluate(`[...document.querySelectorAll('[data-test="poem-line"]')].map(e => e.textContent)`), p1.stanzas.flat());
  eq('分节数量与 JSON 一致', await evaluate(`document.querySelectorAll('[data-test="stanza"]').length`), p1.stanzas.length);
  eq('每节的行数',
    await evaluate(`[...document.querySelectorAll('[data-test="stanza"]')].map(s => s.querySelectorAll('[data-test="poem-line"]').length)`),
    p1.stanzas.map((x) => x.length));
  eq('这些宽度下没有视觉折行（每个印刷行恰 1 个视觉行；折行规则另在 §0j 用纯函数钉住）',
    await evaluate(`[...document.querySelectorAll('[data-test="poem-line"]')].every(e => e.dataset.visualIndex === '0')`), true);
  eq('行元素 white-space=pre-wrap（防止行内空白被折叠）',
    await evaluate(`getComputedStyle(document.querySelector('[data-test="poem-line"]')).whiteSpace`), 'pre-wrap');

  // 全部居中（用户 2026-10-15 选 q-poem-align#d4-all）：题名／身份行／正文每一行都居中；
  // 顶部行**不参与居中**（返回左／详情右）。
  const centerInfo = await evaluate(`(() => ({
    title: getComputedStyle(document.querySelector('[data-test="poem-title"]')).textAlign,
    meta: getComputedStyle(document.querySelector('[data-test="poem-meta"]')).textAlign,
    lines: [...document.querySelectorAll('[data-test="poem-line"]')].map(e => getComputedStyle(e).textAlign),
    topRow: getComputedStyle(document.querySelector('[data-test="top-row"]')).justifyContent,
  }))()`);
  eq('题名居中', centerInfo.title, 'center');
  eq('身份行居中', centerInfo.meta, 'center');
  check('正文每一行都居中', centerInfo.lines.length > 0 && centerInfo.lines.every((t) => t === 'center'), dump(centerInfo.lines));
  eq('顶部行两端展开（返回左／详情右，不参与居中）', centerInfo.topRow, 'space-between');

  // 「真居中」不只查 text-align：用**文字盒**（Range）量每一行的中心与列中心之差（锚实测 0px；容差 ±1px）。
  const poemCentering = await evaluate(`(() => {
    const host = document.getElementById('view');
    const hr = host.getBoundingClientRect();
    const colCenter = (hr.left + hr.right) / 2;
    const textRect = (el) => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect(); };
    const dev = (el) => { const r = textRect(el); return Math.abs((r.left + r.right) / 2 - colCenter); };
    return {
      title: dev(document.querySelector('[data-test="poem-title"]')),
      meta: dev(document.querySelector('[data-test="poem-meta"]')),
      lineMax: Math.max(...[...document.querySelectorAll('[data-test="poem-line"]')].map(dev)),
    };
  })()`);
  check('题名文字盒中心 == 列中心（±1px）', poemCentering.title <= 1, dump(poemCentering));
  check('身份行文字盒中心 == 列中心（±1px）', poemCentering.meta <= 1, dump(poemCentering));
  check('正文每一个行盒中心 == 列中心（±1px；锚实测 0px）', poemCentering.lineMax <= 1, dump(poemCentering));

  eq('身份行＝作者 · 朝代 · 体裁（随新字段走）',
    await evaluate(`document.querySelector('[data-test="poem-meta"]').textContent`),
    [p1.author, p1.dynasty, p1.genre].filter(Boolean).join(' · '));

  // 笔记②：入口在顶部行、展开在正文下方内联无框；**无笔记整块隐藏**（用户 2026-10-16 定）。
  const noNotes = await evaluate(`({
    entry: Boolean(document.querySelector('[data-test="notes-entry"]')),
    panel: Boolean(document.querySelector('[data-test="notes-inline"]')),
    text: document.querySelector('[data-test="view-poem"]').innerText,
  })`);
  check('无笔记 ⇒ 整块隐藏（没有入口、没有面板）', noNotes.entry === false && noNotes.panel === false, dump(noNotes));
  check('无笔记 ⇒ 诗页可见文本里没有「笔记」二字', !noNotes.text.includes('笔记'));

  // 用户 2026-10-15 定：诗页**不要底本与来源**，它已搬到诗歌详情页。
  check('诗页不再有底本/来源块（已搬到详情页）',
    await evaluate(`Boolean(document.querySelector('[data-test="view-poem"] [data-test="source-block"]'))`) === false);
  check('诗页上没有「底本」字样',
    !(await evaluate(`document.querySelector('[data-test="view-poem"]').innerText`)).includes('底本'));
  check('诗页有「详情」入口（在顶部行右侧，与返回同一行）',
    await evaluate(`Boolean(document.querySelector('[data-test="view-poem"] [data-test="top-row"] [data-test="poem-detail-link"]'))`));
  eq('「详情」入口的地址是 `#/p/<id>/detail`',
    await evaluate(`document.querySelector('[data-test="poem-detail-link"]').getAttribute('href')`), ROUTES.detail(p1.id));

  // 关键反向断言：诗页**不得出现详情正文**（detail 只在详情页渲染）。
  // 对**每一首有 detail 的诗**都跑一遍（不是抽查），并加元素级断言。
  const poemsWithDetail = baseDoc.poems.filter((p) => typeof p.detail === 'string' && p.detail.trim() !== '');
  for (const poem of poemsWithDetail) {
    await hashTo(`#/p/${poem.id}`);
    await waitForPoemView(poem.id);
    const viewText = await evaluate(`document.querySelector('[data-test="view-poem"]').innerText`);
    check(`[${poem.title}] 诗页上没有详情正文元素`,
      await evaluate(`document.querySelectorAll('[data-test="view-poem"] [data-test="detail-body"]').length`) === 0);
    check(`[${poem.title}] 诗页页面上没有详情里的「异文」小标题`, !viewText.includes('异文'), dump(poem.detail.slice(0, 24)));
    check(`[${poem.title}] 诗页不出现底本/来源原文`, !viewText.includes(poem.source), dump([poem.source]));
    // 用户 2026-10-15 拍板：诗的 id 不上界面。
    check(`[${poem.title}] 页面上不出现诗的 id（${poem.id}）`, !viewText.includes(poem.id), dump({ id: poem.id }));
  }
  await hashTo(`#/p/${p1.id}`);
  await waitForPoemView(p1.id);
  await pushDump('诗页（真实内容；考据/来源与详情正文都不在这页）');
  await screenshot('03-poem-centered.png');

  // ------------------------------------------------ 1c-2 诗歌详情页（第四页）
  section('1c-2 诗歌详情页：诗题①左对齐 + 底本与来源①正文前带标签 + detail 的最小 Markdown 渲染');
  const noDetailPoems = baseDoc.poems.filter((p) => !(typeof p.detail === 'string' && p.detail.trim() !== ''));
  // ⚠ 2026-10-16（杜甫《梦李白二首》两条入库）：**不再写死 13 与首数** —— 期望值从内容的**唯一来源**
  //   `content/poems/` 派生（忽略规则与编译器 `tools/lib/scan.mjs`、Android 侧 `ContentSources` 同一套）。
  //   这比字面量**更强**：源文加了诗/详情而内置产物忘了重编 ⇒ 这里真报红
  //   （2026-10-14「内置仓库内容落后于内容源」的真实事故形态，当时谁也没发现）。
  const sourcePoemRel = readdirSync(resolve(repoRoot, 'content', 'poems'), { recursive: true })
    .map((rel) => String(rel).split(/[\\/]/).join('/'))
    .filter((rel) => rel.endsWith('.md'))
    .filter((rel) => {
      const name = rel.split('/').pop();
      return !name.startsWith('.') && !name.startsWith('_') && !name.startsWith('~')
        && !name.endsWith('~') && !/^README/i.test(name);
    });
  const sourcesWithDetail = sourcePoemRel.filter((rel) => readFileSync(resolve(repoRoot, 'content', 'poems', rel), 'utf8')
    .split('\n').some((l) => l.trim() === '## 详情'));
  eq('产物首数 == content/poems/ 的源文数（产物 == 源）', baseDoc.poems.length, sourcePoemRel.length);
  eq(`产物事实：带 detail 的诗 ${poemsWithDetail.length} 首、没有 detail 的诗 ${noDetailPoems.length} 首（期望值派生自源文的 \`## 详情\` 节，不写死）`,
    [poemsWithDetail.length, noDetailPoems.length], [sourcesWithDetail.length, sourcePoemRel.length - sourcesWithDetail.length]);
  let seenH3 = 0;
  let seenLi = 0;
  for (const poem of poemsWithDetail) {
    await hashTo(`#/p/${poem.id}/detail`);
    await waitFor(
      `Boolean(document.querySelector('[data-test="view-detail"]'))`
      + ` && document.querySelector('[data-test="view-detail"]').dataset.poemId === ${JSON.stringify(poem.id)}`,
      { label: `详情页就位（${poem.title}）` },
    );
    eq(`[${poem.title}] 详情页的底本与来源 == 产物 poem.source`,
      await evaluate(`document.querySelector('[data-test="detail-source"]').textContent`), poem.source || '未记录');
    const expectedH3 = [...poem.detail.matchAll(/^###\s+(.*)$/gm)].map((m) => m[1]);
    const gotH3 = await evaluate(`[...document.querySelectorAll('[data-test="detail-body"] [data-test="md-h3"]')].map(e => e.textContent)`);
    eq(`[${poem.title}] “### ”小标题逐条渲染`, gotH3, expectedH3);
    const expectedLi = [...poem.detail.matchAll(/^-\s+(.*)$/gm)].map((m) => m[1].replace(/\*\*/g, ''));
    const gotLi = await evaluate(`[...document.querySelectorAll('[data-test="detail-body"] [data-test="md-li"]')].map(e => e.textContent)`);
    eq(`[${poem.title}] “- ”列表项逐条渲染（去掉 ** 后文本一致）`, gotLi, expectedLi);
    seenH3 += gotH3.length;
    seenLi += gotLi.length;
  }
  check('逐个详情页累加出来的渲染条数 > 0（真实内容真的画出来了）', seenH3 > 0 && seenLi > 0, `h3=${seenH3} li=${seenLi}`);

  // D0（用户 2026-10-16 定）：诗题左对齐；来源在正文前；不重复身份信息；小标题无装饰竖线。
  await hashTo(`#/p/${p1.id}/detail`);
  await waitFor(`Boolean(document.querySelector('[data-test="view-detail"]'))`, { label: '详情页' });
  const d0 = await evaluate(`(() => {
    const body = document.querySelector('[data-test="detail-body"]');
    const h3 = body.querySelector('[data-test="md-h3"]');
    const src = document.querySelector('[data-test="source-block"]');
    const cs = (el) => getComputedStyle(el);
    return {
      titleAlign: cs(document.querySelector('[data-test="detail-title"]')).textAlign,
      hasMeta: Boolean(document.querySelector('[data-test="view-detail"] [data-test="poem-meta"]')),
      srcBeforeBody: Boolean(src.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING),
      srcLabel: src.querySelector('dt').textContent,
      h3Border: cs(h3).borderLeftWidth,
      h3Pad: cs(h3).paddingLeft,
      h3Size: cs(h3).fontSize,
      bodySize: cs(body).fontSize,
    };
  })()`);
  eq('D0① 诗题左对齐（与正文同一条左沿）', d0.titleAlign, 'left');
  eq('不重复身份信息（详情页没有身份行元素）', d0.hasMeta, false);
  eq('来源块在详情正文之前（正文前带标签）', d0.srcBeforeBody, true);
  eq('来源块的标签是「底本与来源」', d0.srcLabel, '底本与来源');
  eq('小标题无装饰竖线（border-left 0）', d0.h3Border, '0px');
  eq('小标题无竖线附带的左内边距（padding-left 0）', d0.h3Pad, '0px');
  eq('小标题是 eyebrow（13.5px）', d0.h3Size, '13.5px');
  eq('详情正文＝17px', d0.bodySize, '17px');

  // 行为：详情页的「返回」落到**那首诗**（不是目录）；深链接直开也一样（用户 2026-10-15 定）。
  await hashTo(`#/p/${p1.id}/detail`);
  await waitFor(`Boolean(document.querySelector('[data-test="view-detail"]'))`, { label: '详情页' });
  eq('详情页地址是 #/p/<id>/detail', await evaluate('location.hash'), ROUTES.detail(p1.id));
  eq('详情页「返回」指向那首诗', await evaluate(`document.querySelector('[data-test="back-to-poem"]').getAttribute('href')`), ROUTES.poem(p1.id));
  await evaluate(`document.querySelector('[data-test="back-to-poem"]').click(); true`);
  await waitForPoemView(p1.id);
  eq('从详情页返回 == 那首诗（不是目录）',
    await evaluate(`document.querySelector('[data-test="view-poem"]').dataset.poemId`), p1.id);
  // 真·新开一个文档直开详情页（深链接）：仍落到那一首的详情，返回也回那首诗
  const deepDetail = baseDoc.poems[7];
  await openFresh(`${BASE}#/p/${deepDetail.id}/detail`);
  await waitFor(`Boolean(document.querySelector('[data-test="view-detail"]'))`, { label: '深链接直开详情页' });
  eq('深链接直开详情页 == 那一首的详情（按稳定 id 定位）',
    await evaluate(`document.querySelector('[data-test="view-detail"]').dataset.poemId`), deepDetail.id);
  await evaluate(`document.querySelector('[data-test="back-to-poem"]').click(); true`);
  await waitForPoemView(deepDetail.id);
  eq('深链接直开详情页后返回 == 那首诗',
    await evaluate(`document.querySelector('[data-test="view-poem"]').dataset.poemId`), deepDetail.id);

  // 没有 detail 的诗：详情页仍有底本/来源，详情处如实说明（不编内容）
  const noDetailPoem = noDetailPoems[0];
  await hashTo(`#/p/${noDetailPoem.id}/detail`);
  await waitFor(`Boolean(document.querySelector('[data-test="view-detail"]'))`, { label: '无 detail 诗的详情页' });
  check(`[${noDetailPoem.title}] 没有 detail 时如实说明`,
    await evaluate(`Boolean(document.querySelector('[data-test="detail-empty"]'))`));
  eq(`[${noDetailPoem.title}] 没有 detail 时详情正文里没有块元素`,
    await evaluate(`document.querySelectorAll('[data-test="detail-body"] [data-test="md-h3"], [data-test="detail-body"] [data-test="md-li"]').length`), 0);
  eq(`[${noDetailPoem.title}] 底本与来源仍在详情页`,
    await evaluate(`document.querySelector('[data-test="detail-source"]').textContent`), noDetailPoem.source || '未记录');
  await pushDump('诗歌详情页（第 1 首）');
  await hashTo(`#/p/${p1.id}/detail`);
  await waitFor(`Boolean(document.querySelector('[data-test="view-detail"]'))`, { label: '详情页（截图）' });
  await screenshot('03b-poem-detail.png');

  // 回到目录：让后面的小节从已知状态开始（以前因为停在诗页 hash 上、reload 后等目录超时过）。
  await hashTo('#/');
  await waitForIndexExpanded();

  // ------------------------------------------------ 1c-3 「关于」页（第四页之一）
  section('1c-3 「关于」页：与 Android 同一批字段（唯一来源 web/about-fields.json）+ 目录入口 + 返回');
  // 唯一来源是**机器可读的文件**：这里既比 config.ABOUT 与它逐字一致，也比页面上的字段都在
  // （字段的**值**平台相关，不跨端比字面）。Android 端对着同一个文件比（`AboutFields`）。
  const aboutSpec = JSON.parse(readFileSync(resolve(repoRoot, 'web', 'about-fields.json'), 'utf8'));
  eq('config.ABOUT 与唯一来源 web/about-fields.json 逐字一致',
    ABOUT, { appName: aboutSpec.appName, repoUrl: aboutSpec.repoUrl, fields: aboutSpec.fields });
  // 4 项＝采纳锚（用户 `q-9f9eca3d`：应用名／应用版本／内容版本／仓库链接）；
  // 「一句话说明」与「诚实的限制」未采纳 ⇒ 不在共享字段集里（后者仍可在页脚状态面板里）。
  // 排布＝采纳锚 A3／V3（`items/app-ui/history/round-2026-10-16-about-min/` 的 ARCHIVE）：
  //   应用名当页标题、版本组（标签左对齐＝四条线合一）、仓库链接置底裸 URL；
  //   归档实测值：线 A 内容左沿 16.8px／线 D 值列左沿 93.02px（Web 无更新块 ⇒ 控件那两条线不适用）。
  eq('共享字段集＝采纳锚的 4 项', aboutSpec.fields, ['应用名', '应用版本', '内容版本', '仓库链接']);
  check('目录页有「关于」入口', await evaluate(`Boolean(document.querySelector('[data-test="about-link"]'))`));
  eq('「关于」入口的地址是 #/about',
    await evaluate(`document.querySelector('[data-test="about-link"]').getAttribute('href')`), '#/about');
  await evaluate(`document.querySelector('[data-test="about-link"]').click(); true`);
  await waitForAboutView();
  const aboutInfo = await evaluate(`(() => {
    const view = document.querySelector('[data-test="view-about"]');
    const hostL = document.querySelector('[data-test="view"]').getBoundingClientRect().left; /* 内容列左沿 */
    const r2 = (n) => Math.round(n * 100) / 100;
    /* 文字**墨迹**左沿（不是盒子左沿）：用 Range 量文本自身 —— V3 的「四条线」指的是文字左沿 */
    const inkLeft = (el) => {
      if (!el) return null;
      const rng = document.createRange();
      rng.selectNodeContents(el);
      return r2(rng.getBoundingClientRect().left - hostL);
    };
    const boxLeft = (el) => (el ? r2(el.getBoundingClientRect().left - hostL) : null);
    /* 字体只在元素存在时取（缺元素 ⇒ 断言拿到 null 报红，而不是在这里抛异常） */
    const fontOf = (sel) => {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el).fontFamily : null;
    };
    const group = document.querySelector('[data-test="about-version-group"]');
    const labels = [...group.querySelectorAll('[data-test="about-label"]')];
    const title = document.querySelector('[data-test="about-app-name"]');
    const repo = document.querySelector('[data-test="about-repo-url"]');
    return {
      labels: labels.map(e => e.textContent),
      appName: title ? title.textContent : null,
      appNameTag: title ? title.tagName : null,
      appVersion: document.querySelector('[data-test="about-app-version"]')?.textContent,
      contentVersion: document.querySelector('[data-test="about-content-version"]')?.textContent,
      repoUrl: repo ? repo.textContent : null,
      labelAligns: labels.map(e => getComputedStyle(e).textAlign),
      titleInkLeft: inkLeft(title),
      labelInkLefts: labels.map(inkLeft),
      valueLefts: [...group.querySelectorAll('[data-test="about-app-version"], [data-test="about-content-version"]')].map(boxLeft),
      repoInkLeft: inkLeft(repo),
      versionCount: group.querySelectorAll('.about-kv').length,
      dtCount: view.querySelectorAll('dt').length,
      hasAppNameLabel: view.textContent.includes('应用名'),
      hasRepoLabel: view.textContent.includes('仓库链接'),
      hasBrowserHint: view.textContent.includes('在浏览器打开'),
      groupBorderTopWidth: getComputedStyle(group).borderTopWidth,
      groupBg: getComputedStyle(group).backgroundColor,
      /* ——— 返修①②③ 的新观测口径 ——— */
      /* ① 仓库链接必须是**可点的链接**（C1）：拿到标签名与 href */
      repoTag: repo ? repo.tagName : null,
      repoHref: repo ? repo.getAttribute('href') : null,
      /* ② 只有**版本号本身**是等宽：值这一层与那一段各自取字体 */
      appVersionNum: document.querySelector('[data-test="about-app-version-num"]')?.textContent ?? null,
      appVersionValueFont: fontOf('[data-test="about-app-version"]'),
      appVersionNumFont: fontOf('[data-test="about-app-version-num"]'),
      contentVersionNumFont: fontOf('[data-test="about-content-version-num"]'),
      /* ③ 2026-10-16：全局外壳顶栏已删除 ⇒ 这一页只剩它自己的应用名页标题（下面按 bodyText 数次数） */
      siteHeaderExists: Boolean(document.querySelector('.site-header')),
      bodyText: document.body.innerText,
    };
  })()`);
  // A3 结构：标签行只剩「应用版本／内容版本」；应用名＝页标题（h1）；仓库链接＝置底裸 URL
  eq('关于页「标签行」＝唯一来源里的两项（应用版本／内容版本）', aboutInfo.labels, aboutSpec.fields.slice(1, 3));
  eq('共享字段集第 1 项（应用名）＝**页标题**（h1），不是标签行',
    { tag: aboutInfo.appNameTag, text: aboutInfo.appName }, { tag: 'H1', text: aboutSpec.appName });
  includes('应用版本 = 站点资源版本', aboutInfo.appVersion, APP_VERSION);
  includes('内容版本写明内容版本', aboutInfo.contentVersion, baseDoc.contentVersion);
  eq('共享字段集第 4 项（仓库链接）＝置底 C1 完整 URL', aboutInfo.repoUrl, aboutSpec.repoUrl);
  // ① 返修：C1 是**完整 URL 的链接**（用户 `q-about` 的 C1 就是 `<a href>`；没选的只是 C3 那句提示）。
  //    此前两端都把它降成不可点的纯文本 ⇒ 这里拿**标签名与 href**当牙齿，textContent 仍要比完整 URL。
  eq('返修①：仓库链接是**可点的 `<a>`**，href ＝唯一来源的完整 URL（可见文本仍是那条 URL）',
    { tag: aboutInfo.repoTag, href: aboutInfo.repoHref, text: aboutInfo.repoUrl },
    { tag: 'A', href: aboutSpec.repoUrl, text: aboutSpec.repoUrl });
  check('返修①：仓库链接改用链接色（采纳锚 `.repo` 的 accent-text），不是与正文同色的裸文本',
    aboutInfo.repoTag === 'A' && aboutInfo.repoHref === aboutSpec.repoUrl,
    dump({ tag: aboutInfo.repoTag, href: aboutInfo.repoHref }));
  check('关于页不再画「应用名」「仓库链接」两行标签（采纳锚 A3/V3：那两项分别是页标题与置底 URL）',
    aboutInfo.dtCount === 0 && !aboutInfo.hasAppNameLabel && !aboutInfo.hasRepoLabel,
    dump({ dtCount: aboutInfo.dtCount, hasAppNameLabel: aboutInfo.hasAppNameLabel, hasRepoLabel: aboutInfo.hasRepoLabel }));
  check('仓库链接不加「在浏览器打开」提示（C1）', !aboutInfo.hasBrowserHint,
    dump({ hasBrowserHint: aboutInfo.hasBrowserHint }));
  // ② 返修：归档原型里**只有版本号本身**是等宽（`.kv > .v > .ver { font-family: var(--font-mono) }`），
  //    值这一层与汉字说明文字都是常规字。此前 Web 把整串 `站点资源版本 v0.1.1` 都画成等宽 ⇒ 偏差。
  //    可见文字不变（仍是 `站点资源版本 v0.1.1`，同一个 data-test），改的只是「哪一段等宽」。
  check('返修②：版本值里**只有版本号**是等宽 —— 值这一层用的是常规字（不是 mono 字体栈）',
    aboutInfo.appVersionValueFont !== null && !/Consolas|mono/.test(aboutInfo.appVersionValueFont),
    dump({ appVersionValueFont: aboutInfo.appVersionValueFont }));
  check('返修②：版本号那一段（`v0.1.1`）仍是等宽',
    /Consolas|mono/.test(aboutInfo.appVersionNumFont ?? ''),
    dump({ appVersionNumFont: aboutInfo.appVersionNumFont }));
  eq('返修②：可见文字一字不改（值＝「站点资源版本 」＋版本号那一段，且版本号＝`v`＋APP_VERSION）',
    { value: aboutInfo.appVersion, num: aboutInfo.appVersionNum },
    { value: `站点资源版本 v${APP_VERSION}`, num: `v${APP_VERSION}` });
  check('返修②：内容版本那一格也**只把版本号**画等宽（`（尚未取到）`那种说明文字不进等宽段）',
    /Consolas|mono/.test(aboutInfo.contentVersionNumFont ?? ''),
    dump({ contentVersionNumFont: aboutInfo.contentVersionNumFont }));
  // ③ 2026-10-16：全局外壳顶栏已**整块删除** ⇒ 关于页上只剩它自己的应用名页标题一份，
  //    不可能再「品牌各出现两次」；下面改成钉「不存在外壳顶栏」＋「索斐恰好一次」。
  eq('关于页：页面上**没有**全局外壳顶栏', aboutInfo.siteHeaderExists, false);
  eq('关于页上「索斐」在**整页可见文本**里恰好出现一次（只有它自己的页标题那一份）',
    (aboutInfo.bodyText.match(/索斐/g) ?? []).length, 1);
  check('关于页上不再有「站点资源版本 0.1.1」那条独立外壳文字（值里仍是 `站点资源版本 v0.1.1`）',
    !aboutInfo.bodyText.includes(`站点资源版本 ${APP_VERSION}`),
    dump({ headerString: `站点资源版本 ${APP_VERSION}` }));
  // V3：四条线合一 —— 页标题／本条版本标签文字／仓库链接都落在**内容左沿**（归档实测 16.8px，容差 0.75）
  const near = (a, b, tol) => a !== null && Math.abs(a - b) <= tol;
  eq('关于页 V3：版本标签**左对齐**（采纳锚 V3）', aboutInfo.labelAligns, ['left', 'left']);
  check('关于页 V3 **四条线合一**：页标题／两条版本标签文字／仓库链接都落在内容左沿（归档实测 16.8px；容差 0.75）',
    near(aboutInfo.titleInkLeft, 16.8, 0.75)
      && aboutInfo.labelInkLefts.length === 2
      && aboutInfo.labelInkLefts.every(v => near(v, 16.8, 0.75))
      && near(aboutInfo.repoInkLeft, 16.8, 0.75),
    dump({ titleInkLeft: aboutInfo.titleInkLeft, labelInkLefts: aboutInfo.labelInkLefts, repoInkLeft: aboutInfo.repoInkLeft, expected: 16.8 }));
  // V3：两条版本值仍在**同一条值列**上（归档实测 93.02px；＝内容左沿 16.8 ＋ 标签列 68.22 ＋ 缝 8 ⇒ 离内容左沿 76.22）
  check('关于页 V3：两条版本值在同一**值列**上（归档实测 93.02px；离内容左沿 76.22px）',
    aboutInfo.versionCount === 2
      && near(aboutInfo.valueLefts[0], 93.02, 0.75)
      && aboutInfo.valueLefts[0] === aboutInfo.valueLefts[1],
    dump({ versionCount: aboutInfo.versionCount, valueLefts: aboutInfo.valueLefts, expected: 93.02 }));
  check('关于页不再有「一句话说明」与「诚实的限制」两行（未采纳；`q-9f9eca3d`）',
    !(await evaluate(`Boolean(document.querySelector('[data-test="about-tagline"]') || document.querySelector('[data-test="about-honest-limits"]'))`)));
  // ⚠ 2026-10-16：页脚诊断面板已从产品 UI 移除（用户实际预览时看到它并质问）⇒ 这条**反过来断言**：
  //   那段长诚实说明**不许出现在任何产品页面**（措辞原文保留在 `web/README.md` §4.5）。
  check('长诚实说明不再出现在产品 UI 里（页脚面板已移除；措辞只在 README §4.5）',
    !(await evaluate(`Boolean(document.querySelector('[data-test="honest-storage-note"]'))`))
      && !(await evaluate(`document.body.innerText.includes('离线副本不承诺永久保存')`)));
  check('关于页无区域框（版本组无边框、无底色；采纳锚 about-min）',
    aboutInfo.groupBorderTopWidth === '0px' && aboutInfo.groupBg === 'rgba(0, 0, 0, 0)',
    dump({ borderTopWidth: aboutInfo.groupBorderTopWidth, bg: aboutInfo.groupBg }));
  // ⚠ 历史：这条曾查 `[data-test="view-about"] [data-test="check-site-update"]` —— 那个按钮当时在**页脚状态面板**里
  //    （面板不在 view-about 内）⇒ 旧断言**恒真、什么都没证明**（我 2026-10-16 先改成查面板，后才收到用户裁决）。
  //    面板整块移除后 ⇒ 改查**整份文档**（不是某个子树的 descendants，避免恒真）。
  const updateAffordance = await evaluate(`({
    inFieldGroup: document.querySelectorAll('[data-test="view-about"] button').length,
    debugActionsInDocument: ['check-site-update', 'persist-storage', 'reload-content']
      .filter((t) => document.querySelector('[data-test="' + t + '"]')).length,
  })`);
  eq('关于页的**共享字段组**里没有更新控件（Web 的更新不在这页的字段组里；Android 在那页多一块）',
    updateAffordance.inFieldGroup, 0);
  eq('产品 UI 里没有任何调试动作按钮（整份文档查，不是只查关于页子树）',
    updateAffordance.debugActionsInDocument, 0);
  eq('关于页「返回」指向目录',
    await evaluate(`document.querySelector('[data-test="about-back-to-index"]').getAttribute('href')`), '#/');
  await evaluate(`document.querySelector('[data-test="about-back-to-index"]').click(); true`);
  await waitForIndexExpanded();
  // ③ 2026-10-16：全局外壳顶栏已**整块删除**（采纳锚：目录页顶部只有「关于」、不重复应用名）
  //    ⇒ 反向断言改成钉「目录页没有外壳顶栏／没有站点标题／整页可见文本里没有应用名」，
  //      并正向钉住「顶部就只有『关于』这一个入口」。
  const indexTop = await evaluate(`(() => {
    const entries = [...document.querySelectorAll('[data-test="index-bar"] a')];
    return {
      siteHeader: Boolean(document.querySelector('.site-header')),
      siteTitle: Boolean(document.querySelector('[data-test="site-title"]')),
      appNameCount: (document.body.innerText.match(/索斐/g) ?? []).length,
      entries: entries.map((a) => a.textContent),
    };
  })()`);
  eq('目录页：没有外壳顶栏、没有站点标题，且整页可见文本里「索斐」出现 0 次',
    [indexTop.siteHeader, indexTop.siteTitle, indexTop.appNameCount], [false, false, 0]);
  eq('目录页顶部只有「关于」这一个入口（就这一项）', indexTop.entries, ['关于']);
  await openFresh(`${BASE}#/about`);
  await waitForAboutView();
  eq('深链接直开 #/about 就是关于页', await evaluate('location.hash'), '#/about');
  await evaluate(`document.querySelector('[data-test="about-back-to-index"]').click(); true`);
  await waitForIndexExpanded();
  await pushDump('关于页');
  await hashTo('#/about');
  await waitForAboutView();
  await screenshot('03c-about.png');

  // ------------------------------------------------ 1c-3 全页面负向扫描：诊断面板不得以任何形式回到产品 UI
  //
  // 起因（2026-10-16，**用户实际预览时发现**）：整块「站点资源版本／缓存名／SW／内容体积与取到时间／
  // 格式／次序／网络／持久化配额」＋三个调试动作（检查站点更新／请求持久化存储／重新取内容）＋长诚实说明
  // 在**四页都显示**；它不是已采纳的 UI（`IF-46`：只有目录／诗／详情／关于）⇒ 已整块移除（非 CSS 隐藏）。
  // ⚠ 断言必须覆盖 **header／main／footer／notice 全页**，不能只查某个 view 子树：
  //   此前那条查 `view-about` 后代的负向断言就**恒真**过（那个面板本来就不在 view-about 里）。
  section('1c-3 全页面负向扫描：四页的 header/main/footer/notice 都不得出现诊断面板与调试动作');
  // ⚠ 「站点资源版本」**不列在这里**：它是关于页采纳锚的**合法可见文字**（标签「应用版本」＋值
  //   「站点资源版本 vX」，`render.js` 里逐字定下）⇒ 它单独按页断言（只允在关于页、且恰好一次）。
  const DIAG_WORDS = ['站点缓存', 'Service Worker', '内容版本（仅展示）', '内容体积',
    '内容生成时间', '内容取到时间', '内容格式版本', '组内次序', '持久化存储', '配额',
    '检查站点更新', '请求持久化存储', '重新取内容', '诚实说明'];
  const scanPage = () => evaluate(`(() => {
    const body = document.body;
    return {
      text: body.innerText,
      footers: body.querySelectorAll('footer').length,
      statusNodes: document.querySelectorAll('[data-test^="status"]').length,
      debugActions: ['check-site-update', 'persist-storage', 'reload-content']
        .filter((t) => document.querySelector('[data-test="' + t + '"]')).length,
      siteHeader: Boolean(document.querySelector('.site-header')),
      siteTitle: Boolean(document.querySelector('[data-test="site-title"]')),
      hasView: Boolean(document.querySelector('[data-test="view"]')),
      hasNotices: Boolean(document.querySelector('[data-test="notices"]')),
      appVersionSpan: Boolean(document.getElementById('app-version')),
    };
  })()`);
  const scanPoem = baseDoc.poems.find((p) => p.detail) ?? baseDoc.poems[0];
  /** 整页截图（含视口之外）：先**滚到底**（顺便就是「滚到底也没面板」那一步）、再截、再回到顶部。 */
  const fullPageShot = async (name) => {
    await evaluate(`window.scrollTo(0, document.documentElement.scrollHeight); true`);
    await sleep(200);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, 20000);
    await writeFile(resolve(artifactsDir, name), Buffer.from(data, 'base64'));
    await evaluate('window.scrollTo(0, 0); true');
    return name;
  };
  const scanPages = [
    ['目录页', '#/', 'view-index', 'index', async () => { await waitForIndexExpanded(); }],
    ['诗页', `#/p/${scanPoem.id}`, 'view-poem', 'poem', async () => { await waitForPoemView(scanPoem.id); }],
    ['详情页', `#/p/${scanPoem.id}/detail`, 'view-detail', 'detail',
      async () => { await waitFor(`Boolean(document.querySelector('[data-test="view-detail"]'))`, { label: '详情页' }); }],
    ['关于页', '#/about', 'view-about', 'about', async () => { await waitForAboutView(); }],
  ];
  for (const [label, hash, viewTest, slug, ensure] of scanPages) {
    await hashTo(hash);
    await ensure();
    const got = await scanPage();
    eq(`[${label}] 全页可见文本里没有诊断面板词汇（${DIAG_WORDS.length} 个词全查）`,
      DIAG_WORDS.filter((w) => got.text.includes(w)), []);
    eq(`[${label}] 「站点资源版本」只允在关于页出现、且恰好一次`,
      (got.text.match(/站点资源版本/g) ?? []).length, label === '关于页' ? 1 : 0);
    eq(`[${label}] 页面里没有 <footer> 面板`, got.footers, 0);
    eq(`[${label}] 文档里没有 status 元素、也没有调试动作按钮`,
      [got.statusNodes, got.debugActions], [0, 0]);
    eq(`[${label}] 外壳／视图区／通知区都在，且当前视图正是 ${viewTest}`,
      [got.hasView, got.hasNotices,
        await evaluate(`Boolean(document.querySelector('[data-test="${viewTest}"]'))`)],
      [true, true, true]);
    eq(`[${label}] 页面里没有外壳顶栏与站点标题（外壳顶栏已整块删除）`,
      [got.siteHeader, got.siteTitle], [false, false]);
    eq(`[${label}] 外壳里没有页脚用的版本徽标（版本只在关于页）`, got.appVersionSpan, false);
    // 整页证据图（含滚到底）：给人看的，也是这个缺陷的回归底片。
    await fullPageShot(`no-panel-${slug}.png`);
  }
  // 正向对照（防「把版本／内容整个删掉也能过」）：版本确实在关于页，目录确实渲染出 19 首。
  await hashTo('#/about');
  await waitForAboutView();
  eq('正向对照：关于页确实显示应用版本（不是把版本整个删了）',
    await evaluate(`document.querySelector('[data-test="about-app-version-num"]').textContent`), `v${APP_VERSION}`);
  await hashTo('#/');
  await waitForIndexExpanded();
  eq('正向对照：目录仍渲染出全部诗（上面那组不是因页面空白才过的）',
    await evaluate(`document.querySelectorAll('[data-test="poem-row"]').length`), total);

  // ------------------------------------------------ 1c-4 IF-45：返回目录恢复原位置
  section('1c-4 IF-45：从诗页返回目录恢复原滚动位置；深链接直开目录仍从顶部');
  await hashTo('#/');
  await waitForIndexExpanded();
  // 判定依据先落盘（环境/浏览器/视口/文档高度）：失败时能分清「环境差异」与「恢复逻辑」。
  const if45Env = await evaluate(`({ vis: document.visibilityState, innerWidth, innerHeight, dpr: devicePixelRatio,
    docH: document.documentElement.scrollHeight, rows: document.querySelectorAll('[data-test="poem-row"]').length })`);
  console.log('  IF-45 基线：' + JSON.stringify({ browser: browserVersion, ...if45Env }));
  const scrolledY = await evaluate(`(() => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, Math.min(400, Math.max(0, max)));
    return window.scrollY;
  })()`);
  check('目录可滚动（scrollY > 0）', scrolledY > 0, `scrollY=${scrolledY}（max=${if45Env.docH - if45Env.innerHeight}）`);
  check('真实内容目录里没有「有笔记」字样（用户 2026-10-15：两端都不要这个标记）',
    !(await evaluate(`document.querySelector('[data-test="view-index"]').innerText`)).includes('有笔记'));
  const scrollTarget = baseDoc.poems[6];
  await evaluate(`document.querySelector('[data-test="poem-row"][data-poem-id=${JSON.stringify(scrollTarget.id)}]').click(); true`);
  await waitForPoemView(scrollTarget.id);
  eq('进入诗页后从顶部开始（不带目录的滚动量）', await evaluate('window.scrollY'), 0);
  // IF-45 的**记忆侧**：离开目录时是否真的把位置记住了。把它单独断言出来，
  // 失败时就不会只是一个「等恢复超时」的死胡同（能分清是没记住还是没恢复）。
  const rememberedY = await evaluate('window.__app.summary().listScroll.index.y');
  eq('离开目录时记住了当时的滚动位置（IF-45 的记忆侧）', rememberedY, scrolledY);
  await evaluate(`document.querySelector('[data-test="back-to-index"]').click(); true`);
  // 恢复侧：**不改超时**，只把轨迹记下来当证据（这是定位 flake/bug 的材料，不是掩蔽）。
  const if45 = await waitForScrollRestore(scrolledY, 5000);
  await waitForIndexExpanded();
  check('返回目录恢复了原来的滚动位置', if45.ok,
    `scrollY=${if45.snapshot?.y}（期望 ≈${scrolledY}）耗时 ${if45.ms}ms；轨迹=${dump(if45.trace.slice(0, 6))}`);
  check('返回目录时没有把「记住的位置」搞丢（记忆侧在恢复后仍对得上）',
    if45.snapshot?.mem === scrolledY, dump({ mem: if45.snapshot?.mem, want: scrolledY }));
  await openFresh(`${BASE}#/`);
  await waitForIndexExpanded();
  eq('深链接直开目录仍从顶部（IF-45 的另一半）', await evaluate('window.scrollY'), 0);

  // ------------------------------------------------ 1d 视觉令牌逐值对齐（静默终端）
  section('1d 视觉令牌逐值对齐（静默终端；不靠人看，逐项比对）');
  // 唯一来源：**评审通过的原型 CSS**（规范文档由它整理；这里直接读它的令牌声明）。
  // 刻意不人眼比对、也不正则解析散文 —— 后者已经被证明一改措辞就红（且报错没信息）。
  const protoCss = await readFile(resolve(repoRoot, 'prototype', 'css', 'theme-tech.css'), 'utf8');
  const protoBlock = /html\[data-theme='tech'\]\s*\{([\s\S]*?)\n\}/.exec(protoCss);
  check('能读到原型主题的令牌块', Boolean(protoBlock), protoBlock ? `${protoBlock[1].length} 字符` : '没找到');
  const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
  const protoTokens = new Map();
  if (protoBlock) {
    for (const m of protoBlock[1].matchAll(/--([a-z-]+):\s*([^;]+);/g)) protoTokens.set(m[1], norm(m[2]));
  }
  const rootValues = await evaluate(`(() => {
    const cs = getComputedStyle(document.documentElement);
    const out = {};
    for (const name of ${JSON.stringify([...protoTokens.keys()].map((n) => `--${n}`))}) out[name] = cs.getPropertyValue(name);
    return out;
  })()`);
  const undeclared = [];
  const mismatched = [];
  for (const [name, want] of protoTokens) {
    const got = norm(rootValues[`--${name}`] ?? '');
    if (got === '') undeclared.push(name);
    else if (got !== want) mismatched.push(`--${name}: 原型=「${want}」 本站=「${got}」`);
  }
  eq('原型里的每个令牌，本站都有声明', undeclared, []);
  eq('本站令牌值与原型逐项一致', mismatched, []);
  check(`令牌数量合理（原型共 ${protoTokens.size} 项）`, protoTokens.size >= 40, `${protoTokens.size} 项`);

  // 计算值层（浏览器实际用的值）：颜色/行高/字距/段间距/阴影/动画/过渡/网格
  await hashTo(`#/p/${p1.id}`);
  await waitForPoemView(p1.id);
  const poemVis = await evaluate(`(() => {
    const cs = (el, p) => getComputedStyle(el, p);
    const line = document.querySelector('[data-test="poem-line"]');
    const stanzas = [...document.querySelectorAll('[data-test="stanza"]')];
    return {
      bodyBg: cs(document.body).backgroundColor,
      bodyColor: cs(document.body).color,
      bodyShadow: cs(document.body).boxShadow,
      bodyTextShadow: cs(document.body).textShadow,
      bodyAnimation: cs(document.body).animationName,
      patternImage: cs(document.body, '::before').backgroundImage,
      patternPosition: cs(document.body, '::before').position,
      lineSize: parseFloat(cs(line).fontSize),
      lineHeight: parseFloat(cs(line).lineHeight),
      lineSpacing: parseFloat(cs(line).letterSpacing),
      lineFont: cs(line).fontFamily,
      lineWhite: cs(line).whiteSpace,
      stanzaGap: stanzas.length > 1 ? parseFloat(cs(stanzas[1]).marginTop) : null,
      titleBorderBottom: cs(document.querySelector('[data-test="poem-title"]')).borderBottomStyle,
      metaBorderBottom: cs(document.querySelector('[data-test="poem-meta"]')).borderBottomStyle,
    };
  })()`);
  eq('页面底色 = --bg（#0e1315）', poemVis.bodyBg, 'rgb(14, 19, 21)');
  eq('正文颜色 = --text（#dde5e4）', poemVis.bodyColor, 'rgb(221, 229, 228)');
  eq('无阴影（--shadow: none）', [poemVis.bodyShadow, poemVis.bodyTextShadow], ['none', 'none']);
  eq('没有关键帧动画（不做位移动画）', poemVis.bodyAnimation, 'none');
  // 注意：计算值会把 alpha 0.028 取整显示成 0.027、把 transparent 写成 rgba(0, 0, 0, 0)，
  // 所以这里按数值容差断言（这是「无法逐字符对齐」的那一类，见 README §5 的诚实边界）。
  const gridAlphas = [...poemVis.patternImage.matchAll(/rgba\(255, 255, 255, ([0-9.]+)\)/g)].map((m) => Number(m[1]));
  check('极淡 1px 网格在（方向线各一条、alpha≈0.028、fixed 铺满）',
    gridAlphas.length === 2 && gridAlphas.every((a) => Math.abs(a - 0.028) <= 0.002) && poemVis.patternPosition === 'fixed',
    `alphas=${dump(gridAlphas)}（浏览器把 0.028 显示成 0.027）position=${poemVis.patternPosition}`);
  eq('正文字号 = --poem-size（17px）', poemVis.lineSize, 17);
  eq('正文行高 = --poem-lh × 字号（2 → 34px）', poemVis.lineHeight, 34);
  check('正文行高恰好是字号的 2 倍（不被行高取整带偏）',
    Math.abs(poemVis.lineHeight - poemVis.lineSize * 2) < 0.01, `${poemVis.lineHeight} / ${poemVis.lineSize}`);
  check('正文字距 = --poem-ls（0.045em → 0.765px）', Math.abs(poemVis.lineSpacing - 17 * 0.045) < 0.02,
    `letterSpacing=${poemVis.lineSpacing}px`);
  check('正文全无衬线（sans-serif，没有 serif 回退）',
    /sans-serif/.test(poemVis.lineFont) && !/serif/.test(poemVis.lineFont.replace(/sans-serif/g, '')), poemVis.lineFont);
  eq('正文仍然 pre-wrap（行内空白不被折叠）', poemVis.lineWhite, 'pre-wrap');
  eq('--stanza-gap 令牌值为 1.2em（不为 0）',
    await evaluate(`getComputedStyle(document.documentElement).getPropertyValue('--stanza-gap').trim()`), '1.2em');
  check(`真实产物 ${baseDoc.poems.length} 首都是单节，所以段间空行的**元素级**断言在 §4e（夹具诗）上做`,
    baseDoc.poems.every((p) => p.stanzas.length === 1),
    `最大节数=${Math.max(...baseDoc.poems.map((p) => p.stanzas.length))}`);
  eq('详情来源块字号 = --note-size（13.5px）',
    (await evaluateOnDetail(p1.id, `getComputedStyle(document.querySelector('[data-test="detail-source"]')).fontSize`)),
    '13.5px');
  check('详情来源块行高 = 1.85 × 13.5px（与 .source-block 一致）',
    Math.abs((await evaluateOnDetail(p1.id, `parseFloat(getComputedStyle(document.querySelector('[data-test="detail-source"]')).lineHeight)`)) - 13.5 * 1.85) < 0.3);

  await hashTo('#/');
  await waitForIndexExpanded();
  const indexVis = await evaluate(`(() => {
    const cs = (el) => getComputedStyle(el);
    const row = document.querySelector('[data-test="poem-row"]');
    // ⚠ 2026-10-16：页脚诊断面板移除后，目录页上**没有** .btn 了（以前那个「检查站点更新」是唯一按钮），
    //   而下面几条断言量的是 **.btn 这条样式规则**（无阴影、过渡只含颜色类）⇒ 用**临时合成节点**量、
    //   量完立即移除。与宽度实测里量 .about-repo 同一条路，不靠「页上碰巧有个按钮」。
    //   （注释里不能写反引号：这段整块是模板字符串，反引号会提前结束它。）
    const probeEl = document.createElement('button');
    probeEl.className = 'btn';
    document.body.append(probeEl);
    const ps = getComputedStyle(probeEl);
    const chipStyle = {
      transition: [ps.transitionProperty, ps.transitionDuration],
      shadow: ps.boxShadow,
      radius: ps.borderTopLeftRadius,
    };
    probeEl.remove();
    const groupTitle = document.querySelector('.dynasty-group-title');
    const label = document.querySelector('[data-test="dynasty-label"]');
    return {
      rowBgHoverable: cs(row).borderBottomColor,
      rowShadow: cs(row).boxShadow,
      rowAnimation: cs(row).animationName,
      rowTransition: [cs(row).transitionProperty, cs(row).transitionDuration],
      chipTransition: chipStyle.transition,
      chipShadow: chipStyle.shadow,
      chipRadius: chipStyle.radius,
      groupBg: cs(groupTitle).backgroundColor,
      groupRadius: cs(groupTitle).borderTopLeftRadius,
      labelBorderLeftWidth: cs(label).borderLeftWidth,
      labelPadLeft: cs(label).paddingLeft,
      countText: document.querySelector('.dynasty-count').innerText.trim(),
      countBrackets: (() => {
        const b = document.querySelector('.dynasty-count b');
        const c = (p) => getComputedStyle(b, p);
        return [c('::before').content, c('::before').color, c('::before').fontSize, c('::before').marginRight,
          c('::after').content, c('::after').marginLeft];
      })(),
      countFont: cs(document.querySelector('.dynasty-count')).fontFamily,
    };
  })()`);
  eq('组头不画卡片（背景透明）', indexVis.groupBg, 'rgba(0, 0, 0, 0)');
  // （原先还有一条「下沉面 = --surface-sunken」量的是页脚面板里的列表背景；面板已移除 ⇒ 随它一并去掉。）
  eq('组头无卡片/无圆角', indexVis.groupRadius, '0px');
  eq('列表行与按钮（`.btn` 规则，用合成探针量）都没有阴影', [indexVis.rowShadow, indexVis.chipShadow], ['none', 'none']);
  eq('列表行没有关键帧动画', indexVis.rowAnimation, 'none');
  eq('列表行过渡属性只有颜色类', indexVis.rowTransition[0], 'border-color, background');
  eq('按钮过渡属性只有颜色类', indexVis.chipTransition[0], 'color, border-color');
  check('过渡时长都是 0.15s（--chip-transition / --row-transition）',
    [indexVis.rowTransition[1], indexVis.chipTransition[1]]
      .every((d) => d.split(',').map((x) => x.trim()).every((x) => x === '0.15s')),
    dump([indexVis.rowTransition[1], indexVis.chipTransition[1]]));
  check('过渡里没有 transform/opacity/all（不做位移动画）',
    [indexVis.rowTransition[0], indexVis.chipTransition[0]].every((p) => /^(border-color|background|color)(, (border-color|background|color))*$/.test(p)),
    dump([indexVis.rowTransition[0], indexVis.chipTransition[0]]));
  check('组名没有左沿发丝竖线（与采纳锚一致：组名左沿＝题名左沿＝槽宽）',
    indexVis.labelBorderLeftWidth === '0px' && indexVis.labelPadLeft === '0px',
    dump({ borderLeftWidth: indexVis.labelBorderLeftWidth, paddingLeft: indexVis.labelPadLeft }));
  check('组内计数用等宽字体', /mono|Consolas/i.test(indexVis.countFont), indexVis.countFont);

  // ---- 目录对齐口径（采纳锚 hub-align / width-pct §4，逐项量出来）----
  const hubGeom = await evaluate(`(() => {
    const host = document.getElementById('view');   // .view-host ＝内容列（列宽 C，居中）
    const hostRect = host.getBoundingClientRect();
    const head = document.querySelector('[data-test="dynasty-group-title"]');
    const hostLeft = hostRect.left;
    const mark = head.querySelector('[data-test="group-mark"]');
    const label = document.querySelector('[data-test="dynasty-label"]');
    const title = document.querySelector('[data-test="poem-row"] .poem-row-title');
    const author = document.querySelector('[data-test="poem-row"] .poem-row-author');
    const rowRight = document.querySelector('[data-test="poem-row"]').getBoundingClientRect().right;
    const r = (el) => el.getBoundingClientRect();
    return {
      slot: r(head.querySelector('.gh-slot')).width,
      markLeftFromColumn: r(mark).left - hostLeft,
      labelLeftFromColumn: r(label).left - hostLeft,
      titleLeftFromColumn: r(title).left - hostLeft,
      seam: r(label).left - r(mark).right,
      markCenterDelta: (r(mark).top + r(mark).bottom) / 2 - (r(label).top + r(label).bottom) / 2,
      authorAfterTitle: r(author).left - r(title).right,
      authorRightVsRowRight: rowRight - r(author).right,
    };
  })()`);
  check('记号槽宽 ≈ 27.52px（1.72rem，不随宽度变）', Math.abs(hubGeom.slot - 27.52) < 0.6, `slot=${hubGeom.slot}`);
  // 列宽口径（width-pct 轮已选）：C = min(V, max(320, 0.88 × (V − 24)))，24 是一次性扣除总量。
  const colInfo = await evaluate(`(() => {
    const v = window.innerWidth;
    const c = Math.min(v, Math.max(320, 0.88 * (v - 24)));
    const hr = document.getElementById('view').getBoundingClientRect();
    return {
      v, c,
      cssC: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--c')),
      hostWidth: hr.width,
      hostLeft: hr.left,
    };
  })()`);
  check('列宽口径 C=min(V,max(320,0.88×(V−24)))：实测列宽 == 公式值',
    Math.abs(colInfo.hostWidth - colInfo.c) < 0.5, dump(colInfo));
  check('--c 与公式一致', Math.abs(colInfo.cssC - colInfo.c) < 0.5, dump(colInfo));
  check('列外余白 = (V−C)/2（不是两侧各 12px 页边）',
    Math.abs(colInfo.hostLeft - (colInfo.v - colInfo.c) / 2) < 0.6,
    dump({ hostLeft: colInfo.hostLeft, expected: (colInfo.v - colInfo.c) / 2 }));
  check('记号左沿 ≈ 内容列左沿（悬挂在组名左沿之外）', Math.abs(hubGeom.markLeftFromColumn) < 1.5, dump(hubGeom.markLeftFromColumn));
  check('记号右沿 → 组名左沿的固定缝 ≈ 6.39px（0.4rem）', Math.abs(hubGeom.seam - 6.39) < 2, `seam=${hubGeom.seam}`);
  check('记号与组名首字竖直居中（盒中心差 < 1px）', Math.abs(hubGeom.markCenterDelta) < 1, `Δ=${hubGeom.markCenterDelta}`);
  check('诗目题名与组名首字同一竖线（缩进 0，±1px）',
    Math.abs(hubGeom.titleLeftFromColumn - hubGeom.labelLeftFromColumn) <= 1,
    dump({ labelLeft: hubGeom.labelLeftFromColumn, titleLeft: hubGeom.titleLeftFromColumn }));
  check('作者紧随题名、不右对齐（远达不到右内沿）',
    hubGeom.authorAfterTitle >= 0 && hubGeom.authorRightVsRowRight > 40,
    dump({ gap: hubGeom.authorAfterTitle, rightToRowRight: hubGeom.authorRightVsRowRight }));

  // ---- 结构记号：计数方括号（规范 §4.1 记号②）与题头无下划线（记号③）。
  // ⚠ §4.1 记号①（组名左沿发丝竖线）与采纳锚相抵，已在上面按采纳锚改为「无竖线」；
  //    这一条差异在报告里单列请负责人裁决（Android 侧仍是旧口径）。
  // 注：`innerText` **不包含**伪元素生成的文字（实测 countText="19 首"），所以「渲染成 [19] 首」
  // 由伪元素断言 + 截图共同证明（横幅那条不是靠 innerText）。
  check('结构记号 2：计数在浏览器里渲染成 [19] 首（方括号来自伪元素）',
    indexVis.countBrackets[0] === '"["' && !indexVis.countText.includes('['),
    `innerText=${dump(indexVis.countText)}（不含伪元素）::before=${indexVis.countBrackets[0]}`);
  eq('结构记号 2：方括号来自伪元素（::before/::after）',
    [indexVis.countBrackets[0], indexVis.countBrackets[4]], ['"["', '"]"']);
  check('结构记号 2：括号色 --text-faint、字号 0.85em、内外各 1px',
    indexVis.countBrackets[1] === 'rgb(120, 138, 136)'
    && Math.abs(parseFloat(indexVis.countBrackets[2]) - 1.05 * 16 * 0.85) < 0.1
    && indexVis.countBrackets[3] === '1px' && indexVis.countBrackets[5] === '1px',
    dump(indexVis.countBrackets));
  eq('结构记号 3：诗页题头不画下划线（题名与题下那行都没有下边框；本站没有 .poem-head 包裹层）',
    [poemVis.titleBorderBottom, poemVis.metaBorderBottom], ['none', 'none']);

  // ------------------------------------------------ 9. 视觉截图（原型口径）
  section('1e 视觉截图（口径同原型 tools/shots.sh：桌面 1280×860@2x、手机 430×932@2x）');
  const shootTheme = async (w, h, label) => {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: false });
    await hashTo('#/');
    await waitForIndexExpanded();
    await screenshot(`theme-tech-${label}-hub.png`);
    await hashTo(`#/p/${p1.id}`);
    await waitForPoemView(p1.id);
    await screenshot(`theme-tech-${label}-poem.png`);
  };
  await shootTheme(1280, 860, 'desktop');
  await shootTheme(430, 932, 'mobile');
  await cdp.send('Emulation.clearDeviceMetricsOverride');
  await hashTo('#/');
  await waitForIndexExpanded();
  console.log('  截图：theme-tech-{desktop,mobile}-{hub,poem}.png'
    + '（与原型 screenshots/desktop-*.png、mobile-*.png 同口径）');

  // ---------------------------------------------------------------- 2. 站点缓存 = 壳 + 内容成对
  section('2 站点缓存：壳与内容在同一个 cache 里成对；独立内容通道已不存在');
  const expectedCache = resourceCacheName(APP_VERSION);
  // 首访时「内容先到、SW 还在装」是可能的（两者并行），所以这里**等缓存真的就位**，
  // 而不是取一次快照就跟期望值比。
  await waitForSiteCaches([expectedCache]);
  await waitForCacheEntry(expectedCache, `/${CONTENT_URL}`);
  const entries = await cacheEntries(expectedCache);
  eq('站点缓存名 = 前缀 + 站点版本 + 内容修订', await siteCaches(), [expectedCache]);
  check('缓存名里含**内容修订**（同 app 版本重发内容时，浏览器才会因此装新 SW）',
    expectedCache === `pc-resources-${APP_VERSION}+${CONTENT_REVISION}`, dump({ expectedCache, CONTENT_REVISION }));
  check('缓存里有外壳', entries.some((p) => p.endsWith('/index.html'))
    && entries.some((p) => p.endsWith('/app/main.js')) && entries.some((p) => p.endsWith('/styles.css')), dump(entries));
  check('缓存里有 content.json（内容与壳同一份清单、同一个 cache）',
    entries.some((p) => p.endsWith(`/${CONTENT_URL}`)), dump(entries));
  // 图标是**独立文件**（不再是内联 data: URI）⇒「离线首屏不缺图标」只能靠预缓存真的取到它们。
  // 逐项断言（不是抽查一个）：少一个图标就会在离线时掉图。
  const iconPaths = DEPLOY_FILES.filter((f) => f.startsWith('icons/'));
  eq(`预缓存里 ${iconPaths.length} 个图标都在（离线首屏图标不会缺）`,
    iconPaths.filter((p) => !entries.some((e) => e.endsWith(`/${p}`))), []);
  // （原读页脚面板；面板已移除 ⇒ 改读内部诊断 summary() 的 sw.cache：不减弱，仍要求「缓存里含 content.json」。）
  await waitFor(`window.__app.summary().sw.cache && window.__app.summary().sw.cache.hasContent === true`,
    { label: '内部诊断：缓存报告里含 content.json' });
  check('内部诊断的缓存报告里含 content.json',
    (await summary()).sw.cache?.hasContent === true, dump((await summary()).sw.cache));
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
  await hashTo('#/');            // 显式回目录：reload 落在哪个 hash 就渲染哪个视图，不依赖上一节留下的状态
  await reload();
  await waitForIndexExpanded();

  // ---------------------------------------------------------------- 3. 真离线
  section('3 真离线（CDP 断网 + 关掉本地服务）下重载仍可读');
  await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await stopServer();
  check('本地 HTTP 服务确实已经关掉', await isServerDown());
  await reload();
  await waitForIndexExpanded();
  s = await summary();
  check('浏览器报告离线', s.online === false);
  check('离线重载后目录照常渲染、且没有错误状态（缓存命中，不是白屏也不是失败页）',
    (await evaluate(`Boolean(document.querySelector('[data-test="poem-row"]'))`))
      && !(await evaluate(`Boolean(document.querySelector('[data-test="view-error"]'))`)));
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
  await waitForIndexExpanded();

  // ---------------------------------------------------------------- 4. 两版本切换
  section('4 真发两版：新 SW 安装并等待 / 不打断阅读 / 点刷新成对切换 / 旧 cache 被删');
  const v2App = deployVersions.v2;
  const v2 = await makeDeployment({ destDir: join(deployRoot, 'v2'), appVersion: v2App, contentText: variants.fixtureContent.text });
  console.log(`部署 v2：appVersion=${v2App} cache=${v2.cacheName} 内容 ${variants.fixtureContent.doc.poems.length} 首（含测试夹具诗）`);
  await redeploy(v2.destDir);

  // 4a 旧 SW 还在控制：页面仍是旧壳 + 旧内容（即使服务器已经是新版本）
  await reload();
  await waitForIndexExpanded();
  s = await summary();
  eq('服务器已换成 v2，但页面仍是旧壳（cache-first：不能旧壳配新内容）', s.appVersion, APP_VERSION);
  eq('页面内容也仍是旧内容（末首仍是产物末首）', (await evaluate(`[...document.querySelectorAll('[data-test="poem-row"] .poem-row-title')].map(e => e.textContent)`)).at(-1), baseDoc.poems.at(-1).title);
  // 只断言「旧 cache 还在服务」，**不**断言此刻只有它 —— 新 SW 可能已经装好、新 cache 已就绪，
  // 那是完全正常的（旧的在服务、新的在等）。取一次快照跟期望值比，就是上一版假红的来源。
  const cachesAfterRedeploy = await siteCaches();
  check('旧站点缓存仍在服务', cachesAfterRedeploy.includes(expectedCache), dump(cachesAfterRedeploy));

  // 4b 新版本被发现并等待（提示 + 不自动刷新）
  await waitFor(`Boolean(document.querySelector('[data-test="update-available"]'))`, { label: '出现「有新版本」提示' });
  includes('提示写明不会自动刷新',
    await evaluate(`document.querySelector('[data-test="update-available-text"]').textContent`), '不会自动刷新');
  await waitFor(`window.__app.summary().sw.waitingVersion === ${JSON.stringify(v2App)}`,
    { label: '问到 waiting SW 的站点版本' });
  s = await summary();
  eq('新版本在等待（waiting SW 的站点版本已问到）', s.sw.waitingVersion, v2App);
  await waitForSiteCaches([expectedCache, v2.cacheName], '新旧两个站点缓存同时存在');
  eq('两个缓存同时存在：旧的在服务、新的已就绪', await siteCaches(), [expectedCache, v2.cacheName].sort());
  await waitForCacheEntry(v2.cacheName, `/${CONTENT_URL}`);
  const newCacheContent = JSON.parse(await cacheText(v2.cacheName, `/${CONTENT_URL}`));
  eq('新缓存里的内容是新版本（新缓存内部也是成对的）', newCacheContent.contentVersion, variants.fixtureContent.doc.contentVersion);
  eq('新缓存里有新壳', (await cacheEntries(v2.cacheName)).some((p) => p.endsWith('/app/main.js')), true);
  eq('生效的仍是旧版本（新版本只是就绪）', s.contentVersion, baseDoc.contentVersion);
  check('内部诊断：有新版本在等待（sw.waitingVersion 已问到且 update.available）',
    s.sw.waitingVersion === v2App && s.update.available === true,
    dump({ waiting: s.sw.waitingVersion, update: s.update }));
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
  // 版本现在**只在「关于」页**显示（页脚那个版本徽标随面板一并移除）⇒ 到关于页读它，下面现有那步会回到目录。
  await hashTo('#/about');
  await waitForAboutView();
  eq('界面上的站点版本也换了（关于页显示的就是新版本）',
    await evaluate(`document.querySelector('[data-test="about-app-version-num"]').textContent`), `v${v2App}`);
  check('新版本生效后提示消失', !(await evaluate(`Boolean(document.querySelector('[data-test="update-available"]'))`)));
  await hashTo('#/');
  await waitForIndexExpanded();
  eq('切换后目录次序 == 新产物数组次序', await domPoemIds(), expectedDomOrder(variants.fixtureContent.doc));
  eq('新内容生效：末首变成测试夹具诗', (await evaluate(`[...document.querySelectorAll('[data-test="poem-row"] .poem-row-title')].map(e => e.textContent)`)).at(-1), '测试夹具诗（非诗文）');
  // 旧内容已不在：目录的可见文本里不得再出现被删掉的那一首（用户 2026-10-15 起界面已无搜索，
  // 所以这里直接查目录文本，不再借搜索过滤）。
  check(`旧内容已不在：旧内容的末首（${baseDoc.poems.at(-1).title}）不再出现在目录里`,
    !(await evaluate(`document.querySelector('[data-test="view-index"]').innerText`)).includes(baseDoc.poems.at(-1).title));
  await waitForSiteCaches([v2.cacheName], '旧 cache 已删除、只剩新 cache');
  eq('旧 cache 已被新 SW 删掉', await siteCaches(), [v2.cacheName]);
  check('部署内容带夹具标记 → 界面明确标出（不是发布内容）',
    await evaluate(`document.querySelector('[data-test="fixture-notice"]').innerText.includes('测试夹具')`));
  await screenshot('06-after-update.png');

  section('4e 新版本里的渲染路径：空行分段 + 笔记按需展开（夹具诗）');
  await hashTo('#/');
  await waitForIndexExpanded();
  const fixturePoem = variants.fixtureContent.doc.poems.find((p) => p.id === 'fixture-test-poem-01');
  // 目录行「有笔记」标记已按用户 2026-10-15 的决定删掉（两端都无）。
  // 这一版内容里确实有一首带笔记（下面是牙齿），所以「目录文本里没有「有笔记」」不是空断言。
  check('夹具诗确实带笔记（下面那条反向断言才有牙齿）', Boolean(fixturePoem.notes));
  check('目录文本里没有「有笔记」字样（即便这一版内容里有带笔记的诗）',
    !(await evaluate(`document.querySelector('[data-test="view-index"]').innerText`)).includes('有笔记'));
  check('目录页此时确实列出了那首带笔记的夹具诗（否则上面一条会空洞地通过）',
    (await evaluate(`[...document.querySelectorAll('[data-test="poem-row"]')].map(r => r.dataset.poemId)`))
      .includes('fixture-test-poem-01'));
  await evaluate(`document.querySelector('[data-test="poem-row"][data-poem-id="fixture-test-poem-01"]').click()`);
  await waitForPoemView('fixture-test-poem-01');
  eq('分节数量与 JSON 一致（空行表达的分段）', await evaluate(`document.querySelectorAll('[data-test="stanza"]').length`), fixturePoem.stanzas.length);
  eq('每节里的**印刷行**数与 JSON 一致（视觉折行不改变印刷行）',
    await evaluate(`[...document.querySelectorAll('[data-test="stanza"]')].map(s => [...new Set([...s.querySelectorAll('[data-test="poem-line"]')].map(e => e.dataset.printedLine))].length)`),
    fixturePoem.stanzas.map((x) => x.length));
  // 把视觉折行拼回印刷行，必须与原文逐行相同（折行不删字/不加字）——
  // 这是**浏览器里**的折行证据（纯函数的规则另在 §0j 钉住）。
  const printedTexts = await evaluate(`(() => {
    const out = [];
    for (const s of document.querySelectorAll('[data-test="stanza"]')) {
      const byLine = new Map();
      for (const e of s.querySelectorAll('[data-test="poem-line"]')) {
        const k = e.dataset.printedLine;
        if (!byLine.has(k)) byLine.set(k, []);
        byLine.get(k).push(e.textContent);
      }
      out.push(...[...byLine.values()].map((parts) => parts.join('')));
    }
    return out;
  })()`);
  eq('把视觉折行拼回去 == 原文逐行（折行不删字/不加字）', printedTexts, fixturePoem.stanzas.flat());
  // ⚠ 先把**前提**本身断言掉（2026-10-16 加）：这两条的成立靠「那行比列宽还宽」。
  //   CI runner 上曾因为没有中文字体、汉字被量成很窄 ⇒ 整行装得下、根本没折 ⇒ 报出来的却是
  //   「pieces.length > 1 失败」，看了半天才知道是字体。现在把前提显式量出来（canvas 用同一 font 字符串），
  //   不成立就带着数位报红——**不是跳过、也没有放松结论断言**。
  const foldPremise = await evaluate(`(() => {
    const lineEls = [...document.querySelectorAll('[data-test="poem-line"]')]
      .filter(e => e.dataset.printedLine === '3');
    // 用**渲染出来的那些片段拼回去**的那条印刷行（与上面「拼回去 == 原文」逐字一致），
    // 而不是去索引夹具数组——省得索引错位时量到别的短行（我自己先踩了一次）。
    const printed = lineEls.map((e) => e.textContent).join('');
    // 用**真实 DOM 探针**量（不用 canvas：computed font 里包含 line-height，canvas.font 会
    // **静默拒收**那个值、退回默认 10px —— 我自己先踩了一次：量出 238px，正好是「45 字 × 10px 字宽」。）
    const cs = getComputedStyle(lineEls[0]);
    const probe = document.createElement('span');
    probe.textContent = printed;
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.whiteSpace = 'nowrap';
    probe.style.fontFamily = cs.fontFamily;
    probe.style.fontSize = cs.fontSize;
    probe.style.fontWeight = cs.fontWeight;
    probe.style.fontStyle = cs.fontStyle;
    probe.style.letterSpacing = cs.letterSpacing;
    document.body.append(probe);
    const textWidth = probe.getBoundingClientRect().width;
    probe.remove();
    const avail = document.querySelector('[data-test="poem-body"]').clientWidth;
    return { chars: printed.length, textWidth, avail, fontSize: cs.fontSize, fontFamily: cs.fontFamily };
  })()`);
  check('前提：那行印刷行的实测宽度真的超过列宽（否则折行断言毫无意义）',
    foldPremise.textWidth > foldPremise.avail, dump(foldPremise));
  const foldInfo = await evaluate(`(() => {
    const pieces = [...document.querySelectorAll('[data-test="poem-line"]')]
      .filter(e => e.dataset.printedLine === '3')
      .map(e => e.textContent);
    const allCenter = [...document.querySelectorAll('[data-test="poem-line"]')].every(e => getComputedStyle(e).textAlign === 'center');
    return { pieces, allCenter };
  })()`);
  check('超宽夹具行在浏览器里真的被拆成多个视觉行', foldInfo.pieces.length > 1, dump(foldInfo.pieces));
  check('折行在句读后断（第一段以「：」结尾）', foldInfo.pieces[0].endsWith('：'), dump(foldInfo.pieces));
  check('折出来的每个视觉行都继承居中', foldInfo.allCenter, 'ok');
  const gapPx = await evaluate(`parseFloat(getComputedStyle(document.querySelectorAll('[data-test="stanza"]')[1]).marginTop)`);
  check('第二节与第一节之间有间距（空行由 stanzas 分段表达）', gapPx > 0, `marginTop=${gapPx}px`);
  check('段间距 = --stanza-gap（1.2em × 17px = 20.4px）', Math.abs(gapPx - 17 * 1.2) < 0.2, `marginTop=${gapPx}px`);
  eq('笔记默认收起（面板 hidden、入口 aria-expanded=false）',
    await evaluate(`document.querySelector('[data-test="notes-inline"]').hidden`), true);
  eq('笔记入口在顶部行内（与返回同一行）',
    await evaluate(`Boolean(document.querySelector('[data-test="top-row"] [data-test="notes-entry"]'))`), true);
  await evaluate(`document.querySelector('[data-test="notes-entry"]').click(); true`);
  await waitFor(`document.querySelector('[data-test="notes-inline"]').hidden === false`, { label: '笔记展开' });
  const notes = await evaluate(`({
    listItems: [...document.querySelectorAll('[data-test="notes-body"] [data-test="md-li"]')].length,
    bold: [...document.querySelectorAll('[data-test="notes-body"] strong')].map(e => e.textContent),
    rawHtmlShown: document.querySelector('[data-test="notes-body"]').innerText.includes('<b>不应被当作标签</b>'),
    parsedTags: document.querySelectorAll('[data-test="notes-body"] b').length,
  })`);
  eq('笔记列表项数', notes.listItems, 2);
  eq('最小 Markdown 子集：**粗体** → strong', notes.bold, ['粗体']);
  check('笔记里的 HTML 原样显示（不解析、不注入）', notes.rawHtmlShown && notes.parsedTags === 0, dump(notes));

  // 夹具诗的 detail 行使了 `### ` / `1. ` / `> `（真实内容只有 `### ` 与 `- `）：
  // 这是 Markdown 闭集里那三样在真实页面上的落地证据。
  await evaluate(`document.querySelector('[data-test="poem-detail-link"]').click(); true`);
  await waitFor(`Boolean(document.querySelector('[data-test="view-detail"]'))`, { label: '夹具诗详情页' });
  const fxMd = await evaluate(`({
    h3: [...document.querySelectorAll('[data-test="detail-body"] [data-test="md-h3"]')].map(e => e.textContent),
    ol: [...document.querySelectorAll('[data-test="detail-body"] [data-test="md-ol"] li')].map(e => e.textContent),
    quote: [...document.querySelectorAll('[data-test="detail-body"] [data-test="md-quote"]')].map(e => e.textContent),
  })`);
  eq('`### ` 三级标题渲染成小标题块', fxMd.h3, ['夹具详情']);
  eq('`1. ` 有序列表逐项渲染', fxMd.ol, ['夹具有序列表第一项', '夹具有序列表第二项']);
  check('`> ` 引用渲染成引用块', fxMd.quote.length === 1 && fxMd.quote[0].includes('夹具引用块'), dump(fxMd.quote));
  await pushDump('夹具诗（笔记已展开；详情已渲染）');

  // ---------------------------------------------------------------- 5. 回目录后自动切换
  section('5 第三个版本：阅读中只有提示，回到目录后自动切换');
  const v3App = deployVersions.v3;
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
  await waitForIndexExpanded();
  s = await summary();
  eq('回到目录后自动切到 v3', s.appVersion, v3App);
  eq('内容也回到真实产物那一版', s.contentVersion, baseDoc.contentVersion);
  eq('目录次序 == 真实产物数组次序', await domPoemIds(), expectedDomOrder(baseDoc));
  await waitForSiteCaches([v3.cacheName], '旧 cache 已删除、只剩 v3 的 cache');
  eq('只留下 v3 的站点缓存', await siteCaches(), [v3.cacheName]);
  await screenshot('07-auto-after-back.png');

  // ---------------------------------------------------------------- 6. 失败状态
  section('6 失败状态：非法 JSON / 结构不合法 / 格式版本不兼容（各发一版）');
  const failureCases = [
    {
      appVersion: deployVersions.broken,
      contentText: variants.broken.text,
      expect: '不是合法 JSON',
      label: '截断的非法 JSON',
      hint: '损坏',
    },
    {
      appVersion: deployVersions.schemaBroken,
      contentText: variants.schemaBroken.text,
      expect: '结构校验失败',
      label: '合法 JSON 但结构不合法',
      hint: '结构不符合契约',
    },
    {
      appVersion: deployVersions.futureFormat,
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
    await waitFor(`Boolean(document.querySelector('[data-test="view"]'))`, { label: '外壳仍在（视图区已挂上）' });
    await waitForErrorView();
    const text = await errorText();
    includes(`[${c.label}] 失败状态说清原因`, text, c.expect);
    check(`[${c.label}] 外壳与失败状态仍然渲染（不是白屏）`,
      (await evaluate(`Boolean(document.querySelector('[data-test="view"]'))`))
      && (await evaluate(`Boolean(document.querySelector('[data-test="view-error"]'))`)));
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
  // 等重试真的跑完（loading 回到 false、失败状态重新出现），而不是睡固定时间再取快照。
  await waitFor(`!window.__app.summary().loading && Boolean(document.querySelector('[data-test="error-text"]'))`,
    { label: '重试完成、仍是失败状态' });
  eq('重试后仍是同一失败原因', await errorText(), beforeRetry);
  await screenshot('09-error-after-retry.png');

  section('6c 发布一版好的内容 → 自愈');
  const v7 = await makeDeployment({ destDir: join(deployRoot, 'v7'), appVersion: deployVersions.good, contentText: baseText });
  await redeploy(v7.destDir);
  await reload();
  await waitFor(`Boolean(document.querySelector('[data-test="update-available"]'))`, { label: 'v7 新版本提示' });
  const tokenBeforeV7 = await docToken();
  await evaluate(`document.querySelector('[data-test="apply-update"]').click(); true`);
  await waitForNewDocument(tokenBeforeV7, 'v7 切换后新文档');
  await waitForIndexExpanded();
  s = await summary();
  eq('恢复后的站点版本', s.appVersion, deployVersions.good);
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
  await waitFor(`Boolean(document.querySelector('[data-test="view"]'))`, { label: '外壳仍能从缓存到达' });
  await waitForErrorView();
  includes('内容缺失 + 离线 → 应用如实报错（HTTP 状态）', await errorText(), 'HTTP');
  check('外壳仍在（不是白屏），并且给出重试', await evaluate(`Boolean(document.querySelector('[data-test="view"]')) && Boolean(document.querySelector('[data-test="retry-load"]'))`));
  await pushDump('内容缺失 + 离线（应用自己的失败状态）');
  await screenshot('10-missing-content-offline.png');

  section('7b 连外壳都没了（清掉整个站点缓存 + 注销 SW）→ 只能靠网络的错误页');
  await evaluate(`(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) await reg.unregister();
    for (const k of await caches.keys()) await caches.delete(k);
  })()`);
  check('站点缓存确实清空了（上面那个 await 的删除循环的直接结果）', (await cacheKeys()).length === 0);
  await cdp.send('Page.navigate', { url: BASE });
  // 等服务不可达的错误页真的接上（外壳与 __app 都不存在），而不是睡固定时间再取快照。
  await waitFor(`!window.__app && !document.querySelector('[data-test="view"]')`,
    { label: '错误页接上（没有外壳、没有应用）', timeout: 15000 }).catch(() => {});
  const deadState = await evaluate(`({
    hasShell: Boolean(document.querySelector('[data-test="view"]')),
    hasApp: Boolean(window.__app),
  })`).catch(() => ({ hasShell: null, hasApp: null, unreachable: true }));
  check('没有外壳可缓存 + 服务不可达 ⇒ 应用没机会显示任何东西（浏览器只能给错误页）',
    deadState.hasShell === false || deadState.unreachable === true, dump(deadState));
  await screenshot('11-no-shell-offline.png');
  await startServer(v7.destDir);
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

  section('7c 恢复服务后重新访问 → 重新缓存并正常阅读（自愈）');
  await goto(BASE);
  await waitForIndexExpanded();
  s = await summary();
  eq('重新访问后内容版本', s.contentVersion, baseDoc.contentVersion);
  eq('重新访问后有完整 19 首', s.poems, total);
  await waitForNonEmptyCache(v7.cacheName, '重新访问后新 cache 开始写入');
  await waitForSiteCaches([v7.cacheName], '重新访问后站点缓存重建');
  await waitForCacheEntry(v7.cacheName, '/content.json');
  eq('重新访问后站点缓存重新建立', await siteCaches(), [v7.cacheName]);
  eq('缓存里重新含 content.json', (await cacheEntries(v7.cacheName)).some((p) => p.endsWith('/content.json')), true);

  // ---------------------------------------------------------------- 8. 收尾断言
  section('8 常量一致与运行时无异常');
  const swSource = await readFile(resolve(webRoot, 'sw.js'), 'utf8');
  eq('sw.js APP_VERSION ←→ app/config.js', /const APP_VERSION = '([^']+)'/.exec(swSource)?.[1], APP_VERSION);
  eq('sw.js CACHE_PREFIX ←→ app/config.js', /const CACHE_PREFIX = '([^']+)'/.exec(swSource)?.[1], 'pc-resources-');
  eq('sw.js CONTENT_REVISION ←→ app/config.js', /const CONTENT_REVISION = '([^']+)'/.exec(swSource)?.[1], CONTENT_REVISION);
  const cacheNameLine = (/const CACHE_NAME = [^;]+;/.exec(swSource) || [])[0];
  check('sw.js 的缓存名 = 前缀 + 应用版本 + 内容修订（两个版本常量都要参与）',
    ['CACHE_PREFIX', 'APP_VERSION', 'CONTENT_REVISION'].every((k) => String(cacheNameLine).includes(k)), dump(cacheNameLine));
  const removedLine = (/const removed = [^;]+;/.exec(swSource) || [])[0];
  check('activate 只删**同前缀**的旧 cache（不碰别人的数据）',
    String(removedLine).includes('startsWith(CACHE_PREFIX)') && String(removedLine).includes('!== CACHE_NAME'), dump(removedLine));
  eq('deploy 目录里没有测试/脚本文件', DEPLOY_FILES.filter((f) => f.startsWith('tests/') || f.startsWith('scripts/') || f.startsWith('fixtures/')), []);
  check('整轮没有未捕获异常 / JS 级 error 日志', pageErrors.length === 0, pageErrors.join(' | ') || '（无）');
  const shotsOk = screenshotAttempts.length - screenshotFailures.length;
  console.log(`\n截图：${shotsOk}/${screenshotAttempts.length} 成功`
    + (screenshotFailures.length ? `；失败：${screenshotFailures.join(' / ')}` : ''));

  await writeFile(resolve(artifactsDir, 'dom-dumps.txt'), domDump.join('\n\n'), 'utf8');
  console.log('\n产物：web/tests/artifacts/（截图 + dom-dumps.txt + deploy/ 各版本部署目录，均已 gitignore）');

  // ---------------------------------------------------------------- 9. format 2 → format 3（真·旧基底）
  //
  // 本轮过渡的实质**不是「加了多少首诗」**：线上已发布的基底 `.26` 与本轮新内容**都是 22 首**，
  // 差别在 **formatVersion 2 → 3**（每首多 `tags: []`、顶层多 `tags: [{id, members}]`）、内容修订号，
  // 以及壳本身（format2 壳只认 2，format3 壳只认 3）。所以下面盯的是四件事：
  //   ① 两端的**格式身份/资源身份**（formatVersion、contentVersion、sha256、缓存名）；
  //   ② **版本门两个方向都受控**：旧壳不读 3、新壳不读 2 —— 如实报原因，不渲染、不猜；
  //   ③ **成对发布**：新修订 ⇒ 新 sw.js 字节 ⇒ 新 cache（壳+内容同批），旧 cache 的字节**从头到尾没变**；
  //   ④ 接受之后 v3 真能渲染（22 首 + 「古诗十九首」19 首照产物顺序）；半套部署**装不上**且不污染现有缓存。
  //
  // ⚠ 上一轮的写法（本节曾写「20 首 → 22 首」「旧缓存名只有前缀＋应用版本」）**已作废**：
  //   已发布基底 `.26` 就是 22 首、而且缓存名里**已经带修订段**。拿首数差当过渡证据是空的。
  section('9 format 2 → format 3：真·旧基底（已发布那一对字节）→ 本轮新内容（formatVersion 3）');
  const sha256 = (text) => createHash('sha256').update(Buffer.from(String(text), 'utf8')).digest('hex');
  const readConstFrom = (text, name) => new RegExp(`(?:const|export const) ${name} = '([^']*)'`).exec(text)?.[1] ?? null;
  /** 版本号逐段比较（`YYYY.MM.DD.N` 与 `x.y.z` 都是逐段数值）。 */
  const revCmp = (a, b) => {
    const x = String(a).split('.').map(Number);
    const y = String(b).split('.').map(Number);
    for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
      if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
    }
    return 0;
  };
  const baselineEnv = readBaselineFromEnv();
  const baselineRequired = process.env.SUOFEI_REQUIRE_BASELINE === '1';
  if (!baselineEnv.ok) {
    const msg = '旧基底没提供（' + baselineEnv.reason + '）⇒ 本节**没跑**：「format 2 → format 3」的过渡没验';
    if (baselineRequired) check('本模式要求验「旧 → 新」更新链（旧基底必须提供）', false, msg);
    else console.log('SKIP  ' + msg);
  } else {
    const pageErrsBefore = pageErrors.length;
    const oldText = await readFile(resolve(baselineEnv.webDir, 'content.json'), 'utf8');
    const oldDoc = JSON.parse(oldText);
    const oldSha = sha256(oldText);
    const oldCfgText = await readFile(resolve(baselineEnv.webDir, 'app/config.js'), 'utf8');
    const oldSwText = await readFile(resolve(baselineEnv.webDir, 'sw.js'), 'utf8');
    const oldAppVersion = readConstFrom(oldCfgText, 'APP_VERSION');
    const oldRev = readConstFrom(oldCfgText, 'CONTENT_REVISION');
    const oldSupported = Number((/SUPPORTED_FORMAT_VERSION = (\d+)/.exec(oldCfgText) || [])[1]);
    // 两边的缓存名预期值：**各自由自己那一对字节的常量算出来**（不把版本号写死在断言里）。
    const oldCacheName = `${RESOURCE_CACHE_PREFIX}${oldAppVersion}+${oldRev}`;
    const newCacheName = `${RESOURCE_CACHE_PREFIX}${APP_VERSION}+${baseDoc.contentVersion}`;
    console.log('  旧基底 tag：' + baselineEnv.tag);
    console.log(`  旧（已发布）：appVersion=${oldAppVersion} 修订=${oldRev} cache=${oldCacheName}`
      + ` formatVersion=${oldDoc.formatVersion} 首数=${oldDoc.poems.length} sha256=${oldSha}`);
    console.log(`  新（本轮树）：appVersion=${APP_VERSION} 修订=${baseDoc.contentVersion} cache=${newCacheName}`
      + ` formatVersion=${baseDoc.formatVersion} 首数=${baseDoc.poems.length} sha256=${sha256(baseText)}`);

    // ---- 9a 两端的格式身份与资源身份（纯字节证据，不碰浏览器）----
    eq('旧内容就是线上已发布的那一份（contentVersion == 环境声明）', oldDoc.contentVersion, baselineEnv.contentVersion);
    if (baselineEnv.contentSha256) eq('旧内容字节就是线上快照（sha256 == 环境声明）', oldSha, baselineEnv.contentSha256);
    eq('旧基底是 formatVersion 2（本轮过渡的**起点**）', Number(oldDoc.formatVersion), 2);
    eq('本轮产物是 formatVersion 3（本轮过渡的**终点**）', Number(baseDoc.formatVersion), 3);
    eq('旧壳字节里写着自己只支持 formatVersion 2（不是「以为自己是 3」）', oldSupported, 2);
    eq('本树的壳只支持 formatVersion 3', SUPPORTED_FORMAT_VERSION, 3);
    eq('旧壳的 sw.js 与 config.js 修订常量一致（否则缓存名不唯一）', readConstFrom(oldSwText, 'CONTENT_REVISION'), oldRev);
    eq('旧缓存名 == 前缀＋应用版本＋修订段（线上那一个，期望值由旧字节的常量算）', oldCacheName,
      `${RESOURCE_CACHE_PREFIX}${oldAppVersion}+${oldRev}`);
    check('旧缓存名确实带修订段（`.26` 就是带修订发布的；「只由前缀＋应用版本组成」的旧断言已作废）',
      oldRev !== null && oldRev !== 'dev' && oldCacheName.endsWith('+' + oldRev), dump({ oldRev, oldCacheName }));
    eq('两版首数**相同**（本轮不是「多两首」：别拿首数差当过渡证据）', oldDoc.poems.length, baseDoc.poems.length);
    check('旧内容没有顶层 tags 字段（format 2 没有这一层）', oldDoc.tags === undefined, dump(Object.keys(oldDoc)));
    eq('旧内容每首的键集里也没有 tags（format 2 的键集）',
      oldDoc.poems.filter((p) => p.tags !== undefined).length, 0);
    check('新内容每首都带 tags 数组（format 3 的必填键）',
      baseDoc.poems.every((p) => Array.isArray(p.tags)), dump(Object.keys(baseDoc.poems[0])));
    // 新内容的标签身份：唯一来源是本轮产物（客户端一律照产物顺序、不重排）。
    // ⚠ 不把 `['古诗十九首']` / 19 这些**写死**（上一轮就是那样，加第二个标签就臆断着红）：
    //   期望值一律从产物 `tags[]` 读；「本次真实数据长什么样」另起一层，并明确它只是实况。
    const baseTagGroups = (baseDoc.tags ?? []).filter((t) => t.members.length > 0);
    const baseTagIds = baseTagGroups.map((t) => t.id);
    check('v3 产物顶层 tags 里确实有真实标签（否则下面这一组标签断言是空的）',
      baseTagIds.length > 0, dump((baseDoc.tags ?? []).map((t) => [t.id, t.members.length])));
    eq('产物顶层 tags 的顺序 == 它自己数组的顺序（读产物，不推算）',
      baseTagIds, (baseDoc.tags ?? []).filter((t) => t.members.length > 0).map((t) => t.id));
    check('每个标签的 members 都不重复',
      baseTagGroups.every((t) => new Set(t.members).size === t.members.length),
      dump(baseTagGroups.map((t) => [t.id, t.members.length, new Set(t.members).size])));
    // 本次实况层（真实数据，不是夹具；加/减标签时改的就是这里）
    eq('本次实况：真实产物就是 2 个标签（古诗十九首 ／ 唐诗三百首）',
      baseTagIds, ['古诗十九首', '唐诗三百首']);
    check('本次实况：拼音序「古诗十九首」在「唐诗三百首」之前',
      baseTagIds.indexOf('古诗十九首') < baseTagIds.indexOf('唐诗三百首'), dump(baseTagIds));
    const gjss = baseTagGroups.find((t) => t.id === '古诗十九首');
    const tang300 = baseTagGroups.find((t) => t.id === '唐诗三百首');
    check('本次实况：古诗十九首与唐诗三百首都真在产物里', Boolean(gjss && tang300), dump(baseTagIds));
    eq('「古诗十九首」的成员数 == 19（第一版验收重点）', gjss.members.length, 19);
    eq('「古诗十九首」成员 id 不重复', new Set(gjss.members).size, gjss.members.length);
    eq('「唐诗三百首」的成员数 == 2', tang300.members.length, 2);
    eq('「唐诗三百首」的成员就是那两首（其一 → 其二，产物 members 顺序）',
      tang300.members.map((id) => baseDoc.poems.find((p) => p.id === id)?.title),
      ['梦李白二首·其一', '梦李白二首·其二']);
    eq('「唐诗三百首」两首的 orderInTag 是 1、2（members 次序的唯一依据）',
      tang300.members.map((id) => (baseDoc.poems.find((p) => p.id === id)?.tags ?? [])
        .filter((x) => x.id === '唐诗三百首').map((x) => x.orderInTag)),
      [[1], [2]]);
    check('成员都是产物里真实存在的诗（引用闭合）',
      baseTagGroups.every((t) => t.members.every((id) => baseDoc.poems.some((p) => p.id === id))),
      dump(baseTagGroups.map((t) => t.members)));
    check('两端双向闭合：诗侧 tags 里有的标签都在顶层 tags 里，反之亦然',
      baseDoc.poems.every((p) => (p.tags ?? []).every((t) => (baseDoc.tags ?? []).some((x) => x.id === t.id)))
        && baseTagGroups.every((t) => t.members.every((id) => (baseDoc.poems.find((p) => p.id === id)?.tags ?? [])
          .some((x) => x.id === t.id))),
      dump(baseTagGroups.map((t) => [t.id, t.members])));
    check('新修订与已发布的 `.26` **不同**（相同则缓存名相同 ⇒ 旧 cache 会被 install 覆盖，成对切换失真）',
      baseDoc.contentVersion !== baselineEnv.contentVersion,
      dump({ newRev: baseDoc.contentVersion, oldRev: baselineEnv.contentVersion }));
    check('新修订**晚于**已发布修订（逐段数值比较，不是「随便一个不同的值」）',
      revCmp(baseDoc.contentVersion, baselineEnv.contentVersion) > 0,
      dump({ newRev: baseDoc.contentVersion, oldRev: baselineEnv.contentVersion }));
    check('两侧缓存名不同（这是「装新 SW / 建新 cache」的前提）', newCacheName !== oldCacheName,
      dump({ oldCacheName, newCacheName }));
    const missingDeploy = DEPLOY_FILES.filter((rel) => !existsSync(resolve(baselineEnv.webDir, rel)));
    if (missingDeploy.length) {
      check('旧基底目录里带着本次部署要用的全部文件（tag 里的 web/**）', false, dump(missingDeploy));
      throw new Error(`旧基底目录缺文件：${missingDeploy.join(',')}（${baselineEnv.webDir}）`);
    }

    // ---- 9b 版本门（方向一）：**新壳**遇到 format 2 内容 ⇒ 如实拒绝 ----
    // 做法：本轮壳字节 ＋ 旧 format2 内容**成对发一次**（修订号抬一格 ⇒ 真的换 sw.js 字节、真的建新 cache），
    // 接受后新壳去读旧格式 ⇒ 必须报「版本太低」而不是硬渲染。
    const revForOldContent = nextContentRevision(baseDoc.contentVersion);
    const gateNewShell = await makeDeployment({
      destDir: join(deployRoot, 'gate-newshell-format2'),
      appVersion: APP_VERSION, contentRevision: revForOldContent, contentText: oldText,
    });
    console.log(`  版本门①：cache=${gateNewShell.cacheName}（本轮壳 ＋ 旧 format2 内容 —— 真实发布不会这样配对，专门验门）`);
    await redeploy(gateNewShell.destDir);
    await reload();
    await waitFor(`Boolean(document.querySelector('[data-test="update-available"]'))`, { label: '版本门①：好内容状态下发现这次部署' });
    const tokenGateNewShell = await docToken();
    await evaluate(`document.querySelector('[data-test="apply-update"]').click(); true`);
    await waitForNewDocument(tokenGateNewShell, '版本门①：切到「新壳＋旧内容」');
    await waitForErrorView();
    const gateNewShellText = await errorText();
    // 实际口径（本轮实测，不粉饰）：v3 壳的**结构校验先跑**，所以它报的是「tags 不是数组」；
    // 旧壳那边走的才是 checkCompatibility 的「格式版本 3 高于本站壳支持的 2」。两者都是受控拒收，
    // 但 kind 不同（schema ≠ incompatible）—— 这条差别写在这里，不把断言写成“总之失败了”。
    check('新壳（只认 3）遇到 format 2 内容 ⇒ 如实拒收（受控错误，不硬渲染）',
      /内容结构校验失败|格式版本/.test(gateNewShellText), dump(gateNewShellText));
    check('版本门①：拒收原因指向「格式/字段」本身（不是含糊的「内容没能取到」）',
      /tags|格式版本/.test(gateNewShellText), dump(gateNewShellText));
    console.log('  版本门①的实际文案：' + gateNewShellText);
    eq('版本门①：失败页里没有渲染任何诗行', await evaluate(`document.querySelectorAll('[data-test="poem-row"]').length`), 0);
    check('版本门①：也没有假装成功（没有凭空出现标签 tab）',
      !(await evaluate(`Boolean(document.querySelector('[data-test="tab-tags"]'))`)));
    eq('版本门①：缓存里那份 content.json 就是旧的 format2 字节（壳拒收 ≠ 没取到）',
      sha256(await cacheText(gateNewShell.cacheName, '/content.json')), oldSha);
    await screenshot('s9-1-gate-format3-shell-refuses-format2.png');
    await clearSiteData();

    // ---- 9c 版本门（方向二）：**旧壳**（format 2）遇到本轮 format 3 内容 ⇒ 如实拒绝 ----
    // 旧壳字节**原样**（一个字节不改），只把 content.json 换成 v3。真实发布不会这样配对，
    // 这里专门验「旧壳上版本门同样是受控的、且被拒的内容不是坏字节」。
    const gateOldShell = await makeDeploymentFromDir({
      destDir: join(deployRoot, 'gate-oldshell-format3'),
      webDir: baselineEnv.webDir, contentText: baseText,
    });
    eq('旧壳那一侧的缓存名仍是线上那一个（旧字节没被改写）', gateOldShell.cacheName, oldCacheName);
    console.log(`  版本门②：cache=${gateOldShell.cacheName}（旧 format2 壳 ＋ 本轮 format3 内容）`);
    await redeploy(gateOldShell.destDir);
    await goto(BASE);
    await waitForErrorView();
    const gateOldShellText = await errorText();
    check('旧壳（只认 2）遇到 format 3 内容 ⇒ 如实报「版本太高」，不硬渲染',
      /格式版本 3/.test(gateOldShellText) && /本站壳支持的 2/.test(gateOldShellText), dump(gateOldShellText));
    eq('版本门②：失败页里没有任何诗行', await evaluate(`document.querySelectorAll('[data-test="poem-row"]').length`), 0);
    check('版本门②：旧壳本来就没有标签 tab（也没有因此凭空多出一个）',
      !(await evaluate(`Boolean(document.querySelector('[data-test="tab-tags"]'))`)));
    eq('版本门②：缓存里存下来的就是本轮 v3 字节（旧壳是「不看」，不是「拿不到」）',
      sha256(await cacheText(gateOldShell.cacheName, '/content.json')), sha256(baseText));
    await screenshot('s9-2-gate-format2-shell-refuses-format3.png');
    await clearSiteData();

    // ---- 9d 装**真·旧基底**：已发布那一对字节，一个字节都不改 ----
    const vOld = await makeDeploymentFromDir({
      destDir: join(deployRoot, 'format2-published'), webDir: baselineEnv.webDir, contentText: oldText,
    });
    eq('旧基底的缓存名 == 线上那一个', vOld.cacheName, oldCacheName);
    console.log(`  旧站点：appVersion=${vOld.appVersion} 修订=${vOld.contentRevision} cache=${vOld.cacheName}`);
    await redeploy(vOld.destDir);
    await goto(BASE);
    await waitForIndexExpanded();
    s = await summary();
    eq('旧站点：页面汇报的应用版本就是已发布那个', s.appVersion, oldAppVersion);
    eq('旧站点：读的是已发布那一版内容', s.contentVersion, oldDoc.contentVersion);
    eq('旧站点：诗数量与已发布一致', s.poems, oldDoc.poems.length);
    eq('旧站点：客户端认的格式版本就是 2', s.formatVersion, 2);
    check('旧站点：旧壳没有「标签 tab」（本轮新增的视图，旧壳里根本不存在）',
      !(await evaluate(`Boolean(document.querySelector('[data-test="tab-tags"]'))`)));
    await waitForSiteCaches([vOld.cacheName], '旧站点缓存就位');
    eq('旧站点的站点缓存集合 == 线上那一个', await siteCaches(), [vOld.cacheName]);
    eq('旧缓存里的 content.json 字节 == 线上快照（sha256）',
      sha256(await cacheText(vOld.cacheName, '/content.json')), oldSha);
    await screenshot('s9-3-format2-published-baseline.png');

    // ---- 9e 成对发新版：本轮壳 ＋ v3 内容，修订 = 本轮 contentVersion ----
    const vNew = await makeDeployment({
      destDir: join(deployRoot, 'format3-published'),
      appVersion: APP_VERSION, contentRevision: baseDoc.contentVersion, contentText: baseText,
    });
    eq('新部署的缓存名 == 前缀＋本轮应用版本＋本轮修订（期望值由这一对字节的常量算）',
      vNew.cacheName, newCacheName);
    check('新部署的缓存名与旧站点的**确实不同**（成对切换的前提）', vNew.cacheName !== vOld.cacheName,
      dump({ oldCacheName: vOld.cacheName, newCacheName: vNew.cacheName }));
    console.log(`  新站点：cache=${vNew.cacheName}（壳与内容同一次部署；修订 ${baseDoc.contentVersion} ≠ ${oldRev}）`);
    await redeploy(vNew.destDir);
    await reload();
    // 旧壳不知道「修订」这回事，但它的更新检测是「有没有 waiting」，所以照样能发现这次发布。
    await waitFor(`Boolean(document.querySelector('[data-test="update-available"]'))`,
      { label: '旧壳发现新版本（同 APP_VERSION、新修订、新格式）' });
    await waitForCacheEntry(vNew.cacheName, '/content.json', '新 cache 里的 content.json 就位');
    s = await summary();
    eq('接受前：旧用户读到的仍是已发布的 format2 内容版本', s.contentVersion, oldDoc.contentVersion);
    eq('接受前：首数仍是旧那一版', s.poems, oldDoc.poems.length);
    eq('接受前：页面上生效的格式仍是 2', s.formatVersion, 2);
    check('接受前：旧页面没有裂（没有失败状态 —— 新格式没有半路塞给它）',
      !(await evaluate(`Boolean(document.querySelector('[data-test="view-error"]'))`)));
    // 过渡期的硬证据：**旧 cache 里的字节一点没变**（新 SW 的 install 写的是新 cache，不覆盖旧的）。
    eq('发布新版本的过程中，旧缓存里的 content.json 字节**没变**（sha256 仍是线上快照）',
      sha256(await cacheText(vOld.cacheName, '/content.json')), oldSha);
    const cachesDuringSwitch = await siteCaches();
    check('新旧缓存并存：新的一对已就绪、旧的仍在服务（不是「先删旧的」）',
      cachesDuringSwitch.includes(vOld.cacheName) && cachesDuringSwitch.includes(vNew.cacheName),
      dump(cachesDuringSwitch));
    await screenshot('s9-4-format2-to-format3-update-available.png');

    const tokenSwitch = await docToken();
    await evaluate(`document.querySelector('[data-test="apply-update"]').click(); true`);
    await waitForNewDocument(tokenSwitch, '点刷新后成对切换');
    await waitForIndexExpanded();
    s = await summary();
    eq('切换后：应用版本仍是同一个（本轮换的是格式/内容修订，不是 APP_VERSION）', s.appVersion, APP_VERSION);
    eq('切换后：内容版本 = 本轮产物', s.contentVersion, baseDoc.contentVersion);
    eq('切换后：客户端认的格式版本 = 3', s.formatVersion, 3);
    eq('切换后：首数 == 本轮产物首数', s.poems, baseDoc.poems.length);
    eq('切换后：目录次序 == 本轮产物数组次序', await domPoemIds(), expectedDomOrder(baseDoc));
    check('切换后没有残留失败状态', !(await evaluate(`Boolean(document.querySelector('[data-test="view-error"]'))`)));

    // v3 的**新增能力**真的能用：两个 tab ＋「古诗十九首」19 首、照产物顺序（客户端不重排）。
    eq('切换后：顶部出现「朝代 ｜ 标签」两个 tab',
      await evaluate(`[...document.querySelectorAll('[data-test="index-bar"] [role="tab"]')].map((t) => t.textContent)`),
      ['朝代', '标签']);
    await evaluate(`document.querySelector('[data-test="tab-tags"]').click(); true`);
    await waitForTagsView();
    const v3TagsView = await evaluate(`(() => {
      const v = document.querySelector('[data-test="view-index"]');
      return {
        keys: [...v.querySelectorAll('[data-test="tag-group"]')].map((g) => g.dataset.tagId),
        labels: [...v.querySelectorAll('[data-test="tag-group-title"] [data-test="tag-label"]')].map((h) => h.textContent),
        counts: v.querySelectorAll('.dynasty-count').length,
        heads: v.querySelectorAll('[data-test="tag-group-title"]').length,
      };
    })()`);
    eq('v3 标签 tab：组顺序 == 产物顶层 tags 顺序', v3TagsView.keys, baseTagIds);
    eq('v3 标签 tab：组名 == 产物标签 id', v3TagsView.labels, baseTagIds);
    eq('v3 标签 tab：没有任何计数元素（与采纳锚一致）', v3TagsView.counts, 0);
    eq('标签页的**组头数 == 产物里非空标签数**（两个标签就是两个组头，不是写死的 1 个）',
      v3TagsView.heads, baseTagGroups.length);
    await evaluate(`document.querySelector('[data-test="tag-group-title"]').click(); true`);
    // ⚠ 按**组**取行（收起组的行还在 DOM 里，只是不可见 —— 只有一个标签时这个细节看不出来）
    const v3TagRows = await evaluate(`(() => {
      const g = document.querySelector('[data-test="tag-group"][data-tag-id=' + ${JSON.stringify(JSON.stringify(baseTagGroups[0].id))} + ']');
      return [...g.querySelectorAll('[data-test="poem-row"]')].filter((r) => r.offsetParent !== null).map((r) => r.dataset.poemId);
    })()`);
    eq('「古诗十九首」展开后的行顺序 == 产物 members 顺序', v3TagRows, gjss.members);
    eq('「古诗十九首」展开后就是 19 行（不是 22：标签只收带该标签的诗）', v3TagRows.length, 19);
    eq('别的组收起时，它的行不可见（标签只收带该标签的诗，不是把整库倒出来）',
      await evaluate(`[...document.querySelectorAll('[data-test="tag-group"]:not([data-tag-id=' + ${JSON.stringify(JSON.stringify(baseTagGroups[0].id))} + ']) [data-test="poem-row"]')].filter((r) => r.offsetParent !== null).length`),
      0);
    await screenshot('s9-5-format3-tags-19-members.png');

    // ---- 9e-2 真实 dist 上的同一个标签页：「唐诗三百首」也必须能展开（两行其一 → 其二）----
    // 这一节**不换夹具**：用的就是本轮真实产物（`web/content.json` → 发布出去的那一对字节）。
    const tangGroupSel = `[data-test="tag-group"][data-tag-id="唐诗三百首"]`;
    check('真实产物里确实有「唐诗三百首」组（否则下面几条是空的）',
      v3TagsView.keys.includes('唐诗三百首'), dump(v3TagsView.keys));
    await evaluate(`document.querySelector('[data-test="tag-group"][data-tag-id="唐诗三百首"] [data-test="tag-group-title"]').click(); true`);
    const tangRows = await evaluate(`[...document.querySelectorAll('[data-test="tag-group"][data-tag-id="唐诗三百首"] [data-test="poem-row"]')]`
      + `.map((r) => ({ id: r.dataset.poemId, title: r.querySelector('.poem-row-title').textContent }))`);
    eq('「唐诗三百首」展开后**两行**，行序 == 产物 members（其一 → 其二）',
      tangRows.map((r) => r.id), tang300.members);
    eq('「唐诗三百首」两行的题名确实是 其一 → 其二',
      tangRows.map((r) => r.title), ['梦李白二首·其一', '梦李白二首·其二']);
    eq('「唐诗三百首」展开不影响另一组：古诗十九首仍展开、行数仍是它的 members 数',
      await evaluate(`(() => {
        const g = document.querySelector('[data-test="tag-group"][data-tag-id="古诗十九首"]');
        return [g.querySelector('[data-test="tag-group-title"]').getAttribute('aria-expanded'),
          g.querySelectorAll('[data-test="poem-row"]').length];
      })()`),
      ['true', gjss.members.length]);
    // 出图前把「唐诗三百首」滚进视野：古诗十九首有 19 行，两组都展开时它默认在视口之外
    //（否则这张图和 s9-5 会是一模一样的帧，等于没出证据）。
    await evaluate(`document.querySelector('[data-test="tag-group"][data-tag-id="唐诗三百首"]').scrollIntoView({ block: 'start' }); true`);
    await sleep(150);
    await screenshot('s9-5b-format3-real-two-tags-tang300-two-rows.png');
    await evaluate('window.scrollTo(0, 0); true');

    // ---- 9e-3 唐300 两路逐层返回（真实产物、真哈希路由）----
    // 视口压矮，页面才滚得动——否则「滚动保持」是 0 → 0，等于什么都没验。
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 360, deviceScaleFactor: 2, mobile: false });
    const tangFirstId = tang300.members[0];
    const tangFirstTitle = baseDoc.poems.find((p) => p.id === tangFirstId).title;
    check('（前置）被跟踪的那首唐诗确实在产物里', Boolean(tangFirstTitle), dump({ tangFirstId, tangFirstTitle }));

    /** 走一条链：当前视图 → 点行入诗 → 入详情 → 逐层返回（用「返回」按钮）→ 回到原视图并恢复展开/滚动。 */
    const walkAndReturnByButtons = async ({ label, viewHash, expandSelector, rowSelector, viewWait }) => {
      const headSel = viewHash === '#/tags' ? '[data-test="tag-group-title"]' : '[data-test="dynasty-group-title"]';
      await hashTo(viewHash);
      await viewWait();
      // 展开目标组（若还没展开）
      await evaluate(`(() => { const h = document.querySelector(${JSON.stringify(expandSelector)}); if (h && h.getAttribute('aria-expanded') !== 'true') h.click(); return true; })()`);
      await sleep(120);
      const before = await evaluate(`(() => { const max = document.documentElement.scrollHeight - window.innerHeight; window.scrollTo(0, Math.min(60, Math.max(0, max))); return window.scrollY; })()`);
      check(`（前置）${label}：视图可滚动（否则“滚动保持”量不出东西）`, before > 0, `scrollY=${before}`);
      const expandedBefore = await evaluate(`[...document.querySelectorAll(${JSON.stringify(headSel)})].map((h) => h.getAttribute('aria-expanded'))`);
      check(`（前置）${label}：目标组已展开（否则行根本不在）`,
        await evaluate(`Boolean(document.querySelector(${JSON.stringify(rowSelector)}))`));
      await evaluate(`document.querySelector(${JSON.stringify(rowSelector)}).click(); true`);
      await waitForPoemView(tangFirstId);
      eq(`${label}：点进去就是那首唐诗`, await evaluate('location.hash'), ROUTES.poem(tangFirstId));
      await evaluate(`document.querySelector('[data-test="poem-detail-link"]').click(); true`);
      await waitFor(`Boolean(document.querySelector('[data-test="view-detail"]'))`, { label: `${label}：详情页` });
      eq(`${label}：诗 → 详情（地址带 /detail）`, await evaluate('location.hash'), ROUTES.detail(tangFirstId));
      await evaluate(`document.querySelector('[data-test="back-to-poem"]').click(); true`);
      await waitForPoemView(tangFirstId);
      eq(`${label}：详情「返回」只退一层（回到这首诗的诗页）`, await evaluate('location.hash'), ROUTES.poem(tangFirstId));
      await evaluate(`document.querySelector('[data-test="back-to-index"]').click(); true`);
      await viewWait();
      eq(`${label}：诗页「返回」回到**原视图**`, await evaluate('location.hash'), viewHash);
      await waitFor(`Math.abs(window.scrollY - ${before}) <= 2`, { label: `${label}：返回后滚动恢复`, timeout: 5000 });
      const after = await evaluate(`({ y: window.scrollY, expanded: [...document.querySelectorAll(${JSON.stringify(headSel)})].map((h) => h.getAttribute('aria-expanded')) })`);
      eq(`${label}：返回后展开状态保持（一处未变）`, after.expanded, expandedBefore);
      check(`${label}：返回后滚动位置保持（±2px）`, Math.abs(after.y - before) <= 2, `离开 ${before} → 回来 ${after.y}`);
    };

    /** 同一首诗的另一路：浏览器后退也逐层（详情 → 诗页 → 原视图）。 */
    const walkBrowserBack = async ({ label, viewHash, expandSelector, rowSelector, viewWait }) => {
      await hashTo(viewHash);
      await viewWait();
      await evaluate(`(() => { const h = document.querySelector(${JSON.stringify(expandSelector)}); if (h && h.getAttribute('aria-expanded') !== 'true') h.click(); return true; })()`);
      await sleep(120);
      await evaluate(`document.querySelector(${JSON.stringify(rowSelector)}).click(); true`);
      await waitForPoemView(tangFirstId);
      await evaluate(`document.querySelector('[data-test="poem-detail-link"]').click(); true`);
      await waitFor(`Boolean(document.querySelector('[data-test="view-detail"]'))`, { label: `${label}：详情页（后退链）` });
      const detailHash = await evaluate('location.hash');
      await evaluate('history.back(); true');
      await waitForPoemView(tangFirstId);
      const onceHash = await evaluate('location.hash');
      await evaluate('history.back(); true');
      await viewWait();
      eq(`${label}：浏览器后退也一次退一层（详情 → 诗页 → 原视图）`,
        [detailHash.endsWith('/detail'), onceHash, await evaluate('location.hash')],
        [true, ROUTES.poem(tangFirstId), viewHash]);
    };

    // 路一：**朝代视图**进的同一首唐300 诗
    await walkAndReturnByButtons({
      label: '唐300·朝代路',
      viewHash: '#/',
      expandSelector: `[data-test="dynasty-group"][data-dynasty-key="唐"] [data-test="dynasty-group-title"]`,
      rowSelector: `[data-test="dynasty-group"] [data-test="poem-row"][data-poem-id="${tangFirstId}"]`,
      viewWait: waitForDynastyView,
    });
    // 「从朝代进同一首」不是空话：那首诗确实挂在「唐」组下（返回后就在朝代视图，正好查）
    const tangOwner = await evaluate(`(() => {
      const r = document.querySelector('[data-test="poem-row"][data-poem-id=' + ${JSON.stringify(JSON.stringify(tangFirstId))} + ']');
      const g = r && r.closest('[data-test="dynasty-group"]');
      return g ? g.dataset.dynastyKey : null;
    })()`);
    eq('（前置）那首唐300 诗确实挂在「唐」朝代组下（否则「从朝代进同一首」就是空话）', tangOwner, '唐');
    await walkBrowserBack({
      label: '唐300·朝代路',
      viewHash: '#/',
      expandSelector: `[data-test="dynasty-group"][data-dynasty-key="唐"] [data-test="dynasty-group-title"]`,
      rowSelector: `[data-test="dynasty-group"] [data-test="poem-row"][data-poem-id="${tangFirstId}"]`,
      viewWait: waitForDynastyView,
    });

    // 路二：**标签视图**进的同一首唐300 诗
    await walkAndReturnByButtons({
      label: '唐300·标签路',
      viewHash: '#/tags',
      expandSelector: `${tangGroupSel} [data-test="tag-group-title"]`,
      rowSelector: `${tangGroupSel} [data-test="poem-row"][data-poem-id="${tangFirstId}"]`,
      viewWait: waitForTagsView,
    });
    await walkBrowserBack({
      label: '唐300·标签路',
      viewHash: '#/tags',
      expandSelector: `${tangGroupSel} [data-test="tag-group-title"]`,
      rowSelector: `${tangGroupSel} [data-test="poem-row"][data-poem-id="${tangFirstId}"]`,
      viewWait: waitForTagsView,
    });
    // 顺手把「另一首」也走一遍标签路：两首唐300 都必须可达（不是只有第一行）
    const tangSecondId = tang300.members[1];
    await hashTo('#/tags');
    await waitForTagsView();
    await evaluate(`(() => { const h = document.querySelector(${JSON.stringify(tangGroupSel + ' [data-test="tag-group-title"]')}); if (h && h.getAttribute('aria-expanded') !== 'true') h.click(); return true; })()`);
    await sleep(120);
    await evaluate(`document.querySelector(${JSON.stringify(`${tangGroupSel} [data-test="poem-row"][data-poem-id="${tangSecondId}"]`)}).click(); true`);
    await waitForPoemView(tangSecondId);
    eq('唐300 第二首（其二）从标签视图也能进（两首均可达）', await evaluate('location.hash'), ROUTES.poem(tangSecondId));
    await evaluate(`document.querySelector('[data-test="back-to-index"]').click(); true`);
    await waitForTagsView();
    eq('从其二返回也回到标签视图', await evaluate('location.hash'), '#/tags');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 2, mobile: false });
    await sleep(150);
    await screenshot('s9-5c-format3-tang300-back-from-tag-view.png');
    await cdp.send('Emulation.clearDeviceMetricsOverride');

    await hashTo('#/');
    await waitForDynastyView();
    await waitForIndexExpanded();

    // ---- 9f 缓存账：旧 cache 被清、只留新 cache；缓存里的壳与内容成对 ----
    await waitForSiteCaches([vNew.cacheName], 'activate 后只剩新 cache');
    eq('activate 只删本前缀的旧 cache：旧 ' + vOld.cacheName + ' 没了，新的 ' + vNew.cacheName + ' 留下',
      await siteCaches(), [vNew.cacheName]);
    eq('旧 cache 确实被删掉了（不是「还在但不生效」）', (await siteCaches()).includes(oldCacheName), false);
    const cachedCfg = String(await cacheText(vNew.cacheName, '/app/config.js'));
    eq('新缓存里的**壳**带的就是本轮修订（壳与内容同一批，不是旧壳配新内容）',
      readConstFrom(cachedCfg, 'CONTENT_REVISION'), baseDoc.contentVersion);
    eq('新缓存里的壳只支持 formatVersion 3（缓存里是那一对字节）',
      Number((/SUPPORTED_FORMAT_VERSION = (\d+)/.exec(cachedCfg) || [])[1]), 3);
    const cachedDoc = JSON.parse(await cacheText(vNew.cacheName, '/content.json'));
    eq('新缓存里的内容版本 == 本轮产物', cachedDoc.contentVersion, baseDoc.contentVersion);
    eq('新缓存里的内容格式 == 3', Number(cachedDoc.formatVersion), 3);
    eq('新缓存里的内容字节 == 部署出去的那一份（sha256）',
      sha256(await cacheText(vNew.cacheName, '/content.json')), sha256(baseText));
    eq('新缓存里确实有顶层 tags（缓存那份是完整 v3，不是被截断的）',
      (cachedDoc.tags ?? []).filter((t) => t.members.length > 0).map((t) => t.id), baseTagIds);

    // ---- 9g 失败保旧：半套部署（缺 content.json）⇒ 装不上、不激活、正在用的那一对字节不变 ----
    const revBroken = nextContentRevision(nextContentRevision(baseDoc.contentVersion));
    const brokenDep = await makeDeployment({
      destDir: join(deployRoot, 'format3-broken'),
      appVersion: APP_VERSION, contentRevision: revBroken, contentText: baseText,
    });
    await rm(join(brokenDep.destDir, 'content.json'));
    console.log(`  故意失败的一次部署：cache=${brokenDep.cacheName}（content.json 已删 ⇒ 预缓存必失败）`);
    await redeploy(brokenDep.destDir);
    await reload();
    await sleep(3000);
    s = await summary();
    const regState = await evaluate(`(async () => { const r = await navigator.serviceWorker.getRegistration(); return { waiting: Boolean(r && r.waiting), installing: Boolean(r && r.installing), active: Boolean(r && r.active) }; })()`);
    check('取不到预缓存文件 ⇒ 新 SW 没装成（没有 waiting）', regState.waiting === false, dump(regState));
    eq('失败保旧：仍在读已经生效的 v3 内容', s.contentVersion, baseDoc.contentVersion);
    eq('失败保旧：首数仍是 v3 那一版', s.poems, baseDoc.poems.length);
    eq('失败保旧：页面上生效的格式仍是 3', s.formatVersion, 3);
    check('失败保旧：页面没有出现「有新版本」提示',
      !(await evaluate(`Boolean(document.querySelector('[data-test="update-available"]'))`)));
    check('失败保旧：页面也没有失败状态（失败发生在 SW 安装里，不是取内容）',
      !(await evaluate(`Boolean(document.querySelector('[data-test="view-error"]'))`)));
    // 失败时 Chrome 会留下**一个空的/半套的** cache（我们的 install 先 open 再逐个取），
    // 所以判据不是「新 cache 不存在」，而是「新 cache 里没有可用的 content.json」，且当前 v3 cache 完好。
    const failProbe = await evaluate(`(async () => {
      const key = new URL('content.json', self.location.href).href;
      const hasBroken = await caches.has(${JSON.stringify(brokenDep.cacheName)});
      const brokenOk = hasBroken ? Boolean(await (await caches.open(${JSON.stringify(brokenDep.cacheName)})).match(key)) : false;
      const status = await fetch('content.json?probe=1', { cache: 'no-store' }).then((r) => r.status).catch((e) => 'rejected:' + e.name);
      return { names: await caches.keys(), brokenCacheExists: hasBroken, brokenHasContent: brokenOk, contentStatus: status };
    })()`);
    check('失败保旧：站点缓存集合仍含当前 v3 那一个，半套的新缓存里没有 content.json（装不上＝不可用）',
      failProbe.names.includes(vNew.cacheName) && failProbe.brokenHasContent === false, dump(failProbe));
    eq('失败码证据：预缓存要取的 content.json 在服务器上是 404（install 因此失败）', failProbe.contentStatus, 404);
    eq('失败保旧：当前 v3 缓存里的 content.json 字节**一点没变**（sha256 仍是本轮产物）',
      sha256(await cacheText(vNew.cacheName, '/content.json')), sha256(baseText));
    await screenshot('s9-6-format3-broken-install-keeps-v3.png');

    // ---- 9h 离线不裂：断网 + 停服务后仍能读 v3（含标签视图）----
    await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    await stopServer();
    check('本地 HTTP 服务确实已经关掉', await isServerDown());
    await reload();
    await waitForIndexExpanded();
    s = await summary();
    check('离线重载：目录照常渲染、没有失败状态',
      (await evaluate(`Boolean(document.querySelector('[data-test="poem-row"]'))`))
      && !(await evaluate(`Boolean(document.querySelector('[data-test="view-error"]'))`)));
    eq('离线重载：内容版本', s.contentVersion, baseDoc.contentVersion);
    eq('离线重载：首数', s.poems, baseDoc.poems.length);
    eq('离线重载：格式版本', s.formatVersion, 3);
    check('离线重载：仍受 Service Worker 控制（缓存命中）',
      await evaluate('Boolean(navigator.serviceWorker.controller)'));
    await hashTo('#/tags');
    await waitForTagsView();
    eq('离线重载：标签视图也能用（v3 的壳与内容都在缓存里）',
      await evaluate(`[...document.querySelectorAll('[data-test="tag-group"]')].map((g) => g.dataset.tagId)`),
      baseTagIds);
    await hashTo('#/');
    await waitForDynastyView();
    await screenshot('s9-7-format3-offline-after-update.png');
    await startServer(vNew.destDir);
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await reload();
    await waitForIndexExpanded();
    const errsInSection = pageErrors.slice(pageErrsBefore);
    console.log('  本节新增页面级报错 ' + errsInSection.length + ' 条'
      + (errsInSection.length ? '：' + errsInSection.map((e) => String(e).split('\n')[0]).join(' | ') : ''));
  }
  // ---------------------------------------------------------------- 10. 标签 tab（工程线 2／3）
  //
  // 验收口径来自用户 2026-10-18 采纳的整合版（`items/tag-views/history/round-2026-10-18-tag-tab-adopted/`）：
  //   顶部「朝代 ｜ 标签」两 tab ＋右侧关于；标签页与朝代页**同构**；标签页**无任何数量**；
  //   零成员标签不渲染；返回链**逐层**（详情 → 诗页 → 原视图）；两个 tab 各自保展开与滚动；
  //   两端一律**照产物排序**。
  section('10 标签 tab：同构 / 无任何数量 / 零成员不渲染 / 逐层返回 / 各 tab 各自状态 / 照产物排序');

  // ---- 10a 真实产物上的标签视图（真标签，照产物顺序、无数量） ----
  await hashTo(ROUTES.tags);
  await waitForTagsView();
  eq('标签 tab 有独立路由（可深链接、刷新不丢）', await evaluate('location.hash'), '#/tags');
  // 真实产物的顶层标签表（编译期已按拼音排好；members 已按 orderInTag 升序）——预期值只取一份。
  const realTags = (baseDoc.tags ?? []).filter((t) => t.members.length > 0);
  const realTagOrder = realTags.map((t) => t.id);
  const bareTagsView = await evaluate(`(() => {
    const v = document.querySelector('[data-test="view-index"]');
    const heads = [...v.querySelectorAll('[data-test="tag-group-title"]')];
    return {
      keys: [...v.querySelectorAll('[data-test="tag-group"]')].map((g) => g.dataset.tagId),
      labels: heads.map((h) => h.querySelector('[data-test="tag-label"]').textContent),
      expanded: heads.map((h) => h.getAttribute('aria-expanded')),
      marks: heads.map((h) => h.querySelector('[data-test="group-mark"]').textContent),
      visibleRows: [...v.querySelectorAll('[data-test="poem-row"]')].filter((r) => r.offsetParent !== null).length,
      counts: v.querySelectorAll('.dynasty-count').length,
      text: v.innerText,
    };
  })()`);
  check('真实产物里确实有标签（否则下面几条是空的）', realTagOrder.length > 0, dump(realTagOrder));
  eq('真实内容的标签组顺序 == 产物顶层 tags 数组顺序（页面不重排）', bareTagsView.keys, realTagOrder);
  eq('组名 = 标签 id 本身（中文 id 即显示名）', bareTagsView.labels, realTagOrder);
  eq('标签 tab 初态：全部收起、记号都是 [+]、可见诗目 0 行',
    [bareTagsView.expanded, bareTagsView.marks, bareTagsView.visibleRows],
    [realTagOrder.map(() => 'false'), realTagOrder.map(() => '[+]'), 0]);
  eq('标签页没有任何计数元素（组头里没有那一段）', bareTagsView.counts, 0);
  eq('标签页不出现阿拉伯数字（没有编号/计数）', /\d/.test(bareTagsView.text), false);
  check('标签页没有「已收录 / 共 N 首」这类计数文字',
    !/已收录|收录了|共\s*\d|共\s*二十/.test(bareTagsView.text), dump(bareTagsView.text));
  eq('标签 tab 里顶部仍是那两个 tab ＋关于（不是另一套外壳）',
    await evaluate(`[...document.querySelectorAll('[data-test="index-bar"] [role="tab"]')].map(t => t.textContent)`),
    ['朝代', '标签']);
  await screenshot('18a-tags-tab-real-collapsed.png');
  // 展开真实标签：行数 == members 数，行序 == members 顺序（产物已排好，客户端不重排）
  await evaluate(`document.querySelector('[data-test="tag-group-title"]').click(); true`);
  const realTagRows = await evaluate(`(() => {
    const g = document.querySelector('[data-test="tag-group"][data-tag-id=' + ${JSON.stringify(JSON.stringify(realTags[0].id))} + ']');
    return [...g.querySelectorAll('[data-test="poem-row"]')].filter((r) => r.offsetParent !== null).map((r) => r.dataset.poemId);
  })()`);
  eq('真实标签展开后的行顺序 == 产物 members 顺序', realTagRows, realTags[0].members);
  eq('真实标签展开后行数 == members 数', realTagRows.length, realTags[0].members.length);
  await screenshot('18b-tags-tab-real-one-open.png');
  const untaggedPoems = baseDoc.poems.filter((p) => (p.tags ?? []).length === 0).map((p) => p.id);
  check('真实产物里确实有无标签的诗（否则下一条是空的）', untaggedPoems.length > 0, dump(untaggedPoems));
  eq('无标签的诗不会出现在标签页里（它们照旧留在朝代页）',
    untaggedPoems.filter((id) => realTagRows.includes(id)), []);

  // ---- 10b 真发一版**带标签的测试夹具**（并切到它） ----
  const tagDoc = makeTagTabFixtureDoc();
  const tagDocText = `${JSON.stringify(tagDoc, null, 2)}\n`;
  const tagApp = nextAppVersion(APP_VERSION, 7);
  const tagDep = await makeDeployment({ destDir: join(deployRoot, 'tags'), appVersion: tagApp, contentText: tagDocText });
  console.log(`  部署标签夹具：appVersion=${tagApp} 标签=${tagDoc.tags.length} 首=${tagDoc.poems.length}（均为测试夹具）`);
  await redeploy(tagDep.destDir);
  await reload();
  await waitFor(`Boolean(document.querySelector('[data-test="update-available"]'))`, { label: '标签夹具版本被发现' });
  const tokenTagDep = await docToken();
  await evaluate(`document.querySelector('[data-test="apply-update"]').click(); true`);
  await waitForNewDocument(tokenTagDep, '切到标签夹具版本');
  await waitForTagsView();
  s = await summary();
  eq('切到夹具版本后：内容版本就是夹具的', s.contentVersion, tagDoc.contentVersion);
  eq('切到夹具版本后：首数就是夹具的', s.poems, tagDoc.poems.length);

  // 小屏手机视口（430×932，与原型截图同口径）——后面量几何与出图都用它。
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 2, mobile: false });

  // ---- 10c 顶部两 tab ＋ 朝代 tab 初态 ----
  await openFresh(BASE);
  await waitForDynastyView();
  const topInfo = await evaluate(`(() => {
    const bar = document.querySelector('[data-test="index-bar"]');
    const tabs = [...bar.querySelectorAll('[role="tab"]')];
    const about = bar.querySelector('[data-test="about-link"]');
    return {
      labels: tabs.map((t) => t.textContent),
      selected: tabs.map((t) => t.getAttribute('aria-selected')),
      tabTagNames: tabs.map((t) => t.tagName),
      about: about ? about.textContent : null,
      aboutHref: about ? about.getAttribute('href') : null,
      linksInBar: [...bar.querySelectorAll('a')].map((a) => a.textContent),
    };
  })()`);
  eq('顶部：「朝代 ｜ 标签」两个 tab（按顺序）＋ 右侧关于',
    [topInfo.labels, topInfo.about], [['朝代', '标签'], '关于']);
  eq('两个 tab 是 `role=tab` 的按钮（不是链接，与采纳锚一致）',
    [topInfo.tabTagNames, await evaluate(`[...document.querySelectorAll('[data-test="index-bar"] [role="tab"]')].map(t => t.getAttribute('role'))`)],
    [['BUTTON', 'BUTTON'], ['tab', 'tab']]);
  eq('默认停在第 1 个 tab「朝代」（地址栏没有 hash，或者在 #/）',
    [await evaluate(`document.querySelector('[data-test="view-index"]').dataset.tab`), ['#/', ''].includes(await evaluate('location.hash'))],
    ['dynasty', true]);
  eq('初态选中的是「朝代」',
    await evaluate(`document.querySelector('[data-test="tab-dynasty"]').getAttribute('aria-selected')`), 'true');
  eq('顶部只有「关于」一个链接（tab 不是链接）', topInfo.linksInBar, ['关于']);
  eq('关于入口仍指向 #/about', topInfo.aboutHref, '#/about');
  const dynInitial = await evaluate(`(() => {
    const v = document.querySelector('[data-test="view-index"]');
    const heads = [...v.querySelectorAll('[data-test="dynasty-group-title"]')];
    return {
      keys: [...v.querySelectorAll('[data-test="dynasty-group"]')].map((g) => g.dataset.dynastyKey),
      expanded: heads.map((h) => h.getAttribute('aria-expanded')),
      marks: heads.map((h) => h.querySelector('[data-test="group-mark"]').textContent),
      visibleRows: [...v.querySelectorAll('[data-test="poem-row"]')].filter((r) => r.offsetParent !== null).length,
      counts: [...v.querySelectorAll('.dynasty-count b')].map((b) => b.textContent),
    };
  })()`);
  eq('朝代 tab 初态：组全部收起（各组独立）',
    [dynInitial.expanded, dynInitial.marks, dynInitial.visibleRows],
    [dynInitial.keys.map(() => 'false'), dynInitial.keys.map(() => '[+]'), 0]);
  eq('朝代 tab **仍有**计数（用户只要求标签页不显示数量）', dynInitial.counts, ['3', '1']);
  await screenshot('19-dynasty-tab.png');

  // ---- 10d 切到标签 tab：同构、无任何数量、零成员不渲染 ----
  await evaluate(`document.querySelector('[data-test="tab-tags"]').click(); true`);
  await waitForTagsView();
  eq('点「标签」⇒ 地址变成 #/tags（tab 切换是路由切换，不是内存开关）', await evaluate('location.hash'), '#/tags');
  const tagView = await evaluate(`(() => {
    const v = document.querySelector('[data-test="view-index"]');
    const heads = [...v.querySelectorAll('[data-test="tag-group-title"]')];
    return {
      keys: [...v.querySelectorAll('[data-test="tag-group"]')].map((g) => g.dataset.tagId),
      labels: heads.map((h) => h.querySelector('[data-test="tag-label"]').textContent),
      expanded: heads.map((h) => h.getAttribute('aria-expanded')),
      marks: heads.map((h) => h.querySelector('[data-test="group-mark"]').textContent),
      visibleRows: [...v.querySelectorAll('[data-test="poem-row"]')].filter((r) => r.offsetParent !== null).length,
      counts: v.querySelectorAll('.dynasty-count').length,
      heads: v.querySelectorAll('[data-test="tag-group-title"]').length,
      text: v.innerText,
      titleAlign: getComputedStyle(document.querySelector('[data-test="tab-tags"]')).borderBottomColor,
    };
  })()`);
  const productTagOrder = tagDoc.tags.filter((t) => t.members.length > 0).map((t) => t.id);
  const pinyinCollator = new Intl.Collator(['zh-Hans-CN-u-co-pinyin', 'zh-Hans-CN', 'zh'], { numeric: true, sensitivity: 'variant' });
  const pinyinTagOrder = [...productTagOrder].sort((a, b) => pinyinCollator.compare(a, b));
  eq('标签组顺序 == 产物顶层 tags 数组顺序（页面不重排）', tagView.keys, productTagOrder);
  check('产物的标签顺序**确实不是拼音序**（所以上一条断言有牙齿）',
    dump(productTagOrder) !== dump(pinyinTagOrder), dump({ productTagOrder, pinyinTagOrder }));
  eq('组名 = 标签 id 本身（中文 id 即显示名）', tagView.labels, productTagOrder);
  eq('标签 tab 初态：全部收起', tagView.expanded, productTagOrder.map(() => 'false'));
  eq('标签 tab 收起时记号都是 [+]', tagView.marks, productTagOrder.map(() => '[+]'));
  eq('标签 tab 收起时可见诗目 0 行', tagView.visibleRows, 0);
  eq('零成员的标签不渲染：组头数量 == 有成员的标签数', tagView.heads, productTagOrder.length);
  check(`零成员的标签「${TAG_FIXTURE_EMPTY_TAG}」连文字都不出现`, !tagView.text.includes(TAG_FIXTURE_EMPTY_TAG), dump(tagView.text));
  eq('夹具里确实有那条零成员标签（否则上面两条是空的）',
    tagDoc.tags.some((t) => t.id === TAG_FIXTURE_EMPTY_TAG && t.members.length === 0), true);
  eq('标签页没有任何计数元素（组头里没有那一段）', tagView.counts, 0);
  check('标签页整页不出现「首」字，也不出现任何数字（无计数、无「本库已收录 N 首」、无编号）',
    !/首/.test(tagView.text) && !/\d/.test(tagView.text), dump(tagView.text));
  eq('选中态搬到「标签」上（下边线用 accent）',
    await evaluate(`document.querySelector('[data-test="tab-tags"]').getAttribute('aria-selected')`), 'true');
  await screenshot('20-tags-all-collapsed.png');

  // ---- 10e 单组展开：同构几何（悬挂记号竖直居中、题名左沿＝标签名首字、作者紧随、无序号） ----
  await evaluate(`document.querySelector('[data-test="tag-group-title"]').click(); true`);
  const oneOpen = await evaluate(`(() => {
    const v = document.querySelector('[data-test="view-index"]');
    const gs = [...v.querySelectorAll('[data-test="tag-group"]')];
    const g = gs[0];
    const head = g.querySelector('[data-test="tag-group-title"]');
    const mark = head.querySelector('[data-test="group-mark"]');
    const label = head.querySelector('[data-test="tag-label"]');
    const rows = [...g.querySelectorAll('[data-test="poem-row"]')];
    const firstTitle = rows[0] ? rows[0].querySelector('.poem-row-title') : null;
    const firstAuthor = rows[0] ? rows[0].querySelector('.poem-row-author') : null;
    const r = (el) => el.getBoundingClientRect();
    const hostLeft = document.getElementById('view').getBoundingClientRect().left;
    return {
      expanded: gs.map((x) => x.querySelector('[data-test="tag-group-title"]').getAttribute('aria-expanded')),
      marks: gs.map((x) => x.querySelector('[data-test="group-mark"]').textContent),
      rowIds: rows.map((x) => x.dataset.poemId),
      rowTitles: rows.map((x) => x.querySelector('.poem-row-title').textContent),
      groupText: g.innerText,
      slot: r(head.querySelector('.gh-slot')).width,
      markCenterDelta: (r(mark).top + r(mark).bottom) / 2 - (r(label).top + r(label).bottom) / 2,
      labelLeft: r(label).left - hostLeft,
      titleLeft: firstTitle ? r(firstTitle).left - hostLeft : null,
      authorGap: firstTitle && firstAuthor ? r(firstAuthor).left - r(firstTitle).right : null,
      wholeHeadClickable: head.tagName === 'BUTTON' && r(head).width > r(g).width * 0.9,
    };
  })()`);
  eq('单组展开：只有它展开，其余组仍收起（各组独立）', oneOpen.expanded, ['true', 'false', 'false']);
  eq('展开后记号变 [−]，其余仍 [+]', oneOpen.marks, ['[−]', '[+]', '[+]']);
  eq('展开后的诗目顺序 == 产物 members 顺序', oneOpen.rowIds, tagDoc.tags[0].members);
  const pinyinMemberOrder = [...tagDoc.tags[0].members]
    .sort((a, b) => pinyinCollator.compare(
      tagDoc.poems.find((p) => p.id === a).title, tagDoc.poems.find((p) => p.id === b).title,
    ));
  check('成员顺序确实不是拼音序，也不是 poems 数组顺序（所以上一条断言有牙齿）',
    dump(tagDoc.tags[0].members) !== dump(pinyinMemberOrder)
      && dump(tagDoc.tags[0].members) !== dump(tagDoc.poems.map((p) => p.id).filter((id) => tagDoc.tags[0].members.includes(id))),
    dump({ members: tagDoc.tags[0].members, pinyinMemberOrder }));
  check('子诗目**无序号**：组内文字里没有任何数字（没有 001 这类编号）',
    !/\d/.test(oneOpen.groupText), dump(oneOpen.groupText));
  check('同构几何：记号槽 ≈27.52px（与朝代页同一条槽）', Math.abs(oneOpen.slot - 27.52) < 0.6, `slot=${oneOpen.slot}`);
  check('同构几何：记号与标签名竖直居中（盒中心差 <1px）', Math.abs(oneOpen.markCenterDelta) < 1, `Δ=${oneOpen.markCenterDelta}`);
  check('同构几何：题名左沿 == 标签名首字左沿（±1px，缩进 0）',
    oneOpen.titleLeft !== null && Math.abs(oneOpen.titleLeft - oneOpen.labelLeft) <= 1,
    dump({ titleLeft: oneOpen.titleLeft, labelLeft: oneOpen.labelLeft }));
  check('作者紧随题名（同一行、间隙 <12px）',
    oneOpen.authorGap !== null && oneOpen.authorGap >= 0 && oneOpen.authorGap < 12, `gap=${oneOpen.authorGap}`);
  eq('组头是整行可点的按钮（不是只有组名可点）', oneOpen.wholeHeadClickable, true);
  await screenshot('21-tag-one-open.png');

  // ---- 10f 返回链：详情 → 诗页 → **原视图（标签）**，逐层退，不跳层 ----
  // 需要页面真的能滚（默认 430×932 下这段夹具不够长）⇒ 临时把视口压矮，滚得动才量得出“位置保持”。
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 360, deviceScaleFactor: 2, mobile: false });
  const tagY = await evaluate(`(() => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, Math.min(140, Math.max(0, max)));
    return window.scrollY;
  })()`);
  check('（前置）标签视图可滚动（不然“滚动保持”量不出东西）', tagY > 0, `scrollY=${tagY}`);
  const chainPoemId = tagDoc.tags[0].members[0];
  await evaluate(`document.querySelector('[data-test="tag-group"] [data-test="poem-row"]').click(); true`);
  await waitForPoemView(chainPoemId);
  eq('从标签视图点进诗：地址是那首诗', await evaluate('location.hash'), ROUTES.poem(chainPoemId));
  eq('诗页「返回」说的是原视图（← 标签，不是「← 目录」）',
    await evaluate(`document.querySelector('[data-test="back-to-index"]').textContent`), '← 标签');
  eq('诗页「返回」地址指向 #/tags',
    await evaluate(`document.querySelector('[data-test="back-to-index"]').getAttribute('href')`), '#/tags');
  await evaluate(`document.querySelector('[data-test="poem-detail-link"]').click(); true`);
  await waitFor(`Boolean(document.querySelector('[data-test="view-detail"]'))`, { label: '详情页' });
  eq('诗 → 详情（地址带 /detail）', await evaluate('location.hash'), ROUTES.detail(chainPoemId));
  await evaluate(`document.querySelector('[data-test="back-to-poem"]').click(); true`);
  await waitForPoemView(chainPoemId);
  eq('详情「返回」只退一层：回到**这首诗的诗页**（不是标签视图）', await evaluate('location.hash'), ROUTES.poem(chainPoemId));
  await evaluate(`document.querySelector('[data-test="back-to-index"]').click(); true`);
  await waitForTagsView();
  eq('诗页「返回」再退一层：回到**原来的标签视图**（不是朝代）', await evaluate('location.hash'), '#/tags');
  await waitFor(`Math.abs(window.scrollY - ${tagY}) <= 2`, { label: '返回后滚动恢复', timeout: 5000 });
  const afterChain = await evaluate(`(() => {
    const gs = [...document.querySelectorAll('[data-test="tag-group"]')];
    const g = gs[0];
    return {
      expanded: gs.map((x) => x.querySelector('[data-test="tag-group-title"]').getAttribute('aria-expanded')),
      rows: [...g.querySelectorAll('[data-test="poem-row"]')].length,
      y: window.scrollY,
    };
  })()`);
  eq('返回后原组**仍然展开**（其余仍收起）', afterChain.expanded, ['true', 'false', 'false']);
  eq('返回后展开行数 == members 数（不是空的）', afterChain.rows, tagDoc.tags[0].members.length);
  check('返回后滚动位置保持（±2px）', Math.abs(afterChain.y - tagY) <= 2, `离开 ${tagY} → 回来 ${afterChain.y}`);

  // ---- 10g 浏览器后退也一次退一层：详情 → 诗页 → 标签视图 ----
  await evaluate(`document.querySelector('[data-test="tag-group"] [data-test="poem-row"]').click(); true`);
  await waitForPoemView(tagDoc.tags[0].members[0]);
  await evaluate(`document.querySelector('[data-test="poem-detail-link"]').click(); true`);
  await waitFor(`Boolean(document.querySelector('[data-test="view-detail"]'))`, { label: '详情页（后退链）' });
  const detailHash = await evaluate('location.hash');
  await evaluate('history.back(); true');
  await waitForPoemView(tagDoc.tags[0].members[0]);
  const backOnce = await evaluate('location.hash');
  await evaluate('history.back(); true');
  await waitForTagsView();
  eq('浏览器后退也一次退一层：详情 → 诗页 → 标签视图',
    [detailHash.endsWith('/detail'), backOnce], [true, ROUTES.poem(tagDoc.tags[0].members[0])]);
  eq('后退回来后仍在标签视图（不是朝代）', await evaluate('location.hash'), '#/tags');
  // 截图口径回到手机竖屏（430×932），拍「返回之后仍然展开」这一张
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 2, mobile: false });
  await sleep(200);
  await screenshot('22-tag-return-restored.png');

  // ---- 10h 两个 tab 各自保展开与滚动（本会话内） ----
  // 视口压矮，两个视图都滚得动 —— 否则“滚动位置保持”在短页上是 0→0，等于什么都没验。
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 240, deviceScaleFactor: 2, mobile: false });
  await waitForTagsView();
  const tagScroll = await evaluate(`(() => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, Math.min(80, Math.max(0, max)));
    return window.scrollY;
  })()`);
  check('（前置）矮视口下标签视图可滚动', tagScroll > 0, `scrollY=${tagScroll}`);
  // 先看：切到朝代 tab 时，朝代自己的展开状态是**自己的**（此前没展开过 ⇒ 仍全收起）。
  await evaluate(`document.querySelector('[data-test="tab-dynasty"]').click(); true`);
  await waitForDynastyView();
  eq('切到朝代 tab：展开状态用的是朝代自己的（这一会话里从未展开 ⇒ 仍全收起）',
    await evaluate(`[...document.querySelectorAll('[data-test="dynasty-group-title"]')].map(b => b.getAttribute('aria-expanded'))`),
    ['false', 'false']);
  // 两组都展开（矮视口下才滚得动）＋ 记录朝代视图的滚动位置与展开状态
  await evaluate(`(() => {
    for (const b of document.querySelectorAll('[data-test="dynasty-group-title"]')) {
      if (b.getAttribute('aria-expanded') !== 'true') b.click();
    }
    return true;
  })()`);
  await sleep(120);
  const dynY = await evaluate(`(() => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, Math.min(60, Math.max(0, max)));
    return window.scrollY;
  })()`);
  check('（前置）矮视口下朝代视图也可滚动', dynY > 0, `scrollY=${dynY}`);
  const dynExpandedBefore = await evaluate(`[...document.querySelectorAll('[data-test="dynasty-group-title"]')].map(b => b.getAttribute('aria-expanded'))`);
  // 切到标签：标签页自己的展开与滚动应当原样回来
  await evaluate(`document.querySelector('[data-test="tab-tags"]').click(); true`);
  await waitForTagsView();
  await waitFor(`Math.abs(window.scrollY - ${tagScroll}) <= 2`, { label: '切回标签 tab 后恢复自己的滚动', timeout: 5000 });
  const tagsAfterSwitch = await evaluate(`({
    expanded: [...document.querySelectorAll('[data-test="tag-group-title"]')].map(b => b.getAttribute('aria-expanded')),
    y: window.scrollY,
  })`);
  eq('切到标签 tab：标签页自己的展开状态仍在', tagsAfterSwitch.expanded, ['true', 'false', 'false']);
  check('切到标签 tab：标签页自己的滚动位置恢复（±2px）',
    Math.abs(tagsAfterSwitch.y - tagScroll) <= 2, `记下 ${tagScroll} → 回来 ${tagsAfterSwitch.y}`);
  // 再切回朝代：朝代自己的展开与滚动也仍在
  await evaluate(`document.querySelector('[data-test="tab-dynasty"]').click(); true`);
  await waitForDynastyView();
  await waitFor(`Math.abs(window.scrollY - ${dynY}) <= 2`, { label: '切回朝代 tab 后恢复自己的滚动', timeout: 5000 });
  const dynAfterSwitch = await evaluate(`({
    expanded: [...document.querySelectorAll('[data-test="dynasty-group-title"]')].map(b => b.getAttribute('aria-expanded')),
    y: window.scrollY,
  })`);
  eq('切回朝代 tab：朝代页自己的展开状态仍在', dynAfterSwitch.expanded, dynExpandedBefore);
  check('切回朝代 tab：朝代页自己的滚动位置恢复（±2px）',
    Math.abs(dynAfterSwitch.y - dynY) <= 2, `记下 ${dynY} → 回来 ${dynAfterSwitch.y}`);

  // ---- 10i 原朝代阅读全链回归：从朝代 tab 进的诗，「返回」回**朝代**（不是标签） ----
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 2, mobile: false });
  await sleep(150);
  const dynPoemId = tagDoc.poems[0].id;
  await evaluate(`document.querySelector('[data-test="dynasty-group"] [data-test="poem-row"]').click(); true`);
  await waitForPoemView(dynPoemId);
  eq('从朝代 tab 进诗：「返回」文案是「← 目录」',
    await evaluate(`document.querySelector('[data-test="back-to-index"]').textContent`), '← 目录');
  await evaluate(`document.querySelector('[data-test="back-to-index"]').click(); true`);
  await waitForDynastyView();
  eq('从朝代 tab 进的诗，返回回**朝代视图**（不是标签）', await evaluate('location.hash'), '#/');
  eq('朝代视图的展开状态也还在',
    await evaluate(`[...document.querySelectorAll('[data-test="dynasty-group-title"]')].map(b => b.getAttribute('aria-expanded'))`),
    dynExpandedBefore);

  // ---- 10j 关于页的「返回」也回原视图 ----
  await evaluate(`document.querySelector('[data-test="tab-tags"]').click(); true`);
  await waitForTagsView();
  await evaluate(`document.querySelector('[data-test="about-link"]').click(); true`);
  await waitForAboutView();
  eq('从标签视图进「关于」：返回文案是「← 标签」',
    await evaluate(`document.querySelector('[data-test="about-back-to-index"]').textContent`), '← 标签');
  eq('从标签视图进「关于」：返回地址是 #/tags',
    await evaluate(`document.querySelector('[data-test="about-back-to-index"]').getAttribute('href')`), '#/tags');
  await evaluate(`document.querySelector('[data-test="about-back-to-index"]').click(); true`);
  await waitForTagsView();
  eq('关于页返回后回到标签视图（不是朝代）', await evaluate('location.hash'), '#/tags');

  await cdp.send('Emulation.clearDeviceMetricsOverride');
  check('标签 tab 一整节没有新增未捕获异常 / JS error 日志（累计）',
    pageErrors.length === 0, pageErrors.join(' | ') || '（无）');
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
