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
  /* 真实可视区域(canvas实际显示尺寸), 预览面板缩放/分栏安全 */
  function vpW(){ var v=APH.World.getViewport(); return (v&&v.w)||innerWidth; }
  function vpH(){ var v=APH.World.getViewport(); return (v&&v.h)||innerHeight; }

  /* ================= 全局状态（唯一实例） ================= */
  APH.state = {
    mode:'intro',                // intro | running | dead | won
    scene:'home',                // home=殖民地(安全) | expedition=星球远征
    clock:0,
    spec:null,                   // 当前 PlanetSpec (ADR-1)
    px:0, py:0, vx:0, vy:0,
    face:-Math.PI/2, walkPh:0, moving:false, run:false,
    downed:false,                // #72 家园击倒: 运行时镜像(meta.playerNeeds.downed 真源)
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
    nearBed:null,                // #66 床边睡眠: 最近的居住舱实体 | null
    nearFood:null,               // #65 走到粮边吃: 近处粮堆/仓库 {entity,itemId,isCooked}|{isWarehouse:true} | null
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
    syncResidentEntities();
    applyFirstNightHint();
    tryFirstNightVisitor();
    /* 远征战利品在出发前就已结算; 回家只做补给 */
    s.o2=CFG.player.o2Max; s.hp=CFG.player.hpMax;
    /* #72 家园击倒: 返航/读档防御性清除击倒(hp 已回满, 避免 stale downed 秒死/卡昏迷) */
    if(s.meta && s.meta.playerNeeds){
      s.meta.playerNeeds.downed = false;
      s.meta.playerNeeds.downT = null;
    }
    s.downed = false;
    document.getElementById('planetTitle').textContent =
      '新曙光殖民地 · 家园';
    applyFirstNightHint();
  }
  function launchExpedition(){
    var s = APH.state;
    if(s.scene==='expedition') return;
    closeColonyOverlays();
    saveColony();
    var sh=APH.Colony.shortageBrief(s.meta, s.colony.buildings, extraRes());
    APH.UI.floatText(sh.mission,'#ffc857');
    /* T9: 超重出发提醒(不阻止) */
    var loadW=APH.Combat.carryWeight(s.carry);
    var capNow=APH.Colony.carryMaxOf(s.colony.buildings);
    if(loadW > capNow*.7){
      APH.UI.floatText('⚠ 负重 '+loadW+'/'+capNow+
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
      s.runLoot=0;
      s.settledLoot=0;
      s.landedAt=s.clock||0;
      s.clinicKit = s.colony.buildings.some(function(b){ return b.id==='bl_clinic'; }) ? 1 : 0;
      s.lastExpedition=p;                          // 袭击刷怪用, 不写回家园 spec
      s.spawnT=8;
      /* 着陆点的返回舱(发射台): 靠近按 E 返航 */
      s.entities.push({
        id:'be_pad', type:T.BUILDING, bid:'bl_landing_pad',
        x:CFG.HAB.x, y:CFG.HAB.y+70, def:APH.Colony.get('bl_landing_pad'), pad:true,
      });
      /* 远征野生异星植物生成 (Flora #36) */
      if(APH.Planet && APH.Planet.generateExpeditionFlora){
        var expFlora = APH.Planet.generateExpeditionFlora(p.seed, p.tier||1);
        expFlora.forEach(function(f){ s.entities.push(f); });
      }
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
    APH.UI.setHint('已着陆 '+s.spec.name+'。'+sh.mission+' · 返航按 [E]');
    var lawBits=[];
    if(APH.Planet.hasLaw(s.spec,'lw_echo')) lawBits.push('声追者：少开枪');
    if(APH.Planet.hasLaw(s.spec,'lw_spore_light')) lawBits.push('孢子趋光：光会开路');
    if(APH.Planet.hasLaw(s.spec,'lw_night_acid')) lawBits.push('夜间勿近湖');
    if(lawBits.length) APH.UI.floatText('法则 · '+lawBits.join(' / '),'#c39bff');
    U.emit('launched',{});
  }

  /* 返回殖民地(发射台交互) */
  function returnHome(){
    var s=APH.state;
    if(s.scene!=='expedition') return;
    closeColonyOverlays();
    /* 结算远征收益: 只在返航入账。着陆点不再自动卸货。 */
    var goods=APH.Combat.settleGoods(s.carry);
    s.meta.res = s.meta.res || { mineral:0, food:0, leather:0 };
    s.meta.research += goods.research;
    s.meta.stats.scans = s.meta.stats.scans||0;
    var specN=0, seedN=0, sk;
    if(goods.specimens){ for(sk in goods.specimens) specN+=goods.specimens[sk]||0; }
    if(goods.seeds){ for(sk in goods.seeds) seedN+=goods.seeds[sk]||0; }
    var gained = goods.research + goods.mineral + specN + seedN;
    if(gained>0){
      APH.Save.saveMeta(s.meta);
      var bits=[];
      if(goods.mineral) bits.push('矿材 '+goods.mineral+' 卸在地上');
      if(specN) bits.push('标本 '+specN+' 卸在地上');
      if(seedN) bits.push('种荚 '+seedN+' 卸在地上');
      if(goods.research) bits.push('研究点 +'+goods.research);
      APH.UI.floatText('远征结算 '+bits.join(' / '),'#ffe28a');
    }else if((s.runLoot||0)>0 || (s.settledLoot||0)>0){
      /* 战利品已转化入库, 不得谎称空手而归 */
    }else{
      APH.UI.floatText('空手而归','#8fa3cc');
    }
    if(gained>0) s.settledLoot=(s.settledLoot||0)+gained;
    var foundN=s.found, cryN=s.carry['it_crystal_ore']||0;
    s.carry={};
    enterHome();
    var padDrop=s.entities.find(function(e){ return e.type===T.BUILDING && e.pad; });
    var dx=padDrop?padDrop.x:CFG.HAB.x, dy=padDrop?(padDrop.y+36):(CFG.HAB.y+140);
    if(goods.mineral>0){
      APH.Combat.spawnDrop(dx, dy, 'it_mineral', goods.mineral, {jitter:22, stock:true});
    }
    if(goods.specimens){
      Object.keys(goods.specimens).forEach(function(id){
        if(goods.specimens[id]>0) APH.Combat.spawnDrop(dx, dy, id, goods.specimens[id], {jitter:18, stock:true});
      });
    }
    if(goods.seeds){
      Object.keys(goods.seeds).forEach(function(id){
        if(goods.seeds[id]>0) APH.Combat.spawnDrop(dx, dy, id, goods.seeds[id], {jitter:18, stock:true});
      });
    }
    if(goods.mineral>0 || specN>0 || seedN>0) saveColony();
    U.emit('returnedHome',{ research:goods.research, mineral:goods.mineral, beacons:foundN });
    log('远征归来: 异常 '+foundN+'/'+s.totalBeacons+
        (gained>0?' · 矿'+goods.mineral+' 研'+goods.research:''));
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
      /* 着陆点只补给, 战利品等返航 returnHome 结算 */
      APH.UI.setHint('返回舱 · 补给中 (氧气/生命)');
    }else{
      s.o2 -= dt*CFG.player.o2Drain;
      if(s.o2<25) APH.UI.setHint('⚠ 氧气 '+Math.max(0,Math.round(s.o2))+'% —— 回舱或采集粉色晶体！');
    }
    /* lw_night_acid: 夜间靠近湖岸腐蚀 */
    var night=APH.World.daylight()<.5;
    var hasAcid=APH.Planet.hasLaw(s.spec, 'lw_night_acid');
    if(night && hasAcid){
      var lakeR=(s.spec.terrain&&s.spec.terrain.lakeR)||CFG.LAKE.r;
      if(U.dst(s.px,s.py,CFG.LAKE.x,CFG.LAKE.y) < lakeR+24){
        s.acidT=(s.acidT||0)+dt;
        if(s.acidT>=1){
          s.acidT=0;
          APH.Combat.hurtPlayer(4, '湖水酸化');
        }
      }else s.acidT=0;
    }
    if(s.o2<=0){
      s.mode='dead';
      U.emit('gameOver',{});
      APH.state.meta.stats.deaths++;
      APH.Save.saveMeta(APH.state.meta);
      APH.UI.showDeath('生命维持系统在荒原上停转了。', {
        cry:s.cry, found:s.found, total:s.totalBeacons, carry:s.carry,
        runLoot:s.runLoot, survived:s.clock-(s.landedAt||0)});
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
    s.camX=U.clamp(s.camX,vpW()/2-80,CFG.WORLD-vpW()/2+80);
    s.camY=U.clamp(s.camY,vpH()/2-80,CFG.WORLD-vpH()/2+80);
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
  /* #66 床边睡眠: meta 真源 → 实体俯卧标志的同步助手(幂等, 每帧可调) */
  function playerSleeping(){
    var s=APH.state;
    return !!(s.meta && s.meta.playerNeeds && s.meta.playerNeeds.isSleeping);
  }
  /* #72 家园击倒: 玩家击倒昏迷(不可移动/交互, 只等送医或倒计时) */
  function playerDowned(){
    var s=APH.state;
    return !!(s.meta && s.meta.playerNeeds && s.meta.playerNeeds.downed);
  }
  /* #70 医疗舱躺下: 玩家当前是否生病(病情>0) */
  function playerSick(){
    var s=APH.state;
    return !!(s.meta && s.meta.playerNeeds && s.meta.playerNeeds.illness > 0);
  }
  /* #65 走到粮边吃: 玩家当前饱食(缺省 homeFoodStart) */
  function playerFood(){
    var s=APH.state;
    var start=(CFG.player&&CFG.player.homeFoodStart!=null)?CFG.player.homeFoodStart:80;
    if(!(s.meta&&s.meta.playerNeeds)) return start;
    return (s.meta.playerNeeds.food==null)?start:s.meta.playerNeeds.food;
  }
  /* #65 走到粮边吃: 饥饿阈值(防老档/降级 CFG 缺字段) */
  function foodEatBelow(){
    return (CFG.player&&CFG.player.foodEatBelow!=null)?CFG.player.foodEatBelow:60;
  }
  /* #65 走到粮边吃: E 吃一口(bindInput 与 debugPressE 共用, 避免双份逻辑)。
     只消费 s.nearFood 指向的粮堆/仓库, 绝不写 s.target 自动寻路。 */
  function tryPlayerEatNearFood(){
    var s=APH.state;
    if(!s.nearFood) return false;
    if(!s.meta.playerNeeds && APH.Res && APH.Res.ensurePlayerNeeds) APH.Res.ensurePlayerNeeds(s.meta);
    if(playerFood()>=foodEatBelow()){
      APH.UI.floatText('🍽 不饿，先不吃','#8fd4ff');
      return false;
    }
    var itemId=s.nearFood.itemId||'it_food';
    var itemDef=(CFG.items&&CFG.items[itemId])||{ name:'食物', foodGain:25 };
    var taken=0;
    if(s.nearFood.isWarehouse){
      /* 仓库: 先验库存再扣(防玩家与居民抢粮吃空后仍加饱食) */
      if(!(s.meta.res && (s.meta.res.food||0)>=1)) return false;
      s.meta.res.food--;
      taken=1;
    }else{
      /* 地上粮堆: 优先吃当前近的堆; 被搬走/吃空则兜底从任意粮堆取 */
      var pile=s.nearFood.entity;
      if(pile && !pile.dead && (pile.n||0)>=1){
        pile.n=(pile.n||1)-1;
        if((pile.n||0)<=0) pile.dead=true;
        taken=1;
      }else{
        taken=APH.Colony.takeFromGround(s.entities,'food',1,false);
      }
    }
    if(taken<=0) return false;
    var res=APH.Res.playerEatOnce(s.meta.playerNeeds,itemDef);
    if(!res || !res.ate) return false;   // 双保险(上面已拦满, 理论上到不了)
    APH.UI.floatText('🍽 进食 +'+res.gain,'#7dffab');
    return true;
  }
  function syncPlayerSleep(){
    var s=APH.state;
    var pe=APH.Ent && APH.Ent.findPlayer ? APH.Ent.findPlayer() : null;
    if(pe && s.meta && s.meta.playerNeeds){
      pe.isSleeping = !!s.meta.playerNeeds.isSleeping;
      pe.downed = !!s.meta.playerNeeds.downed;   // #72 家园击倒: 实体俯卧标志同步(送医复活后清)
    }
  }
  function updateHome(dt){
    var s=APH.state;
    /* #72 家园击倒: 首帧保证 playerNeeds 存在(否则击倒/送医无挂载点) */
    if(!s.meta.playerNeeds && APH.Res && APH.Res.ensurePlayerNeeds) APH.Res.ensurePlayerNeeds(s.meta);
    APH.Ent.updatePlayer(dt);
    updateCamera(dt);

    /* 发射台 / 过客接近检测 */
    var pad = s.entities.find(function(e){ return e.type===T.BUILDING && e.pad; });
    s.nearPad = pad ? U.dst(s.px,s.py,pad.x,pad.y) < 90 : false;
    s.nearVisitor = nearestVisitor(s);
    var nearPlot = s.entities.find(function(e){
      return (e.type===T.BUILDING && (e.bid==='bl_crop_plot'||e.bid==='bl_farm') && U.dst(s.px,s.py,e.x,e.y)<60);
    });
    s.nearCropPlot = nearPlot || null;
    var nearShop = s.entities.find(function(e){
      return (e.type===T.BUILDING && e.bid==='bl_workshop' && U.dst(s.px,s.py,e.x,e.y)<60);
    });
    s.nearWorkshop = nearShop || null;
    var nearKitchen = s.entities.find(function(e){
      return (e.type===T.BUILDING && e.bid==='bl_kitchen' && U.dst(s.px,s.py,e.x,e.y)<60);
    });
    s.nearKitchen = nearKitchen || null;
    var nearCampfire = s.entities.find(function(e){
      return (e.type===T.BUILDING && e.bid==='bl_campfire' && U.dst(s.px,s.py,e.x,e.y)<50);
    });
    s.nearCampfire = nearCampfire || null;
    var nearLab = s.entities.find(function(e){
      return (e.type===T.BUILDING && e.bid==='bl_lab' && U.dst(s.px,s.py,e.x,e.y)<60);
    });
    s.nearLab = nearLab || null;
    /* #66 床边睡眠: 靠近居住舱即可 E 入睡(只置 nearBed, 绝不 s.target=自动寻路) */
    var nearBed = s.entities.find(function(e){
      return (e.type===T.BUILDING && e.bid==='bl_house' &&
              U.dst(s.px,s.py,e.x,e.y) < (CFG.player.bedSleepRadius!=null?CFG.player.bedSleepRadius:60));
    });
    s.nearBed = nearBed || null;
    /* #70 医疗舱躺下: 靠近医疗舱即可 E 躺下(只置 nearClinic, 绝不 s.target=自动寻路) */
    var nearClinic = s.entities.find(function(e){
      return (e.type===T.BUILDING && e.bid==='bl_clinic' &&
              U.dst(s.px,s.py,e.x,e.y) < (CFG.player.clinicSleepRadius!=null?CFG.player.clinicSleepRadius:60));
    });
    s.nearClinic = nearClinic || null;
    /* #65 走到粮边吃: 近处粮堆(熟食优先→最近)或仓库(兜底, 仓有粮才提示)。
       只置 s.nearFood, 绝不写 s.target 自动寻路(铁律) */
    var nearFood=null;
    var eatR65=(CFG.player&&CFG.player.foodEatRadius!=null)?CFG.player.foodEatRadius:60;
    var bestPile=null, bestCooked=null, bestPileD=eatR65, bestCookedD=eatR65;
    (s.entities||[]).forEach(function(p){
      if(!p || p.dead || p.type!==T.DROPPED) return;
      var it=CFG.items&&CFG.items[p.itemId];
      if(!it || it.store!=='food') return;
      var dist=U.dst(s.px,s.py,p.x,p.y);
      if(it.isCooked && dist<bestCookedD){
        bestCookedD=dist; bestCooked={ entity:p, itemId:p.itemId, isCooked:true };
      }
      if(dist<bestPileD){
        bestPileD=dist; bestPile={ entity:p, itemId:p.itemId, isCooked:!!it.isCooked };
      }
    });
    if(bestCooked) nearFood=bestCooked;
    else if(bestPile) nearFood=bestPile;
    else{
      /* 仓库兜底: 仅当仓有粮(meta.res.food>0)才提示(空仓不提示) */
      var wh65=null;
      (s.entities||[]).forEach(function(b){
        if(!wh65 && b && b.type===T.BUILDING && b.bid==='bl_warehouse' && !b.dead) wh65=b;
      });
      var st65=wh65 ? {x:wh65.x, y:(wh65.y||0)+18} : APH.Colony.stockpileSpot(s.colony&&s.colony.buildings);
      if((s.meta.res && s.meta.res.food>0) && U.dst(s.px,s.py,st65.x,st65.y)<eatR65){
        nearFood={ isWarehouse:true };
      }
    }
    s.nearFood = nearFood || null;
    syncPlayerSleep();
    /* #72 家园击倒: s.downed 运行时镜像(读自 meta 真源, 供 drawPlayer 俯卧) */
    var needs = s.meta && s.meta.playerNeeds;
    s.downed = !!(needs && needs.downed);
    var nearFlora = s.entities.find(function(e){
      return (e.type===T.FLORA && !e.dead && U.dst(s.px,s.py,e.x,e.y)<48);
    });
    s.nearFlora = nearFlora || null;
    updateVisitors(dt);
    /* C: 游商走了/离远了自动收面板 */
    var tpO=document.getElementById('tradePanel');
    if(tpO && tpO.style.display!=='none' && !currentTrader()) toggleTradePanel(false);
    if(s.nearVisitor){
      var vp=s.nearVisitor.profile||s.nearVisitor;
      var skn=APH.Res.SKILL_NAMES[vp.mainSkill]||'';
      var ctxH=makeRecruitCtx(s.nearVisitor);
      var intent=APH.Res.joinIntentOf(vp);
      var tag=intent==='refugee'?'难民':(intent==='trader'?'游商':'过路客');
      var mealCost=(CFG.recruit&&CFG.recruit.mealCost)||2;
      var imp=Math.round(s.nearVisitor.impression!=null?s.nearVisitor.impression:50);
      var mealBit='';
      if(!s.nearVisitor.fed){
        mealBit=haveStock('food')>=mealCost
          ? '  [F] 请客(-'+mealCost+'粮)'
          : '  [F] 没粮请客';
      }
      if(s.nearVisitor.trade) mealBit+='  [E] 交易';
      if((s.nearVisitor.askCd||0)>0){
        APH.UI.setHint(vp.name+' 还想再看看… · 印象'+imp+mealBit);
      }else{
        var ch=APH.Res.joinChance(vp, ctxH);
        var extra=ch.ok
          ? (intent==='refugee'?' · 会留下':' · '+APH.Res.chanceLabel(ch.chance))
          : ' — '+ch.why;
        APH.UI.setHint((intent==='trader'?'[E] ':'[E] 招募 ')+
          (vp.name||'过客')+' · '+tag+
          (skn?' · '+skn+(vp.skills&&vp.skills[vp.mainSkill]||''):'')+
          (vp.trait?' · '+vp.trait:'')+ extra+' · 印象'+imp+mealBit);
      }
    }else if(s.nearBed){
      /* #66 床边睡眠: 优先于发射台提示 */
      var restN = (s.meta && s.meta.playerNeeds && s.meta.playerNeeds.rest!=null)
        ? s.meta.playerNeeds.rest : 100;
      var bedHint = playerSleeping()
        ? '[E] 起床 (按方向键或受伤也会醒)'
        : '[E] 上床睡觉 (精力 '+Math.round(restN)+')';
      APH.UI.setHint(bedHint);
    }else if(s.nearClinic && (playerSleeping() || playerSick())){
      /* #70 医疗舱躺下: 靠近医疗舱且生病/躺舱中的 E 提示(早于'医疗舱·缓慢治疗') */
      var illN = (s.meta && s.meta.playerNeeds && s.meta.playerNeeds.illness!=null)
        ? s.meta.playerNeeds.illness : 0;
      var podHint = playerSleeping()
        ? '[E] 起床 (按方向键或受伤也会醒)'
        : '[E] 躺进医疗舱 (病情 '+Math.round(illN)+')';
      APH.UI.setHint(podHint);
    }else if(s.nearFood && playerFood() < foodEatBelow()){
      /* #65 走到粮边吃: 饥饿时近粮堆/仓库的 E 提示(插在近医疗舱之后、厨房之前) */
      var srcName65 = s.nearFood.isWarehouse ? '仓库口粮' : ((CFG.items[s.nearFood.itemId]||{}).name||'食物');
      APH.UI.setHint('[E] 吃 '+srcName65+' (饱食 '+Math.round(playerFood())+')');
    }else if(s.nearKitchen){
      var kRec = (s.nearKitchen.recipe || 'it_roasted_meat');
      var kName = (APH.Colony.COOK_RECIPES[kRec] && APH.Colony.COOK_RECIPES[kRec].name) || kRec;
      APH.UI.setHint('烹饪灶台 · [F] 切换菜谱 (' + kName + ')');
    }else if(s.nearCampfire){
      var cRec = (s.nearCampfire.recipe || 'it_roasted_meat');
      var cName = (APH.Colony.COOK_RECIPES[cRec] && APH.Colony.COOK_RECIPES[cRec].name) || cRec;
      APH.UI.setHint('石料篝火 · 取暖保暖 · [F] 切换配方 (' + cName + ')');
    }else if(s.nearLab){
      var labRec = buildingRecordOf(s.nearLab);
      var labT = (labRec && labRec.analysisTarget) || s.nearLab.analysisTarget || 'specimen_flora_glow';
      var labDef = APH.Colony.SPECIMEN_ANALYSIS[labT];
      var labNm = (labDef && labDef.name) || labT;
      var labHave = (s.meta.res && s.meta.res[labT]) || 0;
      var labProg = (labRec && labRec.analysisProgress != null) ? labRec.analysisProgress
        : (s.nearLab.analysisProgress || 0);
      var labPct = labDef ? Math.min(100, Math.floor(100*labProg/(labDef.craftTime||15))) : 0;
      APH.UI.setHint('科研站 · [F] 切换化验 ('+labNm+' '+labPct+'% · 库存×'+labHave+')');
    }else if(s.nearCropPlot){
      var plotCrop = s.nearCropPlot.crop;
      var plotNm = (plotCrop && APH.Colony.ALIEN_CROPS[plotCrop] && APH.Colony.ALIEN_CROPS[plotCrop].name) || '未选定';
      APH.UI.setHint('种植圃 · [F] 切换已化验作物 ('+plotNm+')');
    }else if(s.nearWorkshop){
      var wRec = s.nearWorkshop.recipe || 'it_pickaxe';
      var wName = (APH.Colony.CRAFT_RECIPES[wRec] && APH.Colony.CRAFT_RECIPES[wRec].name) || wRec;
      APH.UI.setHint('工坊 · [F] 切换配方 ('+wName+')');
    }else if(s.nearPad && !s.war.raidActive && !(s.war.raidWarn>0)){
      var shPad=APH.Colony.shortageBrief(s.meta, s.colony.buildings, extraRes());
      APH.UI.setHint('[E] 登船 · '+shPad.mission);
    }else if(!s.war.raidActive && !(s.war.raidWarn>0)){
      var objH = window.APH.Opening && APH.Opening.objective
        ? APH.Opening.objective(s.meta&&s.meta.opening, (s.colony&&s.colony.buildings)||[])
        : null;
      if(objH) APH.UI.setHint(objH.text);
      else {
        var hintEl=document.getElementById('hint');
        var cur=hintEl&&hintEl.textContent||'';
        if(cur.indexOf('[E] 登船')===0 || cur.indexOf('[E] 招募')===0)
          APH.UI.setHint('');
      }
    }

    /* 家园: 氧气始终补; 生命只在靠近医疗舱时缓慢回 */
    var clinicB=null;
    (s.colony.buildings||[]).forEach(function(b){ if(b.id==='bl_clinic') clinicB=b; });
    var cDist=clinicB?U.dst(s.px,s.py,clinicB.x,clinicB.y):null;
    var rg=APH.Combat.homeRegen(s.hp, s.o2, dt, clinicB?cDist:null);
    s.hp=rg.hp; s.o2=rg.o2;
    /* #72 家园击倒: 送医拖行(世界侧 lerp) → 每帧结算(送医复活/倒计时死亡)。
       顺序固定: updatePlayer → carry(拖近) → tick(用拖后位置判 inClinic)。 */
    carryPlayerToClinic(dt);
    var healR72=(CFG.player.clinicHealR!=null)?CFG.player.clinicHealR:80;
    var hasRes72=(s.meta.residents||[]).length>0;
    var res72=APH.Res.playerDownedTick(needs, s.scene, dt, {
      inClinic: !!(clinicB && U.dst(s.px,s.py,clinicB.x,clinicB.y) < healR72),
      hasClinic: !!clinicB,
      hasResidents: hasRes72,
    });
    if(res72.dead && s.mode==='running'){
      s.mode='dead'; U.emit('gameOver',{});
      s.meta.stats.deaths++;
      APH.Save.saveMeta(s.meta);
      if(window.APH.UI && APH.UI.showDeath) APH.UI.showDeath('你在殖民地倒下，失血过多。', {
        cry:s.cry, found:s.found, total:s.totalBeacons, carry:s.carry, runLoot:s.runLoot,
        survived:s.clock-(s.landedAt||0),
      });
    }else if(res72.revived){
      s.hp = Math.min(CFG.player.hpMax, (CFG.economy&&CFG.economy.clinicHeal)||40);
      s.downed=false;
      if(window.APH.UI && APH.UI.floatText) APH.UI.floatText('✚ 居民把你抬进医疗舱 · 脱离危险','#7dffab');
    }
    var healR=(CFG.player.clinicHealR!=null)?CFG.player.clinicHealR:80;
    if(clinicB && cDist<healR && s.hp<CFG.player.hpMax &&
       !s.nearPad && !s.nearVisitor && !s.war.raidActive && !(s.war.raidWarn>0)){
      APH.UI.setHint('医疗舱 · 缓慢治疗');
    }else if(!s.nearPad && !s.nearVisitor && !s.war.raidActive && !(s.war.raidWarn>0)){
      var nightW=APH.World.daylight()<.5;
      var wx=APH.Colony.harvestMods(s.spec&&s.spec.laws, s.clock, nightW);
      if(wx.storm && !s._stormOn)
        APH.UI.floatText('⚡ 磁暴来袭 · 实验室停摆','#c39bff');
      if(wx.acid && !s._acidOn)
        APH.UI.floatText('🌧 酸雨 · 农田减半','#7dffab');
      s._stormOn=!!wx.storm; s._acidOn=!!wx.acid;
      if(wx.storm) APH.UI.setHint('⚡ 磁暴 · 实验室停摆');
      else if(wx.acid) APH.UI.setHint('🌧 酸雨 · 农田减半');
    }

    /* #72 家园击倒: 击倒昏迷提示(盖过一切环境提示; 复活后 needs.downed 为 false 自然失效) */
    if(needs && needs.downed && s.mode==='running'){
      APH.UI.setHint('击倒昏迷 · ' + (clinicB && hasRes72 ? '正在被送往医疗舱…' : '无人救援 · 生命垂危'));
    }

    /* 建造入口按钮显隐 */
    var bb=document.getElementById('buildBtn');
    if(bb) bb.style.display=(s.scene==='home')?'flex':'none';

    /* Task2v2: 建造队列——玩家或建造岗居民走到蓝图旁才施工 */
    updateResidents(dt);
    if(s.colony.buildQueue && s.colony.buildQueue.length){
      var bb=APH.Colony.builderBonusOf(s.meta.residents||[]);
      var near=[{x:s.px,y:s.py}];
      var builders={};
      var wpB=s.meta.workPrio||{};
      (s.meta.residents||[]).forEach(function(r){
        if(!APH.Colony.isBuilder(r)) return;
        if(r.job && r.job!=='blueprint') return;
        if(APH.Res.isBroken && APH.Res.isBroken(r)) return;   // 崩溃者不施工
        if(wpB[r.id] && wpB[r.id].sk_build===0) return;       // D: 建造被禁止
        builders[r.id]=true;
      });
      s.entities.forEach(function(en){
        if(en.type===T.RESIDENT && builders[en.rid||en.id]) near.push({x:en.x,y:en.y});
      });
      var qr=APH.Colony.queueTick(s.colony.buildQueue, dt, near, bb);
      s.colony.buildQueue=qr.queue;
      /* 施工粒子: 正在施工的蓝图冒尘 */
      s.colony.buildQueue.forEach(function(q){
        if(q.building && Math.random()<dt*6){
          s.parts.push({t:'dust',x:q.x+U.rr(-20,20),y:q.y+U.rr(-10,10),life:.5,max:.5});
        }
      });
      /* 同步蓝图实体进度 */
      s.colony.buildQueue.forEach(function(q){
        s.entities.forEach(function(en){
          if(en.type===T.BLUEPRINT && en.bid===q.bid &&
             Math.abs(en.x-q.x)<2 && Math.abs(en.y-q.y)<2){
            en.progress=q.progress||0; en.building=q.building;
          }
        });
      });
      qr.done.forEach(function(d){
        var b={id:d.bid,x:d.x,y:d.y,lv:1};
        /* T4 破墙: 墙块记录带耐久(旧存档缺 hp 由 Combat.wallHp 兜底) */
        if(d.bid==='bl_wall' && CFG.wall && CFG.wall.hp!=null) b.hp=CFG.wall.hp;
        s.colony.buildings.push(b);
        /* 移除对应蓝图实体 */
        s.entities=s.entities.filter(function(en){
          return !(en.type===T.BLUEPRINT&&en.bid===d.bid&&
                   Math.abs(en.x-d.x)<2&&Math.abs(en.y-d.y)<2);
        });
        /* ADR-13: 墙/闸门/陷阱/沙袋=格上静态物, 不入 entities[](防爆实体预算); 渲染走 walls 层 */
        var isGridStatic=(d.bid==='bl_wall'||d.bid==='bl_gate'||d.bid==='bl_spike_trap'||d.bid==='bl_sandbag');
        if(!isGridStatic){
          APH.Colony.placeBuildingEntity(d.bid,d.x,d.y,1);
          var justBuilt=s.entities[s.entities.length-1];
          if(justBuilt.type===T.BUILDING) justBuilt.builtT=0;   // 金色脉冲
        }else{
          /* M3 修复: 墙建成时若玩家在碰撞盒内, 沿最近轴推出(防被自己的墙钉死) */
          var wR=(CFG.wall||{}).collideR!=null ? CFG.wall.collideR : 35;
          if(d.bid==='bl_wall' && Math.abs(s.px-d.x)<wR && Math.abs(s.py-d.y)<wR){
            var dxW=s.px-d.x, dyW=s.py-d.y;
            if(Math.abs(dxW)>Math.abs(dyW)) s.px=d.x+(dxW>0?wR:-wR);
            else s.py=d.y+(dyW>0?wR:-wR);
            s.px=U.clamp(s.px,40,CFG.WORLD-40); s.py=U.clamp(s.py,40,CFG.WORLD-40);
          }
        }
        saveColony();
        if(d.bid==='bl_house' && window.APH.Opening && APH.Opening.noteHouse){
          APH.Opening.noteHouse(firstNightOpening(), s.clock||0);
          applyFirstNightHint();
          try{ APH.Save.saveMeta(s.meta); }catch(eH){}
        }
        U.emit('built',{id:d.bid});
        APH.UI.floatText('✔ '+APH.Colony.get(d.bid).name+' 建造完成','#9fe8c8');
        s.parts.push({t:'ping',x:d.x,y:d.y,life:.9,max:.9});
      });
    }

    /* 生产 tick: 每30游戏秒结算一次采矿机/科研站 (ADR-6 固定tick) */
    s.prodT=(s.prodT||0)+dt;
    if(s.prodT>=30){
      s.prodT-=30;
      (s.colony.buildings||[]).forEach(function(b){
        if(b.offlineT>0) b.offlineT=Math.max(0, b.offlineT-30);
      });
      /* T7 电网结算: powerSettle → 状态写入各建筑 b.powered/grid */
      var powRes=APH.Colony.powerSettle(s.colony.buildings, s.meta.res, s.power||(s.power={}), 30,
        { solarMul: APH.Colony.powerSolarMulOf(s.meta), isDay: APH.World.daylight()>=.5 });
      var powState=APH.Colony.applyPowerState(s.colony.buildings, powRes.status);
      (s.colony.buildings||[]).forEach(function(b){
        var pk=Math.round(b.x||0)+','+Math.round(b.y||0);
        var ps=powState[pk];
        if(ps){ b.powered=ps.powered; b.grid=ps.grid; }
        else if(APH.Colony.isPowerConsumer(b.id)){ b.powered=true; b.grid=false; }  // 未激活默认通电
      });
      s.powerStatus=powRes;
      var nightP=APH.World.daylight()<.5;
      var hmods=APH.Colony.harvestMods(s.spec&&s.spec.laws, s.clock, nightP);
      var prodWorkers=(s.meta.residents||[]).filter(function(r){
        return !(APH.Res.isBroken && APH.Res.isBroken(r));   // 崩溃者缺勤
      });
      var out=APH.Colony.productionTick(s.meta, s.colony.buildings, prodWorkers, hmods);
      (out.piles||[]).forEach(function(p){
        APH.Combat.spawnDrop(p.x+16, p.y+14, p.itemId, p.n, {stock:true});
      });
      if(out.mineral||out.research)
        APH.UI.floatText('生产: '+(out.mineral?'矿材×'+out.mineral+'堆在地上 ':'')+(out.research?'+'+out.research+' 研究点':''),'#9fe8c8');
      /* AI殖民地同步成长(同拍) */
      tickRivals(30/60);
      storyTick(30/60);                           // ADR-12 先于居民跳, 兽群本跳×3 才吃得到
      residentsTick();                            // P6-U2/U4/U7
    }

    /* 战争系统: 袭击预警与进行中 */
    if(s.war.raidWarn>0){
      s.war.raidWarn-=dt;
      APH.UI.setHint('⚠ '+s.war.raidFrom+'来袭! '+Math.ceil(s.war.raidWarn)+'s — 保卫殖民地!');
      if(s.war.raidWarn<=0) startRaid();
    }else if(s.war.raidActive){
      APH.Combat.updateCombat(dt, false);
      /* Task4: 炮塔开火(对射程内最近敌人; 士兵是友军) */
      var raidFoes=[];
      s.entities.forEach(function(e2){
        if(e2.type===T.ENEMY&&!e2.dead&&!e2.isSoldier) raidFoes.push(e2);
      });
      s.colony.buildings.forEach(function(b){
        if(b.id!=='bl_turret') return;
        if(!APH.Colony.turretFireAllowed(b)) return;   // T7 无电/耀斑停机
        var tw={x:b.x,y:b.y,lv:b.lv||1,cd:b.cd};
        var fired=APH.Combat.turretStep(tw,raidFoes,dt);
        b.cd=tw.cd;
        /* 视觉: 炮管指向目标 + 开火后坐动画 */
        if(fired && tw.lastTarget){
          b.aimA=Math.atan2(tw.lastTarget.y-b.y, tw.lastTarget.x-b.x);
          b.fireT=1;
        }
        if(b.fireT>0) b.fireT=Math.max(0,b.fireT-dt*3);
      });

      var RT=CFG.raidTactics||{};

      /* 阶段E: 围攻扎营期(炮击/倒计时/拆营判定) */
      siegeTick(dt);

      /* 阶段E: 双波间歇 */
      if(s.war.betweenWaves){
        s.war.nextWaveT-=dt;
        APH.UI.setHint('⚠ 第二波正在集结 '+Math.ceil(Math.max(0,s.war.nextWaveT))+'s — 方向会变!');
        if(s.war.nextWaveT<=0){
          s.war.betweenWaves=false;
          s.war.spawned=0;
          s.war.waveAngle=(s.war.waveAngle||0)+(RT.wave2Angle!=null?RT.wave2Angle:2.4);
          APH.UI.floatText('⚠ 第二波袭击!','#ff9a9a');
        }
      }

      /* 波次刷怪(袭击敌人从地图边缘冲基地; 围攻则刷在营地旁) */
      s.war.raidSpawnT=(s.war.raidSpawnT||0)-dt;
      var aliveEnemies=0;
      s.entities.forEach(function(e){
        if(e.type===T.ENEMY&&!e.dead&&!e.isSoldier) aliveEnemies++;
      });
      if(!s.war.betweenWaves && !s.war.routed &&
         aliveEnemies < s.war.wave.count && s.war.spawned<s.war.wave.count && s.war.raidSpawnT<=0){
        s.war.raidSpawnT=.7;
        var f=APH.Planet.pickRaidFaction(s.lastExpedition, s.seed);
        var ang=(s.war.waveAngle!=null)
          ? s.war.waveAngle+(Math.random()-.5)*.9
          : Math.random()*U.TAU;
        var d=Math.max(vpW(),vpH())*.62;
        var ex,ey;
        var camping=s.war.siege && s.war.siege.phase==='camp';
        if(camping){
          ex=U.clamp(s.war.siege.cx+U.rr(-60,60),40,CFG.WORLD-40);
          ey=U.clamp(s.war.siege.cy+U.rr(-60,60),40,CFG.WORLD-40);
        }else{
          ex=U.clamp(CFG.HAB.x+Math.cos(ang)*d,40,CFG.WORLD-40);
          ey=U.clamp(CFG.HAB.y+Math.sin(ang)*d,40,CFG.WORLD-40);
        }
        var en=APH.Ent.makeEnemy(f,ex,ey);
        if(camping){
          en.sieging=true; en.campX=s.war.siege.cx; en.campY=s.war.siege.cy;
          en.state='idle';
        }else{
          en.state='chase';                     // 直接冲基地
        }
        if(s.war.tactic==='pillage') en.pillager=true;
        s.entities.push(en);
        s.war.spawned++;
      }

      /* 阶段E: 溃退判定——伤亡比例达阈值全体撤退 */
      if(!s.war.routed){
        var totalPlanned=(s.war.wave.count||1)*((s.war.wave.waves||1));
        var routAt=RT.routAt!=null?RT.routAt:.6;
        if((s.war.casualties||0) >= Math.ceil(totalPlanned*routAt))
          raidRetreat('⚠ 伤亡过重, 敌军溃退!', false);
      }

      if(!s.war.betweenWaves && s.war.spawned>=s.war.wave.count){
        var left=0;
        s.entities.forEach(function(e){
          if(e.type===T.ENEMY&&!e.dead&&!e.isSoldier) left++;
        });
        if(left===0){
          if(!s.war.routed && (s.war.wavesLeft||0)>0){
            s.war.wavesLeft--;
            s.war.betweenWaves=true;
            s.war.nextWaveT=RT.waveGap!=null?RT.waveGap:45;
          }else{
            s.war.raidActive=false;
            clearSiegeCamp();
            if(s.war.escaped){
              APH.UI.floatText('⚠ 盗掠者满载而归…下次早点拦截','#ffb35c');
            }else{
              s.war.wins++;
              APH.UI.floatText('✔ 袭击被击退! 战争态势提升','#7dffab');
              U.emit('raidDefended',{});
            }
            saveWar();
          }
        }
      }
    }
    /* 掉落拾取不绑袭击: 末波击杀当帧清 raid 后地上战利品仍能捡 */
    APH.Combat.updateDropped(dt);
    if(!s.nearPad && !s.nearVisitor && !s.war.raidActive && !(s.war.raidWarn>0)){
      var shH=APH.Colony.shortageBrief(s.meta, s.colony.buildings, extraRes());
      if(shH.urgent) APH.UI.setHint(shH.text);
    }
  }

  /* ---- AI殖民地成长 + 袭击决策 ---- */
  function tickRivals(minutes){
    var s=APH.state;
    if(!s.rivalStates){ loadRivals(); }
    s.rivalStates.forEach(function(r){
      /* 畏缩时间递减 */
      if(r.cowedTime > 0) r.cowedTime = Math.max(0, r.cowedTime - minutes*60);
      var g=APH.Rivals.growthTick(r.rival, minutes, r.cowedTime);
      r.rival.military=g.military; r.rival.economy=g.economy;
      r.anger += minutes;
      /* 袭击决策(ADR-12 & ADR-17): 结合关系度与畏缩期 */
      var def=playerDefPower();
      var decision=APH.Rivals.shouldRaid(r.rival, def, r.anger, r.relation, r.cowedTime);
      r.wantRaid = !!decision.should;
    });
  }
  /* ev_raid 落地: 从备战的敌殖民地里挑军力最强者发动 */
  function launchRivalRaid(){
    var s=APH.state;
    if(s.war.raidActive || s.war.raidWarn>0) return false;
    if(!s.rivalStates) loadRivals();
    var pick=null;
    (s.rivalStates||[]).forEach(function(r){
      if(!r.wantRaid) return;
      if(!pick || r.rival.military>pick.rival.military) pick=r;
    });
    if(!pick) return false;
    pick.anger=0; pick.wantRaid=false;
    s.war.raidFrom=pick.rival.name;
    s.war.raidWarn=12;                      // 预警12s(原型缩短, 正式版60s)
    s.war.pendingWave=APH.Rivals.raidWave(pick.rival);
    saveRivals();
    return true;
  }
  /* ---- ADR-12 事件叙事者: 上下文汇总 + 节奏推进 + 效果落地 ---- */
  function storyCtx(){
    var s=APH.state, m=s.meta;
    var buildings=(s.colony&&s.colony.buildings)||[];
    var wealth=APH.Events.wealthScore(m, extraRes(), buildings);
    var moodAvg=100;
    if(m.residents && m.residents.length){
      var sum=0; m.residents.forEach(function(r){ sum+=r.mood||0; });
      moodAvg=sum/m.residents.length;
    }
    var rivalReady=false;
    (s.rivalStates||[]).forEach(function(r){ if(r.wantRaid) rivalReady=true; });
    return {
      wealth:wealth, threat:APH.Events.threatLevel(wealth),
      moodAvg:moodAvg,
      raidActive:!!(s.war.raidActive || s.war.raidWarn>0),
      residentCount:(m.residents||[]).length,
      hasSpareBed:housingCap()>(m.residents||[]).length,
      hasPasture:buildings.some(function(b){return b.id==='bl_pasture';}),
      hasFarm:buildings.some(function(b){return b.id==='bl_farm';}),
      hasTurret:buildings.some(function(b){return b.id==='bl_turret';}),
      visitorSlot:visitorCount()<((CFG.visitor&&CFG.visitor.max)||2),
      rivalReady:rivalReady,
      /* 天气上下文(ADR-15): 导演掷骰把当前天气交给 ev_weather 路径 */
      weather:m.weather || APH.Weather.defaultWeather(),
    };
  }
  function storyTick(dtMin){
    var s=APH.state, m=s.meta;
    if(s.scene!=='home') return;
    m.events=m.events||{ nextIn:null, sinceNeg:1e9, lastNeg:0, cooldowns:{}, history:[] };
    var seed=((s.seed||7)*613 + Math.floor(s.clock||0)*29 +
              ((m.events.history||[]).length)*101)>>>0;
    var rng=U.makeRng(seed);
    var out=APH.Events.directorTick(m.events, storyCtx(), rng, dtMin);
    var lastNeg=m.events.lastNeg||0;
    /* ev_weather 掷骰结果写回 meta.weather → 生产跳读取(ADR-15 生效链) */
    if(out.weather) m.weather=out.weather;
    m.events=Object.assign({}, out.state, { history:m.events.history||[], lastNeg:lastNeg });
    if(out.fired){
      m.events.history.push({ id:out.fired, at:Math.round(s.clock||0) });
      var hMax=(CFG.events&&CFG.events.historyMax!=null)?CFG.events.historyMax:40;
      if(m.events.history.length>hMax) m.events.history.shift();
      if(out.neg) m.events.lastNeg=Math.round(s.clock||0);
      applyEvent(out.fired, rng);
      saveMetaQuiet();
    }
  }
  function applyEvent(id, rng){
    var s=APH.state, m=s.meta;
    var E=CFG.events||{};
    var buildings=(s.colony&&s.colony.buildings)||[];
    var rand=rng||Math.random;
    var t=APH.Events.textOf(id);
    if(id==='ev_droppod'){
      var mR=E.droppodMineral||[4,8], fR=E.droppodFood||[2,4];
      var mn=mR[0]+Math.floor(rand()*(mR[1]-mR[0]+1));
      var fn=fR[0]+Math.floor(rand()*(fR[1]-fR[0]+1));
      var dR=E.droppodDist||[160,240];
      var ang=rand()*U.TAU, d=dR[0]+rand()*((dR[1]||dR[0])-dR[0]);
      var x=U.clamp(CFG.HAB.x+Math.cos(ang)*d, 80, CFG.WORLD-80);
      var y=U.clamp(CFG.HAB.y+Math.sin(ang)*d, 80, CFG.WORLD-80);
      var jit=E.droppodJitter!=null?E.droppodJitter:26;
      APH.Combat.spawnDrop(x, y, 'it_mineral', mn, {stock:true, jitter:jit});
      APH.Combat.spawnDrop(x+30, y+16, 'it_food', fn, {stock:true, jitter:jit});
      s.parts.push({t:'ping',x:x,y:y,life:.9,max:.9});
      s.shake=Math.min(1,s.shake+.3);
    }else if(id==='ev_refugee_wave'){
      var n=1+(rand()<(E.refugeeSecondP!=null?E.refugeeSecondP:.5)?1:0);
      for(var i=0;i<n;i++) spawnVisitor(null, {origin:'地球难民船'});
    }else if(id==='ev_herd'){
      var hmul=E.herdMul!=null?E.herdMul:3;
      buildings.forEach(function(b){
        if(b.id!=='bl_pasture') return;
        b.herdMul=hmul;                          // 本跳牧场产出×3(ranchTick 消耗)
      });
      saveColony();
    }else if(id==='ev_aurora'){
      var boost=E.auroraMood!=null?E.auroraMood:10;
      (m.residents||[]).forEach(function(r){ r.mood=Math.min(100,(r.mood||0)+boost); });
    }else if(id==='ev_trader_caravan'){
      spawnVisitor(null, {origin:'游商后代'});
    }else if(id==='ev_plague'){
      var ratio=E.plagueRatio!=null?E.plagueRatio:0.3;
      var ill=E.plagueIll!=null?E.plagueIll:15;
      var hitN=0;
      (m.residents||[]).forEach(function(r){
        if(rand()>=ratio) return;
        APH.Res.hurtResident(r, ill, 'plague');    // F: 疫病分型, 必须用药除根
        hitN++;
      });
      if(hitN===0 && (m.residents||[]).length){    // 疫病至少感染一人
        APH.Res.hurtResident(m.residents[Math.floor(rand()*m.residents.length)], ill, 'plague');
      }
      syncResidentEntities();
    }else if(id==='ev_blight'){
      var cut=E.blightCut!=null?E.blightCut:0.5;
      buildings.forEach(function(b){
        if(b.id!=='bl_farm' || !b.plot) return;
        b.plot={ stage:Math.floor((b.plot.stage||0)*cut), t:0 };
      });
      saveColony();
    }else if(id==='ev_solar_flare'){
      buildings.forEach(function(b){
        if(b.id==='bl_turret') b.offlineT=(b.offlineT||0)+(E.flareOffline!=null?E.flareOffline:60);
      });
      saveColony();
    }else if(id==='ev_raid'){
      /* 惊醒所有正在睡眠中的居民 */
      (m.residents||[]).forEach(function(r){
        if(r.isSleeping) APH.Res.disturbSleep(r);
      });
      if(!launchRivalRaid()) return;               // 没有备战的敌殖民地则无声跳过
    }
    var negCfg=(E.deck||{})[id]||{};
    APH.UI.floatText((negCfg.neg?'⚠ ':'◆ ')+t.name, negCfg.neg?'#ff9a9a':'#8fd4ff');
    APH.UI.showCard(t.name, t.lore);
    APH.Events.enrichEvent(id, s.seed).then(function(rich){
      if(rich && rich.lore && rich.lore!==t.lore) APH.UI.showCard(rich.name, rich.lore);
    });
    U.emit('storyEvent', { id:id });
  }

  function playerDefPower(){
    var s=APH.state;
    var turrets=s.colony.buildings.filter(function(b){return b.id==='bl_turret';}).length;
    return 10 + turrets*12 + APH.Colony.plasmaTechLevel(s.meta.tech)*5;
  }
  /* ---- 阶段E: 袭击战术辅助 ---- */
  function setupSiegeCamp(){
    var s=APH.state;
    var t=((CFG.raidTactics||{}).tactics||{}).siege||{};
    var d=t.campDist!=null?t.campDist:500;
    var ang=s.war.waveAngle||0;
    var cx=U.clamp(CFG.HAB.x+Math.cos(ang)*d,80,CFG.WORLD-80);
    var cy=U.clamp(CFG.HAB.y+Math.sin(ang)*d,80,CFG.WORLD-80);
    var hp=t.campHp!=null?t.campHp:60;
    var camp={ id:'bl_siege_camp_'+Date.now(), type:T.BUILDING, bid:'bl_siege_camp',
               x:cx, y:cy, hp:hp, maxHp:hp };
    s.entities.push(camp);
    s.war.siege={ phase:'camp',
                  t:(t.campSec!=null?t.campSec:90),
                  shellT:(t.shellPeriod!=null?t.shellPeriod:15),
                  campId:camp.id, cx:cx, cy:cy };
    APH.UI.floatText('⚠ 敌军在外围扎营围攻!','#ff9a9a');
  }
  function siegeTick(dt){
    var s=APH.state;
    var sg=s.war.siege;
    if(!sg || sg.phase!=='camp') return;
    var t=((CFG.raidTactics||{}).tactics||{}).siege||{};
    var camp=null;
    s.entities.forEach(function(e){ if(e.id===sg.campId && !e.dead) camp=e; });
    if(!camp){                              // 营地被拆(事件兜底)
      sg.phase='done';
      if(!s.war.routed) raidRetreat('✔ 围攻营地被摧毁, 敌军溃退!', false);
      return;
    }
    sg.t-=dt; sg.shellT-=dt;
    if(sg.shellT<=0){
      sg.shellT=t.shellPeriod!=null?t.shellPeriod:15;
      /* T4 炮击目标: 优先墙/炮塔(Combat.pickShellTarget 纯函数), 发射台除外 */
      var tgt=(window.APH.Combat && APH.Combat.pickShellTarget)
        ? APH.Combat.pickShellTarget(sg.cx, sg.cy, s.colony.buildings)
        : null;
      if(tgt){
        var dx=tgt.x-sg.cx, dy=tgt.y-sg.cy, dd=Math.sqrt(dx*dx+dy*dy)||1;
        var spd=t.shellSpeed!=null?t.shellSpeed:280;
        var pj=APH.Combat.makeProj(sg.cx, sg.cy, dx/dd*spd, dy/dd*spd, 'siege', 0);
        pj.life=t.shellLife!=null?t.shellLife:5;
        pj.offlineSec=t.shellOffline!=null?t.shellOffline:20;
        s.entities.push(pj);
        APH.UI.floatText('💥 围攻炮击!','#ff9a9a');
      }
    }
    APH.UI.setHint('⚠ 敌军扎营围攻中 '+Math.ceil(Math.max(0,sg.t))+'s — 出击拆营可解围!');
    if(sg.t<=0){
      sg.phase='charge';                    // 扎营结束转强攻
      camp.dead=true;
      s.entities.forEach(function(e){
        if(e.type===T.ENEMY&&!e.dead&&!e.isSoldier&&e.sieging){
          e.sieging=false; e.state='chase';
        }
      });
      APH.UI.floatText('⚠ 扎营结束, 敌军发起总攻!','#ff9a9a');
    }
  }
  /* 全体溃退: escaped=true 表示盗掠得手(不掉赃物) */
  function raidRetreat(msg, escaped){
    var s=APH.state, RT=CFG.raidTactics||{};
    if(s.war.routed) return;
    s.war.routed=true;
    s.war.escaped=!!escaped;
    s.war.wavesLeft=0; s.war.betweenWaves=false;
    if(s.war.wave) s.war.spawned=Math.max(s.war.spawned||0, s.war.wave.count||0);
    var dropRng=U.makeRng((((s.seed||7)*911)+Math.floor(s.clock||0)*17+(s.war.casualties||0)*13)>>>0);
    s.entities.forEach(function(e){
      if(e.type!==T.ENEMY||e.dead||e.isSoldier) return;
      e.retreat=true; e.sieging=false;
      if(!escaped && dropRng()<(RT.routDropChance!=null?RT.routDropChance:.5))
        APH.Combat.spawnDrop(e.x, e.y, 'it_mineral', 1, {jitter:14});
    });
    clearSiegeCamp();
    APH.UI.floatText(msg, escaped?'#ffb35c':'#ffd97a');
  }
  function clearSiegeCamp(){
    var s=APH.state;
    s.entities.forEach(function(e){
      if(e.type===T.BUILDING && e.bid==='bl_siege_camp') e.dead=true;
    });
    if(s.war.siege) s.war.siege.phase='done';
  }

  function startRaid(){
    var s=APH.state;
    s.war.raidActive=true;
    /* Task4: 兵营召唤驻守士兵 */
    var n=APH.Combat.soldierCount(s.colony.buildings.filter(function(b){return b.id==='bl_barracks';}));
    for(var i=0;i<n;i++){
      var sf=APH.Planet.pickRaidFaction(s.lastExpedition, s.seed);
      var sol=APH.Ent.makeEnemy(sf, CFG.HAB.x+U.rr(-80,80), CFG.HAB.y+U.rr(-60,60));
      sol.isSoldier=true;
      sol.hp=CFG.soldier.hp; sol.maxHp=CFG.soldier.hp;
      sol.faction=Object.assign({}, sf, { speed:CFG.soldier.speed, dmg:CFG.soldier.dmg });
      sol.state='idle';
      s.entities.push(sol);
    }
    if(n>0){
      var eat=APH.Colony.takeStock(s.meta.res, s.entities, 'food', n).taken||0;
      APH.UI.floatText('🛡 '+n+' 名士兵出动'+(eat?' · 口粮 -'+eat:''),'#ffc857');
      APH.Save.saveMeta(s.meta);
    }
    s.war.wave=s.war.pendingWave||{count:4};
    s.war.tactic=s.war.wave.tactic||'assault';
    s.war.spawned=0; s.war.raidSpawnT=0;
    s.war.casualties=0; s.war.stolen=0;
    s.war.routed=false; s.war.escaped=false;
    s.war.wavesLeft=Math.max(0,(s.war.wave.waves||1)-1);
    s.war.betweenWaves=false; s.war.nextWaveT=0;
    s.war.waveAngle=Math.random()*U.TAU;
    s.war.siege=null;
    if(s.war.tactic==='siege') setupSiegeCamp();
    APH.UI.setHint('');
    document.getElementById('vig').style.opacity=.5;
    setTimeout(function(){document.getElementById('vig').style.opacity=0;},900);
    U.emit('raidStarted',s.war.wave);
  }
  function loadRivals(){
    var s=APH.state;
    try{
      var v=JSON.parse(localStorage.getItem('aphelion_rivals_v1')||'null');
      if(v&&Array.isArray(v)) {
        s.rivalStates=v.map(function(r){
          if(r.relation == null && r.rival && r.rival.trait && APH.Rivals && APH.Rivals.defaultRelationOf)
            r.relation = APH.Rivals.defaultRelationOf(r.rival.trait);
          if(r.cowedTime == null) r.cowedTime = 0;
          if(r.pact == null) r.pact = false;
          return r;
        });
        return;
      }
    }catch(e){}
    /* 从当前星球spec初始化(首次) */
    var specRivals = window.APH.Planet.fallbackPlanet(s.seed||12345).rivals;
    s.rivalStates = specRivals.map(function(r){
      var defRel = (APH.Rivals && APH.Rivals.defaultRelationOf) ? APH.Rivals.defaultRelationOf(r.trait) : -20;
      return {
        rival:r,
        anger:0,
        relation: defRel,
        cowedTime: 0,
        pact: false
      };
    });
    saveRivals();
  }
  /* #72 家园击倒: 送医拖行(世界侧 lerp, 无新实体类型)。玩家击倒昏迷且有居民在场时,
     把玩家朝医疗舱拖; 已到治疗半径内则停下(交由 playerDownedTick 判复活)。 */
  function carryPlayerToClinic(dt){
    var s=APH.state;
    var needs=s.meta && s.meta.playerNeeds;
    if(!needs || !needs.downed) return;
    var clinicB=null;
    (s.colony.buildings||[]).forEach(function(b){ if(b.id==='bl_clinic') clinicB=b; });
    if(!clinicB) return;
    if(!(s.meta.residents||[]).length) return;             // 无人救援不拖
    var healR=(CFG.player.clinicHealR!=null)?CFG.player.clinicHealR:80;
    var dist=U.dst(s.px,s.py,clinicB.x,clinicB.y);
    if(dist < healR) return;                               // 已到舱内(送医完成, 等复活)
    var spd=(CFG.player.downedCarrySpeed!=null)?CFG.player.downedCarrySpeed:70;
    var step=Math.min(dt*spd, dist);
    var dx=clinicB.x-s.px, dy=clinicB.y-s.py;
    var l=Math.sqrt(dx*dx+dy*dy)||1;
    s.px += (dx/l)*step;
    s.py += (dy/l)*step;
    if(s.px<40) s.px=40; if(s.px>CFG.WORLD-40) s.px=CFG.WORLD-40;
    if(s.py<40) s.py=40; if(s.py>CFG.WORLD-40) s.py=CFG.WORLD-40;
    s.face=Math.atan2(dy,dx);
    var pe=APH.Ent && APH.Ent.findPlayer ? APH.Ent.findPlayer() : null;
    if(pe){ pe.x=s.px; pe.y=s.py; pe.face=s.face; }
  }

  function saveRivals(){
    try{ localStorage.setItem('aphelion_rivals_v1',
      JSON.stringify(APH.state.rivalStates)); }catch(e){}
  }
  function saveWar(){
    var s=APH.state;
    s.meta.war = s.meta.war || {wins:0, raids:0};
    s.meta.war.wins = s.war.wins||0;
    s.meta.war.raids = s.war.raids||0;
    try{ APH.Save.saveMeta(s.meta); }catch(e){}
  }
  function updateExpedition(dt){
    var s=APH.state;
    var night=APH.World.daylight()<.5;
    APH.Ent.updatePlayer(dt);
    if(APH.Planet.hasLaw(s.spec,'lw_spore_light')){
      (s.spores||[]).forEach(function(sp){ APH.Planet.sporeNudge(sp, s.px, s.py, dt); });
    }
    updatePickups(dt);
    updateInteraction(dt);
    updateSpawner(dt, night);
    APH.Combat.updateCombat(dt, night);
    APH.Combat.updateDropped(dt);
    /* 返回舱接近检测(玩家出生点旁) */
    var pad = s.entities.find(function(e){ return e.type===T.BUILDING && e.pad; });
    s.nearPad = pad ? U.dst(s.px,s.py,pad.x,pad.y) < 90 : false;
    var nearExpFlora = s.entities.find(function(e){
      return e.type===T.FLORA && !e.dead && U.dst(s.px,s.py,e.x,e.y)<50;
    });
    s.nearFlora = nearExpFlora || null;
    if(s.nearFlora && !s.nearPad && !s.nearBeacon){
      var seedName = (CFG.items[s.nearFlora.seedItem]&&CFG.items[s.nearFlora.seedItem].name)||'种子';
      APH.UI.setHint('[E] 采集异星样本 ('+seedName+')');
    }else if(s.nearPad && !s.nearBeacon){
      APH.UI.setHint('[E] 返航殖民地 (结算战利品)');
    }
    updateSurvival(dt);
    checkBossDown();
    if(s.mode!=='running') return;
    updateCamera(dt);
    selfCenter();
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
      if(e.type===T.ENEMY) return true;
      if(e.type===T.DROPPED && !e.stock) return true;
      return false;
    });
    expendable.sort(function(a,b){
      return U.dst(b.x,b.y,px,py)-U.dst(a.x,a.y,px,py);
    });
    var need=entities.length-cap, out=[];
    for(var i=0;i<need && i<expendable.length;i++) out.push(expendable[i].id);
    return out;
  }

  /* ================= 主循环 ================= */
  var lastT=performance.now(), tickN=0, frameErrors=0;
  function frame(now){
    try{
      _frameBody(now);
    }catch(err){
      /* 帧异常自愈: 记录并继续下一帧(防一条坏帧杀死整个rAF链) */
      frameErrors++;
      console.error('[frame]',frameErrors,err.message,err.stack&&err.stack.split('\n')[1]);
      if(frameErrors>200){ throw err; }   // 死循环保护
      lastT=now;                          // 重置时钟防dt爆冲
    }
  }
  function _frameBody(now){
    requestAnimationFrame(frame);
    tickN++;
    var s=APH.state;
    if(tickN%30===0){
      var dx=Math.round(s.px-s.camX), dy=Math.round(s.py-s.camY);
      document.title='▶帧'+tickN+' Δ('+dx+','+dy+') vw'+innerWidth+
        ' · '+s.found+'/'+s.totalBeacons;
    }
    perfGuard(now-lastT);
    var dt=Math.min(.05,(now-lastT)/1000); lastT=now;

    if(s.mode==='intro' && s.openingClock){
      if(window.APH.Opening) APH.Opening.tick(s.openingClock, dt);
      if(APH.UI && APH.UI.renderOpening) APH.UI.renderOpening(s.openingClock);
      var phase = window.APH.Opening && APH.Opening.audioOf
        ? APH.Opening.audioOf(s.openingClock) : 'silence';
      if(window.APH.Opening && APH.Opening.hasVideo && APH.Opening.hasVideo()) phase='silence';
      if(phase==='alarm'){
        s.openingAlarmT = (s.openingAlarmT||0) - dt;
        if(s.openingAlarmT<=0){
          s.openingAlarmT = (CFG.opening && CFG.opening.alarmPeriod) || 0.85;
          if(APH.SFX && APH.SFX.play) APH.SFX.play('openingAlarm');
        }
      }else{
        s.openingAlarmT = 0;
      }
      return;
    }

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
      selfCenter();
      /* 建造模式幽灵跟随鼠标(渲染在 world.render 之后) */
      APH.World.render(dt, homeDrawers());
      drawTutorialArrow(s.clock);
      drawDebugMark();
      APH.UI.updHUD();
      return;
    }

    var night = APH.World.daylight() < .5;
    updateExpedition(dt);
    if(s.mode!=='running') return;       // 本帧死亡

    if(tickN%30===0){
      /* 屏幕坐标探针: 角色在视口内的实际像素位置(应≈vw/2,vh/2) */
      var sx=Math.round(s.px-s.camX+vpW()/2),
          sy=Math.round(s.py-s.camY+vpH()/2);
      document.title='▶'+tickN+' 屏幕('+sx+','+sy+') 视口['+
        innerWidth+'x'+innerHeight+'] DPR'+(window.devicePixelRatio||1)+
        ' cv('+document.getElementById('cv').width+'x'+
        document.getElementById('cv').height+')';
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

  /* 自愈居中(T11): 无论何种环境因素(DPR/iframe缩放)导致画面偏移,
     只要玩家偏离视口中心超过阈值, 相机立即硬对齐。 */
  function selfCenter(){
    var s=APH.state;
    /* strict 模式: 无条件锁死相机到玩家 */
    if(s.strictCam){ s.camX=s.px; s.camY=s.py; return; }
    var dx=(s.px-s.camX), dy=(s.py-s.camY);
    /* 硬上限: 偏差超过视口22%立即对齐(异常保护) */
    var hard=Math.min(vpW(),vpH())*0.22;
    if(Math.abs(dx)>hard || Math.abs(dy)>hard){
      console.warn('[cam] 偏差自愈 dx='+Math.round(dx)+' dy='+Math.round(dy));
      s.camX=s.px; s.camY=s.py;
      return;
    }
    /* 软居中: 每帧额外把偏差的30%收掉(叠加在lerp之上, 保证稳态偏差<40px) */
    s.camX += dx*0.30;
    s.camY += dy*0.30;
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
      enemy:function(e,t){ APH.Ent.drawEnemy(e,t); },
      projectile:function(e,t){ APH.Ent.drawProj(e,t); },
      dropped:function(e,t){ APH.Ent.drawDropped(e,t); },
      building:function(e,t){ APH.Ent.drawBuilding(e,t); },
      blueprint:function(e,t){ APH.Ent.drawBuilding(e,t); },
      resident:function(e,t){ APH.Ent.drawResident(e,t); },
      visitor:function(e,t){ APH.Ent.drawVisitor(e,t); },
      flora:function(e,t){ APH.Ent.drawFlora(e,t); },
      walls:function(t){ APH.Ent.drawWalls(t); },
      particles:particlesDrawer,
      crystalGlow:function(){},
    };
    return d;
  }

  /* ================= 科技效果应用 ================= */
  function applyTech(meta,techId){
    var t=APH.Colony.TECHS[techId]; if(!t || !t.effect) return;
    var lv=meta.tech[techId]||0;
    var P=CFG.player;
    /* 从基准值重算, 避免叠加误差 */
    if(t.effect.o2Max){ P.o2Max = 100 + t.effect.o2Max*lv; S_o2Clamp(); }
    if(t.effect.dmgMul){
      var plv = APH.Colony.plasmaTechLevel(meta.tech);
      CFG.combat.plasmaDmg = Math.round(13*(1+t.effect.dmgMul*plv));
    }
    if(t.effect.spdMul){ P.walkSpeed=Math.round(150*(1+t.effect.spdMul*lv));
                         P.runSpeed=Math.round(235*(1+t.effect.spdMul*lv)); }
    /* te_radar: 罗盘/农产倍率在绘制与 farmTick 读取 meta.tech, 无需改全局 */
  }
  function applyAllTech(meta){
    Object.keys(APH.Colony.TECHS).forEach(function(id){ applyTech(meta,id); });
    if(S_o2Clamp) S_o2Clamp();
  }
  function S_o2Clamp(){ if(APH.state) APH.state.o2=Math.min(APH.state.o2,CFG.player.o2Max); }

  /* ================= 建造放置 ================= */
  function tryPlace(bid,wx,wy){
    var s=APH.state;
    var gx=Math.round(wx/CFG.GRID)*CFG.GRID,
        gy=Math.round(wy/CFG.GRID)*CFG.GRID;
    var mul=APH.Res.globalBonuses(s.meta.residents||[]).buildCostMul;
    var occupied=s.colony.buildings.concat((s.colony.buildQueue||[]).map(function(q){
      return {id:q.bid,x:q.x,y:q.y};
    }));
    var check=APH.Colony.canPlace(occupied, s.meta.tech, bid, gx, gy, s.meta.res);
    if(!check.ok){ APH.UI.floatText('✕ '+check.why,'#ff9a9a'); return; }
    var def=APH.Colony.get(bid);
    var costRes=def.costRes||{};
    s.meta.res = s.meta.res || { mineral:0, food:0, leather:0, wood:0, stone:0, iron:0 };
    for(var mat in costRes){
      var need=Math.max(0, Math.round((costRes[mat]||0)*mul));
      if(need>0){
        if(!APH.Colony.ensureStock(s.meta.res, s.entities, mat, need)){
          var matName=(CFG.items[mat]&&CFG.items[mat].name)?CFG.items[mat].name:mat;
          APH.UI.floatText('✕ '+matName+'不足','#ff9a9a'); return;
        }
        s.meta.res[mat]=Math.max(0, (s.meta.res[mat]||0)-need);
      }
    }
    s.colony.buildQueue = s.colony.buildQueue||[];
    var qpos={x:gx,y:gy};
    s.colony.buildQueue.push({bid:bid,x:qpos.x,y:qpos.y,
                              total:def.buildTime||5, progress:0});
    s.entities.push({id:'bp_'+bid+'_'+s.colony.buildQueue.length,
      type:T.BLUEPRINT, bid:bid, x:qpos.x, y:qpos.y, progress:0, building:false});
    APH.Save.saveMeta(s.meta);
    saveColony();
    U.emit('queued',{id:bid});
    APH.UI.floatText('🛠 '+def.name+' 开工 ('+(def.buildTime||0)+'s)','#ffc857');
    s.parts.push({t:'ping',x:wx,y:wy,life:.9,max:.9});
  }
  function buildingRecordOf(ent){
    if(!ent) return null;
    var list=(APH.state.colony && APH.state.colony.buildings) || [];
    for(var i=0;i<list.length;i++){
      var b=list[i];
      if(b && b.id===ent.bid && Math.abs((b.x||0)-(ent.x||0))<2 && Math.abs((b.y||0)-(ent.y||0))<2) return b;
    }
    return null;
  }
  function setBuildingField(ent, key, val){
    if(!ent) return;
    ent[key]=val;
    var rec=buildingRecordOf(ent);
    if(rec) rec[key]=val;
  }
  function saveColony(){
    var s=APH.state;
    if(s.colony && window.APH.Colony && APH.Colony.serializeGround)
      s.colony.ground=APH.Colony.serializeGround(s.entities);
    try{ localStorage.setItem('aphelion_colony_v1',
      JSON.stringify(APH.state.colony)); }catch(e){}
  }
  function loadColony(){
    try{
      var v=JSON.parse(localStorage.getItem('aphelion_colony_v1')||'null');
      if(v && Array.isArray(v.buildings)){
        v.buildQueue=v.buildQueue||[];
        v.ground=v.ground||[];
        v.buildings.forEach(function(b){ b.lv=b.lv||1; });
        return v;
      }
    }catch(e){}
    return { buildings:[], builtAt:Date.now(), ground:[] };
  }

  /* ================= 输入 ================= */
  function bindInput(){
    var s=APH.state;
    addEventListener('keydown',function(e){
      s.keys[e.code]=true;
      APH.SFX.unlock();
      if((e.code==='Enter'||e.code==='Space')&&s.mode==='intro'){
        if(s.openingClock && window.APH.Opening && !APH.Opening.isLast(s.openingClock)){
          APH.Opening.skipToLast(s.openingClock);
          s.openingAlarmT = 0;
          if(APH.UI.skipOpeningVideo) APH.UI.skipOpeningVideo();
          if(APH.UI.renderOpening) APH.UI.renderOpening(s.openingClock);
        }else if(!s.openingClock) startGame();
      }
      /* #72 家园击倒: 昏迷期间所有按键忽略(含 E — 击倒无 E 唤醒, 只等送医/倒计时) */
      if(playerDowned() && s.mode==='running') return;
      /* #66 床边睡眠: 睡着时除 E 外全部按键忽略(唤醒只走 WASD/E/受伤) */
      if(playerSleeping() && s.mode==='running' && e.code!=='KeyE') return;
      /* E=发射台/自然资源交互 */
      if(e.code==='KeyE'&&s.mode==='running'){
        if(playerSleeping()){
          /* E 再按 = 唤醒, 跳过其余所有交互分支 */
          APH.Res.playerWake(s.meta.playerNeeds);
          syncPlayerSleep();
          APH.UI.floatText('🌅 醒来','#8fd4ff');
        }else if(s.scene==='expedition' && s.nearFlora){
          var loadW=APH.Combat.carryWeight(s.carry);
          var capNow=APH.Colony.carryMaxOf(s.colony.buildings);
          var seedIt = s.nearFlora.seedItem || 'specimen_flora_glow';
          var rPick = APH.Combat.addToCarry(s.carry, seedIt, 1, capNow);
          if(rPick.ok){
            s.carry = rPick.carry;
            s.nearFlora.dead = true;
            var itName = (CFG.items[seedIt]&&CFG.items[seedIt].name) ? CFG.items[seedIt].name : seedIt;
            APH.UI.floatText('✔ 获得 '+itName, '#59d9ff');
          }else{
            APH.UI.floatText('✕ 背包已满', '#ff9a9a');
          }
        }else if(s.scene==='home' && s.nearFlora){
          var resW = APH.Colony.workOnFlora(s.nearFlora, { skills:{sk_farm:6,sk_craft:6} }, 15);
          if(resW.done && resW.dropItemId){
            APH.Combat.spawnDrop(s.nearFlora.x, s.nearFlora.y, resW.dropItemId, resW.dropCount, {stock:true});
            var dropName = (CFG.items[resW.dropItemId]&&CFG.items[resW.dropItemId].name)||resW.dropItemId;
            APH.UI.floatText('✔ 采集完成 +'+resW.dropCount+' '+dropName, '#7dffab');
          }else{
            APH.UI.floatText('采收中...', '#8fd4ff');
          }
        }else if(s.scene==='home' && s.nearVisitor){
          if(s.nearVisitor.trade){
            closeColonyOverlays('trade');
            toggleTradePanel();
          }else{
            tryRecruit(s.nearVisitor);
          }
        }else if(s.scene==='home' && s.nearBed){
          /* #66 床边睡眠: 靠床 E 入睡(床铺恢复), 优先于发射台, 绝不落入自动寻路分支 */
          APH.Res.setPlayerSleeping(s.meta.playerNeeds, true, true);
          syncPlayerSleep();
          if(window.APH.Opening && APH.Opening.noteSleptInHouse){
            APH.Opening.noteSleptInHouse(firstNightOpening());
            tryFirstNightVisitor();
            applyFirstNightHint();
            try{ APH.Save.saveMeta(s.meta); }catch(eS){}
          }
          APH.UI.floatText('🛌 入睡','#8fd4ff');
        }else if(s.scene==='home' && s.nearClinic && playerSick()){
          /* #70 医疗舱躺下: 生病玩家靠舱 E 躺入(医疗舱床位恢复), 绝不落入自动寻路分支 */
          APH.Res.setPlayerSleeping(s.meta.playerNeeds, true, true, 'bed_med');
          syncPlayerSleep();
          APH.UI.floatText('🛌 躺进医疗舱','#8fd4ff');
        }else if(s.scene==='home' && s.nearFood){
          /* #65 走到粮边吃: 靠粮按 E 吃一口(内部自拦「不饿/没粮」), 绝不落入兜底自动寻路分支 */
          tryPlayerEatNearFood();
        }else if(s.nearPad){
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
      if(e.code==='KeyF'&&s.mode==='running'&&s.scene==='home'){
        if(s.nearVisitor){
          tryOfferMeal(s.nearVisitor);
        }else if(s.nearLab){
          var nextSpec=APH.Colony.cycleAnalysisTarget(s.nearLab.analysisTarget || 'specimen_flora_glow');
          setBuildingField(s.nearLab, 'analysisTarget', nextSpec);
          setBuildingField(s.nearLab, 'analysisProgress', 0);
          var specDef=APH.Colony.SPECIMEN_ANALYSIS[nextSpec];
          APH.UI.floatText('🔬 化验队列: '+(specDef && specDef.name || nextSpec), '#59d9ff');
          saveColony();
        }else if(s.nearCropPlot){
          var nextCrop=APH.Colony.cycleAnalyzedCrop(s.nearCropPlot.crop, s.meta.analyzedFlora);
          if(!nextCrop){
            APH.UI.floatText('🔒 需先在科研站化验异星标本', '#ff9a9a');
          }else{
            setBuildingField(s.nearCropPlot, 'crop', nextCrop);
            setBuildingField(s.nearCropPlot, 'plot', { stage:0, t:0 });
            var cropName=APH.Colony.ALIEN_CROPS[nextCrop].name;
            APH.UI.floatText('🌿 切换为: '+cropName, '#7dffab');
            saveColony();
          }
        }else if(s.nearWorkshop){
          var recipes=Object.keys(APH.Colony.CRAFT_RECIPES);
          var curRIdx=recipes.indexOf(s.nearWorkshop.recipe||'it_pickaxe');
          var nextRec=recipes[(curRIdx+1)%recipes.length];
          setBuildingField(s.nearWorkshop, 'recipe', nextRec);
          s.nearWorkshop.craftProgress=0;
          var recName=APH.Colony.CRAFT_RECIPES[nextRec].name;
          APH.UI.floatText('🔨 工坊生产调整为: '+recName, '#59d9ff');
          saveColony();
        }else if(s.nearKitchen || s.nearCampfire){
          var targetBldg=s.nearKitchen || s.nearCampfire;
          var bId=targetBldg.bid || targetBldg.id;
          var validRecipes=Object.keys(APH.Colony.COOK_RECIPES).filter(function(k){
            var r=APH.Colony.COOK_RECIPES[k];
            var allowed=r.bldgs || r.bldg || ['bl_kitchen', 'bl_campfire'];
            return allowed.indexOf(bId) >= 0;
          });
          if(validRecipes.length > 0){
            var curKIdx=validRecipes.indexOf(targetBldg.recipe || validRecipes[0]);
            var nextKRec=validRecipes[(curKIdx + 1) % validRecipes.length];
            setBuildingField(targetBldg, 'recipe', nextKRec);
            targetBldg.cookProgress=0;
            var recKName=APH.Colony.COOK_RECIPES[nextKRec].name;
            APH.UI.floatText('🍲 烹饪菜谱调整为: ' + recKName, '#ffca28');
            saveColony();
          }
        }
      }
      /* 调试热键(自动化验证协议, 仅 ?autostart=1 / ?debugkeys=1 通道生效——
         曾与正式键位冲突: 按G开建造面板的同时被传送600px):
         T=传送到最近未扫描信标并启动真实扫描管线
         G=向东传送600px, 触发舱外耗氧路径
         K=在视野边缘生成一只敌人(战斗管线验证) */
      if(e.code==='KeyJ' && s.mode==='running'){
        var rp=document.getElementById('resPanel');
        if(rp && rp.style.display!=='none'){ /* 名册打开时 J 不射击 */ }
        else APH.Combat.firePlasma();
      }
      if(e.code==='KeyP'&&s.mode==='running'&&s.scene==='home'){
        cycleSelectedJob();
      }
      if(s.mode==='running'&&s.scene==='home' && /^Digit[0-9]$/.test(e.code)){
        var tp2=document.getElementById('tradePanel');
        var rp2=document.getElementById('resPanel');
        if(tp2 && tp2.style.display!=='none' && e.code!=='Digit0'){
          doTradeRow(parseInt(e.code.slice(5),10)-1);
        }else if(rp2 && rp2.style.display!=='none' && /^Digit[0-3]$/.test(e.code)){
          setPrioAtCursor(parseInt(e.code.slice(5),10));   // D: 设优先级
        }
      }
      if(s.mode==='running'&&s.scene==='home' &&
         /^Arrow(Up|Down|Left|Right)$/.test(e.code)){
        var tpA=document.getElementById('tradePanel');
        var rpA=document.getElementById('resPanel');
        if(techMapOpen()){
          moveTechSel(e.code);
          s.keys[e.code]=false;
          if(e.preventDefault) e.preventDefault();
        }else if(tpA && tpA.style.display!=='none' && /^Arrow(Up|Down)$/.test(e.code)){
          moveTradeSel(e.code);
          s.keys[e.code]=false;
          if(e.preventDefault) e.preventDefault();
        }else if(rpA && rpA.style.display!=='none'){
          movePrioCursor(e.code);
          s.keys[e.code]=false;
          if(e.preventDefault) e.preventDefault();
        }
      }
      /* B=建造模式(仅殖民地): 循环选择建筑, 点地放置, 右键/Esc取消 */
      if(e.code==='KeyB'&&s.mode==='running'&&s.scene==='home'){
        var ids=Object.keys(APH.Colony.list()).filter(function(id){return id!=='bl_landing_pad';});
        var cur=ids.indexOf(s.buildMode);
        s.buildMode = ids[(cur+1) % (ids.length+1)] || null;
        APH.UI.setHint(s.buildMode
          ? '建造: '+APH.Colony.get(s.buildMode).name+' · 点击空地放置 ('+
            APH.Colony.get(s.buildMode).cost+'研 / '+(APH.Colony.get(s.buildMode).costMineral||0)+'矿)'
          : '建造模式关闭');
      }
      if(e.code==='Escape'&&s.buildMode){ s.buildMode=null; APH.UI.setHint(''); }
      if(e.code==='Escape'){
        if(techMapOpen()) toggleTechMap(false);
        var tpE=document.getElementById('tradePanel');
        if(tpE && tpE.style.display!=='none') toggleTradePanel(false);
        var dipE=document.getElementById('diplomacyOverlay');
        if(dipE && dipE.style.display!=='none') toggleDiplomacy(false);
      }
      if(e.code==='KeyM'){ var m=APH.SFX.toggleMute();
        APH.UI.floatText(m?'🔇 静音':'🔊 音效开启','#8fa3cc'); }
      if(e.code==='KeyH'){ s.showMarker=!s.showMarker;
        APH.UI.floatText(s.showMarker?'角色标记: 开':'角色标记: 关','#8fa3cc'); }
      /* U=升级最近的已建成建筑 */
      if(e.code==='KeyU'&&s.mode==='running'&&s.scene==='home'){
        var best=null,bd=1e9;
        s.colony.buildings.forEach(function(b){
          if(b.id==='bl_landing_pad') return;
          var d=U.dst(s.px,s.py,b.x,b.y);
          if(d<bd){bd=d;best=b;}
        });
        if(!best){ APH.UI.floatText('附近没有可升级的建筑','#8fa3cc'); }
        else{
          var def2=APH.Colony.get(best.id);
          var r3=APH.Colony.canUpgrade(best,def2,s.meta.research, haveStock('leather'));
          if(r3.ok){
            if(r3.costRes==='leather'){
              if(!APH.Colony.takeStock(s.meta.res, s.entities, 'leather', r3.cost).ok){
                APH.UI.floatText('✕ 皮革不足','#ff9a9a'); return;
              }
            }else s.meta.research-=r3.cost;
            best.lv=(best.lv||1)+1;
            /* 同步实体lv: 炮塔伤害/等级徽点读实体, 不同步则升级当场不生效 */
            s.entities.forEach(function(en){
              if(en.type===T.BUILDING&&en.bid===best.id&&
                 U.dst(en.x,en.y,best.x,best.y)<5) en.lv=best.lv;
            });
            APH.Save.saveMeta(s.meta); saveColony();
            APH.UI.floatText('⬆ '+def2.name+' → Lv'+best.lv,'#59d9ff');
            U.emit('upgraded',{id:best.id,lv:best.lv});
          }else{
            APH.UI.floatText('✕ '+r3.why,'#ff9a9a');
          }
        }
      }
      /* X=拆除最近建筑(半价退款, 发射台不可拆) */
      if(e.code==='KeyX'&&s.mode==='running'&&s.scene==='home'){
        var bestX=null,bdX=120;
        s.colony.buildings.forEach(function(b,idx){
          if(b.id==='bl_landing_pad') return;
          var d=U.dst(s.px,s.py,b.x,b.y);
          if(d<bdX){bdX=d;bestX={b:b,idx:idx};}
        });
        if(!bestX){ APH.UI.floatText('附近没有可拆除的建筑','#8fa3cc'); }
        else{
          var def3=APH.Colony.get(bestX.b.id);
          var refundR=APH.Colony.refundResOf(def3);   // T2: 素材建筑(墙/门)退建材
          var refund=APH.Colony.refundOf(def3);
          var refundM=APH.Colony.refundMineralOf(def3);
          var refundMsg;
          if(refundR){
            s.meta.res=s.meta.res||{ mineral:0, food:0, leather:0, wood:0, stone:0, iron:0 };
            var rParts=[];
            for(var rk in refundR){
              if(refundR[rk]>0){ s.meta.res[rk]=(s.meta.res[rk]||0)+refundR[rk]; rParts.push((CFG.items[rk]&&CFG.items[rk].name||rk)+' +'+refundR[rk]); }
            }
            refundMsg='🧨 '+def3.name+' 已拆除 ('+rParts.join(' ')+')';
          }else{
            s.meta.research+=refund;
            s.meta.res.mineral=(s.meta.res.mineral||0)+refundM;
            refundMsg='🧨 '+def3.name+' 已拆除 (+'+refund+'研究 +'+refundM+'矿)';
          }
          s.colony.buildings.splice(bestX.idx,1);
          s.entities=s.entities.filter(function(en){
            return !(en.type===T.BUILDING&&en.bid===bestX.b.id&&U.dst(en.x,en.y,bestX.b.x,bestX.b.y)<5);
          });
          APH.Save.saveMeta(s.meta); saveColony();
          APH.UI.floatText(refundMsg,'#ffc857');
          U.emit('demolished',{id:bestX.b.id});
        }
      }
      /* C=相机锁定: 角色永远钉在屏幕正中(关闭lookAhead平滑) */
      if(e.code==='KeyC'){ s.strictCam=!s.strictCam;
        APH.UI.floatText(s.strictCam?'📷 相机锁定(角色恒居中)':'📷 相机平滑跟随','#59d9ff'); }
      /* L=图鉴(家园科学图鉴 + 远征档案), R=居民名册(家), O=外星势力外交 */
      if(e.code==='KeyL'&&s.mode==='running'){ toggleCodex(); }
      if(e.code==='KeyR'&&s.mode==='running'&&s.scene==='home'){ toggleResPanel(); }
      if(e.code==='KeyO'&&s.mode==='running'){ toggleDiplomacy(); }
      /* G=建造目录(左侧按钮/底部row) */
      if(e.code==='KeyG'&&s.mode==='running'&&s.scene==='home'){ toggleBuildRow(); }
      /* T=全屏科技图(家园打开; 开着时任意场景可关) */
      if(e.code==='KeyT'&&s.mode==='running'){
        if(techMapOpen()) toggleTechMap(false);
        else if(s.scene==='home') toggleTechMap();
      }
      if((e.code==='Enter'||e.code==='NumpadEnter'||e.key==='Enter')&&
         !e.isComposing&&s.mode==='running'&&s.scene==='home'){
        var tpEnt=document.getElementById('tradePanel');
        if(tpEnt && tpEnt.style.display!=='none' && currentTrader()){
          doTradeRow(s.tradeSel||0);
        }else if(techMapOpen()){
          if(e.preventDefault) e.preventDefault();
          tryBuySelectedTech();
        }
      }
      if(e.code==='KeyK'&&s.mode==='running'&&s.debugKeys){
        var f=s.spec.enemies.factions[0];
        s.entities.push(APH.Ent.makeEnemy(f, s.px+180, s.py));
        document.title='DBG 已生成 '+f.name;
      }
      if(e.code==='KeyT'&&s.mode==='running'&&s.debugKeys&&s.scene!=='home'&&!techMapOpen()){
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
      if(e.code==='KeyG'&&s.mode==='running'&&s.debugKeys){
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

    var cv=document.getElementById('cv'), downX=0,downY=0,downT=0,downMoved=0,wallDrag=false,wallFrom=null,wallLast=null,wallPlaced={};
    cv.addEventListener('pointerdown',function(e){
      downX=e.clientX; downY=e.clientY; downT=performance.now(); downMoved=0;
      /* T2: 墙/闸门拖拽连续放置 — 按下即开始(在建造模式下) */
      var s0=APH.state;
      if(s0.scene==='home'&&s0.buildMode&&(s0.buildMode==='bl_wall'||s0.buildMode==='bl_gate'||s0.buildMode==='bl_spike_trap'||s0.buildMode==='bl_sandbag')){
        wallDrag=true; wallLast=null; wallPlaced={};
        var wx0=e.clientX-vpW()/2+s0.camX, wy0=e.clientY-vpH()/2+s0.camY;
        wallFrom=APH.Colony.wallCells(wx0, wy0);
        wallLast=wallFrom;
        wallPlaced[wallFrom.x+','+wallFrom.y]=true;
        tryPlace(s0.buildMode, wx0, wy0);
      }
    });
    cv.addEventListener('pointermove',function(e){
      downMoved+=Math.abs(e.clientX-downX)+Math.abs(e.clientY-downY);
      downX=e.clientX; downY=e.clientY;
      /* T2 拖拽续铺: 从上一格到当前格增量线段(防从起点重算的幻影格+重试刷屏) */
      if(wallDrag && APH.state.buildMode && APH.state.scene==='home'){
        var s0=APH.state;
        var wx0=e.clientX-vpW()/2+s0.camX, wy0=e.clientY-vpH()/2+s0.camY;
        var cur=APH.Colony.wallCells(wx0, wy0);
        var line=APH.Colony.wallLine(wallLast||wallFrom||cur, cur);
        line.forEach(function(pt){
          var key=pt.x+','+pt.y;
          if(wallPlaced[key]) return;
          wallPlaced[key]=true;
          wallLast=pt;
          tryPlace(s0.buildMode, pt.x, pt.y);
        });
        if(!line.length) wallLast=cur;
      }
    });
    cv.addEventListener('pointerup',function(e){
      wallDrag=false; wallFrom=null; wallLast=null; wallPlaced={};
      if(performance.now()-downT<450 && downMoved<12 && APH.state.mode==='running'){
        /* 建造模式: 点地放置(墙/闸门已在 pointerdown 铺设, 防重复) */
        if(s.scene==='home'&&s.buildMode&&s.buildMode!=='bl_wall'&&s.buildMode!=='bl_gate'&&s.buildMode!=='bl_spike_trap'&&s.buildMode!=='bl_sandbag'){
          var wx=e.clientX-vpW()/2+s.camX, wy=e.clientY-vpH()/2+s.camY;
          tryPlace(s.buildMode,wx,wy);
          return;
        }
        var t={x:e.clientX-vpW()/2+APH.state.camX, y:e.clientY-vpH()/2+APH.state.camY};
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
    var surviveBtn=document.getElementById('openingSurvive');
    if(surviveBtn) surviveBtn.addEventListener('click',function(ev){
      if(ev && ev.stopPropagation) ev.stopPropagation();
      startGame();
    });
    var openingEl=document.getElementById('opening');
    if(openingEl) openingEl.addEventListener('click',function(){
      var st=APH.state;
      if(st.mode!=='intro') return;
      if(st.openingClock && window.APH.Opening && !APH.Opening.isLast(st.openingClock)){
        APH.SFX.unlock();
        APH.Opening.skipToLast(st.openingClock);
        st.openingAlarmT = 0;
        if(APH.UI.skipOpeningVideo) APH.UI.skipOpeningVideo();
        if(APH.UI.renderOpening) APH.UI.renderOpening(st.openingClock);
        return;
      }
      /* 第五镜只许点「活下去」; 画面点击不开始 */
    });
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
    if(!s.meta.opening){
      s.meta.opening = (window.APH.Opening && APH.Opening.defaults)
        ? APH.Opening.defaults(false)
        : { played:false };
    }
    if(window.APH.Opening && APH.Opening.markPlayed) APH.Opening.markPlayed(s.meta.opening);
    else s.meta.opening.played = true;
    if(APH.UI.hideOpening) APH.UI.hideOpening();
    s.openingClock = null;
    s.openingAlarmT = 0;
    s.mode='running';
    APH.UI.hideIntro();
    APH.UI.armProbe();
    APH.state.meta.stats.landings++;
    APH.Save.saveMeta(APH.state.meta);
  }

  /* ================= 事件订阅 (ADR-8 示范) ================= */
  U.on('crystalPicked', function(){ /* Phase1: 音效挂这里 */ });
  U.on('beaconScanned', function(b){ /* Phase2: 动态档案生成挂这里 */ });
  /* 阶段E: 袭击伤亡计数(溃退判定依据) */
  U.on('enemyKilled', function(p){
    var s=APH.state;
    if(!s.war || !s.war.raidActive) return;
    var en=p&&p.en;
    if(!en || en.isSoldier || en.retreat) return;
    s.war.casualties=(s.war.casualties||0)+1;
  });
  /* 阶段E: 盗掠计数——偷够 stealCap 即得手撤退 */
  U.on('raidStole', function(){
    var s=APH.state;
    if(!s.war || !s.war.raidActive || s.war.routed) return;
    s.war.stolen=(s.war.stolen||0)+1;
    if(s.war.tactic!=='pillage') return;
    var t=((CFG.raidTactics||{}).tactics||{}).pillage||{};
    if(s.war.stolen>=(t.stealCap!=null?t.stealCap:6))
      raidRetreat('⚠ 盗掠者偷够就跑!', true);
  });
  /* 阶段E: 围攻营地被玩家弹丸拆毁 → 全体溃退 */
  U.on('siegeCampDown', function(){
    var s=APH.state;
    if(!s.war || !s.war.raidActive || s.war.routed) return;
    raidRetreat('✔ 围攻营地被摧毁, 敌军溃退!', false);
  });

  /* ================= 启动 ================= */
  function boot(){
    try{
      var meta=APH.Save.loadMeta();
      if(!meta.tech) meta.tech={};
      if(!meta.res) meta.res={mineral:0, food:0, leather:0};
      if(!meta.residents) meta.residents=[];   // P6 居民名册
      if(meta.residentSeq===undefined) meta.residentSeq=0;
      APH.state.meta=meta;
      APH.Colony.grantAssayKeyedTechs(meta);
      applyAllTech(meta);
      APH.state.war.wins=(meta.war&&meta.war.wins)||0;
      APH.state.war.raids=(meta.war&&meta.war.raids)||0;
      APH.state.colony=loadColony();          // 殖民地布局持久化
      APH.World.initCanvas();
      APH.Ent.bindCtx(document.getElementById('cv').getContext('2d'));
      var seed=(Date.now()%100000)|0;
      APH.SFX.bindBus();
      APH.SFX.restore(meta);
      /* M1 序列帧注册与异步加载 */
      var SD = window.APH.SPRITE_DATA || {};
      /* 动作幅度收敛 v2 + 基线锚点 + 内容高: idle=配准后帧差≤30%的待机帧数,
         baseline=帧0内容底边(治悬浮), h=帧0内容高(配合BUILDINGS.dispH比例缩放)。
         数据来源: python3 assets/build_sprites.py 实测输出(2026-08-26 HD 256格版)。 */
      var SPRITE_META = {
        /* 兵营idle:2为用户选定例外——帧差37%是旗帜摆动(自然内容变化), 配准后无跳动 */
        bl_barracks:{idle:2,baseline:171,h:88}, bl_clinic:{idle:1,baseline:244,h:162},
        bl_farm:{idle:1,baseline:241,h:158}, bl_house:{idle:1,baseline:244,h:174},
        bl_lab:{idle:1,baseline:243,h:156}, bl_landing_pad:{idle:1,baseline:243,h:162},
        bl_mine:{idle:1,baseline:175,h:134}, bl_pasture:{idle:1,baseline:177,h:94},
        bl_turret:{idle:1,baseline:173,h:72}, bl_warehouse:{idle:1,baseline:169,h:90},
        /* #84 建筑 v3 视觉资产：静态单块 sheet 重复 8 帧，仅木柴发电机局部循环 */
        bl_wall:{idle:1,baseline:241,h:144}, bl_gate:{idle:1,baseline:243,h:146},
        bl_conduit:{idle:1,baseline:240,h:125}, bl_wood_generator:{idle:3,baseline:245,h:197},
        bl_solar_panel:{idle:1,baseline:240,h:179}, bl_battery:{idle:1,baseline:241,h:156},
        bl_lamp:{idle:1,baseline:240,h:187}, bl_dining_table:{idle:1,baseline:240,h:155},
        bl_dining_chair:{idle:1,baseline:240,h:180}, bl_spike_trap:{idle:1,baseline:240,h:129},
        bl_tv:{idle:1,baseline:236,h:217}, bl_shelf:{idle:1,baseline:236,h:217}, bl_carpet:{idle:1,baseline:207,h:159},
        bl_workshop:{idle:1,baseline:241,h:216},   /* #97补: 漏键致工坊渲染退化(权威值来自 build_sprites.py) */
        bl_sandbag:{idle:1,baseline:240,h:106},
        /* 人形锚点/内容高（idleFrames 字段只给建筑用，这里不填） */
        player_walk:{baseline:248,h:240},
        player_idle:{baseline:248,h:236},
        player_prone:{baseline:162,h:68},   /* #59 通用俯卧; h 修订: 手抄值86与实测(build_sprites.py)不符, 曾致缩放偏小 */
        hum_0_nopack_prone:{baseline:248,h:122} /* #60 脸0无包居民俯卧 */
        ,hum_1_nopack_prone:{baseline:248,h:138} /* #61 脸1无包居民俯卧 */
        ,hum_2_nopack_prone:{baseline:249,h:102} /* #62 脸2无包居民俯卧; h 修订: 手抄值163与实测差61px, 曾致躺姿严重缩水 */
        ,hum_3_nopack_prone:{baseline:198,h:124} /* #63 脸3无包居民俯卧(分向生成后拼接); h 修订: 手抄值139与实测差15px */
      };
      (function(){
        var i, k;
        for (i = 0; i < 4; i++) {
          k = 'hum_'+i+'_';
          SPRITE_META[k+'nopack_walk'] = {baseline:248,h:240};
          SPRITE_META[k+'nopack_idle'] = {baseline:248,h:236};
          SPRITE_META[k+'pack_walk'] = {baseline:248,h:240};
          SPRITE_META[k+'pack_idle'] = {baseline:248,h:236};
        }
      })();
      Object.keys(SD).forEach(function(name){
        var layout = window.APH.Humanoid && APH.Humanoid.sheetLayout(name);
        if (layout){
          /* ADR-0001: *_walk 32 帧 / *_idle 16 帧横排，脚底锚点 */
          var metaH = SPRITE_META[name]||{};
          var hum = (CFG.humanoid)||{};
          APH.Sprites.define(name, { src:SD[name], fw:0, fh:0, cols:layout.cols, rows:1,
                                     count:layout.count, fps:layout.fps, loop:true,
                                     baseline: metaH.baseline||hum.sheetBaseline||0,
                                     contentH: metaH.h||hum.sheetContentH||0, anchorY:0.96 });
        }else if (name.indexOf('enemy_')===0){
          /* N2: 敌人8帧表(idle×2/move×2/attack×2/hurt/death); 敌人锚点由drawEnemy手工translate, 不用baseline */
          APH.Sprites.define(name, { src:SD[name], fw:128, fh:128, cols:8, rows:1,
                                     count:8, fps:4.5, loop:true });
        }else{
          var meta = SPRITE_META[name]||{};
          /* fw:0 = 加载时按图高自动探测格宽(128/256格通用) */
          APH.Sprites.define(name, { src:SD[name], fw:0, fh:0, cols:8, rows:1,
                                     count:8, fps:3, loop:true,
                                     idleFrames: meta.idle||1, baseline: meta.baseline||0,
                                     contentH: meta.h||0 });
        }
      });
      APH.Sprites.loadAll();
      /* 相机诊断角标: 仅 ?debugmark / ?debugkeys=1, 正式玩不挡画面 */
      var _bootQ=(typeof location!=='undefined'&&location.search)||'';
      if(_bootQ.indexOf('debugmark')>=0 || _bootQ.indexOf('debugkeys=1')>=0){
        var diag=document.createElement('div');
        diag.id='camDiag';
        diag.style.cssText='position:fixed;top:2px;right:4px;z-index:60;color:#4a5b7d;'+
          'font:9px monospace;text-align:right;line-height:1.3;pointer-events:none;';
        document.body.appendChild(diag);
        setInterval(function(){
          var st=APH.state;
          var sx=Math.round(st.px-st.camX+vpW()/2),
              sy=Math.round(st.py-st.camY+vpH()/2);
          var mineN=0; st.entities.forEach(function(e2){if(e2.bid==='bl_mine')mineN++;});
          diag.innerHTML='scr '+sx+','+sy+' / 视口 '+vpW()+'x'+vpH()+
            ' / win '+innerWidth+'x'+innerHeight+
            '<br>cam '+Math.round(st.camX)+','+Math.round(st.camY)+
            ' p '+Math.round(st.px)+','+Math.round(st.py)+' '+(st.scene==='home'?'家':'远征')+
            ' 矿'+mineN+(APH.Sprites.isReady('bl_mine')?' spr✓':' spr✗');
        },250);
      }
      /* 设计支柱: 永远出生在殖民地 */
      enterHome();
      bindInput();
      bindLLMPanel();
      bindBuildUI();
      APH.UI.updHUD();
      document.title='✓就绪 殖民地'+(APH.LLM.enabled()?' ·AI':'');
      /* 自动化验证通道: autostart=1 跳过开场; exp=1 直接着陆远征 */
      var s = APH.state;
      var _q=(typeof location!=='undefined'&&location.search)||'';
      /* 调试热键通道(T传送/K刷怪/G东移): 仅显式 ?debugkeys=1 开启(不随autostart隐含),
         玩家默认不可触发 */
      s.debugKeys = _q.indexOf('debugkeys=1')>=0;
      if(_q.indexOf('autostart=1')>=0){
        document.title='AUTO: q命中';
        startGame();
        /* 仅诊断(?debugmark): 自动放一座采矿机验证sprite渲染 */
        if(_q.indexOf('debugmark')>=0){
          [['bl_mine',60,-40],['bl_farm',-70,-30],['bl_house',90,40],['bl_lab',-60,80]].forEach(function(it){
            s.colony.buildings.push({id:it[0],x:s.px+it[1],y:s.py+it[2],lv:1});
            APH.Colony.placeBuildingEntity(it[0],s.px+it[1],s.py+it[2],1);
          });
          document.title='AUTO: started +4bldg';
          /* 屏幕空间自检: 固定坐标画帧0, 排除世界变换干扰 */
          setTimeout(function(){
            var c2=document.getElementById('cv').getContext('2d');
            c2.setTransform(1,0,0,1,0,0);
            window.__sprOk=APH.Sprites.draw(c2,'bl_mine',80,650,0,1.0);
            document.title+=' spr='+window.__sprOk;
          },1500);
        }
        var pad0=s.entities.find(function(e){return e.type===T.BUILDING&&e.pad;});
        if(pad0){ s.px=pad0.x; s.py=pad0.y+30; }   // 出生即站在发射台上
        /* T8 调试通道(?t8debug=1): 餐桌+双椅+饥饿居民, 基于玩家实际位置放桌椅 */
        if(_q.indexOf('t8debug=1')>=0){
          var tb={x:s.px+220,y:s.py+60}; var ch1={x:s.px+110,y:s.py+60}; var ch2={x:s.px+330,y:s.py+60};
          s.colony.buildings.push({id:'bl_dining_table',x:tb.x,y:tb.y,lv:1});
          APH.Colony.placeBuildingEntity('bl_dining_table',tb.x,tb.y,1);
          s.colony.buildings.push({id:'bl_dining_chair',x:ch1.x,y:ch1.y,lv:1});
          APH.Colony.placeBuildingEntity('bl_dining_chair',ch1.x,ch1.y,1);
          s.colony.buildings.push({id:'bl_dining_chair',x:ch2.x,y:ch2.y,lv:1});
          APH.Colony.placeBuildingEntity('bl_dining_chair',ch2.x,ch2.y,1);
          if(s.meta.residents&&s.meta.residents.length){
            s.meta.residents.forEach(function(r2){ if(r2.food!=null) r2.food=40; });
          }
          s.entities.push({id:'t8f',type:CFG.entType.DROPPED,x:tb.x,y:tb.y+30,itemId:'it_food',n:9});
          document.title='AUTO: t8debug ready';
        }
        /* T9 调试通道(?t9debug=1): 墙环圈房+居住舱+路灯, 供房间/照明视觉验证 */
        if(_q.indexOf('t9debug=1')>=0){
          var gx0=Math.round(s.px/48)+2, gy0=Math.round(s.py/48);
          for(var rw=0; rw<5; rw++){
            s.colony.buildings.push({id:'bl_wall', x:48*(gx0+rw), y:48*gy0});
            s.colony.buildings.push({id:'bl_wall', x:48*(gx0+rw), y:48*(gy0+4)});
          }
          for(var rh=0; rh<5; rh++){
            s.colony.buildings.push({id:'bl_wall', x:48*gx0, y:48*(gy0+rh)});
            s.colony.buildings.push({id:'bl_wall', x:48*(gx0+4), y:48*(gy0+rh)});
          }
          s.colony.buildings.push({id:'bl_house', x:48*(gx0+2), y:48*(gy0+2)});
          APH.Colony.placeBuildingEntity('bl_house', 48*(gx0+2), 48*(gy0+2), 1);
          s.colony.buildings.push({id:'bl_lamp', x:48*(gx0+6), y:48*(gy0+2), lv:1, powered:true});
          APH.Colony.placeBuildingEntity('bl_lamp', 48*(gx0+6), 48*(gy0+2), 1);
          s.clock=(CFG.DAY_LEN||210)*0.75;   /* 强制夜间(照片验证照明) */
          document.title='AUTO: t9debug ready';
        }
        /* T10 调试通道(?t10debug=1): 尖刺陷阱(待触发+已触发)+沙袋, 白天清晰截图 */
        if(_q.indexOf('t10debug=1')>=0){
          var tx0=Math.round(s.px/48)+2, ty0=Math.round(s.py/48);
          s.colony.buildings.push({id:'bl_spike_trap', x:48*tx0, y:48*ty0});
          s.colony.buildings.push({id:'bl_spike_trap', x:48*(tx0+1), y:48*ty0, armed:false});
          s.colony.buildings.push({id:'bl_sandbag', x:48*tx0, y:48*(ty0+1)});
          s.colony.buildings.push({id:'bl_sandbag', x:48*(tx0+1), y:48*(ty0+1)});
          document.title='AUTO: t10debug ready';
        }
        /* P3 调试通道(?p3debug=1): 电视/书架/地毯三件家具, 视觉验证sprite渲染 */
        if(_q.indexOf('p3debug=1')>=0){
          var p3x=Math.round(s.px/48)+2, p3y=Math.round(s.py/48);
          s.colony.buildings.push({id:'bl_tv', x:48*p3x, y:48*p3y});
          APH.Colony.placeBuildingEntity('bl_tv', 48*p3x, 48*p3y, 1);
          s.colony.buildings.push({id:'bl_shelf', x:48*(p3x+1), y:48*p3y});
          APH.Colony.placeBuildingEntity('bl_shelf', 48*(p3x+1), 48*p3y, 1);
          s.colony.buildings.push({id:'bl_carpet', x:48*(p3x+2), y:48*p3y});
          APH.Colony.placeBuildingEntity('bl_carpet', 48*(p3x+2), 48*p3y, 1);
          document.title='AUTO: p3debug ready';
        }
      }else if(window.APH.Opening && APH.Opening.shouldPlay(s.meta.opening, { autostart:_q.indexOf('autostart=1')>=0 })){
        s.openingClock = APH.Opening.createClock();
        APH.UI.hideIntro();
        if(APH.UI.showOpening) APH.UI.showOpening();
        if(APH.UI.renderOpening) APH.UI.renderOpening(s.openingClock);
      }
      if(_q.indexOf('exp=1')>=0){
        startGame();
        launchExpedition();
      }
      /* 调试标记(?debugmark=1): 视口中心参考圈, 验证居中 */
      if(_q.indexOf('debugmark')>=0) s.debugMark=true;
      /* strict=1: 每帧强制相机=玩家(排除相机逻辑, 二分定位偏移源) */
      APH.state.strictCam = _q.indexOf('strict')>=0;
    }catch(err){
      APH.UI.fatal('启动失败: '+err.message+'\n'+(err.stack||''));
      throw err;
    }
  }

  /* 「新星球」: 换 seed 重建世界(结算页入口) */
  function newPlanet(){
    var s=APH.state;
    s.mode='intro';
    if(APH.UI.hideOpening) APH.UI.hideOpening();
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

  /* ================= LLM 设置面板(开场画面内，委托 APH.UI) ================= */
  function bindLLMPanel(){ if(APH.UI && APH.UI.bindLLMPanel) APH.UI.bindLLMPanel(); }
  function refreshLLMStatus(){ if(APH.UI && APH.UI.refreshLLMStatus) APH.UI.refreshLLMStatus(); }
  boot();
  requestAnimationFrame(frame);

  /* ================= T5 图鉴与科技树 (委托 APH.UI 深模块, ADR-18) ================= */
  function esc(t){ return String(t==null?'':t).replace(/</g,'&lt;'); }
  function overlayClosed(el){
    if(!el) return true;
    return el.style.display==='none' || el.style.display==null || el.style.display===undefined;
  }
  function hideOverlay(id){
    var el=document.getElementById(id);
    if(el) el.style.display='none';
  }
  function closeColonyOverlays(keep){
    if(keep!=='techMap') hideOverlay('techMap');
    if(keep!=='codex') hideOverlay('codex');
    if(keep!=='resPanel') hideOverlay('resPanel');
    if(keep!=='diplomacy') hideOverlay('diplomacyOverlay');
    if(keep!=='buildRow'){
      var row=document.getElementById('buildRow');
      if(row) row.style.display='none';
    }
    if(keep!=='trade'){
      var tp=document.getElementById('tradePanel');
      if(tp && tp.style.display!=='none') toggleTradePanel(false);
    }
  }
  function techMapOpen(){
    return APH.UI && APH.UI.isOpen ? APH.UI.isOpen('techMap') : !overlayClosed(document.getElementById('techMap'));
  }
  function toggleCodex(show){
    if(APH.UI && APH.UI.toggle){
      if(show !== undefined) return show ? APH.UI.open('codex') : APH.UI.close('codex');
      return APH.UI.toggle('codex');
    }
    var el=document.getElementById('codex');
    if(!el) return;
    var s = (show!==undefined)?!!show:overlayClosed(el);
    if(s) closeColonyOverlays('codex');
    el.style.display = s ? '' : 'none';
    if(s && APH.UI && APH.UI.renderCodex) APH.UI.renderCodex();
  }
  function toggleTechMap(force){
    if(APH.UI && APH.UI.toggle){
      if(force !== undefined) return force ? APH.UI.open('techMap') : APH.UI.close('techMap');
      return APH.UI.toggle('techMap');
    }
    var el=document.getElementById('techMap');
    if(!el) return;
    var show = (force===true) ? true : (force===false) ? false : overlayClosed(el);
    if(show) closeColonyOverlays('techMap');
    el.style.display = show ? '' : 'none';
    if(show && APH.UI && APH.UI.renderTechMap) APH.UI.renderTechMap();
  }
  function refreshTechMapIfOpen(){
    if(techMapOpen() && APH.UI && APH.UI.renderTechMap) APH.UI.renderTechMap();
  }
  function moveTechSel(code){
    if(APH.UI && APH.UI.moveTechSel) return APH.UI.moveTechSel(code);
  }
  function tryBuySelectedTech(){
    if(APH.UI && APH.UI.tryBuySelectedTech) return APH.UI.tryBuySelectedTech();
  }
  function renderTechMap(){
    if(APH.UI && APH.UI.renderTechMap) return APH.UI.renderTechMap();
  }
  function renderCodex(){
    if(APH.UI && APH.UI.renderCodex) return APH.UI.renderCodex();
  }

  /* ================= 势力外交面板 (委托 APH.UI 深模块, ADR-17, ADR-18) ================= */
  function toggleDiplomacy(show){
    if(APH.UI && APH.UI.toggle){
      if(show !== undefined) return show ? APH.UI.open('diplomacy') : APH.UI.close('diplomacy');
      return APH.UI.toggle('diplomacy');
    }
  }
  function renderDiplomacy(){
    if(APH.UI && APH.UI.renderDiplomacy) return APH.UI.renderDiplomacy();
  }
  function doSendTribute(rIdx, resType){
    if(APH.UI && APH.UI.doSendTribute) return APH.UI.doSendTribute(rIdx, resType);
  }
  function doSignTradePact(rIdx){
    if(APH.UI && APH.UI.doSignTradePact) return APH.UI.doSignTradePact(rIdx);
  }
  function doDeterRival(rIdx){
    if(APH.UI && APH.UI.doDeterRival) return APH.UI.doDeterRival(rIdx);
  }

  /* ================= Task6: 建造目录(左入口+底部row) ================= */
  function toggleBuildRow(force){
    var btn=document.getElementById('buildBtn');
    var row=document.getElementById('buildRow');
    if(!btn||!row) return;
    var willShow = (force===true) ? true : (force===false) ? false : overlayClosed(row);
    if(willShow) closeColonyOverlays('buildRow');
    row.style.display = willShow?'':'none';
    if(willShow) renderBuildRow();
  }
  function renderBuildRow(){
    var s=APH.state;
    document.getElementById('brResearch').textContent='研究点 '+s.meta.research;
    var bm=document.getElementById('brMineral');
    if(bm){
      var r=s.meta.res||{};
      bm.textContent='木 '+(r.wood||0)+' · 铁 '+(r.iron||r.mineral||0)+' · 石 '+(r.stone||0);
    }
    var qEl=document.getElementById('brQueue');
    if(s.colony.buildQueue&&s.colony.buildQueue.length){
      var q0=s.colony.buildQueue[0];
      var remain=Math.ceil((q0.total||0)*(1-(q0.progress||0)));
      qEl.textContent='施工中 '+s.colony.buildQueue.length+' 项 · '+remain+'s';
    }else qEl.textContent='';
    var grid=document.getElementById('brCards');
    grid.innerHTML='';
    var colors=['#82d5bb','#f7cd67','#e59266','#889df0','#fc736d','#8ac68a','#b77dee','#d1da49','#e18c6f'];
    var i=0;
    Object.keys(APH.Colony.list()).forEach(function(bid){
      if(bid==='bl_landing_pad') return;
      var def=APH.Colony.get(bid);
      var nBuilt=s.colony.buildings.filter(function(b){return b.id===bid;}).length;
      var nQueued=(s.colony.buildQueue||[]).filter(function(q){return q.bid===bid;}).length;
      var n=nBuilt+nQueued;
      var check=APH.Colony.canPlace(s.colony.buildings, s.meta.tech, bid, s.px, s.py, s.meta.res);
      var ok=check.ok && n<def.max;
      var costRes=def.costRes||{};
      var costPills=Object.keys(costRes).map(function(k){
        var itName=(CFG.items[k]&&CFG.items[k].name)?CFG.items[k].name:k;
        return '<span style="display:inline-block;background:#3d4a28;color:#c8e89a;border-radius:50px;'+
          'padding:1px 7px;font-size:10px;margin-right:3px">'+costRes[k]+itName+'</span>';
      }).join('');
      var reqTag=def.reqTech&&(!s.meta.tech||!s.meta.tech[def.reqTech])
        ? '<div style="color:#ff6d7a;font-size:10px;margin-top:2px">[需研: '+(APH.Colony.TECHS[def.reqTech]?APH.Colony.TECHS[def.reqTech].name:def.reqTech)+']</div>'
        : '';
      var card=document.createElement('div');
      card.style.cssText='flex:0 0 auto;width:150px;border-radius:16px;padding:10px 12px;cursor:'+
        (ok?'pointer':'not-allowed')+';opacity:'+(ok?1:.55)+';background:'+colors[i%colors.length]+
        ';border:2px solid #fff;box-shadow:0 3px 8px rgba(61,52,40,.12);transition:transform .25s cubic-bezier(.4,0,.2,1)';
      card.innerHTML='<b style="color:#fff;font-size:13px;text-shadow:0 1px 2px rgba(61,52,40,.35)">'+
        def.name+'</b><span style="float:right;color:#fff;font-size:10px">'+n+'/'+def.max+'</span><br>'+
        '<div style="margin-top:4px">'+costPills+'</div>'+
        reqTag+
        '<span style="display:inline-block;background:#794f27;color:#f7f3df;border-radius:50px;'+
        'padding:1px 8px;font-size:10px;margin-top:4px">'+def.buildTime+'s</span>'+
        ((def.cells&&def.cells[0]>1)?'<span style="display:inline-block;background:rgba(255,255,255,.25);color:#fff;'+
          'border-radius:50px;padding:1px 7px;font-size:10px;margin-left:3px">'+def.cells[0]+'×'+def.cells[1]+'</span>':'');
      if(ok){
        card.addEventListener('click',function(){
          s.buildMode=bid;
          toggleBuildRow(false);                 // 收起row, 进入放置
          APH.UI.setHint('建造: '+def.name+' — 点击空地放置');
        });
        card.addEventListener('mouseover',function(){card.style.transform='translateY(-2px)';});
        card.addEventListener('mouseout',function(){card.style.transform='';});
      }
      grid.appendChild(card);
      i++;
    });
  }

  /* ================= C: 游商交易面板 (委托 APH.UI 深模块, ADR-18) ================= */
  function toggleTradePanel(force){
    if(APH.UI && APH.UI.toggle){
      if(force !== undefined) return force ? APH.UI.open('trade') : APH.UI.close('trade');
      return APH.UI.toggle('trade');
    }
  }
  function renderTradePanel(){
    if(APH.UI && APH.UI.renderTradePanel) return APH.UI.renderTradePanel();
  }
  function doTradeRow(i){
    if(APH.UI && APH.UI.doTradeRow) return APH.UI.doTradeRow(i);
  }
  function moveTradeSel(code){
    if(APH.UI && APH.UI.moveTradeSel) return APH.UI.moveTradeSel(code);
  }

  /* ================= U8 居民名册 ================= */
  function toggleResPanel(){
    var el=document.getElementById('resPanel');
    if(!el) return;
    var show=overlayClosed(el);
    if(show) closeColonyOverlays('resPanel');
    el.style.display=show?'':'none';
    if(show) renderResPanel();
  }
  function moodFace(m){
    return m>=75?'😊':(m>=50?'😐':(m>=30?'😟':'😭'));
  }
  function foodBar(f){
    var col=f>=60?'#7dffab':(f>=35?'#ffc857':'#ff6d7a');
    return '<span style="display:inline-block;width:70px;height:7px;background:#1a2334;'+
           'border-radius:3px;vertical-align:middle"><span style="display:block;height:100%;width:'+
           Math.max(0,Math.min(100,f))+'%;background:'+col+';border-radius:3px"></span></span> '+Math.round(f||0);
  }
  function sickBar(f){
    f=f||0;
    var col=f>=50?'#ff6d7a':(f>=20?'#ffc857':'#7dffab');
    return '<span style="display:inline-block;width:70px;height:7px;background:#1a2334;'+
           'border-radius:3px;vertical-align:middle"><span style="display:block;height:100%;width:'+
           Math.max(0,Math.min(100,f))+'%;background:'+col+';border-radius:3px"></span></span> '+Math.round(f);
  }
  /* ---- D: 工作优先级网格(方向键选格 / 0~3 设值) ---- */
  function prioCursor(){
    var s=APH.state;
    if(!s.prioSel) s.prioSel={r:0,c:0};
    return s.prioSel;
  }
  function movePrioCursor(code){
    var s=APH.state, m=s.meta;
    var cur=prioCursor();
    var rows=(m.residents||[]).length, cols=APH.Res.SKILLS.length;
    if(!rows) return;
    cur.r=Math.min(cur.r, rows-1);
    if(code==='ArrowUp') cur.r=(cur.r+rows-1)%rows;
    if(code==='ArrowDown') cur.r=(cur.r+1)%rows;
    if(code==='ArrowLeft') cur.c=(cur.c+cols-1)%cols;
    if(code==='ArrowRight') cur.c=(cur.c+1)%cols;
    s.resSel=cur.r;
    renderResPanel();
  }
  function setPrioAtCursor(v){
    var s=APH.state, m=s.meta;
    var cur=prioCursor();
    var r=(m.residents||[])[cur.r];
    if(!r) return;
    m.workPrio=m.workPrio||{};
    if(!m.workPrio[r.id]) m.workPrio[r.id]=APH.Res.defaultPrio(r);
    var sk=APH.Res.SKILLS[cur.c];
    m.workPrio[r.id][sk]=U.clamp(v,0,3);
    r.jobLocked=false;                     // 改优先级 = 交还自动调度
    saveMetaQuiet();
    renderResPanel();
    APH.UI.floatText(r.name+' · '+APH.Res.SKILL_NAMES[sk]+' 优先级 → '+v,'#8fd4ff');
  }
  var PRIO_COLOR=['#39435c','#ffc857','#cdd9f5','#5d6f96'];
  var PRIO_LABEL=['禁','优','普','闲'];
  function prioGridHtml(m){
    var s=APH.state;
    var cur=prioCursor();
    var wp=m.workPrio||{};
    var html='<div style="margin-bottom:14px">'+
      '<div style="color:#ffc857;margin-bottom:4px">工作优先级 · 方向键选格, 数字 0~3 设值 '+
      '<span style="color:#5d6f96">(0禁止 1优先 2普通 3闲时; 列头亮=技能高)</span></div>'+
      '<table style="border-collapse:collapse;font-size:11px"><tr><td></td>';
    APH.Res.SKILLS.forEach(function(sk){
      html+='<td style="padding:2px 7px;color:#8fa3cc">'+APH.Res.SKILL_NAMES[sk]+'</td>';
    });
    html+='</tr>';
    (m.residents||[]).forEach(function(r, ri){
      html+='<tr><td style="padding:2px 7px;color:'+((s.resSel||0)===ri?'#ffc857':'#cdd9f5')+'">'+
        esc(r.name)+'</td>';
      var p=wp[r.id]||APH.Res.defaultPrio(r);
      APH.Res.SKILLS.forEach(function(sk, ci){
        var v=p[sk]!=null?p[sk]:2;
        var lv=(r.skills&&r.skills[sk])||0;
        var isCur=(cur.r===ri && cur.c===ci);
        var bg=lv>=6?'rgba(125,255,171,.16)':(lv>=3?'rgba(125,255,171,.07)':'transparent');
        html+='<td style="padding:2px 0;text-align:center"><span style="display:inline-block;'+
          'width:30px;border-radius:4px;padding:1px 0;background:'+bg+';color:'+PRIO_COLOR[v]+';'+
          'border:1px solid '+(isCur?'#ffc857':'#1a2334')+';'+
          (v===0?'text-decoration:line-through;':'')+'">'+
          v+PRIO_LABEL[v]+'</span></td>';
      });
      html+='</tr>';
    });
    html+='</table></div>';
    return html;
  }

  function renderResPanel(){
    var s=APH.state, m=s.meta;
    var body=document.getElementById('resBody'); if(!body) return;
    document.getElementById('resFood').textContent=panelStock('food');
    var rm=document.getElementById('resMineral');
    if(rm) rm.textContent=panelStock('mineral');
    document.getElementById('resLeather').textContent=panelStock('leather');
    var rmd=document.getElementById('resMed');
    if(rmd) rmd.textContent=panelStock('med');
    document.getElementById('resPop').textContent=m.residents.length+'/'+housingCap();
    if(!m.residents.length){
      body.innerHTML='<div style="color:#39435c;margin-top:40px;text-align:center">'+
        '殖民地还没有居民。<br>过客会来拜访家园，走近他们按 [E] 招募。</div>';
      return;
    }
    var html=prioGridHtml(m);
    m.residents.forEach(function(r, idx){
      var skHtml = APH.Res.SKILLS.map(function(sk){
        var v=(r.skills&&r.skills[sk])||0;
        var col = sk===r.mainSkill?'#ffc857':(sk===r.subSkill?'#8fd4ff':'#39435c');
        return '<span style="color:'+col+'">'+APH.Res.SKILL_NAMES[sk]+v+'</span>';
      }).join(' · ');
      var jobTxt=r.job?(APH.Colony.get(r.job)||{}).name||r.job:(r.mainSkill==='sk_farm'?'待岗(适合务农)':'闲居');
      var sel=(s.resSel||0)===idx;
      var brkTag=(APH.Res.isBroken&&APH.Res.isBroken(r))
        ? ' <span style="color:#ff6d7a;font-weight:700">[崩溃·'+
          (APH.Res.BREAK_NAMES[r.breakType]||r.breakType)+']</span>' : '';
      html+='<div style="border:1px solid '+(sel?'#ffc857':'#1a2334')+';border-radius:10px;padding:12px 16px;margin-bottom:10px;background:#0c1220">'+
        '<b style="font-size:13px">'+(idx+1)+'. '+r.name+'</b>'+brkTag+
        ' <span style="color:#8fa3cc;font-size:11px">'+moodFace(r.mood)+' '+r.trait+
        ' · '+r.origin+(r.job?' · <span style="color:#8fd4ff">'+jobTxt+' (效率'+APH.Res.efficiency(r)+')</span>'
         :' · '+jobTxt)+'</span><br>'+
        '<span style="color:#5d6f96;font-size:11px">'+skHtml+'</span><br>'+
        (r.bio?'<div style="color:#6f83ad;font-size:11px;margin-top:4px;border-left:2px solid #1a2334;padding-left:8px">'+esc(r.bio)+'</div>':'')+
        '<div style="margin-top:4px;font-size:11px">'+
        '心情 '+foodBar(r.mood)+'&nbsp;&nbsp;饱食 '+foodBar(r.food)+
        '&nbsp;&nbsp;精力 '+foodBar(r.rest!=null?r.rest:100)+(r.isSleeping?' <span style="color:#8fd4ff">💤[睡眠]</span>':'')+
        '&nbsp;&nbsp;娱乐 '+foodBar(r.recreation!=null?r.recreation:80)+
        (r.exposure>0 ? ('&nbsp;&nbsp;<span style="color:#ffb35c">暴露 '+sickBar(r.exposure)+'</span>') : '')+
        '&nbsp;&nbsp;病情 '+sickBar(r.illness||0)+
        /* 深度生存: 击倒状态与三维机能 */
        (r.downed ? ' <span style="color:#ff4757;font-weight:700">[🚨 击倒 · 濒死 '+Math.max(0,Math.round(r.bleedOutTimer||0))+'s]</span>' : '')+
        /* F: 病症分型标签(疫病红/感染橙/外伤灰) */
        (r.ailments&&r.ailments.length
          ? ' <span style="font-size:11px">'+r.ailments.map(function(a){
              var col=a.type==='plague'?'#ff6d7a':(a.type==='infection'?'#ffb35c':'#8fa3cc');
              return '<span style="color:'+col+'">['+
                (APH.Res.AILMENT_NAMES[a.type]||a.type)+' '+Math.round(a.sev)+']</span>';
            }).join(' ')+'</span>'
          : '')+
        '</div>'+
        (function(){
          var cap=APH.Res.capacitiesOf(r);
          return '<div style="font-size:10px;color:#8fa3cc;margin-top:2px">'+
            '机能: 移动 '+Math.round(cap.moving*100)+'% · 操作 '+Math.round(cap.manipulation*100)+'% · 认知 '+Math.round(cap.consciousness*100)+'%'+
            (r.bedId ? (' · <span style="color:#7dffab">床位['+r.bedId+']</span>') : ' · <span style="color:#ffb35c">露宿打地铺</span>')+
            '</div>';
        })()+
        '</div>';
    });
    /* 关系摘要 */
    if(m.bonds && Object.keys(m.bonds).length){
      html+='<div style="margin-top:14px;color:#ffc857">人际关系</div>';
      Object.keys(m.bonds).forEach(function(k){
        var v=Math.round(m.bonds[k]);
        var names=k.split('|').map(function(id){
          var r=m.residents.find(function(x){return x.id===id;});
          return r?r.name:'?';
        });
        var tag=v>=70?'挚友':(v>=55?'友好':(v>=40?'平淡':(v>=25?'疏远':'敌视')));
        var col=v>=70?'#7dffab':(v>=40?'#8fa3cc':'#ff6d7a');
        html+='<div style="color:'+col+'">'+names[0]+' ↔ '+names[1]+' : '+tag+' ('+v+')</div>';
      });
    }
    body.innerHTML=html;
  }

  function cycleSelectedJob(){
    var s=APH.state, m=s.meta;
    if(!m.residents||!m.residents.length) return;
    s.resSel=Math.max(0, Math.min(s.resSel||0, m.residents.length-1));
    var r=m.residents[s.resSel];
    var job=APH.Colony.cycleJob(r, s.colony.buildings);
    var nm=job?(APH.Colony.get(job)||{}).name:'闲居';
    APH.UI.floatText(r.name+' → '+nm,'#8fd4ff');
    APH.Save.saveMeta(m);
    syncResidentEntities();
    var el=document.getElementById('resPanel');
    if(el && el.style.display!=='none') renderResPanel();
  }

  function homeSpot(r, i, buildings){
    var houses=(buildings||[]).filter(function(b){ return b.id==='bl_house'; });
    if(houses.length){
      var h=houses[i%houses.length];
      return { x:h.x+(i%2)*14-7, y:h.y+24 };
    }
    return { x:CFG.HAB.x+(i%5)*14-28, y:CFG.HAB.y+40 };
  }

  function residentSpot(r, i, buildings){
    var q=(APH.state.colony.buildQueue)||[];
    if((!r.job || r.job==='blueprint') && APH.Colony.isBuilder(r) && q.length){
      var bp=q[i%q.length];
      return { x:bp.x+12, y:bp.y+18 };
    }
    if(r.job){
      var bs=buildings.filter(function(b){ return b.id===r.job; });
      if(bs.length){
        var b=bs[i%bs.length];
        return { x:b.x+16+(i%3)*10, y:b.y+22 };
      }
    }
    return homeSpot(r, i, buildings);
  }

  function syncResidentEntities(){
    var s=APH.state;
    if(s.scene!=='home') return;
    var buildings=s.colony.buildings||[];
    var roster=s.meta.residents||[];
    var byId={};
    s.entities.forEach(function(e){
      if(e && e.type===T.RESIDENT) byId[e.rid||e.id]=e;
    });
    var keep={};
    var raid=!!(s.war&&s.war.raidActive);
    roster.forEach(function(r,i){
      var home=homeSpot(r,i,buildings);
      var job=residentSpot(r,i,buildings);
      var tgt=raid?home:job;
      var e=byId[r.id];
      if(!e){
        e={
          id:r.id, type:T.RESIDENT, x:home.x, y:home.y,
          name:r.name, rid:r.id, job:r.job, mood:r.mood, food:r.food,
          illness:r.illness||0, rest:r.rest, recreation:r.recreation, exposure:r.exposure,
          isSleeping:!!r.isSleeping, downed:!!r.downed, medLying:!!r.medLying,
          walking:false, face:Math.PI/2, walkPh:0,
        };
        s.entities.push(e);
      }else{
        e.name=r.name; e.job=r.job; e.mood=r.mood; e.food=r.food; e.illness=r.illness||0;
        e.rest=r.rest; e.recreation=r.recreation; e.exposure=r.exposure;
        e.isSleeping=!!r.isSleeping; e.downed=!!r.downed; e.medLying=!!r.medLying;
      }
      e.tx=tgt.x; e.ty=tgt.y;
      keep[r.id]=true;
    });
    s.entities=s.entities.filter(function(e){
      return e.type!==T.RESIDENT || keep[e.rid||e.id];
    });
  }

  function dropStore(d){
    var it=(CFG.items&&d&&CFG.items[d.itemId])||{};
    return it.store||null;
  }
  function nearestDrop(from, r, pred){
    var s=APH.state, best=null, bd=r;
    (s.entities||[]).forEach(function(d){
      if(!d || d.dead || d.type!==T.DROPPED) return;
      if(pred && !pred(d)) return;
      var dist=U.dst(from.x,from.y,d.x,d.y);
      if(dist<bd){ bd=dist; best=d; }
    });
    return best;
  }
  function nibblePile(drop, n){
    var take=Math.min(drop.n||1, n||1);
    drop.n=(drop.n||1)-take;
    if((drop.n||0)<=0) drop.dead=true;
    return take;
  }
  function residentOf(e){
    var id=e&&(e.rid||e.id);
    var list=(APH.state.meta&&APH.state.meta.residents)||[];
    for(var i=0;i<list.length;i++) if(list[i].id===id) return list[i];
    return null;
  }
  function nearestMeal(e, rMax){
    var s=APH.state, best=null, bd=rMax;
    var bestCooked=null, bestCookedDist=rMax;
    (s.entities||[]).forEach(function(p){
      if(!p || p.dead || p.type!==T.DROPPED) return;
      var it = CFG.items && CFG.items[p.itemId];
      if(!it || it.store!=='food') return;
      var dist=U.dst(e.x,e.y,p.x,p.y);
      if(it.isCooked && dist<bestCookedDist){
        bestCookedDist=dist;
        bestCooked={ kind:'pile', drop:p, x:p.x, y:p.y, itemId:p.itemId, isCooked:true };
      }
      if(dist<bd){
        bd=dist;
        best={ kind:'pile', drop:p, x:p.x, y:p.y, itemId:p.itemId, isCooked:!!it.isCooked };
      }
    });
    if(bestCooked) return bestCooked;
    if((s.meta.res&&s.meta.res.food||0)>0){
      var st=APH.Colony.stockpileSpot(s.colony&&s.colony.buildings);
      var d=U.dst(e.x,e.y,st.x,st.y);
      if(d<bd){ bd=d; best={ kind:'stock', x:st.x, y:st.y }; }
    }
    return best;
  }
  /* T8: 无桌吃饭心情惩罚(在餐桌用餐豁免): 每次非atTable 吃成后结算 */
  function applyNoTablePenalty(r){
    var C=CFG.residents||{};
    var pen=C.noTableMoodPenalty!=null?C.noTableMoodPenalty:-3;
    if(pen>=0) return;
    r.mood=Math.max(0, (r.mood||70)+pen);
  }

  function tryEatHere(e, r, grabR, dumpR, atTable, eatR){
    if(!r || !APH.Res.eatOnce) return false;
    /* T8: 在餐桌用餐浮标 (atTable=true: 居民到椅上吃, 显示 😋 在餐桌用餐) */
    var TBL_FLAG=!!atTable;
    /* T8: 桌旁吃略放宽取食半径 (椅到桌旁粮堆可略远) */
    var mealR = (eatR!=null) ? eatR : (TBL_FLAG && CFG.residents && CFG.residents.diningTableEatR!=null
      ? CFG.residents.diningTableEatR : grabR);
    if(e.haulCarry && dropStore({itemId:e.haulCarry.itemId})==='food'){
      var itDefC = (CFG.items && CFG.items[e.haulCarry.itemId]) || { name:'食物', foodGain:25 };
      var eatRes = (APH.Res.eatMeal) ? APH.Res.eatMeal(r, itDefC, { atTable: TBL_FLAG }) : { ate: APH.Res.eatOnce(r, itDefC) };
      if(!eatRes.ate) return false;
      e.haulCarry.n=(e.haulCarry.n||1)-1;
      if((e.haulCarry.n||0)<=0) e.haulCarry=null;
      if(itDefC.isCooked){
        APH.UI.floatText((TBL_FLAG?'😋 '+(e.name||'居民')+' 在餐桌用餐':'😋 '+(e.name||'居民')+' 享用了 '+itDefC.name)+' (+'+(itDefC.foodGain||25)+'饱食 +'+(itDefC.moodGain||0)+'心情 +'+(itDefC.recGain||0)+'娱乐)', '#ffd54f');
      }else{
        APH.UI.floatText((e.name||'居民')+(TBL_FLAG?' 在餐桌吃了饭':' 吃了手里的食物'),'#c8e89a');
      }
      if(!TBL_FLAG) applyNoTablePenalty(r);
      e.food=r.food;
      return true;
    }
    var meal=nearestMeal(e, 1e9);
    if(!meal) return false;
    var need=meal.kind==='stock'?dumpR:mealR;
    if(U.dst(e.x,e.y,meal.x,meal.y)>=need) return false;
    if(meal.kind==='stock'){
      if((APH.state.meta.res.food||0)<=0) return false;
      /* T8: 有桌在仓库吃也计「在餐桌用餐」 */
      var eatStock = (APH.Res.eatMeal) ? APH.Res.eatMeal(r, null, { atTable: TBL_FLAG }) : { ate: APH.Res.eatOnce(r) };
      if(!eatStock.ate) return false;
      APH.state.meta.res.food--;
      APH.UI.floatText((e.name||'居民')+(TBL_FLAG?' 在餐桌吃了口粮 (+'+(eatStock.foodGain||25)+'饱食 +'+(eatStock.moodGain||0)+'心情)':' 在仓库吃了口粮 (+25饱食)'),'#c8e89a');
    }else{
      if(!meal.drop || meal.drop.dead) return false;
      var itDefG = (CFG.items && CFG.items[meal.drop.itemId]) || { name:'食物', foodGain:25 };
      var eatResG = (APH.Res.eatMeal) ? APH.Res.eatMeal(r, itDefG, { atTable: TBL_FLAG }) : { ate: APH.Res.eatOnce(r, itDefG) };
      if(!eatResG.ate) return false;
      nibblePile(meal.drop, 1);
      if(itDefG.isCooked){
        APH.UI.floatText((TBL_FLAG?'😋 '+(e.name||'居民')+' 在餐桌用餐':'😋 '+(e.name||'居民')+' 享用了 '+itDefG.name)+' (+'+(itDefG.foodGain||25)+'饱食 +'+(itDefG.moodGain||0)+'心情 +'+(itDefG.recGain||0)+'娱乐)', '#ffd54f');
      }else{
        APH.UI.floatText((e.name||'居民')+(TBL_FLAG?' 在餐桌吃了饭':' 吃了地上的食物'),'#c8e89a');
      }
    }
    if(!TBL_FLAG) applyNoTablePenalty(r);
    e.food=r.food;
    return true;
  }

  function updateResidents(dt){
    var s=APH.state;
    if(s.scene!=='home') return;
    syncResidentEntities();
    var spd=(CFG.walk&&CFG.walk.speed)||56;
    /* W3 天气效果(家园): 居民室外移动减速乘子(寒潮+防寒服=免; 远征不适用) */
    var resWxId=(window.APH.Weather&&APH.Weather.currentId)?APH.Weather.currentId(s.meta):'wx_clear';
    var resWxEff=(window.APH.Weather&&APH.Weather.weatherEffects)?APH.Weather.weatherEffects(resWxId):null;
    var resWxSpeedMul=(resWxEff&&resWxEff.speedMul!=null)?resWxEff.speedMul:1;
    var H=CFG.haul||{};
    var pickR=H.pickR!=null?H.pickR:52;
    var seekR=H.seekR!=null?H.seekR:420;
    var grabR=H.grabR!=null?H.grabR:18;
    var dumpR=H.dumpR!=null?H.dumpR:36;
    var raid=!!(s.war&&s.war.raidActive);
    var stock=APH.Colony.stockpileSpot(s.colony&&s.colony.buildings);
    var eatBelow=(CFG.residents&&CFG.residents.eatBelow!=null)?CFG.residents.eatBelow:60;
    /* T8 餐桌椅 (#81): 每帧收集桌椅+饥饿居民 → 座位分配 (纯函数; 每椅1人, 懒汉不受) */
    var diningTbls=[], diningChairs=[];
    (s.colony&&s.colony.buildings||[]).forEach(function(b){
      if(b.id==='bl_dining_table' && !b.dead) diningTbls.push(b);
      else if(b.id==='bl_dining_chair' && !b.dead) diningChairs.push(b);
    });
    var hungryRes=[], seatMap={};
    if(!raid && diningTbls.length && diningChairs.length){
      s.entities.forEach(function(e){
        if(e && e.type===T.RESIDENT){
          var r0=residentOf(e);
          if(r0 && r0.food!=null && r0.food<eatBelow) hungryRes.push({id:r0.id,x:e.x,y:e.y});
        }
      });
      seatMap=APH.Res.diningSeatAlloc(hungryRes, diningChairs, diningTbls);
    }
    /* T3 绕墙走位: 每帧一张障碍矩阵(墙/围攻营地=1, 闸门=0), 居民共享 */
    var navGrid=(window.APH.Nav&&APH.Nav.gridOf)?APH.Nav.gridOf((s.colony&&s.colony.buildings)||[]):null;
    /* T9 无顶房间: 墙/门围合区域 (每帧重算, 46×46 flood) —— 供暴露/心情/路灯照明 */
    var rooms=(window.APH.Nav&&APH.Nav.roomsOf)?APH.Nav.roomsOf((s.colony&&s.colony.buildings)||[]):[];
    s.entities.forEach(function(e){
      if(!e || e.type!==T.RESIDENT) return;
      e.hurtCd=Math.max(0,(e.hurtCd||0)-dt);
      if(e.hitFlash>0) e.hitFlash=Math.max(0,e.hitFlash-dt);
      var r=residentOf(e);
      var walkCfg=CFG.walk||{};
      var sickSpeedMul=r && r.illness>walkCfg.sickAbove ? walkCfg.sickSpeedMul : 1;
      /* W3 天气室外减速: 房间内/避难所免罚; 寒潮+防寒服=免 */
      var wxMul=1;
      if(r && APH.Res && APH.Res.weatherMoveMul){
        wxMul=APH.Res.weatherMoveMul(r, resWxId, resWxSpeedMul,
          APH.Res.shelteredFor({x:e.x, y:e.y}, (s.colony&&s.colony.buildings)||[], rooms));
      }
      /* T10 沙袋: 居民穿过减速 ×sandbagMul (home 限定) */
      var bagMul=1;
      if(s.colony&&s.colony.buildings){
        var bagList=s.colony.buildings.filter(function(b){ return b.id==='bl_sandbag'; });
        if(bagList.length) bagMul=APH.Colony.sandbagMul(bagList, e);
      }
      /* B: 崩溃者不吃不搬不上岗; 出走型在院子里游荡, 其余原地停工 */
      /* #68: 睡着居民不进食、不搬运、不上岗、不走动(俯卧贴地) — 优先于破碎分支, 防破碎+wander 睡着仍游荡 */
      /* #69: 医疗舱俯卧者同短路(俯卧不滑行) */
      if(r && (r.isSleeping || r.medLying)){ e.walking = false; return; }
      /* #69 病重/击倒: 前往医疗舱床位俯卧 (轻病不躺, 仍慢走+✚) */
      if(r && !r.medLying && APH.Res.needsMedBed(r)){
        var clinic=(s.colony.buildings||[]).find(function(b){ return b.id==='bl_clinic'; });
        if(raid){
          /* raid 中: 击倒者必须原地俯卧(不能趴着爬回家/工作); 病重暂不强迫去床 */
          if(r.downed){ e.walking=false; return; }
        }else if(clinic){
          var bSpot=APH.Res.clinicBedSpot(clinic);
          e.tx=bSpot.x; e.ty=bSpot.y;
          var crawlMul=(CFG.residents&&CFG.residents.downedCrawlMul!=null)?CFG.residents.downedCrawlMul:0.5;
          APH.Res.walkAround(e, bSpot, dt, r.downed ? spd*crawlMul*wxMul*bagMul : spd*sickSpeedMul*wxMul*bagMul, navGrid);
          var bedArrive=(CFG.residents&&CFG.residents.clinicBedArriveR!=null)?CFG.residents.clinicBedArriveR:6;
          if(U.dst(e.x,e.y,bSpot.x,bSpot.y)<=bedArrive){
            r.medLying=true; e.medLying=true; e.walking=false;
            e.x=bSpot.x; e.y=bSpot.y;
            r.job=null; e.job=null;      /* 与 checkDowned 一致: 躺床撤岗 */
          }
          return;
        }
        if(r.downed){ e.walking=false; return; }   /* 无医疗舱: 击倒者原地俯卧(渲染已由 e.downed 接管) */
      }
      if(!raid && r && APH.Res.isBroken(r)){
        e.breaking=r.breakType;
        if(r.breakType==='wander'){
          var wanderSpd=((CFG.visitor&&CFG.visitor.speed)||48)*sickSpeedMul*wxMul;
          APH.Res.wanderStep(e, dt, CFG.HAB, (CFG.visitor&&CFG.visitor.yardR)||220, null, wanderSpd);
        }else{
          e.walking=false;
        }
        return;
      }
      e.breaking=null;
      var hungry=r && r.food!=null && r.food<eatBelow;
      /* T8: 有桌有座 → 优先去最近空椅坐吃 (座次分配已在本帧 seatMap) */
      var seat=!raid && hungry ? (seatMap[r.id]||null) : null;
      if(seat && seat.chair){
        /* 到椅坐下: 椅子位置+小偏移(避叠); 到达后坐在椅上吃 */
        var seatX=seat.chair.x+8, seatY=seat.chair.y-2;
        var dSeat=U.dst(e.x,e.y,seatX,seatY);
        if(dSeat>((CFG.residents&&CFG.residents.diningArriveR!=null)?CFG.residents.diningArriveR:6)){
          e.tx=seatX; e.ty=seatY;
          APH.Res.walkAround(e, {x:seatX,y:seatY}, dt, spd*sickSpeedMul*wxMul*bagMul, navGrid);
          /* 坐下后脸朝桌 (坐着吃=站姿, 只转脸) */
          if(APH.Res.faceTable && U.dst(e.x,e.y,seatX,seatY)<=10) e.face=APH.Res.faceTable(seat.chair, seat.table);
        }else{
          e.x=seatX; e.y=seatY; e.walking=false;
          e.face=APH.Res.faceTable(seat.chair, seat.table);
          /* 在餐桌用餐: atTable=true → 心情增益+😊浮标+不罚无桌 */
          var ateAtTable=tryEatHere(e, r, grabR, dumpR, true, ((CFG.residents&&CFG.residents.diningTableEatR!=null)?CFG.residents.diningTableEatR:90));
          if(!ateAtTable && r.food<eatBelow){
            /* 桌旁无粮兜底: 转最近粮堆/仓库(此时算无桌吃, 出惩罚) */
            var meal2=nearestMeal(e, seekR);
            if(meal2){ e.tx=meal2.x; e.ty=meal2.y; APH.Res.walkAround(e, meal2, dt, spd*sickSpeedMul*wxMul*bagMul, navGrid); }
          }
        }
        return;
      }
      if(!raid && hungry){
        if(!tryEatHere(e, r, grabR, dumpR) && r.food<eatBelow){
          var meal=nearestMeal(e, seekR);
          if(meal){ e.tx=meal.x; e.ty=meal.y; }
        }
      }else if(!raid){
        if(e.haulCarry && e.haulCarry.itemId){
          e.tx=stock.x; e.ty=stock.y;
          if(U.dst(e.x,e.y,stock.x,stock.y)<dumpR){
            APH.Colony.collectHome(s.meta, e.haulCarry.itemId, e.haulCarry.n||1);
            var it=(CFG.items&&CFG.items[e.haulCarry.itemId])||{};
            APH.UI.floatText((e.name||'居民')+' 入库 '+(it.name||'')+'×'+(e.haulCarry.n||1),'#9fe8c8');
            e.haulCarry=null;
          }
        }else{
          var reach=e.job?pickR:seekR;
          var drop=nearestDrop(e, reach);
          if(drop){
            e.tx=drop.x; e.ty=drop.y;
            if(U.dst(e.x,e.y,drop.x,drop.y)<grabR){
              e.haulCarry={ itemId:drop.itemId, n:drop.n||1 };
              drop.dead=true;
            }
          }else if(!e.job && r && (r.recreation||80)<70){
            var campfire = (s.colony&&s.colony.buildings||[]).find(function(b){ return b.id==='bl_campfire'; });
            if(campfire){
              var cDist = U.dst(e.x, e.y, campfire.x, campfire.y);
              if(cDist > 30 && cDist < 350){
                e.tx = campfire.x + Math.sin((s.clock||0)+e.x)*20;
                e.ty = campfire.y + Math.cos((s.clock||0)+e.y)*20;
              }
            }
          }
        }
      }
      /* T10 陷阱重置: 居民路过已触发陷阱(armed=false) → 耗建材自动复位 */
      if(!raid && r && !r.isBroken && !r.isSleeping && !r.medLying && (s.colony&&s.colony.buildings)){
        var tblds=s.colony.buildings.filter(function(b){ return b.id==='bl_spike_trap' && b.armed===false; });
        if(tblds.length){
          for(var ti=0;ti<tblds.length;ti++){
            var tt=tblds[ti];
            if(U.dst(e.x,e.y,tt.x,tt.y) < 40){
              var rc=(CFG.defense&&CFG.defense.trapResetCost)||{stone:1};
              var haveAll=true;
              for(var rk in rc){ if(((s.meta.res&&s.meta.res[rk])||0) < rc[rk]){ haveAll=false; break; } }
              if(haveAll){
                for(var rk2 in rc){ s.meta.res[rk2]=Math.max(0,(s.meta.res[rk2]||0)-rc[rk2]); }
                tt.armed=true; tt.cd=0;
                APH.UI.floatText((e.name||'居民')+' 重置了尖刺陷阱','#9fe8c8');
              }
              break;
            }
          }
        }
      }
      APH.Res.walkAround(e, {x:e.tx, y:e.ty}, dt, spd*sickSpeedMul*wxMul*bagMul, navGrid);
    });
  }

  function visitorCount(){
    var n=0;
    (APH.state.entities||[]).forEach(function(e){
      if(e && e.type===T.VISITOR && !e.dead) n++;
    });
    return n;
  }
  function nearestVisitor(s){
    var r=(CFG.visitor && CFG.visitor.recruitR)||54;
    var best=null, bd=r;
    (s.entities||[]).forEach(function(e){
      if(!e || e.type!==T.VISITOR || e.dead) return;
      var d=U.dst(s.px,s.py,e.x,e.y);
      if(d<bd){ bd=d; best=e; }
    });
    return best;
  }
  function spawnVisitor(at, over){
    var s=APH.state;
    s.meta.residentSeq=(s.meta.residentSeq||0)+1;
    var taken=(s.meta.residents||[]).map(function(x){return x.name;});
    (s.entities||[]).forEach(function(e){
      if(e.type===T.VISITOR && e.profile && e.profile.name) taken.push(e.profile.name);
    });
    var profile=APH.Res.generate('v'+s.meta.residentSeq+'_'+(Date.now()%10000),
      ((s.seed||7)*31+s.meta.residentSeq*917)>>>0, taken);
    if(over) Object.assign(profile, over);
    profile.arrivedAt=s.clock||0;
    APH.Res.enrichBio(profile);
    var ang=Math.random()*U.TAU;
    var rad=140+Math.random()*50;
    var x=at&&at.x!=null ? at.x : CFG.HAB.x+Math.cos(ang)*rad;
    var y=at&&at.y!=null ? at.y : CFG.HAB.y+Math.sin(ang)*rad;
    y=Math.max(40, y);
    var stay=(CFG.visitor.stayMin||50)+Math.random()*((CFG.visitor.stayMax||90)-(CFG.visitor.stayMin||50));
    var ent={
      id:profile.id, type:T.VISITOR, x:x, y:y,
      name:profile.name, profile:profile,
      wanderA:ang+Math.PI, wanderT:0.2, stayT:stay, askCd:0,
      impression:(CFG.recruit&&CFG.recruit.impressStart)||50, fed:false,
      face:ang+Math.PI, walkPh:0, walking:true, wanderIdle:false
    };
    /* C: 游商随身带一份 seeded 货单 */
    if(APH.Res.joinIntentOf(profile)==='trader'){
      ent.trade=APH.Res.makeTraderStock(((s.seed||7)*131 + (s.meta.residentSeq||0)*977)>>>0);
    }
    s.entities.push(ent);
    APH.UI.floatText('过客 '+profile.name+' 来拜访了','#8fd4ff');
    U.emit('visitorArrived', profile);
    return ent;
  }
  function firstNightOpening(){
    var s=APH.state;
    if(!s.meta) s.meta={};
    if(!s.meta.opening){
      s.meta.opening = (window.APH.Opening && APH.Opening.defaults)
        ? APH.Opening.defaults(false)
        : { played:false, nightDone:false, sleptInHouse:false, houseAt:null, firstVisitor:false };
    }
    return s.meta.opening;
  }
  function applyFirstNightHint(){
    if(!window.APH.Opening || !APH.Opening.objective) return;
    var s=APH.state;
    var o=APH.Opening.objective(firstNightOpening(), (s.colony&&s.colony.buildings)||[]);
    if(o) APH.UI.setHint(o.text);
  }
  function tryFirstNightVisitor(){
    var s=APH.state;
    if(s.scene!=='home') return null;
    if(!window.APH.Opening || !APH.Opening.visitorAllowed){
      return maybeSpawnVisitor(false);
    }
    var op=firstNightOpening();
    var b=(s.colony&&s.colony.buildings)||[];
    if(!APH.Opening.visitorAllowed(op, b, s.clock||0)) return null;
    if(!op.firstVisitor){
      if(visitorCount()===0) spawnVisitor();
      op.firstVisitor=true;
      try{ APH.Save.saveMeta(s.meta); }catch(eF){}
      return true;
    }
    return maybeSpawnVisitor(false);
  }
  function maybeSpawnVisitor(force){
    var s=APH.state;
    if(s.scene!=='home') return null;
    if(window.APH.Opening && APH.Opening.visitorAllowed &&
       !APH.Opening.visitorAllowed(firstNightOpening(), (s.colony&&s.colony.buildings)||[], s.clock||0))
      return null;
    var max=(CFG.visitor && CFG.visitor.max)||2;
    if(visitorCount()>=max) return null;
    if(!force && Math.random()>(CFG.visitor.arriveChance||0.45)) return null;
    return spawnVisitor();
  }
  function makeRecruitCtx(vis){
    var s=APH.state;
    var start=(CFG.recruit&&CFG.recruit.impressStart)||50;
    return {
      residentCount:(s.meta.residents||[]).length,
      housingCap:housingCap(),
      food:haveStock('food'),
      buildings:(s.colony&&s.colony.buildings)||[],
      raidActive:!!(s.war&&s.war.raidActive),
      impression: vis && vis.impression!=null ? vis.impression : start
    };
  }
  function tryOfferMeal(ent){
    var s=APH.state;
    if(!ent || ent.dead) return false;
    if(ent.fed){
      APH.UI.floatText('✕ 已经请过客吃过了','#ff9a9a');
      return false;
    }
    var cookedDrop = (s.entities||[]).find(function(e){
      return e && !e.dead && e.type===T.DROPPED && CFG.items[e.itemId] && CFG.items[e.itemId].isCooked && (e.n||1)>0;
    });
    var isCooked = false;
    var need = (CFG.recruit&&CFG.recruit.mealCost)||2;
    if(cookedDrop){
      isCooked = true;
      need = 0;
      nibblePile(cookedDrop, 1);
    }else{
      if(!APH.Colony.ensureStock(s.meta.res, s.entities, 'food', need)){
        APH.UI.floatText('✕ 食物不够请客','#ff9a9a');
        return false;
      }
    }
    var r=APH.Res.offerMeal(s.meta, ent, need, isCooked);
    if(!r.ok){
      APH.UI.floatText('✕ '+r.why,'#ff9a9a');
      return false;
    }
    saveMetaQuiet();
    var msg = isCooked ? '🍲 用精制熟食款待了 ' + (ent.name||'过客') + ' (印象+35 → ' + Math.round(r.impression) + ')'
                       : '🍲 请 ' + (ent.name||'过客') + ' 吃了一顿 (印象+' + (r.boost||20) + ' → ' + Math.round(r.impression) + ')';
    APH.UI.floatText(msg, '#ffca28');
    return true;
  }
  function tryRecruit(ent, rng){
    var s=APH.state;
    if(!ent || ent.dead) return false;
    if((ent.askCd||0)>0){
      APH.UI.floatText((ent.name||'过客')+' 还想再看看','#8fa3cc');
      return false;
    }
    var profile=ent.profile||ent;
    var ctx=makeRecruitCtx(ent);
    var r=APH.Res.attemptRecruit(s.meta, profile, ctx, rng);
    if(!r.ok){
      if(r.why==='还想再看看'){
        ent.askCd=(CFG.recruit&&CFG.recruit.askCd)||15;
        APH.UI.floatText((profile.name||'过客')+' 还想再看看','#8fa3cc');
      }else{
        APH.UI.floatText('✕ '+r.why,'#ff9a9a');
      }
      return false;
    }
    ent.dead=true;
    var sx=ent.x, sy=ent.y, rid=r.resident.id;
    s.entities=s.entities.filter(function(e){ return e!==ent; });
    APH.Res.enrichBio(r.resident);
    saveMetaQuiet();
    syncResidentEntities();
    s.entities.forEach(function(e){
      if(e.type===T.RESIDENT && (e.rid===rid || e.id===rid)){ e.x=sx; e.y=sy; }
    });
    var skName=APH.Res.SKILL_NAMES[r.resident.mainSkill];
    APH.UI.floatText('🤝 '+r.resident.name+' 加入了殖民地'+(skName?' ('+skName+'专精)':''),'#9fe8c8');
    var pop=(s.meta.residents||[]).length;
    var days=pop ? Math.floor(haveStock('food')/Math.max(1,pop)) : 0;
    if(days<3) APH.UI.floatText('⚠ 招了之后食物大约还能撑'+days+'跳','#ffc857');
    U.emit('residentJoined', r.resident);
    return true;
  }
  function updateVisitors(dt){
    var s=APH.state;
    if(s.scene!=='home') return;
    var yard=(CFG.visitor && CFG.visitor.yardR)||220;
    s.entities.forEach(function(e){
      if(!e || e.type!==T.VISITOR || e.dead) return;
      e.stayT=(e.stayT||0)-dt;
      if(e.askCd>0) e.askCd=Math.max(0, e.askCd-dt);
      if(e.stayT>0){
        e.impression=APH.Res.tickImpression(e.impression, dt, makeRecruitCtx(e));
      }
      if(e.stayT<=0){
        var dx=e.x-CFG.HAB.x, dy=e.y-CFG.HAB.y;
        var d=Math.sqrt(dx*dx+dy*dy)||1;
        e.x+=dx/d*90*dt; e.y+=dy/d*90*dt;
        e.walking=true; e.wanderIdle=false;
        e.face=Math.atan2(dy, dx);
        APH.Res.bumpWalkPh(e, dt);
        if(d>yard+90){
          e.dead=true;
          APH.UI.floatText((e.name||'过客')+' 上路了','#5d6f96');
        }
        return;
      }
      APH.Res.wanderStep(e, dt, CFG.HAB, yard);
    });
    s.entities=s.entities.filter(function(e){
      return !(e.type===T.VISITOR && e.dead);
    });
  }

  /* ================= P6 居民系统 ================= */
  function extraRes(){
    return (APH.Colony.groundTally && APH.Colony.groundTally(APH.state.entities)) || {};
  }
  function haveStock(key){
    if(APH.Colony.stockOf) return APH.Colony.stockOf(APH.state.meta.res, APH.state.entities, key);
    return (APH.state.meta.res&&APH.state.meta.res[key])||0;
  }
  function panelStock(key){
    var s=APH.state, w=(s.meta.res&&s.meta.res[key])||0;
    var g=APH.Colony.groundCount ? APH.Colony.groundCount(s.entities, key) : 0;
    return g>0 ? (w+' · 地'+g) : String(w);
  }
  function housingCap(){
    return APH.Colony.housingCapacity(APH.state.colony.buildings);
  }
  function residentsTick(){
    var s=APH.state, m=s.meta;
    /* W3 天气效果: 当前天气 id(读 meta.weather, 老档兜底 wx_clear); 极端清单以 exposureGain>0 为准 */
    var wxId=(window.APH.Weather&&APH.Weather.currentId)?APH.Weather.currentId(m):'wx_clear';
    var wxFx=(window.APH.Weather&&APH.Weather.weatherEffects)?APH.Weather.weatherEffects(wxId):{};
    var wxExtreme=((wxFx.exposureGain)||0)>0;
    /* T9 无顶房间: 生产跳重算房间(墙/门围合), 供暴露免疫+卧室心情 */
    var T9_rooms=(window.APH.Nav&&APH.Nav.roomsOf)?APH.Nav.roomsOf(s.colony.buildings):[];
    /* 深度生存: 床位分配 (Survival #15) */
    APH.Res.assignBeds(s.colony.buildings, m.residents);

    /* U4 需求结算: 生产跳只掉饱食; 吃饭要走到仓库或粮堆 */
    m.residents.forEach(function(r){
      APH.Res.needsTick(r, false);
    });
    if(APH.Res.ensurePlayerNeeds) APH.Res.ensurePlayerNeeds(m);
    if(APH.Res.homeFoodTick && m.playerNeeds){
      m.playerNeeds.food = APH.Res.homeFoodTick(m.playerNeeds.food, s.scene);
    }
    if(APH.Res.playerRestTick && m.playerNeeds){
      /* #66 床边睡眠: 综合精力结算(睡眠恢复/清醒衰减, 委托 homeRestTick) */
      /* #70 医疗舱躺下: hasBed 含医疗舱 — 舱内躺卧按床速恢复(≠#67 地铺 18) */
      APH.Res.playerRestTick(m.playerNeeds, s.scene, !!s.nearBed || !!s.nearClinic);
    }
    if(APH.Res.homeIllnessTick && m.playerNeeds){
      m.playerNeeds.illness = APH.Res.homeIllnessTick(m.playerNeeds.illness, s.scene);
    }
    /* P1b 玩家暴露(#93): 极端天气室外累积(装备减免)/室内+房间消退; 远征不结算 */
    if(APH.Res.playerExposureTick && m.playerNeeds && s.scene==='home'){
      APH.Res.playerExposureTick(m.playerNeeds,
        APH.Res.shelteredFor({x:s.px, y:s.py}, s.colony.buildings, T9_rooms),
        wxExtreme, wxId);
    }
    /* D: 工作优先级调度(人×技能 0~3 表; 替代逐岗 autoAssign) */
    m.workPrio=m.workPrio||{};
    m.residents.forEach(function(r){
      if(!m.workPrio[r.id]) m.workPrio[r.id]=APH.Res.defaultPrio(r);
    });
    var hasQAssign=(s.colony.buildQueue||[]).length>0;
    var assign=APH.Colony.assignByPriority(m.residents, s.colony.buildings,
                                           m.workPrio, hasQAssign);
    m.residents.forEach(function(r){
      if(r.jobLocked) return;
      var nj=(assign[r.id]!==undefined)?assign[r.id]:null;
      if(r.job!==nj){
        r.job=nj;
        if(nj) APH.UI.floatText(r.name+' 开始在'+APH.Colony.get(nj).name+'工作','#8fd4ff');
      }
    });
    /* T7: 医疗舱需通电 (powered===false 停诊; 未激活默认通电) */
    var hasClinic=(s.colony.buildings||[]).some(function(b){
      return b.id==='bl_clinic' && APH.Colony.clinicPowered(b);
    });
    var medicSkill=0;
    m.residents.forEach(function(r){
      if(APH.Res.isBroken && APH.Res.isBroken(r)) return;    // 崩溃的医生缺勤
      if(r.job==='bl_clinic') medicSkill=Math.max(medicSkill, (r.skills&&r.skills.sk_social)||0);
    });
    var tickSeed=((s.seed||7)*1009 + Math.floor(s.clock||0)*17 + (m.residentSeq||0)*13)>>>0;
    var sickRng=U.makeRng(tickSeed);
    var clinicR=(CFG.residents&&CFG.residents.clinicNearR!=null)?CFG.residents.clinicNearR:80;
    m.residents.forEach(function(r){
      var ent=null;
      s.entities.forEach(function(e){
        if(e.type===T.RESIDENT && (e.rid===r.id||e.id===r.id)) ent=e;
      });
      var inClinic=false;
      if(hasClinic && ent){
        (s.colony.buildings||[]).forEach(function(b){
          if(b.id==='bl_clinic' && U.dst(ent.x,ent.y,b.x,b.y)<clinicR) inClinic=true;
        });
      }
      APH.Res.clinicTick(r, {hasClinic:hasClinic, inClinic:inClinic, medicSkill:medicSkill, rng:sickRng});
      /* W3 天气暴露接线(本票核心): 极端天气室外累积/房间内免疫 (Survival #19 桩复活; T9 房间覆盖)
         sheltered: 房间内=true; 房间外回退 isSheltered(建筑半径); 实体缺位兜底按室内(不误积累) */
      APH.Res.exposureTick(r,
        ent ? APH.Res.shelteredFor({x:ent.x, y:ent.y}, s.colony.buildings, T9_rooms) : true,
        wxExtreme, wxId);
      /* T9 卧室级房间心情增益: 所在房间含居住舱 → +roomMoodGain/跳 */
      if(ent){
        var rmGain=APH.Res.roomMoodGain({x:ent.x,y:ent.y}, T9_rooms, s.colony.buildings);
        if(rmGain>0) r.mood=Math.min((CFG.residents&&CFG.residents.moodCap)||95, (r.mood||70)+rmGain);
      }
      /* #69 医疗舱被拆: 躺舱者起身 (病情回落起身由 needsTick wake gate 负责) */
      if(r.medLying && !hasClinic) r.medLying = false;
      /* #69 击倒判定+送医(接线孤儿 checkDowned/rescueTick; 生产跳=30s) */
      if(!r.downed && APH.Res.checkDowned(r)){
        APH.UI.floatText(r.name+' 倒下了!','#ff9a9a');
      }
      if(r.downed){
        var rr=APH.Res.rescueTick([r], s.colony.buildings, 30, hasClinic && haveStock('med')>0, {inClinic:inClinic});
        if(rr.medUsed){
          APH.Colony.takeStock(m.res, s.entities, 'med', 1);
          APH.UI.floatText(r.name+' 被紧急救治','#7dffab');
        }
        if(rr.dead.length){
          APH.UI.floatText('☠ '+r.name+' 救治不及时, 去世了','#ff9a9a');
          m.residents=m.residents.filter(function(x){ return x.id!==r.id; });
          saveMetaQuiet();                       /* syncResidentEntities 下一帧移除实体 */
        }
      }
    });
    /* B: 心情崩溃状态机(seeded) + 崩溃行为落地 */
    var breakRng=U.makeRng((tickSeed^0x5EED2B)>>>0);
    var CB=CFG.residents||{};
    m.residents.forEach(function(r){
      var b=APH.Res.breakTick(r, breakRng);
      if(b.started){
        APH.UI.floatText('💢 '+r.name+' 崩溃了: '+APH.Res.BREAK_NAMES[b.started],'#ff9a9a');
        if(b.started==='brawl'){
          var mate=APH.Res.lowestBondMate(r, m.residents, m.bonds||{});
          if(mate){
            var ill=CB.brawlIll!=null?CB.brawlIll:8;
            APH.Res.hurtResident(mate, ill, 'wound', {mood: CB.brawlMoodHit!=null?CB.brawlMoodHit:15});
            APH.Res.hurtResident(r, ill, 'wound', {mood: false});
            m.bonds=APH.Res.applyBond(m.bonds||{}, r.id, mate.id,
              -(CB.brawlBondHit!=null?CB.brawlBondHit:8));
            APH.UI.floatText('⚡ '+r.name+' 和 '+mate.name+' 打了一架','#ff9a9a');
          }
        }else if(b.started==='tantrum'){
          var hit=CB.tantrumMoodHit!=null?CB.tantrumMoodHit:5;
          var tR=CB.tantrumR!=null?CB.tantrumR:140;
          var meE=null;
          s.entities.forEach(function(e){
            if(e.type===T.RESIDENT && (e.rid===r.id||e.id===r.id)) meE=e;
          });
          m.residents.forEach(function(o){
            if(o===r || !meE) return;
            var oe=null;
            s.entities.forEach(function(e){
              if(e.type===T.RESIDENT && (e.rid===o.id||e.id===o.id)) oe=e;
            });
            if(oe && U.dst(meE.x,meE.y,oe.x,oe.y)<=tR)
              o.mood=Math.max(0,(o.mood||0)-hit);
          });
        }else if(b.started==='binge'){
          if(APH.Colony.takeStock(m.res, s.entities, 'food', 1).ok){
            r.food=Math.min(100,(r.food||0)+((CB.eatGain!=null)?CB.eatGain:25));
            APH.UI.floatText('🍲 '+r.name+' 暴食了一顿','#ffc857');
          }
        }
      }else if(b.ended){
        APH.UI.floatText(r.name+' 平静下来了','#8fd4ff');
      }
    });
    /* 崩溃者本跳不参与任何生产 */
    var workers=m.residents.filter(function(r){ return !APH.Res.isBroken(r); });
    if(hasClinic && haveStock('med')>0){
      var sickest=null, bestScore=-1;
      m.residents.forEach(function(r){
        if((r.illness||0)<=0) return;
        if(r.downed) return;                       /* #69: 击倒者由 rescueTick 用薬, 不双扣 */
        /* F: 疫病患者优先用药(药是唯一根治手段) */
        var plagued=(r.ailments||[]).some(function(a){ return a.type==='plague'; });
        var score=(r.illness||0)+(plagued?1000:0);
        if(score>bestScore){ bestScore=score; sickest=r; }
      });
      if(sickest){
        APH.Res.applyMed(sickest);
        APH.Colony.takeStock(m.res, s.entities, 'med', 1);
        APH.UI.floatText((sickest.name||'居民')+' 用药','#7dffab');
      }
    }

    /* U3/U5 农场/种植槽与岗位产出 (异星奇幻作物) */
    var farmers=workers.filter(function(r){return r.job==='bl_farm'||r.job==='bl_crop_plot';});
    var ranchers=workers.filter(function(r){return r.job==='bl_pasture';});
    var farms=s.colony.buildings.filter(function(b){return b.id==='bl_farm'||b.id==='bl_crop_plot';});
    var nightF=window.APH.World&&APH.World.daylight?APH.World.daylight()<.5:false;
    var lawFarm=APH.Colony.harvestMods(s.spec&&s.spec.laws, s.clock, nightF).farmMul;
    var farmWx=(wxFx.farmMul!=null)?wxFx.farmMul:1;   // W3: 天气农产乘子(雨+30%/酸雨×0.5/雪停滞) 乘入 harvestMods 链
    farms.forEach(function(b){
      if(!b.plot) b.plot={stage:0,t:0};
      if(!b.crop){
        if(b.id==='bl_crop_plot') return;
        b.crop='crop_glow_shroom';
      }
      if(APH.Colony.ALIEN_CROPS[b.crop] && !APH.Colony.canPlantCrop(b.crop, m.analyzedFlora)) return;
      var bestFarmer=farmers.reduce(function(acc,r){
        return (acc===null||(r.skills.sk_farm>(acc.skills.sk_farm||0)))?r:acc;
      },null);
      var farmMul=((s.meta.tech&&s.meta.tech.te_radar)||0)*0.15;
      var farmEff=bestFarmer?APH.Res.efficiency(bestFarmer):1;
      var farmSk=bestFarmer?(bestFarmer.skills.sk_farm||0):0;
      /* T7: 无电农场减产 (powered===false 时×0.5; 未激活默认通电) */
      var powMul=APH.Colony.farmPowerMul(b.powered);
      b.plot=APH.Colony.cropPlotTick(b.plot, farmSk, farmEff, lawFarm*farmWx*powMul, b.crop);
      if((b.plot.stage||0) >= 3){
        var h=APH.Colony.harvestAlienCrop(b.crop, farmSk);
        if(h.dropItemId && h.dropCount>0){
          APH.Combat.spawnDrop(b.x+14, b.y+18, h.dropItemId, h.dropCount, {stock:true});
          if(h.extraItemId && h.extraCount>0){
            APH.Combat.spawnDrop(b.x-10, b.y+18, h.extraItemId, h.extraCount, {stock:true});
          }
          var itName=(CFG.items[h.dropItemId]&&CFG.items[h.dropItemId].name)?CFG.items[h.dropItemId].name:h.dropItemId;
          APH.UI.floatText('🌾 收获 '+itName+' +'+h.dropCount, '#c8e89a');
        }
        b.plot={stage:0,t:0};
      }
    });
    /* U6 畜牧: 羊群自然增长, 产肉/皮(纯函数 ranchTick, 每牧场一调) */
    var pastures=s.colony.buildings.filter(function(b){return b.id==='bl_pasture';});
    var bestRancher=ranchers.reduce(function(acc,r){
      return (acc===null||(r.skills.sk_ranch>(acc.skills.sk_ranch||0)))?r:acc;
    },null);
    var rSk=bestRancher?(bestRancher.skills.sk_ranch||0):0;
    var ranchEff=bestRancher?APH.Res.efficiency(bestRancher):1;
    var ranchRng=U.makeRng(((s.seed||7)*2017 + Math.floor(s.clock||0)*31 + pastures.length)>>>0);
    pastures.forEach(function(b){
      if(b.herd===undefined) b.herd=1;           // 新牧场自带1只
      var out=APH.Colony.ranchTick(b, rSk, m.res, ranchRng, ranchEff);
      if(out.foodGain>0)
        APH.Combat.spawnDrop(b.x+12, b.y+16, 'it_food', out.foodGain, {stock:true});
      if(out.leatherGain>0)
        APH.Combat.spawnDrop(b.x-10, b.y+18, 'it_leather', out.leatherGain, {stock:true});
      if(out.leatherGain>0)
        APH.UI.floatText('🐑 畜牧产出堆在地上 +'+out.foodGain+'肉 +'+out.leatherGain+'皮','#c8e89a');
      else if(out.foodGain>0)
        APH.UI.floatText('🐑 畜牧产出堆在地上 +'+out.foodGain+' 食物','#c8e89a');
    });

    var labs=s.colony.buildings.filter(function(b){return b.id==='bl_lab';});
    var scholars=workers.filter(function(r){return r.job==='bl_lab';});
    labs.forEach(function(b){
      var w=scholars.shift();
      if(!w) return;
      var target=b.analysisTarget || 'specimen_flora_glow';
      if(APH.Colony.ensureStock) APH.Colony.ensureStock(m.res, s.entities, target, 1);
      var loreSk=(w.skills&&w.skills.sk_lore)||0;
      var loreEff=APH.Res.efficiency(w);
      var labOut=APH.Colony.labAnalysisTick(b, loreSk, loreEff, m.res, 1);
      s.entities.forEach(function(e){
        if(e.type===T.BUILDING && e.bid==='bl_lab' &&
           Math.abs((e.x||0)-(b.x||0))<2 && Math.abs((e.y||0)-(b.y||0))<2){
          e.analysisTarget=b.analysisTarget;
          e.analysisProgress=b.analysisProgress;
        }
      });
      if(labOut && labOut.done){
        var yld=APH.Colony.applySpecimenAnalysis(m, m.res, labOut.def, labOut.specimenId);
        var seedIds=Object.keys(yld.seeds||{});
        for(var si=0;si<seedIds.length;si++){
          var sid=seedIds[si], sn=yld.seeds[sid]||0;
          if(sn>0) APH.Combat.spawnDrop(b.x+16, b.y+14, sid, sn, {stock:true});
        }
        var bits=[];
        if(yld.unlockCrop && APH.Colony.ALIEN_CROPS[yld.unlockCrop])
          bits.push('解锁 '+APH.Colony.ALIEN_CROPS[yld.unlockCrop].name);
        if(yld.unlockTech && APH.Colony.TECHS[yld.unlockTech]){
          bits.push(APH.Colony.TECHS[yld.unlockTech].name);
          applyTech(m, yld.unlockTech);
        }
        if(yld.eureka) bits.push('尤里卡 +'+yld.eureka);
        APH.UI.floatText('🔬 化验突破'+(bits.length?': '+bits.join(' / '):''), '#59d9ff');
      }
    });

    var shops=s.colony.buildings.filter(function(b){return b.id==='bl_workshop';});
    var crafters=workers.filter(function(r){return r.job==='bl_workshop';});
    shops.forEach(function(b){
      var w=crafters.shift();
      if(!w) return;
      var cEff=APH.Res.efficiency(w);
      var cSk=(w.skills&&w.skills.sk_craft)||0;
      if(b.recipe && APH.Colony.CRAFT_RECIPES[b.recipe]){
        var out=APH.Colony.workshopCraftTick(b, cSk, cEff, m.res, m.tech, 1);
        if(out.done && out.producedItemId){
          APH.Combat.spawnDrop(b.x+16, b.y+14, out.producedItemId, out.count||1, {stock:true});
          var pName=(CFG.items[out.producedItemId]&&CFG.items[out.producedItemId].name)||out.producedItemId;
          APH.UI.floatText('🛠 工坊制造完成: '+pName, '#7dffab');
        }
      }else{
        var cost=(CFG.workshop&&CFG.workshop.mineralCost!=null)?CFG.workshop.mineralCost:2;
        if(!APH.Colony.ensureStock(m.res, s.entities, 'mineral', cost)) return;
        var outLegacy=APH.Colony.workshopTick(w, m.res, b.lv||1);
        if(outLegacy.med>0){
          APH.Combat.spawnDrop(b.x+16, b.y+14, 'it_med', outLegacy.med, {stock:true});
          APH.UI.floatText('💊 工坊药品堆在地上 +'+outLegacy.med,'#e0b089');
        }
      }
    });

    /* 外星烹饪与餐饮生产流水线 (Cooking #49) */
    var kitchens=s.colony.buildings.filter(function(b){ return b.id==='bl_kitchen'||b.id==='bl_campfire'; });
    var chefs=workers.filter(function(r){ return r.job==='bl_kitchen'; });
    kitchens.forEach(function(b){
      var w = (b.id==='bl_kitchen') ? chefs.shift() : null;
      var cSk = w ? ((w.skills&&w.skills.sk_farm)||0) : 0;
      var cEff = w ? APH.Res.efficiency(w) : 1;
      var out = APH.Colony.cookingTick(b, cSk, cEff, m.res, m.tech, 1);
      if(out && out.done && out.producedItemId){
        APH.Combat.spawnDrop(b.x+14, b.y+16, out.producedItemId, out.count||1, {stock:true});
        var pName = (CFG.items[out.producedItemId]&&CFG.items[out.producedItemId].name)||out.producedItemId;
        APH.UI.floatText('🍲 烹饪完成: '+pName, '#ffca28');
      }
    });

    /* 篝火身心光环与围炉社交结算 (Cooking #49) */
    var campfires=s.colony.buildings.filter(function(b){ return b.id==='bl_campfire'; });
    if(campfires.length > 0 && APH.Res.campfireAuraTick){
      var fireRes = APH.Res.campfireAuraTick(m.residents, campfires, { meta: m });
      if(fireRes && fireRes.gatheredCount > 0){
        APH.UI.floatText('🔥 居民们在篝火旁围炉夜话 (+羁绊 +心情)', '#ffc857');
      }
    }
    s.entities=s.entities.filter(function(e){
      return !(e.type===T.DROPPED && (e.dead || (e.n||0)<=0));
    });

    /* V1 全局专长加成 */
    var gb=APH.Res.globalBonuses(m.residents);
    if(gb.lorePerTick>0){
      m.research+=Math.round(gb.lorePerTick);
    }
    if(gb.moodBoost>0){
      m.residents.forEach(function(r){ r.mood=Math.min(100,r.mood+gb.moodBoost); });
    }
    /* V3 随机社交事件(有≥2居民时; seeded, ADR-5) */
    var socialRng=U.makeRng((tickSeed^0xA5A5A5A5)>>>0);
    if(m.residents.length>=2 && socialRng()<0.4){
      var ia=Math.floor(socialRng()*m.residents.length);
      var ib=(ia+1+Math.floor(socialRng()*(m.residents.length-1)))%m.residents.length;
      var ra=m.residents[ia], rb=m.residents[ib];
      var positive = socialRng()<0.6;
      if(!positive && (ra.trait==='暴脾气'||rb.trait==='暴脾气')) positive=false;
      else if(ra.mood<35||rb.mood<35) positive=socialRng()<0.3;   // 低心情易冲突
      if(positive){
        m.bonds=APH.Res.applyBond(m.bonds||{},ra.id,rb.id,+4);
        ra.mood=Math.min(100,ra.mood+2); rb.mood=Math.min(100,rb.mood+2);
        APH.UI.floatText('💬 '+ra.name+' 和 '+rb.name+' 在食堂聊得很开心','#8fd4ff');
      }else{
        m.bonds=APH.Res.applyBond(m.bonds||{},ra.id,rb.id,-5);
        ra.mood=Math.max(0,ra.mood-2); rb.mood=Math.max(0,rb.mood-2);
        APH.UI.floatText('⚡ '+ra.name+' 和 '+rb.name+' 吵了一架','#ff9a9a');
      }
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
    saveColony();
    /* 过客拜访: 第一夜闸门后再刷 */
    tryFirstNightVisitor();
    refreshTechMapIfOpen();
  }
  function saveMetaQuiet(){ try{ APH.Save.saveMeta(APH.state.meta); }catch(e){} }
  function bindBuildUI(){
    var btn=document.getElementById('buildBtn');
    if(!btn) return;
    btn.addEventListener('click',function(){ toggleBuildRow(); });
  }
  /* (D) 旧 autoAssign 已被 Colony.assignByPriority 取代 */
  
  
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
      /* #72 家园击倒: 昏迷中调试 E 一律忽略(镜像真实 E, 无 E 唤醒) */
      if(playerDowned()) return;
      /* #66 床边睡眠: 镜像真实 E 键逻辑(先醒后睡, 绝不自动寻路) */
      if(playerSleeping()){
        APH.Res.playerWake(s.meta.playerNeeds);
        syncPlayerSleep();
      }else if(s.scene==='home' && s.nearBed){
        APH.Res.setPlayerSleeping(s.meta.playerNeeds, true, true);
        syncPlayerSleep();
        if(window.APH.Opening && APH.Opening.noteSleptInHouse){
          APH.Opening.noteSleptInHouse(firstNightOpening());
          tryFirstNightVisitor();
          applyFirstNightHint();
        }
      }else if(s.scene==='home' && s.nearClinic && playerSick()){
        /* #70 医疗舱躺下: 生病玩家靠舱 E 躺入(bed_med), 绝不落入自动寻路分支 */
        APH.Res.setPlayerSleeping(s.meta.playerNeeds, true, true, 'bed_med');
        syncPlayerSleep();
      }else if(s.scene==='home' && s.nearFood){
        /* #65 走到粮边吃: 靠粮按 E 吃一口(内部自拦「不饿/没粮」) */
        tryPlayerEatNearFood();
      }else if(s.scene==='home'&&s.nearPad) launchExpedition();
      else if(s.scene==='expedition'&&s.nearPad) returnHome();
      document.title='DBG E@'+s.scene+' nearPad='+s.nearPad;
    },
    guardTrim:guardTrim,
    applyTech:applyTech,
    loadRivals:loadRivals,
    saveRivals:saveRivals,
    saveMetaQuiet:saveMetaQuiet,
    saveColony:saveColony,
    playerDefPower:playerDefPower,
    haveStock:haveStock,
    toggleCodex:toggleCodex,
    toggleTechMap:toggleTechMap,
    renderTechMap:renderTechMap,
    tryBuySelectedTech:tryBuySelectedTech,
    renderCodex:renderCodex,
    renderResPanel:renderResPanel,
    residentsTick:residentsTick,
    syncResidents:syncResidentEntities,
    updateResidents:updateResidents,
    cycleSelectedJob:cycleSelectedJob,
    perfGuard:perfGuard,
    startRaid:startRaid,
    storyTick:storyTick,
    applyEvent:applyEvent,
    launchRivalRaid:launchRivalRaid,
    toggleTradePanel:toggleTradePanel,
    doTradeRow:doTradeRow,
    toggleDiplomacy:toggleDiplomacy,
    renderDiplomacy:renderDiplomacy,
    doSendTribute:doSendTribute,
    doSignTradePact:doSignTradePact,
    doDeterRival:doDeterRival,
    updateHome:updateHome,
    updateSurvival:updateSurvival,
    returnHome:returnHome,
    spawnVisitor:spawnVisitor,
    debugSpawnVisitor:function(at, over){
      var s=APH.state;
      return spawnVisitor(at||{x:s.px,y:s.py}, over);
    },
    debugRecruit:function(){
      var s=APH.state;
      var v=s.nearVisitor;
      if(!v || v.dead || v.type!==T.VISITOR) v=nearestVisitor(s);
      if(!v){
        for(var i=0;i<s.entities.length;i++){
          if(s.entities[i].type===T.VISITOR && !s.entities[i].dead){ v=s.entities[i]; break; }
        }
      }
      return tryRecruit(v, function(){ return 0; });
    },
    debugOfferMeal:function(){
      var s=APH.state;
      var v=s.nearVisitor;
      if(!v || v.dead || v.type!==T.VISITOR) v=nearestVisitor(s);
      if(!v){
        for(var i=0;i<s.entities.length;i++){
          if(s.entities[i].type===T.VISITOR && !s.entities[i].dead){ v=s.entities[i]; break; }
        }
      }
      return tryOfferMeal(v);
    },
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
