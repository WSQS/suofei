// Service Worker：只负责**应用资源**缓存。
//
// 边界（契约 §4「两种缓存分开，不得混用一个版本号」）：
//  - 本文件里的 CACHE_NAME 只跟「应用资源版本」APP_VERSION 走；
//  - content.json（内容）**不进 Cache Storage**，一律交回网络，由 app/content.js
//    下载校验后写进 IndexedDB。这样内容版本与应用版本是两条独立的线。
//  - 部署目标是静态托管（GitHub Pages），所以不假设能自定义响应头，
//    预缓存用 scope 相对 URL 拼，子路径部署（/repo/）同样成立。
//
// 注意：下面两个常量与 app/config.js 的 APP_VERSION / RESOURCE_CACHE_PREFIX 是一回事。
// 经典 worker 不能 import ES 模块，所以这里必须各写一遍；
// tests/e2e-cdp.mjs 有一条断言会读本文件源码与之交叉核对，改一处会立刻报红。

const APP_VERSION = '0.1.0';
const CACHE_PREFIX = 'pc-resources-';
const CACHE_NAME = `${CACHE_PREFIX}${APP_VERSION}`;

// 相对 scope 的路径（'' 就是 scope 自身）。
const SHELL = [
  '',
  'index.html',
  'styles.css',
  'manifest.json',
  'app/main.js',
  'app/config.js',
  'app/store.js',
  'app/content.js',
  'app/render.js',
];

const scopeUrl = (rel) => new URL(rel, self.registration.scope).href;

// 内容相关请求：绝不缓存，直接走网络（离线时由应用回退到 IndexedDB）。
function isContentRequest(url) {
  const last = url.pathname.split('/').pop() || '';
  return last === 'content.json' || last.startsWith('content.json.');
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(SHELL.map(scopeUrl));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((n) => n.startsWith(CACHE_PREFIX) && n !== CACHE_NAME)
      .map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

async function networkFirstShell(request) {
  const shellKey = scopeUrl('index.html');
  try {
    const res = await fetch(request);
    if (res && res.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(shellKey, res.clone());
    }
    return res;
  } catch (err) {
    const cache = await caches.open(CACHE_NAME);
    const cached = (await cache.match(shellKey)) || (await caches.match(scopeUrl('')));
    if (cached) return cached;
    throw err;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res && res.ok && res.type === 'basic') cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  if (cached) return cached;
  const res = await network;
  if (res) return res;
  return new Response('离线且该资源未缓存', {
    status: 504,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isContentRequest(url)) return; // 内容不进资源缓存 → 浏览器默认走网络

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstShell(request));
    return;
  }
  event.respondWith(staleWhileRevalidate(request));
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (data.type === 'CACHE_STATUS' && event.ports && event.ports[0]) {
    const port = event.ports[0];
    event.waitUntil((async () => {
      const cache = await caches.open(CACHE_NAME);
      const keys = await cache.keys();
      port.postMessage({
        appVersion: APP_VERSION,
        cacheName: CACHE_NAME,
        entries: keys.map((r) => new URL(r.url).pathname),
        contentEntries: keys.map((r) => new URL(r.url).pathname).filter((p) => isContentRequest(new URL(p, self.location.origin))),
      });
    })());
  }
});
