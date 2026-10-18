// 「同 app 版本的内容刷新」（--same-app-content-refresh）的**性质**守卫。
//
// 这里钉的不是「某个脚本今天跑得通」，而是几条**不会自己坏掉**的接口性质：
//   ① 站点缓存名必须**同时**由 APP_VERSION 与 CONTENT_REVISION 组成（少了修订 ⇒ 同 app 版本重发内容
//      时 sw.js 字节不变 ⇒ 浏览器不装新 SW ⇒ 用户永远收不到这次内容更新，而且没有任何红）；
//   ② 前缀 `pc-resources-` 不许改（sw.js 的 activate 靠它认“自己的旧 cache”）；
//   ③ 仓库里的 CONTENT_REVISION 永远是 `dev`（发布值只存在于**产物**里，不回流仓库）；
//   ④ 同 app 版本模式里 **APK 五门不许被跳过**（能跳就等于“看起来有保障、其实没有”）；
//      只允许两条**前提被取代**的门（app-version-bumped / apk-versioncode-bumped）退出，
//      且它们的前提由更硬的正面断言接班；
//   ⑤ 旧基底（已发布那份字节）在**要求验**的模式下必须提供 —— 不许用“新 main ＋ 夹具”假冒旧版。
//
// ⚠ 这里不跑浏览器、不跑 Gradle：那两件事是 check-ready 的真跑门。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import * as A from '../release/lib/artifacts.mjs';
import {
  classifyWebChanges,
  checkSwCacheNameShape,
  compareAgainstBaselines,
  parseChangedPaths,
  pickPreviousReleaseBaseline,
  pickSameAppBaseline,
  readAppVersionConstant,
  readContentRevision,
  stampContentRevision,
  WEB_PRODUCT_CHANGE_ALLOWLIST,
  SHELL_STAMP_FILES,
} from '../release/lib/content-refresh.mjs';
import { CONTENT_REVISION, RESOURCE_CACHE_PREFIX, resourceCacheName } from '../web/app/config.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ---------------------------------------------------------------- 缓存名（复合键）

test('站点缓存名 = 前缀 + 应用版本 + `+` + 内容修订（缺一不可）', () => {
  assert.equal(resourceCacheName('0.1.3', '2026.10.16.26'), 'pc-resources-0.1.3+2026.10.16.26');
  assert.equal(RESOURCE_CACHE_PREFIX, A.WEB_CACHE_PREFIX, 'web/app/config.js 与流水线常量必须同一个前缀');
  assert.ok(resourceCacheName().startsWith(RESOURCE_CACHE_PREFIX), '默认参数也要带前缀');
  // 修订不同 ⇒ cache 名不同（这正是「同 app 版本重发内容」能被浏览器当成新版本的前提）
  assert.notEqual(resourceCacheName('0.1.3', '2026.10.16.26'), resourceCacheName('0.1.3', '2026.10.16.24'));
});

test('仓库里的 CONTENT_REVISION 必须是 dev（发布值只在产物里）', () => {
  assert.equal(CONTENT_REVISION, 'dev', '仓库里的修订被改成了发布值？发布构建是把**产物**盖章成 contentVersion，不是改仓库');
  assert.equal(readContentRevision(read('web/sw.js')), 'dev');
});

test('sw.js 的缓存名同时引用两个版本常量，且 activate 只删同前缀', () => {
  const sw = read('web/sw.js');
  const shape = checkSwCacheNameShape(sw);
  assert.ok(shape.ok, `缓存名形状不合格：${shape.detail}`);
  assert.match(sw, /names\.filter\(\(n\) => n\.startsWith\(CACHE_PREFIX\) && n !== CACHE_NAME\)/,
    'activate 必须只删**本前缀且非当前**的 cache（否则会删别人的数据或不删自己的旧数据）');
  assert.deepEqual([...SHELL_STAMP_FILES].sort(), ['app/config.js', 'sw.js'], '盖章的文件集就是这两个');
});

test('checkSwCacheNameShape 对“漏了修订”的形状必须报红', () => {
  const bad = 'const CACHE_PREFIX = \'pc-resources-\';\nconst CACHE_NAME = `${CACHE_PREFIX}${APP_VERSION}`;\n';
  const r = checkSwCacheNameShape(bad);
  assert.equal(r.ok, false);
  assert.match(r.detail, /CONTENT_REVISION=缺/);
});

// ---------------------------------------------------------------- 盖章

test('盖章：恰好一处常量 → 改写成功；改完不认得的形状立刻报错', () => {
  const src = "export const APP_VERSION = '0.1.3';\nexport const CONTENT_REVISION = 'dev';\n";
  const r = stampContentRevision(src, '2026.10.16.26', 'app/config.js');
  assert.equal(r.previous, 'dev');
  assert.equal(r.changed, true);
  assert.equal(readContentRevision(r.text), '2026.10.16.26');
  assert.equal(readAppVersionConstant(r.text), '0.1.3', '盖章不许顺手改 APP_VERSION');

  // 再盖同一个值：changed=false（幂等），不会把值叠成两个
  const again = stampContentRevision(r.text, '2026.10.16.26', 'app/config.js');
  assert.equal(again.changed, false);
  assert.equal(readContentRevision(again.text), '2026.10.16.26');

  // 没有常量 ⇒ 必须抛（0 处 = 常量被改名/删了，缓存名就不再随内容变）
  assert.throws(() => stampContentRevision("const APP_VERSION = '0.1.3';\n", '2026.10.16.26', 'x'),
    /REVISION_CONSTANT_NOT_FOUND|出现了 0 次/);
  // 两处 ⇒ 必须抛（不知道该改哪一个）
  assert.throws(() => stampContentRevision("const CONTENT_REVISION = 'dev';\nconst CONTENT_REVISION = 'dev';\n", '2026.10.16.26', 'x'),
    /出现了 2 次/);
  // 修订形状不合发布版本 ⇒ 必须抛
  assert.throws(() => stampContentRevision(src, 'dev', 'x'), /必须是发布版本/);
});

test('仓库源码里的 sw.js / config.js 都能被盖章（真文件上演练一次，不落盘）', () => {
  for (const rel of SHELL_STAMP_FILES) {
    const text = read(`web/${rel}`);
    const r = stampContentRevision(text, '2026.10.16.26', rel);
    assert.equal(r.previous, 'dev', `${rel} 的仓库副本应当是 dev`);
    assert.equal(readContentRevision(r.text), '2026.10.16.26');
  }
});

// ---------------------------------------------------------------- 同 app 版本基线

const TAGS = [
  'v0.1.0+content-2026.10.16.18',
  'v0.1.1+content-2026.10.16.20',
  'v0.1.3+content-2026.10.16.24',
  'v0.1.3+content-2026.10.16.26',
  'not-a-release-tag',
].join('\n');

test('同 app 版本基线：只认 v<同一 app 版本>+content-*，取内容版本最大者，且排除本次 tag', () => {
  const b = pickSameAppBaseline({ appVersion: '0.1.3', tagOutput: TAGS, currentTag: 'v0.1.3+content-2026.10.16.26' });
  assert.equal(b.tag, 'v0.1.3+content-2026.10.16.24', '本次是 .26，基线应当退回到 .24');
  assert.equal(b.contentVersion, '2026.10.16.24');
  assert.equal(b.all.length, 1);

  const b2 = pickSameAppBaseline({ appVersion: '0.1.3', tagOutput: TAGS, currentTag: null });
  assert.equal(b2.contentVersion, '2026.10.16.26', '不给本次 tag 时取最大值（CI 里本 tag 也在本地，所以必须过滤）');

  assert.equal(pickSameAppBaseline({ appVersion: '9.9.9', tagOutput: TAGS }), null, '没有同版本发布就是 null（不造基线）');
});

test('上一版发布基线（升版路径）：跨应用版本取 contentVersion 最大者，且排除本次 tag', () => {
  // 0.1.4 的旧基底就是 0.1.3 的 .26 —— 应用版本**不相等**，这正是同 app 版式挑不出来的那种。
  assert.equal(pickSameAppBaseline({ appVersion: '0.1.4', tagOutput: TAGS }), null,
    '前提：同 app 版式找 0.1.4 确实什么都没有（否则这个用例测不到东西）');
  const p = pickPreviousReleaseBaseline({ tagOutput: TAGS });
  assert.equal(p.tag, 'v0.1.3+content-2026.10.16.26', '应当取内容版本最大的发布 tag');
  assert.equal(p.appVersion, '0.1.3', '并且把 tag 里的应用版本一起带回来（回执要说清基底是哪个应用版本）');
  // CI 的 fetch-depth: 0 里，本次 tag 也在本地 ⇒ 必须能排除自己（否则“上一版”就是自己）。
  const withoutSelf = pickPreviousReleaseBaseline({
    tagOutput: `${TAGS}\nv0.1.4+content-2026.10.18.3`,
    excludeTag: 'v0.1.4+content-2026.10.18.3',
  });
  assert.equal(withoutSelf.tag, 'v0.1.3+content-2026.10.16.26');
  assert.equal(pickPreviousReleaseBaseline({ tagOutput: 'not-a-release-tag' }), null,
    '一个发布 tag 都没有时就是 null（不造基线）');
});

test('内容版本要**严格大于**线上真值与基线（两个都要比）', () => {
  const ok = compareAgainstBaselines({ contentVersion: '2026.10.16.26', liveContentVersion: '2026.10.16.24', baselineContentVersion: '2026.10.16.24' });
  assert.equal(ok.ok, true, ok.detail);

  const same = compareAgainstBaselines({ contentVersion: '2026.10.16.24', liveContentVersion: '2026.10.16.24', baselineContentVersion: '2026.10.16.24' });
  assert.equal(same.ok, false);
  assert.match(same.detail, /不大于\*\*线上真值\*\*/);

  const lower = compareAgainstBaselines({ contentVersion: '2026.10.16.23', liveContentVersion: '2026.10.16.24', baselineContentVersion: '2026.10.16.24' });
  assert.equal(lower.ok, false);
});

// ---------------------------------------------------------------- 改动范围分类

test('Web 改动分类：冻结文件即红，允许清单按条登记，其余既非冻结也非登记也算红', () => {
  const { frozen, allowlisted, unexpected } = classifyWebChanges([
    'web/styles.css',
    'web/sw.js',
    'web/app/main.js',
    'web/manifest.json',
  ]);
  assert.deepEqual(frozen, ['web/styles.css']);
  assert.deepEqual(allowlisted.sort(), ['web/app/main.js', 'web/sw.js']);
  assert.deepEqual(unexpected, ['web/manifest.json']);
});

test('允许清单每一条都写了理由（这是审查时要逐条看的表）', () => {
  assert.ok(WEB_PRODUCT_CHANGE_ALLOWLIST.length > 0);
  for (const e of WEB_PRODUCT_CHANGE_ALLOWLIST) {
    assert.match(e.path, /^web\//, `${e.path} 应当相对仓库根的 web/ 路径`);
    assert.ok(e.reason && e.reason.length > 20, `${e.path} 的允许理由太短，等于没写`);
  }
});

test('parseChangedPaths：去空行、统一斜杠', () => {
  assert.deepEqual(parseChangedPaths('a/b.txt\r\n\r\nc\\d.txt\n'), ['a/b.txt', 'c/d.txt']);
});

// ---------------------------------------------------------------- 模式开关的守卫（源码级）

test('同 app 版本模式下 **APK 五门不许被跳过**（只允许两条“前提被取代”的门退出）', () => {
  const src = read('release/check-ready.mjs');
  const m = /const SAME_APP_SKIP = \{([\s\S]*?)\n  \};/.exec(src);
  assert.ok(m, '找不到 SAME_APP_SKIP 定义');
  const ids = [...m[1].matchAll(/'([a-z0-9-]+)':/g)].map((x) => x[1]).sort();
  assert.deepEqual(ids, ['apk-versioncode-bumped', 'app-version-bumped'],
    `同 app 版本模式只允许这两条门退出；现在多/少了：${ids.join(', ')}`);
  for (const apkGate of ['apk-present', 'apk-builtin-same-source', 'apk-signing', 'apk-identity']) {
    assert.ok(!ids.includes(apkGate), `APK 门 ${apkGate} 被塞进了跳过表 —— 那等于“看起来有保障、其实没有”`);
  }
  // 跳过必须是**带条件的**：默认（升版）模式里这些门照旧跑
  assert.match(src, /if \(opts\.sameAppRefresh && SAME_APP_SKIP\[c\.id\]\)/,
    '跳过必须挂在 --same-app-content-refresh 上；无条件跳过会把默认模式的门关掉');
});

test('默认（正常升版）模式的守卫一字未改：仍要求 APP_VERSION 与 versionCode 递增', () => {
  const src = read('release/check-ready.mjs');
  assert.match(src, /check\('app-version-bumped'/, 'app-version-bumped 这道门被删了？');
  assert.match(src, /check\('apk-versioncode-bumped'/, 'apk-versioncode-bumped 这道门被删了？');
  // 两条门的失败文案还在（改了就该是一次显式改动）
  assert.match(src, /APP_VERSION 没递增/);
  assert.match(read('release/lib/content-refresh.mjs'), /不大于\*\*线上真值\*\*|不大于\*\*基线发布\*\*/);
});

test('same-app 模式要求真跑门的旧基底（不许用“新 main + 夹具”假冒旧版）', () => {
  const src = read('release/check-ready.mjs');
  assert.match(src, /requireBaseline: Boolean\(c\.sameAppRefresh\)/, 'live-web-e2e 在同 app 模式下必须要求旧基底');
  const live = read('release/lib/live.mjs');
  assert.match(live, /pickSameAppBaseline\(/, '旧基底 tag 必须从 git tag 里挑，不能写死');
  assert.match(live, /downloadLiveContentFile\(/, '旧内容必须是**线上已发布的那份字节**，不是仓库内置副本');
  assert.match(live, /SUOFEI_BASELINE_WEB_DIR/);
  const e2e = read('web/tests/e2e-cdp.mjs');
  assert.match(e2e, /SUOFEI_REQUIRE_BASELINE/, 'e2e 里要求验更新链时，缺旧基底必须报红而不是静默跳过');
  assert.match(e2e, /makeDeploymentFromDir/, '旧站点必须用**给定目录里的现成字节**部署（不改写版本号）');
});

test('构建：同 app 版本模式仍**照常出 APK**，且必须显式给最小可读码', () => {
  const src = read('release/build-release.mjs');
  assert.match(src, /--same-app-content-refresh/, '开关名必须与就绪检查一致');
  assert.match(src, /sameAppRefresh && opts\.minAppVersionCode === null/,
    '不给 --min-app-version-code 就应当失败（默认值＝本次 APK 的号，会白白拒掉能读内容的老设备）');
  // 最要紧的一条：本模式**不**把 skipApk 打开（曾经一度写成“不产 APK”，那是错的）
  assert.ok(!/sameAppRefresh[\s\S]{0,200}opts\.skipApk = true/.test(src), '同 app 版本模式不得把 APK 跳过');
  assert.match(src, /mode: opts\.sameAppRefresh \? SAME_APP_MODE : 'full'/, '清单必须记下模式，检查侧才能据此切门');
  assert.match(src, /stampWebShell\(/, '构建必须盖章内容修订');
});

test('只在同 app 模式成立的门单独成表，默认（升版）模式跳过它们', () => {
  const src = read('release/check-ready.mjs');
  const m = /const SAME_APP_ONLY_IDS = Object\.freeze\(\[([\s\S]*?)\]\);/.exec(src);
  assert.ok(m, '找不到 SAME_APP_ONLY_IDS —— 那些门若在默认模式里也跑，一次正常升版会被误判成红');
  const ids = [...m[1].matchAll(/'([a-z0-9-]+)'/g)].map((x) => x[1]);
  for (const id of [
    'same-app-baseline-tag',
    'same-app-app-version-unchanged',
    'same-app-version-code-unchanged',
    'same-app-android-source-identical',
    'same-app-web-source-scope',
    'same-app-content-delta',
    'same-app-content-bumped',
  ]) {
    assert.ok(ids.includes(id), `SAME_APP_ONLY_IDS 缺 ${id}`);
  }
  // APK 五门**不在**这张表里：它们在**两种模式**下都要真跑。
  for (const apkGate of ['apk-present', 'apk-builtin-same-source', 'apk-signing', 'apk-identity']) {
    assert.ok(!ids.includes(apkGate), `APK 门 ${apkGate} 被挪进“只在同 app 模式”的表 —— 升版发布就没人查它了`);
  }
  assert.match(src, /if \(!opts\.sameAppRefresh && SAME_APP_ONLY_IDS\.includes\(c\.id\)\) continue;/,
    '跳过必须挂在模式上，且只有这一处');
});
