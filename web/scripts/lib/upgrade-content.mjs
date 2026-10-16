// 临时过渡：把 `formatVersion: 1` 的产物（老形状）升到 `formatVersion: 2`（本版形状）。
//
// 为什么需要它：**字段集升版（1 → 2）由另一条线在 `tools/build-content.mjs` ＋ `schema/`
// 落地**（用户 2026-10-15 拍板「字段集一变就升」，不可逆）。在它合并进来之前，本地
// `dist/content.json` 仍是老形状；Web 端已经**只认 2**，所以本地 e2e 与本地演练需要一个
// 升版适配，才能真的跑在新形状上。
//
// ⚠ 这是**临时适配，不是第二份契约**：编译器一旦产出 `formatVersion: 2`，本函数就是幂等直通
//   （`isFormatV2` 为真 ⇒ 原样返回），到时可以整份删掉。合并后由负责人核：删不删都行。
//
// 升版映射（与 implementation-plan §2.1 一致）：
//   - 顶层 `dynasties`：`[{key,label,order}]` → **有序中文值数组**（按 order 升序取 label）；
//   - 每首 10 键：`id,title,author,dynasty,genre,source,orderInSource,detail,stanzas,notes`
//     （`dynasty` ← `dynastyLabel`；`era` 不再发布；`variants` 合成 `detail` 文本）。

/** 已经是 2（或更高）⇒ 直通。 */
export function isFormatV2(doc) {
  return Number(doc?.formatVersion) >= 2;
}

/** 把老产物里的 `variants` 合成一段最小 Markdown 详情文本（`### 异文` ＋ `- **字** —— 校记`）。
 *  形状对齐已核的样例 `items/content-format/prototypes/rules-v3/samples/real-01-full.md` 的 `## 详情` 节。
 *  没有异文 ⇒ `null`（不编内容）。 */
export function detailFromVariants(variants) {
  if (!Array.isArray(variants) || variants.length === 0) return null;
  const lines = ['### 异文', ''];
  for (const v of variants) {
    const text = typeof v?.text === 'string' ? v.text : '';
    const note = typeof v?.note === 'string' ? v.note : '';
    lines.push(note ? `- **${text}** —— ${note}` : `- **${text}**`);
  }
  return lines.join('\n');
}

/**
 * 幂等升版：`formatVersion >= 2` 原样返回；否则按上面的映射转成新形状。
 * @param {object} doc
 * @returns {object}
 */
export function upgradeToFormatV2(doc) {
  if (isFormatV2(doc)) return doc;
  const out = { ...doc, formatVersion: 2 };

  const oldDyn = Array.isArray(doc?.dynasties) ? doc.dynasties : [];
  const ordered = [...oldDyn].sort((a, b) => (a?.order ?? 0) - (b?.order ?? 0));
  out.dynasties = ordered.map((d) => d?.label ?? d?.key).filter((v) => typeof v === 'string' && v !== '');

  if (Array.isArray(doc?.poems)) {
    out.poems = doc.poems.map((p) => ({
      id: p?.id ?? null,
      title: p?.title ?? null,
      author: p?.author ?? '',
      dynasty: p?.dynasty ?? p?.dynastyLabel ?? null,
      genre: p?.genre ?? null,
      source: p?.source ?? null,
      orderInSource: p?.orderInSource ?? null,
      detail: p?.detail ?? detailFromVariants(p?.variants),
      stanzas: p?.stanzas ?? [],
      notes: p?.notes ?? null,
    }));
  }
  return out;
}

/** 升版并重新序列化（给「按文本流转」的地方用；JSON 不合法时返回 null，不吞错）。 */
export function upgradeTextToFormatV2(text) {
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    return null;
  }
  return `${JSON.stringify(upgradeToFormatV2(doc), null, 2)}\n`;
}
