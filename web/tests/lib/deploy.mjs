// 组装一个「部署目录」：模拟一次真实的站点发布（壳 + 内容一起换）。
//
// 为什么需要它：用户拍板「Web 的内容更新 = 站点更新」，所以要真发两版来验证
// 「新 SW 安装 / 旧 cache 被删 / 成对切换 / 旧壳不配新内容」——光测代码路径不算。
//
//   const v1 = await makeDeployment({ destDir: '.../deploy-v1', appVersion: '0.1.0', contentText });
//   const v2 = await makeDeployment({ destDir: '.../deploy-v2', appVersion: '0.2.0', contentText: newContent });
// 之后用同一个 origin（同端口）先后指向两个目录，就等于「同一站点发了新版」。
//
// 这里**不写** content.json.sha256：Web 侧已决定不产出边车（用户 2026-10-14）。

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const webRoot = fileURLToPath(new URL('../..', import.meta.url));

/** 一次部署真正要发布的文件（不含 tests/、scripts/、fixtures/）。 */
export const DEPLOY_FILES = [
  'index.html',
  'styles.css',
  'manifest.json',
  'sw.js',
  'app/config.js',
  'app/content.js',
  'app/main.js',
  'app/render.js',
];

/**
 * 写一个部署目录。
 * @param {{
 *   destDir: string,
 *   appVersion: string,
 *   contentText: string,
 * }} opts
 */
export async function makeDeployment({ destDir, appVersion, contentText }) {
  const dest = resolve(destDir);
  await rm(dest, { recursive: true, force: true });
  for (const rel of DEPLOY_FILES) {
    const target = join(dest, rel);
    await mkdir(dirname(target), { recursive: true });
    let text = await readFile(join(webRoot, rel), 'utf8');
    if (rel === 'app/config.js' || rel === 'sw.js') {
      // 只改版本常量：两个文件都要改，否则 e2e 里的「常量一致」断言会报红。
      text = text.replace(/APP_VERSION = '[^']*'/, `APP_VERSION = '${appVersion}'`);
    }
    await writeFile(target, text, 'utf8');
  }
  await writeFile(join(dest, 'content.json'), contentText, 'utf8');
  return {
    destDir: dest,
    appVersion,
    cacheName: `pc-resources-${appVersion}`,
    contentBytes: Buffer.byteLength(contentText, 'utf8'),
  };
}
