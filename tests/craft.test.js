/* tests/craft.test.js — 工坊深度加工与外星装备系统测试 (Tickets #46~#49)
   纯注册式测试文件，由 run.js 自动加载。 */
'use strict';

test('gear_items: 5 大外星特种装备定义齐全', function(){
  var items = APH.CFG.items;
  if (!items.it_pickaxe || items.it_pickaxe.slot !== 'tool') throw new Error('缺失 it_pickaxe (工具槽)');
  if (!items.it_suit_hazard || items.it_suit_hazard.acidResist !== 0.80) throw new Error('缺失 it_suit_hazard (防酸服)');
  if (!items.it_suit_cryo || items.it_suit_cryo.cryoResist !== 0.80) throw new Error('缺失 it_suit_cryo (防寒服)');
  if (!items.it_goggles_night || items.it_goggles_night.sightBoost !== 80) throw new Error('缺失 it_goggles_night (夜视镜)');
  if (!items.it_medkit_adv) throw new Error('缺失 it_medkit_adv (复合急救包)');
});

test('craft_recipes: 工坊配方表与前置科技契约合法', function(){
  var recipes = APH.Colony.CRAFT_RECIPES;
  if (!recipes) throw new Error('缺失 APH.Colony.CRAFT_RECIPES');
  for (var k in recipes){
    var r = recipes[k];
    if (!r.name || !r.costRes || !r.craftTime) {
      throw new Error('配方定义残缺: ' + k);
    }
  }
  if (!recipes.it_pickaxe || !recipes.it_pickaxe.reqTech) {
    throw new Error('it_pickaxe 应当有前置科技');
  }
});

test('craft_pipeline: workshopCraftTick 消耗建材推进工序并产出特种装备', function(){
  var workshop = { id: 'bl_workshop', recipe: 'it_pickaxe', craftProgress: 0 };
  var stock = { wood: 30, iron: 20 };
  var techOwned = { te_machining: 1 };

  // 1. 推进工时 6s (总需 12s)
  var res1 = APH.Colony.workshopCraftTick(workshop, 6, 1.0, stock, techOwned, 6);
  if (res1.done) throw new Error('6s 工时未完成制作');
  if (workshop.craftProgress < 5) throw new Error('进度应推进');

  // 2. 推进至 12s 完成制作
  var res2 = APH.Colony.workshopCraftTick(workshop, 6, 1.0, stock, techOwned, 10);
  if (!res2.done || res2.producedItemId !== 'it_pickaxe') {
    throw new Error('制作应完成并产出 it_pickaxe: ' + JSON.stringify(res2));
  }
  if (stock.wood !== 15 || stock.iron !== 10) {
    throw new Error('材料应被扣除，实际: ' + JSON.stringify(stock));
  }
});

test('gear_equip: 装备穿戴与被动抗性计算', function(){
  var colonist = { id: 'rs_1', gear: { tool: null, suit: null, head: null } };

  // 1. 穿戴防酸服与采矿斧
  APH.Colony.equipGear(colonist, 'it_suit_hazard');
  APH.Colony.equipGear(colonist, 'it_pickaxe');

  if (colonist.gear.suit !== 'it_suit_hazard') throw new Error('防酸服穿戴失败');
  if (colonist.gear.tool !== 'it_pickaxe') throw new Error('采矿斧穿戴失败');

  // 2. 派生被动抗性与加成
  var bonus = APH.Colony.gearBonusOf(colonist);
  if (bonus.acidResist !== 0.80) throw new Error('防酸抗性应为 80% (0.80)，实际: ' + bonus.acidResist);
  if (bonus.toolMul !== 2.0) throw new Error('采矿斧效率应翻倍 (2.0)，实际: ' + bonus.toolMul);
});

test('craft_integration: 工坊全链路生产与装备生效闭环', function(){
  var workshop = { id: 'bl_workshop', recipe: 'it_suit_cryo', craftProgress: 0 };
  var stock = { it_star_fiber: 10, leather: 6 };
  var techOwned = { te_bio_adaptation: 1 };
  var crafter = { id: 'rs_smith', skills: { sk_craft: 8 }, mood: 80, food: 80 };

  // 1. 制作防寒服
  var res = APH.Colony.workshopCraftTick(workshop, 8, 1.2, stock, techOwned, 15);
  if (!res.done || res.producedItemId !== 'it_suit_cryo') throw new Error('制作应完成');

  // 2. 殖民者穿戴
  var colonist = { id: 'rs_explorer', gear: { tool: null, suit: null, head: null } };
  APH.Colony.equipGear(colonist, res.producedItemId);

  var bonus = APH.Colony.gearBonusOf(colonist);
  if (bonus.cryoResist !== 0.80) throw new Error('极地防寒抗性应生效 (0.80)');
});


