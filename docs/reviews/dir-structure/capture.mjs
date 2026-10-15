#!/usr/bin/env node
/**
 * 「目录页结构」对照截图 —— 给用户看的评审材料（对话侧 2026-10-15）
 *
 * 为什么需要它：用户要对比的是「原型 vs 实现」的目录页结构（`docs/interface-decisions.md`
 * 里那条待答 `q-8f6028a5`），而这件事**只能看图说清**：
 *   原型 = 组卡片 + 组内前 3 首题名预览 + 点组进入**二级页**（hash 里是 /g/<朝代 key>）
 *   实现 = 组头 + 组内诗列表**内联展开**，没有二级页
 *
 * 为了不让「不同视口」「连到旧服务」这类事造出假结论，本脚本：
 *   - 两台服务都由它自己起、自己关，**起之前先做端口预检**（见 assertPortFree）；
 *   - 三张图用**同一台无头 Chromium、同一视口**（420×2600，2× 密度）。
 *     视口故意拉长：把手机屏拉长到一屏看完整个目录，所以截出来的是**整页**而不是「第一屏」——
 *     代价是它不等于真机上的一屏，图里已注明。
 *
 * 用法：CHROME_BIN=... node docs/reviews/dir-structure/capture.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const CHROME = process.env.CHROME_BIN;
if (!CHROME) { console.error('需要 CHROME_BIN'); process.exit(1); }

const PROTO_PORT = 18711;
const WEB_PORT = 18712;

/**
 * 端口预检。**这一步存在的唯一理由是「不给自己造假结论」**：
 * 2026-10-15 实测踩到过——上一次运行残留的服务还在监听，新服务起不来（EADDRINUSE 被静默吞掉），
 * 于是脚本要么连到上一轮的旧服务、要么直接判「没起来」；两种都会让人对截图产生错误理解。
 */
const assertPortFree = (port) => new Promise((res, rej) => {
  const srv = net.createServer();
  srv.once('error', (e) => rej(new Error('端口 ' + port + ' 已被占用（' + e.code + '）：先确认那不是自己上一轮遗留的服务，再来跑本脚本')));
  srv.once('listening', () => srv.close(() => res()));
  srv.listen(port, '127.0.0.1');
});

const waitFor = async (url, tries = 60) => {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { redirect: 'manual' });
      if (r.ok) return true;
    } catch { /* 还没起来 */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
};

const wp = (p) => p.replace(/\//g, '\\');
const shot = (file, url) => {
  execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--force-device-scale-factor=2', '--window-size=420,2600',
    '--virtual-time-budget=6000',
    '--screenshot=' + wp(path.join(HERE, file)), url,
  ], { stdio: 'inherit' });
  console.log('✓ ' + file);
};

await assertPortFree(PROTO_PORT);
await assertPortFree(WEB_PORT);
// 预检完不要立刻 spawn：Windows 上刚被关掉的监听端口会有一小段"还占着"的窗口，
// 子进程此时 bind 会 EADDRINUSE（2026-10-15 实测踩到：预检过了、服务却起不来）。
await new Promise((r) => setTimeout(r, 600));

// 子进程输出一律收着：起不来的原因必须在报错里看得到，不然就只剩"没起来"三个字。
const capture = (child) => {
  const buf = [];
  child.stdout.on('data', (d) => buf.push(String(d)));
  child.stderr.on('data', (d) => buf.push(String(d)));
  return () => buf.join('');
};

const proto = spawn(process.execPath, [path.join(ROOT, 'prototype/tools/serve.mjs'), String(PROTO_PORT)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
const web = spawn(process.execPath, [path.join(ROOT, 'web/scripts/serve.mjs'), '--port', String(WEB_PORT)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
const protoLog = capture(proto);
const webLog = capture(web);

try {
  const [okProto, okWeb] = await Promise.all([
    waitFor('http://127.0.0.1:' + PROTO_PORT + '/prototype/index.html'),
    waitFor('http://127.0.0.1:' + WEB_PORT + '/'),
  ]);
  if (!okProto) throw new Error('原型服务没起来（port ' + PROTO_PORT + '）；子进程输出：' + (protoLog() || '(空)'));
  if (!okWeb) throw new Error('Web 服务没起来（port ' + WEB_PORT + '）；子进程输出：' + (webLog() || '(空)'));

  shot('proto-index.png', 'http://127.0.0.1:' + PROTO_PORT + '/prototype/#/');
  shot('proto-group.png', 'http://127.0.0.1:' + PROTO_PORT + '/prototype/#/g/han');
  shot('web-index.png', 'http://127.0.0.1:' + WEB_PORT + '/#/');
} finally {
  proto.kill();
  web.kill();
  // 等端口真的放开，免得下一次运行（或别的脚本）撞上残留
  for (const p of [PROTO_PORT, WEB_PORT]) {
    try { await assertPortFree(p); } catch { console.warn('⚠️ 端口 ' + p + ' 还没放开，可能有残留进程'); }
  }
}

// 并排缩略：只用来看**结构**，字会偏小；要看字请开那三张整页图
const sheet = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>
  body{margin:0;background:#0e1315;color:#dde5e4;font-family:'Microsoft YaHei UI','Microsoft YaHei',sans-serif;padding:24px 28px}
  h1{font-size:19px;font-weight:500;letter-spacing:.14em;margin:0 0 4px}
  .sub{color:#98a8a6;font-size:12px;line-height:1.7;margin:0 0 18px}
  .row{display:flex;gap:22px;align-items:flex-start}
  figure{margin:0;width:460px}
  figcaption{font-size:12px;line-height:1.6;color:#dde5e4;margin-bottom:8px}
  figcaption b{font-weight:500}figcaption span{display:block;color:#98a8a6;font-size:11px}
  img{display:block;width:100%;border:1px solid #233034;border-radius:6px;background:#0a0e10}
</style></head><body>
  <h1>索斐 · 目录页结构：原型 vs 实现</h1>
  <p class="sub">同一台无头 Chromium、同一视口（420×2600、2× 密度；<b>把手机屏拉长到一屏看完整个目录</b>——所以它不是真机上的一屏，只是为了让整页可比较）。要看字请直接开这三张整页图。Android 端截图暂缺（需要负责人那台模拟器），但其实现结构与此处的 Web 一致（组头＋内联列表）。</p>
  <div class="row">
    <figure><figcaption><b>① 原型 · 目录</b><span>组卡片 ＋ 组内前 3 首题名预览 ＋ 每张卡可点进</span><img src="proto-index.png"></figure>
    <figure><figcaption><b>② 原型 · 点进后的二级页</b><span>组页（hash 里是 /g/han）里才是完整诗列表</span><img src="proto-group.png"></figure>
    <figure><figcaption><b>③ 实现（Web）· 目录</b><span>组头 ＋ 19 首全部内联展开，没有二级页</span><img src="web-index.png"></figure>
  </div>
</body></html>`;
fs.writeFileSync(path.join(HERE, 'compare.html'), sheet);

execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars',
  '--window-size=1500,1560', '--virtual-time-budget=4000',
  '--screenshot=' + wp(path.join(HERE, 'compare.png')),
  'file:///' + wp(path.join(HERE, 'compare.html'))], { stdio: 'inherit' });
console.log('✓ compare.png（并排缩略）');
