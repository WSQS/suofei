# id-final：目录/文件名 → ID → 路由 · 完整样例 ＋ 变更清单（**收口稿**）

> ## ⚠️ 仍是**材料**：不是实施授权
> **不搬 19 首源文件、不改 `tools/`·`schema/`·`web/`·`android/`、不实现映射表、不升 `formatVersion`、不发布。**
> 本文件把 C1/C2 与迁移兼容**收口**到用户已定的三条，并给出**完整样例**与**逐项变更清单**。上一稿 `id-and-naming-v2.md` **原样保留**，只在被取代处加了标注。

---

## 0. 用户 2026-10-16 已定的三条（**照写，不再开微问题**）

1. **C2（路径 ID ＋ 连字符）**：ID ＝ **相对内容根（`content/poems/`）的完整相对路径**、去 `.md`、**`/` 统一写成 `-`**。
   例：**`古诗十九首/行行重行行.md` ⇒ `古诗十九首-行行重行行`**。
2. **直接换、不做兼容**：**不做 `legacyId`、不做映射表、不做重定向**，**接受旧 ASCII 链接失效**。
3. **目录层级任意**：允许**根直接文件／一层／多层**；**不强制按朝代或作者分组、不设固定深度**；**目录纯整理** —— 分组仍由 `dynasty` ＋ **顶层有序朝代数组**决定，组内次序仍由 `orderInSource` 决定。

⇒ 「C1 还是 C2」「要不要保留旧链接」这两个问题**已关闭**：取 **C2**、**不保留**。

---

## 1. 完整样例：一棵目录树，三种层级

夹具目录树 `name-tree-final/three-levels/`（含真实 01/02/06；`古诗十九首/` 是**非朝代**目录名，正好体现「目录纯整理」）：

```text
content/poems/
├─ 涉江采芙蓉.md                    ← 根直接文件       （真实 06）
└─ 古诗十九首/
   ├─ 行行重行行.md                  ← 一层            （真实 01）
   └─ 甲/
      └─ 青青河畔草.md               ← 多层            （真实 02；`甲` 是**任意**占位目录名，与朝代/作者/排序无关）
```

| 层级 | 相对路径 | **ID（`/`→`-`）** | **`#/p/<id>`** | **`…/detail`** |
|---|---|---|---|---|
| 根直接 | `涉江采芙蓉.md` | `涉江采芙蓉` | `#/p/%E6%B6%89%E6%B1%9F%E9%87%87%E8%8A%99%E8%93%89` | `#/p/%E6%B6%89%E6%B1%9F%E9%87%87%E8%8A%99%E8%93%89/detail` |
| 一层 | `古诗十九首/行行重行行.md` | `古诗十九首-行行重行行` | `#/p/%E5%8F%A4%E8%AF%97%E5%8D%81%E4%B9%9D%E9%A6%96-%E8%A1%8C%E8%A1%8C%E9%87%8D%E8%A1%8C%E8%A1%8C` | 同左 ＋ `/detail` |
| 多层 | `古诗十九首/甲/青青河畔草.md` | `古诗十九首-甲-青青河畔草` | `#/p/%E5%8F%A4%E8%AF%97%E5%8D%81%E4%B9%9D%E9%A6%96-%E7%94%B2-%E9%9D%92%E9%9D%92%E6%B2%B3%E7%95%94%E8%8D%89` | 同左 ＋ `/detail` |

- 上表的 percent-encode 是 `ROUTES.poem(id)`＝`'#/p/' + encodeURIComponent(id)` 的**真实输出**（`demo-id-final.mjs` ① 逐条断言，并断言 `decodeURIComponent` 往返解回原 ID）。
- **三层级的定义只由路径本身决定**：同一首诗放在哪一层，ID 就跟着变（例：`行行重行行.md` ⇒ `行行重行行`；`古诗十九首/行行重行行.md` ⇒ `古诗十九首-行行重行行`）。

---

## 2. 变更清单（现状 → 新方案，逐项）

> **机器可读版**：`manifest/19-changes.json`（19 行；`demo-id-final.mjs` ② 复算 `newRelPath` → `newId` 并与清单**逐字比对**，也断言新旧 ID 各自唯一）。
> ⚠ **新布局是一个提案**：用户已定「层级任意」，本清单把 19 首都放在**一层** `古诗十九首/`；换成别的层级只改路径、ID 跟着变。

### 2.1 逐项（旧路径 → 旧 ID → 新相对路径 → 新 ID）

| # | 旧 `content/poems/…` | 旧 ID（**会失效**） | 新相对路径 | 新 ID |
|---|---|---|---|---|
| 01 | `gushi-shijiu-shou-01.md` | `gushi-shijiu-shou-01` | `古诗十九首/行行重行行.md` | `古诗十九首-行行重行行` |
| 02 | `gushi-shijiu-shou-02.md` | `gushi-shijiu-shou-02` | `古诗十九首/青青河畔草.md` | `古诗十九首-青青河畔草` |
| 03 | `gushi-shijiu-shou-03.md` | `gushi-shijiu-shou-03` | `古诗十九首/青青陵上柏.md` | `古诗十九首-青青陵上柏` |
| 04 | `gushi-shijiu-shou-04.md` | `gushi-shijiu-shou-04` | `古诗十九首/今日良宴会.md` | `古诗十九首-今日良宴会` |
| 05 | `gushi-shijiu-shou-05.md` | `gushi-shijiu-shou-05` | `古诗十九首/西北有高楼.md` | `古诗十九首-西北有高楼` |
| 06 | `gushi-shijiu-shou-06.md` | `gushi-shijiu-shou-06` | `古诗十九首/涉江采芙蓉.md` | `古诗十九首-涉江采芙蓉` |
| 07 | `gushi-shijiu-shou-07.md` | `gushi-shijiu-shou-07` | `古诗十九首/明月皎夜光.md` | `古诗十九首-明月皎夜光` |
| 08 | `gushi-shijiu-shou-08.md` | `gushi-shijiu-shou-08` | `古诗十九首/冉冉孤生竹.md` | `古诗十九首-冉冉孤生竹` |
| 09 | `gushi-shijiu-shou-09.md` | `gushi-shijiu-shou-09` | `古诗十九首/庭中有奇树.md` | `古诗十九首-庭中有奇树` |
| 10 | `gushi-shijiu-shou-10.md` | `gushi-shijiu-shou-10` | `古诗十九首/迢迢牵牛星.md` | `古诗十九首-迢迢牵牛星` |
| 11 | `gushi-shijiu-shou-11.md` | `gushi-shijiu-shou-11` | `古诗十九首/回车驾言迈.md` | `古诗十九首-回车驾言迈` |
| 12 | `gushi-shijiu-shou-12.md` | `gushi-shijiu-shou-12` | `古诗十九首/东城高且长.md` | `古诗十九首-东城高且长` |
| 13 | `gushi-shijiu-shou-13.md` | `gushi-shijiu-shou-13` | `古诗十九首/驱车上东门.md` | `古诗十九首-驱车上东门` |
| 14 | `gushi-shijiu-shou-14.md` | `gushi-shijiu-shou-14` | `古诗十九首/去者日以疏.md` | `古诗十九首-去者日以疏` |
| 15 | `gushi-shijiu-shou-15.md` | `gushi-shijiu-shou-15` | `古诗十九首/生年不满百.md` | `古诗十九首-生年不满百` |
| 16 | `gushi-shijiu-shou-16.md` | `gushi-shijiu-shou-16` | `古诗十九首/凛凛岁云暮.md` | `古诗十九首-凛凛岁云暮` |
| 17 | `gushi-shijiu-shou-17.md` | `gushi-shijiu-shou-17` | `古诗十九首/孟冬寒气至.md` | `古诗十九首-孟冬寒气至` |
| 18 | `gushi-shijiu-shou-18.md` | `gushi-shijiu-shou-18` | `古诗十九首/客从远方来.md` | `古诗十九首-客从远方来` |
| 19 | `gushi-shijiu-shou-19.md` | `gushi-shijiu-shou-19` | `古诗十九首/明月何皎皎.md` | `古诗十九首-明月何皎皎` |

**① 每个文件搬到哪**：按 `newRelPath` 列（本提案：新建 `content/poems/古诗十九首/`，把 19 份 `gushi-shijiu-shou-NN.md` 改名为**诗名**并移入）。
**② 新 ID**：如 `newId` 列（＝`newRelPath` 去 `.md`、`/`→`-`）。
**③ 旧 ID**：**19 个全部失效**（见 2.3）。

### 2.2 源文件内容要不要改？

**不用改**（本次迁移只管**路径与文件名**）：front matter 的 `title/author/dynasty/genre/orderInSource/source` 与正文、两个节都保持原样。
⚠ 但注意 `samples/real-01-full.md` 那种源文件样式**已被认可**；那是**内容格式**的事，与本次「改名与搬家」是两件事。

### 2.3 旧链接的后果（必须写清）

| 旧链接 | 会发生什么 |
|---|---|
| `#/p/gushi-shijiu-shou-01` | 路由**仍能解析**成「诗页」（`poemPattern` 命中），但产物里**已没有**这个 ID ⇒ `getPoem()` 返回 `null` ⇒ Web 渲染 `view--missing`，文案 **「找不到这首诗：`gushi-shijiu-shou-01`」**，且**不回退目录**（`web/app/render.js`；已核） |
| `#/p/gushi-shijiu-shou-01/detail` | 同理 ⇒ **「找不到这首诗：…」**（详情页也是 `getPoem` 取不到就渲染缺失态） |
| Android | **无影响**：manifest 只有 `MAIN`/`LAUNCHER`，**没有 URL/deep-link 入口**，Android 端本来就打不开这类链接 |
| 一处**替代**关系 | `docs/status.md` 那条已定决策「保持哈希路由……**不动发布白名单与旧链接**」**在本迁移范围内已被用户 2026-10-16 取代** ⇒ 该条需要由持有 `docs/` 的会话更新（**本材料不改 `docs/`**） |

**没有任何机械闸会提醒这件事**：字段集门只看**键路径**（id 键还在），`contentVersion` 也不表示 ID 变了 ⇒ 只能靠本清单与发布说明。

### 2.4 契约 / 校验要改什么（**值形态**变化，**不是字段集**变化）

| 位置 | 现状 | 要改成 |
|---|---|---|
| `tools/lib/interface.mjs` | `ID_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*-\d+$/`（全小写 ASCII，且**必须以 `-数字` 结尾**） | 中文 ID **违反**它（中文不在 `[a-z0-9]`，且 `古诗十九首-行行重行行` 不以 `-数字` 结尾）⇒ 改为**只做正面约束**（非空、**不含 `/`**、不含控制字符/仅允许安全字符集），**去掉 `-\d+$` 的强制** |
| `tools/lib/interface.mjs` | `ID_PATTERN`（同一正则的源码字符串） | 同上同步 |
| `schema/content.schema.json` | `poems[].id.pattern` ＝ 同一条 ASCII 正则 | 同上同步（`docs/design/content-contract.md` 里对 id 的散文描述也要一并更新） |
| `tools/build-content.mjs` `readRecords`（第 114–140 行） | **只读直接子文件 `.md`、不递归**；用 `d.isFile()`（把符号链接**静默丢弃**） | 改为**递归**扫 `content/poems/`、按**相对路径**派生 id、加**排除规则**（§5）、对**符号链接/非 `.md` 报错** |
| `tools/lib/content-build.mjs` | `ID_FILENAME_MISMATCH`（要求 front matter `id` ＝ basename）、`ID_DUPLICATE`（源里手填重复） | 规则 ② 之后**源里不再写 `id`** ⇒ 这两条口径要重述；**新增**「按拼接 ID（NFC＋大小写折叠）判重、碰撞即报错」（§3） |
| 字段集账本 `schema/format-version.json` | —— | **不动**：键路径没变 ⇒ **不是字段集变化**（见 2.6） |

### 2.5 两端实现要改什么（**只读核到的现状 ＋ 代价陈述，未改任何代码**）

| 端 | 现状（只读核到） | 要不要改 |
|---|---|---|
| Web 路由 | `ROUTES.poem/detail` 用 `encodeURIComponent`；`poemPattern = /^\/p\/([^/]+)$/` 排除 `/`；`main.js` `getPoem(doc,id)` 按**字符串**查表 | **不用改**：ID 里已无 `/`，中文由 `encodeURIComponent` 编码、`decodeURIComponent` 解回（已断言往返） |
| Web 排序兜底 | `render.js` `comparePoems` 最后一行 `collator.compare(a.id, b.id)`（`Intl.Collator`） | **不用改**（中文只是排序兜底，**仅在产物一首都没带 `orderInSource` 时**才用到；`Intl.Collator` 不会因中文报错） |
| Web 测试/文档 | e2e 用 `deepPoem.id` 等**变量**，未写死 ASCII id | 无需为 id 形态改；但**关于 id 形状的断言（若有）要跟着改** |
| Android | `Domain.kt` `val id: String`；`ContentParser.kt` 只当字符串读；**无 URL/deep-link 入口** | **不用改**；旧链接失效与 Android 无关 |
| **编译器/校验** | 见 2.4 | **要改**（这是本次迁移的主要工作量） |

一句话：**产物消费侧（两端）不必为 ID 形态改动；要改的是编译器与校验。**

### 2.6 `formatVersion`（**如实提一次**）

本次只改 **id 的「值形态」（字符串内容）**，产物**键路径一字未变** ⇒ **单为此不必升 `formatVersion`**（不拿它当门槛、不在别处反复当理由）。
（若将来因别的原因改了字段集，才按用户已定的 B 判据升 —— 那是另一件事。）

---

## 3. 全库判重规则（用户点名）

> **算法**：对每个内容文件的**相对路径**，按
> ① 去 `.md` → ② 目录分隔符 `/` **统一写成 `-`** → ③ **NFC 归一化**
> 得到 ID；再取 **`dedupeKey = id.normalize('NFC').toLowerCase()`**；**同一 key 出现 ≥2 次 ⇒ 报错，并逐条列出冲突路径**。
> **不静默覆盖**、**不设固定目录限制**、**不按目录层级豁免**。

**为什么要单列**：把 `/` 换成 `-` 之后，**路径拼接出的 `-`** 与**文件名里本来就有的 `-`** 会**同形** ⇒ 两个不同的路径可能算出**同一个 ID**。

**具体碰撞例（复用 v2 稿的真实夹具 `name-tree-fixture-v2/dash-collision/`）**：

```text
汉/古诗十九首/行行重行行.md          ⇒  ID 汉-古诗十九首-行行重行行
汉-古诗十九首-行行重行行.md          ⇒  ID 汉-古诗十九首-行行重行行   ← 与上一行**同 ID**
```

**等价的最小例子**（同理，与最终方案同形）：

```text
古诗十九首/行行重行行.md             ⇒  ID 古诗十九首-行行重行行
古诗十九首-行行重行行.md             ⇒  ID 古诗十九首-行行重行行   ← 碰撞
```

⇒ 这两组都必须**报错**（`demo-id-final.mjs` ③ 断言两组各 1 组碰撞；`--scan` 该夹具 ⇒ **EXIT≠0** 并列出冲突路径）。
`manifest/19-changes.json` 里的 19 个新 ID 已断言**互不相同**（所以本提案的 19 首在判重上是通过的）。

---

## 4. 中文与路由编码（**只陈述现状，不并列 C1/C2**）

| 事实 | 依据（已核） |
|---|---|
| 链接生成端一定编码 | `ROUTES.poem(id) = '#/p/' + encodeURIComponent(id)`；中文 ⇒ `%E5%8F%A4…`；若 id 含 `/` 会被编成 `%2F` |
| 路由模式**排除 `/`** | `poemPattern = /^\/p\/([^/]+)$/`（注释：id 里不含 `/`，否则与详情页 `/detail` 后缀相撞） |
| 详情页先匹配 | `detailPattern = /^\/p\/([^/]+)\/detail$/`，`parseHashString` 里先试它 |
| 解回原文 | `decodeURIComponent(group)` ⇒ ID 还原；本方案 ID 无 `/` ⇒ 往返正常（已断言 `kind=poem/detail` 且 id 一致） |
| 匹配不上 ⇒ **落到目录** | `parseHashString` 末尾 `return { kind:'index' }` ⇒ 路由解析不出任何页面时**显示目录**（不 404、不报错）。**只有手写、未编码 `/` 的链接**会走到这里；**本方案不产生这种链接** |
| 找不到 id ⇒ **缺失页** | `getPoem()` 为 `null` ⇒ 「找不到这首诗：`<id>`」（**不回退目录**） —— 这正是旧 ASCII 链接失效时的表现 |

⇒ **本方案（C2）在现有路由与正则下原样可用**，中文与连字符都不需要额外的路由改动。

---

## 5. 安全边界建议（**保留七条**，与三条决定不冲突）

| 边界 | 建议 |
|---|---|
| 扫描根 | **只扫 `content/poems/` 之下（含递归子目录），不越出该根** |
| README 与说明文件 | **`_` 前缀（文件或目录）＋ `README.md` ⇒ 忽略并计数**（不静默、不报错） |
| 符号链接 | **不跟随；遇到即报错**（非零退出） |
| 隐藏文件与临时文件 | **`.` 开头、`~$`/`~` 结尾 ⇒ 忽略并计数** |
| **中文文件名的 Unicode 归一化** | **扫描第一步做 NFC**；判重与 ID 派生用**同一形态**；**磁盘名不是 NFC ⇒ 报错**（`non-nfc-name`） |
| **Windows/macOS 大小写差异** | 判重时按 **NFC ＋ 小写折叠** ⇒ 只差大小写**当重复并报错** |
| 空目录 | **忽略并计数** |
| 非 `.md` 文件 | **poems 根之内、不在排除清单里的非 `.md` ⇒ 报错** |

（理由与「若你不同意会怎样」的完整版见 `rules-v3.md §7.4` 与 `id-and-naming-v2.md §6`，本稿不重复。）

---

## 6. 迁移兼容：**不做**（并把被否决的候选留痕）

- 用户已定：**直接换、不做兼容** ⇒ **不做 `legacyId`、不做映射表、不做重定向**，接受旧 ASCII 链接失效（后果见 2.3）。
- 因此 `id-and-naming-v2.md §5` 的 **③ 双 ID 期** 与 **④ Web 构建期静态映射** **已被用户 2026-10-16 否决** —— 那两份候选**原样保留**，已就地标注〔已被用户 2026-10-16 否决〕。
- ⚠ 同时**明确写出**：`docs/status.md` 里那条 **「不动发布白名单与旧链接」** 在本迁移范围内**已被取代**（用户 2026-10-16）。

---

## 7. 本材料**没做、没验**的

- **没做**：搬任何源文件；改 `tools/`·`schema/`·`web/`·`android/`·`content/`·`tests/`·`docs/`；改 `ID_REGEX`/schema；**实现任何映射表或重定向**；升 `formatVersion`；发布/push/tag；碰 `items/**/history/**`、任何 `item.md`。
- **没验**：两端测试未跑（2.5 是**只读核到**的结论，不是已完成的改动）；真机/模拟器未跑；地址栏里**未编码中文**是否被浏览器自动 percent-encode（属浏览器行为；**代码级只验证了生成端一定编码**）。
- **没定**（等用户拍板）：**19 首实际采用哪个层级**（本稿只给一个一层提案）。
- 未批的内容格式细则（未知节／围栏里的 `##`／空节／最小 Markdown 范围）**仍未批**，与本稿无关。
