#!/usr/bin/env python3
"""Launch screens for iPhone and iPad: plain app background, light and dark.

iOS shows one of these while the installed app opens, instead of a white screen. They are plain on
purpose, like a native app's launch screen (same approach as the Trening-app). Run from the repo root:

    python3 tools/make_splash.py

It writes icons/splash/*.png and replaces the launch-screen <link> tags in index.html.
"""
import os
import re
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
os.chdir(ROOT)

THEMES = {"light": (0xF5, 0xF5, 0xF7), "dark": (0, 0, 0)}
# (CSS width, CSS height, pixel ratio) in portrait
IPHONES = [
    (320, 568, 2), (375, 667, 2), (414, 736, 3), (375, 812, 3), (414, 896, 2), (414, 896, 3),
    (390, 844, 3), (428, 926, 3), (393, 852, 3), (430, 932, 3), (402, 874, 3), (420, 912, 3), (440, 956, 3),
]
# iPads open in portrait or landscape
IPADS = [
    (744, 1133, 2),   # iPad mini 6/7
    (768, 1024, 2),   # iPad 9.7", older iPad Air / mini
    (810, 1080, 2),   # iPad 10.2"
    (820, 1180, 2),   # iPad 10th gen, iPad Air 10.9"
    (834, 1194, 2),   # iPad Pro 11", iPad Air 11"
    (1024, 1366, 2),  # iPad Pro 12.9", iPad Air 13"
]

os.makedirs("icons/splash", exist_ok=True)
tags = []
for theme, rgb in THEMES.items():
    screens = [(w, h, r, "portrait") for w, h, r in IPHONES]
    screens += [(w, h, r, o) for w, h, r in IPADS for o in ("portrait", "landscape")]
    for w, h, r, o in screens:
        px = (w * r, h * r) if o == "portrait" else (h * r, w * r)
        name = f"icons/splash/{theme}-{px[0]}x{px[1]}.png"
        Image.new("RGB", px, rgb).save(name, optimize=True)
        tags.append(f'<link rel="apple-touch-startup-image" href="{name}" media="(device-width: {w}px) and '
                    f'(device-height: {h}px) and (-webkit-device-pixel-ratio: {r}) and (orientation: {o}) '
                    f'and (prefers-color-scheme: {theme})">')

html = open("index.html", encoding="utf-8").read()
block = "<!-- launch screens (tools/make_splash.py) -->\n" + "\n".join(tags) + "\n<!-- /launch screens -->"
if "<!-- launch screens" in html:
    html = re.sub(r"<!-- launch screens.*?<!-- /launch screens -->", lambda m: block, html, flags=re.S)
else:
    html = html.replace('<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">',
                        '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">\n' + block, 1)
open("index.html", "w", encoding="utf-8").write(html)
print(f"{len(tags)} launch screens written to icons/splash and linked in index.html")
