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
import { idFromRelativePath, scanPoems } from '../tools/lib/scan.mjs';
import { readTrackedPoemPaths } from '../tools/lib/tracked-poems.mjs';
import { PINYIN_COLLATOR_LOCALE, POEM_KEYS, POEM_TAG_KEYS, TAG_INDEX_KEYS } from '../tools/lib/interface.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const CLI = path.join(ROOT, 'tools', 'build-content.mjs');
const FIXTURES = path.join(ROOT, 'tests', 'fixtures');

/** 夹具序号计数器：`orderInSource` 自 2026-10-19 起**必填正整数、同一朝代内唯一**，
 * 而本文件里大量用例是「同一朝代里造几首诗只为了验标签」⇒ 每造一首就给一个全局递增值，
 * 不干扰标签断言，也不会撞上 `ORDER_IN_SOURCE_DUP`。需要指定值时显式传 `orderInSource`。 */
let fixtureOrder = 0;

/** 造一首诗源文本；`tags` 为 null 表示整段不写；`rawFront` 放额外原样行（如 `tags: []`）。 */
function poemText({
  title = '甲',
  author = '佚名',
  dynasty = '汉',
  orderInSource = null,
  tags = null,
  extraFront = [],
  body = '甲句一。',
}) {
  const order = orderInSource ?? ++fixtureOrder;
  const lines = ['---', `title: "${title}"`, `author: "${author}"`, `dynasty: "${dynasty}"`, `orderInSource: ${order}`];
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
    // 诊断带文件:行号，并落在「那一项」而不是文件头（标题/作者/朝代/orderInSource 4 行 + `tags:` 本体行 = 第 7 行）
    assert.equal(e.file, 'content/poems/甲.md');
    assert.equal(e.line, 7, `${c.label}：行号应指向第 7 行的列表项；message=${e.message}`);
    assert.match(e.message, /orderInTag/);
    assert.match(e.message, /必填/);
  }
});

test('多项时诊断行号定位到**出问题的那一项**（第二项缺 orderInTag 不应指到第一项）', () => {
  const { errors } = parsePoemRecord(
    record('甲', poemText({ tags: ['  - id: 甲组', '    orderInTag: 1', '  - id: 乙组'] })),
  );
  assert.deepEqual(codes(errors), ['TAG_ORDER_REQUIRED']);
  assert.equal(errors[0].line, 9, '应指向第 9 行（第二项）；message=' + errors[0].message);
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

// ---------- 真实内容：**逐首**按源字段派生（不写死标签个数/名单，也不把「某人只有一首」「必有缺口」当契约） ----------

/**
 * 从**源 MD 文本**独立读出一首诗 front matter 里的事实（不借编译器的解析结果——
 * 否则「产物对得上源」就成了自己证明自己）。读法故意只认这几种行形状：
 *
 *     title: "…" ／ dynasty: "…"
 *     orderInSource: 1
 *     tags:
 *       - id: 古诗十九首
 *         orderInTag: 1
 *
 * `tags: []` 与不写 `tags` 都读成「没有标签」；`orderInSource` **只**把未加引号的 ≥1 整数认成合法
 * （`"1"` 是字符串 ⇒ 编译器也报 NOT_INTEGER）。返回的 `orderCode` 与编译器的三条码一一对应：
 * 缺键/null ⇒ `ORDER_IN_SOURCE_REQUIRED`；写了但不是正整数 ⇒ `ORDER_IN_SOURCE_NOT_INTEGER`；合法 ⇒ `null`。
 */
function readFrontMatterFacts(record) {
  const lines = record.text.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === '---');
  const end = lines.findIndex((l, i) => i > start && l.trim() === '---');
  assert.ok(start >= 0 && end > start, `${record.id}：读不出 front matter`);
  const unquote = (v) => v.trim().replace(/^"(.*)"$/s, '$1');
  const facts = {
    displayPath: record.displayPath,
    id: record.id,
    title: null,
    dynasty: null,
    orderInSourceRaw: undefined,
    orderInSource: null,
    orderCode: null,
    tags: [],
  };
  let inTags = false;
  for (const raw of lines.slice(start + 1, end)) {
    if (/^\S/.test(raw)) {
      // 顶格 ⇒ 新的顶层键
      inTags = /^tags\s*:/.test(raw) && !/^tags\s*:\s*\[\s*\]\s*$/.test(raw);
      const kv = raw.match(/^([A-Za-z][A-Za-z0-9_]*)\s*:\s*(.*)$/);
      if (kv === null) continue;
      const [, key, value] = kv;
      if (key === 'title') facts.title = unquote(value);
      else if (key === 'dynasty') facts.dynasty = unquote(value);
      else if (key === 'orderInSource') facts.orderInSourceRaw = value.trim();
      continue;
    }
    if (!inTags) continue;
    const item = raw.match(/^\s*-\s*id\s*:\s*(.+)$/);
    if (item) {
      facts.tags.push({ id: unquote(item[1]), orderInTag: null });
      continue;
    }
    const order = raw.match(/^\s*orderInTag\s*:\s*(.+)$/);
    assert.ok(facts.tags.length, `${record.id}：orderInTag 出现在任何 - id 之前，测试读取器不认识这种写法`);
    facts.tags[facts.tags.length - 1].orderInTag = Number(order[1].trim());
  }
  const rawOrder = facts.orderInSourceRaw;
  if (rawOrder === undefined || rawOrder === '' || /^(null|~)$/i.test(rawOrder)) {
    facts.orderCode = 'ORDER_IN_SOURCE_REQUIRED'; // 这一行没写 / 写成了 null
  } else if (/^\d+$/.test(rawOrder) && Number(rawOrder) >= 1) {
    facts.orderInSource = Number(rawOrder); // 合法：≥1 的未加引号整数
  } else {
    facts.orderCode = 'ORDER_IN_SOURCE_NOT_INTEGER'; // "1"（字符串）/ 2.5 / 0 / -1
  }
  return facts;
}

test('真实 content/poems 逐首派生：每首的 orderInSource 是否必填正整数、tags 是否为空，都只按它自己的源断言', (t) => {
  const { records, errors: scanErrors } = scanPoems(path.join(ROOT, 'content', 'poems'));
  assert.deepEqual(scanErrors, []);
  assert.ok(records.length > 0, '真实内容里应当有诗（否则下面每条断言都是空的）');
  const facts = records.map(readFrontMatterFacts);
  const { content, errors } = buildContentFromRecords({ records, orderStrategy: 'source' });

  // ---- ① 缺号 / 非法号：**逐首**从它自己的 front matter 派生期望的诊断码，按文件逐条比 ----
  //      内容补号 ⇒ 这里没有期望诊断 ⇒ 自动变绿；内容又缺号 ⇒ 自动变红。不靠一份快照名单。
  /** @type {Map<string, string>} */
  const expectedByFile = new Map();
  for (const f of facts) if (f.orderCode !== null) expectedByFile.set(f.displayPath, f.orderCode);
  /** @type {Map<string, string>} */
  const actualByFile = new Map();
  for (const e of errors) {
    if (e.code === 'ORDER_IN_SOURCE_REQUIRED' || e.code === 'ORDER_IN_SOURCE_NOT_INTEGER') {
      actualByFile.set(e.file, e.code);
    }
  }
  const asPairs = (m) => [...m].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  assert.deepEqual(
    asPairs(actualByFile),
    asPairs(expectedByFile),
    '缺号/非法号的诊断必须能逐首从源 front matter 推出来（多/少都说明编译器或读取口径漂了）',
  );

  // ---- ② 同一朝代内撞号：期望的冲突组也从源派生（谁和谁撞不写死）；
  //      编译器**每组报一条** `ORDER_IN_SOURCE_DUP`，文案里列出该组全部 id（见 checkOrderInSourceUnique）。
  /** @type {Map<string, ReturnType<typeof readFrontMatterFacts>[]>} */
  const byDynastyOrder = new Map();
  for (const f of facts) {
    if (f.orderCode !== null) continue; // 缺号/非法号按上面那两条码算，不参与并列
    const key = `${f.dynasty}\u0000${f.orderInSource}`;
    if (!byDynastyOrder.has(key)) byDynastyOrder.set(key, []);
    byDynastyOrder.get(key).push(f);
  }
  const expectedDupGroups = [...byDynastyOrder.values()]
    .filter((group) => group.length > 1)
    .map((group) => group.map((f) => f.id).sort());
  const dupErrors = errors.filter((e) => e.code === 'ORDER_IN_SOURCE_DUP');
  assert.equal(
    dupErrors.length,
    expectedDupGroups.length,
    `源 front matter 里算出 ${expectedDupGroups.length} 组同朝代同号 ⇒ 应有同样多条 ORDER_IN_SOURCE_DUP；实际：${JSON.stringify(dupErrors.map((e) => e.message))}`,
  );
  const unmatched = [...expectedDupGroups];
  for (const e of dupErrors) {
    const i = unmatched.findIndex((ids) => ids.every((id) => e.message.includes(`\`${id}\``)));
    assert.ok(i >= 0, `这条 ORDER_IN_SOURCE_DUP 对不上源里任何一组撞号：${e.message}`);
    unmatched.splice(i, 1);
  }
  assert.deepEqual(unmatched, [], '源里有撞号，但编译器没报（或没把同组的 id 都列出来）');

  // order 族只有这三条码：上面两条已经逐一核过，这里保证没有哪条被漏在评估之外
  const family = errors.filter((e) => /^ORDER_IN_SOURCE_/.test(e.code));
  assert.equal(
    family.length,
    actualByFile.size + dupErrors.length,
    `order 族里出现了没被逐条核过的诊断：${JSON.stringify(family.map((e) => e.code))}`,
  );

  if (errors.length > 0) {
    assert.equal(content, null, '有诊断 ⇒ 不产出产物（不发布半份内容）');
    t.diagnostic(
      `真实内容此刻有 ${errors.length} 条诊断（${[...new Set(errors.map((e) => e.code))].join('、')}）；` +
        'order 族已按逐首派生断言过，但编译失败就没有产物可逐首比对 ⇒ 下面那段要等内容补齐后才会真正执行',
    );
    return;
  }

  // ---- ③ 产物逐首比对：orderInSource 与 tags（空 ⇒ []、非空 ⇒ 与源逐条相同、次序不重排） ----
  assert.equal(facts.length, new Set(facts.map((f) => f.id)).size, '源里出现重复 id');
  assert.equal(content.poems.length, facts.length, '产物首数与源文件数不一致');
  for (const f of facts) {
    const poem = content.poems.find((p) => p.id === f.id);
    assert.ok(poem, `产物里没有 ${f.id}`);
    assert.equal(poem.orderInSource, f.orderInSource, `${f.id}：产物 orderInSource 应与源里的 ${f.orderInSource} 相同`);
    assert.equal(poem.dynasty, f.dynasty, `${f.id}：产物 dynasty 应与源里的「${f.dynasty}」相同`);
    assert.equal(poem.title, f.title, `${f.id}：产物 title 应与源里的「${f.title}」相同`);
    // 「有没有标签」也逐首比对：源里没写 ⇒ 产物必须是 []（不是 null）；写了 ⇒ 逐条相同
    assert.deepEqual(poem.tags, f.tags, `${f.id}：产物 tags 应与源 front matter 逐条相同`);
  }
});

// ---------- 真实 content/poems：按源派生的标签一致（标签间拼音序、标签内 orderInTag 升序） ----------

test('真实 content/poems：顶层 tags 与诗侧归属**按源派生**一致（标签间拼音序、标签内 orderInTag 升序）', () => {
  const { content, declared } = buildTrackedContent();
  const compare = new Intl.Collator(PINYIN_COLLATOR_LOCALE).compare;

  // 期望的标签集合 = 源里出现过的 id（去重）——不写死名单
  const declaredEntries = declared.flatMap((d) => d.tags.map((t) => ({ poemId: d.id, ...t })));
  assert.ok(declaredEntries.length > 0, '本次真实内容里应当有人声明标签（否则下面每一条断言都是空的）');
  const expectedTagIds = [...new Set(declaredEntries.map((e) => e.id))];

  // ① 标签之间：产物顺序 == 编译期拼音序（拿派生集合现算，不用常量）
  assert.deepEqual(content.tags.map((t) => t.id), expectedTagIds.slice().sort(compare));

  // ② 标签内：members == 声明了该标签的诗按 orderInTag 升序（同序冲突由编译器报错，这里不重排兜底）
  for (const tagId of expectedTagIds) {
    const expectedMembers = declaredEntries
      .filter((e) => e.id === tagId)
      .sort((a, b) => a.orderInTag - b.orderInTag)
      .map((e) => e.poemId);
    const actual = content.tags.find((t) => t.id === tagId);
    assert.ok(actual, `产物顶层 tags 缺了源里声明过的「${tagId}」`);
    assert.deepEqual(actual.members, expectedMembers, `「${tagId}」的 members 与源归属/orderInTag 不一致`);
    assert.equal(new Set(actual.members).size, actual.members.length, `「${tagId}」成员不得重复`);
  }

  // ③ 诗侧：只保留源里写的那几条声明（次序不重排），orderInTag 原样带出；没声明的就是 []
  for (const d of declared) {
    const poem = content.poems.find((p) => p.id === d.id);
    assert.ok(poem, `产物里没有 ${d.id}`);
    assert.deepEqual(poem.tags, d.tags, `${d.id} 的诗侧 tags 应与源声明逐条相同`);
  }
  const tagged = new Set(declaredEntries.map((e) => e.poemId));
  for (const p of content.poems) {
    if (!tagged.has(p.id)) assert.deepEqual(p.tags, [], `${p.id} 源里没有声明标签 ⇒ 产物必须是 []`);
  }

  // ④ 双向闭合：反向索引里出现的诗，诗侧也必须认这条标签（上面 ③ 逐首比对已覆盖方向一，这里补方向二）
  for (const tag of content.tags) {
    for (const id of tag.members) {
      const poem = content.poems.find((p) => p.id === id);
      assert.ok(poem.tags.some((x) => x.id === tag.id), `${id} 未在诗侧声明「${tag.id}」却被收进它的 members`);
    }
  }
  assertTagIndexConsistent(content.poems, content.tags);
});

// ---------- 已跟踪内容的**实况快照**（不是格式契约；从「已跟踪诗源清单」派生，工作区多一首未跟踪稿不会弄红） ----------

/**
 * 只取**已跟踪**的源文件。清单来源由 `tools/lib/tracked-poems.mjs` 统一解析：
 *   环境变量 `SUOFEI_TRACKED_POEMS` > 本仓库根的 `git ls-files` > 已提交清单 `content/tracked-poems.json`。
 *
 * 为什么不直接扫目录：工作区里可能有一首还没 `git add` 的稿子（用户本机就有这种情形）。
 * 那时「本次已跟踪内容长什么样」被未提交的文件弄红，说的就不是已落库的内容了——用户
 * 2026-10-19 明确要求这类实况用例从**已跟踪内容**派生。
 *
 * 为什么不再在这里直接 `spawnSync('git', …)`（2026-10-19 实测）：
 *   - 没有 `.git` 的 `git archive` 展开目录里，git 直接 `fatal`（退出 128）⇒ 用例红，红的是**环境**；
 *   - 仓库内部的副本（`release/out/.work/...`）里，git 会向上解析到**父仓**，
 *     对副本 cwd 返回**空清单、退出 0** ⇒ 用例红，而且报错像是「已跟踪的诗源为空」。
 *   现在这两种目录都从**随内容提交的清单**读同一份事实；实在没有清单就**明确报「未提供清单」**
 *   （这一条没查，不是通过），而不是猜一个空列表。
 */
function readTrackedPoems() {
  let list;
  try {
    list = readTrackedPoemPaths(ROOT);
  } catch (err) {
    // 「未提供清单」必须是红，并把来源/修法原样带出来（没查 ≠ 通过）。
    assert.fail(err.message);
  }
  const { paths, source } = list;
  assert.ok(paths.length > 0, `已跟踪诗源清单为空（来源：${source}）——这一条没查成，不是通过`);
  return paths.map((rel) => {
    const abs = path.join(ROOT, rel);
    assert.ok(
      fs.existsSync(abs),
      `清单（来源：${source}）里的 ${rel} 在磁盘上不存在 ⇒ 清单过期？运行 node tools/gen-tracked-poems-manifest.mjs`,
    );
    const relToPoems = rel.replace(/^content\/poems\//, '');
    return {
      displayPath: rel,
      relPath: relToPoems,
      id: idFromRelativePath(relToPoems),
      text: fs.readFileSync(abs, 'utf8'),
    };
  });
}

/** 已跟踪内容的编译结果（实况快照与按源派生的标签用例共用；**不含**工作区里未跟踪的稿子）。 */
function buildTrackedContent() {
  const records = readTrackedPoems();
  const { content, errors } = buildContentFromRecords({
    records,
    explicitVersion: '2026.10.18.1',
    orderStrategy: 'source',
  });
  // 已跟踪内容必须能编译：它是 `build-content.mjs --check` 与两端内置内容的同一份事实；
  // 编不过就说明仓库里放着半份内容（这不是「实况快照」，是坏了）。
  assert.deepEqual(errors, [], '已跟踪内容应当能编译通过（未跟踪的稿子不在这份清单里）');
  assert.ok(content);
  return { records, content, declared: records.map(readFrontMatterFacts) };
}

test('【已跟踪内容实况，不是契约】24 首、2 个标签（古诗十九首 19 ／ 唐诗三百首 3）、近现代两首（忆秦娥 1 ／ 七律 2）', () => {
  const { records, content } = buildTrackedContent();

  // ⚠ 这一条断言的是「**本次已跟踪内容**长这样」——**内容实况，不是格式契约**。
  //   格式契约（orderInSource 必填正整数、朝代内唯一、标签拼音序、members 按 orderInTag 升序、
  //   无标签 ⇒ []……）由上面那些**按源逐首派生**的用例与夹具用例负责，不依赖作者名，也不依赖
  //   「某人只有一首」。内容线改动内容（例如把一首新诗 `git add` 进来）就跟着改这里；
  //   **工作区里未跟踪**的新诗不会让它红。
  assert.equal(records.length, 24, '已跟踪 24 首源文件');
  assert.equal(content.poems.length, records.length, '产物首数 = 已跟踪源文件数');
  assert.deepEqual(content.dynasties, ['汉', '唐', '近现代'], '本次实况：三个朝代组');

  // 标签：本次实况是 2 个（古诗十九首 19 首、唐诗三百首 3 首）
  assert.deepEqual(content.tags.map((t) => t.id), ['古诗十九首', '唐诗三百首']);
  const membersOf = (id) => {
    const tag = content.tags.find((t) => t.id === id);
    assert.ok(tag, `本次实况里应有标签「${id}」`);
    return tag.members;
  };
  assert.equal(membersOf('古诗十九首').length, 19);
  assert.equal(membersOf('唐诗三百首').length, 3);
  const titleOf = new Map(content.poems.map((p) => [p.id, p.title]));
  const titlesOf = (id) => membersOf(id).map((pid) => titleOf.get(pid));

  // members 次序（本次实况）：古诗十九首 = 《文选》卷二十九原次序（docs/sources/gushi-shijiu-shou.md §5.1）；
  // 唐诗三百首 = 望岳 → 梦李白其一 → 梦李白其二（见 docs/sources/wangyue-intake.md §4）。
  // 这里写死的是**本轮真数据的次序**，契约「members 按 orderInTag 升序」已在上面按源断言。
  assert.deepEqual(titlesOf('古诗十九首'), [
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
  ]);
  assert.deepEqual(
    membersOf('古诗十九首').map((pid) => content.poems.find((p) => p.id === pid).tags[0].orderInTag),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
  );
  assert.deepEqual(titlesOf('唐诗三百首'), ['望岳', '梦李白二首·其一', '梦李白二首·其二']);

  // 近现代：**已跟踪**内容里 2 首——《忆秦娥·娄山关》（orderInSource=1）→《七律·和郭沫若同志》（orderInSource=2），
  //   两首都没有标签（用户未给这两首加标签，产物 `tags: []` 合法）。
  //   这是实况（此刻被跟踪到了哪几首、它们写了什么号），不是「某作者只有一首」「某作者必无标签」的规则。
  const modern = content.poems.filter((p) => p.dynasty === '近现代');
  assert.deepEqual(modern.map((p) => p.title), ['忆秦娥·娄山关', '七律·和郭沫若同志']);
  assert.deepEqual(modern.map((p) => p.orderInSource), [1, 2]);
  for (const p of modern) assert.deepEqual(p.tags, [], `本次实况：${p.title} 没有标签`);

  // 无标签的诗（本次实况）：2 首，就是上面那两首近现代
  const untagged = content.poems.filter((p) => p.tags.length === 0);
  assert.deepEqual(untagged.map((p) => p.id), modern.map((p) => p.id), '本次实况：无标签的只有近现代那两首');
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
  assert.equal(errors[0].line, 7);
  assert.match(errors[0].message, /orderInTag/);
});
