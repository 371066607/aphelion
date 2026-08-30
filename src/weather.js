'use strict';
/* ============================================================
   Aphelion · weather.js — 家园天气状态机 (ADR-15 / docs/adr/0006)
   挂载: window.APH.Weather
   纯函数: 马尔可夫级联 tickWeather + 效果表 weatherEffects。
   不持计时器(切换由事件导演调度, ADR-12); 数值全在 CFG.weather (ADR-10)。
   天气 id: wx_ 前缀 (ADR-9); 老档默认 wx_clear 零迁移。
   ============================================================ */
window.APH = window.APH || {};

APH.Weather = (function(){
  'use strict';
  var CFG = APH.CFG;

  function W(){ return CFG.weather || {}; }

  /* ---------- 定义 ---------- */
  function weatherDefs(){
    var out = {};
    var E = (W().effects) || {};
    Object.keys(E).forEach(function(id){ out[id] = { id: id }; });
    return out;
  }

  function defaultWeather(){
    return { id: 'wx_clear', t: 0 };
  }

  /* ---------- 马尔可夫推进 ----------
     state = {id, t, cd?{wx_id:剩余秒}}; dt 秒; rng()→[0,1)
     rule: t 累加; t>=dur(随机取区间) 时掷骰选下一id(权重表, 冷却中排除);
           选中后 t=0; 进入极端天气时写 cd=cfg.cd[id]。
     cd 衰减时机: 仅当当前天气非极端时衰减(离开极端后开始计冷却, 防立刻连击)。 */
  function tickWeather(state, dt, rng){
    var cfg = W();
    if (!state) return defaultWeather();
    var id = state.id || 'wx_clear';
    var t = (state.t || 0) + (dt || 0);
    var cd = state.cd && Object.keys(state.cd).length ? Object.assign({}, state.cd) : null;
    var cdCfg = cfg.cd || {};
    var isExtreme = cdCfg[id] != null;
    /* 冷却衰减: 仅非极端天气期间(当前不在极端中) */
    if (cd && !isExtreme){
      for (var k in cd){ cd[k] = Math.max(0, cd[k] - (dt || 0)); if (cd[k] <= 0) delete cd[k]; }
    }
    var dur = durOf(id, cfg, rng);
    if (t < dur) return { id: id, t: t, cd: cd };

    /* 到时: 掷骰选下一天气 */
    var next = pick(id, cd, cfg, rng);
    if (next === id) return { id: id, t: 0, cd: cd };   // 继续(权重含自身)
    var ncd = cd ? Object.assign({}, cd) : {};
    if (cdCfg[next] != null) ncd[next] = cdCfg[next];
    return { id: next, t: 0, cd: Object.keys(ncd).length ? ncd : null };
  }

  /* 持续时长: dur[天]区间 × dayLen, 同 rng 掷定 */
  function durOf(id, cfg, rng){
    var d = (cfg.dur && cfg.dur[id]) || [2, 5];
    var dayLen = (cfg.dayLen != null ? cfg.dayLen : 210);
    var min = d[0] * dayLen, max = d[1] * dayLen;
    return min + (rng ? rng() : 0) * (max - min);
  }

  /* 权重抽选: 排除冷却中的天气 */
  function pick(id, cd, cfg, rng){
    var tr = (cfg.transitions && cfg.transitions[id]) || { wx_clear: 1 };
    var entries = [];
    var total = 0;
    for (var to in tr){
      if (cd && cd[to] > 0) continue;      // 冷却排除
      entries.push({ to: to, w: tr[to] });
      total += tr[to];
    }
    if (!entries.length) return 'wx_clear';  // 全冷却兜底晴天
    var r = (rng ? rng() : 0) * total;
    for (var i = 0; i < entries.length; i++){
      r -= entries[i].w;
      if (r < 0) return entries[i].to;
    }
    return entries[entries.length - 1].to;
  }

  /* ---------- 效果表 ---------- */
  function weatherEffects(id){
    var E = (W().effects) || {};
    return E[id] || E.wx_clear || { speedMul: 1, farmMul: 1, exposureGain: 0, enemySightMul: 1, solarMul: 1 };
  }

  return {
    weatherDefs: weatherDefs,
    defaultWeather: defaultWeather,
    tickWeather: tickWeather,
    weatherEffects: weatherEffects,
  };
})();
