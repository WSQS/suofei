# Android 离线更新设计（工作线 D）

- 状态：**v0 草案 → 已在 Android 骨架里落成可运行实现**（2026-10-14）。对应代码：`android/app/src/main/java/dev/sopho/suofei/`。
- 依据：`CONTEXT.md` 的离线与更新硬需求；`docs/design/content-contract.md` 第 2/4 节（内容 JSON 与版本语义）。
- 适用端：**Android**。Web 端的资源缓存与内容存储是另一套实现，只共用**协议与语义**，不共用代码与版本号（见第 9 节）。
- 已验证/未验证的边界见第 10 节；本文件里的接口决定见第 11 节（**待用户确认**）。

## 1. 两层内容：APK 内置 vs 已下载

| | 来源 | 位置 | 何时可用 |
|---|---|---|---|
| 内置内容 | 随 APK 打包的 assets | APK 内 `assets/content/content.json` | **首装、断网即可读**；只读，永远存在 |
| 已下载内容 | 更新流程下载并校验通过的快照 | 应用私有目录 `filesDir/content/` | 下载+校验+切换之后 |

- 不变量：**任何时刻都能读到一份完整内容**。内置内容缺失或损坏属于打包事故（UI 如实报错，不伪造内容）；已下载内容损坏时自动退回内置内容。
- 内置内容是「该次发布的完整内容」，不是增量基线：更新下载的也是一份**完整** JSON，不做差分补丁。
- **内置内容已是真实产物**（2026-10-14）：`assets/content/content.json` ＝ `dist/content.json`（真实 19 首、23899 字节、sha256 `f58f945a…`，与源文件字节一致）；占位夹具与 `FIXTURE-README.md` 已删除。以后每次发新版内容重做一次替换（见 `android/README.md`「内置内容」）。链路不变。

## 2. 更新检查协议（接口决定 A）

远端只需两个静态文件，**不需要服务端逻辑**：

```
{BASE_URL}/content/latest.json      ← 更新清单（小文件，每次都取）
{BASE_URL}/content/<contentVersion>/content.json   ← 完整内容快照（清单指向它）
```

清单字段（`android/app/src/main/java/dev/sopho/suofei/update/UpdateProtocol.kt` 是唯一定义处）：

| 字段 | 必填 | 类型 | 含义 |
|---|---|---|---|
| `formatVersion` | 是 | 整数 | 内容**结构**版本。高于本应用支持值 ⇒ 拒绝激活，保留旧内容 |
| `contentVersion` | 是 | 字符串 | 内容版本（契约 §4 的单调递增字符串），与载荷内的 `contentVersion` 必须一致 |
| `url` | 是 | 字符串 | 内容快照地址；允许绝对 URL，也允许相对 `{BASE_URL}` 的路径 |
| `sha256` | 是 | 64 位十六进制 | 内容快照的 SHA-256。**缺全省略号一律拒绝更新（fail-closed）** |
| `size` | 否 | 整数 | 字节数；给了就强制比对 |
| `minAppVersionCode` | 否 | 整数 | 需要的最低应用 `versionCode`；更高则只提示升级应用，不动内容 |

示例（形状，不是真实内容）：

```json
{
  "formatVersion": 1,
  "contentVersion": "2026.10.14.2",
  "url": "content/2026.10.14.2/content.json",
  "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "size": 4096,
  "minAppVersionCode": 1
}
```

- 地址常量：`UpdateEndpoint.BASE_URL` / `MANIFEST_PATH`，当前是**占位** `https://example.invalid/suofei/content/latest.json`（`.invalid` 是保留域名，占位期绝不会误连真站点）。改地址＝只改这两行。
- 检查方式：`GET` 清单，带 `User-Agent: Suofei-Android/<versionName> (<versionCode>)`；连接超时 10s、读超时 30s；`HTTP 2xx` 才算成功。
- 不比较时间戳、不看 `ETag`：只比 `contentVersion`（契约 §4 的比较规则，实现见第 12 节）。
- 载荷体积上限 32 MiB（`ContentUpdater.MAX_CONTENT_BYTES`），清单声明或实际下载超过即失败。

## 3. 应用内读取 content.json 的入口与降级（接口决定 C）

唯一入口：`ContentRepository.load()`（`data/ContentRepository.kt`）。判定顺序：

1. `ContentStore.loadActive()`：读指针文件 `current` → 读 `versions/<v>/content.json`。
   - 指针缺失 / 目录或文件缺失 / JSON 非法 / **`formatVersion` 高于本应用支持值** / 载荷里的 `contentVersion` 与指针不一致 ⇒ 一律当作「读不出来」返回 null；
2. 返回 null ⇒ 退回 **APK 内置 assets**（`ContentRepository.bundled()`）；
3. 内置内容也读不出来 ⇒ 抛异常，UI 如实显示「内容不可用」；**不伪造、不静默空列表**。

- `formatVersion` 更高时的处理（契约要求「保留旧内容、不去解析」）：**不解析**该版本，退回内置内容，并在磁盘上原样保留它（不删除）。这条在「应用被降级」时是真会发生的：新版应用装过 `formatVersion=2` 的快照，旧版应用再打开时不能拿旧解析器去读新结构。
- `ContentRepository.installedContentBroken()` 如实报告「已安装版本坏了、本次读的是内置内容」，供「内容更新」页面展示。
- 上述降级路径有 JVM 单测实测（`ContentRepositoryTest`，6 例，含损坏、指针不一致、结构过新三种退化）。

## 4. 本地存储布局（接口决定 B）

`rootDir = context.filesDir/content`（应用私有目录，卸载即清空）：

```
filesDir/content/
├── current                                  # 指针：当前生效的 contentVersion（纯文本）
├── previous                                 # 指针：上一个生效版本（唯一回滚候选）
├── staging/<contentVersion>.part            # 下载临时文件；读者永远看不到它
└── versions/<contentVersion>/
    ├── content.json                         # 完整内容快照，落盘后只读
    └── meta.json                            # {contentVersion, sha256, sourceUrl, installedAtMillis}
```

- 目录名／文件名就是接口：`versions/` 下的目录名**等于** `contentVersion`；内容文件名固定 `content.json`；指针文件名固定 `current` / `previous`。改动它们＝改动已发布客户端的磁盘布局，需要迁移逻辑。
- 只保留「当前 + 上一个」两个快照，其余目录连同 `staging/` 残留一并删除（`pruneOldVersions`），所以是「新版可删改、不是只累积」。

## 5. 原子切换怎么做

「原子」不靠「写完再覆盖正在被读的文件」，而是**把内容文件与指针分开**：

1. 下载只写 `staging/<v>.part`（读者看不见）；
2. `ContentStore.install()` 先**解析校验**暂存文件（结构版本、版本号一致性），任何一步失败 ⇒ 移除暂存、**磁盘上旧指针与旧快照一个字节都不动**；
3. 通过后，把暂存文件移进 `versions/<v>/content.json`，并写 `meta.json`；此时该版本目录已完整，但还没有任何读者知道它；
4. **最后一步**才切指针：写 `current.tmp` → 单次 `rename()` 覆盖 `current`（同目录、同文件系统 ⇒ 内核保证原子）。同时把旧值写进 `previous`；
5. `Files.move(..., ATOMIC_MOVE)` 不被文件系统支持时退回 `REPLACE_EXISTING`（Windows 上即 `MoveFileEx+REPLACE`）；该回退路径在**本机 Windows JVM 单测里真实跑过**。

因为内容文件一旦落盘就不再被改写，正在读旧版本的读者手里那份文件不会变；新读者要么看到旧版本号、要么看到新版本号，不存在「半个文件」的中间态。

## 6. 失败 / 损坏 / 不兼容怎么处理

| 情形 | 处理 | 结果 |
|---|---|---|
| 连不上、超时、HTTP 非 2xx | 报 `NETWORK` | 旧内容不动；UI 显示原因 |
| 清单非 JSON / 缺字段 / `sha256` 非法 | 报 `MANIFEST_INVALID` | 旧内容不动 |
| 远端 `formatVersion` > 本应用支持值 | 报 `FORMAT_TOO_NEW` | **连内容都不下载**，旧内容保留，提示「请更新应用」 |
| `minAppVersionCode` 高于当前应用 | 报 `APP_TOO_OLD` | 同上 |
| 远端版本不比本地新 | `UpToDate` | 不下载 |
| 下载字节数与清单不符 | 报 `SIZE_MISMATCH` | 丢弃下载，旧内容保留 |
| SHA-256 不符（下载损坏/被篡改） | 报 `CHECKSUM_MISMATCH` | 丢弃下载，旧内容保留 |
| 内容 JSON 非法 / 载荷版本与清单不符 | 报 `PAYLOAD_INVALID` | 不落盘，旧内容保留 |
| 已生效快照后来损坏 | 读取时退回内置内容 | 仍可读，且如实提示 |
| 需要回退 | `ContentStore.rollbackToPrevious()` | 备用路径，正常流程用不到，保留是为了「保旧版」有第二道手 |

所有失败都满足同一个不变量：**读者看得到的内容不变，且失败原因对用户可见**。

## 7. 新版可删改（不是只累积）

- 每次更新激活的都是**完整快照**：新快照里删掉的作品自然不存在，不需要「按 id 删条目」的增量逻辑；
- 旧快照在切换成功后被清理（只留 `current` 与 `previous`），因此被删改的内容不会以「累积副本」的形式残留在磁盘上；
- 内存侧同理：切换后是一次整体替换，不做逐条合并。

## 8. 阅读中不突然替换

- 更新流程只改磁盘与指针，**不触碰当前已载入内存的内容**；
- 下载校验通过后，应用把它记为「待采用的新版本」并在目录页显示一行提示（`AppState.pendingVersion`）；
- 只有在**回到目录页**时才重新载入内容（`AppState.openLibrary()`），所以用户正在阅读的诗页不会被替换、滚动位置与当前诗不会跳变；
- 进程被杀后重启属于自然的重新载入（此时采用已生效的新版本）。

## 9. 版本号：应用/资源版本 ≠ 内容版本

| 号 | 出处 | 例子 | 用途 |
|---|---|---|---|
| 应用版本 | Gradle `versionCode` / `versionName` | `1` / `0.1.0` | APK 覆盖升级、`minAppVersionCode` 比较 |
| 内容结构版本 | JSON `formatVersion` | `1` | 解析兼容性；更高 ⇒ 拒绝解析 |
| 内容版本 | JSON `contentVersion` + 清单同名字段 | `2026.10.14.1` | 更新比较与本地目录命名 |

- 三者**不共用一个号**；界面底部同时显示「应用 x.y.z (code) · 内容 <contentVersion>（来源：内置/已下载）」。
- Web 端同理：应用资源缓存键与内容存储键分开（由工作线 E 实现），本文件只定义 Android 侧。

## 10. 已验证 / 未验证

**已验证（可复现）**
- `./gradlew assembleDebug` 通过；APK 内 `assets/content/content.json` 存在且与源文件字节一致（命令见 `android/README.md`）。
- 45 个 JVM 单测通过（`./gradlew testDebugUnitTest`），其中 `UpdateFlowTest`(9) 用本机临时 HTTP 服务真跑「检查→下载→校验→切换」，覆盖成功、校验失败、体积不符、结构过新、应用过旧、HTTP 500、清单非法、连续升级与快照清理。
- `ContentStoreTest`(8) / `ContentStoreTest`+`ContentRepositoryTest` 覆盖失败保旧版、不兼容拒绝、损坏退回内置。

**未验证（不要当成已成立）**
- **未在真机/模拟器上运行过**（本轮授权禁止 adb/模拟器操作）：界面渲染效果、实际点击路径、Android 平台 `assets` 读取与 `filesDir` 行为「按代码正确」但未在设备上观察。
- **未对真实发布源验证过更新流程**：`BASE_URL` 是占位地址，成功路径只在本地临时 HTTP 服务上验证过；HTTPS、真实 CDN、真实 Token 都没跑过。
- 未做断网/弱网/大文件/并发多次点击「检查更新」的真实设备测试。
- 未做应用升级（`versionCode` 增长）与内容回滚的真机验证。

## 11. 接口决定（暂定，待用户确认）

判据：这些是「明天改它，别人也要跟着改」的东西。每条给出依赖者与改动面。

| # | 接口 | 暂定值 | 谁依赖 | 改动要动哪里 |
|---|---|---|---|---|
| A1 | 清单文件名与路径 | `content/latest.json`（相对 `BASE_URL`） | 发布脚本、Web 端、已发布客户端 | `UpdateEndpoint.MANIFEST_PATH`；已发布客户端无法兼容改名 ⇒ 需保留旧路径 |
| A2 | 清单字段名 | `formatVersion` / `contentVersion` / `url` / `sha256` / `size` / `minAppVersionCode` | 同上 + 服务器产物 | `UpdateProtocol.kt`（字段常量、解析）＋ `UpdateManifestParserTest` 的字段名断言 |
| A3 | 校验强度 | `sha256` **必填**，缺失即拒绝更新 | 发布脚本必须产出哈希 | `UpdateManifestParser`；放宽＝降低「损坏/篡改也能激活」的防线 |
| A4 | `url` 允许相对路径 | 允许（按 `BASE_URL` 解析） | 发布脚本可自由换域名 | `ContentUpdater.resolveUrl` |
| A5 | 内容体积上限 | 32 MiB | 未来内容规模 | `ContentUpdater.MAX_CONTENT_BYTES` |
| A6 | 下载协议 | 明文 HTTPS `GET`，不支持断点续传 | 发布侧带宽/成本 | 若日后要续传需改清单与 `ContentUpdater` |
| B1 | 本地目录布局 | `filesDir/content/{current,previous,staging,versions/<v>/{content.json,meta.json}}` | 已发布客户端的磁盘状态；日后若做导入/导出工具 | `ContentStore` 常量；改动需要迁移逻辑 |
| B2 | 快照保留策略 | 只留当前 + 上一个 | 存储占用 vs 回滚能力 | `ContentStore.pruneOldVersions` |
| C1 | 应用内读取入口 | `ContentRepository.load()` 单一入口，已下载优先、失败退回内置 | 所有 UI 代码 | `ContentRepository` |
| C2 | `formatVersion` 更高的行为 | 不解析、退回内置、磁盘上保留该快照 | 与 A2 配套；Web 端需同样语义 | `ContentStore.loadActive` |
| C3 | 空内容/无笔记语义 | `notes == null` ⇒ 显示「（无笔记）」，绝不生成占位笔记 | 内容线产出、Web 端一致性 | `PoemScreen`；契约 §2 已定 `notes: null` |

## 12. 建议改接口（由负责人转交用户，本轮**未**擅自改契约）

1. **`contentVersion` 比较规则措辞（`content-contract.md` §4）**：契约写「按 ISO 日期前缀＋递增序号的**字典序**比较」，但字典序会把 `2026.10.14.10` 判成比 `2026.10.14.9` 小。实现改为**纯数字分段按数值比较**（对契约举的例子结果一致，见 `ContentVersionTest`）。
   - 代价：几乎为零；建议契约改成「按 `.` 分段，纯数字段按数值比较，其余按字典序」。
   - 风险：若 Web 端按纯字典序实现，两端在同一份版本号上可能判定不同。
2. **`dist/content.json` 示例缺 `authorSortKey` / `titleSortKey`**：§2 正文要求编译器写入这两个排序键，但同节的 JSON 示例里没有这两个字段。Android 端当前**允许缺失**（缺失时退回 `author`/`title` 本身，且「佚名/未详排最后」由客户端规则保证）。
   - 建议：契约明确「`authorSortKey`/`titleSortKey` 是否必填」，并说明「佚名排最后」是靠编译期键编码还是靠客户端规则（两端必须一致）。
3. **`dynastyLabel` / `dynastyOrder` 冗余字段**：契约同时要求诗对象携带这两个字段、又要求 `dynastyKey` 必须在 `dynasties` 中声明。Android 端**以 `dynasties` 声明表为准**，忽略诗对象里的冗余值（不静默采用冲突值）。建议契约写明「以声明表为准，诗对象内为冗余快照」。
