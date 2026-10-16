// 契约线 C：CLI 端到端测试（真实进程、真实退出码、真实产物）。
//
// 每条校验失败用例各自对应一个 fixture 目录，这里逐条跑 CLI：断言非零退出码、稳定的错误码出现在
// stderr、且**没有**写出任何产物。formatVersion=2 起源格式变了（id 不写、单一中文 dynasty、
// 考据进 `## 详情`、笔记进 `## 笔记`），所以夹具也一并搬到了 v2 源格式。
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import { POEM_KEYS } from '../tools/lib/interface.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const CLI = path.join(ROOT, 'tools', 'build-content.mjs');
const VALIDATOR = path.join(ROOT, 'tools', 'validate-content.mjs');
const SCHEMA_PATH = path.join(ROOT, 'schema', 'content.schema.json');
const fixtures = path.join(ROOT, 'tests', 'fixtures');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-content-test-'));
test.after(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));

// 每次构建用独立产物路径：避免读到上一用例留下的产物而触发单调性检查。
let outSeq = 0;
function tmpOut(name) {
  outSeq += 1;
  return path.join(tmpRoot, `${outSeq}-${name}`, 'content.json');
}

function runCli(args) {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', cwd: ROOT });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function contentDir(name) {
  return path.join(fixtures, name, 'content');
}

function buildFixture(name, extraArgs = []) {
  const out = tmpOut(name);
  const r = runCli(['--content', contentDir(name), '--out', out, ...extraArgs]);
  return { ...r, out };
}

// ---------- 失败用例（每条一个稳定错误码） ----------

const FAILURE_CASES = [
  { dir: 'fail-missing-key', codes: ['MISSING_REQUIRED_KEY'], rule: '必填键缺失（source）' },
  { dir: 'fail-unknown-key', codes: ['UNKNOWN_KEY'], rule: '未声明的 front matter 键' },
  { dir: 'fail-unknown-dynasty', codes: ['DYNASTY_UNDECLARED'], rule: '朝代组名未声明' },
  { dir: 'fail-empty-body', codes: ['BODY_EMPTY'], rule: '正文区没有非空行' },
  { dir: 'fail-order-not-integer', codes: ['ORDER_IN_SOURCE_NOT_INTEGER'], rule: 'orderInSource 非整数' },
  { dir: 'fail-non-markdown', codes: ['SOURCE_NOT_MARKDOWN'], rule: '内容根里有非 .md 文件' },
  { dir: 'dash-collision', codes: ['ID_DUPLICATE'], rule: '相对路径派生出的 id 撞车' },
];

for (const c of FAILURE_CASES) {
  test(`失败用例 ${c.dir}（${c.rule}）`, () => {
    const { status, stderr, out } = buildFixture(c.dir);
    assert.equal(status, 1, `应非零退出；stderr=${stderr}`);
    for (const code of c.codes) {
      assert.ok(stderr.includes(`[${code}]`), `stderr 应包含 [${code}]；实际：${stderr}`);
    }
    assert.ok(stderr.includes('未产出任何内容文件'), '应明确说明没有产物');
    assert.equal(fs.existsSync(out), false, '失败不得写出产物');
  });
}

test('判重夹具必红：冲突路径逐条列出（两个不同路径算出同一个 id）', () => {
  const { status, stderr } = buildFixture('dash-collision');
  assert.equal(status, 1);
  assert.match(stderr, /\[ID_DUPLICATE\]/);
  assert.ok(stderr.includes('古诗十九首/行行重行行.md'), '要列出第一个冲突路径');
  assert.ok(stderr.includes('古诗十九首-行行重行行.md'), '要列出第二个冲突路径');
});

test('符号链接 ⇒ SOURCE_SYMLINK（旧实现会静默丢弃，这是刻意改成报错）', (t) => {
  const dir = fs.mkdtempSync(path.join(tmpRoot, 'symlink-'));
  const poems = path.join(dir, 'content', 'poems');
  fs.mkdirSync(poems, { recursive: true });
  fs.writeFileSync(
    path.join(poems, 'ok-01.md'),
    '---\ntitle: "夹具"\nauthor: "佚名"\ndynasty: "汉"\nsource: "夹具。"\n---\n\n正文行。\n',
    'utf8',
  );
  const target = path.join(dir, 'target');
  fs.mkdirSync(target);
  try {
    fs.symlinkSync(target, path.join(poems, 'link'), 'junction'); // Windows 上 junction 不需要管理员
  } catch (e) {
    t.skip(`本机建不了符号链接（${e.code}）`);
    return;
  }
  const r = runCli(['--check', '--content', path.join(dir, 'content')]);
  assert.equal(r.status, 1, r.stderr);
  assert.ok(r.stderr.includes('[SOURCE_SYMLINK]'), r.stderr);
});

test('失败不覆盖上一版产物（失败保旧版）', () => {
  const out = tmpOut('keep-old');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, '{"contentVersion":"上一版哨兵值"}\n', 'utf8');
  const r = runCli(['--content', contentDir('fail-empty-body'), '--out', out]);
  assert.equal(r.status, 1);
  assert.equal(fs.readFileSync(out, 'utf8'), '{"contentVersion":"上一版哨兵值"}\n');
});

// ---------- 排除规则：忽略并计数 ----------

test('README / `_` 前缀 / 隐藏文件 / 临时文件 ⇒ 忽略并计数，不是错误', () => {
  const r = runCli(['--check', '--content', contentDir('ignored-files')]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /1 首诗 \/ 1 个分组/, '被忽略的文件不得进产物');
  assert.match(r.stdout, /忽略并计数了 4 项/);
  assert.match(r.stdout, /README 1/);
  assert.match(r.stdout, /_ 前缀（说明\/占位） 1/);
  assert.match(r.stdout, /隐藏文件\/目录 1/);
  assert.match(r.stdout, /临时文件 1/);
});

test('空目录 ⇒ 忽略并计数（在临时目录里建，因为 git 存不住空目录）', () => {
  const dir = fs.mkdtempSync(path.join(tmpRoot, 'emptydir-'));
  const poems = path.join(dir, 'content', 'poems');
  fs.mkdirSync(path.join(poems, '空目录'), { recursive: true });
  fs.writeFileSync(
    path.join(poems, 'ok-01.md'),
    '---\ntitle: "夹具"\nauthor: "佚名"\ndynasty: "汉"\nsource: "夹具。"\n---\n\n正文行。\n',
    'utf8',
  );
  const r = runCli(['--check', '--content', path.join(dir, 'content')]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /空目录 1/);
});

// ---------- 成功路径 + 排序 + 分段 ----------

test('ok-basic：--check 通过且不写产物', () => {
  const out = tmpOut('ok-basic-check');
  const r = runCli(['--check', '--content', contentDir('ok-basic'), '--out', out]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /内容校验通过：1 首诗 \/ 1 个分组/);
  assert.equal(fs.existsSync(out), false);
});

test('ok-sorting：组序、组内作者/诗名拼音序、佚名最后、分段保留', () => {
  const { status, stderr, out } = buildFixture('ok-sorting', ['--content-version', '2026.10.14.1']);
  assert.equal(status, 0, stderr);
  const c = JSON.parse(fs.readFileSync(out, 'utf8'));

  assert.deepEqual(c.dynasties, ['汉', '唐'], '顶层 dynasties 是有序中文值数组');
  assert.deepEqual(
    c.poems.map((p) => p.id),
    [
      'cao-yong-yin-ma-chang-cheng-ku-xing-01', // 汉：蔡邕（具名）
      'gushi-shijiu-shou-02', // 汉：佚名，青青河畔草(qing)
      'gushi-shijiu-shou-01', // 汉：佚名，行行重行行(xing)
      'du-fu-chun-wang-01', // 唐：杜甫(du)
      'li-bai-jing-ye-si-01', // 唐：李白(li)，静夜思(jing)
      'li-bai-zao-fa-bai-di-cheng-01', // 唐：李白，早发白帝城(zao)
      'tang-yi-ming-shan-ge-01', // 唐：佚名，最后
    ],
  );

  // 「佚名排最后」：每个组内，佚名都排在所有具名作者之后（次序语义，不靠排序字段）
  for (const label of c.dynasties) {
    const authors = c.poems.filter((p) => p.dynasty === label).map((p) => p.author);
    const firstUnknown = authors.findIndex((a) => a === '佚名');
    assert.ok(firstUnknown > 0, `${label} 组内应有具名作者在佚名之前`);
    assert.equal(
      authors.slice(firstUnknown).every((a) => a === '佚名'),
      true,
      `${label} 组内佚名必须全部排在最后；实际：${authors.join(',')}`,
    );
  }

  // 2026-10-14 用户拍板：拼音名次只在编译期内部用，**不发布**
  const raw = fs.readFileSync(out, 'utf8');
  assert.equal(raw.includes('SortKey'), false, '产物里不得出现 SortKey 字段');
  for (const p of c.poems) {
    assert.equal('authorSortKey' in p, false);
    assert.equal('titleSortKey' in p, false);
    assert.deepEqual(Object.keys(p), [...POEM_KEYS]);
  }

  // 分段：段内多行、空行边界，连续空行折叠
  const s02 = c.poems.find((p) => p.id === 'gushi-shijiu-shou-02');
  assert.deepEqual(s02.stanzas, [
    ['青青河畔草，郁郁园中柳。', '盈盈楼上女，皎皎当窗牖。'],
    ['娥娥红粉妆，纤纤出素手。', '昔为倡家女，今为荡子妇。'],
    ['荡子行不归，空床难独守。'],
  ]);
  assert.equal(c.poems.find((p) => p.id === 'gushi-shijiu-shou-01').stanzas.length, 2);
  assert.equal(c.poems.find((p) => p.id === 'cao-yong-yin-ma-chang-cheng-ku-xing-01').stanzas.length, 1);
  assert.equal(c.contentVersion, '2026.10.14.1');
  assert.equal(c.formatVersion, 2);
});

test('ok-notes-variants：`## 笔记` 进 notes（保留换行）、`## 详情` 进 detail、缺省键写 null', () => {
  const { status, stderr, out } = buildFixture('ok-notes-variants', ['--content-version', '2026.10.14.2']);
  assert.equal(status, 0, stderr);
  const p = JSON.parse(fs.readFileSync(out, 'utf8')).poems[0];
  assert.equal(p.notes, '这是**测试用**个人笔记文本，不是用户真实笔记。\n第二行：用于验证块标量里的换行被保留。');
  assert.equal(p.detail, '- **测试异文甲** —— 来自 fixture 的异文说明\n- **测试异文乙**');
  assert.equal(p.genre, null);
  assert.equal(p.orderInSource, null);
  assert.ok('detail' in p && 'notes' in p);
});

// ---------- JSON Schema 校验产物 ----------

function validateAgainstSchema(file) {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8')));
  const ok = validate(JSON.parse(fs.readFileSync(file, 'utf8')));
  return { ok, errors: validate.errors ?? [] };
}

for (const [name, version] of [
  ['ok-sorting', '2026.10.14.10'],
  ['ok-notes-variants', '2026.10.14.11'],
  ['ok-basic', '2026.10.14.12'],
  ['ok-order-source', '2026.10.14.13'],
  ['shape-v2', '2026.10.14.14'],
  ['rules-v4-legal/nested', '2026.10.14.15'],
]) {
  test(`JSON Schema 校验产物（${name}）`, () => {
    const { status, stderr, out } = buildFixture(name, ['--content-version', version]);
    assert.equal(status, 0, stderr);
    const { ok, errors } = validateAgainstSchema(out);
    assert.ok(ok, `schema 校验失败：${JSON.stringify(errors)}`);
  });
}

test('独立校验工具可复跑：node tools/validate-content.mjs <产物>', () => {
  const { status, out } = buildFixture('ok-sorting', ['--content-version', '2026.10.14.16']);
  assert.equal(status, 0);
  const r = spawnSync(process.execPath, [VALIDATOR, out], { encoding: 'utf8', cwd: ROOT });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /JSON Schema 校验通过/);
});

test('SOURCE_DATE_EPOCH 可固定 generatedAt，同一内容字节可复现', () => {
  const outA = tmpOut('repro-a');
  const outB = tmpOut('repro-b');
  const env = { ...process.env, SOURCE_DATE_EPOCH: '1800000000' };
  const run = (out) =>
    spawnSync(process.execPath, [CLI, '--content', contentDir('ok-basic'), '--out', out], {
      encoding: 'utf8',
      cwd: ROOT,
      env,
    });
  const a = run(outA);
  const b = run(outB);
  assert.equal(a.status, 0, a.stderr);
  assert.equal(b.status, 0, b.stderr);
  const textA = fs.readFileSync(outA, 'utf8');
  assert.equal(textA, fs.readFileSync(outB, 'utf8'), '同内容 + 固定时间应字节相同');
  assert.equal(
    JSON.parse(textA).generatedAt,
    new Date(1800000000 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
  );
});

// ---------- 排序策略：source / pinyin（同一 fixture，两份实际产物对比） ----------

test('ok-order-source：--order source（默认）按底本原次序，无值者接在后面', () => {
  const a = buildFixture('ok-order-source', ['--content-version', '2026.10.14.17', '--order', 'source']);
  const b = buildFixture('ok-order-source', ['--content-version', '2026.10.14.17']); // 默认应与 source 一致
  assert.equal(a.status, 0, a.stderr);
  assert.equal(b.status, 0, b.stderr);
  const titlesA = JSON.parse(fs.readFileSync(a.out, 'utf8')).poems.map((p) => p.title);
  const titlesB = JSON.parse(fs.readFileSync(b.out, 'utf8')).poems.map((p) => p.title);
  assert.deepEqual(titlesA, ['行行重行行', '青青河畔草', '涉江采芙蓉', '生年不满百', '客从远方来', '饮马长城窟行']);
  assert.deepEqual(titlesB, titlesA, '不传 --order 时应等于暂定默认值 source');
});

test('ok-order-source：--order pinyin 忽略 orderInSource', () => {
  const r = buildFixture('ok-order-source', ['--content-version', '2026.10.14.18', '--order', 'pinyin']);
  assert.equal(r.status, 0, r.stderr);
  const titles = JSON.parse(fs.readFileSync(r.out, 'utf8')).poems.map((p) => p.title);
  assert.deepEqual(titles, ['饮马长城窟行', '客从远方来', '青青河畔草', '涉江采芙蓉', '生年不满百', '行行重行行']);
});

test('ok-order-source 产物：orderInSource 为整数或 null', () => {
  const { status, stderr, out } = buildFixture('ok-order-source', [
    '--content-version',
    '2026.10.14.19',
    '--order',
    'source',
  ]);
  assert.equal(status, 0, stderr);
  const { ok, errors } = validateAgainstSchema(out);
  assert.ok(ok, `schema 校验失败：${JSON.stringify(errors)}`);
  const poems = JSON.parse(fs.readFileSync(out, 'utf8')).poems;
  assert.equal(poems.find((p) => p.title === '饮马长城窟行').orderInSource, null);
  assert.equal(poems.find((p) => p.title === '客从远方来').orderInSource, 18);
});

test('--order 取值非法 → 用法错误（退出码 2），不猜、不静默回退', () => {
  const r = runCli(['--check', '--content', contentDir('ok-order-source'), '--order', 'guess']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--order 只支持 source \/ pinyin/);
});

test('所有 ok fixture 的产物都不含任何排序字段，键序恒为 POEM_KEYS', () => {
  for (const [i, name] of ['ok-basic', 'ok-sorting', 'ok-notes-variants', 'ok-order-source', 'ok-shi19-order'].entries()) {
    const { status, stderr, out } = buildFixture(name, ['--content-version', `2026.10.1${i}.1`]);
    assert.equal(status, 0, `${name}: ${stderr}`);
    const raw = fs.readFileSync(out, 'utf8');
    assert.equal(raw.includes('SortKey'), false, `${name} 产物里出现了 SortKey 字段`);
    const doc = JSON.parse(raw);
    for (const p of doc.poems) {
      assert.deepEqual(Object.keys(p), [...POEM_KEYS], `${name}/${p.id} 键序应等于 POEM_KEYS`);
    }
  }
});

// ---------- 版本行为 ----------

test('版本单调：显式版本不大于上一版时失败', () => {
  const r = runCli([
    '--check',
    '--content',
    contentDir('ok-basic'),
    '--content-version',
    '2026.10.14.1',
    '--previous-version',
    '2026.10.14.1',
  ]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /\[VERSION_NOT_MONOTONIC\]/);
});

test('dev 版本：同一内容重复编译得到同一 contentVersion', () => {
  const a = buildFixture('ok-basic');
  const b = buildFixture('ok-basic');
  assert.equal(a.status, 0, a.stderr);
  const va = JSON.parse(fs.readFileSync(a.out, 'utf8')).contentVersion;
  const vb = JSON.parse(fs.readFileSync(b.out, 'utf8')).contentVersion;
  assert.match(va, /^0\.0\.0-dev\+[0-9a-f]{12}$/);
  assert.equal(va, vb);
});

test('用法错误退出码 2，未知选项不静默忽略', () => {
  const r = runCli(['--nope']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /未知选项：--nope/);
});

test('--json 输出机器可读结果（含忽略计数）', () => {
  const r = runCli(['--check', '--json', '--content', contentDir('ignored-files')]);
  assert.equal(r.status, 0);
  const j = JSON.parse(r.stdout);
  assert.equal(j.ok, true);
  assert.equal(j.poems, 1);
  assert.equal(j.checkedOnly, true);
  assert.equal(j.ignoredFiles, 4);
  assert.equal(j.formatVersion, 2);
});

test('内容目录不存在 → CONTENT_DIR_MISSING（退出码 1）', () => {
  const r = runCli(['--check', '--content', path.join(tmpRoot, '并没有这个目录')]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /\[CONTENT_DIR_MISSING\]/);
});
