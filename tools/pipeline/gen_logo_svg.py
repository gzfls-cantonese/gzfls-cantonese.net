#!/usr/bin/env python3
"""Bake the「三國」logo glyphs into font-independent SVG path assets.

The logo is set in a clerical (隶书) face. Shipping it as live <text> would
depend on the viewer having that font installed, so this script converts the
two glyph outlines (三 U+4E09, 國 U+570B) into SVG <path> data and writes the
finished logo image to both the bundled asset (web/src/assets/logo.svg) and
the favicon (web/public/favicon.svg). Re-run whenever the logo geometry or the
source font changes.

Usage:
  python3 tools/pipeline/gen_logo_svg.py --font /path/to/Libian.ttc [--face "Libian TC"]
"""

import argparse
import os
import re
import sys

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.misc.transform import Transform
from fontTools.ttLib import TTCollection

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))

VIEW = 64.0
# (char, anchor-x, baseline-y, font-size) — mirrors the approved diagonal layout:
# 三 top-left, 國 bottom-right overlapping part of 三.
GLYPHS = [
    ("三", 22.0, 32.0, 34.0, None),
    ("國", 41.0, 51.0, 34.0, 3.0),  # stroke width; drawn on top via paint-order
]
GRAD_STOPS = ("#2dd4bf", "#0d9488")


def round_d(d):
    return re.sub(r"-?\d+\.\d{3,}", lambda m: f"{float(m.group()):.2f}".rstrip("0").rstrip("."), d)


def glyph_path(font, char, x, y, size):
    cmap = font.getBestCmap()
    gid = cmap[ord(char)]
    glyph_set = font.getGlyphSet()
    advance = font["hmtx"][gid][0]
    upem = font["head"].unitsPerEm
    s = size / upem
    pen = SVGPathPen(glyph_set)
    # text-anchor: middle -> centre the advance width on x; baseline sits at y.
    tp = TransformPen(pen, Transform(s, 0, 0, -s, x - s * advance / 2, y))
    glyph_set[gid].draw(tp)
    return round_d(pen.getCommands())


def svg_body(grad_id, paths):
    parts = [f'<rect width="{VIEW:g}" height="{VIEW:g}" rx="16" fill="url(#{grad_id})"/>']
    for d, stroke in paths:
        attrs = f'd="{d}" fill="#fff"'
        if stroke:
            attrs += f' stroke="{GRAD_STOPS[1]}" stroke-width="{stroke:g}" paint-order="stroke"'
        parts.append(f"<path {attrs}/>")
    return parts


def build_svg(grad_id, paths, comment):
    g0, g1 = GRAD_STOPS
    body = "\n  ".join(svg_body(grad_id, paths))
    return f"""<!-- {comment} -->
<svg width="{VIEW:g}" height="{VIEW:g}" viewBox="0 0 {VIEW:g} {VIEW:g}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="品三國 · 識粵語">
  <defs>
    <linearGradient id="{grad_id}" x1="0" y1="0" x2="{VIEW:g}" y2="{VIEW:g}" gradientUnits="userSpaceOnUse">
      <stop stop-color="{g0}"/>
      <stop offset="1" stop-color="{g1}"/>
    </linearGradient>
  </defs>
  {body}
</svg>
"""


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--font", required=True, help="path to a .ttc/.ttf providing the clerical face")
    p.add_argument("--face", default="TC", help="substring to select the TTC face (default: TC)")
    args = p.parse_args()

    coll = TTCollection(args.font, lazy=True)
    font = None
    for f in coll.fonts:
        name = f["name"].getDebugName(4) or ""
        if args.face in name:
            font = f
            break
    if font is None:
        font = coll.fonts[0]
    face_name = font["name"].getDebugName(4)
    print(f"using face: {face_name} ({args.font})")

    paths = []
    for char, x, y, size, stroke in GLYPHS:
        d = glyph_path(font, char, x, y, size)
        if not d:
            print(f"ERROR: empty outline for {char}", file=sys.stderr)
            return 1
        paths.append((d, stroke))
        print(f"  {char}: {len(d)} chars of path data")

    comment = (f"logo glyphs baked to paths from {face_name}; font-independent. "
               f"Regenerate with tools/pipeline/gen_logo_svg.py")

    asset_dir = os.path.join(REPO, "web", "src", "assets")
    os.makedirs(asset_dir, exist_ok=True)
    targets = [
        (os.path.join(asset_dir, "logo.svg"), build_svg("sg-logo-grad", paths, comment)),
        (os.path.join(REPO, "web", "public", "favicon.svg"), build_svg("g", paths, comment)),
    ]
    for path, text in targets:
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(text)
        print(f"wrote {os.path.relpath(path, REPO)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
