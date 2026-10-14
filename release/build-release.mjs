#!/usr/bin/env node
// 发布流水线 F：**一次本地发布要发生什么**（本地演练用；不推远端、不签名、不发布）。
//
//   node release/build-release.mjs --content-version 2026.10.14.2
//   node release/build-release.mjs --tag content-2026.10.14.2
//   node release/build-release.mjs --version-source date
//
// 它做的事（每步都打印真实命令与关键数值，失败非零退出，绝不把失败当成功）：
//   1. 记录前置事实（源提交、工作树是否干净、应用版本、已提交的内置内容版本）
//   2. 解析 contentVersion（**来源可配置**：见 lib/version-source.mjs，没有默认值）＋单调性基线
//   3. 编译内容（调用 tools/build-content.mjs，一次）→ <out>/dist/content.json（压缩；不产边车）
//   4. 准备 Web 部署目录（<out>/web/）——内容是第 3 步那份文件的**字节复制**
//   5. 准备 Android 更新源（<out>/web/content/latest.json + 快照）——同一份字节
//   6. 构建 APK（android/ 的只读副本 + Gradle init script 注入 assets）——同一份字节
//   7. 写 <out>/release-manifest.json（本次发布的机器可读记录）
//   8. 摘要 + 下一步（就绪检查是另一个程序：release/check-ready.mjs）
//
// 硬约束（与任务书一致）：本脚本**只写 <out> 目录**，绝不修改
// content/、tools/、schema/、android/、web/ 里的任何文件 —— 它们只被读取/调用。

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import * as A from './lib/artifacts.mjs';
import {
  REPO_ROOT,
  ReleaseError,
  copyTree,
  dirBytes,
  display,
  exists,
  git,
  info,
  listTop,
  note,
  rmrf,
  run,
  runCapture,
  sha256,
  sha256File,
  step,
  warn,
  writeFileEnsured,
} from './lib/util.mjs';
import { RELEASE_TAG_HINT, resolvePreviousVersion, resolveVersionRequest } from './lib/version-source.mjs';
import { builtApkPath, gradlewCommand, prepareAndroidWorkDir } from './lib/android-work.mjs';
import { listZipEntries, readZipEntry } from './lib/zip.mjs';

const USAGE = `用法：node release/build-release.mjs [选项]

  --tag <tag 名>          **正式发布的版本来源**（用户 2026-10-16 拍板）：一个 tag 同时带两个号 ——
                          v<应用资源版本>+content-<内容版本>，例如 v0.2.0+content-2026.10.14.2
                          两个号都必须解析得出来，否则**拒绝发布**（不猜、不填默认）
  --content-version <v>   只给内容版本，形如 2026.10.14.2 —— **本地演练用途**；正式发布以 tag 为准
  --version-source date   本地演练用：UTC 当天日期 + 当天已有最大 N + 1（N 从 git tag 里数）
  --previous-version <v>  单调性基线（默认取「已提交的内置内容版本」与上次 release-manifest 里的较大者）
  --out <dir>             产物目录，默认 ${A.OUT_DEFAULT}（release/.gitignore 忽略 /out/）
  --android-src <dir>     要构建的 Android 工程，默认 android/（只读，会被复制）
  --source-date-epoch <secs>  固定编译产物的 generatedAt（Unix 秒），让「同一次发布的产物字节」可复现；
                          不传则用真实时间（于是同一份内容重复编译字节不同，哈希只在一次发布内可比）
  --skip-apk              跳过 APK 构建（内容/Web 两样照常产出；就绪检查会因此报红）
  --android-feed <mode>   是否产出远端更新清单：manifest（默认，**已定形态**）| none
                          ⚠️ 决策点 2 已拍板（2026-10-16）：**Android 保留小纸条清单**
                          （content/latest.json + content/<版本>/content.json）；Web 不再需要独立内容通道
                          （内容随壳走，更新交给 SW 生命周期）。none 只用于本地演练，不是发布形态。
  --no-android-manifest   = --android-feed none
  --online                不用 Gradle --offline（默认 offline，避免发布构建偷偷依赖网络）
  -h, --help              显示本帮助

没给 contentVersion 来源时**直接失败**：「发布时这个号由谁产生」是待用户拍板的接口
（IF-19 尾部），脚本不替你选一个默认来源。候选与代价见 docs/design/release-pipeline.md §3。
`;

/** @param {string[]} argv */
function parseArgs(argv) {
  const opts = {
    contentVersion: null,
    tag: null,
    versionSource: null,
    previousVersion: null,
    out: A.OUT_DEFAULT,
    androidSrc: 'android',
    skipApk: false,
    sourceDateEpoch: null,
    androidFeed: 'manifest',
    offline: true,
    help: false,
  };
  const need = (name, i) => {
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) throw new ReleaseError(`${name} 后面缺参数`, { code: 'USAGE' });
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--content-version': opts.contentVersion = need(a, i); i++; break;
      case '--tag': opts.tag = need(a, i); i++; break;
      case '--version-source': opts.versionSource = need(a, i); i++; break;
      case '--previous-version': opts.previousVersion = need(a, i); i++; break;
      case '--out': opts.out = need(a, i); i++; break;
      case '--android-src': opts.androidSrc = need(a, i); i++; break;
      case '--source-date-epoch':
        opts.sourceDateEpoch = need(a, i);
        i++;
        if (!/^\d+$/.test(opts.sourceDateEpoch)) {
          throw new ReleaseError(`--source-date-epoch 必须是 Unix 秒数，收到：${opts.sourceDateEpoch}`, { code: 'USAGE' });
        }
        break;
      case '--skip-apk': opts.skipApk = true; break;
      case '--android-feed':
        opts.androidFeed = need(a, i);
        i++;
        if (!['manifest', 'none'].includes(opts.androidFeed)) {
          throw new ReleaseError(`--android-feed 只接受 manifest|none，收到：${opts.androidFeed}`, { code: 'USAGE' });
        }
        break;
      case '--no-android-manifest': opts.androidFeed = 'none'; break;
      case '--online': opts.offline = false; break;
      case '-h': case '--help': opts.help = true; break;
      default:
        throw new ReleaseError(`未知选项：${a}（用 --help 看用法）`, { code: 'USAGE' });
    }
  }
  return opts;
}

const TOTAL_STEPS = 8;

// ---------- 杂项 ----------

function readAppIdentity() {
  const kts = fs.readFileSync(path.join(REPO_ROOT, 'android/app/build.gradle.kts'), 'utf8');
  const pick = (re, fallback = null) => {
    const m = re.exec(kts);
    return m ? m[1] : fallback;
  };
  return {
    versionCode: Number(pick(/versionCode\s*=\s*(\d+)/, '1')),
    versionName: pick(/versionName\s*=\s*"([^"]+)"/, '0.0.0'),
    applicationId: pick(/applicationId\s*=\s*"([^"]+)"/, 'unknown'),
  };
}

function dockerDirtyFlags() {
  const flags = {};
  for (const p of ['content', 'tools', 'schema', 'android', 'web']) {
    const out = git(['status', '--porcelain', '--', p]);
    flags[p] = out === null ? 'unknown' : out !== '';
  }
  return flags;
}

function copyOneFile(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

/** 复制一份文件并要求**字节一致**（同源的机械保证）。 */
function copyFileVerified(src, dst, label) {
  copyOneFile(src, dst);
  const a = fs.readFileSync(src);
  const b = fs.readFileSync(dst);
  if (!a.equals(b)) throw new ReleaseError(`${label}：复制后字节不一致（${display(dst)}）`, { code: 'COPY_MISMATCH' });
  return { bytes: b.length, sha256: sha256(b) };
}

function requireJava() {
  if (process.env.JAVA_HOME && exists(path.join(process.env.JAVA_HOME, 'bin'))) return process.env.JAVA_HOME;
  const probe = runCapture('java', ['-version']);
  if (probe && probe.status === 0) return '（PATH 里的 java）';
  throw new ReleaseError(
    '找不到 JDK：请设 JAVA_HOME（本机实测 C:/Users/wsqsy/.jdks/ms-17.0.17），或让 java 在 PATH 里',
    { code: 'ENV_MISSING' },
  );
}

function requireAndroidSdk(androidDir) {
  if (process.env.ANDROID_HOME && exists(process.env.ANDROID_HOME)) return `ANDROID_HOME=${process.env.ANDROID_HOME}`;
  const localProps = path.join(androidDir, 'local.properties');
  if (exists(localProps) && /sdk\.dir\s*=/.test(fs.readFileSync(localProps, 'utf8'))) {
    return `${display(localProps)} 里的 sdk.dir`;
  }
  throw new ReleaseError(
    '找不到 Android SDK：请设 ANDROID_HOME，或在 android/local.properties 里写 sdk.dir',
    { code: 'ENV_MISSING' },
  );
}

// ---------- 主流程 ----------

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(USAGE);
    return;
  }

  const outDir = path.resolve(REPO_ROOT, opts.out);
  const androidSrc = path.resolve(REPO_ROOT, opts.androidSrc);
  const startedAt = new Date();
  const steps = [];

  console.log('索斐发布流水线 F（本地演练）—— 产物目录：' + display(outDir));
  console.log('本次**不做**：推远端仓库、启用 Pages/Release、读取或生成签名私钥、装设备。');

  // ── 1. 前置事实 ────────────────────────────────────────────────
  step(1, TOTAL_STEPS, '前置事实（源提交 / 工作树 / 应用版本 / 已提交的内置内容版本）');
  const headFull = git(['rev-parse', 'HEAD']);
  const headShort = git(['rev-parse', '--short', 'HEAD']);
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  info('node', process.version);
  info('git HEAD', headFull ? `${headShort} (${branch})` : '读不到（git 不可用？）');
  const JAVA_HOME = requireJava();
  info('JAVA_HOME', JAVA_HOME);
  if (!opts.skipApk) info('Android SDK', requireAndroidSdk(androidSrc));
  const app = readAppIdentity();
  info('应用版本（android/app/build.gradle.kts）', `${app.versionName} (versionCode ${app.versionCode}), applicationId=${app.applicationId}`);
  // Web 站点版本（= SW 缓存名 + 预缓存的版本键）。2026-10-16 起发布硬要求：必须有递增，且
  // config.js 与 sw.js 两处同时改（一致性由 check-ready 的 sw-config-agree 把关）。
  const readAppVersionConstant = (file) => {
    try {
      return /APP_VERSION\s*=\s*'([^']+)'/.exec(fs.readFileSync(path.join(REPO_ROOT, file), 'utf8'))?.[1] ?? null;
    } catch {
      return null;
    }
  };
  const webAppVersion = readAppVersionConstant('web/app/config.js');
  const webSwAppVersion = readAppVersionConstant('web/sw.js');
  info('Web 站点版本 APP_VERSION', `config.js=${webAppVersion ?? '读不到'} / sw.js=${webSwAppVersion ?? '读不到'}`);
  const previousManifest = (() => {
    try {
      return JSON.parse(fs.readFileSync(A.manifestPath(outDir), 'utf8'));
    } catch {
      return null;
    }
  })();
  const previousWebAppVersion = previousManifest?.app?.webAppVersion ?? null;
  if (previousWebAppVersion) info('上一版 APP_VERSION', `${previousWebAppVersion}（来自上次的 release-manifest.json）`);
  const dirty = dockerDirtyFlags();
  for (const [p, isDirty] of Object.entries(dirty)) {
    if (isDirty === 'unknown') warn(`${p}/ 的 git 状态读不到（不确定是否干净）`);
    else if (isDirty) warn(`${p}/ 有未提交改动 —— 本次产物不能声称可复现`);
  }
  const bundledBefore = (() => {
    try {
      return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'android/app/src/main/assets/content/content.json'), 'utf8'))
        .contentVersion;
    } catch {
      return null;
    }
  })();
  info('已提交的 APK 内置内容版本', bundledBefore ?? '读不到');

  // ── 2. contentVersion 的来源与单调性基线 ───────────────────────
  step(2, TOTAL_STEPS, 'contentVersion 的来源（可配置点）与单调性基线');
  const versionReq = resolveVersionRequest({
    explicit: opts.contentVersion,
    tag: opts.tag,
    source: opts.versionSource,
  });
  info('本次 contentVersion', `${versionReq.contentVersion}    ← 来源：${versionReq.source}`);
  const prev = resolvePreviousVersion({
    explicit: opts.previousVersion,
    manifestFile: A.manifestPath(outDir),
  });
  if (prev.version) info('单调性基线（上一版）', `${prev.version}    ← 来源：${prev.source}`);
  else warn('没有可用的「上一版」基线；编译器会跳过单调性检查（这一次的版本号不会被自动拦住）');

  // ── 3. 编译内容（唯一一次）────────────────────────────────────
  step(3, TOTAL_STEPS, '编译内容（调用 tools/build-content.mjs，只此一次）');
  // 只准备 dist/ 目录，**不清空整个产物目录**：编译器自己是「先全量建到内存、成功后才临时文件+rename」，
  // 所以编译失败时上一版的 dist/web/apk/manifest 都还在（“失败保留旧版”）。
  // 踩过的坑：早期在这里 rmrf(outDir)，于是一次编译失败就把上一版 manifest 也删了 ——
  // 那既违背约定，又弄丢了下一版做单调性/APP_VERSION 递增比对的基线。
  fs.mkdirSync(path.join(outDir, 'dist'), { recursive: true });
  const compileArgs = [
    'tools/build-content.mjs',
    // 产物路径要按**本流水线的 out 目录**给（编译器 cwd 是仓库根）。
    '--out', display(A.distPath(outDir)),
    '--order', A.ORDER_STRATEGY,
    '--content-version', versionReq.contentVersion,
    // --minify：发布产物用单行压缩 JSON。两个理由：
    //   1. 站点/APK 里传的是这份字节，越小越省（本机实测 22921 → 18206 字节，-20.6%）；
    //   2. 仓库里已提交的 Android 内置产物也是压缩的（两端同源字节），
    //      流水线不压缩就会跟仓库现状不一致，每次发布都产生一份无谓的「格式差异」。
    // 代价：产物 diff 不再是逐行可读（评审看仓库内的源 Markdown 与这台机器的快照即可）。
    '--minify',
  ];
  if (prev.version) compileArgs.push('--previous-version', prev.version);
  const compile = run(process.execPath, compileArgs, {
    cwd: REPO_ROOT,
    env: opts.sourceDateEpoch ? { ...process.env, SOURCE_DATE_EPOCH: opts.sourceDateEpoch } : process.env,
  });
  steps.push({ name: '编译内容', command: `node ${compileArgs.join(' ')}`, seconds: compile.seconds });

  const distFile = A.distPath(outDir);
  if (!exists(distFile)) throw new ReleaseError(`编译「成功」但没有产物：${display(distFile)}`, { code: 'NO_ARTIFACT' });
  const distBuf = fs.readFileSync(distFile);
  const distSha = sha256(distBuf);
  const distDoc = JSON.parse(distBuf.toString('utf8'));
  const poemCount = Array.isArray(distDoc.poems) ? distDoc.poems.length : 0;
  if (distDoc.contentVersion !== versionReq.contentVersion) {
    throw new ReleaseError(
      `产物里的 contentVersion (${distDoc.contentVersion}) 与本次发布要求的 (${versionReq.contentVersion}) 不一致`,
      { code: 'VERSION_MISMATCH' },
    );
  }
  if (poemCount === 0) throw new ReleaseError('产物里一首诗都没有，拒绝继续', { code: 'EMPTY_CONTENT' });
  info('产物', `${A.DIST_REL}  ${distBuf.length} 字节  sha256=${distSha}`);
  info('内容', `formatVersion=${distDoc.formatVersion}  contentVersion=${distDoc.contentVersion}  poems=${poemCount}  dynasties=${distDoc.dynasties?.length}  generatedAt=${distDoc.generatedAt}`);
  if (distDoc.formatVersion !== A.SUPPORTED_FORMAT_VERSION) {
    warn(`产物 formatVersion=${distDoc.formatVersion}，而流水线约定客户端只支持 ${A.SUPPORTED_FORMAT_VERSION} —— 就绪检查会报红，需要人工确认`);
  }
  // 不再产出 dist/content.json.sha256（2026-10-16 已定：Web/侧车不产出、不检查、不登记）。
  // 规范产物的完整性由「每处副本都逐字节比对 + 取回重建对比」保证，不靠一个没人消费的文件。

  // ── 4. Web 部署目录 ───────────────────────────────────────────
  step(4, TOTAL_STEPS, '准备 Web 部署目录（内容＝第 3 步那份文件的字节复制）');
  const webOut = A.webDir(outDir);
  rmrf(webOut);
  fs.mkdirSync(webOut, { recursive: true });
  const copied = [];
  for (const item of A.DEPLOY_ALLOWLIST) {
    const src = path.join(REPO_ROOT, 'web', item);
    const dst = path.join(webOut, item);
    if (!exists(src)) throw new ReleaseError(`web/ 里缺少部署白名单条目：${item}`, { code: 'DEPLOY_SOURCE_MISSING' });
    const st = fs.statSync(src);
    if (st.isDirectory()) {
      copyTree(src, dst, {
        filter: (from) => !A.DEPLOY_DENYLIST.includes(path.basename(from)),
      });
    } else {
      copyOneFile(src, dst);
    }
    copied.push(item);
  }
  info('复制自 web/', copied.join(', '));
  const webContent = copyFileVerified(distFile, path.join(webOut, A.WEB_CONTENT_NAME), 'Web 内容同源');
  // 不再产出 web/content.json.sha256（2026-10-16 用户拍板，负责人转达）：
  // 内容与壳同处一个 SW 缓存、成对切换，校验靠「同一次部署 + HTTPS + 预缓存整体性」；
  // 留一个没人消费的边车只会让人以为还有一道校验环节。Android 侧的清单 sha256 仍然保留（那是真在用的）。
  info('部署内容', `${A.WEB_CONTENT_NAME}  ${webContent.bytes} 字节  sha256=${webContent.sha256}（与 dist 字节一致）`);
  note('Web 侧**不产出** sha256 边车（已定）；Android 小纸条清单里的 sha256 保留');
  const leaked = (listTop(webOut) ?? []).filter((n) => A.DEPLOY_DENYLIST.includes(n));
  if (leaked.length) throw new ReleaseError(`Web 部署目录里出现了不该发布的条目：${leaked.join(', ')}`, { code: 'DEPLOY_LEAK' });
  info('部署目录顶层', (listTop(webOut) ?? []).join(', '));

  // ── 5. 远端更新清单（**接口待定：决策点 2**，因此是一个可开可关的步骤）─────────────────────────────
  step(5, TOTAL_STEPS, '准备远端更新清单（决策点 2 未定 → 本步可关）');
  let latest = null;
  let snapInfo = null;
  if (opts.androidFeed === 'none') {
    warn('--android-feed none：本次**不**产出远端更新清单与快照。');
    note('若决策点 2 最终选「保持两端现状」或「统一到有清单」，就必须改回 manifest —— 这一步是可配置的，没有写死。');
  } else {
    const snapshot = A.androidSnapshotInWeb(outDir, versionReq.contentVersion);    snapInfo = copyFileVerified(distFile, snapshot, 'Android 快照同源');
    const androidUrl = A.androidSnapshotUrl(versionReq.contentVersion);
    latest = {
      formatVersion: distDoc.formatVersion,
      contentVersion: distDoc.contentVersion,
      url: androidUrl,
      sha256: distSha,
      size: distBuf.length,
      minAppVersionCode: app.versionCode,
    };
    writeFileEnsured(A.androidManifestInWeb(outDir), JSON.stringify(latest, null, 2) + '\n');
    info('快照', `${display(snapshot)}  ${snapInfo.bytes} 字节  sha256=${snapInfo.sha256}`);
    info('清单', `${A.ANDROID_MANIFEST_REL_IN_WEB}  url=${androidUrl}`);
    note('url 是**相对清单自身所在目录**的路径 —— Android 端 ContentUpdater.resolveUrl() 用清单 URL 作基址解析（见 docs/design/release-pipeline.md §9 的接口不一致记录）');
  }

  // ── 6. APK（同一份字节，注入 assets）──────────────────────────
  step(6, TOTAL_STEPS, '构建 APK（android/ 的只读副本 + 注入 assets）');
  let apk = null;
  if (opts.skipApk) {
    warn('--skip-apk：本次不构建 APK。就绪检查会因此报红，不得推进最新版。');
  } else {
    const work = prepareAndroidWorkDir({ outDir, androidSrc, distFile });
    info(
      '只读副本',
      `${display(work.projectDir)}（android/ 本身一个字节都没被写；${work.recreated ? '本次重建' : '复用上次副本'}）`,
    );
    info('内置内容已就位', `${display(work.assetFile)}  ${work.contentBytes} 字节  sha256=${work.contentSha256}（与 dist 字节一致）`);
    note('同一个文件既是 APK 的 assets、也是 ContentParserTest 的输入 —— 一处替换、两处一致（详见 release/lib/android-work.mjs）');

    const gradlew = gradlewCommand();
    const gradleArgs = ['assembleDebug'];
    if (opts.offline) gradleArgs.push('--offline');
    const build = run(gradlew, gradleArgs, { cwd: work.projectDir });
    steps.push({ name: '构建 APK', command: `${gradlew} ${gradleArgs.join(' ')}`, seconds: build.seconds });

    const builtApk = builtApkPath(work.projectDir);
    if (!exists(builtApk)) throw new ReleaseError(`Gradle 成功但没有 APK：${display(builtApk)}`, { code: 'NO_ARTIFACT' });
    const apkBuiltIn = readApkBuiltInContent(fs.readFileSync(builtApk), builtApk);
    if (apkBuiltIn.sha256 !== distSha) {
      throw new ReleaseError(
        [
          'APK 内置内容与本次发布的 content.json **不是同一份字节** —— 拒绝继续：',
          `  APK 内 assets/content/content.json: ${apkBuiltIn.sha256}`,
          `  本次发布 dist/content.json      : ${distSha}`,
          '（注入没有生效、或注入的是陈旧副本。这正是 android/README §4 那道门要拦的事故。）',
        ].join('\n'),
        { code: 'APK_CONTENT_MISMATCH' },
      );
    }
    info('APK 内置内容校验', `${apkBuiltIn.entry}  ${apkBuiltIn.bytes} 字节  sha256=${apkBuiltIn.sha256} == dist ✓`);    const apkName = A.apkFileName(versionReq.contentVersion);
    const apkPath = path.join(A.apkDir(outDir), apkName);
    rmrf(A.apkDir(outDir)); // 上一版的 APK 不是本次产物，不留在同一个目录里混着
    copyOneFile(builtApk, apkPath);
    apk = {
      path: `${A.APK_DIR_REL}/${apkName}`,
      bytes: fs.statSync(apkPath).size,
      sha256: sha256File(apkPath),
      builtInContentEntry: apkBuiltIn.entry,
      builtInContentSha256: apkBuiltIn.sha256,
      builtInContentBytes: apkBuiltIn.bytes,
      buildType: 'debug',
      signing: 'debug（正式发布必须换成固定签名才能覆盖升级；本轮未读/未生成任何私钥）',
      gradleCommand: `${gradlew} ${gradleArgs.join(' ')}`,
    };
    info('APK', `${apk.path}  ${apk.bytes} 字节  sha256=${apk.sha256}`);
    warn('这个 APK 是 **debug 签名**，只用于本地演练；它不能作为正式发布产物。');
  }

  // ── 7. 发布清单 ───────────────────────────────────────────────
  step(7, TOTAL_STEPS, '写本次发布的机器可读清单');
  for (const f of [A.distPath(outDir), path.join(webOut, A.WEB_CONTENT_NAME)]) {
    if (!exists(f)) throw new ReleaseError(`清单前自检失败：缺 ${display(f)}`, { code: 'NO_ARTIFACT' });
  }
  if (opts.androidFeed !== 'none' && !exists(A.androidManifestInWeb(outDir))) {
    throw new ReleaseError(`清单前自检失败：缺 ${display(A.androidManifestInWeb(outDir))}`, { code: 'NO_ARTIFACT' });
  }
  const outManifest = {
    pipeline: 'release/build-release.mjs',
    pipelineVersion: 1,
    releaseStartedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    contentVersion: versionReq.contentVersion,
    versionSource: versionReq.source,
    releaseTag: {
      name: opts.tag ?? null,
      appVersion: versionReq.appVersion ?? null,
      // tag 是**正式发布**的版本锚点；显式传 --content-version 只用于本地演练。
      isReleaseAnchor: Boolean(versionReq.appVersion),
      expectedFormat: RELEASE_TAG_HINT,
    },
    previousVersion: prev.version,
    previousVersionSource: prev.source,
    formatVersion: distDoc.formatVersion,
    poemCount,
    dynastyCount: distDoc.dynasties?.length ?? 0,
    bytes: distBuf.length,
    sha256: distSha,
    generatedAt: distDoc.generatedAt,
    sourceDateEpoch: opts.sourceDateEpoch,
    orderStrategy: A.ORDER_STRATEGY,
    sourceCommit: headFull,
    sourceCommitShort: headShort,
    sourceBranch: branch,
    dirtyAtReleaseTime: dirty,
    bundledContentVersionBefore: bundledBefore,
    app: { ...app, webAppVersion, webSwAppVersion, tagAppVersion: versionReq.appVersion ?? null, previousWebAppVersion, buildType: 'debug', signed: false },
    steps,
    artifacts: [
      { role: 'content-json', path: A.DIST_REL, bytes: distBuf.length, sha256: distSha },
      { role: 'web-deploy-dir', path: A.WEB_DIR_REL, ...dirBytes(webOut) },
      { role: 'web-content', path: `${A.WEB_DIR_REL}/${A.WEB_CONTENT_NAME}`, bytes: webContent.bytes, sha256: webContent.sha256 },
      ...(latest
        ? [
            {
              role: 'android-manifest',
              path: `${A.WEB_DIR_REL}/${A.ANDROID_MANIFEST_REL_IN_WEB}`,
              sha256: sha256File(A.androidManifestInWeb(outDir)),
            },
            {
              role: 'android-snapshot',
              path: `${A.WEB_DIR_REL}/${A.ANDROID_SNAPSHOT_DIR_REL_IN_WEB}/${versionReq.contentVersion}/${A.WEB_CONTENT_NAME}`,
              bytes: snapInfo.bytes,
              sha256: snapInfo.sha256,
            },
          ]
        : []),
    ],
    apk,
    androidFeed: opts.androidFeed,
    androidManifest: latest,
    deployAllowlist: A.DEPLOY_ALLOWLIST,
    verifiedBy: 'release/check-ready.mjs',
    honestlyNotDone: [
      '未推送任何远端、未创建 tag/Release、未启用 Pages',
      '未使用固定签名（APK 是 debug 签名）',
      '未在真实 Pages / 真实 CDN 上部署验证',
      '未在真机或模拟器上安装运行',
    ],
  };
  writeFileEnsured(A.manifestPath(outDir), JSON.stringify(outManifest, null, 2) + '\n');
  info('清单', `${A.MANIFEST_REL}（${fs.statSync(A.manifestPath(outDir)).size} 字节）`);

  // ── 8. 摘要 ───────────────────────────────────────────────────
  step(8, TOTAL_STEPS, '摘要');
  const rows = [
    ['内容 JSON', A.DIST_REL, `${distBuf.length} 字节`],
    ['Web 部署目录', `${A.WEB_DIR_REL}/`, `${dirBytes(webOut).files} 个文件（含单独取的内容 content.json）`],
    [
      '远端更新清单',
      latest ? `${A.WEB_DIR_REL}/${A.ANDROID_MANIFEST_REL_IN_WEB}` : '（--android-feed none，未产出）',
      latest ? `+ content/${versionReq.contentVersion}/content.json` : '接口待定（决策点 2）',
    ],
    ['APK', apk ? apk.path : '（--skip-apk 跳过）', apk ? `${apk.bytes} 字节` : '-'],
  ];
  for (const [a, b, c] of rows) console.log(`  ${a.padEnd(14, ' ')} ${String(b).padEnd(44, ' ')} ${c}`);
  console.log('');
  console.log(`  contentVersion = ${versionReq.contentVersion}（来源：${versionReq.source}）`);
  console.log(`  sha256(dist/content.json) = ${distSha}`);
  console.log('');
  if (!apk) warn('本次没有 APK ⇒ 就绪检查必然报红 ⇒ 不得推进最新版。');
  console.log(`下一步：node release/check-ready.mjs --out ${display(outDir)}`);
}

function readApkBuiltInContent(apkBuf, apkPath) {
  const entry = 'assets/content/content.json';
  let hit;
  try {
    hit = readZipEntry(apkBuf, entry);
  } catch (err) {
    throw new ReleaseError(`读 APK 失败（${display(apkPath)}）：${err.message}\n  归档内条目：${listZipEntries(apkBuf).join(', ')}`, {
      code: 'APK_READ_FAILED',
    });
  }
  if (!hit) {
    const names = listZipEntries(apkBuf).filter((n) => n.startsWith('assets/'));
    throw new ReleaseError(
      `APK 里找不到 ${entry} —— 内置内容没有打进包。assets/ 下现有：${names.length ? names.join(', ') : '（空）'}`,
      { code: 'APK_NO_BUILTIN_CONTENT' },
    );
  }
  return { entry, bytes: hit.data.length, sha256: sha256(hit.data), method: hit.method };
}

// 只有被当作可执行脚本直接运行时才跑主流程：`import` 它（测试、复用）不应该跑一次发布。
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
  if (err instanceof ReleaseError && err.code === 'USAGE') {
    console.error(`用法错误：${err.message}`);
    process.exit(2);
  }
  console.error('');
  if (err instanceof ReleaseError) {
    console.error(`✗ 发布构建失败 [${err.code}]：${err.message}`);
  } else {
    console.error(`✗ 发布构建异常终止：${err?.stack ?? err}`);
  }
  process.exit(1);
}
