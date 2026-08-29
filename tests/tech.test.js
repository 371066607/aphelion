/* tests/tech.test.js — 阶梯式科技树与前置依赖测试
   纯注册式测试文件，由 run.js 自动加载。 */
'use strict';

test('tech: 基础科技无前置条件，可直接研发', function(){
  var meta = { research: 100 };
  var owned = {};
  var chkFarm = APH.Colony.canBuy(meta, 'te_basic_farming', owned);
  var chkStone = APH.Colony.canBuy(meta, 'te_stonecutting', owned);
  var chkHerb = APH.Colony.canBuy(meta, 'te_herbal_remedies', owned);
  var chkBal = APH.Colony.canBuy(meta, 'te_ballistics', owned);

  if (!chkFarm.ok) throw new Error('te_basic_farming 应当可研发: ' + chkFarm.why);
  if (!chkStone.ok) throw new Error('te_stonecutting 应当可研发: ' + chkStone.why);
  if (!chkHerb.ok) throw new Error('te_herbal_remedies 应当可研发: ' + chkHerb.why);
  if (!chkBal.ok) throw new Error('te_ballistics 应当可研发: ' + chkBal.why);
});

test('tech: 高级科技受前置条件约束，未满足前置时拒绝研发', function(){
  var meta = { research: 500 };
  var owned = {}; // 未研发任何前置科技

  // te_hydroponics 需要 te_basic_farming
  var chkHydro = APH.Colony.canBuy(meta, 'te_hydroponics', owned);
  if (chkHydro.ok) throw new Error('未研发 te_basic_farming 时应拒绝 te_hydroponics');
  if (!chkHydro.why.includes('基础外星农耕')) throw new Error('错误原因应提示缺少前置科技: ' + chkHydro.why);

  // te_turret_tech 需要 te_ballistics
  var chkTurret = APH.Colony.canBuy(meta, 'te_turret_tech', owned);
  if (chkTurret.ok) throw new Error('未研发 te_ballistics 时应拒绝 te_turret_tech');

  // te_medicine 需要 te_herbal_remedies
  var chkMed = APH.Colony.canBuy(meta, 'te_medicine', owned);
  if (chkMed.ok) throw new Error('未研发 te_herbal_remedies 时应拒绝 te_medicine');
});

test('tech: 研发前置科技后成功解锁下游科技', function(){
  var meta = { research: 500 };
  var owned = { te_basic_farming: 1, te_ballistics: 1, te_herbal_remedies: 1 };

  var chkHydro = APH.Colony.canBuy(meta, 'te_hydroponics', owned);
  var chkTurret = APH.Colony.canBuy(meta, 'te_turret_tech', owned);
  var chkMed = APH.Colony.canBuy(meta, 'te_medicine', owned);

  if (!chkHydro.ok) throw new Error('已满足前置时应允许 te_hydroponics: ' + chkHydro.why);
  if (!chkTurret.ok) throw new Error('已满足前置时应允许 te_turret_tech: ' + chkTurret.why);
  if (!chkMed.ok) throw new Error('已满足前置时应允许 te_medicine: ' + chkMed.why);
});

test('buildings: 建造完全不扣除研究点，仅扣除物理建材', function(){
  var buildings = [];
  var techOwned = { te_hydroponics: 1 };
  var stock = { wood: 50, iron: 50, stone: 50 };

  // 即使研究点为 0，只要建材充足且科技已解锁即可放置
  var resZeroResearch = 0;
  var chkHouse = APH.Colony.canPlace(buildings, techOwned, 'bl_house', 1000, 1000, stock);
  var chkFarm = APH.Colony.canPlace(buildings, techOwned, 'bl_farm', 1000, 1200, stock);

  if (!chkHouse.ok) throw new Error('基础建筑 0 研究点应可放置: ' + chkHouse.why);
  if (!chkFarm.ok) throw new Error('已解锁高级建筑 0 研究点应可放置: ' + chkFarm.why);
});

test('buildings: 未研发科技时禁止放置高级建筑蓝图', function(){
  var buildings = [];
  var techOwned = {}; // 未研发科技
  var stock = { wood: 100, iron: 100, stone: 100 };

  var chkTurret = APH.Colony.canPlace(buildings, techOwned, 'bl_turret', 1000, 1000, stock);
  if (chkTurret.ok) throw new Error('未解锁防御科技时应拒绝放置炮塔');
  if (!chkTurret.why.includes('科技')) throw new Error('应提示需要研发科技');

  var chkClinic = APH.Colony.canPlace(buildings, techOwned, 'bl_clinic', 1000, 1000, stock);
  if (chkClinic.ok) throw new Error('未解锁医学科技时应拒绝放置医疗舱');
});

test('tech: 缺前置时优先提示需先研发，不报研究点不足', function(){
  var meta = { research: 0 };
  var owned = {};
  var chk = APH.Colony.canBuy(meta, 'te_hydroponics', owned);
  if (chk.ok) throw new Error('无前置不应可买');
  if (!chk.why || chk.why.indexOf('需先研发') < 0) throw new Error('应先报缺前置, 实际: ' + chk.why);
  if (chk.why.indexOf('研究点') >= 0) throw new Error('前置未满足时不应报研究点: ' + chk.why);
  var st = APH.Colony.techNodeStatus(meta, 'te_hydroponics', owned);
  if (st.state !== 'locked') throw new Error('卡片状态应为 locked, 实际: ' + st.state);
});

test('tech: 化验钥匙节点不能花研究点买', function(){
  var meta = { research: 500 };
  var owned = { te_basic_farming: 1, te_hydroponics: 1 };
  var chk = APH.Colony.canBuy(meta, 'te_bio_adaptation', owned);
  if (chk.ok) throw new Error('外星生态适应不应用研究点购买');
  if (!chk.why || chk.why.indexOf('化验') < 0) throw new Error('应提示需化验: ' + chk.why);
});

test('tech: 先化验硅壳后研发水培则补发化验钥匙', function(){
  var meta = { research: 200, tech: { te_basic_farming: 1 }, analyzedSpecimens: { specimen_chitin: true } };
  var r = APH.Colony.buyTech(meta, 'te_hydroponics', meta.tech);
  if (!r.ok) throw new Error('水培应可买: ' + r.why);
  if (!r.owned.te_hydroponics) throw new Error('应记下温控水培');
  if (!r.owned.te_bio_adaptation) throw new Error('水培入账后应补发外星生态适应');
  if ((r.granted || []).indexOf('te_bio_adaptation') < 0) throw new Error('granted 应含 te_bio_adaptation');
});

test('tech: 全屏图四列不含旧档别名 te_weaponry', function(){
  var cols = APH.Colony.TECH_COLUMNS;
  if (!cols || cols.length !== 4) throw new Error('应为四列, 实际: ' + (cols && cols.length));
  var names = cols.map(function(c){ return c.name; }).join(',');
  if (names !== '农业,工业,医学,安防') throw new Error('列名应为 农业|工业|医学|安防, 实际: ' + names);
  var seen = {};
  cols.forEach(function(c){
    c.ids.forEach(function(id){
      if (seen[id]) throw new Error('重复节点: ' + id);
      seen[id] = 1;
      if (id === 'te_weaponry') throw new Error('te_weaponry 不应出现在科技图');
      if (!APH.Colony.TECHS[id]) throw new Error('列引用未知科技: ' + id);
    });
  });
  if (!seen.te_o2tank) throw new Error('氧气罐应挂在安防列');
  if (!seen.te_exosuit) throw new Error('外骨骼应挂在工业列');
  if (!seen.te_radar) throw new Error('雷达应挂在安防列');
  if (!seen.te_bio_adaptation) throw new Error('化验钥匙叶子应画在树上');
});

test('tech: 等离子等级取 ballistics 与旧档 weaponry 的较大值', function(){
  if (APH.Colony.plasmaTechLevel({ te_ballistics: 1 }) !== 1) throw new Error('仅弹道应为 1');
  if (APH.Colony.plasmaTechLevel({ te_weaponry: 3 }) !== 3) throw new Error('旧档 3 级应保留');
  if (APH.Colony.plasmaTechLevel({ te_ballistics: 1, te_weaponry: 3 }) !== 3) throw new Error('应取较大值');
});

test('buildings: 物理建材不足时拒绝放置', function(){
  var buildings = [];
  var techOwned = {};
  var stock = { wood: 5, iron: 0, stone: 0 }; // 木材不足

  var chkHouse = APH.Colony.canPlace(buildings, techOwned, 'bl_house', 1000, 1000, stock);
  if (chkHouse.ok) throw new Error('木材不足时应拒绝放置居住舱');
  if (!chkHouse.why.includes('不足')) throw new Error('应提示建材不足');
});
