// IndexedDB 封装：内容离线副本的**独立存储**。
//
// 为什么不用 Cache Storage 存内容：契约第 4 节要求「资源缓存 vs 内容存储」分开，
// 两者不得混用一个版本号。Cache Storage 的条目按请求 URL 归档，天然适合「应用资源」；
// 内容的版本与完整性是本应用自己的语义，放进独立的 IndexedDB 库，切换引用时才写。
//
// 库名/存储名/键名是接口常量，集中在 app/config.js。
//
// 事务保证：切换 = 一个 readwrite 事务内 put(active) + delete(staged)。
// IndexedDB 事务要么整体提交要么整体回滚，所以任何时刻读到的 active
// 只可能是「旧版」或「新版」，不存在半成品。

import { CONTENT_DB } from './config.js';

const DB_NAME = CONTENT_DB.name;
const DB_VERSION = CONTENT_DB.version;
const STORE = CONTENT_DB.store;
const ACTIVE = CONTENT_DB.activeKey;
const STAGED = CONTENT_DB.stagedKey;

/** 打开（必要时建库）。 */
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'k' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    let out;
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('transaction aborted'));
    try {
      out = fn(t.objectStore(STORE));
    } catch (err) {
      try { t.abort(); } catch { /* 已经 abort */ }
      reject(err);
    }
  });
}

const req2p = (r) => new Promise((resolve, reject) => {
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});

/** 内容离线副本。 */
export class ContentStore {
  constructor() { this._db = null; }

  async open() {
    if (!this._db) this._db = await openDb();
    return this;
  }

  /** 读取一条记录（active / staged）。 */
  async get(k) {
    await this.open();
    return tx(this._db, 'readonly', (s) => req2p(s.get(k)));
  }

  /** 完整写入待切换内容（staged），供之后切换或丢弃。 */
  async putStaged(record) {
    await this.open();
    const row = { k: STAGED, ...record };
    await tx(this._db, 'readwrite', (s) => s.put(row));
    return row;
  }

  /** 原子切换：active ← staged，并在同一事务内清掉 staged。 */
  async promoteStaged() {
    await this.open();
    const row = await this.get(STAGED);
    if (!row) return null;
    const { k, ...rest } = row;
    const active = { k: ACTIVE, ...rest, promotedAt: new Date().toISOString() };
    await tx(this._db, 'readwrite', (s) => {
      s.put(active);
      s.delete(STAGED);
    });
    return active;
  }

  /** 直接写入 active（首访/首次取得内容时用；不经过 staged）。 */
  async putActive(record) {
    await this.open();
    const row = { k: ACTIVE, ...record, promotedAt: new Date().toISOString() };
    await tx(this._db, 'readwrite', (s) => s.put(row));
    return row;
  }

  /** 丢弃 staged（校验失败/不兼容时用，不动 active）。 */
  async dropStaged() {
    await this.open();
    await tx(this._db, 'readwrite', (s) => s.delete(STAGED));
  }
}
