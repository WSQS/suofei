#!/usr/bin/env node
// S3 迁移的**独立**核验脚本（与迁移脚本分开写、分开跑；迁移脚本自校验不算证据）。
//
// 它做三件事，逐首逐条给可核数字：
//   ① 新旧对照：`title/author/dynasty/genre/orderInSource/source` 六字段逐字一致；派生 id ＝ 清单 newId；
//   ② 正文保真：旧文件正文区（front matter 之后）与新文件正文区（**第一个 `## ` 之前**）
//      **逐行**比较，行数与内容全等（含空行位置，空行即分段）；
//   ③ 异文保真：v1 front matter 的每条 `variants[].text` / `.note` 在**编译产物**的 `detail`
//      文本里**逐字**可查（并核对整条列表项 `- **text** —— note` 也在）。
//
// 用法（在仓库根跑）：
//   node content/migration/verify-19-to-v2.mjs --old-ref <git-ref>
//   `--old-ref` 指向**迁移前**的提交（默认 `HEAD`；迁移提交落地后要显式给上一个提交）。
// 退出码：0 = 全部通过；1 = 有任一项不符（会逐条打印）。

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseFrontMatter, splitFrontMatter } from '../../tools/lib/frontmatter.mjs';
import { scanPoems } from '../../tools/lib/scan.mjs';
import { buildContentFromRecords } from '../../tools/lib/content-build.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const MANIFEST_REL = 'items/content-format/prototypes/rules-v3/manifest/19-changes.json';
const POEMS_REL = 'content/poems';

const args = process.argv.slice(2);
const i = args.indexOf('--old-ref');
const oldRef = i !== -1 ? args[i + 1] : 'HEAD';
if (!oldRef) {
  process.stderr.write('用法：node content/migration/verify-19-to-v2.mjs --old-ref <git-ref>\n');
  process.exit(2);
}

const problems = [];
const note = (msg) => problems.push(msg);

const manifest = JSON.parse(fs.readFileSync(path.join(REPO, MANIFEST_REL), 'utf8'));

// 迁移后的产物（内存里编译，等价于 `node tools/build-content.mjs`）。
const { records, errors: scanErrors } = scanPoems(path.join(REPO, POEMS_REL));
if (scanErrors.length) for (const e of scanErrors) note(`扫描错误：${e.format()}`);
const { content, errors: buildErrors } = buildContentFromRecords({ records });
if (buildErrors.length) for (const e of buildErrors) note(`编译错误：${e.format()}`);
if (!content) {
  process.stderr.write('编译没有产物，核验无法继续：\n' + problems.join('\n') + '\n');
  process.exit(1);
}

const productById = new Map(content.poems.map((p) => [p.id, p]));

const COMPARE_KEYS = ['title', 'author', 'dynasty', 'genre', 'orderInSource', 'source'];
let totalVariants = 0;

const rows = [];
for (const row of manifest.rows) {
  const oldText = execFileSync('git', ['show', `${oldRef}:${row.oldRelPath}`], { cwd: REPO, encoding: 'utf8' });
  const oldFm = parseFrontMatter(oldText, `${oldRef}:${row.oldRelPath}`);
  const oldBodyLines = splitFrontMatter(oldText, `${oldRef}:${row.oldRelPath}`).bodyLines;

  const newAbs = path.join(REPO, POEMS_REL, row.newRelPath);
  const newText = fs.readFileSync(newAbs, 'utf8');
  const newFm = parseFrontMatter(newText, `${row.newRelPath}`);
  const newBodyLinesAll = splitFrontMatter(newText, `${row.newRelPath}`).bodyLines;
  const sectionAt = newBodyLinesAll.findIndex((l) => /^##\s+\S/.test(l));
  const newOriginLines = sectionAt === -1 ? newBodyLinesAll : newBodyLinesAll.slice(0, sectionAt);

  // ① 字段对照
  for (const k of COMPARE_KEYS) {
    const a = oldFm.data[k] ?? null;
    const b = newFm.data[k] ?? null;
    if (a !== b) note(`${row.newRelPath}: 字段 \`${k}\` 迁移前后不一致：旧=${JSON.stringify(a)} 新=${JSON.stringify(b)}`);
  }

  // ② 正文逐行
  if (oldBodyLines.length !== newOriginLines.length) {
    note(`${row.newRelPath}: 正文行数不同：旧 ${oldBodyLines.length} / 新 ${newOriginLines.length}`);
  }
  const max = Math.max(oldBodyLines.length, newOriginLines.length);
  let bodyDiffLines = 0;
  for (let n = 0; n < max; n++) {
    if (oldBodyLines[n] !== newOriginLines[n]) {
      bodyDiffLines++;
      note(`${row.newRelPath}: 正文第 ${n + 1} 行不同：旧=${JSON.stringify(oldBodyLines[n])} 新=${JSON.stringify(newOriginLines[n])}`);
    }
  }

  // id：由相对路径派生并等于清单 newId
  const derived = row.newRelPath.replace(/\.md$/i, '').replace(/\//g, '-');
  if (derived !== row.newId) note(`${row.newRelPath}: 派生 id「${derived}」≠ 清单 newId「${row.newId}」`);
  const poem = productById.get(row.newId);
  if (!poem) {
    note(`${row.newRelPath}: 产物里找不到 id「${row.newId}」`);
  }

  // ③ 异文逐条进产物 detail
  const variants = Array.isArray(oldFm.data.variants) ? oldFm.data.variants : [];
  totalVariants += variants.length;
  const detail = poem?.detail ?? null;
  variants.forEach((v, k) => {
    if (detail === null) {
      note(`${row.newRelPath}: 有第 ${k + 1} 条异文但产物 detail 是 null`);
      return;
    }
    if (!detail.includes(v.text)) note(`${row.newRelPath}: 异文 #${k + 1} 的 text「${v.text}」不在 detail 里`);
    if (!detail.includes(v.note)) note(`${row.newRelPath}: 异文 #${k + 1} 的 note 不在 detail 里（${v.note.slice(0, 24)}…）`);
    const item = `- **${v.text}** —— ${v.note}`;
    if (!detail.includes(item)) note(`${row.newRelPath}: 异文 #${k + 1} 的整条列表项不在 detail 里`);
  });

  // 产物 stanzas 的非空行 = 旧正文的非空行
  const oldPoemLines = oldBodyLines.filter((l) => l.trim() !== '');
  const newStanzaLines = poem ? poem.stanzas.flat() : [];
  if (JSON.stringify(oldPoemLines) !== JSON.stringify(newStanzaLines)) {
    note(`${row.newRelPath}: 产物 stanzas 与旧正文非空行不一致`);
  }

  rows.push({
    newId: row.newId,
    title: row.title,
    bodyLines: oldPoemLines.length,
    variants: variants.length,
    bodyDiffLines,
    detailOk: variants.every((v) => detail !== null && detail.includes(`- **${v.text}** —— ${v.note}`)),
  });
}

process.stdout.write(`核验基准：git ${oldRef}\n`);
process.stdout.write('  #  id                            诗题        正文行  异文  正文差异行\n');
rows.forEach((r, n) => {
  process.stdout.write(
    `  ${String(n + 1).padStart(2)}  ${r.newId.padEnd(30)} ${r.title.padEnd(10)} ${String(r.bodyLines).padStart(4)}  ${String(r.variants).padStart(4)}  ${String(r.bodyDiffLines).padStart(6)}\n`,
  );
});
process.stdout.write(
  `\n合计：${rows.length} 首 / 正文非空行 ${rows.reduce((s, r) => s + r.bodyLines, 0)} 行 / 异文 ${totalVariants} 条 / 产物 poems=${content.poems.length} dynasties=${JSON.stringify(content.dynasties)}\n`,
);

if (problems.length) {
  process.stderr.write(`\n核验失败：${problems.length} 项\n`);
  for (const p of problems) process.stderr.write(`  ✗ ${p}\n`);
  process.exit(1);
}
process.stdout.write('核验通过：字段一致、正文逐行相同、24 条异文逐字进产物 detail。\n');
