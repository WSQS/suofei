# 真实 2 标签热更链路 —— 模拟器验收留痕（2026-10-18）

> 本目录是**实测证据**，不是规格。上位说明：标签视图接受锚见
> [`../tag-tab/README.md`](../tag-tab/README.md)、真实两标签复核见
> [`../tag-tab-2tags/README.md`](../tag-tab-2tags/README.md)。
> 本轮只验一件新事：**经真实更新链路**（真 HTTP 请求 / 真下载 / 真校验 / 真激活）把一份
> **formatVersion 3、两个真实标签**的内容热更上设备，并复验「拒升级 / 坏内容保旧 / 激活后离线」。
> 判定**只看**：服务端日志的真实请求＋状态码、设备侧 `files/content/` 指针与目录、关于页 `contentVersion`、断网冷启可读。
> **启动耗时只作环境注记，不进入通过/不通过**（见 `environment-observation.txt`）。

## 0 · 设备身份（只碰这一台）

| 项 | 值 |
|---|---|
| adb 序列号 | `emulator-5556`（`ro.serialno` = **`EMULATOR36X1X9X0`**） |
| 镜像 | `sdk_gphone64_x86_64` / `emu64xa`，**API 35**（Android 15），AVD = `Pixel_6` |
| 屏幕 / 导航 | `wm size` = **1080x2400**，`navigation_mode=2`（手势导航） |
| 未碰的设备 | `emulator-5554`（PD2364 / V2364A，别人在用）、`YOCTO`、`127.0.0.1:7776` |

## 1 · 两个 APK（同名同号同证书，只有代码代不同；**都是 debug 签名**）

| | 旧 APK（format 2 代码） | 新 APK（format 3 代码） |
|---|---|---|
| 来源 | `git archive c6af69c`（= 已发布 0.1.3 那一代 Android 代码）解到临时目录构建 | 本工作树（`wt/2-12-dist-web-content-json-a-234f4711`，含标签 tab 与 format 3 解析） |
| `versionCode` / `versionName` | **4 / 0.1.3** | **4 / 0.1.3** |
| 签名证书 | `CN=Android Debug, O=Android, C=US`，SHA-256 `faff248f15977835c25c25ec8c0b865fa6c4207bada8cfc8e5785ea8aa94e956` | **同一张 debug 证书**（⇒ 可覆盖安装、数据保留） |
| APK sha256 | `d5b2d2a35ddb0eae89adbb01487685d0ee1f83cb23795e3e6bd3a90c7954e439` | `7b11368bfc0f222453e3fe5e052ab5be242c13e3e413699ec3bcbe46ce21e59e` |

⚠ **与正式签名分开写**：正式发布用的是 `CN=Suofei`（`1346444c…`）。上面两个包**都是 debug**
（`faff248f…`），只用于本机验收，**不能当发布产物**。

⚠ **两处测试专用改动（未提交、构建后已 `git checkout --` 复原）**：`UpdateEndpoint.BASE_URL`
指向本机 `http://10.0.2.2:18765/suofei`，`<application>` 加 `android:usesCleartextTraffic="true"`
（Android 9+ 默认禁明文）。两处只决定「从哪取」，不参与版本门/校验/落盘/UI 的任何判定；真实站点是 https。

## 2 · 载荷身份（关键口径）

| 版本 | format | 字节 | sha256 | 角色 |
|---|---|---|---|---|
| `2026.10.18.1` | 3 | 27926 | **`2c4f84e9dac450d695eb9fa587548eea17e95703168526cdce15180849cebfdd`** | 基准：当前已验产物（= 主树 `dist` = `web/content.json` = `assets`，22 首 / 古19 / 唐2） |
| `2026.10.17.1` | 2 | 26081 | `30e86693ea60fa97492c85de97e80853308bad5ec173d2d165e83b3a96de2856` | **旧代载荷**：已发布 `2026.10.16.26` 的**字节**（sha `eb4f28b9…`），只改 `contentVersion`＋`generatedAt`。用途：先让**旧 APK** 激活一份「已激活快照」 |
| **`2026.10.18.2`** | **3** | **27926** | **`624a2405cc209ee2869606f1bc7a9cb7cbd943d11a000d4a324cfcb6157eb781`** | **本轮新载荷**：由 `2c4f84e9…` 的字节派生，**只改 `contentVersion` 与 `generatedAt`** |
| `2026.10.18.3` | 3 | 27926 | `cef50d4af14fe9ed039f93d1f1a5f82af13697ee3f1a68917f72db859e56a037` | 坏载荷 ①：同 `.2`，清单里故意写 64 个 0 的 sha |
| `2026.10.18.4` | 3（文件被截断） | 20000 | `8783de9e13ef3bc7411ea020f04aaadd3988a4e3dd501fc41edbdae52995c332` | 坏载荷 ②：`.2` 的字节截到 20000，**清单 sha/size 按截断后的字节写**（校验会过、JSON 非法） |

**`2026.10.18.2` 与 `2c4f84e9…` 的关系（固定口径）**：
**同一真实 22 首 / 两标签语义；仅版本与时间戳不同，这是用于热更的新载荷身份。**
实测核对：两份 JSON 的顶层键只有 `contentVersion`（`2026.10.18.1`→`2026.10.18.2`）与
`generatedAt`（`2026-10-18T10:30:12Z`→`2026-10-18T12:00:00Z`）不同；`dynasties` / `tags`（古诗十九首 19 条、
唐诗三百首 2 条）/ `poems` 22 首逐项相同；文本级差异 = 前 48 字节相同、后 6838 字节相同。
⚠ **不声称与 `2c4f84e9` 字节相同**——sha 不同正是「载荷身份」的差别。

清单（与站点真产物的形状一致：`formatVersion` / `contentVersion` / `url`（相对清单目录）/ `sha256` / `size` / `minAppVersionCode`）：
见 `latest-A-old-format2.json`、`latest-B-new-format3.json`、`latest-C-badsha.json`、`latest-D-truncated.json`。
载荷派生脚本与逐字节比对在临时目录（`C:/Users/wsqsy/AppData/Local/Temp/tag2-hot/make-payloads.mjs`），仓库里只放结论与哈希。

## 3 · ① 旧 APK（format 2）遇 format 3：拒激活、保已激活快照

| 步骤 | 实测 | 证据 |
|---|---|---|
| 装旧 APK（先 `uninstall` 清干净）→ 启动自动检查，清单 A（format 2 / `2026.10.17.1`） | 服务端：`GET /suofei/content/latest.json -> 200 222B`、`GET /suofei/content/2026.10.17.1/content.json -> 200 26081B`（UA `Suofei-Android/0.1.3 (4)`）；界面顶部「新内容 2026.10.17.1 已下载并校验通过，返回本目录后生效（阅读中不替换）」 | `server.log` 第 5–6 行；`03-old-library-adopted.png/.xml` |
| 已激活快照落地 | `files/content/{current,staging,versions}`；`versions/2026.10.17.1/{content.json,meta.json}`；`staging/` **空**；`current` = `2026.10.17.1` | `04-old-about-activated-2026.10.17.1.png/.xml`（关于页「内容版本 **2026.10.17.1**」「已是最新内容（远端 2026.10.17.1）」） |
| 清单换成 B（**formatVersion 3** / `2026.10.18.2`）→ 点「检查更新」 | 界面原文：**「更新未生效，旧内容保留：远端内容结构版本 3 高于本应用支持的 2；保留当前内容，请更新应用（需更新应用，内容不会被动）」** | `05-old-format3-refused.png/.xml` |
| 服务端 | 这一轮**只有** `GET /suofei/content/latest.json -> 200`（10:59:50），**没有**任何 `2026.10.18.2/content.json` 请求 | `server.log` 第 9 行；全日志里 `.2` 的 content 请求只有**主机 curl**（第 4 行，UA `curl/8.19.0`）那一条 |
| 磁盘与内容 | `versions/` 仍只有 `2026.10.17.1`；`current` 未变；`staging/` 空；目录页仍是旧快照的 19/2/1 首 | 同一时刻 `run-as … ls -R files/content`；`04-*` 的界面 |

## 4 · ② 新 APK 热更到新载荷 `2026.10.18.2`

**先量「更新前」**（覆盖安装新 APK 后：同一份数据、快照仍是 `2026.10.17.1`）：
`current` = `2026.10.17.1`（覆盖安装保留数据）。

| 更新前（format 2 快照，没有 `tags`） | 证据 |
|---|---|
| 目录：顶部「朝代 ｜ 标签 ｜ 关于」，朝代页 汉 `[19] 首` / 唐 `[2] 首` / 近现代 `[1] 首` | `06-new-library-v2snapshot.png/.xml` |
| **标签页是空的**：只有两个 tab，**没有任何组头、也没有空态文字** | `07-new-tag-tab-empty-v2snapshot.png/.xml` |
| 关于页「内容版本 **2026.10.17.1**」「已是最新内容（远端 2026.10.17.1）」 | `08-new-about-before-hotupdate-2026.10.17.1.png/.xml` |

| 热更行动 | 实测 | 证据 |
|---|---|---|
| 清单 B（format 3 / `2026.10.18.2`）→「检查更新」 | 服务端：`GET /suofei/content/latest.json -> 200 222B`、**`GET /suofei/content/2026.10.18.2/content.json -> 200 27926B`**（同一 UA，相差 14ms）；界面：「新内容 2026.10.18.2 已下载、校验通过并已切换生效（27926 字节）；返回目录后采用。」 | `server.log` 第 12–13 行；`09-new-about-hotupdate-activated-2026.10.18.2.png/.xml` |
| 落盘 | `versions/2026.10.18.2/{content.json,meta.json}`（**只剩这一个**）；`current` = `2026.10.18.2`；`staging/` 空；`meta.json` 的 `sha256` = `624a2405…`、`sourceUrl` = `http://10.0.2.2:18765/suofei/content/2026.10.18.2/content.json` | 见 `payloads-and-manifests.txt` §3 |
| 回目录后采用 | 目录页正常；关于页「内容版本 **2026.10.18.2**」 | `10-new-library-after-adopt.png/.xml`、`13-new-about-2026.10.18.2.png/.xml` |
| **标签页两组**（顺序照产物：古 gǔ 在 唐 táng 前、**不显示数量**） | `古诗十九首`、`唐诗三百首` | `11-new-tagtab-two-groups.png/.xml` |
| **唐诗三百首展开两行**（其一 → 其二，作者都是杜甫） | `梦李白二首·其一` / `梦李白二首·其二` | `12-new-tagtab-tang300-two-rows.png/.xml` |
| 再点一次「检查更新」 | 「已是最新内容（远端 2026.10.18.2）」；服务端**只有** `latest.json`（没有重复下载） | `14-new-about-uptodate-2026.10.18.2.png/.xml`；`server.log` 第 14 行 |
| **激活后断网冷启可读** | 飞行模式 1 ＋ `svc wifi/data disable`（`ping 10.0.2.2` → `Network is unreachable`）→ `force-stop` → 冷启动：朝代页、**标签页两组且唐300 两行**、关于页仍 `2026.10.18.2`；更新检查如实失败「取更新清单失败：Failed to connect to /10.0.2.2:18765」 | `15-offline-coldstart-library.png/.xml`、`16-offline-coldstart-tagtab-two-groups-expanded.png/.xml`、`17-offline-about-2026.10.18.2.png/.xml`；离线窗口内 `server.log` **零条** |

⚠ **「唐 1→2」这条口径要更正**：真实内容里 `唐诗三百首` **从来没有 1 条**的状态——
`content/poems/杜甫/梦李白二首·其一.md`、`·其二.md` 是在 **6b92780 同一次**加 `tags:` 的（本仓 git 记录），
而 c6af69c 那份 format 2 内容**根本没有 `tags` 键**。所以本轮能实测的前后差是：
**标签组数 0 → 2、`唐诗三百首` 行数 0 → 2、`古诗十九首` 19 行**（上一轮 README 标题里的「（1 → 2）」指的是**组数** 1→2，那一轮夹具里只有一组）。
⇒ 本轮**不改内容造一个「唐 1 条」的假状态**去凑这条断言，如实记 0→2。

## 5 · ③ 坏内容保旧（新 APK，已激活 `2026.10.18.2`）

| 场景 | 界面原文 | 服务端 | 磁盘 |
|---|---|---|---|
| 清单 sha 与载荷不符（`2026.10.18.3`，清单 sha = 64 个 0） | 「更新未生效，旧内容保留：SHA-256 不符（清单 0000…0000，实际 cef50d4af14fe9ed039f93d1f1a5f82af13697ee3f1a68917f72db859e56a037）；已丢弃下载结果，保留旧内容（下载/校验未通过）」 | `GET /…/2026.10.18.3/content.json -> 200 27926B` | `versions/` 仍只有 `2026.10.18.2`；`staging/` 空；`current` 不变 |
| 载荷截断（`2026.10.18.4`，清单 sha/size 与截断后字节一致） | 「更新未生效，旧内容保留：内容 JSON 非法：顶层不是 JSON 对象；保留旧内容」 | `GET /…/2026.10.18.4/content.json -> 200 20000B` | 同上 |

证据：`18-badsha-keeps-old.png/.xml`、`19-truncated-keeps-old.png/.xml`；`server.log` 第 15–18 行。

## 6 · ④ 两路返回仍可用（每路一次系统返回键）

| 路径 | 动作 | 结果 | 证据 |
|---|---|---|---|
| 标签视图 | 「唐诗三百首」展开 → 点「梦李白二首·其一」→ 诗页（`杜甫 · 唐 · 五言古诗`、8 行）→ `input keyevent KEYCODE_BACK` | 回到**标签视图**，唐300 仍展开、两条仍在原位 | `20-before-tag-path` / `21-tag-path-poem` / `22-tag-path-back-to-tagview` |
| 朝代视图 | 朝代 tab →「唐」展开（`[2] 首`）→ 点「其一」→ 诗页 → `KEYCODE_BACK` | 回到**朝代视图**，唐仍展开 | `23-dynasty-tang-expanded-before-enter` / `24-dynasty-path-poem` / `25-dynasty-path-back-restored` |

「状态保持」不是形容：把 dump 的 `text + bounds` 逐行拼起来比较，
`s20`（进入前）与 `s22`（键返回后）、`s23` 与 `s25` **完全相等**（脚本输出 `true` / `true`）。

## 7 · 服务端关键行（全部请求，按时间）

```
10:53:32 / 10:53:33  主机 curl 自检三条（latest / 2026.10.17.1 / 2026.10.18.2）——不是 app 请求
10:55:54 latest.json 200 222B  + 2026.10.17.1/content.json 200 26081B   ← 旧 APK 首次自动更新（激活快照）
10:58:19 / 10:58:50 / 10:59:50 latest.json 200（旧 APK 的两次自动检查 + 一次手动检查）
10:59:50 latest.json 200 222B（清单已是 format 3）——**此后没有任何 content.json 请求**（旧 APK 拒绝下载）
11:01:16 latest.json 200（新 APK 首次启动自动检查，清单仍是 A ⇒ 已是最新）
11:17:41 / 11:18:29 latest.json 200（重启后新 APK 自动检查 + 更新前手动检查）
11:18:29 latest.json 200 + **2026.10.18.2/content.json 200 27926B**  ← 真下载、真校验、真激活
11:19:29 latest.json 200（再查一次：已是最新，未重复下载）
（11:19:30–11:20:45 离线窗口：**零请求**）
11:20:46 latest.json 200 + 2026.10.18.3/content.json 200 27926B  ← sha 不符 ⇒ 保旧
11:21:01 latest.json 200 + 2026.10.18.4/content.json 200 20000B  ← JSON 非法 ⇒ 保旧
```
完整原文见 `server.log`（18 行，无删改）。

## 8 · 截图清单（我**亲眼看过**的，逐张一句）

1. `04-old-about-activated-2026.10.17.1.png` —— 旧 APK 关于页：「内容版本 2026.10.17.1」「已是最新内容（远端 2026.10.17.1）」，证明快照真的来自本机更新链路。
2. `05-old-format3-refused.png` —— 旧 APK 遇 format 3 的完整拒绝原文，正文与「需更新应用，内容不会被动」都在。
3. `06-new-library-v2snapshot.png` —— 新 APK 覆盖安装后读 **v2 快照**：朝代页 汉19/唐2/近现代1，顶部「朝代 ｜ 标签 ｜ 关于」。
4. `07-new-tag-tab-empty-v2snapshot.png` —— 更新**前**的标签页：选中「标签」但**空**（无组头、无空态文字）。
5. `09-new-about-hotupdate-activated-2026.10.18.2.png` —— 热更刚完成那一刻：「新内容 2026.10.18.2 已下载、校验通过并已切换生效（27926 字节）；返回目录后采用。」而「内容版本」**仍是 2026.10.17.1**（＝阅读中不替换）。
6. `12-new-tagtab-tang300-two-rows.png` —— 更新**后**的标签页：两组，`唐诗三百首` 展开两行（其一/其二，杜甫）。
7. `16-offline-coldstart-tagtab-two-groups-expanded.png` —— 断网冷启后标签页仍两组、唐300 仍两行（读的是已激活快照）。
8. `18-badsha-keeps-old.png` —— sha 不符的完整拒绝原文（清单 000…／实际 cef50d4a…），内容版本仍是 2026.10.18.2。

其余 PNG（`03`、`10`、`11`、`13`、`14`、`15`、`17`、`19`、`20`–`25`）**没有逐张用眼睛复核**，
它们随同名 `.xml`（`text + bounds` 原文）一起留档，断言以 dump 与服务器日志为准，不以「有图」代替。

## 9 · 未做 / 未核（诚实清单）

- **真机没碰**：只在 `emulator-5556` 上跑；触摸手感、字体回退、OLED 观感**没验**。
- **正式签名包没测**：两个 APK 都是 **debug 签名**（`CN=Android Debug`），不是发布用的 `CN=Suofei`。
- **`minAppVersionCode` 的门没单独触发**：本轮清单里写的是 4（新 APK 的 versionCode 正是 4），
  `APP_TOO_OLD` 分支**没有**被这条链路覆盖（旧的 format 门先命中）。
- **`local.properties` 与构建缓存**：两个包都是本机 `--offline` Gradle 构建，未核 CI 同法可否复现。
- **服务端只在本机临时目录**（`http://10.0.2.2:18765/suofei`）：响应头 `cache-control: no-store` 是我加的最小实现，
  不是 GitHub Pages 的行为；真实站点的缓存/重定向/404 形状**没验**。
- **反向兼容**：只验了「format 2 客户端拒 format 3」。没有验「format 3 客户端读 format 2」（上一轮 `tag-tab/` 有，本轮未重跑）。
- **标签规模**：真实只有 2 个标签；20/50 个标签、长标签名折行、320 宽**没出图**。
- **无障碍**：TalkBack 朗读与焦点顺序**没核**。
- **两路返回**只各按了一次系统返回键（标签/朝代各一次）；未重复上轮的全套（详情→诗→原视图、手势链、浏览器式后退）。
