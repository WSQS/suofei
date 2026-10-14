# 首次发布执行手册（待用户逐项授权）

> 2026-10-14 由负责人起草。**状态：未执行。** 每一步的「需授权？」都标出来——**未标授权的步骤也不代表我可以自己决定，只表示它本身不对外**。
> 流水线自身的检查项见 [release-pipeline.md](release-pipeline.md)；这份文档讲的是**首次对外**的操作顺序与上线后必须实测什么。

## 零、前置（缺一不可，全部需要用户单独确认）

| # | 前置 | 谁定 | 现状 |
|---|---|---|---|
| 0.1 | 建公开仓库并推送（Free 账号下 Pages 要求仓库公开） | 用户 | 未做 |
| 0.2 | 签名方案（本机保存 / CI secrets）+ 一枚正式密钥 | 用户 | 未定；现在只有 debug 签名 |
| 0.3 | 真机验收至少跑过一轮 | 用户授权 | 未做（计划已写好：device-acceptance-plan.md） |
| 0.4 | 发布后的「formatVersion 递增判据」口径 | 用户 | 待定（发布前必须定） |

## 一、发布顺序（本地演练已完成，这里是真发）

```
# 1. 确保工作树干净、全门绿（本地）
git status --short                      # 必须为空
npm test                                # 83/83
node tools/check-bundled-content.mjs    # 内置内容 == 内容源
node tools/check-doc-tables.mjs         # 台账列数
cd android && ./gradlew testDebugUnitTest -PextraMavenMirror=…   # 55/55
node web/tests/e2e-cdp.mjs              # 151/151
cd .. && node release/build-release.mjs --tag 'v<应用版本>+content-<内容版本>'
node release/check-ready.mjs --out release/out   # 必须 0 红（含两项真跑门）

# 2. 提交并打 tag（tag 名 = 两个版本号的唯一来源）
git commit -m "release: <内容版本>"
git tag -a 'v<应用版本>+content-<内容版本>' -m '…'
git push origin master --tags        # ← 需授权

# 3. 建仓库/推 Pages 站（首次）：把 release/out/web 作为站点根推到 Pages 分支或由 Actions 部署
#    ← 需授权；具体做法在用户确认「用哪种 Pages 发布方式」后再定

# 4. 发 Release：把 release/out/apk/*.apk 作为附件 —— ← 需授权

# 5. 把远端更新源指向真实地址（Android 端 UpdateEndpoint.BASE_URL 现在还是 example.invalid 占位）
#    ← 这会改代码；需在发布前与用户确认地址形态
```

## 二、上线后**必须实测**的（目前一项都没测过）

| # | 要测 | 为什么必须真环境测 | 怎么测 |
|---|---|---|---|
| 1 | Web 在真实 Pages 上能打开（https + 子路径 `/suofei/`） | 我们只在本机 http 下跑过 | 用真浏览器打开站点，看控制台有没有 404 |
| 2 | Service Worker 在**子路径**下作用域正确、能离线 | `sw.js` 的 scope、预缓存路径写法只在本地验证过 | 打开一次 → 断网 → 重载仍可读 |
| 3 | 旧缓存能随新版本清理、新旧成对切换 | 本地测过，但真实托管有 CDN 缓存层 | 改 `APP_VERSION` 发第二版 → 确认「有新版本」提示与切换 |
| 4 | 分享链接可直接打开（`…/suofei/#/p/gushi-shijiu-shou-01`） | 子路径 + 哈希在真实托管的组合没测过 | 直接粘贴到新标签打开 |
| 5 | Android 的更新检查指向真实地址能取到清单与内容 | 现在指向 `example.invalid` 占位 | 改地址后发新版 APK 实测 |
| 6 | Release 里的 APK 能下载、能装、能覆盖升级 | 覆盖升级需要正式签名，从未测过 | 装 v1 → 装 v2 → 确认覆盖成功、数据保留 |

## 三、已知风险与「不声称」的事

- **GitHub Pages / Release 各自的缓存与生效延迟由服务商决定**——流水线**不声称原子性**；三样产物之间可能出现「短暂不一致」的窗口。
- `sw.js` **不能设长 `max-age`**（部署侧要求），否则浏览器拿不到新 SW。
- **坏版本怎么补救**：只能**发更高版本的新内容**去修正；我们按用户决定**移除了「回退到上一版」的能力**（Android 只保留当前快照 + APK 内置兜底）⇒ 一旦某版内容有问题，用户在装到修复版之前会一直看到它。
- 清站点数据/卸载重装会**丢掉离线副本**（回落 APK 内置那份），这是浏览器与系统的固有行为。

## 四、这份文档不做的事

- 不创建仓库、不推送、不建 tag、不启用 Pages、不配置签名 secrets、不装设备；
- 不含任何密钥、口令或账号凭据。
