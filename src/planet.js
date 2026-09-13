/* ============================================================
   Aphelion · planet.js — PlanetSpec 生成 (ADR-1 数据契约 v1)
   挂载: window.APH.Planet
   fallbackPlanet(seed): 纯程序生成完整 PlanetSpec(不调 LLM)。
   Phase2 的 llm.js 生成后经 schema 校验、逐字段回退到本生成器。
   游戏运行时永远只消费 PlanetSpec, 不知道它来自哪条路径。
   ============================================================ */
window.APH = window.APH || {};

APH.Planet = (function(){
  'use strict';
  var U = APH.U, CFG = APH.CFG;

  /* ---------- 4 大异星奇幻生态群系 (ADR-9 biome_ 前缀) ---------- */
  var BIOMES = {
    biome_spore_forest: {
      id: 'biome_spore_forest',
      name: '荧光菌林星',
      desc: '充满浮游光孢与自发光真菌的恒夜菌林',
      lawId: 'lw_bioglow',
      primaryFlora: 'flora_glow',
      primaryCrop: 'crop_glow_shroom',
      palette: { ground1: '#18122b', ground2: '#241a3d', accent: '#59d9ff', water: '#311b4a', spore: '#7dffab' }
    },
    biome_crystal_wasteland: {
      id: 'biome_crystal_wasteland',
      name: '晶脉硅蚀荒原',
      desc: '耸立尖锐晶簇与高导电硅砂的共振荒原',
      lawId: 'lw_crystal_resonance',
      primaryFlora: 'flora_crystal',
      primaryCrop: 'crop_crystal_vine',
      palette: { ground1: '#2b1828', ground2: '#3d2138', accent: '#ff9ad0', water: '#542848', spore: '#ffe9b0' }
    },
    biome_acid_marsh: {
      id: 'biome_acid_marsh',
      name: '酸蚀巨沼星',
      desc: '地表弥漫硫磺毒雾与间歇酸泉的剧毒巨沼',
      lawId: 'lw_acid_mist',
      primaryFlora: 'flora_dew',
      primaryCrop: 'crop_dew_fruit',
      palette: { ground1: '#19281a', ground2: '#233824', accent: '#b8e986', water: '#2e4a1a', spore: '#d4ff7d' }
    },
    biome_cryo_tundra: {
      id: 'biome_cryo_tundra',
      name: '极地银霜雪原',
      desc: '暴风雪呼啸、凝结冰霜晶花的极寒银白冰原',
      lawId: 'lw_cryo_freeze',
      primaryFlora: 'flora_star',
      primaryCrop: 'crop_star_velvet',
      palette: { ground1: '#1a2636', ground2: '#26364a', accent: '#e0f7fa', water: '#3a5575', spore: '#b2ebf2' }
    }
  };

  var BIOME_KEYS = ['biome_spore_forest', 'biome_crystal_wasteland', 'biome_acid_marsh', 'biome_cryo_tundra'];

  function biomeOf(seed){
    var rng = U.makeRng((seed ^ 0xB103E) >>> 0 || 43);
    var key = BIOME_KEYS[Math.floor(rng() * BIOME_KEYS.length)];
    return Object.assign({}, BIOMES[key]);
  }

  /* ---------- 调色板池（Phase2 由 LLM 扩充） ---------- */
  var PALETTES = [
    { name:'苔原类地', ground1:'#1f2824', ground2:'#2a3730', accent:'#ffc857', water:'#1c3d54', spore:'#9fe8c8' },
    { name:'铁锈荒漠', ground1:'#2b2018', ground2:'#3d2c1e', accent:'#ffb45f', water:'#4a3a28', spore:'#e8c89f' },
    { name:'蓝藻冻土', ground1:'#18202b', ground2:'#22303f', accent:'#59d9ff', water:'#123044', spore:'#a8d8ff' },
    { name:'硫磺峡谷', ground1:'#2b2416', ground2:'#403318', accent:'#ffd166', water:'#3d4a1e', spore:'#e8e39f' },
  ];

  /* ---------- 敌对殖民地名字池（Phase4 用, 先占位） ---------- */
  var RIVAL_NAMES = ['铁砧前哨','灰烬商会','静默方舟','赤砂军团','深空开拓团'];
  var RIVAL_TRAITS = ['aggressive','expansionist','trader'];

  /* ---------- 信标档案池（降级文案, Phase2 由 LLM 替换） ---------- */
  var LORE_POOL = [
    { name:'「回声」', lore:'它仍在重复七年前的登陆广播——用的是你的声音。而你还没有录过任何广播。' },
    { name:'「倒悬之林」', lore:'周边植物根系朝上生长，像被某种温和的力托着。土壤样本显示：这里曾有不同的重力。' },
    { name:'「玻璃之海」', lore:'沙地在正午熔成过液体。信标背光面 −40°C，向光面足以点燃纸张。' },
    { name:'「低语环」', lore:'靠近时耳机里出现规律的低频脉冲。破译后只有一句话：别在夜里走向湖。' },
    { name:'「山之眼」', lore:'岩层中有一个完美的圆形洞穴，直径与深井档案里的「井」完全一致。它们是同一年龄的。' },
    { name:'「第七个脚印」', lore:'信标周围有一串脚印通向荒原深处，一共七个——你是第六个。' },
    { name:'「空摇篮」', lore:'信标底座围着一圈整齐的卵形石，每一枚都被精确剖成两半。切口是新的。' },
    { name:'「静默塔」', lore:'它不广播任何信号，但所有罗盘在它周围都指向它自己。' },
  ];
  var LAW_POOL = [
    { id:'lw_bioglow', name:'生物微光', fact:'荧光植物柔化黑夜暗幕，探索视野开阔', zone:'forest' },
    { id:'lw_crystal_resonance', name:'晶体共振', fact:'等离子武器在晶簇周围散射强化 +40%', zone:'crystal' },
    { id:'lw_acid_mist', name:'酸蚀浓雾', fact:'室外弥漫强酸气体，持续累积暴露值', zone:'marsh' },
    { id:'lw_cryo_freeze', name:'极地寒流', fact:'极寒原野使移动速度-15%并累积寒冷外伤', zone:'tundra' },
    { id:'lw_night_acid', name:'夜间水体酸化', fact:'夜间接触湖水造成腐蚀伤害', zone:'lake' },
    { id:'lw_spore_light', name:'孢子趋光性', fact:'携带光源可吸引孢子开路', zone:'forest' },
    { id:'lw_storm', name:'磁暴周期', fact:'固定周期内磁暴必然造访高地', zone:'ridge' },
    { id:'lw_echo', name:'声追者', fact:'某些猎手循声而来, 目不能视', zone:'wild' },
  ];

  /* ---------- 敌人阵营池（形态基因, ADR-9: fx_ 前缀） ----------
     behavior: melee_swarm(近战群冲) | spitter(远程酸吐) | tank(重装缓慢)
     gene 字段驱动 drawEnemy 程序化绘制。Phase2 由 LLM 扩充。 */
  var ENEMY_FACTIONS = [
    { id:'fx_maw', name:'噬光群囊', behavior:'melee_swarm',
      gene:{hue:285,sides:5,limbs:6,size:1.0,spikes:3,eyes:2},
      hp:26, speed:96, dmg:8, nightBoost:1.35,
      lore:'它们在黑暗中繁殖，光会让它们迟疑。' },
    { id:'fx_spit', name:'酸吐者', behavior:'spitter',
      gene:{hue:95,sides:6,limbs:4,size:1.15,spikes:1,eyes:4},
      hp:20, speed:64, dmg:7, nightBoost:1.15,
      lore:'它从不靠近，只是隔着三十米把胃液吐过来。' },
    { id:'fx_bulwark', name:'硅壳壁垒', behavior:'tank',
      gene:{hue:210,sides:7,limbs:8,size:1.45,spikes:5,eyes:2},
      hp:70, speed:44, dmg:14, nightBoost:1.05,
      lore:'矿物的甲壳、生物的心跳。子弹会在它身上弹开一半。' },
  ];

  /* ADR-24: 遗迹专属机械族守卫阵营 */
  var AUTOMATON_FACTION = {
    id:'fx_automaton', name:'远古哨兵机械体', behavior:'sentry_automaton',
    gene:{hue:190,sides:8,limbs:4,size:1.3,spikes:0,eyes:1},
    hp:50, maxHp:50, shield:40, maxShield:40, speed:50, dmg:16, nightBoost:1.0,
    lore:'史前文明遗留的自律防御机械，能量护盾未击破前刀枪不入。'
  };

  /* ---------- 希腊字母信标命名 ---------- */
  var GREEK = ['α','β','γ','δ','ε','ζ','η','θ'];

  /* ---------- 生成 PlanetSpec ----------
     确定性: 同 seed 永远同一颗星球 (ADR-5) */
  function fallbackPlanet(seed, options){
    seed=seed>>>0;options=options||{};
    var rng = U.makeRng(seed);
    function pick(arr){ return arr[Math.floor(rng()*arr.length)]; }
    function rr(a,b){ return a+rng()*(b-a); }

    var b = biomeOf(seed);
    var pal = b.palette || pick(PALETTES);
    /* 旧调用保留低 12 位 ID，不能重命名已落盘星球；新发现显式传完整 ID。 */
    var id = options.id || ('P' + (seed % 4096).toString(16).toUpperCase());

    /* 信标: 6 座, 撒在世界内并避开湖/基地 */
    var beacons = [];
    var guard = 0;
    while(beacons.length < 6 && guard++ < 400){
      var bx = Math.floor(120 + rng() * (APH.CFG.WORLD - 240));
      var by = Math.floor(120 + rng() * (APH.CFG.WORLD - 240));
      var dHab = U.dst(bx,by,APH.CFG.HAB.x,APH.CFG.HAB.y);
      var dLake = U.dst(bx,by,APH.CFG.LAKE.x,APH.CFG.LAKE.y);
      var tooClose = beacons.some(function(b){ return U.dst(bx,by,b.x,b.y) < 420; });
      if(dHab < 220 || dLake < 200 || tooClose) continue;
      var lore = LORE_POOL[(beacons.length + Math.floor(rng()*2)) % LORE_POOL.length];
      beacons.push({
        id: 'bk_' + id + '_' + beacons.length,
        x: bx, y: by,
        name: '信标 ' + GREEK[beacons.length] + ' · ' + lore.name,
        lore: lore.lore,
      });
    }

    /* 法则: 优先包含群系核心法则 + 抽 1~2 条辅助法则 (Biome #41) */
    var coreLaw = LAW_POOL.find(function(l){ return l.id === b.lawId; }) || LAW_POOL[0];
    var laws = [{
      id: coreLaw.id, name: coreLaw.name,
      fact: coreLaw.fact, zone: coreLaw.zone,
      discovered: false
    }];
    var shuffled = LAW_POOL.filter(function(l){ return l.id !== b.lawId; }).sort(function(){ return rng() - .5; });
    var lawCount = 1 + Math.floor(rng() * 2);
    for(var i = 0; i < lawCount; i++){
      laws.push({
        id: shuffled[i].id, name: shuffled[i].name,
        fact: shuffled[i].fact, zone: shuffled[i].zone,
        discovered: false,
      });
    }

    /* 敌对殖民地: 1~2 个 (Phase4 激活, 数据先行) */
    var rivals = [];
    var rivalCount = 1 + Math.floor(rng() * 2);
    for(var r = 0; r < rivalCount; r++){
      var ang = rng() * U.TAU;
      var rad = 700 + rng() * 250;
      rivals.push({
        id: 'rv_' + id + '_' + r,
        name: pick(RIVAL_NAMES),
        trait: pick(RIVAL_TRAITS),
        color: ['#ff6d4a','#c39bff','#7dffab','#ffb45f'][Math.floor(rng()*4)],
        base: {
          x: Math.floor(APH.CFG.HAB.x + Math.cos(ang) * rad),
          y: Math.floor(APH.CFG.HAB.y + Math.sin(ang) * rad),
        },
        military: 10, economy: 10, warScore: 0,
      });
    }

    /* 敌人阵营: 全部3种 + 权重(近战为主); hp 按 tier 缩放(T2) */
    var tier = tierOf(seed);
    var tierHpMul = [1, 1.25, 1.6][tier-1];
    var factions = ENEMY_FACTIONS.map(function(f){
      return {
        id:f.id, name:f.name, behavior:f.behavior,
        gene:{ hue:(f.gene.hue + Math.floor(rng()*24-12) + 360) % 360,
               sides:f.gene.sides, limbs:f.gene.limbs,
               size:f.gene.size, spikes:f.gene.spikes, eyes:f.gene.eyes },
        hp:Math.round(f.hp*tierHpMul), speed:f.speed, dmg:f.dmg, nightBoost:f.nightBoost,
        lore:f.lore,
      };
    });
    var weights = { fx_maw:.55, fx_spit:.28, fx_bulwark:.17 };

    return {
      v: 1,
      id: id,
      seed: seed,
      name: 'APH-' + id,
      biome: b,
      paletteName: b.name || pal.name,
      palette: { ground1:pal.ground1, ground2:pal.ground2, accent:pal.accent,
                 water:pal.water, spore:pal.spore },
      terrain: {
        lakeR: Math.floor(rr(120, 170)),
        rockDensity: +rr(0.5, 0.9).toFixed(2),
        crystalDensity: +rr(0.4, 0.8).toFixed(2),
      },
      laws: laws,
      beacons: beacons,
      enemies: { factions: factions, weights: weights },
      rivals: rivals,
      tier: tier,
      generatedBy: 'fallback',
    };
  }

  function idForSeed(seed){
    var hex=(seed>>>0).toString(16).toUpperCase();
    return 'P'+('00000000'+hex).slice(-8);
  }

  function landingGroundPins(biomeId,widthCells,heightCells){
    var observe=CFG.observe||{},profile=observe.biomes&&observe.biomes[biomeId];
    if(!profile||!Array.isArray(profile.tiles)||!profile.tiles.length)return [];
    var semantics=observe.tileSemantics||{},tile=profile.dryTile||null;
    if(!tile)for(var i=0;i<profile.tiles.length;i++){
      var candidate=profile.tiles[i].id,meaning=semantics[candidate]||{};
      if(!meaning.water&&!meaning.shore){tile=candidate;break;}
    }
    if(!tile)return [];
    var grid=CFG.GRID,cx=Math.floor(CFG.HAB.x/grid),cy=Math.floor(CFG.HAB.y/grid);
    var radius=Math.max(0,Math.floor(Number(CFG.expedition.landingSafeRadiusCells)||0)),pins=[];
    for(var gy=cy-radius;gy<=cy+radius;gy++)for(var gx=cx-radius;gx<=cx+radius;gx++){
      if(gx>=0&&gy>=0&&gx<widthCells&&gy<heightCells)pins.push({gx:gx,gy:gy,tile:tile});
    }
    return pins;
  }

  function newObservedPlanet(seed){
    seed=seed>>>0;
    var spec=fallbackPlanet(seed,{id:idForSeed(seed)}),grid=CFG.GRID;
    var widthCells=Math.ceil(CFG.WORLD/grid),heightCells=Math.ceil(CFG.WORLD/grid);
    spec.observation=APH.Observe.observe({seed:seed,biomeId:spec.biome.id,
      widthCells:widthCells,heightCells:heightCells,
      groundPins:landingGroundPins(spec.biome.id,widthCells,heightCells)});
    return spec;
  }

  /* ---------- Schema 校验 (Phase2 LLM 路径用) ----------
     返回 { ok:true, spec } 或 { ok:false, errors:[...] } */
  /* ---------- 难度分级 (T2, 纯函数) ----------
     seed 哈希 → tier 1/2/3: 影响敌人 hp 与刷怪间隔。约50%/30%/20%分布 */
  function tierOf(seed){
    /* mulberry32 首抽(ADR-5 已验证的均匀性) ×100 取整 */
    var rng = U.makeRng((seed ^ 0x713C4A11) >>> 0);
    var h = Math.floor(rng()*100);
    if(h < 50) return 1;
    if(h < 80) return 2;
    return 3;
  }

  function validate(spec){
    var errors = [];
    if(!spec || typeof spec !== 'object') return { ok:false, errors:['not an object'] };
    function finite(v){return typeof v==='number'&&isFinite(v);}
    if(spec.v!==1) errors.push('v must be 1');
    if(typeof spec.id!=='string'||!spec.id) errors.push('missing id');
    if(!finite(spec.seed)||spec.seed!==(spec.seed>>>0)) errors.push('invalid seed');
    if(typeof spec.name!=='string'||!spec.name) errors.push('missing name');
    if(!spec.biome||typeof spec.biome.id!=='string'||!spec.biome.id) errors.push('missing biome');
    if(!Array.isArray(spec.beacons) || spec.beacons.length < 4)
      errors.push('beacons must be array of >=4');
    else spec.beacons.forEach(function(b,i){
      if(!b||typeof b!=='object')errors.push('beacon['+i+'] invalid');
      else{
        if(!finite(b.x)||!finite(b.y)) errors.push('beacon['+i+'] pos');
        if(typeof b.id!=='string'||!b.id||typeof b.name!=='string'||!b.name) errors.push('beacon['+i+'] identity');
      }
    });
    if(!Array.isArray(spec.laws)) errors.push('laws must be array');
    else spec.laws.forEach(function(l,i){
      if(!l||typeof l!=='object'||typeof l.id!=='string'||!l.id||typeof l.name!=='string'||!l.name||
        typeof l.fact!=='string')errors.push('law['+i+'] invalid');
    });
    if(!Array.isArray(spec.rivals)) errors.push('rivals must be array');
    else spec.rivals.forEach(function(r,i){
      if(!r||typeof r!=='object'||typeof r.id!=='string'||!r.id||typeof r.name!=='string'||!r.name||
        !r.base||!finite(r.base.x)||!finite(r.base.y))errors.push('rival['+i+'] invalid');
    });
    if(!spec.palette||typeof spec.palette!=='object'||
      ['ground1','ground2','accent','water','spore'].some(function(k){return typeof spec.palette[k]!=='string'||!spec.palette[k];}))
      errors.push('invalid palette');
    if(!spec.terrain||typeof spec.terrain!=='object'||!finite(spec.terrain.lakeR)||!finite(spec.terrain.rockDensity)||!finite(spec.terrain.crystalDensity))
      errors.push('invalid terrain');
    if(!spec.enemies||typeof spec.enemies!=='object'||!Array.isArray(spec.enemies.factions)||!spec.enemies.factions.length||
      !spec.enemies.weights||typeof spec.enemies.weights!=='object') errors.push('invalid enemies');
    else spec.enemies.factions.forEach(function(f,i){
      var gene=f&&f.gene;
      if(!f||typeof f.id!=='string'||!f.id||typeof f.name!=='string'||!f.name||typeof f.behavior!=='string'||!f.behavior||!gene||
        ['hue','sides','limbs','size','spikes','eyes'].some(function(k){return !finite(gene[k]);})||
        !finite(f.hp)||f.hp<=0||!finite(f.speed)||f.speed<=0||!finite(f.dmg)||f.dmg<=0)
        errors.push('enemy['+i+'] invalid');
    });
    if(spec.observation){
      var descriptor={v:1,kind:'expedition',generation:1,seed:spec.seed,grid:CFG.GRID,observation:spec.observation};
      if(!APH.TerrainModel||!APH.TerrainModel.hasObservation(descriptor)) errors.push('invalid observation');
      if(!spec.biome||spec.observation.biomeId!==spec.biome.id) errors.push('observation biome mismatch');
    }
    return errors.length ? { ok:false, errors:errors } : { ok:true, spec:spec };
  }

  function hasLaw(spec, id){
    return !!(spec && spec.laws && spec.laws.some(function(l){ return l && l.id===id; }));
  }

  /* lw_spore_light: 近距排开开路, 中距趋光靠拢。纯函数, 就地改 sp。 */
  function sporeNudge(sp, px, py, dt){
    if(!sp) return sp;
    var L = (APH.CFG && APH.CFG.laws) || {};
    var near = L.sporePartR || 52;
    var far = L.sporeAttractR || 200;
    var spd = L.sporeSpd || 36;
    var dx = px - sp.x, dy = py - sp.y;
    var d = Math.sqrt(dx*dx + dy*dy);
    if(d < 0.001){ dx = 1; dy = 0; d = 1; }
    var nx = dx / d, ny = dy / d;
    if(d < near){ sp.x -= nx * spd * dt; sp.y -= ny * spd * dt; }
    else if(d < far){ sp.x += nx * spd * 0.45 * dt; sp.y += ny * spd * 0.45 * dt; }
    var W = (APH.CFG && APH.CFG.WORLD) || 2200;
    sp.x = Math.max(20, Math.min(W - 20, sp.x));
    sp.y = Math.max(20, Math.min(W - 20, sp.y));
    return sp;
  }

  /* 殖民地家园 spec.enemies.factions 永久为空(安全区)。
     袭击刷怪从「上次远征 / fallbackPlanet / 阵营池」取一份克隆, 绝不写回家园 spec。 */
  function cloneFaction(f){
    if(!f) return null;
    var g=f.gene||{};
    return {
      id:f.id, name:f.name, behavior:f.behavior,
      gene:{ hue:g.hue, sides:g.sides, limbs:g.limbs, size:g.size, spikes:g.spikes, eyes:g.eyes },
      hp:f.hp, speed:f.speed, dmg:f.dmg, nightBoost:f.nightBoost,
      lore:f.lore,
    };
  }
  function pickFrom(list){
    if(!list || !list.length) return null;
    var f=list[Math.floor(Math.random()*list.length)];
    if(!f || f.hp==null) return null;
    return cloneFaction(f);
  }
  function pickRaidFaction(lastSpec, seed){
    var picked=pickFrom(lastSpec && lastSpec.enemies && lastSpec.enemies.factions);
    if(picked) return picked;
    var fb=fallbackPlanet((seed>>>0)||1);
    picked=pickFrom(fb.enemies && fb.enemies.factions);
    if(picked) return picked;
    return cloneFaction(ENEMY_FACTIONS[0]);
  }

  /* 远征星球野生异星植物生成 (Flora #36, Biome #42) */
  function expeditionDeposits(seed,kind){
    if(kind!=='resources')return [];
    var cfg=CFG.expedition,a=((seed>>>0)%4)*Math.PI/2;
    return cfg.resourceDeposits.map(function(d,i){
      var side=(i-(cfg.resourceDeposits.length-1)/2)*cfg.depositSpacing;
      return {id:'exp_ore_'+seed+'_'+i,type:'flora',kind:d.kind,
        x:CFG.HAB.x+Math.cos(a)*cfg.depositRadius-Math.sin(a)*side,
        y:CFG.HAB.y+Math.sin(a)*cfg.depositRadius+Math.cos(a)*side,
        hp:d.hp,maxHp:d.hp,amount:d.amount,yieldItemId:d.itemId,expeditionResource:true};
    });
  }

  function generateExpeditionFlora(seed, tier, biome){
    var rng = U.makeRng((seed ^ 0xEE7A) >>> 0 || 31);
    var out = [];
    var count = 8 + Math.floor(rng() * 4);
    var b = biome || biomeOf(seed);
    var primary = b ? (b.primaryFlora || 'flora_glow') : 'flora_glow';
    var kinds = ['flora_glow', 'flora_crystal', 'flora_dew', 'flora_star'];
    var W = (APH.CFG && APH.CFG.WORLD) || 2200;
    for(var i=0; i<count; i++){
      var kind = (rng() < 0.60) ? primary : kinds[Math.floor(rng() * kinds.length)];
      var ang = rng() * U.TAU;
      var dist = 220 + rng() * 650;
      var x = U.clamp(1100 + Math.cos(ang)*dist, 120, W-120);
      var y = U.clamp(1100 + Math.sin(ang)*dist, 120, W-120);
      out.push({
        id: 'exp_flora_' + i,
        type: 'flora',
        kind: kind,
        x: x, y: y,
        hp: 1, maxHp: 1,
        seedItem: kind==='flora_glow'?'specimen_flora_glow':(kind==='flora_crystal'?'specimen_crystal_vine':(kind==='flora_dew'?'specimen_dew':'specimen_star_velvet'))
      });
    }
    return out;
  }

  /* 群系环境氛围粒子类型派生 (Biome #44) */
  function particleTypeOf(spec){
    var bId = (spec && spec.biome && spec.biome.id) || '';
    if(bId === 'biome_cryo_tundra') return 'snow';
    if(bId === 'biome_acid_marsh') return 'steam';
    if(bId === 'biome_crystal_wasteland') return 'spark';
    return 'spore';
  }

  /* ---------- ADR-24: 远征古代遗迹确定性生成 ---------- */
  function generateAncientRuins(spec, seed){
    var s = seed != null ? seed : ((spec && spec.seed) || 1234);
    var tier = (spec && spec.tier != null) ? spec.tier : 1;
    var rng = U.makeRng((s ^ 0xA5C3) >>> 0);

    // T2/T3 必生成，T1 30% 概率生成
    if(tier < 2 && rng() > 0.30) return null;

    var G = CFG.GRID || 48;
    // 遗迹中心点放置在 [400, 1800] 区域内，远离中心着陆点 (1100, 1100) 至少 300px
    var cx = 0, cy = 0, tries = 0;
    while(tries++ < 50){
      cx = Math.floor(400 + rng() * 1400);
      cy = Math.floor(400 + rng() * 1400);
      cx = Math.floor(cx / G) * G;
      cy = Math.floor(cy / G) * G;
      if(U.dst(cx, cy, 1100, 1100) >= 300) break;
    }

    var walls = [];
    var gate = null;
    for(var dx = -2; dx <= 2; dx++){
      for(var dy = -2; dy <= 2; dy++){
        var isEdge = (dx === -2 || dx === 2 || dy === -2 || dy === 2);
        if(!isEdge) continue;
        var wx = cx + dx * G, wy = cy + dy * G;
        if(dx === 0 && dy === 2){
          gate = { type: 'ancient_gate', x: wx, y: wy, hp: 80, maxHp: 80, locked: true, broken: false };
        } else {
          walls.push({ type: 'ancient_wall', x: wx, y: wy });
        }
      }
    }

    var vault = { type: 'ancient_vault', x: cx, y: cy - G, opened: false };
    var terminal = { type: 'ancient_terminal', x: cx + G, y: cy, hacked: false };

    var sentryCount = tier >= 3 ? 2 : 1;
    var sentries = [];
    for(var si = 0; si < sentryCount; si++){
      var sx = cx + (si === 0 ? -G : G);
      var sy = cy + (si === 0 ? 0 : -G);
      sentries.push({ x: sx, y: sy, factionId: 'fx_automaton' });
    }

    return {
      cx: cx,
      cy: cy,
      w: 5 * G,
      h: 5 * G,
      walls: walls,
      gate: gate,
      terminal: terminal,
      vault: vault,
      sentries: sentries,
      revealed: false
    };
  }

  function damageAncientGate(gate, dmg){
    if(!gate) return { breached: false };
    var d = dmg != null ? dmg : 25;
    gate.hp = Math.max(0, (gate.hp != null ? gate.hp : 80) - d);
    if(gate.hp <= 0){
      gate.locked = false;
      gate.broken = true;
      return { breached: true, gate: gate };
    }
    return { breached: false, gate: gate };
  }

  function openArtifactVault(vault){
    if(!vault || vault.opened) return { opened: false, drops: [] };
    vault.opened = true;
    return {
      opened: true,
      drops: [
        { id: 'it_ancient_blueprint', n: 1 },
        { id: 'it_ancient_core', n: 1 }
      ]
    };
  }

  return { fallbackPlanet:fallbackPlanet, newObservedPlanet:newObservedPlanet,idForSeed:idForSeed,
           validate:validate, tierOf:tierOf,
           pickRaidFaction:pickRaidFaction, hasLaw:hasLaw, sporeNudge:sporeNudge,
           generateExpeditionFlora:generateExpeditionFlora, expeditionDeposits:expeditionDeposits,
           generateAncientRuins:generateAncientRuins, damageAncientGate:damageAncientGate,
           openArtifactVault:openArtifactVault,
           AUTOMATON_FACTION:AUTOMATON_FACTION,
           BIOMES:BIOMES, biomeOf:biomeOf, particleTypeOf:particleTypeOf };
})();
