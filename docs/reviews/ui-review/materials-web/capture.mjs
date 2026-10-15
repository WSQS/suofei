#!/usr/bin/env node
/**
 * 逐屏评审材料（Web）实拍脚本 —— 给用户逐格过账用（`docs/reviews/ui-review-checklist.md` A/B/C/E 各格）。
 *
 *   CHROME_BIN=... node docs/reviews/ui-review/materials-web/capture.mjs
 *
 * ------------------------------------------------------------------ 它拍的到底是什么
 *
 * **读的是哪个站点**：本地静态服务。每次都由本脚本自己起、自己关：
 *
 *   node <root>/web/scripts/serve.mjs --port <临时空闲端口> --root <部署目录>
 *
 * 部署目录由本脚本在**系统临时目录**里现场组装（`<tmp>/suofei-ui-review/…`，**不进仓库**），
 * 组装方式就是仓库自己的 `web/tests/lib/deploy.mjs: makeDeployment()`：
 *
 *   - 壳（index.html / styles.css / manifest.json / sw.js / app/*.js）取自**本工作树 web/ 的当前文件**；
 *   - 内容取自 `dist/content.json` —— 由 `node tools/build-content.mjs` 从 `content/poems/` 编出来的
 *     **真实产物（1 组 19 首）**，不是 `web/fixtures/` 里的夹具；缺失时本脚本会先编一份。
 *   - 站点资源版本 = `web/app/config.js` 的 `APP_VERSION`（抓图时的实际值写进 capture-manifest.json）。
 *
 * 也就是说：图是**真实运行 + 真实内容**跑出来的；唯一的例外是文件名里带 `fixture-supplement`
 * 的那一张（用测试部署内容看「长笔记展开」的排布），它自带醒目横幅、README 里也标了「不能用于过账」。
 *
 * 另外两类图**不是站点截图**，README 里逐张说明：
 *   - 带说明条的合成图（`b-deeplink.png`、`e-first-visit.png`、`b-notes-expanded--fixture-supplement.png`）：
 *     图内是**未被改动的真实截图**，上方由脚本加了一条说明条（原图另存为 `_raw-*.png`）。
 *   - `f-favicon-*.png`：favicon 小尺寸观感对照页（读的是站点 index.html 里那个 `<link rel="icon">`
 *     的真实字节；本树里 `web/icons/` 还不存在，所以没有新的无字记号可拍）。
 *
 * ------------------------------------------------------------------ 产物
 *
 *   <本目录>/*.png                图（含 `_raw-*.png` 未加工的原始截图）
 *   <本目录>/capture-manifest.json 每张图的机器可读台账：视口、像素尺寸、字节数、URL、
 *                                  站点/内容版本、内容 sha256、当时的 DOM 文本摘录、以及脚本实测的数字
 *   <本目录>/README.md             人读的说明（本脚本**不写**它 —— 由人写，避免脚本自我表扬）
 *
 * 诚实边界（脚本能自动判断的事都在这里如实报，不做美化）：
 *   - 本机**没有可用的交互桌面会话**（实测：有头 Chromium 的主窗口 rect 是 -32000,-32000，即最小化/无桌面），
 *     所以**截不到带浏览器地址栏的窗口**；`b-deeplink.png` 的地址栏那一行改为「抓图瞬间由 CDP 读回的
 *     location.href 原文」，并在图内说明条里写明这一点。
 *   - 「外壳到了、内容还没到」那一瞬在本机只有几十毫秒（实测数字写进台账与图内说明条），
 *     要拍到它必须由 CDP 注入网络延迟；注入这件事本身写在图内，不假装是自然状态。
 */

import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ------------------------------------------------------------------ 位置

const HERE = fileURLToPath(new URL('.', import.meta.url));       // <root>/docs/reviews/ui-review/materials-web/
const ROOT = resolve(HERE, '..', '..', '..', '..');              // 上四级 = 仓库根（少一级会得到 docs/，报错却长得像「服务起不来」）
const WORK = join(tmpdir(), 'suofei-ui-review');
const MATERIALS = HERE;

// 立刻自检层级：错的时候要报成「ROOT 算错了」，不能拖到后面变成看不懂的失败。
for (const rel of ['web/app/main.js', 'web/scripts/serve.mjs', 'web/tests/lib/deploy.mjs', 'tools/build-content.mjs']) {
  if (!existsSync(join(ROOT, rel))) {
    console.error(`ROOT 算错了：${ROOT} 里没有 ${rel}（本文件在 ${HERE}）`);
    process.exit(2);
  }
}

const CHROME_BIN = process.env.CHROME_BIN
  || 'C:/Users/wsqsy/AppData/Local/Chromium/Application/chrome.exe';
if (!existsSync(CHROME_BIN)) {
  console.error(`找不到 Chromium：${CHROME_BIN}（可以用 CHROME_BIN=… 指定）`);
  process.exit(2);
}

const { makeDeployment } = await import(pathToFileURL(join(ROOT, 'web/tests/lib/deploy.mjs')).href);
const { buildVariants } = await import(pathToFileURL(join(ROOT, 'web/scripts/lib/variants.mjs')).href);

// ------------------------------------------------------------------ 小工具

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wp = (p) => p.replace(/\\/g, '/');
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

/** 零依赖读 PNG 尺寸（读 IHDR：偏移 16/20 各 4 字节大端）。 */
const pngSize = (buf) => ({ width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) });

async function freePort() {
  const port = await new Promise((res, rej) => {
    const probe = createServer();
    probe.on('error', rej);
    probe.listen(0, '127.0.0.1', () => {
      const p = probe.address().port;
      probe.close(() => res(p));
    });
  });
  return port;
}

async function fetchOk(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
    } catch { /* 还没起来 */ }
    if (Date.now() > deadline) throw new Error(`等待 ${url} 超时`);
    await sleep(120);
  }
}

// ------------------------------------------------------------------ CDP 薄客户端（与 web/tests/e2e-cdp.mjs 同款，零依赖）

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

/** 页面可能已经不在了（比如浏览器错误页/导航中）：这种时候**不要**把异常当结论。 */
const safeEval = (expr) => evaluate(expr).catch(() => null);

async function waitFor(expression, { label = expression, timeout = 25000, interval = 80 } = {}) {
  const deadline = Date.now() + timeout;
  let last = null;
  for (;;) {
    try { if (await evaluate(expression)) return true; } catch (err) { last = err; }
    if (Date.now() > deadline) {
      throw new Error(`等待超时（${label}）${last ? ` 最后错误：${last.message}` : ''}`);
    }
    await sleep(interval);
  }
}

const waitForIndex = () => waitFor(`Boolean(document.querySelector('[data-test="view-index"]'))`, { label: '目录视图' });
const waitForPoem = (id) => waitFor(
  `Boolean(document.querySelector('[data-test="view-poem"][data-poem-id=${JSON.stringify(id)}]'))`,
  { label: `诗页 ${id}` },
);
const waitForError = () => waitFor(`Boolean(document.querySelector('[data-test="view-error"]'))`, { label: '失败状态' });

const docToken = () => safeEval('performance.timeOrigin');

async function waitForNewDocument(prev, label) {
  await waitFor(`Boolean(window.__app) && performance.timeOrigin !== ${prev}`, { label });
  await sleep(60);
}
const newDocument = async (fn, label) => {
  const before = await docToken();
  await fn();
  await waitForNewDocument(before, label);
};

/** 导航到**不是本站应用**的页（file:// 对照页：favicon / 合成说明条）。
 *  这些页面没有 window.__app，所以只能等「文档换了」这个信号。 */
async function navPlain(url, label) {
  const before = await docToken();
  await cdp.send('Page.navigate', { url });
  await waitFor(`performance.timeOrigin !== ${before}`, { label });
  await waitFor(`document.readyState === 'complete'`, { label: `${label}（document 完成）` });
  await sleep(80);
}

const hashTo = (hash) => evaluate(`location.hash = ${JSON.stringify(hash)}; true`);
const setQuery = (text) => evaluate(`(() => {
  const el = document.querySelector('[data-test="search-input"]');
  el.value = ${JSON.stringify(text)};
  el.dispatchEvent(new Event('input', { bubbles: true }));
})()`);

// ------------------------------------------------------------------ 站点（自起自关）

const sites = [];

async function startSite(deployDir, label) {
  const port = await freePort();
  const proc = spawn(process.execPath,
    [join(ROOT, 'web/scripts/serve.mjs'), '--port', String(port), '--root', deployDir],
    { stdio: ['ignore', 'pipe', 'pipe'] });
  const log = [];
  proc.stdout.on('data', (d) => log.push(String(d)));
  proc.stderr.on('data', (d) => log.push(String(d)));
  const site = {
    label, port, deployDir, proc,
    origin: `http://127.0.0.1:${port}`,
    log: () => log.join(''),
    async stop() {
      proc.kill();
      for (let i = 0; i < 60; i += 1) {
        try { await fetch(`${this.origin}/`); } catch { return; }
        await sleep(100);
      }
      console.warn(`⚠️ ${label} 的服务（端口 ${port}）好像没停干净`);
    },
  };
  if (!(await fetchOk(`${site.origin}/`, 15000).then(() => true).catch(() => false))) {
    throw new Error(`${label} 的静态服务没起来（端口 ${port}）：${site.log() || '(无输出)'}`);
  }
  sites.push(site);
  return site;
}

// ------------------------------------------------------------------ 视口与截图

let vp = { width: 1280, height: 860, dsf: 2 };

async function setViewport(width, height, dsf = 2) {
  vp = { width, height, dsf };
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: dsf, mobile: false,
  });
  await evaluate('window.scrollTo(0, 0); true');
  await sleep(250);
}

const NAV_ARGS = [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-background-networking', '--disable-component-update', '--disable-sync',
  '--hide-scrollbars', '--force-color-profile=srgb', '--remote-allow-origins=*',
  '--window-size=1280,860',
];

const manifest = [];
let scenario = '';

/**
 * 浏览器**实际用来画这串字**的字体（不是声明的 font stack）。
 * 评审清单 B3 要求「全无衬线」：e2e 只能断言计算值里的 font-family 字符串（那只是声明），
 * 这里问的是真实渲染结果 —— 两者可能不一样（字体缺失时浏览器会回退到衬线体）。
 */
async function platformFonts(selector, tries = 4) {
  for (let i = 0; i < tries; i += 1) {
    try {
      // 每次都要**现取一次** DOM 树：应用在渲染时用 replaceChildren 换掉了子节点，
      // 上一步拿到的 nodeId 会当场失效（实测：并发问会得到 -32000 node not found）。
      const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
      if (!nodeId) return { selector, error: '未找到节点' };
      const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
      if (!fonts.length) { await sleep(150); continue; }
      return { selector, fonts: fonts.map((f) => `${f.familyName}（${f.glyphCount} 字形）`) };
    } catch (err) {
      if (i === tries - 1) return { selector, error: err.message };
      await sleep(150);
    }
  }
  return { selector, error: '多次重试后仍无可报告的字形' };
}

/** 逐个（**不要**并发）问字体。 */
async function platformFontsOf(selectors) {
  const out = [];
  for (const s of selectors) out.push(await platformFonts(s));
  return out;
}

async function snapshot() {
  return (await safeEval(`(() => {
    const s = window.__app ? window.__app.summary() : null;
    const notesDetails = document.querySelectorAll('[data-test="notes-details"]').length;
    return {
      url: location.href,
      appVersion: s ? s.appVersion : null,
      contentVersion: s ? s.contentVersion : null,
      poems: s ? s.poems : null,
      loading: s ? s.loading : null,
      error: s && s.error ? (s.error.kind + '：' + s.error.message) : null,
      online: s ? s.online : null,
      swCache: s && s.sw.cache ? (s.sw.cache.cacheName + '（' + s.sw.cache.entries + ' 条目'
        + (s.sw.cache.hasContent ? '，含 content.json' : '，缺 content.json') + '）') : null,
      swWaiting: s ? s.sw.waitingVersion : null,
      notesDetailsCount: notesDetails,
      markCount: document.querySelectorAll('mark').length,
      countText: document.querySelector('.dynasty-count') ? document.querySelector('.dynasty-count').textContent : null,
      searchSummary: document.querySelector('[data-test="search-summary"]')
        ? document.querySelector('[data-test="search-summary"]').textContent : null,
      rows: document.querySelectorAll('[data-test="poem-row"]').length,
      viewText: (document.querySelector('[data-test="view"]') || document.body).innerText.slice(0, 600),
    };
  })()`)) || { url: await safeEval('location.href'), viewText: await safeEval('(document.body.innerText||"").slice(0,600)') };
}

/**
 * 截一张图并记账。
 *   mode: 'viewport' | 'fullpage' | 'element'
 */
async function shot(name, { mode = 'viewport', selector = null, pad = 24, note = '', extra = {}, dsf = null } = {}) {
  // 密度约定（写进 README）：
  //   - viewport / element 两种近看用的图 → 2×（字更清）
  //   - fullpage 那种长图 → 1×（它就是 1280/420 宽的真实渲染宽度；2× 只会把仓库撑大一倍，
  //     而它的用途是「一屏看不完的内容全在」，不是看像素）
  const wantDsf = dsf ?? (mode === 'fullpage' ? 1 : 2);
  if (wantDsf !== vp.dsf) {
    vp = { ...vp, dsf: wantDsf };
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: vp.width, height: vp.height, deviceScaleFactor: wantDsf, mobile: false,
    });
    await sleep(150);
  }
  const params = { format: 'png' };
  if (mode === 'fullpage') {
    const { cssContentSize } = await cdp.send('Page.getLayoutMetrics');
    params.captureBeyondViewport = true;
    params.clip = {
      x: 0, y: 0,
      width: Math.ceil(cssContentSize.width),
      height: Math.ceil(cssContentSize.height),
      scale: 1,
    };
  } else if (mode === 'element') {
    const box = await evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
    })()`);
    if (!box) throw new Error(`找不到元素：${selector}`);
    params.captureBeyondViewport = true;
    params.clip = {
      x: Math.max(0, Math.floor(box.x - pad)),
      y: Math.max(0, Math.floor(box.y - pad)),
      width: Math.ceil(box.w + pad * 2),
      height: Math.ceil(box.h + pad * 2),
      scale: 1,
    };
  }
  const { data } = await cdp.send('Page.captureScreenshot', params, 25000);
  const buf = Buffer.from(data, 'base64');
  const { width, height } = pngSize(buf);
  await writeFile(join(MATERIALS, name), buf);
  const state = await snapshot();
  manifest.push({
    file: name, scenario, mode, selector, note, ...extra,
    viewport: JSON.stringify(`${vp.width}×${vp.height}@${vp.dsf}x`),
    png: `${width}×${height}`, bytes: buf.length, bytesHuman: kb(buf.length),
    state,
  });
  console.log(`  ✓ ${name}  ${width}×${height}  ${kb(buf.length)}`
    + (note ? `  —— ${note}` : ''));
  return { buf, width, height };
}

// ------------------------------------------------------------------ 组装部署目录

/** 关掉壳之外**所有**在仓库里、但部署清单没列的产品文件（例如将来 icons/）会被漏掉；
 *  这里只额外补一个当时**确实存在**的 web/icons/（图标线产出后不至于 404），并如实记账。 */
async function extraProductFiles(destDir) {
  const copied = [];
  if (existsSync(join(ROOT, 'web/icons'))) {
    await cp(join(ROOT, 'web/icons'), join(destDir, 'icons'), { recursive: true });
    copied.push('icons/');
  }
  return copied;
}

// ------------------------------------------------------------------ 主流程

let CHROME = null;
let profileDir = null;
let indexFonts = [];
let poemFonts = [];
let baseText = '';
let appVersion = '';
let variants = null;

async function main() {
  await rm(WORK, { recursive: true, force: true });
  await mkdir(WORK, { recursive: true });

  // ---- 内容产物：真实产物优先；没有就现场编一份（工具是仓库自己的） ----
  const distPath = join(ROOT, 'dist/content.json');
  if (!existsSync(distPath)) {
    console.log('dist/content.json 不存在 → 先跑 node tools/build-content.mjs');
    execFileSync(process.execPath, [join(ROOT, 'tools/build-content.mjs'), '--quiet'], { stdio: 'inherit' });
  }
  baseText = await readFile(distPath, 'utf8');
  const baseDoc = JSON.parse(baseText);
  // 这一条是材料的**前提**：屏上必须是真实内容（1 组 19 首）。不满足就直接停，不拍。
  if (baseDoc.dynasties.length !== 1 || baseDoc.poems.length !== 19) {
    throw new Error(`真实产物形状不对：${baseDoc.dynasties.length} 组 / ${baseDoc.poems.length} 首`
      + '——本材料的用途是「真实内容 1 组 19 首」，形状不符就先停下，不要拍出误导的图。');
  }
  if (baseDoc.placeholder === true || baseDoc.fixture === true) {
    throw new Error('dist/content.json 带着夹具标记（placeholder/fixture）——这不是发布内容，停下。');
  }
  const notesNonEmpty = baseDoc.poems.filter((p) => typeof p.notes === 'string' && p.notes.trim() !== '').length;
  variants = buildVariants(baseDoc);

  const configSrc = await readFile(join(ROOT, 'web/app/config.js'), 'utf8');
  appVersion = /APP_VERSION = '([^']+)'/.exec(configSrc)?.[1];
  if (!appVersion) throw new Error('读不到 APP_VERSION');

  console.log(`仓库根：${ROOT}`);
  console.log(`站点版本：v${appVersion}；内容版本：v${baseDoc.contentVersion}；`
    + `真实内容：${baseDoc.dynasties.length} 组 / ${baseDoc.poems.length} 首；notes 非空：${notesNonEmpty} 首`);

  // ---- 部署目录（都在临时目录里，不进仓库） ----
  const deployBase = join(WORK, 'site-real');
  const real = await makeDeployment({ destDir: deployBase, appVersion, contentText: baseText });
  const copied = await extraProductFiles(deployBase);
  console.log(`部署目录：${real.destDir}（cache=${real.cacheName}，内容 ${real.contentBytes} 字节）`
    + (copied.length ? `；额外拷入 ${copied.join(' ')}` : '；web/icons/ 不存在，未拷入'));

  // 失败部署：同一个站点，但**这次部署里没有 content.json**（最真实的「内容取失败」）
  const deployFail = join(WORK, 'site-no-content');
  await makeDeployment({ destDir: deployFail, appVersion, contentText: baseText });
  await extraProductFiles(deployFail);
  await rm(join(deployFail, 'content.json'));

  // 夹具部署（只用于「长笔记展开」排布的补充材料，图里带醒目横幅）
  const deployFixture = join(WORK, 'site-fixture');
  await makeDeployment({
    destDir: deployFixture, appVersion,
    contentText: `${JSON.stringify(variants.fixtureContent.doc, null, 2)}\n`,
  });
  await extraProductFiles(deployFixture);

  // ---- 浏览器（**一个**全新 profile：每个场景用**各自的 origin**，所以状态不会串） ----
  profileDir = await mkdtemp(join(tmpdir(), 'suofei-ui-review-prof-'));
  const DEBUG_PORT = await freePort();
  CHROME = spawn(CHROME_BIN, [
    ...NAV_ARGS, `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profileDir}`, 'about:blank',
  ], { stdio: 'ignore' });
  await fetchOk(`http://127.0.0.1:${DEBUG_PORT}/json/version`, 30000);
  const targets = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('没有可用的 page target');
  cdp = await CDP.connect(page.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  cdp.on('Runtime.exceptionThrown', (p) => pageErrors.push(
    p.exceptionDetails?.exception?.description || p.exceptionDetails?.text));
  console.log('无头 Chromium 已连接（HTTP 缓存/站点数据在这个临时 profile 里，跑完删掉）');

  const restoreNetwork = () => cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
  });
  const goOffline = () => cdp.send('Network.emulateNetworkConditions', {
    offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0,
  });

  // ================================================================ 场景 1：在线、正常状态（真实内容）
  scenario = 'S1 在线·正常状态（真实内容 1 组 19 首）';
  console.log(`\n=== ${scenario} ===`);
  const siteA = await startSite(deployBase, 'site-real(A)');
  await setViewport(1280, 860, 2);
  await newDocument(() => cdp.send('Page.navigate', { url: `${siteA.origin}/` }), '首访目录就绪');
  await waitForIndex();
  // 让 SW 装完、缓存里真的有 content.json，再拍「默认」——否则拍到的是「还在装 SW」的中间态
  await waitFor(`(async () => {
    const ks = await caches.keys();
    if (!ks.length) return false;
    const c = await caches.open(ks[0]);
    return Boolean(await c.match('content.json'));
  })()`, { label: '站点缓存里已有 content.json' });
  await sleep(400);

  const rowCheck = await evaluate(`({
    rows: document.querySelectorAll('[data-test="poem-row"]').length,
    titles: [...document.querySelectorAll('[data-test="poem-row"] .poem-row-title')].map(e => e.textContent),
    groups: [...document.querySelectorAll('[data-test="dynasty-group"]')].map(g => g.dataset.dynastyKey),
    groupTitle: document.querySelector('.dynasty-group-title').innerText,
    countText: document.querySelector('.dynasty-count').textContent,
    summary: document.querySelector('[data-test="index-summary"]').textContent,
    fixtureNotice: Boolean(document.querySelector('[data-test="fixture-notice"]')),
  })`);

  // ---- 实际渲染字体（B3「全无衬线」的**真值**：不是看声明的 font stack，而是问浏览器真用了哪个字体） ----
  indexFonts = await platformFontsOf([
    '[data-test="index-summary"]', '.dynasty-label', '.dynasty-count b', '.poem-row-title',
    '.poem-row-author', '.status-honest', '[data-test="search-input"]',
  ]);

  await shot('a-index-desktop-viewport.png', {
    mode: 'viewport',
    note: '目录默认（1280×860 首屏，2× 密度）',
    extra: { domRows: rowCheck.rows, domTitlesHeadTail: [rowCheck.titles[0], rowCheck.titles.at(-1)],
      groupTitles: rowCheck.groups, groupTitleText: rowCheck.groupTitle, countText: rowCheck.countText,
      indexSummary: rowCheck.summary },
  });
  await shot('a-index-desktop.png', {
    mode: 'fullpage',
    note: '目录默认**整页**（1280 宽；19 首全在，用于 A2/A3 逐行看）',
    extra: { domRows: rowCheck.rows },
  });

  // ---- 窄屏 420（G1：计数/长题名不许被裁切） ----
  await setViewport(420, 900, 2);
  await hashTo('#/');
  await waitForIndex();
  const narrow = await evaluate(`(() => {
    const t = document.querySelector('.dynasty-group-title');
    const c = document.querySelector('.dynasty-count');
    const b = document.querySelector('.dynasty-count b');
    const cr = c.getBoundingClientRect();
    const br = b.getBoundingClientRect();
    const longest = [...document.querySelectorAll('[data-test="poem-row"] .poem-row-title')]
      .map(e => ({ t: e.textContent, w: e.getBoundingClientRect().width }))
      .sort((a, z) => z.w - a.w)[0];
    return {
      innerWidth,
      docScrollWidth: document.documentElement.scrollWidth,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      groupTitleScrollW: t.scrollWidth, groupTitleClientW: t.clientWidth,
      groupTitleOverflow: t.scrollWidth > t.clientWidth,
      countText: c.textContent,
      countRect: { left: Math.round(cr.left), right: Math.round(cr.right), width: Math.round(cr.width) },
      countFullyVisible: cr.right <= innerWidth && cr.left >= 0,
      countClippedByItself: c.scrollWidth > c.clientWidth,
      boldRect: { left: Math.round(br.left), right: Math.round(br.right) },
      countWhiteSpace: getComputedStyle(c).whiteSpace,
      longestTitle: longest,
    };
  })()`);
  await shot('a-index-narrow-viewport.png', {
    mode: 'viewport',
    note: '目录窄屏 420×900 首屏（G1）',
    extra: { narrowCheck: narrow },
  });
  await shot('a-index-narrow.png', {
    mode: 'fullpage',
    note: '目录窄屏 420 宽**整页**（G1：计数与长题名有没有被裁）',
    extra: { narrowCheck: narrow },
  });
  console.log(`  窄屏实测：计数「${narrow.countText}」右沿 ${narrow.countRect.right}px / 视口 ${narrow.innerWidth}px；`
    + `整页横向溢出=${narrow.horizontalOverflow}；组头自身溢出=${narrow.groupTitleOverflow}；`
    + `计数自身被裁=${narrow.countClippedByItself}；最长题名=${narrow.longestTitle.t}（${Math.round(narrow.longestTitle.w)}px）`);

  // ---- 诗页（含底本；不许有异文栏、不许有 id 行） ----
  await setViewport(1280, 860, 2);
  const POEM = 'gushi-shijiu-shou-01';
  await hashTo(`#/p/${POEM}`);
  await waitForPoem(POEM);
  const poemCheck = await evaluate(`(() => {
    const v = document.querySelector('[data-test="view"]');
    const txt = v.innerText;
    return {
      meta: document.querySelector('[data-test="poem-meta"]').textContent,
      lineCount: document.querySelectorAll('[data-test="poem-line"]').length,
      stanzaCount: document.querySelectorAll('[data-test="stanza"]').length,
      sourceLabels: [...document.querySelectorAll('[data-test="source-block"] dt')].map(e => e.textContent),
      notesEmpty: document.querySelector('[data-test="notes-empty"]')?.textContent ?? null,
      hasVariantsBlock: txt.includes('异文') && !txt.includes('异文校记'),
      mentionsPoemId: txt.includes('${POEM}'),
      titleBorderBottom: getComputedStyle(document.querySelector('[data-test="poem-title"]')).borderBottomStyle,
      stanzaGap: getComputedStyle(document.querySelector('[data-test="stanza"]')).rowGap,
      lineHeightPx: getComputedStyle(document.querySelector('[data-test="poem-line"]')).lineHeight,
      text: txt.slice(0, 400),
    };
  })()`);
  poemFonts = await platformFontsOf([
    '[data-test="poem-title"]', '[data-test="poem-meta"]', '[data-test="poem-line"]',
    '[data-test="notes-empty"]', '[data-test="source-block"] dd',
  ]);
  await shot('b-poem.png', {
    mode: 'fullpage',
    note: '诗页默认（整页；含题图/正文/无笔记/底本）',
    extra: { poemCheck },
  });  await shot('b-notes-collapsed.png', {
    mode: 'element', selector: '[data-test="notes-section"]', pad: 28,
    note: '笔记区默认（真实内容：19 首全是 notes:null → 只有「还没有笔记」这一态）',
    extra: { poemCheck },
  });
  await shot('b-poem-foot-source.png', {
    mode: 'element', selector: '[data-test="source-block"]', pad: 28,
    note: '诗页页脚只有「底本」（B5）',
    extra: {},
  });

  // ---- 深链接直开（先 about:blank，再**新开**到该 URL；避开「同文档改 hash」） ----
  await cdp.send('Page.navigate', { url: 'about:blank' });
  await sleep(200);
  await newDocument(() => cdp.send('Page.navigate', { url: `${siteA.origin}/#/p/${POEM}` }), '深链接直开');
  await waitForPoem(POEM);
  const deeplinkCheck = await evaluate(`({
    hash: location.hash,
    href: location.href,
    poemId: document.querySelector('[data-test="view-poem"]').dataset.poemId,
    title: document.querySelector('[data-test="poem-title"]').textContent,
    hashHasTitle: location.hash.includes(encodeURIComponent(
      document.querySelector('[data-test="poem-title"]').textContent)),
  })`);
  await shot('_raw-b-deeplink.png', {
    mode: 'viewport',
    note: '深链接直开的真实视口截图（无头截图不含地址栏 → 合成说明条里给出抓图瞬间的 location.href）',
    extra: { deeplinkCheck },
  });

  // ---- 搜索三态 ----
  await hashTo('#/');
  await waitForIndex();
  await setQuery('');
  await sleep(150);
  const searchEmpty = await evaluate(`({
    viewIsIndex: Boolean(document.querySelector('[data-test="view-index"]')),
    hasHint: Boolean(document.querySelector('[data-test="view-search"]')),
    placeholder: document.querySelector('[data-test="search-input"]').placeholder,
    summary: document.querySelector('[data-test="index-summary"]')?.textContent ?? null,
  })`);
  await shot('c-search-empty.png', {
    mode: 'viewport',
    note: '搜索·空输入（照实：没有单独的「请输入」提示，就是目录默认页）',
    extra: { searchEmpty },
  });

  await setQuery('明月');
  await sleep(200);
  const searchHit = await evaluate(`({
    summary: document.querySelector('[data-test="search-summary"]').textContent,
    rows: [...document.querySelectorAll('[data-test="poem-row"]')].map(r => ({
      title: r.querySelector('.poem-row-title').textContent,
      author: r.querySelector('.poem-row-author').textContent,
      dynasty: r.querySelector('.poem-row-dynasty')?.textContent ?? null,
      // 命中高亮：契约/令牌里叫 mark-bg/mark-text（原型用 <mark>）；这里如实数它是 0 还是 >0
      marks: r.querySelectorAll('mark').length,
      html: r.innerHTML,
    })),
    highlightScan: (() => {
      const all = document.querySelectorAll('[data-test="view"] *');
      let styled = 0;
      for (const el of all) {
        const bg = getComputedStyle(el).backgroundColor;
        if (bg === 'rgba(79, 179, 165, 0.22)') styled += 1;
      }
      return { markElements: document.querySelectorAll('mark').length, elementsWithMarkBg: styled };
    })(),
    url: location.href,
  })`);
  await shot('c-search-results.png', {
    mode: 'viewport',
    note: '搜索·有结果（明月；命中高亮如实拍——见 manifest 的 markElements）',
    extra: { searchHit },
  });

  await setQuery('这首诗不存在');
  await sleep(200);
  const searchNone = await evaluate(`({
    summary: document.querySelector('[data-test="search-summary"]').textContent,
    empty: document.querySelector('[data-test="search-empty"]')?.textContent ?? null,
    rows: document.querySelectorAll('[data-test="poem-row"]').length,
  })`);
  await shot('c-search-none.png', {
    mode: 'viewport',
    note: '搜索·无结果（如实说没有匹配）',
    extra: { searchNone },
  });
  await setQuery('');
  await hashTo('#/');
  await waitForIndex();

  // ---- 状态面板里的「诚实说明」（E4 的「如实说明离线副本会丢」就写在页脚） ----
  await shot('e-storage-honest-note.png', {
    mode: 'element', selector: '[data-test="honest-storage-note"]', pad: 20,
    note: '页脚「诚实说明」原文（E4）',
    extra: {},
  });

  // ================================================================ 场景 2：首次访问的真实耗时 + 注入延迟后的「外壳到了、内容还没到」
  scenario = 'S2 首次访问（无 SW/无缓存的新 origin）';
  console.log(`\n=== ${scenario} ===`);
  const timingOrigin = await startSite(deployBase, 'site-real(B·测耗时)');
  await setViewport(1280, 860, 2);
  const t0 = Date.now();
  await cdp.send('Page.navigate', { url: `${timingOrigin.origin}/` });
  await waitFor(`Boolean(document.querySelector('[data-test="site-title"]'))`, { label: '外壳可见' });
  const shellMs = Date.now() - t0;
  await waitForIndex();
  const indexMs = Date.now() - t0;
  const paint = await safeEval(`(() => {
    const n = performance.getEntriesByType('navigation')[0] || {};
    const p = performance.getEntriesByType('paint');
    const fcp = p.find(x => x.name === 'first-contentful-paint');
    const s = window.__app ? window.__app.summary() : null;
    return {
      firstContentfulPaint: fcp ? Math.round(fcp.startTime) : null,
      responseEnd: n.responseEnd ? Math.round(n.responseEnd) : null,
      domContentLoaded: n.domContentLoadedEventEnd ? Math.round(n.domContentLoadedEventEnd) : null,
      loadEnd: n.loadEventEnd ? Math.round(n.loadEventEnd) : null,
      contentLoadedFromMeta: window.__app && window.__app.state.meta
        ? Math.round(Date.parse(window.__app.state.meta.loadedAt) - performance.timeOrigin) : null,
      contentBytes: window.__app && window.__app.state.meta ? window.__app.state.meta.bytes : null,
    };
  })()`);
  const realTiming = {
    measuredBy: 'CDP 轮询（间隔 80ms）+ 页面内 performance 条目，同一台机器、无网络节流、临时全新 profile',
    shellVisibleMs: shellMs, indexVisibleMs: indexMs, paint,
  };
  console.log(`  实测（不节流）：外壳可见 ${shellMs}ms、目录可见 ${indexMs}ms；`
    + `FCP=${paint.firstContentfulPaint}ms、内容到达(页面内计时)=${paint.contentLoadedFromMeta}ms`);
  await timingOrigin.stop();

  const siteC = await startSite(deployBase, 'site-real(C·首访抓图)');
  const INJECTED_LATENCY = 1500;
  await setViewport(1280, 860, 2);
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency: INJECTED_LATENCY, downloadThroughput: -1, uploadThroughput: -1,
  });
  await newDocument(() => cdp.send('Page.navigate', { url: `${siteC.origin}/` }), '首访（节流）');
  await waitFor(`Boolean(document.querySelector('[data-test="site-title"]'))`
    + ` && Boolean(document.querySelector('[data-test="view-loading"]'))`, { label: '外壳 + 装载提示' });
  const loadingState = await evaluate(`({
    title: document.querySelector('[data-test="site-title"]').textContent,
    loadingText: document.querySelector('[data-test="view-loading"]').textContent,
    rows: document.querySelectorAll('[data-test="poem-row"]').length,
    hasDoc: window.__app.summary().hasDoc,
    loading: window.__app.summary().loading,
    cacheText: document.querySelector('[data-test="status-site-cache"]').textContent,
  })`);
  await shot('_raw-e-first-visit.png', {
    mode: 'viewport',
    note: `首访瞬间（CDP 注入 ${INJECTED_LATENCY}ms 延迟，否则拍不到）`,
    extra: { injectedLatencyMs: INJECTED_LATENCY, loadingState, realTiming },
  });
  await restoreNetwork();
  await waitForIndex();
  await waitFor(`(async () => {
    const ks = await caches.keys();
    if (!ks.length) return false;
    return Boolean(await (await caches.open(ks[0])).match('content.json'));
  })()`, { label: '缓存就位（准备离线重载）' });
  await sleep(300);

  // ---- 离线：已缓存后断网 + 关掉静态服务，重载仍可读 ----
  await goOffline();
  await siteC.stop();
  await newDocument(() => cdp.send('Page.reload', { ignoreCache: false }), '离线重载');
  await waitForIndex();
  const offlineCheck = await evaluate(`(async () => {
    const summary = window.__app.summary();
    const probe = async (p) => { try { return (await fetch(p)).status; } catch (e) { return 'rejected:' + e.name; } };
    return {
      online: summary.online,
      poems: summary.poems,
      contentVersion: summary.contentVersion,
      controlled: Boolean(navigator.serviceWorker.controller),
      shellStatus: await probe('index.html'),
      uncachedStatus: await probe('not-cached-xyz.txt'),
      statusNetwork: document.querySelector('[data-test="status-network"]').textContent,
      rows: document.querySelectorAll('[data-test="poem-row"]').length,
    };
  })()`);
  await shot('e-offline.png', {
    mode: 'fullpage',
    note: '离线（已缓存 → 断网 + 静态服务已关 → 重载仍可读）',
    extra: { offlineCheck },
  });
  await restoreNetwork();
  const siteC2 = await startSite(deployBase, 'site-real(C·恢复)');
  await newDocument(() => cdp.send('Page.reload', { ignoreCache: false }), '恢复联网后重载');
  await waitForIndex();
  await siteC2.stop();

  // ================================================================ 场景 3：内容取失败（这次部署里没有 content.json）
  scenario = 'S3 内容取失败（部署里缺 content.json）';
  console.log(`\n=== ${scenario} ===`);
  const siteE = await startSite(deployFail, 'site-no-content(E)');
  await setViewport(1280, 860, 2);
  await newDocument(() => cdp.send('Page.navigate', { url: `${siteE.origin}/` }), '缺内容的一次访问');
  await waitForError();
  const failCheck = await evaluate(`({
    errorText: document.querySelector('[data-test="error-text"]').textContent,
    errorHint: document.querySelector('[data-test="error-hint"]').textContent,
    shellStillThere: document.querySelector('[data-test="site-title"]').textContent,
    retryButton: document.querySelector('[data-test="retry-load"]').textContent,
    httpProbe: null,
  })`);
  const httpProbe = await evaluate(`(async () => { try { return (await fetch('content.json')).status; } catch (e) { return 'rejected:' + e.name; } })()`);
  failCheck.httpProbe = httpProbe;
  await shot('e-content-failed.png', {
    mode: 'fullpage',
    note: '内容取失败（HTTP 404：这次部署里没有 content.json）—— 如实报错 + 重试入口',
    extra: { failCheck },
  });
  // 把内容补回这次部署 → 点「重试取内容」→ 真的能自愈
  await writeFile(join(deployFail, 'content.json'), baseText, 'utf8');
  await evaluate(`document.querySelector('[data-test="retry-load"]').click(); true`);
  await waitForIndex();
  const recovered = await evaluate(`({
    poems: window.__app.summary().poems,
    error: window.__app.summary().error,
    viewIsIndex: Boolean(document.querySelector('[data-test="view-index"]')),
  })`);
  await shot('e-content-failed-then-retry.png', {
    mode: 'viewport',
    note: '把内容补回部署后点「重试取内容」→ 真的恢复',
    extra: { recovered },
  });
  await siteE.stop();

  // ================================================================ 场景 4：清掉站点数据
  scenario = 'S4 清掉站点数据（清 cache + 注销 SW）';
  console.log(`\n=== ${scenario} ===`);
  const siteD = await startSite(deployBase, 'site-real(D·清数据)');
  await setViewport(1280, 860, 2);
  await newDocument(() => cdp.send('Page.navigate', { url: `${siteD.origin}/` }), '清数据前的正常访问');
  await waitForIndex();
  await waitFor(`(async () => {
    const ks = await caches.keys();
    if (!ks.length) return false;
    return Boolean(await (await caches.open(ks[0])).match('content.json'));
  })()`, { label: '清数据前先确认缓存里有 content.json' });
  const beforeClear = await evaluate(`(async () => ({
    caches: (await caches.keys()).length,
    controlled: Boolean(navigator.serviceWorker.controller),
  }))()`);
  // 用户点「清除站点数据」≈ 清掉这个 origin 的 cache storage 与 SW 注册
  await cdp.send('Storage.clearDataForOrigin', { origin: siteD.origin, storageTypes: 'all' });
  await sleep(500);
  const afterClear = await evaluate(`(async () => ({
    caches: (await caches.keys()).length,
    registration: Boolean(await navigator.serviceWorker.getRegistration()),
  }))()`);
  await siteD.stop();
  await goOffline();
  await safeEval('true');
  await cdp.send('Page.navigate', { url: `${siteD.origin}/` }).catch(() => {});
  await waitFor(`!window.__app && !document.querySelector('[data-test="site-title"]')`,
    { label: '浏览器错误页接上', timeout: 20000 }).catch(() => {});
  await sleep(400);
  const clearedState = await safeEval(`({
    url: location.href,
    hasApp: Boolean(window.__app),
    bodyText: (document.body.innerText || '').slice(0, 400),
  })`) || { url: null, hasApp: null, bodyText: null };
  await shot('e-cleared.png', {
    mode: 'viewport',
    note: '清掉站点数据 + 断网 + 服务已关 → 离线副本确实没了（只剩浏览器错误页）',
    extra: { beforeClear, afterClear, clearedState },
  });
  await restoreNetwork();

  // ================================================================ 场景 5：长笔记展开（**夹具**补充材料）
  scenario = 'S5 长笔记展开（夹具补充材料，不能用于过账）';
  console.log(`\n=== ${scenario} ===`);
  const siteF = await startSite(deployFixture, 'site-fixture(F)');
  await setViewport(1280, 860, 2);
  await newDocument(() => cdp.send('Page.navigate', { url: `${siteF.origin}/#/p/fixture-test-poem-01` }), '夹具诗页');
  await waitForPoem('fixture-test-poem-01');
  const fixtureCheck = await evaluate(`({
    fixtureNotice: document.querySelector('[data-test="fixture-notice"]')?.innerText ?? null,
    notesOpen: document.querySelector('[data-test="notes-details"]')?.open ?? null,
  })`);
  await evaluate(`document.querySelector('[data-test="notes-summary"]').click(); true`);
  await waitFor(`document.querySelector('[data-test="notes-details"]').open === true`, { label: '笔记展开' });
  await sleep(200);
  const expandedCheck = await evaluate(`({
    notesOpen: document.querySelector('[data-test="notes-details"]').open,
    bodyMaxWidth: getComputedStyle(document.querySelector('[data-test="notes-body"]')).maxWidth,
    bodyWidth: Math.round(document.querySelector('[data-test="notes-body"]').getBoundingClientRect().width),
    lineHeight: getComputedStyle(document.querySelector('[data-test="notes-body"]')).lineHeight,
    listItems: document.querySelectorAll('[data-test="notes-list"] li').length,
  })`);
  await shot('_raw-b-notes-expanded-fixture.png', {
    mode: 'fullpage',
    note: '夹具诗页·笔记已展开（这是**夹具内容**，不是真实内容）',
    extra: { fixtureCheck, expandedCheck },
  });
  await siteF.stop();

  // ================================================================ 场景 6：favicon 小尺寸观感
  scenario = 'S6 favicon 小尺寸观感';
  console.log(`\n=== ${scenario} ===`);
  const favicon = await captureFaviconHarness();

  // ================================================================ 合成说明条（真实截图 + 脚本加的说明文字）
  console.log('\n=== 合成说明条（图内是真实截图，上方文字由脚本生成） ===');
  await composeAll();
  console.log(`  favicon 材料：${favicon.used}（web/icons/ 存在？${favicon.iconsExist}）`);

  // ================================================================ 台账
  const gitHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim();
  const indexHtmlHash = execFileSync('git', ['hash-object', join(ROOT, 'web/index.html')], { cwd: ROOT })
    .toString().trim();
  const contentSha = createHash('sha256').update(baseText).digest('hex');
  const faviconHref = /<link rel="icon" href="([^"]+)"/.exec(await readFile(join(ROOT, 'web/index.html'), 'utf8'))?.[1] ?? null;
  const faviconFiles = existsSync(join(ROOT, 'web/icons'))
    ? (await import('node:fs')).readdirSync(join(ROOT, 'web/icons')).sort() : [];

  const ledger = {
    createdAt: new Date().toISOString(),
    purpose: '逐屏评审（docs/reviews/ui-review-checklist.md）用的 Web 端实拍材料',
    gitHead,
    webIndexHtmlBlob: indexHtmlHash,
    chromeBin: CHROME_BIN,
    appVersion,
    contentVersion: baseDoc.contentVersion,
    contentPoems: baseDoc.poems.length,
    contentDynasties: baseDoc.dynasties.map((d) => `${d.key}/${d.label}`),
    contentPoemsWithNotes: notesNonEmpty,
    contentSha256: contentSha,
    contentSource: `dist/content.json（node tools/build-content.mjs 编译自 content/poems/，非 web/fixtures/）`,
    injectedLatencyMs: INJECTED_LATENCY,
    realFirstVisitTiming: realTiming,
    platformFonts: {
      note: '浏览器**实际用于渲染**的字体（CDP CSS.getPlatformFontsForNode）—— 不是声明的 font stack；B3「全无衬线」的真值',
      index: indexFonts,
      poem: poemFonts,
    },
    iconsDirExists: existsSync(join(ROOT, 'web/icons')),
    faviconFiles,
    faviconHrefHead: faviconHref ? faviconHref.slice(0, 80) : null,
    faviconMaterial: favicon,
    screenshots: manifest,
    pageErrors,
  };
  await writeFile(join(MATERIALS, 'capture-manifest.json'), `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');
  console.log('\n台账：capture-manifest.json');
}

// ------------------------------------------------------------------ favicon（小尺寸观感）

/**
 * favicon 小尺寸观感。
 *
 * **读的是什么**：站点 `web/index.html` 里那条真实的 `<link rel="icon" href="…">`
 * （当前是一段内联 data URI 的「索」字标）；如果 `web/icons/` 已经存在（图标线并入了），
 * 就把那个目录里的文件也一并摆出来拍。
 *
 * ⚠ 这不是站点截图：下面这个对照页由本脚本生成，只把**真实的图标字节**按
 * 16px / 32px 原样（`<img width=16 height=16>`）+ 8× 最近邻放大画出来。
 * 它只能回答「16px 下还能不能看清」，不能代替「浏览器标签页里长什么样」的实拍。
 */
async function captureFaviconHarness() {
  const indexHtml = await readFile(join(ROOT, 'web/index.html'), 'utf8');
  const href = /<link rel="icon" href="([^"]+)"/.exec(indexHtml)?.[1] ?? null;
  const iconsDir = join(ROOT, 'web/icons');
  const iconsExist = existsSync(iconsDir);
  const iconsFiles = iconsExist
    ? (await (await import('node:fs/promises')).readdir(iconsDir)).filter((f) => /\.(svg|png|ico)$/i.test(f)).sort()
    : [];

  const srcs = [];
  if (href) srcs.push({ label: 'index.html 里那条 <link rel="icon">（内联字标）', src: href });
  for (const f of iconsFiles) srcs.push({ label: `web/icons/${f}`, src: `file:///${wp(join(iconsDir, f))}` });
  if (!srcs.length) {
    return { used: '没有可拍的 favicon（index.html 里没有 <link rel="icon">，web/icons/ 也不存在）', iconsExist, iconsFiles };
  }

  const strips = srcs.map(({ label, src }) => `
    <section class="card">
      <h2>${label}</h2>
      <div class="rows">
        <div class="row dark"><span class="tag">深色底</span>
          <img class="i16" src="${src}"><span class="cap">16px 实际大小</span>
          <img class="i32" src="${src}"><span class="cap">32px</span></div>
        <div class="row light"><span class="tag">浅色底</span>
          <img class="i16" src="${src}"><span class="cap">16px 实际大小</span>
          <img class="i32" src="${src}"><span class="cap">32px</span></div>
        <div class="row dark"><span class="tag">8× 放大</span>
          <img class="zoom" src="${src}"><span class="cap">最近邻放大（看清 16px 下的像素）</span></div>
        <div class="row tabstrip"><span class="tag">标签页≈</span>
          <span class="tab"><img class="i16" src="${src}"><span>索斐</span></span>
          <span class="tab"><img class="i16" src="${src}"><span>索斐</span></span>
          <span class="cap">（用 <code>&lt;img&gt;</code> 拼的仿标签，不是浏览器界面截图）</span></div>
      </div>
    </section>`).join('\n');

  const html = `<!doctype html><html lang="zh-Hans-CN"><head><meta charset="utf-8"><style>
  body{margin:0;background:#0e1315;color:#dde5e4;font-family:'Microsoft YaHei UI','Microsoft YaHei',sans-serif;padding:24px 28px 34px}
  h1{font-size:20px;font-weight:500;margin:0 0 10px}
  .warn{max-width:1100px;font-size:16px;line-height:1.8;color:#e8c07d;margin:0 0 8px}
  .sub{max-width:1100px;font-size:15px;line-height:1.8;color:#9fb0ae;margin:0 0 22px}
  code{font-family:Consolas,monospace;color:#8fd8cb}
  .card{border:1px solid #233034;border-radius:6px;padding:14px 16px 18px;margin:0 0 18px;max-width:1100px;background:#111719}
  h2{font-size:15px;font-weight:500;color:#9fb0ae;margin:0 0 12px;font-family:Consolas,monospace}
  .row{display:flex;align-items:center;gap:14px;padding:10px 12px;border-radius:4px;margin-bottom:8px}
  .dark{background:#0b1013}
  .light{background:#f2f4f3;color:#33393a}
  .tabstrip{background:#1b2225}
  .tag{font-size:13px;color:#8b9a98;min-width:74px;font-family:Consolas,monospace}
  .light .tag{color:#5d6a69}
  .cap{font-size:13px;color:#8b9a98}
  .light .cap{color:#5d6a69}
  img.i16{width:16px;height:16px}
  img.i32{width:32px;height:32px}
  img.zoom{width:128px;height:128px;image-rendering:pixelated}
  .tab{display:inline-flex;align-items:center;gap:7px;background:#2a3336;border:1px solid #3a4548;border-radius:6px 6px 0 0;padding:6px 12px 7px;font-size:14px}
  </style></head><body>
  <h1>favicon 在小尺寸下的实际观感</h1>
  <p class="warn">⚠ 本图<b>不是站点截图</b>：这个对照页由抓图脚本生成，只把真实图标的字节按 16px / 32px
  原样（<code>&lt;img width=16 height=16&gt;</code>）与 8× 最近邻放大画出来，用来回答「16px 下还能不能看清」。</p>
  <p class="sub">本树里 <code>web/icons/</code> 存在吗：<b>${iconsExist ? '存在（已把目录里的文件一并列出）' : '不存在'}</b>；
  现在站点用的是 index.html 里那条 <code>&lt;link rel="icon"&gt;</code>（内联字标）。
  评审清单 F2 要求的是「另一套无字极简记号」，它还没产出 —— 所以<b>本图不能代表 F2，只是现状证据</b>。</p>
  ${strips}
  </body></html>`;
  const htmlPath = join(WORK, 'favicon-harness.html');
  await writeFile(htmlPath, html, 'utf8');

  await setViewport(1280, 900, 1);
  await navPlain(`file:///${wp(htmlPath)}`, 'favicon 对照页');
  await waitFor(`[...document.images].every((im) => im.complete && im.naturalWidth > 0)`,
    { label: '图标都加载完', timeout: 15000 });
  await sleep(200);
  const name = iconsExist ? 'f-favicon-from-site-icons.png' : 'f-favicon-current-inline-glyph.png';
  await shot(name, {
    mode: 'fullpage',
    note: iconsExist
      ? 'favicon 16/32px 观感（含 web/icons/ 里的文件）'
      : 'favicon 16/32px 观感 —— **现状：index.html 里的内联字标**；F2 要求的无字记号尚未产出，待图标线并入后补拍',
    extra: { harness: true, iconsExist, iconsFiles, faviconHrefIsDataUri: Boolean(href?.startsWith('data:')) },
  });
  return {
    used: name, iconsExist, iconsFiles,
    note: '不是站点截图：脚本生成的对照页（真实图标字节 + 16/32px 原样与 8× 放大）',
  };
}

// ------------------------------------------------------------------ 合成图

/** 把「真实截图 + 脚本加的说明条」拼成一张图。
 *  图内每一句都写清哪部分是真的、哪部分是脚本加的 —— 不许让说明条看起来像浏览器界面。 */
function composePage({ title, warn, lines, imgFile, cssWidth }) {
  const imgPath = join(MATERIALS, imgFile);
  const { width: pw, height: ph } = pngSize(readFileSync(imgPath));
  const imgCssH = Math.round(ph * (cssWidth / pw));
  const html = `<!doctype html><html lang="zh-Hans-CN"><head><meta charset="utf-8"><style>
  body{margin:0;background:#0e1315;color:#dde5e4;font-family:'Microsoft YaHei UI','Microsoft YaHei',sans-serif;padding:22px 26px 30px}
  .band{max-width:${cssWidth}px}
  h1{font-size:20px;font-weight:500;letter-spacing:.06em;margin:0 0 10px}
  .warn{font-size:17px;line-height:1.75;color:#e8c07d;margin:0 0 12px}
  ul{margin:0 0 18px;padding-left:1.4em}
  li{font-size:16px;line-height:1.8;color:#9fb0ae}
  li b{color:#dde5e4;font-weight:500}
  code{font-family:Consolas,monospace;color:#8fd8cb}
  img{display:block;width:${cssWidth}px;border:1px solid #233034;border-radius:6px;background:#0a0e10}
  </style></head><body>
  <div class="band">
    <h1>${title}</h1>
    <p class="warn">${warn}</p>
    <ul>${lines.map((l) => `<li>${l}</li>`).join('')}</ul>
  </div>
  <img src="${wp(imgPath)}">
  </body></html>`;
  const htmlPath = join(WORK, `${imgFile.replace(/\.png$/, '')}.compose.html`);
  writeFileSync(htmlPath, html, 'utf8');
  return { htmlPath, imgCssH };
}

async function composeAll() {
  const jobs = [];

  // b-deeplink：地址栏那一行的替代物 = 抓图瞬间由 CDP 读回的 location.href 原文
  const deep = manifest.find((m) => m.file === '_raw-b-deeplink.png');
  jobs.push({
    out: 'b-deeplink.png',
    title: '深链接直开 —— 地址栏里确实是 #/p/gushi-shijiu-shou-01',
    warn: '⚠ 本机桌面会话不可用（有头 Chromium 主窗口 rect 实测为 -32000,-32000 ⇒ 最小化），'
      + '<b>截不到带浏览器地址栏的窗口</b>。所以下面第一行是抓图同一时刻由 CDP 从页面读回的 '
      + '<code>location.href</code> 原文（脚本文本，不是浏览器界面），第二行才是浏览器界面里的 '
      + '<code>location.hash</code>；再往下的整块是<b>未被改动的真实视口截图</b>。',
    lines: [
      `location.href = <code>${deep?.state?.url ?? '(未记到)'}</code>`,
      `location.hash = <code>#/${'p'}/gushi-shijiu-shou-01</code>（由 hash 路由直达，没有经过目录页点击）`,
      `打开方式：先 about:blank，再<b>新开</b>到该 URL（真·直开，不是同文档改 hash）`,
      `诗页 DOM：<code>data-poem-id=gushi-shijiu-shou-01</code>；页面上不出现诗的 id 文本（B5）`,
    ],
    imgFile: '_raw-b-deeplink.png',
    cssWidth: 1280,
  });

  // e-first-visit：拍它必须注入延迟，这件事写在图内，并把不节流的实测数字一并写出
  const first = manifest.find((m) => m.file === '_raw-e-first-visit.png');
  const t = first?.realTiming ?? {};
  jobs.push({
    out: 'e-first-visit.png',
    title: '首次访问 —— 外壳到了、内容还没到（无 SW、无缓存）',
    warn: '⚠ 这一瞬在本机只有几十毫秒，<b>自然状态下截不到</b>：本图由 CDP 注入网络延迟 '
      + `<code>${first?.injectedLatencyMs ?? '?'}ms</code> 后拍下。注入的数字与不注入时的真实耗时都写在下面，`
      + '不要把这张图当成「本地站点平时要等这么久」。',
    lines: [
      `不节流实测（同机、临时全新 profile、新 origin）：外壳可见 <b>${t.shellVisibleMs ?? '?'}ms</b>、`
        + `目录可见 <b>${t.indexVisibleMs ?? '?'}ms</b>`,
      `页面内 performance：first-contentful-paint <b>${t.paint?.firstContentfulPaint ?? '?'}ms</b>、`
        + `内容到达 <b>${t.paint?.contentLoadedFromMeta ?? '?'}ms</b>、`
        + `DCL <b>${t.paint?.domContentLoaded ?? '?'}ms</b>（内容 ${t.paint?.contentBytes ?? '?'} 字节）`,
      `此刻页面上：页头「${first?.loadingState?.title ?? '?'}」+ 装载提示「`
        + `${first?.loadingState?.loadingText ?? '?'}」、诗行数 <b>${first?.loadingState?.rows}</b>、`
        + `站点缓存「${first?.loadingState?.cacheText ?? '?'}」`,
      `外壳（HTML/JS/CSS）与内容 <b>分开取</b>：外壳一到就先渲染框架与「正在取内容…」，不是整页白等（IF-26c）`,
    ],
    imgFile: '_raw-e-first-visit.png',
    cssWidth: 1280,
  });

  // 夹具补充材料：名字与图内都标明它不能用于过账
  const fx = manifest.find((m) => m.file === '_raw-b-notes-expanded-fixture.png');
  jobs.push({
    out: 'b-notes-expanded--fixture-supplement.png',
    title: '笔记展开（长笔记排布）—— <b>用测试夹具拍的补充材料，不能用于过账</b>',
    warn: '⚠ 真实产物 19 首<b>全部</b> <code>notes: null</code>，所以「展开后的长笔记」这一态'
      + '<b>在真实内容下根本不存在</b>（真实内容只有「还没有笔记」那一态，见 b-notes-collapsed.png）。'
      + '本图用的是仓库自己的测试部署内容（`web/scripts/lib/variants.mjs` 的 fixture 诗），'
      + '页面顶部自带「测试夹具内容」横幅。它只能用来看<b>排布</b>（B8 的行高与 36em 最大宽度），'
      + '<b>不能作为过账材料</b>。',
    lines: [
      `展开态：<code>details.open=${fx?.expandedCheck?.notesOpen}</code>、`
        + `笔记块宽 <b>${fx?.expandedCheck?.bodyWidth}px</b>（max-width <code>${fx?.expandedCheck?.bodyMaxWidth}</code>）、`
        + `行高 ${fx?.expandedCheck?.lineHeight}、列表项 ${fx?.expandedCheck?.listItems} 条`,
      `换句话说：真实内容里 B8 这一格<b>无法用真实内容拍到</b>，只能等有真实长笔记，或由产品决定放宽内容形状`,
    ],
    imgFile: '_raw-b-notes-expanded-fixture.png',
    cssWidth: 1280,
  });

  for (const job of jobs) {
    const { htmlPath } = composePage(job);
    // 用同一个 CDP 会话量出对照页的真实高度，再整页截图 —— 不让「高度估小了」把说明条裁掉。
    await navPlain(`file:///${wp(htmlPath)}`, '合成页');
    await waitFor(`[...document.images].every((im) => im.complete && im.naturalWidth > 0)`,
      { label: '合成页里的图都加载完', timeout: 15000 });
    await sleep(150);
    await setViewport(job.cssWidth + 52, 900, 2);
    const { cssContentSize } = await cdp.send('Page.getLayoutMetrics');
    const { data } = await cdp.send('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: Math.ceil(cssContentSize.width), height: Math.ceil(cssContentSize.height), scale: 1 },
    }, 25000);
    const buf = Buffer.from(data, 'base64');
    const { width, height } = pngSize(buf);
    await writeFile(join(MATERIALS, job.out), buf);
    manifest.push({
      file: job.out, scenario: '合成说明条', mode: 'composite', png: `${width}×${height}`,
      bytes: buf.length, bytesHuman: kb(buf.length),
      innerImage: job.imgFile, innerImageCssWidth: job.cssWidth,
      note: '说明条由脚本生成；图内下半部分是被原样嵌入的真实截图（另存为 _raw-*.png，未被改动）',
    });
    console.log(`  ✓ ${job.out}  ${width}×${height}  ${kb(buf.length)}`);
  }
}

main()
  .catch((err) => {
    console.error(`\n✗ 抓图失败：${err.message}`);
    console.error(err.stack);
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const s of sites) await s.stop().catch(() => {});
    try { cdp?.ws?.close(); } catch { /* ignore */ }
    if (CHROME) CHROME.kill();
    await sleep(200);
    if (profileDir) await rm(profileDir, { recursive: true, force: true }).catch(() => {});
    console.log(`\n部署目录与临时 profile 留在 ${WORK}（不进仓库；重跑时会重建）`);
  });
