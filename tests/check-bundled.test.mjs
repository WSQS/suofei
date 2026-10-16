// 契约线 C：内置内容一致性门的**纯逻辑**（`tools/check-bundled-content.mjs`）。
//
// 为什么单独钉这一层：这一门**不在 `npm test` 里**（`npm test` 只跑 `tests/*.test.mjs`，而这门要
// 真的编译 `content/poems/`）；而它最危险的失效形状不是「报错」，是**看起来通过了、其实什么都没查**
// （本仓已出现过三次同类事故）。所以这里把「有差异」「什么都查不到」「有未查项」三种判定钉住，
// 且**不依赖编译真实内容**。
import test from 'node:test';
import assert from 'node:assert/strict';
import { detailCount, evaluateTargets, shapeOf, verdictOf } from '../tools/check-bundled-content.mjs';

/** 当前编译产物的最小形状（10 键齐全）。 */
function product(over = {}) {
  return {
    formatVersion: 2,
    contentVersion: '2026.10.16.1',
    generatedAt: '2026-10-16T00:00:00Z',
    dynasties: ['汉'],
    poems: [
      {
        id: '汉-行行重行行',
        title: '行行重行行',
        author: '佚名',
        dynasty: '汉',
        genre: '五言古诗',
        source: '夹具',
        orderInSource: 1,
        detail: '### 异文',
        stanzas: [['行行重行行，与君生别离。']],
        notes: null,
      },
    ],
    ...over,
  };
}

const entry = (over) => ({ label: 'Android 内置内容', path: 'a.json', required: true, missing: false, text: null, ...over });

test('shapeOf：stanzas 的二维形状不能被拍平还看不出来', () => {
  assert.notEqual(shapeOf(product()), shapeOf(product({ poems: [{ ...product().poems[0], stanzas: ['一行'] }] })));
});

test('一致 ⇒ 绿，且摘要说清「已查几处」', () => {
  const current = product();
  const result = evaluateTargets(current, [entry({ text: JSON.stringify(product()) })]);
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.notChecked, []);
  assert.deepEqual(result.checked, ['Android 内置内容']);
  const verdict = verdictOf(result, current);
  assert.equal(verdict.exitCode, 0);
  assert.match(verdict.lines[0], /一致性通过：已查 1 处/);
  assert.match(verdict.lines[0], /formatVersion=2/);
});

test('内置产物落后（内容不同）⇒ 红，并把两边的量摆出来', () => {
  const current = product();
  const stale = product({ poems: [{ ...product().poems[0], title: '改过的标题' }] });
  const result = evaluateTargets(current, [entry({ text: JSON.stringify(stale) })]);
  assert.equal(result.problems.length, 1);
  assert.match(result.problems[0], /与当前内容不一致/);
  assert.match(result.problems[0], /带详情=1/);
  const verdict = verdictOf(result, current);
  assert.equal(verdict.exitCode, 1);
  assert.equal(verdict.kind, 'problems');
  assert.ok(verdict.lines.some((l) => l.includes('✗')));
});

test('formatVersion 不是同一代 ⇒ 红，并单独说「不是同一代」（不混进字段 diff）', () => {
  const current = product(); // v2
  const builtinV1 = { ...product(), formatVersion: 1 };
  const result = evaluateTargets(current, [entry({ text: JSON.stringify(builtinV1) })]);
  assert.equal(result.problems.length, 1);
  assert.match(result.problems[0], /formatVersion=1 与当前编译产物 2 不是同一代/);
  assert.match(result.problems[0], /没跟着升版/);
  assert.equal(verdictOf(result, current).exitCode, 1);
});

test('必需目标缺失 ⇒ 红（明确说是「必需的内置产物」）', () => {
  const current = product();
  const result = evaluateTargets(current, [entry({ missing: true, text: null })]);
  assert.equal(result.problems.length, 1);
  assert.match(result.problems[0], /文件不存在/);
  assert.match(result.problems[0], /必需/);
  assert.equal(verdictOf(result, current).exitCode, 1);
});

test('目标不是合法 JSON ⇒ 红（不当成「没查」搪塞过去）', () => {
  const current = product();
  const result = evaluateTargets(current, [entry({ text: '{ "formatVersion": 2, ' })]);
  assert.equal(result.problems.length, 1);
  assert.match(result.problems[0], /不是合法 JSON/);
  assert.equal(verdictOf(result, current).exitCode, 1);
});

test('可选目标缺失 ⇒ 记为「没查」并单独一行列出；不得被拂进「一致性通过」那句话', () => {
  const current = product();
  const result = evaluateTargets(current, [
    entry({ text: JSON.stringify(product()) }),
    entry({ label: 'Web 本地内容', path: 'web/content.json', required: false, missing: true, text: null }),
  ]);
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.notChecked, ['Web 本地内容（web/content.json）']);
  assert.deepEqual(result.checked, ['Android 内置内容']);
  const verdict = verdictOf(result, current);
  assert.equal(verdict.exitCode, 0);
  // 第一行只说已查的那一处；「Web 本地内容」只能出现在另一行，且带「没查 ≠ 通过」
  assert.ok(!verdict.lines[0].includes('Web 本地内容'), '通过那句话不得提及未查的目标');
  assert.ok(verdict.lines.some((l) => l.includes('没查') && l.includes('Web 本地内容') && l.includes('没查 ≠ 通过')));
});

test('什么都查不到 ⇒ 红（「没查」绝不等于「通过」）', () => {
  const current = product();
  const result = evaluateTargets(current, [
    entry({ label: 'Android 内置内容', required: false, missing: true, text: null }),
    entry({ label: 'Web 本地内容', path: 'web/content.json', required: false, missing: true, text: null }),
  ]);
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.checked, []);
  const verdict = verdictOf(result, current);
  assert.equal(verdict.exitCode, 1, '一处都没查到时必须是红，不是宽松通过');
  assert.equal(verdict.kind, 'nothing-checked');
  assert.ok(verdict.lines.some((l) => l.includes('没查') && l.includes('不是通过')));
});

test('detailCount：只数「确实有详情」的诗', () => {
  const doc = product({
    poems: [product().poems[0], { ...product().poems[0], id: 'x', detail: null }],
  });
  assert.equal(detailCount(doc), 1);
});
