// 发布流水线 F：**产物布局与就绪检查项的唯一定义处**。
//
// 为什么集中在这里：build-release.mjs 产出什么、check-ready.mjs 检查什么，
// 必须是同一份约定；两边各写一遍迟早漂移（那就成了「检查过了但检查的不是同一个东西」）。
// 这份约定里的每条都是**接口**：谁依赖它、改一次的代价，写在
// docs/design/release-pipeline.md 的「接口决定」一节。

import path from 'node:path';

/** 默认产物目录（相对仓库根）。release/.gitignore 忽略 /out/。 */
export const OUT_DEFAULT = 'release/out';

// ---------- 产物相对路径（相对 --out 目录） ----------

/** 本次发布的规范内容产物：**唯一**一次编译的结果，其它副本都是它的字节复制。 */
export const DIST_REL = 'dist/content.json';
/** 规范产物的 sha256 边车。 */
export const DIST_SIDECAR_REL = 'dist/content.json.sha256';
/** Web 部署目录（整目录内容就是站点根）。 */
export const WEB_DIR_REL = 'web';
/** APK 存放目录。 */
export const APK_DIR_REL = 'apk';
/** 本次发布的机器可读清单（**不进**部署目录：站点上不需要它）。 */
export const MANIFEST_REL = 'release-manifest.json';
/** Android 更新清单在站点上的位置（IF-22：`{BASE_URL}/content/latest.json`）。 */
export const ANDROID_MANIFEST_REL_IN_WEB = 'content/latest.json';
/** Android 内容快照在站点上的目录（IF-22：`{BASE_URL}/content/<contentVersion>/content.json`）。 */
export const ANDROID_SNAPSHOT_DIR_REL_IN_WEB = 'content';
/** Web 端内容文件名（IF-26：站点根下 `content.json`）。 */
export const WEB_CONTENT_NAME = 'content.json';
/** Web 端校验和边车名（IF-27）。 */
export const WEB_CHECKSUM_NAME = 'content.json.sha256';
/** 显式传给编译器的排序策略（IF-16 已定：source，流水线必须显式传，不依赖默认值）。 */
export const ORDER_STRATEGY = 'source';
/** 本流水线与客户端共同支持的内容结构版本（IF-30）。 */
export const SUPPORTED_FORMAT_VERSION = 1;

// ---------- Web 部署目录：什么该进、什么绝不能进 ----------

/** 白名单：这几个顶层条目从 web/ 复制到部署目录（`app` 是整棵子树）。 */
export const DEPLOY_ALLOWLIST = ['index.html', 'styles.css', 'manifest.json', 'sw.js', 'app'];

/** 流水线自己生成、允许出现在部署目录里的顶层条目。 */
export const DEPLOY_GENERATED = [WEB_CONTENT_NAME, WEB_CHECKSUM_NAME, ANDROID_SNAPSHOT_DIR_REL_IN_WEB];

/** 明确不许出现的开发期条目（复制前就排除；就绪检查再断言一次，防回归）。 */
export const DEPLOY_DENYLIST = [
  'fixtures',
  'tests',
  'scripts',
  'node_modules',
  'README.md',
  '.gitignore',
  'package.json',
];

/** 部署目录顶层允许出现的全部条目（= 白名单 ∪ 生成物）。多出任何一条就报红，
 *  这样 web/ 新增顶层文件时流水线会**大声失败**并要求人工确认是否该发布。 */
export const DEPLOY_EXPECTED = [...DEPLOY_ALLOWLIST, ...DEPLOY_GENERATED].sort();

/**
 * 部署目录里**必须**存在的条目。
 *
 * `content.json` 是必需项：契约 §4（2026-10-16 用户拍板）明确「内容仍要**单独取**，
 * 不得内联进 HTML/JS」——单独取才能在外壳到达后先渲染框架并如实显示取内容的状态；
 * 站点上少这份文件 = Web 端没有内容可读。
 */
export const DEPLOY_REQUIRED = [...DEPLOY_ALLOWLIST, WEB_CONTENT_NAME];

/**
 * Web 端的 sha256 边车：**不再是必需**（契约 §4：Web 的完整性由 SW 缓存 + HTTPS 承担）。
 * 流水线仍产出它（无害、便于人核对），但就绪检查**不得**把它当成必需项（否则会假红）。
 */
export const WEB_CHECKSUM_REQUIRED = false;

// ---------- Android 更新清单字段（IF-22，字段名以 Android 端为准） ----------

export const MANIFEST_FIELDS = Object.freeze([
  'formatVersion',
  'contentVersion',
  'url',
  'sha256',
  'size',
  'minAppVersionCode',
]);

// ---------- 路径拼装 ----------

export const distPath = (outDir) => path.join(outDir, DIST_REL);
export const distSidecarPath = (outDir) => path.join(outDir, DIST_SIDECAR_REL);
export const webDir = (outDir) => path.join(outDir, WEB_DIR_REL);
export const apkDir = (outDir) => path.join(outDir, APK_DIR_REL);
export const manifestPath = (outDir) => path.join(outDir, MANIFEST_REL);
// Android 更新源是**站点上**的文件：清单与快照都落在 Web 部署目录里（同一个站点、同一次部署）。
export const androidManifestInWeb = (outDir) => path.join(outDir, WEB_DIR_REL, ANDROID_MANIFEST_REL_IN_WEB);
export const androidSnapshotInWeb = (outDir, contentVersion) =>
  path.join(outDir, WEB_DIR_REL, ANDROID_SNAPSHOT_DIR_REL_IN_WEB, contentVersion, WEB_CONTENT_NAME);

/** 本次发布的 APK 文件名。debug 是**临时**的：正式发布要固定签名，届时去掉 `-debug`。 */
export const apkFileName = (contentVersion, buildType = 'debug') =>
  `suofei-${contentVersion}${buildType === 'debug' ? '-debug' : ''}.apk`;

/**
 * Android 更新清单里的内容快照地址（IF-22 `url` 字段）。
 *
 * ⚠️ 这里是**唯一的形状定义处**，因为它的正确取值取决于 Android 端怎么解析：
 * `ContentUpdater.resolveUrl(manifestUrl, url)` 用**清单自己的 URL**作基址做 RFC 3986 解析，
 * 而清单在 `{BASE}/content/latest.json`、快照在 `{BASE}/content/<v>/content.json`，
 * 所以 url 必须是**相对清单所在目录**的 `<v>/content.json`。
 * 写成文档示例里的 `content/<v>/content.json` 会被解析成 `{BASE}/content/content/<v>/content.json`（404）。
 * 记录见 docs/design/release-pipeline.md §9。
 */
export const androidSnapshotUrl = (contentVersion) => `${contentVersion}/${WEB_CONTENT_NAME}`;
