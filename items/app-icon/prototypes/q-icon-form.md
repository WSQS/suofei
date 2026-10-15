# 原型：应用图标（它回答的问题是「索斐的图标长什么样？」）

**已采纳：`N1`**——单字「索」＋右下一条 accent 发丝角标；字体 **`Noto Sans SC`**（SIL OFL ⇒ 可转矢量轮廓）。**favicon 另用一套无字极简记号 `M1`**（N1 在 16/32px 下糊）。采纳时间 2026-10-15（用户看完第四轮 7 个形态后选 N1）。

- 采纳版本的**活来源**（只读、**留在原地**）：`prototype/icons/svg/r4-N1-{bg,fg,mono}.svg`——三份都断言**不含 `<text>`**（字形是轮廓，不依赖运行时字体）。
- 用户当时看的那张总览＝`prototype/icons/out/round4-forms.png`（192/96/48/32/16px ＋ 三种**近似**遮罩 ＋ 单色层）。
- 落地：Android 自适应三层矢量（生成器 `android/tools/make-launcher-icon.mjs`）＋ Web `web/icons/`（生成器 `web/scripts/build-icons.mjs`，含 M1 favicon）。

## ⚠ 它没有表达什么

- **厂商遮罩**（squircle／圆角方）与 **`<monochrome>` 主题图标**的实际观感：只验过 AOSP 圆遮罩（证据 `docs/reviews/ui-review/materials-android/f-icon-launcher.png`）。
- **32/16px 下的可辨认度**：N1 在该尺寸糊成一团——这正是另做 M1 的原因（证据在同一张总览的最后两列）。
- 一处如实记录的偏差：accent 角标超出原型自述的「中心直径 66 圆」**0.75%**（仍在系统保证可见区内，余量 2.188）。**未处置**，见 `../item.md` 的开放区域。

## 相邻材料

- 被否的方向与其预览（第一轮 a/b/c/d、第三轮 `final-*`、第四轮 A/C/N2–N5、未选中的字体候选）：`../history/`。
- 视觉风格与令牌：`items/app-ui/prototypes/q-visual-direction.md`、`docs/design/visual-tokens.md`。
