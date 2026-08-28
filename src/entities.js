/* ============================================================
   Aphelion · entities.js — 实体工厂 + 绘制 + 玩家 (ADR-3)
   挂载: window.APH.Ent
   统一实体: {id,type,x,y,...} 全部进 APH.state.entities。
   ============================================================ */
window.APH = window.APH || {};

APH.Ent = (function(){
  'use strict';
  var U = APH.U, CFG = APH.CFG, T = CFG.entType;
  var idSeq = 0;
  function nid(prefix){ return prefix + '_' + (++idSeq); }
  /* 渲染上下文延迟绑定(main.boot 时注入) */
  var ctx = null;
  function bindCtx(c){ ctx = c; }

  /* ================= 工厂 ================= */
  function makeRock(x,y,rng){
    var grp = [];
    var n = 1 + Math.floor(rng()*3);
    for(var j=0;j<n;j++) grp.push({
      ox:(rng()*32-16), oy:(rng()*20-10),
      r:7+rng()*10, rot:rng()*U.TAU, sq:.72+rng()*.23,
    });
    return { id:nid('rk'), type:T.ROCK, x:x, y:y, g:grp };
  }
  function makeCrystal(x,y){
    var m = [];
    var n = 2 + Math.floor(Math.random()*3);
    for(var j=0;j<n;j++) m.push({
      ox:Math.random()*28-14, oy:Math.random()*18-9,
      h:14+Math.random()*16, w:6+Math.random()*4,
      lean:Math.random()*.5-.25,
    });
    return { id:nid('cr'), type:T.CRYSTAL, x:x, y:y, m:m, taken:false, ph:Math.random()*U.TAU };
  }
  function makeBeacon(d){
    return { id:d.id, type:T.BEACON, x:d.x, y:d.y,
             name:d.name, lore:d.lore, done:false, ph:Math.random()*U.TAU };
  }
  /* 敌人个体: 阵营基因 ±5% 抖动 */
  function makeEnemy(faction, x, y){
    if(!faction || faction.hp==null){
      faction = (window.APH.Planet && APH.Planet.pickRaidFaction)
        ? APH.Planet.pickRaidFaction(APH.state && APH.state.lastExpedition, (APH.state && APH.state.seed) || 1)
        : { id:'fx_maw', name:'噬光群囊', behavior:'melee_swarm',
            gene:{hue:285,sides:5,limbs:6,size:1.0,spikes:3,eyes:2},
            hp:26, speed:96, dmg:8, nightBoost:1.35 };
    }
    var jit = function(){ return 1 + (Math.random()*.1 - .05); };
    return {
      id:nid('en'), type:T.ENEMY,
      faction:faction,
      x:x, y:y,
      hp:faction.hp * (0.9+Math.random()*.2),
      state:'idle',
      wanderA:Math.random()*U.TAU,
      atkCd:Math.random(),
      walkPh:Math.random()*6,
      geneJit:{ size:jit(), limbs:jit() },
    };
  }

  /* ================= 敌人绘制（形态基因程序化） ================= */
  function drawEnemy(e, time){
    var g = e.faction.gene;
    var s = 11 * g.size * (e.geneJit?e.geneJit.size:1) * (e.isBoss?1.9:1);
    /* Task4: 驻守士兵=友军, 固定暖橙色调与敌人区分 */
    var hue = e.isSoldier ? 30 : g.hue;
    var sat = e.isSoldier ? 75 : 62;
    var step = Math.sin(e.walkPh);
    var col = 'hsl('+hue+','+sat+'%,52%)';
    var colD = 'hsl('+hue+','+(sat-7)+'%,36%)';
    var colL = 'hsl('+hue+','+(sat+8)+'%,66%)';
    var ang = Math.atan2(APH.state.py-e.y, APH.state.px-e.x);

    ctx.save();
    ctx.translate(e.x, e.y);
    /* 影子 */
    ctx.fillStyle='rgba(0,0,0,.32)';
    ctx.beginPath(); ctx.ellipse(1,4,s*1.15,s*.55,0,0,U.TAU); ctx.fill();

    /* N2: 敌人8帧序列帧(idle/move/attack/hurt/death), 士兵不适用 */
    var factionSheet = {fx_maw:'enemy_lighteater', fx_spit:'enemy_acidsplitter',
                        fx_bulwark:'enemy_siloshell'}[e.faction.id]||'';
    var sheetName = e.isSoldier ? '' : factionSheet;
    if (!e.isSoldier && window.APH.Sprites && APH.Sprites.isReady(sheetName)){
      var st;
      if (e.dead)                    st=7;                       // death
      else if (e.hitFlash>0)         st=6;                       // hurt
      else if (e.atkT>0)             st=(Math.floor(time*14)%2)+4; // attack 4-5
      else if (e.moving)             st=(Math.floor(e.walkPh/Math.PI)%2)+2; // move 2-3
      else                           st=Math.floor(time*3)%2;    // idle 0-1
      var sc2 = s*2.9/128 * (e.geneJit?1:1);
      ctx.translate(-s*1.45,-s*2.4);
      APH.Sprites.draw(ctx, sheetName, 0, 0, st, sc2);
      ctx.globalAlpha=1;
      ctx.restore();
      return;
    }

    /* 肢(步态摆动) */
    ctx.strokeStyle=colD; ctx.lineWidth=2.2; ctx.lineCap='round';
    for(var l=0;l<g.limbs;l++){
      var la=(l/g.limbs)*U.TAU + time*0 + ang*.15;
      var sw=Math.sin(e.walkPh + l*1.7)*3.5;
      var lx=Math.cos(la)*(s+4)+sw*Math.cos(la+Math.PI/2),
          ly=Math.sin(la)*(s+3)+sw*Math.sin(la+Math.PI/2);
      ctx.beginPath(); ctx.moveTo(Math.cos(la)*s*.5, Math.sin(la)*s*.5);
      ctx.lineTo(lx, ly); ctx.stroke();
    }
    ctx.rotate(ang);                       // 身体朝向玩家
    /* 尖刺 */
    ctx.fillStyle=colD;
    for(var sp=0; sp<g.spikes; sp++){
      var sa=(sp/g.spikes)*U.TAU;
      ctx.save(); ctx.rotate(sa);
      ctx.beginPath();
      ctx.moveTo(s*.75,-2.4); ctx.lineTo(s*1.42,0); ctx.lineTo(s*.75,2.4);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    /* 身体多边形 */
    var breathe = 1 + Math.sin(time*3+e.walkPh*.3)*.05;
    ctx.beginPath();
    for(var i2=0;i2<=g.sides;i2++){
      var a2=(i2/g.sides)*U.TAU;
      var rr=s*breathe*(i2%2?.82:1.06);
      var px=Math.cos(a2)*rr, py=Math.sin(a2)*rr*.86;
      i2===0?ctx.moveTo(px,py):ctx.lineTo(px,py);
    }
    ctx.closePath();
    var bg=ctx.createRadialGradient(-s*.25,-s*.2,s*.15,0,0,s*1.2);
    bg.addColorStop(0,colL); bg.addColorStop(1,col);
    if(e.state==='flee') bg.addColorStop(1,'hsl('+g.hue+',45%,58%)');
    ctx.fillStyle=bg; ctx.fill();
    /* 状态描边 */
    if(e.state==='alert'||e.state==='chase'){
      ctx.strokeStyle='rgba(255,109,122,.85)'; ctx.lineWidth=1.6; ctx.stroke();
    }else if(e.state==='flee'){
      ctx.strokeStyle='rgba(125,255,171,.7)'; ctx.lineWidth=1.4; ctx.stroke();
    }
    /* Boss 血条+名牌(世界空间, 不随身体旋转) */
    if(e.isBoss){
      ctx.save();
      ctx.rotate(-ang);
      var pct=Math.max(0,e.hp/(e.faction.hp*8+40));
      ctx.fillStyle='rgba(10,12,24,.8)';
      ctx.fillRect(-30,-s-26,60,7);
      ctx.fillStyle=pct>.35?'#ff9a4d':'#ff4d5e';
      ctx.fillRect(-29,-s-25,58*pct,5);
      ctx.fillStyle='#ffd97a';
      ctx.font='bold 9px monospace';
      ctx.textAlign='center';
      ctx.fillText(e.bossName||'BOSS',0,-s-31);
      ctx.restore();
    }
    /* 眼(朝向前方) */
    ctx.fillStyle='#0c1018';
    for(var ey=0;ey<g.eyes;ey++){
      var ea=((ey-(g.eyes-1)/2)/(g.eyes||1))*.8;
      ctx.beginPath();
      ctx.arc(Math.cos(ea)*s*.45, Math.sin(ea)*s*.4, s*.13, 0, U.TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  /* 弹丸绘制 */
  function drawProj(p, time){
    if(p.side === 'player'){
      ctx.save();
      ctx.shadowColor='#59d9ff'; ctx.shadowBlur=9;
      ctx.strokeStyle='#bdeaff'; ctx.lineWidth=2.6; ctx.lineCap='round';
      var vl=Math.sqrt(p.vx*p.vx+p.vy*p.vy)||1;
      ctx.beginPath();
      ctx.moveTo(p.x,p.y);
      ctx.lineTo(p.x-p.vx/vl*10, p.y-p.vy/vl*10);
      ctx.stroke();
      ctx.restore();
    }else{
      ctx.save();
      ctx.shadowColor='#7dff5e'; ctx.shadowBlur=8;
      ctx.fillStyle='#b6ff8f';
      ctx.beginPath(); ctx.arc(p.x,p.y,4.2,0,U.TAU); ctx.fill();
      ctx.restore();
    }
  }

  /* 掉落物绘制: RimWorld 式地上堆, 带名称×数量 */
  function drawDropped(e, time){
    var it=(CFG.items&&CFG.items[e.itemId])||{};
    var col=it.tint||'#ffdf8f';
    var bob=Math.sin(e.bobA||0)*2.2;
    ctx.save();
    ctx.translate(e.x, e.y+bob);
    ctx.fillStyle='rgba(0,0,0,.28)';
    ctx.beginPath(); ctx.ellipse(0,7-bob,9,3.6,0,0,U.TAU); ctx.fill();
    ctx.shadowColor=col; ctx.shadowBlur=6;
    ctx.fillStyle=col;
    ctx.fillRect(-5,-5,10,10);
    ctx.shadowBlur=0;
    ctx.strokeStyle='#2a2418'; ctx.lineWidth=1.2;
    ctx.strokeRect(-5,-5,10,10);
    ctx.restore();
    ctx.save();
    ctx.fillStyle='#f7f3df';
    ctx.font='bold 9px sans-serif'; ctx.textAlign='center';
    ctx.fillText((it.name||'?')+'×'+(e.n||1), e.x, e.y-12+bob);
    ctx.restore();
  }

  /* ================= 原有绘制 ================= */
  function drawRock(e){
    ctx.save(); ctx.translate(e.x,e.y);
    ctx.fillStyle='rgba(0,0,0,.3)';
    ctx.beginPath(); ctx.ellipse(2,5,20,9,0,0,U.TAU); ctx.fill();
    e.g.forEach(function(m){
      ctx.save(); ctx.translate(m.ox,m.oy-m.r*.4); ctx.rotate(m.rot);
      ctx.fillStyle='#39404d';
      ctx.beginPath(); ctx.ellipse(0,0,m.r,m.r*m.sq,0,0,U.TAU); ctx.fill();
      ctx.fillStyle='#4a5262';
      ctx.beginPath(); ctx.ellipse(-m.r*.22,-m.r*.3,m.r*.55,m.r*.4,0,0,U.TAU); ctx.fill();
      ctx.restore();
    });
    ctx.restore();
  }
  function drawCrystal(e,time){
    ctx.save(); ctx.translate(e.x,e.y);
    ctx.fillStyle='rgba(0,0,0,.28)';
    ctx.beginPath(); ctx.ellipse(3,6,18,8,0,0,U.TAU); ctx.fill();
    e.m.forEach(function(m,i){
      var sway=Math.sin(time*1.8+e.ph+i)*1.5;
      ctx.save(); ctx.translate(m.ox,m.oy); ctx.rotate(m.lean+sway*.02);
      ctx.fillStyle='#b3238f';
      ctx.beginPath();
      ctx.moveTo(-m.w/2,0); ctx.lineTo(-m.w*.22,-m.h);
      ctx.lineTo(m.w*.22,-m.h); ctx.lineTo(m.w/2,0);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle='#ff4fd8';
      ctx.beginPath();
      ctx.moveTo(-m.w*.28,0); ctx.lineTo(-m.w*.1,-m.h*.92);
      ctx.lineTo(m.w*.05,-m.h*.92); ctx.lineTo(m.w*.16,0);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    });
    ctx.restore();
  }
  function drawCrystalGlow(e,time){
    e.m.forEach(function(m,i){
      var sway=Math.sin(time*1.8+e.ph+i)*1.5;
      var gx=e.x+m.ox+sway*.3, gy=e.y+m.oy-m.h*.55;
      var gr=ctx.createRadialGradient(gx,gy,0,gx,gy,10);
      gr.addColorStop(0,'rgba(255,215,244,.85)');
      gr.addColorStop(.4,'rgba(255,79,216,.4)');
      gr.addColorStop(1,'rgba(255,79,216,0)');
      ctx.fillStyle=gr; ctx.beginPath(); ctx.arc(gx,gy,10,0,U.TAU); ctx.fill();
    });
  }
  function drawBeacon(e,time){
    var pul = e.done?0:Math.sin(e.ph*2.4)*.5+.5;
    ctx.save(); ctx.translate(e.x,e.y);
    ctx.strokeStyle = e.done?'rgba(125,255,171,.4)':'rgba(255,200,87,'+(.35+pul*.3)+')';
    ctx.lineWidth=2;
    ctx.beginPath(); ctx.ellipse(0,4,30,14,0,0,U.TAU); ctx.stroke();
    ctx.fillStyle='rgba(0,0,0,.32)';
    ctx.beginPath(); ctx.ellipse(2,5,16,8,0,0,U.TAU); ctx.fill();
    ctx.fillStyle='#39435c'; ctx.fillRect(-2.5,-46,5,50);
    ctx.fillStyle='#4c5878'; ctx.fillRect(-2.5,-46,2,50);
    ctx.restore();
  }
  function drawPlayer(e,time){
    var step=Math.sin(e.walkPh), bobbing=e.moving?Math.abs(step)*1.6:.6;
    var s = APH.state;
    ctx.save(); ctx.translate(e.x,e.y);
    var sprOk = window.APH.Sprites && APH.Sprites.isReady('player_walk');
    /* T12 光圈: sprite 脚底锚在原点故圈心贴脚; 程序化小人站原点上方故圈心略偏南 */
    var hx = sprOk ? -3 : 1, hy = sprOk ? 0 : 4;
    if(!s.showMarkerOff){
      var pulse=0.35+0.3*Math.sin(time*3);
      ctx.strokeStyle='rgba(89,217,255,'+(pulse*0.8)+')';
      ctx.lineWidth=2;
      ctx.beginPath(); ctx.ellipse(hx,hy,16+pulse*3,8+pulse*1.5,0,0,U.TAU); ctx.stroke();
    }
    ctx.fillStyle='rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.ellipse(hx,hy,11,5.5,0,0,U.TAU); ctx.fill();
    /* N1: 行走序列帧渲染(2列x4行表; 无图回退程序化小人) */
    if (sprOk && window.APH.Humanoid){
      var ang=(s.face!==undefined)?s.face:Math.PI/2;
      var pose=APH.Humanoid.pose({ moving:!!e.moving, face:ang, walkPh:e.walkPh, time:time, role:'player' });
      var sheet=pose.sheet, frame=pose.frame;
      if(!APH.Sprites.isReady(sheet) && pose.cycle==='idle'){
        sheet='player_walk';
        frame=pose.dir*(APH.CFG.humanoid.walkPerDir||8);
      }
      var defS = APH.Sprites.sheetDef(sheet) || APH.Sprites.sheetDef('player_walk');
      var ch = (defS && defS.contentH) || 211;
      var sc = APH.Humanoid.spriteScale(ch);
      if(s.iFrameT>0 && Math.floor(time*18)%2===0) ctx.globalAlpha=.35;
      APH.Sprites.draw(ctx, sheet, 0, 0, frame, sc);
      ctx.globalAlpha=1;
      ctx.restore();
      return;
    }
    ctx.translate(0,-bobbing);
    /* 受击无敌帧闪烁 */
    if(s.iFrameT>0 && Math.floor(time*18)%2===0) ctx.globalAlpha=.35;
    ctx.fillStyle='#8f99ad';
    if(e.moving){
      ctx.fillRect(-5.5+step*2.4,-6,4.5,7);
      ctx.fillRect(1-step*2.4,-6,4.5,7);
    }else{ ctx.fillRect(-5.5,-6,4.5,7); ctx.fillRect(1,-6,4.5,7); }
    var bg=ctx.createRadialGradient(-3,-14,2,0,-11,13);
    bg.addColorStop(0,'#ffffff'); bg.addColorStop(1,'#cdd6e6');
    ctx.fillStyle=bg;
    ctx.beginPath(); ctx.arc(0,-11,9.5,0,U.TAU); ctx.fill();
    ctx.fillStyle='#eef3fb';
    ctx.beginPath(); ctx.arc(0,-22,7.5,0,U.TAU); ctx.fill();
    var vx=Math.cos(e.face)*3.2, vy=Math.sin(e.face)*2.4;
    ctx.fillStyle='#152238';
    ctx.beginPath(); ctx.arc(vx,-22+vy,4.6,-.6,3.7); ctx.fill();
    ctx.fillStyle='rgba(120,200,255,.65)';
    ctx.beginPath(); ctx.arc(vx-1.2,-23.4+vy,1.5,0,U.TAU); ctx.fill();
    /* 武器(朝向短线) */
    ctx.strokeStyle='#39435c'; ctx.lineWidth=3; ctx.lineCap='round';
    ctx.beginPath();
    ctx.moveTo(Math.cos(e.face)*7,-11+Math.sin(e.face)*5);
    ctx.lineTo(Math.cos(e.face)*16,-11+Math.sin(e.face)*12);
    ctx.stroke();
    /* T12 头顶浮动三角 + 实时屏幕坐标(诊断铁证) */
    if(!s.showMarkerOff){
      ctx.fillStyle='rgba(89,217,255,'+(0.55+0.35*Math.sin(time*4))+')';
      var ty=-38-Math.sin(time*3)*2.5;
      ctx.beginPath();
      ctx.moveTo(0,ty); ctx.lineTo(-5,ty-7); ctx.lineTo(5,ty-7);
      ctx.closePath(); ctx.fill();
      var scrX=Math.round(e.x-s.camX+innerWidth/2),
          scrY=Math.round(e.y-s.camY+innerHeight/2);
      ctx.fillStyle='rgba(89,217,255,.9)';
      ctx.font='bold 10px monospace'; ctx.textAlign='center';
      ctx.fillText('scr('+scrX+','+scrY+')', 0, ty-12);
    }
    ctx.globalAlpha=1;
    ctx.restore();
  }

  /* ================= 建筑绘制 ================= */
  var BLD_COLORS={
    bl_warehouse:'#b8874a', bl_mine:'#7a8aa0', bl_lab:'#59d9ff',
    bl_barracks:'#ff8c42', bl_turret:'#ff6d7a', bl_clinic:'#7dffab',
    bl_farm:'#7a9a4a', bl_pasture:'#c8a882', bl_house:'#b8874a', bl_workshop:'#d4a574',
  };
  function drawBuilding(e,time){
    /* 蓝图(施工中): 金色虚线椭圆+锤子+青色进度环——绝不画成成品 */
    if(e.type===T.BLUEPRINT){
      var bp=e.progress||0;
      var bc=(window.APH.Colony&&APH.Colony.get(e.bid)||{});
      var bcell=bc.cells||[1,1];
      var bw=bcell[0]*CFG.GRID*0.62, bh=bw*0.5;
      ctx.save(); ctx.translate(e.x,e.y);
      ctx.fillStyle='rgba(255,200,87,.10)';
      ctx.beginPath(); ctx.ellipse(0,4,bw,bh,0,0,U.TAU); ctx.fill();
      ctx.strokeStyle='rgba(255,200,87,.85)'; ctx.lineWidth=2;
      ctx.setLineDash([7,6]); ctx.lineDashOffset=-time*14;
      ctx.beginPath(); ctx.ellipse(0,4,bw,bh,0,0,U.TAU); ctx.stroke();
      ctx.setLineDash([]);
      if(bp>0){
        ctx.strokeStyle='#59d9ff'; ctx.lineWidth=3.5;
        ctx.beginPath(); ctx.arc(0,-36,12,-Math.PI/2,-Math.PI/2+bp*U.TAU); ctx.stroke();
        ctx.fillStyle='#59d9ff'; ctx.font='bold 10px monospace'; ctx.textAlign='center';
        ctx.fillText(Math.round(bp*100)+'%', 0, -54);
      }
      /* 锤子: 施工中敲击, 等待到场时悬停 */
      var ham=e.building?Math.abs(Math.sin(time*7))*6:0;
      ctx.strokeStyle='#c4b89e'; ctx.lineWidth=3.5; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(-5,-16+ham); ctx.lineTo(6,-24+ham); ctx.stroke();
      ctx.save(); ctx.translate(8,-25+ham); ctx.rotate(.6);
      ctx.fillStyle='#8fa3cc'; ctx.fillRect(-5,-3.5,10,7);
      ctx.restore();
      ctx.restore();
      return;
    }
    if(e.bid==='bl_rival_base'){
      /* 敌对基地: 暗红堡垒+血条 */
      ctx.save(); ctx.translate(e.x,e.y);
      ctx.fillStyle='rgba(0,0,0,.4)';
      ctx.beginPath(); ctx.ellipse(5,8,52,26,0,0,U.TAU); ctx.fill();
      var g=ctx.createLinearGradient(0,-30,0,22);
      g.addColorStop(0,'#7a3040'); g.addColorStop(1,'#2a1420');
      ctx.fillStyle=g;
      ctx.fillRect(-40,-28,80,52);
      ctx.strokeStyle='rgba(255,109,122,.6)'; ctx.lineWidth=2;
      ctx.strokeRect(-40,-28,80,52);
      /* 塔尖 */
      ctx.fillStyle='#ff6d7a';
      ctx.beginPath(); ctx.moveTo(-14,-28); ctx.lineTo(0,-46); ctx.lineTo(14,-28);
      ctx.closePath(); ctx.fill();
      if((Math.sin(time*3)>0)){ ctx.fillStyle='#ffd97a';
        ctx.beginPath(); ctx.arc(0,-48,2.8,0,U.TAU); ctx.fill(); }
      /* 血条 */
      var pct=Math.max(0,e.hp/e.maxHp);
      ctx.fillStyle='rgba(10,12,24,.75)';
      ctx.fillRect(-32,-58,64,6);
      ctx.fillStyle=pct>.4?'#ff9aa4':'#ff4d5e';
      ctx.fillRect(-31,-57,62*pct,4);
      ctx.restore();
      return;
    }
    if(e.bid==='bl_siege_camp'){
      /* 阶段E 围攻营地: 帐篷+篝火+血条(可被玩家拆) */
      ctx.save(); ctx.translate(e.x,e.y);
      ctx.fillStyle='rgba(0,0,0,.35)';
      ctx.beginPath(); ctx.ellipse(4,10,44,20,0,0,U.TAU); ctx.fill();
      /* 帐篷 */
      ctx.fillStyle='#6e4030';
      ctx.beginPath(); ctx.moveTo(-34,10); ctx.lineTo(0,-26); ctx.lineTo(34,10);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle='rgba(255,140,90,.55)'; ctx.lineWidth=2; ctx.stroke();
      ctx.fillStyle='#2a1812';
      ctx.beginPath(); ctx.moveTo(-9,10); ctx.lineTo(0,-4); ctx.lineTo(9,10);
      ctx.closePath(); ctx.fill();
      /* 篝火(闪烁) */
      var fl=.6+.4*Math.sin(time*8);
      ctx.fillStyle='rgba(255,170,60,'+fl+')';
      ctx.beginPath(); ctx.arc(24,14,4.5,0,U.TAU); ctx.fill();
      /* 血条 */
      var cp=Math.max(0,e.hp/(e.maxHp||1));
      ctx.fillStyle='rgba(10,12,24,.75)';
      ctx.fillRect(-28,-38,56,6);
      ctx.fillStyle=cp>.4?'#ffb35c':'#ff4d5e';
      ctx.fillRect(-27,-37,54*cp,4);
      ctx.restore();
      return;
    }
    if(e.bid==='bl_landing_pad'){
      /* 发射台: 圆台+光环+四角灯 */
      ctx.save(); ctx.translate(e.x,e.y);
      ctx.fillStyle='rgba(0,0,0,.35)';
      ctx.beginPath(); ctx.ellipse(4,6,46,22,0,0,U.TAU); ctx.fill();
      var g=ctx.createRadialGradient(0,-4,6,0,0,38);
      g.addColorStop(0,'#39435c'); g.addColorStop(1,'#242c40');
      ctx.fillStyle=g;
      ctx.beginPath(); ctx.ellipse(0,0,38,30,0,0,U.TAU); ctx.fill();
      ctx.strokeStyle='rgba(255,200,87,'+(.5+.25*Math.sin(time*2))+')';
      ctx.lineWidth=2;
      ctx.beginPath(); ctx.ellipse(0,0,32,25,0,0,U.TAU); ctx.stroke();
      for(var i=0;i<4;i++){
        var a=i*U.TAU/4+.78;
        var lx=Math.cos(a)*34, ly=Math.sin(a)*26;
        ctx.fillStyle=(Math.floor(time*2+i)%2)?'#ffc857':'#5a4a28';
        ctx.beginPath(); ctx.arc(lx,ly,2.6,0,U.TAU); ctx.fill();
      }
      /* 中心 H 标记 */
      ctx.strokeStyle='rgba(255,200,87,.75)'; ctx.lineWidth=2.4;
      ctx.beginPath();
      ctx.moveTo(-7,-7); ctx.lineTo(-7,7); ctx.moveTo(7,-7); ctx.lineTo(7,7);
      ctx.moveTo(-7,0); ctx.lineTo(7,0);
      ctx.stroke();
      ctx.restore();
      return;
    }
    /* M1: 有序列帧的建筑优先 sprite 渲染 */
    if (window.APH.Sprites && APH.Sprites.isReady(e.bid)){
      /* 占位格→地台尺寸; dispH/内容高→显示缩放(治"建筑比人物矮") */
      var cells=(e.def&&e.def.cells)||[1,1];
      var pw=cells[0]*CFG.GRID*0.62, ph=pw*0.5;
      var defS = APH.Sprites.sheetDef(e.bid);
      var contentH=(defS&&defS.contentH)||96;
      var dispH=(e.def&&e.def.dispH)||contentH;
      var sc=dispH/contentH;
      /* 底座平台(动森风: 浅色圆形地台, 保证任何地形上可见) */
      ctx.save(); ctx.translate(e.x,e.y);
      ctx.fillStyle='rgba(247,243,223,.28)';
      ctx.beginPath(); ctx.ellipse(0,6,pw,ph,0,0,U.TAU); ctx.fill();
      ctx.fillStyle='rgba(0,0,0,.32)';
      ctx.beginPath(); ctx.ellipse(3,7,pw*.72,ph*.72,0,0,U.TAU); ctx.fill();
      ctx.restore();
      /* 建成脉冲: builtT 3秒内金色扩散环 */
      if(e.builtT!==undefined && e.builtT<3){
        e.builtT+=0.016;
        var k=e.builtT/3;
        ctx.strokeStyle='rgba(255,200,87,'+(1-k)+')';
        ctx.lineWidth=3;
        ctx.beginPath(); ctx.ellipse(e.x,e.y+4,pw*(0.4+k*0.8),ph*(0.4+k*0.8),0,0,U.TAU); ctx.stroke();
      }
      /* 动作幅度收敛 v2: 只播实测平静的帧(idleFrames, 配准后帧差≤30%),
         未配准合格的 sheet 一律静态帧0——生成帧是独立重画, 循环=上下瞬跳 */
      var total = (defS&&defS.idleFrames) || 1;
      var frame = APH.Sprites.frameAt({fps:2.5, count:total, loop:true}, time);
      /* 环境融合: 不搞透明度——白天原版/深夜降饱和tint版整张切换, 永远全不透明。
         锚点y=e.y+10(地台椭圆中下部); baseline=帧0实测内容底边 → 画稿底边贴地不悬浮 */
      var dL = APH.World.daylight ? APH.World.daylight() : 1;
      var tinted = dL<0.45 ? APH.Sprites.getTinted(e.bid) : null;
      if (tinted){
        var pos2 = APH.Sprites.framePos(defS, frame);
        var base=(defS&&defS.baseline)||0;
        var cw=(defS&&defS.fw)||128;
        var fw2=cw*sc, fh2=cw*sc;
        var topY = base ? (e.y+10)-base*sc : (e.y+10)-fh2*((defS&&defS.anchorY)||0.9);
        ctx.drawImage(tinted, pos2.sx, pos2.sy, cw, cw,
          e.x-fw2/2, topY, fw2, fh2);
      } else {
        APH.Sprites.draw(ctx, e.bid, e.x, e.y+10, frame, sc);
      }
      return;
    }
    /* Task4: 防御炮塔——底座+可旋转炮管 */
    if(e.bid==='bl_turret'){
      ctx.save(); ctx.translate(e.x,e.y);
      ctx.fillStyle='rgba(0,0,0,.32)';
      ctx.beginPath(); ctx.ellipse(3,5,22,11,0,0,U.TAU); ctx.fill();
      /* 底座 */
      var g2=ctx.createRadialGradient(0,-4,4,0,0,20);
      g2.addColorStop(0,'#5a6a80'); g2.addColorStop(1,'#242c40');
      ctx.fillStyle=g2;
      ctx.beginPath(); ctx.arc(0,0,18,0,U.TAU); ctx.fill();
      ctx.strokeStyle='#c4b89e'; ctx.lineWidth=1.6; ctx.stroke();
      /* 炮管(指向 aimA, 开火时后坐) */
      var recoil=(e.fireT&&e.fireT>0)? -4*e.fireT : 0;
      ctx.rotate(e.aimA||0);
      ctx.fillStyle='#19c8b9';
      ctx.fillRect(6+recoil,-3.5,16,7);
      ctx.fillStyle='#0f1420';
      ctx.fillRect(20+recoil,-4.2,4,8.4);
      /* 等级徽点 */
      var lvN=e.lv||1;
      for(var li=0;li<lvN;li++){
        ctx.fillStyle='#ffc857';
        ctx.beginPath(); ctx.arc(-12+li*7,10,2.4,0,U.TAU); ctx.fill();
      }
      ctx.restore();
      return;
    }
    /* 通用建筑(回退): 影子+主体+屋顶灯 */
    var col=BLD_COLORS[e.bid]||'#8fa3cc';
    var sz=(e.def&&e.def.size)||40;
    ctx.save(); ctx.translate(e.x,e.y);
    ctx.fillStyle='rgba(0,0,0,.32)';
    ctx.beginPath(); ctx.ellipse(3,5,sz*.52,sz*.26,0,0,U.TAU); ctx.fill();
    var bg=ctx.createLinearGradient(0,-sz*.45,0,sz*.3);
    bg.addColorStop(0,col); bg.addColorStop(1,'#20283a');
    ctx.fillStyle=bg;
    ctx.beginPath();
    ctx.rect(-sz*.42,-sz*.34,sz*.84,sz*.66);
    ctx.fill();
    ctx.fillStyle='rgba(255,255,255,.14)';
    ctx.fillRect(-sz*.42,-sz*.34,sz*.84,4);
    /* 屋顶警示灯 */
    ctx.fillStyle=(Math.sin(time*3)>0)?'#ffd97a':'#5a4a28';
    ctx.beginPath(); ctx.arc(0,-sz*.42,2.6,0,U.TAU); ctx.fill();
    ctx.restore();
  }

  /* ================= 玩家逻辑 ================= */
  function updatePlayer(dt){
    var s = APH.state, P = CFG.player;
    var ix=0, iy=0;
    if(s.keys.KeyW||s.keys.ArrowUp) iy-=1;
    if(s.keys.KeyS||s.keys.ArrowDown) iy+=1;
    if(s.keys.KeyA||s.keys.ArrowLeft) ix-=1;
    if(s.keys.KeyD||s.keys.ArrowRight) ix+=1;
    if(s.joy.active){ ix+=s.joy.x; iy+=s.joy.y; }
    s.run = !!(s.keys.ShiftLeft||s.keys.ShiftRight);
    var hasKey=(ix!==0||iy!==0);
    if(hasKey) s.target=null;
    var mx=0,my=0;
    if(hasKey){
      var il=Math.sqrt(ix*ix+iy*iy)||1; mx=ix/il; my=iy/il;
    }else if(s.target){
      var tx=s.target.x-s.px, ty=s.target.y-s.py, td=Math.sqrt(tx*tx+ty*ty);
      if(td<7) s.target=null; else { mx=tx/td; my=ty/td; }
    }
    var ml=Math.sqrt(mx*mx+my*my);
    if(ml>1){ mx/=ml; my/=ml; }
    var moving = ml>.01;
    var spd=(s.run?P.runSpeed:P.walkSpeed)*(ml>0?ml:0);
    if(moving){
      s.face=Math.atan2(my,mx);
      s.vx=U.lerp(s.vx,mx*spd,dt*P.accel);
      s.vy=U.lerp(s.vy,my*spd,dt*P.accel);
      s.walkPh+=dt*(s.run?13:8.5);
      if(Math.random()<dt*7) s.parts.push({t:'dust',x:s.px+U.rr(-4,4),y:s.py+U.rr(2,7),life:.55,max:.55});
    }else{
      s.vx*=Math.pow(.0005,dt); s.vy*=Math.pow(.0005,dt);
    }
    var nx=U.clamp(s.px+s.vx*dt,40,CFG.WORLD-40),
        ny=U.clamp(s.py+s.vy*dt,40,CFG.WORLD-40);
    var lakeR=s.spec.terrain.lakeR;
    if(U.dst(nx,ny,CFG.LAKE.x,CFG.LAKE.y)>lakeR-14){ s.px=nx; s.py=ny; }
    else{
      if(U.dst(nx,s.py,CFG.LAKE.x,CFG.LAKE.y)>lakeR-14) s.px=nx;
      if(U.dst(s.px,ny,CFG.LAKE.x,CFG.LAKE.y)>lakeR-14) s.py=ny;
    }
    var pe = findPlayer();
    pe.x=s.px; pe.y=s.py; pe.face=s.face; pe.moving=moving; pe.walkPh=s.walkPh;

    /* 计时器 */
    if(s.fireCd>0) s.fireCd-=dt;
    if(s.iFrameT>0) s.iFrameT-=dt;
    if(s.hurtFlash>0) s.hurtFlash-=dt;
  }
  function findPlayer(){
    return APH.state.entities.find(function(e){ return e.type===T.PLAYER; });
  }

  function drawResident(e,time){
    if(!ctx) return;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.fillStyle='rgba(0,0,0,.28)';
    ctx.beginPath(); ctx.ellipse(0,6,10,5,0,0,U.TAU); ctx.fill();
    var walking=!!e.walking;
    var bob=Math.sin((time||0)*(walking?8:2)+(e.x||0))*(walking?2.2:1.2);
    var ill=e.illness||0;
    var mood=e.mood!=null?e.mood:70;
    ctx.fillStyle=ill>=50?'#6a8a62':(ill>=20?'#a8b07a':'#c8a882');
    ctx.beginPath(); ctx.ellipse(0,-8+bob,7,9,0,0,U.TAU); ctx.fill();
    ctx.fillStyle=mood<40?'#e8c4b0':'#ffe9c4';
    ctx.beginPath(); ctx.arc(0,-18+bob,5.5,0,U.TAU); ctx.fill();
    ctx.fillStyle='#6b4a32';
    ctx.beginPath(); ctx.arc(0,-20+bob,5.5, Math.PI, 0); ctx.fill();
    if(ill>=20){
      ctx.fillStyle='#ff6d7a';
      ctx.font='9px sans-serif'; ctx.textAlign='center';
      ctx.fillText('✚', 11, -22+bob);
    }
    var eatBelow=(CFG.residents&&CFG.residents.eatBelow!=null)?CFG.residents.eatBelow:60;
    if((e.food||100)<eatBelow){
      ctx.fillStyle='#c8e89a';
      ctx.font='9px sans-serif'; ctx.textAlign='center';
      ctx.fillText('🍽', -11, -22+bob);
    }
    if(e.haulCarry && e.haulCarry.itemId){
      var hc=(CFG.items&&CFG.items[e.haulCarry.itemId])||{};
      ctx.fillStyle=hc.tint||'#ffdf8f';
      ctx.fillRect(7,-8+bob,7,7);
      ctx.strokeStyle='#2a2418'; ctx.lineWidth=1;
      ctx.strokeRect(7,-8+bob,7,7);
    }
    if(e.breaking){                          // B: 心情崩溃标记
      ctx.fillStyle='#ff6d7a';
      ctx.font='10px sans-serif'; ctx.textAlign='center';
      ctx.fillText('💢', 0, -30+bob);
    }
    ctx.fillStyle='#f7f3df';
    ctx.font='9px sans-serif'; ctx.textAlign='center';
    ctx.fillText(e.name||'居民', 0, 16);
    ctx.restore();
  }

  function drawVisitor(e,time){
    if(!ctx) return;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.fillStyle='rgba(0,0,0,.28)';
    ctx.beginPath(); ctx.ellipse(0,6,10,5,0,0,U.TAU); ctx.fill();
    var bob=Math.sin((time||0)*2.4+(e.x||0))*1.6;
    ctx.fillStyle='#3d6a6e';
    ctx.beginPath(); ctx.ellipse(0,-8+bob,7,9,0,0,U.TAU); ctx.fill();
    ctx.fillStyle='#c4e8e4';
    ctx.beginPath(); ctx.arc(0,-18+bob,5.5,0,U.TAU); ctx.fill();
    ctx.fillStyle='#1a3a3e';
    ctx.beginPath(); ctx.arc(0,-20+bob,5.5, Math.PI, 0); ctx.fill();
    ctx.fillStyle='#794f27';
    ctx.beginPath(); ctx.ellipse(8,-6+bob,4,5,0.3,0,U.TAU); ctx.fill();
    ctx.fillStyle='#8fd4ff';
    ctx.font='9px sans-serif'; ctx.textAlign='center';
    ctx.fillText(e.name||'过客', 0, 16);
    ctx.fillStyle='#5d6f96';
    ctx.font='8px sans-serif';
    ctx.fillText('过客', 0, 26);
    ctx.restore();
  }

  /* 建筑绘制(殖民地/远征通用) */
    return {
    bindCtx:bindCtx,
    makeRock:makeRock, makeCrystal:makeCrystal, makeBeacon:makeBeacon, makeEnemy:makeEnemy,
    drawRock:drawRock, drawCrystal:drawCrystal, drawCrystalGlow:drawCrystalGlow,
    drawBeacon:drawBeacon, drawPlayer:drawPlayer, drawResident:drawResident, drawVisitor:drawVisitor,
    drawEnemy:drawEnemy, drawProj:drawProj, drawDropped:drawDropped,
    drawBuilding:drawBuilding,
    updatePlayer:updatePlayer, findPlayer:findPlayer,
  };
})();
