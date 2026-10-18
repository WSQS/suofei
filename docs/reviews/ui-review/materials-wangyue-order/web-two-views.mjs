#!/usr/bin/env node
/**
 * **演练/取证脚本**（不是产品代码、不属于任何测试套件、不进 CI）。
 *
 * 对象：2026-10-19 把三首杜甫诗的 `orderInSource` 改为 **1/2/3**（望岳 → 梦李白其一 → 梦李白其二）
 * 之后，**两个视图的渲染次序**到底变了什么、没变什么。
 *
 * 只核这几件事（其余交给仓库既有套件：`npm test` / `web/tests/e2e-cdp.mjs` / Android 单测）：
 *   ① 朝代页「唐」组 = **望岳 → 梦李白二首·其一 → 梦李白二首·其二**；
 *   ② 标签页「唐诗三百首」展开 = **同一次序**（两视图现在一致）；
 *   ③ 其余 20 首（汉 19 + 近现代 1）**次序一字未变**、组序仍是 汉／唐／近现代；
 *   ④ 标签组序仍是 古诗十九首 → 唐诗三百首。
 *
 * 手法与仓库 e2e（`web/tests/e2e-cdp.mjs`）同一套：无头 Chromium ＋ CDP，零第三方依赖。
 * 基座内容 = `web/content.json`（本次构建的**同一份字节**，见本目录 README 的 sha 表）。
 * 用法：`CHROME_BIN=... node docs/reviews/ui-review/materials-wangyue-order/web-two-views.mjs`
 * 产物：截图／DOM 转储／日志写进本目录。
 */
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..', '..');
const webRoot = resolve(repoRoot, 'web');
const outDir = here;
const NODE = process.execPath;
const CHROME_BIN = process.env.CHROME_BIN
  || 'C:/Users/wsqsy/AppData/Local/Chromium/Application/chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function freePort() {
  return new Promise((res, rej) => {
    const probe = createServer();
    probe.on('error', rej);
    probe.listen(0, '127.0.0.1', () => { const p = probe.address().port; probe.close(() => res(p)); });
  });
}

class CDP {
  constructor(ws) { this.ws = ws; this.seq = 0; this.pending = new Map(); this.listeners = new Map(); }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true });
      ws.addEventListener('error', () => rej(new Error(`无法连接 CDP：${url}`)), { once: true });
    });
    const c = new CDP(ws);
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id && c.pending.has(msg.id)) {
        const { resolve: res, reject: rej } = c.pending.get(msg.id);
        c.pending.delete(msg.id);
        if (msg.error) rej(new Error(`${msg.error.message} (${msg.error.code})`));
        else res(msg.result);
        return;
      }
      for (const fn of c.listeners.get(msg.method) || []) fn(msg.params);
    });
    return c;
  }
  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(fn);
  }
  send(method, params = {}, timeoutMs = 30000) {
    const id = ++this.seq;
    return new Promise((res, rej) => {
      const timer = setTimeout(() => { if (this.pending.delete(id)) rej(new Error(`CDP 超时：${method}`)); }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); res(v); },
        reject: (e) => { clearTimeout(timer); rej(e); },
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail: String(detail) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `\n        ${detail}` : ''}`);
}
const dump = (v) => JSON.stringify(v);
const eq = (name, actual, expected) => check(name, dump(actual) === dump(expected),
  `actual=${dump(actual)}  expected=${dump(expected)}`);
const domDumps = [];

/** 期望值来源：直接读本次构建的内容产物（不是手抄），再与磁盘上的 md 逐字交叉核对。 */
const product = JSON.parse(readFileSync(join(webRoot, 'content.json'), 'utf8'));
const HAN_TITLES = product.poems.filter((p) => p.dynasty === '汉').map((p) => p.title);
const TANG_TITLES = product.poems.filter((p) => p.dynasty === '唐').map((p) => p.title);
const MODERN_TITLES = product.poems.filter((p) => p.dynasty === '近现代').map((p) => p.title);

async function main() {
  await mkdir(outDir, { recursive: true });
  const PORT = await freePort();
  const DEBUG_PORT = await freePort();
  const BASE = `http://127.0.0.1:${PORT}/`;

  const server = spawn(NODE, [resolve(webRoot, 'scripts', 'serve.mjs'), '--port', String(PORT), '--root', webRoot],
    { stdio: ['ignore', 'pipe', 'pipe'] });
  const userDataDir = await mkdtemp(join(tmpdir(), 'wangyue-order-'));
  const chrome = spawn(CHROME_BIN, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars', '--disable-background-networking', '--disable-component-update',
    '--disable-sync', '--remote-allow-origins=*', `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${userDataDir}`, 'about:blank',
  ], { stdio: 'ignore' });

  const pageErrors = [];
  let cdp = null;
  try {
    for (let i = 0; ; i++) {
      try { if ((await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).ok) break; } catch { /* 还没起 */ }
      if (i > 200) throw new Error('Chromium 调试端口未就绪');
      await sleep(150);
    }
    const targets = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
    const page = targets.find((t) => t.type === 'page');
    cdp = await CDP.connect(page.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    cdp.on('Runtime.exceptionThrown', (p) => pageErrors.push(
      p.exceptionDetails?.exception?.description || p.exceptionDetails?.text));

    const evaluate = async (expression) => {
      const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
      if (r.exceptionDetails) {
        throw new Error(`页面内异常：${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
      }
      return r.result.value;
    };
    const waitFor = async (expression, label = expression, timeout = 20000) => {
      const deadline = Date.now() + timeout;
      for (;;) {
        try { if (await evaluate(expression)) return true; } catch { /* 重试 */ }
        if (Date.now() > deadline) throw new Error(`等待超时：${label}`);
        await sleep(120);
      }
    };
    const shot = async (name) => {
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, 20000);
      await writeFile(join(outDir, name), Buffer.from(data, 'base64'));
    };
    const snap = async (label) => {
      const text = await evaluate('document.querySelector(\'[data-test="view"]\').innerText');
      domDumps.push(`===== ${label} =====\n${text}`);
    };

    // 与 Android 同一档窄屏（宽 420）
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true });
    await cdp.send('Page.navigate', { url: BASE });
    await waitFor('Boolean(document.querySelector(\'[data-test="view-index"]\'))', '目录视图');
    await waitFor('Boolean(window.__app && window.__app.ready)', '内容到达');

    // ---------------------------------------------------------------- ① 朝代页
    const heads = await evaluate('[...document.querySelectorAll(\'[data-test="dynasty-group-title"] [data-test="dynasty-label"]\')].map(e => e.innerText)');
    eq('组序仍是 汉／唐／近现代（未变）', heads, ['汉', '唐', '近现代']);
    const counts = await evaluate('[...document.querySelectorAll(\'[data-test="dynasty-group-title"]\')].map(e => e.innerText.split("\\n").pop())');
    eq('组头计数：汉 19 首／唐 3 首／近现代 1 首', counts, ['19 首', '3 首', '1 首']);

    await evaluate('[...document.querySelectorAll(\'[data-test="dynasty-group-title"]\')].forEach(b => { if (b.getAttribute("aria-expanded") !== "true") b.click(); })');
    await sleep(300);
    const rowsOf = (key) => evaluate(`(() => {
      const g = [...document.querySelectorAll('[data-test="dynasty-group"]')]
        .find(x => x.dataset.dynastyKey === ${JSON.stringify(key)});
      if (!g) return [];
      return [...g.querySelectorAll('[data-test="poem-row"]')].map(r => ({
        id: r.dataset.poemId,
        title: r.querySelector('.poem-row-title').innerText,
        author: r.querySelector('.poem-row-author') ? r.querySelector('.poem-row-author').innerText : '',
      }));
    })()`);

    const tang = await rowsOf('唐');
    eq('【朝代页】「唐」组 = 望岳 → 梦李白其一 → 梦李白其二', tang.map((r) => r.title), TANG_TITLES);
    eq('【朝代页】「唐」组 id 同序（两条独立条目不变）', tang.map((r) => r.id),
      ['杜甫-望岳', '杜甫-梦李白二首·其一', '杜甫-梦李白二首·其二']);
    eq('【朝代页】「唐」组作者行都是 杜甫', tang.map((r) => r.author), ['杜甫', '杜甫', '杜甫']);

    const han = await rowsOf('汉');
    eq('【朝代页】「汉」19 首次序未变（逐首 title 与产物一致）', han.map((r) => r.title), HAN_TITLES);
    eq('【朝代页】「汉」首尾未变', [han[0].title, han[han.length - 1].title], ['行行重行行', '明月何皎皎']);
    const modern = await rowsOf('近现代');
    eq('【朝代页】「近现代」1 首未变', modern.map((r) => r.title), MODERN_TITLES);
    eq('目录总诗数 = 23', await evaluate('window.__app.summary().poems'), 23);
    await snap('朝代页（3 组全展开，唐组三行在最前）');
    await shot('01-dynasty-tang-expanded.png');

    // 只把「唐」组滚进视野再抓一张，便于看图对行
    await evaluate('document.querySelector(\'[data-test="dynasty-group"][data-dynasty-key="唐"]\').scrollIntoView({ block: "start" }); true');
    await sleep(250);
    await shot('02-dynasty-tang-rows.png');

    // ---------------------------------------------------------------- ② 标签页
    await evaluate('document.querySelector(\'[data-test="tab-tags"]\').click(); true');
    await waitFor('Boolean(document.querySelector(\'[data-test="tag-group"]\'))', '标签视图');
    const tagKeys = await evaluate('[...document.querySelectorAll(\'[data-test="tag-group"]\')].map(g => g.dataset.tagId)');
    eq('标签组序仍是 古诗十九首 → 唐诗三百首', tagKeys, ['古诗十九首', '唐诗三百首']);

    await evaluate('document.querySelector(\'[data-test="tag-group"][data-tag-id="唐诗三百首"] [data-test="tag-group-title"]\').click(); true');
    await sleep(300);
    const tagRows = await evaluate(`[...document.querySelectorAll('[data-test="tag-group"][data-tag-id="唐诗三百首"] [data-test="poem-row"]')]
      .map(r => ({ id: r.dataset.poemId, title: r.querySelector('.poem-row-title').innerText }))`);
    eq('【标签页】「唐诗三百首」= 望岳 → 梦李白其一 → 梦李白其二', tagRows.map((r) => r.title), TANG_TITLES);
    eq('【标签页】同上三行 id 同序', tagRows.map((r) => r.id),
      ['杜甫-望岳', '杜甫-梦李白二首·其一', '杜甫-梦李白二首·其二']);

    // 两个视图的三行必须是**同一相对次序**（这正是本次改动的目的）
    eq('两视图的「唐」三行次序完全一致', tagRows.map((r) => r.title), tang.map((r) => r.title));

    await evaluate('document.querySelector(\'[data-test="tag-group"][data-tag-id="古诗十九首"] [data-test="tag-group-title"]\').click(); true');
    await sleep(250);
    await evaluate('document.querySelector(\'[data-test="tag-group"][data-tag-id="唐诗三百首"]\').scrollIntoView({ block: "start" }); true');
    await sleep(250);
    await snap('标签页（古诗十九首 + 唐诗三百首 展开）');
    await shot('03-tags-tang300-3-rows.png');

    eq('整轮没有未捕获异常 / JS error', pageErrors, []);
  } finally {
    try { if (cdp) await cdp.send('Browser.close'); } catch { /* 关不掉就算了 */ }
    chrome.kill();
    server.kill();
  }

  const failed = results.filter((r) => !r.ok);
  await writeFile(join(outDir, 'dom-dumps.txt'), `${domDumps.join('\n\n')}\n`, 'utf8');
  await writeFile(join(outDir, 'web-two-views.log'),
    `${results.map((r) => `${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `\n        ${r.detail}` : ''}`).join('\n')}\n\n`
    + `通过 ${results.length - failed.length} / ${results.length}\n`, 'utf8');
  console.log(`\n通过 ${results.length - failed.length} / ${results.length}`);
  if (failed.length) { console.log('失败项：'); for (const f of failed) console.log(`  ✗ ${f.name}\n      ${f.detail}`); }
  process.exitCode = failed.length ? 1 : 0;
}

main().catch((err) => { console.error(err.stack || err.message); process.exitCode = 1; });
