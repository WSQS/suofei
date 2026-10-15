#!/usr/bin/env node
// 启动器图标（自适应图标）生成器 —— 从**原型里已评审过的矢量源**生成 android 资源。
//
//   node android/tools/make-launcher-icon.mjs          # 写资源 + 打印自检数字
//   node android/tools/make-launcher-icon.mjs --check  # 只自检，不写文件（改了资源会不会漂）
//
// ## 为什么要有这个脚本
//
// 形态 N1（单字「索」＋ 右下一条 accent 发丝角标）与字体（`Noto Sans SC`，OFL）由用户 2026-10-15 选定，
// 交付源在仓库里、**只读**：`prototype/icons/svg/r4-N1-{bg,fg,mono}.svg`。
//
// 硬约束（改了就别指望用户还认这枚图标）：
//  1. **必须用轮廓，不得依赖运行时字体**：原型里的字形是 `outline.py` 从 `NotoSansSC-VF.ttf`
//     （先实例化到 wght=500）抽出的 `<path>`；本脚本**只搬 path 数据**，绝不生成 `<text>`、
//     也绝不引用任何字体/`android:fontFamily`。Android 上没有微软雅黑这类字体，图标一旦用字就必须自己带走形状。
//  2. **bg 满幅**（铺满整块 108×108 画布）；**fg 落在中心直径 66 的圆内**（比系统保证可见的内接 72 方更保守）。
//  3. **mono = 纯 alpha 剪影**（Android 13+ 主题图标用它按系统取色重绘）。源 mono 里第二条路径的
//     颜色（`#4fb3a5`）在单色层里**不携带信息**（系统只取 alpha 再上色），所以这里把两条路径归一成
//     同一个颜色 —— 这是忠实化，不是改设计。
//  4. **minSdk 26 ⇒ 自适应图标 + 矢量足够，不需要 legacy 位图 mipmap**（API 26 起系统一律读
//     `mipmap-anydpi-v26/` 下的 XML；位图兜底只会引入一份会过期的副本）。所以本脚本**不生成任何 PNG**。
//
// ## 这里做的那一步坐标变换（这是「同一份轮廓」的关键）
//
// 原型 SVG 的字形是**字体坐标 + 仿射**：
//   `<path transform="translate(33.0353 70.0574) scale(0.042000 -0.042000)" d="M450.96 844.88H550.4V…"/>`
// （字体 y 轴朝上，所以 scale 的 y 分量是负的）。
//
// 本脚本把该仿射**烘进坐标**（x' = tx + sx·x，y' = ty + sy·y），于是 Android 的 pathData 与
// 原型 SVG 的 `d` 是**逐点对应**的同一形状（`--check` 会把两边的墨迹包围盒对一遍，见 printed 输出）。
// 这样做而不是用 `<group android:scaleY="-0.042">` 的理由：**本机没有设备/模拟器可验证渲染**
// （任务明确要求不碰模拟器），而烘进坐标只依赖「绝对 M/L/H/V/Q/Z 的解析」这一条最稳的语义，
// 不依赖负 scaleY 在矢量资源里的实现细节。两者的几何（含环绕方向、填充规则）是同一件事：
// 仿射的行列式为负 ⇒ 所有轮廓的绕向一致反转 ⇒ 非零填充的判定不变，字腔（如「索」的洞）不会被填死。
//
// 遮罩本身不写进任何注释或代码：原型预览里的三种遮罩是**近似**（真实遮罩随厂商与系统版本不同）。

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));            // android/tools
const REPO_ROOT = path.resolve(HERE, '..', '..');
const SRC_DIR = path.join(REPO_ROOT, 'prototype', 'icons', 'svg');    // 只读输入
const RES = path.join(HERE, '..', 'app', 'src', 'main', 'res');
const DRAWABLE = path.join(RES, 'drawable');
const MIPMAP_ANYDPI = path.join(RES, 'mipmap-anydpi-v26');

/** 画布与两条安全区判据（与原型同一套数字）。 */
const CANVAS = 108;           // 自适应图标画布 108×108dp
const CENTER = 54;
// 系统保证可见的是**中心 72 方**（画布内切圆半径 36；外侧 18dp 可能被遮罩吃掉）。
const GUARANTEED_R = 36;
// 原型自述的目标：前景内容全部落在**中心直径 66 的圆**内（r=33）—— 比 72 方更保守。
// 实测 N1 的 accent 角标没有完全达到这个目标（差 0.812 单位），见 build() 里的 notes。
const DECLARED_D = 66;

// 颜色令牌逐项取自 docs/design/visual-tokens.md 与原型 SVG（不自造值）：
//   bg #0e1315（= themes.xml 的 windowBackground，图标底与窗口底同色）、text #dde5e4、accent #4fb3a5。
const TOKEN_BG = '#0e1315';

// ─────────────────────────── SVG 解析（只取需要的东西） ───────────────────────────

const readSrc = (name) => fs.readFileSync(path.join(SRC_DIR, name), 'utf8');

function attr(src, name) {
  const m = new RegExp(`${name}="([^"]*)"`).exec(src);
  if (!m) throw new Error(`源 SVG 里找不到属性 ${name}`);
  return m[1];
}

/** `translate(tx ty) scale(sx sy)` —— 原型里字形用的就是这一种仿射。 */
function parseTransform(text) {
  const t = /translate\(\s*([-\d.eE]+)\s+([-\d.eE]+)\s*\)/.exec(text);
  const s = /scale\(\s*([-\d.eE]+)\s+([-\d.eE]+)\s*\)/.exec(text);
  if (!t || !s) throw new Error(`源 SVG 的 transform 不是「translate + scale」这一种：${text}`);
  return { tx: +t[1], ty: +t[2], sx: +s[1], sy: +s[2] };
}

const ARITY = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

/** 把 path data 拆成 [{cmd, args[]}]（显式命令；M 后的隐式 lineto 已展开成 L）。 */
function parsePath(d) {
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  const out = [];
  let i = 0;
  let cmd = null;
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) cmd = tokens[i++];
    if (cmd == null) throw new Error('path data 不是以命令字母开头');
    const upper = cmd.toUpperCase();
    const n = ARITY[upper];
    if (n === undefined) throw new Error(`不认识的 SVG 命令：${cmd}`);
    if (n === 0) {
      out.push({ cmd: upper, args: [] });
      cmd = null; // Z 之后必须显式再给命令
      continue;
    }
    const args = tokens.slice(i, i + n).map(Number);
    if (args.length < n || args.some((x) => Number.isNaN(x))) throw new Error(`命令 ${cmd} 的参数不全`);
    i += n;
    // 首字母大写＝绝对坐标：原型给的就是绝对坐标；这里对相对坐标也如实处理（不猜）。
    const prev = out.length ? out[out.length - 1] : null;
    const rel = cmd === cmd.toLowerCase();
    if (rel) {
      const px = endPoint(prev).x;
      const py = endPoint(prev).y;
      if (upper === 'H') args[0] += px;
      else if (upper === 'V') args[0] += py;
      else for (let k = 0; k + 1 < args.length; k += 2) { args[k] += px; args[k + 1] += py; }
    }
    out.push({ cmd: upper, args });
    if (upper === 'M' && cmd === 'M') cmd = 'L'; // SVG：M 之后的隐式续接是 lineto
  }
  return out;
}

/** 一条命令的终点（用于相对坐标换算；A 的 rx/ry/rot 不是坐标，单独处理）。 */
function endPoint(item) {
  if (!item) return { x: 0, y: 0 };
  const { cmd, args } = item;
  if (cmd === 'M' || cmd === 'L' || cmd === 'T') return { x: args[0], y: args[1] };
  if (cmd === 'H') return { x: args[0], y: NaN };
  if (cmd === 'V') return { x: NaN, y: args[0] };
  if (cmd === 'Q' || cmd === 'S') return { x: args[2], y: args[3] };
  if (cmd === 'C') return { x: args[4], y: args[5] };
  if (cmd === 'A') return { x: args[5], y: args[6] };
  return { x: NaN, y: NaN };
}

const fmt = (n) => {
  const r = Math.round(n * 10000) / 10000;
  if (Object.is(r, -0)) return '0';
  return String(r);
};

/** 把仿射烘进坐标，输出 Android pathData（显式命令，避免隐式续接带来的解析歧义）。 */
function bake(cmds, { tx, ty, sx, sy }) {
  const out = [];
  for (const { cmd, args } of cmds) {
    const a = args.slice();
    if (cmd === 'A') throw new Error('源里出现了圆弧命令 A —— 本脚本没有实现圆弧的仿射（也就意味着源变了，需要人工确认）');
    if (cmd === 'H') a[0] = tx + sx * a[0];
    else if (cmd === 'V') a[0] = ty + sy * a[0];
    else for (let k = 0; k + 1 < a.length; k += 2) {
      a[k] = tx + sx * a[k];
      a[k + 1] = ty + sy * a[k + 1];
    }
    out.push(args.length ? `${cmd} ${a.map(fmt).join(' ')}` : cmd);
  }
  return out.join(' ');
}

/** 控制点包围盒（把 Q 的控制点也算进去 ⇒ 是**保守**（偏大）的墨迹框）。两边用同一算法，可比。 */
function bboxOfPoints(cmds) {
  const pts = [];
  for (const { cmd, args } of cmds) {
    if (cmd === 'H') pts.push([args[0], NaN]);
    else if (cmd === 'V') pts.push([NaN, args[0]]);
    else for (let k = 0; k + 1 < args.length; k += 2) pts.push([args[k], args[k + 1]]);
  }
  const xs = pts.map((p) => p[0]).filter((x) => !Number.isNaN(x));
  const ys = pts.map((p) => p[1]).filter((y) => !Number.isNaN(y));
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** 仿射作用在包围盒上（sx>0、sy<0 ⇒ y 方向要交换 min/max）。 */
function mapBBox(b, { tx, ty, sx, sy }) {
  const x0 = tx + sx * b.x0;
  const x1 = tx + sx * b.x1;
  const y0 = ty + sy * b.y0;
  const y1 = ty + sy * b.y1;
  return { x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0: Math.min(y0, y1), y1: Math.max(y0, y1) };
}

/**
 * 轮廓上离圆心最远的那一点（用于「fg 落在中心直径 d 的圆内」这条约束）。
 *
 * 为什么不用包围盒的四个角去判：那等于要求内容是个「内接菱形」，连一个正圆都会被它判超界
 * （半径 r 的圆，其包围盒角点在 r·√2 处）—— 过严的判据会把合规的东西判红，等于没有判据。
 * 这里把路径按**线段/二次贝塞尔采样**成折线（每段 `SAMPLE_STEPS` 步），取采样点到圆心的最大距离：
 * 采样是**近似**（可能极微小地低估真正的最远点），但配 1/32 步长时误差在 1e-3 量级，
 * 而且**两端用的是同一套算法**（Kotlin 单测里是同一份实现），所以可比、可复核。
 */
const SAMPLE_STEPS = 32;

function farthestPoint(cmds) {
  let cur = { x: 0, y: 0 };
  let start = { x: 0, y: 0 };
  let worst = { x: NaN, y: NaN };
  let worstDist = -1;
  const push = (x, y) => {
    const dist = Math.hypot(x - CENTER, y - CENTER);
    if (dist > worstDist) { worstDist = dist; worst = { x, y }; }
  };
  const line = (x, y) => { push(x, y); cur = { x, y }; };
  const quad = (cx, cy, x, y) => {
    for (let k = 1; k <= SAMPLE_STEPS; k++) {
      const t = k / SAMPLE_STEPS;
      const mt = 1 - t;
      push(
        mt * mt * cur.x + 2 * mt * t * cx + t * t * x,
        mt * mt * cur.y + 2 * mt * t * cy + t * t * y,
      );
    }
    cur = { x, y };
  };
  for (const { cmd, args } of cmds) {
    if (cmd === 'M') { push(args[0], args[1]); start = { x: args[0], y: args[1] }; cur = start; }
    else if (cmd === 'L') line(args[0], args[1]);
    else if (cmd === 'H') line(args[0], cur.y);
    else if (cmd === 'V') line(cur.x, args[0]);
    else if (cmd === 'Q') quad(args[0], args[1], args[2], args[3]);
    else if (cmd === 'Z') line(start.x, start.y);
    else throw new Error(`farthestPoint 未实现的命令：${cmd}`);
  }
  return { worst: worstDist, at: worst };
}

/** 一条矩形（角标）到圆心的最远点。 */
function farthestOnRect(x, y, w, h) {
  let worst = -1;
  let at = null;
  for (const [px, py] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
    const dist = Math.hypot(px - CENTER, py - CENTER);
    if (dist > worst) { worst = dist; at = [px, py]; }
  }
  return { worst, at };
}

// ─────────────────────────── 生成 ───────────────────────────

const header = (what) => `<?xml version="1.0" encoding="utf-8"?>
<!--
  ${what}

  ⚠️ 本文件由 \`node android/tools/make-launcher-icon.mjs\` 生成 —— 手工改会在下一次生成时被覆盖；
     要改图标请改**交付源**（prototype/icons/svg/r4-N1-*.svg，只读输入）或改生成器，然后重跑。

  来源：prototype/icons/svg/r4-N1-{bg,fg,mono}.svg（形态 N1 由用户 2026-10-15 选定；字形＝Noto Sans SC，OFL）
  硬约束：① 字形是**矢量轮廓**，不引用任何字体（Android 上没有微软雅黑这类字体）；
         ② bg 满幅 108×108；③ fg 落在系统保证可见的中心 72 方（内切圆 r=${GUARANTEED_R}）内，
            与原型自述的「中心直径 ${DECLARED_D} 圆」的实测差距写在 android/README「图标」一节；
         ④ minSdk 26 ⇒ 自适应图标 + 矢量足够，**不提供 legacy 位图 mipmap**（见 android/README）。
  画布遮罩不写在这里：原型预览里的遮罩是近似，真实遮罩随厂商/系统版本不同。
-->`;

const vector = (what, body) => `${header(what)}
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="${CANVAS}dp"
    android:height="${CANVAS}dp"
    android:viewportWidth="${CANVAS}"
    android:viewportHeight="${CANVAS}">
${body}
</vector>
`;

function build() {
  // bg：原型就是一块满幅矩形（颜色令牌 bg）
  const bgSrc = readSrc('r4-N1-bg.svg');
  const bgFill = attr(bgSrc, 'fill');
  const bgRect = /<rect[^>]*width="([\d.]+)"[^>]*height="([\d.]+)"/.exec(bgSrc);
  if (!bgRect || +bgRect[1] !== CANVAS || +bgRect[2] !== CANVAS) {
    throw new Error(`源 bg 不是满幅 ${CANVAS}×${CANVAS}：${bgSrc}`);
  }

  // fg：字形轮廓（带仿射）＋ accent 发丝角标（一条矩形）
  const fgSrc = readSrc('r4-N1-fg.svg');
  const tf = parseTransform(attr(fgSrc, 'transform'));
  const glyphCmd = parsePath(attr(fgSrc, 'd'));
  const glyphFill = attr(fgSrc, 'fill');
  const accent = /<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" fill="(#[0-9a-fA-F]+)"/.exec(fgSrc);
  if (!accent) throw new Error('源 fg 里找不到 accent 角标矩形');
  const [, ax, ay, aw, ah, accentFill] = accent;

  // mono：同一份轮廓，单色（系统只取 alpha）
  const monoSrc = readSrc('r4-N1-mono.svg');
  const monoTf = parseTransform(attr(monoSrc, 'transform'));
  const monoCmd = parsePath(attr(monoSrc, 'd'));

  // ── 自检 1：bg / fg 两份源里的字形是同一份轮廓（同一仿射 + 同一 path data）
  if (JSON.stringify(tf) !== JSON.stringify(monoTf)) throw new Error('fg 与 mono 的仿射不一致 —— 源已经漂了');
  const fgPath = attr(fgSrc, 'd');
  const monoPath = attr(monoSrc, 'd');
  if (fgPath !== monoPath) throw new Error('fg 与 mono 的字形 path data 不一致 —— 源已经漂了');

  // ── 自检 2：源里没有运行时字体依赖（本生成器的硬前提）
  for (const [name, src] of [['bg', bgSrc], ['fg', fgSrc], ['mono', monoSrc]]) {
    if (/<text|font-family|fontSize|font-size=|<tspan/.test(src)) {
      throw new Error(`源 ${name} 里出现了文字/字体元素 —— 图标不得依赖运行时字体`);
    }
  }

  const baked = bake(glyphCmd, tf);
  const monoBaked = bake(monoCmd, monoTf);
  if (baked !== monoBaked) throw new Error('fg 与 mono 烘出来的 pathData 不一致');

  // ── 自检 3：烘进坐标后，字形仍落在安全圆内（这是约束 ② 的实测，不是口号）
  const glyphBox = bboxOfPoints(parsePath(baked));
  const glyphFar = farthestPoint(parsePath(baked));
  if (glyphFar.worst > GUARANTEED_R) {
    throw new Error(`字形墨迹超出了系统保证可见区（内切圆 r=${GUARANTEED_R}）：最远点 ${glyphFar.at} = ${glyphFar.worst.toFixed(3)}`);
  }
  // 烘坐标与「原型 SVG 的变换」必须是同一结果：用源坐标重算一遍包围盒来对
  const naive = mapBBox(bboxOfPoints(glyphCmd), tf);
  const drift = Math.max(
    Math.abs(naive.x0 - glyphBox.x0), Math.abs(naive.x1 - glyphBox.x1),
    Math.abs(naive.y0 - glyphBox.y0), Math.abs(naive.y1 - glyphBox.y1),
  );
  if (drift > 0.001) throw new Error(`烘坐标与原型仿射的结果不一致：偏差 ${drift}`);

  // accent 角标：与字形一起算进 fg 的安全区自检（farthestOnRect 会把角标的四个角也纳入）
  const accentFar = farthestOnRect(+ax, +ay, +aw, +ah);
  const fgFar = { worst: Math.max(glyphFar.worst, accentFar.worst) };
  const fgBox = {
    x0: Math.min(glyphBox.x0, +ax), x1: Math.max(glyphBox.x1, +ax + +aw),
    y0: Math.min(glyphBox.y0, +ay), y1: Math.max(glyphBox.y1, +ay + +ah),
  };
  // 两条判据分开，因为它们是两件事：
  //   · **系统保证**：可见的是中心 72 方（画布内切圆半径 36，方框 18…90）—— 这是硬判据；
  //   · **原型自述**：README 写「前景内容全部控制在中心直径 66 的圆内」(r=33) —— 这是更保守的目标。
  // 把后者当硬判据，会把**用户已选定**的 N1 判红（实测它没达到），而修法只能是改设计 ⇒ 不是实现的事。
  // 所以：超过保证可见区 => 直接失败；超过 66 圆但在 72 方内 => 如实报告（notes），不改几何。
  if (fgFar.worst > GUARANTEED_R) {
    throw new Error(
      `fg 超出了系统保证可见区（中心 72 方的内切圆 r=${GUARANTEED_R}）：最远 ${fgFar.worst.toFixed(3)}`
      + `（字形 ${glyphFar.worst.toFixed(3)} / 角标 ${accentFar.worst.toFixed(3)}）`,
    );
  }
  if (fgBox.x0 < 18 || fgBox.y0 < 18 || fgBox.x1 > 90 || fgBox.y1 > 90) {
    throw new Error(`fg 的包围盒超出了保证可见的 72 方（18…90）：${JSON.stringify(fgBox)}`);
  }
  const notes = [];
  if (fgFar.worst > DECLARED_D / 2) {
    const over = fgFar.worst - DECLARED_D / 2;
    notes.push(
      `⚠ 与原型自述不完全一致（**不改几何，只如实报告**）：原型 README 写「前景内容全部控制在中心直径 `
      + `${DECLARED_D} 的圆内」（r=${DECLARED_D / 2}），实测 N1 的 accent 角标外角在最远 ${fgFar.worst.toFixed(3)} 处`
      + `（超 ${over.toFixed(3)} 单位 = 画布的 ${((over / CANVAS) * 100).toFixed(2)}%）；字形本身没超（${glyphFar.worst.toFixed(3)}）。`
      + `系统保证可见的是中心 72 方（内切圆 r=${GUARANTEED_R}）：角标仍在其中，余量 ${(GUARANTEED_R - fgFar.worst).toFixed(3)} 单位。`
      + `本生成器没有为了凑这个数去挪角标 —— 那属于改已评审的设计，由用户/负责人定；改完重跑本脚本即可。`,
    );
  }

  const files = {};

  files[path.join(DRAWABLE, 'ic_launcher_background.xml')] = vector(
    '自适应图标 · 背景层（满幅）',
    `    <!-- 满幅铺满整块 ${CANVAS}×${CANVAS} 画布；颜色=视觉令牌 bg（与 themes.xml 的 windowBackground 同值）。 -->\n`
    + `    <path android:fillColor="${bgFill}" android:pathData="M 0 0 H ${CANVAS} V ${CANVAS} H 0 Z" />`,
  );

  files[path.join(DRAWABLE, 'ic_launcher_foreground.xml')] = vector(
    '自适应图标 · 前景层（单字「索」轮廓 ＋ 右下 accent 发丝角标）',
    `    <!-- 字形：\`索\` 的**矢量轮廓**（Noto Sans SC / OFL，取轮廓前已实例化到 wght=500 ⇒ 不依赖系统去合成字重）。\n`
    + `         坐标已是画布坐标（原型 SVG 的 translate+scale 已烘进坐标）：x' = ${tf.tx} + ${tf.sx}·x，y' = ${tf.ty} + (${tf.sy})·y。 -->\n`
    + `    <path\n        android:fillColor="${glyphFill}"\n        android:pathData="${baked}" />\n`
    + `    <!-- 右下角标：一条 ${aw}×${ah} 的 accent 发丝（视觉令牌 accent）。 -->\n`
    + `    <path android:fillColor="${accentFill}" android:pathData="M ${ax} ${ay} H ${+ax + +aw} V ${+ay + +ah} H ${ax} Z" />`,
  );

  files[path.join(DRAWABLE, 'ic_launcher_monochrome.xml')] = vector(
    '自适应图标 · 单色层（Android 13+ 主题图标）',
    `    <!-- 纯 alpha 剪影：形状与前景层相同，但**只有一个颜色** —— 主题图标只取 alpha 再按系统取色重绘，\n`
    + `         源 mono 里那条 accent 的颜色（${accentFill}）在这一层不携带信息，故归一成同一色。 -->\n`
    + `    <path\n        android:fillColor="#ffffffff"\n        android:pathData="${baked}" />\n`
    + `    <path android:fillColor="#ffffffff" android:pathData="M ${ax} ${ay} H ${+ax + +aw} V ${+ay + +ah} H ${ax} Z" />`,
  );

  const adaptive = (what) => `${header(what)}
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
    <monochrome android:drawable="@drawable/ic_launcher_monochrome" />
</adaptive-icon>
`;
  files[path.join(MIPMAP_ANYDPI, 'ic_launcher.xml')] = adaptive('自适应图标（API 26+，唯一入口；minSdk 26 ⇒ 不需要 legacy 位图）');
  files[path.join(MIPMAP_ANYDPI, 'ic_launcher_round.xml')] = adaptive('自适应图标 · 圆形入口（launcher 请求 roundIcon 时用同一套图层）');

  const sha = (t) => crypto.createHash('sha256').update(t).digest('hex').slice(0, 12);
  return {
    files,
    notes,
    report: [
      `源（只读）→ ${path.relative(REPO_ROOT, SRC_DIR).replace(/\\/g, '/')}/r4-N1-{bg,fg,mono}.svg`
      + `  sha256[:12] bg=${sha(bgSrc)} fg=${sha(fgSrc)} mono=${sha(monoSrc)}`,
      `仿射（原型 → 画布坐标）：translate(${tf.tx} ${tf.ty}) scale(${tf.sx} ${tf.sy})，仅烘进坐标，未改形状`,
      `字形轮廓：${glyphCmd.filter((c) => c.cmd !== 'Z').length} 条绘图命令 / pathData ${baked.length} 字符`
      + `（源 ${fgPath.length} 字符），命令集 ${[...new Set(glyphCmd.map((c) => c.cmd))].sort().join('')}`,
      `fg 包围盒（含 Q 控制点，保守偏大）：x ${fgBox.x0.toFixed(3)}…${fgBox.x1.toFixed(3)}`
      + ` / y ${fgBox.y0.toFixed(3)}…${fgBox.y1.toFixed(3)}（保证可见的 72 方是 18…90）`,
      `fg 到中心 (54,54) 的最远点：字形 ${glyphFar.worst.toFixed(3)}、角标 ${accentFar.worst.toFixed(3)}`
      + ` ⇒ 取大者 ${fgFar.worst.toFixed(3)}`
      + `（路径按 ${SAMPLE_STEPS} 步/段采样 + 角标四角，是近似值）`,
      `保证可见区判据：中心 72 方的内切圆半径 r=${GUARANTEED_R}，余量 ${(GUARANTEED_R - fgFar.worst).toFixed(3)} ✔`
      + `；原型自述的「中心直径 ${DECLARED_D} 圆」r=${DECLARED_D / 2} `
      + (fgFar.worst <= DECLARED_D / 2 ? '✔' : '⚠ 未完全达到（见下面的注）'),
      `bg 满幅：${bgFill} 铺满 0,0–${CANVAS},${CANVAS}（与 themes.xml windowBackground 同值 ${TOKEN_BG}）`,
      `mono：两条路径同色 #ffffffff ⇒ 纯 alpha 剪影`,
      `资源：res/drawable/ic_launcher_{background,foreground,monochrome}.xml + res/mipmap-anydpi-v26/ic_launcher{,_round}.xml`,
    ],
  };
}

// ─────────────────────────── 写盘 / 检查 ───────────────────────────

const { files, notes, report } = build();
const checkOnly = process.argv.includes('--check');
let changed = 0;
for (const [file, text] of Object.entries(files)) {
  const rel = path.relative(REPO_ROOT, file).replace(/\\/g, '/');
  const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (before === text) {
    console.log(`  = ${rel}`);
    continue;
  }
  changed++;
  if (checkOnly) console.log(`  ✗ ${rel} 与生成结果不一致（跑生成器重写）`);
  else {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text, 'utf8');
    console.log(`  ${before === null ? '+' : '~'} ${rel}`);
  }
}

console.log('\n自检（本次实测数字）：');
for (const line of report) console.log(`  · ${line}`);
for (const line of notes) console.log(`\n  ${line}`);

if (checkOnly && changed) {
  console.error(`\n--check：有 ${changed} 个资源与生成结果不一致。`);
  process.exit(1);
}
console.log(`\n${checkOnly ? '检查完成' : '写出完成'}：${Object.keys(files).length} 个资源文件，变动 ${changed} 个。`);
