#!/usr/bin/env node
/**
 * 一致性门：**仓库里的「内置内容」必须与当前 `content/poems/` 编译出来的产物一致。**
 *
 * 为什么需要它（真实教训，2026-10-14）：
 *   内容线 G 补核后异文从 13 条涨到 21 条，但仓库里 `android/app/src/main/assets/content/content.json`
 *   与 `web/content.json` **没人重新生成**，还停在旧版。结果是：
 *   - Android 的单测跑的是**旧产物**，全绿 ⇒ 看着一切正常；
 *   - 而发布线把**新产物**注入副本后跑同一套单测 ⇒ 那条断言（当时写成「第 9 首恰好 1 条异文」）
 *     变红。**红的是旧断言 + 旧内置产物**，不是流水线。
 *   也就是说：这道门当时**不存在**，所以「仓库里的内置内容落后于内容源」这件事没有任何地方会报警。
 *   它现在在这里：编译一次当前内容，与内置产物逐字段比对（忽略 generatedAt/contentVersion 这类
 *   每次构建都会变的字段本身不参与，但**诗的内容、次序、异文、分组全部参与**）。
 *
 * 用法：
 *   node tools/check-bundled-content.mjs
 * 退出码：0 = 一致；1 = 有差异（会打印差异与「怎么修」）。
 *
 * 修法（脚本会在失败时提示）：
 *   node tools/build-content.mjs --out dist/content.json --content-version <新版本> --previous-version <旧版本> --order source --minify
 *   cp dist/content.json android/app/src/main/assets/content/content.json
 *   node web/scripts/prepare-dev-content.mjs --from dist/content.json      # web/content.json 是本地产物（gitignore）
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const targets = [
  ['Android 内置内容', 'android/app/src/main/assets/content/content.json'],
  ['Web 本地内容（gitignore，存在才查）', 'web/content.json'],
];

const tmp = mkdtempSync(join(tmpdir(), 'suofei-content-'));
const fresh = join(tmp, 'content.json');

const build = spawnSync(
  process.execPath,
  ['tools/build-content.mjs', '--quiet', '--out', fresh, '--order', 'source'],
  { encoding: 'utf8' },
);
if (build.status !== 0) {
  console.error('无法编译当前内容，先修内容或编译器：');
  console.error((build.stdout || '') + (build.stderr || ''));
  process.exit(1);
}

const current = JSON.parse(readFileSync(fresh, 'utf8'));
// 只比对「内容本身」：分组声明 + 每首诗（含次序、异文、正文分段）。版本/时间戳每次构建都会变，不参与比对。
const shape = (doc) => JSON.stringify({ dynasties: doc.dynasties, poems: doc.poems });

const problems = [];
for (const [label, path] of targets) {
  if (!existsSync(path)) {
    if (path.startsWith('web/')) continue; // 本地开发产物，缺失不算错
    problems.push(`${label}：文件不存在（${path}）`);
    continue;
  }
  const got = JSON.parse(readFileSync(path, 'utf8'));
  if (shape(got) !== shape(current)) {
    const v = (d) => d.poems.reduce((n, p) => n + p.variants.length, 0);
    problems.push(
      `${label}（${path}）与当前内容不一致：\n` +
        `    内置：contentVersion=${got.contentVersion} 诗=${got.poems.length} 异文=${v(got)}\n` +
        `    当前：contentVersion=${current.contentVersion} 诗=${current.poems.length} 异文=${v(current)}`,
    );
  }
}

rmSync(tmp, { recursive: true, force: true });

if (problems.length) {
  console.error('内置内容与内容源不一致（仓库里的内置产物落后了，本地/单测会跑旧内容）：');
  for (const p of problems) console.error('  ✗ ' + p);
  console.error('\n修法：重编产物 → 覆盖内置 → 重生成 Web 本地内容：');
  console.error('  node tools/build-content.mjs --out dist/content.json --content-version <新版本> --previous-version <旧版本> --order source --minify');
  console.error('  cp dist/content.json android/app/src/main/assets/content/content.json');
  console.error('  node web/scripts/prepare-dev-content.mjs --from dist/content.json');
  process.exit(1);
}

console.log(
  `内置内容一致性通过：${targets.length} 处目标与当前 content/poems/ 编译结果一致` +
    `（诗=${current.poems.length}，异文=${current.poems.reduce((n, p) => n + p.variants.length, 0)}）。`,
);
