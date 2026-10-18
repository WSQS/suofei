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
 * 同步读线上**内容真值**：站点的 Android 小纸条清单 `${site}/content/latest.json` 里的 `contentVersion`。
 *
 * 为何以它为准（2026-10-16）：Web 端**没有**独立的内容版本通道（内容随壳走），所以“线上用户
 * 现在能用到的内容版本”的**唯一机器可读真值**就是这份清单 —— Android 端真的在取它。
 * 内容专用发布（`--content-only`）的单调性就是把本次 contentVersion 与它比：
 * 只有严格大于线上真值，已安装的客户端才会采用这次内容。
 *
 * 取不到就返回 `contentVersion: null` ＋原因（调用方**不得**把它当成“通过”或“默认值”）。
 */
export function readLiveContentVersion({ timeoutMs = 6000 } = {}) {
  const site = readAppSiteUrl();
  if (!site.url) return { contentVersion: null, doc: null, siteUrl: null, source: null, error: site.error };

  const script = `
    const url = process.argv[1];
    const fail = (why) => process.stdout.write(JSON.stringify({ error: why }));
    const mod = url.startsWith('https:') ? require('https') : require('http');
    const req = mod.get(url, { headers: { 'user-agent': 'suofei-check-ready' }, timeout: ${timeoutMs} }, (r) => {
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => {
        if (r.statusCode !== 200) return fail('HTTP ' + r.statusCode);
        let doc;
        try { doc = JSON.parse(d); } catch (e) { return fail('不是合法 JSON：' + e.message); }
        if (typeof doc.contentVersion !== 'string' || doc.contentVersion === '') return fail('清单里没有 contentVersion');
        process.stdout.write(JSON.stringify({ contentVersion: doc.contentVersion, formatVersion: doc.formatVersion, sha256: doc.sha256, minAppVersionCode: doc.minAppVersionCode }));
      });
    });
    req.on('timeout', () => { req.destroy(); fail('请求超时（' + ${timeoutMs} + 'ms）'); });
    req.on('error', (e) => fail(String((e && e.message) || e)));
  `;

  const r = spawnSync(process.execPath, ['-e', script, `${site.url}/content/latest.json`], {
    encoding: 'utf8',
    timeout: timeoutMs + 3000,
  });
  let parsed = null;
  try {
    parsed = JSON.parse((r.stdout || '').trim() || '{}');
  } catch {
    /* 落到下面统一当失败 */
  }
  if (!parsed || !parsed.contentVersion) {
    const errTail = (r.stderr || '').trim().split('\n').filter(Boolean).slice(-2).join(' / ');
    return {
      contentVersion: null,
      doc: null,
      siteUrl: site.url,
      source: site.source,
      error:
        parsed?.error ||
        (r.error ? String(r.error.message) : '子进程没有返回可解析的结果') + (errTail ? `（子进程 stderr：${errTail}）` : ''),
    };
  }
  return {
    contentVersion: parsed.contentVersion,
    doc: parsed,
    siteUrl: site.url,
    source: site.source,
    error: null,
  };
}

/**
 * 把**线上已发布的那份内容字节**下载到 `dest`（不经过任何重编）。
 *
 * 为何必须取线上那一份（负责人 2026-10-16 明确要求）：验证「同 app 版本跨内容修订」时，
 * 旧侧必须是**用户真正下发过的那份字节**；拿仓库里的内置副本代替就变成“自己造一个旧版本验证自己”。
 * 站点的内容快照是按版本留存的（`content/<版本>/content.json`），所以已发版本一直可重取。
 *
 * @returns {{ok: boolean, sha256?: string, contentVersion?: string, bytes?: number, url?: string, error?: string}}
 */
export function downloadLiveContentFile({ contentVersion, dest, timeoutMs = 20000 }) {
  const site = readAppSiteUrl();
  if (!site.url) return { ok: false, error: site.error };
  const url = `${site.url}/content/${contentVersion}/content.json`;
  const script = `
    const fs = require('fs');
    const crypto = require('crypto');
    const url = process.argv[1];
    const dest = process.argv[2];
    const expect = process.argv[3];
    const fail = (why) => process.stdout.write(JSON.stringify({ error: why }));
    const mod = url.startsWith('https:') ? require('https') : require('http');
    const req = mod.get(url, { headers: { 'user-agent': 'suofei-check-ready' }, timeout: ${timeoutMs} }, (r) => {
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => {
        if (r.statusCode !== 200) return fail('HTTP ' + r.statusCode);
        const buf = Buffer.concat(chunks);
        let doc;
        try { doc = JSON.parse(buf.toString('utf8')); } catch (e) { return fail('不是合法 JSON：' + e.message); }
        if (expect && doc.contentVersion !== expect) return fail('contentVersion ' + doc.contentVersion + ' ≠ 期望的 ' + expect);
        fs.writeFileSync(dest, buf);
        process.stdout.write(JSON.stringify({
          ok: true,
          sha256: crypto.createHash('sha256').update(buf).digest('hex'),
          contentVersion: doc.contentVersion,
          bytes: buf.length,
        }));
      });
    });
    req.on('timeout', () => { req.destroy(); fail('请求超时（' + ${timeoutMs} + 'ms）'); });
    req.on('error', (e) => fail(String((e && e.message) || e)));
  `;
  const r = spawnSync(process.execPath, ['-e', script, url, dest, contentVersion], { encoding: 'utf8', timeout: timeoutMs + 5000 });
  let parsed = null;
  try {
    parsed = JSON.parse((r.stdout || '').trim() || '{}');
  } catch {
    /* 落到下面统一当失败 */
  }
  if (!parsed || !parsed.ok) {
    const errTail = (r.stderr || '').trim().split('\n').filter(Boolean).slice(-2).join(' / ');
    return { ok: false, url, error: parsed?.error || (r.error ? String(r.error.message) : '子进程没有返回可解析的结果') + (errTail ? `（${errTail}）` : '') };
  }
  return { ...parsed, url };
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
