'use strict';
const Res = window.APH.Res;
const CFG = window.APH.CFG;

test('#171 thoughts: 目录至少 20 条', () => {
  const cat = CFG.thoughts || {};
  const n = Object.keys(cat).length;
  if (n < 20) throw new Error('念头目录应≥20, 实际: ' + n);
  Object.keys(cat).forEach(function(id){
    if (id.indexOf('th_') !== 0) throw new Error('念头 id 应 th_ 前缀: ' + id);
    if (!cat[id].text) throw new Error(id + ' 缺文案');
    if (typeof cat[id].mood !== 'number') throw new Error(id + ' 缺心情');
  });
});

test('#171 thoughts: collectThoughts 导出', () => {
  if (typeof Res.collectThoughts !== 'function') throw new Error('缺失 collectThoughts');
});

test('#171 thoughts: 饥饿点亮肚子饿', () => {
  const list = Res.collectThoughts({ food: 40, rest: 80, recreation: 80 });
  if (!list.some(t => t.id === 'th_hungry')) throw new Error('food=40 应饥饿: ' + JSON.stringify(list));
  if (list.some(t => t.id === 'th_well_fed')) throw new Error('不该同时吃饱');
});

test('#171 thoughts: 地铺与床互斥', () => {
  const floor = Res.collectThoughts({ isSleeping: true, bedId: null, food: 80, rest: 40, recreation: 80 });
  if (!floor.some(t => t.id === 'th_floor_sleep')) throw new Error('无床睡眠应打地铺');
  const bed = Res.collectThoughts({ isSleeping: true, bedId: 'bed_1', food: 80, rest: 40, recreation: 80 });
  if (!bed.some(t => t.id === 'th_slept_bed')) throw new Error('有床应舒服');
  if (bed.some(t => t.id === 'th_floor_sleep')) throw new Error('有床不应打地铺');
});

test('#171 thoughts: 无聊与袭击', () => {
  const list = Res.collectThoughts(
    { food: 80, rest: 80, recreation: 10 },
    { raid: true }
  );
  if (!list.some(t => t.id === 'th_bored')) throw new Error('应无聊');
  if (!list.some(t => t.id === 'th_raid')) throw new Error('应袭击');
});

test('#171 thoughts: 心情合计是各条之和', () => {
  const list = Res.collectThoughts({ food: 20, rest: 10, recreation: 80, downed: true });
  const sum = Res.thoughtMoodSum(list);
  const expect = list.reduce((a, t) => a + t.mood, 0);
  if (sum !== expect) throw new Error('合计应 ' + expect + ', 实际: ' + sum);
});

/* ---------- ADR-31: 念头驱动心情 ---------- */
test('#ADR31 mood: needsTick 把念头清单挂到 pawn 上(检查器与模拟同源)', () => {
  const r = Res.generate('adr31_a', 1);
  r.food = 90; r.rest = 90; r.recreation = 90; r.mood = 70;
  Res.needsTick(r, false, {});
  if (!Array.isArray(r.thoughts)) throw new Error('needsTick 应挂上 r.thoughts');
  if (r.moodTarget == null) throw new Error('needsTick 应挂上 r.moodTarget');
  const sum = Res.thoughtMoodSum(r.thoughts);
  const base = APH.CFG.residents.moodBase;
  const cap = APH.CFG.residents.moodCap;
  const expect = Math.min(cap, Math.max(0, base + sum));
  if (Math.abs(r.moodTarget - expect) > 0.001)
    throw new Error('moodTarget 应=基线+念头之和: ' + r.moodTarget + ' vs ' + expect);
});

test('#ADR31 mood: 心情向念头目标缓动收敛, 不会一跳到位', () => {
  const r = Res.generate('adr31_b', 2);
  r.food = 90; r.rest = 90; r.recreation = 90; r.mood = 0;
  Res.needsTick(r, false, {});
  const first = r.mood;
  if (!(first > 0)) throw new Error('应向目标上行');
  if (first >= r.moodTarget) throw new Error('一跳不应直接到达目标: ' + first);
  for (let i = 0; i < 40; i++) { r.food = 90; r.rest = 90; r.recreation = 90; Res.needsTick(r, false, {}); }
  if (Math.abs(r.mood - r.moodTarget) > 1)
    throw new Error('多跳后应收敛到目标: ' + r.mood + ' vs ' + r.moodTarget);
});

test('#ADR31 mood: 上下文里的房间/同室念头带可变幅度', () => {
  const r = Res.generate('adr31_c', 3);
  r.food = 70; r.rest = 70; r.recreation = 50; r.mood = 70;
  Res.needsTick(r, false, { roomMood: 6, roomFriction: -5 });
  const room = (r.thoughts || []).find(t => t.id === 'th_room');
  const mate = (r.thoughts || []).find(t => t.id === 'th_roommate');
  if (!room || room.mood !== 6) throw new Error('th_room 幅度应取上下文 6');
  if (!mate || mate.mood !== -5) throw new Error('th_roommate 幅度应取上下文 -5');
  const bad = Res.generate('adr31_d', 4);
  bad.food = 70; bad.mood = 70;
  Res.needsTick(bad, false, { roomMood: -3 });
  if (!(bad.thoughts || []).some(t => t.id === 'th_room_bad'))
    throw new Error('负房间品质应挂 th_room_bad');
});

test('#ADR31 mood: 饥饿把心情目标压到基线以下', () => {
  const fed = Res.generate('adr31_e', 5);
  fed.food = 95; fed.mood = 70;
  Res.needsTick(fed, false, {});
  const starving = Res.generate('adr31_f', 5);
  starving.food = 10; starving.mood = 70;
  Res.needsTick(starving, false, {});
  if (!(starving.moodTarget < fed.moodTarget))
    throw new Error('饿肚子目标应低于吃饱: ' + starving.moodTarget + ' vs ' + fed.moodTarget);
  if (!(starving.mood < 70)) throw new Error('饥饿应拉低心情, got ' + starving.mood);
});

/* ---------- ADR-37: 念头上下文只有一份 ---------- */
test('#ADR37 ctx: 上下文构造器收口在 APH.Res, 不再各处自留一份', () => {
  if (typeof Res.thoughtCtxAt !== 'function') throw new Error('缺失 Res.thoughtCtxAt');
  if (typeof Res.thoughtEnvOf !== 'function') throw new Error('缺失 Res.thoughtEnvOf');
});

test('#ADR37 ctx: 上下文字段齐全 —— 少一项就等于检查器对玩家撒谎', () => {
  const env = Res.thoughtEnvOf({ colony:{buildings:[]}, meta:{residents:[],bonds:{}}, clock:0 });
  const ctx = Res.thoughtCtxAt(0, 0, env);
  /* 这些字段各自对应一条念头; ui.js 曾自留一份少了前四项,
     指挥官面板因此看不到美观/房间/同室/篝火。 */
  ['roomMood','roomPretty','roomFriction','atJoy',
   'raid','night','sheltered','exposed','temp','filth','fireNearby','corpseNearby']
    .forEach(k => {
      if (!(k in ctx)) throw new Error('上下文缺字段: ' + k);
    });
});

test('#ADR37 env: 环境构造器给出念头需要的全部世界量', () => {
  const env = Res.thoughtEnvOf({ colony:{buildings:[]}, meta:{residents:[],bonds:{}}, clock:0 });
  ['rooms','ambT','night','wxExtreme','residents','bonds'].forEach(k => {
    if (!(k in env)) throw new Error('环境缺字段: ' + k);
  });
  if (!Array.isArray(env.rooms)) throw new Error('rooms 应为数组');
});
