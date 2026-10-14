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

/** 发布版本形状（与 tools/lib/version.mjs 的 RELEASE_VERSION_RE 同形状）。 */
export const RELEASE_VERSION_RE = /^(\d{4})\.(\d{2})\.(\d{2})\.(\d+)$/;

/** tag 名里允许的包装：`2026.10.14.2` / `v2026.10.14.2` / `content-2026.10.14.2`。 */
export function versionFromTag(tag) {
  const name = String(tag).replace(/^refs\/tags\//, '').trim();
  const m = /^(?:v|content-|content\/)?(\d{4})\.(\d{2})\.(\d{2})\.(\d+)$/.exec(name);
  if (!m) return null;
  return `${m[1]}.${m[2]}.${m[3]}.${m[4]}`;
}

/** 候选 A：人工显式给。 */
function fromExplicit(value) {
  if (!RELEASE_VERSION_RE.test(value)) {
    throw new ReleaseError(
      `--content-version 必须是发布版本 YYYY.MM.DD.N（本地派生版本 0.0.0-dev+… 不可发布），收到：${value}`,
      { code: 'USAGE' },
    );
  }
  return { contentVersion: value, source: `explicit(--content-version=${value})` };
}

/** 候选 B：从 tag 名解析。 */
function fromTag(tag) {
  const version = versionFromTag(tag);
  if (!version) {
    throw new ReleaseError(
      `tag 名里找不到发布版本：${tag}；可接受的形状：<内容版本> / v<内容版本> / content-<内容版本>`,
      { code: 'USAGE' },
    );
  }
  return { contentVersion: version, source: `tag(${tag} → ${version})` };
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
    const version = versionFromTag(line);
    if (!version) continue;
    const m = RELEASE_VERSION_RE.exec(version);
    if (`${m[1]}.${m[2]}.${m[3]}` === today) maxN = Math.max(maxN, Number(m[4]));
  }
  const version = `${today}.${maxN + 1}`;
  return {
    contentVersion: version,
    source: `date(UTC ${today}，当天 tag 里最大 N=${maxN} → ${version})`,
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
        '「发布时这个号由谁产生」是接口决定，尚未由用户拍板（IF-19 尾部），流水线不替你选。',
        '请显式选一种：--content-version <v> / --tag <tag 名> / --version-source date',
        '候选与各自代价见 docs/design/release-pipeline.md §3。',
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
 *       2. 已有的 release/out/release-manifest.json（本机上跑过的上一次发布）。
 * 都没有就返回 null，流水线会打印「未提供上一版，跳过了单调性检查」——不假装检查过。
 */
export function resolvePreviousVersion({ explicit, manifestFile }) {
  if (explicit != null && explicit !== '') {
    return { version: explicit, source: `explicit(--previous-version=${explicit})，不再与其他候选比大小` };
  }
  const candidates = [];
  const bundled = path.join(REPO_ROOT, 'android/app/src/main/assets/content/content.json');
  try {
    const doc = JSON.parse(fs.readFileSync(bundled, 'utf8'));
    if (typeof doc.contentVersion === 'string' && doc.contentVersion !== '') {
      candidates.push({ version: doc.contentVersion, source: '已提交的内置内容 android/app/src/main/assets/content/content.json' });
    }
  } catch {
    /* 读不到就不作为候选，不猜 */
  }
  try {
    const doc = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    if (typeof doc.contentVersion === 'string' && doc.contentVersion !== '') {
      candidates.push({ version: doc.contentVersion, source: '上次的 release/out/release-manifest.json' });
    }
  } catch {
    /* 同上 */
  }
  if (candidates.length === 0) return { version: null, source: null };

  // 用与编译器和客户端同一套比较规则挑最大值。
  let best = candidates[0];
  for (const c of candidates.slice(1)) {
    try {
      if (compareContentVersion(c.version, best.version) > 0) best = c;
    } catch {
      /* 形状不合法的候选不参与比较 */
    }
  }
  return best;
}
