/*
 * check-about.mjs —— 「关于页表达」讨论原型（q-about.html）的【页面行为 ＋ 结构 ＋ 静态契约】自证脚本（可复跑）。
 *
 * ⚠ 它验的是**这一个原型页面**，**不是产品代码**：
 *   对象只有本目录下的 q-about.html（**只读打开**：Page.navigate 到 file:// URL；脚本不写、不改它）。
 *   额外读的文件只有两个，都是**只读**：
 *     ① prototype/css/theme-tech.css —— 用来逐项比对页面内嵌的令牌快照，并用 git hash-object 核它的 blob；
 *     ② git 仓库本身 —— 只为取 theme-tech.css 的 blob 哈希（不 commit、不 push、不 tag）。
 *
 * 断言清单（失败任一即 exit 1）：
 *  [G] 全局（只跑一次）：
 *      · 令牌快照逐项比对 theme-tech.css（值不一致数必须 0）；快照里**没有**「声明了却没用」的令牌；
 *        页面里每个 var() 都有声明；快照写明权威仍是 docs/design/visual-tokens.md、并记了主题文件的 blob 与记录时 HEAD；
 *        blob 与 `git hash-object prototype/css/theme-tech.css` 相等（快照的依据文件未被改动）；
 *      · 固定清单在页面上写明：只做内容更新／不做 APK 更新检查下载／Android 多一块「更新」＋Web 没有／
 *        两端其余内容一致／**「介绍」与「长篇限制说明」未被采纳 ⇒ 本页不写**／当前值不是文案定稿；
 *      · 四种状态结果文案（尚未检查／已是最新／已下载并切换／失败）都在页面上；
 *      · 候选并列、不排序、不写推荐、「选其中某一块 ≠ 采纳整页规格」、「不决定 JSON／MD 分界与产物字段」写明；
 *      · 宽度＝已选口径（含「24 是一次性扣除总量、不是左右各 12px」与「上界＝视口 V、不夹 660／860」）；
 *      · 自包含（无 <link／<script src／@import／url(http／fetch(／XMLHttpRequest）；
 *      · 视觉：无 @keyframes、无 animation、transition 只允许 0.15s 颜色类、无 box-shadow（除 var(--shadow)＝none）；
 *      · 应用层**没有**可折叠块（无 <details>/<summary>）；唯一的状态开关是原型夹具面板，它在**块外、截图范围外**；
 *      · 无内联 onclick（可点元素一律 addEventListener）。
 *  [V] 每个视口（320／430／1180 各跑一遍）：
 *      · innerWidth／innerHeight 精确等于目标；docW ＝ bodyW ＝ **visualViewport.width** ＝ 视口宽（防 shrink-to-fit）；
 *      · **每块恰＝视口宽、块左沿 0**；内容列宽＝公式复算值（±0.02）；列外余白＝(V−C)/2；
 *      · **无横向溢出**（所有可见元素都在 0…视口宽 内）；
 *      · 可点元素**只有** <a href> 与 <button type=button>；
 *      · 「一行一条」：同块内 label 右沿同一条竖线、值左沿同一条竖线，且 label 与值**同一行**（竖直区间重叠）；
 *      · 仓库链接：C1＝完整 URL、C2/C3＝短名，文字都**不折行**（1 个行盒）；C3 的提示是 <span>（不可点）；
 *      · 状态行：默认态**恰好**是那四种原文；每个更新块都有「运行时值」虚线小标；
 *      · 更新块位置：页内（A1/D3/D4/D5）与底部（D2：块高＝480、面板贴块底、上方留白）；
 *      · 平台：Android 块**恰有 1 个**更新块；Web 块**一个都没有**；A2 与 A2w 去掉更新块后**文字逐字相同**；
 *      · 字号/行高/字距在各视口**完全一致**（不随视口缩放）；块内**没有** box-shadow／animation；
 *      · 块内**没有**「介绍」类文字（一句话说明／诚实的限制／限制说明）。
 *  [F] 夹具态（＝硬要求里那对「收起／展开」状态的落地方式；本页**应用层没有可折叠块**，见下）：
 *      · 用**真鼠标**点原型夹具按钮 ⇒ 每个更新块的状态行都换成最长的如实报错（含运行时占位）；
 *      · 再查一遍**无横向溢出**、每块恰＝视口宽、内容列宽不变。
 *      ⚠ 这不是「给页面加了一个折叠功能」：那个开关在**块外、截图区外**（本脚本断言这两件事）。
 *  [P] PNG：默认只写硬要求点名的那张（q-about.430.png；320／1180 的行为照样查，但不落图，--all-shots 才写）：
 *      像素宽 ＝ 视口宽 × 2，高 ＝ 截图区 CSS 高 × 2（自己解析 PNG 头），文件非空；截图区左沿 0、宽＝视口宽。
 *  [S] 边界自证：`CHROME_BIN` 指到不存在的路径 ⇒ 本脚本必须**如实报错并 exit 2**，
 *      **不能**打印出「失败断言数：0」——用 `--selftest-chrome` 真的跑一次子进程来证明。
 *
 * 怎么跑（在仓库根或任意目录都行）：
 *   node items/app-ui/prototypes/check-about.mjs
 *   node items/app-ui/prototypes/check-about.mjs --no-shot          # 只跑断言，不重出 PNG
 *   node items/app-ui/prototypes/check-about.mjs --all-shots        # 连 320／1180 的 PNG 也写出来（默认只写 430 那张）
 *   node items/app-ui/prototypes/check-about.mjs --only=430         # 只跑某一个视口（排查用）
 *   node items/app-ui/prototypes/check-about.mjs --selftest-chrome  # 只跑「CHROME_BIN 指错 ⇒ 如实报错」这条边界
 *
 * 需要什么：
 *   - Node（用到内置 fetch／WebSocket／net，故需较新的 Node；本机实测 v25.9.0 通过）；
 *   - **本机无头 Chromium**：环境变量 CHROME_BIN → 否则 %LOCALAPPDATA%\Chromium\Application\chrome.exe。
 *     找不到就**如实报错并 exit 2**（CHROME_BIN 指到错路径也走这一条，不会假装通过）；
 *   - **不需要**任何 npm 依赖：不装包、不联网、不起静态服务（直接开 file://）；
 *   - **端口**：CDP 调试端口**先向内核要一个空闲端口**（net 监听 0 再关掉），**不写死**；
 *   - **仓库根**：从脚本所在目录**向上查找 prototype/css/theme-tech.css** 来定位，**不写死层级**。
 *
 * 副作用：临时目录建一个 Chromium profile 并删掉；默认重写本目录 3 张 PNG（复跑可能让 PNG 变脏，正常现象）；
 *         q-about.html 本身**只读打开**，不写、不改。
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync, statSync } from 'node:fs';
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

const PAGE = join(OUT, 'q-about.html');
const THEME = join(ROOT, 'prototype', 'css', 'theme-tech.css');
const argv = process.argv.slice(2);
const NO_SHOT = argv.includes('--no-shot');
const SHOT_ALL = argv.includes('--all-shots');
/* 交付的那张图＝硬要求点名的 q-about.430.png（默认只出它）；
 * 320／1180 的行为**照样查**，只是默认不落图（--all-shots 才把三张都写出来）。 */
const SHOT_SET = SHOT_ALL ? new Set([320, 430, 1180]) : new Set([430]);
const ONLY = (argv.find((a) => a.startsWith('--only=')) || '').split('=')[1];
const VIEWPORTS = [
  { w: 320, h: 568, mobile: true },
  { w: 430, h: 932, mobile: true },   // 硬要求点名的那一档（q-about.430.png）
  { w: 1180, h: 900, mobile: false },
].filter((v) => !ONLY || String(v.w) === ONLY);

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
    cwd: OUT, encoding: 'utf8', timeout: 180000,
    env: { ...process.env, CHROME_BIN: bogus },
  });
  const out = r.stdout || '', err = r.stderr || '';
  const saidReason = /找不到无头 Chromium/.test(err) && err.includes(bogus);
  const notFakePass = out.indexOf('失败断言数：0') < 0;
  say('【边界自证】CHROME_BIN = ' + bogus + '（该路径不存在）');
  say('  退出码：' + r.status + '（要求 ≠ 0，这里是 2 表示环境缺失）');
  say('  stderr 说了原因：' + (saidReason ? '是' : '否') + ' → ' + JSON.stringify(err.trim().split(/\r?\n/)[0] || ''));
  say('  stdout 里没有「失败断言数：0」（不假装通过）：' + (notFakePass ? '是' : '否'));
  say('  完整 stderr：');
  err.trim().split(/\r?\n/).forEach((l) => say('    ' + l));
  const good = r.status === 2 && saidReason && notFakePass;
  say('\n===== 边界自证：' + (good ? '通过' : '失败') + ' =====');
  process.exit(good ? 0 : 1);
}

/* ═══════════════════════════════════════════════════════════════════
 * [G] 静态检查（不开浏览器）
 * ═══════════════════════════════════════════════════════════════════ */
if (!existsSync(PAGE)) { console.error('找不到原型页面：' + PAGE); process.exit(2); }
const HTML = readFileSync(PAGE, 'utf8');
const THEME_CSS = readFileSync(THEME, 'utf8');

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
const themeTokens = parseTokens(THEME_CSS);

/* G1 令牌快照逐项比对 */
{
  let mism = 0, missing = 0;
  snapTokens.forEach((v, k) => {
    if (!themeTokens.has(k)) { missing += 1; say('  快照里的令牌 ' + k + ' 在 theme-tech.css 里找不到'); return; }
    if (themeTokens.get(k) !== v) {
      mism += 1;
      say('  值不一致 ' + k + '：快照 ' + v + ' ／ 主题 ' + themeTokens.get(k));
    }
  });
  ok(snapTokens.size >= 20, '快照里声明的令牌数 ≥ 20（实测 ' + snapTokens.size + '）');
  ok(missing === 0, '快照里的令牌在 theme-tech.css 里都存在（缺 ' + missing + '）');
  ok(mism === 0, '快照与 theme-tech.css 的值逐项一致（不一致 ' + mism + '）');
  say('  [G] 令牌快照：' + snapTokens.size + ' 条，值不一致 0，缺失 0（与 ' + THEME + ' 比对）');

  /* G2 没有「声明了却没用」的令牌 */
  const pageWithoutSnap = HTML.replace(SNAP, '\u0000').replace(DRAFT, '\u0001');
  const unused = [];
  snapTokens.forEach((_v, k) => { if (!pageWithoutSnap.includes('var(' + k)) unused.push(k); });
  ok(unused.length === 0, '快照里的令牌都被用到（未用：' + unused.join(',') + '）');
  /* G3 页面里每个 var() 都有声明（快照或草案值块里都算） */
  const usedVars = new Set();
  const reV = /var\(\s*(--[a-z0-9-]+)/gi;
  let mv;
  while ((mv = reV.exec(HTML))) usedVars.add(mv[1]);
  const undeclared = [];
  usedVars.forEach((k) => { if (!snapTokens.has(k) && !draftTokens.has(k)) undeclared.push(k); });
  ok(undeclared.length === 0, '页面里每个 var() 都有声明（未声明：' + undeclared.join(',') + '）');
  say('  [G] var() 使用：' + usedVars.size + ' 个，全部有声明；未用令牌 0 个');
}

/* G4 快照的依据：blob 哈希 + 记录时 HEAD */
{
  ok(/权威仍是 docs\/design\/visual-tokens\.md/.test(HTML), '快照写明「权威仍是 docs/design/visual-tokens.md」');
  ok(/git stat? 记录|记录时的 HEAD|data-head-sha/.test(HTML) || HTML.includes('data-head-sha'), '页面记了记录时的 HEAD');
  const declared = (HTML.match(/data-token-blob="([0-9a-f]{40})"/) || [])[1];
  ok(!!declared, '页面写了 data-token-blob（40 位）');
  const headShort = (HTML.match(/data-head-sha="([0-9a-f]{6,12})"/) || [])[1];
  ok(!!headShort, '页面写了 data-head-sha');
  const git = spawnSync('git', ['-C', ROOT, 'hash-object', 'prototype/css/theme-tech.css'], { encoding: 'utf8' });
  if (git.status !== 0 || !git.stdout) {
    FAILS.push('取不到 theme-tech.css 的 blob 哈希（git 不可用或不在仓库里）：' + (git.stderr || '').trim());
  } else {
    const blob = git.stdout.trim();
    ok(blob === declared, 'theme-tech.css 的 blob ＝ 页面记录的 ' + declared + '（实测 ' + blob + '）');
    say('  [G] theme-tech.css blob：' + blob + '（记录时的 HEAD：' + headShort + '）');
  }
  const st = spawnSync('git', ['-C', ROOT, 'status', '--porcelain', '--', 'prototype/css/theme-tech.css'], { encoding: 'utf8' });
  ok(st.status === 0 && st.stdout.trim() === '', 'theme-tech.css 相对 HEAD 没有本地改动（快照依据是提交过的文件）');
}

/* G5 固定清单 / 候选并列 / 宽度口径 的声明 */
{
  const need = [
    ['只做「内容更新」', '固定清单：只做内容更新'],
    ['不做应用安装包的更新检查', '固定清单：不做 APK 更新的检查／下载'],
    ['Android 多一块「更新」', '固定清单：Android 多一块「更新」'],
    ['Web 没有这一块', '固定清单：Web 没有这一块'],
    ['两端其余内容一致', '固定清单：两端其余内容一致'],
    ['「介绍」与「长篇限制说明」未被采纳', '固定清单：介绍与长篇限制说明未被采纳'],
    ['本页不写', '固定清单：本页不写介绍／长篇说明'],
    ['不是页面文案定稿', '真实值标注：不是文案定稿'],
    ['C = min(V, max(320, 0.88 × (V − 24)))', '宽度＝已选口径原文'],
    ['一次性从视口宽扣掉的总量', '硬纠正：24 是扣除总量'],
    ['左右各 12px', '硬纠正：不是左右各 12px'],
    ['不夹', '硬纠正：不夹 660／860'],
    ['候选 <b>并列、不排序、不写推荐</b>', '候选并列／不排序／不写推荐'],
    ['选其中某一块 ≠ 采纳整页规格', '选某块 ≠ 采纳整页规格'],
    ['不决定', '不决定 JSON／MD 分界与产物字段'],
    ['JSON／MD', '提到 JSON／MD'],
    ['原型说明 ／ 夹具标注，不属于应用页面', '图内醒目标注'],
  ];
  need.forEach(([s, label]) => ok(HTML.includes(s), '页面写明了：' + label));
}

/* G6 自包含 / 视觉 / 应用层没有折叠块 */
{
  const forbidden = [
    ['<link ', '没有 <link（外部样式/图标）'],
    ['<script src', '没有外部脚本'],
    ['@import', '没有 @import'],
    ['url(http', 'CSS 里没有 url(http…)'],
    ['fetch(', '没有 fetch('],
    ['XMLHttpRequest', '没有 XMLHttpRequest'],
    ['@keyframes', '没有 @keyframes'],
    ['animation:', '没有 animation'],
    ['<details', '没有 <details>（应用层没有可折叠块）'],
    ['<summary', '没有 <summary>'],
    ['onclick=', '没有内联 onclick'],
  ];
  forbidden.forEach(([s, label]) => ok(!HTML.includes(s), label));
  /* transition 只允许 var(--row-transition)（＝颜色/边框/底色的 0.15s） */
  const bad = [];
  const reT = /transition:\s*([^;}]+)/gi;
  let mt;
  while ((mt = reT.exec(HTML))) {
    const v = mt[1].replace(/\s+/g, ' ').trim();
    if (v === 'var(--row-transition)') continue;
    if (!/^((color|border-color|background|background-color)\s+0\.15s\s+ease\s*,?\s*)+$/.test(v + ' ')) bad.push(v);
  }
  ok(bad.length === 0, 'transition 只有 0.15s 颜色类（违规：' + bad.join(' | ') + '）');
  /* box-shadow 只允许 var(--shadow) */
  const badShadow = [];
  const reS = /box-shadow:\s*([^;}]+)/gi;
  let ms;
  while ((ms = reS.exec(HTML))) {
    const v = ms[1].replace(/\s+/g, ' ').trim();
    if (v !== 'var(--shadow)') badShadow.push(v);
  }
  ok(badShadow.length === 0, 'box-shadow 只有 var(--shadow)（违规：' + badShadow.join(' | ') + '）');
  ok(HTML.includes('--shadow: none;'), '--shadow 的值是 none');
}

/* G7 四种状态结果文案：页面**自己的定义**必须与脚本期望逐字相同（运行时探针里还会再查一次 DOM）*/
function expectedStatusLines() {
  return {
    idle: '尚未检查内容更新。',
    fresh: '已是最新内容（远端 2026.10.16.20）。',
    switched: '新内容 2026.10.16.20 已下载、校验通过并已切换生效；回到目录后采用。',
    failed: '更新失败：内容校验未通过；旧内容保留（仍是 2026.10.16.20）。',
  };
}
{
  /* 页面把文案按「文字段 ＋ 运行时值段」拼起来（版本号是运行时值）⇒ 静态只查**文字段**都在，
     四种完整原文由运行时探针逐字比对（见 [V] 里的状态行断言）。 */
  const exp = expectedStatusLines();
  const frags = ['尚未检查内容更新。', '已是最新内容（远端 ', ' 已下载、校验通过并已切换生效；回到目录后采用。',
                 '更新失败：内容校验未通过；旧内容保留（仍是 '];
  frags.forEach((f) => ok(HTML.includes(f), '页面源码里有状态文案片段 ' + JSON.stringify(f)));
  ok(HTML.includes("'2026.10.16.20'") || HTML.includes('contentVersion: \'2026.10.16.20\''), '内容版本用的是当前值 2026.10.16.20');
  say('  [G] 状态行四种文案：页面侧定义与脚本期望的比对在运行时逐字做（见下）');
}

/* ═══════════════════════════════════════════════════════════════════
 * Chromium / CDP
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
  const state = { errors: [], requests: [], events: [] };
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
    } else if (m.method) {
      state.events.push(m.method);
    }
  });
  const send = (method, params = {}) => {
    const my = ++id;
    ws.send(JSON.stringify({ id: my, method, params }));
    return new Promise((res, rej) => pend.set(my, { res, rej }));
  };
  return { send, state, ws };
}

/* 页面侧探针（只读；不写页面）—— 用 IIFE 返回一条 JSON 字符串 */
const PAGE_PROBE = [
  '(function(){',
  '  function R(e){return e.getBoundingClientRect();}',
  '  function P(v){return Math.round(v*100)/100;}',
  '  function CS(e,p){return getComputedStyle(e)[p];}',
  '  function CV(e,p){return getComputedStyle(e).getPropertyValue(p);}',
  '  function inkW(e){var r=document.createRange();r.selectNodeContents(e);var rs=r.getClientRects(),w=0;for(var i=0;i<rs.length;i++)w=Math.max(w,rs[i].width);return P(w);}',
  '  function boxes(e){var r=document.createRange();r.selectNodeContents(e);return r.getClientRects().length;}',
  '  function elBoxes(e){return e.getClientRects().length;}',
  /* 真实行数（**块级元素**）：内容高 ÷ 行高。
   * ⚠ 不用「Range 行盒的不同 top 个数」：同一行里字号不同的内联片段（值用等宽、标签用正文字号）的 top 会差 1px，
   * 于是被误数成两行（第一版就踩了这个）。内联元素（<a>）请用 elBoxes()。 */
  '  function linesOf(e){var c=getComputedStyle(e);var h=e.clientHeight-parseFloat(c.paddingTop||0)-parseFloat(c.paddingBottom||0);var lh=parseFloat(c.lineHeight)||parseFloat(c.fontSize)*1.2;return Math.max(1,Math.round(h/lh));}',
  '  function wrapped(e){return linesOf(e)>1;}',
  '  var doc=document.documentElement;',
  '  var out={};',
  '  out.vw=innerWidth; out.vh=innerHeight; out.dpr=devicePixelRatio;',
  '  out.docW=doc.scrollWidth; out.bodyW=document.body.scrollWidth;',
  '  out.vvW=P(visualViewport.width); out.vvH=P(visualViewport.height);',
  '  out.ready=doc.dataset.ready||"";  out.fixture=doc.dataset.fixture||"";',
  '  out.params={deduct:doc.dataset.deduct,pct:doc.dataset.pct,floor:doc.dataset.floor,cap:doc.dataset.cap,blob:doc.dataset.tokenBlob,head:doc.dataset.headSha};',
  '  var api=window.__ABOUT_PROTO__||null;',
  '  out.api=api?{deduct:api.deduct,pct:api.pct,floor:api.floor,statusLines:api.statusLines,fixtureLine:api.fixtureLine}:null;',
  '  var shot=R(document.querySelector("[data-shotframe]"));',
  '  out.shot={left:P(shot.left),w:P(shot.width),h:P(shot.height),top:P(shot.top)};',
  /* 溢出扫描：所有可见元素 */
  '  out.over=[];',
  '  [].slice.call(document.querySelectorAll("body *")).forEach(function(e){',
  '    var r=R(e); if(r.width<=0&&r.height<=0) return;',
  '    if(r.right>innerWidth+0.5||r.left<-0.5) out.over.push({cls:(e.className||"")+"|"+e.tagName,left:P(r.left),right:P(r.right)});',
  '  });',
  /* 可点元素（全页） */
  '  out.ctls=[];',
  '  [].slice.call(document.querySelectorAll("a,button,[tabindex],[onclick]")).forEach(function(e){',
  '    out.ctls.push({tag:e.tagName,type:e.getAttribute("type"),href:e.hasAttribute("href"),cls:e.className||"",inPg:!!e.closest(".pg"),ck:!!e.closest("[data-test=fixture-panel]")});',
  '  });',
  '  out.details=document.querySelectorAll("details,summary").length;',
  '  out.fixturePanel={inShot:!!document.querySelector("[data-test=fixture-panel]").closest("[data-shotframe]"),insidePg:!!document.querySelector("[data-test=fixture-panel]").closest(".pg"),tag:document.querySelector("[data-test=fixture-toggle]").tagName,type:document.querySelector("[data-test=fixture-toggle]").getAttribute("type")};',
  /* 每块 */
  '  out.blocks=[];',
  '  [].slice.call(document.querySelectorAll(".pg[data-test=page]")).forEach(function(pg){',
  '    var rp=R(pg), col=pg.querySelector("[data-test=col]"), rc=col?R(col):null;',
  '    var b={id:pg.dataset.block,axis:pg.dataset.axis,platform:pg.dataset.platform,',
  '      left:P(rp.left),w:P(rp.width),h:P(rp.height),colLeft:rc?P(rc.left):null,colW:rc?P(rc.width):null,colH:rc?P(rc.height):null,',
  '      isScreen:pg.classList.contains("is-screen"),',
  '      cwVar:CV(pg,"--cw").trim(),',
  '      kv:[],kvRows:0,compact:0,text:pg.innerText.replace(/\\s+/g," ").trim()};',
  '    [].slice.call(pg.querySelectorAll("[data-test=kv]")).forEach(function(row){',
  '      var k=row.querySelector("[data-test=k]"),v=row.querySelector("[data-test=v]");',
  '      var rk=R(k),rv=R(v);',
  '      var overlap=Math.min(rk.bottom,rv.bottom)-Math.max(rk.top,rv.top);',
  '      b.kv.push({kRight:P(rk.right-(rc?rc.left:0)),vLeft:P(rv.left-(rc?rc.left:0)),kWrapped:wrapped(k),vWrapped:wrapped(v),hasHint:!!v.querySelector("[data-test=repohint]"),',
  '                  overlap:P(overlap),row:k.textContent,vText:v.textContent,kSize:CS(k,"fontSize"),vSize:CS(v,"fontSize")});',
  '    });',
  '    b.kvRows=b.kv.length;',
  '    b.compact=pg.querySelectorAll("[data-test=cl]").length;',
  '    var a=pg.querySelector("[data-test=repolink]");',
  '    b.repo=a?{text:a.textContent,w:inkW(a),boxes:elBoxes(a),wrapped:elBoxes(a)>1,tag:a.tagName,href:a.getAttribute("href"),target:a.getAttribute("target")}:null;',
  '    var h=pg.querySelector("[data-test=repohint]");',
  '    b.hint=h?{text:h.textContent,tag:h.tagName}:null;',
  '    var st=pg.querySelector("[data-test=status]");',
  '    b.status=st?{text:st.textContent,lines:linesOf(st),boxes:boxes(st),w:inkW(st),warn:st.classList.contains("is-warn"),',
  '                  left:P(R(st).left-(rc?rc.left:0)),right:P((rc?rc.right:0)-R(st).right),verCount:st.querySelectorAll("[data-test=verval]").length}:null;',
  '    b.hasRunmark=!!pg.querySelector("[data-test=runmark]");',
  '    b.runmark=(pg.querySelector("[data-test=runmark]")||{}).textContent||"";',
  '    var up=pg.querySelector("[data-test=upd]");',
  '    b.upd=up?{pos:up.dataset.pos,top:P(R(up).top-rp.top),h:P(R(up).height),bottomFrom:P(rp.bottom-R(up).bottom),',
  '                borderTop:CS(up,"borderTopWidth"),shadow:CS(up,"boxShadow")}:null;',
  '    var bt=pg.querySelector("[data-test=checkbtn]");',
  '    b.btn=bt?{text:bt.textContent,tag:bt.tagName,type:bt.getAttribute("type")}:null;',
  '    var prev=up?up.previousElementSibling:null;',
  '    b.updGapPrev=(up&&prev)?P(R(up).top-R(prev).bottom):null;',
  /* 块内样式抽查 */
  '    b.style=[];',
  '    ["brand","k","v","repolink","gtitle","cl","status","checkbtn","upd-title"].forEach(function(x){',
  '      var e=pg.querySelector("[data-test="+x+"]");',
  '      if(e) b.style.push({sel:x,size:CS(e,"fontSize"),lh:CS(e,"lineHeight"),ls:CS(e,"letterSpacing"),shadow:CS(e,"boxShadow"),anim:CS(e,"animationName")});',
  '    });',
  '    b.shadows=0; b.anims=0;',
  '    [].slice.call(pg.querySelectorAll("*")).forEach(function(e){',
  '      var s=CS(e,"boxShadow"); if(s&&s!=="none") b.shadows++;',
  '      var an=CS(e,"animationName"); if(an&&an!=="none") b.anims++;',
  '    });',
  '    b.updCount=pg.querySelectorAll("[data-test=upd]").length;',
  '    b.ctlCount=pg.querySelectorAll("a,button,[tabindex],[onclick]").length;',
  '    b.transitions=0;',
  '    [].slice.call(pg.querySelectorAll("*")).forEach(function(e){if(CS(e,"transitionDuration")!=="0s")b.transitions++;});',
  '    out.blocks.push(b);',
  '  });',
  /* A2 与 A2w 的文字对照（去掉更新块） */
  '  function textNoUpd(id){var pg=null;[].slice.call(document.querySelectorAll(".pg")).forEach(function(p){if(p.dataset.block===id)pg=p;});',
  '    var c=pg.cloneNode(true); [].slice.call(c.querySelectorAll("[data-test=upd]")).forEach(function(e){e.remove();});',
  '    return c.innerText.replace(/\\s+/g," ").trim();}',
  '  out.a2=textNoUpd("A2"); out.a2w=textNoUpd("A2w");',
  '  return JSON.stringify(out);',
  '})()',
].join('\n');

const FONT_KEYS = ['brand', 'k', 'v', 'repolink', 'gtitle', 'cl', 'status', 'checkbtn', 'upd-title'];
const fontProfile = {};   // sel → set of "size|lh|ls"
const TABLE = [];         // 每块几何表（从 TABLE_V 那一轮收集，供输出／写 md）
const TABLE_V = VIEWPORTS.some((v) => v.w === 430) ? 430 : (VIEWPORTS[0] ? VIEWPORTS[0].w : 430);

async function runViewport(vp) {
  const tag = '[' + vp.w + ']';
  const port = await freePort();
  const profile = mkdtempSync(join(tmpdir(), 'check-about-'));
  const child = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--user-data-dir=' + profile,
    '--remote-debugging-port=' + port, 'about:blank',
  ], { stdio: 'ignore' });

  let exitCode = 0;
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

    const narrow = vp.w <= 320;

    const g = await evalJson(PAGE_PROBE);

    /* —— 页面侧状态文案定义与脚本期望逐字相同 —— */
    {
      const exp = expectedStatusLines();
      ok(!!g.api && !!g.api.statusLines, tag + ' 页面导出了状态行定义');
      Object.keys(exp).forEach((k) => ok(g.api.statusLines[k] === exp[k],
        tag + ' 页面侧状态文案［' + k + '］逐字相同（实测 ' + JSON.stringify(g.api.statusLines[k]) + '）'));
    }

    /* —— 视口与页面级 —— */
    ok(g.vw === vp.w, tag + ' innerWidth ＝ ' + vp.w + '（实测 ' + g.vw + '）');
    ok(g.vh === vp.h, tag + ' innerHeight ＝ ' + vp.h + '（实测 ' + g.vh + '）');
    ok(g.docW === vp.w, tag + ' documentElement.scrollWidth ＝ ' + vp.w + '（实测 ' + g.docW + '）');
    ok(g.bodyW === vp.w, tag + ' body.scrollWidth ＝ ' + vp.w + '（实测 ' + g.bodyW + '）');
    ok(g.vvW === vp.w, tag + ' visualViewport.width ＝ ' + vp.w + '（实测 ' + g.vvW + '，防 shrink-to-fit）');
    ok(g.ready === '1', tag + ' 页面自报 ready');
    ok(g.params.deduct === '24' && g.params.pct === '88' && g.params.floor === '320' && g.params.cap === 'viewport',
      tag + ' 页面上写明宽度参数（24／88／320／上界＝视口）');
    ok(g.api && g.api.deduct === 24 && g.api.pct === 88 && g.api.floor === 320, tag + ' 页面侧公式参数＝脚本期望');
    ok(g.details === 0, tag + ' 应用层没有可折叠块（<details>/<summary> 共 ' + g.details + ' 个）');
    ok(!!g.fixturePanel && !g.fixturePanel.insidePg, tag + ' 夹具面板在**块外**');
    ok(g.fixturePanel.tag === 'BUTTON' && g.fixturePanel.type === 'button', tag + ' 夹具开关是 <button type=button>');
    ok(g.shot.left === 0 && g.shot.w === vp.w, tag + ' 截图区左沿 0、宽＝视口宽（实测 ' + g.shot.left + '／' + g.shot.w + '）');
    ok(g.over.length === 0, tag + ' 无横向溢出（越界元素 ' + g.over.length + ' 个：' + JSON.stringify(g.over.slice(0, 4)) + '）');

    /* 外部请求 */
    const badReq = [...new Set(state.requests)].filter((u) => !u.startsWith('file://'));
    ok(badReq.length === 0, tag + ' 没有外部请求（非 file:// 的 ' + badReq.length + ' 个：' + badReq.slice(0, 3).join(',') + '）');

    /* 可点元素 */
    const badCtl = g.ctls.filter((c) => !((c.tag === 'A' && c.href) || (c.tag === 'BUTTON' && c.type === 'button')));
    ok(badCtl.length === 0, tag + ' 可点元素只有 <a href> 与 <button type=button>（违规 ' + badCtl.length + ' 个）');
    ok(g.ctls.length >= 12, tag + ' 页面里的可点元素数 ≥ 12（实测 ' + g.ctls.length + '）');

    /* —— 公式复算 —— */
    const A = vp.w - 24, raw = 0.88 * A;
    const C = Math.min(vp.w, Math.max(320, raw));
    ok(C <= vp.w, tag + ' C ≤ V（上界＝视口 V）');
    if (vp.w === 320) ok(C === 320 && C > A, tag + ' V=320 时 C=320 > A=296（证明 24 是扣除总量，不是左右各 12）');
    if (vp.w === 1180) ok(C > 860, tag + ' V=1180 时 C=' + C + ' > 860（证明没有夹 860 上限）');

    /* —— 每块 —— */
    ok(g.blocks.length === 15, tag + ' 块数 ＝ 15（实测 ' + g.blocks.length + '）');
    const byId = {};
    g.blocks.forEach((b) => { byId[b.id] = b; });
    ['A1', 'A2', 'A2w', 'A3', 'B1', 'B2', 'B3', 'B3i', 'C1', 'C2', 'C3', 'D2', 'D3', 'D4', 'D5']
      .forEach((id) => ok(!!byId[id], tag + ' 有块 ' + id));
    g.blocks.forEach((b) => {
      ok(b.left === 0, tag + ' ' + b.id + ' 块左沿 0（实测 ' + b.left + '）');
      ok(b.w === vp.w, tag + ' ' + b.id + ' 块宽恰＝视口宽 ' + vp.w + '（实测 ' + b.w + '）');
      near(b.colW, C, 0.02, tag + ' ' + b.id + ' 内容列宽＝公式复算 ' + C);
      near(b.colLeft, (vp.w - C) / 2, 0.02, tag + ' ' + b.id + ' 列外余白＝(V−C)/2');
      ok(b.shadows === 0, tag + ' ' + b.id + ' 块内没有 box-shadow（' + b.shadows + '）');
      ok(b.anims === 0, tag + ' ' + b.id + ' 块内没有 animation（' + b.anims + '）');
      ok(!/一句话说明|诚实的限制|限制说明|tagline|个人诗歌阅读/.test(b.text), tag + ' ' + b.id + ' 块内没有「介绍／长篇限制说明」类文字');
      ok(b.updCount === (b.platform === 'android' ? 1 : 0), tag + ' ' + b.id + ' 平台=' + b.platform + ' ⇒ 更新块 ' + b.updCount + ' 个');
      /* 「一行一条」对齐 */
      if (b.kvRows >= 2) {
        const ks = b.kv.map((x) => x.kRight), vs = b.kv.map((x) => x.vLeft);
        near(Math.max(...ks) - Math.min(...ks), 0, 0.6, tag + ' ' + b.id + ' label 右沿同一条竖线');
        near(Math.max(...vs) - Math.min(...vs), 0, 0.6, tag + ' ' + b.id + ' 值左沿同一条竖线');
        b.kv.forEach((x, i) => {
          ok(x.overlap > 4, tag + ' ' + b.id + ' 第' + (i + 1) + '条 label 与值同一行（竖直重叠 ' + x.overlap + 'px）');
          ok(!x.kWrapped, tag + ' ' + b.id + ' 第' + (i + 1) + '条 label 不折行');
          /* 窄屏（320）上长值（完整 URL、带提示的那条）会折行 —— 那是**如实后果**，不是断言失败：
             430 及以上要求「值不折行（带提示的那条除外）」，320 上只把折行条数打印出来。 */
          if (!narrow) ok(!x.vWrapped || x.hasHint, tag + ' ' + b.id + ' 第' + (i + 1) + '条值不折行（带提示的那条除外）');
        });
        const wrappedRows = b.kv.filter((x) => x.vWrapped).length;
        if (wrappedRows) say('  ' + tag + ' ' + b.id + '：值折行 ' + wrappedRows + ' 条（' + (narrow ? '320 上长值的如实后果' : '只可能是带提示的那条') + '）');
      }
      /* 尺寸抽样进剖面（跨视口比较「字号不随视口缩放」） */
      b.style.forEach((s) => {
        const k = s.sel;
        const val = s.size + '|' + s.lh + '|' + s.ls;
        (fontProfile[k] = fontProfile[k] || new Set()).add(val);
      });
    });

    /* —— 仓库链接 —— */
    {
      const c1 = byId.C1.repo, c2 = byId.C2.repo, c3 = byId.C3.repo;
      ok(c1.text === 'https://github.com/WSQS/suofei', tag + ' C1 链接文字＝完整 URL（实测 ' + c1.text + '）');
      ok(c2.text === 'github.com/WSQS/suofei' && c3.text === 'github.com/WSQS/suofei', tag + ' C2／C3 链接文字＝短名');
      [['C1', c1], ['C2', c2], ['C3', c3]].forEach(([id, r]) => {
        if (narrow) {
          say('  ' + tag + ' ' + id + ' 仓库链接行盒 ' + r.boxes + ' 个（宽 ' + r.w + ' ⇒ 值格可用 ' + Math.round((C - 33.6 - 68.22 - 8) * 100) / 100 + '）');
          return;
        }
        ok(r.boxes === 1 && !r.wrapped, tag + ' ' + id + ' 仓库链接不折行（行盒 ' + r.boxes + ' 个，宽 ' + r.w + ' ⇒ 可用 ' + Math.round((C - 33.6) * 100) / 100 + '）');
      });
      if (narrow) {
        /* 320 上的对照事实：短名放得下（1 行），完整 URL 放不下（折行）—— 如实打印，并断言短名确实不折行。 */
        ok(c2.boxes === 1 && !c2.wrapped, tag + ' 320 上短名仍在 1 行内（实测 ' + c2.boxes + ' 个行盒）');
        ok(c1.boxes > 1 || c1.wrapped, tag + ' 320 上完整 URL 会折行（如实后果：' + c1.boxes + ' 个行盒）');
        say('  ' + tag + ' 对照：完整 URL 在 320 上折行（' + c1.boxes + ' 个行盒，宽 ' + c1.w + '），短名不折行（宽 ' + c2.w + '）');
      }
      ok(c1.tag === 'A' && c1.href === 'https://github.com/WSQS/suofei', tag + ' 仓库链接是 <a href> 指向仓库');
      ok(!!byId.C3.hint && byId.C3.hint.tag === 'SPAN', tag + ' C3 的「预期提示」是 <span>（不可点）而不是链接');
      ok(!byId.C1.hint && !byId.C2.hint, tag + ' C1／C2 没有预期提示（对照）');
    }

    /* —— 状态行四种文案（默认态）—— */
    {
      const exp = expectedStatusLines();
      const map = { D3: 'fresh', D4: 'switched', D5: 'failed' };
      Object.keys(map).forEach((id) => {
        const b = byId[id];
        ok(!!b.status, tag + ' ' + id + ' 有状态行');
        ok(b.status && b.status.lines >= 1, tag + ' ' + id + ' 状态行行数 ≥ 1（实测 ' + (b.status ? b.status.lines : '?') + '）');
        ok(b.status.text === exp[map[id]], tag + ' ' + id + ' 状态行原文＝' + JSON.stringify(exp[map[id]]) + '（实测 ' + JSON.stringify(b.status ? b.status.text : null) + '）');
        say('  ' + tag + ' ' + id + ' 状态行：' + b.status.lines + ' 行，最长行宽 ' + b.status.w + '（值格可用 ' + Math.round((C - 33.6) * 100) / 100 + '）');
      });
      ok(byId.A1.status.text === exp.idle, tag + ' A1（页内·尚未检查）状态行原文＝' + JSON.stringify(exp.idle) + '（实测 ' + JSON.stringify(byId.A1.status.text) + '）');
      ok(byId.D2.status.text === exp.idle, tag + ' D2（底部·尚未检查）状态行＝尚未检查');
      /* 失败那一行用 warn 通道，其余不用 */
      ok(byId.D5.status.warn === true, tag + ' D5（失败）状态行走 warn 通道');
      ok(byId.D3.status.warn === false && byId.D4.status.warn === false, tag + ' D3／D4 状态行不走 warn 通道');
      ok(byId.D5.status.verCount >= 1, tag + ' D5 状态行里的版本号是运行时值元素（有虚线小标）');
      /* 每个更新块都有「运行时值」小标，且默认态不是夹具文案 */
      const fixture = g.api.fixtureLine;
      g.blocks.filter((b) => b.upd).forEach((b) => {
        ok(b.hasRunmark, tag + ' ' + b.id + ' 状态行旁有「运行时值／夹具」虚线小标');
        ok(b.status.text !== fixture, tag + ' ' + b.id + ' 默认态不是夹具文案');
      });
      /* 四种文案在默认态齐了，且没有第五种 */
      const texts = new Set();
      g.blocks.filter((b) => b.status).forEach((b) => texts.add(b.status.text));
      ok(texts.size === 4, tag + ' 页面上出现的状态行文案恰 4 种（实测 ' + texts.size + '）');
      Object.values(exp).forEach((t) => ok(texts.has(t), tag + ' 默认态里出现原文：' + JSON.stringify(t)));
    }

    /* —— 更新块位置 —— */
    {
      const a1 = byId.A1, d2 = byId.D2;
      ok(a1.upd.pos === 'inline' && a1.updGapPrev !== null && a1.updGapPrev > 4, tag + ' A1 的更新块在**页内**（距上一个内容元素 ' + a1.updGapPrev + 'px）');
      ok(a1.upd.bottomFrom <= 20, tag + ' A1 的更新块就是块内最后一块（距块底 ' + a1.upd.bottomFrom + 'px）');
      ok(d2.upd.pos === 'bottom', tag + ' D2 的更新块标为底部');
      ok(d2.isScreen && d2.h === 480, tag + ' D2 块高＝480（原型取的「一块屏」高度；实测 ' + d2.h + '）');
      ok(d2.upd.bottomFrom <= 0.6, tag + ' D2 的更新块贴块底（距块底 ' + d2.upd.bottomFrom + 'px）');
      ok(d2.upd.top > 200, tag + ' D2 更新块上方确有留白（距块顶 ' + d2.upd.top + 'px）');
      ok(parseFloat(d2.upd.borderTop) >= 1, tag + ' D2 的底栏有上边线（' + d2.upd.borderTop + '）');
      ok(parseFloat(a1.upd.borderTop) >= 1, tag + ' A1（页内）的更新块有描边（' + a1.upd.borderTop + '）');
      ok(byId.D3.upd.pos === 'inline' && byId.D4.upd.pos === 'inline' && byId.D5.upd.pos === 'inline', tag + ' D3／D4／D5 的按钮都在页内（只换文案）');
      ok(a1.btn.tag === 'BUTTON' && a1.btn.type === 'button', tag + ' 检查按钮是 <button type=button>');
      ok(a1.btn.text === '检查内容更新' && d2.btn.text === '检查内容更新', tag + ' 两份按钮文字一致（只改位置这一件事）');
      /* D2 与 A1「只差位置」：把 D2 的更新块与 A1 的更新块文字比一比 */
      ok(byId.D2.text.replace(/\s+/g, '') === byId.A1.text.replace(/\s+/g, ''), tag + ' D2 与 A1 的文字（含运行值小标）逐字相同 ⇒ 只差位置');
    }

    /* —— 两端其余内容一致 —— */
    ok(g.a2 === g.a2w, tag + ' A2 与 A2w 去掉更新块后文字逐字相同（两端其余内容一致）');
    ok(g.a2.includes('索斐') && g.a2.includes('0.1.1') && g.a2.includes('2026.10.16.20') && g.a2.includes('https://github.com/WSQS/suofei'),
      tag + ' 共同字段齐全（应用名／应用版本／内容版本／仓库）');
    ok(g.a2.includes('已下载') && byId.B3i.text.includes('内置'), tag + ' 来源两种取值都出现（内置／已下载）');

    /* —— 页面报错 —— */
    ok(state.errors.length === 0, tag + ' 没有 JS 报错（' + state.errors.join(' | ') + '）');

    /* —— 收集几何表（只收 430 那一轮）—— */
    if (vp.w === TABLE_V && !TABLE.length) {
      g.blocks.forEach((b) => {
        TABLE.push({
          id: b.id, axis: b.axis, platform: b.platform, V: vp.w,
          block: b.w + '×' + b.h, left: b.left, C: b.colW, gutter: b.colLeft, avail: Math.round((b.colW - 33.6) * 100) / 100,
          rows: b.kvRows, compact: b.compact,
          kRight: b.kv.length ? b.kv[0].kRight : null, vLeft: b.kv.length ? b.kv[0].vLeft : null,
          repo: b.repo ? b.repo.text : '', repoW: b.repo ? b.repo.w : null, repoLines: b.repo ? b.repo.boxes : null,
          hint: b.hint ? b.hint.text : '',
          statusKey: b.statusKey || '',
          statusText: b.status ? b.status.text : '', statusLines: b.status ? b.status.lines : null,
          statusW: b.status ? b.status.w : null,
          updPos: b.upd ? b.upd.pos : '', updTop: b.upd ? b.upd.top : null, updBottom: b.upd ? b.upd.bottomFrom : null,
          updGapPrev: b.updGapPrev, ctl: b.ctlCount,
        });
      });
    }

    /* —— PNG —— */
    if (!NO_SHOT && !SHOT_SET.has(vp.w)) {
      say('  ' + tag + ' 行为已查（收起／展开各一次）；这张图默认不落盘（要它加 --all-shots）');
    }
    if (!NO_SHOT && SHOT_SET.has(vp.w)) {
      const clip = { x: 0, y: 0, width: vp.w, height: Math.ceil(g.shot.h), scale: 1 };
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip });
      const buf = Buffer.from(shot.data, 'base64');
      const file = join(OUT, 'q-about.' + vp.w + '.png');
      writeFileSync(file, buf);
      const hdr = buf.subarray(0, 33);
      const pw = hdr.readUInt32BE(16), ph = hdr.readUInt32BE(20);
      const sigOk = buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
      ok(sigOk, tag + ' PNG 头合法');
      ok(pw === vp.w * 2, tag + ' PNG 像素宽 ＝ 视口宽×2（' + pw + '）');
      ok(Math.abs(ph - Math.round(g.shot.h * 2)) <= 2, tag + ' PNG 像素高 ＝ 截图区 CSS 高×2（' + ph + ' vs ' + Math.round(g.shot.h * 2) + '）');
      ok(statSync(file).size > 20000, tag + ' PNG 非空（' + statSync(file).size + ' 字节）');
      say('  ' + tag + ' PNG → ' + file + '  ' + pw + '×' + ph + '  ' + Math.round(statSync(file).size / 1024) + ' KB');
    }

    /* —— [F] 夹具态（＝「展开」那一次）—— */
    {
      await evalJson('(function(){document.querySelector("[data-test=fixture-toggle]").scrollIntoView({block:"center"});return JSON.stringify({ok:1});})()');
      await sleep(150);
      const pos = await evalJson('(function(){var r=document.querySelector("[data-test=fixture-toggle]").getBoundingClientRect();return JSON.stringify({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2),inView:r.top>=0&&r.bottom<=innerHeight});})()');
      ok(pos.inView, tag + ' 夹具开关点之前在视口内（y=' + pos.y + '）');
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pos.x, y: pos.y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pos.x, y: pos.y, button: 'left', clickCount: 1 });
      await sleep(200);
      const f = await evalJson(PAGE_PROBE);
      ok(f.fixture === 'long', tag + ' 真鼠标点了夹具开关 ⇒ 进入「展开态」（fixture=' + f.fixture + '）');
      ok(f.over.length === 0, tag + ' 展开态：无横向溢出（越界元素 ' + f.over.length + ' 个：' + JSON.stringify(f.over.slice(0, 4)) + '）');
      ok(f.docW === vp.w && f.bodyW === vp.w && f.vvW === vp.w, tag + ' 展开态：docW／bodyW／visualViewport 仍＝视口宽');
      const fb = {};
      f.blocks.forEach((b) => { fb[b.id] = b; });
      f.blocks.forEach((b) => {
        ok(b.w === vp.w && b.left === 0, tag + ' 展开态 ' + b.id + ' 仍恰＝视口宽、左沿 0');
        near(b.colW, C, 0.02, tag + ' 展开态 ' + b.id + ' 内容列宽仍＝公式值');
      });
      const withUpd = f.blocks.filter((b) => b.upd);
      ok(withUpd.length === 7, tag + ' 展开态：7 个更新块（Android 的 A1／A2／A3／D2／D3／D4／D5；实测 ' + withUpd.length + '）');
      withUpd.forEach((b) => {
        ok(b.status.text === f.api.fixtureLine, tag + ' 展开态 ' + b.id + ' 状态行＝最长的如实报错夹具（实测 ' + JSON.stringify(b.status.text).slice(0, 40) + '…）');
        ok(/原型夹具标注/.test(b.runmark), tag + ' 展开态 ' + b.id + ' 的小标写明「原型夹具」');
        ok(b.status.lines >= 1, tag + ' 展开态 ' + b.id + ' 状态行有行（' + b.status.lines + ' 行）');
      });
      ok(f.api.fixtureLine.includes('⟨') && !/[0-9]{4}\.[0-9]/.test(f.api.fixtureLine.replace(/2026\.10\.16\.20/g, '')),
        tag + ' 夹具文案里的数字用运行时占位（没有写死的版本/字节数）');
      say('  ' + tag + ' 夹具态：无溢出；' + withUpd.map((b) => b.id + ' ' + b.status.lines + '行').join('，') + '（最长夹具行）');
      /* 截图是**默认态**拍的：夹具点击发生在截图之后 */
      say('  ' + tag + ' 夹具态（展开）：' + (f.over.length === 0 ? '无溢出' : '有溢出') + '，状态行换成最长夹具');
    }
    ws.close();
  } catch (e) {
    FAILS.push(tag + ' 视图口执行失败：' + e.message);
    exitCode = 1;
  } finally {
    child.kill();
    await sleep(250);
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* 删不掉不影响结论 */ }
  }
  return exitCode;
}

/* ═══════════════════════════════════════════════════════════════════
 * 主流程
 * ═══════════════════════════════════════════════════════════════════ */
say('仓库根：' + ROOT);
say('原型页面：' + PAGE);
say('覆盖视口：' + VIEWPORTS.map((v) => v.w + '×' + v.h).join(' / ') + (NO_SHOT ? '（--no-shot：不出图、不查 PNG）' : ''));
say('');
for (const vp of VIEWPORTS) {
  say('── 视口 ' + vp.w + '×' + vp.h + ' ──');
  await runViewport(vp);
}

/* 跨视口：字号不随视口缩放 */
say('');
say('── 跨视口：字号／行高／字距不随视口缩放 ──');
{
  let bad = 0;
  Object.keys(fontProfile).forEach((sel) => {
    const vals = [...fontProfile[sel]];
    if (vals.length > 1) { bad += 1; say('  变了：' + sel + ' ⇒ ' + vals.join(' ／ ')); }
  });
  if (VIEWPORTS.length > 1) ok(bad === 0, '每个位置的字号/行高/字距在所有视口下完全一致（变化 ' + bad + ' 处）');
  Object.keys(fontProfile).forEach((sel) => say('  ' + sel + '：' + [...fontProfile[sel]].join(' ／ ')));
}

/* —— 每块实测几何表（给 q-about.md 与报告用；只打印，不断言）—— */
say('');
say('── 每块实测几何（视口 ' + (TABLE.length ? TABLE[0].V : '?') + '）──');
if (TABLE.length) {
  say('| 块 | 平台 | 块宽×高 | 左沿 | C | 列外余白 | 行内沿/可用 | label↦ | 值↦ | 行数 | 仓库文字宽/行 | 提示 | 状态行 | 更新块 | 可点 |');
  say('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  TABLE.forEach((t) => {
    say('| ' + t.id + ' | ' + t.platform + ' | ' + t.block + ' | ' + t.left + ' | ' + t.C + ' | ' + t.gutter +
        ' | 16.8 / ' + t.avail + ' | ' + (t.kRight === null ? '—' : t.kRight) +
        ' | ' + (t.vLeft === null ? '—' : t.vLeft) +
        ' | ' + (t.rows ? t.rows + ' 条' : '') + (t.compact ? (t.rows ? ' + ' : '') + t.compact + ' 紧凑行' : (t.rows ? '' : '0')) +
        ' | ' + (t.repoW === null ? '—' : t.repoW + ' / ' + t.repoLines) +
        ' | ' + (t.hint || '—') +
        ' | ' + (t.statusText ? JSON.stringify(t.statusText).slice(0, 46) + '…（' + t.statusLines + ' 行，宽 ' + t.statusW + '）' : '—') +
        ' | ' + (t.updPos ? t.updPos + '（距顶 ' + t.updTop + '·距底 ' + t.updBottom + (t.updGapPrev !== null ? '·距上文 ' + t.updGapPrev : '') + '）' : '—') +
        ' | ' + t.ctl + ' |');
  });
}

say('');
say('==============================');
if (FAILS.length === 0) {
  say('失败断言数：0（PASS ' + PASS + '）');
} else {
  say('失败断言数：' + FAILS.length + '（PASS ' + PASS + '）');
  FAILS.forEach((f, i) => say('  ' + (i + 1) + '. ' + f));
}
say('==============================');
process.exit(FAILS.length === 0 ? 0 : 1);
