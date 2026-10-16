#!/usr/bin/env node
/* 跨端「最小 Markdown 范围」的 **Web 半边对照测试**。
 *
 *   node web/tests/md-conformance.mjs
 *   CHROME_BIN=/path/to/chrome node web/tests/md-conformance.mjs
 *
 * ## 为什么有这个文件
 * `schema/markdown-subset.json` 是**跨端唯一的机器可读范围定义**（8 样 `constructs[].id` ＋
 * 越界码 `excluded[].code`）。Android 端早已钉住它（`android/app/src/test/java/dev/sopho/suofei/MarkdownTest.kt`：
 * `constructs[].id` 与 `Markdown.CONSTRUCT_IDS` 逐项比，并解析共用夹具 `tests/fixtures/contract/md-subset-legal.json`）。
 * Web 端此前**一条都没有**（`grep -rn "md-subset" web/` 只命中 render.js 的一句注释）⇒ 契约加/删一样构造时
 * **Android 报红、Web 静默不动**。这个文件就是 Web 的对照：**同一份契约、同一份夹具、同一套块序列期望**。
 *
 * ## 它断言什么（每条都有牙齿）
 * 1. **契约钉住**：从 `schema/markdown-subset.json` 读 `constructs[].id`，与「Web 渲染器**真的**能
 *    渲染出正确块的那几样」**双向**逐项比。**探针表（id → 输入 → 期望块）是证据，不是范围定义**：
 *    - 契约里有、探针表没有的构造 ⇒ 红（契约新增一样时 Web 必须表态，不许静默）；
 *    - 探针表里有、契约里没有的构造 ⇒ 红（契约删掉一样时 Web 也必须红，这条是**证伪**走的路径）；
 *    - 每样构造都要**真渲染一遍**并逐字等于期望块（只声明不渲染是恒真断言，这里不做）。
 *    - 探针还绑着契约自己的 `syntax` 文字（`contractSyntaxNeeds`）：契约把语法描述改掉而探针没跟着改 ⇒ 红。
 * 2. **共用夹具对照**：读 `tests/fixtures/contract/md-subset-legal.json` 的 `poems[0].notes`
 *    （**与 Android 读的是同一个文件**，脚本还会核对它就是契约 `fixtures.legalSample` 指的那一份），
 *    用 Web 渲染器渲染，断言块序列与 Android `MarkdownTest.legalFixture_parsesIntoTheExpectedBlocks`
 *    完全一致（同一套 8 个块），且段内换行是**同一段里的多行**、两个列表各 2 项。
 *    每个块的文字另与 Node 侧**独立算出的 oracle**（按行分类＋去标记）逐字比 ⇒ 不丢字、不加字。
 * 3. **行内**：`**粗体**` → `strong`；`*斜体*` → `em`；去掉标记后不丢字不加字；未闭合强调按字面。
 * 4. **闭集之外不加分支**：`excluded[].code` 每一条都有越界样本，喂进去后块类型**不新增**
 *    （表格/图片/链接/行内代码/围栏/`#`·`####`/脚注/行首 HTML/`* ` 列表一律落进段落、按字面显示），
 *    并断言渲染出的标签集合**不超出**契约里那 8 样所声明的标签（多一个 `<table>` 就红）。
 *    `MD_TASK_LIST` 是**有意的例外**（`- [ ]` 确实以 `- ` 开头）：这里如实记录它＝一个普通列表项、
 *    文字原样 `[ ] 待办`、**没有** checkbox 元素 —— 与 Android 的说明一致（那正是 `MD_TASK_LIST` 诊断存在的理由）。
 * 5. **块标记边界（判红）**：正反例固定在三方共用的 `tests/fixtures/contract/md-boundary.json`（规则见契约的 `boundary`），
 *    逐例断言三方言行一致：Web **真渲染**、Android 判据重写、编译器 `classifyLine`。
 *    （2026-10-16 之前这里只是「只打印不判红」的观察；那是可到达的分叉，现已收进共同定义。）
 *
 * ## 边界
 * 只读契约/夹具/渲染器，**不改任何生产文件**；只新建本文件（另有 gitignore 的 `web/tests/artifacts/` 证据文件）。
 * 浏览器＝与本仓 e2e 相同的**无头 Chromium ＋ CDP**（`CHROME_BIN`），端口取**系统空闲端口**（不写死，本仓踩过端口串台）。
 * 零第三方依赖（只用 node 自带的 fetch / WebSocket），不新增 npm 依赖，不碰设备（无 adb/模拟器）。
 *
 * ## 发现渲染器真的缺某一样时怎么办
 * **不改渲染器**（那是负责人另派的事）：如实报出来，并把那条断言写成**如实表达现状**（明确的差异记录），
 * 绝不为了让它变绿把断言写松。
 *
 * 证据产物：`web/tests/artifacts/md-conformance.json`（已 gitignore）。
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 编译器的逐行判据（`tools/lib/markdown.mjs`）—— **只读**，用来在报告里量出「编译器放不放行」。 */
let checkMarkdownLine = null;
let classifyLine = null;
try {
  ({ checkMarkdownLine, classifyLine } = await import(new URL('../../tools/lib/markdown.mjs', import.meta.url)));
} catch { /* 模块不在时只影响第 5 节的观察，不影响断言 */ }

const webRoot = fileURLToPath(new URL('..', import.meta.url));          // web/
const repoRoot = resolve(webRoot, '..');
const CONTRACT_PATH = resolve(repoRoot, 'schema', 'markdown-subset.json');
const FIXTURE_PATH = resolve(repoRoot, 'tests', 'fixtures', 'contract', 'md-subset-legal.json');
const BOUNDARY_PATH = resolve(repoRoot, 'tests', 'fixtures', 'contract', 'md-boundary.json');
const artifactsDir = resolve(webRoot, 'tests', 'artifacts');
const NODE = process.execPath;
// 2026-10-16：原来这里写死了本机的一条绝对路径（`C:/Users/<用户名>/...`）⇒ 公开仓库里那是**个人路径泄露**、
// 换台机器也没用 ⇒ 改为：① `CHROME_BIN` ② 常见安装位置 ③ 都没有就明确报错（不猜）。
const CHROME_BIN = process.env.CHROME_BIN
  || ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium',
    '/usr/bin/chromium-browser', 'C:/Program Files/Google/Chrome/Application/chrome.exe']
    .find((p) => existsSync(p))
  || null;

/** 取一个当前空闲的端口。**绝不写死**：并发跑同一套测试时会串台（本仓踩过）。 */
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

/** 起服务/起浏览器前先确认端口是空的：不静默复用别人的端口。 */
async function assertPortFree(port, what) {
  try {
    await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(2000) });
  } catch {
    return; // 连不上 = 空闲
  }
  throw new Error(`端口 ${port}（${what}）已被占用：可能是另一条会话在并发跑同一套测试。`
    + '本轮直接停下，不静默复用；可等它结束，或用 MD_TEST_PORT / MD_TEST_DEBUG_PORT 指定别的端口。');
}

const PORT = process.env.MD_TEST_PORT ? Number(process.env.MD_TEST_PORT) : await freePort();
const DEBUG_PORT = process.env.MD_TEST_DEBUG_PORT
  ? Number(process.env.MD_TEST_DEBUG_PORT)
  : await freePort([PORT]);
const BASE = `http://127.0.0.1:${PORT}/`;

// ------------------------------------------------------------------ 断言工具

const results = [];
let currentSection = '';

function section(title) {
  currentSection = title;
  console.log(`\n=== ${title} ===`);
}

function check(name, ok, detail = '') {
  results.push({ name: `${currentSection} · ${name}`, ok: Boolean(ok), detail: String(detail) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `\n        ${detail}` : ''}`);
}

const dump = (v) => JSON.stringify(v);
const eq = (name, actual, expected) => check(name, dump(actual) === dump(expected),
  `actual=${dump(actual)}\n        expected=${dump(expected)}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ 期望块表的形状
//
// 探针的 `want` 用与浏览器侧 canonical 完全同形的声明式写法：
//   纯文本用字符串；行内元素用 { tag: 'strong', text: '粗体' }；块用 { kind, lines|items }。
// 比较＝JSON 深比（浏览器侧把 DOM 归一并排序成同一形状），失败时两边逐字打出来。

const S = (text) => ({ tag: 'strong', text });
const E = (text) => ({ tag: 'em', text });

/**
 * 探针表：**每一样构造的渲染证据**（不是范围定义；范围定义在契约文件里）。
 *  - `input`：喂给 Web 渲染器的文本；
 *  - `want`：期望的块序列（逐字比较）；
 *  - `tags`：这一条**允许出现**的元素标签（越界标签会当场报出来）；
 *  - `contractSyntaxNeeds`：契约里这一条的 `syntax` 文字必须仍然含有这些字面 —— 契约改了语法而探针没跟着改就红。
 */
const PROBES = [
  {
    id: 'paragraph',
    contractSyntaxNeeds: ['段'],
    input: '甲行\n乙行\n\n丙段\n',
    want: [
      { kind: 'Paragraph', lines: [['甲行'], ['乙行']] },
      { kind: 'Paragraph', lines: [['丙段']] },
    ],
    tags: ['DIV', 'P', 'BR'],
    why: '连续非空行 = 一段；空行分段（2 个段落块，不是别的块）—— 段内那两行之间的 <br> 是 line-break 那一 样的落地',
  },
  {
    id: 'line-break',
    contractSyntaxNeeds: ['换行'],
    input: '第一行\n第二行\n第三行\n',
    want: [
      { kind: 'Paragraph', lines: [['第一行'], ['第二行'], ['第三行']] },
    ],
    tags: ['DIV', 'P', 'BR'],
    why: '段内换行＝同一段里的多行：**一个**段落块 ＋ 3 行 ＋ 2 个 <br>，不是 3 个段落',
  },
  {
    id: 'ul-dash',
    contractSyntaxNeeds: ['- '],
    input: '- 甲\n- 乙\n',
    want: [
      { kind: 'UnorderedList', items: [['甲'], ['乙']] },
    ],
    tags: ['DIV', 'UL', 'LI'],
    why: '连续 `- ` 行合成**一个**无序列表，每行一项',
  },
  {
    id: 'ol-number',
    contractSyntaxNeeds: ['1. '],
    input: '3. 甲\n7. 乙\n',
    want: [
      { kind: 'OrderedList', items: [['甲'], ['乙']] },
    ],
    tags: ['DIV', 'OL', 'LI'],
    why: '有序列表按**出现次序**编号（源里的 3/7 不决定显示编号）⇒ 项文字里不得留着 "3." / "7."',
  },
  {
    id: 'bold',
    contractSyntaxNeeds: ['**'],
    input: '有**粗体**。\n',
    want: [
      { kind: 'Paragraph', lines: [['有', S('粗体'), '。']] },
    ],
    tags: ['DIV', 'P', 'STRONG'],
    why: '行内 `**文字**` → <strong>，块结构不变（仍是 1 个段落块）',
  },
  {
    id: 'italic',
    contractSyntaxNeeds: ['*'],
    input: '有*斜体*。\n',
    want: [
      { kind: 'Paragraph', lines: [['有', E('斜体'), '。']] },
    ],
    tags: ['DIV', 'P', 'EM'],
    why: '行内 `*文字*` → <em>',
  },
  {
    id: 'h3',
    contractSyntaxNeeds: ['### '],
    input: '### 小标题\n',
    want: [
      { kind: 'Heading3', lines: [['小标题']] },
    ],
    tags: ['DIV', 'H3'],
    why: '行首 `### ` 整行成为一个标题块（不与前后段落合并）',
  },
  {
    id: 'quote',
    contractSyntaxNeeds: ['> '],
    input: '> 甲\n> 乙\n',
    want: [
      { kind: 'Quote', lines: [['甲'], ['乙']] },
    ],
    tags: ['DIV', 'BLOCKQUOTE', 'P', 'BR'],
    why: '连续 `> ` 行合成**一个**引用块（Web 的引用内容装在内层 <p> 里）',
  },
];

/** 契约 `excluded[].code` → 越界样本（**每一条码都要有样本**，契约新增一条码而没有样本就红）。 */
const EXCLUDED_SAMPLES = {
  MD_TABLE: { input: '| 本子 | 异文 |\n', wantKinds: ['Paragraph'], literal: true },
  MD_IMAGE: { input: '![图片](x.png)\n', wantKinds: ['Paragraph'], literal: true },
  MD_LINK: { input: '[某站](https://example.invalid/x)\n', wantKinds: ['Paragraph'], literal: true },
  MD_INLINE_CODE: { input: '行内代码：`x`\n', wantKinds: ['Paragraph'], literal: true },
  MD_CODE_FENCE: { input: '```\n甲\n```\n', wantKinds: ['Paragraph'], literal: true },
  MD_HEADING: { input: '# 一级\n#### 四级\n##缺空格\n', wantKinds: ['Paragraph'], literal: true },
  MD_FOOTNOTE: { input: '脚注写法[^1]\n', wantKinds: ['Paragraph'], literal: true },
  MD_HTML: { input: '<br>\n', wantKinds: ['Paragraph'], literal: true },
  MD_STAR_LIST: { input: '* 星号项\n', wantKinds: ['Paragraph'], literal: true },
  // 2026-10-16 新增（负责人）：块标记「形式不合规」也**统一拒绝**——`-\t甲` 曾两端块类型不同。
  MD_MARKER_FORM: { input: '-\t甲\n', wantKinds: ['Paragraph'], literal: true },
  // 有意与其余 9 条不同：`- [ ]` 确实以 `- ` 开头 ⇒ `- ` 那条构造照常生效（普通列表项），
  // 但**没有**任务列表语义。Android 的 Markdown.kt 文档里写着同一件事（那正是 MD_TASK_LIST 诊断的理由）。
  MD_TASK_LIST: { input: '- [ ] 待办\n', wantKinds: ['UnorderedList'], literal: false, taskList: true },
};

// ------------------------------------------------------------------ 契约与夹具（Node 侧，读不到即失败）

function loadInputs() {
  section('0 契约与夹具读入（读不到即失败，不跳过）');
  for (const [what, path] of [['契约', CONTRACT_PATH], ['共用夹具', FIXTURE_PATH]]) {
    check(`${what}文件存在`, existsSync(path), path);
    if (!existsSync(path)) throw new Error(`${what}文件不存在：${path}`);
  }
  const contract = JSON.parse(readFileSync(CONTRACT_PATH, 'utf8'));
  const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
  const ids = (contract.constructs ?? []).map((c) => c?.id);
  check('契约 constructs[] 是非空数组且每项有字符串 id',
    ids.length > 0 && ids.every((id) => typeof id === 'string' && id !== ''), dump(ids));
  eq('契约 constructs[].id 无重复', ids.length, new Set(ids).size);
  check('契约 excluded[].code 是非空数组且每项有 code',
    Array.isArray(contract.excluded) && contract.excluded.length > 0
      && contract.excluded.every((e) => typeof e?.code === 'string' && e.code !== ''),
    dump((contract.excluded ?? []).map((e) => e?.code)));
  console.log(`  契约：${CONTRACT_PATH}`);
  console.log(`    constructs（${ids.length} 样）：${ids.join(', ')}`);
  console.log(`    excluded（${(contract.excluded ?? []).length} 码）：${(contract.excluded ?? []).map((e) => e.code).join(', ')}`);
  console.log(`  夹具：${FIXTURE_PATH}（${Buffer.byteLength(readFileSync(FIXTURE_PATH), 'utf8')} 字节）`);

  // 夹具路径必须是**契约自己指的那一份**：否则「同一份夹具」这句话就只是我们的说法。
  const legalSample = contract?.fixtures?.legalSample;
  check('契约 fixtures.legalSample 指的就是本测试读的那一份夹具',
    typeof legalSample === 'string' && resolve(repoRoot, legalSample) === resolve(FIXTURE_PATH),
    `contract.fixtures.legalSample=${dump(legalSample)}（本测试读 ${FIXTURE_PATH}）`);

  const notes = fixture?.poems?.[0]?.notes;
  check('夹具 poems[0].notes 是非空字符串（与 Android 读同一个字段）',
    typeof notes === 'string' && notes.trim() !== '', `${typeof notes} len=${notes?.length}`);
  return { contract, ids, notes };
}

// ------------------------------------------------------------------ 契约 ↔ 探针（双向）

function compareContractToProbes(contract, ids) {
  section('0b 契约的 constructs[] ↔ 本测试的探针表：**双向**逐项比（不是「我们这边自己列的 8 样」）');
  const probeIds = PROBES.map((p) => p.id);
  const missingProbe = ids.filter((id) => !probeIds.includes(id));
  const extraProbe = probeIds.filter((id) => !ids.includes(id));
  const dupProbe = probeIds.filter((id, i) => probeIds.indexOf(id) !== i);
  check('契约里每一样构造都有探针（契约新增构造 ⇒ 本测试红，不许 Web 静默）',
    missingProbe.length === 0, `契约里有、探针表没有：${dump(missingProbe)}`);
  check('探针表里没有契约之外的构造（契约删掉一样 ⇒ 本测试红，这条就是证伪走的路径）',
    extraProbe.length === 0, `探针表里有、契约里没有：${dump(extraProbe)}`);
  eq('探针表 id 无重复', dupProbe, []);
  eq('契约 id 集合 == 探针 id 集合', [...ids].sort(), [...probeIds].sort());

  // 探针绑在契约自己的 syntax 文字上：契约改了某一样的语法描述、探针却还按旧写法喂输入 ⇒ 红。
  for (const probe of PROBES) {
    const entry = (contract.constructs ?? []).find((c) => c?.id === probe.id);
    const syntax = String(entry?.syntax ?? '');
    const missing = (probe.contractSyntaxNeeds ?? []).filter((needle) => !syntax.includes(needle));
    check(`「${probe.id}」的探针仍与契约 syntax 对得上`,
      Boolean(entry) && missing.length === 0,
      `契约 syntax=${dump(syntax)}\n        缺失字面=${dump(missing)}`);
  }

  // 探针自身自洽：want 里出现的行内标签必须在 tags 里声明（否则「允许标签集」就是个空话）。
  for (const probe of PROBES) {
    const inlineTags = [];
    for (const block of probe.want) {
      for (const line of block.lines ?? block.items ?? []) {
        for (const item of line) if (typeof item !== 'string') inlineTags.push(String(item.tag).toUpperCase());
      }
    }
    const undeclared = inlineTags.filter((tag) => !probe.tags.includes(tag));
    check(`「${probe.id}」探针自洽：want 用到的行内标签都在 tags 里声明`,
      undeclared.length === 0, `undeclared=${dump(undeclared)} tags=${dump(probe.tags)}`);
  }

  const excludedCodes = (contract.excluded ?? []).map((e) => e.code);
  const sampleCodes = Object.keys(EXCLUDED_SAMPLES);
  check('契约里每一条越界码都有样本（契约新增一条码 ⇒ 本测试红）',
    excludedCodes.every((c) => sampleCodes.includes(c)),
    `契约里有、样本表没有：${dump(excludedCodes.filter((c) => !sampleCodes.includes(c)))}`);
  check('样本表里没有契约之外的越界码',
    sampleCodes.every((c) => excludedCodes.includes(c)),
    `样本表里有、契约里没有：${dump(sampleCodes.filter((c) => !excludedCodes.includes(c)))}`);
}

// ------------------------------------------------------------------ 独立 oracle（不借渲染器）

/** 把行内标记去掉（`**粗体**` 与 `*斜体*`）—— 独立于渲染器的实现，用来验「不丢字不加字」。 */
function stripInline(text) {
  return String(text).replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*\n]+)\*/g, '$1');
}

/**
 * 独立算出的块序列 oracle：按行分类（空行分段 / `### ` / `- ` / `N. ` / `> ` / 其余＝段落行），
 * 再去掉行内标记。这是**与渲染器无关的第二份实现**，用来逐字核对夹具每个块的文字。
 */
function oracleBlocks(markdown) {
  const lines = String(markdown).replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let cur = null;
  const flush = () => { if (cur) { blocks.push(cur); cur = null; } };
  for (const line of lines) {
    if (line.trim() === '') { flush(); continue; }
    const h3 = /^### (\S.*)$/.exec(line);
    if (h3) { flush(); blocks.push({ kind: 'Heading3', lines: [stripInline(h3[1])] }); continue; }
    const ul = /^- (\S.*)$/.exec(line);
    if (ul) {
      if (!cur || cur.kind !== 'UnorderedList') { flush(); cur = { kind: 'UnorderedList', items: [] }; }
      cur.items.push(stripInline(ul[1]));
      continue;
    }
    const ol = /^\d+\. (\S.*)$/.exec(line);
    if (ol) {
      if (!cur || cur.kind !== 'OrderedList') { flush(); cur = { kind: 'OrderedList', items: [] }; }
      cur.items.push(stripInline(ol[1]));
      continue;
    }
    const q = /^> (\S.*)$/.exec(line);
    if (q) {
      if (!cur || cur.kind !== 'Quote') { flush(); cur = { kind: 'Quote', lines: [] }; }
      cur.lines.push(stripInline(q[1]));
      continue;
    }
    if (!cur || cur.kind !== 'Paragraph') { flush(); cur = { kind: 'Paragraph', lines: [] }; }
    cur.lines.push(stripInline(line));
  }
  flush();
  return blocks;
}

/** oracle 块 → 纯文字列表（与浏览器侧 `plain` 同形，便于逐块比）。 */
const oracleTexts = (blocks) => blocks.map((b) => (b.lines ?? b.items).join('\n'));

// ------------------------------------------------------------------ CDP 薄客户端（与 e2e 同法，只用 node 自带能力）

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.seq = 0;
    this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve: res, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.code})`));
        else res(msg.result);
      }
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

let cdp = null;

async function evaluate(expression) {
  const r = await cdp.send('Runtime.evaluate', {
    expression, awaitPromise: true, returnByValue: true,
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

// ------------------------------------------------------------------ 页面里的归一化（把 DOM 变成可逐字比对的形状）

/** 注入到页面：把 renderMarkdown 的 DOM 归一成 { blocks, tags, plain }。
 *  **只读**：不 attach 到文档、不改样式，纯粹把结构读出来。 */
const HELPERS = `
(function () {
  const KIND = { P: 'Paragraph', H3: 'Heading3', UL: 'UnorderedList', OL: 'OrderedList', BLOCKQUOTE: 'Quote' };

  // 一段内的行内节点 → [{ tag, text }]（纯文本 tag=null）。嵌套元素如实标出来（渲染器理论上不产生）。
  function inlineOf(container) {
    const out = [];
    const walk = (node) => {
      for (const n of node.childNodes) {
        if (n.nodeType === 3) {
          if (n.data !== '') out.push({ tag: null, text: n.data });
        } else if (n.nodeType === 1) {
          if (n.nodeName === 'BR') { out.push({ tag: 'BR', text: '' }); continue; }
          if (n.childNodes.length === 1 && n.firstChild.nodeType === 3) {
            out.push({ tag: n.nodeName, text: n.firstChild.data });
          } else {
            // 嵌套：**不丢字**（text 仍带着），但把结构标成与期望不同 ⇒ 深比会当场报出来。
            out.push({ tag: n.nodeName + ':nested', text: n.textContent });
          }
        } else {
          out.push({ tag: n.nodeName, text: n.textContent });
        }
      }
    };
    walk(container);
    return out;
  }

  // 以 <br> 切行：每个视觉行是一个行内片段（先 clone 到离屏容器，不动原 DOM）。
  function splitLines(el) {
    const segments = [[]];
    for (const n of el.childNodes) {
      if (n.nodeName === 'BR') { segments.push([]); continue; }
      segments[segments.length - 1].push(n);
    }
    return segments.map((frag) => {
      const holder = document.createElement('x-md-frag');
      for (const c of frag) holder.append(c.cloneNode(true));
      return inlineOf(holder);
    });
  }

  window.__mdBlocksOf = function (root) {
    const blocks = [];
    for (const el of root.children) {
      const kind = KIND[el.nodeName];
      if (!kind) { blocks.push({ kind: '?UNKNOWN<' + el.nodeName + '>', lines: [] }); continue; }
      if (kind === 'UnorderedList' || kind === 'OrderedList') {
        blocks.push({ kind, items: [...el.children].map((li) => inlineOf(li)) });
      } else if (kind === 'Quote') {
        const inner = el.querySelector('p') || el;
        blocks.push({ kind, lines: splitLines(inner) });
      } else {
        blocks.push({ kind, lines: splitLines(el) });
      }
    }
    return blocks;
  };

  window.__mdProbe = function (markdown) {
    const root = window.__md.renderMarkdown(markdown);
    const blocks = window.__mdBlocksOf(root);
    const tags = new Set([root.nodeName]);
    for (const el of root.querySelectorAll('*')) tags.add(el.nodeName);
    const plain = blocks
      .map((b) => (b.lines || b.items).map((line) => line.map((x) => x.text).join('')).join('\\n'))
      .join('\\n');
    return { blocks, tags: [...tags].sort(), plain, outerHTML: root.outerHTML };
  };
})();
`;

// ------------------------------------------------------------------ 比较：期望 ↔ 实际

const normInline = (line) => line.map((x) => (typeof x === 'string'
  ? { tag: null, text: x }
  : { tag: String(x.tag).toUpperCase(), text: x.text }));

const normBlock = (b) => (b.items
  ? { kind: b.kind, items: b.items.map(normInline) }
  : { kind: b.kind, lines: b.lines.map(normInline) });

const wantJSON = (want) => JSON.stringify(want.map(normBlock));

/** 期望里出现的、允许出现的标签集合（＋根 DIV）——「闭集之外不加分支」用的白名单。 */
function allowedTags() {
  const tags = new Set(['DIV']);
  for (const p of PROBES) for (const t of p.tags) tags.add(t);
  return tags;
}

/** Android 侧判据的**重写**（照 2026-10-16 收严后的 `Markdown.kt`：行首**恰好一个 ASCII 空格** ＋ 非空白，
 *  块内文字**逐字保留不 trim**；**未在本机跑 Android 单测** —— 真正的 Android 半边由 `MarkdownTest` 跑，
 *  这里是在**同一份边界夹具**上的同轮对照）。 */
function androidJudge(md) {
  const out = [];
  for (const line of String(md).replace(/\r\n?/g, '\n').split('\n')) {
    if (line.trim() === '') continue;
    const h3 = /^### (\S.*)$/.exec(line);
    if (h3) { out.push(`Heading3(${JSON.stringify([h3[1]])})`); continue; }
    const ul = /^- (\S.*)$/.exec(line);
    if (ul) { out.push(`UnorderedList(${JSON.stringify([ul[1]])})`); continue; }
    const ol = /^\d{1,9}\. (\S.*)$/.exec(line);
    if (ol) { out.push(`OrderedList(${JSON.stringify([ol[1]])})`); continue; }
    const q = /^> (\S.*)$/.exec(line);
    if (q) { out.push(`Quote(${JSON.stringify([q[1]])})`); continue; }
    out.push(`Paragraph(${JSON.stringify([line])})`);
  }
  return out.join(' / ');
}

// ------------------------------------------------------------------ 主流程

let server = null;
let chrome = null;
let userDataDir = null;

async function startServer() {
  await assertPortFree(PORT, '本测试的静态服务');
  // 与 e2e 用**同一个**零依赖静态服务，根＝web/（这样 /app/render.js 就是应用真正加载的那个模块）。
  server = spawn(NODE, [resolve(webRoot, 'scripts', 'serve.mjs'), '--port', String(PORT), '--root', webRoot],
    { stdio: ['ignore', 'pipe', 'pipe'] });
  const deadline = Date.now() + 15000;
  for (;;) {
    try { await fetch(BASE); break; } catch { /* 还没起来 */ }
    if (Date.now() > deadline) throw new Error('静态服务没起来');
    await sleep(150);
  }
}

async function stopAll() {
  if (chrome) { chrome.kill(); chrome = null; }
  if (server) { server.kill(); server = null; }
  if (userDataDir) {
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
    userDataDir = null;
  }
}

async function main() {
  await mkdir(artifactsDir, { recursive: true });

  const { contract, ids, notes } = loadInputs();
  compareContractToProbes(contract, ids);

  // -------------------------------------------------- 1 浏览器里逐样渲染
  await startServer();
  console.log(`\n静态服务：${BASE}（root=${webRoot}）`);
  userDataDir = await mkdtemp(resolve(tmpdir(), 'md-conformance-'));
  await assertPortFree(DEBUG_PORT, 'CDP 调试端口');
  if (!existsSync(CHROME_BIN)) throw new Error(`找不到浏览器：${CHROME_BIN}（可用 CHROME_BIN 指定）`);
  chrome = spawn(CHROME_BIN, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars', '--disable-background-networking', '--disable-component-update',
    '--disable-sync', '--remote-allow-origins=*', '--window-size=900,1100',
    `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${userDataDir}`,
    'about:blank',
  ], { stdio: 'ignore' });

  const deadline = Date.now() + 30000;
  for (;;) {
    try { await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`); break; } catch { /* 还没起来 */ }
    if (Date.now() > deadline) throw new Error('无头 Chromium 没起来');
    await sleep(150);
  }
  const targets = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('没有找到可用的 page target');
  cdp = await CDP.connect(page.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');
  console.log(`无头 Chromium：${CHROME_BIN}`);
  console.log(`端口：静态服务 ${PORT}、CDP ${DEBUG_PORT}（可 MD_TEST_PORT / MD_TEST_DEBUG_PORT 指定）`);

  // 文档落在本仓静态服务的 origin 上（就是应用自己的 index.html），
  // 然后**动态 import 应用真正加载的那个模块** —— 不另写一份渲染器、不复制源码。
  await cdp.send('Page.navigate', { url: BASE });
  await waitFor(`document.readyState !== 'loading'`, { label: '文档可求值', timeout: 20000 });
  await evaluate(`(async () => {
    window.__md = await import('/app/render.js');
    return typeof window.__md.renderMarkdown === 'function';
  })()`);
  await evaluate(HELPERS);
  check('浏览器里 import 到应用的 web/app/render.js 并拿到 renderMarkdown()',
    await evaluate(`typeof window.__md.renderMarkdown === 'function'`), 'ok');

  section('1 契约里每一样构造：**真渲染**并逐字比块序列（契约钉住，Web 半边）');
  const observed = {};
  for (const probe of PROBES) {
    const got = await evaluate(`window.__mdProbe(${JSON.stringify(probe.input)})`);
    observed[probe.id] = got;
    const want = wantJSON(probe.want);
    check(`「${probe.id}」渲染出期望的块序列（${probe.why}）`,
      JSON.stringify(got.blocks) === want,
      `输入=${dump(probe.input)}\n        actual=${JSON.stringify(got.blocks)}\n        expected=${want}`);
    const undeclaredTags = got.tags.filter((t) => !probe.tags.includes(t));
    check(`「${probe.id}」只产出声明的标签（越界标签当场暴露）`,
      undeclaredTags.length === 0, `actual tags=${dump(got.tags)} declared=${dump(probe.tags)}`);
  }

  // 有序列表：源里的数字不决定显示编号（Android 单测 orderedList_numbersByOccurrence 的 Web 对应）
  const olTexts = observed['ol-number'].blocks[0].items.map((line) => line.map((x) => x.text).join(''));
  check('「ol-number」项文字里没有源编号（3. / 7. 只决定它是列表，不决定显示编号）',
    olTexts.every((t) => !/^\d+\./.test(t)), dump(olTexts));

  // 契约里那 8 样在 Web 侧**真的都能渲染出对应块**（不是「我们这边列的 8 样」）
  const renderedKinds = {};
  for (const probe of PROBES) renderedKinds[probe.id] = observed[probe.id].blocks.map((b) => b.kind);
  console.log(`  实测块类型：${JSON.stringify(renderedKinds)}`);

  // -------------------------------------------------- 2 共用夹具（与 Android 同一份文件、同一套期望）
  section('2 共用夹具对照：与 Android MarkdownTest.legalFixture_parsesIntoTheExpectedBlocks 同一套期望');
  // 夹具是编译器产物，八样写法各出现一次 —— 先钉住「夹具真的覆盖了 8 样」，否则下面的对照是空的。
  // 段（空行分隔）与段内换行由下面的块断言覆盖，这里钉的是「写法标记都还在」那几样。
  const MARKERS = { 'ul-dash': '\n- ', 'ol-number': '\n1. ', bold: '**', italic: '*', h3: '\n### ', quote: '\n> ' };
  const missingMarkers = Object.entries(MARKERS).filter(([, needle]) => !notes.includes(needle)).map(([id]) => id);
  check('夹具里确实出现了闭集那几样的写法标记（夹具被裁剪就红）', missingMarkers.length === 0,
    `缺失=${dump(missingMarkers)}`);

  const fixtureGot = await evaluate(`window.__mdProbe(${JSON.stringify(notes)})`);
  console.log(`\n  实测块序列：${fixtureGot.blocks.map((b) => b.kind).join(' / ')}`);
  // ⚠ 这一串**逐字**来自 Android 单测的期望（同一套块序列期望，两端共用一份夹具）
  eq('块序列与 Android 的期望完全一致（Paragraph / Heading3,Paragraph / Heading3,UnorderedList,OrderedList / Heading3,Quote）',
    fixtureGot.blocks.map((b) => b.kind),
    ['Paragraph', 'Heading3', 'Paragraph', 'Heading3', 'UnorderedList', 'OrderedList', 'Heading3', 'Quote']);
  eq('块数 = 8（与 Android 的期望串等长）', fixtureGot.blocks.length, 8);
  // 段落：段内换行是**同一段里的多行**（不是新段落）—— Android 断言 blocks[2] 是 Paragraph 且 .lines.size == 3
  eq('中段是**同一个**段落里的 3 行（段内换行＝一次换行，不是新段落）', fixtureGot.blocks[2].lines.length, 3);
  eq('中段 3 行的行内节点数（首末行各含一个行内元素、中间行纯文本）',
    fixtureGot.blocks[2].lines.map((l) => l.length), [3, 1, 3]);
  const brCount = (fixtureGot.outerHTML.match(/<br>/g) ?? []).length;
  eq('段内换行渲染成 <br>（3 行 ⇒ 2 个），且只在这一个段里', brCount, 2);
  eq('无序列表项数 = 2（Android: UnorderedList.items.size == 2）', fixtureGot.blocks[4].items.length, 2);
  eq('有序列表项数 = 2', fixtureGot.blocks[5].items.length, 2);
  check('列表块只含 <li> 子元素（不漏出别的结构）',
    await evaluate(`(() => {
      const root = window.__md.renderMarkdown(${JSON.stringify(notes)});
      return [...root.querySelectorAll('ul, ol')].every((l) => [...l.children].every((c) => c.nodeName === 'LI'));
    })()`), 'ok');

  // 逐块文字：与 Node 侧**独立 oracle**（按行分类＋去标记）逐字比 ⇒ 不丢字、不加字
  const oracle = oracleBlocks(notes);
  eq('oracle 自己算出的块种类序列与 Android 期望一致（第二份实现的交叉核对）',
    oracle.map((b) => b.kind), fixtureGot.blocks.map((b) => b.kind));
  const gotTexts = fixtureGot.blocks.map((b) => (b.lines ?? b.items).map((line) => line.map((x) => x.text).join('')).join('\n'));
  eq('整份夹具的纯文字 == 独立 oracle 的纯文字（去标记后不丢字、不加字）', gotTexts, oracleTexts(oracle));
  for (let i = 0; i < fixtureGot.blocks.length; i += 1) {
    eq(`块 ${i}（${fixtureGot.blocks[i].kind}）文字逐字一致`, gotTexts[i], oracleTexts(oracle)[i]);
  }
  check('渲染后的文字里不再残留块级标记（### / - / 1. / > 都被消费掉）',
    !/(^|\n)(### |- |\d+\. |> )/.test(fixtureGot.plain), dump(fixtureGot.plain));
  check('渲染后的文字里不再残留行内标记（** / * 都被消费掉）',
    !fixtureGot.plain.includes('**') && !fixtureGot.plain.includes('*'), dump(fixtureGot.plain));
  eq('行内：夹具里的两个行内元素落在期望的块里',
    [fixtureGot.blocks[2].lines[0].filter((x) => x.tag).map((x) => `${x.tag}:${x.text}`),
      fixtureGot.blocks[2].lines[2].filter((x) => x.tag).map((x) => `${x.tag}:${x.text}`)],
    [['STRONG:粗体'], ['EM:斜体']]);

  // -------------------------------------------------- 3 行内（单列一节，便于报告引用）
  section('3 行内：粗体 / 斜体 / 不丢字不加字 / 未闭合按字面');
  const inlineGot = await evaluate(`window.__mdProbe('有**粗体**。有*斜体*。\\n')`);
  const boldOnly = await evaluate(`window.__mdProbe('有**粗体**。\\n')`);
  const italicOnly = await evaluate(`window.__mdProbe('有*斜体*。\\n')`);
  eq('`**粗体**` → <strong>', boldOnly.blocks[0].lines[0].filter((x) => x.tag).map((x) => `${x.tag}:${x.text}`),
    ['STRONG:粗体']);
  eq('`*斜体*` → <em>', italicOnly.blocks[0].lines[0].filter((x) => x.tag).map((x) => `${x.tag}:${x.text}`),
    ['EM:斜体']);
  eq('斜体是 <em> 元素（不是别的等效写法）', await evaluate(`(() => {
    const r = window.__md.renderMarkdown('有*斜体*。');
    return [...r.querySelectorAll('em')].map((e) => 'em:' + e.textContent);
  })()`), ['em:斜体']);
  eq('行内两样在同一行里都生效且顺序不变（strong 在前）',
    inlineGot.blocks[0].lines[0].filter((x) => x.tag).map((x) => x.tag), ['STRONG', 'EM']);
  eq('去掉标记后不丢字、不加字', inlineGot.plain, '有粗体。有斜体。');
  eq('一个段落块里的行内节点顺序（纯文本与行内元素挨着）',
    inlineGot.blocks[0].lines[0], [{ tag: null, text: '有' }, { tag: 'STRONG', text: '粗体' },
      { tag: null, text: '。有' }, { tag: 'EM', text: '斜体' }, { tag: null, text: '。' }]);
  const unclosed = await evaluate(`window.__mdProbe('**没有收尾\\n')`);
  eq('未闭合强调按字面（与 Android unclosedEmphasis_staysLiteral 同一条）：仍是段落',
    unclosed.blocks.map((b) => b.kind), ['Paragraph']);
  eq('未闭合强调：标记原样留着、不丢字、不产生 STRONG',
    [unclosed.plain, unclosed.tags.filter((t) => t === 'STRONG').length], ['**没有收尾', 0]);

  // -------------------------------------------------- 4 闭集之外不加分支
  section('4 闭集之外不加分支：excluded[].code 逐条喂进去（如实记录实际行为，不改渲染器）');
  const allowed = allowedTags();
  const hostileObserved = {};
  for (const [code, sample] of Object.entries(EXCLUDED_SAMPLES)) {
    const got = await evaluate(`window.__mdProbe(${JSON.stringify(sample.input)})`);
    hostileObserved[code] = got;
    const kinds = got.blocks.map((b) => b.kind);
    eq(`「${code}」不新增块类型（期望 ${dump(sample.wantKinds)}）`, kinds, sample.wantKinds);
    // MD_TASK_LIST 是唯一 literal=false 的样本（`- ` 确实生效）⇒ 它的文字断言写在下面那几条里，
    // 这里**不发**恒真的占位断言（每条断言都要有牙齿）。
    if (sample.literal) eq(`「${code}」按字面显示、不丢字不加字`, got.plain, sample.input.replace(/\n$/, ''));
    const beyond = got.tags.filter((t) => !allowed.has(t));
    check(`「${code}」渲染出的标签不超出契约 8 样声明的标签`, beyond.length === 0,
      `actual tags=${dump(got.tags)} 越界=${dump(beyond)}`);
  }
  // MD_TASK_LIST 的**有意差异**：`- [ ]` 以 `- ` 开头 ⇒ 是一个普通列表项，但**没有**任务列表语义。
  const task = hostileObserved.MD_TASK_LIST;
  eq('「MD_TASK_LIST」如实记录：它是**一个普通无序列表项**（`- ` 那条构造照常生效，`- ` 标记被消费掉），文字原样',
    task.blocks, [{ kind: 'UnorderedList', items: [[{ tag: null, text: '[ ] 待办' }]] }]);
  check('「MD_TASK_LIST」与其余 9 条不同：它落了结构（列表项），这里如实记下来、不退让成断言松的写法',
    task.plain === '[ ] 待办' && task.blocks[0].kind === 'UnorderedList',
    `plain=${dump(task.plain)} kinds=${dump(task.blocks.map((b) => b.kind))}`);
  check('「MD_TASK_LIST」没有 checkbox/选择控件（任务列表语义确实不被渲染）',
    (await evaluate(`(() => {
      const r = window.__md.renderMarkdown('- [ ] 待办');
      return [...r.querySelectorAll('*')].every((e) => !['INPUT', 'BUTTON'].includes(e.nodeName))
        && r.querySelectorAll('input[type=checkbox]').length === 0;
    })()`)), 'ok');
  // 越界样本整体：渲染器**不许**为它们长出新标签（例如将来偷偷加了表格/链接渲染 ⇒ 这里红）
  check('越界样本合起来也没有长出契约之外的标签（闭集之外不加分支）',
    Object.values(hostileObserved).every((got) => got.tags.every((t) => allowed.has(t))),
    `允许=${dump([...allowed].sort())}\n        实测=${JSON.stringify(Object.fromEntries(Object.entries(hostileObserved).map(([k, v]) => [k, v.tags])))}`);
  console.log(`  越界样本实测（如实记录，未做任何渲染器改动）：`);
  for (const [code, got] of Object.entries(hostileObserved)) {
    console.log(`    ${code.padEnd(16)} → ${got.blocks.map((b) => b.kind).join('/')} | ${JSON.stringify(got.plain)} | tags=${got.tags.join(',')}`);
  }

  // -------------------------------------------------- 5 块标记边界：**判红**（正反例＝三方共用夹具）
  //
  // 2026-10-16 由负责人收口（此前是「只打印不判红」的观察）：编译器与 Web 用 `\s+`、Android 要字面空格，
  // 于是 `###\t甲`／`-\t甲` 这类行**编译器放行、两端块类型不同**；`-  甲` 的项文字、`### 甲 ` 的尾空格
  // 也一处一差 —— 全部是产物**真能到达**的分叉。现在边界写进 `schema/markdown-subset.json` 的 `boundary`，
  // 三个实现同一套判据，正反例固定在 `tests/fixtures/contract/md-boundary.json`（编译器／Web／Android 都读它）。
  section('5 块标记边界：正反例逐例对账（Web 真渲染 ＋ Android 判据重写 ＋ 编译器判据；夹具＝三方共用）');
  check('编译器模块可读（边界的三方对账需要它）', Boolean(classifyLine) && Boolean(checkMarkdownLine),
    'tools/lib/markdown.mjs 未读入');
  const boundary = JSON.parse(readFileSync(BOUNDARY_PATH, 'utf8'));
  const boundaryRows = [];
  for (const c of boundary.cases) {
    const want = c.endKind === 'separator' ? [] : [{ kind: c.endKind, text: c.endText }];
    const got = await evaluate(`window.__mdProbe(${JSON.stringify(`${c.line}\n`)})`);
    const norm = got.blocks.map((b) => ({
      kind: b.kind,
      text: (b.lines ?? b.items).map((l) => l.map((x) => x.text).join('')).join('\n'),
    }));
    eq(`边界「${c.id}」Web 真渲染 ${JSON.stringify(c.line)}`, norm, want);

    if (c.endKind === 'separator') {
      const gj = androidJudge(`${c.line}\n`);
      check(`边界「${c.id}」Android 判据：空行不成块`, gj === '', gj);
    } else {
      const wantAndroid = `${c.endKind}(${JSON.stringify([c.endText])})`;
      const gotAndroid = androidJudge(`${c.line}\n`);
      check(`边界「${c.id}」Android 判据 ${JSON.stringify(c.line)}`, gotAndroid === wantAndroid,
        `actual=${gotAndroid}\n        expected=${wantAndroid}`);
    }

    const cls = classifyLine ? classifyLine(c.line) : '(模块未读入)';
    eq(`边界「${c.id}」编译器判据 ${JSON.stringify(c.line)}`, cls, c.compiler);
    boundaryRows.push({ id: c.id, line: c.line, why: c.why, compiler: cls, web: norm });
  }
  console.log(`  边界正反例 ${boundary.cases.length} 例，逐例已判红（三方同一份期望，夹具 ${BOUNDARY_PATH}）。`);

  // -------------------------------------------------- 证据
  const evidence = {
    contractPath: CONTRACT_PATH,
    fixturePath: FIXTURE_PATH,
    contractConstructIds: ids,
    excludedCodes: (contract.excluded ?? []).map((e) => e.code),
    probeIds: PROBES.map((p) => p.id),
    observed: Object.fromEntries(Object.entries(observed).map(([k, v]) => [k, { blocks: v.blocks, tags: v.tags, plain: v.plain }])),
    fixture: { kinds: fixtureGot.blocks.map((b) => b.kind), texts: gotTexts, oracleTexts: oracleTexts(oracle), outerHTML: fixtureGot.outerHTML },
    excludedObserved: Object.fromEntries(Object.entries(hostileObserved).map(([k, v]) => [k, { blocks: v.blocks, tags: v.tags, plain: v.plain }])),
    inline: { plain: inlineGot.plain, blocks: inlineGot.blocks, unclosed: { plain: unclosed.plain, blocks: unclosed.blocks } },
    boundaryCases: boundaryRows,
  };
  await writeFile(resolve(artifactsDir, 'md-conformance.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(`\n证据：${resolve(artifactsDir, 'md-conformance.json')}`);
}

// ------------------------------------------------------------------ 收尾

let fatal = null;
try {
  await main();
} catch (err) {
  fatal = err;
  console.error(`\n致命错误：${err?.stack || err}`);
} finally {
  await stopAll();
}

// ------------------------------------------------------------------ 汇总
{
  const pass = results.filter((r) => r.ok).length;
  const fail = results.length - pass;
  console.log(`\n================ 汇总 ================`);
  console.log(`通过 ${pass}/${results.length}${fail > 0 ? `　**失败 ${fail}**` : ''}`);
  for (const r of results.filter((x) => !x.ok)) console.log(`  FAIL  ${r.name}\n        ${r.detail}`);
  if (fatal) console.log(`致命错误（未计入上面的条数）：${fatal.message}`);
}
process.exit(fatal || results.some((r) => !r.ok) ? 1 : 0);
