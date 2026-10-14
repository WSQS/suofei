// 契约线 C：朝代分组注册表。
//
// 契约（docs/design/content-contract.md 第 1 节）要求诗文件写 `dynasty`（分组依据，如「汉」）
// 与 `dynastyOrder`（组排序键，整数）。契约第 2 节的产物里每首诗还要有 `dynastyKey`，
// 但 v0 没有定义 `dynastyKey` 从哪里来。这里定死：**由本注册表派生**。
//
// 规则（已写回契约第 1/2 节）：
//   - `dynasty` 必须精确命中本表某个 label；命中后取该条的 key / order 作为规范值。
//   - 不做别名猜测（「东汉」「三国」不会静默归到「汉」「魏晋」）：未声明的 label 直接失败，
//     强制把新分组作为一次**显式**决定写进本表并同步契约。
//   - 文件里的 `dynastyOrder` 必须存在、是整数，且等于本表 order（防止文件自带一个和分组
//     注册表打架的排序键）。order 数值直接采用契约第 1 节给出的表。

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

/** @param {string} label */
export function lookupDynasty(label) {
  if (typeof label !== 'string') return undefined;
  return BY_LABEL.get(label.trim());
}

export function declaredLabels() {
  return DYNASTIES.map((e) => e.label).join(' / ');
}
