/* combat.js 纯函数测试: FSM / 掉落表 / 背包负重 */
'use strict';
const U = window.APH.U, C = window.APH.Combat, CFG = window.APH.CFG;

/* ---------- FSM (ADR: 纯函数, 不触 DOM) ---------- */
const mkEnemy = (state) => ({ state, faction: { speed: 100, nightBoost: 1.3 } });
const ctx = (over) => Object.assign(
  { dist: 500, night: false, hpPct: 1, dt: 0.016, heardShot: false, px: 0, py: 0 }, over);

test('FSM: idle 远距保持 idle', () => {
  if (C.fsmStep(mkEnemy('idle'), ctx({ dist: 500 })) !== 'idle') throw new Error('应保持 idle');
});
test('FSM: idle 进入 aggro 半径 → alert', () => {
  if (C.fsmStep(mkEnemy('idle'), ctx({ dist: 150 })) !== 'alert') throw new Error('应转 alert');
});
test('FSM: 夜间 aggro 半径扩大 (×1.6)', () => {
  // 250px: 白天在半径外, 夜晚在半径内
  if (C.fsmStep(mkEnemy('idle'), ctx({ dist: 250, night: false })) !== 'idle')
    throw new Error('白天 250 不应警觉');
  if (C.fsmStep(mkEnemy('idle'), ctx({ dist: 250, night: true })) !== 'alert')
    throw new Error('夜间 250 应警觉');
});
test('FSM: alert → chase', () => {
  if (C.fsmStep(mkEnemy('alert'), ctx({ dist: 150 })) !== 'chase') throw new Error('应转 chase');
});
test('FSM: chase 进入攻击距离 → attack', () => {
  if (C.fsmStep(mkEnemy('chase'), ctx({ dist: 20 })) !== 'attack') throw new Error('应转 attack');
});
test('FSM: chase 超出脱战半径 → idle', () => {
  if (C.fsmStep(mkEnemy('chase'), ctx({ dist: 500 })) !== 'idle') throw new Error('应脱战');
});
test('FSM: 低血量任何状态 → flee (最高优先)', () => {
  for (const st of ['idle','alert','chase','attack']) {
    if (C.fsmStep(mkEnemy(st), ctx({ hpPct: 0.1 })) !== 'flee')
      throw new Error(st + ' 低血应 flee');
  }
});
test('FSM: flee 持续到脱战半径外(低血逃跑是持续状态)', () => {
  if (C.fsmStep(mkEnemy('flee'), ctx({ dist: 300, hpPct: 0.1 })) !== 'flee')
    throw new Error('血量低且未脱离应继续 flee');
});
test('moveIntent: chase 朝玩家, flee 背离玩家', () => {
  const en = Object.assign(mkEnemy('chase'), { x: 0, y: 0, wanderA: 0 });
  const mi = C.moveIntent(en, ctx({ px: 100, py: 0 }));
  if (!(mi.vx > 0)) throw new Error('chase 应朝 +x');
  en.state = 'flee';
  const mf = C.moveIntent(en, ctx({ px: 100, py: 0 }));
  if (!(mf.vx < 0)) throw new Error('flee 应朝 -x');
});
test('shouldSpit: 仅 spitter 行为 + 距离窗口 + 冷却', () => {
  const spit = Object.assign(mkEnemy('chase'), { faction:{behavior:'spitter'}, atkCd: 0 });
  if (!C.shouldSpit(spit, ctx({ dist: 200 }))) throw new Error('spitter 200px 应可吐');
  if (C.shouldSpit(spit, ctx({ dist: 50 }))) throw new Error('50px 过近不应吐');
  if (C.shouldSpit(spit, ctx({ dist: 400 }))) throw new Error('400px 过远不应吐');
  spit.atkCd = 1;
  if (C.shouldSpit(spit, ctx({ dist: 200 }))) throw new Error('冷却中不应吐');
  const melee = Object.assign(mkEnemy('chase'), { faction:{behavior:'melee_swarm'}, atkCd: 0 });
  if (C.shouldSpit(melee, ctx({ dist: 200 }))) throw new Error('近战不应吐');
});

/* ---------- 掉落表 ---------- */
const KEY_ORE = 'it_crystal_ore', KEY_MIN = 'it_mineral',
      KEY_ALLOY = 'it_alloy', KEY_RELIC = 'it_relic';
test('rollLoot: 只产出物品表内的 id', () => {
  const rng = U.makeRng(42);
  for (let i = 0; i < 200; i++) {
    const l = C.rollLoot(rng);
    if (!(l.id in CFG.items)) throw new Error('非法掉落: ' + l.id);
    if (!(l.n >= 1)) throw new Error('数量非法');
  }
});
test('rollLoot: 大样本分布覆盖全部档位', () => {
  const rng = U.makeRng(7);
  const seen = new Set();
  for (let i = 0; i < 500; i++) seen.add(C.rollLoot(rng).id);
  if (seen.size < 3) throw new Error('稀有档从未掉出: ' + [...seen].join(','));
});

/* ---------- 背包负重 ---------- */
test('addToCarry: 正常装入与累加', () => {
  let c = {};
  let r = C.addToCarry(c, KEY_MIN, 2, 40);
  if (!r.ok || r.carry[KEY_MIN] !== 2) throw new Error('装入失败');
  r = C.addToCarry(r.carry, KEY_MIN, 1, 40);
  if (r.carry[KEY_MIN] !== 3) throw new Error('未累加');
});
test('addToCarry: 超重截断并报告 overflow', () => {
  let c = {};
  // it_alloy w=5, 上限40 → 最多装 8 个
  let r = C.addToCarry(c, KEY_ALLOY, 10, 40);
  if (!r.ok) throw new Error('应部分装入');
  if (r.carry[KEY_ALLOY] !== 8) throw new Error('应截断为8, got ' + r.carry[KEY_ALLOY]);
  if (r.overflow !== 2) throw new Error('overflow 应为2');
});
test('addToCarry: 完全满载拒绝', () => {
  const c = {}; c[KEY_ALLOY] = 8;   // 恰好 40
  const r = C.addToCarry(c, KEY_ALLOY, 1, 40);
  if (r.ok) throw new Error('满载应拒绝');
});
test('carryWeight: 权重计算正确', () => {
  const c = {}; c[KEY_MIN] = 3;   // w=3 ×3 = 9
  if (C.carryWeight(c) !== 9) throw new Error('应为9, got ' + C.carryWeight(c));
});
