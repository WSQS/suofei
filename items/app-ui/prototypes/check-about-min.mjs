/*
 * check-about-min.mjs —— 「关于页 · 整页共用横向对齐线」原型（q-about-min.html）的自证脚本（可复跑）。
 *
 * ⚠ 它验的是**这一个原型页面**，**不是产品代码**：
 *   对象只有本目录下的 q-about-min.html（**只读打开**：Page.navigate 到 file:// URL；脚本不写、不改它）。
 *   额外读的文件只有两个，都是**只读**：
 *     ① prototype/css/theme-tech.css —— 逐项比对页面内嵌的令牌快照，并用 git hash-object 核它的 blob；
 *     ② git 仓库本身 —— 只为取 theme-tech.css 的 blob 哈希（不 commit、不 push、不 tag）。
 *
 * 断言清单（失败任一即 exit 1）：
 *  [G] 静态（不开浏览器）：令牌快照逐项比对（值不一致 0／缺失 0／无「声明了却没用」）；blob ＝ git hash-object；
 *      页面上逐条写明已定项（A3 次序／仓库完整 URL 无提示／宽度口径与「24 是一次性扣除总量」／更新处无框／
 *      单按钮＋label／初态不显示状态文本／**本轮范围＝整页共用横向对齐线**／**不把标签值改成两行**／
 *      **三格并列、不排序、不写推荐、不替用户选**／只做内容更新／「来源」不画）；自包含（无 link／script src／
 *      @import／url(http／fetch(／XMLHttpRequest／内联 onclick）；无 @keyframes／animation；无 box-shadow 声明。
 *  [V] 每个视口（320／430／1180）：视口宽与 docW／bodyW／visualViewport 一致；**每块恰＝视口宽、块左沿 0**；
 *      内容列宽＝公式复算；列外余白；行内沿 16.8px；无横向溢出（默认态＋六个状态各一遍）；可点元素只有
 *      <a href>／<button type=button>；每块都有 应用名／版本组（无来源）／按钮（＋状态 label）／仓库完整 URL 置底；
 *      **去框**（扫内容列这一层、排除按钮子树：边框／底色／阴影／圆角／标题／<hr>／上下分隔线／来源 全 0）；
 *      **父级＝内容列 .col**；**间距**（版本组→按钮 14.4、按钮→文本 8、文本→仓库 14.4；初态：按钮→仓库 14.4）。
 *  [L] **整页横向对齐线（本轮核心）** —— 逐格逐条量，并断言每格的「共用线」：
 *      · 三条线：**内容左沿**（edge-x 16.8）／**标签文字墨迹**（左沿、右沿）／**值列左沿**（edge-x＋5.2em＋0.5rem ＝ 93.02）；
 *      · **V1 现状基线**：标签**右对齐**（标签文字左沿 ＝ 16.8＋14.68 ＝ 31.48，不在内容左沿上）；
 *        按钮外沿 ＝ 状态 label 墨迹 ＝ **内容左沿 16.8**（＋/−0.05）⇒ 与「内容左沿」共用；与值列差 −76.22；
 *      · **V2 控件贴值列**：版本组与 V1 **逐项相同**（标签左沿 31.48／右沿 85.02／值 93.02）；
 *        按钮外沿 ＝ 状态 label 墨迹 ＝ **值列 93.02** ⇒ 与「值列」共用；离内容左沿 +76.22；
 *        状态 label 盒宽被压窄 ＝ C − (edge-x ＋ 5.2em ＋ 0.5rem ＋ edge-x) —— 430：247.45（V1 是 323.67）；
 *      · **V3 标签左对齐**：标签文字**左沿 ＝ 16.8 ＝ 内容左沿**；按钮外沿 ＝ 状态 label 墨迹 ＝ 16.8
 *        ⇒ **标签文字／内容左沿／按钮外沿／状态 label 四条线合一**；且标签文字右沿 ≤ 标签列右沿（不压到值列）；
 *      · 三格的**值列 x 完全相同**（版本组结构没变）、**标签右对齐/左对齐只差在标签本身**；
 *      · **状态 label 第二行左沿 ＝ 第一行左沿**（有第二行时；2 行只出现在 320／430 的「已切换生效」）；
 *      · **对齐线与状态无关**：切到六个状态中的任何一个，每格的按钮外沿／状态 label 墨迹 x **不变**（初态没有 label）；
 *      · 页面自己量的一份（window.__ABOUT_MIN__.measured）与脚本独立量的一份**逐格一致**（±0.05px）。
 *  [T] 状态（**逐字**）：六个状态的文案与脚本独立期望逐字比对（页面导出 ＋ DOM 渲染）；**检查中 ⇒ 按钮 disabled**；
 *      **初态不生成状态文本元素**（存在性＋可见性断言）——三格都查。
 *  [P] PNG：先**量高度**，超 Chromium 截图上限（约 16000 像素高）就**如实报错、不落盘、不假装拍到**；
 *      在限内则写 q-about-min.430.png（320／1180 只在 --all-shots 下写）：像素宽 ＝ 视口宽×2、
 *      高 ＝ 截图区 CSS 高×2（自己解析 PNG 头）、文件非空；截图区左沿 0、宽＝视口宽。
 *  [S] 边界自证：`CHROME_BIN` 指到不存在的路径 ⇒ 本脚本必须**如实报错并 exit 2**、
 *      **不能**打印出「失败断言数：0」—— 用 `--selftest-chrome` 真的跑一次子进程来证明。
 *
 * 怎么跑（在仓库根或任意目录都行）：
 *   node items/app-ui/prototypes/check-about-min.mjs
 *   node items/app-ui/prototypes/check-about-min.mjs --no-shot        # 只跑断言，不重出 PNG
 *   node items/app-ui/prototypes/check-about-min.mjs --all-shots      # 连 320／1180 的 PNG 也写出来
 *   node items/app-ui/prototypes/check-about-min.mjs --only=430       # 只跑某一个视口（排查用）
 *   node items/app-ui/prototypes/check-about-min.mjs --selftest-chrome
 *
 * 需要什么：
 *   - Node（用到内置 fetch／WebSocket／net；本机实测 v25.9.0 通过）；
 *   - **本机无头 Chromium**：环境变量 CHROME_BIN → 否则 %LOCALAPPDATA%\Chromium\Application\chrome.exe。
 *     找不到就**如实报错并 exit 2**（CHROME_BIN 指到错路径也走这一条，不会假装通过）；
 *   - **不需要**任何 npm 依赖：不装包、不联网、不起静态服务（直接开 file://）；
 *   - **端口**：CDP 调试端口**先向内核要一个空闲端口**（net 监听 0 再关掉），**不写死**；
 *   - **仓库根**：从脚本所在目录**向上查找 prototype/css/theme-tech.css** 来定位，**不写死层级**。
 *
 * 副作用：临时目录建一个 Chromium profile 并删掉；默认重写本目录 1 张 PNG；
 *         q-about-min.html 本身**只读打开**，不写、不改。
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const OUT = dirname(fileURLToPath(import.meta.url));
const ROOT = (() => {
  let d = OUT;
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(d, 'prototype', 'css', 'theme-tech.css'))) return d;
    d = dirname(d);
  }
  throw new Error('找不到仓库根：从 ' + OUT + ' 向上查找 prototype/css/theme-tech.css 失败');
})();

const PAGE = join(OUT, 'q-about-min.html');
const THEME = join(ROOT, 'prototype', 'css', 'theme-tech.css');
const argv = process.argv.slice(2);
const NO_SHOT = argv.includes('--no-shot');
const SHOT_ALL = argv.includes('--all-shots');
const SHOT_SET = SHOT_ALL ? new Set([320, 430, 1180]) : new Set([430]);
const ONLY = (argv.find((a) => a.startsWith('--only=')) || '').split('=')[1];
const VIEWPORTS = [
  { w: 320, h: 568, mobile: true },
  { w: 430, h: 932, mobile: true },
  { w: 1180, h: 900, mobile: false },
].filter((v) => !ONLY || String(v.w) === ONLY);

const SHOT_MAX_PX = 16000;      /* Chromium 的截图上限（约 16000 像素高）*/
const EDGE_X = 16.8;            /* 行内沿 1.05rem */
const KCOL = 5.2 * 0.82 * 16;   /* 标签列 5.2em（按 0.82rem 字号）＝68.224px */
const K_GAP = 8;                /* 标签列 → 值列 的缝 0.5rem */
const VALUE_X = EDGE_X + KCOL + K_GAP;   /* 值列左沿（相对内容列左沿）≈93.02 */
const BTN_OWN = 1 + 11.2;       /* 按钮自身：1px 边框 ＋ 0.7rem 内边距 ＝12.2px */

/* ── 计数与打印 ──────────────────────────────────────────────────── */
let PASS = 0;
const FAILS = [];
function ok(cond, label) {
  if (cond) { PASS += 1; return true; }
  FAILS.push(label); return false;
}
function near(a, b, tol, label) {
  const d = Math.abs(a - b);
  return ok(d <= tol, label + '（实测 ' + a + '，期望 ' + b + '，差 ' + Math.round(d * 100) / 100 + ' > 容差 ' + tol + '）');
}
function say(...a) { console.log(...a); }

/* ── [S] 边界自证：CHROME_BIN 指到不存在的路径 ⇒ 如实报错退出，不假装通过 ── */
if (argv.includes('--selftest-chrome')) {
  const bogus = 'C:/definitely/not/here/chrome.exe';
  const self = fileURLToPath(import.meta.url);
  const r = spawnSync(process.execPath, [self, '--no-shot', '--only=430'], {
    cwd: OUT, encoding: 'utf8', timeout: 300000,
    env: { ...process.env, CHROME_BIN: bogus },
  });
  const out = r.stdout || '', err = r.stderr || '';
  const saidReason = /找不到无头 Chromium/.test(err) && err.includes(bogus);
  const notFakePass = out.indexOf('失败断言数：0') < 0;
  say('【边界自证】CHROME_BIN = ' + bogus + '（该路径不存在）');
  say('  退出码：' + r.status + '（要求 ≠ 0，这里是 2 表示环境缺失）');
  say('  stderr 说了原因：' + (saidReason ? '是' : '否') + ' → ' + JSON.stringify((err.trim().split(/\r?\n/)[0]) || ''));
  say('  stdout 里没有「失败断言数：0」（不假装通过）：' + (notFakePass ? '是' : '否'));
  say('  完整 stderr：');
  err.trim().split(/\r?\n/).forEach((l) => say('    ' + l));
  const good = r.status === 2 && saidReason && notFakePass;
  say('\n===== 边界自证：' + (good ? '通过' : '失败') + ' =====');
  process.exit(good ? 0 : 1);
}

/* ═══════════════════════════════════════════════════════════════════
 * 本脚本**独立**期望
 * ═══════════════════════════════════════════════════════════════════ */
const APPVER = '0.1.1';
const CONTENTVER = '2026.10.16.20';
const REPO = 'https://github.com/WSQS/suofei';
const APPNAME = '索斐';
const BUTTON = '检查更新';
const DEFAULT_STATE = 'activated';

/* 逐字文案（运行时值用 ⟨…⟩ 占位）—— 来源：android/.../ui/UpdateStatusText.kt */
const STATES = [
  { key: 'idle', label: '尚未检查（初态）', text: null, enabled: true },
  { key: 'checking', label: '检查中', text: '正在检查…', enabled: false },
  { key: 'uptodate', label: '已是最新', text: '已是最新内容（远端 ⟨内容版本⟩）。', enabled: true },
  { key: 'activated', label: '已下载并切换生效', text: '新内容 ⟨内容版本⟩ 已下载、校验通过并已切换生效（⟨字节数⟩ 字节）；返回目录后采用。', enabled: true },
  { key: 'failed', label: '失败·旧内容保留', text: '更新未生效，旧内容保留：⟨原因⟩', enabled: true },
  { key: 'fixture', label: '失败·最长原因（夹具）', fixture: true,
    text: '更新未生效，旧内容保留：SHA-256 不符（清单 ⟨清单 SHA-256⟩，实际 ⟨实际 SHA-256⟩）；已丢弃下载结果，保留旧内容（下载/校验未通过）', enabled: true },
];
const ST_BY_KEY = Object.fromEntries(STATES.map((s) => [s.key, s]));

/* 三格：只差「横向对齐线」（并列，不排序、不写推荐）*/
const VARIANTS = ['V1', 'V2', 'V3'];

/* 块内元素形态（有 label ／ 无 label）*/
const SHAPE_WITH_LABEL = [
  'DIV|col', 'P|brand', 'DIV|verpair', 'DIV|kv', 'SPAN|k', 'SPAN|v',
  'DIV|kv', 'SPAN|k', 'SPAN|v',
  'BUTTON|primarybtn', 'P|status',
  'DIV|repowrap', 'A|repolink',
];
const SHAPE_NO_LABEL = SHAPE_WITH_LABEL.filter((s) => s !== 'P|status');
const COLKIDS_WITH_LABEL = ['P|brand', 'DIV|verpair', 'BUTTON|primarybtn', 'P|status', 'DIV|repowrap'];
const COLKIDS_NO_LABEL = ['P|brand', 'DIV|verpair', 'BUTTON|primarybtn', 'DIV|repowrap'];

/* 页面上必须逐条写明的已定项（**去掉标签后**的纯文本里匹配）*/
const FIXED_NOTES = [
  ['本轮范围＝整页共用横向对齐线', /整页的共用横向对齐线/],
  ['对齐对象含版本「标签列／值列」与更新控件', /版本「标签列」／「值列」/],
  ['上一轮那三档降为观测量、不再三选一', /降为观测量/],
  ['整页次序＝A3', /整页次序＝A3/],
  ['版本相邻组（不含「来源」行）', /版本相邻组（不含「来源」行）/],
  ['更新处无框（按钮与状态 label 是内容列直接子元素）', /按钮与状态 label 是内容列 .col 的直接子元素/],
  ['单按钮＋label，状态原地替换', /单按钮＋label/],
  ['初态不生成状态文本元素', /初态（尚未检查）不生成状态文本元素/],
  ['仓库链接＝完整 URL（C1）且不给浏览器提示', /仓库链接＝完整 URL（C1）/],
  ['宽度口径 C = min(V, max(320, 0.88×(V−24)))', /C = min\(V, max\(320, 0\.88 × \(V − 24\)\)\)/],
  ['24 是一次性扣除总量，不是左右各 12px', /24 是一次性从视口宽扣掉的总量/],
  ['静默终端令牌 + 权威仍是 visual-tokens.md', /静默终端令牌/],
  ['只做内容更新，不做 APK 更新', /只做内容更新，不做 APK 更新/],
  ['「来源」不画', /「来源」不画/],
  ['不把标签/值改成两行', /不把标签\/值改成两行/],
  ['不加信息（无新标题／说明文字／分隔线）', /不加信息/],
  ['不替用户选：三格并列、不排序、不写推荐', /不替用户选/],
  ['三格并列、不排序、不写推荐', /不排序、不写推荐/],
  ['这是材料、不是实施／功能批准', /不是产品实施 · 不是功能批准/],
  ['选其中一格 ≠ 采纳整页规格', /≠ 采纳整页规格/],
  ['不决定 JSON／MD 分界与产物字段', /不决定 JSON／MD 分界与任何产物字段/],
];

/* ═══════════════════════════════════════════════════════════════════
 * [G] 静态检查（不开浏览器）
 * ═══════════════════════════════════════════════════════════════════ */
if (!existsSync(PAGE)) { console.error('找不到原型页面：' + PAGE); process.exit(2); }
const HTML = readFileSync(PAGE, 'utf8');
const HTMLTEXT = HTML.replace(/<[^>]+>/g, '');

function parseTokens(css) {
  const map = new Map();
  const re = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi;
  let m;
  while ((m = re.exec(css))) map.set(m[1], m[2].replace(/\s+/g, ' ').trim());
  return map;
}
function sliceBetween(text, a, b) {
  const i = text.indexOf(a), j = text.indexOf(b);
  if (i < 0 || j < 0 || j <= i) throw new Error('找不到标记：' + a + ' / ' + b);
  return text.slice(i + a.length, j);
}
const SNAP = sliceBetween(HTML, '/* == TOKEN-SNAPSHOT-BEGIN == */', '/* == TOKEN-SNAPSHOT-END == */');
const DRAFT = sliceBetween(HTML, '/* == DRAFT-VALUES-BEGIN == */', '/* == DRAFT-VALUES-END == */');
const snapTokens = parseTokens(SNAP);
const draftTokens = parseTokens(DRAFT);
const THEME_CSS = readFileSync(THEME, 'utf8');
const themeTokens = parseTokens(THEME_CSS);

say('仓库根：' + ROOT);
say('原型页面：' + PAGE);
say('覆盖视口：' + VIEWPORTS.map((v) => v.w + '×' + v.h).join(' / ') + (NO_SHOT ? '（--no-shot：不出图、不查 PNG）' : ''));
say('');
say('── [G] 静态契约 ──');

{
  let mism = 0, missing = 0;
  snapTokens.forEach((v, k) => {
    if (!themeTokens.has(k)) { missing += 1; say('  快照里的令牌 ' + k + ' 在 theme-tech.css 里找不到'); return; }
    if (themeTokens.get(k) !== v) { mism += 1; say('  值不一致 ' + k + '：快照 ' + v + ' ／ 主题 ' + themeTokens.get(k)); }
  });
  ok(snapTokens.size >= 20, '快照里声明的令牌数 ≥ 20（实测 ' + snapTokens.size + '）');
  ok(missing === 0, '快照里的令牌在 theme-tech.css 里都存在（缺 ' + missing + '）');
  ok(mism === 0, '快照与 theme-tech.css 的值逐项一致（不一致 ' + mism + '）');
  say('  [G] 令牌快照：' + snapTokens.size + ' 条，值不一致 0，缺失 0（与 prototype/css/theme-tech.css 比对）');

  const pageWithoutSnap = HTML.replace(SNAP, '\u0000').replace(DRAFT, '\u0001');
  const unused = [];
  snapTokens.forEach((_v, k) => { if (!pageWithoutSnap.includes('var(' + k)) unused.push(k); });
  ok(unused.length === 0, '快照里的令牌都被用到（未用：' + unused.join(',') + '）');
  const usedVars = new Set();
  const reV = /var\(\s*(--[a-z0-9-]+)/gi;
  let mv;
  while ((mv = reV.exec(HTML))) usedVars.add(mv[1]);
  const undeclared = [];
  usedVars.forEach((k) => { if (!snapTokens.has(k) && !draftTokens.has(k)) undeclared.push(k); });
  ok(undeclared.length === 0, '页面里每个 var() 都有声明（未声明：' + undeclared.join(',') + '）');
  say('  [G] var() 使用：' + usedVars.size + ' 个，全部有声明；未用令牌 ' + unused.length + ' 个');
}

{
  ok(/权威仍是 docs\/design\/visual-tokens\.md/.test(HTML), '快照写明「权威仍是 docs/design/visual-tokens.md」');
  const declared = (HTML.match(/data-token-blob="([0-9a-f]{40})"/) || [])[1];
  ok(!!declared, '页面写了 data-token-blob（40 位）');
  const headShort = (HTML.match(/data-head-sha="([0-9a-f]{6,12})"/) || [])[1];
  ok(!!headShort, '页面写了 data-head-sha');
  const git = spawnSync('git', ['-C', ROOT, 'hash-object', 'prototype/css/theme-tech.css'], { encoding: 'utf8' });
  if (git.status !== 0 || !git.stdout) {
    FAILS.push('取不到 theme-tech.css 的 blob 哈希：' + (git.stderr || '').trim());
  } else {
    const blob = git.stdout.trim();
    ok(blob === declared, 'theme-tech.css 的 blob ＝ 页面记录的 ' + declared + '（实测 ' + blob + '）');
    say('  [G] theme-tech.css blob：' + blob + '（记录时的 HEAD：' + headShort + '）');
  }
  const st = spawnSync('git', ['-C', ROOT, 'status', '--porcelain', '--', 'prototype/css/theme-tech.css'], { encoding: 'utf8' });
  ok(st.status === 0 && st.stdout.trim() === '', 'theme-tech.css 相对 HEAD 没有本地改动');
}

{
  FIXED_NOTES.forEach(([label, re]) => ok(re.test(HTMLTEXT), '页面上写明：' + label));
  ok(/data-deduct="24"/.test(HTML) && /data-pct="88"/.test(HTML) && /data-floor="320"/.test(HTML) && /data-cap="viewport"/.test(HTML),
    '页面记录宽度参数（24／88／320／上界＝视口）');
  say('  [G] 已定项：' + FIXED_NOTES.length + ' 条逐条在页面上写明');
}

{
  const forbidden = [
    ['<link', /<link\b/i], ['<script src', /<script[^>]*\bsrc=/i], ['@import', /@import/i],
    ['url(http', /url\(\s*['"]?https?:/i], ['fetch(', /\bfetch\s*\(/], ['XMLHttpRequest', /XMLHttpRequest/],
    ['内联 onclick', /\bon(click|load|error|mouseover)\s*=/i],
  ];
  forbidden.forEach(([label, re]) => ok(!re.test(HTML), '静态自包含：页面里没有 ' + label));
  ok(!/@keyframes/i.test(HTML), '没有 @keyframes');
  ok(!/\banimation\s*:/i.test(HTML), '没有 animation 声明');
  const trans = [...HTML.matchAll(/(?<![\w-])transition\s*:\s*([^;]+);/gi)].map((m) => m[1].trim());
  ok(trans.length > 0 && trans.every((t) => t === 'var(--row-transition)'), 'transition 只允许 var(--row-transition)（实测 ' + trans.length + ' 处）');
  const shadows = [...HTML.matchAll(/(?<![\w-])box-shadow\s*:\s*([^;]+);/gi)].map((m) => m[1].trim());
  ok(shadows.length === 0, '页面里**没有 box-shadow 声明**（实测 ' + shadows.length + ' 处）');
}

/* ═══════════════════════════════════════════════════════════════════
 * 浏览器部分
 * ═══════════════════════════════════════════════════════════════════ */
const CHROME = (() => {
  const fromEnv = process.env.CHROME_BIN;
  const guess = join(process.env.LOCALAPPDATA || '', 'Chromium', 'Application', 'chrome.exe');
  const p = fromEnv || guess;
  if (!p || !existsSync(p)) {
    console.error('找不到无头 Chromium：' + p + '（看 CHROME_BIN 或 %LOCALAPPDATA%\\Chromium\\Application\\chrome.exe）');
    process.exit(2);
  }
  return p;
})();

function freePort() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.on('error', rej);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect(port) {
  const tab = await (await fetch('http://127.0.0.1:' + port + '/json/new?about:blank', { method: 'PUT' })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
  let id = 0;
  const pend = new Map();
  const state = { errors: [], requests: [] };
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) {
      const { res, rej } = pend.get(m.id); pend.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
      return;
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      state.errors.push('uncaught: ' + (d.exception?.description || d.text));
    } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      state.errors.push('console.error: ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
    } else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      state.errors.push('log.error: ' + m.params.entry.text);
    } else if (m.method === 'Network.requestWillBeSent') {
      state.requests.push(m.params.request.url);
    }
  });
  const send = (method, params = {}) => {
    const my = ++id;
    ws.send(JSON.stringify({ id: my, method, params }));
    return new Promise((res, rej) => pend.set(my, { res, rej }));
  };
  return { send, state, ws };
}

/* 页面侧探针（只读）。写成真函数再 toString —— 免得引号转义出错。 */
function probeFn() {
  function R(e) { return e.getBoundingClientRect(); }
  function P(v) { return Math.round(v * 100) / 100; }
  function CS(e, p) { return getComputedStyle(e)[p]; }
  function txt(e) { return e ? e.textContent : null; }
  function linesOf(e) {
    if (!e) return null;
    var c = getComputedStyle(e);
    var h = e.clientHeight - parseFloat(c.paddingTop || 0) - parseFloat(c.paddingBottom || 0);
    var lh = parseFloat(c.lineHeight) || parseFloat(c.fontSize) * 1.2;
    return Math.max(1, Math.round(h / lh));
  }
  function inkRects(e) {
    if (!e) return [];
    var r = document.createRange(); r.selectNodeContents(e);
    return [].slice.call(r.getClientRects()).filter(function (x) { return x.width > 0; });
  }
  function inkLR(e) {
    var rs = inkRects(e);
    if (!rs.length) return null;
    var L = rs[0].left, Rt = rs[0].right;
    for (var i = 1; i < rs.length; i++) { if (rs[i].left < L) L = rs[i].left; if (rs[i].right > Rt) Rt = rs[i].right; }
    return { left: L, right: Rt, w: Rt - L };
  }
  function lineLefts(e) {
    var rs = inkRects(e).slice().sort(function (a, b) { return a.top - b.top; });
    return rs.map(function (x) { return x.left; });
  }
  function shape(pg) {
    var out = [];
    [].slice.call(pg.querySelectorAll('[data-test]')).forEach(function (e) {
      if (e.closest('.pg') !== pg) return;
      out.push(e.tagName + '|' + (e.getAttribute('data-test') || ''));
    });
    return out;
  }
  function visible(e) {
    if (!e) return false;
    var c = getComputedStyle(e);
    var r = R(e);
    return c.display !== 'none' && c.visibility !== 'hidden' && e.getClientRects().length > 0 && r.width > 0 && r.height > 0;
  }
  var doc = document.documentElement;
  var out = {};
  out.vw = innerWidth; out.vh = innerHeight; out.dpr = devicePixelRatio;
  out.docW = doc.scrollWidth; out.bodyW = document.body.scrollWidth;
  out.vvW = P(visualViewport.width);
  out.ready = doc.dataset.ready || '';
  out.docState = doc.dataset.state || '';
  out.params = { deduct: doc.dataset.deduct, pct: doc.dataset.pct, floor: doc.dataset.floor, cap: doc.dataset.cap, blob: doc.dataset.tokenBlob, head: doc.dataset.headSha };
  var api = window.__ABOUT_MIN__;
  out.api = api ? {
    deduct: api.deduct, pct: api.pct, floor: api.floor, cap: api.cap, app: api.app,
    variantKeys: api.variantKeys, stateKeys: api.stateKeys, stateLabels: api.stateLabels,
    text: api.text, showsLabel: api.showsLabel, btnEnabled: api.btnEnabled,
    buttonLabel: api.buttonLabel, cw: api.cw, measured: api.measured,
  } : null;
  out.shots = [].slice.call(document.querySelectorAll('[data-shotframe]')).map(function (f) {
    var r = R(f);
    return { id: f.dataset.shotframe, left: P(r.left), w: P(r.width), h: P(r.height), top: P(r.top), px2: P(r.height * 2) };
  });
  out.shotCount = out.shots.length;
  out.over = [];
  [].slice.call(document.querySelectorAll('body *')).forEach(function (e) {
    var r = R(e); if (r.width <= 0 && r.height <= 0) return;
    if (r.right > innerWidth + 0.5 || r.left < -0.5) out.over.push({ cls: (e.className || '') + '|' + e.tagName, left: P(r.left), right: P(r.right) });
  });
  out.ctls = [];
  [].slice.call(document.querySelectorAll('a,button,[tabindex],[onclick],[role=button]')).forEach(function (e) {
    out.ctls.push({
      tag: e.tagName, type: e.getAttribute('type'), href: e.hasAttribute('href'), cls: e.className || '',
      inPg: !!e.closest('.pg'), inStatePanel: !!e.closest('[data-test=state-panel]'),
    });
  });
  out.details = document.querySelectorAll('details,summary').length;
  var sp = document.querySelector('[data-test=state-panel]');
  var ban = document.querySelector('[data-test=imgban]');
  out.controls = {
    statePanelInShot: !!(sp && sp.closest('[data-shotframe]')),
    statePanelInPg: !!(sp && sp.closest('.pg')),
    btnCount: document.querySelectorAll('[data-test=state-btn]').length,
    modes: [].slice.call(document.querySelectorAll('[data-test=state-btn]')).map(function (b) { return b.dataset.mode; }),
    pressed: [].slice.call(document.querySelectorAll('[data-test=state-btn]')).filter(function (b) { return b.getAttribute('aria-pressed') === 'true'; }).map(function (b) { return b.dataset.mode; }),
    imgbanInShot: !!(ban && ban.closest('[data-shotframe]')),
    imgbanInPg: !!(ban && ban.closest('.pg')),
    imgbanText: ban ? ban.textContent.replace(/\s+/g, ' ').trim() : null,
  };
  out.demoCount = document.querySelectorAll('[data-test=demo]').length;
  out.blocks = [];
  [].slice.call(document.querySelectorAll('[data-test=block]')).forEach(function (pg) {
    var rp = R(pg);
    var col = pg.querySelector('[data-test=col]');
    var rc = R(col);
    var x0 = rc.left;
    var st = pg.querySelector('[data-test=status]');
    var btn = pg.querySelector('[data-test=primarybtn]');
    var verpair = pg.querySelector('[data-test=verpair]');
    var repoa = pg.querySelector('[data-test=repolink]');
    var repoWrap = repoa.closest('[data-test=repowrap]');
    var rows = [].slice.call(pg.querySelectorAll('[data-test=kv]'));
    var kRight = [], vLeft = [];
    rows.forEach(function (row) {
      kRight.push(P(R(row.querySelector('[data-test=k]')).right - rc.left));
      vLeft.push(P(R(row.querySelector('[data-test=v]')).left - rc.left));
    });
    /* 去框：扫内容列这一层（含 .col），**排除按钮子树** */
    var scan = { borderEls: [], bgEls: [], shadowEls: [], radiusEls: [], headings: [], hrs: [], dividerEls: [], sourceRows: col.querySelectorAll('[data-test=source]').length };
    [col].concat([].slice.call(col.querySelectorAll('*'))).forEach(function (e) {
      if (e === btn || (btn && btn.contains(e))) return;
      var c = getComputedStyle(e);
      var t = (e.className || '') + '|' + e.tagName;
      var bw = [parseFloat(c.borderTopWidth), parseFloat(c.borderRightWidth), parseFloat(c.borderBottomWidth), parseFloat(c.borderLeftWidth)];
      if (bw[0] > 0 || bw[1] > 0 || bw[2] > 0 || bw[3] > 0) scan.borderEls.push(t + '=' + bw.join('/'));
      if (bw[0] > 0 || bw[2] > 0) scan.dividerEls.push(t + '=' + bw[0] + '/' + bw[2]);
      if (c.backgroundColor !== 'rgba(0, 0, 0, 0)' && c.backgroundColor !== 'transparent') scan.bgEls.push(t + '=' + c.backgroundColor);
      if (c.boxShadow !== 'none') scan.shadowEls.push(t + '=' + c.boxShadow);
      if (parseFloat(c.borderTopLeftRadius) > 0) scan.radiusEls.push(t + '=' + c.borderTopLeftRadius);
      if (/^H[1-6]$/.test(e.tagName)) scan.headings.push(t);
      if (e.tagName === 'HR') scan.hrs.push(t);
    });
    var colKids = [].slice.call(col.children).map(function (e) { return e.tagName + '|' + (e.getAttribute('data-test') || ''); });
    var bt = R(btn), vp = R(verpair), rw = R(repoWrap);
    var kI = [].slice.call(pg.querySelectorAll('[data-test=k]')).map(function (e) { return inkLR(e); });
    var vI = [].slice.call(pg.querySelectorAll('[data-test=v]')).map(function (e) { return inkLR(e); });
    var bInk = inkLR(btn);
    var sL = lineLefts(st);
    var b = {
      id: pg.dataset.block, variant: pg.dataset.variant, state: pg.dataset.state,
      visible: !pg.hidden && !pg.closest('[data-test=demo]').hidden && rp.width > 0,
      left: P(rp.left), w: P(rp.width), h: P(rp.height),
      colLeft: P(rc.left), colW: P(rc.width),
      colPadL: P(parseFloat(CS(col, 'paddingLeft'))), colPadR: P(parseFloat(CS(col, 'paddingRight'))),
      colStyle: {
        borderTop: CS(col, 'borderTopWidth'), borderRight: CS(col, 'borderRightWidth'),
        borderBottom: CS(col, 'borderBottomWidth'), borderLeft: CS(col, 'borderLeftWidth'),
        bg: CS(col, 'backgroundColor'), shadow: CS(col, 'boxShadow'), radius: CS(col, 'borderTopLeftRadius'),
      },
      colKids: colKids, scan: scan,
      btnOwn: {
        bg: CS(btn, 'backgroundColor'), borderW: CS(btn, 'borderTopWidth'),
        radius: CS(btn, 'borderTopLeftRadius'), shadow: CS(btn, 'boxShadow'), padL: P(parseFloat(CS(btn, 'paddingLeft'))),
      },
      sameParent: st ? btn.parentElement === st.parentElement : null,
      btnParentIsCol: btn.parentElement === col,
      statusParentIsCol: st ? st.parentElement === col : null,
      kTextAlign: CS(pg.querySelector('[data-test=k]'), 'textAlign'),
      edge: P(parseFloat(CS(pg.querySelector('[data-test=kv]'), 'paddingLeft'))),
      shape: shape(pg),
      brandText: txt(pg.querySelector('[data-test=brand]')),
      brandInkLeft: P(inkLR(pg.querySelector('[data-test=brand]')).left - x0),
      verPairText: verpair ? verpair.innerText.replace(/\s+/g, ' ').trim() : null,
      kvRows: rows.length,
      kRightSpread: rows.length ? P(Math.max.apply(null, kRight) - Math.min.apply(null, kRight)) : null,
      vLeftSpread: rows.length ? P(Math.max.apply(null, vLeft) - Math.min.apply(null, vLeft)) : null,
      /* ── 横向对齐线（相对内容列左沿）── */
      labelInkLeft: kI.length ? P(Math.min.apply(null, kI.map(function (x) { return x.left; })) - x0) : null,
      labelInkRight: kI.length ? P(Math.max.apply(null, kI.map(function (x) { return x.right; })) - x0) : null,
      labelInkLefts: kI.map(function (x) { return P(x.left - x0); }),
      valueInkLeft: vI.length ? P(Math.min.apply(null, vI.map(function (x) { return x.left; })) - x0) : null,
      valueInkLefts: vI.map(function (x) { return P(x.left - x0); }),
      btnEdgeLeft: P(bt.left - x0), btnRight: P(bt.right - x0),
      btnInkLeft: bInk ? P(bInk.left - x0) : null, btnInkRight: bInk ? P(bInk.right - x0) : null,
      btnW: P(bt.width), btnH: P(bt.height),
      btnTop: P(bt.top - rp.top), btnBottom: P(bt.bottom - rp.top),
      statusExists: !!st, statusVisible: visible(st),
      statusText: txt(st), statusLines: linesOf(st), statusBoxW: st ? P(R(st).width) : null, statusBoxH: st ? P(R(st).height) : null,
      statusInkLeft: sL.length ? P(sL[0] - x0) : null,
      statusInkLeft2: sL.length > 1 ? P(sL[1] - x0) : null,
      statusLineLefts: sL.map(function (v) { return P(v - x0); }),
      statusFontSize: st ? CS(st, 'fontSize') : null, statusLineHeight: st ? CS(st, 'lineHeight') : null,
      statusColor: st ? CS(st, 'color') : null, statusWrap: st ? CS(st, 'overflowWrap') : null,
      statusTop: st ? P(R(st).top - rp.top) : null, statusBottom: st ? P(R(st).bottom - rp.top) : null,
      repoInkLeft: P(inkLR(repoa).left - x0),
      gapVerToBtn: P(bt.top - vp.bottom),
      gapBtnToStatus: st ? P(R(st).top - bt.bottom) : null,
      gapBtnToRepo: P(rw.top - bt.bottom),
      gapStatusToRepo: st ? P(rw.top - R(st).bottom) : null,
      nextAfterBtn: btn.nextElementSibling ? btn.nextElementSibling.tagName + '|' + (btn.nextElementSibling.getAttribute('data-test') || '') : null,
      areaTop: P(bt.top - rp.top), areaH: P((st ? R(st).bottom : bt.bottom) - bt.top),
      btnText: txt(btn), btnDisabled: btn ? btn.disabled : null, btnTag: btn ? btn.tagName : null,
      btnType: btn ? btn.getAttribute('type') : null, btnCls: btn ? btn.className : null,
      btnFontSize: btn ? CS(btn, 'fontSize') : null,
      repoText: txt(repoa), repoTag: repoa ? repoa.tagName : null, repoHref: repoa ? repoa.getAttribute('href') : null,
      repoIsLastInCol: !!(repoa && repoWrap === col.lastElementChild),
      repoBottomFromBlock: repoa ? P(rp.bottom - rw.bottom) : null,
      hintCount: pg.querySelectorAll('[data-test=repohint]').length,
      hasRunmark: !!pg.querySelector('[data-test=runmark]'),
      text: pg.innerText.replace(/\s+/g, ' ').trim(),
      ctlCount: pg.querySelectorAll('a,button,[tabindex],[onclick],[role=button]').length,
      shadows: 0, anims: 0,
    };
    [].slice.call(pg.querySelectorAll('*')).forEach(function (e) {
      var s = CS(e, 'boxShadow'); if (s && s !== 'none') b.shadows++;
      var an = CS(e, 'animationName'); if (an && an !== 'none') b.anims++;
    });
    out.blocks.push(b);
  });
  out.headsOutsidePg = [].slice.call(document.querySelectorAll('[data-test=dhead],[data-test=cap]')).every(function (e) { return !e.closest('.pg'); });
  out.fonts = (function () {
    var sel = { brand: '[data-test=brand]', k: '[data-test=k]', v: '[data-test=v]', repolink: '[data-test=repolink]', status: '[data-test=status]', btn: '[data-test=primarybtn]' };
    var o = {};
    Object.keys(sel).forEach(function (k) {
      var e = document.querySelector(sel[k]);
      if (!e) return;
      var c = getComputedStyle(e);
      o[k] = c.fontSize + '|' + c.lineHeight + '|' + c.letterSpacing;
    });
    return o;
  })();
  return JSON.stringify(out);
}
const PAGE_PROBE = '(' + probeFn.toString() + ')()';

const FONT_KEYS = ['brand', 'k', 'v', 'repolink', 'status', 'btn'];
const fontProfile = {};
const TABLE = [];
const TABLE_V = VIEWPORTS.some((v) => v.w === 430) ? 430 : (VIEWPORTS[0] ? VIEWPORTS[0].w : 430);

async function clickSel(send, evalJson, sel) {
  const pos = await evalJson('(function(){var e=document.querySelector(' + JSON.stringify(sel) + ');'
    + 'e.scrollIntoView({block:"center"});var r=e.getBoundingClientRect();'
    + 'return JSON.stringify({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2),inView:r.top>=0&&r.bottom<=innerHeight});})()');
  if (!pos.inView) return { inView: false, pos };
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pos.x, y: pos.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pos.x, y: pos.y, button: 'left', clickCount: 1 });
  await sleep(180);
  return { inView: true, pos };
}

/* 把一块的量整理成「对齐线」表（相对内容列左沿）*/
function lines(b) {
  return {
    variant: b.variant, edge: b.edge,
    labelL: b.labelInkLeft, labelR: b.labelInkRight, value: b.valueInkLeft,
    btnEdge: b.btnEdgeLeft, btnInk: b.btnInkLeft,
    status: b.statusInkLeft, status2: b.statusInkLeft2,
    brand: b.brandInkLeft, repo: b.repoInkLeft,
    dLabelEdge: Math.round((b.labelInkLeft - b.edge) * 100) / 100,
    dBtnEdge: Math.round((b.btnEdgeLeft - b.edge) * 100) / 100,
    dBtnValue: Math.round((b.btnEdgeLeft - b.valueInkLeft) * 100) / 100,
    dBtnLabel: Math.round((b.btnEdgeLeft - b.labelInkLeft) * 100) / 100,
    dBtnInk: Math.round((b.btnInkLeft - b.btnEdgeLeft) * 100) / 100,
    dStatusEdge: b.statusInkLeft === null ? null : Math.round((b.statusInkLeft - b.edge) * 100) / 100,
    dStatusValue: b.statusInkLeft === null ? null : Math.round((b.statusInkLeft - b.valueInkLeft) * 100) / 100,
    dStatusLabel: b.statusInkLeft === null ? null : Math.round((b.statusInkLeft - b.labelInkLeft) * 100) / 100,
    dBtnStatusInk: b.statusInkLeft === null ? null : Math.round((b.btnInkLeft - b.statusInkLeft) * 100) / 100,
    dStatus2: b.statusInkLeft2 === null ? null : Math.round((b.statusInkLeft2 - b.statusInkLeft) * 100) / 100,
    statusLines: b.statusLines, statusBoxW: b.statusBoxW, kTextAlign: b.kTextAlign,
  };
}

async function runViewport(vp) {
  const tag = '[' + vp.w + ']';
  const port = await freePort();
  const profile = mkdtempSync(join(tmpdir(), 'check-about-min-'));
  const child = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--user-data-dir=' + profile,
    '--remote-debugging-port=' + port, 'about:blank',
  ], { stdio: 'ignore' });

  try {
    let up = false;
    for (let i = 0; i < 80 && !up; i++) {
      try { const r = await fetch('http://127.0.0.1:' + port + '/json/version'); if (r.ok) up = true; } catch { /* 继续等 */ }
      if (!up) await sleep(150);
    }
    if (!up) throw new Error('Chromium 的 devtools 端口没起来');
    const { send, state, ws } = await connect(port);
    await send('Runtime.enable'); await send('Log.enable'); await send('Network.enable'); await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 2, mobile: vp.mobile });
    await send('Page.navigate', { url: 'file:///' + PAGE.replace(/\\/g, '/') });
    for (let i = 0; i < 120; i++) {
      const r = await send('Runtime.evaluate', { expression: 'document.documentElement.dataset.ready||""', returnByValue: true });
      if (r.result.value === '1') break;
      await sleep(100);
    }
    await sleep(250);

    const evalJson = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
      if (r.exceptionDetails) throw new Error('页面探针出错：' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return JSON.parse(r.result.value);
    };

    const g = await evalJson(PAGE_PROBE);
    say('  · 探针 A 完成（状态＝' + g.docState + '）');

    ok(g.vw === vp.w, tag + ' innerWidth ＝ ' + vp.w + '（实测 ' + g.vw + '）');
    ok(g.vh === vp.h, tag + ' innerHeight ＝ ' + vp.h + '（实测 ' + g.vh + '）');
    ok(g.docW === vp.w, tag + ' documentElement.scrollWidth ＝ ' + vp.w + '（实测 ' + g.docW + '）');
    ok(g.bodyW === vp.w, tag + ' body.scrollWidth ＝ ' + vp.w + '（实测 ' + g.bodyW + '）');
    ok(g.vvW === vp.w, tag + ' visualViewport.width ＝ ' + vp.w + '（实测 ' + g.vvW + '，防 shrink-to-fit）');
    ok(g.ready === '1', tag + ' 页面自报 ready');
    ok(g.docState === DEFAULT_STATE, tag + ' 默认状态＝' + DEFAULT_STATE + '（实测 ' + g.docState + '）');
    ok(g.params.deduct === '24' && g.params.pct === '88' && g.params.floor === '320' && g.params.cap === 'viewport', tag + ' 页面上写明宽度参数（24／88／320／上界＝视口）');
    ok(g.details === 0, tag + ' 页面没有 <details>/<summary>（可点元素限定为 a／button）');
    ok(g.controls.statePanelInShot === false && g.controls.statePanelInPg === false, tag + ' 状态查看器在**截图范围之外**、不在块内');
    ok(g.controls.imgbanInShot === true, tag + ' 「原型说明」横幅在**截图范围之内**');
    ok(g.controls.imgbanInPg === false, tag + ' 「原型说明」横幅**不在**应用页面的块里');
    ok(/不属于应用页面/.test(g.controls.imgbanText || ''), tag + ' 横幅逐字写明「不属于应用页面」');
    ok(g.controls.btnCount === STATES.length, tag + ' 状态查看器按钮数 ＝ ' + STATES.length + '（实测 ' + g.controls.btnCount + '）');
    ok(JSON.stringify(g.controls.modes) === JSON.stringify(STATES.map((s) => s.key)), tag + ' 查看器按钮顺序＝脚本期望（实测 ' + JSON.stringify(g.controls.modes) + '）');
    ok(JSON.stringify(g.controls.pressed) === JSON.stringify([DEFAULT_STATE]), tag + ' 默认按下＝' + DEFAULT_STATE + '（实测 ' + JSON.stringify(g.controls.pressed) + '）');
    ok(g.shotCount === 1, tag + ' 截图区个数＝1（实测 ' + g.shotCount + '）');
    g.shots.forEach((s2) => ok(s2.left === 0 && s2.w === vp.w, tag + ' 截图区 ' + s2.id + ' 左沿 0、宽＝视口宽（实测 ' + s2.left + '／' + s2.w + '）'));
    ok(g.over.length === 0, tag + ' 默认态无横向溢出（越界元素 ' + g.over.length + ' 个：' + JSON.stringify(g.over.slice(0, 4)) + '）');
    ok(g.headsOutsidePg === true, tag + ' 每格上方的标题行与数字行都在块外（不属于应用页面）');

    const badReq = [...new Set(state.requests)].filter((u) => !u.startsWith('file://'));
    ok(badReq.length === 0, tag + ' 没有外部请求（非 file:// 的 ' + badReq.length + ' 个）');
    const badCtl = g.ctls.filter((c) => !((c.tag === 'A' && c.href) || (c.tag === 'BUTTON' && c.type === 'button')));
    ok(badCtl.length === 0, tag + ' 可点元素只有 <a href> 与 <button type=button>（违规 ' + badCtl.length + ' 个）');
    ok(g.ctls.filter((c) => c.inStatePanel).length === STATES.length, tag + ' 查看器按钮都在说明区（' + g.ctls.filter((c) => c.inStatePanel).length + ' 个）');

    /* 公式复算 */
    const A = vp.w - 24, C = Math.min(vp.w, Math.max(320, 0.88 * A));
    ok(C <= vp.w, tag + ' C ≤ V（上界＝视口 V）');
    if (vp.w === 320) ok(C === 320 && C > A, tag + ' V=320 时 C=320 > A=296（24 是扣除总量）');
    if (vp.w === 1180) ok(C > 860, tag + ' V=1180 时 C=' + C + ' > 860（没有夹 860 上限）');
    near(g.api.cw, C, 0.02, tag + ' 页面侧算出的 C ＝ 脚本复算值');

    const vis = g.blocks.filter((b) => b.visible);
    ok(g.blocks.length === VARIANTS.length, tag + ' 块数 ＝ ' + VARIANTS.length + '（三格完整页；实测 ' + g.blocks.length + '）');
    ok(vis.length === VARIANTS.length, tag + ' 三格都可见（实测 ' + vis.length + '）');
    ok(vis.map((b) => b.variant).join(',') === VARIANTS.join(','), tag + ' 三格顺序＝' + VARIANTS.join(',') + '（实测 ' + vis.map((b) => b.variant).join(',') + '）');

    /* ── 每块：几何 ＋ 固定项 ＋ 去框 ＋ 父级 ＋ 间距 ── */
    vis.forEach((b) => {
      const st = ST_BY_KEY[b.state];
      const hasLabel = st.text !== null;
      ok(b.left === 0, tag + ' ' + b.id + ' 块左沿 0（实测 ' + b.left + '）');
      ok(b.w === vp.w, tag + ' ' + b.id + ' 块宽恰＝视口宽 ' + vp.w + '（实测 ' + b.w + '）');
      near(b.colW, C, 0.02, tag + ' ' + b.id + ' 内容列宽＝公式复算 ' + C + '（实测 ' + b.colW + '）');
      near(b.colLeft, (vp.w - C) / 2, 0.02, tag + ' ' + b.id + ' 列外余白＝(V−C)/2');
      near(b.edge, EDGE_X, 0.05, tag + ' ' + b.id + ' 行内沿 1.05rem＝16.8px');
      ok(b.shadows === 0 && b.anims === 0, tag + ' ' + b.id + ' 块内没有 box-shadow／animation');
      ok(b.brandText === APPNAME, tag + ' ' + b.id + ' 应用名＝' + APPNAME);
      ok(!!b.verPairText && b.verPairText.indexOf(APPVER) >= 0 && b.verPairText.indexOf(CONTENTVER) >= 0, tag + ' ' + b.id + ' 版本相邻组含两个版本');
      ok(!/来源|已下载|内置/.test(b.verPairText || ''), tag + ' ' + b.id + ' 版本相邻组里没有「来源」等字样');
      ok(b.kvRows === 2, tag + ' ' + b.id + ' 版本组恰两行（一行一条；实测 ' + b.kvRows + '）');
      near(b.kRightSpread, 0, 0.6, tag + ' ' + b.id + ' 两行 label 的盒子右沿同一条线');
      near(b.vLeftSpread, 0, 0.6, tag + ' ' + b.id + ' 两行的值左沿同一条线（值列）');
      ok(b.gapVerToBtn > 0 && b.repoBottomFromBlock >= 0, tag + ' ' + b.id + ' 按钮夹在版本组与仓库链接之间');
      ok(b.repoText === REPO && b.repoTag === 'A' && b.repoHref === REPO, tag + ' ' + b.id + ' 仓库链接＝完整 URL 的 <a>');
      ok(b.hintCount === 0, tag + ' ' + b.id + ' 没有「在浏览器打开」提示（C1 口径）');
      ok(b.repoIsLastInCol, tag + ' ' + b.id + ' 仓库链接是内容列最后一条');
      ok(b.hasRunmark === false, tag + ' ' + b.id + ' 块内没有原型小标（标注都在块外）');
      ok(JSON.stringify(b.shape) === JSON.stringify(hasLabel ? SHAPE_WITH_LABEL : SHAPE_NO_LABEL), tag + ' ' + b.id + ' 块内元素形态＝脚本期望（' + (hasLabel ? '有' : '无') + ' label）');
      /* 去框 */
      ok(b.scan.borderEls.length === 0, tag + ' ' + b.id + ' 产品区**没有边框**（' + JSON.stringify(b.scan.borderEls) + '）');
      ok(b.scan.bgEls.length === 0, tag + ' ' + b.id + ' 产品区**没有底色**（' + JSON.stringify(b.scan.bgEls) + '）');
      ok(b.scan.shadowEls.length === 0, tag + ' ' + b.id + ' 产品区**没有阴影**（' + JSON.stringify(b.scan.shadowEls) + '）');
      ok(b.scan.radiusEls.length === 0, tag + ' ' + b.id + ' 产品区**没有圆角容器**（' + JSON.stringify(b.scan.radiusEls) + '）');
      ok(b.scan.headings.length === 0 && b.scan.hrs.length === 0 && b.scan.dividerEls.length === 0, tag + ' ' + b.id + ' 产品区没有标题／<hr>／分隔线');
      ok(b.scan.sourceRows === 0, tag + ' ' + b.id + ' 产品区里没有「来源」元素');
      ok(b.colStyle.borderTop === '0px' && b.colStyle.borderRight === '0px' && b.colStyle.borderBottom === '0px' && b.colStyle.borderLeft === '0px'
        && b.colStyle.bg === 'rgba(0, 0, 0, 0)' && b.colStyle.shadow === 'none' && b.colStyle.radius === '0px',
        tag + ' ' + b.id + ' 内容列自身：border ' + [b.colStyle.borderTop, b.colStyle.borderRight, b.colStyle.borderBottom, b.colStyle.borderLeft].join('/')
        + '／底色 ' + b.colStyle.bg + '／阴影 ' + b.colStyle.shadow + '／圆角 ' + b.colStyle.radius);
      ok(parseFloat(b.btnOwn.borderW) > 0 && parseFloat(b.btnOwn.radius) > 0 && b.btnOwn.shadow === 'none'
        && (b.btnDisabled ? b.btnOwn.bg === 'rgba(0, 0, 0, 0)' : b.btnOwn.bg !== 'rgba(0, 0, 0, 0)'),
        tag + ' ' + b.id + ' 按钮自身的边界照旧可识别（边框 ' + b.btnOwn.borderW + '／圆角 ' + b.btnOwn.radius + '／底色 ' + b.btnOwn.bg + '）');
      ok(b.btnParentIsCol && (b.statusExists ? b.statusParentIsCol === true && b.sameParent : true),
        tag + ' ' + b.id + ' 按钮' + (b.statusExists ? '与状态文本' : '') + '的父级＝内容列 .col（不是任何 panel/card）');
      ok(JSON.stringify(b.colKids) === JSON.stringify(hasLabel ? COLKIDS_WITH_LABEL : COLKIDS_NO_LABEL),
        tag + ' ' + b.id + ' 内容列的直接子元素＝' + (hasLabel ? '五' : '四') + '个（' + JSON.stringify(b.colKids) + '）');
      near(b.colPadL, 0, 0.01, tag + ' ' + b.id + ' 内容列自身没有左内边距');
      near(b.gapVerToBtn, 14.4, 0.05, tag + ' ' + b.id + ' 版本组 → 按钮 的间距＝0.9rem＝14.4px');
      if (hasLabel) {
        near(b.gapBtnToStatus, 8, 0.05, tag + ' ' + b.id + ' 按钮 → 状态文本 的间距＝8px');
        near(b.gapStatusToRepo, 14.4, 0.05, tag + ' ' + b.id + ' 状态文本 → 仓库链接 的间距＝14.4px');
      } else {
        near(b.gapBtnToRepo, 14.4, 0.05, tag + ' ' + b.id + ' 初态：按钮 → 仓库链接 的间距＝14.4px（缺席的 label 没留下空位）');
        ok(b.nextAfterBtn === 'DIV|repowrap', tag + ' ' + b.id + ' 初态：按钮的下一个元素就是仓库链接');
      }
      ok(b.btnW > 40 && b.btnW < b.colW, tag + ' ' + b.id + ' 按钮不是满宽条（宽 ' + b.btnW + '）');
      ok(b.ctlCount === 2, tag + ' ' + b.id + ' 块内可点元素数＝2（仓库链接＋唯一按钮；实测 ' + b.ctlCount + '）');
      if (hasLabel) {
        ok(b.statusText === st.text, tag + ' ' + b.id + ' 状态文案逐字（' + JSON.stringify(b.statusText) + '）');
        ok(b.statusWrap === 'anywhere', tag + ' ' + b.id + ' 状态文本 overflow-wrap=' + b.statusWrap);
      }
      ok(b.btnText === BUTTON, tag + ' ' + b.id + ' 按钮文字＝' + JSON.stringify(BUTTON));
      ok(b.btnTag === 'BUTTON' && b.btnType === 'button', tag + ' ' + b.id + ' 按钮是 <button type=button>');
      ok(b.btnDisabled === !st.enabled, tag + ' ' + b.id + ' 按钮禁用＝' + (!st.enabled));
    });

    /* ══ [L] 整页横向对齐线：逐格断言每格的「共用线」══ */
    {
      const m = {};
      vis.forEach((b) => { m[b.variant] = lines(b); });
      const v1 = m.V1, v2 = m.V2, v3 = m.V3;
      ok(!!v1 && !!v2 && !!v3, tag + ' 三格的对齐线都量到了');
      /* 三条线本身 */
      near(v1.edge, EDGE_X, 0.05, tag + ' 线 A 内容左沿＝16.8px');
      near(v1.value, VALUE_X, 0.05, tag + ' 线 D 值列左沿＝edge＋标签列 ' + Math.round(KCOL * 100) / 100 + '＋缝 8 ＝ ' + Math.round(VALUE_X * 100) / 100 + 'px');
      ok(v1.brand === EDGE_X && v1.repo === EDGE_X, tag + ' 应用名与仓库链接都落在线 A（实测 ' + v1.brand + '／' + v1.repo + '）');
      /* V1 现状基线 */
      ok(v1.kTextAlign === 'right', tag + ' V1 标签在列内**右对齐**（实测 text-align=' + v1.kTextAlign + '）');
      near(v1.dLabelEdge, 14.68, 0.1, tag + ' V1 标签文字左沿比线 A 右 ' + v1.dLabelEdge + 'px（右对齐 ⇒ 不在线 A 上）');
      near(v1.dBtnEdge, 0, 0.05, tag + ' **V1 按钮外沿 ＝ 线 A 内容左沿**（差 ' + v1.dBtnEdge + '）');
      near(v1.dStatusEdge, 0, 0.05, tag + ' **V1 状态 label 墨迹 ＝ 线 A**（差 ' + v1.dStatusEdge + '）');
      near(v1.dBtnValue, -76.22, 0.1, tag + ' V1 按钮外沿离值列 ' + v1.dBtnValue + 'px ⇒ **不与「值」共线**');
      ok(Math.abs(v1.dBtnValue) > 10 && Math.abs(v1.dStatusValue) > 10, tag + ' V1 控件与值列明显不共线（' + v1.dBtnValue + '／' + v1.dStatusValue + '）');
      /* V2 控件贴值列 */
      ok(v2.kTextAlign === 'right', tag + ' V2 标签仍是**右对齐**（实测 ' + v2.kTextAlign + '）');
      near(v2.labelL, v1.labelL, 0.05, tag + ' V2 标签文字左沿与 V1 相同（版本组没动；' + v2.labelL + '）');
      near(v2.labelR, v1.labelR, 0.05, tag + ' V2 标签文字右沿与 V1 相同（' + v2.labelR + '）');
      near(v2.value, v1.value, 0.05, tag + ' V2 值列 x 与 V1 相同（' + v2.value + '）');
      near(v2.dBtnValue, 0, 0.05, tag + ' **V2 按钮外沿 ＝ 值列**（差 ' + v2.dBtnValue + '）');
      near(v2.dStatusValue, 0, 0.05, tag + ' **V2 状态 label 墨迹 ＝ 值列**（差 ' + v2.dStatusValue + '）');
      near(v2.dBtnEdge, 76.22, 0.1, tag + ' V2 按钮离线 A（内容左沿）' + v2.dBtnEdge + 'px ⇒ **不再与应用名共线**');
      near(v2.statusBoxW, C - (VALUE_X + EDGE_X), 0.05, tag + ' V2 状态 label 盒宽被压窄 ＝ C − (值列 ' + Math.round(VALUE_X * 100) / 100 + ' ＋ 行内沿 16.8)（实测 ' + v2.statusBoxW + '，V1 是 ' + v1.statusBoxW + '）');
      ok(v2.statusBoxW < v1.statusBoxW, tag + ' V2 状态 label 可用宽确实比 V1 窄（' + v2.statusBoxW + ' < ' + v1.statusBoxW + '）');
      /* V3 标签左对齐 */
      ok(v3.kTextAlign === 'left', tag + ' V3 标签在列内**左对齐**（实测 text-align=' + v3.kTextAlign + '）');
      near(v3.dLabelEdge, 0, 0.05, tag + ' **V3 标签文字左沿 ＝ 线 A 内容左沿**（差 ' + v3.dLabelEdge + '）');
      near(v3.dBtnLabel, 0, 0.05, tag + ' **V3 按钮外沿 ＝ 标签文字左沿**（差 ' + v3.dBtnLabel + '）');
      near(v3.dBtnEdge, 0, 0.05, tag + ' V3 按钮外沿 ＝ 内容左沿（差 ' + v3.dBtnEdge + '）');
      near(v3.dStatusLabel, 0, 0.05, tag + ' V3 状态 label ＝ 标签文字左沿（差 ' + v3.dStatusLabel + '）');
      ok(v3.labelR <= EDGE_X + KCOL + 0.05, tag + ' V3 标签文字右沿 ' + v3.labelR + ' ≤ 标签列右沿 ' + Math.round((EDGE_X + KCOL) * 100) / 100 + '（左对齐不压到值列）');
      ok(v3.value - v3.labelR >= K_GAP - 0.05, tag + ' V3 标签文字右沿到值列还有 ' + Math.round((v3.value - v3.labelR) * 100) / 100 + 'px ≥ 缝 8px');
      /* 三格互不相同 */
      ok(Math.abs(v1.btnEdge - v2.btnEdge) > 10 && Math.abs(v1.btnEdge - v3.btnEdge) < 0.05 && Math.abs(v1.labelL - v3.labelL) > 10,
        tag + ' 三格互不相同：V1/V3 按钮外沿同（' + v1.btnEdge + '），V2 不同（' + v2.btnEdge + '）；V1/V3 标签文字左沿不同（' + v1.labelL + ' vs ' + v3.labelL + '）');
      ok(Math.abs(v2.value - v1.value) < 0.05 && Math.abs(v3.value - v1.value) < 0.05, tag + ' 三格的**值列 x 完全相同**（版本组结构没变）');
      /* 状态 label 第二行 */
      const twoLine = vis.filter((b) => b.statusLines >= 2);
      if (twoLine.length) {
        twoLine.forEach((b) => {
          near(b.statusInkLeft2, b.statusInkLeft, 0.05, tag + ' ' + b.id + ' 状态 label **第二行左沿 ＝ 第一行左沿**');
          b.statusLineLefts.forEach((x, i) => near(x, b.statusInkLeft, 0.05, tag + ' ' + b.id + ' 第' + (i + 1) + '行左沿在同一线上'));
          ok(b.statusLineLefts.length === b.statusLines, tag + ' ' + b.id + ' 行数＝range 矩形的行数（' + b.statusLineLefts.length + '/' + b.statusLines + '）');
        });
      } else {
        say('  ' + tag + ' 注：本视口下这个状态只有 1 行 ⇒ 「第二行左沿」在 430 才有（脚本不假装它存在）');
      }
      /* 上一轮那个「按钮 vs 状态文本」的量：仍量，但只是观测量 */
      [v1, v2, v3].forEach((x) => near(x.dBtnStatusInk, BTN_OWN, 0.1, tag + ' ' + x.variant + ' 观测：按钮文字墨迹 − 状态 label 墨迹 ＝ ' + x.dBtnStatusInk + 'px（＝按钮自身边框＋内边距 12.2；本轮不再三选一）'));
      /* 页面自己量的一份 vs 脚本独立量的一份 */
      VARIANTS.forEach((k) => {
        const pa = g.api.measured && g.api.measured[k];
        ok(!!pa, tag + ' 页面侧导出了 ' + k + ' 的实测');
        if (pa) {
          near(pa.btnEdge, m[k].btnEdge, 0.05, tag + ' ' + k + ' 页面侧量的按钮外沿 ＝ 脚本独立量的一致');
          near(pa.labelInkLeft, m[k].labelL, 0.05, tag + ' ' + k + ' 页面侧量的标签文字左沿 ＝ 脚本量的一致');
          near(pa.valueInkLeft, m[k].value, 0.05, tag + ' ' + k + ' 页面侧量的值列左沿 ＝ 脚本量的一致');
          near(pa.statusInk, m[k].status, 0.05, tag + ' ' + k + ' 页面侧量的状态 label 墨迹 ＝ 脚本量的一致');
        }
      });
      /* 打印整张表 */
      say('  ' + tag + ' 横向对齐线（相对内容列左沿，px）：');
      say('      格 ｜ 标签在列内 ｜ 标签文字左/右 ｜ 值列 ｜ 按钮外沿 ｜ 按钮文字墨迹 ｜ 状态label墨迹 ｜ 与线A差 ｜ 与值列差 ｜ 与标签文字差');
      VARIANTS.forEach((k) => {
        const x = m[k];
        say('      ' + k + ' ｜ ' + (x.kTextAlign === 'left' ? '左对齐' : '右对齐') + ' ｜ ' + x.labelL + ' / ' + x.labelR + ' ｜ ' + x.value + ' ｜ ' + x.btnEdge + ' ｜ ' + x.btnInk
          + ' ｜ ' + (x.status === null ? '—' : x.status + (x.status2 === null ? '' : ' / 2行 ' + x.status2)) + ' ｜ '
          + (x.dBtnEdge > 0 ? '+' : '') + x.dBtnEdge + ' ｜ ' + (x.dBtnValue > 0 ? '+' : '') + x.dBtnValue + ' ｜ ' + (x.dBtnLabel > 0 ? '+' : '') + x.dBtnLabel);
      });
      say('      状态 label 行数：' + VARIANTS.map((k) => k + ' ' + m[k].statusLines + ' 行（盒宽 ' + m[k].statusBoxW + '）').join('｜'));
      if (TABLE.length === 0 && vp.w === TABLE_V) {
        VARIANTS.forEach((k) => TABLE.push({ vp: vp.w, k, o: m[k] }));
      }
    }

    /* ══ 对齐线与状态无关（切到每一个状态都查） ══ */
    say('  · 状态切换（三格同时换；查对齐线不变）');
    const base = {};
    vis.forEach((b) => { base[b.variant] = { btnEdge: b.btnEdgeLeft, status: b.statusInkLeft, value: b.valueInkLeft, labelL: b.labelInkLeft }; });
    for (const s of STATES) {
      const c = await clickSel(send, evalJson, '[data-test=state-btn][data-mode=' + s.key + ']');
      ok(c.inView, tag + ' 查看器按钮「' + s.label + '」点之前在视口内');
      const m = await evalJson(PAGE_PROBE);
      ok(m.docState === s.key, tag + ' 切到 ' + s.key + '（实测 ' + m.docState + '）');
      const mv = m.blocks.filter((b) => b.visible);
      ok(mv.length === VARIANTS.length, tag + ' 状态 ' + s.key + '：三格都还在（实测 ' + mv.length + '）');
      ok(m.over.length === 0, tag + ' 状态 ' + s.key + '：无横向溢出（越界 ' + m.over.length + ' 个）');
      ok(m.docW === vp.w && m.bodyW === vp.w && m.vvW === vp.w, tag + ' 状态 ' + s.key + '：docW／bodyW／visualViewport 仍＝视口宽');
      mv.forEach((b) => {
        ok(b.left === 0 && b.w === vp.w, tag + ' 状态 ' + s.key + ' ' + b.id + ' 仍恰＝视口宽、左沿 0');
        near(b.colW, C, 0.02, tag + ' 状态 ' + s.key + ' ' + b.id + ' 内容列宽仍＝公式值');
        /* 对齐线不随状态变 */
        near(b.btnEdgeLeft, base[b.variant].btnEdge, 0.05, tag + ' 状态 ' + s.key + ' ' + b.id + ' 按钮外沿与默认态相同（' + b.btnEdgeLeft + '）');
        near(b.labelInkLeft, base[b.variant].labelL, 0.05, tag + ' 状态 ' + s.key + ' ' + b.id + ' 标签文字左沿与默认态相同');
        near(b.valueInkLeft, base[b.variant].value, 0.05, tag + ' 状态 ' + s.key + ' ' + b.id + ' 值列左沿与默认态相同');
        ok(b.btnDisabled === !s.enabled, tag + ' 状态 ' + s.key + ' ' + b.id + ' 按钮禁用＝' + (!s.enabled));
        if (s.text === null) {
          ok(b.statusExists === false && b.statusVisible === false, tag + ' 状态 ' + s.key + ' ' + b.id + '：**label 不存在也不可见**（' + b.statusExists + '/' + b.statusVisible + '）');
          ok(JSON.stringify(b.colKids) === JSON.stringify(COLKIDS_NO_LABEL), tag + ' 状态 ' + s.key + ' ' + b.id + '：内容列直接子元素＝4 个（无占位）');
        } else {
          ok(b.statusExists === true && b.statusVisible === true, tag + ' 状态 ' + s.key + ' ' + b.id + '：label 存在且可见');
          ok(b.statusText === s.text, tag + ' 状态 ' + s.key + ' ' + b.id + '：状态文案逐字（' + JSON.stringify(b.statusText) + '）');
          near(b.statusInkLeft, base[b.variant].status, 0.05, tag + ' 状态 ' + s.key + ' ' + b.id + ' 状态 label 墨迹与默认态相同（' + b.statusInkLeft + '）');
          if (b.statusLines > 1) near(b.statusInkLeft2, b.statusInkLeft, 0.05, tag + ' 状态 ' + s.key + ' ' + b.id + ' 第二行左沿 ＝ 第一行左沿');
        }
        if (s.key === 'checking') ok(b.btnDisabled === true, tag + ' **检查中 ⇒ 按钮 disabled**（' + b.id + '）');
        if (s.key === 'fixture') {
          ok(b.statusText.indexOf('⟨') >= 0 && !/[0-9a-f]{64}/.test(b.statusText), tag + ' 夹具文案用运行时占位、没有写死 64 位哈希（' + b.id + '）');
        }
      });
      if (s.key === 'fixture' || s.key === 'activated' || s.key === 'idle') {
        const row = mv.map((b) => b.id + ' ' + b.statusLines + '行/盒宽 ' + (b.statusBoxW === null ? '—' : b.statusBoxW) + '/块高 ' + b.h).join('｜');
        say('      ' + tag + ' ' + s.key + '：' + row);
      }
    }
    /* 回默认状态 */
    {
      const c = await clickSel(send, evalJson, '[data-test=state-btn][data-mode=' + DEFAULT_STATE + ']');
      ok(c.inView, tag + ' 回到默认状态的按钮点之前在视口内');
      const m = await evalJson(PAGE_PROBE);
      ok(m.docState === DEFAULT_STATE, tag + ' 已回到默认状态 ' + DEFAULT_STATE);
    }

    ok(state.errors.length === 0, tag + ' 没有 JS 报错（' + state.errors.join(' | ') + '）');

    /* ── [P] PNG ── */
    if (!NO_SHOT && SHOT_SET.has(vp.w)) {
      await send('Runtime.evaluate', { expression: 'window.scrollTo(0,0); 1', returnByValue: true });
      await sleep(150);
      const shotNow = await evalJson(PAGE_PROBE);
      for (const s2 of shotNow.shots) {
        if (s2.px2 > SHOT_MAX_PX) {
          say('  ' + tag + ' 如实拒绝：截图区 ' + s2.id + ' 的实测像素高 ' + s2.px2 + ' > Chromium 截图上限 ' + SHOT_MAX_PX
            + ' ⇒ 这张图**不落盘**（要拆图或如实说明，不许假装拍到）。页面本身不受影响，在浏览器里打开即可。');
          ok(false, tag + ' 截图区 ' + s2.id + ' 像素高 ' + s2.px2 + ' 超上限 ⇒ 交付图拍不出来（如实报失败，不假装）');
          continue;
        }
        const name = 'q-about-min.' + vp.w + '.png';
        const clip = { x: 0, y: Math.round(s2.top), width: vp.w, height: Math.ceil(s2.h), scale: 1 };
        const res = await Promise.race([
          send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip })
            .then((r) => ({ ok: true, data: r.data })).catch((e) => ({ ok: false, err: e.message })),
          sleep(90000).then(() => ({ ok: false, err: '截图 90s 没回来（如实报失败，不吞）' })),
        ]);
        ok(res.ok === true, tag + ' 截图区 ' + s2.id + ' 拍到了（' + (res.err || 'ok') + '）');
        if (!res.ok) continue;
        const buf = Buffer.from(res.data, 'base64');
        const file = join(OUT, name);
        writeFileSync(file, buf);
        const hdr = buf.subarray(0, 33);
        const sigOk = buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
        const pw = hdr.readUInt32BE(16), ph = hdr.readUInt32BE(20);
        ok(sigOk, tag + ' ' + name + ' PNG 头合法');
        ok(pw === vp.w * 2, tag + ' ' + name + ' 像素宽 ＝ 视口宽×2（' + pw + '）');
        ok(Math.abs(ph - Math.round(s2.h * 2)) <= 2, tag + ' ' + name + ' 像素高 ＝ 截图区 CSS 高×2（' + ph + ' vs ' + Math.round(s2.h * 2) + '）');
        ok(statSync(file).size > 20000, tag + ' ' + name + ' 非空（' + statSync(file).size + ' 字节）');
        say('  ' + tag + ' PNG → ' + name + '  ' + pw + '×' + ph + '  ' + Math.round(statSync(file).size / 1024) + ' KB（截图区 top=' + Math.round(s2.top) + '）');
      }
    } else if (!NO_SHOT) {
      say('  ' + tag + ' 行为已查（默认态／六个状态各一次）；这个视口的图默认不落盘（要它加 --all-shots）');
    }

    Object.keys(g.fonts || {}).forEach((k) => { (fontProfile[k] = fontProfile[k] || new Set()).add(g.fonts[k]); });

    ws.close();
  } catch (e) {
    FAILS.push(tag + ' 视图口执行失败：' + e.message);
  } finally {
    child.kill();
    await sleep(250);
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* 删不掉不影响结论 */ }
  }
}

/* ═══════════════════════════════════════════════════════════════════
 * 主流程
 * ═══════════════════════════════════════════════════════════════════ */
for (const vp of VIEWPORTS) {
  say('── 视口 ' + vp.w + '×' + vp.h + ' ──');
  await runViewport(vp);
}

say('');
say('── 跨视口：字号／行高／字距不随视口缩放 ──');
{
  let bad = 0;
  Object.keys(fontProfile).forEach((sel) => {
    const vals = [...fontProfile[sel]];
    if (vals.length > 1) { bad += 1; say('  变了：' + sel + ' ⇒ ' + vals.join(' ／ ')); }
  });
  if (VIEWPORTS.length > 1) {
    ok(Object.keys(fontProfile).length === FONT_KEYS.length, '字号剖面覆盖 ' + FONT_KEYS.length + ' 个位置（实测 ' + Object.keys(fontProfile).length + '）');
    ok(bad === 0, '每个位置的字号/行高/字距在所有视口下完全一致（变化 ' + bad + ' 处）');
  }
  Object.keys(fontProfile).forEach((sel) => say('  ' + sel + '：' + [...fontProfile[sel]].join(' ／ ')));
}

/* —— 三格的实测对齐线表（给 q-about-min.md 与报告用；只打印，不断言）—— */
say('');
say('── 三格实测对齐线（视口 ' + (TABLE.length ? TABLE[0].vp : '?') + '；相对内容列左沿，px）──');
if (TABLE.length) {
  say('| 格 | 标签在列内 | 标签文字左/右 | 值列 | 按钮外沿 | 按钮文字墨迹 | 状态label墨迹(行) | 与线A差 | 与值列差 | 与标签文字差 | 按钮文字−状态label |');
  say('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  TABLE.forEach((t) => {
    const o = t.o;
    say('| ' + t.k + ' | ' + (o.kTextAlign === 'left' ? '左对齐' : '右对齐') + ' | ' + o.labelL + ' / ' + o.labelR + ' | ' + o.value + ' | ' + o.btnEdge + ' | ' + o.btnInk
      + ' | ' + (o.status === null ? '—' : o.status + (o.status2 === null ? '' : ' / 2行 ' + o.status2) + '（' + o.statusLines + ' 行，盒宽 ' + o.statusBoxW + '）')
      + ' | ' + (o.dBtnEdge > 0 ? '+' : '') + o.dBtnEdge + ' | ' + (o.dBtnValue > 0 ? '+' : '') + o.dBtnValue + ' | ' + (o.dBtnLabel > 0 ? '+' : '') + o.dBtnLabel
      + ' | ' + (o.dBtnStatusInk > 0 ? '+' : '') + o.dBtnStatusInk + ' |');
  });
}

say('');
say('==============================');
if (FAILS.length === 0) {
  say('失败断言数：0（PASS ' + PASS + '）');
} else {
  say('失败断言数：' + FAILS.length + '（PASS ' + PASS + '）');
  FAILS.slice(0, 60).forEach((f, i) => say('  ' + (i + 1) + '. ' + f));
  if (FAILS.length > 60) say('  …（只列前 60 条，共 ' + FAILS.length + ' 条）');
}
say('==============================');
process.exit(FAILS.length === 0 ? 0 : 1);
