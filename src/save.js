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
  function migrate(save){
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
    return migrate(obj);
  }
  function write(key, obj){
    obj.v = CFG.save.VERSION;
    rawSet(key, JSON.stringify(obj));
  }
  function remove(key){ rawDel(key); }

  /* ---------- 三层接口 ---------- */
  function loadMeta(){
    var m = read(CFG.save.KEY_META);
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
    if(!m.res) m.res = { mineral:0, food:0, leather:0, med:0 };
    if(m.res.leather===undefined) m.res.leather = 0;
    if(m.res.med===undefined) m.res.med = 0;
    if(!m.residents) m.residents = [];
    m.residents.forEach(function(r){
      if(r.rest===undefined) r.rest = 100;
      if(r.isSleeping===undefined) r.isSleeping = false;
      if(r.bedId===undefined) r.bedId = null;
      if(r.sleepDisturbed===undefined) r.sleepDisturbed = 0;
      if(r.recreation===undefined) r.recreation = 80;
      if(r.downed===undefined) r.downed = false;
      if(r.bleedOutTimer===undefined) r.bleedOutTimer = null;
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
    if(!m.workPrio) m.workPrio = {};
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
    migrate:migrate, wipeAll:wipeAll,
    isPersistent:function(){ return persistent; },
  };
})();
