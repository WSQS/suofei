// 契约线 C：内容根扫描与 ID 派生（用户 2026-10-16 已通过的 C2 收口稿）。
//
// ID ＝ 相对内容根（`content/poems/`）的完整相对路径、去 `.md`、`/` → `-`；层级任意。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ContentError } from '../tools/lib/errors.mjs';
import { dedupeKey, idFromRelativePath, scanPoems } from '../tools/lib/scan.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const fixtures = path.join(ROOT, 'tests', 'fixtures');

test('idFromRelativePath：去 `.md`、`/` → `-`；任意层级', () => {
  assert.equal(idFromRelativePath('行行重行行.md'), '行行重行行');
  assert.equal(idFromRelativePath('古诗十九首/行行重行行.md'), '古诗十九首-行行重行行');
  assert.equal(idFromRelativePath('古诗十九首/甲/青青河畔草.md'), '古诗十九首-甲-青青河畔草');
  // 路径拼出的 `-` 与文件名里本来就有的 `-` 同形 ⇒ 同一 ID（要靠判重报错，不能静默覆盖）
  assert.equal(idFromRelativePath('古诗十九首/行行重行行.md'), idFromRelativePath('古诗十九首-行行重行行.md'));
});

test('dedupeKey：NFC ＋ 小写折叠', () => {
  assert.equal(dedupeKey('ABC'), dedupeKey('abc'));
  assert.equal(dedupeKey('汉'), '汉');
  // 组合字符 vs 预组合字符 ⇒ NFC 后同一个键
  assert.equal(dedupeKey('e\u0301'), dedupeKey('\u00e9'));
});

test('scanPoems：递归读入、按相对路径派生 ID（多层级夹具）', () => {
  const { records, errors, ignored } = scanPoems(path.join(fixtures, 'shape-v2', 'content', 'poems'));
  assert.deepEqual(errors, []);
  assert.equal(ignored.total, 0);
  assert.deepEqual(
    records.map((r) => r.id).sort(),
    ['汉-行行重行行', '唐-甲-静夜思'].sort(),
  );
  assert.deepEqual(
    records.map((r) => r.relPath).sort(),
    ['汉/行行重行行.md', '唐/甲/静夜思.md'].sort(),
  );
});

test('scanPoems：README/`_`/隐藏/临时 ⇒ 忽略并计数，不出现在 records', () => {
  const { records, errors, ignored } = scanPoems(path.join(fixtures, 'ignored-files', 'content', 'poems'));
  assert.deepEqual(errors, []);
  assert.deepEqual(records.map((r) => r.id), ['ok-01']);
  assert.deepEqual(ignored.byReason, {
    '隐藏文件/目录': 1,
    README: 1,
    '_ 前缀（说明/占位）': 1,
    临时文件: 1,
  });
  assert.equal(ignored.total, 4);
});

test('scanPoems：`_` 前缀的**目录**整棵子树被忽略', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-ignore-'));
  try {
    const poems = path.join(dir, 'poems');
    fs.mkdirSync(path.join(poems, '_私稿'), { recursive: true });
    fs.writeFileSync(path.join(poems, '_私稿', 'x.md'), 'x', 'utf8');
    fs.writeFileSync(path.join(poems, 'ok-01.md'), 'x', 'utf8');
    const { records, errors, ignored } = scanPoems(poems);
    assert.deepEqual(errors, []);
    assert.deepEqual(records.map((r) => r.id), ['ok-01']);
    assert.equal(ignored.byReason['_ 前缀（说明/占位）'], 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('scanPoems：非 .md（不在排除清单里）⇒ SOURCE_NOT_MARKDOWN', () => {
  const { errors, records } = scanPoems(path.join(fixtures, 'fail-non-markdown', 'content', 'poems'));
  assert.deepEqual(errors.map((e) => e.code), ['SOURCE_NOT_MARKDOWN']);
  assert.deepEqual(records.map((r) => r.id), ['ok-01'], '报错的那个文件不得进 records');
});

test('scanPoems：内容根不存在 ⇒ CONTENT_DIR_MISSING（抛错，不静默返回空）', () => {
  assert.throws(
    () => scanPoems(path.join(fixtures, '并没有这个目录', 'content', 'poems')),
    (e) => e instanceof ContentError && e.code === 'CONTENT_DIR_MISSING',
  );
});
