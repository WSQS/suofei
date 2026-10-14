/*
 * shot.mjs —— 用本机真 Chromium（headless=new + CDP）截图。
 *
 * 为什么不直接用 chrome --screenshot：
 * 本机旧式 headless 的窗口宽度有下限（实测 --window-size=430 仍然得到 innerWidth=484 CSS px），
 * 截图却是 430px 宽，于是右侧内容被硬裁掉 —— 那是假象，不是原型溢出。
 * 这里改用 CDP 的 Emulation.setDeviceMetricsOverride 精确指定 CSS 宽高与 DPR，截图不再被裁。
 *
 * 用法（在 prototype/ 下）：
 *   node tools/shot.mjs --out screenshots/x.png --url 'index.html?theme=paper#/'
 *                         [--w 430 --h 932 --dpr 2] [--setup 'js 片段']
 * 依赖：只用 Node 内置 fetch / WebSocket / child_process，不装任何包。
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const args = process.argv.slice(2);
function arg(name, dflt) {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : dflt;
}

const out = arg('out');
const urlArg = arg('url', 'index.html');
const width = Number(arg('w', 430));
const height = Number(arg('h', 932));
const dpr = Number(arg('dpr', 2));
const setup = arg('setup', '');
const settle = Number(arg('settle', 400));
const full = arg('full', '0') === '1';
const expect = arg('expect', '');
const chrome =
  process.env.CHROME_BIN ||
  join(process.env.LOCALAPPDATA || '', 'Chromium', 'Application', 'chrome.exe');
if (!out) throw new Error('缺少 --out');

const baseUrl = /^https?:\/\//.test(urlArg)
  ? urlArg.split('#')[0]
  : 'file:///' + resolve(urlArg.split('#')[0]).replace(/\\/g, '/');
const hash = urlArg.includes('#') ? '#' + urlArg.split('#').slice(1).join('#') : '';
const target = baseUrl + hash;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'shot-profile-'));
const port = 9222 + Math.floor(Math.random() * 500);

const child = spawn(
  chrome,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--user-data-dir=' + profile,
    '--remote-debugging-port=' + port,
    'about:blank',
  ],
  { stdio: 'ignore' }
);

async function waitForDevtools() {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return await res.json();
    } catch {
      /* 起得慢，继续等 */
    }
    await sleep(150);
  }
  throw new Error('Chromium 的 devtools 端口没起来');
}

function cdp(ws) {
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve: res, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : res(msg.result);
    } else if (msg.method) {
      events.push(msg.method);
    }
  });
  return {
    events,
    send(method, params = {}) {
      const myId = ++id;
      ws.send(JSON.stringify({ id: myId, method, params }));
      return new Promise((res, reject) => pending.set(myId, { resolve: res, reject }));
    },
  };
}

async function fullPageClip(c) {
  const m = await c.send('Page.getLayoutMetrics');
  const size = m.cssContentSize || m.contentSize;
  return { x: 0, y: 0, width: Math.ceil(size.width), height: Math.ceil(size.height), scale: 1 };
}

let exitCode = 0;
try {
  await waitForDevtools();
  const created = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
  const tab = await created.json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  const c = cdp(ws);

  // 收集页面侧报错，避免「截图成功了，但页面其实是白的」这种假绿。
  const errors = [];
  const logs = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      errors.push('uncaught: ' + (d.exception?.description || d.text));
    } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      errors.push('console.error: ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
    } else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      // 例如 file:// 下 fetch 本地文件的拒绝：这是原型的预期回退路径，只提示不判失败。
      logs.push('log: ' + m.params.entry.text);
    }
  });

  await c.send('Runtime.enable');
  await c.send('Log.enable');
  await c.send('Page.enable');
  await c.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: dpr,
    mobile: true,
  });
  await c.send('Page.navigate', { url: target });

  for (let i = 0; i < 100 && !c.events.includes('Page.loadEventFired'); i++) await sleep(100);
  await sleep(settle);

  if (setup) {
    const r = await c.send('Runtime.evaluate', { expression: setup, awaitPromise: true, returnByValue: true });
    await sleep(settle);
    if (r && r.exceptionDetails) throw new Error('setup 脚本出错：' + JSON.stringify(r.exceptionDetails));
  }
  const shot = await c.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: full,
    ...(full ? { clip: await fullPageClip(c) } : {}),
  });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, Buffer.from(shot.data, 'base64'));

  const probe = await c.send('Runtime.evaluate', {
    expression:
      "JSON.stringify({innerWidth:innerWidth,scrollWidth:document.documentElement.scrollWidth,rendered:!!document.querySelector('.topbar'),lines:document.querySelectorAll('.line').length,stanzas:document.querySelectorAll('.stanza').length,groups:document.querySelectorAll('.grouprow').length,brand:(function(){var b=document.querySelector('.brand');return b?b.innerText.replace(/\\n/g,'/'):null})(),noteBodyHidden:(function(){var n=document.querySelector('.notes-body');return n?n.parentElement.hasAttribute('hidden'):null})(),noteExpanded:(function(){var h=document.querySelector('.notes-head');return h?h.getAttribute('aria-expanded'):null})()})",
    returnByValue: true,
  });
  if (probe.exceptionDetails) {
    throw new Error('页面自检脚本出错：' + probe.exceptionDetails.exception.description);
  }
  const info = JSON.parse(probe.result.value);
  console.log(out + '  ' + width + 'x' + height + ' @' + dpr + '  ' + probe.result.value);

  // 页面报错/未渲染时不能交出一张空白图：如实失败，不装作成功。
  const pageErrors = errors.slice();
  if (pageErrors.length) console.error('页面报错：\n  ' + pageErrors.join('\n  '));
  if (logs.length) console.error('浏览器日志（不判失败）：\n  ' + logs.join('\n  '));
  if (!info.rendered || pageErrors.length) {
    throw new Error('页面没有正常渲染' + (pageErrors.length ? '（见上面的报错）' : '（缺 .topbar）'));
  }
  if (expect && !new RegExp(expect).test(probe.result.value)) {
    throw new Error('自检未满足 --expect /' + expect + '/：' + probe.result.value);
  }
  ws.close();
} catch (err) {
  exitCode = 1;
  console.error('截图失败：' + err.message);
} finally {
  child.kill();
  await sleep(250);
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    /* 临时 profile 删不掉不影响结果 */
  }
}
process.exit(exitCode);
