# 历史：被否的图标方向与它们的预览

用户 2026-10-15 选定 **`N1`**（字体 `Noto Sans SC`）⇒ 本目录收着**当时考虑过但没选中**的东西（**保留、标注**，不删）。

| 轮次 | 文件 | 是什么 | 后来怎么了 |
|---|---|---|---|
| 第一轮：四个方向 | `a-single-glyph-*.svg`、`b-hairline-lines-*.svg`、`c-bracket-glyph-*.svg`、`d-count-19-*.svg`、`preview-*.{html,png}`、`round1-sheet.{html,png}` | 单字／发丝排线／括号字／「计数 19」四种取向 | 用户判 **B 否**（太暗、与背景没差别）、**D 否**（太数学化）；**A 与 C 保留**进下一轮 |
| 第二轮：字体与括号 | `round2-fonts.{html,png}`、`round2-brackets.{html,png}` | 8 个候选字体并排（含那条硬分野：**可自由使用（OFL）才转矢量，专有字体只能出位图**）；把 C 最糊的括号改成**自绘发丝线** | 字体定为 `Noto Sans SC`；括号那条并入 C 系继续演进 |
| 第三轮：字体定下后的形态 | `final-{A,C1,C2,C3}-{bg,fg,mono}.svg`、`round3-forms.{html,png}`、`glyph-*.json`（`outline.py` 抽出的字形轮廓） | 四个可落地形态（宣纸基线 A ＋ C 的三种收法） | 第四轮改做法：A/C 各留一个基线、另出五个新形态 |
| 第四轮：七形态并列 | `r4-{A,C,N2,N3,N4,N5}-{bg,fg,mono}.svg`（**`round4-forms.png` 留在原地**，它是用户选定 N1 时看的那张总览） | 七个形态 ＋ 32/16px 压力测试 | 用户选 **`N1`** ⇒ 其余六个被否 |

⚠ 这些**不再是活输入**：

- 已采纳的矢量仍在原处：`prototype/icons/svg/r4-N1-*.svg`（见 `../prototypes/q-icon-form.md`）。
- 生成器 `prototype/icons/build{,2,3}.mjs` 保留为「**当时的**生成器」（已加历史标注）；重跑它们会把被否的文件写回 `out/` —— 那只是重新生成，不代表它们复活。
