#!/usr/bin/env node
/**
 * 一致性门：**仓库里的「内置内容」必须与当前 `content/poems/` 编译出来的产物一致。**
 *
 * 为什么需要它（真实教训，2026-10-14）：
 *   内容线 G 补核后异文从 13 条涨到 21 条，但仓库里 `android/app/src/main/assets/content/content.json`
 *   与 `web/content.json` **没人重新生成**，还停在旧版。结果是：
 *   - Android 的单测跑的是**旧产物**，全绿 ⇒ 看着一切正常；
 *   - 而发布线把**新产物**注入副本后跑同一套单测 ⇒ 断言变红。**红的是旧断言 + 旧内置产物**，不是流水线。
 *   也就是说：这道门当时**不存在**，所以「仓库里的内置内容落后于内容源」这件事没有任何地方会报警。
 *
 * 它做什么：编译一次**真实内容**（`content/poems/`，不给 `--content`，**故意不换夹具**——这一门的
 * 监视对象就是真实内容），再与各处内置产物逐字段比对。忽略每次构建都会变的 `generatedAt`/
 * `contentVersion`，但**分组声明、每首诗（含次序、详情文本、正文分段）全部参与**。
 *
 * ⚠ **诚实边界（2026-10-16 补）——「查了」与「没查」必须分开说：**
 *   - 编译失败 ⇒ 直接失败（这一门此刻**没查**，不是通过）；本仓在 S3 迁移完成前就是这个状态
 *     （`content/poems/` 还是 formatVersion=1 的源，新编译器编不过）；
 *   - 目标文件缺失：`android/.../assets/content/content.json` 是**必需**的（缺 ⇒ 红）；
 *     `web/content.json` 是 gitignore 的本地产物（缺 ⇒ 记为**没查**并打印出来，**不算通过**）；
 *   - 目标不是合法 JSON、或 `formatVersion` 与当前产物不是同一代 ⇒ 红（后者是「内置产物没跟着升版」
 *     最典型的样子，单独一条消息点出来，而不是让它混在字段 diff 里）；
 *   - 结尾摘要**只对「已查」的那些**说「一致」，另起一行列出**未查**项。
 *   - ⚠ 这一门**不在 `npm test` 里**（`npm test` = `node --test` 只跑 `tests/*.test.mjs`）；
 *     纯逻辑部分由 `tests/check-bundled.test.mjs` 钉住，但它不编译真实内容。
 *
 * 用法：
 *   node tools/check-bundled-content.mjs
 * 退出码：0 = 已查的目标都一致（可能附带「未查」项）；1 = 有差异 / 有必需目标缺失 / 什么都查不到。
 *
 * 修法（脚本会在失败时提示）：
 *   node tools/build-content.mjs --out dist/content.json --content-version <新版本> --previous-version <旧版本> --order source --minify
 *   cp dist/content.json android/app/src/main/assets/content/content.json
 *   node web/scripts/prepare-dev-content.mjs --from dist/content.json      # web/content.json 是本地产物（gitignore）
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** 参与比对的「内容本身」：分组声明 + 每首诗（含次序、详情、正文分段）。版本/时间戳不参与。 */
export function shapeOf(doc) {
  return JSON.stringify({ dynasties: doc.dynasties, poems: doc.poems });
}

/** 「这首诗有没有详情」——给失败消息一个一眼能看懂的量。 */
export function detailCount(doc) {
  return doc.poems.filter((p) => p.detail !== null && p.detail !== undefined).length;
}

/**
 * 纯逻辑：按 FS 给出的事实（`missing` / `text`）判断每一处目标，返回三类结果。
 * 把这一层做成纯函数，是为了让「没查 ≠ 通过」这条口径可以被测试钉住（不依赖编译真实内容）。
 *
 * @param {any} current 当前编译产物
 * @param {{label: string, path: string, required: boolean, missing: boolean, text: string|null}[]} entries
 * @returns {{problems: string[], notChecked: string[], checked: string[], checkedPaths: string[]}}
 */
export function evaluateTargets(current, entries) {
  /** @type {string[]} */
  const problems = [];
  /** @type {string[]} */
  const notChecked = [];
  /** @type {string[]} */
  const checked = [];
  /** @type {string[]} */
  const checkedPaths = [];

  for (const e of entries) {
    if (e.missing) {
      if (e.required) {
        problems.push(`${e.label}：文件不存在（${e.path}）——它是仓库里**必需**的内置产物，缺了就是这一门没查成`);
      } else {
        notChecked.push(`${e.label}（${e.path}）`);
      }
      continue;
    }
    let got;
    try {
      got = JSON.parse(/** @type {string} */ (e.text));
    } catch (err) {
      problems.push(`${e.label}（${e.path}）不是合法 JSON，读不出内置产物：${err.message}`);
      continue;
    }
    if (got.formatVersion !== current.formatVersion) {
      problems.push(
        `${e.label}（${e.path}）的 formatVersion=${got.formatVersion} 与当前编译产物 ${current.formatVersion} 不是同一代` +
          ` ⇒ 它必然落后（内置产物没跟着升版）。`,
      );
      continue;
    }
    if (shapeOf(got) !== shapeOf(current)) {
      problems.push(
        `${e.label}（${e.path}）与当前内容不一致：\n` +
          `    内置：contentVersion=${got.contentVersion} 诗=${got.poems.length} 带详情=${detailCount(got)}\n` +
          `    当前：contentVersion=${current.contentVersion} 诗=${current.poems.length} 带详情=${detailCount(current)}`,
      );
      continue;
    }
    checked.push(e.label);
    checkedPaths.push(e.path);
  }
  return { problems, notChecked, checked, checkedPaths };
}

const FIX_HINT = [
  '修法：重编产物 → 覆盖内置 → 重生成 Web 本地内容：',
  '  node tools/build-content.mjs --out dist/content.json --content-version <新版本> --previous-version <旧版本> --order source --minify',
  '  cp dist/content.json android/app/src/main/assets/content/content.json',
  '  node web/scripts/prepare-dev-content.mjs --from dist/content.json',
];

/**
 * 纯逻辑：由三类结果得出退出码与要打印的话。
 * **关键口径**：「有差异」「什么都查不到」都是红；只有「确实查到了一些且它们都一致」才是绿。
 * 未查项（可选目标缺失）**另起一行**列出，绝不被拂进「一致性通过」那句话里。
 *
 * @param {{problems: string[], notChecked: string[], checked: string[]}} result
 * @param {any} current
 * @returns {{exitCode: number, kind: 'problems'|'nothing-checked'|'ok', lines: string[]}}
 */
export function verdictOf(result, current) {
  const { problems, notChecked, checked } = result;
  if (problems.length) {
    return {
      exitCode: 1,
      kind: 'problems',
      lines: [
        '内置内容与内容源不一致（仓库里的内置产物落后了，本地/单测会跑旧内容）：',
        ...problems.map((p) => '  ✗ ' + p),
        '',
        ...FIX_HINT,
      ],
    };
  }
  if (checked.length === 0) {
    return {
      exitCode: 1,
      kind: 'nothing-checked',
      lines: [
        '✗ 没有任何一处内置产物被查到 ⇒ 这一门**没查**，不是通过。',
        '  未查：' + (notChecked.join('、') || '（无）'),
      ],
    };
  }
  const lines = [
    `内置内容一致性通过：已查 ${checked.length} 处（${checked.join('、')}）与当前 content/poems/ 编译结果一致` +
      `（formatVersion=${current.formatVersion}，诗=${current.poems.length}，带详情=${detailCount(current)}）。`,
  ];
  if (notChecked.length) {
    lines.push(`  ⚠ 另有 ${notChecked.length} 处**没查**：${notChecked.join('、')}（没查 ≠ 通过）。`);
  }
  return { exitCode: 0, kind: 'ok', lines };
}

function main() {
  const targets = [
    {
      label: 'Android 内置内容',
      path: 'android/app/src/main/assets/content/content.json',
      required: true,
    },
    {
      label: 'Web 本地内容（gitignore 的本地产物，缺 ⇒ 没查）',
      path: 'web/content.json',
      required: false,
    },
  ];

  const tmp = mkdtempSync(join(tmpdir(), 'suofei-content-'));
  let current;
  try {
    const fresh = join(tmp, 'content.json');
    const build = spawnSync(
      process.execPath,
      // ⚠ 故意**不给** `--content`：这一门监视的就是真实内容（不换成夹具）。
      ['tools/build-content.mjs', '--quiet', '--out', fresh, '--order', 'source'],
      { encoding: 'utf8' },
    );
    if (build.status !== 0) {
      console.error('✗ 这一门**没查**：无法编译当前真实内容（content/poems/），先修内容或编译器：');
      console.error((build.stdout || '') + (build.stderr || ''));
      console.error('\n（注意：这不是「已查且通过」，是「没查出结论」。）');
      return 1;
    }
    current = JSON.parse(readFileSync(fresh, 'utf8'));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  const entries = targets.map((t) => ({
    ...t,
    missing: !existsSync(t.path),
    text: existsSync(t.path) ? readFileSync(t.path, 'utf8') : null,
  }));

  const result = evaluateTargets(current, entries);
  const verdict = verdictOf(result, current);
  if (verdict.exitCode !== 0) {
    for (const line of verdict.lines) console.error(line);
    return verdict.exitCode;
  }
  for (const line of verdict.lines) console.log(line);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('check-bundled-content.mjs')) {
  process.exitCode = main();
}
