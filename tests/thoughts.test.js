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
