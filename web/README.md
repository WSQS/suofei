# 索斐 — Web 端（静态、无框架、无构建步骤）

工程名 PoetryCollection；**应用展示名「索斐」**（用户 2026-10-14 拍板）。Android 端另在 `android/`。

这里只有纯静态文件：无框架、无打包、无 npm 依赖。部署目标是 GitHub Pages 这类静态托管，
**不假设能自定义响应头**。

> **视觉是占位，待评审。** 本轮不做视觉设计：`styles.css` 只是最朴素的占位样式，
> 视觉与交互由原型线（`prototype/`，worktree `wt/b-bc5853db`）评审后再统一落到两端。
> 本轮 Web 端只保证结构清楚、正文分行/空行正确、笔记展开正常。

## 1. 怎么看效果（确切命令）

Service Worker 只在 **http(s) 或 localhost** 下能注册；`file://` 直接打开必然没有离线能力，
那不是 bug（页面会如实显示「需要 https 或 localhost」）。

```bash
# 1) 放一份内容到 web/content.json：默认真实产物 dist/content.json 优先，没有才用占位夹具
node web/scripts/prepare-dev-content.mjs
#    也可 --from <file>（指定文件）或 --variant <name>（见下面「手动演练」）

# 2) 起本地静态服务（零依赖，等价于 npx serve web）
node web/scripts/serve.mjs              # http://127.0.0.1:8080/
node web/scripts/serve.mjs --port 8137  # 换端口

# 3) 浏览器打开 http://127.0.0.1:8080/  （也可以用 npx serve web）
```

手动演练内容更新（两个终端）：先按上面打开页面，然后

```bash
node web/scripts/prepare-dev-content.mjs --variant update   # 从基座派生一份「新版」内容
# 回页面点「检查内容更新」：在诗页阅读时会先暂存，回到目录后自动切换
# 其它变体：update2（再看一组被删） / lower / corrupt / broken / future（四种失败）
#            no-sortkeys（老产物：没有排序键，验证本机拼音兜底）
```

变体都是从**当前基座（真实产物）现场派生**的（`scripts/lib/variants.mjs`），所以演练的就是
真实 19 首上的删/改/增，而不是另一份手抄内容。派生出的内容带着「测试夹具内容」黄条，
不会跟发布内容混。

一次跑完所有验证（无头 Chromium + CDP，零第三方依赖）：

```bash
node web/tests/e2e-cdp.mjs
# 产物：web/tests/artifacts/（截图 + dom-dumps.txt，已 gitignore）
# 本机 Chromium 不在默认位置时：CHROME_BIN=/path/to/chrome node web/tests/e2e-cdp.mjs
```

## 2. 目录

```
web/
  index.html            外壳（标题写「索斐」）
  styles.css            占位样式（待原型评审）
  manifest.json         只声明名称与作用域（故意不含图标）
  sw.js                 Service Worker：只缓存**应用资源**
  app/config.js         ★ 所有对外接口常量集中在这里（见 §7）
  app/content.js        内容下载 / 校验 / 版本比较 / 切换决策（纯函数为主，node 里可直接测）
  app/store.js          内容离线副本：IndexedDB（不是 Cache Storage）
  app/render.js         纯渲染：分组目录 / 搜索 / 诗页（分行、分节、笔记）
  app/main.js           入口：路由、更新检查、原子切换、状态面板
  scripts/serve.mjs     零依赖静态服务
  scripts/prepare-dev-content.mjs   把一份内容 JSON 放到 web/content.json（+ .sha256 边车）
  scripts/lib/variants.mjs          从基座派生更新/失败测试变体（不再把变体提交入库）
  fixtures/             **测试夹具（不是发布内容）**
  tests/e2e-cdp.mjs                 端到端验证（无头 Chromium + CDP）
  content.json(.sha256) 本地生成物，已 gitignore（部署时才需要放置）
```

`fixtures/` 里的两份都是**测试夹具，不是发布内容**，页面上都会显示黄色提示：

- `content.placeholder.json`：占位夹具（真实产物不存在时也能开发），形状与产物一致（整数排序键、`orderInSource`），
  但正文只是几句广为人知的开篇，**非校对文本**；
- `content.no-sortkeys.json`：老产物形状（一个排序键都没给），用来验证本机拼音兜底排序。

发布用的内容永远是 `dist/content.json` → `web/content.json`（`prepare-dev-content.mjs` 默认就走这条），
页面对夹具内容会显示黄条，不会把夹具当交付内容。

## 3. 次序：编译期是唯一排序权威（客户端不重排）

用户 2026-10-14 拍板：组内次序用 `--order source`，**保留《文选》卷二十九原次序**
（A 线写入 `orderInSource` = 1..19，编译器已按此排好产物里的 `poems` 数组）。

所以 Web 端的原则是：

1. **产物带了排序键（`authorSortKey`/`titleSortKey`，IF-15 的整数名次）时**，目录与搜索结果
   都**照产物数组次序原样渲染**，不重排；搜索 = 在数组次序上过滤，保持同一相对次序。
   分组的次序同样照产物给的 `dynasties` 数组（契约 §2 已按 `order` 升序）。
2. **只有产物一个排序键都没给**（老产物 / 手写 JSON）时，才退回本机拼音排序兜底
   （`app/render.js: comparePoems`）。
3. 排序键**不是整数**（例如 v0 式的拼音字符串）→ 按「没给」处理，走兜底，
   并且**在状态面板里写明**用的是兜底（不静默）。

为什么必须这样：编译期是唯一排序权威。如果两端各自再排一遍，用户刚拍板的「底本原次序」会被
静默推翻，而且两端还可能排出不同结果。

钉住这个缺陷的回归断言（`tests/e2e-cdp.mjs`）：真实产物第 1 首必须是 `行行重行行`
（它的 `titleSortKey` 是全场最大 18，任何客户端重排都会把它推到 19 位），并且目录里
「汉」组的 19 个诗名次序必须**逐字等于**《文选》原次序（硬编码在测试里，两处独立断言）。

## 4. 离线与更新：具体设计

### 4.1 两套缓存，版本键分开（契约 §4 的硬要求）

| | 应用资源 | 内容 |
|---|---|---|
| 存放位置 | Cache Storage | IndexedDB（库 `poetry-web` → 对象仓 `content`） |
| 版本键 | `pc-resources-` + **应用资源版本**（`APP_VERSION=0.1.0`）→ `pc-resources-0.1.0` | **`contentVersion`**（内容自己的字符串，如 `2026.10.14.2`） |
| 谁写 | `sw.js`（install 预缓存外壳 + 运行时 SWR） | `app/content.js`（下载校验通过后写） |
| 版本不混用 | 资源发新版只会换 `CACHE_NAME` 并删旧 cache；内容版本完全由 `contentVersion` 决定，两者互不推导 | 同左 |

`sw.js` 对 `content.json` / `content.json.*` **主动放行走网络**（不 respondWith、不进 Cache
Storage），所以内容永远不可能被塞进资源缓存。e2e 里有断言直接核对这一点。

### 4.2 原子切换

1. 检查更新 = `fetch('content.json?t=<now>', {cache:'no-store'})` → 算 sha256（有
   `content.json.sha256` 边车就比对，没有就退化为「自算哈希 + 结构校验」并如实记进 meta）
   → `JSON.parse` → 结构校验（对应契约 §3）。**任何一步失败都不写任何存储。**
2. 通过后先写 `staged`，切换 = 一个 IndexedDB `readwrite` 事务里 `put(active)` + `delete(staged)`。
   事务要么整体提交要么回滚，所以 `active` 只会是旧版或新版，不存在半成品。
3. **阅读中不突然替换**：如果当前正开着诗页，新版只落 `staged` 并显示横幅（含「立即切换」）；
   回到目录时自动切换。`staged` 存在 IndexedDB 里，刷新/离线都不丢。
4. **新版可删改**：整份文档替换，不做累积合并 —— e2e 实测删掉一整首诗、删掉一个时代分组、
   改掉一行、加一首诗都生效。
5. 失败保留旧版并如实提示：
   - 网络失败 → 「失败（保留本地版本）」+ 状态面板仍显示本地版本；
   - 校验和不匹配 / 非法 JSON / 结构校验不过 → 保留旧版，原因如实写出（含 JSON 报错位置）；
   - `formatVersion` 高于本应用支持 → **不解析**，保留旧内容；
   - 远端不比本地新 → 不降级。

### 4.3 诚实边界（写在页面上，也写在这里）

- **首次访问需要网络**：没有任何本地副本时取不到内容就明确说「首次访问需要网络下载内容，但下载失败」，
  不会假装还能读。
- **不承诺永久存储**：离线副本是浏览器存储（Cache Storage + IndexedDB），用户「清除站点数据」
  或浏览器回收存储时可能丢失。状态面板里写明了这一点，并提供一个「请求持久化存储」按钮，
  结果（授予/未授予 + 已用/配额）如实显示——授予了也只是降低概率，不是保证。
- `file://` 打开没有 Service Worker，也就没有离线能力。

## 5. 已验证 / 未验证

### 已验证（`node web/tests/e2e-cdp.mjs`，基座 = 真实产物（19 首），本机无头 Chromium 129，143/143 通过）

真跑真断言，不是「构建成功」：真实内容装载与版本（`2026.10.14.1` / 19 首 / 1 个分组）；
**目录次序逐字等于《文选》卷二十九原次序**（19 个诗名硬编码断言），第 1 首必须是 `行行重行行`，
且本机拼音重排会把它推到第 19 位（两处独立断言，专钉「客户端重排」这个缺陷）；
跨组搜索保持产物相对次序；诗页逐行文本与 JSON 完全一致、分节/空行、异文块、无笔记的真实空状态；
Service Worker 注册并控制页面、资源缓存内容与名字、**`content.json` 不在资源缓存里**、IndexedDB 副本；
真离线（CDP `offline` **并且关掉本地服务进程**）下重载仍可读；
内容更新（阅读中不替换 → staged 跨刷新保持 → 回目录自动切换）与删/改/增（含整个分组被删）；
笔记默认折叠→展开、笔记里的 HTML 原样显示（不注入）；四种失败全部保留旧版；
离线持久化；模拟「清除站点数据」后如实提示首次需要网络、恢复后自愈；
老产物（一个排序键都没给）退回本机拼音兜底；整轮无未捕获 JS 异常。

离线是怎么模拟的：CDP `Network.emulateNetworkConditions{offline:true}` **加上 `kill` 掉本地
HTTP 服务进程**。只用前者不够——Service Worker 自己的 fetch 属于另一个 target，不受页面
offline 条件限制（第一版就是这么被骗过的：探针拿到的 404 其实来自仍然活着的服务器）。
现在关掉服务后，同一轮里「应用外壳」仍是 200（只能来自 Cache Storage），而取一个没缓存的文件
拿到 SW 自己返回的 504，这才算证明。

**真实内容没有覆到的两条路径（诚实说明）**：A 线这份 19 首全部是**单节**、`notes` 全部为 `null`，
所以「空行分段」与「笔记展开」在真实内容上**没有样本**。它们是用从真实产物**派生的测试夹具**
（加一首带空行分段 + 测试笔记的诗）验的，那份夹具在界面上带「测试夹具内容」黄条。
用户笔记目前尚不存在（没人写过），这是真实状态，不是 bug。

它**不能**证明：真实弱网/高丢包/慢速移动网络下的行为；CDP offline 与真实断网的差别；
移动浏览器（iOS Safari 等）的存储回收策略差异；`caches`/IndexedDB 配额耗尽时的表现。

### 未验证

- **没有部署到真实 GitHub Pages**（未获授权），也没在 https + 子路径下跑过。子路径是靠
  `sw.js` 用 scope 相对 URL 预缓存来支持的，但没实测。
- 没在移动浏览器 / 真机浏览器上验证；没做 iOS/Safari 兼容验证。
- 没做多标签页并发、长时间挂机、大内容量（几百首以上）、超大笔记的性能验证。
- 视觉/交互未评审（见文件头提示），也没做无障碍专项验证（只用了语义标签、`<details>`、
  文字对比度未核对）。
- 应用资源更新（`APP_VERSION` 变化 → 新 SW）只在代码层面成立，没有做「发两版资源」的实测；
  目前只在 `activate` 里删除旧 cache、`controllerchange` 时提示刷新。
- `manifest.json` 不含图标，所以「安装到桌面」的体验**没有**验证，也没打算在本轮承诺。

## 6. 部署到静态托管（Pages）注意点

1. 要放到站点上的实际文件是：`index.html`、`styles.css`、`manifest.json`、`sw.js`、`app/`、
   以及 `content.json`（+ 可选 `content.json.sha256`）。`web/fixtures/`、`web/tests/`、
   `web/scripts/` 不需要发布（放上去也无害，但它们不是应用的一部分）。
2. `index.html` 用的是**哈希路由**，所以不需要服务器重写规则；刷新深链不会 404。
3. 内容地址是相对路径（`content.json`），因此 `/repo-name/` 这种子路径部署也能用。
4. 缓存控制不用管：Pages 的响应头不可自定义，本项目也不依赖它——资源缓存由 SW 自己维护，
   内容请求一律带 `?t=<now>` + `cache:'no-store'`。
5. Service Worker 的**作用域**就是它所在目录。放在 `web/` 根下 → 作用域是整个站点；
   如果哪天要挪到子目录，记得子目录里的页面不会自动受它控制。
6. 发布新版内容：替换 `content.json`（并把 `contentVersion` 递增）即可，不需要动资源版本；
   改代码才动 `APP_VERSION`（并清掉旧 cache）。
7. 两个版本号要一起出现在产物里这件事属于发布流程（tag 触发），本轮不涉及。

## 7. 接口决定（暂定，待用户确认）

判据：**明天要改它，是不是有别人也得跟着改？** 下面的每一条都属于「别人会跟着改」的接口。
为了便于一处改，所有常量集中在 `web/app/config.js`（`sw.js` 里两个经典 worker 无法 import
的常量由 e2e 交叉断言保持一致）。

| 接口 | 谁依赖 | 暂定成什么样 | 要改的话动哪里 |
|---|---|---|---|
| **内容文件位置/名字** | Android 端（同一份产物）、内容线 C、发布流程、已上线的 Pages | 站点根下 `content.json`（约定 `dist/content.json` 编译产物原样发布），相对路径引用 | `config.js: CONTENT_URL`、`sw.js: isContentRequest()`、发布脚本 |
| **更新检查协议** | 服务器上的产物、已缓存旧内容的浏览器、Android 端（同语义） | HTTP `GET content.json?t=<now>` + `cache:'no-store'`，响应体就是契约 §2 的 JSON；**没有**额外的版本清单/ETag 接口 | `config.js: CONTENT_URL` + `app/content.js: fetchAndValidateContent()` |
| **可选校验和边车** | 内容线（决定要不要产出）、发布流程 | 同目录 `content.json.sha256`，`<64位小写hex>  content.json`（sha256sum 格式）。**取不到就降级**为自算哈希+结构校验，并把降级事实写进 meta（不假装比过） | `config.js: CHECKSUM_URL`、`app/content.js` |
| **`contentVersion` 比较规则** | Android 端必须同规则，否则两端对「谁更新」判断不一致 | 按 `.` 分段、逐段数值比较（非数值段按字符串）——与契约 §4.1（发布版 `[年,月,日,N]` 数值比、dev 串比、dev < release）一致；**纯字典序会把 `…14.10` 判成小于 `…14.9`**，所以不用字典序 | `app/content.js: compareContentVersion()` |
| **内容存储位置与格式** | 已装过旧版 Web 的浏览器（旧副本要能被新代码读到） | IndexedDB 库 `poetry-web`(v1) → 对象仓 `content` → 记录 `k='active'`/`k='staged'`，值为 `{k, doc, meta}`；`meta` 含 `contentVersion/formatVersion/sha256/integrity/bytes/fetchedAt` | `config.js: CONTENT_DB`、`app/store.js` |
| **资源缓存名字** | 已装过旧版 Web 的浏览器（清旧 cache 依赖这个前缀） | Cache Storage `pc-resources-<APP_VERSION>`，前缀 `pc-resources-` | `config.js: RESOURCE_CACHE_PREFIX/APP_VERSION` + `sw.js` 同名常量 |
| **`localStorage` 键空间** | — | **本版本完全不用 `localStorage`**（没有键，也就没有兼容负担）；离线副本只在 IndexedDB | `config.js: LOCAL_STORAGE_KEYS`（现在是空对象，作为显式声明） |
| **可分享 URL 形态** | 用户已分享出去的链接、Android 端「打开链接」、书签 | 哈希路由：目录 `#/`，诗 `#/p/<poemId>`（用契约里的稳定 id，不用标题）。**搜索不进 URL**（`?q=` 暂不做） | `config.js: ROUTES` + `app/main.js: parseHash()`；`app/render.js` 的链接都用 `ROUTES.poem()` |
| **`formatVersion` 支持范围** | 内容线（什么时候递增）、Android 端（同样要拒） | 本客户端只接受 `formatVersion === 1`：更高**不解析、保留旧内容**，更低也拒绝 | `config.js: SUPPORTED_FORMAT_VERSION` + `app/content.js: decideUpdate()` |
| **应用资源版本号** | 已缓存旧资源的浏览器、发布流程 | `0.1.0`，只在改代码时递增；它**不**参与内容版本比较 | `config.js: APP_VERSION` |
| **组内 / 分组次序权威** | Android 端、原型端、B 线设计的阅读次序 | **产物数组次序即权威**：给了整数排序键（IF-15）就一律不重排（目录与搜索都是，分组次序照 `dynasties` 数组）；一个键都没给时才退回本机拼音兜底，键类型不对也在状态面板写明。已由用户拍板 `--order source`（《文选》原顺序） | `app/render.js: hasProductSortKeys / productSortKeysStatus / groupPoems / searchPoems`；兜底比较器 `comparePoems` |

我暂定这些形态的理由、以及每条改动的影响面，都在上面的表里；**如果你要换其中任何一条
（比如搜索也要能分享、内容地址改成带哈希的清单、id 改成路径路由），告诉我，我按表改一处 + 同步 Android 端。**

其中最容易后悔的一条是**URL 形态**：一旦分享出去就收不回。当前选择「hash + 稳定 id + 搜索不进
URL」，好处是 Pages 上不需要重写规则、链接只跟 id 绑定（改标题不失效）；代价是链接里带 `#`，
且搜索结果页面不能直接分享。

## 8. 待协调（需要父会话 / 其他线决定）

1. **排序键类型要两端同规则（本轮新增，请确认 Android 与原型一致）**：我把
   「`authorSortKey`/`titleSortKey` 只有是**整数**（IF-15 整数名次）时才认产物次序」写成了规则；
   v0 式字符串键（或任何非整数）按「没给」处理，走本机拼音兜底并在状态面板写明。
   真实产物是整数键，不受影响；但如果 Android/原型把「键存在就算给了」（不看类型），
   遇到非整数键的老产物时两端会排出不同次序。
2. **`content.json.sha256` 边车要不要由 C 线产出**：不产出也不影响功能（自动降级），
   但产出才能真校验完整性。若要产出，建议 `tools/` 编译时一并写。
3. **夹具与真实内容的分界**：`fixtures/` 保留为测试夹具（e2e 与派变体都靠它），
   发布流程只能拿 `dist/content.json`；页面对夹具内容一律显黄条，不静默。
4. 应用资源更新的实测（发两版资源）与 SW 更新提示的交互，等发布流程定了再一起做。
5. 契约 §4.1 的 `contentVersion` 措辞已由 C 线写回，与 `compareContentVersion()` 一致
   （已补两条单元断言：发布版 > dev 版、dev 之间按十六进制串比），本轮无需再改。
