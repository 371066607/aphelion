/* ============================================================
   Aphelion · colony.js — 殖民地场景 (设计支柱: 殖民地优先)
   挂载: window.APH.Colony
   殖民地 = 家 = 安全区:
     - 无敌人/无氧气消耗
     - 发射台: 出发远征的入口
     - 仓库: 战利品卸货 → 研究点/资源
     - 建造: 研究点买建筑, 放在殖民地里(Phase4 部分建筑有战斗作用)
   ============================================================ */
window.APH = window.APH || {};

APH.Colony = (function(){
  'use strict';
  var U = APH.U, CFG = APH.CFG, T = CFG.entType;

  /* ---------- 建筑目录 (ADR-9: bl_ 前缀; 成本单位=研究点) ---------- */
  var BUILDINGS = {
    bl_landing_pad: { name:'发射台', cost:0,  size:64,
      desc:'远征出发口。永远只有一座。' },
    bl_warehouse:   { name:'仓库',   cost:30, size:52, max:3,
      desc:'+20 负重上限(永久)。' },
    bl_mine:        { name:'自动采矿机', cost:45, size:44, max:4,
      desc:'每分钟产出 2 矿材到仓库。' },
    bl_lab:         { name:'研究站', cost:60, size:48, max:2,
      desc:'每分钟 +1 研究点。' },
    bl_barracks:    { name:'兵营', cost:80, size:56, max:2,
      desc:'训练士兵驻守殖民地。(Phase4)' },
    bl_turret:      { name:'防御炮塔', cost:70, size:36, max:6,
      desc:'自动攻击来袭敌人。(Phase4 生效)' },
    bl_clinic:      { name:'医疗舱', cost:50, size:40, max:1,
      desc:'远征出发时携带 1 次急救(+40生命)。' },
  };

  function list(){ return BUILDINGS; }
  function get(id){ return BUILDINGS[id]; }

  /* ---------- 殖民地世界布局 ----------
     殖民地也是一张 2200×2200 地图, 但内容完全不同:
     居住核心在中心, 发射台在南侧, 其余空地用于建造。 */
  function buildColonyWorld(seed){
    var s = APH.state;
    var rng = U.makeRng((seed ^ 0xC010) >>> 0 || 7);

    /* 殖民地调色板(固定, 与星球区分) */
    var spec = {
      v:1, id:'COLONY_HOME', seed:seed, name:'新曙光殖民地', paletteName:'家园',
      palette:{ ground1:'#1c2419', ground2:'#27331f', accent:'#ffc857',
                water:'#14314a', spore:'#ffe9b0' },
      terrain:{ lakeR:90, rockDensity:.35, crystalDensity:.15 },
      laws:[], beacons:[],
      enemies:{ factions:[], weights:{} },
      rivals:[],
      generatedBy:'colony',
    };
    s.spec = spec;
    s.totalBeacons = 0;

    /* 实体重建: 玩家出生在居住舱旁 */
    s.entities = [];
    var spawnX = CFG.HAB.x, spawnY = CFG.HAB.y + 110;
    s.entities.push({ id:'player', type:T.PLAYER, x:spawnX, y:spawnY });
    s.px = spawnX; s.py = spawnY;
    s.camX = spawnX; s.camY = spawnY;

    /* 少量岩石装饰(避开核心区) */
    var placed=0, guard=0;
    while(placed < 22 && guard++ < 300){
      var x = rng()*(CFG.WORLD-160)+80, y = rng()*(CFG.WORLD-160)+80;
      if(U.dst(x,y,CFG.HAB.x,CFG.HAB.y) < 260) continue;
      if(U.dst(x,y,CFG.HAB.x,CFG.HAB.y+240) < 140) continue;   // 发射台区
      s.entities.push(APH.Ent.makeRock(x,y,rng));
      placed++;
    }

    /* 已建建筑实体化 */
    s.colony.buildings.forEach(function(b){ placeBuildingEntity(b.id, b.x, b.y); });
    ensurePad();
  }

  /* ---------- 建筑实体 ---------- */
  function placeBuildingEntity(bid, x, y){
    var s = APH.state;
    var def = BUILDINGS[bid];
    s.entities.push({
      id:'be_'+bid+'_'+s.colony.buildings.length,
      type:T.BUILDING, bid:bid, x:x, y:y, def:def,
    });
  }

  /* 发射台保证存在(固定南侧位置) */
  function ensurePad(){
    var s = APH.state;
    if(s.entities.some(function(e){ return e.type===T.BUILDING && e.bid==='bl_landing_pad'; })) return;
    var px = CFG.HAB.x, py = CFG.HAB.y + 240;
    s.entities.push({
      id:'be_pad', type:T.BUILDING, bid:'bl_landing_pad', x:px, y:py,
      def:BUILDINGS.bl_landing_pad, pad:true,
    });
  }

  /* ---------- 建造逻辑(纯函数部分) ---------- */
  /* 可否建造: 资源够 + 数量未满 + 位置合法(离核心/其他建筑不太近) */
  function canPlace(colonyBuildings, research, bid, x, y){
    var def = BUILDINGS[bid];
    if(!def) return { ok:false, why:'未知建筑' };
    if(def.cost > research) return { ok:false, why:'研究点不足 (需 '+def.cost+')' };
    if(!def.pad && colonyBuildings.filter(function(b){return b.id===bid;}).length >= (def.max||99))
      return { ok:false, why:'已达数量上限' };
    if(U.dst(x,y,CFG.HAB.x,CFG.HAB.y) < 130) return { ok:false, why:'离居住核心太近' };
    for(var i=0;i<colonyBuildings.length;i++){
      var b = colonyBuildings[i];
      var other = BUILDINGS[b.id];
      var minD = (def.size + (other?other.size:40)) * .62;
      if(U.dst(x,y,b.x,b.y) < minD) return { ok:false, why:'与其他建筑重叠' };
    }
    if(x<60||y<60||x>CFG.WORLD-60||y>CFG.WORLD-60) return { ok:false, why:'超出殖民地边界' };
    return { ok:true };
  }

  /* ---------- 生产 tick (每30游戏秒一跳) ---------- */
  function productionTick(meta, buildings){
    var out = { mineral:0, research:0 };
    buildings.forEach(function(b){
      if(b.id==='bl_mine') out.mineral += 2;
      if(b.id==='bl_lab') out.research += 1;
    });
    meta.res.mineral = (meta.res.mineral||0) + out.mineral;
    meta.research += out.research;
    return out;
  }


  /* ---------- 科技树 v1 (ADR-9: te_ 前缀; 消耗研究点) ----------
     effect 字段由 applyTech 解释, 永不直接改数值。 */
  var TECHS = {
    te_o2tank:   { name:'氧气罐扩容', cost:40, max:3,
                   desc:'氧气上限 +25', effect:{ o2Max:+25 } },
    te_weaponry: { name:'等离子强化', cost:60, max:3,
                   desc:'武器伤害 +30%', effect:{ dmgMul:.30 } },
    te_radar:    { name:'深空雷达', cost:50, max:2,
                   desc:'罗盘显示所有信标距离', effect:{ radar:true } },
    exo_suit:    { name:'外骨骼', cost:90, max:2,
                   desc:'移动速度 +15%', effect:{ spdMul:.15 } },
  };

  /* 可购判定(纯函数) */
  function canBuy(meta, techId, owned){
    var t=TECHS[techId];
    if(!t) return { ok:false, why:'未知科技' };
    if((owned[techId]||0)>=t.max) return { ok:false, why:'已达最高等级' };
    if(meta.research < t.cost) return { ok:false, why:'研究点不足 (需 '+t.cost+')' };
    return { ok:true };
  }

  /* 购买并应用效果(世界侧): 返回更新后的 owned */
  function buyTech(meta, techId, owned){
    var chk=canBuy(meta, techId, owned);
    if(!chk.ok) return { ok:false, owned:owned };
    meta.research -= TECHS[techId].cost;
    var o = Object.assign({}, owned);
    o[techId]=(o[techId]||0)+1;
    return { ok:true, owned:o };
  }

  return {
    list:list, get:get,
    TECHS:TECHS, canBuy:canBuy, buyTech:buyTech,
    buildColonyWorld:buildColonyWorld,
    canPlace:canPlace, productionTick:productionTick,
    ensurePad:ensurePad,
  };
})();
