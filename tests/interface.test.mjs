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
  DYNASTY_KEYS,
  FORMAT_VERSION,
  ID_PATTERN,
  INTERNAL_SORT_KEYS,
  OPTIONAL_FRONT_MATTER_KEYS,
  POEM_KEYS,
  REQUIRED_FRONT_MATTER_KEYS,
  VARIANT_KEYS,
} from '../tools/lib/interface.mjs';
import { buildContentFromRecords } from '../tools/lib/content-build.mjs';

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

test('schema：分组与异文对象的键序', () => {
  assert.deepEqual(schema.properties.dynasties.items.required, [...DYNASTY_KEYS]);
  assert.deepEqual(Object.keys(schema.properties.dynasties.items.properties), [...DYNASTY_KEYS]);
  const variant = schema.properties.poems.items.properties.variants.items;
  assert.deepEqual(variant.required, [...VARIANT_KEYS]);
  assert.equal(variant.additionalProperties, false);
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

test('schema：id 正则与 interface.mjs 的 ID_PATTERN 一致', () => {
  assert.equal(schema.properties.poems.items.properties.id.pattern, ID_PATTERN);
});

test('front matter 键集：必填 + 可选 = 允许的全部，且中间产物字段可追溯到源字段', () => {
  assert.deepEqual(ALL_FRONT_MATTER_KEYS, [...REQUIRED_FRONT_MATTER_KEYS, ...OPTIONAL_FRONT_MATTER_KEYS]);
  // 源字段 → 产物字段（dynasty 派生三个字段，stanzas 来自正文，排序键为编译期派生）
  const derived = new Set(['dynastyKey', 'dynastyLabel', 'dynastyOrder', 'stanzas']);
  for (const key of POEM_KEYS) {
    if (derived.has(key)) continue;
    assert.ok(
      ALL_FRONT_MATTER_KEYS.includes(key),
      `产物字段 ${key} 在 front matter 里没有来源，说明有一处定义没同步`,
    );
  }
});

test('产物键序与 interface.mjs 完全一致（编译结果不是另一套形状）', () => {
  const dir = path.join(ROOT, 'tests', 'fixtures', 'ok-sorting', 'content', 'poems');
  const records = fs
    .readdirSync(dir)
    .sort()
    .map((name) => ({
      displayPath: `content/poems/${name}`,
      base: name.slice(0, -3),
      text: fs.readFileSync(path.join(dir, name), 'utf8'),
    }));
  const { content, errors } = buildContentFromRecords({ records, explicitVersion: '2026.10.14.9' });
  assert.deepEqual(errors, []);
  assert.deepEqual(Object.keys(content), [...CONTENT_KEYS]);
  for (const p of content.poems) assert.deepEqual(Object.keys(p), [...POEM_KEYS]);
  for (const v of content.poems.flatMap((p) => p.variants)) assert.deepEqual(Object.keys(v), [...VARIANT_KEYS]);
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
