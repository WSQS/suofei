// 内容获取 / 校验 / 版本比较 / 切换决策。
//
// 契约要点（docs/design/content-contract.md）：
//  - 两端只读 dist/content.json（部署到静态托管后就是 web 根下的 content.json）。
//  - formatVersion 是结构版本；更高 = 旧客户端必须「保留旧内容、不去解析」。
//  - contentVersion 单调递增，用于更新比较。
//  - 完整下载 + 校验通过才切换；失败/损坏/不兼容 → 保留旧版。
//  - 本模块**不**碰 Cache Storage；内容的读写都走 store.js（IndexedDB）。

import { CHECKSUM_URL, CONTENT_URL, SUPPORTED_FORMAT_VERSION } from './config.js';

/** 本版本客户端能解析的结构版本（见 app/config.js）。 */
export { SUPPORTED_FORMAT_VERSION, CONTENT_URL, CHECKSUM_URL };

/** 更新检查的三种结论。 */
export const DECISION = {
  FIRST: 'first',                 // 本地没有内容，首次取得
  ACCEPT: 'accept',               // 新版可切换
  UP_TO_DATE: 'up-to-date',       // 本地已是同版或更新
  REFUSE_FORMAT: 'refuse-format', // formatVersion 不兼容 → 保留旧内容
};

/** contentVersion 比较：按 '.' 分段、逐段数值比较，非数值段退化为字符串比较。
 *
 * 契约 §4 说「按 ISO 日期前缀＋递增序号的字典序比较」，但纯字典序会把
 * `2026.10.14.10` 判成小于 `2026.10.14.2`。这里实现的是单调的逐段数值比较
 * （对契约给出的例子 `2026.10.14.1 → 2026.10.14.2` 结果一致），
 * 需要写回契约 §4 才会成为两端共同规则 —— 见 web/README.md 的「待协调」。
 * 返回 >0 表示 a 更新。
 */
export function compareContentVersion(a, b) {
  if (a === b) return 0;
  const as = String(a ?? '').split('.');
  const bs = String(b ?? '').split('.');
  const n = Math.max(as.length, bs.length);
  for (let i = 0; i < n; i += 1) {
    const x = as[i];
    const y = bs[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const xn = /^\d+$/.test(x);
    const yn = /^\d+$/.test(y);
    if (xn && yn) {
      const d = Number(x) - Number(y);
      if (d !== 0) return d > 0 ? 1 : -1;
    } else if (x !== y) {
      return x > y ? 1 : -1;
    }
  }
  return 0;
}

const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v) => typeof v === 'number' && Number.isInteger(v);

/**
 * 结构校验（客户端侧）。与契约 §3 的编译期校验对应，但这里是「收到别人产出的
 * JSON 时要自己再把一道关」：任何一条不满足都判定内容不可用 → 保留旧版。
 * @returns {{ok: boolean, errors: string[]}}
 */
export function validateContent(doc) {
  const errors = [];
  if (!isPlainObject(doc)) {
    return { ok: false, errors: ['根节点不是 JSON 对象'] };
  }
  if (!isInt(doc.formatVersion)) errors.push('formatVersion 缺失或不是整数');
  if (typeof doc.contentVersion !== 'string' || doc.contentVersion.trim() === '') {
    errors.push('contentVersion 缺失或为空');
  }
  if (!Array.isArray(doc.dynasties)) {
    errors.push('dynasties 不是数组');
  }
  if (!Array.isArray(doc.poems) || doc.poems.length === 0) {
    errors.push('poems 不是数组或为空');
  }
  if (errors.length) return { ok: false, errors };

  const dynastyKeys = new Set();
  doc.dynasties.forEach((d, i) => {
    if (!isPlainObject(d) || typeof d.key !== 'string' || !d.key) {
      errors.push(`dynasties[${i}].key 缺失`);
      return;
    }
    if (!isInt(d.order)) errors.push(`dynasties[${i}].order 不是整数`);
    dynastyKeys.add(d.key);
  });

  const ids = new Set();
  doc.poems.forEach((p, i) => {
    const at = `poems[${i}]`;
    if (!isPlainObject(p)) { errors.push(`${at} 不是对象`); return; }
    for (const key of ['id', 'title', 'author', 'dynastyKey', 'dynastyLabel']) {
      if (typeof p[key] !== 'string' || p[key] === '') errors.push(`${at}.${key} 缺失或为空`);
    }
    if (!isInt(p.dynastyOrder)) errors.push(`${at}.dynastyOrder 不是整数`);
    if (p.id) {
      if (ids.has(p.id)) errors.push(`${at}.id 重复：${p.id}`);
      ids.add(p.id);
    }
    if (p.dynastyKey && !dynastyKeys.has(p.dynastyKey)) {
      errors.push(`${at}.dynastyKey 未在 dynasties 中声明：${p.dynastyKey}`);
    }
    if (!Array.isArray(p.stanzas) || p.stanzas.length === 0) {
      errors.push(`${at}.stanzas 不是数组或为空`);
    } else {
      const lines = p.stanzas.flat();
      if (lines.length === 0) errors.push(`${at}.stanzas 全空`);
      p.stanzas.forEach((stanza, si) => {
        if (!Array.isArray(stanza) || stanza.length === 0) {
          errors.push(`${at}.stanzas[${si}] 不是非空数组`);
          return;
        }
        stanza.forEach((line, li) => {
          if (typeof line !== 'string' || line === '') {
            errors.push(`${at}.stanzas[${si}][${li}] 不是非空字符串`);
          }
        });
      });
    }
    if (p.notes !== null && typeof p.notes !== 'string') {
      errors.push(`${at}.notes 既不是 null 也不是字符串`);
    }
  });

  return { ok: errors.length === 0, errors };
}

async function sha256Hex(text) {
  if (!globalThis.crypto?.subtle) {
    throw new Error('当前环境没有 crypto.subtle（需要 https 或 localhost）');
  }
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class ContentError extends Error {
  constructor(kind, message, detail) {
    super(message);
    this.name = 'ContentError';
    this.kind = kind;      // network | http | json | checksum | schema
    this.detail = detail;
  }
}

/**
 * 完整下载 + 校验。任何一步失败都抛 ContentError，**不写任何存储**。
 * @param {{bustCache?: boolean}} opts
 * @returns {Promise<{doc: object, meta: object}>}
 */
export async function fetchAndValidateContent({ bustCache = true } = {}) {
  const q = bustCache ? `?t=${Date.now()}` : '';
  let text;
  try {
    const res = await fetch(`${CONTENT_URL}${q}`, { cache: 'no-store' });
    if (!res.ok) throw new ContentError('http', `内容请求返回 HTTP ${res.status}`);
    text = await res.text();
  } catch (err) {
    if (err instanceof ContentError) throw err;
    throw new ContentError('network', `内容下载失败：${err.message}`, err);
  }

  const sha256 = await sha256Hex(text);
  // 校验和文件是可选的边车（契约 v0 没有该字段）。有就强制核对，没有就退化为
  // 「本机自算哈希 + 结构校验」，并把降级事实记进 meta，不假装做过校验和比对。
  let expected = null;
  try {
    const res = await fetch(`${CHECKSUM_URL}${q}`, { cache: 'no-store' });
    if (res.ok) {
      const raw = (await res.text()).trim().split(/\s+/)[0].toLowerCase();
      if (/^[0-9a-f]{64}$/.test(raw)) expected = raw;
    }
  } catch { /* 边车不存在或取不到：不是失败，只是少了强校验 */ }

  if (expected !== null && expected !== sha256) {
    throw new ContentError('checksum', '内容校验和不匹配（文件可能损坏或被截断）',
      { expected, actual: sha256 });
  }

  let doc;
  try {
    doc = JSON.parse(text);
  } catch (err) {
    throw new ContentError('json', `内容不是合法 JSON：${err.message}`, err);
  }

  const { ok, errors } = validateContent(doc);
  if (!ok) {
    throw new ContentError('schema', `内容结构校验失败（${errors.length} 项）`, errors);
  }

  const meta = {
    contentVersion: doc.contentVersion,
    formatVersion: doc.formatVersion,
    sha256,
    integrity: expected ? 'sha256-sidecar+自算' : 'sha256-自算(无边车)',
    bytes: new TextEncoder().encode(text).length,
    fetchedAt: new Date().toISOString(),
    placeholder: doc.placeholder === true,
  };
  return { doc, meta };
}

/**
 * 纯函数：拿「本地 active 元信息」和「新下载到的内容」判断该怎么办。
 * 不做任何副作用，方便自测与阅读。
 */
export function decideUpdate(active, incomingDoc) {
  if (!active) return { action: DECISION.FIRST, reason: '本地没有内容副本' };
  if (!isInt(incomingDoc?.formatVersion)) {
    return { action: DECISION.REFUSE_FORMAT, reason: 'formatVersion 不是整数' };
  }
  if (incomingDoc.formatVersion > SUPPORTED_FORMAT_VERSION) {
    return {
      action: DECISION.REFUSE_FORMAT,
      reason: `内容格式版本 ${incomingDoc.formatVersion} 高于本应用支持的 ${SUPPORTED_FORMAT_VERSION}，不解析`,
    };
  }
  if (incomingDoc.formatVersion < SUPPORTED_FORMAT_VERSION) {
    return {
      action: DECISION.REFUSE_FORMAT,
      reason: `内容格式版本 ${incomingDoc.formatVersion} 低于本应用支持的 ${SUPPORTED_FORMAT_VERSION}，不处理`,
    };
  }
  const cmp = compareContentVersion(incomingDoc.contentVersion, active.contentVersion);
  if (cmp > 0) {
    return {
      action: DECISION.ACCEPT,
      reason: `${active.contentVersion} → ${incomingDoc.contentVersion}`,
    };
  }
  return {
    action: DECISION.UP_TO_DATE,
    reason: cmp === 0 ? '本地已是同一版本' : '远端版本不比本地新',
  };
}
