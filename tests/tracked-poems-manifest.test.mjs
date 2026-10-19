// 已跟踪诗源清单（`content/tracked-poems.json`）的**新鲜度**与**读取优先级**。
//
// 背景（2026-10-19）：`tests/tags.test.mjs` 的「已跟踪内容实况」原先直接 `git ls-files`，
// 到了没有 `.git` 的 `git archive` 展开目录就红（git 128），到了仓库内部的副本更是
// 「向上解析到父仓 ⇒ 空清单、退出 0」。修法是把清单来源统一到 `tools/lib/tracked-poems.mjs`，
// 并随内容提交一份清单。这里钉住两件事：
//   ① 真实仓里清单必须与 `git ls-files` 一致（过期就红，并给出重新生成的命令）；
//   ② 读取口的行为：注入 > 仓库根 git > 已提交清单 > **明确报「未提供清单」**（没查 ≠ 通过）。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  TRACKED_POEMS_ENV,
  TRACKED_POEMS_GENERATOR,
  TRACKED_POEMS_MANIFEST_REL,
  TrackedPoemsError,
  readGitTrackedPoems,
  readTrackedPoemPaths,
  readTrackedPoemsManifest,
  sameRepoRoot,
} from '../tools/lib/tracked-poems.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'suofei-tracked-'));
}

function withTempDir(fn) {
  const dir = tempDir();
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function writeManifest(dir, paths) {
  const file = path.join(dir, TRACKED_POEMS_MANIFEST_REL);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ manifestVersion: 1, paths }, null, 2) + '\n');
  return file;
}

function writeInjected(dir, paths) {
  const file = path.join(dir, 'injected-poems.txt');
  fs.writeFileSync(file, paths.join('\0') + '\0');
  return file;
}

// ---------- ① 真实仓：清单新鲜度 ----------

test('已提交清单与 git 的已跟踪诗源逐条一致；无 git 的目录里如实报「未查」', (t) => {
  const git = readGitTrackedPoems(ROOT);
  if (!git.ok) {
    t.skip(`这里不是本仓库根，无法核对清单新鲜度（${git.reason}）⇒ 未查，不是通过。`);
    return;
  }
  const manifest = readTrackedPoemsManifest(ROOT);
  assert.ok(
    manifest,
    `真实仓里应有已提交清单 ${TRACKED_POEMS_MANIFEST_REL}；运行 node ${TRACKED_POEMS_GENERATOR}`,
  );
  assert.deepEqual(
    manifest.paths,
    git.paths,
    `已提交清单过期（含增删/改名）：运行 node ${TRACKED_POEMS_GENERATOR} 重新生成，再随内容一起提交`,
  );
});

// ---------- ② 读取优先级与「没查 ≠ 通过」 ----------

test('注入清单优先于已提交清单（发布/CI 的显式注入通道）', () => {
  withTempDir((dir) => {
    writeManifest(dir, ['content/poems/来自清单.md']);
    const injected = writeInjected(dir, ['content/poems/来自注入.md']);
    const got = readTrackedPoemPaths(dir, { env: { [TRACKED_POEMS_ENV]: injected } });
    assert.equal(got.source, `env:${TRACKED_POEMS_ENV}`);
    assert.deepEqual(got.paths, ['content/poems/来自注入.md']);
  });
});

test('没有 git 时读已提交清单（git archive / .work 副本的路径）', () => {
  withTempDir((dir) => {
    writeManifest(dir, ['content/poems/乙.md', 'content/poems/说明.txt', 'content/poems/甲.md']);
    const got = readTrackedPoemPaths(dir, { env: {} });
    assert.equal(got.source, `manifest:${TRACKED_POEMS_MANIFEST_REL}`);
    assert.deepEqual(got.paths, ['content/poems/乙.md', 'content/poems/甲.md'], '只留 .md，次序按清单原样');
  });
});

test('什么都没有 ⇒ TRACKED_POEMS_UNAVAILABLE，消息写明「未提供清单／没查」与修法', () => {
  withTempDir((dir) => {
    assert.throws(
      () => readTrackedPoemPaths(dir, { env: {} }),
      (err) => {
        assert.ok(err instanceof TrackedPoemsError);
        assert.equal(err.code, 'TRACKED_POEMS_UNAVAILABLE');
        assert.match(err.message, /未提供「已跟踪诗源清单」/);
        assert.match(err.message, /没查/);
        assert.match(err.message, new RegExp(TRACKED_POEMS_ENV));
        assert.match(err.message, new RegExp(TRACKED_POEMS_GENERATOR.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        return true;
      },
    );
  });
});

test('设置了注入清单却读不了 ⇒ BAD_SOURCE，不悄悄回退到已提交清单', () => {
  withTempDir((dir) => {
    writeManifest(dir, ['content/poems/清单里的.md']);
    assert.throws(
      () => readTrackedPoemPaths(dir, { env: { [TRACKED_POEMS_ENV]: path.join(dir, '不存在.txt') } }),
      (err) => {
        assert.equal(err.code, 'TRACKED_POEMS_BAD_SOURCE');
        assert.match(err.message, /既然设置了就必须能读/);
        return true;
      },
    );
  });
});

test('清单坏了 ⇒ BAD_SOURCE（坏的清单不能假装「没有清单」）', () => {
  withTempDir((dir) => {
    const file = path.join(dir, TRACKED_POEMS_MANIFEST_REL);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{ 这不是 JSON');
    assert.throws(() => readTrackedPoemPaths(dir, { env: {} }), (err) => {
      assert.equal(err.code, 'TRACKED_POEMS_BAD_SOURCE');
      assert.match(err.message, /不是合法 JSON/);
      return true;
    });
  });
});

test('清单里的路径不得是绝对路径或含 ..（不许借清单读出仓库根之外）', () => {
  withTempDir((dir) => {
    writeManifest(dir, ['../outside.md']);
    assert.throws(() => readTrackedPoemPaths(dir, { env: {} }), (err) => {
      assert.equal(err.code, 'TRACKED_POEMS_BAD_SOURCE');
      assert.match(err.message, /不得含「\.\.」/);
      return true;
    });
  });
});

test('只认仓库根：父目录与子目录都不等于根本身', () => {
  assert.equal(sameRepoRoot(ROOT, ROOT), true);
  assert.equal(sameRepoRoot(ROOT, path.join(ROOT, 'content')), false);
  assert.equal(sameRepoRoot(ROOT, path.dirname(ROOT)), false);
  assert.equal(sameRepoRoot(ROOT, undefined), false);
});
