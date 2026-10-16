#!/usr/bin/env node
/**
 * 门：**产物字段集变了 ⇒ `formatVersion` 必须已经跟着升**（用户 2026-10-15 定的 B 判据）。
 *
 * 为什么需要它：用户选 B 的理由是「机械、可自动断言、没有判断风险」——那这条判据就必须真的
 * 有一条断言守着，否则它只是文档里的一句话。`formatVersion` 是一道**单向门**：往上升之后，
 * 已装的老客户端（只接受它认得的那个值）会**拒收**新内容、退回内置，而项目**没有回退能力**
 * ⇒ 用户只能手动装新 APK。所以「字段集变了却没升版本」必须在这里红。
 *
 * 判据的权威口径见 tools/lib/field-set.mjs（产物 JSON 的键路径）。
 * 冻结记录在 schema/format-version.json。
 *
 * 用法：
 *   node tools/check-fieldset.mjs                  # 检查；0=一致，1=不一致
 *   node tools/check-fieldset.mjs --content <dir>  # 换一个内容根来编译（默认见下）
 *   node tools/check-fieldset.mjs --print-entry    # 打印当前产物对应的记录条目（人工贴进 schema/format-version.json）
 *
 * ⚠ 2026-10-16（formatVersion 1 → 2）为什么默认内容根变成了一个**形状夹具**：
 *   本门的对象是**产物形状**（键路径），而新编译器只认新源格式；S2 落地时 `content/poems/`
 *   里还是 v1 源（19 首迁移是 S3、另有授权时序）⇒ 编译真实内容会直接失败，本门会变成「编译不过」
 *   而不是「字段集一致」。所以本门默认编译 `tests/fixtures/shape-v2/content`——一份**列全 10 键**
 *   的最小内容（编译器对每一首都无条件发出这 10 个键，所以单首诗就能定形状）。
 *   S3 落地后可改用 `--content content` 回到真实内容。
 *
 * **本脚本不自动改 schema/format-version.json**：升版本是不可逆动作，得由人显式落笔。
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fieldSetEntry } from './lib/field-set.mjs';

const RECORD = 'schema/format-version.json';
/** 形状夹具：列全 10 键的最小内容（见文件头的 ⚠ 说明）。 */
export const DEFAULT_SHAPE_CONTENT_DIR = 'tests/fixtures/shape-v2/content';

/** 编译一次当前形状（产物由 CLI 组装，含顶层键——所以拿到的就是客户端会读到的东西）。
 * @param {string} outDir
 * @param {string} [contentDir]
 */
export function compileCurrent(outDir, contentDir = DEFAULT_SHAPE_CONTENT_DIR) {
  const fresh = join(outDir, 'content.json');
  const build = spawnSync(
    process.execPath,
    ['tools/build-content.mjs', '--quiet', '--content', contentDir, '--out', fresh, '--order', 'source'],
    { encoding: 'utf8' },
  );
  if (build.status !== 0) {
    throw new Error('无法编译当前内容，先修内容或编译器：\n' + (build.stdout || '') + (build.stderr || ''));
  }
  return JSON.parse(readFileSync(fresh, 'utf8'));
}

export function readRecord() {
  return JSON.parse(readFileSync(RECORD, 'utf8'));
}

/** 记录与产物的一致性判定（纯函数，方便单测直接用）。返回 { ok, problems[] }。 */
export function checkAgainst(doc, record) {
  const problems = [];
  const versions = [...(record.versions ?? [])].sort((a, b) => a.formatVersion - b.formatVersion);

  for (let i = 1; i < versions.length; i++) {
    if (versions[i].formatVersion <= versions[i - 1].formatVersion) {
      problems.push(`记录本身有问题：formatVersion 必须严格递增（${versions[i - 1].formatVersion} → ${versions[i].formatVersion}）`);
    }
  }

  const entry = fieldSetEntry(doc);
  const known = versions.find((v) => v.formatVersion === entry.formatVersion);

  if (!known) {
    problems.push(
      `产物 formatVersion=${entry.formatVersion}，但 ${RECORD} 里没有这个版本的记录` +
        `（已记录：${versions.map((v) => v.formatVersion).join(', ') || '无'}）`,
    );
    return { ok: false, problems, entry };
  }

  const recorded = new Set(known.fieldPaths);
  const current = new Set(entry.fieldPaths);
  const added = [...current].filter((p) => !recorded.has(p)).sort();
  const removed = [...recorded].filter((p) => !current.has(p)).sort();

  if (known.fieldSetSha256 !== entry.fieldSetSha256) {
    problems.push(
      `**字段集变了，而 formatVersion 仍是 ${entry.formatVersion}**\n` +
        `    记录指纹：${known.fieldSetSha256}\n` +
        `    当前指纹：${entry.fieldSetSha256}\n` +
        `    新增字段：${added.join(', ') || '（无）'}\n` +
        `    消失字段：${removed.join(', ') || '（无）'}`,
    );
  }

  return { ok: problems.length === 0, problems, entry, added, removed };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('check-fieldset.mjs')) {
  const tmp = mkdtempSync(join(tmpdir(), 'suofei-fieldset-'));
  try {
    const argv = process.argv.slice(2);
    const ci = argv.indexOf('--content');
    const contentDir = ci === -1 ? DEFAULT_SHAPE_CONTENT_DIR : argv[ci + 1];
    if (contentDir === undefined) {
      console.error('--content 需要一个目录');
      process.exit(2);
    }
    const doc = compileCurrent(tmp, contentDir);
    if (argv.includes('--print-entry')) {
      console.log(JSON.stringify(fieldSetEntry(doc), null, 2));
      process.exit(0);
    }
    const { ok, problems, entry } = checkAgainst(doc, readRecord());
    if (!ok) {
      console.error('字段集门未通过（用户 2026-10-15 定的判据：字段集一变就升 formatVersion）：');
      for (const p of problems) console.error('  ✗ ' + p);
      console.error('\n怎么修（二选一，都得人来做）：');
      console.error('  ① 这次改动**不该**改字段集 ⇒ 把产物改回去（别加/别删键）；');
      console.error('  ② 这次改动**确实**改了字段集 ⇒ ① 升 formatVersion（编译器/契约 §4.1）② 追加一条记录：');
      console.error('       node tools/check-fieldset.mjs --print-entry   # 把输出作为新条目追加进 ' + RECORD);
      console.error('     ⚠ 升版本是**不可逆**的：老客户端会拒收新内容、退回内置，用户只能手动装新 APK。');
      process.exit(1);
    }
    console.log(
      `字段集门通过：formatVersion=${entry.formatVersion}，字段路径 ${entry.fieldPaths.length} 条，指纹 ${entry.fieldSetSha256.slice(0, 12)}…`,
    );
  } catch (err) {
    console.error(String(err.message ?? err));
    process.exit(1);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
