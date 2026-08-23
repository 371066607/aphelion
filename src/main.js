/* ============================================================
   Aphelion · main.js — 全局状态 / 输入 / 游戏循环 / 启动
   挂载: window.APH.state · APH.Main
   加载顺序(ADR-7, build.py 声明): config→utils→save→planet→world
                                  →entities→ui→main
   ============================================================ */
window.APH = window.APH || {};

(function(){
  'use strict';
  var U=APH.U, CFG=APH.CFG, T=CFG.entType;

  /* ================= 全局状态（唯一实例） ================= */
  APH.state = {
    mode:'intro',                // intro | running | dead | won
    clock:0,
    spec:null,                   // 当前 PlanetSpec (ADR-1)
    px:0, py:0, vx:0, vy:0,
    face:-Math.PI/2, walkPh:0, moving:false, run:false,
    o2:100, cry:0, found:0, totalBeacons:6,
    camX:0, camY:0, shake:0,
    target:null,
    keys:{}, joy:{active:false,id:null,x:0,y:0},
    entities:[],                 // 统一实体列表 (ADR-3)
    parts:[],                    // 粒子(表现层，不入实体列表)
    spores:[],
    nearBeacon:null,
    scanning:null, scanT:0,
    seed:0,
  };

  /* ================= 世界搭建 ================= */
  function buildWorld(seed){
    var s = APH.state;
    var planet = APH.Planet.fallbackPlanet(seed);
    /* 存档: 有缓存用缓存, 否则写入 */
    var cached = APH.Save.loadPlanet(planet.id);
    if(cached){ planet = cached; }
    else{ APH.Save.savePlanet(planet.id, planet); }
    s.spec = planet;
    s.seed = planet.seed;
    s.totalBeacons = planet.beacons.length;

    /* 统一实体列表 (ADR-3) */
    s.entities = [];
    s.entities.push({ id:'player', type:T.PLAYER, x:CFG.HAB.x, y:CFG.HAB.y+70 });
    s.px = CFG.HAB.x; s.py = CFG.HAB.y+70;
    s.camX = s.px; s.camY = s.py;

    var rng = U.makeRng(seed ^ 0x9E3779B9);   // 地形装饰独立子流
    var placedR=0, guard=0;
    while(placedR < CFG.caps.rocks && guard++ < 500){
      var rx = rng()*(CFG.WORLD-120)+60, ry = rng()*(CFG.WORLD-120)+60;
      if(U.dst(rx,ry,CFG.HAB.x,CFG.HAB.y)<140) continue;
      if(U.dst(rx,ry,CFG.LAKE.x,CFG.LAKE.y)<planet.terrain.lakeR+40) continue;
      if(planet.beacons.some(function(b){ return U.dst(rx,ry,b.x,b.y)<90; })) continue;
      s.entities.push(APH.Ent.makeRock(rx,ry,rng));
      placedR++;
    }
    var placedC=0; guard=0;
    while(placedC < Math.floor(CFG.caps.crystals*planet.terrain.crystalDensity) && guard++ < 500){
      var cx = rng()*(CFG.WORLD-140)+70, cy = rng()*(CFG.WORLD-140)+70;
      if(U.dst(cx,cy,CFG.HAB.x,CFG.HAB.y)<150) continue;
      if(U.dst(cx,cy,CFG.LAKE.x,CFG.LAKE.y)<planet.terrain.lakeR+30) continue;
      s.entities.push(APH.Ent.makeCrystal(cx,cy));
      placedC++;
    }
    planet.beacons.forEach(function(d){
      s.entities.push(APH.Ent.makeBeacon(d));
    });

    /* 孢子(表现层) */
    s.spores = [];
    for(var i=0;i<CFG.caps.spores;i++)
      s.spores.push({x:rng()*CFG.WORLD, y:rng()*CFG.WORLD, ph:rng()*U.TAU, s:.5+rng()});

    document.getElementById('planetTitle').textContent =
      planet.name + ' · ' + planet.paletteName;
  }

  /* ================= 扫描交互 ================= */
  function updateInteraction(dt){
    var s = APH.state;
    s.nearBeacon = null;
    var bd = 1e9;
    s.entities.forEach(function(e){
      if(e.type!==T.BEACON || e.done) return;
      e.ph += dt;
      var d = U.dst(e.x,e.y,s.px,s.py);
      if(d<86 && d<bd){ bd=d; s.nearBeacon=e; }
    });
    if(s.scanning){
      var sb=s.scanning;
      if(U.dst(sb.x,sb.y,s.px,s.py)>105){
        s.scanning=null; APH.UI.hideScanRing(); APH.UI.setHint('');
      }else{
        s.scanT += dt/2.2;
        APH.UI.setScanProgress(s.scanT);
        if(s.scanT>=1){
          sb.done=true; s.found++;
          APH.state.meta.stats.scans++; APH.Save.saveMeta(APH.state.meta);
          U.emit('beaconScanned', sb);           // ADR-8 解耦示例
          APH.UI.hideScanRing();
          APH.UI.showCard(sb.name, sb.lore);
          s.scanning=null; s.shake=.5;
          for(var k=0;k<16;k++) s.parts.push({t:'shard',x:sb.x,y:sb.y-52,
            vx:U.rr(-90,90),vy:U.rr(-110,-10),life:U.rr(.5,1),max:1,hue:45});
          APH.UI.setHint('已录入 '+s.found+'/'+s.totalBeacons);
          if(s.found>=s.totalBeacons){
            s.mode='won';
            setTimeout(function(){
              APH.UI.showWin({clock:s.clock, cry:s.cry});
            },1100);
          }
        }
      }
    }else{
      APH.UI.setActBtn(s.nearBeacon);
    }
  }

  /* ================= 氧气 / 死亡 ================= */
  function updateSurvival(dt){
    var s = APH.state;
    var dHab = U.dst(s.px,s.py,CFG.HAB.x,CFG.HAB.y);
    if(dHab < CFG.HAB.r){
      s.o2 = Math.min(CFG.player.o2Max, s.o2 + dt*CFG.player.o2Refill);
      APH.UI.setHint(s.o2<CFG.player.o2Max-2 ? '居住舱 · 氧气补充中' : '出舱探索 · 寻找金色光柱');
    }else{
      s.o2 -= dt*CFG.player.o2Drain;
      if(s.o2<25) APH.UI.setHint('⚠ 氧气 '+Math.max(0,Math.round(s.o2))+'% —— 回舱或采集粉色晶体！');
    }
    if(s.o2<=0){
      s.mode='dead';
      APH.state.meta.stats.deaths++;
      APH.Save.saveMeta(APH.state.meta);
      APH.UI.showDeath('生命维持系统在荒原上停转了。',
        {cry:s.cry, found:s.found, total:s.totalBeacons});
    }
  }

  /* ================= 晶体拾取 ================= */
  function updatePickups(dt){
    var s = APH.state;
    s.entities.forEach(function(e){
      if(e.type!==T.CRYSTAL || e.taken) return;
      e.ph += dt*.3;
      if(U.dst(e.x,e.y,s.px,s.py)<30){
        e.taken=true; e.dead=true;         // ADR-3: dead 标记, 渲染层统一过滤
        s.cry++;
        s.o2=Math.min(CFG.player.o2Max, s.o2+8);
        U.emit('crystalPicked', e);
        APH.UI.floatText('+1 晶体 · 氧气 +8','#ff9ad0');
        for(var k=0;k<10;k++) s.parts.push({t:'shard',x:e.x,y:e.y,
          vx:U.rr(-70,70),vy:U.rr(-90,-20),life:U.rr(.4,.8),max:.8,hue:310});
        s.shake=Math.min(1,s.shake+.15);
      }
    });
  }

  /* ================= 相机 ================= */
  function updateCamera(dt){
    var s = APH.state;
    var lx = s.px+(s.moving?Math.cos(s.face)*CFG.lookAhead:0),
        ly = s.py+(s.moving?Math.sin(s.face)*CFG.lookAhead:0);
    s.camX=U.lerp(s.camX,lx,1-Math.pow(CFG.camLerp,dt));
    s.camY=U.lerp(s.camY,ly,1-Math.pow(CFG.camLerp,dt));
    s.camX=U.clamp(s.camX,innerWidth/2-80,CFG.WORLD-innerWidth/2+80);
    s.camY=U.clamp(s.camY,innerHeight/2-80,CFG.WORLD-innerHeight/2+80);
    if(s.shake>0) s.shake-=dt*2.2;
  }

  /* ================= 粒子 ================= */
  function updateParticles(dt,time){
    var s=APH.state;
    for(var i=s.parts.length-1;i>=0;i--){
      var p=s.parts[i]; p.life-=dt;
      if(p.life<=0){ s.parts.splice(i,1); continue; }
      if(p.t==='shard'){ p.x+=p.vx*dt; p.y+=p.vy*dt; p.vy+=160*dt; }
    }
  }

  /* ================= 主循环 ================= */
  var lastT=performance.now(), tickN=0;
  function frame(now){
    requestAnimationFrame(frame);
    tickN++;
    if(tickN%30===0)
      document.title='▶帧'+tickN+' '+APH.state.spec.name+' · '+APH.state.found+'/'+APH.state.totalBeacons;
    var dt=Math.min(.05,(now-lastT)/1000); lastT=now;

    var s=APH.state;
    if(s.mode!=='running'){ return; }

    s.clock+=dt;
    APH.Ent.updatePlayer(dt);
    updatePickups(dt);
    updateInteraction(dt);
    updateSurvival(dt);
    if(s.mode!=='running') return;       // 本帧死亡
    updateCamera(dt);
    updateParticles(dt,s.clock);

    APH.World.render(dt, {
      player:function(e,t){ APH.Ent.drawPlayer(e,t); },
      rock:function(e,t){ APH.Ent.drawRock(e); },
      crystal:function(e,t){ APH.Ent.drawCrystal(e,t); },
      beacon:function(e,t){ APH.Ent.drawBeacon(e,t); },
      particles:function(dt2,t){
        var ctx2=document.getElementById('cv').getContext('2d');
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
      },
      /* 晶体微光挂到暗幕之后：借 render 内部顺序，见 world.js drawDarkness 后回调 */
      crystalGlow:function(){},
    });
    /* 暗幕后的晶体辉光与居住舱暖光由 world.render 内部绘制 */

    APH.UI.updHUD();
  }

  /* ================= 输入 ================= */
  function bindInput(){
    var s=APH.state;
    addEventListener('keydown',function(e){
      s.keys[e.code]=true;
      if((e.code==='Enter'||e.code==='Space')&&s.mode==='intro') startGame();
      /* 调试热键(自动化验证协议):
         T=传送到最近未扫描信标并启动真实扫描管线
         G=向东传送600px, 触发舱外耗氧路径 */
      if(e.code==='KeyT'&&s.mode==='running'){
        var nb=null,bd=1e9;
        s.entities.forEach(function(en){
          if(en.type!==T.BEACON||en.done) return;
          var d=U.dst(en.x,en.y,s.px,s.py);
          if(d<bd){bd=d;nb=en;}
        });
        if(nb){
          s.px=nb.x-50; s.py=nb.y; s.target=null;
          s.camX=s.px; s.camY=s.py;
          s.scanning=nb; s.scanT=0;
          APH.UI.showScanRing();
          document.title='DBG 已传送到 '+nb.name.slice(0,10);
        }else document.title='DBG 无未扫描信标';
      }
      if(e.code==='KeyG'&&s.mode==='running'){
        s.px=U.clamp(s.px+600,40,CFG.WORLD-40);
        s.camX=s.px; s.target=null;
        document.title='DBG 已东移600px';
      }
    });
    addEventListener('keyup',function(e){ s.keys[e.code]=false; });

    var stickEl=document.getElementById('stick'), knob=document.getElementById('knob');
    stickEl.addEventListener('pointerdown',function(e){
      s.joy.active=true; s.joy.id=e.pointerId; joyMove(e); e.stopPropagation();
    });
    addEventListener('pointermove',function(e){
      if(s.joy.active&&e.pointerId===s.joy.id) joyMove(e);
    });
    addEventListener('pointerup',function(e){
      if(s.joy.active&&e.pointerId===s.joy.id){
        s.joy.active=false; s.joy.x=0; s.joy.y=0;
        knob.style.transform='translate(-50%,-50%)';
      }
    });
    function joyMove(e){
      var r=stickEl.getBoundingClientRect(), cxx=r.left+r.width/2, cyy=r.top+r.height/2;
      var dx=e.clientX-cxx, dy=e.clientY-cyy, len=Math.sqrt(dx*dx+dy*dy)||1, max=r.width/2;
      var cl=Math.min(len,max);
      s.joy.x=dx/len*(cl/max); s.joy.y=dy/len*(cl/max);
      knob.style.transform='translate(calc(-50% + '+(dx/len*cl)+'px), calc(-50% + '+(dy/len*cl)+'px))';
    }

    var cv=document.getElementById('cv'), downX=0,downY=0,downT=0,downMoved=0;
    cv.addEventListener('pointerdown',function(e){
      downX=e.clientX; downY=e.clientY; downT=performance.now(); downMoved=0;
    });
    cv.addEventListener('pointermove',function(e){
      downMoved+=Math.abs(e.clientX-downX)+Math.abs(e.clientY-downY);
      downX=e.clientX; downY=e.clientY;
    });
    cv.addEventListener('pointerup',function(e){
      if(performance.now()-downT<450 && downMoved<12 && APH.state.mode==='running'){
        var t={x:e.clientX-innerWidth/2+APH.state.camX, y:e.clientY-innerHeight/2+APH.state.camY};
        APH.state.target=t;
        APH.state.parts.push({t:'ping',x:t.x,y:t.y,life:.8,max:.8});
      }
    });

    document.getElementById('actBtn').addEventListener('click',function(){
      var s2=APH.state;
      if(!s2.nearBeacon||s2.scanning) return;
      s2.scanning=s2.nearBeacon; s2.scanT=0;
      APH.UI.showScanRing(); APH.UI.setActBtn(false);
    });

    document.getElementById('startBtn').addEventListener('click',startGame);
    document.getElementById('freeBtn').addEventListener('click',function(){
      APH.state.mode='running';
      document.getElementById('end').classList.remove('show');
    });
    /* 开场画面整体可点(点击兜底协议) */
    document.getElementById('intro').addEventListener('click',function(ev){
      if(ev.target.id!=='startBtn') startGame();
    });
  }

  function startGame(){
    var s=APH.state;
    if(s.mode!=='intro') return;
    s.mode='running';
    APH.UI.hideIntro();
    APH.UI.armProbe();
    APH.state.meta.stats.landings++;
    APH.Save.saveMeta(APH.state.meta);
  }

  /* ================= 事件订阅 (ADR-8 示范) ================= */
  U.on('crystalPicked', function(){ /* Phase1: 音效挂这里 */ });
  U.on('beaconScanned', function(b){ /* Phase2: 动态档案生成挂这里 */ });

  /* ================= 启动 ================= */
  function boot(){
    try{
      var meta=APH.Save.loadMeta();
      APH.state.meta=meta;
      APH.World.initCanvas();
      APH.Ent.bindCtx(document.getElementById('cv').getContext('2d'));
      var seed=(Date.now()%100000)|0;
      buildWorld(seed);
      bindInput();
      APH.UI.updHUD();
      document.title='✓就绪 '+APH.state.spec.name;
    }catch(err){
      APH.UI.fatal('启动失败: '+err.message+'\n'+(err.stack||''));
      throw err;
    }
  }
  boot();
  requestAnimationFrame(frame);

  /* 调试接口(标题探针之外的程序化验证通道) */
  APH.Main={
    start:startGame,
    debugState:function(){
      var s=APH.state;
      return {mode:s.mode,frameN:tickN,clock:+s.clock.toFixed(1),o2:+s.o2.toFixed(0),
              found:s.found,total:s.totalBeacons,ents:s.entities.length};
    },
  };
})();
