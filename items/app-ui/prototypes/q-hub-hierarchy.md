# 原型：目录页的层级表达（讨论用）

> **这一份是什么**：**讨论原型**——用来让用户对「目录页的层级怎么形成、收起/展开怎么辨认、关于入口放哪」做判断的材料。
> **它不是**：产品实施、不是发布、**不是已采纳规格**。
> 两个可打开的文件（自包含单文件，双击即开）：
> - `items/app-ui/prototypes/q-hub-hierarchy.a.html` —— 候选 A「留白层级」（长图 `q-hub-hierarchy.a.png`）
> - `items/app-ui/prototypes/q-hub-hierarchy.b.html` —— 候选 B「结构记号」（长图 `q-hub-hierarchy.b.png`）
>
> 原型里点组头就能开合（真鼠标事件已实测，见 §11）。

---

## 1. 它回答什么、不回答什么

**回答**：信息层之外，**层级用什么手段表达**、**收起/展开怎么被认出来**、**「关于」放上还是放下**。

**不回答**（这些是已定的，本原型照做、不重新提问）：

- 组头＝**组名＋数量**；诗目＝**题名＋作者**（作者次要）；
- 目录页**只留一个**「关于」入口；
- **不显示**应用名、搜索、笔记标记、题名预览；
- **不显示应用名**这一条出自用户 `q-52a14e2c` ✓ ⇒ 所以本原型**不把「要不要显示应用名」做成问题**，只是把它当既定条件画出来（A 顶部那一行因此只有「关于」两个字）。

## 2. 两个轴（**可以分开选、可以混搭**）

两个候选的差别**不是一个整体的两个版本**，而是**两个互相独立的轴**：

| | **轴① 层级怎么形成** | **轴② 关于入口放哪** |
|---|---|---|
| **候选 A「留白层级」** | **不画卡片**。组头＝一行：组名（较大字号）＋右侧 `[19] 首` ＋最右一个**三角记号** `▾`（收起时 `▸`）；组头**与页底同色**、其下压一条**极淡发丝线**；诗目**缩进**、行间发丝线；作者小字弱化在题名右侧。层级靠**字号／留白／横发丝线**。 | **顶部极简一行**：**只有「关于」**（右对齐）。**不显示应用名**。 |
| **候选 B「结构记号」** | **不画卡片**。组头＝左侧一条 **2px accent 发丝竖线**（规范 §4.1 记号①）＋组名＋右侧计数；**收起/展开的记号由方括号承担**：`[+] 19 首`（收起）／`[−] 19 首`（展开），**记号只表达状态**；诗目**平铺不缩进**，靠**竖线与字号**形成层级（竖线从组头延续到组内，组与组之间断开）。 | **底部**：**只放「关于」这一项**（一个入口）。⚠ **不附加**状态位／版本号／任何其他未采纳信息。 |

**可以混搭**：例如 **A 的层级 ＋ B 的关于位置**（顶部那行不要、改成底部只放关于）。**我会把两个轴分开记录**，不是「只能二选一」。

⚠ 本材料**只画了两种组合**（A 的层级＋A 的位置 / B 的层级＋B 的位置）；其余两种混搭没有出图，**不代表不支持**，只是没画。要哪张我再补。

## 3. 输入依据（这份材料只用了这些）

| 依据 | 用到了什么 |
|---|---|
| `items/app-ui/item.md`（**当前权威**，只读，未改） | 页面集合与每页信息：组（组名＋`[n] 首`，可折叠）＋诗行（题名）＋「关于」入口；**不要**搜索入口、笔记标记、组内题名预览 |
| 用户 `q-e571f88e` ✓ | **首次全部收起**——**只有一个组也收起** |
| 用户 `q-d28c4e4e` ✓ | **整个组头可点击**（组名、数量、空白**同属一个操作**；标记**只表达状态**） |
| 用户 `q-0736540b` ✓ | 各组**独立展开**（可同时展开两组，不是手风琴） |
| 用户 `q-52a14e2c` ✓ | 「应用名不在目录重复显示」⇒ 目录页不出现应用名 |
| `docs/design/visual-tokens.md` §2/§3/§4/§4.1 | 颜色、排版、间距形状、**§4.1 三样结构记号**（组名左沿发丝竖线／计数 `[19] 首` 的方括号／诗页题头不画下划线） |
| `prototype/css/theme-tech.css`（只读，未改） | 令牌的**活来源**；本原型的内嵌快照逐值照抄它（见 §11.4） |
| `android/app/src/main/assets/content/content.json` | **真实内容**：1 个组（`汉`）、19 首、作者一律「佚名」（只读取出题名与作者，未改动内容） |

⚠ **上面这三条（`q-e571f88e` 全部收起含单组 / `q-d28c4e4e` 整组头可点击 / `q-0736540b` 独立展开）是已定项，不是未决项——请不要让用户重选。**

⚠ **我先前写错的两条措辞，就地更正**（不再写成「与 `item.md` 不一致」）：

1. **「左沿发丝线」不是本轮已选的层级** —— 它只是**候选 B 的探索记号之一**（§2 轴①）；
2. **「状态位」不在已明确清单里** —— 它**既不是已选项、也不是本轮待选项**：本原型的 B 底部**只放「关于」**，不夹带状态位／版本号（§11 有断言）。

⚠ **一个阅读本工作树时会碰到的现象（不是冲突）**：负责人 2026-10-15 告知**当前主树上的 `items/app-ui/item.md` 已有明确结果、并记下上面三条 q**；而**我这棵工作树里的那份仍是提交 `166730f` 那一版的文字**（上面那两个词就是它的旧措辞）。我**没有改 `item.md`**（不在写入范围），也**没有把旧措辞当作依据** —— 本材料按上面三条 q 与任务书规格实现。

## 4. 已明确的信息与行为（本原型**只准用这些**）

**信息**：只留**关于**入口；不显示应用名／搜索／笔记标记／题名预览；组头＝组名＋数量；诗目＝题名＋作者（作者次要）。

**行为**（两端页里都实现了）：

- **首次（无既有状态）全部收起——单组也收起**；
- 各组**独立**展开（**可同时展开两组**，不是手风琴）；
- **整个组头可点击**（不只是记号那一小块）；
- **记号只表达状态**；
- 从诗页返回目录保留原位置 —— **原型里未实现**（诗目是 `#/p/<id>` 的链接，点了只改 hash、没有诗页），按任务书写进文档即可。

## 5. 一页里的五个实例各是什么

每一页都用**同一套逻辑**渲染出**五个各自独立记状态**的小实例（互不影响），所以一页里能同时看到所有状态：

| 块 | 内容 | 状态 |
|---|---|---|
| ① | **真实内容 1 组 19 首** | **首态**：全收起（单组也收起）—— 可当场点 |
| ② | **真实内容 1 组 19 首** | **展开**（为了一页里能看到这个状态，本实例**预置**为展开；真机首次进入是全收起） |
| ③ | 多组布局夹具 | **全收起** |
| ④ | 多组布局夹具 | **展开一组** |
| ⑤ | 多组布局夹具 | **同时展开两组** |

⚠ ②④⑤ 是**预置状态的展示件**，不是「首次进入」的样子；**「首次全收起」由 ①③ 两个实例证明**，并由 §11.1 的断言在真鼠标点击下复验。

## 6. `▸ ▾` 与 `[+] [−]` **都是探索记号**（不算已采纳）

- 这套视觉**没有**对应这两个记号的令牌，规范 §4.1 里也没有它们；
- **没有令牌也不影响做**：这里就用**字形本身**表达（`▸` U+25B8 / `▾` U+25BE；`[+]` `[−]` 用 U+2212）；
- 它们**只是「把状态标出来」的一种写法**，**不要读成定了的规格**；
- 记号带 `aria-hidden="true"`，状态由组头的 `aria-expanded` 表达（不给屏幕阅读器读两遍）。

## 7. 未表达事项（这份材料**没有**表达的）

- **桌面／Web 宽度**：**没有表达**。**已实测的是移动 430px**（§11.6：无横向溢出）与长图里的**并排比较栏（约 500px）**；**更宽的桌面排布没有表达**；
- **组头滚动吸顶**：**没做**（原型里组头不吸顶）；
- **展开状态跨重启记忆**：**没做**（每次打开都回到全收起）；
- **动画／过渡**：**只有**颜色/边框/背景的 `0.15s ease`（令牌里的 `--row-transition`）；**没有**位移、缩放、高度动画、发光；
- **完整无障碍验证**：**没有做**。只做到两件最基础的事——组头是 `<button type="button">`（不是 div 冒充可点元素）＋ `aria-expanded`＋`aria-controls`；**未做**屏幕阅读器实机验证、未做键盘全流程/焦点顺序验收、未做对比度复测（颜色是照抄快照）；
- **状态位／加载／失败／离线**：**没有表达**（那是「态」，不是本次要问的）；
- **诗页**：没有（诗目点了不会进诗页）；
- 视觉本身（颜色/字号/发丝线）**不是本次要评审的对象**，是照抄的既有令牌。

## 8. ⚠「选 A / 选 B **不等于整页批准**」

**选 A 或选 B，只表示「层级怎么形成／关于放哪」这两个轴上的倾向**，**不构成对目录页整页的批准**——信息项、文案、状态位、诗页返回位置等等都还没在这次里被看过。这是**信息层之外的层级表达探索**。

## 9. 关于「多组布局夹具」

- 真产物现在**只有 1 个组**，多组排布**没有真实数据可看**，所以只能用夹具；
- **夹具数据只存在于这两个原型自己的脚本里**（`FX_GROUPS`），**不进产物、不改真实诗、不是内容**；
- 每个夹具块顶上有一条**醒目横幅**，页内固定写着：**「仅布局夹具：不是内容、不代表真实数据、不改真实诗」**；
- 夹具的组名故意写成 `夹具·先秦` / `夹具·汉` / `夹具·魏晋`，题名写成 `夹具题名一01…`、作者写成 `夹具作者甲/乙` —— **故意一眼可辨**，不会被误当成真诗；**数量也故意不是 19**（7/6/5）；
- 夹具里**故意留了一条超长题名**（用于看折行，因为「超长题名」在真实内容里不存在：真实 19 首题名最长 6 字）——它的行为见 §10。

## 10. 我做的实现细节决定（＋一条已被负责人定准的措辞）

这些**不在任务书规格里**，是我为了让原型能跑而定的；除第 1 条已被负责人确认外，**其余仍是探索性、可否决的**（要改一句话就行）：

1. ✅ **已确认（负责人 2026-10-15 澄清：原措辞有歧义，本意就是本实现）** —— **诗目缩进多少**：任务书原文写的是「诗目**缩进**对齐到组名**基线内**」，这句话自相矛盾（「缩进」与「对齐到组名」方向相反），我当时读不准。我按**「诗目相对页左沿缩进一档（2.55rem ≈ 41px）、组名不缩进」**实现 ⇒ 视觉上是「组名在外、诗目在内」的**用缩进形成层级**。负责人确认：**本意就是这个**，原措辞是他写得不好 ⇒ **不再是待定项，也不留给用户。**
2. **「关于」那一行加了一条发丝线**：A 的顶部行下、B 的底部行上各有一条 `1px var(--line)`。规格只说「极简一行，只放关于」／「底部只放关于」，没说要不要分隔线 —— 我去掉也成立。
3. **悬停**：组头悬停时记号/计数变 `--text-dim`，诗目行悬停加 `--surface-hover` 底。**静态图上不可见**，只是给人「这里能点」的反馈。
4. **超长夹具题名的实测行为**：题名**折到第二行**、**作者仍在第一行右侧**（实测：A 题名框 384×53、作者左沿 487、行右沿 568 ⇒ **未溢出**；B 题名框 396×53、作者左沿 487、行右沿 568 ⇒ 未溢出）。**真实 19 首没有触发折行**。
5. 组与组之间留 `--group-gap` 空隙：B 的竖线因此**在组与组之间断开**，否则三组的线会连成一条通到底的线、读不出「组的范围」。

## 11. 自证（实测输出，未加工）

**复现方式（脚本已随本次交付进仓库，可复跑）**：`items/app-ui/prototypes/check-hub.mjs`

```
node items/app-ui/prototypes/check-hub.mjs              # 跑断言 + 重出两张 PNG
node items/app-ui/prototypes/check-hub.mjs --no-shot    # 只跑断言
```

它用本机无头 Chromium ＋ CDP，用 `Page.navigate` 打开 `file:///…/q-hub-hierarchy.{a,b}.html`，**用 `Input.dispatchMouseEvent` 派发真鼠标事件**（不是页面里 `.click()`），每次点击前重新量一次组头矩形（展开会改变布局，复用旧坐标会点到别的组头上），断言读 `aria-expanded` 与列表的 `hidden`/可见行数。

- **它验的是这两个原型的页面行为，不是产品代码**：对象只有这两个 HTML，它不跑 `web/`、`android/` 的任何测试；
- 两个 HTML 是**只读打开**的，脚本不写、不改它们；
- **它跑两遍，两遍都跑同一套断言**：[1]–[5] 在 **1180 宽（长图口径，§11.1）**跑一遍，又在 **430 宽（移动口径，§11.6）**跑一遍；430 那遍另加 [6] 无横向溢出 / [7] 组头四个位置 / [8] 题名作者换行三项专项；
- 需要 Node（用了内置 `fetch`/`WebSocket`，故需较新的 Node，本机 v25.9.0 实测通过）与一个 Chromium 可执行文件：`CHROME_BIN` 优先，否则按 `%LOCALAPPDATA%\Chromium\Application\chrome.exe` 推（与 `web/tests/e2e-cdp.mjs`、`prototype/tools/shot.mjs` 的回退一致）；找不到就**如实报错并 exit 2**，不假装通过；
- **不需要任何 npm 依赖**，不联网、不起静态服务；
- 副作用：默认会**重写**本目录下那两个 PNG（因此复跑可能让它们变脏，那是正常的）；不想写就加 `--no-shot`。

下面 **§11.1（1180 口径）与 §11.6（430 口径）共四段输出**，都是一次完整运行的**原始输出**（只把很长的绝对路径缩成 `…/`，其余逐字未改；而且**这四段都是用脚本跟那次运行的输出逐行比过的**：§11.1 两段各 25 行、§11.6 两段各 39 行，**差异 0 行**）。**补记（第一轮）**：脚本搬进仓库后我又原样复跑了一次，`失败断言数：0`，且两个长图 PNG 的字节数与当时已提交的完全一致（`git status --short` 里没多出 `M` 项）。

### 11.1 行为自证

**候选 A：**

```
[PNG] …/q-hub-hierarchy.a.png
      整页 CSS 尺寸 1180x4072 @DPR 1 → 像素 1180x4072 → 文件 274621 字节

[1] 首态（首态实例 b1=真实单组 / b3=夹具多组）
  PASS  b1 所有组头 aria-expanded=false  →  han:false
  PASS  b1 组内诗目全部不可见  →  han listVisible=false 可见行=0/19
  PASS  b1 收起时记号＝▸  →  han:▸
  PASS  b3 所有组头 aria-expanded=false  →  fx-1:false fx-2:false fx-3:false
  PASS  b3 组内诗目全部不可见  →  fx-1 listVisible=false 可见行=0/7 | fx-2 listVisible=false 可见行=0/6 | fx-3 listVisible=false 可见行=0/5
  PASS  b3 收起时记号＝▸  →  fx-1:▸ fx-2:▸ fx-3:▸
  PASS  全部组头节点是 <button type=button> 且带 aria-controls 与 aria-expanded  →  11 个：BUTTON/button/有list/有expanded, BUTTON/button/有list/有expanded, BUTTON/button/有list/有expanded …

[2] 真实鼠标点击（CDP Input.dispatchMouseEvent，不是 JS .click()）
      b1 组头 rect=515x55 点(71,500) 命中 .gname
  PASS  点 b1 组头左侧（组名处，非记号）⇒ 该组展开  →  expanded=true 可见诗目=19/19 记号=▾
  PASS  只有 b1 那组变化，页面上其它组头一个都没动  →  ["han@b1=false","han@b2=true","fx-1@b3=false","fx-2@b3=false","fx-3@b3=false","fx-1@b4=true","fx-2@b4=false","fx-3@b4=false","fx-1@b5=true","fx-2@b5=false","fx-3@b5=true"]
           → ["han@b1=true","han@b2=true","fx-1@b3=false","fx-2@b3=false","fx-3@b3=false","fx-1@b4=true","fx-2@b4=false","fx-3@b4=false","fx-1@b5=true","fx-2@b5=false","fx-3@b5=true"]

[3] 多组：可同时展开两组（不是手风琴）
  PASS  点 b3 第 2 个组头 ⇒ 只有它展开（第 1、3 组仍收起）  →  fx-1:false fx-2:true fx-3:false
  PASS  再点 b3 第 3 个组头 ⇒ 两组同时展开的组数=2  →  fx-1:false(可见0/7行) fx-2:true(可见6/6行) fx-3:true(可见5/5行)
  PASS  展开时记号＝▾  →  fx-1:▸ fx-2:▾ fx-3:▾
  PASS  再点 b3 第 2 个组头 ⇒ 只有它收起，第 3 组仍展开  →  fx-1:false fx-2:false fx-3:true
  PASS  点 b1 组头最右（记号处）⇒ 收起（记号同样在按钮内，只表达状态）  →  命中 .ghead → expanded=false 记号=▸
  PASS  关于入口：每个实例恰好 1 个，位置＝上部  →  b1:1个/上部 b2:1个/上部 b3:1个/上部 b4:1个/上部 b5:1个/上部
  PASS  实例里没有别的入口链接（不含应用名/搜索/状态位/版本号等未采纳项）  →  断言口径＝「关于」与诗目链接以外的 <a> 个数为 0 —— b1:[] b2:[] b3:[] b4:[] b5:[]
  PASS  CDP 记录的网络请求里没有任何 http(s) 外部引用  →  1 个请求，非 file:// 的=0 ["file:///…/q-hub-hierarchy.a.html"]
  PASS  页面无 JS 报错  →  0 条
```

**候选 B：**

```
[PNG] …/q-hub-hierarchy.b.png
      整页 CSS 尺寸 1180x4078 @DPR 1 → 像素 1180x4078 → 文件 273707 字节

[1] 首态（首态实例 b1=真实单组 / b3=夹具多组）
  PASS  b1 所有组头 aria-expanded=false  →  han:false
  PASS  b1 组内诗目全部不可见  →  han listVisible=false 可见行=0/19
  PASS  b1 收起时记号＝[+]  →  han:[+]
  PASS  b3 所有组头 aria-expanded=false  →  fx-1:false fx-2:false fx-3:false
  PASS  b3 组内诗目全部不可见  →  fx-1 listVisible=false 可见行=0/7 | fx-2 listVisible=false 可见行=0/6 | fx-3 listVisible=false 可见行=0/5
  PASS  b3 收起时记号＝[+]  →  fx-1:[+] fx-2:[+] fx-3:[+]
  PASS  全部组头节点是 <button type=button> 且带 aria-controls 与 aria-expanded  →  11 个：BUTTON/button/有list/有expanded, BUTTON/button/有list/有expanded, BUTTON/button/有list/有expanded …

[2] 真实鼠标点击（CDP Input.dispatchMouseEvent，不是 JS .click()）
      b1 组头 rect=501x54 点(85,501) 命中 .gname
  PASS  点 b1 组头左侧（组名处，非记号）⇒ 该组展开  →  expanded=true 可见诗目=19/19 记号=[−]
  PASS  只有 b1 那组变化，页面上其它组头一个都没动  →  ["han@b1=false","han@b2=true","fx-1@b3=false","fx-2@b3=false","fx-3@b3=false","fx-1@b4=true","fx-2@b4=false","fx-3@b4=false","fx-1@b5=true","fx-2@b5=false","fx-3@b5=true"]
           → ["han@b1=true","han@b2=true","fx-1@b3=false","fx-2@b3=false","fx-3@b3=false","fx-1@b4=true","fx-2@b4=false","fx-3@b4=false","fx-1@b5=true","fx-2@b5=false","fx-3@b5=true"]

[3] 多组：可同时展开两组（不是手风琴）
  PASS  点 b3 第 2 个组头 ⇒ 只有它展开（第 1、3 组仍收起）  →  fx-1:false fx-2:true fx-3:false
  PASS  再点 b3 第 3 个组头 ⇒ 两组同时展开的组数=2  →  fx-1:false(可见0/7行) fx-2:true(可见6/6行) fx-3:true(可见5/5行)
  PASS  展开时记号＝[−]  →  fx-1:[+] fx-2:[−] fx-3:[−]
  PASS  再点 b3 第 2 个组头 ⇒ 只有它收起，第 3 组仍展开  →  fx-1:false fx-2:false fx-3:true
  PASS  点 b1 组头最右（记号处）⇒ 收起（记号同样在按钮内，只表达状态）  →  命中 .gcount → expanded=false 记号=[+]
  PASS  关于入口：每个实例恰好 1 个，位置＝下部  →  b1:1个/下部 b2:1个/下部 b3:1个/下部 b4:1个/下部 b5:1个/下部
  PASS  实例里没有别的入口链接（不含应用名/搜索/状态位/版本号等未采纳项）  →  断言口径＝「关于」与诗目链接以外的 <a> 个数为 0 —— b1:[] b2:[] b3:[] b4:[] b5:[]
  PASS  CDP 记录的网络请求里没有任何 http(s) 外部引用  →  1 个请求，非 file:// 的=0 ["file:///…/q-hub-hierarchy.b.html"]
  PASS  页面无 JS 报错  →  0 条
```

**失败断言数：0**（两个文件合计）。

口径说明（免得把断言读大了）：

- 「**命中 .gname**」是 `document.elementFromPoint` 的实测结果 ⇒ 那一点确实落在**组名**上，不是落在记号上 ⇒ 这条证明的是「**组头任意位置可点**」；
- 「b1 收起时记号」的断言只针对 **首态实例**（`b1` = 真实单组、`b3` = 夹具多组）；**②④⑤ 是预置展开的展示件**，它们的组头初始 `aria-expanded=true`（这正是 §5 说的），所以「所有组头都 false」这句只在 ①③ 上成立；
- 「点最右（记号处）也能开关」：因为记号在 `<button>` **内部**，它本身也是一块可点区域；断言只验证**开关**，不表示「记号是一个独立按钮」。

### 11.2 自包含自证

```
$ grep -n "http\|src=\|@import\|link rel" q-hub-hierarchy.a.html q-hub-hierarchy.b.html
（无输出，exit=1 —— 一行都没匹配）

$ grep -nE "<link|<script[^>]*src|url\(|@font-face|@import|https?:|//[a-z]" q-hub-hierarchy.a.html q-hub-hierarchy.b.html
（无输出，exit=1）

$ 每个文件的计数：
q-hub-hierarchy.a.html: script=1 link=0 img=0 url(=0
q-hub-hierarchy.b.html: script=1 link=0 img=0 url(=0
```

⇒ 两个文件都**没有任何外部引用**：没有 `<link>`、没有 `<script src>`、没有 `@import`、没有 `url(...)`、没有 `<img>`；**唯一的 `<script>` 是页内内嵌脚本**，样式也全在页内 `<style>` 里。

**另一条更硬的证据**（不只是静态 grep）：CDP 的 `Network.requestWillBeSent` 在整页加载期间**只记录到 1 个请求**，就是 HTML 文件自己（`file:///…/q-hub-hierarchy.{a,b}.html`），**非 `file://` 的请求 0 个**。

### 11.3 PNG 自证

| 文件 | 口径 | CSS 尺寸 | PNG 像素 | 字节数 |
|---|---|---|---|---|
| `q-hub-hierarchy.a.png` | 1180 并排比较栏 · 整页 | 1180×4072 | 1180×4072（DPR 1，全页 `captureBeyondViewport`） | **274621** |
| `q-hub-hierarchy.b.png` | 同上 | 1180×4078 | 1180×4078（同上） | **273707** |
| `q-hub-hierarchy.a.430.png` | **430 移动口径 · 窄图**（只框「真实 1 组 19 首」的 ①收起＋②展开） | 430×1476 | 860×2952（DPR 2） | **181421** |
| `q-hub-hierarchy.b.430.png` | 同上 | 430×1463 | 860×2926（DPR 2） | **183783** |

⚠ **长图的宽口径（写清，免得被当成移动宽度）**：两张长图是 **1180 CSS px 宽**的页面，里面每个实例是**约 500px 宽的并排比较栏**（1180 下两列并排）——那是「**并排看两个候选/状态**」的比较口径，**不是移动宽度**。移动口径看两张 `.430.png`（430 CSS px × DPR 2 ＝ **860 像素宽** 的图）。

**拍摄时机的自我更正**：第一版脚本把截图放在点击测试**之后**，结果 PNG 拍到的是**被点过的状态**（与块标题对不上）。已改成**进页后先拍、再做点击断言**，上表是改后的结果。

### 11.4 来源锚（令牌快照）

- **快照来源**：`prototype/css/theme-tech.css`（**只读，未改动**）；
- **当时提交**：`660e250`（`git rev-parse --short HEAD`，已写在两个 HTML 的文件头注释里）；⚠ **取值本身与首次的 `4755c48` 完全一致**：`git diff 4755c48 HEAD -- prototype/css/theme-tech.css` **无输出**（那一份 CSS 一字未变，变的是我重出 HTML 时的 HEAD）；
- **权威仍是 `docs/design/visual-tokens.md`**；HTML 里那份**只是为「自包含」而复制的一份快照，不是新权威**，也**不做微调**；
- **复制了 29 个令牌（只列这两页真正用到的）**：

```
--bg --bg-pattern --bg-pattern-opacity --surface-hover --text --text-dim --text-faint
--line --accent-line --warn-soft --warn-text --line-warn
--test-line --test-soft --test-text
--radius --radius-s --row-transition
--font-body --font-mono --font-size --lh --ls
--gname-ls --ptitle-ls --group-gap --row-pad --pad --measure
```

- **逐值比对（脚本自动化，不是肉眼）**：把两个 HTML 的 `:root` 与 `theme-tech.css` 的 `html[data-theme='tech']` 块都解析成「名字 → 值」，去掉注释与换行后逐项比较 ⇒

```
q-hub-hierarchy.a.html 快照令牌 29 个（含多行值的 --bg-pattern）
q-hub-hierarchy.b.html 快照令牌 29 个（含多行值的 --bg-pattern）
逐值比对（含 --bg-pattern）：共同令牌 58 个，值不一致 0 个，查不到 0 个
```

- **有意没复制的 28 个**（这两页用不上）：

```
--bg-sticky --surface --surface-sunken --line-strong --accent --accent-strong --accent-text
--accent-soft --warn --mark-bg --mark-text --radius-pill --shadow --chip-transition
--font-poem --font-title --font-ui --font-note --poem-size --poem-lh --poem-ls
--note-size --note-measure --title-size --title-weight --title-ls --brand-ls --stanza-gap
```

其中 **`--surface` 是有意不用的**（两个候选都「不画卡片」）——这正好是这套视觉里「卡片」与「留白／结构记号」的对照点。

### 11.5 不改真数据自证

```
$ git status --short
?? items/app-ui/prototypes/q-hub-hierarchy.a.html
?? items/app-ui/prototypes/q-hub-hierarchy.a.png
?? items/app-ui/prototypes/q-hub-hierarchy.b.html
?? items/app-ui/prototypes/q-hub-hierarchy.b.png
?? items/app-ui/prototypes/q-hub-hierarchy.md
```

**只有这 5 个新增文件**，全在 `items/app-ui/prototypes/` 下；**没有任何已修改（M）的文件** ⇒ 真实内容、`prototype/`、`docs/`、`items/*/item.md`、`android/`、`web/` **一个字都没动**。

（上面那段是**提交前**的原始输出；这 5 个文件随后被提交为 **`67550d4`**，提交后 `git status --short` 是**空的**。）

**返修补记（第一轮）**：之后按负责人要求，把 §11 的自证脚本从临时目录搬进同一个目录（`check-hub.mjs`）。**返修补记（第二轮，本版）**：按负责人读回意见又做了三件事 —— ① 两个 HTML 的顶部说明与三个夹具横幅各**加了一句「不属于应用页面，也不是新的卡片方案」**；② 自证脚本加了**430 移动口径**那一遍（新断言 + 4 张图里的两张窄图）；③ 本说明文档按三条 q 改准了 §3。⇒ **这一轮确实动了 2 个 HTML 与 4 张 PNG**（都重出、重跑过断言），写入范围仍然只有 `items/app-ui/prototypes/`，**没有任何 `M` 文件落在别的目录**。

（提交用 `git commit --only items/app-ui/prototypes/q-hub-hierarchy.*`，因为本仓多条会话共享同一条工作树的 index，裸 `git commit` 会把别人已暂存的文件一起卷走。）

### 11.6 430 移动口径自证（规格里的移动宽度，窄栏实测）

规格写的是**移动 430px**（本材料之前只按约 500px 的并排比较栏画过），所以补一遍**真实 430 viewport**
（`Emulation.setDeviceMetricsOverride{width:430, height:932, deviceScaleFactor:2, mobile:true}`）的实测。
这一遍把 §11.1 的整套断言**在 430 下重跑**，另加四项窄栏专项（[6] 无横向溢出 / [7] 组头四个位置 / [8] 题名作者换行）。
**两遍合计 `失败断言数：0`。**

```
[PNG] …/q-hub-hierarchy.a.430.png
      窄图（只含真实 1 组 19 首的两个实例） CSS 尺寸 430x1476 @DPR 2 → 像素 860x2952 → 文件 181421 字节

[1] 首态（首态实例 b1=真实单组 / b3=夹具多组）
  PASS  b1 所有组头 aria-expanded=false  →  han:false
  PASS  b1 组内诗目全部不可见  →  han listVisible=false 可见行=0/19
  PASS  b1 收起时记号＝▸  →  han:▸
  PASS  b3 所有组头 aria-expanded=false  →  fx-1:false fx-2:false fx-3:false
  PASS  b3 组内诗目全部不可见  →  fx-1 listVisible=false 可见行=0/7 | fx-2 listVisible=false 可见行=0/6 | fx-3 listVisible=false 可见行=0/5
  PASS  b3 收起时记号＝▸  →  fx-1:▸ fx-2:▸ fx-3:▸
  PASS  全部组头节点是 <button type=button> 且带 aria-controls 与 aria-expanded  →  11 个：BUTTON/button/有list/有expanded, BUTTON/button/有list/有expanded, BUTTON/button/有list/有expanded …

[2] 真实鼠标点击（CDP Input.dispatchMouseEvent，不是 JS .click()）
      b1 组头 rect=364x55 点(51,466) 命中 .gname
  PASS  点 b1 组头左侧（组名处，非记号）⇒ 该组展开  →  expanded=true 可见诗目=19/19 记号=▾
  PASS  只有 b1 那组变化，页面上其它组头一个都没动  →  ["han@b1=false","han@b2=true","fx-1@b3=false","fx-2@b3=false","fx-3@b3=false","fx-1@b4=true","fx-2@b4=false","fx-3@b4=false","fx-1@b5=true","fx-2@b5=false","fx-3@b5=true"]
           → ["han@b1=true","han@b2=true","fx-1@b3=false","fx-2@b3=false","fx-3@b3=false","fx-1@b4=true","fx-2@b4=false","fx-3@b4=false","fx-1@b5=true","fx-2@b5=false","fx-3@b5=true"]

[3] 多组：可同时展开两组（不是手风琴）
  PASS  点 b3 第 2 个组头 ⇒ 只有它展开（第 1、3 组仍收起）  →  fx-1:false fx-2:true fx-3:false
  PASS  再点 b3 第 3 个组头 ⇒ 两组同时展开的组数=2  →  fx-1:false(可见0/7行) fx-2:true(可见6/6行) fx-3:true(可见5/5行)
  PASS  展开时记号＝▾  →  fx-1:▸ fx-2:▾ fx-3:▾
  PASS  再点 b3 第 2 个组头 ⇒ 只有它收起，第 3 组仍展开  →  fx-1:false fx-2:false fx-3:true
  PASS  点 b1 组头最右（记号处）⇒ 收起（记号同样在按钮内，只表达状态）  →  命中 .ghead → expanded=false 记号=▸
  PASS  关于入口：每个实例恰好 1 个，位置＝上部  →  b1:1个/上部 b2:1个/上部 b3:1个/上部 b4:1个/上部 b5:1个/上部
  PASS  实例里没有别的入口链接（不含应用名/搜索/状态位/版本号等未采纳项）  →  断言口径＝「关于」与诗目链接以外的 <a> 个数为 0 —— b1:[] b2:[] b3:[] b4:[] b5:[]
  PASS  CDP 记录的网络请求里没有任何 http(s) 外部引用  →  1 个请求，非 file:// 的=0 ["file:///…/q-hub-hierarchy.a.html"]
  PASS  页面无 JS 报错  →  0 条

[6] 430：无横向溢出
  PASS  innerWidth === 430  →  innerWidth=430
  PASS  documentElement.scrollWidth === 430（无横向滚动）  →  scrollWidth=430 bodyScrollWidth=430
  PASS  所有可见元素右沿 ≤ 430（最右元素=div.wrap）  →  maxRight=430 minLeft=0

[7] 430：整组头四个位置逐个点（每次都必须只影响该组）
      （进本节时 b3 的另两组状态：["fx-1=false","fx-3=true"]）
  PASS  430 点「左（组名处）」(x=51, 命中 .gname) ⇒ 该组状态翻转且只有它变化  →  expanded: false → true（记号 ▾），另两组 ["fx-1=false","fx-3=true"] → ["fx-1=false","fx-3=true"]
  PASS  430 点「中（空白处）」(x=215, 命中 .ghead) ⇒ 该组状态翻转且只有它变化  →  expanded: true → false（记号 ▸），另两组 ["fx-1=false","fx-3=true"] → ["fx-1=false","fx-3=true"]
  PASS  430 点「右侧」(x=317, 命中 .ghead) ⇒ 该组状态翻转且只有它变化  →  expanded: false → true（记号 ▾），另两组 ["fx-1=false","fx-3=true"] → ["fx-1=false","fx-3=true"]
  PASS  430 点「最右（记号处）」(x=383, 命中 .ghead) ⇒ 该组状态翻转且只有它变化  →  expanded: true → false（记号 ▸），另两组 ["fx-1=false","fx-3=true"] → ["fx-1=false","fx-3=true"]

[8] 430：题名/作者换行（含超长夹具题名）
  PASS  超长夹具题名在 430 下确实折行（题名框高 > 单行）  →  题名框=232x79（单行约 26px） 题名=「夹具题名一·这一条故意写得很长用来看折行与对齐·再加长一截让它在窄栏里真的折到第二行」
  PASS  超长行：作者没有被挤出、也没有与题名重叠  →  作者左沿=316 题名右沿=306 作者右沿=380 行右沿=397 行内横向滚动=false
  PASS  普通行：作者不与题名重叠、不溢出  →  夹具题名一01｜作者左沿=182 题名右沿=173 作者右沿=247 行右沿=397
```

```
[PNG] …/q-hub-hierarchy.b.430.png
      窄图（只含真实 1 组 19 首的两个实例） CSS 尺寸 430x1463 @DPR 2 → 像素 860x2926 → 文件 183783 字节

[1] 首态（首态实例 b1=真实单组 / b3=夹具多组）
  PASS  b1 所有组头 aria-expanded=false  →  han:false
  PASS  b1 组内诗目全部不可见  →  han listVisible=false 可见行=0/19
  PASS  b1 收起时记号＝[+]  →  han:[+]
  PASS  b3 所有组头 aria-expanded=false  →  fx-1:false fx-2:false fx-3:false
  PASS  b3 组内诗目全部不可见  →  fx-1 listVisible=false 可见行=0/7 | fx-2 listVisible=false 可见行=0/6 | fx-3 listVisible=false 可见行=0/5
  PASS  b3 收起时记号＝[+]  →  fx-1:[+] fx-2:[+] fx-3:[+]
  PASS  全部组头节点是 <button type=button> 且带 aria-controls 与 aria-expanded  →  11 个：BUTTON/button/有list/有expanded, BUTTON/button/有list/有expanded, BUTTON/button/有list/有expanded …

[2] 真实鼠标点击（CDP Input.dispatchMouseEvent，不是 JS .click()）
      b1 组头 rect=350x54 点(65,466) 命中 .gname
  PASS  点 b1 组头左侧（组名处，非记号）⇒ 该组展开  →  expanded=true 可见诗目=19/19 记号=[−]
  PASS  只有 b1 那组变化，页面上其它组头一个都没动  →  ["han@b1=false","han@b2=true","fx-1@b3=false","fx-2@b3=false","fx-3@b3=false","fx-1@b4=true","fx-2@b4=false","fx-3@b4=false","fx-1@b5=true","fx-2@b5=false","fx-3@b5=true"]
           → ["han@b1=true","han@b2=true","fx-1@b3=false","fx-2@b3=false","fx-3@b3=false","fx-1@b4=true","fx-2@b4=false","fx-3@b4=false","fx-1@b5=true","fx-2@b5=false","fx-3@b5=true"]

[3] 多组：可同时展开两组（不是手风琴）
  PASS  点 b3 第 2 个组头 ⇒ 只有它展开（第 1、3 组仍收起）  →  fx-1:false fx-2:true fx-3:false
  PASS  再点 b3 第 3 个组头 ⇒ 两组同时展开的组数=2  →  fx-1:false(可见0/7行) fx-2:true(可见6/6行) fx-3:true(可见5/5行)
  PASS  展开时记号＝[−]  →  fx-1:[+] fx-2:[−] fx-3:[−]
  PASS  再点 b3 第 2 个组头 ⇒ 只有它收起，第 3 组仍展开  →  fx-1:false fx-2:false fx-3:true
  PASS  点 b1 组头最右（记号处）⇒ 收起（记号同样在按钮内，只表达状态）  →  命中 .gcount → expanded=false 记号=[+]
  PASS  关于入口：每个实例恰好 1 个，位置＝下部  →  b1:1个/下部 b2:1个/下部 b3:1个/下部 b4:1个/下部 b5:1个/下部
  PASS  实例里没有别的入口链接（不含应用名/搜索/状态位/版本号等未采纳项）  →  断言口径＝「关于」与诗目链接以外的 <a> 个数为 0 —— b1:[] b2:[] b3:[] b4:[] b5:[]
  PASS  CDP 记录的网络请求里没有任何 http(s) 外部引用  →  1 个请求，非 file:// 的=0 ["file:///…/q-hub-hierarchy.b.html"]
  PASS  页面无 JS 报错  →  0 条

[6] 430：无横向溢出
  PASS  innerWidth === 430  →  innerWidth=430
  PASS  documentElement.scrollWidth === 430（无横向滚动）  →  scrollWidth=430 bodyScrollWidth=430
  PASS  所有可见元素右沿 ≤ 430（最右元素=div.wrap）  →  maxRight=430 minLeft=0

[7] 430：整组头四个位置逐个点（每次都必须只影响该组）
      （进本节时 b3 的另两组状态：["fx-1=false","fx-3=true"]）
  PASS  430 点「左（组名处）」(x=65, 命中 .gname) ⇒ 该组状态翻转且只有它变化  →  expanded: false → true（记号 [−]），另两组 ["fx-1=false","fx-3=true"] → ["fx-1=false","fx-3=true"]
  PASS  430 点「中（空白处）」(x=222, 命中 .ghead) ⇒ 该组状态翻转且只有它变化  →  expanded: true → false（记号 [+]），另两组 ["fx-1=false","fx-3=true"] → ["fx-1=false","fx-3=true"]
  PASS  430 点「右侧」(x=320, 命中 .ghead) ⇒ 该组状态翻转且只有它变化  →  expanded: false → true（记号 [−]），另两组 ["fx-1=false","fx-3=true"] → ["fx-1=false","fx-3=true"]
  PASS  430 点「最右（记号处）」(x=383, 命中 .gcount) ⇒ 该组状态翻转且只有它变化  →  expanded: true → false（记号 [+]），另两组 ["fx-1=false","fx-3=true"] → ["fx-1=false","fx-3=true"]

[8] 430：题名/作者换行（含超长夹具题名）
  PASS  超长夹具题名在 430 下确实折行（题名框高 > 单行）  →  题名框=245x79（单行约 26px） 题名=「夹具题名一·这一条故意写得很长用来看折行与对齐·再加长一截让它在窄栏里真的折到第二行」
  PASS  超长行：作者没有被挤出、也没有与题名重叠  →  作者左沿=316 题名右沿=306 作者右沿=380 行右沿=397 行内横向滚动=false
  PASS  普通行：作者不与题名重叠、不溢出  →  夹具题名一01｜作者左沿=170 题名右沿=160 作者右沿=234 行右沿=397
```

**结论（430 实测）**：① 无横向溢出——`innerWidth`、`documentElement.scrollWidth`、`body.scrollWidth` 都是 **430**，
全文档最右元素是 `div.wrap`，右沿 **430**、左沿 **0**；② 整组头**四个位置**（左/组名、中/空白、右侧、最右/记号）
逐个用真实鼠标点，每次都只翻转该组、同实例另外两组一字未动（中/右侧命中 `elementFromPoint` 返回的是 `.ghead` 本身
⇒ **空白处确实是组头的一部分**）；③ 超长夹具题名在 430 下**折成 3 行**（题名框 A 232×79 / B 245×79，单行约 26px），
**作者没被挤出、也没重叠**（作者左沿 316 ≥ 题名右沿 306，作者右沿 380 ≤ 行右沿 397，行内无横向滚动）；
④ 「关于」在 430 下仍是 A 顶部 / B 底部。
⇒ **430 下不需要改布局**，两个 HTML 与两张长图之外的规则一行未动。

**长图的真实宽口径（更正/写明）**：两张长图 `q-hub-hierarchy.{a,b}.png` 是 **1180 CSS px 宽**的页面，
里面每个实例是**约 500px 宽的并排比较栏**（1180 下两列并排）——那是**并排看两个候选/状态**用的比较口径，
**不是移动宽度**。移动口径看本节的两张窄图（430×DPR2＝860 像素宽）：
`q-hub-hierarchy.a.430.png`、`q-hub-hierarchy.b.430.png`。
## 12. 我**没做／没验**的部分（明确说清）

- **没做**：产品代码改动（`android/`、`web/`、`prototype/` 零改动）；诗页；组头吸顶；状态记忆；动画；状态位/加载/失败/离线；键盘与屏幕阅读器验收；对比度复测；真机/模拟器上跑过。
- **没验**：**桌面/宽屏排布**（**移动 430px 已实测**，见 §11.6；更长宽度未验）；两轴另外两种混搭组合（未出图）；超长题名在**真机**上的表现（只在无头 Chromium 上量了盒模型）；深浅以外的主题；**真机/模拟器上一行没跑**。
- **自证脚本**：已随本次交付进仓库——`items/app-ui/prototypes/check-hub.mjs`（§11 开头有它验什么、怎么跑、需要什么）。
- **没碰**：`docs/**`、`items/*/item.md`、`release/`、`tools/`、`schema/`、`tests/`；没 push、没打 tag、没碰设备与密钥。

## 13. 需要用户拍板的事（写在报告里，没有自己开 question）

1. **两个轴各取哪个**（可以**混搭**，例如 A 的层级 ＋ B 的关于位置）。
2. **`▸/▾` 与 `[+]/[−]` 这两个探索记号**是否接受其中一种写法（现在都不算已采纳）。
3. §10 里那 2–5 条**我自己的实现细节**（「关于」那行的发丝线、悬停反馈、超长题名折行、组间空隙／竖线断开）要不要改。⚠ §10 第 1 条（诗目缩进）**已由负责人澄清确认，不再是待定项**。
4. 题目里的「未表达事项」（§7）里，**哪些必须进下一轮定稿**（我的建议排序：吸顶 → 状态记忆 → 宽屏排布 → 无障碍验收）。
