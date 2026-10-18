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
import { REPO_ROOT, display, exists, git, listTop, runCapture, sha256 } from './lib/util.mjs';
import { RELEASE_VERSION_RE } from './lib/version-source.mjs';
import { compareContentVersion } from '../tools/lib/version.mjs';
import { LIVE_CHECK_IDS, findE2EDeployFiles, runAndroidUnitTests, runMarkdownConformance, runWebE2E } from './lib/live.mjs';
import { downloadLiveContentFile, readLiveAppVersion } from './lib/live-version.mjs';
import {
  checkSwCacheNameShape, classifyWebChanges, compareAgainstBaselines, parseChangedPaths,
  pickSameAppBaseline, readAppVersionConstant, readContentRevision,
} from './lib/content-refresh.mjs';
import { decideSigning } from './lib/apksigner.mjs';
import { listZipEntries, readZipEntry } from './lib/zip.mjs';

const USAGE = `用法：node release/check-ready.mjs [选项]

  --out <dir>   产物目录，默认 ${A.OUT_DEFAULT}
  --skip-live   不跑两个「真跑」门（Web e2e、Android 单测）—— 它们会标黄，不会当成通过
  --live-only   只跑那两个「真跑」门（迭代时用，跳过静态检查）
  --same-app-content-refresh   **同 app 版本的内容刷新**（2026-10-16 用户拍板）：
                            · **APK 五门照旧真跑**（本次确实产出 APK，只是同版本号重打包）；
                            · 不做 app-version-bumped / apk-versioncode-bumped（那两条的前提是“号要递增”），
                              改为**正面断言号**没有变**：APP_VERSION == 线上现值（取自线上站点）、
                              versionCode == 同一个 app 版本的**旧发布 tag** 里的值（读 git tag，不写死数字）；
                            · 新增「**代码没被额外改**」：android/ 产品源码与那一个旧 tag 逐字节相同（只许
                              assets/content/content.json 变）；Web 只许修订盖章相关的文件变（其余产品文件冻住）；
                            · 新增「内容相对线上真值与基线发布**严格递增**」＋「已发布作品逐字节未变」；
                            · 结论行写「same-app 内容刷新就绪」，不得混说成升版发布。
                            门对照见 docs/design/same-app-content-refresh.md
  --json        末尾额外打印一份机器可读的结果
  -h, --help    显示本帮助
`;

class CheckFailed extends Error {}
class CheckSkipped extends Error {}

function parseArgs(argv) {
  const opts = {
    out: A.OUT_DEFAULT,
    json: false,
    help: false,
    skipLive: false,
    liveOnly: false,
    sameAppRefresh: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') {
      const v = argv[++i];
      if (v === undefined) throw new Error('--out 后面缺参数');
      opts.out = v;
    } else if (a === '--json') opts.json = true;
    else if (a === '--skip-live') opts.skipLive = true;
    else if (a === '--content-only' || a === '--live-only') {
      if (a === '--content-only') {
        throw new Error(
          '--content-only 已作废（用户 2026-10-16 纠正：「应该更新 Release 和 apk」）：\n'
            + '  改用 --same-app-content-refresh —— 本模式**仍要真跑 APK 五门**。',
        );
      }
      opts.liveOnly = true;
    } else if (a === '--same-app-content-refresh') opts.sameAppRefresh = true;
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
  'apk-signing': ['apkFile', 'manifest'],
  'content-revision-stamped': ['manifest'],
  'same-app-baseline-tag': ['manifest'],
  'same-app-app-version-unchanged': ['manifest'],
  'same-app-version-code-unchanged': ['manifest'],
  'same-app-android-source-identical': ['manifest'],
  'same-app-web-source-scope': ['manifest'],
  'same-app-content-delta': ['dist', 'manifest'],
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
    fail(
      '跑不了 C 线的 schema 校验：项目本地缺 ajv —— 这是「没查」，不是「查过」。\n' +
        '   本地：在仓库根执行 `npm install`（或 `npm ci`）；**CI：在就绪检查之前加一步 `npm ci`**（ajv 是 devDependency，不进仓库）。',
    );
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

check('order-in-source', '组内次序：数组次序 + orderInSource 升序（**逐组**核；不认任何拼音名次键）', (c) => {
  const strategy = c.manifest.orderStrategy;
  if (strategy !== 'source') skip(`本次构建的排序策略是 ${strategy}，不是 source —— orderInSource 的升序前提不成立`);
  const poems = c.dist.poems ?? [];
  if (poems.length === 0) fail('产物里一首诗都没有');
  // ⚠ 2026-10-16（发布 0.1.3 时改）：真实内容现在**多个组**（汉 19 首 ＋ 近现代 1 首）。
  //   原来把整份产物当单组、并要求「有值的必须排在前面」⇒ 第二组里那首**本来就没写** orderInSource
  //   （该键**可选**，不替用户编）会被误判为不合格。正确的口径是**逐组**核：组内先有值（严格升序）。
  const groups = new Map();
  for (const p of poems) {
    if (!groups.has(p.dynasty)) groups.set(p.dynasty, []);
    groups.get(p.dynasty).push(p);
  }
  const declared = c.dist.dynasties ?? [];
  const order = [...groups.keys()];
  if (JSON.stringify(order) !== JSON.stringify(declared)) {
    fail(`产物里的组次序 ${JSON.stringify(order)} ≠ 顶层 dynasties ${JSON.stringify(declared)}（组序应由注册表 order 决定）`);
  }
  const has = (o) => o !== null && o !== undefined;
  const summary = [];
  for (const [name, list] of groups) {
    const values = list.filter((p) => has(p.orderInSource));
    const nulls = list.filter((p) => !has(p.orderInSource));
    const lastValue = list.reduce((acc, p, i) => (has(p.orderInSource) ? i : acc), -1);
    const firstNull = list.findIndex((p) => !has(p.orderInSource));
    if (firstNull !== -1 && firstNull < lastValue) {
      fail(`组「${name}」：有 orderInSource 的诗必须排在该组无值诗之前，但第 ${firstNull + 1} 项没有值、第 ${lastValue + 1} 项有值`);
    }
    for (let k = 1; k < values.length; k++) {
      if (!Number.isInteger(values[k].orderInSource) || !Number.isInteger(values[k - 1].orderInSource)) {
        fail(`组「${name}」orderInSource 不是整数：${JSON.stringify(values[k].orderInSource)}`);
      }
      if (values[k].orderInSource <= values[k - 1].orderInSource) {
        fail(`组「${name}」orderInSource 不是升序：${values[k - 1].orderInSource} → ${values[k].orderInSource}`);
      }
    }
    summary.push(`「${name}」${values.length}/${list.length} 首有值${values.length ? `（${values[0].orderInSource}…${values[values.length - 1].orderInSource}）` : ''}`);
  }
  return `${summary.join('，')}；组序 ${JSON.stringify(declared)}；各组内无值的排在组内最后`;
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
  // （旧门一字未改：上面四条断言都在。下面只是**追加**内容修订的对账 —— 少了它，
  //  「同 app 版本重发内容」时缓存名不变、浏览器根本不装新 SW，而所有旧门都还是绿的。）
  const rev = (rel) => readContentRevision(fs.readFileSync(path.join(dir, rel), 'utf8'));
  const cfgRev = rev('app/config.js');
  const swRev = rev('sw.js');
  if (!cfgRev || !swRev) {
    fail(
      `读不到 CONTENT_REVISION（config.js=${JSON.stringify(cfgRev)} / sw.js=${JSON.stringify(swRev)}）——\n`
      + '   发布构建应当把它盖章为本次 contentVersion；读不到说明没盖章，站点缓存名不会随内容变。',
    );
  }
  if (cfgRev !== swRev) fail(`CONTENT_REVISION 两处不一致：config.js=${cfgRev} / sw.js=${swRev}（缓存名由两处共同决定）`);
  if (cfgRev !== c.manifest.contentVersion) {
    fail(
      `盖在站点里的内容修订 ${cfgRev} ≠ 本次 contentVersion ${c.manifest.contentVersion}\n`
      + '   盖章必须就是这次发布的内容版本，否则缓存名里写着另一个版本的号，排查时必然误导。',
    );
  }
  const shape = checkSwCacheNameShape(fs.readFileSync(path.join(dir, 'sw.js'), 'utf8'));
  if (!shape.ok) fail(`sw.js 的缓存名没有同时带应用版本与内容修订：${shape.detail}`);
  const prefix = /CACHE_PREFIX\s*=\s*'([^']*)'/.exec(fs.readFileSync(path.join(dir, 'sw.js'), 'utf8'))?.[1] ?? null;
  if (prefix !== A.WEB_CACHE_PREFIX) {
    fail(`sw.js 的缓存名前缀变成了 ${JSON.stringify(prefix)}（应为 ${A.WEB_CACHE_PREFIX}）——`
      + ' activate 靠这个前缀认“自己的旧 cache”，变了就会删错/不删别人的数据。');
  }
  return `config.js = sw.js = ${cfg}；内容修订 = ${cfgRev}（= contentVersion）；${shape.detail}`
    + `${tagApp ? `，与 tag ${tagApp} 一致` : '（本次没给 tag：本地演练；正式发布以 tag 为准）'}`;
});

check('app-version-bumped', 'APP_VERSION 比上一版大（同版本重发会让浏览器沿用旧 cache）', (c) => {
  const current = c.manifest.app?.webAppVersion ?? null;
  if (!current) fail('清单里没有记录本次的 APP_VERSION —— 构建时就读不到，说明文件结构变了');
  if (!/^\d+(\.\d+)*$/.test(current)) fail(`APP_VERSION=${current} 不是数值段形式，无法判断是否递增`);

  // 基线优先取「同一产物目录里上一份 manifest」（离线、权威）；**没有时改读线上站点**。
  // 2026-10-15 补的真缺口：CI 从空目录构建 ⇒ 原先只会 skip，真发布路径上不设防。
  let prev = c.manifest.app?.previousWebAppVersion ?? null;
  let source = prev ? '同一产物目录里上一份 release-manifest.json' : null;
  if (!prev) {
    const live = readLiveAppVersion();
    if (!live.version) {
      return {
        status: 'WARN',
        detail:
          `本次 APP_VERSION=${current}，但**拿不到任何基线**：本产物目录里没有上一份 manifest，也读不到线上站点（${live.error}）。\n` +
          '   ⇒ **这一门没查，不是通过**。两条路任选：① 构建时保留上一次的 `release-manifest.json`（与产物同目录）；\n' +
          '   ② 让本机/CI 能访问线上站点（或用 `SUOFEI_SITE_URL` 指定站点根）。',
      };
    }
    prev = live.version;
    source = `线上站点 ${live.siteUrl}/app/config.js（站点地址来源：${live.source}）`;
  }

  const cmp = compareAppVersion(current, prev);
  if (cmp === null) fail(`APP_VERSION 不好比：本次 ${current} / 上一版 ${prev}（来源：${source}）`);
  if (cmp <= 0) {
    fail(
      `APP_VERSION 没递增：本次 ${current} ≤ 上一版 ${prev}\n` +
        `   （基线与来源：${source}）\n` +
        '   （内容与壳在同一个 pc-resources-<APP_VERSION> cache 里成对切换；同版本重发会让浏览器沿用旧 cache）',
    );
  }
  return `本次 ${current} > 上一版 ${prev}（基线来源：${source}）`;
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

check('apk-signing', 'APK 的签名：release 变体不得是 debug 证书；debug 变体如实标为「不能用于正式发布」', (c) => {
  // 这条防的正是「以为发的是正式签名包、实际是 debug 包」。
  const variant = c.manifest.app?.androidVariant ?? 'debug';
  const apk = c.apk;
  if (variant !== 'release') {
    // 不是错误，但绝不是「可发布」：标黄，让结论行不得声称可正式发布。
    return {
      status: 'WARN',
      detail:
        `本次变体＝\`${variant}\`：**debug 签名**，不能用于正式发布（演练口径）。\n` +
        '   正式发布的签名断言只在 `--android-variant release` 时执行（那时用 apksigner 读出证书 DN 并拒 debug 证书）。',
    };
  }
  if (/-debug\.apk$/i.test(apk.path)) fail(`release 变体的产物文件名却带 -debug：${apk.path}（变体接错了）`);
  const apksigner = findApksigner();
  if (!apksigner) {
    return {
      status: 'WARN',
      detail:
        '环境不可用：找不到 apksigner（ANDROID_HOME/build-tools/*）—— **本门没跑**，无法确认这份 release 包的签名。\n' +
        '   正式发布前必须在有 build-tools 的机器上重跑本门（或由 CI 跑）。',
    };
  }
  const r = runCapture(apksigner, ['verify', '--print-certs', c.apkFile]);
  const out = `${r?.stdout ?? ''}${r?.stderr ?? ''}`;
  // 三路判定抽到 release/lib/apksigner.mjs（纯函数，用**两个平台的真实样本**自测：
  // release/selftest-apksigner.mjs）。关键：**验签通过、只是读不出 DN ⇒ 黄**，
  // 不能把「解析失败」当成「签名不合格」（CI 上真踩过：Windows 前缀 `Signer #N`、Linux 前缀 `V2 Signer:`）。
  const decision = decideSigning({ verifyOk: Boolean(r) && r.status === 0, exitCode: r?.status ?? null, output: out });
  if (decision.status === 'FAIL') fail(decision.detail);
  if (decision.status === 'WARN') return { status: 'WARN', detail: `${decision.detail}\n   变体 release。` };
  return `apksigner verify 通过｜变体 release｜证书 DN：${decision.dns.join(' / ')}`;
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

// `versionCode` 递增（2026-10-16 新增，正式发布 0.1.2 时落定：**每次 +1**，不引入公式）。
// 为何需要它：`apk-identity` 只校「APK 与清单一致」，**挡不住同号重发** —— 已装旧版的用户会因
// `versionCode` 不大于已装值而**装不上**，而这是“看着都绿、实际发不出去”的典型形状。
// 基线取**仓库里已有的发布 tag**：一只手源、离线可查，不依赖“上一份 manifest”（那个在 CI 从空目录
// 构建时会缺，`app-version-bumped` 已经蹈过一次那个坑）。
check('apk-versioncode-bumped', 'APK 的 versionCode 严格大于**已有发布 tag**里的值（防同号重发：旧的装不上新的）', (c) => {
  const code = Number(c.manifest.app?.versionCode);
  if (!Number.isFinite(code)) return skip('清单里没有 versionCode（上面已报）');
  const selfTag = c.manifest.releaseTag?.name ?? null;
  const tags = (runCapture('git', ['tag', '-l', 'v*'])?.stdout ?? '')
    .split('\n').map((s) => s.trim())
    // ⚠ **排除本次正在发的那个 tag**：CI 的 checkout 是 `fetch-depth: 0`，那个 tag 也在本地 ⇒
    //   不过滤就会拿「自己这棵树里的 versionCode」当基线，永远相等、永远报红。
    //   （这不是推演：0.1.2 首次上 CI 就报到这一步，见发布回执。）
    .filter((t) => t && t !== selfTag);
  if (tags.length === 0) {
    return { status: 'WARN', detail: `除本次 tag 外没有任何历史发布 tag ⇒ 拿不到上一版的值，**本门没查**（不等于查过）。` };
  }
  const readings = [];
  for (const t of tags) {
    const r = runCapture('git', ['show', `${t}:android/app/build.gradle.kts`]);
    const m = r?.status === 0 ? /versionCode\s*=\s*(\d+)/.exec(r.stdout ?? '') : null;
    if (m) readings.push({ tag: t, code: Number(m[1]) });
  }
  if (readings.length === 0) {
    return { status: 'WARN', detail: `读不到任何发布 tag 里的 versionCode（tag：${tags.join('、')}）—— 本门没查。` };
  }
  const prev = readings.reduce((a, b) => (b.code > a.code ? b : a));
  if (code <= prev.code) {
    fail(`本版 versionCode=${code} **不大于**已发布过的 ${prev.code}（tag ${prev.tag}）：`
      + '装了旧版的用户会因「版本不更大」而**装不上**这一版。请每次发布 +1。');
  }
  return `${prev.code}（tag ${prev.tag}）→ ${code}（+${code - prev.code}）`;
});

// ─────────────── 同 app 版本的内容刷新（--same-app-content-refresh）专用门 ───────────────
// 这些门**只在**该模式登记（默认「正常升版」模式一字不改）。它们的共同主张是：
//   「这一版对外就是 0.1.3 / code 4，应用代码没变，变的是内容」——
//   所以每一条都是**正面断言那个“没变”**，而不是把旧门关掉。

/** 同 app 版本旧发布 tag 里的一手事实（versionCode / versionName / APP_VERSION）。 */
check('same-app-baseline-tag', '同 app 版本的旧发布 tag 可查（versionCode 与源码基线的唯一来源）', (c) => {
  const appVersion = c.manifest.app?.webAppVersion ?? null;
  if (!appVersion) fail('清单里没有本次 APP_VERSION —— 读不到就无法挑基线');
  const tagOutput = git(['tag', '-l']);
  if (tagOutput === null) fail('git tag 读不到（CI 需要 actions/checkout 的 fetch-depth: 0；本地要在仓库里跑）');
  const baseline = pickSameAppBaseline({ appVersion, tagOutput, currentTag: c.manifest.releaseTag?.name ?? null });
  if (!baseline) {
    fail(
      `没有任何「v${appVersion}+content-*」形式的历史发布 tag ⇒ 拿不到 versionCode 与源码基线。\n`
      + '   本模式的意义就是「与那一个已发布版本逐字节比」；没有基线就只能“没查”，而没查不算通过。',
    );
  }
  const kts = git(['show', `${baseline.tag}:android/app/build.gradle.kts`]);
  if (!kts) fail(`读不到 tag ${baseline.tag} 的 android/app/build.gradle.kts`);
  const code = Number(/versionCode\s*=\s*(\d+)/.exec(kts)?.[1] ?? NaN);
  const versionName = /versionName\s*=\s*"([^"]+)"/.exec(kts)?.[1] ?? null;
  if (!Number.isInteger(code)) fail(`tag ${baseline.tag} 里读不到 versionCode`);
  const cfgText = git(['show', `${baseline.tag}:web/app/config.js`]) ?? '';
  const baselineAppVersion = readAppVersionConstant(cfgText);
  c.sameAppBaseline = { ...baseline, versionCode: code, versionName, appVersion: baselineAppVersion };
  return `基线 tag ${baseline.tag}（内容 ${baseline.contentVersion}）：versionCode=${code} versionName=${versionName} APP_VERSION=${baselineAppVersion}`
    + (baseline.all.length > 1 ? `（同 app 版本的发布共 ${baseline.all.length} 个，取内容版本最大者）` : '');
}, ['manifest']);

check('same-app-app-version-unchanged', '**正面断言应用版本没变**：APP_VERSION == 线上站点现值 == 基线 tag 里的值', (c) => {
  const base = c.sameAppBaseline;
  if (!base) skip('基线 tag 没就绪（上一条已报）');
  const current = readAppVersionConstant(fs.readFileSync(path.join(A.webDir(c.outDir), 'app/config.js'), 'utf8'));
  if (!current) fail('读不到产物里的 APP_VERSION');
  const live = readLiveAppVersion();
  if (!live.version) {
    fail(
      `取不到线上站点的 APP_VERSION（${live.error}）—— 本模式必须证明“应用版本没变”，\n`
      + '   拿不到线上现值就是**没有证据**，不能当通过（这是 fail-closed，不是保守）。',
    );
  }
  if (live.version !== current) fail(`线上站点 APP_VERSION=${live.version} ≠ 本次 ${current} —— 线上已经换过应用版本，本模式的前提不成立`);
  if (base.appVersion !== current) fail(`基线 tag 里的 APP_VERSION=${base.appVersion} ≠ 本次 ${current}`);
  return `线上 ${live.version} == 本次 ${current} == 基线 tag ${base.tag} 的 ${base.appVersion}（来源：${live.siteUrl}/app/config.js）`;
}, ['manifest']);

check('same-app-version-code-unchanged', '**正面断言 versionCode / versionName 没变**（基线＝同 app 版本旧 tag 里的值，不写死数字）', (c) => {
  const base = c.sameAppBaseline;
  if (!base) skip('基线 tag 没就绪（上面已报）');
  const code = Number(c.manifest.app?.versionCode);
  const name = c.manifest.app?.versionName ?? null;
  if (!Number.isInteger(code)) fail('清单里没有 versionCode');
  if (code !== base.versionCode) {
    fail(
      `本次 versionCode=${code} ≠ 基线 tag ${base.tag} 里的 ${base.versionCode}\n`
      + '   本模式要求号不变（同版本号重打包）；号变了就是升版发布，要走默认模式的全部升版门。',
    );
  }
  if (name !== base.versionName) fail(`本次 versionName=${name} ≠ 基线 tag 里的 ${base.versionName}`);
  return `versionCode ${base.versionCode} → ${code}（未变）、versionName ${base.versionName} → ${name}（未变）；基线来源 tag ${base.tag}`;
}, ['manifest']);

check('same-app-android-source-identical', '**APK 就是纯内容重打包**：android/ 与基线 tag 逐字节相同（只许 assets/content/content.json 变）', (c) => {
  const base = c.sameAppBaseline;
  if (!base) skip('基线 tag 没就绪（上面已报）');
  const ALLOWED = ['android/app/src/main/assets/content/content.json'];
  // 范围：**进 APK 的源码**。android/app/src/test/** 是 JVM 单测，**不打包进 APK**，
  // 它跟着内容变（按路径派生 id、查源文件）是这次内容线的正当改动 ⇒ 单列报告，不参与“纯重打包”判定。
  const isTestSource = (x) => x.startsWith('android/app/src/test/');
  const changed = parseChangedPaths(git(['diff', '--name-only', base.tag, '--', 'android/']) ?? '');
  const testChanged = changed.filter(isTestSource);
  const shippedChanged = changed.filter((x) => !isTestSource(x));
  const unexpected = shippedChanged.filter((x) => !ALLOWED.includes(x));
  if (unexpected.length) {
    fail(
      `android/ 下有 ${unexpected.length} 个文件与基线 tag ${base.tag} 不同 ⇒ 这不是“只重打包内容”，而是改了应用代码：\n`
      + unexpected.map((x) => `     - ${x}`).join('\n')
      + '\n   真改了代码就必须走升版发布（默认模式要求 APP_VERSION/versionCode 递增），不能用本模式。',
    );
  }
  const untracked = (git(['status', '--porcelain', '--untracked-files=all', '--', 'android/']) ?? '')
    .split('\n').filter((l) => l.startsWith('??'));
  if (untracked.length) {
    fail(`android/ 下有未跟踪文件（构建会带上它们，却不属于基线 tag）：\n${untracked.map((l) => `     ${l}`).join('\n')}`);
  }
  const inContent = shippedChanged.includes(ALLOWED[0]);
  if (!inContent) fail('android/ 的内置内容与基线 tag 相同 —— 那这次“内容刷新”没有进 APK');
  const stat = git(['diff', '--stat', base.tag, '--', ALLOWED[0]]) ?? '';
  return `相对 ${base.tag}：**进 APK 的源码**变化 ${shippedChanged.length} 个文件 = 仅 assets/content/content.json`
    + `（其余 ${shippedChanged.length - 1} 个 0 改动）；未跟踪 0 个\n`
    + `     ${stat.split('\n').filter(Boolean).slice(-1)[0] ?? ''}\n`
    + (testChanged.length
      ? `     JVM 单测源码变化 ${testChanged.length} 个（**不进 APK**，供审查）：${testChanged.map((x) => x.split('/').pop()).join('、')}`
      : '     JVM 单测源码变化 0 个');
}, ['manifest']);

check('same-app-web-source-scope', 'Web 端只改了**内容修订协议**相关的文件；渲染/解析/样式/标记与基线 tag 逐字节相同', (c) => {
  const base = c.sameAppBaseline;
  if (!base) skip('基线 tag 没就绪（上面已报）');
  const shipped = new Set((findE2EDeployFiles() ?? []).map((rel) => `web/${rel}`));
  const changed = parseChangedPaths(git(['diff', '--name-only', base.tag, '--', 'web/']) ?? '');
  const shippedChanged = changed.filter((x) => shipped.has(x));
  const notShipped = changed.filter((x) => !shipped.has(x));
  const { frozen, allowlisted, unexpected } = classifyWebChanges(shippedChanged);
  if (frozen.length) {
    fail(
      `这些**产品文件**与基线 tag ${base.tag} 不同（本模式不许动它们）：\n`
      + frozen.map((x) => `     - ${x}`).join('\n')
      + '\n   它们决定页面怎么解析/渲染/长什么样 —— 改了就不是“只换内容”。',
    );
  }
  if (unexpected.length) {
    fail(
      `这些已发布文件既不在允许清单、也不是冻结文件，却在基线 tag 之后变了：\n`
      + unexpected.map((x) => `     - ${x}`).join('\n')
      + '\n   要么它确实属于本次协议改动（在 release/lib/content-refresh.mjs 的 WEB_PRODUCT_CHANGE_ALLOWLIST 里逐条登记并写清理由），要么它不该动。',
    );
  }
  return `相对 ${base.tag}：已发布文件中允许改动 ${allowlisted.length} 个（${allowlisted.join('、') || '无'}）；`
    + `冻结文件改动 0 个；非发布文件（tests/scripts/fixtures/README 等）变化 ${notShipped.length} 个不参与判定`;
}, ['manifest']);

check('same-app-content-delta', '内容相对**线上已发布那一份**：已发布作品逐字节未变，且确有新增；组名不删不乱序', (c) => {
  const base = c.sameAppBaseline;
  if (!base) skip('基线 tag 没就绪（上面已报）');
  const workDir = path.join(c.outDir, '.work', 'baseline');
  fs.mkdirSync(workDir, { recursive: true });
  const dest = path.join(workDir, `content-${base.contentVersion}.json`);
  const dl = downloadLiveContentFile({ contentVersion: base.contentVersion, dest });
  if (!dl.ok) {
    fail(
      `取不到线上已发布的内容快照 ${base.contentVersion}（${dl.error}）——\n`
      + '   本门要比的就是“用户手里那一份”，取不到就**没查**（没查不是通过）。',
    );
  }
  const before = JSON.parse(fs.readFileSync(dest, 'utf8'));
  const after = c.dist;
  const afterById = new Map((after.poems ?? []).map((x) => [x.id, x]));
  const missing = [];
  const modified = [];
  for (const bp of before.poems ?? []) {
    const np = afterById.get(bp.id);
    if (!np) missing.push(bp.id);
    else if (JSON.stringify(np) !== JSON.stringify(bp)) modified.push(bp.id);
  }
  if (missing.length) fail(`本次**删掉了已发布作品**：${missing.join('、')}`);
  if (modified.length) fail(`本次**改动了已发布作品的字句**：${modified.join('、')}（已发布内容只增不改）`);
  const added = (after.poems ?? []).filter((x) => !(before.poems ?? []).some((b) => b.id === x.id));
  if (added.length === 0) fail('本次相对已发布内容没有任何新增作品 —— 那这次“内容刷新”刷新了什么？');
  // 组名：基线里的组必须按同一次序仍然存在（不许删组、不许乱序）
  const seq = (sub, all) => {
    let i = 0;
    for (const x of all) if (x === sub[i]) i += 1;
    return i === sub.length;
  };
  if (!seq(before.dynasties ?? [], after.dynasties ?? [])) {
    fail(`分组次序被改了：基线 ${JSON.stringify(before.dynasties)} → 本次 ${JSON.stringify(after.dynasties)}（基线里的组必须按原次序保留）`);
  }
  return `线上 ${base.contentVersion}：${(before.poems ?? []).length} 首 / ${(before.dynasties ?? []).length} 组 `
    + `→ 本次 ${(after.poems ?? []).length} 首 / ${(after.dynasties ?? []).length} 组；`
    + `新增 ${added.length} 首（${added.map((x) => x.title).join('、')}）；已发布 ${(before.poems ?? []).length} 首逐字节未变；`
    + `快照 sha256=${dl.sha256.slice(0, 16)}…`;
}, ['dist', 'manifest']);

check('same-app-content-bumped', 'contentVersion **严格大于**线上真值与基线发布（否则已更新的客户端不会采用）', (c) => {
  const base = c.sameAppBaseline;
  if (!base) skip('基线 tag 没就绪（上面已报）');
  const live = readLiveAppVersion(); // 只为把站点地址/错误一起带出来
  const backend = compareAgainstBaselines({
    contentVersion: c.dist.contentVersion,
    liveContentVersion: base.contentVersion,
    baselineContentVersion: base.contentVersion,
  });
  if (!backend.ok) fail(`${backend.detail}（线上真值取自 ${live.siteUrl ?? '?'}/content/latest.json 对应的快照版本）`);
  return backend.detail;
}, ['dist', 'manifest']);

check('content-revision-stamped', '站点缓存名 = <前缀><APP_VERSION>+<内容修订>，且前缀未变（activate 仍只删本前缀的旧 cache）', (c) => {
  const dir = A.webDir(c.outDir);
  const sw = fs.readFileSync(path.join(dir, 'sw.js'), 'utf8');
  const shape = checkSwCacheNameShape(sw);
  if (!shape.ok) fail(`sw.js 的缓存名不含内容修订：${shape.detail}`);
  const prefix = /CACHE_PREFIX\s*=\s*'([^']*)'/.exec(sw)?.[1] ?? null;
  if (prefix !== A.WEB_CACHE_PREFIX) fail(`缓存名前缀 ${JSON.stringify(prefix)} ≠ ${A.WEB_CACHE_PREFIX}`);
  const rev = readContentRevision(fs.readFileSync(path.join(dir, 'app/config.js'), 'utf8'));
  if (rev !== c.manifest.contentVersion) fail(`内容修订 ${JSON.stringify(rev)} ≠ contentVersion ${c.manifest.contentVersion}`);
  if (rev === 'dev') fail('内容修订还是仓库默认的 dev —— 说明发布构建没盖章，同 app 版本重发时浏览器不会装新 SW');
  const app = readAppVersionConstant(fs.readFileSync(path.join(dir, 'app/config.js'), 'utf8'));
  return `缓存名 = ${prefix}${app}+${rev}；${shape.detail}`;
}, ['manifest']);

// ─────────────────────── 真跑门（慢；需要真浏览器 / 真 JVM）───────────────────────

check('live-web-e2e', '真跑：用 out/web 当站点跑 E 线自己的 Web e2e（真无头 Chromium；条数不写死，取自它的输出）', (c) => {
  const r = runWebE2E({ outDir: c.outDir, requireBaseline: Boolean(c.sameAppRefresh) });
  return r;
});

check('live-android-unit-tests', '真跑：Android JVM 单测（--rerun-tasks；内置内容＝本次产物）', (c) => {
  const r = runAndroidUnitTests({ outDir: c.outDir, androidSrc: path.join(REPO_ROOT, 'android') });
  return r;
});

// 2026-10-16 新增（负责人集成步）：Web 端「最小 Markdown 闭集」与 schema/markdown-subset.json ＋ 共用夹具的对照。
// 原由：`implementation-plan.md` S2 要求「两端同一份范围定义＋对照测试」，而 Web 侧原先**零命中**。
// 它**计入 gating**（见 live.mjs 的 LIVE_CHECK_IDS）：挡不住任何东西的门＝本项目点名的「看起来有保障、其实没有」。
check('live-markdown-conformance', '真跑：Web 端最小 Markdown 闭集 ↔ 契约(schema/markdown-subset.json) ＋ 共用夹具的对照（真无头 Chromium；契约一改就红）', (c) => {
  const r = runMarkdownConformance({ outDir: c.outDir });
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

/** 找 apksigner（build-tools 里，Windows 上是 .bat）；找不到返回 null。 */
function findApksigner() {
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
    for (const name of process.platform === 'win32' ? ['apksigner.bat', 'apksigner'] : ['apksigner']) {
      const p = path.join(bt, v, name);
      if (exists(p)) return p;
    }
  }
  return null;
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

  const ctx = { outDir, sameAppRefresh: opts.sameAppRefresh };

  // 同 app 版本模式下这两条门会被 SKIP —— 不是“放松”，而是**它们的前提被取代了**：
  //   · app-version-bumped：「APP_VERSION 必须递增」与本模式的定义（号不变）直接冲突；
  //   · apk-versioncode-bumped：「versionCode 必须大于历史值」同理。
  //   两条的前提都由**更硬的正面断言**接班：
  //   same-app-app-version-unchanged（== 线上现值）与 same-app-version-code-unchanged（== 旧 tag 里的值）。
  const SAME_APP_SKIP = {
    'app-version-bumped': '同 app 版本内容刷新：本模式的定义就是 APP_VERSION **不变**；改由 same-app-app-version-unchanged **正面断言它等于线上现值与基线 tag 的值**（比“递增”更严：必须三个值相等）',
    'apk-versioncode-bumped': '同 app 版本内容刷新：versionCode **不变**（同版本号重打包）；改由 same-app-version-code-unchanged 正面断言它等于同 app 版本旧发布 tag 里的值',
  };
  const results = [];
  const isLive = (id) => LIVE_CHECK_IDS.includes(id);
  for (const c of CHECKS) {
    if (opts.liveOnly && !isLive(c.id)) continue;
    let status = 'PASS';
    let detail = '';
    let meta;
    if (opts.sameAppRefresh && SAME_APP_SKIP[c.id]) {
      const why = SAME_APP_SKIP[c.id];
      results.push({ id: c.id, title: c.title, status: 'SKIP', detail: why });
      console.log(`[跳] ${c.id.padEnd(28, ' ')} ${c.title}\n     ${why}`);
      continue;
    }
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
  // 变体：决定结论该怎么读（debug 变体永远不能当成「可正式发布」）。
  const variant = ctx.manifest?.app?.androidVariant ?? null;

  console.log('');
  console.log('─'.repeat(72));
  // 条目总数由工具自报（不写进文档：文档里的死数会过时，而「工具报的」永远是真的）。
  console.log(`绿 ${count('PASS')} / 黄 ${count('WARN')} / 跳过 ${count('SKIP')} / 红 ${count('FAIL')}（共 ${results.length} 项）`);

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
  if (fails.length > 0) {    const liveRan = results.filter((r) => isLive(r.id) && (r.status === 'PASS' || r.status === 'FAIL'));
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
  // 结论必须**由各门的状态推出来**（不再是一句固定话）：
  //   debug 变体 ⇒ 永远是演练口径；release 变体只有在「两个真跑门 + apk-signing」都是绿时才叫就绪。
  //   **黄 = 没通过**（环境不可用/需人工确认）、**跳过 = 没查** —— 都不能被读成“可以推进”。
  const gating = [...LIVE_CHECK_IDS, 'apk-signing'].map((id) => results.find((r) => r.id === id)).filter(Boolean);
  const notGreen = gating.filter((r) => r.status !== 'PASS');
  if (opts.sameAppRefresh) {
    const sameAppGating = [
      ...LIVE_CHECK_IDS,
      'same-app-app-version-unchanged',
      'same-app-version-code-unchanged',
      'same-app-android-source-identical',
      'same-app-web-source-scope',
      'same-app-content-delta',
      'content-revision-stamped',
    ].map((id) => results.find((r) => r.id === id)).filter(Boolean);
    const sameAppNotGreen = sameAppGating.filter((r) => r.status !== 'PASS');
    if (sameAppNotGreen.length === 0) {
      const base = ctx.sameAppBaseline;
      console.log(
        `结论：**same-app 内容刷新就绪**（APK 为同版本号重打包、内置 ${ctx.dist?.poems?.length ?? '?'} 首；`
        + `APP_VERSION ${ctx.manifest?.app?.webAppVersion} / versionCode ${ctx.manifest?.app?.versionCode} 未变，`
        + `内容 ${base?.contentVersion} → ${ctx.dist?.contentVersion}）。`,
      );
      console.log('  即：可以按新 tag 建 Release 并附这个 APK；**不是**一次升版发布（应用版本与 versionCode 都没动）。');
    } else {
      console.log('结论：**不满足推进条件** —— same-app 内容刷新这些门不是绿的（黄=没跑/未确认，跳过=没查，都不能当通过）：');
      for (const r of sameAppNotGreen) console.log(`  · ${r.id} = ${r.status}：${String(r.detail).split('\n')[0]}`);
    }
  } else if (variant === 'debug') {
    console.log('结论：**演练口径就绪**（debug 变体：三样产物齐、各门过，但 **debug 签名 → 不得用于正式发布**）。');
  } else if (notGreen.length === 0) {
    console.log('结论：**三样产物就绪**（release 变体）。可以推进「最新版」。');
  } else {
    console.log(
      '结论：**暂不推进** —— 下面这些门不是绿的，' +
        '而「黄 = 没通过 / 跳过 = 没查」，都不能当成通过：\n' +
        notGreen.map((r) => `  · ${r.id} = ${r.status}`).join('\n') +
        '\n  旧版本不受影响（不推进只是不把 tag/Release 指向这一版）。',
    );
  }
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
  // 变体是 debug 时，绝不能让人把「全绿」读成「可以正式发布」。
  if (variant === 'debug') {
    console.log('⚠ 本次构建是 **debug 变体（debug 签名）**：这只是**演练口径**，不得用于正式发布；');
    console.log('   正式发布要 `--android-variant release`（四项 SUOFEI_* 由 CI 从仓库 secrets 注入，约定见 docs/design/ci-and-signing.md）。');
  } else if (variant === 'release') {
    console.log('本次构建是 **release 变体**：签名由四项 SUOFEI_* 环境变量提供；证书 DN 见上面的 apk-signing 门。');
  }
  console.log('诚实边界（这些都没验证过）：未推远端、未在真实 Pages/Release 上跑、');
  console.log(
    variant === 'release'
      ? '  未在真机或模拟器上安装运行（正式签名的证书已在 apk-signing 门验过，但安装/覆盖升级未验）。'
      : '  本次是 debug 签名（不能用于正式发布）、未在真机或模拟器上安装运行。',
  );
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
