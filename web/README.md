# 索斐 — Web 端（静态、无框架、无构建步骤）

工程名 PoetryCollection；**应用展示名「索斐」**（用户 2026-10-14 拍板）。Android 端另在 `android/`。

这里只有纯静态文件：无框架、无打包、无 npm 依赖。部署目标是 GitHub Pages 这类静态托管，
**不假设能自定义响应头**。

> **视觉＝静默终端（深墨底）**，与评审通过的原型同源：`styles.css` 的令牌与
> `prototype/css/theme-tech.css` **同名同值**（57 项），并由 e2e **逐值断言**（见 §5）。
> 单主题（用户已定）：不做浅色备选、不做主题开关、不做偏好持久化。

## 1. 怎么看效果（确切命令）

Service Worker 只在 **http(s) 或 localhost** 下能注册；`file://` 直接打开必然没有离线能力，
那不是 bug（页面会如实显示「需要 https 或 localhost」）。

```bash
# 1) 放一份内容到 web/content.json：默认真实产物 dist/content.json 优先，没有才用占位夹具
node web/scripts/prepare-dev-content.mjs
#    也可 --from <file>（指定文件）或 --variant <name>（见下）

# 2) 起本地静态服务（零依赖，等价于 npx serve web）
node web/scripts/serve.mjs              # http://127.0.0.1:8080/
node web/scripts/serve.mjs --port 8137  # 换端口

# 3) 浏览器打开 http://127.0.0.1:8080/  （也可以用 npx serve web）
```

看「站点更新」的完整效果（**要发两版**，所以得改版本号）：

```bash
# 把站点版本从 0.1.0 改成 0.2.0（两个文件都要改，e2e 会交叉断言它们一致）：
#   web/app/config.js: export const APP_VERSION = '0.2.0';
#   web/sw.js:         const APP_VERSION = '0.2.0';
# 再改一次内容，例如 node web/scripts/prepare-dev-content.mjs --variant fixtureContent
# 然后刷新页面：会出现「有新版本」提示（不自动刷新），点「刷新到新版本」才整套切换。
```

一次跑完所有验证（无头 Chromium + CDP，零第三方依赖）：

```bash
git merge master        # 先对齐基点：这套 e2e 会读主线上的 schema/unknown-authors.json
                        # 与 dist/content.json，基点旧了会出现「文件不存在」这类假红
node web/tests/e2e-cdp.mjs
# 产物：web/tests/artifacts/（截图 + dom-dumps.txt + deploy/ 各版本部署目录，均已 gitignore）
# 本机 Chromium 不在默认位置时：CHROME_BIN=/path/to/chrome node web/tests/e2e-cdp.mjs
```

## 2. 目录

```
web/
  index.html            外壳（标题写「索斐」；内含静态的「正在装载站点…」，JS/内容没到时也不白屏）
  styles.css            ★ 静默终端主题：令牌与原型同源同值（见 §5）
  manifest.json         名称/作用域/图标（icons：启动图标 N1 的 svg + 192/512/maskable）
  icons/                图标资产（启动图标 N1 ＋ 标签页图标另一套无字记号；见 §5.2）
  scripts/build-icons.mjs           从只读交付源生成 icons/（svg + 用无头 Chromium 出 PNG）
  sw.js                 ★ Service Worker：站点的唯一缓存与更新通道（壳 + 内容一起缓存）
  app/config.js         ★ 所有对外接口常量集中在这里（见 §8）
  app/content.js        内容装载：单独取 + 结构校验 + 格式版本兼容检查（不做更新决策）
  app/render.js         纯渲染：分组目录 / 搜索 / 诗页（分行、分节、笔记）
  app/main.js           入口：先渲染外壳 → 单独取内容 → 渲染；站点更新提示与切换
  scripts/serve.mjs     零依赖静态服务
  scripts/prepare-dev-content.mjs   把一份内容 JSON 放到 web/content.json
  scripts/lib/variants.mjs          从基座派生测试变体（部署内容 / 失败内容 / 次序形状）
  fixtures/             **测试夹具（不是发布内容）**
  tests/e2e-cdp.mjs                 端到端验证（无头 Chromium + CDP）
  tests/lib/deploy.mjs              组装「部署目录」，用来真发两版
  content.json          本地生成物，已 gitignore（部署时才需要放置；Web 不产出 .sha256 边车）
```

`fixtures/` 里两份都是**测试夹具，不是发布内容**，页面上都会显示黄色提示：

- `content.placeholder.json`：占位夹具（真实产物不存在时也能开发），形状与产物一致（带整数
  `orderInSource`、**不带**两个拼音名次键），但正文只是几句广为人知的开篇，**非校对文本**；
- `content.no-sortkeys.json`：老产物形状（既没有 `orderInSource` 也没有两个拼音键，文件名
  `no-sortkeys` 是历史叫法），用来验证本机拼音兜底排序。

## 3. 次序：编译期是唯一排序权威（客户端不重排）

用户 2026-10-14 拍板两件事：① 组内次序用 `--order source`，**保留《文选》卷二十九原次序**
（A 线写入 `orderInSource` = 1..19，编译器已按此排好产物里的 `poems` 数组）；
② 产物**只保留 `orderInSource`**，`authorSortKey`/`titleSortKey` 不再发布（只在编译期内部用于排序）。

所以 Web 端的原则是：

1. **产物组内只要有任何一首带了整数 `orderInSource`** ⇒ 认定「产物已经排好了」，目录与搜索结果
   都**照产物数组次序原样渲染**，不重排；搜索 = 在数组次序上过滤，保持同一相对次序。
   分组的次序同样照产物给的 `dynasties` 数组（契约 §2 已按 `order` 升序）。
2. **一首都没带**（老产物 / 手写 JSON）⇒ 退回本机拼音排序兜底（`app/render.js: comparePoems`）。
3. `orderInSource` **不是整数**（形状不对）⇒ 按「没带」处理，走兜底，并且**在状态面板里写明**
   用的是兜底（不静默）。
4. **客户端不读 `authorSortKey`/`titleSortKey`**：即使产物里还带着（C 线的移除还没落地时），
   它们也不参与任何判定。e2e 有一条断言专验「只带这两个键、没有 `orderInSource` → 仍走兜底」。

「谁是佚名/未知作者」的**唯一来源是机器可读的 `schema/unknown-authors.json`**（契约正文只负责说明
来源，不再被任何代码或测试正则解析）。当前清单：`佚名`/`无名氏`/`阙名`/`未知`/`未详`/`不详`
（用户 2026-10-14 拍板把 `阙名` 并入）；空白作者由 `isUnknownAuthor` 的空白判定处理，不写进集合。
静态站点运行期读不到那个文件，所以 `app/render.js` 里放一份副本，**e2e 读文件并断言两份逐字一致**
（不一致时把两边数组都打出来）；Android 与编译器对齐同一份文件。
（`UNKNOWN_AUTHORS_FILE` 环境变量可把这条断言指向另一份清单文件，用于联调/自测，例如先核对一份
候选清单；它只影响测试，不改变运行时行为。）

钉住这个缺陷的回归断言（`tests/e2e-cdp.mjs`，两处独立）：① 真实产物第 1 首必须是 `行行重行行`，
且它的 `orderInSource === 1`（全场最小、数组首位；本机拼音重排会把它推到第 19 位）；
② 目录里「汉」组的 19 个诗名次序必须**逐字等于**《文选》原次序（硬编码在测试里）。

## 4. 离线与更新：内容随站点一起换（Service Worker 统一管理）

> **曾经的独立内容版本通道已移除。** 早先 Web 端有一套「内容单独更新」的机制：远端比对
> `contentVersion`、把内容单独存进 IndexedDB 的 `active`/`staged`、校验通过后原子切换引用，
> 还依赖可选的 `content.json.sha256` 边车。用户 2026-10-14 拍板把它**删掉**，理由是判据
> 「内容能不能单独发布」：Android 的 APK 要用户手动安装、内容得能单独热更，所以那边保留小纸条
> 清单；而 **Web 的内容与壳（HTML/JS/CSS）本来就是同一次部署一起换的**，独立通道只是多一套
> 会漂移的状态。删掉之后只剩一条真相来源（站点部署），也就不可能出现「旧壳配新内容」。

### 4.1 一条通道：站点缓存按 `APP_VERSION` 成对切换

| | 站点资源（壳） | 内容 |
|---|---|---|
| 放在哪 | 同一个 Cache Storage：`pc-resources-<APP_VERSION>` | **同一个** cache 里的 `content.json` |
| 谁写 | `sw.js` 的 install 预缓存（`cache: 'reload'`，绕开 HTTP 缓存） | 同上，和壳在同一份预缓存清单里 |
| 版本键 | 只有 `APP_VERSION` 一个 | 不再单独做更新决策（`contentVersion` 只在界面上展示） |
| 取用策略 | **cache-first**：本版本缓存里有就直接给，没有才去网络（且**不写回**本版本缓存） | 同左 |

- **成对生效**：装好新版本后停在 waiting，页面上只是提示；用户点「刷新」（或在诗页时回到目录）
  才切换。旧 SW 还在控制时，即使服务器已经换成新版本，页面拿到的仍是旧缓存里的**整套** ——
  这就是「不可能旧壳配新内容」的机制保证。e2e 里既断言了「服务器换成 v2 后页面仍是 v0.1.0 的壳
  与旧内容」，也断言了「服务器上单独换掉 content.json（不动版本）也带不跑页面」。
- **失败不留半套**：install 里任何一个文件取不到就让 install 失败，旧 SW 继续服务。
  activate 里删掉同前缀的旧 cache（`pc-resources-*`），所以服务器上不会累积历史版本。
- **`updateViaCache: 'none'`**：注册时强制每次都向服务器要比 `sw.js`（否则 HTTP 缓存可能把新版
  挡住），这是真实部署里必须的一条。

### 4.2 内容必须**单独取**，不许内联进 HTML/JS

这是用户特别关心的点：单独取才能在外壳到达后**立刻**渲染框架，并如实显示「正在取内容／失败原因」；
内联则坏网时没有可显示的中间状态、失败即白屏。所以：

- `index.html` 里有一个静态的「正在装载站点…」（JS 还没跑时也有可读状态）；
- `app/main.js` 的 boot 是「先渲染外壳 + 状态面板 → 再单独 `fetch('content.json')`」，
  期间显示「正在取内容…」；
- 部署文件里**没有任何诗题或正文**（e2e 有一条断言直接检查这件事），内容只以 URL 形式出现
  （`config.js: CONTENT_URL`、`sw.js` 的预缓存清单）。
- 实测体积（本轮实测，非估算；含图标落地后）：**壳 69.2 KB**（8 个：index.html、styles.css、manifest.json、sw.js、app/ 四个模块）
  **＋ 图标资源 30.6 KB**（7 个：`icons/` 下的 2 个 svg + 5 个 png，单独成组，不算进「壳」），
  **内容 27.5 KB**（真实 19 首的 `content.json`）。三者分开取，互不阻塞首屏。
  （这条行由 e2e 每次跑的时候打出来，数字取自本次运行 —— 见 §6。）

### 4.3 更新提示与「不打断阅读」（含取舍）

- 打开页面时浏览器会自动检查 `sw.js`（另有「检查站点更新」按钮手动触发 `registration.update()`）；
- 发现新版本 → **只置一个「有新版本」提示**（含版本号与「刷新到新版本」按钮），
  **不自动刷新**；
- 在诗页阅读时，正文不会被中途替换，也不会被自动刷新（e2e 实测：等待 2.5 秒文档没换、正文没变）；
- 用户点「刷新」，或**回到目录**时自动切换（回到目录=不再阅读）；
- **代价（诚实写明）**：不自动刷新意味着用户可能长时间停在旧版本 —— 提示必须清楚、可点，
  状态面板里也写明「长时间不点刷新就会一直停在旧版本」。这是为了不打断阅读主动选的口径，
  不是遗漏；将来若要更积极，可以改成「在目录页空闲 N 秒后自动切换」，但那要重新评估打断风险。

### 4.4 失败状态（全部如实显示原因，不白屏）

| 情况 | 界面表现 |
|---|---|
| 内容 JSON 解析失败 | 失败状态：「内容不是合法 JSON：…（N 字节）」+ 可重试；外壳与状态面板仍渲染 |
| 结构校验不通过 | 失败状态列出前几条错误（如 `poems[0].stanzas 全空`、`dynastyKey 未在 dynasties 中声明`） |
| `formatVersion` 与壳不匹配 | 失败状态说明这属于**部署不一致**（内容与壳应当一起发布），不解析 |
| 内容取不到（HTTP/离线且缓存缺内容） | 失败状态带上 HTTP 状态与原因（可能是这次部署缺 content.json，或离线且缓存里缺它） |
| 首次访问 + 离线（连壳都没缓存） | 浏览器自己的错误页 —— 应用还没机会运行，这一条只能诚实说明，不能假装有中间状态 |

### 4.5 诚实边界（写在页面上，也写在这里）

- **首次访问需要网络**；
- 离线副本是浏览器存储（Cache Storage），用户「清除站点数据」或浏览器回收存储时可能丢失，
  **不承诺永久存储**（状态面板里有「请求持久化存储」按钮，结果如实显示，授予也只是降低概率）；
- **不自动刷新** ⇒ 可能长时间停在旧版本（见 §4.3）；
- Service Worker 只在 https 或 localhost 下可用（`file://` 打开无法离线）；
- **线上首版仍带着异文栏位**：`v0.1.0+content-2026.10.16.18` 那次发布的站点里，诗页仍会显示
  「异文」（以及为空时的「未记录」）。本仓已按用户决定删掉它（与 Android 一致：只显示底本/来源），
  但要**重发一版、更新已部署的站点**之后线上才会消失——在这之前，线上行为与本仓代码不一致。

### 4.6 诗页显示集合（与 Android 端对照，以用户决定为准）

| 元素 | Web | Android | 说明 |
|---|---|---|---|
| 诗题 | 显示 | 显示 | |
| 时代 · 作者 · 年代 · 体裁 | 显示 | 显示 | 取值与顺序一致（`dynastyLabel · author · era · genre`，e2e 有断言） |
| 正文（逐行、空行=分段） | 显示 | 显示 | e2e 断言逐行文本与 JSON 完全一致 |
| 笔记（按需展开） | 显示 | 显示 | 无笔记时两端都如实留空（Web 常显一句「还没有笔记（未记录）」； Android 展开后显示「（无笔记）」） |
| 底本/来源 | 显示 | 显示 | Web 标签写「底本」，Android 写「底本/来源」（取值相同） |
| **异文（`variants`）** | **不显示** | 不显示 | 用户 2026-10-14 拍板：异文只存档、不上界面；产物保留字段、客户端仍解析与结构校验 |
| 诗的 `id` | **不显示** | 不显示 | **用户 2026-10-15 拍板：不上界面**（此前 Web 单方面多出「id」一行，是 P 线实测发现的跨端不一致）。地址仍是 `#/p/<id>`、`dataset.poemId` 照旧 ⇒ **深链接不受影响**；e2e 有反向断言（诗页可见文本不得出现诗的 id） |

## 5. 视觉：静默终端（深墨底）

用户 2026-10-14 选定的方向；规范整理在 **`docs/design/visual-tokens.md`**（唯一来源）。
本仓实现要点：

- **令牌与评审通过的原型同源**：`web/styles.css` 的 `:root` 与 `prototype/css/theme-tech.css`
  **同名同值**（57 项：颜色、字体、字号/行高/字距、圆角、过渡、`--stanza-gap`…）；
  变量名沿用原型（`--bg`/`--surface`/`--text`/`--poem-lh`/…），便于逐项对照。
- **「与规范一致」是可检查的**：e2e §1d **直接读原型 CSS 的令牌声明**，与本站 `:root` 的
  **计算值**逐项比对（缺一项、值差一档都会红并打出差异）；另有计算值层断言：底色 `#0e1315`、
  正文 `#dde5e4`、正文 17px / 行高 34px（=2×17）/ 字距 0.765px（=0.045em×17）、
  段间距 20.4px（=1.2em×17，元素级在夹具诗上验）、`box-shadow: none`、无关键帧动画、
  过渡只有颜色类且都是 0.15s、极淡 1px 网格。
- **结构记号三条**（规范 §4.1 的补漏，这套视觉「结构感」的表达方式）：组名左沿 2px 发丝竖线
  （`--accent-line`）+ 左内边距 0.6rem；计数渲染成 `[19] 首`（方括号是伪元素、色 `--text-faint`、
  0.85em、内外各 1px）；诗页题头**不画下划线**。三条都有断言。
- **不做**发光、霓虹、位移动画，也不做浅色备选/主题开关/偏好持久化（单主题是用户已定的）。
- 截图（原型口径，见 `web/tests/artifacts/`）：`theme-tech-desktop-hub.png`、`-desktop-poem.png`
  （1280×860@2x）、`theme-tech-mobile-hub.png`、`-mobile-poem.png`（430×932@2x）——
  与原型 `screenshots/desktop-*.png`、`mobile-*.png` 同口径。

### 5.1 无法与规范逐值对齐的地方（诚实边界）

- **浏览器计算值取整**：1px 网格的 `rgba(255,255,255,0.028)`，`getComputedStyle` 回读是
  **0.027**（alpha 三位小数），`transparent` 被写成 `rgba(0, 0, 0, 0)`；所以这条断言用数值容差
  （±0.002）而不是字符串相等 —— 规范里的 0.028 本身是对的，只是**回读**会取整。
- **字体回退**：字体串是 `'Microsoft YaHei UI', 'Microsoft YaHei', system-ui, sans-serif`；
  本机（Windows）有前两者，截图就是它渲染的；**没有这两个字体的机器会回退到 system-ui/sans-serif**，
  字形字宽会变。断言只保证「指定值 = 规范」，**不保证跨机同形**。
- **伪元素文字不进 `innerText`**：计数渲染成 `[19] 首` 靠伪元素，而 `innerText` 不含生成内容
  （实测 `"19 首"`）。所以断言检查伪元素的 `content/color/font-size/margin`，**另以截图**确认肉眼所见。
- **未验证**：真机/强光下的长时间阅读疲劳（规范也把它列为已知风险，且单主题**没有退路**）；
  Android 端逐值一致由 D 线各自断言，我只保证 Web 侧与规范一致。
- **引文块（`>`）**：规范 §6 给了等价取法（`--surface-sunken` 作底 + `--accent-line` 作左边线）；
  本仓笔记渲染是**最小子集**（段落/列表/粗斜体/转义，且全部 textContent），**不渲染引用块**，
  所以这一条没实现、也没有断言。
- `--test-*` 三个令牌本仓只用于「测试夹具内容」提示条（原型里那组本就是测试用色），产品谱不用它们。
- **与原型的有意差异**（规范 §4.2 已逐条记录，用户可否决）：
  ① 搜索框用「搜索」文字按钮、**不画**原型里那个放大镜（那是 `base.css` 三主题共用的纯装饰，
  不是 tech 方向的结构记号）；② 笔记头**不加** `n-badge`（原型里那是 `--test-*` 色的测试夹具标记，
  给用户自己的笔记打会误导）；③ **状态色只有两档**：信息→`--accent-*`，**警告与失败都用**
  `--warn-*`（不新增 error/红色令牌 —— 评审过的调色板就是这两条通道，且状态面板有明确文字说明
  「失败/警告」，颜色是次要通道）。**这三条是「有意不做」，不是漏了**；要改先看规范 §4.2。
- **目录页结构**（规范 §4.2 第 3 条标为「待台账确认」，本轮未改）：原型是「组卡片（含 3 首题名
  预览）+ 点组进入」，本实现是「组头 + 组内诗列表内联展开」。等台账/用户结论再动。

### 5.2 图标（启动图标 N1 ＋ 标签页图标另一套无字记号 M1）

用户 2026-10-15 选定：**启动/安装图标 = N1**（单字「索」的**矢量轮廓** ＋ 右下一条 accent 发丝角标；
交付源是只读的 `prototype/icons/svg/r4-N1-*.svg`）；**浏览器标签页图标 = 另一套「极简记号」M1**
—— 同一次裁决：favicon 另用一套极简记号（自绘、无字，可从 N1 的 accent 角标派生），
因为 N1 在 16/32px 下糊成一团（证据：`prototype/icons/out/round4-forms.png` 最后两列）。

| 文件 | 用途 | 谁引用 |
|---|---|---|
| `icons/icon.svg` | 启动图标（矢量；任意尺寸都锐） | `manifest.json`（`sizes: any`） |
| `icons/icon-192.png`、`icons/icon-512.png` | 安装图标（`purpose: any`） | `manifest.json` |
| `icons/icon-maskable-512.png` | 安装图标（`purpose: maskable`） | `manifest.json` |
| `icons/apple-touch-icon.png`（180） | iOS 主屏图标 | `index.html` 的 `<link rel="apple-touch-icon">` |
| `icons/favicon.svg` | **标签页图标（M1 记号）** | `index.html`（`type="image/svg+xml" sizes="any"`） |
| `icons/favicon-32.png` | 标签页图标的 **PNG 兜底** | `index.html` |

**M1 记号长什么样**（单列出来供复核）：画布 108×108（与 N1 同尺寸，便于对照）；底 `#0e1315` 满幅；
上面一个 accent `#4fb3a5` 的**方角 L** —— 右下一横臂 ＋ 右侧一竖臂，在右下角相接，
**厚 12、每臂 36**（外角落在 (80,80)），路径 `M 44 68 H 68 V 44 H 80 V 80 H 44 Z`。
等价说法：把 N1 那条 2.5 厚的 accent 发丝加粗到 12 —— 因为 16px 下 2.5 单位只有 **0.37px**（必然消失），
而 12 单位是 **1.78px**、每臂 5.33px（16px 下能认出形状）。**没有引入任何新颜色，也没有任何字**。

代价（同一次裁决里已写明，也是实测的）：它与启动图标**不同形**，且读不出应用名。
两套资产**并存**：启动图标仍是 N1，`manifest.json` 的 192/512 仍是 N1。

生成方式（两端各一个生成器，都从同一份只读交付源出发）：

```bash
CHROME_BIN='C:/Users/wsqsy/AppData/Local/Chromium/Application/chrome.exe' \
  node web/scripts/build-icons.mjs          # 生成 icons/ 的 svg + png（--check 只核对不写盘）
CHROME_BIN=... node web/scripts/build-icons.mjs --sheet   # 另出一张观感对照图（近似示意，不是真机）
node ../android/tools/make-launcher-icon.mjs              # Android 侧的矢量资源（同一份轮廓烙进坐标）
```

观感对照图落在 `web/tests/artifacts/icons-observation.png`（该目录已 gitignore）：N1 在 192/96/48/32/16
＋近似遮罩，M1 在 32/16，以及一条模拟标签栏。**它只是证据图，不是规范** —— 图里的遮罩与标签栏都是近似。

三条硬约束（两端同一口径，写在这里免得以后有人「优化」掉）：

1. **必须用轮廓，不得依赖运行时字体**：字形是 `outline.py` 从 Noto Sans SC（OFL）抽出的 `<path>`；
   两个 svg 里没有 `<text>`、没有 `font-*`，e2e §0i 有断言盯着。
2. `bg` 满幅；`fg` 落在系统**保证可见**的中心 72 方内。（原型自述的目标是「中心直径 66 圆」，
   实测 N1 的 accent 角标外角在半径 **33.812** 处、超 **0.812** 单位 —— 那是形态本身不是实现走样，
   详见 `android/README` 的「图标」一节。）
3. 图标现在是**独立文件**（不再是内联 `data:` URI）⇒ 7 个图标全在 `sw.js` 的预缓存清单里。
   e2e §0i 把 `index.html` 的 `<link>`、`manifest.json` 的 `icons`、`sw.js` 的预缓存清单与部署清单
   互相对一遍，并在首访后**逐项断言 7 个图标都进了本版本 cache**（少一个就会离线掉图）。

**未验证（诚实边界）**：

- **SVG favicon 在老浏览器上不生效** ⇒ PNG 兜底**不是可选**；但「哪些浏览器拿 SVG、哪些拿 PNG」
  没逐个浏览器实测过。
- 真实浏览器的标签页/书签渲染没逐个看过；**没在移动浏览器与真机上验证**，PWA 安装流程、
  iOS 主屏图标、真实启动器遮罩都没实测（本机无设备，且本任务明确不碰模拟器/设备）。
- **M1 记号是我按「16px 下还能认出形状」自评出来的**，没有经过用户评审 —— 要换形状的话，
  改 `web/scripts/build-icons.mjs` 里 M1 的参数重跑即可（不用动 N1 的启动图标资产）。
- `manifest.json` 的 `background_color`/`theme_color` 仍是原来的 `#ffffff`（本次**没改**：那是视觉决定，
  不是图标落地的事）—— 它与深墨底不一致，已上报。

## 6. 已验证 / 未验证

### 已验证（`node web/tests/e2e-cdp.mjs`，基座 = 真实产物 19 首，本机无头 Chromium 129，220/220 通过）

- **视觉令牌逐值对齐（§1d）**：直接读原型 CSS 的 57 项令牌声明与本站 `:root` 计算值逐项比对，
  以及计算值层的底色/正文色/字号/行高/字距/段间距/无阴影/无动画/0.15s 颜色过渡/网格；
  §4.1 三条结构记号（组名发丝竖线、`[19] 首` 伪元素括号、题头无下划线）也各有断言；
  §1e 按原型口径出四张截图（桌面 1280×860@2x、手机 430×932@2x，各一首屏一诗页）。

- **真发了 7 个版本**（v0.1.0 → v0.7.0，各自独立部署目录、同一 origin 依次替换）：新 SW 安装并
  等待、页面出现「有新版本」提示（含新版本号）、**两个 cache 同时存在**（旧的在服务、新的已就绪
  且内部也是壳+内容成对）、阅读中不自动刷新且正文不变、点「刷新」后**成对**切到新壳+新内容、
  旧 cache 被删、第三个版本用「回到目录后自动切换」路径生效、失败版本（坏 JSON / 坏结构 /
  formatVersion 更高）各自显示明确失败状态且重试不假装修好、最后发一版好的自愈。
- **cache-first 的配对保证**：服务器换成 v2 后页面仍是 v0.1.0 的壳与旧内容；服务器上单独替换
  `content.json`（不动版本）后页面取到的仍是本版本缓存里的内容。
- **内容单独取、不内联**：延迟 1.2s 下先看到外壳与「正在装载站点…」，JS 起来后显示「正在取内容…」
  且尚未有任何诗行；部署文件里没有任何诗题/正文；壳与内容体积分开报告。
- **图标接线（§0i，本次图标落地新增）**：`index.html` 的 `<link>（icon/apple-touch-icon）`、`manifest.json`
  的 `icons`、`sw.js` 的预缓存清单与部署清单互相对账（没互相对账就会出现「声明了但部署目录里没有」
  或「装了但离线掉图」）；两个 svg 断言无 `<text>`/字体元素；favicon 与启动图标断言**形状不同**（两套资产）；
  首访后逐项断言 7 个图标都在本版本 cache 里。
- **独立通道确实删干净**：`indexedDB.databases()` 为空、`localStorage` 为空、代码里没有
  `compareContentVersion/decideUpdate/putStaged/promoteStaged`、SW 里没有「内容不进缓存」的特例。
- 真离线（CDP 断网 **并 kill 掉本地服务进程**）重载仍可读；「清除站点数据」的两种后果都实测：
  外壳还在→应用自己的失败状态；连外壳都没了→浏览器错误页（应用没机会显示任何东西）。
- 次序策略与佚名清单（见 §3）在真实产物上逐字断言；整轮无未捕获 JS 异常。

**真实内容没有覆到的两条路径（诚实说明）**：A 线这份 19 首全部是**单节**、`notes` 全部为 `null`，
所以「空行分段」与「笔记展开」在真实内容上**没有样本**；它们是用派生部署内容（加一首带空行分段
+ 测试笔记的诗）验的，那份内容在界面上带「测试夹具内容」黄条。用户笔记目前不存在，是真实状态。

**这套 e2e 对机器负载敏感（实测）**：同机跑 Gradle / 多个 Chromium 时，SW 安装、截图与页面
加载都会变慢，**取一次快照就跟期望值比**的断言会随机报红（本人复现过：同机三个 Gradle 时
4 次里红 3 次，红点同一处）。现在凡是断言「缓存集合 / SW 版本 / 页面状态」的地方都写成
**轮询等条件成立**，不取瞬时快照：

- 「旧站点缓存仍在」不再断言「此刻只有旧 cache」—— 新 SW 可能已经装好并写好新 cache
  （旧的在服务、新的就绪），这是**正常状态**，不是失败；
- 「两个缓存同时存在」「旧 cache 已被新 SW 删掉」「只留下 v3 的缓存」「重新访问后缓存重建」
  都改成等到集合真的等于期望值（`waitForSiteCaches` / `waitForCacheEntry`）；
- 首访时「内容先到、SW 还在装」是并行关系，所以 §2 的缓存断言前先等缓存就位；
- 「重试取内容后仍是同一失败原因」改成等重试跑完（`loading` 回到 false）再比，不再睡固定时间；
- 「错误页接上」不再睡固定时间，改成等「外壳与 `window.__app` 都不在」；
- 「状态面板显示缓存含 content.json」也在等文本出现；
- 「loading 状态」那一组改成在**同一个 evaluate** 里把「文案 + 是否仍在等内容」一起读出来，
  避开两次往返之间的窗口；
- 截图（`Page.captureScreenshot`）给 20s 超时 + 一次重试，仍失败只记 WARN 并在汇总里单列
  「截图 x/y 成功」，**不影响行为断言**（截图是证据产物，验的不是行为）；
- 应用侧顺带放宽：`applyUpdate` 等 controller 换代最多 12s 再兜底刷新（重载时机器可能很忙），
  最坏情况只是先刷回去、提示再出现一次，不会把新旧版本混在一起；
- **端口不再写死**：默认取系统分配的空闲端口，并在起静态服务 / 起浏览器**之前确认端口是空的**
  （已占用就直接停下报错，不静默复用）。写死 8137/9237 时，**两个人（或两轮）同时跑同一套
  e2e 会串台**：本轮的 Chrome 会连到另一轮的服务器，报出来是「版本号对不上」这种看不懂的失败。
  这条是实测出来的（本人复跑时连着两次红，evidence 是 `appVersion 0.7.0` + 另一棵树的内容版本
  —— 那是并发跑的另一轮在占端口，不是本树）。可用 `TEST_PORT` / `TEST_DEBUG_PORT` 固定它。

- **部署版本号不写死**：e2e 里各次部署（v2/v3/三种失败/自愈）的 `APP_VERSION` 一律从当前
  `APP_VERSION` **派生**（minor + N），并在部署前自检「都与当前版本不同、且互不相同」——
  写死会在真发布演练时撞车：那时「部署的新版本」与当前版本相同，页面永远不会出现「有新版本」，
  超时症状会**伪装成时序问题**（实测踩过）；同理，部署用的内容版本也断言与基座不同，
  否则「新内容生效」的断言是空洞的。

它**不能**证明：真实弱网/高丢包下的行为；CDP 的 offline/latency 与真实网络的差别；移动浏览器
（iOS Safari 等）的存储回收与 SW 更新节奏差异；Cache Storage 配额耗尽时的表现。

### 未验证

- **没有部署到真实 GitHub Pages**（未获授权），没在 https + 子路径下跑过。子路径能工作是因为
  `sw.js` 用 scope 相对 URL 预缓存，但没有实测。
- 没在移动浏览器 / 真机浏览器上验证；没做 iOS/Safari 兼容验证。
- 没做多标签页并发切换、长时间挂机、大内容量（几百首以上）的性能验证。
- 视觉/交互未评审；无障碍只做到语义标签与 `<details>`，对比度未核对。
- **安装体验仍未验证**：`manifest.json` 现在**带上了**图标（192/512/maskable），但「安装到桌面」
  的真实体验（安装横幅、启动画面底色、桌面图标在真实启动器里的观感）**没有**在真机/移动浏览器上验证过，
  本轮不承诺；图标观感只做到无头 Chromium 的对照图（见 §5.2 与 `web/tests/artifacts/icons-observation.png`）。

## 7. 部署到静态托管（Pages）注意点

1. 要发布的文件：`index.html`、`styles.css`、`manifest.json`、`sw.js`、`app/`（四个模块）、
   `icons/`（启动图标 ＋ 标签页图标，共 7 个文件；见 §5.2）、
   以及 `content.json`（Web 侧**不产出也不读** `content.json.sha256` 边车，见 §8）。`web/fixtures/`、
   `web/tests/`、`web/scripts/` 不发布（`web/tests/lib/deploy.mjs` 里有一份 `DEPLOY_FILES` 清单，e2e 也断言了
   部署目录里没有测试文件；发布流水线侧的顶层白名单在 `release/lib/artifacts.mjs`，`icons` 已加进去）。
2. `index.html` 用**哈希路由**，不需要服务器重写规则；刷新深链不会 404。
3. 内容地址是相对路径（`content.json`），`/repo-name/` 子路径部署也能用。
4. 缓存控制不用管：资源与内容由 SW 自己缓存；Pages 的响应头不可自定义，本项目也不依赖它。
   SW 的**作用域**就是它所在的目录。
5. 发新版：改 `APP_VERSION`（**`app/config.js` 与 `sw.js` 两处都要改**，e2e 会交叉断言，
   漂移会报红），同时把新 `content.json` 一起发布；两者是同一批产物。
6. 不要用同一个 `APP_VERSION` 重发（会既有旧 cache 又有同名新 cache，浏览器可能沿用旧的）。
   编译器现在也会拒绝「同版本产物重编」（`VERSION_NOT_MONOTONIC`）——重编同一版本时先清掉
   `dist/content.json` 或显式传 `--previous-version`，这条属于发布流程（F 线）。
7. `sw.js` 自身不要被 CDN 长缓存：注册时已经用 `updateViaCache:'none'` 兜住，但发布流程
   最好也别给 `sw.js` 设置长 `max-age`。

## 8. 接口决定（暂定，待用户确认）

判据：**明天要改它，是不是有别人也得跟着改？** 下面的每一条都属于「别人会跟着改」的接口。
为了便于一处改，所有常量集中在 `web/app/config.js`（`sw.js` 里经典 worker 无法 import 的
常量由 e2e 交叉断言保持一致）。

| 接口 | 谁依赖 | 暂定成什么样 | 要改的话动哪里 |
|---|---|---|---|
| **内容文件位置/名字** | Android 端（同一份产物）、内容线 C、发布流程、已上线的站点 | 站点根下 `content.json`（`dist/content.json` 原样发布），相对路径引用，**单独取、不内联** | `config.js: CONTENT_URL`、`sw.js` 的预缓存清单、发布脚本 |
| **站点缓存名字** | 已缓存过旧站点的浏览器（清旧 cache 依赖这个前缀） | Cache Storage `pc-resources-<APP_VERSION>`，前缀 `pc-resources-`；**壳与内容同处一个 cache** | `config.js: RESOURCE_CACHE_PREFIX/APP_VERSION` + `sw.js` 同名常量 |
| **站点版本号** | 已缓存旧资源的浏览器、发布流程 | `APP_VERSION`（`0.1.0` 起），发新版必须递增；是**唯一**的版本键 | `config.js` + `sw.js`（两处，e2e 交叉断言） |
| **更新检查协议** | 发布流程、已上线站点 | **没有**额外的内容清单接口：浏览器按标准 SW 生命周期取 `sw.js`（`updateViaCache:'none'`）；内容随站点一起换 | `sw.js`（install/activate/updatefound） |
| **内容版本 `contentVersion`** | 内容线 C、Android 端（那边仍用它做热更决策） | Web **只展示、不参与决策**（状态面板里注明「仅展示」） | `app/main.js` 的状态面板 |
| **`content.json.sha256` 边车** | 发布线（去掉产出）、Android 端（那边仍需要远端清单里的 `sha256`） | **Web 侧不产出、也不依赖**（用户 2026-10-14 拍板）。完整性由「同一次部署 + HTTPS + SW 预缓存整体性」承担；没人消费的边车只会让人以为还有一道校验环节 | `web/` 侧已无此项（`config.js` 无 `CHECKSUM_URL`、`prepare-dev-content.mjs` 不再写它）；发布线去掉产出 |
| **`formatVersion` 支持范围** | 内容线（什么时候递增）、Android 端（同样要判） | 只接受 `=== 1`；不匹配按**部署不一致**处理（内容与壳一起发布才对） | `config.js: SUPPORTED_FORMAT_VERSION` + `app/content.js: checkCompatibility()` |
| **组内 / 分组次序权威** | Android 端、原型端、B 线设计的阅读次序 | **判定依据 = `orderInSource`**：组内有任何一首带整数 `orderInSource` 就一律照数组次序（目录与搜索都是，分组次序照 `dynasties` 数组）；一首都没带才退回本机拼音兜底 | `app/render.js: hasProductOrder / productOrderStatus / groupPoems / searchPoems` |
| **可分享 URL 形态** | 用户已分享出去的链接、Android 端「打开链接」、书签 | 哈希路由：目录 `#/`，诗 `#/p/<poemId>`（用契约里的稳定 id）。**搜索不进 URL**（`?q=` 暂不做） | `config.js: ROUTES` + `app/main.js: parseHash()` |
| **本地存储键空间** | — | **完全不用 `localStorage`，也不用 IndexedDB**（离线副本只在 Cache Storage 里） | `config.js: LOCAL_STORAGE_KEYS`（空对象，显式声明） |

最容易后悔的是 **URL 形态**（分享出去收不回）：当前选择「hash + 稳定 id + 搜索不进 URL」，
好处是 Pages 上不需要重写规则、链接只跟 id 绑定（改标题不失效）；代价是链接里带 `#`，
且搜索结果页不能直接分享。要换请先说，我按表改一处 + 同步 Android 端。

## 9. 待协调（需要父会话 / 其他线决定）

1. **发布流程要改的地方（F 线）**：一次发布 = 新 `content.json` + 递增的 `APP_VERSION`
   （`config.js` 与 `sw.js` 两处）+ 同批发布；`sw.js` 不要长缓存；重编同版本产物会被编译器拒
   （`VERSION_NOT_MONOTONIC`）。发布白名单已与 `web/tests/lib/deploy.mjs: DEPLOY_FILES` 求并
   （F 线自动跟我的发布集，不另写一份清单）。
2. **匿名作者清单的唯一来源是 `schema/unknown-authors.json`**（含 `阙名`，用户 2026-10-14 拍板）：
   我按负责人转达的决定把 `阙名` 并入 `app/render.js` 的副本，e2e 改成**读那个文件逐字核对**
   （不再正则解析契约散文——以前一改措辞就报「找不到清单」，对排查没帮助）。
   **已解决**：该文件已在 master（`4c97c27` 起，C 线 `46a9e87` 又加过一次），我这侧实测
   「清单文件存在 + 与 `UNKNOWN_AUTHORS` 逐字一致」两条均绿（全套 151/151）；编译器与 Android
   对齐同一份文件。若清单以后变了，这条会直接把两边数组打出来。
3. **`content.json.sha256` 边车：已解决**（2026-10-16）——`web/` 侧不产出也不依赖；发布线也已
   去掉产出与检查（`release/build-release.mjs` 里留了说明，`release/README.md` 与
   `docs/design/release-pipeline.md` 的发布白名单明确它「绝不发布」）。
4. **多标签页/长期挂机的更新行为**：当前是「有提示、不自动刷新」；若用户希望更主动
   （例如目录页空闲后自动切换），需要重新评估打断风险，我再改。
5. **契约 §2.1 的键序表**（已在 master 里对齐）：规范键清单不含 `authorSortKey`/`titleSortKey`，
   `schema/content.schema.json` 里也是 0 次；只剩几处刻意留痕说明它们只在编译期内部用。
6. **视觉已落地**（静默终端，见 §5）：令牌与原型同源同值、e2e 逐值断言。若原型/规范再调整，
   改 `styles.css` 一处即可，令牌断言会立刻指出差异（不会静默漂移）。
