#!/usr/bin/env node
 * ⚠ 本脚本是**当时的生成器**（已被取代的轮次）：它写出的预览与矢量已移到 `items/app-icon/history/`。
 *   已采纳的那一份是 `r4-N1-*`（由 build4.mjs 生成），**留在原地**。重跑本脚本会把被否的文件写回 out/，那只是重新生成，不代表它们复活。
/**
 * 应用图标原型（第一轮）——构建器
 *
 * 为什么要有这个脚本：图标不是画一张 PNG 就完事，它必须在 **三种遮罩 × 多种尺寸** 下都成立，
 * 而且要能和「静默终端」的令牌逐项对上（颜色全部取自 docs/design/visual-tokens.md，不新造值）。
 * 所以这里把「方向」写成 SVG 源（前景层/背景层/单色层），再用无头 Chromium 出预览图：
 * 人看图，机看 SVG——以后要转 Android 的 vector drawable 也是从这些 SVG 出发。
 *
 * 画布约定（Android adaptive icon）：108×108 视图，**安全区＝中心直径 66**；
 * 前景层的一切都必须落在安全区内（外面会被各厂商遮罩吃掉），背景层满幅。
 *
 * 用法：node prototype/icons/build.mjs        （只写 SVG + HTML）
 *       然后 build.mjs --render               （再调 Chromium 出 PNG，需要 CHROME_BIN）
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const SVG_DIR = path.join(DIR, 'svg');
const OUT_DIR = path.join(DIR, 'out');

// ---- 令牌（全部逐字取自 docs/design/visual-tokens.md，不得自造） -------------
const T = {
  bg: '#0e1315',
  surface: '#141b1e',
  text: '#dde5e4',
  textDim: '#98a8a6',
  textFaint: '#788a88',
  line: '#233034',
  lineStrong: '#35494d',
  accent: '#4fb3a5',
  accentStrong: '#62c6b7',
  accentText: '#7fd4c6',
  fontSans: "'Microsoft YaHei UI','Microsoft YaHei',system-ui,sans-serif",
  fontMono: "'Consolas','SFMono-Regular',ui-monospace,monospace",
  radius: 4, // 画面里的圆角用 4dp/px，与令牌一致
};

const bgLayer = (fill = T.bg) => `<rect x="0" y="0" width="108" height="108" fill="${fill}"/>`;

const txt = (s, { size, x = 54, y = 54, fill = T.text, font = T.fontSans, weight = 500, ls = 0 }) =>
  `<text x="${x}" y="${y}" font-family="${font}" font-size="${size}" font-weight="${weight}" ` +
  `letter-spacing="${ls}" fill="${fill}" text-anchor="middle" dominant-baseline="central">${s}</text>`;

const bar = (x, y, w, h, fill, r = 0) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"/>`;

// ---- 四个方向 --------------------------------------------------------------
// 每个方向：fg（前景，落在安全区内）/ bg（背景，满幅）/ mono（单色层＝只用 alpha 的剪影）
const DIRECTIONS = [
  {
    id: 'a-single-glyph',
    name: 'A · 单字「索」＋ accent 发丝下划线',
    idea: '最直白：一个字标读得出名字。下划线复用「组名左沿发丝线」的记号，只是转向 90°。',
    risk: '字形小尺寸下会糊；不同 ROM 的无衬线体不同，字形会有微差。',
    bg: bgLayer(),
    fg:
      txt('索', { size: 42, y: 52, fill: T.text, weight: 500 }) +
      bar(37, 76, 34, 2.5, T.accent),
    mono:
      txt('索', { size: 42, y: 52, fill: '#ffffff', weight: 500 }) +
      bar(37, 76, 34, 2.5, '#ffffff'),
  },
  {
    id: 'b-hairline-lines',
    name: 'B · 发丝诗行（无字）',
    idea: '不写名字，只用「诗行」这张图：四条发丝线，其中一条是 accent —— 像读到某一行。抽象、任何尺寸都成立。',
    risk: '不体现「索斐」二字；和别的阅读类应用图标可能撞脸。',
    bg: bgLayer(T.surface),
    fg:
      bar(32, 34, 44, 2, T.lineStrong) +
      bar(32, 45, 44, 2, T.lineStrong) +
      bar(26, 56, 56, 2.5, T.accent) +
      bar(32, 67, 44, 2, T.lineStrong),
    // 单色层：把「被读到的那一行」画成更粗的一条，其余等粗 —— 只用 alpha 表达层级
    mono:
      bar(32, 34, 44, 3, '#ffffff', 1) +
      bar(32, 45, 44, 3, '#ffffff', 1) +
      bar(26, 56, 56, 5, '#ffffff', 2) +
      bar(32, 67, 44, 3, '#ffffff', 1),
  },
  {
    id: 'c-bracket-glyph',
    name: 'C · 「[索]」括号记号',
    idea: '直接用这套视觉自己的记号（目录里计数写作 `[3] 首`），把它套在字上。识别度靠括号轮廓。',
    risk: '⚠️ 三个字符并排，横向就顶到 66 安全区上限 —— 48dp 下「索」会小到读不清（见预览里的 48px 一列）。',
    bg: bgLayer(),
    fg:
      txt('[', { size: 34, x: 37, fill: T.textFaint, weight: 400 }) +
      txt('索', { size: 32, y: 54, fill: T.text, weight: 500 }) +
      txt(']', { size: 34, x: 71, fill: T.textFaint, weight: 400 }),
    mono:
      txt('[', { size: 34, x: 37, fill: '#ffffff', weight: 400 }) +
      txt('索', { size: 32, y: 54, fill: '#ffffff', weight: 500 }) +
      txt(']', { size: 34, x: 71, fill: '#ffffff', weight: 400 }),
  },
  {
    id: 'd-count-19',
    name: 'D · 「[19]」计数记号',
    idea: '用这套视觉的计数记号，数字＝《古诗十九首》的 19。等宽数字（令牌里 mono 就是给 id/计数用的），细且不糊。',
    risk: '不会读到应用名；`19` 是我们自己的梗，别人未必懂（对个人诗集应用可能正好）。',
    bg: bgLayer(),
    fg:
      txt('[', { size: 40, x: 30, fill: T.textFaint }) +
      txt('19', { size: 40, fill: T.textDim, font: T.fontMono, weight: 500 }) +
      txt(']', { size: 40, x: 78, fill: T.textFaint }),
    mono:
      txt('[', { size: 40, x: 30, fill: '#ffffff' }) +
      txt('19', { size: 40, fill: '#ffffff', font: T.fontMono, weight: 500 }) +
      txt(']', { size: 40, x: 78, fill: '#ffffff' }),
  },
];

const svgWrap = (inner, extra = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108" width="512" height="512">${extra}${inner}</svg>`;

// ---- 写 SVG 源 --------------------------------------------------------------
fs.mkdirSync(SVG_DIR, { recursive: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

for (const d of DIRECTIONS) {
  fs.writeFileSync(path.join(SVG_DIR, `${d.id}-bg.svg`), svgWrap(d.bg));
  fs.writeFileSync(path.join(SVG_DIR, `${d.id}-fg.svg`), svgWrap(d.fg));
  fs.writeFileSync(path.join(SVG_DIR, `${d.id}-mono.svg`), svgWrap(d.mono));
}

// ---- 预览页 ----------------------------------------------------------------
const MASKS = [
  { id: 'circle', label: '圆形遮罩', css: 'border-radius:50%' },
  { id: 'squircle', label: '圆角方（squircle 近似）', css: 'border-radius:30%' },
  { id: 'roundrect', label: '圆角方（22%）', css: 'border-radius:22%' },
];

const iconBox = (d, size, mask, kind = 'normal') => {
  const inner =
    kind === 'mono'
      ? `<div class="layer" style="background:${T.surface}"></div><div class="layer">${svgWrap(d.mono)}</div>`
      : `<div class="layer">${svgWrap(d.bg)}</div><div class="layer">${svgWrap(d.fg)}</div>`;
  return `<div class="icon" style="${mask ? mask.css : ''};width:${size}px;height:${size}px">${inner}</div>`;
};

// SVG 里的宽高写死是 512，这里用 CSS 缩放即可
const sheet = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>
  :root{color-scheme:dark}
  body{margin:0;background:${T.bg};color:${T.text};font-family:${T.fontSans};padding:28px 32px}
  h1{font-size:20px;font-weight:500;letter-spacing:.14em;margin:0 0 4px}
  .sub{color:${T.textDim};font-size:12px;margin:0 0 22px}
  .sub code{font-family:${T.fontMono};color:${T.accentText}}
  table{border-collapse:separate;border-spacing:0 14px}
  td,th{padding:0 16px 0 0;vertical-align:middle}
  th{color:${T.textDim};font-size:11px;font-weight:400;letter-spacing:.1em;text-align:center;padding-bottom:6px}
  .rowname{width:280px}
  .rowname b{display:block;font-size:13.5px;font-weight:500;letter-spacing:.03em}
  .rowname span{display:block;color:${T.textDim};font-size:11px;line-height:1.55;margin-top:3px}
  .rowname i{display:block;color:${T.textFaint};font-size:11px;line-height:1.55;margin-top:3px;font-style:normal}
  .icon{position:relative;overflow:hidden;flex:none;box-shadow:0 0 0 1px ${T.line}}
  .icon .layer{position:absolute;inset:0}
  .icon svg{display:block;width:100%;height:100%}
  .cell{text-align:center}
  .gridwrap{display:flex;align-items:center}
</style></head><body>
  <h1>索斐 · 应用图标原型（第一轮）</h1>
  <p class="sub">颜色全部取自 <code>docs/design/visual-tokens.md</code>（未自造值）；画布 108×108，前景内容全部控制在<b>中心直径 66 的圆</b>内（比系统保证可见的内接 72 方更保守）；无阴影、无发光、无渐变。
  遮罩是<b>近似</b>（真实遮罩随厂商/系统版本不同）。最后两列是「小尺寸是否还认得出来」的压力测试。</p>
  <table>
    <tr><th class="rowname"></th><th>192px<br>圆形</th><th>192px<br>squircle</th><th>192px<br>圆角方 22%</th><th>48px<br>圆形</th><th>48px<br>squircle</th><th>96px<br>单色层<br>(Android 13 主题图标)</th></tr>
    ${DIRECTIONS.map((d) => `<tr>
      <td class="rowname"><b>${d.name}</b><span>${d.idea}</span><i>代价：${d.risk}</i></td>
      <td class="cell"><div class="gridwrap">${iconBox(d, 192, MASKS[0])}</div></td>
      <td class="cell"><div class="gridwrap">${iconBox(d, 192, MASKS[1])}</div></td>
      <td class="cell"><div class="gridwrap">${iconBox(d, 192, MASKS[2])}</div></td>
      <td class="cell"><div class="gridwrap">${iconBox(d, 48, MASKS[0])}</div></td>
      <td class="cell"><div class="gridwrap">${iconBox(d, 48, MASKS[1])}</div></td>
      <td class="cell"><div class="gridwrap">${iconBox(d, 96, MASKS[0], 'mono')}</div></td>
    </tr>`).join('\n')}
  </table>
</body></html>`;
fs.writeFileSync(path.join(OUT_DIR, 'round1-sheet.html'), sheet);

// 每个方向再来一张 512px 的单独图（给实现方照做、也给人放大看）
for (const d of DIRECTIONS) {
  const one = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;background:${T.bg};display:flex;align-items:center;justify-content:center;height:640px;gap:34px}
    .icon{position:relative;overflow:hidden;width:512px;height:512px;border-radius:50%}
    .icon .layer{position:absolute;inset:0}.icon svg{display:block;width:100%;height:100%}
  </style></head><body>
  <div class="icon"><div class="layer">${svgWrap(d.bg)}</div><div class="layer">${svgWrap(d.fg)}</div></div>
  </body></html>`;
  fs.writeFileSync(path.join(OUT_DIR, `preview-${d.id}.html`), one);
}

console.log(`写出 ${DIRECTIONS.length} 个方向的 SVG（bg/fg/mono）→ ${path.relative(process.cwd(), SVG_DIR)}`);
console.log(`预览页 → ${path.relative(process.cwd(), path.join(OUT_DIR, 'round1-sheet.html'))}`);

// ---- 渲染（需要 CHROME_BIN） -------------------------------------------------
if (process.argv.includes('--render')) {
  const chrome = process.env.CHROME_BIN;
  if (!chrome) {
    console.error('需要 CHROME_BIN 指向 Chromium（本机在 %LOCALAPPDATA%\\Chromium\\Application\\chrome.exe）');
    process.exit(1);
  }
  const winPath = (p) => p.replace(/\//g, '\\');
  const shot = (html, png, w, h) =>
    execFileSync(chrome, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars',
      `--screenshot=${winPath(png)}`,
      `--window-size=${w},${h}`,
      '--virtual-time-budget=3000',
      'file:///' + winPath(html),
    ], { stdio: 'inherit' });

  shot(path.join(OUT_DIR, 'round1-sheet.html'), path.join(OUT_DIR, 'round1-sheet.png'), 1560, 1180);
  for (const d of DIRECTIONS) {
    shot(path.join(OUT_DIR, `preview-${d.id}.html`), path.join(OUT_DIR, `preview-${d.id}.png`), 640, 640);
  }
  console.log('已渲染 PNG → prototype/icons/out/');
}
