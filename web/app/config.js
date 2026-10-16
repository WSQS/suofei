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

/**
 * 「关于」页的共享字段集（用户 2026-10-15 定：页面集合＝目录／诗／诗歌详情／关于）。
 *
 * **唯一来源＝`web/about-fields.json`**（机器可读，两端同一批字段；跨端一致性靠它）。
 * 这里写一份**运行时副本**（静态站点运行期读不到那个文件）——两边**逐字一致**，
 * 由 e2e 读文件比对（不一致就报红并打出两边内容）；Android 端同样对着那个文件比（`AboutFields`）。
 * 字段的**值**是平台相关的（Web 的版本号是站点资源版本，Android 的是 APK 版本），
 * 本副本只钉「同一批字段」。
 *
 * ⚠ 2026-10-16 按采纳锚对齐为 **4 项**（用户 `q-9f9eca3d`：应用名／应用版本／内容版本／仓库链接）：
 * 删掉未采纳的「一句话说明」与「诚实的限制」，
 * 标签「内容版本与来源」收成「内容版本」（A3 已去掉共用信息里的「来源：」），并补上「仓库链接」。
 * ⚠ 2026-10-16 再改：页脚诊断面板整块从产品 UI 移除（含那段长诚实说明）⇒ 这里**不再导出**
 * `HONEST_STORAGE_NOTE`；那段诚实措辞现在只在 [`web/README.md`](../README.md) §4.5 与
 * 加载/失败提示的必要上下文里（产品页面上不再有长限制说明 —— 用户已选「关于页简洁、无长限制」）。
 */
export const ABOUT = {
  appName: '索斐',
  repoUrl: 'https://github.com/WSQS/suofei',
  fields: ['应用名', '应用版本', '内容版本', '仓库链接'],
};

/**
 * Web 端的「诚实限制」原文——
 * ⚠ 2026-10-16：**已从产品 UI 移除**（页脚诊断面板不属于已采纳的四页规格）。
 * 下面这段是那段措辞的原文，现只作为文档引用保存在 [`web/README.md`](../README.md) §4.5；
 * 产品页面上只剩加载/失败提示里的必要上下文（首次访问需联网、离线且缓存缺内容等）。
 *
 * 原文（不再导出、不再渲染）：
 * 诚实说明：首次访问需要网络；此后外壳与内容一起由 Service Worker 存在本站缓存里，
 * 用户「清除站点数据」或浏览器回收存储都可能让它丢失，离线副本不承诺永久保存。
 * 本站「不会自动刷新」：发现新版本只给提示，长时间不点刷新就会一直停在旧版本；
 * 点提示里的「刷新」（或在诗页时先回目录）才会整套换成新版本。
 * Service Worker 只在 https 或 localhost 下可用（file:// 打开无法离线）。
 */

/** 站点（应用资源）版本：唯一的版本键，站点缓存与更新生命周期都跟着它走。
 *  发布新站点（含新内容）时递增它。 */
export const APP_VERSION = '0.1.3';

/** 内容文档地址：**单独取**（不内联进 HTML/JS）——
 *  这样外壳一到就能先渲染框架并如实显示「正在取内容／失败原因」，
 *  内联则坏网时没有可显示的中间状态、失败即白屏。 */
export const CONTENT_URL = 'content.json';

/** 站点缓存：Cache Storage 名字前缀 + 站点版本。 */
export const RESOURCE_CACHE_PREFIX = 'pc-resources-';
export const resourceCacheName = (appVersion = APP_VERSION) => `${RESOURCE_CACHE_PREFIX}${appVersion}`;

/** 本客户端能解析的内容 JSON 结构版本。内容与壳一起发布，所以不匹配属于**部署问题**：
 *  仍然如实报错、不渲染，并说明原因。
 *  **1 → 2（不可逆，用户 2026-10-15 拍板「字段集一变就升」）**：
 *    - 顶层 `dynasties` 由 `[{key,label,order}]` 改为**有序中文值数组**（`['汉', …]`）；
 *    - 每首诗 10 键：`id,title,author,dynasty,genre,source,orderInSource,detail,stanzas,notes`
 *      （`dynasty` 单值；`detail`＝一段最小 Markdown 文本；`variants`/`era` 不再发布）。
 *  ⇒ 本壳**只认 2**：低版本内容（老产物）会被如实拒绝（老客户端也会拒绝新内容——这正是升版的代价）。 */
export const SUPPORTED_FORMAT_VERSION = 2;

/** 本版本**不使用** localStorage（所以没有键空间依赖）；也不用 IndexedDB。 */
export const LOCAL_STORAGE_KEYS = {};

// ---------- URL 形态（可分享链接） ----------

/** 哈希路由：静态托管（Pages）没有重写规则，所以不用路径路由。
 *  id 用契约里的稳定 id，不用标题，链接不会因为改标题失效。 */
export const ROUTES = {
  index: '#/',
  poem: (id) => `#/p/${encodeURIComponent(id)}`,
  /** 诗歌详情页（第四页，用户 2026-10-15 定，见 `docs/interface-decisions.md` IF-47）。
   *  **分层语义**：`#/p/<id>/detail` ＝ 这首诗的详情（考据与来源），深链接可直达。 */
  detail: (id) => `#/p/${encodeURIComponent(id)}/detail`,
  /** 「关于」页（原「更新页」改名；两端都有、内容一致，只有 Android 多一块「更新」）。 */
  about: '#/about',
  /** 诗页：id 里不含 `/`（否则会与详情页的 `/detail` 后缀相撞）——所以模式里排除 `/`。 */
  poemPattern: /^\/p\/([^/]+)$/,
  /** 详情页：必须**先**于 poemPattern 匹配，否则 `/p/<id>/detail` 会被当成 id 为 `<id>/detail`。 */
  detailPattern: /^\/p\/([^/]+)\/detail$/,
  aboutPattern: /^\/about$/,
};
