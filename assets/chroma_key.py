#!/usr/bin/env python3
"""生图资产 chroma-key: 把连通到格边的纯绿(#00FF00)背景置透明。
用于 codex exec 生成的 sprite sheet(模型输出不透明绿底), 在 build_sprites.py 之前跑。
用法: python3 assets/chroma_key.py <sheet.png> [sheet2.png ...]
幂等: 已透明背景再跑无变化。纯绿阈值: G>200 且 R<60 且 B<60(薄荷绿等柔和绿 R/B 高, 不会误伤)。
"""
import sys
from collections import deque
from PIL import Image

def chroma_key(path, cell=256, th=(200, 60, 60)):
    im = Image.open(path).convert('RGBA')
    W, H = im.size
    cols = max(1, W // cell)
    g_th, r_th, b_th = th
    total = 0
    for ci in range(cols):
        c = im.crop((ci * cell, 0, (ci + 1) * cell, H))
        px = c.load()
        def bg(x, y):
            r, g, b, a = px[x, y]
            return a > 200 and g > g_th and r < r_th and b < b_th
        seen = [[False] * H for _ in range(cell)]
        q = deque()
        for sx, sy in [(0, 0), (cell - 1, 0), (0, H - 1), (cell - 1, H - 1)]:
            if bg(sx, sy) and not seen[sy][sx]:
                seen[sy][sx] = True; q.append((sx, sy))
        while q:
            x, y = q.popleft()
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < cell and 0 <= ny < H and not seen[ny][nx] and bg(nx, ny):
                    seen[ny][nx] = True; q.append((nx, ny))
        for y in range(H):
            for x in range(cell):
                if seen[y][x]:
                    px[x, y] = (0, 0, 0, 0)
                    total += 1
        im.paste(c, (ci * cell, 0))
    if total:
        im.save(path)
    print(f'  {path}: chroma-key 清 {total}px')
    return total

if __name__ == '__main__':
    for p in sys.argv[1:]:
        chroma_key(p)
