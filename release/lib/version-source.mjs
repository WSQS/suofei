// 发布流水线 F：**contentVersion 从哪来的可配置点**。
//
// ⚠️ 这不是「负责人已经定好的方案」：契约 §4.1 只定死了「版本串长什么样、怎么比较、
// 必须单调」；**「发布时这个号由谁产生」是接口决定，待用户拍板**（IF-19 的尾巴）。
// 所以本文件把候选实现摆出来、谁都不当默认，流水线在没有显式输入时**直接失败**，
// 不偷偷选一个来源（偷偷选就等于替用户拍板）。
//
// 候选（代价见 docs/design/release-pipeline.md §3）：
//   A. explicit     人工传 --content-version（最笨、最可控、最容易忘）
//   B. tag          tag 名里写版本（人工拍板 + 可追溯，CI 触发天然可用）
//   C. date         日期 + 当日递增（自动，但依赖「当天已有版本」的可见性）
//   D. version-file 仓库里一个提交的版本文件（人工改它＝发布动作）

import fs from 'node:fs';
import path from 'node:path';
import { ReleaseError, REPO_ROOT, git } from './util.mjs';
// 契约线的版本比较实现**唯一处**（C 线）。直接 import 它，而不是自己再写一份逐段比较
// —— 两份实现迟早会漂移，而「谁更新」的判定必须两端 + 流水线同句。
import { compareContentVersion } from '../../tools/lib/version.mjs';

/** 发布内容版本形状（与 tools/lib/version.mjs 的 RELEASE_VERSION_RE 同形状）。 */
export const RELEASE_VERSION_RE = /^(\d{4})\.(\d{2})\.(\d{2})\.(\d+)$/;

/**
 * 发布 tag 的形状（2026-10-16 用户拍板）：**一个 tag 同时带两个号**
 *
 *   v<应用资源版本>+content-<内容版本>      例如 v0.2.0+content-2026.10.14.2
 *
 * 应用版本就是 Web 的 APP_VERSION（站点缓存键，必须先子），内容版本就是 contentVersion（契约 §4.1）。
 * 两个号都必须解析得出来；少一个、或形状不符 ⇒ **拒绝发布**（不猜、不填默认）。
 */
export const RELEASE_TAG_RE = /^(?:refs\/tags\/)?v?(\d+(?:\.\d+)*)\+content-(\d{4}\.\d{2}\.\d{2}\.\d+)$/;

/** tag 期望格式（错误信息里直接复用，不手写两遍）。 */
export const RELEASE_TAG_HINT = 'v<应用资源版本>+content-<内容版本>，例如 v0.2.0+content-2026.10.14.2';

/** @returns {{appVersion: string, contentVersion: string}|null} */
export function parseReleaseTag(tag) {
  const m = RELEASE_TAG_RE.exec(String(tag).trim());
  if (!m) return null;
  return { appVersion: m[1], contentVersion: m[2] };
}

/** 候选 A：人工显式给（**本地演练**用途；正式发布以 tag 为准）。 */
function fromExplicit(value) {
  if (!RELEASE_VERSION_RE.test(value)) {
    throw new ReleaseError(
      `--content-version 必须是发布版本 YYYY.MM.DD.N（本地派生版本 0.0.0-dev+… 不可发布），收到：${value}`,
      { code: 'USAGE' },
    );
  }
  return {
    contentVersion: value,
    appVersion: null,
    source: `explicit(--content-version=${value})，**本地演练用途**；正式发布以 tag（${RELEASE_TAG_HINT}）为准`,
  };
}

/** 候选 B（已拍板）：从 tag 名解析出**两个号**。 */
function fromTag(tag) {
  const parsed = parseReleaseTag(tag);
  if (!parsed) {
    throw new ReleaseError(
      `tag 名解析不出两个版本号：${tag}\n  期望格式：${RELEASE_TAG_HINT}\n  （缺号或形状不符一律拒绝 —— 不猜、不填默认）`,
      { code: 'USAGE' },
    );
  }
  return {
    contentVersion: parsed.contentVersion,
    appVersion: parsed.appVersion,
    source: `tag(${tag} → 应用 ${parsed.appVersion} / 内容 ${parsed.contentVersion})`,
  };
}

/** 候选 C：当天日期 + 「当天已有最大 N」+1。N 的来源是 git tag（仓库里唯一可查的发布记录）。 */
function fromDate() {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '.');
  const tags = git(['tag', '--list']);
  if (tags === null) {
    throw new ReleaseError(
      '--version-source date 需要 git 与仓库里的 tag（用来数「当天已经发到第几个」）；本机 git 不可用或不在仓库里',
      { code: 'USAGE' },
    );
  }
  let maxN = 0;
  for (const line of tags.split('\n')) {
    const parsed = parseReleaseTag(line);
    if (!parsed) continue;
    const m = RELEASE_VERSION_RE.exec(parsed.contentVersion);
    if (m && `${m[1]}.${m[2]}.${m[3]}` === today) maxN = Math.max(maxN, Number(m[4]));
  }
  const version = `${today}.${maxN + 1}`;
  return {
    contentVersion: version,
    appVersion: null,
    source: `date(UTC ${today}，当天 tag 里最大 N=${maxN} → ${version})，**本地演练用途**；正式发布以 tag（${RELEASE_TAG_HINT}）为准`,
  };
}

/**
 * 解析「本次发布的 contentVersion 是谁给的」。
 * 没给任何来源 ⇒ **失败**（不默认任何一种，见文件头）。
 */
export function resolveVersionRequest({ explicit, tag, source }) {
  const given = [explicit, tag, source].filter((v) => v != null && v !== '');
  if (given.length === 0) {
    throw new ReleaseError(
      [
        '没给 contentVersion 的来源，且**没有默认值**：',
        `- 正式发布用 tag：--tag ${RELEASE_TAG_HINT}`,
        '- 本地演练可以显式给：--content-version <YYYY.MM.DD.N> / --version-source date',
        '没给来源时流水线不替你选（发布锚点必须是人给的）。',
      ].join('\n'),
      { code: 'VERSION_SOURCE_NOT_DECIDED' },
    );
  }
  if (given.length > 1) {
    throw new ReleaseError(
      '同时给了多种 contentVersion 来源，只能选一种（--content-version / --tag / --version-source）',
      { code: 'USAGE' },
    );
  }
  if (explicit != null && explicit !== '') return fromExplicit(explicit);
  if (tag != null && tag !== '') return fromTag(tag);
  if (source === 'date') return fromDate();
  throw new ReleaseError(
    `--version-source ${source} 尚未实现或还需配套参数（可选：date；候选 D「version-file」见 release-pipeline.md §3）`,
    { code: 'USAGE' },
  );
}

/**
 * 单调性基线（「上一版」）的解析。
 *   - 显式 `--previous-version` 给了就**就用它**（不再与其他候选比大小）。
 *     否则：本地已有产物（或 :out:/release-manifest.json 里更新的那一个）会把
 *     显式值盖掉 —— 真要重发同一个版本号时，人会得到一条莫名其妙的 VERSION_NOT_MONOTONIC。
 *   - 没给显式值时，按优先级取**最大**的一个：
 *       1. 已提交进仓库的内置内容（`android/app/src/main/assets/content/content.json`）
 *          —— 上一次随 APK 真正发出去的版本；
 *       2. 已有的 release/out/release-manifest.json（本机上跑过的上一次发布）；
 *       3. **已有的发布 tag**（`v<应用>+content-<内容>`）—— CI 从空目录构建、或在
 *          「内置内容已随发布准备提交到本次版本」的树上构建时，前两个候选会等于本次版本
 *          （那就不是“上一版”），这时唯一的一手源就是旧 tag。
 *   - ⚠️ 2026-10-18（0.1.4 发布准备时真踩到）：发布准备会先把新内容编进仓库里的内置产物
 *     （三份同源），于是候选 1 就是本次的 2026.10.18.3 ⇒ 不筛掉的话流水线会报
 *     「新版本 2026.10.18.3 不大于上一版 2026.10.18.3」而**在建 APK 之前**就失败。
 *     所以：**等于本次版本的候选不算基线**（它不是“上一版”），并补上发布 tag 这一路。
 * 都没有就返回 null，流水线会打印「未提供上一版、跳过了单调性检查」—— 不假装检查过。
 *
 * @param {{explicit?: string|null, manifestFile: string, currentVersion?: string|null, tagOutput?: string|null}} opts
 */
export function resolvePreviousVersion({ explicit, manifestFile, currentVersion = null, tagOutput = null }) {
  if (explicit != null && explicit !== '') {
    return { version: explicit, source: `explicit(--previous-version=${explicit})，不再与其他候选比大小` };
  }
  /** “上一版”必须严格小于本次（等于本次它就不是上一版）。 */
  const isOlder = (v) => {
    if (!currentVersion) return true;
    try {
      return compareContentVersion(v, currentVersion) < 0;
    } catch {
      return true;
    }
  };
  const candidates = [];
  const skipped = [];
  const bundled = path.join(REPO_ROOT, 'android/app/src/main/assets/content/content.json');
  try {
    const doc = JSON.parse(fs.readFileSync(bundled, 'utf8'));
    if (typeof doc.contentVersion === 'string' && doc.contentVersion !== '') {
      const src = '已提交的内置内容 android/app/src/main/assets/content/content.json';
      if (isOlder(doc.contentVersion)) candidates.push({ version: doc.contentVersion, source: src });
      else skipped.push(`${doc.contentVersion}（${src}）`);
    }
  } catch {
    /* 读不到就不作为候选，不猜 */
  }
  try {
    const doc = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    if (typeof doc.contentVersion === 'string' && doc.contentVersion !== '') {
      const src = '上次的 release/out/release-manifest.json';
      if (isOlder(doc.contentVersion)) candidates.push({ version: doc.contentVersion, source: src });
      else skipped.push(`${doc.contentVersion}（${src}）`);
    }
  } catch {
    /* 同上 */
  }
  // 候选 3：发布 tag（一手、离线可查；CI 的 fetch-depth: 0 里就有）。
  if (tagOutput) {
    for (const line of String(tagOutput).split('\n')) {
      const parsed = parseReleaseTag(line.trim());
      if (!parsed) continue;
      if (!isOlder(parsed.contentVersion)) continue;
      candidates.push({ version: parsed.contentVersion, source: `发布 tag ${line.trim()}` });
    }
  }
  if (candidates.length === 0) return { version: null, source: null, skipped };

  // 用与编译器和客户端同一套比较规则挑最大值。
  let best = candidates[0];
  for (const c of candidates.slice(1)) {
    try {
      if (compareContentVersion(c.version, best.version) > 0) best = c;
    } catch {
      /* 形状不合法的候选不参与比较 */
    }
  }
  return { ...best, skipped };
}
