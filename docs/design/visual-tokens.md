# 视觉令牌（跨端唯一规范）——「静默终端」

> **唯一来源**：`prototype/css/theme-tech.css`（用户 2026-10-14 从三个方向中选定的那一版）。
> 本文件只是把它**规范化成两端都能照做的值**，不引入任何新设计；**值必须逐项一致**，两端不得各自微调。
> 谁改这里的值 = 改视觉决定，要先经用户评审（见 `docs/review-gates.md` A2）。

## 1. 取向（一句话）

深墨底 + 低饱和青灰 + 发丝线 + 等宽数字/标签；**科技感只靠「结构感」表达**。
**明确不用**：霓虹、发光、扫描线动效、渐变高光。**无阴影**（`shadow: none`）。

## 2. 颜色

| 令牌 | 值 | 用途 | 对比度（实测） |
|---|---|---|---|
| `bg` | `#0e1315` | 页面底色 | — |
| `bg-sticky` | `rgba(14,19,21,0.92)` | 吸顶栏 | — |
| `bg-pattern` | 1px 网格 `rgba(255,255,255,0.028)`，双向 | 极淡结构感 | — |
| `surface` | `#141b1e` | 卡片/行 | — |
| `surface-hover` | `#182124` | 行悬停 | — |
| `surface-sunken` | `#111719` | 凹陷区（如搜索结果） | — |
| `text` | `#dde5e4` | 正文 | **14.61:1**（远超 AAA） |
| `text-dim` | `#98a8a6` | 次要文字 | 7.56:1（AAA） |
| `text-faint` | `#788a88` | 更淡的小字（来源/计数） | **5.16:1**（bg）/ 4.80:1（surface）——均达标；**这是修过的值**，原来的 `#6d7d7c` 只有 4.34:1，低于 AA |
| `line` | `#233034` | 发丝分隔线 | — |
| `line-strong` | `#35494d` | 稍强分隔线 | — |
| `accent` | `#4fb3a5` | 强调（低饱和青绿） | — |
| `accent-strong` | `#62c6b7` | 强调-强 | — |
| `accent-text` | `#7fd4c6` | 强调文字（链接等） | 10.81:1 |
| `accent-soft` | `rgba(79,179,165,0.10)` | 强调底 | — |
| `accent-line` | `rgba(79,179,165,0.38)` | 强调边 | — |
| `warn` / `warn-text` | `#c9a24a` / `#dcc078` | 提示（如「测试数据」横幅） | warn-text 10.56:1 |
| `warn-soft` / `line-warn` | `rgba(201,162,74,0.08)` / `rgba(201,162,74,0.34)` | 提示底色/边框 | — |
| `mark-bg` / `mark-text` | `rgba(79,179,165,0.22)` / `#eaf5f3` | 搜索命中高亮 | — |

## 3. 字体与排版

| 令牌 | 值 | 说明 |
|---|---|---|
| `font-body/poem/title/ui/note` | `'Microsoft YaHei UI', 'Microsoft YaHei', system-ui, sans-serif` | **全部无衬线**——所以「Android 没有宋体」这个问题不存在 |
| `font-mono` | `'Consolas','SFMono-Regular',ui-monospace,monospace` | 仅用于 id/计数这类技术性文字 |
| `font-size` / `lh` / `ls` | `15px` / `1.75` / `0.005em` | 界面文字 |
| `poem-size` / `poem-lh` / `poem-ls` | `17px` / **`2`** / **`0.045em`** | **正文（读诗区）**：行高 2 与字距是这套视觉的核心 |
| `note-size` / `note-measure` | `13.5px` / `36em` | 笔记 |
| `title-size` / `title-weight` / `title-ls` | `1.5rem` / `500` / `0.1em` | 诗题 |
| `brand-ls` | `0.3em` | 品牌名「索斐」字距 |
| `gname-ls` / `ptitle-ls` | `0.16em` / `0.06em` | 组名 / 列表里的诗题 |

## 4. 间距与形状

| 令牌 | 值 |
|---|---|
| `stanza-gap` | `1.2em`（**段间空行**——正文分段靠它表达，不得用 0） |
| `group-gap` | `0.6rem` |
| `row-pad` | `0.9rem 1.05rem` |
| `pad` | `1.25rem` |
| `measure` | `660px`（正文最大宽度） |
| `radius` / `radius-s` / `radius-pill` | `4px` / `3px` / `3px` |
| `shadow` | `none` |
| 动效 | 仅 `color/border-color/background` 的 `0.15s ease`；**不做位移/缩放/发光动画** |

## 4.1 结构记号（**这套视觉的可见部分，两端都要有**）

⚠️ 本节是**补漏**（对话侧 2026-10-15 逐项比对时发现，我初版漏了）：原型 `theme-tech.css` 末尾有三条 tech 专属规则，它们**不是装饰细节**，而是这套方向「结构感」的表达方式——**漏掉它们，目录页/诗页会与用户认可的那一版长得不一样**（`prototype/screenshots/desktop-hub-tech.png` 里可直接看到前两样）。

| # | 记号 | 原型实现 | 两端怎么落 |
|---|---|---|---|
| 1 | **组名左沿一条发丝竖线** | `.grouprow .gname { padding-left: .6rem; border-left: 2px solid var(--accent-line) }` | Web：CSS 同写；Android：组名左侧 `2.dp` 竖条（色＝`accent-line`）+ 左内边距 |
| 2 | **计数写成 `[3] 首`**（方括号是这套视觉的记号） | `.gcount b::before { content:'[' }` / `::after { content:']' }`；括号色 `--text-faint`、字号 `0.85em`、内外各 `1px` | Web：CSS 同写；Android：计数文本拼成 `[3] 首`，括号段用 faint 色 |
| 3 | **诗页题头不画下划线** | `.poem-head { border-bottom: none; padding-bottom: 0 }` | 两端都不加那条分隔线 |

## 4.2 与原型的有意差异（记录，用户可否决）

| # | 差异 | 为什么 | 状态 |
|---|---|---|---|
| 1 | **搜索框用「搜索」文字按钮，不画原型里那个放大镜**（原型 `base.css .search .search-icon` 是纯 CSS 圆的装饰，三个主题共用） | 文字按钮是**明确的可用性**，且放大镜不是 tech 方向的结构记号（§4.1 那三条才是，必须一致） | 有意差异；用户可否决 |
| 2 | **笔记头不加 `n-badge` 徽标**（原型里那是 `--test-*` 色的**测试夹具标记**） | 产品里的笔记是用户自己的，打「夹具」徽标会误导；§6 已写明 `--test-*` 只供夹具 | 有意差异；用户可否决 |
| 4 | **状态色只有两档**：信息→`--accent-*`；**警告与失败都用**`--warn-*`（**不新增 error/红色令牌**） | 评审通过的调色板就是 accent/warn 两条通道；状态面板有明确**文字**说明「失败/警告」，颜色是次要通道；新增红色＝规范变更且要 Android 同步 | 有意差异；用户可否决 |
| 3 | **目录页结构**：原型是「组卡片（含 3 首题名预览）+ 点组进入」；实现是「组头 + 组内诗列表内联展开」 | 产品当前只有 1 个组（19 首），二级页无意义 | ⚠ **待台账确认**（是否是既有决定；若不是，交用户拍板） |

> **本节这些差异是「有意不做」，不是漏项**——改代码前先读本节。本线一直在防「评审通过了却没接线到实现」；同样要防**反向漂移**（把有意差异当漏项补回去）。Web 侧已在 `web/README.md` §5.1 记同一份清单（E 主动补的，动机就是防反向漂移）。

## 5. 两端映射（怎么落到各自机制）

| 令牌类 | Web（`web/styles.css`） | Android（Compose `MaterialTheme`） |
|---|---|---|
| 颜色 | CSS 变量（与原型同名） | `darkColorScheme(background=…, surface=…, onSurface=…, onSurfaceVariant=…, primary=…, outline=…)` |
| 正文排版 | `--poem-size/--poem-lh/--poem-ls` → `.poem-line` | `TextStyle(fontSize=17.sp, lineHeight=34.sp, letterSpacing=0.045.em)` |
| 段间空行 | `.stanza + .stanza { margin-top: var(--stanza-gap) }` | 段落之间 `Spacer(1.2.em → 约 20.dp)` 或 `Arrangement.spacedBy` |
| 发丝线 | `border: 1px solid var(--line)` | `Divider(color=…)` / 1dp border |
| 无阴影 | `box-shadow: none` | 不用 `elevation`（或置 0） |
| 极淡网格 | CSS `background-image` 网格 | 可省（移动端不做），**但不得用别的方式替代「科技感」** |

## 6. 与其它决策的关系

- **单主题**（用户已定）：只有这一套颜色，**不做浅色备选、不做切换开关、不做偏好持久化**。
- **异文不上界面**：`.poem-foot` **不得渲染 `variants`**；保留「底本/来源」。
  **Web 是否额外显示诗 `id` 属未决**（在 `docs/status.md` 未决清单里），本规范**不替它下断言**。
- **笔记里的引文块（`>`）**：原型用的是 `--test-*` 那组（那组本是测试夹具用色）。产品侧若出现引文，建议用 `--surface-sunken` 作底 + `--accent-line` 作左边线（观感等价）——**这是负责人补的等价取法，用户可否决**；`--test-*` 三个令牌保持「仅测试夹具使用」，不进产品谱。
- 真机/强光下长时间阅读的疲劳**仍未验证**，且因为单主题**没有退路**——这是已知风险，不由本次实现消除。
