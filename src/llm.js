/* ============================================================
   Aphelion · llm.js — LLM 服务层 (ADR-10: 只产数据不产逻辑)
   挂载: window.APH.LLM
   职责:
     - OpenAI 兼容 chat/completions adapter(JSON模式+超时)
     - 双层缓存(localStorage, 同请求永不再花钱)
     - 每日配额
     - extractJSON / mergeEnrichment —— 纯函数(node 可测)
   无配置时 enabled()===false, 一切调用静默走程序降级。
   ============================================================ */
window.APH = window.APH || {};

APH.LLM = (function(){
  'use strict';
  var U = APH.U, CFG = APH.CFG;

  /* ---------- 设置(存 meta, 不落代码) ---------- */
  function conf(){
    var m = APH.state.meta;
    if(!m.llm) m.llm = { endpoint:'', key:'', model:'' };
    return m.llm;
  }
  function setConf(endpoint, key, model){
    var c = conf();
    c.endpoint = endpoint.trim().replace(/\/+$/,'');
    c.key = key.trim();
    c.model = model.trim();
    APH.Save.saveMeta(APH.state.meta);
  }
  function enabled(){
    var c = conf();
    return !!(c.endpoint && c.key && c.model);
  }

  /* ---------- 缓存 ---------- */
  function cacheKey(obj){
    var s = JSON.stringify(obj);
    var h = 2166136261;
    for(var i=0;i<s.length;i++){
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h>>>0).toString(36);
  }
  function cacheGet(k){
    try{ return JSON.parse(localStorage.getItem('aphelion_llmc_'+k) || 'null'); }
    catch(e){ return null; }
  }
  function cacheSet(k,v){
    try{ localStorage.setItem('aphelion_llmc_'+k, JSON.stringify(v)); }catch(e){}
  }

  /* ---------- 每日配额 ---------- */
  function quotaInfo(){
    var m = APH.state.meta;
    var today = new Date().toISOString().slice(0,10);
    if(m.llmDay !== today){ return { used:0, left:CFG.llm.dailyLimit }; }
    return { used:m.llmUsed||0, left:Math.max(0, CFG.llm.dailyLimit-(m.llmUsed||0)) };
  }
  function quotaUse(){
    var m = APH.state.meta;
    var today = new Date().toISOString().slice(0,10);
    if(m.llmDay !== today){ m.llmDay=today; m.llmUsed=0; }
    m.llmUsed = (m.llmUsed||0)+1;
    APH.Save.saveMeta(m);
  }

  /* ---------- 网络调用 ---------- */
  function chat(system, user, maxTokens){
    var c = conf();
    /* Node/旧环境无 fetch 时直接失败(测试路径不会走到这) */
    if(typeof fetch === 'undefined') return Promise.reject(new Error('no fetch'));
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function(){ if(ctrl) ctrl.abort(); }, CFG.llm.timeoutMs);
    return fetch(c.endpoint + '/chat/completions', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer '+c.key },
      body: JSON.stringify({
        model:c.model,
        messages:[ {role:'system', content:system}, {role:'user', content:user} ],
        temperature:0.9,
        max_tokens:maxTokens||1400,
      }),
      signal: ctrl ? ctrl.signal : undefined,
    }).then(function(res){
      clearTimeout(timer);
      if(!res.ok) throw new Error('HTTP '+res.status);
      return res.json();
    }).then(function(data){
      return data.choices[0].message.content;
    });
  }

  /* ---------- 纯函数: 从任意文本提取 JSON 对象 ---------- */
  function extractJSON(text){
    if(typeof text !== 'string') return null;
    var t = text.replace(/```json|```/g, '');
    var a = t.indexOf('{'), b = t.lastIndexOf('}');
    if(a < 0 || b <= a) return null;
    try{ return JSON.parse(t.slice(a, b+1)); }
    catch(e){ return null; }
  }

  /* ---------- 生成入口(带缓存/配额/重试) ----------
     返回 Promise<obj|null>: null = 失败, 调用方走降级 */
  function generate(cacheName, inputObj, system, user){
    if(!enabled()) return Promise.resolve(null);
    if(quotaInfo().left <= 0) return Promise.resolve(null);
    var ck = cacheKey({ n:cacheName, i:inputObj });
    var hit = cacheGet(ck);
    if(hit) return Promise.resolve(hit);
    quotaUse();
    return chat(system, user)
      .then(function(raw){
        var obj = extractJSON(raw);
        if(!obj) throw new Error('bad json');
        cacheSet(ck, obj);
        return obj;
      })
      .catch(function(err){
        console.warn('[llm]', err.message || err);
        return null;
      });
  }

  /* ============================================================
     星球富化: enrichment 合并进 PlanetSpec —— 纯函数
     规则(ADR-1 只增不改):
       - 只替换 name/lore 类字段, 永不动 id/坐标/数值结构
       - 数组长度不匹配 → 该段整体忽略(保留降级文案)
       - 输出仍通过 Planet.validate
     ============================================================ */
  function mergeEnrichment(spec, en){
    if(!en || typeof en !== 'object') return spec;
    var out = JSON.parse(JSON.stringify(spec));
    out.generatedBy = 'llm';

    if(typeof en.planetName === 'string' && en.planetName.length >= 2 && en.planetName.length <= 24)
      out.name = en.planetName.slice(0,24);
    if(typeof en.paletteName === 'string' && en.paletteName.length >= 2 && en.paletteName.length <= 12)
      out.paletteName = en.paletteName.slice(0,12);

    /* 信标档案: 长度必须一致, 逐条校验 */
    if(Array.isArray(en.beaconLore) && en.beaconLore.length === out.beacons.length){
      var okAll = en.beaconLore.every(function(b){
        return b && typeof b.lore === 'string' && b.lore.length >= 8;
      });
      if(okAll) out.beacons.forEach(function(bk, i){
        bk.lore = en.beaconLore[i].lore.slice(0, 220);
        if(typeof en.beaconLore[i].title === 'string' && en.beaconLore[i].title.length >= 2){
          /* 保留「信标 α · 」前缀格式 */
          var prefix = bk.name.split('·')[0];
          bk.name = prefix + '· ' + en.beaconLore[i].title.slice(0,14);
        }
      });
    }

    /* 法则: 按 id 匹配替换文案, 不认识的 id 忽略 */
    if(Array.isArray(en.laws)){
      en.laws.forEach(function(l){
        if(!l || typeof l.id !== 'string') return;
        var target = out.laws.find(function(x){ return x.id === l.id; });
        if(!target) return;
        if(typeof l.name === 'string' && l.name.length >= 2) target.name = l.name.slice(0,16);
        if(typeof l.fact === 'string' && l.fact.length >= 8) target.fact = l.fact.slice(0,80);
      });
    }

    /* 敌人阵营名/传说: 按 fx_ id 匹配 */
    if(Array.isArray(en.factions)){
      en.factions.forEach(function(f){
        if(!f || typeof f.id !== 'string') return;
        var target = out.enemies.factions.find(function(x){ return x.id === f.id; });
        if(!target) return;
        if(typeof f.name === 'string' && f.name.length >= 2) target.name = f.name.slice(0,12);
        if(typeof f.lore === 'string' && f.lore.length >= 8) target.lore = f.lore.slice(0,160);
      });
    }

    var v = APH.Planet.validate(out);
    return v.ok ? out : spec;
  }

  /* ---------- 星球富化入口(异步, 失败返回原 spec) ---------- */
  function enrichPlanet(spec){
    if(!enabled()) return Promise.resolve(spec);
    var m = APH.state.meta;
    var bio = '玩家已着陆'+m.stats.landings+'次, 死亡'+m.stats.deaths+'次, 击杀'+m.stats.kills+
              '个生物, 研究'+m.research+'点。';
    var user = '为外星勘测游戏生成一颗星球的中文档案。现有骨架:\n'+
      JSON.stringify({
        seed:spec.seed,
        beacons:spec.beacons.map(function(b){ return { id:b.id, old:b.name }; }),
        laws:spec.laws.map(function(l){ return { id:l.id, zone:l.zone }; }),
        factions:spec.enemies.factions.map(function(f){ return { id:f.id, behavior:f.behavior }; }),
      }, null, 0)+'\n'+
      '玩家履历: '+bio+'\n'+
      '只输出 JSON(不要多余文本), 结构:\n'+
      '{"planetName":"6字内星球中文名","paletteName":"4字内地貌名",\n'+
      ' "beaconLore":[{"title":"4字内异常代号","lore":"40-90字档案, 可引用玩家履历制造既视感"}],\n'+
      ' "laws":[{"id":"原id照抄","name":"4-8字法则名","fact":"30字内效果描述"}],\n'+
      ' "factions":[{"id":"原id照抄","name":"3-6字生物名","lore":"25-60字生态描述"}]}\n'+
      '风格: 克苏鲁式冷静异质感, 不用感叹号, 不出现"玩家"二字。';
    var system = '你是科幻游戏的程序化叙事引擎, 只输出合法 JSON。';
    return generate('planet_v1', { seed:spec.seed, landings:m.stats.landings },
                    system, user)
      .then(function(en){ return en ? mergeEnrichment(spec, en) : spec; });
  }

  return {
    enabled:enabled, conf:conf, setConf:setConf,
    cacheKey:cacheKey, quotaInfo:quotaInfo, quotaUse:quotaUse,
    extractJSON:extractJSON, mergeEnrichment:mergeEnrichment,
    enrichPlanet:enrichPlanet, generate:generate,
  };
})();
