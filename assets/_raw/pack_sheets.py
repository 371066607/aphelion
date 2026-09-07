#!/usr/bin/env python3
"""Pack chroma-green single sprites into 8-frame 2048x256 sheets."""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.dirname(ROOT)
CELL = 256
PAD = 10

def chroma(im):
    im = im.convert('RGBA')
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a <= 8:
                continue
            if g >= 90 and g > r + 35 and g > b + 35:
                px[x, y] = (0, 0, 0, 0)
            elif r < 40 and g > 200 and b < 40:
                px[x, y] = (0, 0, 0, 0)
    return im

def trim(im):
    bbox = im.getbbox()
    if not bbox:
        return im
    return im.crop(bbox)

def fit_cell(im, cell=CELL, pad=PAD):
    im = trim(im)
    w, h = im.size
    if w < 1 or h < 1:
        return Image.new('RGBA', (cell, cell), (0, 0, 0, 0))
    scale = min((cell - 2 * pad) / w, (cell - 2 * pad) / h)
    nw, nh = max(1, int(round(w * scale))), max(1, int(round(h * scale)))
    im = im.resize((nw, nh), Image.LANCZOS)
    out = Image.new('RGBA', (cell, cell), (0, 0, 0, 0))
    x = (cell - nw) // 2
    y = cell - pad - nh
    out.paste(im, (x, y), im)
    return out

def pack(src, dest):
    im = chroma(Image.open(src))
    cell = fit_cell(im)
    sheet = Image.new('RGBA', (CELL * 8, CELL), (0, 0, 0, 0))
    for i in range(8):
        sheet.paste(cell, (i * CELL, 0), cell)
    sheet.save(dest)
    print('packed', os.path.basename(dest), sheet.size)

def main():
    for f in sorted(os.listdir(ROOT)):
        if not f.startswith('bl_') or not f.endswith('.png') or f.endswith('_sheet.png'):
            continue
        key = f[:-4]
        src = os.path.join(ROOT, f)
        dest = os.path.join(ASSETS, key + '_sheet.png')
        pack(src, dest)

if __name__ == '__main__':
    main()
