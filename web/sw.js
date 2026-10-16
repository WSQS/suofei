// Service Worker：**站点的唯一缓存与更新通道**（用户 2026-10-14 拍板）。
//
// 关键约定：
//  - 站点缓存按**站点版本** `APP_VERSION` 命名：`pc-resources-<APP_VERSION>`；
//  - **内容（content.json）与壳（HTML/JS/CSS）进同一个缓存、一起预缓存、一起切换** ——
//    因为 Web 的内容与壳本来就是同一次部署一起换的，这样**不可能出现「旧壳配新内容」**；
//  - Web 端**没有**独立的内容版本通道：不比对远端 contentVersion、不用 IndexedDB 暂存、
//    不依赖 content.json.sha256 边车（产物里仍会带 contentVersion，但只作展示）；
//  - 取用策略是 **cache-first**：只要本版本缓存里有，就直接给缓存，绝不去混入别的版本。
//    这样「新旧成对生效」是可验证的：旧 SW 还在控制时，即使服务器已经换成新版本，
//    页面拿到的仍是旧缓存里的整套（壳 + 内容）；只有新 SW 激活并刷新后，才整套换成新版本。
//  - 安装**不 skipWaiting**：新版本装好后停在 waiting，由页面明确提示用户点「刷新」
//    （或在回目录时自动切换）；**不在阅读中自动 reload**。
//
// 注意：下面两个常量与 app/config.js 的 APP_VERSION / RESOURCE_CACHE_PREFIX 是一回事。
// 经典 worker 不能 import ES 模块，所以这里必须各写一遍；
// tests/e2e-cdp.mjs 有一条断言会读本文件源码与之交叉核对，改一处会立刻报红。

const APP_VERSION = '0.1.2';
const CACHE_PREFIX = 'pc-resources-';
const CACHE_NAME = `${CACHE_PREFIX}${APP_VERSION}`;

const CONTENT_URL = 'content.json';

// 相对 scope 的路径（'' 就是 scope 自身）。内容与壳在同一份清单里 → 成对缓存。
// ⚠️ 图标也要在这里：它们是**独立文件**（不再是内联 data: URI），离线首屏缺了就会在标签页/安装入口处掉图。
//    e2e 有一条断言会把这份清单与部署清单对账（新增资源必须同时进两份）。
const PRECACHE = [
  '',
  'index.html',
  'styles.css',
  'manifest.json',
  // 启动/安装图标（N1）
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  // 标签页图标（另一套无字极简记号，与启动图标不是同一张）
  'icons/favicon.svg',
  'icons/favicon-32.png',
  'app/main.js',
  'app/config.js',
  'app/content.js',
  'app/render.js',
  CONTENT_URL,
];

const scopeUrl = (rel) => new URL(rel, self.registration.scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // cache:'reload' 绕过 HTTP 缓存，保证预缓存的是这次部署的字节。
    // 任何一个文件取不到就让 install 失败（旧 SW 继续服务），不留下半套缓存。
    const entries = await Promise.all(PRECACHE.map(async (rel) => {
      const url = scopeUrl(rel);
      const res = await fetch(new Request(url, { cache: 'reload' }));
      if (!res || !res.ok) {
        throw new Error(`预缓存失败：${url} → HTTP ${res ? res.status : 'no response'}`);
      }
      return [url, res];
    }));
    await Promise.all(entries.map(([url, res]) => cache.put(url, res)));
  })());
  // 刻意不调用 skipWaiting()：等页面提示用户后再切换。
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    const removed = names.filter((n) => n.startsWith(CACHE_PREFIX) && n !== CACHE_NAME);
    await Promise.all(removed.map((n) => caches.delete(n)));
    self.__removedCaches = removed;
    await self.clients.claim();
  })());
});

/** 离线且连外壳都没缓存时的最后一道：给出可读的说明，而不是空白或纯 504。 */
function offineShellResponse() {
  return new Response(
    '<!doctype html><meta charset="utf-8"><title>索斐</title>'
    + '<p>本站还没有缓存到本机，且当前无法联网。</p>'
    + '<p>首次访问需要网络；联网后重新打开即可正常阅读，之后可以离线使用。</p>',
    { status: 504, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

/**
 * cache-first：本版本缓存里有就直接给缓存；没有才去网络取，且**不写回本版本缓存**
 * （避免把另一个版本的字节混进这一版，破坏「成对生效」）。
 */
async function cacheFirst(key, request) {
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(key);
  if (hit) return hit;
  try {
    return await fetch(request ?? key);
  } catch (err) {
    if ((request ?? key).mode === 'navigate') return offineShellResponse();
    return new Response('离线且本站缓存里没有这个资源', {
      status: 504,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/sw.js')) return; // 交给浏览器自己的更新检查

  if (request.mode === 'navigate') {
    event.respondWith(cacheFirst(scopeUrl('index.html'), request));
    return;
  }
  event.respondWith(cacheFirst(request, request));
});

async function cacheReport() {
  const cache = await caches.open(CACHE_NAME);
  const keys = await cache.keys();
  const entries = keys.map((r) => new URL(r.url).pathname);
  return {
    appVersion: APP_VERSION,
    cacheName: CACHE_NAME,
    entries,
    hasContent: entries.some((p) => p.endsWith(`/${CONTENT_URL}`)),
  };
}

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (data.type === 'CACHE_STATUS' && event.ports && event.ports[0]) {
    const port = event.ports[0];
    event.waitUntil((async () => { port.postMessage(await cacheReport()); })());
  }
});
