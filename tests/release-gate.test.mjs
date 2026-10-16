// 发布门的**语义**守卫（负责人 2026-10-16 按对话侧要求新增）。
//
// 要钉住的不是「某个门现在跑得通」，而是两条**不会自己坏掉**的性质：
//   ① 新增的 Markdown 契约对照**确实在 gating 名单里** —— 有人把它从 LIVE_CHECK_IDS 里摘掉时，
//      这条会红（摘掉等于把它降级成「不挡任何东西的门」，本项目点名的反模式）。
//   ② **没跑 ≠ 绿**：环境不可用时该门必须返回 `WARN`（而不是 `PASS`），
//      且 check-ready 的结论判据必须是「只有 `PASS` 算绿」—— `WARN`/`FAIL`/`SKIP` 一律不能算绿。
//
// ⚠ 这里**不**跑真浏览器：跳过一个门的运行成本正是那一门自己的事。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { LIVE_CHECK_IDS, runMarkdownConformance } from '../release/lib/live.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const CHECK_READY = path.join(ROOT, 'release', 'check-ready.mjs');

test('新增的 Markdown 契约对照在 gating 名单里（摘掉它必须是一次显式的改动）', () => {
  const ids = [...LIVE_CHECK_IDS];
  assert.ok(
    ids.includes('live-markdown-conformance'),
    `LIVE_CHECK_IDS 里没有 'live-markdown-conformance' ⇒ 这道门挂空、挡不住任何东西。现有：${ids.join(', ')}`,
  );
  // 另外两道既有的真跑门不能被顺手弄丢。
  for (const id of ['live-web-e2e', 'live-android-unit-tests']) {
    assert.ok(ids.includes(id), `LIVE_CHECK_IDS 丢了 '${id}'。现有：${ids.join(', ')}`);
  }
});

test('【没跑 ≠ 绿】找不到浏览器时该门必须报 WARN 而不是 PASS', () => {
  const saved = process.env.CHROME_BIN;
  process.env.CHROME_BIN = path.join(ROOT, 'definitely-not-here', 'chrome.exe');
  try {
    const r = runMarkdownConformance({ outDir: path.join(ROOT, 'release', 'out') });
    assert.notEqual(r.status, 'PASS', '环境不可用时绝不允许报 PASS');
    assert.equal(r.status, 'WARN', '环境不可用应当是 WARN（「没跑」），而不是 FAIL（「跑了并失败」）也不许是 PASS');
    assert.match(r.detail, /没跑|不是通过/, 'WARN 的说明必须明确写「没跑／不是通过」，不能让人读成通过');
  } finally {
    if (saved === undefined) delete process.env.CHROME_BIN;
    else process.env.CHROME_BIN = saved;
  }
});

test('check-ready 的结论判据是「只有 PASS 算绿」（源码级守卫）', () => {
  const src = fs.readFileSync(CHECK_READY, 'utf8');
  // 判据必须写成 `status !== 'PASS'` 这类形式：于是 WARN（没跑）/FAIL（跑了并失败）/SKIP（跳过）全都算「非绿」。
  assert.match(
    src,
    /filter\(\s*\(?\s*\w+\s*\)?\s*=>\s*\w+\.status\s*!==\s*'PASS'\s*\)/,
    '找不到「!== PASS」形制的非绿判据 —— 判据一旦改成「只排除 FAIL」之类，WARN/没跑 就会被算成绿',
  );
  assert.match(src, /LIVE_CHECK_IDS/, '结论必须由 LIVE_CHECK_IDS 推出来，而不是写死一句话');
});
