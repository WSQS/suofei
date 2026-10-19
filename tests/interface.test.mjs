// 契约线 C：接口一致性测试。
//
// 接口的唯一定义处是 tools/lib/interface.mjs；JSON Schema 是一份无法 import JS 的镜像。
// 这里把两者比对，任何一边漂移都会测试失败（避免「改了一处、别处还以为没变」）。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  ALL_FRONT_MATTER_KEYS,
  CLI_FLAGS,
  CONTENT_KEYS,
  DEFAULT_CONTENT_DIR,
  DEFAULT_OUT,
  DEFAULT_SCHEMA_PATH,
  FORMAT_VERSION,
  ID_PATTERN,
  ID_REGEX,
  INTERNAL_SORT_KEYS,
  KNOWN_SECTIONS,
  OPTIONAL_FRONT_MATTER_KEYS,
  POEM_KEYS,
  POEM_TAG_KEYS,
  REMOVED_FRONT_MATTER_KEYS,
  REQUIRED_FRONT_MATTER_KEYS,
  REQUIRED_INT_FRONT_MATTER_KEYS,
  TAG_INDEX_KEYS,
  UNKNOWN_AUTHOR_MARKERS,
  UNKNOWN_AUTHORS_RELATIVE_PATH,
} from '../tools/lib/interface.mjs';
import { buildContentFromRecords, isUnknownAuthor } from '../tools/lib/content-build.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const schema = JSON.parse(fs.readFileSync(path.join(ROOT, DEFAULT_SCHEMA_PATH), 'utf8'));

test('schema：顶层键集与顺序 = CONTENT_KEYS', () => {
  assert.deepEqual(Object.keys(schema.properties), [...CONTENT_KEYS]);
  assert.deepEqual(schema.required, [...CONTENT_KEYS]);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.formatVersion.const, FORMAT_VERSION);
});

test('schema：每首诗的键集与顺序 = POEM_KEYS', () => {
  const item = schema.properties.poems.items;
  assert.deepEqual(item.required, [...POEM_KEYS]);
  assert.deepEqual(Object.keys(item.properties), [...POEM_KEYS]);
  assert.equal(item.additionalProperties, false);
});

test('schema：顶层 dynasties 是**有序中文值数组**（不再是 [{key,label,order}]）', () => {
  assert.deepEqual(schema.properties.dynasties.items, {
    type: 'string',
    minLength: 1,
    description: schema.properties.dynasties.items.description,
  });
  assert.equal(schema.properties.dynasties.minItems, 1);
  assert.equal('key' in schema.properties.dynasties.items, false);
  assert.equal('order' in schema.properties.dynasties.items, false);
});

test('schema：id 的正面约束与 interface.mjs 的 ID_REGEX / ID_PATTERN 一致', () => {
  assert.equal(schema.properties.poems.items.properties.id.pattern, ID_PATTERN);
  assert.equal(new RegExp(ID_PATTERN).source, ID_REGEX.source);
  // 正面约束：非空、不含 `/`、不含控制字符与反斜杠；中文合法
  assert.equal(ID_REGEX.test(''), false);
  assert.equal(ID_REGEX.test('古诗十九首-行行重行行'), true);
  assert.equal(ID_REGEX.test('a/b'), false);
  assert.equal(ID_REGEX.test('a\u0000b'), false);
  assert.equal(ID_REGEX.test('a\\b'), false);
});

test('schema / 源格式：两个节名只有 详情 与 笔记', () => {
  assert.deepEqual([...KNOWN_SECTIONS], ['详情', '笔记']);
});

// 2026-10-14 用户拍板：两个拼音名次只在编译期内部用，**不发布**。
// 这里同时钉住「interface.mjs 与 schema 都不含它们」——不是放宽断言，而是两边都真的没有。
test('schema / POEM_KEYS：不发布 authorSortKey/titleSortKey', () => {
  for (const key of INTERNAL_SORT_KEYS) {
    assert.equal(POEM_KEYS.includes(key), false, `POEM_KEYS 不应包含 ${key}`);
    assert.equal(key in schema.properties.poems.items.properties, false, `schema 不应定义 ${key}`);
    assert.equal(schema.properties.poems.items.required.includes(key), false);
  }
  assert.deepEqual(INTERNAL_SORT_KEYS, ['authorSortKey', 'titleSortKey']);
  // 产物里也没有「排序」字样的任何字段
  assert.equal(
    Object.keys(schema.properties.poems.items.properties).some((k) => k.includes('SortKey')),
    false,
  );
});

test('front matter 键集：必填（字符串）＋ 必填（正整数）＋ 可选 = 允许的全部；产物字段可追溯到源/结构', () => {
  // 三张清单不重叠，且并集就是允许的全部键（次序由 interface.mjs 写死）
  assert.deepEqual(
    [...ALL_FRONT_MATTER_KEYS].sort(),
    [...REQUIRED_FRONT_MATTER_KEYS, ...REQUIRED_INT_FRONT_MATTER_KEYS, ...OPTIONAL_FRONT_MATTER_KEYS].sort(),
  );
  assert.equal(new Set(ALL_FRONT_MATTER_KEYS).size, ALL_FRONT_MATTER_KEYS.length, '三张清单不得有重叠');
  // 2026-10-19（用户拍板 B）：orderInSource 是必填正整数，不再是可选项
  assert.deepEqual([...REQUIRED_INT_FRONT_MATTER_KEYS], ['orderInSource']);
  assert.equal(OPTIONAL_FRONT_MATTER_KEYS.includes('orderInSource'), false);
  // 产物字段 → 来源（id 来自相对路径；detail/notes 来自两个节；stanzas 来自正文区）
  const derived = new Set(['id', 'detail', 'notes', 'stanzas']);
  for (const key of POEM_KEYS) {
    if (derived.has(key)) continue;
    assert.ok(
      ALL_FRONT_MATTER_KEYS.includes(key),
      `产物字段 ${key} 在 front matter 里没有来源，说明有一处定义没同步`,
    );
  }
  // 旧字段必须**不在**允许集合里（REMOVED 只用于报错，不是允许）
  for (const key of [...REMOVED_FRONT_MATTER_KEYS, 'id']) {
    assert.equal(ALL_FRONT_MATTER_KEYS.includes(key), false, `${key} 旧键不得再被允许`);
  }
});

test('schema：orderInSource 必填正整数（不许 null）——与 REQUIRED_INT_FRONT_MATTER_KEYS 一致', () => {
  const poemItem = schema.properties.poems.items;
  assert.ok(poemItem.required.includes('orderInSource'), '产物 schema 必须把 orderInSource 列为 required');
  const prop = poemItem.properties.orderInSource;
  assert.equal(prop.type, 'integer', 'orderInSource 不再允许 null（type 不得是 ["integer","null"]）');
  assert.equal(prop.minimum, 1);
});

test('schema：标签的两个键集/键序 = interface.mjs（诗侧 {id,orderInTag}；顶层 {id,members}）', () => {
  const poemTags = schema.properties.poems.items.properties.tags;
  assert.deepEqual(poemTags.items.required, [...POEM_TAG_KEYS]);
  assert.deepEqual(Object.keys(poemTags.items.properties), [...POEM_TAG_KEYS]);
  assert.equal(poemTags.items.additionalProperties, false);
  // orderInTag 必填、不可 null：JSON Schema 里只能是 integer（不许 ["integer","null"]）
  assert.equal(poemTags.items.properties.orderInTag.type, 'integer');
  assert.equal(poemTags.items.properties.orderInTag.minimum, 1);
  assert.deepEqual(poemTags.items.required.includes('orderInTag'), true);

  const indexTags = schema.properties.tags;
  assert.deepEqual(indexTags.items.required, [...TAG_INDEX_KEYS]);
  assert.deepEqual(Object.keys(indexTags.items.properties), [...TAG_INDEX_KEYS]);
  assert.equal(indexTags.items.additionalProperties, false);
  assert.equal(indexTags.minItems, undefined, '没有标签时顶层 tags 就是 []（不是缺失）');
  assert.deepEqual([...POEM_TAG_KEYS], ['id', 'orderInTag']);
  assert.deepEqual([...TAG_INDEX_KEYS], ['id', 'members']);
  // 不发布任何「标签排序键」：两个键集里没有 SortKey 类字段
  for (const keys of [POEM_TAG_KEYS, TAG_INDEX_KEYS]) {
    assert.equal(keys.some((k) => /sort|key$/i.test(k)), false, `标签条目不应带排序键：${JSON.stringify(keys)}`);
  }
});

test('产物键序与 interface.mjs 完全一致（编译结果不是另一套形状）', () => {
  const dir = path.join(ROOT, 'tests', 'fixtures', 'ok-sorting', 'content', 'poems');
  const records = fs
    .readdirSync(dir)
    .sort()
    .map((name) => ({
      displayPath: `content/poems/${name}`,
      id: name.slice(0, -3),
      text: fs.readFileSync(path.join(dir, name), 'utf8'),
    }));
  const { content, errors } = buildContentFromRecords({ records, explicitVersion: '2026.10.14.9' });
  assert.deepEqual(errors, []);
  assert.deepEqual(Object.keys(content), [...CONTENT_KEYS]);
  for (const p of content.poems) assert.deepEqual(Object.keys(p), [...POEM_KEYS]);
  for (const d of content.dynasties) assert.equal(typeof d, 'string');
});

test('CLI 帮助文本里列出的是 interface.mjs 定义的同一组选项', () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'build-content.mjs'), '--help'], {
    encoding: 'utf8',
    cwd: ROOT,
  });
  assert.equal(r.status, 0);
  for (const flag of Object.values(CLI_FLAGS)) assert.ok(r.stdout.includes(flag), `帮助里应有 ${flag}`);
  assert.ok(r.stdout.includes(DEFAULT_CONTENT_DIR));
  assert.ok(r.stdout.includes(DEFAULT_OUT.split(path.sep).join('/')));
});

test('产物路径与源扩展名的默认值只定义在 interface.mjs', () => {
  assert.equal(DEFAULT_OUT, path.join('dist', 'content.json'));
  assert.equal(DEFAULT_CONTENT_DIR, 'content');
  assert.equal(DEFAULT_SCHEMA_PATH, path.join('schema', 'content.schema.json'));
});

// ---------- 匿名作者清单：唯一机器可读来源 ----------
//
// 背景：这份清单以前只写在契约散文里，三端各拄一份并拄歪过（编译器/Android/Web 三种写法），
// Web 的 e2e 还用正则解析契约散文取它。2026-10-14 用户拍板：把清单钉成文件，并以它为准。

const unknownAuthorsFile = path.join(ROOT, UNKNOWN_AUTHORS_RELATIVE_PATH);

function readUnknownAuthorsFile() {
  return JSON.parse(fs.readFileSync(unknownAuthorsFile, 'utf8'));
}

test('匿名作者清单：编译器常量与 schema/unknown-authors.json 逐字一致（含顺序）', () => {
  const fromFile = readUnknownAuthorsFile();
  const missingInCompiler = fromFile.filter((n) => !UNKNOWN_AUTHOR_MARKERS.includes(n));
  const extraInCompiler = [...UNKNOWN_AUTHOR_MARKERS].filter((n) => !fromFile.includes(n));
  assert.deepEqual(
    { missingInCompiler, extraInCompiler },
    { missingInCompiler: [], extraInCompiler: [] },
    `与 ${UNKNOWN_AUTHORS_RELATIVE_PATH} 不一致：` +
      `文件里有而编译器没有 ${JSON.stringify(missingInCompiler)}；` +
      `编译器有而文件里没有 ${JSON.stringify(extraInCompiler)}`,
  );
  assert.deepEqual([...UNKNOWN_AUTHOR_MARKERS], fromFile, '顺序也必须一致（便于人工逐行核对）');
});

test('匿名作者清单：内容为用户拍板的 6 项（含「阙名」）', () => {
  // 这条把「决策」钉死：谁改了文件都必须是有意为之（测试会点出少了/多了谁）。
  assert.deepEqual([...UNKNOWN_AUTHOR_MARKERS], ['佚名', '无名氏', '阙名', '未知', '未详', '不详']);
});

test('匿名作者清单文件形状：非空字符串数组、无重复、无空项', () => {
  const fromFile = readUnknownAuthorsFile();
  assert.ok(Array.isArray(fromFile), `${UNKNOWN_AUTHORS_RELATIVE_PATH} 必须是 JSON 数组`);
  assert.ok(fromFile.length > 0, `${UNKNOWN_AUTHORS_RELATIVE_PATH} 不得为空数组`);
  const notStrings = fromFile.filter((v) => typeof v !== 'string' || v.trim() === '');
  assert.deepEqual(notStrings, [], `只能放非空字符串，问题项：${JSON.stringify(notStrings)}`);
  const dupes = fromFile.filter((v, i) => fromFile.indexOf(v) !== i);
  assert.deepEqual(dupes, [], `有重复项：${JSON.stringify(dupes)}`);
});

test('isUnknownAuthor：清单里的每个名字都认，具名作者不认', () => {
  for (const marker of UNKNOWN_AUTHOR_MARKERS) {
    assert.equal(isUnknownAuthor(marker), true, `${marker} 应视为匿名作者`);
  }
  assert.equal(isUnknownAuthor('阙名'), true);
  assert.equal(isUnknownAuthor('  阙名  '), true);
  for (const named of ['曹植', '蔡邕', '李白', '杜牧']) {
    assert.equal(isUnknownAuthor(named), false, `${named} 不应视为匿名作者`);
  }
  assert.equal(isUnknownAuthor(''), true);
  assert.equal(isUnknownAuthor(null), true);
});
