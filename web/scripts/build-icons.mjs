#!/usr/bin/env node
// Web 端图标生成器 —— 从**原型里已评审过的矢量源**生成 web/icons/ 下的资源。
//
//   CHROME_BIN='C:/Users/wsqsy/AppData/Local/Chromium/Application/chrome.exe' \
//     node web/scripts/build-icons.mjs
//   node web/scripts/build-icons.mjs --check     # 只核对 svg 与已存在的 png，不写文件、不开浏览器
//
// ## 两套资产，各自的用途（这是用户 2026-10-15 的裁决，不是我的偏好）
//
//  1. **N1（单字「索」轮廓 ＋ 右下 accent 发丝角标）＝ 启动/安装图标**：
//     `icon.svg` + `icon-192.png` / `icon-512.png`（manifest，purpose=any）
//     + `icon-maskable-512.png`（purpose=maskable）+ `apple-touch-icon.png`（iOS 主屏）。
//  2. **极简记号 `favicon.svg` + `favicon-32.png` ＝ 浏览器标签页图标**：
//     用户答（`q-1c1e7876`）：favicon 另用一套「极简记号」——**自绘、无字**，可从 N1 的 accent 角标派生；
//     理由是 N1 在 16/32px 下糊成一团（证据：prototype/icons/out/round4-forms.png 最后两列）。
//     记号的定义与代价写在下面 MARK 的注释里，并在 web/README 单列（供复核）。
//
// ## 硬约束（两端共用同一条）
//
//  **必须用轮廓，不得依赖运行时字体**：字形来自只读交付源 `prototype/icons/svg/r4-N1-*.svg`
//  （那三份是 `prototype/icons/outline.py` 从 Noto Sans SC（OFL）抽出的 `<path>`，**断言不含 `<text>`**）。
//  本脚本只搬 path 数据，绝不往产物里写 `<text>`/`font-family` —— 否则「图标靠系统字体渲染」会
//  在 Android/其他机器上变成另一个字形（这正是原型 README 里那条「必须传下去的工程约束」）。
//
//  另：`icon.svg` 保留原型里的 `transform`（浏览器原生支持 SVG 变换，Web 端没有理由改写坐标）；
//  Android 侧是同一份轮廓**烘进坐标**的副本（`android/tools/make-launcher-icon.mjs`），
//  两端一致由 Kotlin 单测逐点断言（见 LauncherIconTest「两端同一份轮廓」）。
//
//  预览/观感图里出现的遮罩是**近似**（真实遮罩随厂商与系统版本不同）—— 那只是证据图，不是规范。

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));            // web/scripts
const REPO_ROOT = path.resolve(HERE, '..', '..');
const SRC_DIR = path.join(REPO_ROOT, 'prototype', 'icons', 'svg');    // 只读输入
const OUT_DIR = path.join(REPO_ROOT, 'web', 'icons');

// ── 颜色令牌（逐项取自 prototype/icons 的源 SVG，不自造值）──
const BG = '#0e1315';      // 视觉令牌 bg
const TEXT = '#dde5e4';    // 视觉令牌 text
const ACCENT = '#4fb3a5';  // 视觉令牌 accent

/** 极简 favicon 记号（自绘、无字；派生自 N1 的右下 accent 角标）。 */
const MARK = {
  id: 'M1',
  // 画布与 N1 同尺寸（108），这样两套资产可以放在同一张对照图里比。
  // 形状＝把 N1 那条**右下 accent 发丝**补成一个「角标」：右下一条横臂 + 右侧一条竖臂，
  // 二者在右下角相接成一个方角（L）。为什么加粗：N1 的发丝只有 2.5 单位厚
  // （16px 下 ≈0.37px，必然消失），而 16px 下能看见的最小笔画约 1.5~2px ⇒ 这里取 12 单位厚
  // （16px 下 ≈1.78px）、每臂 36 单位长（16px 下 ≈5.3px）。
  // 代价（如实写）：① 与启动图标**不同形**（用户已知情并接受）；② 它不带字，读不出应用名。
  thickness: 12,
  arm: 36,
  // 右下角的外角位置（与 N1 角标一样落在右下象限，不是画布正中）
  corner: { x: 80, y: 80 },
  bg: BG,
  accent: ACCENT,
};

/** 记号的多边形（角标形状；顺时针一圈）。 */
function markPath(m) {
  const { x: cx, y: cy } = m.corner;
  const t = m.thickness;
  const a = m.arm;
  const x0 = cx - a;      // 横臂左端
  const y0 = cy - a;      // 竖臂上端
  const xi = cx - t;      // 内角
  const yi = cy - t;
  return `M ${x0} ${yi} H ${xi} V ${y0} H ${cx} V ${cy} H ${x0} Z`;
}

const readSrc = (name) => fs.readFileSync(path.join(SRC_DIR, name), 'utf8');
const attr = (src, name) => {
  const m = new RegExp(`${name}="([^"]*)"`).exec(src);
  if (!m) throw new Error(`源 SVG 里找不到属性 ${name}`);
  return m[1];
};

function assertNoFont(src, what) {
  // 注释里出现「<text」这类字样不算依赖（本文件自己的说明就写到它），所以先把注释剥掉再判。
  const markup = src.replace(/<!--[\s\S]*?-->/g, '');
  if (/<text|<tspan|font-family|font-size=|font=/.test(markup)) {
    throw new Error(`${what} 的标记里出现了文字/字体元素 —— 图标不得依赖运行时字体`);
  }
}

// ── N1：把原型的两层（bg + fg）合成为一张独立 SVG（保留原型的 path 与 transform，不改坐标）──
function buildIconSvg() {
  const bgSrc = readSrc('r4-N1-bg.svg');
  const fgSrc = readSrc('r4-N1-fg.svg');
  assertNoFont(bgSrc, 'r4-N1-bg.svg');
  assertNoFont(fgSrc, 'r4-N1-fg.svg');

  const bgFill = attr(bgSrc, 'fill');
  const rect = /<rect[^>]*width="108"[^>]*height="108"[^>]*\/>/.exec(bgSrc);
  if (!rect) throw new Error('源 bg 不是满幅 108×108 的矩形');
  const transform = attr(fgSrc, 'transform');
  const d = attr(fgSrc, 'd');
  const glyphFill = attr(fgSrc, 'fill');
  const accent = /<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" fill="(#[0-9a-fA-F]+)"\s*\/>/.exec(fgSrc);
  if (!accent) throw new Error('源 fg 里找不到 accent 角标矩形');
  const [, ax, ay, aw, ah, accentFill] = accent;

  return `<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108" width="512" height="512" role="img" aria-label="索斐">
<!--
  索斐 · 启动图标（形态 N1：单字「索」轮廓 ＋ 右下 accent 发丝角标）。
  ⚠️ 由 \`node web/scripts/build-icons.mjs\` 生成 —— 手工改会被覆盖；要改请改只读交付源
     prototype/icons/svg/r4-N1-{bg,fg}.svg（用户 2026-10-15 选定 N1）或改生成器。
  硬约束：字形是**矢量轮廓**（Noto Sans SC / OFL，取轮廓前实例化到 wght=500），
         本文件不含 <text>、不引用任何字体 —— 图标不得靠系统字体渲染。
         背景满幅；前景（字形＋角标）落在系统保证可见的中心 72 方内。
  这里保留原型 SVG 的 transform（浏览器原生支持变换）；Android 侧是同一份轮廓烘进坐标的副本。
  浏览器标签页的图标另有一套极简记号：favicon.svg（见 web/README「图标」一节）。
-->
  <rect width="108" height="108" fill="${bgFill}"/>
  <path transform="${transform}" d="${d}" fill="${glyphFill}"/>
  <rect x="${ax}" y="${ay}" width="${aw}" height="${ah}" fill="${accentFill}"/>
</svg>
`;
}

// ── 极简记号：favicon.svg ──
function buildFaviconSvg(m) {
  return `<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108" width="32" height="32" role="img" aria-label="索斐">
<!--
  索斐 · 浏览器标签页图标（极简记号 M1，用户 2026-10-15 裁决 \`q-1c1e7876\`：favicon 另用一套极简记号）。
  形状：把 N1 那条右下 accent 发丝补成一个「角标」—— 右下一条横臂 + 右侧一条竖臂（方角 L），
        厚 ${m.thickness}、每臂长 ${m.arm}（画布 108）。**无字**：这是一枚记号，不是缩小的启动图标。
  为什么：N1 在 16/32px 下糊成一团（prototype/icons/out/round4-forms.png 最后两列）；
        发丝本身只有 2.5 单位厚，16px 下必然消失，所以这里加粗到 16px 下约 1.8px。
  颜色只用现有令牌：bg=${m.bg}、accent=${m.accent}。没有引入新颜色。
  ⚠️ 与启动图标（N1）**不同形** —— 这是该裁决明写的代价。
  由 \`node web/scripts/build-icons.mjs\` 生成，手工改会被覆盖。
-->
  <rect width="108" height="108" fill="${m.bg}"/>
  <path d="${markPath(m)}" fill="${m.accent}"/>
</svg>
`;
}

// ── 尺寸表：谁、什么用途、多大 ──
const SIZES = [
  { file: 'icon-192.png', size: 192, from: 'icon.svg', what: 'manifest icons（purpose=any）' },
  { file: 'icon-512.png', size: 512, from: 'icon.svg', what: 'manifest icons（purpose=any）' },
  { file: 'icon-maskable-512.png', size: 512, from: 'icon.svg', what: 'manifest icons（purpose=maskable）' },
  { file: 'apple-touch-icon.png', size: 180, from: 'icon.svg', what: 'iOS 主屏（apple-touch-icon）' },
  { file: 'favicon-32.png', size: 32, from: 'favicon.svg', what: '标签页图标的 PNG 兜底（老浏览器不认 SVG favicon）' },
];

function pngSize(buf) {
  if (buf.length < 24 || buf.toString('latin1', 1, 4) !== 'PNG') throw new Error('不是 PNG');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function render(chromeBin, svgFile, outFile, size) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:transparent}
    svg{display:block;width:${size}px;height:${size}px}
  </style></head><body>${stripXmlHeader(fs.readFileSync(svgFile, 'utf8'))}</body></html>`;
  const tmp = path.join(OUT_DIR, `.render-${size}.html`);
  fs.writeFileSync(tmp, html, 'utf8');
  const win = (p) => p.replace(/\//g, '\\');
  try {
    execFileSync(chromeBin, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
      `--screenshot=${win(outFile)}`,
      `--window-size=${size},${size}`,
      '--virtual-time-budget=2000',
      `file:///${win(tmp)}`,
    ], { stdio: 'pipe' });
  } finally {
    fs.rmSync(tmp, { force: true });
  }
  const buf = fs.readFileSync(outFile);
  const { w, h } = pngSize(buf);
  if (w !== size || h !== size) throw new Error(`${path.basename(outFile)} 尺寸是 ${w}×${h}，期望 ${size}×${size}`);
  return buf;
}

const stripXmlHeader = (svg) => svg.replace(/^<\?xml[^>]*\?>\s*/, '');

/** 观感对照图：把真实资产按真实尺寸排出来（图里的「标签栏/遮罩」都是近似的示意，不是真机）。 */
async function renderSheet(chromeBin, outFile, iconSvgText, faviconSvgText) {
  const mark = stripXmlHeader(faviconSvgText);
  const n1 = stripXmlHeader(iconSvgText);
  const box = (w, h, html) => `<div class="box" style="width:${w}px;height:${h}px">${html}</div>`;
  const sized = (svg, px) => svg.replace(/width="\d+" height="\d+"/, `width="${px}" height="${px}"`);
  const strip = (pxs, light) => `<div class="strip ${light ? 'light' : 'dark'}">`
    + pxs.map((p) => `<div class="cell"><div style="width:${p}px;height:${p}px">${sized(n1, p)}</div>`
      + `<span>${p}px</span></div>`).join('') + '</div>';
  const round = (px, radius) => `<div class="mask" style="width:${px}px;height:${px}px;border-radius:${radius}">${sized(n1, px)}</div>`;
  const markCell = (px, light) => `<div class="cell"><div class="strip ${light ? 'light' : 'dark'}" style="width:${px + 24}px;height:${px + 24}px"><div style="width:${px}px;height:${px}px">${sized(mark, px)}</div></div><span>${px}px</span></div>`;
  const monoOnly = fs.existsSync(path.join(REPO_ROOT, 'android', 'app', 'src', 'main', 'res', 'drawable', 'ic_launcher_monochrome.xml'))
    ? '<span class="ok">已生成（android/.../drawable/ic_launcher_monochrome.xml）</span>'
    : '<span class="bad">缺 mono 资源</span>';
  const tab = (light) => `<div class="tabbar ${light ? 'light' : 'dark'}"><div class="tab active">`
    + `<span class="fav">${sized(mark, 16)}</span><span>索斐</span></div>`
    + `<div class="tab"><span class="fav">${sized(mark, 16)}</span><span>另一个标签页（示意）</span></div></div>`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;padding:26px 30px;background:#0e1315;color:#dde5e4;font:13px/1.7 'Microsoft YaHei UI',system-ui,sans-serif}
  h1{font-size:16px;font-weight:500;letter-spacing:.06em;margin:0 0 4px}
  p.sub{color:#98a8a6;font-size:12px;margin:0 0 20px}
  h2{font-size:12.5px;font-weight:500;color:#4fb3a5;letter-spacing:.1em;margin:22px 0 8px}
  .box,.mask{display:inline-block;vertical-align:top}
  .strip{display:flex;align-items:flex-end;gap:18px;padding:14px 16px;border-radius:4px}
  .strip.dark{background:#0e1315;box-shadow:0 0 0 1px #233034}
  .strip.light{background:#f4f4f5;box-shadow:0 0 0 1px #d0d0d0}
  .cell{display:flex;flex-direction:column;align-items:center;gap:6px}
  .cell span{font-size:10px;color:#788a88}
  .mask{overflow:hidden}
  .tabbar{display:inline-flex;gap:2px;padding:6px 8px 0;border-radius:8px 8px 0 0}
  .tabbar.light{background:#dee1e6}
  .tabbar.dark{background:#202124}
  .tab{display:flex;align-items:center;gap:7px;padding:6px 12px;border-radius:6px 6px 0 0;font-size:12px;color:#3c4043}
  .tabbar.light .tab{background:#f1f3f4}.tabbar.light .tab.active{background:#fff}
  .tabbar.dark .tab{background:#292a2d;color:#e8eaed}.tabbar.dark .tab.active{background:#35363a}
  .fav,.fav svg{display:block;width:16px;height:16px}
  .ok{color:#7fd4c6}.bad{color:#dcc078}
  .row{display:flex;gap:26px;align-items:flex-start;flex-wrap:wrap}
  .note{color:#788a88;font-size:11px;margin-top:6px}
</style></head><body>
  <h1>索斐 · 图标落地观感对照</h1>
  <p class="sub">资产＝真实交付文件（web/icons/*），出图＝无头 Chromium。⚠️ 图里的<b>启动器遮罩</b>与<b>标签栏</b>都是<b>近似示意</b>，真实遮罩随厂商/系统版本不同；本图不是真机截图。</p>

  <h2>N1 · 启动/安装图标（manifest 192/512、apple-touch-icon 用它）</h2>
  <div class="row">${strip([192, 96, 48, 32, 16], false)}${strip([48, 32, 16], true)}</div>
  <div class="row" style="margin-top:14px">
    <div class="cell">${round(96, '50%')}<span>圆形遮罩 96（近似）</span></div>
    <div class="cell">${round(96, '22.5%')}<span>圆角方 96（近似）</span></div>
    <div class="cell">${round(48, '50%')}<span>圆形遮罩 48（近似）</span></div>
    <div class="cell"><div class="strip dark" style="width:120px;height:120px;align-items:center;justify-content:center"><div style="width:96px;height:96px">${sized(mark, 96)}</div></div><span>极简记号 96</span></div>
  </div>
  <div class="note">mono 单色层（Android 13+ 主题图标，图上无法直出——它由系统取色）：${monoOnly}</div>

  <h2>M1 · 浏览器标签页图标（favicon.svg ＋ favicon-32.png 兜底）</h2>
  <div class="row">${markCell(32, false)}${markCell(16, false)}${markCell(16, true)}</div>
  <div class="row" style="margin-top:14px;align-items:flex-end">${tab(true)}${tab(false)}</div>

  <h2>对照：N1 用在标签页尺寸会怎样（这是 favicon 另出一套记号的原因）</h2>
  <div class="strip light" style="gap:14px">${[16, 32].map((p) => `<div class="cell"><div style="width:${p}px;height:${p}px">${sized(n1, p)}</div><span>N1 ${p}px</span></div>`).join('')}</div>
</body></html>`;

  const tmp = path.join(OUT_DIR, '.sheet.html');
  fs.writeFileSync(tmp, html, 'utf8');
  const win = (p) => p.replace(/\//g, '\\');
  try {
    execFileSync(chromeBin, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
      `--screenshot=${win(outFile)}`, '--window-size=1000,1060', '--virtual-time-budget=3000',
      `file:///${win(tmp)}`,
    ], { stdio: 'pipe' });
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

// ─────────────────────────── 主流程 ───────────────────────────

const checkOnly = process.argv.includes('--check');
fs.mkdirSync(OUT_DIR, { recursive: true });

const iconSvg = buildIconSvg();
const faviconSvg = buildFaviconSvg(MARK);
assertNoFont(iconSvg, 'icon.svg');
assertNoFont(faviconSvg, 'favicon.svg');
for (const [name, text] of [['icon.svg', iconSvg], ['favicon.svg', faviconSvg]]) {
  const file = path.join(OUT_DIR, name);
  const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (before === text) console.log(`  = web/icons/${name}`);
  else if (checkOnly) console.log(`  ✗ web/icons/${name} 与生成结果不一致`);
  else { fs.writeFileSync(file, text, 'utf8'); console.log(`  ${before === null ? '+' : '~'} web/icons/${name}`); }
}

const chromeBin = process.env.CHROME_BIN;
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const lines = [];
for (const s of SIZES) {
  const file = path.join(OUT_DIR, s.file);
  if (checkOnly) {
    if (!fs.existsSync(file)) { console.log(`  ✗ 缺 web/icons/${s.file}`); continue; }
    const buf = fs.readFileSync(file);
    const { w, h } = pngSize(buf);
    lines.push(`${s.file}  ${w}×${h}  ${buf.length} B  sha256[:12]=${sha256(buf).slice(0, 12)}  ← ${s.from}  ${s.what}`);
    console.log(`  = web/icons/${s.file}（${w}×${h}，${buf.length} B）`);
    continue;
  }
  if (!chromeBin) {
    throw new Error(
      '需要 CHROME_BIN 指向 Chromium 才能出 PNG（本机在 '
      + '%LOCALAPPDATA%\\Chromium\\Application\\chrome.exe）。只核对文本资源请加 --check。',
    );
  }
  const buf = render(chromeBin, path.join(OUT_DIR, s.from), file, s.size);
  lines.push(`${s.file}  ${s.size}×${s.size}  ${buf.length} B  sha256[:12]=${sha256(buf).slice(0, 12)}  ← ${s.from}  ${s.what}`);
  console.log(`  + web/icons/${s.file}（${s.size}×${s.size}，${buf.length} B）`);
}

// ── 观感对照图（证据产物；--sheet 才出，默认写在 web/tests/artifacts/ 下，该目录已 gitignore）──
const sheetArg = process.argv.indexOf('--sheet');
if (sheetArg >= 0) {
  if (!chromeBin) throw new Error('--sheet 需要 CHROME_BIN 才能出图');
  const sheetFile = process.argv[sheetArg + 1] ?? path.join(REPO_ROOT, 'web', 'tests', 'artifacts', 'icons-observation.png');
  fs.mkdirSync(path.dirname(sheetFile), { recursive: true });
  await renderSheet(chromeBin, sheetFile, iconSvg, faviconSvg);
  console.log(`\n观感对照图（本次实测产物）→ ${path.relative(REPO_ROOT, sheetFile).replace(/\\/g, '/')}`);
  console.log('  ⚠ 这张图是无头 Chromium 出的对照图：遮罩/标签栏都是**近似**，不是真机启动器或真实浏览器 chrome。');
}

console.log('\n产物（本次实测）：');
for (const l of lines) console.log(`  · ${l}`);
console.log(`  · 记号 M1：厚 ${MARK.thickness}/臂 ${MARK.arm}（画布 108），角标外角 (${MARK.corner.x},${MARK.corner.y})，`
  + `路径 "${markPath(MARK)}"`);
console.log(`  · favicon.svg 在 16px 下的等效笔画：${(MARK.thickness / 108 * 16).toFixed(2)}px 厚、`
  + `${(MARK.arm / 108 * 16).toFixed(2)}px 长（N1 的发丝同尺度下只有 ${(2.5 / 108 * 16).toFixed(2)}px 厚 ⇒ 这就是它糊的原因）`);
if (checkOnly) console.log('\n--check：只核对，未写任何文件。');
