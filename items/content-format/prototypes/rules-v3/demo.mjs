// ⚠️⚠️ 演示用，不是编译器。⚠️⚠️
//
// 本脚本只回答一件事：**rules-v3 这一稿**（用户 2026-10-15 已确认的 4 条规则）的源 MD
// **解析成什么形状**、缺省怎么写、遇到「未定／非法／已删除」的构造**会不会响**。
//
// 硬边界（与 AGENTS.md 一致）：
//   - 它**只读**本目录（`samples/`、`fixtures/`、`fixtures-invalid/`、`json/`），
//     **绝不**读 `content/`，**绝不**读 `tools/`，**绝不写任何东西**（连日志文件都不写）。
//   - 它**不是** `tools/` 里的正式编译器：解析规则是刻意写小的一段；正式解析/校验/错误码
//     仍以 `tools/` 与 `docs/design/content-contract.md` 为准（本材料**不改** `tools/`）。
//   - 它打印的 JSON 是**样例**，**不是**正式 `dist/content.json`，不参与发布。
//   - 凡「未定／非法／已被删掉」的构造一律**告警并计数**（宁可响，不许静默）。
//   - **仓库根不写死层级**：从脚本所在目录向上查找 `prototype/css/theme-tech.css` 定位仓库根；
//     找不到就抛错（上一稿曾写死 `join(OUT,'..','..','..')`，整轮搬进 history/ 后就指到了 items/）。
//
// 用户 2026-10-15 已确认的 4 条规则（本脚本照它实现）：
//   ① 产物顶层带**有序朝代列表**：**中文值数组**（如 `"dynasties": ["汉"]`）；客户端照这个序，
//      **不从 `poems` 首次出现顺序推断**。
//   ② **ID 由文件名生成**（去掉 `.md`）；源 MD **不再手填 `id`**。
//   ③ `notes`／`detail` **缺失可以写 `null`**（**保留键**）；界面不显示 `null`；无笔记时隐藏整个笔记区。
//   ④ **固定分界**：前面是元数据（front matter）、后面是原文；`## 详情`／`## 笔记` 是**节**；
//      缺节可以不写。
//
// ⚠️ 规则 ④ 里「没被用户逐项批准」的细则（未知节／重复节／围栏里的 `##`／空节／最小 Markdown 范围）
//    在本脚本里按 `unapproved-details.md` 的**单一建议**实现，**只是为了让「会响」可运行**，
//    **不是已采纳规则**：未知节/重复节/围栏/越界写法一律**报错并非零退出**；空节＝缺失＝`null`。
//
// 用法：
//   node <本脚本>                                      # 自检 + 自证（含目录组织候选），正常 EXIT=0
//   node <本脚本> --print-json <本目录下的 md 路径>      # 只把该文件的顶层 JSON 打到 stdout
//   node <本脚本> --parse <任意 md 路径>                # 解析那一个文件；有告警 ⇒ 打印告警并**非零退出**
//   node <本脚本> --scan <本目录下的目录>               # 递归扫描一棵内容树；有错误 ⇒ 打印并**非零退出**
//
// 告警分类（每类都可单独断言「会响」）：
//   forbidden-id-key   源里写了 `id:`（规则 ② 已改为由文件名生成）
//   removed-key        源里写了已删除的旧键（era／dynastyOrder／dynastyKey／dynastyLabel／variants）
//   unknown-fm-key     front matter 出现约定之外的键
//   missing-required-key  必填键缺失（title／author／dynasty／source）
//   undeclared-dynasty `dynasty` 不在演示注册表里（正式口径见契约 §1.3：DYNASTY_UNDECLARED）
//   unknown-section    未知的 `## X`（不是「详情」「笔记」）
//   duplicate-section  同一个 `## 名称` 出现两次
//   fence-present      节内出现代码围栏（最小 Markdown 范围**不含**围栏）
//   fence-heading      代码围栏内部出现形如 `## ` 的行 —— **不算分界**，但必须响
//   unclosed-fence     围栏没有闭合
//   md-out-of-range    详情/笔记里用了「声明的最小 Markdown 支持范围」之外的写法
//
// 目录组织（rules-v3.md §7；**候选，不是已采纳**）的告警分类：
//   symlink-in-content   内容树里出现符号链接（不跟随、也不静默跳过）
//   non-md-in-content    内容树里出现非 .md 文件
//   duplicate-basename   案 A 下 basename 重复（NFC＋小写后）
//   unreadable-dir       目录读不了

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SAMPLES_DIR = path.join(HERE, 'samples');
const FIXTURES_DIR = path.join(HERE, 'fixtures');
const INVALID_DIR = path.join(HERE, 'fixtures-invalid');
const JSON_DIR = path.join(HERE, 'json');
const TREE_DIR = path.join(HERE, 'name-tree-fixture');

// ── 仓库根：**不写死层级**，从脚本所在目录向上查找一个只在仓库根存在的标记文件 ──────────────
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

// ── 本稿的规则常量（改一处即可对照 `rules-v3.md`） ────────────────────────────────
/** 顶层键序（规则 ①：`dynasties` 在 `poems` 之前；客户端照数组序，不推断）。 */
const TOP_KEYS = ['formatVersion', 'contentVersion', 'generatedAt', 'dynasties', 'poems'];
/** 每首诗 canonical 键序（`item.md` 已获用户认可的 10 键清单顺序）。 */
const POEM_KEYS = ['id', 'title', 'author', 'dynasty', 'genre', 'source', 'orderInSource', 'detail', 'stanzas', 'notes'];
/** 节名：只有这两个是已知节（规则 ④）。 */
const KNOWN_SECTIONS = ['详情', '笔记'];
/** front matter 允许的键（**没有 `id`** —— 规则 ②）。 */
const KNOWN_FM_KEYS = ['title', 'author', 'dynasty', 'genre', 'orderInSource', 'source'];
/** 已删除的旧键：源里再出现就响。 */
const REMOVED_FM_KEYS = ['dynastyKey', 'dynastyLabel', 'dynastyOrder', 'era', 'variants'];
/** 演示用的最小必填集合。 */
const FM_REQUIRED = ['title', 'author', 'dynasty', 'source'];
/**
 * 演示用的**极小**「组序注册表」：只够本目录样例用（只有「汉」一首诗的朝代）。
 * 正式注册表在 `tools/lib/dynasties.mjs`（本材料**不读**它，也不改它）。
 * ⚠️ 它只用来演示「组序是**编译期查表**得来的、不是作者写在每首诗里的」。
 */
const DYNASTY_ORDER_DEMO = new Map([['汉', 100]]);
/** 顶层非诗字段（样例值：内容版本用本地派生形状示意「不是发布版」）。 */
const SAMPLE_TOP = {
  formatVersion: 2, // 字段集相对 formatVersion=1 变过 ⇒ 按已定 B 规则必须升；⚠️ 本材料不执行升版，只如实写一次（见 rules-v3.md §6）
  contentVersion: '0.0.0-dev+000000000000',
  generatedAt: '2026-10-16T00:00:00Z',
};

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
    if (key === 'id') {
      warnings.push({ code: 'forbidden-id-key', file, msg: 'front matter 写了 `id`（规则 ② 已改为**由文件名生成 ID**，源 MD 不再手填 `id`）' });
    } else if (REMOVED_FM_KEYS.includes(key)) {
      warnings.push({ code: 'removed-key', file, msg: `front matter 写了本稿已删除的键「${key}」（旧格式字段只是现状，不是新稿默认值）` });
    } else if (!KNOWN_FM_KEYS.includes(key)) {
      warnings.push({ code: 'unknown-fm-key', file, msg: `front matter 出现约定之外的键「${key}」` });
    }
    data[key] = stripQuotes(m[2] ?? '');
    has.add(key);
  }
  for (const key of FM_REQUIRED) {
    if (!has.has(key)) warnings.push({ code: 'missing-required-key', file, msg: `缺必填键「${key}」` });
  }
  return data;
}

// 正文切分：**切分点 ＝ 行首恰好 `## ` 后跟非空名字**（`###` 不匹配）。
// 围栏：**先跟踪围栏状态**（``` 或 ~~~ 开闭配对）。围栏内的 `##` **不算分界**；
// 且最小 Markdown 范围**不含围栏** ⇒ 出现围栏行本身就报错。未闭合围栏也报错。
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
      if (fenceM && fenceM[1][0] === fence[0]) fence = null; // 闭合围栏本身归入当前节
      else if (/^##\s+\S/.test(line)) {
        warnings.push({ code: 'fence-heading', file, msg: `代码围栏内部出现形如「${line.trim().slice(0, 40)}」的节标题 —— **不算分界**，但必须响` });
      }
      (cur === null ? poem : cur.lines).push(raw);
      continue;
    }
    if (fenceM) {
      fence = fenceM[1];
      warnings.push({ code: 'fence-present', file, msg: `出现代码围栏（最小 Markdown 范围**不含**围栏）：${JSON.stringify(line.trim().slice(0, 20))}` });
      (cur === null ? poem : cur.lines).push(raw);
      continue;
    }
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) {
      const name = h[1].trim();
      if (!KNOWN_SECTIONS.includes(name)) {
        warnings.push({ code: 'unknown-section', file, msg: `未知的节「## ${name}」（不是 详情/笔记）⇒ 建议＝报错` });
      }
      if (seen.has(name)) {
        warnings.push({ code: 'duplicate-section', file, msg: `重复的节「## ${name}」⇒ 建议＝报错（绝不静默覆盖）` });
      }
      seen.add(name);
      cur = { name, lines: [] };
      sections.push(cur);
      continue;
    }
    (cur === null ? poem : cur.lines).push(raw); // 空行保留（空行＝分段信息）
  }
  if (fence !== null) warnings.push({ code: 'unclosed-fence', file, msg: '代码围栏没有闭合（会静默吞节 ⇒ 必须响）' });
  const joinSection = (name) => {
    const s = sections.find((x) => x.name === name);
    if (s === undefined) return null; // 缺节 ⇒ null（规则 ③）
    const text = s.lines.join('\n').trim();
    return text === '' ? null : text; // 空节 ⇒ 缺失 ⇒ null（unapproved-details §3 的建议）
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

// 「最小 Markdown 支持范围」——按 `unapproved-details.md §4` 的**单一建议**：
//   允许：段落、无序列表 `- `、有序列表 `1. `、粗体 `**…**`、斜体 `*…*`、三级标题 `### `、引用 `> `
//   越界：表格、`####`+、`#`/`##` 标题、图片、行首 HTML、脚注、任务列表、链接、行内代码、围栏
function mdOutOfRangeReason(line) {
  const s = line.replace(/\s+$/, '');
  const t = s.trim();
  if (/^\s*\|/.test(s)) return '表格行（`| … |`）';
  if (/^#{4,}\s/.test(t)) return '标题层级超过 `###`';
  if (/^#{1,2}\s/.test(t)) return '`#`/`##` 标题（`##` 只作节分界，`#` 不支持）';
  if (/^!\s*\[/.test(t)) return '图片（`![]()`）';
  if (/^<[A-Za-z/!]/.test(t)) return '行首 HTML 标签';
  if (/^\[\^/.test(t)) return '脚注（`[^…]`）';
  if (/^\s*[-*+]\s+\[[ xX]\]/.test(s)) return '任务列表（`- [ ]`）';
  if (/\[[^\]\n]*\]\([^)\n]*\)/.test(t)) return '链接（`[文字](url)`）';
  if (/`/.test(t)) return '行内代码（`` ` ``）';
  return null;
}

function scanMdRange(text, label, file, warnings) {
  if (text === null) return;
  let inFence = false;
  text.split('\n').forEach((raw, i) => {
    const line = raw.replace(/\s+$/, '');
    if (/^\s*(`{3,}|~{3,})/.test(line)) { inFence = !inFence; return; } // 围栏行与围栏内内容已由 splitBody 报 fence-present/fence-heading
    if (inFence || line.trim() === '') return;
    const reason = mdOutOfRangeReason(line);
    if (reason) {
      warnings.push({ code: 'md-out-of-range', file, msg: `${label} 节内第 ${i + 1} 行用了声明范围之外的写法（${reason}）：${JSON.stringify(line.trim().slice(0, 40))}` });
    }
  });
}

const asInt = (v) => (v === undefined || v === null || v === '' ? null : Number(v));

/** 解析一份源 MD ⇒ { doc（顶层 JSON 形状）、poem、warnings、meta }。 */
function buildDoc(file) {
  const warnings = [];
  const lines = readLines(file);
  const { fm, body } = splitFrontMatter(lines, file);
  const f = parseFrontMatter(fm, file, warnings);
  const sec = splitBody(body, file, warnings);
  const detail = sec.joinSection('详情');
  const notes = sec.joinSection('笔记');
  scanMdRange(detail, '## 详情', file, warnings);
  scanMdRange(notes, '## 笔记', file, warnings);

  if (f.dynasty && !DYNASTY_ORDER_DEMO.has(f.dynasty)) {
    warnings.push({ code: 'undeclared-dynasty', file, msg: `「${f.dynasty}」不在演示注册表里（正式口径：契约 §1.3 DYNASTY_UNDECLARED）` });
  }

  // 规则 ②：ID 由文件名生成（去掉 .md）。源里的 `id:` 只报错、不采信。
  const id = path.basename(file).replace(/\.md$/, '');

  const poem = {};
  poem.id = id;
  poem.title = f.title ?? null;
  poem.author = f.author ?? null;
  poem.dynasty = f.dynasty ?? null;
  poem.genre = f.genre || null;
  poem.source = f.source ?? null;
  poem.orderInSource = asInt(f.orderInSource);
  poem.detail = detail;
  poem.stanzas = buildStanzas(sec.poem);
  poem.notes = notes;

  // 规则 ①：顶层有序朝代列表＝**中文值数组**，编译期按注册表 order 排好；
  // 客户端照这个序，**不从 `poems` 首次出现顺序推断**。
  const present = new Set([poem.dynasty].filter(Boolean));
  const dynasties = [...present].sort(
    (a, b) => (DYNASTY_ORDER_DEMO.get(a) ?? Number.MAX_SAFE_INTEGER) - (DYNASTY_ORDER_DEMO.get(b) ?? Number.MAX_SAFE_INTEGER),
  );

  const doc = {};
  doc.formatVersion = SAMPLE_TOP.formatVersion;
  doc.contentVersion = SAMPLE_TOP.contentVersion;
  doc.generatedAt = SAMPLE_TOP.generatedAt;
  doc.dynasties = dynasties;
  doc.poems = [poem];

  return { doc, poem, warnings, meta: { poemLines: sec.poem.filter((l) => l.trim() !== ''), sectionNames: sec.sectionNames } };
}

// ── 自检 ────────────────────────────────────────────────────────────────────────
const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function selfCheck() {
  const valid = [
    ...fs.readdirSync(SAMPLES_DIR).filter((f) => f.endsWith('.md')).map((f) => path.join(SAMPLES_DIR, f)),
    ...fs.readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('.md')).map((f) => path.join(FIXTURES_DIR, f)),
  ].sort();
  const rows = [];
  let allOk = true;
  for (const file of valid) {
    const { doc, poem, warnings, meta } = buildDoc(file);
    const name = path.basename(file);
    const hasNote = name.includes('with-note');
    const wantDetail = name.includes('full'); // 只有 full 那份应当有详情节
    const linesEqual = deepEqual(poem.stanzas.flat(), REAL_8);
    const singleStanza = poem.stanzas.length === 1;
    const keysEqual = deepEqual(Object.keys(poem), POEM_KEYS);
    const topKeysEqual = deepEqual(Object.keys(doc), TOP_KEYS);
    const dynastiesAreChineseStrings = Array.isArray(doc.dynasties) && doc.dynasties.every((d) => typeof d === 'string') && deepEqual(doc.dynasties, ['汉']);
    const idFromFilename = poem.id === name.replace(/\.md$/, '');
    const noHandKeys = !('era' in poem) && !('dynastyKey' in poem) && !('dynastyLabel' in poem) && !('dynastyOrder' in poem) && !('variants' in poem);
    const detailOk = wantDetail ? typeof poem.detail === 'string' : poem.detail === null;
    const notesOk = hasNote ? typeof poem.notes === 'string' && poem.notes !== '' : poem.notes === null;
    let jsonEqual = null;
    const jsonPath = path.join(JSON_DIR, name.replace(/\.md$/, '.json'));
    if (fs.existsSync(jsonPath)) {
      const wantText = fs.readFileSync(jsonPath, 'utf8').replace(/\r\n?/g, '\n').replace(/\s+$/, '');
      jsonEqual = wantText === JSON.stringify(doc, null, 2);
    }
    const noHash = meta.poemLines.every((l) => !/^#/.test(l));
    const ok = linesEqual && singleStanza && keysEqual && topKeysEqual && dynastiesAreChineseStrings && idFromFilename && noHandKeys && detailOk && notesOk && jsonEqual === true && warnings.length === 0 && noHash;
    allOk = allOk && ok;
    rows.push({ file, name, doc, poem, warnings, jsonEqual, ok, topKeysEqual, keysEqual, singleStanza, linesEqual, dynastiesAreChineseStrings, idFromFilename, noHandKeys, detailOk, notesOk, noHash });
  }
  return { rows, allOk };
}

/** 每一份故意非法的夹具，预期至少响这一类。 */
const EXPECT_INVALID = {
  'invalid-unknown-section.md': ['unknown-section'],
  'invalid-duplicate-section.md': ['duplicate-section'],
  'invalid-fence-heading.md': ['fence-present', 'fence-heading'],
  'invalid-unclosed-fence.md': ['fence-present', 'unclosed-fence'],
  'invalid-md-out-of-range.md': ['md-out-of-range'],
  'invalid-has-id-key.md': ['forbidden-id-key'],
};

function invalidSelfProof() {
  const rows = [];
  let ok = true;
  for (const [name, codes] of Object.entries(EXPECT_INVALID)) {
    const file = path.join(INVALID_DIR, name);
    const { doc, warnings } = buildDoc(file);
    const seen = new Set(warnings.map((w) => w.code));
    const missing = codes.filter((c) => !seen.has(c));
    const good = warnings.length > 0 && missing.length === 0;
    ok = ok && good;
    rows.push({ name, warnings, ok: good, missing, doc });
  }
  return { rows, ok };
}

// ── 目录组织扫描（候选；见 rules-v3.md §7） ──────────────────────────────────
// 扫描规则（每条都是 `rules-v3.md §7.4` 的**单一建议**，不是已采纳规则）：
//   忽略并计数：点开头的隐藏文件/目录、`~$`/`~` 临时文件、下划线开头（`_`）＝非内容约定、`README.md`
//   报错（非零退出）：符号链接、非 `.md` 文件、规范化（NFC＋小写）后重复的 basename、读不了的目录
//   忽略并计数：没有任何内容文件的目录（空目录 / 只剩被排除项）
// ⚠ 现状对照：`tools/build-content.mjs` 的 `readRecords`（第 114–140 行）**只读直接子文件**、
//   **不递归**，且用 `d.isFile()` 把符号链接**静默过滤掉**（`isFile()` 对 symlink 为 false）。
//   本材料**不改** `tools/`；这里只演示「要支持目录，扫描方式必须改」以及改完后的边界行为。

const isHidden = (name) => name.startsWith('.');
const isTemp = (name) => name.startsWith('~$') || name.endsWith('~');
const isNonContent = (name) => name.startsWith('_');
const isReadme = (name) => name.toLowerCase() === 'readme.md';
const isMd = (name) => name.toLowerCase().endsWith('.md');
const normKey = (s) => s.normalize('NFC').toLowerCase();

/** 把 fs.Dirent 折成一个可复用的纯描述符（这样合成用例与真实目录走同一条规则）。 */
function direntToEntry(e) {
  const kind = e.isSymbolicLink() ? 'symlink' : e.isDirectory() ? 'dir' : e.isFile() ? 'file' : 'other';
  return { name: e.name, kind };
}

/** 对**一层**条目应用本节的扫描规则。合成用例与真实目录都走这个函数。 */
function classifyEntries(entries, rel) {
  const files = [];
  const excluded = [];
  const errors = [];
  const subdirs = [];
  for (const e of entries) {
    const childRel = rel ? `${rel}/${e.name}` : e.name;
    // 排除规则**先于**类型判断：隐藏/临时目录也整体跳过（不进目录）
    if (isHidden(e.name)) { excluded.push({ relPath: childRel, reason: '隐藏文件/目录（点开头）' }); continue; }
    if (isTemp(e.name)) { excluded.push({ relPath: childRel, reason: '临时文件（`~$` 前缀或 `~` 后缀）' }); continue; }
    if (e.kind === 'symlink') { errors.push({ code: 'symlink-in-content', relPath: childRel, msg: '内容树里出现符号链接（不跟随；也不静默跳过）' }); continue; }
    if (isNonContent(e.name)) { excluded.push({ relPath: childRel, reason: '下划线开头＝非内容约定' }); continue; }
    if (isReadme(e.name)) { excluded.push({ relPath: childRel, reason: 'README/说明文件' }); continue; }
    if (e.kind === 'dir') { subdirs.push({ name: e.name, relPath: childRel }); continue; }
    if (e.kind === 'file') {
      if (isMd(e.name)) files.push({ name: e.name, relPath: childRel });
      else errors.push({ code: 'non-md-in-content', relPath: childRel, msg: `内容树里出现非 .md 文件「${e.name}」⇒ 报错（多半是笔误，忽略会静默丢内容）` });
      continue;
    }
    errors.push({ code: 'unknown-entry-type', relPath: childRel, msg: `无法识别的条目类型：${e.kind}` });
  }
  return { files, excluded, errors, subdirs };
}

/** 递归扫描一棵内容树，返回文件/排除项/错误/空目录。 */
function scanTree(rootDir) {
  const acc = { files: [], excluded: [], errors: [], emptyDirs: [] };
  const walk = (dir, rel) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true }).map(direntToEntry);
    } catch (e) {
      acc.errors.push({ code: 'unreadable-dir', relPath: rel || '.', msg: e.message });
      return;
    }
    const c = classifyEntries(entries, rel);
    for (const f of c.files) acc.files.push({ ...f });
    acc.excluded.push(...c.excluded);
    acc.errors.push(...c.errors);
    for (const d of c.subdirs) {
      const before = acc.files.length;
      walk(path.join(dir, d.name), d.relPath);
      if (acc.files.length === before) acc.emptyDirs.push(d.relPath);
    }
  };
  walk(rootDir, '');
  acc.files.sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0));
  // 案 A：basename 必须在**全库**唯一（按 NFC＋小写比较）
  const byBase = new Map();
  for (const f of acc.files) {
    const base = f.name.replace(/\.md$/i, '');
    const k = normKey(base);
    if (!byBase.has(k)) byBase.set(k, []);
    byBase.get(k).push({ f, base });
  }
  for (const [, group] of byBase) {
    if (group.length > 1) {
      acc.errors.push({
        code: 'duplicate-basename',
        relPath: group.map((g) => g.f.relPath).join(' 与 '),
        msg: `案 A 下 basename「${group[0].base}」重复（NFC＋小写后）：${group.length} 处 ⇒ 案 A 无法为它们生成不同 ID`,
      });
    }
  }
  return acc;
}

/** 案 A：ID ＝ basename 去 `.md`。 */
const idCaseA = (f) => f.name.replace(/\.md$/i, '');
/** 案 B：ID ＝ 相对路径去 `.md`（路径分隔符统一为 `/`）。 */
const idCaseB = (f) => f.relPath.replace(/\.md$/i, '');

/** 真实 19 首的旧 ID（硬编码字符串，不读 `content/`；核对见 `id-migration.md`）。 */
const OLD_IDS = ['gushi-shijiu-shou-01', 'gushi-shijiu-shou-02', 'gushi-shijiu-shou-06'];

function renderTree(rootDir) {
  const lines = [];
  const walk = (dir, prefix) => {
    const entries = fs
      .readdirSync(dir, { withFileTypes: true })
      .map((e) => ({ name: e.name, isDir: e.isDirectory() }))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    entries.forEach((e, i) => {
      const last = i === entries.length - 1;
      lines.push(`${prefix}${last ? '└─' : '├─'} ${e.name}${e.isDir ? '/' : ''}`);
      if (e.isDir) walk(path.join(dir, e.name), `${prefix}${last ? '   ' : '│  '}`);
    });
  };
  walk(rootDir, '      ');
  return lines;
}

/** 目录组织自证：候选布局 + 三种变化 + 边界规则。 */
function directorySelfProof() {
  const layouts = ['layout-1-cn-dir', 'layout-2-flat', 'layout-3-pinyin-dir', 'layout-4-cn-basename'];
  const rows = [];
  let ok = true;
  const expectedCaseA = { 'layout-1-cn-dir': OLD_IDS, 'layout-2-flat': OLD_IDS, 'layout-3-pinyin-dir': OLD_IDS };
  for (const name of layouts) {
    const root = path.join(TREE_DIR, name);
    const scan = scanTree(root);
    const want = expectedCaseA[name];
    const caseAOk = want === undefined ? true : JSON.stringify(scan.files.map(idCaseA).sort()) === JSON.stringify([...want].sort());
    const good = scan.errors.length === 0 && caseAOk;
    ok = ok && good;
    rows.push({ name, scan, caseAOk, ok: good });
  }

  // 三种变化（具体示例）
  const flat = scanTree(path.join(TREE_DIR, 'layout-2-flat')).files.find((f) => f.name === 'gushi-shijiu-shou-01.md');
  const inDir = scanTree(path.join(TREE_DIR, 'layout-1-cn-dir')).files.find((f) => f.name === 'gushi-shijiu-shou-01.md');
  const move = { stable: idCaseA(flat) === idCaseA(inDir), caseA: idCaseA(flat), caseB_flat: idCaseB(flat), caseB_dir: idCaseB(inDir) };
  const renamed = { from: idCaseA({ name: 'gushi-shijiu-shou-01.md' }), to: idCaseA({ name: 'gushi-shijiu-shou-001.md' }) };

  // 边界：真实夹具
  const exclusions = scanTree(path.join(TREE_DIR, 'exclusions-ok'));
  const nonmd = scanTree(path.join(TREE_DIR, 'invalid-nonmd'));
  const dupBase = scanTree(path.join(TREE_DIR, 'invalid-dup-basename'));

  // 边界：合成条目列表（同一条规则；符号链接/大小写/Unicode 形无法在 Windows 上做真实文件夹具）
  const synth = {
    symlink: classifyEntries([{ name: 'gushi-shijiu-shou-01.md', kind: 'symlink' }], '汉'),
    caseOnly: classifyEntries([{ name: 'XingXing.md', kind: 'file' }, { name: 'xingxing.md', kind: 'file' }], '汉'),
    unicodeNfd: classifyEntries([{ name: 'café.md', kind: 'file' }, { name: 'cafe\u0301.md', kind: 'file' }], '汉'),
  };
  const synthDup = (r) => r.files.length === 2 && dupErrors(r).length > 0;
  const dupErrors = (r) => {
    const g = new Map();
    for (const f of r.files) {
      const k = normKey(f.name.replace(/\.md$/i, ''));
      g.set(k, (g.get(k) ?? 0) + 1);
    }
    return [...g.values()].filter((n) => n > 1);
  };

  const boundaryOk =
    exclusions.errors.length === 0 &&
    exclusions.excluded.length === 4 &&
    exclusions.emptyDirs.length === 1 &&
    nonmd.errors.some((e) => e.code === 'non-md-in-content') &&
    dupBase.errors.some((e) => e.code === 'duplicate-basename') &&
    synth.symlink.errors.some((e) => e.code === 'symlink-in-content') &&
    synthDup(synth.caseOnly) &&
    synthDup(synth.unicodeNfd);
  ok = ok && boundaryOk;

  return { rows, move, renamed, exclusions, nonmd, dupBase, synth, synthDup: { caseOnly: synthDup(synth.caseOnly), unicodeNfd: synthDup(synth.unicodeNfd) }, boundaryOk, ok };
}

// ── CLI ─────────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);

if (argv[0] === '--print-json') {
  const { doc, warnings } = buildDoc(path.resolve(argv[1]));
  process.stdout.write(JSON.stringify(doc, null, 2) + '\n');
  if (warnings.length > 0) {
    for (const w of warnings) process.stderr.write(`[${w.code}] ${w.msg}\n`);
    process.exitCode = 1;
  }
} else if (argv[0] === '--scan') {
  const root = path.resolve(argv[1]);
  const scan = scanTree(root);
  console.log(`# --scan ${rel(root)}`);
  console.log('');
  console.log(`内容文件 ${scan.files.length} 份：`);
  for (const f of scan.files) console.log(`  ${f.relPath}  ⇒ 案A id=${idCaseA(f)} / 案B id=${idCaseB(f)}`);
  console.log(`\n排除（忽略并计数）${scan.excluded.length} 项：`);
  for (const x of scan.excluded) console.log(`  ${x.relPath}  [${x.reason}]`);
  console.log(`\n空目录/只剩被排除项的目录 ${scan.emptyDirs.length} 个：${scan.emptyDirs.join(', ') || '（无）'}`);
  console.log(`\n错误 ${scan.errors.length} 条：`);
  for (const e of scan.errors) console.log(`  - [${e.code}] ${e.relPath}: ${e.msg}`);
  if (scan.errors.length > 0) {
    console.log('⇒ 有错误：进程非零退出（宁可响，不许静默）。');
    process.exitCode = 1;
  } else {
    console.log('⇒ 0 错误。');
  }
} else if (argv[0] === '--parse') {
  const target = argv[1];
  const { doc, warnings } = buildDoc(target);
  console.log(`# --parse ${rel(target)}`);
  console.log('');
  console.log(JSON.stringify(doc, null, 2));
  console.log('');
  console.log(`告警 ${warnings.length} 条：`);
  for (const w of warnings) console.log(`  - [${w.code}] ${w.msg}`);
  if (warnings.length > 0) {
    console.log('⇒ 有告警：进程非零退出（宁可响，不许静默）。');
    process.exitCode = 1;
  } else {
    console.log('⇒ 0 告警。');
  }
} else if (argv[0] !== undefined) {
  console.error(`不认识的参数：${argv[0]}（用 --print-json <file> 或 --parse <file>）`);
  process.exitCode = 2;
} else {
  const line = '='.repeat(104);
  console.log(line);
  console.log('rules-v3 规则稿材料 —— 演示脚本输出（**演示用，不是编译器**；样例 JSON 不是正式产物）');
  console.log(line);
  // 只打印**相对当前目录**的路径，避免把机器绝对路径写进输出（整轮搬迁后这行仍可读）。
  console.log(`仓库根（从脚本目录向上查找 ${ROOT_MARKER} 得到）：${path.relative(process.cwd(), REPO_ROOT) || '.'}`);
  console.log('');

  const { rows, allOk } = selfCheck();
  const dir = directorySelfProof();

  console.log('① 自检：逐行正文切分不污染／顶层与每首键序／ID 由文件名／dynasties 中文数组／缺省 null／逐字节比对');
  console.log('-'.repeat(104));
  console.log('文件'.padEnd(28) + '诗行 段数 顶层键序 每首键序 ID=文件名 dynasties 规则③无旧键 详情 笔记 告警 JSON');
  for (const r of rows) {
    console.log(
      r.name.padEnd(28) +
        String(r.poem.stanzas.flat().length).padEnd(5) +
        String(r.poem.stanzas.length).padEnd(5) +
        (r.topKeysEqual ? '是' : '否←失败').padEnd(9) +
        (r.keysEqual ? '是' : '否←失败').padEnd(9) +
        (r.idFromFilename ? '是' : '否←失败').padEnd(10) +
        (r.dynastiesAreChineseStrings ? '["汉"]' : '否←失败').padEnd(10) +
        (r.noHandKeys ? '是' : '否←失败').padEnd(10) +
        (r.poem.detail === null ? 'null' : '文本').padEnd(5) +
        (r.poem.notes === null ? 'null' : '文本').padEnd(5) +
        String(r.warnings.length).padEnd(5) +
        (r.jsonEqual === null ? '缺' : r.jsonEqual ? '一致' : '不一致←失败'),
    );
  }
  console.log('-'.repeat(104));
  console.log(`自检：${allOk ? '通过（真实《行行重行行》8 行逐行相等、单段；键序＝本稿；缺省如预期；样例 0 告警；3 份 json 逐字节一致）' : '存在失败'}`);
  console.log('');

  console.log('② 规则 ① 自证：顶层 `dynasties` 是**中文值数组**，紧随其后才是 `poems`（客户端照数组序，从不首次出现推断）');
  console.log('-'.repeat(104));
  const first = rows[0];
  console.log(`  顶层键序：${Object.keys(first.doc).join(', ')}`);
  console.log(`  dynasties＝${JSON.stringify(first.doc.dynasties)}（元素类型：${first.doc.dynasties.map((d) => typeof d).join('/')}）`);
  console.log('  说明：元素是**中文字符串**，不是 {key,label,order} 对象；`dynasty` 是**源值**，`dynasties` 是**编译期产出的有序数组**。');
  console.log('');

  console.log('③ 规则 ② 自证：ID 由文件名生成、源里不再手填 `id`');
  console.log('-'.repeat(104));
  for (const r of rows) console.log(`  ${r.name.padEnd(28)} ⇒ id＝${r.poem.id}`);
  console.log('  （源样本 front matter **没有** `id:` 键；多写一个 `id:` 会踩 ④ 的 forbidden-id-key 而非静默采信）');
  console.log('');

  console.log('④ 故意非法的输入必须「响」并**非零退出**');
  console.log('-'.repeat(104));
  const inv = invalidSelfProof();
  for (const r of inv.rows) {
    console.log(`  ${r.ok ? '响' : '不响←失败'}  ${r.name}  ⇒ 告警 ${r.warnings.length} 条：${r.warnings.map((w) => w.code).join(', ')}`);
    for (const w of r.warnings) console.log(`        - [${w.code}] ${w.msg}`);
    if (!r.ok) console.log(`        （缺少预期告警：${r.missing.join(', ')}）`);
  }
  console.log('  实跑单份（见 README §4 与 demo-output.txt）：`--parse <夹具>` 会打印上面这些告警并**非零退出**。');
  console.log('');

  console.log('⑤ 目录组织候选自证（见 rules-v3.md §7）：目录树 → 文件名 → ID（真相：`--scan` 打的就是这一套）');
  console.log('-'.repeat(104));
  for (const r of dir.rows) {
    console.log(`  【${r.name}】${r.scan.errors.length === 0 ? '' : '←有错误'}${r.caseAOk ? '' : '←案A id 与旧 ID 不符'}（--scan name-tree-fixture/${r.name} 可复跑）`);
    for (const line of renderTree(path.join(TREE_DIR, r.name))) console.log(line);
    console.log('      → 案A id / 案B id：');
    for (const f of r.scan.files) console.log(`        ${f.relPath}  ⇒  A=${idCaseA(f)}   B=${idCaseB(f)}`);
    for (const e of r.scan.errors) console.log(`        - [${e.code}] ${e.relPath}: ${e.msg}`);
  }
  console.log(`  小结：${dir.rows.every((r) => r.ok) ? '四个候选布局都扫得通；案A 的 ID ＝ 旧 ID（零迁移）' : '存在失败'}`);
  console.log('');

  console.log('⑤b 三种变化（具体示例）');
  console.log('-'.repeat(104));
  console.log(`  ① 移动目录：gushi-shijiu-shou-01.md 从平铺移入 汉/ ⇒ 案A id ${dir.move.caseA}（不变＝旧链接不断）／案B id ${dir.move.caseB_flat} → ${dir.move.caseB_dir}（变＝旧链接断）  ${dir.move.stable ? '（实测：案A id 不变）' : '←失败'}`);
  console.log(`  ② 改文件名：gushi-shijiu-shou-01.md → gushi-shijiu-shou-001.md ⇒ 案A id ${dir.renamed.from} → ${dir.renamed.to}（ID 跟着变 ⇒ 旧深链接 断）`);
  console.log(`  ③ 重复 basename：invalid-dup-basename/{汉,魏晋}/行行重行行.md ⇒ 案A 报错 ${dir.dupBase.errors.filter((e) => e.code === 'duplicate-basename').length} 条（案B 会给两个不同 ID）`);
  console.log('');

  console.log('⑤c 安全边界（每条一个建议；真实夹具 + 合成条目列表走同一函数）');
  console.log('-'.repeat(104));
  console.log(`  排除并计数（exclusions-ok）：错误 ${dir.exclusions.errors.length} 条，排除 ${dir.exclusions.excluded.length} 项，空目录 ${dir.exclusions.emptyDirs.length} 个`);
  for (const x of dir.exclusions.excluded) console.log(`        - 排除 ${x.relPath}  [${x.reason}]`);
  for (const d of dir.exclusions.emptyDirs) console.log(`        - 空目录（忽略并计数）${d}`);
  console.log(`  非 .md（invalid-nonmd）：${dir.nonmd.errors.map((e) => e.code).join(', ') || '不响←失败'}`);
  console.log(`  符号链接（合成条目）：${dir.synth.symlink.errors.map((e) => e.code).join(', ') || '不响←失败'}`);
  console.log(`  仅大小写不同（合成条目）：${dir.synthDup.caseOnly ? '当作重复并报错' : '不响←失败'}`);
  console.log(`  Unicode 形不同（NFC/NFD，合成条目）：${dir.synthDup.unicodeNfd ? '当作重复并报错' : '不响←失败'}`);
  console.log(`  小结：${dir.boundaryOk ? '边界规则自证通过' : '存在失败←'}`);
  console.log('');

  console.log(line);
  const ok = allOk && inv.ok && dir.ok;
  console.log(ok ? '全部自检通过。' : '存在失败项，见上方「←失败」。');
  if (!ok) process.exitCode = 1;
  console.log('提醒：本演示**只覆盖本稿已约定/已建议的写法**；未批细则的**单一建议**见 unapproved-details.md，');
  console.log('      源/派生分工见 source-vs-derived.md，文件名 ID 迁移核查见 id-migration.md。');
  console.log(line);
}
