#!/usr/bin/env python3
"""Use the ADR-11 PIL pipeline to clean the generated atlas, preserving its master.

Run only after replacing the source atlas (requires Pillow). Normal build.py
embeds the checked-in prepared PNG and does not require Pillow.
"""
from pathlib import Path
from PIL import Image, ImageFilter
import build_sprites

HERE = Path(__file__).resolve().parent / 'building'
image = Image.open(HERE / 'warm-settlement-atlas.raw.png').convert('RGBA')
removed = build_sprites._clean_cell(image.load(), image.width, image.height)
# This atlas has neutral gray antialiasing around the fake checkerboard. Run
# the same connected-background cleanup with a lower gray threshold; its warm
# cream pillows/panels have a wide R/B separation and remain opaque.
build_sprites._neutral_light = lambda p: p[3] > 8 and max(p[:3])-min(p[:3]) <= 16 and min(p[:3]) >= 180
removed += build_sprites._clean_cell(image.load(), image.width, image.height)
if removed < image.width * image.height * .1:
    raise SystemExit('Atlas cleanup found too little background; inspect the new source before preparing it.')
# Remove the last two source-pixel fringe at the matte boundary, before the
# roughly 4:1 runtime reduction. Solid pillows and the material swatches stay solid.
image.putalpha(image.getchannel('A').filter(ImageFilter.MinFilter(5)))
image.save(HERE / 'warm-settlement-atlas.png')
print(f'Prepared building atlas: removed {removed} fake-transparent background pixels')
