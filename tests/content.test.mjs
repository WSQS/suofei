// 契约线 C：校验/排序/版本规则的单元测试（不经过 CLI）。
//
// formatVersion=2（2026-10-16）起源格式：front matter 必填 title/author/dynasty/source（可选
// genre/orderInSource）；正文区是原文（空行＝分段）；`## 详情`/`## 笔记` 两个可选节承载 Markdown 文本；
// id 由相对路径派生（不在源里写）。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildContentFromRecords,
  buildStanzas,
  collatorRankMap,
  computeSortKeys,
  isUnknownAuthor,
  parsePoemRecord,
  sortPoems,
  UNKNOWN_AUTHOR_MARKERS,
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

test('isUnknownAuthor：清单（含「阙名」）与空值', () => {
  // 不再在测试里拄一份清单：直接用唯一来源里的每一项。
  for (const a of [...UNKNOWN_AUTHOR_MARKERS, '', '   ']) {
    assert.equal(isUnknownAuthor(a), true, `${JSON.stringify(a)} 应视为未知作者`);
  }
  assert.ok(UNKNOWN_AUTHOR_MARKERS.includes('阙名'), '用户拍板：阙名在匿名作者清单里');
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

// ---------- 组内排序：组序由注册表决定，组内作者 → 诗名，佚名最后 ----------

function poem(id, { dynasty = '汉', author, title, orderInSource }) {
  return { id, author, title, dynasty, orderInSource: orderInSource ?? null };
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

test('sortPoems：组序＝注册表 order（唐在汉后），组内同作者按诗名拼音', () => {
  const poems = [
    poem('a-01', { dynasty: '唐', author: '李白', title: '早发白帝城' }),
    poem('b-01', { dynasty: '唐', author: '李白', title: '静夜思' }),
    poem('c-01', { dynasty: '唐', author: '杜甫', title: '春望' }),
    poem('d-01', { dynasty: '汉', author: '佚名', title: '行行重行行' }),
  ];
  sortPoems(poems);
  assert.deepEqual(
    poems.map((p) => `${p.dynasty}:${p.author}/${p.title}`),
    ['汉:佚名/行行重行行', '唐:杜甫/春望', '唐:李白/静夜思', '唐:李白/早发白帝城'],
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

test('sortPoems --order source：按升序，**无值者**接在后面按拼音（这条分支自 2026-10-19 起只对直构对象/旧产物存在：内容侧缺值已改成 ORDER_IN_SOURCE_REQUIRED）', () => {
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

test('sortPoems：未给 orderInSource 时两种策略结果完全一致（仅存于直构对象；内容侧已不可能缺该键）', () => {
  const a = [poem('a-01', { author: '乙', title: '甲题' }), poem('b-01', { author: '甲', title: '乙题' })];
  const b = [poem('a-01', { author: '乙', title: '甲题' }), poem('b-01', { author: '甲', title: '乙题' })];
  sortPoems(a, 'source');
  sortPoems(b, 'pinyin');
  assert.deepEqual(a.map((p) => p.id), b.map((p) => p.id));
});

test('sortPoems：未知策略直接报错，不静默回退', () => {
  assert.throws(() => sortPoems([], 'guess'), (e) => e.code === 'ORDER_STRATEGY_INVALID');
});

// ---------- 逐文件解析（formatVersion=2 源格式） ----------

const OK_TEXT = [
  '---',
  'title: "样例"',
  'author: "佚名"',
  'dynasty: "汉"',
  'genre: "五言古诗"',
  'orderInSource: 1',
  'source: "测试 fixture"',
  '---',
  '',
  '正文一行。',
  '',
  '## 详情',
  '',
  '### 异文',
  '',
  '- **某异文** —— 说明。',
  '',
  '## 笔记',
  '',
  '夹具笔记。',
  '',
].join('\n');

function rec(text, id = 'demo-01') {
  return { displayPath: `content/poems/${id}.md`, id, text };
}

function codes(text, id) {
  return parsePoemRecord(rec(text, id)).errors.map((e) => e.code);
}

test('合法文件产出固定键序的 11 键产物对象', () => {
  const { poem, errors } = parsePoemRecord(rec(OK_TEXT));
  assert.deepEqual(errors, []);
  assert.deepEqual(Object.keys(poem), [
    'id',
    'title',
    'author',
    'dynasty',
    'genre',
    'source',
    'orderInSource',
    'detail',
    'stanzas',
    'notes',
    'tags',
  ]);
  assert.equal(poem.id, 'demo-01');
  assert.equal(poem.dynasty, '汉');
  assert.equal(poem.detail, '### 异文\n\n- **某异文** —— 说明。');
  assert.equal(poem.notes, '夹具笔记。');
  assert.deepEqual(poem.stanzas, [['正文一行。']]);
  // 源里没写 tags ⇒ []（不是 null）
  assert.deepEqual(poem.tags, []);
});

test('缺节 ⇒ detail/notes 都 null，但键都在；空节同样', () => {
  const textOnly = OK_TEXT.slice(0, OK_TEXT.indexOf('## 详情')).replace(/\n+$/, '\n');
  const { poem, errors } = parsePoemRecord(rec(textOnly));
  assert.deepEqual(errors, []);
  assert.equal(poem.detail, null);
  assert.equal(poem.notes, null);
  assert.ok('detail' in poem && 'notes' in poem);
});

test('id 由 record 提供（源里写 id ⇒ FORBIDDEN_ID_KEY）', () => {
  const text = OK_TEXT.replace('title: "样例"', 'id: demo-01\ntitle: "样例"');
  assert.deepEqual(codes(text), ['FORBIDDEN_ID_KEY']);
});

test('旧键（dynastyOrder/era/variants/notes）⇒ REMOVED_KEY，逐个报', () => {
  const text = OK_TEXT.replace('source: "测试 fixture"', 'source: "测试 fixture"\ndynastyOrder: 100\nera: "东汉末"');
  assert.deepEqual(codes(text).sort(), ['REMOVED_KEY', 'REMOVED_KEY']);
  const withNotes = OK_TEXT.replace('source: "测试 fixture"', 'source: "测试 fixture"\nnotes: "旧写法"');
  assert.deepEqual(codes(withNotes), ['REMOVED_KEY']);
});

test('缺必填键可一次报多条', () => {
  const text = OK_TEXT.replace('author: "佚名"\n', '').replace('source: "测试 fixture"\n', '');
  assert.deepEqual(codes(text).sort(), ['MISSING_REQUIRED_KEY', 'MISSING_REQUIRED_KEY']);
});

test('字段类型：title/author/dynasty/source 必须字符串；genre 可为 null', () => {
  const text = OK_TEXT.replace('dynasty: "汉"', 'dynasty: 123');
  assert.deepEqual(codes(text), ['FIELD_TYPE']);
  const badGenre = OK_TEXT.replace('genre: "五言古诗"', 'genre: 1');
  assert.deepEqual(codes(badGenre), ['FIELD_TYPE']);
  // 未写的 genre 是允许的
  assert.deepEqual(codes(OK_TEXT.replace('genre: "五言古诗"\n', '')), []);
});

test('orderInSource：**必填正整数** —— 缺失 / null ⇒ ORDER_IN_SOURCE_REQUIRED；0/负数/小数/非数字 ⇒ ORDER_IN_SOURCE_NOT_INTEGER', () => {
  // ① 缺失：整行删掉（夹具以前就靠「省略即可」，2026-10-19 用户定：不可省略）
  const noOrder = parsePoemRecord(rec(OK_TEXT.replace('orderInSource: 1\n', '')));
  assert.deepEqual(
    noOrder.errors.map((e) => e.code),
    ['ORDER_IN_SOURCE_REQUIRED'],
    '缺 orderInSource 必须是 ORDER_IN_SOURCE_REQUIRED',
  );
  assert.equal(noOrder.poem, null, '缺必填键不得产出诗对象（也就不会写出产物）');
  for (const word of ['必填', '不可省略', '不可 null']) {
    assert.ok(noOrder.errors[0].message.includes(word), `诊断文案要说出「${word}」；实际：${noOrder.errors[0].message}`);
  }

  // ② null / ~ / 空值（最小 YAML 子集三者都解析成 null）⇒ 同一个码
  for (const raw of ['null', '~', '']) {
    const r = parsePoemRecord(rec(OK_TEXT.replace('orderInSource: 1', `orderInSource: ${raw}`)));
    assert.deepEqual(r.errors.map((e) => e.code), ['ORDER_IN_SOURCE_REQUIRED'], `orderInSource: ${raw} 应被拒绝`);
    assert.equal(r.poem, null);
  }

  // ③ 写了但不是 ≥ 1 的整数
  for (const bad of ['第七', '0', '-1', '1.5']) {
    const text = OK_TEXT.replace('orderInSource: 1', `orderInSource: ${bad}`);
    assert.deepEqual(codes(text), ['ORDER_IN_SOURCE_NOT_INTEGER'], `${bad} 应被拒绝`);
  }

  // ④ 合法：最小 1（正整数下界），原样进产物
  const ok = parsePoemRecord(rec(OK_TEXT));
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.poem.orderInSource, 1);
});

test('同一朝代内 orderInSource 必须唯一：冲突时报 ORDER_IN_SOURCE_DUP，并列出全部冲突的诗 id 与源路径', () => {
  const withTitle = (t) => OK_TEXT.replace('title: "样例"', `title: "${t}"`);
  const { content, errors } = buildContentFromRecords({
    records: [rec(withTitle('甲'), 'a-01'), rec(withTitle('乙'), 'b-01'), rec(OK_TEXT.replace('orderInSource: 1', 'orderInSource: 2'), 'c-01')],
    explicitVersion: '2026.10.19.1',
  });
  assert.equal(content, null, '序号冲突不得产出产物');
  assert.deepEqual(errors.map((e) => e.code), ['ORDER_IN_SOURCE_DUP']);
  const msg = errors[0].message;
  // 两首（同为汉、同一号）都必须在诊断里，且带上源路径——否则读者不知道去哪改
  assert.ok(msg.includes('a-01') && msg.includes('content/poems/a-01.md'), msg);
  assert.ok(msg.includes('b-01') && msg.includes('content/poems/b-01.md'), msg);
  assert.equal(msg.includes('c-01'), false, '不冲突的诗不应被列进冲突名单');
  assert.ok(msg.includes('跨作者') && msg.includes('允许留空号'), '诊断要写清判据（跨作者也不得重复；允许留空号）');
});

test('不同朝代各自从 1 起、且允许留空号：都不算冲突，次序仍是朝代组序 → orderInSource 升序', () => {
  const mk = (id, dynasty, order) =>
    rec(
      OK_TEXT.replace('dynasty: "汉"', `dynasty: "${dynasty}"`).replace('orderInSource: 1', `orderInSource: ${order}`),
      id,
    );
  const { content, errors } = buildContentFromRecords({
    // 汉 1/9（留了空号 2..8），唐 1/7（又从 1 起）——都不冲突
    records: [mk('h-01', '汉', 1), mk('h-02', '汉', 9), mk('t-01', '唐', 1), mk('t-02', '唐', 7)],
    explicitVersion: '2026.10.19.2',
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(content.poems.map((p) => `${p.dynasty}:${p.orderInSource}`), ['汉:1', '汉:9', '唐:1', '唐:7']);
});

test('组内次序是 orderInSource 升序，**不是作者拼音序**（用户 2026-10-19 拍板 B）', () => {
  const mk = (id, dynasty, order, author) =>
    rec(
      OK_TEXT.replace('author: "佚名"', `author: "${author}"`)
        .replace('dynasty: "汉"', `dynasty: "${dynasty}"`)
        .replace('orderInSource: 1', `orderInSource: ${order}`),
      id,
    );
  // 杜甫(du) 拼音名次最前，但序号最大 ⇒ 应排最后；作者拼音绝不能先排
  const { content, errors } = buildContentFromRecords({
    records: [mk('tang-du-fu', '唐', 3, '杜甫'), mk('tang-li-bai-a', '唐', 1, '李白'), mk('tang-li-bai-b', '唐', 2, '李白')],
    explicitVersion: '2026.10.19.3',
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(content.poems.map((p) => p.id), ['tang-li-bai-a', 'tang-li-bai-b', 'tang-du-fu']);
});

test('正文区没有非空行 ⇒ BODY_EMPTY（含完全没有正文区）', () => {
  const blankBody = OK_TEXT.slice(0, OK_TEXT.indexOf('正文一行。')) + '\n\n\n';
  assert.deepEqual(codes(blankBody), ['BODY_EMPTY']);
  const noBody =
    ['---', 'title: "x"', 'author: "佚名"', 'dynasty: "汉"', 'orderInSource: 1', 'source: "s"', '---'].join('\n') +
    '\n';
  assert.deepEqual(codes(noBody), ['BODY_EMPTY']);
});

test('未知节 ⇒ UNKNOWN_SECTION；重复节 ⇒ DUPLICATE_SECTION（落在第二次那行）', () => {
  const unknown = OK_TEXT.replace('## 笔记', '## 小结');
  const u = parsePoemRecord(rec(unknown));
  assert.deepEqual(u.errors.map((e) => e.code), ['UNKNOWN_SECTION']);
  const dup = OK_TEXT.replace('## 笔记', '## 详情');
  const d = parsePoemRecord(rec(dup));
  assert.deepEqual(d.errors.map((e) => e.code), ['DUPLICATE_SECTION']);
  const detailLines = dup.split('\n')
    .map((l, i) => (l === '## 详情' ? i + 1 : 0))
    .filter(Boolean);
  assert.equal(detailLines.length, 2);
  assert.equal(d.errors[0].line, detailLines[1]);
});

test('越界 Markdown ⇒ 对应 MD_* 码（闭集外一律报错）', () => {
  const cases = [
    ['| a | b |', 'MD_TABLE'],
    ['![图片](x.png)', 'MD_IMAGE'],
    ['[站](https://example.invalid/x)', 'MD_LINK'],
    ['行内 `code`', 'MD_INLINE_CODE'],
    ['脚注[^1]', 'MD_FOOTNOTE'],
    ['<br>', 'MD_HTML'],
    ['* 星号列表', 'MD_STAR_LIST'],
    ['- [ ] 任务', 'MD_TASK_LIST'],
    ['# 一级标题', 'MD_HEADING'],
    ['#### 四级标题', 'MD_HEADING'],
  ];
  for (const [line, code] of cases) {
    const text = OK_TEXT.replace('夹具笔记。', line);
    assert.deepEqual(codes(text), [code], `「${line}」应报 ${code}`);
  }
  // 闭集内不报
  for (const line of ['- 无序项', '1. 有序项', '> 引用', '### 小标题', '**粗体** 与 *斜体*']) {
    const text = OK_TEXT.replace('夹具笔记。', line);
    assert.deepEqual(codes(text), [], `「${line}」不该报错`);
  }
});

test('代码围栏：围栏行报 MD_CODE_FENCE；未闭合再报 MD_FENCE_UNCLOSED', () => {
  const withFence = OK_TEXT.replace('夹具笔记。', '```\ncode\n```');
  assert.deepEqual(codes(withFence), ['MD_CODE_FENCE']);
  const unclosed = OK_TEXT.replace('夹具笔记。', '```\ncode');
  assert.deepEqual(codes(unclosed).sort(), ['MD_CODE_FENCE', 'MD_FENCE_UNCLOSED']);
});

test('未闭合强调 ⇒ MD_EMPHASIS_UNCLOSED（闭集不含转义写法）', () => {
  for (const line of ['**没闭合', '一个落单的 * 号']) {
    assert.deepEqual(codes(OK_TEXT.replace('夹具笔记。', line)), ['MD_EMPHASIS_UNCLOSED']);
  }
});

test('注册表本身自洽：label/key 唯一、order 与契约一致、精确匹配（不 trim）', () => {
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
  // 精确匹配：尾随空格不再被接受
  assert.deepEqual(codes(OK_TEXT.replace('dynasty: "汉"', 'dynasty: "汉 "')), ['DYNASTY_UNDECLARED']);
});

test('没有诗文件 → NO_POEMS；id 撞车 → ID_DUPLICATE（列出冲突路径）', () => {
  const none = buildContentFromRecords({ records: [] });
  assert.equal(none.content, null);
  assert.deepEqual(none.errors.map((e) => e.code), ['NO_POEMS']);

  const dup = buildContentFromRecords({
    records: [rec(OK_TEXT, 'same-id'), { ...rec(OK_TEXT, 'same-id'), displayPath: 'content/poems/另一处/same-id.md' }],
    explicitVersion: '2026.10.16.1',
  });
  assert.equal(dup.content, null);
  assert.deepEqual(dup.errors.map((e) => e.code), ['ID_DUPLICATE']);
  assert.ok(dup.errors[0].message.includes('content/poems/same-id.md'));
  assert.ok(dup.errors[0].message.includes('content/poems/另一处/same-id.md'));
});

test('产物：dynasties 只列有内容的组、按注册表 order 升序', () => {
  const mk = (id, dynasty) => ({
    displayPath: `content/poems/${id}.md`,
    id,
    text: OK_TEXT.replace('dynasty: "汉"', `dynasty: "${dynasty}"`),
  });
  const { content, errors } = buildContentFromRecords({
    records: [mk('b-01', '唐'), mk('a-01', '汉'), mk('c-01', '宋')],
    explicitVersion: '2026.10.16.1',
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(content.dynasties, ['汉', '唐', '宋']); // 汉100 < 唐400 < 宋500
  assert.ok(content.dynasties.every((d) => typeof d === 'string'));
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
