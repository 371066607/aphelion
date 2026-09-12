/* ============================================================
   Aphelion · building_proto_draw.js
   建造场景绘制：手绘图集共用占格，连续墙仍由格网几何决定。
   ============================================================ */
window.APH = window.APH || {};

APH.BuildProtoDraw = (function(){
  'use strict';
  var G = 48, WORLD = 2200;
  var TAU = Math.PI * 2;
  function art(){ return APH.BuildArt; }

  function model(){ return APH.BuildProtoModel || {}; }
  function defs(){ return model().DEFS || {}; }
  function defOf(bid){ return defs()[bid] || { w:1, h:1, kind:'unknown', color:'#8c8170' }; }
  function key(gx, gy){ return gx + ',' + gy; }
  function has(map, gx, gy){ return !!(map && map[key(gx,gy)]); }
  function rectOf(o){
    var m=model();
    if(m.rectOf) return m.rectOf(o);
    var d=defOf(o.bid), rot=((o.rotation||0)%4+4)%4, swap=rot%2;
    return { x:(o.gx||0)*G, y:(o.gy||0)*G, w:(swap?(d.h||1):(d.w||1))*G, h:(swap?(d.w||1):(d.h||1))*G };
  }
  function cellsOf(o){
    var m=model();
    if(m.cellsOf) return m.cellsOf(o) || [];
    var r=rectOf(o), a=[], x, y;
    for(y=r.y/G;y<(r.y+r.h)/G;y++) for(x=r.x/G;x<(r.x+r.w)/G;x++) a.push({gx:x,gy:y});
    return a;
  }
  function isWall(o){ return o && (/wall|door|gate/.test(o.bid||'') || defOf(o.bid).kind === 'wall'); }
  function isDoor(o){ return o && (/door|gate/.test(o.bid||'') || defOf(o.bid).kind === 'door'); }
  function objCells(objects){
    var map={};
    (objects||[]).forEach(function(o){ if(isWall(o)) cellsOf(o).forEach(function(c){ map[key(c.gx,c.gy)]=o; }); });
    return map;
  }
  function rr(ctx,x,y,w,h,r){
    r=Math.min(r,w*.5,h*.5); ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
  }
  function fillStroke(ctx, fill, stroke, width){ ctx.fillStyle=fill; ctx.fill(); if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width||1;ctx.stroke();} }
  function shadow(ctx,r,amount){
    ctx.fillStyle='rgba(28,34,25,'+(amount||'.20')+')'; ctx.beginPath(); ctx.ellipse(r.x+r.w*.52,r.y+r.h*.78,r.w*.42,r.h*.13,0,0,TAU); ctx.fill();
  }
  function ground(ctx){
    ctx.fillStyle='#82723e'; ctx.fillRect(0,0,WORLD,WORLD);
    if(art() && art().fillMaterial(ctx,'ground',0,0,WORLD,WORLD)){
      /* 景物只是地表点缀；地板与建筑会盖住它们，不引入隐藏碰撞。 */
      for(var gy=2;gy<44;gy+=7) for(var gx=2;gx<44;gx+=9){
        var offset=(gx*17+gy*13)%37;
        art().drawSprite(ctx,'scrub',gx*G+offset,gy*G-offset,66,62);
      }
      return;
    }
    /* 稀疏草屑，别把地面画成满屏噪音。 */
    ctx.strokeStyle='rgba(54,70,42,.20)'; ctx.lineWidth=1;
    for(var y=12;y<WORLD;y+=36) for(var x=(y/36%2?23:8);x<WORLD;x+=53){ ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+2,y-3);ctx.stroke(); }
  }
  function drawFloor(ctx,gx,gy){
    var x=gx*G,y=gy*G;
    if(art() && art().fillMaterial(ctx,'floor',x,y,G,G)){
      ctx.strokeStyle='#75664c';ctx.lineWidth=1;ctx.strokeRect(x+.5,y+.5,G-1,G-1);
      ctx.strokeStyle='rgba(244,221,162,.23)';ctx.beginPath();ctx.moveTo(x+2,y+G-3);ctx.lineTo(x+2,y+2);ctx.lineTo(x+G-3,y+2);ctx.stroke();
      ctx.fillStyle='#706448';[[4,4],[G-4,G-4]].forEach(function(p){ctx.beginPath();ctx.arc(x+p[0],y+p[1],.7,0,TAU);ctx.fill();});
      return;
    }
    ctx.fillStyle='#b89563';ctx.fillRect(x,y,G,G);
    ctx.fillStyle='rgba(255,238,188,.22)';ctx.fillRect(x+2,y+2,G-4,2);
    ctx.strokeStyle='rgba(93,66,39,.36)';ctx.lineWidth=1;ctx.strokeRect(x+.5,y+.5,G-1,G-1);
    ctx.strokeStyle='rgba(91,61,34,.18)';
    ctx.beginPath();ctx.moveTo(x+5,y+15);ctx.lineTo(x+43,y+15);ctx.moveTo(x+5,y+33);ctx.lineTo(x+43,y+33);ctx.stroke();
  }
  function drawConduits(ctx, map, poweredMap, showPower){
    Object.keys(map||{}).forEach(function(k){ var p=k.split(','),gx=+p[0],gy=+p[1],x=gx*G,y=gy*G,cx=x+24,cy=y+24;
      var lit=has(poweredMap,gx,gy);
      ctx.strokeStyle=lit?(showPower?'#45c8d2':'#618b88'):(showPower?'#765b51':'#4d6864');ctx.lineWidth=showPower?3:2;ctx.lineCap='round';
      [[1,0],[-1,0],[0,1],[0,-1]].forEach(function(d){if(has(map,gx+d[0],gy+d[1])){ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+d[0]*24,cy+d[1]*24);ctx.stroke();}});
      ctx.fillStyle=lit?(showPower?'#c5fbf2':'#8ba9a1'):(showPower?'#bc7764':'#78918a');ctx.beginPath();ctx.arc(cx,cy,showPower?4:3,0,TAU);ctx.fill();
    });
  }
  function doorOpen(o,pawns){
    var r=rectOf(o),cx=r.x+r.w/2,cy=r.y+r.h/2;
    return (pawns||[]).some(function(p){return isFinite(p.x)&&isFinite(p.y)&&Math.abs(p.x-cx)<=G*.75&&Math.abs(p.y-cy)<=G*.75;});
  }
  function drawWalls(ctx, objects, pawns){
    var map=objCells(objects), edge='#665c44', body='#d7c69c';
    /* 一次填充相连格，缩放到非整数像素时也不会留下抗锯齿细缝。 */
    ctx.beginPath();Object.keys(map).forEach(function(k){var p=k.split(',');ctx.rect(+p[0]*G,+p[1]*G,G,G);});
    ctx.fillStyle=body;ctx.fill();
    if(art()){ctx.save();ctx.clip();art().fillMaterial(ctx,'wall',0,0,WORLD,WORLD);ctx.restore();}
    ctx.lineCap='butt';
    Object.keys(map).forEach(function(k){ var p=k.split(','),gx=+p[0],gy=+p[1],o=map[k],x=gx*G,y=gy*G;
      if(isDoor(o)){ drawDoor(ctx,x,y,o,doorOpen(o,pawns)); return; }
      [[0,-1,0],[1,0,1],[0,1,2],[-1,0,3]].forEach(function(s){ if(map[key(gx+s[0],gy+s[1])]) return;
        ctx.strokeStyle=edge;ctx.lineWidth=5;ctx.beginPath();
        if(s[2]===0){ctx.moveTo(x,y+2.5);ctx.lineTo(x+G,y+2.5);} if(s[2]===1){ctx.moveTo(x+G-2.5,y);ctx.lineTo(x+G-2.5,y+G);} if(s[2]===2){ctx.moveTo(x,y+G-2.5);ctx.lineTo(x+G,y+G-2.5);} if(s[2]===3){ctx.moveTo(x+2.5,y);ctx.lineTo(x+2.5,y+G);} ctx.stroke();
        /* 外缘窄高光和铆钉；连接格不画边框，转角自然接成整面墙。 */
        var bx=x+G/2+s[0]*(G/2-8),by=y+G/2+s[1]*(G/2-8);
        ctx.fillStyle='#8d7b52';ctx.beginPath();ctx.arc(bx,by,1.2,0,TAU);ctx.fill();
        ctx.fillStyle='#eee0b7';ctx.fillRect(bx-.5,by-1,1,1);
      });
    });
  }
  function drawDoor(ctx,x,y,o,open){
    var rot=((o.rotation||0)%4+4)%4, vertical=rot%2===1;
    if(art() && art().isReady()){
      ctx.save();ctx.translate(x+G/2,y+G/2);ctx.rotate(rot*Math.PI/2);
      art().drawSprite(ctx,open?'gate_open':'gate_closed',-G/2,-G/2,G,G);ctx.restore();return;
    }
    ctx.fillStyle='#d7d0c1';ctx.fillRect(x,y,G,G);
    ctx.strokeStyle='#82786a';ctx.lineWidth=5;
    if(vertical){ctx.beginPath();ctx.moveTo(x+3,y);ctx.lineTo(x+3,y+G);ctx.moveTo(x+G-3,y);ctx.lineTo(x+G-3,y+G);ctx.stroke();}
    else {ctx.beginPath();ctx.moveTo(x,y+3);ctx.lineTo(x+G,y+3);ctx.moveTo(x,y+G-3);ctx.lineTo(x+G,y+G-3);ctx.stroke();}
    ctx.fillStyle='#5e4934';
    if(vertical){ctx.fillRect(x+15,y+5,18,G-10); if(!open){ctx.fillStyle='#a36f43';ctx.fillRect(x+17,y+7,14,G-14);}}
    else {ctx.fillRect(x+5,y+15,G-10,18); if(!open){ctx.fillStyle='#a36f43';ctx.fillRect(x+7,y+17,G-14,14);}}
    if(open){ctx.fillStyle='rgba(177,222,205,.32)'; if(vertical)ctx.fillRect(x+16,y+5,16,G-10);else ctx.fillRect(x+5,y+16,G-10,16);}
  }
  function furniture(ctx,bid,r,rot,powered,look){
    var d=defOf(bid), bw=(d.w||1)*G,bh=(d.h||1)*G, x=-bw/2,y=-bh/2,w=bw,h=bh,
        cx=r.x+r.w/2,cy=r.y+r.h/2, wood='#7c5133', dark='#3e3934', accent='#9cc8be';
    shadow(ctx,r);
    /* r 是旋转后的占格边界；画稿永远使用未旋转的基础尺寸，绕该边界中心旋转。 */
    ctx.save(); ctx.translate(cx,cy); ctx.rotate(((rot||0)%4)*Math.PI/2);
    if(art() && art().drawSprite(ctx,look||bid,x+2,y+2,w-4,h-4)){
      if(['bl_lab','bl_kitchen','bl_workshop','bl_wood_generator'].indexOf(bid)>=0){
        ctx.fillStyle=powered?'#80cda9':'#c18a46';ctx.beginPath();ctx.arc(x+w-8,y+h-8,1.8,0,TAU);ctx.fill();
      }
      ctx.restore();return;
    }
    function box(fill,stroke,inset,rad){rr(ctx,x+inset,y+inset,w-inset*2,h-inset*2,rad||4);fillStroke(ctx,fill,stroke,1.5);}
    if(bid==='bl_bed'||bid==='bl_clinic'){
      box(bid==='bl_clinic'?'#d7e0d8':'#a8755c','#4c453d',5,4); ctx.fillStyle='#eee7d8';rr(ctx,x+8,y+7,w-16,18,4);ctx.fill();ctx.fillStyle=bid==='bl_clinic'?'#d9f0e5':'#d0a75f';ctx.fillRect(x+8,y+29,w-16,h-37);
      if(bid==='bl_clinic'){ctx.fillStyle='#c95752';ctx.fillRect(-5,y+12,10,4);ctx.fillRect(-2,y+7,4,14);}
    } else if(bid==='bl_dining_table'){
      box('#8c5c38','#49392d',5,5);ctx.strokeStyle='#c49a67';ctx.lineWidth=1;for(var i=12;i<w;i+=11){ctx.beginPath();ctx.moveTo(x+i,y+8);ctx.lineTo(x+i-5,h/2-4);ctx.stroke();}ctx.fillStyle='#5d412f';[[9,9],[w-13,9],[9,h-13],[w-13,h-13]].forEach(function(p){ctx.fillRect(x+p[0],y+p[1],5,5);});
    } else if(bid==='bl_dining_chair'){
      ctx.fillStyle=wood;ctx.fillRect(x+10,y+14,w-20,h-19);ctx.fillStyle='#5b3c29';ctx.fillRect(x+8,y+5,w-16,11);ctx.fillRect(x+11,y+h-8,5,6);ctx.fillRect(x+w-16,y+h-8,5,6);
    } else if(bid==='bl_lab'){
      box('#697b78',dark,5,4);ctx.fillStyle='#253a42';rr(ctx,x+13,y+8,w-26,h*.46,3);ctx.fill();ctx.strokeStyle=accent;ctx.stroke();ctx.fillStyle='#b9d5c1';ctx.fillRect(x+13,y+h-15,w-26,6);ctx.fillStyle='#394e4f';ctx.fillRect(x+8,y+h-8,8,5);
    } else if(bid==='bl_workshop'){
      box('#7b6548',dark,5,4);ctx.fillStyle='#3c4a47';ctx.fillRect(x+9,y+9,w-18,h-18);ctx.strokeStyle='#d7b766';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x+15,y+h-15);ctx.lineTo(x+w-15,y+14);ctx.moveTo(x+20,y+14);ctx.lineTo(x+w-12,y+h-17);ctx.stroke();
    } else if(bid==='bl_kitchen'){
      box('#8c928b','#404a45',5,4);ctx.fillStyle='#293833';[w*.28,w*.72].forEach(function(px){ctx.beginPath();ctx.arc(x+px,y+h*.42,8,0,TAU);ctx.fill();ctx.strokeStyle='#bfc7ba';ctx.stroke();});ctx.fillStyle='#d6dbd1';ctx.fillRect(x+8,y+h-15,w-16,6);
    } else if(bid==='bl_storage_shelf'){
      box('#704a30','#3d3028',5,3);ctx.fillStyle='#c49a5c';[13,h/2,h-13].forEach(function(py){ctx.fillRect(x+8,y+py-2,w-16,4);});ctx.fillStyle='#aa6b43';ctx.fillRect(x+13,y+9,13,8);ctx.fillStyle='#879d72';ctx.fillRect(x+w-28,y+h/2+4,16,8);
    } else if(bid==='bl_wood_generator'){
      box('#59645f','#303a35',5,6);ctx.fillStyle='#384743';ctx.fillRect(x+11,y+12,w-22,h-24);ctx.strokeStyle='#b6c4a7';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,Math.min(w,h)*.21,0,TAU);ctx.stroke();ctx.fillStyle=powered?'#84ddaa':'#b8a34d';ctx.beginPath();ctx.arc(x+w*.74,y+h*.25,5,0,TAU);ctx.fill();ctx.fillStyle='#855b37';ctx.fillRect(x+8,y+h-14,w-16,7);
    } else { box(defOf(bid).color||'#887562','#4c4941',6,5); }
    ctx.restore();
  }
  function drawObject(ctx,o,blueprint){
    var r=rectOf(o),d=defOf(o.bid);
    if(blueprint && (o.bid==='bl_floor'||o.bid==='bl_conduit')){
      ctx.save();ctx.fillStyle='rgba(103,207,205,.16)';ctx.fillRect(r.x+2,r.y+2,r.w-4,r.h-4);ctx.strokeStyle='#7ed8d7';ctx.lineWidth=2;ctx.setLineDash([5,3]);ctx.strokeRect(r.x+3,r.y+3,r.w-6,r.h-6);ctx.restore();return;
    }
    if(blueprint && isWall(o)){
      ctx.save();ctx.strokeStyle='#7ed8d7';ctx.lineWidth=2;ctx.setLineDash([5,3]);ctx.strokeRect(r.x+3,r.y+3,r.w-6,r.h-6);ctx.setLineDash([]);ctx.fillStyle='rgba(103,207,205,.16)';ctx.fillRect(r.x,r.y,r.w,r.h);ctx.fillStyle='#def9ee';ctx.fillRect(r.x+6,r.y+r.h-7,(r.w-12)*Math.max(0,Math.min(1,o.progress||0)),3);ctx.restore();return;
    }
    if(isWall(o)) return;
    if(o.bid==='bl_floor'||d.kind==='floor') return;
    if(o.bid==='bl_conduit'||d.kind==='conduit') return;
    if(blueprint){ctx.save();ctx.globalAlpha=.72;ctx.strokeStyle='#6dd0d2';ctx.lineWidth=2;ctx.setLineDash([5,3]);ctx.strokeRect(r.x+3,r.y+3,r.w-6,r.h-6);ctx.setLineDash([]);ctx.fillStyle='rgba(104,203,203,.18)';ctx.fillRect(r.x,r.y,r.w,r.h);ctx.fillStyle='#dff9eb';ctx.fillRect(r.x+7,r.y+r.h-7,(r.w-14)*Math.max(0,Math.min(1,o.progress||0)),3);ctx.restore();return;}
    /* 两床色仍是同一个建筑类型，只有画稿随位置变化。 */
    var look=o.bid==='bl_bed' && o.gx%4===1 && art() && art().isReady()?'bed_teal':o.bid;
    furniture(ctx,o.bid,r,o.rotation,o.powered,look);
  }
  function fallbackPawn(ctx,x,y){
    ctx.fillStyle='rgba(23,29,23,.28)';ctx.beginPath();ctx.ellipse(x,y+2,10,4,0,0,TAU);ctx.fill();ctx.fillStyle='#617c8c';rr(ctx,x-7,y-25,14,19,5);ctx.fill();ctx.fillStyle='#e2b78e';ctx.beginPath();ctx.arc(x,y-31,6,0,TAU);ctx.fill();
  }
  function drawPawn(ctx,p,time,selected,anchor,face){
    if(!p || !isFinite(p.x) || !isFinite(p.y)) return; var lying=p.status==='sleeping', moving=p.status==='moving', px=anchor?anchor.x:p.x,py=anchor?anchor.y:p.y;
    ctx.save();ctx.translate(px,py);ctx.fillStyle='rgba(23,29,23,.28)';ctx.beginPath();ctx.ellipse(0,2,lying?18:10,lying?5:4,0,0,TAU);ctx.fill();
    var done=false;
    if(APH.Sprites && APH.Humanoid && APH.Sprites.isReady){
      var pose=APH.Humanoid.poseFor({role:'resident',id:p.id,moving:moving,face:face==null?p.face:face,walkPh:p.walkPh||Math.floor(time*8),time:time,lying:lying},function(n){return APH.Sprites.isReady(n);});
      if(APH.Sprites.isReady(pose.sheet)){var sd=APH.Sprites.sheetDef(pose.sheet), sc=40/((sd&&sd.contentH)||240); done=APH.Sprites.draw(ctx,pose.sheet,0,0,pose.frame,sc);}
    }
    if(!done){ctx.restore();fallbackPawn(ctx,px,py);ctx.save();ctx.translate(px,py);}
    if(selected){ctx.strokeStyle='#f5de77';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,-8,17,0,TAU);ctx.stroke();}
    ctx.restore();
  }
  function roof(ctx,rooms){
    (rooms||[]).forEach(function(room){(room.cells||[]).forEach(function(c){var x=c.gx*G,y=c.gy*G;ctx.fillStyle='rgba(58,104,122,.22)';ctx.fillRect(x,y,G,G);ctx.strokeStyle='rgba(143,207,224,.38)';ctx.lineWidth=1;ctx.strokeRect(x+.5,y+.5,G-1,G-1);});});
  }
  function selection(ctx,objects,view){
    var uid=view.selectedUid, hover=view.hover;
    (objects||[]).forEach(function(o){if(uid && o.uid===uid){var r=rectOf(o);ctx.strokeStyle='#f5d96d';ctx.lineWidth=2;ctx.strokeRect(r.x+2,r.y+2,r.w-4,r.h-4);}});
    if(hover && isFinite(hover.gx) && isFinite(hover.gy)){ctx.strokeStyle='rgba(234,244,204,.60)';ctx.lineWidth=1;ctx.strokeRect(hover.gx*G+.5,hover.gy*G+.5,G-1,G-1);}
  }
  function preview(ctx,view){
    var p=view.placement;if(!p)return;var r=rectOf(p);ctx.save();ctx.globalAlpha=.65;ctx.save();ctx.translate(r.x+r.w/2,r.y+r.h/2);drawIcon(ctx,p.bid,p.rotation,G);ctx.restore();ctx.globalAlpha=.25;ctx.fillStyle=p.ok?'#73d5a4':'#e67b72';ctx.fillRect(r.x+2,r.y+2,r.w-4,r.h-4);ctx.globalAlpha=1;ctx.strokeStyle=p.ok?'#d5fff0':'#ffe1d8';ctx.lineWidth=2;ctx.setLineDash([5,3]);ctx.strokeRect(r.x+3,r.y+3,r.w-6,r.h-6);ctx.restore();
  }
  function overlayGrid(ctx, view){
    if(view.grid){
      ctx.strokeStyle='rgba(228,235,199,.16)';ctx.lineWidth=1;
      for(var i=0;i<=WORLD;i+=G){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,WORLD);ctx.moveTo(0,i);ctx.lineTo(WORLD,i);ctx.stroke();}
    }
    (view.dragCells||[]).forEach(function(c){ctx.fillStyle='rgba(130,201,192,.18)';ctx.fillRect(c.gx*G+2,c.gy*G+2,G-4,G-4);ctx.strokeStyle='rgba(187,243,229,.72)';ctx.lineWidth=1;ctx.strokeRect(c.gx*G+2.5,c.gy*G+2.5,G-5,G-5);});
  }
  function interactive(o){ return o && ['bed','chair','workstation'].indexOf(defOf(o.bid).kind)>=0; }
  function interactionArrows(ctx,state,objects,view){
    var fn=model().interactionsOf;
    if(!fn) return;
    var shown=[];
    (objects||[]).forEach(function(o){ if(o.uid===view.selectedUid && interactive(o)) shown.push(o); });
    if(view.placement && interactive(view.placement)) shown.push(view.placement);
    shown.forEach(function(o){
      var spots;try{spots=fn(state,o)||[];}catch(e){spots=[];}
      spots.forEach(function(s){var gx=s.gx,gy=s.gy;if(!isFinite(gx)||!isFinite(gy))return;var x=gx*G+24,y=gy*G+24;
        ctx.fillStyle='rgba(210,242,219,.82)';ctx.beginPath();ctx.moveTo(x,y-8);ctx.lineTo(x+7,y+5);ctx.lineTo(x+2,y+5);ctx.lineTo(x+2,y+10);ctx.lineTo(x-2,y+10);ctx.lineTo(x-2,y+5);ctx.lineTo(x-7,y+5);ctx.closePath();ctx.fill();
      });
    });
  }
  function targetObject(p,objects){
    var t=p&&p.order&&p.order.target;if(!t)return null;
    if(typeof t==='object' && t.bid)return t;
    var id=typeof t==='object'?(t.uid||t.id):t;
    return (objects||[]).filter(function(o){return o.uid===id||o.id===id;})[0]||null;
  }
  function pawnAnchor(p,objects){
    if(p.status!=='sleeping' && p.status!=='sitting') return null;
    var o=targetObject(p,objects);if(!o)return null;
    var r=rectOf(o),rot=((o.rotation||0)%4+4)%4;
    if(p.status==='sleeping' && !/bed|clinic/.test(o.bid||''))return null;
    if(p.status==='sitting' && !/chair/.test(o.bid||''))return null;
    return { point:{x:Number.isFinite(p.poseX)?p.poseX:r.x+r.w/2,y:Number.isFinite(p.poseY)?p.poseY:r.y+r.h*.62}, face:Math.PI/2+rot*Math.PI/2 };
  }
  function drawWorld(ctx,state,view){
    state=state||{};view=view||{};var objs=state.objects||[];
    ctx.save();ground(ctx);
    Object.keys(state.floors||{}).forEach(function(k){var p=k.split(',');drawFloor(ctx,+p[0],+p[1]);});
    if(art() && art().isReady() && Object.keys(state.floors||{}).length){
      /* 桌灯只照在地板上，随后全不透明地绘制家具，不混合两套建筑贴图。 */
      ctx.save();ctx.beginPath();
      Object.keys(state.floors).forEach(function(k){var p=k.split(',');ctx.rect(+p[0]*G,+p[1]*G,G,G);});ctx.clip();
      objs.forEach(function(o){if(o.bid!=='bl_dining_table')return;var r=rectOf(o),x=r.x+r.w/2,y=r.y+r.h/2;
        var glow=ctx.createRadialGradient(x,y,8,x,y,150);glow.addColorStop(0,'rgba(255,191,77,.26)');glow.addColorStop(1,'rgba(255,191,77,0)');
        ctx.fillStyle=glow;ctx.fillRect(x-150,y-150,300,300);
      });ctx.restore();
    }
    drawConduits(ctx,state.conduits||{},state.poweredConduits||{},!!view.power);
    drawWalls(ctx,objs,state.pawns||[]);
    objs.forEach(function(o){drawObject(ctx,o,false);});
    (state.blueprints||[]).forEach(function(o){drawObject(ctx,o,true);});
    interactionArrows(ctx,state,objs,view);
    (state.pawns||[]).forEach(function(p){var a=pawnAnchor(p,objs);drawPawn(ctx,p,view.time||state.clock||0,p.id===view.selectedPawnId,a&&a.point,a&&a.face);});
    if(view.roof) roof(ctx,state.rooms);
    overlayGrid(ctx,view);selection(ctx,objs,view);preview(ctx,view);
    ctx.restore();
  }
  function drawIcon(ctx,bid,rotation,size){
    var d=defOf(bid), n=size||G, rot=((rotation||0)%4+4)%4, bw=(d.w||1)*G,bh=(d.h||1)*G,
        rw=rot%2?bh:bw,rh=rot%2?bw:bh,r={x:-rw/2,y:-rh/2,w:rw,h:rh};
    ctx.save();ctx.scale(n/G,n/G);
    if(bid==='bl_floor'||d.kind==='floor'){ctx.save();ctx.translate(-24,-24);drawFloor(ctx,0,0);ctx.restore();}
    else if(bid==='bl_conduit'||d.kind==='conduit'){ctx.save();ctx.translate(-24,-24);drawConduits(ctx,{'0,0':true},{'0,0':true},true);ctx.restore();}
    else if(/wall/.test(bid)||d.kind==='wall'){ctx.save();ctx.translate(-24,-24);drawWalls(ctx,[{bid:'bl_wall',gx:0,gy:0}],[]);ctx.restore();}
    else if(/door|gate/.test(bid)||d.kind==='door'){drawDoor(ctx,-24,-24,{rotation:rot},false);}
    else furniture(ctx,bid,r,rot,true);
    ctx.restore();
  }
  return { drawWorld:drawWorld, drawIcon:drawIcon };
})();
