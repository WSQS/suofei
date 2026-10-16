// 契约线：`formatVersion` 的「字段集一变就升」判据（用户 2026-10-15 定的 B 判据）。
//
// 这条判据的全部价值在于「机械、可自动断言」——所以它必须真的被断言守着，否则只是文档里
// 的一句话。这里做四件事：① 当前产物与冻结记录一致；② 记录本身健康；③ 口径覆盖客户端
// 真正读的键；④ **门不是空过**（改字段集必红、只改内容不红）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fieldPaths, fieldSetSha256, fieldSetEntry } from '../tools/lib/field-set.mjs';
import { checkAgainst, compileCurrent } from '../tools/check-fieldset.mjs';

const RECORD = 'schema/format-version.json';
const readRecord = () => JSON.parse(readFileSync(RECORD, 'utf8'));

/** 编译一次当前**形状**（默认编译 tests/fixtures/shape-v2/content：S2 落地时真实内容还是 v1 源，
 * 编不过；本门守的是**形状**，而编译器对每首都无条件发出这 10 个键 ⇒ 单首诗就能定形状）。
 * 见 tools/check-fieldset.mjs 文件头的 ⚠ 说明。 */
function withCurrentProduct(fn) {
  const tmp = mkdtempSync(join(tmpdir(), 'suofei-fv-'));
  try {
    return fn(compileCurrent(tmp));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

test('产物字段集与冻结记录一致（改动字段集却不升 formatVersion ⇒ 这里红）', () => {
  withCurrentProduct((doc) => {
    const { ok, problems } = checkAgainst(doc, readRecord());
    assert.equal(ok, true, problems.join('\n'));
  });
});

test('记录本身健康：formatVersion 严格递增、无重复、每条都有指纹与路径', () => {
  const { versions } = readRecord();
  assert.ok(versions.length >= 1, '记录至少要有一条');
  for (let i = 1; i < versions.length; i++) {
    assert.ok(
      versions[i].formatVersion > versions[i - 1].formatVersion,
      `formatVersion 必须严格递增：${versions[i - 1].formatVersion} → ${versions[i].formatVersion}`,
    );
  }
  for (const v of versions) {
    assert.match(v.fieldSetSha256, /^[0-9a-f]{64}$/, `formatVersion=${v.formatVersion} 的指纹形状不对`);
    assert.equal(fieldSetSha256(v.fieldPaths), v.fieldSetSha256, `formatVersion=${v.formatVersion} 的指纹与路径不自洽`);
  }
});

test('记录保留了 formatVersion=1 的旧形状（老客户端认得的键路径仍在账上）', () => {
  const { versions } = readRecord();
  const v1 = versions.find((v) => v.formatVersion === 1);
  const v2 = versions.find((v) => v.formatVersion === 2);
  assert.ok(v1, 'v1 那条不得删掉：它记录着老客户端认得的形状');
  assert.ok(v1.fieldPaths.includes('poems[].variants[].text'));
  assert.ok(v1.fieldPaths.includes('dynasties[].key'));
  assert.ok(v2, 'v2 记录缺失');
  assert.ok(v2.fieldPaths.includes('poems[].detail'));
  assert.ok(!v2.fieldPaths.includes('poems[].variants'));
  assert.ok(v2.fieldPaths.includes('dynasties[]'));
  assert.equal(v2.fieldPaths.includes('dynasties[].key'), false);
});

test('口径覆盖客户端真正读的键（顶层键 + 诗对象 + 中文组数组 + 段的二维形状）', () => {
  withCurrentProduct((doc) => {
    const paths = fieldPaths(doc);
    for (const must of [
      'formatVersion',
      'contentVersion',
      'generatedAt',
      'dynasties',
      'dynasties[]',
      'poems',
      'poems[].id',
      'poems[].title',
      'poems[].author',
      'poems[].dynasty',
      'poems[].genre',
      'poems[].source',
      'poems[].orderInSource',
      'poems[].detail',
      'poems[].stanzas',
      'poems[].stanzas[]',
      'poems[].stanzas[][]', // 段→行：二维，不能被拍平还看不出来
      'poems[].notes',
    ]) {
      assert.ok(paths.includes(must), `字段集里应当有 ${must}（口径漏了客户端会读的键）`);
    }
    // formatVersion=2 的形状：`dynasties` 是中文值数组 ⇒ 不再有 dynasties[].key/label/order；
    // 每首不再有 dynastyKey/dynastyLabel/dynastyOrder/era/variants。
    for (const gone of [
      'dynasties[].key',
      'dynasties[].label',
      'dynasties[].order',
      'poems[].dynastyKey',
      'poems[].dynastyLabel',
      'poems[].dynastyOrder',
      'poems[].era',
      'poems[].variants',
      'poems[].variants[].text',
      'poems[].variants[].note',
    ]) {
      assert.ok(!paths.includes(gone), `formatVersion=2 不应再有 ${gone}`);
    }
    // 「客户端不得重排」这条已定决策的产物侧体现：产物里不得出现任何排序键。
    assert.ok(
      !paths.some((p) => /sort/i.test(p)),
      `产物里不该出现排序键，但字段集里有：${paths.filter((p) => /sort/i.test(p)).join(', ')}`,
    );
  });
});

test('门不是空过：改字段集必红，只改内容不红', () => {
  withCurrentProduct((doc) => {
    const record = readRecord();
    const clone = () => JSON.parse(JSON.stringify(doc));
    const entry = fieldSetEntry(doc);

    // ① 只改内容（换一首诗题、给一首诗加笔记）⇒ 指纹**不变**（否则就是误报，会把内容发布挡在门外）
    const contentOnly = clone();
    contentOnly.poems[0].title = '改过的标题';
    contentOnly.poems[0].notes = '一句笔记';
    assert.equal(fieldSetEntry(contentOnly).fieldSetSha256, entry.fieldSetSha256, '只改内容不该改变字段集指纹');

    // ② 新增一个键 ⇒ 必红，且报出那个键名
    const added = clone();
    added.poems[0].brandNewField = 1;
    const r1 = checkAgainst(added, record);
    assert.equal(r1.ok, false, '新增键却判通过 ⇒ 门是空过的');
    assert.ok(r1.problems.join(' ').includes('brandNewField'), '报错要点名新增的键');

    // ③ 删掉一个键 ⇒ 必红。**注意要从所有元素上删**：并集规则下，只从一首诗删、
    //    别的诗还有那个键时，字段集确实没变（这是刻意的语义，见 tools/lib/field-set.mjs 规则 3）。
    const removed = clone();
    removed.poems = removed.poems.map(({ notes, ...rest }) => rest);
    assert.equal(
      fieldPaths(removed).includes('poems[].notes'),
      false,
      '所有诗都不再有 notes 时，`poems[].notes` 应当从字段集里消失',
    );
    assert.equal(checkAgainst(removed, record).ok, false, '删键却判通过 ⇒ 门是空过的');

    // ③b 只从**一首**诗上删 ⇒ 指纹**不变**（并集语义，防误报）
    const onePoemRemoved = clone();
    delete onePoemRemoved.poems[0].notes;
    assert.equal(
      fieldSetEntry(onePoemRemoved).fieldSetSha256,
      entry.fieldSetSha256,
      '只从一首诗上删键不该改变字段集（别的诗还有它）',
    );

    // ④ 把 stanzas 从「段→行」拍平成一维 ⇒ 必红（这正是两条客户端会读错的那种改动）
    const flattened = clone();
    flattened.poems = flattened.poems.map((p) => ({ ...p, stanzas: p.stanzas.flat() }));
    assert.equal(checkAgainst(flattened, record).ok, false, '拍平 stanzas 却判通过 ⇒ 门抓不住二维形状');
    assert.ok(!fieldPaths(flattened).includes('poems[].stanzas[][]'), '拍平后不该再有二维路径');

    // ⑤ 顶层新增一个键 ⇒ 必红
    const topLevel = clone();
    topLevel.newTopKey = true;
    assert.equal(checkAgainst(topLevel, record).ok, false, '顶层新增键却判通过 ⇒ 门是空过的');

    // ⑥ 产物声称的 formatVersion 在记录里不存在 ⇒ 必红（升了版本却没记形状）
    const bumped = clone();
    bumped.formatVersion = 99;
    assert.equal(checkAgainst(bumped, record).ok, false, '未记录的 formatVersion 却判通过');
  });
});
