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
  m1.research = 42;
  Save.saveMeta(m1);
  const m2 = Save.loadMeta();
  if (m2.research !== 42) throw new Error('research 未持久化');
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
  for (const k of ['id', 'seed', 'name', 'palette', 'terrain', 'laws', 'beacons', 'rivals']) {
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
test('validate 拒绝残缺 spec、接受合法 spec', () => {
  if (Planet.validate({}).ok) throw new Error('空对象应被拒');
  const good = Planet.validate(Planet.fallbackPlanet(9));
  if (!good.ok) throw new Error('合法 spec 被误拒: ' + good.errors.join(','));
});
test('信标间距与禁区(离基地>220 / 离湖>200)', () => {
  const p = Planet.fallbackPlanet(2024);
  const HAB = APH.CFG.HAB, LAKE = APH.CFG.LAKE;
  p.beacons.forEach(b => {
    if (U.dst(b.x, b.y, HAB.x, HAB.y) < 220) throw new Error('信标离基地过近');
    if (U.dst(b.x, b.y, LAKE.x, LAKE.y) < 200) throw new Error('信标离湖过近');
  });
});
