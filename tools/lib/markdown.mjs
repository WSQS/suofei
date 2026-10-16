// 契约线 C：最小 Markdown 闭集（rules-v4 已通过的语法/细则）——**源语法**的这一份唯一定义。
//
// 这里只有两件事：① 把一行分成块类型；② 越界写法报哪个码、文案怎么说（逐字沿用
// `items/content-format/history/round-2026-10-16-rules-v4/`（已归档的原型轮）的演示输出，契约 §3.1 的码表引用的就是这些文案）。
//
// 边界（别混）：
//   - 这是**源语法**的闭集（写源文件时允许什么），与**渲染层的视觉折行规则**是两件事；
//   - 正文（原文区）不走 Markdown：诗行里的 `**`、`- ` 原样保留，只单拎一条「行首 `#`」报警
//     （见 content-build.mjs 的 validateOriginLine）；
//   - **一行一码**：同一行同时越界多种写法时只报优先级最高的那一种（避免刷屏）。

/**
 * 闭集 8 样（**闭集**，不是「至少支持这些」）：
 * paragraph / line-break / ul-dash / ol-number / bold / italic / h3 / quote。
 * 引用与有序列表的真实用例目前为空（真实 19 首里没有），只在夹具里行使。
 */
export const SUBSET = Object.freeze([
  'paragraph',
  'line-break',
  'ul-dash',
  'ol-number',
  'bold',
  'italic',
  'h3',
  'quote',
]);

/** 越界语法 → 码（本文件给出的判定与该表一一对应）。 */
export const MD_CODES = Object.freeze({
  'task-list': 'MD_TASK_LIST',
  html: 'MD_HTML',
  'heading-other': 'MD_HEADING',
  table: 'MD_TABLE',
  image: 'MD_IMAGE',
  link: 'MD_LINK',
  'inline-code': 'MD_INLINE_CODE',
  footnote: 'MD_FOOTNOTE',
  'star-list': 'MD_STAR_LIST',
  'marker-form': 'MD_MARKER_FORM',
});

/**
 * 「看起来是块标记、但形式不合规」的探测（越界 ⇒ 统一拒绝）。
 *
 * 闭集内的四个块标记一律要求：**行首第 0 列** ＋ **恰好一个 ASCII 空格（U+0020）** ＋ 其后**非空白**。
 * 因此下面这些都要报错（而不是静默当段落）：制表符分隔、多个空格、行首缩进、裸标记。
 * 已经由更早的码覆盖的形式不走这里：`- [ ]`（`MD_TASK_LIST`）、`* `（`MD_STAR_LIST`）、
 * 行首 `#` 家族（`MD_HEADING`，含 `###` 后不是恰好一个空格）。
 */
const MARKER_FORM_NEAR_MISS = /^(?:[ \t]+(?=[-*>#]|\d+\.)|(?:[-*#>]|\d+\.)[ \t])/;

/**
 * 把不可见字符写成可见转义（否则「为什么报错」在终端里看不出来）。首/尾空白也写成转义。
 * 报错的守则：**必须让原因可见**。
 * @param {string} s
 */
export function vis(s) {
  const esc = (c) => `\\u${c.codePointAt(0).toString(16).padStart(4, '0')}`;
  return String(s)
    .replace(/^[\s\u3000]+|[\s\u3000]+$/g, (m) => [...m].map(esc).join(''))
    .replace(/[\u0000-\u001f\u007f\u00a0\u2000-\u200f\u2028\u2029\u3000]/g, esc);
}

/**
 * 行分类（一行一码：顺序＝优先级）。返回的类名见 MD_CODES；
 * 'paragraph'/'ul'/'ol'/'quote'/'heading-h3'/'blank' 是**闭集内**（不报错）的类。
 * @param {string} line
 */
export function classifyLine(line) {
  if (/^\s*[-*+]\s+\[[ xX]\]\s/.test(line)) return 'task-list';
  if (/^\s*<\/?[A-Za-z][^>]*>/.test(line)) return 'html';
  if (/^\s*#{1,6}/.test(line)) return /^### \S/.test(line) ? 'heading-h3' : 'heading-other';
  if (/^\s*\|/.test(line)) return 'table';
  if (/!\[/.test(line)) return 'image';
  if (/\]\(/.test(line)) return 'link';
  if (/`/.test(line)) return 'inline-code';
  if (/\[\^/.test(line)) return 'footnote';
  if (/^\s*\*\s+\S/.test(line)) return 'star-list';
  // ↓ 闭集内的四个块标记：**行首第 0 列** ＋ **恰好一个 ASCII 空格** ＋ 其后**非空白**（不 trim、不宽容 `\s`）。
  if (/^### \S/.test(line)) return 'heading-h3';
  if (/^- \S/.test(line)) return 'ul';
  if (/^\d+\. \S/.test(line)) return 'ol';
  if (/^> \S/.test(line)) return 'quote';
  // ↓ 像标记但形式不合规（制表/多空格/缩进/裸标记）⇒ 越界、统一拒绝（见 MARKER_FORM_NEAR_MISS）。
  if (MARKER_FORM_NEAR_MISS.test(line)) return 'marker-form';
  if (line.trim() === '') return 'blank';
  return 'text';
}

/** 每个码的文案构造器（逐字沿用 rules-v4 演示输出）。 */
const MD_MESSAGE = {
  MD_HEADING: (line) =>
    /^\s*##(?!#)\S/.test(line)
      ? `这一行看起来是节标题，但 \`##\` 后面缺一个空格（分界要求「行首恰好 \`## \` 后跟非空节名」）：${JSON.stringify(vis(line))}。它会原样留在正文里（不是新节，也不报未知节）—— 请补上空格，或把 \`##\` 删掉。`
      : `节正文里出现不在最小范围里的标题：${JSON.stringify(vis(line))}。最小范围只收行首恰好 \`### \`（三级标题）；\`# \`、\`#### \` 及更深都要报错。`,
  MD_TASK_LIST: (line) => `详情/笔记里出现任务列表：${JSON.stringify(vis(line))}。最小范围不含任务列表；请改成普通列表项（\`- \`）或去掉复选框。`,
  MD_TABLE: (line) => `详情/笔记里出现表格（行首 \`|\`）：${JSON.stringify(vis(line))}。最小范围不含表格（Compose 端要自绘）；请改成段落或列表。`,
  MD_IMAGE: (line) => `详情/笔记里出现图片：${JSON.stringify(vis(line))}。最小范围不含图片（离线应用没有图片资源通道）；请改成文字说明。`,
  MD_LINK: (line) => `详情/笔记里出现链接：${JSON.stringify(vis(line))}。最小范围不含链接（离线应用里点外链的行为未定）；请把地址写成纯文本。`,
  MD_INLINE_CODE: (line) => `详情/笔记里出现反引号（行内代码或代码围栏）：${JSON.stringify(vis(line))}。最小范围不含行内代码与围栏；请改成普通文字。`,
  MD_FOOTNOTE: (line) => `详情/笔记里出现脚注写法：${JSON.stringify(vis(line))}。最小范围不含脚注；请把注释直接写进正文。`,
  MD_HTML: (line) => `详情/笔记行首出现 HTML 标签：${JSON.stringify(vis(line))}。最小范围不含 HTML（两端都不会执行它）；请删掉标签。`,
  MD_STAR_LIST: (line) => `详情/笔记出现 \`* \` 星号列表项：${JSON.stringify(vis(line))}。闭集只收 \`- \`（现状 Web 会把 \`* \` 当列表、Android 不会 ⇒ 两端不一致）；请改用 \`- \`。`,
  MD_MARKER_FORM: (line) =>
    `行首的块标记形式不合规：${JSON.stringify(vis(line))}。闭集只收「**行首第 0 列 ＋ 标记后恰好一个 ASCII 空格 ＋ 其后非空白**」：\`- \`、\`1. \`、\`### \`、\`> \`（制表符、多个空格、行首缩进、裸标记都不收——它们会让两端的块类型对不上）。请改成恰好一个空格，或把开头的空白删掉。`,
  MD_CODE_FENCE: (line) => `正文里出现代码围栏：${JSON.stringify(vis(line))}。① 围栏内不算节分界（所以不会另报未知节）；② 最小范围不含围栏，所以这里报错。若确实要贴代码，请先把围栏加进范围并同步两端渲染。`,
  MD_EMPHASIS_UNCLOSED: (line) =>
    `详情/笔记里出现未闭合的行内强调：${JSON.stringify(vis(line))}。\`**粗体**\` 与 \`*斜体*\` 都必须成对；落单的星号本闭集不当作「字面星号」（闭集不含转义写法）—— 请删掉它，或补上配对的星号。`,
};

/**
 * 检查**节正文**里的一行。返回 `{ code, message }` 或 `null`（闭集内 / 空白）。
 * @param {string} line
 * @returns {{code: string, message: string}|null}
 */
export function checkMarkdownLine(line) {
  const cls = classifyLine(line);
  const code = MD_CODES[cls];
  if (code) return { code, message: MD_MESSAGE[code](line) };
  // 强调闭合性（2026-10-16 由负责人落定：不闭合就报错，落在该行）。
  // 判定口径与「行使探测」同一套：先摘掉成对的 **粗体**，再摘掉成对的 *斜体*，剩下还有 `*` ⇒ 落单。
  const rest = line.replace(/\*\*[^*\n]+\*\*/g, '').replace(/\*[^*\n]+\*/g, '');
  if (rest.includes('*')) return { code: 'MD_EMPHASIS_UNCLOSED', message: MD_MESSAGE.MD_EMPHASIS_UNCLOSED(line) };
  return null;
}

/** 围栏行探测（` ``` ` 与 ` ~~~ `）。返回开头的字符，或 null。 */
export function fenceMarker(line) {
  const m = /^\s*(```+|~~~+)/.exec(line);
  return m ? m[1][0] : null;
}

/** 代码围栏行的诊断（围栏行本身按闭集报错；未闭合另有一条，见 content-build）。 */
export function codeFenceMessage(line) {
  return MD_MESSAGE.MD_CODE_FENCE(line);
}
