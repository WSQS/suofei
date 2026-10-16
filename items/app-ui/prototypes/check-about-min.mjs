/*
 * check-about-min.mjs —— 「关于页 · 更新处极简版」原型（q-about-min.html）的自证脚本（可复跑）。
 *
 * ⚠ 它验的是**这一个原型页面**，**不是产品代码**：
 *   对象只有本目录下的 q-about-min.html（**只读打开**：Page.navigate 到 file:// URL；脚本不写、不改它）。
 *   额外读的文件只有两个，都是**只读**：
 *     ① prototype/css/theme-tech.css —— 逐项比对页面内嵌的令牌快照，并用 git hash-object 核它的 blob；
 *     ② git 仓库本身 —— 只为取 theme-tech.css 的 blob 哈希（不 commit、不 push、不 tag）。
 *
 * 断言清单（失败任一即 exit 1）：
 *  [G] 静态（不开浏览器）：
 *      · 令牌快照逐项比对 theme-tech.css（值不一致 0、缺失 0）；快照里**没有**「声明了却没用」的令牌；
 *        页面里每个 var() 都有声明；快照写明权威仍是 docs/design/visual-tokens.md，记了 blob 与记录时 HEAD；
 *        blob ＝ `git hash-object prototype/css/theme-tech.css`；theme 文件相对 HEAD 无本地改动。
 *      · 已定项逐条在页面上写明（A3 次序／仓库＝完整 URL 无提示／宽度口径与「24 是一次性扣除总量」／
 *        更新处＝上方按钮＋下方状态文本、原地替换／去框：没有容器边框·底色·阴影·标题·分隔线／
 *        **初态不显示状态文本、不做空的说明位**／**对齐＝3 档并列候选、不排序不写推荐不替用户选**／
 *        只做内容更新不做 APK 更新／「来源」不画且未定／这是材料不是实施、选某档≠采纳整页规格、不决定 JSON／MD 与产物字段）。
 *      · 自包含：无 <link／<script src／@import／url(http／fetch(／XMLHttpRequest；无内联 onclick。
 *      · 视觉：无 @keyframes、无 animation、**没有 box-shadow 声明**、transition 只允许 var(--row-transition)。
 *  [V] 每个视口（320／430／1180 各跑一遍，默认态）：
 *      · innerWidth／innerHeight 精确等于目标；docW ＝ bodyW ＝ **visualViewport.width** ＝ 视口宽（防 shrink-to-fit）；
 *      · **每块恰＝视口宽、块左沿 0**；内容列宽＝公式复算值（±0.02）；列外余白＝(V−C)/2；行内沿 16.8px；
 *      · **无横向溢出**（所有可见元素都在 0…视口宽 内）；可点元素**只有** <a href> 与 <button type=button>；
 *      · 每块都有 应用名／版本相邻组／按钮（＋有结果时才有一段状态文本）／仓库链接，**版本相邻组里没有「来源」**；
 *        仓库文字＝完整 URL、无「在浏览器打开」提示、是内容列最后一条；
 *      · **产品区真的去框**：扫内容列这一层（**排除按钮自己的子树**）的**计算值** —— 有边框的元素 0、
 *        有底色的 0、有阴影的 0、有圆角的 0、标题元素 0、<hr> 0、只有上/下边框的「分隔线」0、来源元素 0；
 *        `.col` 自身 border 上/右/下/左＝0px、background＝rgba(0,0,0,0)、box-shadow＝none、border-radius＝0px；
 *        按钮自身的边框／底色／圆角照旧在（禁用态底色透明但边框仍在）；
 *      · **按钮与 label 的父级就是内容流**：btn.parentElement === status.parentElement === .col；
 *      · 间距：版本组→按钮 14.4px（0.9rem）、按钮→状态文本 8px（0.5rem）、状态文本→仓库 14.4px；
 *      · 页面里的 <details>/<summary> 数 0；状态查看器在**截图范围之外**、不在块内；
 *        「原型说明／不属于应用页面」横幅在截图范围之内且可见；
 *      · 无外部请求；无 JS 报错；字号/行高/字距在各视口完全一致（不随视口缩放）。
 *  [A] **初态（尚未检查）只有按钮**（用户 2026-10-15 返修）：
 *      · 初态那一块里 **`[data-test=status]` 根本不存在**（存在性断言），也不可见（可见性断言）；
 *        内容列的直接子元素恰是 [应用名, 版本相邻组, 按钮, 仓库] ⇒ **没有空的说明位／占位**；
 *        ⇒ 并断言「按钮 → 仓库」的间距仍是 0.9rem 节间距，且初态块高 ＝ 已是最新那块高 −（状态文本高＋8px 缝）
 *        （±0.15px）—— 这证明缺席的 label **没有留下任何被占掉的空位**。
 *      · 其余每一格：`[data-test=status]` **存在且可见**（rects>0、visibility 非 hidden、display 非 none）。
 *  [T] 状态真实性（**逐字**）：把 **5 个真实状态 ＋ 1 格最长失败夹具** 与脚本独立期望比对 ——
 *      先比页面导出的定义（window.__ABOUT_MIN__），再比 DOM 真的渲染出来的那一串；
 *      · **检查中 ⇒ 唯一按钮 disabled**；其余五个状态按钮**必须可用**；
 *      · 六格（含夹具）的结构序列（有/无 label）与状态文本的颜色／字号／行高各自一致。
 *  [Q] **对齐三档并列**（用户只说了「按钮和说明的对齐问题」、没指定方向 ⇒ 三档并列、不排序、不写推荐）：
 *      逐档实测（相对内容列左沿）：按钮**外沿** x、按钮**文字墨迹**左沿 x、状态文本**墨迹**左沿 x、按钮块中心 x，
 *      以及两两差值；并断言三档**互不相同**：
 *      · A1（外沿对齐＝现状事实）：外沿 16.8px，文字差 **+12.2px 左右**（＝按钮的 1px 边框 ＋ 0.7rem 内边距）；
 *      · A2（文字沿对齐）：文字差 **0**（±0.05px），此时按钮外沿约 4.6px；
 *      · A3（中心对齐）：按钮块中心 ≈ 内容列中心（±0.05px）＝状态文本**盒**中心；同时打印它与状态文本**墨迹**中心的差。
 *      · 页面自己量的一份（window.__ABOUT_MIN__.alignMeasured）与脚本独立量的一份逐档比对（±0.05px）。
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
 *   - Node（用到内置 fetch／WebSocket／net，故需较新的 Node；本机实测 v25.9.0 通过）；
 *   - **本机无头 Chromium**：环境变量 CHROME_BIN → 否则 %LOCALAPPDATA%\Chromium\Application\chrome.exe。
 *     找不到就**如实报错并 exit 2**（CHROME_BIN 指到错路径也走这一条，不会假装通过）；
 *   - **不需要**任何 npm 依赖：不装包、不联网、不起静态服务（直接开 file://）；
 *   - **端口**：CDP 调试端口**先向内核要一个空闲端口**（net 监听 0 再关掉），**不写死**；
 *   - **仓库根**：从脚本所在目录**向上查找 prototype/css/theme-tech.css** 来定位，**不写死层级**。
 *
 * 副作用：临时目录建一个 Chromium profile 并删掉；默认重写本目录 1 张 PNG（复跑可能让 PNG 变脏，正常现象）；
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

/* Chromium 的截图上限（约 16000 像素高）：超了就拍不到，本脚本不假装拍到 */
const SHOT_MAX_PX = 16000;

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
 * 本脚本**独立**期望（不复用页面里的定义 —— 页面侧的定义由运行时探针取出后逐字比对）
 * ═══════════════════════════════════════════════════════════════════ */
const APPVER = '0.1.1';
const CONTENTVER = '2026.10.16.20';
const REPO = 'https://github.com/WSQS/suofei';
const APPNAME = '索斐';
const BUTTON = '检查更新';

/* 逐字文案（运行时值用 ⟨…⟩ 占位）—— 来源：android/.../ui/UpdateStatusText.kt
 * text: null ⇒ **初态不生成状态文本元素**（用户 2026-10-15 返修） */
const STATES = [
  { key: 'idle', label: '尚未检查', text: null, enabled: true, inImage: true },
  { key: 'checking', label: '检查中', text: '正在检查…', enabled: false, inImage: false },
  { key: 'uptodate', label: '已是最新', text: '已是最新内容（远端 ⟨内容版本⟩）。', enabled: true, inImage: true },
  { key: 'activated', label: '已下载并切换生效', text: '新内容 ⟨内容版本⟩ 已下载、校验通过并已切换生效（⟨字节数⟩ 字节）；返回目录后采用。', enabled: true, inImage: false },
  { key: 'failed', label: '失败·旧内容保留', text: '更新未生效，旧内容保留：⟨原因⟩', enabled: true, inImage: false },
];
const FIXTURE = {
  key: 'failed-long', label: '失败·最长原因（夹具）', enabled: true, inImage: true, fixture: true,
  text: '更新未生效，旧内容保留：SHA-256 不符（清单 ⟨清单 SHA-256⟩，实际 ⟨实际 SHA-256⟩）；已丢弃下载结果，保留旧内容（下载/校验未通过）',
};
const ALLS = STATES.concat([FIXTURE]);
const ST_BY_KEY = Object.fromEntries(ALLS.map((s) => [s.key, s]));
const IN_IMAGE = ALLS.filter((s) => s.inImage).map((s) => s.key);

/* 对齐三档（并列，不排序、不写推荐）*/
const ALIGNS = ['A1', 'A2', 'A3'];
const ALIGN_FOR_A = 'A1';                       /* A 组（状态格）固定用现状事实那一档 */
const BTN_BORDER = 1, BTN_PAD_X = 11.2;         /* 按钮自身的 1px 边框 ＋ 0.7rem 内边距 */

/* 截图里应当出现的「块内元素形态」（有 label ／ 无 label 两种） */
const SHAPE_WITH_LABEL = [
  'DIV|col', 'P|brand', 'DIV|verpair', 'DIV|kv', 'SPAN|k', 'SPAN|v',
  'DIV|kv', 'SPAN|k', 'SPAN|v',
  'BUTTON|primarybtn', 'P|status',
  'DIV|repowrap', 'A|repolink',
];
const SHAPE_NO_LABEL = SHAPE_WITH_LABEL.filter((s) => s !== 'P|status');
const COLKIDS_WITH_LABEL = ['P|brand', 'DIV|verpair', 'BUTTON|primarybtn', 'P|status', 'DIV|repowrap'];
const COLKIDS_NO_LABEL = ['P|brand', 'DIV|verpair', 'BUTTON|primarybtn', 'DIV|repowrap'];

/* 页面上必须逐条写明的已定项（**去掉标签后**的纯文本里匹配） */
const FIXED_NOTES = [
  ['更新处＝上方一个按钮「检查更新」＋下方一段状态说明文本', /更新[块处]＝上方一个按钮「检查更新」＋下方一段状态说明文本/],
  ['状态在原地替换（换文字，不换结构、不新增行／块）', /状态在原地替换/],
  ['重点在上方／按钮在这一处的顶部', /重点在上方/],
  ['不做折叠／步骤／分区／上次检查／多动作', /不做折叠／步骤／分区／「上次检查／历史结果」／多动作/],
  ['整页次序＝A3', /整页次序＝A3/],
  ['版本相邻组（不含「来源」行）', /版本相邻组（不含「来源」行）/],
  ['仓库链接＝完整 URL（C1）且不给浏览器提示', /仓库链接＝完整 URL（C1）/],
  ['宽度口径 C = min(V, max(320, 0.88×(V−24)))', /C = min\(V, max\(320, 0\.88 × \(V − 24\)\)\)/],
  ['24 是一次性扣除总量，不是左右各 12px', /24 是一次性从视口宽扣掉的总量/],
  ['静默终端令牌 + 权威仍是 visual-tokens.md', /静默终端令牌/],
  ['只做内容更新，不做 APK 更新', /只做内容更新，不做 APK 更新/],
  ['「来源」不画、也不假装已定', /「来源（内置／已下载）」不画/],
  ['产品区不框出来（用户返修要求）', /不把它框出来/],
  ['产品区没有容器边框／底色／阴影／标题／分隔线', /这一处没有容器边框／底色／阴影／标题／分隔线/],
  ['按钮与状态文本直接在页面内容流里', /按钮与状态文本直接在内容流里/],
  ['按钮自身的边框／底色／圆角照旧保留', /按钮自身的边框／底色／圆角照旧保留/],
  ['初态不显示状态文本（用户返修要求）', /初态（尚未检查）不显示状态文本/],
  ['初态不做空的说明位（不占位、不留空行）', /不做空的说明位/],
  ['对齐＝3 档并列候选且不替用户选', /对齐＝3 档并列候选/],
  ['对齐三档不排序、不写推荐', /不排序、不写推荐、不替用户选/],
  ['这是材料、不是实施／功能批准', /不是产品实施 · 不是功能批准/],
  ['选某档 ≠ 采纳整页规格', /≠ 采纳整页规格/],
  ['不决定 JSON／MD 分界与产物字段', /不决定 JSON／MD 分界与任何产物字段/],
];

/* ═══════════════════════════════════════════════════════════════════
 * [G] 静态检查（不开浏览器）
 * ═══════════════════════════════════════════════════════════════════ */
if (!existsSync(PAGE)) { console.error('找不到原型页面：' + PAGE); process.exit(2); }
const HTML = readFileSync(PAGE, 'utf8');
/* 去标签后的纯文本：页面上「已定项」的逐条断言用它匹配（免得被 <b> 这类标记打断） */
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

/* G3 已定项 / 口径 写在页面上 */
{
  FIXED_NOTES.forEach(([label, re]) => ok(re.test(HTMLTEXT), '页面上写明：' + label));
  ok(/data-deduct="24"/.test(HTML) && /data-pct="88"/.test(HTML) && /data-floor="320"/.test(HTML) && /data-cap="viewport"/.test(HTML),
    '页面记录宽度参数（24／88／320／上界＝视口）');
  say('  [G] 已定项：' + FIXED_NOTES.length + ' 条逐条在页面上写明');
}

/* G4 自包含／无内联事件／视觉禁令 */
{
  const forbidden = [
    ['<link', /<link\b/i], ['<script src', /<script[^>]*\bsrc=/i], ['@import', /@import/i],
    ['url(http', /url\(\s*['"]?https?:/i], ['fetch(', /\bfetch\s*\(/], ['XMLHttpRequest', /XMLHttpRequest/],
    ['内联 onclick', /\bon(click|load|error|mouseover)\s*=/i],
  ];
  forbidden.forEach(([label, re]) => ok(!re.test(HTML), '静态自包含：页面里没有 ' + label));
  ok(!/@keyframes/i.test(HTML), '没有 @keyframes（视觉规范：不做位移动画）');
  ok(!/\banimation\s*:/i.test(HTML), '没有 animation 声明');
  const trans = [...HTML.matchAll(/(?<![\w-])transition\s*:\s*([^;]+);/gi)].map((m) => m[1].trim());
  ok(trans.length > 0 && trans.every((t) => t === 'var(--row-transition)'), 'transition 只允许 var(--row-transition)（实测 ' + trans.length + ' 处：' + JSON.stringify(trans) + '）');
  const shadows = [...HTML.matchAll(/(?<![\w-])box-shadow\s*:\s*([^;]+);/gi)].map((m) => m[1].trim());
  ok(shadows.length === 0, '页面里**没有 box-shadow 声明**（产品区真的没框、无阴影；实测 ' + shadows.length + ' 处：' + JSON.stringify(shadows) + '）');
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

/* 页面侧探针（只读；不写页面）。写成真函数再 toString —— 免得引号转义出错。 */
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
  function inkRect(e) {
    if (!e) return null;
    var r = document.createRange(); r.selectNodeContents(e);
    var rs = r.getClientRects();
    var left = null, right = null, w = 0;
    for (var i = 0; i < rs.length; i++) {
      if (rs[i].width <= 0) continue;
      if (left === null || rs[i].left < left) left = rs[i].left;
      if (right === null || rs[i].right > right) right = rs[i].right;
      if (rs[i].width > w) w = rs[i].width;
    }
    return { left: left, right: right, w: P(w) };
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
  out.mode = doc.dataset.mode || '';
  out.docState = doc.dataset.state || '';
  out.params = { deduct: doc.dataset.deduct, pct: doc.dataset.pct, floor: doc.dataset.floor, cap: doc.dataset.cap, blob: doc.dataset.tokenBlob, head: doc.dataset.headSha };
  var api = window.__ABOUT_MIN__;
  out.api = api ? {
    deduct: api.deduct, pct: api.pct, floor: api.floor, cap: api.cap, app: api.app,
    stateKeys: api.stateKeys, labels: api.labels, text: api.text, showsLabel: api.showsLabel,
    inImage: api.inImage, btnEnabled: api.btnEnabled, buttonLabel: api.buttonLabel, fixtureText: api.fixtureText,
    alignKeys: api.alignKeys, alignLabels: api.alignLabels, alignForA: api.alignForA, cw: api.cw, alignMeasured: api.alignMeasured,
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
      tag: e.tagName, type: e.getAttribute('type'), href: e.hasAttribute('href'),
      cls: e.className || '', inPg: !!e.closest('.pg'),
      inStatePanel: !!e.closest('[data-test=state-panel]'),
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
    /* ── 产品区去框：扫内容列这一层（含 .col 自己），**排除按钮子树** ── */
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
    var bInk = inkRect(btn), sInk = inkRect(st);
    var b = {
      id: pg.dataset.block, state: pg.dataset.state, align: pg.dataset.align,
      inQ: !!pg.closest('[data-test=rackq]'),
      visible: !pg.hidden && !pg.closest('[data-test=demo]').hidden && rp.width > 0,
      left: P(rp.left), w: P(rp.width), h: P(rp.height),
      colLeft: P(rc.left), colW: P(rc.width),
      colPadL: P(parseFloat(CS(col, 'paddingLeft'))), colPadR: P(parseFloat(CS(col, 'paddingRight'))),
      colStyle: {
        borderTop: CS(col, 'borderTopWidth'), borderRight: CS(col, 'borderRightWidth'),
        borderBottom: CS(col, 'borderBottomWidth'), borderLeft: CS(col, 'borderLeftWidth'),
        bg: CS(col, 'backgroundColor'), shadow: CS(col, 'boxShadow'), radius: CS(col, 'borderTopLeftRadius'),
      },
      colKids: colKids,
      scan: scan,
      btnOwn: {
        bg: CS(btn, 'backgroundColor'), borderW: CS(btn, 'borderTopWidth'),
        radius: CS(btn, 'borderTopLeftRadius'), shadow: CS(btn, 'boxShadow'),
        padL: P(parseFloat(CS(btn, 'paddingLeft'))),
      },
      sameParent: st ? btn.parentElement === st.parentElement : null,
      btnParentIsCol: btn.parentElement === col,
      statusParentIsCol: st ? st.parentElement === col : null,
      edge: P(parseFloat(CS(pg.querySelector('[data-test=kv]'), 'paddingLeft'))),
      shape: shape(pg),
      brandText: txt(pg.querySelector('[data-test=brand]')),
      verPairText: verpair ? verpair.innerText.replace(/\s+/g, ' ').trim() : null,
      kvRows: rows.length,
      kRightSpread: rows.length ? P(Math.max.apply(null, kRight) - Math.min.apply(null, kRight)) : null,
      vLeftSpread: rows.length ? P(Math.max.apply(null, vLeft) - Math.min.apply(null, vLeft)) : null,
      gapVerToBtn: P(bt.top - vp.bottom),
      gapBtnToStatus: st ? P(R(st).top - bt.bottom) : null,
      gapBtnToRepo: P(rw.top - bt.bottom),
      gapStatusToRepo: st ? P(rw.top - R(st).bottom) : null,
      nextAfterBtn: btn.nextElementSibling ? btn.nextElementSibling.tagName + '|' + (btn.nextElementSibling.getAttribute('data-test') || '') : null,
      areaTop: P(bt.top - rp.top), areaH: P((st ? R(st).bottom : bt.bottom) - bt.top),
      statusExists: !!st, statusVisible: visible(st),
      statusText: txt(st), statusLines: linesOf(st), statusW: sInk ? sInk.w : null,
      statusFontSize: st ? CS(st, 'fontSize') : null,
      statusLineHeight: st ? CS(st, 'lineHeight') : null,
      statusColor: st ? CS(st, 'color') : null,
      statusWrap: st ? CS(st, 'overflowWrap') : null,
      statusBoxW: st ? P(R(st).width) : null, statusBoxH: st ? P(R(st).height) : null,
      statusTop: st ? P(R(st).top - rp.top) : null, statusBottom: st ? P(R(st).bottom - rp.top) : null,
      statusInkLeft: sInk && sInk.left !== null ? P(sInk.left - rc.left) : null,
      statusInkCenter: sInk && sInk.left !== null ? P((sInk.left + sInk.right) / 2 - rc.left) : null,
      btnText: txt(btn), btnDisabled: btn ? btn.disabled : null, btnTag: btn ? btn.tagName : null,
      btnType: btn ? btn.getAttribute('type') : null, btnCls: btn ? btn.className : null,
      btnTop: P(bt.top - rp.top), btnBottom: P(bt.bottom - rp.top),
      btnW: P(bt.width), btnH: P(bt.height),
      btnEdgeLeft: P(bt.left - rc.left), btnCenter: P((bt.left + bt.right) / 2 - rc.left),
      btnInkLeft: bInk && bInk.left !== null ? P(bInk.left - rc.left) : null,
      btnFontSize: btn ? CS(btn, 'fontSize') : null,
      repoText: txt(repoa), repoTag: repoa ? repoa.tagName : null, repoHref: repoa ? repoa.getAttribute('href') : null,
      repoIsLastInCol: !!(repoa && repoa.closest('[data-test=repowrap]') === col.lastElementChild),
      repoBottomFromBlock: repoa ? P(rp.bottom - R(repoWrap).bottom) : null,
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

function alignRow(b) {
  return {
    align: b.align, edge: b.btnEdgeLeft, ink: b.btnInkLeft, sink: b.statusInkLeft,
    dInk: Math.round((b.btnInkLeft - b.statusInkLeft) * 100) / 100,
    dEdge: Math.round((b.btnEdgeLeft - b.statusInkLeft) * 100) / 100,
    center: b.btnCenter, centerDelta: Math.round((b.btnCenter - b.colW / 2) * 100) / 100,
    inkCenterDelta: Math.round((b.btnCenter - b.statusInkCenter) * 100) / 100,
    colW: b.colW,
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

    /* ── 默认态 ── */
    const g = await evalJson(PAGE_PROBE);
    say('  · 探针 A 完成');

    ok(g.vw === vp.w, tag + ' innerWidth ＝ ' + vp.w + '（实测 ' + g.vw + '）');
    ok(g.vh === vp.h, tag + ' innerHeight ＝ ' + vp.h + '（实测 ' + g.vh + '）');
    ok(g.docW === vp.w, tag + ' documentElement.scrollWidth ＝ ' + vp.w + '（实测 ' + g.docW + '）');
    ok(g.bodyW === vp.w, tag + ' body.scrollWidth ＝ ' + vp.w + '（实测 ' + g.bodyW + '）');
    ok(g.vvW === vp.w, tag + ' visualViewport.width ＝ ' + vp.w + '（实测 ' + g.vvW + '，防 shrink-to-fit）');
    ok(g.ready === '1', tag + ' 页面自报 ready');
    ok(g.mode === 'all' && g.docState === 'all', tag + ' 默认模式＝全部并列（实测 ' + g.mode + '）');
    ok(g.params.deduct === '24' && g.params.pct === '88' && g.params.floor === '320' && g.params.cap === 'viewport',
      tag + ' 页面上写明宽度参数（24／88／320／上界＝视口）');
    ok(!!g.api && g.api.deduct === 24 && g.api.pct === 88 && g.api.floor === 320 && g.api.cap === 'viewport', tag + ' 页面侧公式参数＝脚本期望');
    ok(g.details === 0, tag + ' 页面没有 <details>/<summary>（可点元素限定为 a／button）');
    ok(g.controls.statePanelInShot === false && g.controls.statePanelInPg === false, tag + ' 状态查看器在**截图范围之外**、不在块内');
    ok(g.controls.imgbanInShot === true, tag + ' 「原型说明」横幅在**截图范围之内**（图里能看到它）');
    ok(g.controls.imgbanInPg === false, tag + ' 「原型说明」横幅**不在**应用页面的块里');
    ok(/不属于应用页面/.test(g.controls.imgbanText || ''), tag + ' 横幅逐字写明「不属于应用页面」');
    ok(g.controls.btnCount === ALLS.length + 1, tag + ' 状态查看器按钮数 ＝ ' + (ALLS.length + 1) + '（六态＋「全部并列」；实测 ' + g.controls.btnCount + '）');
    ok(JSON.stringify(g.controls.modes) === JSON.stringify(['all'].concat(ALLS.map((s) => s.key))), tag + ' 查看器按钮的 mode 顺序＝脚本期望（实测 ' + JSON.stringify(g.controls.modes) + '）');
    ok(JSON.stringify(g.controls.pressed) === JSON.stringify(['all']), tag + ' 默认按下的是「全部并列」（实测 ' + JSON.stringify(g.controls.pressed) + '）');
    ok(g.shotCount === 1, tag + ' 截图区个数＝1（实测 ' + g.shotCount + '）');
    g.shots.forEach((s2) => ok(s2.left === 0 && s2.w === vp.w, tag + ' 截图区 ' + s2.id + ' 左沿 0、宽＝视口宽（实测 ' + s2.left + '／' + s2.w + '）'));
    ok(g.over.length === 0, tag + ' 默认态无横向溢出（越界元素 ' + g.over.length + ' 个：' + JSON.stringify(g.over.slice(0, 4)) + '）');
    ok(g.headsOutsidePg === true, tag + ' 每格上方的标题行与数字行都在块外（不属于应用页面）');

    const badReq = [...new Set(state.requests)].filter((u) => !u.startsWith('file://'));
    ok(badReq.length === 0, tag + ' 没有外部请求（非 file:// 的 ' + badReq.length + ' 个：' + badReq.slice(0, 3).join(',') + '）');
    const badCtl = g.ctls.filter((c) => !((c.tag === 'A' && c.href) || (c.tag === 'BUTTON' && c.type === 'button')));
    ok(badCtl.length === 0, tag + ' 可点元素只有 <a href> 与 <button type=button>（违规 ' + badCtl.length + ' 个：' + JSON.stringify(badCtl.slice(0, 4)) + '）');
    ok(g.ctls.filter((c) => c.inStatePanel).length === ALLS.length + 1, tag + ' 查看器按钮都在说明区（' + g.ctls.filter((c) => c.inStatePanel).length + ' 个）');

    /* ── 公式复算 ── */
    const A = vp.w - 24, raw = 0.88 * A;
    const C = Math.min(vp.w, Math.max(320, raw));
    ok(C <= vp.w, tag + ' C ≤ V（上界＝视口 V）');
    if (vp.w === 320) ok(C === 320 && C > A, tag + ' V=320 时 C=320 > A=296（证明 24 是扣除总量，不是左右各 12）');
    if (vp.w === 1180) ok(C > 860, tag + ' V=1180 时 C=' + C + ' > 860（证明没有夹 860 上限）');
    near(g.api.cw, C, 0.02, tag + ' 页面侧算出的 C ＝ 脚本复算值');

    /* ── 块清单 ── */
    const visA = g.blocks.filter((b) => b.visible && !b.inQ);
    const visQ = g.blocks.filter((b) => b.visible && b.inQ);
    const vis = g.blocks.filter((b) => b.visible);
    ok(g.blocks.length === ALLS.length + ALIGNS.length, tag + ' 块数 ＝ ' + (ALLS.length + ALIGNS.length) + '（A 组六态 ＋ B 组三档；实测 ' + g.blocks.length + '）');
    ok(visA.length === IN_IMAGE.length, tag + ' 默认态 A 组只显示图上的 ' + IN_IMAGE.length + ' 格（实测 ' + visA.length + '：' + visA.map((b) => b.state).join(',') + '）');
    ok(visA.map((b) => b.state).join(',') === IN_IMAGE.join(','), tag + ' A 组默认显示的就是 初态／已是最新／最长失败（实测 ' + visA.map((b) => b.state).join(',') + '）');
    ok(visQ.length === ALIGNS.length, tag + ' 默认态 B 组三档都可见（实测 ' + visQ.length + '）');

    /* ── 每块：几何 ＋ 固定项 ＋ 去框 ＋ 父级 ＋ 间距 ── */
    const byId = {};
    g.blocks.forEach((b) => { byId[b.id + '|' + b.align] = b; });
    vis.forEach((b) => {
      const st = ST_BY_KEY[b.state];
      const hasLabel = st.text !== null;
      ok(b.left === 0, tag + ' ' + b.id + '(' + b.align + ') 块左沿 0（实测 ' + b.left + '）');
      ok(b.w === vp.w, tag + ' ' + b.id + '(' + b.align + ') 块宽恰＝视口宽 ' + vp.w + '（实测 ' + b.w + '）');
      near(b.colW, C, 0.02, tag + ' ' + b.id + '(' + b.align + ') 内容列宽＝公式复算 ' + C + '（实测 ' + b.colW + '）');
      near(b.colLeft, (vp.w - C) / 2, 0.02, tag + ' ' + b.id + ' 列外余白＝(V−C)/2（实测 ' + b.colLeft + '）');
      near(b.edge, 16.8, 0.05, tag + ' ' + b.id + ' 行内沿 1.05rem＝16.8px（列内那一层）');
      ok(b.shadows === 0, tag + ' ' + b.id + ' 块内没有 box-shadow（' + b.shadows + '）');
      ok(b.anims === 0, tag + ' ' + b.id + ' 块内没有 animation（' + b.anims + '）');
      ok(b.brandText === APPNAME, tag + ' ' + b.id + ' 应用名＝' + APPNAME + '（实测 ' + JSON.stringify(b.brandText) + '）');
      ok(!!b.verPairText && b.verPairText.indexOf(APPVER) >= 0 && b.verPairText.indexOf(CONTENTVER) >= 0,
        tag + ' ' + b.id + ' 版本相邻组含应用版本与内容版本（实测 ' + JSON.stringify(b.verPairText) + '）');
      ok(!/来源|已下载|内置/.test(b.verPairText || ''), tag + ' ' + b.id + ' 版本相邻组里没有「来源」等字样');
      ok(b.kvRows === 2, tag + ' ' + b.id + ' 版本相邻组恰两行（实测 ' + b.kvRows + '）');
      near(b.kRightSpread, 0, 0.6, tag + ' ' + b.id + ' label 右沿同一条竖线');
      near(b.vLeftSpread, 0, 0.6, tag + ' ' + b.id + ' 值左沿同一条竖线');
      ok(b.gapVerToBtn > 0 && b.repoBottomFromBlock >= 0, tag + ' ' + b.id + ' 按钮夹在版本相邻组与仓库链接之间（版本组→按钮 ' + b.gapVerToBtn + '）');
      ok(b.repoText === REPO && b.repoTag === 'A' && b.repoHref === REPO, tag + ' ' + b.id + ' 仓库链接＝完整 URL 的 <a>（实测 ' + JSON.stringify(b.repoText) + '）');
      ok(b.hintCount === 0, tag + ' ' + b.id + ' 没有「在浏览器打开」提示（C1 口径）');
      ok(b.repoIsLastInCol, tag + ' ' + b.id + ' 仓库链接是内容列的最后一条');
      ok(!/笔记|测试笔记|假笔记/.test(b.text), tag + ' ' + b.id + ' 块内没有笔记夹具');
      ok(b.hasRunmark === false, tag + ' ' + b.id + ' 块内没有原型小标（原型标注都在块外）');
      ok(JSON.stringify(b.shape) === JSON.stringify(hasLabel ? SHAPE_WITH_LABEL : SHAPE_NO_LABEL),
        tag + ' ' + b.id + ' 块内元素形态＝脚本期望（' + (hasLabel ? '有' : '无') + ' label；实测 ' + JSON.stringify(b.shape) + '）');
      /* ① 去框：逐项计算值 */
      ok(b.scan.borderEls.length === 0, tag + ' ' + b.id + ' 产品区**没有边框**（实测 ' + JSON.stringify(b.scan.borderEls) + '）');
      ok(b.scan.bgEls.length === 0, tag + ' ' + b.id + ' 产品区**没有底色**（实测 ' + JSON.stringify(b.scan.bgEls) + '）');
      ok(b.scan.shadowEls.length === 0, tag + ' ' + b.id + ' 产品区**没有阴影**（实测 ' + JSON.stringify(b.scan.shadowEls) + '）');
      ok(b.scan.radiusEls.length === 0, tag + ' ' + b.id + ' 产品区**没有圆角容器/卡片**（实测 ' + JSON.stringify(b.scan.radiusEls) + '）');
      ok(b.scan.headings.length === 0, tag + ' ' + b.id + ' 产品区**没有标题元素**（实测 ' + JSON.stringify(b.scan.headings) + '）');
      ok(b.scan.hrs.length === 0, tag + ' ' + b.id + ' 产品区**没有 <hr>**（实测 ' + JSON.stringify(b.scan.hrs) + '）');
      ok(b.scan.dividerEls.length === 0, tag + ' ' + b.id + ' 产品区**没有上下分隔线**（实测 ' + JSON.stringify(b.scan.dividerEls) + '）');
      ok(b.scan.sourceRows === 0, tag + ' ' + b.id + ' 产品区里没有「来源」元素（实测 ' + b.scan.sourceRows + '）');
      ok(b.colStyle.borderTop === '0px' && b.colStyle.borderRight === '0px' && b.colStyle.borderBottom === '0px' && b.colStyle.borderLeft === '0px'
        && b.colStyle.bg === 'rgba(0, 0, 0, 0)' && b.colStyle.shadow === 'none' && b.colStyle.radius === '0px',
        tag + ' ' + b.id + ' 内容列自身：border ' + [b.colStyle.borderTop, b.colStyle.borderRight, b.colStyle.borderBottom, b.colStyle.borderLeft].join('/')
        + '／底色 ' + b.colStyle.bg + '／阴影 ' + b.colStyle.shadow + '／圆角 ' + b.colStyle.radius);
      ok(parseFloat(b.btnOwn.borderW) > 0 && parseFloat(b.btnOwn.radius) > 0 && b.btnOwn.shadow === 'none'
        && (b.btnDisabled ? b.btnOwn.bg === 'rgba(0, 0, 0, 0)' : b.btnOwn.bg !== 'rgba(0, 0, 0, 0)'),
        tag + ' ' + b.id + ' **按钮自身的边界照旧可识别**（' + (b.btnDisabled ? '禁用态：底色透明但边框仍在 ' : '底色 ') + b.btnOwn.bg
        + '，边框 ' + b.btnOwn.borderW + '，圆角 ' + b.btnOwn.radius + '，阴影 ' + b.btnOwn.shadow + '）');
      /* ② 父级＝内容流 */
      ok(b.btnParentIsCol && (b.statusExists ? b.statusParentIsCol === true && b.sameParent : true),
        tag + ' ' + b.id + ' 按钮' + (b.statusExists ? '与状态文本' : '') + '的父级＝内容列 .col（不是任何 panel/card 容器）');
      ok(JSON.stringify(b.colKids) === JSON.stringify(hasLabel ? COLKIDS_WITH_LABEL : COLKIDS_NO_LABEL),
        tag + ' ' + b.id + ' 内容列的**直接子元素**＝' + (hasLabel ? '五' : '四') + '个（实测 ' + JSON.stringify(b.colKids) + '）');
      near(b.colPadL, 0, 0.01, tag + ' ' + b.id + ' 内容列自身没有左侧内边距（' + b.colPadL + '）');
      near(b.colPadR, 0, 0.01, tag + ' ' + b.id + ' 内容列自身没有右侧内边距（' + b.colPadR + '）');
      /* 间距 */
      near(b.gapVerToBtn, 14.4, 0.05, tag + ' ' + b.id + ' 版本相邻组 → 按钮 的间距＝0.9rem＝14.4px');
      if (hasLabel) {
        near(b.gapBtnToStatus, 8, 0.05, tag + ' ' + b.id + ' 按钮 → 状态文本 的间距＝0.5rem＝8px');
        near(b.gapStatusToRepo, 14.4, 0.05, tag + ' ' + b.id + ' 状态文本 → 仓库链接 的间距＝0.9rem＝14.4px');
      } else {
        near(b.gapBtnToRepo, 14.4, 0.05, tag + ' ' + b.id + ' 初态：按钮 → 仓库链接 的间距＝0.9rem 节间距（缺席的 label 没留下空位）');
        ok(b.nextAfterBtn === 'DIV|repowrap', tag + ' ' + b.id + ' 初态：按钮的下一个元素就是仓库链接（实测 ' + b.nextAfterBtn + '）');
      }
      /* 按钮／文本顺序 */
      ok(b.btnTop > 0, tag + ' ' + b.id + ' 按钮是这一处文档流里的第一个元素（距块顶 ' + b.btnTop + '）');
      if (hasLabel) ok(b.btnBottom <= b.statusTop + 0.5, tag + ' ' + b.id + ' 状态文本紧跟在按钮**下方**（按钮底 ' + b.btnBottom + '，文本顶 ' + b.statusTop + '）');
      ok(b.btnW > 40 && b.btnW < b.colW, tag + ' ' + b.id + ' 按钮不是满宽条（宽 ' + b.btnW + ' < 列宽 ' + b.colW + '）');
      ok(b.ctlCount === 2, tag + ' ' + b.id + ' 块内可点元素数＝2（仓库链接＋唯一按钮；实测 ' + b.ctlCount + '）');
      /* 文案 */
      if (hasLabel) {
        ok(b.statusText === st.text, tag + ' ' + b.id + ' 状态文案逐字（实测 ' + JSON.stringify(b.statusText) + '）');
        ok(b.statusWrap === 'anywhere', tag + ' ' + b.id + ' 状态文本 overflow-wrap=' + b.statusWrap);
      }
      ok(b.btnText === BUTTON, tag + ' ' + b.id + ' 按钮文字＝' + JSON.stringify(BUTTON) + '（实测 ' + JSON.stringify(b.btnText) + '）');
      ok(b.btnTag === 'BUTTON' && b.btnType === 'button', tag + ' ' + b.id + ' 按钮是 <button type=button>');
      ok(b.btnDisabled === !st.enabled, tag + ' ' + b.id + ' 按钮禁用＝' + (!st.enabled) + '（实测 ' + b.btnDisabled + '）');
    });

    /* ══ [A] 初态只有按钮 ══ */
    {
      const idle = visA.filter((b) => b.state === 'idle')[0];
      const up = visA.filter((b) => b.state === 'uptodate')[0];
      ok(!!idle, tag + ' 初态那一格在默认视图里');
      if (idle && up) {
        ok(idle.statusExists === false, tag + ' **初态：`[data-test=status]` 根本不存在**（存在性断言；实测 ' + idle.statusExists + '）');
        ok(idle.statusVisible === false, tag + ' **初态：状态文本不可见**（可见性断言；实测 ' + idle.statusVisible + '）');
        ok(idle.statusText === null && idle.statusBoxW === null, tag + ' 初态：没有状态文本元素（statusText=' + JSON.stringify(idle.statusText) + '）');
        ok(JSON.stringify(idle.colKids) === JSON.stringify(COLKIDS_NO_LABEL), tag + ' 初态：内容列直接子元素只有 4 个（没有空的说明位；实测 ' + JSON.stringify(idle.colKids) + '）');
        ok(idle.h < up.h, tag + ' 初态块高 ' + idle.h + ' < 有 label 的块高 ' + up.h);
        near(idle.h, up.h - (up.statusBoxH + 8), 0.15,
          tag + ' **初态块高 ＝ 已是最新块高 −（状态文本高 ' + up.statusBoxH + ' ＋ 8px 缝）** —— 缺席的 label 没有留下被占掉的空位');
        ok(up.statusExists === true && up.statusVisible === true, tag + ' 有结果的那一格：状态文本存在且可见（' + up.statusExists + '/' + up.statusVisible + '）');
        say('  ' + tag + ' 初态实测：块高 ' + idle.h + '（有 label 的「已是最新」块高 ' + up.h + '，差 ' + Math.round((up.h - idle.h) * 100) / 100
          + ' ＝ 状态文本高 ' + up.statusBoxH + ' ＋ 缝 8）｜初态里 [data-test=status] 元素数 ' + (idle.statusExists ? 1 : 0)
          + '｜按钮→仓库 ' + idle.gapBtnToRepo + 'px');
      }
      visA.filter((b) => b.state !== 'idle').forEach((b) => {
        ok(b.statusExists === true && b.statusVisible === true, tag + ' ' + b.id + '：有结果时状态文本存在且可见（' + b.statusExists + '/' + b.statusVisible + '）');
      });
    }

    /* ── 五种真实状态 ＋ 夹具：页面侧定义 vs 脚本独立期望（逐字） ── */
    ok(JSON.stringify(g.api.stateKeys) === JSON.stringify(ALLS.map((s) => s.key)), tag + ' 页面侧状态清单＝脚本期望（实测 ' + JSON.stringify(g.api.stateKeys) + '）');
    ALLS.forEach((s) => {
      ok(g.api.showsLabel[s.key] === (s.text !== null), tag + ' 页面侧「有 label」：' + s.key + '＝' + (s.text !== null));
      if (s.text !== null) ok(g.api.text[s.key] === s.text, tag + ' 页面侧文案定义逐字：' + s.key + '（实测 ' + JSON.stringify(g.api.text[s.key]) + '）');
      else ok(g.api.text[s.key] === null, tag + ' 页面侧「' + s.key + '」的文案＝null（不生成 label）');
      ok(g.api.labels[s.key] === s.label, tag + ' 页面侧状态标签逐字：' + s.key);
      ok(g.api.btnEnabled[s.key] === s.enabled, tag + ' 页面侧按钮可用性：' + s.key + '＝' + s.enabled);
    });
    ok(g.api.buttonLabel === BUTTON, tag + ' 页面侧唯一的动作文字＝' + JSON.stringify(BUTTON));
    ok(g.api.fixtureText === FIXTURE.text, tag + ' 夹具文案逐字＝脚本期望');
    ok(g.api.app.repo === REPO && g.api.app.appVersion === APPVER && g.api.app.contentVersion === CONTENTVER && g.api.app.name === APPNAME,
      tag + ' 页面侧的当前值（应用名／版本／仓库）＝脚本期望');
    /* 「同一形态」：有 label 的格子样式必须一致 */
    {
      const withLabel = g.blocks.filter((b) => ST_BY_KEY[b.state].text !== null);
      const shapes = new Set(withLabel.map((b) => JSON.stringify(b.shape)));
      ok(shapes.size === 1, tag + ' 有 label 的格子结构完全相同（实测 ' + shapes.size + ' 种）');
      const colors = new Set(withLabel.map((b) => b.statusColor));
      ok(colors.size === 1, tag + ' 有 label 的格子状态文本**颜色完全相同**（用户原话「同一形态，只换文本」；实测 ' + colors.size + ' 种）');
      const fonts = new Set(withLabel.map((b) => b.statusFontSize + '|' + b.statusLineHeight));
      ok(fonts.size === 1, tag + ' 有 label 的格子状态文本字号／行高完全相同（实测 ' + [...fonts].join('／') + '）');
      const kids = new Set(withLabel.map((b) => JSON.stringify(b.colKids)));
      ok(kids.size === 1, tag + ' 有 label 的格子内容列子元素序列完全相同（实测 ' + [...kids].join('／') + '）');
    }
    Object.keys(g.fonts || {}).forEach((k) => { (fontProfile[k] = fontProfile[k] || new Set()).add(g.fonts[k]); });

    say('  ' + tag + ' 截图区高度：' + g.shots.map((s2) => s2.id + ' ' + s2.h + ' CSS px ⇒ ' + s2.px2 + ' 像素高'
      + (s2.px2 > SHOT_MAX_PX ? '（超上限 ' + SHOT_MAX_PX + ' ⇒ 这张图**拍不到**，脚本如实拒绝落盘）' : '（在 Chromium 截图上限内）')).join('；'));

    /* ══ [Q] 对齐三档（并列，不排序、不写推荐）══ */
    {
      const rows = {};
      ALIGNS.forEach((ak) => {
        const b = visQ.filter((x) => x.align === ak)[0];
        ok(!!b, tag + ' B 组里有对齐档 ' + ak);
        if (!b) return;
        ok(b.state === 'uptodate', tag + ' ' + ak + ' 那一格状态是「已是最新」（实测 ' + b.state + '）');
        rows[ak] = alignRow(b);
      });
      const r1 = rows.A1, r2 = rows.A2, r3 = rows.A3;
      if (r1 && r2 && r3) {
        near(r1.edge, 16.8, 0.05, tag + ' A1 按钮外沿＝行内沿 16.8px');
        near(r1.dInk, 12.2, 0.1, tag + ' A1 按钮文字比状态文本**偏右** ' + r1.dInk + 'px（＝按钮的 ' + BTN_BORDER + 'px 边框 ＋ ' + BTN_PAD_X + 'px 内边距）—— 这就是「错位」的来源');
        near(r2.dInk, 0, 0.05, tag + ' A2 按钮文字与状态文本**对齐**（文字差 ' + r2.dInk + 'px）');
        near(r2.edge, 16.8 - BTN_BORDER - BTN_PAD_X, 0.1, tag + ' A2 此时按钮外沿退到 ' + r2.edge + 'px（＝16.8 − ' + (BTN_BORDER + BTN_PAD_X) + '）');
        near(r3.centerDelta, 0, 0.05, tag + ' A3 按钮块中心 ＝ 内容列中心（差 ' + r3.centerDelta + 'px ⇒ 也＝状态文本的**盒**中心）');
        ok(Math.abs(r3.inkCenterDelta) >= 0.5, tag + ' A3 与状态文本的**墨迹**中心仍差 ' + r3.inkCenterDelta + 'px（≥0.5px ⇒ 左对齐文本的墨迹中心 ≠ 盒中心，如实报出来）');
        const edges = [r1.edge, r2.edge, r3.edge];
        ok(new Set(edges).size === 3, tag + ' 三档的按钮外沿互不相同（实测 ' + edges.join(' ／ ') + '）⇒ 它们是三档不同的做法');
        /* 页面自己量的那一份 vs 脚本独立量的那一份 */
        ALIGNS.forEach((ak) => {
          const pa = g.api.alignMeasured && g.api.alignMeasured[ak];
          ok(!!pa, tag + ' 页面侧导出了 ' + ak + ' 的实测数字');
          if (pa) {
            near(pa.edge, rows[ak].edge, 0.05, tag + ' ' + ak + ' 页面侧量的按钮外沿 ＝ 脚本独立量的一致');
            near(pa.ink, rows[ak].ink, 0.05, tag + ' ' + ak + ' 页面侧量的按钮文字墨迹 ＝ 脚本独立量的一致');
            near(pa.sink, rows[ak].sink, 0.05, tag + ' ' + ak + ' 页面侧量的状态文本墨迹 ＝ 脚本独立量的一致');
          }
        });
        say('  ' + tag + ' 对齐三档实测（相对内容列左沿，px）：');
        say('      档 ｜ 按钮外沿 ｜ 按钮文字墨迹 ｜ 状态文本墨迹 ｜ 文字差(按钮−状态) ｜ 外沿差 ｜ 按钮块中心 ｜ 中心差(对列中心) ｜ 与状态墨迹中心差');
        ALIGNS.forEach((ak) => {
          const r = rows[ak];
          say('      ' + r.align + ' ｜ ' + r.edge + ' ｜ ' + r.ink + ' ｜ ' + r.sink + ' ｜ ' + (r.dInk > 0 ? '+' : '') + r.dInk + ' ｜ '
            + (r.dEdge > 0 ? '+' : '') + r.dEdge + ' ｜ ' + r.center + ' ｜ ' + (r.centerDelta > 0 ? '+' : '') + r.centerDelta + ' ｜ ' + (r.inkCenterDelta > 0 ? '+' : '') + r.inkCenterDelta);
        });
        say('      换算：A1 文字差 +' + r1.dInk + 'px；A2 文字差 ' + r2.dInk + 'px；A3 中心差 ' + r3.centerDelta + 'px（本页**不选**哪一档）');
      }
    }

    /* ── [M] 单态模式：真鼠标点查看器 ── */
    say('  · 单态模式（点状态查看器）');
    for (const s of ALLS) {
      const c = await clickSel(send, evalJson, '[data-test=state-btn][data-mode=' + s.key + ']');
      ok(c.inView, tag + ' 查看器按钮「' + s.label + '」点之前在视口内');
      const m = await evalJson(PAGE_PROBE);
      ok(m.mode === s.key, tag + ' 点「' + s.label + '」后 mode＝' + s.key + '（实测 ' + m.mode + '）');
      const mvA = m.blocks.filter((b) => b.visible && !b.inQ);
      const mvQ = m.blocks.filter((b) => b.visible && b.inQ);
      ok(mvA.length === 1 && mvA[0].id === 'B-' + s.key, tag + ' 单态模式下 A 组只剩 ' + s.key + '（实测 ' + mvA.map((b) => b.id).join(',') + '）');
      ok(mvQ.length === ALIGNS.length, tag + ' 单态模式下 B 组三档照旧（实测 ' + mvQ.length + '）');
      ok(m.over.length === 0, tag + ' 单态 ' + s.key + '：无横向溢出（越界 ' + m.over.length + ' 个）');
      ok(m.docW === vp.w && m.bodyW === vp.w && m.vvW === vp.w, tag + ' 单态 ' + s.key + '：docW／bodyW／visualViewport 仍＝视口宽');
      if (mvA.length === 1) {
        const b = mvA[0];
        ok(b.left === 0 && b.w === vp.w, tag + ' 单态 ' + s.key + '：那块仍恰＝视口宽、左沿 0（' + b.w + '）');
        near(b.colW, C, 0.02, tag + ' 单态 ' + s.key + '：内容列宽仍＝公式值');
        ok(b.btnDisabled === !s.enabled, tag + ' 单态 ' + s.key + '：按钮禁用＝' + (!s.enabled) + '（实测 ' + b.btnDisabled + '）');
        if (s.text === null) {
          ok(b.statusExists === false && b.statusVisible === false, tag + ' 单态 ' + s.key + '：**label 不存在也不可见**（' + b.statusExists + '/' + b.statusVisible + '）');
          ok(JSON.stringify(b.colKids) === JSON.stringify(COLKIDS_NO_LABEL), tag + ' 单态 ' + s.key + '：内容列直接子元素＝4 个（无占位）');
          say('  ' + tag + ' 单态 ' + s.key + '：块高 ' + b.h + '｜[data-test=status] 存在? ' + b.statusExists + '｜可见? ' + b.statusVisible
            + '｜块内可点元素 ' + b.ctlCount + '｜按钮→仓库 ' + b.gapBtnToRepo + 'px');
        } else {
          ok(b.statusExists === true && b.statusVisible === true, tag + ' 单态 ' + s.key + '：label 存在且可见');
          ok(b.statusText === s.text, tag + ' 单态 ' + s.key + '：状态文案逐字（实测 ' + JSON.stringify(b.statusText) + '）');
          say('  ' + tag + ' 单态 ' + s.key + '：块高 ' + b.h + '｜这一处高 ' + b.areaH + '｜状态文本 ' + b.statusLines + ' 行（最长行墨宽 ' + b.statusW
            + '，可用 ' + b.statusBoxW + '）｜按钮禁用 ' + b.btnDisabled + '｜按钮外沿 ' + b.btnEdgeLeft + '／文字墨迹 ' + b.btnInkLeft + '／状态墨迹 ' + b.statusInkLeft);
        }
        if (s.key === 'checking') {
          ok(b.btnDisabled === true, tag + ' **检查中 ⇒ 唯一按钮 disabled**（实测 ' + b.btnDisabled + '）');
          ok((b.btnCls || '').indexOf('ctl') >= 0, tag + ' 检查中的按钮仍是同一个按钮元素（class=' + b.btnCls + '）');
        }
        if (s.key === 'failed-long') {
          ok(b.statusText.indexOf('⟨') >= 0, tag + ' 夹具文案里保留了运行时占位 ⟨…⟩');
          ok(!/[0-9a-f]{64}/.test(b.statusText), tag + ' 夹具文案里**没有写死** 64 位哈希（两个哈希都是占位）');
          near(b.statusBoxW, C - 2 * 16.8, 0.02, tag + ' 夹具态：状态文本可用宽＝C − 2×16.8（行内沿）');
          ok(b.statusW <= b.statusBoxW, tag + ' 夹具态：最长行墨宽 ' + b.statusW + ' ≤ 状态文本可用宽 ' + b.statusBoxW);
          say('  ' + tag + ' 夹具态：最长失败文案 ' + b.statusLines + ' 行，最长行墨宽 ' + b.statusW + '，可用宽 ' + b.statusBoxW + '，块高 ' + b.h
            + '，按钮外沿 ' + b.btnEdgeLeft + '／文字墨迹 ' + b.btnInkLeft + '／状态墨迹 ' + b.statusInkLeft);
        }
      }
    }
    /* 回「全部并列」 */
    {
      const c = await clickSel(send, evalJson, '[data-test=state-btn][data-mode=all]');
      ok(c.inView, tag + ' 「全部并列」按钮点之前在视口内');
      const m = await evalJson(PAGE_PROBE);
      ok(m.mode === 'all' && m.blocks.filter((b) => b.visible && !b.inQ).length === IN_IMAGE.length, tag + ' 点回「全部并列」⇒ A 组回到三格');
      ok(m.over.length === 0, tag + ' 回到并列后无横向溢出（越界 ' + m.over.length + ' 个）');
    }

    /* ── [P] PNG ── */
    if (!NO_SHOT && SHOT_SET.has(vp.w)) {
      await send('Runtime.evaluate', { expression: 'window.scrollTo(0,0); 1', returnByValue: true });
      await sleep(150);
      const shotNow = await evalJson(PAGE_PROBE);
      for (const s2 of shotNow.shots) {
        if (s2.px2 > SHOT_MAX_PX) {
          say('  ' + tag + ' 如实拒绝：截图区 ' + s2.id + ' 的实测像素高 ' + s2.px2 + ' > Chromium 截图上限 ' + SHOT_MAX_PX
            + ' ⇒ 这张图**不落盘**（要的是拆图或如实说明，不许假装拍到）。页面本身不受影响，在浏览器里打开即可。');
          ok(false, tag + ' 截图区 ' + s2.id + ' 像素高 ' + s2.px2 + ' 超上限 ' + SHOT_MAX_PX + ' ⇒ 交付图拍不出来（如实报失败，不假装）');
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
      say('  ' + tag + ' 行为已查（默认态／六个单态各一次）；这个视口的图默认不落盘（要它加 --all-shots）');
    }

    ok(state.errors.length === 0, tag + ' 没有 JS 报错（' + state.errors.join(' | ') + '）');

    /* ── 收几何表（只在 430 那一轮收，且只在默认态）── */
    if (vp.w === TABLE_V && !TABLE.length) {
      const g2 = await evalJson(PAGE_PROBE);
      g2.blocks.filter((b) => b.visible).forEach((b) => {
        const al = alignRow(b);
        TABLE.push({
          id: b.id, state: b.state, align: b.align, inQ: b.inQ, V: vp.w, block: b.w + '×' + b.h, C: b.colW,
          areaH: b.areaH, gapVer: b.gapVerToBtn, gapBtnToStatus: b.gapBtnToStatus, gapStatusToRepo: b.gapStatusToRepo, gapBtnToRepo: b.gapBtnToRepo,
          statusExists: b.statusExists, statusVisible: b.statusVisible,
          statusText: b.statusText, statusLines: b.statusLines, statusW: b.statusW, statusBoxW: b.statusBoxW,
          btn: b.btnText, btnDisabled: b.btnDisabled, btnW: b.btnW, btnH: b.btnH, btnTop: b.btnTop, statusBoxH: b.statusBoxH,
          borderEls: b.scan.borderEls.length, bgEls: b.scan.bgEls.length, shadowEls: b.scan.shadowEls.length, radiusEls: b.scan.radiusEls.length,
          headings: b.scan.headings.length, hrs: b.scan.hrs.length, divs: b.scan.dividerEls.length,
          al,
        });
      });
    }

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

/* —— 每块实测几何表（给 q-about-min.md 与报告用；只打印，不断言）—— */
say('');
say('── 每块实测几何（视口 ' + (TABLE.length ? TABLE[0].V : '?') + '；默认态）──');
if (TABLE.length) {
  say('| 块 | 状态 | 对齐 | 组 | 块宽×高 | 这一处高 | C | label 存在/可见 | 状态文案 | 行数 | 最长行宽 | 按钮(距块顶／高／宽) | 去框扫描(框/底/影/圆/标/hr/线) |');
  say('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  TABLE.forEach((t) => {
    say('| ' + t.id + ' | ' + t.state + ' | ' + t.align + ' | ' + (t.inQ ? 'B' : 'A') + ' | ' + t.block + ' | ' + t.areaH + ' | ' + t.C
      + ' | ' + (t.statusExists ? '有' : '**无**') + '/' + (t.statusVisible ? '可见' : '**不可见**')
      + ' | ' + (t.statusText === null ? '（无）' : '"' + t.statusText + '"') + ' | ' + (t.statusLines === null ? '—' : t.statusLines)
      + ' | ' + (t.statusW === null ? '—' : t.statusW)
      + ' | ' + t.btn + (t.btnDisabled ? '(禁用)' : '') + '（' + t.btnTop + '／' + t.btnH + '／' + t.btnW + '）'
      + ' | ' + [t.borderEls, t.bgEls, t.shadowEls, t.radiusEls, t.headings, t.hrs, t.divs].join('/') + ' |');
  });
  say('');
  const wit = TABLE.filter((t) => t.gapBtnToStatus !== null)[0];
  say('间距（430）：版本组→按钮 ' + TABLE[0].gapVer + '｜按钮→状态文本 ' + (wit ? wit.gapBtnToStatus : '?') + '｜状态文本→仓库 ' + (wit ? wit.gapStatusToRepo : '?') + '（初态那一格：按钮→仓库 ' + TABLE[0].gapBtnToRepo + '）');
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
