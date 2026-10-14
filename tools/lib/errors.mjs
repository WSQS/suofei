// 契约线 C：错误模型。
//
// 每个校验失败都带一个稳定的机器可读 code（写回契约 docs/design/content-contract.md 第 3 节），
// 便于测试断言、CLI 汇总，也便于客户端/流水线区分失败种类。

export class ContentError extends Error {
  /**
   * @param {string} code 稳定错误码（契约第 3 节登记）
   * @param {string} message 人类可读说明（中文）
   * @param {{file?: string|null, line?: number|null}} [where]
   */
  constructor(code, message, where = {}) {
    super(message);
    this.name = 'ContentError';
    this.code = code;
    this.file = where.file ?? null;
    this.line = where.line ?? null;
  }

  /** 单行、可读、含位置：`<file>:<line>: [CODE] message` */
  format() {
    const loc = this.file ? `${this.file}${this.line ? ':' + this.line : ''}` : '<cli>';
    return `${loc}: [${this.code}] ${this.message}`;
  }

  toJSON() {
    return { code: this.code, file: this.file, line: this.line, message: this.message };
  }
}

/** 构建失败：把所有收集到的错误一起抛出，不做「只报第一条」的简化。 */
export class BuildFailure extends Error {
  /** @param {ContentError[]} errors */
  constructor(errors) {
    const n = errors.length;
    super(`内容编译失败：${n} 项校验错误`);
    this.name = 'BuildFailure';
    this.errors = errors;
  }

  formatList() {
    return this.errors.map((e) => `  - ${e.format()}`).join('\n');
  }

  toJSON() {
    return { ok: false, errors: this.errors.map((e) => e.toJSON()) };
  }
}

/** 命令行用法错误（退出码 2，与校验失败 1 区分）。 */
export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}
