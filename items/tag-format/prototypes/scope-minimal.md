# 最小落地范围与可判出口（**不是实施授权**）

> 用户 2026-10-18 的数据规则已过（见 `q-tag-format.md` §0.8）。**本轮只整理范围与出口**，正式 schema／`formatVersion 3`／生产两端／发布**均未授权**，等对话侧确认下一步工程授权再动。

## 范围内（最小一组）

1. **源格式**：frontmatter 加 `tags` 键（对象序列；`id` 中文、`orderInTag` 必填）。编译期白名单放行 `tags`。
2. **编译期**：
   - 从 `poems[].tags` **汇总**顶层 `tags[]`（`id` + 按 `orderInTag` 升序的成员序列）；
   - 标签**之间**按**拼音**排序（内部键，**不发布 `SortKey`**）；
   - 诊断：`TAG_ORDER_REQUIRED`（缺 `orderInTag`）、`TAG_ORDER_DUP`（同标签同序）、`tags` 项形状不对（沿用既有 `YAML_*`/`UNKNOWN_KEY` 风格）。
3. **产物**：`poems[].tags[]`（`tagId` + `orderInTag`）＋ 生成好的 `tags[]`；`orderInSource`/朝代字段原样不动。
4. **两端渲染**：按 UI 已采纳形态（朝代｜标签 tab、同构展开、无数量、只显示有诗标签、逐层返回）——**渲染实现不在本稿**，只在授权后做。
5. **测试**：编译期单测（汇总/排序/两条诊断/空 `tags` ⇒ `[]`）、契约夹具、两端解析与渲染的既有基线。

## 不在范围内

- 不给现有 22 首打标签（源诗不动）；
- 不做 `name`/`qualifier`/`aliases`/`totalM`，不做「选本总篇数」；
- 不做手写标签表；不做同名的区分；
- 不发布任何 `SortKey`；
- 不改 `orderInSource`/朝代规则。

## 可判出口（每条都能一句判真假）

| # | 出口 | 判据 |
|---|---|---|
| 1 | 无标签可省略 | 源里不写 `tags` ⇒ 产物该诗 `tags: []`（不是 `null`） |
| 2 | 缺 `orderInTag` 必须失败 | 构造一例 ⇒ 编译**非零退出**且报 `TAG_ORDER_REQUIRED` |
| 3 | 同标签同序必须失败 | 构造 `A#2`/`B#2` ⇒ 编译**非零退出**且报 `TAG_ORDER_DUP` |
| 4 | 标签之间按拼音 | 固定夹具上断言 `tags[]` 顺序 == `Intl.Collator('zh-Hans-CN-u-co-pinyin')` 的结果 |
| 5 | 标签内按序 | 断言每个 `tags[].members` 严格按 `orderInTag` 升序 |
| 6 | 不发布排序键 | 产物 JSON 里**没有**任何 `SortKey` 类字段（键路径集比对） |
| 7 | 字段集变化可判 | `fieldPaths` 前后对比，新增路径逐条列出（是否升 `formatVersion` 由对话侧/用户决定，本稿不预设） |
| 8 | 旧行为不破 | `orderInSource`/朝代分组相关既有测试全绿 |

## 需要对话侧拍的前置（不是问用户的技术细节）

- 是否**现在就**升 `formatVersion 3`（升了旧 APK 停止热更，见 `q-tag-format.md` §7 的不可逆代价）；
- 授权范围是「只做编译期+测试」还是「编译期＋两端渲染」；
- 验收标准是否就用上面 8 条。
