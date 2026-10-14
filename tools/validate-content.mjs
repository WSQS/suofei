#!/usr/bin/env node
// 契约线 C：用 JSON Schema 校验内容产物。
//
//   node tools/validate-content.mjs [--schema <file>] [<content.json>]
//
// 默认校验 schema/content.schema.json 对 dist/content.json。
// 依赖：项目本地 devDependency ajv@8（npm install 装到本工程 node_modules，不装全局）。
// 编译器本身（tools/build-content.mjs）不依赖 ajv，保持零依赖；schema 校验是独立的开发期检查。

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import Ajv2020 from 'ajv/dist/2020.js';
import { DEFAULT_SCHEMA_PATH } from './lib/interface.mjs';

function parseArgs(argv) {
  let schemaPath = DEFAULT_SCHEMA_PATH;
  let target = path.join('dist', 'content.json');
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--schema') {
      const v = argv[++i];
      if (v === undefined) throw new Error('--schema 需要一个值');
      schemaPath = v;
    } else if (argv[i] === '-h' || argv[i] === '--help') {
      process.stdout.write('用法：node tools/validate-content.mjs [--schema <file>] [<content.json>]\n');
      process.exit(0);
    } else {
      target = argv[i];
    }
  }
  return { schemaPath, target };
}

const { schemaPath, target } = parseArgs(process.argv.slice(2));

const ajv = new Ajv2020({ allErrors: true, strict: true });
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const validate = ajv.compile(schema);

let data;
try {
  data = JSON.parse(fs.readFileSync(target, 'utf8'));
} catch (e) {
  process.stderr.write(`无法读取或解析 ${target}：${e.message}\n`);
  process.exit(1);
}

if (validate(data)) {
  process.stdout.write(
    `JSON Schema 校验通过：${target}（schema=${schemaPath}，ajv ${require_ajv_version()}）\n` +
      `  poems=${data.poems.length} dynasties=${data.dynasties.length} contentVersion=${data.contentVersion}\n`,
  );
  process.exit(0);
}

process.stderr.write(`JSON Schema 校验失败：${target} 不满足 ${schemaPath}\n`);
for (const err of validate.errors ?? []) {
  process.stderr.write(`  - ${err.instancePath || '/'} ${err.message} ${JSON.stringify(err.params)}\n`);
}
process.exit(1);

function require_ajv_version() {
  try {
    return JSON.parse(fs.readFileSync(path.join('node_modules', 'ajv', 'package.json'), 'utf8')).version;
  } catch {
    return 'unknown';
  }
}
