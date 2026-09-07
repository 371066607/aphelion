/* save.js + planet.js + utils 的核心行为测试 */
'use strict';
const U = window.APH.U, Save = window.APH.Save, Planet = window.APH.Planet;

/* ---------- utils ---------- */
test('mulberry32 同 seed 同序列(ADR-5 确定性)', () => {
  const a = U.makeRng(12345), b = U.makeRng(12345);
  for (let i = 0; i < 50; i++) {
    if (a() !== b()) throw new Error('序列不一致 @' + i);
  }
});
test('makeRng 不同 seed 序列不同', () => {
  let diff = false;
  const a = U.makeRng(1), b = U.makeRng(2);
  for (let i = 0; i < 20; i++) { if (a() !== b()) { diff = true; break; } }
  if (!diff) throw new Error('不同 seed 产出相同序列');
});
test('事件总线 on/emit/off (ADR-8)', () => {
  let n = 0;
  const fn = () => n++;
  U.on('t_evt', fn);
  U.emit('t_evt'); U.emit('t_evt');
  if (n !== 2) throw new Error('emit 未触达: ' + n);
  U.off('t_evt', fn);
  U.emit('t_evt');
  if (n !== 2) throw new Error('off 失效: ' + n);
});
test('事件总线单监听者抛错不拖垮其他', () => {
  let ok = false;
  U.on('t_err', () => { throw new Error('boom'); });
  U.on('t_err', () => { ok = true; });
  U.emit('t_err');
  if (!ok) throw new Error('第二个监听者未执行');
});

/* ---------- save ---------- */
test('meta 默认结构与写读一致 (ADR-2)', () => {
  const m1 = Save.loadMeta();
  if (m1.v !== 1) throw new Error('默认 meta 应带 v=1, got ' + m1.v);
  if (Array.isArray(m1.tech) || typeof m1.tech !== 'object')
    throw new Error('meta.tech 应为 Object 而非 Array: ' + typeof m1.tech);
  if (!m1.res || m1.res.leather === undefined || m1.res.med === undefined)
    throw new Error('meta.res 应初始化包含 leather/med');
  if ((m1.res.mineral||0) < 100)
    throw new Error('开局应赠矿材, got '+m1.res.mineral);
  if (!m1.war || m1.war.wins===undefined)
    throw new Error('meta.war 应初始化');
  m1.research = 42;
  m1.tech.te_weaponry = 2;
  Save.saveMeta(m1);
  const m2 = Save.loadMeta();
  if (m2.research !== 42) throw new Error('research 未持久化');
  if (m2.tech.te_weaponry !== 2) throw new Error('tech 键值对象未持久化');
  if (!m2.playerNeeds || m2.playerNeeds.food == null) throw new Error('旧档应补 playerNeeds.food');
  if (m2.playerNeeds.rest == null) throw new Error('旧档应补 playerNeeds.rest');
  if (m2.playerNeeds.illness == null) throw new Error('旧档应补 playerNeeds.illness');
});
test('exo_suit 迁 te_exosuit, 战争并入 meta', () => {
  Save.saveMeta({ v:1, tech:{ exo_suit:2 }, res:{mineral:3,food:0,leather:0}, stats:{landings:0,deaths:0,kills:0,scans:0,playSec:0} });
  const m = Save.loadMeta();
  if (m.tech.te_exosuit !== 2) throw new Error('外骨骼应迁 te_exosuit, got '+JSON.stringify(m.tech));
  if (m.tech.exo_suit) throw new Error('旧 exo_suit 应删除');
  if (!m.war) throw new Error('应有 war');
  if ((m.res.mineral||0) < 100) throw new Error('旧档应补开局矿, got '+m.res.mineral);
});
test('planet 缓存读写与按 id 隔离', () => {
  Save.savePlanet('P_AAA', { id: 'P_AAA', laws: [1, 2] });
  Save.savePlanet('P_BBB', { id: 'P_BBB', laws: [] });
  if (Save.loadPlanet('P_AAA').laws.length !== 2) throw new Error('AAA 数据错误');
  if (Save.loadPlanet('P_BBB').laws.length !== 0) throw new Error('BBB 数据错误');
  if (Save.loadPlanet('P_CCC') !== null) throw new Error('不存在的 planet 应为 null');
});
test('损坏 JSON 视为不存在而非崩溃', () => {
  localStorage.setItem('aphelion_planet_P_BAD', '{oops not json');
  const r = Save.loadPlanet('P_BAD');
  if (r !== null) throw new Error('应返回 null, got ' + JSON.stringify(r));
});
test('migrate 把 v0 推进到当前版本', () => {
  const out = Save.migrate({ foo: 1 });
  if (out.v !== 1) throw new Error('v0 应回填为 v1');
});

/* ---------- planet ---------- */
test('fallbackPlanet 同 seed 完全一致(星球可复现)', () => {
  const p1 = Planet.fallbackPlanet(777), p2 = Planet.fallbackPlanet(777);
  if (JSON.stringify(p1) !== JSON.stringify(p2)) throw new Error('同 seed 星球不同!');
});
test('PlanetSpec 满足 ADR-1 契约字段', () => {
  const p = Planet.fallbackPlanet(42);
  for (const k of ['id', 'seed', 'name', 'palette', 'terrain', 'laws', 'beacons', 'enemies', 'rivals']) {
    if (!(k in p)) throw new Error('缺字段: ' + k);
  }
  if (!Array.isArray(p.beacons) || p.beacons.length !== 6) throw new Error('信标应为6座');
  p.beacons.forEach((b, i) => {
    if (typeof b.x !== 'number' || typeof b.y !== 'number') throw new Error('信标坐标非法@' + i);
    if (!b.id.startsWith('bk_')) throw new Error('信标 id 前缀违规(ADR-9)');
  });
  if (!p.laws.every(l => l.id.startsWith('lw_'))) throw new Error('法则 id 前缀违规');
  if (!p.rivals.every(r => r.id.startsWith('rv_'))) throw new Error('敌殖民 id 前缀违规');
});
test('enemies 契约: 3阵营/基因字段/权重归一', () => {
  const p = Planet.fallbackPlanet(555);
  const E = p.enemies;
  if (!Array.isArray(E.factions) || E.factions.length !== 3) throw new Error('应为3阵营');
  const ids = new Set(E.factions.map(f => f.id));
  if (ids.size !== 3) throw new Error('阵营 id 重复');
  for (const f of E.factions) {
    if (!f.id.startsWith('fx_')) throw new Error('fx_ 前缀违规: ' + f.id);
    const g = f.gene;
    for (const k of ['hue','sides','limbs','size','spikes','eyes'])
      if (typeof g[k] !== 'number') throw new Error(f.id+' 缺基因.'+k);
    if (!(f.hp > 0 && f.speed > 0 && f.dmg > 0)) throw new Error(f.id+' 数值非法');
    if (!['melee_swarm','spitter','tank'].includes(f.behavior))
      throw new Error(f.id+' 未知 behavior: '+f.behavior);
  }
  const wsum = Object.values(E.weights).reduce((a, b) => a+b, 0);
  if (Math.abs(wsum - 1) > .01) throw new Error('权重和≠1: '+wsum);
});
test('pickRaidFaction: 空阵营不抛错且给出真阵营, 不写回 spec', () => {
  const empty = { enemies: { factions: [], weights: {} } };
  const f = Planet.pickRaidFaction(empty, 123);
  if (!f || !(f.hp > 0) || !f.gene) throw new Error('应返回可用阵营');
  if (!f.id || !String(f.id).startsWith('fx_')) throw new Error('阵营 id 前缀违规: '+(f && f.id));
  if (empty.enemies.factions.length !== 0) throw new Error('不得把野怪写进传入 spec');
});

test('pickRaidFaction: 优先使用上次远征阵营', () => {
  const last = Planet.fallbackPlanet(99);
  last.enemies.factions = [{ id:'fx_maw', name:'测试种', behavior:'melee_swarm',
    gene:{hue:1,sides:5,limbs:6,size:1,spikes:1,eyes:2}, hp:33, speed:10, dmg:2, nightBoost:1 }];
  const f = Planet.pickRaidFaction(last, 1);
  if (f.name !== '测试种' || f.hp !== 33) throw new Error('应优先上次远征: '+JSON.stringify(f));
});

test('validate 拒绝残缺 spec、接受合法 spec', () => {
  if (Planet.validate({}).ok) throw new Error('空对象应被拒');
  const good = Planet.validate(Planet.fallbackPlanet(9));
  if (!good.ok) throw new Error('合法 spec 被误拒: ' + good.errors.join(','));
});
test('hasLaw: 按 id 判断', () => {
  if (Planet.hasLaw(null, 'lw_echo')) throw new Error('空 spec 应为假');
  if (!Planet.hasLaw({ laws:[{id:'lw_echo'}] }, 'lw_echo')) throw new Error('应命中');
  if (Planet.hasLaw({ laws:[{id:'lw_echo'}] }, 'lw_spore_light')) throw new Error('不应命中');
});
test('sporeNudge: 近距排开, 中距趋光', () => {
  const near={x:100,y:100};
  Planet.sporeNudge(near, 100, 100, 1);
  if (near.x===100 && near.y===100) throw new Error('贴身应排开');
  const mid={x:0,y:0};
  Planet.sporeNudge(mid, 100, 0, 1);
  if (!(mid.x>0)) throw new Error('中距应趋光靠近: '+mid.x);
  const far={x:400,y:400};
  Planet.sporeNudge(far, 1200, 400, 1);
  if (far.x!==400 || far.y!==400) throw new Error('远距不应动: '+far.x);
});
test('信标间距与禁区(离基地>220 / 离湖>200)', () => {
  const p = Planet.fallbackPlanet(2024);
  const HAB = APH.CFG.HAB, LAKE = APH.CFG.LAKE;
  p.beacons.forEach(b => {
    if (U.dst(b.x, b.y, HAB.x, HAB.y) < 220) throw new Error('信标离基地过近');
    if (U.dst(b.x, b.y, LAKE.x, LAKE.y) < 200) throw new Error('信标离湖过近');
  });
});

/* ---------- save.js: 迁移边界 (2026-09-07 复盘) ---------- */
test('save: 合法 JSON 但不是存档对象 → 当损坏处理, 不抛错', () => {
  const V = APH.CFG.save.VERSION;
  ['123', '"hello"', 'null', '[1,2,3]'].forEach(bad => {
    localStorage.setItem(APH.CFG.save.KEY_META, bad);
    let m;
    try { m = APH.Save.loadMeta(); }
    catch (e) { throw new Error('损坏存档 ' + bad + ' 不应抛错: ' + e.message); }
    if (!m || typeof m !== 'object') throw new Error('应回退成全新存档: ' + bad);
    if (m.v !== V) throw new Error('全新存档应带当前版本号');
  });
  localStorage.removeItem(APH.CFG.save.KEY_META);
});

test('save: 未来版本存档抛错, 且绝不把版本号改回来', () => {
  const V = APH.CFG.save.VERSION;
  const future = { v: V + 5, research: 999, futureField: 'keepme' };
  let threw = false;
  try { APH.Save.migrate(future); }
  catch (e) { threw = true; if (e.aphSaveVersion !== V + 5) throw new Error('错误应带原始版本号'); }
  if (!threw) throw new Error('未来版本应抛错(宁可失败不可静默丢数据)');
  if (future.v !== V + 5) throw new Error('未来存档的版本号不得被下调, got ' + future.v);
  if (future.futureField !== 'keepme') throw new Error('未来存档的数据不得被改动');
});

test('save: 正常迁移链仍然推进版本号', () => {
  const V = APH.CFG.save.VERSION;
  const old = { research: 7 };            // v0: 无版本号
  const out = APH.Save.migrate(old);
  if (!out || out.v !== V) throw new Error('v0 应迁到当前版本, got ' + (out && out.v));
  if (out.research !== 7) throw new Error('迁移不得丢数据');
  if (!APH.Save.isFutureSave({ v: V + 1 })) throw new Error('isFutureSave 应识别未来版本');
  if (APH.Save.isFutureSave({ v: V })) throw new Error('当前版本不是未来版本');
});

/* ---------- ADR-39: 局内存档从 main 搬进 Save/Colony/Rivals ---------- */

test('ADR-39 save: 殖民地存档往返, 且带上当前版本号', () => {
  const colony = { buildings: [{ id: 'bl_house', x: 10, y: 20 }], builtAt: 123, ground: [] };
  APH.Save.saveColony(colony);
  const back = APH.Save.loadColony();
  if (!back || !Array.isArray(back.buildings)) throw new Error('应读回殖民地');
  if (back.buildings.length !== 1 || back.buildings[0].id !== 'bl_house')
    throw new Error('建筑清单不得丢失');
  if (back.v !== APH.CFG.save.VERSION) throw new Error('应带当前版本号, got ' + back.v);
  if (back.buildings[0].lv !== 1) throw new Error('缺省等级应补成 1');
});

test('ADR-39 save: 无存档时给出空殖民地而不是 null', () => {
  const fresh = APH.Save.loadColony();
  if (!fresh || !Array.isArray(fresh.buildings) || fresh.buildings.length)
    throw new Error('无存档应回退成空殖民地');
});

test('ADR-39 save: 势力关系是数组, 往返不被 migrate 判成损坏', () => {
  const list = [{ rival: { name: '灰隼', trait: 'raider' }, anger: 5, relation: -20, cowedTime: 0, pact: false }];
  APH.Save.saveRivalStates(list);
  const back = APH.Save.loadRivalStates();
  if (!Array.isArray(back)) throw new Error('数组存档应原样读回, got ' + JSON.stringify(back));
  if (back.length !== 1 || back[0].anger !== 5) throw new Error('关系数据不得丢失');
  APH.Save.saveRivalStates('not an array');
  if (JSON.stringify(APH.Save.loadRivalStates()) !== JSON.stringify(back))
    throw new Error('非数组入参应被拒绝, 不得覆盖已有存档');
});

test('ADR-39 colony: persist 落盘前把地上堆序列化进 colony.ground', () => {
  const prev = APH.state;
  APH.state = {
    colony: { buildings: [], builtAt: 1, ground: [] },
    entities: [{ type: APH.CFG.entType.DROPPED, itemId: 'it_food', x: 5, y: 6, n: 3 }],
  };
  try {
    APH.Colony.persist();
    const back = APH.Save.loadColony();
    const expect = APH.Colony.serializeGround(APH.state.entities);
    if (!expect.length) throw new Error('用例前提失效: 地上堆应被序列化出至少一条');
    if (JSON.stringify(back.ground) !== JSON.stringify(expect))
      throw new Error('落盘的 ground 应等于 serializeGround 的结果');
  } finally { APH.state = prev; }
});

test('ADR-39 rivals: 首次 hydrate 从星球 spec 建表并立刻落盘', () => {
  const prev = APH.state;
  APH.state = { seed: 12345, rivalStates: null };
  try {
    const list = APH.Rivals.hydrateStates();
    if (!Array.isArray(list) || !list.length) throw new Error('应从 spec 初始化出势力');
    list.forEach(r => {
      if (typeof r.relation !== 'number') throw new Error('每个势力都要有初始关系值');
      if (r.cowedTime !== 0 || r.pact !== false) throw new Error('新势力的畏缩/通商应归零');
    });
    if (!APH.Save.loadRivalStates()) throw new Error('首次初始化后应立刻落盘');
  } finally { APH.state = prev; }
});

test('ADR-39 rivals: 老存档缺字段时 hydrate 补齐, 不丢已有关系', () => {
  const prev = APH.state;
  APH.Save.saveRivalStates([{ rival: { name: '灰隼', trait: 'raider' }, anger: 9 }]);
  APH.state = { seed: 12345, rivalStates: null };
  try {
    const list = APH.Rivals.hydrateStates();
    if (list.length !== 1 || list[0].anger !== 9) throw new Error('已有数据不得被 spec 覆盖');
    if (typeof list[0].relation !== 'number') throw new Error('缺失的 relation 应按性格补齐');
    if (list[0].cowedTime !== 0 || list[0].pact !== false) throw new Error('缺失字段应补默认值');
  } finally { APH.state = prev; }
});

test('ADR-39 colony: haveStock 算上地上堆(ui 那份 fallback 曾漏掉)', () => {
  const prev = APH.state;
  APH.state = {
    meta: { res: { food: 4 } },
    entities: [{ type: APH.CFG.entType.DROPPED, itemId: 'it_food', x: 1, y: 1, n: 3 }],
  };
  try {
    const ground = APH.Colony.groundCount(APH.state.entities, 'food');
    if (ground !== 3) throw new Error('地上应有 3 份口粮, got ' + ground);
    if (APH.Colony.haveStock('food') !== 4 + ground)
      throw new Error('haveStock 应为 仓 + 地上堆, got ' + APH.Colony.haveStock('food'));
    if (APH.Colony.haveStock('nonexistent') !== 0) throw new Error('未知资源应为 0');
  } finally { APH.state = prev; }
});

test('ADR-39 colony: playerDefPower 随炮塔与等离子科技增长', () => {
  const prev = APH.state;
  APH.state = { colony: { buildings: [] }, meta: { tech: {} } };
  try {
    if (APH.Colony.playerDefPower() !== 10) throw new Error('无炮塔无科技时应为基准 10');
    APH.state.colony.buildings = [{ id: 'bl_turret' }, { id: 'bl_turret' }, { id: 'bl_house' }];
    if (APH.Colony.playerDefPower() !== 10 + 24) throw new Error('每座炮塔 +12');
    APH.state.meta.tech = { te_weaponry: 2 };
    if (APH.Colony.playerDefPower() !== 10 + 24 + 10) throw new Error('等离子每级 +5');
  } finally { APH.state = prev; }
});

/* ---------- ADR-40: 模拟层只发事件, 不直接驱动视图 ---------- */

function captureBus(events, fn){
  const seen = [];
  const subs = events.map(evt => [evt, APH.U.on(evt, p => seen.push({ evt, p }))]);
  try { fn(); } finally { subs.forEach(([evt, h]) => APH.U.off(evt, h)); }
  return seen;
}

test('ADR-40 combat: 袭击溃退发 notice, 载荷是 {text,color}', () => {
  const s = { war: { routed: false, wave: null, siege: null }, entities: [], parts: [] };
  const seen = captureBus(['notice', 'raidEnded'], () => {
    APH.Combat.raidRetreat(s, '✔ 袭击被击退!', false);
  });
  const notice = seen.find(x => x.evt === 'notice');
  if (!notice) throw new Error('溃退应发 notice');
  if (notice.p.text !== '✔ 袭击被击退!') throw new Error('文案应原样带出, got ' + notice.p.text);
  if (typeof notice.p.color !== 'string' || notice.p.color[0] !== '#')
    throw new Error('颜色应是色值, got ' + notice.p.color);
  if (!seen.find(x => x.evt === 'raidEnded')) throw new Error('ADR-38 的 raidEnded 不应被弄丢');
});

test('ADR-40 combat: 玩家死亡发 death, 载荷是 {reason,stats}', () => {
  const prev = APH.state;
  APH.state = {
    hp: 1, mode: 'running', clock: 100, landedAt: 10, cry: 0, found: 0, totalBeacons: 3,
    carry: {}, runLoot: {}, entities: [], parts: [],
    meta: { stats: { deaths: 0 }, playerNeeds: {} },
  };
  try {
    const seen = captureBus(['death', 'gameOver'], () => APH.Combat.hurtPlayer(99, '酸雨'));
    const death = seen.find(x => x.evt === 'death');
    if (!death) throw new Error('玩家死亡应发 death');
    if (String(death.p.reason).indexOf('酸雨') < 0) throw new Error('死因应带来源, got ' + death.p.reason);
    if (!death.p.stats || typeof death.p.stats.survived !== 'number')
      throw new Error('结算数据应挂在 stats 上');
    if (!seen.find(x => x.evt === 'gameOver')) throw new Error('gameOver 不应被弄丢');
  } finally { APH.state = prev; }
});

test('ADR-40: 无人订阅时模拟层照跑(无头/测试环境)', () => {
  const s = { war: { routed: false, wave: null, siege: null }, entities: [], parts: [] };
  APH.Combat.raidRetreat(s, '没人听也不该炸', false);   // 不抛错即通过
});

test('ADR-40: 单个订阅者抛错不拖垮模拟层', () => {
  const bad = APH.U.on('notice', () => { throw new Error('订阅者炸了'); });
  try {
    const s = { war: { routed: false, wave: null, siege: null }, entities: [], parts: [] };
    APH.Combat.raidRetreat(s, '订阅者出错', false);      // U.emit 内部 try/catch 兜住
  } finally { APH.U.off('notice', bad); }
});

/* ---------- ADR-42: 生产跳独立成 APH.ColonyTick ---------- */

test('ADR-42 colonyTick: 跳末发 productionTick, 让订阅者去做杂事', () => {
  const prev = APH.state;
  APH.state = {
    scene: 'home', mode: 'running', clock: 100, entities: [], parts: [],
    colony: { buildings: [] },
    meta: { residents: [], res: {}, tech: {}, bonds: {}, stats: {},
            playerNeeds: { food: 80, rest: 100, illness: 0 } },
  };
  let fired = 0;
  const h = APH.U.on('productionTick', () => fired++);
  try {
    APH.ColonyTick.run();
    if (fired !== 1) throw new Error('生产跳应发且只发一次 productionTick, got ' + fired);
  } finally { APH.U.off('productionTick', h); APH.state = prev; }
});

test('ADR-42 colonyTick: 覆灭判定 —— 立过殖民地再归零才算输', () => {
  const prev = APH.state;
  const base = () => ({
    scene: 'home', mode: 'running', clock: 100, landedAt: 0, cry: 0, found: 0,
    totalBeacons: 3, carry: {}, runLoot: {}, entities: [], parts: [],
    colony: { buildings: [] },
    meta: { residents: [], res: {}, tech: {}, bonds: {}, stats: {}, playerNeeds: {} },
  });
  try {
    /* 从没立过殖民地 → 不算覆灭 */
    APH.state = base();
    if (APH.ColonyTick.checkFall() !== false) throw new Error('没立过就不算覆灭');
    if (APH.state.mode !== 'running') throw new Error('不该改 mode');

    /* 立过, 但人还在 → 不算 */
    APH.state = base();
    APH.state.meta.residents = [{ id: 'r1', name: '老张' }];
    APH.ColonyTick.founded(APH.state.meta);
    if (APH.ColonyTick.checkFall() !== false) throw new Error('还有人活着就不算覆灭');

    /* 立过且归零 → 覆灭, 且发 death + gameOver */
    APH.state.meta.residents = [];
    const seen = [];
    const h1 = APH.U.on('death', p => seen.push(['death', p]));
    const h2 = APH.U.on('gameOver', () => seen.push(['gameOver']));
    try {
      if (APH.ColonyTick.checkFall() !== true) throw new Error('立过再归零应判覆灭');
      if (APH.state.mode !== 'dead') throw new Error('覆灭后 mode 应为 dead');
      const d = seen.find(x => x[0] === 'death');
      if (!d) throw new Error('应发 death 事件');
      if (!d[1].stats.colonyFall) throw new Error('结算页要知道这是覆灭结局, 不是战死');
      if (!seen.find(x => x[0] === 'gameOver')) throw new Error('gameOver 不应被弄丢');
      /* 不重复结算 */
      seen.length = 0;
      APH.state.mode = 'running';
      if (APH.ColonyTick.checkFall() !== false) throw new Error('已结算过不应重复');
      if (seen.length) throw new Error('重复调用不应再发事件');
    } finally { APH.U.off('death', h1); APH.U.off('gameOver', h2); }
  } finally { APH.state = prev; }
});

test('ADR-42 colonyTick: 无人订阅时生产跳照跑', () => {
  const prev = APH.state;
  APH.state = {
    scene: 'home', mode: 'running', clock: 100, entities: [], parts: [],
    colony: { buildings: [] },
    meta: { residents: [], res: {}, tech: {}, bonds: {}, stats: {},
            playerNeeds: { food: 80, rest: 100, illness: 0 } },
  };
  try { APH.ColonyTick.run(); }             // 不抛错即通过
  finally { APH.state = prev; }
});
