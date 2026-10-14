// 契约线 C：**接口的唯一定义处**。
//
// 这里集中放「改了会牵连别人」的东西：产物键序/字段集、front matter 字段集、id 形状、
// 路径与 CLI 默认值、退出码。其它文件只 import，不再各自写死字符串，避免满仓库找。
// 注意：JSON Schema（schema/content.schema.json）无法 import JS，是这份定义的**镜像**；
// tests/interface.test.mjs 会比对两者，任何一边漂移都会测试失败。

import path from 'node:path';

// ---------- dist/content.json 结构 ----------

/** JSON 结构版本。结构不兼容变更时递增。 */
export const FORMAT_VERSION = 1;

/** 顶层键序（产物里的插入顺序，保证字节可复现、diff 稳定）。 */
export const CONTENT_KEYS = Object.freeze(['formatVersion', 'contentVersion', 'generatedAt', 'dynasties', 'poems']);

/** 分组对象键序。 */
export const DYNASTY_KEYS = Object.freeze(['key', 'label', 'order']);

/** 每首诗在产物里的键序（含 era/genre/notes 的 null 占位，客户端形状恒定）。
 *
 * 2026-10-14 用户拍板：产物只发布 `orderInSource`；`authorSortKey`/`titleSortKey` **不再发布**
 * （只在编译期内部用于算次序，见 INTERNAL_SORT_KEYS）。理由：编译期是唯一排序权威、客户端不得
 * 重排，所以两端在正式路径上一个排序字段都不用，产物保持最小。
 */
export const POEM_KEYS = Object.freeze([
  'id',
  'title',
  'author',
  'dynastyKey',
  'dynastyLabel',
  'dynastyOrder',
  'era',
  'genre',
  'source',
  'orderInSource',
  'variants',
  'stanzas',
  'notes',
]);

/**
 * **仅编译期内部使用**的排序名次键：算完次序即丢弃，**不写进 dist/content.json**。
 * 它们只在 `content-build.mjs` 内部作为整数名次比较用（拼音 `Intl.Collator` 排出来的名次）。
 * 将来若真要做「按诗名排序」视图或拼音搜索，再作为新字段增量发布（那是一次接口变更）。
 */
export const INTERNAL_SORT_KEYS = Object.freeze(['authorSortKey', 'titleSortKey']);

/** 异文对象键序。 */
export const VARIANT_KEYS = Object.freeze(['text', 'note']);

// ---------- 源文件 front matter ----------

/** 必填键。本轮冻结：只增可选键，不改名、不降级。 */
export const REQUIRED_FRONT_MATTER_KEYS = Object.freeze([
  'id',
  'title',
  'author',
  'dynasty',
  'dynastyOrder',
  'source',
]);

/** 可选键。本轮冻结。 */
export const OPTIONAL_FRONT_MATTER_KEYS = Object.freeze(['era', 'genre', 'variants', 'notes', 'orderInSource']);

/** 未声明的键会被拒绝（不静默忽略）。 */
export const ALL_FRONT_MATTER_KEYS = Object.freeze([
  ...REQUIRED_FRONT_MATTER_KEYS,
  ...OPTIONAL_FRONT_MATTER_KEYS,
]);

/** id 正则（源：末段为序号数字的短横线小写串）。 */
export const ID_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*-\d+$/;
/** 供 JSON Schema / 文档引用的同一正则源码。 */
export const ID_PATTERN = '^[a-z0-9]+(?:-[a-z0-9]+)*-\\d+$';

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

/** 视为「佚名/未知作者」的标记：这些在组内一律排最后（显式规则，不靠排序碰巧）。 */
export const UNKNOWN_AUTHOR_MARKERS = Object.freeze(['佚名', '无名氏', '未知', '未详', '不详']);

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
