# 测试 fixture（不是内容，不要发布）

这里的 Markdown **只服务于自动化测试**，不是 `content/poems/` 的真实内容，也不要被当成
用户笔记或已核底本。凡引用真实诗题的 fixture，`source` 字段都明确写了「测试 fixture」，
正文是占位行。

- `ok-basic`：最小合法文件（必填键齐全，无 notes/variants）。
- `ok-sorting`：组序、组内作者/诗名拼音序、佚名排最后、空行分段保留。
- `ok-order-source`：`orderInSource`（底本原次序）与 `--order source|pinyin` 两种策略的对比。
- `ok-notes-variants`：`notes` 块标量保留换行、`variants` 对象列表与可省略的 note。
- `fail-*`：契约第 3 节各条校验失败用例（另有本轮新增的 UNKNOWN_KEY / VARIANT_INVALID）。
