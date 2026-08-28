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
    bl_landing_pad: { name:'发射台', cost:0, costMineral:0, size:64, buildTime:0,
      desc:'远征出发口。永远只有一座。' },
    bl_warehouse:   { name:'仓库',   cost:30, costMineral:20, size:52, max:3, buildTime:12,
      dispH:95, cells:[2,2],
      desc:'+20 负重上限。地上的东西搬过来才算库存。' },
    bl_mine:        { name:'自动采矿机', cost:45, costMineral:30, size:44, max:4, buildTime:20,
      dispH:100, cells:[1,1],
      desc:'有矿工时每30秒把矿材堆在机旁。搬进仓库才入账。',
      upg:{ effectPerLv:2, maxLv:3 } },
    bl_lab:         { name:'研究站', cost:60, costMineral:40, size:48, max:2, buildTime:25,
      dispH:113, cells:[2,2],
      desc:'有研究员时 +1×等级 研究点/跳。',
      upg:{ effectPerLv:1, maxLv:2 } },
    bl_barracks:    { name:'兵营', cost:80, costMineral:50, size:56, max:2, buildTime:30,
      dispH:86, cells:[2,2],
      desc:'训练士兵驻守殖民地。' },
    bl_turret:      { name:'防御炮塔', cost:70, costMineral:35, size:36, max:6, buildTime:25,
      dispH:68, cells:[1,1],
      desc:'自动攻击来袭敌人, 伤害随等级。',
      upg:{ effectPerLv:8, maxLv:3 } },
    bl_clinic:      { name:'医疗舱', cost:50, costMineral:30, size:40, max:1, buildTime:22,
      dispH:115, cells:[2,2],
      desc:'给殖民者治病。靠近时玩家缓慢回血。有人值守治得更快。远征仍可急救一次。住宅容量+1。' },
    bl_farm:        { name:'水培农场', cost:35, costMineral:15, size:52, max:4, buildTime:15,
      dispH:115, cells:[2,2],
      desc:'种植食物。成熟后堆在田边, 搬进仓库才能吃饭。' },
    bl_house:       { name:'居住舱', cost:40, costMineral:20, size:46, max:6, buildTime:15,
      dispH:128, cells:[2,2],
      desc:'住宅容量 +3。居民是殖民地的心跳。' },
    bl_pasture:     { name:'畜牧圈', cost:55, costMineral:30, size:56, max:2, buildTime:18,
      dispH:97, cells:[2,2],
      desc:'饲养星绵羊。肉和皮堆在圈边, 搬走才入账。',
      upg:{ maxLv:2, costRes:'leather' } },
    bl_workshop:    { name:'工坊', cost:40, costMineral:25, size:48, max:2, buildTime:18,
      dispH:110, cells:[2,2],
      desc:'有工匠时耗矿材做药品, 成品堆在地上。搬进仓库后医疗舱才用得上。' },
  };
  var JOB_CYCLE = [null, 'bl_farm', 'bl_pasture', 'bl_mine', 'bl_workshop', 'bl_lab', 'bl_clinic'];

  /* ---------- Task3: 建筑等级 ---------- */
  function upgradeCost(def, curLv){
    return Math.round(def.cost * Math.pow(1.6, curLv));
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
    return Math.floor(def.cost/2);
  }
  function refundMineralOf(def){
    if (!def || def===BUILDINGS.bl_landing_pad) return 0;
    return Math.floor((def.costMineral||0)/2);
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
  /* 可否建造: 资源够 + 数量未满 + 位置合法(离核心不太近 + 占位矩形不重叠) */
  function canPlace(colonyBuildings, research, bid, x, y, mineral){
    var def = BUILDINGS[bid];
    if(!def) return { ok:false, why:'未知建筑' };
    if(def.cost > research) return { ok:false, why:'研究点不足 (需 '+def.cost+')' };
    var needM = def.costMineral||0;
    var haveM = (mineral==null) ? 1e9 : mineral;
    if(needM > haveM) return { ok:false, why:'矿材不足 (需 '+needM+')' };
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
    if (pasture) pasture.herd = herd;
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

  /* ---------- 科技树 v1 (ADR-9: te_ 前缀; 消耗研究点) ----------
     effect 字段由 applyTech 解释, 永不直接改数值。 */
  var TECHS = {
    te_o2tank:   { name:'氧气罐扩容', cost:40, max:3,
                   desc:'氧气上限 +25', effect:{ o2Max:+25 } },
    te_weaponry: { name:'等离子强化', cost:60, max:3,
                   desc:'武器伤害 +30%', effect:{ dmgMul:.30 } },
    te_radar:    { name:'深空雷达', cost:50, max:2,
                   desc:'罗盘标晶体与敌基地; 农产 +15%/级', effect:{ radar:true, farmMul:.15 } },
    te_exosuit:  { name:'外骨骼', cost:90, max:2,
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
    ranchTick:ranchTick, climateLaws:climateLaws, harvestMods:harvestMods,
    workshopTick:workshopTick,
    buildColonyWorld:buildColonyWorld,
    canPlace:canPlace, footprintOf:footprintOf, productionTick:productionTick,
    placeBuildingEntity:placeBuildingEntity,
    queueTick:queueTick,
    housingCapacity:housingCapacity, refundOf:refundOf, refundMineralOf:refundMineralOf,
    carryBonus:carryBonus, carryMaxOf:carryMaxOf,
    builderBonusOf:builderBonusOf, isBuilder:isBuilder,
    upgradeCost:upgradeCost, canUpgrade:canUpgrade,
    mineOutput:mineOutput, labOutput:labOutput,
    shortageBrief:shortageBrief, cycleJob:cycleJob, JOB_CYCLE:JOB_CYCLE,
    stockItem:stockItem, collectHome:collectHome, stockpileSpot:stockpileSpot,
    serializeGround:serializeGround,
    groundCount:groundCount, groundTally:groundTally, stockOf:stockOf,
    stockLabel:stockLabel, takeFromGround:takeFromGround,
    takeStock:takeStock, ensureStock:ensureStock,
    ensurePad:ensurePad,
  };
})();
