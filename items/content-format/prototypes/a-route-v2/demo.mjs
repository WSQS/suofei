// ⚠️⚠️ 演示用，不是编译器。⚠️⚠️
//
// 本脚本只回答一件事：**a-route-v2 这一稿（A 路线 ＋ 用户 2026-10-15 的字段选择）**
// 的源 MD 解析成什么形状、缺省怎么写、遇到「未定／歧义／已被删掉的旧键」会不会响。
//
// 硬边界（与 AGENTS.md 一致）：
//   - 它**只读**本目录（`samples/`、`json/`、`fixtures-ambiguous/`、`top-level-candidates/`），
//     **绝不**读 `content/`，**绝不**读 `tools/`，**绝不写任何东西**（连日志文件都不写）。
//   - 它**不是** `tools/` 里的正式编译器：解析规则是刻意写小的一段；正式解析/校验/错误码仍以
//     `tools/` 与 `docs/design/content-contract.md` 为准（本材料**不改** `tools/`）。
//   - 它打印的 JSON 是**样例**，**不是**正式 `dist/content.json`，不参与发布。
//   - 凡「未定」的构造一律**告警并计数**（宁可响，不许静默）。
//
// 本稿相对上一稿（已归档：items/content-format/history/round-2026-10-15-a-route-draft/）的差别：
//   - 每首只发**一个** `dynasty`（中文值），不再发 `dynastyKey`/`dynastyLabel`/`dynastyOrder` 三份；
//   - **删掉** `era`；
//   - **保留** `genre` 与 `stanzas`。
//   本演示刻意**不判断**顶层 `dynasties` 怎么处置、也不判断 `source` 留字段还是归详情 ——
//   这两件事本稿只并列方案（见 top-level-dynasties.md / undecided.md），演示对它们中立。
//
// 用法：
//   node <本脚本>                                     # 自检 + 自证，正常 EXIT=0
//   node <本脚本> --print-json <samples 里的文件名>     # 只把那一份的样例 JSON 打到 stdout（脚本自己不写文件）
//   node <本脚本> --parse <任意 md 路径>                # 解析那一个文件；有告警 ⇒ 打印告警并**非零退出**
//
// 告警分类（每类都可单独断言「会响」）：
//   removed-key        写了本稿已删除的键（`era`／`dynastyOrder`／v1 的 `dynastyKey`/`dynastyLabel`）
//   unknown-fm-key     front matter 出现约定之外的键
//   missing-required-key  演示最小必填键缺失（`id`/`title`/`author`/`dynasty`）
//   undeclared-dynasty `dynasty` 不在演示注册表里（正式口径见契约 §1.3：`DYNASTY_UNDECLARED`）
//   unknown-section    未知的 `## X`（不是「详情」「笔记」）
//   duplicate-section  同一个 `## 名称` 出现两次
//   fence-heading      代码围栏内部出现看起来像 `## ` 的行（是不是切分点 —— 未定）
//   unclosed-fence     围栏没有闭合
//   md-out-of-range    详情/笔记里用了「声明的最小 Markdown 支持范围」之外的写法（范围本身未定）

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SAMPLES_DIR = path.join(HERE, 'samples');
const JSON_DIR = path.join(HERE, 'json');
const AMBIG_DIR = path.join(HERE, 'fixtures-ambiguous');
const TOPLEVEL_DIR = path.join(HERE, 'top-level-candidates');

// ── 仓库根：**不写死层级**，从脚本所在目录向上查找一个只在仓库根存在的标记文件 ──────────────
// 为什么必须这样：上一稿的演示脚本曾写死 `join(OUT, '..','..','..')`，整轮搬到 `history/` 后
// 就指到了 `items/`。用标记文件定位，则搬到哪里都还能算出仓库根。
const ROOT_MARKER = path.join('prototype', 'css', 'theme-tech.css');

function findRepoRoot(startDir) {
  let dir = path.resolve(startDir);
  for (;;) {
    if (fs.existsSync(path.join(dir, ROOT_MARKER))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`找不到仓库根：从 ${startDir} 一路上溯都没有 ${ROOT_MARKER}（本脚本不写死层级）`);
    }
    dir = parent;
  }
}

const REPO_ROOT = findRepoRoot(HERE);
/** 显示用相对路径（一律 `/`，且锚在仓库根 ⇒ 整轮搬迁后输出仍可读）。 */
const rel = (p) => path.relative(REPO_ROOT, p).split(path.sep).join('/');

// ── 本材料里所有**未定**的东西，集中放在这里，改一处即可对照 ──────────────────────
// ⚠️ 下面这些**都是草案/候选**，不是已采纳规格。
const DETAIL_KEY = 'detail'; // 候选名之一：detail / detailMarkdown / detailText（见 undecided.md §3）
const KNOWN_SECTIONS = ['详情', '笔记']; // 顶层 `##` 只允许这两个名字（草案）
const KNOWN_FM_KEYS = ['id', 'title', 'author', 'dynasty', 'genre', 'orderInSource', 'source'];
/** 本稿**已删除**的键：源文件里再出现就响（`source` 不在其中 —— 它的归属仍未定）。 */
const REMOVED_FM_KEYS = ['dynastyKey', 'dynastyLabel', 'dynastyOrder', 'era'];
/** 演示用的**最小必填**集合：`source` 故意不列入（留字段 ↔ 归详情 仍未被拍板，演示对此中立）。 */
const FM_REQUIRED = ['id', 'title', 'author', 'dynasty'];
/**
 * 演示用的**极小**「组序注册表」：只够本目录样例用。
 * 正式注册表在 `tools/lib/dynasties.mjs`（本材料**不读**它，也不改它）。
 * ⚠️ 它只是用来演示「组序是**编译期查表**得来的、不是作者写在每首诗里的」。
 */
const DYNASTY_ORDER_DEMO = new Map([['汉', 100]]);

/** 本稿草案里的每首诗 canonical 键序（`source` 在被拍板去掉前算在 A1 形状里）。 */
const POEM_KEYS_A1 = ['id', 'title', 'author', 'dynasty', 'genre', 'source', 'orderInSource', DETAIL_KEY, 'stanzas', 'notes'];
const POEM_KEYS_A2 = ['id', 'title', 'author', 'dynasty', 'genre', 'orderInSource', DETAIL_KEY, 'stanzas', 'notes'];

/** 真实《行行重行行》的 8 行（抄自 `content/poems/gushi-shijiu-shou-01.md`，未改字）。 */
const REAL_8 = [
  '行行重行行，与君生别离。',
  '相去万余里，各在天一涯。',
  '道路阻且长，会面安可知？',
  '胡马依北风，越鸟巢南枝。',
  '相去日已远，衣带日已缓。',
  '浮云蔽白日，游子不顾反。',
  '思君令人老，岁月忽已晚。',
  '弃捐勿复道，努力加餐饭。',
];

/** 每一份样例**预期**的正文分段结构（夹具也一样列出来，免得「多段」被当成真实分段）。 */
const EXPECTED_STANZAS = {
  'real-01-with-detail.md': [REAL_8],
  'real-01-text-only.md': [REAL_8],
  'real-01-no-detail.md': [REAL_8],
  'real-01-with-note.md': [REAL_8],
  'real-01-alt-source-in-detail.md': [REAL_8],
  'fixture-multi-stanza.md': [
    REAL_8.slice(0, 3),
    REAL_8.slice(3, 6),
    REAL_8.slice(6, 8),
  ],
};

// ── 解析（刻意写小：只用「本稿已约定的写法」） ────────────────────────────────────

function readLines(file) {
  let text = fs.readFileSync(file, 'utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // 容忍 BOM
  return text.split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l)); // 容忍 CRLF
}

function splitFrontMatter(lines, file) {
  if ((lines[0] ?? '').trim() !== '---') throw new Error(`${rel(file)}: 第一行不是 ---`);
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') { end = i; break; }
  }
  if (end < 0) throw new Error(`${rel(file)}: front matter 没有结束行 ---`);
  return { fm: lines.slice(1, end), body: lines.slice(end + 1) };
}

const stripQuotes = (s) => {
  s = (s ?? '').trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1);
  return s;
};

function parseFrontMatter(fmLines, file, warnings) {
  const data = {};
  const has = new Set();
  for (const line of fmLines) {
    if (line.trim() === '' || /^[ \t]*#/.test(line)) continue; // 整行注释：夹具靠它标明「不是真实数据」
    const m = /^([A-Za-z][A-Za-z0-9_-]*):(?:[ \t]+(.*))?$/.exec(line);
    if (!m) throw new Error(`${rel(file)}: 不认识的 front matter 行：${JSON.stringify(line)}`);
    const key = m[1];
    if (REMOVED_FM_KEYS.includes(key)) {
      warnings.push({ code: 'removed-key', file, msg: `front matter 写了本稿已删除的键「${key}」（本稿每首只有一个 \`dynasty\`，且不再有 \`era\`；见 fields.md）` });
    } else if (!KNOWN_FM_KEYS.includes(key)) {
      warnings.push({ code: 'unknown-fm-key', file, msg: `front matter 出现约定之外的键「${key}」` });
    }
    data[key] = stripQuotes(m[2] ?? '');
    has.add(key);
  }
  for (const key of FM_REQUIRED) {
    if (!has.has(key)) {
      warnings.push({ code: 'missing-required-key', file, msg: `缺演示最小必填键「${key}」` });
    }
  }
  return data;
}

// 正文切分：**切分点 ＝ 行首恰好 `## `（`###` 不匹配）**，但**代码围栏内部不算切分点**。
// 围栏判据：``` 或 ~~~ 开头的行按同类开闭配对；围栏内的行原样归入当前节，并对「看起来像 ## 的行」告警。
function splitBody(bodyLines, file, warnings) {
  const poem = [];
  const sections = [];
  let cur = null;
  let fence = null;
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
        warnings.push({ code: 'duplicate-section', file, msg: `重复的节「## ${name}」（未定：报错／覆盖／拼接？）` });
      }
      seen.add(name);
      cur = { name, lines: [] };
      sections.push(cur);
      continue;
    }
    (cur === null ? poem : cur.lines).push(raw); // 空行保留（空行＝分段信息）
  }
  if (fence !== null) warnings.push({ code: 'unclosed-fence', file, msg: '代码围栏没有闭合' });
  const joinSection = (name) => {
    const s = sections.find((x) => x.name === name);
    return s === undefined ? null : s.lines.join('\n').trim();
  };
  return { poem, sectionNames: sections.map((s) => s.name), joinSection };
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

// 「声明的最小 Markdown 支持范围」——**候选口径，未定**。这里只是为了让「会响」可运行。
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

function scanMdRange(text, label, file, warnings) {
  if (text === null) return;
  let inFence = false;
  text.split('\n').forEach((raw, i) => {
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

  const hasSource = Object.prototype.hasOwnProperty.call(f, 'source');
  if (f.dynasty && !DYNASTY_ORDER_DEMO.has(f.dynasty)) {
    warnings.push({ code: 'undeclared-dynasty', file, msg: `「${f.dynasty}」不在演示注册表里（正式口径：契约 §1.3 DYNASTY_UNDECLARED，本材料不读 tools/lib/dynasties.mjs）` });
  }

  // 按 canonical 键序组装：`source` 只在源文件写了它时才出现（A1/A2 由样例自己决定，演示不选边）。
  const poem = {};
  poem.id = f.id ?? null;
  poem.title = f.title ?? null;
  poem.author = f.author ?? null;
  poem.dynasty = f.dynasty ?? null;
  poem.genre = f.genre || null;
  if (hasSource) poem.source = f.source;
  poem.orderInSource = asInt(f.orderInSource);
  poem[DETAIL_KEY] = detail;
  poem.stanzas = buildStanzas(sec.poem);
  poem.notes = notes;

  const poemLines = sec.poem.filter((l) => l.trim() !== '');
  return {
    poem,
    warnings,
    meta: {
      poemLines,
      sectionNames: sec.sectionNames,
      /** 组序：**编译期查表得来**，本演示**不**把它写进诗对象（顶层怎么处置仍未被拍板）。 */
      groupOrder: DYNASTY_ORDER_DEMO.get(f.dynasty) ?? null,
      expectedPoemKeys: hasSource ? POEM_KEYS_A1 : POEM_KEYS_A2,
    },
  };
}

// ── 自检 ────────────────────────────────────────────────────────────────────────
const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function selfCheck() {
  const files = fs.readdirSync(SAMPLES_DIR).filter((f) => f.endsWith('.md')).sort();
  const rows = [];
  let allOk = true;
  for (const file of files) {
    const { poem, warnings, meta } = buildPoem(path.join(SAMPLES_DIR, file));
    const want = EXPECTED_STANZAS[file];
    const linesEqual = deepEqual(poem.stanzas.flat(), want.flat());
    const stanzasEqual = deepEqual(poem.stanzas, want);
    const noHash = meta.poemLines.every((l) => !/^#/.test(l));
    const keysEqual = deepEqual(Object.keys(poem), meta.expectedPoemKeys);
    const noPerPoemDynastyOrder = !('dynastyKey' in poem) && !('dynastyLabel' in poem) && !('dynastyOrder' in poem) && !('era' in poem);
    let jsonEqual = null;
    const jsonPath = path.join(JSON_DIR, file.replace(/\.md$/, '.json'));
    if (fs.existsSync(jsonPath)) {
      const wantText = fs.readFileSync(jsonPath, 'utf8').replace(/\r\n?/g, '\n').replace(/\s+$/, '');
      jsonEqual = wantText === JSON.stringify(poem, null, 2);
    }
    const ok = linesEqual && stanzasEqual && noHash && keysEqual && noPerPoemDynastyOrder && warnings.length === 0 && jsonEqual === true;
    allOk = allOk && ok;
    rows.push({ file, poem, warnings, meta, linesEqual, stanzasEqual, noHash, keysEqual, noPerPoemDynastyOrder, jsonEqual, ok });
  }
  return { rows, allOk };
}

// ── 告警路径自证 ────────────────────────────────────────────────────────────────

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
  return { warnings, seen: new Set(warnings.map((w) => w.code)) };
}

const EXPECT_CATEGORIES = ['unknown-section', 'duplicate-section', 'fence-heading', 'md-out-of-range'];

/** 顶层方案示意文件：只证明「四个候选都是可解析的 JSON，且差别在顶层与组序上」。 */
function checkTopLevelCandidates() {
  const files = fs.readdirSync(TOPLEVEL_DIR).filter((f) => f.endsWith('.json')).sort();
  const rows = [];
  let ok = files.length >= 4;
  for (const file of files) {
    const doc = JSON.parse(fs.readFileSync(path.join(TOPLEVEL_DIR, file), 'utf8'));
    const poem = doc.poems?.[0] ?? doc.groups?.[0]?.poems?.[0] ?? null;
    const hasRegistry = Array.isArray(doc.dynasties);
    const registryHasOrder = hasRegistry && doc.dynasties.every((d) => typeof d.key === 'string' && typeof d.label === 'string' && Number.isInteger(d.order));
    const nestedGroups = Array.isArray(doc.groups);
    rows.push({
      file,
      topKeys: Object.keys(doc),
      poemKeys: poem === null ? [] : Object.keys(poem),
      hasRegistry,
      registryHasOrder,
      nestedGroups,
      poemCarriesGroupOrder: poem !== null && Number.isInteger(poem.dynastyOrder),
    });
  }
  // 断言：① 注册表案必须带 key/label/order；② 不出现「既没有注册表、也没有任何组序线索」的静默形状。
  const opt1 = rows.find((r) => r.file.startsWith('option-1'));
  const opt3 = rows.find((r) => r.file.startsWith('option-3'));
  if (opt1 && !(opt1.hasRegistry && opt1.registryHasOrder)) ok = false;
  if (opt3 && !opt3.nestedGroups) ok = false;
  return { rows, ok };
}

// ── CLI ─────────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);

if (argv[0] === '--print-json') {
  const { poem } = buildPoem(path.join(SAMPLES_DIR, argv[1]));
  process.stdout.write(JSON.stringify(poem, null, 2) + '\n');
} else if (argv[0] === '--parse') {
  const target = argv[1];
  const { poem, warnings } = buildPoem(target);
  console.log(`# --parse ${rel(target)}`);
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
  console.log('a-route-v2 字段稿材料 —— 演示脚本输出（**演示用，不是编译器**；样例 JSON 不是正式产物）');
  console.log(line);
  // 只打印**相对当前目录**的路径，避免把机器上的绝对路径写进输出（整轮搬迁后这行仍可读）。
  console.log(`仓库根（从脚本目录向上查找 ${ROOT_MARKER} 得到）：${path.relative(process.cwd(), REPO_ROOT) || '.'}`);
  console.log('');

  const { rows, allOk } = selfCheck();

  // 1) 逐诗逐行 ＋ 分段 ＋ 缺省 ＋ 键序
  console.log('① 自检：正文切分不污染（逐行相等）／分段保真／键序／缺省／声明范围内的 Markdown');
  console.log('-'.repeat(104));
  console.log('文件'.padEnd(32) + '诗行 段数 每段  逐行 分段 #头 键序 无旧键 详情 笔记 告警 JSON');
  for (const r of rows) {
    console.log(
      r.file.padEnd(32) +
        String(r.poem.stanzas.flat().length).padEnd(5) +
        String(r.poem.stanzas.length).padEnd(5) +
        `[${r.poem.stanzas.map((s) => s.length).join('/')}]`.padEnd(6) +
        (r.linesEqual ? '是' : '否←失败').padEnd(5) +
        (r.stanzasEqual ? '是' : '否←失败').padEnd(5) +
        (r.noHash ? '0' : '有←失败').padEnd(4) +
        (r.keysEqual ? '是' : '否←失败').padEnd(5) +
        (r.noPerPoemDynastyOrder ? '是' : '否←失败').padEnd(7) +
        (r.poem[DETAIL_KEY] === null ? 'null' : '文本').padEnd(5) +
        (r.poem.notes === null ? 'null' : '文本').padEnd(5) +
        String(r.warnings.length).padEnd(5) +
        (r.jsonEqual === null ? '缺' : r.jsonEqual ? '一致' : '不一致←失败'),
    );
  }
  console.log('-'.repeat(104));
  console.log(`自检：${allOk ? '通过（真实《行行重行行》8 行逐行相等、单段；多段夹具 3 段保真；键序＝本稿草案；缺省如预期；样例 0 告警）' : '存在失败'}`);
  console.log('');

  // 2) `dynasty` 单值：产物里没有三份、也没有 era；组序是**编译期查表**得来的
  console.log('② `dynasty` 单值之后：诗对象里只剩一个中文 `dynasty`（组序不在诗里，由编译期查表）');
  console.log('-'.repeat(104));
  console.log('文件'.padEnd(32) + 'dynasty 组序(编译期查表) 诗对象里有 dynastyKey/Label/Order/era？');
  for (const r of rows) {
    console.log(
      r.file.padEnd(32) +
        String(r.poem.dynasty).padEnd(8) +
        String(r.meta.groupOrder).padEnd(16) +
        (r.noPerPoemDynastyOrder ? '没有（本稿如此）' : '有←失败'),
    );
  }
  console.log('  说明：组序**不是**作者写在每首诗里的字段；它是编译期按 `dynasty` 查注册表得到的。');
  console.log('  它最终进不进产物、以什么形状进 —— 本稿**并列方案、不自行定**（见 top-level-dynasties.md）。');
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

  // 4) 已删除的旧键还在源文件里 ⇒ 必须响
  console.log('④ 本稿已删除的键还在源文件里 ⇒ 响（fixtures-ambiguous/removed-keys.md）');
  console.log('-'.repeat(104));
  const removed = buildPoem(path.join(AMBIG_DIR, 'removed-keys.md'));
  const removedHits = removed.warnings.filter((w) => w.code === 'removed-key');
  console.log(`  ${rel(path.join(AMBIG_DIR, 'removed-keys.md'))} ⇒ 告警 ${removed.warnings.length} 条，其中 removed-key ${removedHits.length} 条：`);
  for (const w of removed.warnings) console.log(`  - [${w.code}] ${w.msg}`);
  const removedOk = removedHits.length >= 2;
  console.log(`  ${removedOk ? '响' : '不响←失败'}  removed-key（≥2：era 与 dynastyOrder）`);
  console.log('');

  // 5) 歧义夹具文件（真实文件，供 --parse 非零退出演示）
  console.log('⑤ 歧义夹具文件（fixtures-ambiguous/ambiguous-detail.md）会响');
  console.log('-'.repeat(104));
  const ambFile = path.join(AMBIG_DIR, 'ambiguous-detail.md');
  const amb = buildPoem(ambFile);
  console.log(`  ${rel(ambFile)} ⇒ 告警 ${amb.warnings.length} 条：`);
  for (const w of amb.warnings) console.log(`  - [${w.code}] ${w.msg}`);
  console.log('  （单跑 `--parse fixtures-ambiguous/ambiguous-detail.md` 会**非零退出**，见下方自证）');
  console.log('');

  // 6) 顶层方案示意：四个候选都是可解析的 JSON，差别在顶层与组序
  console.log('⑥ 顶层 `dynasties` 的候选示意（top-level-candidates/*.json：**方案示意，不是产物**）');
  console.log('-'.repeat(104));
  const top = checkTopLevelCandidates();
  for (const r of top.rows) {
    console.log(`  ${r.file}`);
    console.log(`      顶层键：${r.topKeys.join(', ')}`);
    console.log(`      诗对象键：${r.poemKeys.join(', ')}`);
    console.log(`      顶层注册表：${r.hasRegistry ? (r.registryHasOrder ? '有（key/label/order 齐）' : '有但缺 key/label/order') : '无'}；两层 groups：${r.nestedGroups ? '有' : '无'}；诗里带组序整数：${r.poemCarriesGroupOrder ? '是' : '否'}`);
  }
  console.log(`  ${top.ok ? '四个候选都可解析、且各自形状不同（本演示不对哪个更好表态）' : '存在失败←有一个候选形状不符合它自己声称的做法'}`);
  console.log('');

  console.log(line);
  const ok = allOk && proofOk && removedOk && amb.warnings.length > 0 && top.ok;
  console.log(ok ? '全部自检通过。' : '存在失败项，见上方「←失败」。');
  if (!ok) process.exitCode = 1;
  console.log('提醒：本演示**只覆盖本稿已约定的写法**；仍未定的东西（`source` 归属 / `detail` 字段名与缺省语义 /');
  console.log('      `id` 归谁产生 / `## 详情` 分界 / 重复与未知节 / 围栏里的 `##` / 最小 Markdown 范围 /');
  console.log('      顶层 `dynasties` 与组序 / 删 `era` 的迁移）见 undecided.md、top-level-dynasties.md、era-removal.md。');
  console.log(line);
}
