#!/usr/bin/env node
/**
 * 台账表格体检：Markdown 表格里每行的单元格数必须与该表表头一致。
 *
 * 为什么需要它：负责人在整合过程中连续 4 次把 `docs/interface-decisions.md` 的行改坏
 * （多一列或少一列），Markdown 渲染出来看起来"还能读"，但列会错位、信息落进错误的列里。
 * 人眼扫不出来，机器一眼就能看出来。
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

function checkFile(file) {
  const lines = readFileSync(file, 'utf8').split('\n');
  const problems = [];
  let i = 0;
  while (i < lines.length) {
    if (!lines[i].startsWith('|')) { i += 1; continue; }
    const start = i;
    const block = [];
    while (i < lines.length && lines[i].startsWith('|')) { block.push(lines[i]); i += 1; }
    // 少于两行不成表（Markdown 需要 表头 + 分隔行）
    if (block.length < 2) continue;
    const head = cells(block[0]);
    block.forEach((line, idx) => {
      const n = cells(line);
      if (n !== head) problems.push({ line: start + idx + 1, got: n, want: head, text: line.slice(0, 100) });
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
    console.log(`${f}:${p.line}: 列数 ${p.got} ≠ 表头 ${p.want}\n    ${p.text}`);
  }
}
if (bad) {
  console.log(`\n台账表格体检失败：${bad} 处列数不一致（${files.length} 个文件）。`);
  process.exit(1);
}
console.log(`台账表格体检通过：${files.length} 个文件，所有表格列数一致。`);
