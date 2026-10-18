// 内容装载：**单独取** + 结构校验 + 格式版本兼容检查。
//
// 这里**不做**更新决策（用户 2026-10-14 拍板）：
//   Web 的内容与壳是同一次部署一起换的，所以「内容更新」= 「站点更新」，
//   由 Service Worker 负责（见 sw.js）。本模块只负责：
//     取一份 content.json → 校验它是不是能渲染 → 交给渲染层。
//   不再比对远端 contentVersion、不用 IndexedDB 暂存、不依赖 sha256 边车。
//
// 失败要如实说清是哪一步失败（网络不可达 / HTTP 状态 / JSON 解析 / 结构校验 / 格式版本不兼容），
// 界面据此显示原因，而不是白屏。

import { CONTENT_URL, SUPPORTED_FORMAT_VERSION } from './config.js';

export { SUPPORTED_FORMAT_VERSION, CONTENT_URL };

/** 取内容时的失败分类。界面按 kind 给出不同的提示与建议。 */
export class ContentError extends Error {
  constructor(kind, message, detail) {
    super(message);
    this.name = 'ContentError';
    this.kind = kind;      // network | http | json | schema | incompatible
    this.detail = detail;
  }
}

const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v) => typeof v === 'number' && Number.isInteger(v);

/**
 * 结构校验（客户端侧）。与契约 §3 的编译期校验对应：这里是「收到别人产出的 JSON
 * 时要自己再把一道关」。任何一条不满足都判定内容不可用 → 界面如实报错。
 *
 * **本函数只认 `formatVersion: 3` 的形状**（见 `config.js` 的 SUPPORTED_FORMAT_VERSION）：
 *  - 顶层 `dynasties` ＝**有序中文值数组**；组名**精确匹配**（`poem.dynasty === dynasties[i]`，
 *    不做 trim、不做别名、不做大小写折叠——与编译期 `tools/lib/dynasties.mjs` 同一口径）；
 *  - 顶层 `tags` ＝**有序数组** `[{ id, members: [poemId…] }]`（`id` 即中文显示名，编译期已按拼音排好；
 *    `members` 已按 `orderInTag` 升序）⇒ 客户端照这个顺序渲染，不重排；
 *  - 每首 11 键：`id,title,author,dynasty,genre,source,orderInSource,detail,stanzas,notes,tags`
 *    （缺值以 `null` 保键；`tags` 是 `[{ id, orderInTag }]`，可为 `[]`）。
 *  ⚠ 字段名是 `id`（与 `schema/content.schema.json` 的 `poems[].tags[].id` 逐项一致），**不是** `tagId`
 *    ——这层名字对不上就会把整份内容判成坏内容；两端同名同义。
 *
 * 附加的**相容性**判据（不是「形状」而是「指得上吗」）：诗的 `tags[].id` 必须在顶层 `tags` 里声明；
 * `members` 里的 id 必须指向真实存在的诗。两向都查，因为两种引用都能让界面画出一组**指不上的东西**。
 * **不拒绝未知键**（多出来的字段不影响渲染，拒绝它们只会让同一次部署因为无关理由变砖）。
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
  } else {
    doc.dynasties.forEach((d, i) => {
      if (typeof d !== 'string' || d === '') {
        errors.push(`dynasties[${i}] 不是非空字符串（本版 dynasties 是**有序中文值数组**）`);
      }
    });
  }
  if (!Array.isArray(doc.poems) || doc.poems.length === 0) {
    errors.push('poems 不是数组或为空');
  }
  // 顶层 tags：**有序数组**（顺序即渲染顺序，客户端不重排）。零成员的标签是**合法数据**
  // （只是不渲染），所以这里不把 `members: []` 当错误。
  const declaredTagIds = [];
  if (!Array.isArray(doc.tags)) {
    errors.push('tags 不是数组（formatVersion 3 的必填键）');
  } else {
    doc.tags.forEach((t, i) => {
      const at = `tags[${i}]`;
      if (!isPlainObject(t)) { errors.push(`${at} 不是对象`); return; }
      if (typeof t.id !== 'string' || t.id === '') { errors.push(`${at}.id 缺失或为空`); }
      else if (declaredTagIds.includes(t.id)) { errors.push(`${at}.id 重复：${t.id}`); }
      else { declaredTagIds.push(t.id); }
      if (!Array.isArray(t.members)) { errors.push(`${at}.members 不是数组`); return; }
      const seen = new Set();
      t.members.forEach((m, mi) => {
        if (typeof m !== 'string' || m === '') { errors.push(`${at}.members[${mi}] 不是非空字符串`); return; }
        if (seen.has(m)) errors.push(`${at}.members[${mi}] 重复：${m}`);
        seen.add(m);
      });
    });
  }
  if (errors.length) return { ok: false, errors };

  const dynastyValues = new Set(doc.dynasties);
  const ids = new Set();
  doc.poems.forEach((p, i) => {
    const at = `poems[${i}]`;
    if (!isPlainObject(p)) { errors.push(`${at} 不是对象`); return; }
    for (const key of ['id', 'title', 'dynasty']) {
      if (typeof p[key] !== 'string' || p[key] === '') errors.push(`${at}.${key} 缺失或为空`);
    }
    if (typeof p.author !== 'string') errors.push(`${at}.author 不是字符串`);
    for (const key of ['genre', 'source', 'detail', 'notes']) {
      if (p[key] !== null && p[key] !== undefined && typeof p[key] !== 'string') {
        errors.push(`${at}.${key} 既不是 null 也不是字符串`);
      }
    }
    if (p.orderInSource !== null && p.orderInSource !== undefined && !isInt(p.orderInSource)) {
      errors.push(`${at}.orderInSource 既不是 null 也不是整数`);
    }
    if (p.id) {
      if (ids.has(p.id)) errors.push(`${at}.id 重复：${p.id}`);
      ids.add(p.id);
    }
    if (typeof p.dynasty === 'string' && p.dynasty !== '' && !dynastyValues.has(p.dynasty)) {
      errors.push(`${at}.dynasty 未在顶层 dynasties 中声明（精确匹配）：${p.dynasty}`);
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
    // 每首的 tags：`[{ id, orderInTag }]`（与 `schema/content.schema.json` v3 逐项一致：字段名是 `id`，
    // 不是 `tagId`），可为 `[]`；`orderInTag` 是 **≥1 的整数**（数据侧口径，缺失/非整数是编译错误）。
    if (!Array.isArray(p.tags)) {
      errors.push(`${at}.tags 不是数组（formatVersion 3 的必填键，可为 []）`);
    } else {
      const seenTags = new Set();
      p.tags.forEach((t, ti) => {
        const tat = `${at}.tags[${ti}]`;
        if (!isPlainObject(t)) { errors.push(`${tat} 不是对象`); return; }
        if (typeof t.id !== 'string' || t.id === '') { errors.push(`${tat}.id 缺失或为空`); }
        else if (seenTags.has(t.id)) { errors.push(`${tat}.id 重复：${t.id}`); }
        else { seenTags.add(t.id); }
        if (!isInt(t.orderInTag)) errors.push(`${tat}.orderInTag 不是整数（必填，不可为 null）`);
      });
    }
  });

  // 引用闭合（两个方向都查）：
  //   ① 诗的 tags[].id 必须在顶层 tags 里声明 —— 否则那条归属无处可显示，等于悄悄丢数据；
  //   ② members 里的 id 必须指向真实存在的诗 —— 否则标签页会少一行，而且没人知道为什么。
  const declaredTagIdSet = new Set(declaredTagIds);
  doc.poems.forEach((p, i) => {
    for (const t of Array.isArray(p?.tags) ? p.tags : []) {
      if (isPlainObject(t) && typeof t.id === 'string' && t.id !== '' && !declaredTagIdSet.has(t.id)) {
        errors.push(`poems[${i}].tags.id 未在顶层 tags 中声明：${t.id}`);
      }
    }
  });
  if (Array.isArray(doc.tags)) {
    doc.tags.forEach((t, i) => {
      if (!isPlainObject(t) || !Array.isArray(t.members)) return;
      for (const m of t.members) {
        if (typeof m === 'string' && m !== '' && !ids.has(m)) {
          errors.push(`tags[${i}].members 指向不存在的诗：${m}`);
        }
      }
    });
  }

  return { ok: errors.length === 0, errors };
}

/**
 * 格式版本兼容检查。内容与壳一起发布，所以不匹配说明**这次部署本身是坏的**
 * （或者 HTTP/中间缓存给出了另一份产物）：如实报错、不渲染、不猜测。
 * @returns {{ok: true} | {ok: false, kind: 'incompatible', message: string}}
 */
export function checkCompatibility(doc) {
  const v = doc?.formatVersion;
  if (!isInt(v)) {
    return { ok: false, kind: 'incompatible', message: '内容里没有可用的 formatVersion' };
  }
  if (v > SUPPORTED_FORMAT_VERSION) {
    return {
      ok: false,
      kind: 'incompatible',
      message: `内容格式版本 ${v} 高于本站壳支持的 ${SUPPORTED_FORMAT_VERSION}：`
        + '这属于部署不一致（内容与壳应当一起发布），不解析这份内容',
    };
  }
  if (v < SUPPORTED_FORMAT_VERSION) {
    return {
      ok: false,
      kind: 'incompatible',
      message: `内容格式版本 ${v} 低于本站壳支持的 ${SUPPORTED_FORMAT_VERSION}：`
        + '这属于部署不一致（内容与壳应当一起发布），不处理这份内容',
    };
  }
  return { ok: true };
}

const utf8Size = (text) => new TextEncoder().encode(text).length;

/**
 * 取一份内容并校验。成功返回 {doc, meta}；失败抛 ContentError（带 kind 与可读原因）。
 * 注意：**不做任何更新决策、不写任何存储**。
 */
export async function loadContent() {
  let res;
  try {
    // no-cache：在线时向服务器确认一次（避免 HTTP 缓存给出上一次部署的 content.json）。
    // Service Worker 若已接管，会从**本站点缓存**里直接应答（与壳同一个版本）。
    res = await fetch(CONTENT_URL, { cache: 'no-cache' });
  } catch (err) {
    throw new ContentError('network',
      `取内容失败：网络不可达（离线，且本站缓存里还没有 content.json）——${err.message}`, err);
  }
  if (!res.ok) {
    throw new ContentError('http',
      `取内容失败：服务器返回 HTTP ${res.status} ${res.statusText}`
      + '（可能是这次部署里没有 content.json，也可能是离线且本站缓存里缺了它）', { status: res.status });
  }

  const text = await res.text();
  let doc;
  try {
    doc = JSON.parse(text);
  } catch (err) {
    throw new ContentError('json', `内容不是合法 JSON：${err.message}（${utf8Size(text)} 字节）`, err);
  }

  const { ok, errors } = validateContent(doc);
  if (!ok) {
    throw new ContentError('schema',
      `内容结构校验失败（${errors.length} 项）：${errors.slice(0, 3).join('；')}`
      + (errors.length > 3 ? `；…还有 ${errors.length - 3} 项` : ''), errors);
  }

  const compat = checkCompatibility(doc);
  if (!compat.ok) {
    throw new ContentError('incompatible', compat.message, doc.formatVersion);
  }

  return {
    doc,
    meta: {
      contentVersion: doc.contentVersion,
      formatVersion: doc.formatVersion,
      generatedAt: doc.generatedAt ?? null,
      bytes: utf8Size(text),
      poemCount: doc.poems.length,
      dynastyCount: doc.dynasties.length,
      loadedAt: new Date().toISOString(),
    },
  };
}
