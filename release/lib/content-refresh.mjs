// 同 app 版本的内容刷新（`--same-app-content-refresh`）：**应用版本不变、只换内容**这条发布路径的纯逻辑。
//
// 背景（2026-10-16 两轮用户拍板）：
//   第一轮「先把内容更新吧，也就是版本号不变只更新内容吧」；第二轮纠正：
//   **「应该更新 Release 和 apk，这样下载新的 apk 不用联网」** ⇒ 这条路径**照常产 APK**，
//   只是 `versionName` 仍是 0.1.3、`versionCode` 仍是 4（同版本号**重打包**，内置新内容）。
//   所以它**不是**「不发 APK」，而是「APK 与应用的对外版本号不变，只有内容变」。
//
// 为什么 Web 仍然必须换 `sw.js` 的字节（真事实，不是推测）：
//   Web 的更新通道是 Service Worker。浏览器只在 **`sw.js` 的字节变化**时才装新 SW；
//   站点缓存名原本只由 `APP_VERSION` 决定 ⇒ 同 app 版本重发内容时
//   ① 新 SW 不会装、老缓存继续服务（用户永远看不到新内容）；
//   ② 就算硬塞一个新 SW，缓存名相同 ⇒ 新旧内容挤进同一个 cache，「壳与内容成对切换」就破了。
//   ⇒ 缓存名改为 `pc-resources-<APP_VERSION>+<CONTENT_REVISION>`（前缀不变，activate 仍只删本前缀的旧 cache），
//   `CONTENT_REVISION` 由发布构建**盖章**成本次 `contentVersion`。
//
// 本文件只放**可单测的纯逻辑**：盖章、缓存名形状守卫、同 app 版本基线的挑选与改动范围分类。
// 真跑入口在 release/build-release.mjs 与 release/check-ready.mjs。

import fs from 'node:fs';
import path from 'node:path';

import { RELEASE_VERSION_RE, RELEASE_TAG_HINT, parseReleaseTag } from './version-source.mjs';
import { compareContentVersion } from '../../tools/lib/version.mjs';
import { ReleaseError, display, exists, sha256 } from './util.mjs';

/** 盖章要动的两个站点文件（相对站点根）：经典 worker ＋ 模块化的接口常量集中地。 */
export const SHELL_STAMP_FILES = Object.freeze(['sw.js', 'app/config.js']);

/** 模式名（命令行开关与清单字段共用一处，免得两边写成两个词）。 */
export const SAME_APP_MODE = 'same-app-content-refresh';

/**
 * 同 app 版本这条路径下，**Web 端允许**相对「同 app 版本的旧发布 tag」变动的产品文件。
 *
 * 为什么需要这张表而不是「随便变」：这条路径对外声称「应用没变，只换了内容」。
 * 如果 Web 的壳代码偷偷改了（渲染、解析、样式），那句话就是**假的**——用户看到的界面行为变了。
 * 现实是：**内容修订机制本身**（cache 复合键 + 预览提示里写出修订）是本轮才加的，
 * 所以它必须显式列出来、并在回执里逐条说明；除此之外的产品文件一律不许变。
 *
 * ⚠ 每加一条都要写**为什么**；审查时按这张表逐条看 diff。下一次纯内容刷新时它应当变空。
 */
export const WEB_PRODUCT_CHANGE_ALLOWLIST = Object.freeze([
  {
    path: 'web/sw.js',
    reason: '缓存名改成 <前缀><APP_VERSION>+<CONTENT_REVISION>（同 app 版本时必须换 SW 字节，否则浏览器不装新 SW）；'
      + '另加 CONTENT_REVISION 常量与缓存报告里的 contentRevision 字段',
  },
  {
    path: 'web/app/config.js',
    reason: '新增 CONTENT_REVISION 常量与 resourceCacheName(appVersion, contentRevision) 的复合键派生',
  },
  {
    path: 'web/app/main.js',
    reason: '「有新版本」提示写明内容修订（同 app 版本时只说 v0.1.3 → v0.1.3 会误导），并把它带进内部诊断 summary()',
  },
]);

/** 同 app 版本这条路径下，Web 端**绝不允许**变动的产品文件（渲染/解析/样式/标记：变了就不是「只换内容」）。 */
export const WEB_PRODUCT_FROZEN = Object.freeze([
  'web/index.html',
  'web/styles.css',
  'web/app/content.js',
  'web/app/render.js',
]);

/** 读取 `CONTENT_REVISION = '…'` 的当前值（读不到返回 null，不填空值）。 */
export function readContentRevision(text) {
  const m = /CONTENT_REVISION\s*=\s*'([^']*)'/.exec(String(text));
  return m ? m[1] : null;
}

/** 读取 `APP_VERSION = '…'` 的当前值（读不到返回 null）。 */
export function readAppVersionConstant(text) {
  const m = /APP_VERSION\s*=\s*'([^']*)'/.exec(String(text));
  return m ? m[1] : null;
}

/**
 * 把一份站点源码里的 `CONTENT_REVISION` 盖章成 `revision`。
 *
 * 失败即抛（**不静默放过**），因为「盖章没生效」正是这条路径最危险的失败形状：
 * 产物看着齐、缓存名却没变 ⇒ 用户永远收不到这次内容更新，而且没有任何红。
 *
 * @param {string} text 文件全文
 * @param {string} revision 必须是发布版本形状（`contentVersion`）
 * @param {string} label 错误信息里点名是哪个文件
 * @returns {{text: string, previous: string, changed: boolean}}
 */
export function stampContentRevision(text, revision, label = '站点文件') {
  if (typeof revision !== 'string' || !RELEASE_VERSION_RE.test(revision)) {
    throw new ReleaseError(
      `${label}：要盖章的 CONTENT_REVISION 必须是发布版本 YYYY.MM.DD.N（收到：${JSON.stringify(revision)}）`,
      { code: 'REVISION_INVALID' },
    );
  }
  const src = String(text);
  const hits = src.match(/CONTENT_REVISION\s*=\s*'[^']*'/g) ?? [];
  if (hits.length !== 1) {
    throw new ReleaseError(
      `${label}：` + '`CONTENT_REVISION = \'…\'`' + ` 出现了 ${hits.length} 次（必须恰好 1 次）。\n` +
        '   盖章靠的就是这一处常量；0 次 = 常量被改名/删了（缓存名就不带内容修订了），多次 = 不知道该改哪一个。\n' +
        '   改完请同步 release/lib/content-refresh.mjs 与守卫测试 tests/content-refresh.test.mjs。',
      { code: 'REVISION_CONSTANT_NOT_FOUND' },
    );
  }
  const previous = readContentRevision(src);
  return {
    text: src.replace(/CONTENT_REVISION\s*=\s*'[^']*'/, `CONTENT_REVISION = '${revision}'`),
    previous,
    changed: previous !== revision,
  };
}

/**
 * 站点 worker 的缓存名必须**同时**来自 APP_VERSION 与 CONTENT_REVISION。
 *
 * 这条是源码级守卫（不对文本做“看起来差不多”的模糊判断）：没有它，
 * 「改了常量但缓存名没跟着改」会让整条内容更新链静默失效。
 * @returns {{ok: boolean, detail: string}}
 */
export function checkSwCacheNameShape(swText) {
  const src = String(swText);
  const cacheNameLine = /const\s+CACHE_NAME\s*=\s*([^;]+);/.exec(src);
  if (!cacheNameLine) return { ok: false, detail: 'sw.js 里找不到 `const CACHE_NAME = …;`' };
  const expr = cacheNameLine[1];
  const hasPrefix = /\$\{\s*CACHE_PREFIX\s*\}/.test(expr) || /CACHE_PREFIX\s*\+/.test(expr);
  const hasApp = /\$\{\s*APP_VERSION\s*\}/.test(expr) || /APP_VERSION\s*\+/.test(expr);
  const hasRevision = /\$\{\s*CONTENT_REVISION\s*\}/.test(expr) || /CONTENT_REVISION\s*[;)\s]/.test(expr);
  const ok = hasPrefix && hasApp && hasRevision;
  return {
    ok,
    detail: `CACHE_NAME = ${expr.trim()}（前缀=${hasPrefix ? '在' : '缺'}，APP_VERSION=${hasApp ? '在' : '缺'}，CONTENT_REVISION=${hasRevision ? '在' : '缺'}）`,
  };
}

/**
 * 把 `<dir>`（＝产物目录里的站点根）的站点外壳盖章为本次内容修订。
 *
 * 逐文件：自检「恰好 1 处常量」→ 改写 → **读回核对**（写盘后再读，证明真的落地了），
 * 并断言 `APP_VERSION` **一个字节都没变**（这是同 app 版本路径的硬约束：应用版本不动）。
 *
 * @param {{dir: string, revision: string}} opts
 */
export function stampWebShell({ dir, revision }) {
  const written = [];
  for (const rel of SHELL_STAMP_FILES) {
    const file = path.join(dir, rel);
    if (!exists(file)) throw new ReleaseError(`站点目录里缺 ${display(file)} —— 没有它就没法盖章`, { code: 'SHELL_FILE_MISSING' });
    const before = fs.readFileSync(file, 'utf8');
    const appBefore = readAppVersionConstant(before);
    const stamped = stampContentRevision(before, revision, rel);
    fs.writeFileSync(file, stamped.text, 'utf8');

    const after = fs.readFileSync(file, 'utf8');
    const readBack = readContentRevision(after);
    if (readBack !== revision) {
      throw new ReleaseError(
        `${rel} 盖章后读回的 CONTENT_REVISION=${JSON.stringify(readBack)} ≠ ${revision} —— 写盘没生效，拒绝继续`,
        { code: 'REVISION_STAMP_FAILED' },
      );
    }
    const appAfter = readAppVersionConstant(after);
    if (appAfter !== appBefore) {
      throw new ReleaseError(
        `${rel} 盖章把 APP_VERSION 也改了（${JSON.stringify(appBefore)} → ${JSON.stringify(appAfter)}）—— 本模式不得改应用版本`,
        { code: 'APP_VERSION_CHANGED_BY_STAMP' },
      );
    }
    written.push({
      rel,
      previousRevision: stamped.previous,
      revision: readBack,
      appVersion: appAfter,
      bytesBefore: Buffer.byteLength(before, 'utf8'),
      bytesAfter: Buffer.byteLength(after, 'utf8'),
      sha256After: sha256(Buffer.from(after, 'utf8')),
      changed: stamped.changed,
    });
  }
  // 只盖章不改缓存名 ＝ 这次内容更新对用户不存在；在这里就红，不等 e2e。
  const sw = fs.readFileSync(path.join(dir, 'sw.js'), 'utf8');
  const shape = checkSwCacheNameShape(sw);
  if (!shape.ok) {
    throw new ReleaseError(`sw.js 的缓存名没有同时带应用版本与内容修订：${shape.detail}`, { code: 'SW_CACHE_NAME_SHAPE' });
  }
  return { files: written, swCacheNameShape: shape };
}

// ---------------------------------------------------------------- 同 app 版本的基线

/**
 * 从 `git tag -l` 的输出里挑出**同一个应用版本**的历史发布 tag（形状 `v<appVersion>+content-<内容版>`）。
 *
 * 为什么基线必须来自 tag（而不是写死 4、也不是读“上一份 manifest”）：tag 是**一只手源**、
 * 离线可查、且正是用户真正下载过的那一版；CI 从空目录构建时也只有它还在。
 *
 * @param {{appVersion: string, tagOutput: string, excludeTag?: string|null}} opts
 * @returns {{tag: string, contentVersion: string}[]} 按 contentVersion 升序
 */
export function sameAppReleaseTags({ appVersion, tagOutput, excludeTag = null }) {
  const out = [];
  for (const line of String(tagOutput ?? '').split('\n')) {
    const tag = line.trim();
    if (!tag) continue;
    if (excludeTag && tag === excludeTag.replace(/^refs\/tags\//, '')) continue;
    const parsed = parseReleaseTag(tag);
    if (!parsed) continue;
    if (parsed.appVersion !== appVersion) continue;
    out.push({ tag, contentVersion: parsed.contentVersion });
  }
  out.sort((a, b) => compareContentVersion(a.contentVersion, b.contentVersion));
  return out;
}

/**
 * 同 app 版本路径的**基线发布**：同 app 版本里 contentVersion 最大、且不是本次 tag 的那个。
 * 没有就返回 null（调用方必须报红，不能凭空造一个基线）。
 */
export function pickSameAppBaseline({ appVersion, tagOutput, currentTag = null }) {
  const tags = sameAppReleaseTags({ appVersion, tagOutput, excludeTag: currentTag });
  if (tags.length === 0) return null;
  const baseline = tags[tags.length - 1];
  return { ...baseline, all: tags };
}

/**
 * 内容版本必须**严格大于**基线（线上真值与基线 tag 两者都要比）。
 * 返回 `{ok, detail}`；不 ok 时 detail 说明是哪一边没过。
 */
/**
 * 上一版发布（**升版发布**时的旧基底）：全部发布 tag 里 contentVersion 最大的那个（排除本次 tag）。
 *
 * 为何需要单独一个（2026-10-18，0.1.4 发布准备时发现）：`pickSameAppBaseline` 按**应用版本相等**筛，
 * 而升版发布时「上一版」的应用版本本来就**不相等**（0.1.4 的基底是 0.1.3）⇒ 旧基底永远找不到，
 * 于是 `format 2 → format 3` 的过渡就没人验（旧行为是静默“没验”，而「没验」不能被读成通过）。
 *
 * @param {{tagOutput: string, excludeTag?: string|null}} opts
 * @returns {{tag: string, appVersion: string, contentVersion: string}|null}
 */
export function pickPreviousReleaseBaseline({ tagOutput, excludeTag = null }) {
  let best = null;
  for (const line of String(tagOutput ?? '').split('\n')) {
    const tag = line.trim();
    if (!tag) continue;
    if (excludeTag && tag === String(excludeTag).replace(/^refs\/tags\//, '')) continue;
    const parsed = parseReleaseTag(tag);
    if (!parsed) continue;
    if (!best) { best = { tag, ...parsed }; continue; }
    try {
      if (compareContentVersion(parsed.contentVersion, best.contentVersion) > 0) best = { tag, ...parsed };
    } catch {
      /* 形状不合法的 tag 不参与比较 */
    }
  }
  return best;
}

export function compareAgainstBaselines({ contentVersion, liveContentVersion, baselineContentVersion }) {
  const problems = [];
  if (liveContentVersion) {
    try {
      if (compareContentVersion(contentVersion, liveContentVersion) <= 0) {
        problems.push(`不大于**线上真值** ${liveContentVersion}（线上用户已经有这一版或更新的内容）`);
      }
    } catch (e) {
      problems.push(`与线上真值 ${liveContentVersion} 无法比较：${e.message}`);
    }
  }
  if (baselineContentVersion) {
    try {
      if (compareContentVersion(contentVersion, baselineContentVersion) <= 0) {
        problems.push(`不大于**基线发布** ${baselineContentVersion}`);
      }
    } catch (e) {
      problems.push(`与基线发布 ${baselineContentVersion} 无法比较：${e.message}`);
    }
  }
  return {
    ok: problems.length === 0,
    detail: problems.length === 0
      ? `线上 ${liveContentVersion ?? '（未取）'} / 基线 ${baselineContentVersion ?? '（未取）'} → 本次 ${contentVersion}`
      : problems.join('；'),
  };
}

/** 解析 `git diff --name-only` 的输出（去空行、统一 `/`）。 */
export function parseChangedPaths(output) {
  return String(output ?? '')
    .split('\n')
    .map((s) => s.trim().replace(/\\/g, '/'))
    .filter(Boolean);
}

/**
 * 把「相对基线 tag 的改动路径」分成三类，供 check-ready 打印与判定。
 *  - `frozen`：**不许动**的产品文件（渲染/解析/样式/标记……）—— 非空即红；
 *  - `allowlisted`：本模式**显式允许**动的文件（每条带理由，见 WEB_PRODUCT_CHANGE_ALLOWLIST）；
 *  - `unexpected`：其余（既没冻结也没登记）—— 非空即红（要么它真该发布，那就登记；要么它不该动）。
 */
export function classifyWebChanges(paths) {
  const frozen = [];
  const allowlisted = [];
  const unexpected = [];
  const allowed = new Map(WEB_PRODUCT_CHANGE_ALLOWLIST.map((e) => [e.path, e.reason]));
  for (const p of paths) {
    if (WEB_PRODUCT_FROZEN.includes(p)) frozen.push(p);
    else if (allowed.has(p)) allowlisted.push(p);
    else unexpected.push(p);
  }
  return { frozen, allowlisted, unexpected };
}

/**
 * 同 app 版本路径的硬前置：tag 里的应用版本必须**等于**代码里的 APP_VERSION。
 * （`v0.1.3+content-…` 却把 APP_VERSION 写成 0.1.4 是自相矛盾的发布，必须拒绝。）
 */
export function assertTagAppVersionMatches({ tagAppVersion, appVersion }) {
  if (!tagAppVersion) {
    throw new ReleaseError(
      `本模式的 tag 必须带应用版本（${RELEASE_TAG_HINT}），否则无法证明“应用版本没变”：收到 tag 里没有应用版本`,
      { code: 'USAGE' },
    );
  }
  if (tagAppVersion !== appVersion) {
    throw new ReleaseError(
      [
        `tag 里的应用版本 ${tagAppVersion} ≠ 代码里的 APP_VERSION ${appVersion}。`,
        '  · 只想换内容、不动应用版本 ⇒ tag 写成 v' + appVersion + '+content-<新内容版本>；',
        '  · 真的换了应用代码 ⇒ 那是**升版发布**，不要用 --same-app-content-refresh（要走默认模式的全部升版门）。',
      ].join('\n'),
      { code: 'USAGE' },
    );
  }
  return `tag 应用版本 ${tagAppVersion} == APP_VERSION ${appVersion}`;
}
