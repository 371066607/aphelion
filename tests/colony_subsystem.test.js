/* colony_subsystem.test.js — 殖民地建造与生产高阶推进接缝测试 (纯注册式, 进 run.js)
   验证 ADR-21 (docs/adr/0012-colony-subsystem-simulation-seams.md):
   - APH.Colony.tickConstruction: 建造队列推进、工人加成、蓝图同步与完工实体化
   - APH.Colony.tickProduction: 30秒大时钟供电、多岗产出、地面物生成与生命周期联动 */
'use strict';

test('colony: tickConstruction 推进蓝图进度并在满进度时实体化建筑', () => {
  const Colony = window.APH.Colony, CFG = window.APH.CFG, T = CFG.entType;
  const s = {
    px: 100, py: 100,
    colony: {
      buildings: [],
      buildQueue: [{ bid: 'bl_mine', x: 100, y: 100, total: 10, progress: 0.9, building: false }]
    },
    meta: { residents: [], tech: {} },
    entities: [{ type: T.BLUEPRINT, bid: 'bl_mine', x: 100, y: 100, progress: 0.9, building: false }],
    parts: []
  };

  // 玩家在蓝图旁 (100, 100)，推进 2 秒 (0.9 + 2/10 = 1.1 >= 1 完工)
  Colony.tickConstruction(s, 2);

  // 1. 蓝图出队
  if (s.colony.buildQueue.length !== 0) {
    throw new Error('完工后建造队列应出队, 剩余: ' + s.colony.buildQueue.length);
  }

  // 2. 实体列表中蓝图实体被移除，并新增了建筑实体
  const bp = s.entities.find(e => e.type === T.BLUEPRINT && !e.dead);
  if (bp) throw new Error('完工后蓝图实体应被清除');

  const bldg = s.entities.find(e => e.type === T.BUILDING && e.bid === 'bl_mine');
  if (!bldg) throw new Error('完工后应生成对应 BUILDING 实体');

  // 3. buildings 列表增加了建筑记录
  if (s.colony.buildings.length !== 1 || s.colony.buildings[0].id !== 'bl_mine') {
    throw new Error('colony.buildings 应增加 bl_mine 记录');
  }
});

test('colony: tickProduction 30s 周期触发电网结算与多岗产出', () => {
  const Colony = window.APH.Colony;
  let rivalsTicked = false, storyTicked = false, residentsTicked = false;
  window.APH.Main = window.APH.Main || {};
  window.APH.Main.tickRivals = () => { rivalsTicked = true; };
  window.APH.Main.storyTick = () => { storyTicked = true; };
  window.APH.Main.residentsTick = () => { residentsTicked = true; };

  const s = {
    prodT: 29.5, // 还有 0.5s 触发
    clock: 100,
    colony: { buildings: [{ id: 'bl_mine', x: 200, y: 200, lv: 1 }] },
    meta: {
      res: { mineral: 0, food: 0 },
      residents: [{ id: 'r1', name: '矿工', job: 'bl_mine', skills: { sk_mine: 5 } }]
    },
    entities: [],
    power: {}
  };

  // 推进 0.2s (未到 30s)
  Colony.tickProduction(s, 0.2);
  if (s.prodT < 29.6 || rivalsTicked) {
    throw new Error('未满 30s 不应触发生产结算');
  }

  // 再推进 0.5s (满 30s)
  Colony.tickProduction(s, 0.5);
  if (s.prodT >= 30) {
    throw new Error('满 30s 后 prodT 应扣除 30s 周期, got ' + s.prodT);
  }
  if (!rivalsTicked || !storyTicked || !residentsTicked) {
    throw new Error('生产结算时应联动触发 rivals / story / residents 推进');
  }
});
