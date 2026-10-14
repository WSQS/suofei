#!/usr/bin/env node
// 从占位夹具派生出「内容更新」测试变体（确定性生成，产物提交进版本库）。
//   node web/tests/make-fixtures.mjs
//
// 生成：
//   fixtures/variants/content.v-update.json   v2026.10.14.2：删一组(先秦)、删一首(枫桥夜泊)、改一行(涉江采芙蓉)、加一首(饮酒)
//   fixtures/variants/content.v-older.json    v2026.10.14.0：内容同 update，用来验证「不比本地新 → 不切换」
//   fixtures/variants/content.v-corrupt.json  v2026.10.14.3：内容合法，但边车哈希故意不匹配
//   fixtures/variants/content.v-broken.json   v2026.10.14.3：截断的非法 JSON
//   fixtures/variants/content.v-future.json   formatVersion 2 / v2026.10.15.1：不兼容，必须保留旧版

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const outDir = resolve(webRoot, 'fixtures', 'variants');

const base = JSON.parse(await readFile(resolve(webRoot, 'fixtures', 'content.placeholder.json'), 'utf8'));

/** 去掉不再有诗的朝代分组（组只列实际有内容的时代，见契约 §2）。 */
function pruneDynasties(doc) {
  const keys = new Set(doc.poems.map((p) => p.dynastyKey));
  doc.dynasties = doc.dynasties.filter((d) => keys.has(d.key));
  return doc;
}

const update = structuredClone(base);
update.contentVersion = '2026.10.14.2';
update.generatedAt = '2026-10-14T18:00:00Z';
update.placeholderNotice = '占位夹具，非校对文本（update 变体，仅用于更新流程验证）';
// 删一首诗
update.poems = update.poems.filter((p) => p.id !== 'tang-zhangji-fengqiaoyebo' && p.id !== 'shijing-guanju');
// 改一行
const shejiang = update.poems.find((p) => p.id === 'gushi-shijiu-shou-06');
shejiang.stanzas[0][0] = '涉江采芙蓉，兰泽多芳草。（占位夹具·新版改了这一行）';
// 加一首诗
update.poems.push({
  id: 'weijin-taoyuanming-yinjiu',
  title: '饮酒·其五',
  author: '陶渊明',
  dynastyKey: 'weijin',
  dynastyLabel: '魏晋',
  dynastyOrder: 200,
  era: '东晋',
  genre: '五言古诗',
  source: '占位夹具（非核对底本）',
  variants: [],
  stanzas: [['结庐在人境，而无车马喧。', '问君何能尔？心远地自偏。']],
  notes: null,
  authorSortKey: 'taoyuanming',
  titleSortKey: 'yinjiuqiwu',
});
pruneDynasties(update);

const older = structuredClone(update);
older.contentVersion = '2026.10.14.0';

const corrupt = structuredClone(update);
corrupt.contentVersion = '2026.10.14.3';

const future = structuredClone(update);
future.formatVersion = 2;
future.contentVersion = '2026.10.15.1';

const files = {
  'content.v-update.json': `${JSON.stringify(update, null, 2)}\n`,
  'content.v-older.json': `${JSON.stringify(older, null, 2)}\n`,
  'content.v-corrupt.json': `${JSON.stringify(corrupt, null, 2)}\n`,
  'content.v-future.json': `${JSON.stringify(future, null, 2)}\n`,
};
// broken：把合法 JSON 截断，模拟下载到一半/损坏的响应
const full = `${JSON.stringify(update, null, 2)}\n`;
files['content.v-broken.json'] = full.slice(0, Math.floor(full.length * 0.6));

await mkdir(outDir, { recursive: true });
for (const [name, text] of Object.entries(files)) {
  await writeFile(resolve(outDir, name), text, 'utf8');
  console.log(`写出 fixtures/variants/${name}  ${text.length} 字节`);
}

for (const [name, doc] of [['update', update], ['older', older], ['corrupt', corrupt], ['future', future]]) {
  console.log(`${name}: formatVersion=${doc.formatVersion} contentVersion=${doc.contentVersion} poems=${doc.poems.length} dynasties=${doc.dynasties.map((d) => d.key).join(',')}`);
}
