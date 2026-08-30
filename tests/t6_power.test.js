/* T6 电网核心 (ADR-14: 实体导线电力网) — 匹配 worker 实现的接口
   seams: APH.Colony.{powerNets(BFS), powerSettle(供电结算), solarMulOf}
   期望值手工推导。 */
'use strict';
const C = window.APH.Colony;
const W = window.APH.Weather;
/* powerNets 返回 {groups:[...]} (对象包裹) */
function netsOf(bs){ const r = C.powerNets(bs); return (r && r.groups) || []; }

/* ---------- 建筑目录 ---------- */
test('BUILDINGS: 电网四建筑注册, 导线1x1格, 发电/电池有科技', () => {
  const cd = C.get('bl_conduit'), gen = C.get('bl_wood_generator'),
        sol = C.get('bl_solar_panel'), bat = C.get('bl_battery');
  if (!cd || !gen || !sol || !bat) throw new Error('缺电网建筑');
  const cc = cd.cells || [1,1];
  if (cc[0] !== 1 || cc[1] !== 1) throw new Error('导线应1x1: '+JSON.stringify(cc));
  if (!gen.reqTech || !sol.reqTech || !bat.reqTech) throw new Error('应挂科技');
});

/* ---------- powerNets: BFS 连网 ---------- */
test('powerNets: 发电机-导线-炮塔 成一组且节点齐全', () => {
  const bs = [
    { id:'bl_wood_generator', x:0, y:0 },
    { id:'bl_conduit', x:48, y:0 },
    { id:'bl_turret', x:96, y:0 },
  ];
  const nets = netsOf(bs);
  if (nets.length !== 1) throw new Error('应1网: '+nets.length);
  const n = nets[0];
  if (!n.gens || n.gens.length !== 1) throw new Error('网应有发电机: '+JSON.stringify(n.gens));
  if (!n.cons || !n.cons.some(c2 => c2.id==='bl_turret')) throw new Error('网应有炮塔: '+JSON.stringify(n.cons));
});

test('powerNets: 断线失联→2网分离', () => {
  const bs = [
    { id:'bl_wood_generator', x:0, y:0 },
    { id:'bl_conduit', x:48, y:0 },
    { id:'bl_turret', x:144, y:0 },   // (96,0) 无导线 = 缺口
  ];
  const nets = netsOf(bs);
  if (nets.length < 2) throw new Error('应分离: '+nets.length);
});

test('powerNets: 孤立导线不成网(无节点)', () => {
  const bs = [{ id:'bl_conduit', x:48, y:48 }];
  const arr = netsOf(bs);
  if (arr.some(g => (g.gens||[]).length || (g.cons||[]).length)) throw new Error('孤立导线不应有节点');
});

test('powerNets: 蓄电池并网(经导线)', () => {
  const bs = [
    { id:'bl_solar_panel', x:0, y:0 },
    { id:'bl_conduit', x:72, y:0 },
    { id:'bl_battery', x:144, y:0 },
  ];
  const nets = netsOf(bs);
  const n = nets && nets[0];
  if (!n) throw new Error('应有一网');
  const bats = n.bats || [];
  if (!bats.length) throw new Error('网应有电池: '+JSON.stringify(n));
});

/* ---------- powerSettle: 供电结算 ---------- */
test('powerSettle: 满供→active, 无shed', () => {
  const bs = [
    { id:'bl_wood_generator', x:0, y:0 },
    { id:'bl_conduit', x:48, y:0 },
    { id:'bl_turret', x:96, y:0 },
  ];
  const r = C.powerSettle(bs, { wood: 99 }, {}, 1, { solarMul:1, isDay:true });
  if (r.active !== true) throw new Error('应供电: '+JSON.stringify(r));
  if (r.shed && r.shed.length) throw new Error('不应停机: '+JSON.stringify(r.shed));
  if (!(r.loadW > 0)) throw new Error('应有负载: '+r.loadW);
});

test('powerSettle: 供不应求→优先级停机(炮塔保供, 低prio停)', () => {
  // 太阳能夜间0 + 无火电 + 电池空 → 炮塔(prio1) 与 灯(prio2) 都停? 构造: 仅灯在网, 产能0
  const bs = [
    { id:'bl_solar_panel', x:0, y:0 },
    { id:'bl_conduit', x:48, y:0 },
    { id:'bl_lamp', x:96, y:0 },
  ];
  const r = C.powerSettle(bs, {}, { charge:{}, grace:{} }, 1, { solarMul:1, isDay:false });
  // 有网但产能0: 夜景灯应被切 (status['96,0'].powered===false); active=网在运转
  const st = r.status && r.status['96,0'];
  if (!st || st.powered !== false) throw new Error('灯应停机: '+JSON.stringify(r));
  if (!(r.shed && r.shed.length)) throw new Error('应记录停机: '+JSON.stringify(r.shed));

});

test('powerSettle: 零发电机=未激活(默认通电)', () => {
  const bs = [{ id:'bl_turret', x:0, y:0 }];
  const r = C.powerSettle(bs, {}, {}, 1, {});
  const st = (r.status && r.status['0,0']) || {};
  if (st.grid !== false || st.powered !== true) throw new Error('未激活应 grid:false+powered:true: '+JSON.stringify(st));
});

test('powerSettle: 电池兜底(耗尽前供电, 用尽后停)', () => {
  // 无发电, 只有电池(满) + 炮塔
  const bs = [
    { id:'bl_battery', x:0, y:0 },
    { id:'bl_conduit', x:48, y:0 },
    { id:'bl_turret', x:96, y:0 },
  ];
  const power = { charge:{ '0,0': 100 }, grace:{} };
  const r1 = C.powerSettle(bs, {}, power, 1, {});
  const st1 = r1.status && r1.status['96,0'];
  if (!st1 || st1.powered !== true) throw new Error('电池满应供电: '+JSON.stringify(r1));
});

/* ---------- 太阳能板 × 天气 ---------- */
test('solarMulOf: 读天气 solarMul(雨0.5)', () => {
  const m = { weather: { id: 'wx_rain', t: 0 } };
  const mul = C.powerSolarMulOf(m);
  if (mul !== 0.5) throw new Error('雨应0.5: '+mul);
});
test('solarMulOf: 老档无天气→晴1', () => {
  const mul = C.powerSolarMulOf({});
  if (mul !== 1) throw new Error('默认应1: '+mul);
});
