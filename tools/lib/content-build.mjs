// 契约线 C：Markdown → JSON 的解析、校验与排序（纯函数，便于测试）。
//
// 校验条目与错误码一一对应，见契约 docs/design/content-contract.md 第 3 节。

import path from 'node:path';
import { ContentError } from './errors.mjs';
import { parseFrontMatterLines, splitFrontMatter } from './frontmatter.mjs';
import { declaredLabels, lookupDynasty } from './dynasties.mjs';
import { contentDigest, resolveContentVersion } from './version.mjs';
import {
  ALL_FRONT_MATTER_KEYS,
  DEFAULT_ORDER_STRATEGY,
  FORMAT_VERSION,
  ID_REGEX,
  OPTIONAL_FRONT_MATTER_KEYS,
  PINYIN_COLLATOR_LOCALE,
  REQUIRED_FRONT_MATTER_KEYS,
  SORT_STRATEGIES,
  UNKNOWN_AUTHOR_MARKERS,
} from './interface.mjs';

const ALL_KEYS = new Set(ALL_FRONT_MATTER_KEYS);

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

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * 校验并构建**单首**诗的产物对象。返回 errors 而不抛异常，便于一次报出全部问题。
 * @param {{displayPath: string, base: string, text: string}} record
 * @returns {{poem: object|null, errors: ContentError[], idRaw: string|null}}
 */
export function validatePoemRecord(record) {
  const file = record.displayPath;
  /** @type {ContentError[]} */
  const errors = [];
  const push = (code, message, line = null) => errors.push(new ContentError(code, message, { file, line }));
  /** @type {Record<string, unknown>|null} */
  let data = null;
  /** @type {string[]} */
  let bodyLines = [];
  let bodyLineOffset = 0;

  try {
    const split = splitFrontMatter(record.text, file);
    bodyLines = split.bodyLines;
    bodyLineOffset = split.bodyLineOffset;
    data = parseFrontMatterLines(split.fmLines, file, split.fmLineOffset);
  } catch (e) {
    if (e instanceof ContentError) {
      return { poem: null, errors: [e], idRaw: null };
    }
    throw e;
  }

  const idRaw = typeof data.id === 'string' ? data.id : null;

  // 未声明的键：宁可直接失败，也不静默丢字段。
  for (const key of Object.keys(data)) {
    if (!ALL_KEYS.has(key)) {
      push(
        'UNKNOWN_KEY',
        `front matter 出现契约未声明的键「${key}」；已声明：必填 ${REQUIRED_KEYS.join('/')}，可选 ${OPTIONAL_KEYS.join('/')}`,
      );
    }
  }

  // 必填键存在且非空
  for (const key of REQUIRED_KEYS) {
    const v = data[key];
    const missing = v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
    if (missing) push('MISSING_REQUIRED_KEY', `缺少必填键「${key}」或值为空`);
  }

  // id：形状 + 与文件名一致
  if (idRaw !== null) {
    if (!ID_REGEX.test(idRaw)) {
      push('ID_INVALID', `id「${idRaw}」不合规则：应全小写 ASCII、连字符分段、末段为序号，如 gushi-shijiu-shou-01`);
    }
    if (idRaw !== record.base) {
      push('ID_FILENAME_MISMATCH', `front matter 的 id「${idRaw}」与文件名「${record.base}.md」不一致`);
    }
  }

  // 文本字段类型
  for (const key of ['title', 'author', 'source']) {
    const v = data[key];
    if (v !== undefined && v !== null && typeof v !== 'string') {
      push('FIELD_TYPE', `「${key}」必须是字符串，实际是 ${Array.isArray(v) ? '列表' : typeof v}`);
    }
  }
  for (const key of ['era', 'genre', 'notes']) {
    const v = data[key];
    if (v !== undefined && v !== null && typeof v !== 'string') {
      push('FIELD_TYPE', `「${key}」必须是字符串或留空，实际是 ${Array.isArray(v) ? '列表' : typeof v}`);
    }
  }

  // 朝代：必须命中注册表；dynastyOrder 必须是整数且与注册表一致
  let dynasty = null;
  if (typeof data.dynasty === 'string' && data.dynasty.trim() !== '') {
    dynasty = lookupDynasty(data.dynasty) ?? null;
    if (!dynasty) {
      push(
        'DYNASTY_UNDECLARED',
        `朝代「${data.dynasty}」未在分组注册表中声明（已声明：${declaredLabels()}）` +
          `；新分组需要显式登记到 tools/lib/dynasties.mjs 并同步契约，不做别名猜测`,
      );
    }
  }
  const rawOrder = data.dynastyOrder;
  let orderOk = false;
  if (rawOrder !== undefined) {
    if (typeof rawOrder !== 'number' || !Number.isInteger(rawOrder)) {
      push('DYN_ORDER_NOT_INTEGER', `「dynastyOrder」必须是整数，实际是 ${JSON.stringify(rawOrder)}`);
    } else {
      orderOk = true;
    }
  }
  if (dynasty && orderOk && rawOrder !== dynasty.order) {
    push(
      'DYN_ORDER_MISMATCH',
      `「dynastyOrder」=${rawOrder} 与朝代「${data.dynasty}」的注册值 ${dynasty.order} 不一致`,
    );
  }

  // variants：数组，元素需有 text（note 可省略）
  /** @type {{text: string, note: string|null}[]} */
  let variants = [];
  if (data.variants !== undefined && data.variants !== null) {
    if (!Array.isArray(data.variants)) {
      push('VARIANT_INVALID', '「variants」必须是数组，元素形如 { text, note }');
    } else {
      data.variants.forEach((item, i) => {
        if (!isPlainObject(item) || typeof item.text !== 'string' || item.text.trim() === '') {
          push('VARIANT_INVALID', `variants[${i}] 必须是含非空字符串 text 的对象，形如 { text, note }`);
          return;
        }
        if (item.note !== undefined && item.note !== null && typeof item.note !== 'string') {
          push('VARIANT_INVALID', `variants[${i}].note 必须是字符串或留空`);
          return;
        }
        variants.push({ text: item.text, note: item.note ?? null });
      });
    }
  }

  // orderInSource：可选，底本原次序（整数）；缺失视为未提供，不报错
  let orderInSource = null;
  if (data.orderInSource !== undefined && data.orderInSource !== null) {
    if (typeof data.orderInSource !== 'number' || !Number.isInteger(data.orderInSource)) {
      push('ORDER_IN_SOURCE_NOT_INTEGER', `「orderInSource」必须是整数，实际是 ${JSON.stringify(data.orderInSource)}`);
    } else {
      orderInSource = data.orderInSource;
    }
  }

  // 正文：契约第 3 节第 3、5 条
  const bodyRaw = bodyLines.join('\n');
  const stanzas = buildStanzas(bodyLines);
  if (bodyRaw === '') {
    push('BODY_EMPTY', '正文为空（只有 front matter）', bodyLineOffset);
  } else if (stanzas.length === 0 || stanzas.every((s) => s.length === 0)) {
    push('STANZAS_ALL_EMPTY', '正文只有空行，没有任何诗句行（stanzas 全空）', bodyLineOffset);
  }

  if (errors.length > 0) return { poem: null, errors, idRaw };

  const poem = {
    id: /** @type {string} */ (data.id),
    title: /** @type {string} */ (data.title),
    author: /** @type {string} */ (data.author),
    dynastyKey: /** @type {NonNullable<typeof dynasty>} */ (dynasty).key,
    dynastyLabel: /** @type {NonNullable<typeof dynasty>} */ (dynasty).label,
    dynastyOrder: /** @type {NonNullable<typeof dynasty>} */ (dynasty).order,
    era: data.era ?? null,
    genre: data.genre ?? null,
    source: /** @type {string} */ (data.source),
    orderInSource,
    variants,
    stanzas,
    notes: data.notes ?? null,
    // 排序键占位：真实值在排序前统一写入（键的插入顺序因此固定，产物可复现）。
    authorSortKey: 0,
    titleSortKey: 0,
  };
  return { poem, errors: [], idRaw };
}

/**
 * 拼音排序键：对去重后的字符串用 collator 排序，取稳定名次作为排序键（整数）。
 * collator 判定相等时用码位序兜底，保证名次确定、产物可复现。
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
 * 组内排序。两种策略共用同一套拼音名次（authorSortKey/titleSortKey 都写进产物），
 * 差别只在“底本原次序”这一层的优先级：
 *   pinyin：作者拼音 → 诗名拼音（佚名/未知作者在组内排最后，显式规则）
 *   source：先 orderInSource（有值者在先、升序）→ 再作者拼音 → 再诗名拼音
 * 同组同作者同诗名时以 id 兜底，保证顺序确定。
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
  const namedAuthors = poems.filter((p) => !isUnknownAuthor(p.author)).map((p) => p.author);
  const unknownAuthors = poems.filter((p) => isUnknownAuthor(p.author)).map((p) => p.author);
  const namedRanks = collatorRankMap(namedAuthors);
  const unknownRanks = collatorRankMap(unknownAuthors);
  const titleRanks = collatorRankMap(poems.map((p) => p.title));

  const authorRank = (author) =>
    isUnknownAuthor(author) ? namedRanks.size + unknownRanks.get(author) : namedRanks.get(author);

  for (const p of poems) {
    p.authorSortKey = authorRank(p.author);
    p.titleSortKey = titleRanks.get(p.title);
  }

  const hasSourceIndex = (p) => Number.isInteger(p.orderInSource);

  poems.sort((a, b) => {
    if (a.dynastyOrder !== b.dynastyOrder) return a.dynastyOrder - b.dynastyOrder;
    if (strategy === 'source') {
      const sa = hasSourceIndex(a) ? 0 : 1;
      const sb = hasSourceIndex(b) ? 0 : 1;
      if (sa !== sb) return sa - sb; // 有 orderInSource 的在组内排在前
      if (sa === 0 && a.orderInSource !== b.orderInSource) return a.orderInSource - b.orderInSource;
    }
    return (
      a.authorSortKey - b.authorSortKey ||
      a.titleSortKey - b.titleSortKey ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    );
  });
  return poems;
}

/**
 * 从已读入的文件记录构建产物 JSON。
 * @param {{
 *   records: {displayPath: string, base: string, text: string}[],
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
  /** @type {Map<string, string>} */
  const idToFile = new Map();

  if (records.length === 0) {
    errors.push(
      new ContentError('NO_POEMS', 'content/poems/ 下没有任何 .md 文件，拒绝产出空目录内容', { file: null }),
    );
  }

  for (const rec of records) {
    const { poem, errors: fileErrors, idRaw } = validatePoemRecord(rec);
    errors.push(...fileErrors);
    if (idRaw !== null) {
      const prev = idToFile.get(idRaw);
      if (prev !== undefined) {
        errors.push(
          new ContentError('ID_DUPLICATE', `id「${idRaw}」重复：${prev} 与 ${rec.displayPath}`, {
            file: rec.displayPath,
          }),
        );
      } else {
        idToFile.set(idRaw, rec.displayPath);
      }
    }
    if (poem) poems.push(poem);
  }

  if (errors.length > 0) {
    return { content: null, errors, versionNotes: [], contentVersion: null, orderStrategy };
  }

  sortPoems(poems, orderStrategy);

  /** 只列实际有内容的组，按 order 升序 */
  const dynastyByKey = new Map();
  for (const p of poems) {
    if (!dynastyByKey.has(p.dynastyKey)) {
      dynastyByKey.set(p.dynastyKey, { key: p.dynastyKey, label: p.dynastyLabel, order: p.dynastyOrder });
    }
  }
  const dynasties = [...dynastyByKey.values()].sort((a, b) => a.order - b.order);

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

/** 展示路径统一用正斜杠，跨平台输出稳定。 */
export function toDisplayPath(p) {
  return p.split(path.sep).join('/');
}
