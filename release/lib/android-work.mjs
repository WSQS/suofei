// 发布流水线 F：**Android 构建副本**的准备（构建 APK 与跑单测共用同一个副本）。
//
// 为什么要副本：`android/` 是源工程，发布不该把它弄脏（`.gradle/`、`app/build/` 都会写进去），
// 更不该把「本次发布的内容」写进仓库。所以复制一份到 `<out>/.work/android`，在那里注入内容、
// 在那里构建、在那里跑测试。
//
// 关键取舍（2026-10-16 从 Gradle init script 改成直接替换副本里的 assets）：
//   - `ContentParserTest` 用相对路径直接读 `app/src/main/assets/content/content.json`
//     （测试 JVM 的 cwd 就是 `app/`），它**不经过** assets 合并，所以覆盖 `assets.srcDirs`
//     对它无效 —— 那样会出现「APK 里是新内容、单测读的还是旧内容」的错位。
//   - 直接把本次产物写进副本的源码 assets，两个消费者（APK 打包、单测）读的就是同一个文件、
//     同一份字节。少一套机制，少一类静默失败。
//   - `android/` 一个字节都不会被写（只读地复制它）。
//
// ⚠️ 副本里的 assets 与仓库里的**故意不同**：它是「本次发布的内容」。这就是这个副本存在的意义。

import fs from 'node:fs';
import path from 'node:path';

import {
  ReleaseError,
  copyTree,
  display,
  exists,
  git,
  rmrf,
  sha256,
  sha256File,
  writeFileEnsured,
} from './util.mjs';

/** 复制时排除的目录（构建缓存/IDE 状态，与源码无关）。 */
const SKIP_BASENAMES = ['build', '.gradle', '.kotlin', '.idea'];

const STATE_NAME = 'android-work.json';

/**
 * 副本里要**逐字节等于仓库**的代码区域（故意不含 `app/src/main/assets`：那里就是要被换成本次发布的内容）。
 *
 * 为什么要这道闸：
 *   - 否则有人（包括为了把就绪检查弄绿而）改副本里的测试，结果就是自欺；
 *   - 而且「APK 是用仓库里的代码构建的」这句话会变成假的。
 */
const CODE_AREAS = [
  'app/src/test',
  'app/src/main/java',
  'app/src/main/res',
  'app/src/main/AndroidManifest.xml',
  'app/build.gradle.kts',
  'build.gradle.kts',
  'settings.gradle.kts',
  'gradle.properties',
];

/** 目录（或单文件）的「相对路径 → sha256」映射。 */
function hashTree(root) {
  const map = new Map();
  if (!exists(root)) return map;
  if (fs.statSync(root).isFile()) {
    map.set('', sha256File(root));
    return map;
  }
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(p, r);
      else if (e.isFile()) map.set(r, sha256File(p));
    }
  };
  walk(root, '');
  return map;
}

/** 返回副本与仓库在代码区域上的差异（空数组 = 一致）。 */
export function compareCodeTrees(projectDir, androidSrc) {
  const problems = [];
  for (const area of CODE_AREAS) {
    const source = hashTree(path.join(androidSrc, area));
    const copy = hashTree(path.join(projectDir, area));
    for (const [rel, hash] of copy) {
      const srcHash = source.get(rel);
      if (srcHash === undefined) problems.push(`${area}/${rel}：副本里有、仓库里没有`);
      else if (srcHash !== hash) problems.push(`${area}/${rel}：副本与仓库内容不同`);
    }
    for (const rel of source.keys()) if (!copy.has(rel)) problems.push(`${area}/${rel}：仓库里有、副本里没有`);
  }
  return problems;
}

/** 平台对应的 Gradle wrapper 入口。 */
export function gradlewCommand() {
  return process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
}

/**
 * 准备（或复用）Android 构建副本，并把本次发布的内容写进它的源码 assets。
 * @returns {{workDir: string, projectDir: string, assetFile: string, recreated: boolean,
 *            sourceCommit: string|null, contentSha256: string, contentBytes: number}}
 */
export function prepareAndroidWorkDir({ outDir, androidSrc, distFile }) {
  if (!exists(path.join(androidSrc, 'gradlew')) && !exists(path.join(androidSrc, 'gradlew.bat'))) {
    throw new ReleaseError(`不像一个 Android 工程（没有 gradlew）：${display(androidSrc)}`, { code: 'ENV_MISSING' });
  }
  if (!exists(distFile)) {
    throw new ReleaseError(`缺发布内容：${display(distFile)}`, { code: 'NO_ARTIFACT' });
  }
  const workDir = path.join(outDir, '.work');
  const projectDir = path.join(workDir, 'android');
  const stateFile = path.join(workDir, STATE_NAME);
  const sourceCommit = git(['rev-parse', 'HEAD']);

  let state = null;
  try {
    state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch {
    /* 没有或坏了就重建 */
  }
  // 副本是否存在、是否来自**同一个源提交**：源码变了就必须重建，否则会拿旧代码跑测试。
  const recreated = !exists(projectDir) || state === null || state.sourceCommit !== sourceCommit;
  if (recreated) {
    rmrf(projectDir);
    copyTree(androidSrc, projectDir, {
      filter: (from) => !SKIP_BASENAMES.includes(path.basename(from)),
    });
  }

  // 注入内容（幂等：每次都用本次产物覆盖，所以不存在「副本里留着上一次发布的内容」）。
  const assetFile = path.join(projectDir, 'app/src/main/assets/content/content.json');
  const published = fs.readFileSync(distFile);
  writeFileEnsured(assetFile, published);
  const written = fs.readFileSync(assetFile);
  if (!written.equals(published)) {
    throw new ReleaseError(`注入后字节不一致：${display(assetFile)}`, { code: 'COPY_MISMATCH' });
  }

  // ★ 副本里的代码必须逐字节来自仓库（只有 assets 是故意注入的）—— 否则这份副本上的构建/测试结果不可信。
  const codeMismatches = compareCodeTrees(projectDir, androidSrc);
  if (codeMismatches.length) {
    throw new ReleaseError(
      `Android 副本里的代码与仓库不一致（${codeMismatches.length} 处）—— 拒绝在这份副本上构建或跑测试：\n` +
        codeMismatches.slice(0, 8).map((m) => `  - ${m}`).join('\n') +
        (codeMismatches.length > 8 ? `\n  …还有 ${codeMismatches.length - 8} 处` : '') +
        `\n（只有内容 assets 是故意替换的。删掉 ${display(workDir)} 后重跑即可刷新副本。）`,
      { code: 'ANDROID_COPY_DIRTY' },
    );
  }

  writeFileEnsured(
    stateFile,
    JSON.stringify(
      {
        sourceCommit,
        androidSrc: display(androidSrc),
        contentSha256: sha256(published),
        contentBytes: published.length,
        preparedAt: new Date().toISOString(),
      },
      null,
      2,
    ) + '\n',
  );

  return {
    workDir,
    projectDir,
    assetFile,
    recreated,
    sourceCommit,
    contentSha256: sha256(published),
    contentBytes: published.length,
  };
}

/** 副本里构建出来的 APK 路径。 */
export const builtApkPath = (projectDir) => path.join(projectDir, 'app/build/outputs/apk/debug/app-debug.apk');

/** 副本里的 JVM 单测报告目录（用来数用例）。 */
export const unitTestResultsDir = (projectDir) =>
  path.join(projectDir, 'app/build/test-results/testDebugUnitTest');

/** 统计单测报告里的 用例/失败/跳过（报告不存在返回 null，调用方据此报「没跑成」）。 */
export function readUnitTestCounts(projectDir) {
  const dir = unitTestResultsDir(projectDir);
  if (!exists(dir)) return null;
  let tests = 0;
  let failures = 0;
  let skipped = 0;
  let files = 0;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.xml')) continue;
    files += 1;
    const xml = fs.readFileSync(path.join(dir, name), 'utf8');
    const num = (attr) => Number(new RegExp(`${attr}="(\\d+)"`).exec(xml)?.[1] ?? 0);
    tests += num('tests');
    failures += num('failures') + num('errors');
    skipped += num('skipped');
  }
  return files === 0 ? null : { tests, failures, skipped, files };
}

/** 内容 sha256 与本次发布的对比（供就绪检查判断副本是否就是本次产物）。 */
export function androidWorkState(projectDir) {  const stateFile = path.join(path.dirname(projectDir), STATE_NAME);
  try {
    return { ...JSON.parse(fs.readFileSync(stateFile, 'utf8')), distSha256: sha256File(path.join(projectDir, 'app/src/main/assets/content/content.json')) };
  } catch {
    return null;
  }
}
