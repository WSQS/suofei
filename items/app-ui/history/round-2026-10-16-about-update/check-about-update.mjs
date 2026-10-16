/*
 * check-about-update.mjs —— 「关于页 · Android 更新块」讨论原型（q-about-update.html）的
 * 【静态契约 ＋ 页面行为 ＋ 状态矩阵】自证脚本（可复跑）。
 *
 * ⚠ 它验的是**这一个原型页面**，**不是产品代码**：
 *   对象只有本目录下的 q-about-update.html（**只读打开**：Page.navigate 到 file:// URL；脚本不写、不改它）。
 *   额外读的文件只有两个，都是**只读**：
 *     ① prototype/css/theme-tech.css —— 逐项比对页面内嵌的令牌快照，并用 git hash-object 核它的 blob；
 *     ② git 仓库本身 —— 只为取 theme-tech.css 的 blob 哈希（不 commit、不 push、不 tag）。
 *
 * 断言清单（失败任一即 exit 1）：
 *  [G] 全局（只跑一次，不开浏览器）：
 *      · 令牌快照逐项比对 theme-tech.css（值不一致 0、缺失 0）；快照里**没有**「声明了却没用」的令牌；
 *        页面里每个 var() 都有声明；快照写明权威仍是 docs/design/visual-tokens.md 并记了 blob 与记录时 HEAD；
 *        blob ＝ `git hash-object prototype/css/theme-tech.css`；theme 文件相对 HEAD 无本地改动。
 *      · 固定清单六条在页面上写明（来源不进共用版本信息／Web 不显示来源／Android 要呈现来源只能进更新块且不让 Web 多一行；
 *        结构＝A3 且**不附带 A3 的那条来源行**；B 组不再强求选、不把某档当已准；仓库＝C1 完整 URL 且不要 C3 提示；
 *        D 组未采纳⇒本轮给整体组织差异候选；宽度口径与「24 是一次性扣除总量」；静默终端令牌；这一页只做内容更新）。
 *      · 「候选并列、不排序、不写推荐」「选某档 ≠ 采纳整页规格」「本页不决定 JSON／MD 分界与产物字段」写明。
 *      · 自包含：无 <link／<script src／@import／url(http／fetch(／XMLHttpRequest；无内联 onclick。
 *      · 视觉：无 @keyframes、无 animation、transition 只允许 var(--row-transition)、box-shadow 只允许 var(--shadow)。
 *      · 折叠只能用 <button type=button> ＋ [hidden] 实现（**不用** <details>/<summary>——
 *        因为硬要求把可点元素限定为 <a href>／<button type=button>）⇒ 页面里 <details>/<summary> 数必须为 0。
 *      · **不塞假笔记**：页面里没有「测试笔记」这类笔记夹具（静态一次，运行期再对每个块查一次）。
 *  [V] 每个视口（320／430／1180 各跑一遍，默认态）：
 *      · innerWidth／innerHeight 精确等于目标；docW ＝ bodyW ＝ **visualViewport.width** ＝ 视口宽（防 shrink-to-fit）；
 *      · **16 个块**（U 组 5 ＋ S 组 11）**每块恰＝视口宽、块左沿 0**；内容列宽＝公式复算值（±0.02）；列外余白＝(V−C)/2；
 *      · **无横向溢出**（所有可见元素都在 0…视口宽 内）；可点元素**只有** <a href> 与 <button type=button>；
 *      · 每块都含 应用名／版本相邻组／更新块／仓库链接四条，且**版本相邻组里没有「来源」**（没有 来源／已下载／内置 字样）；
 *        仓库文字＝完整 URL、无「在浏览器打开」提示、是块内最后一个元素；
 *      · 更新块夹在版本相邻组与仓库之间；无外部请求（非 file:// 的 0 个）；无 JS 报错；
 *      · 字号/行高/字距在各视口完全一致（不随视口缩放）。
 *  [T] 状态矩阵（**每个视口都跑**；逐字打印只在 430 那一轮）：
 *      · 对 **11 个状态 × 5 档**：把 U 组切到该状态，逐块断言**状态文案逐字相同**（页面渲染 vs 本脚本独立期望）；
 *      · 断言动作映射：主按钮文字／禁用与否／是不是未批准动作（未批准动作走 warn 通道的 .todo 样式）；
 *      · 断言「未批准功能」虚线小标：veracity ≠ real 的块必须有，real 的必须没有；
 *      · 断言第二个动作的位置：U1 声明**放不下**（不渲染 second 且出现一条说明），U2／U3／U4／U5 在有第二动作时必须渲染出来；
 *      · 断言「上次检查／上次结果」的位置分类（none／action-row／detail-panel／block-tail／own-section）由**几何**独立判定；
 *      · 断言 U4 的四步结果逐字（检查／下载／校验／切换）；
 *      · 每个状态都要**无横向溢出**、每块仍恰＝视口宽。
 *  [F] 夹具态（硬要求点名的「最长状态行夹具态」）：真鼠标点夹具按钮 ⇒ 每个块的状态句换成最长的如实报错（含 ⟨…⟩ 运行时占位），
 *      再查一遍**无横向溢出**、每块恰＝视口宽、列宽不变；夹具句里没有写死的版本号/字节数。
 *  [X] 折叠（U3）：默认必须是**收起**（面板 hidden、aria-expanded=false）；真鼠标点摘要行 ⇒ 展开（面板可见、aria-expanded=true）；
 *      展开态**无横向溢出**；再点一次 ⇒ 回到收起。
 *  [P] PNG：默认只写 q-about-update.430.png（320／1180 的行为照样查，但不落图，--all-shots 才写）：
 *      像素宽 ＝ 视口宽×2、高 ＝ 截图区 CSS 高×2（自己解析 PNG 头），文件非空；截图区左沿 0、宽＝视口宽。
 *  [S] 边界自证：`CHROME_BIN` 指到不存在的路径 ⇒ 本脚本必须**如实报错并 exit 2**、
 *      **不能**打印出「失败断言数：0」—— 用 `--selftest-chrome` 真的跑一次子进程来证明。
 *
 * 怎么跑（在仓库根或任意目录都行）：
 *   node items/app-ui/prototypes/check-about-update.mjs
 *   node items/app-ui/prototypes/check-about-update.mjs --no-shot        # 只跑断言，不重出 PNG
 *   node items/app-ui/prototypes/check-about-update.mjs --all-shots      # 连 320／1180 的 PNG 也写出来
 *   node items/app-ui/prototypes/check-about-update.mjs --only=430       # 只跑某一个视口（排查用）
 *   node items/app-ui/prototypes/check-about-update.mjs --selftest-chrome
 *
 * 需要什么：
 *   - Node（用到内置 fetch／WebSocket／net，故需较新的 Node；本机实测 v25.9.0 通过）；
 *   - **本机无头 Chromium**：环境变量 CHROME_BIN → 否则 %LOCALAPPDATA%\Chromium\Application\chrome.exe。
 *     找不到就**如实报错并 exit 2**（CHROME_BIN 指到错路径也走这一条，不会假装通过）；
 *   - **不需要**任何 npm 依赖：不装包、不联网、不起静态服务（直接开 file://）；
 *   - **端口**：CDP 调试端口**先向内核要一个空闲端口**（net 监听 0 再关掉），**不写死**；
 *   - **仓库根**：从脚本所在目录**向上查找 prototype/css/theme-tech.css** 来定位，**不写死层级**。
 *
 * 副作用：临时目录建一个 Chromium profile 并删掉；默认重写本目录 1 张 PNG（复跑可能让 PNG 变脏，正常现象）；
 *         q-about-update.html 本身**只读打开**，不写、不改。
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

const PAGE = join(OUT, 'q-about-update.html');
const THEME = join(ROOT, 'prototype', 'css', 'theme-tech.css');
const argv = process.argv.slice(2);
const NO_SHOT = argv.includes('--no-shot');
const SHOT_ALL = argv.includes('--all-shots');
const SHOT_SET = SHOT_ALL ? new Set([320, 430, 1180]) : new Set([430]);
const ONLY = (argv.find((a) => a.startsWith('--only=')) || '').split('=')[1];
const VIEWPORTS = [
  { w: 320, h: 568, mobile: true },
  { w: 430, h: 932, mobile: true },   // 硬要求点名的那一档（q-about-update.430.png）
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
    cwd: OUT, encoding: 'utf8', timeout: 300000,
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
 * 本脚本**独立**期望（不复用页面里的定义 —— 页面侧的定义由运行时探针取出后逐字比对）
 * ═══════════════════════════════════════════════════════════════════ */
const VER = '2026.10.16.20';
const APPVER = '0.1.1';
const REPO = 'https://github.com/WSQS/suofei';

const TIERS = [
  { id: 'U1', org: 'row', lastpos: 'none', secondary: 'none' },
  { id: 'U2', org: 'two', lastpos: 'action-row', secondary: 'inline' },
  { id: 'U3', org: 'fold', lastpos: 'detail-panel', secondary: 'inline' },
  { id: 'U4', org: 'steps', lastpos: 'block-tail', secondary: 'inline' },
  { id: 'U5', org: 'zones', lastpos: 'own-section', secondary: 'inline' },
];

/* 状态清单：veracity ＝ real（协议里真有）／unapproved（未批准功能的原型表达）／real+shape（状态真实、这个呈现方式未批准） */
const STATES = [
  { key: 'idle', veracity: 'real', pretty: '尚未检查', warn: false, text: '尚未检查。', short: '尚未检查',
    act: ['检查更新', true, true], sec: null, steps: ['—', '—', '—', '—'] },
  { key: 'checking', veracity: 'real', pretty: '检查中', warn: false, text: '正在检查…', short: '检查中',
    act: ['检查更新', true, false], sec: null, steps: ['进行中…', '—', '—', '—'] },
  { key: 'uptodate', veracity: 'real', pretty: '已是最新（带远端内容版本）', warn: false, text: '已是最新内容（远端 ' + VER + '）。', short: '已是最新',
    act: ['检查更新', true, true], sec: null, steps: ['已是最新（远端 ' + VER + '）', '—', '—', '—'] },
  { key: 'available', veracity: 'unapproved', pretty: '有新内容可用', warn: false, text: '有新内容可用（远端 ' + VER + '），尚未下载。', short: '有新内容可用',
    act: ['下载新内容', false, true], sec: null, steps: ['已发现远端 ' + VER, '未开始', '—', '—'] },
  { key: 'downloading', veracity: 'unapproved', pretty: '下载中（含进度与已收字节）', warn: false,
    text: '正在下载新内容 ' + VER + '…（已收 ⟨已收字节⟩ / ⟨总字节⟩ 字节）', short: '下载中',
    act: ['取消下载', false, true], sec: null, steps: ['已完成：远端 ' + VER, '进行中：已收 ⟨已收字节⟩ / ⟨总字节⟩ 字节', '—', '—'] },
  { key: 'verifying', veracity: 'unapproved', pretty: '校验中', warn: false, text: '正在校验已下载的内容…（' + VER + '）', short: '校验中',
    act: ['取消', false, true], sec: null, steps: ['已完成：远端 ' + VER, '已完成：⟨总字节⟩ 字节', '进行中：SHA-256 比对', '—'] },
  { key: 'failed', veracity: 'real+shape', pretty: '下载或校验失败', warn: true,
    text: '更新未生效，旧内容保留：下载内容的大小与清单不符（下载/校验未通过）', short: '失败（旧内容保留）',
    act: ['检查更新', true, true], sec: null, steps: ['已完成：远端 ' + VER, '失败：下载内容的大小与清单不符', '未执行', '未执行'] },
  { key: 'pending', veracity: 'unapproved', pretty: '已下载待切换（等用户动作）', warn: false,
    text: '新内容 ' + VER + ' 已下载、校验通过，等待切换（尚未生效）。', short: '待切换',
    act: ['立即切换', false, true], sec: '稍后', steps: ['已完成：远端 ' + VER, '已完成：⟨总字节⟩ 字节', '已完成：SHA-256 通过', '等待用户动作'] },
  { key: 'switched', veracity: 'real', pretty: '已切换生效', warn: false,
    text: '新内容 ' + VER + ' 已下载、校验通过并已切换生效（⟨字节数⟩ 字节）；返回目录后采用。', short: '已切换生效',
    act: ['检查更新', true, true], sec: null,
    steps: ['已完成：远端 ' + VER, '已完成：⟨字节数⟩ 字节', '已完成：SHA-256 通过', '已完成：返回目录后采用'] },
  { key: 'deferred', veracity: 'unapproved', pretty: '用户选择延后', warn: false,
    text: '已延后：新内容 ' + VER + ' 暂不切换，继续使用当前内容。', short: '已延后',
    act: ['立即切换', false, true], sec: null,
    steps: ['已完成：远端 ' + VER, '已完成：⟨总字节⟩ 字节', '已完成：SHA-256 通过', '已延后'] },
  { key: 'failold', veracity: 'real', pretty: '失败时旧内容仍在使用', warn: true,
    text: '更新未生效，旧内容保留：SHA-256 不符（下载/校验未通过）；当前内容仍是 ' + VER + '。', short: '失败（旧内容仍在使用）',
    act: ['检查更新', true, true], sec: null,
    steps: ['已完成：远端 ' + VER, '已完成：⟨总字节⟩ 字节', '失败：SHA-256 不符', '未执行'] },
];
const STATE_BY_KEY = Object.fromEntries(STATES.map((s) => [s.key, s]));

/* 夹具：最长的如实报错（数字一律运行时占位） */
const FIXTURE_LINE = '更新未生效，旧内容保留：下载内容的大小与清单不符（清单 ⟨清单字节数⟩ 字节，实际收到 ⟨实收字节数⟩ 字节）（下载/校验未通过）';

const BLOCK_IDS = TIERS.map((t) => t.id).concat(STATES.map((s) => 'S-' + s.key));

/* ═══════════════════════════════════════════════════════════════════
 * [G] 静态检查（不开浏览器）
 * ═══════════════════════════════════════════════════════════════════ */
if (!existsSync(PAGE)) { console.error('找不到原型页面：' + PAGE); process.exit(2); }
const HTML = readFileSync(PAGE, 'utf8');

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

/* G1 令牌快照逐项比对 */
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

/* G2 快照的依据：blob 哈希 + 记录时 HEAD */
{
  ok(/权威仍是 docs\/design\/visual-tokens\.md/.test(HTML), '快照写明「权威仍是 docs/design/visual-tokens.md」');
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

/* G3 固定清单 / 口径 / 并列声明 */
{
  const need = [
    ['不该出现在两端共用的版本信息里', '固定清单：共用版本信息里不要「来源」'],
    ['Web 不显示来源', '固定清单：Web 不显示来源'],
    ['Android 若要呈现来源，只能放进更新块', '固定清单：Android 要呈现来源只能进更新块'],
    ['绝不因为 Android 需要就让 Web 多一行', '固定清单：不让 Web 多一行'],
    ['结构＝A3', '固定清单：结构＝A3'],
    ['不附带 A3 里那条来源行', '固定清单：不附带那条来源行'],
    ['B 组不再强求选', '固定清单：B 组不再强求选'],
    ['不把任何一档当作已获准', '固定清单：不把某档当已准'],
    ['尤其不把 B2 当已准', '固定清单：尤其不把 B2 当已准'],
    ['仓库链接＝C1 完整 URL', '固定清单：仓库＝C1 完整 URL'],
    ['不给', '固定清单：不要 C3 浏览器提示'],
    ['D 组（上一轮那 4 块）用户未采纳', '固定清单：D 组未被采纳'],
    ['整体组织上的差异候选', '固定清单：要整体组织差异候选（不是挪按钮位置）'],
    ['C = min(V, max(320, 0.88 × (V − 24)))', '宽度＝已选口径原文'],
    ['24 是一次性扣除总量', '硬纠正：24 是扣除总量'],
    ['不是左右各 12px', '硬纠正：不是左右各 12px'],
    ['不夹', '硬纠正：不夹 660／860'],
    ['只做内容更新，不做 APK 更新', '固定清单：只做内容更新'],
    ['静默终端令牌', '视觉：静默终端令牌'],
    ['候选 <b>并列、不排序、不写推荐</b>', '候选并列／不排序／不写推荐'],
    ['选其中某一块 ≠ 采纳整页规格', '选某档 ≠ 采纳整页规格'],
    ['不决定', '不决定 JSON／MD 分界与产物字段'],
    ['JSON／MD', '提到 JSON／MD'],
    ['原型说明 ／ 夹具标注，不属于应用页面', '图内醒目标注'],
  ];
  need.forEach(([s, label]) => ok(HTML.includes(s), '页面写明了：' + label));
}

/* G4 自包含 / 视觉 / 可折叠实现方式 / 无笔记夹具 */
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
    ['onclick=', '没有内联 onclick'],
    ['测试笔记', '没有「测试笔记」这类笔记夹具'],
    ['假笔记', '没有假笔记'],
  ];
  forbidden.forEach(([s, label]) => ok(!HTML.includes(s), label));
  ok(!/<\s*details[\s>]/i.test(HTML), '没有 details 元素（可点元素限定为 a/button ⇒ 折叠用 button ＋ [hidden]）');
  ok(!/<\s*summary[\s>]/i.test(HTML), '没有 summary 元素');
  const bad = [];
  const reT = /transition:\s*([^;}]+)/gi;
  let mt;
  while ((mt = reT.exec(HTML))) {
    const v = mt[1].replace(/\s+/g, ' ').trim();
    if (v === 'var(--row-transition)') continue;
    if (!/^((color|border-color|background|background-color)\s+0\.15s\s+ease\s*,?\s*)+$/.test(v + ' ')) bad.push(v);
  }
  ok(bad.length === 0, 'transition 只有 0.15s 颜色类（违规：' + bad.join(' | ') + '）');
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

/* 页面侧探针（只读；不写页面）。写成真函数再 toString —— 免得引号转义出错。 */
function probeFn() {
  function R(e) { return e.getBoundingClientRect(); }
  function P(v) { return Math.round(v * 100) / 100; }
  function CS(e, p) { return getComputedStyle(e)[p]; }
  function linesOf(e) {
    var c = getComputedStyle(e);
    var h = e.clientHeight - parseFloat(c.paddingTop || 0) - parseFloat(c.paddingBottom || 0);
    var lh = parseFloat(c.lineHeight) || parseFloat(c.fontSize) * 1.2;
    return Math.max(1, Math.round(h / lh));
  }
  function text(e) { return e ? e.textContent : null; }
  function inkW(e) {
    var r = document.createRange(); r.selectNodeContents(e);
    var rs = r.getClientRects(), w = 0;
    for (var i = 0; i < rs.length; i++) w = Math.max(w, rs[i].width);
    return P(w);
  }
  var doc = document.documentElement;
  var out = {};
  out.vw = innerWidth; out.vh = innerHeight; out.dpr = devicePixelRatio;
  out.docW = doc.scrollWidth; out.bodyW = document.body.scrollWidth;
  out.vvW = P(visualViewport.width);
  out.ready = doc.dataset.ready || '';
  out.fixture = doc.dataset.fixture || '';
  out.docState = doc.dataset.state || '';
  out.params = { deduct: doc.dataset.deduct, pct: doc.dataset.pct, floor: doc.dataset.floor, cap: doc.dataset.cap, blob: doc.dataset.tokenBlob, head: doc.dataset.headSha };
  var api = window.__ABOUT_UPD__;
  out.api = api ? {
    deduct: api.deduct, pct: api.pct, floor: api.floor,
    tierIds: api.tierIds, stateKeys: api.stateKeys, fixtureLine: api.fixtureLine,
    veracity: api.veracity, text: api.text, shortText: api.shortText, steps: api.steps,
    actions: api.actions, lastpos: api.lastpos, secondarySlot: api.secondarySlot,
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
      inPg: !!e.closest('.pg'),
      inPanel: !!e.closest('[data-test=fixture-panel]') || !!e.closest('[data-test=state-panel]'),
    });
  });
  out.details = document.querySelectorAll('details,summary').length;
  out.controls = {
    statePanelInShot: !!document.querySelector('[data-test=state-panel]').closest('[data-shotframe]'),
    statePanelInPg: !!document.querySelector('[data-test=state-panel]').closest('.pg'),
    fixturePanelInShot: !!document.querySelector('[data-test=fixture-panel]').closest('[data-shotframe]'),
    fixturePanelInPg: !!document.querySelector('[data-test=fixture-panel]').closest('.pg'),
    btnCount: document.querySelectorAll('[data-test=state-btn]').length,
    fxTag: document.querySelector('[data-test=fixture-toggle]').tagName,
    fxType: document.querySelector('[data-test=fixture-toggle]').getAttribute('type'),
  };
  out.blocks = [];
  [].slice.call(document.querySelectorAll('.pg')).forEach(function (pg) {
    var rp = R(pg), col = pg.querySelector('[data-test=col]'), rc = R(col);
    var upd = pg.querySelector('[data-test=upd]');
    var marks = upd.querySelector('[data-test=marks]');
    var st = upd.querySelector('[data-test=status]');
    var panel = upd.querySelector('[data-test=foldpanel]');
    var summary = upd.querySelector('[data-test=foldsummary]');
    var primary = upd.querySelector('[data-test=primarybtn]');
    var secondary = upd.querySelector('[data-test=secondarybtn]');
    var last = upd.querySelector('[data-test=lastcheck]');
    var lastres = upd.querySelector('[data-test=lastresult]');
    var verpair = pg.querySelector('[data-test=verpair]');
    var repoa = pg.querySelector('[data-test=repolink]');
    var rows = [].slice.call(pg.querySelectorAll('[data-test=kv]'));
    var kRight = [], vLeft = [];
    rows.forEach(function (row) {
      var k = row.querySelector('[data-test=k]'), v = row.querySelector('[data-test=v]');
      kRight.push(P(R(k).right - rc.left));
      vLeft.push(P(R(v).left - rc.left));
    });
    var hiddenPanel = !!(panel && panel.hidden);
    var rowEl = pg.querySelector('[data-test=kv], .brand');
    var foldLabel = upd.querySelector('.foldlabel'), foldState = upd.querySelector('.foldstate');
    var b = {
      id: pg.dataset.block, tier: pg.dataset.tier, group: pg.dataset.group, state: pg.dataset.state,
      left: P(rp.left), w: P(rp.width), h: P(rp.height),
      colLeft: P(rc.left), colW: P(rc.width),
      edge: rowEl ? P(parseFloat(CS(rowEl, 'paddingLeft'))) : 0,
      text: pg.innerText.replace(/\s+/g, ' ').trim(),
      hasBrand: !!pg.querySelector('[data-test=brand]'),
      brandText: text(pg.querySelector('[data-test=brand]')),
      verPairText: verpair ? verpair.innerText.replace(/\s+/g, ' ').trim() : null,
      kvRows: rows.length,
      kRightSpread: rows.length ? P(Math.max.apply(null, kRight) - Math.min.apply(null, kRight)) : null,
      vLeftSpread: rows.length ? P(Math.max.apply(null, vLeft) - Math.min.apply(null, vLeft)) : null,
      updTop: P(R(upd).top - rp.top),
      updAppH: P(R(upd).height - R(marks).height),
      marksH: P(R(marks).height),
      updGapPrev: P(R(upd).top - R(verpair).bottom),
      repoGapUpd: P(R(repoa.parentNode).top - R(upd).bottom),
      repoText: text(repoa), repoTag: repoa.tagName, repoHref: repoa.getAttribute('href'),
      repoBoxes: repoa.getClientRects().length,
      repoIsLastInCol: !!(repoa && repoa.closest('.kv') === col.lastElementChild),
      repoBottomFromBlock: P(rp.bottom - R(repoa.closest('.kv')).bottom),
      hintCount: pg.querySelectorAll('[data-test=repohint]').length,
      statusText: text(st), statusWarn: st ? st.classList.contains('is-warn') : null,
      statusLines: (hiddenPanel || !st) ? null : linesOf(st), statusW: st ? inkW(st) : null,
      statusInPanel: !!(panel && panel.contains(st)),
      panelHidden: hiddenPanel,
      summaryText: text(summary), summaryExpanded: summary ? summary.getAttribute('aria-expanded') : null,
      summaryLabel: text(foldLabel), summaryState: text(foldState),
      summaryTag: summary ? summary.tagName : null, summaryType: summary ? summary.getAttribute('type') : null,
      primaryText: text(primary), primaryReal: primary ? primary.dataset.real : null,
      primaryDisabled: primary ? primary.disabled : null, primaryCls: primary ? primary.className : null,
      primaryTop: primary ? P(R(primary).top - rp.top) : null,
      primaryBottom: primary ? P(R(primary).bottom - rp.top) : null,
      secondaryText: text(secondary), hasSecondary: !!secondary,
      hasDropNote: !!upd.querySelector('[data-test=dropnote]'),
      lastText: text(last), lastResultText: text(lastres),
      lastExists: !!last, lastInPanel: !!(panel && last && panel.contains(last)),
      lastInLastZone: !!(last && last.closest('[data-zone=last]')),
      lastSameRowAsPrimary: !!(last && primary && last.parentElement === primary.parentElement),
      lastTop: (last && !hiddenPanel) ? P(R(last).top - rp.top) : null,
      lastLines: (last && !hiddenPanel) ? linesOf(last) : null,
      lastBoxes: last ? last.getClientRects().length : 0,
      lastOverlapPrimary: (last && primary) ? P(Math.min(R(last).bottom, R(primary).bottom) - Math.max(R(last).top, R(primary).top)) : null,
      lastFontSize: last ? CS(last, 'fontSize') : null, lastColor: last ? CS(last, 'color') : null,
      lastMono: last ? CS(last, 'fontFamily').indexOf('Consolas') >= 0 : null,
      steps: [].slice.call(upd.querySelectorAll('[data-test=step]')).map(function (e) {
        return { i: e.dataset.i, do: e.dataset.do, k: text(e.querySelector('.sk')), v: text(e.querySelector('.sv')) };
      }),
      zoneTitles: [].slice.call(upd.querySelectorAll('.ztitle')).map(function (e) { return e.textContent; }),
      hasUnmark: !!upd.querySelector('[data-test=unmark]'), unmarkText: text(upd.querySelector('[data-test=unmark]')),
      hasRunmark: !!upd.querySelector('[data-test=runmark]'),
      ctlCount: pg.querySelectorAll('a,button,[tabindex],[onclick],[role=button]').length,
      shadows: 0, anims: 0,
    };
    [].slice.call(pg.querySelectorAll('*')).forEach(function (e) {
      var s = CS(e, 'boxShadow'); if (s && s !== 'none') b.shadows++;
      var an = CS(e, 'animationName'); if (an && an !== 'none') b.anims++;
    });
    out.blocks.push(b);
  });
  /* 截断检查用的「原型标注」不在应用层：U 组每块的 dhead/cap 都在 .pg 之外 */
  out.headsOutsidePg = [].slice.call(document.querySelectorAll('[data-test=dhead],[data-test=cap]')).every(function (e) { return !e.closest('.pg'); });
  /* 字号剖面：这些位置的字号/行高/字距**不得随视口缩放** */
  out.fonts = (function () {
    var sel = {
      brand: '[data-test=brand]', k: '[data-test=k]', v: '[data-test=v]', repolink: '[data-test=repolink]',
      status: '[data-test=status]', primary: '[data-test=primarybtn]', lastcheck: '[data-test=lastcheck]',
      updtitle: '.upd-title', ztitle: '.ztitle', sk: '.sk', sv: '.sv', foldlabel: '.foldlabel', foldstate: '.foldstate',
    };
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

const FONT_KEYS = ['brand', 'k', 'v', 'repolink', 'status', 'primarybtn', 'foldlabel', 'foldstate', 'updtitle', 'ztitle', 'sk', 'sv'];
const fontProfile = {};
const TABLE = [];
const TABLE_V = VIEWPORTS.some((v) => v.w === 430) ? 430 : (VIEWPORTS[0] ? VIEWPORTS[0].w : 430);

function classifyLast(b, tier) {
  /* 由**几何／结构**独立判定「上次检查」落在哪（不看页面自己声明的 data）*/
  if (!b.lastExists) return tier.lastpos === 'none' ? 'none' : '缺失(声明 ' + tier.lastpos + ')';
  if (tier.lastpos === 'detail-panel') return (b.lastInPanel && b.panelHidden) ? 'detail-panel' : '不在收起面板里';
  if (tier.lastpos === 'action-row') return b.lastSameRowAsPrimary ? 'action-row' : '不在动作那一行里';
  if (tier.lastpos === 'block-tail') return b.lastTop >= b.primaryBottom - 0.5 ? 'block-tail' : ('没在动作下方(lastTop=' + b.lastTop + ', btnBottom=' + b.primaryBottom + ')');
  if (tier.lastpos === 'own-section') return b.lastInLastZone ? 'own-section' : '不在独立分区里';
  return '?';
}

async function runViewport(vp) {
  const tag = '[' + vp.w + ']';
  const port = await freePort();
  const profile = mkdtempSync(join(tmpdir(), 'check-about-update-'));
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
    const narrow = vp.w <= 320;

    /* ── 默认态 ── */
    const g = await evalJson(PAGE_PROBE);
    say('  · 探针 A 完成');

    ok(g.vw === vp.w, tag + ' innerWidth ＝ ' + vp.w + '（实测 ' + g.vw + '）');
    ok(g.vh === vp.h, tag + ' innerHeight ＝ ' + vp.h + '（实测 ' + g.vh + '）');
    ok(g.docW === vp.w, tag + ' documentElement.scrollWidth ＝ ' + vp.w + '（实测 ' + g.docW + '）');
    ok(g.bodyW === vp.w, tag + ' body.scrollWidth ＝ ' + vp.w + '（实测 ' + g.bodyW + '）');
    ok(g.vvW === vp.w, tag + ' visualViewport.width ＝ ' + vp.w + '（实测 ' + g.vvW + '，防 shrink-to-fit）');
    ok(g.ready === '1', tag + ' 页面自报 ready');
    ok(g.docState === 'idle', tag + ' 默认态＝idle（实测 ' + g.docState + '）');
    ok(g.params.deduct === '24' && g.params.pct === '88' && g.params.floor === '320' && g.params.cap === 'viewport',
      tag + ' 页面上写明宽度参数（24／88／320／上界＝视口）');
    ok(!!g.api && g.api.deduct === 24 && g.api.pct === 88 && g.api.floor === 320, tag + ' 页面侧公式参数＝脚本期望');
    ok(g.details === 0, tag + ' 页面没有 <details>/<summary>（可点元素限定为 a／button）');
    ok(g.controls.statePanelInShot === false && g.controls.statePanelInPg === false, tag + ' 状态选择器在**截图范围之外**、不在块内');
    ok(g.controls.fixturePanelInShot === false && g.controls.fixturePanelInPg === false, tag + ' 夹具面板在**截图范围之外**、不在块内');
    ok(g.controls.btnCount === STATES.length, tag + ' 状态选择器按钮数 ＝ ' + STATES.length + '（实测 ' + g.controls.btnCount + '）');
    ok(g.controls.fxTag === 'BUTTON' && g.controls.fxType === 'button', tag + ' 夹具开关是 <button type=button>');
    ok(g.shotCount === 2, tag + ' 截图区个数＝2（U 组一张、S 组一张；实测 ' + g.shotCount + '）');
    g.shots.forEach((s2) => {
      ok(s2.left === 0 && s2.w === vp.w, tag + ' 截图区 ' + s2.id + ' 左沿 0、宽＝视口宽（实测 ' + s2.left + '／' + s2.w + '）');
    });
    ok(g.over.length === 0, tag + ' 默认态无横向溢出（越界元素 ' + g.over.length + ' 个：' + JSON.stringify(g.over.slice(0, 4)) + '）');
    ok(g.headsOutsidePg === true, tag + ' 各档的标题／数字行都在块外（不属于应用页面）');

    const badReq = [...new Set(state.requests)].filter((u) => !u.startsWith('file://'));
    ok(badReq.length === 0, tag + ' 没有外部请求（非 file:// 的 ' + badReq.length + ' 个：' + badReq.slice(0, 3).join(',') + '）');

    const badCtl = g.ctls.filter((c) => !((c.tag === 'A' && c.href) || (c.tag === 'BUTTON' && c.type === 'button')));
    ok(badCtl.length === 0, tag + ' 可点元素只有 <a href> 与 <button type=button>（违规 ' + badCtl.length + ' 个：'
      + JSON.stringify(badCtl.slice(0, 4)) + '）');
    ok(g.ctls.length >= 18, tag + ' 页面里的可点元素数 ≥ 18（实测 ' + g.ctls.length + '；含 11 个状态按钮 ＋ 夹具开关）');

    /* ── 公式复算 ── */
    const A = vp.w - 24, raw = 0.88 * A;
    const C = Math.min(vp.w, Math.max(320, raw));
    ok(C <= vp.w, tag + ' C ≤ V（上界＝视口 V）');
    if (vp.w === 320) ok(C === 320 && C > A, tag + ' V=320 时 C=320 > A=296（证明 24 是扣除总量，不是左右各 12）');
    if (vp.w === 1180) ok(C > 860, tag + ' V=1180 时 C=' + C + ' > 860（证明没有夹 860 上限）');

    /* ── 每块：几何 ＋ 框架 ＋ 固定项 ── */
    ok(g.blocks.length === 16, tag + ' 块数 ＝ 16（U 组 5 ＋ S 组 11；实测 ' + g.blocks.length + '）');
    const byId = {};
    g.blocks.forEach((b) => { byId[b.id] = b; });
    BLOCK_IDS.forEach((id) => ok(!!byId[id], tag + ' 有块 ' + id));

    g.blocks.forEach((b) => {
      const stOf = STATE_BY_KEY[b.state] || STATE_BY_KEY.idle;
      const tierOf = TIERS.filter((t) => t.id === b.tier)[0];
      const secSlot = !!(stOf.sec && tierOf && tierOf.secondary !== 'none');
      const expectCtl = 2 + (b.tier === 'U3' ? 1 : 0) + (secSlot ? 1 : 0);
      ok(b.left === 0, tag + ' ' + b.id + ' 块左沿 0（实测 ' + b.left + '）');
      ok(b.w === vp.w, tag + ' ' + b.id + ' 块宽恰＝视口宽 ' + vp.w + '（实测 ' + b.w + '）');
      near(b.colW, C, 0.02, tag + ' ' + b.id + ' 内容列宽＝公式复算 ' + C);
      near(b.colLeft, (vp.w - C) / 2, 0.02, tag + ' ' + b.id + ' 列外余白＝(V−C)/2');
      ok(b.shadows === 0, tag + ' ' + b.id + ' 块内没有 box-shadow（' + b.shadows + '）');
      ok(b.anims === 0, tag + ' ' + b.id + ' 块内没有 animation（' + b.anims + '）');
      ok(b.hasBrand && b.brandText === '索斐', tag + ' ' + b.id + ' 有应用名＝索斐（实测 ' + JSON.stringify(b.brandText) + '）');
      ok(!!b.verPairText && b.verPairText.indexOf(APPVER) >= 0 && b.verPairText.indexOf(VER) >= 0,
        tag + ' ' + b.id + ' 版本相邻组含应用版本与内容版本（实测 ' + JSON.stringify(b.verPairText) + '）');
      ok(!/来源|已下载|内置/.test(b.verPairText || ''), tag + ' ' + b.id + ' 版本相邻组里没有「来源」等字样（实测 ' + JSON.stringify(b.verPairText) + '）');
      ok(b.updTop > 0 && b.repoGapUpd > 0, tag + ' ' + b.id + ' 更新块夹在版本相邻组与仓库链接之间');
      ok(b.repoText === REPO && b.repoTag === 'A' && b.repoHref === REPO, tag + ' ' + b.id + ' 仓库链接＝完整 URL 的 <a>（实测 ' + JSON.stringify(b.repoText) + '）');
      ok(b.hintCount === 0, tag + ' ' + b.id + ' 没有「在浏览器打开」提示（C1 口径）');
      ok(b.repoBottomFromBlock >= 0, tag + ' ' + b.id + ' 仓库链接在块尾（距块底 ' + b.repoBottomFromBlock + '）');
      ok(b.hasRunmark, tag + ' ' + b.id + ' 有「运行时值」虚线小标（不属于应用页面）');
      ok(!/笔记|测试笔记|假笔记/.test(b.text), tag + ' ' + b.id + ' 块内没有笔记夹具');
      near(b.edge, 16.8, 0.05, tag + ' ' + b.id + ' 行内沿 1.05rem＝16.8px（列内那一层）');
      ok(b.repoIsLastInCol, tag + ' ' + b.id + ' 仓库链接是内容列的最后一条');
      ok(b.ctlCount === expectCtl, tag + ' ' + b.id + ' 块内可点元素数（仓库链接＋主按钮' + (b.tier === 'U3' ? '＋摘要行' : '') + (secSlot ? '＋第二动作' : '') + '；实测 ' + b.ctlCount + '，期望 ' + expectCtl + '）');
      if (b.kvRows >= 3) {
        near(b.kRightSpread, 0, 0.6, tag + ' ' + b.id + ' label 右沿同一条竖线');
        near(b.vLeftSpread, 0, 0.6, tag + ' ' + b.id + ' 值左沿同一条竖线');
      }
    });
    /* 字号剖面：跨视口必须完全一致 */
    Object.keys(g.fonts || {}).forEach((k) => { (fontProfile[k] = fontProfile[k] || new Set()).add(g.fonts[k]); });
    ok(Object.keys(g.fonts || {}).length >= 10, tag + ' 字号剖面收集到 ≥ 10 个位置（实测 ' + Object.keys(g.fonts || {}).length + '）');
    /* 截图区高度：如实打印（Chromium 的截图上限约 16000 像素高；超了就拍不到，下面会如实说明而不假装拍到）*/
    say('  ' + tag + ' 截图区高度：' + g.shots.map((s2) => s2.id + ' ' + s2.h + ' CSS px ⇒ ' + s2.px2 + ' 像素高'
      + (s2.px2 > 16000 ? '（超上限 16000 ⇒ 该视口这张图不落盘）' : '')).join('；'));

    say('  · 每块探针完成');
    /* ── [P] PNG（在切状态／展开之前拍，保证是**默认态**；每张图只含一个截图区，同一个视口宽，不缩放拼图）── */
    if (!NO_SHOT && SHOT_SET.has(vp.w)) {
      await send('Runtime.evaluate', { expression: 'window.scrollTo(0,0); 1', returnByValue: true });
      await sleep(150);
      const shotNow = await evalJson(PAGE_PROBE);
      for (const s2 of shotNow.shots) {
        /* Chromium 的截图上限（约 16000 像素高）：超了就**拍不到**。本脚本不假装拍到，也不偷偷跳过 ——
         * 430 是硬要求点名的交付那一个视口 ⇒ 它拍不出来就**如实报失败**；320／1180（只在 --all-shots 下）则如实打印一条 note。 */
        if (s2.px2 > 16000) {
          say('  ' + tag + ' 如实说明：截图区 ' + s2.id + ' 的实测像素高 ' + s2.px2 + ' > 16000（Chromium 截图上限）⇒ 这一张**不落盘**；页面本身不受影响，要看它在浏览器里打开即可。');
          if (vp.w === 430) ok(false, tag + ' 截图区 ' + s2.id + ' 像素高 ' + s2.px2 + ' 超上限 16000 ⇒ 430 的交付图拍不出来（如实报失败，不假装）');
          continue;
        }
        const name = s2.id === 'U' ? ('q-about-update.' + vp.w + '.png') : ('q-about-update.states.' + vp.w + '.png');
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
        const pw = hdr.readUInt32BE(16), ph = hdr.readUInt32BE(20);
        const sigOk = buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
        ok(sigOk, tag + ' ' + name + ' PNG 头合法');
        ok(pw === vp.w * 2, tag + ' ' + name + ' 像素宽 ＝ 视口宽×2（' + pw + '）');
        ok(Math.abs(ph - Math.round(s2.h * 2)) <= 2, tag + ' ' + name + ' 像素高 ＝ 截图区 CSS 高×2（' + ph + ' vs ' + Math.round(s2.h * 2) + '）');
        ok(statSync(file).size > 20000, tag + ' ' + name + ' 非空（' + statSync(file).size + ' 字节）');
        say('  ' + tag + ' PNG → ' + name + '  ' + pw + '×' + ph + '  ' + Math.round(statSync(file).size / 1024) + ' KB（截图区 top=' + Math.round(s2.top) + '）');
      }
    } else if (!NO_SHOT) {
      say('  ' + tag + ' 行为已查（默认态／11 个状态／夹具态／展开态各一次）；这两张图默认不落盘（要它们加 --all-shots）');
    }

    /* ── [T] 状态矩阵：11 状态 × 5 档 ── */
    say('  · 状态矩阵开始（11 个状态 × 5 档）');
    for (const s of STATES) {
      await send('Runtime.evaluate', { expression: 'window.__ABOUT_UPD__.setState(' + JSON.stringify(s.key) + '); 1', returnByValue: true });
      const m = await evalJson(PAGE_PROBE);
      ok(m.docState === s.key, tag + ' setState(' + s.key + ') 生效（实测 ' + m.docState + '）');
      ok(m.over.length === 0, tag + ' 状态 ' + s.key + '：无横向溢出（越界 ' + m.over.length + ' 个）');
      ok(m.docW === vp.w && m.bodyW === vp.w && m.vvW === vp.w, tag + ' 状态 ' + s.key + '：docW／bodyW／visualViewport 仍＝视口宽');
      const mb = {};
      m.blocks.forEach((b) => { mb[b.id] = b; });
      ok(m.blocks.length === 16, tag + ' 状态 ' + s.key + '：块数仍 16（实测 ' + m.blocks.length + '）');
      /* 页面侧导出与脚本期望逐字比对（先比定义，再比 DOM 渲染出来的那串）*/
      ok(m.api.text[s.key] === s.text, tag + ' 状态 ' + s.key + '：页面侧文案定义逐字相同（实测 ' + JSON.stringify(m.api.text[s.key]) + '）');
      ok(m.api.veracity[s.key] === s.veracity, tag + ' 状态 ' + s.key + '：页面侧真实性标注＝' + s.veracity + '（实测 ' + m.api.veracity[s.key] + '）');
      ok(JSON.stringify(m.api.steps[s.key]) === JSON.stringify(s.steps), tag + ' 状态 ' + s.key + '：页面侧四步结果与脚本期望相同');
      const a = m.api.actions[s.key];
      ok(a && a.primary[0] === s.act[0] && a.primary[1] === s.act[1] && a.enabled === s.act[2], tag + ' 状态 ' + s.key + '：页面侧动作映射＝脚本期望');

      TIERS.forEach((t) => {
        const b = mb[t.id];
        ok(!!b, tag + ' 状态 ' + s.key + '：有块 ' + t.id);
        if (!b) return;
        ok(b.left === 0, tag + ' 状态 ' + s.key + ' ' + t.id + ' 块左沿 0');
        ok(b.w === vp.w, tag + ' 状态 ' + s.key + ' ' + t.id + ' 块宽恰＝视口宽（' + b.w + '）');
        near(b.colW, C, 0.02, tag + ' 状态 ' + s.key + ' ' + t.id + ' 列宽＝公式值');
        /* 逐字状态文案 */
        ok(b.statusText === s.text, tag + ' 状态 ' + s.key + ' ' + t.id + ' 状态文案逐字（实测 ' + JSON.stringify(b.statusText) + '）');
        ok((b.statusWarn === true) === s.warn, tag + ' 状态 ' + s.key + ' ' + t.id + ' warn 通道标记＝' + s.warn + '（实测 ' + b.statusWarn + '）');
        /* 动作 */
        ok(b.primaryText === s.act[0], tag + ' 状态 ' + s.key + ' ' + t.id + ' 主按钮文字＝' + JSON.stringify(s.act[0]) + '（实测 ' + JSON.stringify(b.primaryText) + '）');
        ok(b.primaryDisabled === !s.act[2], tag + ' 状态 ' + s.key + ' ' + t.id + ' 主按钮禁用＝' + (!s.act[2]) + '（实测 ' + b.primaryDisabled + '）');
        ok((b.primaryReal === '0') === (!s.act[1]), tag + ' 状态 ' + s.key + ' ' + t.id + ' 未批准动作标记（primaryReal=' + b.primaryReal + '）');
        ok(((b.primaryCls || '').indexOf('todo') >= 0) === (!s.act[1]), tag + ' 状态 ' + s.key + ' ' + t.id + ' 未批准动作走 warn 通道的 .todo 样式（' + b.primaryCls + '）');
        /* 第二个动作：本档放不放得下 */
        if (s.sec) {
          if (t.secondary === 'none') {
            ok(!b.hasSecondary, tag + ' 状态 ' + s.key + ' ' + t.id + '（声明放不下第二动作）确实没渲染第二个按钮');
            ok(b.hasDropNote, tag + ' 状态 ' + s.key + ' ' + t.id + ' 写出了「第二动作没有位置」');
          } else {
            ok(b.hasSecondary && b.secondaryText === s.sec, tag + ' 状态 ' + s.key + ' ' + t.id + ' 第二动作＝' + s.sec + '（实测 ' + JSON.stringify(b.secondaryText) + '）');
            ok(!b.hasDropNote, tag + ' 状态 ' + s.key + ' ' + t.id + ' 没有多余的位置说明');
          }
        } else {
          ok(!b.hasSecondary, tag + ' 状态 ' + s.key + ' ' + t.id + ' 没有第二动作（该状态只有一个动作）');
        }
        /* 「上次检查」位置：由几何独立判定 */
        const cls = classifyLast(b, t);
        ok(cls === t.lastpos, tag + ' 状态 ' + s.key + ' ' + t.id + ' 「上次检查」位置＝' + t.lastpos + '（几何判定 ' + cls + '）');
        if (t.lastpos === 'none') {
          ok(!b.lastExists && b.lastText === null, tag + ' 状态 ' + s.key + ' ' + t.id + ' 确实不留「上次检查」');
        } else {
          ok(!!b.lastText && /上次检查：⟨上次检查时间⟩/.test(b.lastText), tag + ' 状态 ' + s.key + ' ' + t.id + ' 「上次检查」文案带运行时占位（' + JSON.stringify(b.lastText) + '）');
          ok(b.lastMono === true, tag + ' 状态 ' + s.key + ' ' + t.id + ' 「上次检查」用等宽字体');
          if (t.lastpos === 'own-section') ok(b.lastResultText === '上次结果：⟨上次结果摘要⟩', tag + ' 状态 ' + s.key + ' ' + t.id + ' 独立分区里另有「上次结果」一行');
        }
        /* 未批准功能的虚线小标 */
        ok(b.hasUnmark === (s.veracity !== 'real'), tag + ' 状态 ' + s.key + ' ' + t.id + ' 未批准小标存在＝' + (s.veracity !== 'real') + '（实测 ' + b.hasUnmark + '）');
        if (b.hasUnmark) {
          ok(/未批准功能的原型表达|呈现方式/.test(b.unmarkText), tag + ' 状态 ' + s.key + ' ' + t.id + ' 小标写明「未批准功能的原型表达」');
        }
        /* 四步式：逐字 */
        if (t.org === 'steps') {
          ok(b.steps.length === 4, tag + ' 状态 ' + s.key + ' ' + t.id + ' 四步（实测 ' + b.steps.length + '）');
          s.steps.forEach((sv, i) => {
            ok(b.steps[i] && b.steps[i].v === sv, tag + ' 状态 ' + s.key + ' ' + t.id + ' 第' + (i + 1) + '步结果逐字＝' + JSON.stringify(sv) + '（实测 ' + JSON.stringify(b.steps[i] && b.steps[i].v) + '）');
          });
        }
        /* 分区式：三个分区与小标题 */
        if (t.org === 'zones') {
          ok(b.zoneTitles.length === 3 && b.zoneTitles.join('／') === '当前状态／动作／上一次结果',
            tag + ' 状态 ' + s.key + ' ' + t.id + ' 三个分区小标题（实测 ' + b.zoneTitles.join('／') + '）');
        }
        /* 折叠：默认必须收起 */
        if (t.org === 'fold') {
          ok(b.panelHidden === true && b.summaryExpanded === 'false', tag + ' 状态 ' + s.key + ' ' + t.id + ' 默认收起（panel hidden、aria-expanded=false）');
          ok(b.summaryTag === 'BUTTON' && b.summaryType === 'button', tag + ' 状态 ' + s.key + ' ' + t.id + ' 摘要行是 <button type=button>');
          ok(b.summaryText === '内容更新' + s.short + '›', tag + ' 状态 ' + s.key + ' ' + t.id + ' 摘要＝「内容更新」＋状态词『' + s.short + '』＋可达记号（实测 ' + JSON.stringify(b.summaryText) + '）');
          ok(b.summaryLabel === '内容更新' && b.summaryState === s.short, tag + ' 状态 ' + s.key + ' ' + t.id + ' 摘要的两段分别是「内容更新」与状态词（实测 ' + JSON.stringify(b.summaryLabel) + '／' + JSON.stringify(b.summaryState) + '）');
          ok(b.statusInPanel === true, tag + ' 状态 ' + s.key + ' ' + t.id + ' 完整状态句在展开面板里');
        }
        /* 字体剖面 */
        b.style = [];
      });
      /* 430 那一轮：逐字打印（状态文案 ＋ 动作 ＋ 上次检查位置）*/
      if (vp.w === TABLE_V) {
        say('  ' + tag + ' 状态 ' + s.key + '（' + s.pretty + '／' + s.veracity + '）文案：' + JSON.stringify(s.text));
        TIERS.forEach((t) => {
          const b = mb[t.id];
          if (!b) return;
          say('      ' + t.id + ' ' + (b.statusLines === null ? '（折叠未展开）' : b.statusLines + ' 行')
            + ' ｜ 动作 ' + b.primaryText + (b.primaryDisabled ? '(禁用)' : '') + (b.hasSecondary ? ' ＋ ' + b.secondaryText : '')
            + ' ｜ 上次检查 ' + (b.lastExists ? t.lastpos + (b.lastTop === null ? '（在收起的面板里）' : '（距块顶 ' + b.lastTop + '，与主按钮竖向重叠 ' + b.lastOverlapPrimary + 'px）') : '不留')
            + ' ｜ 未批准小标 ' + (b.hasUnmark ? '有' : '无')
            + ' ｜ 块高 ' + b.h + '（应用层 ' + b.updAppH + '）');
        });
      }
    }

    /* 回到默认态（截图与后续检查都基于默认态） */
    await send('Runtime.evaluate', { expression: 'window.__ABOUT_UPD__.setState("idle"); 1', returnByValue: true });
    const back = await evalJson(PAGE_PROBE);
    ok(back.docState === 'idle', tag + ' 矩阵跑完回到默认态 idle');

    say('  · 矩阵完成；折叠测试');
    /* ── [X] 折叠（U3）：真鼠标点摘要行 ── */
    {
      const box = await evalJson('(function(){var h=document.querySelector("[data-test=foldsummary]");h.scrollIntoView({block:"center"});var r=h.getBoundingClientRect();return JSON.stringify({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2),inView:r.top>=0&&r.bottom<=innerHeight,hidden:h.parentNode.querySelector("[data-test=foldpanel]").hidden});})()');
      ok(box.hidden === true, tag + ' U3 默认收起（探查时 panel.hidden=' + box.hidden + '）');
      ok(box.inView, tag + ' U3 摘要行点之前在视口内（y=' + box.y + '）');
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
      await sleep(200);
      const f = await evalJson(PAGE_PROBE);
      const u3 = f.blocks.filter((b) => b.id === 'U3')[0];
      ok(!!u3 && u3.panelHidden === false && u3.summaryExpanded === 'true', tag + ' 真鼠标点摘要行 ⇒ U3 展开（hidden=' + (u3 && u3.panelHidden) + '，aria-expanded=' + (u3 && u3.summaryExpanded) + '）');
      ok(f.over.length === 0, tag + ' U3 展开态：无横向溢出（越界 ' + f.over.length + ' 个）');
      ok(f.docW === vp.w && f.bodyW === vp.w && f.vvW === vp.w, tag + ' U3 展开态：docW／bodyW／visualViewport 仍＝视口宽');
      near(u3.colW, C, 0.02, tag + ' U3 展开态：内容列宽仍＝公式值');
      ok(u3 && u3.statusLines >= 1, tag + ' U3 展开态：状态句有行（' + (u3 && u3.statusLines) + ' 行）');
      say('  ' + tag + ' U3 展开态（此刻状态＝' + f.docState + ' 的文案）：状态句 ' + (u3 && u3.statusLines) + ' 行，最长行宽 ' + (u3 && u3.statusW) + '（可用 ' + (u3 ? Math.round((u3.colW - 2 * u3.edge) * 100) / 100 : '?') + '），块高 ' + (u3 && u3.h));
      /* 再点一次 ⇒ 收起 */
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
      await sleep(200);
      const f2 = await evalJson(PAGE_PROBE);
      const u3b = f2.blocks.filter((b) => b.id === 'U3')[0];
      ok(!!u3b && u3b.panelHidden === true, tag + ' 再点一次 ⇒ U3 回到收起（hidden=' + (u3b && u3b.panelHidden) + '）');
    }

    say('  · 折叠测试完成；夹具态');
    /* ── [F] 夹具态：最长的如实报错 ── */
    {
      const pos = await evalJson('(function(){var b=document.querySelector("[data-test=fixture-toggle]");b.scrollIntoView({block:"center"});var r=b.getBoundingClientRect();return JSON.stringify({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2),inView:r.top>=0&&r.bottom<=innerHeight});})()');
      ok(pos.inView, tag + ' 夹具开关点之前在视口内（y=' + pos.y + '）');
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pos.x, y: pos.y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pos.x, y: pos.y, button: 'left', clickCount: 1 });
      await sleep(250);
      /* U3 是折叠的 ⇒ 展开它，让夹具长句真的参与排版 */
      const hbox = await evalJson('(function(){var h=document.querySelector("[data-test=foldsummary]");h.scrollIntoView({block:"center"});var r=h.getBoundingClientRect();return JSON.stringify({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2),inView:r.top>=0&&r.bottom<=innerHeight});})()');
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: hbox.x, y: hbox.y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: hbox.x, y: hbox.y, button: 'left', clickCount: 1 });
      await sleep(250);
      const f = await evalJson(PAGE_PROBE);
      ok(f.fixture === 'long', tag + ' 真鼠标点了夹具开关 ⇒ 进入夹具态（fixture=' + f.fixture + '）');
      ok(f.over.length === 0, tag + ' 夹具态无横向溢出（越界元素 ' + f.over.length + ' 个：' + JSON.stringify(f.over.slice(0, 4)) + '）');
      ok(f.docW === vp.w && f.bodyW === vp.w && f.vvW === vp.w, tag + ' 夹具态：docW／bodyW／visualViewport 仍＝视口宽');
      ok(f.api.fixtureLine === FIXTURE_LINE, tag + ' 夹具句逐字＝脚本期望（实测 ' + JSON.stringify(f.api.fixtureLine) + '）');
      ok(!/[0-9]{4}\.[0-9]/.test(FIXTURE_LINE.replace(/2026\.10\.16\.20/g, '')) && FIXTURE_LINE.includes('⟨'), tag + ' 夹具句里的数字全是运行时占位（没有写死版本/字节数）');
      f.blocks.forEach((b) => {
        ok(b.left === 0 && b.w === vp.w, tag + ' 夹具态 ' + b.id + ' 仍恰＝视口宽、左沿 0');
        near(b.colW, C, 0.02, tag + ' 夹具态 ' + b.id + ' 内容列宽仍＝公式值');
        ok(b.statusText === FIXTURE_LINE, tag + ' 夹具态 ' + b.id + ' 状态句＝最长如实报错（实测 ' + JSON.stringify((b.statusText || '').slice(0, 24)) + '…）');
      });
      const st = f.blocks.filter((b) => b.id === 'U2')[0];
      say('  ' + tag + ' 夹具态：无溢出；最长行宽／可用：'
        + f.blocks.filter((b) => b.id === 'U1' || b.id === 'U2' || b.id === 'U3').map((b) => b.id + ' ' + b.statusLines + '行·宽 ' + b.statusW).join('；')
        + '（可用 ' + Math.round((st.colW - 2 * st.edge) * 100) / 100 + '；U2 块高 ' + st.h + '）');
      /* 夹具态切回去（不影响 PNG）—— 重新量一次开关位置：中间展开过折叠块，页面滚动位置变了 */
      const pos2 = await evalJson('(function(){var b=document.querySelector("[data-test=fixture-toggle]");b.scrollIntoView({block:"center"});var r=b.getBoundingClientRect();return JSON.stringify({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2),inView:r.top>=0&&r.bottom<=innerHeight});})()');
      ok(pos2.inView, tag + ' 夹具开关（第二次点）在视口内（y=' + pos2.y + '）');
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pos2.x, y: pos2.y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pos2.x, y: pos2.y, button: 'left', clickCount: 1 });
      await sleep(250);
      const f2 = await evalJson(PAGE_PROBE);
      ok(f2.fixture === 'short', tag + ' 夹具已切回默认（fixture=' + f2.fixture + '）');
    }

    /* ── 页面报错 ── */
    ok(state.errors.length === 0, tag + ' 没有 JS 报错（' + state.errors.join(' | ') + '）');

    /* ── 收集几何表（只收 430 那一轮）── */
    if (vp.w === TABLE_V && !TABLE.length) {
      const g2 = await evalJson(PAGE_PROBE);
      g2.blocks.forEach((b) => {
        TABLE.push({
          id: b.id, tier: b.tier, group: b.group, state: b.state, V: vp.w,
          block: b.w + '×' + b.h, left: b.left, C: b.colW, gutter: b.colLeft,
          avail: Math.round((b.colW - 2 * b.edge) * 100) / 100,
          appH: b.updAppH, marksH: b.marksH,
          statusText: b.statusText, statusLines: b.statusLines, statusW: b.statusW,
          primary: b.primaryText, primaryDisabled: b.primaryDisabled, primaryReal: b.primaryReal,
          secondary: b.secondaryText || '', lastExists: b.lastExists, lastPos: b.lastPos || (b.lastExists ? '有' : ''),
          unmark: b.hasUnmark, ctl: b.ctlCount,
        });
      });
    }

    /* ── [P] PNG：已在默认态阶段拍过（上面）── */

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
  if (VIEWPORTS.length > 1) {
    ok(Object.keys(fontProfile).length >= 10, '字号剖面覆盖 ≥ 10 个位置（实测 ' + Object.keys(fontProfile).length + '）');
    ok(bad === 0, '每个位置的字号/行高/字距在所有视口下完全一致（变化 ' + bad + ' 处）');
  }
  Object.keys(fontProfile).forEach((sel) => say('  ' + sel + '：' + [...fontProfile[sel]].join(' ／ ')));
}

/* —— 每块实测几何表（给 q-about-update.md 与报告用；只打印，不断言）—— */
say('');
say('── 每块实测几何（视口 ' + (TABLE.length ? TABLE[0].V : '?') + '；默认态）──');
if (TABLE.length) {
  say('| 块 | 档/状态 | 块宽×高 | 应用层高 | C | 列外余白 | 可用 | 状态句 | 行数 | 动作 | 上次检查 | 未批准小标 | 可点 |');
  say('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  TABLE.forEach((t) => {
    say('| ' + t.id + ' | ' + t.tier + '/' + t.state + ' | ' + t.block + ' | ' + t.appH + '（＋注 ' + t.marksH + '） | ' + t.C +
        ' | ' + t.gutter + ' | ' + t.avail +
        ' | ' + (t.statusLines === null ? '（折叠）' : '"' + String(t.statusText).slice(0, 22) + '…"') +
        ' | ' + (t.statusLines === null ? '—' : t.statusLines) +
        ' | ' + t.primary + (t.primaryReal === '0' ? '(未批准)' : '') + (t.primaryDisabled ? '(禁用)' : '') +
        ' | ' + (t.lastExists ? t.lastPos : '不留') +
        ' | ' + (t.unmark ? '有' : '无') + ' | ' + t.ctl + ' |');
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
