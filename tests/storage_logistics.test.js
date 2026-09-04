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
