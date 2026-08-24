/* ============================================================
   Aphelion · world.js — 世界生成/地形渲染/昼夜 (ADR-3/4/5)
   挂载: window.APH.World
   从已认可原型 v2_topdown 迁移, 实体改走统一列表 entities[]。
   ============================================================ */
window.APH = window.APH || {};

APH.World = (function(){
  'use strict';
  var U = APH.U, CFG = APH.CFG;

  var cv, ctx, VW=0, VH=0, DPR=1;
  var chunks = [], NCH = 0;
  var vigCv = document.createElement('canvas');
  var darkCv = document.createElement('canvas'), darkCtx = darkCv.getContext('2d');

  /* ---------- 初始化画布 ---------- */
  function initCanvas(){
    cv = document.getElementById('cv');
    ctx = cv.getContext('2d');
    resize();
    addEventListener('resize', resize);
  }
  function resize(){
    DPR = Math.min(window.devicePixelRatio||1, 2);
    /* 可视区域测量: rect 无效(未布局/被CSS约束)时回退 innerWidth */
    var rect = null;
    try{ if(cv.getBoundingClientRect) rect = cv.getBoundingClientRect(); }catch(e){}
    var rw = (rect && rect.width>320) ? Math.round(rect.width) : window.innerWidth;
    var rh = (rect && rect.height>240) ? Math.round(rect.height) : window.innerHeight;
    VW = Math.max(320, rw); VH = Math.max(240, rh);
    cv.width = VW*DPR; cv.height = VH*DPR;
    /* CSS: 让canvas始终铺满视口(不用inline固定像素, 避免300x150默认值污染) */
    cv.style.width = '100vw'; cv.style.height = '100vh';
    ctx.setTransform(DPR,0,0,DPR,0,0);
    buildVignette();
  }
  function buildVignette(){
    vigCv.width = VW; vigCv.height = VH;
    var g = vigCv.getContext('2d');
    var gr = g.createRadialGradient(VW/2,VH/2,Math.min(VW,VH)*.42, VW/2,VH/2,Math.max(VW,VH)*.72);
    gr.addColorStop(0,'rgba(4,6,14,0)');
    gr.addColorStop(1,'rgba(4,6,14,.55)');
    g.fillStyle = gr; g.fillRect(0,0,VW,VH);
  }

  /* ---------- 地形分块预渲染（调色板来自 PlanetSpec） ---------- */
  function paintChunk(ci, cj, pal){
    var c = document.createElement('canvas');
    c.width = CFG.CHUNK; c.height = CFG.CHUNK;
    var g = c.getContext('2d');
    var ox = ci*CFG.CHUNK, oy = cj*CFG.CHUNK;
    var lakeR = APH.state.spec.terrain.lakeR;
    g.fillStyle = pal.ground1;
    g.fillRect(0,0,CFG.CHUNK,CFG.CHUNK);

    for(var i=0;i<340;i++){
      var wx = U.hash2(ci*77+i, cj*31+i*3)*CFG.CHUNK,
          wy = U.hash2(ci*13+i*7, cj*91+i)*CFG.CHUNK;
      var vn = U.vnoise((ox+wx)*.006, (oy+wy)*.006);
      g.globalAlpha = .16 + U.hash2(i,ci+cj)*.14;
      g.fillStyle = vn>.62 ? pal.ground2 : (vn>.47 ? shade(pal.ground1, 8) : pal.ground1);
      if(vn < .3) g.fillStyle = shade(pal.ground1, -6);
      g.beginPath();
      g.ellipse(wx,wy,10+U.hash2(i,1)*34,8+U.hash2(i,2)*26,U.hash2(i,3)*U.TAU,0,U.TAU);
      g.fill();
    }
    /* 湖岸沙环 */
    var lx = APH.CFG.LAKE.x-ox, ly = APH.CFG.LAKE.y-oy;
    if(lx>-260 && lx<CFG.CHUNK+260 && ly>-260 && ly<CFG.CHUNK+260){
      for(var k=0;k<160;k++){
        var a = Math.random()*U.TAU, rd = lakeR + 6 + Math.random()*80;
        var sx = APH.CFG.LAKE.x+Math.cos(a)*rd-ox, sy = APH.CFG.LAKE.y+Math.sin(a)*rd-oy;
        if(sx<-20||sx>CFG.CHUNK+20||sy<-20||sy>CFG.CHUNK+20) continue;
        g.globalAlpha = .05+Math.random()*.11;
        g.fillStyle = rd < lakeR+34 ? '#6b6248' : '#4a4636';
        g.beginPath(); g.ellipse(sx,sy,6+Math.random()*14,4+Math.random()*8,a,0,U.TAU); g.fill();
      }
    }
    /* 砾石草茎 */
    for(var j=0;j<120;j++){
      var px = U.hash2(j*3+ci*11, cj*17)*CFG.CHUNK,
          py = U.hash2(j*5, cj*13+j)*CFG.CHUNK;
      if(U.dst(ox+px,oy+py,APH.CFG.LAKE.x,APH.CFG.LAKE.y) < lakeR) continue;
      if(U.hash2(j,99) > .82){
        g.globalAlpha=.5; g.strokeStyle='#3a4a3e'; g.lineWidth=1.4;
        g.beginPath(); g.moveTo(px,py); g.lineTo(px+(Math.random()*6-3),py-(4+Math.random()*4)); g.stroke();
      }else{
        g.globalAlpha=.35; g.fillStyle = U.hash2(j,7)>.5?'#1a221f':'#39404d';
        g.beginPath(); g.arc(px,py,1+Math.random()*1.4,0,U.TAU); g.fill();
      }
    }
    g.globalAlpha = 1;
    return c;
  }
  /* 颜色微调工具: hex → 明暗 ±n */
  function shade(hex, n){
    var r = parseInt(hex.slice(1,3),16)+n, g2 = parseInt(hex.slice(3,5),16)+n,
        b = parseInt(hex.slice(5,7),16)+n;
    return 'rgb('+U.clamp(r,0,255)+','+U.clamp(g2,0,255)+','+U.clamp(b,0,255)+')';
  }

  function buildTerrain(){
    NCH = CFG.WORLD / CFG.CHUNK;
    chunks = [];
    var pal = APH.state.spec.palette;
    for(var ci=0;ci<NCH;ci++){
      chunks.push([]);
      for(var cj=0;cj<NCH;cj++) chunks[ci].push(paintChunk(ci,cj,pal));
    }
  }

  /* ---------- 昼夜 ---------- */
  function daylight(){
    return U.clamp(Math.sin((APH.state.clock / CFG.DAY_LEN % 1) * U.TAU) * 1.7 + .38, 0, 1);
  }

  /* ---------- 夜景暗幕 + 光源挖洞 ---------- */
  function drawDarkness(dL){
    var na = 1 - dL;
    if(na < .02) return;
    darkCv.width = VW; darkCv.height = VH;
    var g = darkCtx;
    g.clearRect(0,0,VW,VH);
    g.fillStyle = 'rgba(5,8,26,' + (na*.82) + ')';
    g.fillRect(0,0,VW,VH);
    g.globalCompositeOperation = 'destination-out';
    function hole(wx,wy,r,str){
      var sx = wx - APH.state.camX + VW/2, sy = wy - APH.state.camY + VH/2;
      if(sx<-r||sx>VW+r||sy<-r||sy>VH+r) return;
      var gr = g.createRadialGradient(sx,sy,0,sx,sy,r);
      gr.addColorStop(0,'rgba(0,0,0,'+str+')'); gr.addColorStop(1,'rgba(0,0,0,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(sx,sy,r,0,U.TAU); g.fill();
    }
    hole(CFG.HAB.x, CFG.HAB.y, 250, 1);
    hole(APH.state.px, APH.state.py, 95, .95);
    hole(APH.state.px + Math.cos(APH.state.face)*70,
         APH.state.py + Math.sin(APH.state.face)*70 - 10, 75, .8);
    APH.state.entities.forEach(function(e){
      if(e.type === 'beacon') hole(e.x, e.y-40, e.done?90:135, e.done?.6:1);
      else if(e.type === 'crystal' && !e.taken) hole(e.x, e.y-8, 42, .5);
    });
    g.globalCompositeOperation = 'source-over';

    /* Task5+: 建筑自带微光(夜间可见) */
    (s.colony? s.colony.buildings : []).forEach(function(b){
      if(b.id==='bl_landing_pad') return;
      hole(b.x, b.y, 70, .45);
    });
    ctx.drawImage(darkCv, 0, 0, VW, VH);
  }

  /* ---------- 主渲染入口（main.js 每帧调用） ----------
     ents: 统一实体列表 (ADR-3)。渲染只认 type。 */
  function render(dt, drawEntityFns){
    var s = APH.state, dL = daylight();
    var VW2=VW, VH2=VH;
    /* 无状态变换: 每帧绝对重算(任何一帧异常都不会累积成画面漂移) */
    function applyWorld(){ ctx.setTransform(DPR,0,0,DPR,
      DPR*(VW2/2 - s.camX), DPR*(VH2/2 - s.camY)); }
    function applyScreen(){ ctx.setTransform(DPR,0,0,DPR,0,0); }

    applyScreen();
    ctx.fillStyle = dL>.5 ? '#141a20' : '#070a16';
    ctx.fillRect(0,0,VW,VH);
    var shX = s.shake>0 ? U.rr(-1,1)*s.shake*4 : 0,
        shY = s.shake>0 ? U.rr(-1,1)*s.shake*4 : 0;
    applyWorld();
    ctx.translate(shX,shY);

    /* 地形块 */
    var c0x=U.clamp(Math.floor((s.camX-VW/2)/CFG.CHUNK),0,NCH-1),
        c1x=U.clamp(Math.floor((s.camX+VW/2)/CFG.CHUNK),0,NCH-1),
        c0y=U.clamp(Math.floor((s.camY-VH/2)/CFG.CHUNK),0,NCH-1),
        c1y=U.clamp(Math.floor((s.camY+VH/2)/CFG.CHUNK),0,NCH-1);
    for(var ci=c0x;ci<=c1x;ci++)
      for(var cj=c0y;cj<=c1y;cj++) ctx.drawImage(chunks[ci][cj], ci*CFG.CHUNK, cj*CFG.CHUNK);

    /* 湖面 */
    var lakeR = s.spec.terrain.lakeR, time = s.clock;
    var lg = ctx.createRadialGradient(CFG.LAKE.x,CFG.LAKE.y,10, CFG.LAKE.x,CFG.LAKE.y,lakeR);
    lg.addColorStop(0,'#0f2233'); lg.addColorStop(1,s.spec.palette.water);
    ctx.fillStyle = lg;
    ctx.beginPath(); ctx.arc(CFG.LAKE.x,CFG.LAKE.y,lakeR,0,U.TAU); ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.arc(CFG.LAKE.x,CFG.LAKE.y,lakeR,0,U.TAU); ctx.clip();
    for(var wv=0;wv<5;wv++){
      var wy = CFG.LAKE.y-lakeR+((time*12+wv*67)%(lakeR*2));
      ctx.strokeStyle='rgba(120,200,240,'+(0.05+wv*.012)+')'; ctx.lineWidth=2;
      ctx.beginPath();
      ctx.moveTo(CFG.LAKE.x-lakeR+20, wy);
      ctx.quadraticCurveTo(CFG.LAKE.x, wy+Math.sin(time+wv)*7, CFG.LAKE.x+lakeR-20, wy);
      ctx.stroke();
    }
    ctx.restore();

    /* 粒子层(地面) */
    drawEntityFns.particles(dt, time);

    /* 统一实体 Y 排序 (ADR-3) */
    var sorted = s.entities.filter(function(e){ return !e.dead && e.type!=='player'; })
                  .concat([s.entities.find(function(e){return e.type==='player'})])
                  .filter(Boolean)
                  .sort(function(a,b){ return a.y-b.y; });
    sorted.forEach(function(e){ drawEntityFns[e.type] && drawEntityFns[e.type](e, time); });

    /* 孢子 */
    drawSpores(time, dL);

    /* 暗幕 + 发光体重绘 */
    drawDarkness(dL);
    s.entities.forEach(function(e){
      if(e.type==='beacon') drawBeaconGem(e,time);
      else if(e.type==='crystal' && !e.taken) APH.Ent.drawCrystalGlow(e,time);
    });
    drawEmissive(time);

    /* 屏幕空间(绝对重置, 无 restore 依赖) */
    applyScreen();
    ctx.drawImage(vigCv,0,0,VW,VH);
    drawCompass();
  }

  function drawSpores(time,dL){
    var spores = APH.state.spores;
    var sporeCol = APH.state.spec.palette.spore;      // '#9fe8c8' → '159,232,200'
    var sr=parseInt(sporeCol.slice(1,3),16),
        sg=parseInt(sporeCol.slice(3,5),16),
        sb=parseInt(sporeCol.slice(5,7),16);
    for(var i=0;i<spores.length;i++){
      var sp = spores[i];
      var sx = sp.x+Math.sin(time*.4+sp.ph)*14, sy = sp.y+Math.cos(time*.3+sp.ph*1.3)*10;
      if(Math.abs(sx-APH.state.camX)>innerWidth/2+20||Math.abs(sy-APH.state.camY)>innerHeight/2+20) continue;
      var tw = .5+.5*Math.sin(time*1.5+sp.ph*3);
      ctx.fillStyle='rgba('+sr+','+sg+','+sb+','+((0.10+(1-dL)*0.30)*tw)+')';
      ctx.beginPath(); ctx.arc(sx,sy,1.6*sp.s,0,U.TAU); ctx.fill();
    }
  }

  /* 信标顶部宝石 + 光柱（暗幕之上） */
  function drawBeaconGem(b,time){
    var gy = b.y-50;
    var pul = b.done ? .55 : Math.sin(b.ph*2.4)*.5+.5;
    if(!b.done){
      var lg = ctx.createLinearGradient(0,gy-150,0,gy+8);
      lg.addColorStop(0,'rgba(255,200,87,0)');
      lg.addColorStop(1,'rgba(255,200,87,'+(0.08+pul*.06)+')');
      ctx.fillStyle=lg; ctx.fillRect(b.x-9,gy-130,18,138);
    }
    var col = b.done?'#7dffab':'#ffc857';
    ctx.save(); ctx.translate(b.x,gy); ctx.rotate(time*.9);
    ctx.shadowColor=col; ctx.shadowBlur=16; ctx.fillStyle=col;
    ctx.beginPath(); ctx.moveTo(0,-9);ctx.lineTo(7,0);ctx.lineTo(0,9);ctx.lineTo(-7,0);
    ctx.closePath(); ctx.fill();
    ctx.shadowBlur=0; ctx.restore();
  }

  /* 居住舱暖光池 + 舷窗（暗幕之上） */
  function drawEmissive(time){
    var H = CFG.HAB;
    var g = ctx.createRadialGradient(H.x,H.y,10,H.x,H.y,120);
    g.addColorStop(0,'rgba(255,233,196,'+(0.16+Math.sin(time*1.2)*.03)+')');
    g.addColorStop(1,'rgba(255,233,196,0)');
    ctx.fillStyle=g;
    ctx.beginPath(); ctx.ellipse(H.x,H.y+6,120,84,0,0,U.TAU); ctx.fill();
    for(var i=0;i<5;i++){
      var a=i/U.TAU*5+.5;
      var wx=H.x+Math.cos(a)*40, wy=H.y+Math.sin(a)*30-6;
      ctx.fillStyle='#ffe9c4';
      ctx.beginPath(); ctx.arc(wx,wy,3.2,0,U.TAU); ctx.fill();
    }
    ctx.fillStyle=(Math.sin(time*3)>.4)?'#7dffab':'#2a4a35';
    ctx.beginPath(); ctx.arc(H.x-30,H.y-34,3.4,0,U.TAU); ctx.fill();
  }

  /* 边缘罗盘：最近未扫描信标 */
  function drawCompass(){
    var s = APH.state, best=null, bd=1e9;
    s.entities.forEach(function(e){
      if(e.type!=='beacon'||e.done) return;
      var d=U.dst(e.x,e.y,s.px,s.py);
      if(d<bd){bd=d;best=e;}
    });
    if(!best) return;
    var VW2=innerWidth, VH2=innerHeight;
    var sx=best.x-s.camX+VW2/2, sy=best.y-s.camY+VH2/2;
    if(sx>60&&sx<VW2-60&&sy>70&&sy<VH2-70) return;
    var cx=U.clamp(sx,46,VW2-46), cy=U.clamp(sy,84,VH2-96);
    var ang=Math.atan2(best.y-s.py,best.x-s.px);
    ctx.save(); ctx.translate(cx,cy); ctx.rotate(ang);
    ctx.fillStyle='rgba(255,200,87,.9)';
    ctx.shadowColor='#ffc857'; ctx.shadowBlur=8;
    ctx.beginPath(); ctx.moveTo(12,0);ctx.lineTo(-6,-8);ctx.lineTo(-2,0);ctx.lineTo(-6,8);
    ctx.closePath(); ctx.fill();
    ctx.shadowBlur=0; ctx.rotate(-ang);
    ctx.fillStyle='#ffc857'; ctx.font='10px sans-serif'; ctx.textAlign='center';
    ctx.fillText(Math.round(bd/10)+'m',0,22);
    ctx.restore();
  }

  return {
    initCanvas:initCanvas, buildTerrain:buildTerrain,
    daylight:daylight, render:render,
    getViewport:function(){ return {w:VW,h:VH}; },
  };
})();
