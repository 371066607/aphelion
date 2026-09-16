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

test('#210 combat: 久攻不下的袭击必须撤走并解除 raidActive', () => {
  const Combat = window.APH.Combat, CFG = window.APH.CFG, T = CFG.entType;
  const giveUp = CFG.raidTactics.giveUpSec;
  if (!(giveUp > 0)) throw new Error('CFG.raidTactics.giveUpSec 必须是正数');
  /* 打不动也逃不掉的残兵: hp 高于 fleeHpPct、无人能伤到它 —— 死锁现场 */
  const straggler = { id: 'en_stuck', type: T.ENEMY, x: 1091, y: 1220, hp: 15, maxHp: 36, state: 'attack',
    dead: false, downed: false, captured: false, retreat: false, isSoldier: false, atkCd: 1, wanderA: 0,
    faction: { id: 'fx_test', name: 'test', behavior: 'melee_swarm', hp: 36, dmg: 8, speed: 96, nightBoost: 1, gene: { hue: 0 } } };
  const s = {
    scene: 'home', clock: 1000, px: CFG.HAB.x, py: CFG.HAB.y, noiseT: 0, parts: [], seed: 7,
    worldDescriptor: { width: 128 * CFG.GRID, height: 128 * CFG.GRID, grid: CFG.GRID },
    colony: { scene: { width: 128 * CFG.GRID, height: 128 * CFG.GRID, grid: CFG.GRID, generation: 1 }, buildings: [] },
    meta: { weather: { id: 'wx_clear' }, residents: [], stats: {} },
    war: { raidActive: true, raidWarn: 0, beganAt: 1000, routed: false, spawned: 6, wave: { count: 6, waves: 1 },
      wavesLeft: 0, betweenWaves: false, casualties: 0, stolen: 0, wins: 0 },
    entities: [straggler]
  };
  window.APH.state = s;

  // 1. 未到时限: 不得提前撤走
  Combat.tickRaid(s, 1);
  if (s.war.routed || !s.war.raidActive) throw new Error('未到 giveUpSec 不应撤走');

  // 2. 超过时限: 撤走 + 置 retreat 让回收分支接管
  s.clock = 1000 + giveUp + 1;
  Combat.tickRaid(s, 1);
  if (!s.war.routed) throw new Error('超过 giveUpSec 应进入撤退');
  if (!straggler.retreat) throw new Error('撤退时所有存活敌人应置 retreat 交给回收分支');

  // 3. 残兵真的走出地图被回收后, 终盘结算才把 raidActive 落下
  let escapeSteps = 0;
  while (s.war.raidActive && escapeSteps < 400) { Combat.tickRaid(s, 0.1); escapeSteps++; }
  if (s.war.raidActive) throw new Error('残兵撤离后 raidActive 应解除, steps=' + escapeSteps);
  if (!straggler.dead) throw new Error('撤离过 fleeDespawnR 的敌人应被回收');

  // 4. 旧档兼容: 没有 beganAt 时读档首帧补记, 不立即撤走
  const legacy = { scene: 'home', clock: 5000, px: CFG.HAB.x, py: CFG.HAB.y, noiseT: 0, parts: [], seed: 7,
    worldDescriptor: s.worldDescriptor, colony: s.colony, meta: s.meta,
    war: { raidActive: true, raidWarn: 0, routed: false, spawned: 6, wave: { count: 6, waves: 1 },
      wavesLeft: 0, betweenWaves: false, casualties: 0, stolen: 0 },
    entities: [JSON.parse(JSON.stringify(straggler))] };
  legacy.entities[0].retreat = false;
  window.APH.state = legacy;
  Combat.tickRaid(legacy, 1);
  if (legacy.war.routed) throw new Error('旧档缺 beganAt 时不得立刻撤走');
  if (legacy.war.beganAt !== 5000) throw new Error('旧档首帧应补记 beganAt, got ' + legacy.war.beganAt);
});

test('#211 combat: 双波袭击的敌人 id 必须全局唯一', () => {
  const Combat = window.APH.Combat, CFG = window.APH.CFG, T = CFG.entType;
  /* 双波袭击现场: 第一波被击倒/俘虏腾出名额后, 交接处把 spawned 归零 ——
     正是整季证据里 rs_h290165 出现两次(米娅·三号 被俘 / 白芷·三号 进攻)的触发点 */
  const s = {
    scene: 'home', clock: 100, px: CFG.HAB.x, py: CFG.HAB.y, noiseT: 0, parts: [], seed: 8123,
    worldDescriptor: { width: 128 * CFG.GRID, height: 128 * CFG.GRID, grid: CFG.GRID },
    colony: { scene: { width: 128 * CFG.GRID, height: 128 * CFG.GRID, grid: CFG.GRID, generation: 1 }, buildings: [] },
    meta: { residents: [], weather: { id: 'wx_clear' }, stats: {} },
    war: { raidActive: true, raidWarn: 0, beganAt: 100, routed: false, spawned: 0,
      wave: { count: 2, waves: 2, tactic: 'assault' }, wavesLeft: 1, betweenWaves: false,
      casualties: 0, stolen: 0, wins: 0, raidSpawnT: 0 },
    entities: []
  };
  window.APH.state = s;
  const foes = () => s.entities.filter(e => e.type === T.ENEMY);
  const ids = () => foes().map(e => e.id);
  const dupes = () => { const a = ids(); return a.filter((v, i) => a.indexOf(v) !== i); };

  // 1. 第一波刷满 2 人
  for (let i = 0; i < 6 && foes().length < 2; i++) Combat.tickRaid(s, 1);
  if (foes().length !== 2) throw new Error('第一波应刷出 2 个敌人, got ' + foes().length);

  // 2. 第一波被打倒并俘虏(与本票证据同形): 场上仍占着 id, 但不再计入 aliveEnemies
  foes().forEach(e => { e.captured = true; e.hp = e.maxHp; });

  // 3. 双波间歇结束: spawned 归零(同一帧即开始刷第二波, 所以归零后最多 +1)
  s.war.betweenWaves = true;
  s.war.nextWaveT = 0;
  Combat.tickRaid(s, 1);
  if (s.war.betweenWaves) throw new Error('间歇归零后应转入第二波');
  if ((s.war.spawned || 0) > 1) throw new Error('第二波应从 spawned 归零重新计数, got ' + s.war.spawned);

  // 4. 第二波刷满 2 人
  for (let i = 0; i < 6 && foes().length < 4; i++) Combat.tickRaid(s, 1);
  if (foes().length !== 4) throw new Error('第二波应刷到 4 个敌人, got ' + foes().length);

  // 5. 跨波次不得重用 id
  const bad = dupes();
  if (bad.length) throw new Error('#211 波次间重用实体 id: ' + bad.join(','));

  // 6. 跨袭击也不得撞: 上一场留下的俘虏仍占着 id (整季实测 27 个俘虏只有 6 个不同 id)
  foes().forEach(e => { e.captured = true; e.hp = e.maxHp; });
  const stale = ids();
  s.war.spawned = 0; s.war.wavesLeft = 1; s.war.routed = false; s.war.beganAt = s.clock;  // 新一场袭击开打
  for (let i = 0; i < 6 && foes().length < 6; i++) Combat.tickRaid(s, 1);
  if (foes().length !== 6) throw new Error('新袭击应刷出 2 个敌人, got ' + (foes().length - stale.length));
  const clash = foes().slice(stale.length).map(e => e.id).filter(id => stale.indexOf(id) >= 0);
  if (clash.length) throw new Error('#211 新袭击撞上在场俘虏的 id: ' + clash.join(','));
  if (dupes().length) throw new Error('#211 新袭击内部也有重复 id: ' + dupes().join(','));

  // 7. 名册记账: 俘虏按 id 进 meta.prisoners, 不得因撞 id 被去重吞掉
  if (!window.APH.Res || !window.APH.Res.capturePrisoner) throw new Error('缺少 APH.Res.capturePrisoner');
  const target = foes()[0];
  window.APH.Res.capturePrisoner(s.meta, target);
  const recorded = (s.meta.prisoners || []).map(p => p && p.id);
  if (recorded.indexOf(target.id) < 0) throw new Error('俘虏应按 id 记录进 meta.prisoners');
  if (new Set(recorded).size !== recorded.length) throw new Error('#211 meta.prisoners 出现重复 id: ' + recorded.join(','));
});
