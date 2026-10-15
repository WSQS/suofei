#!/usr/bin/env node
 * ⚠ 本脚本是**当时的生成器**（已被取代的轮次）：它写出的预览与矢量已移到 `items/app-icon/history/`。
 *   已采纳的那一份是 `r4-N1-*`（由 build4.mjs 生成），**留在原地**。重跑本脚本会把被否的文件写回 out/，那只是重新生成，不代表它们复活。
/**
 * 应用图标原型 · 第三轮 —— 用户定了字体（Noto Sans SC）之后，把候选形态做成**可落地的矢量**
 *
 * 这一轮做三件事：
 *   ① 把「索」从字体里**抽成矢量轮廓**（`outline.py` 已经先生成好 JSON），于是最终 SVG 里**没有 <text>**——
 *      这是硬要求：Android 上没有微软雅黑，字形必须自己带走。（脚本会**断言**产物里不含 <text>）
 *   ② 把四个候选形态（A / C1 / C2 / C3）做成完整的一套：`bg` / `fg` / `mono` 三层，
 *      并在 3 种遮罩 × 4 种尺寸下并排看（重点看 48px 那一列）。
 *   ③ 两条自检：**(a)** 「文字渲染 vs 矢量轮廓」并排（人眼确认抽轮廓没抽歪）；
 *      **(b)** 一张**启动器上下文**条（放在别人的图标旁边，看相对大小与观感）。
 *
 * 用法：node prototype/icons/build3.mjs [--render]
 *      渲染需要 CHROME_BIN 指向 Chromium。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const OUT_DIR = path.join(DIR, 'out');
const SVG_DIR = path.join(DIR, 'svg');
fs.mkdirSync(SVG_DIR, { recursive: true });

const T = {
  bg: '#0e1315',
  surface: '#141b1e',
  text: '#dde5e4',
  textDim: '#98a8a6',
  textFaint: '#788a88',
  accentLine: 'rgba(79,179,165,0.38)', // --accent-line
  accent: '#4fb3a5',
  line: '#233034',
  mono: "'Consolas','SFMono-Regular',ui-monospace,monospace",
  ui: "'Microsoft YaHei UI','Microsoft YaHei',system-ui,sans-serif",
  icon_font: 'Noto Sans SC', // 用户 2026-10-15 选定（OFL ⇒ 可转矢量）
};

const FONT_FILE = 'C:/Windows/Fonts/NotoSansSC-VF.ttf';
const loadGlyph = (f) => JSON.parse(fs.readFileSync(path.join(OUT_DIR, f), 'utf8'));

const glyphFor = {
  A: loadGlyph('glyph-42-54-52.json'),
  C1: loadGlyph('glyph-36-54-54.json'),
  C2: loadGlyph('glyph-36-54-54.json'),
  C3: loadGlyph('glyph-40-57-54.json'),
};

const svgOpen = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108" width="512" height="512">`;
const bgRect = (fill = T.bg) => `<rect width="108" height="108" fill="${fill}"/>`;
const bar = (x, y, w, h, fill) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
const pathEl = (g, fill) => `<path transform="${g.transform}" d="${g.path}" fill="${fill}"/>`;

// 自绘发丝方括号（第二轮定下来的做法：不借字体括号）
const hairlineBrackets = (color) => {
  const L = 30, R = 78, top = 27, bot = 81, tick = 11, w = 2.5;
  return (
    bar(L, top, w, bot - top, color) + bar(L, top, tick, w, color) + bar(L, bot - w, tick, w, color) +
    bar(R - w, top, w, bot - top, color) + bar(R - tick, top, tick, w, color) + bar(R - tick, bot - w, tick, w, color)
  );
};

const FORMS = [
  {
    id: 'A',
    name: 'A · 单字「索」＋ accent 发丝下划线',
    idea: '一个字读得出名字；下划线复用「组名左沿发丝线」那套记号（转向 90°）。',
    extra: () => bar(37, 76, 34, 2.5, T.accent),
  },
  {
    id: 'C1',
    name: 'C1 · 发丝方括号（括号色 text-faint）',
    idea: '把目录里 `[3] 首` 那套计数记号套在字上；括号**自绘成发丝线**，所以比字体括号细、小尺寸不糊。',
    extra: () => hairlineBrackets(T.textFaint),
  },
  {
    id: 'C2',
    name: 'C2 · 发丝方括号（括号色 accent-line）',
    idea: '同 C1，括号改用 `--accent-line`（弱化的青绿），让「索」更突出。',
    extra: () => hairlineBrackets(T.accentLine),
  },
  {
    id: 'C3',
    name: 'C3 · 左沿一条 accent 发丝竖线 ＋ 索',
    idea: '不用括号，改用「组名左沿竖线」那套记号；排版最干净。',
    extra: () => bar(30, 33, 2.5, 42, T.accentLine),
  },
];

const fgFor = (f, color) => pathEl(glyphFor[f.id], color) + f.extra().replaceAll(T.textFaint, color).replaceAll(T.accentLine, color).replaceAll(T.accent, color);

// ---- 交付物：真正的 SVG 源（bg / fg / mono，无 <text>） --------------------
let wrote = [];
for (const f of FORMS) {
  const bg = bgRect(f.id === 'A' ? T.bg : T.bg);
  const fg = fgFor(f, T.text);
  const fgMono = fgFor(f, '#ffffff');
  const monoBg = bgRect(T.bg);
  const files = {
    [`final-${f.id}-bg.svg`]: bg,
    [`final-${f.id}-fg.svg`]: fg,
    [`final-${f.id}-mono.svg`]: fgMono,
  };
  for (const [name, inner] of Object.entries(files)) {
    const svg = svgOpen + inner + '</svg>';
    if (/<text[\s>]/.test(svg)) throw new Error(`产物里出现了 <text>：${name} —— 图标不得依赖运行时字体`);
    fs.writeFileSync(path.join(SVG_DIR, name), svg);
    wrote.push(name);
  }
}
// 交付物自检：确认磁盘上的 SVG 都不含 <text>
for (const name of wrote) {
  const s = fs.readFileSync(path.join(SVG_DIR, name), 'utf8');
  if (/<text[\s>]/.test(s)) throw new Error(`${name} 含 <text>`);
}

const icon = (bgInner, fgInner, size, radius = '50%', mono = false) => `
  <div class="icon" style="width:${size}px;height:${size}px;border-radius:${radius}">
    <div class="layer">${mono ? '' : svgOpen + bgInner + '</svg>'}</div>
    <div class="layer">${svgOpen}${mono ? bgRect(T.surface) : ''}${fgInner}</svg></div>
  </div>`;

const CSS = `
  body{margin:0;background:${T.bg};color:${T.text};font-family:${T.ui};padding:26px 30px}
  h1{font-size:19px;font-weight:500;letter-spacing:.14em;margin:0 0 4px}
  h2{font-size:14px;font-weight:500;letter-spacing:.1em;margin:30px 0 10px;color:${T.text}}
  .sub{color:${T.textDim};font-size:12px;line-height:1.7;margin:0 0 18px}
  code{font-family:${T.mono};color:#7fd4c6}
  table{border-collapse:separate;border-spacing:0 12px}
  td,th{vertical-align:middle;padding-right:16px;text-align:left}
  th{color:${T.textDim};font-size:10.5px;font-weight:400;letter-spacing:.08em;text-align:center;padding-bottom:4px}
  .meta{width:360px}.meta b{display:block;font-size:13.5px;font-weight:500}
  .meta span{display:block;font-size:11px;line-height:1.6;color:${T.textDim};margin-top:3px}
  .icon{position:relative;overflow:hidden;flex:none;box-shadow:0 0 0 1px ${T.line}}
  .icon .layer{position:absolute;inset:0}.icon svg{display:block;width:100%;height:100%}
  .cell{text-align:center}
  .phone{margin-top:6px;background:#0a0e10;border:1px solid ${T.line};border-radius:10px;padding:18px 22px;display:inline-block}
  .row{display:flex;align-items:flex-end;gap:26px}
  .app{text-align:center;width:76px}
  .app .lbl{font-size:10.5px;color:${T.textDim};margin-top:7px;white-space:nowrap}
  .other{width:56px;height:56px;border-radius:50%;background:#232a2d;display:flex;align-items:center;justify-content:center;color:#4a5459;font-size:9px}
  .chk{font-family:${T.mono};font-size:10.5px;color:${T.textFaint};text-align:left;white-space:pre;line-height:1.55}
`;

const sheet = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>${CSS}</style></head><body>
  <h1>索斐 · 图标第三轮：字体已定 <code>${T.icon_font}</code>（OFL，可转矢量）—— 请挑形态</h1>
  <p class="sub">形态四个：<b>A / C1 / C2 / C3</b>（B 与 D 已按你的意见淘汰）。字形**已从字体抽成矢量轮廓**，所以这套 SVG 里<b>没有 <code>&lt;text&gt;</code> 元素</b>——脚本对每一个产物都做了断言，抽歪或漏掉会直接报错。<br>
  每行给四种尺寸 × 三种遮罩，<b>重点看 48px 那一列</b>（启动器/通知栏里实际就这么大）。<b>一处要你自己权衡的取舍</b>：C 系要给括号让位，所以字比 A 小约 14%（面积上小约四分之一）——<b>A 的字最清楚、C 的识别靠轮廓</b>。最后一列是 <b>mono 单色层</b>（Android 13+ 主题图标按系统取色重绘，只能用 alpha 表达层级）。</p>
  <table>
    <tr><th class="meta"></th><th>192px 圆形</th><th>192px squircle</th><th>192px 圆角方</th><th>96px</th><th>48px 圆形</th><th>48px squircle</th><th>48px 圆角方</th><th>192px 单色层</th></tr>
    ${FORMS.map((f) => `<tr>
      <td class="meta"><b>${f.name}</b><span>${f.idea}</span></td>
      <td class="cell">${icon(bgRect(), fgFor(f, T.text), 192)}</td>
      <td class="cell">${icon(bgRect(), fgFor(f, T.text), 192, '30%')}</td>
      <td class="cell">${icon(bgRect(), fgFor(f, T.text), 192, '22%')}</td>
      <td class="cell">${icon(bgRect(), fgFor(f, T.text), 96)}</td>
      <td class="cell">${icon(bgRect(), fgFor(f, T.text), 48)}</td>
      <td class="cell">${icon(bgRect(), fgFor(f, T.text), 48, '30%')}</td>
      <td class="cell">${icon(bgRect(), fgFor(f, T.text), 48, '22%')}</td>
      <td class="cell">${icon(bgRect(), fgFor(f, '#ffffff'), 192, '50%', true)}</td>
    </tr>`).join('')}
  </table>

  <h2>自检：文字渲染 vs 矢量轮廓（人眼确认没抽歪）</h2>
  <p class="sub">左＝<code>&lt;text&gt;</code> 用 <code>${T.icon_font}</code> 现排；中＝我们从字体里抽出的 <code>&lt;path&gt;</code>（真正交付的形状）；右＝两者叠加（差异会显示成「重影」）。三者应当严丝合缝。</p>
  <div class="row">
    <div class="cell">
      ${icon(bgRect(), `<text x="54" y="52" font-family="'${T.icon_font}'" font-size="42" font-weight="500" fill="${T.text}" text-anchor="middle" dominant-baseline="central">索</text>`, 192)}
      <div class="lbl" style="font-size:11px;color:${T.textDim};margin-top:6px">文字渲染</div>
    </div>
    <div class="cell">
      ${icon(bgRect(), pathEl(glyphFor.A, T.text), 192)}
      <div class="lbl" style="font-size:11px;color:${T.textDim};margin-top:6px">矢量轮廓（交付）</div>
    </div>
    <div class="cell">
      ${icon(bgRect(), `<g opacity="0.55"><text x="54" y="52" font-family="'${T.icon_font}'" font-size="42" font-weight="500" fill="${T.accentText || '#7fd4c6'}" text-anchor="middle" dominant-baseline="central">索</text></g><g opacity="0.55">${pathEl(glyphFor.A, T.text)}</g>`, 192)}
      <div class="lbl" style="font-size:11px;color:${T.textDim};margin-top:6px">叠加（看重影）</div>
    </div>
  </div>

  <h2>启动器上下文（放在别人的图标旁边，看相对大小）</h2>
  <p class="sub">灰色圆是<b>假想邻居</b>（占位，不是任何真实应用的图标）。这样能看出「索斐」在桌面上和别的图标相比是偏大、偏小还是合适。</p>
  <div class="phone"><div class="row">
    <div class="app"><div class="other">其他</div><div class="lbl">其他应用</div></div>
    <div class="app"><div class="other">其他</div><div class="lbl">其他应用</div></div>
    ${FORMS.map((f) => `<div class="app">${icon(bgRect(), fgFor(f, T.text), 56)}<div class="lbl">索斐（${f.id}）</div></div>`).join('')}
    <div class="app"><div class="other">其他</div><div class="lbl">其他应用</div></div>
  </div></div>
</body></html>`;
fs.writeFileSync(path.join(OUT_DIR, 'round3-forms.html'), sheet);

console.log(`第三轮：写出 ${wrote.length} 个可交付 SVG（均断言无 <text>）→ prototype/icons/svg/final-*.svg`);
console.log('预览页 → prototype/icons/out/round3-forms.html');

if (process.argv.includes('--render')) {
  const chrome = process.env.CHROME_BIN;
  if (!chrome) { console.error('需要 CHROME_BIN'); process.exit(1); }
  const wp = (p) => p.replace(/\//g, '\\');
  execFileSync(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars',
    `--screenshot=${wp(path.join(OUT_DIR, 'round3-forms.png'))}`,
    '--window-size=1360,1820', '--virtual-time-budget=4000',
    'file:///' + wp(path.join(OUT_DIR, 'round3-forms.html'))], { stdio: 'inherit' });
  console.log('已渲染 → prototype/icons/out/round3-forms.png');
}
