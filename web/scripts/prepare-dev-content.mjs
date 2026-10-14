#!/usr/bin/env node
// 把一份内容 JSON 放到 web/content.json（+ content.json.sha256 边车），供本地阅读/演练/测试。
//
// 基座优先级（会打印实际用了哪一个）：
//   1. --from <file>
//   2. dist/content.json（C 线编译器的真实产物）
//   3. fixtures/content.placeholder.json（占位夹具，页面上会显示黄条）
//
// 用法：
//   node web/scripts/prepare-dev-content.mjs                       # 真实产物优先，没有就用占位夹具
//   node web/scripts/prepare-dev-content.mjs --from D:/x.json
//   node web/scripts/prepare-dev-content.mjs --variant update      # 从基座派生测试变体
//
// 变体（前两个是仓库里的夹具文件，其余从**基座**现场派生；见 scripts/lib/variants.mjs）：
//   placeholder  占位夹具（与基座无关，固定用 fixtures/content.placeholder.json）
//   no-sortkeys  老产物形状的老夹具：既没有 orderInSource 也没有拼音名次键（文件名是历史叫法）
//   update       删首尾各 1 首、改 1 行、加 1 首测试诗并新增 1 个时代分组
//   update2      在 update 基础上去掉那首测试诗 → 那个时代分组随之消失
//   lower        内容同 update，版本更旧 → 必须拒绝（不降级）
//   corrupt      内容合法、版本更高，但边车哈希故意不匹配
//   broken       截断的非法 JSON
//   future       formatVersion 更高 → 不解析、保留旧内容
//   minimal      最小产物形状（只有 orderInSource，没有拼音名次键）→ 仍照数组次序
//   noOrderIndex 老产物形状（无 orderInSource、无拼音键，数组次序被反转）→ 本机拼音兜底

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildVariants } from './lib/variants.mjs';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const repoRoot = resolve(webRoot, '..');
const target = resolve(webRoot, 'content.json');
const checksumTarget = `${target}.sha256`;

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? undefined : argv[i + 1];
};

const FIXTURE_VARIANTS = {
  placeholder: 'fixtures/content.placeholder.json',
  'no-sortkeys': 'fixtures/content.no-sortkeys.json',
};

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

function describe(text) {
  try {
    const doc = JSON.parse(text);
    const kind = doc.placeholder === true ? '【占位夹具】'
      : (doc.fixture === true ? '【测试夹具】' : '真实产物');
    return `formatVersion=${doc.formatVersion} contentVersion=${doc.contentVersion} poems=${doc.poems?.length} `
      + `dynasties=${(doc.dynasties ?? []).map((d) => d.key).join(',')} ${kind}`;
  } catch {
    return '（内容不是合法 JSON —— 变体故意造成的）';
  }
}

async function main() {
  const variantName = flag('variant');
  const from = flag('from');
  const realContent = resolve(repoRoot, 'dist', 'content.json');

  let baseText = null;
  let baseOrigin = '';
  if (variantName && FIXTURE_VARIANTS[variantName]) {
    baseOrigin = `夹具文件 fixtures/${FIXTURE_VARIANTS[variantName].split('/').pop()}`;
    baseText = await readFile(resolve(webRoot, FIXTURE_VARIANTS[variantName]), 'utf8');
  } else if (from) {
    baseOrigin = `指定文件 ${resolve(from)}`;
    baseText = await readFile(resolve(from), 'utf8');
  } else if (existsSync(realContent)) {
    baseOrigin = 'C 线真实产物 dist/content.json';
    baseText = await readFile(realContent, 'utf8');
  } else {
    baseOrigin = '占位夹具（dist/content.json 不存在，且未给 --from）';
    baseText = await readFile(resolve(webRoot, FIXTURE_VARIANTS.placeholder), 'utf8');
    console.warn('警告：正在用占位夹具，不是真实内容。');
  }

  let text = baseText;
  let checksumMode = 'correct';
  let origin = baseOrigin;
  if (variantName && !FIXTURE_VARIANTS[variantName]) {
    const variants = buildVariants(JSON.parse(baseText));
    const v = variants[variantName];
    if (!v) {
      throw new Error(`未知变体「${variantName}」；可用：${[...Object.keys(FIXTURE_VARIANTS), ...Object.keys(variants)].join(' / ')}`);
    }
    text = v.text;
    checksumMode = v.checksum === 'wrong' ? 'wrong' : 'correct';
    origin = `${baseOrigin} → 派生变体 ${v.name}（${v.note}）`;
  }

  await writeFile(target, text, 'utf8');
  if (checksumMode === 'correct') {
    await writeFile(checksumTarget, `${sha256(text)}  content.json\n`, 'utf8');
  } else {
    // 故意写一个不匹配的哈希：只有真做了校验和比对的客户端才会失败。
    await writeFile(checksumTarget, `${'0'.repeat(64)}  content.json\n`, 'utf8');
  }

  console.log(`来源：${origin}`);
  console.log(`写入：web/content.json（${text.length} 字节）+ web/content.json.sha256（校验和模式：${checksumMode}）`);
  console.log(`内容：${describe(text)}`);
}

main().catch((err) => { console.error(err.message); process.exitCode = 1; });
