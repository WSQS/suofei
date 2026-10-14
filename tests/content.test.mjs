// 契约线 C：校验/排序/版本规则的单元测试（不经过 CLI）。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildContentFromRecords,
  buildStanzas,
  collatorRankMap,
  computeSortKeys,
  isUnknownAuthor,
  sortPoems,
  validatePoemRecord,
} from '../tools/lib/content-build.mjs';
import { DYNASTIES } from '../tools/lib/dynasties.mjs';
import {
  compareContentVersion,
  deriveDevVersion,
  isDevVersion,
  parseContentVersion,
  resolveContentVersion,
} from '../tools/lib/version.mjs';

// ---------- 分段：空行是边界，行不丢 ----------

test('buildStanzas：空行分段、连续空行折叠、首尾空行忽略', () => {
  assert.deepEqual(buildStanzas(['甲', '', '乙', '', '', '丙', '']), [['甲'], ['乙'], ['丙']]);
  assert.deepEqual(buildStanzas(['', '', '甲']), [['甲']]);
  assert.deepEqual(buildStanzas([]), []);
  assert.deepEqual(buildStanzas(['', '  ', '\t']), []);
});

test('buildStanzas：去行尾空白，保留行首缩进（续行信息不丢）', () => {
  assert.deepEqual(buildStanzas(['  甲乙  ', '丙 ']), [['  甲乙', '丙']]);
});

// ---------- 佚名判定 ----------

test('isUnknownAuthor：契约标记与空值', () => {
  for (const a of ['佚名', '无名氏', '未知', '未详', '不详', '', '   ']) {
    assert.equal(isUnknownAuthor(a), true, `${a} 应视为未知作者`);
  }
  for (const a of ['曹植', '蔡邕', '杜牧']) {
    assert.equal(isUnknownAuthor(a), false, `${a} 不应视为未知作者`);
  }
});

// ---------- 拼音排序键 ----------

test('collatorRankMap：按拼音而非码位排序', () => {
  const ranks = collatorRankMap(['行行重行行', '青青河畔草', '涉江采芙蓉']);
  assert.ok(ranks.get('青青河畔草') < ranks.get('涉江采芙蓉'));
  assert.ok(ranks.get('涉江采芙蓉') < ranks.get('行行重行行'));
});

test('collatorRankMap：名次稳定、可复现', () => {
  const a = collatorRankMap(['乙', '甲', '丙']);
  const b = collatorRankMap(['丙', '乙', '甲']);
  assert.deepEqual([...a.entries()].sort(), [...b.entries()].sort());
});

// ---------- 组内排序：作者 → 诗名，佚名最后 ----------

function poem(id, { dynasty = '汉', order = 100, author, title }) {
  return { id, author, title, dynastyKey: 'x', dynastyLabel: dynasty, dynastyOrder: order };
}

test('sortPoems：佚名/未知作者显式排在组内最后', () => {
  const poems = [
    poem('a-01', { author: '佚名', title: '甲' }),
    poem('b-01', { author: '曹植', title: '乙' }),
    poem('c-01', { author: '无名氏', title: '丙' }),
    poem('d-01', { author: '蔡邕', title: '丁' }),
  ];
  sortPoems(poems);
  // 具名在前（蔡邕 cai < 曹植 cao）；未知标记统一在最后，它们之间仍按拼音序（无名氏 wu < 佚名 yi）
  assert.deepEqual(
    poems.map((p) => p.author),
    ['蔡邕', '曹植', '无名氏', '佚名'],
  );
  // 名次是编译期内部量（computeSortKeys），不再挂在诗对象上
  const { authorKeys } = computeSortKeys(poems);
  const keyOf = (p) => authorKeys[poems.indexOf(p)];
  const namedMax = Math.max(...poems.filter((p) => !isUnknownAuthor(p.author)).map(keyOf));
  const unknownMin = Math.min(...poems.filter((p) => isUnknownAuthor(p.author)).map(keyOf));
  assert.ok(unknownMin > namedMax, '未知作者的内部名次必须严格大于所有具名作者');
});

test('sortPoems 不修改传入的诗对象（名次不泄到产物里）', () => {
  const poems = [poem('a-01', { author: '佚名', title: '甲' }), poem('b-01', { author: '蔡邕', title: '乙' })];
  const before = poems.map((p) => Object.keys(p).join(','));
  sortPoems(poems);
  assert.deepEqual(
    poems.map((p) => Object.keys(p).join(',')),
    before,
  );
  for (const p of poems) {
    assert.equal('authorSortKey' in p, false);
    assert.equal('titleSortKey' in p, false);
  }
});

test('sortPoems：同作者内按诗名拼音序，再按时代分组', () => {
  const poems = [
    poem('a-01', { order: 400, dynasty: '唐', author: '李白', title: '早发白帝城' }),
    poem('b-01', { order: 400, dynasty: '唐', author: '李白', title: '静夜思' }),
    poem('c-01', { order: 400, dynasty: '唐', author: '杜甫', title: '春望' }),
    poem('d-01', { order: 100, dynasty: '汉', author: '佚名', title: '行行重行行' }),
  ];
  sortPoems(poems);
  assert.deepEqual(
    poems.map((p) => `${p.dynastyOrder}:${p.author}/${p.title}`),
    ['100:佚名/行行重行行', '400:杜甫/春望', '400:李白/静夜思', '400:李白/早发白帝城'],
  );
});

test('sortPoems：同组同作者同诗名时以 id 兜底，顺序确定', () => {
  const poems = [
    poem('b-02', { author: '甲', title: '同一首' }),
    poem('a-01', { author: '甲', title: '同一首' }),
  ];
  sortPoems(poems);
  assert.deepEqual(poems.map((p) => p.id), ['a-01', 'b-02']);
});

// ---------- 排序策略：source / pinyin ----------

function poemWithSource(id, title, author, orderInSource) {
  return { ...poem(id, { author, title }), orderInSource };
}

const ORDER_SAMPLE = () => [
  poemWithSource('gushi-shijiu-shou-01', '行行重行行', '佚名', 1),
  poemWithSource('gushi-shijiu-shou-02', '青青河畔草', '佚名', 2),
  poemWithSource('gushi-shijiu-shou-18', '客从远方来', '佚名', 18),
  poemWithSource('cao-yong-01', '饮马长城窟行', '蔡邕', undefined),
];

test('sortPoems --order source：有 orderInSource 的在先、按升序，无值者接在后面按拼音', () => {
  const poems = ORDER_SAMPLE();
  sortPoems(poems, 'source');
  assert.deepEqual(poems.map((p) => p.title), [
    '行行重行行',
    '青青河畔草',
    '客从远方来',
    '饮马长城窟行',
  ]);
});

test('sortPoems --order pinyin：忽略 orderInSource，作者拼音 → 诗名拼音', () => {
  const poems = ORDER_SAMPLE();
  sortPoems(poems, 'pinyin');
  assert.deepEqual(poems.map((p) => p.title), [
    '饮马长城窟行', // 蔡邕(cai) 具名在前
    '客从远方来', // 佚名，客(ke)
    '青青河畔草', // 青(qing)
    '行行重行行', // 行(xing)
  ]);
});

test('sortPoems：未给 orderInSource 时两种策略结果完全一致（默认值不会静默改变行为）', () => {
  const a = [poem('a-01', { author: '乙', title: '甲题' }), poem('b-01', { author: '甲', title: '乙题' })];
  const b = [poem('a-01', { author: '乙', title: '甲题' }), poem('b-01', { author: '甲', title: '乙题' })];
  sortPoems(a, 'source');
  sortPoems(b, 'pinyin');
  assert.deepEqual(a.map((p) => p.id), b.map((p) => p.id));
});

test('sortPoems：未知策略直接报错，不静默回退', () => {
  assert.throws(() => sortPoems([], 'guess'), (e) => e.code === 'ORDER_STRATEGY_INVALID');
});

// ---------- 逐文件校验 ----------

const OK_TEXT = [
  '---',
  'id: demo-01',
  'title: 样例',
  'author: 佚名',
  'dynasty: 汉',
  'dynastyOrder: 100',
  'source: 测试 fixture',
  '---',
  '',
  '正文一行。',
  '',
].join('\n');

function rec(text, base = 'demo-01') {
  return { displayPath: `content/poems/${base}.md`, base, text };
}

function codes(text, base) {
  return validatePoemRecord(rec(text, base)).errors.map((e) => e.code);
}

test('合法文件产出固定键序的产物对象', () => {
  const { poem, errors } = validatePoemRecord(rec(OK_TEXT));
  assert.deepEqual(errors, []);
  assert.deepEqual(poem.stanzas, [['正文一行。']]);
  assert.equal(poem.era, null);
  assert.equal(poem.genre, null);
  assert.equal(poem.notes, null);
  assert.deepEqual(poem.variants, []);
  assert.equal(poem.dynastyKey, 'han');
  assert.equal(poem.dynastyLabel, '汉');
  assert.equal(poem.dynastyOrder, 100);
});

test('dynastyOrder 与分组注册表不一致 → DYN_ORDER_MISMATCH', () => {
  const text = OK_TEXT.replace('dynastyOrder: 100', 'dynastyOrder: 9999');
  assert.deepEqual(codes(text), ['DYN_ORDER_MISMATCH']);
});

test('orderInSource：可选；缺失为 null，非整数报错', () => {
  const { poem, errors } = validatePoemRecord(rec(OK_TEXT));
  assert.deepEqual(errors, []);
  assert.equal(poem.orderInSource, null);

  const withValue = OK_TEXT.replace('source: 测试 fixture', 'source: 测试 fixture\norderInSource: 7');
  assert.equal(validatePoemRecord(rec(withValue)).poem.orderInSource, 7);

  const bad = OK_TEXT.replace('source: 测试 fixture', 'source: 测试 fixture\norderInSource: 第七');
  assert.deepEqual(codes(bad), ['ORDER_IN_SOURCE_NOT_INTEGER']);
});

test('id 形状非法 → ID_INVALID', () => {
  const text = OK_TEXT.replace('id: demo-01', 'id: Demo_01');
  const got = codes(text, 'Demo_01');
  assert.deepEqual(got, ['ID_INVALID']);
});

test('缺必填键可一次报多条', () => {
  const text = OK_TEXT.replace('author: 佚名\n', '').replace('source: 测试 fixture\n', '');
  assert.deepEqual(codes(text).sort(), ['MISSING_REQUIRED_KEY', 'MISSING_REQUIRED_KEY']);
});

test('只有空行的正文 → STANZAS_ALL_EMPTY；完全没有正文区 → BODY_EMPTY', () => {
  assert.deepEqual(codes(OK_TEXT.replace('正文一行。', '')), ['STANZAS_ALL_EMPTY']);
  const noBody = OK_TEXT.slice(0, OK_TEXT.indexOf('---\n\n正文一行。') + 3);
  assert.deepEqual(codes(noBody), ['BODY_EMPTY']);
});

test('注册表本身自洽：label/key 唯一、order 与契约一致', () => {
  assert.equal(new Set(DYNASTIES.map((d) => d.key)).size, DYNASTIES.length);
  assert.equal(new Set(DYNASTIES.map((d) => d.label)).size, DYNASTIES.length);
  const byLabel = Object.fromEntries(DYNASTIES.map((d) => [d.label, d.order]));
  assert.deepEqual(byLabel, {
    先秦: 0,
    汉: 100,
    魏晋: 200,
    南北朝: 300,
    唐: 400,
    宋: 500,
    元: 600,
    明: 700,
    清: 800,
    近现代: 900,
    未详: 9999,
  });
});

test('没有诗文件 → NO_POEMS（拒绝产出空目录内容）', () => {
  const { content, errors } = buildContentFromRecords({ records: [] });
  assert.equal(content, null);
  assert.deepEqual(errors.map((e) => e.code), ['NO_POEMS']);
});

// ---------- 版本规则 ----------

test('版本比较：数值逐段比较，dev 小于一切发布版本', () => {
  assert.equal(compareContentVersion('2026.10.14.2', '2026.10.14.1'), 1);
  assert.equal(compareContentVersion('2026.10.14.1', '2026.10.09.9'), 1);
  assert.equal(compareContentVersion('2026.10.14.1', '2026.10.14.1'), 0);
  assert.equal(compareContentVersion('2027.01.01.1', '2026.12.31.9'), 1);
  assert.equal(compareContentVersion('0.0.0-dev+aaaaaaaaaaaa', '2026.10.14.1'), -1);
  assert.equal(compareContentVersion('0.0.0-dev+aaaaaaaaaaaa', '0.0.0-dev+bbbbbbbbbbbb'), -1);
});

test('版本解析：非法格式与越界都失败', () => {
  for (const bad of ['2026.10.14', 'v1.2', '2026.10.14.0', '2026.13.1.1', '2026.10.32.1', '2026.10.9.9', '2027.1.1.1', '0.0.0-dev+XYZ']) {
    assert.throws(() => parseContentVersion(bad), (e) => e.code === 'VERSION_FORMAT', `${bad} 应被拒绝`);
  }
});

test('dev 版本由内容摘要确定性派生', () => {
  const a = deriveDevVersion('0123456789abcdef0123');
  const b = deriveDevVersion('0123456789abcdef0123');
  assert.equal(a, b);
  assert.ok(isDevVersion(a));
  assert.equal(a, '0.0.0-dev+0123456789ab');
});

test('显式版本：单调递增强制、不允许手写 dev 版本', () => {
  assert.deepEqual(
    resolveContentVersion({ explicit: '2026.10.14.2', previous: '2026.10.14.1', digestHex: 'x' }).version,
    '2026.10.14.2',
  );
  assert.throws(
    () => resolveContentVersion({ explicit: '2026.10.14.1', previous: '2026.10.14.1', digestHex: 'x' }),
    (e) => e.code === 'VERSION_NOT_MONOTONIC',
  );
  assert.throws(
    () => resolveContentVersion({ explicit: '0.0.0-dev+0123456789ab', previous: null, digestHex: 'x' }),
    (e) => e.code === 'VERSION_FORMAT',
  );
  // 上一版是 dev 时，任意发布版本都应通过
  assert.equal(
    resolveContentVersion({ explicit: '2026.10.14.1', previous: '0.0.0-dev+0123456789ab', digestHex: 'x' }).version,
    '2026.10.14.1',
  );
});

test('dev 版本不做单调检查（本地重复编译不报错）', () => {
  const r = resolveContentVersion({ explicit: null, previous: '2026.10.14.1', digestHex: 'abcdefabcdefabcdef' });
  assert.equal(r.kind, 'dev');
  assert.equal(r.version, '0.0.0-dev+abcdefabcdef');
});
