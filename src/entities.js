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
    var s = 11 * g.size * (e.geneJit?e.geneJit.size:1);
    var step = Math.sin(e.walkPh);
    var col = 'hsl('+g.hue+',62%,52%)';
    var colD = 'hsl('+g.hue+',55%,36%)';
    var colL = 'hsl('+g.hue+',70%,66%)';
    var ang = Math.atan2(APH.state.py-e.y, APH.state.px-e.x);

    ctx.save();
    ctx.translate(e.x, e.y);
    /* 影子 */
    ctx.fillStyle='rgba(0,0,0,.32)';
    ctx.beginPath(); ctx.ellipse(1,4,s*1.15,s*.55,0,0,U.TAU); ctx.fill();

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

  /* 掉落物绘制 */
  function drawDropped(e, time){
    var bob=Math.sin(e.bobA)*2.5;
    ctx.save();
    ctx.translate(e.x, e.y+bob);
    ctx.fillStyle='rgba(0,0,0,.25)';
    ctx.beginPath(); ctx.ellipse(0,6-bob,8,3.4,0,0,U.TAU); ctx.fill();
    ctx.shadowColor='#ffe28a'; ctx.shadowBlur=7;
    ctx.fillStyle='#ffdf8f';
    ctx.rotate(time*1.4);
    ctx.fillRect(-3.4,-3.4,6.8,6.8);
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
    ctx.fillStyle='rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.ellipse(1,4,11,5.5,0,0,U.TAU); ctx.fill();
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
    ctx.globalAlpha=1;
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

  return {
    bindCtx:bindCtx,
    makeRock:makeRock, makeCrystal:makeCrystal, makeBeacon:makeBeacon, makeEnemy:makeEnemy,
    drawRock:drawRock, drawCrystal:drawCrystal, drawCrystalGlow:drawCrystalGlow,
    drawBeacon:drawBeacon, drawPlayer:drawPlayer,
    drawEnemy:drawEnemy, drawProj:drawProj, drawDropped:drawDropped,
    updatePlayer:updatePlayer, findPlayer:findPlayer,
  };
})();
