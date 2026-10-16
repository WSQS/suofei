// ⚠️⚠️ 演示用，不是编译器。⚠️⚠️
//
// 本脚本只回答一件事：**用户 2026-10-16 新明确「文件夹与文件名都用中文、生成的 ID 带上文件夹名字来去重」**
// 之后，**中文目录/文件名 → ID → 路由** 这条链长什么样、四种 ID 写法各自在哪里冲突、以及**编码/路由**的现状。
//
// 硬边界（与 AGENTS.md 一致）：
//   - 它**只读**本目录（`name-tree-fixture-v2/`），**绝不**读 `content/`、**绝不**读 `tools/`／`web/`，
//     **绝不写任何东西**（连日志文件都不写）。
//   - 它**不是** `tools/` 里的正式编译器；正式解析/校验/错误码仍以 `tools/` 与 `docs/design/content-contract.md` 为准。
//   - 凡「未定／非法／会冲突」的构造一律**告警并计数**（宁可响，不许静默）。
//   - **仓库根不写死层级**：从脚本所在目录向上查找 `prototype/css/theme-tech.css`；找不到就抛错。
//
// ⚠️ 路由常量（`ROUTES`／`parseHashString`）是**抄自** `web/app/config.js` 与 `web/app/main.js` 的**当前代码**
//    （本脚本**不读** `web/`，所以只能抄）。**这不是已采纳规格**，只是「现状长这样」的证据；若它变了，本脚本要跟着改。
//
// 用法：
//   node <本脚本>                       # 自检 + 自证；正常 EXIT=0
//   node <本脚本> --scan <本目录下的目录>  # 扫描一棵内容树，打印四种 ID 写法与冲突；有错误 ⇒ **非零退出**
//
// 告警分类：
//   symlink-in-content  内容树里出现符号链接（不跟随、也不静默跳过）
//   non-md-in-content   内容树里出现非 .md 文件
//   unreadable-dir      目录读不了
//   non-nfc-name        条目名不是 Unicode NFC（中文文件名会被当不同名 ⇒ 必须响）
//   collision           某一种 ID 写法下，两首诗算出同一个 ID（**只在对应写法下报**）

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TREE_DIR = path.join(HERE, 'name-tree-fixture-v2');

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
  poemPattern: /^\/p\/([^/]+)$/, // ← 注释原文：id 里不含 `/`（否则会与详情页的 `/detail` 后缀相撞）
  detailPattern: /^\/p\/([^/]+)\/detail$/,
  aboutPattern: /^\/about$/,
};
/** 抄自 `web/app/main.js` `parseHashString`：匹配不上任何路由 ⇒ `kind:'index'`（**落到目录**）。 */
function parseHashString(hash) {
  const bare = String(hash).replace(/^#/, '');
  const d = ROUTES.detailPattern.exec(bare);
  if (d) return { kind: 'detail', id: decodeURIComponent(d[1]) };
  const p = ROUTES.poemPattern.exec(bare);
  if (p) return { kind: 'poem', id: decodeURIComponent(p[1]) };
  if (ROUTES.aboutPattern.test(bare)) return { kind: 'about', id: null };
  return { kind: 'index', id: null };
}

// ── 扫描（与 `demo.mjs` 同一套「本节建议」的边界规则 ＋ 两条新的） ────────────────────
const isHidden = (n) => n.startsWith('.');
const isTemp = (n) => n.startsWith('~$') || n.endsWith('~');
const isNonContent = (n) => n.startsWith('_');
const isReadme = (n) => n.toLowerCase() === 'readme.md';
const isMd = (n) => n.toLowerCase().endsWith('.md');
/** 判重用的键：**先 NFC 归一化、再小写折叠**（新增边界 ① 与 ② 都在这一步）。 */
const normKey = (s) => s.normalize('NFC').toLowerCase();

const direntKind = (e) => (e.isSymbolicLink() ? 'symlink' : e.isDirectory() ? 'dir' : e.isFile() ? 'file' : 'other');

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
      // 新增边界 ①：中文文件名必须先做 Unicode 归一化 —— 磁盘名不是 NFC 就响（否则 NFC/NFD 会被当两个名字）
      if (name !== name.normalize('NFC')) {
        acc.errors.push({ code: 'non-nfc-name', relPath: childRel, msg: `条目名不是 Unicode NFC（如 NFD 的中文名）⇒ 归一化后可能与另一个名字相同，必须响` });
      }
      if (isHidden(name)) { acc.excluded.push({ relPath: childRel, reason: '隐藏文件/目录（点开头）' }); continue; }
      if (isTemp(name)) { acc.excluded.push({ relPath: childRel, reason: '临时文件（~$ 前缀或 ~ 后缀）' }); continue; }
      const kind = direntKind(e);
      if (kind === 'symlink') { acc.errors.push({ code: 'symlink-in-content', relPath: childRel, msg: '内容树里出现符号链接（不跟随；也不静默跳过）' }); continue; }
      if (isNonContent(name)) { acc.excluded.push({ relPath: childRel, reason: '下划线开头＝非内容约定' }); continue; }
      if (isReadme(name)) { acc.excluded.push({ relPath: childRel, reason: 'README/说明文件' }); continue; }
      if (kind === 'dir') { subdirs.push({ name, relPath: childRel }); continue; }
      if (kind === 'file') {
        if (isMd(name)) acc.files.push({ name, relPath: childRel });
        else acc.errors.push({ code: 'non-md-in-content', relPath: childRel, msg: `内容树里出现非 .md 文件「${name}」⇒ 报错（多半是笔误，忽略会静默丢内容）` });
        continue;
      }
      acc.errors.push({ code: 'unknown-entry-type', relPath: childRel, msg: `无法识别的条目类型：${kind}` });
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

// ── 四种 ID 写法（**并列，不是推荐顺序**） ────────────────────────────────────────
/** 案 A（**旧**）ID ＝ basename 去 `.md`。 */
const idA = (f) => f.name.replace(/\.md$/i, '');
/** 案 C1 全根相对路径去 `.md`，**保留 `/`**。 */
const idC1 = (f) => f.relPath.replace(/\.md$/i, '');
/** 案 C2 全根相对路径去 `.md`，**`/` 换成 `-`**。 */
const idC2 = (f) => f.relPath.replace(/\.md$/i, '').split('/').join('-');
/** 案 D2 **只取紧邻父目录名 + basename**，`/` 换成 `-`。 */
const idD2 = (f) => {
  const p = f.relPath.split('/');
  const base = p[p.length - 1].replace(/\.md$/i, '');
  return p.length > 1 ? `${p[p.length - 2]}-${base}` : base;
};
const SCHEMES = [
  ['案 A（旧·basename）', idA, true],
  ['案 C1（全根相对路径，保留 /）', idC1, false],
  ['案 C2（全根相对路径，/→-）', idC2, true],
  ['案 D2（仅父目录+basename，/→-）', idD2, true],
];

/** 某写法下的冲突：规范化（NFC＋小写折叠）后同一 ID 出现 ≥2 次。 */
function collisions(files, idFn) {
  const m = new Map();
  for (const f of files) {
    const id = idFn(f);
    const k = normKey(id);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push({ id, relPath: f.relPath });
  }
  return [...m.entries()].filter(([, g]) => g.length > 1).map(([, g]) => g);
}

/** 全部写法一律**包含 `/`**（这个差别要显式说明，示范见 --scan 输出）。 */
const hasSlash = (id) => id.includes('/');

// ── 自检 ────────────────────────────────────────────────────────────────────────
const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** 真实 01/02/06 的中文诗名（硬编码字符串，不读 `content/`；《古诗十九首》里这三首的真实标题）。 */
const TITLES = ['行行重行行', '青青河畔草', '涉江采芙蓉'];

function idSelfProof() {
  const twoLevel = scanTree(path.join(TREE_DIR, 'cn-two-level'));
  const oneLevel = scanTree(path.join(TREE_DIR, 'cn-one-level'));
  const parentOnly = scanTree(path.join(TREE_DIR, 'parent-only-conflict'));
  const dash = scanTree(path.join(TREE_DIR, 'dash-collision'));
  const boundaries = scanTree(path.join(TREE_DIR, 'boundaries'));

  // ① 三例映射链（两层中文目录）——按**真实诗名**取，不依赖文件名字符排序
  const byName = new Map(twoLevel.files.map((f) => [f.name, f]));
  const missing = [];
  const chain = TITLES.map((t) => {
    const f = byName.get(`${t}.md`);
    if (!f) { missing.push(t); return null; }
    return {
      relPath: f.relPath,
      fileName: f.name,
      idC1: idC1(f),
      idC2: idC2(f),
      poemRoute: ROUTES.poem(idC2(f)),
      detailRoute: ROUTES.detail(idC2(f)),
    };
  });
  const sampleFile = byName.get(`${TITLES[0]}.md`);

  // ② 仅父目录 vs 全根相对路径
  const parentD2 = collisions(parentOnly.files, idD2);
  const parentC2 = collisions(parentOnly.files, idC2);
  const parentC1 = collisions(parentOnly.files, idC1);

  // ③ 分隔符 `-` 的代价：根下真的有一个同形的 dashed 文件名时，C2 冲突、C1 不冲突
  const dashC2 = collisions(dash.files, idC2);
  const dashC1 = collisions(dash.files, idC1);

  // ④ 路由自证（编码后的链接 / 手写含字面 `/` 的链接）
  const sampleId = idC2(sampleFile);
  const encoded = ROUTES.poem(sampleId);
  const encodedParsed = parseHashString(encoded);
  const rawSlashC2 = `#/p/${sampleId}`; // 手写（中文未编码、无 `/`）
  const rawSlashC1 = `#/p/${idC1(sampleFile)}`; // 手写保留 `/` 的写法
  const rawSlashC1Parsed = parseHashString(rawSlashC1);
  const detailEncoded = ROUTES.detail(sampleId);
  const detailEncodedParsed = parseHashString(detailEncoded);

  // ⑤ 边界：真实夹具 + 合成条目
  const synthSymlink = [ { name: '行行重行行.md', kind: 'symlink' } ];
  const synthCaseFold = [ { name: 'XingXing.md', kind: 'file' }, { name: 'xingxing.md', kind: 'file' } ];
  const synthNfc = [ { name: '豈行.md', kind: 'file' }, { name: '\uF900行.md', kind: 'file' } ]; // U+8C48 豈 / U+F900（NFC 后同形）

  const ok =
    missing.length === 0 &&
    chain.every(Boolean) &&
    deepEqual(chain.map((c) => c.relPath), TITLES.map((t) => `汉/古诗十九首/${t}.md`)) &&
    deepEqual(chain.map((c) => c.idC2), TITLES.map((t) => `汉-古诗十九首-${t}`)) &&
    deepEqual(chain.map((c) => c.poemRoute), TITLES.map((t) => `#/p/${encodeURIComponent(`汉-古诗十九首-${t}`)}`)) &&
    twoLevel.errors.length === 0 &&
    oneLevel.errors.length === 0 &&
    oneLevel.files.length === 3 &&
    parentD2.length === 1 && parentC2.length === 0 && parentC1.length === 0 &&
    dashC2.length === 1 && dashC1.length === 0 &&
    encodedParsed.kind === 'poem' && encodedParsed.id === sampleId &&
    detailEncodedParsed.kind === 'detail' && detailEncodedParsed.id === sampleId &&
    rawSlashC1Parsed.kind === 'index' && // ← 手写含字面 `/` ⇒ **静默落到目录**
    boundaries.errors.length === 1 && boundaries.errors[0].code === 'non-md-in-content' &&
    boundaries.excluded.length === 4 && boundaries.emptyDirs.length === 1 &&
    synthSymlink[0].kind === 'symlink' &&
    normKey(synthCaseFold[0].name) === normKey(synthCaseFold[1].name) &&
    normKey(synthNfc[0].name) === normKey(synthNfc[1].name);

  return {
    twoLevel, oneLevel, parentOnly, dash, boundaries,
    chain, parentD2, parentC2, parentC1, dashC2, dashC1,
    sampleId, encoded, encodedParsed, rawSlashC1, rawSlashC2, rawSlashC1Parsed, detailEncoded, detailEncodedParsed,
    synth: { symlink: synthSymlink[0].kind === 'symlink', caseFold: normKey(synthCaseFold[0].name) === normKey(synthCaseFold[1].name), nfc: normKey(synthNfc[0].name) === normKey(synthNfc[1].name) },
    ok,
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);

function printScan(rootDir) {
  const s = scanTree(rootDir);
  console.log(`# --scan ${rel(rootDir)}`);
  console.log('');
  for (const [label, fn, noSlash] of SCHEMES) {
    const cols = collisions(s.files, fn);
    const bad = noSlash && s.files.some((f) => hasSlash(fn(f)));
    console.log(`【${label}】内容文件 ${s.files.length} 份；冲突 ${cols.length} 组${bad ? '；← 含 `/`（与详情页 `/detail` 后缀相撞）' : ''}`);
    for (const f of s.files) console.log(`    ${f.relPath}  ⇒  ${fn(f)}`);
    for (const g of cols) console.log(`    ⚠ 冲突：ID「${g[0].id}」由 ${g.length} 处算出：${g.map((x) => x.relPath).join(' 与 ')}`);
  }
  console.log(`\n排除（忽略并计数）${s.excluded.length} 项：`);
  for (const x of s.excluded) console.log(`  ${x.relPath}  [${x.reason}]`);
  console.log(`空目录/只剩被排除项的目录 ${s.emptyDirs.length} 个：${s.emptyDirs.join(', ') || '（无）'}`);
  console.log(`\n错误 ${s.errors.length} 条：`);
  for (const e of s.errors) console.log(`  - [${e.code}] ${e.relPath}: ${e.msg}`);
  const c2cols = collisions(s.files, idC2).length;
  if (s.errors.length > 0 || c2cols > 0) {
    console.log(`⇒ 有错误（错误 ${s.errors.length} / 案C2 冲突 ${c2cols}）：进程非零退出（宁可响，不许静默）。`);
    process.exitCode = 1;
  } else {
    console.log('⇒ 0 错误、案C2 0 冲突。');
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
  console.log('id-and-naming-v2 —— 演示脚本输出（**演示用，不是编译器**；路由常量抄自 web/app，不是已采纳规格）');
  console.log(line);
  console.log(`仓库根（从脚本目录向上查找 ${ROOT_MARKER} 得到）：${path.relative(process.cwd(), REPO_ROOT) || '.'}`);
  console.log('');

  const r = idSelfProof();

  console.log('① 完整映射链（真实 01/02/06；两层中文目录）');
  console.log('-'.repeat(104));
  console.log('目录树 → 相对路径 → 案C2 ID → `#/p/<id>`');
  for (const c of r.chain) {
    console.log(`  ${c.relPath}`);
    console.log(`      → 案C2 ID＝${c.idC2}`);
    console.log(`      → 诗页  ${c.poemRoute}`);
    console.log(`      → 详情  ${c.detailRoute}`);
  }
  console.log('  说明：路由里的中文一定被 percent-encode（`encodeURIComponent`）；`/` 被编成 `%2F`。');
  console.log('');

  console.log('② 案 C2 的 ID 判定与冲突（四种写法并列）');
  console.log('-'.repeat(104));
  for (const [label, fn, noSlash] of SCHEMES) {
    const cols2 = collisions(r.twoLevel.files, fn);
    console.log(`  ${label.padEnd(30)} 冲突 ${cols2.length} 组，含 / ：${r.twoLevel.files.some((f) => hasSlash(fn(f))) ? '是' : '否'}${noSlash && r.twoLevel.files.some((f) => hasSlash(fn(f))) ? ' ← 与 `/detail` 后缀相撞' : ''}`);
  }
  console.log('');

  console.log('③ 「仅父目录 + basename」（案 D2）在什么时候仍然冲突 —— 具体例子');
  console.log('-'.repeat(104));
  console.log(`  夹具 parent-only-conflict/： 甲/汉/行行重行行.md  与  乙/汉/行行重行行.md`);
  for (const [label, fn] of [['案 D2（仅父目录）', idD2], ['案 C2（全根相对路径）', idC2], ['案 C1（全根相对路径保留 /）', idC1]]) {
    console.log(`    ${label.padEnd(26)} ⇒ ${r.parentOnly.files.map(fn).join('   |   ')}`);
  }
  console.log(`  案 D2 冲突 ${r.parentD2.length} 组${r.parentD2.length ? `（ID「${r.parentD2[0][0].id}」由 2 处算出）` : ''}；案 C2 冲突 ${r.parentC2.length} 组；案 C1 冲突 ${r.parentC1.length} 组。`);
  console.log('  ⇒ 只要**两棵不同子树下有同名父目录**（或需要靠更上一层才能区分），仅父目录就会撞；全根相对路径不会。');
  console.log('');

  console.log('④ 分隔符 `/`→`-` 的代价（具体例子）');
  console.log('-'.repeat(104));
  console.log(`  夹具 dash-collision/： 汉/古诗十九首/行行重行行.md  与  汉-古诗十九首-行行重行行.md（根下真有一个同形名）`);
  console.log(`    案 C2（/→-）冲突 ${r.dashC2.length} 组${r.dashC2.length ? `（ID「${r.dashC2[0][0].id}」）` : ''}；案 C1（保留 /）冲突 ${r.dashC1.length} 组。`);
  console.log('  ⇒ 「换成 -」会丢掉层级信息、可能撞上文件名里本来就有的 -；所以换完之后**必须再查一次唯一性**。');
  console.log('');

  console.log('⑤ 中文编码与路由解析的现状（路由常量抄自 web/app/config.js、main.js）');
  console.log('-'.repeat(104));
  console.log(`  生成端（ROUTES.poem）：${r.encoded}`);
  console.log(`    ⇒ parseHashString 得到：kind=${r.encodedParsed.kind}, id=${r.encodedParsed.id}（往返解码正确）`);
  console.log(`  生成端（ROUTES.detail）：${r.detailEncoded}`);
  console.log(`    ⇒ parseHashString 得到：kind=${r.detailEncodedParsed.kind}, id=${r.detailEncodedParsed.id}`);
  console.log(`  手写链接（案C1，含**字面斜杠**）：${r.rawSlashC1}`);
  console.log(`    ⇒ parseHashString 得到：kind=${r.rawSlashC1Parsed.kind}${r.rawSlashC1Parsed.kind === 'index' ? '（**静默落到目录**，不是 404、也不是「找不到这首诗」）' : ''}`);
  console.log(`  手写链接（案C2，无斜杠）：${r.rawSlashC2}`);
  console.log(`    ⇒ 它没有斜杠，所以只要中文被（浏览器或作者）编码，正则会命中；这一步**未实测**（属浏览器行为）。`);
  console.log('');

  console.log('⑥ 安全边界（保留七条 ＋ 新增两条）');
  console.log('-'.repeat(104));
  console.log(`  boundaries/ 真实夹具：错误 ${r.boundaries.errors.length} 条（${r.boundaries.errors.map((e) => e.code).join(', ')}），排除 ${r.boundaries.excluded.length} 项，空目录 ${r.boundaries.emptyDirs.length} 个`);
  for (const x of r.boundaries.excluded) console.log(`        - 排除 ${x.relPath}  [${x.reason}]`);
  for (const d of r.boundaries.emptyDirs) console.log(`        - 空目录（忽略并计数）${d}`);
  console.log(`  符号链接（合成条目）：${r.synth.symlink ? '响 symlink-in-content' : '不响←失败'}`);
  console.log(`  大小写差异（合成条目，NFC+小写折叠后同名）：${r.synth.caseFold ? '当作重复' : '不响←失败'}`);
  console.log(`  中文 Unicode 形差异（合成条目：U+8C48 与 U+F900，NFC 后同形）：${r.synth.nfc ? '当作重复' : '不响←失败'}`);
  console.log('');

  console.log('⑦ 旧 ASCII ID 会变（19 首**全部**变；这里只举 3 例）');
  console.log('-'.repeat(104));
  for (let i = 0; i < 3; i++) {
    const oldId = `gushi-shijiu-shou-0${[1, 2, 6][i]}`;
    console.log(`  ${TITLES[i].padEnd(8)} 旧 ID＝${oldId.padEnd(22)} → 新 ID＝${r.chain[i].idC2}`);
    console.log(`        旧链接 #/p/${oldId}  →  ${parseHashString(`#/p/${oldId}`).kind === 'poem' ? '仍能解析成诗页（但产物里已没有这个 ID ⇒ 客户端会显示「找不到这首诗」）' : '（非诗页）'}`);
  }
  console.log('');

  console.log(line);
  console.log(r.ok ? '全部自检通过。' : '存在失败项 ← 见上。');
  if (!r.ok) process.exitCode = 1;
  console.log('提醒：本演示只回答「链路/冲突/编码/路由」；ID 写法（C1/C2/D2）、分隔符、边界处置都还**等用户拍板**。');
  console.log(line);
}
