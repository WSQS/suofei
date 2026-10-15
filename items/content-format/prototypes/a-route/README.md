# A 路线「整合待审稿」材料

> ## ⚠️ 这只是**待审材料**，**不是实施授权**
> 本目录里的 MD／JSON／脚本**全部是样例与演示**：**不迁移 19 首**、**不改正式 schema**（`schema/**`、`tools/**` 一字未动）、**不升 `formatVersion`**、**不发布**、**不碰 `content/**`**。
> 产物 JSON 是**样例**，**不是**正式 `dist/content.json`，不参与发布，也不构成对 `docs/design/content-contract.md` 的任何修订。
> **看完请你们拍板未定项；拍板之前不做正式实现。**

**来源提交**：`8efe241`（`git rev-parse --short HEAD`；`8efe24122cb816436a8d085242d48b87292d86e3`，即本目录创建时的工作树 HEAD）。

---

## 1. 这份材料回答什么

让用户**看见具体的字段与样例**：A 路线的源文件长什么样、编译后每首诗是什么样、每种「缺省」怎么表现、以及**哪些地方我们还没定、定了各要花什么代价**。**不是**再讲一遍抽象取舍，**不是**实施。

A 路线骨架（**用户已选，已固定，不在本材料重开讨论**）：

1. **① 每首诗的 MD 单文件自足** —— **不做集合级元数据上提**，**不存在集合文件**（每首诗自己写全 `author`／`dynasty`／…／`source`）。
2. **② 详情留在正文里** —— `## 详情` **整节在编译后保留为 Markdown 文本**（**一个**文本字段），**不重新提取**成 `variants`／`segmentation` 之类的结构化字段。

⚠️ **「选了 A 路线」不等于批准 A 的旧字段名或旧解析规则。** 凡未定的（见 §3）**一律标出来**给你们定。

---

## 2. 交付物（都在本目录下）

| 文件 | 是什么 |
|---|---|
| `samples/a-poem-01-with-detail.md` | **完整 MD 样例**（真实《行行重行行》：单文件自足；front matter 是每首自己的字段；正文＝8 行；`## 详情` 整节。**未省略、无省略号**） |
| `samples/a-poem-01-no-detail.md` | **② 详情缺失**（有笔记、没有 `## 详情`） |
| `samples/a-poem-01-text-only.md` | **① 只有原文**（详情、笔记都没有） |
| `samples/a-poem-01-with-note.md` | **④ 有详情 ＋ 有笔记**的补全对照（笔记是一份**明确标为测试夹具**的文本，不是用户笔记） |
| `json/*.json` | 上述 4 份的**对应产物样例**（A 路线：详情＝**一个 Markdown 文本字段**）。由 `demo.mjs --print-json` 生成，并由 `demo.mjs` **逐字节比对**防手抄漂移 |
| `fields.md` | **逐字段对照表**：每个字段**从源文件哪一处来** ＋ **供哪个页用**（目录／诗／详情／关于）＋ 三种缺省的写法与产物 ＋ 字段集/升版影响 ＋ 两端渲染代价 |
| `undecided.md` | **未定清单（重点）**：`source` 归属（**两案各给样例**）、`detail` 字段名（3 个候选）＋ 缺失语义（`null` ↔ 键不存在）、`id` 来源（手填／文件名／派生） |
| `ambiguity.md` | **歧义与最小 Markdown 支持范围**：`## 详情` 分界、重复/未知节处置、围栏标题的判据、客户端要渲染哪些语法（含两端现状与代价） |
| `samples-alt/a2-source-in-detail.md` | `source` **归入详情正文**那一案的样例（案 A2；front matter 删 `source`） |
| `samples-alt/alt-id-from-filename.md` | `id` **从文件名得**那一案的样例（首行没有 `id:`） |
| `fixtures-ambiguous/ambiguous-detail.md` | **故意有歧义**的夹具（两个 `## 详情`、未知 `## 校本`、围栏里的 `##`、超出范围的表格与 `####`），用来证明演示脚本**会响** |
| `demo.mjs` | **演示脚本**（文件头写明「**演示用，不是编译器**」）。只读 `samples/`、`json/`、`fixtures-ambiguous/`，**绝不读 `content/`、绝不写任何东西** |
| `../../history/round-2026-10-15-content-format-candidates/demo-output.txt` | 上面脚本的**实际输出**（样例 JSON 自检表 ＋ 告警路径自证 ＋ 那次**非零退出**的 `--parse` 运行） |

运行：

```bash
node items/content-format/prototypes/a-route/demo.mjs                 # 自检，正常 EXIT=0
node items/content-format/prototypes/a-route/demo.mjs \
     --parse items/content-format/prototypes/a-route/fixtures-ambiguous/ambiguous-detail.md   # 告警 ⇒ EXIT=1
```

---

## 3. 未定清单（逐条 —— 这些**都要你们定**）

> 每条都**并列**展示候选与代价，**本材料不排推荐**。详版见 `undecided.md` 与 `ambiguity.md`。

**A. 字段层（`undecided.md`）**

1. **`source`（底本与来源）**：**继续做元数据字段**（案 A1，样例＝`samples/a-poem-01-with-detail.md`）↔ **归入详情正文**（案 A2，样例＝`samples-alt/a2-source-in-detail.md`）。两案都给了样例。
2. **`detail` 的字段名**：`detail` 只是草案。候选：`detail`（短、但没写格式）／`detailMarkdown`（写明是 Markdown）／`detailText`（字面像纯文本、与「要渲染 Markdown」相抵）。
3. **`detail` 的「缺失」语义**：写 `"detail": null`（**键存在**，＝「明确知道没有」；契约现行口径）↔ **键不存在**（＝「不知道该有没有」，与契约相反，且与字段集门按**键路径并集**判定的口径相冲）。**两者对客户端含义不同。**
4. **`id`**：**现状是手填**（早前「从文件名得」只是**草案、未采纳**）⇒ **待你们定**：手填（现状）／从文件名得（删源文件 `id` 键，但**产物 `id` 形状不变**）／从集合序号派生（`orderInSource` 缺失时派生不了、第二部作品前缀语义未定）。

**B. 解析规则层（`ambiguity.md`）**

5. **`## 详情` 的分界**：到下一个任意 `## ` 止（草案）／到下一个已知具名节止（未知节当内容）／详情必须最后一节（到 EOF）／显式结束标记／围栏包裹 —— **5 个候选，各有代价**。
6. **重复或未知的节**：两个 `## 详情`（报错／后者覆盖／拼接／取第一个并告警）、未知 `## X`（报错／忽略／原样保留）—— **未定**，演示只**告警**。
7. **围栏里的 `##`**：判据（切分点＝行首恰好 `## `＋一个空格；先跟踪围栏开闭）说清了，但**「支不支持围栏」未定**（支持需状态机 ＋ 闭合校验；不支持则出现围栏即报错）。
8. **最小 Markdown 支持范围**：两端要渲染哪些语法（标题／列表／粗体／引用／代码／链接？）—— **未定**。⚠️ 现状：**Web 的笔记渲染只有最小子集**（段落、换行、`- ` 列表、`**粗体**`、`*斜体*`；**不含标题/引用/代码/链接**），**Android 把笔记当纯文本** ⇒ 若详情用 Markdown，**Web 要扩子集、Android 要新增渲染能力**。

**C. 连带项**

9. **是否/何时升 `formatVersion` 到 2**：字段集净变化＝**＋`detail`、−`variants`（含 3 个键路径）** ⇒ 按 **B 规则（字段集一变就升）** **要求**升，且**不可逆**。**要不要现在做，是待审的事。**（判据＝**只看键路径，不看值**；见 `fields.md` §4。）

---

## 4. 输入依据（本材料据什么写的）

- **用户已选的方向**（A 路线两条骨架）与 2026-10-15 的口径纠正（升版判据看**键路径**；旧 APK **拒收更高 `formatVersion`**、同签名新 APK 是普通覆盖安装；切分验证按**逐诗逐行**、不用子串断言；**不宣称免费**）。
- **只读参考**（上一轮原型，**未改一字**）：`items/content-format/prototypes/a-detail-in-body-text-field.md`、`samples/a-poem-01*.md`、`../../history/round-2026-10-15-content-format-candidates/demo-parse-samples.mjs`、`../../history/round-2026-10-15-content-format-candidates/README.md`。
- **现行契约与工程事实**（只读）：`docs/design/content-contract.md`（字段表、键序、`null` 口径、字段集门判据、`source` 标为必填）、`content/poems/gushi-shijiu-shou-01.md`（真实 8 行与 3 条异文，抄用未改字）、`web/app/render.js`（笔记渲染子集、详情页读 `source`／逐条渲染 `variants`）、`web/about-fields.json`（关于页字段集）、`android/.../ui/Screens.kt`（笔记＝`Text()` 纯文本；详情页读 `source`／逐条渲染 `variants`）、`items/content-format/item.md`（开放项与采集口径）、`CONTEXT.md`（已确认范围）。

---

## 5. 自证（实跑，贴原文）

1. **演示脚本实际输出**（样例 JSON ＋ 各样例自检表）：`../../history/round-2026-10-15-content-format-candidates/demo-output.txt` 开头那一段（到 `EXIT=0` 为止）。要点：
   - 4 份样例都是 **8 行 / 单段 / 无 `#` 开头行**，正文**逐行相等**；缺省三态（`detail`／`notes` 各为文本或 `null`）**如预期**；样例 **0 告警**。
   - 4 份 `json/*.json` 与解析结果 **逐字节一致**（防手抄漂移）。
2. **告警路径自证**（喂一段故意有歧义的详情 ⇒ 抓到告警 ＋ **非零退出**）：`../../history/round-2026-10-15-content-format-candidates/demo-output.txt` 里 `--parse` 那一段（到末尾 `EXIT=1` 为止）。要点：
   - 合成正文抓到 **4 条**告警，**逐类都响**：`fence-heading`／`unknown-section`／`duplicate-section`／`md-out-of-range`。
   - `--parse fixtures-ambiguous/ambiguous-detail.md` 抓到 **7 条**告警并**非零退出**（`EXIT=1`）。
3. **`git status --short` 只有本目录下新增的文件**（见 §6）。
4. **本次没有碰 `content/ tools/ schema/ docs/`，没有迁移 19 首，没有升 `formatVersion`。**

---

## 6. 硬边界（本材料**没有**做什么）

- **只新增**文件，写入范围**只有** `items/content-format/prototypes/a-route/`；上一轮原型文件（`items/content-format/prototypes/*.md`／`samples/`／`../../history/round-2026-10-15-content-format-candidates/demo-parse-samples.mjs`）**一字未改**。
- **没碰** `content/**`（19 首一字未动）、`tools/**`、`schema/**`、`docs/**`、`items/*/item.md`、`items/app-ui/**`（另一条工作线在跑）、`release/**`；**没升** `formatVersion`；**没发布**；**没 push**、**没打 tag**、**没碰设备/密钥**。
- `demo.mjs` **只读**本目录文件，**不写任何东西**；它是**演示**，**不是** `tools/` 里的正式编译器；正式解析/校验/错误码仍以 `tools/` 与 `docs/design/content-contract.md` 为准。
- 笔记样例**明确是测试夹具**（正文里就写着「不是用户笔记」）；**不代用户写任何第一人称笔记**。

## 7. 没表达什么（本材料**没有**声称的事）

- **没有**声称用户已采纳任何**字段名**（`detail` 等）、任何**子节名**、任何**切分规则**或**最小 Markdown 范围** —— 全部标为草案/候选。
- **没有**把「A 路线」当成「连 A 的旧字段名与旧解析规则一起批准」。
- **没有**给「集合级上提」「搜索」等其它轴下结论（本材料只按 A 路线：单文件自足、不做上提）。
- **没有**行使**真实多段**：19 首真实内容都是**单段**，本材料的样例也都是单段；多段保真在前一轮原型里用**人为夹具**验过，本材料**未重复**、也不据此断言真实内容需要分段。
- **没有**对「详情里出现约定之外的写法，正式实现该怎么处置」下结论 —— 演示**只做到会响**（计数＋告警＋非零退出），**正式策略未定，定下前不做正式实现**。
- **没有**在真实设备/模拟器上验收，**没有**改任何客户端代码；§「两端应改哪些」是**代价陈述**，不是已完成的工作。
