#!/usr/bin/env node
// ⚠️⚠️ 演示用，不是编译器。⚠️⚠️
//
// 本脚本只回答一件事：**rules-v4 这一稿**（语法/细则层面的建议）的源 MD
//   ① 解析成什么形状（每个块 → 两端预期效果）；
//   ② 合法写法怎么写、非法写法会报什么（**每一行诊断原文**）；
//   ③ 未知节 / 重复节 / 空节 / 围栏里的 `##` 分别怎么判；
//   ④ 朝代组名精确校验 vs 别名。
//
// 硬边界（与 AGENTS.md 一致）：
//   - **只读**本目录（`samples/`、`fixtures/`、`fixtures-invalid/`、`json/`、`expectations.json`
//     与本文档自己的几个 .md）。**不读** `content/`／`tools/`／`web/`／`android/` 的内容；
//     为核实「两端预期」里引用的依据文件还在，只对它们做一次**存在性 stat**（不读内容）。
//   - **自身不写任何文件**（连日志都不写）。`json/*.json` 是用 `--emit` 的 stdout 在 **shell 里**
//     重定向生成的；`--parse/--emit` 只接受本目录内的路径（越界 ⇒ 用法错误，EXIT 2）。
//   - 它不是 `tools/` 里的正式编译器：解析规则是刻意写小的一段；正式解析/校验/错误码
//     仍以 `tools/` 与 `docs/design/content-contract.md` 为准（本材料**不改** `tools/`）。
//   - 打印的 JSON 是**样例**，不是正式 `dist/content.json`，不参与发布；`formatVersion` 是**示意值**。
//   - 凡「非法」构造一律**报错并计数**（宁可响，不许静默）；**一行一码**：同一行同时越界多种写法时
//     只报优先级最高的那一种，避免刷屏。
//   - **仓库根不写死层级**：从脚本所在目录向上查找 `prototype/css/theme-tech.css` 定位仓库根；
//     找不到就抛错（上一轮曾写死相对层级，整轮搬进 history/ 后就指错了）。
//
// 用法：
//   node demo.mjs                                   # 自检 + 自证（含两端预期投影），正常 EXIT=0
//   node demo.mjs --effects [本目录内的 md]          # 只打印「块 → 两端预期」投影，EXIT=0
//   node demo.mjs --parse <本目录内的 md>            # 解析那一个文件；有错误 ⇒ 打印诊断并 EXIT=1
//   node demo.mjs --emit <本目录内的 md>             # 只把顶层 JSON 打到 stdout（生成 json/*.json 用）
//   node demo.mjs --all-invalid                     # 逐个解析 fixtures-invalid/*，打印诊断原文，EXIT=1
//   node demo.mjs --dump-diagnostics                # 夹具 + 合成用例能产生的**全部**诊断原文（供文档逐字引用），EXIT=0
//   node demo.mjs --codes                           # 打印错误码表（code / 何时触发 / 配的夹具）
//   node demo.mjs --verify-docs                     # 断言 *.md 里逐字引用的诊断原文确实由本文产生
//
// 退出码：0 = 一切如预期；1 = 有错误诊断（或自检失败）；2 = 命令行用法错误（含越界路径）。

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SAMPLES_DIR = path.join(HERE, 'samples');
const FIXTURES_DIR = path.join(HERE, 'fixtures');
const INVALID_DIR = path.join(HERE, 'fixtures-invalid');
const JSON_DIR = path.join(HERE, 'json');
const EXPECT_FILE = path.join(HERE, 'expectations.json');
const DOC_FILES = ['README.md', 'legal-sample-and-effects.md', 'md-subset.md', 'sections.md', 'dynasty-groups.md'];

// ── 仓库根：不写死层级 ─────────────────────────────────────────────────────────
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
const rel = (p) => path.relative(REPO_ROOT, p).split(path.sep).join('/');
const relFrom = (root, p) => path.relative(root, p).split(path.sep).join('/');

// ── 组名注册表（**镜像**；正式唯一来源是 tools/lib/dynasties.mjs，本脚本按边界不读它）──
const DYNASTY_LABELS = ['先秦', '汉', '魏晋', '南北朝', '唐', '宋', '元', '明', '清', '近现代', '未详'];

// ── 最小 Markdown 闭集（本稿的建议）────────────────────────────────────────────
const SUBSET = ['paragraph', 'line-break', 'ul-dash', 'ol-number', 'bold', 'italic', 'h3', 'quote'];

// ── front matter 键集（新格式）───────────────────────────────────────────────
const REQUIRED_KEYS = ['title', 'author', 'dynasty', 'source'];
const OPTIONAL_KEYS = ['genre', 'orderInSource'];
const REMOVED_KEYS = ['dynastyOrder', 'era', 'variants', 'dynastyKey', 'dynastyLabel', 'notes'];
const PRODUCT_KEY_ORDER = ['id', 'title', 'author', 'dynasty', 'genre', 'orderInSource', 'detail', 'stanzas', 'notes'];

// ── 错误码表（本稿口径）──────────────────────────────────────────────────────
const CODES = {
  FRONT_MATTER_MISSING: { what: '文件第一行不是 `---`（没有 front matter）', fixture: null, reason: '防崩用：起始/结束行的规则沿用既有契约，本稿不重开' },
  FRONT_MATTER_UNTERMINATED: { what: 'front matter 没有结束行 `---`', fixture: null, reason: '同上' },
  YAML_UNSUPPORTED: { what: 'front matter 出现子集外写法（行内集合 `{}` / `[a, b]`、非法转义等）', fixture: null, reason: '沿用契约 §1.1，本稿不重开 front matter 语法' },
  UNKNOWN_KEY: { what: 'front matter 出现声明之外的键', fixture: null, reason: '沿用契约 §1.2（`UNKNOWN_KEY`）' },
  BODY_EMPTY: { what: '正文区（原文）为空 ⇒ 没有可读的诗行', fixture: null, reason: '防崩用：沿用契约 §3 的 `BODY_EMPTY`' },
  FORBIDDEN_ID_KEY: { what: '源 MD 写了 `id:`（规则 ② 已改为由相对路径生成）', fixture: 'forbidden-id-key.md' },
  REMOVED_KEY: { what: '源 MD 写了新格式已去掉的旧键（dynastyOrder / era / variants / …）', fixture: 'removed-keys.md' },
  MISSING_REQUIRED_KEY: { what: '必填键缺失（title / author / dynasty / source）', fixture: 'missing-required-key.md' },
  UNKNOWN_SECTION: { what: '`## 名字` 不在 {详情, 笔记} 里', fixture: 'unknown-section.md' },
  DUPLICATE_SECTION: { what: '同一个节名出现 ≥ 2 次', fixture: 'duplicate-section.md' },
  MD_CODE_FENCE: { what: '节内出现代码围栏行（最小范围不含围栏）', fixture: 'fence-with-heading.md' },
  MD_FENCE_UNCLOSED: { what: '围栏没有闭合（必须先跟踪围栏才能报出来）', fixture: 'fence-unclosed.md' },
  MD_HEADING: { what: '行首标题不是恰好三级（`# `、`#### `、`##没空格` 等）', fixture: 'heading-levels.md' },
  MD_TASK_LIST: { what: '任务列表（`- [ ]` / `- [x]`）', fixture: 'out-of-range-inline-and-block.md' },
  MD_TABLE: { what: '表格（行首 `|`）', fixture: 'out-of-range-inline-and-block.md' },
  MD_IMAGE: { what: '图片（`![`）', fixture: 'out-of-range-inline-and-block.md' },
  MD_LINK: { what: '链接（`](`）', fixture: 'out-of-range-inline-and-block.md' },
  MD_INLINE_CODE: { what: '行内代码（反引号）', fixture: 'out-of-range-inline-and-block.md' },
  MD_FOOTNOTE: { what: '脚注（`[^…]`）', fixture: 'out-of-range-inline-and-block.md' },
  MD_HTML: { what: '行首 HTML 标签（`<br>` 等）', fixture: 'out-of-range-inline-and-block.md' },
  MD_STAR_LIST: { what: '`* ` 星号列表（闭集只收 `- `；现状 Web 会把它当列表）', fixture: 'out-of-range-inline-and-block.md' },
  DYNASTY_UNDECLARED: { what: '`dynasty` 的值不等于注册表里任何一个中文组名', fixture: 'dynasty-unknown.md' },
};

// ── 诊断 ────────────────────────────────────────────────────────────────────
function diag(code, file, line, message) {
  return { severity: 'error', code, file: rel(file), line, message };
}
const fmtDiag = (d) => `${d.file}:${d.line}: [${d.code}] ${d.message}`;
/** 把不可见字符写成可见转义（否则「为什么报错」在终端里看不出来）。首/尾空白也写成转义。 */
function vis(s) {
  const esc = (c) => `\\u${c.codePointAt(0).toString(16).padStart(4, '0')}`;
  return String(s)
    .replace(/^[\s\u3000]+|[\s\u3000]+$/g, (m) => [...m].map(esc).join(''))
    .replace(/[\u0000-\u001f\u007f\u00a0\u2000-\u200f\u2028\u2029\u3000]/g, esc);
}

// ── ID：内容根下的完整相对路径去 `.md`、`/` → `-`（用户 2026-10-16 已定 C2）──────────
const idFromRelPath = (relPath) => relPath.replace(/\.md$/i, '').replace(/\//g, '-');
function deriveId(contentRoot, file) {
  return idFromRelPath(relFrom(contentRoot, file));
}
function contentRootFor(file) {
  const p = path.resolve(file);
  const nested = path.join(FIXTURES_DIR, 'nested');
  if (p.startsWith(nested + path.sep)) return nested;
  if (p.startsWith(SAMPLES_DIR + path.sep)) return SAMPLES_DIR;
  if (p.startsWith(FIXTURES_DIR + path.sep)) return FIXTURES_DIR;
  if (p.startsWith(INVALID_DIR + path.sep)) return INVALID_DIR;
  return path.dirname(p);
}

// ── 文本行准备 ──────────────────────────────────────────────────────────────
function toLines(raw) {
  return String(raw).replace(/^\uFEFF/, '').split(/\r\n|\n|\r/);
}
function readLines(file) {
  return toLines(fs.readFileSync(file, 'utf8'));
}

// ── front matter（刻意写小的子集解析器）────────────────────────────────────────
function parseFrontMatter(lines, file, diags) {
  if ((lines[0] ?? '') !== '---') {
    diags.push(diag('FRONT_MATTER_MISSING', file, 1, '文件第一行必须是 `---`（front matter 起始行），当前不是。'));
    return null;
  }
  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') { close = i; break; }
  }
  if (close === -1) {
    diags.push(diag('FRONT_MATTER_UNTERMINATED', file, 1, 'front matter 没有结束行 `---`（从第 1 行一路到文件末尾都没有）。'));
    return null;
  }
  const map = new Map();
  let i = 1;
  while (i < close) {
    const line = lines[i];
    const lineNo = i + 1;
    if (line.trim() === '' || line.trimStart().startsWith('#')) { i += 1; continue; }
    const m = /^([A-Za-z][A-Za-z0-9_-]*)\s*:(.*)$/.exec(line);
    if (!m) {
      diags.push(diag('YAML_UNSUPPORTED', file, lineNo, `front matter 里这一行不是「键: 值」也不是注释：${JSON.stringify(vis(line))}`));
      i += 1;
      continue;
    }
    const key = m[1];
    const rest = m[2].trim();
    if (map.has(key)) {
      diags.push(diag('YAML_UNSUPPORTED', file, lineNo, `front matter 里重复的键：${key}`));
      i += 1;
      continue;
    }
    if (rest === '') {
      const block = [];
      let j = i + 1;
      while (j < close && (lines[j].trim() === '' || /^[ \t]/.test(lines[j]))) { block.push(lines[j]); j += 1; }
      map.set(key, { value: null, raw: block.join('\n'), line: lineNo, kind: 'block' });
      i = j;
      continue;
    }
    if (rest.startsWith('{') || rest.startsWith('[')) {
      if (rest === '[]') {
        map.set(key, { value: [], raw: rest, line: lineNo, kind: 'scalar' });
      } else {
        diags.push(diag('YAML_UNSUPPORTED', file, lineNo, `不支持行内集合写法（请改用缩进列表）：${JSON.stringify(vis(rest))}`));
        map.set(key, { value: null, raw: rest, line: lineNo, kind: 'unsupported' });
      }
      i += 1;
      continue;
    }
    if (rest === '|' || rest === '|-' || rest === '>') {
      const block = [];
      let j = i + 1;
      while (j < close && (lines[j].trim() === '' || /^[ \t]/.test(lines[j]))) { block.push(lines[j].replace(/^ {2}/, '')); j += 1; }
      map.set(key, { value: block.join('\n').trimEnd(), raw: rest, line: lineNo, kind: 'scalar' });
      i = j;
      continue;
    }
    if (rest.startsWith('"')) {
      try {
        map.set(key, { value: JSON.parse(rest), raw: rest, line: lineNo, kind: 'scalar' });
      } catch {
        diags.push(diag('YAML_UNSUPPORTED', file, lineNo, `双引号字符串没闭合或转义非法：${JSON.stringify(vis(rest))}`));
        map.set(key, { value: null, raw: rest, line: lineNo, kind: 'unsupported' });
      }
      i += 1;
      continue;
    }
    if (rest.startsWith("'")) {
      if (rest.length < 2 || !rest.endsWith("'")) {
        diags.push(diag('YAML_UNSUPPORTED', file, lineNo, `单引号字符串没闭合：${JSON.stringify(vis(rest))}`));
        map.set(key, { value: null, raw: rest, line: lineNo, kind: 'unsupported' });
      } else {
        map.set(key, { value: rest.slice(1, -1).replace(/''/g, "'"), raw: rest, line: lineNo, kind: 'scalar' });
      }
      i += 1;
      continue;
    }
    if (/^-?\d+$/.test(rest)) {
      map.set(key, { value: Number(rest), raw: rest, line: lineNo, kind: 'scalar' });
    } else {
      map.set(key, { value: rest, raw: rest, line: lineNo, kind: 'scalar' });
    }
    i += 1;
  }
  return { map, close, bodyStart: close + 1 };
}

function checkFrontMatterKeys(fm, file, diags) {
  for (const [key, rec] of fm) {
    if (key === 'id') {
      diags.push(diag('FORBIDDEN_ID_KEY', file, rec.line, '源 MD 不得写 `id`：ID 由内容根下的相对路径生成（去 `.md`、`/` 统一写成 `-`）。删掉这一行，产物里的 `id` 键仍会保留。'));
      continue;
    }
    if (REMOVED_KEYS.includes(key)) {
      diags.push(diag('REMOVED_KEY', file, rec.line, `新格式已去掉源字段 \`${key}\`（旧格式 formatVersion=1 的写法）。本稿不把它静默转成新字段：请删掉它；要保留的内容改写进 \`## 详情\`。`));
      continue;
    }
    if (!REQUIRED_KEYS.includes(key) && !OPTIONAL_KEYS.includes(key)) {
      diags.push(diag('UNKNOWN_KEY', file, rec.line, `front matter 出现声明之外的键 \`${key}\`。允许的键：${REQUIRED_KEYS.concat(OPTIONAL_KEYS).join(' / ')}。`));
    }
  }
  for (const key of REQUIRED_KEYS) {
    const rec = fm.get(key);
    if (!rec || rec.value === null || rec.value === '') {
      diags.push(diag('MISSING_REQUIRED_KEY', file, 1, `必填键 \`${key}\` 缺失或为空。允许的键：${REQUIRED_KEYS.concat(OPTIONAL_KEYS).join(' / ')}。`));
    }
  }
}

// ── 朝代组名：精确匹配 + 报错时列出全部可用组名（不做别名映射）────────────────────
const dynastyLabelsText = () => DYNASTY_LABELS.join(' / ');
function checkDynasty(fm, file, diags) {
  const rec = fm.get('dynasty');
  if (!rec || typeof rec.value !== 'string') return null;
  const raw = rec.value;
  if (DYNASTY_LABELS.includes(raw)) return raw;
  const norm = raw.normalize('NFC').trim();
  const looksSame = norm !== raw && DYNASTY_LABELS.includes(norm);
  const shown = `\`${vis(raw)}\``;
  const head = looksSame
    ? `dynasty 的值 ${shown} 不等于任何一个组名：去掉首尾空白并按 NFC 归一后是 \`${norm}\`（源里有不可见字符或非 NFC 写法），请把源值照抄成 \`${norm}\`。`
    : `dynasty 的值 ${shown} 不等于任何一个组名（不做别名归一，也不做繁简折叠：「漢」与「汉」在编码上是两个字）。`;
  const tail = `可用组名（按显示次序）：${dynastyLabelsText()}。不做别名映射（\`东汉\` 不会静默归到 \`汉\`，\`三国\` 不会归到 \`魏晋\`）；要新增一个组，必须显式登记进注册表（tools/lib/dynasties.mjs）并同步契约 §1.3 与两端的组名清单。`;
  diags.push(diag('DYNASTY_UNDECLARED', file, rec.line, `${head}${tail}`));
  return null;
}

// ── 行分类（一行一码：顺序＝优先级）──────────────────────────────────────────
function classifyLine(line) {
  if (/^\s*[-*+]\s+\[[ xX]\]\s/.test(line)) return 'task-list';
  if (/^\s*<\/?[A-Za-z][^>]*>/.test(line)) return 'html';
  if (/^\s*#{1,6}/.test(line)) return /^###\s+\S/.test(line) ? 'heading-h3' : 'heading-other';
  if (/^\s*\|/.test(line)) return 'table';
  if (/!\[/.test(line)) return 'image';
  if (/\]\(/.test(line)) return 'link';
  if (/`/.test(line)) return 'inline-code';
  if (/\[\^/.test(line)) return 'footnote';
  if (/^\s*\*\s+\S/.test(line)) return 'star-list';
  if (/^\s*-\s+\S/.test(line)) return 'ul';
  if (/^\s*\d+\.\s+\S/.test(line)) return 'ol';
  if (/^\s*>\s+\S/.test(line)) return 'quote';
  if (line.trim() === '') return 'blank';
  return 'text';
}
const CLASS_TO_CODE = {
  'task-list': 'MD_TASK_LIST',
  html: 'MD_HTML',
  'heading-other': 'MD_HEADING',
  table: 'MD_TABLE',
  image: 'MD_IMAGE',
  link: 'MD_LINK',
  'inline-code': 'MD_INLINE_CODE',
  footnote: 'MD_FOOTNOTE',
  'star-list': 'MD_STAR_LIST',
};
const MD_MESSAGE = {
  MD_HEADING: (line) =>
    /^\s*##(?!#)\S/.test(line)
      ? `这一行看起来是节标题，但 \`##\` 后面缺一个空格（分界要求「行首恰好 \`## \` 后跟非空节名」）：${JSON.stringify(vis(line))}。它会原样留在正文里（不是新节，也不报未知节）—— 请补上空格，或把 \`##\` 删掉。`
      : `节正文里出现不在最小范围里的标题：${JSON.stringify(vis(line))}。最小范围只收行首恰好 \`### \`（三级标题）；\`# \`、\`#### \` 及更深都要报错。`,
  MD_TASK_LIST: (line) => `详情/笔记里出现任务列表：${JSON.stringify(vis(line))}。最小范围不含任务列表；请改成普通列表项（\`- \`）或去掉复选框。`,
  MD_TABLE: (line) => `详情/笔记里出现表格（行首 \`|\`）：${JSON.stringify(vis(line))}。最小范围不含表格（Compose 端要自绘）；请改成段落或列表。`,
  MD_IMAGE: (line) => `详情/笔记里出现图片：${JSON.stringify(vis(line))}。最小范围不含图片（离线应用没有图片资源通道）；请改成文字说明。`,
  MD_LINK: (line) => `详情/笔记里出现链接：${JSON.stringify(vis(line))}。最小范围不含链接（离线应用里点外链的行为未定）；请把地址写成纯文本。`,
  MD_INLINE_CODE: (line) => `详情/笔记里出现反引号（行内代码或代码围栏）：${JSON.stringify(vis(line))}。最小范围不含行内代码与围栏；请改成普通文字。`,
  MD_FOOTNOTE: (line) => `详情/笔记里出现脚注写法：${JSON.stringify(vis(line))}。最小范围不含脚注；请把注释直接写进正文。`,
  MD_HTML: (line) => `详情/笔记行首出现 HTML 标签：${JSON.stringify(vis(line))}。最小范围不含 HTML（两端都不会执行它）；请删掉标签。`,
  MD_STAR_LIST: (line) => `详情/笔记出现 \`* \` 星号列表项：${JSON.stringify(vis(line))}。闭集只收 \`- \`（现状 Web 会把 \`* \` 当列表、Android 不会 ⇒ 两端不一致）；请改用 \`- \`。`,
  MD_CODE_FENCE: (line) => `正文里出现代码围栏：${JSON.stringify(vis(line))}。① 围栏内不算节分界（所以不会另报未知节）；② 最小范围不含围栏，所以这里报错。若确实要贴代码，请先把围栏加进范围并同步两端渲染。`,
  MD_FENCE_UNCLOSED: () => '',
};
function validateMdLine(line, file, lineNo, diags) {
  const cls = classifyLine(line);
  const code = CLASS_TO_CODE[cls];
  if (!code) return null;
  const d = diag(code, file, lineNo, MD_MESSAGE[code](line));
  diags.push(d);
  return d;
}

/**
 * 原文区的行只多一条检查：行首 `#`。
 * 理由：原文区不走 Markdown（诗行里的 `**`、`- ` 都原样保留），但**行首 `#`** 在原文里唯一可能的意思
 * 就是「节标题少打/多打了一个空格」——那种写法会静默变成一行诗（读者看到一个 `##小结`），所以单拎出来报响。
 */
function validateOriginLine(line, file, lineNo, diags) {
  if (/^\s*#/.test(line)) validateMdLine(line, file, lineNo, diags);
}

// ── 解析整份源文件 ──────────────────────────────────────────────────────────
const KNOWN_SECTIONS = ['详情', '笔记'];
function parseSource(file) {
  const diags = [];
  const lines = readLines(file);
  const contentRoot = contentRootFor(file);
  const parsedFm = parseFrontMatter(lines, file, diags);
  if (!parsedFm) {
    return { file, contentRoot, id: deriveId(contentRoot, file), diags, product: null, blocks: [] };
  }
  const { map: fm, close, bodyStart } = parsedFm;
  checkFrontMatterKeys(fm, file, diags);
  const dynasty = checkDynasty(fm, file, diags);

  // 正文：先跟踪围栏，再切节（围栏内的 `##` 不算分界）
  const originLines = [];
  const sections = [];
  let current = null;
  let inFence = false;
  let fenceOpenLine = -1;
  let fenceChar = '';
  const pushContent = (rec) => { (current ? current.content : originLines).push(rec); };

  for (let k = bodyStart; k < lines.length; k++) {
    const line = lines[k];
    const lineNo = k + 1;
    const fenceM = /^\s*(```+|~~~+)/.exec(line);
    if (fenceM) {
      const ch = fenceM[1][0];
      if (!inFence) {
        inFence = true;
        fenceOpenLine = lineNo;
        fenceChar = ch;
        diags.push(diag('MD_CODE_FENCE', file, lineNo, MD_MESSAGE.MD_CODE_FENCE(line)));
      } else if (ch === fenceChar) {
        inFence = false;
      }
      pushContent({ text: line, lineNo });
      continue;
    }
    if (!inFence) {
      const secM = /^##\s+(\S.*)$/.exec(line);
      if (secM) {
        current = { name: secM[1].trim(), line: lineNo, content: [] };
        sections.push(current);
        continue;
      }
    }
    if (current && !inFence) validateMdLine(line, file, lineNo, diags);
    if (!current && !inFence) validateOriginLine(line, file, lineNo, diags);
    pushContent({ text: line, lineNo });
  }
  if (inFence) {
    diags.push(diag('MD_FENCE_UNCLOSED', file, fenceOpenLine, `第 ${fenceOpenLine} 行打开的围栏到文件末尾都没有闭合。必须先跟踪围栏状态才能报出这一条（否则后面所有内容都会被吞进当前节，静默丢内容）。`));
  }

  // 节名判定：未知节 / 重复节
  const seen = new Map();
  for (const sec of sections) {
    const first = seen.get(sec.name);
    if (first === undefined) {
      seen.set(sec.name, sec.line);
    } else {
      diags.push(diag('DUPLICATE_SECTION', file, sec.line, `重复的节标题：\`## ${sec.name}\` 出现 2 次（第 ${first} 行、第 ${sec.line} 行）。本工具不取「后者覆盖前者」也不拼接（两者都会静默丢内容）：请合并成一段，或删掉多余的那一个。`));
    }
    if (!KNOWN_SECTIONS.includes(sec.name)) {
      const known = sections
        .filter((s) => KNOWN_SECTIONS.includes(s.name))
        .map((s) => `\`## ${s.name}\`（第 ${s.line} 行）`);
      diags.push(diag('UNKNOWN_SECTION', file, sec.line, `未知的节标题：\`## ${sec.name}\`（第 ${sec.line} 行）。本格式只认两个节：\`## 详情\`、\`## 笔记\`${known.length ? `；本文件已出现的已知节：${known.join('、')}` : ''}。若确实要新增一个节，请先把它加进契约与两端的节名清单，不要只改源文件。`));
    }
  }

  // 段落与节正文
  const stanzas = buildStanzas(originLines.map((l) => l.text));
  if (stanzas.length === 0) {
    diags.push(diag('BODY_EMPTY', file, bodyStart + 1, '正文区（front matter 之后、第一个 `## ` 之前）没有任何非空行 ⇒ 没有可读的诗行。'));
  }
  const sectionText = new Map();
  for (const sec of sections) {
    const ls = sec.content.map((c) => c.text);
    while (ls.length && ls[0].trim() === '') ls.shift();
    while (ls.length && ls[ls.length - 1].trim() === '') ls.pop();
    sectionText.set(sec, ls.length ? ls.join('\n') : null);
  }
  const detailSec = sections.find((s) => s.name === '详情');
  const notesSec = sections.find((s) => s.name === '笔记');
  const detail = detailSec ? sectionText.get(detailSec) : null;
  const notes = notesSec ? sectionText.get(notesSec) : null;

  // 块清单（用于「每个块都有两端预期」的覆盖断言）
  const blocks = [{ kind: 'frontmatter', from: 1, to: close + 1, note: `${close + 1} 行` }];
  let stanzaFrom = bodyStart + 1;
  const stanzaSpans = buildStanzaSpans(originLines);
  stanzaSpans.forEach((sp, i) => blocks.push({ kind: 'stanza', index: i + 1, from: sp.from, to: sp.to, note: `${sp.to - sp.from + 1} 行` }));
  for (const sec of sections) {
    const first = sec.content.length ? sec.content[0].lineNo : sec.line;
    const last = sec.content.length ? sec.content[sec.content.length - 1].lineNo : sec.line;
    blocks.push({ kind: `section:${sec.name}`, from: sec.line, to: last, note: `${sec.content.length} 行内容（第 ${first}–${last} 行）`, known: KNOWN_SECTIONS.includes(sec.name) });
  }

  const usedLabels = [...new Set([dynasty].filter(Boolean))]
    .sort((a, b) => DYNASTY_LABELS.indexOf(a) - DYNASTY_LABELS.indexOf(b));
  const product = {
    formatVersion: 2, // ⚠ 示意值：正式注册的仍是 1，本材料不升 formatVersion
    contentVersion: '0.0.0-dev+rules-v4',
    generatedAt: '2026-10-16T00:00:00Z',
    dynasties: usedLabels,
    poems: [
      orderedPoem({
        id: deriveId(contentRoot, file),
        title: str(fm.get('title')?.value),
        author: str(fm.get('author')?.value),
        dynasty: dynasty ?? str(fm.get('dynasty')?.value),
        genre: fm.get('genre')?.value ?? null,
        orderInSource: fm.get('orderInSource')?.value ?? null,
        detail,
        stanzas,
        notes,
      }),
    ],
  };

  diags.sort((a, b) => a.line - b.line || a.code.localeCompare(b.code));
  return { file, contentRoot, id: product.poems[0].id, diags, product, blocks, sections, sectionText, originLines };
}
const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
function orderedPoem(p) {
  const out = {};
  for (const k of PRODUCT_KEY_ORDER) out[k] = p[k];
  return out;
}
function buildStanzas(lines) {
  const out = [];
  let cur = [];
  for (const line of lines) {
    if (line.trim() === '') {
      if (cur.length) { out.push(cur); cur = []; }
    } else {
      cur.push(line);
    }
  }
  if (cur.length) out.push(cur);
  return out;
}
function buildStanzaSpans(originLines) {
  const spans = [];
  let start = null;
  let end = null;
  for (const l of originLines) {
    if (l.text.trim() === '') {
      if (start !== null) { spans.push({ from: start, to: end }); start = null; end = null; }
    } else {
      if (start === null) start = l.lineNo;
      end = l.lineNo;
    }
  }
  if (start !== null) spans.push({ from: start, to: end });
  return spans;
}

// ── 语法行使探测（用于「每样语法都在某份合法样例里真出现过」的覆盖断言）────────────
function usedConstructs(parsed) {
  const used = new Set();
  const seq = [];
  for (const sec of parsed.sections) {
    if (!KNOWN_SECTIONS.includes(sec.name)) continue;
    for (const c of sec.content) seq.push(c.text);
  }
  let prevText = false;
  for (let i = 0; i < seq.length; i++) {
    const line = seq[i];
    const cls = classifyLine(line);
    const isText = cls === 'text';
    if (isText && prevText) used.add('line-break');
    prevText = isText;
    if (isText) used.add('paragraph');
    if (cls === 'ul') used.add('ul-dash');
    if (cls === 'ol') used.add('ol-number');
    if (cls === 'quote') used.add('quote');
    if (cls === 'heading-h3') used.add('h3');
    const withoutBold = line.replace(/\*\*[^*]+\*\*/g, '');
    if (/\*\*[^*]+\*\*/.test(line)) used.add('bold');
    if (/\*[^*\n]+\*/.test(withoutBold)) used.add('italic');
  }
  return used;
}

// ── 夹具的期望码集（每个码都要有可跑样例 ⇒ 这里就是那个账本）─────────────────────
const FIXTURE_EXPECT = {
  'forbidden-id-key.md': ['FORBIDDEN_ID_KEY'],
  'removed-keys.md': ['REMOVED_KEY', 'REMOVED_KEY', 'REMOVED_KEY'],
  'missing-required-key.md': ['MISSING_REQUIRED_KEY'],
  'unknown-section.md': ['UNKNOWN_SECTION'],
  'duplicate-section.md': ['DUPLICATE_SECTION'],
  'fence-with-heading.md': ['MD_CODE_FENCE'],
  'fence-unclosed.md': ['MD_CODE_FENCE', 'MD_FENCE_UNCLOSED'],
  'heading-levels.md': ['MD_HEADING', 'MD_HEADING'],
  'out-of-range-inline-and-block.md': ['MD_TASK_LIST', 'MD_TABLE', 'MD_TABLE', 'MD_IMAGE', 'MD_LINK', 'MD_INLINE_CODE', 'MD_FOOTNOTE', 'MD_HTML', 'MD_STAR_LIST'],
  'dynasty-unknown.md': ['DYNASTY_UNDECLARED'],
  'dynasty-traditional.md': ['DYNASTY_UNDECLARED'],
  'dynasty-space.md': ['DYNASTY_UNDECLARED'],
};

const LEGAL = [
  { file: path.join(SAMPLES_DIR, 'real-01-full.md'), json: 'real-01-full.json' },
  { file: path.join(SAMPLES_DIR, 'real-01-text-only.md'), json: 'real-01-text-only.json' },
  { file: path.join(FIXTURES_DIR, 'md-subset-legal-fixture.md'), json: 'md-subset-legal-fixture.json' },
  { file: path.join(FIXTURES_DIR, 'empty-and-blank-sections.md'), json: 'empty-and-blank-sections.json' },
  { file: path.join(FIXTURES_DIR, 'nested', '夹具集', '夹具首.md'), json: '夹具集-夹具首.json' },
];

// ── 合成字符串检查（**不是文件**）：理由写在输出里 ───────────────────────────────
function syntheticCases() {
  const cases = [];
  const mk = (label, why, text, file) => cases.push({ label, why, text: Array.isArray(text) ? text.join('\n') : text, file });
  mk(
    '笔记节里只有空白字符',
    '文件里保留不了不可见字符（编辑器/工具会悄悄去掉尾部空格）⇒ 用合成字符串验「空白节也算空节」',
    ['---', 'title: "夹具"', 'author: "佚名"', 'dynasty: "汉"', 'source: "夹具：不是真实数据。"', '---', '', '夹具正文一行。', '', '## 笔记', '   ', '\t', ''].join('\n'),
    path.join(FIXTURES_DIR, '<合成字符串>.md'),
  );
  mk(
    '`##` 后面缺空格',
    '分界要求「行首恰好 `## ` 后跟非空节名」⇒ 缺空格的 `##详情` 不是节，而是正文里的一句话',
    ['---', 'title: "夹具"', 'author: "佚名"', 'dynasty: "汉"', 'source: "夹具：不是真实数据。"', '---', '', '夹具正文一行。', '', '##详情'],
    path.join(FIXTURES_DIR, '<合成字符串>.md'),
  );
  mk(
    '原文里的 `**` 不是粗体',
    '正文（原文）不走 Markdown：诗行里的 `**` 原样保留，两端都不许当粗体渲染',
    ['---', 'title: "夹具"', 'author: "佚名"', 'dynasty: "汉"', 'source: "夹具：不是真实数据。"', '---', '', '**这一段是诗行，不是粗体。**'],
    path.join(FIXTURES_DIR, '<合成字符串>.md'),
  );
  mk(
    '组名是另一个字（繁体）',
    '繁简是两个字、不是编码差异 ⇒ 报错（与 dynasty-traditional.md 同口径，这里证明它对合成输入同样成立）',
    ['---', 'title: "夹具"', 'author: "佚名"', 'dynasty: "漢"', 'source: "夹具：不是真实数据。"', '---', '', '夹具正文一行。'],
    path.join(FIXTURES_DIR, '<合成字符串>.md'),
  );
  return cases;
}
function parseSynthetic(c) {
  const diags = [];
  const lines = toLines(c.text);
  const parsedFm = parseFrontMatter(lines, c.file, diags);
  if (!parsedFm) return { diags, product: null, blocks: [] };
  const { map: fm, close, bodyStart } = parsedFm;
  checkFrontMatterKeys(fm, c.file, diags);
  const dynasty = checkDynasty(fm, c.file, diags);
  const originLines = [];
  const sections = [];
  let current = null;
  for (let k = bodyStart; k < lines.length; k++) {
    const line = lines[k];
    const lineNo = k + 1;
    const secM = /^##\s+(\S.*)$/.exec(line);
    if (secM) {
      current = { name: secM[1].trim(), line: lineNo, content: [] };
      sections.push(current);
      continue;
    }
    if (current) validateMdLine(line, c.file, lineNo, diags);
    if (!current) validateOriginLine(line, c.file, lineNo, diags);
    (current ? current.content : originLines).push({ text: line, lineNo });
  }
  const stanzas = buildStanzas(originLines.map((l) => l.text));
  const sectionText = new Map();
  for (const sec of sections) {
    const ls = sec.content.map((x) => x.text);
    while (ls.length && ls[0].trim() === '') ls.shift();
    while (ls.length && ls[ls.length - 1].trim() === '') ls.pop();
    sectionText.set(sec, ls.length ? ls.join('\n') : null);
  }
  const notesSec = sections.find((s) => s.name === '笔记');
  diags.sort((a, b) => a.line - b.line || a.code.localeCompare(b.code));
  return {
    diags,
    product: { dynasty, stanzas, notes: notesSec ? sectionText.get(notesSec) : null },
    blocks: [],
  };
}

// ── expectations.json ──────────────────────────────────────────────────────
function loadExpectations() {
  return JSON.parse(fs.readFileSync(EXPECT_FILE, 'utf8'));
}

// ── 打印工具 ────────────────────────────────────────────────────────────────
const OUT = [];
const log = (s = '') => OUT.push(s);
const flush = () => { process.stdout.write(OUT.join('\n')); if (OUT.length) process.stdout.write('\n'); OUT.length = 0; };
function printDiags(diags, indent = '  ') {
  for (const d of diags) log(`${indent}${fmtDiag(d)}`);
}
function printProduct(product) {
  log(JSON.stringify(product, null, 2).split('\n').map((l) => `  ${l}`).join('\n'));
}

// ── 「块 → 两端预期」投影 ─────────────────────────────────────────────────────
function printEffects(parsed, exp) {
  const byKind = new Map(exp.blocks.map((b) => [b.kind, b]));
  log('── 块 → 两端预期（每条预期都指向只读核到的依据文件；文件的『存在性』由 --verify 检查）──');
  for (const b of parsed.blocks) {
    const e = byKind.get(b.kind);
    log();
    log(`【块 ${b.kind}${b.index ? ` #${b.index}` : ''}】第 ${b.from}–${b.to} 行（${b.note}）`);
    if (!e) { log('  ⚠ 这一块在 expectations.json 里没有条目'); continue; }
    log(`  源     : ${e.source}`);
    log(`  产物   : ${e.product}`);
    log(`  Web    : ${e.web.current}`);
    log(`           要改：${e.web.required}`);
    log(`  Android: ${e.android.current}`);
    log(`           要改：${e.android.required}`);
    log(`  依据   : ${e.web.evidence.concat(e.android.evidence).join(' ; ')}`);
    // 节块：把节里用到的语法逐样列出来
    if (b.kind.startsWith('section:')) {
      const sec = parsed.sections.find((s) => s.name === b.kind.slice('section:'.length));
      if (sec) {
        const ids = new Set();
        const seq = sec.content.map((c) => c.text);
        let prevText = false;
        for (const line of seq) {
          const cls = classifyLine(line);
          const isText = cls === 'text';
          if (isText) { ids.add('paragraph'); if (prevText) ids.add('line-break'); }
          prevText = isText;
          if (cls === 'ul') ids.add('ul-dash');
          if (cls === 'ol') ids.add('ol-number');
          if (cls === 'quote') ids.add('quote');
          if (cls === 'heading-h3') ids.add('h3');
          if (/\*\*[^*]+\*\*/.test(line)) ids.add('bold');
          if (/\*[^*\n]+\*/.test(line.replace(/\*\*[^*]+\*\*/g, ''))) ids.add('italic');
        }
        const list = SUBSET.filter((id) => ids.has(id));
        log(`  这块用到的语法（各一条两端预期见 md-subset.md）: ${list.length ? list.join(' / ') : '（无：这一节是空的或只有纯文本）'}`);
      }
    }
  }
}

function printConstructTable(exp) {
  log('── 最小 Markdown 闭集：每样语法的两端预期（汇总；逐条细节见 md-subset.md）──');
  for (const c of exp.constructs) {
    log();
    log(`【${c.id}】${c.syntax}`);
    log(`  渲染       : ${c.renders}`);
    log(`  合法样例   : ${c.legalIn.join('、')}`);
    log(`  Web 现状   : ${c.web.current}`);
    log(`  Web 要改   : ${c.web.required}`);
    log(`  Android现状: ${c.android.current}`);
    log(`  Android要改: ${c.android.required}`);
    if (c.invalid) log(`  非法样例   : ${c.invalid.fixture} → [${c.invalid.code}]（诊断原文逐字见 md-subset.md）`);
  }
  log();
  log('── 明确排除（出现即报错 ⇒ 两端不需要渲染分支）──');
  for (const x of exp.excluded) {
    log();
    log(`【${x.id}】${x.syntax} ⇒ [${x.code}]（夹具：${x.fixture}）`);
    log(`  Web 现状   : ${x.web.current}`);
    log(`  Web 要改   : ${x.web.required}`);
    log(`  Android现状: ${x.android.current}`);
    log(`  Android要改: ${x.android.required}`);
  }
}

// ── 自检账本 ────────────────────────────────────────────────────────────────
let PASS = 0;
let FAIL = 0;
const failures = [];
function check(ok, label, detail = '') {
  if (ok) { PASS += 1; log(`  ✓ ${label}`); } else { FAIL += 1; failures.push(label); log(`  ✗ ${label}${detail ? ` —— ${detail}` : ''}`); }
}

// ── 模式：--parse ──────────────────────────────────────────────────────────
function modeParse(target) {
  const abs = path.resolve(target);
  if (!abs.startsWith(HERE + path.sep)) {
    process.stderr.write(`用法错误：本演示只读本目录（${rel(HERE)}），不接受目录外的路径：${target}\n`);
    return 2;
  }
  const parsed = parseSource(abs);
  log(`── 解析 ${rel(abs)} ──`);
  log(`   id（由内容根 ${rel(parsed.contentRoot)} 下的相对路径派生）: ${parsed.id}`);
  log('   blocks:');
  for (const b of parsed.blocks) log(`     [${b.from}..${b.to}] ${b.kind}${b.index ? `#${b.index}` : ''}  ${b.note}`);
  log('   product（中间结果，仅供参考；有错误时不会写产物）：');
  if (parsed.product) printProduct(parsed.product);
  else log('     （无法构建：front matter 不完整）');
  if (parsed.diags.length) {
    process.stdout.write(OUT.join('\n') + '\n');
    OUT.length = 0;
    process.stderr.write(`\n✗ ${parsed.diags.length} 项错误（不写产物、非零退出）：\n`);
    for (const d of parsed.diags) process.stderr.write(`  ${fmtDiag(d)}\n`);
    return 1;
  }
  log('');
  log('✓ 0 项错误');
  flush();
  return 0;
}

// ── 模式：--emit ───────────────────────────────────────────────────────────
function modeEmit(target) {
  const abs = path.resolve(target);
  if (!abs.startsWith(HERE + path.sep)) {
    process.stderr.write(`用法错误：本演示只读本目录（${rel(HERE)}），不接受目录外的路径：${target}\n`);
    return 2;
  }
  const parsed = parseSource(abs);
  process.stdout.write(JSON.stringify(parsed.product, null, 2) + '\n');
  return 0;
}

// ── 模式：--effects / --codes / --all-invalid ───────────────────────────────
function modeEffects(target) {
  const abs = path.resolve(target ?? path.join(SAMPLES_DIR, 'real-01-full.md'));
  const parsed = parseSource(abs);
  const exp = loadExpectations();
  log(`── 两端预期投影：${rel(abs)}（幂等、只读）──`);
  printEffects(parsed, exp);
  log();
  printConstructTable(exp);
  const code = parsed.diags.length ? 1 : 0;
  flush();
  return code;
}
function modeCodes() {
  log('── 错误码表（本稿口径；`配的夹具` 列就是「这个码的可跑样例」）──');
  log('code'.padEnd(26) + '| 何时触发');
  for (const k of Object.keys(CODES)) {
    log(`${k.padEnd(26)}| ${CODES[k].what}${CODES[k].fixture ? `（夹具：fixtures-invalid/${CODES[k].fixture}）` : `（本稿不配夹具：${CODES[k].reason}）`}`);
  }
  flush();
  return 0;
}
function allFixtureResults() {
  return Object.keys(FIXTURE_EXPECT).map((name) => {
    const file = path.join(INVALID_DIR, name);
    return { name, file, parsed: parseSource(file) };
  });
}
function modeDumpDiagnostics() {
  for (const x of collectAllDiagnostics()) {
    log(`${x.where}\n  ${x.line}`);
  }
  flush();
  return 0;
}
function modeAllInvalid() {
  let total = 0;
  for (const r of allFixtureResults()) {
    log(`── fixtures-invalid/${r.name}  期望码集：${FIXTURE_EXPECT[r.name].join(', ')} ──`);
    if (!r.parsed.diags.length) log('  ⚠ 没有任何诊断（这本身就是失败）');
    printDiags(r.parsed.diags);
    log('');
    total += r.parsed.diags.length;
  }
  log(`合计 ${total} 条诊断，覆盖 ${Object.keys(FIXTURE_EXPECT).length} 份夹具 ⇒ 本模式按「故意非法输入必须非零退出」返回 1。`);
  flush();
  return 1;
}

// ── 诊断全集（夹具 + 合成），供 --verify-docs 与 --all-invalid 交叉核对 ─────────────
function collectAllDiagnostics() {
  const all = [];
  for (const r of allFixtureResults()) {
    for (const d of r.parsed.diags) all.push({ where: `夹具 fixtures-invalid/${r.name}`, line: fmtDiag(d) });
  }
  for (const c of syntheticCases()) {
    const parsed = parseSynthetic(c);
    for (const d of parsed.diags) all.push({ where: `合成 ${c.label}（${c.why}）`, line: fmtDiag(d) });
  }
  return all;
}

// ── 模式：--verify-docs ────────────────────────────────────────────────────
function modeVerifyDocs() {
  const all = collectAllDiagnostics();
  const known = new Set(all.map((x) => x.line));
  let bad = 0;
  let quoted = 0;
  for (const name of DOC_FILES) {
    const file = path.join(HERE, name);
    if (!fs.existsSync(file)) { log(`✗ 文档缺失：${name}`); bad += 1; continue; }
    const lines = toLines(fs.readFileSync(file, 'utf8'));
    let inFence = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
      if (!inFence) continue;
      if (!/: \[[A-Z_]+\] /.test(line)) continue;
      quoted += 1;
      if (!known.has(line.trim())) {
        log(`✗ ${name}:${i + 1} 引用的诊断原文与演示输出不一致（逐字要求）：`);
        log(`    ${line.trim()}`);
        bad += 1;
      }
    }
  }
  log(`文档里逐字引用的诊断原文共 ${quoted} 条；对不上的 ${bad} 条。（演示一共能产生 ${all.length} 条诊断：夹具 ${all.filter((x) => x.where.startsWith('夹具')).length} 条 + 合成 ${all.filter((x) => x.where.startsWith('合成')).length} 条。）`);
  flush();
  return bad ? 1 : 0;
}

// ── 自检 ───────────────────────────────────────────────────────────────────
function runSelfCheck() {
  const exp = loadExpectations();
  log('══ rules-v4 自检：合法样例 / 非法夹具 / 两端预期覆盖 / 依据文件 / EXIT 码 ══');
  log();
  log(`仓库根（由 prototype/css/theme-tech.css 向上查找，不写死层级）：${rel(REPO_ROOT) || '.'}（就是工作树根）`);
  log(`本目录：${rel(HERE)}`);
  log();

  // ① 合法样例
  log('① 合法样例：解析、逐字节比对 json/*.json、块覆盖');
  const parsedLegal = [];
  for (const item of LEGAL) {
    const parsed = parseSource(item.file);
    parsedLegal.push(parsed);
    const errs = parsed.diags.map(fmtDiag);
    check(errs.length === 0, `${rel(item.file)} 解析无错误`, errs.join(' | '));
    const jsonPath = path.join(JSON_DIR, item.json);
    const norm = (s) => s.replace(/\r\n/g, '\n').replace(/\s+$/, '');
    const emitted = norm(JSON.stringify(parsed.product, null, 2));
    if (!fs.existsSync(jsonPath)) {
      check(false, `${rel(item.file)} ↔ json/${item.json} 逐字节一致`, 'json 文件不存在（用 --emit 生成）');
    } else {
      const expected = norm(fs.readFileSync(jsonPath, 'utf8'));
      check(expected === emitted, `${rel(item.file)} ↔ json/${item.json} 逐字节一致`, expected === emitted ? '' : '两边不一致（跑 node demo.mjs --emit ' + rel(item.file) + ' 对比）');
    }
  }
  log();

  // ② 块覆盖（双向）
  log('② 「每个块都有两端预期」双向覆盖');
  const declaredKinds = new Set(exp.blocks.map((b) => b.kind));
  const legalKinds = new Set(parsedLegal.flatMap((p) => p.blocks.map((b) => b.kind)));
  for (const k of legalKinds) check(declaredKinds.has(k), `合法样例里出现的块 ${k} 在 expectations.json 有条目`);
  for (const k of declaredKinds) check(legalKinds.has(k), `expectations.json 的块 ${k} 在合法样例里真出现过`);
  log();

  // ③ 语法覆盖（双向）
  log('③ 最小闭集：每样语法都有合法样例、且样例里的语法都在闭集里');
  const declaredIds = new Set(exp.constructs.map((c) => c.id));
  check(declaredIds.size === SUBSET.length && SUBSET.every((s) => declaredIds.has(s)), '闭集 8 样与 expectations.json 的 constructs 一一对应');
  const legalUsed = new Set(parsedLegal.flatMap((p) => [...usedConstructs(p)]));
  for (const id of legalUsed) check(declaredIds.has(id), `样例里用到的 ${id} 在闭集里`);
  for (const id of declaredIds) check(legalUsed.has(id), `闭集里的 ${id} 至少在一份合法样例里被真正行使`);
  for (const c of exp.constructs) {
    if (c.invalid) check(c.invalid.code in CODES, `${c.id} 的非法样例码 ${c.invalid.code} 在码表里`);
    for (const p of c.legalIn) {
      const parsed = parsedLegal.find((x) => rel(x.file).endsWith(p));
      check(!!parsed && usedConstructs(parsed).has(c.id), `expectations.json 说 ${c.id} 在 ${p} 里 ⇒ 该样例真的行使了它`);
    }
  }
  log();

  // ④ 非法夹具：码集逐条相等 + 关键结构断言
  log('④ 故意非法的夹具：诊断码集必须与账本逐条相等');
  const produced = new Set();
  for (const r of allFixtureResults()) {
    const got = r.parsed.diags.map((d) => d.code).sort();
    const want = [...FIXTURE_EXPECT[r.name]].sort();
    check(JSON.stringify(got) === JSON.stringify(want), `fixtures-invalid/${r.name} 码集 = ${want.join(',')}`, `实际：${got.join(',') || '（无）'}`);
    for (const c of got) produced.add(c);
  }
  for (const code of Object.keys(CODES)) {
    if (CODES[code].fixture) check(produced.has(code), `码表里的 ${code} 确有夹具产生它`);
  }
  for (const x of exp.excluded) {
    check(x.code in CODES, `越界语法 ${x.id} 的码 ${x.code} 在码表里`);
    check(produced.has(x.code), `越界语法 ${x.id} 的 ${x.code} 确有夹具产生它`);
    check(fs.existsSync(path.join(INVALID_DIR, path.basename(x.fixture))), `越界语法 ${x.id} 的夹具存在：${x.fixture}`);
  }
  log('  关键结构断言（靠结构而不是靠码名）：');
  const fenceHeading = parseSource(path.join(INVALID_DIR, 'fence-with-heading.md'));
  check(fenceHeading.diags.length === 1, '围栏里写了 `## 假标题` ⇒ **只报 1 条**（不另报未知节 ⇒ 证明围栏内不算分界）', `实际 ${fenceHeading.diags.length} 条`);
  const fhDetail = fenceHeading.sectionText.get(fenceHeading.sections.find((s) => s.name === '详情'));
  check(fhDetail !== null && fhDetail.includes('## 围栏里的假标题（夹具）'), '围栏里的 `## 假标题` 仍留在详情正文里（没有被当成节切走）');
  const dupFile = path.join(INVALID_DIR, 'duplicate-section.md');
  const dup = parseSource(dupFile);
  const dupLines = readLines(dupFile).map((l, i) => (l === '## 详情' ? i + 1 : 0)).filter(Boolean);
  check(dupLines.length === 2 && dup.diags[0].line === dupLines[1], `重复节诊断落在第二次出现的那一行（第 ${dupLines[1]} 行）`, `实际第 ${dup.diags[0].line} 行`);
  const empty = parseSource(path.join(FIXTURES_DIR, 'empty-and-blank-sections.md'));
  check(empty.product.poems[0].detail === null && empty.product.poems[0].notes === null, '空节 ⇒ 值写 null（键仍在）', JSON.stringify({ detail: empty.product.poems[0].detail, notes: empty.product.poems[0].notes }));
  check('detail' in empty.product.poems[0] && 'notes' in empty.product.poems[0], '空节时产物里 detail/notes 两个键仍然存在');
  const full = parseSource(path.join(SAMPLES_DIR, 'real-01-full.md'));
  const st = full.product.poems[0];
  check(st.stanzas.length === 1 && st.stanzas[0].length === 8, '真实《行行重行行》：8 行、单段（正文切分不被 `## 详情` 污染）', JSON.stringify(st.stanzas.map((s) => s.length)));
  check(st.stanzas[0][0] === '行行重行行，与君生别离。' && st.stanzas[0][7] === '弃捐勿复道，努力加餐饭。', '逐行相等：首行与末行逐字一致');
  check(!('variants' in st) && !('era' in st) && !('dynastyKey' in st), '产物每首只有 10 个新键（没有 era/variants/dynastyKey）');
  check(JSON.stringify(Object.keys(st)) === JSON.stringify(PRODUCT_KEY_ORDER), '每首键序 = ' + PRODUCT_KEY_ORDER.join(','), JSON.stringify(Object.keys(st)));
  check(JSON.stringify(Object.keys(full.product)) === JSON.stringify(['formatVersion', 'contentVersion', 'generatedAt', 'dynasties', 'poems']), '顶层键序正确');
  check(JSON.stringify(full.product.dynasties) === JSON.stringify(['汉']), '顶层 dynasties 是中文值数组（只含有内容的组）');
  check(st.detail !== null && st.detail.includes('### 异文'), '详情节正文按原文取（含 `### 异文`）');
  check(st.notes === null, '真实样例的 `## 笔记` 是空节 ⇒ notes = null（现状 0/19 有笔记）');
  log();

  // ⑤ 合成检查
  log('⑤ 合成字符串检查（**不是文件**：文件里保不住不可见字符）');
  for (const c of syntheticCases()) {
    const parsed = parseSynthetic(c);
    const codes = parsed.diags.map((d) => d.code);
    if (c.label === '笔记节里只有空白字符') {
      check(codes.length === 0 && parsed.product.notes === null, `${c.label} ⇒ 无诊断且 notes = null`, JSON.stringify({ codes, notes: parsed.product.notes }));
    } else if (c.label === '`##` 后面缺空格') {
      check(codes.length === 1 && codes[0] === 'MD_HEADING', `${c.label} ⇒ 1 条 MD_HEADING`, codes.join(','));
      check(parsed.product.stanzas.length === 2 && parsed.product.stanzas[1][0] === '##详情', `${c.label} ⇒ 那一行仍留在正文里（不是新节）`);
    } else if (c.label === '原文里的 `**` 不是粗体') {
      check(codes.length === 0 && parsed.product.stanzas[0][0] === '**这一段是诗行，不是粗体。**', `${c.label} ⇒ 无诊断、诗行原样保留`);
    } else {
      check(codes.length === 1 && codes[0] === 'DYNASTY_UNDECLARED', `${c.label} ⇒ 1 条 DYNASTY_UNDECLARED`, codes.join(','));
    }
  }
  log();

  // ⑥ ID 派生（沿用已通过的 C2 收口稿）
  log('⑥ ID 派生（沿用用户 2026-10-16 已通过的 C2 收口稿；本材料不重开）');
  check(idFromRelPath('古诗十九首/行行重行行.md') === '古诗十九首-行行重行行', '一层：古诗十九首/行行重行行.md ⇒ 古诗十九首-行行重行行');
  check(idFromRelPath('古诗十九首/甲/青青河畔草.md') === '古诗十九首-甲-青青河畔草', '多层：古诗十九首/甲/青青河畔草.md ⇒ 古诗十九首-甲-青青河畔草');
  check(idFromRelPath('汉/古诗十九首/行行重行行.md') === idFromRelPath('汉-古诗十九首-行行重行行.md'), '连字符碰撞：路径拼出的 `-` 与文件名里的 `-` 同形 ⇒ 必须靠判重报错（已通过稿的结论）');
  check(parsedLegal.some((p) => p.id === '夹具集-夹具首'), '嵌套夹具的 id 由相对路径派生（夹具集-夹具首）');
  log();

  // ⑦ 依据文件存在性
  log('⑦ 「两端预期」引用的依据文件确实存在（只做存在性检查，不读内容）');
  const evidence = new Set();
  for (const b of exp.blocks) for (const e of b.web.evidence.concat(b.android.evidence)) evidence.add(e);
  for (const c of exp.constructs) for (const e of c.web.evidence.concat(c.android.evidence)) evidence.add(e);
  for (const x of exp.excluded) for (const e of x.web.evidence.concat(x.android.evidence)) evidence.add(e);
  for (const e of exp.dynasty.evidence) evidence.add(e);
  for (const e of evidence) check(fs.existsSync(path.join(REPO_ROOT, e)), `依据文件存在：${e}`);
  log();

  // ⑧ 逐字节的 EXIT 码自证（真的另起进程跑）
  log('⑧ EXIT 码自证（另起子进程真跑，不是嘴上说）');
  const legalRun = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--parse', rel(LEGAL[0].file)], { cwd: REPO_ROOT, encoding: 'utf8' });
  check(legalRun.status === 0, `--parse ${rel(LEGAL[0].file)} ⇒ EXIT 0`, `实际 ${legalRun.status}`);
  for (const name of Object.keys(FIXTURE_EXPECT)) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--parse', rel(path.join(INVALID_DIR, name))], { cwd: REPO_ROOT, encoding: 'utf8' });
    check(r.status === 1, `--parse fixtures-invalid/${name} ⇒ EXIT 1`, `实际 ${r.status}`);
    check((r.stderr || '').includes(`fixtures-invalid/${name}:`), `--parse fixtures-invalid/${name} 把诊断原文打在 stderr 上`);
  }
  const outOfDir = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--parse', path.join(REPO_ROOT, 'package.json')], { cwd: REPO_ROOT, encoding: 'utf8' });
  check(outOfDir.status === 2, '目录外路径 ⇒ 用法错误 EXIT 2（本演示不读本目录之外）', `实际 ${outOfDir.status}`);
  log();

  log(`══ 结果：PASS ${PASS} / FAIL ${FAIL} ══`);
  if (FAIL) {
    log('失败项：');
    for (const f of failures) log(`  - ${f}`);
  }
  flush();
  return FAIL ? 1 : 0;
}

// ── main ───────────────────────────────────────────────────────────────────
function main(argv) {
  const [mode, arg] = argv;
  if (!mode) return runSelfCheck();
  switch (mode) {
    case '--parse': return modeParse(arg ?? die('--parse 需要一个本目录内的 md 路径'));
    case '--emit': return modeEmit(arg ?? die('--emit 需要一个本目录内的 md 路径'));
    case '--effects': return modeEffects(arg);
    case '--codes': return modeCodes();
    case '--all-invalid': return modeAllInvalid();
    case '--dump-diagnostics': return modeDumpDiagnostics();
    case '--verify-docs': return modeVerifyDocs();
    case '--help':
    default:
      process.stderr.write('用法：node demo.mjs [--parse <本目录内的 md> | --emit <本目录内的 md> | --effects [md] | --all-invalid | --dump-diagnostics | --codes | --verify-docs]\n');
      return mode ? 2 : 0;
  }
}
function die(msg) { process.stderr.write(`用法错误：${msg}\n`); process.exit(2); }

process.exitCode = main(process.argv.slice(2));
