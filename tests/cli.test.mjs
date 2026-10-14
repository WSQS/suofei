// 契约线 C：CLI 端到端测试（真实进程、真实退出码、真实产物）。
//
// 契约第 3 节 5 条校验失败用例各自对应一个 fixture 目录，这里逐条跑 CLI：
// 断言非零退出码、稳定的错误码出现在 stderr、且**没有**写出任何产物。
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';

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

// ---------- 契约第 3 节：5 条失败用例（+ 本轮新增的 4 条强化校验） ----------

const FAILURE_CASES = [
  { dir: 'fail-id-mismatch', codes: ['ID_FILENAME_MISMATCH'], rule: '§3.1 id 与文件名不一致' },
  { dir: 'fail-id-duplicate', codes: ['ID_FILENAME_MISMATCH', 'ID_DUPLICATE'], rule: '§3.1 id 重复' },
  { dir: 'fail-missing-key', codes: ['MISSING_REQUIRED_KEY'], rule: '§3.2 缺必填键' },
  { dir: 'fail-dynasty-order-not-integer', codes: ['DYN_ORDER_NOT_INTEGER'], rule: '§3.2 dynastyOrder 非整数' },
  { dir: 'fail-empty-body', codes: ['BODY_EMPTY'], rule: '§3.3 正文为空' },
  { dir: 'fail-unknown-dynasty', codes: ['DYNASTY_UNDECLARED'], rule: '§3.4 dynastyKey 未声明' },
  { dir: 'fail-stanzas-all-empty', codes: ['STANZAS_ALL_EMPTY'], rule: '§3.5 stanzas 全空' },
  { dir: 'fail-unknown-key', codes: ['UNKNOWN_KEY'], rule: '附加：未声明的 front matter 键' },
  { dir: 'fail-variant-invalid', codes: ['VARIANT_INVALID'], rule: '附加：variants 写法不合法' },
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

test('失败不覆盖上一版产物（失败保旧版）', () => {
  const out = tmpOut('keep-old');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, '{"contentVersion":"上一版哨兵值"}\n', 'utf8');
  const r = runCli(['--content', contentDir('fail-empty-body'), '--out', out]);
  assert.equal(r.status, 1);
  assert.equal(fs.readFileSync(out, 'utf8'), '{"contentVersion":"上一版哨兵值"}\n');
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

  assert.deepEqual(c.dynasties, [
    { key: 'han', label: '汉', order: 100 },
    { key: 'tang', label: '唐', order: 400 },
  ]);
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

  const named = c.poems.filter((p) => p.author !== '佚名');
  const unknown = c.poems.filter((p) => p.author === '佚名');
  assert.ok(Math.min(...unknown.map((p) => p.authorSortKey)) > Math.max(...named.map((p) => p.authorSortKey)));

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
  assert.equal(c.formatVersion, 1);
});

test('ok-notes-variants：notes 块标量保留换行，variants 的 note 可省略', () => {
  const { status, stderr, out } = buildFixture('ok-notes-variants', ['--content-version', '2026.10.14.2']);
  assert.equal(status, 0, stderr);
  const p = JSON.parse(fs.readFileSync(out, 'utf8')).poems[0];
  assert.match(p.notes, /不是用户真实笔记。\n第二行：/);
  assert.deepEqual(p.variants, [
    { text: '测试异文甲', note: '来自 fixture 的异文说明' },
    { text: '测试异文乙', note: null },
  ]);
  assert.equal(p.era, null);
  assert.equal(p.genre, null);
});

// ---------- JSON Schema 校验产物 ----------

function validateAgainstSchema(file) {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8')));
  const ok = validate(JSON.parse(fs.readFileSync(file, 'utf8')));
  return { ok, errors: validate.errors ?? [] };
}

for (const [name, version] of [
  ['ok-sorting', '2026.10.14.1'],
  ['ok-notes-variants', '2026.10.14.2'],
  ['ok-basic', '2026.10.14.3'],
]) {
  test(`JSON Schema 校验产物（${name}）`, () => {
    const { status, stderr, out } = buildFixture(name, ['--content-version', version]);
    assert.equal(status, 0, stderr);
    const { ok, errors } = validateAgainstSchema(out);
    assert.ok(ok, `schema 校验失败：${JSON.stringify(errors)}`);
  });
}

test('独立校验工具可复跑：node tools/validate-content.mjs <产物>', () => {
  const { status, out } = buildFixture('ok-sorting', ['--content-version', '2026.10.14.4']);
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
  const a = buildFixture('ok-order-source', ['--content-version', '2026.10.14.5', '--order', 'source']);
  const b = buildFixture('ok-order-source', ['--content-version', '2026.10.14.5']); // 默认应与 source 一致
  assert.equal(a.status, 0, a.stderr);
  assert.equal(b.status, 0, b.stderr);
  const titlesA = JSON.parse(fs.readFileSync(a.out, 'utf8')).poems.map((p) => p.title);
  const titlesB = JSON.parse(fs.readFileSync(b.out, 'utf8')).poems.map((p) => p.title);
  assert.deepEqual(titlesA, ['行行重行行', '青青河畔草', '涉江采芙蓉', '生年不满百', '客从远方来', '饮马长城窟行']);
  assert.deepEqual(titlesB, titlesA, '不传 --order 时应等于暂定默认值 source');
});

test('ok-order-source：--order pinyin 忽略 orderInSource', () => {
  const r = buildFixture('ok-order-source', ['--content-version', '2026.10.14.5', '--order', 'pinyin']);
  assert.equal(r.status, 0, r.stderr);
  const titles = JSON.parse(fs.readFileSync(r.out, 'utf8')).poems.map((p) => p.title);
  assert.deepEqual(titles, ['饮马长城窟行', '客从远方来', '青青河畔草', '涉江采芙蓉', '生年不满百', '行行重行行']);
});

test('ok-order-source 产物通过 JSON Schema（orderInSource 为整数或 null）', () => {
  const { status, stderr, out } = buildFixture('ok-order-source', [
    '--content-version',
    '2026.10.14.6',
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

test('--json 输出机器可读结果', () => {
  const r = runCli(['--check', '--json', '--content', contentDir('ok-basic')]);
  assert.equal(r.status, 0);
  const j = JSON.parse(r.stdout);
  assert.equal(j.ok, true);
  assert.equal(j.poems, 1);
  assert.equal(j.checkedOnly, true);
});

test('内容目录不存在 → CONTENT_DIR_MISSING（退出码 1）', () => {
  const r = runCli(['--check', '--content', path.join(tmpRoot, '并没有这个目录')]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /\[CONTENT_DIR_MISSING\]/);
});
