#!/usr/bin/env node
// 发布流水线 F：**产物就绪检查** —— 「三样产物都真的就绪了吗」的那道闸。
//
//   node release/check-ready.mjs
//   node release/check-ready.mjs --out release/out
//   node release/check-ready.mjs --json
//
// 退出码：0 = 全绿（允许推进「最新版」，即 tag/Release 指向这一版）
//         1 = 有红项（**禁止推进**；旧版仍然可下载、可读）
//         2 = 用法错误
//
// 设计原则：
//  1. **不看构建的自我声明，看重算的事实**：所有哈希都在这里重新算一遍。
//  2. 结构校验交给契约线 C 的 `tools/validate-content.mjs`（schema 是 C 的所有物）；
//     本文件**不写死字段清单** —— 契约一改，硬编码的清单就会假红。
//  3. 次序只认两件事：产物数组的**次序**本身，以及 `orderInSource`（整数、1 起）。
//  4. 检查不了的东西报 SKIP 并说清原因，**不当成通过**。

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import * as A from './lib/artifacts.mjs';
import { REPO_ROOT, display, exists, listTop, runCapture, sha256 } from './lib/util.mjs';
import { RELEASE_VERSION_RE } from './lib/version-source.mjs';
import { compareContentVersion } from '../tools/lib/version.mjs';
import { LIVE_CHECK_IDS, findE2EDeployFiles, runAndroidUnitTests, runWebE2E } from './lib/live.mjs';
import { listZipEntries, readZipEntry } from './lib/zip.mjs';

const USAGE = `用法：node release/check-ready.mjs [选项]

  --out <dir>   产物目录，默认 ${A.OUT_DEFAULT}
  --skip-live   不跑两个「真跑」门（Web e2e、Android 单测）—— 它们会标黄，不会当成通过
  --live-only   只跑那两个「真跑」门（迭代时用，跳过静态检查）
  --json        末尾额外打印一份机器可读的结果
  -h, --help    显示本帮助
`;

class CheckFailed extends Error {}
class CheckSkipped extends Error {}

function parseArgs(argv) {
  const opts = { out: A.OUT_DEFAULT, json: false, help: false, skipLive: false, liveOnly: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') {
      const v = argv[++i];
      if (v === undefined) throw new Error('--out 后面缺参数');
      opts.out = v;
    } else if (a === '--json') opts.json = true;
    else if (a === '--skip-live') opts.skipLive = true;
    else if (a === '--live-only') opts.liveOnly = true;
    else if (a === '-h' || a === '--help') opts.help = true;
    else throw new Error(`未知选项：${a}`);
  }
  if (opts.skipLive && opts.liveOnly) throw new Error('--skip-live 与 --live-only 不能同时用');
  return opts;
}

const fail = (msg) => {
  throw new CheckFailed(msg);
};
const skip = (msg) => {
  throw new CheckSkipped(msg);
};

/** 检查注册表：每条都应该能单独说出「查了什么、依据是什么」。
 *  needs 是**前置上下文键**：前置没就绪时本项报「跳过」，而不是抛出一串栈
 *  —— 一个红项不应该把后面一串无关检查全部带崩（那样人读不出真正的问题在哪）。 */
const CHECKS = [];
const check = (id, title, fn, needs = []) => CHECKS.push({ id, title, fn, needs });

/** 每条检查依赖的前置上下文键（由前面的检查写入）。
 *  集中放的理由：前置没就绪时**跳过**并说清「本项没查」，而不是让一个红项把后面十几条
 *  无关检查全部带崩（那样人读不出真正的问题在哪，也容易误以为「红了十几样」）。 */
const PREREQUISITES = {
  // manifest 这条检查本身**产出** ctx.manifest，所以它没有前置（这里不能写 manifest）。
  'source-tree-clean': ['manifest'],
  'schema-validation': ['dist'],
  'format-version': ['dist'],
  'content-version-shape': ['dist'],
  'content-version-matches-manifest': ['dist', 'manifest'],
  'version-monotonic': ['dist', 'manifest'],
  'poem-count': ['dist', 'manifest'],
  'order-in-source': ['dist', 'manifest'],
  'dist-sha256': ['dist', 'manifest'],
  'web-same-source': ['dist'],
  'app-version-agree': ['manifest'],
  'app-version-bumped': ['manifest'],
  'android-manifest': ['dist'],
  'apk-present': ['manifest'],
  'apk-builtin-same-source': ['apkBuf', 'dist'],
  'apk-identity': ['apkFile', 'manifest'],
};

// ─────────────────────────── 检查项 ───────────────────────────

check('out-dir', '产物目录存在且完整', (c) => {
  if (!exists(c.outDir)) fail(`产物目录不存在：${display(c.outDir)}（先跑 release/build-release.mjs）`);
  const top = listTop(c.outDir) ?? [];
  const missing = ['dist', 'web'].filter((n) => !exists(path.join(c.outDir, n)));
  if (missing.length) {
    fail(
      `产物目录不完整，缺：${missing.join(', ')}\n` +
        '   （上次构建可能失败或正在跑；本目录是发布流水线自己管理的，不要与别的构建共用同一个 --out）',
    );
  }
  return `顶层：${top.join(', ')}`;
});
check('manifest', '本次发布的清单可读且字段齐', (c) => {
  const f = A.manifestPath(c.outDir);
  if (!exists(f)) fail(`缺 ${display(f)}`);
  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch (e) {
    fail(`${display(f)} 不是合法 JSON：${e.message}`);
  }
  c.manifest = doc;
  const required = ['contentVersion', 'formatVersion', 'poemCount', 'bytes', 'sha256', 'artifacts', 'app'];
  const missing = required.filter((k) => doc[k] === undefined || doc[k] === null);
  if (missing.length) fail(`清单缺字段：${missing.join(', ')}`);
  return `contentVersion=${doc.contentVersion} previousVersion=${doc.previousVersion ?? '（无）'} sourceCommit=${doc.sourceCommitShort ?? '?'}`;
});

check(
  'source-tree-clean',
  '源树（content/ tools/ schema/ android/ web/）在构建时是干净的',
  (c) => {
    const dirty = c.manifest.dirtyAtReleaseTime;
    if (dirty === undefined) skip('清单里没有这个记录（早期的构建？）');
    const bad = Object.entries(dirty).filter(([, v]) => v === true).map(([k]) => k);
    const unknown = Object.entries(dirty).filter(([, v]) => v === 'unknown').map(([k]) => k);
    if (unknown.length) return { status: 'WARN', detail: `读不到 git 状态：${unknown.join(', ')}（无法确认可复现）` };
    if (bad.length) {
      return { status: 'WARN', detail: `${bad.join(', ')} 有未提交改动 —— 本地演练可以，真发布必须先从干净的提交构建` };
    }
    return '干净';
  },
  ['manifest'],
);

check('dist-json', '规范产物可解析', (c) => {
  const f = A.distPath(c.outDir);
  if (!exists(f)) fail(`缺 ${display(f)}`);
  c.distBuf = fs.readFileSync(f);
  c.distSha = sha256(c.distBuf);
  try {
    c.dist = JSON.parse(c.distBuf.toString('utf8'));
  } catch (e) {
    fail(`${display(f)} 不是合法 JSON：${e.message}`);
  }
  const first = c.dist.poems?.[0];
  const last = c.dist.poems?.[c.dist.poems.length - 1];
  return `${c.distBuf.length} 字节 sha256=${c.distSha} poems=${c.dist.poems?.length} dynasties=${c.dist.dynasties?.length} 首=${first?.title} 末=${last?.title}`;
});

check('schema-validation', '结构校验走契约线 C 的 tools/validate-content.mjs（不硬编码字段清单）', (c) => {
  const target = A.distPath(c.outDir);
  const schema = path.join(REPO_ROOT, 'schema/content.schema.json');
  if (!exists(path.join(REPO_ROOT, 'node_modules/ajv'))) {
    fail('跑不了 C 线的 schema 校验：项目本地缺 ajv（在仓库根执行 npm install 后重跑）。这是「没查」，不是「查过」');
  }
  const r = runCapture(process.execPath, ['tools/validate-content.mjs', '--schema', schema, target], { cwd: REPO_ROOT });
  if (!r) fail('无法执行 node tools/validate-content.mjs');
  c.schemaValidation = { status: r.status, stdout: r.stdout.trim(), stderr: r.stderr.trim() };
  if (r.status !== 0) fail(`tools/validate-content.mjs 退出码 ${r.status}：${(r.stderr || r.stdout).trim().split('\n').slice(0, 6).join(' | ')}`);
  return r.stdout.trim().split('\n').pop().trim();
});

check('format-version', 'formatVersion 在本流水线与客户端的支持范围内', (c) => {
  const v = c.dist.formatVersion;
  if (v !== A.SUPPORTED_FORMAT_VERSION) {
    fail(`产物 formatVersion=${v}，流水线约定只支持 ${A.SUPPORTED_FORMAT_VERSION}。改了结构就同时要改两端客户端，属于「先问后做」——不能靠这道闸放过去`);
  }
  return `formatVersion=${v}`;
});

check('content-version-shape', 'contentVersion 是发布版本形状（逐段数值比较的前提）', (c) => {
  const v = c.dist.contentVersion;
  if (typeof v !== 'string' || !RELEASE_VERSION_RE.test(v)) {
    fail(`contentVersion=${JSON.stringify(v)} 不是 YYYY.MM.DD.N（本地派生版本 0.0.0-dev+… 不可发布）`);
  }
  return v;
});

check('content-version-matches-manifest', '产物里的 contentVersion 与清单一致', (c) => {
  if (c.dist.contentVersion !== c.manifest.contentVersion) {
    fail(`产物 ${c.dist.contentVersion} ≠ 清单 ${c.manifest.contentVersion}`);
  }
  return c.dist.contentVersion;
});

check('version-monotonic', 'contentVersion 严格大于上一版（防「新发布的版本号更小」）', (c) => {
  const prev = c.manifest.previousVersion;
  if (!prev) skip('清单里没有上一版（构建时找不到基线）—— 这一次的版本号没有被自动拦住，需要人工确认');
  const cmp = compareContentVersion(c.dist.contentVersion, prev);
  if (cmp <= 0) fail(`本版 ${c.dist.contentVersion} 不大于上一版 ${prev}：已更新的客户端不会采用它`);
  return `${prev} → ${c.dist.contentVersion}`;
});

check('poem-count', '诗不为空，且与清单记录一致', (c) => {
  const n = c.dist.poems?.length ?? 0;
  if (n === 0) fail('产物里一首诗都没有');
  if (n !== c.manifest.poemCount) fail(`产物里 ${n} 首 ≠ 清单记录 ${c.manifest.poemCount} 首`);
  return `${n} 首 / ${c.dist.dynasties?.length} 个分组`;
});

check('order-in-source', '组内次序：数组次序 + orderInSource 升序（不认任何拼音名次键）', (c) => {
  const strategy = c.manifest.orderStrategy;
  if (strategy !== 'source') skip(`本次构建的排序策略是 ${strategy}，不是 source —— orderInSource 的升序前提不成立`);
  const poems = c.dist.poems ?? [];
  const withOrder = poems.map((p, i) => ({ i, o: p.orderInSource }));
  const nulls = withOrder.filter((x) => x.o === null || x.o === undefined);
  const values = withOrder.filter((x) => x.o !== null && x.o !== undefined);
  if (values.length === 0) skip('产物里没有任何 orderInSource（全部为 null）—— 次序只剩数组次序，没有底本原序可核');
  const firstNull = withOrder.find((x) => x.o === null || x.o === undefined);
  if (firstNull) fail(`source 策略下 orderInSource 有值的诗必须排在前面，但第 ${firstNull.i + 1} 首（0 基 ${firstNull.i}）没有 orderInSource`);
  for (let k = 1; k < values.length; k++) {
    if (!(Number.isInteger(values[k].o) && Number.isInteger(values[k - 1].o))) fail(`orderInSource 不是整数：第 ${values[k].i} 首 = ${JSON.stringify(values[k].o)}`);
    if (values[k].o <= values[k - 1].o) {
      fail(`orderInSource 不是升序：第 ${values[k - 1].i + 1} 首=${values[k - 1].o}，第 ${values[k].i + 1} 首=${values[k].o}`);
    }
  }
  return `${values.length}/${poems.length} 首有 orderInSource，1 起严格升序（${values[0].o}…${values[values.length - 1].o}）；其余 ${nulls.length} 首排在后面`;
});

check('dist-sha256', '规范产物的 sha256 与清单一致（重算）', (c) => {
  if (c.distSha !== c.manifest.sha256) fail(`重算 ${c.distSha} ≠ 清单 ${c.manifest.sha256}`);
  if (c.distBuf.length !== c.manifest.bytes) fail(`实际 ${c.distBuf.length} 字节 ≠ 清单 ${c.manifest.bytes} 字节`);
  return `${c.distSha} (${c.distBuf.length} 字节)`;
});

check('web-same-source', 'Web 部署目录里的内容是规范产物的字节复制（同源，不是各建一次）', (c) => {
  const f = path.join(A.webDir(c.outDir), A.WEB_CONTENT_NAME);
  if (!exists(f)) fail(`缺 ${display(f)}`);
  const buf = fs.readFileSync(f);
  if (!buf.equals(c.distBuf)) {
    fail(`字节不一致：${display(f)} ${sha256(buf)} ≠ dist ${c.distSha}（**这就是「APK/Web 发的不是同一份内容」的事故**）`);
  }
  return `${buf.length} 字节，与 dist 逐字节相同`;
});

check('web-required-files', '部署契约：必需文件都在部署目录里（含单独取的内容 content.json）', (c) => {
  const dir = A.webDir(c.outDir);
  // 必需的站点文件取自 **E 线自己的** web/tests/lib/deploy.mjs: DEPLOY_FILES（不再另写一份）：
  // 它改了发布集，我这边自动跟上；若它新增了我没复制的东西，这里会报“缺文件”并要求人工确认复制白名单。
  const theirs = findE2EDeployFiles();
  const required = [...new Set([...(theirs ?? A.DEPLOY_ALLOWLIST), A.WEB_CONTENT_NAME])];
  const missing = required.filter((n) => !exists(path.join(dir, n)));
  if (missing.length) {
    fail(
      `部署目录缺：${missing.join(', ')}${theirs ? '（必需清单来自 E 线的 DEPLOY_FILES）' : ''}\n` +
        `   content.json 是必需项：契约 §4 要求内容**单独取、不得内联**，站点上少它 = Web 端没内容可读；\n` +
        `   若是 E 新增了站点文件而我没复制，请同步 release/lib/artifacts.mjs 的 DEPLOY_ALLOWLIST。`,
    );
  }
  return `${required.join(', ')}${theirs ? '（取自 E 线的 DEPLOY_FILES）' : '（读不到 E 的部署清单，退回本地白名单）'}`;
});

check('app-version-agree', '站点版本 APP_VERSION 确实写进了两处（config.js 与 sw.js），且与 tag 一致', (c) => {
  // 只读这一个**契约常量**（E 的 web/README 与 tests/lib/deploy.mjs 都写明「两处都要改」）。
  // 刻意**不读** sw.js 的数组/缓存名等内部结构：那是 E 的内部实现，改了不该让我假红。
  const dir = A.webDir(c.outDir);
  const read = (rel) => {
    const f = path.join(dir, rel);
    if (!exists(f)) fail(`缺 ${display(f)}`);
    const v = /APP_VERSION\s*=\s*'([^']+)'/.exec(fs.readFileSync(f, 'utf8'))?.[1] ?? null;
    if (!v) fail(`从 ${display(f)} 里读不到 APP_VERSION —— 它是发布的契约常量，读不到就必须人工对齐`);
    return v;
  };
  const cfg = read('app/config.js');
  const sw = read('sw.js');
  if (cfg !== sw) {
    fail(
      `APP_VERSION 两处不一致：web/app/config.js=${cfg} / web/sw.js=${sw}\n` +
        '   （它是站点缓存的版本键：内容与壳在同一个 cache 成对切换，两处必须同时改；不一致 = 站点更新机制坏）',
    );
  }
  const tagApp = c.manifest.app?.tagAppVersion ?? null;
  if (tagApp && tagApp !== cfg) {
    fail(`tag 里的应用版本 ${tagApp} ≠ 代码里的 APP_VERSION ${cfg} —— 发布锚点与代码不一致（改代码或改 tag）`);
  }
  return `config.js = sw.js = ${cfg}${tagApp ? `，与 tag ${tagApp} 一致` : '（本次没给 tag：本地演练；正式发布以 tag 为准）'}`;
});

check('app-version-bumped', 'APP_VERSION 比上一版大（同版本重发会让浏览器沿用旧 cache）', (c) => {
  const current = c.manifest.app?.webAppVersion ?? null;
  if (!current) fail('清单里没有记录本次的 APP_VERSION —— 构建时就读不到，说明文件结构变了');
  const prev = c.manifest.app?.previousWebAppVersion ?? null;
  if (!prev) {
    skip(
      `本次 APP_VERSION=${current}，但没有上一版的记录（首次发布 / 换了产物目录）⇒ 无法自动判断是否递增。\n` +
        '   真发布应当保留上一次的 release-manifest.json（有它这条就能自动核）。',
    );
  }
  if (!/^\d+(\.\d+)*$/.test(current)) fail(`APP_VERSION=${current} 不是数值段形式，无法判断是否递增`);
  const cmp = compareAppVersion(current, prev);
  if (cmp === null) fail(`APP_VERSION 不好比：本次 ${current} / 上一版 ${prev}`);
  if (cmp <= 0) {
    fail(
      `APP_VERSION 没递增：本次 ${current} ≤ 上一版 ${prev}\n` +
        '   （内容与壳在同一个 pc-resources-<APP_VERSION> cache 里成对切换；同版本重发会让浏览器沿用旧 cache）',
    );
  }
  return `${prev} → ${current}`;
});

check('web-no-unexpected', '部署目录没有多出不该发布的条目（顶层精确比对）', (c) => {
  const top = listTop(A.webDir(c.outDir)) ?? [];
  // 顶层允许集 = 本地白名单∪生成物 ∪ **E 线发布清单的顶层名**（它加了新站点文件不应假红；
  // 但新增的顶层文件要么被我复制、要么被本项报红，不会静默漏发）
  const theirTops = (findE2EDeployFiles() ?? []).map((p) => p.split('/')[0]);
  const expected = [...new Set([...A.DEPLOY_EXPECTED, ...theirTops])];
  const unexpected = top.filter((n) => !expected.includes(n));
  if (unexpected.length) {
    fail(
      `部署目录里出现了白名单之外的条目：${unexpected.join(', ')} —— ` +
        '要么它真该发布（那就把它加进 release/lib/artifacts.mjs 的 DEPLOY_ALLOWLIST），要么它是开发期文件不该发',
    );
  }
  const denied = top.filter((n) => A.DEPLOY_DENYLIST.includes(n));
  if (denied.length) fail(`开发期条目泄漏进了部署目录：${denied.join(', ')}`);
  return `${top.length} 个顶层条目：${top.join(', ')}`;
});

check('android-manifest', '远端更新清单（IF-22）自洽，且 url 能指回部署目录里同一份字节', (c) => {
  const mode = c.manifest.androidFeed ?? 'manifest';
  if (mode === 'none') {
    skip(
      '本次构建用了 --android-feed none（只用于本地演练）。但决策点 2 已经拍板：\n' +
        '   Android 保留小纸条清单（manifest 是**最终形态**），Web 不再需要独立内容通道 —— 正式的本地演练也应当用 manifest。',
    );
  }
  const f = A.androidManifestInWeb(c.outDir);
  if (!exists(f)) fail(`缺 ${display(f)}`);
  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch (e) {
    fail(`${display(f)} 不是合法 JSON：${e.message}`);
  }
  c.androidManifest = doc;
  const missing = A.MANIFEST_FIELDS.filter((k) => doc[k] === undefined || doc[k] === null);
  // size / minAppVersionCode 在 Android 端是可缺省的可选字段，缺了不算错
  const fatalMissing = missing.filter((k) => k !== 'size' && k !== 'minAppVersionCode');
  if (fatalMissing.length) fail(`清单缺必填字段：${fatalMissing.join(', ')}（Android 端缺 sha256 会直接拒绝更新）`);
  if (!/^[0-9a-f]{64}$/.test(String(doc.sha256))) fail(`sha256 不是 64 位小写十六进制：${doc.sha256}`);
  if (doc.sha256 !== c.distSha) fail(`清单 sha256 ${doc.sha256} ≠ 内容 ${c.distSha}`);
  if (doc.contentVersion !== c.dist.contentVersion) fail(`清单 contentVersion ${doc.contentVersion} ≠ 产物 ${c.dist.contentVersion}`);
  if (doc.formatVersion !== c.dist.formatVersion) fail(`清单 formatVersion ${doc.formatVersion} ≠ 产物 ${c.dist.formatVersion}`);
  if (typeof doc.url !== 'string' || doc.url === '') fail('url 为空');
  if (/^https?:\/\//.test(doc.url)) skip(`url 是绝对地址（${doc.url}），本机无法核对它指向的文件`);

  // 按 Android 端 ContentUpdater.resolveUrl() 的语义解析：基址 = 清单自己的 URL（RFC 3986）。
  const base = 'https://example.invalid/suofei/content/latest.json';
  const resolved = new URL(doc.url, base);
  const prefix = new URL('./', base).pathname; // '/suofei/content/'
  if (!resolved.pathname.startsWith(prefix)) {
    fail(
      `url="${doc.url}" 按清单所在目录解析后跑出了 ${prefix}：→ ${resolved.pathname}\n` +
        '    Android 端是用**清单的 URL** 作基址解析的（ContentUpdater.resolveUrl），所以这里必须写相对清单目录的 `<版本>/content.json`',
    );
  }
  const rel = resolved.pathname.slice(prefix.length);
  const localFile = path.join(A.webDir(c.outDir), A.ANDROID_SNAPSHOT_DIR_REL_IN_WEB, rel);
  if (!exists(localFile)) fail(`url 解析到 ${resolved.pathname}，但部署目录里没有对应文件：${display(localFile)}（Android 端会 404）`);
  const buf = fs.readFileSync(localFile);
  if (sha256(buf) !== c.distSha) fail(`快照 ${display(localFile)} 与发布内容不是同一份字节`);
  if (doc.size !== undefined && doc.size !== buf.length) fail(`清单 size=${doc.size} ≠ 快照实际 ${buf.length} 字节（Android 端会 SIZE_MISMATCH）`);
  return `url=${doc.url} → ${resolved.pathname}（同一份字节 ${buf.length} 字节）size=${doc.size} minAppVersionCode=${doc.minAppVersionCode}`;
});

check('apk-present', 'APK 构建产物存在', (c) => {
  const apk = c.manifest.apk;
  if (!apk) fail('本次构建跳过了 APK（--skip-apk）—— 三样产物少一样，不得推进最新版');
  const f = path.join(c.outDir, apk.path);
  if (!exists(f)) fail(`清单记录了 ${apk.path}，但文件不存在`);
  c.apkFile = f;
  c.apkBuf = fs.readFileSync(f);
  c.apk = apk;
  if (sha256(c.apkBuf) !== apk.sha256) fail(`APK 文件的 sha256 与清单不符（文件被改过？）`);
  return `${apk.path} ${c.apkBuf.length} 字节 sha256=${apk.sha256}`;
});

check('apk-builtin-same-source', 'APK 内置内容与发布内容**逐字节相同**（发布门里最关键的一条）', (c) => {
  if (!c.apkBuf) skip('没有 APK（上一条已报红）');
  const entry = 'assets/content/content.json';
  let hit;
  try {
    hit = readZipEntry(c.apkBuf, entry);
  } catch (e) {
    fail(`读 APK 失败：${e.message}（归档条目示例：${listZipEntries(c.apkBuf).slice(0, 5).join(', ')}）`);
  }
  if (!hit) {
    const assets = listZipEntries(c.apkBuf).filter((n) => n.startsWith('assets/'));
    fail(`APK 里没有 ${entry} —— 内置内容没打进包。assets/ 下现有：${assets.length ? assets.join(', ') : '（空）'}`);
  }
  const sha = sha256(hit.data);
  if (sha !== c.distSha) {
    fail(
      `APK 内置内容 ≠ 本次发布内容：\n     APK 内 ${sha}\n     dist  ${c.distSha}\n` +
        '     （这正是 android/README §4 那道门要拦的事故：用户以为发的是这一版内容，APK 里却是别的。）',
    );
  }
  let innerVersion = '?';
  try {
    innerVersion = JSON.parse(hit.data.toString('utf8')).contentVersion;
  } catch {
    /* 上面 sha256 已经证明字节一致，这里只是附带信息 */
  }
  if (innerVersion !== c.dist.contentVersion) fail(`APK 内置内容的 contentVersion=${innerVersion} ≠ ${c.dist.contentVersion}`);
  return `${entry}（${hit.method}）${hit.data.length} 字节 sha256=${sha} 内容版本=${innerVersion}`;
});

check('apk-identity', 'APK 的身份（包名 / versionCode）与清单一致', (c) => {
  if (!c.apkFile) skip('没有 APK（上面已报红）');
  const aapt2 = findAapt2();
  if (!aapt2) skip('找不到 aapt2（ANDROID_HOME 未设或 build-tools 缺失）—— 没查，不等于查过');
  const r = runCapture(aapt2, ['dump', 'badging', c.apkFile]);
  if (!r || r.status !== 0) skip(`aapt2 执行失败（退出码 ${r?.status ?? 'n/a'}）`);
  const m = /package: name='([^']*)' versionCode='([^']*)' versionName='([^']*)'/.exec(r.stdout);
  if (!m) fail('aapt2 输出里没解析出 package 行');
  const [, name, code, ver] = m;
  const label = /application-label:'([^']*)'/.exec(r.stdout)?.[1] ?? '?';
  if (name !== c.manifest.app.applicationId) fail(`APK 包名 ${name} ≠ 清单 ${c.manifest.app.applicationId}`);
  if (Number(code) !== c.manifest.app.versionCode) fail(`APK versionCode ${code} ≠ 清单 ${c.manifest.app.versionCode}`);
  return `${name} versionCode=${code} versionName=${ver} 应用名=${label}`;
});

// ─────────────────────── 真跑门（慢；需要真浏览器 / 真 JVM）───────────────────────

check('live-web-e2e', '真跑：用 out/web 当站点跑 E 线自己的 Web e2e（真无头 Chromium；条数不写死，取自它的输出）', (c) => {
  const r = runWebE2E({ outDir: c.outDir });
  return r;
});

check('live-android-unit-tests', '真跑：Android JVM 单测（--rerun-tasks；内置内容＝本次产物）', (c) => {
  const r = runAndroidUnitTests({ outDir: c.outDir, androidSrc: path.join(REPO_ROOT, 'android') });
  return r;
});

// ─────────────────────────── 辅助 ───────────────────────────

/** APP_VERSION 这类 `x.y.z` 数值段比较；含非数值段返回 null（不猜）。 */
function compareAppVersion(a, b) {
  const parse = (v) => String(v).split('.').map((x) => (/^\d+$/.test(x) ? Number(x) : NaN));
  const pa = parse(a);
  const pb = parse(b);
  if ([...pa, ...pb].some((n) => Number.isNaN(n))) return null;
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

function findAapt2() {
  const home = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (!home) return null;
  const bt = path.join(home, 'build-tools');
  if (!exists(bt)) return null;
  const cmp = (a, b) => {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pb[i] ?? 0) - (pa[i] ?? 0);
    return 0;
  };
  const versions = fs
    .readdirSync(bt)
    .filter((v) => /^\d+(\.\d+){1,3}$/.test(v))
    .sort(cmp);
  for (const v of versions) {
    const p = path.join(bt, v, process.platform === 'win32' ? 'aapt2.exe' : 'aapt2');
    if (exists(p)) return p;
  }
  return null;
}

// ─────────────────────────── 主流程 ───────────────────────────

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(USAGE);
    return;
  }
  const outDir = path.resolve(REPO_ROOT, opts.out);
  console.log('索斐发布流水线 F —— 产物就绪检查');
  console.log(`产物目录：${display(outDir)}`);
  console.log('');

  const ctx = { outDir };
  const results = [];
  const isLive = (id) => LIVE_CHECK_IDS.includes(id);
  for (const c of CHECKS) {
    if (opts.liveOnly && !isLive(c.id)) continue;
    let status = 'PASS';
    let detail = '';
    let meta;
    if (opts.skipLive && isLive(c.id)) {
      // 明确的「本次不跑」：标黄，绝不能当成通过。
      results.push({ id: c.id, title: c.title, status: 'WARN', detail: '本次用 --skip-live 跳过：**没跑**，不是通过' });
      console.log(`[黄] ${c.id.padEnd(28, ' ')} ${c.title}\n     本次用 --skip-live 跳过（没跑，不是通过）`);
      continue;
    }
    if (!opts.liveOnly && isLive(c.id) && results.some((r) => r.status === 'FAIL')) {
      const why = '前面已有红项：不为一份已经不合格的产物再花几十秒真跑（修完重跑；或 --live-only 单独跑）';
      results.push({ id: c.id, title: c.title, status: 'SKIP', detail: why });
      console.log(`[跳] ${c.id.padEnd(28, ' ')} ${c.title}\n     ${why}`);
      continue;
    }
    const missingNeeds = (PREREQUISITES[c.id] ?? []).filter((k) => ctx[k] === undefined);
    if (!missingNeeds.length && isLive(c.id)) {
      // 真跑门的日志很长，先声明「正在跑」，免得它的输出跑到标题上面去（读起来像别人的）。
      console.log(`[跑] ${c.id.padEnd(28, ' ')} 正在真跑（可能要 20~40 秒）…`);
    }
    if (missingNeeds.length) {
      status = 'SKIP';
      detail = `前置未就绪（${missingNeeds.join(', ')}）—— 本项没查`;
    } else {
      try {
        const r = c.fn(ctx);
        if (r && typeof r === 'object' && r.status) {
          status = r.status;
          detail = r.detail ?? '';
          meta = r.meta;
        } else {
          detail = r ?? '';
        }
      } catch (e) {
        if (e instanceof CheckSkipped) {
          status = 'SKIP';
          detail = e.message;
        } else if (e instanceof CheckFailed) {
          status = 'FAIL';
          detail = e.message;
        } else {
          status = 'FAIL';
          detail = `检查项自己抛了异常：${e?.stack ?? e}`;
        }
      }
    }
    results.push({ id: c.id, title: c.title, status, detail, ...(meta ? { meta } : {}) });
    const mark = { PASS: '[绿]', WARN: '[黄]', SKIP: '[跳]', FAIL: '[红]' }[status];
    console.log(`${mark} ${c.id.padEnd(28, ' ')} ${c.title}`);
    if (detail) {
      for (const line of String(detail).split('\n')) console.log(`     ${line}`);
    }
  }

  const count = (s) => results.filter((r) => r.status === s).length;
  const fails = results.filter((r) => r.status === 'FAIL');
  const warns = results.filter((r) => r.status === 'WARN');
  const skips = results.filter((r) => r.status === 'SKIP');

  console.log('');
  console.log('─'.repeat(72));
  console.log(`绿 ${count('PASS')} / 黄 ${count('WARN')} / 跳过 ${count('SKIP')} / 红 ${count('FAIL')}`);

  if (skips.length) {
    console.log('');
    console.log('跳过（**没查**，不是「查过了」）：');
    for (const r of skips) console.log(`  - ${r.id}：${r.detail.split('\n')[0]}`);
  }
  if (warns.length) {
    console.log('');
    console.log('需要人工确认（黄）：');
    for (const r of warns) console.log(`  - ${r.id}：${r.detail.split('\n')[0]}`);
  }

  console.log('');
  if (fails.length > 0) {
    const liveRan = results.filter((r) => isLive(r.id) && (r.status === 'PASS' || r.status === 'FAIL'));
    console.log('结论：**不满足推进条件**（有红项）。');
    console.log('影响：不推进「最新版」；旧版本仍然可以下载、可以读，没有东西被删掉。');
    console.log('红项：');
    for (const r of fails) console.log(`  - ${r.id}：${r.title}`);
    console.log('');
    if (liveRan.length) console.log(`真跑门：${liveRan.map((r) => `${r.id}=${r.status}`).join('，')}`);
    console.log('本检查**不做**的事：不推远端、不打 tag、不启用 Pages/Release、不签名、不装设备。');
    if (opts.json) console.log(JSON.stringify({ ready: false, outDir: display(outDir), results }, null, 2));
    process.exit(1);
  }

  const webRun = results.find((r) => r.id === 'live-web-e2e');
  const androidRun = results.find((r) => r.id === 'live-android-unit-tests');
  const liveGreen = webRun?.status === 'PASS' && androidRun?.status === 'PASS';
  console.log('结论：**三样产物就绪**（本地演练口径）。可以推进「最新版」。');
  if (liveGreen) {
    // ⚠️ 数字**一律取自本次运行结果**（不写死）：断言条数/用例数会随别线增加，写死会出现
    // 「门是绿的、文案在说谎」这种最难查的假象（真踩过：这里曾写死「49 例」，实际跑到 55 例）。
    const w = webRun.meta;
    const a = androidRun.meta;
    console.log(
      '本轮含真跑：E 线的 Web e2e（真无头 Chromium，站点＝out/web 的构建产物，实测 ' +
        (w ? `${w.passed}/${w.total}` : '条数以该门回执为准') +
        '）+',
    );
    console.log(
      '  Android JVM 单测（内置内容＝本次产物，强制 --rerun-tasks，实测 ' +
        (a ? `${a.tests} 例 / 失败 ${a.failures}` : '用例数以该门回执为准') +
        '）。',
    );
  } else {
    console.log(
      `⚠ 真跑门未全绿：${[webRun, androidRun]
        .map((r) => `${r?.id ?? '?'}=${r?.status ?? '没跑'}`)
        .join('，')} —— 静态断言全过，但**页面/客户端是否真能跑没被完整证明**（看上面黄色/跳过的原因）。`,
    );
  }
  console.log('诚实边界（这些都没验证过）：未推远端、未在真实 Pages/Release 上跑、');
  console.log('  未用固定签名（APK 是 debug 签名）、未在真机或模拟器上安装运行。');
  console.log('  GitHub Pages / Release 各自的缓存与生效延迟由服务商决定，本流水线**不声称原子性**。');
  if (opts.json) console.log(JSON.stringify({ ready: true, outDir: display(outDir), results }, null, 2));
  process.exit(0);
}

// 只有被当作可执行脚本直接运行时才跑主流程（`import` 它不应跑一遍检查）。
const IS_MAIN = (() => {
  try {
    return !!process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

try {
  if (IS_MAIN) main();
} catch (err) {
  console.error(`用法或运行错误：${err?.message ?? err}`);
  process.exit(2);
}
