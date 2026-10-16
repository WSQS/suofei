// 发布流水线 F：两个「真跑」门（2026-10-16 按负责人要求加入）。
//
// 之前的就绪检查全是对**文件**的静态断言：文件在不在、字节一不一致、常量同不同。
// 那**不证明页面能跑、也不证明产物能被客户端解析**。这两个门补上这件事：
//
//   1. Web e2e：用**刚构建出来的 `out/web`** 当被测站点，跑 E 线的
//      `web/tests/e2e-cdp.mjs`（真 Chromium + CDP）。
//   2. Android 单测：在 Android 只读副本里跑那套 JVM 单测，
//      且副本的内置内容就是**本次发布的内容**（`ContentParserTest` 会真解析它）。
//
// ⚠️ 本文件与回执里**不写死**任何会随别线变化的数字（断言条数、用例数、诗数、异文数）：
// 全部从**本次运行结果**里取。写法死的数字会出现「门是绿的、文案在说谎」这种最难查的假象
// （真踩过：这里曾写死「Android 单测 49 例」，而实际跑到 55 例）。
//
// 两条硬规矩（负责人明确要求）：
//   - 环境不可用（没有浏览器 / 依赖拉不下来）⇒ **标黄并写明原因**，不当通过、也不静默跳过。
//   - 真跑起来但断言失败 ⇒ **标红**。
//
// 踩过的坑（写在这里免得后人再踩）：
//   `:app:testDebugUnitTest` 的输入里**不包含** `src/main/assets/**`（测试是用相对路径在运行时读它的），
//   所以热缓存下 Gradle 会直接 `UP-TO-DATE`/`FROM-CACHE` 什么也不跑 —— 我实测过：
//   故意把内置内容删掉一首（与测试断言不一致），不带 `--rerun-tasks` 时退出码仍然是 0（**静默通过**）。
//   因此这一门强制 `--rerun-tasks`，并且**再断言一次任务行不是 UP-TO-DATE/FROM-CACHE**。

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

import * as A from './artifacts.mjs';
import { gradlewCommand, prepareAndroidWorkDir, readUnitTestCounts } from './android-work.mjs';
import {
  REPO_ROOT,
  copyTree,
  display,
  exists,
  rmrf,
  runCaptureFull,
  sha256File,
  writeFileEnsured,
} from './util.mjs';

/** 这几个门的检查 id（check-ready 用来做「跳过/只跑真跑门」的判断）。 */
export const LIVE_CHECK_IDS = Object.freeze([
  'live-web-e2e',
  'live-android-unit-tests',
  // 2026-10-16 加入：Web 端「最小 Markdown 闭集」与 schema/markdown-subset.json ＋ 共用夹具的对照。
  // ⇒ 它**要能挡住发布**：一个挡不住任何东西的门，正是本项目反复记录的那类「看起来有保障、其实没有」。
  'live-markdown-conformance',
]);

/** 本机 Chromium 的实测位置（只是**兜底提示**；真正的来源是环境变量 CHROME_BIN）。 */
const CHROME_FALLBACK = 'C:/Users/wsqsy/AppData/Local/Chromium/Application/chrome.exe';
const CHROME_HINT = `CHROME_BIN='${CHROME_FALLBACK}'`;

/** 本机 Gradle 到不了 google()/mavenCentral()（全局代理那边不通），测试要用的 org.json 走这个镜像。 */
const DEFAULT_EXTRA_MAVEN_MIRROR = 'https://maven.aliyun.com/repository/public';

const logsDir = (outDir) => path.join(outDir, '.work', 'logs');

/**
 * 镜像根里**故意不复制**、但被测脚本需要的**仓库级**文件 → 用环境变量把它指回仓库的唯一来源。
 *
 * 为什么用环境变量而不是把文件复制进镜像根（负责人 2026-10-16 建议 A，我采纳）：
 *   `schema/unknown-authors.json` 是**仓库级唯一来源**，不是发布产物的一部分。
 *   复制进 `.work/e2e/` 会让人以为「产物里该有 schema/」，而后人照着改只会越走越偏；
 *   E 的 e2e 明确支持 `UNKNOWN_AUTHORS_FILE`（它自证时就是这么跑的），指回仓库即可。
 *   真踩过：镜像根没有 schema/ ⇒ E 的 e2e 报「唯一来源清单文件存在」红，
 *   而同一天在主线跑同一份 out/web 是**全绿**（当时 151/151）—— 那条红纯粹是接缝，不是产物问题。
 */
export const REPO_FILE_ENV = Object.freeze({ 'schema/unknown-authors.json': 'UNKNOWN_AUTHORS_FILE' });

/**
 * 扫出 E 的 e2e 会读哪些**仓库级**路径（`resolve(repoRoot, 'a', 'b')` 字面量）。
 *
 * 目的：把「接缝」变成**开跑前的响亮报错**。不然 E 以后再加一个仓库级读取，
 * 我这边只会在它的脚本深处看到一条莫名其妙的红，得靠人去翻。
 * @returns {string[]} 相对仓库根的路径
 */
export function findE2ERepoReads(e2eSource) {
  const found = new Set();
  for (const m of e2eSource.matchAll(/resolve\(\s*repoRoot\s*,\s*((?:'[^']*'\s*,\s*)*'[^']*')\s*\)/g)) {
    const parts = [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
    if (parts.length) found.add(parts.join('/'));
  }
  return [...found];
}

/**
 * E 线「一次部署真正要发布的文件」清单（`web/tests/lib/deploy.mjs: DEPLOY_FILES`）。
 *
 * 直接读**它的**清单，而不是我再手写一份：它改了发布集我自动跟上，不会因为两份清单漂移而假绿。
 * 读不到（文件被移走/改名）返回 null，由调用方退回本地白名单并如实说明。
 */
export function findE2EDeployFiles() {
  const p = path.join(REPO_ROOT, 'web/tests/lib/deploy.mjs');
  if (!exists(p)) return null;
  const m = /export const DEPLOY_FILES = \[([\s\S]*?)\]/.exec(fs.readFileSync(p, 'utf8'));
  if (!m) return null;
  const files = [...m[1].matchAll(/'([^']*)'|"([^"]*)"/g)].map((x) => x[1] ?? x[2]);
  return files.length ? files : null;
}

/** 解析 Chromium：优先 CHROME_BIN，其次本机实测默认路径；都没有就返回 null（→ 标黄）。 */
export function resolveChromeBin() {
  const fromEnv = process.env.CHROME_BIN;
  if (fromEnv && exists(fromEnv)) return { bin: fromEnv, source: `CHROME_BIN=${fromEnv}` };
  if (fromEnv) return { bin: null, source: `CHROME_BIN=${fromEnv}（这个路径不存在）` };
  if (exists(CHROME_FALLBACK)) return { bin: CHROME_FALLBACK, source: `本机默认路径 ${CHROME_FALLBACK}` };
  return { bin: null, source: 'CHROME_BIN 未设，且本机默认路径不存在' };
}

const tail = (s, n = 3) => String(s).trim().split('\n').slice(-n).join(' | ');

/**
 * 端口占用的同步探针（用子进程跑一段 net 代码；listen 成功=空闲）。
 *
 * 为何必须有它：E 线的 e2e 默认用 8137/9237，而**这个仓库在同时跑多条会话**
 * （E 线自己、负责人复跑都会跑同一个脚本）。真踩过：一条并行的 e2e 已经占着 8137，
 * 我的镜像站点没抢到端口，脚本却对着**别人的服务器**跑完了全套断言 ——
 * 表现为一堆莫名的失败（缓存名 pc-resources-0.3.0、内容版本 2026.10.14.1，这两个值
 * 在我这棵树里根本不存在）。运气不好时它会是个**假绿**。所以：先找空闲端口、显式传给脚本，
 * 绝不使用「别人可能已经在听」的默认端口。
 */
function portFree(port) {
  const probe = [
    "const net=require('net');const s=net.createServer();",
    "s.once('error',()=>process.exit(1));",
    "s.once('listening',()=>s.close(()=>process.exit(0)));",
    `s.listen(${port},'127.0.0.1');`,
  ].join('');
  const r = spawnSync(process.execPath, ['-e', probe], { timeout: 5000 });
  return r.status === 0;
}

/** 找一对空闲的（站点端口, 调试端口）。找不到返回 null。 */
function pickPorts() {
  for (let i = 0; i < 20; i++) {
    const port = 8137 + i;
    const debugPort = 9237 + i;
    if (portFree(port) && portFree(debugPort)) return { port, debugPort, moved: i > 0 };
  }
  return null;
}

/** 跑命令；连命令都执行不了（如 gradlew 缺失/权限）不抛栈，而是当成环境问题返回。 */
function tryRun(cmd, args, opts) {
  try {
    return runCaptureFull(cmd, args, opts);
  } catch (err) {
    return { status: 127, seconds: 0, output: String(err?.message ?? err), logFile: opts.logFile, spawnError: String(err?.message ?? err) };
  }
}

// ─────────────────────────── Web e2e ───────────────────────────

/**
 * 搭一个「镜像根」，让 E 线的 e2e 脚本把 `out/web` 当站点跑：
 *
 *   <out>/.work/e2e/
 *     dist/content.json              ← 本次产物（脚本的**首选基座**；存在就不会去编译/退夹具）
 *     docs/design/content-contract.md← 脚本里有一条断言要读契约原文
 *     tools/                         ← 有它才说明脚本会走「现场编译」分支而不是退夹具（我们不该走到那）
 *     web/                           ← 仓库 web/ 的镜像（tests/scripts/fixtures 是测试基础设施）
 *                                      再**覆盖**上 out/web 的全部载荷（index.html/sw.js/app/…）
 *
 * 于是：站点载荷 = out/web（谁都没改过它），内容基座 = out/dist/content.json，
 * 而仓库里的 `web/content.json` 从头到尾不参与（脚本只写它自己根目录下的那份）。
 */
function prepareE2ERoot({ outDir, distFile }) {
  const root = path.resolve(outDir, '.work', 'e2e');
  rmrf(root);
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });

  // 1) 基座与脚本要读的仓库文件
  fs.copyFileSync(distFile, path.join(root, 'dist', 'content.json'));
  const contract = path.join(REPO_ROOT, 'docs/design/content-contract.md');
  if (!exists(contract)) throw new Error(`e2e 需要契约原文：${display(contract)} 不存在`);
  writeFileEnsured(path.join(root, 'docs/design/content-contract.md'), fs.readFileSync(contract));

  // ★ 测试输入（**不是发布产物**）：两端「视觉令牌逐值一致」的门要读仓库里的唯一来源。
  //   · Web e2e 直接读**评审通过的原型 CSS**（`prototype/css/theme-tech.css`）做逐项比对；
  //   · 规范文档 `docs/design/visual-tokens.md` 是跨端权威（Android 的 VisualTokensConsistencyTest 也读它）。
  // 为什么必须在**镜像根**里也放一份：e2e 把镜像根当仓库根用（`resolve(repoRoot, …)`），
  // 而 `findE2ERepoReads` 的接缝预检要求「它读的路径在镜像里必须存在」——缺了就要红。
  // 这两个文件**不进任何发布产物**（站点白名单里没有它们）；这里只是把仓库里的唯一来源搬给测试读。
  for (const rel of ['prototype/css/theme-tech.css', 'docs/design/visual-tokens.md']) {
    const src = path.join(REPO_ROOT, rel);
    if (!exists(src)) throw new Error(`测试要读的仓库文件不存在：${display(src)}`);
    writeFileEnsured(path.join(root, rel), fs.readFileSync(src));
  }
  copyTree(path.join(REPO_ROOT, 'tools'), path.join(root, 'tools'), {
    filter: (from) => path.basename(from) !== 'node_modules',
  });

  // 2) 仓库 web/ 的镜像（测试基础设施），排除测试产物
  copyTree(path.join(REPO_ROOT, 'web'), path.join(root, 'web'), {
    filter: (from) => path.basename(from) !== 'artifacts',
  });

  // 3) 覆盖上本次构建的站点载荷
  const webOut = A.webDir(outDir);
  if (!exists(webOut)) throw new Error(`缺 ${display(webOut)}`);
  for (const name of fs.readdirSync(webOut)) {
    const src = path.join(webOut, name);
    const dst = path.join(root, 'web', name);
    if (fs.statSync(src).isDirectory()) {
      rmrf(dst);
      copyTree(src, dst);
    } else {
      fs.copyFileSync(src, dst);
    }
  }
  return root;
}

export function runWebE2E({ outDir: outDirIn }) {
  // 统一成绝对路径：下面会给子进程设 cwd，相对路径会跟 cwd 叠成两层。
  const outDir = path.resolve(outDirIn);
  const distFile = A.distPath(outDir);
  if (!exists(distFile)) return { status: 'SKIP', detail: `缺 ${display(distFile)}：没有可测的内容基座` };
  if (!exists(A.webDir(outDir))) return { status: 'SKIP', detail: `缺 ${display(A.webDir(outDir))}：没有可测的站点` };

  const chrome = resolveChromeBin();
  if (!chrome.bin) {
    return {
      status: 'WARN',
      detail: `环境不可用：找不到 Chromium（${chrome.source}）—— 这一门**没跑**，不是通过。\n设 ${CHROME_HINT} 后重跑。`,
    };
  }

  const distSha = sha256File(distFile);
  let root;
  try {
    root = prepareE2ERoot({ outDir, distFile });
  } catch (err) {
    return { status: 'FAIL', detail: `准备被测站点失败：${err.message}` };
  }

  // ★ 接缝预检（把 E 需要的**仓库级**文件对清楚；缺了必须红，不许跳过）
  const e2eSource = fs.readFileSync(path.join(root, 'web/tests/e2e-cdp.mjs'), 'utf8');
  const repoReads = findE2ERepoReads(e2eSource);
  const envOverrides = {};
  const envNotes = [];
  for (const rel of repoReads) {
    const inMirror = exists(path.join(root, rel));
    const envName = REPO_FILE_ENV[rel];
    if (envName) {
      const fromRepo = path.join(REPO_ROOT, rel);
      // 调用方自己传了就用它的（允许换来源），但**无论来自哪里都要存在** —— 缺了必须红。
      const chosen = process.env[envName] || fromRepo;
      if (!exists(chosen)) {
        return {
          status: 'FAIL',
          detail:
            `被测脚本需要的**仓库级唯一来源**不存在：${chosen}\n` +
            `   （${envName}=${process.env[envName] ? '调用方提供' : '本流水线默认'}；E 的 e2e 会读它）\n` +
            '   缺它必须红 —— 不跳过、也不当通过。先把它合入主线（或改对 ' + envName + '）再重跑。',
        };
      }
      envOverrides[envName] = chosen;
      envNotes.push(`${envName} → ${display(chosen)}`);
    } else if (!inMirror) {
      return {
        status: 'FAIL',
        detail:
          `被测脚本会读仓库级路径 \`${rel}\`，但镜像根里没有它：${display(path.join(root, rel))}\n` +
          '   —— 这是**我这一层的接缝**，不是产物问题。修法二选一：\n' +
          '     ① 在 release/lib/live.mjs 的 REPO_FILE_ENV 里给它配一个环境变量（若 E 的脚本支持）；\n' +
          '     ② 在 prepareE2ERoot 里把它复制进镜像根（并在文档里说明它不是发布产物）。',
      };
    }
  }

  // 基座断言（在跑之前）：脚本首选的 dist/content.json 与站点根 content.json 都是**本次产物**。
  const baseSha = sha256File(path.join(root, 'dist', 'content.json'));
  const servedSha = sha256File(path.join(root, 'web', 'content.json'));
  if (baseSha !== distSha) return { status: 'FAIL', detail: `镜像根里的基座不是本次产物：${baseSha} ≠ ${distSha}` };
  if (servedSha !== distSha) return { status: 'FAIL', detail: `镜像站点里的 content.json 不是本次产物：${servedSha} ≠ ${distSha}` };
  // 站点载荷确实来自 out/web（抽查几个会真正影响行为的文件）
  const payloadMismatch = ['index.html', 'sw.js', 'app/config.js', 'app/main.js'].filter(
    (n) => sha256File(path.join(root, 'web', n)) !== sha256File(path.join(A.webDir(outDir), n)),
  );
  if (payloadMismatch.length) {
    return { status: 'FAIL', detail: `镜像站点里的载荷与 out/web 不一致：${payloadMismatch.join(', ')}（被仓库里的文件盖住了？）` };
  }

  const ports = pickPorts();
  if (!ports) {
    return {
      status: 'WARN',
      detail:
        '环境不可用：8137-8156 / 9237-9256 全都被占用（很可能有别的会话正在跑 e2e 或 Chromium）——\n' +
        '本门**没跑**：不能对着别人的服务器跑（那样结果是别人的，运气不好还是个假绿）。等占用释放后重跑。',
    };
  }

  const logFile = path.join(logsDir(outDir), 'web-e2e.log');
  const r = runCaptureFull(process.execPath, [path.resolve(root, 'web/tests/e2e-cdp.mjs')], {
    cwd: root,
    env: {
      ...process.env,
      CHROME_BIN: chrome.bin,
      TEST_PORT: String(ports.port),
      TEST_DEBUG_PORT: String(ports.debugPort),
      ...envOverrides,
    },
    logFile,
    tailLines: 12,
  });
  const portNote = `端口 ${ports.port}/${ports.debugPort}${ports.moved ? '（默认端口被别人占着，已自动换开）' : ''}`;
  if (/EADDRINUSE/.test(r.output)) {
    return {
      status: 'WARN',
      detail: `环境不可用：e2e 自己的服务/浏览器没能绑定端口（EADDRINUSE）—— 很可能有别的会话在并行跑 e2e。本门**没跑**，不是通过。\n完整输出：${display(logFile)}`,
    };
  }

  const summary = /通过 (\d+) \/ (\d+)/.exec(r.output);
  if (!summary) {
    return {
      status: 'WARN',
      detail:
        `e2e 没能跑完（没出现「通过 N / N」汇总；退出码 ${r.status}，${r.seconds.toFixed(0)}s）—— 这一门标黄，**不是通过**。\n` +
        `可能是环境（浏览器启动/端口 ${process.env.TEST_PORT ?? 8137} 被占/进程被杀），也可能是脚本自身问题；完整输出：${display(logFile)}\n` +
        `尾部：${tail(r.output, 4)}`,
    };
  }
  const [, pass, total] = summary;
  if (r.status !== 0 || pass !== total) {
    const failed = [...r.output.matchAll(/^\s*✗ (.+)$/gm)].map((m) => m[1]).slice(0, 5);
    const details = [...r.output.matchAll(/^\s*✗ ([\s\S]*?)(?=\n\s*(?:PASS|FAIL|✗|===|$))/gm)]
      .map((m) => m[1].replace(/\s+/g, ' ').trim().slice(0, 200))
      .slice(0, 3);
    return {
      status: 'FAIL',
      meta: { passed: Number(pass), total: Number(total) },
      detail:
        `e2e 真跑了并失败：通过 ${pass} / ${total}（退出码 ${r.status}，${r.seconds.toFixed(0)}s，${portNote}）\n` +
        (failed.length ? `失败项（原样，含实际/期望值）：\n${failed.map((f, i) => `  - ${f}${details[i] ? `\n      ${details[i]}` : ''}`).join('\n')}` : '') +
        `\n这算红，不算通过。负责人已确认 E 的 e2e 在本机负载高时有**偶发时序敏感失败**；` +
        `若你怀疑就是那类偶发，请对照上面的失败点重跑 \`node release/check-ready.mjs --live-only\` 再定。` +
        `\n完整输出：${display(logFile)}`,
    };
  }
  // 事后核对（机械地查**产物**，不 grep E 的日志文本：它改了断言我这边不能假红）：
  //   E 的 harness 会把每个版本真发到 web/tests/artifacts/deploy/<name>/（v1 = 本次发布）。
  //   所以「被测站点就是我的构建产物」可以被直接量出来：站点 v1 的 content.json 必须与我的 dist 同一字节，
  //   站点文件（index.html/sw.js/app/*）必须与 out/web 一致（APP_VERSION 一行允许被 harness 改成同一个值）。
  const problems = [];
  const deployDir = path.join(root, 'web/tests/artifacts/deploy/v1');
  const stripAppVersion = (text) => text.replace(/APP_VERSION\s*=\s*'[^']*'/g, "APP_VERSION = '<v>'");
  const deployFiles = findE2EDeployFiles() ?? ['index.html', 'styles.css', 'manifest.json', 'sw.js', 'app/config.js', 'app/content.js', 'app/main.js', 'app/render.js'];
  let servedVersion = null;
  if (!exists(deployDir)) {
    problems.push(`找不到 E 的部署产物目录 ${display(deployDir)} —— 站点目录结构可能变了，无法核对「被测站点＝out/web」`);
  } else {
    const servedContent = path.join(deployDir, A.WEB_CONTENT_NAME);
    if (!exists(servedContent)) problems.push(`被测站点目录里没有 content.json`);
    else if (sha256File(servedContent) !== distSha) {
      problems.push(`被测站点的 content.json 不是本次产物：${sha256File(servedContent)} ≠ ${distSha}`);
    }
    for (const rel of deployFiles) {
      const a = path.join(deployDir, rel);
      const b = path.join(A.webDir(outDir), rel);
      if (!exists(a)) {
        problems.push(`被测站点目录里缺 ${rel}`);
        continue;
      }
      if (!exists(b)) continue; // out/web 里没有、它自己加的（如 v2 用的夹具）→ 不归本项管
      const same = fs.readFileSync(a, 'utf8') === fs.readFileSync(b, 'utf8');
      const sameModuloVersion = stripAppVersion(fs.readFileSync(a, 'utf8')) === stripAppVersion(fs.readFileSync(b, 'utf8'));
      if (!same && !sameModuloVersion) problems.push(`被测站点里的 ${rel} 与 out/web 不同（也不是只差 APP_VERSION）`);
      if (/(?:app\/config|sw)\.js$/.test(rel)) servedVersion ??= /APP_VERSION\s*=\s*'([^']+)'/.exec(fs.readFileSync(a, 'utf8'))?.[1] ?? null;
    }
  }
  // 被测站点的版本必须就是**我构建出来的那一版**（不是别人顺手改的值）
  const builtVersion = /APP_VERSION\s*=\s*'([^']+)'/.exec(fs.readFileSync(path.join(A.webDir(outDir), 'app/config.js'), 'utf8'))?.[1] ?? null;
  if (servedVersion && builtVersion && servedVersion !== builtVersion) {
    problems.push(`被测站点的 APP_VERSION=${servedVersion} ≠ out/web 里的 ${builtVersion} —— 测的不是我这一版`);
  }
  if (problems.length) {
    return { status: 'FAIL', detail: `e2e 通过了（${pass}/${total}），但「被测站点是本次产物」这件事不成立：\n${problems.map((p) => `  - ${p}`).join('\n')}` };
  }
  return {
    status: 'PASS',
    meta: { passed: Number(pass), total: Number(total) },
    detail:
      `通过 ${pass} / ${total}（${r.seconds.toFixed(0)}s，真 Chromium，${portNote}）\n` +
      `  基座 = out/dist/content.json（sha256 ${distSha.slice(0, 16)}…），站点载荷 = out/web（APP_VERSION=${builtVersion}），仓库 web/content.json 未参与\n` +
      (envNotes.length ? `  接缝：${envNotes.join('；')}（镜像根故意不带 schema/，仓库级唯一来源指回仓库）\n` : '') +
      `  机械核对：E 发的 v1 目录里 content.json 与 dist 逐字节相同；index.html/sw.js/app/* 与 out/web 一致\n` +
      `  完整输出：${display(logFile)}`,
  };
}

// ─────────────────────────── Android 单测 ───────────────────────────

export function runAndroidUnitTests({ outDir: outDirIn, androidSrc }) {
  const outDir = path.resolve(outDirIn);
  const distFile = A.distPath(outDir);
  if (!exists(distFile)) return { status: 'SKIP', detail: `缺 ${display(distFile)}：没有可注入的内置内容` };

  if (!process.env.JAVA_HOME && !exists('/usr/bin/java')) {
    return { status: 'WARN', detail: `环境不可用：找不到 JDK（JAVA_HOME 未设）—— 这一门**没跑**。本机实测 JAVA_HOME=C:/Users/wsqsy/.jdks/ms-17.0.17` };
  }
  if (!process.env.ANDROID_HOME && !process.env.ANDROID_SDK_ROOT && !exists(path.join(androidSrc, 'local.properties'))) {
    return { status: 'WARN', detail: '环境不可用：找不到 Android SDK（ANDROID_HOME 未设、也没有 android/local.properties）—— 这一门**没跑**' };
  }

  let work;
  try {
    work = prepareAndroidWorkDir({ outDir, androidSrc, distFile });
  } catch (err) {
    return { status: 'FAIL', detail: `准备 Android 副本失败：${err.message}` };
  }
  const distSha = sha256File(distFile);
  if (work.contentSha256 !== distSha) {
    return { status: 'FAIL', detail: `副本里的内置内容不是本次产物：${work.contentSha256} ≠ ${distSha}` };
  }

  const logFile = path.join(logsDir(outDir), 'android-unit-tests.log');
  const gradlew = gradlewCommand();
  const mirror = process.env.EXTRA_MAVEN_MIRROR || DEFAULT_EXTRA_MAVEN_MIRROR;
  const baseArgs = ['testDebugUnitTest', '--rerun-tasks', `-PextraMavenMirror=${mirror}`];
  let r = tryRun(gradlew, ['--offline', ...baseArgs], { cwd: work.projectDir, logFile, tailLines: 10 });
  let onlineRetry = false;
  const resolutionProblem = /Could not (resolve|download|GET)|No cached version|Network is unreachable|Connection refused|Remote host terminated/i.test(r.output);
  if (r.status !== 0 && resolutionProblem) {
    // 本机 Gradle 缓存里没有 org.json 时，--offline 必然失败；这不是产物的问题，去掉 --offline 再试一次。
    onlineRetry = true;
    r = tryRun(gradlew, baseArgs, { cwd: work.projectDir, logFile, tailLines: 10 });
  }

  if (r.spawnError) {
    return { status: 'WARN', detail: `环境不可用：命令跑不起来（${r.spawnError}）—— 这一门**没跑**。Gradle wrapper：${display(path.join(work.projectDir, gradlew))}` };
  }
  if (r.status !== 0) {
    if (resolutionProblem) {
      return {
        status: 'WARN',
        detail:
          `环境不可用：Gradle 拉不到单测依赖（org.json）—— 这一门**没跑**，不是通过。\n` +
          `已用镜像 ${mirror}${onlineRetry ? '，并去掉 --offline 重试过一次' : ''}。\n` +
          `命中行：${tail(r.output, 4)}\n完整输出：${display(logFile)}`,
      };
    }
    const failed = [...r.output.matchAll(/^\s*(\S+ > \S+) FAILED$/gm)].map((m) => m[1]).slice(0, 6);
    return {
      status: 'FAIL',
      detail:
        `Android 单测真跑了并失败（退出码 ${r.status}，${r.seconds.toFixed(0)}s）\n` +
        (failed.length ? `失败用例：\n${failed.map((f) => `  - ${f}`).join('\n')}` : `尾部：${tail(r.output, 5)}`) +
        `\n完整输出：${display(logFile)}`,
    };
  }

  // 静默通过的防线：Gradle 必须**真的执行**了测试任务（不是 UP-TO-DATE / FROM-CACHE）。
  const taskLine = /^> Task :app:testDebugUnitTest(.*)$/m.exec(r.output)?.[1] ?? '(没找到任务行)';
  if (/UP-TO-DATE|FROM-CACHE|SKIPPED/i.test(taskLine)) {
    return {
      status: 'FAIL',
      detail:
        `Gradle 报告测试任务没有真跑：\`:app:testDebugUnitTest${taskLine}\` —— 这是「绿了但没跑」，必须当红。\n` +
        `（原因：src/main/assets/** 不是该任务的声明输入，热缓存下会被跳过；本门强制 --rerun-tasks，若这里仍被跳过说明机制失效。）`,
    };
  }
  const counts = readUnitTestCounts(work.projectDir);
  if (!counts || counts.tests === 0) {
    return { status: 'FAIL', detail: `测试任务执行了，但读不到用例报告（${display(path.join(work.projectDir, 'app/build/test-results/testDebugUnitTest'))}）` };
  }
  if (counts.failures > 0) {
    return { status: 'FAIL', meta: counts, detail: `报告里有 ${counts.failures} 个失败用例（用例 ${counts.tests}），退出码却是 0？报告不可信` };
  }
  // 内容摘要也从**本次产物**里读，不写死诗数/首末诗名。
  let contentNote;
  try {
    const doc = JSON.parse(fs.readFileSync(distFile, 'utf8'));
    const titles = (doc.poems ?? []).map((p) => p.title);
    contentNote = `本次产物是 ${titles.length} 首（首＝${titles[0]}、末＝${titles[titles.length - 1]}）；ContentParserTest 真解析的就是它`;
  } catch {
    contentNote = 'ContentParserTest 真解析的就是它（读不出内容摘要）';
  }
  return {
    status: 'PASS',
    meta: counts,
    detail:
      `用例 ${counts.tests} / 失败 0 / 跳过 ${counts.skipped}（${r.seconds.toFixed(0)}s，真 JVM）\n` +
      `  内置内容 = 本次产物（sha256 ${distSha.slice(0, 16)}…，注入到副本的 app/src/main/assets/content/content.json）\n` +
      `  ${contentNote}\n` +
      '  强制 --rerun-tasks，并断言任务行不是 UP-TO-DATE/FROM-CACHE（防「绿了但没跑」）\n' +
      `  副本：${display(work.projectDir)}（android/ 本身未被写；${work.recreated ? '本次重建' : '复用'}）\n` +
      `  完整输出：${display(logFile)}`,
  };
}

/**
 * 真跑门：Web 端的「最小 Markdown 闭集」与**契约 + 共用夹具**的对照（`web/tests/md-conformance.mjs`）。
 *
 * 它**自带**静态服务（serves 仓库里的 `web/`）＋无头 Chromium，**不需要**先准备 out/web ——
 * 它核的是「渲染器 ↔ schema/markdown-subset.json ↔ tests/fixtures/contract/」三者对不对得上，
 * 不是发布产物 ⇒ 直接读仓库即可。
 *
 * 环境不可用（没浏览器、端口起不来、脚本崩）一律报 **黄「没跑」**，**绝不报绿**。
 */
export function runMarkdownConformance({ outDir } = {}) {
  const chrome = resolveChromeBin();
  if (!chrome.bin) {
    return { status: 'WARN', detail: `环境不可用：找不到 Chromium（${chrome.source}）。这一门**没跑**，不是通过。` };
  }
  const logFile = path.join(logsDir(outDir ?? path.join(REPO_ROOT, 'release', 'out')), 'md-conformance.log');
  const r = runCaptureFull(process.execPath, [path.resolve(REPO_ROOT, 'web/tests/md-conformance.mjs')], {
    cwd: REPO_ROOT,
    env: { ...process.env, CHROME_BIN: chrome.bin },
    logFile,
    tailLines: 12,
  });
  // ⚠ 汇总行有两种写法：e2e 是「通过 N / N」（带空格），md-conformance 是「通过 N/N」⇒ 容差写。
  const summary = /通过\s*(\d+)\s*\/\s*(\d+)/.exec(r.output);
  if (!summary) {
    return {
      status: 'WARN',
      detail:
        `md-conformance 没能跑完（没出现「通过 N/N」汇总；退出码 ${r.status}，${r.seconds.toFixed(0)}s）—— 这一门标黄，**不是通过**。\n` +
        `完整输出：${display(logFile)}\n尾部：${tail(r.output, 4)}`,
    };
  }
  const [, pass, total] = summary;
  if (r.status !== 0 || pass !== total) {
    return {
      status: 'FAIL',
      meta: { passed: Number(pass), total: Number(total) },
      detail:
        `md-conformance 真跑了并失败：通过 ${pass} / ${total}（退出码 ${r.status}，${r.seconds.toFixed(0)}s）。\n` +
        `  它核的是：契约 constructs/excluded ↔ 渲染器实际支持集；共用夹具的块序列。\n` +
        `完整输出：${display(logFile)}\n尾部：${tail(r.output, 6)}`,
    };
  }
  return { status: 'PASS', meta: { passed: Number(pass), total: Number(total) }, detail: `通过 ${pass} / ${total}（浏览器：${chrome.source}）` };
}
