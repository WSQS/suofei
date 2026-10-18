// 契约线 C：**接口的唯一定义处**。
//
// 这里集中放「改了会牵连别人」的东西：产物键序/字段集、front matter 字段集、id 形状、
// 路径与 CLI 默认值、退出码。其它文件只 import，不再各自写死字符串，避免满仓库找。
// 注意：JSON Schema（schema/content.schema.json）无法 import JS，是这份定义的**镜像**；
// tests/interface.test.mjs 会比对两者，任何一边漂移都会测试失败。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------- dist/content.json 结构 ----------

/** JSON 结构版本。结构不兼容变更时递增。
 *
 * 2026-10-16：1 → 2（**不可逆**，用户已定 B 判据「字段集一变就升」）。
 * 变化：每首 10 键（去掉 dynastyKey/dynastyLabel/dynastyOrder/era/variants，改为单一中文 `dynasty`
 * ＋ `detail`）；顶层 `dynasties` 从 `[{key,label,order}]` 变为**有序中文值数组**。
 *
 * 2026-10-18：2 → 3（同样是 B 判据 ⇒ **新字段就升**，整批执行）。
 * 变化：新增 `poems[].tags[]`（每项 `{id, orderInTag}`）与编译期汇总的顶层 `tags[]`
 * （每项 `{id, members}`）。**不发布任何 SortKey**：标签之间的拼音次序只在编译期用。
 * 老客户端（认 formatVersion=2）会拒收 formatVersion=3 的内容、保留现有快照——这是刻意的代价。
 */
export const FORMAT_VERSION = 3;

/** 顶层键序（产物里的插入顺序，保证字节可复现、diff 稳定）。 */
export const CONTENT_KEYS = Object.freeze([
  'formatVersion',
  'contentVersion',
  'generatedAt',
  'dynasties',
  'tags',
  'poems',
]);

/**
 * 顶层 `dynasties` 的条目形状（formatVersion=2）。
 *
 * 用户 2026-10-15 已定 ①：**有序中文值数组**（不是 `[{key,label,order}]`）。
 * 次序即显示次序（按注册表 order 升序），只列**实际有内容**的组；分组权威就是它，
 * 每首诗的 `dynasty` 必须逐字等于数组里的某个中文值。
 */
export const DYNASTY_ENTRY_TYPE = 'string';

/** 每首诗在产物里的键序（缺值写 `null` 保键，客户端形状恒定）。
 *
 * 2026-10-14 用户拍板：产物只发布 `orderInSource`；`authorSortKey`/`titleSortKey` **不再发布**
 * （只在编译期内部用于算次序，见 INTERNAL_SORT_KEYS）。理由：编译期是唯一排序权威、客户端不得
 * 重排，所以两端在正式路径上一个排序字段都不用，产物保持最小。
 *
 * 2026-10-16（formatVersion=2）：单一中文 `dynasty` 取代 dynastyKey/dynastyLabel/dynastyOrder；
 * `era`/`variants` 退出产物，考据文本整段进 `detail`（来自源文件的 `## 详情` 节）。
 *
 * 2026-10-18（formatVersion=3）：末尾新增 `tags`（**总是一个数组**；没有归属时是 `[]`，不是 `null`——
 * 「没有标签」是一个可读的值，不是一个缺失）。`tags` 放在末尾不影响其余 10 键的相对次序。
 */
export const POEM_KEYS = Object.freeze([
  'id',
  'title',
  'author',
  'dynasty',
  'genre',
  'source',
  'orderInSource',
  'detail',
  'stanzas',
  'notes',
  'tags',
]);

/**
 * 诗侧标签条目的键（formatVersion=3，用户 2026-10-18 定）。
 *
 * `id` ＝**标签的中文 id，就是显示名本身**（不加 `name`/`qualifier`/`aliases`）；
 * `orderInTag` ＝**该标签内的位置**，整数、必填、不可 null（不是「底本编次」，也不是 `orderInSource`）。
 */
export const POEM_TAG_KEYS = Object.freeze(['id', 'orderInTag']);

/**
 * 顶层 `tags[]` 条目的键：**编译期从诗的归属汇总生成**（`{id, members}`），不是人手写的第二份事实来源。
 * `members` ＝ 该标签下 `poemId` 的数组，**按 `orderInTag` 升序**。
 */
export const TAG_INDEX_KEYS = Object.freeze(['id', 'members']);

/**
 * **仅编译期内部使用**的排序名次键：算完次序即丢弃，**不写进 dist/content.json**。
 * 它们只在 `content-build.mjs` 内部作为整数名次比较用（拼音 `Intl.Collator` 排出来的名次）。
 * 将来若真要做「按诗名排序」视图或拼音搜索，再作为新字段增量发布（那是一次接口变更）。
 */
export const INTERNAL_SORT_KEYS = Object.freeze(['authorSortKey', 'titleSortKey']);

// ---------- 源文件 front matter（formatVersion=2）----------

/** 两个合法的节标题（唯一的节名清单；两端的节名清单要与之同步）。 */
export const KNOWN_SECTIONS = Object.freeze(['详情', '笔记']);
export const SECTION_DETAIL = '详情';
export const SECTION_NOTES = '笔记';

/** 必填键。本轮冻结：只增可选键，不改名、不降级。 */
export const REQUIRED_FRONT_MATTER_KEYS = Object.freeze(['title', 'author', 'dynasty', 'source']);

/**
 * 可选键。本轮冻结。
 *
 * 2026-10-18（formatVersion=3）新增 `tags`：**归属**写在诗上，标签集合由编译期自动汇总；
 * 源里**可以不写**（⇒ 产物 `tags: []`，不是 `null`）。
 */
export const OPTIONAL_FRONT_MATTER_KEYS = Object.freeze(['genre', 'orderInSource', 'tags']);

/**
 * **已从源格式去掉**的旧键（formatVersion=1 的写法）。
 *
 * 出现时一律 `REMOVED_KEY` 报错、**不静默转换**：这套迁移刻意是「显式重写源文件」而不是
 * 「工具猜你的意思」（猜错就是静默改内容）。`id` 单列，见 `FORBIDDEN_ID_KEY`。
 *   - `dynastyOrder` → 组序改由注册表决定，源里不再自带排序键；
 *   - `era`        → 用户已定删掉该字段（更细的时代不再单独承载）；
 *   - `variants`   → 考据文本整段写进 `## 详情` 节；
 *   - `dynastyKey`/`dynastyLabel` → 产物改用一个中文 `dynasty`；
 *   - `notes`      → 用户笔记改由 `## 笔记` 节承载。
 */
export const REMOVED_FRONT_MATTER_KEYS = Object.freeze([
  'dynastyOrder',
  'era',
  'variants',
  'dynastyKey',
  'dynastyLabel',
  'notes',
]);

/** 未声明的键会被拒绝（不静默忽略）。 */
export const ALL_FRONT_MATTER_KEYS = Object.freeze([
  ...REQUIRED_FRONT_MATTER_KEYS,
  ...OPTIONAL_FRONT_MATTER_KEYS,
]);

/**
 * id 的**正面约束**（2026-10-16，C2 路径 ID 收口）。
 *
 * 用户已定：ID ＝ 相对内容根（`content/poems/`）的完整相对路径、去 `.md`、`/` → `-` ⇒
 * **中文 ID 合法**（`古诗十九首-行行重行行`）。旧的 `^[a-z0-9]+(?:-[a-z0-9]+)*-\d+$`
 * 会把中文与「不以 `-数字` 结尾」全部判错，所以换成只做正面约束：
 *   - **非空**；
 *   - **不含 `/`**（路由 `/p/<id>` 用 `[^/]+`，含 `/` 会与 `/detail` 后缀相撞）；
 *   - **不含控制字符与反斜杠**（控制字符在产物/终端里不可见；反斜杠是 Windows 路径分隔符）。
 * 其余（大小写、中文、`-`、空格以外的可打印字符）都允许 —— ID 由磁盘上的真实路径派生，
 * 不在这里做「命名风格」的二次发明。
 */
export const ID_REGEX = /^[^/\\\u0000-\u001f\u007f]+$/;
/** 供 JSON Schema / 文档引用的同一正则源码（JSON Schema 的 pattern 是正则**源码字符串**）。 */
export const ID_PATTERN = '^[^/\\\\\\u0000-\\u001f\\u007f]+$';

// ---------- 排序 ----------

/**
 * 组内排序策略（编译期可切，见排序一节）。**客户端不排**：产物已按此处结果排好。
 *   source：先排底本原次序 orderInSource（有值者在先、升序），无值者再按作者/诗名拼音；
 *   pinyin：完全按作者拼音 → 诗名拼音（佚名/未知作者在组内排最后）。
 */
export const SORT_STRATEGIES = Object.freeze(['source', 'pinyin']);
/**
 * 暂定默认值，**等待用户拍板**（见报告「接口决定（暂定，待用户确认）」）。
 * 选 source 的理由：当内容尚未提供 orderInSource 时，两种策略输出完全一致，
 * 不会静默改变现有行为；一旦内容补上该键，就自然遵守底本原次序。
 */
export const DEFAULT_ORDER_STRATEGY = 'source';

/** 拼音排序的 locale（契约第 2 节定死）。 */
export const PINYIN_COLLATOR_LOCALE = 'zh-Hans-CN-u-co-pinyin';

// ---------- 匿名作者清单：唯一机器可读来源是一个文件 ----------

/**
 * 匿名/未知作者标记清单的**唯一机器可读来源**（契约 §2.1.1）。
 * 编译器、Android、Web 三方都必须与这个文件一致；契约散文里的列表仅供参考。
 *
 * 为什么让编译器**直接读文件**、而不是再写一份常量 + 测试：三端各拄一份正是历史上「拄歪」
 * 的根因（本仓就出现过三种不同写法）。读同一个文件后，编译器侧的漂移在**结构上不可能发生**，
 * 不依赖“有人记得跑测试”。文件缺失/形状非法时**直接抛错**，不回退到内置列表——静默回退
 * 就是当初的问题本身。
 */
export const UNKNOWN_AUTHORS_RELATIVE_PATH = 'schema/unknown-authors.json';
/** 该文件在本模块里的 URL（供测试/工具直接引用，避免再写一份路径字串）。 */
export const UNKNOWN_AUTHORS_FILE_URL = new URL(`../../${UNKNOWN_AUTHORS_RELATIVE_PATH}`, import.meta.url);

/** @returns {readonly string[]} */
function loadUnknownAuthorMarkers() {
  const file = fileURLToPath(UNKNOWN_AUTHORS_FILE_URL);
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (e) {
    throw new Error(
      `${UNKNOWN_AUTHORS_RELATIVE_PATH} 读不到（${e?.code ?? e?.message}）：它是匿名作者清单的唯一来源，必须随仓库提供`,
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`${UNKNOWN_AUTHORS_RELATIVE_PATH} 不是合法 JSON：${e.message}`);
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`${UNKNOWN_AUTHORS_RELATIVE_PATH} 必须是非空 JSON 数组，如 ["佚名", "无名氏", "阙名"]`);
  }
  const notStrings = parsed.filter((v) => typeof v !== 'string' || v.trim() === '');
  if (notStrings.length > 0) {
    throw new Error(`${UNKNOWN_AUTHORS_RELATIVE_PATH} 只能放非空字符串，问题项：${JSON.stringify(notStrings)}`);
  }
  const dupes = [...new Set(parsed.filter((v, i) => parsed.indexOf(v) !== i))];
  if (dupes.length > 0) {
    throw new Error(`${UNKNOWN_AUTHORS_RELATIVE_PATH} 有重复项：${JSON.stringify(dupes)}`);
  }
  return Object.freeze([...parsed]);
}

/** 视为「佚名/未知作者」的标记：这些在组内一律排最后（显式规则，不靠排序碰巧）。 */
export const UNKNOWN_AUTHOR_MARKERS = loadUnknownAuthorMarkers();

// ---------- 路径与 CLI ----------

/** 内容根目录（源 Markdown 所在）。 */
export const DEFAULT_CONTENT_DIR = 'content';
/** 内容根目录下的诗文件子目录。 */
export const POEMS_SUBDIRNAME = 'poems';
/** 产物路径（dist/ 已被 .gitignore 忽略，产物不进仓库）。 */
export const DEFAULT_OUT = path.join('dist', 'content.json');
/** JSON Schema 路径。 */
export const DEFAULT_SCHEMA_PATH = path.join('schema', 'content.schema.json');
/** 源文件扩展名。 */
export const SOURCE_EXT = '.md';

/** 退出码契约：0 成功，1 校验/构建失败，2 命令行用法错误。 */
export const EXIT_CODES = Object.freeze({ ok: 0, buildFailed: 1, usage: 2 });

/** CLI 选项名（供文档与测试引用）。 */
export const CLI_FLAGS = Object.freeze({
  check: '--check',
  content: '--content',
  out: '--out',
  contentVersion: '--content-version',
  previousVersion: '--previous-version',
  minify: '--minify',
  json: '--json',
  quiet: '--quiet',
  order: '--order',
});
