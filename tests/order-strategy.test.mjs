// 契约线 C：排序策略对比 fixture 的固化断言。
//
// 这个 fixture 用真实诗题 + 《文选》卷二十九原次序，为「组内是否保留底本原次序」这个
// 待用户拍板的问题留下可复跑的证据。这里把实测事实写成断言，避免以后悄悄变化。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildContentFromRecords } from '../tools/lib/content-build.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const POEMS_DIR = path.join(ROOT, 'tests', 'fixtures', 'ok-shi19-order', 'content', 'poems');

/** 《文选》卷二十九的十九首次序（fixture 的 orderInSource = 1..19） */
const WENXUAN_ORDER = [
  '行行重行行',
  '青青河畔草',
  '青青陵上柏',
  '今日良宴会',
  '西北有高楼',
  '涉江采芙蓉',
  '明月皎夜光',
  '冉冉孤生竹',
  '庭中有奇树',
  '迢迢牵牛星',
  '回车驾言迈',
  '东城高且长',
  '驱车上东门',
  '去者日以疏',
  '生年不满百',
  '凛凛岁云暮',
  '孟冬寒气至',
  '客从远方来',
  '明月何皎皎',
];

function build(strategy) {
  const records = fs
    .readdirSync(POEMS_DIR)
    .sort()
    .map((name) => ({
      displayPath: `content/poems/${name}`,
      base: name.slice(0, -3),
      text: fs.readFileSync(path.join(POEMS_DIR, name), 'utf8'),
    }));
  const { content, errors } = buildContentFromRecords({ records, explicitVersion: '2026.10.14.1', orderStrategy: strategy });
  assert.deepEqual(errors, []);
  return content;
}

test('fixture 自洽：19 首、同一组、orderInSource = 1..19', () => {
  const c = build('source');
  assert.equal(c.poems.length, 19);
  assert.equal(c.dynasties.length, 1);
  assert.equal(c.dynasties[0].label, '汉');
  assert.deepEqual(c.poems.map((p) => p.orderInSource), [...Array(19).keys()].map((i) => i + 1));
});

test('--order source：组内次序 = 底本原次序', () => {
  assert.deepEqual(build('source').poems.map((p) => p.title), WENXUAN_ORDER);
});

test('--order pinyin：19 首里换位 18 首，「行行重行行」掉到第 19 位', () => {
  const pinyin = build('pinyin').poems.map((p) => p.title);
  const moved = pinyin.filter((t, i) => t !== WENXUAN_ORDER[i]).length;
  assert.equal(moved, 18);
  assert.equal(pinyin.at(-1), '行行重行行');
  assert.equal(WENXUAN_ORDER.indexOf('行行重行行'), 0);
  // 只有「生年不满百」在两种策略下位置相同
  assert.deepEqual(
    pinyin.filter((t, i) => t === WENXUAN_ORDER[i]),
    ['生年不满百'],
  );
  // 两种策略都是同一批诗，没有多也没有少
  assert.deepEqual([...pinyin].sort(), [...WENXUAN_ORDER].sort());
});

test('两种策略下 authorSortKey/titleSortKey 都是拼音名次（差异只在原次序优先级）', () => {
  const s = build('source').poems;
  const p = build('pinyin').poems;
  const key = (poem) => `${poem.title}:${poem.authorSortKey}:${poem.titleSortKey}`;
  assert.deepEqual([...s].map(key).sort(), [...p].map(key).sort());
});
