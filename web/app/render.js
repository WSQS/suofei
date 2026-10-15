// 纯 DOM 渲染：目录分组、诗页（分行/分节/空行）、笔记按需展开、状态面板。
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
//  编译期是唯一排序权威（IF-15/IF-16）。产物组内只要有**任何一首带了 `orderInSource`（整数）**
//  就说明「产物已经排好了」，目录**照产物数组次序**渲染；一首都没带
//  （老产物/手写 JSON）才退回本机拼音兜底，并在状态面板写明。
//  用户 2026-10-14 拍板：产物**只发 `orderInSource`**，编译期的 `authorSortKey`/`titleSortKey`
//  不再发布（客户端**不再读它们**，即使产物里还带着）。否则两端各自再排一遍，
//  会把用户拍板的「底本原次序」静默推翻，两端还可能排出不同顺序。

import { ABOUT, HONEST_STORAGE_NOTE, ROUTES } from './config.js';

/** 「谁是佚名/未知作者」：**唯一来源 = schema/unknown-authors.json**（契约线提供，机器可读；
 *  契约正文只说明来源，不再被任何代码/测试正则解析）。
 *  静态站点运行期读不到那个文件，所以这里写一份**副本**；e2e 会读文件并断言两份**逐字一致**
 *  （失败时会把两边数组都打出来），Android 与编译器同理对齐同一份文件。
 *  用户 2026-10-14 拍板：`阙名` 并入这份清单。
 *  空/空白作者由 isUnknownAuthor 的空白判定处理，不写进集合。 */
export const UNKNOWN_AUTHORS = new Set(['佚名', '无名氏', '阙名', '未知', '未详', '不详']);

/** 空白作者也算「未知作者」（等价于清单末尾的「/空」）。 */
export function isUnknownAuthor(author) {
  return typeof author !== 'string' || author.trim() === '' || UNKNOWN_AUTHORS.has(author.trim());
}
const collator = new Intl.Collator(['zh-Hans-CN-u-co-pinyin', 'zh-Hans-CN', 'zh'], {
  numeric: true,
  sensitivity: 'variant',
});

/**
 * 本机拼音兜底比较器：**只在产物一首都没带 `orderInSource` 时**使用（见 productOrderStatus）。
 * 组内顺序：作者（佚名/未知作者最后）→ 诗名 → id 兜底稳定。
 * 完全不看 `authorSortKey`/`titleSortKey` —— 那两个键已不再由产物发布（用户 2026-10-14 拍板）。
 */
export function comparePoems(a, b) {
  const au = isUnknownAuthor(a.author);
  const bu = isUnknownAuthor(b.author);
  if (au !== bu) return au ? 1 : -1;
  const byAuthor = collator.compare(a.author ?? '', b.author ?? '');
  if (byAuthor !== 0) return byAuthor;
  const byTitle = collator.compare(a.title ?? '', b.title ?? '');
  if (byTitle !== 0) return byTitle;
  return collator.compare(a.id, b.id);
}

/**
 * 产物「已经排好了吗」的开关依据 = **`orderInSource`**。
 *
 * 用户 2026-10-14 拍板：产物只保留 `orderInSource`（底本原次序），
 * `authorSortKey`/`titleSortKey` 不再发布（只在编译期内部用于排序）。所以：
 *  - 组内只要有任何一首带了**整数** `orderInSource` → **产物数组次序就是权威**，客户端一律不重排；
 *  - 一首都没带（老产物 / 手写 JSON）→ 退回本机拼音排序兜底；
 *  - 带的是非整数（形状不对）→ 按「没带」处理，拿兜底，并在状态面板里写出来，不静默。
 */
export function productOrderStatus(doc) {
  let present = 0;
  let usable = 0;
  for (const p of doc?.poems ?? []) {
    const v = p?.orderInSource;
    if (v === undefined || v === null) continue;
    present += 1;
    if (Number.isInteger(v)) usable += 1;
  }
  return {
    present,
    usable,
    productOrderAuthoritative: usable > 0,
    wrongType: present > usable,
  };
}

/** 产物次序是否权威（供渲染与状态面板共用）。 */
export function hasProductOrder(doc) {
  return productOrderStatus(doc).productOrderAuthoritative;
}

/**
 * 按时代分组。**组的次序照产物给的 `dynasties` 数组**（契约 §2：产物里已按 order 升序），
 * 组内**照 `poems` 数组次序原样**，不在客户端重排（见 hasProductOrder）。
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

  if (!hasProductOrder(doc)) {
    for (const g of all) g.poems.sort(comparePoems);
  }
  return all;
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

function poemRow(poem, onOpen) {
  const title = h('span', { class: 'poem-row-title', text: poem.title });
  const author = h('span', { class: 'poem-row-author', text: poem.author });
  const link = h('a', {
    class: 'poem-row',
    href: ROUTES.poem(poem.id),
    dataset: { test: 'poem-row', poemId: poem.id },
  }, [title, author]);
  // 用户 2026-10-15 定：目录页**不要「有笔记」标记**（两端都无）。
  // Web 原先这里会按 hasNotes 加一个 `.poem-row-notes` 徽标 —— 已删；
  // 有笔记的诗在一级页暂无线索，这是用户明示的已知后果（见 `docs/interface-decisions.md` IF-46）。
  // e2e 有反向断言盯着「目录文本里不得出现『有笔记』」（§4e，用带笔记的夹具诗验）。
  link.addEventListener('click', () => onOpen?.(poem.id));
  return link;
}

/** 首屏：按时代分组目录（组内标题＋作者，顺序按排序键）。 */
export function renderIndex(doc, { onOpen, onAbout } = {}) {
  const root = h('div', { class: 'view view--index', dataset: { test: 'view-index' } });
  const groups = groupPoems(doc);
  const bar = h('div', { class: 'index-bar' }, [
    h('p', { class: 'view-hint', dataset: { test: 'index-summary' },
      text: `${doc.poems.length} 首诗 · ${groups.length} 个时代分组` }),
  ]);
  // 「关于」入口（用户 2026-10-15 定：目录页要有它）。顶栏不再放，放在目录页自己的顶部一行上。
  const about = h('a', { class: 'about-link', href: ROUTES.about, dataset: { test: 'about-link' }, text: '关于' });
  about.addEventListener('click', () => onAbout?.());
  bar.append(about);
  root.append(bar);
  for (const g of groups) {
    const sec = h('section', {
      class: 'dynasty-group',
      dataset: { test: 'dynasty-group', dynastyKey: g.key },
    });
    sec.append(h('h2', { class: 'dynasty-group-title' }, [
      h('span', { class: 'dynasty-label', dataset: { test: 'dynasty-label' }, text: g.label }),
      // 计数用等宽 + 方括号（原型里的结构性记号，CSS 用伪元素加括号，不改文本内容）
      h('span', { class: 'dynasty-count' }, [h('b', { text: String(g.poems.length) }), ' 首']),
    ]));
    const list = h('div', { class: 'poem-list' });
    for (const p of g.poems) list.append(poemRow(p, onOpen));
    sec.append(list);
    root.append(sec);
  }
  return root;
}

/** 诗页：题/作者/时代/体裁 + 正文 + 笔记（默认折叠，无笔记时如实留空）+「详情」入口。
 *  **底本与来源已经搬到「诗歌详情」页**（用户 2026-10-15 定）——诗页不再出现底本/来源，
 *  **也不得出现任何 `variants[].text`**（反向断言在 e2e §1c；详情页必须出现，见 §1c-2）。 */
export function renderPoemPage(doc, id, { onBack, onDetail } = {}) {
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

  // 「详情」入口（第四页＝诗歌详情，用户 2026-10-15 定）。
  // 这里**刻意不渲染** poem.source / poem.variants：底本与来源在详情页，异文也在详情页。
  // 诗的 `id` 不上界面（用户 2026-10-15 定）；地址仍是 `#/p/<id>`，深链接能力不受影响。
  const entry = h('p', { class: 'detail-entry' });
  const detail = h('a', {
    class: 'back-link', href: ROUTES.detail(poem.id), dataset: { test: 'poem-detail-link' }, text: '这一首的考据与来源 →',
  });
  detail.addEventListener('click', () => onDetail?.());
  entry.append(detail);
  root.append(entry);
  return root;
}

/**
 * 诗歌详情页（第四页）：这一首的考据与来源。
 *  ① 底本与来源（诗页原来那块 `poem.source`，原文照搬到这，dt 仍是「底本」）
 *  ② 异文：产物里**每一条** `variants[].text` ＋ 它的 note（含来源）——用有序列表，每条＝文本＋note。
 *     ⚠ 上游正在重审数据组织方式（IF-48，含 variants 字段形状）⇒ **只在这一处集中渲染**，
 *     将来形状若变，只改这一个函数；诗页**不许**渲染异文（e2e 反向断言在 §1c）。
 *  行为：这个页面的「返回」落到**那首诗**（不是目录），深链接直开也一样（用户 2026-10-15 定）。
 */
export function renderDetailPage(doc, id, { onBack } = {}) {
  const poem = getPoem(doc, id);
  if (!poem) {
    return h('div', { class: 'view view--missing', dataset: { test: 'view-detail-missing' } }, [
      h('p', { class: 'empty-state', text: `找不到这首诗：${id}` }),
    ]);
  }
  const root = h('div', { class: 'view view--detail', dataset: { test: 'view-detail', poemId: poem.id } });
  const back = h('a', {
    class: 'back-link', href: ROUTES.poem(poem.id), dataset: { test: 'back-to-poem' }, text: '← 返回这首诗',
  });
  back.addEventListener('click', () => onBack?.());
  root.append(back);
  root.append(h('h1', { class: 'poem-title', dataset: { test: 'detail-title' }, text: poem.title }));
  root.append(h('p', { class: 'view-hint', dataset: { test: 'detail-sub' }, text: '这一首的考据与来源' }));

  const foot = h('dl', { class: 'source-block', dataset: { test: 'source-block' } });
  foot.append(h('dt', { text: '底本' }), h('dd', { dataset: { test: 'detail-source' }, text: poem.source || '未记录' }));
  root.append(foot);

  const variants = Array.isArray(poem.variants) ? poem.variants : [];
  const section = h('section', { class: 'variants', dataset: { test: 'detail-variants' } });
  section.append(h('h2', { class: 'variants-title', dataset: { test: 'detail-variants-title' }, text: '异文' }));
  if (variants.length === 0) {
    // 没有异文＝真实状态，如实说明（不编内容、不留看不懂的空白）。
    section.append(h('p', {
      class: 'variants-empty', dataset: { test: 'detail-variants-empty' },
      text: '这首诗在产物里没有记录异文。',
    }));
  } else {
    const ol = h('ol', { class: 'variant-list', dataset: { test: 'detail-variant-list' } });
    variants.forEach((v, i) => {
      const li = h('li', { class: 'variant', dataset: { test: 'detail-variant', variantIndex: String(i) } });
      li.append(h('p', { class: 'variant-text', dataset: { test: 'detail-variant-text' }, text: v.text }));
      // note 总是渲染（缺失时给一句如实的话）—— 这样 e2e 可以「逐条、按序」比对，
      // 而不是只断言「页面不为空」。
      li.append(h('p', { class: 'variant-note', dataset: { test: 'detail-variant-note' }, text: v.note || '（未记录）' }));
      ol.append(li);
    });
    section.append(ol);
  }
  root.append(section);
  return root;
}

/**
 * 「关于」页（原「更新页」改名，用户 2026-10-15 定）：两端都有、**同一批字段**（`web/about-fields.json`）。
 * 字段值平台相关：Web 的应用版本＝站点资源版本；内容来源＝本次站点部署（随 SW 缓存）。
 * Web 的更新交给 Service Worker，所以这里**没有**「更新」块（Android 在那页里多一块「更新」）。
 * 「诚实的限制」沿用已有文案原文（`HONEST_STORAGE_NOTE`），不新写。
 */
export function renderAboutPage({ appVersion, doc, onBack } = {}) {
  const root = h('div', { class: 'view view--about', dataset: { test: 'view-about' } });
  const back = h('a', { class: 'back-link', href: ROUTES.index, dataset: { test: 'about-back-to-index' }, text: '← 目录' });
  back.addEventListener('click', () => onBack?.());
  root.append(back);
  const dl = h('dl', { class: 'about-fields', dataset: { test: 'about-fields' } });
  const row = (label, value, test) => {
    dl.append(h('dt', { text: label }));
    dl.append(h('dd', { dataset: { test }, text: value }));
  };
  row('应用名', ABOUT.appName, 'about-app-name');
  row('一句话说明', ABOUT.tagline, 'about-tagline');
  row('应用版本', `站点资源版本 v${appVersion}`, 'about-app-version');
  row('内容版本与来源',
    doc ? `v${doc.contentVersion}（来源：本次站点部署，随本站缓存一起保存）` : '（尚未取到）',
    'about-content-version');
  row('诚实的限制', HONEST_STORAGE_NOTE, 'about-honest-limits');
  root.append(dl);
  return root;
}
