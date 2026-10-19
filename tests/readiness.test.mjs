// 「这次产物到底能不能推进」的判据守卫（2026-10-19 新增）。
//
// 起因是一个**真缺陷**：`check-ready` 的两个「不满足推进条件」分支原先只打印、**不改退出码**
// （末尾统一 `process.exit(0)`）⇒ 只要不是 `FAIL` 而是 `WARN`（没跑）/`SKIP`（没查），
// 工作流就会照样进到 Pages / Release 那几步 —— 结论写着「不推进」，流水线照样发布。
// 现在判据是一个纯函数，打印与退出码都读它；这里钉住四种情形 + 源码接线（防止有人再把它拆开）。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { decideReadiness } from '../release/lib/readiness.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const READY_SRC = fs.readFileSync(path.join(ROOT, 'release', 'check-ready.mjs'), 'utf8');

test('same-app 全绿 ⇒ 就绪、exit 0', () => {
  const d = decideReadiness({ sameAppRefresh: true, variant: 'release', notGreen: [], sameAppNotGreen: [] });
  assert.deepEqual(d, { ready: true, exitCode: 0, kind: 'same-app-ready', blockers: [] });
});

test('same-app 有任何黄/跳 ⇒ 不就绪、exit 1（黄=没跑，跳=没查，都不算通过）', () => {
  const d = decideReadiness({
    sameAppRefresh: true,
    variant: 'release',
    notGreen: [],
    sameAppNotGreen: [{ id: 'same-app-content-delta' }, { id: 'live-web-e2e' }],
  });
  assert.equal(d.ready, false);
  assert.equal(d.exitCode, 1);
  assert.deepEqual(d.blockers, ['same-app-content-delta', 'live-web-e2e']);
});

test('升版（release 变体）有黄/跳 ⇒ 不就绪、exit 1', () => {
  const d = decideReadiness({ sameAppRefresh: false, variant: 'release', notGreen: [{ id: 'apk-signing' }], sameAppNotGreen: [] });
  assert.equal(d.ready, false);
  assert.equal(d.exitCode, 1);
  assert.deepEqual(d.blockers, ['apk-signing']);
});

test('升版全绿 ⇒ 就绪、exit 0', () => {
  const d = decideReadiness({ sameAppRefresh: false, variant: 'release', notGreen: [], sameAppNotGreen: [] });
  assert.equal(d.ready, true);
  assert.equal(d.exitCode, 0);
});

test('debug 变体＝演练口径：可以正常结束（exit 0），但**不主张**可正式发布（ready=false）', () => {
  const d = decideReadiness({ sameAppRefresh: false, variant: 'debug', notGreen: [{ id: 'apk-signing' }], sameAppNotGreen: [] });
  assert.equal(d.kind, 'rehearsal-debug');
  assert.equal(d.ready, false, 'debug 演练永远不许被读成“可以发布”');
  assert.equal(d.exitCode, 0);
});

test('接线：结论与退出码必须都读同一个 decision（源码级守卫）', () => {
  assert.match(READY_SRC, /const decision = decideReadiness\(/, 'check-ready 必须真的调用这个判据');
  assert.match(
    READY_SRC,
    /process\.exit\(decision\.exitCode\)/,
    '结尾必须是 `process.exit(decision.exitCode)` —— 曾经是写死的 `process.exit(0)`，那会让“结论不推进”时照样进 Pages/Release',
  );
  assert.doesNotMatch(
    READY_SRC,
    /process\.exit\(0\)/,
    '不许再出现写死的 success 退出码（演练口径的 0 由 decideReadiness 给）',
  );
  // 结论行必须由 kind 选，不能是“先固定打印一句话、再另算退出码”那种会互相打脸的形状。
  for (const kind of ['same-app-ready', 'release-ready', 'rehearsal-debug']) {
    assert.ok(READY_SRC.includes(`'${kind}'`), `结论分支缺 ${kind}`);
  }
});
