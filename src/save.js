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
  function rawGet(k){
    try{ return localStorage.getItem(k); }catch(e){ persistent=false; return mem[k]||null; }
  }
  function rawSet(k,v){
    try{ localStorage.setItem(k,v); }catch(e){ persistent=false; mem[k]=v; }
  }
  function rawDel(k){
    try{ localStorage.removeItem(k); }catch(e){}
    delete mem[k];
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
  function isFutureSave(save){
    return !!(save && typeof save.v === 'number' && save.v > CFG.save.VERSION);
  }
  function migrate(save){
    if(save === null || typeof save !== 'object' || Array.isArray(save)){
      /* 合法 JSON 但不是存档对象(数字/字符串/数组/null): 当损坏处理。
         注意严格模式下给原始值赋属性会抛 TypeError, 不能放任它往下走。 */
      return null;
    }
    if(isFutureSave(save)){
      var err = new Error('存档版本 v' + save.v + ' 高于当前构建支持的 v' +
        CFG.save.VERSION + ' —— 请用较新版本打开, 本次不会改写存档。');
      err.aphSaveVersion = save.v;
      throw err;
    }
    var v = save.v || 0;
    while(v < CFG.save.VERSION){
      v++;
      if(migrations[v]) save = migrations[v](save);
      else save.v = v;                 // 无显式迁移 = 仅推进版本号
    }
    save.v = CFG.save.VERSION;
    return save;
  }

  /* ---------- 通用读写 ---------- */
  function read(key){
    var txt = rawGet(key);
    if(!txt) return null;
    var obj;
    try{ obj = JSON.parse(txt); }
    catch(e){ return null; }           // 损坏存档视为不存在, 不抛错
    return migrate(obj);               // migrate 对非存档对象返回 null; 未来版本抛错
  }
  function write(key, obj){
    obj.v = CFG.save.VERSION;
    rawSet(key, JSON.stringify(obj));
  }
  function remove(key){ rawDel(key); }

  /* ---------- 三层接口 ---------- */
  function loadMeta(){
    var m = read(CFG.save.KEY_META);
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
    return m;
  }
  function saveMeta(m){ write(CFG.save.KEY_META, m); }

  function loadPlanet(id){ return read(CFG.save.KEY_PLANET + id); }
  function savePlanet(id, spec){ write(CFG.save.KEY_PLANET + id, spec); }

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
    var v = read(CFG.save.KEY_COLONY);
    if(v && Array.isArray(v.buildings)){
      v.buildQueue = v.buildQueue || [];
      v.ground = v.ground || [];
      v.buildings.forEach(function(b){ b.lv = b.lv || 1; });
      return v;
    }
    return { buildings:[], builtAt:Date.now(), ground:[] };
  }
  function saveColony(colony){
    if(!colony) return;
    try{ write(CFG.save.KEY_COLONY, colony); }catch(e){}
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
    loadPlanet:loadPlanet, savePlanet:savePlanet,
    loadRivals:loadRivals, saveRivals:saveRivals,
    metaQuiet:metaQuiet,
    loadColony:loadColony, saveColony:saveColony,
    loadRivalStates:loadRivalStates, saveRivalStates:saveRivalStates,
    migrate:migrate, wipeAll:wipeAll, isFutureSave:isFutureSave,
    isPersistent:function(){ return persistent; },
  };
})();
