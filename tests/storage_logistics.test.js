/* tests/storage_logistics.test.js — 精细化仓储与智能物流测试集 (ADR-23 / Spec #133)
   纯函数模式，由 tests/run.js 自动加载运行 */
'use strict';

function A(ok, msg) { if (!ok) throw new Error(msg || 'assert failed'); }

test('storage: BUILDINGS 注册 1x1 置物货架 bl_storage_shelf', () => {
  const shelf = APH.Colony.get('bl_storage_shelf');
  A(shelf, 'bl_storage_shelf 必须注册于 BUILDINGS');
  A(shelf.name === '置物货架', '名称应为置物货架');
  A(shelf.cells && shelf.cells[0] === 1 && shelf.cells[1] === 1, '占位格必须为 1x1');
  A(shelf.costRes && shelf.costRes.wood === 6, '建造成本应仅消耗 wood: 6');
  A(shelf.buildTime === 4, '建造时间应为 4s');
});

test('storage: CFG.storage 配置完整品类与轮转预设', () => {
  const S = APH.CFG.storage;
  A(S, 'CFG.storage 必须存在');
  A(Array.isArray(S.presets), 'CFG.storage.presets 必须为数组');
  A(S.presets.length === 5, '应包含 5 个预设轮转项');
  const ids = S.presets.map(p => p.id);
  A(ids.includes('all'), '应包含 all 预设');
  A(ids.includes('food'), '应包含 food 预设');
  A(ids.includes('materials'), '应包含 materials 预设');
  A(ids.includes('medical'), '应包含 medical 预设');
  A(ids.includes('specimens_gear'), '应包含 specimens_gear 预设');
});

test('storage: storageFilterMatches 纯函数品类匹配准确', () => {
  const matches = APH.Colony.storageFilterMatches;
  A(typeof matches === 'function', 'storageFilterMatches 必须为函数');

  // 全部允许 (all / null / undefined)
  A(matches('all', 'it_food') === true, 'all 预设应允许 it_food');
  A(matches('all', 'it_mineral') === true, 'all 预设应允许 it_mineral');
  A(matches('all', 'it_med') === true, 'all 预设应允许 it_med');
  A(matches(null, 'it_med') === true, 'null 默认全允许');

  // 仅食材 (food)
  A(matches('food', 'it_food') === true, 'food 预设应允许 it_food');
  A(matches('food', 'it_roasted_meat') === true, 'food 预设应允许熟食');
  A(matches('food', 'it_berry') === true, 'food 预设应允许野果');
  A(matches('food', 'it_mineral') === false, 'food 预设拒绝矿石');
  A(matches('food', 'it_med') === false, 'food 预设拒绝药品');

  // 仅建材 (materials)
  A(matches('materials', 'it_mineral') === true, 'materials 允许矿石');
  A(matches('materials', 'it_iron') === true, 'materials 允许铁料');
  A(matches('materials', 'it_wood') === true, 'materials 允许木材');
  A(matches('materials', 'it_stone') === true, 'materials 允许石料');
  A(matches('materials', 'it_food') === false, 'materials 拒绝食物');

  // 仅药品 (medical)
  A(matches('medical', 'it_med') === true, 'medical 允许药品');
  A(matches('medical', 'it_herb') === true, 'medical 允许草药');
  A(matches('medical', 'it_reagent') === true, 'medical 允许精纯试剂');
  A(matches('medical', 'it_stone') === false, 'medical 拒绝建材');

  // 仅标本与特种装备 (specimens_gear)
  A(matches('specimens_gear', 'specimen_flora_glow') === true, '允许异星标本');
  A(matches('specimens_gear', 'gear_suit_hazard') === true, '允许特种装备');
  A(matches('specimens_gear', 'it_food') === false, '拒绝食材');
});

test('storage: cycleStorageFilter 容器分类单键轮转', () => {
  const cycle = APH.Colony.cycleStorageFilter;
  A(typeof cycle === 'function', 'cycleStorageFilter 必须为函数');

  const container = { id: 'bl_storage_shelf', filter: 'all' };
  
  // 循环依次推进
  A(cycle(container).id === 'food', 'all 后下一个为 food');
  A(cycle(container).id === 'materials', 'food 后下一个为 materials');
  A(cycle(container).id === 'medical', 'materials 后下一个为 medical');
  A(cycle(container).id === 'specimens_gear', 'medical 后下一个为 specimens_gear');
  A(cycle(container).id === 'all', 'specimens_gear 后回到 all 闭环');
});

test('storage: deteriorationTick 露天天气劣化与避难豁免', () => {
  const decayTick = APH.Colony.deteriorationTick;
  A(typeof decayTick === 'function', 'deteriorationTick 必须为函数');

  // 1. 易腐品晴天室外损耗 (1.5 HP / 30s)
  const foodDrop = { itemId: 'it_food', decayHp: 100 };
  const r1 = decayTick(foodDrop, 'wx_clear', false, 30);
  A(foodDrop.decayHp === 98.5, '晴天易腐品损耗 1.5, 实际: ' + foodDrop.decayHp);
  A(r1.decayed === false, '未归零前 decayed 应为 false');

  // 2. 雨天室外损耗翻倍 (1.5 * 2 = 3.0 HP / 30s)
  const steakDrop = { itemId: 'it_roasted_meat', decayHp: 100 };
  decayTick(steakDrop, 'wx_rain', false, 30);
  A(steakDrop.decayHp === 97, '雨天损耗翻倍为 3.0, 实际: ' + steakDrop.decayHp);

  // 3. 酸雨室外损耗 4 倍 (1.5 * 4 = 6.0 HP / 30s)
  const berryDrop = { itemId: 'it_berry', decayHp: 100 };
  decayTick(berryDrop, 'wx_acid', false, 30);
  A(berryDrop.decayHp === 94, '酸雨损耗4倍为 6.0, 实际: ' + berryDrop.decayHp);

  // 4. 工业矿石建材完全免疫
  const ironDrop = { itemId: 'it_iron', decayHp: 100 };
  decayTick(ironDrop, 'wx_acid', false, 30);
  A(ironDrop.decayHp === 100, '工业铁料应免疫腐烂');

  const mineralDrop = { itemId: 'it_mineral', decayHp: 100 };
  decayTick(mineralDrop, 'wx_rain', false, 30);
  A(mineralDrop.decayHp === 100, '矿料应免疫腐烂');

  // 5. 室内或货架避难保护完全免疫
  const shelteredFood = { itemId: 'it_food', decayHp: 100 };
  decayTick(shelteredFood, 'wx_acid', true, 30);
  A(shelteredFood.decayHp === 100, '受避难保护物资在酸雨下也不损耗');

  // 6. 耐久归零标记 decayed === true
  const dyingDrop = { itemId: 'it_food', decayHp: 1 };
  const rDying = decayTick(dyingDrop, 'wx_clear', false, 30);
  A(dyingDrop.decayHp === 0, '耐久应归零');
  A(rDying.decayed === true, '耐久归零后 decayed 应为 true');
});
