#!/usr/bin/env node
// 把一份内容 JSON 放到 web/content.json（+ content.json.sha256 边车），供本地阅读/演练/测试。
//
// 优先级：C 线的真实产物 > 占位夹具。
//   node web/scripts/prepare-dev-content.mjs                    # 有 ../../dist/content.json 就用它，否则用占位夹具
//   node web/scripts/prepare-dev-content.mjs --from D:/x.json   # 指定文件
//   node web/scripts/prepare-dev-content.mjs --variant update   # 测试用变体（见下表）
//
// 变体（都在 fixtures/variants/ 下，由 tests/make-fixtures.mjs 生成）：
//   placeholder 占位夹具（默认）
//   update      正常新版 v2026.10.14.2：删掉 1 首诗、删掉 1 个时代分组、改 1 行、加 1 首诗
//   older       更旧版本 v2026.10.14.0（内容与 update 相同，用来验证「不比本地新就不切换」）
//   corrupt     v2026.10.14.3，内容合法但 sha256 边车故意不匹配（验证校验闸）
//   broken      v2026.10.14.3，不是合法 JSON（验证解析失败闸）
//   future      formatVersion 2 / v2026.10.15.1（验证格式版本不兼容 → 保留旧版）

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const repoRoot = resolve(webRoot, '..');
const target = resolve(webRoot, 'content.json');
const checksumTarget = `${target}.sha256`;

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? undefined : argv[i + 1];
};

const VARIANTS = {
  placeholder: { file: 'fixtures/content.placeholder.json', checksum: 'correct' },
  update: { file: 'fixtures/variants/content.v-update.json', checksum: 'correct' },
  older: { file: 'fixtures/variants/content.v-older.json', checksum: 'correct' },
  corrupt: { file: 'fixtures/variants/content.v-corrupt.json', checksum: 'wrong' },
  broken: { file: 'fixtures/variants/content.v-broken.json', checksum: 'correct' },
  future: { file: 'fixtures/variants/content.v-future.json', checksum: 'correct' },
};

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

async function main() {
  const variantName = flag('variant');
  const from = flag('from');
  const realContent = resolve(repoRoot, 'dist', 'content.json');
  let source;
  let checksumMode = 'correct';
  let origin;

  if (variantName) {
    const v = VARIANTS[variantName];
    if (!v) throw new Error(`未知变体 ${variantName}；可选：${Object.keys(VARIANTS).join(', ')}`);
    source = resolve(webRoot, v.file);
    checksumMode = v.checksum;
    origin = `变体 ${variantName}`;
  } else if (from) {
    source = resolve(from);
    origin = `指定文件 ${source}`;
  } else if (existsSync(realContent)) {
    source = realContent;
    origin = 'C 线真实产物 dist/content.json';
  } else {
    source = resolve(webRoot, VARIANTS.placeholder.file);
    origin = '占位夹具（dist/content.json 尚不存在）';
  }

  const text = await readFile(source, 'utf8');
  await writeFile(target, text, 'utf8');
  if (checksumMode === 'correct') {
    await writeFile(checksumTarget, `${sha256(text)}  content.json\n`, 'utf8');
  } else if (checksumMode === 'wrong') {
    // 故意写一个不匹配的哈希：只有真做校验和比对才会失败。
    await writeFile(checksumTarget, `${'0'.repeat(64)}  content.json\n`, 'utf8');
  }

  let note = '';
  try {
    const doc = JSON.parse(text);
    note = `formatVersion=${doc.formatVersion} contentVersion=${doc.contentVersion} poems=${doc.poems?.length} 占位夹具=${doc.placeholder === true}`;
  } catch {
    note = '（内容不是合法 JSON —— 这是变体故意造成的）';
  }
  console.log(`来源：${origin}`);
  console.log(`写入：web/content.json（${text.length} 字节）+ web/content.json.sha256（校验和模式：${checksumMode}）`);
  console.log(`内容：${note}`);
}

main().catch((err) => { console.error(err.message); process.exitCode = 1; });
