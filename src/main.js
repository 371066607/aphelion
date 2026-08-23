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
    o2:100, hp:100, cry:0, found:0, totalBeacons:6,
    carry:{},                    // ADR: 背包 {itemId: n}
    fireCd:0, iFrameT:0, hurtFlash:0, noiseT:0,
    camX:0, camY:0, shake:0,
    target:null,
    keys:{}, joy:{active:false,id:null,x:0,y:0},
    entities:[],                 // 统一实体列表 (ADR-3)
    parts:[],                    // 粒子(表现层，不入实体列表)
    spores:[],
    nearBeacon:null,
    scanning:null, scanT:0,
    spawnT:6,                    // 刷怪倒计时
    seed:0,
  };

  /* ================= 世界搭建 ================= */
  function buildWorld(seed, onReady){
    var s = APH.state;
    var planet = APH.Planet.fallbackPlanet(seed);
    var cached = APH.Save.loadPlanet(planet.id);
    if(cached){ planet = cached; applySpec(planet); }
    else{
      applySpec(planet);                        // 先以降级版立即开跑
      APH.LLM.enrichPlanet(planet).then(function(rich){
        if(rich && s.mode==='intro' && !s.specSaved){   // intro 期完成才热替换
          rich.id = planet.id;                    // 富化不改 id
          APH.Save.savePlanet(rich.id, rich);
          s.specSaved = true;
          applySpec(rebuildEntities(rich));
        }
      });
    }
    function rebuildEntities(p){ return p; }      // 占位: 实体在 applySpec 内重建

    function applySpec(p){
      s.spec = p;
      s.specSaved = !!cached;
      s.seed = p.seed;
      s.totalBeacons = p.beacons.length;

      /* 统一实体列表 (ADR-3) */
      s.entities = [];
      s.entities.push({ id:'player', type:T.PLAYER, x:CFG.HAB.x, y:CFG.HAB.y+70 });
      s.px = CFG.HAB.x; s.py = CFG.HAB.y+70;
      s.camX = s.px; s.camY = s.py;

      var rng = U.makeRng(seed ^ 0x9E3779B9);
      var placedR=0, guard=0;
      while(placedR < CFG.caps.rocks && guard++ < 500){
        var rx = rng()*(CFG.WORLD-120)+60, ry = rng()*(CFG.WORLD-120)+60;
        if(U.dst(rx,ry,CFG.HAB.x,CFG.HAB.y)<140) continue;
        if(U.dst(rx,ry,CFG.LAKE.x,CFG.LAKE.y)<p.terrain.lakeR+40) continue;
        if(p.beacons.some(function(b){ return U.dst(rx,ry,b.x,b.y)<90; })) continue;
        s.entities.push(APH.Ent.makeRock(rx,ry,rng));
        placedR++;
      }
      var placedC=0; guard=0;
      while(placedC < Math.floor(CFG.caps.crystals*p.terrain.crystalDensity) && guard++ < 500){
        var cx = rng()*(CFG.WORLD-140)+70, cy = rng()*(CFG.WORLD-140)+70;
        if(U.dst(cx,cy,CFG.HAB.x,CFG.HAB.y)<150) continue;
        if(U.dst(cx,cy,CFG.LAKE.x,CFG.LAKE.y)<p.terrain.lakeR+30) continue;
        s.entities.push(APH.Ent.makeCrystal(cx,cy));
        placedC++;
      }
      p.beacons.forEach(function(d){ s.entities.push(APH.Ent.makeBeacon(d)); });

      s.spores = [];
      for(var i=0;i<CFG.caps.spores;i++)
        s.spores.push({x:rng()*CFG.WORLD, y:rng()*CFG.WORLD, ph:rng()*U.TAU, s:.5+rng()});

      document.getElementById('planetTitle').textContent =
        p.name + ' · ' + p.paletteName;
      APH.World.buildTerrain();
      if(onReady) onReady();
    }
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

  /* ================= 刷怪导演 ================= */
  function updateSpawner(dt, night){
    var s = APH.state;
    s.spawnT -= dt;
    if(s.spawnT > 0) return;
    var interval = night ? CFG.spawn.intervalNight : CFG.spawn.intervalDay;
    s.spawnT = interval * U.rr(.75, 1.3);

    var count = 0;
    s.entities.forEach(function(e){
      if(e.type===T.ENEMY && !e.dead) count++;
    });
    if(count >= CFG.caps.enemies) return;

    /* 按权重抽阵营(seeded rng, ADR-5) */
    var E = s.spec.enemies;
    var roll = Math.random();
    var faction = E.factions[E.factions.length-1];
    for(var i=0;i<E.factions.length;i++){
      roll -= (E.weights[E.factions[i].id] || 0);
      if(roll <= 0){ faction = E.factions[i]; break; }
    }
    /* 环形随机位置: 距玩家 min~max */
    var a = U.rr(0,U.TAU), d = U.rr(CFG.spawn.minDistFromPlayer, CFG.spawn.maxDistFromPlayer);
    var x = U.clamp(s.px + Math.cos(a)*d, 40, CFG.WORLD-40);
    var y = U.clamp(s.py + Math.sin(a)*d, 40, CFG.WORLD-40);
    if(U.dst(x,y,CFG.LAKE.x,CFG.LAKE.y) < s.spec.terrain.lakeR+20) return;
    s.entities.push(APH.Ent.makeEnemy(faction, x, y));
    U.emit('enemySpawned', faction);
  }

  /* ================= 氧气 / HP / 死亡 ================= */
  function updateSurvival(dt){
    var s = APH.state;
    var dHab = U.dst(s.px,s.py,CFG.HAB.x,CFG.HAB.y);
    if(dHab < CFG.HAB.r){
      s.o2 = Math.min(CFG.player.o2Max, s.o2 + dt*CFG.player.o2Refill);
      s.hp = Math.min(CFG.player.hpMax, s.hp + dt*CFG.player.healInHab);
      /* 回舱自动卸货 → 研究点 */
      var loadW = APH.Combat.carryWeight(s.carry);
      if(loadW > 0){
        for(var k in s.carry){
          s.meta.research += CFG.items[k].v * s.carry[k];
        }
        APH.Save.saveMeta(s.meta);
        s.carry = {};
        U.emit('cargoSold', {});
      }
      APH.UI.setHint('居住舱 · 补给中 (氧气/生命/卸货)');
    }else{
      s.o2 -= dt*CFG.player.o2Drain;
      if(s.o2<25) APH.UI.setHint('⚠ 氧气 '+Math.max(0,Math.round(s.o2))+'% —— 回舱或采集粉色晶体！');
    }
    if(s.o2<=0){
      s.mode='dead';
      APH.state.meta.stats.deaths++;
      APH.Save.saveMeta(APH.state.meta);
      APH.UI.showDeath('生命维持系统在荒原上停转了。', {
        cry:s.cry, found:s.found, total:s.totalBeacons, carry:s.carry});
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
    var night = APH.World.daylight() < .5;
    APH.Ent.updatePlayer(dt);
    updatePickups(dt);
    updateInteraction(dt);
    updateSpawner(dt, night);            // Phase1: 刷怪导演
    APH.Combat.updateCombat(dt, night);  // Phase1: FSM/弹道/近战
    APH.Combat.updateDropped(dt);        // Phase1: 掉落拾取
    updateSurvival(dt);
    if(s.mode!=='running') return;       // 本帧死亡
    updateCamera(dt);
    updateParticles(dt,s.clock);

    /* 受击红闪(叠加低氧红晕) */
    document.getElementById('vig').style.opacity =
      Math.max(
        s.o2<25?(1-s.o2/25)*.85:0,
        s.hurtFlash>0? s.hurtFlash*2 : 0
      );

    APH.World.render(dt, {
      player:function(e,t){ APH.Ent.drawPlayer(e,t); },
      rock:function(e,t){ APH.Ent.drawRock(e); },
      crystal:function(e,t){ APH.Ent.drawCrystal(e,t); },
      beacon:function(e,t){ APH.Ent.drawBeacon(e,t); },
      enemy:function(e,t){ APH.Ent.drawEnemy(e,t); },
      projectile:function(e,t){ APH.Ent.drawProj(e,t); },
      dropped:function(e,t){ APH.Ent.drawDropped(e,t); },
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
         G=向东传送600px, 触发舱外耗氧路径
         K=在视野边缘生成一只敌人(战斗管线验证) */
      if(e.code==='KeyJ' && s.mode==='running'){ APH.Combat.firePlasma(); }
      if(e.code==='KeyK'&&s.mode==='running'){
        var f=s.spec.enemies.factions[0];
        s.entities.push(APH.Ent.makeEnemy(f, s.px+180, s.py));
        document.title='DBG 已生成 '+f.name;
      }
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
    /* 通关结算页: 新星球按钮 */
    var np=document.createElement('button');
    np.className='bigBtn';
    np.style.cssText+='margin-top:10px;border-color:#59d9ff;color:#59d9ff;letter-spacing:3px;font-size:13px';
    np.textContent='跃迁 · 下一颗星球';
    np.addEventListener('click',newPlanet);
    document.getElementById('end').appendChild(np);
    /* 开场画面点击开始(只限按钮/背景, 不吃设置面板的交互) */
    document.getElementById('intro').addEventListener('click',function(ev){
      var t=ev.target;
      var inPanel = t.closest && t.closest('#llmForm');
      if(inPanel) return;                    // 设置面板内不触发
      if(t.id==='startBtn'||t===ev.currentTarget) startGame();
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
      bindLLMPanel();
      APH.UI.updHUD();
      document.title='✓就绪 '+APH.state.spec.name+
        (APH.LLM.enabled()?' ·AI':'');
    }catch(err){
      APH.UI.fatal('启动失败: '+err.message+'\n'+(err.stack||''));
      throw err;
    }
  }

  /* 「新星球」: 换 seed 重建世界(结算页入口) */
  function newPlanet(){
    var s=APH.state;
    s.mode='intro';
    document.getElementById('end').classList.remove('show');
    var scr=document.getElementById('intro');
    scr.classList.remove('hide');
    scr.querySelector('h1').textContent='跃 迁 中';
    scr.querySelector('.tag').textContent='WARP COMPLETE';
    scr.querySelector('p').innerHTML='正在展开新的行星档案…<br><span style="color:#5d6f96">'+
      (APH.LLM.enabled()?'AI 正在撰写这颗星球的故事':'(未配置 AI, 使用程序生成档案)')+'</span>';
    var b=document.getElementById('startBtn');
    b.textContent='踏 上 星 球';
    b.onclick=function(){ location.reload(); };
    var seed=((Date.now()>>>3)^(s.seed*2654435761))>>>0 % 100000;
    buildWorld(seed);
    setTimeout(function(){
      scr.querySelector('h1').textContent='远 日 点';
      scr.querySelector('p').innerHTML='档案就绪：<b style="color:#ffc857">'+
        s.spec.name+'</b> · '+s.spec.paletteName+
        '<br>6 座信标 · '+(s.spec.generatedBy==='llm'?'AI 撰写档案':'程序生成档案');
      refreshLLMStatus();
    }, 600);
  }

  /* ================= LLM 设置面板(开场画面内) ================= */
  function bindLLMPanel(){
    var intro=document.getElementById('intro');
    var panel=document.createElement('div');
    panel.style.cssText='margin-top:18px;font-size:11px;color:#5d6f96;line-height:2';
    panel.innerHTML=
      '<span id="llmStatus"></span> '+
      '<a href="#" id="llmToggle" style="color:#59d9ff;text-decoration:none">AI 档案设置</a>'+
      '<div id="llmForm" style="display:none;margin-top:8px">'+
      '<input id="llmEp" placeholder="API endpoint (https://.../v1)" '+
        'style="width:240px;background:#0c1220;border:1px solid #223252;color:#cdd9f5;padding:6px 10px;border-radius:8px;font-size:11px"><br>'+
      '<input id="llmKey" type="password" placeholder="API Key"'+
        'style="width:240px;background:#0c1220;border:1px solid #223252;color:#cdd9f5;padding:6px 10px;border-radius:8px;font-size:11px;margin-top:4px"><br>'+
      '<input id="llmModel" placeholder="模型名 (如 gemini-2.0-flash)"'+
        'style="width:240px;background:#0c1220;border:1px solid #223252;color:#cdd9f5;padding:6px 10px;border-radius:8px;font-size:11px;margin-top:4px"><br>'+
      '<button id="llmSave" style="margin-top:6px;background:none;border:1px solid #59d9ff;color:#59d9ff;'+
        'padding:5px 16px;border-radius:12px;font-size:11px;cursor:pointer">保存</button>'+
      '</div>';
    intro.appendChild(panel);
    refreshLLMStatus();
    document.getElementById('llmToggle').addEventListener('click',function(e){
      e.preventDefault();
      var f=document.getElementById('llmForm');
      f.style.display = f.style.display==='none' ? 'block' : 'none';
    });
    document.getElementById('llmSave').addEventListener('click',function(){
      APH.LLM.setConf(
        document.getElementById('llmEp').value,
        document.getElementById('llmKey').value,
        document.getElementById('llmModel').value);
      refreshLLMStatus();
      document.getElementById('llmForm').style.display='none';
    });
  }
  function refreshLLMStatus(){
    var el=document.getElementById('llmStatus');
    if(!el) return;
    var q=APH.LLM.quotaInfo();
    el.textContent = APH.LLM.enabled()
      ? '● AI 档案开启 (今日余 '+q.left+')'
      : '○ AI 未配置(程序降级)';
  }
  boot();
  requestAnimationFrame(frame);

  /* 调试接口(标题探针之外的程序化验证通道) */
  APH.Main={
    start:startGame,
    debugState:function(){
      var s=APH.state;
      var enemies=0; s.entities.forEach(function(e){if(e.type===T.ENEMY&&!e.dead)enemies++;});
      return {mode:s.mode,frameN:tickN,clock:+s.clock.toFixed(1),o2:+s.o2.toFixed(0),
              hp:Math.round(s.hp),found:s.found,total:s.totalBeacons,
              enemies:enemies,carryW:APH.Combat.carryWeight(s.carry),
              research:s.meta?s.meta.research:0};
    },
  };
})();
