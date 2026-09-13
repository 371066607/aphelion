/* ============================================================
   Aphelion · draw.js — 家园与远征的绘制层 (ADR-43)
   挂载: window.APH.Draw
   职责: 把 state 画到画布上 —— 实体绘制表、选中环、划区、蓝图幽灵、
         规划标记、框选矩形、教程箭头、调试标记。
   纯输出: 只读 state 与 CFG, 不改任何东西。
   (drawSelectedRing 原先会在选中者离场时顺手改 s.selectedRid ——
    绘制函数改 state, 一帧画两次就解除两次; 已挪进 syncHomeChrome。)
   ============================================================ */
window.APH = window.APH || {};

APH.Draw = (function(){
  'use strict';
  var U = APH.U, CFG = APH.CFG, T = CFG.entType;

  function vpW(){ var v=APH.World.getViewport(); return (v&&v.w)||window.innerWidth; }
  function vpH(){ var v=APH.World.getViewport(); return (v&&v.h)||window.innerHeight; }
  function viewport(){return {w:vpW(),h:vpH()};}
  function screenOf(x,y){return APH.Camera.toScreen(APH.state,x,y,viewport());}

  function particlesDrawer(dt2,t){
    var ctx2=document.getElementById('cv').getContext('2d');
    var s=APH.state;
    for(var i=0;i<s.parts.length;i++){
      var p=s.parts[i], k=p.life/p.max;
      if(p.t==='dust'){
        ctx2.fillStyle='rgba(180,190,170,'+(k*.4)+')';
        ctx2.beginPath(); ctx2.arc(p.x,p.y-k*6,2.5+k*2,0,U.TAU); ctx2.fill();
      }else if(p.t==='ping'){
        ctx2.strokeStyle='rgba(89,217,255,'+(k*.8)+')'; ctx2.lineWidth=1.5;
        ctx2.beginPath();
        ctx2.ellipse(p.x,p.y,(1-k)*26+4,((1-k)*26+4)*.5,0,0,U.TAU); ctx2.stroke();
      }else if(p.t==='shard'){
        ctx2.fillStyle='hsla('+p.hue+',90%,72%,'+k+')';
        ctx2.fillRect(p.x-1.5,p.y-1.5,3,3);
      }
    }
  }
  function expeditionDrawers(){
    return {
      /* ADR-45: 远征地表上跑的是殖民者, 不是化身 —— 这张表原先根本没有
         resident 项, 所以队员一个都画不出来。 */
      resident:function(e,t){ APH.Ent.drawResident(e,t); },
      rock:function(e,t){ APH.Ent.drawRock(e); },
      crystal:function(e,t){ APH.Ent.drawCrystal(e,t); },
      beacon:function(e,t){ APH.Ent.drawBeacon(e,t); },
      enemy:function(e,t){ APH.Ent.drawEnemy(e,t); },
      projectile:function(e,t){ APH.Ent.drawProj(e,t); },
      dropped:function(e,t){ APH.Ent.drawDropped(e,t); },
      building:function(e,t){ APH.Ent.drawBuilding(e,t); },
      blueprint:function(e,t){ APH.Ent.drawBuilding(e,t); },
      walls:function(t){ APH.Ent.drawWalls(t); },
      particles:particlesDrawer,
      crystalGlow:function(){},
    };
  }
  /* 屏幕空间调试: 视口中心绿圈 + 角色红点(应重合) */
  function drawDebugMark(){
    var s=APH.state;
    if(!s.debugMark) return;
    var cv=document.getElementById('cv'), ctx2=cv.getContext('2d');
    ctx2.setTransform(1,0,0,1,0,0);
    var cx=cv.width/2, cy=cv.height/2;
    ctx2.strokeStyle='#00ff88'; ctx2.lineWidth=2;
    ctx2.beginPath(); ctx2.arc(cx,cy,18,0,Math.PI*2); ctx2.stroke();
    ctx2.beginPath(); ctx2.moveTo(cx-26,cy); ctx2.lineTo(cx+26,cy);
    ctx2.moveTo(cx,cy-26); ctx2.lineTo(cx,cy+26); ctx2.stroke();
  }

  /* ADR-29 征召渲染: 选中环 + 命令旗标 (世界坐标层, 在实体后绘制) */
  function drawSelectedRing(time){
    var s=APH.state;
    if(!s.selectedRid || s.scene!=='home') return;
    var ent=APH.Ent.selectedPawn();
    if(!ent) return;                     /* 选中者已离场; 解除由 syncHomeChrome 负责 */
    var ctx2=document.getElementById('cv').getContext('2d');
    var C=CFG.command||{};
    var ringR=(C.selectedRingR!=null)?C.selectedRingR:22;
    var z=APH.Camera.zoom(s),p=screenOf(ent.x,ent.y+10);
    /* 脚底选中环 (脉动) */
    var pulse=Math.sin(time*4)*.5+.5;
    ctx2.strokeStyle='rgba(89,217,255,'+(0.55+pulse*.4)+')';
    ctx2.lineWidth=2;
    ctx2.beginPath();
    ctx2.ellipse(p.x,p.y,ringR*z,ringR*.42*z,0,0,U.TAU);
    ctx2.stroke();
    /* 命令旗标: 虚线到目标点 */
    var uo=ent.userOrder;
    if(uo && uo.type==='move'){
      ctx2.setLineDash([6,6]);
      ctx2.strokeStyle='rgba(125,255,171,.55)';
      ctx2.beginPath();
      var from=screenOf(ent.x,ent.y+6),to=screenOf(uo.x,uo.y);
      ctx2.moveTo(from.x,from.y);
      ctx2.lineTo(to.x,to.y);
      ctx2.stroke();
      ctx2.setLineDash([]);
      ctx2.strokeStyle='rgba(125,255,171,.9)';
      ctx2.beginPath();
      ctx2.arc(to.x,to.y,(8+pulse*3)*z,0,U.TAU);
      ctx2.stroke();
    }
  }

  /* ADR-28 / Ticket #157: 规划标记悬浮徽章与框选选框渲染 */
  function drawZones(){
    var s=APH.state;
    if(!s || s.scene!=='home') return;
    var zones=s.colony && s.colony.zones;
    if(!zones || !zones.length) return;
    var cv2=document.getElementById('cv');
    if(!cv2 || !cv2.getContext) return;
    var ctx2=cv2.getContext('2d');
    if(!ctx2) return;
    var z=APH.Camera.zoom(s),g=(CFG.GRID||48)*z;
    var sel = s.selectedTarget && s.selectedTarget.type==='zone' && s.selectedTarget.zone;
    zones.forEach(function(z){
      if(!z || (z.type!=='stockpile' && z.type!=='grow')) return;
      var grow=z.type==='grow';
      var col = grow
        ? ((sel && sel.id===z.id) ? 'rgba(125,255,171,0.28)' : 'rgba(125,255,171,0.14)')
        : ((sel && sel.id===z.id) ? 'rgba(255,200,87,0.28)' : 'rgba(255,200,87,0.14)');
      var stroke = grow ? ((sel && sel.id===z.id) ? '#7dffab' : 'rgba(125,255,171,0.55)')
        : ((sel && sel.id===z.id) ? '#ffc857' : 'rgba(255,200,87,0.55)');
      (z.cells||[]).forEach(function(c){
        var p=screenOf(c.x,c.y),sx=p.x,sy=p.y;
        ctx2.fillStyle=col;
        ctx2.fillRect(sx-g/2, sy-g/2, g, g);
        ctx2.strokeStyle=stroke;
        ctx2.lineWidth=1;
        ctx2.strokeRect(sx-g/2+0.5, sy-g/2+0.5, g-1, g-1);
      });
    });
    var filth=s.colony.filth||{};
    Object.keys(filth).forEach(function(k){
      var amt=filth[k]; if(!amt) return;
      var xy=k.split(','); var fx=+xy[0], fy=+xy[1];
      var p=screenOf(fx,fy),sx=p.x,sy=p.y;
      ctx2.fillStyle='rgba(110,70,30,'+Math.min(0.45, amt/80)+')';
      ctx2.beginPath(); ctx2.arc(sx, sy+4, 6, 0, Math.PI*2); ctx2.fill();
    });
    (s.colony.fires||[]).forEach(function(f){
      var p=screenOf(f.x,f.y),sx=p.x,sy=p.y;
      ctx2.fillStyle='rgba(255,120,40,0.7)';
      ctx2.beginPath(); ctx2.arc(sx, sy, 10, 0, Math.PI*2); ctx2.fill();
    });
  }
  function drawPlacementGhost(){
    var s = APH.state;
    if(!s || s.scene!=='home' || !s.buildMode) return;
    if(s.pointerWx==null || s.pointerWy==null) return;
    if(!APH.Colony) return;
    /* Formal construction owns geometry; queued records must remain intact here. */
    var ghost=(APH.Construction&&APH.Construction.ghost)
      ? APH.Construction.ghost(s,s.buildMode,s.pointerWx,s.pointerWy,s.buildRotation||0)
      : (APH.Colony.placementGhost&&APH.Colony.placementGhost(s.buildMode,s.pointerWx,s.pointerWy,
          (s.colony.buildings||[]).concat((s.colony.buildQueue||[]).map(function(q){return q;})),s.meta&&s.meta.tech,s.meta&&s.meta.res,!!s.devFreeBuild));
    if(!ghost) return;
    var cv2=document.getElementById('cv');
    if(!cv2 || !cv2.getContext) return;
    var ctx2=cv2.getContext('2d');
    if(!ctx2) return;
    var rect=(ghost.record&&APH.BuildGrid&&APH.BuildGrid.rectOf)
      ? APH.BuildGrid.rectOf(ghost.record,APH.Colony.list&&APH.Colony.list(),s.colony.scene) : null;
    var center=screenOf(rect?rect.x+rect.w/2:ghost.x,rect?rect.y+rect.h/2:ghost.y);
    var sx=center.x,sy=center.y,z=APH.Camera.zoom(s);
    var ok=!!ghost.ok;
    ctx2.save();
    ctx2.fillStyle=ok?'rgba(89,217,255,0.18)':'rgba(255,80,80,0.22)';
    ctx2.strokeStyle=ok?'#59d9ff':'#ff6d7a';
    ctx2.lineWidth=2;
    ctx2.setLineDash([6,5]);
    var gw=(rect?rect.w:ghost.w)*z,gh=(rect?rect.h:ghost.h)*z;
    ctx2.fillRect(sx-gw/2, sy-gh/2, gw, gh);
    ctx2.strokeRect(sx-gw/2, sy-gh/2, gw, gh);
    ctx2.setLineDash([]);
    var def=(APH.Colony.get&&APH.Colony.get(ghost.bid))||{};
    ctx2.font='12px sans-serif';
    ctx2.textAlign='center';
    ctx2.textBaseline='bottom';
    ctx2.fillStyle=ok?'#c8f0ff':'#ffd0d0';
    ctx2.fillText((ok?'':'✕ ')+(def.name||ghost.bid), sx, sy-gh/2-6);
    if(!ok && ghost.why){
      ctx2.font='11px sans-serif';
      ctx2.fillStyle='#ff9a9a';
      ctx2.fillText(ghost.why, sx, sy+gh/2+16);
    }
    ctx2.restore();
  }
  function drawDesignations(time){
    var s = APH.state;
    if(!s.designations || s.scene !== 'home') return;
    var cv2 = document.getElementById('cv');
    if(!cv2) return;
    var ctx2 = cv2.getContext('2d');
    var pulse = Math.sin(time * 5) * 0.25 + 0.75;

    (s.entities || []).forEach(function(e){
      if(!e || e.dead || !s.designations[e.id]) return;
      var des = s.designations[e.id];
      var icon = des.type === 'chop' ? '🪓' : (des.type === 'mine' ? '⛏' : (des.type === 'haul' ? '✋' : '🔨'));
      var bgCol = des.type === 'deconstruct' ? 'rgba(255,80,80,' + (0.5 * pulse) + ')' : 'rgba(89,217,255,' + (0.45 * pulse) + ')';
      var borderCol = des.type === 'deconstruct' ? '#ff5050' : '#59d9ff';

      /* 世界坐标转屏幕坐标 */
      var p=screenOf(e.x,e.y-28),sx=p.x,sy=p.y;

      ctx2.save();
      ctx2.fillStyle = bgCol;
      ctx2.beginPath();
      ctx2.arc(sx, sy, 10, 0, U.TAU);
      ctx2.fill();
      ctx2.strokeStyle = borderCol;
      ctx2.lineWidth = 1.2;
      ctx2.stroke();

      ctx2.font = '12px sans-serif';
      ctx2.textAlign = 'center';
      ctx2.textBaseline = 'middle';
      ctx2.fillText(icon, sx, sy + 1);
      ctx2.restore();
    });
  }

  function drawOrderDragBox(){
    var s = APH.state;
    if(!s.orderDrag || !s.orderFrom || !s.orderTo) return;
    if(s.scene !== 'home') return;
    var cv2 = document.getElementById('cv');
    if(!cv2) return;
    var ctx2 = cv2.getContext('2d');

    var p0=screenOf(s.orderFrom.x,s.orderFrom.y),p1=screenOf(s.orderTo.x,s.orderTo.y);
    var sx0=p0.x,sy0=p0.y,sx1=p1.x,sy1=p1.y;

    var minX = Math.min(sx0, sx1);
    var maxX = Math.max(sx0, sx1);
    var minY = Math.min(sy0, sy1);
    var maxY = Math.max(sy0, sy1);
    var w = maxX - minX, h = maxY - minY;

    ctx2.save();
    ctx2.fillStyle = 'rgba(89,217,255,0.14)';
    ctx2.fillRect(minX, minY, w, h);
    ctx2.strokeStyle = '#59d9ff';
    ctx2.lineWidth = 1.5;
    ctx2.setLineDash([5, 4]);
    ctx2.strokeRect(minX, minY, w, h);
    ctx2.restore();
  }

  /* ADR-29 / Ticket #162: 小人编队框选矩形渲染 */
  function drawPawnDragBox(){
    var s = APH.state;
    if(!s.pawnDrag || !s.pawnDragStart || !s.pawnDragEnd) return;
    if(s.scene !== 'home') return;
    var cv2 = document.getElementById('cv');
    if(!cv2) return;
    var ctx2 = cv2.getContext('2d');

    var p0=screenOf(s.pawnDragStart.x,s.pawnDragStart.y),p1=screenOf(s.pawnDragEnd.x,s.pawnDragEnd.y);
    var sx0=p0.x,sy0=p0.y,sx1=p1.x,sy1=p1.y;

    var minX = Math.min(sx0, sx1);
    var maxX = Math.max(sx0, sx1);
    var minY = Math.min(sy0, sy1);
    var maxY = Math.max(sy0, sy1);
    var w = maxX - minX, h = maxY - minY;

    ctx2.save();
    ctx2.fillStyle = 'rgba(89,217,255,0.12)';
    ctx2.fillRect(minX, minY, w, h);
    ctx2.strokeStyle = '#59d9ff';
    ctx2.lineWidth = 1.2;
    ctx2.strokeRect(minX, minY, w, h);
    ctx2.restore();
  }

  function drawTutorialArrow(time){
    var s=APH.state;
    if((s.meta.tut||0)<2 || (s.meta.tut||0)>=4 || s.scene!=='home') return;
    var pad=s.entities.find(function(e){return e.type===T.BUILDING&&e.pad;});
    if(!pad) return;
    var ctx2=document.getElementById('cv').getContext('2d');
    var pulse=Math.sin(time*4)*.5+.5;
    /* 玩家→发射台方向的浮动三角 */
    var dx=pad.x-s.px, dy=(pad.y-40)-s.py, L=Math.sqrt(dx*dx+dy*dy)||1;
    var ax=s.px+dx/L*46, ay=s.py+dy/L*46-Math.sin(time*3)*4,p=screenOf(ax,ay);
    ctx2.save();
    ctx2.translate(p.x,p.y);
    ctx2.rotate(Math.atan2(dy,dx));
    ctx2.fillStyle='rgba(255,200,87,'+(0.45+pulse*.5)+')';
    ctx2.beginPath();
    ctx2.moveTo(10,0); ctx2.lineTo(-6,-7); ctx2.lineTo(-6,7);
    ctx2.closePath(); ctx2.fill();
    ctx2.restore();
    /* 距离标签 */
    ctx2.fillStyle='rgba(255,200,87,.75)';
    ctx2.font='10px monospace'; ctx2.textAlign='center';
    ctx2.fillText('发射台 '+Math.round(L)+'m',p.x,p.y+20);
  }

  function homeDrawers(){
    var d = {
      rock:function(e,t){ APH.Ent.drawRock(e); },
      crystal:function(e,t){ APH.Ent.drawCrystal(e,t); },
      beacon:function(e,t){},
      enemy:function(e,t){ APH.Ent.drawEnemy(e,t); },
      projectile:function(e,t){ APH.Ent.drawProj(e,t); },
      dropped:function(e,t){ APH.Ent.drawDropped(e,t); },
      building:function(e,t){ APH.Ent.drawBuilding(e,t); },
      blueprint:function(e,t){ APH.Ent.drawBuilding(e,t); },
      resident:function(e,t){ APH.Ent.drawResident(e,t); },
      visitor:function(e,t){ APH.Ent.drawVisitor(e,t); },
      flora:function(e,t){ APH.Ent.drawFlora(e,t); },
      animal:function(e,t){
        if(!e || e.dead) return;
        var cv=document.getElementById('cv'); if(!cv||!cv.getContext) return;
        var ctx=cv.getContext('2d');
        ctx.save(); ctx.translate(e.x,e.y);
        if(e.wild){
          if(e.warning){ctx.strokeStyle='#e39a67';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,3,25,12,0,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#ffcf85';ctx.font='14px sans-serif';ctx.fillText('!',0,-25);}
          ctx.fillStyle=e.kind==='ridge_guard'?'#9b7961':'#b6b99c';ctx.beginPath();ctx.ellipse(0,-3,16,10,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ded6b4';ctx.beginPath();ctx.ellipse(11,-10,7,9,-.3,0,Math.PI*2);ctx.fill();ctx.fillStyle='#353d36';ctx.fillRect(-9,4,3,8);ctx.fillRect(7,4,3,8);ctx.beginPath();ctx.arc(14,-12,1.5,0,Math.PI*2);ctx.fill();ctx.restore();return;
        }
        ctx.fillStyle='#e8e0d4';
        ctx.beginPath(); ctx.ellipse(0,2,10,7,0,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#333'; ctx.font='10px sans-serif'; ctx.textAlign='center';
        ctx.fillText('🐑', 0, 4);
        ctx.restore();
      },
      corpse:function(e,t){
        if(!e || e.dead) return;
        var ctx=document.getElementById('cv') && document.getElementById('cv').getContext('2d');
        if(!ctx) return;
        ctx.save(); ctx.translate(e.x,e.y);
        ctx.fillStyle='rgba(80,40,40,0.85)';
        ctx.beginPath(); ctx.ellipse(0,4,16,8,0,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#c5a3a3'; ctx.font='10px sans-serif'; ctx.textAlign='center';
        ctx.fillText('☠', 0, 2);
        ctx.restore();
      },
      walls:function(t){ APH.Ent.drawWalls(t); },
      particles:particlesDrawer,
      crystalGlow:function(){},
    };
    return d;
  }

  return {
    particlesDrawer:particlesDrawer, expeditionDrawers:expeditionDrawers,
    homeDrawers:homeDrawers, debugMark:drawDebugMark,
    selectedRing:drawSelectedRing, zones:drawZones, placementGhost:drawPlacementGhost,
    designations:drawDesignations, orderDragBox:drawOrderDragBox,
    pawnDragBox:drawPawnDragBox, tutorialArrow:drawTutorialArrow,
  };
})();
