#!/usr/bin/env node
/**
 * 应用图标原型 · 第二轮 —— 用户第一轮的反馈落地
 *
 * 用户第一轮反馈（2026-10-15，原话摘要）：
 *   B「发丝诗行」→ **太暗，和背景没有差别**（否）
 *   D「[19] 计数」→ **太数学化**（否）
 *   **A（单字「索」＋下划线）与 C（「[索]」括号）更合适**（保留，继续做）
 *   剩下要探索的是：**「索」用什么字体**
 *
 * 所以这一轮只做两件事：
 *   ① 字体对比：同一个「索」，一组候选字体，同一画布、同一尺寸，可并排看（并附**字体可用性自检**）
 *   ② 把 C 里最糊的那处修掉：**括号不再借用字体字形，改成自绘发丝线**（并给 4 种排布）
 *
 * 一条必须先说清的硬约束：图标不能依赖运行时字体（Android 上没有微软雅黑），
 * 所以字形要么**转成矢量轮廓**（那就得用可自由使用的字体＝OFL），要么**烘成位图**。
 * 本表每一行都标注了它属于哪一类 —— 这是选字体时真正的分野，不只是好看不好看。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const OUT_DIR = path.join(DIR, 'out');
fs.mkdirSync(OUT_DIR, { recursive: true });

const T = {
  bg: '#0e1315',
  surface: '#141b1e',
  text: '#dde5e4',
  textDim: '#98a8a6',
  textFaint: '#788a88',
  line: '#233034',
  lineStrong: '#35494d',
  accent: '#4fb3a5',
  accentSoftLine: 'rgba(79,179,165,0.38)', // = --accent-line
  fontMono: "'Consolas','SFMono-Regular',ui-monospace,monospace",
  fontUI: "'Microsoft YaHei UI','Microsoft YaHei',system-ui,sans-serif",
};

// ---- ① 候选字体 ------------------------------------------------------------
// vector 字段：能否安全地转成矢量轮廓放进公开产物
//   yes  = OFL / 可自由使用（轮廓可嵌入）
//   warn = 专有字体：转矢量轮廓风险高（近似复制字形软件），**建议改成位图 mipmap**
const FONTS = [
  { id: 'noto-sans-sc', fam: "'Noto Sans SC'", name: 'Noto Sans SC（思源黑体同源）', lic: 'SIL OFL 1.1', vector: 'yes', note: '无衬线，与令牌「全部无衬线」完全一致；本机已有（NotoSansSC-VF.ttf）' },
  { id: 'noto-serif-sc', fam: "'Noto Serif SC'", name: 'Noto Serif SC（思源宋体同源）', lic: 'SIL OFL 1.1', vector: 'yes', note: '宋体，书卷气；**与令牌「全无衬线」不一致**（图标算不算例外要你定）' },
  { id: 'msyh', fam: "'Microsoft YaHei'", name: '微软雅黑', lic: '专有（Microsoft）', vector: 'warn', note: '**第一轮 A/C 用的就是它**（只因为是本机默认无衬线）' },
  { id: 'dengxian', fam: "'DengXian'", name: '等线 DengXian', lic: '专有（Microsoft）', vector: 'warn', note: '细黑体，比雅黑更「轻」，笔画细 ⇒ 48px 下最吃紧' },
  { id: 'simhei', fam: "'SimHei'", name: '黑体 SimHei', lic: '专有（Microsoft）', vector: 'warn', note: '笔画最粗 ⇒ **小尺寸下最清楚**，但观感偏老、偏「办公文档」' },
  { id: 'kaiti', fam: "'KaiTi'", name: '楷体 KaiTi', lic: '专有（Microsoft）', vector: 'warn', note: '毛笔楷意，最「古诗」；笔画有粗细变化 ⇒ 小尺寸易糊' },
  { id: 'stkaiti', fam: "'STKaiti'", name: '华文楷体 STKaiti', lic: '专有（华文）', vector: 'warn', note: '比 KaiTi 更秀气，笔画更细' },
  { id: 'stsong', fam: "'STSong'", name: '华文宋体 STSong', lic: '专有（华文）', vector: 'warn', note: '印刷宋体；横细竖粗，**48px 下横画最容易整条消失**（可看最后一列）' },
];

// ---- ② C 的括号改造 --------------------------------------------------------
// 第一轮的 C 借用字体里的 `[` `]` 字形；三个字符并排就顶到安全区上限，48px 下糊。
// 这一轮把括号**自绘成发丝线**（这套视觉本来就是「发丝线＋结构感」），并试三种排布。
const BRACKETS = [
  { id: 'font-brackets', name: 'C0 · 字体括号（第一轮原样）', how: '借字体里的 `[` `]`', risk: '三个字符并排 ⇒ 顶到安全区、48px 糊（这是要修的那处）' },
  { id: 'hairline-h', name: 'C1 · 发丝方括号（横排）', how: '自绘：左右各一条 2.5px 竖线 + 上下各一条短横线，角部断开（方括号观感）', risk: '线更细 ⇒ 小尺寸不糊；但「不是字体里的括号」，形状由我们定' },
  { id: 'hairline-h-accent', name: 'C2 · 发丝方括号（括号用 accent-line）', how: '同 C1，括号色改为 `--accent-line`（弱化），让「索」更突出', risk: '同 C1；accent 在小面积上是青绿色块，需确认不是「发光感」' },
  { id: 'hairline-v-left', name: 'C3 · 左沿一条 accent 发丝竖线 ＋ 索', how: '换掉括号，改用「组名左沿竖线」那套记号（`--accent-line`，2px）', risk: '竖线不构成「容器」，更接近 A 的变体；但排版上更干净' },
];

const GLYPH = '索';

const svgOpen = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108" width="512" height="512">`;
const bg = (fill = T.bg) => `<rect width="108" height="108" fill="${fill}"/>`;
const txt = (s, { size, x = 54, y = 54, fill = T.text, font, weight = 500 }) =>
  `<text x="${x}" y="${y}" font-family="${font}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="middle" dominant-baseline="central">${s}</text>`;
const bar = (x, y, w, h, fill) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;

// 自绘发丝方括号：两条竖线 + 四段短横（上下各断口），总宽 66 以内
const hairlineBrackets = (color) => {
  const L = 30, R = 78, top = 27, bot = 81, tick = 11, w = 2.5;
  return (
    bar(L, top, w, bot - top, color) + bar(L, top, tick, w, color) + bar(L, bot - w, tick, w, color) +
    bar(R - w, top, w, bot - top, color) + bar(R - tick, top, tick, w, color) + bar(R - tick, bot - w, tick, w, color)
  );
};

const fgFor = (f) => `${txt(GLYPH, { size: 42, y: 52, font: f.fam })}${bar(37, 76, 34, 2.5, T.accent)}`; // A 的形态（选字体时用 A 的样子看）

const bracketFg = (b, fam) => {
  switch (b.id) {
    case 'font-brackets':
      return txt('[', { size: 34, x: 37, fill: T.textFaint }) + txt(GLYPH, { size: 32, font: fam }) + txt(']', { size: 34, x: 71, fill: T.textFaint });
    case 'hairline-h':
      return hairlineBrackets(T.textFaint) + txt(GLYPH, { size: 36, y: 54, font: fam });
    case 'hairline-h-accent':
      return hairlineBrackets(T.accentSoftLine) + txt(GLYPH, { size: 36, y: 54, font: fam });
    case 'hairline-v-left':
      return bar(26, 30, 2.5, 48, T.accentSoftLine) + txt(GLYPH, { size: 40, x: 58, y: 54, font: fam });
    default:
      return '';
  }
};

const icon = (bgSvg, fgSvg, size, radius = '50%', mono = false) => `
  <div class="icon" style="width:${size}px;height:${size}px;border-radius:${radius}">
    <div class="layer">${mono ? '' : svgOpen + bgSvg + '</svg>'}</div>
    <div class="layer">${svgOpen}${mono ? bg(T.surface) : ''}${fgSvg}</svg></div>
  </div>`;

// ---- 页面 1：字体对比 ------------------------------------------------------
const fontSheet = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>
  body{margin:0;background:${T.bg};color:${T.text};font-family:${T.fontUI};padding:26px 30px}
  h1{font-size:19px;font-weight:500;letter-spacing:.14em;margin:0 0 4px}
  .sub{color:${T.textDim};font-size:12px;line-height:1.7;margin:0 0 18px}
  code{font-family:${T.fontMono};color:#7fd4c6}
  table{border-collapse:separate;border-spacing:0 10px}
  td,th{vertical-align:middle;padding-right:18px;text-align:left}
  th{color:${T.textDim};font-size:11px;font-weight:400;letter-spacing:.1em;text-align:center;padding-bottom:4px}
  .meta{width:430px}.meta b{display:block;font-size:13.5px;font-weight:500}
  .meta span{display:block;font-size:11px;line-height:1.6;color:${T.textDim};margin-top:2px}
  .meta i{display:block;font-size:11px;line-height:1.6;color:${T.textFaint};font-style:normal;margin-top:2px}
  .lic{font-family:${T.fontMono};font-size:10.5px}
  .yes{color:#7fd4c6}.warn{color:#dcc078}
  .icon{position:relative;overflow:hidden;flex:none;box-shadow:0 0 0 1px ${T.line}}
  .icon .layer{position:absolute;inset:0}.icon svg{display:block;width:100%;height:100%}
  .cell{text-align:center}
  .chk{font-family:${T.fontMono};font-size:10.5px;color:${T.textFaint};text-align:left;white-space:pre;line-height:1.5}
</style></head><body>
  <h1>索斐 · 图标第二轮：①「索」用哪个字体</h1>
  <p class="sub">同一画布（108×108）、同一尺寸、同一位置，只有字体不同（字重统一 500）。右侧 <code>自检</code> 列是页面里实测的<b>字体可用性</b>(<code>document.fonts.check</code>) 与<b>字宽</b>(px)——<b>如果两行数值一样、图也长得一样，说明那个字体名没生效、退回了默认</b>，不要被看起来的结果骗到。<br>
  <b>真正的分野在 <code>矢量?</code> 一列</b>：图标不能依赖运行时字体（Android 上没有微软雅黑），所以字形要么转<b>矢量轮廓</b>（那就必须用可自由使用的字体＝OFL），要么<b>烘成位图</b>。专有字体不是不能用，而是「转矢量轮廓」风险高（近似复制字形软件），稳妥做法是出位图 mipmap。</p>
  <table>
    <tr><th class="meta"></th><th>192px 圆形</th><th>96px</th><th>48px</th><th>48px squircle</th><th class="chk">自检</th></tr>
    ${FONTS.map((f) => `<tr>
      <td class="meta"><b>${f.name}</b><span class="lic ${f.vector === 'yes' ? 'yes' : 'warn'}">授权：${f.lic} ｜ 可矢量：${f.vector === 'yes' ? '✅ 可以' : '⚠️ 不建议（请出位图）'}</span><i>${f.note}</i></td>
      <td class="cell">${icon(bg(), fgFor(f), 192)}</td>
      <td class="cell">${icon(bg(), fgFor(f), 96)}</td>
      <td class="cell">${icon(bg(), fgFor(f), 48)}</td>
      <td class="cell">${icon(bg(), fgFor(f), 48, '30%')}</td>
      <td class="chk" data-font="${f.fam.replace(/'/g, '')}"></td>
    </tr>`).join('')}
  </table>
  <script>
    // 页面内自检：可用性 + 字宽（写进页面，截图里能直接看到证据）
    for (const td of document.querySelectorAll('td.chk')) {
      const fam = td.dataset.font;
      const ok = document.fonts.check("500 40px '" + fam + "'");
      const s = document.createElement('span');
      s.style.cssText = "position:absolute;visibility:hidden;font:500 40px '" + fam + "'";
      s.textContent = '${GLYPH}';
      document.body.appendChild(s);
      const w = Math.round(s.getBoundingClientRect().width * 100) / 100;
      td.textContent = (ok ? 'check: ✓ 可用' : 'check: ✗ 未找到') + '\\n字宽: ' + w + 'px';
    }
  </script>
</body></html>`;
fs.writeFileSync(path.join(OUT_DIR, 'round2-fonts.html'), fontSheet);

// ---- 页面 2：C 的括号改造（用推荐字体 Noto Sans SC） -----------------------
const RECOMMEND = FONTS[0].fam;
const bracketSheet = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>
  body{margin:0;background:${T.bg};color:${T.text};font-family:${T.fontUI};padding:26px 30px}
  h1{font-size:19px;font-weight:500;letter-spacing:.14em;margin:0 0 4px}
  .sub{color:${T.textDim};font-size:12px;line-height:1.7;margin:0 0 18px}
  code{font-family:${T.fontMono};color:#7fd4c6}
  table{border-collapse:separate;border-spacing:0 12px}
  td,th{vertical-align:middle;padding-right:20px;text-align:left}
  th{color:${T.textDim};font-size:11px;font-weight:400;letter-spacing:.1em;text-align:center;padding-bottom:4px}
  .meta{width:430px}.meta b{display:block;font-size:13.5px;font-weight:500}
  .meta span{display:block;font-size:11px;line-height:1.6;color:${T.textDim};margin-top:2px}
  .meta i{display:block;font-size:11px;line-height:1.6;color:${T.textFaint};font-style:normal;margin-top:2px}
  .icon{position:relative;overflow:hidden;flex:none;box-shadow:0 0 0 1px ${T.line}}
  .icon .layer{position:absolute;inset:0}.icon svg{display:block;width:100%;height:100%}
  .cell{text-align:center}
</style></head><body>
  <h1>索斐 · 图标第二轮：② 把 C 最糊的那处修掉</h1>
  <p class="sub">第一轮的 C 借用了字体里的 <code>[</code> <code>]</code> 字形，三个字符并排就顶到安全区上限，48px 下糊成一团。这一轮把括号改成<b>自绘发丝线</b>（这套视觉本来就是「发丝线＋结构感」），并给三种排布。<b>字一律用 <code>Noto Sans SC</code></b>（OFL，可安全转矢量）。重点看 <b>48px</b> 那两列。</p>
  <table>
    <tr><th class="meta"></th><th>192px 圆形</th><th>48px</th><th>48px squircle</th><th>192px 单色层</th></tr>
    ${BRACKETS.map((b) => `<tr>
      <td class="meta"><b>${b.name}</b><span>做法：${b.how}</span><i>代价与风险：${b.risk}</i></td>
      <td class="cell">${icon(bg(), bracketFg(b, RECOMMEND), 192)}</td>
      <td class="cell">${icon(bg(), bracketFg(b, RECOMMEND), 48)}</td>
      <td class="cell">${icon(bg(), bracketFg(b, RECOMMEND), 48, '30%')}</td>
      <td class="cell">${icon(bg(), bracketFg(b, RECOMMEND).replace(new RegExp(T.textFaint, 'g'), '#ffffff').replace(new RegExp(T.accentSoftLine.replace(/[()]/g, '\\$&'), 'g'), '#ffffff').replace(new RegExp(T.text, 'g'), '#ffffff'), 192, '50%', true)}</td>
    </tr>`).join('')}
  </table>
</body></html>`;
fs.writeFileSync(path.join(OUT_DIR, 'round2-brackets.html'), bracketSheet);

console.log('第二轮预览页已写出 → prototype/icons/out/round2-{fonts,brackets}.html');

if (process.argv.includes('--render')) {
  const chrome = process.env.CHROME_BIN;
  if (!chrome) { console.error('需要 CHROME_BIN'); process.exit(1); }
  const wp = (p) => p.replace(/\//g, '\\');
  const shot = (html, png, w, h) =>
    execFileSync(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--screenshot=${wp(png)}`,
      `--window-size=${w},${h}`, '--virtual-time-budget=4000', 'file:///' + wp(html)], { stdio: 'inherit' });
  shot(path.join(OUT_DIR, 'round2-fonts.html'), path.join(OUT_DIR, 'round2-fonts.png'), 1240, 1080);
  shot(path.join(OUT_DIR, 'round2-brackets.html'), path.join(OUT_DIR, 'round2-brackets.png'), 1240, 700);
  console.log('已渲染 → prototype/icons/out/round2-*.png');
}
