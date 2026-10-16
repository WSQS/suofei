// 契约线 C：Markdown → JSON 的解析、校验与排序（纯函数，便于测试）。
//
// 校验条目与错误码一一对应，见契约 docs/design/content-contract.md 第 3 节。
//
// formatVersion=2（2026-10-16）起源格式是：
//   front matter（必填 title/author/dynasty/source，可选 genre/orderInSource）＋ 正文区（原文，空行＝分段）
//   ＋ 可选的两个节 `## 详情` / `## 笔记`（内容是**最小 Markdown 文本**，整段进 detail/notes）。
//   `id` 不写在源里（由相对路径派生，见 scan.mjs）。

import { ContentError } from './errors.mjs';
import { parseFrontMatterLines, splitFrontMatter } from './frontmatter.mjs';
import { dynastyLabels, dynastyOrderOf, lookupDynasty } from './dynasties.mjs';
import { checkMarkdownLine, codeFenceMessage, fenceMarker, vis } from './markdown.mjs';
import { dedupeKey } from './scan.mjs';
import { contentDigest, resolveContentVersion } from './version.mjs';
import {
  ALL_FRONT_MATTER_KEYS,
  DEFAULT_ORDER_STRATEGY,
  FORMAT_VERSION,
  KNOWN_SECTIONS,
  OPTIONAL_FRONT_MATTER_KEYS,
  PINYIN_COLLATOR_LOCALE,
  REMOVED_FRONT_MATTER_KEYS,
  REQUIRED_FRONT_MATTER_KEYS,
  SECTION_DETAIL,
  SECTION_NOTES,
  SORT_STRATEGIES,
  UNKNOWN_AUTHOR_MARKERS,
} from './interface.mjs';

// 便于同线测试/工具从一处取用（定义仍在 interface.mjs）。
export {
  DEFAULT_ORDER_STRATEGY,
  FORMAT_VERSION,
  PINYIN_COLLATOR_LOCALE,
  SORT_STRATEGIES,
  UNKNOWN_AUTHOR_MARKERS,
};
export const REQUIRED_KEYS = REQUIRED_FRONT_MATTER_KEYS;
export const OPTIONAL_KEYS = OPTIONAL_FRONT_MATTER_KEYS;

/**
 * 正文 → 分段数组。空行是段边界，段内不丢行；首尾空行与连续空行折叠，不产生空段。
 * 行尾空白被去掉，行首空白保留（原文可能用缩进表示续行）。
 * @param {string[]} bodyLines
 * @returns {string[][]}
 */
export function buildStanzas(bodyLines) {
  /** @type {string[][]} */
  const stanzas = [];
  /** @type {string[]} */
  let cur = [];
  for (const raw of bodyLines) {
    const line = raw.replace(/[ \t]+$/, '');
    if (line.trim() === '') {
      if (cur.length > 0) {
        stanzas.push(cur);
        cur = [];
      }
      continue;
    }
    cur.push(line);
  }
  if (cur.length > 0) stanzas.push(cur);
  return stanzas;
}

/** @param {string} author */
export function isUnknownAuthor(author) {
  const a = typeof author === 'string' ? author.trim() : '';
  if (a === '') return true;
  return UNKNOWN_AUTHOR_MARKERS.includes(a);
}

/** 节正文 → 产物值：去掉首尾空行后按 `\n` 连接；**空节（含只有空白字符）⇒ null，键仍在**。 */
function sectionText(lines) {
  const ls = [...lines];
  while (ls.length && ls[0].trim() === '') ls.shift();
  while (ls.length && ls[ls.length - 1].trim() === '') ls.pop();
  return ls.length ? ls.join('\n') : null;
}

/** 节标题分界：行首**恰好** `## ` 后跟非空节名。`###`/`##详情` 都不是分界。 */
const SECTION_RE = /^##\s+(\S.*)$/;

/**
 * 解析**单首**诗的源文本（纯函数：不吃文件系统）。返回 errors 而不抛异常，便于一次报出全部问题。
 * @param {{displayPath: string, id: string, text: string}} record
 * @returns {{poem: object|null, errors: ContentError[], id: string, draft: {stanzas: string[][], detail: string|null, notes: string|null}}}
 */
export function parsePoemRecord(record) {
  const file = record.displayPath;
  /** @type {ContentError[]} */
  const errors = [];
  const push = (code, message, line = null) => errors.push(new ContentError(code, message, { file, line }));
  /** @type {Record<string, unknown>} */
  let data = null;
  /** @type {string[]} */
  let bodyLines = [];
  let bodyLineOffset = 0;
  /** @type {string[]} */
  let fmLines = [];
  let fmLineOffset = 0;

  try {
    const split = splitFrontMatter(record.text, file);
    bodyLines = split.bodyLines;
    bodyLineOffset = split.bodyLineOffset;
    fmLines = split.fmLines;
    fmLineOffset = split.fmLineOffset;
    data = parseFrontMatterLines(split.fmLines, file, split.fmLineOffset);
  } catch (e) {
    if (e instanceof ContentError) {
      return { poem: null, errors: [e], id: record.id, draft: { stanzas: [], detail: null, notes: null } };
    }
    throw e;
  }

  /** front matter 某个顶层键的行号（键缺失时给 null）。「每条诊断带文件:行号」要求键级诊断也带位置。 */
  const keyLine = (key) => {
    const re = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`);
    for (let i = 0; i < fmLines.length; i++) {
      if (re.test(fmLines[i])) return fmLineOffset + i;
    }
    return null;
  };

  // front matter 键：id 禁止 / 旧键已删 / 其余未声明 ⇒ 都不静默。
  for (const key of Object.keys(data)) {
    if (key === 'id') {
      push(
        'FORBIDDEN_ID_KEY',
        '源 MD 不得写 `id`：ID 由内容根下的相对路径生成（去 `.md`、`/` 统一写成 `-`）。删掉这一行，产物里的 `id` 键仍会保留。',
        keyLine(key),
      );
      continue;
    }
    if (REMOVED_FRONT_MATTER_KEYS.includes(key)) {
      push(
        'REMOVED_KEY',
        `新格式（formatVersion=2）已去掉源字段 \`${key}\`（旧格式 formatVersion=1 的写法）。本工具**不把它静默转成新字段**：请删掉它；要保留的考据内容改写进 \`## 详情\` 节（用户笔记用 \`## 笔记\`）。`,
        keyLine(key),
      );
      continue;
    }
    if (!ALL_FRONT_MATTER_KEYS.includes(key)) {
      push(
        'UNKNOWN_KEY',
        `front matter 出现声明之外的键「${key}」；允许的键：必填 ${REQUIRED_KEYS.join('/')}，可选 ${OPTIONAL_KEYS.join('/')}`,
        keyLine(key),
      );
    }
  }

  // 必填键存在且非空
  for (const key of REQUIRED_KEYS) {
    const v = data[key];
    const missing = v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
    if (missing) {
      push(
        'MISSING_REQUIRED_KEY',
        `必填键「${key}」缺失或值为空。允许的键：${REQUIRED_KEYS.concat(OPTIONAL_KEYS).join(' / ')}`,
        fmLineOffset - 1,
      );
    }
  }

  // 文本字段类型 + 朝代精确匹配
  for (const key of ['title', 'author', 'dynasty', 'source']) {
    const v = data[key];
    if (v !== undefined && v !== null && typeof v !== 'string') {
      push('FIELD_TYPE', `「${key}」必须是字符串，实际是 ${Array.isArray(v) ? '列表' : typeof v}`, keyLine(key));
    }
  }
  const genre = data.genre;
  if (genre !== undefined && genre !== null && typeof genre !== 'string') {
    push('FIELD_TYPE', `「genre」必须是字符串或留空，实际是 ${Array.isArray(genre) ? '列表' : typeof genre}`, keyLine('genre'));
  }

  let dynasty = null;
  if (typeof data.dynasty === 'string' && data.dynasty.trim() !== '') {
    const hit = lookupDynasty(data.dynasty);
    if (hit) {
      dynasty = hit.label;
    } else {
      const raw = data.dynasty;
      const norm = raw.normalize('NFC').trim();
      const looksSame = norm !== raw && lookupDynasty(norm) !== undefined;
      const head = looksSame
        ? `dynasty 的值 \`${vis(raw)}\` 不等于任何一个组名：去掉首尾空白并按 NFC 归一后是 \`${norm}\`（源里有不可见字符或非 NFC 写法），请把源值照抄成 \`${norm}\`。`
        : `dynasty 的值 \`${vis(raw)}\` 不等于任何一个组名（不做别名归一，也不做繁简折叠：「漢」与「汉」在编码上是两个字）。`;
      const tail = `可用组名（按显示次序）：${dynastyLabels().join(' / ')}。不做别名映射（\`东汉\` 不会静默归到 \`汉\`，\`三国\` 不会归到 \`魏晋\`）；要新增一个组，必须显式登记进注册表（tools/lib/dynasties.mjs）并同步契约 §1.3 与两端的组名清单。`;
      push('DYNASTY_UNDECLARED', `${head}${tail}`, keyLine('dynasty'));
    }
  }

  // orderInSource：可选，底本原次序（整数 ≥ 1）；缺失视为未提供，不报错
  let orderInSource = null;
  if (data.orderInSource !== undefined && data.orderInSource !== null) {
    if (typeof data.orderInSource !== 'number' || !Number.isInteger(data.orderInSource) || data.orderInSource < 1) {
      push('ORDER_IN_SOURCE_NOT_INTEGER', `「orderInSource」必须是 ≥ 1 的整数，实际是 ${JSON.stringify(data.orderInSource)}`, keyLine('orderInSource'));
    } else {
      orderInSource = data.orderInSource;
    }
  }

  // ── 正文：先跟踪围栏，再切节（围栏内的 `##` 不算分界）──
  /** @type {{line: number, text: string}[]} */
  const originLines = [];
  /** @type {{name: string, line: number, content: string[]}[]} */
  const sections = [];
  /** @type {{name: string, line: number, content: string[]}|null} */
  let current = null;
  let inFence = false;
  let fenceOpenLine = -1;
  let fenceChar = '';

  for (let k = 0; k < bodyLines.length; k++) {
    const line = bodyLines[k];
    const lineNo = bodyLineOffset + k;
    const fch = fenceMarker(line);
    if (fch) {
      if (!inFence) {
        inFence = true;
        fenceOpenLine = lineNo;
        fenceChar = fch;
        push('MD_CODE_FENCE', codeFenceMessage(line), lineNo);
      } else if (fch === fenceChar) {
        inFence = false;
      }
      (current ? current.content : originLines).push({ line: lineNo, text: line });
      continue;
    }
    if (!inFence) {
      const secM = SECTION_RE.exec(line);
      if (secM) {
        current = { name: secM[1].trim(), line: lineNo, content: [] };
        sections.push(current);
        continue;
      }
    }
    if (current && !inFence) {
      const d = checkMarkdownLine(line);
      if (d) push(d.code, d.message, lineNo);
    } else if (!current && !inFence) {
      // 原文区不走 Markdown：诗行里的 `**`、`- ` 原样保留。只单拎一条——行首 `#`
      // 在原文里唯一可能的意思就是「节标题少打/多打了一个空格」（否则会静默变成一行诗）。
      if (/^\s*#/.test(line)) {
        const d = checkMarkdownLine(line);
        if (d) push(d.code, d.message, lineNo);
      }
    }
    (current ? current.content : originLines).push({ line: lineNo, text: line });
  }
  if (inFence) {
    push(
      'MD_FENCE_UNCLOSED',
      `第 ${fenceOpenLine} 行打开的围栏到文件末尾都没有闭合。必须先跟踪围栏状态才能报出这一条（否则后面所有内容都会被吞进当前节，静默丢内容）。`,
      fenceOpenLine,
    );
  }

  // 节名判定：未知节 / 重复节（重复节诊断落在**第二次**出现的那一行，并列出全部行号）
  /** @type {Map<string, number[]>} */
  const seenAt = new Map();
  for (const sec of sections) {
    const lines = seenAt.get(sec.name);
    if (lines === undefined) {
      seenAt.set(sec.name, [sec.line]);
    } else {
      lines.push(sec.line);
      push(
        'DUPLICATE_SECTION',
        `重复的节标题：\`## ${sec.name}\` 出现 ${lines.length} 次（${lines.map((n) => `第 ${n} 行`).join('、')}）。本工具不取「后者覆盖前者」也不拼接（两者都会静默丢内容）：请合并成一段，或删掉多余的那一个。`,
        sec.line,
      );
    }
    if (!KNOWN_SECTIONS.includes(sec.name)) {
      const known = sections
        .filter((s) => KNOWN_SECTIONS.includes(s.name))
        .map((s) => `\`## ${s.name}\`（第 ${s.line} 行）`);
      push(
        'UNKNOWN_SECTION',
        `未知的节标题：\`## ${sec.name}\`（第 ${sec.line} 行）。本格式只认两个节：\`## 详情\`、\`## 笔记\`${known.length ? `；本文件已出现的已知节：${known.join('、')}` : ''}。若确实要新增一个节，请先把它加进契约与两端的节名清单，不要只改源文件。`,
        sec.line,
      );
    }
  }

  // 原文分段
  const stanzas = buildStanzas(originLines.map((l) => l.text));
  if (stanzas.length === 0) {
    push('BODY_EMPTY', '正文区（front matter 之后、第一个 `## ` 之前）没有任何非空行 ⇒ 没有可读的诗行。', bodyLineOffset);
  }

  const detailSec = sections.find((s) => s.name === SECTION_DETAIL);
  const notesSec = sections.find((s) => s.name === SECTION_NOTES);
  /** 中间结果（**仅供参考**；有诊断时不会写产物）——留给测试核对「围栏里的 `##` 有没有把正文切走」。 */
  const draft = {
    stanzas,
    detail: detailSec ? sectionText(detailSec.content.map((c) => c.text)) : null,
    notes: notesSec ? sectionText(notesSec.content.map((c) => c.text)) : null,
  };

  if (errors.length > 0) {
    errors.sort((a, b) => (a.line ?? 0) - (b.line ?? 0) || a.code.localeCompare(b.code));
    return { poem: null, errors, id: record.id, draft };
  }

  /** 每首 10 键，缺值写 `null` 保键（客户端形状恒定）。 */
  const poem = {
    id: record.id,
    title: /** @type {string} */ (data.title),
    author: /** @type {string} */ (data.author),
    dynasty: /** @type {string} */ (dynasty),
    genre: genre ?? null,
    source: /** @type {string} */ (data.source),
    orderInSource,
    detail: draft.detail,
    stanzas,
    notes: draft.notes,
  };
  return { poem, errors: [], id: record.id, draft };
}

/**
 * 拼音排序名次：对去重后的字符串用 collator 排序，取稳定名次作为整数名次。
 * collator 判定相等时用码位序兜底，保证名次确定、产物可复现。
 * **导出的名次只在编译期内部使用，不写进产物**（见 INTERNAL_SORT_KEYS）。
 * @param {string[]} values
 * @returns {Map<string, number>}
 */
export function collatorRankMap(values) {
  const compare = new Intl.Collator(PINYIN_COLLATOR_LOCALE).compare;
  const uniq = [...new Set(values)];
  uniq.sort((a, b) => {
    const r = compare(a, b);
    if (r !== 0) return r;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  const map = new Map();
  uniq.forEach((v, i) => map.set(v, i));
  return map;
}

/**
 * **编译期内部**的排序名次（不发布）：返回与传入数组同序的整数名次数组。
 * 佚名/未知作者的名次统一大于所有具名作者 —— 显式规则，不靠字符串碰巧。
 * @param {any[]} poems
 * @returns {{authorKeys: number[], titleKeys: number[]}}
 */
export function computeSortKeys(poems) {
  const namedAuthors = poems.filter((p) => !isUnknownAuthor(p.author)).map((p) => p.author);
  const unknownAuthors = poems.filter((p) => isUnknownAuthor(p.author)).map((p) => p.author);
  const namedRanks = collatorRankMap(namedAuthors);
  const unknownRanks = collatorRankMap(unknownAuthors);
  const titleRanks = collatorRankMap(poems.map((p) => p.title));

  const authorRank = (author) =>
    isUnknownAuthor(author) ? namedRanks.size + unknownRanks.get(author) : namedRanks.get(author);

  return {
    authorKeys: poems.map((p) => authorRank(p.author)),
    titleKeys: poems.map((p) => titleRanks.get(p.title)),
  };
}

/**
 * 组内排序。组序由注册表决定（每首诗的 `dynasty` → order），组内：
 *   pinyin：作者拼音 → 诗名拼音（佚名/未知作者在组内排最后，显式规则）
 *   source：先 orderInSource（有值者在先、升序）→ 再作者拼音 → 再诗名拼音
 * 同组同作者同诗名时以 id 兜底，保证顺序确定。
 * 本函数**不修改**传入的诗对象（名次只存在于函数内部的 Map）。
 * @param {any[]} poems
 * @param {'source'|'pinyin'} strategy
 */
export function sortPoems(poems, strategy = DEFAULT_ORDER_STRATEGY) {
  if (!SORT_STRATEGIES.includes(strategy)) {
    throw new ContentError(
      'ORDER_STRATEGY_INVALID',
      `未知的组内排序策略「${strategy}」；可用：${SORT_STRATEGIES.join(' / ')}`,
    );
  }
  const { authorKeys, titleKeys } = computeSortKeys(poems);
  const authorKey = new Map(poems.map((p, i) => [p, authorKeys[i]]));
  const titleKey = new Map(poems.map((p, i) => [p, titleKeys[i]]));
  const hasSourceIndex = (p) => Number.isInteger(p.orderInSource);

  poems.sort((a, b) => {
    const da = dynastyOrderOf(a.dynasty);
    const db = dynastyOrderOf(b.dynasty);
    if (da !== db) return da - db;
    if (strategy === 'source') {
      const sa = hasSourceIndex(a) ? 0 : 1;
      const sb = hasSourceIndex(b) ? 0 : 1;
      if (sa !== sb) return sa - sb; // 有 orderInSource 的在组内排在前
      if (sa === 0 && a.orderInSource !== b.orderInSource) return a.orderInSource - b.orderInSource;
    }
    return (
      authorKey.get(a) - authorKey.get(b) ||
      titleKey.get(a) - titleKey.get(b) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    );
  });
  return poems;
}

/**
 * 从已读入的文件记录构建产物 JSON。
 * @param {{
 *   records: {displayPath: string, id: string, text: string}[],
 *   explicitVersion?: string|null,
 *   previousVersion?: string|null,
 *   generatedAt?: string,
 *   orderStrategy?: 'source'|'pinyin',
 * }} opts
 * @returns {{content: object|null, errors: ContentError[], versionNotes: string[], contentVersion: string|null, orderStrategy: string}}
 */
export function buildContentFromRecords({
  records,
  explicitVersion = null,
  previousVersion = null,
  orderStrategy = DEFAULT_ORDER_STRATEGY,
  generatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
}) {
  /** @type {ContentError[]} */
  const errors = [];
  /** @type {any[]} */
  const poems = [];
  /** @type {Map<string, {id: string, paths: string[]}>} */
  const byKey = new Map();

  if (records.length === 0) {
    errors.push(
      new ContentError('NO_POEMS', 'content/poems/ 下没有任何 .md 文件，拒绝产出空目录内容', { file: null }),
    );
  }

  for (const rec of records) {
    // 全库判重：NFC ＋ 小写折叠后比拼接 ID。把 `/` 换成 `-` 之后，「路径拼出的 `-`」与
    // 「文件名里本来就有的 `-`」会同形 ⇒ 两个不同路径可能算出同一个 ID（不静默覆盖）。
    const key = dedupeKey(rec.id);
    const slot = byKey.get(key);
    if (slot === undefined) {
      byKey.set(key, { id: rec.id, paths: [rec.displayPath] });
    } else {
      slot.paths.push(rec.displayPath);
      errors.push(
        new ContentError(
          'ID_DUPLICATE',
          `按相对路径派生的 id「${slot.id}」撞车（NFC ＋ 大小写折叠后相同），共出现 ${slot.paths.length} 次：\n` +
            slot.paths.map((p) => `      - ${p}`).join('\n') +
            `\n    把 \`/\` 统一写成 \`-\` 之后，路径拼出的 \`-\` 与文件名里本来就有的 \`-\` 会同形 ⇒ 两个不同路径可能算出同一个 ID。请改文件名或目录层级让它们不同。`,
          { file: rec.displayPath },
        ),
      );
    }
    const { poem, errors: fileErrors } = parsePoemRecord(rec);
    errors.push(...fileErrors);
    if (poem) poems.push(poem);
  }

  if (errors.length > 0) {
    return { content: null, errors, versionNotes: [], contentVersion: null, orderStrategy };
  }

  sortPoems(poems, orderStrategy);

  /** 顶层 `dynasties` ＝ **有序中文值数组**（只列实际有内容的组，次序即注册表 order 升序）。 */
  const dynasties = [...new Set(poems.map((p) => p.dynasty))].sort(
    (a, b) => dynastyOrderOf(a) - dynastyOrderOf(b) || (a < b ? -1 : a > b ? 1 : 0),
  );

  const digestHex = contentDigest({ formatVersion: FORMAT_VERSION, dynasties, poems });
  let resolved;
  try {
    resolved = resolveContentVersion({ explicit: explicitVersion, previous: previousVersion, digestHex });
  } catch (e) {
    if (e instanceof ContentError) {
      return { content: null, errors: [e], versionNotes: [], contentVersion: null, orderStrategy };
    }
    throw e;
  }

  const content = {
    formatVersion: FORMAT_VERSION,
    contentVersion: resolved.version,
    generatedAt,
    dynasties,
    poems,
  };
  return { content, errors: [], versionNotes: resolved.notes, contentVersion: resolved.version, orderStrategy };
}
