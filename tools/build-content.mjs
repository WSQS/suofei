#!/usr/bin/env node
// 契约线 C：内容编译 CLI。
//
//   node tools/build-content.mjs [--check] [--content <dir>] [--out <file>]
//                                [--content-version <YYYY.MM.DD.N>] [--previous-version <v>]
//                                [--minify] [--json] [--quiet]
//
// 退出码：0 成功；1 校验/构建失败；2 命令行用法错误。
// 失败时**不写任何产物**，既有 dist/content.json 原样保留（失败保旧版）。

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { BuildFailure, ContentError, UsageError } from './lib/errors.mjs';
import { buildContentFromRecords, toDisplayPath } from './lib/content-build.mjs';
import {
  CLI_FLAGS,
  DEFAULT_CONTENT_DIR,
  DEFAULT_ORDER_STRATEGY,
  DEFAULT_OUT,
  EXIT_CODES,
  POEMS_SUBDIRNAME,
  SORT_STRATEGIES,
  SOURCE_EXT,
} from './lib/interface.mjs';

const USAGE = `用法：node tools/build-content.mjs [选项]

  ${CLI_FLAGS.check}                     只校验，不写产物
  ${CLI_FLAGS.content} <dir>             内容根目录，默认 ${DEFAULT_CONTENT_DIR}（读取 <dir>/${POEMS_SUBDIRNAME}/*${SOURCE_EXT}）
  ${CLI_FLAGS.out} <file>                产物路径，默认 ${toDisplayPath(DEFAULT_OUT)}
  ${CLI_FLAGS.contentVersion} <v>       发布内容版本，形如 2026.10.14.1（不给则由内容摘要派生本地版本）
  ${CLI_FLAGS.previousVersion} <v>      上一版内容版本，用于单调性检查（默认读取已有产物里的值）
  ${CLI_FLAGS.minify}                    产物压缩为单行 JSON（默认 2 空格缩进，便于评审与 diff）
  ${CLI_FLAGS.order} <source|pinyin>    组内排序策略，默认 ${DEFAULT_ORDER_STRATEGY}（暂定，待用户拍板）
                               source：先底本原次序 orderInSource，无值者再按拼音；
                               pinyin：作者拼音 → 诗名拼音（佚名排最后）
  ${CLI_FLAGS.json}                      以 JSON 输出结果（便于流水线/脚本消费）
  ${CLI_FLAGS.quiet}                     成功时不打印摘要
  -h, --help                  显示本帮助
`;

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  const opts = {
    check: false,
    contentDir: DEFAULT_CONTENT_DIR,
    out: DEFAULT_OUT,
    contentVersion: null,
    previousVersion: null,
    order: DEFAULT_ORDER_STRATEGY,
    minify: false,
    json: false,
    quiet: false,
    help: false,
  };
  let i = 0;
  const need = (opt) => {
    const v = argv[++i];
    if (v === undefined) throw new UsageError(`选项 ${opt} 需要一个值`);
    return v;
  };
  for (i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case CLI_FLAGS.check:
        opts.check = true;
        break;
      case CLI_FLAGS.content:
        opts.contentDir = need(a);
        break;
      case CLI_FLAGS.out:
        opts.out = need(a);
        break;
      case CLI_FLAGS.contentVersion:
        opts.contentVersion = need(a);
        break;
      case CLI_FLAGS.previousVersion:
        opts.previousVersion = need(a);
        break;
      case CLI_FLAGS.order: {
        const v = need(a);
        if (!SORT_STRATEGIES.includes(v)) {
          throw new UsageError(`--order 只支持 ${SORT_STRATEGIES.join(' / ')}，收到：${v}`);
        }
        opts.order = v;
        break;
      }
      case CLI_FLAGS.minify:
        opts.minify = true;
        break;
      case CLI_FLAGS.json:
        opts.json = true;
        break;
      case CLI_FLAGS.quiet:
        opts.quiet = true;
        break;
      case '-h':
      case '--help':
        opts.help = true;
        break;
      default:
        throw new UsageError(`未知选项：${a}`);
    }
  }
  return opts;
}

/**
 * @param {string} poemsDir
 */
function readRecords(poemsDir) {
  let entries;
  try {
    entries = fs.readdirSync(poemsDir, { withFileTypes: true });
  } catch (e) {
    if (/** @type {any} */ (e).code === 'ENOENT') {
      throw new ContentError('CONTENT_DIR_MISSING', `内容目录不存在：${toDisplayPath(poemsDir)}`);
    }
    throw e;
  }
  const files = entries
    .filter((d) => d.isFile() && d.name.toLowerCase().endsWith(SOURCE_EXT))
    .map((d) => d.name)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return files.map((name) => {
    const abs = path.join(poemsDir, name);
    return {
      displayPath: toDisplayPath(abs),
      base: name.slice(0, -SOURCE_EXT.length),
      text: fs.readFileSync(abs, 'utf8'),
    };
  });
}

function readPreviousVersionFromOut(outPath) {
  try {
    const raw = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    return typeof raw?.contentVersion === 'string' ? raw.contentVersion : null;
  } catch {
    return null;
  }
}

/** 产物里的生成时间：可用 SOURCE_DATE_EPOCH 固定以复现构建（不设则用当前时间）。 */
function resolveGeneratedAt() {
  const epoch = process.env.SOURCE_DATE_EPOCH;
  if (epoch === undefined || epoch === '') return undefined;
  const seconds = Number(epoch);
  if (!Number.isFinite(seconds)) {
    throw new UsageError(`SOURCE_DATE_EPOCH 必须是 Unix 秒数，收到：${epoch}`);
  }
  return new Date(seconds * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function writeAtomic(outPath, text) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const tmp = `${outPath}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, outPath);
}

function main(argv) {
  const opts = parseArgs(argv);
  if (opts.help) {
    process.stdout.write(USAGE);
    return EXIT_CODES.ok;
  }

  const poemsDir = path.join(opts.contentDir, POEMS_SUBDIRNAME);
  const records = readRecords(poemsDir);

  const previousVersion =
    opts.previousVersion ?? readPreviousVersionFromOut(opts.out) ?? null;

  const generatedAt = resolveGeneratedAt();

  const { content, errors, versionNotes, orderStrategy } = buildContentFromRecords({
    records,
    explicitVersion: opts.contentVersion,
    previousVersion,
    orderStrategy: opts.order,
    ...(generatedAt !== undefined ? { generatedAt } : {}),
  });

  if (errors.length > 0) {
    const failure = new BuildFailure(errors);
    if (opts.json) {
      process.stdout.write(`${JSON.stringify(failure.toJSON(), null, 2)}\n`);
    } else {
      process.stderr.write(`内容编译失败：${errors.length} 项校验错误\n${failure.formatList()}\n`);
      process.stderr.write('未产出任何内容文件（失败保留旧版本）。\n');
    }
    return EXIT_CODES.buildFailed;
  }

  const poemCount = content.poems.length;
  const dynastyCount = content.dynasties.length;

  if (!opts.check) {
    const text = `${JSON.stringify(content, null, opts.minify ? 0 : 2)}\n`;
    writeAtomic(opts.out, text);
  }

  if (opts.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          checkedOnly: opts.check,
          out: opts.check ? null : toDisplayPath(opts.out),
          poems: poemCount,
          dynasties: dynastyCount,
          formatVersion: content.formatVersion,
          contentVersion: content.contentVersion,
          orderStrategy,
          generatedAt: content.generatedAt,
          notes: versionNotes,
        },
        null,
        2,
      )}\n`,
    );
  } else if (!opts.quiet) {
    process.stdout.write(
      opts.check
        ? `内容校验通过：${poemCount} 首诗 / ${dynastyCount} 个分组（--check 未写产物）\n`
        : `内容编译成功：${poemCount} 首诗 / ${dynastyCount} 个分组 → ${toDisplayPath(opts.out)}\n`,
    );
    process.stdout.write(`  formatVersion=${content.formatVersion} contentVersion=${content.contentVersion}\n`);
    process.stdout.write(`  组内排序策略：${orderStrategy}\n`);
    for (const n of versionNotes) process.stdout.write(`  · ${n}\n`);
  }
  return EXIT_CODES.ok;
}

const argv = process.argv.slice(2);
try {
  process.exitCode = main(argv);
} catch (e) {
  if (e instanceof UsageError) {
    process.stderr.write(`${e.message}\n\n${USAGE}`);
    process.exitCode = EXIT_CODES.usage;
  } else if (e instanceof ContentError) {
    process.stderr.write(`内容编译失败：1 项校验错误\n  - ${e.format()}\n未产出任何内容文件。\n`);
    process.exitCode = EXIT_CODES.buildFailed;
  } else if (e instanceof BuildFailure) {
    process.stderr.write(`内容编译失败：${e.errors.length} 项校验错误\n${e.formatList()}\n`);
    process.exitCode = EXIT_CODES.buildFailed;
  } else {
    throw e;
  }
}
