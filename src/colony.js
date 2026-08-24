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
    bl_landing_pad: { name:'发射台', cost:0,  size:64, buildTime:0,
      desc:'远征出发口。永远只有一座。' },
    bl_warehouse:   { name:'仓库',   cost:30, size:52, max:3, buildTime:12,
      desc:'+20 负重上限(永久)。' },
    bl_mine:        { name:'自动采矿机', cost:45, size:44, max:4, buildTime:20,
      desc:'每30秒产出 2×等级 矿材。',
      upg:{ effectPerLv:2, maxLv:3 } },
    bl_lab:         { name:'研究站', cost:60, size:48, max:2, buildTime:25,
      desc:'+1×等级 研究点/分钟。',
      upg:{ effectPerLv:1, maxLv:2 } },
    bl_barracks:    { name:'兵营', cost:80, size:56, max:2, buildTime:30,
      desc:'训练士兵驻守殖民地。(Phase4)' },
    bl_turret:      { name:'防御炮塔', cost:70, size:36, max:6, buildTime:25,
      desc:'自动攻击来袭敌人, 伤害随等级。',
      upg:{ effectPerLv:8, maxLv:3 } },
    bl_clinic:      { name:'医疗舱', cost:50, size:40, max:1, buildTime:22,
      desc:'远征出发时携带 1 次(+40生命)。住宅容量+1。' },
    bl_farm:        { name:'水培农场', cost:35, size:52, max:4, buildTime:15,
      desc:'种植食物。有居民务农时每分钟产粮。' },
    bl_house:       { name:'居住舱', cost:40, size:46, max:6, buildTime:15,
      desc:'住宅容量 +3。居民是殖民地的心跳。' },
    bl_pasture:     { name:'畜牧圈', cost:55, size:56, max:2, buildTime:18,
      desc:'饲养星绵羊。定期产肉皮。(U6)' },
  };

  /* ---------- Task3: 建筑等级 ---------- */
  function upgradeCost(def, curLv){
    return Math.round(def.cost * Math.pow(1.6, curLv));
  }
  function canUpgrade(b, def, research){
    if (!def.upg) return {ok:false, why:'不可升级'};
    var lv = b.lv||1;
    if (lv > def.upg.maxLv) return {ok:false, why:'已达最高等级'};
    var cost = upgradeCost(def, lv);
    if (research < cost) return {ok:false, why:'研究点不足(需'+cost+')'};
    return {ok:true, cost:cost};
  }
  function mineOutput(lv){ return 2*(lv||1); }
  function labOutput(lv){ return (lv||1); }

  /* ---------- Task5: 住宅容量与拆除退款(纯函数) ---------- */
  function housingCapacity(buildings){
    var cap = 2;   // 居住舱本体基础席位
    buildings.forEach(function(b){
      if (b.id==='bl_house') cap += 3*(b.lv||1);
      if (b.id==='bl_clinic') cap += 1;
    });
    return cap;
  }
  function refundOf(def){
    if (!def || def.id==='bl_landing_pad') return 0;
    return Math.floor(def.cost/2);
  }

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
  function placeBuildingEntity(bid, x, y, lv){
    var s = APH.state;
    var def = BUILDINGS[bid];
    s.entities.push({
      id:'be_'+bid+'_'+s.colony.buildings.length,
      type:T.BUILDING, bid:bid, x:x, y:y, def:def, lv:lv||1,
      cd:0,
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

  /* ---------- U3 农田生长(纯函数) ----------
     plot {stage:0~3, t:当前阶段累计}
     每30s一跳; 有农民(skills.sk_farm)则加速。 */
  function farmTick(plot, farmerSkill){
    var need=[0,1,2,3][plot.stage];              // 各阶段所需跳数
    var speed = 1 + (farmerSkill||0)*0.12;       // 种植技能加速
    var p={stage:plot.stage, t:plot.t + speed};
    if(p.t>=need && p.stage<3){ p.stage++; p.t=0; }
    return p;
  }
  function harvestYield(plot){
    return plot.stage===3 ? 3 : 0;               // 成熟收3粮
  }

  /* ---------- U5 岗位产出(纯函数) ----------
     居民效率×主技能 → 每跳产出 */
  function jobOutput(residentsAtJob, kind){
    var total=0;
    residentsAtJob.forEach(function(r){
      var sk = kind==='farm'?'sk_farm':(kind==='ranch'?'sk_ranch':'sk_craft');
      var eff=APH.Res.efficiency(r);
      var lv=r.skills[sk]||0;
      if(lv>0) total += Math.round(eff*(1+lv*0.25)*10)/10;
    });
    return total;
  }

  /* ---------- 生产 tick (每30游戏秒一跳) ---------- */
  function productionTick(meta, buildings){
    var out = { mineral:0, research:0 };
    buildings.forEach(function(b){
      if(b.id==='bl_mine') out.mineral += mineOutput(b.lv);
      if(b.id==='bl_lab') out.research += labOutput(b.lv);
    });
    meta.res.mineral = (meta.res.mineral||0) + out.mineral;
    meta.research += out.research;
    return out;
  }


  /* ---------- Task2: 建造队列(纯函数) ----------
     并行上限3; 顺序完工。q项 {bid,x,y,remain}。
     返回 {queue:剩余, done:[{bid,x,y}]} */
  function queueTick(queue, dt){
    var done = [];
    var active = 0;
    var out = queue.map(function(item){
      if (active >= 3) return item;
      active++;
      var r = item.remain - dt;
      if (r <= 0){ done.push({bid:item.bid,x:item.x,y:item.y}); return null; }
      return Object.assign({}, item, {remain:r});
    }).filter(Boolean);
    return { queue: out, done: done };
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
    farmTick:farmTick, harvestYield:harvestYield, jobOutput:jobOutput,
    buildColonyWorld:buildColonyWorld,
    canPlace:canPlace, productionTick:productionTick,
    placeBuildingEntity:placeBuildingEntity,
    queueTick:queueTick,
    housingCapacity:housingCapacity, refundOf:refundOf,
    upgradeCost:upgradeCost, canUpgrade:canUpgrade,
    mineOutput:mineOutput, labOutput:labOutput,
    ensurePad:ensurePad,
  };
})();
