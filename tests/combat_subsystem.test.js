/* combat_subsystem.test.js — 袭家与防务高阶推进接缝测试 (纯注册式, 进 run.js)
   验证 ADR-21 (docs/adr/0012-colony-subsystem-simulation-seams.md):
   - APH.Combat.tickRaid: 袭击预警倒计时、自动开战、炮塔协同索敌、波次胜利结算 */
'use strict';

test('combat: tickRaid 递减袭击预警并在归零时触发 startRaid', () => {
  const Combat = window.APH.Combat;
  const s = {
    px: 1000, py: 1000,
    war: { raidWarn: 5, raidFrom: '噬光群囊', raidActive: false, pendingWave: { count: 3 } },
    colony: { buildings: [] },
    meta: { residents: [], tech: {} },
    entities: []
  };

  // 1. 预警倒计时递减
  Combat.tickRaid(s, 2);
  if (s.war.raidWarn > 3.01 || s.war.raidWarn < 2.99) {
    throw new Error('5s 推进 2s 后 raidWarn 应为 3s, got ' + s.war.raidWarn);
  }
  if (s.war.raidActive !== false) {
    throw new Error('未到 0s 不应开战');
  }

  // 2. 倒计时归零触发开战
  Combat.tickRaid(s, 3.5);
  if (s.war.raidActive !== true) {
    throw new Error('预警归零后 raidActive 应变为 true');
  }
});

test('combat: tickRaid 在战斗中推进炮塔开火并处理终盘胜利', () => {
  const Combat = window.APH.Combat, CFG = window.APH.CFG, T = CFG.entType;
  const enemy = { id: 'en1', type: T.ENEMY, x: 1050, y: 1000, hp: 20, isSoldier: false, dead: false, faction: { behavior: 'melee_swarm', hp: 20, dmg: 5, speed: 50, gene: { hue: 200 } } };
  const s = {
    px: 1000, py: 1000,
    scene: 'home',
    war: {
      raidWarn: 0,
      raidActive: true,
      spawned: 3, // 已刷完全部波次
      wave: { count: 3, waves: 1 },
      wavesLeft: 0,
      betweenWaves: false,
      casualties: 0,
      routed: false,
      wins: 0
    },
    colony: {
      buildings: [{ id: 'bl_turret', x: 1000, y: 1000, lv: 1, cd: 0, powered: true }]
    },
    meta: { residents: [], tech: {} },
    entities: [enemy]
  };
  window.APH.state = s;

  // 1. 敌人存活时，炮塔开火
  Combat.tickRaid(s, 0.1);
  if (s.colony.buildings[0].cd <= 0) {
    throw new Error('炮塔在射程内发现敌人应开火并进入冷却');
  }
  if (s.war.raidActive !== true) {
    throw new Error('敌人存活时战斗应继续进行');
  }

  // 2. 敌人全歼时，胜利结算
  enemy.dead = true;
  Combat.tickRaid(s, 0.1);
  if (s.war.raidActive !== false) {
    throw new Error('全歼敌人后 raidActive 应变为 false');
  }
  if (s.war.wins !== 1) {
    throw new Error('防守成功后 s.war.wins 应自增 1, got ' + s.war.wins);
  }
});
