#!/usr/bin/env node
/**
 * **演练脚本**（不是产品代码、不属于任何测试套件、不进 CI）。
 *
 * 对象：杜甫《梦李白二首》其一/其二入库后，**演练用内容版本 `2026.10.16.25`** 上的「唐组」这一段。
 * 只核这几件事（其余交给仓库既有套件，见 README）：
 *   ① 目录应有 **3 个组**（汉／唐／近现代），且「汉」19 首、「近现代」1 首**未被改动**；
 *   ② 「唐」组 **2 首**，次序 其一 → 其二（orderInSource 1→2，客户端不重排）；
 *   ③ 两首是**两条独立路由**：各能打开自己的诗页与自己的详情页（`#/p/<id>` / `#/p/<id>/detail`）；
 *   ④ 详情页「← 返回这首诗」回到**那一首**（不是目录、也不是另一首）；目录返回行为照旧。
 *
 * 手法与仓库 e2e（`web/tests/e2e-cdp.mjs`）同一套：无头 Chromium ＋ CDP，零第三方依赖。
 * 用法：`CHROME_BIN=... node docs/reviews/ui-review/materials-dream-libai/web-dryrun.mjs`
 * 产物：本脚本把截图／DOM 转储／日志写进同目录的 `web/`（目录不存在则创建）。
 */
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..', '..');
const webRoot = resolve(repoRoot, 'web');
const outDir = resolve(here, 'web');
const NODE = process.execPath;
const CHROME_BIN = process.env.CHROME_BIN
  || 'C:/Users/wsqsy/AppData/Local/Chromium/Application/chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function freePort() {
  return new Promise((res, rej) => {
    const probe = createServer();
    probe.on('error', rej);
    probe.listen(0, '127.0.0.1', () => {
      const p = probe.address().port;
      probe.close(() => res(p));
    });
  });
}

// ------------------------------------------------------------------ CDP 薄客户端（同 e2e 手法）
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

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail: String(detail) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `\n        ${detail}` : ''}`);
}
const dump = (v) => JSON.stringify(v);
const eq = (name, actual, expected) => check(name, dump(actual) === dump(expected),
  `actual=${dump(actual)}  expected=${dump(expected)}`);
const domDumps = [];

async function main() {
  await mkdir(outDir, { recursive: true });
  const PORT = await freePort();
  const DEBUG_PORT = await freePort();
  const BASE = `http://127.0.0.1:${PORT}/`;

  const server = spawn(NODE, [resolve(webRoot, 'scripts', 'serve.mjs'), '--port', String(PORT), '--root', webRoot],
    { stdio: ['ignore', 'pipe', 'pipe'] });
  const userDataDir = await mkdtemp(join(tmpdir(), 'dream-libai-dryrun-'));
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
      const r = await cdp.send('Runtime.evaluate', {
        expression, awaitPromise: true, returnByValue: true, userGesture: true,
      });
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
    const snap = async (label, selector = '[data-test="view"]') => {
      const text = await evaluate(`document.querySelector(${JSON.stringify(selector)}).innerText`);
      domDumps.push(`===== ${label} =====\n${text}`);
    };

    // 视口与 Android 参照同一档（宽 420 的窄屏）
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true });
    await cdp.send('Page.navigate', { url: BASE });
    await waitFor('Boolean(document.querySelector(\'[data-test="view-index"]\'))', '目录视图');
    await waitFor('Boolean(window.__app && window.__app.ready)', '内容到达');

    // ---------------------------------------------------------------- ① 目录：3 组
    const heads = await evaluate('[...document.querySelectorAll(\'[data-test="dynasty-group-title"] [data-test="dynasty-label"]\')].map(e => e.innerText)');
    eq('目录组头 = 汉／唐／近现代（3 组，注册表 order 升序）', heads, ['汉', '唐', '近现代']);
    const counts = await evaluate('[...document.querySelectorAll(\'[data-test="dynasty-group-title"]\')].map(e => e.innerText.split("\\n").pop())');
    eq('组头计数行：汉 19 首／唐 2 首／近现代 1 首', counts, ['19 首', '2 首', '1 首']);
    const keys = await evaluate('[...document.querySelectorAll(\'[data-test="dynasty-group"]\')].map(g => g.dataset.dynastyKey)');
    eq('组的 data 键同序', keys, ['汉', '唐', '近现代']);

    // 展开全部组（IF-44 首态全收起）
    await evaluate('[...document.querySelectorAll(\'[data-test="dynasty-group-title"]\')].forEach(b => { if (b.getAttribute("aria-expanded") !== "true") b.click(); })');
    await sleep(300);
    const rowsOf = (key) => evaluate(`(() => {
      const g = [...document.querySelectorAll('[data-test="dynasty-group"]')]
        .find(x => x.dataset.dynastyKey === ${JSON.stringify(key)});
      return g ? [...g.querySelectorAll('[data-test="poem-row"]')].map(r => ({
        id: r.dataset.poemId, title: r.querySelector('.poem-row-title').innerText,
        author: r.querySelector('.poem-row-author') ? r.querySelector('.poem-row-author').innerText : '' })) : [];
    })()`);
    const tang = await rowsOf('唐');
    eq('「唐」组 = 2 首，次序 其一 → 其二（orderInSource 1→2，客户端不重排）',
      tang.map((r) => r.title), ['梦李白二首·其一', '梦李白二首·其二']);
    eq('「唐」组两条是**两条独立条目**（id 不同）', tang.map((r) => r.id),
      ['杜甫-梦李白二首·其一', '杜甫-梦李白二首·其二']);
    eq('「唐」组的作者行都是 杜甫', tang.map((r) => r.author), ['杜甫', '杜甫']);
    const han = await rowsOf('汉');
    const modern = await rowsOf('近现代');
    eq('「汉」组仍是 19 首（已发布内容未被改动）', han.length, 19);
    eq('「汉」组首尾未变', [han[0].title, han[han.length - 1].title], ['行行重行行', '明月何皎皎']);
    eq('「近现代」组仍是 1 首', modern.map((r) => r.title), ['七律·和郭沫若同志']);
    const total = await evaluate('window.__app.summary().poems');
    eq('目录总诗数 = 22', total, 22);
    await snap('目录（3 组，全展开）');
    await shot('01-index-3groups-tang.png');

    // ---------------------------------------------------------------- ②③ 两首各自的路由
    for (const [i, poem] of tang.entries()) {
      const n = i + 1;
      await cdp.send('Page.navigate', { url: `${BASE}#/p/${poem.id}` });
      await waitFor(`(() => { const v = document.querySelector('[data-test="view-poem"]'); return Boolean(v) && v.dataset.poemId === ${JSON.stringify(poem.id)}; })()`,
        `诗页 ${poem.id}`);
      const poemView = await evaluate(`(() => {
        const v = document.querySelector('[data-test="view-poem"]');
        return { id: v.dataset.poemId, title: v.querySelector('[data-test="poem-title"]').innerText,
          lines: [...v.querySelectorAll('[data-test="poem-line"]')].map(e => e.innerText),
          detailHref: v.querySelector('[data-test="poem-detail-link"]').getAttribute('href'),
          hasDetailBody: v.querySelectorAll('[data-test="detail-body"]').length };
      })()`);
      eq(`其一/其二 #${n}：诗页 data-poem-id == ${poem.id}`, poemView.id, poem.id);
      eq(`其一/其二 #${n}：诗题`, poemView.title, poem.title);
      eq(`其一/其二 #${n}：正文 8 行（八联），首行与末行`, [poemView.lines.length, poemView.lines[0], poemView.lines[7]],
        [8, ['死别已吞声，生别常恻恻。', '浮云终日行，游子久不至。'][i],
          ['水深波浪阔，无使蛟龙得。', '千秋万岁名，寂寞身后事。'][i]]);
      eq(`其一/其二 #${n}：诗页**不出现**详情正文（detail 只在详情页）`, poemView.hasDetailBody, 0);
      // 契约：路由里的 id 要经 encodeURIComponent（中文 id 会被百分号编码）——期望值同样编码，不把编码当成缺陷。
      const encId = encodeURIComponent(poem.id);
      eq(`其一/其二 #${n}：「详情」入口指向自己的详情页`, poemView.detailHref, `#/p/${encId}/detail`);
      await snap(`诗页 #${n}（${poem.title}）`);
      await shot(`0${n + 1}-poem-${n}.png`);

      await cdp.send('Page.navigate', { url: `${BASE}#/p/${poem.id}/detail` });
      await waitFor(`(() => { const v = document.querySelector('[data-test="view-detail"]'); return Boolean(v) && v.dataset.poemId === ${JSON.stringify(poem.id)}; })()`,
        `详情页 ${poem.id}`);
      const detailView = await evaluate(`(() => {
        const v = document.querySelector('[data-test="view-detail"]');
        return { id: v.dataset.poemId, title: v.querySelector('[data-test="detail-title"]') ? v.querySelector('[data-test="detail-title"]').innerText : null,
          source: v.querySelector('[data-test="detail-source"]').innerText,
          h3: [...v.querySelectorAll('[data-test="detail-body"] [data-test="md-h3"]')].map(e => e.innerText),
          li: [...v.querySelectorAll('[data-test="detail-body"] [data-test="md-li"]')].map(e => e.innerText),
          backHref: v.querySelector('[data-test="back-to-poem"]').getAttribute('href'),
          backText: v.querySelector('[data-test="back-to-poem"]').innerText };
      })()`);
      eq(`其一/其二 #${n}：详情页 data-poem-id == ${poem.id}`, detailView.id, poem.id);
      eq(`其一/其二 #${n}：详情页返回文案与去向 = 那一首（不是目录、也不是另一首）`,
        [detailView.backText, detailView.backHref], ['← 返回这首诗', `#/p/${encId}`]);
      eq(`其一/其二 #${n}：详情页「异文」小标题`, detailView.h3, ['异文']);
      check(`其一/其二 #${n}：详情页异文为无序列表且非空（${detailView.li.length} 条）`, detailView.li.length >= 1, dump(detailView.li));
      check(`其一/其二 #${n}：详情页底本来源块逐字含《全唐诗》卷二百一十八`, detailView.source.includes('《全唐诗》卷二百一十八'), detailView.source);
      await snap(`详情页 #${n}（${poem.title}）`);
      await shot(`0${n + 4}-detail-${n}.png`);

      // ④ 真点「← 返回这首诗」：应落回**那一首**的诗页
      await evaluate('document.querySelector(\'[data-test="back-to-poem"]\').click(); true');
      await waitFor(`(() => { const v = document.querySelector('[data-test="view-poem"]'); return Boolean(v) && v.dataset.poemId === ${JSON.stringify(poem.id)}; })()`,
        `点击返回后回到那一首诗 ${poem.id}`);
      eq(`其一/其二 #${n}：点「← 返回这首诗」后确实回到 ${poem.id}`,
        await evaluate('document.querySelector(\'[data-test="view-poem"]\').dataset.poemId'), poem.id);
      // 目录返回行为照旧
      await evaluate('document.querySelector(\'[data-test="back-to-index"]\').click(); true');
      await waitFor('Boolean(document.querySelector(\'[data-test="view-index"]\'))', '返回目录');
      eq(`其一/其二 #${n}：诗页「← 目录」照旧回到目录`, await evaluate('location.hash'), '#/');
    }

    eq('整轮没有未捕获异常 / JS error', pageErrors, []);
  } finally {
    try { if (cdp) await cdp.send('Browser.close'); } catch { /* 关不掉就算了 */ }
    chrome.kill();
    server.kill();
  }

  const failed = results.filter((r) => !r.ok);
  await writeFile(join(outDir, 'dom-dumps.txt'), `${domDumps.join('\n\n')}\n`, 'utf8');
  await writeFile(join(outDir, 'web-dryrun.log'),
    `${results.map((r) => `${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `\n        ${r.detail}` : ''}`).join('\n')}\n\n`
    + `通过 ${results.length - failed.length} / ${results.length}\n`, 'utf8');
  console.log(`\n通过 ${results.length - failed.length} / ${results.length}`);
  if (failed.length) { console.log('失败项：'); for (const f of failed) console.log(`  ✗ ${f.name}\n      ${f.detail}`); }
  process.exitCode = failed.length ? 1 : 0;
}

main().catch((err) => { console.error(err.stack || err.message); process.exitCode = 1; });
