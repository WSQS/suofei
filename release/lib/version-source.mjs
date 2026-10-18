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
import { ReleaseError, REPO_ROOT, display, git } from './util.mjs';
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

/** 内置内容的固定位置（默认候选来源；测试可以用 `bundledFile` 指向临时文件）。 */
export const BUNDLED_CONTENT_REL = 'android/app/src/main/assets/content/content.json';

/**
 * 单调性基线（「上一版」）的解析。
 *
 * ⚠️ 2026-10-18 修正（**回退发布**能过门的真缺陷，见 tests/release-version-source.test.mjs）：
 *  旧实现对**所有**候选都用 `< 本次` 过滤 ⇒ 等于/高于本次的候选被**全部丢掉**。后果很具体：
 *  线上/已发布 tag 是 `2026.10.19.1`、本次准备 `2026.10.18.3` 时，`19.1` 被滤掉、
 *  基线退回 `2026.10.16.26` ⇒ 单调门照样绿，**一次回退发布就发出去了**。
 *
 * 现在的规则：
 *  1. **候选分层收集、一律保留**（含**更高**的）：
 *       线上真值（`liveVersion`，由调用方读好传入；本函数**不联网**）
 *       → 已发布 tag（`tagOutput`）
 *       → 已提交的内置内容
 *       → 本次 out 目录里的 release-manifest
 *       → 显式 `--previous-version`
 *  2. **只按身份排除「本次自己」**，绝不按「版本 ≥ 本次」排除：
 *       · 本次正在发的那个 tag **自身**（按 tag 名认身份，`currentTag`）；
 *       · 本次准备的**产物资产**（内置内容 / out 清单里版本号**恰好等于**本次的那些）。
 *     这两样不是“上一版”，而是这次发布自己的产物（发布准备会先把新内容编进三份同源产物）——
 *     它们必须被排除，否则 0.1.4 那次会报「新版本 X 不大于上一版 X」这种**假红**。
 *     注意：**同版本但不同名**的已发布 tag、以及线上真值，**不**算“自己” ⇒ 保留 ⇒ 由单调门报红
 *     （那条 tag 说明这个内容版本**已经被过发布**，客户端的缓存/采纳语义不会认它）。
 *  3. 取最大者当基线；**显式 `--previous-version` 只是候选之一**，不再是后门：
 *     线上真值/已发布 tag 更高时，单调门必须见到**更高那个**。
 *  4. 一个候选都没有 ⇒ 返回 null，流水线打印「未提供上一版」——**未验，不假装检查过**。
 *
 * @param {{explicit?: string|null, manifestFile?: string, currentVersion?: string|null,
 *          tagOutput?: string|null, currentTag?: string|null,
 *          liveVersion?: string|null, liveSource?: string|null, bundledFile?: string}} opts
 * @returns {{version: string|null, source: string|null, sources: string[], excluded: string[], layers: object[]}}
 */
export function resolvePreviousVersion({
  explicit,
  manifestFile,
  currentVersion = null,
  tagOutput = null,
  currentTag = null,
  liveVersion = null,
  liveSource = null,
  bundledFile = path.join(REPO_ROOT, BUNDLED_CONTENT_REL),
} = {}) {
  const candidates = [];
  const excluded = [];
  /** 候选版本号是否**恰好等于**本次（＝“这次自己”；不是“上一版”）。 */
  const isSelfVersion = (v) => {
    if (!currentVersion) return false;
    try {
      return compareContentVersion(v, currentVersion) === 0;
    } catch {
      return false;
    }
  };

  // 层 1：线上真值（调用方读好传入；更高/相等都保留 —— 相等说明这个版本已经在线上）。
  if (typeof liveVersion === 'string' && liveVersion !== '') {
    candidates.push({ version: liveVersion, layer: 'live', source: `线上内容真值（${liveSource ?? 'content/latest.json'}）` });
  }
  // 层 2：已发布 tag（一手、离线可查；CI 的 fetch-depth: 0 里就有）。
  if (tagOutput) {
    const skipTag = currentTag ? String(currentTag).trim().replace(/^refs\/tags\//, '') : null;
    for (const line of String(tagOutput).split('\n')) {
      const tag = line.trim();
      if (!tag) continue;
      const parsed = parseReleaseTag(tag);
      if (!parsed) continue;
      if (skipTag && tag.replace(/^refs\/tags\//, '') === skipTag) {
        excluded.push(`${parsed.contentVersion}（发布 tag ${tag}：**本次正在发的 tag 自身**，按名字排除）`);
        continue;
      }
      candidates.push({ version: parsed.contentVersion, layer: 'tag', source: `发布 tag ${tag}` });
    }
  }
  // 层 3：已提交的内置内容；层 4：上次的 release-manifest。
  // 这两样是**本次准备的产物资产**：版本号恰好等于本次就不是“上一版”。
  for (const [file, layer, src] of [
    [bundledFile, 'bundled', `已提交的内置内容 ${display(bundledFile)}`],
    [manifestFile, 'manifest', `上次的 ${manifestFile ? display(manifestFile) : 'release out 目录里的 release-manifest.json'}`],
  ]) {
    if (!file) continue;
    let doc = null;
    try {
      doc = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      continue; // 读不到就不作为候选，不猜
    }
    const v = doc?.contentVersion;
    if (typeof v !== 'string' || v === '') continue;
    if (isSelfVersion(v)) {
      excluded.push(`${v}（${src}：版本号就是本次 ${currentVersion}，属于**本次准备的产物资产**，不是上一版）`);
      continue;
    }
    candidates.push({ version: v, layer, source: src });
  }
  // 层 5：显式 `--previous-version`。只是**候选之一**：真值更高时它盖不住真值。
  if (explicit != null && explicit !== '') {
    candidates.push({ version: explicit, layer: 'explicit', source: `explicit(--previous-version=${explicit})` });
  }

  if (candidates.length === 0) {
    return { version: null, source: null, sources: [], excluded, layers: [], skipped: excluded };
  }

  // 用与编译器和客户端同一套比较规则挑最大值；并列时把**所有**来源都说出来（不挑一个假造因果）。
  let best = candidates[0];
  for (const c of candidates.slice(1)) {
    try {
      if (compareContentVersion(c.version, best.version) > 0) best = c;
    } catch {
      /* 形状不合法的候选不参与比较 */
    }
  }
  const tied = candidates.filter((c) => {
    try {
      return compareContentVersion(c.version, best.version) === 0;
    } catch {
      return false;
    }
  });
  const sources = tied.map((c) => c.source);
  return {
    version: best.version,
    source: sources.join(' ＋ '),
    sources,
    excluded,
    layers: candidates.map((c) => ({ layer: c.layer, version: c.version, source: c.source })),
    skipped: excluded,
  };
}

/**
 * 单调门的**显式**守卫：本次 contentVersion 必须**严格大于**基线（「上一版」）。
 *
 * 为什么要它（2026-10-18）：编译器那道门（`tools/lib/version.mjs` 的 `VERSION_NOT_MONOTONIC`）
 * 只说「新版本 X 不大于上一版 Y」，读的人分不出是**回退**（基线本来就更新）还是**重发同号**。
 * 这里在**编译之前**就把「基线比本次新」这件事点名（`VERSION_BASELINE_AHEAD`），
 * 并带上基线来源（线上真值／发布 tag／explicit…），免得人对着一个数字猜。
 *
 * 没有基线时**不假装检查过**：返回 `checked: false`，调用方据此打印「未验」。
 *
 * @param {{previous?: string|null, current: string, source?: string|null}} opts
 * @returns {{ok: true, checked: boolean, detail: string}}
 * @throws {ReleaseError} 基线更新（`VERSION_BASELINE_AHEAD`）或同号（`VERSION_NOT_MONOTONIC`）
 */
export function assertBaselineIsOlder({ previous = null, current, source = null }) {
  const where = source ? `\n  基线来源：${source}` : '';
  if (previous == null || previous === '') {
    return {
      ok: true,
      checked: false,
      detail: `没有可用的「上一版」基线 ⇒ 本次 contentVersion ${current} **没有被自动拦住**（未验，不是验过）`,
    };
  }
  let cmp;
  try {
    cmp = compareContentVersion(previous, current);
  } catch (err) {
    throw new ReleaseError(
      `单调性基线 ${previous} 与本次 ${current} 无法按同一套规则比较：${err.message}${where}`,
      { code: 'VERSION_FORMAT' },
    );
  }
  if (cmp > 0) {
    throw new ReleaseError(
      [
        `单调性基线 ${previous} **比本次 ${current} 新** ⇒ 这是一次回退发布，门不放行。`,
        `  已经拿到 ${previous}（或更新）内容/应用版本的客户端，不会把 ${current} 当成更新采用；`,
        '  若确实要发新内容，就在更高版本之上继续递增，而不是把版本号往回调。',
      ].join('\n') + where,
      { code: 'VERSION_BASELINE_AHEAD' },
    );
  }
  if (cmp === 0) {
    throw new ReleaseError(
      `单调性基线 ${previous} 与本次 ${current} 相同（要求**严格大于**上一版）：已安装的客户端不会采用它。${where}`,
      { code: 'VERSION_NOT_MONOTONIC' },
    );
  }
  return { ok: true, checked: true, detail: `单调性检查通过：${previous} → ${current}（严格递增）${where}` };
}
