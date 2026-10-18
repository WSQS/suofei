// 应用入口。
//
// 流程（用户 2026-10-14 拍板）：
//   1. 外壳（HTML/JS/CSS）一到就先渲染框架与加载状态，并如实显示「正在取内容…」；
//   2. 内容（content.json）**单独取**，取到后渲染目录/诗页；取不到就显示失败原因，不是白屏；
//   3. 「内容更新」= 「站点更新」：由 Service Worker 的更新生命周期负责（见 sw.js）。
//      新版本装好后停在 waiting，**不自动刷新**，只提示「有新版本」；
//      用户点「刷新」立即生效，或在阅读时先继续读、回到目录时自动切换。
//      —— 代价（README 里也写明）：不自动刷新意味着用户可能长时间停在旧版本。

import {
  ContentError, SUPPORTED_FORMAT_VERSION, loadContent,
} from './content.js';
import { APP_VERSION, CONTENT_REVISION, ROUTES, resourceCacheName } from './config.js';
import {
  productOrderStatus, relayoutPoemBody, renderAboutPage, renderDetailPage, renderIndex, renderPoemPage,
} from './render.js';

const els = {
  view: document.getElementById('view'),
  notices: document.getElementById('notices'),
};

export { APP_VERSION };

const state = {
  doc: null,
  meta: null,
  loading: false,
  error: null,          // {kind, message, hint}
  view: { kind: 'index', id: null },
  online: navigator.onLine,
  notice: null,         // {kind, text, action}
  sw: {
    supported: 'serviceWorker' in navigator,
    secure: window.isSecureContext,
    registration: null,
    registered: false,
    controlled: false,
    error: null,
    cache: null,        // {appVersion, contentRevision, cacheName, entries, hasContent}
    waitingVersion: null,
    waitingRevision: null,
  },
  update: { available: false, applying: false },
  persist: null,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 目录页的两种分组视图（用户 2026-10-18 采纳：「朝代 ｜ 标签」两个 tab）。
 *  **各自**记住展开状态与滚动位置；返回链回的是**进入诗页的那个原视图**。 */
const LIST_KINDS = ['index', 'tags'];
const isListKind = (kind) => kind === 'index' || kind === 'tags';
const routeOfListKind = (kind) => (kind === 'tags' ? ROUTES.tags : ROUTES.index);
const labelOfListKind = (kind) => (kind === 'tags' ? '标签' : '目录');

/** 展开状态：**按 tab 分开**（朝代组 / 标签组的 key 空间也可能撞，所以不共用一张表）。
 *  存在会话里而不是 DOM 里：从诗页返回时重新渲染，展开状态不能丢
 *  ——否则 IF-45「返回恢复原滚动位置」会因为内容高度突然变矮而失效。 */
const expandedByKind = { index: new Set(), tags: new Set() };

/** 每个目录视图各自的滚动位置（用户 2026-10-18：两个 tab 各自保滚动）。 */
const listScroll = { index: { y: 0, restore: false }, tags: { y: 0, restore: false } };

/** **进入下钻页之前的那个目录视图**（诗的「返回」回它；深链接默认朝代 tab）。 */
let lastListKind = 'index';

/** 列宽口径（用户 2026-10-15/16 选定，采纳锚 round-2026-10-16-width-pct）：
 *  `C = min(V, max(320, 0.88 × (V − 24)))`，`24` 是**一次性扣除总量**（不是左右各 12）。
 *  这里用 JS 算成 `--c` 写进根元素（CSS 里那份是 JS 未跑时的兜底）；
 *  `V` 取 **`window.innerWidth`＝视口宽**（与原型量测口径一致）。
 *  ⚠ 刻意**不用** `documentElement.clientWidth`：那个值会在页面长到出现滚动条时变小，
 *    导致列宽随“是否需要滚动条”而跳（且与原型口径不同）。 */
function applyColumnWidth() {
  const v = window.innerWidth;
  const c = Math.min(v, Math.max(320, 0.88 * (v - 24)));
  document.documentElement.style.setProperty('--c', `${c}px`);
}

/** 视口变化：先重算列宽，再重算当前诗页的视觉折行（纯重排）。 */
function onViewportResize() {
  applyColumnWidth();
  relayoutPoemBody();
}

const ERROR_HINTS = {
  network: '首次访问必须联网；联网后重试即可。已经缓存过本站的浏览器离线也能读。',
  http: '可能是这次部署里没有 content.json（路径不对），也可能是离线且本站缓存里缺了它（例如刚清除过站点数据）。',
  json: '内容文件损坏或被截断，可能没有下载完整。可以重试一次。',
  schema: '内容结构不符合契约，可能是编译产物有问题。',
  incompatible: '内容与壳不是同一次部署的产物（应当一起发布），已按不兼容处理。',
  unknown: '未预期的错误，详见原因。',
};

// ---------------------------------------------------------------- 基础工具

const h = (tag, props = {}, children = []) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'text') el.textContent = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
};

function setNotice(kind, text, action = null) {
  state.notice = text ? { kind, text, action } : null;
  renderChrome();
}

// ---------------------------------------------------------------- 路由

/**
 * 目录的临时滚动位置（用户 2026-10-15 定 `IF-45`）：
 *   从诗页返回目录时落回刚才的位置；**深链接直开目录仍从顶部**。
 * 做法：离开目录前把 `scrollY` 记下来并置 `restore`；再回到目录时恢复一次。
 * 新开文档（深链接/刷新）时 `restore` 初值为 false ⇒ 从顶部开始。
 * ⚠ 2026-10-18：位置**按目录视图（朝代/标签）分开**记（`listScroll`），切 tab 也各自保持。
 */
function parseHashString(hash) {
  const bare = String(hash).replace(/^#/, '');
  // 详情页必须**先**匹配：否则 `/p/<id>/detail` 会被 poemPattern 当成 id 为 `<id>/detail`。
  const d = ROUTES.detailPattern.exec(bare);
  if (d) return { kind: 'detail', id: decodeURIComponent(d[1]) };
  const p = ROUTES.poemPattern.exec(bare);
  if (p) return { kind: 'poem', id: decodeURIComponent(p[1]) };
  if (ROUTES.aboutPattern.test(bare)) return { kind: 'about', id: null };
  if (ROUTES.tagsPattern.test(bare)) return { kind: 'tags', id: null };
  return { kind: 'index', id: null };
}

function parseHash() {
  return parseHashString(location.hash);
}

/** 离开目录视图前记下位置（只有「从目录去别的视图」才记，同一视图内不动它）。
 *  切 tab 也算离开：朝代 → 标签时会记下朝代的滚动，再切回来就恢复（用户 2026-10-18）。 */
function captureLeavingList(nextHash) {
  const kind = state.view.kind;
  if (!isListKind(kind)) return;
  const next = parseHashString(nextHash);
  if (next.kind === kind) return;
  listScroll[kind].y = window.scrollY || 0;
  listScroll[kind].restore = true;
}

/** 视图切完后调：目录视图按需恢复位置（没记过就从顶部开始）；非目录页从顶部开始
 *  （不要带着上一页的滚动量）。 */
function afterViewChange() {
  const kind = state.view.kind;
  if (isListKind(kind)) {
    const mem = listScroll[kind];
    if (!mem.restore) { window.scrollTo(0, 0); return; }
    mem.restore = false;
    const y = mem.y;
    // 等新目录完成布局再滚，否则位置会被上一次的布局带偏。
    // ⚠ 2026-10-16 修：原来只等**一帧**；当时页脚诊断面板的 DOM 写入恰好把布局顶完，所以看起来是对的。
    //   面板移除后，短目录在第一个 rAF 里**还没完成布局** ⇒ `scrollTo(0, y)` 被夹到 0，
    //   表现为「从诗页返回目录不恢复位置」（e2e 实测：捕获 373、回来却 0）。⇒ 等**两帧**，第二帧布局已定。
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y)));
    return;
  }
  window.scrollTo(0, 0);
}

function navigate(hash) {
  captureLeavingList(hash);
  if (location.hash === hash) {
    state.view = parseHashString(hash);
    render();
    afterViewChange();
  } else {
    location.hash = hash;   // hashchange 会负责 render + afterViewChange
  }
  maybeApplyUpdateOnIndex();
}

/** 回到目录（不是诗页/详情页）时，若已有待生效的新版本，就切换（刷新）。
 *  **两个目录视图都算目录**（朝代 / 标签）：在标签视图里阅读完也算回到目录。 */
function maybeApplyUpdateOnIndex() {
  if (!state.update.available || state.update.applying) return;
  if (!isListKind(state.view.kind)) return; // 还在阅读（诗页/详情/关于）：不打断
  applyUpdate('回到目录后自动生效');
}

// ---------------------------------------------------------------- 渲染

function renderView() {
  els.view.replaceChildren();
  // ⚠ 2026-10-16：**全局外壳顶栏已整块删除**（原先是 sticky「索斐 ＋ 站点资源版本」那条）。
  //  采纳锚：目录页顶部**只有「关于」**、不重复应用名（`round-2026-10-15-hub-align/`；Android 也无此栏）；
  //  诗页/详情页各有返回工具栏；关于页自带应用名页标题 ⇒ 三页上它都是冗余产品壳。
  //  于是原来那句「关于页把顶栏 hidden」也随之删掉——**已没有东西可藏**。

  if (state.error) {
    els.view.append(h('div', { class: 'view view--error', dataset: { test: 'view-error' } }, [
      h('h1', { class: 'poem-title', text: '内容没能取到' }),
      h('p', { class: 'empty-state', dataset: { test: 'error-text' }, text: state.error.message }),
      h('p', { class: 'view-hint', dataset: { test: 'error-hint' }, text: state.error.hint }),
      h('button', {
        type: 'button', class: 'btn btn--primary', dataset: { test: 'retry-load' },
        text: '重试取内容', onclick: () => loadContentIntoState(),
      }),
    ]));
    return;
  }

  if (!state.doc) {
    els.view.append(h('p', {
      class: 'view-hint', dataset: { test: 'view-loading' },
      text: state.loading ? '正在取内容…（外壳已经到达，内容单独取）' : '等待取内容…',
    }));
    return;
  }

  const onOpen = (id) => navigate(ROUTES.poem(id));
  if (isListKind(state.view.kind)) {
    // 记下「现在停在哪个目录视图」：下锼页的「返回」回它（用户 2026-10-18 采纳的返回链）。
    lastListKind = state.view.kind;
    const kind = state.view.kind;
    els.view.append(renderIndex(state.doc, {
      activeTab: kind === 'tags' ? 'tags' : 'dynasty',
      onOpen,
      onAbout: () => navigate(ROUTES.about),
      // tab 切换 = **路由切换**（不是内存状态）：深链接/刷新/浏览器后退都对得上。
      onSelectTab: (tab) => navigate(tab === 'tags' ? ROUTES.tags : ROUTES.index),
      isExpanded: (key) => expandedByKind[kind].has(key),
      onToggle: (key, open) => {
        const set = expandedByKind[kind];
        if (open) set.add(key); else set.delete(key);
      },
    }));
    return;
  }
  if (state.view.kind === 'poem') {
    els.view.append(renderPoemPage(state.doc, state.view.id, {
      // 诗页「返回」⇒ **进入它的原视图**（朝代 tab / 标签 tab），不跳层（用户 2026-10-18）。
      onBack: () => navigate(routeOfListKind(lastListKind)),
      onDetail: () => navigate(ROUTES.detail(state.view.id)),
      backHref: routeOfListKind(lastListKind),
      backLabel: `← ${labelOfListKind(lastListKind)}`,
    }));
  } else if (state.view.kind === 'detail') {
    // 详情页的「返回」落到**那首诗**（不是目录）；深链接直开也一样（用户 2026-10-15 定）。
    els.view.append(renderDetailPage(state.doc, state.view.id, {
      onBack: () => navigate(ROUTES.poem(state.view.id)),
    }));
  } else if (state.view.kind === 'about') {
    els.view.append(renderAboutPage({
      appVersion: APP_VERSION,
      doc: state.doc,
      // 关于页的「返回」回到**从哪个目录视图进来的**（同样是「不跳掉用户刚才的位置」）。
      onBack: () => navigate(routeOfListKind(lastListKind)),
      backHref: routeOfListKind(lastListKind),
      backLabel: `← ${labelOfListKind(lastListKind)}`,
    }));
  }
}

/** 一条给用户看的「这一版是什么」的描述：应用版本 ＋ 内容修订。
 *
 * 为何两者都写（2026-10-16）：内容可以**不升应用版本**单独发一次（缓存名带修订），
 * 那时只说「应用资源 v0.1.3 → v0.1.3」会让人以为没更新 —— 要让提示**说明内容修订**。
 * 修订取不到时只写应用版本（不编造）。 */
function versionLabel(appVersion, contentRevision) {
  const app = appVersion ? `应用资源 v${appVersion}` : '应用资源版本未知';
  return contentRevision ? `${app}，内容 ${contentRevision}` : app;
}

function renderNotices() {
  els.notices.replaceChildren();

  const doc = state.doc;
  if (doc && (doc.placeholder === true || doc.fixture === true)) {
    const isFixtureVariant = doc.fixture === true;
    els.notices.append(h('div', { class: 'notice notice--fixture', dataset: { test: 'fixture-notice' } }, [
      h('strong', { text: isFixtureVariant ? '测试夹具内容：' : '占位夹具内容：' }),
      h('span', {
        dataset: { test: 'fixture-notice-text' },
        text: isFixtureVariant
          ? (doc.fixtureNotice || '由测试部署派生、含人为增删改，不是发布内容。')
          : (doc.placeholderNotice || '非校对文本，仅用于开发与验证。'),
      }),
    ]));
  }

  if (state.update.available) {
    const next = state.sw.waitingVersion;
    const nextRevision = state.sw.waitingRevision;
    els.notices.append(h('div', { class: 'notice notice--info', dataset: { test: 'update-available' } }, [
      h('span', {
        dataset: { test: 'update-available-text' },
        text: `站点有新版本${next ? `（${versionLabel(next, nextRevision)}，当前 ${versionLabel(APP_VERSION, CONTENT_REVISION)}）` : ''}`
          + '已经下载完成并等待生效。为了不打断阅读，本站不会自动刷新：'
          + '点「刷新」立即改用新版本；在诗页阅读时可以先继续读，回到目录后会自动生效。',
      }),
      h('button', {
        type: 'button', class: 'btn', dataset: { test: 'apply-update' },
        text: '刷新到新版本', onclick: () => applyUpdate('用户点了刷新'),
      }),
    ]));
  }

  if (state.notice) {
    const node = h('div', {
      class: `notice notice--${state.notice.kind}`,
      dataset: { test: 'notice', noticeKind: state.notice.kind },
    }, [h('span', { text: state.notice.text })]);
    if (state.notice.action) {
      node.append(h('button', {
        type: 'button', class: 'btn', text: state.notice.action.label,
        onclick: state.notice.action.run,
      }));
    }
    els.notices.append(node);
  }
}

/**
 * 刷新**通知区**（加载/失败/有新版本/夹具提示都在这里）。
 *
 * ⚠ 2026-10-16：**页脚诊断面板已从产品 UI 移除**（用户实际预览时看到「站点资源版本/缓存名/SW/
 * 内容体积与时间/格式/次序/网络/配额」整块＋三个调试动作＋长诚实说明，问为什么还在）。
 * 那整块是 Web 骨架期的开发/核验脚手架，**不属于已采纳的四页规格**（`IF-46`：只有目录/诗/详情/关于）。
 * 现在：产品里**没有**面板、**没有**调试动作、**没有**页脚版本；版本只在「关于」页（已选）。
 * **机制一个没删**：SW 离线缓存、后台更新检测、「有新版本→点刷新」必要提示、加载/失败可见反馈都照旧；
 * 诊断事实仍可从 `window.__app.summary()`（测试钩子，非产品 UI）读到。
 */
function renderChrome() {
  renderNotices();
}

function render() {
  renderView();
  renderChrome();
  // 诗页刚挂进 DOM，此时才算得出真实列宽 ⇒ 在这里做一次语义折行（挂前进 DOM 时 clientWidth = 0）。
  relayoutPoemBody();
}

// ---------------------------------------------------------------- 内容装载

async function loadContentIntoState() {
  state.loading = true;
  state.error = null;
  render();
  try {
    const { doc, meta } = await loadContent();
    state.doc = doc;
    state.meta = meta;
    state.error = null;
  } catch (err) {
    const kind = err instanceof ContentError ? err.kind : 'unknown';
    state.error = {
      kind,
      message: err.message || String(err),
      hint: ERROR_HINTS[kind] ?? ERROR_HINTS.unknown,
    };
  } finally {
    state.loading = false;
    render();
  }
}

// ---------------------------------------------------------------- Service Worker

const WORKER_REPLY_TIMEOUT = 3000;

/** 向某个 worker 要它的缓存报告（active 或 waiting 都可以问）。 */
function askWorker(worker) {
  return new Promise((resolve) => {
    if (!worker) return resolve(null);
    const timer = setTimeout(() => resolve(null), WORKER_REPLY_TIMEOUT);
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      resolve(event.data ?? null);
    };
    worker.postMessage({ type: 'CACHE_STATUS' }, [channel.port2]);
    return undefined;
  });
}

function markUpdateAvailable(reg, worker = null) {
  if (state.update.available) return;
  state.update.available = true;
  state.sw.registration = reg;
  render();

  // 问 waiting 的 worker 要它的站点版本与内容修订，好在提示里写明。
  // 两个坑：① 刚装好的那一瞬，注册对象上可能还没体现为 waiting（所以把 worker 本身也带进来）；
  // ② 绝不能退回去问 active —— 那时 active 还是**旧**的，会把旧版本当成新版本写进提示。
  const target = () => {
    if (reg.waiting) return reg.waiting;
    if (worker && worker.state === 'installed') return worker;
    return null;
  };
  (async () => {
    for (let i = 0; i < 6 && !state.sw.waitingVersion; i += 1) {
      const report = await askWorker(target());
      if (report?.appVersion) {
        state.sw.waitingVersion = report.appVersion;
        // 修订可能读不到（旧 SW 没这个字段）—— 读不到就不写，不编造。
        state.sw.waitingRevision = report.contentRevision ?? null;
        renderChrome();
        return;
      }
      await sleep(300);
    }
  })();
}

/** 切换到新版本：让 waiting 的 SW 接管，然后在 controller 真的换了之后刷新。
 *  兜底用轮询而不是固定延时 —— 固定延时可能在旧 SW 还在控制时就刷新，
 *  那样页面会带着旧壳重新打开（实测过这种抖动）。 */
async function applyUpdate(how) {
  if (state.update.applying) return;
  state.update.applying = true;
  setNotice('info', `正在切换到新版本（${how}）…`);

  const reg = state.sw.registration;
  const controllerBefore = navigator.serviceWorker.controller;
  if (!reg?.waiting && !reg?.installing) {
    // 没有在等/在装的 worker：新版本可能已经生效，直接刷新即可。
    location.reload();
    return;
  }

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    location.reload();
  };
  navigator.serviceWorker.addEventListener('controllerchange', finish, { once: true });
  reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
  // 等 controller 真的换掉再刷新。超时给得宽一点（重载时机器可能很忙）；
  // 最坏情况也只是先刷回去、提示再出现一次，不会把新旧版本混在一起。
  for (let i = 0; i < 120 && !done; i += 1) {
    await sleep(100);
    if (navigator.serviceWorker.controller && navigator.serviceWorker.controller !== controllerBefore) break;
  }
  finish();
}

/** 手动检查站点更新：让浏览器去要比一次 sw.js。 */
async function checkForSiteUpdate() {
  const reg = state.sw.registration;
  if (!reg) {
    setNotice('warn', state.sw.supported
      ? '这个页面没有 Service Worker 在控制（需要 https 或 localhost），无法检查站点更新。'
      : '浏览器不支持 Service Worker，无法检查站点更新。');
    return;
  }
  setNotice('info', '正在检查站点更新…');
  try {
    await reg.update();
  } catch (err) {
    setNotice('warn', `检查站点更新失败：${err.message}（离线时这正是预期行为）`);
    return;
  }
  for (let i = 0; i < 20 && !state.update.available; i += 1) {
    if (reg.waiting || reg.installing) break;
    await sleep(100);
  }
  await sleep(200);
  if (state.update.available) {
    setNotice('info', '发现新版本，见上方提示：点「刷新」立即生效。');
  } else {
    setNotice('info', `已是最新站点版本（${versionLabel(APP_VERSION, CONTENT_REVISION)}）。`);
  }
}

async function setupServiceWorker() {
  if (!state.sw.supported || !state.sw.secure) {
    renderChrome();
    return;
  }
  try {
    // updateViaCache:'none' —— 每次都直接向服务器要比 sw.js，不让 HTTP 缓存把新版本挡住。
    const reg = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
    state.sw.registration = reg;
    state.sw.registered = true;
    state.sw.error = null;

    if (reg.waiting && navigator.serviceWorker.controller) markUpdateAvailable(reg);

    reg.addEventListener('updatefound', () => {
      const fresh = reg.installing;
      if (!fresh) return;
      fresh.addEventListener('statechange', () => {
        // installed + 已有旧 SW 在控制 = 新版本在等（不要抢在首次安装时误报）
        if (fresh.state === 'installed' && navigator.serviceWorker.controller) markUpdateAvailable(reg, fresh);
      });
    });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      const wasControlled = state.sw.controlled;
      state.sw.controlled = true;
      state.sw.cache = null;
      renderChrome();
      askWorker(reg.active).then((report) => {
        state.sw.cache = report;
        renderChrome();
      });
      // 首次安装时也会 claim（那时并没有「新版接管」这回事），所以只在本已被旧 SW 控制时提示。
      if (!state.update.applying && wasControlled) {
        setNotice('info', '站点资源已在后台更新并接管，刷新后生效。', {
          label: '刷新', run: () => location.reload(),
        });
      }
    });

    await navigator.serviceWorker.ready;
    state.sw.controlled = Boolean(navigator.serviceWorker.controller);
    state.sw.cache = await askWorker(reg.active);
  } catch (err) {
    state.sw.registered = false;
    state.sw.error = err.message;
  }
  renderChrome();
}

async function refreshPersist() {
  try {
    const granted = await navigator.storage.persisted();
    const est = await navigator.storage.estimate();
    state.persist = { granted, usage: est.usage, quota: est.quota };
  } catch {
    state.persist = null;
  }
  renderChrome();
}

// ---------------------------------------------------------------- 启动

async function boot() {
  applyColumnWidth();
  state.view = parseHash();
  state.loading = true;
  render();                       // 外壳 + 「正在取内容…」先出来，不被内容阻塞
  await Promise.allSettled([
    loadContentIntoState(),       // 内容**单独取**
    setupServiceWorker(),         // 站点更新交给 SW 生命周期
  ]);
  refreshPersist();
}

// ---------------------------------------------------------------- 事件

window.addEventListener('hashchange', () => {
  // hashchange 可能来自站内点击，也可能来自地址栏直改 / 浏览器前进后退。
  // 此刻 state.view 仍是**旧**视图 —— 正好用来判断「是不是刚离开哪个目录视图」。
  captureLeavingList(location.hash);
  state.view = parseHash();
  render();
  afterViewChange();
  maybeApplyUpdateOnIndex();
});
window.addEventListener('online', () => { state.online = true; renderChrome(); });
window.addEventListener('offline', () => { state.online = false; renderChrome(); });
// 视口变化：列宽与语义折行都要重算（字号/行高/字距不随宽度变，只重排列）。
let resizeScheduled = false;
window.addEventListener('resize', () => {
  if (resizeScheduled) return;
  resizeScheduled = true;
  requestAnimationFrame(() => { resizeScheduled = false; onViewportResize(); });
});

// 测试钩子：给无头浏览器断言用（不影响正常阅读）。
window.__app = {
  APP_VERSION,
  state,
  ready: false,
  render,
  navigate,
  loadContentIntoState,
  checkForSiteUpdate,
  applyUpdate,
  summary() {
    return {
      ready: window.__app.ready,
      appVersion: APP_VERSION,
      loading: state.loading,
      hasDoc: Boolean(state.doc),
      contentVersion: state.doc?.contentVersion ?? null,
      poems: state.doc ? state.doc.poems.length : 0,
      dynasties: state.doc ? state.doc.dynasties : [],
      formatVersion: state.doc?.formatVersion ?? null,
      error: state.error,
      view: state.view,
      /** 进入下锼页之前的目录视图（'index' 朝代 / 'tags' 标签）—— 诗页「返回」回它。 */
      lastListKind,
      expanded: { index: [...expandedByKind.index], tags: [...expandedByKind.tags] },
      online: state.online,
      sw: {
        supported: state.sw.supported,
        registered: state.sw.registered,
        controlled: state.sw.controlled,
        error: state.sw.error,
        waitingVersion: state.sw.waitingVersion,
        waitingRevision: state.sw.waitingRevision,
        cache: state.sw.cache,
      },
      // 内部诊断（**不进产品 UI**）：页脚面板去掉后，测试仍要能核这些事实。
      meta: state.meta,
      orderMode: state.doc ? productOrderStatus(state.doc) : null,
      supportedFormatVersion: SUPPORTED_FORMAT_VERSION,
      update: state.update,
      persist: state.persist,
      contentRevision: CONTENT_REVISION,
      expectedCacheName: resourceCacheName(),
    };
  },
};

const readyPromise = boot().catch((err) => {
  state.error = { kind: 'unknown', message: `启动失败：${err.message}`, hint: ERROR_HINTS.unknown };
  render();
}).finally(() => { window.__app.ready = true; });

window.__appReady = readyPromise;
