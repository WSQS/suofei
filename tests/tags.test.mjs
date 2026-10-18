// 契约线 C：标签（formatVersion=3，用户 2026-10-18 定）的编译期规则。
//
// 已定的规则（只实现这些，不扩未选的专题）：
//   ① 源里**可以不写** `tags` ⇒ 产物 `tags: []`（不是 null）；
//   ② `orderInTag` **必填**、不可省略、不可 null ⇒ 否则编译非零退出（`TAG_ORDER_REQUIRED`）；
//   ③ 标签集合**从诗归属自动汇总**（不手写标签表）；中文 id 直接显示；
//   ④ 标签之间按**拼音**排序、编译期生成；**不发布任何 SortKey**；
//   ⑤ 同标签内同序 ⇒ `TAG_ORDER_DUP` 报错，**不得**默默用 id 排序次。
//
// 两件不同的事，测试也分开：
//   「标签之间」＝拼音（`Intl.Collator('zh-Hans-CN-u-co-pinyin')`，判等时码点序兜底）；
//   「标签内」  ＝ `orderInTag` 升序。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import {
  assertTagIndexConsistent,
  buildContentFromRecords,
  buildTagIndex,
  parsePoemRecord,
} from '../tools/lib/content-build.mjs';
import { fieldPaths } from '../tools/lib/field-set.mjs';
import { scanPoems } from '../tools/lib/scan.mjs';
import { PINYIN_COLLATOR_LOCALE, POEM_KEYS, POEM_TAG_KEYS, TAG_INDEX_KEYS } from '../tools/lib/interface.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const CLI = path.join(ROOT, 'tools', 'build-content.mjs');
const FIXTURES = path.join(ROOT, 'tests', 'fixtures');

/** 造一首诗源文本；`tags` 为 null 表示整段不写；`rawFront` 放额外原样行（如 `tags: []`）。 */
function poemText({ title = '甲', author = '佚名', dynasty = '汉', tags = null, extraFront = [], body = '甲句一。' }) {
  const lines = ['---', `title: "${title}"`, `author: "${author}"`, `dynasty: "${dynasty}"`];
  lines.push(...extraFront);
  if (tags !== null) {
    lines.push('tags:');
    for (const line of tags) lines.push(line);
  }
  lines.push('source: "夹具：不是真实数据。"', '---', '', body, '');
  return lines.join('\n');
}

function record(id, text) {
  return { displayPath: `content/poems/${id}.md`, id, text };
}

/** 直接走纯函数构建（不碰文件系统）。 */
function build(records) {
  return buildContentFromRecords({ records, explicitVersion: '2026.10.18.1', orderStrategy: 'source' });
}

function codes(errors) {
  return errors.map((e) => e.code);
}

function runCli(args) {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', cwd: ROOT });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

// ---------- ① 不写 tags ⇒ [] ----------

test('源里不写 tags ⇒ 产物 tags: []（不是 null），顶层 tags: []', () => {
  const { content, errors } = build([record('甲', poemText({}))]);
  assert.deepEqual(errors, []);
  assert.deepEqual(content.poems[0].tags, []);
  assert.deepEqual(content.tags, []);
  // 键仍在、形状恒定：客户端不用判 undefined
  assert.deepEqual(Object.keys(content.poems[0].tags), []);
  assert.ok(fieldPaths(content).includes('poems[].tags[]'));
});

test('源里写 `tags: []` ⇒ 与不写等价（都是 []）', () => {
  const { content, errors } = build([record('甲', poemText({ extraFront: ['tags: []'] }))]);
  assert.deepEqual(errors, []);
  assert.deepEqual(content.poems[0].tags, []);
  assert.deepEqual(content.tags, []);
});

// ---------- ② orderInTag 必填 ----------

test('orderInTag 缺失 / 为 null / 非整数 / < 1 ⇒ TAG_ORDER_REQUIRED（不猜、不置 null）', () => {
  const cases = [
    { label: '缺键', tags: ['  - id: 测试标签'] },
    { label: 'null', tags: ['  - id: 测试标签', '    orderInTag: null'] },
    { label: '非整数', tags: ['  - id: 测试标签', '    orderInTag: 2.5'] },
    { label: '0', tags: ['  - id: 测试标签', '    orderInTag: 0'] },
    { label: '负数', tags: ['  - id: 测试标签', '    orderInTag: -1'] },
    { label: '字符串', tags: ['  - id: 测试标签', '    orderInTag: "1"'] },
  ];
  for (const c of cases) {
    const { content, errors } = build([record('甲', poemText({ tags: c.tags }))]);
    assert.equal(content, null, `${c.label}：应编译失败`);
    assert.deepEqual(codes(errors), ['TAG_ORDER_REQUIRED'], `${c.label}：${JSON.stringify(errors.map((e) => e.message))}`);
    const e = errors[0];
    // 诊断带文件:行号，并落在「那一项」而不是文件头（标题/作者/朝代 3 行 + `tags:` 本体行 = 第 6 行）
    assert.equal(e.file, 'content/poems/甲.md');
    assert.equal(e.line, 6, `${c.label}：行号应指向第 6 行的列表项；message=${e.message}`);
    assert.match(e.message, /orderInTag/);
    assert.match(e.message, /必填/);
  }
});

test('多项时诊断行号定位到**出问题的那一项**（第二项缺 orderInTag 不应指到第一项）', () => {
  const { errors } = parsePoemRecord(
    record('甲', poemText({ tags: ['  - id: 甲组', '    orderInTag: 1', '  - id: 乙组'] })),
  );
  assert.deepEqual(codes(errors), ['TAG_ORDER_REQUIRED']);
  assert.equal(errors[0].line, 8, '应指向第 8 行（第二项）；message=' + errors[0].message);
  assert.match(errors[0].message, /乙组/);
});

// ---------- ⑤ 同标签同序 ⇒ 报错 ----------

test('同一标签内同序 ⇒ TAG_ORDER_DUP（跨诗；不默默用 id 排）', () => {
  const { content, errors } = build([
    record('乙', poemText({ title: '乙', tags: ['  - id: 测试标签', '    orderInTag: 2'] })),
    record('丙', poemText({ title: '丙', tags: ['  - id: 测试标签', '    orderInTag: 2'] })),
  ]);
  assert.equal(content, null);
  assert.deepEqual(codes(errors), ['TAG_ORDER_DUP']);
  assert.match(errors[0].message, /测试标签/);
  assert.match(errors[0].message, /orderInTag: 2/);
  assert.match(errors[0].message, /乙/);
  assert.match(errors[0].message, /丙/);
  // 不同标签里的相同序号不算冲突（「标签内」是各自的事）
  const ok = build([
    record('甲', poemText({ tags: ['  - id: 甲组', '    orderInTag: 1'] })),
    record('丁', poemText({ title: '丁', tags: ['  - id: 乙组', '    orderInTag: 1'] })),
  ]);
  assert.deepEqual(ok.errors, []);
});

test('CLI：缺 orderInTag 与同序冲突都以非零退出，且不写产物', () => {
  const required = runCli(['--check', '--content', path.join(FIXTURES, 'tags-order-required', 'content')]);
  assert.equal(required.status, 1);
  assert.match(required.stderr, /\[TAG_ORDER_REQUIRED\]/);

  const dup = runCli(['--check', '--content', path.join(FIXTURES, 'tags-order-dup', 'content')]);
  assert.equal(dup.status, 1);
  assert.match(dup.stderr, /\[TAG_ORDER_DUP\]/);

  const ok = runCli(['--check', '--content', path.join(FIXTURES, 'tags-ok', 'content')]);
  assert.equal(ok.status, 0, ok.stderr);
});

// ---------- ③ 汇总 + ④ 标签之间拼音 / 标签内 orderInTag ----------

test('顶层 tags 从诗归属汇总：标签之间按拼音，members 按 orderInTag 升序', () => {
  const { content, errors } = build([
    record(
      '古诗十九首-行行重行行',
      poemText({
        title: '行行重行行',
        tags: ['  - id: 古诗十九首', '    orderInTag: 1', '  - id: 唐诗三百首', '    orderInTag: 9'],
      }),
    ),
    record('唐诗-静夜思', poemText({ title: '静夜思', dynasty: '唐', tags: ['  - id: 唐诗三百首', '    orderInTag: 2'] })),
    record('宋-浣溪沙', poemText({ title: '浣溪沙', dynasty: '宋', tags: ['  - id: 宋词', '    orderInTag: 1'] })),
  ]);
  assert.deepEqual(errors, []);
  assert.deepEqual(
    content.tags,
    [
      // 古(gu) < 宋(song) < 唐(tang)：与 Intl.Collator('zh-Hans-CN-u-co-pinyin') 一致
      { id: '古诗十九首', members: ['古诗十九首-行行重行行'] },
      { id: '宋词', members: ['宋-浣溪沙'] },
      // members 按 orderInTag 升序（静夜思 2 在 行行重行行 9 之前），与诗的数组次序无关
      { id: '唐诗三百首', members: ['唐诗-静夜思', '古诗十九首-行行重行行'] },
    ],
  );
  // 标签之间次序 = collator 结果（不是手写常量）
  const expectOrder = content.tags.map((t) => t.id).slice().sort(new Intl.Collator(PINYIN_COLLATOR_LOCALE).compare);
  assert.deepEqual(content.tags.map((t) => t.id), expectOrder);
  // 诗侧标签保持源里书写次序（不重排、不丢）
  const poem = content.poems.find((p) => p.id === '古诗十九首-行行重行行');
  assert.deepEqual(poem.tags, [
    { id: '古诗十九首', orderInTag: 1 },
    { id: '唐诗三百首', orderInTag: 9 },
  ]);
  // 双向一致（编译器内部断言；这里再独立验一遍）
  assertTagIndexConsistent(content.poems, content.tags);
});

test('拼音排序的稳定兜底：collator 判等时按码点序定序，且与输入次序无关、可复现', () => {
  const compare = new Intl.Collator(PINYIN_COLLATOR_LOCALE).compare;
  const nfc = '\u00e9'; // é（预组合）
  const nfd = 'e\u0301'; // e ＋ 组合重音：与上面在 collator 里判等，但码点不同
  assert.equal(compare(nfc, nfd), 0, '夹具前提：这两个字符串在 collator 里判等');
  assert.notEqual(nfc, nfd);

  const one = buildTagIndex([
    { id: 'a', tags: [{ id: nfc, orderInTag: 1 }] },
    { id: 'b', tags: [{ id: nfd, orderInTag: 1 }] },
  ]);
  const two = buildTagIndex([
    { id: 'a', tags: [{ id: nfd, orderInTag: 1 }] },
    { id: 'b', tags: [{ id: nfc, orderInTag: 1 }] },
  ]);
  assert.deepEqual(one.map((t) => t.id), two.map((t) => t.id), '输入次序不同，结果必须相同（确定、可复现）');
  assert.deepEqual(one.map((t) => t.id), [nfd, nfc], '判等后按码点序兜底：先 e(U+0065)，后 é(U+00E9)');
});

// ---------- 形状不合法（沿用既有风格：报错，不静默丢） ----------

test('tags 形状不合法 ⇒ TAG_SHAPE（不是列表 / 元素不是对象 / 声明外的键 / id 不合法）', () => {
  const cases = [
    { label: 'tags 不是列表', tags: null, raw: 'tags: 古诗十九首' },
    { label: '元素是标量', tags: ['  - 古诗十九首'] },
    { label: '元素缺 id', tags: ['  - orderInTag: 1'] },
    { label: 'id 为空', tags: ['  - id: ""', '    orderInTag: 1'] },
    { label: 'id 带尾随空白', tags: ['  - id: "古诗十九首 "', '    orderInTag: 1'] },
    { label: '声明外的键（name/aliases）', tags: ['  - id: 古诗十九首', '    orderInTag: 1', '    name: 古诗'] },
  ];
  for (const c of cases) {
    const text =
      c.raw !== undefined
        ? poemText({}).replace('source:', `${c.raw}\nsource:`)
        : poemText({ tags: c.tags });
    const { content, errors } = build([record('甲', text)]);
    assert.equal(content, null, `${c.label}：应编译失败`);
    assert.deepEqual(codes(errors), ['TAG_SHAPE'], `${c.label}：${JSON.stringify(errors.map((e) => e.message))}`);
    assert.equal(errors[0].file, 'content/poems/甲.md');
    assert.equal(typeof errors[0].line, 'number');
  }
  // 形状文案要说清允许的键（不然读者不知道为什么 name 不行）
  assert.ok(POEM_TAG_KEYS.every((k) => ['id', 'orderInTag'].includes(k)));
});

test('同一首诗里同一标签出现两次 ⇒ TAG_DUPLICATE_ID（留两份互相矛盾的 orderInTag 是最坏的）', () => {
  const { content, errors } = build([
    record('甲', poemText({ tags: ['  - id: 测试标签', '    orderInTag: 1', '  - id: 测试标签', '    orderInTag: 2'] })),
  ]);
  assert.equal(content, null);
  assert.deepEqual(codes(errors), ['TAG_DUPLICATE_ID']);
  assert.match(errors[0].message, /测试标签/);
});

// ---------- 「不发布 SortKey」+ 键集 ----------

test('产物里没有任何 SortKey 字段：诗侧 {id,orderInTag}、顶层 {id,members}，逐字比对', () => {
  const { content } = build([
    record('甲', poemText({ tags: ['  - id: 古诗十九首', '    orderInTag: 1'] })),
  ]);
  const raw = JSON.stringify(content);
  assert.equal(/SortKey|sortKey|pinyinKey|tagSortKey/.test(raw), false, `产物里出现了排序键：${raw}`);
  assert.deepEqual(Object.keys(content.poems[0].tags[0]), [...POEM_TAG_KEYS]);
  assert.deepEqual(Object.keys(content.tags[0]), [...TAG_INDEX_KEYS]);
  const paths = fieldPaths(content);
  assert.ok(paths.includes('poems[].tags[].id'));
  assert.ok(paths.includes('poems[].tags[].orderInTag'));
  assert.ok(paths.includes('tags[].members[]'));
  assert.equal(paths.some((p) => /sort/i.test(p)), false, `字段集里不应有排序路径：${paths.filter((p) => /sort/i.test(p))}`);
});

// ---------- 内部一致性断言不是空过的 ----------

test('assertTagIndexConsistent：两边不一致时必须抛（否则它只是一句注释）', () => {
  const poems = [{ id: '甲', tags: [{ id: 'X' }] }];
  assert.doesNotThrow(() => assertTagIndexConsistent(poems, [{ id: 'X', members: ['甲'] }]));
  assert.throws(() => assertTagIndexConsistent(poems, [{ id: 'Y', members: ['甲'] }]), /内部不一致/);
  assert.throws(() => assertTagIndexConsistent(poems, []), /内部不一致/);
  assert.throws(() => assertTagIndexConsistent([], [{ id: 'X', members: ['不存在'] }]), /内部不一致/);
});

// ---------- 真实内容：只有「古诗十九首」19 条 ----------

test('真实 content/poems：古诗十九首 19 首各 1 条归属，其余 3 首 tags: []', () => {
  const { records, errors: scanErrors } = scanPoems(path.join(ROOT, 'content', 'poems'));
  assert.deepEqual(scanErrors, []);
  const { content, errors } = buildContentFromRecords({ records, orderStrategy: 'source' });
  assert.deepEqual(errors, []);

  // 顶层只有「古诗十九首」一个标签
  assert.deepEqual(content.tags.map((t) => t.id), ['古诗十九首']);
  const members = content.tags[0].members;
  assert.equal(members.length, 19);
  assert.equal(new Set(members).size, 19, '成员不得重复');

  // members 次序 = orderInTag 升序 = 《文选》卷二十九原次序（docs/sources/gushi-shijiu-shou.md §5.1）
  const expectByOrder = [
    '行行重行行',
    '青青河畔草',
    '青青陵上柏',
    '今日良宴会',
    '西北有高楼',
    '涉江采芙蓉',
    '明月皎夜光',
    '冉冉孤生竹',
    '庭中有奇树',
    '迢迢牵牛星',
    '回车驾言迈',
    '东城高且长',
    '驱车上东门',
    '去者日以疏',
    '生年不满百',
    '凛凛岁云暮',
    '孟冬寒气至',
    '客从远方来',
    '明月何皎皎',
  ];
  const titleOf = new Map(content.poems.map((p) => [p.id, p.title]));
  assert.deepEqual(members.map((id) => titleOf.get(id)), expectByOrder);
  assert.deepEqual(members.map((id) => content.poems.find((p) => p.id === id).tags[0].orderInTag), [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
  ]);
  // 每首古诗十九首都只有这一条归属
  for (const id of members) {
    const poem = content.poems.find((p) => p.id === id);
    assert.deepEqual(poem.tags, [{ id: '古诗十九首', orderInTag: poem.tags[0].orderInTag }]);
  }

  // 其余 3 首：tags 为空数组（梦李白二首／毛诗——《唐诗三百首》归属有证（S11）、该版本编次未核，故本轮不打）
  const others = content.poems.filter((p) => !members.includes(p.id));
  assert.deepEqual(others.map((p) => p.title).sort(), ['七律·和郭沫若同志', '梦李白二首·其一', '梦李白二首·其二'].sort());
  for (const p of others) assert.deepEqual(p.tags, [], `${p.id} 应没有标签`);
});

test('契约夹具 real-01-full.json 仍是当前形状（v3 顶层键序 / 11 键 / 字段集与冻结记录一致）', () => {
  const doc = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'contract', 'real-01-full.json'), 'utf8'));
  const record = JSON.parse(fs.readFileSync(path.join(ROOT, 'schema', 'format-version.json'), 'utf8'));
  const v3 = record.versions.find((v) => v.formatVersion === 3);
  assert.ok(v3, 'schema/format-version.json 里应有 v3 记录');
  assert.equal(doc.formatVersion, 3);
  assert.deepEqual(Object.keys(doc), ['formatVersion', 'contentVersion', 'generatedAt', 'dynasties', 'tags', 'poems']);
  for (const p of doc.poems) assert.deepEqual(Object.keys(p), [...POEM_KEYS]);
  // 夹具自身声明的字段集必须就是冻结记录里那一份（否则它就不是「客户端认得的形状」的样张）
  assert.deepEqual(fieldPaths(doc), v3.fieldPaths);
});

// ---------- 命令行 + schema ----------

test('CLI 编译 tags-ok 夹具：EXIT 0，产物形状符合契约（顶层 tags 与诗侧 tags 双向对得上）', () => {
  const out = path.join(fs.mkdtempSync(path.join(tmpdir(), 'suofei-tags-')), 'content.json');
  try {
    const r = runCli(['--quiet', '--content', path.join(FIXTURES, 'tags-ok', 'content'), '--out', out]);
    assert.equal(r.status, 0, r.stderr);
    const doc = JSON.parse(fs.readFileSync(out, 'utf8'));
    assert.equal(doc.formatVersion, 3);
    assert.deepEqual(doc.tags.map((t) => t.id), ['古诗十九首', '宋词', '唐诗三百首']);
    assertTagIndexConsistent(doc.poems, doc.tags);
    const v = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'validate-content.mjs'), out], {
      encoding: 'utf8',
      cwd: ROOT,
    });
    assert.equal(v.status, 0, v.stderr);
  } finally {
    fs.rmSync(path.dirname(out), { recursive: true, force: true });
  }
});

test('parsePoemRecord：tags 的关键诊断带文件:行号（不是只给一个码）', () => {
  const { errors } = parsePoemRecord(record('甲', poemText({ tags: ['  - id: 测试标签'] })));
  assert.deepEqual(codes(errors), ['TAG_ORDER_REQUIRED']);
  assert.equal(errors[0].line, 6);
  assert.match(errors[0].message, /orderInTag/);
});
