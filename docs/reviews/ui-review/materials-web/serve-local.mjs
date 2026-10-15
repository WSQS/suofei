#!/usr/bin/env node
/**
 * 「能亲手点」用的本地站点 —— 和 capture.mjs 拍的是**同一套东西**。
 *
 *   node docs/reviews/ui-review/materials-web/serve-local.mjs
 *   node docs/reviews/ui-review/materials-web/serve-local.mjs --port 8137
 *   node docs/reviews/ui-review/materials-web/serve-local.mjs --stop-less   # 不提示怎么停
 *
 * 它做三件事：
 *   1. 用仓库自己的 `web/tests/lib/deploy.mjs` 在**系统临时目录**组装一个部署目录：
 *      壳取自本工作树 `web/` 的当前文件，内容取自 `dist/content.json`
 *      （真实产物：1 组 19 首；不存在就先用 `tools/build-content.mjs` 编一份）；
 *   2. 起 `web/scripts/serve.mjs`；
 *   3. 打印地址，让你在浏览器里亲手翻。
 *
 * 为什么不在 `web/` 里直接起服务：那要往 `web/content.json` 写文件，而 `web/` 是本轮**不许改动**
 * 的产品目录（有另一条线在改 index.html / icons）。所以这里只在临时目录里组装，一个字节都不进仓库。
 *
 * ⚠ 本服务是开发/评审用的：因为 Service Worker 需要 localhost，所以请用 `127.0.0.1` 打开；
 *   想试「离线」就在 DevTools → Network 里勾 Offline，或直接停掉本进程再刷新。
 */

import { existsSync, readFileSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:net';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..', '..');

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return dflt;
  const v = argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
};
const PORT = Number(flag('port', 8137));
const WORK = join(tmpdir(), `suofei-ui-review-serve-${PORT}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 端口预检：**不静默复用**别人的端口（否则你看到的可能是上一轮的服务，却以为是自己刚起的）。 */
async function assertPortFree(port) {
  try {
    const srv = createServer();
    await new Promise((res, rej) => {
      srv.once('error', rej);
      srv.once('listening', () => srv.close(() => res()));
      srv.listen(port, '127.0.0.1');
    });
  } catch (err) {
    throw new Error(`端口 ${port} 已被占用（${err.code}）：可能上一次的 serve-local 还在跑。`
      + `先停掉它，或换端口：node ${'docs/reviews/ui-review/materials-web/serve-local.mjs'} --port 8138`);
  }
}

const { makeDeployment } = await import(pathToFileURL(join(ROOT, 'web/tests/lib/deploy.mjs')).href);

if (!existsSync(join(ROOT, 'dist/content.json'))) {
  console.log('dist/content.json 不存在 → 先跑 node tools/build-content.mjs');
  execFileSync(process.execPath, [join(ROOT, 'tools/build-content.mjs'), '--quiet'], { stdio: 'inherit' });
}
const contentText = readFileSync(join(ROOT, 'dist/content.json'), 'utf8');
const doc = JSON.parse(contentText);
const appVersion = /APP_VERSION = '([^']+)'/.exec(readFileSync(join(ROOT, 'web/app/config.js'), 'utf8'))?.[1];

await rm(WORK, { recursive: true, force: true });
await mkdir(WORK, { recursive: true });
const dep = await makeDeployment({ destDir: join(WORK, 'site'), appVersion, contentText });
if (existsSync(join(ROOT, 'web/icons'))) {
  const { cp } = await import('node:fs/promises');
  await cp(join(ROOT, 'web/icons'), join(dep.destDir, 'icons'), { recursive: true });
}
await writeFile(join(WORK, 'site/README-local.txt'),
  `本目录由 docs/reviews/ui-review/materials-web/serve-local.mjs 临时组装，给逐屏评审「亲手点」用。\n`
  + `壳：${ROOT}/web/ 的当前文件；内容：${ROOT}/dist/content.json\n`
  + `站点版本 v${appVersion}；内容版本 v${doc.contentVersion}；${doc.dynasties.length} 组 / ${doc.poems.length} 首\n`, 'utf8');

await assertPortFree(PORT);

const proc = spawn(process.execPath,
  [join(ROOT, 'web/scripts/serve.mjs'), '--port', String(PORT), '--root', dep.destDir],
  { stdio: ['ignore', 'pipe', 'pipe'] });
proc.stdout.on('data', (d) => process.stdout.write(d));
proc.stderr.on('data', (d) => process.stderr.write(d));

for (let i = 0; i < 80; i += 1) {
  try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch { /* 还没起来 */ }
  await sleep(150);
}

console.log(`
站点已经起来了：http://127.0.0.1:${PORT}/

  目录            http://127.0.0.1:${PORT}/#/
  诗页（深链接）  http://127.0.0.1:${PORT}/#/p/gushi-shijiu-shou-01        ← 地址栏里能直接看到这个 hash
  窄屏            DevTools 里把宽度调到 420px（评审清单 G1）

  部署目录：${dep.destDir}（临时目录，不进仓库）
  站点版本 v${appVersion}；内容 v${doc.contentVersion}；${doc.dynasties.length} 组 / ${doc.poems.length} 首

  试「离线」：DevTools → Network → 勾 Offline，然后刷新（Service Worker 已缓存时应仍可读）
  试「内容取失败」：把 ${join(dep.destDir, 'content.json')} 改名或删掉，再刷新
  停服务：Ctrl+C
`);
