// 从一份基座产物派生「内容更新」测试变体。
//
// 为什么不再把变体 JSON 提交进版本库：变体必须跟**真实产物**长在一起才有效。
//   node tools/build-content.mjs --out dist/content.json --content-version 2026.10.14.1 --order source
//   node web/scripts/prepare-dev-content.mjs --variant update
// 这样「更新流程」验的是真实 19 首上的删/改/增，而不是手抄的一份 8 首。
//
// 变体（相对基座）：
//   update  正常新版：删掉首尾各 1 首、改 1 行、加 1 首测试诗（带笔记 + 空行分段，落在新的时代分组）
//   update2 再下一版：把 update 里那首测试诗去掉 → 那个新的时代分组随之消失（验证「整组可删」）
//   lower   内容同 update，但版本比基座更旧 → 必须拒绝（不降级）
//   corrupt 内容合法、版本更高，但 sha256 边车故意不匹配 → 必须拒绝（校验闸）
//   broken  截断的非法 JSON → 必须拒绝（解析闸）
//   future  formatVersion = 支持版本 + 1、版本更高 → 必须不解析、保留旧内容

/** 版本形状：发布版 `YYYY.MM.DD.N`（契约 §4.1）。 */
const RELEASE_RE = /^(\d{4})\.(\d{1,2})\.(\d{1,2})\.(\d+)$/;

/** 比基座更大的版本；基座不是发布版形状时用必然更新的 release 版本。 */
export function bumpVersion(version, step = 1) {
  const m = RELEASE_RE.exec(String(version ?? ''));
  if (!m) return `2999.1.1.${step}`;
  return `${m[1]}.${m[2]}.${m[3]}.${Number(m[4]) + step}`;
}

/** 比基座更小的版本（release 形状合法、且与基座不可比大小的情况下也一定更小）。 */
export function lowerVersion(version) {
  const m = RELEASE_RE.exec(String(version ?? ''));
  if (m && Number(m[1]) > 2020) return '2020.1.1.1';
  return '0.0.0-dev+000000000000';
}

/** 只留实际有内容的组，按 order 升序（与编译期同一规则）。 */
function collectDynasties(poems) {
  const m = new Map();
  for (const p of poems) {
    if (!m.has(p.dynastyKey)) {
      m.set(p.dynastyKey, { key: p.dynastyKey, label: p.dynastyLabel, order: p.dynastyOrder });
    }
  }
  return [...m.values()].sort((a, b) => a.order - b.order);
}

/** 加进来的那首测试诗：自带笔记、空行分段与转义样本，且落在新的时代分组里。 */
export const FIXTURE_POEM = {
  id: 'fixture-test-poem-01',
  title: '测试夹具诗（非诗文）',
  author: '测试作者',
  dynastyKey: 'tang',
  dynastyLabel: '唐',
  dynastyOrder: 400,
  era: '测试夹具',
  genre: '测试夹具',
  source: '测试夹具（不是发布内容）',
  orderInSource: null,
  variants: [],
  stanzas: [
    ['第一段第一行（测试夹具）。', '第一段第二行（测试夹具）。'],
    ['空行之后的一段（测试夹具）。'],
  ],
  notes: '【测试笔记·不是用户笔记】\n\n用于验证「笔记按需展开」的测试文本。\n\n- 第一点：列表与段落。\n- 第二点：换行保留。\n\n这里验证最小 Markdown 子集：**粗体**与普通文字混排。\n\n这里验证转义：<b>不应被当作标签</b>，应原样显示。',
  authorSortKey: 0,
  titleSortKey: 0,
};

/** update 变体：删首尾各一首、改一行、加一首测试诗。 */
function makeUpdateDoc(base, { withAddedPoem = true } = {}) {
  const doc = structuredClone(base);
  doc.contentVersion = bumpVersion(base.contentVersion, withAddedPoem ? 1 : 2);
  doc.generatedAt = '2026-10-14T12:00:00Z';
  // 夹具标记：页面上必须显示出来，不能让人误当发布内容
  doc.fixture = true;
  doc.fixtureNotice = '测试夹具：由 e2e 从真实产物派生（删掉首尾各 1 首、改 1 行'
    + (withAddedPoem ? '、加 1 首测试诗并新增 1 个时代分组' : '')
    + (withAddedPoem ? '' : '、去掉那首测试诗与其时代分组')
    + '），不是发布内容。';

  const original = doc.poems;
  const dropped = [original[0].id, original[original.length - 1].id];
  doc.poems = original.slice(1, -1);
  const modified = doc.poems[0];
  modified.stanzas[0][0] = `${modified.stanzas[0][0]}（测试夹具·新版改了这一行）`;
  if (withAddedPoem) doc.poems.push(structuredClone(FIXTURE_POEM));
  doc.dynasties = collectDynasties(doc.poems);

  return {
    doc,
    expect: {
      dropped,
      modifiedPoemId: modified.id,
      modifiedFirstLine: modified.stanzas[0][0],
      addedPoemId: withAddedPoem ? FIXTURE_POEM.id : null,
      poemCount: doc.poems.length,
      dynastyKeys: doc.dynasties.map((d) => d.key),
    },
  };
}

/**
 * 生成全部变体。
 * @param {object} base 基座产物（真实产物优先）
 * @returns {Record<string, {name: string, text: string, checksum: 'correct'|'wrong', expect: object, note: string}>}
 */
export function buildVariants(base) {
  const update = makeUpdateDoc(base, { withAddedPoem: true });
  const update2 = makeUpdateDoc(base, { withAddedPoem: false });
  const lowerDoc = structuredClone(update.doc);
  lowerDoc.contentVersion = lowerVersion(base.contentVersion);
  const corruptDoc = structuredClone(update.doc);
  corruptDoc.contentVersion = bumpVersion(base.contentVersion, 3);
  const futureDoc = structuredClone(update.doc);
  futureDoc.formatVersion = Number(base.formatVersion) + 1;
  futureDoc.contentVersion = bumpVersion(base.contentVersion, 4);

  const updateText = `${JSON.stringify(update.doc, null, 2)}\n`;
  return {
    update: {
      name: 'update',
      text: updateText,
      checksum: 'correct',
      expect: update.expect,
      note: `正常新版，版本 ${update.doc.contentVersion}`,
    },
    update2: {
      name: 'update2',
      text: `${JSON.stringify(update2.doc, null, 2)}\n`,
      checksum: 'correct',
      expect: update2.expect,
      note: `再下一版（去掉测试诗与其分组），版本 ${update2.doc.contentVersion}`,
    },
    lower: {
      name: 'lower',
      text: `${JSON.stringify(lowerDoc, null, 2)}\n`,
      checksum: 'correct',
      expect: update.expect,
      note: `内容同 update，但版本更旧（${lowerDoc.contentVersion}）→ 必须拒绝`,
    },
    corrupt: {
      name: 'corrupt',
      text: `${JSON.stringify(corruptDoc, null, 2)}\n`,
      checksum: 'wrong',
      expect: update.expect,
      note: `内容合法、版本更高（${corruptDoc.contentVersion}），边车哈希故意不匹配 → 必须拒绝`,
    },
    broken: {
      name: 'broken',
      text: updateText.slice(0, Math.floor(updateText.length * 0.6)),
      checksum: 'correct',
      expect: update.expect,
      note: '截断的非法 JSON → 必须拒绝',
    },
    future: {
      name: 'future',
      text: `${JSON.stringify(futureDoc, null, 2)}\n`,
      checksum: 'correct',
      expect: update.expect,
      note: `formatVersion=${futureDoc.formatVersion}、版本 ${futureDoc.contentVersion} → 不解析、保留旧内容`,
    },
  };
}
