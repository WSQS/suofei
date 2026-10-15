/**
 * 「线上站点当前发布的 APP_VERSION」——只作为 `app-version-bumped` 这条门的**备选基线**。
 *
 * 为什么需要它（2026-10-15 发现的一个真缺口）：
 *   那条门的基线原本只来自「**同一产物目录里**上一份 release-manifest.json」；而 CI 每次从
 *   空目录构建 ⇒ 基线为 null ⇒ 那条门**只会 skip**，等于真发布路径上不设防。风险很具体：
 *   将来有人**用同一个版本号重发**，浏览器会继续用旧 cache、用户看不到更新，而门不会拦。
 *
 * 两条设计约束（刻意如此）：
 *  1. **不改构建**：构建必须能 `--offline` 复现，不能偷偷联网。联网只发生在**检查**这一侧
 *     （check-ready 本来就有真跑门，"会联网"这件事在那里已被接受）。
 *  2. **取不到就如实说「没查」**，绝不静默跳过——见 `items/graph.md`「已知缺口」那条：
 *     「看起来有保障、其实没有」这一类，共同形状就是「不挡任何东西 ⇒ 永远不会有人提」。
 *
 * 站点地址不另立常量：**读 Android 侧那个单一来源**（`UpdateProtocol.BASE_URL`，它就是应用
 * 真正去取的地址），可用环境变量 `SUOFEI_SITE_URL` 覆盖（本机演练指向本地服务用）。
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

import { REPO_ROOT, display, exists } from './util.mjs';

const ENDPOINT_KT_REL = 'android/app/src/main/java/dev/sopho/suofei/update/UpdateProtocol.kt';

/** 站点根：优先环境变量，否则读 Android 的 `BASE_URL`（单一来源，不另立一份常量）。 */
export function readAppSiteUrl() {
  const fromEnv = (process.env.SUOFEI_SITE_URL || '').trim();
  if (fromEnv) return { url: fromEnv.replace(/\/+$/, ''), source: '环境变量 SUOFEI_SITE_URL' };

  const p = path.join(REPO_ROOT, ENDPOINT_KT_REL);
  if (!exists(p)) return { url: null, source: null, error: `读不到 ${display(p)}` };
  const m = /const val BASE_URL: String = "([^"]+)"/.exec(fs.readFileSync(p, 'utf8'));
  if (!m) return { url: null, source: null, error: `在 ${ENDPOINT_KT_REL} 里找不到 BASE_URL 常量` };
  return { url: m[1].trim().replace(/\/+$/, ''), source: `${ENDPOINT_KT_REL} 的 BASE_URL（单一来源）` };
}

/**
 * 同步读线上 `app/config.js` 里的 `APP_VERSION`。
 *
 * 为什么用子进程：check-ready 的检查函数是**同步**的（runner 不 await），所以这里用
 * `spawnSync` 起一个短命子进程做这一次 HTTP，而不是把整条 runner 改成 async。
 * 返回 `{ version, siteUrl, source, error }`；`version` 为 null 表示**没查到**（附原因）。
 */
export function readLiveAppVersion({ timeoutMs = 6000 } = {}) {
  const site = readAppSiteUrl();
  if (!site.url) return { version: null, siteUrl: null, source: null, error: site.error };

  const script = `
    const url = process.argv[1];
    const fail = (why) => process.stdout.write(JSON.stringify({ error: why }));
    // 按 scheme 选模块：http:// 用 http（本机演练拿本地服务当基线时会用到）
    const mod = url.startsWith('https:') ? require('https') : require('http');
    const req = mod.get(url, { headers: { 'user-agent': 'suofei-check-ready' }, timeout: ${timeoutMs} }, (r) => {
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => {
        if (r.statusCode !== 200) return fail('HTTP ' + r.statusCode);
        const m = /APP_VERSION\\s*=\\s*'([0-9.]+)'/.exec(d);
        if (!m) return fail('app/config.js 里没找到 APP_VERSION（HTTP ' + r.statusCode + '）');
        process.stdout.write(JSON.stringify({ version: m[1] }));
      });
    });
    req.on('timeout', () => { req.destroy(); fail('请求超时（' + ${timeoutMs} + 'ms）'); });
    req.on('error', (e) => fail(String((e && e.message) || e)));
  `;

  const r = spawnSync(process.execPath, ['-e', script, `${site.url}/app/config.js`], {
    encoding: 'utf8',
    timeout: timeoutMs + 3000,
  });
  let parsed = null;
  try {
    parsed = JSON.parse((r.stdout || '').trim() || '{}');
  } catch {
    /* 落到下面统一当失败 */
  }
  if (!parsed || !parsed.version) {
    // 把子进程 stderr 的尾部带出来（否则“拿不到结果”这种话无法诊断——本次实测就被这一条卡过一次）
    const errTail = (r.stderr || '')
      .trim()
      .split('\n')
      .filter(Boolean)
      .slice(-2)
      .join(' / ');
    return {
      version: null,
      siteUrl: site.url,
      source: site.source,
      error:
        parsed?.error ||
        (r.error ? String(r.error.message) : '子进程没有返回可解析的结果') + (errTail ? `（子进程 stderr：${errTail}）` : ''),
    };
  }
  return { version: parsed.version, siteUrl: site.url, source: site.source, error: null };
}
