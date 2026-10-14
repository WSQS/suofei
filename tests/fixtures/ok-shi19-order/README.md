# ok-shi19-order：排序策略对比 fixture（不是内容）

用途：为「组内是否保留底本原次序」这个待用户拍板的问题提供**可复跑**的证据。

- 19 个文件只用真实**诗题**与《文选》卷二十九的原次序（`orderInSource` 1..19），
  `author` 一律 `佚名`、`source` 明确标注是测试 fixture、正文是占位行。
- 它不是 `content/poems/` 的真实内容，**不要发布**，也不要用它代替 A 线的核对结果。
- 对比命令：

```bash
node tools/build-content.mjs --check --content tests/fixtures/ok-shi19-order/content --order source
node tools/build-content.mjs --check --content tests/fixtures/ok-shi19-order/content --order pinyin
```

`pinyin` 会把这 19 首里的 18 首换位（「行行重行行」从第 1 位掉到第 19 位）；这一事实由
`tests/order-strategy.test.mjs` 固化为断言，防止以后悄悄变化。
