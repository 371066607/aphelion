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

test('colony: tickProduction 30s 周期触发电网结算与多岗产出, 并报告本跳是否发生 (ADR-38)', () => {
  const Colony = window.APH.Colony;
  /* ADR-38: colony 不再反向调用 APH.Main —— 它只做生产, 并返回「这一跳发生了」。
     编排(rivals/story/residents)归 main.js。这里把桩留着, 用来断言「不许被调用」。 */
  let calledUp = false;
  window.APH.Main = window.APH.Main || {};
  window.APH.Main.tickRivals = () => { calledUp = true; };
  window.APH.Main.storyTick = () => { calledUp = true; };
  window.APH.Main.residentsTick = () => { calledUp = true; };

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
  const early = Colony.tickProduction(s, 0.2);
  if (s.prodT < 29.6) throw new Error('未满 30s 不应结算');
  if (early !== false) throw new Error('未满 30s 应返回 false, got ' + early);

  // 再推进 0.5s (满 30s)
  const fired = Colony.tickProduction(s, 0.5);
  if (s.prodT >= 30) {
    throw new Error('满 30s 后 prodT 应扣除 30s 周期, got ' + s.prodT);
  }
  if (fired !== true) throw new Error('满 30s 应返回 true(供 main 决定是否编排), got ' + fired);

  /* 层级铁律: 低层模块不得反向调用 main —— 那会让模拟循环没有唯一归属者 */
  if (calledUp) throw new Error('colony 不得反向调用 APH.Main (ADR-38 层级倒置)');
});

test('colony: 建筑落成走事件总线, 不反向调用 main (ADR-38)', () => {
  /* 落成后的存档/开场推进由 main.js 订阅 'built' 处理。 */
  const Colony = window.APH.Colony, U = window.APH.U;
  let builtId = null;
  const h = ev => { builtId = ev && ev.id; };
  U.on('built', h);
  let calledUp = false;
  window.APH.Main = window.APH.Main || {};
  window.APH.Main.saveColony = () => { calledUp = true; };
  window.APH.Main.applyFirstNightHint = () => { calledUp = true; };

  const s = {
    prodT: 0, clock: 100,
    colony: { buildings: [], buildQueue: [{ bid:'bl_house', x:600, y:600, progress:1, total:1 }] },
    meta: { res:{ mineral:99, food:0, wood:99, iron:99, stone:99 }, residents:[] },
    entities: [], power: {},
  };
  Colony.tickConstruction(s, 1);
  U.off && U.off('built', h);
  if (builtId !== 'bl_house') throw new Error("落成应 emit 'built', got " + builtId);
  if (calledUp) throw new Error('落成不得反向调用 APH.Main');
});
