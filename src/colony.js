/* ============================================================
   Aphelion · colony.js — 殖民地场景 (设计支柱: 殖民地优先)
   挂载: window.APH.Colony
   殖民地 = 家 = 主循环:
     - 矿材盖建筑, 研究点买科技, 食物喂人
     - 有人上岗才产; 远征是补给
   ============================================================ */
window.APH = window.APH || {};

APH.Colony = (function(){
  'use strict';
  var U = APH.U, CFG = APH.CFG, T = CFG.entType;

  /* ---------- 建筑目录 (ADR-9: bl_ 前缀; 成本单位=研究点) ----------
     dispH: 目标显示内容高px(管线实测内容高→比例缩放, 治"建筑比人物矮")
     cells: 占位格[宽,高]×48px格网(ADR-4), 非全部1x1——大建筑占2x2 */
  var BUILDINGS = {
    bl_landing_pad: { name:'发射台', cost:0, costMineral:0, costRes:{}, size:64, buildTime:0,
      desc:'远征出发口。永远只有一座。' },
    bl_warehouse:   { name:'仓库',   cost:0, costMineral:20, costRes:{ wood:20, iron:15 }, size:52, max:3, buildTime:12,
      dispH:95, cells:[2,2],
      desc:'+20 负重上限。存放各种分类原材料。' },
    bl_mine:        { name:'自动采矿机', cost:0, costMineral:30, reqTech:'te_machining', costRes:{ iron:35, stone:15 }, size:44, max:4, buildTime:20,
      dispH:100, cells:[1,1],
      desc:'有矿工时每30秒产出矿料。需先研发机械锻造。',
      upg:{ effectPerLv:2, maxLv:3, cost:45 } },
    bl_lab:         { name:'研究站', cost:0, costMineral:40, costRes:{ wood:20, iron:25 }, size:48, max:2, buildTime:25,
      dispH:113, cells:[2,2],
      desc:'学者在此研发科技树。+1×等级 研究点/跳。',
      upg:{ effectPerLv:1, maxLv:2, cost:60 } },
    bl_barracks:    { name:'兵营', cost:0, costMineral:50, reqTech:'te_ballistics', costRes:{ iron:30, stone:20 }, size:56, max:2, buildTime:30,
      dispH:86, cells:[2,2],
      desc:'训练士兵驻守殖民地。需研发弹道工程。' },
    bl_turret:      { name:'防御炮塔', cost:0, costMineral:35, reqTech:'te_turret_tech', costRes:{ iron:35, stone:15 }, size:36, max:6, buildTime:25,
      dispH:68, cells:[1,1],
      desc:'自动攻击来袭敌人。需研发自动防御炮塔。',
      upg:{ effectPerLv:8, maxLv:3, cost:70 } },
    bl_clinic:      { name:'医疗舱', cost:0, costMineral:30, reqTech:'te_medicine', costRes:{ iron:25, wood:15 }, size:40, max:1, buildTime:22,
      dispH:115, cells:[2,2],
      desc:'给殖民者治病。需研发外星临床医学。' },
    bl_farm:        { name:'水培农场', cost:0, costMineral:15, reqTech:'te_hydroponics', costRes:{ iron:20, stone:10 }, size:52, max:4, buildTime:15,
      dispH:115, cells:[2,2],
      desc:'室内种植食物。需研发温控水培技术。' },
    bl_house:       { name:'居住舱', cost:0, costMineral:20, costRes:{ wood:25, stone:10 }, size:46, max:6, buildTime:15,
      dispH:128, cells:[2,2],
      desc:'住宅容量 +3。提供床位让居民睡眠。' },
    bl_pasture:     { name:'畜牧圈', cost:0, costMineral:30, costRes:{ wood:30, stone:15 }, size:56, max:2, buildTime:18,
      dispH:97, cells:[2,2],
      desc:'饲养星绵羊产肉和皮革。',
      upg:{ maxLv:2, costRes:'leather', cost:55 } },
    bl_workshop:    { name:'工坊', cost:0, costMineral:25, costRes:{ wood:15, iron:20, stone:10 }, size:48, max:2, buildTime:18,
      dispH:110, cells:[2,2],
      desc:'有工匠时将草药提炼成药品。' },
    bl_crop_plot:   { name:'外星种植圃', cost:0, costMineral:0, costRes:{ wood:10, stone:5 }, size:48, max:12, buildTime:8,
      dispH:48, cells:[1,1],
      desc:'培育外星奇幻作物的轻量田圃。可指派荧蕈、晶藤、露果、星绒草。' },
  };
  var JOB_CYCLE = [null, 'bl_crop_plot', 'bl_farm', 'bl_pasture', 'bl_mine', 'bl_workshop', 'bl_lab', 'bl_clinic'];

  /* ---------- Task3: 建筑等级 ---------- */
  function upgradeCost(def, curLv){
    var baseCost = def.cost || (def.upg && def.upg.cost) || 40;
    return Math.round(baseCost * Math.pow(1.6, curLv));
  }
  function canUpgrade(b, def, research, leather){
    if (!def.upg) return {ok:false, why:'不可升级'};
    var lv = b.lv||1;
    /* maxLv=最高可达等级: lv已到顶即拒绝(原为lv>maxLv, 实际可超限升1级) */
    if (lv >= def.upg.maxLv) return {ok:false, why:'已达最高等级'};
    var cost = upgradeCost(def, lv);
    /* 畜牧圈升级用皮革(专属货币); 其余建筑用研究点 */
    if (def.upg.costRes === 'leather'){
      if ((leather||0) < cost) return {ok:false, why:'皮革不足(需 '+cost+')'};
      return {ok:true, cost:cost, costRes:'leather'};
    }
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
    /* BUILDINGS 表的 def 无 id 字段, 用对象同一性比对发射台 */
    if (!def || def===BUILDINGS.bl_landing_pad) return 0;
    var baseCost = def.cost || (def.upg && def.upg.cost) || (def.costMineral ? Math.round(def.costMineral*1.5) : 40);
    return Math.floor(baseCost/2);
  }
  function refundMineralOf(def){
    if (!def || def===BUILDINGS.bl_landing_pad) return 0;
    return Math.floor(((def && def.costMineral)||20)/2);
  }

  /* 仓库负重加成(纯函数): 每 warehouse +20。
     取代曾直接改 CFG.player.carryMax 的做法——那会随重启丢失、拆除不回退。 */
  function carryBonus(buildings){
    var n=0;
    (buildings||[]).forEach(function(b){ if(b.id==='bl_warehouse') n++; });
    return 20*n;
  }
  function carryMaxOf(buildings){
    return CFG.player.carryMax + carryBonus(buildings);
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
      laws:climateLaws(seed), beacons:[],
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

    /* 已建建筑实体化(必须带lv——否则重载后炮塔伤害/徽点全部退回1级) */
    s.colony.buildings.forEach(function(b){ placeBuildingEntity(b.id, b.x, b.y, b.lv); });
    /* 施工队列的蓝图实体再实体化(实体不落盘而队列落盘, 重载后蓝图不可见) */
    (s.colony.buildQueue||[]).forEach(function(q){
      s.entities.push({id:'bp_'+q.bid+'_'+q.x+'_'+q.y,
        type:T.BLUEPRINT, bid:q.bid, x:q.x, y:q.y,
        progress:q.progress||0, building:false});
    });
    (s.colony.ground||[]).forEach(function(g, i){
      if(!g || !g.itemId || !g.n) return;
      s.entities.push({
        id:'dp_g_'+i+'_'+g.itemId, type:T.DROPPED,
        x:g.x, y:g.y, itemId:g.itemId, n:g.n, bobA:i*0.7, stock:true
      });
    });
    /* 程序化生成自然资源生态实体(树木/矿脉/灌木) */
    var flora = generateFlora(seed);
    flora.forEach(function(f){ s.entities.push(f); });
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
  /* 占位格: cells×48px格网(ADR-4), 中心对齐 */
  function footprintOf(bid){
    var def = BUILDINGS[bid]||{};
    var c = def.cells||[1,1];
    return { w: c[0]*CFG.GRID, h: c[1]*CFG.GRID };
  }
  /* 可否建造: 科技已解锁 + 物理材料充足 + 数量未满 + 位置合法 */
  function canPlace(colonyBuildings, techOwned, bid, x, y, resStock){
    var def = BUILDINGS[bid];
    if(!def) return { ok:false, why:'未知建筑' };

    // 1. 如果传入数字作为 research (旧测试/旧调用)，且 def.cost > 0
    if(typeof techOwned === 'number'){
      if(def.cost > techOwned) return { ok:false, why:'研究点不足 (需 '+def.cost+')' };
    }else if(def.reqTech){
      var owned = (techOwned && typeof techOwned==='object') ? techOwned : {};
      if(!owned[def.reqTech]){
        var reqName = TECHS[def.reqTech] ? TECHS[def.reqTech].name : def.reqTech;
        return { ok:false, why:'需先研发科技: ' + reqName };
      }
    }

    // 2. 建材校验: 支持纯数字 (矿材) 与 对象字典 (多材料)
    if(typeof resStock === 'number'){
      var needM = def.costMineral || 0;
      if(needM > resStock) return { ok:false, why:'矿材不足 (需 '+needM+')' };
    }else if(resStock && typeof resStock === 'object'){
      var costRes = def.costRes || {};
      for(var k in costRes){
        var need = costRes[k] || 0;
        var have = resStock[k] != null ? resStock[k] : (resStock.mineral != null ? resStock.mineral : 0);
        if(have < need){
          var itName = (CFG.items[k] && CFG.items[k].name) ? CFG.items[k].name : k;
          return { ok:false, why: itName + '不足 (需 ' + need + ')' };
        }
      }
    }

    if(!def.pad && colonyBuildings.filter(function(b){return b.id===bid;}).length >= (def.max||99))
      return { ok:false, why:'已达数量上限' };
    if(U.dst(x,y,CFG.HAB.x,CFG.HAB.y) < 130) return { ok:false, why:'离居住核心太近' };
    var fp = footprintOf(bid), hw = fp.w/2, hh = fp.h/2;
    for(var i=0;i<colonyBuildings.length;i++){
      var b = colonyBuildings[i];
      var of = footprintOf(b.id), ohw = of.w/2, ohh = of.h/2;
      if(Math.abs(x-b.x) < hw+ohw && Math.abs(y-b.y) < hh+ohh)
        return { ok:false, why:'与其他建筑重叠' };
    }
    if(x-hw<60||y-hh<60||x+hw>CFG.WORLD-60||y+hh>CFG.WORLD-60) return { ok:false, why:'超出殖民地边界' };
    return { ok:true };
  }

  /* ---------- U3 农田生长(纯函数) ----------
     plot {stage:0~3, t:当前阶段累计}
     每30s一跳; 有农民(skills.sk_farm)则加速。 */
  function farmTick(plot, farmerSkill, farmMul, eff, lawMul){
    var need=[0,1,2,3][plot.stage];              // 各阶段所需跳数
    /* 无人在岗(null)冻结; 在岗即使技能0也按 1× 生长; 雷达 farmMul 加速; eff=心情饱食病情; lawMul=法则 */
    var e = (eff==null?1:eff);
    var law = (lawMul==null?1:lawMul);
    var speed = (farmerSkill==null)
      ? 0
      : (1 + (farmerSkill||0)*0.12) * (1+(farmMul||0)) * e * law;
    var p={stage:plot.stage, t:plot.t + speed};
    if(p.t>=need && p.stage<3){ p.stage++; p.t=0; }
    return p;
  }
  function harvestYield(plot){
    return plot.stage===3 ? 3 : 0;               // 成熟收3粮
  }

  /* 家园气候法则(纯函数, ADR-5): 1~2 条, 只用酸雨/磁暴 id */
  function climateLaws(seed){
    var rng=U.makeRng(((seed||7) ^ 0x1A17) >>> 0);
    var pool=[
      { id:'lw_night_acid', name:'酸雨季节', fact:'夜间农田生长减半', zone:'home' },
      { id:'lw_storm', name:'磁暴周期', fact:'磁暴来临时实验室停摆', zone:'home' },
    ];
    var a=rng()<0.5?0:1;
    var n=1+(rng()<0.45?1:0);
    var out=[{ id:pool[a].id, name:pool[a].name, fact:pool[a].fact, zone:'home', discovered:true }];
    if(n>1){
      var b=1-a;
      out.push({ id:pool[b].id, name:pool[b].name, fact:pool[b].fact, zone:'home', discovered:true });
    }
    return out;
  }

  /* 法则→收成修正(纯函数): 夜间酸雨减农; 磁暴窗停实验室 */
  function harvestMods(laws, clock, night){
    var C=CFG.laws||{};
    var has={};
    (laws||[]).forEach(function(l){ if(l&&l.id) has[l.id]=true; });
    var farmMul=1, labMul=1, acid=false, storm=false;
    if(has.lw_night_acid && night){
      farmMul=C.acidFarmMul!=null?C.acidFarmMul:0.5;
      acid=true;
    }
    var period=C.stormPeriod!=null?C.stormPeriod:90;
    var len=C.stormLen!=null?C.stormLen:30;
    var t=(clock||0)%period;
    if(has.lw_storm && t<len){
      labMul=C.stormLabMul!=null?C.stormLabMul:0;
      storm=true;
    }
    return { farmMul:farmMul, labMul:labMul, acid:acid, storm:storm };
  }

  /* ---------- U6 畜牧群增长(纯函数, 每生产跳一调) ----------
     pasture: {herd:牲畜数, lv}   skill:最高畜牧技能
     羊群按概率自然增长(封顶 cap=3+lv*2); 产肉/皮随 herd 增长。
     rng 可注入供测试定值; 实况由 residentsTick 注入 seeded rng。 */
  function ranchTick(pasture, skill, res, rng, eff){
    var rand = rng || Math.random;
    var e = (eff==null?1:eff);
    var herd = (pasture && pasture.herd)||0;
    var lv = (pasture && pasture.lv)||1;
    var grew = false;
    var cap = 3 + lv*2;
    if (skill>0 && herd<cap && rand() < 0.22*(1+skill*0.06)*e){ herd++; grew=true; }
    /* 有牧民才产: 肉随 herd; 皮 3只起, 等级放宽阈值; 再乘效率 */
    var foodGain = (skill>0 && herd>0) ? Math.max(1, Math.round(herd/2)) : 0;
    var leatherGain = (skill>0 && herd>=3) ? Math.floor((herd + (lv-1))/3) : 0;
    if(e!==1){
      foodGain = Math.round(foodGain * e);
      leatherGain = Math.round(leatherGain * e);
    }
    var hmul=(pasture && pasture.herdMul)!=null?pasture.herdMul:1;
    if(hmul!==1){
      foodGain=Math.round(foodGain*hmul);
      leatherGain=Math.round(leatherGain*hmul);
    }
    if(pasture){ pasture.herd = herd; pasture.herdMul=1; }
    return { herd:herd, cap:cap, grew:grew, foodGain:foodGain, leatherGain:leatherGain };
  }

  /* 工坊: 有工匠且矿够 → 扣矿产药品 */
  function workshopTick(worker, res, lv){
    var C=CFG.workshop||{};
    var cost=C.mineralCost!=null?C.mineralCost:2;
    var base=C.medGain!=null?C.medGain:1;
    if(!worker || !res) return {med:0, spent:0};
    if((res.mineral||0)<cost) return {med:0, spent:0};
    var eff=(APH.Res&&APH.Res.efficiency)?APH.Res.efficiency(worker):1;
    var sk=(worker.skills&&worker.skills.sk_craft)||0;
    var med=Math.max(1, Math.round(base*(1+sk*0.15)*eff*(lv||1)));
    res.mineral=(res.mineral||0)-cost;
    return {med:med, spent:cost};
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
  function productionTick(meta, buildings, residents, mods){
    var out = { mineral:0, research:0, piles:[] };
    var labM=(mods&&mods.labMul!=null)?mods.labMul:1;
    var miners = (residents||[]).filter(function(r){ return r.job==='bl_mine'; });
    var labs = (residents||[]).filter(function(r){ return r.job==='bl_lab'; });
    var mi=0, li=0;
    (buildings||[]).forEach(function(b){
      if((b.offlineT||0)>0) return;
      if(b.id==='bl_mine'){
        var w=miners[mi++];
        if(!w) return;
        var craftB=1+((w.skills&&w.skills.sk_craft)||0)*0.1;
        var eff = (APH.Res && APH.Res.efficiency) ? APH.Res.efficiency(w) : 1;
        var amt=Math.max(0, Math.round(mineOutput(b.lv)*eff*craftB));
        out.mineral += amt;
        if(amt>0) out.piles.push({ x:b.x||0, y:b.y||0, itemId:'it_mineral', n:amt });
      }
      if(b.id==='bl_lab'){
        var w2=labs[li++];
        if(!w2) return;
        var eff2 = (APH.Res && APH.Res.efficiency) ? APH.Res.efficiency(w2) : 1;
        out.research += Math.max(0, Math.round(labOutput(b.lv)*eff2*labM));
      }
    });
    meta.res = meta.res || {};
    meta.research = (meta.research||0) + out.research;
    return out;
  }

  /* 仓库入库(纯函数): 只处理带 store 的物品 */
  function stockItem(res, itemId, n){
    var it=(CFG.items&&CFG.items[itemId])||{};
    if(!it.store || !n) return { ok:false, stored:0 };
    res = res || {};
    var mul=it.storeN||1;
    res[it.store]=(res[it.store]||0)+n*mul;
    return { ok:true, stored:n, key:it.store, amount:n*mul };
  }

  /* 家园捡起: 可入库的进仓, 有研究点价值的变研究点 */
  function collectHome(meta, itemId, n){
    meta = meta || {};
    meta.res = meta.res || {};
    var it=(CFG.items&&CFG.items[itemId])||{};
    if(it.store){
      var st=stockItem(meta.res, itemId, n);
      return { kind:'stock', label:it.name||itemId, n:n, key:st.key, amount:st.amount };
    }
    if(it.v){
      var gained=(it.v||0)*n;
      meta.research=(meta.research||0)+gained;
      return { kind:'research', label:it.name||itemId, n:n, research:gained };
    }
    return { kind:'none', label:it.name||itemId, n:0 };
  }

  function stockpileSpot(buildings){
    var wh=null, pad=null;
    (buildings||[]).forEach(function(b){
      if(!b) return;
      if(b.id==='bl_warehouse' && !wh) wh=b;
      if(b.id==='bl_landing_pad') pad=b;
    });
    var b=wh||pad;
    if(b) return { x:b.x, y:(b.y||0)+18 };
    var H=CFG.HAB||{x:1100,y:1100};
    return { x:H.x, y:H.y+110 };
  }

  function serializeGround(entities){
    var g=[];
    (entities||[]).forEach(function(e){
      if(!e || e.dead) return;
      if(e.type===T.DROPPED && e.itemId)
        g.push({ itemId:e.itemId, n:e.n||1, x:e.x, y:e.y });
      if(e.type===T.RESIDENT && e.haulCarry && e.haulCarry.itemId)
        g.push({ itemId:e.haulCarry.itemId, n:e.haulCarry.n||1, x:e.x, y:e.y });
    });
    return g;
  }

  function pileStoreKey(e){
    if(!e || e.dead || e.type!==T.DROPPED || !e.itemId) return null;
    var it=(CFG.items&&CFG.items[e.itemId])||{};
    return it.store||null;
  }
  function pileUnits(e){
    var it=(CFG.items&&CFG.items[e.itemId])||{};
    return (e.n||1)*((it.storeN)||1);
  }

  /* 地上可入库物资合计(不含搬运途中) */
  function groundCount(entities, key){
    var n=0;
    (entities||[]).forEach(function(e){
      if(pileStoreKey(e)===key) n+=pileUnits(e);
    });
    return n;
  }
  function groundTally(entities){
    return {
      food:groundCount(entities,'food'),
      mineral:groundCount(entities,'mineral'),
      med:groundCount(entities,'med'),
      leather:groundCount(entities,'leather')
    };
  }
  function stockOf(res, entities, key){
    return ((res&&res[key])||0)+groundCount(entities, key);
  }

  /* 从地上堆扣 store 单位. 先扣 storeN=1 的堆; 合金整件扣.
     overshoot: 不够一整件时仍拿走(ensureStock 把多的补进仓). */
  function takeFromGround(entities, key, n, overshoot){
    var left=n||0;
    if(left<=0) return 0;
    function pass(baseOnly){
      (entities||[]).forEach(function(e){
        if(left<=0) return;
        if(pileStoreKey(e)!==key) return;
        var it=(CFG.items&&CFG.items[e.itemId])||{};
        var mul=it.storeN||1;
        if(baseOnly && mul!==1) return;
        if(!baseOnly && mul===1) return;
        if(mul>1){
          var want=overshoot ? Math.ceil(left/mul) : Math.floor(left/mul);
          var items=Math.min(e.n||1, want);
          if(!items) return;
          e.n-=items; left-=items*mul;
        }else{
          var take=Math.min(e.n||1, left);
          e.n-=take; left-=take;
        }
        if((e.n||0)<=0) e.dead=true;
      });
    }
    pass(true); pass(false);
    return n-left;
  }

  /* 按 itemId 计/扣地上堆(晶体矿等无 store 字段的货) */
  function itemCount(entities, itemId){
    var n=0;
    (entities||[]).forEach(function(e){
      if(e && !e.dead && e.type===T.DROPPED && e.itemId===itemId) n+=e.n||1;
    });
    return n;
  }
  function takeDropped(entities, itemId, n){
    var left=n||0;
    if(left<=0) return 0;
    (entities||[]).forEach(function(e){
      if(left<=0) return;
      if(!e||e.dead||e.type!==T.DROPPED||e.itemId!==itemId) return;
      var take=Math.min(e.n||1, left);
      e.n-=take; left-=take;
      if((e.n||0)<=0) e.dead=true;
    });
    return n-left;
  }

  /* 先仓后堆. 不把地上 magically 搬进仓, 堆会缩小. */
  function takeStock(res, entities, key, n){
    res=res||{};
    var need=n||0;
    if(need<=0) return { ok:true, taken:0, fromRes:0, fromGround:0 };
    var fromRes=Math.min(need, res[key]||0);
    res[key]=(res[key]||0)-fromRes;
    var left=need-fromRes;
    var fromG=left?takeFromGround(entities, key, left, false):0;
    left-=fromG;
    return { ok:left<=0, taken:need-left, fromRes:fromRes, fromGround:fromG };
  }

  /* 仓不够时把地上补进仓(工坊/请客等仍走仓扣费的旧函数) */
  function ensureStock(res, entities, key, n){
    res=res||{};
    var have=res[key]||0;
    if(have>=n) return true;
    var got=takeFromGround(entities, key, n-have, true);
    res[key]=have+got;
    return (res[key]||0)>=n;
  }

  function stockLabel(res, entities, key){
    var w=(res&&res[key])||0;
    var g=groundCount(entities, key);
    return g>0 ? (w+'+'+g) : String(w);
  }

  function shortageBrief(meta, buildings, extra){
    extra=extra||{};
    var food=((meta.res&&meta.res.food)||0)+(extra.food||0);
    var mineral=((meta.res&&meta.res.mineral)||0)+(extra.mineral||0);
    var med=((meta.res&&meta.res.med)||0)+(extra.med||0);
    var pop=((meta.residents)||[]).length;
    var idle=((meta.residents)||[]).filter(function(r){ return !r.job; }).length;
    var days = pop ? Math.floor(food/Math.max(1,pop)) : food;
    var warnF = (CFG.economy && CFG.economy.foodWarnTicks) || 2;
    var warnM = (CFG.economy && CFG.economy.mineralWarn) || 15;
    var sick=((meta.residents)||[]).some(function(r){ return (r.illness||0)>40; });
    var urgent = food < Math.max(warnF, pop*warnF) || mineral < warnM;
    var text = '矿材'+mineral+' · 食物还能撑'+days+'跳 · 闲人'+idle;
    var mission = '此行目标：晶体与遗件';
    if(food < Math.max(warnF, pop*warnF)){
      text = '食物将尽 — 该种田或出门找补给';
      mission = '此行目标：补给食物';
    }else if(mineral < warnM){
      text = '矿材不足 — 派人采矿或出门搜刮';
      mission = '此行目标：矿材';
    }else if(sick && med<=0){
      text = '有人在生病 — 工坊把矿做成药';
    }
    return { urgent:urgent, text:text, mission:mission, food:food, mineral:mineral, idle:idle, days:days };
  }

  function cycleJob(resident, buildings){
    var opts = [null];
    JOB_CYCLE.forEach(function(id){
      if(!id) return;
      if((buildings||[]).some(function(b){ return b.id===id; })) opts.push(id);
    });
    var i = opts.indexOf(resident.job);
    if(i<0) i=0;
    resident.job = opts[(i+1)%opts.length];
    resident.jobLocked = true;
    return resident.job;
  }

  function isBuilder(r){
    if(!r||!r.skills) return false;
    return r.mainSkill==='sk_build' || r.subSkill==='sk_build' || (r.skills.sk_build||0)>=3;
  }

  /* ---------- D: 工作优先级调度(纯函数, RimWorld 式) ----------
     prio: { rid: {sk_farm:0~3, ...} }  0=禁止 1=优先 2=普通 3=闲时
     规则: 手动锁岗(jobLocked)不动; 崩溃者缺勤;
           有施工队列时建造者(sk_build 未禁止)留空去施工;
           按 1→2→3 级逐层填岗, 同级按技能高者优先。
     返回 { rid: bl_xxx|null }。 */
  var JOB_SKILL={ bl_farm:'sk_farm', bl_pasture:'sk_ranch', bl_clinic:'sk_social',
                  bl_mine:'sk_craft', bl_workshop:'sk_craft', bl_lab:'sk_lore' };
  var JOB_SLOTS={ bl_farm:2, bl_pasture:2, bl_clinic:1, bl_mine:1, bl_workshop:1, bl_lab:1 };
  function prioOf(prio, r, sk){
    var p=prio && prio[r.id];
    return (p && p[sk]!=null) ? p[sk] : 2;
  }
  function assignByPriority(residents, buildings, prio, queueBusy){
    prio=prio||{};
    var SLOTS=(CFG.jobs&&CFG.jobs.slots)||JOB_SLOTS;
    var slots={};
    Object.keys(SLOTS).forEach(function(bid){
      var n=(buildings||[]).filter(function(b){ return b.id===bid; }).length;
      if(n>0) slots[bid]=n*SLOTS[bid];
    });
    var out={};
    var broken=function(r){
      return !!(window.APH.Res && APH.Res.isBroken && APH.Res.isBroken(r));
    };
    var sickAt=(CFG.residents&&CFG.residents.sickSkipAt!=null)?CFG.residents.sickSkipAt:60;
    (residents||[]).forEach(function(r){
      if(!r.jobLocked) return;
      out[r.id]=r.job||null;                     // 手动锁岗不动
      if(r.job && slots[r.job]!=null) slots[r.job]--;
    });
    (residents||[]).forEach(function(r){
      if(out[r.id]!==undefined) return;
      if(r.downed || r.isSleeping){ out[r.id]=null; return; } // 击倒/睡眠中缺勤 (Survival #15, #17)
      if(broken(r)){ out[r.id]=null; return; }   // 崩溃者缺勤
      if((r.illness||0)>sickAt){ out[r.id]=null; return; }  // 重病跳过
      if(queueBusy && isBuilder(r) && prioOf(prio,r,'sk_build')>0){
        out[r.id]=null; return;                  // 建造者留给蓝图
      }
    });
    [1,2,3].forEach(function(level){
      /* 同级粘性: 当前岗位仍是本级 → 原地留任(避免每跳乱换岗);
         更高优先级(更小数字)的空位仍会在前一轮把人抢走 */
      (residents||[]).forEach(function(r){
        if(out[r.id]!==undefined) return;
        var bid=r.job;
        if(!bid || slots[bid]==null || slots[bid]<=0) return;
        if(prioOf(prio,r,JOB_SKILL[bid])!==level) return;
        out[r.id]=bid; slots[bid]--;
      });
      Object.keys(slots).forEach(function(bid){
        var sk=JOB_SKILL[bid];
        while(slots[bid]>0){
          var best=null;
          (residents||[]).forEach(function(r){
            if(out[r.id]!==undefined) return;
            if(prioOf(prio,r,sk)!==level) return;
            if(!best || ((r.skills&&r.skills[sk])||0) > ((best.skills&&best.skills[sk])||0))
              best=r;
          });
          if(!best) break;
          out[best.id]=bid; slots[bid]--;
        }
      });
    });
    (residents||[]).forEach(function(r){ if(out[r.id]===undefined) out[r.id]=null; });
    return out;
  }

  /* 蓝图施工: nearPos 为 {x,y} 或坐标数组(玩家+建造岗居民) */
  function queueTick(queue, dt, nearPos, builderBonus){
    var bonus = 1 + (builderBonus||0);
    var positions = Array.isArray(nearPos) ? nearPos
      : (nearPos && nearPos.x!=null ? [nearPos] : []);
    var out = [];
    var done = [];
    queue.forEach(function(item){
      item = Object.assign({}, item);
      var near = positions.some(function(p){
        return p && U.dst(p.x, p.y, item.x, item.y) < 90;
      });
      if (near){

        item.progress = Math.min(1, (item.progress||0) + dt*bonus/item.total);
        item.building = true;
      }else{
        item.building = false;
      }
      if ((item.progress||0) >= 1) done.push({bid:item.bid,x:item.x,y:item.y});
      else out.push(item);
    });
    return { queue: out, done: done };
  }

  /* 建造专长加成系数: 最高建造技能×0.15 */
  function builderBonusOf(residents){
    return residents.reduce(function(a,r){
      return Math.max(a,(r.skills&&r.skills.sk_build)||0);
    },0)*0.15;
  }

  /* ---------- 科技树 (分层前置依赖链: ADR-9 te_ 前缀; 消耗研究点) ---------- */
  var TECHS = {
    // 农业分支
    te_basic_farming:   { name:'基础外星农耕', cost:40, max:1, requires:[],
                          desc:'野生植被采摘速度 +50%' },
    te_hydroponics:     { name:'温控水培技术', cost:80, max:1, requires:['te_basic_farming'],
                          desc:'解锁水培农场 bl_farm 蓝图' },
    te_bio_adaptation:  { name:'外星生态适应', cost:150, max:1, requires:['te_hydroponics'],
                          desc:'酸雨/毒雾暴露累积降低 50%' },

    // 工业分支
    te_stonecutting:    { name:'石料切割加工', cost:40, max:1, requires:[],
                          desc:'解锁精制石料建材与篝火' },
    te_machining:       { name:'机械锻造合金', cost:90, max:1, requires:['te_stonecutting'],
                          desc:'解锁自动采矿机 bl_mine 蓝图' },
    te_deep_drilling:   { name:'深空重型钻探', cost:160, max:1, requires:['te_machining'],
                          desc:'采矿机产量翻倍' },

    // 医学分支
    te_herbal_remedies: { name:'草药提炼包扎', cost:50, max:1, requires:[],
                          desc:'草药可搓制初级药包' },
    te_medicine:        { name:'外星临床医学', cost:100, max:1, requires:['te_herbal_remedies'],
                          desc:'解锁医疗舱 bl_clinic 蓝图' },
    te_bionics:         { name:'仿生机能强化', cost:180, max:1, requires:['te_medicine'],
                          desc:'全员三维机能底线 +15%' },

    // 安防分支
    te_ballistics:      { name:'弹道工程防卫', cost:60, max:1, requires:[],
                          desc:'解锁兵营 bl_barracks，等离子伤害 +30%', effect:{ dmgMul:.30 } },
    te_weaponry:        { name:'弹道工程防卫', cost:60, max:3, requires:[],
                          desc:'等离子伤害 +30%', effect:{ dmgMul:.30 } }, // 兼容旧档别名
    te_turret_tech:     { name:'自动防御炮塔', cost:110, max:1, requires:['te_ballistics'],
                          desc:'解锁防御炮塔 bl_turret 蓝图' },
    te_plasma_grid:     { name:'等离子电网重炮', cost:200, max:1, requires:['te_turret_tech'],
                          desc:'炮塔伤害翻倍' },

    // 探索分支
    te_o2tank:          { name:'氧气罐扩容', cost:40, max:3, requires:[],
                          desc:'氧气上限 +25', effect:{ o2Max:+25 } },
    te_radar:           { name:'深空广域雷达', cost:80, max:2, requires:['te_ballistics'],
                          desc:'罗盘标晶体与敌基地', effect:{ radar:true } },
    te_exosuit:         { name:'外骨骼动力装甲', cost:140, max:2, requires:['te_machining'],
                          desc:'移动速度 +15%', effect:{ spdMul:.15 } },
  };

  /* 可购判定(纯函数): 检查研究点与所有 requires 前置科技 */
  function canBuy(meta, techId, owned){
    var t=TECHS[techId];
    if(!t) return { ok:false, why:'未知科技' };
    if((owned[techId]||0)>= (t.max||1)) return { ok:false, why:'已达最高等级' };
    if((meta.research||0) < t.cost) return { ok:false, why:'研究点不足 (需 '+t.cost+')' };
    var reqs = t.requires || [];
    for(var i=0; i<reqs.length; i++){
      var r = reqs[i];
      if(!owned || !owned[r]){
        var reqName = TECHS[r] ? TECHS[r].name : r;
        return { ok:false, why:'需先研发: ' + reqName };
      }
    }
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

  /* ---------- 异星奇幻植物定义表 (ADR-9 crop_ 前缀) ---------- */
  var ALIEN_CROPS = {
    crop_glow_shroom:  { name:'夜光荧蕈', growTicks:3, baseYield:4, dropItem:'it_glow_fluid', glowR:60, desc:'夜间自发光青蓝微光' },
    crop_crystal_vine: { name:'晶脉拟态藤', growTicks:5, baseYield:5, dropItem:'it_crystal_berry', extraItem:'it_crystal_ore', desc:'产出晶核果与微量晶体' },
    crop_dew_fruit:    { name:'露珠膨果', growTicks:4, baseYield:6, dropItem:'it_dew_fruit', moodBoost:6, desc:'食用提供+6清甜心情' },
    crop_star_velvet:  { name:'星绒草', growTicks:5, baseYield:4, dropItem:'it_star_fiber', desc:'外星防酸抗温纤维' },
  };

  /* 派生夜间生物发光源(夜光荧蕈自发光) */
  function getGlowSources(buildings){
    var lights = [];
    (buildings||[]).forEach(function(b){
      if(!b || (b.id!=='bl_crop_plot' && b.id!=='bl_farm')) return;
      var cropId = b.crop || 'crop_glow_shroom';
      var def = ALIEN_CROPS[cropId];
      if(def && def.glowR && b.plot && (b.plot.stage||0) >= 2){
        lights.push({
          x: b.x, y: b.y, r: def.glowR || 60,
          col: 'rgba(89,217,255,0.45)'
        });
      }
    });
    return lights;
  }

  /* 异星田圃生长推进(纯函数) */
  function cropPlotTick(plot, farmerSkill, eff, lawMul, cropType){
    if(farmerSkill == null || !plot) return plot;
    var cropDef = ALIEN_CROPS[cropType || 'crop_glow_shroom'] || { growTicks:4 };
    var growTicks = cropDef.growTicks || 4;
    var e = (eff == null ? 1 : eff);
    var lm = (lawMul == null ? 1 : lawMul);
    var bonus = (1 + farmerSkill * 0.15) * e * lm;
    plot.t = (plot.t || 0) + bonus;
    var step = growTicks / 3;
    if(plot.t >= step && plot.stage < 3){
      plot.stage++;
      plot.t = 0;
    }
    return plot;
  }

  /* 异星作物收割结算(纯函数): 产出主产品与特殊副产品 */
  function harvestAlienCrop(cropType, farmerSkill){
    var cropDef = ALIEN_CROPS[cropType || 'crop_glow_shroom'] || { baseYield:4, dropItem:'it_glow_fluid' };
    var sk = farmerSkill || 0;
    var mul = 1 + sk * 0.12;
    var count = Math.max(1, Math.round((cropDef.baseYield || 4) * mul));
    return {
      dropItemId: cropDef.dropItem || 'it_food',
      dropCount: count,
      extraItemId: cropDef.extraItem || null,
      extraCount: cropDef.extraItem ? Math.max(1, Math.round(count * 0.25)) : 0,
      moodBoost: cropDef.moodBoost || 0
    };
  }

  /* ---------- 土壤肥力与种植区划 (RimWorld 农业) ---------- */
  function soilFertilityAt(x, y, seed){
    var L = CFG.LAKE || { x:1660, y:1560, r:148 };
    var H = CFG.HAB || { x:1100, y:1100, r:92 };
    var S = CFG.soil || { rich:1.4, normal:1.0, poor:0.7, hydro:2.8 };
    if(U.dst(x, y, L.x, L.y) < (L.r + 140)) return S.rich;
    if(U.dst(x, y, H.x, H.y) > 750 || x < 200 || y < 200 || x > CFG.WORLD-200 || y > CFG.WORLD-200) return S.poor;
    return S.normal;
  }

  function createGrowingZone(id, x, y, cols, rows, cropType){
    cols = Math.max(1, cols || 1);
    rows = Math.max(1, rows || 1);
    var cells = [];
    for(var r=0; r<rows; r++){
      for(var c=0; c<cols; c++){
        var cx = x + c * CFG.GRID;
        var cy = y + r * CFG.GRID;
        var fert = soilFertilityAt(cx, cy);
        cells.push({
          gx: cx, gy: cy, c: c, r: r, fertility: fert,
          plant: null
        });
      }
    }
    return {
      id: id,
      x: x, y: y,
      cols: cols, rows: rows,
      cropType: cropType || 'crop_rice',
      cells: cells
    };
  }

  function removeGrowingZone(zones, id){
    return (zones||[]).filter(function(z){ return z.id !== id; });
  }

  /* ---------- 自然生态生成(纯函数) ---------- */
  function generateFlora(seed){
    var rng = U.makeRng((seed ^ 0xF108A) >>> 0 || 17);
    var out = [];
    var H = CFG.HAB || { x:1100, y:1100 };
    for(var i=0; i<12; i++){
      var ang = rng() * U.TAU, dist = 160 + rng() * 500;
      out.push({ id:'flora_tree_'+i, type:'flora', kind:'tree',
                 x:U.clamp(H.x+Math.cos(ang)*dist, 100, CFG.WORLD-100),
                 y:U.clamp(H.y+Math.sin(ang)*dist, 100, CFG.WORLD-100), hp:30, maxHp:30 });
    }
    for(var j=0; j<6; j++){
      var ang2 = rng() * U.TAU, d2 = 200 + rng() * 450;
      out.push({ id:'flora_iron_'+j, type:'flora', kind:'rock_iron',
                 x:U.clamp(H.x+Math.cos(ang2)*d2, 100, CFG.WORLD-100),
                 y:U.clamp(H.y+Math.sin(ang2)*d2, 100, CFG.WORLD-100), hp:40, maxHp:40 });
    }
    for(var k=0; k<8; k++){
      var ang3 = rng() * U.TAU, d3 = 180 + rng() * 520;
      out.push({ id:'flora_stone_'+k, type:'flora', kind:'rock_stone',
                 x:U.clamp(H.x+Math.cos(ang3)*d3, 100, CFG.WORLD-100),
                 y:U.clamp(H.y+Math.sin(ang3)*d3, 100, CFG.WORLD-100), hp:35, maxHp:35 });
    }
    for(var m=0; m<8; m++){
      var ang4 = rng() * U.TAU, d4 = 150 + rng() * 400;
      var kind = m%2===0 ? 'bush_berry' : 'bush_herb';
      out.push({ id:'flora_bush_'+m, type:'flora', kind:kind,
                 x:U.clamp(H.x+Math.cos(ang4)*d4, 100, CFG.WORLD-100),
                 y:U.clamp(H.y+Math.sin(ang4)*d4, 100, CFG.WORLD-100),
                 hp: kind==='bush_berry'?15:20, maxHp: kind==='bush_berry'?15:20 });
    }
    return out;
  }

  /* 居民在自然实体上工作推进(纯函数) */
  function workOnFlora(target, resident, dt){
    if(!target || target.hp <= 0) return { done:true, dropItemId:null, dropCount:0 };
    var eff = (window.APH.Res && APH.Res.efficiency) ? APH.Res.efficiency(resident) : 1;
    var sk = (resident && resident.skills) ? ((target.kind==='tree'||target.kind.startsWith('bush')) ? (resident.skills.sk_farm||0) : (resident.skills.sk_craft||0)) : 0;
    var rate = dt * eff * (1 + sk*0.15);
    target.hp -= rate;
    if(target.hp <= 0){
      target.hp = 0;
      target.dead = true;
      var dropId = 'it_wood', dropN = 4;
      if(target.kind === 'tree'){ dropId = 'it_wood'; dropN = 4; }
      else if(target.kind === 'rock_iron'){ dropId = 'it_iron'; dropN = 3; }
      else if(target.kind === 'rock_stone'){ dropId = 'it_stone'; dropN = 4; }
      else if(target.kind === 'bush_berry'){ dropId = 'it_berry'; dropN = 3; }
      else if(target.kind === 'bush_herb'){ dropId = 'it_herb'; dropN = 2; }
      return { done:true, dropItemId:dropId, dropCount:dropN };
    }
    return { done:false, dropItemId:null, dropCount:0 };
  }

  return {
    list:list, get:get,
    TECHS:TECHS, canBuy:canBuy, buyTech:buyTech,
    farmTick:farmTick, harvestYield:harvestYield, jobOutput:jobOutput,
    ranchTick:ranchTick, climateLaws:climateLaws, harvestMods:harvestMods,
    workshopTick:workshopTick,
    buildColonyWorld:buildColonyWorld,
    canPlace:canPlace, footprintOf:footprintOf, productionTick:productionTick,
    placeBuildingEntity:placeBuildingEntity,
    queueTick:queueTick,
    housingCapacity:housingCapacity, refundOf:refundOf, refundMineralOf:refundMineralOf,
    carryBonus:carryBonus, carryMaxOf:carryMaxOf,
    builderBonusOf:builderBonusOf, isBuilder:isBuilder,
    assignByPriority:assignByPriority, JOB_SKILL:JOB_SKILL, JOB_SLOTS:JOB_SLOTS,
    upgradeCost:upgradeCost, canUpgrade:canUpgrade,
    mineOutput:mineOutput, labOutput:labOutput,
    shortageBrief:shortageBrief, cycleJob:cycleJob, JOB_CYCLE:JOB_CYCLE,
    stockItem:stockItem, collectHome:collectHome, stockpileSpot:stockpileSpot,
    serializeGround:serializeGround,
    groundCount:groundCount, groundTally:groundTally, stockOf:stockOf,
    itemCount:itemCount, takeDropped:takeDropped,
    stockLabel:stockLabel, takeFromGround:takeFromGround,
    takeStock:takeStock, ensureStock:ensureStock,
    ensurePad:ensurePad, generateFlora:generateFlora, workOnFlora:workOnFlora,
    soilFertilityAt:soilFertilityAt, createGrowingZone:createGrowingZone, removeGrowingZone:removeGrowingZone,
    ALIEN_CROPS:ALIEN_CROPS, getGlowSources:getGlowSources,
    cropPlotTick:cropPlotTick, harvestAlienCrop:harvestAlienCrop,
  };
})();
