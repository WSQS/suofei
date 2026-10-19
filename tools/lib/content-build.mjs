// 契约线 C：Markdown → JSON 的解析、校验与排序（纯函数，便于测试）。
//
// 校验条目与错误码一一对应，见契约 docs/design/content-contract.md 第 3 节。
//
// formatVersion=2（2026-10-16）起源格式是：
//   front matter（必填 title/author/dynasty/source，**必填正整数** orderInSource，可选 genre/tags）＋ 正文区（原文，空行＝分段）
//   ＋ 可选的两个节 `## 详情` / `## 笔记`（内容是**最小 Markdown 文本**，整段进 detail/notes）。
//   `id` 不写在源里（由相对路径派生，见 scan.mjs）。
//
// 2026-10-19（用户拍板 B）：`orderInSource` 改为**必填正整数**（不可省略、不可 null），且**同一朝代内唯一**
//   （跨朝代各自从 1 起；允许留空号）；排序仍是「朝代组序 → orderInSource 升序」，未改成作者先排。

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
  POEM_TAG_KEYS,
  REMOVED_FRONT_MATTER_KEYS,
  REQUIRED_FRONT_MATTER_KEYS,
  REQUIRED_INT_FRONT_MATTER_KEYS,
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
export const REQUIRED_INT_KEYS = REQUIRED_INT_FRONT_MATTER_KEYS;
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
const SECTION_RE = /^## (\S.*)$/;

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
        `front matter 出现声明之外的键「${key}」；允许的键：必填 ${REQUIRED_KEYS.join('/')}；必填正整数 ${REQUIRED_INT_KEYS.join('/')}；可选 ${OPTIONAL_KEYS.join('/')}`,
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
        `必填键「${key}」缺失或值为空。允许的键：${ALL_FRONT_MATTER_KEYS.join(' / ')}`,
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

  // orderInSource：**必填正整数**（用户 2026-10-19 定：不可省略、不可 null）。
  //   省略（undefined）或写成 null/`~`/空值（解析器都给 null）⇒ ORDER_IN_SOURCE_REQUIRED；
  //   写了但不是 ≥ 1 的整数 ⇒ ORDER_IN_SOURCE_NOT_INTEGER（沿用既有码）。
  //   工具**不替任何人编一个号**：缺号就是内容没核完，按失败处理。
  let orderInSource = null;
  const rawOrder = data.orderInSource;
  if (rawOrder === undefined || rawOrder === null) {
    push(
      'ORDER_IN_SOURCE_REQUIRED',
      `缺 \`orderInSource\`（${rawOrder === undefined ? '这一行没写' : '写成了 null'}）。` +
        '`orderInSource` 是**必填的正整数**（该诗在底本中的原次序，1 起）：**必填、不可省略、不可 null**（用户 2026-10-19 定）。' +
        '编译工具不替内容编一个号——请照底本写出真实次序；拿不到真实次序就先不写这首诗，不要用 1/2/3 之类的占位号假装已核。',
      keyLine('orderInSource'),
    );
  } else if (typeof rawOrder !== 'number' || !Number.isInteger(rawOrder) || rawOrder < 1) {
    push(
      'ORDER_IN_SOURCE_NOT_INTEGER',
      `「orderInSource」必须是 ≥ 1 的整数（**必填、不可省略、不可 null**），实际是 ${JSON.stringify(rawOrder)}`,
      keyLine('orderInSource'),
    );
  } else {
    orderInSource = rawOrder;
  }

  // tags（formatVersion=3）：可选；不写 ⇒ []（**不是 null**）。元素形状 { id, orderInTag }。
  // `id` 是标签的中文 id（就是显示名），`orderInTag` 是该标签内的位置：**必填、不可 null**。
  /** @type {{id: string, orderInTag: number}[]} */
  const tags = [];
  if (data.tags !== undefined && data.tags !== null) {
    const tagsLine = keyLine('tags');
    if (!Array.isArray(data.tags)) {
      push(
        'TAG_SHAPE',
        `「tags」必须是标签列表（形如：\n      tags:\n        - id: 古诗十九首\n          orderInTag: 1\n），实际是 ${Array.isArray(data.tags) ? '列表' : typeof data.tags}。不写 \`tags\` 或写 \`tags: []\` 都表示没有标签。`,
        tagsLine,
      );
    } else {
      /** `tags` 块里第 i 个列表项所在的行号（定位到项本身；实在找不到就退回 \`tags:\` 键所在行）。 */
      const tagItemLines = (() => {
        if (tagsLine === null) return /** @type {number[]} */ ([]);
        const first = tagsLine - fmLineOffset; // `tags:` 本行的 fmLines 下标
        const keyIndent = fmLines[first].length - fmLines[first].trimStart().length;
        /** @type {number[]} */
        const out = [];
        for (let k = first + 1; k < fmLines.length; k++) {
          const line = fmLines[k];
          if (line.trim() === '') continue;
          const ind = line.length - line.trimStart().length;
          if (ind <= keyIndent) break; // 回到顶层键 ⇒ 列表结束
          const t = line.trim();
          if (t === '-' || t.startsWith('- ')) out.push(fmLineOffset + k);
        }
        return out;
      })();
      const itemLine = (i) => tagItemLines[i] ?? tagsLine;
      const seenTagIds = new Set();
      data.tags.forEach((item, i) => {
        const at = itemLine(i);
        const where = `「tags」第 ${i + 1} 项`;
        if (item === null || typeof item !== 'object' || Array.isArray(item)) {
          push('TAG_SHAPE', `${where}必须是 { id, orderInTag } 对象，实际是 ${item === null ? 'null' : Array.isArray(item) ? '列表' : typeof item}。`, at);
          return;
        }
        const extra = Object.keys(item).filter((k) => !POEM_TAG_KEYS.includes(k));
        if (extra.length > 0) {
          push(
            'TAG_SHAPE',
            `${where}出现声明之外的键「${extra.join('、')}」；只允许 ${POEM_TAG_KEYS.join(' / ')}（标签的中文 id 就是显示名，没有 name/slug/aliases/qualifier 之类的键）。`,
            at,
          );
        }
        const rawId = item.id;
        const idOk = typeof rawId === 'string' && rawId.trim() !== '' && rawId.trim() === rawId;
        if (!idOk) {
          push(
            'TAG_SHAPE',
            `${where}的「id」必须是非空、且首尾没有空白的字符串（中文 id 就是显示名；不做 trim、不做别名折叠），实际是 ${JSON.stringify(rawId)}。`,
            at,
          );
        } else if (seenTagIds.has(rawId)) {
          push(
            'TAG_DUPLICATE_ID',
            `同一首诗里标签「${rawId}」出现了两次（${where}）。一首诗在一个标签里只能有一个位置；请删掉重复项，不要留两个 orderInTag 互相矛盾。`,
            at,
          );
        } else {
          seenTagIds.add(rawId);
        }
        const ord = item.orderInTag;
        const orderOk = typeof ord === 'number' && Number.isInteger(ord) && ord >= 1;
        if (!orderOk) {
          push(
            'TAG_ORDER_REQUIRED',
            `${where}${idOk ? `（标签「${rawId}」）` : ''}缺 \`orderInTag\`，或它不是 ≥ 1 的整数（实际是 ${JSON.stringify(ord)}）。\`orderInTag\` 在该标签内**必填、不可省略、不可 null**（用户 2026-10-18 定）；它表示这首在该标签里的位置。`,
            at,
          );
        }
        if (idOk && orderOk) tags.push({ id: /** @type {string} */ (rawId), orderInTag: ord });
      });
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

  /** 每首 11 键（formatVersion=3），缺值写 `null` 保键（客户端形状恒定）；`tags` 总是数组。 */
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
    tags,
  };
  return { poem, errors: [], id: record.id, draft };
}

/**
 * **同一朝代内 `orderInSource` 必须唯一**（用户 2026-10-19 拍板 B：朝代内统一编号）。
 *
 * - 跨朝代各自从 1 起合法；
 * - **允许留空号**（不要求连续、不要求 1..N——以后插入不必整库重编号）；
 * - **同序 ⇒ 报错**，且诊断里列出**全部**冲突的诗 id 与源路径（不能只说“重复了”）；
 * - 刻意不再用作者/诗名拼音把并列者悄悄排开：那种“兜底”正好会把「两个不同的号写成了同一个」
 *   这类真错漏掩盖掉。
 *
 * @param {{id: string, dynasty: string, orderInSource: number|null}[]} poems
 * @param {ContentError[]} [errors]
 * @param {Map<string, string>} [displayPaths] poemId → 源文件展示路径（只用于诊断定位）
 * @returns {ContentError[]}
 */
export function checkOrderInSourceUnique(poems, errors = [], displayPaths = new Map()) {
  /** @type {Map<string, {id: string, dynasty: string, orderInSource: number}[]>} */
  const bySlot = new Map();
  for (const p of poems) {
    if (!Number.isInteger(p.orderInSource)) continue; // 缺失/非法已由 parsePoemRecord 单独报；这里只管并列
    const key = `${p.dynasty}\u0000${p.orderInSource}`;
    const list = bySlot.get(key);
    const item = { id: p.id, dynasty: p.dynasty, orderInSource: p.orderInSource };
    if (list === undefined) bySlot.set(key, [item]);
    else list.push(item);
  }
  for (const list of bySlot.values()) {
    if (list.length < 2) continue;
    const where = list.map((p) => `\`${p.id}\`（${displayPaths.get(p.id) ?? '源路径未知'}）`).join('、');
    errors.push(
      new ContentError(
        'ORDER_IN_SOURCE_DUP',
        `朝代「${list[0].dynasty}」里 \`orderInSource: ${list[0].orderInSource}\` 被 ${list.length} 首诗同时占用：${where}。` +
          '同一朝代内的序号必须唯一（用户 2026-10-19 定：**跨作者也不得重复**；不同朝代可以各自从 1 起；**允许留空号**，但同一个号只能给一首）。' +
          '工具不会用作者/题名替你把并列者排开——那是内容层面的次序错误：请核对底本次序后改号。',
        { file: displayPaths.get(list[0].id) ?? null },
      ),
    );
  }
  return errors;
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
 *   source：先 `orderInSource`（升序），再作者拼音 → 诗名拼音
 * 同组同作者同诗名时以 id 兜底，保证顺序确定。
 *
 * ⚠ 2026-10-19（用户拍板 B：`orderInSource` 必填、**同一朝代内唯一**）：
 *   - `source` 下组内次序**就是** `orderInSource` 升序（朝代组序 → 序号升序；**不改成作者先排**）；
 *   - 后面的作者/诗名拼音这一段现在**只作为「构造上不可能出现」情形下的确定性兜底**（直构单测对象、
 *     或旧产物）：真实编译路径上，同一朝代里两首同号会在**写产物前**就报 `ORDER_IN_SOURCE_DUP`，
 *     因此不会被拼音阴差阳错地排开——这就是「去掉悄无声息的兜底」的做法：把并列改为**冲突诊断**。
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
 * 顶层 `tags[]` ＝ **编译期从诗的归属汇总生成**（不写人手标签表）。两件不同的事：
 *   ① **标签之间**：按中文拼音（`Intl.Collator(PINYIN_COLLATOR_LOCALE)`）排序；collator 判等时
 *      按 id 的码点序稳定兜底（与 `collatorRankMap` 同一口径）⇒ 产物确定、可复现。
 *   ② **标签内**：`members` 按诗的 `orderInTag` 升序（同序 ⇒ `TAG_ORDER_DUP`）；
 *      万一同序（报错后不会写产物），再用 poemId 码点序兜底，保证函数本身总是确定的。
 * **不发布任何 SortKey**：拼音名次只在本函数的局部 Map 里。
 *
 * @param {{id: string, tags?: {id: string, orderInTag: number}[]}[]} poems
 * @param {ContentError[]} errors 收 `TAG_ORDER_DUP`
 * @param {Map<string, string>} [displayPaths] poemId → 源文件展示路径（只用于把跨诗诊断指到文件）
 * @returns {{id: string, members: string[]}[]}
 */
export function buildTagIndex(poems, errors = [], displayPaths = new Map()) {
  /** @type {Map<string, {poemId: string, orderInTag: number}[]>} */
  const byTag = new Map();
  for (const p of poems) {
    for (const t of p.tags ?? []) {
      const list = byTag.get(t.id);
      if (list === undefined) byTag.set(t.id, [{ poemId: p.id, orderInTag: t.orderInTag }]);
      else list.push({ poemId: p.id, orderInTag: t.orderInTag });
    }
  }

  for (const [tagId, list] of byTag) {
    /** @type {Map<number, {poemId: string, orderInTag: number}[]>} */
    const byOrder = new Map();
    for (const m of list) {
      const slot = byOrder.get(m.orderInTag);
      if (slot === undefined) byOrder.set(m.orderInTag, [m]);
      else slot.push(m);
    }
    for (const [order, ms] of byOrder) {
      if (ms.length > 1) {
        const ids = ms.map((m) => `\`${m.poemId}\``);
        errors.push(
          new ContentError(
            'TAG_ORDER_DUP',
            `标签「${tagId}」里 \`orderInTag: ${order}\` 被 ${ms.length} 首诗同时占用：${ids.join('、')}。` +
              `同一标签内的次序必须唯一（用户 2026-10-18 定：同序**报错**，不得默默用 id 排）；` +
              `请修改其中至少一首的 orderInTag，或重新给这组诗定次序。`,
            { file: displayPaths.get(ms[0].poemId) ?? null },
          ),
        );
      }
    }
  }

  const ids = [...byTag.keys()];
  const ranks = collatorRankMap(ids);
  ids.sort((a, b) => ranks.get(a) - ranks.get(b));

  return ids.map((id) => ({
    id,
    members: [...(byTag.get(id) ?? [])]
      .sort((a, b) => a.orderInTag - b.orderInTag || (a.poemId < b.poemId ? -1 : a.poemId > b.poemId ? 1 : 0))
      .map((m) => m.poemId),
  }));
}

/**
 * 双向互查：诗的 `tags[]` 与顶层 `tags[].members` 必须描述**同一组归属**。
 * 这是**内部一致性断言**（两边都由 `buildTagIndex` 生成）；不通就是编译器 bug，不是一个内容诊断。
 * @param {{id: string, tags?: {id: string}[]}[]} poems
 * @param {{id: string, members: string[]}[]} tags
 */
export function assertTagIndexConsistent(poems, tags) {
  /** @type {Map<string, Set<string>>} */
  const fromPoems = new Map();
  for (const p of poems) fromPoems.set(p.id, new Set((p.tags ?? []).map((t) => t.id)));
  /** @type {Map<string, Set<string>>} */
  const fromIndex = new Map();
  for (const t of tags) {
    for (const poemId of t.members) {
      if (!fromIndex.has(poemId)) fromIndex.set(poemId, new Set());
      /** @type {Set<string>} */ (fromIndex.get(poemId)).add(t.id);
    }
  }
  for (const [poemId, wanted] of fromPoems) {
    const got = fromIndex.get(poemId) ?? new Set();
    const missing = [...wanted].filter((id) => !got.has(id));
    const extra = [...got].filter((id) => !wanted.has(id));
    if (missing.length || extra.length) {
      throw new Error(
        `内部不一致：诗「${poemId}」的 tags=${JSON.stringify([...wanted])}，而顶层 tags[].members 给的是 ${JSON.stringify([...got])}` +
          `${missing.length ? `；缺 ${missing.join('、')}` : ''}${extra.length ? `；多 ${extra.join('、')}` : ''}`,
      );
    }
  }
  for (const poemId of fromIndex.keys()) {
    if (!fromPoems.has(poemId)) {
      throw new Error(`内部不一致：顶层 tags[].members 里出现了不存在的诗 id「${poemId}」`);
    }
  }
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

  /** 顶层 `tags`：**从诗归属汇总**（编译期生成）；成员按 `orderInTag` 升序，标签之间按拼音。 */
  /** @type {Map<string, string>} */
  const displayPaths = new Map(records.map((r) => [r.id, r.displayPath]));
  // 朝代内序号唯一（用户 2026-10-19 定，B 口径）：必须在写产物前把冲突报成诊断。
  checkOrderInSourceUnique(poems, errors, displayPaths);
  const tags = buildTagIndex(poems, errors, displayPaths);
  assertTagIndexConsistent(poems, tags);

  if (errors.length > 0) {
    return { content: null, errors, versionNotes: [], contentVersion: null, orderStrategy };
  }

  /** 顶层 `dynasties` ＝ **有序中文值数组**（只列实际有内容的组，次序即注册表 order 升序）。 */
  const dynasties = [...new Set(poems.map((p) => p.dynasty))].sort(
    (a, b) => dynastyOrderOf(a) - dynastyOrderOf(b) || (a < b ? -1 : a > b ? 1 : 0),
  );

  const digestHex = contentDigest({ formatVersion: FORMAT_VERSION, dynasties, tags, poems });
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
    tags,
    poems,
  };
  return { content, errors: [], versionNotes: resolved.notes, contentVersion: resolved.version, orderStrategy };
}
