/*
 * check-width-pct.mjs —— 「跨页宽度（新方向）：设一个下限 ＋ 用一个宽度的百分比去判断」
 *   讨论原型的【页面行为 ＋ 公式复算】自证脚本（可复跑）。
 *
 * ⚠ 它验的是**这一个原型页面**的页面行为**与那条公式**，**不是产品代码**：
 *   对象只有本目录下的 q-width-pct.html（**只读打开**：Page.navigate 到 file:// URL，脚本不写、不改它）。
 *   它不跑 web/ 与 android/ 的任何测试，也不读产品实现。额外读的文件只有两个，都是**只读**：
 *     ① prototype/css/theme-tech.css       —— 用来逐项比对页面内嵌的令牌快照；
 *     ② content/poems/gushi-shijiu-shou-01.md —— 用它的正文 8 行做「原文逐行一致」的基准。
 *
 * 它回答的问题只有一条：**「下限 ＋ 百分比」这条公式在真实视口下到底算出什么、谁在起作用、会不会溢出**。
 * 所以它的核心断言是两条：
 *   (A) **每个视口都是真实 CSS px**：innerWidth === 目标宽、documentElement.scrollWidth === 目标宽、无横向溢出；
 *   (B) **每一档的「实测内容宽」＝脚本独立复算的公式值**（并且把两者之差打印出来），
 *       「命中哪一项」也必须与脚本按判据独立算出的结果一致。
 *
 * 覆盖的视口（**每档都单独跑一遍全部断言，并各出一张 PNG**）：
 *   320×568（**本轮为「窄屏封顶」新增**）／360×932 ／390×844 ／412×915 ／430×932（手机，mobile=true）
 *   834×1112（平板）／1180×900（桌面）（mobile=false）／740×360（横屏，mobile=true）
 *   ⚠ 图是**一个视口一张**（真实 CSS px @DPR 2）；**没有**把不同宽度拼成缩放对照图。
 *
 * 断言清单（失败任一即 exit 1）：
 *  [G] 全局（只跑一次）：令牌快照逐项比对（值不一致数必须 0）、快照里没有「声明了却没用」的令牌、
 *      页面里每个 var() 都有声明、记录了快照来源短 sha ＋「权威仍是 docs/design/visual-tokens.md」、
 *      页面写明了八条覆盖视口、写明了「诗页水平对齐尚未选定 ⇒ 本页用三块同一竖线」、
 *      写明了「选某一档 ≠ 采纳整页规格」与「本页不决定 JSON/MD 分界」、
 *      写明了「本页不画上限（--measure 未用到）」、自包含（非 file:// 请求 0 个／无 <link / src= / @import / http(s)://）、
 *      无 JS 报错；参数表可解析且**每档都在候选集合内**（base/pct/role/floor），不是偷偷加档。
 *  [1] 结构：四档块都在；每块含 目录页 ＋ 诗页；目录页有「关于」1 个、组头 1 个、19＋1 行；
 *      诗页有 返回 1 个、详情 1 个、题名 1 个、身份行 1 个、原文恰好 **8 行**且**逐行与源文件逐字相同**；
 *      反向：可见文本里不出现 搜索／笔记标记／版本号／应用名／底名／来源／异文。
 *  [2] 每个视口：innerWidth／innerHeight 精确等于目标；docW === bodyW === 目标宽；所有可见元素在 0…目标宽 内。
 *  [3] **公式复算**：逐档 —— 基准值／百分比项／下界／上界 与脚本独立算的一致；**实测内容宽 ＝ 复算值**（±0.6px）
 *      并把差值打印；「命中项」与脚本按判据独立算的一致；命中封顶时是否贴到屏边也一致。
 *  [4] **留白**：两侧留白 ＝(视口宽−内容宽)/2 且左右相等；内容列宽度 ≤ 视口宽（**永不横向溢出**）；
 *      「内容列是否整个待在『可用宽』这一层里」与公式推算一致。
 *  [5] **两案差别**：当两档都命中「百分比」时，|内容宽(P1) − 内容宽(P2)| ＝ 2×外层页边×88% ＝ 21.12px；
 *      命中「下限」时两案相同 —— 逐视口断言，把这条「两案何时不同」的口径钉住。
 *  [6] **下限角色**：P3（＝最小页边 40px）在 320 下给出 240（稳稳保住两边各 40px 页边），
 *      P1（＝最小内容宽 320px）在 320 下给出 320（页边 0）—— 同一个 clamp 的两种角色，取向相反。
 *      并验证「最小页边 m」的生效条件 W &lt; 2m/(1−百分比)（本页 40px/88% ⇒ 666.67px）与逐视口实测命中项一致。
 *  [7] **窄屏封顶**：320 下 P4（下限 400 &gt; 视口 320）必须命中「视口封顶」、内容宽 ＝ 视口宽、不溢出。
 *  [8] 已定的目录页关系在**每个视口**都成立（展开后逐行实测）：记号左沿＝列左沿、缝＝0.4rem、
 *      记号与组名首字竖直居中、题名左沿＝组名左沿（缩进 0）、作者紧随题名不右对齐、「关于」右沿＝列右沿−行内沿。
 *  [9] 已定的诗页关系在**每个视口**都成立：题名／身份行／正文 三块同一竖线（＝列左沿＋行内沿）、
 *      题名→身份 0.7rem、身份→原文 2.1rem；返回与详情**同一行的两端**且都在正文之上；诗页内**没有**页脚行。
 *  [10] **字号不随宽度缩放**：8 个视口下，题名／身份行／正文／诗题／作者／组名／计数／记号／关于／控件 的
 *      字号·行高·字距 **完全一致**（每个都只有 1 个取值），并与内嵌令牌一致。
 *  [11] **正文行长**：8 行都在、逐行与源文件相同、每行都放得进「内容宽 − 2×行内沿」；
 *      **是否折行 ⟺ 正文可用宽 &lt; 最长一行（213.19px）**——逐档把这个「宽度 ⇒ 阅读后果」钉成可复算的关系。
 *      （本页真出现一次折行：320 下的 P3，内容宽 240 ⇒ 正文可用宽 206.4px &lt; 213.19px。）
 *  [12] 页面自报数字 ＝ 脚本独立实测（±0.6px）；并断言自报数字标明了来源（data-m-src=dom）。
 *  [13] 目录页交互（真鼠标）：首态**全部收起** ⇒ 点组头展开（20 行）⇒ 再点收起；
 *      **展开之后重查一次「无横向溢出」**（每个视口）。
 *  [14] 夹具行的折行是「内容宽」在这个内容上唯一看得见的作用：逐档打印折了几行（不做断言排序，只记录＋对 320/360 断言）。
 *  [15] 看图态（#shot）：① 首态仍是**全收起**；② **不改变任何排布规则**（列宽／留白／内沿与普通态逐一相等）；
 *      ③ 每块目录页只显示前 3 行 ＋ 1 条说明条。
 *  [16] PNG：每个视口一张；像素宽 ＝ 视口宽 × 2、像素高 ＝ 截图区 CSS 高 × 2（自己解析 PNG 头读 IHDR，
 *      不装图片库）；文件非空。
 *  [17] **边界自证**：`CHROME_BIN` 指到一个不存在的路径时，本脚本必须**如实报错并 exit 2**，
 *      **不能**打印出「失败断言数：0」—— 用 `--selftest-chrome` 真的跑一次子进程来证明（见文件尾）。
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
 *   - **端口**：CDP 调试端口**先向内核要一个空闲端口**（net 监听 0 再关掉），**不写死**
 *     —— 本仓真的发生过「两边同时跑撞端口」。
 *   - **仓库根**：从脚本所在目录**向上查找 prototype/css/theme-tech.css** 来定位，
 *     **不写死层级**（整轮搬进 history/ 也不会指错）。
 *
 * 副作用（说清，免得复跑后以为工作树坏了）：
 *   - 会在**临时目录**建一个 Chromium profile，结束时删掉；
 *   - **默认会重写**本目录下的 8 张 PNG（q-width-pct.<视口宽>.png）。
 *     不同 Chromium 版本／字体渲染可能让字节数变化 ⇒ **复跑可能让这些 PNG 变脏**，那是正常现象。
 *     只想看断言就加 `--no-shot`。
 *   - q-width-pct.html 本身**只读打开**，不写、不改。
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const OUT = dirname(fileURLToPath(import.meta.url));       // 本脚本所在目录＝原型目录
const ROOT = (() => {
  // 搬迁时改成「向上查找」：原写法是 join(OUT,'..','..','..')，一旦整轮搬进 history/ 就会指到 items/。
  let d = OUT;
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(d, 'prototype', 'css', 'theme-tech.css'))) return d;
    d = dirname(d);
  }
  throw new Error('找不到仓库根：从 ' + OUT + ' 向上查找 prototype/css/theme-tech.css 失败');
})();

/* ── [17] 边界自证：CHROME_BIN 指到不存在的路径 ⇒ 如实报错退出，不假装通过 ──
 * 真的起一个子进程（同一个脚本、同一个 cwd），只把 CHROME_BIN 指向一个不存在的路径，
 * 然后断言：退出码 ≠ 0、stderr 里说了原因、**stdout 里没有出现「失败断言数：0」**。
 */
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

/* 覆盖的视口（任务书要求的覆盖 ＋ 为「窄屏封顶」新增的 320） */
const CASES = [
  { key: '320', w: 320, h: 568, mobile: true, label: '手机 · 最小可用宽（本轮为「窄屏封顶」新增）' },
  { key: '360', w: 360, h: 932, mobile: true, label: '手机 · 窄屏' },
  { key: '390', w: 390, h: 844, mobile: true, label: '手机' },
  { key: '412', w: 412, h: 915, mobile: true, label: '手机' },
  { key: '430', w: 430, h: 932, mobile: true, label: '手机（前几轮的验收宽）' },
  { key: '834', w: 834, h: 1112, mobile: false, label: '平板' },
  { key: '1180', w: 1180, h: 900, mobile: false, label: '桌面' },
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
/* 参数表：从页面里那段带标记的注释解析（**参数**由页面声明；**公式**由本脚本独立实现）。 */
const tierBlock = declarationBlock(htmlText, '== TIERS-BEGIN ==', '== TIERS-END ==');
if (!tierBlock) { console.error('页面里找不到 == TIERS-BEGIN ==/== TIERS-END == 参数表'); process.exit(2); }
const TIERS = [];
for (const line of tierBlock.split(/\r?\n/)) {
  const m = /^\s*\*?\s*(P\d+)\s+base=(\w+)\s+pct=(\d+)\s+role=(\w+)\s+floor=(\d+)/.exec(line);
  if (m) TIERS.push({ id: m[1], base: m[2], pct: Number(m[3]), role: m[4], floor: Number(m[5]) });
}
const ORDER = TIERS.map((t) => t.id);
const TIER = Object.fromEntries(TIERS.map((t) => [t.id, t]));

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
 * 可用宽 = W − 2×PAD
 * 基准   = W（viewport）或 可用宽（avail）
 * 下界   = (role==='content') ? floor : 0
 * 上界   = (role==='gutter')  ? W − 2×floor : W        ← 「视口封顶」就是这一项
 * 内容宽 = min( max(pct×基准, 下界), 上界 )
 */
let PAD = NaN;      // 外层页边：从页面声明的 --pad-outer 读，下面再与页面实测值对齐
function baseW(t, W) { return t.base === 'viewport' ? W : W - 2 * PAD; }
function pctW(t, W) { return t.pct / 100 * baseW(t, W); }
function loW(t) { return t.role === 'gutter' ? 0 : t.floor; }
function capW(t, W) { return t.role === 'gutter' ? W - 2 * t.floor : W; }
function cwOf(t, W) { return Math.min(Math.max(pctW(t, W), loW(t)), capW(t, W)); }
function hitOf(t, W) {
  const raw = pctW(t, W), lo = loW(t), cap = capW(t, W);
  if (lo > cap) return 'cap';
  if (raw > cap) return t.role === 'gutter' ? 'gutter' : 'cap';
  if (lo > raw) return 'floor';
  return 'pct';
}
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
    var o = { block: d.dataset.block, cap: {}, pages: [], hub: null, poem: null };
    ['mSrc','mW','mH','mAvailW','mBaseW','mPct','mCwFormula','mCwHub','mCwPoem','mDelta','mLo','mRaw','mCap','mHit','mFlushCap','mGut','mColInAvail','mAvail','mCpl','mMaxLine','mWrapped','mFxLines','mNameX','mSeam','mMarkLeft','mAboutR','mTitleGap','mBodyGap','mFoot','mAlign','mTopL','mTopR','mEdge'].forEach(function(k){ o.cap[k] = capEl.dataset[k]; });
    var pgs = d.querySelectorAll('[data-test="page"]');
    for (var p=0;p<pgs.length;p++){
      var pg = pgs[p];
      var col = pg.querySelector('[data-test="col"]');
      var cr = R(col), pr = R(pg);
      var gs = pg.querySelectorAll('[data-test="guide"]');
      var gav = [], gcol = [];
      for (var q=0;q<gs.length;q++) (gs[q].dataset.kind === 'avail' ? gav : gcol).push(px(R(gs[q]).left));
      o.pages.push({ page: pg.dataset.page, colLeft: px(cr.left), colRight: px(cr.right), colW: px(cr.width),
        pageLeft: px(pr.left), pageW: px(pr.width),
        cwVar: px(parseFloat(getComputedStyle(pg).getPropertyValue('--cw'))),
        gAvail: gav, gCol: gcol });
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
        rowW: px(R(rw).width),
        titleLeft: px(R(pt).left), titleMaxLineW: textW(pt),
        badgeLeft: rw.querySelector('.fxbadge') ? px(R(rw.querySelector('.fxbadge')).left) : null,
        titleLineBoxes: pt.getClientRects().length,
        authorLeft: px(R(pa).left), authorRight: px(R(pa).right), authorTop: px(R(pa).top),
        titleTop: px(R(pt).top), titleBottom: px(R(pt).bottom) });
    }
    o.hub = { colLeft: px(hcr.left), colRight: px(hcr.right), colW: px(hcr.width),
      gnameLeft: px(gr.left), nameX: px(gr.left - hcr.left),
      gmarkLeft: px(mr.left), markLeftRel: px(mr.left - hcr.left), gmarkW: px(mr.width), seam: px(gr.left - mr.right),
      gmarkCenter: px((mr.top + mr.bottom) / 2), gnameCenter: px((gr.top + gr.bottom) / 2),
      gheadH: px(hr.height), gcountRight: px(hcr.right - gcr.right),
      aboutRight: px(hcr.right - ar.right),
      gheadTop: px(hr.top),
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
    var ls = [];
    for (var w2=0;w2<lines.length;w2++){
      var rr = R(lines[w2]);
      ls.push({ text: lines[w2].textContent, w: textW(lines[w2]), left: px(rr.left), top: px(rr.top),
        bottom: px(rr.bottom), h: px(rr.height) });
    }
    var bodyFont = cs(body, ['fontSize','lineHeight','letterSpacing','paddingTop','paddingLeft','paddingRight']);
    o.poem = { colLeft: px(pcr.left), colRight: px(pcr.right), colW: px(pcr.width),
      backLeft: px(br.left - pcr.left), detailRight: px(pcr.right - dr.right),
      backTop: px(br.top), detailTop: px(dr.top),
      titleLeft: px(tr.left - pcr.left), identLeft: px(ir.left - pcr.left),
      firstLineLeft: px(ls[0].left - pcr.left), firstLineTop: px(ls[0].top),
      lastLineBottom: px(ls[ls.length-1].bottom),
      titleGap: px(ir.top - tr.bottom),
      bodyGap: px(bor.top + parseFloat(bodyFont.paddingTop) - ir.bottom),
      footCount: poem.querySelectorAll('[data-test="foot"]').length,
      lines: ls, lineCount: ls.length,
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
  var padOuter = getComputedStyle(document.documentElement).getPropertyValue('--pad-outer').trim();
  return JSON.stringify({ innerW: window.innerWidth, innerH: window.innerHeight,
    docW: document.documentElement.scrollWidth, docH: document.documentElement.scrollHeight,
    bodyW: document.body.scrollWidth, maxRight: px(maxRight), maxRightEl: mrEl,
    minLeft: px(minLeft), minLeftEl: mlEl,
    padOuter: padOuter, padOuterAttr: document.documentElement.dataset.padOuter,
    tiersAttr: document.documentElement.dataset.tiers,
    shot: document.documentElement.dataset.shot === '1',
    deck: (function(){ var e = document.querySelector('[data-shotframe]'); if (!e) return null;
      var r = e.getBoundingClientRect(); return { x: px(r.left), y: px(r.top + window.scrollY), w: px(r.width), h: px(r.height) }; })(),
    bodyFontBag: (function(){ var e = document.querySelector('[data-page="poem"] [data-test="poem"]');
      return { f: e.style.fontSize || '', d: e.dataset.test }; })(),
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
    log('\n═══════════ [G] 全局：令牌快照 / 参数表 / 自包含 / 页面里写明的口径 ═══════════');
    const snapText = declarationBlock(htmlText, '== TOKEN-SNAPSHOT-BEGIN ==', '== TOKEN-SNAPSHOT-END ==');
    const draftText = declarationBlock(htmlText, '== DRAFT-VALUES-BEGIN ==', '== DRAFT-VALUES-END ==');
    const snap = snapText ? parseTokens(snapText) : new Map();
    const draft = draftText ? parseTokens(draftText) : new Map();
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
    check('快照里没有「声明了却没用」的令牌；页面里用到的每个 var() 都有声明（快照或草案块）',
      undeclared.length === 0 && unusedSnap.length === 0,
      `未声明=${JSON.stringify(undeclared)} 快照未用=${JSON.stringify(unusedSnap)}`);
    check('快照里**没有** --measure（＝本方向「不画上限」这条口径的机器可查形式）',
      !snap.has('--measure') && !usedVars.has('--measure') && htmlText.includes('本轮的「新方向」'),
      `快照含 --measure？${snap.has('--measure')}；页面用到？${usedVars.has('--measure')}`);
    const shaRecorded = (htmlText.match(/仓库提交：([0-9a-f]{7,40})/) || [])[1] || '(没记录)';
    check('页面记录了令牌快照的来源提交（短 sha）＋写明「权威仍是 docs/design/visual-tokens.md」',
      /^[0-9a-f]{7,40}$/.test(shaRecorded) && htmlText.includes('权威仍是 docs/design/visual-tokens.md'),
      `记录=${shaRecorded}（当前 HEAD=${gitHead}）`);
    check('页面里写明了八个覆盖视口（320/360/390/412/430/834/1180/740×360）',
      ['320', '360', '390', '412', '430', '834', '1180', '740×360'].every((s) => htmlText.includes(s)),
      '覆盖视口与图名在说明段落里写明');
    check('页面里写明了「诗页水平对齐尚未选定」这条限制（本轮用三块同一竖线，且它不是一个已选项）',
      htmlText.includes('诗页的「水平对齐」尚未选定') && htmlText.includes('不是一个已选项') && htmlText.includes('三块同一竖线'),
      '限制写在说明段落里，且写明本页用的是「三块同一竖线」基线');
    check('页面里写明了「选某一档 ≠ 采纳整页规格」与「本页不决定 JSON/MD 分界」',
      htmlText.includes('选某一档 ≠ 采纳整页规格') && htmlText.includes('本页不决定 JSON/MD 分界'),
      '两条口径都在说明段落里');
    check('页面里写明了「关于页／详情页本轮不含」',
      htmlText.includes('关于页／详情页的表达还没做 ⇒ 本轮不含'), '范围限制写明');
    check('参数表可解析、恰好四档、每档都在候选集合内（base/pct/role/floor）',
      TIERS.length === 4 && TIERS.every((t) => ['viewport', 'avail'].includes(t.base))
      && TIERS.every((t) => [88, 92, 100].includes(t.pct))
      && TIERS.every((t) => (t.role === 'content' ? [320, 360, 400].includes(t.floor) : [16, 24, 32, 40].includes(t.floor))),
      TIERS.map((t) => `${t.id}:${t.base}/${t.pct}%/${t.role}:${t.floor}`).join('  '));
    check('四档的「只改一条」关系成立：P2 只换基准、P3 只换下限角色、P4 只升数值',
      TIER.P2.base === 'avail' && TIER.P2.pct === TIER.P1.pct && TIER.P2.role === TIER.P1.role && TIER.P2.floor === TIER.P1.floor
      && TIER.P3.base === TIER.P1.base && TIER.P3.pct === TIER.P1.pct && TIER.P3.role === 'gutter' && TIER.P1.role === 'content'
      && TIER.P4.base === 'viewport' && TIER.P4.pct > TIER.P1.pct && TIER.P4.floor > TIER.P1.floor && TIER.P4.role === 'content',
      'P2 只换 base；P3 只换 role；P4 只升数值');
    check('页面写明了「下限＝最小内容宽」与「下限＝最小页边」的区别（含量纲不同、候选值不同）',
      htmlText.includes('最小内容宽') && htmlText.includes('最小页边')
      && htmlText.includes('不能混着比') && htmlText.includes('没有内容宽下限'),
      '两种角色、进入公式的位置、代价都写明');
    check('页面写明了「最小页边什么时候才真的咬」＝ 视口宽 &lt; 2m / (1 − 百分比)（可复算，不是看过就算）',
      htmlText.includes('2m / (1 − 百分比)') && htmlText.includes('666.7') && htmlText.includes('266.7'),
      '阈值公式 ＋ 两个候选值的阈值（40px⇒666.7px、16px⇒266.7px）都写明');
    check('页面写明了「两案在什么情况下给出不同结果」（外层页边＝0 则两案恒等；百分比命中时差 2×页边×百分比；下限命中时两案相同）',
      htmlText.includes('两案就<b>恒等</b>') && htmlText.includes('21.12px') && htmlText.includes('下限越大，两案越像'),
      '三条都写明');
    PAD = parseFloat(draft.get('--pad-outer') || '');
    check('外层页边（「可用宽」这一层）在草案块里声明为候选值，且是一个正数 px',
      Number.isFinite(PAD) && PAD > 0, `--pad-outer = ${draft.get('--pad-outer')} ⇒ ${PAD}`);

    /* ═══ 逐视口 ═════════════════════════════════════════════════ */
    const fontBag = [];    // [10] 字号不随宽度缩放
    const rowsOut = [];    // 给 .md 用的实测数字
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
      check(`documentElement.scrollWidth === body.scrollWidth === ${W}（没有横向溢出）`,
        M.docW === W && M.bodyW === W, `docScrollWidth=${M.docW} bodyScrollWidth=${M.bodyW}`);
      check(`所有可见元素都在 0…${W} 之内`,
        M.maxRight <= W + 0.5 && M.minLeft >= -0.5,
        `maxRight=${M.maxRight}(${M.maxRightEl}) minLeft=${M.minLeft}(${M.minLeftEl})`);
      check('页面声明的外层页边（--pad-outer）＝脚本从草案块读到的值',
        M.padOuter === `${PAD}px` && M.padOuterAttr === String(PAD),
        `页面计算值=${M.padOuter}／页面 data 属性=${M.padOuterAttr}／脚本从草案块读到=${PAD}px`);
      check('页面声明的档位清单与参数表一致', M.tiersAttr === ORDER.join(','), `data-tiers=${M.tiersAttr}`);

      // ---- [3][4] 公式复算 ＋ 留白 ----
      log('\n[3][4] 公式复算（脚本独立实现）× 实测 × 留白 × 溢出');
      const SHORT = HIT_NAME;
      const cwOk = [], hitOk = [], gutOk = [], noOverflowOk = [], availOk = [], deltaList = [];
      for (const t of TIERS) {
        const d = M.demos.filter((x) => x.block === t.id)[0];
        if (!d) { cwOk.push(false); hitOk.push(false); gutOk.push(false); noOverflowOk.push(false); availOk.push(false); continue; }
        const cw = cwOf(t, W), hit = hitOf(t, W);
        const hubPg = d.pages.find((x) => x.page === 'hub'), poemPg = d.pages.find((x) => x.page === 'poem');
        const dHub = r2(hubPg.colW - cw), dPoem = r2(poemPg.colW - cw);
        deltaList.push({ id: t.id, cw: r2(cw), measured: hubPg.colW, dHub, dPoem, hit });
        cwOk.push(Math.abs(hubPg.colW - cw) <= 0.6 && Math.abs(poemPg.colW - cw) <= 0.6
          && near(parseFloat(d.cap.mCwFormula), cw, 0.6)
          && near(parseFloat(d.cap.mCwHub), hubPg.colW, 0.6) && near(parseFloat(d.cap.mCwPoem), poemPg.colW, 0.6));
        hitOk.push(d.cap.mHit === hit && d.cap.mFlushCap === String(r2(cw) === W)
          && near(parseFloat(d.cap.mBaseW), baseW(t, W), 0.05)
          && near(parseFloat(d.cap.mRaw), pctW(t, W), 0.05)
          && near(parseFloat(d.cap.mLo), loW(t), 0.05)
          && near(parseFloat(d.cap.mCap), capW(t, W), 0.05));
        const gL = hubPg.colLeft, gR = W - hubPg.colRight, gpL = poemPg.colLeft, gpR = W - poemPg.colRight;
        gutOk.push(near(gL, (W - cw) / 2, 0.6) && near(gR, (W - cw) / 2, 0.6) && near(gL, gR, 0.05)
          && near(gpL, (W - cw) / 2, 0.6) && near(gpR, (W - cw) / 2, 0.6) && near(gpL, gpR, 0.05)
          && near(hubPg.colLeft, poemPg.colLeft, 0.05));
        noOverflowOk.push(cw <= W + 0.01 && hubPg.colRight <= W + 0.5 && hubPg.colLeft >= -0.5
          && d.pages.every((x) => near(x.pageLeft, 0, 0.6) && near(x.pageW, W, 0.6))
          && near(hubPg.colW, poemPg.colW, 0.05));
        const inAvail = (cw <= W - 2 * PAD + 0.01);
        availOk.push(d.cap.mColInAvail === String(inAvail)
          && (inAvail ? (hubPg.colLeft >= PAD - 0.6) : true));
        log(`      ${t.id}（基准=${t.base === 'viewport' ? '视口宽' : '可用宽 ' + r2(W - 2 * PAD)} · ${t.pct}% · ${t.role === 'content' ? '下限 ' + t.floor + 'px＝最小内容宽' : '下限 ' + t.floor + 'px＝最小页边'}）`);
        log(`            公式: clamp(${r2(loW(t))}, ${t.pct}%×${r2(baseW(t, W))}, ${r2(capW(t, W))}) = ${r2(cw)}`);
        log(`            实测: 目录页 ${hubPg.colW}／诗页 ${poemPg.colW}　⇒ 复算−实测 = ${dHub}／${dPoem}px`);
        log(`            留白: ${r2(gL)} ＋ ${r2(gR)}（左右相等：${near(gL, gR, 0.01)}）　命中: ${SHORT[d.cap.mHit] || d.cap.mHit}（脚本独立算：${SHORT[hit]}）　命中封顶是否贴屏边: ${d.cap.mFlushCap}`);
        log(`            内容列待在「可用宽」这一层里？（可用宽=${r2(W - 2 * PAD)}）：页面说 ${d.cap.mColInAvail}／脚本算 ${inAvail}`);
      }
      check(`每一档的**实测内容宽 ＝ 脚本独立复算的公式值**（±0.6px；目录页与诗页都比）`,
        cwOk.every(Boolean),
        deltaList.map((x) => `${x.id}: 复算 ${x.cw} vs 实测 ${x.measured}（Δ ${x.dHub}）`).join('　｜　'));
      check('每一档的「命中项」（百分比／下限／视口封顶）与脚本按判据独立算的**完全一致**，基准值／百分比项／下界／上界也都一致',
        hitOk.every(Boolean),
        TIERS.map((t) => `${t.id}:${SHORT[M.demos.filter((x) => x.block === t.id)[0].cap.mHit] || '?'}(贴边 ${M.demos.filter((x) => x.block === t.id)[0].cap.mFlushCap})`).join(' '));
      check('两侧留白 ＝(视口宽−内容宽)/2 且左右相等；目录页与诗页的左沿一致（±0.6px）',
        gutOk.every(Boolean), TIERS.map((t) => {
          const d = M.demos.filter((x) => x.block === t.id)[0];
          const cw = cwOf(t, W);
          return `${t.id}: hub ${d.pages[0].colLeft}/${d.pages[0].colRight} poem ${d.pages[1].colLeft}/${d.pages[1].colRight} 期望留白 ${r2((W - cw) / 2)}`;
        }).join(' ｜ '));
      check(`**永不横向溢出**：每档内容宽 ≤ 视口宽 ${W}；每个「应用页面」本身就展满视口宽；两页内容宽相同`,
        noOverflowOk.every(Boolean),
        TIERS.map((t) => {
          const d = M.demos.filter((x) => x.block === t.id)[0];
          return `${t.id}:${d.pages[0].colW}/${d.pages[1].colW}`;
        }).join(' '));
      check('「内容列是否整个待在可用宽这一层里」页面自报 ＝ 公式推算（内容宽 ≤ 可用宽 才为「是」）',
        availOk.every(Boolean),
        TIERS.map((t) => `${t.id}:${M.demos.filter((x) => x.block === t.id)[0].cap.mColInAvail}`).join(' '));

      // ---- [5] 两案差别：基准＝视口宽 vs 基准＝可用宽 ----
      log('\n[5] 「两案」在什么情况下给出不同结果（P1 基准＝视口宽 vs P2 基准＝可用宽）');
      {
        const t1 = TIER.P1, t2 = TIER.P2;
        const cw1 = cwOf(t1, W), cw2 = cwOf(t2, W);
        const h1 = hitOf(t1, W), h2 = hitOf(t2, W);
        const expectDiff = (h1 === 'pct' && h2 === 'pct') ? 2 * PAD * (t1.pct / 100) : 0;
        const actualDiff = r2(Math.abs(cw1 - cw2));
        check(`P1 与 P2 的内容宽之差 ＝ ${expectDiff === 0 ? '0（因为至少一档命中的不是「百分比」⇒ 两案被同一条线压平）' : r2(expectDiff) + 'px（＝2×' + PAD + '×' + t1.pct + '%）'}`,
          near(actualDiff, expectDiff, 0.01),
          `P1 命中 ${SHORT[h1]}（${r2(cw1)}）／P2 命中 ${SHORT[h2]}（${r2(cw2)}）⇒ 实测差 ${actualDiff}，按公式应为 ${r2(expectDiff)}`);
      }

      // ---- [6] 下限角色：最小内容宽 vs 最小页边 ----
      log('\n[6] 同一个 clamp 的两种「下限角色」（P1 最小内容宽 320px vs P3 最小页边 40px）');
      {
        const m = TIER.P3.floor;
        const a = cwOf(TIER.P1, W), b = cwOf(TIER.P3, W);
        const thresh = 2 * m / (1 - TIER.P3.pct / 100);
        const shouldBite = W < thresh;
        const h3 = hitOf(TIER.P3, W);
        log(`      P1（下界＝320）→ 内容宽 ${r2(a)}，页边 ${r2((W - a) / 2)}　｜　P3（上界＝W−${2 * m}）→ 内容宽 ${r2(b)}，页边 ${r2((W - b) / 2)}`);
        log(`      「最小页边 ${m}px」的生效阈值 2m/(1−${TIER.P3.pct}%) = ${r2(thresh)}px ⇒ 本视口 ${W} ${shouldBite ? '应生效' : '不应生效'}；页面自报命中＝${HIT_NAME[h3]}`);
        check(`「最小页边 m」的生效条件 W &lt; 2m/(1−百分比)（这里＝${r2(thresh)}px）与实测命中项一致；内容宽＝min(百分比×W, W−2m)`,
          (h3 === 'gutter') === shouldBite && near(b, Math.min(TIER.P3.pct / 100 * W, W - 2 * m), 0.01),
          `命中 ${HIT_NAME[h3]}；内容宽 ${r2(b)}＝min(${r2(TIER.P3.pct / 100 * W)}, ${r2(W - 2 * m)})`);
        if (W <= 360) {
          check('小屏（≤360）上两种角色的取向**相反**：P1 保住内容宽（页边被压到 0／20px）、P3 保住页边 40px（内容宽被压到 240／280px）',
            a >= 320 - 0.01 && (W - a) / 2 <= 20.01 && near((W - b) / 2, m, 0.01) && b < a,
            `P1 内容宽 ${r2(a)}／页边 ${r2((W - a) / 2)}　P3 内容宽 ${r2(b)}／页边 ${r2((W - b) / 2)}　差 ${r2(a - b)}px`);
        } else {
          check('屏幕变宽后「最小页边」不再咬（超出生效阈值）⇒ P3 退回成纯百分比（＝88%×W）',
            shouldBite || near(b, 0.88 * W, 0.01),
            `本视口 ${W} ${shouldBite ? '仍在阈值内（上界生效）' : '已超出阈值'}；P3 内容宽 ${r2(b)}，88%×W=${r2(0.88 * W)}`);
        }
      }

      // ---- [7] 窄屏封顶 ----
      log('\n[7] 窄屏封顶（「下限」超过视口可用宽时必须被截住）');
      if (W <= 320) {
        const d = M.demos.filter((x) => x.block === 'P4')[0];
        const cw = cwOf(TIER.P4, W);
        check(`320 下 P4（下限 400 &gt; 视口 320）必须命中「视口封顶」、内容宽 ＝ 视口宽、不溢出`,
          d.cap.mHit === 'cap' && near(cw, W, 0.01) && near(d.pages[0].colW, W, 0.6)
          && d.pages.every((x) => x.colRight <= W + 0.5 && x.colLeft >= -0.5)
          && M.docW === W,
          `命中 ${SHORT[d.cap.mHit]}｜公式 ${r2(cw)}｜实测 ${d.pages[0].colW}｜docW ${M.docW}｜左右沿 ${d.pages[0].colLeft}…${d.pages[0].colRight}`);
        check('320 下 P1（下限 320 ＝视口宽）恰好贴到屏边而不越界：内容宽 320、页边 0、不溢出',
          near(cwOf(TIER.P1, W), W, 0.01) && near(M.demos.filter((x) => x.block === 'P1')[0].pages[0].colW, W, 0.6)
          && near(M.demos.filter((x) => x.block === 'P1')[0].pages[0].colLeft, 0, 0.6),
          `内容宽 ${M.demos.filter((x) => x.block === 'P1')[0].pages[0].colW}／左留白 ${M.demos.filter((x) => x.block === 'P1')[0].pages[0].colLeft}`);
        check('320 下 P3（下限＝最小页边 40）反而把内容宽收到 240（稳稳保住两边各 40px 页边）—— 两种角色在最小屏上分开得最开',
          near(cwOf(TIER.P3, W), 240, 0.01) && near((W - cwOf(TIER.P3, W)) / 2, 40, 0.01),
          `公式 ${r2(cwOf(TIER.P3, W))}（页边 ${r2((W - cwOf(TIER.P3, W)) / 2)}），实测 ${M.demos.filter((x) => x.block === 'P3')[0].pages[0].colW}`);
      } else {
        const capped = ORDER.filter((b) => hitOf(TIER[b], W) === 'cap');
        check('本视口下「封顶」只在有档被截时出现；出现则必须内容宽 ＝ 上界且不溢出',
          capped.every((b) => near(cwOf(TIER[b], W), capW(TIER[b], W), 0.01)),
          capped.length ? capped.map((b) => `${b}:${r2(cwOf(TIER[b], W))}=上界${r2(capW(TIER[b], W))}`).join(' ') : '（本视口没有档被截 ⇒ 上界都没生效）');
      }

      // ---- [11] 正文行长 ----
      log('\n[11] 正文行长（8 行真实原文）——「内容宽」够不够放下一行 12 字的诗行');
      const textOk = [], lineOk = [], foldOk = [];
      for (const t of TIERS) {
        const d = M.demos.filter((x) => x.block === t.id)[0];
        const P = d.poem, cw = cwOf(t, W), edge = parseFloat(P.bodyFont.paddingLeft);
        const avail = cw - 2 * edge;
        textOk.push(P.lines.map((l) => l.text).join('\n') === mdFlat.join('\n'));
        lineOk.push(P.lineCount === 8 && P.lines.every((l) => l.w <= avail + 0.6)
          && near(parseFloat(d.cap.mAvail), avail, 0.6) && near(parseFloat(d.cap.mEdge), edge, 0.05)
          && near(parseFloat(d.cap.mWrapped), P.wrappedLines, 0.01));
        foldOk.push((P.wrappedLines > 0) === (avail < 213.19 - 0.6));
        log(`      ${t.id}：${P.lineCount} 行 / 折行 ${P.wrappedLines} 行｜正文可用宽 ${r2(avail)}（＝内容宽 ${r2(cw)} − 2×${edge}）｜最长一行文字宽 ${r2(P.maxLine)}` +
          `｜${P.wrappedLines ? '⚠ 放不下 12 字的诗行 ⇒ 折行' : '12 字的诗行放得下'}｜夹具行长题名折 ${d.cap.mFxLines} 行`);
      }
      check('原文恰好 8 行、**逐行与 content/poems/gushi-shijiu-shou-01.md 的正文逐字相同**（每档都查）',
        textOk.every(Boolean), `${TIERS.length} 档全部＝源文件`);
      check('8 行都在、每行都放得进「内容宽 − 2×行内沿」、页面自报折行数 ＝ 实测折行数（每档都查）',
        lineOk.every(Boolean), TIERS.map((t) => {
          const d = M.demos.filter((x) => x.block === t.id)[0];
          return `${t.id}:可用 ${r2(cwOf(t, W) - 2 * 16.8)}/折 ${d.poem.wrappedLines}`;
        }).join(' '));
      check('**正文是否折行 ⟺ 正文可用宽 &lt; 最长一行（213.19px）**：逐档对上（把「宽度 ⇒ 阅读后果」钉成可复算的关系）',
        foldOk.every(Boolean), TIERS.map((t) => {
          const d = M.demos.filter((x) => x.block === t.id)[0];
          const avail = cwOf(t, W) - 2 * 16.8;
          return `${t.id}:可用 ${r2(avail)} ${avail < 213.19 ? '<' : '≥'} 213.19 ⇒ 折 ${d.poem.wrappedLines} 行`;
        }).join(' ｜ '));
      check('最长一行的文字宽：未折行时 ＝ 12 字 ×（17px＋0.045em）＝213.19px（±2px）；折行时必然比它更小',
        TIERS.every((t) => {
          const P = M.demos.filter((x) => x.block === t.id)[0].poem;
          return P.wrappedLines === 0 ? near(P.maxLine, 213.19, 2) : P.maxLine < 213.19;
        }),
        TIERS.map((t) => { const P = M.demos.filter((x) => x.block === t.id)[0].poem; return `${t.id}:${r2(P.maxLine)}${P.wrappedLines ? '(折)' : ''}`; }).join(' '));

      // ---- [12] 页面自报 ＝ 脚本实测 ----
      log('\n[12] 页面自报数字 ＝ 脚本独立实测（±0.6px）');
      const selfBad = [];
      for (const t of TIERS) {
        const d = M.demos.filter((x) => x.block === t.id)[0];
        const c = d.cap, P = d.poem, Hh = d.hub, cw = cwOf(t, W);
        const pairs = [
          ['内容宽(目录页)', parseFloat(c.mCwHub), d.pages[0].colW],
          ['内容宽(诗页)', parseFloat(c.mCwPoem), d.pages[1].colW],
          ['公式复算', parseFloat(c.mCwFormula), cw],
          ['基准值', parseFloat(c.mBaseW), baseW(t, W)],
          ['百分比项', parseFloat(c.mRaw), pctW(t, W)],
          ['下界', parseFloat(c.mLo), loW(t)],
          ['上界', parseFloat(c.mCap), capW(t, W)],
          ['可用宽', parseFloat(c.mAvailW), W - 2 * PAD],
          ['左留白', parseFloat(c.mGut), d.pages[0].colLeft],
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
        ];
        pairs.forEach(([k, a, b]) => {
          if (!(Math.abs(a - b) <= 0.6)) selfBad.push(`${t.id}/${k}: 页面 ${a} vs 实测 ${r2(b)}`);
        });
        log(`      ${t.id}（data-m-src=${c.mSrc}）：${pairs.map(([k, a, b]) => `${k} ${a}≈${r2(b)}`).join(' ')}`);
      }
      check(`页面自报的每一格数字都与脚本实测一致（${selfBad.length} 处不一致，要求 0）`,
        selfBad.length === 0, selfBad.length ? selfBad.join(' | ') : '19 项 × 4 档 全部一致');
      check('自报数字标明了来源（本轮四档全部照实渲染 ⇒ 应全部是实测 dom，没有「按规则推算」冒充实测）',
        M.demos.every((d) => d.cap.mSrc === 'dom'), M.demos.map((d) => `${d.block}:${d.cap.mSrc}`).join(' '));

      // ---- [8][9] 已定关系（展开后）＋ [13] 交互 ----
      log('\n[13] 目录页交互（真鼠标）：首态全收起 ⇒ 展开 ⇒ 再收起');
      check('首态：**全部收起**（aria-expanded=false、诗目列表 hidden、可见诗目 0 行）',
        M.demos.every((d) => d.hub.gheadExpanded === 'false' && d.hub.listHidden === true && d.hub.visibleRows === 0),
        M.demos.map((d) => `${d.block}:${d.hub.gheadExpanded}/${d.hub.listHidden}/${d.hub.visibleRows}`).join(' '));
      check('组头是 <button type="button"> ＋ aria-expanded（不是 div 冒充）',
        M.demos.every((d) => d.hub.gheadTag === 'BUTTON' && d.hub.gheadType === 'button'),
        M.demos.map((d) => `${d.block}:${d.hub.gheadTag}/${d.hub.gheadType}`).join(' '));
      const clickRes = [];
      for (const t of TIERS) clickRes.push(await clickGhead(t.id));
      M = await measure();
      check('真鼠标点组头 ⇒ 展开（aria-expanded=true、可见 20 行 ＝ 19 首 ＋ 1 条夹具行、记号变 [−]）',
        clickRes.every((c) => c.hitIsE) && M.demos.every((d) => d.hub.gheadExpanded === 'true' && d.hub.visibleRows === 20 && d.hub.markText === '[\u2212]'),
        clickRes.map((c, i) => `${TIERS[i].id}:命中${c.hitIsE ? '自身' : c.hitTag}`).join(' ') + ' ｜ ' + M.demos.map((d) => `${d.block}:${d.hub.visibleRows}行`).join(' '));

      log('\n[8] 已定的目录页关系（展开后逐行实测）：记号悬挂／缝 0.4rem／竖直居中／缩进 0／作者紧随／「关于」');
      {
        const markOk = [], vertOk = [], indentOk = [], authorOk = [], aboutOk = [], padOk = [];
        for (const t of TIERS) {
          const d = M.demos.filter((x) => x.block === t.id)[0];
          const edge = parseFloat(d.poem.bodyFont.paddingLeft);
          markOk.push(near(d.hub.markLeftRel, 0, 0.6) && near(d.hub.seam, 6.4, 0.6));
          vertOk.push(near(d.hub.gmarkCenter, d.hub.gnameCenter, 1.0));
          const short = d.hub.rows.filter((r) => r.visible && !r.fx);
          const fx = d.hub.rows.filter((r) => r.visible && r.fx)[0];
          indentOk.push(short.length === 19 && short.every((r) => near(r.titleLeft, d.hub.gnameLeft, 1))
            // 夹具行题名会折行 ⇒ 用行首那个单行小标（.fxbadge）的左沿当「文字起点」
            && near(fx.badgeLeft, d.hub.gnameLeft, 1));
          authorOk.push(short.every((r) => near(r.authorLeft - (r.titleLeft + r.titleMaxLineW), 5.76, 1.5)
            && (d.hub.colRight - edge - r.authorRight) > 50));
          aboutOk.push(near(d.hub.aboutRight, edge, 0.6) && d.hub.rows.length === 20);
          padOk.push(d.hub.rows.filter((r) => r.visible).every((r) => near(r.plinkPadLeft, d.hub.nameX, 0.01) && near(r.plinkPadRight, edge, 0.01)));
          log(`      ${t.id}：记号左沿 ${d.hub.markLeftRel}（列左沿 0）· 槽 ${r2(d.hub.markLeftRel + d.hub.gmarkW + d.hub.seam)} · 缝 ${d.hub.seam}` +
            `｜竖直：记号盒中心 ${d.hub.gmarkCenter} vs 组名盒中心 ${d.hub.gnameCenter}（差 ${r2(Math.abs(d.hub.gmarkCenter - d.hub.gnameCenter))}）` +
            `｜组名左沿 ${d.hub.gnameLeft}＝题名左沿｜「关于」右沿距列右沿 ${d.hub.aboutRight}`);
          log(`        19 条真实诗目逐条：左沿 ${uniq(short.map((r) => r.titleLeft)).join('/')}；作者距题名末端 ${uniq(short.map((r) => r2(r.authorLeft - r.titleLeft - r.titleMaxLineW))).join('/')}`);
          log(`        夹具行（行首有「夹具行」小标）：小标左沿 ${fx.badgeLeft} vs 组名左沿 ${d.hub.gnameLeft}（列宽 ${d.hub.colW}）⇒ 折 ${fx.titleLineBoxes} 行`);
        }
        check('记号在列左沿之外的槽里（记号左沿＝列左沿）、缝＝0.4rem（±0.6px）', markOk.every(Boolean), TIERS.map((t) => M.demos.filter((x) => x.block === t.id)[0].hub.markLeftRel + '/' + M.demos.filter((x) => x.block === t.id)[0].hub.seam).join(' '));
        check('记号与组名首字**竖直居中**对齐（两个排版盒的中心差 ≤1px）', vertOk.every(Boolean), TIERS.map((t) => 'Δ' + r2(Math.abs(M.demos.filter((x) => x.block === t.id)[0].hub.gmarkCenter - M.demos.filter((x) => x.block === t.id)[0].hub.gnameCenter))).join(' '));
        check('20 行（19 首＋夹具行）**逐条**：题名左沿＝组名左沿（缩进 0，±1px；夹具行看行首小标）', indentOk.every(Boolean), TIERS.map((t) => M.demos.filter((x) => x.block === t.id)[0].hub.nameX).join(' '));
        check('作者紧随题名、不右对齐（距题名末端 ≈0.45em＝5.76px；且离列右内沿很远）', authorOk.every(Boolean), '4 档 × 19 行');
        check('「关于」在第一个组头之上，且右沿＝列右沿−行内沿', aboutOk.every(Boolean), TIERS.map((t) => M.demos.filter((x) => x.block === t.id)[0].hub.aboutRight).join(' '));
        check('行内沿是**内容列内**的一层：诗目左内沿＝组名左沿、右内沿＝列右沿−行内沿', padOk.every(Boolean), '全部 20 行 × 4 档');
      }

      log('\n[9] 已定的诗页关系：三块同一竖线／间距／返回与详情同一行／没有页脚行');
      {
        const alignOk = [], gapOk = [], topOk = [], footOk = [];
        for (const t of TIERS) {
          const d = M.demos.filter((x) => x.block === t.id)[0];
          const P = d.poem, edge = parseFloat(P.bodyFont.paddingLeft);
          alignOk.push(near(P.titleLeft, P.identLeft, 0.6) && near(P.titleLeft, P.firstLineLeft, 0.6) && near(P.titleLeft, edge, 0.6));
          gapOk.push(near(P.titleGap, 11.2, 1.0) && near(P.bodyGap, 33.6, 1.0));
          topOk.push(near(P.backTop, P.detailTop, 1.0) && P.backTop < P.firstLineTop && near(P.backLeft, edge, 0.6) && near(P.detailRight, edge, 0.6));
          footOk.push(P.footCount === 0);
          log(`      ${t.id}：题名/身份/正文左沿 ${P.titleLeft}／${P.identLeft}／${P.firstLineLeft}（行内沿 ${edge}）｜题名→身份 ${P.titleGap}、身份→原文 ${P.bodyGap}｜返回 +${P.backLeft} 与详情 −${P.detailRight} 同一行（顶差 ${r2(Math.abs(P.backTop - P.detailTop))}）｜页脚行 ${P.footCount} 个`);
        }
        check('诗页 题名／身份行／正文 三块同一竖线（＝列左沿＋行内沿；本页用的是这条基线，**不是**已选项）', alignOk.every(Boolean), TIERS.map((t) => M.demos.filter((x) => x.block === t.id)[0].cap.mAlign).join(' ｜ '));
        check('题名→身份 0.7rem（11.2px）、身份→原文 2.1rem（33.6px）（±1px；本轮**不**随宽度变）', gapOk.every(Boolean), TIERS.map((t) => { const p = M.demos.filter((x) => x.block === t.id)[0].poem; return p.titleGap + '/' + p.bodyGap; }).join(' '));
        check('返回与详情**同在顶部一行**的两端，且都在正文之上', topOk.every(Boolean), TIERS.map((t) => 'Δ' + r2(Math.abs(M.demos.filter((x) => x.block === t.id)[0].poem.backTop - M.demos.filter((x) => x.block === t.id)[0].poem.detailTop))).join(' '));
        check('诗页正文之后**没有**页脚行（本轮已定）', footOk.every(Boolean), '诗页内 [data-test="foot"] 计数为 0');
      }

      // ---- [13] 展开后无横向溢出 ----
      log('\n[13] 展开 20 行之后重查一次「无横向溢出」（每个视口都查）');
      check(`展开后：scrollWidth 仍 === ${W}，所有可见元素仍在 0…${W} 内`,
        M.docW === W && M.bodyW === W && M.maxRight <= W + 0.5 && M.minLeft >= -0.5,
        `docW=${M.docW} bodyW=${M.bodyW} maxRight=${M.maxRight}(${M.maxRightEl}) minLeft=${M.minLeft}(${M.minLeftEl})`);
      check('展开后每档的内容宽／留白／正中都与收起时逐一相同（展开只改行数，不改宽度行为）',
        TIERS.every((t) => {
          const d = M.demos.filter((x) => x.block === t.id)[0];
          return near(d.pages[0].colW, cwOf(t, W), 0.6) && near(d.pages[0].colLeft, (W - cwOf(t, W)) / 2, 0.6);
        }), '4 档逐一比对');

      // ---- [10] 字号不缩放（收数据） ----
      {
        const d0 = M.demos[0];
        fontBag.push({
          w: W,
          title: JSON.stringify(d0.poem.fonts.title),
          ident: JSON.stringify(d0.poem.fonts.ident),
          line: JSON.stringify({ f: d0.poem.bodyFont.fontSize, l: d0.poem.bodyFont.lineHeight, s: d0.poem.bodyFont.letterSpacing }),
          ctl: JSON.stringify(d0.poem.fonts.ctl),
          ...Object.fromEntries(['ptitle', 'pauthor', 'gname', 'gmark', 'gcount', 'about'].map((k) => [k, JSON.stringify(d0.hub.font[k])])),
        });
      }
      check('正文 = 17px／行高 34px／字距 0.765px（这套视觉的核心，本轮**任何视口都不缩放**）',
        d0check(M).f === '17px' && d0check(M).l === '34px' && d0check(M).s === '0.765px',
        `${d0check(M).f}/${d0check(M).l}/${d0check(M).s}`);
      check('题名 = 24px、身份行 = 12.48px（任何视口都不缩放）',
        M.demos[0].poem.fonts.title.fontSize === '24px' && M.demos[0].poem.fonts.ident.fontSize === '12.48px',
        `题名 ${M.demos[0].poem.fonts.title.fontSize}／身份 ${M.demos[0].poem.fonts.ident.fontSize}`);

      // ---- 收起（截图前保持展开；见 [15] 会重新点开） ----
      const backC = await clickGhead(TIERS[0].id);
      let M2 = await measure();
      check('再点一次 ⇒ 该组收起（aria-expanded=false、可见诗目 0 行、记号回到 [+]）',
        backC.hitIsE && M2.demos[0].hub.visibleRows === 0 && M2.demos[0].hub.markText === '[+]',
        `${TIERS[0].id} 收起后可见 ${M2.demos[0].hub.visibleRows} 行`);

      rowsOut.push({
        key: C.key, w: W, h: H, label: C.label, docW: M.docW, docH: M.docH,
        availW: r2(W - 2 * PAD),
        tiers: TIERS.map((t) => {
          const d = M2.demos.filter((x) => x.block === t.id)[0];
          const cw = cwOf(t, W);
          return {
            id: t.id, base: t.base, pct: t.pct, role: t.role, floor: t.floor,
            cw: r2(cw), measured: d.pages[0].colW, delta: r2(d.pages[0].colW - cw),
            gut: r2((W - cw) / 2), hit: hitOf(t, W), flush: r2(cw) === W,
            inAvail: cw <= W - 2 * PAD + 0.01,
            avail: r2(cw - 2 * 16.8), maxLine: r2(d.poem.maxLine), bodyWrapped: d.poem.wrappedLines,
            fxLines: d.hub.rows.filter((r) => r.visible && r.fx)[0] ? d.hub.rows.filter((r) => r.visible && r.fx)[0].titleLineBoxes : (Number(d.cap.mFxLines) || null),
            overflow: d.pages.every((x) => x.colRight <= W + 0.5),
          };
        }),
      });

      // ---- [15][16] 看图态 + PNG ----
      if (!SHOT) { log('\n[15][16] 已跳过（--no-shot）：不查看图态、不重出 PNG'); continue; }
      await send('Page.navigate', { url: 'about:blank' });
      await sleep(150);
      await load(url + '#shot', W, H, C.mobile);
      let S = await measure();
      log('\n[15] 看图态（#shot）：不改变任何排布规则，且首态仍全收起');
      check('#shot 下首态仍是**全部收起**（图里的展开态是点出来的）',
        S.demos.every((d) => d.hub.gheadExpanded === 'false' && d.hub.visibleRows === 0),
        S.demos.map((d) => `${d.block}:${d.hub.gheadExpanded}`).join(' '));
      for (const t of TIERS) await clickGhead(t.id);
      const S2 = await measure();
      const diff = [];
      S2.demos.forEach((d) => {
        const cw = cwOf(TIER[d.block], W);
        if (!near(d.pages[0].colW, cw, 0.6)) diff.push(`${d.block}: 列宽 ${d.pages[0].colW} ≠ ${r2(cw)}`);
        if (!near(d.pages[0].colLeft, (W - cw) / 2, 0.6)) diff.push(`${d.block}: 留白 ${d.pages[0].colLeft}`);
        if (!near(d.poem.titleLeft, 16.8, 0.6)) diff.push(`${d.block}: 诗页内沿 ${d.poem.titleLeft}`);
      });
      check('#shot 下排布数字与普通态逐一相同（四档的内容宽／留白／诗页内沿都没变）',
        diff.length === 0, diff.length ? diff.join(' | ') : '4 档全部一致');
      check('图中每块目录页只显示前 3 行（1 条夹具行 ＋ 2 条真实行）＋ 1 条青色说明条',
        S2.demos.every((d) => d.hub.visibleRows === 3 && d.hub.rows.filter((r) => r.visible)[0].fx === true),
        S2.demos.map((d) => `${d.block}:${d.hub.visibleRows} 行`).join(' '));
      check(`#shot 下仍无横向溢出（scrollWidth === ${W}）`,
        S2.docW === W && S2.maxRight <= W + 0.5 && S2.minLeft >= -0.5,
        `docW=${S2.docW} maxRight=${S2.maxRight} docH=${S2.docH}`);
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
      log('\n═══════════ [16] 图清单 ═══════════');
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

    /* ── 给 .md 用的一张表（直接打印） ── */
    log('\n═══════════ 实测数字汇总（可直接抄进 q-width-pct.md）═══════════');
    log('  视口 | 可用宽 | 档 | 公式内容宽 | 实测 | Δ | 留白 | 命中 | 贴视口边 | 在可用宽内 | 正文可用宽 | 正文折行 | 最长行 | 夹具折行 | 溢出');
    rowsOut.forEach((r) => {
      r.tiers.forEach((b) => {
        log(`  ${r.key}(${r.w}×${r.h}) | ${r.availW} | ${b.id} | ${b.cw} | ${b.measured} | ${b.delta} | ${b.gut} | ${HIT_NAME[b.hit]} | ${b.flush ? '是' : '否'} | ${b.inAvail ? '是' : '否'} | ${b.avail} | ${b.bodyWrapped} 行 | ${b.maxLine} | ${b.fxLines} | ${b.overflow ? '无' : '⚠有'}`);
      });
    });

    ws.close();
  } finally {
    chrome.kill();
    await sleep(300);
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* 临时 profile 删不掉不影响结果 */ }
  }
}

function d0check(M) {
  const b = M.demos[0].poem.bodyFont;
  return { f: b.fontSize, l: b.lineHeight, s: b.letterSpacing };
}

try {
  await run();
} catch (e) {
  console.error('\n校验脚本失败：' + ((e && e.stack) || e));
  failures += 1;
}
console.log(`\n===== 失败断言数：${failures} =====`);
process.exit(failures ? 1 : 0);
