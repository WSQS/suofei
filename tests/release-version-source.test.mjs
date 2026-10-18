// 单调性**基线选择**的证伪用例（2026-10-18，对话侧指出的发布前守卫缺陷）。
//
// 缺陷形状：`release/lib/version-source.mjs` 的 `resolvePreviousVersion` 过去对**所有**候选
// 用 `isOlder(candidate, current)`（`< current`）过滤 ⇒ 等于/高于本次的候选**全部被丢掉**。
// 于是一次**回退发布**（线上/已发布 tag 2026.10.19.1，本次却准备 2026.10.18.3）会把真正更高的
// 基线滤掉，转而选中更低的 2026.10.16.26，**单调门因此放行**。
//
// 要钉住的两条性质（只按**身份**排除，不按「版本 ≥ 本次」排除）：
//   ① 只有「本次自己」可以不算上一版：本次准备的产物资产（内置内容 / 本次 out 目录的清单，
//      版本号**恰好等于**本次）与**本次正在发的那个 tag 自身**（按 tag 名认身份）。
//   ② 其余候选（包括**更高**的）一律保留，交由**单调门**报红；错误信息要能看出「基线比本次新」。
//   ③ 显式 `--previous-version` 不是后门：线上真值/已发布 tag 更高时，门必须见到更高那个。
//
// ⚠️ 这些用例**不联网**：线上真值通过参数注入（`liveVersion`），`git tag` 输出通过 `tagOutput`
//    注入，内置内容与 out 清单用临时文件（`bundledFile` / `manifestFile`）——
//    也就是说被测的是**判定逻辑**本身，不依赖本机此刻的仓库/线上状态。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as VS from '../release/lib/version-source.mjs';
import { resolveContentVersion } from '../tools/lib/version.mjs';

const CURRENT = '2026.10.18.3'; // 本次准备的内容版本（完整四段合法形）
const LOWER = '2026.10.16.26'; // 更旧的已发布内容版本
const HIGHER = '2026.10.19.1'; // 更新的已发布内容版本（回退发布时的真实基线）

/**
 * 单调门的守卫：`assertBaselineIsOlder` 是 release 侧**显式**的一道门（在编译之前跑），
 * 它必须能把「基线比本次新」这件事说清楚。
 * 修前没有这个导出 —— 于是这里直接失败，而不是悄悄退回“没有门”。
 */
function gate({ previous, current, source = null }) {
  assert.equal(
    typeof VS.assertBaselineIsOlder,
    'function',
    'release/lib/version-source.mjs 没有导出 assertBaselineIsOlder ⇒ 没有一道门会明确说出「基线比本次新」',
  );
  return VS.assertBaselineIsOlder({ previous, current, source });
}

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'suofei-baseline-'));
}

/** 写一份「内置内容 / out 清单」形状的最小 JSON（只需 contentVersion）。 */
function writeDoc(file, contentVersion) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ contentVersion }));
  return file;
}

function tagLines(...contentVersions) {
  // 应用版本号与内容版本号是**两个**号；这里只关心内容那一段。
  return contentVersions.map((v, i) => `v0.1.${i}+content-${v}`).join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// 证伪用例 1：更高的已发布候选**不得**被忽略
//   旧实现把 `2026.10.19.1`（> 本次 .3）过滤掉 ⇒ 基线落到 `.16.26` ⇒ 回退发布过关。
// ─────────────────────────────────────────────────────────────────────────────
test('【证伪】更高的已发布 tag 必须保留为基线，并由单调门报红（能看出「基线比本次新」）', () => {
  const dir = tmpdir();
  const bundledFile = writeDoc(path.join(dir, 'android-content.json'), LOWER);
  const r = VS.resolvePreviousVersion({
    explicit: null,
    manifestFile: path.join(dir, 'no-manifest.json'),
    currentVersion: CURRENT,
    tagOutput: tagLines(LOWER, HIGHER),
    bundledFile,
    liveVersion: null,
  });

  assert.notEqual(
    r.version,
    LOWER,
    `更高的已发布 tag ${HIGHER} 被过滤掉了，基线退回 ${LOWER} ⇒ 回退发布能过单调门（这正是要修的缺陷）`,
  );
  assert.equal(r.version, HIGHER, `基线应保留**更高者** ${HIGHER}；实际 ${String(r.version)}（来源：${String(r.source)}）`);

  // 单调门必须报红，且失败信息要能看出「基线比本次新」。
  assert.throws(
    () => gate({ previous: r.version, current: CURRENT, source: r.source }),
    (err) => {
      assert.equal(err.code, 'VERSION_BASELINE_AHEAD', `错误码应指出基线更靠前；实际 ${err.code}：${err.message}`);
      assert.match(err.message, /比本次 .*新|基线.*新/, `信息里必须能看出「基线比本次新」；实际：${err.message}`);
      assert.ok(err.message.includes(HIGHER) && err.message.includes(CURRENT), `信息里要同时有基线 ${HIGHER} 与本次 ${CURRENT}：${err.message}`);
      return true;
    },
  );

  // 编译侧那道既有门（tools/lib/version.mjs 的 VERSION_NOT_MONOTONIC）也必须红：
  // 基线没被缩小 ⇒ 真编译同样过不去。
  assert.throws(
    () => resolveContentVersion({ explicit: CURRENT, previous: r.version, digestHex: '0'.repeat(64) }),
    (err) => {
      assert.equal(err.code, 'VERSION_NOT_MONOTONIC', `编译门应当是 VERSION_NOT_MONOTONIC；实际 ${err.code}`);
      assert.ok(err.message.includes(HIGHER), `编译门信息里要提到基线 ${HIGHER}：${err.message}`);
      return true;
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 证伪用例 2：只有更低候选时，基线＝其中最大者，单调门绿
// ─────────────────────────────────────────────────────────────────────────────
test('只有更低候选：基线取最大者，单调门绿', () => {
  const dir = tmpdir();
  const bundledFile = writeDoc(path.join(dir, 'android-content.json'), '2026.10.16.24');
  const r = VS.resolvePreviousVersion({
    explicit: null,
    manifestFile: path.join(dir, 'no-manifest.json'),
    currentVersion: CURRENT,
    tagOutput: tagLines('2026.10.16.20', LOWER),
    bundledFile,
    liveVersion: null,
  });
  assert.equal(r.version, LOWER, `基线应是最大者 ${LOWER}；实际 ${String(r.version)}`);
  const g = gate({ previous: r.version, current: CURRENT, source: r.source });
  assert.equal(g.ok, true, `更低基线不该报红：${g.detail ?? ''}`);
  assert.equal(g.checked, true, '给出了基线就必须是“真查过”，不能报成未验');
});

// ─────────────────────────────────────────────────────────────────────────────
// 证伪用例 3：显式 --previous-version 不是后门
//   显式给 .16.26、线上真值是 .19.1 ⇒ 门必须见到**.19.1**
// ─────────────────────────────────────────────────────────────────────────────
test('显式 --previous-version 不得绕过线上真值：线上更高时门必须见到更高那个', () => {
  const dir = tmpdir();
  // 本次准备的产物资产（版本号恰等于本次）⇒ 按身份排除，不参与“上一版”。
  const bundledFile = writeDoc(path.join(dir, 'android-content.json'), CURRENT);
  const r = VS.resolvePreviousVersion({
    explicit: LOWER,
    manifestFile: path.join(dir, 'no-manifest.json'),
    currentVersion: CURRENT,
    tagOutput: '',
    bundledFile,
    liveVersion: HIGHER,
    liveSource: '线上站点 content/latest.json',
  });
  assert.notEqual(r.version, LOWER, `显式值 ${LOWER} 盖住了线上真值 ${HIGHER} ⇒ 回退发布能过门`);
  assert.equal(r.version, HIGHER, `基线必须取线上真值 ${HIGHER}；实际 ${String(r.version)}`);
  assert.match(String(r.source ?? ''), /线上/, `来源里要写明是线上真值：${String(r.source)}`);
  assert.throws(
    () => gate({ previous: r.version, current: CURRENT, source: r.source }),
    (err) => {
      assert.equal(err.code, 'VERSION_BASELINE_AHEAD');
      assert.ok(err.message.includes(HIGHER) && err.message.includes(CURRENT), err.message);
      return true;
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 防回归（上一轮修过的**假红**不能回来）：本次自己的资产/本次 tag 自身按身份排除
// ─────────────────────────────────────────────────────────────────────────────
test('本次准备的资产与本次 tag 自身按**身份**排除，不因「自己」报红', () => {
  const dir = tmpdir();
  const currentTag = `v0.1.4+content-${CURRENT}`;
  const bundledFile = writeDoc(path.join(dir, 'android-content.json'), CURRENT); // 发布准备把新内容编进内置产物
  const manifestFile = writeDoc(path.join(dir, 'release-manifest.json'), CURRENT); // 同一 out 目录重跑
  const r = VS.resolvePreviousVersion({
    explicit: null,
    manifestFile,
    currentVersion: CURRENT,
    tagOutput: [`${currentTag}`, ...tagLines(LOWER).split('\n')].join('\n'), // 本次 tag 已存在（重跑）
    currentTag,
    bundledFile,
    liveVersion: null,
  });
  assert.equal(r.version, LOWER, `「自己」不该被当成上一版，也不该把更低的历史版本挤掉；实际 ${String(r.version)}`);
  const g = gate({ previous: r.version, current: CURRENT, source: r.source });
  assert.equal(g.ok, true, `不因“自己”报红；实际：${g.detail ?? ''}`);
  // 排除必须是**可解释**的：三样「自己」都要被点名，而不是悄悄消失。
  const excluded = (r.excluded ?? []).join(' | ');
  assert.match(excluded, new RegExp(CURRENT.replace(/\./g, '\\.')), `排除项要写明是本次版本 ${CURRENT}：${excluded}`);
  assert.ok(excluded.includes(currentTag), `本次 tag 自身要按名字被点名排除：${excluded}`);
  assert.equal((r.excluded ?? []).length >= 3, true, `内置内容、out 清单、本次 tag 三样都该被点名：${excluded}`);
});

test('按**身份**排除而不是按版本排除：同版本但不同名的已发布 tag 仍然算基线（会红）', () => {
  const dir = tmpdir();
  const bundledFile = writeDoc(path.join(dir, 'android-content.json'), LOWER);
  const otherTag = `v0.1.3+content-${CURRENT}`; // 内容版本相同、但**不是**本次要发的 tag
  const r = VS.resolvePreviousVersion({
    explicit: null,
    manifestFile: path.join(dir, 'no-manifest.json'),
    currentVersion: CURRENT,
    tagOutput: otherTag,
    currentTag: `v0.1.4+content-${CURRENT}`,
    bundledFile,
    liveVersion: null,
  });
  assert.equal(r.version, CURRENT, `同版本的另一条已发布 tag 不是“本次自己”，必须保留为基线；实际 ${String(r.version)}`);
  assert.throws(
    () => gate({ previous: r.version, current: CURRENT, source: r.source }),
    (err) => {
      assert.equal(err.code !== 'VERSION_BASELINE_AHEAD' && err.code !== 'VERSION_NOT_MONOTONIC', false, `基线等于本次必须报红；实际 ${err.code}`);
      assert.ok(err.message.includes(CURRENT), err.message);
      return true;
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 诚实：一个候选都没有时不造假基线（“未验”不等于“验过”）
// ─────────────────────────────────────────────────────────────────────────────
test('没有任何候选时如实返回 null（未验，不造假基线）', () => {
  const dir = tmpdir();
  const r = VS.resolvePreviousVersion({
    explicit: null,
    manifestFile: path.join(dir, 'no-manifest.json'),
    currentVersion: CURRENT,
    tagOutput: '',
    bundledFile: path.join(dir, 'no-bundled.json'),
    liveVersion: null,
  });
  assert.equal(r.version, null, `没有候选就不能造一个基线；实际 ${String(r.version)}`);
  assert.equal(r.source, null);
  const g = gate({ previous: r.version, current: CURRENT, source: r.source });
  assert.equal(g.checked, false, '没有基线时必须明确报告“未验”，不能报成验过');
  assert.equal(g.ok, true);
});
