# 历史：被取代的视觉方向（A 宣纸 / B 清爽）

用户 2026-10-15 从三个方向里选定 **C 静默终端** ⇒ 这两个方向**被取代**。它们从 `prototype/` 搬到本目录（**保留、标注**，不删）。

| 文件 | 原来是什么 | 为什么没被选 |
|---|---|---|
| `theme-paper.css` | A「宣纸」：暖米底、宋体正文＋楷体诗题、细线、直角、几乎无阴影 | 观感偏「旧」；UI 文字（计数、标签、搜索结果）也跟着收敛 ⇒ 信息密度最低（当时负责人的倾向是它，**用户没选**） |
| `theme-clean.css` | B「清爽」：白底、系统无衬线、卡片与柔和阴影、蓝色强调、圆角 | 气质偏「应用」不偏「书」；正文与 UI 同族无衬线，长诗的呼吸感弱于 A；阴影与圆角用多了会抢注意力 |
| `mobile-hub-{paper,clean}.png`、`mobile-poem-{paper,clean}.png`、`full-poem-{paper,clean}.png`、`desktop-hub-{paper,clean}.png`、`desktop-poem-{paper,clean}.png`、`full-note-{collapsed,expanded}-paper.png`、`mobile-group-paper.png`、`mobile-search-paper.png`（共 14 张） | 两个方向在手机／桌面／整页／组内／搜索各形态的实拍 | 同上；**并且它们同样是在夹具数据＋拼音序上拍的**（见 `../prototypes/q-visual-direction.md` 的同一句诚实说明） |

⚠ 这些文件**不再是活输入**：

- `prototype/index.html` 现在只加载 `css/theme-tech.css`；`prototype/js/app.js` 的主题清单也只剩「静默终端」——否则切换芯片会切到一个**没有样式表**的方向（那是断链，不是历史）。
- `prototype/tools/shots.sh` **不再重生成**本目录里的图。
- `mobile-search-paper.png` 里的「跨组搜索」是**原型行为**；产品侧的搜索已按用户 2026-10-15 的决定**移除**（`docs/interface-decisions.md` IF-46）。
