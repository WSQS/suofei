// 发布流水线 F：最小 zip 读取器（只为了从 APK 里读出 assets/content/content.json）。
//
// 为什么不用 unzip/apkanalyzer/python：本机 `unzip` 不一定有、python 要走 `uv run`，
// 而「APK 里的内置内容与发布内容是不是同一份字节」是**发布门的核心断言**，
// 不能依赖一个可能不存在的外部工具（那样检查会悄悄变成 SKIP）。
// 只用 Node 内置 zlib，覆盖 APK 实际用到的 stored/deflate 两种方式。
//
// 诚实边界：不处理 zip64（>4 GiB 的归档）与加密条目；遇到就抛出明确错误，
// 由调用方报红，绝不返回一个「看着像成功」的结果。

import zlib from 'node:zlib';

const EOCD_SIG = 0x06054b50;
const CD_SIG = 0x02014b50;
const LFH_SIG = 0x04034b50;

function findEocd(buffer) {
  // 注释最长 65535 字节，所以 EOCD 一定在末尾 65557 字节内。
  const lowest = Math.max(0, buffer.length - 22 - 0xffff);
  for (let i = buffer.length - 22; i >= lowest; i--) {
    if (buffer.readUInt32LE(i) === EOCD_SIG) return i;
  }
  return -1;
}

/** 列出归档里的条目名（按中央目录顺序）。用于在失败时打印「里面到底有什么」。 */
export function listZipEntries(buffer) {
  const eocd = findEocd(buffer);
  if (eocd < 0) throw new Error('不是合法的 zip/apk：找不到中央目录尾部（EOCD）');
  const count = buffer.readUInt16LE(eocd + 10);
  if (count === 0xffff) throw new Error('这个 zip 用了 zip64 中央目录，本读取器不支持');
  let off = buffer.readUInt32LE(eocd + 16);
  const names = [];
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(off) !== CD_SIG) throw new Error('中央目录条目签名不对（文件可能被截断）');
    const nameLen = buffer.readUInt16LE(off + 28);
    const extraLen = buffer.readUInt16LE(off + 30);
    const commentLen = buffer.readUInt16LE(off + 32);
    names.push(buffer.toString('utf8', off + 46, off + 46 + nameLen));
    off += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

/**
 * 读出单个条目的内容。
 * @returns {{data: Buffer, method: 'stored'|'deflate'}|null} 找不到条目返回 null。
 */
export function readZipEntry(buffer, wantName) {
  const eocd = findEocd(buffer);
  if (eocd < 0) throw new Error('不是合法的 zip/apk：找不到中央目录尾部（EOCD）');
  const count = buffer.readUInt16LE(eocd + 10);
  if (count === 0xffff) throw new Error('这个 zip 用了 zip64 中央目录，本读取器不支持');
  let off = buffer.readUInt32LE(eocd + 16);

  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(off) !== CD_SIG) throw new Error('中央目录条目签名不对（文件可能被截断）');
    const method = buffer.readUInt16LE(off + 10);
    const compSize = buffer.readUInt32LE(off + 20);
    const uncompSize = buffer.readUInt32LE(off + 24);
    const nameLen = buffer.readUInt16LE(off + 28);
    const extraLen = buffer.readUInt16LE(off + 30);
    const commentLen = buffer.readUInt16LE(off + 32);
    const localOff = buffer.readUInt32LE(off + 42);
    const name = buffer.toString('utf8', off + 46, off + 46 + nameLen);
    const nextOff = off + 46 + nameLen + extraLen + commentLen;

    if (name === wantName) {
      if (compSize === 0xffffffff || localOff === 0xffffffff) {
        throw new Error(`条目 ${name} 使用了 zip64 扩展字段，本读取器不支持`);
      }
      if (buffer.readUInt32LE(localOff) !== LFH_SIG) throw new Error(`条目 ${name} 的本地文件头签名不对`);
      const lNameLen = buffer.readUInt16LE(localOff + 26);
      const lExtraLen = buffer.readUInt16LE(localOff + 28);
      const dataOff = localOff + 30 + lNameLen + lExtraLen;
      const raw = buffer.subarray(dataOff, dataOff + compSize);
      if (method === 0) return { data: Buffer.from(raw), method: 'stored' };
      if (method === 8) {
        const data = zlib.inflateRawSync(raw);
        if (uncompSize !== 0 && data.length !== uncompSize) {
          throw new Error(`条目 ${name} 解压后长度 ${data.length} 与中央目录声明 ${uncompSize} 不符`);
        }
        return { data, method: 'deflate' };
      }
      throw new Error(`条目 ${name} 使用了不支持的压缩方法 ${method}`);
    }
    off = nextOff;
  }
  return null;
}
