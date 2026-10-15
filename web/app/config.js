// 唯一的「对外接口」常量集中地。
//
// 为什么单独一个文件：这些都是**接口性质的**决定 —— 一旦改动，别人也要跟着改
// （已经分享出去的链接、Pages 上的产物、已经缓存过旧站点的浏览器都算「别人」）。
// 所以这里集中放，改的时候只动这个文件（外加 sw.js 里经典 worker 无法 import 的常量，
// 由 tests/e2e-cdp.mjs 交叉断言保持一致）。
//
// 每条的依赖方与改动代价见 web/README.md 的「接口决定」一节。
//
// ⚠ 架构约定（用户 2026-10-14 拍板，2026-10-14 第二轮改写）：
//   **Web 的「内容更新」就是「站点更新」**，由 Service Worker 的更新生命周期统一负责：
//   壳（HTML/JS/CSS）与 content.json 进同一个站点缓存、按 APP_VERSION 成对切换。
//   所以 Web 端**没有**独立的内容版本通道：不比对远端 contentVersion、不用 IndexedDB 暂存、
//   不依赖 content.json.sha256 边车。产物里的 contentVersion 仍会显示在界面上，
//   但**只作展示**，不参与任何更新决策。

/** 站点/应用展示名（用户 2026-10-14 拍板：索斐）。 */
export const APP_NAME = '索斐';

/** 站点（应用资源）版本：唯一的版本键，站点缓存与更新生命周期都跟着它走。
 *  发布新站点（含新内容）时递增它。 */
export const APP_VERSION = '0.1.1';

/** 内容文档地址：**单独取**（不内联进 HTML/JS）——
 *  这样外壳一到就能先渲染框架并如实显示「正在取内容／失败原因」，
 *  内联则坏网时没有可显示的中间状态、失败即白屏。 */
export const CONTENT_URL = 'content.json';

/** 站点缓存：Cache Storage 名字前缀 + 站点版本。 */
export const RESOURCE_CACHE_PREFIX = 'pc-resources-';
export const resourceCacheName = (appVersion = APP_VERSION) => `${RESOURCE_CACHE_PREFIX}${appVersion}`;

/** 本客户端能解析的内容 JSON 结构版本。内容与壳一起发布，所以不匹配属于**部署问题**：
 *  仍然如实报错、不渲染，并说明原因。 */
export const SUPPORTED_FORMAT_VERSION = 1;

/** 本版本**不使用** localStorage（所以没有键空间依赖）；也不用 IndexedDB。 */
export const LOCAL_STORAGE_KEYS = {};

// ---------- URL 形态（可分享链接） ----------

/** 哈希路由：静态托管（Pages）没有重写规则，所以不用路径路由。
 *  id 用契约里的稳定 id，不用标题，链接不会因为改标题失效。 */
export const ROUTES = {
  index: '#/',
  poem: (id) => `#/p/${encodeURIComponent(id)}`,
  poemPattern: /^\/p\/(.+)$/,
};
