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
//
// ⚠ 2026-10-16：一次部署的「版本」是**两根轴**——`appVersion`（APP_VERSION）与
//   `contentRevision`（CONTENT_REVISION，发布构建盖章为 contentVersion）。
//   同一 appVersion、不同修订 ⇒ 同一 origin 上再发一次**只换内容**的版本（缓存名不同、sw.js 字节不同）。

import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// 缓存名的**唯一派生处**是站点的 config.js（与 sw.js 里那三个常量是一回事）：
// 不在这里再写一遍 `pc-resources-${appVersion}`，否则两边一漂移就变成「部署的目录对、
// 测出来的缓存名却对不上」这种难查的假红。
import { APP_VERSION, CONTENT_REVISION, resourceCacheName } from '../../app/config.js';

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
  // 图标（2026-10-15 落地）：启动图标 N1 + 标签页图标另用一套无字极简记号。
  // 它们必须在这里：makeDeployment 据此搭每次演练的站点目录，而 SW 的预缓存清单里也有它们
  // —— 清单里有、部署目录里没有，SW 的 install 会直接失败（离线掉图）。
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon.svg',
  'icons/favicon-32.png',
];

/**
 * 部署清单里**可以当文本读**的那些（源码/配置/标记），与**二进制资源**（图标 PNG）分开。
 *
 * 为什么要分：`inlineChecks`（「内容不得内联进壳」+ 体积报告）要逐文件读全文搜诗题/正文，
 * 把 PNG 按 utf8 读进来等于把字节当字符（结论没有意义，体积也会被算错）。
 * 分法是按扩展名，不是按名字逐个写死 —— 新增资源时不会静默掉队。
 */
export const DEPLOY_TEXT_FILES = DEPLOY_FILES.filter((f) => !/\.(png|jpg|jpeg|webp|ico|woff2?)$/.test(f));

/**
 * 写一个部署目录。
 * @param {{
 *   destDir: string,
 *   appVersion: string,
 *   contentRevision?: string,
 *   contentText: string,
 * }} opts
 */
export async function makeDeployment({ destDir, appVersion, contentRevision = CONTENT_REVISION, contentText }) {
  const dest = resolve(destDir);
  await rm(dest, { recursive: true, force: true });
  for (const rel of DEPLOY_FILES) {
    const target = join(dest, rel);
    await mkdir(dirname(target), { recursive: true });
    if (rel === 'app/config.js' || rel === 'sw.js') {
      // 只改两个版本常量：两个文件都要改，否则 e2e 里的「常量一致」断言会报红。
      const text = (await readFile(join(webRoot, rel), 'utf8'))
        .replace(/APP_VERSION = '[^']*'/, `APP_VERSION = '${appVersion}'`)
        .replace(/CONTENT_REVISION = '[^']*'/, `CONTENT_REVISION = '${contentRevision}'`);
      await writeFile(target, text, 'utf8');
    } else {
      // 其余文件（含图标 PNG）**按字节复制** —— 文本读写会把二进制改坏（utf8 编解码不可逆）。
      await copyFile(join(webRoot, rel), target);
    }
  }
  await writeFile(join(dest, 'content.json'), contentText, 'utf8');
  return {
    destDir: dest,
    appVersion,
    contentRevision,
    cacheName: resourceCacheName(appVersion, contentRevision),
    contentBytes: Buffer.byteLength(contentText, 'utf8'),
  };
}

export { APP_VERSION, CONTENT_REVISION, resourceCacheName };

/**
 * 用**给定目录里的现成字节**拼一个部署（一个字都不改）。
 *
 * 为什么需要它（2026-10-16，负责人要求）：验证「同 app 版本跨内容修订」时，
 * **旧侧必须是真正已发布的那份字节**（tag 里的 `web/**`）——不能是“新 main ＋ 20 首夹具”，
 * 那等于自己造一个自己好嘸的旧版本来验证自己。所以这里只负责把目录搬过去。
 *
 * @param {{destDir: string, webDir: string, contentText: string}} opts
 */
export async function makeDeploymentFromDir({ destDir, webDir, contentText }) {
  const dest = resolve(destDir);
  await rm(dest, { recursive: true, force: true });
  for (const rel of DEPLOY_FILES) {
    const target = join(dest, rel);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(webDir, rel), target);
  }
  await writeFile(join(dest, 'content.json'), contentText, 'utf8');
  // 版本号/cache 名**从这些字节自己读**（而不是从本次仓库的常量），因为旧站点的常量与现在不同。
  const sw = await readFile(join(dest, 'sw.js'), 'utf8');
  const cfg = await readFile(join(dest, 'app/config.js'), 'utf8');
  const read = (text, name) => new RegExp(`(?:const|export const) ${name} = '([^']*)'`).exec(text)?.[1] ?? null;
  const appVersion = read(cfg, 'APP_VERSION') ?? read(sw, 'APP_VERSION');
  const contentRevision = read(cfg, 'CONTENT_REVISION') ?? read(sw, 'CONTENT_REVISION');
  return {
    destDir: dest,
    appVersion,
    contentRevision,
    webDir,
    // 旧站点（没有修订机制）的 cache 名就是前缀＋版本；有修订时是复合键。
    cacheName:
      contentRevision === null
        ? `pc-resources-${appVersion}`
        : resourceCacheName(appVersion, contentRevision),
    contentBytes: Buffer.byteLength(contentText, 'utf8'),
  };
}
