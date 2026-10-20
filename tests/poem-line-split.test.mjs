// 词正文的**内容行**怎么切（用户 2026-10-20 拍板，问题 `q-93e94966`）：
//
//   「像方案二，到一个句号或问号这样一个终止符结束；和诗歌对齐一致比较合适」
//
// ⇒ 规则：**按完整句末终止符（`。` `？` `！`）分内容行**；**逗号/顿号/分号不独立断行**；
//   **保留原有上下阕空行**（阕＝产物 `stanzas` 的一段）；屏幕过窄再走**已有的句读优先视觉折行**
//   （那条在 `web/tests/e2e-cdp.mjs` §4e，本文件不重复它、也不削弱它）。
//
// 这个文件守两件事，都是「能红」的：
//   ① **规则**：每首**词**（从源文 `genre: "词"` 派生，不写死题名/行数）的每一阕里，
//      除阕末行外每行都在终止符处收尾；没有任何一行以逗号/顿号/分号/冒号收尾
//      （＝不是按词牌短句逐行、也不是整阕一行）。
//   ② **逐字符保真**：`tests/fixtures/mao-four-poems-line-split-before.json` 是这次改分行**之前的正文快照**
//      （fixture，不是用户笔记）。新正文**按阕去换行后必须与它逐字符相等** —— 这是「只改分行、不改文字」
//      的独立证据：它拿的是一份**改动前的副本**，不是从新正文自己派生的（那样是空的）。
//      阕数也从快照派生 ⇒ **跨阕合并/丢掉空行**会真报红。
//
// ⚠ 为什么不用「新正文自己 split('\n') 再 join」当证据：那是同义反复，永远绿。
// ⚠ 为什么逐阕比、不只用总串比：见本文件最后一组反例 —— 把阕末行与下阕首行拼成一行，**总串仍然相等**，
//   只有逐阕比才抓得住。这是这一组用例存在的理由，不是洁癖。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const POEMS_ROOT = path.join(ROOT, 'content', 'poems');
const BEFORE_FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'mao-four-poems-line-split-before.json');

/** 完整句末终止符（规则里点名的三个；`，``、``；``：` 都不算）。 */
const SENTENCE_END = new Set(['。', '？', '！']);
/** 紧跟在终止符之后、应当**留在前句**的闭引号/闭括号（用户要求：边界不丢字、不另起一行）。 */
const CLOSERS = new Set(['”', '’', '」', '』', '）', ')', '】', '〕', '》', '〉', '"', "'", ']']);
/** 出现即说明「按短句断行」了（不是按完整句末终止符）。 */
const NOT_A_LINE_END = new Set(['，', '、', '；', '：', ',', ';']);

// ------------------------------------------------------------------ 纯函数（可被下面的反例单独喂料）

/** 去掉行尾的闭引号/闭括号，返回真正参与判定的尾部字符。 */
function trailingSignificantChar(line) {
  let chars = [...line];
  while (chars.length > 0 && CLOSERS.has(chars[chars.length - 1])) chars.pop();
  return chars.length === 0 ? '' : chars[chars.length - 1];
}

/**
 * 把行尾的「终止符组＋闭引号/闭括号」剥掉，返回 `{ head, ended }`：
 * `ended` ＝ 行尾确实是完整句末终止符（连续终止符如 `？！`、以及 `。」` 这种「终止符＋闭引号」都算一组）；
 * `head` ＝ 剥掉之后剩下的正文，**里面若还有终止符，就说明两句被并进了同一行**。
 */
function splitTrailingSentenceEnd(line) {
  const chars = [...line];
  while (chars.length > 0 && CLOSERS.has(chars[chars.length - 1])) chars.pop();
  let ended = false;
  while (chars.length > 0 && SENTENCE_END.has(chars[chars.length - 1])) {
    chars.pop();
    ended = true;
  }
  while (chars.length > 0 && CLOSERS.has(chars[chars.length - 1])) chars.pop();
  return { head: chars.join(''), ended };
}

/** 这一行是否收在完整句末终止符处（连续终止符如 `？！`／`。」` 视为一组，照样算）。 */
function endsAtSentenceEnd(line) {
  return splitTrailingSentenceEnd(line).ended;
}

/** 这一行是否错误地收在逗号/顿号/分号/冒号处（＝按短句断行了）。 */
function endsAtShortPause(line) {
  return NOT_A_LINE_END.has(trailingSignificantChar(line));
}

/** 去换行（`\n`）——「去换行后逐字符相等」里那个「去」。只去换行，不动任何正文字符。 */
function stripNewlines(text) {
  return text.replace(/\r/g, '').replace(/\n/g, '');
}

/**
 * 一阕的内容行是否遵守规则。返回**违规描述数组**（空 = 合规），便于反例直接看「红在哪」。
 * 阕末行允许没有终止符（原文可能本来就没有），所以只要求「非末行」收在终止符处。
 */
function stanzaLineRuleViolations(lines) {
  const bad = [];
  if (lines.length === 0) bad.push('空阕（没有任何内容行）');
  lines.forEach((line, i) => {
    if (line.trim() === '') bad.push(`第 ${i + 1} 行是空行（空行只用来分阕，不落在阕内）`);
    if (endsAtShortPause(line)) {
      bad.push(`第 ${i + 1} 行以短句停顿收尾（${trailingSignificantChar(line)}）：${line}`);
    }
    const { head, ended } = splitTrailingSentenceEnd(line);
    if (i < lines.length - 1 && !ended) {
      bad.push(`第 ${i + 1} 行不是完整句末终止符结尾（却在阕中间就断行了）：${line}`);
    }
    // 行内不该再有终止符：有 ⇒ 两个完整句被并成一行（「整阕一行」正是这种极端）。
    const inner = [...head].filter((c) => SENTENCE_END.has(c));
    if (inner.length > 0) {
      bad.push(`第 ${i + 1} 行里还有 ${inner.length} 个完整句末终止符（${inner.join('')}）：两句被并进同一行：${line}`);
    }
  });
  return bad;
}

// ------------------------------------------------------------------ 源文读取（不借产物自证）

/** 读一篇源文：front matter 键值 + 正文区（第一对 `---` 之后、到第一个 `## 节` 之前）的阕/行。 */
function readSourcePoem(file) {
  const lines = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((l) => l.trim() === '---');
  const end = lines.findIndex((l, i) => i > start && l.trim() === '---');
  assert.ok(start >= 0 && end > start, `源文读不出 front matter：${file}`);
  const front = lines.slice(start + 1, end);
  const value = (key) => {
    const line = front.find((l) => l.startsWith(`${key}:`));
    return line === undefined ? null : line.slice(key.length + 1).trim().replace(/^"(.*)"$/s, '$1');
  };
  const rest = lines.slice(end + 1);
  const firstSection = rest.findIndex((l) => /^##\s/.test(l));
  const bodyLines = firstSection < 0 ? rest : rest.slice(0, firstSection);
  const stanzas = [];
  let cur = [];
  for (const raw of bodyLines) {
    if (raw.trim() === '') {
      if (cur.length > 0) stanzas.push(cur);
      cur = [];
    } else {
      cur.push(raw.replace(/[ \t]+$/, ''));
    }
  }
  if (cur.length > 0) stanzas.push(cur);
  return { file, path: path.relative(ROOT, file).split(path.sep).join('/'), genre: value('genre'), stanzas };
}

/** `content/poems/**` 下全部源文（排除隐藏/临时/README，与编译器同一排除口径）。 */
function allSourcePoems() {
  return fs.readdirSync(POEMS_ROOT, { recursive: true })
    .map((rel) => String(rel).split(path.sep).join('/'))
    .filter((rel) => rel.endsWith('.md'))
    .filter((rel) => {
      const name = rel.split('/').pop();
      return !name.startsWith('.') && !name.startsWith('_') && !name.startsWith('~')
        && !name.endsWith('~') && !/^README/i.test(name);
    })
    .sort()
    .map((rel) => readSourcePoem(path.join(POEMS_ROOT, rel)));
}

const CI_WORDS = allSourcePoems().filter((p) => p.genre === '词');

// ------------------------------------------------------------------ ① 规则：所有「词」按终止符分内容行

test('规则适用面不为空（否则下面的逐首循环是空跑，不是通过）', () => {
  assert.ok(CI_WORDS.length > 0, '源文里没有 genre 为「词」的诗 —— 这条没查成，不是通过');
});

test('每首「词」：阕内非末行都收在完整句末终止符处，且没有一行以逗号/顿号/分号/冒号收尾', () => {
  const report = [];
  for (const poem of CI_WORDS) {
    poem.stanzas.forEach((lines, si) => {
      const bad = stanzaLineRuleViolations(lines);
      if (bad.length > 0) report.push(`${poem.path} 第 ${si + 1} 阕：${bad.join('；')}`);
    });
  }
  assert.deepEqual(report, [], `词的正文没有按「完整句末终止符」分内容行：\n${report.join('\n')}`);
});

test('每首「词」的阕数 == 快照阕数（上下阕空行没被吃掉，也没被拆多）', () => {
  const before = JSON.parse(fs.readFileSync(BEFORE_FIXTURE, 'utf8'));
  const got = new Map(CI_WORDS.map((p) => [p.path, p.stanzas.length]));
  for (const snap of before.poems) {
    assert.ok(got.has(snap.path), `快照里的 ${snap.path} 现在找不到（改名/删掉了？）`);
    assert.equal(got.get(snap.path), snap.stanzas.length,
      `${snap.path} 的阕数变了：快照 ${snap.stanzas.length}，现在 ${got.get(snap.path)}`);
  }
});

// ------------------------------------------------------------------ ② 逐字符保真：按阕与改前快照逐字符相等

test('四首词的正文（按阕去换行后）与改前快照逐字符相等 —— 只改了分行，没改一个字', () => {
  const before = JSON.parse(fs.readFileSync(BEFORE_FIXTURE, 'utf8'));
  const byPath = new Map(allSourcePoems().map((p) => [p.path, p]));
  const problems = [];
  const rows = [];
  for (const snap of before.poems) {
    const now = byPath.get(snap.path);
    assert.ok(now !== undefined, `快照里的源文不存在了：${snap.path}`);
    const totalNow = stripNewlines(now.stanzas.map((lines) => lines.join('\n')).join(''));
    const totalBefore = stripNewlines(snap.stanzas.join(''));
    if (totalNow !== totalBefore) problems.push(`${snap.path}：整首去换行后与快照不相等`);
    const n = Math.max(now.stanzas.length, snap.stanzas.length);
    for (let i = 0; i < n; i += 1) {
      const a = stripNewlines((now.stanzas[i] ?? []).join('\n'));
      const b = stripNewlines(snap.stanzas[i] ?? '');
      if (a !== b) {
        problems.push(`${snap.path} 第 ${i + 1} 阕：去换行后与快照不相等\n  现在：${a}\n  改前：${b}`);
      }
      rows.push({ path: snap.path, stanza: i + 1, lines: (now.stanzas[i] ?? []).length, chars: a.length, equal: a === b });
    }
  }
  assert.deepEqual(problems, [], problems.join('\n'));
  // 顺带把「每阕几个内容行」记进断言输出，便于人工复核分布（期望值仍来自快照，不是字面量）。
  assert.ok(rows.every((r) => r.equal), `逐阕比对：${JSON.stringify(rows)}`);
});

// ------------------------------------------------------------------ ③ 反例（能红）：这些是对上面两组断言的**证伪**

test('反例·跨阕：吃掉阕间空行 / 把阕末行与下阕首行拼成一行 —— 总串仍相等，但阕数、逐阕比必须报红', () => {
  const poem = CI_WORDS.find((p) => p.stanzas.length >= 2);
  assert.ok(poem !== undefined, '没有两阕以上的词 ⇒ 这条反例无从构造（不是通过）');
  const now = poem.stanzas.map((lines) => [...lines]);
  const total = (stanzas) => stripNewlines(stanzas.map((ls) => ls.join('\n')).join(''));
  const perStanza = (stanzas) => stanzas.map((ls) => stripNewlines(ls.join('\n')));

  const cases = [
    // ① 吃掉阕间空行：两阕变成一阕（内容行原样保留）⇒ 阕数变少
    { name: '吃掉阕间空行', stanzas: [now.flat()], sameStanzaCount: false },
    // ② 行跨阕：阕末行与下阕首行拼成一行（阕数不变，但那一行的字符跨过了阕边界）
    {
      name: '阕末行接上下阕首行',
      stanzas: [
        now[0].slice(0, -1).concat([now[0].at(-1) + now[1][0]]),
        ...now.slice(1).map((ls, i) => (i === 0 ? ls.slice(1) : ls)),
      ],
      sameStanzaCount: true,
    },
  ];

  for (const { name, stanzas: mutated, sameStanzaCount } of cases) {
    // ① 去换行后的**总串看不出来** —— 这正是“只看总串”不够的原因：
    assert.equal(total(mutated), total(now), `前提不成立：${name} 应当不改变去换行后的总串`);
    // ② 逐阕比**必须**报红：
    assert.notDeepEqual(perStanza(mutated), perStanza(now), `${name} 后逐阕比仍然全等 ⇒ 逐阕比对没有牙齿`);
    // ③ 阕数或行数也变了（落进产物就是 stanzas 形状变了，不是“只改排版”）：
    if (sameStanzaCount) {
      assert.equal(mutated.length, now.length, `${name} 这条反例本想保持阕数不变`);
    } else {
      assert.notEqual(mutated.length, now.length, `${name} 后阕数没变 ⇒ 阕数断言抓不住`);
    }
    assert.notDeepEqual(mutated.map((ls) => ls.length), now.map((ls) => ls.length), `${name} 后每阕行数没变`);
  }
});

test('反例·逐字符：删一个字 / 加一个字 / 换一个字 / 把句号改成逗号 —— 逐字符比必须报红', () => {
  const poem = CI_WORDS.find((p) => p.stanzas.some((ls) => ls.join('').length >= 4));
  assert.ok(poem !== undefined, '没有足够长的词行可用来做反例（不是通过）');
  const lines = poem.stanzas.flat();
  const original = stripNewlines(lines.join('|'));
  const variants = {
    '删一个字': (s) => s.slice(0, 2) + s.slice(3),
    '加一个字': (s) => s.slice(0, 2) + '衍' + s.slice(2),
    '换一个字（同长度）': (s) => s.slice(0, 2) + '易' + s.slice(3),
    '把第一个句号改成逗号': (s) => s.replace('。', '，'),
  };
  for (const [name, mutate] of Object.entries(variants)) {
    const mutated = mutate(original);
    assert.notEqual(mutated, original, `反例「${name}」没有真的改动任何字符（反例失效）`);
    // 等长替换（换一个字/把句号改成逗号）**逃得过**「长度不变」这种粗检查 ⇒ 只能靠逐字符比。
    if ([...mutated].length === [...original].length) {
      assert.equal([...mutated].length, [...original].length);
    }
    assert.notEqual(stripNewlines(mutated), stripNewlines(original), `逐字符比对没抓住「${name}」`);
  }
});

test('反例·规则：按逗号断行 / 整阕不断行 —— 规则检查必须报红', () => {
  const poem = CI_WORDS[0];
  const stanza = poem.stanzas[0];
  const joined = stanza.join('');
  // ① 按逗号断行（用户明确不要的那种）：
  const byComma = joined.split(/(?<=，)/u);
  assert.ok(byComma.length > 1, '这一阕里没有逗号 ⇒ 反例无从构造（不是通过）');
  assert.ok(stanzaLineRuleViolations(byComma).length > 0, '按逗号断行却判合规 ⇒ 规则检查没有牙齿');
  // ② 整阕一行（另一个极端）：只要阕内本来就有多个完整句，就必须报红。
  const sentences = joined.split(/(?<=[。？！])/u).filter((s) => s !== '');
  if (sentences.length > 1) {
    const oneLine = [joined];
    assert.ok(stanzaLineRuleViolations(oneLine).length > 0,
      `整阕一行（本阕有 ${sentences.length} 个完整句）却判合规 ⇒ 规则检查没有牙齿`);
  }
});
