// 应用入口：内容装载、路由、更新检查与「下载校验通过才切换」。
//
// 更新语义（与 Android 端语义一致，机制各自实现）：
//  1. 打开时自动检查一次 + 手动「检查内容更新」入口；
//  2. 只接受「完整下载 + 校验通过」的内容，校验不过绝不写存储；
//  3. 阅读中（诗页打开着）不突然替换：新版先落到 staged，提示后等回到目录
//     或用户点「立即切换」再原子替换；
//  4. 失败 / 损坏 / formatVersion 更高不兼容 → 保留旧版并如实提示；
//  5. 新版可删改：切换是按整份文档替换，不做累积合并。

import {
  ContentError, DECISION,
  decideUpdate, fetchAndValidateContent,
} from './content.js';
import { APP_VERSION, ROUTES, SUPPORTED_FORMAT_VERSION } from './config.js';
import { ContentStore } from './store.js';
import {
  hasProductSortKeys, productSortKeysStatus, renderIndex, renderPoemPage, renderSearchResults,
} from './render.js';

const store = new ContentStore();

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
  activeMeta: null,
  staged: null,        // {doc, meta} 已下载校验通过、尚未生效的新版
  query: '',
  view: { kind: 'index', id: null },
  online: navigator.onLine,
  lastCheck: null,     // {at, result, detail}
  notice: null,        // {kind, text, action}
  sw: { supported: 'serviceWorker' in navigator, secure: window.isSecureContext, registered: false, error: null, cache: null },
  persist: null,       // {granted, usage, quota}
  fatal: null,
};

const nowIso = () => new Date().toISOString();

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
  maybeApplyStaged();
}

/** 阅读中不替换：只要离开诗页（回到目录/发起搜索），已暂存的新版就自动生效。 */
async function maybeApplyStaged() {
  if (!state.staged) return;
  if (state.view.kind === 'poem' && state.query.trim() === '') return;
  await applyStaged('回到目录后自动生效');
}

// ---------------------------------------------------------------- 渲染

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

function renderView() {
  els.view.replaceChildren();
  if (state.fatal) {
    els.view.append(h('div', { class: 'view view--fatal', dataset: { test: 'view-fatal' } }, [
      h('h1', { class: 'poem-title', text: '内容不可用' }),
      h('p', { class: 'empty-state', dataset: { test: 'fatal-text' }, text: state.fatal }),
      h('p', { class: 'view-hint', text: '首次访问需要网络以取得内容；取得之后即可离线阅读。' }),
    ]));
    return;
  }
  if (!state.doc) {
    els.view.append(h('p', { class: 'view-hint', dataset: { test: 'view-loading' }, text: '正在装载内容…' }));
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
  // 占位夹具 / 测试夹具都要在界面上明说，不能让人把它当发布内容。
  // 真实产物（tools/build-content.mjs 产出）没有这两个标记，所以不会出黄条。
  if (doc && (doc.placeholder === true || doc.fixture === true)) {
    const isFixtureVariant = doc.fixture === true;
    els.notices.append(h('div', { class: 'notice notice--warn', dataset: { test: 'fixture-notice' } }, [
      h('strong', { text: isFixtureVariant ? '测试夹具内容：' : '占位夹具内容：' }),
      h('span', {
        dataset: { test: 'fixture-notice-text' },
        text: isFixtureVariant
          ? (doc.fixtureNotice || '由测试从产物派生、含人为增删改，不是发布内容。')
          : (doc.placeholderNotice || '非校对文本，仅用于开发与验证。'),
      }),
    ]));
  }
  if (state.staged) {
    const btn = h('button', {
      type: 'button', class: 'btn', dataset: { test: 'apply-staged' },
      text: '立即切换到新内容',
      onclick: () => applyStaged('用户手动切换'),
    });
    const node = h('div', { class: 'notice notice--info', dataset: { test: 'update-staged' } }, [
      h('span', {
        dataset: { test: 'update-staged-text' },
        text: `新内容 ${state.staged.meta.contentVersion} 已下载并通过校验，因为正在阅读，先不替换；回到目录后自动生效。`,
      }),
      btn,
    ]);
    els.notices.append(node);
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
  const meta = state.activeMeta;
  const cache = state.sw.cache;
  const rows = [];
  const row = (k, v, test) => rows.push([k, v, test]);

  row('内容版本', doc ? `v${doc.contentVersion}` : '（无）', 'status-content-version');
  row('内容格式版本', doc ? `${doc.formatVersion}（本应用支持 ${SUPPORTED_FORMAT_VERSION}）` : '—', 'status-format-version');
  if (meta) {
    row('完整性', `${meta.integrity} · ${fmtBytes(meta.bytes)}`, 'status-integrity');
    row('离线副本存入时间', fmtTime(meta.fetchedAt || meta.promotedAt), 'status-stored-at');
  }
  row('内容离线存储', meta ? 'IndexedDB（poetry-web）' : '尚无', 'status-content-store');
  if (doc) {
    // 把「组内次序由谁决定」写出来：产物次序是权威，本机拼音只是兜底，且不静默。
    const ks = productSortKeysStatus(doc);
    row('组内次序', ks.productOrderAuthoritative
      ? '照产物数组次序（编译期是唯一排序权威）'
      : `本机拼音兜底（产物未给整数排序键${ks.wrongType ? '，现有键类型不对' : ''}）`,
    'status-order-mode');
  }
  if (state.sw.supported && state.sw.secure) {
    row('应用资源缓存', state.sw.registered
      ? (cache ? `${cache.cacheName}（${cache.entries.length} 个条目）` : '正在读取…')
      : 'Service Worker 未注册', 'status-resource-cache');
  } else {
    row('应用资源缓存', state.sw.supported ? '不可用：需要 https 或 localhost' : '不可用：浏览器不支持 Service Worker', 'status-resource-cache');
  }
  row('网络', state.online ? '浏览器报告：在线' : '浏览器报告：离线', 'status-network');
  row('上次检查更新', state.lastCheck
    ? `${fmtTime(state.lastCheck.at)} · ${state.lastCheck.result}${state.lastCheck.detail ? ` · ${state.lastCheck.detail}` : ''}`
    : '本次会话尚未检查', 'status-last-check');
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
    type: 'button', class: 'btn btn--primary', dataset: { test: 'check-update' },
    text: '检查内容更新', onclick: () => checkForUpdate({ manual: true }),
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
  if (state.staged) {
    actions.append(h('button', {
      type: 'button', class: 'btn', dataset: { test: 'check-update-status' },
      text: `待切换版本 v${state.staged.meta.contentVersion}`,
      disabled: true,
    }));
  }
  els.status.append(actions);

  els.status.append(h('p', { class: 'status-honest', dataset: { test: 'honest-storage-note' },
    text: '诚实说明：首次访问需要网络；此后应用资源由 Service Worker 缓存、内容另存于 IndexedDB，'
      + '两者都可能在用户「清除站点数据」或浏览器回收存储时丢失，离线副本不承诺永久保存。'
      + 'Service Worker 只在 https 或 localhost 下可用（file:// 打开无法离线）。' }));
}

function renderChrome() {
  els.appVersion.textContent = `应用资源版本 ${APP_VERSION}`;
  renderNotices();
  renderStatus();
}

function render() {
  renderView();
  renderChrome();
}

// ---------------------------------------------------------------- 内容装载与切换

async function loadLocal() {
  const [active, staged] = await Promise.all([store.get('active'), store.get('staged')]);
  if (active) {
    state.doc = active.doc;
    state.activeMeta = active.meta;
  }
  if (staged) state.staged = { doc: staged.doc, meta: staged.meta };
  return { active, staged };
}

async function applyStaged(how) {
  const row = await store.promoteStaged();
  if (!row) { state.staged = null; render(); return null; }
  state.doc = row.doc;
  state.activeMeta = row.meta;
  state.staged = null;
  setNotice('info', `已切换到内容 v${row.meta.contentVersion}（${how}）。`);
  render();
  return row;
}

/**
 * 一次完整的更新检查。返回结构化结果，便于自测与报告。
 * 关键：任何失败路径都不写存储，因此 active 永远是旧版。
 */
export async function checkForUpdate({ manual = false } = {}) {
  const at = nowIso();
  const finish = (result, detail) => {
    state.checkCount = (state.checkCount || 0) + 1;
    state.lastCheck = { at, result, detail };
    renderChrome();
    return { result, detail };
  };

  let incoming;
  try {
    incoming = await fetchAndValidateContent();
  } catch (err) {
    const detail = err instanceof ContentError ? err.message : `检查失败：${err.message}`;
    if (manual) setNotice('warn', `${detail}；仍使用本地 v${state.doc?.contentVersion ?? '（无）'}。`);
    return finish('失败（保留本地版本）', detail);
  }

  const decision = decideUpdate(state.activeMeta, incoming.doc);

  if (decision.action === DECISION.FIRST) {
    await store.putActive(incoming);
    state.doc = incoming.doc;
    state.activeMeta = incoming.meta;
    state.fatal = null;
    render();
    if (manual) setNotice('info', `已取得内容 v${incoming.meta.contentVersion}。`);
    return finish('已取得内容', decision.reason);
  }

  if (decision.action === DECISION.REFUSE_FORMAT) {
    await store.dropStaged();
    state.staged = null;
    setNotice('warn', `${decision.reason}；已保留当前内容 v${state.activeMeta.contentVersion}。`);
    return finish('拒绝（格式版本不兼容，保留旧版）', decision.reason);
  }

  if (decision.action === DECISION.UP_TO_DATE) {
    if (manual) setNotice('info', `已是最新内容 v${state.activeMeta.contentVersion}。`);
    return finish('已是最新', decision.reason);
  }

  // ACCEPT：先落 staged（完整下载 + 校验通过才写），再决定是否立即切换。
  if (state.view.kind === 'poem' && state.query.trim() === '') {
    // 阅读中：不突然替换。提示由 renderNotices 的 staged 横幅负责（含「立即切换」按钮），
    // 这里不重复再发一条 notice。
    await store.putStaged(incoming);
    state.staged = { doc: incoming.doc, meta: incoming.meta };
    renderChrome();
    return finish('已下载，待切换（阅读中）', decision.reason);
  }

  await store.putStaged(incoming);
  await applyStaged('打开时/在目录中自动切换');
  setNotice('info', `内容已更新到 v${incoming.meta.contentVersion}。`);
  return finish('已更新并切换', decision.reason);
}

// ---------------------------------------------------------------- Service Worker

const CACHE_STATUS_TIMEOUT = 3000;

function askSwForCacheReport(reg) {
  return new Promise((resolve) => {
    const worker = reg.active || reg.waiting || reg.installing;
    if (!worker) return resolve(null);
    const timer = setTimeout(() => resolve(null), CACHE_STATUS_TIMEOUT);
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      resolve(event.data ?? null);
    };
    worker.postMessage({ type: 'CACHE_STATUS' }, [channel.port2]);
    return undefined;
  });
}

async function setupServiceWorker() {
  if (!state.sw.supported || !state.sw.secure) {
    renderChrome();
    return;
  }
  try {
    const reg = await navigator.serviceWorker.register('sw.js');
    state.sw.registered = true;
    state.sw.error = null;
    await navigator.serviceWorker.ready;
    state.sw.cache = await askSwForCacheReport(reg);
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      setNotice('info', '应用资源缓存已更新，刷新页面后生效。', {
        label: '刷新', run: () => location.reload(),
      });
    });
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
  await loadLocal();

  if (!state.doc) {
    // 首次访问：必须联网取一份完整内容。
    const res = await checkForUpdate({ manual: false });
    if (res.result === '失败（保留本地版本）') {
      state.fatal = `首次访问需要网络下载内容，但下载失败：${res.detail}`;
    }
  } else {
    render();
    // 打开时自动检查更新（不阻塞首屏：先用本地副本渲染）。
    checkForUpdate({ manual: false });
  }

  if (state.staged && state.view.kind !== 'poem') {
    // 上次留下的待切换版本，且这次不是直接进阅读页 → 直接生效。
    await applyStaged('打开时生效上次已暂存的新版');
  } else if (state.staged) {
    setNotice('info', `待切换版本 v${state.staged.meta.contentVersion} 已就绪，回到目录后自动生效。`);
  }
  render();

  setupServiceWorker();
  refreshPersist();
}

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
  maybeApplyStaged();
});
window.addEventListener('online', () => { state.online = true; renderChrome(); });
window.addEventListener('offline', () => { state.online = false; renderChrome(); });

// 测试钩子：给无头浏览器断言用（不影响正常阅读）。
window.__app = {
  APP_VERSION,
  state,
  ready: false,
  checkForUpdate,
  applyStaged,
  render,
  navigate,
  setQuery(q) { state.query = q; els.search.value = q; render(); },
  /** 测试用：模拟「用户清除站点数据」前先放开 IndexedDB 连接，否则 deleteDatabase 会被阻塞。 */
  closeContentStore() { try { store._db?.close(); store._db = null; } catch { /* ignore */ } },
  summary() {
    return {
      ready: window.__app.ready,
      contentVersion: state.doc?.contentVersion ?? null,
      poems: state.doc?.poems.length ?? 0,
      formatVersion: state.doc?.formatVersion ?? null,
      integrity: state.activeMeta?.integrity ?? null,
      stagedVersion: state.staged?.meta.contentVersion ?? null,
      view: state.view,
      query: state.query,
      online: state.online,
      lastCheck: state.lastCheck,
      checkCount: state.checkCount || 0,
      sw: state.sw,
      persist: state.persist,
      fatal: state.fatal,
    };
  },
};

const readyPromise = boot()
  .catch((err) => {
    state.fatal = `启动失败：${err.message}`;
    render();
  })
  .finally(() => { window.__app.ready = true; });

window.__appReady = readyPromise;
