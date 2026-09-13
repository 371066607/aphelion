/* ============================================================
   Aphelion · save.js — 三层存档 (ADR-2) + 版本迁移入口
   挂载: window.APH.Save
   层级:
     meta            跨星球永久进度(研究点/科技/统计)
     planet_<id>     PlanetSpec + 殖民地布局 + 已发现法则
     rivals_<id>     AI 殖民地实时状态
   环境容错: localStorage 不可用时降级为内存 Map(单次会话可玩)。
   ============================================================ */
window.APH = window.APH || {};

APH.Save = (function(){
  'use strict';
  var U = APH.U;
  var CFG = APH.CFG;

  /* ---------- 存储后端（带降级） ---------- */
  var mem = {};                       // localStorage 不可用时的兜底
  var persistent = true;
  function clone(value){return value==null?value:JSON.parse(JSON.stringify(value));}
  function rawGet(k){
    if(Object.prototype.hasOwnProperty.call(mem,k)) return mem[k];
    try{ return localStorage.getItem(k); }catch(e){ persistent=false; return null; }
  }
  function rawSet(k,v){
    try{ localStorage.setItem(k,v);delete mem[k];persistent=Object.keys(mem).length===0;return true; }
    catch(e){ persistent=false;mem[k]=v;return false; }
  }
  function rawDel(k){
    try{ localStorage.removeItem(k); }catch(e){}
    delete mem[k];
  }
  function restorePayloads(payloads,before){
    var ok=true;
    for(var i=payloads.length-1;i>=0;i--){
      if(before[i]==null)rawDel(payloads[i].key);
      else if(!rawSet(payloads[i].key,before[i]))ok=false;
    }
    return ok;
  }

  /* 另一个标签页可能已用较新构建写入 colony。mem 是本标签页的失败写
     兜底，不能遮住 localStorage 中更高版本的权威快照；两处都要检查。 */
  function futureColonyPayload(txt){
    if(!txt)return false;
    try{
      var save=JSON.parse(txt);
      return isFutureSave(save,'colony')||!!(save&&save.metaSnapshot&&isFutureSave(save.metaSnapshot,'meta'));
    }catch(e){return false;}
  }
  function futureColonyAtRest(){
    var key=CFG.save.KEY_COLONY;
    if(Object.prototype.hasOwnProperty.call(mem,key)&&futureColonyPayload(mem[key]))return true;
    try{return futureColonyPayload(localStorage.getItem(key));}catch(e){return false;}
  }

  /* ---------- 版本迁移 (ADR-2: 唯一收口点) ----------
     迁移链: v0(无版本) → v1 → v2 → ...
     每级一步, 逐步推进; 未知版本抛错(宁可失败不可静默丢数据)。 */
  var migrations = {
    // 1: function(s){ s.newField = 0; return s; },
  };
  /* 未来版本存档: 旧构建读不懂, 但绝不能把版本号偷偷改回来 ——
     那会让日后真正的新构建以为迁移已经做过, 跳过 v(n)→VERSION 全链。
     宁可在这里明确失败, 也不要静默改坏玩家的档 (见文件头契约)。 */
  function versionFor(save, kind){
    return kind === 'colony' || (save && Array.isArray(save.buildings))
      ? CFG.save.COLONY_VERSION : CFG.save.VERSION;
  }
  function isFutureSave(save, kind){
    return !!(save && typeof save.v === 'number' && save.v > versionFor(save, kind));
  }
  /* Colony v2+ is a separate envelope: PlanetSpec remains v1 (ADR-1). */
  function legacyColony(save){
    var two = {bl_warehouse:1,bl_lab:1,bl_barracks:1,bl_clinic:1,
      bl_farm:1,bl_house:1,bl_pasture:1,bl_workshop:1,bl_kitchen:1};
    if(!save.scene) save.scene = {v:1,kind:'home',width:2200,height:2200,grid:48,generation:0,seed:save.seed||0};
    var used = {};
    (save.buildings||[]).concat(save.buildQueue||[]).forEach(function(b){ if(b.uid) used[b.uid]=true; });
    function stamp(b, i, queued){
      if(!b || typeof b !== 'object') return;
      if(!b.uid){
        var base=(queued?'q_legacy_':'b_legacy_')+i, uid=base, n=0;
        while(used[uid]) uid=base+'_'+(++n);
        b.uid=uid; used[uid]=true;
      }
      if(b.geometryVersion == null){
        b.geometryVersion=0;
        var id=b.bid||b.id;
        b.legacyFootprint=Array.isArray(b.cells)?b.cells.slice():
          (id==='bl_transmitter'?[3,3]:(two[id]?[2,2]:[1,1]));
      }
      if(b.rotation == null) b.rotation=0;
      if(queued && b.materialsPaid == null) b.materialsPaid=true;
    }
    (save.buildings||[]).forEach(function(b,i){stamp(b,i,false);});
    (save.buildQueue||[]).forEach(function(b,i){stamp(b,i,true);});
    if(!save.depleted) save.depleted={};
    if(!save.logistics) save.logistics={v:1,nextTask:1,nextReservation:1,tasks:[],reservations:[]};
    return save;
  }
  function ensureColonyObservation(save){
    var scene=save&&save.scene;
    if(!scene||scene.generation!==1||!APH.TerrainModel||APH.TerrainModel.hasObservation(scene)) return false;
    if(scene.observation&&typeof scene.observation.v==='number'&&scene.observation.v>1){
      var error=new Error('Observation v'+scene.observation.v+' 缺少当前构建可读取的基础字段，本次不会改写存档。');
      error.aphObservationVersion=scene.observation.v;
      throw error;
    }
    var observation=APH.TerrainModel.snapshotObservation(scene);
    if(!observation) return false;
    scene.observation=observation;
    return true;
  }
  function migrate(save, kind){
    if(save === null || typeof save !== 'object' || Array.isArray(save)){
      /* 合法 JSON 但不是存档对象(数字/字符串/数组/null): 当损坏处理。
         注意严格模式下给原始值赋属性会抛 TypeError, 不能放任它往下走。 */
      return null;
    }
    var version=versionFor(save, kind);
    if(isFutureSave(save, kind)){
      var err = new Error('存档版本 v' + save.v + ' 高于当前构建支持的 v' +
        version + ' —— 请用较新版本打开, 本次不会改写存档。');
      err.aphSaveVersion = save.v;
      throw err;
    }
    var v = save.v || 0;
    while(v < version){
      v++;
      if(v === 2 && (kind === 'colony' || Array.isArray(save.buildings))) save=legacyColony(save);
      else if(v === 3 && (kind === 'colony' || Array.isArray(save.buildings))) ensureColonyObservation(save);
      else if(migrations[v]) save = migrations[v](save);
      else save.v = v;                 // 无显式迁移 = 仅推进版本号
    }
    if(kind === 'colony' || Array.isArray(save.buildings)){
      legacyColony(save);
      ensureColonyObservation(save);
    }
    save.v = version;
    return save;
  }

  /* ---------- 通用读写 ---------- */
  function prepareRead(key){
    var txt = rawGet(key);
    if(!txt) return {obj:null,persist:false};
    var obj;
    try{ obj = JSON.parse(txt); }
    catch(e){ return {obj:null,persist:false}; } // 损坏存档视为不存在, 不抛错
    var kind=key === CFG.save.KEY_COLONY ? 'colony' : null;
    var beforeVersion=obj&&obj.v||0;
    var neededObservation=kind==='colony'&&obj&&obj.scene&&obj.scene.generation===1&&
      (!APH.TerrainModel||!APH.TerrainModel.hasObservation(obj.scene));
    obj=migrate(obj,kind);               // migrate 对非存档对象返回 null; 未来版本抛错
    return {obj:obj,persist:!!(obj&&(beforeVersion<versionFor(obj,kind)||neededObservation)),key:key};
  }
  function read(key,persistMigration){
    var prepared=prepareRead(key);
    if(persistMigration&&prepared.persist)rawSet(key,JSON.stringify(prepared.obj));
    return prepared.obj;
  }
  function write(key, obj){
    if(key === CFG.save.KEY_COLONY && futureColonyAtRest()) return false;
    if(key === CFG.save.KEY_COLONY) obj = migrate(obj, 'colony');
    obj.v = versionFor(obj, key === CFG.save.KEY_COLONY ? 'colony' : null);
    return rawSet(key, JSON.stringify(obj));
  }
  function remove(key){ rawDel(key); }

  /* ---------- 三层接口 ---------- */
  function loadMeta(){
    var m = read(CFG.save.KEY_META);
    /* v2+ 的家园快照把名册/库存与地面/在途材料存于同一个原子 JSON。
       meta key 保留兼容，但不能覆盖更新的整份家园快照。 */
    /* 先只在内存迁移 envelope，检查其中权威 meta 的版本后才允许把
       colony 迁移结果写回；否则旧构建会在报错前先改动未来存档。 */
    var preparedHome=prepareRead(CFG.save.KEY_COLONY),homeSnapshot=preparedHome.obj;
    if(homeSnapshot&&Object.prototype.hasOwnProperty.call(homeSnapshot,'metaSnapshot')){
      var nestedMeta=homeSnapshot.metaSnapshot;
      if(isFutureSave(nestedMeta,'meta')){
        var futureMetaError=new Error('家园快照中的 meta 版本 v'+nestedMeta.v+
          ' 高于当前构建支持的 v'+CFG.save.VERSION+' —— 本次不会改写存档。');
        futureMetaError.aphSaveVersion=nestedMeta.v;
        throw futureMetaError;
      }
      /* 合法 JSON 的字符串/数组仍不是 meta 存档。回退 standalone meta，
         并禁止 loadMeta 顺手写回已在内存迁移过的 colony envelope。 */
      nestedMeta=migrate(clone(nestedMeta),'meta');
      if(nestedMeta)m=nestedMeta;
      else preparedHome.persist=false;
    }
    if(preparedHome.persist)rawSet(preparedHome.key,JSON.stringify(homeSnapshot));
    var existed = !!m;
    if(!m){
      m = {
        v: CFG.save.VERSION,
        research: 0,
        tech: {},                      // 已购科技 { techId: lv }
        res: { mineral:100, food:0, leather:0, med:0 },
        residents: [],
        residentSeq: 0,
        war: { wins:0, raids:0 },
        econV2: 1,
        stats: { landings:0, deaths:0, kills:0, scans:0, playSec:0 },
        currentPlanet: null,
      };
    }
    if(Array.isArray(m.tech)){
      var tObj = {};
      m.tech.forEach(function(k){ if(typeof k==='string') tObj[k]=1; });
      m.tech = tObj;
    }
    if(!m.res) m.res = { wood:50, stone:30, iron:40, food:20, herb:5, med:2, leather:0, mineral:0 };
    if(m.res.wood===undefined) m.res.wood = 50;
    if(m.res.stone===undefined) m.res.stone = 30;
    if(m.res.iron===undefined) m.res.iron = (m.res.mineral!=null?m.res.mineral:40);
    if(m.res.herb===undefined) m.res.herb = 5;
    if(m.res.food===undefined) m.res.food = 20;
    if(m.res.leather===undefined) m.res.leather = 0;
    if(m.res.med===undefined) m.res.med = 2;
    if(m.res.mineral===undefined) m.res.mineral = m.res.iron;
    if(!m.residents) m.residents = [];
    m.residents.forEach(function(r){
      if(r.rest===undefined) r.rest = 100;
      if(r.isSleeping===undefined) r.isSleeping = false;
      if(r.bedId===undefined) r.bedId = null;
      if(r.sleepDisturbed===undefined) r.sleepDisturbed = 0;
      if(r.recreation===undefined) r.recreation = 80;
      if(r.exposure===undefined) r.exposure = 0;
      if(r.downed===undefined) r.downed = false;
      if(r.bleedOutTimer===undefined) r.bleedOutTimer = null;
      if(!r.gear) r.gear = { tool:null, suit:null, head:null };
    });
    if(m.residentSeq===undefined) m.residentSeq = 0;
    /* 经营 v2: 开局赠矿, 外骨骼 id 迁 te_exosuit, 战争并入 meta */
    if(!m.tech) m.tech = {};
    if(m.tech.exo_suit){
      m.tech.te_exosuit = (m.tech.te_exosuit||0) + m.tech.exo_suit;
      delete m.tech.exo_suit;
    }
    if(!m.war) m.war = { wins:0, raids:0 };
    /* ADR-12 事件导演状态(分钟计): 旧档走默认值 */
    if(!m.events) m.events = { nextIn:null, sinceNeg:1e9, lastNeg:0, restFor:null, cooldowns:{}, history:[] };
    if(!m.events.cooldowns) m.events.cooldowns = {};
    if(!m.events.history) m.events.history = [];
    if(m.events.lastNeg==null) m.events.lastNeg = 0;
    /* ADR-0007 开场短片: 有存档不播; 兼容未提交期的 seen */
    if(!m.opening) m.opening = { played: !!existed, nightDone: !!existed, sleptInHouse:false, houseAt:null, firstVisitor:false };
    if(m.opening.played == null) m.opening.played = !!(m.opening.seen || existed);
    if(m.opening.nightDone == null) m.opening.nightDone = !!existed;
    if(!m.opening.sleptInHouse) m.opening.sleptInHouse = false;
    if(m.opening.houseAt === undefined) m.opening.houseAt = null;
    if(!m.opening.firstVisitor) m.opening.firstVisitor = false;
    if(!m.workPrio) m.workPrio = {};
    if(!m.analyzedFlora) m.analyzedFlora = {};
    if(!m.analyzedSpecimens) m.analyzedSpecimens = {};
    if(window.APH.Res && APH.Res.ensurePlayerNeeds) APH.Res.ensurePlayerNeeds(m);
    else{
      m.playerNeeds = m.playerNeeds || {};
      if(m.playerNeeds.food == null){
        m.playerNeeds.food = (CFG.player && CFG.player.homeFoodStart != null) ? CFG.player.homeFoodStart : 80;
      }
      if(m.playerNeeds.rest == null){
        m.playerNeeds.rest = (CFG.player && CFG.player.homeRestStart != null) ? CFG.player.homeRestStart : 100;
      }
      if(m.playerNeeds.illness == null){
        m.playerNeeds.illness = (CFG.player && CFG.player.homeIllnessStart != null) ? CFG.player.homeIllnessStart : 0;
      }
      /* #66 床边睡眠: 防御性默认(仅当 APH.Res 缺失时走到此分支) */
      if(m.playerNeeds.isSleeping===undefined) m.playerNeeds.isSleeping=false;
      /* #72 家园击倒: 防御性默认(同上分支; downT 置空不秒死) */
      if(m.playerNeeds.downed===undefined) m.playerNeeds.downed=false;
      if(m.playerNeeds.downT===undefined) m.playerNeeds.downT=null;
    }
    try{
      var w = JSON.parse(rawGet('aphelion_war_v1')||'null');
      if(w){
        m.war.wins = Math.max(m.war.wins||0, w.wins||0);
        m.war.raids = Math.max(m.war.raids||0, w.raids||0);
        rawDel('aphelion_war_v1');
      }
    }catch(e){}
    if(!m.econV2){
      var startM = (APH.CFG.economy && APH.CFG.economy.startMineral) || 100;
      m.res.mineral = Math.max(m.res.mineral||0, startM);
      m.econV2 = 1;
    }
    if(window.APH.Atlas){
      APH.Atlas.ensure(m);
      /* Atlas 出现前的 PlanetSpec 没有索引。只把仍能完整读取、且 key 与
         内部 P 身份一致的旧档补进内存索引；不重命名、不重生成、不删档。 */
      if(!APH.Atlas.isFuture(m)){
        var known={},prefix=CFG.save.KEY_PLANET;
        Object.keys(mem).forEach(function(key){if(key.indexOf(prefix)===0)known[key.slice(prefix.length)]=true;});
        try{for(var pi=0;pi<localStorage.length;pi++){var pk=localStorage.key(pi);if(pk&&pk.indexOf(prefix)===0)known[pk.slice(prefix.length)]=true;}}catch(e){}
        Object.keys(known).sort().forEach(function(id){
          if(!/^P[0-9A-F]+$/.test(id))return;
          try{
            var spec=loadPlanet(id),check=window.APH.Planet&&spec&&APH.Planet.validate(spec);
            if(spec&&spec.id===id&&check&&check.ok){
              var prior=APH.Atlas.find(m,id);
              APH.Atlas.record(m,spec,prior&&prior.discoveredAt!=null?prior.discoveredAt:0);
            }
          }catch(e){}
        });
      }
    }
    return m;
  }
  function saveMeta(m){
    /* metaWillSave 会 checkpoint 当前 runtime；必须先保护磁盘上由较新
       标签页写入的权威 colony，避免旧实例在事件阶段就覆盖它。 */
    if(futureColonyAtRest())return false;
    var s=APH.state;
    if(s&&s.meta===m&&s._worldReady){
      U.emit('metaWillSave',m);
    }else{
      var home=read(CFG.save.KEY_COLONY);
      if(home&&home.metaSnapshot){
        if(isFutureSave(home.metaSnapshot,'meta'))return false;
        home.metaSnapshot=m;home.stock=m.res;
        if(!write(CFG.save.KEY_COLONY,home))return false;
      }
    }
    return write(CFG.save.KEY_META, m);
  }

  function loadPlanet(id){ return read(CFG.save.KEY_PLANET + id); }
  function savePlanet(id, spec){ return write(CFG.save.KEY_PLANET + id, spec); }

  /* 新星发现跨 planet_<id> 与 meta.atlas 两层；只有全部持久写成功才改
     调用方的内存对象。localStorage 没有事务，正常写失败时按旧值回滚；
     浏览器在进程级中断两个 setItem 之间仍可能留下孤立 PlanetSpec，
     但绝不会因此扣补给或建立 Active Run。 */
  function savePlanetDiscovery(meta,spec,discoveredAt){
    if(!meta||!spec||!window.APH.Atlas)return {ok:false,why:'invalid-discovery'};
    var nextMeta,recorded,nextPlanet,state,currentColony,nextColony,payloads,before,existingPlanet;
    try{
      if(futureColonyAtRest())return {ok:false,why:'persistence-failed'};
      if(isFutureSave(meta)||APH.Atlas.isFuture(meta)||
        (typeof spec.v==='number'&&spec.v>CFG.save.VERSION))return {ok:false,why:'persistence-failed'};
      if(typeof spec.id!=='string'||!spec.id||typeof spec.seed!=='number'||!isFinite(spec.seed)||
        !spec.observation||!APH.TerrainModel||!APH.TerrainModel.hasObservation(APH.TerrainModel.planet(spec)))
        return {ok:false,why:'invalid-planet'};
      existingPlanet=read(CFG.save.KEY_PLANET+spec.id);
      if(existingPlanet){
        if(existingPlanet.id!==spec.id||existingPlanet.seed!==spec.seed||!existingPlanet.observation||
          JSON.stringify(existingPlanet.observation)!==JSON.stringify(spec.observation))
          return {ok:false,why:'planet-conflict'};
      }
      nextMeta=clone(meta);recorded=APH.Atlas.record(nextMeta,spec,discoveredAt);
      if(!recorded.ok)return recorded;
      nextMeta.v=CFG.save.VERSION;
      nextPlanet=clone(existingPlanet)||{};
      Object.keys(spec).forEach(function(key){nextPlanet[key]=clone(spec[key]);});
      nextPlanet.v=CFG.save.VERSION;
      state=window.APH&&APH.state;currentColony=state&&state.meta===meta&&state.colony;
      nextColony=read(CFG.save.KEY_COLONY);
      if(!nextColony&&currentColony)nextColony=clone(currentColony);
      if(nextColony){
        if(nextColony.metaSnapshot&&isFutureSave(nextColony.metaSnapshot,'meta'))
          return {ok:false,why:'persistence-failed'};
        nextColony.metaSnapshot=clone(nextMeta);nextColony.stock=clone(nextMeta.res||{});
        nextColony=migrate(nextColony,'colony');
      }
      payloads=[{key:CFG.save.KEY_PLANET+spec.id,value:JSON.stringify(nextPlanet)},
        {key:CFG.save.KEY_META,value:JSON.stringify(nextMeta)}];
      if(nextColony)payloads.push({key:CFG.save.KEY_COLONY,value:JSON.stringify(nextColony)});
      before=payloads.map(function(item){return rawGet(item.key);});
    }catch(e){
      return {ok:false,why:'persistence-failed'};
    }
    var failed=false;
    for(var i=0;i<payloads.length;i++)if(!rawSet(payloads[i].key,payloads[i].value)){failed=true;break;}
    if(failed){
      restorePayloads(payloads,before);
      return {ok:false,why:'persistence-failed'};
    }
    meta.atlas=clone(nextMeta.atlas);
    if(currentColony){currentColony.metaSnapshot=clone(nextMeta);currentColony.stock=clone(nextMeta.res||{});}
    return {ok:true,entry:recorded.entry,planet:nextPlanet,
      rollback:function(){return restorePayloads(payloads,before);}};
  }

  /* 已知星重访不改写 PlanetSpec，只把访问记录与 colony.metaSnapshot
     同批提交。失败时留在家园，原 PlanetSpec 字节也完全不动。 */
  function savePlanetVisit(meta,spec,visitedAt){
    if(!meta||!spec||!window.APH.Atlas)return {ok:false,why:'invalid-visit'};
    var existing,nextMeta,visited,state,currentColony,nextColony,payloads,before;
    try{
      if(futureColonyAtRest())return {ok:false,why:'persistence-failed'};
      if(isFutureSave(meta)||APH.Atlas.isFuture(meta))return {ok:false,why:'persistence-failed'};
      existing=read(CFG.save.KEY_PLANET+spec.id);
      if(!existing)return {ok:false,why:'missing-planet'};
      if(existing.id!==spec.id||existing.seed!==spec.seed)return {ok:false,why:'planet-conflict'};
      var check=window.APH.Planet&&APH.Planet.validate(existing);
      if(!check||!check.ok)return {ok:false,why:'invalid-planet'};
      nextMeta=clone(meta);visited=APH.Atlas.visit(nextMeta,existing,visitedAt);
      if(!visited.ok)return visited;
      nextMeta.v=CFG.save.VERSION;
      state=window.APH&&APH.state;currentColony=state&&state.meta===meta&&state.colony;
      nextColony=read(CFG.save.KEY_COLONY);
      if(!nextColony&&currentColony)nextColony=clone(currentColony);
      if(nextColony){
        if(nextColony.metaSnapshot&&isFutureSave(nextColony.metaSnapshot,'meta'))
          return {ok:false,why:'persistence-failed'};
        nextColony.metaSnapshot=clone(nextMeta);nextColony.stock=clone(nextMeta.res||{});
        nextColony=migrate(nextColony,'colony');
      }
      payloads=[{key:CFG.save.KEY_META,value:JSON.stringify(nextMeta)}];
      if(nextColony)payloads.push({key:CFG.save.KEY_COLONY,value:JSON.stringify(nextColony)});
      before=payloads.map(function(item){return rawGet(item.key);});
    }catch(e){return {ok:false,why:'persistence-failed'};}
    var failed=false;
    for(var i=0;i<payloads.length;i++)if(!rawSet(payloads[i].key,payloads[i].value)){failed=true;break;}
    if(failed){
      restorePayloads(payloads,before);
      return {ok:false,why:'persistence-failed'};
    }
    meta.atlas=clone(nextMeta.atlas);
    if(currentColony){currentColony.metaSnapshot=clone(nextMeta);currentColony.stock=clone(nextMeta.res||{});}
    return {ok:true,entry:visited.entry,planet:existing,
      rollback:function(){return restorePayloads(payloads,before);}};
  }

  function loadRivals(id){ return read(CFG.save.KEY_RIVALS + id); }
  function saveRivals(id, state){ write(CFG.save.KEY_RIVALS + id, state); }

  /* ---------- 局内状态: 殖民地 / 势力关系 (ADR-39) ----------
     此前住在 main.js 里、直接 localStorage.setItem, 于是 ui 想存档就得反向调 main,
     且 localStorage 不可用时(隐私模式/测试环境)静默丢档。现在与 meta 走同一条路。 */

  /* meta 的静默保存: 存档失败不该打断正在进行的交互 */
  function metaQuiet(){
    try{ saveMeta(APH.state.meta); }catch(e){}
  }

  function loadColony(){
    var v = read(CFG.save.KEY_COLONY,true);
    if(v && Array.isArray(v.buildings)){
      v.buildQueue = v.buildQueue || [];
      v.ground = v.ground || [];
      v.buildings.forEach(function(b){ b.lv = b.lv || 1; });
      return v;
    }
    var now=Date.now(),fresh={ v:CFG.save.COLONY_VERSION, rulesVersion:1, buildings:[], buildQueue:[], builtAt:now, ground:[],
      scene:APH.TerrainModel.newHome(now%100000),
      depleted:{}, logistics:{v:1,nextTask:1,nextReservation:1,tasks:[],reservations:[]} };
    var state=window.APH&&APH.state;
    if(state&&state.meta){fresh.metaSnapshot=JSON.parse(JSON.stringify(state.meta));fresh.stock=fresh.metaSnapshot.res;}
    saveColony(fresh);
    return fresh;
  }
  function saveColony(colony){
    if(!colony) return false;
    if(futureColonyAtRest())return false;
    var s=APH.state;
    if(s&&s.colony===colony&&s.meta&&s.scene==='home'&&s._worldReady){
      colony.metaSnapshot=JSON.parse(JSON.stringify(s.meta));
      colony.stock=colony.metaSnapshot.res;
    }
    try{ return write(CFG.save.KEY_COLONY, colony); }catch(e){return false;}
  }

  /* 势力关系存的是数组, 走不了 read/write —— migrate 只认存档对象, 会把数组判为损坏。
     所以这一对直接用 rawGet/rawSet, 仍然享有内存兜底。 */
  function loadRivalStates(){
    var txt = rawGet(CFG.save.KEY_RIVAL_STATES);
    if(!txt) return null;
    try{
      var v = JSON.parse(txt);
      return Array.isArray(v) ? v : null;
    }catch(e){ return null; }
  }
  function saveRivalStates(list){
    if(!Array.isArray(list)) return;
    try{ rawSet(CFG.save.KEY_RIVAL_STATES, JSON.stringify(list)); }catch(e){}
  }

  /* ---------- 调试/重置 ---------- */
  function wipeAll(){
    // 只清本游戏前缀的 key
    try{
      var del = [];
      for(var i=0;i<localStorage.length;i++){
        var k = localStorage.key(i);
        if(k && k.indexOf(CFG.save.PREFIX)===0) del.push(k);
      }
      del.forEach(rawDel);
    }catch(e){}
    mem = {};
  }

  return {
    loadMeta:loadMeta, saveMeta:saveMeta,
    loadPlanet:loadPlanet, savePlanet:savePlanet, savePlanetDiscovery:savePlanetDiscovery, savePlanetVisit:savePlanetVisit,
    loadRivals:loadRivals, saveRivals:saveRivals,
    metaQuiet:metaQuiet,
    loadColony:loadColony, saveColony:saveColony,
    loadRivalStates:loadRivalStates, saveRivalStates:saveRivalStates,
    migrate:migrate, wipeAll:wipeAll, isFutureSave:isFutureSave,
    isPersistent:function(){ return persistent; },
  };
})();
