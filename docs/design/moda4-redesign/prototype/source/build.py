"""Rebuild the self-contained prototype (MODA4-Redesign-v3.html) from template.html.

Run from the repository root:
    python3 docs/design/moda4-redesign/prototype/source/build.py
Requires Pillow (pip install pillow). Images come from prisma/demo-assets (product + look photos)
and docs/design/moda4-redesign/assets (background-removed cutouts and wide banners).
"""
import re, base64, json, os, io, glob
from PIL import Image

ROOT = os.getcwd()
PKG = os.path.join(ROOT, "docs/design/moda4-redesign")
SRC = os.path.join(PKG, "prototype/source/template.html")
OUT = os.path.join(PKG, "prototype/MODA4-Redesign-v3.html")

def enc(path, maxw, q):
    im = Image.open(path)
    if im.width > maxw:
        im = im.resize((maxw, round(im.height * maxw / im.width)), Image.LANCZOS)
    b = io.BytesIO(); im.save(b, "WEBP", quality=q, method=6)
    return "data:image/webp;base64," + base64.b64encode(b.getvalue()).decode()

t = open(SRC, encoding="utf-8").read()
m = {}
for f in glob.glob(os.path.join(ROOT, "prisma/demo-assets/v2/*.webp")):
    m[os.path.basename(f)[:-5]] = enc(f, 720, 78)
m["coat"] = enc(os.path.join(ROOT, "prisma/demo-assets/coat.webp"), 720, 78)
for f in glob.glob(os.path.join(PKG, "assets/cutouts/*.webp")):
    m["cut/" + os.path.basename(f)[:-5]] = enc(f, 600, 82)
for f in glob.glob(os.path.join(PKG, "assets/banners/*.webp")):
    m["ban/" + os.path.basename(f)[:-5]] = enc(f, 1920, 76)
used = set(re.findall(r"\{\{IMG:([a-z0-9/-]+)\}\}", t))
assert not (used - set(m)), used - set(m)
t = re.sub(r'(src|srcset)="\{\{IMG:([a-z0-9/-]+)\}\}"',
           lambda mo: (f'data-img="{mo.group(2)}" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="' if mo.group(1) == "src" else f'data-imgset="{mo.group(2)}"'), t)
hyd = json.dumps(m) + ";\nArray.prototype.forEach.call(document.querySelectorAll('[data-img]'), function(i){ i.src = IMG[i.getAttribute('data-img')]; });\nArray.prototype.forEach.call(document.querySelectorAll('[data-imgset]'), function(s){ s.srcset = IMG[s.getAttribute('data-imgset')]; });"
t = t.replace("{{IMGMAP}};", hyd)
logo = open(os.path.join(PKG, "brand/moda4-wordmark.svg"), encoding="utf-8").read()
logo = logo.replace('role="img" aria-label="MODA4"><title>MODA4</title>', 'aria-hidden="true" focusable="false">').replace('<path fill="none" stroke', '<path class="hk" fill="none" stroke')
t = t.replace("{{LOGO}}", logo)
mark = open(os.path.join(PKG, "brand/moda4-mark.svg"), encoding="utf-8").read()
t = t.replace("{{MARK}}", "data:image/svg+xml;base64," + base64.b64encode(mark.encode()).decode())
open(OUT, "w", encoding="utf-8").write(t)
print(len(m), "images ->", os.path.relpath(OUT, ROOT), round(len(t) / 1e6, 2), "MB")
