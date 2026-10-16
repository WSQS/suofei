// 从一份基座产物派生的测试变体。
//
// Web 端**不再有独立的内容版本通道**（用户 2026-10-14 拍板：Web 的内容更新就是站点更新），
// 所以变体只剩两类：
//   A) 内容形状变体：验证「次序判定 / 本机拼音兜底」（不换站点版本也能测）；
//   B) 站点部署变体：给「两版本切换」与「失败状态」测试用，每个部署带自己的 APP_VERSION，
//      由 tests/lib/deploy.mjs 组装（壳 + 内容一起换）。
//
// ⚠ 这里的形状是 **formatVersion 2**（顶层 `dynasties` ＝有序中文值数组；每首 10 键，
//    `dynasty` 单值、`detail` 是最小 Markdown 文本）。

/** 加进来的那首测试诗：自带笔记（含空行分段、`- ` 列表、`**粗体**` 与转义样本）；
 *  `dynasty` 由调用处覆盖为基座末首的朝代。 */
export const FIXTURE_POEM = {
  id: 'fixture-test-poem-01',
  title: '测试夹具诗（非诗文）',
  author: '测试作者',
  dynasty: '汉',
  genre: '测试夹具',
  source: '测试夹具（不是发布内容）',
  orderInSource: null,
  detail: '### 夹具详情\n\n这一行是**测试夹具详情**，不是真实考据。\n\n1. 夹具有序列表第一项\n2. 夹具有序列表第二项\n\n> 夹具引用块：不是任何真实校语。',
  stanzas: [
    ['第一段第一行（测试夹具）。', '第一段第二行（测试夹具）。'],
    ['空行之后的一段（测试夹具）。'],
    ['这是一句很长的测试夹具诗句，用来触发按句读的语义折行：甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥。'],
  ],
  notes: '【测试笔记·不是用户笔记】\n\n用于验证「笔记按需展开」的测试文本。\n\n- 第一点：列表与段落。\n- 第二点：换行保留。\n\n这里验证最小 Markdown 子集：**粗体**与普通文字混排。\n\n这里验证转义：<b>不应被当作标签</b>，应原样显示。',
};

/** 老形状（formatVersion 1）里去掉两个拼音名次键的副本：模拟 C 线改完后的最小产物形状。
 *  ⚠ 新形状（v2）已不再发布这两个键 ⇒ 本函数在 v2 基座上基本是直通，仅为兼容老基座保留。 */
function stripPinyinKeys(doc) {
  const out = structuredClone(doc);
  for (const p of out.poems) {
    delete p.authorSortKey;
    delete p.titleSortKey;
  }
  return out;
}

/** 逐组反转数组次序（确定性打乱）：用来证明「照数组次序」与「兜底排序」确实不同。 */
function reverseWithinGroups(doc) {
  const byD = new Map();
  for (const p of doc.poems) {
    if (!byD.has(p.dynasty)) byD.set(p.dynasty, []);
    byD.get(p.dynasty).push(p);
  }
  const reversed = [];
  for (const d of doc.dynasties) reversed.push(...[...(byD.get(d) ?? [])].reverse());
  doc.poems = reversed;
  return doc;
}

/** 最小产物形状：只有 orderInSource，没有拼音名次键（C 线改完后就是这样）。 */
export function makeMinimalDoc(base) {
  const doc = stripPinyinKeys(base);
  doc.fixture = true;
  doc.fixtureNotice = '测试夹具：C 线改完后的最小产物形状（只有 orderInSource、没有拼音名次键），'
    + '用于验证客户端仍照数组次序渲染。不是发布内容。';
  return doc;
}

/** 老产物形状：既没有 orderInSource 也没有拼音名次键（数组次序被反转，便于看出兜底）。 */
export function makeNoOrderIndexDoc(base) {
  const doc = stripPinyinKeys(base);
  doc.fixture = true;
  doc.fixtureNotice = '测试夹具：模拟老产物（既没有 orderInSource 也没有拼音名次键），'
    + '验证客户端退回本机拼音兜底排序。不是发布内容。';
  for (const p of doc.poems) delete p.orderInSource;
  return reverseWithinGroups(doc);
}

/**
 * 下一个站点部署要用的内容：删掉末首、加入一首带空行分段与测试笔记的诗。
 * contentVersion 只作展示（Web 不再用它做更新决策）。
 */
export function makeFixtureContent(base) {
  const doc = structuredClone(base);
  // contentVersion 只作展示（Web 不再用它做更新决策），但要**与基座不同**，
  // 否则「新内容生效」的断言会变得空洞；也不要刚好写成基座那个值。
  doc.contentVersion = base.contentVersion === '2026.10.15.1' ? '2026.10.15.2' : '2026.10.15.1';
  doc.generatedAt = '2026-10-15T00:00:00Z';
  doc.fixture = true;
  doc.fixtureNotice = '测试部署内容：从真实产物派生（删掉末首、加入一首带空行分段与测试笔记的诗），'
    + '用于验证两版本成对切换与渲染路径。不是发布内容。';
  const last = base.poems[base.poems.length - 1];
  doc.poems = doc.poems.slice(0, -1);
  doc.poems.push({
    ...structuredClone(FIXTURE_POEM),
    dynasty: last.dynasty,   // 分组沿用基座最后一首的朝代（值数组不变）
  });
  return doc;
}

/** 截断的非法 JSON（模拟下载不完整/产物损坏）。 */
export function makeBrokenText(base) {
  const full = `${JSON.stringify(base, null, 2)}\n`;
  return full.slice(0, Math.floor(full.length * 0.6));
}

/** 合法 JSON 但结构不合法（stanzas 空 + dynasty 未声明）→ 客户端必须给明确失败状态。 */
export function makeSchemaBrokenDoc(base) {
  const doc = structuredClone(base);
  doc.poems[0].stanzas = [[]];
  doc.poems[1].dynasty = 'nonexistent-group';
  return doc;
}

/** formatVersion 更高：内容与壳应当一起发布，所以这属于部署不一致 → 不解析并如实报错。 */
export function makeFutureFormatDoc(base) {
  const doc = structuredClone(base);
  doc.formatVersion = Number(base.formatVersion) + 1;
  return doc;
}

/**
 * 生成全部测试变体。
 * @param {object} base 基座产物（真实产物优先；应为 formatVersion 2）
 * @returns {Record<string, {name: string, kind: 'doc'|'text', doc?: object, text?: string, note: string}>}
 */
export function buildVariants(base) {
  const minimal = makeMinimalDoc(base);
  const noOrderIndex = makeNoOrderIndexDoc(base);
  const fixtureContent = makeFixtureContent(base);
  const schemaBroken = makeSchemaBrokenDoc(base);
  const futureFormat = makeFutureFormatDoc(base);
  return {
    minimal: {
      name: 'minimal',
      kind: 'doc',
      doc: minimal,
      text: `${JSON.stringify(minimal, null, 2)}\n`,
      note: '最小产物形状（只有 orderInSource，没有拼音名次键）→ 仍照数组次序',
    },
    noOrderIndex: {
      name: 'noOrderIndex',
      kind: 'doc',
      doc: noOrderIndex,
      text: `${JSON.stringify(noOrderIndex, null, 2)}\n`,
      note: '老产物形状（无 orderInSource、无拼音键，数组次序被反转）→ 本机拼音兜底',
    },
    fixtureContent: {
      name: 'fixtureContent',
      kind: 'doc',
      doc: fixtureContent,
      text: `${JSON.stringify(fixtureContent, null, 2)}\n`,
      note: `下一次部署用的内容（删末首 + 加带笔记/空行分段的测试诗）→ ${fixtureContent.poems.length} 首`,
    },
    broken: {
      name: 'broken',
      kind: 'text',
      text: makeBrokenText(base),
      note: '截断的非法 JSON → 客户端应显示「不是合法 JSON」的失败状态',
    },
    schemaBroken: {
      name: 'schemaBroken',
      kind: 'doc',
      doc: schemaBroken,
      text: `${JSON.stringify(schemaBroken, null, 2)}\n`,
      note: '合法 JSON 但结构不合法 → 客户端应显示「结构校验失败」的失败状态',
    },
    futureFormat: {
      name: 'futureFormat',
      kind: 'doc',
      doc: futureFormat,
      text: `${JSON.stringify(futureFormat, null, 2)}\n`,
      note: `formatVersion=${futureFormat.formatVersion} → 客户端应显示「格式版本不兼容」的失败状态`,
    },
  };
}
