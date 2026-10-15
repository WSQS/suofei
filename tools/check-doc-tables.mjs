#!/usr/bin/env node
/**
 * 台账表格体检：Markdown 表格里每行的单元格数必须与该表表头一致。
 *
 * 为什么需要它：负责人在整合过程中连续 4 次把 `docs/interface-decisions.md` 的行改坏
 * （多一列或少一列），Markdown 渲染出来看起来"还能读"，但列会错位、信息落进错误的列里。
 * 人眼扫不出来，机器一眼就能看出来。
 *
 * 2026-10-15 又补了两条判据（起因是一次真实事故：一条标注被插进表格中间，把表截成两段，
 * 旧版因为「长度<2 不成表」把第二段直接跳过 ⇒ **绿**）：
 *   ① 孤立的表行（看起来像表格行，却不与任何表格相连）；
 *   ② 表被截断（块内第二行不是分隔行 ⇒ 缺表头 / 被别的内容截断）。
 * 判据刻意**只盯「看起来像表、其实不是表」**这一类形状；别的编辑缺陷它看不见，
 * 所以它绿≠文档没问题（见 `items/graph.md` 的「已知缺口」）。
 *
 * 用法：
 *   node tools/check-doc-tables.mjs                 # 检查 docs/ 下所有 .md
 *   node tools/check-doc-tables.mjs docs/a.md …     # 只检查指定文件
 * 退出码：0 = 全部一致；1 = 有表格列数不一致。
 *
 * 注意：Markdown 里 `\|` 是转义竖线、不算单元格分隔，所以先把它替换掉再数。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.md')) out.push(p);
  }
  return out;
}

const cells = (line) => line.replace(/\\\|/g, '\u0000').split('|').length - 2;

/** 分隔行：只由 |、-、: 与空格组成（Markdown 表格的必备第二行）。 */
const isDelimiter = (line) => /^\|[\s|:-]+\|\s*$/.test(line) && /-/.test(line);

function checkFile(file) {
  const lines = readFileSync(file, 'utf8').split('\n');
  const problems = [];
  let i = 0;
  while (i < lines.length) {
    if (!lines[i].startsWith('|')) { i += 1; continue; }
    const start = i;
    const block = [];
    while (i < lines.length && lines[i].startsWith('|')) { block.push(lines[i]); i += 1; }

    // ⚠ 两条「窄判据」——都是 2026-10-15 一次真实事故补的：
    //   当时一条「就地标注」被插进表格中间，把表截成两段；旧版检查器把第二段
    //   当成长度 1 的块直接跳过（长度<2 不成表）⇒ **绿**，而表实际已经断了。
    //   判据刻意只盯「看起来像表、但其实不是表」的行，不扩张到别的编辑缺陷。
    if (block.length < 2) {
      problems.push({
        line: start + 1,
        kind: '表行孤立',
        text: block[0].slice(0, 100),
        why: '这行看起来是表格行，但它不与任何表格相连（表至少要有表头 + 分隔行两行）⇒ 渲染出来是一段带竖线的普通文字',
      });
      continue;
    }
    if (!isDelimiter(block[1])) {
      problems.push({
        line: start + 2,
        kind: '表被截断',
        text: block[1].slice(0, 100),
        why: '这块看起来是表格，但第二行不是分隔行（|---|---|）⇒ 表被别的内容截断了，或者本来就缺表头',
      });
    }

    const head = cells(block[0]);
    block.forEach((line, idx) => {
      const n = cells(line);
      if (n !== head) problems.push({ line: start + idx + 1, kind: '列数不一致', got: n, want: head, text: line.slice(0, 100) });
    });
  }
  return problems;
}

const args = process.argv.slice(2);
const files = args.length ? args : walk('docs');

let bad = 0;
for (const f of files) {
  for (const p of checkFile(f)) {
    bad += 1;
    if (p.kind === '列数不一致') {
      console.log(`${f}:${p.line}: 列数 ${p.got} ≠ 表头 ${p.want}\n    ${p.text}`);
    } else {
      console.log(`${f}:${p.line}: ${p.kind} —— ${p.why}\n    ${p.text}`);
    }
  }
}
if (bad) {
  console.log(`\n台账表格体检失败：${bad} 处（${files.length} 个文件）。`);
  process.exit(1);
}
console.log(`台账表格体检通过：${files.length} 个文件，表格结构完好（列数一致、无孤立表行、无被截断的表）。`);
