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

test('storage: bulkHaulCandidates 48px 范围内相邻多堆聚类抓取', () => {
  const bulk = APH.Colony.bulkHaulCandidates;
  A(typeof bulk === 'function', 'bulkHaulCandidates 必须为函数');

  const primary = { id: 'dp_1', itemId: 'it_wood', n: 10, x: 500, y: 500 };
  const near1 = { id: 'dp_2', itemId: 'it_wood', n: 15, x: 520, y: 510 }; // 距 22px < 48px
  const near2 = { id: 'dp_3', itemId: 'it_wood', n: 12, x: 480, y: 510 }; // 距 22px < 48px
  const far = { id: 'dp_4', itemId: 'it_wood', n: 10, x: 600, y: 500 };   // 距 100px > 48px
  const all = [primary, near1, near2, far];

  const picked = bulk(primary, all, 48, 3, 50);
  A(Array.isArray(picked), '返回结果应为数组');
  A(picked.length === 3, '应最多包含 3 堆 (包含 primary), 实际: ' + picked.length);
  A(picked[0].id === 'dp_1', '首个必须为 primary');
  A(picked.some(p => p.id === 'dp_2'), '应包含相距 22px 的 near1');
  A(picked.some(p => p.id === 'dp_3'), '应包含相距 22px 的 near2');
  A(!picked.some(p => p.id === 'dp_4'), '不应包含距离 100px 的远端物品');
});

test('storage: findBestStorageSpot 寻找最近兼容品类的仓储点', () => {
  const findSpot = APH.Colony.findBestStorageSpot;
  A(typeof findSpot === 'function', 'findBestStorageSpot 必须为函数');

  const buildings = [
    { id: 'bl_warehouse', x: 1000, y: 1000, filter: 'materials' }, // 仅建材
    { id: 'bl_storage_shelf', x: 500, y: 500, filter: 'food' },      // 仅食材货架
    { id: 'bl_storage_shelf', x: 200, y: 200, filter: 'medical' },   // 仅药品货架
  ];

  // 1. 食物应送往 500, 500 的食物货架
  const spotFood = findSpot('it_food', buildings, [], { x: 510, y: 510 });
  A(spotFood && spotFood.x === 500 && spotFood.y === 500, '食物应找到 food 货架');
  A(spotFood.container && spotFood.container.filter === 'food', '对应容器应为 food 过滤');

  // 2. 矿石应送往 1000, 1000 的建材仓库
  const spotOre = findSpot('it_mineral', buildings, [], { x: 510, y: 510 });
  A(spotOre && spotOre.x === 1000 && spotOre.y === 1000, '矿石应找到 materials 仓库');

  // 3. 无专门货架时回退大本营或综合点
  const spotOther = findSpot('it_alien_unknown', [{ id: 'bl_landing_pad', x: 1100, y: 1100 }], [], { x: 0, y: 0 });
  A(spotOther && typeof spotOther.x === 'number', '未知物品应回退兜底点');
});

test('storage: findNearbySourcedItem 120px 范围内就近货架优先取料', () => {
  const source = APH.Colony.findNearbySourcedItem;
  A(typeof source === 'function', 'findNearbySourcedItem 必须为函数');

  const kitchenPos = { x: 500, y: 500 };
  const nearbyFoodShelf = { id: 'bl_storage_shelf', x: 540, y: 500, filter: 'food' }; // 距离 40px < 120px
  const distantWarehouse = { id: 'bl_warehouse', x: 1000, y: 1000, filter: 'food' }; // 距离 707px > 120px
  const buildings = [nearbyFoodShelf, distantWarehouse];

  const nearbyDrop = { id: 'dp_food_1', itemId: 'it_food', n: 10, x: 540, y: 500, dead: false };
  const distantDrop = { id: 'dp_food_2', itemId: 'it_food', n: 10, x: 1000, y: 1000, dead: false };
  const entities = [nearbyDrop, distantDrop];

  // 检索食材：应优先从 40px 的食物货架上取料
  const res = source('food', kitchenPos, 120, buildings, entities);
  A(res && res.found === true, '应成功就近取料');
  A(res.shelf && res.shelf === nearbyFoodShelf, '应匹配近处食物货架');
  A(res.drop && res.drop.id === 'dp_food_1', '应取到货架上的食物堆');
  A(res.distance === 40, '取料距离应为 40px');

  // 若无对应品类货架，found 为 false
  const resMed = source('medical', kitchenPos, 120, buildings, entities);
  A(resMed && resMed.found === false, '无药品货架时应返回 found: false');
});
