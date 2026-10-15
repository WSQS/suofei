#!/usr/bin/env node
/**
 * 应用图标原型 · 第四轮 —— 用户 2026-10-15 的原话：
 *   「A 和 C 就足够了 还有他的字体 第二轮先不管了 我们再设计一个新形态」
 *   「还是两个先都做出来 我们对比一下」
 *
 * 所以这一轮：
 *   - A 与 C 各留**一个代表**作基线（A = 字＋下划线；C1 = 字＋发丝方括号），不再铺开第二轮的变体；
 *   - 另外**新设计五个形态**，都落在「A/C 这一族」里（字＋一处结构记号），但记号的**位置与形态是新的**；
 *   - 每个形态都在 **192 / 96 / 48 / 32 / 16** 下看（32 与 16 是 **Web favicon 的真实尺寸**，
 *     图标要两端用：Android 启动图标要 48+，favicon 会小到 16）；
 *   - 附 mono 单色层（Android 13+ 主题图标）。
 *
 * 字形仍然是用 `outline.py` 从 Noto Sans SC（OFL）抽出的**矢量轮廓**，本文件产物一律不含 <text>。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const OUT_DIR = path.join(DIR, 'out');
const SVG_DIR = path.join(DIR, 'svg');

const T = {
  bg: '#0e1315',
  surface: '#141b1e',
  text: '#dde5e4',
  textFaint: '#788a88',
  lineStrong: '#35494d',
  accent: '#4fb3a5',
  accentLine: 'rgba(79,179,165,0.38)', // --accent-line
  line: '#233034',
  mono: "'Consolas','SFMono-Regular',ui-monospace,monospace",
  ui: "'Microsoft YaHei UI','Microsoft YaHei',system-ui,sans-serif",
  grid: 'rgba(255,255,255,0.028)', // --bg-pattern：原型里那层极淡网格
};

const g = (f) => JSON.parse(fs.readFileSync(path.join(OUT_DIR, f), 'utf8'));
const GLYPH = {
  g36: g('glyph-36-54-54.json'),
  g40: g('glyph-40-57-54.json'),
  g40c: g('glyph-40-54-54.json'),
  g42: g('glyph-42-54-52.json'),
  g42c: g('glyph-42-54-54.json'),
};

const svgOpen = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108" width="512" height="512">`;
const bar = (x, y, w, h, fill) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
const pathEl = (glyph, fill) => `<path transform="${glyph.transform}" d="${glyph.path}" fill="${fill}"/>`;
const bgPlain = () => `<rect width="108" height="108" fill="${T.bg}"/>`;
const bgGrid = () => bgPlain() +
  `<rect width="108" height="108" fill="url(#grid)"/>` +
  `<defs><pattern id="grid" width="6" height="6" patternUnits="userSpaceOnUse">` +
  `<rect width="6" height="6" fill="none"/>` +
  `<rect x="0" y="0" width="1" height="6" fill="${T.grid}"/>` +
  `<rect x="0" y="0" width="6" height="1" fill="${T.grid}"/></pattern></defs>`;

const brackets = (col, { L, R, top, bot, tick, w = 2.5 } = { L: 30, R: 78, top: 27, bot: 81, tick: 11, w: 2.5 }) =>
  bar(L, top, w, bot - top, col) + bar(L, top, tick, w, col) + bar(L, bot - w, tick, w, col) +
  bar(R - w, top, w, bot - top, col) + bar(R - tick, top, tick, w, col) + bar(R - tick, bot - w, tick, w, col);

/** 每个形态：title / idea / cost / lines（可多块）/ bg / fg(color) 生成器 */
const FORMS = [
  {
    id: 'A', tag: '基线',
    title: 'A · 单字「索」＋ accent 下划线',
    idea: '第一轮保留项。一个字读得出名字；下划线复用「组名左沿发丝线」的记号（转向 90°）。',
    cost: '字最大最清楚；记号只有一条线，「容器/记号」感最弱。',
    bg: bgPlain,
    fg: (c) => pathEl(GLYPH.g42, c) + bar(37, 76, 34, 2.5, T.accent),
  },
  {
    id: 'C', tag: '基线',
    title: 'C · 字 ＋ 发丝方括号',
    idea: '第一轮保留项（括号已按第二轮改成自绘发丝线）。把目录里「[3] 首」那套计数记号套在字上。',
    cost: '记号感最强；但括号占横向空间 ⇒ **字要缩小约 14%**（这就是下面 N3 要修的那点）。',
    bg: bgPlain,
    fg: (c) => brackets(T.textFaint) + pathEl(GLYPH.g36, c),
  },
  {
    id: 'N1', tag: '新',
    title: 'N1 · 字 ＋ 右下角一条 accent 角标',
    idea: '记号缩到最小（一条 18px 的短发丝），把省下的空间全给字：**字与 A 一样大（42）**，而右下那个「角标」给出方向感与未完成感。',
    cost: '角标很小 ⇒ 远看基本等于「只有字」；识别全靠字形本身。',
    bg: bgPlain,
    fg: (c) => pathEl(GLYPH.g42c, c) + bar(58, 78, 17, 2.5, T.accent),
  },
  {
    id: 'N2', tag: '新',
    title: 'N2 · 字 ＋ L 形半框（左沿＋底沿）',
    idea: '只用两条发丝线构成一个「L」：左边一条竖线（＝组名左沿那套记号）＋ 底边一条横线。像一个引文块的起手，**不对称**，不像 C 那样把字关进箱子。',
    cost: '不对称 ⇒ 在圆形遮罩里重心偏左下，需要对位；小尺寸下 L 的两条线可能只剩一条。',
    bg: bgPlain,
    fg: (c) => bar(29, 34, 2.5, 41, c === '#ffffff' ? c : T.textFaint) + bar(29, 75, 46, 2.5, c === '#ffffff' ? c : T.textFaint) + pathEl(GLYPH.g40, c),
  },
  {
    id: 'N3', tag: '新',
    title: 'N3 · 收紧的发丝方括号（正面修 C 的缺点）',
    idea: '同一个「括号」念头，但把括号**贴着字**收窄：于是字能放大到 **42（＝A 的大小）**，括号只比字高一点点。既保住记号，又不牺牲清晰度。',
    cost: '括号与字之间只有约 3px 缝 ⇒ 小尺寸下可能和笔画粘在一起（这正是它要冒的险，看 32/16 两列）。',
    bg: bgPlain,
    fg: (c) => brackets(c === '#ffffff' ? c : T.textFaint, { L: 32, R: 76, top: 31, bot: 77, tick: 8 }) + pathEl(GLYPH.g42c, c),
  },
  {
    id: 'N4', tag: '新（诚实实验）',
    title: 'N4 · A ＋ 极淡网格底（令牌里的 `bg-pattern`）',
    idea: '把原型里那层「1px 极淡网格」放进图标（`rgba(255,255,255,0.028)`，与令牌逐字一致），看它能不能替我们表达「终端感」。',
    cost: '⚠️ **实测结论：几乎看不见** —— 该值本就是为了「极淡」，在图标尺寸下它既加不了结构感、又增加了杂点。⇒ 想用它只能**偏离令牌调浓**，那是另一件事（要你另外拍板）。',
    bg: bgGrid,
    fg: (c) => pathEl(GLYPH.g42, c) + bar(37, 76, 34, 2.5, T.accent),
  },
  {
    id: 'N5', tag: '新',
    title: 'N5 · 字 ＋ 上下两条发丝（引文块）',
    idea: '打开 C 的左右两边，只留下**上下两条**（与字同宽的细线），像引文的起止线／书页的天头地脚。结构感来自「夹住」，而不来自「关住」。',
    cost: '上下线在小尺寸会先糊成两条灰边；且与 A 一样不提供横向边界。',
    bg: bgPlain,
    fg: (c) => bar(36, 31, 36, 2, c === '#ffffff' ? c : T.lineStrong) + bar(36, 76, 36, 2, c === '#ffffff' ? c : T.lineStrong) + pathEl(GLYPH.g40c, c),
  },
];

// ---- 交付：这一轮也顺手写出 SVG 源（bg/fg/mono），全部断言无 <text> --------
let wrote = [];
for (const f of FORMS) {
  for (const [suffix, fgColor] of [['fg', T.text], ['mono', '#ffffff']]) {
    const bgInner = suffix === 'mono' ? bgPlain() : f.bg();
    const svgBg = svgOpen + bgInner + '</svg>';
    const svgFg = svgOpen + f.fg(fgColor) + '</svg>';
    for (const [name, s] of [[`r4-${f.id}-bg.svg`, svgBg], [`r4-${f.id}-${suffix}.svg`, svgFg]]) {
      if (/<text[\s>]/.test(s)) throw new Error(`产物含 <text>：${name}`);
      fs.writeFileSync(path.join(SVG_DIR, name), s);
      wrote.push(name);
    }
  }
}

const icon = (f, size, radius = '50%', mono = false) => `
  <div class="icon" style="width:${size}px;height:${size}px;border-radius:${radius}">
    <div class="layer">${mono ? '' : svgOpen + f.bg() + '</svg>'}</div>
    <div class="layer">${svgOpen}${mono ? bgPlain() : ''}${f.fg(mono ? '#ffffff' : T.text)}</svg></div>
  </div>`;

const CSS = `
  body{margin:0;background:${T.bg};color:${T.text};font-family:${T.ui};padding:26px 30px}
  h1{font-size:19px;font-weight:500;letter-spacing:.14em;margin:0 0 4px}
  .sub{color:#98a8a6;font-size:12px;line-height:1.7;margin:0 0 18px}
  code{font-family:${T.mono};color:#7fd4c6}
  table{border-collapse:separate;border-spacing:0 14px}
  td,th{vertical-align:middle;padding-right:16px;text-align:left}
  th{color:#98a8a6;font-size:10.5px;font-weight:400;letter-spacing:.08em;text-align:center;padding-bottom:4px}
  .meta{width:400px}.meta b{display:block;font-size:13.5px;font-weight:500}
  .meta b em{font-style:normal;color:#7fd4c6;font-size:11px;letter-spacing:.08em;margin-left:6px}
  .meta span{display:block;font-size:11px;line-height:1.6;color:#98a8a6;margin-top:3px}
  .meta i{display:block;font-size:11px;line-height:1.6;color:${T.textFaint};font-style:normal;margin-top:3px}
  .icon{position:relative;overflow:hidden;flex:none;box-shadow:0 0 0 1px ${T.line}}
  .icon .layer{position:absolute;inset:0}.icon svg{display:block;width:100%;height:100%}
  .cell{text-align:center}
  .small{background:${T.surface};padding:6px;border-radius:6px}
`;

const sheet = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>${CSS}</style></head><body>
  <h1>索斐 · 图标第四轮：A / C 各留一个基线，另出五个新形态</h1>
  <p class="sub">按你的话：第二轮那些变体不铺开了（A 与 C 各留**一个代表**作基线），另设计**五个新形态** —— 都还在「字＋一处结构记号」这一族里，但记号的位置与形态是新的。<br>
  <b>尺寸这一列要看全</b>：图标是**两端都用**的——Android 启动图标至少 48px，而 <b>Web favicon 会小到 32 与 16</b>。32/16 两列就是「这个形态在 favicon 上还成不成立」的答案。<br>
  字形是从 <code>Noto Sans SC</code>（OFL）抽出的**矢量轮廓**，本页所有图标产物都不含 <code>&lt;text&gt;</code>（脚本里是硬断言）。</p>
  <table>
    <tr><th class="meta"></th><th>192px 圆形</th><th>96px</th><th>48px</th><th>48px squircle</th><th>32px<br>favicon</th><th>16px<br>favicon</th><th>192px 单色层</th></tr>
    ${FORMS.map((f) => `<tr>
      <td class="meta"><b>${f.title}<em>${f.tag}</em></b><span>${f.idea}</span><i>代价：${f.cost}</i></td>
      <td class="cell">${icon(f, 192)}</td>
      <td class="cell">${icon(f, 96)}</td>
      <td class="cell">${icon(f, 48)}</td>
      <td class="cell">${icon(f, 48, '30%')}</td>
      <td class="cell"><div class="small">${icon(f, 32)}</div></td>
      <td class="cell"><div class="small">${icon(f, 16)}</div></td>
      <td class="cell">${icon(f, 192, '50%', true)}</td>
    </tr>`).join('')}
  </table>
</body></html>`;
fs.writeFileSync(path.join(OUT_DIR, 'round4-forms.html'), sheet);
console.log(`第四轮：写出 ${wrote.length} 个 SVG（断言无 <text>）→ prototype/icons/svg/r4-*.svg`);
console.log('预览页 → prototype/icons/out/round4-forms.html');

if (process.argv.includes('--render')) {
  const chrome = process.env.CHROME_BIN;
  if (!chrome) { console.error('需要 CHROME_BIN'); process.exit(1); }
  const wp = (p) => p.replace(/\//g, '\\');
  execFileSync(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--screenshot=' + wp(path.join(OUT_DIR, 'round4-forms.png')),
    '--window-size=1400,1780', '--virtual-time-budget=4000',
    'file:///' + wp(path.join(OUT_DIR, 'round4-forms.html'))], { stdio: 'inherit' });
  console.log('已渲染 → prototype/icons/out/round4-forms.png');
}
