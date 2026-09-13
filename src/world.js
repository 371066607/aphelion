/* ============================================================
   Aphelion · world.js — 世界生成/地形渲染/昼夜 (ADR-3/4/5)
   挂载: window.APH.World
   从已认可原型 v2_topdown 迁移, 实体改走统一列表 entities[]。
   ============================================================ */
window.APH = window.APH || {};

APH.World = (function(){
  'use strict';
  var U = APH.U, CFG = APH.CFG, Camera=APH.Camera;

  var cv, ctx, VW=0, VH=0, DPR=1;
  /* 地形图块按相机需要生成；大地图不能再开场就把全部 canvas 塞进内存。 */
  var chunks = new Map(), NCHX = 0, NCHY = 0, terrainDesc = null;
  var chunkLimit = 36, chunkHits = 0, chunkMisses = 0;
  var wxParts = [], wxKind = '';          // W4 天气粒子池 (程序化绘制的表现层)
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

  function activeDescriptor(){
    var s=APH.state, TM=APH.TerrainModel;
    if(!TM || !s || s.scene!=='home') return null;
    /* 接场景的人可把描述放到 colony.scene 或 state.worldDescriptor；
       描述缺失时明确退回 legacy，不去碰 CFG.WORLD。 */
    return TM.normalize((s.colony&&s.colony.scene)||s.worldDescriptor);
  }
  function terrainWidth(){ return terrainDesc ? terrainDesc.width : CFG.WORLD; }
  function terrainHeight(){ return terrainDesc ? terrainDesc.height : CFG.WORLD; }
  function terrainLandmarks(){
    if(terrainDesc && APH.TerrainModel) return APH.TerrainModel.landmarks(terrainDesc);
    return { hab:CFG.HAB, lake:CFG.LAKE };
  }
  function descriptorKey(desc){
    if(!desc)return 'expedition';
    return APH.TerrainModel&&APH.TerrainModel.revision?APH.TerrainModel.revision(desc):
      [desc.kind,desc.generation,desc.seed,desc.width,desc.height,desc.grid].join(':');
  }
  function terrainColor(desc,x,y,fallback){
    return desc&&APH.TerrainModel?APH.TerrainModel.regionColor(desc,x,y,fallback):fallback;
  }
  function legacyLake(desc,spec){
    if(desc&&APH.TerrainModel&&APH.TerrainModel.normalize(desc).generation===1)return null;
    var lake=desc&&APH.TerrainModel?APH.TerrainModel.landmarks(desc).lake:CFG.LAKE;
    var radius=desc?lake.r:(spec&&spec.terrain&&spec.terrain.lakeR);
    return {x:lake.x,y:lake.y,r:typeof radius==='number'?radius:CFG.LAKE.r};
  }
  function chunkKey(ci,cj){
    var d=terrainDesc;
    return descriptorKey(d)+':'+ci+':'+cj;
  }
  function cacheChunk(key, chunk){
    if(chunks.has(key)) chunks.delete(key);
    chunks.set(key,chunk);
    while(chunks.size>chunkLimit) chunks.delete(chunks.keys().next().value);
    return chunk;
  }
  function getChunk(ci,cj,pal){
    var key=chunkKey(ci,cj), hit=chunks.get(key);
    if(hit){ chunkHits++; chunks.delete(key); chunks.set(key,hit); return hit; }
    chunkMisses++;
    return cacheChunk(key, paintChunk(ci,cj,pal,terrainDesc));
  }

  /* ---------- 地形分块预渲染（调色板来自 PlanetSpec） ---------- */
  function paintChunk(ci, cj, pal, desc){
    var c = document.createElement('canvas');
    c.width = CFG.CHUNK; c.height = CFG.CHUNK;
    var g = c.getContext('2d');
    var ox = ci*CFG.CHUNK, oy = cj*CFG.CHUNK;
    if(desc && APH.TerrainModel && APH.TerrainModel.isHome(desc)){
      var TM=APH.TerrainModel, g0=Math.floor(ox/desc.grid), g1=Math.ceil((ox+CFG.CHUNK)/desc.grid);
      var h0=Math.floor(oy/desc.grid), h1=Math.ceil((oy+CFG.CHUNK)/desc.grid);
      for(var gy=h0;gy<h1;gy++) for(var gx=g0;gx<g1;gx++){
        var col=terrainColor(desc,(gx+.5)*desc.grid,(gy+.5)*desc.grid,pal.ground1);
        g.fillStyle=col;
        g.fillRect(gx*desc.grid-ox,gy*desc.grid-oy,desc.grid,desc.grid);
      }
      return c;
    }
    g.fillStyle = pal.ground1;
    g.fillRect(0,0,CFG.CHUNK,CFG.CHUNK);
    var lakeR = APH.state.spec.terrain.lakeR;

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
    var marks=terrainLandmarks(), lake=marks.lake;
    var lx = lake.x-ox, ly = lake.y-oy;
    if(lx>-260 && lx<CFG.CHUNK+260 && ly>-260 && ly<CFG.CHUNK+260){
      for(var k=0;k<160;k++){
        var a = U.hash2(ci*193+k,cj*101+k)*U.TAU, rd = lakeR + 6 + U.hash2(k,ci+cj)*80;
        var sx = lake.x+Math.cos(a)*rd-ox, sy = lake.y+Math.sin(a)*rd-oy;
        if(sx<-20||sx>CFG.CHUNK+20||sy<-20||sy>CFG.CHUNK+20) continue;
        g.globalAlpha = .05+U.hash2(k,ci*7+cj)*.11;
        g.fillStyle = rd < lakeR+34 ? '#6b6248' : '#4a4636';
        g.beginPath(); g.ellipse(sx,sy,6+U.hash2(k,ci)*14,4+U.hash2(k,cj)*8,a,0,U.TAU); g.fill();
      }
    }
    /* 砾石草茎 */
    for(var j=0;j<120;j++){
      var px = U.hash2(j*3+ci*11, cj*17)*CFG.CHUNK,
          py = U.hash2(j*5, cj*13+j)*CFG.CHUNK;
      if(U.dst(ox+px,oy+py,lake.x,lake.y) < lakeR) continue;
      if(U.hash2(j,99) > .82){
        g.globalAlpha=.5; g.strokeStyle='#3a4a3e'; g.lineWidth=1.4;
        g.beginPath(); g.moveTo(px,py); g.lineTo(px+(U.hash2(j,ci)*6-3),py-(4+U.hash2(j,cj)*4)); g.stroke();
      }else{
        g.globalAlpha=.35; g.fillStyle = U.hash2(j,7)>.5?'#1a221f':'#39404d';
        g.beginPath(); g.arc(px,py,1+U.hash2(j,ci+cj)*1.4,0,U.TAU); g.fill();
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
    terrainDesc=activeDescriptor();
    NCHX=Math.ceil(terrainWidth()/CFG.CHUNK);
    NCHY=Math.ceil(terrainHeight()/CFG.CHUNK);
    chunks.clear(); chunkHits=0; chunkMisses=0;
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
    var s=APH.state,vp={w:VW,h:VH},z=Camera.zoom(s);
    function hole(wx,wy,r,str){
      var p=Camera.toScreen(s,wx,wy,vp),sx=p.x,sy=p.y,sr=r*z;
      if(sx<-sr||sx>VW+sr||sy<-sr||sy>VH+sr) return;
      var gr = g.createRadialGradient(sx,sy,0,sx,sy,sr);
      gr.addColorStop(0,'rgba(0,0,0,'+str+')'); gr.addColorStop(1,'rgba(0,0,0,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(sx,sy,sr,0,U.TAU); g.fill();
    }
    var marks=terrainLandmarks();
    hole(marks.hab.x, marks.hab.y, 250, 1);
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
      if(b.id==='bl_lamp'){
        /* T9 路灯: 夜间通电才亮(挖大洞); 断电/未接线(b.powered===false)熄灭 */
        if(b.powered !== false && dL < 0.5) hole(b.x, b.y-6, 120, .92);
        hole(b.x, b.y, 70, .45);   // 本体微光(断电也可见轮廓)
        return;
      }
      hole(b.x, b.y, 70, .45);
    });
    /* 暗幕是屏幕层。若沿用世界 transform，缩放/平移会把整张遮罩拖离画布。 */
    ctx.save();
    ctx.setTransform(DPR,0,0,DPR,0,0);
    ctx.drawImage(darkCv,0,0,VW,VH);
    ctx.restore();
  }

  /* ---------- 主渲染入口（main.js 每帧调用） ----------
     ents: 统一实体列表 (ADR-3)。渲染只认 type。 */
  function render(dt, drawEntityFns){
    var s = APH.state, dL = daylight();
    var VW2=VW, VH2=VH;
    var view=Camera.viewport(s,{w:VW2,h:VH2}),z=view.zoom;
    /* 无状态变换: 每帧绝对重算(任何一帧异常都不会累积成画面漂移) */
    function applyWorld(shX,shY){ ctx.setTransform(DPR*z,0,0,DPR*z,
      DPR*(VW2/2-s.camX*z+(shX||0)),DPR*(VH2/2-s.camY*z+(shY||0))); }
    function applyScreen(){ ctx.setTransform(DPR,0,0,DPR,0,0); }

    applyScreen();
    ctx.fillStyle = dL>.5 ? '#141a20' : '#070a16';
    ctx.fillRect(0,0,VW,VH);
    var shX = s.shake>0 ? U.rr(-1,1)*s.shake*4 : 0,
        shY = s.shake>0 ? U.rr(-1,1)*s.shake*4 : 0;
    applyWorld(shX,shY);

    /* 地形块 */
    /* main 接入 worldDescriptor 后无需重新加载模块：每帧检测描述 key。 */
    var nowDesc=activeDescriptor();
    if(descriptorKey(nowDesc)!==descriptorKey(terrainDesc)) buildTerrain();
    var c0x=U.clamp(Math.floor(view.left/CFG.CHUNK),0,NCHX-1),
        c1x=U.clamp(Math.floor(view.right/CFG.CHUNK),0,NCHX-1),
        c0y=U.clamp(Math.floor(view.top/CFG.CHUNK),0,NCHY-1),
        c1y=U.clamp(Math.floor(view.bottom/CFG.CHUNK),0,NCHY-1);
    for(var ci=c0x;ci<=c1x;ci++)
      for(var cj=c0y;cj<=c1y;cj++) ctx.drawImage(getChunk(ci,cj,s.spec.palette), ci*CFG.CHUNK, cj*CFG.CHUNK);

    /* generation 1 水体已经逐格画进地形块；圆湖只属于旧地图与旧远征。 */
    var lake=legacyLake(terrainDesc,s.spec),time=s.clock;
    if(lake){
      var lakeR=lake.r;
      var lg = ctx.createRadialGradient(lake.x,lake.y,10,lake.x,lake.y,lakeR);
      lg.addColorStop(0,'#0f2233'); lg.addColorStop(1,s.spec.palette.water);
      ctx.fillStyle = lg;
      ctx.beginPath(); ctx.arc(lake.x,lake.y,lakeR,0,U.TAU); ctx.fill();
      ctx.save();
      ctx.beginPath(); ctx.arc(lake.x,lake.y,lakeR,0,U.TAU); ctx.clip();
      for(var wv=0;wv<5;wv++){
        var wy = lake.y-lakeR+((time*12+wv*67)%(lakeR*2));
        ctx.strokeStyle='rgba(120,200,240,'+(0.05+wv*.012)+')'; ctx.lineWidth=2;
        ctx.beginPath();
        ctx.moveTo(lake.x-lakeR+20, wy);
        ctx.quadraticCurveTo(lake.x, wy+Math.sin(time+wv)*7, lake.x+lakeR-20, wy);
        ctx.stroke();
      }
      ctx.restore();
    }

    /* 粒子层(地面) */
    drawEntityFns.particles(dt, time);

    /* T2 墙/闸门格层 (ADR-13: 贴地矮块, 实体层之前) */
    if(drawEntityFns.walls) drawEntityFns.walls(time);

    /* 统一实体 Y 排序 (ADR-3) */
    var entityPad=256/z;
    function entityVisible(e){return e&&e.x>=view.left-entityPad&&e.x<=view.right+entityPad&&e.y>=view.top-entityPad&&e.y<=view.bottom+entityPad;}
    /* EntityIndex is deliberately optional: a cold index falls back to the
       canonical list, while a prepared one only narrows render candidates. */
    if(window.APH.EntityIndex&&APH.EntityIndex.prepare)APH.EntityIndex.prepare(s.entities);
    var entityCandidates=(window.APH.EntityIndex&&APH.EntityIndex.queryRect&&
      APH.EntityIndex.queryRect(s.entities,view.left-entityPad,view.top-entityPad,view.right+entityPad,view.bottom+entityPad))||s.entities;
    var sorted = entityCandidates.filter(function(e){ return !e.dead && e.type!=='player'&&entityVisible(e); })
                  .concat([entityCandidates.find(function(e){return e.type==='player'&&entityVisible(e);})])
                  .filter(Boolean)
                  .sort(function(a,b){ return a.y-b.y; });
    sorted.forEach(function(e){ drawEntityFns[e.type] && drawEntityFns[e.type](e, time); });

    /* 孢子 */
    drawSpores(time, dL);

    /* W4 天气: 天色 tint + 雨/雪粒子 (暗幕之下, 与 drawSpores 同层 → 夜暗幕统一压暗) */
    drawWeather(dt, time);

    /* 暗幕 + 发光体重绘 */
    drawDarkness(dL);
    s.entities.forEach(function(e){
      if(!entityVisible(e))return;
      if(e.type==='beacon') drawBeaconGem(e,time);
      else if(e.type==='crystal' && !e.taken) APH.Ent.drawCrystalGlow(e,time);
    });
    drawEmissive(time);

    /* W4 雾: 低透明雾层 (暗幕之上, 与 drawEmissive 同层 → 雾为大气散射, 夜里仍可见) */
    drawFog();

    /* 屏幕空间(绝对重置, 无 restore 依赖) */
    applyScreen();
    ctx.drawImage(vigCv,0,0,VW,VH);
    drawCompass();
  }

  function drawSpores(time,dL){
    var spores = APH.state.spores;
    var view=Camera.viewport(APH.state,{w:VW,h:VH}),pad=20/view.zoom;
    var sporeCol = APH.state.spec.palette.spore;      // '#9fe8c8' → '159,232,200'
    var sr=parseInt(sporeCol.slice(1,3),16),
        sg=parseInt(sporeCol.slice(3,5),16),
        sb=parseInt(sporeCol.slice(5,7),16);
    for(var i=0;i<spores.length;i++){
      var sp = spores[i];
      var sx = sp.x+Math.sin(time*.4+sp.ph)*14, sy = sp.y+Math.cos(time*.3+sp.ph*1.3)*10;
      if(sx<view.left-pad||sx>view.right+pad||sy<view.top-pad||sy>view.bottom+pad) continue;
      var tw = .5+.5*Math.sin(time*1.5+sp.ph*3);
      ctx.fillStyle='rgba('+sr+','+sg+','+sb+','+((0.10+(1-dL)*0.30)*tw)+')';
      ctx.beginPath(); ctx.arc(sx,sy,1.6*sp.s,0,U.TAU); ctx.fill();
    }
  }

  /* ---------- W4 天气粒子/天色 (ADR-15; ADR-11 显式例外: 即时绘制不进 sprite 管线) ----------
     读取 meta.weather.id (W1/W2 写, 缺省晴天); 参数全在 CFG.weather.fx*, 预算受 CFG.caps.wxParticles。
     分层: tint+雨雪在暗幕之下 (与 drawSpores 同层), 雾在暗幕之上 (与 drawEmissive 同层)。 */
  function curWeatherId(){
    var s = APH.state;
    return (s && s.meta && s.meta.weather && s.meta.weather.id) || 'wx_clear';
  }
  function curWxFx(){
    return (APH.Weather && APH.Weather.fxParams) ? APH.Weather.fxParams(curWeatherId()) : null;
  }

  function drawWeather(dt, time){
    var s = APH.state;
    if(!s || !ctx || VW < 1 || VH < 1){ wxParts = []; wxKind = ''; return; }
    if(s.scene !== 'home'){ wxParts = []; wxKind = ''; return; }   // 天气只属于家园场景
    var fx = curWxFx();
    if(!fx){ wxParts = []; wxKind = ''; return; }
    /* 天色 tint: 屏幕空间低透明罩色 (暗幕之下) */
    if(fx.tint && fx.tintA > 0){
      ctx.save();
      ctx.setTransform(DPR,0,0,DPR,0,0);
      ctx.fillStyle = APH.Weather.rgbaOf(fx.tint, fx.tintA);
      ctx.fillRect(0,0,VW,VH);
      ctx.restore();
    }
    /* 雨/雪粒子: 世界空间 (跟相机走) */
    var kind = fx.rain ? 'rain' : (fx.snow ? 'snow' : '');
    if(kind !== wxKind){ wxParts = []; wxKind = kind; }   // 类型切换: 清旧粒子
    if(kind){ stepWx(fx, dt); drawWxParticles(fx, time); }
  }

  /* 雨/雪/溅点步进: 视口内循环, 落地溅点, 预算硬上限 */
  function stepWx(fx, dt){
    var s = APH.state, rain = fx.rain, snow = fx.snow;
    var target = APH.Weather.fxCount(curWeatherId(), VW, VH);
    var cap = (CFG.caps && CFG.caps.wxParticles != null) ? CFG.caps.wxParticles : 240;
    var view=Camera.viewport(s,{w:VW,h:VH}),z=view.zoom;
    var topY = view.top - 40/z;
    var botY = view.bottom + 20/z;
    var leftX = view.left - 60/z;
    var rightX = view.right + 60/z;
    var out = [];
    for(var i=0;i<wxParts.length;i++){
      var p = wxParts[i];
      if(p.kind === 'splash'){
        p.life -= dt;
        if(p.life > 0) out.push(p);
        continue;
      }
      if(p.kind === 'rain'){
        p.x += rain.wind*dt; p.y += rain.speed*dt;
        if(p.y >= botY - rain.splashEdge) pushSplash(out, p, rain, botY);
        if(p.y >= botY - rain.splashEdge || p.y < topY - 80 || p.y > botY + 80
           || p.x < leftX - 100 || p.x > rightX + 100){
          p.x = U.rr(leftX, rightX); p.y = topY - U.rr(0, 40);
        }
        out.push(p);
        continue;
      }
      /* snow: 下落 + 风漂 + 出界回卷 */
      p.x += snow.drift*dt; p.y += snow.fall*dt;
      if(p.y >= botY || p.y < topY - 60 || p.x < leftX - 60 || p.x > rightX + 60){
        p.x = U.rr(leftX, rightX); p.y = topY - U.rr(0, 30);
      }
      out.push(p);
    }
    /* 补粒: 视口目标数 (fxCount 已按 caps 封顶; 溅点计入同一池) */
    while(out.length < target){
      if(rain){
        out.push({ kind:'rain', x:U.rr(leftX, rightX),
                   y:U.rr(topY - 40, botY - 40), ph:Math.random()*U.TAU });
      }else{
        out.push({ kind:'snow', x:U.rr(leftX, rightX),
                   y:U.rr(topY - 30, botY + 20), ph:Math.random()*U.TAU,
                   s:1 + U.rr(-snow.rJit, snow.rJit) });
      }
    }
    while(out.length > cap) out.pop();   // 防溅点击穿预算
    wxParts = out;
  }

  function pushSplash(arr, p, rain, botY){
    arr.push({ kind:'splash', x:p.x, y:botY - rain.splashEdge,
               life:rain.splashLife, maxLife:rain.splashLife, ph:Math.random()*U.TAU });
  }

  function drawWxParticles(fx, time){
    var rain = fx.rain, snow = fx.snow, i, p;
    if(rain){
      var k = rain.len / rain.speed;              // 速度方向摆线斜率
      ctx.strokeStyle = APH.Weather.rgbaOf(rain.col, rain.alpha);
      ctx.lineWidth = rain.lineW;
      for(i=0;i<wxParts.length;i++){
        p = wxParts[i];
        if(p.kind !== 'rain') continue;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - rain.wind*k, p.y - rain.len);
        ctx.stroke();
      }
    }
    if(snow){
      ctx.fillStyle = APH.Weather.rgbaOf(snow.col, snow.alpha);
      for(i=0;i<wxParts.length;i++){
        p = wxParts[i];
        if(p.kind !== 'snow') continue;
        var sx = p.x + Math.sin(time*snow.swayFreq + p.ph)*snow.swayAmp;   // 飘落摆动
        ctx.beginPath();
        ctx.arc(sx, p.y, Math.max(0.4, snow.r*p.s), 0, U.TAU);
        ctx.fill();
      }
    }
    if(rain){
      for(i=0;i<wxParts.length;i++){
        p = wxParts[i];
        if(p.kind !== 'splash') continue;
        var t = p.life / p.maxLife;
        ctx.fillStyle = APH.Weather.rgbaOf(rain.col, rain.alpha*t);
        for(var d=0; d<rain.splashDots; d++){
          var ang = p.ph + d*(U.TAU/rain.splashDots);
          var dist = (1 - t)*rain.splashR*2;
          ctx.beginPath();
          ctx.arc(p.x + Math.cos(ang)*dist, p.y + Math.sin(ang)*dist*0.6,
                  rain.splashR*(0.4 + 0.6*t), 0, U.TAU);
          ctx.fill();
        }
      }
    }
  }

  /* 雾: 低透明雾层 + 视口边缘渐隐 (中心均匀, 靠边淡出) */
  function drawFog(){
    var s = APH.state;
    if(!s || !ctx || VW < 1 || VH < 1) return;
    if(s.scene !== 'home') return;
    var fx = curWxFx();
    if(!fx || !(fx.fogA > 0) || !fx.tint) return;
    var fog = (CFG.weather && CFG.weather.fxFog) || { edgeFrac: 0.22 };
    ctx.save();
    ctx.setTransform(DPR,0,0,DPR,0,0);
    var cx = VW/2, cy = VH/2;
    var r1 = Math.sqrt(VW*VW + VH*VH)/2;          // 角距: 覆盖全视口
    var r0 = r1*(1 - fog.edgeFrac);
    var gr = ctx.createRadialGradient(cx,cy,0,cx,cy,r1);
    gr.addColorStop(0, APH.Weather.rgbaOf(fx.tint, fx.fogA));
    gr.addColorStop(U.clamp(r0/r1, 0, 1), APH.Weather.rgbaOf(fx.tint, fx.fogA));
    gr.addColorStop(1, APH.Weather.rgbaOf(fx.tint, 0));
    ctx.fillStyle = gr;
    ctx.fillRect(0,0,VW,VH);
    ctx.restore();
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
    var H = terrainLandmarks().hab;
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

  /* 边缘罗盘：最近未扫描信标; 雷达科技加晶体/敌基地 */
  function drawCompass(){
    var s = APH.state;
    var marks=[];
    var best=null, bd=1e9;
    s.entities.forEach(function(e){
      if(e.type!=='beacon'||e.done) return;
      var d=U.dst(e.x,e.y,s.px,s.py);
      if(d<bd){bd=d;best=e;}
    });
    if(best) marks.push({e:best, col:'#ffc857', dist:bd});
    var radar=s.meta && s.meta.tech && s.meta.tech.te_radar;
    if(radar && s.scene==='expedition'){
      var cBest=null, cd=1e9, rBest=null, rd=1e9;
      s.entities.forEach(function(e){
        if(e.type==='crystal' && !e.taken){
          var d=U.dst(e.x,e.y,s.px,s.py);
          if(d<cd){ cd=d; cBest=e; }
        }
        if(e.type==='building' && e.bid==='bl_rival_base' && !e.dead){
          var d2=U.dst(e.x,e.y,s.px,s.py);
          if(d2<rd){ rd=d2; rBest=e; }
        }
      });
      if(cBest) marks.push({e:cBest, col:'#ff4fd8', dist:cd});
      if(rBest) marks.push({e:rBest, col:'#ff6d7a', dist:rd});
    }
    var VW2=VW, VH2=VH, vp={w:VW2,h:VH2};
    marks.forEach(function(m, i){
      var e=m.e;
      var pos=Camera.toScreen(s,e.x,e.y,vp),sx=pos.x,sy=pos.y;
      if(sx>60&&sx<VW2-60&&sy>70&&sy<VH2-70) return;
      var cx=U.clamp(sx,46+i*18,VW2-46), cy=U.clamp(sy,84,VH2-96);
      var ang=Math.atan2(sy-VH2/2,sx-VW2/2);
      ctx.save(); ctx.translate(cx,cy); ctx.rotate(ang);
      ctx.fillStyle=m.col;
      ctx.shadowColor=m.col; ctx.shadowBlur=8;
      ctx.beginPath(); ctx.moveTo(12,0);ctx.lineTo(-6,-8);ctx.lineTo(-2,0);ctx.lineTo(-6,8);
      ctx.closePath(); ctx.fill();
      ctx.shadowBlur=0; ctx.rotate(-ang);
      ctx.fillStyle=m.col; ctx.font='10px sans-serif'; ctx.textAlign='center';
      ctx.fillText(Math.round(m.dist/10)+'m',0,22);
      ctx.restore();
    });
  }

  return {
    initCanvas:initCanvas, buildTerrain:buildTerrain,
    daylight:daylight, drawDarkness:drawDarkness, render:render,
    drawWeather:drawWeather, drawFog:drawFog,
    terrainColor:terrainColor, legacyLake:legacyLake,
    wxCount:function(){ return wxParts.length; },
    getViewport:function(){ return {w:VW,h:VH}; },
    stats:function(){ return { cacheSize:chunks.size, cacheLimit:chunkLimit, hits:chunkHits, misses:chunkMisses,
      chunksPerAxis:NCHX, chunksX:NCHX, chunksY:NCHY,
      width:terrainWidth(), height:terrainHeight(), descriptor:terrainDesc }; },
  };
})();
