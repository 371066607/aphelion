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
test('FSM: idle 枪声在 noiseAggroR 内 → alert', () => {
  if (C.fsmStep(mkEnemy('idle'), ctx({ dist: 250, heardShot: true })) !== 'alert')
    throw new Error('枪声应警觉');
  if (C.fsmStep(mkEnemy('idle'), ctx({ dist: 500, heardShot: true })) !== 'idle')
    throw new Error('枪声过远不应警觉');
});
test('FSM: echo 弱视 — 中距不看见, 枪声才警', () => {
  if (C.fsmStep(mkEnemy('idle'), ctx({ dist: 150, sightMul: 0.45 })) !== 'idle')
    throw new Error('弱视不应看见 150');
  if (C.fsmStep(mkEnemy('idle'), ctx({ dist: 250, heardShot: true, sightMul: 0.45, noiseAggroR: 540 })) !== 'alert')
    throw new Error('枪声应警觉');
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
test('rollLoot: 大样本覆盖掉落表全部档位(表由 CFG 定义)', () => {
  const rng = U.makeRng(7);
  const table = C.lootTable();
  const seen = new Set();
  for (let i = 0; i < 2000; i++) seen.add(C.rollLoot(rng).id);
  table.forEach(e => {
    if (!seen.has(e.id)) throw new Error('档位从未掉出: ' + e.id);
  });
  seen.forEach(id => {
    if (!table.some(e => e.id === id)) throw new Error('掉出了表外物品: ' + id);
  });
});

/* ---------- 殖民地优先 T4: 远征只带回「种不出来的东西」 ---------- */
test('T4 loot: 掉落表不得含散装资源(粮/木/石/铁/矿/皮/草药/药)', () => {
  const table = C.lootTable();
  const bulk = APH.CFG.expedition.bulkStores;
  if (!table.length) throw new Error('掉落表不应为空');
  table.forEach(e => {
    const it = CFG.items[e.id];
    if (!it) throw new Error('掉落表引用了不存在的物品: ' + e.id);
    if (it.store && bulk.indexOf(it.store) >= 0)
      throw new Error('散装资源不得进远征掉落表: ' + e.id + ' (store=' + it.store + ')');
  });
});

test('T4 loot: 远征产出结算为研究点, 不再产出散装矿材', () => {
  const table = C.lootTable();
  const carry = {};
  table.forEach(e => { carry[e.id] = 2; });
  const goods = C.settleGoods(carry);
  if (goods.mineral !== 0)
    throw new Error('远征掉落不应结算出散装矿材, got ' + goods.mineral);
  if (!(goods.research > 0))
    throw new Error('远征掉落应结算为研究点, got ' + goods.research);
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

/* ---------- Task4: 炮塔/士兵 ---------- */
const T_ENEMY2 = 'enemy';
test('turretStep: 射程内敌人受击+进冷却', () => {
  const tw = {x:0,y:0,lv:1,cd:0};
  const foe = {type:T_ENEMY2, x:200,y:0, hp:100, dead:false};
  C.turretStep(tw,[foe],0.1);
  if (foe.hp >= 100) throw new Error('应受击: '+foe.hp);
});
test('turretStep: 射程外不攻击', () => {
  const tw = {x:0,y:0,lv:1,cd:0};
  const far = {type:T_ENEMY2, x:400,y:0, hp:50, dead:false};
  C.turretStep(tw,[far],0.1);
  if (far.hp !== 50) throw new Error('射程外不应受击');
});
test('turretStep: 冷却期不开火', () => {
  const tw = {x:0,y:0,lv:1,cd:5};
  const foe = {type:T_ENEMY2, x:100,y:0, hp:50, dead:false};
  if (C.turretStep(tw,[foe],0.1) !== false) throw new Error('冷却中应返回false');
});
test('turretStep: 不攻击 isSoldier', () => {
  const tw = {x:0,y:0,lv:1,cd:0};
  const sol = {type:T_ENEMY2, x:50,y:0, hp:40, dead:false, isSoldier:true};
  const foe = {type:T_ENEMY2, x:80,y:0, hp:40, dead:false};
  C.turretStep(tw,[sol,foe],0.1);
  if (sol.hp !== 40) throw new Error('士兵不应被炮塔打');
  if (foe.hp >= 40) throw new Error('应打袭击敌人');
});

test('settleValue: 缺物品id不抛错, 只结算已知物', () => {
  const v = C.settleValue({ it_mineral:2, it_ghost:9 });
  if (v !== 8) throw new Error('2矿材=8研究点, got '+v);
});
test('settleGoods: 矿材入仓, 晶体变研究点', () => {
  const g = C.settleGoods({ it_mineral:2, it_alloy:1, it_crystal_ore:3, it_relic:1, it_ghost:9 });
  if (g.mineral !== 5) throw new Error('2矿+1合金×3=5, got '+g.mineral);
  if (g.research !== 46) throw new Error('3×2晶体+40遗件=46, got '+g.research);
});
test('pickRaidFocus: 优先仓库, 玩家靠近则改追人', () => {
  const en={x:0,y:0};
  const s={px:900,py:0, colony:{buildings:[
    {id:'bl_warehouse',x:80,y:0},{id:'bl_farm',x:400,y:0},{id:'bl_house',x:500,y:0}
  ]}};
  let f=C.pickRaidFocus(en,s);
  if(f.kind!=='building'||f.b.id!=='bl_warehouse') throw new Error('应优先仓库: '+(f.b&&f.b.id));
  s.px=10; s.py=0;
  f=C.pickRaidFocus(en,s);
  if(f.kind!=='player') throw new Error('玩家近应追人');
});
test('pickRaidFocus: 更近的居民优先于仓库', () => {
  const en={x:0,y:0};
  const s={px:900,py:0, colony:{buildings:[{id:'bl_warehouse',x:80,y:0}]},
    entities:[{type:CFG.entType.RESIDENT, x:20, y:0, id:'rs_a'}]};
  const f=C.pickRaidFocus(en,s);
  if(f.kind!=='resident') throw new Error('应追近处居民: '+f.kind);
});
test('homeRegen: 无舱不回血, 靠近医疗舱回血, 氧气始终补', () => {
  const a=C.homeRegen(50, 40, 1, null);
  if(a.hp!==50) throw new Error('无舱不应回血: '+a.hp);
  if(a.o2!==50) throw new Error('氧应+10: '+a.o2);
  const b=C.homeRegen(50, 40, 1, 0);
  if(b.hp!==54) throw new Error('贴舱应+4: '+b.hp);
  const c=C.homeRegen(50, 40, 1, 200);
  if(c.hp!==50) throw new Error('远舱不应回血: '+c.hp);
});
test('hurtPlayer: 医疗舱急救一次', () => {
  const prev=window.APH.state;
  window.APH.state=combatState({hp:3, clinicKit:1, iFrameT:0});
  try{
    C.hurtPlayer(10,'测试');
    if(window.APH.state.mode==='dead') throw new Error('急救后不应死');
    if(window.APH.state.clinicKit!==0) throw new Error('应消耗急救');
    if(window.APH.state.hp!==40) throw new Error('应回血40, got '+window.APH.state.hp);
  }finally{ window.APH.state=prev; }
});
/* #72 家园击倒: 家园 hp<=0 → 击倒而非死亡(不动 clinicKit/stats.deaths); 远征仍走现有死亡 */
test('hurtPlayer: 家园击倒 != 死亡 (不进死亡画面, 不记死亡)', () => {
  const prev=window.APH.state;
  window.APH.state=combatState({scene:'home', hp:3, clinicKit:0, iFrameT:0,
    meta:{ stats:{kills:0,deaths:0}, playerNeeds:{} }});
  try{
    C.hurtPlayer(10,'测试');
    const st=window.APH.state;
    if(st.mode==='dead') throw new Error('家园击倒不应死亡');
    if(st.meta.stats.deaths!==0) throw new Error('家园击倒不应记死亡, deaths='+st.meta.stats.deaths);
    if(!st.meta.playerNeeds.downed) throw new Error('应击倒 (playerNeeds.downed=true)');
    if(st.meta.playerNeeds.downT!==CFG.player.downedTime) throw new Error('倒计时应为 '+CFG.player.downedTime+', 实际: '+st.meta.playerNeeds.downT);
    if(st.hp!==0) throw new Error('hp 应钳到 0, 实际: '+st.hp);
  }finally{ window.APH.state=prev; }
});
test('hurtPlayer: 家园击倒不消耗 clinicKit (远征急救仅在远征分支消耗)', () => {
  const prev=window.APH.state;
  window.APH.state=combatState({scene:'home', hp:3, clinicKit:1, iFrameT:0,
    meta:{ stats:{kills:0,deaths:0}, playerNeeds:{} }});
  try{
    C.hurtPlayer(10,'测试');
    const st=window.APH.state;
    if(!st.meta.playerNeeds.downed) throw new Error('应击倒');
    if(st.clinicKit!==1) throw new Error('家园击倒不得消耗远征急救, clinicKit='+st.clinicKit);
  }finally{ window.APH.state=prev; }
});
test('hurtPlayer: 远征生命归零且名册为空 → 本局结束 (ADR-44)', () => {
  const prev=window.APH.state;
  window.APH.state=combatState({scene:'expedition', hp:3, clinicKit:0, iFrameT:0});
  try{
    C.hurtPlayer(10,'测试');
    const st=window.APH.state;
    if(st.mode!=='dead') throw new Error('远征应死亡, mode='+st.mode);
    if(st.meta.stats.deaths!==1) throw new Error('远征应记死亡, deaths='+st.meta.stats.deaths);
  }finally{ window.APH.state=prev; }
});
test('raidPillage: 扣粮扣矿并给建筑冷却', () => {
  const meta={ res:{ food:10, mineral:8 } };
  const b={ id:'bl_warehouse' };
  const o=C.raidPillage(meta, b);
  if(o.food!==3||o.mineral!==2) throw new Error(JSON.stringify(o));
  if(meta.res.food!==7||meta.res.mineral!==6) throw new Error('未扣仓');
  if(!b.offlineT) throw new Error('应暂停产出');
});
test('raidPillage: 扣药品', () => {
  const meta={ res:{ food:0, mineral:0, med:4 } };
  const o=C.raidPillage(meta, { id:'bl_workshop' });
  if(o.med!==1) throw new Error('应抢1药: '+JSON.stringify(o));
  if(meta.res.med!==3) throw new Error('药仓未扣: '+meta.res.med);
});
test('pickRaidFocus: 工坊可被锁定', () => {
  const en={x:0,y:0};
  const s={px:900,py:0, colony:{buildings:[{id:'bl_workshop',x:80,y:0}]}};
  const f=C.pickRaidFocus(en,s);
  if(f.kind!=='building'||f.b.id!=='bl_workshop') throw new Error('应追工坊: '+(f.b&&f.b.id));
});

test('soldierCount: 兵营等级×2', () => {
  if (C.soldierCount([])!==0) throw new Error('无兵营=0');
  if (C.soldierCount([{bid:'bl_barracks',lv:1}])!==2) throw new Error('1级=2');
  if (C.soldierCount([{bid:'bl_barracks',lv:2}])!==4) throw new Error('2级=4');
});

function combatState(over){
  return Object.assign({
    scene:'expedition', entities:[], parts:[], war:{ raids:0, wins:0 },
    meta:{ stats:{ kills:0, deaths:0 } }, px:200, py:200, shake:0, noiseT:0,
    colony:{ buildings:[] }, carry:{}, cry:0, found:0, totalBeacons:6,
    hp:100, iFrameT:0, mode:'running', seed:1, clock:0, landedAt:0, runLoot:0,
  }, over||{});
}

test('spawnDrop: 同种近距叠堆', () => {
  const prev=window.APH.state;
  window.APH.state=combatState({scene:'home', entities:[]});
  try{
    C.spawnDrop(100,100,'it_food',2,{jitter:0,stock:true});
    C.spawnDrop(105,100,'it_food',1,{jitter:0,stock:true});
    const drops=window.APH.state.entities.filter(e=>e.type===CFG.entType.DROPPED && !e.dead);
    if(drops.length!==1) throw new Error('应叠成一堆: '+drops.length);
    if(drops[0].n!==3) throw new Error('n='+drops[0].n);
  }finally{ window.APH.state=prev; }
});
test('updateDropped: 家园拾取入库不进背包', () => {
  const prev=window.APH.state;
  const st=combatState({
    scene:'home', px:100, py:100, carry:{},
    meta:{ research:0, res:{mineral:0,food:0,med:0}, stats:{kills:0,deaths:0} },
    entities:[{id:'dp1', type:CFG.entType.DROPPED, x:100, y:100, itemId:'it_mineral', n:2, bobA:0, stock:true}]
  });
  window.APH.state=st;
  try{
    C.updateDropped(0.016);
    if((st.carry.it_mineral||0)!==0) throw new Error('不应进背包');
    if(st.meta.res.mineral!==2) throw new Error('应入库: '+st.meta.res.mineral);
    if(st.entities.some(e=>e.type===CFG.entType.DROPPED && !e.dead)) throw new Error('应捡走');
  }finally{ window.APH.state=prev; }
});
const RAID_FACTION = {
  id:'fx_raid', name:'袭击种', behavior:'melee_swarm',
  gene:{hue:1,sides:5,limbs:6,size:1,spikes:1,eyes:2},
  hp:30, speed:80, dmg:5, nightBoost:1,
};
function mkRaidEnemy(x, y, extra){
  return Object.assign({
    type:T_ENEMY2, x:x, y:y, hp:30, dead:false, isSoldier:false,
    faction:RAID_FACTION, state:'chase', wanderA:0, atkCd:1, walkPh:0,
  }, extra||{});
}

test('updateCombat: home 远距袭击者不脱战不回收', () => {
  const prevState = window.APH.state;
  window.APH.state = combatState({ scene:'home' });
  try {
    const mid = mkRaidEnemy(1000, 200);          // 800px, 脱战内回收外
    const far = mkRaidEnemy(1150, 200);          // 950px, 远征会 despawn
    window.APH.state.entities = [mid, far];
    C.updateCombat(0.016, false);
    if (mid.dead) throw new Error('800px 家园袭击者不应回收');
    if (far.dead) throw new Error('家园不得按远征 despawnR 清波');
    const closing = { chase:1, alert:1, attack:1 };
    if (!closing[mid.state]) throw new Error('800px 应保持冲锋, got '+mid.state);
    if (!closing[far.state]) throw new Error('950px 应保持冲锋, got '+far.state);
  } finally {
    window.APH.state = prevState;
  }
});

test('updateCombat: 远征仍按 despawnR 回收', () => {
  const prevState = window.APH.state;
  window.APH.state = combatState({ scene:'expedition' });
  try {
    const far = mkRaidEnemy(1150, 200);
    window.APH.state.entities = [far];
    C.updateCombat(0.016, false);
    if (!far.dead) throw new Error('远征 950px 应回收');
  } finally {
    window.APH.state = prevState;
  }
});

test('updateCombat: 玩家弹丸跳过 isSoldier', () => {
  const prevState = window.APH.state;
  window.APH.state = combatState({ px:0, py:100 });
  try {
    const sol = mkRaidEnemy(120, 100, { isSoldier:true, hp:40, state:'idle' });
    const proj = C.makeProj(100, 100, 400, 0, 'player', 13);
    window.APH.state.entities = [sol, proj];
    C.updateCombat(0.05, false);
    if (sol.hp !== 40 || sol.dead) throw new Error('士兵不应被玩家弹击中');
  } finally {
    window.APH.state = prevState;
  }
});

test('updateCombat: 士兵不打玩家 / 只打袭击敌人', () => {
  const prevState = window.APH.state;
  const s = combatState({ scene:'home', px:200, py:200, hp:100, iFrameT:0 });
  window.APH.state = s;
  let hurt = 0;
  const onHurt = () => { hurt++; };
  U.on('playerHurt', onHurt);
  try {
    const sol = mkRaidEnemy(210, 200, {
      isSoldier:true, hp:40, maxHp:40, state:'chase', atkCd:0,
      faction:Object.assign({}, RAID_FACTION, { speed:120, dmg:6 }),
    });
    s.entities = [sol];
    C.updateCombat(0.016, false);
    if (s.hp !== 100 || hurt !== 0) throw new Error('无敌人时士兵不得打玩家');

    const foe = mkRaidEnemy(220, 200, { hp:40, state:'idle', atkCd:9 });
    s.entities = [sol, foe];
    sol.state = 'chase'; sol.atkCd = 0;
    C.updateCombat(0.02, false);
    if (s.hp !== 100 || hurt !== 0) throw new Error('有袭击者时士兵仍不得打玩家');
    if (foe.hp >= 40) throw new Error('士兵应打袭击敌人');
  } finally {
    U.off('playerHurt', onHurt);
    window.APH.state = prevState;
  }
});

test('updateCombat: 袭击者近战可打士兵致死', () => {
  const prevState = window.APH.state;
  /* 敌人 y 被 clamp ≥30; 与玩家同格则 focus 为玩家且处于 attackR 内 */
  window.APH.state = combatState({ scene:'home', px:80, py:80, colony:{ buildings:[] } });
  try {
    const sol = mkRaidEnemy(80, 80, { isSoldier:true, hp:5, maxHp:40, state:'idle' });
    const foe = mkRaidEnemy(80, 80, { hp:30, state:'attack', atkCd:0 });
    window.APH.state.entities = [sol, foe];
    C.updateCombat(0.02, false);
    if (!sol.dead && sol.hp>0) throw new Error('士兵应受伤或死亡, hp='+sol.hp);
  } finally {
    window.APH.state = prevState;
  }
});
test('updateCombat: 袭击者近战打伤附近居民且当摆不抢仓', () => {
  const prevState = window.APH.state;
  const r={id:'rs_a', name:'阿澈', illness:0, mood:80};
  window.APH.state = combatState({
    scene:'home', px:800, py:80,
    colony:{ buildings:[{id:'bl_warehouse',x:80,y:80}] },
    meta:{ res:{food:10, mineral:8}, residents:[r], stats:{kills:0,deaths:0} },
  });
  try {
    const foe = mkRaidEnemy(80, 80, { hp:30, state:'attack', atkCd:0 });
    const re = { id:'rs_a', rid:'rs_a', type:CFG.entType.RESIDENT, x:80, y:80, hurtCd:0 };
    window.APH.state.entities = [foe, re];
    C.updateCombat(0.02, false);
    if(r.illness!==18) throw new Error('应+18病: '+r.illness);
    if(r.mood!==68) throw new Error('心情应-12: '+r.mood);
    if(window.APH.state.meta.res.food!==10) throw new Error('打人当摆不应抢仓');
    if(!(re.hurtCd>0)) throw new Error('应进入受伤无敌帧');
  } finally {
    window.APH.state = prevState;
  }
});

test('raidBaseSuccess: 击毁敌对基地正常掉落战利品与保底遗件(零未定义错误)', () => {
  /* 自带最小 state fixture: tests/run.js 不加载 main.js(APH.state 的唯一定义点),
     单跑本文件时 state 不存在; 不依赖 colony.test.js 字母序先跑造成的全局泄漏 */
  const prevState = window.APH.state;
  window.APH.state = {
    entities: [], parts: [], war: { raids:0, wins:0 },
    meta: { stats: {} }, px: 0, py: 0, shake: 0,
    colony: { buildings: [] }, carry: {}, cry: 0, found: 0,
  };
  try {
    const s = window.APH.state;
    const base = {
      type: window.APH.CFG.entType.BUILDING,
      bid: 'bl_rival_base',
      x: 500, y: 500, hp: 1, dead: false,
      rivalId: 'rv_test', rivalName: '测试前哨',
    };
    s.entities = [
      { type: window.APH.CFG.entType.PLAYER, x: 0, y: 0 },
      base,
      C.makeProj(495, 500, 430, 0, 'player', 10)
    ];
    let emitted = false;
    window.APH.U.on('raidSuccess', data => { if(data.rivalId==='rv_test') emitted=true; });
    C.updateCombat(0.02, false);
    if (!base.dead) throw new Error('基地受击后应被摧毁');
    const drops = s.entities.filter(e => e.type === window.APH.CFG.entType.DROPPED);
    if (drops.length < 7) throw new Error('掠夺应掉落≥7件(6随机+1保底), got ' + drops.length);
    if (!drops.some(d => d.itemId === 'it_relic')) throw new Error('掠夺应包含保底遗件');
    if (!emitted) throw new Error('raidSuccess 事件未触发');
  } finally {
    window.APH.state = prevState;
  }
});


/* ============ P2b 工兵拆陷阱 (#95) ============ */
test('#95 pathHasTrap: 路径途经待触发陷阱格 → true', () => {
  const traps=[{id:'bl_spike_trap', x:1000, y:1000, armed:true}];
  const path=[{x:952,y:952},{x:1000,y:1000},{x:1048,y:1048}];
  if(!C.pathHasTrap(path, traps, 48)) throw new Error('路径应途经陷阱(1000,1000)格');
  const path2=[{x:952,y:952},{x:1048,y:1048}];
  if(C.pathHasTrap(path2, traps, 48)) throw new Error('绕行路径不应报陷阱');
});
test('#95 pathHasTrap: 已触发陷阱不算 (可踩无伤)', () => {
  const traps=[{id:'bl_spike_trap', x:1000, y:1000, armed:false}];
  const path=[{x:952,y:952},{x:1000,y:1000},{x:1048,y:1048}];
  if(C.pathHasTrap(path, traps, 48)) throw new Error('已触发陷阱不算堵点');
});
test('#95 strikeTrap: 拆陷阱=移除记录+掉落石料+armed清', () => {
  /* 需 world 桩: spawnDrop 用 APH.state; 造最小桩 */
  const prevState=window.APH.state;
  window.APH.state={ colony:{ buildings:[{id:'bl_spike_trap', x:500,y:500, armed:true}] }, parts:[], meta:{}, };
  const trap=window.APH.state.colony.buildings[0];
  const en={x:490,y:500,faction:{dmg:6}};
  const r=C.strikeTrap(en, trap, window.APH.state);
  if(r!==true) throw new Error('应拆成功');
  if(window.APH.state.colony.buildings.length!==0) throw new Error('陷阱记录应移除');
  window.APH.state=prevState;
});
test('#95 strikeTrap: 已触发(armed=false)不拆', () => {
  const prevState=window.APH.state;
  const trap={id:'bl_spike_trap', x:500,y:500, armed:false};
  window.APH.state={ colony:{ buildings:[trap] }, parts:[], meta:{} };
  const r=C.strikeTrap({x:0,y:0}, trap, window.APH.state);
  if(r!==false) throw new Error('已触发不应拆');
  if(window.APH.state.colony.buildings.length!==1) throw new Error('记录应保留');
  window.APH.state=prevState;
});
