// 契约绑定：`schema/markdown-subset.json` 是**跨端唯一的机器可读范围定义**。
//
// 为什么要有这个文件（2026-10-16 负责人加）：
//   在此之前，那份唯一定义**只被 Android 一端真读**（`MarkdownTest`）；编译器一侧
//   `tools/lib/markdown.mjs` 自己维护 `SUBSET` 与 `MD_CODES`，**没有任何东西把它们与契约对上**
//   —— ⇒ 「契约加了/改了一样构造，编译器不知道」这类漂移不会有人发现
//   （本项目已记录三次的「看起来有保障、其实没有」形状）。
//   本文件把**编译器的支持集与越界码集**钉死在契约上，并且要求**契约里每一条都真被行使**
//   （不是死条目）。
//
// 边界：只读契约与工具常量，不改任何实现；不涉及 Web/Android（那两端的对照各自做）。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SUBSET, MD_CODES, classifyLine, checkMarkdownLine } from '../tools/lib/markdown.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const CONTRACT_PATH = path.join(ROOT, 'schema', 'markdown-subset.json');
const CONTRACT = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
const LEDGER = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'rules-v4-invalid', 'expected-diagnostics.json'), 'utf8'),
);

/** **跨端块标记边界的正反例**（编译器／Web／Android 三方读同一份，见 `_note`）。 */
const BOUNDARY = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'contract', 'md-boundary.json'), 'utf8'));

/** 编译器会报的**越界语法**码＝`MD_CODES` 的全部值 ＋ 代码围栏（围栏的判定不在那张表里）。 */
const COMPILER_EXCLUDED = new Set([...Object.values(MD_CODES), 'MD_CODE_FENCE']);

test('契约：文件形状健康（有 constructs／excluded／fixtures，且 fixtures 指的文件真存在）', () => {
  assert.equal(CONTRACT.formatVersion, 2);
  assert.ok(Array.isArray(CONTRACT.constructs) && CONTRACT.constructs.length === 8, 'constructs 应是 8 样');
  assert.ok(Array.isArray(CONTRACT.excluded) && CONTRACT.excluded.length > 0, 'excluded 不应为空');
  for (const [key, rel] of Object.entries(CONTRACT.fixtures)) {
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `契约里声明的 fixtures.${key} 应存在：${rel}`);
  }
  // 块标记边界必须是**契约明写**的一条，不能只活在三个实现里（否则又是「各写各的」）。
  assert.ok(CONTRACT.boundary && typeof CONTRACT.boundary.rule === 'string', '契约必须有 boundary.rule');
  assert.match(CONTRACT.boundary.rule, /恰好一个\s*ASCII\s*空格/, 'boundary.rule 要写清「恰好一个 ASCII 空格」');
  assert.match(CONTRACT.boundary.rule, /不\s*trim/, 'boundary.rule 要写清块内文字不 trim');
});

test('【跨端正反例】块标记边界：编译器判据逐例相等，且该报错的真报出对应码', () => {
  const wrong = [];
  for (const c of BOUNDARY.cases) {
    const cls = classifyLine(c.line);
    if (cls !== c.compiler) wrong.push(`${c.id}: ${JSON.stringify(c.line)} → ${cls}（期望 ${c.compiler}）`);
    const want = MD_CODES[c.compiler];
    const got = checkMarkdownLine(c.line);
    if (want) {
      if (!got || got.code !== want) wrong.push(`${c.id}: 应报 ${want}，实际 ${got ? got.code : 'null'}`);
    } else if (got) {
      wrong.push(`${c.id}: 不该报错，实际报了 ${got.code}`);
    }
  }
  assert.deepEqual(wrong, [], '边界正反例与编译器的判据不一致');
});

test('契约 constructs ≡ 编译器 SUBSET（逐项且同序）—— 支持集不能各写各的', () => {
  const fromContract = CONTRACT.constructs.map((c) => c.id);
  assert.deepEqual(fromContract, [...SUBSET], '契约的 constructs[].id 必须与 tools/lib/markdown.mjs 的 SUBSET 逐项同序相等');
});

test('契约 excluded ≡ 编译器会报的越界码（两个方向都比）—— 既不能少声明，也不能有「工具会报而契约没写」的码', () => {
  const declared = new Set(CONTRACT.excluded.map((e) => e.code));
  const missingInContract = [...COMPILER_EXCLUDED].filter((c) => !declared.has(c));
  const declaredButNotEmitted = [...declared].filter((c) => !COMPILER_EXCLUDED.has(c));
  assert.deepEqual(missingInContract, [], '编译器会报、但契约 excluded 里没声明的码');
  assert.deepEqual(declaredButNotEmitted, [], '契约声明了、但编译器不会报的码（死声明）');
});

test('契约的每一样构造都在**合法夹具**里真被行使（不是死条目）', () => {
  const legal = JSON.parse(
    fs.readFileSync(path.join(ROOT, CONTRACT.fixtures.legalSample), 'utf8'),
  );
  const poem = legal.poems[0];
  const text = [poem.notes ?? '', poem.detail ?? ''].join('\n');

  /** 每样构造一条**可核**的行内证据（不是「文件里有字」那种空话）。 */
  const evidence = {
    paragraph: text.split('\n').some((l) => /[^\s]/.test(l) && !/^(\s*)(### |> |- |\d+\. )/.test(l)),
    'line-break': (() => {
      // 同一段里连续两行都是普通文本 ⇒ 段内换行
      const lines = text.split('\n');
      for (let i = 1; i < lines.length; i += 1) {
        const a = lines[i - 1];
        const b = lines[i];
        const plain = (l) => /[^\s]/.test(l) && !/^(\s*)(### |> |- |\d+\. )/.test(l);
        if (plain(a) && plain(b)) return true;
      }
      return false;
    })(),
    'ul-dash': /^- /m.test(text),
    'ol-number': /^\d+\. /m.test(text),
    bold: /\*\*[^*]+\*\*/.test(text),
    italic: /(?<!\*)\*[^*]+\*(?!\*)/.test(text),
    h3: /^### /m.test(text),
    quote: /^> /m.test(text),
  };

  const notExercised = CONTRACT.constructs.map((c) => c.id).filter((id) => !evidence[id]);
  assert.deepEqual(
    notExercised,
    [],
    '契约声明了、但合法夹具里找不到行使证据的构造（要么补夹具，要么从契约里去掉）',
  );
  assert.equal(Object.keys(evidence).length, CONTRACT.constructs.length, '证据表与契约条目数应一致（新增构造要同时加证据）');
});

test('契约的每个越界码都有**至少一份夹具**真的产生它（不是死声明）', () => {
  const produced = new Set();
  for (const cases of Object.values(LEDGER.cases ?? {})) {
    for (const e of cases) produced.add(e.code);
  }
  // 边界正反例也是**真跑编译器**产生的（不是照着表抄的声明）。
  for (const c of BOUNDARY.cases) {
    const got = checkMarkdownLine(c.line);
    if (got) produced.add(got.code);
  }
  const never = CONTRACT.excluded.map((e) => e.code).filter((code) => !produced.has(code));
  assert.deepEqual(never, [], '契约声明了、但没有任何夹具产生它的越界码');
});
