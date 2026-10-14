// 发布流水线 F：小工具（哈希 / 进程 / 文件 / 打印）。
//
// 只依赖 Node 内置模块：本机没有装全局工具、web/ 也没有 npm 依赖，
// 发布脚本不能在「只有 node + git + JDK/SDK」的机器上要求额外东西。

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/** 仓库根（release/lib → release → 仓库根）。所有路径都从这里绝对化，
 *  这样脚本从任何 cwd 调用结果都一样。 */
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** 流水线自己的失败（与「某个检查项红了」区分开：那是正常返回码 1）。 */
export class ReleaseError extends Error {
  constructor(message, { code = 'RELEASE_FAILED' } = {}) {
    super(message);
    this.name = 'ReleaseError';
    this.code = code;
  }
}

// ---------- 打印 ----------

const WIDTH = 72;

export function banner(text) {
  console.log('');
  console.log('─'.repeat(WIDTH));
  console.log(text);
}

export function step(index, total, title) {
  banner(`[${index}/${total}] ${title}`);
}

export function note(message) {
  console.log(`  · ${message}`);
}

/** 把要真正执行的命令打印出来（可复制粘贴），不藏在函数里。 */
export function showCommand(cmd, args, cwd = REPO_ROOT) {
  const shown = args.map((a) => (/[\s"]/.test(a) ? JSON.stringify(a) : a)).join(' ');
  // node 用绝对路径执行更稳，但打印成 `node` 更好读、可直接粘贴。
  const shownCmd = cmd === process.execPath ? 'node' : cmd;
  const where = cwd === REPO_ROOT ? '' : `   (cwd: ${display(cwd)})`;
  console.log(`  $ ${shownCmd} ${shown}${where}`);
}

export function info(label, value) {
  console.log(`  · ${label}: ${value}`);
}

export function warn(message) {
  console.log(`  ! ${message}`);
}

/** 仓库内相对路径（显示统一用 /，Windows 上也一样）。 */
export function display(p) {
  const rel = path.isAbsolute(p) ? path.relative(REPO_ROOT, p) : p;
  return rel === '' ? '.' : rel.split(path.sep).join('/');
}

// ---------- 哈希 / 边车 ----------

export function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export function sha256File(file) {
  return sha256(fs.readFileSync(file));
}

export function sha256Text(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

// ---------- 文件 ----------

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function exists(p) {
  return fs.existsSync(p);
}

export function writeFileEnsured(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
}

export function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

/** 递归复制目录树（可给 filter 排除构建缓存等）。 */
export function copyTree(src, dst, { filter } = {}) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.cpSync(src, dst, { recursive: true, filter });
}

/** 目录里的顶层条目名（排序）。不存在返回 null —— 调用方据此区分「空」和「没有」。 */
export function listTop(dir) {
  if (!fs.existsSync(dir)) return null;
  return fs.readdirSync(dir).sort();
}

export function dirBytes(dir) {
  let total = 0;
  let files = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) {
        total += fs.statSync(p).size;
        files += 1;
      }
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return { bytes: total, files };
}

// ---------- 进程 ----------

function quoteForWindows(arg) {
  // cmd.exe 对含空格/引号的参数需要额外一层引号。发布脚本不接受任意用户输入，
  // 这里只处理路径里可能出现的空格。
  return /[\s"]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg;
}

/** 在 Windows 上，`.bat`（gradlew.bat）必须经 cmd.exe 才能执行（直接 spawnSync 会 EINVAL）。 */
function spawnTarget(cmd, args) {
  if (process.platform === 'win32' && /\.bat$/i.test(cmd)) {
    return { file: 'cmd.exe', argv: ['/c', cmd, ...args.map(quoteForWindows)] };
  }
  return { file: cmd, argv: args };
}

/**
 * 同步跑一个命令，输出直通到终端（构建日志要能被人看见）。
 * 非零退出 ⇒ 抛 ReleaseError：**不许把失败当成功**。
 */
export function run(cmd, args, { cwd = REPO_ROOT, env, allowFailure = false, quiet = false } = {}) {
  if (!quiet) showCommand(cmd, args, cwd);
  const started = Date.now();
  let result;
  {
    const t = spawnTarget(cmd, args);
    result = spawnSync(t.file, t.argv, { cwd, env: env ?? process.env, stdio: 'inherit' });
  }
  const seconds = (Date.now() - started) / 1000;
  if (result.error) {
    throw new ReleaseError(`命令无法执行：${cmd} —— ${result.error.message}`, { code: 'SPAWN_FAILED' });
  }
  if (result.status !== 0 && !allowFailure) {
    throw new ReleaseError(`命令失败（退出码 ${result.status}）：${cmd} ${args.join(' ')}`, {
      code: 'COMMAND_FAILED',
    });
  }
  return { status: result.status, seconds };
}

/** 跑一个命令并抓取 stdout（用于读取 git/工具输出）。找不到该命令返回 null。 */
export function runCapture(cmd, args, { cwd = REPO_ROOT } = {}) {
  const result = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  if (result.error) return null;
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/**
 * 跑一个长命令：输出**全量落盘**到 logFile，终端只打尾部若干行。
 * 用在两个「真跑」门上（Web e2e 一百多条断言、Gradle 单测）——
 * 回执要能读，但不能因为读不全而丢掉证据。
 */
export function runCaptureFull(cmd, args, { cwd = REPO_ROOT, env, logFile, tailLines = 25 } = {}) {
  showCommand(cmd, args, cwd);
  const started = Date.now();
  const target = spawnTarget(cmd, args);
  const result = spawnSync(target.file, target.argv, {
    cwd,
    env: env ?? process.env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const seconds = (Date.now() - started) / 1000;
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (logFile) {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.writeFileSync(logFile, `${cmd} ${args.join(' ')}\n\n${output}`, 'utf8');
    console.log(`  · 完整输出：${display(logFile)}（${output.length} 字符；下面只打尾部 ${tailLines} 行）`);
  }
  const lines = output.replace(/\s+$/, '').split('\n');
  for (const line of lines.slice(-tailLines)) console.log(`  │ ${line}`);
  if (result.error) {
    throw new ReleaseError(`命令无法执行：${cmd} —— ${result.error.message}`, { code: 'SPAWN_FAILED' });
  }
  return { status: result.status, seconds, output, logFile };
}

/** git 子命令的 stdout（去掉尾换行）；git 不可用或失败返回 null，绝不猜。 */
export function git(args) {
  const r = runCapture('git', args);
  if (!r || r.status !== 0) return null;
  return r.stdout.replace(/\n+$/, '');
}
