#!/usr/bin/env python3
"""Prepare a new version: bump the version number in index.html and the cache name in sw.js,
and refresh the list of files the app keeps offline. Run from the repo root before pushing:

    python3 tools/release.py
"""
import os
import re

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
os.chdir(ROOT)

html = open("index.html", encoding="utf-8").read()
m = re.search(r'const APP_VERSION = "(\d+)\.(\d+)";', html)
major, minor = int(m.group(1)), int(m.group(2)) + 1
html = html.replace(m.group(0), f'const APP_VERSION = "{major}.{minor}";')
open("index.html", "w", encoding="utf-8").write(html)

files = ["./", "index.html", "qr.js", "drive.js", "manifest.webmanifest",
         "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png",
         "fonts/inter-latin-wght-normal.woff2", "fonts/inter-latin-ext-wght-normal.woff2"]
files += ["images/" + f for f in sorted(os.listdir("images")) if f.endswith(".svg")]
files += ["images/anim/" + f for f in sorted(os.listdir("images/anim")) if f.endswith(".svg")]

sw = open("sw.js", encoding="utf-8").read()
c = re.search(r'const CACHE = "trening-za-decu-v(\d+)";', sw)
n = int(c.group(1)) + 1
sw = sw.replace(c.group(0), f'const CACHE = "trening-za-decu-v{n}";')
sw = re.sub(r"const SHELL = \[[\s\S]*?\];", "const SHELL = [\n  " + ",\n  ".join(f'"{f}"' for f in files) + "\n];", sw)
open("sw.js", "w", encoding="utf-8").write(sw)
print(f"version {major}.{minor}, cache trening-za-decu-v{n}, {len(files)} files")
