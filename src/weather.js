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
     极端判定唯一真源 = weatherEffects(id).exposureGain > 0 (ADR-15 修订);
     cd 衰减时机: 仅当当前天气非极端时衰减(离开极端后开始计冷却, 防立刻连击)。 */
  function tickWeather(state, dt, rng){
    var cfg = W();
    if (!state) return defaultWeather();
    var id = state.id || 'wx_clear';
    var t = (state.t || 0) + (dt || 0);
    var cd = state.cd && Object.keys(state.cd).length ? Object.assign({}, state.cd) : null;
    var cdCfg = cfg.cd || {};
    var isExtreme = (weatherEffects(id).exposureGain || 0) > 0;
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
    var dayLen = (cfg.dayLen != null ? cfg.dayLen : (CFG.DAY_LEN || 3600));
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

  /* ---------- W3 接线辅助(纯函数: 各循环读取同一真源, 单点兜底) ---------- */
  /* 当前天气 id: 读 meta.weather, 老档/缺省兜底 wx_clear (零迁移) */
  function currentId(meta){
    var w = meta && meta.weather;
    return (w && w.id) || 'wx_clear';
  }
  /* 预计持续秒数: dur 区间中值 × dayLen (HUD 预计时长用; 粗估即可) */
  function expectDur(id){
    var cfg = W();
    var d = (cfg.dur && cfg.dur[id]) || [2, 5];
    var dayLen = (cfg.dayLen != null ? cfg.dayLen : (CFG.DAY_LEN || 3600));
    return ((d[0] + d[1]) / 2) * dayLen;
  }
  /* 预计剩余秒数: 中值 - 已持续 t, 不取负 */
  function expectRemain(state){
    var id = (state && state.id) || 'wx_clear';
    return Math.max(0, expectDur(id) - ((state && state.t) || 0));
  }

  /* ---------- P1a 天气预报 (issue #92) ----------
     明日预报 = 当前天气到时后最可能的切换目标: 读 transitions 权重表,
     排除冷却中(cd>0), 取权重最高者; 无转移/全冷却兑底 wx_clear。
     确定性: 不消费 rng (ADR-5 seeded RNG 纯净, 摇骰仍归导演)。 */
  function forecast(meta){
    var id = currentId(meta);
    var cfg = W();
    var tr = (cfg.transitions && cfg.transitions[id]) || { wx_clear: 1 };
    var w = meta && meta.weather && meta.weather.cd;
    var best = 'wx_clear', bestW = -1;
    for (var to in tr){
      if (w && w[to] > 0) continue;      // 冷却排除
      if (tr[to] > bestW){ bestW = tr[to]; best = to; }
    }
    return best;
  }

  /* ---------- W4 视觉参数 (ADR-15: 程序化雨/雪/雾; ADR-11 显式例外) ----------
     纯函数只读 CFG.weather.fx*: 粒子类型/密度/天色罩色, 供 world.js 渲染层
     与 node 单测。fxParams 返回 null = 无粒子无罩色的天气(渲染层静默跳过)。 */
  function fxOf(id){
    return (W().fx || {})[id] || null;
  }

  function fxParams(id){
    var f = fxOf(id);
    if (!f) return null;
    var p = {
      parts: f.parts || 'none',
      count: (f.count != null ? f.count : 0),
      tint: f.tint || null,
      tintA: (f.tintA != null ? f.tintA : 0),
      fogA: (f.fogA != null ? f.fogA : 0),
      rain: null,
      snow: null,
    };
    if (p.parts === 'rain') p.rain = (W().fxRain) || null;
    else if (p.parts === 'snow') p.snow = (W().fxSnow) || null;
    if (p.parts !== 'none' && !p.rain && !p.snow) return null;   // 声明了粒子但运动学缺失: 视为无
    if (p.parts === 'none' && !(p.tintA > 0) && !(p.fogA > 0)) return null;
    return p;
  }

  /* '#rrggbb' + alpha → 'rgba(r,g,b,a)' (天气层统一用) */
  function rgbaOf(hex, a){
    if (!hex || hex.charAt(0) !== '#') return null;
    var r = parseInt(hex.slice(1, 3), 16),
        g = parseInt(hex.slice(3, 5), 16),
        b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + (a || 0) + ')';
  }

  /* 天色罩色: 无罩色天气 → null */
  function tintRGBA(id){
    var p = fxParams(id);
    if (!p || !p.tint || !(p.tintA > 0)) return null;
    return rgbaOf(p.tint, p.tintA);
  }

  /* 视口粒子目标数: 按 fxView 参考面积缩放, caps.wxParticles 封顶 */
  function fxCount(id, w, h){
    var p = fxParams(id);
    if (!p || !(p.count > 0)) return 0;
    var view = (W().fxView) || { w: 1280, h: 720 };
    var refArea = (view.w || 1) * (view.h || 1);
    var area = Math.max(0, w || 0) * Math.max(0, h || 0);
    var cap = (CFG.caps && CFG.caps.wxParticles != null) ? CFG.caps.wxParticles : 240;
    var n = Math.round(p.count * area / refArea);
    return Math.max(0, Math.min(n, cap));
  }

  /* ---------- ADR-25: 环境气温推导纯函数 ---------- */
  /* ---------- 殖民地优先 T3: 季节 ----------
     纯函数: 由世界时钟推导「今天是一年里的哪一天、什么季节」。
     不存进存档 —— 从 clock 推导即可, 老档零迁移。 */
  function seasonAt(clock, dayLen){
    var S = CFG.seasons || {};
    var order = S.order || ['spring', 'summer', 'autumn', 'winter'];
    var per = (S.daysPerSeason != null) ? S.daysPerSeason : 6;
    var dl = (dayLen != null) ? dayLen : (CFG.DAY_LEN || 3600);
    if(!(per > 0) || !(dl > 0) || !order.length){
      return { id:'spring', index:0, day:0, dayInSeason:0, daysLeft:0,
               growMul:1, tempOffset:0, isWinter:false, name:'春', icon:'🌱' };
    }
    var day = Math.floor(Math.max(0, clock || 0) / dl);
    var yearLen = per * order.length;
    var dayOfYear = ((day % yearLen) + yearLen) % yearLen;
    var index = Math.floor(dayOfYear / per);
    var id = order[index] || order[0];
    var dayInSeason = dayOfYear - index * per;
    return {
      id: id,
      index: index,
      day: day,
      dayOfYear: dayOfYear,
      dayInSeason: dayInSeason,
      daysLeft: per - dayInSeason,          // 距离换季还有几天
      growMul: (S.growMul && S.growMul[id] != null) ? S.growMul[id] : 1,
      tempOffset: (S.tempOffset && S.tempOffset[id] != null) ? S.tempOffset[id] : 0,
      isWinter: id === 'winter',
      name: (S.names && S.names[id]) || id,
      icon: (S.icons && S.icons[id]) || '',
    };
  }
  /* 距离入冬还有几天 (已入冬 → 0) */
  function daysUntilWinter(clock, dayLen){
    var S = CFG.seasons || {};
    var order = S.order || ['spring', 'summer', 'autumn', 'winter'];
    var per = (S.daysPerSeason != null) ? S.daysPerSeason : 6;
    var wi = order.indexOf('winter');
    if(wi < 0 || !(per > 0)) return null;
    var s = seasonAt(clock, dayLen);
    if(s.isWinter) return 0;
    var span = ((wi - s.index) + order.length) % order.length;
    return (span - 1) * per + s.daysLeft;
  }

  /* 季节气温叠加在天气基础气温之上 (seasonId 可省, 老调用零改动) */
  function ambientTemperatureOf(weatherId, isDay, seasonId){
    var C = (CFG.temperature && CFG.temperature.weatherBaseTemp) || {};
    var w = C[weatherId] || C.wx_clear || { day: 22, night: 10 };
    var base = isDay !== false ? w.day : w.night;
    if(seasonId){
      var off = (CFG.seasons && CFG.seasons.tempOffset && CFG.seasons.tempOffset[seasonId]) || 0;
      return base + off;
    }
    return base;
  }

  return {
    weatherDefs: weatherDefs,
    defaultWeather: defaultWeather,
    tickWeather: tickWeather,
    weatherEffects: weatherEffects,
    currentId: currentId,
    expectDur: expectDur,
    expectRemain: expectRemain,
    forecast: forecast,
    ambientTemperatureOf: ambientTemperatureOf,
    seasonAt: seasonAt, daysUntilWinter: daysUntilWinter,
    /* W4 视觉 (程序化粒子/天色) */
    fxParams: fxParams,
    rgbaOf: rgbaOf,
    tintRGBA: tintRGBA,
    fxCount: fxCount,
  };
})();
