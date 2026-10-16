// ⚠️⚠️ 演示用，不是编译器。⚠️⚠️
//
// 本脚本只回答一件事：**用户 2026-10-16 已定三条**之后的
//   「目录树（三种层级） → 相对路径 → ID（/→-） → `#/p/<id>` 与 `/detail`」链路、
//   **19 份变更清单能否自洽**、**全库判重（拼接碰撞）会不会响**、以及**编码/路由现状**。
//
// 已定三条（本脚本照它实现）：
//   ① ID ＝ 相对内容根（`content/poems/`）的**完整相对路径**，去 `.md`，**`/` 统一写成 `-`**。
//      例：`古诗十九首/行行重行行.md` ⇒ `古诗十九首-行行重行行`。
//   ② **直接换、不做兼容**：不做 `legacyId`、不做映射表、不做重定向；**接受旧 ASCII 链接失效**。
//   ③ **目录层级任意**（根直接文件／一层／多层都可）；**目录纯整理** —— 分组由 `dynasty`＋顶层有序朝代数组决定，组内次序由 `orderInSource` 决定。
//
// 硬边界（与 AGENTS.md 一致）：
//   - 它**只读**本目录（`name-tree-final/`、`manifest/`，以及复用 `name-tree-fixture-v2/` 的两个夹具），
//     **绝不**读 `content/`、**绝不**读 `tools/`／`web/`，**绝不写任何东西**（连日志文件都不写）。
//   - 它**不是** `tools/` 里的正式编译器；正式解析/校验/错误码仍以 `tools/` 与 `docs/design/content-contract.md` 为准。
//   - **仓库根不写死层级**：从脚本所在目录向上查找 `prototype/css/theme-tech.css`；找不到就抛错。
//
// ⚠️ 路由常量（`ROUTES`／`parseHashString`）**抄自** `web/app/config.js` 与 `web/app/main.js` 的**当前代码**
//    （本脚本**不读** `web/`）。它只是「现状长这样」的证据，**不是已采纳规格**。
//
// 用法：
//   node <本脚本>                        # 自检 + 自证；正常 EXIT=0
//   node <本脚本> --scan <本目录下的目录>   # 扫描一棵内容树，打印 ID 与冲突；有错误/碰撞 ⇒ **非零退出**
//
// 告警/错误分类：
//   symlink-in-content  内容树里出现符号链接（不跟随、也不静默跳过）
//   non-md-in-content   内容树里出现非 .md 文件
//   unreadable-dir      目录读不了
//   non-nfc-name        条目名不是 Unicode NFC
//   collision           拼接后的 ID 碰撞（NFC＋大小写折叠后相同）—— 必须报错并列出冲突路径

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TREE_DIR = path.join(HERE, 'name-tree-final');
const MANIFEST = path.join(HERE, 'manifest', '19-changes.json');
// 复用 v2 稿已提交的两个夹具（仍在本目录树内，脚本不越界）
const V2_TREES = path.join(HERE, 'name-tree-fixture-v2');
const COLLISION_FIXTURE = path.join(V2_TREES, 'dash-collision');
const BOUNDARY_FIXTURE = path.join(V2_TREES, 'boundaries');

// ── 仓库根：**不写死层级** ───────────────────────────────────────────────────────
const ROOT_MARKER = path.join('prototype', 'css', 'theme-tech.css');
function findRepoRoot(startDir) {
  let dir = path.resolve(startDir);
  for (;;) {
    if (fs.existsSync(path.join(dir, ROOT_MARKER))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`找不到仓库根：从 ${startDir} 一路上溯都没有 ${ROOT_MARKER}（本脚本不写死层级）`);
    dir = parent;
  }
}
const REPO_ROOT = findRepoRoot(HERE);
const rel = (p) => path.relative(REPO_ROOT, p).split(path.sep).join('/');

// ── 路由现状（**抄自** `web/app/config.js` / `web/app/main.js`，一字未改） ─────────────
const ROUTES = {
  poem: (id) => `#/p/${encodeURIComponent(id)}`,
  detail: (id) => `#/p/${encodeURIComponent(id)}/detail`,
  poemPattern: /^\/p\/([^/]+)$/,
  detailPattern: /^\/p\/([^/]+)\/detail$/,
  aboutPattern: /^\/about$/,
};
function parseHashString(hash) {
  const bare = String(hash).replace(/^#/, '');
  const d = ROUTES.detailPattern.exec(bare);
  if (d) return { kind: 'detail', id: decodeURIComponent(d[1]) };
  const p = ROUTES.poemPattern.exec(bare);
  if (p) return { kind: 'poem', id: decodeURIComponent(p[1]) };
  if (ROUTES.aboutPattern.test(bare)) return { kind: 'about', id: null };
  return { kind: 'index', id: null };
}

// ── ID 规则（用户已定 ①） ───────────────────────────────────────────────────────
/** ID ＝ 相对路径去 `.md`、`/`→`-`、NFC 归一化。 */
const idOf = (relPath) => relPath.replace(/\.md$/i, '').split('/').join('-').normalize('NFC');
/** 判重键：NFC ＋ 小写折叠（用户点名的判重口径）。 */
const dedupeKey = (id) => id.normalize('NFC').toLowerCase();

// ── 扫描（边界规则：保留七条 ＋ 新增两条） ───────────────────────────────────────
const isHidden = (n) => n.startsWith('.');
const isTemp = (n) => n.startsWith('~$') || n.endsWith('~');
const isNonContent = (n) => n.startsWith('_');
const isReadme = (n) => n.toLowerCase() === 'readme.md';
const isMd = (n) => n.toLowerCase().endsWith('.md');

function scanTree(rootDir) {
  const acc = { files: [], excluded: [], errors: [], emptyDirs: [] };
  const walk = (dir, rel0) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      acc.errors.push({ code: 'unreadable-dir', relPath: rel0 || '.', msg: e.message });
      return;
    }
    const subdirs = [];
    for (const e of entries) {
      const name = e.name;
      const childRel = rel0 ? `${rel0}/${name}` : name;
      if (name !== name.normalize('NFC')) {
        acc.errors.push({ code: 'non-nfc-name', relPath: childRel, msg: '条目名不是 Unicode NFC（如 NFD 的中文名）⇒ 归一化后可能与另一个名字相同，必须响' });
      }
      if (isHidden(name)) { acc.excluded.push({ relPath: childRel, reason: '隐藏文件/目录（点开头）' }); continue; }
      if (isTemp(name)) { acc.excluded.push({ relPath: childRel, reason: '临时文件（~$ 前缀或 ~ 后缀）' }); continue; }
      if (e.isSymbolicLink()) { acc.errors.push({ code: 'symlink-in-content', relPath: childRel, msg: '内容树里出现符号链接（不跟随；也不静默跳过）' }); continue; }
      if (isNonContent(name)) { acc.excluded.push({ relPath: childRel, reason: '下划线开头＝非内容约定' }); continue; }
      if (isReadme(name)) { acc.excluded.push({ relPath: childRel, reason: 'README/说明文件' }); continue; }
      if (e.isDirectory()) { subdirs.push({ name, relPath: childRel }); continue; }
      if (e.isFile()) {
        if (isMd(name)) acc.files.push({ name, relPath: childRel, id: idOf(childRel) });
        else acc.errors.push({ code: 'non-md-in-content', relPath: childRel, msg: `内容树里出现非 .md 文件「${name}」⇒ 报错（多半是笔误，忽略会静默丢内容）` });
        continue;
      }
      acc.errors.push({ code: 'unknown-entry-type', relPath: childRel, msg: `无法识别的条目类型` });
    }
    for (const d of subdirs) {
      const before = acc.files.length;
      walk(path.join(dir, d.name), d.relPath);
      if (acc.files.length === before) acc.emptyDirs.push(d.relPath);
    }
  };
  walk(rootDir, '');
  acc.files.sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0));
  return acc;
}

/** 全库判重：按 **NFC＋小写折叠后的拼接 ID** 比较；撞了就列出冲突路径。 */
function findCollisions(files) {
  const m = new Map();
  for (const f of files) {
    const k = dedupeKey(f.id);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(f);
  }
  return [...m.entries()].filter(([, g]) => g.length > 1).map(([, g]) => g);
}

// ── 自检 ────────────────────────────────────────────────────────────────────────
const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** 期望值（硬编码；真实 01/02/06 的诗名与三条期望 ID）。 */
const EXPECT = [
  { relPath: '涉江采芙蓉.md', id: '涉江采芙蓉', wantPoem: '#/p/%E6%B6%89%E6%B1%9F%E9%87%87%E8%8A%99%E8%93%89' },
  { relPath: '古诗十九首/行行重行行.md', id: '古诗十九首-行行重行行', wantPoem: '#/p/%E5%8F%A4%E8%AF%97%E5%8D%81%E4%B9%9D%E9%A6%96-%E8%A1%8C%E8%A1%8C%E9%87%8D%E8%A1%8C%E8%A1%8C' },
  { relPath: '古诗十九首/甲/青青河畔草.md', id: '古诗十九首-甲-青青河畔草', wantPoem: '#/p/%E5%8F%A4%E8%AF%97%E5%8D%81%E4%B9%9D%E9%A6%96-%E7%94%B2-%E9%9D%92%E9%9D%92%E6%B2%B3%E7%95%94%E8%8D%89' },
];

function selfProof() {
  // ① 三种层级的目录树
  const tree = scanTree(path.join(TREE_DIR, 'three-levels'));
  const byRel = new Map(tree.files.map((f) => [f.relPath, f]));
  const chain = EXPECT.map((e) => {
    const f = byRel.get(e.relPath);
    if (!f) return null;
    return {
      relPath: f.relPath,
      id: f.id,
      poem: ROUTES.poem(f.id),
      detail: ROUTES.detail(f.id),
      roundTripPoem: parseHashString(ROUTES.poem(f.id)),
      roundTripDetail: parseHashString(ROUTES.detail(f.id)),
    };
  });
  const chainOk =
    chain.every(Boolean) &&
    chain.every((c, i) => c.id === EXPECT[i].id && c.poem === EXPECT[i].wantPoem) &&
    chain.every((c) => c.roundTripPoem.kind === 'poem' && c.roundTripPoem.id === c.id) &&
    chain.every((c) => c.roundTripDetail.kind === 'detail' && c.roundTripDetail.id === c.id) &&
    tree.errors.length === 0;

  // ② 19 份变更清单自洽（复算 newId == 清单里的 newId）
  const man = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const recomputed = man.rows.map((r) => ({ ...r, computed: idOf(r.newRelPath) }));
  const manifestOk =
    man.rows.length === 19 &&
    recomputed.every((r) => r.computed === r.newId) &&
    new Set(recomputed.map((r) => dedupeKey(r.newId))).size === 19 &&
    new Set(recomputed.map((r) => r.oldId)).size === 19;

  // ③ 判重碰撞（拼接后的 - 撞上文件名里原有的 -）
  const collisionFixture = scanTree(COLLISION_FIXTURE);
  const colFixtureGroups = findCollisions(collisionFixture.files);
  const synthetic = ['古诗十九首/行行重行行.md', '古诗十九首-行行重行行.md'].map((relPath) => ({ relPath, id: idOf(relPath) }));
  const synthGroups = findCollisions(synthetic);
  const collisionOk = colFixtureGroups.length === 1 && synthGroups.length === 1 && collisionFixture.errors.length === 0;

  // ④ 边界：真实夹具 + 合成条目
  const boundary = scanTree(BOUNDARY_FIXTURE);
  const synthNfc = dedupeKey('豈行') === dedupeKey('\uF900行'); // U+8C48 与 U+F900 在 NFC 下同形
  const synthCase = dedupeKey('XingXing.md') === dedupeKey('xingxing.md');
  const boundaryOk =
    boundary.errors.length === 1 &&
    boundary.errors[0].code === 'non-md-in-content' &&
    boundary.excluded.length === 4 &&
    boundary.emptyDirs.length === 1 &&
    synthNfc &&
    synthCase;

  return {
    tree, chain, chainOk, man, recomputed, manifestOk,
    collisionFixture, colFixtureGroups, synthetic, synthGroups, collisionOk,
    boundary, synthNfc, synthCase, boundaryOk,
    ok: chainOk && manifestOk && collisionOk && boundaryOk,
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);

function printScan(rootDir) {
  const s = scanTree(rootDir);
  const groups = findCollisions(s.files);
  console.log(`# --scan ${rel(rootDir)}`);
  console.log('');
  console.log(`内容文件 ${s.files.length} 份（ID ＝ 相对路径去 .md、/→-、NFC）：`);
  for (const f of s.files) console.log(`  ${f.relPath}  ⇒  ${f.id}`);
  console.log(`\n判重（NFC＋小写折叠后的拼接 ID）：冲突 ${groups.length} 组`);
  for (const g of groups) {
    console.log(`  ⚠ 冲突：ID「${g[0].id}」由 ${g.length} 处算出：`);
    for (const f of g) console.log(`        ${f.relPath}`);
  }
  console.log(`\n排除（忽略并计数）${s.excluded.length} 项：`);
  for (const x of s.excluded) console.log(`  ${x.relPath}  [${x.reason}]`);
  console.log(`空目录/只剩被排除项的目录 ${s.emptyDirs.length} 个：${s.emptyDirs.join(', ') || '（无）'}`);
  console.log(`\n错误 ${s.errors.length} 条：`);
  for (const e of s.errors) console.log(`  - [${e.code}] ${e.relPath}: ${e.msg}`);
  if (s.errors.length > 0 || groups.length > 0) {
    console.log(`⇒ 有错误/碰撞（错误 ${s.errors.length} / 冲突 ${groups.length}）：进程非零退出（宁可响，不许静默）。`);
    process.exitCode = 1;
  } else {
    console.log('⇒ 0 错误、0 碰撞。');
  }
}

if (argv[0] === '--scan') {
  printScan(path.resolve(argv[1]));
} else if (argv[0] !== undefined) {
  console.error(`不认识的参数：${argv[0]}（用 --scan <dir>）`);
  process.exitCode = 2;
} else {
  const line = '='.repeat(104);
  console.log(line);
  console.log('id-final —— 演示脚本输出（**演示用，不是编译器**；路由常量抄自 web/app，不是已采纳规格）');
  console.log(line);
  console.log(`仓库根（从脚本目录向上查找 ${ROOT_MARKER} 得到）：${path.relative(process.cwd(), REPO_ROOT) || '.'}`);
  console.log('');

  const r = selfProof();

  console.log('① 完整样例目录树：三种层级（根直接／一层／多层）—— 映射链');
  console.log('-'.repeat(104));
  console.log('  相对路径 → ID（/→-）→ `#/p/<id>` → `…/detail`（真实 percent-encode 形态）');
  for (const c of r.chain) {
    console.log(`  ${c.relPath}`);
    console.log(`      ID     ${c.id}`);
    console.log(`      诗页   ${c.poem}`);
    console.log(`      详情   ${c.detail}`);
    console.log(`      往返   poem.kind=${c.roundTripPoem.kind}, id=${c.roundTripPoem.id} ／ detail.kind=${c.roundTripDetail.kind}, id=${c.roundTripDetail.id}`);
  }
  console.log('');
  console.log('  夹具目录树（`name-tree-final/three-levels/`）：');
  console.log('      涉江采芙蓉.md                      ← 根直接文件');
  console.log('      古诗十九首/行行重行行.md              ← 一层');
  console.log('      古诗十九首/甲/青青河畔草.md           ← 多层（`甲` 是任意占位目录名）');
  console.log('');

  console.log('② 变更清单自洽（manifest/19-changes.json：19 行，复算 newId == 清单 newId，且新旧 ID 各自唯一）');
  console.log('-'.repeat(104));
  console.log('  #  旧 ID（会失效）              新相对路径                        新 ID');
  for (let i = 0; i < r.recomputed.length; i++) {
    const x = r.recomputed[i];
    console.log(`  ${String(i + 1).padStart(2)}  ${x.oldId.padEnd(24)} ${x.newRelPath.padEnd(30)} ${x.newId}`);
  }
  console.log(`  19 行自洽：${r.manifestOk ? '是' : '否←失败'}`);
  console.log('');

  console.log('③ 全库判重：拼接后的 `-` 与文件名里原有的 `-` 碰撞 ⇒ 报错并列出冲突路径');
  console.log('-'.repeat(104));
  console.log('  真实夹具 name-tree-fixture-v2/dash-collision/（复用 v2 稿夹具）里的两份文件：');
  for (const f of r.collisionFixture.files) console.log(`      ${f.relPath}  ⇒  ID ${f.id}`);
  for (const g of r.colFixtureGroups) {
    console.log(`  ⚠ 冲突：ID「${g[0].id}」由 ${g.length} 处算出：${g.map((f) => f.relPath).join(' 与 ')}`);
  }
  console.log('  等价的最小例子（合成相对路径，不依赖夹具）：');
  for (const s of r.synthetic) console.log(`      ${s.relPath}  ⇒  ID ${s.id}`);
  console.log(`  碰撞组数：夹具 ${r.colFixtureGroups.length} / 合成 ${r.synthGroups.length}（都应为 1）⇒ ${r.collisionOk ? '响' : '不响←失败'}`);
  console.log('');

  console.log('④ 安全边界（保留七条 ＋ 新增两条；真实夹具 + 合成条目）');
  console.log('-'.repeat(104));
  console.log(`  name-tree-fixture-v2/boundaries/：错误 ${r.boundary.errors.length} 条（${r.boundary.errors.map((e) => e.code).join(', ')}），排除 ${r.boundary.excluded.length} 项，空目录 ${r.boundary.emptyDirs.length} 个`);
  for (const x of r.boundary.excluded) console.log(`        - 排除 ${x.relPath}  [${x.reason}]`);
  console.log(`  中文 Unicode 形（U+8C48 与 U+F900，NFC 后同形）：${r.synthNfc ? '当作重复' : '不响←失败'}`);
  console.log(`  大小写差异（NFC＋小写折叠后同名）：${r.synthCase ? '当作重复' : '不响←失败'}`);
  console.log(`  符号链接（合成条目，v2 稿已验同一条规则）：不跟随、遇到即报 symlink-in-content`);
  console.log('');

  console.log('⑤ 编码与路由现状（路由常量抄自 web/app/config.js、main.js）');
  console.log('-'.repeat(104));
  const c0 = r.chain[1];
  console.log(`  生成端 ROUTES.poem(id)   ⇒ ${c0.poem}`);
  console.log(`  parseHashString 解得      ⇒ kind=${c0.roundTripPoem.kind}, id=${c0.roundTripPoem.id}（往返解码正确）`);
  console.log(`  生成端 ROUTES.detail(id) ⇒ ${c0.detail}`);
  console.log(`  parseHashString 解得      ⇒ kind=${c0.roundTripDetail.kind}, id=${c0.roundTripDetail.id}`);
  console.log('  说明：ID 里**没有** `/`（已被替换成 `-`）⇒ 现有 poemPattern `/^\\/p\\/([^/]+)$/` 原样可用；');
  console.log('        中文由 encodeURIComponent 编码；手写、未编码 `/` 的链接才会静默落到目录（本方案不产生这种链接）。');
  console.log('');

  console.log(line);
  console.log(r.ok ? '全部自检通过。' : '存在失败项 ← 见上。');
  if (!r.ok) process.exitCode = 1;
  console.log('提醒：本演示只回答「链路／清单自洽／判重碰撞／编码路由现状」；ID 已按用户已定 C2 实现，');
  console.log('      目录层级、契约修改与两端改动**尚未实施**。');
  console.log(line);
}
