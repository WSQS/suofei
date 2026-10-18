// **测试专用**的 formatVersion 3 内容：两个导出，都是夹具，都不是发布内容。
//
// 为什么需要这里：Web 壳只认 `SUPPORTED_FORMAT_VERSION = 3`（`app/config.js`），而本工作树里
// C 线（工程线 1）的编译产物**还是 v2**（`poems[].tags` / 顶层 `tags` 还没落）。因此：
//   ① `toV3TestDoc(v2产物)`：按**已定的 v3 字段集**从真实 v2 产物派生一份，
//      每首 `tags: []`、顶层 `tags: []` —— **不给任何真实诗编造标签**，并打上 `fixture: true`
//      （界面会显示黄条「测试夹具内容」，不会被误当发布内容）。
//      等 C 线真的编出 v3，e2e 会走 `formatVersion === 3` 那条路直接用它，本函数自然闲置。
//   ② `makeTagTabFixtureDoc()`：一份**纯测试**的小内容（诗题/标签名都是「测试…」，正文是占位），
//      专门用来验标签 tab 的**次序**与**零成员**：
//      - 顶层 `tags` 的数组顺序**刻意不是拼音序**；
//      - 某个标签的 `members` 顺序也**刻意不是拼音序**，也不是诗在 `poems` 里的先后；
//      - 带一个 `members: []` 的零成员标签（数据合法，但**不应渲染**）。
//      ⇒ 断言「页面顺序 == 产物数组顺序」才有牙齿（用 Intl.Collator 当独立 oracle 反证两者不同）。
//
// ⚠ 本文件只在 `web/scripts/prepare-dev-content.mjs`（本地演练）与 `web/tests/**` 里用；
//   **不进部署清单**（`tests/lib/deploy.mjs` 的 DEPLOY_FILES 只列产品文件，e2e 里有反向断言）。

/** v3 里每首诗必有的 `tags` 键（可为空数组）。 */
const emptyTags = () => [];

/**
 * 从一份 v2 产物派生出**明确标为夹具**的 v3 内容。
 * 只加 v3 的形状（`formatVersion` / `poems[].tags` / 顶层 `tags`）与夹具标记，**不动**任何诗的事实。
 * @param {object} baseDoc formatVersion 2 的真实产物
 */
export function toV3TestDoc(baseDoc) {
  const doc = structuredClone(baseDoc);
  doc.formatVersion = 3;
  doc.tags = [];
  for (const p of doc.poems) {
    if (!Array.isArray(p.tags)) p.tags = emptyTags();
  }
  doc.fixture = true;
  doc.fixtureNotice = '测试夹具内容：本工作树里 C 线编译产物还是 formatVersion 2（标签字段还没落），'
    + '这里按已定的 v3 形状派生一份（每首 tags: []、顶层 tags: []）用于跑 Web 的渲染与更新链。'
    + '**没有给任何真实诗编造标签**；不是发布内容。';
  return doc;
}

/** 一条测试诗目（11 键齐全；正文是占位文本，不是任何真实诗）。 */
function testPoem({ id, title, dynasty, orderInSource, tags }) {
  return {
    id,
    title,
    author: '测试作者',
    dynasty,
    genre: '测试夹具',
    source: '测试夹具（不是发布内容）',
    orderInSource,
    detail: null,
    stanzas: [[`${title}的测试正文第一行（夹具）。`, `${title}的测试正文第二行（夹具）。`]],
    notes: null,
    tags,
  };
}

/**
 * 标签 tab 的专用夹具（见文件头 ②）。
 *
 * 次序设计（**都刻意不是拼音序**）：
 *   顶层 tags 数组顺序：测试标签乙 → 测试标签丙 → 测试标签甲 ＋ 零成员「测试空标签甲」
 *   拼音升序实际是：  丙(bing) → 甲(jia) → 乙(yi)
 *   「测试标签乙」的 members 顺序：甲诗 → 丙诗 → 乙诗
 *   这三首诗的拼音升序实际是：丙(bing) → 甲(jia) → 乙(yi)；诗在 poems 数组里的先后是：乙→甲→丙
 *   「测试标签丙」的 members 顺序：乙诗 → 丙诗
 * ⇒ 客户端若自己按拼音（或按 poems 数组次序）重排，断言立刻红。
 */
export function makeTagTabFixtureDoc() {
  const poemYi = 'fixture-tag-poem-yi';
  const poemJia = 'fixture-tag-poem-jia';
  const poemBing = 'fixture-tag-poem-bing';
  const poemLoose = 'fixture-tag-poem-untagged';
  return {
    formatVersion: 3,
    // 形状照发布内容（YYYY.MM.DD.N），但年份放在未来 —— 一眼看出不是一次真发布。
    contentVersion: '2099.12.31.1',
    generatedAt: '2026-10-18T00:00:00Z',
    fixture: true,
    fixtureNotice: '测试夹具内容：诗题、作者、标签全部是夹具（「测试…」），用于验证标签 tab 的次序、'
      + '零成员标签不渲染、以及「详情 → 诗页 → 原视图」的返回链。不是发布内容。',
    dynasties: ['测试朝代甲', '测试朝代乙'],
    poems: [
      // orderInSource 刻意让「朝代 tab 的数组次序」＝1,2,3,4，便于另一条断言。
      testPoem({
        id: poemYi, title: '测试诗乙', dynasty: '测试朝代甲', orderInSource: 1,
        tags: [{ id: '测试标签乙', orderInTag: 3 }, { id: '测试标签丙', orderInTag: 1 }],
      }),
      testPoem({
        id: poemJia, title: '测试诗甲', dynasty: '测试朝代甲', orderInSource: 2,
        tags: [{ id: '测试标签乙', orderInTag: 1 }, { id: '测试标签甲', orderInTag: 1 }],
      }),
      testPoem({
        id: poemBing, title: '测试诗丙', dynasty: '测试朝代乙', orderInSource: 3,
        tags: [{ id: '测试标签乙', orderInTag: 2 }, { id: '测试标签丙', orderInTag: 2 }],
      }),
      // 无标签的诗：**照旧留在朝代页**（标签 tab 里当然没有它）。
      testPoem({ id: poemLoose, title: '测试诗丁', dynasty: '测试朝代甲', orderInSource: 4, tags: [] }),
    ],
    // 顺序＝渲染顺序（编译期按拼音排好的那份）；这里**故意不按拼音**，好让「不重排」被真断言。
    tags: [
      { id: '测试标签乙', members: [poemJia, poemBing, poemYi] },
      { id: '测试标签丙', members: [poemYi, poemBing] },
      { id: '测试标签甲', members: [poemJia] },
      { id: '测试空标签甲', members: [] },   // 零成员：数据合法，**不渲染**
    ],
  };
}

/** 夹具里那条「本库没有收录任何诗」的标签 id（断言它不出现时用）。 */
export const TAG_FIXTURE_EMPTY_TAG = '测试空标签甲';
