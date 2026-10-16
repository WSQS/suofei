// 纯 DOM 渲染：目录（组可折叠）、诗页（全部居中／语义折行／笔记②）、
// 诗歌详情页（最小 Markdown 渲染）、关于页。
//
// 视觉与排布按**已采纳的原型锚**落地（见 docs/design/implementation-plan.md §2.2 与
// items/app-ui/history/ 下的归档轮次）。这里只负责结构，尺寸/对齐/字号都在 styles.css。
//
// 安全/保真约定：
//  - 所有来自 content.json 的文本一律走 textContent（或 createTextNode）写入，
//    绝不拼 innerHTML，所以笔记/详情里的 `<b>` 会原样显示、不会被当标签执行。
//  - 每印刷行是一个独立元素（.line），空行信息来自 stanzas 的分段结构。
//
// 次序约定（**不许在客户端重排**）：
//  编译期是唯一排序权威（IF-15/IF-16）。产物组内只要有**任何一首带了 `orderInSource`（整数）**
//  就说明「产物已经排好了」，目录**照产物数组次序**渲染；一首都没带才退回本机拼音兜底，
//  并在状态面板写明。用户 2026-10-14 拍板：产物**只发 `orderInSource`**。
//
// 字段形状（**formatVersion 2**，用户 2026-10-15「字段集一变就升」）：
//  顶层 `dynasties` ＝有序中文值数组；每首 10 键，`dynasty` 单值、`detail` 是最小 Markdown 文本。

import { ABOUT, HONEST_STORAGE_NOTE, ROUTES } from './config.js';

/** 「谁是佚名/未知作者」：**唯一来源 = schema/unknown-authors.json**（契约线提供，机器可读；
 *  契约正文只说明来源，不再被任何代码/测试正则解析）。
 *  静态站点运行期读不到那个文件，所以这里写一份**副本**；e2e 会读文件并断言两份**逐字一致**。 */
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
 * 产物「已经排好了吗」的开关依据 = **`orderInSource`**（用户 2026-10-14 拍板）。
 *  - 组内只要有任何一首带了**整数** `orderInSource` → **产物数组次序就是权威**，客户端一律不重排；
 *  - 一首都没带 → 退回本机拼音排序兜底；
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
 * 按时代分组。**组的次序照顶层 `dynasties` 数组**（本版＝有序中文值数组）；
 * **组名精确匹配**（`poem.dynasty === dynasties[i]`，不 trim、不别名、不折叠大小写）；
 * 组内**照 `poems` 数组次序原样**，不在客户端重排（见 hasProductOrder）。
 */
export function groupPoems(doc) {
  const byDynasty = new Map();
  for (const poem of doc.poems) {
    const key = poem.dynasty;
    if (!byDynasty.has(key)) byDynasty.set(key, []);
    byDynasty.get(key).push(poem);   // 不排序：数组次序就是产物次序
  }

  const groups = [];
  for (const name of doc.dynasties ?? []) {
    if (byDynasty.has(name)) {
      groups.push({ key: name, label: name, poems: byDynasty.get(name) });
      byDynasty.delete(name);
    }
  }
  // 产物没声明的组（手写 JSON 才会出现）：追加在后面，避免整组消失；
  // 正常产物里不会走到这里（校验要求 dynasty 已在顶层 dynasties 中声明）。
  const leftovers = [...byDynasty.entries()].sort((a, b) => collator.compare(a[0], b[0]));
  for (const [name, poems] of leftovers) groups.push({ key: name, label: name, poems });

  if (!hasProductOrder(doc)) {
    for (const g of groups) g.poems.sort(comparePoems);
  }
  return groups;
}

export function getPoem(doc, id) {
  return doc.poems.find((p) => p.id === id) ?? null;
}

export function hasNotes(poem) {
  return typeof poem?.notes === 'string' && poem.notes.trim() !== '';
}

export function hasDetail(poem) {
  return typeof poem?.detail === 'string' && poem.detail.trim() !== '';
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

// ---------------------------------------------------------------- 最小 Markdown 渲染
//
// 闭集 8 样（items/content-format/prototypes/rules-v4/md-subset.md）：
//   段落 / 段内换行 / `- ` 无序列表 / `1. ` 有序列表 / **粗体** / *斜体* / `### ` 三级标题 / `> ` 引用。
// 越界写法（表格/图片/链接/反引号/围栏/`# `/`#### `/任务列表/脚注/行首 HTML/`* ` 列表）由**编译期**报错
// ⇒ 产物里不会出现；这里也刻意**不支持**它们（`* ` 不再当列表，落回段落、字面显示）。

/** 行内：**粗体** 与 *斜体*（其余一律纯文本，绝不解析 HTML）。 */
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

const RE_H3 = /^###\s+(.*)$/;
const RE_UL = /^-\s+(.*)$/;
const RE_OL = /^\d+\.\s+(.*)$/;
const RE_QUOTE = /^>\s?(.*)$/;

/**
 * 把一段最小 Markdown 渲染成 DOM（全部以文本节点写入，不解析 HTML）。
 * @param {string} markdown
 * @param {{rootClass?: string, rootTest?: string}} [opts]
 */
export function renderMarkdown(markdown, { rootClass = 'md', rootTest = null } = {}) {
  const root = h('div', { class: rootClass });
  if (rootTest) root.dataset.test = rootTest;

  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
  let paragraph = [];
  let list = null;      // ul 或 ol
  let quote = null;     // blockquote

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const p = h('p', { class: 'md-p', dataset: { test: 'md-p', md: 'p' } });
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
  const flushQuote = () => {
    if (!quote) return;
    root.append(quote);
    quote = null;
  };
  const flushAll = () => { flushParagraph(); flushList(); flushQuote(); };

  for (const line of lines) {
    if (line.trim() === '') { flushAll(); continue; }
    const h3 = RE_H3.exec(line);
    if (h3) {
      flushAll();
      root.append(h('h3', { class: 'md-h3', dataset: { test: 'md-h3', md: 'h3' } }, inlineNodes(h3[1])));
      continue;
    }
    const ul = RE_UL.exec(line);
    if (ul) {
      flushParagraph(); flushQuote();
      if (!list || list.tagName !== 'UL') { flushList(); list = h('ul', { class: 'md-ul', dataset: { test: 'md-ul', md: 'ul' } }); }
      list.append(h('li', { class: 'md-li', dataset: { test: 'md-li', md: 'li' } }, inlineNodes(ul[1])));
      continue;
    }
    const ol = RE_OL.exec(line);
    if (ol) {
      flushParagraph(); flushQuote();
      if (!list || list.tagName !== 'OL') { flushList(); list = h('ol', { class: 'md-ol', dataset: { test: 'md-ol', md: 'ol' } }); }
      list.append(h('li', { class: 'md-li', dataset: { test: 'md-li', md: 'li' } }, inlineNodes(ol[1])));
      continue;
    }
    const q = RE_QUOTE.exec(line);
    if (q) {
      flushParagraph(); flushList();
      if (!quote) {
        quote = h('blockquote', { class: 'md-quote', dataset: { test: 'md-quote', md: 'quote' } });
        quote.__para = h('p', { class: 'md-p', dataset: { test: 'md-p', md: 'p' } });
        quote.append(quote.__para);
      }
      // 连续引用行合成同一段（段内换行＝一次换行）
      if (quote.__para.childNodes.length) quote.__para.append(h('br'));
      quote.__para.append(...inlineNodes(q[1]));
      continue;
    }
    flushList(); flushQuote();
    paragraph.push(line);
  }
  flushAll();
  return root;
}

// ---------------------------------------------------------------- 语义折行
//
// 用户 2026-10-16 逐项确认的规则（采纳锚：round-2026-10-16-break-semantic/ARCHIVE.md）：
//   1. 宽度足够就**保持原诗行**；只有真超宽才按句读拆。
//   2. 多个标点取「**当前行放得下范围内最后那个可用句读**」（不取越界的整条末尾；不用 rank 优先级表）。
//   3. 无标点／半句本身仍超宽 ⇒ **在行尾按放得下的字符断行，余文续行**；不删除/不截断/不加省略号/不缩字号/不溢出。
//   4. **避免逗号、句号跑到行首**；必要时把前一字连标点一起下移。
//   5. 两个视觉行都继承居中；`stanzas` 与正文一字不改（断行只是视觉折行）。
//
// ⚠ 纯 CSS 做不到「按标点优先断」（`line-break` 只有字位＋禁则）⇒ 这一份分行结果在渲染层算，
//   **两端必须同一规则**（Android 侧另做一次）。

const SEMANTIC_PUNCT = new Set(['。', '！', '？', '，', '、', '；', '：']);

/** 把一个印刷行按上述规则拆成若干视觉行（纯函数；measure(text) 返回该串的排版宽）。 */
export function breakPoemLine(text, maxWidth, measure) {
  const src = String(text);
  if (!(maxWidth > 0) || measure(src) <= maxWidth) return [src];
  const out = [];
  let rest = src;
  let guard = 0;
  while (rest.length > 0 && guard < 4096) {
    guard += 1;
    if (measure(rest) <= maxWidth) { out.push(rest); break; }
    // 本行放得下的最大字符数（行很短，逐字量即可）
    let fit = 0;
    for (let i = 1; i <= rest.length; i += 1) {
      if (measure(rest.slice(0, i)) <= maxWidth) fit = i; else break;
    }
    if (fit === 0) fit = 1;                       // 兜底：至少放一个字符（不溢出靠容器 overflow-wrap）
    // 规则 2：窗口 [1, fit] 内位置**最后**的句读（标点归前句）
    let cut = -1;
    for (let i = fit; i >= 1; i -= 1) {
      if (SEMANTIC_PUNCT.has(rest[i - 1])) { cut = i; break; }
    }
    if (cut === -1) cut = fit;                     // 规则 3：无标点/半句超宽 ⇒ 行尾字符断
    // 规则 4：下一行不得以收尾标点起行 ⇒ 把前一字连标点一起下移
    while (cut > 1 && SEMANTIC_PUNCT.has(rest[cut])) cut -= 1;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  return out;
}

function makeMeasurer(container) {
  const span = document.createElement('span');
  span.className = 'line line--measure';
  span.setAttribute('aria-hidden', 'true');
  container.append(span);
  return {
    measure: (text) => { span.textContent = text; return span.getBoundingClientRect().width; },
    remove: () => span.remove(),
  };
}

let currentPoemBody = null;

function layoutPoemBody(body) {
  const stanzas = body.__stanzas;
  if (!Array.isArray(stanzas)) return;
  const sections = [...body.querySelectorAll('[data-test="stanza"]')];
  const maxWidth = body.clientWidth;
  const measurer = makeMeasurer(body);
  let printedIndex = 0;
  sections.forEach((sec, si) => {
    sec.replaceChildren();
    const printedLines = stanzas[si] ?? [];
    printedLines.forEach((printed) => {
      const visual = maxWidth > 0 ? breakPoemLine(printed, maxWidth, measurer.measure) : [printed];
      visual.forEach((piece, vi) => {
        sec.append(h('p', {
          class: 'line',
          dataset: {
            test: 'poem-line',
            lineIndex: String(printedIndex),
            printedLine: String(printedIndex),
            visualIndex: String(vi),
          },
          text: piece,
        }));
      });
      printedIndex += 1;
    });
  });
  measurer.remove();
}

/** 视口/列宽变化后重算当前诗页的视觉折行（纯重排，不动内容）。 */
export function relayoutPoemBody() {
  if (currentPoemBody && currentPoemBody.isConnected) layoutPoemBody(currentPoemBody);
}

/** 诗页正文：保留分段（空行）与逐行文本；超宽的行按语义折行规则拆成多个视觉行。 */
export function renderPoemBody(poem) {
  const body = h('div', { class: 'poem-body', dataset: { test: 'poem-body' } });
  body.__stanzas = poem.stanzas;
  poem.stanzas.forEach((stanza, si) => {
    const sec = h('section', {
      class: 'stanza',
      dataset: { test: 'stanza', stanzaIndex: String(si) },
    });
    if (si > 0) sec.classList.add('stanza--not-first');
    body.append(sec);
  });
  currentPoemBody = body;
  // 此刻还没进 DOM（clientWidth = 0）⇒ 先按原样放好，由 main.js 在挂载后调 relayoutPoemBody()。
  return body;
}

// ---------------------------------------------------------------- 目录

function poemRow(poem, onOpen) {
  const title = h('span', { class: 'poem-row-title', text: poem.title });
  const author = h('span', { class: 'poem-row-author', text: poem.author });
  const link = h('a', {
    class: 'poem-row',
    href: ROUTES.poem(poem.id),
    dataset: { test: 'poem-row', poemId: poem.id },
  }, [title, author]);
  // 用户 2026-10-15 定：目录页**不要「有笔记」标记**（两端都无）。
  link.addEventListener('click', () => onOpen?.(poem.id));
  return link;
}

/**
 * 首屏：按时代分组目录。**组这一层可折叠**（IF-44：首态全部收起、整组头可点、各组独立）；
 * 记号＝悬挂在组名左沿之外的方括号 `[+]/[−]`（方向已由用户局部选定），**只表达状态**。
 * @param {{onOpen?: Function, onAbout?: Function, isExpanded?: (key:string)=>boolean, onToggle?: Function}} [opts]
 */
export function renderIndex(doc, { onOpen, onAbout, isExpanded, onToggle } = {}) {
  const root = h('div', { class: 'view view--index', dataset: { test: 'view-index' } });
  const bar = h('div', { class: 'index-bar', dataset: { test: 'index-bar' } });
  // 「关于」入口（用户 2026-10-15 定：目录页顶部只放它，不重复应用名）。
  const about = h('a', { class: 'about-link', href: ROUTES.about, dataset: { test: 'about-link' }, text: '关于' });
  about.addEventListener('click', () => onAbout?.());
  bar.append(about);
  root.append(bar);

  const groups = groupPoems(doc);
  for (const g of groups) {
    const expanded = Boolean(isExpanded?.(g.key));
    const sec = h('section', {
      class: 'dynasty-group',
      dataset: { test: 'dynasty-group', dynastyKey: g.key, dynasty: g.label },
    });

    const mark = h('span', { class: 'gh-mark', dataset: { test: 'group-mark' }, text: expanded ? '[−]' : '[+]' });
    mark.setAttribute('aria-hidden', 'true');
    const slot = h('span', { class: 'gh-slot' }, [mark]);
    const label = h('span', { class: 'dynasty-label', dataset: { test: 'dynasty-label' }, text: g.label });
    const count = h('span', { class: 'dynasty-count' }, [h('b', { text: String(g.poems.length) }), ' 首']);
    const head = h('button', {
      type: 'button',
      class: 'dynasty-group-title',
      dataset: { test: 'dynasty-group-title' },
      'aria-expanded': expanded ? 'true' : 'false',
    }, [slot, label, count]);

    const list = h('div', { class: 'poem-list', dataset: { test: 'poem-list' } });
    for (const p of g.poems) list.append(poemRow(p, onOpen));
    if (!expanded) list.hidden = true;

    head.addEventListener('click', () => {
      const next = head.getAttribute('aria-expanded') !== 'true';
      head.setAttribute('aria-expanded', next ? 'true' : 'false');
      mark.textContent = next ? '[−]' : '[+]';
      list.hidden = !next;
      onToggle?.(g.key, next);
    });

    sec.append(head, list);
    root.append(sec);
  }
  return root;
}

// ---------------------------------------------------------------- 诗页

/** 顶部行：返回在左、（笔记）详情在右；**不参与居中**（用户 2026-10-15 定）。 */
function topRow(children) {
  return h('div', { class: 'top-row', dataset: { test: 'top-row' } }, children);
}

/**
 * 诗页：**全部居中**（题名／身份行／正文每一行）＋ **语义折行** ＋ **笔记②**
 * （入口在顶部行、展开在正文下方内联无框；**无笔记整块隐藏**）。
 * 正文之后的「详情」入口已在顶部行右侧（用户 2026-10-16 定，与返回同一行）。
 */
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
  const right = h('div', { class: 'top-right' });

  let notesPanel = null;
  if (hasNotes(poem)) {
    const panelId = `notes-${poem.id}`;
    notesPanel = h('section', { class: 'notes-inline', dataset: { test: 'notes-inline' }, id: panelId });
    notesPanel.hidden = true;
    notesPanel.append(renderMarkdown(poem.notes, { rootClass: 'notes-body', rootTest: 'notes-body' }));
    const entry = h('button', {
      type: 'button', class: 'notes-entry', dataset: { test: 'notes-entry' },
      'aria-expanded': 'false', 'aria-controls': panelId, text: '[+]笔记',
    });
    entry.addEventListener('click', () => {
      const next = entry.getAttribute('aria-expanded') !== 'true';
      entry.setAttribute('aria-expanded', next ? 'true' : 'false');
      entry.textContent = next ? '[−]笔记' : '[+]笔记';
      notesPanel.hidden = !next;
    });
    right.append(entry);
  }

  const detail = h('a', {
    class: 'detail-link', href: ROUTES.detail(poem.id), dataset: { test: 'poem-detail-link' }, text: '详情',
  });
  detail.addEventListener('click', () => onDetail?.());
  right.append(detail);

  root.append(topRow([back, right]));
  root.append(h('h1', { class: 'poem-title', dataset: { test: 'poem-title' }, text: poem.title }));
  const metaBits = [poem.author, poem.dynasty, poem.genre];
  root.append(h('p', {
    class: 'poem-meta', dataset: { test: 'poem-meta' }, text: metaBits.filter(Boolean).join(' · '),
  }));
  root.append(renderPoemBody(poem));
  if (notesPanel) root.append(notesPanel);
  return root;
}

// ---------------------------------------------------------------- 诗歌详情页（第四页）

/**
 * 诗歌详情页：**诗题①左对齐** ＋ **返回（回到这首诗）** ＋ **底本与来源①正文前带标签**
 * ＋ **详情正文＝最小 Markdown 渲染**（`### ` eyebrow／`> ` 引用／`1. ` 有序列表；用户 2026-10-16 定 D0）。
 * 不重复作者/朝代/体裁（用户 2026-10-15 定）。返回落到**那首诗**，深链接直开也一样。
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
  root.append(topRow([back]));
  root.append(h('h1', { class: 'poem-title poem-title--left', dataset: { test: 'detail-title' }, text: poem.title }));

  const foot = h('dl', { class: 'source-block', dataset: { test: 'source-block' } });
  foot.append(h('dt', { text: '底本与来源' }), h('dd', { dataset: { test: 'detail-source' }, text: poem.source || '未记录' }));
  root.append(foot);

  const body = h('div', { class: 'detail-body', dataset: { test: 'detail-body' } });
  if (hasDetail(poem)) {
    body.append(renderMarkdown(poem.detail));
  } else {
    // 没有详情文本＝真实状态，如实说明（不编内容）。
    body.append(h('p', {
      class: 'detail-empty', dataset: { test: 'detail-empty' },
      text: '这首诗在产物里没有记录详情文本。',
    }));
  }
  root.append(body);
  return root;
}

// ---------------------------------------------------------------- 关于页

/**
 * 「关于」页（原「更新页」改名，用户 2026-10-15 定）：两端都有、**同一批字段**（`web/about-fields.json`）。
 * 字段值平台相关：Web 的应用版本＝站点资源版本；内容来源＝本次站点部署（随 SW 缓存）。
 * Web 的更新交给 Service Worker，所以这里**没有**「更新」块（Android 在那页里多一块「更新」）。
 * 排布按 `round-2026-10-16-about-min` 的 **V3（标签左对齐）＋ 无区域框**；「初态只按钮」那条
 * 针对的是更新控件（Web 无此块 ⇒ 不适用，见报告）。
 */
export function renderAboutPage({ appVersion, doc, onBack } = {}) {
  const root = h('div', { class: 'view view--about', dataset: { test: 'view-about' } });
  const back = h('a', { class: 'back-link', href: ROUTES.index, dataset: { test: 'about-back-to-index' }, text: '← 目录' });
  back.addEventListener('click', () => onBack?.());
  root.append(topRow([back]));
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
