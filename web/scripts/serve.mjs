#!/usr/bin/env node
// 零依赖静态服务：等价于 `npx serve web` 的最小替代，用来在 localhost 下看效果。
// Service Worker 需要 http(s) 或 localhost，file:// 打开无法离线。
//
//   node web/scripts/serve.mjs                 # http://127.0.0.1:8080/
//   node web/scripts/serve.mjs --port 8137     # 换端口
//   node web/scripts/serve.mjs --root web      # 换根目录
//
// 每次请求都从磁盘读（不缓存到内存），这样替换 web/content.json 能立刻生效，
// 便于手动演练「内容更新」；部署到 Pages 时用的是托管方自己的响应头策略。

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return dflt;
  const v = argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
};

const here = fileURLToPath(new URL('..', import.meta.url));
const root = resolve(flag('root', here));
const port = Number(flag('port', 8080));
const verbose = Boolean(flag('verbose', false));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.sha256': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith('/')) pathname += 'index.html';
  const abs = resolve(join(root, normalize(pathname)));
  if (abs !== root && !abs.startsWith(root + sep)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  try {
    const st = await stat(abs);
    if (!st.isFile()) throw new Error('not a file');
    res.writeHead(200, {
      'Content-Type': MIME[extname(abs).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size,
      // 不用 no-store：避免和 Service Worker 的 Cache Storage 语义纠缠；
      // 开发期不想要陈旧副本，所以要求每次向服务器确认。
      'Cache-Control': 'no-cache, must-revalidate',
    });
    createReadStream(abs).pipe(res);
    if (verbose) console.log(`200 ${pathname}`);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end(`404 ${pathname}`);
    if (verbose) console.log(`404 ${pathname}`);
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`serving ${root}`);
  console.log(`http://127.0.0.1:${port}/`);
});
