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
//   对**每个**样例断言「切出的正文行 == 详情切分点之前的非空行，**逐行相等**」，
//   并**分开报每个文件的行数**；不使用「总数相等」或「详情里的字句不出现在正文里」这类子串断言。
//
// 用法：node items/content-format/prototypes/demo-parse-samples.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SAMPLES_DIR = path.join(HERE, 'samples');

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
// 诗行 = 第一个 `## ` 标题之前的**非空行**；其后按小节名取用（顺序自由）。
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
      if (line.trim() !== '') poem.push(line);
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
function parseDetailStructured(detailLines) {
  const variants = [];
  let segmentation = null;
  let mode = null;
  for (const line of detailLines ?? []) {
    const h = /^###\s+(.+?)\s*$/.exec(line);
    if (h) {
      mode = h[1].trim();
      continue;
    }
    if (mode === '异文') {
      const m = /^-\s+\*\*(.+?)\*\*\s*——\s*(.*)$/.exec(line.trim());
      if (m) variants.push({ text: m[1], note: m[2] });
    } else if (mode === '分段依据') {
      if (line.trim() !== '') segmentation = (segmentation === null ? '' : segmentation + ' ') + line.trim();
    }
  }
  return { variants, segmentation };
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
  const parsed = parseDetailStructured(sec.section('详情'));
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

// ---- 逐诗逐行自检 ----
const ALL_SAMPLE_FILES = fs
  .readdirSync(SAMPLES_DIR)
  .filter((f) => f.endsWith('.md') && !f.startsWith('c-collection-'))
  .sort();

console.log('='.repeat(78));
console.log('逐诗逐行自检（正文切分不污染）—— 演示用，不是编译器');
console.log('口径：切出的正文行 必须与「详情切分点之前的非空行」**逐行相等**；');
console.log('      逐文件报行数（不只报总数）；另断言诗行中不以 `#` 开头。');
console.log('='.repeat(78));
console.log('文件'.padEnd(30) + '诗行数  逐行相等  详情节  笔记节  以#开头的诗行');
let allOk = true;
for (const file of ALL_SAMPLE_FILES) {
  const { body } = splitFrontMatter(readSampleLines(file), file);
  const sec = splitBodySections(body);
  const poem = sec.poem;
  const equal = poem.length === EXPECTED_POETRY.length && poem.every((l, i) => l === EXPECTED_POETRY[i]);
  const hashLines = poem.filter((l) => /^#/.test(l)).length;
  const ok = equal && hashLines === 0;
  allOk = allOk && ok;
  console.log(
    file.padEnd(30) +
      String(poem.length).padEnd(8) +
      (equal ? '是' : '否←失败').padEnd(10) +
      (sec.sectionNames.includes('详情') ? '有' : '无').padEnd(8) +
      (sec.sectionNames.includes('笔记') ? '有' : '无').padEnd(8) +
      hashLines,
  );
}
console.log('-'.repeat(78));
console.log(`逐诗逐行自检：${allOk ? '全部通过' : '存在失败'}（期望每首正文恰为真实 8 行、逐行相等）`);
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
