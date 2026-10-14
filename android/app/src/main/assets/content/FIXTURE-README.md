# 占位夹具（非校对文本）

本目录下的 `content.json` 是**占位夹具**，由工作线 D（Android 骨架）手写：

- 题名、作者、正文、异文、笔记全部是合成占位内容，**不是**《古诗十九首》或任何底本的校录结果；
- 唯一用途是打通 Android 骨架（分组/搜索/正文分行/笔记展开）与离线更新流程；
- **不得**进入公开发布产物。

真实内容由工作线 A 核对原文、工作线 C 编译 `dist/content.json` 后替换本文件（替换方式与校验步骤见 `android/README.md`「内置内容替换」）。

本文件所在路径与 APK 内的 assets 路径 `content/content.json` 一一对应：
读取它的代码是 `dev.sopho.poetry.data.BundledContent`，常量 `ASSET_PATH`。
