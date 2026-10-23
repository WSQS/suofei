// 刘过《唐多令·芦叶满汀洲》的**字串保真与分行**：证据来自一份**独立抄录**的快照。
//
// 为什么要这个文件（用户 2026-10-23 的录入要求）：
//   ① 正文不是我凭空写的，也不是从新文件自己反推的 —— `tests/fixtures/liu-guo-tang-duo-ling-verified.json`
//      是录入时**手抄**的两处见证（汲古阁本《龙洲词》的字、汉典诗词转录的标点与行数），
//      与源文互相独立。任何「改一个字 / 少一个逗号 / 换行挪一位」都会在这里报红。
//   ② 阕内行数**从这份快照派生**，不由「四首毛词各 [2,2]」这类别的诗的行数推广而来：
//      本词按终止符分行得 `[3,3]`，那是**本词所用标点本的结果**，不是词牌契约。
//   ③ 反例在文件末尾：把「终不似」改成「终不是」、删一个字、把句号改逗号、把两阕并成一阕 ——
//      都必须报红。没有反例的「保真」测试是空的。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parsePoemRecord } from '../tools/lib/content-build.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'liu-guo-tang-duo-ling-verified.json');
const VERIFIED = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
const tracked = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'tracked-poems.json'), 'utf8'));

/** 去掉一切标点/空白后的字串 —— 用来比「字有没有变」而不受标点写法影响。 */
function charsOnly(text) {
  return [...text].filter((c) => /[\u3400-\u9fff]/.test(c)).join('');
}

/** 读一篇源文，返回 front matter 值 + 正文各阕的行（借编译器自己的解析，不另写一套）。 */
function readSource(relPath) {
  const abs = path.join(ROOT, relPath);
  const id = relPath.replace(/^content\/poems\//, '').replace(/\.md$/, '').split('/').join('-');
  const { poem, errors, draft } = parsePoemRecord({ displayPath: relPath, text: fs.readFileSync(abs, 'utf8'), id });
  assert.deepEqual(errors.map((e) => e.code), [], `${relPath} 编译期诊断不为空：${JSON.stringify(errors.map((e) => e.message))}`);
  assert.ok(poem, `${relPath} 解析不出 poem（不是「通过」）`);
  return { poem, stanzas: draft.stanzas };
}

/** 一篇源文与它的快照逐项比对；返回问题清单（空 = 合规），便于反例直接看「红在哪」。 */
function compareToSnapshot(relPath, snapshot, read = readSource) {
  const problems = [];
  const { poem, stanzas } = read(relPath);

  for (const key of ['title', 'author', 'dynasty', 'genre', 'orderInSource']) {
    if (poem[key] !== snapshot[key]) {
      problems.push(`${key}：源文 ${JSON.stringify(poem[key])} ≠ 快照 ${JSON.stringify(snapshot[key])}`);
    }
  }

  if (stanzas.length !== snapshot.stanzas.length) {
    problems.push(`阕数：源文 ${stanzas.length} ≠ 快照 ${snapshot.stanzas.length}`);
  }
  const n = Math.max(stanzas.length, snapshot.stanzas.length);
  for (let i = 0; i < n; i += 1) {
    const got = stanzas[i] ?? [];
    const want = snapshot.stanzas[i] ?? { lines: [], chars: '' };
    if (got.length !== want.lines.length) {
      problems.push(`第 ${i + 1} 阕行数：源文 ${got.length} ≠ 快照 ${want.lines.length}`);
    }
    // 逐行逐字符比（标点也算）：这是「正文一个字都没被改」的主证据。
    if (JSON.stringify(got) !== JSON.stringify(want.lines)) {
      problems.push(`第 ${i + 1} 阕正文与快照不逐字符相等：\n  现在：${JSON.stringify(got)}\n  快照：${JSON.stringify(want.lines)}`);
    }
    // 再单独比「纯汉字串」：即使有人把标点整体换掉，字也不许少一个。
    const gotChars = charsOnly(got.join(''));
    if (gotChars !== want.chars) {
      problems.push(`第 ${i + 1} 阕纯汉字串与快照不等：\n  现在：${gotChars}\n  快照：${want.chars}`);
    }
  }
  const total = stanzas.map((s) => charsOnly(s.join(''))).join('');
  if ([...total].length !== snapshot.charTotal) {
    problems.push(`全篇汉字数：${[...total].length} ≠ 快照 ${snapshot.charTotal}`);
  }
  return problems;
}

// ------------------------------------------------------------------ ① 每个快照都必须被比对（否则下面的循环可能是空跑）

test('快照不为空，且每条都指向一个已跟踪的源文（空跑不算通过）', () => {
  assert.ok(VERIFIED.poems.length > 0, '快照里没有诗 —— 这条没查成，不是通过');
  for (const snap of VERIFIED.poems) {
    assert.ok(fs.existsSync(path.join(ROOT, snap.path)), `快照指向的源文不存在：${snap.path}`);
    assert.ok(tracked.paths.includes(snap.path), `源文没有被 content/tracked-poems.json 收录：${snap.path}`);
  }
});

// ------------------------------------------------------------------ ② 主断言：源文 == 独立抄录的快照

test('正文逐行逐字符等于独立抄录的快照（词题、作者、朝代、体裁、序次、每阕行数、每阕字串）', () => {
  const report = [];
  for (const snap of VERIFIED.poems) report.push(...compareToSnapshot(snap.path, snap));
  assert.deepEqual(report, [], `源文与独立抄录的快照不一致：\n${report.join('\n')}`);
});

// ------------------------------------------------------------------ ③ 分行规则同样适用于本词（从 genre 派生，不写死题名）

test('本词的每一阕：非末行都收在完整句末终止符处，没有一行以逗号/顿号收尾', () => {
  const SENTENCE_END = new Set(['。', '？', '！']);
  const SHORT_PAUSE = new Set(['，', '、', '；', '：']);
  const report = [];
  for (const snap of VERIFIED.poems) {
    const { poem, stanzas } = readSource(snap.path);
    assert.equal(poem.genre, '词', `${snap.path} 的 genre 不是「词」—— 这条断言的前提不成立`);
    stanzas.forEach((lines, si) => {
      lines.forEach((line, i) => {
        const last = [...line].at(-1);
        if (SHORT_PAUSE.has(last)) report.push(`第 ${si + 1} 阕第 ${i + 1} 行以短句停顿收尾（${last}）：${line}`);
        if (i < lines.length - 1 && !SENTENCE_END.has(last)) {
          report.push(`第 ${si + 1} 阕第 ${i + 1} 行不是完整句末终止符结尾却断行了：${line}`);
        }
      });
    });
  }
  assert.deepEqual(report, [], report.join('\n'));
});

// ------------------------------------------------------------------ ④ 反例（能红）：这个文件真的抓得住改动

test('反例：换一个字 / 删一个字 / 把句号改逗号 / 并阕 —— 逐字符比必须报红', () => {
  const snap = VERIFIED.poems[0];
  const mutate = (fn) => (relPath) => {
    const read = readSource(relPath);
    const stanzas = read.stanzas.map((lines) => [...lines]);
    fn(stanzas);
    return { ...read, stanzas };
  };

  const cases = {
    '把「终不似」改成「终不是」': mutate((s) => {
      s[1][2] = s[1][2].replace('终不似', '终不是');
    }),
    '删掉一个「又」字': mutate((s) => {
      s[0][2] = s[0][2].replace('又中秋', '中秋');
    }),
    '把第一个句号改成分号': mutate((s) => {
      s[0][0] = s[0][0].replace('。', '；');
    }),
    '把两阕并成一阕': mutate((s) => {
      s.splice(0, s.length, s.flat());
    }),
    '把行合并（阕内两行并一行）': mutate((s) => {
      s[0].splice(0, 2, s[0][0] + s[0][1]);
    }),
  };

  for (const [name, mutator] of Object.entries(cases)) {
    const problems = compareToSnapshot(snap.path, snap, mutator);
    assert.ok(problems.length > 0, `反例「${name}」没有报红 ⇒ 保真比对没有牙齿`);
  }
});
