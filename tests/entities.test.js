/* entities.test.js — 实体空间检索与生命周期接缝测试 (纯注册式, 进 run.js)
   验证 ADR-20 (docs/adr/0011-entity-collection-and-spatial-queries.md):
   - APH.Ent.findNearest
   - APH.Ent.findNearestBuilding
   - APH.Ent.findNearestFood
   - APH.Ent.destroy / sweepDead */
'use strict';

test('entities: findNearest 按照几何距离截断并返回最近实体', () => {
  const Ent = window.APH.Ent, T = window.APH.CFG.entType;
  const list = [
    { id: 'e1', type: T.FLORA, x: 100, y: 100 },
    { id: 'e2', type: T.FLORA, x: 120, y: 100 },
    { id: 'e3', type: T.ENEMY, x: 105, y: 100 },
    { id: 'e4', type: T.FLORA, x: 200, y: 200, dead: true } // 死亡应被排除
  ];

  // 1. 查找最近的 FLORA (在 102, 100 处，最近应为 e1 距离2，而不是 e2 距离18)
  const nearestFlora = Ent.findNearest(list, T.FLORA, 102, 100, 50);
  if (!nearestFlora || nearestFlora.id !== 'e1') {
    throw new Error('最近 FLORA 应为 e1, got ' + (nearestFlora && nearestFlora.id));
  }

  // 2. 超出半径截断返回 null
  const outOfRange = Ent.findNearest(list, T.FLORA, 500, 500, 50);
  if (outOfRange !== null) {
    throw new Error('超出半径应返回 null');
  }

  // 3. 死亡实体排除
  const deadExcluded = Ent.findNearest(list, T.FLORA, 200, 200, 10);
  if (deadExcluded !== null) {
    throw new Error('已标记 dead 实体不应被检出');
  }
});

test('entities: findNearestBuilding 支持单建筑与多建筑类型合并查询', () => {
  const Ent = window.APH.Ent, T = window.APH.CFG.entType;
  const list = [
    { id: 'b1', type: T.BUILDING, bid: 'bl_house', x: 500, y: 500 },
    { id: 'b2', type: T.BUILDING, bid: 'bl_clinic', x: 520, y: 500 },
    { id: 'b3', type: T.BUILDING, bid: 'bl_farm', x: 600, y: 600 },
    { id: 'b4', type: T.BUILDING, bid: 'bl_crop_plot', x: 620, y: 600 }
  ];

  // 1. 单个建筑类型匹配
  const clinic = Ent.findNearestBuilding(list, 'bl_clinic', 510, 500, 30);
  if (!clinic || clinic.id !== 'b2') {
    throw new Error('应检出最近医疗舱 b2, got ' + (clinic && clinic.id));
  }

  // 2. 多建筑类型匹配 (如农田或种植圃)
  const plot = Ent.findNearestBuilding(list, ['bl_crop_plot', 'bl_farm'], 615, 600, 50);
  if (!plot || plot.id !== 'b4') {
    throw new Error('距离 615 最近农耕应为 b4(620), got ' + (plot && plot.id));
  }
});

test('entities: findNearestFood 实现熟食优先与仓库兜底', () => {
  const Ent = window.APH.Ent, T = window.APH.CFG.entType;
  const list = [
    { id: 'd1', type: T.DROPPED, itemId: 'it_food', x: 100, y: 100 }, // 生食
    { id: 'd2', type: T.DROPPED, itemId: 'it_roasted_meat', x: 120, y: 100 }, // 熟食 (更远但优先)
    { id: 'w1', type: T.BUILDING, bid: 'bl_warehouse', x: 300, y: 300 }
  ];

  // 1. 熟食优先
  const food1 = Ent.findNearestFood(list, 105, 100, 60, 0);
  if (!food1 || food1.itemId !== 'it_roasted_meat' || !food1.isCooked) {
    throw new Error('熟食应被优先检出, got ' + JSON.stringify(food1));
  }

  // 2. 无熟食时落到生食
  list[1].dead = true;
  const food2 = Ent.findNearestFood(list, 105, 100, 60, 0);
  if (!food2 || food2.itemId !== 'it_food') {
    throw new Error('熟食失效后应检出生食, got ' + JSON.stringify(food2));
  }

  // 3. 地上无粮，靠近有存粮的仓库时返回 isWarehouse: true
  list[0].dead = true;
  const food3 = Ent.findNearestFood(list, 310, 310, 60, 10);
  if (!food3 || !food3.isWarehouse) {
    throw new Error('地上无粮但仓库有粮时应返回 isWarehouse, got ' + JSON.stringify(food3));
  }

  // 4. 仓库无粮 (stock=0) 时返回 null
  const food4 = Ent.findNearestFood(list, 310, 310, 60, 0);
  if (food4 !== null) {
    throw new Error('仓库断粮时应返回 null');
  }
});

test('entities: destroy 标记死亡与 sweepDead 安全清洗 (保护玩家)', () => {
  const Ent = window.APH.Ent, T = window.APH.CFG.entType;
  const player = { id: 'p1', type: T.PLAYER, x: 0, y: 0, dead: true }; // 即使误标 dead 也绝不删
  const enemy1 = { id: 'm1', type: T.ENEMY, x: 10, y: 10 };
  const enemy2 = { id: 'm2', type: T.ENEMY, x: 20, y: 20 };
  const list = [player, enemy1, enemy2];

  Ent.destroy(enemy1);
  if (enemy1.dead !== true) throw new Error('destroy 应标记 dead=true');

  const swept = Ent.sweepDead(list);
  if (swept.length !== 2) {
    throw new Error('清理后应剩余 2 个实体 (player + enemy2), got ' + swept.length);
  }
  if (!swept.includes(player)) {
    throw new Error('玩家实体绝不能被 sweep 清理');
  }
  if (swept.includes(enemy1)) {
    throw new Error('死亡敌人必须被清理');
  }
});
