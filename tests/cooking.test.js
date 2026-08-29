/* tests/cooking.test.js — 外星烹饪与餐饮闭环系统测试 (Cooking #49)
   纯注册式测试文件，由 run.js 自动加载。 */
'use strict';

test('cooked_items: 5 大外星熟食菜肴定义齐全且数值完整', function(){
  var items = APH.CFG.items;
  var dishes = ['it_roasted_meat', 'it_berry_stew', 'it_dew_pudding', 'it_glow_fondue', 'it_alien_feast'];
  dishes.forEach(function(id){
    var it = items[id];
    if (!it) throw new Error('缺失物品: ' + id);
    if (!it.isCooked) throw new Error(id + ' 必须标记 isCooked: true');
    if (it.store !== 'food') throw new Error(id + ' store 必须为 food');
    if (typeof it.foodGain !== 'number' || it.foodGain <= 0) throw new Error(id + ' 缺失 foodGain');
    if (typeof it.moodGain !== 'number' || it.moodGain < 0) throw new Error(id + ' 缺失 moodGain');
    if (typeof it.recGain !== 'number' || it.recGain < 0) throw new Error(id + ' 缺失 recGain');
  });
  if (items.it_roasted_meat.foodGain !== 40) throw new Error('炙烤异星肉排 foodGain 异常');
  if (items.it_alien_feast.foodGain !== 50 || items.it_alien_feast.moodGain !== 12) throw new Error('外星珍馐盛宴数值异常');
});

test('cook_recipes: 烹饪配方表与建筑/科技依赖合法', function(){
  var recipes = APH.Colony.COOK_RECIPES;
  if (!recipes) throw new Error('缺失 APH.Colony.COOK_RECIPES');
  for (var k in recipes){
    var r = recipes[k];
    if (!r.name || !r.costRes || !r.cookTime) {
      throw new Error('配方定义残缺: ' + k);
    }
    var bldgs = r.bldgs || r.bldg;
    if (!bldgs || !Array.isArray(bldgs) || bldgs.length === 0){
      throw new Error(k + ' 必须声明适用建筑列表 bldgs');
    }
  }
  if (!recipes.it_roasted_meat.bldgs.includes('bl_campfire')) {
    throw new Error('it_roasted_meat 应当支持 bl_campfire');
  }
  if (recipes.it_alien_feast.reqTech !== 'te_alien_culinary') {
    throw new Error('it_alien_feast 前置科技必须为 te_alien_culinary');
  }
});

test('cooking_pipeline: cookingTick 推进烹饪工时、扣除食材并产出熟食', function(){
  var kitchen = { id: 'bl_kitchen', recipe: 'it_roasted_meat', cookProgress: 0 };
  var stock = { food: 10, wood: 5 };
  var techOwned = { te_stonecutting: 1, te_alien_culinary: 1 };

  // 1. 推进工时 4s (总需 8s, 技能加速)
  var res1 = APH.Colony.cookingTick(kitchen, 4, 1.0, stock, techOwned, 2.5);
  if (res1.done) throw new Error('未达到所需工时前不应完成制作');
  if (kitchen.cookProgress <= 0) throw new Error('制作进度应当推进');

  // 2. 推进至 8s 完成制作
  var res2 = APH.Colony.cookingTick(kitchen, 4, 1.0, stock, techOwned, 10);
  if (!res2.done || res2.producedItemId !== 'it_roasted_meat') {
    throw new Error('制作应完成并产出 it_roasted_meat: ' + JSON.stringify(res2));
  }
  if (stock.food !== 8 || stock.wood !== 4) {
    throw new Error('食材库存应正确扣除(需 2 food + 1 wood)，实际: ' + JSON.stringify(stock));
  }
  if (kitchen.cookProgress !== 0) {
    throw new Error('完成制作后 cookProgress 应重置为 0');
  }
});

test('cooking_tech_and_material_gate: 前置科技未解锁或材料不足时拒绝烹饪', function(){
  var kitchen = { id: 'bl_kitchen', recipe: 'it_alien_feast', cookProgress: 0 };
  var stock = { food: 5, it_crystal_berry: 2, it_dew_fruit: 2, it_glow_fluid: 2 };

  // 1. 未研发科技
  var resNoTech = APH.Colony.cookingTick(kitchen, 5, 1.0, stock, {}, 5);
  if (resNoTech.done || resNoTech.why !== '未研发前置科技') {
    throw new Error('未研发 te_alien_culinary 时应当拒绝: ' + JSON.stringify(resNoTech));
  }

  // 2. 研发科技但材料不足
  var emptyStock = { food: 0 };
  var resNoMat = APH.Colony.cookingTick(kitchen, 5, 1.0, emptyStock, { te_alien_culinary: 1 }, 5);
  if (resNoMat.done || resNoMat.why !== '材料不足') {
    throw new Error('材料不足时应当拒绝: ' + JSON.stringify(resNoMat));
  }
});

test('eat_meal: 熟食分级享用与身心增益结算 (饱食/心情/娱乐/驱寒联动)', function(){
  var r = {
    id: 'rs_tasty',
    food: 40,
    mood: 60,
    recreation: 50,
    exposure: 30
  };

  // 1. 享用荧光温热浓汤
  var dish = APH.CFG.items.it_glow_fondue;
  var res = APH.Res.eatMeal(r, dish);

  if (!res.ate) throw new Error('饥饿居民应当正常进食');
  if (r.food !== 75) throw new Error('饱食度应提升 +35 (40->75)，实际: ' + r.food);
  if (r.mood !== 65) throw new Error('心情应提升 +5 (60->65)，实际: ' + r.mood);
  if (r.recreation !== 62) throw new Error('娱乐应提升 +12 (50->62)，实际: ' + r.recreation);
  if (r.exposure !== 10) throw new Error('严寒暴露应消退 20 (30->10)，实际: ' + r.exposure);

  // 2. 饱腹状态下不再重复进食
  var resFull = APH.Res.eatMeal(r, dish);
  if (resFull.ate) throw new Error('饱食度 >= 60 时不应重复进食');
});

test('campfire_aura: 篝火驱寒、娱乐恢复与围炉夜话社交羁绊', function(){
  var r1 = { id: 'rs_1', x: 100, y: 100, mood: 70, recreation: 40, exposure: 50 };
  var r2 = { id: 'rs_2', x: 120, y: 110, mood: 72, recreation: 45, exposure: 40 };
  var rFar = { id: 'rs_far', x: 500, y: 500, mood: 70, recreation: 40, exposure: 50 };
  var fire = { x: 110, y: 105 };
  var meta = { bonds: {} };

  var result = APH.Res.campfireAuraTick([r1, r2, rFar], [fire], { meta: meta });

  // 1. 篝火范围内居民驱寒与娱乐恢复
  if (r1.exposure >= 50) throw new Error('r1 暴露值应消退');
  if (r1.recreation <= 40) throw new Error('r1 娱乐值应恢复');
  if (rFar.exposure !== 50) throw new Error('远距居民不应受篝火影响');

  // 2. 围炉夜话: 2人同聚提升羁绊与心情
  if (result.gatheredCount < 1) throw new Error('应触发围炉夜话');
  if (r1.mood <= 70 || r2.mood <= 72) throw new Error('围炉应提升心情');
  var bondKey = 'rs_1|rs_2';
  if (!meta.bonds[bondKey] || meta.bonds[bondKey] !== 53) {
    throw new Error('围炉居民间应当建立好感羁绊(50+3=53)，实际: ' + JSON.stringify(meta.bonds));
  }
});

test('hospitality: 熟食款待过客获得大额好感 (+35)', function(){
  var visitor = { id: 'vis_1', name: '游历学者', fed: false, impression: 50 };
  var meta = { res: { food: 5 } };

  // 1. 基础口粮请客
  var resBasic = APH.Res.offerMeal(meta, visitor, 2, false);
  if (!resBasic.ok || resBasic.impression !== 70) {
    throw new Error('普通请客应 +20 好感(50->70)，实际: ' + resBasic.impression);
  }

  // 2. 熟食请客
  var visitor2 = { id: 'vis_2', name: '星际过客', fed: false, impression: 50 };
  var resCooked = APH.Res.offerMeal(meta, visitor2, 1, true);
  if (!resCooked.ok || resCooked.impression !== 85) {
    throw new Error('精制熟食请客应 +35 好感(50->85)，实际: ' + resCooked.impression);
  }
});

test('tech_and_buildings: 烹饪科技树与设施蓝图契约完整', function(){
  // 1. 科技定义
  var tech = APH.Colony.TECHS.te_alien_culinary;
  if (!tech || tech.cost !== 70 || !tech.requires.includes('te_basic_farming')) {
    throw new Error('te_alien_culinary 科技配置不符合契约');
  }

  // 2. 建筑定义
  var bCamp = APH.Colony.get('bl_campfire');
  var bKit = APH.Colony.get('bl_kitchen');
  if (!bCamp || bCamp.reqTech !== 'te_stonecutting') throw new Error('bl_campfire 配置异常');
  if (!bKit || bKit.reqTech !== 'te_alien_culinary') throw new Error('bl_kitchen 配置异常');

  // 3. 建造权限校验
  var canPlaceWithoutTech = APH.Colony.canPlace([], {}, 'bl_kitchen', 1200, 1200, { wood: 50, stone: 50, iron: 50 });
  if (canPlaceWithoutTech.ok) throw new Error('未研发 te_alien_culinary 时应拒绝建造 bl_kitchen');

  var canPlaceWithTech = APH.Colony.canPlace([], { te_alien_culinary: 1 }, 'bl_kitchen', 1200, 1200, { wood: 50, stone: 50, iron: 50 });
  if (!canPlaceWithTech.ok) throw new Error('研发科技并满足建材后应允许建造 bl_kitchen: ' + canPlaceWithTech.why);

  // 4. 光源校验
  var glowList = APH.Colony.getGlowSources([{ id: 'bl_campfire', x: 200, y: 200 }]);
  if (glowList.length === 0 || glowList[0].r !== 100) {
    throw new Error('bl_campfire 应当作为动态发光源被 getGlowSources 派生');
  }
});
