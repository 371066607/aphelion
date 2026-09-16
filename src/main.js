/* ============================================================
   Aphelion · main.js — 全局状态 / 输入 / 游戏循环 / 启动
   挂载: window.APH.state · APH.Main
   加载顺序(ADR-7, build.py 声明): config→utils→save→planet→world
                                  →entities→ui→main
   ============================================================ */
window.APH = window.APH || {};

(function(){
  'use strict';
  /* #186: isolated, memory-only prototype. This gate precedes every game side effect. */
  if (typeof location !== 'undefined' && /(?:^|[?&])prototype=building-v4(?:&|$)/.test(location.search || '')) {
    APH.BuildPrototype.boot();
    return;
  }
  var U=APH.U, CFG=APH.CFG, T=CFG.entType;
  var handleContextMenu = function(){ return false; };
  /* 真实可视区域(canvas实际显示尺寸), 预览面板缩放/分栏安全 */
  function vpW(){ var v=APH.World.getViewport(); return (v&&v.w)||innerWidth; }
  function vpH(){ var v=APH.World.getViewport(); return (v&&v.h)||innerHeight; }

  function pointerWorld(e){return APH.Camera.toWorld(APH.state,e.clientX,e.clientY,{w:vpW(),h:vpH()});}

  /* ================= 全局状态（唯一实例） ================= */
  APH.state = {
    mode:'intro',                // intro | running | dead | won
    scene:'home',                // home=殖民地(安全) | expedition=星球远征
    clock:0,
    paused:false,                // ADR-30 暂停模拟（镜头与规划仍可用）
    timeScale:1,                 // ADR-30 ×1/×2/×3 只乘模拟 dt
    spec:null,                   // 当前 PlanetSpec (ADR-1)
    px:0, py:0, vx:0, vy:0,
    face:-Math.PI/2, walkPh:0, moving:false, run:false,
    downed:false,                // #72 家园击倒: 运行时镜像(meta.playerNeeds.downed 真源)
    o2:100, hp:100, cry:0, found:0, totalBeacons:6,
    orderTool:null,              // ADR-28 规划工具模式 (chop|mine|haul|deconstruct|cancel)
    /* ADR-43 拖拽框选状态: 原先是 main 的模块级 var, 绘制层搬出去之后就读不到了
       (每帧 ReferenceError)。它本来就是输入与绘制共享的状态, 归 APH.state。 */
    orderDrag:false, orderFrom:null, orderTo:null,
    pawnDrag:false, pawnDragStart:null, pawnDragEnd:null,
    designations:{},             // ADR-28 规划标记字典 { [entityId]: { type, entityId } }
    selectedPawns:[],            // ADR-29 多选小人编队列表
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
  var savingWorlds=false;
  function homeRoster(meta){return (meta.residents||[]).filter(function(r){return !r.worldId||r.worldId==='home';});}
  function rememberActive(s){
    if(!s.worlds)return;
    s.worlds[s.scene]=APH.WorldRuntime.capture(s);
  }
  function checkpointWorlds(s){
    if(savingWorlds||!s.worlds)return false;
    savingWorlds=true;
    try{
      rememberActive(s);
      var home=s.worlds.home, exp=s.worlds.expedition, run=APH.ExpeditionState.active(s.colony);
      if(!home)return false;
      home.clock=s.clock;home.meta=s.meta;home.colony=s.colony;
      if(run&&exp){exp.clock=s.clock;run.cargo=Object.assign({},exp.carry||{});run.runtime=APH.WorldRuntime.serializable(exp);}
      s.colony.homeRuntime=APH.WorldRuntime.serializable(home);
      s.colony.activeWorld=run?s.scene:'home';
      return APH.WorldRuntime.run(home,function(){return APH.Colony.persist();});
    }finally{savingWorlds=false;}
  }
  /* 发射阶段会同时改名册、实体、物流和双世界引用。这里按对象图克隆，
     保留 selectedPawns/entity、worlds.home/active 等别名关系和精确字段；
     DOM/图片等非普通宿主对象保持引用，配置 def 也保持共享身份。 */
  function cloneLaunchGraph(value,seen,copies){
    if(value==null||typeof value!=='object')return value;
    var proto=Object.getPrototypeOf(value);
    if(proto!==Object.prototype&&proto!==Array.prototype&&proto!==null)return value;
    seen=seen||[];copies=copies||[];
    var found=seen.indexOf(value);if(found>=0)return copies[found];
    var out=Array.isArray(value)?[]:(proto===null?Object.create(null):{});
    seen.push(value);copies.push(out);
    Object.keys(value).forEach(function(key){out[key]=key==='def'?value[key]:cloneLaunchGraph(value[key],seen,copies);});
    return out;
  }
  function captureLaunchState(s){return {state:cloneLaunchGraph(s)};}
  function restoreLaunchState(s,snapshot){
    var seen=[snapshot],copies=[s];
    Object.keys(s).forEach(function(key){delete s[key];});
    Object.keys(snapshot).forEach(function(key){s[key]=key==='def'?snapshot[key]:cloneLaunchGraph(snapshot[key],seen,copies);});
  }
  function rollbackLaunch(s,before,persisted){
    var diskOk=true;
    if(persisted&&typeof persisted.rollback==='function')diskOk=persisted.rollback()!==false;
    restoreLaunchState(s,before.state);
    return diskOk;
  }
  function expeditionTitle(spec){
    var title=(spec&&spec.name)||'未知星球';
    if(spec&&spec.paletteName)title+=' · '+spec.paletteName;
    return title+' (远征)';
  }
  function switchWorld(kind){
    var s=APH.state;
    if(!s.worlds||!s.worlds[kind])return false;
    if(kind==='expedition'&&!APH.ExpeditionState.active(s.colony))return false;
    rememberActive(s);
    APH.WorldRuntime.install(s,s.worlds[kind]);
    s._background=false;s.selectedRid=null;s.selectedPawns=[];s.selectedTarget=null;
    APH.World.buildTerrain();
    document.getElementById('planetTitle').textContent=kind==='home'?'新曙光殖民地 · 家园':expeditionTitle(s.spec);
    checkpointWorlds(s);
    return true;
  }
  function pruneLegacyHomeNature(s){
    var scene=s&&s.colony&&s.colony.scene;
    if(!scene||scene.generation!==1||!window.APH.TerrainModel||!APH.TerrainModel.hasObservation(scene))return 0;
    var before=(s.entities||[]).length;
    s.entities=(s.entities||[]).filter(function(e){return e&&e.type!==T.ROCK&&e.type!==T.CRYSTAL;});
    return before-s.entities.length;
  }
  function sameObservation(a,b){
    if(!a||!b||!APH.TerrainModel.hasObservation({observation:a})||!APH.TerrainModel.hasObservation({observation:b}))return false;
    try{return JSON.stringify(a)===JSON.stringify(b);}catch(e){return false;}
  }
  function descriptorForPlanet(spec){
    var observed=spec&&spec.observation&&APH.TerrainModel.hasObservation(APH.TerrainModel.planet(spec));
    return observed?APH.TerrainModel.planet(spec):APH.TerrainModel.legacy(spec&&spec.seed,'expedition');
  }
  function validExpeditionRuntime(run){
    var runtime=run&&run.runtime,destination=APH.ExpeditionState.validateDestination(run&&run.destination),stored=null;
    if(!destination.ok||!destination.resolved)return false;
    try{stored=APH.Save.loadPlanet(destination.destination.planetId);}catch(e){return false;}
    var descriptor=runtime&&runtime.worldDescriptor,expected=stored&&descriptorForPlanet(stored),storedValid=null;
    try{storedValid=stored&&APH.Planet.validate(stored);}catch(e){return false;}
    var regenPeriod=Number(CFG.time&&CFG.time.prodTick)||30;
    var hasRegen=runtime&&Object.prototype.hasOwnProperty.call(runtime,'expeditionRegenT');
    var regenValid=!hasRegen||(typeof runtime.expeditionRegenT==='number'&&isFinite(runtime.expeditionRegenT)&&
      runtime.expeditionRegenT>=0&&runtime.expeditionRegenT<regenPeriod);
    var valid=!!(runtime&&runtime.scene==='expedition'&&regenValid&&
      Array.isArray(runtime.entities)&&storedValid&&storedValid.ok&&
      stored.id===destination.destination.planetId&&stored.seed===destination.destination.seed&&
      runtime.spec&&runtime.spec.id===stored.id&&runtime.spec.seed===stored.seed&&
      descriptor&&descriptor.kind==='expedition'&&descriptor.seed===stored.seed&&descriptor.grid===expected.grid);
    if(valid&&stored.observation)valid=descriptor.generation===1&&hasRegen&&Array.isArray(runtime.overlayFailures)&&
      sameObservation(runtime.spec.observation,stored.observation)&&sameObservation(descriptor.observation,stored.observation);
    else if(valid)valid=descriptor.generation===0&&!runtime.spec.observation&&!descriptor.observation&&
      descriptor.width===expected.width&&descriptor.height===expected.height;
    if(!valid)return false;
    /* PlanetSpec/Observation 的持久档是事实源。runtime 只保存局内实体和进度，
       恢复时丢弃其中可能残缺或陈旧的 spec 镜像，避免装入“同 ID 的另一张图”。 */
    runtime.spec=stored;
    runtime.worldDescriptor=expected;
    if(!hasRegen)runtime.expeditionRegenT=0;
    return true;
  }
  function restoreWorldSession(s){
    var saved=s.colony.homeRuntime,prunedLegacyNature=0;
    if(saved){var home=APH.WorldRuntime.restore(saved,s);APH.WorldRuntime.install(s,home);s.scene='home';s._worldReady=true;prunedLegacyNature=pruneLegacyHomeNature(s);}
    s.worlds={home:APH.WorldRuntime.capture(s),expedition:null};
    var restoredRun=APH.ExpeditionState.restore(s.meta,s.colony,APH.ExpeditionState.snapshot(s.colony));
    var run=restoredRun.run;
    var validRuntime=validExpeditionRuntime(run);
    var recovered=null;
    if(run&&!validRuntime){
      recovered=APH.ExpeditionState.returnHome(s.meta,s.colony,run.id,{x:CFG.HAB.x,y:CFG.HAB.y+140});
      if(recovered.ok){s.colony.activeWorld='home';run=null;}
    }
    syncResidentEntities();
    var recoveryReport=null,recoveryChanged=false;
    if(APH.Recovery){
      recoveryReport=APH.Recovery.reconcile(s);
      (recoveryReport.errors||[]).forEach(function(issue){
        var q=issue.q;
        if(!q)return;
        var cancelled=q.taskId&&APH.Logistics?APH.Logistics.cancelTask(s.colony,q.taskId):{drops:[]};
        s.colony.pendingGround=(s.colony.pendingGround||[]).concat(cancelled.drops||[]);
        APH.Recovery.cancel(s,q);
        s.colony.buildQueue=(s.colony.buildQueue||[]).filter(function(item){return item!==q;});
        s.entities=(s.entities||[]).filter(function(e){return !(e&&e.type===T.BLUEPRINT&&e.uid===q.uid);});
        recoveryChanged=true;
      });
      if(recoveryChanged)recoveryReport=APH.Recovery.reconcile(s);
    }
    if(APH.Logistics){var logistics=APH.Logistics.restore(s.colony,s.meta.res,s.entities);(logistics.drops||[]).forEach(function(p){APH.Combat.spawnDrop(p.x,p.y,p.itemId,p.n,{stock:true,jitter:0});});}
    flushConstructionSurplus(s);
    if(prunedLegacyNature)APH.Colony.persist();
    if(recoveryChanged)APH.Colony.persist();
    if(recovered&&recovered.ok)APH.Colony.persist();
    if(run){
      s.worlds.expedition=APH.WorldRuntime.restore(run.runtime,s);
      s.worlds.expedition.scene='expedition';s.worlds.expedition.carry=run.cargo||{};
      if(s.colony.activeWorld==='expedition')switchWorld('expedition');
    }
    return {run:run,recovered:recovered,recovery:recoveryReport};
  }
  U.on('beforeColonySnapshot',function(s){if(s.worlds&&!savingWorlds){rememberActive(s);var run=APH.ExpeditionState.active(s.colony),exp=s.worlds.expedition;if(run&&exp){run.cargo=Object.assign({},exp.carry||{});run.runtime=APH.WorldRuntime.serializable(exp);}s.colony.homeRuntime=APH.WorldRuntime.serializable(s.scene==='home'?s:s.worlds.home);}});
  U.on('metaWillSave',function(){var s=APH.state;if(s.worlds)checkpointWorlds(s);});

  function flushConstructionSurplus(s){
    var pending=s.colony.pendingGround||[];
    if(!pending.length)return;
    pending.forEach(function(p){APH.Combat.spawnDrop(p.x,p.y,p.itemId,p.n,{stock:true,jitter:0});});
    s.colony.pendingGround=[];
    APH.Colony.persist();
  }
  function enterHome(){
    var s = APH.state;
    s.scene='home';
    APH.Colony.buildColonyWorld(s.seed);
    if(s.colony.wildlife){s.entities=s.entities.concat(APH.WorldRuntime.restore({entities:s.colony.wildlife},s).entities);}
    else if(!s.colony.ecologySeeded&&APH.Ecology)APH.Ecology.seed(s);
    s.colony.ecologySeeded=true;
    APH.World.buildTerrain();
    syncResidentEntities();
    s._worldReady=true;
    if(s.colony.rulesVersion===1){APH.Res.assignBeds(s.colony.buildings,s.meta.residents,{modern:true});APH.HomeProgress.tick(s,0);}
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
  /* ADR-45: 远征队 —— 优先派已征召的殖民者; 一个都没征召就全员出动。
     返回名册里被派出去的人(不是实体), 空数组 = 派不出去。 */
  function expeditionSquad(){
    var s = APH.state;
    var roster = APH.ExpeditionState.eligibleMembers(s.meta);
    if(!roster.length) return [];
    var drafted = roster.filter(function(r){
      var e = (s.entities||[]).find(function(x){ return x && (x.rid===r.id||x.id===r.id); });
      return e && e.drafted;
    });
    return drafted.length ? drafted : roster;
  }

  function unknownPlanetSeed(meta, requested){
    if(typeof requested==='number'&&isFinite(requested)&&requested>=0&&requested<=0xffffffff&&Math.floor(requested)===requested)
      return requested>>>0;
    var seed=Date.now()>>>0;
    while((APH.Atlas&&APH.Atlas.has(meta,APH.Planet.idForSeed(seed)))||APH.Save.loadPlanet(APH.Planet.idForSeed(seed)))seed=(seed+1)>>>0;
    return seed;
  }

  function launchExpedition(options){
    var s = APH.state;
    if(s.scene==='expedition') return {ok:false,why:'队伍已在远征'};
    if(APH.ExpeditionState.active(s.colony)){switchWorld('expedition');return {ok:true};}
    options=options||{};
    var memberIds=Array.isArray(options.memberIds)?options.memberIds.slice():expeditionSquad().map(function(r){return r.id;});
    var requestedDestination=options.destination;
    var preflight=APH.ExpeditionState.validateSelection(s.meta,memberIds,options.supply||{food:0},
      options.objective||'resources',requestedDestination,s.colony,s);
    if(!preflight.ok){
      if(preflight.why==='empty-squad')APH.UI.floatText('✕ 没有可派出的殖民者 —— 先招人', '#ff9a9a');
      return preflight;
    }
    var before=captureLaunchState(s);
    var seed,planet,planetCheck,persisted,isNew=requestedDestination.kind==='unknown';
    if(isNew){
      /* 先完成不可逆的星球发现事实，再让 ExpeditionState 扣补给和转移名册。 */
      seed=unknownPlanetSeed(s.meta,requestedDestination.seed);
      planet=APH.Planet.newObservedPlanet(seed);planetCheck=APH.Planet.validate(planet);
      if(!planetCheck.ok)return {ok:false,why:'planet-generation-failed',errors:planetCheck.errors};
      persisted=APH.Save.savePlanetDiscovery(s.meta,planet,Date.now());
    }else{
      try{planet=APH.Save.loadPlanet(preflight.destination.planetId);}catch(e){planet=null;}
      if(!planet)return {ok:false,why:'missing-planet'};
      planetCheck=APH.Planet.validate(planet);
      if(!planetCheck.ok)return {ok:false,why:'invalid-planet',errors:planetCheck.errors};
      if(planet.id!==preflight.destination.planetId||planet.seed!==preflight.destination.seed)
        return {ok:false,why:'planet-conflict'};
      persisted=APH.Save.savePlanetVisit(s.meta,planet,Date.now());
    }
    if(!persisted.ok){
      APH.UI.floatText('✕ 星球档案未保存，远征没有出发','#ff9a9a');
      return persisted;
    }
    var resolvedDestination={kind:'planet',planetId:planet.id,seed:planet.seed};
    var begun,sh,loadW,capNow;
    function applySpec(p){
      s.spec=p; s.specSaved=true; s.seed=p.seed;s.meta.currentPlanet=p.id;
      s.worldDescriptor=descriptorForPlanet(p);
      s.totalBeacons=p.beacons.length;
      s.entities=[];
      spawnSquadEntities(CFG.HAB.x, CFG.HAB.y+70);
      var lead=s.entities.find(function(e){return e.type===T.RESIDENT;});
      if(lead){s.px=lead.x;s.py=lead.y;s.selectedRid=lead.rid;s.selectedPawns=s.entities.filter(function(e){return e.type===T.RESIDENT;});}
      s.camX=CFG.HAB.x; s.camY=CFG.HAB.y+70;
      var rng=U.makeRng(p.seed ^ 0x9E3779B9);
      var observedMap=APH.TerrainModel.hasObservation(s.worldDescriptor);
      if(observedMap){
        var observedResources=APH.TerrainModel.resources(s.worldDescriptor,{});
        if(observedResources.errors.length)throw new Error('invalid observed resources: '+JSON.stringify(observedResources.errors));
        observedResources.forEach(function(resource){if(!resource.depleted)s.entities.push(resource);});
      }else{
        var pr=0,gd=0;
        while(pr<CFG.caps.rocks && gd++<500){
          var rx=rng()*(APH.Scene.width()-120)+60, ry=rng()*(APH.Scene.height()-120)+60;
          if(U.dst(rx,ry,CFG.HAB.x,CFG.HAB.y)<140) continue;
          if(!APH.TerrainModel.cellAt(s.worldDescriptor,rx,ry).walkable)continue;
          if(p.beacons.some(function(b){return U.dst(rx,ry,b.x,b.y)<90;})) continue;
          s.entities.push(APH.Ent.makeRock(rx,ry,rng)); pr++;
        }
        var pc=0; gd=0;
        while(pc < Math.floor(CFG.caps.crystals*p.terrain.crystalDensity) && gd++<500){
          var cx=rng()*(APH.Scene.width()-140)+70, cy=rng()*(APH.Scene.height()-140)+70;
          if(U.dst(cx,cy,CFG.HAB.x,CFG.HAB.y)<150) continue;
          if(!APH.TerrainModel.cellAt(s.worldDescriptor,cx,cy).walkable)continue;
          s.entities.push(APH.Ent.makeCrystal(cx,cy)); pc++;
        }
      }
      p.beacons.forEach(function(d){ s.entities.push(APH.Ent.makeBeacon(d)); });
      s.spores=[];
      for(var i=0;i<CFG.caps.spores;i++)
        s.spores.push({x:rng()*APH.Scene.width(),y:rng()*APH.Scene.height(),ph:rng()*U.TAU,s:.5+rng()});
      s.o2=CFG.player.o2Max;                       // 出发时满氧
      s.found=0; s.cry=0; s.carry={};              // 远征状态清零
      s.runLoot=0;
      s.settledLoot=0;
      s.floraRespawn=[];
      s.expeditionRegenT=0;
      s.overlayFailures=[];
      s.landedAt=s.clock||0;
      s.clinicKit = s.colony.buildings.some(function(b){ return b.id==='bl_clinic'; }) ? 1 : 0;
      s.lastExpedition=p;                          // 袭击刷怪用, 不写回家园 spec
      s.spawnT=8;
      /* 着陆点的返回舱(发射台): 靠近按 E 返航 */
      s.entities.push({
        id:'be_pad', type:T.BUILDING, bid:'bl_landing_pad',
        x:CFG.HAB.x, y:CFG.HAB.y+70, def:APH.Colony.get('bl_landing_pad'), pad:true,
      });
      function installRuins(ruins){
        s.ruins = ruins;
        if(ruins){
          (ruins.walls || []).forEach(function(w, wi){
            s.entities.push({ id:'rw_' + wi, type: T.BUILDING, bid:'ancient_wall', x:w.x, y:w.y });
          });
          if(ruins.gate){
            s.entities.push({ id:'rg_0', type: T.BUILDING, bid:'ancient_gate', x:ruins.gate.x, y:ruins.gate.y, gate:ruins.gate });
          }
          if(ruins.terminal){
            s.entities.push({ id:'rt_0', type: T.BUILDING, bid:'ancient_terminal', x:ruins.terminal.x, y:ruins.terminal.y, terminal:ruins.terminal });
          }
          if(ruins.vault){
            s.entities.push({ id:'rv_0', type: T.BUILDING, bid:'ancient_vault', x:ruins.vault.x, y:ruins.vault.y, vault:ruins.vault });
          }
        }
      }
      if(observedMap){
        var overlays=APH.Planet.expeditionOverlays(p,begun.run.objective.kind);
        s.overlayFailures=overlays.failures;
        overlays.deposits.forEach(function(deposit){s.entities.push(deposit);});
        installRuins(overlays.ruins);
        if(overlays.rivalBase)s.entities.push(overlays.rivalBase);
        overlays.guards.forEach(function(guard){s.entities.push(APH.Ent.makeEnemy(guard.faction,guard.x,guard.y));});
      }else{
        /* generation 0 的旧远征保持原有布局与身份。 */
        if(APH.Planet && APH.Planet.generateExpeditionFlora){
          var expFlora = APH.Planet.generateExpeditionFlora(p.seed, p.tier||1);
          expFlora.forEach(function(f){ s.entities.push(f); });
        }
        if(APH.Planet.expeditionDeposits)APH.Planet.expeditionDeposits(p.seed,begun.run.objective.kind).forEach(function(ore){s.entities.push(ore);});
        installRuins(APH.Planet&&APH.Planet.generateAncientRuins?APH.Planet.generateAncientRuins(p,p.seed):null);
        if(p.rivals && p.rivals.length){
          var rv=p.rivals[Math.floor(Math.random()*p.rivals.length)];
          var ba=Math.random()*U.TAU;
          var bx=U.clamp(CFG.HAB.x+Math.cos(ba)*820, 100, APH.Scene.width()-100);
          var by=U.clamp(CFG.HAB.y+Math.sin(ba)*820, 100, APH.Scene.height()-100);
          s.entities.push({
            id:'rv_base_'+rv.id, type:T.BUILDING, bid:'bl_rival_base',
            x:bx, y:by, rivalId:rv.id, rivalName:rv.name,
            hp:60, maxHp:60, def:{ name:rv.name+' 基地', size:70 },
          });
          for(var gi=0; gi<3; gi++){
            var gf=p.enemies.factions[gi % p.enemies.factions.length];
            s.entities.push(APH.Ent.makeEnemy(gf,bx+(Math.random()*120-60),by+(Math.random()*90-45)));
          }
        }
      }
    }
    try{
      begun=APH.ExpeditionState.begin(s.meta,s.colony,memberIds,options.supply||{food:0},
        options.objective||'resources',resolvedDestination,s);
      if(!begun.ok){rollbackLaunch(s,before,persisted);return begun;}
      var squad=preflight.members;
      squad.forEach(function(r){var e=s.entities.find(function(x){return x.rid===r.id||x.id===r.id;});if(e&&e.haulCarry){(Array.isArray(e.haulCarry)?e.haulCarry:[e.haulCarry]).forEach(function(p){APH.Combat.spawnDrop(e.x,e.y,p.itemId,p.n,{stock:true,jitter:0});});e.haulCarry=null;}var released=APH.Logistics.releaseCarrier(s.colony,r.id,e);(released.drops||[]).forEach(function(p){APH.Combat.spawnDrop(p.x,p.y,p.itemId,p.n,{stock:true,jitter:0});});});
      delete s.squad;
      syncResidentEntities();
      if(s.meta.homePressure)s.meta.homePressure.residents=(s.meta.residents||[]).length;
      s.worlds={home:APH.WorldRuntime.capture(s),expedition:null};
      s.scene='expedition';s.worldDescriptor=descriptorForPlanet(planet);
      s.parts=[];s.scanning=null;s.target=null;s.selectedTarget=null;s.war={raidActive:false};s.designations={};s.prodT=0;s.squadNeedT=0;
      s.selectedRid=null;   /* ADR-29: 离开家园解除征召 (实体将重建) */
      sh=APH.Colony.shortageBrief(s.meta, s.colony.buildings, extraRes());
      loadW=APH.Combat.carryWeight(s.carry);capNow=APH.Colony.carryMaxOf(s.colony.buildings);
      applySpec(planet);
      s.worlds.expedition=APH.WorldRuntime.capture(s);
      if(!checkpointWorlds(s)){
        var diskOk=rollbackLaunch(s,before,persisted);
        APH.UI.floatText('✕ 远征状态未保存，队伍留在家园','#ff9a9a');
        return {ok:false,why:'persistence-failed',rollbackOk:diskOk};
      }
    }catch(error){
      var restored=rollbackLaunch(s,before,persisted);
      APH.UI.floatText('✕ 远征启动失败，队伍留在家园','#ff9a9a');
      return {ok:false,why:'launch-failed',rollbackOk:restored,error:error&&error.message};
    }
    closeColonyOverlays();
    APH.UI.floatText(sh.mission,'#ffc857');
    if(s.overlayFailures&&s.overlayFailures.length){
      APH.UI.floatText('⚠ 有 '+s.overlayFailures.length+' 处覆盖物没有合法落点，已安全跳过','#ffc857');
    }
    /* T9: 超重出发提醒(不阻止) */
    if(loadW > capNow*.7){
      APH.UI.floatText('⚠ 负重 '+loadW+'/'+capNow+
        ' — 星球上的晶体可以回氧，别浪费舱位','#ffc857');
    }
    APH.UI.setHint('已着陆 '+s.spec.name+'。'+sh.mission+' · 返航按 [E]');
    var lawBits=[];
    if(APH.Planet.hasLaw(s.spec,'lw_echo')) lawBits.push('声追者：少开枪');
    if(APH.Planet.hasLaw(s.spec,'lw_spore_light')) lawBits.push('孢子趋光：光会开路');
    if(APH.Planet.hasLaw(s.spec,'lw_night_acid')) lawBits.push('夜间勿近湖');
    if(lawBits.length) APH.UI.floatText('法则 · '+lawBits.join(' / '),'#c39bff');
    document.getElementById('planetTitle').textContent=expeditionTitle(planet);
    APH.World.buildTerrain();
    U.emit('launched',{});
    if(isNew&&APH.LLM.enabled())APH.LLM.enrichPlanet(planet).then(function(rich){
      var active=APH.ExpeditionState.active(s.colony);
      if(rich&&active&&active.destination&&active.destination.planetId===planet.id){
        rich.id=planet.id;rich.observation=planet.observation;
        var entry=APH.Atlas.find(s.meta,planet.id);
        checkpointWorlds(s);
        if(APH.Save.savePlanetDiscovery(s.meta,rich,entry&&entry.discoveredAt).ok){
          planet.name=rich.name||planet.name;planet.paletteName=rich.paletteName||planet.paletteName;
          planet.lore=rich.lore||planet.lore;
          if(s.spec&&s.spec.id===planet.id){
            s.spec.name=planet.name;s.spec.paletteName=planet.paletteName;s.spec.lore=planet.lore;
            if(s.scene==='expedition')document.getElementById('planetTitle').textContent=expeditionTitle(s.spec);
          }
        }
      }
    });
    return {ok:true,run:begun.run};
  }

  /* 返回殖民地(发射台交互) */
  /* ADR-46: 灯塔交互只推进扎根进度, 永不结束沙盒。 */
  function launchRescue(){
    var s=APH.state;
    if(s.mode!=='running'||s.scene!=='home')return false;
    var progress=APH.HomeProgress.tick(s,0);
    APH.UI.floatText(APH.HomeProgress.describe(progress).text,'#9fe8c8');
    APH.Save.saveMeta(s.meta);
    return !!progress.achieved;
  }

  function returnHome(){
    var s=APH.state;
    var activeRun=APH.ExpeditionState.active(s.colony);
    if(activeRun&&(!s.worlds||!s.worlds.home))return {ok:false,why:'家园运行状态尚未恢复'};
    if(activeRun&&s.worlds&&s.worlds.home){
      rememberActive(s);
      var exp=s.worlds.expedition;
      activeRun.cargo=Object.assign({},exp&&exp.carry||{});
      var result=APH.ExpeditionState.returnHome(s.meta,s.colony,activeRun.id,{x:CFG.HAB.x,y:CFG.HAB.y+140});
      if(!result.ok)return result;
      var home=s.worlds.home;home.meta=s.meta;home.colony=s.colony;
      APH.WorldRuntime.install(s,home);s.scene='home';s._background=false;s.worlds.expedition=null;
      syncResidentEntities();delete s.squad;s.carry={};s.target=null;s.scanning=null;s._expeditionReturn=false;
      s.colony.activeWorld='home';s.colony.homeRuntime=APH.WorldRuntime.serializable(s);
      APH.Colony.persist();flushConstructionSurplus(s);
      APH.World.buildTerrain();document.getElementById('planetTitle').textContent='新曙光殖民地 · 家园';
      U.emit('returnedHome',{beacons:exp&&exp.found||0});
      APH.UI.floatText(Object.keys(activeRun.cargo||{}).some(function(k){return activeRun.cargo[k]>0;})?'远征队已返航，回收物资卸在迫降舱旁。':'远征队空手而归，家园仍在等你。','#9fe8c8');
      return result;
    }
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

  /* ================= 扫描交互 ================= */
  var worldUiSerial=0;
  function worldUiRunId(s){
    if(!s||s.scene!=='expedition'||!s.colony||!APH.ExpeditionState||!APH.ExpeditionState.active)return '';
    var run=APH.ExpeditionState.active(s.colony);
    return run&&run.id||'';
  }
  function worldUiSession(s){
    var signature=(s&&s.scene||'')+'|'+worldUiRunId(s);
    if(s._worldUiSignature!==signature||!s._worldUiSession){
      s._worldUiSignature=signature;
      s._worldUiSession='world-ui-'+(++worldUiSerial);
    }
    return s._worldUiSession;
  }
  function worldUiVisible(s){return !!s&&!s._background;}
  function worldUiTicket(s){
    return worldUiVisible(s)?{session:worldUiSession(s),scene:s.scene,runId:worldUiRunId(s)}:null;
  }
  function worldUiTicketActive(ticket){
    var s=APH.state;
    return !!ticket&&worldUiVisible(s)&&s.scene===ticket.scene&&
      worldUiRunId(s)===ticket.runId&&worldUiSession(s)===ticket.session;
  }
  function performExpeditionInteraction(pawn, target){
    var s=APH.state,r=APH.Res.residentOf(pawn);
    if(!r||pawn.downed||target.dead||U.dst(pawn.x,pawn.y,target.x,target.y)>55)return false;
    if(target.type===T.BEACON){s.selectedRid=pawn.rid||pawn.id;s.scanning=target;s.scanT=0;return true;}
    if(target.bid==='ancient_vault'){
      var result=APH.Planet.openArtifactVault(target.vault||target);
      if(result&&result.drops)result.drops.forEach(function(d){APH.Combat.spawnDrop(target.x,target.y+20,d.id,d.n||1);});
    }else if(target.bid==='ancient_terminal'){
      var result=APH.Res.hackTerminal(target.terminal||target,r,s._hackRng||Math.random);
      if(result&&result.success)target.hacked=true;
      if(result&&worldUiVisible(s))APH.UI.floatText(result.text,result.success?'#9fe8c8':'#ff9a9a');
    }else if(target.bid==='ancient_gate')APH.Planet.damageAncientGate(target.gate||target,999);
    return true;
  }

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
        s.scanning=null; if(worldUiVisible(s))APH.UI.hideScanRing(); if(worldUiVisible(s))APH.UI.setHint('');
      }else{
        s.scanT += dt/2.2;
        if(worldUiVisible(s))APH.UI.setScanProgress(s.scanT);
        if(s.scanT>=1){
          sb.done=true; s.found++;
          APH.state.meta.stats.scans++; APH.Save.saveMeta(APH.state.meta);
          U.emit('beaconScanned', sb);           // ADR-8 解耦示例
          if(worldUiVisible(s))APH.UI.hideScanRing();
          if(worldUiVisible(s))APH.UI.showCard(sb.name, sb.lore);
          s.scanning=null; s.shake=.5;
          for(var k=0;k<16;k++) s.parts.push({t:'shard',x:sb.x,y:sb.y-52,
            vx:U.rr(-90,90),vy:U.rr(-110,-10),life:U.rr(.5,1),max:1,hue:45});
          if(worldUiVisible(s))APH.UI.setHint('已录入 '+s.found+'/'+s.totalBeacons);
          if(s.found>=s.totalBeacons){
            /* T3 Boss: 全信标录入惊醒星球守护者 */
            spawnGuardian(sb.x, sb.y);
          }
        }
      }
    }else{
      if(worldUiVisible(s))APH.UI.setActBtn(s.nearBeacon);
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
    if(worldUiVisible(s)){
      APH.UI.floatText('⚠ '+b.bossName+'苏醒了!','#ff9a4d');
      APH.UI.setHint('击败守护者才能带着完整档案离开');
    }
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
        if(APH.ExpeditionState && APH.ExpeditionState.noteGuardianCleared)
          APH.ExpeditionState.noteGuardianCleared(s);
        else s.guardianCleared=true;
        return;
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
    var x = U.clamp(s.px + Math.cos(a)*d, 40, APH.Scene.width()-40);
    var y = U.clamp(s.py + Math.sin(a)*d, 40, APH.Scene.height()-40);
    var spawnScene=APH.Scene.of(s),observed=spawnScene&&spawnScene.generation===1&&APH.TerrainModel.hasObservation(spawnScene);
    if(observed){if(!APH.TerrainModel.cellAt(spawnScene,x,y).walkable)return;}
    else if(U.dst(x,y,CFG.LAKE.x,CFG.LAKE.y) < s.spec.terrain.lakeR+20) return;
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
      if(worldUiVisible(s))APH.UI.setHint('返回舱 · 补给中 (氧气/生命)');
    }else{
      s.o2 -= dt*CFG.player.o2Drain;
      if(s.o2<25&&worldUiVisible(s)) APH.UI.setHint('⚠ 氧气 '+Math.max(0,Math.round(s.o2))+'% —— 回舱或采集粉色晶体！');
    }
    /* lw_night_acid: 夜间靠近湖岸腐蚀 */
    var night=APH.World.daylight()<.5;
    var hasAcid=APH.Planet.hasLaw(s.spec, 'lw_night_acid');
    if(night && hasAcid){
      var survivalScene=APH.Scene.of(s),observedTerrain=survivalScene&&survivalScene.generation===1&&APH.TerrainModel.hasObservation(survivalScene);
      var nearAcid=false;
      if(observedTerrain){
        var terrainCell=APH.TerrainModel.cellAt(survivalScene,s.px,s.py),g=survivalScene.grid||CFG.GRID;
        nearAcid=terrainCell.water||terrainCell.shore||[[g,0],[-g,0],[0,g],[0,-g]].some(function(offset){
          return APH.TerrainModel.cellAt(survivalScene,s.px+offset[0],s.py+offset[1]).water;
        });
      }else{
        var lakeR=(s.spec.terrain&&s.spec.terrain.lakeR)||CFG.LAKE.r;
        nearAcid=U.dst(s.px,s.py,CFG.LAKE.x,CFG.LAKE.y) < lakeR+24;
      }
      if(nearAcid){
        s.acidT=(s.acidT||0)+dt;
        if(s.acidT>=1){
          s.acidT=0;
          APH.Combat.hurtPlayer(4, '湖水酸化');
        }
      }else s.acidT=0;
    }
    if(s.o2<=0){
      s.mode='dead'; U.emit('gameOver',{});
      s.meta.stats.deaths++; APH.Save.saveMeta(s.meta);
      U.emit('death', {reason:'生命维持系统在荒原上停转了。', stats:{
        cry:s.cry, found:s.found, total:s.totalBeacons, carry:s.carry,
        runLoot:s.runLoot, survived:s.clock-(s.landedAt||0)}});
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
        if(worldUiVisible(s))APH.UI.floatText('+1 晶体 · 氧气 +8','#ff9ad0');
        for(var k=0;k<10;k++) s.parts.push({t:'shard',x:e.x,y:e.y,
          vx:U.rr(-70,70),vy:U.rr(-90,-20),life:U.rr(.4,.8),max:.8,hue:310});
        s.shake=Math.min(1,s.shake+.15);
      }
    });
  }

  /* ================= 相机 ================= */
  /* ================= 相机 (ADR-29 全局 RTS 上帝视角平移引擎) ================= */
  function centerCameraOn(x, y){
    var s = APH.state;
    s.camX=x;s.camY=y;APH.Camera.clamp(s,{w:vpW(),h:vpH()});
  }

  function updateCamera(dt){
    var s = APH.state;
    var panX = 0, panY = 0;
    if(s.keys.KeyW || s.keys.ArrowUp) panY -= 1;
    if(s.keys.KeyS || s.keys.ArrowDown) panY += 1;
    if(s.keys.KeyA || s.keys.ArrowLeft) panX -= 1;
    if(s.keys.KeyD || s.keys.ArrowRight) panX += 1;

    var C = (CFG.camera) || {};
    var baseSpd = C.panSpeed || 520;
    var mul = (s.keys.ShiftLeft || s.keys.ShiftRight) ? (C.shiftMul || 2.2) : 1;
    var spd = baseSpd * mul / APH.Camera.zoom(s);

    if(panX !== 0 || panY !== 0){
      var l = Math.sqrt(panX * panX + panY * panY) || 1;
      s.camX += (panX / l) * spd * dt;
      s.camY += (panY / l) * spd * dt;
      s.camFollow = false;
    } else if(s.camFollow && s.px != null){
      /* 双击小人或显式设置跟随 */
      s.camX = U.lerp(s.camX, s.px, 1 - Math.pow(0.001, dt));
      s.camY = U.lerp(s.camY, s.py, 1 - Math.pow(0.001, dt));
    }
    APH.Camera.clamp(s,{w:vpW(),h:vpH()});
    if(s.shake > 0) s.shake -= dt * 2.2;
  }

  /* ================= 粒子 ================= */
  /* 自愈居中(T11): 无论何种环境因素(DPR/iframe缩放)导致画面偏移,
     只要玩家偏离视口中心超过阈值, 相机立即硬对齐。
     ⚠ ADR-43 搬绘制层时发现: 全项目没有任何地方调用它 —— 它写完就没接上。
     没有删, 因为它是有意写的异常保护; 但它改的是相机(state), 不是绘制,
     所以放回相机段。要不要接进 updateCamera, 见 BACKLOG。 */
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
  /* ADR-41: 指挥官自身状态已归 APH.Res(playerNeeds 的归属地)。以下保留旧名转发。 */
  function playerSleeping(){ return APH.Res.playerSleeping(); }
  function playerDowned(){ return APH.Res.playerDowned(); }
  function playerSick(){ return APH.Res.playerSick(); }
  function playerFood(){ return APH.Res.playerFood(); }
  /* #65 走到粮边吃: E 吃一口(bindInput 与 debugPressE 共用, 避免双份逻辑)。
     只消费 s.nearFood 指向的粮堆/仓库, 绝不写 s.target 自动寻路。 */
  /* ADR-30 / #168: 指挥官是 id=player 的小人，决策走 thinkPawn。 */
  /* 采集作业的可见挥砍：面向目标、周期性木屑/石屑、树木震动 */
  /* ============================================================
     家园每帧: 感知 → 模拟 → 提示 → UI 同步 (ADR-32)
     以前这四件事挤在一个 300 行的 updateHome 里, 提示语的优先级
     靠「后一次 setHint 覆盖前一次」隐式决定 —— 谁在函数里写得靠后
     谁就赢, 读代码看不出来。现在拆开, 优先级写成一张显式的表。
     ============================================================ */

  /* 感知: 只把「附近有什么」写进 state, 不做决策、不发提示。 */
  /* ADR-45: 原先这里有一整套「玩家身边有什么」的探测(nearBed/nearFood/nearPad/
     nearVisitor/...), 为的是给化身弹 [E] 提示。没有化身之后它们全部失去意义 ——
     环世界里你不是走到床边按 E, 你是选中一个小人、右键那张床。
     只留下仍有别的用途的两个: 游商面板要知道商人在不在, 崩溃居民要能被安抚。 */
  function senseHome(){
    var s=APH.state;
    s.nearVisitor = nearestVisitor(s);
    var broken = null;
    (s.entities||[]).forEach(function(e){
      if(broken || !e || e.dead || e.type!==T.RESIDENT) return;
      var rp = APH.Res.residentOf(e);
      if(rp && APH.Res.isBroken && APH.Res.isBroken(rp)) broken = { entity:e, resident:rp };
    });
    s.nearBrokenResident = broken;
  }

  /* 模拟: 推进世界。返回提示层需要的环境量(诊所距离/天气播报等)。 */
  function ecologyStep(s,dt){
    var scene=s&&s.colony&&s.colony.scene;
    var observed=!!(scene&&scene.generation===1&&window.APH.TerrainModel&&APH.TerrainModel.hasObservation(scene));
    var grid=observed&&window.APH.Nav&&APH.Nav.gridOf?APH.Nav.gridOf(s.colony.buildings||[],scene):null;
    var wildHandled=!!(APH.Ecology&&APH.Ecology.tick(s,dt,grid));
    (s.entities||[]).forEach(function(e){
      if(e&&e.type==='animal'&&!e.dead&&(!e.wild||!wildHandled)&&APH.Res.wanderStep)
        APH.Res.wanderStep(e,dt,{x:e.x,y:e.y},70,null,null,grid);
    });
    return wildHandled;
  }
  function simHome(dt, context){
    var s=context||APH.state;
    if(!s._background)updateCamera(dt);

    if(s.scene === 'expedition' && s.ruins && !s.ruins.revealed){
      /* ADR-45: 以「有没有队员走到附近」判发现, 不再看化身位置 */
      var scout = (s.entities||[]).find(function(e){
        return e && !e.dead && e.type===T.RESIDENT && U.dst(e.x, e.y, s.ruins.cx, s.ruins.cy) < 140;
      });
      if(scout){
        s.ruins.revealed = true;
        s.shake = Math.min(1, s.shake + 0.35);
        if(worldUiVisible(s)&&window.APH.UI&&APH.UI.floatText) APH.UI.floatText('🏛️ 发现异星史前遗迹复合体！', '#ffd54f');
      }
    }
    updateVisitors(dt);
    /* C: 游商走了/离远了自动收面板 */
    var tpO=document.getElementById('tradePanel');
    if(!s._background && tpO && tpO.style.display!=='none' && !currentTrader()) toggleTradePanel(false);

    /* 家园: 氧气始终补; 生命只在靠近医疗舱时缓慢回 */
    var clinicB=null;
    (s.colony.buildings||[]).forEach(function(b){ if(b.id==='bl_clinic') clinicB=b; });
    var cDist=null;
    /* ADR-45: 「玩家击倒/送医/失血过多」整套随化身一起删。
       殖民者受伤倒地由 Res 的居民救援链路处理(rescueTick), 那条本来就存在。 */
    /* 天气播报(有副作用: 首次进入才浮字), 提示文本交给 hintForHome */
    var weatherHint=null;
    var quiet = !s.nearVisitor && !s.war.raidActive && !(s.war.raidWarn>0);
    if(quiet){
      var nightW=APH.World.daylight()<.5;
      var wx=APH.Colony.harvestMods(s.spec&&s.spec.laws, s.clock, nightW);
      if(wx.storm&&!s._stormOn&&worldUiVisible(s)) APH.UI.floatText('⚡ 磁暴来袭 · 实验室停摆','#c39bff');
      if(wx.acid&&!s._acidOn&&worldUiVisible(s)) APH.UI.floatText('🌧 酸雨 · 农田减半','#7dffab');
      s._stormOn=!!wx.storm; s._acidOn=!!wx.acid;
      if(wx.storm) weatherHint='⚡ 磁暴 · 实验室停摆';
      else if(wx.acid) weatherHint='🌧 酸雨 · 农田减半';
    }

    /* 居民活动循环与建造推进 (委托 APH.Colony, ADR-21) */
    updateResidents(dt);
    ecologyStep(s,dt);
    if(APH.Colony && APH.Colony.tickConstruction){APH.Colony.tickConstruction(s, dt);flushConstructionSurplus(s);}
    /* 30s 生产时钟周期 (委托 APH.Colony, ADR-21) */
    /* ADR-38: 生产跳的编排归 main.js —— colony 只报告「这一跳发生了」,
       敌对/叙事/居民三跳在这里按固定顺序推进, 不再由 colony 反向调用。 */
    if(APH.Colony && APH.Colony.tickProduction && APH.Colony.tickProduction(s, dt, APH.ColonyTick.takeWorkerAt)){
      tickRivals(30 / 60);
      storyTick(30 / 60);
      residentsTick();
      if(APH.HomeProgress) APH.HomeProgress.tick(s,30);
    }
    /* 战争防务与波次推进 (委托 APH.Combat, ADR-21)
       ADR-38: 围攻推进在这里由 main 自己驱动, 顺序同以前(tickRaid 内部先跑 siege) */
    siegeTick(dt);
    if(APH.Combat && APH.Combat.tickRaid) APH.Combat.tickRaid(s, dt);
    /* 掉落拾取不绑袭击: 末波击杀当帧清 raid 后地上战利品仍能捡 */
    APH.Combat.updateDropped(dt);

    /* ADR-45: needs/hasRes72 随玩家化身一起没了; 提示层只还需要天气与「安静」 */
    return { clinicB:clinicB, cDist:cDist, weatherHint:weatherHint, quiet:quiet };
  }

  /* ---- 提示语候选: 从高到低, 命中即用 ----
     返回 null = 这一档没意见, 交给下一档; 返回 '' = 明确要求清空。 */
  /* UI 同步: 底栏标签高亮与失效规划标记清理 */
  function syncHomeChrome(){
    var s=APH.state;
    /* ADR-28 底部主标签栏显隐与高亮同步 (家园显示, 远征隐藏) */
    var mb=document.getElementById('mainTabsBar');
    if(mb){
      mb.style.display=(s.mode==='running' && s.scene==='home')?'flex':'none';
      if(s.scene==='home' && APH.UI && APH.UI.isOpen && APH.UI.getActiveModal){
        var actMod = APH.UI.getActiveModal();
        var isBuild = APH.UI.isOpen('buildCatalog');
        var isOrders = APH.UI.isOpen('orders');
        var tb = document.getElementById('tabBuild'); if(tb) tb.classList.toggle('active', !!isBuild);
        var tw = document.getElementById('tabWork'); if(tw) tw.classList.toggle('active', actMod==='roster');
        var tt = document.getElementById('tabTech'); if(tt) tt.classList.toggle('active', actMod==='techMap');
        var td = document.getElementById('tabDiplo'); if(td) td.classList.toggle('active', actMod==='diplomacy');
        var to = document.getElementById('tabOrders'); if(to) to.classList.toggle('active', !!isOrders);
      }
    }
    /* ADR-43: 选中的小人死了/离场了就自动解除。
       这段原先藏在 drawSelectedRing 里 —— 绘制函数改 state, 一帧画两次就解除两次。
       它和下面清理规划标记是同一类事(实体没了, 指向它的东西要跟着清), 归拢到这里。 */
    if(s.selectedRid && !selectedPawnEnt()){
      s.selectedRid=null;
      updateCmdPanel();
    }
    /* ADR-28: 自动清除已死亡/已入库实体的规划标记 */
    if(s.designations){
      for(var did in s.designations){
        var de = s.entities.find(function(en){ return en && en.id === did; });
        if(!de || de.dead) delete s.designations[did];
      }
    }
  }

  function updateHome(dt){
    var s=APH.state;
    senseHome();
    var env = simHome(dt);
    /* ADR-41: 提示优先级表已独立成 APH.Hints —— 它只回答「该显示哪句话」,
       由这里决定要不要写上去(返回 null = 没意见, 保持屏幕原样)。 */
    var hint = APH.Hints.forHome(s, env);
    if(hint != null) APH.UI.setHint(hint);
    syncHomeChrome();
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
    s.war.raidWarn=CFG.homePressure.warningSeconds;                      // 预警12s(原型缩短, 正式版60s)
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
    var hp=m.homePressure||(m.homePressure={until:0,residents:(m.residents||[]).length,buildings:buildings.length});
    var lost=hp.residents>(m.residents||[]).length || (s.war.raidActive&&hp.buildings>buildings.length);
    if(lost)hp.until=(s.clock||0)+CFG.DAY_LEN*CFG.homePressure.recoveryDays;
    hp.residents=(m.residents||[]).length;hp.buildings=buildings.length;
    var rivalReady=false;
    (s.rivalStates||[]).forEach(function(r){ if(r.wantRaid) rivalReady=true; });
    return {
      wealth:wealth, threat:Math.min(APH.Events.threatLevel(wealth),1+Math.floor((s.clock||0)/(CFG.DAY_LEN*3))),
      raidProtected:(s.clock||0)<CFG.DAY_LEN*CFG.homePressure.firstRaidDay,
      recovering:!!(m.homePressure&&(m.homePressure.until||0)>(s.clock||0)),
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
      var x=U.clamp(CFG.HAB.x+Math.cos(ang)*d, 80, APH.Scene.width()-80);
      var y=U.clamp(CFG.HAB.y+Math.sin(ang)*d, 80, APH.Scene.width()-80);
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
    var eventTicket=worldUiTicket(s);
    if(eventTicket){
      APH.UI.floatText((negCfg.neg?'⚠ ':'◆ ')+t.name, negCfg.neg?'#ff9a9a':'#8fd4ff');
      APH.UI.showCard(t.name, t.lore);
    }
    APH.Events.enrichEvent(id, s.seed).then(function(rich){
      if(rich&&rich.lore&&rich.lore!==t.lore&&worldUiTicketActive(eventTicket))
        APH.UI.showCard(rich.name, rich.lore);
    });
    U.emit('storyEvent', { id:id });
  }

  /* ADR-39: 已下沉到 APH.Colony —— 此前 ui 另有一份 fallback 且已分叉。 */
  function playerDefPower(){ return APH.Colony.playerDefPower(); }
  /* ---- 阶段E: 袭击战术辅助 ---- */
  function setupSiegeCamp(){
    var s=APH.state;
    var t=((CFG.raidTactics||{}).tactics||{}).siege||{};
    var d=t.campDist!=null?t.campDist:500;
    var ang=s.war.waveAngle||0;
    var cx=U.clamp(CFG.HAB.x+Math.cos(ang)*d,80,APH.Scene.width()-80);
    var cy=U.clamp(CFG.HAB.y+Math.sin(ang)*d,80,APH.Scene.width()-80);
    var hp=t.campHp!=null?t.campHp:60;
    var camp={ id:'bl_siege_camp_'+Date.now(), type:T.BUILDING, bid:'bl_siege_camp',
               x:cx, y:cy, hp:hp, maxHp:hp };
    s.entities.push(camp);
    s.war.siege={ phase:'camp',
                  t:(t.campSec!=null?t.campSec:90),
                  shellT:(t.shellPeriod!=null?t.shellPeriod:15),
                  campId:camp.id, cx:cx, cy:cy };
    if(worldUiVisible(s))APH.UI.floatText('⚠ 敌军在外围扎营围攻!','#ff9a9a');
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
        if(worldUiVisible(s))APH.UI.floatText('💥 围攻炮击!','#ff9a9a');
      }
    }
    if(worldUiVisible(s))APH.UI.setHint('⚠ 敌军扎营围攻中 '+Math.ceil(Math.max(0,sg.t))+'s — 出击拆营可解围!');
    if(sg.t<=0){
      sg.phase='charge';                    // 扎营结束转强攻
      camp.dead=true;
      s.entities.forEach(function(e){
        if(e.type===T.ENEMY&&!e.dead&&!e.isSoldier&&e.sieging){
          e.sieging=false; e.state='chase';
        }
      });
      if(worldUiVisible(s))APH.UI.floatText('⚠ 扎营结束, 敌军发起总攻!','#ff9a9a');
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
    if(worldUiVisible(s))APH.UI.floatText(msg, escaped?'#ffb35c':'#ffd97a');
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
      if(worldUiVisible(s))APH.UI.floatText('🛡 '+n+' 名士兵出动'+(eat?' · 口粮 -'+eat:''),'#ffc857');
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
    var raidTicket=worldUiTicket(s);
    if(raidTicket){
      APH.UI.setHint('');
      var raidVig=document.getElementById('vig');
      if(raidVig)raidVig.style.opacity=.5;
      setTimeout(function(){
        if(worldUiTicketActive(raidTicket)){
          var currentVig=document.getElementById('vig');
          if(currentVig)currentVig.style.opacity=0;
        }
      },900);
    }
    U.emit('raidStarted',s.war.wave);
  }
  /* ADR-39: 势力关系的存取已归 APH.Rivals, 殖民地存档已归 APH.Colony,
     meta 静默保存已归 APH.Save。以下四个只是保留旧名的转发壳。 */
  function loadRivals(){ APH.Rivals.hydrateStates(); }
  /* #72 家园击倒: 送医拖行(世界侧 lerp, 无新实体类型)。玩家击倒昏迷且有居民在场时,
     把玩家朝医疗舱拖; 已到治疗半径内则停下(交由 playerDownedTick 判复活)。 */

  function saveRivals(){ APH.Rivals.persistStates(); }
  function saveWar(){
    var s=APH.state;
    s.meta.war = s.meta.war || {wins:0, raids:0};
    s.meta.war.wins = s.war.wins||0;
    s.meta.war.raids = s.war.raids||0;
    try{ APH.Save.saveMeta(s.meta); }catch(e){}
  }
  function expeditionPawns(s){
    var run=APH.ExpeditionState.active(s.colony);
    return run?(s.entities||[]).filter(function(e){return e&&!e.dead&&e.type===T.RESIDENT&&run.memberIds.indexOf(e.rid||e.id)>=0;}):[];
  }
  function updateSquad(s,dt){
    var run=APH.ExpeditionState.active(s.colony),pawns=expeditionPawns(s);
    if(!run||!pawns.length){s._expeditionReturn=true;return;}
    var leader=pawns.find(function(e){return (e.rid||e.id)===s.selectedRid&&!e.downed;})||pawns.find(function(e){return !e.downed;})||pawns[0];
    var walls=(s.entities||[]).filter(function(e){return !e.dead&&(e.bid==='ancient_wall'||e.bid==='ancient_gate'&&e.gate&&!e.gate.broken);}).map(function(e){return {id:'bl_wall',x:e.x,y:e.y};});
    var nav=APH.Nav.gridOf(walls,s.worldDescriptor);
    pawns.forEach(function(e){
      var r=(s.meta.residents||[]).find(function(r){return r.id===(e.rid||e.id);});if(!r)return;
      e.worldId=run.id;e.hurtCd=Math.max(0,(e.hurtCd||0)-dt);e.hitFlash=Math.max(0,(e.hitFlash||0)-dt);
      e.downed=!!r.downed;e.isSleeping=false;r.isSleeping=false;
      if(e.downed){e.walking=false;return;}
      var order=e.userOrder,target=order&&order.type==='move'?order:null;
      if(e===leader&&s.target)target=s.target;
      if(order&&order.type==='gather'){
        if(!order.flora||order.flora.dead){e.userOrder=null;order=null;}
        else{
          target=order.flora;
          if(U.dst(e.x,e.y,target.x,target.y)<32){
            if(s.worldDescriptor&&s.worldDescriptor.generation===0&&target.seedItem){
              if(CFG.items[target.seedItem])APH.Combat.spawnDrop(target.x,target.y,target.seedItem,1);
              target.dead=true;
            }else{
              var harvest=APH.Colony.workOnFlora(target,r,dt);
              if(harvest.error){
                e.userOrder=null;
                if(!s._background)APH.UI.floatText('✕ 无法采集：'+harvest.error,'#ff9a9a');
              }else if(harvest.done&&harvest.dropItemId){
                var mined=APH.Combat.spawnDrop(target.x,target.y,harvest.dropItemId,harvest.dropCount);
                if(mined)e.userOrder={type:'haul',pile:mined};
              }
            }
            e.walking=false;if(target.dead&&e.userOrder===order)e.userOrder=null;target=null;
          }
        }
      }
      if(order&&order.type==='haul'){
        if(!order.pile||order.pile.dead){e.userOrder=null;order=null;}
        else target=order.pile;
      }
      if(order&&order.type==='interact'){
        if(!order.entity||order.entity.dead){e.userOrder=null;order=null;}
        else{
          target=order.entity;
          if(U.dst(e.x,e.y,target.x,target.y)<55){
            if(performExpeditionInteraction(e,target)&&target.type===T.BEACON)leader=e;
            e.userOrder=null;order=null;target=null;e.walking=false;
          }
        }
      }
      if(target){APH.Res.walkAround(e,target,dt,CFG.walk.speed,nav);if(U.dst(e.x,e.y,target.x,target.y)<4){if(e===leader&&s.target)s.target=null;if(order&&order.type==='move')e.userOrder=null;}}
      else e.walking=false;
      e.fireCd=Math.max(0,(e.fireCd||0)-dt);
      var enemy=order&&order.type==='attack'&&order.enemy&&!order.enemy.dead?order.enemy:APH.Ent.findNearest(s.entities,T.ENEMY,e.x,e.y,(CFG.combat.plasmaSpeed*CFG.combat.plasmaLife),function(x){return !x.dead&&!x.isSoldier&&!x.downed;});
      if(enemy&&U.dst(e.x,e.y,enemy.x,enemy.y)<=(CFG.combat.plasmaSpeed*CFG.combat.plasmaLife)&&e.fireCd<=0){
        var a=Math.atan2(enemy.y-e.y,enemy.x-e.x);e.face=a;e.fireCd=CFG.combat.fireCd;
        s.entities.push(APH.Combat.makeProj(e.x,e.y-12,Math.cos(a)*CFG.combat.plasmaSpeed,Math.sin(a)*CFG.combat.plasmaSpeed,'player',CFG.combat.plasmaDmg));
      }
      var inPad=U.dst(e.x,e.y,CFG.HAB.x,CFG.HAB.y+70)<CFG.HAB.r;
      e.o2=U.clamp((e.o2==null?CFG.player.o2Max:e.o2)+dt*(inPad?CFG.player.o2Refill:-CFG.player.o2Drain),0,CFG.player.o2Max);
      if(e.o2<=0){r.downed=true;e.downed=true;}
    });
    s.px=leader.x;s.py=leader.y;s.o2=Math.min.apply(null,pawns.map(function(e){return e.o2==null?100:e.o2;}));
    if(s.worldDescriptor&&s.worldDescriptor.generation===1){
      var regenPeriod=Math.max(.001,Number(CFG.time.prodTick)||30);
      var regenElapsed=typeof s.expeditionRegenT==='number'&&isFinite(s.expeditionRegenT)&&s.expeditionRegenT>=0?s.expeditionRegenT:0;
      regenElapsed+=Math.max(0,Number(dt)||0);
      if(!isFinite(regenElapsed))regenElapsed=0;
      var regenSteps=Math.min(4,Math.floor(regenElapsed/regenPeriod));
      s.expeditionRegenT=regenElapsed%regenPeriod;
      while(regenSteps>0){
        regenSteps--;
        var regrown=APH.Colony.floraRespawnTick(s);
        if(regrown.length){
          var regrownIds={};regrown.forEach(function(resource){regrownIds[resource.id]=true;});
          s.entities=s.entities.filter(function(entity){return !(entity&&entity.dead&&regrownIds[entity.id]);});
          regrown.forEach(function(resource){s.entities.push(resource);});
        }
      }
    }
    s.squadNeedT=(s.squadNeedT||0)+dt;
    while(s.squadNeedT>=CFG.time.prodTick){
      s.squadNeedT-=CFG.time.prodTick;
      APH.ExpeditionState.membersForWorld(s.meta,run.id).forEach(function(r){
        APH.Res.needsTick(r,false,{raid:false});
        if(r.food<CFG.residents.eatBelow&&run.supply.food>0){run.supply.food--;r.food=Math.min(100,r.food+CFG.expedition.supplyFoodGain);}
        APH.Res.checkDowned(r);
      });
    }
    if(pawns.every(function(e){return e.downed;}))s._expeditionReturn=true;
    if(s.o2<CFG.expedition.oxygenWarning&&!s._background)APH.UI.setHint('队伍氧气不足，返回着陆舱补给或召回家园。');
  }

  function updateExpedition(dt, context){
    var s=context||APH.state;
    var night=APH.World.daylight()<.5;
    var run=APH.ExpeditionState.active(s.colony);
    if(run)updateSquad(s,dt);
    if(run&&s._expeditionReturn)return;
    if(APH.Planet.hasLaw(s.spec,'lw_spore_light')){
      (s.spores||[]).forEach(function(sp){ APH.Planet.sporeNudge(sp, s.px, s.py, dt); });
    }
    updatePickups(dt);
    updateInteraction(dt);
    updateSpawner(dt, night);
    APH.Combat.updateCombat(dt, night);
    APH.Combat.updateDropped(dt);
    /* 返回舱接近检测(玩家出生点旁, 委托 APH.Ent, ADR-20) */
    var pad = APH.Ent.findNearestBuilding(s.entities, 'bl_landing_pad', s.px, s.py, 90) ||
              s.entities.find(function(e){ return e.type===T.BUILDING && e.pad && U.dst(s.px,s.py,e.x,e.y)<90; });
    s.nearPad = !!pad;
    s.nearFlora = APH.Ent.findNearest(s.entities, T.FLORA, s.px, s.py, 50);
    if(!s._background && s.nearFlora && !s.nearPad && !s.nearBeacon){
      var yieldDef=CFG.items[s.nearFlora.yieldItemId],resourceDef=CFG.observe.resourceSemantics[s.nearFlora.kind]||{};
      APH.UI.setHint('[E] 采集 '+((yieldDef&&yieldDef.name)||resourceDef.name||'未知资源'));
    }else if(!s._background && s.nearPad && !s.nearBeacon){
      APH.UI.setHint('[E] 返航殖民地 (结算战利品)');
    }
    if(!run)updateSurvival(dt);
    if(run)APH.ExpeditionState.setCargo(s.colony,run.id,s.carry);
    checkBossDown();
    if(s.mode!=='running') return;
    if(!s._background)updateCamera(dt);
    updateParticles(dt,s.clock);
    if(!s._background)document.getElementById('vig').style.opacity =
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

    if(APH.ExpeditionUI)APH.ExpeditionUI.update(s);
    if(APH.MapUI)APH.MapUI.update(s);
    if(s.mode!=='running'){ return; }

    /* ADR-30: 暂停只冻模拟；镜头与绘制仍走。倍速只乘模拟 dt。 */
    if(s.paused){
      updateCamera(dt);
      if(s.scene==='home'){
        APH.World.render(dt, APH.Draw.homeDrawers());
        APH.Draw.selectedRing(s.clock);
        APH.Draw.designations(s.clock);
        APH.Draw.placementGhost();
        APH.Draw.zones();
        APH.Draw.orderDragBox();
        APH.Draw.pawnDragBox();
        APH.Draw.tutorialArrow(s.clock);
        APH.Draw.debugMark();
        APH.UI.updHUD();
      }else{
        APH.World.render(dt, APH.Draw.expeditionDrawers());
        APH.Draw.selectedRing(s.clock);APH.Draw.pawnDragBox();
        APH.UI.updHUD();
      }
      return;
    }


    /* 实体上限护栏 (委托 APH.Ent, ADR-20) */
    var over=guardTrim(s.entities,s.px,s.py,s.scene==='home'&&s.colony.scene&&s.colony.scene.generation===1?CFG.homeMap.entityCap:CFG.caps.entitiesHard);
    if(over.length){
      var kill=new Set(over);
      s.entities.forEach(function(e){ if(kill.has(e.id)) APH.Ent.destroy(e); });
      s.entities=APH.Ent.sweepDead(s.entities);
    }

    dt=simStep(dt);

    if(s.scene==='home'){
      APH.World.render(dt, APH.Draw.homeDrawers());
      APH.Draw.selectedRing(s.clock);
      APH.Draw.designations(s.clock);
      APH.Draw.placementGhost();
      APH.Draw.zones();
      APH.Draw.orderDragBox();
      APH.Draw.pawnDragBox();
      APH.Draw.tutorialArrow(s.clock);
      APH.Draw.debugMark();
      APH.UI.updHUD();
      if(tickN%15===0){
        updateCmdPanel();   /* ADR-29: 命令面板状态行低频刷新 */
        if(APH.UI && APH.UI.renderColonistBar) APH.UI.renderColonistBar(); /* 顶部头像条刷新 */
      }
      if(tickN%10===0) updateInspectorNow(); /* ADR-28 / Ticket #156: 检查器状态低频刷新 */
      return;
    }

    var insp = document.getElementById('inspector');
    if(insp) insp.style.display = 'none';
    var colBar = document.getElementById('colonistBar');
    if(colBar){colBar.style.display='';if(APH.UI.renderColonistBar)APH.UI.renderColonistBar();}

    var night = APH.World.daylight() < .5;
    if(s.mode!=='running') return;       // 本帧死亡

    if(tickN%30===0){
      /* 屏幕坐标探针: 角色在视口内的实际像素位置(应≈vw/2,vh/2) */
      var screen=APH.Camera.toScreen(s,s.px,s.py,{w:vpW(),h:vpH()}),sx=Math.round(screen.x),sy=Math.round(screen.y);
      document.title='▶'+tickN+' 屏幕('+sx+','+sy+') 视口['+
        innerWidth+'x'+innerHeight+'] DPR'+(window.devicePixelRatio||1)+
        ' cv('+document.getElementById('cv').width+'x'+
        document.getElementById('cv').height+')';
    }

    APH.World.render(dt, APH.Draw.expeditionDrawers());
    APH.Draw.selectedRing(s.clock);
    APH.Draw.pawnDragBox();

    APH.UI.updHUD();
  }

  /* ---- 渲染抽屉组: 场景各自注册 ---- */
  /* ADR-43: 绘制层已独立成 APH.Draw。main 只负责在正确的时机调用它。 */

  /* ================= 科技效果应用 ================= */
  /* ADR-39: 科技效果的应用已下沉到 APH.Colony(TECHS 表的归属地)。此处仅转发, 保留旧名。 */
  function applyTech(meta,techId){ return APH.Colony.applyTech(meta, techId); }
  function applyAllTech(meta){ return APH.Colony.applyAllTech(meta); }

  /* ================= 建造放置 ================= */
  function tryPlace(bid,wx,wy){
    var s=APH.state;
    var planned=APH.Construction.ghost(s,bid,wx,wy,s.buildRotation||0);
    if(!planned.ok){ APH.UI.floatText('✕ '+planned.why,'#ff9a9a'); return; }
    var rec=planned.record, gx=rec.x, gy=rec.y;
    s.colony.nextBuildingId=(s.colony.nextBuildingId||0)+1;
    rec.uid='b_'+s.colony.nextBuildingId+'_'+Date.now().toString(36);
    var mul=APH.Res.globalBonuses(s.meta.residents||[]).buildCostMul;
    var free=!!s.devFreeBuild;
    var def=APH.Colony.get(bid);
    if(!free){
      var need=APH.Construction.materialNeed(def,mul);
      s.colony.buildQueue=s.colony.buildQueue||[];
      var q=Object.assign({},rec,{total:def.buildTime||5,progress:0,materialsPaid:false,need:need});
      s.colony.buildQueue.push(q);
      s.entities.push(Object.assign({},rec,{id:rec.uid,type:T.BLUEPRINT,progress:0,building:false}));
      APH.Save.saveMeta(s.meta);
      saveColony();
      U.emit('queued',{id:bid});
      APH.UI.floatText('🛠 '+def.name+' 开工 ('+(def.buildTime||0)+'s)','#ffc857');
      s.parts.push({t:'ping',x:wx,y:wy,life:.9,max:.9});
      return;
    }
    if(bid==='bl_kitchen'||bid==='bl_workshop'||bid==='bl_campfire') rec.bills=[];
    if(bid==='bl_wall' && CFG.wall && CFG.wall.hp != null) rec.hp = CFG.wall.hp;
    s.colony.buildings.push(rec);
    var isGridStatic = (bid==='bl_wall'||bid==='bl_gate'||bid==='bl_spike_trap'||bid==='bl_sandbag');
    if(!isGridStatic && APH.Colony.placeBuildingEntity) APH.Colony.placeBuildingEntity(bid, gx, gy, 1);
    APH.Save.saveMeta(s.meta);
    saveColony();
    U.emit('built',{id:bid});
    APH.UI.floatText('∞ '+def.name+' 已落下','#ffc857');
    s.parts.push({t:'ping',x:wx,y:wy,life:.9,max:.9});
  }
  function cancelConstruction(uid){
    var s=APH.state,q=(s.colony.buildQueue||[]).find(function(x){return x.uid===uid;});
    if(!q)return false;
    if(q.materialsPaid!==false){APH.UI.floatText('旧蓝图保留已付材料，继续施工可用','#ffc857');return false;}
    var out=q.taskId?APH.Logistics.cancelTask(s.colony,q.taskId):{drops:[]};
    (out.drops||[]).forEach(function(p){APH.Combat.spawnDrop(p.x,p.y,p.itemId,p.n,{stock:true,jitter:0});});
    s.colony.buildQueue=s.colony.buildQueue.filter(function(x){return x!==q;});
    s.entities.forEach(function(e){if(e.type===T.BLUEPRINT&&e.uid===uid)e.dead=true;});
    if(q.repairSourceId&&APH.Recovery)APH.Recovery.cancel(s,q);
    s.selectedTarget=null;saveColony();updateInspectorNow();return true;
  }
  function cancelSelectedConstruction(){var t=APH.state.selectedTarget;return !!(t&&t.entity&&cancelConstruction(t.entity.uid));}
  function repairSelectedWreckage(){
    var s=APH.state,t=s.selectedTarget,e=t&&t.type==='flora'&&(t.entity||t);
    var out=APH.Recovery?APH.Recovery.plan(s,e):{ok:false,why:'修复模块未加载'};
    if(!out.ok){APH.UI.floatText('✕ '+out.why,'#ff9a9a');return out;}
    saveColony();
    U.emit('queued',{id:out.q.bid,recovery:true});
    APH.UI.floatText('🛠 已保留残骸并排入修复工程','#ffc857');
    updateInspectorNow();
    return out;
  }
  function toggleFreeBuild(){
    var s=APH.state;
    s.devFreeBuild = !s.devFreeBuild;
    if(APH.UI && APH.UI.floatText) APH.UI.floatText(s.devFreeBuild ? '∞ 无限建造 ON · 点地即成' : '无限建造 OFF', s.devFreeBuild ? '#ffc857' : '#8fa3cc');
    if(APH.UI && APH.UI.updHUD) APH.UI.updHUD();
    if(APH.UI && APH.UI.renderBuildRow) APH.UI.renderBuildRow();
    return true;
  }
  function buildingRecordOf(ent){ return APH.Colony.recordOf(ent); }
  function setBuildingField(ent, key, val){
    if(!ent) return;
    ent[key]=val;
    var rec=buildingRecordOf(ent);
    if(rec) rec[key]=val;
  }
  function saveColony(){ APH.Colony.persist(); }
  function loadColony(){ return APH.Save.loadColony(); }

  /* ================= 输入动作处理器 (委托 APH.Input 深模块, ADR-19) ================= */



  function onUpgradeNearest(){
    var s=APH.state;
    if(s.mode!=='running'||s.scene!=='home'||playerDowned()||playerSleeping()) return false;
    var selectedUpgrade=s.selectedTarget&&s.selectedTarget.type==='building'&&APH.Colony.recordOf(s.selectedTarget.entity||s.selectedTarget);
    var best=null,bd=1e9;
    s.colony.buildings.forEach(function(b){
      if(b.id==='bl_landing_pad'||selectedUpgrade&&b!==selectedUpgrade) return;
      var d=U.dst(s.camX!=null?s.camX:s.px,s.camY!=null?s.camY:s.py,b.x,b.y);
      if(d<bd){bd=d;best=b;}
    });
    if(!best){ APH.UI.floatText('附近没有可升级的建筑','#8fa3cc'); }
    else{
      var def2=APH.Colony.get(best.id);
      var r3=APH.Colony.canUpgrade(best,def2,s.meta.research, haveStock('leather'));
      if(r3.ok){
        if(r3.costRes==='leather'){
          if(!APH.Colony.takeStock(s.meta.res, s.entities, 'leather', r3.cost).ok){
            APH.UI.floatText('✕ 皮革不足','#ff9a9a'); return true;
          }
        }else s.meta.research-=r3.cost;
        best.lv=(best.lv||1)+1;
        s.entities.forEach(function(en){
          if(en.type===T.BUILDING&&en.bid===best.id&&U.dst(en.x,en.y,best.x,best.y)<5) en.lv=best.lv;
        });
        APH.Save.saveMeta(s.meta); saveColony();
        APH.UI.floatText('★ '+def2.name+' 升级为 Lv.'+best.lv,'#ffc857');
        U.emit('upgraded',{id:best.id,lv:best.lv});
      }else{
        APH.UI.floatText('✕ '+r3.why,'#ff9a9a');
      }
    }
    return true;
  }

  function onDemolishNearest(){
    var s=APH.state;
    if(s.mode!=='running'||s.scene!=='home'||playerDowned()||playerSleeping()) return false;
    var selectedBuilding=s.selectedTarget&&s.selectedTarget.type==='building'&&APH.Colony.recordOf(s.selectedTarget.entity||s.selectedTarget);
    var bestX=null,bdX=1e9;
    s.colony.buildings.forEach(function(b,idx){
      if(b.id==='bl_landing_pad') return;
      if(selectedBuilding&&b!==selectedBuilding)return;
      var d=U.dst(s.camX!=null?s.camX:s.px,s.camY!=null?s.camY:s.py,b.x,b.y);
      if(d<bdX){bdX=d;bestX={b:b,idx:idx};}
    });
    if(!bestX){ APH.UI.floatText('附近没有可拆除的建筑','#8fa3cc'); }
    else{
      var def3=APH.Colony.get(bestX.b.id);
      var refundR=APH.Colony.refundResOf(def3);
      if(s.colony.rulesVersion===1){
        var paid=bestX.b.materialsSpent||APH.Construction.materialNeed(def3,1);
        refundR={};Object.keys(paid).forEach(function(key){refundR[key]=Math.floor(paid[key]/2);});
      }
      var refund=APH.Colony.refundOf(def3);
      var refundM=APH.Colony.refundMineralOf(def3);
      var refundMsg;
      if(refundR){
        s.meta.res=s.meta.res||{ mineral:0, food:0, leather:0, wood:0, stone:0, iron:0 };
        var rParts=[];
        for(var rk in refundR){
          if(refundR[rk]>0){
            if(s.colony.rulesVersion===1)APH.Combat.spawnDrop(bestX.b.x,bestX.b.y,CFG.items[rk]?rk:'it_'+rk,refundR[rk],{stock:true,jitter:0});
            else s.meta.res[rk]=(s.meta.res[rk]||0)+refundR[rk];
            rParts.push(((CFG.items[rk]&&CFG.items[rk].name)||rk)+' +'+refundR[rk]);
          }
        }
        refundMsg='🗑 '+def3.name+' 已拆除 ('+rParts.join(' ')+')';
      }else{
        s.meta.research+=refund;
        s.meta.res.mineral=(s.meta.res.mineral||0)+refundM;
        refundMsg='🗑 '+def3.name+' 已拆除 (+'+refund+'研究 +'+refundM+'矿)';
      }
      if(bestX.b.fuelWood>0){APH.Combat.spawnDrop(bestX.b.x,bestX.b.y,'it_wood',bestX.b.fuelWood,{stock:true,jitter:0});bestX.b.fuelWood=0;}
      s.colony.buildings.splice(bestX.idx,1);
      if(APH.ProductionJobs)APH.ProductionJobs.prepare(s);
      if(APH.Storage)APH.Storage.prepare(s);
      flushConstructionSurplus(s);
      s.entities.forEach(function(en){
        if(en.type===T.BUILDING&&en.bid===bestX.b.id&&U.dst(en.x,en.y,bestX.b.x,bestX.b.y)<5){
          APH.Ent.destroy(en);
        }
      });
      s.entities=APH.Ent.sweepDead(s.entities);
      APH.Save.saveMeta(s.meta); saveColony();
      APH.UI.floatText(refundMsg,'#ffc857');
      U.emit('demolished',{id:bestX.b.id});
    }
    return true;
  }

  function setTimeScale(n){
    var s=APH.state;
    if(s.mode!=='running') return false;
    var scales=(CFG.time&&CFG.time.scales)||[1,2,3];
    if(scales.indexOf(n)<0) n=1;
    s.timeScale=n;
    s.paused=false;
    if(APH.UI&&APH.UI.floatText) APH.UI.floatText('⏱ ×'+n, '#c5e3f6');
    if(APH.UI&&APH.UI.updHUD) APH.UI.updHUD();
    return true;
  }
  function simStep(realDt){
    var s=APH.state;
    if(s.mode!=='running')return 0;
    if(s.paused){updateCamera(realDt||0);return 0;}
    var dt=(realDt||0)*(s.timeScale||1);if(dt<=0)return 0;
    s.clock+=dt;
    var run=APH.ExpeditionState.active(s.colony);
    if(run&&s.worlds&&s.worlds.expedition){
      var activeScene=s.scene;rememberActive(s);
      ['home','expedition'].forEach(function(kind){
        var world=s.worlds[kind];if(!world)return;
        world.clock=s.clock;world.mode=s.mode;world.meta=s.meta;world.colony=s.colony;world.worlds=s.worlds;
        world.keys=kind===activeScene?s.keys:{};world.paused=false;world.timeScale=s.timeScale;
        APH.WorldRuntime.run(world,function(ctx){
          ctx._background=kind!==activeScene;
          if(kind==='home'){if(ctx._background)simHome(dt,ctx);else updateHome(dt);}
          else updateExpedition(dt,ctx);
        });
        s.worlds[kind]=APH.WorldRuntime.capture(world);
      });
      APH.WorldRuntime.install(s,s.worlds[activeScene]);s._background=false;
      if(s.worlds.home.mode==='dead')s.mode='dead';
      if(s.worlds.expedition._expeditionReturn)returnHome();
      s.worlds.saveT=(s.worlds.saveT||0)+dt;
      if(s.worlds.saveT>=CFG.expedition.checkpointSeconds){s.worlds.saveT=0;checkpointWorlds(s);}
    }else if(s.scene==='home')updateHome(dt);
    else updateExpedition(dt,s);
    return dt;
  }
  function initInputActions(){
    if(!APH.Input || !APH.Input.registerActions) return;
    APH.Input.registerActions({
      OPEN_MAP:function(){return APH.MapUI.open();},
      ZOOM_IN:function(){APH.MapUI.zoom(CFG.camera.zoomStep);return true;},
      ZOOM_OUT:function(){APH.MapUI.zoom(1/CFG.camera.zoomStep);return true;},
      INTERACT:function(){var s=APH.state;if(s.scene==='home')return APH.ExpeditionUI.open(s);if(s.nearPad){returnHome();return true;}if(s.nearBeacon){s.scanning=s.nearBeacon;s.scanT=0;return true;}if(s.nearFlora){var pawn=selectedPawnEnt()||expeditionPawns(s)[0];if(pawn){pawn.userOrder={type:'gather',flora:s.nearFlora};return true;}}return false;},
      INTRO_CONFIRM: function(){
        var s=APH.state;
        if(s.mode!=='intro') return false;
        if(s.openingClock && window.APH.Opening && !APH.Opening.isLast(s.openingClock)){
          APH.Opening.skipToLast(s.openingClock);
          s.openingAlarmT = 0;
          if(APH.UI.skipOpeningVideo) APH.UI.skipOpeningVideo();
          if(APH.UI.renderOpening) APH.UI.renderOpening(s.openingClock);
        }else if(!s.openingClock) startGame();
        return true;
      },
      TOGGLE_PAUSE: function(){
        var s=APH.state;
        if(s.mode!=='running') return false;
        s.paused = !s.paused;
        if(APH.UI && APH.UI.floatText) APH.UI.floatText(s.paused ? '⏸ 暂停' : '▶ 继续', '#c5e3f6');
        if(APH.UI && APH.UI.updHUD) APH.UI.updHUD();
        return true;
      },
      TOGGLE_FREE_BUILD: function(){ return toggleFreeBuild(); },
      SET_TIME_SCALE_1: function(){ return setTimeScale(1); },
      SET_TIME_SCALE_2: function(){ return setTimeScale(2); },
      SET_TIME_SCALE_3: function(){ return setTimeScale(3); },
      TOGGLE_BUILD_MODE: function(){
        var s=APH.state;
        if(s.mode!=='running'||s.scene!=='home'||playerDowned()||playerSleeping()) return false;
        var ids=Object.keys(APH.Colony.list()).filter(function(id){return id!=='bl_landing_pad';});
        var cur=ids.indexOf(s.buildMode);
        s.buildMode = ids[(cur+1) % (ids.length+1)] || null;
        APH.UI.setHint(s.buildMode
          ? '建造: '+APH.Colony.get(s.buildMode).name+' · 点击空地放置 ('+
            APH.Colony.get(s.buildMode).cost+'研 / '+(APH.Colony.get(s.buildMode).costMineral||0)+'矿)'
          : '建造模式关闭');
        return true;
      },
      CYCLE_JOB: function(){
        var s=APH.state;
        if(s.mode!=='running'||s.scene!=='home'||playerDowned()||playerSleeping()) return false;
        cycleSelectedJob();
        return true;
      },
      UPGRADE_NEAREST: onUpgradeNearest,
      DEMOLISH_NEAREST: onDemolishNearest,
      TOGGLE_CAMERA_LOCK: function(){
        var s=APH.state;
        s.strictCam=!s.strictCam;
        APH.UI.floatText(s.strictCam?'🔒 相机锁定(角色恒居中)':'🔓 相机平滑跟随','#59d9ff');
        return true;
      },
      TOGGLE_MUTE: function(){
        var m=APH.SFX.toggleMute();
        APH.UI.floatText(m?'🔇 静音':'🔊 音效开启','#8fa3cc');
        return true;
      },
      TOGGLE_MARKER: function(){
        var s=APH.state;
        s.showMarker=!s.showMarker;
        APH.UI.floatText(s.showMarker?'角色标记: 开':'角色标记: 关','#8fa3cc');
        return true;
      },
      TOGGLE_DIPLOMACY: function(){
        if(APH.state.mode==='running') toggleDiplomacy();
        return true;
      },
      TOGGLE_DRAFT: function(){
        var s = APH.state;
        if(s.mode !== 'running' || s.scene !== 'home') return false;
        if(s.buildMode){s.buildRotation=((s.buildRotation||0)+1)%4;return true;}
        if(s.selectedPawns && s.selectedPawns.length > 1){
          var anyUndrafted = s.selectedPawns.some(function(p){ return !p.drafted && p !== APH.Ent.findPlayer(); });
          var targetState = anyUndrafted;
          s.selectedPawns.forEach(function(p){
            if(p.type === 'player' || p.id === 'player') s.playerDrafted = targetState;
            else p.drafted = targetState;
            p.userOrder = null;
            p.walking = false;
          });
          var msg = targetState ? ('✔ 编队 ' + s.selectedPawns.length + ' 人已全员立正征召 (战斗戒备)') : ('✔ 编队已全员解除征召 (归队作息)');
          APH.UI.floatText(msg, targetState ? '#ff4d4d' : '#7dffab');
          updateCmdPanel();
          updateInspectorNow();
          if(APH.UI && APH.UI.renderColonistBar) APH.UI.renderColonistBar();
          return true;
        }
        if(s.selectedRid){
          var ent = selectedPawnEnt();
          if(ent){
            ent.drafted = !ent.drafted;
            if(ent.drafted){
              ent.walking = false;
              ent.userOrder = null;
              APH.UI.floatText((ent.name||'居民') + ' 战备征召 (立正待命)', '#ff4d4d');
            } else {
              ent.userOrder = null;
              APH.UI.floatText((ent.name||'居民') + ' 解除征召 (归队作息)', '#7dffab');
            }
            updateCmdPanel();
            updateInspectorNow();
            if(APH.UI && APH.UI.renderColonistBar) APH.UI.renderColonistBar();
            return true;
          }
        }
        s.playerDrafted = !s.playerDrafted;
        if(s.playerDrafted){
          APH.UI.floatText('⭐ 已征召 · 点地面走路', '#ff4d4d');
        } else {
          APH.UI.floatText('⭐ 指挥官解除征召 (归队作息)', '#7dffab');
        }
        updateInspectorNow();
        if(APH.UI && APH.UI.renderColonistBar) APH.UI.renderColonistBar();
        return true;
      },
      FOCUS_COMMANDER: function(){
        var s = APH.state;
        if(s.scene === 'home' && s.px != null){
          centerCameraOn(s.px, s.py);
          APH.UI.floatText('镜头已聚焦至指挥官', '#59d9ff');
          return true;
        }
        return false;
      },
      TOGGLE_TECH: function(){
        var s=APH.state;
        if(s.debugKeys && s.scene!=='home' && !techMapOpen()){
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
          return true;
        }
        if(techMapOpen()) toggleTechMap(false);
        else if(s.scene==='home'&&s.mode==='running') toggleTechMap();
        return true;
      },
      TOGGLE_CODEX: function(){
        if(APH.state.mode==='running') toggleCodex();
        return true;
      },
      TOGGLE_BUILD_ROW: function(){
        var s=APH.state;
        if(s.debugKeys){
          s.px=U.clamp(s.px+600,40,APH.Scene.width()-40);
          s.camX=s.px; s.target=null;
          document.title='DBG 已东移600px';
          return true;
        }
        if(s.mode==='running'&&s.scene==='home') toggleBuildRow();
        return true;
      },
      DEBUG_SPAWN: function(){
        var s=APH.state;
        if(s.mode==='running'&&s.debugKeys){
          var f=s.spec.enemies.factions[0];
          s.entities.push(APH.Ent.makeEnemy(f, s.px+180, s.py));
          document.title='DBG 已生成 '+f.name;
          return true;
        }
      },
      CANCEL_OR_CLOSE: function(){
        var s=APH.state;
        if(s.orderTool){
          s.orderTool = null;
          APH.state.orderDrag = false;
          APH.UI.setHint('');
          APH.UI.floatText('退出规划模式', '#c5e3f6');
          if(APH.UI && APH.UI.renderOrdersRow) APH.UI.renderOrdersRow();
          return true;
        }
        if(s.selectedRid || (s.selectedTarget && s.selectedTarget.type!=='player')){
          deselectPawn();
          s.selectedTarget = { type: 'player' };
          updateInspectorNow();
          return true;
        }
        if(s.buildMode){ s.buildMode=null; APH.UI.setHint(''); return true; }
        if(APH.UI && APH.UI.closeActive && APH.UI.closeActive()) return true;
        return false;
      },
      CLOSE_MODAL: function(){
        if(APH.UI && APH.UI.closeActive && APH.UI.closeActive()) return true;
        return false;
      },
      NAV_UP: function(){
        if(techMapOpen()) moveTechSel('ArrowUp');
        else if(APH.UI && APH.UI.isOpen('trade')) moveTradeSel('ArrowUp');
        else if(APH.UI && APH.UI.isOpen('roster')) movePrioCursor('ArrowUp');
        return true;
      },
      NAV_DOWN: function(){
        if(techMapOpen()) moveTechSel('ArrowDown');
        else if(APH.UI && APH.UI.isOpen('trade')) moveTradeSel('ArrowDown');
        else if(APH.UI && APH.UI.isOpen('roster')) movePrioCursor('ArrowDown');
        return true;
      },
      NAV_LEFT: function(){
        if(techMapOpen()) moveTechSel('ArrowLeft');
        else if(APH.UI && APH.UI.isOpen('roster')) movePrioCursor('ArrowLeft');
        return true;
      },
      NAV_RIGHT: function(){
        if(techMapOpen()) moveTechSel('ArrowRight');
        else if(APH.UI && APH.UI.isOpen('roster')) movePrioCursor('ArrowRight');
        return true;
      },
      BUY_TECH: function(){
        if(techMapOpen()){ tryBuySelectedTech(); return true; }
        return false;
      },
      CONFIRM_TRADE: function(){
        var s=APH.state;
        if(APH.UI && APH.UI.isOpen('trade') && currentTrader()){
          doTradeRow(s.tradeSel||0);
          return true;
        }
        return false;
      },
      SET_PRIO_0: function(){ setPrioAtCursor(0); return true; },
      SET_PRIO_1: function(){ setPrioAtCursor(1); return true; },
      SET_PRIO_2: function(){ setPrioAtCursor(2); return true; },
      SET_PRIO_3: function(){ setPrioAtCursor(3); return true; },
      TRADE_ROW_1: function(){ doTradeRow(0); return true; },
      TRADE_ROW_2: function(){ doTradeRow(1); return true; },
      TRADE_ROW_3: function(){ doTradeRow(2); return true; },
      TRADE_ROW_4: function(){ doTradeRow(3); return true; },
      TRADE_ROW_5: function(){ doTradeRow(4); return true; },
      TRADE_ROW_6: function(){ doTradeRow(5); return true; },
      TRADE_ROW_7: function(){ doTradeRow(6); return true; },
      TRADE_ROW_8: function(){ doTradeRow(7); return true; },
      TRADE_ROW_9: function(){ doTradeRow(8); return true; }
    });
  }

  /* ================= 输入 ================= */
  function bindInput(){
    var s=APH.state;
    initInputActions();
    if(APH.Input && APH.Input.bind) APH.Input.bind();

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

    /* ADR-33: 画布指针改走 APH.Input —— 与键盘同一套上下文栈与动作分发。
       处理器体不变(仍是玩法), 变的是「谁来监听、什么时候该被模态挡住」。
       onPointer 把 (payload)=>fn(payload.event) 适配成旧的事件签名。 */
    function onPointer(action, fn){
      if(APH.Input && APH.Input.onAction){
        APH.Input.onAction(action, function(p){ return fn(p && p.event); });
      } else if(cv && cv.addEventListener){
        var type = { POINTER_DOWN:'pointerdown', POINTER_MOVE:'pointermove',
                     POINTER_UP:'pointerup', POINTER_CONTEXT:'contextmenu' }[action];
        if(type) cv.addEventListener(type, fn);
      }
    }
    /* 单一真源: 当前指针工具仍住在 state 里, Input 只是来问 */
    if(APH.Input && APH.Input.setToolProvider){
      APH.Input.setToolProvider(function(){
        var st = APH.state;
        if(st.orderTool) return 'order:' + st.orderTool;
        if(st.buildMode) return 'build:' + st.buildMode;
        return 'select';
      });
    }
    cv.addEventListener('wheel',function(e){if(APH.state.mode!=='running')return;e.preventDefault();APH.MapUI.zoom(e.deltaY<0?CFG.camera.zoomStep:1/CFG.camera.zoomStep,{x:e.clientX,y:e.clientY});},{passive:false});
    if(APH.Input && APH.Input.bindPointer) APH.Input.bindPointer(cv);
    onPointer('POINTER_DOWN', function(e){
      downX=e.clientX; downY=e.clientY; downT=performance.now(); downMoved=0;
      /* ADR-28: 规划划区拖拽框选 — 按下开始 */
      var s0=APH.state;
      if(s0.scene==='home' && s0.orderTool){
        APH.state.orderDrag = true;
        var wx0=pointerWorld(e).x, wy0=pointerWorld(e).y;
        APH.state.orderFrom = { x: wx0, y: wy0 };
        APH.state.orderTo = { x: wx0, y: wy0 };
        return;
      }
      /* ADR-29: 鼠标拉框多选编队 — 按下开始 (非规划、非建造且左键) */
      if(!s0.orderTool && !s0.buildMode && e.button===0){
        APH.state.pawnDrag = true;
        var wxP = pointerWorld(e).x, wyP = pointerWorld(e).y;
        APH.state.pawnDragStart = { x: wxP, y: wyP };
        APH.state.pawnDragEnd = { x: wxP, y: wyP };
      }
      /* T2: 墙/闸门拖拽连续放置 — 按下即开始(在建造模式下) */
      if(s0.scene==='home'&&s0.buildMode&&(s0.buildMode==='bl_wall'||s0.buildMode==='bl_gate'||s0.buildMode==='bl_spike_trap'||s0.buildMode==='bl_sandbag')){
        wallDrag=true; wallLast=null; wallPlaced={};
        var wx0=pointerWorld(e).x, wy0=pointerWorld(e).y;
        wallFrom={x:Math.floor(wx0/CFG.GRID)*CFG.GRID,y:Math.floor(wy0/CFG.GRID)*CFG.GRID};
        wallLast=wallFrom;
        wallPlaced[wallFrom.x+','+wallFrom.y]=true;
        tryPlace(s0.buildMode, wx0, wy0);
      }
    });
    /* ADR-29 / ADR-28 右键 = 上下文微操与全局右键交互处理 */
    handleContextMenu = function(e){
      if(e.preventDefault) e.preventDefault();
      var s0=APH.state;
      if(s0.mode !== 'running') return false;

      var wx = pointerWorld(e).x;
      var wy = pointerWorld(e).y;
      var pickR = 40;

      /* 1. 退出规划工具模式 */
      if(s0.orderTool){
        s0.orderTool = null;
        APH.state.orderDrag = false;
        APH.UI.setHint('');
        APH.UI.floatText('退出规划模式', '#c5e3f6');
        if(APH.UI && APH.UI.renderOrdersRow) APH.UI.renderOrdersRow();
        return true;
      }

      /* 2. 远征场景：远古遗迹交互 (遗物箱、数据终端、能量闸门、信标优先) */
      if(s0.scene === 'expedition'){
        var interact=s0.entities.find(function(en){return en&&!en.dead&&((en.type===T.BUILDING&&['ancient_vault','ancient_terminal','ancient_gate'].indexOf(en.bid)>=0)||(en.type===T.BEACON&&!en.done))&&U.dst(en.x,en.y,wx,wy)<=45;});
        if(interact){
          var pawn=selectedPawnEnt()||expeditionPawns(s0).find(function(e){return !e.downed;});
          if(pawn){pawn.userOrder={type:'interact',entity:interact};s0.target=null;}
          s0.selectedTarget={type:interact.type===T.BEACON?'beacon':'building',entity:interact};
          return true;
        }
      }

      /* 2b. 倒地敌人的处置优先于发射台: 两者判定半径有重叠区(发射台 50 > 俘虏 42),
         发射台在前会把「倒地者躺在发射台旁」的俘虏点击吃成开面板, 该处危机就永远救不下来。
         已俘获的不再重复吃点击(否则重排后反而会吞掉发射台点击)。 */
      var hitDownEn=(s0.entities||[]).find(function(en){
        return en && en.type===T.ENEMY && !en.dead && !en.captured && (en.downed || (en.hp||1)<=0) && U.dst(en.x,en.y,wx,wy)<=42;
      });
      if(hitDownEn && APH.Res.capturePrisoner){
        APH.Res.capturePrisoner(s0.meta, hitDownEn);
        APH.UI.floatText('⛓ 已俘虏 '+ (hitDownEn.name||'袭击者') +'（可释放，非奴隶）', '#c5e3f6');
        return true;
      }

      /* 3. 检查是否右键发射台 / 返回舱 (出航/返航) */
      var hitPad = s0.entities.find(function(en){
        return en && en.type === T.BUILDING && (en.bid === 'bl_landing_pad' || en.pad) && U.dst(en.x, en.y, wx, wy) <= 50;
      });
      if(hitPad){
        if(s0.scene === 'home'){
          APH.ExpeditionUI.open(s0);
        } else if(s0.scene === 'expedition'){
          returnHome();
        }
        return true;
      }
      var hitCorpse=(s0.entities||[]).find(function(en){
        return en && en.type==='corpse' && !en.dead && U.dst(en.x,en.y,wx,wy)<=40;
      });
      if(hitCorpse && APH.Res.buryCorpse){
        APH.Res.buryCorpse(hitCorpse);
        APH.UI.floatText('⚰ 已埋葬', '#b39dff');
        return true;
      }
      /* 4. 右键未完成蓝图 → 优先建造 (未征召; 征召点地仍走战术移动) */
      var hitBp = (s0.entities||[]).find(function(en){
        return en && en.type===T.BLUEPRINT && !en.dead && U.dst(en.x,en.y,wx,wy)<=48;
      });
      if(!hitBp && s0.colony && s0.colony.buildQueue){
        hitBp = (s0.colony.buildQueue||[]).find(function(q){ return q && U.dst(q.x,q.y,wx,wy)<=48; });
      }
      var squadNow = (s0.selectedPawns && s0.selectedPawns.length>0) ? s0.selectedPawns : (s0.selectedRid ? [selectedPawnEnt()].filter(Boolean) : []);
      var draftedNow = !!s0.playerDrafted || squadNow.some(function(p){ return p && p.drafted; });
      if(hitBp && s0.scene==='home' && !draftedNow){
        var bpx=hitBp.x, bpy=hitBp.y;
        if(squadNow.length){
          squadNow.forEach(function(p){
            if(p && (p.type==='player' || p.id==='player')) s0.playerOrder = { type:'build', x:bpx, y:bpy };
            else if(p) p.userOrder = { type:'build', x:bpx, y:bpy };
          });
        } else {
          s0.playerOrder = { type:'build', x:bpx, y:bpy };
        }
        APH.UI.floatText('→ 优先建造', '#ffc857');
        APH.state.parts.push({ t:'ping', x:bpx, y:bpy, life:0.8, max:0.8 });
        return true;
      }

      /* 4a. 右键居住舱 / 食物 (未征召也可优先作息) */
      var hitHouse = s0.entities.find(function(en){
        return en && en.type === T.BUILDING && (en.bid === 'bl_house' || en.id === 'bl_house') && !en.dead && U.dst(en.x, en.y, wx, wy) <= 48;
      });
      if(!hitHouse && s0.colony && s0.colony.buildings){
        var hb = s0.colony.buildings.find(function(b){ return b && b.id==='bl_house' && U.dst(b.x,b.y,wx,wy)<=48; });
        if(hb) hitHouse = hb;
      }
      var hitMeal = s0.entities.find(function(en){
        if(!en || en.dead) return false;
        if(en.type === T.DROPPED){
          var it = CFG.items && CFG.items[en.itemId];
          return it && it.store === 'food' && U.dst(en.x, en.y, wx, wy) <= 36;
        }
        if(en.type === T.BUILDING && (en.bid === 'bl_warehouse' || en.id === 'bl_warehouse') && U.dst(en.x, en.y, wx, wy) <= 48) return true;
        return false;
      });
      if(s0.scene==='home' && (hitHouse || hitMeal)){
        var kind = hitHouse ? 'sleep' : 'eat';
        var squad = (s0.selectedPawns && s0.selectedPawns.length > 0) ? s0.selectedPawns : (s0.selectedRid ? [selectedPawnEnt()].filter(Boolean) : []);
        if(squad.length){
          squad.forEach(function(p){
            if(p && (p.type==='player' || p.id==='player')) s0.playerOrder = { type: kind };
            else if(p) p.userOrder = { type: kind };
          });
        } else {
          s0.playerOrder = { type: kind };
        }
        APH.UI.floatText(kind==='sleep' ? '→ 优先休息' : '→ 优先进食', '#b39dff');
        APH.state.parts.push({ t:'ping', x: wx, y: wy, life: 0.8, max: 0.8 });
        return true;
      }

      /* 4. 救护倒地昏迷队友 */
      var hitDowned = s0.entities.find(function(en){
        return en && en.type === T.RESIDENT && !en.dead && en.downed && U.dst(en.x, en.y, wx, wy) <= 42;
      });
      if(hitDowned && s0.scene==='home'){
        var clinicB = (s0.colony && s0.colony.buildings || []).find(function(b){ return (b.id === 'bl_clinic' || b.bid === 'bl_clinic') && !b.dead; });
        if(clinicB){
          hitDowned.x = clinicB.x; hitDowned.y = clinicB.y;
          hitDowned.downed = false; hitDowned.medLying = true;
          var rDowned = APH.Res.residentOf(hitDowned);
          if(rDowned){
            rDowned.downed = false; rDowned.medLying = true;
          }
          APH.UI.floatText('✚ 已将伤员紧急送往医疗舱！', '#7dffab');
          updateInspectorNow();
          return true;
        }
      }

      /* 5. 战备编队或单兵微操 */
      var activeSquad = (s0.selectedPawns && s0.selectedPawns.length > 0) ? s0.selectedPawns : (s0.selectedRid ? [selectedPawnEnt()].filter(Boolean) : []);
      if(activeSquad.length > 0){
        /* 集火敌人 */
        var hitEnemy = s0.entities.find(function(en){
          return en && en.type === T.ENEMY && !en.dead && !en.isSoldier && U.dst(en.x, en.y, wx, wy) <= pickR;
        });
        if(hitEnemy){
          activeSquad.forEach(function(p){
            p.userOrder = { type: 'attack', enemy: hitEnemy };
            if(p.type === 'player' || p.id === 'player') s0.playerDrafted = true;
            else p.drafted = true;
          });
          APH.UI.floatText('✔ 全队集火目标！', '#ff4d4d');
          APH.state.parts.push({ t: 'ping', x: hitEnemy.x, y: hitEnemy.y, life: 0.8, max: 0.8 });
          updateCmdPanel();
          updateInspectorNow();
          return true;
        }

        /* 规划目标开采 */
        var hitFlora = s0.entities.find(function(en){
          return en && en.type === T.FLORA && !en.dead && U.dst(en.x, en.y, wx, wy) <= pickR;
        });
        if(hitFlora && (s0.scene==='expedition'||s0.designations && s0.designations[hitFlora.id])){
          activeSquad.forEach(function(p){
            p.userOrder = { type: 'gather', flora: hitFlora };
          });
          APH.UI.floatText('✔ 优先执行：开采目标', '#7dffab');
          APH.state.parts.push({ t: 'ping', x: hitFlora.x, y: hitFlora.y, life: 0.8, max: 0.8 });
          updateCmdPanel();
          updateInspectorNow();
          return true;
        }

        /* 掉落物搬运 */
        var hitDrop = s0.entities.find(function(en){
          return en && en.type === T.DROPPED && !en.dead && U.dst(en.x, en.y, wx, wy) <= 28;
        });
        if(hitDrop){
          activeSquad.forEach(function(p){
            p.userOrder = { type: 'haul', pile: hitDrop };
          });
          APH.UI.floatText('✔ 优先执行：搬运物资', '#7dffab');
          APH.state.parts.push({ t: 'ping', x: hitDrop.x, y: hitDrop.y, life: 0.8, max: 0.8 });
          updateCmdPanel();
          updateInspectorNow();
          return true;
        }

        tacticalMoveTo(wx, wy);
        return true;
      }
      if(s0.playerDrafted){
        tacticalMoveTo(wx, wy);
        return true;
      }
      if(s0.selectedTarget && s0.selectedTarget.type !== 'player'){
        s0.selectedTarget = { type: 'player' };
        s0.selectedPawns = [];
        updateInspectorNow();
      }
      return false;
    }
    onPointer('POINTER_CONTEXT', handleContextMenu);
    onPointer('POINTER_MOVE', function(e){
      downMoved+=Math.abs(e.clientX-downX)+Math.abs(e.clientY-downY);
      downX=e.clientX; downY=e.clientY;
      APH.state.pointerWx = pointerWorld(e).x;
      APH.state.pointerWy = pointerWorld(e).y;
      if(APH.state.orderDrag){
        APH.state.orderTo = { x: pointerWorld(e).x, y: pointerWorld(e).y };
      }
      if(APH.state.pawnDrag){
        APH.state.pawnDragEnd = { x: pointerWorld(e).x, y: pointerWorld(e).y };
      }
      /* T2 拖拽续铺: 从上一格到当前格增量线段(防从起点重算的幻影格+重试刷屏) */
      if(wallDrag && APH.state.buildMode && APH.state.scene==='home'){
        var s0=APH.state;
        var wx0=pointerWorld(e).x, wy0=pointerWorld(e).y;
        var cur={x:Math.floor(wx0/CFG.GRID)*CFG.GRID,y:Math.floor(wy0/CFG.GRID)*CFG.GRID};
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
    onPointer('POINTER_UP', function(e){
      wallDrag=false; wallFrom=null; wallLast=null; wallPlaced={};
      if(e.button===2) return;   /* 右键已在 contextmenu 处理 */
      if(APH.state.pawnDrag){
        APH.state.pawnDrag = false;
        var dDistP = Math.abs(APH.state.pawnDragEnd.x - APH.state.pawnDragStart.x) + Math.abs(APH.state.pawnDragEnd.y - APH.state.pawnDragStart.y);
        if(dDistP >= 18){
          var s0 = APH.state;
          var boxed = APH.Colony.boxSelectEntities(s0.entities, APH.state.pawnDragStart.x, APH.state.pawnDragStart.y, APH.state.pawnDragEnd.x, APH.state.pawnDragEnd.y);
          var pawns = boxed.filter(function(en){ return en && !en.dead && en.type === T.RESIDENT; });
          var minX = Math.min(APH.state.pawnDragStart.x, APH.state.pawnDragEnd.x), maxX = Math.max(APH.state.pawnDragStart.x, APH.state.pawnDragEnd.x);
          var minY = Math.min(APH.state.pawnDragStart.y, APH.state.pawnDragEnd.y), maxY = Math.max(APH.state.pawnDragStart.y, APH.state.pawnDragEnd.y);
          /* ADR-45: 框选只收居民。没有主角可塞进编队。 */
          if(pawns.length > 0){
            s0.selectedPawns = pawns;
            var first = pawns[0];
            if(first.type === 'player' || first.id === 'player'){
              s0.selectedTarget = { type: 'player' };
              deselectPawn();
            } else {
              selectPawn(first.rid || first.id);
            }
            APH.UI.floatText('✔ 编队已选中 ' + pawns.length + ' 名成员 (按 R 键战备征召)', '#59d9ff');
            updateInspectorNow();
            if(APH.UI && APH.UI.renderColonistBar) APH.UI.renderColonistBar();
            return;
          }
        }
      }
      if(APH.state.orderDrag){
        APH.state.orderDrag = false;
        var s0 = APH.state;
        s0.designations = s0.designations || {};
        var tool = s0.orderTool;
        if(tool==='stockpile' || tool==='grow' || tool==='clean' || tool==='extinguish' || tool==='restrict' || (tool==='cancel' && APH.Colony.eraseZoneCells)){
          s0.colony.zones = s0.colony.zones || [];
          var zCells = APH.Colony.cellsFromBox(APH.state.orderFrom.x, APH.state.orderFrom.y, APH.state.orderTo.x, APH.state.orderTo.y);
          if(tool==='stockpile'){
            var added = APH.Colony.addStockpileZone(s0.colony.zones, zCells);
            s0.colony.zones = added.zones;
            s0.selectedTarget = { type:'zone', zone: added.zone };
            APH.UI.floatText('✔ 仓储区 '+zCells.length+' 格', '#ffc857');
          } else if(tool==='grow'){
            var grown = APH.Colony.addGrowZone(s0.colony.zones, zCells, null, s0.colony.scene);
            s0.colony.zones = grown.zones;
            s0.selectedTarget = { type:'zone', zone: grown.zone };
            APH.UI.floatText('✔ 种植区 '+zCells.length+' 格', '#7dffab');
          } else if(tool==='clean'){
            s0.colony.filth = APH.Colony.cleanCells(s0.colony.filth||{}, zCells, 40);
            APH.UI.floatText('✔ 清扫', '#c8e89a');
          } else if(tool==='extinguish'){
            s0.colony.fires = APH.Colony.douseFires(s0.colony.fires||[], zCells);
            APH.UI.floatText('✔ 灭火', '#59d9ff');
          } else if(tool==='restrict'){
            var area = APH.Colony.addRestrictZone(s0.colony.zones, zCells);
            s0.colony.zones = area.zones;
            s0.selectedTarget = { type:'zone', zone: area.zone };
            APH.UI.floatText('✔ 活动区 '+zCells.length+' 格', '#8fd4ff');
          } else {
            s0.colony.zones = APH.Colony.eraseZoneCells(s0.colony.zones, zCells);
            APH.UI.floatText('✔ 已擦除划区', '#ff9a9a');
          }
          saveColony();
          updateInspectorNow();
          return;
        }
        var dDist = Math.abs(APH.state.orderTo.x - APH.state.orderFrom.x) + Math.abs(APH.state.orderTo.y - APH.state.orderFrom.y);
        var changed = 0;
        if(dDist < 14){
          var pickR = 34;
          var hit = s0.entities.find(function(en){
            return en && !en.dead && U.dst(en.x, en.y, APH.state.orderTo.x, APH.state.orderTo.y) <= pickR;
          });
          if(hit && APH.Colony.applyDesignation(s0.designations, hit, tool)){
            changed++;
          }
        } else {
          var boxed = APH.Colony.boxSelectEntities(s0.entities, APH.state.orderFrom.x, APH.state.orderFrom.y, APH.state.orderTo.x, APH.state.orderTo.y);
          boxed.forEach(function(be){
            if(APH.Colony.applyDesignation(s0.designations, be, tool)) changed++;
          });
        }
        if(changed > 0){
          var msg = tool === 'cancel' ? ('✔ 已清除 ' + changed + ' 处规划标记') : ('✔ 已规划 ' + changed + ' 处目标');
          APH.UI.floatText(msg, tool === 'cancel' ? '#ff9a9a' : '#59d9ff');
        }
        updateInspectorNow();
        return;
      }
      if(performance.now()-downT<450 && downMoved<12 && APH.state.mode==='running'){
        /* 建造模式: 点地放置(墙/闸门已在 pointerdown 铺设, 防重复) */
        if(s.scene==='home'&&s.buildMode&&s.buildMode!=='bl_wall'&&s.buildMode!=='bl_gate'&&s.buildMode!=='bl_spike_trap'&&s.buildMode!=='bl_sandbag'){
          var wx=pointerWorld(e).x, wy=pointerWorld(e).y;
          tryPlace(s.buildMode,wx,wy);
          return;
        }
        var t={x:pointerWorld(e).x, y:pointerWorld(e).y};
        /* ADR-28 / Ticket #156: 检查器目标选择与征召交互 */
        if(!s.buildMode){
          var cmd=(CFG&&CFG.command)||{};
          var pickR=(cmd.pickR!=null)?cmd.pickR:34;

          /* 1. 优先检查是否点击了指挥官(自己) */
          if(APH.Ent.findPlayer() && U.dst(s.px, s.py, t.x, t.y) <= pickR){
            s.selectedTarget = { type: 'player' };
            deselectPawn();
            updateInspectorNow();
            return;
          }

          /* 2. 检查是否点击了居民 */
          var hitRes=s.entities.find(function(en){
            return en && en.type===T.RESIDENT && !en.dead && U.dst(en.x,en.y,t.x,t.y)<=pickR;
          });
          if(hitRes){
            s.selectedTarget = { type: 'resident', entity: hitRes };
            if(s.selectedRid===(hitRes.rid||hitRes.id)){ deselectPawn(); }   /* 再点同一位=解除 */
            else selectPawn(hitRes.rid||hitRes.id);
            updateInspectorNow();
            return;
          }

          /* ADR-47: 点人型袭击者只检查，不征召 */
          var hitHostile=(s.entities||[]).find(function(en){
            return en && !en.dead && APH.Res && APH.Res.isHumanlike && APH.Res.isHumanlike(en) && U.dst(en.x,en.y,t.x,t.y)<=pickR;
          });
          if(hitHostile){
            s.selectedTarget = { type: 'enemy', entity: hitHostile };
            updateInspectorNow();
            return;
          }

          /* 3. 选中且已征召的居民：点地走路（无右键） */
          if(s.selectedRid){
            var selEnt = selectedPawnEnt();
            if(selEnt && selEnt.drafted){ orderMove(t); return; }
          }

          /* 4. 检查是否点击了自然实体 (树木/矿石) */
          var hitFlora=s.entities.find(function(en){
            return en && en.type===T.FLORA && !en.dead && U.dst(en.x,en.y,t.x,t.y)<=pickR;
          });
          if(hitFlora){
            s.selectedTarget = { type: 'flora', entity: hitFlora };
            updateInspectorNow();
            return;
          }

          /* 5. 检查是否点击了建筑 */
          var hitBld=s.entities.find(function(en){
            return en && (en.type===T.BUILDING||en.type===T.BLUEPRINT) && !en.dead && APH.Ent.hitBuilding(en,t.x,t.y);
          });
          if(hitBld){
            s.selectedTarget = { type: 'building', entity: hitBld };
            updateInspectorNow();
            return;
          }

          /* 6. 检查是否点击了掉落物堆 */
          var hitDrop=s.entities.find(function(en){
            return en && en.type===T.DROPPED && !en.dead && U.dst(en.x,en.y,t.x,t.y)<=28;
          });
          if(hitDrop){
            s.selectedTarget = { type: 'dropped', entity: hitDrop };
            updateInspectorNow();
            return;
          }

          /* 7. 仓储划区 */
          var hitZone=null;
          var zg=CFG.GRID||48;
          var zx=Math.round(t.x/zg)*zg, zy=Math.round(t.y/zg)*zg;
          ((s.colony && s.colony.zones)||[]).forEach(function(z){
            if(hitZone || !z || (z.type!=='stockpile' && z.type!=='grow')) return;
            (z.cells||[]).forEach(function(c){
              if(c.x===zx && c.y===zy) hitZone=z;
            });
          });
          if(hitZone){
            s.selectedTarget = { type:'zone', zone: hitZone };
            updateInspectorNow();
            return;
          }

          /* 8. 空地：征召后点地走路（笔记本无右键）；未征召只看地形 */
          var draftedHere = !!s.playerDrafted || (s.selectedPawns||[]).some(function(p){ return p && p.drafted; });
          if(draftedHere){
            tacticalMoveTo(t.x, t.y);
            return;
          }
          s.selectedTarget = { type: 'terrain', x: t.x, y: t.y };
          updateInspectorNow();
          return;
        }
        if(s.scene === 'expedition' && s.playerDrafted){
          APH.state.target=t;
          APH.state.parts.push({t:'ping',x:t.x,y:t.y,life:.8,max:.8});
        }
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
    updateInspectorNow();
    if(APH.UI && APH.UI.renderColonistBar) APH.UI.renderColonistBar();
    APH.state.meta.stats.landings++;
    APH.Save.saveMeta(APH.state.meta);
  }

  /* ADR-42: 生产跳完成后的两件杂事 —— 它们要么依赖开场状态机(过客),
     要么纯属界面刷新(科技树), 都不该住在殖民地模拟里。 */
  U.on('productionTick', function(){ tryFirstNightVisitor(); });

  /* ADR-43: 名册变了(招募成功) → 世界侧补上/移除居民实体。
     实体池归 main 管, 所以订阅方是这里。 */
  U.on('rosterChanged', function(){ syncResidentEntities(); });


  /* ================= 事件订阅 (ADR-8 示范) ================= */
  U.on('built', onBuilt);          /* ADR-38: 建筑落成副作用 */
  /* ADR-38: 围攻扎营/撤营与战况存档 —— 世界侧操作归 main.js, combat 只广播 */
  U.on('raidBegan', function(ev){
    if(ev && ev.tactic === 'siege') setupSiegeCamp();
  });
  U.on('raidEnded', function(ev){
    clearSiegeCamp();
    if(ev && ev.routed === false) saveWar();
  });
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
  /* ADR-38: 建筑落成的副作用由 main.js 订阅事件处理, 取代 colony 的反向调用。 */
  function onBuilt(ev){
    var s = APH.state;
    saveColony();
    if(ev && ev.id === 'bl_house' && window.APH.Opening && APH.Opening.noteHouse){
      var fOpening = firstNightOpening();
      if(fOpening){
        APH.Opening.noteHouse(fOpening, s.clock || 0);
        applyFirstNightHint();
      }
      try{ if(APH.Save && APH.Save.saveMeta) APH.Save.saveMeta(s.meta); }catch(e){}
    }
  }

  function boot(){
    try{
      var meta=APH.Save.loadMeta();
      if(!meta.tech) meta.tech={};
      if(!meta.res) meta.res={mineral:0, food:0, leather:0};
      if(!meta.residents) meta.residents=[];   // P6 居民名册
      /* ADR-45: 全新存档播种开局班底 —— 没有主角, 得有人在场才能开始。 */
      APH.Res.seedStartingColonists(meta, (Date.now()%100000)|0);
      if(meta.residentSeq===undefined) meta.residentSeq=0;
      APH.state.meta=meta;
      APH.Colony.grantAssayKeyedTechs(meta);
      applyAllTech(meta);
      APH.state.war.wins=(meta.war&&meta.war.wins)||0;
      APH.state.war.raids=(meta.war&&meta.war.raids)||0;
      APH.state.colony=loadColony();
      // meta.res 已由 Save.loadMeta 从原子家园快照恢复。
      APH.state.clock=APH.state.colony.clock||0;APH.state.power=APH.state.colony.power||{};
      if(APH.state.colony.war)APH.state.war=APH.state.colony.war;          // 殖民地布局持久化
      APH.World.initCanvas();
      if(APH.BuildArt) APH.BuildArt.load();
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
        /* ADR-25/26 新建筑视觉资产 */
        bl_storage_shelf:{idle:1,baseline:223,h:192}, bl_heater:{idle:1,baseline:206,h:157},
        bl_cooler:{idle:1,baseline:223,h:175}, bl_heavy_turret:{idle:1,baseline:206,h:162},
        bl_ancient_generator:{idle:1,baseline:214,h:163}, bl_crop_plot:{idle:1,baseline:220,h:194},
        /* ADR-24 遗迹构件 */
        ancient_wall:{idle:1,baseline:212,h:175}, ancient_gate:{idle:1,baseline:222,h:177},
        ancient_terminal:{idle:1,baseline:227,h:187}, ancient_vault:{idle:1,baseline:232,h:198},
        /* ADR-26 机械哨兵 */
        enemy_automaton:{baseline:223,h:187},
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
          var screen=APH.Camera.toScreen(st,st.px,st.py,{w:vpW(),h:vpH()}),sx=Math.round(screen.x),sy=Math.round(screen.y);
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
      restoreWorldSession(APH.state);
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
      s.devFreeBuild = _q.indexOf('freebuild=1')>=0;
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
          s.clock=(CFG.DAY_LEN||3600)*0.75;   /* 强制夜间(照片验证照明) */
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
        launchExpedition({destination:{kind:'unknown',seed:CFG.expedition.debugDestinationSeed}});
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
    if(APH.UI && APH.UI.close && APH.UI.isOpen){
      ['techMap', 'codex', 'roster', 'diplomacy', 'trade', 'buildCatalog'].forEach(function(mId){
        if(mId !== keep && APH.UI.isOpen(mId)) APH.UI.close(mId);
      });
      return;
    }
    if(keep!=='techMap') hideOverlay('techMap');
    if(keep!=='codex') hideOverlay('codex');
    if(keep!=='resPanel') hideOverlay('resPanel');
    if(keep!=='diplomacy') hideOverlay('diplomacyOverlay');
    if(keep!=='buildRow') hideOverlay('buildRow');
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

  /* ================= Task6: 建造目录 (委托 APH.UI 深模块, ADR-18) ================= */
  function toggleBuildRow(force){
    if(APH.UI && APH.UI.toggle){
      if(force !== undefined) return force ? APH.UI.open('buildCatalog') : APH.UI.close('buildCatalog');
      return APH.UI.toggle('buildCatalog');
    }
  }
  function renderBuildRow(){
    if(APH.UI && APH.UI.renderBuildRow) return APH.UI.renderBuildRow();
  }

  /* ================= C: 游商交易面板 (委托 APH.UI 深模块, ADR-18) ================= */
  function currentTrader(){
    var s=APH.state;
    return (s && s.nearVisitor && s.nearVisitor.trade && !s.nearVisitor.dead) ? s.nearVisitor : null;
  }
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

  /* ================= U8 居民名册 (委托 APH.UI 深模块, ADR-18) ================= */
  function toggleResPanel(show){
    if(APH.UI && APH.UI.toggle){
      if(show !== undefined) return show ? APH.UI.open('roster') : APH.UI.close('roster');
      return APH.UI.toggle('roster');
    }
  }
  function renderResPanel(){
    if(APH.UI && APH.UI.renderResPanel) return APH.UI.renderResPanel();
  }
  function movePrioCursor(code){
    if(APH.UI && APH.UI.movePrioCursor) return APH.UI.movePrioCursor(code);
  }
  function setPrioAtCursor(v){
    if(APH.UI && APH.UI.setPrioAtCursor) return APH.UI.setPrioAtCursor(v);
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



  /* ADR-45: 把远征队员放到异星地表上。他们是普通的 RESIDENT 实体 ——
     选中、下令、征召那套指挥层原样适用, 不需要为远征另造一套操控。 */
  function spawnSquadEntities(x, y){
    var s = APH.state;
    var active=APH.ExpeditionState.active(s.colony);
    var ids = active&&Array.isArray(active.memberIds)?active.memberIds:[];
    var roster = s.meta.residents || [];
    ids.forEach(function(id, i){
      var r = roster.find(function(q){ return q.id === id; });
      if(!r) return;
      var ang = (i / Math.max(1, ids.length)) * U.TAU;
      s.entities.push({
        id:r.id, type:T.RESIDENT, rid:r.id, name:r.name,
        x: x + Math.cos(ang)*26, y: y + Math.sin(ang)*26,
        mood:r.mood, food:r.food, rest:r.rest, illness:r.illness||0,
        recreation:r.recreation, exposure:r.exposure,
        drafted:true,                 /* 出门在外默认战备 —— 荒原上不该自己去种田 */
        walking:false, face:Math.PI/2, walkPh:0, expedition:true,
      });
    });
  }


  /* ================= ADR-29 征召与直接命令 (环世界式) ================= */
  function selectedPawnEnt(){ return APH.Ent.selectedPawn(); }
  function selectPawn(rid){
    var s=APH.state;
    s.selectedRid=rid;
    var ent=selectedPawnEnt();
    if(ent) s.selectedTarget={ type:'resident', entity:ent };
    var r=ent?APH.Res.residentOf(ent):null;
    APH.UI.floatText('已选中 '+(r?r.name:'居民')+' · 左键点地下令, Esc 解除', '#59d9ff');
    updateCmdPanel();
    updateInspectorNow();
  }
  function deselectPawn(){
    var s=APH.state;
    var ent=selectedPawnEnt();
    if(ent) ent.userOrder=null;
    s.selectedRid=null;
    s.selectedTarget={ type:'player' };
    updateCmdPanel();
    updateInspectorNow();
  }
  function orderMove(t){
    var ent=selectedPawnEnt();
    if(!ent) return;
    ent.userOrder={type:'move', x:t.x, y:t.y};
    APH.state.parts.push({t:'ping',x:t.x,y:t.y,life:.8,max:.8});
    updateCmdPanel();
  }
  /* 征召后点地走路：笔记本无右键，左键空地同样下达 */
  function tacticalMoveTo(wx, wy){
    var s0 = APH.state;
    var squad = (s0.selectedPawns && s0.selectedPawns.length > 0) ? s0.selectedPawns : (s0.selectedRid ? [selectedPawnEnt()].filter(Boolean) : []);
    if(!squad.length && s0.scene==='expedition') squad=expeditionPawns(s0);
    if(!squad.length && s0.playerDrafted && APH.Ent.findPlayer()) squad = [APH.Ent.findPlayer()];
    if(!squad.length) return false;
    var N = squad.length, anyMoved = false;
    squad.forEach(function(p, idx){
      if(!p) return;
      var tx = wx + (idx - (N - 1) / 2) * 26, ty = wy;
      if(p.type === 'player' || p.id === 'player'){
        if(s0.playerDrafted){
          s0.target = { x: tx, y: ty };
          s0.parts.push({ t:'ping', x:tx, y:ty, life:0.8, max:0.8 });
          anyMoved = true;
        }
      } else if(p.drafted){
        p.userOrder = { type:'move', x:tx, y:ty };
        s0.parts.push({ t:'ping', x:tx, y:ty, life:0.8, max:0.8 });
        anyMoved = true;
      }
    });
    if(anyMoved && APH.UI && APH.UI.floatText) APH.UI.floatText('✔ 战术移动 (' + N + '人)', '#8fd4ff');
    else if(!anyMoved && APH.UI && APH.UI.floatText) APH.UI.floatText('未征召 · 先点征召再点地面走路', '#8fa3cc');
    updateCmdPanel();
    updateInspectorNow();
    return anyMoved;
  }
  /* 命令面板辅助: 按钮点击下各类令 (bindBuildUI 绑定, CMD_* 键盘等价路径也走这里) */
  function orderGather(){
    var s=APH.state, ent=selectedPawnEnt();
    if(!ent) return;
    var near=APH.Ent.findNearest(s.entities, T.FLORA, ent.x, ent.y, (CFG.gathering&&CFG.gathering.searchRadius)||800, function(fe){ return fe && !fe.dead; });
    if(!near){ APH.UI.floatText('附近没有可采集的资源','#ff9a9a'); return; }
    ent.userOrder={type:'gather', flora:near};
    APH.UI.floatText('→ 前去采集','#c8e89a');
    updateCmdPanel();
  }
  function orderHaul(){
    var s=APH.state, ent=selectedPawnEnt();
    if(!ent) return;
    var H=CFG.haul||{};
    var seekR=H.seekR!=null?H.seekR:1200;
    var drop=APH.ResidentWork.nearestDrop(ent, seekR);
    if(!drop){ APH.UI.floatText('附近没有可搬运的物资','#ff9a9a'); return; }
    ent.userOrder={type:'haul', pile:drop};
    APH.UI.floatText('→ 前去搬运','#8fd4ff');
    updateCmdPanel();
  }
  function orderSleep(){
    var ent=selectedPawnEnt();
    if(!ent) return;
    ent.userOrder={type:'sleep'};
    updateCmdPanel();
  }
  function orderEat(){
    var ent=selectedPawnEnt();
    if(!ent) return;
    ent.userOrder={type:'eat'};
    updateCmdPanel();
  }
  function updateCmdPanel(){
    var panel=document.getElementById('cmdPanel');
    if(!panel) return;
    var s=APH.state;
    var ent=selectedPawnEnt();
    if(!s.selectedRid || !ent || s.scene!=='home'){
      panel.style.display='none';
      return;
    }
    var r=APH.Res.residentOf(ent);
    var orderTxt='待命中';
    if(ent.userOrder){
      var ot=ent.userOrder.type;
      orderTxt= ot==='move'?'移动中': ot==='gather'?'采集中': ot==='haul'?'搬运中': ot==='sleep'?'前往休息': ot==='eat'?'前往进食': '待命中';
    }else if(ent.job){
      orderTxt='岗位: '+ent.job;
    }
    panel.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px">'+
      '<span style="color:#59d9ff;font-weight:700">⦿ '+(r?r.name:'居民')+'</span>'+
      '<span style="color:#8fa3cc;font-size:11px">'+orderTxt+'</span>'+
      '<span style="flex:1"></span>'+
      '<button data-cmd="gather" style="'+CMD_BTN_CSS+'">⛏ 采集</button>'+
      '<button data-cmd="haul" style="'+CMD_BTN_CSS+'">📦 搬运</button>'+
      '<button data-cmd="sleep" style="'+CMD_BTN_CSS+'">🛏 休息</button>'+
      '<button data-cmd="eat" style="'+CMD_BTN_CSS+'">🍽 吃饭</button>'+
      '<button data-cmd="dismiss" style="'+CMD_BTN_CSS+'color:#ff9a9a">✕ 解除</button>'+
      '</div>';
    panel.style.display='block';
  }
  function selectedZone(){
    var t=APH.state.selectedTarget;
    return (t && t.type==='zone' && t.zone) ? t.zone : null;
  }
  function cycleZoneFilter(){
    var z=selectedZone();
    if(!z || !APH.Colony.cycleStorageFilter) return;
    var next=APH.Colony.cycleStorageFilter(z);
    if(APH.UI&&APH.UI.floatText) APH.UI.floatText('仓储过滤 → '+(next&&next.name||z.filter), '#ffc857');
    updateInspectorNow(); saveColony();
  }
  function releasePrisoner(id){
    if(APH.Res.releasePrisoner) APH.Res.releasePrisoner(APH.state.meta, id);
    if(APH.UI&&APH.UI.floatText) APH.UI.floatText('已释放俘虏', '#8fd4ff');
    updateInspectorNow();
  }
  function assignRestrict(){
    var z=selectedZone();
    if(!z || z.type!=='restrict') return;
    var s=APH.state;
    if(s.selectedRid){
      var r=(s.meta.residents||[]).filter(function(x){ return x.id===s.selectedRid; })[0];
      if(r) r.restrictId=z.id;
    } else {
      s.meta.playerRestrictId=z.id;
    }
    if(APH.UI&&APH.UI.floatText) APH.UI.floatText('✔ 已限制活动区', '#8fd4ff');
    updateInspectorNow(); saveColony();
  }
  function cycleGrowCrop(){
    var z=selectedZone();
    if(!z || z.type!=='grow' || !APH.Colony.cycleGrowCrop) return;
    var id=APH.Colony.cycleGrowCrop(z);
    var nm=(APH.Colony.ALIEN_CROPS&&APH.Colony.ALIEN_CROPS[id]&&APH.Colony.ALIEN_CROPS[id].name)||id;
    if(APH.UI&&APH.UI.floatText) APH.UI.floatText('种植 → '+nm, '#7dffab');
    updateInspectorNow(); saveColony();
  }
  function toggleZoneForbid(cat){
    var z=selectedZone();
    if(!z) return;
    z.forbid = z.forbid || [];
    var i=z.forbid.indexOf(cat);
    if(i>=0) z.forbid.splice(i,1);
    else z.forbid.push(cat);
    if(APH.UI&&APH.UI.floatText) APH.UI.floatText(i>=0?'允许 '+cat:'禁止 '+cat, '#ff9a9a');
    updateInspectorNow(); saveColony();
  }
  function addBuildingBill(recipe, n){
    var s=APH.state;
    if(!s || !s.selectedTarget || s.selectedTarget.type!=='building') return false;
    var ent=s.selectedTarget.entity||s.selectedTarget;
    var rec=buildingRecordOf(ent);
    if(!rec){
      rec={ id:ent.bid||ent.id, x:ent.x, y:ent.y, lv:ent.lv||1, bills:[] };
      s.colony.buildings.push(rec);
    }
    if(!APH.Colony || !APH.Colony.addBill) return false;
    APH.Colony.addBill(rec, recipe, n||4);
    ent.bills=rec.bills;
    updateInspectorNow();
    if(APH.UI&&APH.UI.floatText) APH.UI.floatText('✔ 已加工单','#ffc857');
    return true;
  }
  function cycleSchedule(hour){
    var s=APH.state;
    if(!s || !s.meta || !APH.Res) return;
    hour = hour|0;
    if(hour<0 || hour>23) return;
    var tgt=s.selectedTarget;
    if(!tgt || tgt.type==='player'){
      s.meta.playerSchedule=APH.Res.ensureSchedule(s.meta.playerSchedule);
      s.meta.playerSchedule[hour]=APH.Res.cycleScheduleSlot(s.meta.playerSchedule[hour]);
    }else if(tgt.type==='resident'){
      var ent=tgt.entity||tgt;
      var rid=ent.rid||ent.id;
      var r=(s.meta.residents||[]).filter(function(x){ return x.id===rid; })[0];
      if(!r) return;
      r.schedule=APH.Res.ensureSchedule(r.schedule);
      r.schedule[hour]=APH.Res.cycleScheduleSlot(r.schedule[hour]);
    }
    updateInspectorNow();
  }
  function setInspTab(tab){
    APH.state.inspTab = tab || 'needs';
    updateInspectorNow();
  }
  /* 征召仍然存在 —— 环世界里征召的是殖民者。删掉的是「征召指挥官」那半边。 */
  function equipSelected(itemId){
    var s=APH.state,e=selectedPawnEnt(),r=e&&APH.Res.residentOf(e),it=CFG.items[itemId];
    if(s.scene!=='home'||!e||!r||r.downed||!it||!it.slot)return false;
    var pile=APH.Ent.findNearest(s.entities,T.DROPPED,e.x,e.y,Infinity,function(p){
      return p.itemId===itemId&&APH.ResidentWork.freeDropCount(s,p)>0;
    });
    if(!pile){APH.UI.floatText('没有可用的 '+it.name,'#ffc857');return false;}
    e.drafted=false;e.userOrder={type:'equip',pile:pile};e.workReason='前往取用 '+it.name;
    return true;
  }
  function toggleSelectedDraft(){
    var ent = selectedPawnEnt && selectedPawnEnt();
    if(ent && (ent.type==='resident' || ent.type===T.RESIDENT)){
      ent.drafted = !ent.drafted;
    }
    if(APH.UI && APH.UI.renderColonistBar) APH.UI.renderColonistBar();
    updateInspectorNow();
  }
  function updateInspectorNow(){
    var insp=document.getElementById('inspector');
    var s=APH.state;
    if(insp){
      if(s.mode==='running' && s.scene==='home' && APH.UI && APH.UI.inspectorHtml){
        insp.style.display='block';
        insp.innerHTML=APH.UI.inspectorHtml(s.selectedTarget||{type:'player'}, s);
      } else {
        insp.style.display='none';
      }
    }
  }
  var CMD_BTN_CSS='background:rgba(89,217,255,.10);border:1px solid rgba(89,217,255,.45);color:#bfe8ff;padding:5px 12px;border-radius:14px;font-size:12px;cursor:pointer;white-space:nowrap';

  /* #206: 居民世界侧接线已独立成 APH.ResidentWork（帧循环/场景测试都按旧名调）。 */
  function updateResidents(dt){ return APH.ResidentWork.update(APH.state, dt); }
  function syncResidentEntities(){ return APH.ResidentWork.syncResidentEntities(); }
  function tryResidentJoy(e, r, dt, spdMul, navGrid){ return APH.ResidentWork.tryResidentJoy(e, r, dt, spdMul, navGrid); }

  /* ADR-43: 过客拜访/请客/招募已独立成 APH.Visitors。保留旧名转发。 */
  function visitorCount(){ return APH.Visitors.count(); }
  function nearestVisitor(s){ return APH.Visitors.nearest(s); }
  function nearestResident(s){ return APH.Visitors.nearestResident(s); }
  function spawnVisitor(at, over){ return APH.Visitors.spawn(at, over); }
  function firstNightOpening(){ return APH.Visitors.firstNightOpening(); }
  function applyFirstNightHint(){ return APH.Visitors.applyFirstNightHint(); }
  function tryFirstNightVisitor(){ return APH.Visitors.tryFirstNight(); }
  function maybeSpawnVisitor(force){ return APH.Visitors.maybeSpawn(force); }
  function tryOfferMealToResident(ent){ return APH.Visitors.offerMealToResident(ent); }
  function tryOfferMeal(ent){ return APH.Visitors.offerMeal(ent); }
  function tryRecruit(ent, rng){ return APH.Visitors.tryRecruit(ent, rng); }
  function updateVisitors(dt){ return APH.Visitors.update(dt); }
  function makeRecruitCtx(vis){ return APH.Res.recruitCtx(vis); }

  /* ================= P6 居民系统 ================= */
  function extraRes(){
    return (APH.Colony.groundTally && APH.Colony.groundTally(APH.state.entities)) || {};
  }
  /* ADR-39: 已下沉到 APH.Colony(仓 + 地上堆)。 */
  function haveStock(key){ return APH.Colony.haveStock(key); }
  function panelStock(key){
    var s=APH.state, w=(s.meta.res&&s.meta.res[key])||0;
    var g=APH.Colony.groundCount ? APH.Colony.groundCount(s.entities, key) : 0;
    return g>0 ? (w+' · 地'+g) : String(w);
  }
  function housingCap(){
    return APH.Colony.housingCapacity(APH.state.colony.buildings,APH.state.colony);
  }
  /* ADR-37: 念头上下文已收口到 APH.Res —— 这里只做转发, 不再自留一份。 */
  function thoughtCtxAt(x, y, env){
    return (APH.Res && APH.Res.thoughtCtxAt) ? APH.Res.thoughtCtxAt(x, y, env) : {};
  }

  /* 殖民地覆灭: 有过居民再归零 —— 这是本作第一个「会输」的状态。
     在此之前殖民地不可能失败, 于是威胁阶梯只是烟花(见 docs/colony-first-redesign.md)。 */
  /* ADR-42: 30 秒生产跳与殖民地覆灭判定已独立成 APH.ColonyTick。
     以下保留旧名转发(测试与 APH.Main 导出都在用)。 */
  function colonyFounded(m){ return APH.ColonyTick.founded(m); }
  function checkColonyFall(){ return APH.ColonyTick.checkFall(); }
  function residentsTick(){ return APH.ColonyTick.run(APH.state); }
  function saveMetaQuiet(){ APH.Save.metaQuiet(); }
  function bindBuildUI(){
    /* ADR-28 底部主标签栏事件绑定 */
    var to = document.getElementById('tabOrders');
    if(to) to.addEventListener('click', function(){ if(APH.UI && APH.UI.toggle) APH.UI.toggle('orders'); });
    var tb = document.getElementById('tabBuild');
    if(tb) tb.addEventListener('click', function(){ toggleBuildRow(); });
    var tw = document.getElementById('tabWork');
    if(tw) tw.addEventListener('click', function(){ if(APH.UI && APH.UI.toggle) APH.UI.toggle('roster'); });
    var tt = document.getElementById('tabTech');
    if(tt) tt.addEventListener('click', function(){ if(APH.UI && APH.UI.toggle) APH.UI.toggle('techMap'); });
    var td = document.getElementById('tabDiplo');
    if(td) td.addEventListener('click', function(){ if(APH.UI && APH.UI.toggle) APH.UI.toggle('diplomacy'); });

    /* ADR-28 规划工具箱事件绑定 */
    var ordersRow = document.getElementById('ordersRow');
    if(ordersRow){
      ordersRow.addEventListener('click', function(ev){
        var btn = ev.target.closest('[data-order-tool]');
        if(!btn) return;
        var toolId = btn.getAttribute('data-order-tool');
        var s = APH.state;
        s.orderTool = (s.orderTool === toolId) ? null : toolId;
        if(s.orderTool){
          var toolNames = { chop:'🪓 砍伐', mine:'⛏ 开采', haul:'✋ 搬运', deconstruct:'🔨 拆除', stockpile:'📦 仓储', grow:'🌱 种植', clean:'🧹 清扫', extinguish:'💧 灭火', restrict:'🚧 活动区', hunt:'🎯 打猎', cancel:'✕ 取消' };
          APH.UI.setHint('[' + (toolNames[s.orderTool]||s.orderTool) + ' 模式] 鼠标在地图上单点或拉框圈选 · 右键/Esc 退出');
        } else {
          APH.UI.setHint('');
        }
        if(APH.UI && APH.UI.renderOrdersRow) APH.UI.renderOrdersRow();
      });
    }

    /* ADR-29 顶部殖民者头像条点击与双击聚焦绑定 */
    var cb = document.getElementById('colonistBar');
    if(cb){
      var lastCardT = 0, lastCardId = null;
      cb.addEventListener('click', function(ev){
        var card = ev.target.closest('[data-pawn-id]');
        if(!card) return;
        var pid = card.getAttribute('data-pawn-id');
        var now = performance.now();
        var s = APH.state;
        var isDbl = (now - lastCardT < 400 && lastCardId === pid);
        lastCardT = now;
        lastCardId = pid;

        if(pid === 'player'){
          s.selectedTarget = { type: 'player' };
          deselectPawn();
          updateInspectorNow();
          if(isDbl && s.px != null) centerCameraOn(s.px, s.py);
        } else {
          selectPawn(pid);
          var ent = selectedPawnEnt();
          if(isDbl && ent) centerCameraOn(ent.x, ent.y);
        }
        if(APH.UI && APH.UI.renderColonistBar) APH.UI.renderColonistBar();
      });
    }

    /* 兼容老圆钮(若存在) */
    var btn=document.getElementById('buildBtn');
    if(btn) btn.addEventListener('click',function(){ toggleBuildRow(); });
    var rb=document.getElementById('rosterBtn');
    if(rb) rb.addEventListener('click',function(){ if(APH.UI&&APH.UI.toggle) APH.UI.toggle('roster'); });
    /* ADR-29 征召命令面板: 按钮下发各类令 */
    var cp=document.getElementById('cmdPanel');
    if(cp){
      cp.addEventListener('click',function(ev){
        var b=ev.target.closest('[data-cmd]');
        if(!b) return;
        var cmd=b.getAttribute('data-cmd');
        if(cmd==='gather') orderGather();
        else if(cmd==='haul') orderHaul();
        else if(cmd==='sleep') orderSleep();
        else if(cmd==='eat') orderEat();
        else if(cmd==='dismiss') deselectPawn();
      });
    }
    /* ADR-28 RimWorld 式命令表：点击格子切换优先级 (0→1→2→3→0) */
    var resBody = document.getElementById('resBody');
    if(resBody){
      resBody.addEventListener('click',function(ev){
        var td = ev.target.closest('[data-prio-r]');
        if(!td) return;
        var rid = td.getAttribute('data-prio-r');
        var colKey = td.getAttribute('data-prio-c');
        var s = APH.state, m = s.meta;
        if(!m || !m.residents) return;
        if(rid === 'player'){
          /* 玩家优先级 */
          m.playerPrio = m.playerPrio || {};
          var curP = m.playerPrio[colKey] != null ? m.playerPrio[colKey] : 2;
          var nextP = (curP + 1) % 4;
          m.playerPrio[colKey] = nextP;
          saveMetaQuiet();
          var colNameP = colKey === 'sk_gather' ? '采集' : (colKey === 'sk_haul' ? '搬运' : (APH.Res.SKILL_NAMES[colKey]||colKey));
          var labelP = nextP === 0 ? '✕ 禁止' : nextP;
          APH.UI.floatText('指挥官 · ' + colNameP + ' → ' + labelP, '#59d9ff');
          renderResPanel();
          return;
        }
        var r = m.residents.find(function(x){ return x.id === rid; });
        if(!r) return;
        m.workPrio = m.workPrio || {};
        if(!m.workPrio[rid] && APH.Res && APH.Res.defaultPrio) m.workPrio[rid] = APH.Res.defaultPrio(r);
        var cur = m.workPrio[rid][colKey] != null ? m.workPrio[rid][colKey] : 2;
        var next = (cur + 1) % 4;  /* 0→1→2→3→0 */
        m.workPrio[rid][colKey] = next;
        r.jobLocked = false;
        saveMetaQuiet();
        var colName = colKey === 'sk_gather' ? '采集' : (colKey === 'sk_haul' ? '搬运' : (APH.Res.SKILL_NAMES[colKey]||colKey));
        var label = next === 0 ? '✕ 禁止' : next;
        APH.UI.floatText(r.name + ' · ' + colName + ' → ' + label, '#8fd4ff');
        renderResPanel();
      });
    }
  }
  /* (D) 旧 autoAssign 已被 Colony.assignByPriority 取代 */
  
  
  /* ADR-39: 把面板按钮要用的命令交给 APH.UI 的命令表。
     视图从此只知道命令名, 不知道 main 存在。加载期注册, 不放进 boot() ——
     面板在 boot 之前也可能被渲染。 */
  APH.UI.registerCommands({
    beginExpedition:function(options){return launchExpedition(options);},
    switchWorld:switchWorld,returnExpedition:returnHome,
    setInspTab:setInspTab,
    toggleSelectedDraft:toggleSelectedDraft,
    cancelConstruction:cancelSelectedConstruction,
    repairWreckage:repairSelectedWreckage,
    equipSelected:equipSelected,
    callRescue:launchRescue,          /* ADR-45: 终局出口从「按 E」变成发射器的命令 */
    cycleSchedule:cycleSchedule,
    addBuildingBill:addBuildingBill,
    releasePrisoner:releasePrisoner,
    assignRestrict:assignRestrict,
    cycleGrowCrop:cycleGrowCrop,
    cycleZoneFilter:cycleZoneFilter,
    toggleZoneForbid:toggleZoneForbid,
  });

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
    /* ADR-45: 没有主角就没有「按 E 交互」。这条自动化通道只剩场景切换,
       因为出发/返航现在是殖民地级动作(派队/召回), 不再是走到发射台按键。 */
    debugPressE:function(){
      var s=APH.state;
      if(s.scene==='home') launchExpedition({destination:{kind:'unknown',seed:CFG.expedition.debugDestinationSeed}});
      else returnHome();
    },
    guardTrim:guardTrim,
    applyTech:applyTech,
    setupSiegeCamp:setupSiegeCamp,
    siegeTick:siegeTick,
    clearSiegeCamp:clearSiegeCamp,
    saveWar:saveWar,
    firstNightOpening:firstNightOpening,
    applyFirstNightHint:applyFirstNightHint,
    loadRivals:loadRivals,
    saveRivals:saveRivals,
    saveMetaQuiet:saveMetaQuiet,
    saveColony:saveColony,
    tryPlace:tryPlace,cancelConstruction:cancelConstruction,cancelSelectedConstruction:cancelSelectedConstruction,repairWreckage:repairSelectedWreckage,
    centerCameraOn:centerCameraOn,
    playerDefPower:playerDefPower,
    haveStock:haveStock,
    toggleCodex:toggleCodex,
    toggleTechMap:toggleTechMap,
    renderTechMap:renderTechMap,
    tryBuySelectedTech:tryBuySelectedTech,
    renderCodex:renderCodex,
    renderResPanel:renderResPanel,
    residentsTick:residentsTick, checkColonyFall:checkColonyFall, colonyFounded:colonyFounded,
    launchRescue:launchRescue,
    syncResidents:syncResidentEntities,
    updateResidents:updateResidents,
    residentJoyStep:tryResidentJoy,
    /* ADR-29 征召与直接命令 (场景测试/程序化验证通道) */
    cmd:{
      select:function(eOrRid){
        if(typeof eOrRid==='string') selectPawn(eOrRid);
        else if(eOrRid) selectPawn(eOrRid.rid||eOrRid.id);
        return APH.state.selectedRid||null;
      },
      deselect:deselectPawn,
      selectedRid:function(){ return APH.state.selectedRid||null; },
      selectedEnt:selectedPawnEnt,
      orderMove:orderMove,
      tacticalMoveTo:tacticalMoveTo,
      orderGather:orderGather,
      orderHaul:orderHaul,
      orderSleep:orderSleep,
      orderEat:orderEat,
      draft:function(ent, flag){
        if(!ent) return false;
        ent.drafted = flag !== undefined ? !!flag : !ent.drafted;
        return ent.drafted;
      },
      isDrafted:function(ent){
        return !!(ent && ent.drafted);
      },
      rightClick:function(wx, wy){
        var s = APH.state;
        var screen=APH.Camera.toScreen(s,wx,wy,{w:vpW(),h:vpH()});
        var clientX=screen.x,clientY=screen.y;
        var ev = { clientX: clientX, clientY: clientY, preventDefault: function(){} };
        return handleContextMenu(ev);
      },
      prioritize:function(ent, targetEntity){
        if(!ent || !targetEntity) return false;
        var T = (window.APH && window.APH.CFG && window.APH.CFG.entType) || {};
        if(targetEntity.type === T.FLORA){
          ent.userOrder = { type: 'gather', flora: targetEntity };
          return true;
        }
        if(targetEntity.type === T.DROPPED){
          ent.userOrder = { type: 'haul', pile: targetEntity };
          return true;
        }
        if(targetEntity.x != null && targetEntity.y != null){
          ent.userOrder = { type: 'move', x: targetEntity.x, y: targetEntity.y };
          return true;
        }
        return false;
      },
      refreshPanel:updateCmdPanel,
    },
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
    cycleSchedule:cycleSchedule,
    toggleFreeBuild:toggleFreeBuild,
    setInspTab:setInspTab,
    tacticalMoveTo:tacticalMoveTo,
    addBuildingBill:addBuildingBill,
    cycleZoneFilter:cycleZoneFilter,
    toggleZoneForbid:toggleZoneForbid,
    cycleGrowCrop:cycleGrowCrop,
    assignRestrict:assignRestrict,
    releasePrisoner:releasePrisoner,
    updateHome:updateHome,
    ecologyStep:ecologyStep,
    simStep:simStep,
    setTimeScale:setTimeScale,
    updateCamera:updateCamera,
    updateSurvival:updateSurvival,
    launchExpedition:launchExpedition,switchWorld:switchWorld,checkpointWorlds:checkpointWorlds,restoreWorldSession:restoreWorldSession,
    updateExpedition:updateExpedition,expeditionPawns:expeditionPawns,
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
