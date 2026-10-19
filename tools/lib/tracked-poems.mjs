// 「已跟踪的诗源清单」的**唯一读取口**。
//
// 为什么要有这个模块（2026-10-19 实测的脆弱点，不是设想）：
//   `tests/tags.test.mjs` 原来直接 `spawnSync('git', ['ls-files', …])`。在真实仓（有 `.git`）里当然没问题，
//   但发布侧的两类目录**本来就没有 `.git`**：
//     ① `git archive` 展开目录（解到仓库外）：
//        `git ls-files` 直接 `fatal: not a git repository`，退出码 128 ⇒ 断言变红。
//        红的是**环境没给清单**，不是内容坏了。
//     ② 仓库内部的副本（`release/out/.work/...` 之类，解包/复制都没有 `.git`）：
//        git 会**向上解析到父仓**（`rev-parse --show-toplevel` 返回父仓根），
//        而 `ls-files -- content/poems` 是在副本 cwd 下取路径 ⇒ **返回空列表、退出码 0**。
//        于是断言变成「已跟踪的诗源文件为空」，比 ① 更容易误导。
//   ⇒ 结论：清单不能只从「当前目录恰好有 .git」处取；必须有一个在无 `.git` 目录里也在的来源。
//
// 来源优先级（每个来源**要么给出清单，要么明确说没给**，绝不静默假装通过）：
//   1. 环境变量 `SUOFEI_TRACKED_POEMS` 指向的文件（NUL 分隔；也接受换行分隔）——发布/CI 的显式注入；
//   2. 当前目录**就是 git 仓库根**时，`git ls-files -z -- content/poems`（真实仓的权威来源）；
//      **只认根**：向上解析到父仓一律不算（那正是 ② 的坑）；
//   3. 已提交清单 `content/tracked-poems.json`（由 `tools/gen-tracked-poems-manifest.mjs` 生成）；
//      它在 `git archive` 里随已提交内容一起存在，所以在无 `.git` 的目录里也能读到；
//   4. 都没有 ⇒ 抛 `TrackedPoemsUnavailable`：**「未提供清单 ⇒ 这一条没查」**，测试据此判红，
//      而不是把空清单当成「已跟踪 0 首」。
//
// 为什么清单要提交进仓库、又不能靠人手维护：
//   `git archive` 只能打包**已提交**内容，解包方未必有 `.git`；所以清单必须是提交态的一部分。
//   但它是**生成物**：真实仓里 `tests/tracked-poems-manifest.test.mjs` 会拿 `git ls-files` 逐条比对，
//   过期即红并打印重新生成的命令 ⇒ 没有「让人记着改名单」这一步。

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/** 显式注入清单的环境变量（值是清单文件路径）。 */
export const TRACKED_POEMS_ENV = 'SUOFEI_TRACKED_POEMS';
/** 已提交清单（相对仓库根）。 */
export const TRACKED_POEMS_MANIFEST_REL = 'content/tracked-poems.json';
/** 清单生成器（错误文案里直接给命令）。 */
export const TRACKED_POEMS_GENERATOR = 'tools/gen-tracked-poems-manifest.mjs';

/** 清单来源/格式问题的统一错误类型（测试里读 `message` 原样输出，不吞细节）。 */
export class TrackedPoemsError extends Error {
  /**
   * @param {'TRACKED_POEMS_UNAVAILABLE'|'TRACKED_POEMS_BAD_SOURCE'} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = 'TrackedPoemsError';
    this.code = code;
  }
}

/** 统一展示用正斜杠（清单里也一律存正斜杠，跨平台可比）。 */
function toSlash(p) {
  return p.split(path.sep).join('/');
}

/** 两个路径是否指向**同一个目录**（Windows 大小写不敏感；解析不存在的路径也能比）。 */
export function sameRepoRoot(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const norm = (p) => {
    let r = path.resolve(p);
    try {
      r = fs.realpathSync.native ? fs.realpathSync.native(r) : fs.realpathSync(r);
    } catch {
      /* 路径不存在时保留 resolve 结果 */
    }
    return process.platform === 'win32' ? r.toLowerCase() : r;
  };
  return norm(a) === norm(b);
}

/**
 * 把任意来源的原始路径列表整成「相对仓库根、正斜杠、只留 .md」。
 * 绝对路径与 `..` 一律报错：清单是数据，不允许借它读出仓库根之外。
 * @param {Iterable<unknown>} rawList
 * @returns {string[]}
 */
export function normalizePoemPaths(rawList) {
  /** @type {string[]} */
  const out = [];
  for (const raw of rawList) {
    if (typeof raw !== 'string') continue;
    const p = raw.replace(/^\uFEFF/, '').replace(/\r$/, '').replace(/\\/g, '/').trim();
    if (p === '') continue;
    if (path.posix.isAbsolute(p) || p.split('/').includes('..')) {
      throw new TrackedPoemsError(
        'TRACKED_POEMS_BAD_SOURCE',
        `清单里的路径必须是相对仓库根的路径、且不得含「..」：${JSON.stringify(raw)}`,
      );
    }
    if (!p.toLowerCase().endsWith('.md')) continue;
    out.push(p);
  }
  return out;
}

/**
 * 从「当前目录就是 git 仓库根」读已跟踪诗源。
 * 注意：**只认根**。不是根（包括「向上能找到一个父仓」）就不算可用来源。
 * @param {string} root
 * @returns {{ok: true, toplevel: string, paths: string[]} | {ok: false, reason: string}}
 */
export function readGitTrackedPoems(root) {
  const rp = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8' });
  if (rp.error) return { ok: false, reason: `git 不可用（${rp.error.code ?? rp.error.message}）` };
  if (rp.status !== 0) {
    return {
      ok: false,
      reason: `这里不是 git 仓库（git rev-parse 退出 ${rp.status}）：${(rp.stderr || '').trim()}`,
    };
  }
  const toplevel = (rp.stdout || '').trim();
  if (!sameRepoRoot(toplevel, root)) {
    return {
      ok: false,
      reason:
        `这里不是**仓库根**：git 向上解析到的根是 ${toplevel || '（空）'}，而当前目录是 ${path.resolve(root)}。` +
        '只认根 —— 父仓的已跟踪清单不是这个副本自己的清单。',
    };
  }
  const ls = spawnSync('git', ['ls-files', '-z', '--', 'content/poems'], { cwd: root, encoding: 'utf8' });
  if (ls.error) return { ok: false, reason: `git ls-files 跑不起来（${ls.error.code ?? ls.error.message}）` };
  if (ls.status !== 0) {
    return { ok: false, reason: `git ls-files 失败（退出 ${ls.status}）：${(ls.stderr || '').trim()}` };
  }
  return { ok: true, toplevel, paths: normalizePoemPaths((ls.stdout ?? '').split('\0')) };
}

/**
 * 读已提交清单。文件不存在 ⇒ `null`（由调用方继续往下试）；存在但坏了 ⇒ **报错**，
 * 不静默跳过（坏的清单假装不存在，会让人误以为「这里本来就没有清单」）。
 * @param {string} root
 * @returns {{file: string, paths: string[]} | null}
 */
export function readTrackedPoemsManifest(root) {
  const file = path.join(root, TRACKED_POEMS_MANIFEST_REL);
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err?.code === 'ENOENT') return null;
    throw new TrackedPoemsError(
      'TRACKED_POEMS_BAD_SOURCE',
      `已提交清单读不了：${file}（${err?.code ?? err?.message}）`,
    );
  }
  let doc;
  try {
    doc = JSON.parse(text);
  } catch (err) {
    throw new TrackedPoemsError(
      'TRACKED_POEMS_BAD_SOURCE',
      `已提交清单不是合法 JSON：${file}：${err.message}。修法：在真实仓根运行 node ${TRACKED_POEMS_GENERATOR}`,
    );
  }
  if (!doc || !Array.isArray(doc.paths)) {
    throw new TrackedPoemsError(
      'TRACKED_POEMS_BAD_SOURCE',
      `已提交清单缺少 paths 数组：${file}。修法：在真实仓根运行 node ${TRACKED_POEMS_GENERATOR}`,
    );
  }
  return { file: toSlash(path.relative(root, file)), paths: normalizePoemPaths(doc.paths) };
}

/**
 * 解析「已跟踪诗源清单」。**要么返回清单，要么抛错**（绝不返回「看起来像空清单」的猜测）。
 * @param {string} root 仓库根（副本里就是副本根）
 * @param {{env?: Record<string, string|undefined>}} [opts]
 * @returns {{paths: string[], source: string, detail: string}}
 */
export function readTrackedPoemPaths(root, { env = process.env } = {}) {
  /** @type {string[]} */
  const reasons = [];

  const injected = env?.[TRACKED_POEMS_ENV];
  if (typeof injected === 'string' && injected.trim() !== '') {
    let text;
    try {
      text = fs.readFileSync(injected, 'utf8');
    } catch (err) {
      throw new TrackedPoemsError(
        'TRACKED_POEMS_BAD_SOURCE',
        `环境变量 ${TRACKED_POEMS_ENV} 指向的清单读不了：${injected}（${err?.code ?? err?.message}）。` +
          '既然设置了就必须能读 —— 不会悄悄改用别的来源。',
      );
    }
    const raw = text.includes('\0') ? text.split('\0') : text.split(/\r?\n/);
    return { paths: normalizePoemPaths(raw), source: `env:${TRACKED_POEMS_ENV}`, detail: injected };
  }

  const git = readGitTrackedPoems(root);
  if (git.ok) {
    return {
      paths: git.paths,
      source: 'git ls-files',
      detail: `git ls-files -z -- content/poems（仓库根 ${git.toplevel}）`,
    };
  }
  reasons.push(`git ls-files：${git.reason}`);

  const manifest = readTrackedPoemsManifest(root);
  if (manifest) {
    return {
      paths: manifest.paths,
      source: `manifest:${TRACKED_POEMS_MANIFEST_REL}`,
      detail: manifest.file,
    };
  }
  reasons.push(`已提交清单不存在：${path.join(root, TRACKED_POEMS_MANIFEST_REL)}`);

  throw new TrackedPoemsError(
    'TRACKED_POEMS_UNAVAILABLE',
    [
      '未提供「已跟踪诗源清单」⇒ 这一条用例**没查**，不是通过。',
      '  查过的来源：',
      `    · 环境变量 ${TRACKED_POEMS_ENV}：未设置`,
      ...reasons.map((r) => `    · ${r}`),
      `  修法：在真实仓根运行 node ${TRACKED_POEMS_GENERATOR} 生成/更新清单；` +
        `或由调用方设置 ${TRACKED_POEMS_ENV}=<清单文件>（NUL 或换行分隔的相对路径）。`,
    ].join('\n'),
  );
}
