#!/usr/bin/env node
// 生成「已跟踪诗源清单」`content/tracked-poems.json`。
//
// 为什么需要它：`git archive` 展开目录 / 发布构建副本**没有 `.git`**，而测试要断言的是
// 「**已跟踪**内容」的实况（工作区里未 `git add` 的稿子不算）。清单随已提交内容一起进归档，
// 于是在这些目录里也能读到同一份「已跟踪」事实（读取口见 tools/lib/tracked-poems.mjs）。
//
// 它**不是**一份要人维护的名单：
//   - 只认 `git ls-files -z -- content/poems`（真实仓根；向上解析到父仓一律拒绝）；
//   - 过期由 `tests/tracked-poems-manifest.test.mjs` 在真实仓里逐条比对，红了就重跑本脚本；
//   - 输出不含时间戳，同样的已跟踪集合生成同样字节（diff 稳定）。
//
// 用法：在**仓库根**运行
//   node tools/gen-tracked-poems-manifest.mjs
// 退出码：0 = 已写入；1 = 这里不是仓库根 / git 不可用（不会猜一份清单出来）。
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  TRACKED_POEMS_MANIFEST_REL,
  normalizePoemPaths,
  readGitTrackedPoems,
} from './lib/tracked-poems.mjs';

export const MANIFEST_HEADER_NOTE =
  '生成物，请勿手改。由 tools/gen-tracked-poems-manifest.mjs 从 `git ls-files -z -- content/poems` 生成；' +
  '无 .git 的 git archive/发布副本读它当「已跟踪诗源清单」，真实仓由 tests/tracked-poems-manifest.test.mjs 逐条核对新鲜度。';

/**
 * 组装清单文档（纯函数，便于测试）。
 * @param {string[]} paths 相对仓库根、正斜杠的 .md 路径（保持 git 输出次序）
 */
export function buildManifestDoc(paths) {
  return {
    manifestVersion: 1,
    note: MANIFEST_HEADER_NOTE,
    source: 'git ls-files -z -- content/poems',
    paths: normalizePoemPaths(paths),
  };
}

function main() {
  const root = path.resolve(import.meta.dirname, '..');
  const git = readGitTrackedPoems(root);
  if (!git.ok) {
    console.error(`✗ 不能生成已跟踪清单（这不是一个可读的仓库根）：\n  ${git.reason}`);
    return 1;
  }
  const file = path.join(root, TRACKED_POEMS_MANIFEST_REL);
  const doc = buildManifestDoc(git.paths);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
  console.log(
    `✓ 已写入 ${TRACKED_POEMS_MANIFEST_REL}：${doc.paths.length} 条已跟踪诗源（来自 git ls-files -z -- content/poems）`,
  );
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('gen-tracked-poems-manifest.mjs')) {
  process.exitCode = main();
}
