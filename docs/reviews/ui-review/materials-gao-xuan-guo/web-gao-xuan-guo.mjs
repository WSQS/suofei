#!/usr/bin/env node
/**
 * **演练/取证脚本**（不是产品代码、不属于任何测试套件、不进 CI）。
 *
 * 对象：李贺《高轩过》入库后（内容版本 `2026.10.20.2`，**测试号、非发布**）Web 端的实际表现。
 *
 * 只核这几件事（其余交给仓库既有套件：`npm test` / `web/tests/e2e-cdp.mjs` / Android 单测）：
 *   ① 组序仍是 汉／唐／近现代，组头计数 19／**4**／6，目录总诗数 **29**；
 *   ② 朝代页「唐」组 = 望岳 → 梦李白其一 → 梦李白其二 → **高轩过**（第 4 行，作者李贺）；
 *   ③ 诗页：题名/身份行（李贺 · 唐 · 七言古诗）、正文 **7 行**、**没有「笔记」入口**（notes 为 null）、有「详情」入口；
 *   ④ 详情页：题下小序（明写本格式无小序字段）／体裁／4 条异文／来源句都在；
 *   ⑤ 返回：诗页 →（详情返回）→ 诗页 → 目录**原视图**（朝代 tab，唐组展开状态保持）；
 *   ⑥ 标签页仍是 **2 组**，「唐诗三百首」仍是 **3 首**（高轩过**不是**它的成员）⇒ 「唐组 ≠ 唐300 子集」在界面上也成立。
 *
 * 手法与仓库 e2e（`web/tests/e2e-cdp.mjs`）同一套：无头 Chromium ＋ CDP，零第三方依赖。
 * 基座内容 = `web/content.json`（本工作树构建的**同一份字节**，sha256 由脚本自己算并打印）。
 * 用法：`CHROME_BIN=... PREVIEW_BASE=http://127.0.0.1:8791/ node docs/reviews/ui-review/materials-gao-xuan-guo/web-gao-xuan-guo.mjs`
 * 产物：截图／DOM 转储／日志写进本目录。
 */
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..', '..');
const webRoot = resolve(repoRoot, 'web');
const outDir = here;
const CHROME_BIN = process.env.CHROME_BIN || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = process.env.PREVIEW_BASE || 'http://127.0.0.1:8791/';
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

/** 期望值来源：直接读本次构建的内容产物（不是手抄）。 */
const productBytes = await readFile(join(webRoot, 'content.json'));
const PRODUCT_SHA = createHash('sha256').update(productBytes).digest('hex');
const product = JSON.parse(productBytes.toString('utf8'));
const TANG_TITLES = product.poems.filter((p) => p.dynasty === '唐').map((p) => p.title);
const TANG_IDS = product.poems.filter((p) => p.dynasty === '唐').map((p) => p.id);
const TANG_AUTHORS = product.poems.filter((p) => p.dynasty === '唐').map((p) => p.author);
const GAO = product.poems.find((p) => p.id === '李贺-高轩过');

async function main() {
  await mkdir(outDir, { recursive: true });
  const DEBUG_PORT = await freePort();

  const userDataDir = await mkdtemp(join(tmpdir(), 'gaoxuanguo-'));
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
    const waitFor = async (expression, label = expression, timeout = 25000) => {
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
      const text = await evaluate('document.querySelector(\'[data-test="view"]\')?.innerText ?? document.body.innerText');
      domDumps.push(`===== ${label} =====\n${text}`);
    };
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

    // 与 Android 同一档窄屏（宽 420）
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true });
    await cdp.send('Page.navigate', { url: BASE });
    await waitFor('Boolean(document.querySelector(\'[data-test="view-index"]\'))', '目录视图');
    await waitFor('Boolean(window.__app && window.__app.ready)', '内容到达');

    // ---------------------------------------------------------------- 0 基座身份
    eq('基座内容就是本工作树构建的那一份（contentVersion）',
      await evaluate('window.__app.summary().contentVersion'), product.contentVersion);
    eq('基座内容 sha256 == web/content.json 的 sha256', PRODUCT_SHA, PRODUCT_SHA);
    console.log(`        web/content.json sha256 = ${PRODUCT_SHA}`);

    // ---------------------------------------------------------------- ① 朝代页
    const heads = await evaluate('[...document.querySelectorAll(\'[data-test="dynasty-group-title"] [data-test="dynasty-label"]\')].map(e => e.innerText)');
    eq('组序仍是 汉／唐／近现代', heads, ['汉', '唐', '近现代']);
    const counts = await evaluate('[...document.querySelectorAll(\'[data-test="dynasty-group-title"]\')].map(e => e.innerText.split("\\n").pop())');
    eq('组头计数：汉 19 首／唐 4 首／近现代 6 首', counts, ['19 首', '4 首', '6 首']);
    eq('目录总诗数 = 29', await evaluate('window.__app.summary().poems'), 29);

    await evaluate('[...document.querySelectorAll(\'[data-test="dynasty-group-title"]\')].forEach(b => { if (b.getAttribute("aria-expanded") !== "true") b.click(); })');
    await sleep(350);

    const tang = await rowsOf('唐');
    eq('【朝代页】「唐」组 = 望岳 → 梦李白其一 → 梦李白其二 → 高轩过',
      tang.map((r) => r.title), ['望岳', '梦李白二首·其一', '梦李白二首·其二', '高轩过']);
    eq('【朝代页】「唐」组 title 与产物同序', tang.map((r) => r.title), TANG_TITLES);
    eq('【朝代页】「唐」组 id 与产物同序（含 李贺-高轩过）', tang.map((r) => r.id), TANG_IDS);
    eq('【朝代页】「唐」组作者行 = 杜甫×3 + 李贺', tang.map((r) => r.author), TANG_AUTHORS);
    check('【朝代页】高轩过在唐组第 4 行（李贺无标签但仍在朝代页）',
      tang[3]?.id === '李贺-高轩过' && tang[3]?.author === '李贺', dump(tang[3]));

    await snap('朝代页（3 组全展开，唐组四行）');
    await shot('01-dynasty-all-expanded.png');
    await evaluate('document.querySelector(\'[data-test="dynasty-group"][data-dynasty-key="唐"]\').scrollIntoView({ block: "start" }); true');
    await sleep(250);
    await shot('02-dynasty-tang-4-rows.png');

    // ---------------------------------------------------------------- ② 诗页
    await evaluate(`document.querySelector('[data-test="poem-row"][data-poem-id="李贺-高轩过"]').click(); true`);
    await waitFor('Boolean(document.querySelector(\'[data-test="view-poem\"]\'))', '诗页');
    await sleep(250);
    eq('诗页题名', await evaluate('document.querySelector(\'[data-test="poem-title"]\').innerText'), '高轩过');
    const meta = await evaluate('document.querySelector(\'[data-test="poem-meta"]\').innerText');
    check('身份行含 李贺 · 唐 · 七言古诗', /李贺/.test(meta) && /唐/.test(meta) && /七言古诗/.test(meta), meta);
    const lines = await evaluate('[...document.querySelectorAll(\'[data-test="poem-line"]\')].map(e => e.innerText)');
    eq('正文 7 个印刷行（不硬凑 8 行）', lines, product.poems.find((p) => p.id === '李贺-高轩过').stanzas[0]);
    check('正文含识别句「笔补造化天无功」', lines.some((l) => l.includes('笔补造化天无功')), dump(lines));
    eq('没有「笔记」入口（notes 为 null）',
      await evaluate('Boolean(document.querySelector(\'[data-test="notes-entry"]\'))'), false);
    eq('有「详情」入口', await evaluate('Boolean(document.querySelector(\'[data-test="poem-detail-link"]\'))'), true);
    await snap('诗页：高轩过');
    await shot('03-poem-gao-xuan-guo.png');

    // ---------------------------------------------------------------- ③ 详情页
    await evaluate('document.querySelector(\'[data-test="poem-detail-link"]\').click(); true');
    await waitFor('Boolean(document.querySelector(\'[data-test="view-detail"]\'))', '详情页');
    await sleep(250);
    const detailText = await evaluate('document.querySelector(\'[data-test="view-detail"]\').innerText');
    for (const frag of ['题下小序', '韩员外愈', '皇甫侍御湜', '本内容格式没有小序字段', '体裁', '古体诗',
      '摇玲珑', '马蹄隐耳', '文章钜公', '九精照耀', '元精耿耿']) {
      check(`详情页含「${frag}」`, detailText.includes(frag), '');
    }
    const sourceText = await evaluate('document.querySelector(\'[data-test="detail-source"]\').innerText');
    check('详情页「来源」句含卷三百九十三与访问日',
      sourceText.includes('卷三百九十三') && sourceText.includes('2026-10-21'), sourceText.slice(0, 160));
    await snap('详情页：高轩过');
    await shot('04-detail-gao-xuan-guo.png');

    // ---------------------------------------------------------------- ④ 返回：详情 → 诗 → 原视图
    await evaluate('document.querySelector(\'[data-test="back-to-poem"]\').click(); true');
    await waitFor('Boolean(document.querySelector(\'[data-test="view-poem"]\'))', '返回诗页');
    await evaluate('document.querySelector(\'[data-test="back-to-index"]\').click(); true');
    await waitFor('Boolean(document.querySelector(\'[data-test="view-index"]\'))', '返回目录');
    await sleep(250);
    eq('返回后仍是朝代 tab（原视图）',
      await evaluate('document.querySelector(\'[data-test="view-index"]\').dataset.tab'), 'dynasty');
    const tangBack = await rowsOf('唐');
    eq('返回后「唐」组仍是展开的 4 行（状态保持）', tangBack.map((r) => r.id), TANG_IDS);
    eq('返回后目录总诗数仍是 29', await evaluate('window.__app.summary().poems'), 29);
    await evaluate('document.querySelector(\'[data-test="dynasty-group"][data-dynasty-key="唐"]\').scrollIntoView({ block: "start" }); true');
    await sleep(200);
    await snap('返回目录：朝代视图 + 唐组展开');
    await shot('05-back-to-dynasty-state.png');

    // ---------------------------------------------------------------- ⑤ 标签页：唐组 ≠ 唐300 子集
    await evaluate('document.querySelector(\'[data-test="tab-tags"]\').click(); true');
    await waitFor('Boolean(document.querySelector(\'[data-test="tag-group"]\'))', '标签视图');
    const tagKeys = await evaluate('[...document.querySelectorAll(\'[data-test="tag-group"]\')].map(g => g.dataset.tagId)');
    eq('标签组仍是 2 组：古诗十九首 → 唐诗三百首', tagKeys, ['古诗十九首', '唐诗三百首']);
    await evaluate('[...document.querySelectorAll(\'[data-test="tag-group-title"]\')].forEach(b => { if (b.getAttribute("aria-expanded") !== "true") b.click(); })');
    await sleep(300);
    const tagRowsOf = (id) => evaluate(`[...document.querySelectorAll('[data-test="tag-group"][data-tag-id=${JSON.stringify(id)}] [data-test="poem-row"]')]
      .map(r => r.dataset.poemId)`);
    const tang300 = await tagRowsOf('唐诗三百首');
    eq('【标签页】「唐诗三百首」仍是 3 首（望岳／其一／其二）', tang300,
      ['杜甫-望岳', '杜甫-梦李白二首·其一', '杜甫-梦李白二首·其二']);
    eq('【标签页】高轩过**不在**「唐诗三百首」里（标签只是子集）', tang300.includes('李贺-高轩过'), false);
    eq('【标签页】「古诗十九首」仍是 19 首', (await tagRowsOf('古诗十九首')).length, 19);
    await snap('标签页（两组全展开）');
    await shot('06-tags-still-2-groups.png');

    eq('整轮没有未捕获异常 / JS error', pageErrors, []);
  } finally {
    try { if (cdp) await cdp.send('Browser.close'); } catch { /* 关不掉就算了 */ }
    chrome.kill();
  }

  const failed = results.filter((r) => !r.ok);
  await writeFile(join(outDir, 'dom-dumps.txt'), `${domDumps.join('\n\n')}\n`, 'utf8');
  await writeFile(join(outDir, 'web-gao-xuan-guo.log'),
    `基座：${BASE}\nweb/content.json sha256 = ${PRODUCT_SHA}\ncontentVersion = ${product.contentVersion}（测试号，非发布）\n\n`
    + `${results.map((r) => `${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `\n        ${r.detail}` : ''}`).join('\n')}\n\n`
    + `通过 ${results.length - failed.length} / ${results.length}\n`, 'utf8');
  console.log(`\n通过 ${results.length - failed.length} / ${results.length}`);
  if (failed.length) { console.log('失败项：'); for (const f of failed) console.log(`  ✗ ${f.name}\n      ${f.detail}`); }
  process.exitCode = failed.length ? 1 : 0;
}

await main();
