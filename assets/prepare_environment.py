#!/usr/bin/env python3
"""Prepare the generated 4x3 environment sheet with measured alpha bounds."""
from pathlib import Path
from PIL import Image
import json

ROOT=Path(__file__).resolve().parent.parent
BASE=ROOT/'assets/environment'
source=Image.open(BASE/'raw-generated.png').convert('RGBA')
if source.size!=(1254,1254): raise ValueError('Expected 1254x1254 master')
names=('tree_a','tree_b','berry','herb','stone','iron','wreck','cargo','glow','crystal','dew','star')
packed=Image.new('RGBA',(1024,768),(0,0,0,0))
measure={}
for i,name in enumerate(names):
    col,row=i%4,i//4
    x0=round(col*source.width/4);x1=round((col+1)*source.width/4)
    y0=round(row*source.height/3);y1=round((row+1)*source.height/3)
    region=source.crop((x0,y0,x1,y1))
    threshold=region.getchannel('A').point(lambda a: 255 if a>8 else 0)
    bbox=threshold.getbbox()
    if not bbox:raise ValueError(f'Empty sprite {name}')
    if bbox[0]<=0 or bbox[2]>=region.width or bbox[1]<=0 or bbox[3]>=region.height:
        raise ValueError(f'Sprite {name} touches cell edge; inspect source before packing: {bbox}')
    # Use threshold only to find crop; preserve the original antialiasing and shadow.
    crop=region.crop(bbox)
    scale=min(240/crop.width,240/crop.height)
    width,height=round(crop.width*scale),round(crop.height*scale)
    crop=crop.resize((width,height),Image.Resampling.LANCZOS)
    dst=(col*256+(256-width)//2,row*256+248-height)
    packed.alpha_composite(crop,dst)
    measure[name]={'source_bbox':[x0+bbox[0],y0+bbox[1],x0+bbox[2],y0+bbox[3]],'packed':[dst[0],dst[1],width,height]}
packed.save(BASE/'environment-atlas.png',optimize=True)
(BASE/'environment-bounds.json').write_text(json.dumps(measure,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('Prepared 12 environment sprites with measured alpha bounds')
