// 契约线 C：朝代分组注册表。
//
// 契约（docs/design/content-contract.md 第 1 节）要求诗文件写一个中文 `dynasty`。
// 本表是**唯一权威**：它决定组序（order）与可用组名。
//
// 规则（与契约同一份说法）：
//   - `dynasty` 必须**逐字符等于**本表某个中文 label（**精确匹配，不做 trim**）。
//     契约写的就是「精确匹配」，所以实现里不允许有任何宽容——2026-10-16 去掉了 `lookupDynasty`
//     里的 `trim()`（与 rules-v4 的采纳建议一致；**不得再说「当前工具已符合」**）。
//   - 不做别名猜测（「东汉」「三国」「漢」不会静默归到「汉」「魏晋」）：未声明的 label 直接失败，
//     强制把新分组作为一次**显式**决定写进本表并同步契约。
//   - order 决定顶层 `dynasties` 中文值数组的次序（升序）；formatVersion=2 起产物只写中文值。

/** @typedef {{key: string, label: string, order: number}} DynastyEntry */

/** @type {ReadonlyArray<DynastyEntry>} */
export const DYNASTIES = Object.freeze([
  { key: 'pre-qin', label: '先秦', order: 0 },
  { key: 'han', label: '汉', order: 100 },
  { key: 'wei-jin', label: '魏晋', order: 200 },
  { key: 'nanbei', label: '南北朝', order: 300 },
  { key: 'tang', label: '唐', order: 400 },
  { key: 'song', label: '宋', order: 500 },
  { key: 'yuan', label: '元', order: 600 },
  { key: 'ming', label: '明', order: 700 },
  { key: 'qing', label: '清', order: 800 },
  { key: 'modern', label: '近现代', order: 900 },
  { key: 'unknown', label: '未详', order: 9999 },
].map((e) => Object.freeze(e)));

const BY_LABEL = new Map(DYNASTIES.map((e) => [e.label, e]));

/** 精确匹配（**不 trim**）：`汉 ` / `漢` 都不命中——这是刻意的一致口径，不是漏了容错。
 * @param {string} label
 */
export function lookupDynasty(label) {
  if (typeof label !== 'string') return undefined;
  return BY_LABEL.get(label);
}

/** 注册表里全部中文 label（按显示次序）。 */
export function dynastyLabels() {
  return DYNASTIES.map((e) => e.label);
}

/** label → order（顶层 dynasties 数组与组内排序共用一处）。未声明 label 返回 +∞（排序时排最后）。 */
export function dynastyOrderOf(label) {
  const e = BY_LABEL.get(label);
  return e ? e.order : Number.POSITIVE_INFINITY;
}

export function declaredLabels() {
  return DYNASTIES.map((e) => e.label).join(' / ');
}
