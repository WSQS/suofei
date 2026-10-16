#!/usr/bin/env node
// 把一份内容 JSON 放到 web/content.json，供本地阅读/演练/测试。
//
// 基座优先级（会打印实际用了哪一个）：
//   1. --from <file>
//   2. dist/content.json（C 线编译器的真实产物）
//   3. fixtures/content.placeholder.json（占位夹具，页面上会显示黄条）
//
// 用法：
//   node web/scripts/prepare-dev-content.mjs                       # 真实产物优先，没有就用占位夹具
//   node web/scripts/prepare-dev-content.mjs --from D:/x.json
//   node web/scripts/prepare-dev-content.mjs --variant broken      # 从基座派生测试变体
//
// 变体（前两个是仓库里的夹具文件，其余从**基座**现场派生；见 scripts/lib/variants.mjs）：
//   placeholder   占位夹具（与基座无关，固定用 fixtures/content.placeholder.json）
//   no-sortkeys   老产物形状的夹具：既没有 orderInSource 也没有拼音名次键（文件名是历史叫法）
//   minimal       最小产物形状（只有 orderInSource）→ 仍照数组次序
//   noOrderIndex  老产物形状（无 orderInSource，数组次序反转）→ 本机拼音兜底
//   fixtureContent 下一次部署用的内容（删末首 + 加一首带笔记/空行分段的测试诗）
//   broken        截断的非法 JSON → 失败状态：不是合法 JSON
//   schemaBroken  合法 JSON 但结构不合法 → 失败状态：结构校验失败
//   futureFormat  formatVersion 更高 → 失败状态：格式版本不兼容
//
// 注意：Web 端**不产出** content.json.sha256 边车（用户 2026-10-14 拍板）——内容与壳已由
// Service Worker 成对缓存、随站点一起更新，完整性由「同一次部署 + HTTPS + SW 预缓存」承担；
// 没人消费的边车只会让人以为还有一道校验环节。

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildVariants } from './lib/variants.mjs';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const repoRoot = resolve(webRoot, '..');
const target = resolve(webRoot, 'content.json');

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? undefined : argv[i + 1];
};

const FIXTURE_VARIANTS = {
  placeholder: 'fixtures/content.placeholder.json',
  'no-sortkeys': 'fixtures/content.no-sortkeys.json',
};

function describe(text) {
  try {
    const doc = JSON.parse(text);
    const kind = doc.placeholder === true ? '【占位夹具】'
      : (doc.fixture === true ? '【测试夹具】' : '真实产物');
    return `formatVersion=${doc.formatVersion} contentVersion=${doc.contentVersion} poems=${doc.poems?.length} `
      + `dynasties=${(doc.dynasties ?? []).map((d) => (typeof d === 'string' ? d : d?.key)).join(',')} ${kind}`;
  } catch {
    return `（内容不是合法 JSON —— 变体故意造成的，${Buffer.byteLength(text, 'utf8')} 字节）`;
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
  let origin = baseOrigin;
  // ⚠ 这里**没有**「把 v1 升成 v2」的过渡适配：过渡件 `scripts/lib/upgrade-content.mjs` 已按
  // `docs/design/implementation-plan.md` §4b 删除。客户端只认 `formatVersion: 2`，v1 会被**如实拒绝**
  // （`SUPPORTED_FORMAT_VERSION`）—— 所以本地演练也必须喂真实 v2 产物，不在这里偷偷升版。
  if (variantName && !FIXTURE_VARIANTS[variantName]) {
    let variants;
    try {
      variants = buildVariants(JSON.parse(baseText));
    } catch (err) {
      throw new Error(`基座不是合法 JSON，无法派生变体（${err.message}）`);
    }
    const v = variants[variantName];
    if (!v) {
      throw new Error(`未知变体「${variantName}」；可用：${[...Object.keys(FIXTURE_VARIANTS), ...Object.keys(variants)].join(' / ')}`);
    }
    text = v.text;
    origin = `${baseOrigin} → 派生变体 ${v.name}（${v.note}）`;
  }

  await writeFile(target, text, 'utf8');

  console.log(`来源：${origin}`);
  console.log(`写入：web/content.json（${Buffer.byteLength(text, 'utf8')} 字节；不产出 sha256 边车）`);
  console.log(`内容：${describe(text)}`);
}

main().catch((err) => { console.error(err.message); process.exitCode = 1; });
