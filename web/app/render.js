// 纯 DOM 渲染：目录分组、搜索、诗页（分行/分节/空行）、笔记按需展开、状态面板。
//
// 视觉刻意保持朴素：本轮不做视觉设计（原型线 B 评审结果出来后统一落两端）。
// 这里只保证结构清晰、正文分行/空行/笔记展开正确。
//
// 安全/保真约定：
//  - 所有来自 content.json 的文本一律走 textContent（或 createTextNode）写入，
//    绝不拼 innerHTML，所以笔记里的 `<b>` 会原样显示、不会被当标签执行。
//  - 每印刷行是一个独立元素（.line），空行信息来自 stanzas 的分段结构，
//    配合 .line{white-space:pre-wrap} 避免 HTML 折叠行内空白。
//
// 次序约定（**不许在客户端重排**）：
//  编译期是唯一排序权威（IF-15/IF-16）。产物带了整数排序键（authorSortKey/titleSortKey）时，
//  目录与搜索结果都**照产物数组次序**渲染；只有产物一个排序键都没给（老产物/手写 JSON）
//  才退回本机拼音兜底。否则两端各自再排一遍，会把用户拍板的「底本原次序」静默推翻，
//  两端还可能排出不同顺序。

import { ROUTES } from './config.js';

/** 契约 §2 的显式规则：佚名/未知作者在该组内排最后。 */
export const UNKNOWN_AUTHORS = new Set(['佚名', '无名氏', '未详', '不详', '']);
const collator = new Intl.Collator(['zh-Hans-CN-u-co-pinyin', 'zh-Hans-CN', 'zh'], {
  numeric: true,
  sensitivity: 'variant',
});

function compareByKey(aKey, bKey, aRaw, bRaw) {
  // 编译期写好的拼音排序键（契约 §2）优先；缺少键就回退到运行时拼音 Collator。
  if (aKey && bKey) return collator.compare(aKey, bKey);
  return collator.compare(aRaw, bRaw);
}

/**
 * 本机拼音兜底比较器：**只在产物没给排序键时**使用（见 productSortKeysStatus）。
 * 组内顺序：作者（佚名/未知作者最后）→ 诗名 → id 兜底稳定。
 */
export function comparePoems(a, b) {
  const au = UNKNOWN_AUTHORS.has(a.author);
  const bu = UNKNOWN_AUTHORS.has(b.author);
  if (au !== bu) return au ? 1 : -1;
  const byAuthor = compareByKey(a.authorSortKey, b.authorSortKey, a.author, b.author);
  if (byAuthor !== 0) return byAuthor;
  const byTitle = compareByKey(a.titleSortKey, b.titleSortKey, a.title, b.title);
  if (byTitle !== 0) return byTitle;
  return collator.compare(a.id, b.id);
}

/**
 * 产物是否给了可用的排序键（IF-15：`authorSortKey`/`titleSortKey` 是**整数名次**）。
 *
 * 这是「谁说了算」的开关：
 *  - 给了（至少一个可用的整数键）→ **产物数组次序就是权威**，客户端一律不重排；
 *  - 一个都没给（老产物 / 手写 JSON）→ 退回本机拼音排序兜底。
 *
 * 为什么键必须是整数才认：IF-15 已经把形状冻结为整数名次；v0 式的字符串键
 * （或任何非整数）不是当前产物形状，此时按「没给」处理，拿本机拼音兜底，
 * 并在状态面板里把这件事写出来，不静默。
 */
export function productSortKeysStatus(doc) {
  let present = 0;
  let usable = 0;
  for (const p of doc?.poems ?? []) {
    for (const k of ['authorSortKey', 'titleSortKey']) {
      const v = p?.[k];
      if (v === undefined || v === null) continue;
      present += 1;
      if (Number.isInteger(v)) usable += 1;
    }
  }
  return {
    present,
    usable,
    productOrderAuthoritative: usable > 0,
    wrongType: present > usable,
  };
}

/** 产物次序是否权威（供渲染与状态面板共用）。 */
export function hasProductSortKeys(doc) {
  return productSortKeysStatus(doc).productOrderAuthoritative;
}

/**
 * 按时代分组。**组的次序照产物给的 `dynasties` 数组**（契约 §2：产物里已按 order 升序），
 * 组内**照 `poems` 数组次序原样**，不在客户端重排（见 hasProductSortKeys）。
 */
export function groupPoems(doc) {
  const byKey = new Map();
  for (const poem of doc.poems) {
    const key = poem.dynastyKey;
    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        label: poem.dynastyLabel,
        order: poem.dynastyOrder,
        poems: [],
      });
    }
    byKey.get(key).poems.push(poem);   // 不排序：数组次序就是产物次序
  }

  const groups = [];
  for (const d of doc.dynasties ?? []) {
    const g = byKey.get(d.key);
    if (g) {
      groups.push(g);
      byKey.delete(d.key);
    }
  }
  // 产物没声明的组（手写 JSON 才会出现）：追加在后面，避免整组消失；
  // 正常产物里不会走到这里（校验要求 dynastyKey 已在 dynasties 中声明）。
  const leftovers = [...byKey.values()].sort((a, b) => (a.order - b.order) || collator.compare(a.label, b.label));
  const all = [...groups, ...leftovers];

  if (!hasProductSortKeys(doc)) {
    for (const g of all) g.poems.sort(comparePoems);
  }
  return all;
}

/**
 * 跨组搜索：诗名/作者子串匹配（契约 §2 的 v0 最低要求）。
 * **在产物数组次序上过滤，保持同一相对次序**（不重排）；只有产物没给排序键时才本地兜底排序。
 */
export function searchPoems(doc, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return [];
  const hits = doc.poems.filter((p) => p.title.toLowerCase().includes(q) || p.author.toLowerCase().includes(q));
  return hasProductSortKeys(doc) ? hits : hits.sort(comparePoems);
}

export function getPoem(doc, id) {
  return doc.poems.find((p) => p.id === id) ?? null;
}

export function hasNotes(poem) {
  return typeof poem?.notes === 'string' && poem.notes.trim() !== '';
}

function h(tag, props = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'text') el.textContent = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'class') el.className = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

/** 最小 Markdown 子集：段落、行内换行、`- ` 列表、**粗体**、*斜体*。 */
function inlineNodes(text) {
  const nodes = [];
  const re = /\*\*([^*]+)\*\*|\*([^*\n]+)\*/g;
  let last = 0;
  let m = re.exec(text);
  while (m !== null) {
    if (m.index > last) nodes.push(document.createTextNode(text.slice(last, m.index)));
    if (m[1] !== undefined) nodes.push(h('strong', { text: m[1] }));
    else nodes.push(h('em', { text: m[2] }));
    last = m.index + m[0].length;
    m = re.exec(text);
  }
  if (last < text.length) nodes.push(document.createTextNode(text.slice(last)));
  return nodes;
}

/** 笔记正文：全部以文本节点写入，不解析 HTML。 */
export function renderNotesBody(markdown) {
  const root = h('div', { class: 'notes-body', dataset: { test: 'notes-body' } });
  const lines = String(markdown).replace(/\r\n?/g, '\n').split('\n');
  let paragraph = [];
  let list = null;
  const flushParagraph = () => {
    if (!paragraph.length) return;
    const p = h('p', { dataset: { test: 'notes-paragraph' } });
    paragraph.forEach((line, i) => {
      if (i > 0) p.append(h('br'));
      p.append(...inlineNodes(line));
    });
    root.append(p);
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    root.append(list);
    list = null;
  };
  for (const line of lines) {
    if (line.trim() === '') { flushParagraph(); flushList(); continue; }
    const li = /^[-*]\s+(.*)$/.exec(line);
    if (li) {
      flushParagraph();
      if (!list) list = h('ul', { dataset: { test: 'notes-list' } });
      list.append(h('li', {}, inlineNodes(li[1])));
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return root;
}

function poemLine(text, index) {
  return h('p', {
    class: 'line',
    dataset: { test: 'poem-line', lineIndex: String(index) },
    text,
  });
}

/** 诗页正文：保留分段（空行）与逐行文本。 */
export function renderPoemBody(poem) {
  const body = h('div', { class: 'poem-body', dataset: { test: 'poem-body' } });
  let n = 0;
  poem.stanzas.forEach((stanza, si) => {
    const sec = h('section', {
      class: 'stanza',
      dataset: { test: 'stanza', stanzaIndex: String(si) },
    });
    if (si > 0) sec.classList.add('stanza--not-first');
    for (const line of stanza) {
      sec.append(poemLine(line, n));
      n += 1;
    }
    body.append(sec);
  });
  return body;
}

function poemRow(poem, onOpen, opts = {}) {
  const link = h('a', {
    class: 'poem-row',
    href: ROUTES.poem(poem.id),
    dataset: { test: 'poem-row', poemId: poem.id },
  }, [
    h('span', { class: 'poem-row-title', text: poem.title }),
    h('span', { class: 'poem-row-author', text: poem.author }),
  ]);
  if (opts.showDynasty) {
    link.prepend(h('span', { class: 'poem-row-dynasty', text: poem.dynastyLabel }));
  }
  if (hasNotes(poem)) link.append(h('span', { class: 'poem-row-notes', text: '有笔记' }));
  link.addEventListener('click', () => onOpen?.(poem.id));
  return link;
}

/** 首屏：按时代分组目录（组内标题＋作者，顺序按排序键）。 */
export function renderIndex(doc, { onOpen } = {}) {
  const root = h('div', { class: 'view view--index', dataset: { test: 'view-index' } });
  const groups = groupPoems(doc);
  root.append(h('p', { class: 'view-hint', dataset: { test: 'index-summary' },
    text: `${doc.poems.length} 首诗 · ${groups.length} 个时代分组` }));
  for (const g of groups) {
    const sec = h('section', {
      class: 'dynasty-group',
      dataset: { test: 'dynasty-group', dynastyKey: g.key },
    });
    sec.append(h('h2', { class: 'dynasty-group-title' }, [
      h('span', { class: 'dynasty-label', dataset: { test: 'dynasty-label' }, text: g.label }),
      h('span', { class: 'dynasty-count', text: `${g.poems.length} 首` }),
    ]));
    const list = h('div', { class: 'poem-list' });
    for (const p of g.poems) list.append(poemRow(p, onOpen));
    sec.append(list);
    root.append(sec);
  }
  return root;
}

/** 搜索结果：跨组，行内标出时代。 */
export function renderSearchResults(doc, query, { onOpen } = {}) {
  const root = h('div', { class: 'view view--search', dataset: { test: 'view-search' } });
  const hits = searchPoems(doc, query);
  root.append(h('p', { class: 'view-hint', dataset: { test: 'search-summary' },
    text: `搜索「${String(query).trim()}」：${hits.length} 条` }));
  if (!hits.length) {
    root.append(h('p', { class: 'empty-state', dataset: { test: 'search-empty' },
      text: '没有匹配的诗名或作者。' }));
    return root;
  }
  const list = h('div', { class: 'poem-list' });
  for (const p of hits) list.append(poemRow(p, onOpen, { showDynasty: true }));
  root.append(list);
  return root;
}

/** 诗页：题/作者/时代/底本 + 正文 + 笔记（默认折叠，无笔记时如实留空）。 */
export function renderPoemPage(doc, id, { onBack } = {}) {
  const poem = getPoem(doc, id);
  if (!poem) {
    return h('div', { class: 'view view--missing', dataset: { test: 'view-poem-missing' } }, [
      h('p', { class: 'empty-state', text: `找不到这首诗：${id}` }),
    ]);
  }
  const root = h('div', { class: 'view view--poem', dataset: { test: 'view-poem', poemId: poem.id } });
  const back = h('a', { class: 'back-link', href: ROUTES.index, dataset: { test: 'back-to-index' }, text: '← 目录' });
  back.addEventListener('click', () => onBack?.());
  root.append(back);
  root.append(h('h1', { class: 'poem-title', dataset: { test: 'poem-title' }, text: poem.title }));
  const metaBits = [poem.dynastyLabel, poem.author];
  if (poem.era) metaBits.push(poem.era);
  if (poem.genre) metaBits.push(poem.genre);
  root.append(h('p', { class: 'poem-meta', dataset: { test: 'poem-meta' }, text: metaBits.filter(Boolean).join(' · ') }));
  root.append(renderPoemBody(poem));

  const notesSection = h('section', { class: 'notes', dataset: { test: 'notes-section' } });
  if (hasNotes(poem)) {
    const details = h('details', { class: 'notes-details', dataset: { test: 'notes-details' } });
    details.append(h('summary', { dataset: { test: 'notes-summary' }, text: '我的笔记' }));
    details.append(renderNotesBody(poem.notes));
    notesSection.append(details);
  } else {
    // 没有笔记时的真实状态：留空并说明，不伪造内容。
    notesSection.append(h('p', {
      class: 'notes-empty',
      dataset: { test: 'notes-empty' },
      text: '这首诗还没有笔记（未记录）。',
    }));
  }
  root.append(notesSection);

  const foot = h('dl', { class: 'source-block', dataset: { test: 'source-block' } });
  foot.append(h('dt', { text: '底本' }), h('dd', { text: poem.source || '未记录' }));
  if (Array.isArray(poem.variants) && poem.variants.length) {
    foot.append(h('dt', { text: '异文' }));
    for (const v of poem.variants) foot.append(h('dd', { text: `${v.text}（${v.note ?? '无说明'}）` }));
  } else {
    foot.append(h('dt', { text: '异文' }), h('dd', { text: '未记录' }));
  }
  foot.append(h('dt', { text: 'id' }), h('dd', { text: poem.id }));
  root.append(foot);
  return root;
}
