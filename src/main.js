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
    scene:'home',                // home=殖民地(安全) | expedition=星球远征
    clock:0,
    spec:null,                   // 当前 PlanetSpec (ADR-1)
    px:0, py:0, vx:0, vy:0,
    face:-Math.PI/2, walkPh:0, moving:false, run:false,
    o2:100, hp:100, cry:0, found:0, totalBeacons:6,
    carry:{},                    // 远征背包 {itemId: n}
    fireCd:0, iFrameT:0, hurtFlash:0, noiseT:0,
    camX:0, camY:0, shake:0,
    target:null,
    keys:{}, joy:{active:false,id:null,x:0,y:0},
    entities:[],                 // 统一实体列表 (ADR-3)
    parts:[],                    // 粒子(表现层)
    spores:[],
    nearBeacon:null,
    nearPad:false,               // 距离发射台(场景切换交互)
    scanning:null, scanT:0,
    spawnT:6,
    buildMode:null,              // 建造模式: 当前选择的建筑id | null
    techSel:null,                // 科技选择游标
    war:{ angerMin:0, raidWarn:0, raidActive:false, wins:0, raids:0 },
    seed:0,
  };

  /* ================= 场景切换 (设计支柱: 殖民地优先) ================= */
  function enterHome(){
    var s = APH.state;
    s.scene='home';
    APH.Colony.buildColonyWorld(s.seed);
    APH.World.buildTerrain();
    /* 远征战利品在出发前就已结算; 回家只做补给 */
    s.o2=CFG.player.o2Max; s.hp=CFG.player.hpMax;
    document.getElementById('planetTitle').textContent =
      '新曙光殖民地 · 家园';
    /* 新手引导(meta.tut 阶段标记, 持久化) */
    var tut=APH.state.meta.tut||0;
    var hints=[
      '殖民地是你的家。先按 [T] 选科技、[B] 建造, 或去发射台',
      '[E] 从发射台出发远征 · 星球上搜刮战利品',
      '返回舱按 [E] 回家结算 · 研究点用于科技与建造',
      '小心: AI 殖民地会袭击你。炮塔与士兵是防御的关键',
    ];
    APH.UI.setHint(hints[Math.min(tut,hints.length-1)]);
    if(tut<hints.length) {
      APH.state.meta.tut=tut+1;
      APH.Save.saveMeta(APH.state.meta);
    }
  }
  function launchExpedition(){
    var s = APH.state;
    if(s.scene==='expedition') return;
    /* T9: 超重出发提醒(不阻止, 只提示——玩家的选择权在他手里) */
    var loadW=APH.Combat.carryWeight(s.carry);
    if(loadW > CFG.player.carryMax*.7){
      APH.UI.floatText('⚠ 负重 '+loadW+'/'+CFG.player.carryMax+
        ' — 星球上的晶体可以回氧，别浪费舱位','#ffc857');
    }
    var seed=(Date.now()%100000)|0;
    var planet = APH.Planet.fallbackPlanet(seed);
    var cached = APH.Save.loadPlanet(planet.id);
    if(cached){ applySpec(planet=cached); }
    else{
      applySpec(planet);
      APH.LLM.enrichPlanet(planet).then(function(rich){
        if(rich && s.scene==='expedition' && !s.specSaved && s.spec.seed===planet.seed){
          rich.id=planet.id;
          APH.Save.savePlanet(rich.id, rich);
          s.specSaved=true;
          applySpec(rich);
        }
      });
    }
    function applySpec(p){
      s.spec=p; s.specSaved=!!cached; s.seed=p.seed;
      s.totalBeacons=p.beacons.length;
      s.entities=[{ id:'player', type:T.PLAYER, x:CFG.HAB.x, y:CFG.HAB.y+70 }];
      s.px=CFG.HAB.x; s.py=CFG.HAB.y+70; s.camX=s.px; s.camY=s.py;
      var rng=U.makeRng(p.seed ^ 0x9E3779B9);
      var pr=0,gd=0;
      while(pr<CFG.caps.rocks && gd++<500){
        var rx=rng()*(CFG.WORLD-120)+60, ry=rng()*(CFG.WORLD-120)+60;
        if(U.dst(rx,ry,CFG.HAB.x,CFG.HAB.y)<140) continue;
        if(U.dst(rx,ry,CFG.LAKE.x,CFG.LAKE.y)<p.terrain.lakeR+40) continue;
        if(p.beacons.some(function(b){return U.dst(rx,ry,b.x,b.y)<90;})) continue;
        s.entities.push(APH.Ent.makeRock(rx,ry,rng)); pr++;
      }
      var pc=0; gd=0;
      while(pc < Math.floor(CFG.caps.crystals*p.terrain.crystalDensity) && gd++<500){
        var cx=rng()*(CFG.WORLD-140)+70, cy=rng()*(CFG.WORLD-140)+70;
        if(U.dst(cx,cy,CFG.HAB.x,CFG.HAB.y)<150) continue;
        if(U.dst(cx,cy,CFG.LAKE.x,CFG.LAKE.y)<p.terrain.lakeR+30) continue;
        s.entities.push(APH.Ent.makeCrystal(cx,cy)); pc++;
      }
      p.beacons.forEach(function(d){ s.entities.push(APH.Ent.makeBeacon(d)); });
      s.spores=[];
      for(var i=0;i<CFG.caps.spores;i++)
        s.spores.push({x:rng()*CFG.WORLD,y:rng()*CFG.WORLD,ph:rng()*U.TAU,s:.5+rng()});
      s.o2=CFG.player.o2Max;                       // 出发时满氧
      s.found=0; s.cry=0; s.carry={};              // 远征状态清零
      s.spawnT=8;
      /* 着陆点的返回舱(发射台): 靠近按 E 返航 */
      s.entities.push({
        id:'be_pad', type:T.BUILDING, bid:'bl_landing_pad',
        x:CFG.HAB.x, y:CFG.HAB.y+70, def:APH.Colony.get('bl_landing_pad'), pad:true,
      });
      /* 敌对殖民地基地(Phase4 进攻目标): 星球远端 */
      if(p.rivals && p.rivals.length){
        var rv=p.rivals[Math.floor(Math.random()*p.rivals.length)];
        var ba=Math.random()*U.TAU;
        var bx=U.clamp(CFG.HAB.x+Math.cos(ba)*820, 100, CFG.WORLD-100);
        var by=U.clamp(CFG.HAB.y+Math.sin(ba)*820, 100, CFG.WORLD-100);
        s.entities.push({
          id:'rv_base_'+rv.id, type:T.BUILDING, bid:'bl_rival_base',
          x:bx, y:by, rivalId:rv.id, rivalName:rv.name,
          hp:60, maxHp:60, def:{ name:rv.name+' 基地', size:70 },
        });
        /* 基地守军×3 */
        for(var gi=0; gi<3; gi++){
          var gf=p.enemies.factions[gi % p.enemies.factions.length];
          s.entities.push(APH.Ent.makeEnemy(gf,
            bx+(Math.random()*120-60), by+(Math.random()*90-45)));
        }
      }
      document.getElementById('planetTitle').textContent =
        p.name+' · '+p.paletteName+' (远征)';
    }
    s.scene='expedition';
    APH.UI.setHint('已着陆 '+s.spec.name+'。目标: 6 座信标 + 战利品。');
    U.emit('launched',{});
  }

  /* 返回殖民地(发射台交互) */
  function returnHome(){
    var s=APH.state;
    if(s.scene!=='expedition') return;
    /* 结算远征收益: 背包→研究点 */
    var gained=0;
    for(var k in s.carry) gained += CFG.items[k].v * s.carry[k];
    s.meta.research += gained;
    s.meta.res = s.meta.res || {};
    s.meta.stats.scans = s.meta.stats.scans||0;
    if(gained>0){
      APH.Save.saveMeta(s.meta);
      APH.UI.floatText('远征结算 +'+gained+' 研究点','#ffe28a');
    }else{
      APH.UI.floatText('空手而归','#8fa3cc');
    }
    var foundN=s.found, cryN=s.carry[CFG.items.it_crystal_ore]||0;
    s.carry={};
    enterHome();
    U.emit('returnedHome',{ research:gained, beacons:foundN });
    log('远征归来: 异常 '+foundN+'/'+s.totalBeacons+
        (gained>0?' · 研究点 +'+gained:''));
  }
  function log(t){ console.log('[aphelion]',t); }

  /* ================= 世界搭建(旧函数保留给远征用) ================= */
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
            /* T3 Boss: 全信标录入惊醒星球守护者 */
            spawnGuardian(sb.x, sb.y);
          }
        }
      }
    }else{
      APH.UI.setActBtn(s.nearBeacon);
    }
  }

  /* ================= T3 守护者Boss ================= */
  function spawnGuardian(x,y){
    var s=APH.state;
    if(s.entities.some(function(e){return e.type===T.ENEMY&&e.isBoss&&!e.dead;})) return;
    var base=s.spec.enemies.factions[0];
    var b=APH.Ent.makeEnemy(base, x+60, y+40);
    b.isBoss=true;
    b.hp=Math.round(b.faction.hp*8)+40;
    b.bossName='星球守护者';
    s.entities.push(b);
    s.mode='running';                        // 保持运行(不立即won)
    s.shake=1;
    APH.UI.floatText('⚠ '+b.bossName+'苏醒了!','#ff9a4d');
    APH.UI.setHint('击败守护者才能带着完整档案离开');
    U.emit('bossSpawned',{x:x,y:y});
    s.bossEverSpawned=true;
  }
  function checkBossDown(){
    var s=APH.state;
    if(s.mode!=='running') return;
    var bossAlive=false, hadBoss=(s.bossEverSpawned===true);
    s.entities.forEach(function(e){
      if(e.type===T.ENEMY&&e.isBoss&&!e.dead) bossAlive=true;
    });
    if(s.found>=s.totalBeacons && !bossAlive){
      if(!hadBoss){ s.bossEverSpawned=true; }
      /* 首次全录入后 boss 必然已刷过(spawnGuardian 在扫描回调里同步执行) */
      if(s.bossEverSpawned || s.guardianCleared){
        s.guardianCleared=true;
        s.mode='won';
        setTimeout(function(){
          APH.UI.showWin({clock:s.clock, cry:s.cry});
        },1100);
      }
    }
  }

  /* ================= 刷怪导演 ================= */
  function updateSpawner(dt, night){
    var s = APH.state;
    s.spawnT -= dt;
    if(s.spawnT > 0) return;
    var interval = night ? CFG.spawn.intervalNight : CFG.spawn.intervalDay;
    /* T2 难度分级: 高tier刷怪更快 */
    var tierMul = [1, .85, .7][(s.spec.tier||1)-1];
    interval *= tierMul;
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
      U.emit('gameOver',{});
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

  /* ================= 场景条件化更新 ================= */
  function updateHome(dt){
    var s=APH.state;
    APH.Ent.updatePlayer(dt);
    updateCamera(dt);

    /* 发射台接近检测 */
    var pad = s.entities.find(function(e){ return e.type===T.BUILDING && e.pad; });
    s.nearPad = pad ? U.dst(s.px,s.py,pad.x,pad.y) < 90 : false;
    if(s.nearPad) APH.UI.setHint('[E] 登船出发远征');

    /* 殖民地内缓慢回血回氧(安全区) */
    s.o2=Math.min(CFG.player.o2Max, s.o2+dt*10);
    s.hp=Math.min(CFG.player.hpMax, s.hp+dt*6);

    /* 生产 tick: 每30游戏秒结算一次采矿机/研究站 (ADR-6 固定tick) */
    s.prodT=(s.prodT||0)+dt;
    if(s.prodT>=30){
      s.prodT-=30;
      var out=APH.Colony.productionTick(s.meta, s.colony.buildings);
      if(out.mineral||out.research)
        APH.UI.floatText('生产: +'+out.mineral+' 矿材 +'+out.research+' 研究点','#9fe8c8');
      /* AI殖民地同步成长(同拍) */
      tickRivals(30/60);
      residentsTick();                            // P6-U2/U4/U7
    }

    /* ================= P6 居民系统 ================= */
  function housingCap(){
    /* 住宅容量: 居住舱本体2席, 医疗舱每座+1(临时设计, 后续住宅建筑扩展) */
    return 2 + APH.state.colony.buildings.filter(function(b){return b.id==='bl_clinic';}).length;
  }
  function residentsTick(){
    var s=APH.state, m=s.meta;
    /* U4 需求结算: 吃仓库食物 */
    var hasFood=(m.res.food||0)>0;
    m.residents.forEach(function(r){
      var before=r.food;
      APH.Res.needsTick(r, hasFood);
      if(r.food>before && (m.res.food||0)>0){ m.res.food--; }
    });
    /* U5 自动指派(简单版): 农场/牧场有空则派种植/畜牧最高的闲人 */
    autoAssign('bl_farm','sk_farm',2);
    autoAssign('bl_pasture','sk_ranch',2);

    /* U3/U5 农场与岗位产出 */
    var farmers=m.residents.filter(function(r){return r.job==='bl_farm';});
    var ranchers=m.residents.filter(function(r){return r.job==='bl_pasture';});
    var farms=s.colony.buildings.filter(function(b){return b.id==='bl_farm';});
    farms.forEach(function(b){
      if(!b.plot) b.plot={stage:1,t:0};          // 新农场自动播种
      var bestFarmer=farmers.reduce(function(acc,r){
        return (acc===null||(r.skills.sk_farm>(acc.skills.sk_farm||0)))?r:acc;
      },null);
      b.plot=APH.Colony.farmTick(b.plot, bestFarmer?bestFarmer.skills.sk_farm:0);
      if(APH.Colony.harvestYield(b.plot)>0){
        m.res.food=(m.res.food||0)+3;
        APH.UI.floatText('🌾 农场收获 +3 食物','#c8e89a');
        b.plot={stage:1,t:0};
      }
    });
    /* 畜牧(U6简化): 有牧民时每跳概率+1肉 */
    if(ranchers.length && Math.random()<0.35*ranchers.length){
      m.res.food=(m.res.food||0)+2;
      APH.UI.floatText('🐑 畜牧产出 +2 食物','#c8e89a');
    }

    /* U7 社交 */
    var pairs=[];
    for(var i=0;i<m.residents.length;i++)
      for(var j=i+1;j<m.residents.length;j++){
        var a=m.residents[i], b=m.residents[j];
        pairs.push({a:a,b:b,sameJob:!!(a.job&&a.job===b.job)});
      }
    if(!m.bonds) m.bonds={};
    APH.Res.socialTick(pairs).forEach(function(d){
      m.bonds=APH.Res.applyBond(m.bonds,d.a,d.b,d.delta);
    });
    saveMetaQuiet();
    /* U2 到访事件 */
    var cap=housingCap();
    if(m.residents.length < cap && Math.random()<0.25){
      m.residentSeq=(m.residentSeq||0)+1;
      var r=APH.Res.generate('p'+m.residentSeq+'_'+(Date.now()%10000),
                             ((s.seed||7)*31+m.residentSeq*917)>>>0);
      r.arrivedAt=s.clock;
      m.residents.push(r);
      saveMetaQuiet();
      var skName=APH.Res.SKILL_NAMES[r.mainSkill];
      APH.UI.floatText('🧑‍🚀 '+r.name+' 加入了殖民地 ('+skName+'专精)', '#9fe8c8');
      U.emit('residentJoined', r);
    }else if(m.residents.length>=cap && Math.random()<0.06){
      APH.UI.floatText('一名旅人远眺了殖民地，但没有停留…','#5d6f96');
    }
  }
  function saveMetaQuiet(){ try{ APH.Save.saveMeta(APH.state.meta); }catch(e){} }
  function autoAssign(buildingId, skillKey, perBuilding){
    var s=APH.state, m=s.meta;
    var slots = s.colony.buildings.filter(function(b){return b.id===buildingId;}).length*perBuilding;
    var onJob = m.residents.filter(function(r){return r.job===buildingId;});
    if(onJob.length>=slots) return;
    var free=m.residents.filter(function(r){return !r.job;})
      .sort(function(a,b){return (b.skills[skillKey]||0)-(a.skills[skillKey]||0);});
    while(onJob.length<slots && free.length){
      var r=free.shift();
      r.job=buildingId;
      APH.UI.floatText(r.name+' 开始在'+APH.Colony.get(buildingId).name+'工作','#8fd4ff');
    }
  }
  
  /* 战争系统: 袭击预警与进行中 */
    if(s.war.raidWarn>0){
      s.war.raidWarn-=dt;
      APH.UI.setHint('⚠ '+s.war.raidFrom+'来袭! '+Math.ceil(s.war.raidWarn)+'s — 保卫殖民地!');
      if(s.war.raidWarn<=0) startRaid();
    }else if(s.war.raidActive){
      /* 波次刷怪(袭击敌人从地图边缘冲基地) */
      s.war.raidSpawnT=(s.war.raidSpawnT||0)-dt;
      var aliveEnemies=0;
      s.entities.forEach(function(e){if(e.type===T.ENEMY&&!e.dead)aliveEnemies++;});
      if(aliveEnemies < s.war.wave.count && s.war.spawned<s.war.wave.count && s.war.raidSpawnT<=0){
        s.war.raidSpawnT=.7;
        var f=s.spec.enemies.factions[Math.floor(Math.random()*s.spec.enemies.factions.length)];
        var ang=Math.random()*U.TAU, d=Math.max(innerWidth,innerHeight)*.62;
        var ex=U.clamp(CFG.HAB.x+Math.cos(ang)*d,40,CFG.WORLD-40),
            ey=U.clamp(CFG.HAB.y+Math.sin(ang)*d,40,CFG.WORLD-40);
        var en=APH.Ent.makeEnemy(f,ex,ey);
        en.state='chase';                       // 直接冲基地
        s.entities.push(en);
        s.war.spawned++;
      }
      if(s.war.spawned>=s.war.wave.count){
        var left=0;
        s.entities.forEach(function(e){if(e.type===T.ENEMY&&!e.dead)left++;});
        if(left===0){
          s.war.raidActive=false; s.war.wins++;
          saveWar();
          APH.UI.floatText('✔ 袭击被击退! 战争态势提升','#7dffab');
          U.emit('raidDefended',{});
        }
      }
    }
  }

  /* ---- AI殖民地成长 + 袭击决策 ---- */
  function tickRivals(minutes){
    var s=APH.state;
    if(!s.rivalStates){ loadRivals(); }
    s.rivalStates.forEach(function(r){
      var g=APH.Rivals.growthTick(r.rival, minutes);
      r.rival.military=g.military; r.rival.economy=g.economy;
      r.anger += minutes;
      /* 袭击决策(只在玩家在家时可发动; 远征时暂停积累愤怒) */
      var def=playerDefPower();
      var decision=APH.Rivals.shouldRaid(r.rival, def, r.anger);
      if(decision.should && !s.war.raidActive && s.war.raidWarn<=0){
        r.anger=0;
        s.war.raidFrom=r.rival.name;
        s.war.raidWarn=12;                      // 预警12s(原型缩短, 正式版60s)
        s.war.pendingWave=APH.Rivals.raidWave(r.rival);
        saveRivals();
      }
    });
  }
  function playerDefPower(){
    var s=APH.state;
    var turrets=s.colony.buildings.filter(function(b){return b.id==='bl_turret';}).length;
    return 10 + turrets*12 + (s.meta.tech.te_weaponry||0)*5;
  }
  function startRaid(){
    var s=APH.state;
    s.war.raidActive=true;
    s.war.wave=s.war.pendingWave||{count:4};
    s.war.spawned=0; s.war.raidSpawnT=0;
    APH.UI.setHint('');
    document.getElementById('vig').style.opacity=.5;
    setTimeout(function(){document.getElementById('vig').style.opacity=0;},900);
    U.emit('raidStarted',s.war.wave);
  }
  function loadRivals(){
    var s=APH.state;
    try{
      var v=JSON.parse(localStorage.getItem('aphelion_rivals_v1')||'null');
      if(v&&Array.isArray(v)) { s.rivalStates=v; return; }
    }catch(e){}
    /* 从当前星球spec初始化(首次) */
    var specRivals = window.APH.Planet.fallbackPlanet(s.seed||12345).rivals;
    s.rivalStates = specRivals.map(function(r){
      return { rival:r, anger:0 };
    });
    saveRivals();
  }
  function saveRivals(){
    try{ localStorage.setItem('aphelion_rivals_v1',
      JSON.stringify(APH.state.rivalStates)); }catch(e){}
  }
  function saveWar(){
    var s=APH.state;
    try{ localStorage.setItem('aphelion_war_v1',
      JSON.stringify({wins:s.war.wins,raids:s.war.raids})); }catch(e){}
  }
  function updateExpedition(dt){
    var s=APH.state;
    var night=APH.World.daylight()<.5;
    APH.Ent.updatePlayer(dt);
    updatePickups(dt);
    updateInteraction(dt);
    updateSpawner(dt, night);
    APH.Combat.updateCombat(dt, night);
    APH.Combat.updateDropped(dt);
    /* 返回舱接近检测(玩家出生点旁) */
    var pad = s.entities.find(function(e){ return e.type===T.BUILDING && e.pad; });
    s.nearPad = pad ? U.dst(s.px,s.py,pad.x,pad.y) < 90 : false;
    if(s.nearPad && !s.nearBeacon){
      APH.UI.setHint('[E] 返航殖民地 (结算战利品)');
    }
    updateSurvival(dt);
    checkBossDown();
    if(s.mode!=='running') return;
    updateCamera(dt);
    updateParticles(dt,s.clock);
    document.getElementById('vig').style.opacity =
      Math.max(
        s.o2<25?(1-s.o2/25)*.85:0,
        s.hurtFlash>0? s.hurtFlash*2 : 0
      );
  }

  /* ================= 性能护栏 (T1) =================
     watchdog: 连续慢帧→削减粒子; 实体超限→回收最远杂散实体。
     纯逻辑部分 guardTrim 抽出可测。 */
  var slowStreak=0, lastFrameT=0;
  function perfGuard(frameMs){
    if(frameMs>250){ slowStreak++; }
    else slowStreak=0;
    if(slowStreak>=3){
      slowStreak=0;
      APH.state.parts.length=Math.min(APH.state.parts.length,40);
      console.warn('[perf] 慢帧×3 → 粒子削减至40');
      return true;
    }
    return false;
  }
  /* 实体上限: 超限时按"离玩家最远优先"回收可牺牲类型。
     纯函数: 返回应删除的 id 集合(node 可测)。 */
  function guardTrim(entities, px, py, cap){
    if(entities.length<=cap) return [];
    var expendable=entities.filter(function(e){
      return e.type===T.DROPPED||e.type===T.ENEMY;
    });
    expendable.sort(function(a,b){
      return U.dst(b.x,b.y,px,py)-U.dst(a.x,a.y,px,py);
    });
    var need=entities.length-cap, out=[];
    for(var i=0;i<need && i<expendable.length;i++) out.push(expendable[i].id);
    return out;
  }

  /* ================= 主循环 ================= */
  var lastT=performance.now(), tickN=0;
  function frame(now){
    requestAnimationFrame(frame);
    tickN++;
    if(tickN%30===0){
      var dx=Math.round(s.px-s.camX), dy=Math.round(s.py-s.camY);
      document.title='▶帧'+tickN+' Δ('+dx+','+dy+') vw'+innerWidth+
        ' · '+s.found+'/'+s.totalBeacons;
    }
    perfGuard(now-lastT);
    var dt=Math.min(.05,(now-lastT)/1000); lastT=now;

    var s=APH.state;
    if(s.mode!=='running'){ return; }

    /* 实体上限护栏 */
    var over=guardTrim(s.entities,s.px,s.py,CFG.caps.entitiesHard);
    if(over.length){
      var kill=new Set(over);
      s.entities=s.entities.filter(function(e){return !kill.has(e.id);});
    }

    s.clock+=dt;

    if(s.scene==='home'){
      updateHome(dt);
      /* 建造模式幽灵跟随鼠标(渲染在 world.render 之后) */
      APH.World.render(dt, homeDrawers());
      drawTutorialArrow(s.clock);
      APH.UI.updHUD();
      return;
    }

    var night = APH.World.daylight() < .5;
    updateExpedition(dt);
    if(s.mode!=='running') return;       // 本帧死亡

    if(tickN%30===0){
      var ddx=Math.round(s.px-s.camX), ddy=Math.round(s.py-s.camY);
      document.title='▶帧'+tickN+' Δ('+ddx+','+ddy+') 敌'+
        s.entities.filter(function(e){return e.type===T.ENEMY&&!e.dead;}).length+
        ' · '+s.found+'/'+s.totalBeacons;
    }

    APH.World.render(dt, expeditionDrawers());

    APH.UI.updHUD();
  }

  /* ---- 渲染抽屉组: 场景各自注册 ---- */
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
      player:function(e,t){ APH.Ent.drawPlayer(e,t); },
      rock:function(e,t){ APH.Ent.drawRock(e); },
      crystal:function(e,t){ APH.Ent.drawCrystal(e,t); },
      beacon:function(e,t){ APH.Ent.drawBeacon(e,t); },
      enemy:function(e,t){ APH.Ent.drawEnemy(e,t); },
      projectile:function(e,t){ APH.Ent.drawProj(e,t); },
      dropped:function(e,t){ APH.Ent.drawDropped(e,t); },
      building:function(e,t){ APH.Ent.drawBuilding(e,t); },
      particles:particlesDrawer,
      crystalGlow:function(){},
    };
  }
  function drawTutorialArrow(time){
    var s=APH.state;
    if((s.meta.tut||0)>=4 || s.scene!=='home') return;
    var pad=s.entities.find(function(e){return e.type===T.BUILDING&&e.pad;});
    if(!pad) return;
    var ctx2=document.getElementById('cv').getContext('2d');
    var pulse=Math.sin(time*4)*.5+.5;
    /* 玩家→发射台方向的浮动三角 */
    var dx=pad.x-s.px, dy=(pad.y-40)-s.py, L=Math.sqrt(dx*dx+dy*dy)||1;
    var ax=s.px+dx/L*46, ay=s.py+dy/L*46 - Math.sin(time*3)*4;
    ctx2.save();
    ctx2.translate(ax,ay);
    ctx2.rotate(Math.atan2(dy,dx));
    ctx2.fillStyle='rgba(255,200,87,'+(0.45+pulse*.5)+')';
    ctx2.beginPath();
    ctx2.moveTo(10,0); ctx2.lineTo(-6,-7); ctx2.lineTo(-6,7);
    ctx2.closePath(); ctx2.fill();
    ctx2.restore();
    /* 距离标签 */
    ctx2.fillStyle='rgba(255,200,87,.75)';
    ctx2.font='10px monospace'; ctx2.textAlign='center';
    ctx2.fillText('发射台 '+Math.round(L)+'m', ax, ay+20);
  }

  function homeDrawers(){
    var d = {
      player:function(e,t){ APH.Ent.drawPlayer(e,t); },
      rock:function(e,t){ APH.Ent.drawRock(e); },
      crystal:function(e,t){ APH.Ent.drawCrystal(e,t); },
      beacon:function(e,t){},
      enemy:function(e,t){},
      projectile:function(e,t){},
      dropped:function(e,t){},
      building:function(e,t){ APH.Ent.drawBuilding(e,t); },
      particles:particlesDrawer,
      crystalGlow:function(){},
    };
    return d;
  }

  /* ================= 科技效果应用 ================= */
  function applyTech(meta,techId){
    var t=APH.Colony.TECHS[techId]; if(!t) return;
    var lv=meta.tech[techId]||0;
    var P=CFG.player;
    /* 从基准值重算, 避免叠加误差 */
    if(t.effect.o2Max){ P.o2Max = 100 + t.effect.o2Max*lv; S_o2Clamp(); }
    if(t.effect.dmgMul){ CFG.combat.plasmaDmg = Math.round(13*(1+t.effect.dmgMul*lv)); }
    if(t.effect.spdMul){ P.walkSpeed=Math.round(150*(1+t.effect.spdMul*lv));
                         P.runSpeed=Math.round(235*(1+t.effect.spdMul*lv)); }
    if(t.effect.radar){ /* Phase3b: 罗盘全显 */ }
  }
  function applyAllTech(meta){
    Object.keys(APH.Colony.TECHS).forEach(function(id){ applyTech(meta,id); });
    if(S_o2Clamp) S_o2Clamp();
  }
  function S_o2Clamp(){ if(APH.state) APH.state.o2=Math.min(APH.state.o2,CFG.player.o2Max); }

  /* ================= 建造放置 ================= */
  function tryPlace(bid,wx,wy){
    var s=APH.state;
    var check=APH.Colony.canPlace(s.colony.buildings, s.meta.research, bid, wx, wy);
    if(!check.ok){ APH.UI.floatText('✕ '+check.why,'#ff9a9a'); return; }
    var def=APH.Colony.get(bid);
    s.meta.research-=def.cost;
    s.colony.buildings.push({id:bid,x:Math.round(wx),y:Math.round(wy)});
    APH.Save.saveMeta(s.meta);
    saveColony();
    APH.Colony.placeBuildingEntity(bid,wx,wy);
    U.emit('built',{id:bid});
    APH.UI.floatText('✔ '+def.name+' 建造完成','#9fe8c8');
    if(def.id==='bl_warehouse') CFG.player.carryMax+=20;   // 仓库永久扩容
    s.parts.push({t:'ping',x:wx,y:wy,life:.9,max:.9});
  }
  function saveColony(){
    try{ localStorage.setItem('aphelion_colony_v1',
      JSON.stringify(APH.state.colony)); }catch(e){}
  }
  function loadColony(){
    try{
      var v=JSON.parse(localStorage.getItem('aphelion_colony_v1')||'null');
      if(v && Array.isArray(v.buildings)) return v;
    }catch(e){}
    return { buildings:[], builtAt:Date.now() };
  }

  /* ================= 输入 ================= */
  function bindInput(){
    var s=APH.state;
    addEventListener('keydown',function(e){
      s.keys[e.code]=true;
      APH.SFX.unlock();
      if((e.code==='Enter'||e.code==='Space')&&s.mode==='intro') startGame();
      /* E=发射台交互: 不在发射台时自动走过去(再次按E触发) */
      if(e.code==='KeyE'&&s.mode==='running'){
        if(s.nearPad){
          if(s.scene==='home') launchExpedition();
          else if(s.scene==='expedition') returnHome();
        }else{
          var padE=s.entities.find(function(en){return en.type===T.BUILDING&&en.pad;});
          if(padE){
            s.target={x:padE.x,y:padE.y+40};
            s.parts.push({t:'ping',x:padE.x,y:padE.y,life:.9,max:.9});
            APH.UI.setHint('前往发射台…到达后按 [E]');
          }
        }
      }
      /* 调试热键(自动化验证协议):
         T=传送到最近未扫描信标并启动真实扫描管线
         G=向东传送600px, 触发舱外耗氧路径
         K=在视野边缘生成一只敌人(战斗管线验证) */
      if(e.code==='KeyJ' && s.mode==='running'){ APH.Combat.firePlasma(); }
      /* B=建造模式(仅殖民地): 循环选择建筑, 点地放置, 右键/Esc取消 */
      if(e.code==='KeyB'&&s.mode==='running'&&s.scene==='home'){
        var ids=Object.keys(APH.Colony.list()).filter(function(id){return id!=='bl_landing_pad';});
        var cur=ids.indexOf(s.buildMode);
        s.buildMode = ids[(cur+1) % (ids.length+1)] || null;
        APH.UI.setHint(s.buildMode
          ? '建造: '+APH.Colony.get(s.buildMode).name+' · 点击空地放置 ('+APH.Colony.get(s.buildMode).cost+'研究点)'
          : '建造模式关闭');
      }
      if(e.code==='Escape'&&s.buildMode){ s.buildMode=null; APH.UI.setHint(''); }
      if(e.code==='KeyM'){ var m=APH.SFX.toggleMute();
        APH.UI.floatText(m?'🔇 静音':'🔊 音效开启','#8fa3cc'); }
      /* L=图鉴(仅远征场景有内容) */
      if(e.code==='KeyL'&&s.mode==='running'){ toggleCodex(); }
      /* T=科技购买(仅殖民地): 循环选择并直接购买 */
      if(e.code==='KeyT'&&s.mode==='running'&&s.scene==='home'){
        var tids=Object.keys(APH.Colony.TECHS);
        var ti=tids.indexOf(s.techSel);
        s.techSel=tids[(ti+1)%tids.length];
        var tdef=APH.Colony.TECHS[s.techSel];
        var lv=s.meta.tech[s.techSel]||0;
        APH.UI.setHint('[回车购买] '+tdef.name+' Lv'+lv+'/'+tdef.max+
          ' · '+tdef.desc+' · '+tdef.cost+'研究点 (再按T换, Enter买)');
      }
      if(e.code==='Enter'&&s.mode==='running'&&s.scene==='home'&&s.techSel){
        var r2=APH.Colony.buyTech(s.meta,s.techSel,s.meta.tech);
        if(r2.ok){
          s.meta.tech=r2.owned;
          APH.Save.saveMeta(s.meta);
          applyTech(s.meta,s.techSel);
          APH.UI.floatText('✔ 研究完成: '+APH.Colony.TECHS[s.techSel].name,'#59d9ff');
        }else{
          APH.UI.floatText('✕ 无法研究','#ff9a9a');
        }
      }
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
        /* 建造模式: 点地放置 */
        if(s.scene==='home'&&s.buildMode){
          var wx=e.clientX-innerWidth/2+s.camX, wy=e.clientY-innerHeight/2+s.camY;
          tryPlace(s.buildMode,wx,wy);
          return;
        }
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
    APH.SFX.unlock();
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
      if(!meta.tech) meta.tech={};
      if(!meta.res) meta.res={mineral:0, food:0};
      if(!meta.residents) meta.residents=[];   // P6 居民名册
      if(meta.residentSeq===undefined) meta.residentSeq=0;
      APH.state.meta=meta;
      applyAllTech(meta);
      APH.state.colony=loadColony();          // 殖民地布局持久化
      APH.World.initCanvas();
      APH.Ent.bindCtx(document.getElementById('cv').getContext('2d'));
      var seed=(Date.now()%100000)|0;
      APH.SFX.bindBus();
      APH.SFX.restore(meta);
      /* 设计支柱: 永远出生在殖民地 */
      enterHome();
      bindInput();
      bindLLMPanel();
      APH.UI.updHUD();
      document.title='✓就绪 殖民地'+(APH.LLM.enabled()?' ·AI':'');
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

  /* ================= T5 图鉴 ================= */
  function toggleCodex(){
    var el=document.getElementById('codex');
    if(!el) return;
    var show = el.style.display==='none';
    el.style.display = show ? '' : 'none';
    if(show) renderCodex();
  }
  function esc(t){ return String(t).replace(/</g,'&lt;'); }
  function renderCodex(){
    var s=APH.state, body=document.getElementById('codexBody');
    if(!body) return;
    var html='';
    html+='<div style="color:#59d9ff;margin-bottom:4px">'+esc(s.spec.name)+' · '+
          esc(s.spec.paletteName)+' · 难度 '+'★'.repeat(s.spec.tier||1)+'</div>';
    /* 已录入异常 */
    html+='<div style="margin-top:14px;color:#ffc857">已录入异常 ('+s.found+'/'+s.totalBeacons+')</div>';
    s.entities.forEach(function(e){
      if(e.type!==T.BEACON) return;
      if(e.done) html+='<div style="color:#9fe8c8">◈ '+esc(e.name)+' — '+esc((e.lore||'').slice(0,60))+'…</div>';
      else       html+='<div style="color:#39435c">◇ 未扫描</div>';
    });
    /* 已知生物 */
    html+='<div style="margin-top:14px;color:#ffc857">已知生物</div>';
    (s.spec.enemies.factions||[]).forEach(function(f){
      html+='<div><span style="display:inline-block;width:10px;height:10px;border-radius:50%;'+
            'background:hsl('+f.gene.hue+',62%,52%);margin-right:6px"></span>'+
            '<b>'+esc(f.name)+'</b> <span style="color:#8fa3cc">'+esc(f.behavior)+
            ' · HP '+f.hp+'</span><br><span style="color:#5d6f96">'+esc(f.lore||'')+'</span></div>';
    });
    /* 环境法则 */
    if(s.spec.laws && s.spec.laws.length){
      html+='<div style="margin-top:14px;color:#ffc857">环境法则</div>';
      s.spec.laws.forEach(function(l){
        html+='<div style="color:#8fa3cc">· <b style="color:#cdd9f5">'+esc(l.name||l.id)+'</b> '+esc(l.fact||'')+'</div>';
      });
    }
    body.innerHTML=html;
    document.getElementById('codexSub').textContent=
      '殖民地数据库 · 远征档案实时同步';
  }

  /* 调试接口(标题探针之外的程序化验证通道) */
  APH.Main={
    start:startGame,
    /* 自动化验证通道: 场景链路直调 */
    debugTeleportPad:function(){
      var s=APH.state;
      var pad=s.entities.find(function(e){return e.type===T.BUILDING&&e.pad;});
      if(pad){ s.px=pad.x; s.py=pad.y+30; s.camX=pad.x; s.camY=pad.y;
        document.title='DBG 已到发射台'; }
    },
    debugPressE:function(){
      var s=APH.state;
      if(s.scene==='home'&&s.nearPad) launchExpedition();
      else if(s.scene==='expedition'&&s.nearPad) returnHome();
      document.title='DBG E@'+s.scene+' nearPad='+s.nearPad;
    },
    guardTrim:guardTrim,
    toggleCodex:toggleCodex,
    renderCodex:renderCodex,
    perfGuard:perfGuard,
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
