#!/usr/bin/env python3
"""建筑/角色 sprite 资产管线 (ADR-11)
1. 假透明清除: 生图模型会把"透明背景"画成真实的中性近白棋盘格像素
   (2026-08-25 实锤: 兵营/炮塔/仓库/两种敌人 sheet 每帧都有 26x110 白条,
   曾被误诊为"信标光柱")。清除规则: 中性(R=G=B±3)且亮度≥235、与透明区
   连通、组件≥60px → 置透明; 仅处理存在≥500px此类组件的格子(伪影签名)。
2. 帧配准: 每张 sheet 的全部帧做 alpha 质心对齐到帧0
   (codex 生成的帧是独立重画, 质心可漂移 30px+, 直接循环=建筑上下瞬跳)。
   平移在带余量的大画布上做再裁回原尺寸, 不截断越界内容(旧法在固定 cell×H
   画布上 AFFINE, 漂移方向一侧的像素被永久丢弃); 配准幂等——已对齐帧质心差≈0,
   重跑不再移动。首次改写任一原图前备份 <name>.bak(未跟踪新资产误改可恢复)。
3. 重生成 src/sprite_data.js: assets/*_sheet.png → base64 内联
运行: python3 assets/build_sprites.py
"""
import base64, os, shutil
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, 'assets')
CELL = 128

def backup_once(path):
    """首次改写原图前留一份 <path>.bak(未 git 跟踪的新资产被启发式误改时可恢复)。
    .bak 不被 sprite_data 扫描(只认 *_sheet.png), 且已在 .gitignore。"""
    bak = path + '.bak'
    if not os.path.exists(bak):
        shutil.copy2(path, bak)

def cell_of(W, H):
    """横排方格表的格宽: 2048x256→256, 1024x128→128; 非横排(玩家2x4表)退128格网"""
    if W > H and W % H == 0:
        return H
    return CELL

def centroid(im):
    px = im.load(); w, h = im.size
    sx = sy = st = 0
    for y in range(h):
        for x in range(w):
            a = px[x, y][3]
            sx += x * a; sy += y * a; st += a
    return (sx / st, sy / st) if st else (0.0, 0.0)

def _neutral_light(p):
    r, g, b, a = p
    return a > 8 and max(abs(r-g), abs(r-b), abs(g-b)) <= 3 and min(r, g, b) >= 235

def _clean_cell(px, w, h, cell=CELL):
    """单格假透明清除。返回清除的像素数。阈值随格宽平方缩放(256格面积=4x)。"""
    k = (cell / 128) ** 2
    big_th, comp_th = 500 * k, 60 * k
    mask = [[False]*w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            if _neutral_light(px[x, y]):
                mask[y][x] = True
    seen = [[False]*w for _ in range(h)]
    big_artifact = False
    comps = []
    for y0 in range(h):
        for x0 in range(w):
            if not mask[y0][x0] or seen[y0][x0]: continue
            stack = [(x0, y0)]; seen[y0][x0] = True
            comp = []
            touches_bg = False
            while stack:
                x, y = stack.pop()
                comp.append((x, y))
                if x in (0, w-1) or y in (0, h-1): touches_bg = True
                for nx, ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1),
                               (x+1,y+1),(x-1,y-1),(x+1,y-1),(x-1,y+1)):
                    if 0 <= nx < w and 0 <= ny < h and mask[ny][nx] and not seen[ny][nx]:
                        seen[ny][nx] = True; stack.append((nx, ny))
            for cx, cy in comp:      # 组件内任一像素邻接透明区也算触bg
                if touches_bg: break
                for nx, ny in ((cx+1,cy),(cx-1,cy),(cx,cy+1),(cx,cy-1)):
                    if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] <= 8:
                        touches_bg = True; break
            comps.append((comp, touches_bg))
            if len(comp) >= big_th and touches_bg: big_artifact = True
    if not big_artifact:
        return 0                      # 无伪影签名的格子原样跳过(保护玩家服/白色墙体)
    removed = 0
    for comp, touches_bg in comps:
        if len(comp) >= comp_th and touches_bg:
            for cx, cy in comp:
                r, g, b, a = px[cx, cy]
                px[cx, cy] = (r, g, b, 0)
                removed += 1
    return removed

def clean_sheet(path):
    """全 sheet 逐方格清除假透明背景。返回清除像素总数。"""
    im = Image.open(path).convert('RGBA')
    W, H = im.size
    cell = cell_of(W, H)
    cols, rows = max(1, W // cell), max(1, H // cell)
    total = 0
    for cj in range(rows):
        for ci in range(cols):
            c = im.crop((ci*cell, cj*cell, (ci+1)*cell, (cj+1)*cell))
            px = c.load()
            total += _clean_cell(px, cell, cell, cell)
            im.paste(c, (ci*cell, cj*cell))
    if total:
        backup_once(path)
        im.save(path)
    return total

def register_sheet(path):
    """全部帧质心对齐到帧0。返回移动过的帧数。仅横排方格表。"""
    im = Image.open(path).convert('RGBA')
    W, H = im.size
    cell = cell_of(W, H)
    if not (W > H and W % cell == 0 and cell == H):
        return 0                           # 非横排方格表(玩家行走表)跳过
    frames = W // cell
    c0 = centroid(im.crop((0, 0, cell, H)))
    margin = cell // 2          # 平移余量: |漂移|≤margin 时内容不丢像素
    moved = 0
    for i in range(frames):
        fr = im.crop((i * cell, 0, (i + 1) * cell, H))
        c = centroid(fr)
        dx, dy = round(c0[0] - c[0]), round(c0[1] - c[1])
        if dx or dy:
            if abs(dx) > margin or abs(dy) > margin:
                print(f'    ! {os.path.basename(path)} 帧{i} 质心漂移({dx},{dy})超余量, 跳过'
                      f'(帧内容差异过大, 配准无意义)')
                continue
            # 在带余量的大画布上平移再裁回原尺寸: 内容不因平移出界而被截断
            big = Image.new('RGBA', (cell + 2*margin, H + 2*margin), (0, 0, 0, 0))
            big.paste(fr, (margin, margin))
            big = big.transform((cell + 2*margin, H + 2*margin),
                                Image.AFFINE, (1, 0, -dx, 0, 1, -dy))
            fr = big.crop((margin, margin, margin + cell, margin + H))
            im.paste(fr, (i * cell, 0))
            moved += 1
    if moved:
        backup_once(path)
        im.save(path)
    return moved

def baseline_y(path):
    """帧0 内容底边(最后一个含有效像素的行)——供渲染基线锚点,
    消除'画稿在帧框内偏上'导致的建筑悬浮。仅横排方格表。"""
    im = Image.open(path).convert('RGBA')
    W, H = im.size
    cell = cell_of(W, H)
    if not (W > H and W % cell == 0 and cell == H):
        return 0
    px = im.load()
    for y in range(cell-1, -1, -1):
        for x in range(cell):
            if px[x, y][3] > 8:
                return y + 1
    return 0

def content_bbox_h(path):
    """帧0 内容高度(alpha>8 的 bbox 高)——供 dispH/内容高 比例缩放。"""
    im = Image.open(path).convert('RGBA')
    W, H = im.size
    cell = cell_of(W, H)
    if not (W > H and W % cell == 0 and cell == H):
        return 0
    fr = im.crop((0, 0, cell, cell))
    bb = fr.getbbox()
    return (bb[3] - bb[1]) if bb else 0

def diff_pct(im, i, j):
    """帧 i vs j 的内容差异像素占比(>16 通道差或 alpha 翻转)"""
    W, H = im.size
    cell = cell_of(W, H)
    a = im.crop((i * cell, 0, (i + 1) * cell, H)).load()
    b = im.crop((j * cell, 0, (j + 1) * cell, H)).load()
    diff = tot = 0
    for y in range(0, H, 2):
        for x in range(0, cell, 2):
            pa, pb = a[x, y], b[x, y]
            if pa[3] < 8 and pb[3] < 8: continue
            tot += 1
            if (pa[3] < 8) != (pb[3] < 8) or abs(pa[0]-pb[0]) > 16 \
               or abs(pa[1]-pb[1]) > 16 or abs(pa[2]-pb[2]) > 16:
                diff += 1
    return diff * 100.0 / max(tot, 1)

def hd_upscale(path):
    """128格建筑sheet → 2x LANCZOS放大到256格 + 轻度锐化(只锐RGB, alpha不动)。
    治'放大2-3x后像素低': 浏览器从近1:1贴图, 不再做大幅插值。
    幂等: 已是256格的跳过。返回 'upscaled'/'skip'。"""
    im = Image.open(path).convert('RGBA')
    W, H = im.size
    if cell_of(W, H) != CELL or W <= H:
        return 'skip'                       # 已高清或非横排建筑表
    im2 = im.resize((W*2, H*2), Image.LANCZOS)
    r, g, b, a = im2.split()
    rgb = Image.merge('RGB', (r, g, b)).filter(
        ImageFilter.UnsharpMask(radius=1.4, percent=55, threshold=2))
    out = Image.merge('RGBA', (*rgb.split(), a))
    backup_once(path)
    out.save(path)
    return 'upscaled'

def main():
    print('== HD放大(2x LANCZOS+锐化, 仅bl_建筑表) ==')
    for f in sorted(os.listdir(ASSETS)):
        if not f.startswith('bl_') or not f.endswith('_sheet.png'): continue
        print(f'  {f}: {hd_upscale(os.path.join(ASSETS, f))}')

    print('== 假透明棋盘格清除 ==')
    for f in sorted(os.listdir(ASSETS)):
        if not f.endswith('_sheet.png'): continue
        n = clean_sheet(os.path.join(ASSETS, f))
        print(f'  {f}: 清除{n}px' + ('' if n else '(无伪影)'))

    print('== 帧配准 ==')
    for f in sorted(os.listdir(ASSETS)):
        if not f.endswith('_sheet.png'): continue
        moved = register_sheet(os.path.join(ASSETS, f))
        tag = f'移动{moved}帧' if moved else '已对齐'
        print(f'  {f}: {tag}')

    print('== 配准后帧间差异(日常循环候选 0-3 帧 vs 帧0) ==')
    idle = {}
    for f in sorted(os.listdir(ASSETS)):
        if not f.startswith('bl_') or not f.endswith('.png'): continue
        im = Image.open(os.path.join(ASSETS, f)).convert('RGBA')
        ds = [round(diff_pct(im, 0, i)) for i in range(1, 4)]
        # 日常循环取最长前缀: 每帧与帧0差异≤30% 才入循环, 至少静态帧0
        n = 1
        for d in ds:
            if d > 30: break
            n += 1
        idle[f.replace('_sheet.png', '')] = n
        print(f'  {f}: 帧1/2/3差异={ds}% → idleFrames={n}')

    print('== 帧0内容底边/高度(基线锚点+缩放依据) ==')
    baseline = {}
    ch = {}
    for f in sorted(os.listdir(ASSETS)):
        if not f.endswith('_sheet.png'): continue
        key = f.replace('_sheet.png', '')
        b = baseline_y(os.path.join(ASSETS, f))
        if b:
            baseline[key] = b
            ch[key] = content_bbox_h(os.path.join(ASSETS, f))
    for k in sorted(baseline):
        print(f'  {k}: baseline={baseline[k]} 内容高={ch[k]}')

    print('== 重生成 src/sprite_data.js ==')
    lines = [
        '/* 自动生成: python3 assets/build_sprites.py (假透明已清除+帧已质心配准, 勿手改) */',
        'window.APH.SPRITE_DATA = window.APH.SPRITE_DATA || {};',
    ]
    for f in sorted(os.listdir(ASSETS)):
        if not f.endswith('_sheet.png'): continue
        key = f.replace('_sheet.png', '')
        b64 = base64.b64encode(open(os.path.join(ASSETS, f), 'rb').read()).decode()
        lines.append(f"APH.SPRITE_DATA['{key}'] = 'data:image/png;base64,{b64}';")
    out = os.path.join(ROOT, 'src', 'sprite_data.js')
    with open(out, 'w', encoding='utf-8') as fp:
        fp.write('\n'.join(lines) + '\n')
    print(f'  ✓ {out} ({os.path.getsize(out)//1024}KB, {len(lines)-2} sheets)')

    import json
    meta = {k: {'idle': idle[k], 'baseline': baseline[k], 'h': ch.get(k, 0)}
            for k in idle if k in baseline}
    print('SPRITE_META = ' + json.dumps(meta))

if __name__ == '__main__':
    main()
