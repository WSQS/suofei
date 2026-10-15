// ⚠️⚠️ 演示用，不是编译器。⚠️⚠️
//
// 本脚本回答一件事：**A 路线（单文件自足 ＋ 详情整节留正文、产物只带一个 Markdown 文本字段）**
// 的源 MD 解析成什么样、缺省怎么写、遇到「未定／歧义构造」会不会响。
//
// 硬边界（与 AGENTS.md 一致）：
//   - 它**只读** `a-route/samples/` 与 `a-route/fixtures-ambiguous/`，**绝不**读 `content/`，**绝不写任何东西**。
//   - 它**不是** `tools/` 里的正式编译器，解析规则是刻意写小的一段；正式解析/校验/错误码仍以
//     `tools/` 与 `docs/design/content-contract.md` 为准（本材料**不改** `tools/`）。
//   - 它打印的 JSON 是**样例**，**不是**正式 `dist/content.json`，不参与发布。
//   - 本脚本只覆盖**已约定的写法**；凡「未定」的构造一律**告警并计数**（宁可响，不许静默）。
//
// 用法：
//   node items/content-format/prototypes/a-route/demo.mjs
//       → 解析 samples/、打印样例 JSON、跑自检、并展示「歧义构造会响」的计数
//   node items/content-format/prototypes/a-route/demo.mjs --print-json <samples 里的文件名>
//       → 只把那一份的样例 JSON 打到 stdout（供生成 json/*.json 用；脚本自己不写文件）
//   node items/content-format/prototypes/a-route/demo.mjs --parse <任意 md 路径>
//       → 解析那一个文件；有告警 ⇒ 打印告警并**非零退出**（告警路径自证用）
//
// 告警分类（每类都可单独断言「会响」）：
//   unknown-section    未知的 `## X`（不是「详情」「笔记」）
//   duplicate-section  同一个 `## 名称` 出现两次
//   fence-heading      代码围栏内部出现看起来像 `## ` 的行（是不是切分点 —— 未定）
//   unclosed-fence     围栏没有闭合
//   md-out-of-range    详情/笔记里用了「声明的最小 Markdown 支持范围」之外的写法（范围本身未定）
//   unknown-fm-key     front matter 出现约定之外的键

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SAMPLES_DIR = path.join(HERE, 'samples');
const JSON_DIR = path.join(HERE, 'json');
const AMBIG_DIR = path.join(HERE, 'fixtures-ambiguous');

// ── 本材料里所有**未定**的东西，集中放在这里，改一处即可对照 ──────────────────────
// ⚠️ 下面这些**都是草案/候选**，不是已采纳规格。改它们不影响「未定」这件事本身。
const DETAIL_KEY = 'detail'; // 候选名之一：detail / detailMarkdown / detailText（见 undecided.md）
const KNOWN_SECTIONS = ['详情', '笔记']; // 顶层 `##` 只允许这两个名字（草案）
const KNOWN_FM_KEYS = [
  'id', 'title', 'author', 'dynasty', 'dynastyOrder', 'era', 'genre', 'orderInSource', 'source',
];
const DYNASTY = { 汉: { key: 'han', order: 100 } };

// 「声明的最小 Markdown 支持范围」——**候选口径，未定**。这里只是为了让「会响」可运行：
// 详情/笔记里若出现下表之外的**行首**写法，就告警（提醒作者：客户端可能渲染不了）。
//   ✅ 声明支持：空行；`#`~`###` 标题；`- `/`* `/`+ `/`1. ` 列表；`> ` 引用；``` / ~~~ 围栏；`---` 分隔线；其余当段落。
//   ⚠️ 行内（段落内部）：`**粗体**`、`*斜体*`、`` `代码` ``、`[文字](链接)` 视为支持。
//   ❌ 声明**不**支持（出现即告警）：表格 `|`、`####` 及更深标题、图片 `![]`、行首 HTML 标签、脚注 `[^`、任务列表 `- [ ]`。
function mdOutOfRangeReason(line) {
  const s = line.replace(/\s+$/, '');
  if (/^\s*\|/.test(s)) return '表格行（`| … |`）';
  if (/^#{4,}\s/.test(s)) return '标题层级超过 `###`';
  if (/^!\s*\[/.test(s)) return '图片（`![]()`）';
  if (/^<[A-Za-z/!]/.test(s)) return '行首 HTML 标签';
  if (/^\[\^/.test(s)) return '脚注（`[^…]`）';
  if (/^\s*[-*+]\s+\[[ xX]\]/.test(s)) return '任务列表（`- [ ]`）';
  return null;
}

const EXPECTED_POETRY = [
  '行行重行行，与君生别离。',
  '相去万余里，各在天一涯。',
  '道路阻且长，会面安可知？',
  '胡马依北风，越鸟巢南枝。',
  '相去日已远，衣带日已缓。',
  '浮云蔽白日，游子不顾反。',
  '思君令人老，岁月忽已晚。',
  '弃捐勿复道，努力加餐饭。',
];

function readLines(file) {
  let text = fs.readFileSync(file, 'utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // 容忍 BOM
  return text.split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l)); // 容忍 CRLF
}

function splitFrontMatter(lines, file) {
  if ((lines[0] ?? '').trim() !== '---') throw new Error(`${file}: 第一行不是 ---`);
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') { end = i; break; }
  }
  if (end < 0) throw new Error(`${file}: front matter 没有结束行 ---`);
  return { fm: lines.slice(1, end), body: lines.slice(end + 1) };
}

const stripQuotes = (s) => {
  s = (s ?? '').trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1);
  return s;
};

// 最小 front matter 子集：标量 / 引号标量。unknown key ⇒ 告警（不静默丢）。
function parseFrontMatter(fmLines, file, warnings) {
  const data = {};
  for (const line of fmLines) {
    if (line.trim() === '' || /^[ \t]*#/.test(line)) continue;
    const m = /^([A-Za-z][A-Za-z0-9_-]*):(?:[ \t]+(.*))?$/.exec(line);
    if (!m) throw new Error(`${file}: 不认识的 front matter 行：${JSON.stringify(line)}`);
    if (!KNOWN_FM_KEYS.includes(m[1])) {
      warnings.push({ code: 'unknown-fm-key', file, msg: `front matter 出现约定之外的键「${m[1]}」` });
    }
    data[m[1]] = stripQuotes(m[2] ?? '');
  }
  return data;
}

// 正文切分。**切分点是行首恰好 `## `（`###` 不匹配）**，但**代码围栏内部不算切分点** ——
// 围栏判据：``` 或 ~~~ 开头的行按同类开闭配对；围栏内的行原样归入当前节，并对「看起来像 ## 的行」告警。
function splitBody(bodyLines, file, warnings) {
  const poem = [];
  const sections = [];
  let cur = null;
  let fence = null; // '```' | '~~~' | null
  const seen = new Set();
  for (const raw of bodyLines) {
    const line = raw.replace(/[ \t]+$/, '');
    const fenceM = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence !== null) {
      if (fenceM && fenceM[1][0] === fence[0]) { fence = null; } // 闭合围栏本身归入当前节
      else if (/^##\s+\S/.test(line)) {
        warnings.push({ code: 'fence-heading', file, msg: `代码围栏内部出现形如「${line.trim().slice(0, 40)}」的节标题（是不是切分点 —— 未定，本演示不当切分点，但必须响）` });
      }
      (cur === null ? poem : cur.lines).push(raw);
      continue;
    }
    if (fenceM) { fence = fenceM[1]; (cur === null ? poem : cur.lines).push(raw); continue; }
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) {
      const name = h[1].trim();
      if (!KNOWN_SECTIONS.includes(name)) {
        warnings.push({ code: 'unknown-section', file, msg: `未知的节「## ${name}」（不是 详情/笔记 —— 未定：报错／忽略／原样保留？）` });
      }
      if (seen.has(name)) {
        warnings.push({ code: 'duplicate-section', file, msg: `重复的节「## ${name}」（第二个从第… 起 —— 未定：报错／覆盖／拼接？）` });
      }
      seen.add(name);
      cur = { name, lines: [] };
      sections.push(cur);
      continue;
    }
    (cur === null ? poem : cur.lines).push(raw); // 空行保留（空行是分段信息）
  }
  if (fence !== null) warnings.push({ code: 'unclosed-fence', file, msg: '代码围栏没有闭合' });
  const section = (name) => sections.find((s) => s.name === name)?.lines ?? null;
  const joinSection = (name) => {
    const lines = section(name);
    return lines === null ? null : lines.join('\n').trim();
  };
  return { poem, sectionNames: sections.map((s) => s.name), section, joinSection };
}

function buildStanzas(poemLines) {
  const out = [];
  let cur = [];
  for (const l of poemLines) {
    if (l.trim() === '') { if (cur.length) { out.push(cur); cur = []; } }
    else cur.push(l);
  }
  if (cur.length) out.push(cur);
  return out;
}

// 扫描「详情 / 笔记」正文行，看有没有超出**声明范围**的写法。
function scanMdRange(text, label, file, warnings) {
  if (text === null) return;
  const lines = text.split('\n');
  let inFence = false;
  lines.forEach((raw, i) => {
    const line = raw.replace(/\s+$/, '');
    if (/^\s*(`{3,}|~{3,})/.test(line)) { inFence = !inFence; return; }
    if (inFence || line.trim() === '') return;
    const reason = mdOutOfRangeReason(line);
    if (reason) {
      warnings.push({ code: 'md-out-of-range', file, msg: `${label} 节内第 ${i + 1} 行用了声明范围之外的写法（${reason}）：${JSON.stringify(line.trim().slice(0, 40))}` });
    }
  });
}

const asInt = (v) => (v === undefined || v === null || v === '' ? null : Number(v));

function buildPoem(file) {
  const warnings = [];
  const lines = readLines(file);
  const { fm, body } = splitFrontMatter(lines, file);
  const f = parseFrontMatter(fm, file, warnings);
  const sec = splitBody(body, file, warnings);
  const detail = sec.joinSection('详情');
  const notes = sec.joinSection('笔记');
  scanMdRange(detail, '## 详情', file, warnings);
  scanMdRange(notes, '## 笔记', file, warnings);

  const d = DYNASTY[f.dynasty];
  if (!d) throw new Error(`${file}: 未在演示注册表里的朝代：${f.dynasty}`);
  const poem = {
    id: f.id,
    title: f.title,
    author: f.author,
    dynastyKey: d.key,
    dynastyLabel: f.dynasty,
    dynastyOrder: asInt(f.dynastyOrder ?? d.order),
    era: f.era || null,
    genre: f.genre || null,
    source: f.source,
    orderInSource: asInt(f.orderInSource),
    [DETAIL_KEY]: detail, // 「## 详情」整节 = 一个 Markdown 文本字段（草案名）
    stanzas: buildStanzas(sec.poem),
    notes,
  };
  return { poem, warnings, meta: { poemLines: sec.poem.filter((l) => l.trim() !== ''), sectionNames: sec.sectionNames } };
}

// ── 自检：逐诗逐行 ＋ 分段 ＋ 缺省三态 ────────────────────────────────────────────
function selfCheck() {
  const files = fs.readdirSync(SAMPLES_DIR).filter((f) => f.endsWith('.md')).sort();
  const rows = [];
  let allOk = true;
  for (const file of files) {
    const { poem, warnings, meta } = buildPoem(path.join(SAMPLES_DIR, file));
    const equal = meta.poemLines.length === EXPECTED_POETRY.length && meta.poemLines.every((l, i) => l === EXPECTED_POETRY[i]);
    const stanzasOk = poem.stanzas.length === 1 && poem.stanzas[0].length === EXPECTED_POETRY.length;
    const noHash = meta.poemLines.every((l) => !/^#/.test(l));
    const ok = equal && stanzasOk && noHash && warnings.length === 0;
    allOk = allOk && ok;
    rows.push({ file, poem, warnings, equal, stanzasOk, noHash, detail: poem[DETAIL_KEY], notes: poem.notes });
  }
  return { rows, allOk };
}

// ── 告警路径自证：给一段故意有歧义的正文，看每一类是否都会响 ──────────────────────
function ambiguitySelfProof() {
  const synthetic = [
    '行行重行行，与君生别离。',
    '',
    '## 详情',
    '### 异文',
    '- **游子不顾返** —— 底本作「反」。',
    '',
    '| 本子 | 异文 |', // ← md-out-of-range
    '',
    '```text',
    '## 围栏里的假标题', // ← fence-heading
    '```',
    '',
    '## 校本', // ← unknown-section
    '',
    '## 详情', // ← duplicate-section
    '',
    '第二个详情。',
  ];
  const warnings = [];
  const sec = splitBody(synthetic, '<合成歧义正文>', warnings);
  scanMdRange(sec.joinSection('详情'), '## 详情', '<合成歧义正文>', warnings);
  scanMdRange(sec.joinSection('笔记'), '## 笔记', '<合成歧义正文>', warnings);
  const seen = new Set(warnings.map((w) => w.code));
  return { warnings, seen };
}

const EXPECT_CATEGORIES = ['unknown-section', 'duplicate-section', 'fence-heading', 'md-out-of-range'];

// ── CLI ─────────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);

if (argv[0] === '--print-json') {
  const name = argv[1];
  const { poem } = buildPoem(path.join(SAMPLES_DIR, name));
  process.stdout.write(JSON.stringify(poem, null, 2) + '\n');
} else if (argv[0] === '--parse') {
  const target = argv[1];
  const { poem, warnings } = buildPoem(target);
  console.log(`# --parse ${target}`);
  console.log('');
  console.log(JSON.stringify(poem, null, 2));
  console.log('');
  console.log(`告警 ${warnings.length} 条：`);
  for (const w of warnings) console.log(`  - [${w.code}] ${w.msg}`);
  if (warnings.length > 0) {
    console.log('⇒ 有告警：进程非零退出（宁可响，不许静默）。');
    process.exitCode = 1;
  } else {
    console.log('⇒ 0 告警。');
  }
} else {
  const line = '='.repeat(104);
  console.log(line);
  console.log('A 路线整合待审稿材料 —— 演示脚本输出（**演示用，不是编译器**；样例 JSON 不是正式产物）');
  console.log(line);
  console.log('');

  const { rows, allOk } = selfCheck();

  // 1) 逐诗逐行 ＋ 分段 ＋ 缺省三态
  console.log('① 自检：正文切分不污染（逐行相等）／分段保真／缺省三态／声明范围内的 Markdown');
  console.log('-'.repeat(104));
  console.log('文件'.padEnd(32) + '诗行 段数 每段  逐行相等 分段相等 #开头 详情 笔记 告警');
  for (const r of rows) {
    console.log(
      r.file.padEnd(32) +
        String(r.poem.stanzas.flat().length).padEnd(5) +
        String(r.poem.stanzas.length).padEnd(5) +
        `[${r.poem.stanzas.map((s) => s.length).join('/')}]`.padEnd(6) +
        (r.equal ? '是' : '否←失败').padEnd(9) +
        (r.stanzasOk ? '是' : '否←失败').padEnd(9) +
        (r.noHash ? '0' : '有←失败').padEnd(6) +
        (r.detail === null ? 'null' : '文本').padEnd(5) +
        (r.notes === null ? 'null' : '文本').padEnd(5) +
        r.warnings.length,
    );
  }
  console.log('-'.repeat(104));
  console.log(`自检：${allOk ? '通过（真实《行行重行行》8 行逐行相等、单段；缺省三态如预期；样例 0 告警）' : '存在失败'}`);
  console.log('');

  // 2) 样例 JSON 与 json/*.json 逐字节一致（防手抄漂移）
  console.log('② 样例 JSON 与 json/*.json 一致性（防漂移）');
  console.log('-'.repeat(104));
  let jsonAllOk = true;
  for (const r of rows) {
    const p = path.join(JSON_DIR, r.file.replace(/\.md$/, '.json'));
    const want = fs.readFileSync(p, 'utf8').replace(/\r\n?/g, '\n').replace(/\s+$/, '');
    const got = JSON.stringify(r.poem, null, 2);
    const ok = want === got;
    jsonAllOk = jsonAllOk && ok;
    console.log(`  ${ok ? '一致' : '不一致←失败'}  ${path.relative(HERE, p)}`);
  }
  console.log(`  一致性：${jsonAllOk ? '全部一致' : '存在不一致'}`);
  console.log('');

  // 3) 歧义构造「会响」自证
  console.log('③ 歧义构造「会响」自证（合成正文，逐类断言 ≥1 条告警）');
  console.log('-'.repeat(104));
  const proof = ambiguitySelfProof();
  console.log(`合成正文共抓到 ${proof.warnings.length} 条告警：`);
  for (const w of proof.warnings) console.log(`  - [${w.code}] ${w.msg}`);
  console.log('');
  let proofOk = true;
  for (const cat of EXPECT_CATEGORIES) {
    const hit = proof.seen.has(cat);
    proofOk = proofOk && hit;
    console.log(`  ${hit ? '响' : '不响←失败'}  ${cat}`);
  }
  console.log('');

  // 4) 歧义夹具文件（真实文件，供 --parse 非零退出演示）
  console.log('④ 歧义夹具文件（fixtures-ambiguous/ambiguous-detail.md）会响');
  console.log('-'.repeat(104));
  const ambFile = path.join(AMBIG_DIR, 'ambiguous-detail.md');
  const amb = buildPoem(ambFile);
  console.log(`  ${path.relative(HERE, ambFile)} ⇒ 告警 ${amb.warnings.length} 条：`);
  for (const w of amb.warnings) console.log(`  - [${w.code}] ${w.msg}`);
  console.log('  （单跑 `--parse fixtures-ambiguous/ambiguous-detail.md` 会**非零退出**，见下方自证）');
  console.log('');

  console.log(line);
  const ok = allOk && jsonAllOk && proofOk && amb.warnings.length > 0;
  console.log(ok ? '全部自检通过。' : '存在失败项，见上方「←失败」。');
  if (!ok) process.exitCode = 1;
  console.log('提醒：本演示**只覆盖已约定的写法**；「未定」的东西（source 归属 / detail 字段名 / id 来源 /');
  console.log('      `## 详情` 分界 / 重复与未知节 / 围栏标题 / 最小 Markdown 范围）见 undecided.md 与 ambiguity.md。');
  console.log(line);
}
