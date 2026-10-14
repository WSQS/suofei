/*
 * serve.mjs —— 零依赖静态服务器，用于验证原型在 http 下读取 dist/content.json 的那条分支。
 * 用法：  node tools/serve.mjs [port]     然后打开 http://127.0.0.1:8137/
 * （也可以用 `npx serve`；本文件只是不想为了看一眼原型就下载任何包。）
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const port = Number(process.argv[2] || 8137);
const root = resolve('.');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let path = normalize(decodeURIComponent(url.pathname));
    if (path.endsWith('/')) path += 'index.html';
    const file = join(root, path);
    if (!file.startsWith(root)) {
      res.writeHead(403).end('403');
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': types[extname(file)] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(body);
  } catch (err) {
    res.writeHead(err.code === 'ENOENT' ? 404 : 500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(String(err.code || err.message));
  }
}).listen(port, '127.0.0.1', () => {
  console.log('原型预览： http://127.0.0.1:' + port + '/   (Ctrl+C 结束)');
});
