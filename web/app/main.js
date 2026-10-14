// 应用入口。
//
// 流程（用户 2026-10-14 拍板）：
//   1. 外壳（HTML/JS/CSS）一到就先渲染框架与状态面板，并如实显示「正在取内容…」；
//   2. 内容（content.json）**单独取**，取到后渲染目录/诗页；取不到就显示失败原因，不是白屏；
//   3. 「内容更新」= 「站点更新」：由 Service Worker 的更新生命周期负责（见 sw.js）。
//      新版本装好后停在 waiting，**不自动刷新**，只提示「有新版本」；
//      用户点「刷新」立即生效，或在阅读时先继续读、回到目录时自动切换。
//      —— 代价（README 里也写明）：不自动刷新意味着用户可能长时间停在旧版本。

import {
  ContentError, SUPPORTED_FORMAT_VERSION, loadContent,
} from './content.js';
import { APP_VERSION, ROUTES, resourceCacheName } from './config.js';
import {
  productOrderStatus, renderIndex, renderPoemPage, renderSearchResults,
} from './render.js';

const els = {
  view: document.getElementById('view'),
  notices: document.getElementById('notices'),
  status: document.getElementById('status'),
  search: document.getElementById('search-input'),
  searchForm: document.getElementById('search-form'),
  appVersion: document.getElementById('app-version'),
};

export { APP_VERSION };

const state = {
  doc: null,
  meta: null,
  loading: false,
  error: null,          // {kind, message, hint}
  query: '',
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
    cache: null,        // {appVersion, cacheName, entries, hasContent}
    waitingVersion: null,
  },
  update: { available: false, applying: false },
  persist: null,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ERROR_HINTS = {
  network: '首次访问必须联网；联网后重试即可。已经缓存过本站的浏览器离线也能读。',
  http: '可能是这次部署里没有 content.json（路径不对），也可能是离线且本站缓存里缺了它（例如刚清除过站点数据）。',
  json: '内容文件损坏或被截断，可能没有下载完整。可以重试一次。',
  schema: '内容结构不符合契约，可能是编译产物有问题。',
  incompatible: '内容与壳不是同一次部署的产物（应当一起发布），已按不兼容处理。',
  unknown: '未预期的错误，详见原因。',
};

// ---------------------------------------------------------------- 基础工具

function fmtTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false });
  } catch {
    return iso;
  }
}

function fmtBytes(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

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

function parseHash() {
  const hash = location.hash.replace(/^#/, '');
  const m = ROUTES.poemPattern.exec(hash);
  if (m) return { kind: 'poem', id: decodeURIComponent(m[1]) };
  return { kind: 'index', id: null };
}

function navigate(hash) {
  if (location.hash === hash) {
    state.view = parseHash();
    render();
  } else {
    location.hash = hash;
  }
  maybeApplyUpdateOnIndex();
}

/** 回到目录（不是诗页）时，若已有待生效的新版本，就切换（刷新）。 */
function maybeApplyUpdateOnIndex() {
  if (!state.update.available || state.update.applying) return;
  if (state.view.kind === 'poem' && state.query.trim() === '') return; // 还在阅读：不打断
  applyUpdate('回到目录后自动生效');
}

// ---------------------------------------------------------------- 渲染

function renderView() {
  els.view.replaceChildren();

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

  const onOpen = (id) => { state.query = ''; els.search.value = ''; navigate(ROUTES.poem(id)); };
  if (state.query.trim() !== '') {
    els.view.append(renderSearchResults(state.doc, state.query, { onOpen }));
  } else if (state.view.kind === 'poem') {
    els.view.append(renderPoemPage(state.doc, state.view.id, { onBack: () => navigate(ROUTES.index) }));
  } else {
    els.view.append(renderIndex(state.doc, { onOpen }));
  }
}

function renderNotices() {
  els.notices.replaceChildren();

  const doc = state.doc;
  if (doc && (doc.placeholder === true || doc.fixture === true)) {
    const isFixtureVariant = doc.fixture === true;
    els.notices.append(h('div', { class: 'notice notice--warn', dataset: { test: 'fixture-notice' } }, [
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
    els.notices.append(h('div', { class: 'notice notice--info', dataset: { test: 'update-available' } }, [
      h('span', {
        dataset: { test: 'update-available-text' },
        text: `站点有新版本${next ? `（应用资源 v${next}，当前 v${APP_VERSION}）` : ''}`
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

function renderStatus() {
  els.status.replaceChildren();
  const doc = state.doc;
  const meta = state.meta;
  const cache = state.sw.cache;
  const rows = [];
  const row = (k, v, test) => rows.push([k, v, test]);

  row('站点资源版本', `v${APP_VERSION}`, 'status-app-version');
  if (state.sw.supported && state.sw.secure) {
    row('站点缓存', state.sw.registered
      ? (cache ? `${cache.cacheName}（${cache.entries.length} 个条目${cache.hasContent ? '，含 content.json' : '，缺 content.json'}）` : '正在读取…')
      : 'Service Worker 未注册', 'status-site-cache');
    row('Service Worker', state.sw.error
      ? `注册失败：${state.sw.error}`
      : `${state.sw.controlled ? '已接管本页' : '未接管本页'}${state.update.available ? ' · 有新版本在等待' : ''}`,
    'status-sw');
  } else {
    row('站点缓存', state.sw.supported ? '不可用：需要 https 或 localhost' : '不可用：浏览器不支持 Service Worker', 'status-site-cache');
  }
  // 内容版本只是展示：Web 的更新决策由站点/SW 负责，不比对 contentVersion。
  row('内容版本（仅展示）', doc ? `v${doc.contentVersion}` : '（尚未取到）', 'status-content-version');
  if (meta) {
    row('内容体积 / 诗数', `${fmtBytes(meta.bytes)} / ${meta.poemCount} 首 / ${meta.dynastyCount} 个分组`, 'status-content-size');
    row('内容生成时间', fmtTime(meta.generatedAt), 'status-content-generated');
    row('内容取到时间', fmtTime(meta.loadedAt), 'status-content-loaded');
  }
  row('内容格式版本', doc ? `${doc.formatVersion}（本站壳支持 ${SUPPORTED_FORMAT_VERSION}）` : '—', 'status-format-version');
  if (doc) {
    const os = productOrderStatus(doc);
    row('组内次序', os.productOrderAuthoritative
      ? `照产物数组次序（编译期是唯一排序权威；${os.usable} 首带 orderInSource）`
      : `本机拼音兜底（产物未给 orderInSource${os.wrongType ? '，现有值类型不对' : ''}）`,
    'status-order-mode');
  }
  row('网络', state.online ? '浏览器报告：在线' : '浏览器报告：离线', 'status-network');
  row('持久化存储', state.persist
    ? (state.persist.granted ? '浏览器已授予' : '未授予（浏览器可能自动回收）')
      + ` · 已用 ${fmtBytes(state.persist.usage)} / 配额 ${fmtBytes(state.persist.quota)}`
    : '未知', 'status-persist');

  const dl = h('dl', { class: 'status-list' });
  for (const [k, v, test] of rows) {
    dl.append(h('dt', { text: k }));
    dl.append(h('dd', { dataset: { test }, text: v }));
  }
  els.status.append(dl);

  const actions = h('div', { class: 'status-actions' });
  actions.append(h('button', {
    type: 'button', class: 'btn btn--primary', dataset: { test: 'check-site-update' },
    text: '检查站点更新', onclick: () => checkForSiteUpdate(),
  }));
  actions.append(h('button', {
    type: 'button', class: 'btn', dataset: { test: 'persist-storage' },
    text: '请求持久化存储',
    onclick: async () => {
      try {
        const granted = await navigator.storage.persist();
        await refreshPersist();
        setNotice('info', granted
          ? '浏览器已授予持久化存储：降低被自动回收的可能，但仍不构成永久存储承诺。'
          : '浏览器未授予持久化存储：离线副本可能被浏览器自动回收。');
      } catch (err) {
        setNotice('warn', `请求持久化存储失败：${err.message}`);
      }
    },
  }));
  if (doc) {
    actions.append(h('button', {
      type: 'button', class: 'btn', dataset: { test: 'reload-content' },
      text: '重新取内容', onclick: () => loadContentIntoState(),
    }));
  }
  els.status.append(actions);

  els.status.append(h('p', { class: 'status-honest', dataset: { test: 'honest-storage-note' },
    text: '诚实说明：首次访问需要网络；此后外壳与内容一起由 Service Worker 存在本站缓存里，'
      + '用户「清除站点数据」或浏览器回收存储都可能让它丢失，离线副本不承诺永久保存。'
      + '本站**不会自动刷新**：发现新版本只给提示，长时间不点刷新就会一直停在旧版本；'
      + '点提示里的「刷新」（或在诗页时先回目录）才会整套换成新版本。'
      + 'Service Worker 只在 https 或 localhost 下可用（file:// 打开无法离线）。' }));
}

function renderChrome() {
  els.appVersion.textContent = `站点资源版本 ${APP_VERSION}`;
  renderNotices();
  renderStatus();
}

function render() {
  renderView();
  renderChrome();
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

  // 问 waiting 的 worker 要它的站点版本，好在提示里写明。
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
  for (let i = 0; i < 80 && !done; i += 1) {
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
    setNotice('info', `已是最新站点版本（应用资源 v${APP_VERSION}）。`);
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

els.searchForm.addEventListener('submit', (e) => {
  e.preventDefault();
  state.query = els.search.value;
  render();
});
els.search.addEventListener('input', () => {
  state.query = els.search.value;
  if (state.query.trim() !== '' && state.view.kind === 'poem') state.view = { kind: 'index', id: null };
  render();
});
window.addEventListener('hashchange', () => {
  state.view = parseHash();
  render();
  maybeApplyUpdateOnIndex();
});
window.addEventListener('online', () => { state.online = true; renderChrome(); });
window.addEventListener('offline', () => { state.online = false; renderChrome(); });

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
  setQuery(q) { state.query = q; els.search.value = q; render(); },
  summary() {
    return {
      ready: window.__app.ready,
      appVersion: APP_VERSION,
      loading: state.loading,
      hasDoc: Boolean(state.doc),
      contentVersion: state.doc?.contentVersion ?? null,
      poems: state.doc ? state.doc.poems.length : 0,
      dynasties: state.doc ? state.doc.dynasties.map((d) => d.key) : [],
      formatVersion: state.doc?.formatVersion ?? null,
      error: state.error,
      view: state.view,
      query: state.query,
      online: state.online,
      sw: {
        supported: state.sw.supported,
        registered: state.sw.registered,
        controlled: state.sw.controlled,
        error: state.sw.error,
        waitingVersion: state.sw.waitingVersion,
        cache: state.sw.cache,
      },
      update: state.update,
      persist: state.persist,
      expectedCacheName: resourceCacheName(),
    };
  },
};

const readyPromise = boot().catch((err) => {
  state.error = { kind: 'unknown', message: `启动失败：${err.message}`, hint: ERROR_HINTS.unknown };
  render();
}).finally(() => { window.__app.ready = true; });

window.__appReady = readyPromise;
