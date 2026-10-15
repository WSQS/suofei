/**
 * 「产物字段集」的唯一口径。
 *
 * 用户 2026-10-15 定的 `formatVersion` 判据是 B：**字段集一变就升**。它的理由是
 * 「机械、可自动断言、没有判断风险」——所以「字段集」必须有一个**机械可算**的定义，
 * 不能靠人读契约散文去判断。这个文件就是那个定义。
 *
 * 权威口径（负责人 2026-10-15 定，见 docs/interface-decisions.md IF-20b）：
 *   **产物 JSON 的键路径**，即客户端真正会去读的那一层。
 *   不取 `schema/content.schema.json`（它允许的键集 ⊇ 实际产物键集，会更早变红），
 *   也不取契约文档里的散文（无法机械比对）。
 *
 * 三条规范化规则，每条都有理由：
 *
 * 1. **只看键，不看值**：值的改动不构成「字段集变化」，那属内容版本（`contentVersion`）管辖。
 *    所以标量**不带类型标记**（`poems[].notes` 无论是 `null` 还是字符串，都是同一条路径）。
 *    否则「某首诗第一次有笔记」就会把字段集门弄红——那是**误报**。
 * 2. **数组占两条：键本身 + 带 `[]` 的形状**。
 *    这样 `stanzas: string[][]`（段→行）与拍平后的 `stanzas: string[]` **指纹不同**——
 *    两端都按「段的数组、每段是行的数组」解析，拍平是会真让客户端错的行为，必须被门抓住。
 *    空数组也照样产生 `[]` 路径 ⇒ 与「键不存在」可区分。
 * 3. **数组下标折叠成 `[]`**：`poems[0].title` 与 `poems[1].title` 是**同一个字段**；
 *    数组内所有元素取**并集**（同类元素形状不一致时，两种形状都算已出现）。
 *    ⚠ 并集的直接后果：**从「一部分元素」上删掉某个键不算字段集变化**（别的元素还有它）；
 *    只有所有元素都不再有它，路径才会消失。这是刻意的——门守的是「形状」，不是「每个元素齐不齐」。
 *
 * 输出按字典序排序 ⇒ 与遍历顺序无关，可稳定哈希。
 */
import { createHash } from 'node:crypto';

export function fieldPaths(value) {
  const out = new Set();
  const walk = (node, prefix) => {
    if (Array.isArray(node)) {
      out.add(`${prefix}[]`); // 数组自己的形状（含「空数组」）
      for (const item of node) walk(item, `${prefix}[]`);
      return;
    }
    if (node === null || typeof node !== 'object') return; // 标量：路径已由父对象登记
    for (const [key, child] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${key}` : key;
      out.add(path); // 键本身（含顶层键；数组也是先有「键存在」这一条）
      if (child !== null && typeof child === 'object') walk(child, path);
    }
  };
  walk(value, '');
  return [...out].sort();
}

export function fieldSetSha256(paths) {
  return createHash('sha256').update(paths.join('\n'), 'utf8').digest('hex');
}

/** 产物文档 → 冻结用的那一条记录（字段路径 + 指纹 + 它声称的 formatVersion）。 */
export function fieldSetEntry(doc) {
  const paths = fieldPaths(doc);
  return {
    formatVersion: doc.formatVersion,
    fieldSetSha256: fieldSetSha256(paths),
    fieldPaths: paths,
  };
}
