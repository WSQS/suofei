// S1 验收：rules-v4 已通过的**语法/细则**在编译器落地（逐条可核）。
//
// 用户 2026-10-16 已通过的规则（采纳锚见 docs/status.md「规则采用（rules-v4）」）：
//   ① 合法样例 EXIT 0；② 12 份非法夹具逐条诊断（码 + 行号 + 文案）；
//   ③ 闭集 8 样；④ 未知节/重复节报错；⑤ 空节 ⇒ null 保键；⑥ 围栏先跟踪（围栏里的 `##` 不误切）；
//   ⑦ 朝代组名精确匹配（不去 trim）；⑧ 未闭合强调报错（负责人落定）。
//
// 夹具来源＝原型轮 rules-v4（现 `items/content-format/history/round-2026-10-16-rules-v4/`，**已归档**），所以**复制**到
// `tests/fixtures/rules-v4-{legal,invalid}/`，测试**不依赖原型目录**。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { scanPoems } from '../tools/lib/scan.mjs';
import { buildContentFromRecords, parsePoemRecord } from '../tools/lib/content-build.mjs';
import { POEM_KEYS } from '../tools/lib/interface.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const CLI = path.join(ROOT, 'tools', 'build-content.mjs');
const LEGAL_DIR = path.join(ROOT, 'tests', 'fixtures', 'rules-v4-legal');
const INVALID_DIR = path.join(ROOT, 'tests', 'fixtures', 'rules-v4-invalid');
const LEDGER = JSON.parse(fs.readFileSync(path.join(INVALID_DIR, 'expected-diagnostics.json'), 'utf8'));

const LEGAL = ['real-01-full', 'real-01-text-only', 'md-subset-legal-fixture', 'empty-and-blank-sections', 'nested'];

function runCli(args) {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', cwd: ROOT });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

/** 编译一个 fixture 内容根（走真实扫描 + 纯函数校验）。 */
function compile(name, kind = 'rules-v4-legal') {
  const contentRoot = path.join(ROOT, 'tests', 'fixtures', kind, name, 'content');
  const { records, errors: scanErrors } = scanPoems(path.join(contentRoot, 'poems'));
  const built = buildContentFromRecords({ records, explicitVersion: '2026.10.16.1', orderStrategy: 'source' });
  return { contentRoot, records, errors: [...scanErrors, ...built.errors], content: built.content };
}

// ---------- ① 合法样例 EXIT 0 ----------

test('合法样例：真实进程 --check 全部 EXIT 0', () => {
  for (const name of LEGAL) {
    const r = runCli(['--check', '--content', path.join(LEGAL_DIR, name, 'content')]);
    assert.equal(r.status, 0, `${name} 应 EXIT 0；stderr=${r.stderr}`);
  }
});

test('合法样例：每首 11 键、键序固定、详情/笔记按节取；顶层 dynasties 是中文值数组', () => {
  for (const name of LEGAL) {
    const { errors, content } = compile(name);
    assert.deepEqual(errors, [], `${name} 不应有诊断`);
    assert.equal(content.formatVersion, 3);
    assert.deepEqual(Object.keys(content), ['formatVersion', 'contentVersion', 'generatedAt', 'dynasties', 'tags', 'poems']);
    for (const p of content.poems) {
      assert.deepEqual(Object.keys(p), [...POEM_KEYS], `${name}/${p.id} 键序`);
      assert.equal('variants' in p, false);
      assert.equal('dynastyKey' in p, false);
    }
    assert.ok(content.dynasties.every((d) => typeof d === 'string'), `${name} dynasties 应是中文值数组`);
  }
});

test('真实《行行重行行》样例：8 行单段、detail 含 `### 异文`、空 `## 笔记` ⇒ notes null', () => {
  const { content } = compile('real-01-full');
  const p = content.poems[0];
  assert.equal(p.id, 'real-01-full');
  assert.deepEqual(p.stanzas, [
    [
      '行行重行行，与君生别离。',
      '相去万余里，各在天一涯。',
      '道路阻且长，会面安可知？',
      '胡马依北风，越鸟巢南枝。',
      '相去日已远，衣带日已缓。',
      '浮云蔽白日，游子不顾反。',
      '思君令人老，岁月忽已晚。',
      '弃捐勿复道，努力加餐饭。',
    ],
  ]);
  assert.ok(p.detail.includes('### 异文'), '详情节正文应逐字取自源文件');
  assert.equal(p.notes, null);
  assert.deepEqual(content.dynasties, ['汉']);
});

test('嵌套目录：id 由相对路径派生（`/` → `-`）', () => {
  const { content } = compile('nested');
  assert.equal(content.poems[0].id, '夹具集-夹具首');
});

// ---------- ② 12 份非法夹具逐条诊断（码 + 行号 + 文案逐字） ----------

test('12 份非法夹具：诊断码 / 行号 / 文案逐字相等（账本 expected-diagnostics.json）', () => {
  const names = Object.keys(LEDGER.cases).sort();
  assert.equal(names.length, 12, '账本应有 12 份夹具');
  for (const name of names) {
    const { errors } = compile(name, 'rules-v4-invalid');
    const got = errors.map((e) => ({ code: e.code, line: e.line, message: e.message }));
    assert.deepEqual(got, LEDGER.cases[name], `fixtures-invalid/${name} 诊断不一致`);
  }
});

test('12 份非法夹具：真实进程全部 EXIT 1，且诊断原文打在 stderr 上', () => {
  for (const name of Object.keys(LEDGER.cases)) {
    const r = runCli(['--check', '--content', path.join(INVALID_DIR, name, 'content')]);
    assert.equal(r.status, 1, `fixtures-invalid/${name} 应 EXIT 1；stdout=${r.stdout}`);
    for (const d of LEDGER.cases[name]) {
      const line = `${name}.md${d.line ? ':' + d.line : ''}: [${d.code}] ${d.message}`;
      assert.ok(
        r.stderr.includes(line),
        `fixtures-invalid/${name} 的 stderr 应逐字包含：\n${line}\n实际：\n${r.stderr}`,
      );
    }
  }
});

// ---------- ④ 围栏先跟踪（围栏里的 `##` 不误切） ----------

test('围栏里的 `## 假标题`：只报 1 条（不另报未知节）＋ 那段文字仍在详情正文里', () => {
  const file = path.join(INVALID_DIR, 'fence-with-heading', 'content/poems/fence-with-heading.md');
  const parsed = parsePoemRecord({ displayPath: file, id: 'fence-with-heading', text: fs.readFileSync(file, 'utf8') });
  // 结构证明①：只有 1 条诊断。若把围栏内的 `##` 当分界，这里会多出一条 UNKNOWN_SECTION。
  assert.deepEqual(parsed.errors.map((e) => e.code), ['MD_CODE_FENCE']);
  assert.equal(parsed.poem, null, '有诊断 ⇒ 不产诗对象（不写产物）');
  // 结构证明②：那一行仍留在详情正文里（没被当节切走）。
  assert.ok(parsed.draft.detail.includes('## 围栏里的假标题（夹具）'), '围栏里的 `## …` 必须在 detail 正文里');
  assert.ok(parsed.draft.detail.includes('夹具：围栏内的这个 ## 不算分界'), '围栏之后直到文件末尾都还在正文里');
});

// ---------- ④ 重复节 ----------

test('重复节诊断落在**第二次**出现的那一行', () => {
  const file = path.join(INVALID_DIR, 'duplicate-section', 'content/poems/duplicate-section.md');
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const detailLines = lines.map((l, i) => (l === '## 详情' ? i + 1 : 0)).filter(Boolean);
  assert.equal(detailLines.length, 2);
  const { errors } = compile('duplicate-section', 'rules-v4-invalid');
  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, 'DUPLICATE_SECTION');
  assert.equal(errors[0].line, detailLines[1]);
  assert.ok(errors[0].message.includes('第 12 行、第 16 行'), '要列出全部出现行号');
});

// ---------- ⑤ 空节 ⇒ null 保键 ----------

test('空节（含只有空白的节）⇒ 值 null，键仍在', () => {
  const { content } = compile('empty-and-blank-sections');
  const p = content.poems[0];
  assert.equal(p.detail, null);
  assert.equal(p.notes, null);
  assert.ok('detail' in p && 'notes' in p, '键必须保留');
});

test('合成：`## 笔记` 下只有空格与 Tab ⇒ 无诊断且 notes = null（文件里保不住不可见字符）', () => {
  const text = [
    '---',
    'title: "夹具"',
    'author: "佚名"',
    'dynasty: "汉"',
    'source: "夹具：不是真实数据。"',
    '---',
    '',
    '夹具正文一行。',
    '',
    '## 笔记',
    '   ',
    '\t',
    '',
  ].join('\n');
  const r = parsePoemRecord({ displayPath: '<合成字符串>.md', id: 'x', text });
  assert.deepEqual(r.errors, []);
  assert.equal(r.poem.notes, null);
  assert.ok('notes' in r.poem);
});

// ---------- 合成字符串：`##详情` 缺空格 / 原文里的 `**` ----------

test('合成：`##详情`（缺空格）⇒ MD_HEADING，且那一行原样留在正文里（不是新节）', () => {
  const text = [
    '---',
    'title: "夹具"',
    'author: "佚名"',
    'dynasty: "汉"',
    'source: "夹具：不是真实数据。"',
    '---',
    '',
    '夹具正文一行。',
    '',
    '##详情',
  ].join('\n');
  const r = parsePoemRecord({ displayPath: '<合成字符串>.md', id: 'x', text });
  assert.deepEqual(r.errors.map((e) => e.code), ['MD_HEADING']);
  assert.equal(r.errors[0].line, 10);
  assert.ok(r.errors[0].message.includes('缺一个空格'));
  // 结构证明：它没有被切成节（draft 里没有多出节），那一行留在正文里
  assert.deepEqual(r.draft.stanzas, [['夹具正文一行。'], ['##详情']]);
});

test('合成：原文里的 `**` 不是粗体 ⇒ 无诊断、诗行原样保留', () => {
  const text = [
    '---',
    'title: "夹具"',
    'author: "佚名"',
    'dynasty: "汉"',
    'source: "夹具：不是真实数据。"',
    '---',
    '',
    '**这一段是诗行，不是粗体。**',
  ].join('\n');
  const r = parsePoemRecord({ displayPath: '<合成字符串>.md', id: 'x', text });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.poem.stanzas, [['**这一段是诗行，不是粗体。**']]);
});

test('合成：原文区行首 `#` ⇒ MD_HEADING（原文不报别的 Markdown 规则）', () => {
  const text = [
    '---',
    'title: "夹具"',
    'author: "佚名"',
    'dynasty: "汉"',
    'source: "夹具：不是真实数据。"',
    '---',
    '',
    '# 原文区里的井号',
    '- 这不是列表：原文区不走 Markdown',
  ].join('\n');
  const r = parsePoemRecord({ displayPath: '<合成字符串>.md', id: 'x', text });
  assert.deepEqual(r.errors.map((e) => e.code), ['MD_HEADING']);
  assert.equal(r.errors[0].line, 8);
});

// ---------- ⑧ 未闭合强调（负责人 2026-10-16 落定） ----------

test('未闭合强调：`**粗体`（少收尾）与落单 `*` ⇒ MD_EMPHASIS_UNCLOSED，落在该行', () => {
  const caseText = (detailLine) =>
    [
      '---',
      'title: "夹具"',
      'author: "佚名"',
      'dynasty: "汉"',
      'source: "夹具：不是真实数据。"',
      '---',
      '',
      '夹具正文一行。',
      '',
      '## 详情',
      '',
      detailLine,
    ].join('\n');
  for (const line of ['**粗体少了收尾', '这里有一个落单的 * 星号', '**粗体** 里夹着的 * 落单了']) {
    const r = parsePoemRecord({ displayPath: '<合成字符串>.md', id: 'x', text: caseText(line) });
    assert.deepEqual(r.errors.map((e) => e.code), ['MD_EMPHASIS_UNCLOSED'], `应报未闭合：${line}`);
    assert.equal(r.errors[0].line, 12);
  }
  // 成对的写法不报
  for (const line of ['**粗体** 与 *斜体* 都成对', '- **游子不顾返** —— 成对']) {
    const r = parsePoemRecord({ displayPath: '<合成字符串>.md', id: 'x', text: caseText(line) });
    assert.deepEqual(r.errors, [], `不该报：${line}`);
  }
});

// ---------- ⑦ 朝代组名精确匹配（去掉 trim） ----------

test('朝代组名：精确匹配（`汉` 通过；`汉 `（尾随空格）与 `漢` 报 DYNASTY_UNDECLARED）', () => {
  const mk = (dynasty) =>
    ['---', 'title: "夹具"', 'author: "佚名"', `dynasty: ${dynasty}`, 'source: "夹具。"', '---', '', '正文行。'].join('\n');
  assert.deepEqual(parsePoemRecord({ displayPath: 'x.md', id: 'x', text: mk('"汉"') }).errors, []);
  for (const bad of ['"汉 "', '"漢"', '"东汉"', '"三国"']) {
    const r = parsePoemRecord({ displayPath: 'x.md', id: 'x', text: mk(bad) });
    assert.deepEqual(r.errors.map((e) => e.code), ['DYNASTY_UNDECLARED'], `${bad} 应报未声明`);
  }
  // 尾随空格那条要**把不可见字符写成可见转义**，并提示归一后的值
  const spaced = parsePoemRecord({ displayPath: 'x.md', id: 'x', text: mk('"汉 "') });
  assert.ok(spaced.errors[0].message.includes('\\u0020'), '尾随空格要写成 \\u0020');
  assert.ok(spaced.errors[0].message.includes('去掉首尾空白并按 NFC 归一后是 `汉`'));
});
