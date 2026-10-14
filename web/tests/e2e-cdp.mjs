#!/usr/bin/env node
/* 端到端验证：无头 Chromium + CDP（零第三方依赖，只用 node 自带的 fetch / WebSocket）。
 *
 *   node web/tests/e2e-cdp.mjs
 *   CHROME_BIN=/path/to/chrome node web/tests/e2e-cdp.mjs
 *
 * 基座内容：优先 `dist/content.json`（真实产物）；没有就现场调 `tools/build-content.mjs` 编一份；
 * 两者都没有才退回 `fixtures/content.placeholder.json` 并在报告里大声说明「跑的不是真实内容」。
 * 更新/失败变体一律**从基座现场派生**（scripts/lib/variants.mjs），所以更新流程验的是真实内容上的删/改/增。
 *
 * 覆盖：
 *   0. 纯逻辑自测（版本比较 / 切换决策 / 结构校验 / **次序策略**）
 *   1. 真实内容首访：19 首、1 个分组、**目录次序 == 产物数组次序**、钉死回归（第 1 首必须是 行行重行行）
 *   2. 跨组搜索：命中保持产物数组相对次序
 *   3. 诗页：逐行文本与 JSON 完全一致、分节/空行、异文块、无笔记的真实空状态
 *   4. Service Worker 注册 + 资源缓存；断言 content.json **没有**进资源缓存；config.js ↔ sw.js 常量一致
 *   5. 真离线（CDP 断网 + **关掉本地服务进程**）下重载仍可读
 *   6. 内容更新：完整下载 + 校验通过才切换（先 staged 不打断阅读，回目录生效）；删/改/增都生效
 *   7. 四种失败：校验和损坏、非法 JSON、formatVersion 不兼容、远端更旧 → 全部保留旧版
 *   8. 离线持久化 / 模拟清除站点数据后如实提示 / 恢复后自愈
 *   10. 最小产物形状（只有 orderInSource）仍照数组次序；11. 老产物（无 orderInSource）退回本机拼音排序
 *   9. 整轮没有未捕获 JS 异常
 *
 * 产物（截图 + DOM 转储）写到 web/tests/artifacts/（已 gitignore）。
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SUPPORTED_FORMAT_VERSION, compareContentVersion, decideUpdate, validateContent,
} from '../app/content.js';
import { APP_VERSION, CONTENT_DB, RESOURCE_CACHE_PREFIX, resourceCacheName } from '../app/config.js';
import { comparePoems, groupPoems, hasProductOrder, isUnknownAuthor, productOrderStatus, searchPoems, UNKNOWN_AUTHORS } from '../app/render.js';
import { buildVariants } from '../scripts/lib/variants.mjs';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const repoRoot = resolve(webRoot, '..');
const artifactsDir = resolve(webRoot, 'tests', 'artifacts');
const contentTarget = resolve(webRoot, 'content.json');
const checksumTarget = resolve(webRoot, 'content.json.sha256');
const PORT = Number(process.env.TEST_PORT || 8137);
const DEBUG_PORT = Number(process.env.TEST_DEBUG_PORT || 9237);
const CHROME_BIN = process.env.CHROME_BIN
  || 'C:/Users/wsqsy/AppData/Local/Chromium/Application/chrome.exe';
const BASE = `http://127.0.0.1:${PORT}/`;
const NODE = process.execPath;

/** 用户 2026-10-14 拍板：组内次序用 `--order source`，保留《文选》卷二十九原次序（A 线的
 *  orderInSource = 1..19）。这里写成硬编码的确定性期望：任何客户端重排（拼音排序等）都会
 *  把它打乱（行行重行行的 orderInSource 是 1、在数组首位，重排会把它推到末尾），从而暴露回归。 */
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

// ------------------------------------------------------------------ 次序 oracle（独立于 app 代码实现）

/** 期望的目录次序：组的次序照产物 dynasties 数组，组内照产物 poems 数组次序。 */
function expectedDomOrder(doc) {
  const out = [];
  for (const d of doc.dynasties) {
    for (const p of doc.poems) if (p.dynastyKey === d.key) out.push(p.id);
  }
  return out;
}

/** 本机拼音兜底会排成什么样（用 app 的兜底比较器，只在「产物一首都没带 orderInSource」时才该被用到）。 */
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
const waitForIndex = () => waitFor(`Boolean(document.querySelector('[data-test="view-index"]'))`, { label: '目录视图' });
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

// 页面侧读取
const domPoemIds = () => evaluate(`[...document.querySelectorAll('[data-test="poem-row"]')].map(r => r.dataset.poemId)`);
const groupKeys = () => evaluate(`[...document.querySelectorAll('[data-test="dynasty-group"]')].map(g => g.dataset.dynastyKey)`);
const searchTitles = () => evaluate(`[...document.querySelectorAll('[data-test="poem-row"] .poem-row-title')].map(e => e.textContent)`);
const fetchDiskDoc = () => evaluate(`(async () => JSON.parse(await (await fetch('content.json?t=' + Date.now(), { cache: 'no-store' })).text()))()`);
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
  db.close();  // 不关连接会阻塞 deleteDatabase（测「清站点数据」时被阻塞过）
  return rows.map(r => [r.k, r.doc.contentVersion]);
})()`);

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

// ------------------------------------------------------------------ 内容基座 / 变体落盘

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

async function writeContent(text, checksumMode = 'correct') {
  await writeFile(contentTarget, text, 'utf8');
  await writeFile(checksumTarget, checksumMode === 'wrong'
    ? `${'0'.repeat(64)}  content.json\n`
    : `${sha256(text)}  content.json\n`, 'utf8');
}

async function resolveBaseContent() {
  const distPath = resolve(repoRoot, 'dist', 'content.json');
  if (existsSync(distPath)) {
    return { text: await readFile(distPath, 'utf8'), origin: 'dist/content.json（真实产物）' };
  }
  const builder = resolve(repoRoot, 'tools', 'build-content.mjs');
  if (existsSync(builder)) {
    console.log('dist/content.json 不存在 → 现场编译一份（tools/build-content.mjs）');
    const child = spawn(NODE, [builder, '--out', distPath, '--content-version', '2026.10.14.1', '--order', 'source'], { stdio: 'inherit' });
    const code = await new Promise((r) => child.on('exit', r));
    if (code !== 0) throw new Error('tools/build-content.mjs 编译失败');
    return { text: await readFile(distPath, 'utf8'), origin: 'dist/content.json（本次现场编译）' };
  }
  const fixture = resolve(webRoot, 'fixtures', 'content.placeholder.json');
  console.log('！！ 既没有 dist/content.json 也没有 tools/build-content.mjs：本次跑的是**占位夹具**，不是真实内容。');
  return { text: await readFile(fixture, 'utf8'), origin: 'fixtures/content.placeholder.json（占位夹具，不是真实内容）' };
}

/** 用文档化的 dev 脚本落盘（顺便验证这个脚本本身）。 */
async function prepareViaCli(extraArgs = []) {
  const child = spawn(NODE, [resolve(webRoot, 'scripts', 'prepare-dev-content.mjs'), ...extraArgs], { stdio: 'pipe' });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  const code = await new Promise((r) => child.on('exit', r));
  if (code !== 0) throw new Error(`prepare-dev-content ${extraArgs.join(' ')} 失败：${out}`);
  return out.trim().split('\n');
}

// ------------------------------------------------------------------ 0. 纯逻辑 + 次序策略自测

function unitTests(baseDoc, variants) {
  section('0 纯逻辑自测（node 直接 import app/content.js 与 app/render.js）');
  check('版本比较：2026.10.14.2 > 2026.10.14.1', compareContentVersion('2026.10.14.2', '2026.10.14.1') > 0);
  check('版本比较逐段数值：2026.10.14.10 > 2026.10.14.9（纯字典序会判反）',
    compareContentVersion('2026.10.14.10', '2026.10.14.9') > 0);
  check('版本比较：发布版 > dev 版', compareContentVersion('2026.10.14.1', '0.0.0-dev+abcdef123456') > 0);
  check('版本比较：dev 版之间按十六进制串比', compareContentVersion('0.0.0-dev+ff', '0.0.0-dev+0a') > 0);
  check('版本比较相等', compareContentVersion('2026.10.14.1', '2026.10.14.1') === 0);

  eq('本地无内容 → first', decideUpdate(null, { formatVersion: 1, contentVersion: 'x' }).action, 'first');
  eq('更高内容版本 → accept', decideUpdate({ contentVersion: '2026.10.14.1' }, { formatVersion: 1, contentVersion: '2026.10.14.2' }).action, 'accept');
  eq('同版本 → up-to-date', decideUpdate({ contentVersion: '2026.10.14.2' }, { formatVersion: 1, contentVersion: '2026.10.14.2' }).action, 'up-to-date');
  eq('远端更旧 → up-to-date（不降级）', decideUpdate({ contentVersion: '2026.10.14.2' }, { formatVersion: 1, contentVersion: '2020.1.1.1' }).action, 'up-to-date');
  eq('formatVersion 更高 → refuse-format（不解析）',
    decideUpdate({ contentVersion: '2026.10.14.2' }, { formatVersion: SUPPORTED_FORMAT_VERSION + 1, contentVersion: '2026.10.15.1' }).action,
    'refuse-format');

  const badKey = validateContent({ formatVersion: 1, contentVersion: 'x', dynasties: [{ key: 'han', label: '汉', order: 100 }], poems: [{ id: 'a', title: 't', author: '佚名', dynastyKey: 'tang', dynastyLabel: '唐', dynastyOrder: 400, stanzas: [['一']] }] });
  check('结构校验：dynastyKey 未声明 → 失败', badKey.ok === false, badKey.errors.join(' / '));
  const emptyStanza = validateContent({ formatVersion: 1, contentVersion: 'x', dynasties: [], poems: [{ id: 'a', title: 't', author: '佚名', dynastyKey: 'han', dynastyLabel: '汉', dynastyOrder: 100, stanzas: [[]] }] });
  check('结构校验：stanzas 全空 → 失败', emptyStanza.ok === false, emptyStanza.errors.join(' / '));

  // ---- 次序策略（编译期是唯一排序权威）----
  section('0b 次序策略：产物带了 orderInSource 时一律不重排（回归）');
  eq('真实产物被判定为「产物次序权威」', hasProductOrder(baseDoc), true);
  eq('真实产物 19 首的诗名次序 == 用户拍板的《文选》原次序',
    baseDoc.poems.map((p) => p.title), SOURCE_ORDER_TITLES);
  eq('判定依据是 orderInSource（19 首全是整数）', productOrderStatus(baseDoc), {
    present: baseDoc.poems.length, usable: baseDoc.poems.length, productOrderAuthoritative: true, wrongType: false,
  });
  eq('目录次序 == 产物数组次序', groupPoems(baseDoc).flatMap((g) => g.poems.map((p) => p.id)), expectedDomOrder(baseDoc));
  check('本机拼音排序会与产物次序不同（这条断言才有牙齿）',
    dump(fallbackOrder(baseDoc)) !== dump(expectedDomOrder(baseDoc)));
  eq('本机拼音排序会把第 1 首推到队列末尾',
    fallbackOrder(baseDoc)[baseDoc.poems.length - 1], baseDoc.poems[0].id);
  eq('搜索命中保持产物数组相对次序',
    searchPoems(baseDoc, '佚名').map((p) => p.id),
    baseDoc.poems.filter((p) => p.title.includes('佚名') || p.author.includes('佚名')).map((p) => p.id));

  section('0c 客户端不再读两个拼音名次键（即使产物里还带着）');
  const keysButNoIndex = structuredClone(baseDoc);
  keysButNoIndex.poems.forEach((p) => {
    p.authorSortKey = 0;
    p.titleSortKey = 0;
    delete p.orderInSource;
  });
  eq('只带拼音键、没有 orderInSource → 不认，退回兜底',
    productOrderStatus(keysButNoIndex),
    { present: 0, usable: 0, productOrderAuthoritative: false, wrongType: false });
  eq('退回兜底后的次序 == 本机拼音序',
    groupPoems(keysButNoIndex).flatMap((g) => g.poems.map((p) => p.id)), fallbackOrder(keysButNoIndex));
  eq('最小产物形状（只有 orderInSource）→ 仍认产物次序',
    hasProductOrder(variants.minimal.doc), true);
  eq('最小形状的目录次序 == 其数组次序',
    groupPoems(variants.minimal.doc).flatMap((g) => g.poems.map((p) => p.id)), expectedDomOrder(variants.minimal.doc));
  check('最小形状产物确实不带两个拼音键',
    variants.minimal.doc.poems.every((p) => p.authorSortKey === undefined && p.titleSortKey === undefined));

  section('0d 老产物（一首都没带 orderInSource）才退回本机拼音兜底');
  const noKeysDoc = variants.noOrderIndex.doc;
  eq('无 orderInSource → 判定为需要兜底', hasProductOrder(noKeysDoc), false);
  check('老产物夹具确实既没有 orderInSource 也没有两个拼音键',
    noKeysDoc.poems.every((p) => p.orderInSource === undefined && p.authorSortKey === undefined && p.titleSortKey === undefined));
  eq('兜底次序 == 本机拼音序', groupPoems(noKeysDoc).flatMap((g) => g.poems.map((p) => p.id)), fallbackOrder(noKeysDoc));
  check('兜底次序 ≠ 数组次序（说明兜底真的在起作用）',
    dump(groupPoems(noKeysDoc).flatMap((g) => g.poems.map((p) => p.id))) !== dump(expectedDomOrder(noKeysDoc)));

  section('0e orderInSource 类型不对（非整数）视为「没给」，且不静默');
  const stringIndex = structuredClone(baseDoc);
  stringIndex.poems.forEach((p) => { p.orderInSource = String(p.orderInSource); });
  eq('字符串 orderInSource → 不认，退回兜底',
    productOrderStatus(stringIndex), { present: stringIndex.poems.length, usable: 0, productOrderAuthoritative: false, wrongType: true });
  eq('退回兜底后的次序 == 本机拼音序', groupPoems(stringIndex).flatMap((g) => g.poems.map((p) => p.id)), fallbackOrder(stringIndex));

  section('0f 佚名/未知作者清单逐字对齐契约 §2.1（三端曾不一致）');
  const contractText = readFileSync(resolve(repoRoot, 'docs', 'design', 'content-contract.md'), 'utf8');
  const contractList = /`佚名`\/`无名氏`\/`未知`\/`未详`\/`不详`\/空/.exec(contractText);
  check('契约 §2.1 里能找到那份清单（否则这条测试自身先失效）', Boolean(contractList), contractList ? contractList[0] : '没找到该清单');
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
    [...orderedAuthors.slice(0, 3)].sort().join() === ['杨万里', '苏轼', '阙名'].sort().join(),
    dump(orderedAuthors));
  check('五个「未知作者」（含空白）排在最后',
    orderedAuthors.slice(3).length === 5 && orderedAuthors.slice(3).every((a) => isUnknownAuthor(a)),
    dump(orderedAuthors));
  check('「未知」真的被当成未知（要是漏了它就会掉到具名那一段）',
    isUnknownAuthor('未知') && orderedAuthors.indexOf('未知') >= 3, dump(orderedAuthors));
  check('空白作者算未知作者', isUnknownAuthor('') && isUnknownAuthor('   ') && orderedAuthors.indexOf('') >= 3);

  section('0g 仓库里两份夹具自身合法（防止夹具自己慢慢烂掉）');
  for (const name of ['content.placeholder.json', 'content.no-sortkeys.json']) {
    const doc = JSON.parse(readFileSync(resolve(webRoot, 'fixtures', name), 'utf8'));
    const v = validateContent(doc);
    check(`fixtures/${name} 通过结构校验`, v.ok, v.errors.join(' / ') || 'ok');
    check(`fixtures/${name} 带上「夹具」标记（不会被当成发布内容）`, doc.placeholder === true, `placeholder=${doc.placeholder}`);
  }

  section('0h 分组的次序照产物 dynasties 数组（不在客户端重排）');
  const flipped = structuredClone(baseDoc);
  flipped.dynasties = [...flipped.dynasties].reverse();
  if (flipped.dynasties.length > 1) {
    eq('组次序跟着 dynasties 数组走', groupPoems(flipped).map((g) => g.key), flipped.dynasties.map((d) => d.key));
  } else {
    check('基座只有一个分组，跳过「组次序跟 dynasties 数组」反序断言（另用夹具覆盖）',
      groupPoems(flipped).map((g) => g.key).length === 1);
  }
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

  const base = await resolveBaseContent();
  const baseDoc = JSON.parse(base.text);
  const total = baseDoc.poems.length;
  console.log(`\n基座内容：${base.origin}`);
  console.log(`  formatVersion=${baseDoc.formatVersion} contentVersion=${baseDoc.contentVersion} poems=${total} dynasties=${baseDoc.dynasties.map((d) => d.key).join(',')}`);

  const variants = {};
  for (const [k, v] of Object.entries(buildVariants(baseDoc))) {
    variants[k] = { ...v, doc: (() => { try { return JSON.parse(v.text); } catch { return null; } })() };
  }
  for (const k of ['update', 'update2', 'lower', 'corrupt', 'broken', 'future', 'minimal', 'noOrderIndex']) {
    console.log(`  变体 ${k}: ${variants[k].note}`);
  }
  const minimalDoc = variants.minimal.doc;
  const noOrderIndexDoc = variants.noOrderIndex.doc;
  console.log(`  基座产物是否还带两个拼音名次键：${baseDoc.poems.some((p) => 'authorSortKey' in p || 'titleSortKey' in p)
    ? '还带着（C 线的移除还没到 master；客户端已不读它们，本轮用 minimal 变体验证改完后的形状）'
    : '已移除（与 C 线改动一致）'}`);

  unitTests(baseDoc, variants);

  await prepareViaCli();
  console.log(`\n落盘：${(await readFile(contentTarget, 'utf8').then((t) => t.length))} 字节 → web/content.json`);

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

  // ---------------------------------------------------------------- 1. 真实内容首访
  section('1 真实内容首访（在线）：19 首 / 分组 / 次序 = 产物数组次序');
  await goto(BASE);
  await waitForIndex();
  let s = await summary();
  eq('站点标题（用户拍板的展示名）', await evaluate('document.title'), '索斐');
  eq('内容版本', s.contentVersion, baseDoc.contentVersion);
  eq('诗数量', s.poems, total);
  check('本次跑的是真实产物（不是占位夹具，也不是测试夹具）',
    baseDoc.placeholder !== true && baseDoc.fixture !== true && total === 19,
    `${base.origin}（${total} 首；placeholder=${baseDoc.placeholder === true} fixture=${baseDoc.fixture === true}）`);
  check('真实产物没有夹具黄条', !(await evaluate(`Boolean(document.querySelector('[data-test="fixture-notice"]'))`)));
  eq('分组 keys / labels', await evaluate(`[...document.querySelectorAll('[data-test="dynasty-group"]')]
    .map(g => [g.dataset.dynastyKey, g.querySelector('[data-test="dynasty-label"]').textContent])`),
  baseDoc.dynasties.map((d) => [d.key, d.label]));

  // 次序：整串相等（这是本轮返修的核心）+ 用户拍板的确定性次序
  const expectOrder = expectedDomOrder(baseDoc);
  const domOrder = await domPoemIds();
  eq('目录次序 == 产物数组次序（整串）', domOrder, expectOrder);
  eq('汉组目录的诗名次序 == 用户拍板的《文选》卷二十九原次序（19 首，确定性）',
    await evaluate(`[...document.querySelectorAll('[data-test="poem-row"] .poem-row-title')].map(e => e.textContent)`),
    SOURCE_ORDER_TITLES);
  eq('汉组首尾两端', await evaluate(`(() => {
    const t = [...document.querySelectorAll('[data-test="poem-row"] .poem-row-title')].map(e => e.textContent);
    return [t[0], t[t.length - 1], t.length];
  })()`), ['行行重行行', '明月何皎皎', 19]);
  check('这不是「碰巧相等」：本机拼音排序会排出不同次序',
    dump(fallbackOrder(baseDoc)) !== dump(expectOrder),
    `拼音序前 3=${dump(fallbackOrder(baseDoc).slice(0, 3))} 产物序前 3=${dump(expectOrder.slice(0, 3))}`);
  const pinyinTitles = baseDoc.poems.filter((p) => p.dynastyKey === 'han').slice().sort(comparePoems).map((p) => p.title);
  check('拍板的次序也不是拼音序（所以上一条确定性断言能钉住重排）',
    dump(SOURCE_ORDER_TITLES) !== dump(pinyinTitles),
    `拼音序前3=${dump(pinyinTitles.slice(0, 3))} 拍板序前3=${dump(SOURCE_ORDER_TITLES.slice(0, 3))}`);

  // 钉死回归：真实产物第 1 首必须是 行行重行行（orderInSource 最小 = 1，而拼音序会把它排到最后）
  const firstPoem = baseDoc.poems[0];
  const minOrderInSource = Math.min(...baseDoc.poems.map((p) => p.orderInSource));
  eq('真实产物第 1 首是 行行重行行', firstPoem.title, '行行重行行');
  eq('真实产物第 1 首的 id', firstPoem.id, 'gushi-shijiu-shou-01');
  eq('它的 orderInSource 是全场最小（1 = 底本原次序首篇）', firstPoem.orderInSource, minOrderInSource);
  eq('orderInSource 最小就是 1', minOrderInSource, 1);
  eq('目录第 1 行 == 产物第 1 首（客户端重排会在这里报红）', domOrder[0], firstPoem.id);
  eq('本机拼音重排会把它推到第 19 位（所以上一条断言有牙齿）',
    fallbackOrder(baseDoc).indexOf(firstPoem.id), total - 1);
  eq('产物数组次序按底本原次序（orderInSource 递增）',
    baseDoc.poems.map((p) => p.orderInSource), baseDoc.poems.map((_, i) => i + 1));

  includes('状态面板写明次序由产物决定',
    await evaluate(`document.querySelector('[data-test="status-order-mode"]').textContent`), '照产物数组次序');
  eq('笔记全空：产物 19 首 notes 都是 null', baseDoc.poems.filter((p) => p.notes !== null).length, 0);
  await pushDump('首访目录（真实内容）');
  await screenshot('01-index-real-content.png');

  // ---------------------------------------------------------------- 2. 搜索
  section('2 跨组搜索（真实内容，命中保持产物数组相对次序）');
  await setQuery('佚名');
  eq('搜索作者「佚名」命中全部 19 首且次序 = 产物次序', await domPoemIds(), expectOrder);
  await setQuery('行行');
  eq('搜索诗名片段「行行」', await searchTitles(), ['行行重行行']);
  const qingIds = baseDoc.poems.filter((p) => p.title.includes('青')).map((p) => p.id);
  await setQuery('青');
  eq(`搜索「青」命中 ${qingIds.length} 首，次序 = 产物次序`,
    await evaluate(`[...document.querySelectorAll('[data-test="poem-row"]')].map(r => r.dataset.poemId)`), qingIds);
  await pushDump('搜索结果（青）', '[data-test="view-search"]');
  await screenshot('02-search-real.png');
  await setQuery('没有这首诗');
  check('无命中时给真实空状态', await evaluate(`Boolean(document.querySelector('[data-test="search-empty"]'))`));
  await setQuery('');

  // ---------------------------------------------------------------- 3. 诗页（真实内容）
  section('3 诗页（真实内容）：逐行文本 / 分节 / 异文 / 无笔记空状态');
  const p1 = baseDoc.poems[0];
  await hashTo(`#/p/${p1.id}`);
  await waitForPoemView(p1.id);
  eq('逐行文本与 JSON 完全一致', await evaluate(`[...document.querySelectorAll('[data-test="poem-line"]')].map(e => e.textContent)`), p1.stanzas.flat());
  eq('分节数量与 JSON 一致', await evaluate(`document.querySelectorAll('[data-test="stanza"]').length`), p1.stanzas.length);
  eq('行元素 white-space=pre-wrap（防止 HTML 折叠行内空白）',
    await evaluate(`getComputedStyle(document.querySelector('[data-test="poem-line"]')).whiteSpace`), 'pre-wrap');
  check('真实第 1 首有多行正文（不是空壳）', p1.stanzas.flat().length >= 4, `lines=${p1.stanzas.flat().length}`);
  check('notes: null → 如实空状态，不伪造笔记',
    await evaluate(`Boolean(document.querySelector('[data-test="notes-empty"]'))`));
  includes('诗页显示底本来源', await evaluate(`document.querySelector('[data-test="source-block"]').innerText`), '《文选》');
  includes('有异文时诗页显示异文', await evaluate(`document.querySelector('[data-test="source-block"]').innerText`), p1.variants[0].text);
  const poemText = await pushDump('诗页（真实内容·行行重行行）');
  console.log(`\n---- 诗页 innerText（原样输出，供人工核对分行）----\n${poemText}\n-----------------------------------------------`);
  await screenshot('03-poem-real.png');

  const withVariants = baseDoc.poems.filter((p) => (p.variants ?? []).length);
  check('真实内容里有带异文的诗（异文渲染不是空跑）', withVariants.length >= 1, `${withVariants.length} 首有异文`);
  const p12 = withVariants.reduce((a, b) => ((b.variants.length > a.variants.length) ? b : a));
  await hashTo(`#/p/${p12.id}`);
  await waitForPoemView(p12.id);
  const srcText = await evaluate(`document.querySelector('[data-test="source-block"]').innerText`);
  check(`诗页显示多条异文（${p12.title}，${p12.variants.length} 条）`,
    p12.variants.every((v) => srcText.includes(v.text)), srcText);

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
  eq('内容副本存在 IndexedDB，只有 active',
    (await idbRows()).map((r) => [r[0], r[1]]), [['active', baseDoc.contentVersion]]);

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
  includes('状态面板如实显示离线', await evaluate(`document.querySelector('[data-test="status-network"]').textContent`), '离线');
  includes('更新检查失败时如实说明并保留本地版本', s.lastCheck.result, '失败（保留本地版本）');
  eq('离线仍能读到内容版本', s.contentVersion, baseDoc.contentVersion);
  eq('离线目录次序仍是产物次序', await domPoemIds(), expectOrder);
  const offlineProbe = await evaluate(`(async () => {
    const shell = await fetch('index.html', { cache: 'reload' }).then(r => r.status).catch(e => 'rejected:' + e.name);
    const missing = await fetch('definitely-missing-xyz.txt', { cache: 'reload' }).then(r => r.status).catch(e => 'rejected:' + e.name);
    return { shell, missing, controller: Boolean(navigator.serviceWorker.controller) };
  })()`);
  eq('服务关掉后应用外壳仍由 Service Worker 缓存应答（200）', offlineProbe.shell, 200);
  check('同一次请求里去取一个未缓存的文件确实拿不到（服务不可达 ⇒ 上面的 200 只能来自本地缓存）',
    offlineProbe.missing !== 200 && offlineProbe.missing !== 404, `missing=${offlineProbe.missing}`);
  check('离线页仍受 Service Worker 控制', offlineProbe.controller);
  await setQuery('佚名');
  eq('离线搜索可用（内容来自 IndexedDB）', (await domPoemIds()).length, total);
  await setQuery('');
  await pushDump('离线目录（本地服务已关）');
  await screenshot('05-offline.png');
  await startServer();
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  console.log('（已恢复联网 + 重新起服务）');

  // ---------------------------------------------------------------- 6. 更新流程
  section('6 内容更新：完整下载 + 校验通过才切换；阅读中不替换');
  const p2 = baseDoc.poems[1];
  await hashTo(`#/p/${p1.id}`);
  await waitForPoemView(p1.id);
  const beforeText = await evaluate(`document.querySelector('[data-test="poem-body"]').innerText`);
  await writeContent(variants.update.text, variants.update.checksum);
  console.log(`落盘变体 update：${variants.update.note}`);
  const beforeCount = (await summary()).checkCount;
  await evaluate(`document.querySelector('[data-test="check-update"]').click(); true`);
  await waitFor(`window.__app.summary().checkCount > ${beforeCount}`, { label: '手动检查完成（真实按钮点击）' });
  s = await summary();
  eq('检查结果：已下载、因阅读中而暂不切换', s.lastCheck.result, '已下载，待切换（阅读中）');
  eq('当前生效版本没变（阅读中不突然替换）', s.contentVersion, baseDoc.contentVersion);
  eq('新版落到 staged', s.stagedVersion, variants.update.doc.contentVersion);
  eq('屏幕上正在读的诗文本没被替换',
    await evaluate(`document.querySelector('[data-test="poem-body"]').innerText`), beforeText);
  check('界面提示「已暂存、回到目录后生效」',
    await evaluate(`Boolean(document.querySelector('[data-test="update-staged"]'))`));
  eq('IndexedDB 里 active/staged 同时存在',
    await idbRows(), [['active', baseDoc.contentVersion], ['staged', variants.update.doc.contentVersion]]);
  await screenshot('06-staged-while-reading.png');

  section('6b staged 跨刷新保持，深链进诗页仍算「阅读中」');
  await reload();
  await waitForPoemView(p1.id);
  s = await summary();
  eq('刷新后仍是旧版在生效', s.contentVersion, baseDoc.contentVersion);
  eq('刷新后 staged 仍在', s.stagedVersion, variants.update.doc.contentVersion);
  check('刷新后仍提示待切换', await evaluate(`Boolean(document.querySelector('[data-test="update-staged"]'))`));

  section('6c 回到目录 → 自动原子切换；删 / 改 / 增都生效，次序仍照产物数组');
  const upd = variants.update;
  const expectUpd = expectedDomOrder(upd.doc);
  await evaluate(`document.querySelector('[data-test="back-to-index"]').click()`);
  await waitForIndex();
  // 先等目录真的按新版重绘（行数变了），否则可能读到切换前那一帧
  await waitFor(`document.querySelectorAll('[data-test="poem-row"]').length === ${expectUpd.length}`,
    { label: '回到目录后自动切换并重绘' });
  s = await summary();
  eq('生效版本更新到新版', s.contentVersion, upd.doc.contentVersion);
  eq('staged 已清空', s.stagedVersion, null);
  eq('切换后 IndexedDB 只剩 active（新版本）', await idbRows(), [['active', upd.doc.contentVersion]]);
  eq('目录次序 == 新产物数组次序（整串）', await domPoemIds(), expectUpd);
  eq('被删掉的诗在目录里没有', expectedDomOrder(upd.doc).filter((id) => upd.expect.dropped.includes(id)), []);
  eq('切换后第 1 行 == 新产物第 1 首（删掉原第 1 首后它顶上来了）', (await domPoemIds())[0], upd.doc.poems[0].id);
  eq('分组：新增的测试诗带来一个新分组', await groupKeys(), upd.expect.dynastyKeys);
  check('界面明确标出「测试夹具内容」（不是发布内容）',
    await evaluate(`document.querySelector('[data-test="fixture-notice-text"]').textContent.includes('测试夹具')`));
  await evaluate(`document.querySelector('[data-test="poem-row"][data-poem-id=${JSON.stringify(upd.expect.modifiedPoemId)}]').click()`);
  await waitForPoemView(upd.expect.modifiedPoemId);
  eq('被改过的那一行文本已是新版',
    await evaluate(`document.querySelector('[data-test="poem-line"]').textContent`), upd.expect.modifiedFirstLine);
  await hashTo('#/');
  await waitForIndex();
  await setQuery(upd.doc.poems[0].title.slice(0, 1));
  check('搜索结果里没有已删除的诗', !(await domPoemIds()).some((id) => upd.expect.dropped.includes(id)));
  await setQuery('');
  await pushDump('切换后的目录（测试夹具变体）');
  await screenshot('07-after-switch.png');

  section('6d 夹具特性：空行分段 + 笔记按需展开（新增的测试诗）');
  await evaluate(`document.querySelector('[data-test="poem-row"][data-poem-id="${upd.expect.addedPoemId}"]').click()`);
  await waitForPoemView(upd.expect.addedPoemId);
  const addedPoem = upd.doc.poems.find((p) => p.id === upd.expect.addedPoemId);
  eq('分节数量与 JSON 一致（空行表达的分段）', await evaluate(`document.querySelectorAll('[data-test="stanza"]').length`), addedPoem.stanzas.length);
  eq('每节的行数', await evaluate(`[...document.querySelectorAll('[data-test="stanza"]')].map(s => s.querySelectorAll('[data-test="poem-line"]').length)`), addedPoem.stanzas.map((x) => x.length));
  check('第二节与第一节之间有间距（空行由 stanzas 分段表达）',
    await evaluate(`parseFloat(getComputedStyle(document.querySelectorAll('[data-test="stanza"]')[1]).marginTop) > 0`));
  eq('笔记默认折叠', await evaluate(`document.querySelector('[data-test="notes-details"]').open`), false);
  check('展开前笔记正文为空（按需展开）',
    (await evaluate(`document.querySelector('[data-test="notes-body"]').innerText`)).trim() === '');
  await evaluate(`document.querySelector('[data-test="notes-summary"]').click()`);
  await waitFor(`document.querySelector('[data-test="notes-details"]').open === true`, { label: '笔记展开' });
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
  await pushDump('测试夹具诗（笔记已展开）');
  await screenshot('08-notes-open.png');

  section('6e update2：整组被删掉 → 那个分组随之消失');
  await hashTo('#/');
  await waitForIndex();
  await writeContent(variants.update2.text, variants.update2.checksum);
  const r2 = await evaluate(`(async () => JSON.parse(JSON.stringify(await window.__app.checkForUpdate({ manual: true }))))()`);
  eq('update2 生效', (await summary()).contentVersion, variants.update2.doc.contentVersion);
  check('检查结论是「已更新并切换」', ['已更新并切换'].includes(r2.result), r2.result);
  eq('分组回到只有基座那些组', await groupKeys(), variants.update2.expect.dynastyKeys);
  eq('目录次序仍需 == 新产物数组次序', await domPoemIds(), expectedDomOrder(variants.update2.doc));
  eq('那首测试诗没了', variants.update2.expect.addedPoemId, null);
  await screenshot('09-after-group-removal.png');

  // ---------------------------------------------------------------- 7. 失败保留旧版
  section('7 四种失败都保留旧版（校验和 / 非法 JSON / 格式版本 / 远端更旧）');
  const baseline = (await summary()).contentVersion;
  eq('基线版本', baseline, variants.update2.doc.contentVersion);
  const cases = [
    { variant: 'corrupt', result: '失败（保留本地版本）', detail: '校验和', note: '内容合法、版本更高，但边车哈希不匹配' },
    { variant: 'broken', result: '失败（保留本地版本）', detail: 'JSON', note: '截断的非法 JSON' },
    { variant: 'future', result: '拒绝（格式版本不兼容，保留旧版）', detail: '格式版本 2', note: 'formatVersion 更高 → 不解析、不切换' },
    { variant: 'lower', result: '已是最新', detail: '不比本地新', note: '版本更旧 → 不降级' },
  ];
  for (const c of cases) {
    const v = variants[c.variant];
    await writeContent(v.text, v.checksum ?? 'correct');
    const r = await evaluate(`(async () => JSON.parse(JSON.stringify(await window.__app.checkForUpdate({ manual: true }))))()`);
    eq(`[${c.variant}] ${c.note} → 结论`, r.result, c.result);
    includes(`[${c.variant}] 失败原因如实`, r.detail, c.detail);
    const after = await summary();
    eq(`[${c.variant}] 生效版本没被改动`, after.contentVersion, baseline);
    eq(`[${c.variant}] 没有留下 staged`, after.stagedVersion, null);
    eq(`[${c.variant}] 目录次序没被改动`, await domPoemIds(), expectedDomOrder(variants.update2.doc));
  }
  await pushDump('四次失败之后（内容未变）');
  await screenshot('10-after-refusals.png');

  // ---------------------------------------------------------------- 8. 离线持久化 / 清站点数据 / 自愈
  section('8 服务不可达时：切换后的版本仍可读');
  await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await stopServer();
  await reload();
  await waitForIndex();
  s = await summary();
  eq('服务关掉后重载仍是当前版本', s.contentVersion, baseline);
  eq('离线目录次序仍是产物次序', await domPoemIds(), expectedDomOrder(variants.update2.doc));
  includes('状态面板写明「清除站点数据」可能丢失离线副本（不承诺永久存储）',
    await evaluate(`document.querySelector('[data-test="honest-storage-note"]').textContent`), '清除站点数据');
  await screenshot('11-offline-persisted.png');

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
      const st = await attempt();
      seen.push(st);
      if (st === 'ok') break;
      await new Promise((r) => setTimeout(r, 250));
    }
    return { state: seen[seen.length - 1], seen };
  })()`);
  check('内容副本数据库已被删除（模拟「清除站点数据」）', deleteResult.state === 'ok', `每次尝试：${dump(deleteResult.seen)}`);
  await reload();
  await waitFor(`Boolean(document.querySelector('[data-test="view-fatal"]'))`, { label: '首次访问不可用时的如实状态' });
  eq('重新打开时本地内容副本确实是空的', (await idbRows()).map((r) => r[0]), []);
  const fatal = await evaluate(`document.querySelector('[data-test="fatal-text"]').textContent`);
  check('如实说明首次访问需要网络（不假装还能读）', fatal.includes('需要网络'), fatal);
  await screenshot('12-cleared-content-offline.png');

  section('8c 服务恢复后重新取得内容（自愈）');
  await prepareViaCli();
  await startServer();
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await reload();
  await waitForIndex();
  s = await summary();
  eq('重新取得内容版本', s.contentVersion, baseDoc.contentVersion);
  eq('重新取得后有完整 19 首', s.poems, total);
  eq('重新取得后次序仍是产物次序', await domPoemIds(), expectOrder);
  eq('内容副本重新落盘', await idbRows(), [['active', baseDoc.contentVersion]]);

  // ------------------------------------------------ 10. 最小产物形状 / 老产物兜底
  section('10 最小产物形状（只有 orderInSource、没有拼音名次键）= C 线改完后的产物');
  await writeContent(variants.minimal.text, variants.minimal.checksum);
  const rMin = await evaluate(`(async () => JSON.parse(JSON.stringify(await window.__app.checkForUpdate({ manual: true }))))()`);
  s = await summary();
  eq('最小形状产物被接受', s.contentVersion, minimalDoc.contentVersion);
  check('结论是「已更新并切换」', rMin.result === '已更新并切换', rMin.result);
  eq('最小形状下目录次序 == 产物数组次序', await domPoemIds(), expectedDomOrder(minimalDoc));
  eq('最小形状下第 1 行仍是 行行重行行', (await domPoemIds())[0], minimalDoc.poems[0].id);
  includes('状态面板说明照产物次序',
    await evaluate(`document.querySelector('[data-test="status-order-mode"]').textContent`), '照产物数组次序');
  await screenshot('13-minimal-product.png');

  section('11 老产物（一首都没带 orderInSource）→ 退回本机拼音排序兜底');
  await writeContent(variants.noOrderIndex.text, variants.noOrderIndex.checksum);
  const rOld = await evaluate(`(async () => JSON.parse(JSON.stringify(await window.__app.checkForUpdate({ manual: true }))))()`);
  s = await summary();
  eq('老产物被接受', s.contentVersion, noOrderIndexDoc.contentVersion);
  check('结论是「已更新并切换」', rOld.result === '已更新并切换', rOld.result);
  const noKeyExpected = fallbackOrder(noOrderIndexDoc);
  const noKeyArrayOrder = expectedDomOrder(noOrderIndexDoc);
  eq('目录次序 == 本机拼音兜底次序', await domPoemIds(), noKeyExpected);
  check('兜底次序 ≠ 产物数组次序（说明确实走了兜底，而不是照抄数组）',
    dump(noKeyExpected) !== dump(noKeyArrayOrder),
    `兜底前 3=${dump(noKeyExpected.slice(0, 3))} 数组前 3=${dump(noKeyArrayOrder.slice(0, 3))}`);
  includes('状态面板如实说明用的是本机拼音兜底',
    await evaluate(`document.querySelector('[data-test="status-order-mode"]').textContent`), '本机拼音兜底');
  await hashTo('#/');
  await waitForIndex();
  await screenshot('14-no-orderindex-fallback.png');
  await prepareViaCli();
  console.log('（已把真实产物重新落盘到 web/content.json，便于继续本地开发）');

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
