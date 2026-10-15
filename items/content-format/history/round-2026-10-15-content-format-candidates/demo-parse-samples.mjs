// 演示脚本（demo）：把本目录 samples/ 下的**样例** MD 解析成**样例** JSON，
// 并跑「逐诗逐行」的正文切分自检 —— 为「详情进正文后，正文切分不污染」提供**可运行**证据。
//
// ⚠️ 演示用，不是编译器。
//   - 它**只读** items/content-format/prototypes/samples/ 下的文件；**绝不**读 `content/`、绝不写任何东西。
//   - 它的解析器是刻意写小的一段，只覆盖本目录样例用到的写法；不等价于 tools/ 里的正式编译器。
//   - 正式的解析/校验/错误码仍以 `tools/` 与 `docs/design/content-contract.md` 为准（本脚本不改 tools/）。
//   - 输出的 JSON 是**样例**，**不是正式 `dist/content.json`**，也不参与发布。
//
// 自检口径（按用户 2026-10-15 的纠正）：
//   ① 逐诗逐行：对**每个**样例断言「切出的**非空**正文行 == 详情切分点之前的非空行，**逐行相等**」，
//      并**分开报每个文件的行数**；不使用「总数相等」或「详情里的字句不出现在正文里」这类子串断言。
//   ② 分段保真：**空行＝段边界**必须被保留 —— 断言「段数＝期望段数、每段行数与期望一致」。
//      真实 9 份样例都是**单段**；`samples/fixture-multi-stanza-*.md` 是**人为插入空行**的格式夹具（3/3/2）。
//   ③ 宁可响、不许静默：详情解析遇到「不匹配的列表行 / 未识别的小标题」要**计数并告警**，
//      有告警时进程**非零退出**（避免把「静默丢内容」当通过）。
//
// 用法：node items/content-format/prototypes/demo-parse-samples.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SAMPLES_DIR = path.join(HERE, 'samples');

// 详情解析的静默遗漏告警：收集起来最后打印，有任何一条就非零退出。
const PARSE_WARNINGS = [];

// 《行行重行行》的真实 8 行（期望值；来源：content/poems/gushi-shijiu-shou-01.md）。
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

const DYNASTY = { 汉: { key: 'han', order: 100 } };

function readSampleLines(name) {
  let text = fs.readFileSync(path.join(SAMPLES_DIR, name), 'utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // 容忍 BOM，同契约
  return text.split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l)); // 容忍 CRLF
}

function splitFrontMatter(lines, file) {
  if ((lines[0] ?? '').trim() !== '---') throw new Error(`${file}: 第一行不是 ---`);
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error(`${file}: front matter 没有结束行 ---`);
  return { fm: lines.slice(1, end), body: lines.slice(end + 1) };
}

const stripQuotes = (s) => {
  s = (s ?? '').trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
};

// 最小 front matter 子集解析（只覆盖本目录样例：标量 / 引号标量 / `- key: value` 序列 / `|` 块标量）。
function parseFrontMatter(fmLines, file) {
  const data = {};
  let i = 0;
  while (i < fmLines.length) {
    const line = fmLines[i];
    if (line.trim() === '') {
      i++;
      continue;
    }
    if (/^[ \t]*#/.test(line)) {
      // 整行注释（契约允许；夹具文件用它标注「这是夹具」）
      i++;
      continue;
    }
    const m = /^([A-Za-z][A-Za-z0-9_-]*):(?:[ \t]+(.*))?$/.exec(line);
    if (!m) throw new Error(`${file}: 不认识的 front matter 行：${JSON.stringify(line)}`);
    const key = m[1];
    const rest = (m[2] ?? '').trim();

    if (rest === '|' || rest === '|-' || rest === '>' || rest === '>-' || rest === '>+') {
      i++;
      const buf = [];
      while (i < fmLines.length && (fmLines[i].trim() === '' || /^[ \t]/.test(fmLines[i]))) {
        buf.push(fmLines[i].replace(/^[ \t]{1,2}/, ''));
        i++;
      }
      data[key] = buf.join('\n').replace(/\s+$/, '');
      continue;
    }

    if (rest === '') {
      // 缩进块序列
      const arr = [];
      i++;
      while (i < fmLines.length && /^\s*-\s/.test(fmLines[i])) {
        const item = /^\s*-\s+([A-Za-z][A-Za-z0-9_-]*):(?:[ \t]+(.*))?$/.exec(fmLines[i]);
        if (item) {
          const obj = { [item[1]]: stripQuotes(item[2] ?? '') };
          i++;
          while (i < fmLines.length && /^\s{2,}[A-Za-z][A-Za-z0-9_-]*:/.test(fmLines[i])) {
            const sub = /^\s+([A-Za-z][A-Za-z0-9_-]*):(?:[ \t]+(.*))?$/.exec(fmLines[i]);
            obj[sub[1]] = stripQuotes(sub[2] ?? '');
            i++;
          }
          arr.push(obj);
        } else {
          arr.push(stripQuotes(fmLines[i].replace(/^\s*-\s+/, '')));
          i++;
        }
      }
      data[key] = arr;
      continue;
    }

    data[key] = stripQuotes(rest);
    i++;
  }
  return data;
}

// 正文切成「诗行」与命名小节。切分点：**恰好** `## ` 开头的行（`###` 不匹配）。
// 诗行区 = 第一个 `## ` 标题之前的行，**空行保留**（空行是分段信息，不能被吃掉）；
// 其后按小节名取用（顺序自由）。
function splitBodySections(bodyLines) {
  const poem = [];
  const sections = [];
  let cur = null;
  for (const raw of bodyLines) {
    const line = raw.replace(/[ \t]+$/, '');
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) {
      cur = { name: h[1].trim(), lines: [] };
      sections.push(cur);
      continue;
    }
    if (cur === null) {
      poem.push(line); // 保留空行
    } else {
      cur.lines.push(line);
    }
  }
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
    if (l.trim() === '') {
      if (cur.length) {
        out.push(cur);
        cur = [];
      }
    } else cur.push(l);
  }
  if (cur.length) out.push(cur);
  return out;
}

// 从「## 详情」里把异文与分段依据**解析回结构化字段**（候选 C 的编译器要做的这一步）。
// ⚠️ 宁可响、不许静默：不匹配的列表行、未识别的小标题、未归属小节的非空行，全部记入 warnings。
//    本演示**只覆盖约定写法**；正式实现必须有「未知内容如何处置」的错误策略。
function parseDetailStructured(detailLines, file) {
  const variants = [];
  let segmentation = null;
  const warnings = [];
  let mode = null;
  const lines = detailLines ?? [];
  for (let idx = 0; idx < lines.length; idx++) {
    const line = (lines[idx] ?? '').replace(/[ \t]+$/, '');
    if (line.trim() === '') continue;
    const h = /^###\s+(.+?)\s*$/.exec(line);
    if (h) {
      const name = h[1].trim();
      if (name !== '异文' && name !== '分段依据') {
        warnings.push(`${file}: 未识别的小标题「### ${name}」→ 其下内容不会被解析（静默遗漏风险）`);
      }
      mode = name;
      continue;
    }
    if (mode === '异文') {
      const m = /^-\s+\*\*(.+?)\*\*\s*——\s*(.*)$/.exec(line.trim());
      if (m) variants.push({ text: m[1], note: m[2] });
      else warnings.push(`${file}: 「### 异文」下的行不符合约定（- **行** —— 说明），未被解析：${JSON.stringify(line)}`);
    } else if (mode === '分段依据') {
      segmentation = (segmentation === null ? '' : segmentation + ' ') + line.trim();
    } else {
      warnings.push(`${file}: 「## 详情」里出现未归属到小节的非空行，未被解析：${JSON.stringify(line)}`);
    }
  }
  return { variants, segmentation, warnings };
}

function dynastyOf(label) {
  const d = DYNASTY[label];
  if (!d) throw new Error(`未在演示注册表里的朝代：${label}`);
  return d;
}

const asInt = (v) => (v === undefined || v === null ? null : Number(v));

function basePoem(fm, poemLines) {
  const d = dynastyOf(fm.dynasty);
  return {
    id: fm.id,
    title: fm.title,
    author: fm.author,
    dynastyKey: d.key,
    dynastyLabel: fm.dynasty,
    dynastyOrder: asInt(fm.dynastyOrder ?? d.order),
    era: fm.era ?? null,
    genre: fm.genre ?? null,
    source: fm.source,
    orderInSource: asInt(fm.orderInSource),
  };
}

function buildCandidateA(name) {
  const lines = readSampleLines(name);
  const { fm, body } = splitFrontMatter(lines, name);
  const f = parseFrontMatter(fm, name);
  const sec = splitBodySections(body);
  return {
    ...basePoem(f, sec.poem),
    detail: sec.joinSection('详情'),
    stanzas: buildStanzas(sec.poem),
    notes: sec.joinSection('笔记'),
  };
}

function buildCandidateB(name) {
  const lines = readSampleLines(name);
  const { fm, body } = splitFrontMatter(lines, name);
  const f = parseFrontMatter(fm, name);
  const sec = splitBodySections(body);
  return {
    ...basePoem(f, sec.poem),
    variants: (f.variants ?? []).map((v) => ({ text: v.text, note: v.note })),
    segmentation: f.segmentation ?? null,
    stanzas: buildStanzas(sec.poem),
    notes: typeof f.notes === 'string' ? f.notes : null,
  };
}

function buildCandidateC(name, collectionName) {
  const colLines = readSampleLines(collectionName);
  const colFm = parseFrontMatter(splitFrontMatter(colLines, collectionName).fm, collectionName);
  // 集合级字段注入：去掉集合自己的 id/label，其余作为默认值
  const injected = { ...colFm };
  delete injected.id;
  delete injected.label;

  const lines = readSampleLines(name);
  const { fm, body } = splitFrontMatter(lines, name);
  const ownFm = parseFrontMatter(fm, name);
  const merged = { ...injected, ...ownFm }; // 诗文件同名键**覆盖**集合值

  const sec = splitBodySections(body);
  const parsed = parseDetailStructured(sec.section('详情'), name);
  PARSE_WARNINGS.push(...parsed.warnings);
  return {
    ...basePoem(merged, sec.poem),
    variants: parsed.variants,
    segmentation: parsed.segmentation,
    stanzas: buildStanzas(sec.poem),
    notes: sec.joinSection('笔记'),
  };
}

const CANDIDATES = {
  A: { build: buildCandidateA, main: 'a-poem-01.md', note: 'a-poem-01-with-note.md', noDetail: 'a-poem-01-no-detail.md' },
  B: { build: buildCandidateB, main: 'b-poem-01.md', note: 'b-poem-01-with-note.md', noDetail: 'b-poem-01-no-detail.md' },
  C: {
    build: (n) => buildCandidateC(n, 'c-collection-gushi-shijiu-shou.md'),
    main: 'c-poem-01.md',
    note: 'c-poem-01-with-note.md',
    noDetail: 'c-poem-01-no-detail.md',
  },
};

// ---- 逐诗逐行＋分段自检 ----
const ALL_SAMPLE_FILES = fs
  .readdirSync(SAMPLES_DIR)
  .filter((f) => f.endsWith('.md') && !f.startsWith('c-collection-'))
  .sort();

// 分段期望：真实 19 首是**单段**；多段夹具是**人为**插入空行的 3 段（3/3/2）。
const STANZA_EXPECT = {
  'fixture-multi-stanza-a.md': [3, 3, 2],
  'fixture-multi-stanza-b.md': [3, 3, 2],
  'fixture-multi-stanza-c.md': [3, 3, 2],
};
const stanzaExpectOf = (file) => STANZA_EXPECT[file] ?? [EXPECTED_POETRY.length];

console.log('='.repeat(100));
console.log('逐诗逐行 ＋ 分段自检（正文切分不污染）—— 演示用，不是编译器');
console.log('口径：① 切出的**非空**正文行 必须与「详情切分点之前的非空行」**逐行相等**；');
console.log('      ② **空行＝段边界**必须被保留：段数与每段行数都要与期望一致；');
console.log('      ③ 逐文件报行数与分段（不只报总数）；④ 诗行中不以 `#` 开头。');
console.log('说明：9 份真实样例都是**单段**；`fixture-multi-stanza-*.md` 是**人为插入空行**的格式夹具。');
console.log('='.repeat(100));
console.log('文件'.padEnd(30) + '诗行数 段数 每段行数    逐行相等 分段相等 详情 笔记 #开头');
let allOk = true;
for (const file of ALL_SAMPLE_FILES) {
  const { body } = splitFrontMatter(readSampleLines(file), file);
  const sec = splitBodySections(body);
  const poemRaw = sec.poem; // 含空行（分段信息）
  const poemLines = poemRaw.filter((l) => l.trim() !== ''); // 非空诗行
  const stanzas = buildStanzas(poemRaw); // 分段由空行恢复
  const expectStanzas = stanzaExpectOf(file);
  const equal =
    poemLines.length === EXPECTED_POETRY.length && poemLines.every((l, i) => l === EXPECTED_POETRY[i]);
  const stanzasOk =
    stanzas.length === expectStanzas.length && stanzas.every((s, i) => s.length === expectStanzas[i]);
  const hashLines = poemLines.filter((l) => /^#/.test(l)).length;
  allOk = allOk && equal && stanzasOk && hashLines === 0;
  console.log(
    file.padEnd(30) +
      String(poemLines.length).padEnd(7) +
      String(stanzas.length).padEnd(5) +
      `[${stanzas.map((s) => s.length).join('/')}]`.padEnd(11) +
      (equal ? '是' : '否←失败').padEnd(9) +
      (stanzasOk ? '是' : `否←期望[${expectStanzas.join('/')}]`).padEnd(9) +
      (sec.sectionNames.includes('详情') ? '有' : '无').padEnd(5) +
      (sec.sectionNames.includes('笔记') ? '有' : '无').padEnd(5) +
      hashLines,
  );
}
console.log('-'.repeat(100));
console.log(`逐诗逐行＋分段自检：${allOk ? '全部通过' : '存在失败'}（真实 8 行逐行相等；多段夹具 3/3/2 被保留）`);
console.log('');

// ---- 每候选一坨样例 JSON ----
for (const key of ['A', 'B', 'C']) {
  const c = CANDIDATES[key];
  console.log('='.repeat(78));
  console.log(`候选 ${key} —— 编译后诗对象 JSON **样例**（不是正式 dist/content.json、不参与发布）`);
  console.log(`源文件：samples/${c.main}`);
  console.log('='.repeat(78));
  console.log(JSON.stringify(c.build(c.main), null, 2));

  const withNote = c.build(c.note);
  const noDetail = c.build(c.noDetail);
  console.log('');
  console.log(`  ↳ 有笔记 fixture（samples/${c.note}）：notes = ${JSON.stringify(withNote.notes)}`);
  console.log(
    `  ↳ 无详情（samples/${c.noDetail}）：${
      key === 'A' ? 'detail = ' + JSON.stringify(noDetail.detail) : 'segmentation = ' + JSON.stringify(noDetail.segmentation)
    }`,
  );
  console.log('');
}

// ---- 详情解析的静默遗漏告警：有则打印并**非零退出** ----
console.log('='.repeat(100));
if (PARSE_WARNINGS.length > 0) {
  console.log(`⚠️ 详情解析告警 ${PARSE_WARNINGS.length} 条（不匹配/未识别的内容 —— 静默遗漏风险）`);
  for (const w of PARSE_WARNINGS) console.log('  - ' + w);
  console.log('⇒ 有告警：进程非零退出（宁可响，不许静默）。');
  process.exitCode = 1;
} else {
  console.log('详情解析告警：0 条（本批样例都只用约定写法：`### 异文` 下的 `- **行** —— 说明`）。');
  console.log('⚠️ 本演示**只覆盖约定写法**；正式实现必须有「未知内容如何处置」的错误策略，');
  console.log('   在那种策略定下之前**不做正式实现**（不能静默丢内容）。');
}

// ---- 告警路径自证：喂一段故意写坏的详情，证明「未识别/不匹配」会被抓出来（不静默） ----
const BAD_DETAIL = [
  '### 异文',
  '- 游子不顾返：底本作「反」。', // 不符合约定模板（缺 ** 与 ——）
  '底本作「反」。（散行，未归属模板）', // 未匹配的续行
  '### 校本', // 未识别的小标题
  '- 某本作 X',
];
const badWarnings = parseDetailStructured(BAD_DETAIL, '<故意写坏的详情>').warnings;
console.log('='.repeat(100));
console.log(`告警路径自证：给一段故意写坏的详情，抓到 ${badWarnings.length} 条告警（>0 即证明不静默）：`);
for (const w of badWarnings) console.log('  - ' + w);
if (badWarnings.length === 0) {
  console.log('⇒ 失败：故意写坏却零告警。');
  process.exitCode = 1;
}
