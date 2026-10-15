#!/usr/bin/env uv run --with fonttools python
"""
把「索」这个字形从字体里**抽成矢量轮廓**（SVG path data）。

为什么需要它：Android 上不会有微软雅黑这类字体，**图标一旦用字就必须自己带走形状**。
所以最终交付的 SVG 里不能有 <text> 元素，只能有 <path>。这个脚本就是那一步，
而且它同时证明了「我们用的字体确实可自由使用」——本脚本只允许 OFL 字体（见 LEGAL 注释）。

用法：
  uv run --with fonttools python prototype/icons/outline.py <字体文件> <字符> <目标字号px> <中心x> <中心y> [字重]
    → 往 stdout 打印一行 JSON：{ path, upem, inkBBox, scale, translate, fontName, license? }
    字重（可选）只在**可变字体**上生效（如 NotoSansSC-VF.ttf）：会先实例化到该字重再取轮廓，
    这样矢量产物与预览图上看到的字重一致（不靠浏览器/系统去合成）。

例：
  uv run --with fonttools python prototype/icons/outline.py \
    C:/Windows/Fonts/NotoSansSC-VF.ttf 索 42 54 52 500
"""
import json
import sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen

# LEGAL：只用于 OFL 等可自由使用、允许嵌入/派生的字体。
# 专有字体（微软雅黑、等线、楷体、华文系）**不要**走这条路——那近似复制字形软件，
# 我们给它们的既定口径是「出位图 mipmap」（见 prototype/icons/README.md）。

def main() -> int:
    if len(sys.argv) not in (6, 7):
        print(__doc__)
        return 2
    font_path, char, target_px, cx, cy = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4]), float(sys.argv[5])
    weight = float(sys.argv[6]) if len(sys.argv) == 7 else None

    font = TTFont(font_path, fontNumber=0)
    if weight is not None and "fvar" in font:
        from fontTools.varLib import instancer
        font = instancer.instantiateVariableFont(font, {"wght": weight}, inplace=False)
    upem = font["head"].unitsPerEm
    cmap = font.getBestCmap()
    gname = cmap.get(ord(char))
    if gname is None:
        print(json.dumps({"error": f"字体里没有这个字符: {char}"}))
        return 1

    glyph_set = font.getGlyphSet()
    pen = SVGPathPen(glyph_set)
    glyph_set[gname].draw(pen)
    path = pen.getCommands()

    bpen = BoundsPen(glyph_set)
    glyph_set[gname].draw(bpen)
    if bpen.bounds is None:
        print(json.dumps({"error": "取不到字形边界（空白字形？）"}))
        return 1
    x0, y0, x1, y1 = bpen.bounds

    # 缩放：让 em 方块映射到 target_px（与 CSS font-size 的含义一致）
    s = target_px / upem
    # 平移：把字形**墨迹中心**放到 (cx, cy)，并把字体坐标的 y 轴翻过来（字体 y 朝上，SVG y 朝下）
    ink_cx, ink_cy = (x0 + x1) / 2, (y0 + y1) / 2
    tx = cx - ink_cx * s
    ty = cy + ink_cy * s  # y 翻转后：SVG_y = ty - font_y * s

    xmin, ymin = round(x0), round(y0)
    out = {
        "char": char,
        "glyph": gname,
        "fontFile": font_path,
        "fontName": font["name"].getDebugName(1),
        "upem": upem,
        "weight": weight,
        "inkBBoxFontUnits": [xmin, ymin, round(x1), round(y1)],
        "scale": s,
        # 直接可用的 SVG 变换：先缩放、y 翻转、再平移
        "transform": f"translate({tx:.4f} {ty:.4f}) scale({s:.6f} -{s:.6f})",
        "path": path,
    }
    print(json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
