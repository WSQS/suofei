// 契约线 C：YAML front matter 的**最小子集**解析器（无第三方依赖）。
//
// 为什么自己写：front matter 的字段是冻结的一小组（契约第 1 节），不引依赖可以
//   (a) 不引入依赖版本漂移与安装失败面；
//   (b) 自己掌控错误信息（每个语法问题都带文件与行号、稳定的错误码）；
//   (c) 关键：**不静默丢字段**。本解析器只接受下面明确列出的写法，遇到不认识的构造
//       直接报 YAML_UNSUPPORTED 并以非零退出码失败，而不是猜或忽略。
//
// 支持子集（已写回契约第 1 节「front matter 语法子集」）：
//   - 顶层 `key: value`，key 为 [A-Za-z][A-Za-z0-9_-]*；
//   - 标量：纯文本（可含中文与全角标点）、整数、小数、true/false、null/~/空；
//   - 引号标量：双引号（JSON 转义规则）/单引号（`''` 表示单引号）；
//   - 空数组字面量 `[]`；
//   - 缩进块序列：`- 标量` 或 `- key: value`（对象项，可跟同项内更多缩进行）；
//   - 缩进块映射（对象）；
//   - 块标量：`|` / `|-` / `|+`（保留换行）与 `>` / `>-` / `>+`（折行），
//     统一「去掉尾部空行、不额外补尾部换行」——不区分 chomping 指示符，这是刻意的简化；
//   - 整行注释 `# ...`（仅在行首、缩进任意）。
// 不支持（一律 YAML_UNSUPPORTED 报错）：行内 flow 集合（`{}`、`[a, b]`）、锚点/别名、标签、
// 多文档、tab 缩进、带 `#` 的行内注释（正文字符里可能有 `#`，静默截断比报错危险）。

import { ContentError } from './errors.mjs';

const KEY_RE = /^([A-Za-z][A-Za-z0-9_-]*):(?:[ \t]+(.*))?$/;
const BLOCK_SCALAR_RE = /^([|>])([+-]?)$/;

/**
 * 切出 front matter 与正文区。
 * @param {string} text 文件原文
 * @param {string} file 用于报错的展示路径
 */
export function splitFrontMatter(text, file) {
  let src = text;
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1); // 容忍 BOM
  const lines = src.split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l)); // 容忍 CRLF

  if ((lines[0] ?? '').trim() !== '---') {
    throw new ContentError('FRONT_MATTER_MISSING', '文件必须以 `---` 开头（YAML front matter 起始行）', {
      file,
      line: 1,
    });
  }

  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      end = i;
      break;
    }
  }
  if (end === -1) {
    throw new ContentError('FRONT_MATTER_UNTERMINATED', 'front matter 没有结束行 `---`', { file, line: 1 });
  }

  return {
    fmLines: lines.slice(1, end),
    fmLineOffset: 2, // fmLines[0] 对应文件第 2 行
    bodyLines: lines.slice(end + 1),
    bodyLineOffset: end + 2,
  };
}

class Scanner {
  constructor(lines, file, offset) {
    this.lines = lines;
    this.file = file;
    this.offset = offset;
    this.i = 0;
  }
  lineNo(idx) {
    return this.offset + (idx ?? this.i);
  }
  err(code, msg, idx) {
    return new ContentError(code, msg, { file: this.file, line: this.lineNo(idx) });
  }
  skipBlank() {
    while (this.i < this.lines.length && this.lines[this.i].trim() === '') this.i++;
  }
  indentOf(idx) {
    const l = this.lines[idx];
    return l.length - l.trimStart().length;
  }
}

/**
 * 解析 front matter 行。
 * @param {string[]} lines front matter 内部行（不含首尾 `---`）
 * @param {string} file
 * @param {number} offset lines[0] 在文件中的行号
 * @returns {Record<string, unknown>}
 */
export function parseFrontMatterLines(lines, file, offset) {
  const sc = new Scanner(lines, file, offset);
  const out = parseBlockMap(sc, 0);
  sc.skipBlank();
  if (sc.i < sc.lines.length) {
    throw sc.err('YAML_UNSUPPORTED', `front matter 有无法解析的剩余内容：${JSON.stringify(sc.lines[sc.i])}`);
  }
  return out;
}

function parseBlockMap(sc, indent) {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (;;) {
    sc.skipBlank();
    if (sc.i >= sc.lines.length) break;
    const raw = sc.lines[sc.i];
    const ind = sc.indentOf(sc.i);
    if (ind < indent) break;
    if (ind > indent) {
      throw sc.err('YAML_UNSUPPORTED', `意外缩进（这里应为 ${indent} 个空格）：${JSON.stringify(raw)}`);
    }
    const trimmed = raw.trim();
    if (trimmed.startsWith('#')) {
      sc.i++;
      continue;
    }
    const m = KEY_RE.exec(trimmed);
    if (!m) throw sc.err('YAML_UNSUPPORTED', `无法解析的行：${JSON.stringify(raw)}`);
    const key = m[1];
    if (Object.prototype.hasOwnProperty.call(out, key)) {
      throw sc.err('YAML_DUPLICATE_KEY', `front matter 里重复的键：${key}`);
    }
    const rest = (m[2] ?? '').trim();
    sc.i++;
    out[key] = readValue(sc, rest, indent);
  }
  return out;
}

function readValue(sc, rest, parentIndent) {
  if (rest === '' || rest === '~') {
    const save = sc.i;
    sc.skipBlank();
    if (sc.i >= sc.lines.length) {
      sc.i = save;
      return null;
    }
    const ind = sc.indentOf(sc.i);
    if (ind <= parentIndent) {
      sc.i = save;
      return null;
    }
    const t = sc.lines[sc.i].trim();
    if (t === '-' || t.startsWith('- ')) return parseBlockList(sc, ind);
    if (KEY_RE.test(t)) return parseBlockMap(sc, ind);
    throw sc.err('YAML_UNSUPPORTED', `无法解析的缩进块：${JSON.stringify(sc.lines[sc.i])}`);
  }
  if (BLOCK_SCALAR_RE.test(rest)) return readBlockScalar(sc, rest, parentIndent);
  return parseScalar(sc, rest, sc.i - 1);
}

function parseBlockList(sc, indent) {
  const out = [];
  for (;;) {
    sc.skipBlank();
    if (sc.i >= sc.lines.length) break;
    const raw = sc.lines[sc.i];
    const ind = sc.indentOf(sc.i);
    if (ind < indent) break;
    if (ind > indent) {
      throw sc.err('YAML_UNSUPPORTED', `列表项缩进不一致：${JSON.stringify(raw)}`);
    }
    const trimmed = raw.trim();
    if (!(trimmed === '-' || trimmed.startsWith('- '))) break;
    const itemText = trimmed === '-' ? '' : trimmed.slice(2).trim();
    const itemLine = sc.i;
    sc.i++;

    if (itemText === '') {
      const save = sc.i;
      sc.skipBlank();
      if (sc.i < sc.lines.length && sc.indentOf(sc.i) > indent) {
        const childIndent = sc.indentOf(sc.i);
        const t = sc.lines[sc.i].trim();
        if (t === '-' || t.startsWith('- ')) out.push(parseBlockList(sc, childIndent));
        else if (KEY_RE.test(t)) out.push(parseBlockMap(sc, childIndent));
        else throw sc.err('YAML_UNSUPPORTED', `无法解析的列表项：${JSON.stringify(sc.lines[sc.i])}`);
      } else {
        sc.i = save;
        out.push(null);
      }
      continue;
    }

    const km = KEY_RE.exec(itemText);
    if (!km) {
      out.push(parseScalar(sc, itemText, itemLine));
      continue;
    }

    // 对象项：`- text: "…"` 后面可跟同项内更深缩进的键。
    /** @type {Record<string, unknown>} */
    const obj = {};
    const key = km[1];
    const rest = (km[2] ?? '').trim();
    obj[key] = readValue(sc, rest, indent);
    const save = sc.i;
    sc.skipBlank();
    if (sc.i < sc.lines.length && sc.indentOf(sc.i) > indent && KEY_RE.test(sc.lines[sc.i].trim())) {
      const childIndent = sc.indentOf(sc.i);
      Object.assign(obj, parseBlockMap(sc, childIndent));
    } else {
      sc.i = save;
    }
    out.push(obj);
  }
  return out;
}

function readBlockScalar(sc, indicator, parentIndent) {
  const style = indicator[0];
  let baseIndent = -1;
  /** @type {string[]} */
  const collected = [];
  while (sc.i < sc.lines.length) {
    const raw = sc.lines[sc.i];
    if (raw.trim() === '') {
      collected.push('');
      sc.i++;
      continue;
    }
    const ind = sc.indentOf(sc.i);
    if (ind <= parentIndent) break;
    if (baseIndent === -1) baseIndent = ind;
    if (ind < baseIndent) break;
    collected.push(raw.slice(baseIndent));
    sc.i++;
  }
  while (collected.length && collected[collected.length - 1].trim() === '') collected.pop();
  if (collected.length === 0) return '';
  if (style === '|') return collected.join('\n');
  // `>` 折行：普通换行折成空格，空行保留为换行。
  const parts = [];
  let prevBlank = false;
  for (const line of collected) {
    if (line.trim() === '') {
      parts.push('\n');
      prevBlank = true;
      continue;
    }
    if (parts.length && !prevBlank) parts.push(' ');
    parts.push(line);
    prevBlank = false;
  }
  return parts.join('');
}

function parseScalar(sc, s, idx) {
  const t = s.trim();
  if (t === '' || t === '~' || t.toLowerCase() === 'null') return null;
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (/^-?\d+$/.test(t)) return Number(t);
  if (/^-?\d+\.\d+$/.test(t)) return Number(t);
  if (t === '[]') return [];
  if (t.startsWith('"')) {
    if (t.length < 2 || !t.endsWith('"')) {
      throw sc.err('YAML_UNSUPPORTED', `双引号字符串未闭合：${t}`, idx);
    }
    try {
      return JSON.parse(t);
    } catch {
      throw sc.err('YAML_UNSUPPORTED', `双引号字符串转义非法：${t}`, idx);
    }
  }
  if (t.startsWith("'")) {
    if (t.length < 2 || !t.endsWith("'")) {
      throw sc.err('YAML_UNSUPPORTED', `单引号字符串未闭合：${t}`, idx);
    }
    return t.slice(1, -1).replace(/''/g, "'");
  }
  if (t.startsWith('[') || t.startsWith('{')) {
    throw sc.err(
      'YAML_UNSUPPORTED',
      `不支持行内集合写法（请改用缩进列表，空数组写 []）：${t}`,
      idx,
    );
  }
  return t;
}

/** 便捷入口：文本 → { data, bodyLines, bodyLineOffset } */
export function parseFrontMatter(text, file) {
  const { fmLines, fmLineOffset, bodyLines, bodyLineOffset } = splitFrontMatter(text, file);
  const data = parseFrontMatterLines(fmLines, file, fmLineOffset);
  return { data, bodyLines, bodyLineOffset };
}
