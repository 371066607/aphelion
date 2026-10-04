# Environment atlas source

`raw-generated.png` is the original transparent 1254×1254 generated image, retained for reproducibility. Prompt summary: top-down, warm hand-painted alien settlement environment sheet, 4 columns × 3 rows; tree variants, berry bush, herb, stone, iron, wreckage, cargo, glowing flora, crystal flora, dew flora and star flora on transparent background. It uses the existing warm settlement furniture palette. Source: Codex image generation for visual-cohesion implementation, 2026-10-04.

`prepare_environment.py` detects per-cell alpha bounds at threshold 8, preserves source alpha inside each crop, and packs a 1024×768 four-by-three runtime atlas. Each runtime cell is 256×256, with 8px inset. Re-run with the bundled Python runtime that includes Pillow. `build_environment.py` validates and embeds only the already prepared PNG using Python stdlib.
