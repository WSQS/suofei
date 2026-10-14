// 契约线 C：contentVersion 的产生与比较规则（定死，已写回契约第 4 节）。
//
// 为什么需要两条产生路径：
//   - 发布/更新比较需要**单调递增**：只有「人/流水线显式给出版本」才可能单调，
//     任何从内容派生的字符串（哈希、最大日期）都无法保证「改动内容后版本一定变大」。
//   - 本地与测试需要**不依赖外部输入**就能编译：于是有一个确定性派生版本，
//     同一份内容重复编译得到**同一个字符串**（不会「变化无常」误导更新检查）。
//
// 规则：
//   release：`YYYY.MM.DD.N`（年 4 位，月/日 2 位，N ≥ 1 整数）。发布与更新比较只用它。
//   dev    ：`0.0.0-dev+<sha256 前 12 位十六进制>`。由内容摘要确定性派生，永不发布。
//   比较   ：release 与 release 按 [年,月,日,N] 数值逐段比较；
//            dev 与 dev 按十六进制串比较；dev < 任意 release（core 0.0.0 最小）。
//   单调   ：显式给出 release 版本时，若已知「上一版」则要求新版本 > 上一版，否则失败。
//            dev 版本不做单调检查（它只用于本地/测试）。
//   未知格式：一律 VERSION_FORMAT 失败，不猜、不宽松。

import { createHash } from 'node:crypto';
import { ContentError } from './errors.mjs';

export const RELEASE_VERSION_RE = /^(\d{4})\.(\d{2})\.(\d{2})\.(\d+)$/;
export const DEV_VERSION_RE = /^0\.0\.0-dev\+([0-9a-f]{12})$/;

/** @param {string} value */
export function isReleaseVersion(value) {
  return typeof value === 'string' && RELEASE_VERSION_RE.test(value);
}

/** @param {string} value */
export function isDevVersion(value) {
  return typeof value === 'string' && DEV_VERSION_RE.test(value);
}

/**
 * 解析版本串。
 * @param {string} value
 * @returns {{raw: string, kind: 'release'|'dev', core: number[]|null, devHash: string|null}}
 */
export function parseContentVersion(value) {
  if (typeof value !== 'string') {
    throw new ContentError('VERSION_FORMAT', `contentVersion 必须是字符串，收到：${JSON.stringify(value)}`);
  }
  const rel = RELEASE_VERSION_RE.exec(value);
  if (rel) {
    const [, y, m, d, n] = rel;
    const core = [Number(y), Number(m), Number(d), Number(n)];
    if (core[1] < 1 || core[1] > 12 || core[2] < 1 || core[2] > 31 || core[3] < 1) {
      throw new ContentError(
        'VERSION_FORMAT',
        `contentVersion 不是合法的发布版本（月/日/N 越界）：${value}，应形如 YYYY.MM.DD.N（N≥1）`,
      );
    }
    return { raw: value, kind: 'release', core, devHash: null };
  }
  const dev = DEV_VERSION_RE.exec(value);
  if (dev) return { raw: value, kind: 'dev', core: null, devHash: dev[1] };
  throw new ContentError(
    'VERSION_FORMAT',
    `contentVersion 格式非法：${value}；发布版本应为 YYYY.MM.DD.N，本地派生版本应为 0.0.0-dev+<12位十六进制>`,
  );
}

/**
 * 全序比较两个 contentVersion。a<b 返回 -1，a>b 返回 1，相等 0。
 * @param {string} a
 * @param {string} b
 */
export function compareContentVersion(a, b) {
  const pa = parseContentVersion(a);
  const pb = parseContentVersion(b);
  if (pa.kind === 'dev' && pb.kind === 'dev') {
    if (pa.devHash === pb.devHash) return 0;
    return pa.devHash < pb.devHash ? -1 : 1;
  }
  if (pa.kind === 'dev') return -1; // dev < 任意 release
  if (pb.kind === 'dev') return 1;
  for (let i = 0; i < 4; i++) {
    if (pa.core[i] !== pb.core[i]) return pa.core[i] < pb.core[i] ? -1 : 1;
  }
  return 0;
}

/**
 * 由内容摘要派生确定性 dev 版本。同一份内容 → 同一字符串。
 * @param {string} digestHex sha256 十六进制
 */
export function deriveDevVersion(digestHex) {
  return `0.0.0-dev+${digestHex.slice(0, 12)}`;
}

/**
 * 内容摘要：对产物里「内容本身」的规范 JSON 求 sha256（不含 generatedAt / contentVersion，
 * 否则每次编译都会变，dev 版本就不确定了）。
 * @param {unknown} payload
 */
export function contentDigest(payload) {
  const canonical = JSON.stringify(payload);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * 决定本次编译使用的 contentVersion，并在给出显式 release 版本时强制单调性。
 * @param {{explicit?: string|null, previous?: string|null, digestHex: string}} opts
 * @returns {{version: string, kind: 'release'|'dev', notes: string[]}}
 */
export function resolveContentVersion({ explicit = null, previous = null, digestHex }) {
  const notes = [];
  if (explicit != null && explicit !== '') {
    const parsed = parseContentVersion(explicit);
    if (parsed.kind !== 'release') {
      throw new ContentError(
        'VERSION_FORMAT',
        `--content-version 必须是发布版本 YYYY.MM.DD.N；本地派生版本（${explicit}）不要手写`,
      );
    }
    if (previous != null && previous !== '') {
      const prev = parseContentVersion(previous);
      const cmp = compareContentVersion(explicit, previous);
      if (cmp <= 0) {
        throw new ContentError(
          'VERSION_NOT_MONOTONIC',
          `contentVersion 必须单调递增：新版本 ${explicit} 不大于上一版 ${previous}` +
            `${prev.kind === 'dev' ? '（上一版是本地派生版本，任意发布版本都应大于它）' : ''}`,
        );
      }
      notes.push(`单调性检查通过：${previous} → ${explicit}`);
    } else {
      notes.push('未提供上一版版本，跳过单调性检查（发布流水线应传入 --previous-version 或保留上一版 dist/content.json）');
    }
    return { version: explicit, kind: 'release', notes };
  }
  const version = deriveDevVersion(digestHex);
  notes.push(`未指定 --content-version，使用内容摘要派生的本地版本 ${version}（仅供本地/测试，不可发布）`);
  return { version, kind: 'dev', notes };
}
