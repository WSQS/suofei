// 发布说明（Release notes）模板的守卫。
//
// 由来（2026-10-23 的真实事故，公开发布之后才被发现）：
//   `release/notes/release-notes-same-app.md` 原本把**某一批**的内容写死
//   （「新增一首：杜甫《望岳》」「合计 23 首 / 3 组」）。CI 每次发布只替换 tag/版本号那几个占位符，
//   于是 **内容 `.20.1`（28 首）与 `.23.4`（31 首）两次发布的 Release 正文都把 `.19.3 → .20.1` 那一批的描述
//   又发了一遍** —— 正文说「新增望岳、23 首 / 3 组」，而真实产物是 28 → 31 首、新增垓下歌/高轩过/唐多令。
//   这就是「看起来有保障、其实没有」的同一形状：**没有任何门在看发布说明是否与产物相符**。
//
// 处置（本文件钉住的那两条）：
//   1. **模板里不许出现具体批次的事实**（诗名、首数/组数、「新增 X 首」……）——由下面的 `findBatchFacts` 判据；
//   2. 具体内容改由**逐版说明文件** `release/notes/release-notes-same-app-<内容版本>.md` 提供，
//      工作流里**逐版文件优先**，退到模板时还要打出 `::warning::`（不许静默）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const NOTES_DIR = path.join(REPO_ROOT, 'release', 'notes');
const TEMPLATE = path.join(NOTES_DIR, 'release-notes-same-app.md');
const WORKFLOW = path.join(REPO_ROOT, '.github', 'workflows', 'release.yml');

/** 模板必须保留的占位符（CI 用 sed 注入；少一个，正文里就会留下原始 `@XXX@`）。 */
const PLACEHOLDERS = ['@TAG@', '@APP_VERSION@', '@CONTENT_VERSION@', '@PREVIOUS_CONTENT_VERSION@', '@VERSION_CODE@'];

/** 近几批真实出现过的诗题 —— 模板里出现任何一个都说明「把某一批写进了通用模板」。 */
const KNOWN_TITLES = [
  '望岳', '梦李白', '垓下歌', '高轩过', '唐多令',
  '忆秦娥', '清平乐', '浪淘沙', '卜算子',
];

/**
 * 在**模板**文本里找「具体批次的事实」。纯函数，便于证伪（见下面的反例用例）。
 * @param {string} text
 * @returns {{kind: string, sample: string}[]}
 */
export function findBatchFacts(text) {
  const src = String(text ?? '');
  const hits = [];
  const add = (kind, m) => hits.push({ kind, sample: m });

  // ① 首数/组数的绝对值：「23 首 / 3 组」「31 首 / 4 组」
  for (const m of src.matchAll(/\d+\s*首\s*\/\s*\d+\s*组/g)) add('首数/组数绝对值', m[0]);
  // ② 首数增量：「2 → 3 首」「28 → 31 首」（允许中间的 markdown 强调符）
  for (const m of src.matchAll(/\d+\s*→\s*\**\s*\d+\s*\**\s*首/g)) add('首数增量', m[0]);
  // ③ 「新增 X 首 / 新增一首」这类批次叙述
  for (const m of src.matchAll(/新增\s*(?:[0-9一二三四五六七八九十]+\s*首|一首)/g)) add('批次叙述', m[0]);
  // ④ 具体诗题
  for (const t of KNOWN_TITLES) {
    if (src.includes(t)) add('具体诗题', t);
  }
  return hits;
}

test('同 app 说明模板里不写具体批次的事实（诗题/首数/组数/新增几首）', () => {
  const text = fs.readFileSync(TEMPLATE, 'utf8');
  const hits = findBatchFacts(text);
  assert.deepEqual(
    hits, [],
    '模板里出现了具体批次的事实 —— 这些必须搬进 release/notes/release-notes-same-app-<内容版本>.md：\n'
      + hits.map((h) => `  · ${h.kind}：${h.sample}`).join('\n'),
  );
});

test('证伪：判据能抓住上一版真实模板（含「23 首 / 3 组」「新增一首：杜甫《望岳》」）', () => {
  const oldTemplate = [
    '## 这一版有什么（相对内容 `@PREVIOUS_CONTENT_VERSION@`）',
    '',
    '- **新增一首**：杜甫《**望岳**》（岱宗夫如何）—— 底本《全唐诗》卷二百一十六',
    '- **唐代多了一首**：朝代页「唐」组 2 → **3 首**',
    '- 合计 **23 首 / 3 组**：汉 19（古诗十九首）＋ 唐 3（杜甫）＋ 近现代 1',
  ].join('\n');
  const hits = findBatchFacts(oldTemplate);
  const kinds = new Set(hits.map((h) => h.kind));
  assert.ok(kinds.has('首数/组数绝对值'), '「23 首 / 3 组」应当被抓住');
  assert.ok(kinds.has('首数增量'), '「2 → 3 首」应当被抓住');
  assert.ok(kinds.has('批次叙述'), '「新增一首」应当被抓住');
  assert.ok(hits.some((h) => h.sample === '望岳'), '具体诗题「望岳」应当被抓住');
});

test('模板保留了 CI 注入用的全部占位符', () => {
  const text = fs.readFileSync(TEMPLATE, 'utf8');
  for (const p of PLACEHOLDERS) {
    assert.ok(text.includes(p), `模板缺占位符 ${p}（CI 的 sed 就注入不进去，正文会留原始标记）`);
  }
});

test('工作流：逐版说明文件优先，退到模板时打 warning（不许静默）', () => {
  const yml = fs.readFileSync(WORKFLOW, 'utf8');
  assert.ok(
    yml.includes('release/notes/release-notes-same-app-${CONTENT_V}.md'),
    '工作流应当按本次内容版本找 release/notes/release-notes-same-app-${CONTENT_V}.md',
  );
  assert.ok(/if\s*\[\s*-f\s+"\$PER_RELEASE"\s*\]/.test(yml), '工作流应当先判断逐版说明文件是否存在（-f "$PER_RELEASE"）');
  assert.ok(yml.includes('::warning::没有 ${PER_RELEASE}'), '退到通用模板时必须打 ::warning::（不许静默用一份不含本批内容的说明）');
});

test('逐版说明文件（若有）必须讲它自己那一版，且不是空文件', () => {
  const files = fs.readdirSync(NOTES_DIR)
    .filter((f) => /^release-notes-same-app-\d{4}\.\d{2}\.\d{2}\.\d+\.md$/.test(f));
  for (const f of files) {
    const version = /^release-notes-same-app-(\d{4}\.\d{2}\.\d{2}\.\d+)\.md$/.exec(f)[1];
    const text = fs.readFileSync(path.join(NOTES_DIR, f), 'utf8');
    assert.ok(text.trim().length > 200, `${f} 太短，读不出这一版到底有什么`);
    assert.ok(text.includes(version), `${f} 里没出现它自己的内容版本 ${version} —— 很可能是从别的版本复制过来忘了改`);
  }
});
