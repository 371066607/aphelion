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
