/*
 * check-width-pct.mjs —— 跨页宽度「**已选口径**」讨论原型的【页面行为 ＋ 公式复算】自证脚本（可复跑）。
 *
 * 已选口径（用户 2026-10-15，采纳锚＝上一轮的 P2）：
 *     基准 A = V − 24（V＝视口宽）· 88% · 下限 320px（角色＝**最小内容宽**）
 *     C = min(V, max(320, 0.88 × (V − 24)))          上界＝**视口宽 V**，不夹 660／860 上限
 * 两处硬纠正（本脚本逐条断言，防止被"顺手解释"回去）：
 *     ① **24 是「一次性从视口宽扣掉的总量」**，只用来得到基准 A；**不是**「左右各 12px 的外层页边」。
 *        ⇒ 机器可查的形式：页面里**没有** .guide.av 这种对称黄线、**没有** --pad-outer 这个变量；
 *          并且 V=320 时 C=320（> A=296）—— 若真按两侧各 12px 实现，C 永远 ≤ 296，不可能等于 320。
 *     ② 上界＝V：C ≤ V，且 V=834 时 C=712.8 > 660、V=1180 时 C=1017.28 > 860 ⇒ 证明**没有**上限被夹。
 *
 * ⚠ 它验的是**这一个原型页面**的页面行为**与那一族公式**，**不是产品代码**：
 *   对象只有本目录下的 q-width-pct.html（**只读打开**：Page.navigate 到 file:// URL，脚本不写、不改它）。
 *   额外读的文件只有两个，都是**只读**：
 *     ① prototype/css/theme-tech.css          —— 用来逐项比对页面内嵌的令牌快照；
 *     ② content/poems/gushi-shijiu-shou-01.md —— 用它的正文 8 行做「原文逐行一致」的基准。
 *
 * 覆盖的视口（**每个视口都单独跑一遍全部断言，并各出一张 PNG**）：
 *   320×568 ／360×932 ／390×844 ／412×915 ／430×932（手机，mobile=true）
 *   834×1112（平板）／1180×900（桌面）（mobile=false）／740×360（横屏，mobile=true）
 *   ⚠ 图是**一个视口一张**（真实 CSS px @DPR 2）；**没有**把不同宽度拼成缩放对照图。
 *   ⚠ 图里只有**已选口径**这一块；未被选的三块在页面的「背景对照」区，**不进图**（本脚本断言这件事）。
 *
 * 断言清单（失败任一即 exit 1）：
 *  [G] 全局（只跑一次）：令牌快照逐项比对（值不一致数必须 0）、快照里没有「声明了却没用」的令牌、
 *      页面里每个 var() 都有声明、记录了快照来源短 sha ＋「权威仍是 docs/design/visual-tokens.md」、
 *      页面写明了八个覆盖视口与已选公式原文、参数表可解析（deduct=24 / pct=88 / floor=320 / cap=viewport）、
 *      两处硬纠正都在页面上写明（24 是总量、上界＝V、不夹 660／860）、
 *      诗页「全部居中」已定且旧口径（未定／三块同一竖线）不再出现、未采纳与未决事项逐条写明、
 *      自包含（非 file:// 请求 0 个／无 <link / src= / @import / http(s)://）、无 JS 报错。
 *  [A] **24 不是两侧各 12**（机器可查）：页面里 .guide.av 元素数 = 0、--pad-outer 计算值为空串、
 *      V=320 时内容宽 C=320 > A=296（贴到视口边、列外余白 0）。这三条一起把它钉死。
 *  [1] 结构：1 块「已选」＋ 3 块「未被选」（都在 DOM 里）；每块含 目录页 ＋ 诗页；
 *      目录页有「关于」1 个、组头 1 个、19＋1 行；诗页有 返回 1 个、详情 1 个、题名 1 个、身份行 1 个、
 *      原文恰好 **8 行**且**逐行与源文件逐字相同**；反向：可见文本里不出现 搜索／笔记标记／版本号／应用名／底名／来源／异文。
 *  [2] 每个视口：innerWidth／innerHeight 精确等于目标；docW === bodyW === 目标宽；所有可见元素在 0…目标宽 内。
 *  [C] **已选口径主视图（每个视口）**：逐项 —— V ｜ A＝V−24 ｜ 0.88×A ｜ max(320, 0.88×A) ｜ C ｜ 列外余白 (V−C)/2 ｜
 *      命中项（下限／百分比）｜ 内边距照旧（行内沿 16.8、正文可用宽＝C−33.6）；
 *      **实测 C ＝ 脚本独立复算的公式值**（两页都比，±0.01px，并把差打印）；页面自报的拆解项与脚本独立算的一致；
 *      C ≤ V（上界＝视口 V）；V=834 时 C > 660、V=1180 时 C > 860（**没有**上限被夹）。
 *  [B] **未被选的三块**：公式复算与实测一致（照旧逐档）；每块都有 data-chosen=0 ＋ 文字里的「未被选」；
 *      并且它们在 [data-shotframe] **之外**（不进图）。
 *  [8] 已定的目录页关系在**每个视口每一块**都成立（展开后逐行实测）：记号左沿＝列左沿、缝＝0.4rem、
 *      记号与组名首字竖直居中、题名左沿＝组名左沿（缩进 0）、作者紧随题名不右对齐、「关于」右沿＝列右沿−行内沿。
 *  [9] 已定的诗页关系在**每个视口每一块**都成立：**诗页「全部居中」** —— 题名文字盒中心、身份行文字盒中心
 *      ≈ 内容列中心（≤2px），且**正文每一个行盒**（含折行后的第二个）中心 ≤1px；
 *      反向断言旧的「三块同一竖线（全平齐）」**已不成立**（比的是**文字盒**左沿，不是满宽 block 的元素左沿）；
 *      题名→身份 0.7rem、身份→原文 2.1rem（不随宽度变）；**顶部行不参与居中**（返回左沿＝列左沿＋行内沿、
 *      详情右沿＝列右沿−行内沿）；诗页内**没有**页脚行。
 *  [10] **字号不随宽度缩放**：8 个视口下，题名／身份行／正文／诗题／作者／组名／计数／记号／关于／控件 的
 *      字号·行高·字距 **完全一致**（每个都只有 1 个取值）。
 *  [11] **正文行长**：8 行都在、逐行与源文件相同、每行都放得进「内容宽 − 2×行内沿」；
 *      **是否折行 ⟺ 正文可用宽 &lt; 最长一行（213.19px）**——逐档把「宽度 ⇒ 阅读后果」钉成可复算的关系；
 *      每档的**行盒数**（8 行 ⇒ 8 或 16 个行盒）一并打印（居中下断点的表现），
 *      ⚠ 但**折行行为本身尚未被采纳为规格**，本脚本只把它当事实打印，不当作已定行为。
 *  [12] 页面自报数字 ＝ 脚本独立实测（±0.6px）；并断言自报数字标明了来源（data-m-src=dom）。
 *  [13] 目录页交互（真鼠标）：首态**全部收起** ⇒ 点组头展开（20 行）⇒ 再点收起；
 *      **展开之后重查一次「无横向溢出」**，并重查已选口径的内容宽没被展开改变。
 *  [15] 看图态（#shot）：① 首态仍是**全收起**；② **不改变任何排布规则**；③ 每块目录页只显示前 3 行 ＋ 1 条说明条。
 *  [16] PNG：每个视口一张；像素宽 ＝ 视口宽 × 2、像素高 ＝ 截图区 CSS 高 × 2（自己解析 PNG 头读 IHDR）；文件非空。
 *  [17] **边界自证**：`CHROME_BIN` 指到一个不存在的路径时，本脚本必须**如实报错并 exit 2**，
 *      **不能**打印出「失败断言数：0」—— 用 `--selftest-chrome` 真的跑一次子进程来证明（见 main 之前那段）。
 *
 * 怎么跑（在仓库根或任意目录都行）：
 *   node items/app-ui/prototypes/check-width-pct.mjs
 *   node items/app-ui/prototypes/check-width-pct.mjs --no-shot             # 只跑断言，不重出 PNG
 *   node items/app-ui/prototypes/check-width-pct.mjs --only=320            # 只跑某一个视口（排查用）
 *   node items/app-ui/prototypes/check-width-pct.mjs --selftest-chrome     # 只跑「CHROME_BIN 指错 ⇒ 如实报错」这条边界
 *
 * 需要什么：
 *   - Node（用到内置的 fetch / WebSocket / net，故需较新的 Node；本机实测 v25.9.0 通过）；
 *   - **本机无头 Chromium**。顺序：环境变量 `CHROME_BIN` → 否则按 `%LOCALAPPDATA%\Chromium\Application\chrome.exe` 推。
 *     找不到就**如实报错并 exit 2**（`CHROME_BIN` 指到错路径也走这一条，不会假装通过）。
 *   - **不需要**任何 npm 依赖：不装包、不联网、不起静态服务（直接开 file://）。
 *   - **端口**：CDP 调试端口**先向内核要一个空闲端口**（net 监听 0 再关掉），**不写死**。
 *   - **仓库根**：从脚本所在目录**向上查找 prototype/css/theme-tech.css** 来定位，**不写死层级**。
 *
 * 副作用：临时目录建一个 Chromium profile 并删掉；默认重写本目录 8 张 PNG（复跑可能让 PNG 变脏，正常现象）；
 *         q-width-pct.html 本身**只读打开**，不写、不改。
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const OUT = dirname(fileURLToPath(import.meta.url));       // 本脚本所在目录＝原型目录
const ROOT = (() => {
  // 从脚本所在目录**向上查找** prototype/css/theme-tech.css；不写死层级（整轮搬进 history/ 也不会指错）。
  let d = OUT;
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(d, 'prototype', 'css', 'theme-tech.css'))) return d;
    d = dirname(d);
  }
  throw new Error('找不到仓库根：从 ' + OUT + ' 向上查找 prototype/css/theme-tech.css 失败');
})();

/* ── [17] 边界自证：CHROME_BIN 指到不存在的路径 ⇒ 如实报错退出，不假装通过 ── */
if (process.argv.includes('--selftest-chrome')) {
  const bogus = 'C:/definitely/not/here/chrome.exe';
  const self = fileURLToPath(import.meta.url);
  const r = spawnSync(process.execPath, [self, '--no-shot'], {
    cwd: OUT, encoding: 'utf8', timeout: 120000,
    env: { ...process.env, CHROME_BIN: bogus },
  });
  const out = r.stdout || '', err = r.stderr || '';
  const saidReason = /找不到无头 Chromium/.test(err) && err.includes(bogus);
  const notFakePass = out.indexOf('失败断言数：0') < 0;
  console.log('【边界自证】CHROME_BIN = ' + bogus + '（该路径不存在）');
  console.log('  退出码：' + r.status + '（要求 ≠ 0，这里是 2 表示环境缺失）');
  console.log('  stderr 说了原因：' + (saidReason ? '是' : '否') + ' → ' + JSON.stringify(err.trim().split(/\r?\n/)[0] || ''));
  console.log('  stdout 里没有「失败断言数：0」（不假装通过）：' + (notFakePass ? '是' : '否'));
  console.log('  完整 stderr：');
  err.trim().split(/\r?\n/).forEach((l) => console.log('    ' + l));
  const ok = r.status === 2 && saidReason && notFakePass;
  console.log(`\n===== 边界自证：${ok ? '通过' : '失败'} =====`);
  process.exit(ok ? 0 : 1);
}

const SHOT = !process.argv.includes('--no-shot');
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const ONLY = onlyArg ? onlyArg.slice(7) : null;

/* 覆盖的视口 */
const CASES = [
  { key: '320', w: 320, h: 568, mobile: true, label: '手机 · 最小可用宽（列外余白在这个宽度上会是 0）' },
  { key: '360', w: 360, h: 932, mobile: true, label: '手机 · 窄屏' },
  { key: '390', w: 390, h: 844, mobile: true, label: '手机' },
  { key: '412', w: 412, h: 915, mobile: true, label: '手机' },
  { key: '430', w: 430, h: 932, mobile: true, label: '手机（前几轮的验收宽）' },
  { key: '834', w: 834, h: 1112, mobile: false, label: '平板（C 在这里会超过 660 ⇒ 证明没有上限被夹）' },
  { key: '1180', w: 1180, h: 900, mobile: false, label: '桌面（C 在这里会超过 860 ⇒ 同上）' },
  { key: '740x360', w: 740, h: 360, mobile: true, label: '横屏（矮而宽）' },
];
const MD_PATH = join(ROOT, 'content', 'poems', 'gushi-shijiu-shou-01.md');
const HTML_PATH = join(OUT, 'q-width-pct.html');

/* ── 找 Chromium：CHROME_BIN 优先，否则 %LOCALAPPDATA%\Chromium\Application\chrome.exe */
const CHROME = process.env.CHROME_BIN
  || join(process.env.LOCALAPPDATA || '', 'Chromium', 'Application', 'chrome.exe');
if (!CHROME || !existsSync(CHROME)) {
  console.error('找不到无头 Chromium：' + (CHROME || '(未设置)'));
  console.error('请用环境变量指定，例如：');
  console.error("  CHROME_BIN='C:/Users/wsqsy/AppData/Local/Chromium/Application/chrome.exe' \\");
  console.error('    node items/app-ui/prototypes/check-width-pct.mjs');
  console.error('（这就是 [17] 那条边界：CHROME_BIN 指到不存在的路径时，本脚本在这里如实退出，不假装通过。）');
  process.exit(2);
}

/* ── 源文件基准（只读）：正文 8 行 ───────────────────────────────── */
const mdText = readFileSync(MD_PATH, 'utf8');
const mdLines = mdText.split(/\r?\n/);
let sepCount = 0, bodyStart = -1;
for (let i = 0; i < mdLines.length; i += 1) {
  if (mdLines[i].trim() === '---') { sepCount += 1; if (sepCount === 2) { bodyStart = i + 1; break; } }
}
if (bodyStart < 0) { console.error('源文件里找不到 front matter 结束标记：' + MD_PATH); process.exit(2); }
const mdStanzas = [];
{
  let cur = [];
  for (const raw of mdLines.slice(bodyStart)) {
    const t = raw.trim();
    if (t === '') { if (cur.length) { mdStanzas.push(cur); cur = []; } } else cur.push(t);
  }
  if (cur.length) mdStanzas.push(cur);
}
const mdFlat = mdStanzas.flat();
if (mdFlat.length !== 8) {
  console.error('源文件正文不是 8 行（而是 ' + mdFlat.length + ' 行）⇒ 本轮口径向变了，先看需求再改断言：' + MD_PATH);
  process.exit(2);
}

/* ── 页面文本 ＋ 参数表 ─────────────────────────────────────────── */
const htmlText = readFileSync(HTML_PATH, 'utf8');
function declarationBlock(text, begin, end) {
  const a = text.indexOf(begin), b = text.indexOf(end);
  if (a < 0 || b < 0 || b < a) return null;
  return text.slice(a, b);
}
function parseTokens(cssText) {
  const m = new Map();
  const clean = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /(--[A-Za-z0-9_-]+)\s*:\s*([^;]+);/g;
  let x;
  while ((x = re.exec(clean))) m.set(x[1], x[2].replace(/\s+/g, ' ').trim());
  return m;
}
/* 已选口径的参数：从页面里那段带标记的注释解析（**参数**由页面声明；**公式**由本脚本独立实现）。 */
const chosenBlock = declarationBlock(htmlText, '== CHOSEN-BEGIN ==', '== CHOSEN-END ==');
if (!chosenBlock) { console.error('页面里找不到 == CHOSEN-BEGIN ==/== CHOSEN-END == 参数表'); process.exit(2); }
function chosenNum(key) {
  const m = new RegExp('\\*\\s*' + key + '\\s*:\\s*(-?[0-9.]+)').exec(chosenBlock);
  return m ? Number(m[1]) : NaN;
}
const CHOSEN = {
  formula: (/\*\s*formula\s*:\s*([^\n]+)/.exec(chosenBlock) || [, ''])[1].trim(),
  deduct: chosenNum('deduct_total'),
  pct: chosenNum('pct'),
  floor: chosenNum('floor'),
  capIsViewport: /\*\s*cap\s*:\s*viewport/.test(chosenBlock),
};
/* 未被选的三块：只作背景对照 */
const contrastBlock = declarationBlock(htmlText, '== CONTRAST-BEGIN ==', '== CONTRAST-END ==');
if (!contrastBlock) { console.error('页面里找不到 == CONTRAST-BEGIN ==/== CONTRAST-END == 对照表'); process.exit(2); }
const CONTRAST = [];
for (const line of contrastBlock.split(/\r?\n/)) {
  const m = /^\s*\*?\s*(C\d+)\s+base=(\w+)\s+pct=(\d+)\s+role=(\w+)\s+floor=(\d+)/.exec(line);
  if (m) CONTRAST.push({ id: m[1], chosen: false, base: m[2], pct: Number(m[3]), role: m[4], floor: Number(m[5]) });
}
const ALL = [{ id: 'CHOSEN', chosen: true }].concat(CONTRAST);
const ORDER = ALL.map((t) => t.id);
const TIER = Object.fromEntries(ALL.map((t) => [t.id, t]));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function freePort() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}
let failures = 0;
const log = (...a) => console.log(...a);
function check(label, ok, detail) {
  log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : '  →  ' + detail}`);
  if (!ok) failures += 1;
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;
const uniq = (a) => Array.from(new Set(a));
function pngSize(buf) { return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }; }

/* ── 公式（脚本这一侧的**独立**实现）─────────────────────────────
 * 【已选】A = V − DEDUCT；C = min(V, max(FLOOR, PCT% × A))；上界＝视口 V。
 * 【对照】base=avail ⇒ 基准 A；base=viewport ⇒ 基准 V；
 *         role=content ⇒ 下界＝floor、上界＝V；role=gutter ⇒ 下界＝0、上界＝V−2×floor。
 */
const DEDUCT = CHOSEN.deduct, PCT = CHOSEN.pct, FLOOR = CHOSEN.floor;
function chosenA(V) { return V - DEDUCT; }
function chosenRaw(V) { return PCT / 100 * chosenA(V); }
function chosenC(V) { return Math.min(V, Math.max(FLOOR, chosenRaw(V))); }
function chosenHit(V) {
  if (FLOOR > V) return 'cap';
  if (FLOOR > chosenRaw(V)) return 'floor';
  return 'pct';
}
function chosenSteps(V) {
  const A = chosenA(V), raw = chosenRaw(V), maxed = Math.max(FLOOR, raw);
  return { A, raw, maxed, C: Math.min(V, maxed), clampedByV: maxed > V, gut: (V - Math.min(V, maxed)) / 2 };
}
function baseW(t, V) { return t.base === 'viewport' ? V : V - DEDUCT; }
function pctW(t, V) { return t.pct / 100 * baseW(t, V); }
function loW(t) { return t.role === 'gutter' ? 0 : t.floor; }
function capW(t, V) { return t.role === 'gutter' ? V - 2 * t.floor : V; }
function cwOf(t, V) { return Math.min(Math.max(pctW(t, V), loW(t)), capW(t, V)); }
function hitOf(t, V) {
  const raw = pctW(t, V), lo = loW(t), cap = capW(t, V);
  if (lo > cap) return 'cap';
  if (raw > cap) return t.role === 'gutter' ? 'gutter' : 'cap';
  if (lo > raw) return 'floor';
  return 'pct';
}
function cwFor(t, V) { return t.chosen ? chosenC(V) : cwOf(t, V); }
function hitFor(t, V) { return t.chosen ? chosenHit(V) : hitOf(t, V); }
const HIT_NAME = { pct: '百分比', floor: '下限', gutter: '最小页边', cap: '视口封顶' };

/* 页面侧量测：一次性把所有需要的几何取回来（脚本自己的实现，不依赖页面的自报数字） */
const MEASURE = `(function(){
  var R = function(e){ var r = e.getBoundingClientRect(); return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height }; };
  var px = function(v){ return Math.round(v*100)/100; };
  var textW = function(e){ var rg = document.createRange(); rg.selectNodeContents(e); var rs = rg.getClientRects(), w = 0;
    for (var i=0;i<rs.length;i++) w = Math.max(w, rs[i].width); return px(w); };
  var cs = function(e, props){ var c = getComputedStyle(e), o = {}; props.forEach(function(p){ o[p] = c[p]; }); return o; };
  var demos = [];
  var ds = document.querySelectorAll('[data-test="demo"]');
  for (var i=0;i<ds.length;i++){
    var d = ds[i];
    var capEl = d.querySelector('[data-test="cap"]');
    var o = { block: d.dataset.block, chosen: d.dataset.chosen === '1',
      inShot: !!d.closest('[data-shotframe]'),
      headText: d.querySelector('[data-test="dhead"]').textContent,
      cap: {}, pages: [], hub: null, poem: null };
    ['mSrc','mW','mH','mAvailW','mBaseW','mPct','mCwFormula','mCwHub','mCwPoem','mDelta','mLo','mRaw','mCap','mHit','mFlushCap','mGut','mAvail','mCpl','mMaxLine','mWrapped','mFxLines','mNameX','mSeam','mMarkLeft','mAboutR','mTitleGap','mBodyGap','mFoot','mTopL','mTopR','mEdge','mColCenter','mTitleBoxCx','mIdentBoxCx','mLineMaxDev','mLineBoxCount','mStA','mStRaw','mStMax','mStC','mStHit','mStClamped'].forEach(function(k){ o.cap[k] = capEl.dataset[k]; });
    var pgs = d.querySelectorAll('[data-test="page"]');
    for (var p=0;p<pgs.length;p++){
      var pg = pgs[p];
      var col = pg.querySelector('[data-test="col"]');
      var cr = R(col), pr = R(pg);
      var gs = pg.querySelectorAll('[data-test="guide"]');
      var gcol = [], gav = 0;
      for (var q=0;q<gs.length;q++) { if (gs[q].dataset.kind === 'avail') gav += 1; else gcol.push(px(R(gs[q]).left)); }
      o.pages.push({ page: pg.dataset.page, colLeft: px(cr.left), colRight: px(cr.right), colW: px(cr.width),
        pageLeft: px(pr.left), pageW: px(pr.width), gCol: gcol, availGuides: gav });
    }
    var hub = d.querySelector('[data-page="hub"]');
    var hcol = hub.querySelector('[data-test="col"]');
    var hcr = R(hcol);
    var gname = hub.querySelector('[data-test="gname"]'), gmark = hub.querySelector('[data-test="gmark"]');
    var about = hub.querySelector('[data-test="about"]'), gcount = hub.querySelector('[data-test="gcount"]');
    var ghead = hub.querySelector('[data-test="ghead"]'), list = hub.querySelector('[data-test="glist"]');
    var gr = R(gname), mr = R(gmark), ar = R(about), gcr = R(gcount), hr = R(ghead);
    var rows = [];
    var rws = hub.querySelectorAll('[data-test="row"]');
    for (var k=0;k<rws.length;k++){
      var rw = rws[k];
      var pt = rw.querySelector('.ptitle'), pa = rw.querySelector('.pauthor');
      var plink = rw.querySelector('.plink');
      var vis = rw.getBoundingClientRect().height > 0;
      rows.push({ fx: rw.dataset.fx === '1', visible: vis,
        plinkPadLeft: parseFloat(getComputedStyle(plink).paddingLeft),
        plinkPadRight: parseFloat(getComputedStyle(plink).paddingRight),
        titleLeft: px(R(pt).left), titleMaxLineW: textW(pt),
        badgeLeft: rw.querySelector('.fxbadge') ? px(R(rw.querySelector('.fxbadge')).left) : null,
        titleLineBoxes: pt.getClientRects().length,
        authorLeft: px(R(pa).left), authorRight: px(R(pa).right) });
    }
    o.hub = { colLeft: px(hcr.left), colRight: px(hcr.right), colW: px(hcr.width),
      gnameLeft: px(gr.left), nameX: px(gr.left - hcr.left),
      markLeftRel: px(mr.left - hcr.left), gmarkW: px(mr.width), seam: px(gr.left - mr.right),
      gmarkCenter: px((mr.top + mr.bottom) / 2), gnameCenter: px((gr.top + gr.bottom) / 2),
      gheadH: px(hr.height), aboutRight: px(hcr.right - ar.right), gheadTop: px(hr.top),
      listHidden: list.hidden, gheadExpanded: ghead.getAttribute('aria-expanded'),
      gheadTag: ghead.tagName, gheadType: ghead.getAttribute('type'),
      markText: gmark.textContent, rows: rows,
      visibleRows: rows.filter(function(x){ return x.visible; }).length,
      font: { gname: cs(gname, ['fontSize','lineHeight','letterSpacing']),
              gmark: cs(gmark, ['fontSize','lineHeight','letterSpacing']),
              gcount: cs(gcount, ['fontSize','lineHeight','letterSpacing']),
              about: cs(about, ['fontSize','lineHeight','letterSpacing']),
              ptitle: cs(hub.querySelector('.ptitle'), ['fontSize','lineHeight','letterSpacing']),
              pauthor: cs(hub.querySelector('.pauthor'), ['fontSize','lineHeight','letterSpacing']) } };
    var poem = d.querySelector('[data-page="poem"]');
    var pcol = poem.querySelector('[data-test="col"]');
    var pcr = R(pcol);
    var back = poem.querySelector('[data-test="back"]'), detail = poem.querySelector('[data-test="detail"]');
    var title = poem.querySelector('[data-test="title"]'), ident = poem.querySelector('[data-test="ident"]');
    var body = poem.querySelector('[data-test="poem"]');
    var br = R(back), dr = R(detail), tr = R(title), ir = R(ident), bor = R(body);
    var lines = poem.querySelectorAll('[data-test="line"]');
    var ink = function(e){ var rg = document.createRange(); rg.selectNodeContents(e); var rs = rg.getClientRects();
      var l = 1e9, rr2 = -1e9, boxCx = [], boxW = [];
      for (var j=0;j<rs.length;j++){ l = Math.min(l, rs[j].left); rr2 = Math.max(rr2, rs[j].right);
        boxCx.push(px((rs[j].left + rs[j].right)/2)); boxW.push(px(rs[j].width)); }
      if (l > rr2) return { left:0, right:0, cx:0, w:0, boxes:0, boxCx:[], boxW:[] };
      return { left: px(l), right: px(rr2), cx: px((l+rr2)/2), w: px(rr2-l), boxes: rs.length, boxCx: boxCx, boxW: boxW }; };
    var ls = [];
    for (var w2=0;w2<lines.length;w2++){
      var rr = R(lines[w2]);
      ls.push({ text: lines[w2].textContent, w: textW(lines[w2]), left: px(rr.left), top: px(rr.top),
        bottom: px(rr.bottom), h: px(rr.height), inkBox: ink(lines[w2]) });
    }
    var bodyFont = cs(body, ['fontSize','lineHeight','letterSpacing','paddingTop','paddingLeft','paddingRight']);
    var colCx = pcr.left + pcr.width/2;
    o.poem = { colLeft: px(pcr.left), colRight: px(pcr.right), colW: px(pcr.width), colCenter: px(colCx),
      titleInk: ink(title), identInk: ink(ident),
      backLeft: px(br.left - pcr.left), detailRight: px(pcr.right - dr.right),
      backTop: px(br.top), detailTop: px(dr.top),
      titleLeft: px(tr.left - pcr.left), identLeft: px(ir.left - pcr.left),
      firstLineLeft: px(ls[0].left - pcr.left), firstLineTop: px(ls[0].top),
      lastLineBottom: px(ls[ls.length-1].bottom),
      titleGap: px(ir.top - tr.bottom),
      bodyGap: px(bor.top + parseFloat(bodyFont.paddingTop) - ir.bottom),
      footCount: poem.querySelectorAll('[data-test="foot"]').length,
      lines: ls, lineCount: ls.length,
      lineBoxCount: ls.reduce(function(a,l){ return a + l.inkBox.boxes; }, 0),
      lineCenterDevs: ls.reduce(function(a,l){ return a.concat(l.inkBox.boxCx.map(function(c){ return px(c - colCx); })); }, []),
      lineInkLeft: ls.reduce(function(a,l){ return Math.min(a, l.inkBox.left); }, 1e9),
      lineInkRight: ls.reduce(function(a,l){ return Math.max(a, l.inkBox.right); }, -1e9),
      titleDev: px(Math.abs(ink(title).cx - colCx)), identDev: px(Math.abs(ink(ident).cx - colCx)),
      wrappedLines: ls.filter(function(l){ return l.h > parseFloat(bodyFont.lineHeight) + 1; }).length,
      maxLine: Math.max.apply(null, ls.map(function(l){ return l.w; })),
      bodyFont: bodyFont,
      fonts: { title: cs(title, ['fontSize','lineHeight','letterSpacing']),
               ident: cs(ident, ['fontSize','lineHeight','letterSpacing']),
               ctl: cs(back, ['fontSize','lineHeight','letterSpacing']) } };
    demos.push(o);
  }
  var all = document.querySelectorAll('body *'), maxRight = -1e9, minLeft = 1e9, mrEl = '', mlEl = '';
  var name = function(e){ return e.tagName.toLowerCase() + ((typeof e.className === 'string' && e.className) ? '.' + e.className.trim().split(/\\s+/).join('.') : ''); };
  for (var z=0;z<all.length;z++){
    var r = all[z].getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.right > maxRight) { maxRight = r.right; mrEl = name(all[z]); }
    if (r.left < minLeft) { minLeft = r.left; mlEl = name(all[z]); }
  }
  var rootCS = getComputedStyle(document.documentElement);
  return JSON.stringify({ innerW: window.innerWidth, innerH: window.innerHeight,
    visualW: window.visualViewport ? window.visualViewport.width : null,
    docW: document.documentElement.scrollWidth, docH: document.documentElement.scrollHeight,
    bodyW: document.body.scrollWidth, maxRight: px(maxRight), maxRightEl: mrEl,
    minLeft: px(minLeft), minLeftEl: mlEl,
    padOuterVar: String(rootCS.getPropertyValue('--pad-outer')).trim(),
    avGuideCount: document.querySelectorAll('.guide.av').length,
    deductAttr: document.documentElement.dataset.deduct,
    pctAttr: document.documentElement.dataset.pct,
    floorAttr: document.documentElement.dataset.floor,
    blocksAttr: document.documentElement.dataset.blocks,
    shotDemos: document.querySelectorAll('[data-shotframe] [data-test="demo"]').length,
    shotChosenDemos: document.querySelectorAll('[data-shotframe] [data-test="demo"][data-chosen="1"]').length,
    outsideDemos: Array.prototype.filter.call(document.querySelectorAll('[data-test="demo"]'), function(e){ return !e.closest('[data-shotframe]'); }).length,
    bgsecDemos: document.querySelectorAll('.bgsec [data-test="demo"]').length,
    shot: document.documentElement.dataset.shot === '1',
    deck: (function(){ var e = document.querySelector('[data-shotframe]'); if (!e) return null;
      var r = e.getBoundingClientRect(); return { x: px(r.left), y: px(r.top + window.scrollY), w: px(r.width), h: px(r.height) }; })(),
    demos: demos });
})()`;

async function run() {
  const port = await freePort();
  const profile = mkdtempSync(join(tmpdir(), 'qwpc-'));
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--disable-background-networking',
    '--disable-component-update', '--disable-sync', '--remote-allow-origins=*',
    '--user-data-dir=' + profile, '--remote-debugging-port=' + port, 'about:blank',
  ], { stdio: 'ignore' });
  log(`CDP 端口（内核分配的空闲端口）：${port}`);
  log(`仓库根（从脚本目录向上查找 prototype/css/theme-tech.css）：${ROOT}`);
  log(`已解析的**已选口径**参数（来自页面里的 == CHOSEN-BEGIN == 块）：deduct=${DEDUCT} pct=${PCT}% floor=${FLOOR}px cap=${CHOSEN.capIsViewport ? 'viewport' : '(未知)'}`);
  log(`已解析的**未被选**对照块：${CONTRAST.map((t) => `${t.id}(${t.base}/${t.pct}%/${t.role}:${t.floor})`).join(' ') || '(无)'}`);

  try {
    for (let i = 0; i < 100; i += 1) {
      try { const r = await fetch(`http://127.0.0.1:${port}/json/version`); if (r.ok) break; } catch { /* 起得慢，继续等 */ }
      if (i === 99) throw new Error('Chromium 的 devtools 端口没起来');
      await sleep(150);
    }
    const tab = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true });
      ws.addEventListener('error', rej, { once: true });
    });
    let id = 0;
    const pending = new Map();
    const events = [];
    const requests = [];
    const pageErrors = [];
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) {
        const { res, rej } = pending.get(m.id);
        pending.delete(m.id);
        if (m.error) rej(new Error(JSON.stringify(m.error))); else res(m.result);
        return;
      }
      if (!m.method) return;
      events.push(m.method);
      if (m.method === 'Network.requestWillBeSent') requests.push(m.params.request.url);
      if (m.method === 'Runtime.exceptionThrown') {
        pageErrors.push('uncaught: ' + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text));
      }
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        pageErrors.push('console.error: ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
      }
      if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
        pageErrors.push('log: ' + m.params.entry.text);
      }
    });
    const send = (method, params = {}) => {
      const myId = ++id;
      ws.send(JSON.stringify({ id: myId, method, params }));
      return new Promise((res, rej) => pending.set(myId, { res, rej }));
    };
    const js = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('页面脚本出错：' + JSON.stringify(r.exceptionDetails));
      return r.result.value;
    };
    const measure = async () => JSON.parse(await js(MEASURE));
    async function clickAt(x, y) {
      const base = { x, y, button: 'left', buttons: 1, clickCount: 1 };
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...base });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base });
    }
    async function clickGhead(block) {
      const c = JSON.parse(await js(`(function(){
        var d = document.querySelector('[data-test="demo"][data-block="${block}"]');
        var e = d.querySelector('[data-test="ghead"]');
        e.scrollIntoView({ block: 'center' });
        var r = e.getBoundingClientRect();
        var x = (r.left + r.right) / 2, y = (r.top + r.bottom) / 2;
        var hit = document.elementFromPoint(x, y);
        return JSON.stringify({ x: Math.round(x*10)/10, y: Math.round(y*10)/10,
          hitIsE: hit ? (hit === e || e.contains(hit)) : false, hitTag: hit ? hit.tagName : '(无)',
          tag: e.tagName, type: e.getAttribute('type') });
      })()`));
      if (!c.hitIsE) return c;
      await clickAt(c.x, c.y);
      await sleep(120);
      return c;
    }
    async function load(url, w, h, mobile) {
      requests.length = 0; pageErrors.length = 0; events.length = 0;
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile });
      await send('Page.navigate', { url });
      for (let i = 0; i < 150 && !events.includes('Page.loadEventFired'); i += 1) await sleep(100);
      for (let i = 0; i < 40; i += 1) {
        const ready = await js(`document.documentElement.dataset.ready === '1'`);
        if (ready) break;
        await sleep(100);
      }
      await sleep(250);
    }

    await send('Runtime.enable'); await send('Log.enable');
    await send('Page.enable'); await send('Network.enable');

    const url = 'file:///' + HTML_PATH.replace(/\\/g, '/');
    const theme = readFileSync(join(ROOT, 'prototype', 'css', 'theme-tech.css'), 'utf8');
    const themeTokens = parseTokens(theme);
    let gitHead = '(git 不可用)';
    let themeClean = null;
    try {
      const a = spawnSync('git', ['-C', ROOT, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' });
      if (a.status === 0) gitHead = a.stdout.trim();
      const b = spawnSync('git', ['-C', ROOT, 'diff', '--quiet', 'HEAD', '--', 'prototype/css/theme-tech.css']);
      themeClean = b.status === 0;
    } catch { /* 不影响断言 */ }
    log(`原型页（只读打开）：${HTML_PATH}`);
    log(`源文件基准（只读）：${MD_PATH}  段数=${mdStanzas.length}  行数=${mdFlat.length}`);
    log(`当前 HEAD=${gitHead}；theme-tech.css 相对 HEAD ${themeClean === null ? '未知' : (themeClean ? '无改动' : '有未提交改动')}`);

    /* ═══ [G] 全局断言（只跑一次）══════════════════════════════════ */
    log('\n═══════════ [G] 全局：令牌快照 / 已选口径参数 / 两处硬纠正 / 自包含 / 页面里写明的口径 ═══════════');
    const snapText = declarationBlock(htmlText, '== TOKEN-SNAPSHOT-BEGIN ==', '== TOKEN-SNAPSHOT-END ==');
    const snap = snapText ? parseTokens(snapText) : new Map();
    const mismatches = [];
    for (const [k, v] of snap) {
      if (!themeTokens.has(k)) mismatches.push(`${k}: theme-tech.css 里没有这个令牌（快照值 ${v}）`);
      else if (themeTokens.get(k) !== v) mismatches.push(`${k}: 快照 ${v} ≠ theme-tech.css ${themeTokens.get(k)}`);
    }
    const usedVars = new Set((htmlText.match(/var\(--[A-Za-z0-9_-]+\)/g) || []).map((s) => s.slice(4, -1)));
    const declaredVars = new Set((htmlText.match(/(--[A-Za-z0-9_-]+)\s*:/g) || []).map((s) => s.replace(/\s*:$/, '')));
    const undeclared = [...usedVars].filter((k) => !declaredVars.has(k));
    const unusedSnap = [...snap.keys()].filter((k) => !usedVars.has(k));
    check(`令牌快照与 prototype/css/theme-tech.css 逐项比对：值不一致数 = ${mismatches.length}（要求 0）`,
      mismatches.length === 0,
      mismatches.length ? mismatches.join(' | ') : `${snap.size} 个令牌逐字一致（空白已归一化）`);
    check('快照里没有「声明了却没用」的令牌；页面里用到的每个 var() 都有声明',
      undeclared.length === 0 && unusedSnap.length === 0,
      `未声明=${JSON.stringify(undeclared)} 快照未用=${JSON.stringify(unusedSnap)}`);
    check('快照里**没有** --measure（660px），页面也没用到它 —— 「不夹 660／860 上限」的机器可查形式',
      !snap.has('--measure') && !usedVars.has('--measure'),
      `快照含 --measure？${snap.has('--measure')}；页面用到？${usedVars.has('--measure')}`);
    const shaRecorded = (htmlText.match(/仓库提交：([0-9a-f]{7,40})/) || [])[1] || '(没记录)';
    check('页面记录了令牌快照的来源提交（短 sha）＋写明「权威仍是 docs/design/visual-tokens.md」',
      /^[0-9a-f]{7,40}$/.test(shaRecorded) && htmlText.includes('权威仍是 docs/design/visual-tokens.md'),
      `记录=${shaRecorded}（当前 HEAD=${gitHead}）`);
    check('页面写明了八个覆盖视口（320/360/390/412/430/834/1180/740×360）',
      ['320', '360', '390', '412', '430', '834', '1180', '740×360'].every((s) => htmlText.includes(s)),
      '覆盖视口与图名在说明段落里写明');
    check('页面写明了**已选公式原文** C = min(V, max(320, 0.88 × (V − 24)))（与 == CHOSEN-BEGIN == 块一致）',
      htmlText.includes('C = min(V, max(320, 0.88 × (V − 24)))') && CHOSEN.formula.includes('min(V, max(320, 0.88 × (V − 24)))'),
      `块里记录：${CHOSEN.formula}`);
    check('== CHOSEN-BEGIN == 参数块可解析且就是已选口径：deduct_total=24 · pct=88 · floor=320（最小内容宽）· cap=viewport',
      CHOSEN.deduct === 24 && CHOSEN.pct === 88 && CHOSEN.floor === 320 && CHOSEN.capIsViewport,
      `deduct=${CHOSEN.deduct} pct=${CHOSEN.pct} floor=${CHOSEN.floor} cap=${CHOSEN.capIsViewport ? 'viewport' : '?'}`);
    check('页面把 **24 的一次性总量解释**写清楚（「不是左右各 12px 的外层页边」）',
      htmlText.includes('一次性从视口宽扣掉的总量') && htmlText.includes('不是') && htmlText.includes('左右各 12px'),
      '硬纠正 ① 写在说明段落与块内注释里');
    check('页面把 **上界＝视口 V（不夹 660／860 上限）** 写清楚',
      htmlText.includes('上界＝视口 V') && htmlText.includes('不夹') && htmlText.includes('660／860'),
      '硬纠正 ② 写明');
    check('页面写明了诗页「全部居中」**已定**（用户 2026-10-15），并且**不再**把「水平对齐未定／三块同一竖线全平齐」当成现行口径',
      htmlText.includes('全部居中') && htmlText.includes('2026-10-15') && htmlText.includes('已经不成立')
      && !htmlText.includes('尚未选定') && !htmlText.includes('不是一个已选项') && !htmlText.includes('本页诗页各块一律用'),
      '旧口径的原文在页面里已经不出现；旧基线被明确标为「已经不成立」');
    check('页面写明了**未被采纳／未决**四件事：长题名折行＋长诗行折行未采纳、笔记入口未定、关于页／详情页不含、实施授权不在本轮',
      htmlText.includes('尚未被采纳为规格') && htmlText.includes('第二行也居中') && htmlText.includes('断点落在字之间')
      && htmlText.includes('入口位置') && htmlText.includes('仍未定')
      && htmlText.includes('关于页／详情页的宽度表现不含在本轮')
      && htmlText.includes('完整页的实施授权不在本轮'),
      '四条都如实标注（不是已定）');
    check('页面写明了三块「未被选」的背景对照（且说明它们不进图）',
      htmlText.includes('未被选') && htmlText.includes('背景对照') && htmlText.includes('不进图'),
      '对照区在 .bgsec 里、每块带「未被选」标记');

    /* ═══ 逐视口 ═════════════════════════════════════════════════ */
    const fontBag = [];
    const rowsOut = [];
    const cases = ONLY ? CASES.filter((c) => c.key === ONLY) : CASES;
    if (!cases.length) throw new Error('--only= 没匹配到视口：' + ONLY);

    for (const C of cases) {
      const { w: W, h: H } = C;
      log(`\n═══════════════════════════════════════════════════════════════`);
      log(`═══ 视口 ${C.key}（${C.w}×${C.h}，${C.label}，mobile=${C.mobile}，DPR 2）═══`);
      log(`═══════════════════════════════════════════════════════════════`);
      await load(url, W, H, C.mobile);
      let M = await measure();

      // ---- [2] 真实 CSS px + 无横向溢出 ----
      log('\n[2] 真实 CSS px：innerWidth／scrollWidth 精确等于目标宽，无横向溢出');
      check(`innerWidth === ${W}，innerHeight === ${H}`,
        M.innerW === W && M.innerH === H, `实测 innerWidth=${M.innerW} innerHeight=${M.innerH}`);
      check('visualViewport.width 也 === 目标宽（⇒ Chrome **没有**触发 shrink-to-fit 把布局视口撞开；这条是「真实 CSS px」的前置条件）',
        M.visualW === W, `visualViewport.width=${M.visualW}（若 > 目标宽，说明有元素把内容撑宽了）`);
      check(`documentElement.scrollWidth === body.scrollWidth === ${W}（没有横向溢出）`,
        M.docW === W && M.bodyW === W, `docScrollWidth=${M.docW} bodyScrollWidth=${M.bodyW}`);
      check(`所有可见元素都在 0…${W} 之内`,
        M.maxRight <= W + 0.5 && M.minLeft >= -0.5,
        `maxRight=${M.maxRight}(${M.maxRightEl}) minLeft=${M.minLeft}(${M.minLeftEl})`);
      check('页面声明的已选参数（data-deduct/pct/floor）与 CHOSEN 块一致',
        M.deductAttr === String(CHOSEN.deduct) && M.pctAttr === String(CHOSEN.pct) && M.floorAttr === String(CHOSEN.floor)
        && M.blocksAttr === ORDER.join(','),
        `data-deduct=${M.deductAttr} pct=${M.pctAttr} floor=${M.floorAttr} blocks=${M.blocksAttr}`);

      // ---- [A] 24 不是两侧各 12 ----
      log('\n[A] 硬纠正 ①：24 是**一次性扣除的总量**，不是「左右各 12px 的外层页边」');
      {
        const chosen = M.demos.filter((d) => d.block === 'CHOSEN')[0];
        const A = chosenA(W), cw = chosenC(W);
        const avGuides = M.avGuideCount + M.demos.reduce((a, d) => a + d.pages.reduce((b, x) => b + x.availGuides, 0), 0);
        check('页面里**没有**「可用宽/外层页边」那种对称黄线：.guide.av 元素数 = 0', avGuides === 0, `实测 ${avGuides} 个`);
        check('页面里**没有** --pad-outer 这个变量（计算值为空串）⇒ 不再把 24 实现成两侧各 12',
          M.padOuterVar === '', `--pad-outer 计算值 = ${JSON.stringify(M.padOuterVar)}`);
        check('列外余白就是 (V−C)/2（本视口 = ' + r2((W - cw) / 2) + '）—— 不由任何固定页边决定',
          chosen.pages.every((x) => near(x.colLeft, (W - cw) / 2, 0.6) && near(W - x.colRight, (W - cw) / 2, 0.6)),
          `${chosen.pages[0].colLeft} ＋ ${r2(W - chosen.pages[0].colRight)}`);
        if (W === 320) {
          check('V=320（最小视口）时内容宽 C ＝ 320 **大于** A ＝ 296 ⇒ 内容列贴到视口边、列外余白 0（若真按两侧各 12px 实现，C 不可能超过 296）',
            near(cw, 320, 0.02) && near(A, 296, 0.02) && chosen.pages.every((x) => near(x.colLeft, 0, 0.6) && near(x.colW, 320, 0.6)),
            `C=${r2(cw)} A=${A} 列外余白=${chosen.pages[0].colLeft}／${r2(W - chosen.pages[0].colRight)}`);
        } else {
          log(`      （本视口 C=${r2(cw)}，A=${r2(A)}：C ${cw > A ? '>' : '≤'} A —— 「贴到视口边」这种极端只发生在 320）`);
        }
      }

      // ---- [C] 已选口径主视图 ----
      log('\n[C] 已选口径主视图（逐项）：V ｜ A＝V−24 ｜ 0.88×A ｜ max(320, 0.88×A) ｜ C ｜ 列外余白 (V−C)/2 ｜ 命中项 ｜ 内边距');
      {
        const st = chosenSteps(W);
        const d = M.demos.filter((x) => x.block === 'CHOSEN')[0];
        const hubPg = d.pages.find((x) => x.page === 'hub'), poemPg = d.pages.find((x) => x.page === 'poem');
        const c = d.cap;
        const edge = parseFloat(d.poem.bodyFont.paddingLeft);
        const dHub = r2(hubPg.colW - st.C), dPoem = r2(poemPg.colW - st.C);
        log(`      V=${W}　A＝V−24=${r2(st.A)}　0.88×A=${r2(st.raw)}　max(320, 0.88×A)=${r2(st.maxed)}　⇒ C=${r2(st.C)}　列外余白 (V−C)/2=${r2(st.gut)} ＋ ${r2(st.gut)}`);
        log(`      命中项：${HIT_NAME[chosenHit(W)]}　上界＝视口 V：C ≤ V ${st.C <= W ? '✔' : '✘'}（被 V 截住？${st.clampedByV}）　没有 660／860 上限`);
        log(`      内边距照旧：行内沿 ${edge}px　正文可用宽＝C−2×${edge}＝${r2(st.C - 2 * edge)}　最长一行 ${r2(d.poem.maxLine)}　折行 ${d.poem.wrappedLines} 行 / 共 ${d.poem.lineBoxCount} 个行盒`);
        log(`      实测内容宽：目录页 ${hubPg.colW}／诗页 ${poemPg.colW}　⇒ 复算−实测 = ${dHub}／${dPoem}px`);
        check('**【已选口径】实测内容宽 ＝ 脚本独立复算的公式值**（目录页与诗页都比，±0.02px，含浮点噪声）',
          Math.abs(hubPg.colW - st.C) <= 0.02 && Math.abs(poemPg.colW - st.C) <= 0.02
          && Math.abs(dHub) <= 0.02 && Math.abs(dPoem) <= 0.02,
          `复算 ${r2(st.C)} vs 实测 ${hubPg.colW}／${poemPg.colW}（Δ ${dHub}／${dPoem}）`);
        check('页面自报的**逐项拆解**（V／A／0.88A／max／C／命中项／是否被 V 截住）与脚本独立算的逐项一致',
          near(parseFloat(c.mStA), st.A, 0.02) && near(parseFloat(c.mStRaw), st.raw, 0.02)
          && near(parseFloat(c.mStMax), st.maxed, 0.02) && near(parseFloat(c.mStC), st.C, 0.02)
          && c.mStHit === chosenHit(W) && c.mStClamped === String(st.clampedByV)
          && near(parseFloat(c.mW), W, 0),
          `页面：A=${c.mStA} 0.88A=${c.mStRaw} max=${c.mStMax} C=${c.mStC} 命中=${c.mStHit} 被V截=${c.mStClamped}`);
        check('**上界＝视口 V**：C ≤ V；且本例是否被 V 截住与公式一致',
          st.C <= W + 0.01 && (c.mStClamped === String(st.clampedByV)),
          `C=${r2(st.C)} ≤ V=${W}；被 V 截住? ${c.mStClamped}`);
        check('**没有夹 660／860 上限**：V=834 时 C=712.8 > 660、V=1180 时 C=1017.28 > 860（本视口只核对其自身的值）',
          chosenC(834) > 660 && chosenC(1180) > 860 && near(chosenC(834), 712.8, 0.02) && near(chosenC(1180), 1017.28, 0.02)
          && (W !== 834 || hubPg.colW > 660) && (W !== 1180 || hubPg.colW > 860),
          `C(834)=${r2(chosenC(834))} C(1180)=${r2(chosenC(1180))}；本视口实测 ${hubPg.colW}`);
        check('列外余白 ＝(V−C)/2 且左右相等；目录页与诗页左沿一致（±0.05px）',
          near(hubPg.colLeft, st.gut, 0.6) && near(W - hubPg.colRight, st.gut, 0.6)
          && near(poemPg.colLeft, st.gut, 0.6) && near(W - poemPg.colRight, st.gut, 0.6)
          && near(Math.abs(hubPg.colLeft - (W - hubPg.colRight)), 0, 0.05)
          && near(Math.abs(hubPg.colLeft - poemPg.colLeft), 0, 0.05),
          `目录页 ${hubPg.colLeft} ＋ ${r2(W - hubPg.colRight)}／诗页 ${poemPg.colLeft} ＋ ${r2(W - poemPg.colRight)}`);
        check('**内边距照旧**：行内沿 ＝ 1.05rem ＝ 16.8px；正文可用宽 ＝ C − 2×16.8；且它是**列内**一层（诗目左内沿＝组名左沿、右内沿＝列右沿−行内沿）',
          near(edge, 16.8, 0.01) && near(parseFloat(c.mEdge), 16.8, 0.01)
          && near(parseFloat(c.mAvail), st.C - 33.6, 0.6),
          `行内沿 ${edge}／正文可用宽 页面 ${c.mAvail} vs 复算 ${r2(st.C - 33.6)}`);
        check('两页用的是**同一个 C**（目录页与诗页同宽）',
          near(hubPg.colW, poemPg.colW, 0.05), `${hubPg.colW} vs ${poemPg.colW}`);
      }

      // ---- [B] 未被选的三块 ----
      log('\n[B] 未被选的三块（背景对照）：公式复算一致；都标着「未被选」；且都在 [data-shotframe] 之外（不进图）');
      {
        const cwOk = [], labelOk = [], outsideOk = [];
        for (const t of CONTRAST) {
          const d = M.demos.filter((x) => x.block === t.id)[0];
          const cw = cwOf(t, W);
          cwOk.push(Math.abs(d.pages[0].colW - cw) <= 0.02 && Math.abs(d.pages[1].colW - cw) <= 0.02
            && near(parseFloat(d.cap.mCwFormula), cw, 0.02) && d.cap.mHit === hitOf(t, W));
          labelOk.push(d.chosen === false && d.headText.includes('未被选') && !d.headText.includes('✓ 已选'));
          outsideOk.push(d.inShot === false);
          log(`      ${t.id}（${t.base}·${t.pct}%·${t.role}:${t.floor}）公式 ${r2(cw)}　实测 ${d.pages[0].colW}／${d.pages[1].colW}　命中 ${HIT_NAME[hitOf(t, W)]}　列外余白 ${d.pages[0].colLeft}　进图? ${d.inShot}`);
        }
        check('三块「未被选」的公式观测值与脚本独立复算一致（±0.01px）', cwOk.every(Boolean), CONTRAST.map((t) => `${t.id}:${r2(cwOf(t, W))}`).join(' '));
        check('三块都有 data-chosen="0" ＋ 文字里的「未被选」（不会与已选口径混淆）', labelOk.every(Boolean),
          CONTRAST.map((t) => `${t.id}:${M.demos.filter((x) => x.block === t.id)[0].chosen ? '⚠当作已选' : '未被选'}`).join(' '));
        check('三块都在 [data-shotframe] **之外** ⇒ 图里只有已选口径', outsideOk.every(Boolean),
          `shotframe 内的块 = ${M.shotDemos} 个（其中已选 ${M.shotChosenDemos} 个）；shotframe 外的块 = ${M.outsideDemos} 个`);
        check('shotframe 内**只有一块**、且就是已选口径那一块（未被选的三块都在 .bgsec 里、不进图）',
          M.shotDemos === 1 && M.shotChosenDemos === 1 && M.outsideDemos === CONTRAST.length && M.bgsecDemos === CONTRAST.length,
          `内 ${M.shotDemos}／已选 ${M.shotChosenDemos}／shotframe 外 ${M.outsideDemos}（其中 .bgsec 里 ${M.bgsecDemos}）`);
      }

      // ---- [11] 正文行长 ----
      log('\n[11] 正文行长（8 行真实原文）——「内容宽 C」够不够放下一行 12 字的诗行');
      const textOk = [], lineOk = [], foldOk = [];
      for (const t of ALL) {
        const d = M.demos.filter((x) => x.block === t.id)[0];
        const P = d.poem, cw = cwFor(t, W), edge = parseFloat(P.bodyFont.paddingLeft);
        const avail = cw - 2 * edge;
        textOk.push(P.lines.map((l) => l.text).join('\n') === mdFlat.join('\n'));
        lineOk.push(P.lineCount === 8 && P.lines.every((l) => l.w <= avail + 0.6)
          && near(parseFloat(d.cap.mAvail), avail, 0.6) && near(parseFloat(d.cap.mEdge), edge, 0.05)
          && near(parseFloat(d.cap.mWrapped), P.wrappedLines, 0.01)
          && near(parseFloat(d.cap.mLineBoxCount), P.lineBoxCount, 0.01));
        foldOk.push((P.wrappedLines > 0) === (avail < 213.19 - 0.6));
        log(`      ${t.id}：${P.lineCount} 行 / 折行 ${P.wrappedLines} 行｜正文可用宽 ${r2(avail)}（＝C ${r2(cw)} − 2×${edge}）｜最长一行 ${r2(P.maxLine)}` +
          `｜行盒 ${P.lineBoxCount} 个（居中下断点的表现）｜${P.wrappedLines ? '⚠ 放不下 12 字的诗行 ⇒ 折行' : '12 字的诗行放得下'}`);
      }
      check('原文恰好 8 行、**逐行与 content/poems/gushi-shijiu-shou-01.md 的正文逐字相同**（每一块都查）',
        textOk.every(Boolean), `${ALL.length} 块全部＝源文件`);
      check('8 行都在、每行都放得进「C − 2×行内沿」、页面自报折行数与行盒数 ＝ 实测（每一块都查）',
        lineOk.every(Boolean), ALL.map((t) => `${t.id}:可用 ${r2(cwFor(t, W) - 33.6)}/折 ${M.demos.filter((x) => x.block === t.id)[0].poem.wrappedLines}/${M.demos.filter((x) => x.block === t.id)[0].poem.lineBoxCount} 盒`).join(' '));
      check('**正文是否折行 ⟺ 正文可用宽 &lt; 最长一行（213.19px）**：逐块对上（居中重核过；⚠ 折行行为本身**未被采纳为规格**，这里只当事实）',
        foldOk.every(Boolean), ALL.map((t) => {
          const P = M.demos.filter((x) => x.block === t.id)[0].poem;
          const avail = cwFor(t, W) - 33.6;
          return `${t.id}:可用 ${r2(avail)} ${avail < 213.19 ? '<' : '≥'} 213.19 ⇒ 折 ${P.wrappedLines} 行`;
        }).join(' ｜ '));
      check('最长一行：未折行时 ＝ 12 字 ×（17px＋0.045em）＝213.19px（±2px）；折行时必然更小',
        ALL.every((t) => {
          const P = M.demos.filter((x) => x.block === t.id)[0].poem;
          return P.wrappedLines === 0 ? near(P.maxLine, 213.19, 2) : P.maxLine < 213.19;
        }),
        ALL.map((t) => { const P = M.demos.filter((x) => x.block === t.id)[0].poem; return `${t.id}:${r2(P.maxLine)}${P.wrappedLines ? '(折)' : ''}`; }).join(' '));

      // ---- [13] 交互 ----
      log('\n[13] 目录页交互（真鼠标）：首态全收起 ⇒ 展开 ⇒ 再收起');
      check('首态：**全部收起**（aria-expanded=false、诗目列表 hidden、可见诗目 0 行）',
        M.demos.every((d) => d.hub.gheadExpanded === 'false' && d.hub.listHidden === true && d.hub.visibleRows === 0),
        M.demos.map((d) => `${d.block}:${d.hub.gheadExpanded}/${d.hub.listHidden}/${d.hub.visibleRows}`).join(' '));
      check('组头是 <button type="button"> ＋ aria-expanded（不是 div 冒充）',
        M.demos.every((d) => d.hub.gheadTag === 'BUTTON' && d.hub.gheadType === 'button'),
        M.demos.map((d) => `${d.block}:${d.hub.gheadTag}/${d.hub.gheadType}`).join(' '));
      const clickRes = [];
      for (const t of ALL) clickRes.push(await clickGhead(t.id));
      M = await measure();
      check('真鼠标点组头 ⇒ 展开（aria-expanded=true、可见 20 行 ＝ 19 首 ＋ 1 条夹具行、记号变 [−]）',
        clickRes.every((c) => c.hitIsE) && M.demos.every((d) => d.hub.gheadExpanded === 'true' && d.hub.visibleRows === 20 && d.hub.markText === '[\u2212]'),
        clickRes.map((c, i) => `${ALL[i].id}:命中${c.hitIsE ? '自身' : c.hitTag}`).join(' ') + ' ｜ ' + M.demos.map((d) => `${d.block}:${d.hub.visibleRows}行`).join(' '));

      log('\n[8] 已定的目录页关系（展开后逐行实测，**每一块**都查）：记号悬挂／缝 0.4rem／竖直居中／缩进 0／作者紧随／「关于」');
      {
        const markOk = [], vertOk = [], indentOk = [], authorOk = [], aboutOk = [], padOk = [];
        for (const t of ALL) {
          const d = M.demos.filter((x) => x.block === t.id)[0];
          const edge = parseFloat(d.poem.bodyFont.paddingLeft);
          markOk.push(near(d.hub.markLeftRel, 0, 0.6) && near(d.hub.seam, 6.4, 0.6));
          vertOk.push(near(d.hub.gmarkCenter, d.hub.gnameCenter, 1.0));
          const short = d.hub.rows.filter((r) => r.visible && !r.fx);
          const fx = d.hub.rows.filter((r) => r.visible && r.fx)[0];
          indentOk.push(short.length === 19 && short.every((r) => near(r.titleLeft, d.hub.gnameLeft, 1))
            && near(fx.badgeLeft, d.hub.gnameLeft, 1));
          authorOk.push(short.every((r) => near(r.authorLeft - (r.titleLeft + r.titleMaxLineW), 5.76, 1.5)
            && (d.hub.colRight - edge - r.authorRight) > 50));
          aboutOk.push(near(d.hub.aboutRight, edge, 0.6) && d.hub.rows.length === 20);
          padOk.push(d.hub.rows.filter((r) => r.visible).every((r) => near(r.plinkPadLeft, d.hub.nameX, 0.01) && near(r.plinkPadRight, edge, 0.01)));
          log(`      ${t.id}：记号左沿 ${d.hub.markLeftRel}（列左沿 0）· 槽 ${r2(d.hub.markLeftRel + d.hub.gmarkW + d.hub.seam)} · 缝 ${d.hub.seam}` +
            `｜竖直差 ${r2(Math.abs(d.hub.gmarkCenter - d.hub.gnameCenter))}｜组名左沿 ${d.hub.gnameLeft}＝题名左沿｜「关于」右沿距列右沿 ${d.hub.aboutRight}` +
            `｜夹具行折 ${fx.titleLineBoxes} 行（列宽 ${d.hub.colW}）`);
        }
        check('记号在列左沿之外的槽里（记号左沿＝列左沿）、缝＝0.4rem（±0.6px）', markOk.every(Boolean), ALL.map((t) => M.demos.filter((x) => x.block === t.id)[0].hub.seam).join(' '));
        check('记号与组名首字**竖直居中**对齐（两个排版盒的中心差 ≤1px）', vertOk.every(Boolean), ALL.map((t) => 'Δ' + r2(Math.abs(M.demos.filter((x) => x.block === t.id)[0].hub.gmarkCenter - M.demos.filter((x) => x.block === t.id)[0].hub.gnameCenter))).join(' '));
        check('20 行（19 首＋夹具行）**逐条**：题名左沿＝组名左沿（缩进 0，±1px；夹具行看行首小标）', indentOk.every(Boolean), ALL.map((t) => M.demos.filter((x) => x.block === t.id)[0].hub.nameX).join(' '));
        check('作者紧随题名、不右对齐（距题名末端 ≈0.45em＝5.76px；且离列右内沿很远）', authorOk.every(Boolean), `${ALL.length} 块 × 19 行`);
        check('「关于」在第一个组头之上，且右沿＝列右沿−行内沿', aboutOk.every(Boolean), ALL.map((t) => M.demos.filter((x) => x.block === t.id)[0].hub.aboutRight).join(' '));
        check('行内沿是**内容列内**的一层：诗目左内沿＝组名左沿、右内沿＝列右沿−行内沿', padOk.every(Boolean), `全部 20 行 × ${ALL.length} 块`);
      }

      log('\n[9] 已定的诗页关系：**「全部居中」**（2026-10-15 已定）／间距／顶部行不参与居中／没有页脚行');
      {
        const centerOk = [], gapOk = [], topOk = [], footOk = [], notLeftOk = [];
        const devRows = [];
        for (const t of ALL) {
          const d = M.demos.filter((x) => x.block === t.id)[0];
          const P = d.poem, edge = parseFloat(P.bodyFont.paddingLeft);
          const cc = P.colCenter;
          const maxLineDev = Math.max.apply(null, P.lineCenterDevs.map(Math.abs));
          devRows.push({ id: t.id, cc, titleDev: P.titleDev, identDev: P.identDev, maxLineDev, boxes: P.lineBoxCount });
          centerOk.push(P.titleDev <= 2.0 && P.identDev <= 2.0 && maxLineDev <= 1.0
            && P.lineCenterDevs.length === P.lineBoxCount
            && near(P.titleInk.cx, parseFloat(d.cap.mTitleBoxCx), 0.05)
            && near(P.identInk.cx, parseFloat(d.cap.mIdentBoxCx), 0.05)
            && near(parseFloat(d.cap.mLineMaxDev), maxLineDev, 0.05)
            && near(parseFloat(d.cap.mLineBoxCount), P.lineBoxCount, 0.01)
            && near(parseFloat(d.cap.mColCenter), cc, 0.05));
          /* 反向：旧的「三块同一竖线（全平齐）」已不成立 —— 比**文字盒**左沿（满宽 block 的元素左沿永远相等，会假通过） */
          const inkLefts = [P.titleInk.left, P.identInk.left].concat(P.lines.map((l) => l.inkBox.left));
          notLeftOk.push(Math.max.apply(null, inkLefts) - Math.min.apply(null, inkLefts) > 5);
          gapOk.push(near(P.titleGap, 11.2, 1.0) && near(P.bodyGap, 33.6, 1.0));
          topOk.push(near(P.backTop, P.detailTop, 1.0) && P.backTop < P.firstLineTop
            && near(P.backLeft, edge, 0.6) && near(P.detailRight, edge, 0.6)
            && Math.abs((P.colLeft + P.backLeft) - cc) > 5 && Math.abs((P.colRight - P.detailRight) - cc) > 5);
          footOk.push(P.footCount === 0);
          log(`      ${t.id}：内容列中心 ${cc} ｜ 题名盒中心 ${P.titleInk.cx}（Δ${P.titleDev}）｜ 身份行盒中心 ${P.identInk.cx}（Δ${P.identDev}）` +
            `｜ 正文 ${P.lineBoxCount} 个行盒，中心最大 Δ${r2(maxLineDev)}｜着墨 ${P.lineInkLeft}…${P.lineInkRight}（列 ${P.colLeft}…${P.colRight}）`);
          log(`            间距：题名→身份 ${P.titleGap}、身份→原文 ${P.bodyGap}｜顶部行（不参与居中）返回 +${P.backLeft}／详情 −${P.detailRight}（顶差 ${r2(Math.abs(P.backTop - P.detailTop))}）｜页脚行 ${P.footCount} 个`);
        }
        check('诗页**「全部居中」**：题名文字盒中心、身份行文字盒中心 ≈ 内容列中心（≤2px）；**正文每一个行盒**中心 ≤ 1px；页面自报与实测一致',
          centerOk.every(Boolean),
          devRows.map((x) => `${x.id}: 题名Δ${x.titleDev}／身份Δ${x.identDev}／正文行盒Δ最大${r2(x.maxLineDev)}（${x.boxes} 盒）`).join('　｜　'));
        check('反向：旧的「三块同一竖线（全平齐）」**已不成立** —— 比**文字盒**左沿（不是满宽 block 的元素左沿）',
          notLeftOk.every(Boolean),
          ALL.map((t) => {
            const P = M.demos.filter((x) => x.block === t.id)[0].poem;
            const il = [P.titleInk.left, P.identInk.left].concat(P.lines.map((l) => l.inkBox.left));
            return `${t.id}: 文字盒左沿跨 ${r2(Math.max.apply(null, il) - Math.min.apply(null, il))}px`;
          }).join(' ｜ '));
        check('题名→身份 0.7rem（11.2px）、身份→原文 2.1rem（33.6px）（±1px；任何宽度都不变）', gapOk.every(Boolean), ALL.map((t) => { const p = M.demos.filter((x) => x.block === t.id)[0].poem; return p.titleGap + '/' + p.bodyGap; }).join(' '));
        check('顶部行**不参与居中**（继承）：返回／详情同在顶部一行的两端、都在正文之上；返回左沿＝列左沿＋行内沿、详情右沿＝列右沿−行内沿；且都远离列中心（＞5px）',
          topOk.every(Boolean),
          ALL.map((t) => { const P = M.demos.filter((x) => x.block === t.id)[0].poem; return `${t.id}:+${P.backLeft}/−${P.detailRight}（顶差 ${r2(Math.abs(P.backTop - P.detailTop))}）`; }).join(' '));
        check('诗页正文之后**没有**页脚行（已定）', footOk.every(Boolean), '诗页内 [data-test="foot"] 计数为 0');
      }

      // ---- [12] 页面自报 ＝ 实测 ----
      log('\n[12] 页面自报数字 ＝ 脚本独立实测（±0.6px）');
      const selfBad = [];
      for (const t of ALL) {
        const d = M.demos.filter((x) => x.block === t.id)[0];
        const c = d.cap, P = d.poem, Hh = d.hub, cw = cwFor(t, W);
        const pairs = [
          ['内容宽(目录页)', parseFloat(c.mCwHub), d.pages[0].colW],
          ['内容宽(诗页)', parseFloat(c.mCwPoem), d.pages[1].colW],
          ['公式复算', parseFloat(c.mCwFormula), cw],
          ['列外余白', parseFloat(c.mGut), d.pages[0].colLeft],
          ['正文可用宽', parseFloat(c.mAvail), cw - 2 * parseFloat(P.bodyFont.paddingLeft)],
          ['最长行', parseFloat(c.mMaxLine), P.maxLine],
          ['组名左沿', parseFloat(c.mNameX), Hh.nameX],
          ['记号左沿', parseFloat(c.mMarkLeft), Hh.markLeftRel],
          ['缝', parseFloat(c.mSeam), Hh.seam],
          ['「关于」右沿', parseFloat(c.mAboutR), Hh.aboutRight],
          ['题名→身份', parseFloat(c.mTitleGap), P.titleGap],
          ['身份→原文', parseFloat(c.mBodyGap), P.bodyGap],
          ['顶部行左沿', parseFloat(c.mTopL), P.backLeft],
          ['顶部行右沿', parseFloat(c.mTopR), P.detailRight],
          ['诗页列中心', parseFloat(c.mColCenter), P.colCenter],
          ['题名文字盒中心', parseFloat(c.mTitleBoxCx), P.titleInk.cx],
          ['身份行文字盒中心', parseFloat(c.mIdentBoxCx), P.identInk.cx],
          ['正文行盒中心最大偏差', parseFloat(c.mLineMaxDev), Math.max.apply(null, P.lineCenterDevs.map(Math.abs))],
          ['正文行盒数', parseFloat(c.mLineBoxCount), P.lineBoxCount],
        ];
        pairs.forEach(([k, a, b]) => {
          if (!(Math.abs(a - b) <= 0.6)) selfBad.push(`${t.id}/${k}: 页面 ${a} vs 实测 ${r2(b)}`);
        });
        log(`      ${t.id}（data-m-src=${c.mSrc}）：${pairs.map(([k, a, b]) => `${k} ${a}≈${r2(b)}`).join(' ')}`);
      }
      check(`页面自报的每一格数字都与脚本实测一致（${selfBad.length} 处不一致，要求 0）`,
        selfBad.length === 0, selfBad.length ? selfBad.join(' | ') : `19 项 × ${ALL.length} 块 全部一致`);
      check('自报数字标明了来源（本轮全部照实渲染 ⇒ 应全部是实测 dom）',
        M.demos.every((d) => d.cap.mSrc === 'dom'), M.demos.map((d) => `${d.block}:${d.cap.mSrc}`).join(' '));

      // ---- [13] 展开后 ----
      log('\n[13] 展开 20 行之后重查：无横向溢出 ＋ 已选口径的内容宽没变');
      check(`展开后：scrollWidth 仍 === ${W}，所有可见元素仍在 0…${W} 内`,
        M.docW === W && M.bodyW === W && M.maxRight <= W + 0.5 && M.minLeft >= -0.5,
        `docW=${M.docW} bodyW=${M.bodyW} maxRight=${M.maxRight}(${M.maxRightEl}) minLeft=${M.minLeft}(${M.minLeftEl})`);
      check('展开后每块的内容宽／列外余白／正中都与收起时逐一相同（展开只改行数，不改宽度行为）',
        ALL.every((t) => {
          const d = M.demos.filter((x) => x.block === t.id)[0];
          return near(d.pages[0].colW, cwFor(t, W), 0.02) && near(d.pages[0].colLeft, (W - cwFor(t, W)) / 2, 0.6);
        }), `${ALL.length} 块逐一比对`);

      // ---- [10] 字号不缩放（收数据） ----
      {
        const d0 = M.demos.filter((x) => x.block === 'CHOSEN')[0];
        fontBag.push({
          w: W,
          title: JSON.stringify(d0.poem.fonts.title),
          ident: JSON.stringify(d0.poem.fonts.ident),
          line: JSON.stringify({ f: d0.poem.bodyFont.fontSize, l: d0.poem.bodyFont.lineHeight, s: d0.poem.bodyFont.letterSpacing }),
          ctl: JSON.stringify(d0.poem.fonts.ctl),
          ...Object.fromEntries(['ptitle', 'pauthor', 'gname', 'gmark', 'gcount', 'about'].map((k) => [k, JSON.stringify(d0.hub.font[k])])),
        });
        check('正文 = 17px／行高 34px／字距 0.765px（这套视觉的核心，**任何视口都不缩放**）',
          d0.poem.bodyFont.fontSize === '17px' && d0.poem.bodyFont.lineHeight === '34px' && d0.poem.bodyFont.letterSpacing === '0.765px',
          `${d0.poem.bodyFont.fontSize}/${d0.poem.bodyFont.lineHeight}/${d0.poem.bodyFont.letterSpacing}`);
        check('题名 = 24px、身份行 = 12.48px（任何视口都不缩放）',
          d0.poem.fonts.title.fontSize === '24px' && d0.poem.fonts.ident.fontSize === '12.48px',
          `题名 ${d0.poem.fonts.title.fontSize}／身份 ${d0.poem.fonts.ident.fontSize}`);
      }

      // ---- 收起 ----
      const backC = await clickGhead('CHOSEN');
      let M2 = await measure();
      check('再点一次 ⇒ 该组收起（aria-expanded=false、可见诗目 0 行、记号回到 [+]）',
        backC.hitIsE && M2.demos.filter((x) => x.block === 'CHOSEN')[0].hub.visibleRows === 0
        && M2.demos.filter((x) => x.block === 'CHOSEN')[0].hub.markText === '[+]',
        `CHOSEN 收起后可见 ${M2.demos.filter((x) => x.block === 'CHOSEN')[0].hub.visibleRows} 行`);

      {
        const d = M2.demos.filter((x) => x.block === 'CHOSEN')[0];
        const st = chosenSteps(W);
        rowsOut.push({
          key: C.key, w: W, h: H, label: C.label, docW: M.docW, docH: M.docH,
          A: r2(st.A), raw: r2(st.raw), maxed: r2(st.maxed), C: r2(st.C), gut: r2(st.gut),
          hit: chosenHit(W), clampedByV: st.clampedByV,
          measured: d.pages[0].colW, delta: r2(d.pages[0].colW - st.C),
          avail: r2(st.C - 33.6), maxLine: r2(d.poem.maxLine), bodyWrapped: d.poem.wrappedLines,
          boxes: d.poem.lineBoxCount, fxLines: Number(d.cap.mFxLines),
          titleDev: d.poem.titleDev, identDev: d.poem.identDev,
          lineMaxDev: r2(Math.max.apply(null, d.poem.lineCenterDevs.map(Math.abs))),
          overflow: d.pages.every((x) => x.colRight <= W + 0.5),
        });
      }

      // ---- [15][16] ----
      if (!SHOT) { log('\n[15][16] 已跳过（--no-shot）：不查看图态、不重出 PNG'); continue; }
      await send('Page.navigate', { url: 'about:blank' });
      await sleep(150);
      await load(url + '#shot', W, H, C.mobile);
      let S = await measure();
      log('\n[15] 看图态（#shot）：不改变任何排布规则，且首态仍全收起');
      check('#shot 下首态仍是**全部收起**（图里的展开态是点出来的）',
        S.demos.every((d) => d.hub.gheadExpanded === 'false' && d.hub.visibleRows === 0),
        S.demos.map((d) => `${d.block}:${d.hub.gheadExpanded}`).join(' '));
      await clickGhead('CHOSEN');
      const S2 = await measure();
      const dS = S2.demos.filter((x) => x.block === 'CHOSEN')[0];
      const st = chosenSteps(W);
      const diff = [];
      if (!near(dS.pages[0].colW, st.C, 0.02)) diff.push(`列宽 ${dS.pages[0].colW} ≠ ${r2(st.C)}`);
      if (!near(dS.pages[0].colLeft, st.gut, 0.6)) diff.push(`列外余白 ${dS.pages[0].colLeft}`);
      if (!near(dS.poem.titleInk.cx, W / 2, 2)) diff.push(`题名中心 ${dS.poem.titleInk.cx}`);
      check('#shot 下排布数字与普通态逐一相同（已选口径的 C／列外余白／居中都没变）',
        diff.length === 0, diff.length ? diff.join(' | ') : `C=${dS.pages[0].colW} 列外余白=${dS.pages[0].colLeft}`);
      check('图中目录页只显示前 3 行（1 条夹具行 ＋ 2 条真实行）＋ 1 条青色说明条',
        dS.hub.visibleRows === 3 && dS.hub.rows.filter((r) => r.visible)[0].fx === true,
        `${dS.hub.visibleRows} 行`);
      check(`#shot 下仍无横向溢出（scrollWidth === ${W}）`,
        S2.docW === W && S2.maxRight <= W + 0.5 && S2.minLeft >= -0.5,
        `docW=${S2.docW} maxRight=${S2.maxRight} docH=${S2.docH}`);
      check('图中只有**已选口径**这一块（shotframe 内 1 块）', S2.shotDemos === 1 && S2.shotChosenDemos === 1 && S2.outsideDemos === CONTRAST.length,
        `内 ${S2.shotDemos}／已选 ${S2.shotChosenDemos}／shotframe 外 ${S2.outsideDemos}`);
      const pngName = `q-width-pct.${C.key}.png`;
      const pngPath = join(OUT, pngName);
      const shot = await send('Page.captureScreenshot', {
        format: 'png', captureBeyondViewport: true,
        clip: { x: 0, y: S2.deck.y, width: W, height: S2.deck.h, scale: 1 },
      });
      writeFileSync(pngPath, Buffer.from(shot.data, 'base64'));
      const buf = readFileSync(pngPath);
      const size = pngSize(buf);
      log(`\n[16] PNG：${pngPath}`);
      log(`      截图区 CSS 尺寸 ${W}×${r2(S2.deck.h)} @DPR 2 → 像素 ${W * 2}×${r2(S2.deck.h * 2)} → 文件实测 ${size.w}×${size.h}，${statSync(pngPath).size} 字节`);
      check(`PNG 像素宽 ＝ 视口宽 × 2 ＝ ${W * 2}（**真实 CSS px @DPR 2，不是缩放图**）`,
        size.w === W * 2, `实测 ${size.w}`);
      check('PNG 像素高 ＝ 截图区 CSS 高 × 2', Math.abs(size.h - S2.deck.h * 2) <= 2, `实测 ${size.h}，期望 ${r2(S2.deck.h * 2)}`);
      check('PNG 文件非空且一张图只含**一个**视口宽（没有把不同宽度拼在一起）',
        statSync(pngPath).size > 1000 && size.w === W * 2,
        `${statSync(pngPath).size} 字节，宽 ${size.w}px ＝ 1 个视口 × 2`);
    }

    /* ═══ [10] 跨视口：字号不缩放 ═══════════════════════════════════ */
    log('\n═══════════ [10] 跨视口：字号／行高／字距**不随宽度变化** ═══════════');
    const kinds = ['title', 'ident', 'line', 'ctl', 'ptitle', 'pauthor', 'gname', 'gmark', 'gcount', 'about'];
    const bad10 = [];
    kinds.forEach((k) => {
      const vals = uniq(fontBag.map((f) => f[k]));
      log(`      ${k}: ${vals.length === 1 ? '1 个取值' : '⚠ ' + vals.length + ' 个取值'} → ${vals.join('  //  ')}`);
      if (vals.length !== 1) bad10.push(k);
    });
    check(`${kinds.length} 类文字在 ${fontBag.length} 个视口下的「字号·行高·字距」都只有 1 个取值（＝完全没有随宽度缩放）`,
      bad10.length === 0, bad10.length ? bad10.join(' ') : kinds.join('/') + ' 全部恒定');

    /* ═══ [16] 图片清单 ═══════════════════════════════════════════ */
    if (SHOT) {
      log('\n═══════════ [16] 图清单（每张只含一个视口宽，且只含已选口径一块）═══════════');
      CASES.forEach((C) => {
        const p = join(OUT, `q-width-pct.${C.key}.png`);
        const ok = existsSync(p);
        const size = ok ? pngSize(readFileSync(p)) : null;
        log(`      ${p}  ${ok ? size.w + '×' + size.h + '（' + statSync(p).size + ' 字节）' : '⚠ 不存在'}`);
        if (!ONLY) check(`图存在且像素宽 ＝ ${C.w * 2}（${C.key}）`, ok && size.w === C.w * 2, ok ? `${size.w}×${size.h}` : '缺失');
      });
    }

    /* ═══ 自包含 / 无 JS 报错 ═══════════════════════════════════ */
    log('\n═══════════ [G] 自包含 ＋ 无 JS 报错 ═══════════');
    const ext = requests.filter((u) => !u.startsWith('file:///') && !u.startsWith('data:'));
    check('CDP 记录的网络请求里没有任何 http(s) 外部引用',
      ext.length === 0, `${requests.length} 个请求，非 file:// 的=${ext.length} ${JSON.stringify(ext.slice(0, 4))}`);
    const textHits = ['<link', 'src=', '@import', 'http://', 'https://'].filter((t) => htmlText.indexOf(t) >= 0);
    check('页面文本里没有 <link / src= / @import / http(s)://（零外部引用）',
      textHits.length === 0, textHits.length ? '命中：' + textHits.join(' ') : '0 处');
    check('全程无 JS 报错（加载 ＋ 各视口的交互）', pageErrors.length === 0,
      pageErrors.length ? pageErrors.join(' | ') : '0 条');

    /* ── 给 .md 用的一张表 ── */
    log('\n═══════════ 已选口径实测汇总（可直接抄进 q-width-pct.md）═══════════');
    log('  视口 | V | A=V−24 | 0.88×A | max(320,…) | C(复算) | C(实测) | Δ | 列外余白 | 命中 | 被V截 | 正文可用宽 | 折行 | 最长行 | 行盒 | 夹具折行 | 溢出 | 题名Δ | 身份Δ | 行盒Δmax');
    rowsOut.forEach((r) => {
      log(`  ${r.key}(${r.w}×${r.h}) | ${r.w} | ${r.A} | ${r.raw} | ${r.maxed} | ${r.C} | ${r.measured} | ${r.delta} | ${r.gut} | ${HIT_NAME[r.hit]} | ${r.clampedByV ? '是' : '否'} | ${r.avail} | ${r.bodyWrapped} 行 | ${r.maxLine} | ${r.boxes} | ${r.fxLines} | ${r.overflow ? '无' : '⚠有'} | ${r.titleDev} | ${r.identDev} | ${r.lineMaxDev}`);
    });

    ws.close();
  } finally {
    chrome.kill();
    await sleep(300);
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* 临时 profile 删不掉不影响结果 */ }
  }
}

try {
  await run();
} catch (e) {
  console.error('\n校验脚本失败：' + ((e && e.stack) || e));
  failures += 1;
}
console.log(`\n===== 失败断言数：${failures} =====`);
process.exit(failures ? 1 : 0);
