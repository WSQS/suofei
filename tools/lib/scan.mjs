// 契约线 C：内容根的**目录扫描**（递归、排除、按路径派生 ID、全库判重）。
//
// 用户 2026-10-16 已定 C2 收口稿（`items/content-format/prototypes/rules-v3/id-final.md`）：
//   ID ＝ 相对内容根（`content/poems/`）的**完整相对路径**、去 `.md`、**`/` 统一写成 `-`**；
//   层级任意（根直接文件 / 一层 / 多层）；目录纯整理，分组只由 `dynasty` 决定。
//
// 为什么单列一个模块：扫描会碰文件系统，而校验/组装是纯函数；分开后扫描可以不经 CLI 直接测。
//
// 排除与判重的口径（逐条都能在报告里对上）：
//   - **不越出扫描根**：只在 `<content>/poems/` 之下递归；
//   - `_` 前缀（文件或目录）＋ `README*` ⇒ **忽略并计数**（说明文件不是诗）；
//   - 隐藏（`.` 开头）与临时文件（`~` 开头/结尾、`#…#`）⇒ **忽略并计数**；
//   - 符号链接 ⇒ **报错**（旧实现对 `d.isFile()` 为假的项**静默丢弃**，那是「看起来有保障、其实没有」）；
//   - 空目录 ⇒ **忽略并计数**；
//   - 非 `.md` 文件（不在排除清单里）⇒ **报错**；
//   - **判重**：`id.normalize('NFC').toLowerCase()` 相同 ⇒ 报错并**逐条列出冲突路径**。
//     把 `/` 换成 `-` 后，**路径拼出的 `-`** 与**文件名里本来就有的 `-`** 会同形 ⇒ 两个不同路径
//     可能算出同一个 ID（`古诗十九首/行行重行行.md` 与 `古诗十九首-行行重行行.md`）。不静默覆盖。

import fs from 'node:fs';
import path from 'node:path';
import { ContentError } from './errors.mjs';
import { ID_REGEX, SOURCE_EXT } from './interface.mjs';

/** 展示路径统一用正斜杠，跨平台输出稳定。 */
export function toDisplayPath(p) {
  return p.split(path.sep).join('/');
}

/** 相对路径（正斜杠）→ ID：去 `.md`、`/` → `-`。 */
export function idFromRelativePath(relPath) {
  return relPath.replace(/\.md$/i, '').replace(/\//g, '-');
}

/** 判重键：NFC ＋ 小写折叠（大小写/归一化差异视为同一 ID）。 */
export function dedupeKey(id) {
  return id.normalize('NFC').toLowerCase();
}

/** 忽略清单（**先于**非 `.md` 报错判定：README.txt 也按说明文件忽略，不报错）。 */
function ignoredReason(name) {
  if (name.startsWith('.')) return '隐藏文件/目录';
  if (name.startsWith('_')) return '_ 前缀（说明/占位）';
  if (/^README/i.test(name)) return 'README';
  if (name.startsWith('~') || name.endsWith('~')) return '临时文件';
  if (/^#.*#$/.test(name)) return '编辑器交换文件';
  return null;
}

/**
 * 递归扫描 `<poemsDir>`。
 * @param {string} poemsDir 内容根（例如 `content/poems`）
 * @returns {{records: {displayPath: string, relPath: string, id: string, text: string}[],
 *            errors: ContentError[],
 *            ignored: {total: number, byReason: Record<string, number>, emptyDirs: number}}}
 */
export function scanPoems(poemsDir) {
  /** @type {ContentError[]} */
  const errors = [];
  /** @type {{displayPath: string, relPath: string, id: string, text: string}[]} */
  const records = [];
  /** @type {Record<string, number>} */
  const byReason = {};
  let emptyDirs = 0;
  const ignore = (reason) => {
    byReason[reason] = (byReason[reason] ?? 0) + 1;
  };

  const walk = (dir, relPrefix) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      if (e?.code === 'ENOENT') {
        throw new ContentError('CONTENT_DIR_MISSING', `内容目录不存在：${toDisplayPath(poemsDir)}`);
      }
      throw e;
    }
    if (entries.length === 0 && relPrefix !== '') {
      emptyDirs += 1;
      return;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const d of entries) {
      const rel = relPrefix === '' ? d.name : `${relPrefix}/${d.name}`;
      const abs = path.join(dir, d.name);
      const displayPath = toDisplayPath(abs);

      if (d.isSymbolicLink()) {
        errors.push(
          new ContentError(
            'SOURCE_SYMLINK',
            `内容根里出现符号链接：${displayPath}。扫描不跟随符号链接（旧实现会静默丢弃它）——请把它换成真实文件或目录，或移出内容根。`,
            { file: displayPath },
          ),
        );
        continue;
      }
      const reason = ignoredReason(d.name);
      if (reason !== null) {
        ignore(reason);
        continue;
      }
      if (d.isDirectory()) {
        walk(abs, rel);
        continue;
      }
      if (!d.name.toLowerCase().endsWith(SOURCE_EXT)) {
        errors.push(
          new ContentError(
            'SOURCE_NOT_MARKDOWN',
            `内容根里出现非 ${SOURCE_EXT} 文件：${displayPath}。诗只认 ${SOURCE_EXT}；说明性文字请用 \`_\` 前缀或 \`README\`（会被忽略并计数），或移出内容根。`,
            { file: displayPath },
          ),
        );
        continue;
      }
      const id = idFromRelativePath(rel);
      if (!ID_REGEX.test(id)) {
        errors.push(
          new ContentError(
            'ID_INVALID',
            `由相对路径派生的 id「${id}」不合正面约束（非空、不含 \`/\`、不含控制字符与反斜杠）——请改文件名或目录名。`,
            { file: displayPath },
          ),
        );
        continue;
      }
      records.push({ displayPath, relPath: rel, id, text: fs.readFileSync(abs, 'utf8') });
    }
  };

  walk(poemsDir, '');

  // 注意：**全库判重不在这里做**。判重要对「全部诗」的 ID 做 NFC＋大小写折叠比较，
  // 而它属于校验（会跟别的校验错误一起报、按同一条出口退出），所以放在
  // content-build.mjs 的 buildContentFromRecords 里（用本文件的 dedupeKey，口径只有一处）。
  const ignored = {
    total: Object.values(byReason).reduce((n, v) => n + v, 0) + emptyDirs,
    byReason,
    emptyDirs,
  };
  return { records, errors, ignored };
}
