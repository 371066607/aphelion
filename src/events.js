/* ============================================================
   Aphelion · events.js — 事件叙事者 (ADR-12: 事件导演)
   挂载: window.APH.Events
   职责(RimWorld 式 AI Storyteller):
     - wealthScore: 殖民地财富值 = 唯一威胁标尺
     - pickEvent: 按权重抽事件卡; 负面事件后强制喘息窗口;
       心情均值过低时负面权重减半(怜悯)
     - directorTick: 事件节奏器(纯函数), 每生产跳推进一次;
       ev_weather 路径: 导演掷骰切换天气(ADR-15), 极端结束强制晴天窗口+喘息
   效果应用(世界侧)在 main.js 的 applyEvent; 本模块零 DOM。
   数值全在 CFG.events (ADR-10)。事件 id 前缀 ev_ (ADR-9)。
   ============================================================ */
window.APH = window.APH || {};

APH.Events = (function(){
  'use strict';
  var CFG = APH.CFG;

  function EV(){ return CFG.events || {}; }

  /* ---------- 事件卡组(数据+资格判定) ----------
     w/cd/neg 数值在 CFG.events.deck; 这里只留 id 与资格谓词 can(ctx)。
     ctx 布尔字段由调用方(main.js/测试)汇总。 */
  var DECK = [
    { id:'ev_droppod',      can:function(c){ return true; } },
    { id:'ev_refugee_wave', can:function(c){ return !!c.hasSpareBed; } },
    { id:'ev_herd',         can:function(c){ return !!c.hasPasture; } },
    { id:'ev_aurora',       can:function(c){ return (c.residentCount||0)>0; } },
    { id:'ev_trader_caravan', can:function(c){ return !!c.visitorSlot; } },
    { id:'ev_plague',       can:function(c){ return (c.residentCount||0)>0; } },
    { id:'ev_blight',       can:function(c){ return !!c.hasFarm; } },
    { id:'ev_solar_flare',  can:function(c){ return !!c.hasTurret; } },
    { id:'ev_raid',         can:function(c){ return !!c.rivalReady && !c.raidActive; } },
    /* 天气切换(ADR-15): 导演掷骰推进马尔可夫状态机;
       can 谓词=非冷却期(与通用冷却同判) + 需天气上下文(驱动方必带)。 */
    { id:'ev_weather',      can:function(c){
      return !!(c && c.weather) && !((c.cooldowns||{})['ev_weather'] > 0);
    } },
  ];

  /* 事件文案(降级用; LLM 富化在 enrichEvent) */
  var TEXTS = {
    ev_droppod:      { name:'补给舱坠落', lore:'一枚无主的轨道补给舱拖着白烟落在殖民地附近。里面的东西现在归你了。' },
    ev_refugee_wave: { name:'难民潮', lore:'一艘残破的救生艇在附近迫降。幸存者朝着灯光走来。' },
    ev_herd:         { name:'星兽群过境', lore:'迁徙的星兽群路过牧场, 几只幼崽留了下来。牧圈一下子热闹了。' },
    ev_aurora:       { name:'极光之夜', lore:'磁层被太阳风点亮, 整片天空流动着绿紫色的光。所有人都走出舱门仰望。' },
    ev_trader_caravan:{ name:'游商到访', lore:'一支小型游商队在殖民地边缘落锚, 打出了交易的灯语。' },
    ev_plague:       { name:'孢子疫病', lore:'风里的孢子浓度超标了。有人开始咳嗽。医疗舱要忙起来了。' },
    ev_blight:       { name:'作物枯萎', lore:'一夜之间, 农田里的叶片卷起了焦边。这一茬要减产了。' },
    ev_solar_flare:  { name:'太阳耀斑', lore:'恒星抛出一记耀斑, 炮塔的火控电路暂时全部烧保险了。' },
    ev_raid:         { name:'敌意集结', lore:'雷达上出现密集光点。他们不是来做客的。' },
    ev_weather:      { name:'天气转变', lore:'大气的平衡被打破了。云层与风开始重新洗牌, 殖民地的天空正在换装。' },
  };
  function textOf(id){ return TEXTS[id] || { name:id, lore:'' }; }

  /* ---------- 财富值(纯函数): 仓+地资源 + 建筑造价 + 人口 + 科技 ----------
     发展越好, 威胁越大 —— RimWorld 张力的来源。 */
  function wealthScore(meta, ground, buildings){
    var E = EV();
    var res = (meta && meta.res) || {};
    var g = ground || {};
    var leatherW = E.wealthLeather!=null ? E.wealthLeather : 2;
    var medW = E.wealthMed!=null ? E.wealthMed : 3;
    var wRes = ((res.mineral||0)+(g.mineral||0))
             + ((res.food||0)+(g.food||0))
             + ((res.leather||0)+(g.leather||0)) * leatherW
             + ((res.med||0)+(g.med||0)) * medW;
    var wBld = 0;
    (buildings||[]).forEach(function(b){
      var def = APH.Colony && APH.Colony.get ? APH.Colony.get(b.id) : null;
      if(!def) return;
      var bVal = (def.cost||0);
      if(def.costRes && Object.keys(def.costRes).length){
        for(var m in def.costRes) bVal += (def.costRes[m]||0);
      }else{
        bVal += (def.costMineral||0);
      }
      wBld += (bVal || 50) * (b.lv||1);
    });
    var popW = E.wealthPerPop!=null ? E.wealthPerPop : 40;
    var techW = E.wealthPerTech!=null ? E.wealthPerTech : 40;
    var wPop = ((meta && meta.residents)||[]).length * popW;
    var wTech = 0;
    var tech = (meta && meta.tech) || {};
    for(var k in tech) wTech += (tech[k]||0) * techW;
    return Math.round(wRes + wBld + wPop + wTech + ((meta&&meta.research)||0));
  }

  /* 威胁级: 0~threatMax */
  function threatLevel(wealth){
    var E = EV();
    var per = E.wealthPerThreat!=null ? E.wealthPerThreat : 120;
    var max = E.threatMax!=null ? E.threatMax : 5;
    return Math.min(max, Math.floor((wealth||0)/per));
  }

  function restWindow(E, ctx){
    if(ctx && ctx.restFor!=null) return ctx.restFor;
    var r = E.restMinutes;
    if(Array.isArray(r)) return r[0]!=null ? r[0] : 2;
    return r!=null ? r : 2.5;
  }
  function rollRest(E, rng){
    var r = E.restMinutes;
    if(!Array.isArray(r)) return r!=null ? r : 2.5;
    var lo=r[0]!=null?r[0]:2, hi=r[1]!=null?r[1]:lo;
    return lo + (rng||Math.random)() * (hi-lo);
  }

  /* ---------- 天气掷骰(ev_weather 生效, ADR-15) ----------
     纯函数: 导演拍板何时掷; APH.Weather 只做状态机与效果表。
     极端判定以 exposureGain>0 为闸门(ADR-15 修订, 与 W3 暴露复活同源)。 */
  function weatherIsExtreme(id){
    var e = APH.Weather && APH.Weather.weatherEffects
      ? APH.Weather.weatherEffects(id) : null;
    return !!(e && e.exposureGain > 0);
  }

  /* ---------- 抽卡(纯函数) ----------
     ctx: { threat, moodAvg, sinceNeg(分钟), cooldowns:{id:剩余分钟},
            以及 DECK.can 需要的布尔字段 }
     规则: 冷却/资格过滤; 负面在喘息窗口内权重0;
           心情均值 < moodMercyAt 时负面权重减半;
           威胁级放大负面权重(富→险)。 */
  function pickEvent(ctx, rng){
    var E = EV();
    var deckCfg = E.deck || {};
    var rest = restWindow(E, ctx);
    var mercyAt = E.moodMercyAt!=null ? E.moodMercyAt : 40;
    var mercyMul = E.moodMercyMul!=null ? E.moodMercyMul : 0.5;
    var negMulPer = E.threatNegMul!=null ? E.threatNegMul : 0.15;
    var cds = (ctx && ctx.cooldowns) || {};
    var entries = [];
    var total = 0;
    DECK.forEach(function(card){
      var cfg = deckCfg[card.id];
      if(!cfg) return;
      if((cds[card.id]||0) > 0) return;
      if(!card.can(ctx||{})) return;
      var w = cfg.w;
      if(w==null && E.baseWeights) w = E.baseWeights[card.id];
      w = w||0;
      if(cfg.neg){
        if((ctx.sinceNeg!=null?ctx.sinceNeg:1e9) < rest) return;   // 喘息窗口
        w *= 1 + (ctx.threat||0) * negMulPer;                      // 富→险
        if((ctx.moodAvg!=null?ctx.moodAvg:100) < mercyAt) w *= mercyMul;
      }
      if(w<=0) return;
      entries.push({ id:card.id, w:w, neg:!!cfg.neg });
      total += w;
    });
    if(!entries.length || total<=0) return null;
    var roll = (rng||Math.random)() * total;
    for(var i=0;i<entries.length;i++){
      roll -= entries[i].w;
      if(roll <= 0) return entries[i];
    }
    return entries[entries.length-1];
  }

  /* ---------- 事件导演单步(纯函数) ----------
     evSt: { nextIn, sinceNeg, cooldowns, weatherAcc } (单位: 分钟, weatherAcc 为秒)
     返回 { state:新状态, fired:事件id|null, neg }
     ev_weather 命中时追加 { weather: 新天气状态 }, 由调用方写回 meta.weather。
     不修改入参。 */
  function directorTick(evSt, ctx, rng, dtMin){
    var E = EV();
    var dm = dtMin!=null ? dtMin : 0.5;
    var st = {
      nextIn: (evSt && evSt.nextIn!=null) ? evSt.nextIn
              : (E.firstDelay!=null ? E.firstDelay : 3),
      sinceNeg: (evSt && evSt.sinceNeg!=null) ? evSt.sinceNeg : 1e9,
      restFor: (evSt && evSt.restFor!=null) ? evSt.restFor : null,
      lastNeg: (evSt && evSt.lastNeg!=null) ? evSt.lastNeg : 0,
      cooldowns: {},
      /* 天气时钟(秒): 两次天气掷骰之间的真实时间累计, 掷出时一次性授予状态机 */
      weatherAcc: (evSt && evSt.weatherAcc!=null) ? evSt.weatherAcc : 0,
    };
    var cds = (evSt && evSt.cooldowns) || {};
    for(var k in cds){
      var left = (cds[k]||0) - dm;
      if(left > 0) st.cooldowns[k] = left;
    }
    st.sinceNeg = Math.min(1e9, st.sinceNeg + dm);
    st.weatherAcc += dm*60;
    st.nextIn -= dm;
    if(st.nextIn > 0) return { state:st, fired:null };
    var picked = pickEvent(Object.assign({}, ctx, {
      sinceNeg: st.sinceNeg, cooldowns: st.cooldowns, restFor: st.restFor,
    }), rng);
    var lo = E.intervalMin!=null ? E.intervalMin : 2.2;
    var hi = E.intervalMax!=null ? E.intervalMax : 4.5;
    st.nextIn = lo + (rng||Math.random)() * (hi-lo);
    if(!picked) return { state:st, fired:null };
    var deckCfg = (E.deck||{})[picked.id] || {};
    st.cooldowns[picked.id] = deckCfg.cd!=null ? deckCfg.cd : 6;
    var out = { state:st, fired:picked.id, neg:!!picked.neg };
    if(picked.id === 'ev_weather'){
      /* 导演掷骰: 授予状态机天气时间并决定切换; 极端结束强制晴天窗口 */
      var cur = (ctx && ctx.weather) || APH.Weather.defaultWeather();
      var grant = Math.max(st.weatherAcc,
        E.weatherStepSec!=null ? E.weatherStepSec : 210);
      st.weatherAcc = 0;
      var next = APH.Weather.tickWeather(cur, grant, rng);
      if(weatherIsExtreme(cur.id) && !weatherIsExtreme(next.id)
         && next.id !== 'wx_clear'){
        next = { id:'wx_clear', t:0, cd: next.cd || null };   // 1 天气周期晴天窗口
      }
      if(weatherIsExtreme(cur.id) && !weatherIsExtreme(next.id)){
        st.sinceNeg = 0;                        // 复用休息区间语义
        st.restFor = rollRest(E, rng);
      }
      out.weather = next;
      out.neg = false;
    }
    if(picked.neg){ st.sinceNeg = 0; st.restFor = rollRest(E, rng); }
    return out;
  }

  /* ---------- LLM 富化(异步, 静默降级) ---------- */
  function enrichEvent(id, seed){
    var base = textOf(id);
    if(!APH.LLM || !APH.LLM.enabled()) return Promise.resolve(base);
    var user='为殖民地事件写一条中文播报(30-60字)。事件:'+base.name+
      '; 基调:'+base.lore+'。只输出JSON: {"lore":"..."}。冷静克制的科幻笔触。';
    return APH.LLM.generate('event_v1', {id:id, seed:seed||0},
      '你是科幻游戏的程序化叙事引擎, 只输出合法 JSON。', user)
      .then(function(en){
        return (en && typeof en.lore==='string' && en.lore.length>=10)
          ? { name:base.name, lore:en.lore.slice(0,120) } : base;
      })
      .catch(function(){ return base; });
  }

  return {
    DECK:DECK, textOf:textOf,
    wealthScore:wealthScore, threatLevel:threatLevel,
    pickEvent:pickEvent, directorTick:directorTick,
    enrichEvent:enrichEvent,
  };
})();
