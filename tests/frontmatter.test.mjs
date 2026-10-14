// 契约线 C：front matter 最小子集解析器的单元测试。
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontMatter } from '../tools/lib/frontmatter.mjs';

const f = 'x.md';

test('基本标量：字符串/整数/空值/引号/空数组', () => {
  const { data } = parseFrontMatter(
    ['---', 'title: 行行重行行', 'dynastyOrder: 100', 'era:', 'genre: ~', 'variants: []', 'source: "《文选》卷二十九"', "note: '单引号''里面'", '---', '正文', ''].join('\n'),
    f,
  );
  assert.equal(data.title, '行行重行行');
  assert.equal(data.dynastyOrder, 100);
  assert.equal(data.era, null);
  assert.equal(data.genre, null);
  assert.deepEqual(data.variants, []);
  assert.equal(data.source, '《文选》卷二十九');
  assert.equal(data.note, "单引号'里面");
});

test('块标量 |- 保留换行（notes 是 Markdown 文本）', () => {
  const { data, bodyLines } = parseFrontMatter(
    ['---', 'notes: |-', '  第一行', '  第二行', '', '  第三行', '---', '正文行', ''].join('\n'),
    f,
  );
  assert.equal(data.notes, '第一行\n第二行\n\n第三行'); // 尾随空行被去掉，中间空行保留
  assert.deepEqual(bodyLines, ['正文行', '']);
});

test('块标量 > 折行', () => {
  const { data } = parseFrontMatter(['---', 'notes: >', '  甲', '  乙', '', '  丙', '---', ''].join('\n'), f);
  assert.equal(data.notes, '甲 乙\n丙');
});

test('缩进列表：标量项与对象项', () => {
  const { data } = parseFrontMatter(
    ['---', 'variants:', '  - text: 异文甲', '    note: 说明甲', '  - text: 异文乙', '---', '正文', ''].join('\n'),
    f,
  );
  assert.deepEqual(data.variants, [
    { text: '异文甲', note: '说明甲' },
    { text: '异文乙' },
  ]);
});

test('容忍 BOM 与 CRLF', () => {
  const text = '\uFEFF---\r\nid: a-01\r\n---\r\n行\r\n';
  const { data, bodyLines } = parseFrontMatter(text, f);
  assert.equal(bodyLines[0], '行');
  assert.equal(data.id, 'a-01');
});

test('缺少起始 --- 报 FRONT_MATTER_MISSING', () => {
  assert.throws(() => parseFrontMatter('id: x\n---\n', f), (e) => e.code === 'FRONT_MATTER_MISSING');
});

test('缺少结束 --- 报 FRONT_MATTER_UNTERMINATED', () => {
  assert.throws(() => parseFrontMatter('---\nid: x\n', f), (e) => e.code === 'FRONT_MATTER_UNTERMINATED');
});

test('重复键报 YAML_DUPLICATE_KEY', () => {
  assert.throws(
    () => parseFrontMatter('---\nid: x\nid: y\n---\n', f),
    (e) => e.code === 'YAML_DUPLICATE_KEY' && e.line === 3,
  );
});

test('行内 flow 集合明确拒绝（不静默半解析）', () => {
  assert.throws(
    () => parseFrontMatter('---\nsource: [a, b]\n---\n', f),
    (e) => e.code === 'YAML_UNSUPPORTED',
  );
  assert.throws(
    () => parseFrontMatter('---\nsource: {a: 1}\n---\n', f),
    (e) => e.code === 'YAML_UNSUPPORTED',
  );
});

test('无法解析的行带行号报错', () => {
  assert.throws(
    () => parseFrontMatter('---\nid: x\n这不是键值行\n---\n', f),
    (e) => e.code === 'YAML_UNSUPPORTED' && e.line === 3,
  );
});

test('未闭合引号报错', () => {
  assert.throws(() => parseFrontMatter('---\ntitle: "没闭合\n---\n', f), (e) => e.code === 'YAML_UNSUPPORTED');
});
