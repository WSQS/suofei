#!/usr/bin/env node
/* Web「关于页 ＋ 详情页」宽度口径实测（**真实应用** `web/`，8 视口 × 2 页；含横向溢出与元素级折行）
 *
 *   CHROME_BIN='C:/Users/wsqsy/AppData/Local/Chromium/Application/chrome.exe' node web/tests/width-audit.mjs
 *   … --only=320,1180     只跑其中几个视口（排查用）
 *   … --no-shot           不重出 PNG（复跑时用：已提交的图不该被复跑重写）
 *   … --strict            把「观察项 FINDING」也计入 exit code
 *
 * 被测口径（用户 2026-10-15 选定、2026-10-16 复核；采纳锚 `items/app-ui/history/round-2026-10-16-width-pct/`）：
 *   **C = min(V, max(320, 0.88 × (V − 24)))**，`V`＝视口宽；**`24` 是一次性扣除总量**（不是左右各 12）；
 *   **上界＝视口 V**（不夹 660/860）；**列外余白 ＝ (V−C)/2**；行内沿 `--edge-x` ＝ 1.05rem ＝ 16.8px，
 *   它是**列内**那一层 ⇒ **正文可用宽 ＝ C − 33.6**。
 * 该锚只在**目录页＋诗页**上实测过；**关于页与详情页从未实测**——本脚本补的就是这个缺口。
 *
 * 怎么加载：**真应用不是原型页** —— 用 `web/scripts/lib/deploy.mjs` 的 `makeDeployment()` 组一个真实
 * 部署目录（壳 + 真实内容产物），由仓库自带的零依赖静态服务 `web/scripts/serve.mjs` 提供服务，
 * 端口向内核要**系统空闲端口**（本仓踩过端口串台：写死端口会让 Chrome 连到另一轮的服务器）。
 * 与采纳锚的差别只有加载方式（锚用 `file://`）：列宽由 `app/main.js` 用 `window.innerWidth` 算，两者一致。
 *
 * 量的是什么：一个元素的**墨迹**用 Range 逐个**视觉行盒**量（同一行的多个 Range 片段按 top 合并）
 * ⇒ 每行一个左沿/右沿/宽度，都是「相对内容列内沿」的 CSS px（内沿＝0，可用宽右沿＝C−33.6）。
 *
 * 退出码（**真 exit**，不吞）：测量/口径断言全过 ⇒ 0；任一失败 ⇒ 1。页面级缺陷（横向溢出、仓库 URL
 * 顶边/折行、正文行越出可用宽）作为 **FINDING** 如实打印并在汇总里单列，**默认不改 exit code**
 *（本任务口径：「发现缺陷只报不改」；要让它们影响 exit code 就加 `--strict`）。
 */

import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { APP_VERSION, ROUTES } from '../app/config.js';
import { makeDeployment } from './lib/deploy.mjs';

// ------------------------------------------------------------------ 常量与参数

const webRoot = fileURLToPath(new URL('..', import.meta.url));     // web/
const repoRoot = resolve(webRoot, '..');
const shotDir = resolve(repoRoot, 'docs', 'design', 'width-audit');
const NODE = process.execPath;
const CHROME_BIN = process.env.CHROME_BIN
  || 'C:/Users/wsqsy/AppData/Local/Chromium/Application/chrome.exe';

const argv = process.argv.slice(2);
const onlyKeys = (argv.find((a) => a.startsWith('--only=')) || '').slice('--only='.length)
  .split(',').map((s) => s.trim()).filter(Boolean);
const wantShots = !argv.includes('--no-shot');
const strict = argv.includes('--strict');

/** 与采纳锚 round-2026-10-16-width-pct **同一组 8 个视口**（同高、同 mobile 标记）——这样本表的每一行
 *  都能与锚的目录页/诗页数字并排看。 */
const VIEWPORTS = [
  { key: '320', w: 320, h: 568, mobile: true, label: '手机 · 最小可用宽（列外余白在这一档是 0）' },
  { key: '360', w: 360, h: 932, mobile: true, label: '手机 · 窄屏' },
  { key: '390', w: 390, h: 844, mobile: true, label: '手机' },
  { key: '412', w: 412, h: 915, mobile: true, label: '手机' },
  { key: '430', w: 430, h: 932, mobile: true, label: '手机（前几轮的验收宽）' },
  { key: '740x360', w: 740, h: 360, mobile: true, label: '横屏（矮而宽）' },
  { key: '834', w: 834, h: 1112, mobile: false, label: '平板（C 在这里超过 660 ⇒ 证没有 660 上限）' },
  { key: '1180', w: 1180, h: 900, mobile: false, label: '桌面（C 在这里超过 860 ⇒ 同上）' },
];

/** 出图的视口（只出关键几张，不是几十张）。 */
const SHOT_KEYS = ['320', '1180'];

/** 合成 URL 探针：等宽 URL 字符数（真实那条约 30 字符；用户点名的是 33 字符那条）。 */
const URL_PROBE_LENS = [33, 37, 38, 39, 40];
/** 逐行明细（表 D）出哪几档视口。 */
const LINE_DETAIL_KEYS = ['320', '1180'];

const picked = onlyKeys.length ? VIEWPORTS.filter((v) => onlyKeys.includes(v.key)) : VIEWPORTS;
if (!picked.length) {
  console.error(`--only 没匹配到任何视口：${onlyKeys.join(',')}（可选 ${VIEWPORTS.map((v) => v.key).join(' / ')}）`);
  process.exit(2);
}

/** 已选口径：C = min(V, max(320, 0.88 × (V − 24)))。 */
const chosenC = (v) => Math.min(v, Math.max(320, 0.88 * (v - 24)));
const EDGE_X = 16.8;          // --edge-x ＝ 1.05rem ＝ 16.8px（行内沿，列内那一层）
const r2 = (n) => Math.round(n * 100) / 100;
const r3 = (n) => Math.round(n * 1000) / 1000;
/** 4 位小数：用来如实报「公式 vs 实测」的差——Chrome 布局按 1/64px 舍入，差可以到 0.015px。 */
const r4 = (n) => Math.round(n * 10000) / 10000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ 断言 / 观察项

const results = [];
const findings = [];
let sectionName = '';

function section(title) {
  sectionName = title;
  console.log(`\n=== ${title} ===`);
}

/** 测量/口径断言：失败会进 exit code。 */
function check(name, ok, detail = '') {
  results.push({ name: `${sectionName} · ${name}`, ok: Boolean(ok), detail: String(detail) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `\n        ${detail}` : ''}`);
}

/** 页面级观察（缺陷）——「只报不改」：默认不影响 exit code，加 --strict 才影响。 */
function finding(scene, what, detail) {
  findings.push({ scene, what, detail });
  console.log(`FIND  [${scene}] ${what} —— ${detail}`);
}

// ------------------------------------------------------------------ CDP 薄客户端（零第三方依赖）

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

// ------------------------------------------------------------------ 页面内量测脚本

/** 量测前言：列几何、可用宽、**逐视觉行**的墨迹、页面溢出扫描。
 *  一切都是**相对内容列内沿**的 CSS px：对齐全用「离内容左沿多少」说话。 */
const HELPERS = `
  const r3 = (n) => Math.round(n * 1000) / 1000;
  const view = document.getElementById('view');           /* .view-host ＝内容列（宽 C、居中） */
  const vr = view.getBoundingClientRect();
  const vcs = getComputedStyle(view);
  const padL = parseFloat(vcs.paddingLeft), padR = parseFloat(vcs.paddingRight);
  const contentLeft = vr.left + padL, contentRight = vr.right - padR;   /* 列内沿 */
  const avail = contentRight - contentLeft;                             /* 正文可用宽 ＝ C − 33.6 */
  /* **逐视觉行**的墨迹：Range 会把同一行上的多个片段（<strong> 等内联元素）各给一个矩形，
     所以先按 top 合并 ⇒ 一行一个 left/right/width。不合并就会把 1 行数成 3 行。 */
  const linesOf = (el) => {
    const rng = document.createRange();
    rng.selectNodeContents(el);
    const raw = [...rng.getClientRects()].filter((r) => r.width > 0.01 || r.height > 0.01);
    const byTop = new Map();
    for (const r of raw) {
      const key = Math.round(r.top * 100) / 100;
      const cur = byTop.get(key);
      if (!cur) byTop.set(key, { top: r.top, left: r.left, right: r.right });
      else { cur.left = Math.min(cur.left, r.left); cur.right = Math.max(cur.right, r.right); }
    }
    return [...byTop.values()].sort((a, b) => a.top - b.top).map((l) => ({
      top: r3(l.top), left: r3(l.left - contentLeft), right: r3(l.right - contentLeft), width: r3(l.right - l.left),
    }));
  };
  /* 一个元素的墨迹（相对内容左沿）：行数／每行左右沿／最长行宽／是否越出可用宽。 */
  const elem = (el, name) => {
    if (!el) return null;
    const box = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const lh = parseFloat(cs.lineHeight);
    const lineRects = linesOf(el);
    const maxRight = lineRects.length ? Math.max(...lineRects.map((r) => r.right)) : null;
    return {
      name, tag: el.tagName, text: el.textContent,
      fontSize: cs.fontSize, fontFamily: cs.fontFamily.split(',')[0].replace(/["']/g, ''),
      fontMono: /mono|Consolas|Menlo|Courier/i.test(cs.fontFamily),
      boxLeft: r3(box.left - contentLeft), boxWidth: r3(box.width),
      lineCount: lineRects.length, lineRects,
      minInkLeft: lineRects.length ? Math.min(...lineRects.map((r) => r.left)) : null,
      maxInkRight: maxRight,
      maxLineWidth: lineRects.length ? Math.max(...lineRects.map((r) => r.width)) : null,
      wraps: lineRects.length > 1,
      linesByHeight: Number.isFinite(lh) && lh > 0 ? r3(box.height / lh) : null,
      overflowsAvail: maxRight === null ? null : maxRight > avail + 0.05,
      overflowPx: maxRight === null ? null : r3(Math.max(0, maxRight - avail)),
      slackPx: maxRight === null ? null : r3(avail - maxRight),
    };
  };
  /* 页面级：横向溢出（documentElement.scrollWidth vs innerWidth）＋ 谁把它撑宽的。
     ⚠ 同时读 visualViewport.width：采纳锚踩过「元素越界 ⇒ Chrome shrink-to-fit 把**布局视口**撑到 394」
     这个坑——那时 innerWidth 本身就不是目标宽，后面所有数字都没意义。 */
  const pageInfo = () => {
    const de = document.documentElement;
    const w = window.innerWidth;
    const offenders = [...document.querySelectorAll('body *')]
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter((x) => x.r.width > 0 && (x.r.right > w + 0.5 || x.r.left < -0.5))
      .slice(0, 12)
      .map((x) => ({
        tag: x.el.tagName,
        test: x.el.dataset && x.el.dataset.test ? x.el.dataset.test : null,
        cls: String(x.el.className || '').slice(0, 36),
        left: r3(x.r.left), right: r3(x.r.right), width: r3(x.r.width),
      }));
    return {
      v: w,
      visualW: window.visualViewport ? window.visualViewport.width : null,
      cCss: parseFloat(getComputedStyle(de).getPropertyValue('--c')),
      colWidth: r3(vr.width), colWidthRaw: vr.width, colLeft: r3(vr.left), colRight: r3(vr.right),
      padL: r3(padL), padR: r3(padR), avail: r3(avail),
      docScrollWidth: de.scrollWidth, docClientWidth: de.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      overflow: de.scrollWidth > w,
      overflowPx: r3(Math.max(0, de.scrollWidth - w)),
      offenders,
    };
  };
  /* 合成探针：只在**量测期**临时插进活 DOM，量完立刻移除；**不改仓库里任何文件**。 */
  const withProbe = (host, node, fn) => {
    host.append(node);
    void node.offsetHeight;            // 强制布局
    const out = fn(node);
    node.remove();
    return out;
  };
  const mk = (tag, cls, test, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (test) el.dataset.test = test;
    if (text != null) el.textContent = text;
    return el;
  };
`;

/** 关于页量测。⚠ 2026-10-16：原来还量页脚诊断面板的五条（内容生成/取到时间、体积、诚实说明）——
 *  那个面板不属于已采纳的四页规格、已**整块从产品 UI 移除** ⇒ 这里不再量它们。 */
const SCRIPT_ABOUT = `(() => { ${HELPERS}
  const q = (s) => document.querySelector(s);
  const labels = [...document.querySelectorAll('[data-test="about-label"]')];
  const probeHost = q('.view--about');
  const base = q('[data-test="about-repo-url"]') ? q('[data-test="about-repo-url"]').textContent : '';
  /* URL 长度探针：真实 URL 的长度由内容决定（本树里不是 33 字符），用户点名的却是「33 字符那条」
     ⇒ 用同样式（.about-repo）的临时 <p> 量 33/37/40 字符的等宽 URL 在哪一步顶边、哪一步折行。 */
  const urlProbe = ${JSON.stringify(URL_PROBE_LENS)}.map((n) => {
    const text = base.length >= n ? base.slice(0, n) : base + 'x'.repeat(n - base.length);
    const p = mk('p', 'about-repo', '__probe-url', text);
    return { chars: n, ...withProbe(probeHost, p, (el) => elem(el, 'probe-url')) };
  });
  return {
    page: pageInfo(),
    title: elem(q('[data-test="about-app-name"]'), '关于·应用名(h1)'),
    labels: labels.map((el, i) => elem(el, '关于·标签' + (i + 1))),
    appValue: elem(q('[data-test="about-app-version"]'), '关于·应用版本值'),
    contentValue: elem(q('[data-test="about-content-version"]'), '关于·内容版本值'),
    repo: elem(q('[data-test="about-repo-url"]'), '关于·仓库链接URL'),
    repoTag: q('[data-test="about-repo-url"]') ? q('[data-test="about-repo-url"]').tagName : null,
    footerGenerated: undefined,
    footerLoaded: undefined,
    footerSize: undefined,
    footerHonest: undefined,
    urlProbe,
  };
})()`;

/** 详情页量测：正文每个块（`h3` 小标题 / `p` 段落 / `li` 列表项）逐行走一遍。 */
const SCRIPT_DETAIL = `(() => { ${HELPERS}
  const q = (s) => document.querySelector(s);
  const body = q('[data-test="detail-body"]');
  const blocks = [...body.querySelectorAll('h3, p, li')].map((el) => {
    const lineRects = linesOf(el);
    return {
      tag: el.tagName, cls: String(el.className || ''),
      text: el.textContent.slice(0, 28),
      lineCount: lineRects.length, lineRects,
      maxLineWidth: lineRects.length ? Math.max(...lineRects.map((r) => r.width)) : null,
      maxRight: lineRects.length ? Math.max(...lineRects.map((r) => r.right)) : null,
      minLeft: lineRects.length ? Math.min(...lineRects.map((r) => r.left)) : null,
    };
  });
  const all = blocks.flatMap((b) => b.lineRects.map((r) => ({ ...r, block: b.tag })));
  const longest = all.length ? all.reduce((a, b) => (b.width > a.width ? b : a)) : null;
  /* 块样式探针：真实产物里每首 detail 只有 \`### \` 与 \`- \` 两种块 ⇒ 段落／引用／有序列表这三类
     块样式**没有被真实内容覆盖**。这里拿正文里**最长的那个列表项原文**，用 app/render.js 同样的
     类名与 data-* 手工造三个块（量完即移除），量它们的行几何。
     ⚠ 局限：手工造标记（没走 renderMarkdown）；只用来验「块样式的行几何」，不验渲染正确性。 */
  const sample = (body.querySelectorAll('li')[1] || body.querySelectorAll('li')[0] || {}).textContent || '';
  const probeP = mk('p', 'md-p', '__probe-p', sample);
  const probeQ = mk('blockquote', 'md-quote', '__probe-quote');
  probeQ.append(mk('p', 'md-p', '__probe-quote-p', sample));
  const probeOl = mk('ol', 'md-ol', '__probe-ol');
  probeOl.append(mk('li', 'md-li', '__probe-ol-li', sample));
  const blockProbe = [
    { kind: '段落 p.md-p', node: probeP },
    { kind: '引用 blockquote.md-quote > p.md-p', node: probeQ },
    { kind: '有序列表 ol.md-ol > li.md-li', node: probeOl },
  ].map(({ kind, node }) => ({ kind, ...withProbe(body, node, (el) => elem(el, kind)) }));
  return {
    page: pageInfo(),
    title: elem(q('[data-test="detail-title"]'), '详情·诗题(h1)'),
    source: elem(q('[data-test="detail-source"]'), '详情·底本与来源(dd)'),
    empty: Boolean(q('[data-test="detail-empty"]')),
    blocks,
    lineCount: all.length,
    minInkLeft: all.length ? Math.min(...all.map((r) => r.left)) : null,
    maxInkRight: all.length ? Math.max(...all.map((r) => r.right)) : null,
    maxLineWidth: all.length ? Math.max(...all.map((r) => r.width)) : null,
    overLines: all.filter((r) => r.right > avail + 0.05).length,
    longest,
    blockProbe,
  };
})()`;

// ------------------------------------------------------------------ 端口 / 服务 / 浏览器

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

/** 起服务/浏览器前先确认端口是空的：**不静默复用**别人的端口（否则「连到另一轮的服务器」会伪装成
 *  看不懂的断言失败，而不是一条清楚的错误）。 */
async function assertPortFree(port, what) {
  try {
    await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(2000) });
  } catch {
    return; // 连不上 = 空闲
  }
  throw new Error(`端口 ${port}（${what}）已被占用：可能是另一个会话/另一轮在并发跑。`
    + '本轮直接停下，不静默复用。');
}

async function fetchOk(url, timeoutMs = 20000) {
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

function git(args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
}

// ------------------------------------------------------------------ 主流程

let server = null;
let chrome = null;
let userDataDir = null;
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

/** 停在一个已就绪的页面上：内容到了、视图渲染了（布局稳定）。
 *  ⚠ 2026-10-16：原先还等「页脚状态面板已填上内容行」——那个面板已从产品 UI 移除 ⇒ 不再等它。 */
async function waitForReadyPage(viewTest) {
  await waitFor(`Boolean(window.__app && window.__app.ready) && window.__app.summary().hasDoc === true`,
    { label: '应用就绪且内容已装载' });
  await waitFor(`Boolean(document.querySelector('[data-test="view-${viewTest}"]'))`, { label: `视图 ${viewTest}` });
  await sleep(250); // 让字体度量这类尾部渲染落定（只影响行数，不影响列宽）
}

/** 用**新文档**打开一个地址（视口先用 setDeviceMetricsOverride 定好），再量——不用「只改 hash」的
 *  同文档切视图：那样量的可能是上一档视口留下的布局。 */
async function openAndMeasure(url, viewTest, script) {
  await cdp.send('Page.navigate', { url: 'about:blank' });
  await cdp.send('Page.navigate', { url });
  await waitForReadyPage(viewTest);
  return evaluate(script);
}

async function shoot(name) {
  const { data } = await cdp.send('Page.captureScreenshot',
    { format: 'png', captureBeyondViewport: true }, 30000);
  const buf = Buffer.from(data, 'base64');
  const path = join(shotDir, name);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, buf);
  return buf;
}

/** PNG 头里的像素尺寸（自证「图真的是这一档视口拍的、没被截掉」）。 */
const pngSize = (buf) => ({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) });

/** 余量（可用宽 − 墨迹右沿）怎么说：|余量| < 0.05 ⇒ 正好压在那条线上（Chrome 布局舍入 1/64px 量级）。 */
const slackText = (e) => {
  if (!e || e.slackPx === null || e.slackPx === undefined) return '—';
  if (e.overflowsAvail) return `⚠越出 ${e.overflowPx}px`;
  if (Math.abs(e.slackPx) < 0.05) return '正好到线（0.05px 内）';
  return `余量 ${e.slackPx}px`;
};

const fmtElem = (e) => (e
  ? `行${e.lineCount}　墨迹左 ${e.minInkLeft}　右 ${e.maxInkRight}　最长行 ${e.maxLineWidth}　${slackText(e)}`
  : '（未找到）');

async function main() {
  // ---- 运行信息（基线 SHA 写进报告与 md，这里也自取一份） ----
  const sha = git(['rev-parse', 'HEAD']);
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const dirty = git(['status', '--porcelain']).split('\n').filter(Boolean);

  const tmp = await mkdtemp(join(tmpdir(), 'width-audit-'));
  const distPath = resolve(repoRoot, 'dist', 'content.json');
  let contentText;
  let contentFrom;
  if (existsSync(distPath)) {
    contentText = await readFile(distPath, 'utf8');
    contentFrom = 'dist/content.json（真实产物）';
  } else {
    // 仓库里没有 dist/（已 gitignore）⇒ 现场编一份。**编到临时目录**，不往仓库里写。
    const built = join(tmp, 'content.json');
    const child = spawn(NODE, [resolve(repoRoot, 'tools', 'build-content.mjs'),
      '--out', built, '--content-version', '2026.10.14.1', '--order', 'source'],
    { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    const code = await new Promise((r) => child.on('exit', r));
    if (code !== 0) throw new Error(`tools/build-content.mjs 编译失败（exit ${code}）：\n${out}`);
    contentText = await readFile(built, 'utf8');
    contentFrom = `${built}（现场编译：仓库里没有 dist/content.json）`;
  }
  const doc = JSON.parse(contentText);
  if (Number(doc.formatVersion) !== 2) {
    throw new Error(`内容产物不是 formatVersion 2（实际 ${doc.formatVersion}）——请先跑 node tools/build-content.mjs`);
  }
  // 详情页测**固定这一首**（第一首带 detail 的），各视口量的是同一篇正文，数字可比。
  const poem = doc.poems.find((p) => typeof p.detail === 'string' && p.detail.trim()) || doc.poems[0];

  const PORT = await freePort();
  const DEBUG_PORT = await freePort([PORT]);
  const deploy = await makeDeployment({ destDir: join(tmp, 'deploy'), appVersion: APP_VERSION, contentText });
  const BASE = `http://127.0.0.1:${PORT}/`;
  const URL_ABOUT = `${BASE}${ROUTES.about}`;
  const URL_DETAIL = `${BASE}${ROUTES.detail(poem.id)}`;

  console.log('================ 运行信息 ================');
  console.log(`仓库根   : ${repoRoot}`);
  console.log(`Commit   : ${sha}`);
  console.log(`分支     : ${branch}（${dirty.length ? `工作区有 ${dirty.length} 项未提交` : '工作区干净'}）`
    + '＋**未 push**（本任务不做远端操作）');
  console.log(`加载方式 : **本地静态服务 ${BASE}**（${resolve(webRoot, 'scripts', 'serve.mjs')}，root=${deploy.destDir}）`
    + '——不是 file://（与采纳锚的差别只有这一点；列宽由 JS 用 innerWidth 算，两者一致）');
  console.log(`内容     : ${contentFrom}；formatVersion=${doc.formatVersion} contentVersion=${doc.contentVersion} 诗${doc.poems.length}首`);
  console.log(`关于页   : ${URL_ABOUT}`);
  console.log(`详情页   : ${URL_DETAIL}（${poem.title}；detail ${poem.detail.length} 字）`);
  console.log(`浏览器   : ${CHROME_BIN}（--headless=new --hide-scrollbars）`);
  console.log(`口径     : C = min(V, max(320, 0.88 × (V − 24)))；行内沿 ${EDGE_X}px ⇒ 可用宽 = C − ${r2(EDGE_X * 2)}`);
  console.log(`视口     : ${picked.map((v) => `${v.w}×${v.h}`).join(' / ')}（与采纳锚同一组 8 个）`);
  if (wantShots) console.log(`出图     : ${picked.filter((v) => SHOT_KEYS.includes(v.key)).map((v) => v.key).join(' / ')}`
    + ` ⇒ ${shotDir}/*.png`);

  await assertPortFree(PORT, '本站静态服务');
  server = spawn(NODE, [resolve(webRoot, 'scripts', 'serve.mjs'), '--port', String(PORT), '--root', deploy.destDir],
    { stdio: ['ignore', 'pipe', 'pipe'] });
  await fetchOk(BASE);

  await assertPortFree(DEBUG_PORT, 'CDP 调试端口');
  userDataDir = await mkdtemp(join(tmpdir(), 'width-audit-chrome-'));
  chrome = spawn(CHROME_BIN, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    // 隐藏滚动条：与原型/采纳锚的量测口径一致（视口宽＝布局宽，列宽公式与居中都用 V=innerWidth）。
    '--hide-scrollbars',
    '--disable-background-networking', '--disable-component-update', '--disable-sync',
    '--remote-allow-origins=*', '--window-size=900,1100',
    `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${userDataDir}`,
    'about:blank',
  ], { stdio: 'ignore' });

  await fetchOk(`http://127.0.0.1:${DEBUG_PORT}/json/version`, 30000);
  const targets = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
  const pageTarget = targets.find((t) => t.type === 'page');
  if (!pageTarget) throw new Error('没有找到可用的 page target');
  cdp = await CDP.connect(pageTarget.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  cdp.on('Runtime.exceptionThrown', (p) => pageErrors.push(
    p.exceptionDetails?.exception?.description || p.exceptionDetails?.text,
  ));
  cdp.on('Log.entryAdded', (p) => { if (p.entry.level === 'error') pageErrors.push(`${p.entry.source}: ${p.entry.text}`); });

  // ------------------------------------------------------------------ 逐视口量测
  const aboutRows = [];
  const detailRows = [];
  const shots = [];

  for (const vp of picked) {
    section(`${vp.key}（${vp.w}×${vp.h}，${vp.label}）`);
    // DPR=2：与采纳锚的截图口径一致（量测全是 CSS px，不受 DPR 影响）。
    await cdp.send('Emulation.setDeviceMetricsOverride',
      { width: vp.w, height: vp.h, deviceScaleFactor: 2, mobile: vp.mobile });

    const shootHere = wantShots && SHOT_KEYS.includes(vp.key);

    const a = await openAndMeasure(URL_ABOUT, 'about', SCRIPT_ABOUT);
    const aboutShot = shootHere ? await shoot(`about-${vp.key}.png`) : null;
    const d = await openAndMeasure(URL_DETAIL, 'detail', SCRIPT_DETAIL);
    const detailShot = shootHere ? await shoot(`detail-${vp.key}.png`) : null;
    if (shootHere) {
      // 两条自证：① 图不是截错了页（曾经两支图截的是同一页，字节完全相同）
      //            ② 图像素宽 == V × DPR2（说明设备模拟真的生效、也没被截窄）
      const sa = pngSize(aboutShot);
      const sd = pngSize(detailShot);
      check(`${vp.key}·关于页与详情页的截图**确实不同**（防「两支图截了同一页」）`,
        !aboutShot.equals(detailShot), `about ${aboutShot.length} B ≠ detail ${detailShot.length} B`);
      check(`${vp.key}·截图像素宽 == V×DPR2（设备模拟生效、图没被截窄）`,
        sa.w === vp.w * 2 && sd.w === vp.w * 2, `about ${sa.w}×${sa.h} / detail ${sd.w}×${sd.h}`);
      check(`${vp.key}·截图高度不小于视口（全页截图没被截断）`,
        sa.h >= vp.h * 2 && sd.h >= vp.h * 2, `about 高 ${sa.h} / detail 高 ${sd.h}（视口 ${vp.h * 2}）`);
      shots.push(`about-${vp.key}.png（${aboutShot.length} B，${sa.w}×${sa.h}）`,
        `detail-${vp.key}.png（${detailShot.length} B，${sd.w}×${sd.h}）`);
      console.log(`    ⇒ 截图：about-${vp.key}.png（${sa.w}×${sa.h}）/ detail-${vp.key}.png（${sd.w}×${sd.h}）`);
    }

    const formula = r2(chosenC(vp.w));
    console.log(`  列宽：V=${vp.w}  A=V−24=${vp.w - 24}  0.88×A=${r2(0.88 * (vp.w - 24))}  `
      + `max(320,…)=${r2(Math.max(320, 0.88 * (vp.w - 24)))}  ⇒ C(公式)=${formula}`
      + `；列外余白=(V−C)/2=${r2((vp.w - chosenC(vp.w)) / 2)}；正文可用宽=C−33.6=${r2(chosenC(vp.w) - EDGE_X * 2)}`);

    // ---- 列宽口径（两页都验） ----
    for (const [page, m] of [['关于页', a], ['详情页', d]]) {
      const p = m.page;
      const delta = r4(p.colWidthRaw - chosenC(vp.w));
      check(`${page}·visualViewport.width == ${vp.w}（Chrome 没有 shrink-to-fit 把布局视口撑开）`,
        p.visualW !== null && Math.abs(p.visualW - vp.w) < 0.02, `visualViewport.width=${p.visualW}`);
      check(`${page}·实测列宽 == 公式值`, Math.abs(delta) <= 0.02,
        `实测 ${p.colWidthRaw}（raw） / 公式 ${formula} ⇒ Δ=${delta}px（Chrome 布局按 1/64px 舍入）`);
      check(`${page}·--c（运行时写进根元素的 px）== 公式值`,
        Math.abs(p.cCss - chosenC(vp.w)) <= 0.02, `--c=${p.cCss} / 公式 ${formula}`);
      check(`${page}·列外余白 = (V−C)/2`,
        Math.abs(p.colLeft - (vp.w - chosenC(vp.w)) / 2) < 0.6
        && Math.abs((vp.w - p.colRight) - (vp.w - chosenC(vp.w)) / 2) < 0.6,
        `左 ${p.colLeft} / 右 ${r2(vp.w - p.colRight)}，期望各 ${r2((vp.w - chosenC(vp.w)) / 2)}`);
      check(`${page}·行内沿 = ${EDGE_X}px（列内那一层照旧）`,
        Math.abs(p.padL - EDGE_X) < 0.05 && Math.abs(p.padR - EDGE_X) < 0.05,
        `左 ${p.padL} / 右 ${p.padR}；⇒ 内容可用宽实测 ${p.avail}`);
      console.log(`  页面（${page}）：documentElement.scrollWidth=${p.docScrollWidth} / innerWidth=${p.v}`
        + ` ⇒ ${p.overflow ? `**横向溢出 ${p.overflowPx}px**` : '无横向溢出'}`
        + `　（body.scrollWidth=${p.bodyScrollWidth}；越出视口的元素 ${p.offenders.length} 个）`);
      if (p.overflow) {
        finding(page, `横向溢出 ${p.overflowPx}px（scrollWidth ${p.docScrollWidth} > innerWidth ${p.v}）`,
          `撑宽元素：${p.offenders.map((o) => `${o.tag}.${o.cls}[${o.test}] 右${o.right}`).join(' / ') || '（未定位到）'}`);
      } else {
        for (const o of p.offenders) {
          finding(page, `元素越出视口但未造成滚动溢出：${o.tag}.${o.cls}${o.test ? `[data-test=${o.test}]` : ''}`,
            `left=${o.left} right=${o.right} width=${o.width}（innerWidth=${p.v}）`);
        }
      }
    }

    // ---- 关于页元素级 ----
    console.log('  关于页：');
    for (const e of [a.title, ...a.labels, a.appValue, a.contentValue, a.repo]) {
      if (e) console.log(`    · ${e.name.padEnd(16)} ${fmtElem(e)}　〔${e.tag}／${e.fontSize}／${e.fontFamily}`
        + `${e.fontMono ? '（等宽）' : ''}〕`);
    }
    const repo = a.repo;
    if (repo) {
      console.log(`    · 仓库链接原文（${repo.text.length} 字符、元素 <${a.repoTag}>）：「${repo.text}」`);
      repo.lineRects.forEach((r, i) => console.log(
        `        第${i + 1}行　左沿 ${r.left}　右沿 ${r.right}　宽 ${r.width}`,
      ));
      console.log(`    ⇒ V=${vp.w}：**${repo.wraps ? `折成 ${repo.lineCount} 行` : '单行不折'}**，`
        + `墨迹 ${repo.minInkLeft} → ${repo.maxInkRight}（可用宽 ${r2(a.page.avail)}），${slackText(repo)}`);
      if (repo.overflowsAvail) {
        finding('关于页', `仓库链接墨迹越出可用宽 ${repo.overflowPx}px`,
          `URL「${repo.text}」(${repo.text.length} 字符) 右沿 ${repo.maxInkRight} > 可用宽 ${r2(a.page.avail)}（V=${vp.w}）`);
      }
    }
    console.log('    · 合成 URL 探针（同样式 .about-repo 的临时节点，量完即移除）：');
    for (const u of a.urlProbe) {
      console.log(`        ${u.chars} 字符${u.chars === (repo ? repo.text.length : -1) ? '（＝真实那条）' : ''}：`
        + `${u.wraps ? `折 ${u.lineCount} 行` : '单行'}，最长行 ${u.maxLineWidth}，${slackText(u)}`);
    }
    for (const e of [a.appValue, a.contentValue]) {
      if (e && e.overflowsAvail) {
        finding('关于页', `版本值墨迹越出可用宽 ${e.overflowPx}px`, `${e.name} 右沿 ${e.maxInkRight}（V=${vp.w}）`);
      }
    }

    // ---- 详情页元素级 ----
    console.log('  详情页：');
    console.log(`    · 正文：${d.lineCount} 行，最长行 ${d.maxLineWidth}（可用宽 ${r2(d.page.avail)}）`
      + `，墨迹左最小 ${d.minInkLeft}，右最大 ${d.maxInkRight}，越界行 ${d.overLines}`);
    console.log(`    · 最长行：${d.longest
      ? `左 ${d.longest.left} 右 ${d.longest.right} 宽 ${d.longest.width}（${d.longest.block}）` : '（无）'}`);
    console.log(`    · 诗题　${fmtElem(d.title)}`);
    console.log(`    · 底本与来源　${fmtElem(d.source)}`);
    for (const b of d.blocks) {
      console.log(`      - ${b.tag}.${b.cls} ${b.lineCount}行 最长${b.maxLineWidth} 左${b.minLeft} 右${b.maxRight}`
        + `　「${b.text}…」`);
    }
    console.log('    · 合成块样式探针（真实正文只有 ### 与 - 两种块；段落/引用/有序列表临时造，量完即移除）：');
    for (const b of d.blockProbe) {
      console.log(`        ${b.kind.padEnd(38)} ${b.lineCount}行 最长${b.maxLineWidth} 左${b.minInkLeft}`
        + ` 右${b.maxInkRight}　${slackText(b)}`);
    }
    console.log('    · 逐视觉行（左沿／右沿／宽）：');
    let n = 0;
    for (const b of d.blocks) {
      for (const r of b.lineRects) {
        n += 1;
        console.log(`        L${String(n).padStart(2, '0')} 左 ${String(r.left).padStart(8)}`
          + ` 右 ${String(r.right).padStart(8)} 宽 ${String(r.width).padStart(8)}  [${b.tag}]`);
      }
    }
    for (const b of d.blockProbe) {
      if (b.overflowsAvail) {
        finding('详情页/块探针', `${b.kind} 越出可用宽 ${b.overflowPx}px`,
          `右沿 ${b.maxInkRight} > 可用宽 ${r2(d.page.avail)}（V=${vp.w}）`);
      }
    }
    if (d.overLines) {
      finding('详情页', `正文有 ${d.overLines} 行墨迹越出可用宽`,
        `最大右沿 ${d.maxInkRight} > 可用宽 ${r2(d.page.avail)}（V=${vp.w}）`);
    }
    if (d.source && d.source.overflowsAvail) {
      finding('详情页', `底本与来源墨迹越出可用宽 ${d.source.overflowPx}px`,
        `右沿 ${d.source.maxInkRight} > 可用宽 ${r2(d.page.avail)}（V=${vp.w}）`);
    }

    aboutRows.push({ vp, a });
    detailRows.push({ vp, d });
  }

  // ------------------------------------------------------------------ 汇总表（md 可直接粘）
  section('汇总：逐视口数字表');
  const cand = (vp) => chosenC(vp.w);
  const gut = (vp) => r2((vp.w - cand(vp)) / 2);

  /** 一档视口里「最接近可用宽」的那个元素／行：这是「最容易顶边」的直接指标。 */
  const tightest = (a, d) => {
    const cands = [];
    const pick = (name, e) => { if (e && e.slackPx !== null && e.slackPx !== undefined) cands.push([name, e.slackPx]); };
    pick('关于页·仓库URL', a.repo);
    pick('关于页·应用版本值', a.appValue);
    pick('关于页·内容版本值', a.contentValue);
    pick('详情页·底本与来源', d.source);
    for (const b of d.blocks) {
      for (const r of b.lineRects) cands.push([`详情正文 ${b.tag}`, r2(d.page.avail - r.right)]);
    }
    for (const b of d.blockProbe) pick(`块探针 ${b.kind}`, b);
    if (!cands.length) return { name: '—', slack: null };
    const [name, slack] = cands.reduce((x, y) => (y[1] < x[1] ? y : x));
    return { name, slack };
  };

  const mdA = ['| V | A=V−24 | 0.88×A | C(公式) | 关于页 C(实测) | 详情页 C(实测) | Δ(关于／详情，4 位小数) | 列外余白(左右各) '
    + '| 正文可用宽 | 关于页 scrollWidth | 详情页 scrollWidth | innerWidth | 横向溢出 | 最紧余量（元素） |'];
  mdA.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const { vp, a } of aboutRows) {
    const d = detailRows.find((x) => x.vp.key === vp.key).d;
    const ov = a.page.overflow || d.page.overflow;
    const t = tightest(a, d);
    mdA.push(`| **${vp.w}** | ${vp.w - 24} | ${r2(0.88 * (vp.w - 24))} | ${r2(cand(vp))} | ${a.page.colWidth} | ${d.page.colWidth}`
      + ` | ${r4(a.page.colWidthRaw - cand(vp))}／${r4(d.page.colWidthRaw - cand(vp))} | ${gut(vp)} | ${r2(cand(vp) - EDGE_X * 2)}`
      + ` | ${a.page.docScrollWidth} | ${d.page.docScrollWidth} | ${vp.w}`
      + ` | ${ov ? `**是（${a.page.overflow ? `关于页 ${a.page.overflowPx}px` : ''}`
        + `${a.page.overflow && d.page.overflow ? '；' : ''}${d.page.overflow ? `详情页 ${d.page.overflowPx}px` : ''}）**` : '否'}`
      + ` | ${t.slack === null ? '—' : `${t.slack}px（${t.name}）`} |`);
  }
  console.log('\n【表 A｜列宽口径与页面横向溢出】');
  for (const line of mdA) console.log(line);

  const mdB = ['| V | 仓库URL（字符数／墨迹最长行／折行／顶边余量） | URL 行1 左→右 | URL 行2 左→右 '
    + '| 应用版本值右沿 | 内容版本值右沿 |'];
  mdB.push('| --- | --- | --- | --- | --- | --- |');
  for (const { vp, a } of aboutRows) {
    const repo = a.repo;
    const cell = repo
      ? `${repo.text.length}／${repo.maxLineWidth}／${repo.wraps ? `折 ${repo.lineCount} 行` : '单行'}`
        + `／${repo.overflowsAvail ? `**超出 ${repo.overflowPx}**` : `${repo.slackPx}px`}`
      : '（未找到）';
    const l1 = repo && repo.lineRects[0] ? `${repo.lineRects[0].left}→${repo.lineRects[0].right}` : '—';
    const l2 = repo && repo.lineRects[1] ? `${repo.lineRects[1].left}→${repo.lineRects[1].right}` : '—';
    mdB.push(`| ${vp.w} | ${cell} | ${l1} | ${l2} | ${a.appValue ? a.appValue.maxInkRight : '—'}`
      + ` | ${a.contentValue ? a.contentValue.maxInkRight : '—'} |`);
  }
  console.log('\n【表 B｜关于页元素级（相对内容左沿；容器内沿＝0，可用宽右沿＝C−33.6）】');
  for (const line of mdB) console.log(line);

  const mdC = ['| V | 正文行数 | 最长行宽 | 最长行(左→右) | 墨迹左最小 | 墨迹右最大 | 越界行数 | 小标题(行／最长) '
    + '| 列表项(行／最长) | 段落(行／最长) | 引用(行／最长) | 有序列表(行／最长) |'];
  mdC.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const { vp, d } of detailRows) {
    const byTag = (t) => {
      const bs = d.blocks.filter((b) => b.tag === t);
      const lines = bs.reduce((s, b) => s + b.lineCount, 0);
      const max = bs.length ? Math.max(...bs.map((b) => b.maxLineWidth)) : null;
      return lines ? `${lines}／${max}` : '0／—';
    };
    const probe = (kind) => {
      const b = d.blockProbe.find((x) => x.kind.startsWith(kind));
      return b ? `${b.lineCount}／${b.maxLineWidth}` : '—';
    };
    mdC.push(`| ${vp.w} | ${d.lineCount} | ${d.maxLineWidth}`
      + ` | ${d.longest ? `${d.longest.left}→${d.longest.right}` : '—'} | ${d.minInkLeft} | ${d.maxInkRight}`
      + ` | ${d.overLines} | ${byTag('H3')} | ${byTag('LI')} | ${byTag('P')}`
      + ` | ${probe('引用')} | ${probe('有序')} |`);
  }
  console.log('\n【表 C｜详情页正文（最小 Markdown 块样式；段落/引用/有序列表来自合成探针——真实正文只有 ### 与 - ）】');
  for (const line of mdC) console.log(line);

  console.log('\n【表 D｜详情正文逐视觉行（关键档视口）】');
  for (const { vp, d } of detailRows.filter((x) => LINE_DETAIL_KEYS.includes(x.vp.key))) {
    console.log(`\nV=${vp.w}（可用宽 ${r2(d.page.avail)}；行数 ${d.lineCount}；最长行 ${d.maxLineWidth}）`);
    console.log('| # | 块 | 左沿 | 右沿 | 宽 | 余量 |');
    console.log('| --- | --- | --- | --- | --- | --- |');
    let n = 0;
    for (const b of d.blocks) {
      for (const r of b.lineRects) {
        n += 1;
        console.log(`| L${n} | ${b.tag}${b.tag === 'H3' ? '（小标题）' : ''} | ${r.left} | ${r.right} | ${r.width}`
          + ` | ${r2(d.page.avail - r.right)} |`);
      }
    }
  }

  console.log('\n【表 E｜关于页合成 URL 探针（等宽；同样式 .about-repo 的临时节点）】');
  console.log('| V | 字符数 | 行数 | 最长行 | 是否越出可用宽 |');
  console.log('| --- | --- | --- | --- | --- |');
  for (const { vp, a } of aboutRows) {
    for (const u of a.urlProbe) {
      console.log(`| ${vp.w} | ${u.chars} | ${u.lineCount} | ${u.maxLineWidth}`
        + ` | ${u.overflowsAvail ? `**是（超出 ${u.overflowPx}）**` : `否（余量 ${u.slackPx}）`} |`);
    }
  }

  // ---- 汇总 ----
  const failed = results.filter((r) => !r.ok);
  console.log('\n================ 汇总 ================');
  console.log(`口径/测量断言：${results.length - failed.length} / ${results.length} 通过`);
  if (failed.length) {
    console.log('失败项：');
    for (const f of failed) console.log(`  ✗ ${f.name}\n      ${f.detail}`);
  }
  console.log(`观察项 FINDING：${findings.length} 条（**只报不改**：默认不计入 exit code`
    + `${strict ? '；本轮 --strict 已计入' : '；加 --strict 可计入'}）`);
  for (const f of findings) console.log(`  · [${f.scene}] ${f.what} —— ${f.detail}`);
  if (pageErrors.length) console.log(`页面报错：${pageErrors.length} 条\n  ${pageErrors.join('\n  ')}`);
  if (shots.length) console.log(`截图（全页、DPR2）：${shots.join(' / ')}`);
  console.log(`基线 SHA：${sha}（分支 ${branch}）`);

  return strict ? failed.length + findings.length : failed.length;
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
  .then((code) => { process.exitCode = code ? 1 : 0; })
  .catch((err) => {
    console.error(`\n✗ 脚本自身失败：${err.stack || err.message}`);
    process.exitCode = 1;
  })
  .finally(cleanup);
