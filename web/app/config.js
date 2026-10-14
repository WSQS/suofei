// 唯一的「对外接口」常量集中地。
//
// 为什么单独一个文件：这些都是**接口性质的**决定 —— 一旦改动，别人也要跟着改
// （Android 端读取的同一份 content.json、已经分享出去的链接、Pages 上的产物、
// 已经缓存过旧内容的浏览器）。所以这里集中放，改的时候只动这个文件（外加 sw.js
// 里两个经典 worker 无法 import 的常量，由 tests/e2e-cdp.mjs 交叉断言保持一致）。
//
// 每条的依赖方与改动代价见 web/README.md 的「接口决定」一节。

/** 站点/应用展示名（用户 2026-10-14 拍板：索斐）。 */
export const APP_NAME = '索斐';

/** 应用资源版本：只跟 sw.js 的资源缓存走，和内容版本是两条独立的线。 */
export const APP_VERSION = '0.1.0';

// ---------- 更新检查协议（HTTP 层） ----------

/** 内容文档地址：相对路径，Pages 子路径部署（/repo/）也可用。 */
export const CONTENT_URL = 'content.json';

/** 可选校验和边车：同目录、64 位小写十六进制 + 两个空格 + 文件名（sha256sum 风格）。
 *  取不到就退化为「本机自算 sha256 + 结构校验」，并把降级事实记进 meta。 */
export const CHECKSUM_URL = 'content.json.sha256';

/** 本客户端能解析的 JSON 结构版本；更高 = 保留旧内容、不解析（契约 §4）。 */
export const SUPPORTED_FORMAT_VERSION = 1;

// ---------- 本地存储（内容 / 资源分开，版本键不混用） ----------

/** 内容离线副本：IndexedDB（不是 Cache Storage）。 */
export const CONTENT_DB = {
  name: 'poetry-web',
  version: 1,
  store: 'content',
  activeKey: 'active',
  stagedKey: 'staged',
};

/** 应用资源缓存：Cache Storage 名字前缀 + 应用资源版本。 */
export const RESOURCE_CACHE_PREFIX = 'pc-resources-';
export const resourceCacheName = (appVersion = APP_VERSION) => `${RESOURCE_CACHE_PREFIX}${appVersion}`;

/** 本版本**不使用** localStorage（所以没有键空间依赖）；离线副本只在 IndexedDB。 */
export const LOCAL_STORAGE_KEYS = {};

// ---------- URL 形态（可分享链接） ----------

/** 哈希路由：静态托管（Pages）没有重写规则，所以不用路径路由。
 *  id 用契约里的稳定 id，不用标题，链接不会因为改标题失效。 */
export const ROUTES = {
  index: '#/',
  poem: (id) => `#/p/${encodeURIComponent(id)}`,
  poemPattern: /^\/p\/(.+)$/,
};
