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
import { createServer } from 'node:net';
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
import { DEPLOY_FILES, DEPLOY_TEXT_FILES, makeDeployment } from './lib/deploy.mjs';

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

/** 以某个 URL **真·新开一次**（先跳到 about:blank 再过去）：
 *  用于验证「深链接直接打开」，避开「只改 hash 只是同文档切视图」这个区别。 */
async function openFresh(url) {
  await cdp.send('Page.navigate', { url: 'about:blank' });
  await sleep(200);
  await goto(url);
}
const summary = () => evaluate('JSON.parse(JSON.stringify(window.__app.summary()))');

async function setQuery(text) {
  await evaluate(`(() => {
    const el = document.querySelector('[data-test="search-input"]');
    el.value = ${JSON.stringify(text)};
    el.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
}

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
const searchTitles = () => evaluate(`[...document.querySelectorAll('[data-test="poem-row"] .poem-row-title')].map(e => e.textContent)`);
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

  // variants：**只解析与校验、不渲染**（用户决定：异文只存档、不上界面；Android 同此）。
  // 校验仍然生效，而界面上不该出现它 —— 反向断言在 §1c。
  const withVariants = baseDoc.poems.filter((p) => (p.variants ?? []).length > 0);
  check('真实产物里确实带着异文（字段仍在产物里，只是不显示）', withVariants.length > 0,
    `${withVariants.length} 首有异文，共 ${withVariants.reduce((a, p) => a + p.variants.length, 0)} 条`);
  const badVariants = structuredClone(baseDoc);
  badVariants.poems[0].variants = [{ text: '' }, 'nope'];
  const bv = validateContent(badVariants);
  check('variants 形状不对 → 结构校验仍然失败（只是不渲染，不是不校验）',
    bv.ok === false && bv.errors.length >= 2, bv.errors.join(' / '));
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
    dynasties: [{ key: 'song', label: '宋', order: 500 }],
    poems: ['苏轼', '杨万里', '佚名', ''].map((author, i) => ({
      id: `t-${i}`, title: `戏题${i}`, author, dynastyKey: 'song', dynastyLabel: '宋',
      dynastyOrder: 500, orderInSource: null, stanzas: [['一']], notes: null,
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
  // 阶段 A：HTML 一到就有可读状态（JS 还没跑也不白屏）。
  // 注意：这一步**不断言文案精确等于静态占位** —— JS 可能已经跑起来把文案换成「正在取内容」，
  // 两种都是对的；静态占位本身在 §0g 里从 index.html 源码直接断言过了。
  await waitFor(`Boolean(document.querySelector('[data-test="site-title"]'))`
    + ` && Boolean(document.querySelector('[data-test="view-loading"]'))`,
  { label: '外壳 + 装载提示可见', timeout: 20000 });
  const staticInfo = await evaluate(`({
    title: document.querySelector('[data-test="site-title"]').textContent,
    loading: document.querySelector('[data-test="view-loading"]').textContent,
    hasRows: document.querySelectorAll('[data-test="poem-row"]').length,
    loadingShown: window.__app ? window.__app.summary().loading : null,
  })`);
  includes('延迟下先看到外壳标题（不是白屏）', staticInfo.title, '索斐');
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

  // ------------------------------------------------ 1b 可分享 URL 形态（用户 2026-10-14 拍板：保持现状）
  section('1b 可分享 URL 形态：诗页深链接可直接打开、刷新仍在同一首；搜索不进地址栏');
  const deepPoem = baseDoc.poems[5];              // 挑一首非首首的，证明是按 id 定位、不是「碰巧第一首」
  await openFresh(`${BASE}#/p/${deepPoem.id}`);   // 真·新开一个文档落在这一首
  await waitForPoemView(deepPoem.id);
  eq('深链接直接打开就是这一首（按稳定 id 定位）',
    await evaluate(`document.querySelector('[data-test="view-poem"]').dataset.poemId`), deepPoem.id);
  eq('地址栏用的是契约 id', await evaluate('location.hash'), `#/p/${deepPoem.id}`);
  check('地址栏里没有把标题当路径（所以改标题不会让老链接失效）',
    !(await evaluate('location.hash')).includes(encodeURIComponent(deepPoem.title)));
  await reload();                                  // 刷新后仍定位到同一首
  await waitForPoemView(deepPoem.id);
  eq('刷新后仍在同一首',
    await evaluate(`document.querySelector('[data-test="view-poem"]').dataset.poemId`), deepPoem.id);
  eq('刷新后地址栏不变', await evaluate('location.hash'), `#/p/${deepPoem.id}`);

  await hashTo('#/');
  await waitForIndex();
  await setQuery('佚名');                          // 搜索不进地址栏（用户拍板）
  check('目录里搜索会显示结果', await evaluate(`Boolean(document.querySelector('[data-test="view-search"]'))`));
  // 命中高亮：令牌 `--mark-bg` / `--mark-text` 以前**只声明、没人用**（Android 有、Web 没有）——
  // 2026-10-15 逐屏材料实测 `<mark>` 数为 0 才发现。这里把它变成可断言的。
  const markInfo = await evaluate(`(() => {
    const hit = document.querySelector('[data-test="search-hit"]');
    const root = getComputedStyle(document.documentElement);
    const norm = (s) => String(s).replace(/\\s+/g, '');
    // 令牌可能写成 #rrggbb，而计算值总是 rgb()/rgba() —— 两边都过一遍探针元素，再比。
    const asColor = (v) => {
      const el = document.createElement('span');
      el.style.color = v;
      document.body.appendChild(el);
      const out = getComputedStyle(el).color;
      el.remove();
      return norm(out);
    };
    return {
      count: document.querySelectorAll('[data-test="search-hit"]').length,
      bg: hit ? norm(getComputedStyle(hit).backgroundColor) : null,
      fg: hit ? norm(getComputedStyle(hit).color) : null,
      tokenBg: asColor(root.getPropertyValue('--mark-bg')),
      tokenFg: asColor(root.getPropertyValue('--mark-text')),
    };
  })()`);
  check('搜索命中高亮真的画出来了（与 Android 同语义）', markInfo.count > 0, dump(markInfo));
  eq('命中高亮的底色 = 令牌 --mark-bg（不是自造色）', markInfo.bg, markInfo.tokenBg);
  eq('命中高亮的字色 = 令牌 --mark-text', markInfo.fg, markInfo.tokenFg);
  eq('搜索时地址栏不变、没有搜索参数',
    [await evaluate('location.hash'), (await evaluate('location.href')).includes('?q=')], ['#/', false]);
  await setQuery('');
  await hashTo('#/');
  await waitForIndex();

  // ------------------------------------------------ 1c 诗页渲染（真实内容）
  section('1c 诗页渲染：正文分行/分节与「底本」照旧；**异文不上界面**（用户决定，Android 同此）');
  const p1 = baseDoc.poems[0];                                             // 行行重行行：8 行、3 条异文
  const p9 = baseDoc.poems.find((x) => x.id === 'gushi-shijiu-shou-09');    // 其九：含「此物何足贵」
  await hashTo(`#/p/${p1.id}`);
  await waitForPoemView(p1.id);
  eq('逐行文本与 JSON 完全一致',
    await evaluate(`[...document.querySelectorAll('[data-test="poem-line"]')].map(e => e.textContent)`), p1.stanzas.flat());
  eq('分节数量与 JSON 一致', await evaluate(`document.querySelectorAll('[data-test="stanza"]').length`), p1.stanzas.length);
  eq('每节的行数',
    await evaluate(`[...document.querySelectorAll('[data-test="stanza"]')].map(s => s.querySelectorAll('[data-test="poem-line"]').length)`),
    p1.stanzas.map((x) => x.length));
  eq('行元素 white-space=pre-wrap（防止行内空白被折叠）',
    await evaluate(`getComputedStyle(document.querySelector('[data-test="poem-line"]')).whiteSpace`), 'pre-wrap');
  eq('题下那行（时代 · 作者 · 年代 · 体裁）与 Android 的取值与顺序一致',
    await evaluate(`document.querySelector('[data-test="poem-meta"]').textContent`),
    [p1.dynastyLabel, p1.author, p1.era, p1.genre].filter(Boolean).join(' · '));
  check('notes: null → 如实空状态，不伪造笔记', await evaluate(`Boolean(document.querySelector('[data-test="notes-empty"]'))`));

  const sourceInfo = await evaluate(`(() => {
    const dl = document.querySelector('[data-test="source-block"]');
    return { labels: [...dl.querySelectorAll('dt')].map(e => e.textContent), text: dl.innerText };
  })()`);
  eq('底本栏位仍在（与 Android 一致），且只有「底本」一项（诗的 id 不上界面，用户 2026-10-15）', sourceInfo.labels, ['底本']);
  includes('底本/来源的文字照旧显示', sourceInfo.text, p1.source);
  check('没有「异文」栏位（连空占位也没有）',
    !sourceInfo.labels.includes('异文') && !sourceInfo.text.includes('未记录'), dump(sourceInfo.labels));

  // 关键反向断言：诗页不得出现异文文本（上线实测就是这条没覆盖到）
  for (const poem of [p1, p9]) {
    await hashTo(`#/p/${poem.id}`);
    await waitForPoemView(poem.id);
    const viewText = await evaluate(`document.querySelector('[data-test="view"]').innerText`);
    const variantTexts = (poem.variants ?? []).map((v) => v.text);
    check(`[${poem.title}] 页面上没有任何 variants[].text（${variantTexts.join('、')}）`,
      variantTexts.every((t) => !viewText.includes(t)), dump(variantTexts));
    // 「异文」二字：底本/来源文字里本来就带「异文校记见…」（Android 也一样显示它），
    // 所以这里精确断言「出现次数 == 来源文字里的次数」，即没有额外的异文栏位文字。
    eq(`[${poem.title}] 页面上的「异文」二字只来自底本/来源文字本身`,
      viewText.split('异文').length - 1, poem.source.split('异文').length - 1);
    includes(`[${poem.title}] 底本/来源仍在`, viewText, poem.source);
    // 用户 2026-10-15 拍板：诗的 id 不上界面（此前 Web 单方面多出「id」一行，跨端不一致）。
    check(`[${poem.title}] 页面上不出现诗的 id（${poem.id}）`,
      !viewText.includes(poem.id), dump({ id: poem.id }));
  }
  await hashTo(`#/p/${p1.id}`);
  await waitForPoemView(p1.id);
  await pushDump('诗页（真实内容；异文不上界面）');
  await screenshot('03-poem-no-variants.png');
  // 回到目录：让后面的小节从已知状态开始（以前因为停在诗页 hash 上、reload 后等目录超时过）。
  await hashTo('#/');
  await waitForIndex();

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
      sourceFont: cs(document.querySelector('[data-test="source-block"] dd')).fontSize,
      sourceLineHeight: parseFloat(cs(document.querySelector('[data-test="source-block"] dd')).lineHeight),
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
  check('真实产物 19 首都是单节，所以段间空行的**元素级**断言在 §4e（夹具诗）上做',
    baseDoc.poems.every((p) => p.stanzas.length === 1),
    `最大节数=${Math.max(...baseDoc.poems.map((p) => p.stanzas.length))}`);
  eq('底本小字与原型 .poem-foot 一致（0.74rem → 11.84px）', poemVis.sourceFont, '11.84px');

  await hashTo('#/');
  await waitForIndex();
  const indexVis = await evaluate(`(() => {
    const cs = (el) => getComputedStyle(el);
    const row = document.querySelector('[data-test="poem-row"]');
    const chip = document.querySelector('.btn');
    const search = document.querySelector('[data-test="search-input"]');
    const sunken = document.querySelector('.status-list');
    const groupTitle = document.querySelector('.dynasty-group-title');
    const label = document.querySelector('[data-test="dynasty-label"]');
    return {
      rowBgHoverable: cs(row).borderBottomColor,
      rowShadow: cs(row).boxShadow,
      rowAnimation: cs(row).animationName,
      rowTransition: [cs(row).transitionProperty, cs(row).transitionDuration],
      chipTransition: [cs(chip).transitionProperty, cs(chip).transitionDuration],
      chipShadow: cs(chip).boxShadow,
      chipRadius: cs(chip).borderTopLeftRadius,
      searchBg: cs(search).backgroundColor,
      searchRadius: cs(search).borderTopLeftRadius,
      sunkenBg: cs(sunken).backgroundColor,
      sunkenRadius: cs(sunken).borderTopLeftRadius,
      groupBg: cs(groupTitle).backgroundColor,
      labelBorder: cs(label).borderLeftColor + ' ' + cs(label).borderLeftWidth,
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
  eq('卡面色 = --surface（#141b1e）', indexVis.searchBg, 'rgb(20, 27, 30)');
  eq('下沉面 = --surface-sunken（#111719）', indexVis.sunkenBg, 'rgb(17, 23, 25)');
  eq('圆角取值（下沉面/搜索框 = 4px，芯片 = --radius-pill 3px）',
    [indexVis.sunkenRadius, indexVis.searchRadius, indexVis.chipRadius], ['4px', '3px', '3px']);
  eq('列表行与按钮都没有阴影', [indexVis.rowShadow, indexVis.chipShadow], ['none', 'none']);
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
  check('组名左沿有发丝竖线（原型静默终端的结构记号）',
    /2px/.test(indexVis.labelBorder) && /rgba\(79, 179, 165/.test(indexVis.labelBorder), indexVis.labelBorder);
  check('组内计数用等宽字体', /mono|Consolas/i.test(indexVis.countFont), indexVis.countFont);

  // ---- 规范 §4.1「结构记号」三条（补漏：漏掉它们就与用户评审通过的那一版长得不一样）----
  eq('结构记号 1：组名左内边距 = 0.6rem（9.6px）', indexVis.labelPadLeft, '9.6px');
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
    await waitForIndex();
    await screenshot(`theme-tech-${label}-hub.png`);
    await hashTo(`#/p/${p1.id}`);
    await waitForPoemView(p1.id);
    await screenshot(`theme-tech-${label}-poem.png`);
  };
  await shootTheme(1280, 860, 'desktop');
  await shootTheme(430, 932, 'mobile');
  await cdp.send('Emulation.clearDeviceMetricsOverride');
  await hashTo('#/');
  await waitForIndex();
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
  eq('站点缓存名 = 前缀 + 站点版本', await siteCaches(), [expectedCache]);
  check('缓存里有外壳', entries.some((p) => p.endsWith('/index.html'))
    && entries.some((p) => p.endsWith('/app/main.js')) && entries.some((p) => p.endsWith('/styles.css')), dump(entries));
  check('缓存里有 content.json（内容与壳同一份清单、同一个 cache）',
    entries.some((p) => p.endsWith(`/${CONTENT_URL}`)), dump(entries));
  // 图标是**独立文件**（不再是内联 data: URI）⇒「离线首屏不缺图标」只能靠预缓存真的取到它们。
  // 逐项断言（不是抽查一个）：少一个图标就会在离线时掉图。
  const iconPaths = DEPLOY_FILES.filter((f) => f.startsWith('icons/'));
  eq(`预缓存里 ${iconPaths.length} 个图标都在（离线首屏图标不会缺）`,
    iconPaths.filter((p) => !entries.some((e) => e.endsWith(`/${p}`))), []);
  await waitFor(`document.querySelector('[data-test="status-site-cache"]').textContent.includes('含 content.json')`,
    { label: '状态面板显示缓存里含 content.json' });
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
  await hashTo('#/');            // 显式回目录：reload 落在哪个 hash 就渲染哪个视图，不依赖上一节留下的状态
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
  const v2App = deployVersions.v2;
  const v2 = await makeDeployment({ destDir: join(deployRoot, 'v2'), appVersion: v2App, contentText: variants.fixtureContent.text });
  console.log(`部署 v2：appVersion=${v2App} cache=${v2.cacheName} 内容 ${variants.fixtureContent.doc.poems.length} 首（含测试夹具诗）`);
  await redeploy(v2.destDir);

  // 4a 旧 SW 还在控制：页面仍是旧壳 + 旧内容（即使服务器已经是新版本）
  await reload();
  await waitForIndex();
  s = await summary();
  eq('服务器已换成 v2，但页面仍是旧壳（cache-first：不能旧壳配新内容）', s.appVersion, APP_VERSION);
  eq('页面内容也仍是旧内容（末首仍是 明月何皎皎）', (await evaluate(`[...document.querySelectorAll('[data-test="poem-row"] .poem-row-title')].map(e => e.textContent)`)).at(-1), '明月何皎皎');
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
  await waitForSiteCaches([v2.cacheName], '旧 cache 已删除、只剩新 cache');
  eq('旧 cache 已被新 SW 删掉', await siteCaches(), [v2.cacheName]);
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
  const gapPx = await evaluate(`parseFloat(getComputedStyle(document.querySelectorAll('[data-test="stanza"]')[1]).marginTop)`);
  check('第二节与第一节之间有间距（空行由 stanzas 分段表达）', gapPx > 0, `marginTop=${gapPx}px`);
  check('段间距 = --stanza-gap（1.2em × 17px = 20.4px）', Math.abs(gapPx - 17 * 1.2) < 0.2, `marginTop=${gapPx}px`);
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
  await waitForIndex();
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
  await waitForIndex();
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
  check('站点缓存确实清空了（上面那个 await 的删除循环的直接结果）', (await cacheKeys()).length === 0);
  await cdp.send('Page.navigate', { url: BASE });
  // 等服务不可达的错误页真的接上（外壳与 __app 都不存在），而不是睡固定时间再取快照。
  await waitFor(`!window.__app && !document.querySelector('[data-test="site-title"]')`,
    { label: '错误页接上（没有外壳、没有应用）', timeout: 15000 }).catch(() => {});
  const deadState = await evaluate(`({
    hasShell: Boolean(document.querySelector('[data-test="site-title"]')),
    hasApp: Boolean(window.__app),
  })`).catch(() => ({ hasShell: null, hasApp: null, unreachable: true }));
  check('没有外壳可缓存 + 服务不可达 ⇒ 应用没机会显示任何东西（浏览器只能给错误页）',
    deadState.hasShell === false || deadState.unreachable === true, dump(deadState));
  await screenshot('11-no-shell-offline.png');
  await startServer(v7.destDir);
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

  section('7c 恢复服务后重新访问 → 重新缓存并正常阅读（自愈）');
  await goto(BASE);
  await waitForIndex();
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
  eq('deploy 目录里没有测试/脚本文件', DEPLOY_FILES.filter((f) => f.startsWith('tests/') || f.startsWith('scripts/') || f.startsWith('fixtures/')), []);
  check('整轮没有未捕获异常 / JS 级 error 日志', pageErrors.length === 0, pageErrors.join(' | ') || '（无）');
  const shotsOk = screenshotAttempts.length - screenshotFailures.length;
  console.log(`\n截图：${shotsOk}/${screenshotAttempts.length} 成功`
    + (screenshotFailures.length ? `；失败：${screenshotFailures.join(' / ')}` : ''));

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
