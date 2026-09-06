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
    bl_lab:         { name:'科研站', cost:0, costMineral:40, costRes:{ wood:20, iron:25 }, size:48, max:2, buildTime:25,
      dispH:113, cells:[2,2],
      desc:'学者在此做理论攻坚，并把远征标本上台化验。+1×等级 研究点/跳。',
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
      desc:'培育外星奇幻作物的轻量田圃。需先在科研站化验对应活体标本才能种植。' },
    bl_campfire:    { name:'石料篝火', cost:0, costMineral:0, reqTech:'te_stonecutting', costRes:{ wood:10, stone:15 }, size:36, max:4, buildTime:8,
      dispH:48, cells:[1,1],
      desc:'温暖夜间照明、驱寒保暖、休闲娱乐与基础烘烤。' },
    bl_kitchen:     { name:'烹饪灶台', cost:0, costMineral:0, reqTech:'te_alien_culinary', costRes:{ wood:20, stone:20, iron:15 }, size:52, max:2, buildTime:20,
      dispH:110, cells:[2,2],
      desc:'高级菜肴烹制与厨师岗位。需研发异星烹饪保鲜。' },
    /* T8 餐桌与餐椅 (#81): 居民吃饭时到最近空椅坐吃 (坐姿=站姿不播入座动画) */
    bl_dining_table: { name:'餐桌', cost:0, costMineral:0, reqTech:'te_alien_culinary', costRes:{ wood:15, stone:5 }, size:48, max:8, buildTime:10,
      dispH:155, cells:[1,1],
      desc:'居民吃饭的场所：有餐桌+空椅才「在餐桌用餐」得心情增益；无桌吃有心情惩罚。' },
    bl_dining_chair:{ name:'餐椅', cost:0, costMineral:0, reqTech:'te_alien_culinary', costRes:{ wood:6 }, size:48, max:16, buildTime:6,
      dispH:180, cells:[1,1],
      desc:'餐位一座一人。须放在餐桌旁（60px 内）才算可用餐位；居民自动走向最近空椅坐吃。' },
    /* P3 生活家具 (#97): 房间内摆放给心情增益 (科技机械锻造) */
    bl_tv:     { name:'电视', cost:0, costMineral:0, reqTech:'te_machining', costRes:{ iron:8, wood:4 }, size:48, max:8, buildTime:8,
      cells:[1,1], dispH:110,
      desc:'房间内的娱乐家具：房屋心情 +1（电视/书架/地毯各 +1，可叠加）。' },
    bl_shelf:  { name:'书架', cost:0, costMineral:0, reqTech:'te_machining', costRes:{ wood:8 }, size:48, max:12, buildTime:8,
      cells:[1,1], dispH:120,
      desc:'房间内的知识家具：房屋心情 +1（电视/书架/地毯各 +1，可叠加）。' },
    bl_carpet: { name:'地毯', cost:0, costMineral:0, reqTech:'te_machining', costRes:{ leather:4 }, size:48, max:12, buildTime:8,
      cells:[1,1], dispH:55,
      desc:'房间内的软装家具：房屋心情 +1（电视/书架/地毯各 +1，可叠加）。' },
    /* ADR-23 精细化仓储与置物货架 (#134) */
    bl_storage_shelf: { name:'置物货架', cost:0, costMineral:0, costRes:{ wood:6 }, size:48, max:24, buildTime:4,
      cells:[1,1], dispH:48,
      desc:'1×1 轻量置物货架。可按 [E] 自由切换允许存放的品类；架上物品完全免疫露天风化腐烂。' },
    /* ADR-24 史前遗迹科技反哺 (#142) */
    bl_heavy_turret: { name:'等离子重炮', cost:0, costMineral:0, reqTech:'te_heavy_plasma', costRes:{ iron:25, alloy:5 }, size:48, max:4, buildTime:12, cells:[1,1], dispH:105, desc:'史前遗迹重炮：超长射程与高额爆破杀伤。' },
    bl_ancient_generator: { name:'史前永恒发电机', cost:0, costMineral:0, reqTech:'te_heavy_plasma', costRes:{ iron:20, wood:10 }, size:48, max:2, buildTime:15, cells:[1,1], dispH:110, desc:'由史前高能核心驱动：零燃料消耗，永久稳定提供 200W 强劲电力。' },
    /* ADR-25 温控电器建筑 (#145) */
    bl_heater: { name:'电暖器', cost:0, costMineral:0, reqTech:'te_machining', costRes:{ iron:15, wood:5 }, size:48, max:16, buildTime:6, cells:[1,1], dispH:52, desc:'消耗 40W 电力供热：自动将所在房间加热保温至 21°C。' },
    bl_cooler: { name:'制冷空调', cost:0, costMineral:0, reqTech:'te_machining', costRes:{ iron:20, alloy:3 }, size:48, max:16, buildTime:8, cells:[1,1], dispH:56, desc:'消耗 50W 电力制冷：可按 [E] 切换避暑（20°C）或冷库（-5°C）模式。' },
    /* T2 墙与闸门 (ADR-13: 格上静态物, 1x1格; 渲染走格层) */
    bl_wall:  { name:'石墙', cost:0, costMineral:0, reqTech:'te_stonecutting', costRes:{ stone:5 }, size:48, max:2000,
      cells:[1,1], buildTime:6, dispH:96,
      desc:'阻挡所有单位移动的墙体。袭击者会拆墙。' },
    bl_gate:  { name:'闸门', cost:0, costMineral:0, reqTech:'te_stonecutting', costRes:{ stone:3, wood:5 }, size:48, max:500,
      cells:[1,1], buildTime:8, dispH:98,
      desc:'可通行的门：己方秒开，袭击者开门有延迟。' },
    /* T10 阵地设备 (issue #83): 格上静态物 (与墙同清单/渲染/建造交互) */
    bl_spike_trap: { name:'尖刺陷阱', cost:0, costMineral:0, reqTech:'te_ballistics', costRes:{ stone:3, wood:2 }, size:48, max:200,
      cells:[1,1], buildTime:6, dispH:129,
      desc:'敌人踩中穿刺伤害+出血减速；一次性触发，居民靠近自动重置（耗少量建材）。' },
    bl_sandbag:    { name:'沙袋', cost:0, costMineral:0, reqTech:'te_ballistics', costRes:{ stone:3 }, size:48, max:500,
      cells:[1,1], buildTime:5, dispH:106,
      desc:'穿过减速 50%，无血量（双方均可穿越的软掩体）。' },
    /* T6 电网 (ADR-14: 实体导线电力网; 定义见 #79 最终版, 旧雏形已删) */
    bl_conduit: { name:'电力导线', cost:0, costMineral:0, reqTech:'te_machining', costRes:{ wood:2, iron:1 }, size:48, max:2000,
      cells:[1,1], buildTime:4, dispH:36,
      desc:'格上敷设的输电线：把发电机与用电建筑连成电网。' },
    bl_wood_generator: { name:'木柴发电机', cost:0, costMineral:20, reqTech:'te_machining', costRes:{ iron:20, wood:15 }, size:44, max:4, buildTime:25,
      dispH:96, cells:[1,1],
      desc:'烧木材发电：每15秒消耗1木材。需接入导线。' },
    bl_solar_panel: { name:'太阳能板', cost:0, costMineral:25, reqTech:'te_machining', costRes:{ iron:25, stone:10 }, size:52, max:6, buildTime:22,
      dispH:74, cells:[1,1],
      desc:'白天发电，功率随天气打折(雨/雷暴/暴雪/雾)。需接入导线。' },
    bl_battery: { name:'蓄电池', cost:0, costMineral:15, reqTech:'te_machining', costRes:{ iron:15, wood:8 }, size:44, max:4, buildTime:18,
      dispH:84, cells:[1,1],
      desc:'存储富余电力；停电时兜底供电。需接入导线。' },
    /* T9 路灯 (issue #82): 夜间照亮周围; 无电/未接线熄灭 (CFG.power.consumers 已预留) */
    bl_lamp:  { name:'路灯', cost:0, costMineral:0, reqTech:'te_machining', costRes:{ iron:10, wood:5 }, size:48, max:12, buildTime:10,
      dispH:187, cells:[1,1],
      desc:'夜间照亮周围区域的电灯。需接入电网；断电熄灭。' },
  };
  var JOB_CYCLE = [null, 'bl_crop_plot', 'bl_farm', 'bl_kitchen', 'bl_pasture', 'bl_mine', 'bl_workshop', 'bl_lab', 'bl_clinic'];

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
  /* T2 素材建筑退款: 仅纯 costRes 建筑(墙/门: cost=0 且 costMineral=0)走实物半价; 其余(null=走研/矿) */
  function refundResOf(def){
    if (!def || def===BUILDINGS.bl_landing_pad) return null;
    if (def.cost || def.costMineral) return null;     // 有研/矿成本的建筑保持旧退款
    var cr = def.costRes || {};
    var hasRes = false, out = {};
    for (var k in cr){ if (cr[k] && k!=='food'){ hasRes=true; out[k]=Math.floor((cr[k]||0)/2); } }
    return hasRes ? out : null;
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
  function placeBuildingEntity(bid, x, y, lv, stateOverride){
    var s = stateOverride || (window.APH && window.APH.state);
    if(!s) return null;
    var def = BUILDINGS[bid];
    var rec=null;
    ((s.colony && s.colony.buildings)||[]).forEach(function(b){
      if(b && b.id===bid && Math.abs((b.x||0)-x)<2 && Math.abs((b.y||0)-y)<2) rec=b;
    });
    var ent = {
      id:'be_'+bid+'_'+((s.colony && s.colony.buildings && s.colony.buildings.length) || 0),
      type:T.BUILDING, bid:bid, x:x, y:y, def:def, lv:lv||1,
      cd:0,
      recipe: rec && rec.recipe,
      bills: rec && rec.bills,
      crop: rec && rec.crop,
      plot: rec && rec.plot,
      analysisTarget: rec && rec.analysisTarget,
      analysisProgress: rec && rec.analysisProgress,
      herd: rec && rec.herd,
    };
    if(s.entities) s.entities.push(ent);
    return ent;
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

  /* 格上静态物集合 (ADR-13 + T6 导线): 1x1 格, 不入 entities[], 可拖拽敷设 */
  var GRID_STATICS = { bl_wall:1, bl_gate:1, bl_conduit:1, bl_spike_trap:1, bl_sandbag:1 };

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
    var fp = footprintOf(bid), hw = fp.w/2, hh = fp.h/2;
    var isGrid = (def.cells && def.cells[0]===1 && def.cells[1]===1 && GRID_STATICS[bid]);
    /* P3 家具与收纳货架与温控设备豁免离核心太近(室内件, 与墙同理) */
    var isFurniture = (bid==='bl_tv'||bid==='bl_shelf'||bid==='bl_carpet'||bid==='bl_storage_shelf'||bid==='bl_heater'||bid==='bl_cooler');
    /* 墙/闸门/导线豁免离核心130px: 否则围不了家(ADR-13) */
    if(!isGrid && !isFurniture && U.dst(x,y,CFG.HAB.x,CFG.HAB.y) < 130) return { ok:false, why:'离居住核心太近' };
    for(var i=0;i<colonyBuildings.length;i++){
      var b = colonyBuildings[i];
      var of = footprintOf(b.id), ohw = of.w/2, ohh = of.h/2;
      /* 格上静态物互相相邻视为占同一格线(允许拼接: 墙上补门/过线), 但不叠放 */
      if(isGrid && GRID_STATICS[b.id]){
        /* 完全同格: 拒(不叠放); 邻格: 允许 */
        if(Math.abs(x-b.x)<1 && Math.abs(y-b.y)<1) return { ok:false, why:'该格已有格上建筑' };
        continue;
      }
      if(Math.abs(x-b.x) < hw+ohw && Math.abs(y-b.y) < hh+ohh)
        return { ok:false, why:'与其他建筑重叠' };
    }
    if(x-hw<60||y-hh<60||x+hw>CFG.WORLD-60||y+hh>CFG.WORLD-60) return { ok:false, why:'超出殖民地边界' };
    return { ok:true };
  }

  /* ---------- T2 墙/闸门格网纯函数(ADR-13) ---------- */
  /* 屏幕坐标→格中心 (48px, 与 tryPlace 一致) */
  function wallCells(wx, wy){
    return { x: Math.round(wx/CFG.GRID)*CFG.GRID, y: Math.round(wy/CFG.GRID)*CFG.GRID };
  }
  /* 建造幽灵: 鼠标世界坐标 → 吸附格 + 占位 + 可放判定 (不改世界) */
  function placementGhost(bid, wx, wy, buildings, tech, res){
    if(!bid) return null;
    var snap = wallCells(wx, wy);
    var fp = footprintOf(bid);
    var check = canPlace(buildings || [], tech, bid, snap.x, snap.y, res);
    return {
      bid: bid,
      x: snap.x, y: snap.y,
      w: fp.w, h: fp.h,
      ok: !!(check && check.ok),
      why: (check && check.why) || ''
    };
  }
  /* 从 a 到 b 的沿线格序列(拖拽连续铺墙): 取主导轴, 逐格推进 */
  function wallLine(a, b){
    var ax=Math.round(a.x/CFG.GRID), ay=Math.round(a.y/CFG.GRID);
    var bx=Math.round(b.x/CFG.GRID), by=Math.round(b.y/CFG.GRID);
    var dx=bx-ax, dy=by-ay;
    var steps=Math.max(Math.abs(dx), Math.abs(dy));
    var out=[];
    for(var i=0;i<=steps;i++){
      var t=steps? i/steps : 0;
      var cx=Math.round(ax+dx*t), cy=Math.round(ay+dy*t);
      var pt={x:cx*CFG.GRID, y:cy*CFG.GRID};
      var last=out[out.length-1];
      if(!last || last.x!==pt.x || last.y!==pt.y) out.push(pt);
    }
    return out;
  }
  /* 四邻墙判定(渲染拼接用): 闸门不算相邻墙 */
  function wallNeighbors(walls, x, y){
    var n={ north:false, south:false, east:false, west:false };
    (walls||[]).forEach(function(w){
      if(w.id!=='bl_wall') return;
      var dx=w.x-x, dy=w.y-y;
      if(dx===CFG.GRID && dy===0) n.east=true;
      else if(dx===-CFG.GRID && dy===0) n.west=true;
      else if(dx===0 && dy===CFG.GRID) n.south=true;
      else if(dx===0 && dy===-CFG.GRID) n.north=true;
    });
    return n;
  }

  /* ============================================================
     T6 电网核心 (issue #79, parent #73)
     纯函数: 导线 BFS 连网 / 供电结算 / 电池充放 / 兜底停电 / 优先级停机。
     状态契约: powerSettle().status[key] = {grid:连网?, powered:通电?},
     key = 建筑位姿 'x,y' (T8 渲染层消费, 未接线显示 ⚡)。
     电源只走导线: 发电机/电池/用电建筑经导线边邻(manhattan=1)并入同一网;
     零发电机 = 电网未激活, 所有耗电建筑默认通电 (老档兼容, 零迁移)。
     ============================================================ */
  var GRID = CFG.GRID;   // 电网段局部格网引用 (ADR-4)
  function powerRole(b){
    if(!b || !b.id) return null;
    if(b.id==='bl_wood_generator'||b.id==='bl_ancient_generator') return 'woodgen';
    if(b.id==='bl_solar_panel') return 'solar';
    if(b.id==='bl_battery') return 'battery';
    if((CFG.power && CFG.power.consumers && CFG.power.consumers[b.id])) return 'consumer';
    return null;
  }
  /* 建筑占位格: 中心格取 floor(x/GRID) (与 Nav 障碍格同规); cells 宽高扩展 */
  function powerCells(b){
    var def = BUILDINGS[b.id] || { cells:[1,1] };
    var w = (def.cells && def.cells[0]) || 1, h = (def.cells && def.cells[1]) || 1;
    var cx = Math.floor((b.x || 0) / GRID), cy = Math.floor((b.y || 0) / GRID);
    var out = [];
    for(var dy=0; dy<h; dy++) for(var dx=0; dx<w; dx++) out.push([cx+dx, cy+dy]);
    return out;
  }
  function powerKey(b){ return Math.round(b.x || 0) + ',' + Math.round(b.y || 0); }

  /* ---------- BFS 连网 (纯函数) ----------
     沿导线(4邻接)把发电机/电池/用电建筑分网;
     孤立导线 = 无成员组(不连网); 不接导线的节点 = 独自成组(不发电/不通电)。 */
  function powerNets(buildings){
    var cellsMap = {};                     // 'cx,cy' -> 导线格
    var nodes = [];                        // 电力节点 [{b,kind,cells}]
    (buildings || []).forEach(function(b){
      if(!b) return;
      var kind = powerRole(b);
      if(kind){
        nodes.push({ b:b, kind:kind, cells:powerCells(b) });
      } else if(b.id === 'bl_conduit'){
        var cx = Math.round((b.x || 0) / GRID), cy = Math.round((b.y || 0) / GRID);
        cellsMap[cx + ',' + cy] = true;
      }
    });
    /* 导线格连通分量 (BFS, 4邻接) */
    var comp = {};                         // 'cx,cy' -> 分量号
    var comps = [];
    Object.keys(cellsMap).forEach(function(k){
      if(comp[k] != null) return;
      var p = k.split(','), sx = +p[0], sy = +p[1];
      var id = comps.length;
      comps.push({ cells:{} });
      comp[k] = id;
      var stack = [[sx, sy]];
      while(stack.length){
        var c = stack.pop();
        comps[id].cells[c[0] + ',' + c[1]] = true;
        [[1,0],[-1,0],[0,1],[0,-1]].forEach(function(d){
          var nk = (c[0]+d[0]) + ',' + (c[1]+d[1]);
          if(cellsMap[nk] && comp[nk] == null){ comp[nk] = id; stack.push([c[0]+d[0], c[1]+d[1]]); }
        });
      }
    });
    var groups = comps.map(function(c){ return { cells:c.cells, gens:[], bats:[], cons:[] }; });
    /* 节点挂网: 任一占位格边邻(manhattan=1)导线格即并网 */
    nodes.forEach(function(n){
      var attached = null;
      n.cells.some(function(cell){
        var cands = [[cell[0]+1,cell[1]],[cell[0]-1,cell[1]],[cell[0],cell[1]+1],[cell[0],cell[1]-1]];
        for(var i=0; i<cands.length; i++){
          var id = comp[cands[i][0] + ',' + cands[i][1]];
          if(id != null){ attached = id; return true; }
        }
        return false;
      });
      var g = (attached != null) ? groups[attached]
        : (groups.push({ cells:{}, gens:[], bats:[], cons:[] }), groups[groups.length-1]);
      if(n.kind === 'woodgen' || n.kind === 'solar') g.gens.push(n.b);
      else if(n.kind === 'battery') g.bats.push(n.b);
      else g.cons.push(n.b);
    });
    return { groups: groups };
  }

  /* ---------- 发电输出 (纯函数) ---------- */
  /* 太阳能板: 白天 = 基础值 × solarMul(天气); 夜间 = 0 */
  function powerSolarOutput(b, isDay, solarMul){
    var cfg = (CFG.power && CFG.power.solar) || {};
    var base = cfg.watts != null ? cfg.watts : 8;
    if(isDay === false) return 0;
    var m = (solarMul != null && solarMul >= 0) ? solarMul : 1;
    return base * m;
  }
  /* 木柴发电机: 每 burnSec 秒烧 1 木材, 有木才产电; 无木时计时器冻结在即燃点 */
  function powerWoodOutput(b, res, dt){
    var cfg = (CFG.power && CFG.power.wood) || {};
    var base = cfg.watts != null ? cfg.watts : 14;
    var burnSec = cfg.burnSec != null ? cfg.burnSec : 15;
    if(!b) return 0;
    if(b.burnT == null) b.burnT = 0;
    b.burnT += (dt || 0);
    var wood = res ? ((res.wood != null ? res.wood : res.it_wood) || 0) : 0;
    var fueled = wood >= 1;
    var guard = 0;
    while(wood >= 1 && b.burnT >= burnSec && guard++ < 64){
      b.burnT -= burnSec;
      wood -= 1;
    }
    if(res){
      if(res.wood != null) res.wood = wood;
      else if(res.it_wood != null) res.it_wood = wood;
    }
    if(wood < 1 && b.burnT > burnSec) b.burnT = burnSec;   // 无木冻结在即燃点
    return fueled ? base : 0;
  }
  /* 当前天气 solarMul (接入 APH.Weather 接口; 老档/缺省兜底晴天=1) */
  function powerSolarMulOf(meta){
    var W = APH.Weather;
    if(!W || !W.weatherEffects) return 1;
    var eff = W.weatherEffects(W.currentId(meta));
    return (eff && eff.solarMul != null) ? eff.solarMul : 1;
  }

  /* ---------- 电池充放 (每网内按建筑顺序贪心) ---------- */
  function powerStore(b, charge, cap, rem){
    if(rem <= 0 || !b) return rem;
    var k = powerKey(b);
    var cur = (charge[k] != null) ? charge[k] : 0;
    var add = Math.min(cap - cur, rem);
    charge[k] = cur + add;
    return rem - add;
  }
  function powerDrainAll(bats, charge, need){
    var left = need;
    bats.forEach(function(b){
      if(left <= 0) return;
      var k = powerKey(b);
      var cur = (charge[k] != null) ? charge[k] : 0;
      var take = Math.min(cur, left);
      charge[k] = cur - take;
      left -= take;
    });
    return need - left;
  }
  /* 优先级分配: prio 小=优先保供; 同级按建造顺序贪心; 同级未全保 → 更低级全切 */
  function powerAssignBudget(cons, budget, CON){
    var on = {};
    var queue = cons.map(function(b, i){
      return { b:b, i:i, prio:((CON[b.id] && CON[b.id].prio) != null) ? CON[b.id].prio : 9 };
    });
    queue.sort(function(a, c){ return a.prio - c.prio || a.i - c.i; });
    var cum = 0, blocked = false;
    queue.forEach(function(e){
      if(blocked) return;
      var l = (CON[e.b.id] && CON[e.b.id].load) || 0;
      if(cum + l <= budget + 1e-9){ cum += l; on[powerKey(e.b)] = true; }
      else blocked = true;
    });
    return on;
  }

  /* ---------- 供电结算 (纯函数, 每帧 dt 秒推进) ----------
     buildings: 殖民地建筑记录; res: 资源库存(烧木); power: 持久态
     {charge:{'x,y':Ws}, grace:{'x,y':秒}}; opts: {solarMul, isDay}。
     产出: {active, prodW, loadW, groups, shed, status}。 */
  function powerSettle(buildings, res, power, dt, opts){
    power = power || {};
    var P = CFG.power || {};
    var CON = P.consumers || {};
    var cap = (P.battery && P.battery.cap != null) ? P.battery.cap : 100;
    var blackSec = (P.blackoutSec != null) ? P.blackoutSec : 60;
    var charge = power.charge || (power.charge = {});
    var grace = power.grace || (power.grace = {});
    var dtS = (dt > 0) ? dt : 0;
    var solarMul = (opts && opts.solarMul != null && opts.solarMul >= 0) ? opts.solarMul : 1;
    var isDay = !opts || opts.isDay !== false;

    var out = { active:false, prodW:0, loadW:0, status:{}, groups:[], shed:[] };
    var anyGen = false;
    (buildings || []).forEach(function(b){
      if(b && (b.id === 'bl_wood_generator' || b.id === 'bl_solar_panel' || b.id === 'bl_ancient_generator')) anyGen = true;
    });
    if(!anyGen){
      /* 零发电机 = 电网未激活: 所有耗电建筑默认通电 (老档不崩) */
      (buildings || []).forEach(function(b){
        if(b && CON[b.id]) out.status[powerKey(b)] = { grid:false, powered:true };
      });
      return out;
    }
    out.active = true;

    var nets = powerNets(buildings);
    out.groups = nets.groups.map(function(){ return null; });
    nets.groups.forEach(function(g, gi){
      var rec = { grid: g.gens.length > 0, prod:0, load:0 };
      var prod = 0, load = 0;
      g.gens.forEach(function(b){
        if(b.id === 'bl_wood_generator') prod += powerWoodOutput(b, res, dtS);
        else if(b.id === 'bl_solar_panel') prod += powerSolarOutput(b, isDay, solarMul);
        else if(b.id === 'bl_ancient_generator') prod += 200;
      });
      g.cons.forEach(function(b){ load += (CON[b.id] && CON[b.id].load) || 0; });
      rec.prod = prod; rec.load = load;
      out.groups[gi] = rec;
      out.prodW += prod;
      out.loadW += load;

      if(prod >= load){
        /* 产能≥负载: 满供, 富余充入本网蓄电池, 兜底计时回满 */
        var rem = (prod - load) * dtS;
        g.bats.forEach(function(b){ rem = powerStore(b, charge, cap, rem); });
        g.cons.forEach(function(b){ grace[powerKey(b)] = blackSec; });
        g.cons.forEach(function(b){ out.status[powerKey(b)] = { grid:rec.grid, powered:true }; });
      } else {
        /* 供不应求: 先耗蓄电池兜底; 电池耗尽 → 兜底计时(blackoutSec) → 优先级停机 */
        var need = (load - prod) * dtS;
        var drained = powerDrainAll(g.bats, charge, need);
        if(drained >= need - 1e-9){
          g.cons.forEach(function(b){ grace[powerKey(b)] = blackSec; });
          g.cons.forEach(function(b){ out.status[powerKey(b)] = { grid:rec.grid, powered:true }; });
        } else {
          g.cons.forEach(function(b){
            var k = powerKey(b);
            var g0 = (grace[k] != null) ? grace[k] : 0;
            if(g0 > 0){ grace[k] = Math.max(0, g0 - dtS); out.status[k] = { grid:rec.grid, powered:true }; }
          });
          /* 电池已空: 兜底到期者按优先级分配剩余水电 (发电+残电) */
          var on = powerAssignBudget(g.cons, prod + drained, CON);
          g.cons.forEach(function(b){
            var k = powerKey(b);
            if(out.status[k]) return;          // 仍在兜底通电
            var powered = !!on[k];
            out.status[k] = { grid:rec.grid, powered:powered };
            if(!powered) out.shed.push(k);
          });
        }
      }
    });
    return out;
  }

  /* ---------- T7 耗电联动消费方 (纯函数; settled=powerSettle().status) ---------- */
  /* 把供电状态写入建筑记录 (key='x,y'): 返回 {key:{grid,powered}} 简易映射 */
  function applyPowerState(buildings, status){
    var out = {};
    (buildings||[]).forEach(function(b){
      var k = powerKey(b);
      var st = status && status[k];
      if(st){ out[k] = { grid: st.grid, powered: st.powered }; }
    });
    return out;
  }
  /* 农场产量乘子: 无电减产 (CFG.power.farmPowerMul); 未激活(null)/通电=1 */
  function farmPowerMul(powered){
    var P = CFG.power || {};
    if(powered == null || powered === true) return 1;
    return (P.farmPowerMul != null) ? P.farmPowerMul : 0.5;
  }
  /* 炮塔可开火: 通电 (powered!==false) 且 无耀斑停机 */
  function turretFireAllowed(b){
    if(!b) return false;
    if(b.powered === false) return false;
    if((b.offlineT||0) > 0) return false;
    return true;
  }
  /* 医疗舱可用: powered!==false (未激活默认通电) 且 未离线 */
  function clinicPowered(b){
    if(!b) return true;
    if(b.powered === false) return false;
    return true;
  }
  /* 建筑是否耗电 (CFG.power.consumers 白名单) */
  function isPowerConsumer(id){
    var CON = (CFG.power && CFG.power.consumers) || {};
    return !!CON[id];
  }

  /* ---------- T10 尖刺陷阱与沙袋 (issue #83, 纯函数) ----------
     陷阱记录字段: { id:'bl_spike_trap', x, y, armed:true|false, cd:0 }
     armed=true=待触发; 触发后 armed=false 进入已触发态(不再触发, 居民重置恢复)。 */

  /* 敌人踩中判定: 位置进入陷阱格(中心48px)且 armed → 触发 */
  function trapTriggers(traps, pos){
    if(!traps || !traps.length || !pos) return null;
    for(var i=0;i<traps.length;i++){
      var t=traps[i];
      if(!t || t.armed===false || t.armed==null || t.x==null) continue;
      if(Math.abs(pos.x-t.x) <= 24 && Math.abs(pos.y-t.y) <= 24){
        return t;
      }
    }
    return null;
  }

  /* 穿刺伤害结算: 命中陷阱后敌人掉血 (CFG.defense.trapDamage) + 出血减速时长 */
  function trapStrike(en, defs){
    var D=defs||(CFG.defense||{});
    var dmg=(D.trapDamage!=null?D.trapDamage:12);
    var bleed=(D.trapBleedSec!=null?D.trapBleedSec:5);
    if(!en) return { dmg:0, bleed:0 };
    en.hp=Math.max(0, (en.hp||0)-dmg);
    en.bleedT=(en.bleedT||0)+bleed;    // 出血减速计时(移动乘子吃它)
    en.hitFlash=0.15;
    return { dmg:dmg, bleed:bleed };
  }

  /* 沙袋减速乘子: 位置在沙袋格内 → ×CFG.defense.sandbagMul (默认0.5) */
  function sandbagMul(bags, pos, defs){
    if(!bags || !bags.length || !pos) return 1;
    var D=defs||(CFG.defense||{});
    var mul=(D.sandbagMul!=null?D.sandbagMul:0.5);
    if(mul>=1) return 1;
    for(var i=0;i<bags.length;i++){
      var b=bags[i];
      if(!b || b.x==null) continue;
      if(Math.abs(pos.x-b.x) <= 24 && Math.abs(pos.y-b.y) <= 24) return mul;
    }
    return 1;
  }

  /* 出血移动乘子: 敌人出血期间减速 (×CFG.defense.bleedSpeedMul 默认0.7) */
  function bleedMul(en, defs){
    if(!en || !(en.bleedT>0)) return 1;
    var D=defs||(CFG.defense||{});
    return (D.bleedSpeedMul!=null?D.bleedSpeedMul:0.7);
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
  function jobOutput(residentsAtJob, kind, bonds){
    var total=0;
    residentsAtJob.forEach(function(r){
      var sk = kind==='farm'?'sk_farm':(kind==='ranch'?'sk_ranch':'sk_craft');
      var eff=APH.Res.efficiency(r);
      var lv=r.skills[sk]||0;
      var syn=(APH.Res&&APH.Res.workSynergyOf)?APH.Res.workSynergyOf(r, residentsAtJob, bonds):1;
      if(lv>0) total += Math.round(eff*(1+lv*0.25)*syn*10)/10;
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
        var syn = (APH.Res && APH.Res.workSynergyOf) ? APH.Res.workSynergyOf(w, miners, meta && meta.bonds) : 1;
        var amt=Math.max(0, Math.round(mineOutput(b.lv)*eff*craftB*syn));
        out.mineral += amt;
        if(amt>0) out.piles.push({ x:b.x||0, y:b.y||0, itemId:'it_mineral', n:amt });
      }
      if(b.id==='bl_lab'){
        var w2=labs[li++];
        if(!w2) return;
        var eff2 = (APH.Res && APH.Res.efficiency) ? APH.Res.efficiency(w2) : 1;
        var syn2 = (APH.Res && APH.Res.workSynergyOf) ? APH.Res.workSynergyOf(w2, labs, meta && meta.bonds) : 1;
        out.research += Math.max(0, Math.round(labOutput(b.lv)*eff2*labM*syn2));
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
    if(it.isSpecimen){
      meta.res[itemId]=(meta.res[itemId]||0)+n;
      return { kind:'stock', label:it.name||itemId, n:n, key:itemId, amount:n };
    }
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

  /* ---------- ADR-23: 仓储品类过滤纯函数 ---------- */
  function storageFilterMatches(containerFilter, itemId){
    if(!containerFilter || containerFilter === 'all') return true;
    if(containerFilter === itemId) return true;
    var it = (CFG.items && CFG.items[itemId]) || {};
    var store = it.store;
    if(containerFilter === 'food'){
      return store === 'food' || it.isCooked || itemId.indexOf('seed') >= 0 || itemId.indexOf('crop') >= 0;
    }
    if(containerFilter === 'materials'){
      return store === 'mineral' || store === 'iron' || store === 'stone' || store === 'wood' || store === 'leather' || store === 'alloy';
    }
    if(containerFilter === 'medical'){
      return store === 'med' || store === 'herb' || itemId === 'it_reagent';
    }
    if(containerFilter === 'specimens_gear'){
      return itemId.indexOf('specimen_') === 0 || itemId.indexOf('gear_') === 0 || store === 'gear';
    }
    return true;
  }

  function cycleStorageFilter(container){
    if(!container) return { id:'all', name:'全部允许', icon:'📦' };
    var presets = (CFG.storage && CFG.storage.presets) || [
      { id: 'all', name: '全部允许', icon: '📦' },
      { id: 'food', name: '仅食材熟食', icon: '🍞' },
      { id: 'materials', name: '仅工业建材', icon: '🧱' },
      { id: 'medical', name: '仅医疗药品', icon: '💊' },
      { id: 'specimens_gear', name: '仅标本装备', icon: '🔬' },
    ];
    var cur = container.filter || 'all';
    var idx = 0;
    for(var i = 0; i < presets.length; i++){
      if(presets[i].id === cur){ idx = i; break; }
    }
    var next = presets[(idx + 1) % presets.length];
    container.filter = next.id;
    return next;
  }

  function deteriorationTick(drop, weatherId, isSheltered, dt, roomTemp){
    if(!drop || !drop.itemId) return { loss: 0, decayed: false, decayHp: 100 };
    // 冷冻库环境 (<0°C): 彻底永久保鲜！
    if(roomTemp != null && roomTemp < 0){
      return { loss: 0, decayed: false, decayHp: drop.decayHp != null ? drop.decayHp : 100, frozen: true };
    }
    if(isSheltered && (roomTemp == null || (roomTemp >= 0 && roomTemp <= 25))) {
      return { loss: 0, decayed: false, decayHp: drop.decayHp != null ? drop.decayHp : 100 };
    }

    var it = (CFG.items && CFG.items[drop.itemId]) || {};
    // 工业矿石与建材免疫
    if(it.decayImmune || it.store === 'mineral' || it.store === 'iron' || it.store === 'stone' || it.store === 'wood' || it.store === 'alloy'){
      return { loss: 0, decayed: false, decayHp: drop.decayHp != null ? drop.decayHp : 100 };
    }

    var C = (CFG.storage) || {};
    var wxTable = C.weatherDecayMul || {};
    var wxMul = (weatherId && wxTable[weatherId] != null) ? wxTable[weatherId] : 1;

    var isPerishable = (it.store === 'food' || it.isCooked || it.store === 'herb' || drop.itemId.indexOf('berry') >= 0 || drop.itemId.indexOf('crop') >= 0);
    var baseRate = isPerishable ? (C.decayPerishableBase || 1.5) : (C.decayNormalBase || 0.5);

    var tempMul = 1.0;
    if(roomTemp != null && roomTemp >= 0 && roomTemp <= 10){
      tempMul = 0.3; // 冷藏减缓 70%
    }

    var step = (dt != null ? dt : 30) / 30;
    var loss = Math.round(baseRate * wxMul * tempMul * step * 10) / 10;

    var cur = (drop.decayHp != null) ? drop.decayHp : (C.decayHpMax || 100);
    var next = Math.max(0, Math.round((cur - loss) * 10) / 10);
    drop.decayHp = next;

    return {
      loss: loss,
      decayed: next <= 0,
      decayHp: next
    };
  }

  function cropThermalGrowthMul(envTemp){
    var t = envTemp != null ? envTemp : 20;
    if(t < 0) return 0;
    if(t >= 10 && t <= 35) return 1.0;
    return 0.5;
  }

  function bulkHaulCandidates(primaryDrop, allDrops, maxRadius, maxPiles, maxCount){
    if(!primaryDrop) return [];
    var list = allDrops || [];
    var rMax = maxRadius != null ? maxRadius : ((CFG.storage && CFG.storage.bulkHaulRadius) || 48);
    var pMax = maxPiles != null ? maxPiles : ((CFG.storage && CFG.storage.bulkHaulMaxPiles) || 3);
    var cMax = maxCount != null ? maxCount : ((CFG.storage && CFG.storage.bulkHaulMaxCount) || 50);

    var res = [primaryDrop];
    var curCount = primaryDrop.n || 1;

    for(var i = 0; i < list.length; i++){
      if(res.length >= pMax || curCount >= cMax) break;
      var d = list[i];
      if(!d || d.dead || d.id === primaryDrop.id) continue;
      var dist = U.dst(primaryDrop.x, primaryDrop.y, d.x, d.y);
      if(dist <= rMax){
        var n = d.n || 1;
        if(curCount + n <= cMax || res.length < 2){
          res.push(d);
          curCount += n;
        }
      }
    }
    return res;
  }

  function cellsFromBox(x0, y0, x1, y1){
    var g = CFG.GRID || 48;
    var minX = Math.round(Math.min(x0, x1) / g) * g;
    var maxX = Math.round(Math.max(x0, x1) / g) * g;
    var minY = Math.round(Math.min(y0, y1) / g) * g;
    var maxY = Math.round(Math.max(y0, y1) / g) * g;
    var cells = [], x, y;
    for(x = minX; x <= maxX; x += g){
      for(y = minY; y <= maxY; y += g){
        cells.push({ x: x, y: y });
      }
    }
    if(!cells.length) cells.push({ x: minX, y: minY });
    return cells;
  }
  function addStockpileZone(zones, cells, opts){
    zones = (zones || []).slice();
    var z = {
      id: 'zn_stock_' + (zones.length + 1),
      type: 'stockpile',
      cells: cells || [],
      filter: (opts && opts.filter) || 'all',
      forbid: (opts && opts.forbid) ? opts.forbid.slice() : []
    };
    zones.push(z);
    return { zones: zones, zone: z };
  }
  function zoneAllowsItem(zone, itemId){
    if(!zone) return false;
    var forbids = zone.forbid || [];
    var i, f;
    for(i = 0; i < forbids.length; i++){
      f = forbids[i];
      if(!f || f === 'all') continue;
      if(storageFilterMatches(f, itemId)) return false;
    }
    return storageFilterMatches(zone.filter, itemId);
  }
  function addGrowZone(zones, cells, cropType){
    zones = (zones || []).slice();
    var crops = ALIEN_CROPS || {};
    var crop = cropType && crops[cropType] ? cropType : 'crop_dew_fruit';
    if(!crops[crop]){
      crop = Object.keys(crops)[0] || 'crop_dew_fruit';
    }
    var z = {
      id: 'zn_grow_' + (zones.length + 1),
      type: 'grow',
      cells: (cells || []).map(function(c){ return { x:c.x, y:c.y, plant:null }; }),
      cropType: crop
    };
    zones.push(z);
    return { zones: zones, zone: z };
  }
  function tickGrowZones(zones, farmerSkill, eff){
    var harvested = [];
    if(farmerSkill == null) return { harvested: harvested };
    (zones || []).forEach(function(z){
      if(!z || z.type !== 'grow') return;
      (z.cells || []).forEach(function(c){
        if(!c.plant) c.plant = { stage:1, t:0 };
        if(c.plant.stage >= 3){
          var h = harvestAlienCrop(z.cropType, farmerSkill);
          harvested.push({ x:c.x, y:c.y, drop:h, cropType:z.cropType });
          c.plant = { stage:1, t:0 };
        } else {
          c.plant = cropPlotTick(c.plant, farmerSkill, eff, 1, z.cropType);
        }
      });
    });
    return { harvested: harvested };
  }
  function cycleGrowCrop(zone){
    if(!zone) return null;
    var ids = Object.keys(ALIEN_CROPS || {});
    if(!ids.length) return zone.cropType;
    var i = ids.indexOf(zone.cropType);
    zone.cropType = ids[(i + 1) % ids.length];
    return zone.cropType;
  }
  function filthKey(x, y){
    var g = CFG.GRID || 48;
    return Math.round(x / g) * g + ',' + Math.round(y / g) * g;
  }
  function addFilth(map, x, y, n){
    map = map || {};
    var k = filthKey(x, y);
    map[k] = (map[k] || 0) + (n || 1);
    return map;
  }
  function filthAt(map, x, y){
    if(!map) return 0;
    return map[filthKey(x, y)] || 0;
  }
  function cleanCells(map, cells, amt){
    map = map || {};
    amt = amt != null ? amt : 20;
    (cells || []).forEach(function(c){
      var k = c.x + ',' + c.y;
      if(map[k] == null) k = filthKey(c.x, c.y);
      map[k] = Math.max(0, (map[k] || 0) - amt);
      if(map[k] <= 0) delete map[k];
    });
    return map;
  }
  function ensureBuildingHp(b){
    if(!b) return b;
    var def = BUILDINGS[b.id] || {};
    if(b.maxHp == null) b.maxHp = def.hp || (CFG.wall && b.id==='bl_wall' && CFG.wall.hp) || 80;
    if(b.hp == null) b.hp = b.maxHp;
    return b;
  }
  function decayBuilding(b, rate){
    ensureBuildingHp(b);
    b.hp = Math.max(0, (b.hp || 0) - (rate || 0));
    return b;
  }
  function repairBuilding(b, amt){
    ensureBuildingHp(b);
    b.hp = Math.min(b.maxHp, (b.hp || 0) + (amt || 0));
    return b;
  }
  function addFire(fires, x, y){
    fires = (fires || []).slice();
    var g = CFG.GRID || 48;
    x = Math.round(x / g) * g; y = Math.round(y / g) * g;
    fires.push({ x:x, y:y, hp:20 });
    return fires;
  }
  function douseFires(fires, cells){
    var drop = {};
    (cells || []).forEach(function(c){ drop[c.x + ',' + c.y] = 1; });
    return (fires || []).filter(function(f){ return !drop[f.x + ',' + f.y]; });
  }
  function addRestrictZone(zones, cells){
    zones = (zones || []).slice();
    var z = { id:'zn_area_' + (zones.length + 1), type:'restrict', cells: cells || [] };
    zones.push(z);
    return { zones: zones, zone: z };
  }
  function pointAllowed(zones, pawn, x, y){
    if(!pawn || !pawn.restrictId) return true;
    var z = null;
    (zones || []).forEach(function(zz){ if(zz && zz.id === pawn.restrictId) z = zz; });
    if(!z) return true;
    var g = CFG.GRID || 48;
    var px = Math.round(x / g) * g, py = Math.round(y / g) * g;
    var i, c;
    for(i = 0; i < (z.cells || []).length; i++){
      c = z.cells[i];
      if(c && c.x === px && c.y === py) return true;
    }
    return false;
  }
  function eraseZoneCells(zones, cells){
    var drop = {};
    (cells || []).forEach(function(c){ drop[c.x + ',' + c.y] = 1; });
    return (zones || []).map(function(z){
      var kept = (z.cells || []).filter(function(c){ return !drop[c.x + ',' + c.y]; });
      return Object.assign({}, z, { cells: kept });
    }).filter(function(z){ return z.cells && z.cells.length; });
  }
  function findBestStorageSpot(itemId, buildings, rooms, fromPos, zones){
    var bList = buildings || [];
    var best = null, bestDist = 1e9;
    var zi, z, ci, cell, d;
    var zList = zones || [];
    for(zi = 0; zi < zList.length; zi++){
      z = zList[zi];
      if(!z || z.type !== 'stockpile') continue;
      if(!zoneAllowsItem(z, itemId)) continue;
      for(ci = 0; ci < (z.cells || []).length; ci++){
        cell = z.cells[ci];
        if(!cell) continue;
        d = fromPos ? U.dst(fromPos.x, fromPos.y, cell.x, cell.y) : 0;
        if(d < bestDist){
          bestDist = d;
          best = { x: cell.x, y: cell.y, zone: z, container: null };
        }
      }
    }
    if(best) return best;

    for(var i = 0; i < bList.length; i++){
      var b = bList[i];
      if(!b || (b.id !== 'bl_storage_shelf' && b.id !== 'bl_warehouse')) continue;
      if(storageFilterMatches(b.filter, itemId)){
        d = fromPos ? U.dst(fromPos.x, fromPos.y, b.x, b.y) : 0;
        if(d < bestDist){
          bestDist = d;
          best = { x: b.x, y: b.y, container: b };
        }
      }
    }

    if(best){
      return { x: best.x, y: best.y, container: best.container || best };
    }
    var fallback = stockpileSpot(bList);
    return { x: fallback.x, y: fallback.y, container: null };
  }

  function findNearbySourcedItem(category, centerPos, maxRadius, buildings, entities, meta){
    if(!category || !centerPos) return { found: false };
    var rMax = maxRadius != null ? maxRadius : ((CFG.storage && CFG.storage.sourcingRadius) || 120);
    var bList = buildings || [];
    var eList = entities || [];

    var matchingContainers = [];
    for(var i = 0; i < bList.length; i++){
      var b = bList[i];
      if(!b || (b.id !== 'bl_storage_shelf' && b.id !== 'bl_warehouse')) continue;
      if(storageFilterMatches(b.filter, category)){
        var d = U.dst(centerPos.x, centerPos.y, b.x, b.y);
        if(d <= rMax){
          matchingContainers.push({ building: b, distance: d });
        }
      }
    }

    matchingContainers.sort(function(a, b){ return a.distance - b.distance; });

    for(var j = 0; j < matchingContainers.length; j++){
      var c = matchingContainers[j];
      for(var k = 0; k < eList.length; k++){
        var item = eList[k];
        if(!item || item.dead || (item.type && item.type !== T.DROPPED) || !item.itemId) continue;
        if(storageFilterMatches(category, item.itemId)){
          if(U.dst(c.building.x, c.building.y, item.x, item.y) <= 32){
            return {
              found: true,
              shelf: c.building,
              drop: item,
              distance: c.distance
            };
          }
        }
      }
    }

    return { found: false };
  }

  /* ---------- ADR-25: 封闭房间热阻隔热与传导纯函数 ---------- */
  function roomTemperatureTick(room, ambientTemp, dt, appliances){
    if(!room) return ambientTemp;
    if(room.isEnclosed === false){
      room.temp = ambientTemp;
      return ambientTemp;
    }
    if(room.temp == null) room.temp = 21;
    var C = (CFG.temperature) || {};
    var baseRate = C.thermalTransmissionRate != null ? C.thermalTransmissionRate : 0.15;
    var step = (dt != null ? dt : 30) / 30;
    var rate = Math.max(0, Math.min(1, baseRate * step));
    
    // 自然环境传导
    var current = room.temp + (ambientTemp - room.temp) * rate;

    // 温控设备调节
    var list = appliances || [];
    for(var i = 0; i < list.length; i++){
      var app = list[i];
      if(!app || app.powered === false) continue;
      if(app.id === 'bl_heater' || app.bid === 'bl_heater'){
        var hTarget = C.heaterTarget != null ? C.heaterTarget : 21;
        if(current < hTarget){
          current = Math.min(hTarget, current + 15 * step);
        }
      } else if(app.id === 'bl_cooler' || app.bid === 'bl_cooler'){
        var cTarget = app.targetTemp != null ? app.targetTemp : (app.mode === 'freezer' ? (C.coolerTargetFreezer != null ? C.coolerTargetFreezer : -5) : (C.coolerTargetComfort != null ? C.coolerTargetComfort : 20));
        if(current > cTarget){
          current = Math.max(cTarget, current - 15 * step);
        }
      }
    }

    room.temp = Math.round(current * 10) / 10;
    return room.temp;
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
  var JOB_SKILL={ bl_farm:'sk_farm', bl_crop_plot:'sk_farm', bl_kitchen:'sk_farm', bl_pasture:'sk_ranch', bl_clinic:'sk_social',
                  bl_mine:'sk_craft', bl_workshop:'sk_craft', bl_lab:'sk_lore' };
  var JOB_SLOTS={ bl_farm:2, bl_pasture:2, bl_clinic:1, bl_mine:1, bl_workshop:1, bl_lab:1, bl_kitchen:1, bl_crop_plot:1 };
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
      if(r.downed || r.isSleeping || r.medLying){ out[r.id]=null; return; } // 击倒/睡眠/医疗舱俯卧缺勤 (Survival #15, #17, #69)
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
                          desc:'' },
    te_hydroponics:     { name:'温控水培技术', cost:80, max:1, requires:['te_basic_farming'],
                          desc:'解锁水培农场' },
    te_alien_culinary:  { name:'异星烹饪保鲜', cost:70, max:1, requires:['te_basic_farming'],
                          desc:'解锁烹饪灶台与高级食谱' },
    te_bio_adaptation:  { name:'外星生态适应', cost:150, max:1, requires:['te_hydroponics'],
                          assayKey:'specimen_chitin', assayNeed:'硅壳装甲',
                          desc:'解锁星绒防酸服与极地防寒羽绒' },

    // 工业分支
    te_stonecutting:    { name:'石料切割加工', cost:40, max:1, requires:[],
                          desc:'解锁石料篝火' },
    te_machining:       { name:'机械锻造合金', cost:90, max:1, requires:['te_stonecutting'],
                          desc:'解锁自动采矿机' },
    te_deep_drilling:   { name:'深空重型钻探', cost:160, max:1, requires:['te_machining'],
                          desc:'' },

    // 医学分支
    te_herbal_remedies: { name:'草药提炼包扎', cost:50, max:1, requires:[],
                          desc:'解锁荧光夜视镜与复合急救包' },
    te_medicine:        { name:'外星临床医学', cost:100, max:1, requires:['te_herbal_remedies'],
                          desc:'解锁医疗舱' },
    te_bionics:         { name:'仿生机能强化', cost:180, max:1, requires:['te_medicine'],
                          desc:'' },

    // 安防分支
    te_ballistics:      { name:'弹道工程防卫', cost:60, max:1, requires:[],
                          desc:'解锁兵营，等离子伤害 +30%', effect:{ dmgMul:.30 } },
    te_weaponry:        { name:'弹道工程防卫', cost:60, max:3, requires:[],
                          desc:'等离子伤害 +30%', effect:{ dmgMul:.30 }, hidden:true }, // 旧档别名, 新图不展示
    te_turret_tech:     { name:'自动防御炮塔', cost:110, max:1, requires:['te_ballistics'],
                          desc:'解锁防御炮塔' },
    te_plasma_grid:     { name:'等离子电网重炮', cost:200, max:1, requires:['te_turret_tech'],
                          desc:'' },
    te_heavy_plasma:    { name:'等离子重炮与史前能源', cost:100, max:1, requires:['te_ballistics'],
                          desc:'史前遗迹科技：解锁等离子重炮与史前永恒发电机' },

    te_o2tank:          { name:'氧气罐扩容', cost:40, max:3, requires:[],
                          desc:'氧气上限 +25', effect:{ o2Max:+25 } },
    te_radar:           { name:'深空广域雷达', cost:80, max:2, requires:['te_ballistics'],
                          desc:'罗盘标晶体与敌基地', effect:{ radar:true } },
    te_exosuit:         { name:'外骨骼动力装甲', cost:140, max:2, requires:['te_machining'],
                          desc:'移动速度 +15%', effect:{ spdMul:.15 } },
  };

  /* 全屏科技图列: 探索不单列; 雷达/外骨骼挂父节点所在列; 氧气罐挂安防列顶 */
  var TECH_COLUMNS = [
    { name:'农业', ids:['te_basic_farming','te_hydroponics','te_bio_adaptation','te_alien_culinary'] },
    { name:'工业', ids:['te_stonecutting','te_machining','te_deep_drilling','te_exosuit'] },
    { name:'医学', ids:['te_herbal_remedies','te_medicine','te_bionics'] },
    { name:'安防', ids:['te_o2tank','te_ballistics','te_turret_tech','te_plasma_grid','te_heavy_plasma','te_radar'] },
  ];

  function techDepth(techId){
    var n=0, id=techId, seen={};
    while(id && TECHS[id] && TECHS[id].requires && TECHS[id].requires[0] && !seen[id]){
      seen[id]=1;
      id=TECHS[id].requires[0];
      n++;
    }
    return n;
  }

  function plasmaTechLevel(tech){
    tech=tech||{};
    return Math.max(tech.te_ballistics||0, tech.te_weaponry||0);
  }

  function missingRequire(t, owned){
    var reqs = t.requires || [];
    for(var i=0; i<reqs.length; i++){
      var r = reqs[i];
      if(!owned || !owned[r]){
        return TECHS[r] ? TECHS[r].name : r;
      }
    }
    return null;
  }

  function assayNeedText(t){
    return '需在科研站化验'+(t.assayNeed || t.assayKey || '标本');
  }

  /* 化验钥匙: 前置已有且标本已化验则写入 meta.tech, 不花研究点 */
  function grantAssayKeyedTechs(meta){
    meta = meta || {};
    meta.tech = meta.tech || {};
    var analyzed = meta.analyzedSpecimens || {};
    var granted = [];
    Object.keys(TECHS).forEach(function(id){
      var t = TECHS[id];
      if(!t || !t.assayKey) return;
      if((meta.tech[id]||0) >= (t.max||1)) return;
      if(missingRequire(t, meta.tech)) return;
      if(!analyzed[t.assayKey]) return;
      meta.tech[id] = Math.max(meta.tech[id]||0, 1);
      granted.push(id);
    });
    return granted;
  }

  /* 可购判定(纯函数): 检查研究点与所有 requires 前置科技 */
  function canBuy(meta, techId, owned){
    var t=TECHS[techId];
    if(!t) return { ok:false, why:'未知科技' };
    if((owned[techId]||0)>= (t.max||1)) return { ok:false, why:'已达最高等级' };
    if(t.assayKey){
      var miss = missingRequire(t, owned);
      if(miss) return { ok:false, why:'需先研发: ' + miss };
      return { ok:false, why:assayNeedText(t) };
    }
    var reqName = missingRequire(t, owned);
    if(reqName) return { ok:false, why:'需先研发: ' + reqName };
    if((meta.research||0) < t.cost) return { ok:false, why:'研究点不足 (需 '+t.cost+')' };
    return { ok:true };
  }

  function techNodeStatus(meta, techId, owned){
    owned = owned || (meta && meta.tech) || {};
    var t=TECHS[techId];
    if(!t) return { state:'unknown', why:'未知科技', lv:0 };
    var lv=owned[techId]||0;
    var max=t.max||1;
    if(lv>=max) return { state:'owned', why:'已研发', lv:lv, max:max };
    if(t.assayKey){
      var miss=missingRequire(t, owned);
      if(miss) return { state:'locked', why:'需先研发: '+miss, lv:lv, max:max };
      var analyzed=(meta && meta.analyzedSpecimens)||{};
      if(!analyzed[t.assayKey]) return { state:'assay', why:assayNeedText(t), lv:lv, max:max };
      return { state:'assay', why:assayNeedText(t), lv:lv, max:max };
    }
    var chk=canBuy(meta, techId, owned);
    if(chk.ok) return { state:'available', why:'', lv:lv, max:max };
    if(chk.why && chk.why.indexOf('研究点')>=0) return { state:'unaffordable', why:chk.why, lv:lv, max:max };
    return { state:'locked', why:chk.why, lv:lv, max:max };
  }

  /* 购买并应用效果(世界侧): 返回更新后的 owned; 化验钥匙可能顺带点亮 */
  function buyTech(meta, techId, owned){
    var chk=canBuy(meta, techId, owned);
    if(!chk.ok) return { ok:false, owned:owned, why:chk.why };
    meta.research -= TECHS[techId].cost;
    var o = Object.assign({}, owned);
    o[techId]=(o[techId]||0)+1;
    meta.tech = o;
    var granted = grantAssayKeyedTechs(meta);
    return { ok:true, owned:meta.tech, granted:granted };
  }

  /* ---------- 7 大异星实物标本化验表 (Science #51) ---------- */
  var SPECIMEN_ANALYSIS = {
    specimen_flora_glow:    { name:'荧蕈基因测序', craftTime:15, unlockCrop:'crop_glow_shroom', seedOutput:'it_seed_glow', seedCount:3, eurekaResearch:30, desc:'解锁夜光荧蕈田圃种植，产出纯净种荚' },
    specimen_dew:           { name:'露果多肉化验', craftTime:14, unlockCrop:'crop_dew_fruit', seedOutput:'it_seed_dew', seedCount:3, eurekaResearch:25, desc:'解锁露珠膨果田圃种植' },
    specimen_crystal_vine:  { name:'晶藤微构逆向', craftTime:18, unlockCrop:'crop_crystal_vine', seedOutput:'it_seed_crystal', seedCount:3, eurekaResearch:40, desc:'解锁晶脉拟态藤种植' },
    specimen_star_velvet:   { name:'星绒抗性解析', craftTime:18, unlockCrop:'crop_star_velvet', seedOutput:'it_seed_star', seedCount:3, eurekaResearch:45, desc:'解锁星绒草种植' },
    specimen_chitin:        { name:'硅壳装甲解剖', craftTime:20, unlockTech:'te_bio_adaptation', eurekaResearch:50, desc:'突破外星生态适应与防酸装甲' },
    specimen_acid_gland:    { name:'强酸生化提炼', craftTime:16, reagentOutput:'it_reagent', reagentCount:2, eurekaResearch:45, desc:'提炼高能催化试剂' },
    specimen_ancient_chip:  { name:'古代逻辑逆向', craftTime:25, eurekaResearch:120, desc:'古代科学数据全盘注入' },
    it_ancient_blueprint:   { name:'古代蓝图破译', craftTime:20, unlockTech:'te_heavy_plasma', eurekaResearch:100, desc:'破译古代超空间蓝图，解锁等离子重炮与史前永恒发电机' },
  };

  /* 科研站实物标本化验推进(纯函数) (Science #52) */
  function labAnalysisTick(lab, scholarSkill, eff, stock, dt){
    if(!lab || scholarSkill == null) return { done:false };
    var specimenId = lab.analysisTarget || 'specimen_flora_glow';
    var def = SPECIMEN_ANALYSIS[specimenId];
    if(!def) return { done:false, why:'未知标本' };

    var have = (stock && stock[specimenId] != null) ? stock[specimenId] : 0;
    if(have < 1){
      return { done:false, why:'标本不足' };
    }

    var e = (eff == null ? 1 : eff);
    var sci = CFG.science || {};
    var skillMul = sci.scholarSkillMul != null ? sci.scholarSkillMul : 0.15;
    var defaultT = sci.defaultCraftTime != null ? sci.defaultCraftTime : 15;
    var rate = (dt || 1) * e * (1 + scholarSkill * skillMul);
    lab.analysisProgress = (lab.analysisProgress || 0) + rate;

    if(lab.analysisProgress >= (def.craftTime || defaultT)){
      if(stock && stock[specimenId] != null){
        stock[specimenId] = Math.max(0, stock[specimenId] - 1);
      }
      lab.analysisProgress = 0;
      return { done:true, specimenId:specimenId, def:def };
    }
    return { done:false, progress:lab.analysisProgress, total:def.craftTime };
  }

  /* 化验完成三重回报: 点亮种植权限 / 授予蓝图科技 / 尤里卡研究点 (Science #54) */
  function applySpecimenAnalysis(meta, stock, def, specimenId){
    meta = meta || {};
    stock = stock || meta.res || {};
    meta.analyzedFlora = meta.analyzedFlora || {};
    meta.analyzedSpecimens = meta.analyzedSpecimens || {};
    meta.tech = meta.tech || {};
    var out = { unlockCrop:null, unlockTech:null, eureka:0, seeds:{} };
    if(!def) return out;
    if(specimenId) meta.analyzedSpecimens[specimenId] = true;
    if(def.unlockCrop){
      meta.analyzedFlora[def.unlockCrop] = true;
      out.unlockCrop = def.unlockCrop;
    }
    var granted = grantAssayKeyedTechs(meta);
    if(def.unlockTech && granted.indexOf(def.unlockTech)>=0){
      out.unlockTech = def.unlockTech;
    }
    var eureka = def.eurekaResearch || 0;
    meta.research = (meta.research||0) + eureka;
    out.eureka = eureka;
    if(def.seedOutput){
      out.seeds[def.seedOutput] = def.seedCount || 1;
    }
    if(def.reagentOutput){
      out.seeds[def.reagentOutput] = def.reagentCount || 1;
    }
    return out;
  }

  function canPlantCrop(cropId, analyzedFlora){
    if(!cropId) return false;
    return !!(analyzedFlora && analyzedFlora[cropId]);
  }

  function cycleAnalyzedCrop(current, analyzedFlora){
    var keys = Object.keys(ALIEN_CROPS).filter(function(k){
      return analyzedFlora && analyzedFlora[k];
    });
    if(!keys.length) return null;
    var idx = keys.indexOf(current);
    return keys[(idx + 1) % keys.length];
  }

  function cycleAnalysisTarget(current){
    var keys = Object.keys(SPECIMEN_ANALYSIS);
    if(!keys.length) return current || null;
    var idx = keys.indexOf(current);
    return keys[(idx + 1) % keys.length];
  }

  /* 科学图鉴条目(纯函数): 已化验带解剖档案, 未化验只报待化验 (Science #55) */
  function specimenCodexEntries(meta){
    var analyzed = (meta && meta.analyzedSpecimens) || {};
    var items = CFG.items || {};
    return Object.keys(SPECIMEN_ANALYSIS).filter(function(id){
      return id.indexOf('specimen_') === 0;
    }).map(function(id){
      var def = SPECIMEN_ANALYSIS[id] || {};
      var it = items[id] || {};
      return {
        id: id,
        name: it.name || id,
        analysisName: def.name || id,
        desc: def.desc || '',
        analyzed: !!analyzed[id],
        unlockCrop: def.unlockCrop || null,
        unlockTech: def.unlockTech || null,
        eureka: def.eurekaResearch || 0
      };
    });
  }

  /* ---------- 工坊加工配方表 (Craft #46) ---------- */
  var CRAFT_RECIPES = {
    it_pickaxe:       { name:'精工采矿斧', costRes:{ wood:15, iron:10 }, craftTime:12, reqTech:'te_machining' },
    it_suit_hazard:   { name:'星绒防酸服', costRes:{ it_star_fiber:8, leather:4, iron:10 }, craftTime:18, reqTech:'te_bio_adaptation' },
    it_suit_cryo:     { name:'极地防寒羽绒', costRes:{ it_star_fiber:10, leather:6 }, craftTime:18, reqTech:'te_bio_adaptation' },
    it_goggles_night: { name:'荧光夜视镜', costRes:{ it_glow_fluid:6, iron:12 }, craftTime:15, reqTech:'te_herbal_remedies' },
    it_medkit_adv:    { name:'复合急救包', costRes:{ herb:4, it_glow_fluid:2 }, craftTime:10, reqTech:'te_herbal_remedies' },
  };

  function activeBill(bldg){
    var bills = bldg && bldg.bills;
    if(!bills || !bills.length) return null;
    var i, b;
    for(i=0;i<bills.length;i++){
      b = bills[i];
      if(b && (b.done||0) < (b.target||0)) return b;
    }
    return null;
  }
  function addBill(bldg, recipe, target){
    if(!bldg) return null;
    if(!bldg.bills) bldg.bills = [];
    var bill = {
      id: 'bi_' + (bldg.bills.length+1) + '_' + (recipe||'x'),
      recipe: recipe,
      target: target > 0 ? target : 1,
      done: 0
    };
    bldg.bills.push(bill);
    return bill;
  }
  function finishBillUnit(bldg, count){
    var bill = activeBill(bldg);
    if(!bill) return;
    bill.done = (bill.done||0) + (count||1);
  }
  function billGate(bldg){
    if(!bldg || !Array.isArray(bldg.bills)) return { ok:true };
    var bill = activeBill(bldg);
    if(!bill) return { ok:false, why:'无工单' };
    bldg.recipe = bill.recipe;
    return { ok:true, bill:bill };
  }

  /* 工坊制作推进(纯函数) (Craft #47) */
  function workshopCraftTick(workshop, crafterSkill, eff, resStock, techOwned, dt){
    if(!workshop || crafterSkill == null) return { done:false };
    var gate = billGate(workshop);
    if(!gate.ok) return { done:false, why:gate.why };
    var recipeKey = workshop.recipe || 'it_pickaxe';
    var rec = CRAFT_RECIPES[recipeKey];
    if(!rec) return { done:false, why:'未知配方' };

    if(rec.reqTech && (!techOwned || !techOwned[rec.reqTech])){
      return { done:false, why:'未研发前置科技' };
    }

    var costRes = rec.costRes || {};
    for(var k in costRes){
      var need = costRes[k] || 0;
      var have = (resStock && resStock[k] != null) ? resStock[k] : (resStock && resStock.mineral != null ? resStock.mineral : 0);
      if(have < need){
        return { done:false, why:'材料不足' };
      }
    }

    var e = (eff == null ? 1 : eff);
    var rate = (dt || 1) * e * (1 + crafterSkill * 0.15);
    workshop.craftProgress = (workshop.craftProgress || 0) + rate;

    if(workshop.craftProgress >= (rec.craftTime || 10)){
      for(var mat in costRes){
        var amt = costRes[mat] || 0;
        if(resStock && resStock[mat] != null){
          resStock[mat] = Math.max(0, resStock[mat] - amt);
        }
      }
      workshop.craftProgress = 0;
      finishBillUnit(workshop, 1);
      return { done:true, producedItemId:recipeKey, count:1 };
    }
    return { done:false, progress:workshop.craftProgress, total:rec.craftTime };
  }

  /* 装备穿戴与被动抗性派生 (Craft #48) */
  function equipGear(character, itemId){
    if(!character || !itemId) return character;
    character.gear = character.gear || { tool:null, suit:null, head:null };
    var it = (CFG.items && CFG.items[itemId]) || {};
    var slot = it.slot || (itemId.startsWith('it_suit')?'suit':(itemId.startsWith('it_goggles')?'head':'tool'));
    if(slot === 'tool') character.gear.tool = itemId;
    else if(slot === 'suit') character.gear.suit = itemId;
    else if(slot === 'head') character.gear.head = itemId;
    return character;
  }

  function gearBonusOf(character){
    if(!character || !character.gear) return { toolMul:1.0, acidResist:0.0, cryoResist:0.0, sightBoost:0 };
    var g = character.gear;
    var toolItem = g.tool ? (CFG.items && CFG.items[g.tool]) : null;
    var suitItem = g.suit ? (CFG.items && CFG.items[g.suit]) : null;
    var headItem = g.head ? (CFG.items && CFG.items[g.head]) : null;

    return {
      toolMul: (toolItem && toolItem.toolMul) ? toolItem.toolMul : 1.0,
      acidResist: (suitItem && suitItem.acidResist) ? suitItem.acidResist : 0.0,
      cryoResist: (suitItem && suitItem.cryoResist) ? suitItem.cryoResist : 0.0,
      sightBoost: (headItem && headItem.sightBoost) ? headItem.sightBoost : 0,
    };
  }

  /* ---------- 烹饪加工配方表 (Cooking #49) ---------- */
  var COOK_RECIPES = {
    it_roasted_meat: { name:'炙烤异星肉排', costRes:{ food:2, wood:1 }, cookTime:8, reqTech:'te_stonecutting', bldgs:['bl_campfire','bl_kitchen'], bldg:['bl_campfire','bl_kitchen'] },
    it_berry_stew:   { name:'晶核浆果浓汤', costRes:{ it_berry:2, it_crystal_berry:1, wood:1 }, cookTime:10, reqTech:'te_alien_culinary', bldgs:['bl_kitchen'], bldg:['bl_kitchen'] },
    it_dew_pudding:  { name:'清甜露果布丁', costRes:{ it_dew_fruit:2, it_berry:1 }, cookTime:10, reqTech:'te_alien_culinary', bldgs:['bl_kitchen'], bldg:['bl_kitchen'] },
    it_glow_fondue:  { name:'荧光温热浓汤', costRes:{ it_glow_fluid:2, food:1, wood:1 }, cookTime:12, reqTech:'te_alien_culinary', bldgs:['bl_kitchen'], bldg:['bl_kitchen'] },
    it_alien_feast:  { name:'外星珍馐盛宴', costRes:{ food:2, it_crystal_berry:1, it_dew_fruit:1, it_glow_fluid:1 }, cookTime:18, reqTech:'te_alien_culinary', bldgs:['bl_kitchen'], bldg:['bl_kitchen'] },
  };

  function checkCookRes(resStock, matKey){
    if(!resStock) return 0;
    if(resStock[matKey] != null) return resStock[matKey];
    if(typeof matKey === 'string' && matKey.startsWith('it_') && resStock[matKey.slice(3)] != null) return resStock[matKey.slice(3)];
    if(typeof matKey === 'string' && !matKey.startsWith('it_') && resStock['it_' + matKey] != null) return resStock['it_' + matKey];
    var it = CFG.items && (CFG.items[matKey] || CFG.items['it_' + matKey]);
    if(it && it.store && resStock[it.store] != null) return resStock[it.store];
    return (resStock.mineral != null && (matKey === 'mineral' || matKey === 'it_mineral')) ? resStock.mineral : 0;
  }
  function deductCookRes(resStock, matKey, amt){
    if(!resStock || !amt) return;
    if(resStock[matKey] != null){
      resStock[matKey] = Math.max(0, resStock[matKey] - amt);
      return;
    }
    if(typeof matKey === 'string' && matKey.startsWith('it_') && resStock[matKey.slice(3)] != null){
      resStock[matKey.slice(3)] = Math.max(0, resStock[matKey.slice(3)] - amt);
      return;
    }
    if(typeof matKey === 'string' && !matKey.startsWith('it_') && resStock['it_' + matKey] != null){
      resStock['it_' + matKey] = Math.max(0, resStock['it_' + matKey] - amt);
      return;
    }
    var it = CFG.items && (CFG.items[matKey] || CFG.items['it_' + matKey]);
    if(it && it.store && resStock[it.store] != null){
      resStock[it.store] = Math.max(0, resStock[it.store] - amt);
    }
  }

  /* 烹饪制作推进(纯函数) (Cooking #49) */
  function cookingTick(bldg, chefSkill, eff, resStock, techOwned, dt){
    if(!bldg) return { done:false };
    var gate = billGate(bldg);
    if(!gate.ok) return { done:false, why:gate.why };
    var bId = bldg.id || bldg.bid;
    var recipeKey = bldg.recipe || ((bId === 'bl_campfire') ? 'it_roasted_meat' : 'it_roasted_meat');
    var rec = COOK_RECIPES[recipeKey];
    if(!rec) return { done:false, why:'未知配方' };

    var allowed = rec.bldgs || rec.bldg || ['bl_kitchen', 'bl_campfire'];
    if(allowed && allowed.indexOf(bId) < 0){
      return { done:false, why:'建筑不支持该配方' };
    }

    if(rec.reqTech && (!techOwned || !techOwned[rec.reqTech])){
      return { done:false, why:'未研发前置科技' };
    }

    var costRes = rec.costRes || {};
    for(var k in costRes){
      var need = costRes[k] || 0;
      var have = checkCookRes(resStock, k);
      if(have < need){
        return { done:false, why:'材料不足' };
      }
    }

    var e = (eff == null ? 1 : eff);
    var sk = (chefSkill == null ? 0 : chefSkill);
    var rate = (dt || 1) * e * (1 + sk * 0.15);
    bldg.cookProgress = (bldg.cookProgress || 0) + rate;

    if(bldg.cookProgress >= (rec.cookTime || 10)){
      for(var mat in costRes){
        deductCookRes(resStock, mat, costRes[mat] || 0);
      }
      bldg.cookProgress = 0;
      finishBillUnit(bldg, 1);
      return { done:true, producedItemId:recipeKey, count:1 };
    }
    return { done:false, progress:bldg.cookProgress, total:rec.cookTime };
  }

  /* ---------- 异星奇幻植物定义表 (ADR-9 crop_ 前缀) ---------- */
  var ALIEN_CROPS = {
    crop_glow_shroom:  { name:'夜光荧蕈', growTicks:3, baseYield:4, dropItem:'it_glow_fluid', glowR:60, desc:'夜间自发光青蓝微光' },
    crop_crystal_vine: { name:'晶脉拟态藤', growTicks:5, baseYield:5, dropItem:'it_crystal_berry', extraItem:'it_crystal_ore', desc:'产出晶核果与微量晶体' },
    crop_dew_fruit:    { name:'露珠膨果', growTicks:4, baseYield:6, dropItem:'it_dew_fruit', moodBoost:6, desc:'食用提供+6清甜心情' },
    crop_star_velvet:  { name:'星绒草', growTicks:5, baseYield:4, dropItem:'it_star_fiber', desc:'外星防酸抗温纤维' },
  };

  /* ---------- 派生夜间生物发光源(夜光荧蕈自发光 + 篝火温暖光晕) ---------- */
  function getGlowSources(buildings){
    var lights = [];
    (buildings||[]).forEach(function(b){
      if(!b) return;
      if(b.id==='bl_campfire' || b.bid==='bl_campfire'){
        lights.push({
          x: b.x, y: b.y, r: 100,
          col: 'rgba(255,170,60,0.5)'
        });
        return;
      }
      if(b.id==='bl_crop_plot' || b.id==='bl_farm'){
        var cropId = b.crop || 'crop_glow_shroom';
        var def = ALIEN_CROPS[cropId];
        if(def && def.glowR && b.plot && (b.plot.stage||0) >= 2){
          lights.push({
            x: b.x, y: b.y, r: def.glowR || 60,
            col: 'rgba(89,217,255,0.45)'
          });
        }
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
    if(!isFinite(eff) || eff <= 0) eff = 1;
    var sk = (resident && resident.skills) ? ((target.kind==='tree'||target.kind.startsWith('bush')) ? (resident.skills.sk_farm||0) : (resident.skills.sk_craft||0)) : 0;
    var rate = dt * eff * (1 + sk*0.15);
    if(!isFinite(rate) || rate < 0) rate = 0;
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

  /* ---------- ADR-28: 自然资源定时再生纯函数 ---------- */
  function floraRespawnTick(s){
    var queue = (s && s.floraRespawn) || (s.floraRespawn = []);
    var G = (CFG.gathering) || {};
    var regenCfg = G.regenTicks || { tree:8, rock_iron:12, rock_stone:10, bush_berry:6, bush_herb:6 };
    var zoneR = G.regenZoneR != null ? G.regenZoneR : 200;
    var spawned = [];

    for(var i = queue.length - 1; i >= 0; i--){
      queue[i].ticksLeft--;
      if(queue[i].ticksLeft <= 0){
        var rng = U.makeRng(((s.seed || 7) * 31 + i * 917 + Math.floor((s.clock || 0))) >>> 0);
        var nx = queue[i].x + Math.floor((rng() - 0.5) * zoneR * 2);
        var ny = queue[i].y + Math.floor((rng() - 0.5) * zoneR * 2);
        nx = U.clamp(nx, 100, CFG.WORLD - 100);
        ny = U.clamp(ny, 100, CFG.WORLD - 100);
        var kind = queue[i].kind;
        var hp = kind === 'tree' ? 30 : (kind === 'rock_iron' ? 40 : (kind === 'rock_stone' ? 35 : (kind === 'bush_berry' ? 15 : 20)));
        spawned.push({
          id: 'flora_regen_' + i + '_' + Math.floor(rng() * 9999),
          type: 'flora', kind: kind,
          x: nx, y: ny,
          hp: hp, maxHp: hp
        });
        queue.splice(i, 1);
      }
    }
    return spawned;
  }

  /* ================= 建造推进高阶接缝 (ADR-21) ================= */
  function tickConstruction(s, dt){
    if(!s || !s.colony || !s.colony.buildQueue || !s.colony.buildQueue.length) return;
    var bb = builderBonusOf((s.meta && s.meta.residents) || []);
    var near = [{ x: s.px, y: s.py }];
    var builders = {};
    var wpB = (s.meta && s.meta.workPrio) || {};
    var residents = (s.meta && s.meta.residents) || [];

    residents.forEach(function(r){
      if(!isBuilder(r)) return;
      if(r.job && r.job !== 'blueprint') return;
      if(window.APH.Res && APH.Res.isBroken && APH.Res.isBroken(r)) return;
      if(wpB[r.id] && wpB[r.id].sk_build === 0) return;
      builders[r.id] = true;
    });

    (s.entities || []).forEach(function(en){
      if(!en || en.dead) return;
      if(en.type === T.RESIDENT && builders[en.rid || en.id]) near.push({ x: en.x, y: en.y });
      else if(en.userOrder && en.userOrder.type==='build') near.push({ x: en.x, y: en.y });
    });

    var qr = queueTick(s.colony.buildQueue, dt, near, bb);
    s.colony.buildQueue = qr.queue;

    /* 施工粒子: 正在施工的蓝图冒尘 */
    if(s.parts){
      s.colony.buildQueue.forEach(function(q){
        if(q.building && Math.random() < dt * 6){
          s.parts.push({ t: 'dust', x: q.x + U.rr(-20, 20), y: q.y + U.rr(-10, 10), life: .5, max: .5 });
        }
      });
    }

    /* 同步蓝图实体进度 */
    s.colony.buildQueue.forEach(function(q){
      (s.entities || []).forEach(function(en){
        if(en.type === T.BLUEPRINT && en.bid === q.bid &&
           Math.abs(en.x - q.x) < 2 && Math.abs(en.y - q.y) < 2){
          en.progress = q.progress || 0;
          en.building = q.building;
        }
      });
    });

    qr.done.forEach(function(d){
      var b = { id: d.bid, x: d.x, y: d.y, lv: 1 };
      if(d.bid==='bl_kitchen'||d.bid==='bl_workshop'||d.bid==='bl_campfire') b.bills=[];
      if(d.bid === 'bl_wall' && CFG.wall && CFG.wall.hp != null) b.hp = CFG.wall.hp;
      s.colony.buildings.push(b);

      /* 移除对应蓝图实体 */
      (s.entities || []).forEach(function(en){
        if(en.type === T.BLUEPRINT && en.bid === d.bid &&
           Math.abs(en.x - d.x) < 2 && Math.abs(en.y - d.y) < 2){
          if(window.APH.Ent && APH.Ent.destroy) APH.Ent.destroy(en);
          else en.dead = true;
        }
      });
      if(window.APH.Ent && APH.Ent.sweepDead) s.entities = APH.Ent.sweepDead(s.entities);

      var isGridStatic = (d.bid === 'bl_wall' || d.bid === 'bl_gate' || d.bid === 'bl_spike_trap' || d.bid === 'bl_sandbag');
      if(!isGridStatic){
        placeBuildingEntity(d.bid, d.x, d.y, 1, s);
        var justBuilt = s.entities[s.entities.length - 1];
        if(justBuilt && justBuilt.type === T.BUILDING) justBuilt.builtT = 0;
      } else {
        var wR = (CFG.wall || {}).collideR != null ? CFG.wall.collideR : 35;
        if(d.bid === 'bl_wall' && Math.abs(s.px - d.x) < wR && Math.abs(s.py - d.y) < wR){
          var dxW = s.px - d.x, dyW = s.py - d.y;
          if(Math.abs(dxW) > Math.abs(dyW)) s.px = d.x + (dxW > 0 ? wR : -wR);
          else s.py = d.y + (dyW > 0 ? wR : -wR);
          s.px = U.clamp(s.px, 40, CFG.WORLD - 40);
          s.py = U.clamp(s.py, 40, CFG.WORLD - 40);
        }
      }

      if(window.APH.Main && APH.Main.saveColony) APH.Main.saveColony();
      if(d.bid === 'bl_house' && window.APH.Opening && APH.Opening.noteHouse){
        var fOpening = (window.APH.Main && APH.Main.firstNightOpening) ? APH.Main.firstNightOpening() : null;
        if(fOpening){
          APH.Opening.noteHouse(fOpening, s.clock || 0);
          if(window.APH.Main && APH.Main.applyFirstNightHint) APH.Main.applyFirstNightHint();
        }
        try{ if(window.APH.Save && APH.Save.saveMeta) APH.Save.saveMeta(s.meta); }catch(eH){}
      }
      if(U.emit) U.emit('built', { id: d.bid });
      var bdef = get(d.bid);
      if(window.APH.UI && APH.UI.floatText) APH.UI.floatText('✔ ' + (bdef ? bdef.name : d.bid) + ' 建造完成', '#9fe8c8');
      if(s.parts) s.parts.push({ t: 'ping', x: d.x, y: d.y, life: .9, max: .9 });
    });
  }

  /* ================= 生产结算高阶接缝 (ADR-21) ================= */
  function tickProduction(s, dt){
    if(!s) return;
    s.prodT = (s.prodT || 0) + dt;
    if(s.prodT < 30) return;

    s.prodT -= 30;
    (s.colony && s.colony.buildings || []).forEach(function(b){
      if(b.offlineT > 0) b.offlineT = Math.max(0, b.offlineT - 30);
    });

    var isDay = (window.APH.World && APH.World.daylight) ? APH.World.daylight() >= .5 : true;
    var powRes = powerSettle(s.colony && s.colony.buildings || [], s.meta && s.meta.res, s.power || (s.power = {}), 30, {
      solarMul: powerSolarMulOf(s.meta),
      isDay: isDay
    });
    var powState = applyPowerState(s.colony && s.colony.buildings || [], powRes.status);
    (s.colony && s.colony.buildings || []).forEach(function(b){
      var pk = Math.round(b.x || 0) + ',' + Math.round(b.y || 0);
      var ps = powState[pk];
      if(ps){ b.powered = ps.powered; b.grid = ps.grid; }
      else if(isPowerConsumer(b.id)){ b.powered = true; b.grid = false; }
    });
    s.powerStatus = powRes;

    var nightP = !isDay;
    var hmods = harvestMods(s.spec && s.spec.laws, s.clock, nightP);
    var prodWorkers = ((s.meta && s.meta.residents) || []).filter(function(r){
      return !(window.APH.Res && APH.Res.isBroken && APH.Res.isBroken(r));
    });
    var out = productionTick(s.meta, s.colony && s.colony.buildings || [], prodWorkers, hmods);
    (out.piles || []).forEach(function(p){
      if(window.APH.Combat && APH.Combat.spawnDrop){
        APH.Combat.spawnDrop(p.x + 16, p.y + 14, p.itemId, p.n, { stock: true });
      }
    });

    if(out.mineral || out.research){
      if(window.APH.UI && APH.UI.floatText){
        APH.UI.floatText('生产: ' + (out.mineral ? '矿材×' + out.mineral + '堆在地上 ' : '') + (out.research ? '+' + out.research + ' 研究点' : ''), '#9fe8c8');
      }
    }

    /* ADR-25: 推进封闭房间室内气温与温控电器结算 */
    var wxId = (window.APH.Weather && APH.Weather.currentId) ? APH.Weather.currentId(s.meta) : 'wx_clear';
    var ambT = (window.APH.Weather && APH.Weather.ambientTemperatureOf) ? APH.Weather.ambientTemperatureOf(wxId, isDay) : 22;
    var allBlds = s.colony && s.colony.buildings || [];
    var rooms = (window.APH.Nav && APH.Nav.roomsOf) ? APH.Nav.roomsOf(allBlds) : [];
    rooms.forEach(function(rm){
      var appliances = allBlds.filter(function(b){
        return b && (b.id === 'bl_heater' || b.id === 'bl_cooler') &&
               b.x >= rm.minX * 48 && b.x <= rm.maxX * 48 &&
               b.y >= rm.minY * 48 && b.y <= rm.maxY * 48;
      });
      roomTemperatureTick(rm, ambT, 30, appliances);
    });

    /* ADR-23/25 掉落物露天天气劣化与冷库保鲜判定 */
    var shelters = allBlds.filter(function(b){
      return b && (b.id === 'bl_storage_shelf' || b.id === 'bl_warehouse');
    });
    (s.entities || []).forEach(function(e){
      if(!e || e.dead || e.type !== T.DROPPED) return;
      var isSheltered = false;
      var curRoom = (window.APH.Nav && APH.Nav.roomAt) ? APH.Nav.roomAt({x:e.x, y:e.y}, rooms) : null;
      if(curRoom){
        isSheltered = true;
      } else {
        for(var si = 0; si < shelters.length; si++){
          if(U.dst(e.x, e.y, shelters[si].x, shelters[si].y) <= 32){
            isSheltered = true; break;
          }
        }
      }
      var rTemp = curRoom ? curRoom.temp : null;
      var dRes = deteriorationTick(e, wxId, isSheltered, 30, rTemp);
      if(dRes.decayed){
        if(window.APH.Ent && APH.Ent.destroy) APH.Ent.destroy(e);
        else e.dead = true;
        if(s.parts){
          for(var pi=0; pi<6; pi++){
            s.parts.push({ t:'crumb', x:e.x, y:e.y, vx:U.rr(-20,20), vy:U.rr(-30,-10), life:0.6, max:0.6 });
          }
        }
        var itDef = (CFG.items && CFG.items[e.itemId]) || {};
        if(window.APH.UI && APH.UI.floatText){
          APH.UI.floatText('⚠️ ' + (itDef.name || '物资') + ' 在室外腐烂损毁了', '#ff6d7a');
        }
      }
    });

    /* ADR-28: 推进自然资源再生队列 */
    var regenCfg = (CFG.gathering && CFG.gathering.regenTicks) || { tree:8, rock_iron:12, rock_stone:10, bush_berry:6, bush_herb:6 };
    var newFlora = floraRespawnTick(s);
    newFlora.forEach(function(f){
      if(s.entities) s.entities.push(f);
    });

    /* ADR-28: 将刚死亡的自然实体加入再生队列 */
    (s.entities || []).forEach(function(en){
      if(!en || en.type !== T.FLORA || !en.dead || en._queued) return;
      en._queued = true;
      var ticks = regenCfg[en.kind] || 8;
      if(!s.floraRespawn) s.floraRespawn = [];
      s.floraRespawn.push({ kind: en.kind, x: en.x, y: en.y, ticksLeft: ticks });
    });

    if(window.APH.Main && APH.Main.tickRivals) APH.Main.tickRivals(30 / 60);
    if(window.APH.Main && APH.Main.storyTick) APH.Main.storyTick(30 / 60);
    if(window.APH.Main && APH.Main.residentsTick) APH.Main.residentsTick();
  }

  /* ---------- ADR-28 / Ticket #157: 规划划区与框选判定纯函数 ---------- */
  function boxSelectEntities(entities, x0, y0, x1, y1){
    if(!entities || !Array.isArray(entities)) return [];
    var minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
    var minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
    var res = [];
    for(var i = 0; i < entities.length; i++){
      var e = entities[i];
      if(!e || e.dead) continue;
      var ex = e.x, ey = e.y;
      if(ex >= minX && ex <= maxX && ey >= minY && ey <= maxY){
        res.push(e);
      }
    }
    return res;
  }

  function applyDesignation(designations, entity, tool){
    if(!designations || !entity) return false;
    var id = entity.id;
    if(!id) return false;
    var T = (window.APH && window.APH.CFG && window.APH.CFG.entType) || {};
    var fType = T.FLORA || 'flora';
    var dType = T.DROPPED || 'dropped';
    var bType = T.BUILDING || 'building';

    if(tool === 'cancel'){
      if(designations[id]){
        delete designations[id];
        return true;
      }
      return false;
    }

    if(tool === 'chop'){
      if(entity.type === fType && (entity.kind === 'tree' || (entity.kind && entity.kind.startsWith('bush')))){
        designations[id] = { type: 'chop', entityId: id };
        return true;
      }
      return false;
    }

    if(tool === 'mine'){
      if(entity.type === fType && entity.kind && entity.kind.startsWith('rock')){
        designations[id] = { type: 'mine', entityId: id };
        return true;
      }
      return false;
    }

    if(tool === 'haul'){
      if(entity.type === dType){
        designations[id] = { type: 'haul', entityId: id };
        return true;
      }
      return false;
    }

    if(tool === 'deconstruct'){
      if(entity.type === bType && entity.bid !== 'bl_landing_pad' && !entity.pad){
        designations[id] = { type: 'deconstruct', entityId: id };
        return true;
      }
      return false;
    }

    return false;
  }

  return {
    list:list, get:get,
    TECHS:TECHS, TECH_COLUMNS:TECH_COLUMNS, canBuy:canBuy, buyTech:buyTech,
    techDepth:techDepth, techNodeStatus:techNodeStatus,
    grantAssayKeyedTechs:grantAssayKeyedTechs, plasmaTechLevel:plasmaTechLevel,
    farmTick:farmTick, harvestYield:harvestYield, jobOutput:jobOutput,
    ranchTick:ranchTick, climateLaws:climateLaws, harvestMods:harvestMods,
    workshopTick:workshopTick,
    buildColonyWorld:buildColonyWorld,
    canPlace:canPlace, footprintOf:footprintOf, productionTick:productionTick,
    /* T2 墙/闸门格网(ADR-13) */
    wallCells:wallCells, wallLine:wallLine, wallNeighbors:wallNeighbors,
    placementGhost:placementGhost,
    /* T6 电网核心 (#79) */
    powerNets:powerNets, powerSettle:powerSettle,
    powerSolarOutput:powerSolarOutput, powerWoodOutput:powerWoodOutput,
    powerSolarMulOf:powerSolarMulOf,
    /* T7 耗电联动 */
    applyPowerState:applyPowerState, farmPowerMul:farmPowerMul,
    turretFireAllowed:turretFireAllowed, clinicPowered:clinicPowered,
    isPowerConsumer:isPowerConsumer, trapTriggers:trapTriggers, trapStrike:trapStrike,
    sandbagMul:sandbagMul, bleedMul:bleedMul,
    placeBuildingEntity:placeBuildingEntity,
    queueTick:queueTick,
    housingCapacity:housingCapacity, refundOf:refundOf, refundMineralOf:refundMineralOf, refundResOf:refundResOf,
    carryBonus:carryBonus, carryMaxOf:carryMaxOf,
    builderBonusOf:builderBonusOf, isBuilder:isBuilder,
    assignByPriority:assignByPriority, JOB_SKILL:JOB_SKILL, JOB_SLOTS:JOB_SLOTS,
    upgradeCost:upgradeCost, canUpgrade:canUpgrade,
    mineOutput:mineOutput, labOutput:labOutput,
    shortageBrief:shortageBrief, cycleJob:cycleJob, JOB_CYCLE:JOB_CYCLE,
    stockItem:stockItem, collectHome:collectHome, stockpileSpot:stockpileSpot,
    storageFilterMatches:storageFilterMatches, cycleStorageFilter:cycleStorageFilter,
    deteriorationTick:deteriorationTick,
    bulkHaulCandidates:bulkHaulCandidates, findBestStorageSpot:findBestStorageSpot,
    addFilth:addFilth, filthAt:filthAt, cleanCells:cleanCells,
    decayBuilding:decayBuilding, repairBuilding:repairBuilding, ensureBuildingHp:ensureBuildingHp,
    addFire:addFire, douseFires:douseFires,
    addRestrictZone:addRestrictZone, pointAllowed:pointAllowed,
    cellsFromBox:cellsFromBox, addStockpileZone:addStockpileZone, addGrowZone:addGrowZone,
    tickGrowZones:tickGrowZones, cycleGrowCrop:cycleGrowCrop,
    zoneAllowsItem:zoneAllowsItem, eraseZoneCells:eraseZoneCells,
    findNearbySourcedItem:findNearbySourcedItem,
    roomTemperatureTick:roomTemperatureTick, cropThermalGrowthMul:cropThermalGrowthMul,
    floraRespawnTick:floraRespawnTick,
    boxSelectEntities:boxSelectEntities, applyDesignation:applyDesignation,
    serializeGround:serializeGround,
    groundCount:groundCount, groundTally:groundTally, stockOf:stockOf,
    itemCount:itemCount, takeDropped:takeDropped,
    stockLabel:stockLabel, takeFromGround:takeFromGround,
    takeStock:takeStock, ensureStock:ensureStock,
    ensurePad:ensurePad, generateFlora:generateFlora, workOnFlora:workOnFlora,
    soilFertilityAt:soilFertilityAt, createGrowingZone:createGrowingZone, removeGrowingZone:removeGrowingZone,
    ALIEN_CROPS:ALIEN_CROPS, getGlowSources:getGlowSources,
    cropPlotTick:cropPlotTick, harvestAlienCrop:harvestAlienCrop,
    CRAFT_RECIPES:CRAFT_RECIPES, workshopCraftTick:workshopCraftTick,
    SPECIMEN_ANALYSIS:SPECIMEN_ANALYSIS, labAnalysisTick:labAnalysisTick,
    applySpecimenAnalysis:applySpecimenAnalysis, canPlantCrop:canPlantCrop,
    cycleAnalyzedCrop:cycleAnalyzedCrop, cycleAnalysisTarget:cycleAnalysisTarget,
    specimenCodexEntries:specimenCodexEntries,
    COOK_RECIPES:COOK_RECIPES, cookingTick:cookingTick,
    addBill:addBill, activeBill:activeBill,
    equipGear:equipGear, gearBonusOf:gearBonusOf,
    tickConstruction:tickConstruction, tickProduction:tickProduction,
  };
})();
