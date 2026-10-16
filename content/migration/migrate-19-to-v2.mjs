#!/usr/bin/env node
// S3 一次性迁移脚本：v1 平铺 ASCII 源 → v2 中文相对路径布局（**内容不变，只搬家＋改格式**）。
//
// 输入：`content/poems/gushi-shijiu-shou-NN.md`（v1：`id`/`dynastyOrder`/`era`/`variants` 都在 front matter）
// 输出：`content/poems/古诗十九首/<诗题>.md`（v2：`id` 不写；`dynastyOrder`/`era`/`variants` 去掉；
//       24 条异文整段搬进 `## 详情` 的 `### 异文` 列表）
// 清单：`items/content-format/prototypes/rules-v3/manifest/19-changes.json`（已通过的迁移清单，只读）
//
// 保真承诺（逐条可核，见 README.md「自证」）：
//   ① 正文（front matter 之后、`## 详情` 之前）**逐行逐字原样搬**：脚本不 trim、不替换、不折行，
//      直接取 `splitFrontMatter` 的 `bodyLines` 原样拼接；写完立刻**自校验**（新旧正文逐字相等）。
//   ② 24 条 `variants` 的 `text`/`note` **逐字原样**写进列表项 `- **<text>** —— <note>`（不改写、
//      不概括、不删注）；写完立刻**自校验**（每条 note 都能在新 detail 里逐字查到）。
//   ③ `title`/`author`/`dynasty`/`genre`/`orderInSource`/`source` 六个字段**原行原值直传**
//      （保留源里的引号与空白，不重新序列化）。
// 不迁就（只列进报告，不偷偷塞别处）：v1 的 `era`（19 首全是「东汉末」）直接丢弃 ——
//   用户 2026-10-15 已定「不自动把原值塞进详情正文」（见 items/content-format/item.md）。
//
// 可复跑 / 幂等：
//   - 旧文件已不在、新文件已存在 ⇒ 跳过并计 alreadyDone，不读不写；
//   - 旧、新**同时存在** ⇒ 报错退出（不静默覆盖），让人来看；
//   - 两个都不存在 ⇒ 报错退出。
//   失败时**不写任何文件**（先全部在内存里算好、自校验通过，再落盘）。
//
// 用法（在仓库根跑）：
//   node content/migration/migrate-19-to-v2.mjs --dry-run     # 只打印计划与自校验，不落盘
//   node content/migration/migrate-19-to-v2.mjs               # 真迁移（写新文件、删旧文件）
//   node content/migration/migrate-19-to-v2.mjs --report <f>  # 同时把 JSON 报告写到 <f>

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseFrontMatterLines, splitFrontMatter } from '../../tools/lib/frontmatter.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');

const MANIFEST_REL = 'items/content-format/prototypes/rules-v3/manifest/19-changes.json';
const POEMS_REL = 'content/poems';

/** v2 front matter 的键序（与已通过的完整样例 `rules-v3/samples/real-01-full.md` 一致）。 */
const KEEP_KEYS = ['title', 'author', 'dynasty', 'genre', 'orderInSource', 'source'];
/** 直传时按原行比对；这六项必须逐字一致（迁移前后对照的口径）。 */
const COMPARE_KEYS = ['title', 'author', 'dynasty', 'genre', 'orderInSource', 'source'];

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
let reportPath = null;
{
  const i = args.indexOf('--report');
  if (i !== -1) reportPath = args[i + 1];
}

function fail(msg) {
  process.stderr.write(`迁移失败：${msg}\n`);
  process.exit(1);
}

function toPosix(p) {
  return p.split(path.sep).join('/');
}

/** 取 front matter 里某个顶层键的**原行**（这些键在源里都是单行标量）。 */
function originalLine(fmLines, key) {
  const re = new RegExp(`^${key}:(?:[ \\t]|$)`);
  const hits = fmLines.filter((l) => re.test(l));
  if (hits.length !== 1) fail(`front matter 里键 \`${key}\` 期望恰好 1 行，实际 ${hits.length} 行`);
  return hits[0];
}

/** 构造一首诗的 v2 文本（纯文本变换，不碰磁盘）。 */
function buildV2(oldText, displayPath) {
  const { fmLines, fmLineOffset, bodyLines } = splitFrontMatter(oldText, displayPath);
  const data = parseFrontMatterLines(fmLines, displayPath, fmLineOffset);

  const newFmLines = KEEP_KEYS.map((k) => originalLine(fmLines, k));

  // 正文逐行原样（splitFrontMatter 已按 \n 切；join 回去与原文完全一致，含尾部换行）。
  const body = bodyLines.join('\n');

  // 异文 → `## 详情` / `### 异文` / 列表项。note 原样，只有 `- **text** —— ` 是包裹。
  const variants = Array.isArray(data.variants) ? data.variants : [];
  let detail = '';
  if (variants.length > 0) {
    const items = variants.map((v, i) => {
      if (typeof v?.text !== 'string' || typeof v?.note !== 'string') {
        fail(`${displayPath}: 第 ${i + 1} 条 variant 的 text/note 不是字符串`);
      }
      return `- **${v.text}** —— ${v.note}`;
    });
    detail = `\n## 详情\n\n### 异文\n\n${items.join('\n')}\n`;
  }

  const newText = `---\n${newFmLines.join('\n')}\n---\n${body}${detail}`;

  // ── 自校验（在内存里，落盘之前）──
  // 重新解析新文本，按**独立**口径切出「正文区」（front matter 之后、第一个 `## ` 之前）
  // 再与旧正文逐字比对（不是拿刚拼好的字符串自比）。
  const check = splitFrontMatter(newText, `${displayPath} (new)`);
  const sectionAt = check.bodyLines.findIndex((l) => /^##\s+\S/.test(l));
  const newOrigin = (sectionAt === -1 ? check.bodyLines : check.bodyLines.slice(0, sectionAt)).join('\n');
  if (newOrigin !== body) {
    fail(`${displayPath}: 自校验失败——新文件的正文区与旧正文不是逐字相同`);
  }
  const newData = parseFrontMatterLines(check.fmLines, `${displayPath} (new)`, check.fmLineOffset);
  for (const k of COMPARE_KEYS) {
    if (newData[k] !== data[k]) {
      fail(`${displayPath}: 自校验失败——字段 \`${k}\` 迁移前后不一致`);
    }
  }
  for (const v of variants) {
    if (!detail.includes(v.text) || !detail.includes(v.note)) {
      fail(`${displayPath}: 自校验失败——异文文本/注记没有逐字进详情`);
    }
  }

  return {
    text: newText,
    body,
    stanzas: body.split('\n'),
    variants,
    dropped: {
      id: data.id ?? null,
      dynastyOrder: data.dynastyOrder ?? null,
      era: data.era ?? null,
    },
    kept: Object.fromEntries(KEEP_KEYS.map((k) => [k, data[k]])),
  };
}

function main() {
  const manifestPath = path.join(REPO, MANIFEST_REL);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!Array.isArray(manifest.rows) || manifest.rows.length !== 19) {
    fail(`清单 ${MANIFEST_REL} 的 rows 不是 19 项`);
  }

  /** 先在内存里算好全部 19 首，任何一首自校验失败 ⇒ 全体不落盘。 */
  const plans = [];
  let alreadyDone = 0;
  for (const row of manifest.rows) {
    const oldAbs = path.join(REPO, row.oldRelPath);
    const newAbs = path.join(REPO, POEMS_REL, row.newRelPath);
    const oldExists = fs.existsSync(oldAbs);
    const newExists = fs.existsSync(newAbs);

    if (!oldExists && newExists) {
      alreadyDone += 1;
      plans.push({ row, status: 'alreadyDone' });
      continue;
    }
    if (oldExists && newExists) {
      fail(`旧、新文件同时存在，不静默覆盖：\n  ${toPosix(row.oldRelPath)}\n  ${toPosix(path.relative(REPO, newAbs))}`);
    }
    if (!oldExists && !newExists) {
      fail(`两个文件都不存在：\n  ${toPosix(row.oldRelPath)}\n  ${toPosix(path.relative(REPO, newAbs))}`);
    }

    const oldText = fs.readFileSync(oldAbs, 'utf8');
    const built = buildV2(oldText, toPosix(row.oldRelPath));
    const relFromPoems = row.newRelPath.replace(/\.md$/i, '').replace(/\//g, '-');
    if (relFromPoems !== row.newId) {
      fail(`${row.oldRelPath}: 清单里的 newId「${row.newId}」与 newRelPath 派生的「${relFromPoems}」不一致`);
    }
    plans.push({ row, status: 'planned', oldAbs, newAbs, ...built });
  }

  const planned = plans.filter((p) => p.status === 'planned');

  if (!dryRun) {
    for (const p of planned) {
      fs.mkdirSync(path.dirname(p.newAbs), { recursive: true });
      fs.writeFileSync(p.newAbs, p.text, 'utf8');
      fs.unlinkSync(p.oldAbs);
    }
  }

  const report = {
    dryRun,
    alreadyDone,
    migrated: planned.length,
    rows: plans.map((p) => ({
      status: p.status,
      oldRelPath: p.row.oldRelPath,
      oldId: p.row.oldId,
      newRelPath: p.row.newRelPath,
      newId: p.row.newId,
      title: p.row.title,
      variants: p.status === 'planned' ? p.variants.length : null,
      bodyLines: p.status === 'planned' ? p.stanzas.length : null,
      dropped: p.status === 'planned' ? p.dropped : null,
    })),
  };

  if (reportPath) fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const summary = planned
    .map((p) => {
      const n = p.variants.length;
      return `  ${p.row.newRelPath}  (id=${p.row.newId}; 正文 ${p.stanzas.length} 行含尾空行; 异文 ${n} 条)`;
    })
    .join('\n');
  process.stdout.write(
    `${dryRun ? '[dry-run] ' : ''}计划迁移 ${planned.length} 首，已完成 ${alreadyDone} 首\n${summary}\n`,
  );
  const variantTotal = planned.reduce((n, p) => n + p.variants.length, 0);
  process.stdout.write(
    planned.length > 0 ? `异文合计 ${variantTotal} 条（本次迁移的 ${planned.length} 首）\n` : '无待迁移项（全部已是迁移后状态，未读旧文件、未改任何文件）\n',
  );
}

main();
