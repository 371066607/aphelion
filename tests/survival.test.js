/* tests/survival.test.js — 殖民者深度生存系统 (Ticket #15 等)
   纯注册式测试文件，由 run.js 自动加载。 */
'use strict';

test('rest: 居民生成带默认精力与睡眠字段', function(){
  var r = APH.Res.generate('test1', 12345);
  if (r.rest !== 100) throw new Error('rest 初始值应为 100，实际: ' + r.rest);
  if (r.isSleeping !== false) throw new Error('isSleeping 初始应为 false');
  if (r.sleepDisturbed !== 0) throw new Error('sleepDisturbed 初始应为 0');
});

test('rest: needsTick 自然衰减精力 (7/跳)', function(){
  var r = APH.Res.generate('test2', 12345);
  r.rest = 80;
  APH.Res.needsTick(r, true);
  if (r.rest !== 73) throw new Error('rest 自然衰减后应为 73，实际: ' + r.rest);
  if (r.isSleeping) throw new Error('rest=73 不应进入睡眠');
});

test('rest: needsTick 精力 < 20 自动进入睡眠状态', function(){
  var r = APH.Res.generate('test3', 12345);
  r.rest = 25;
  APH.Res.needsTick(r, true); // 25 - 7 = 18 < 20
  if (r.rest !== 18) throw new Error('rest 应为 18，实际: ' + r.rest);
  if (!r.isSleeping) throw new Error('rest=18 应触发 isSleeping=true');
});

test('rest: 睡眠中在床铺恢复 (+25/跳) 且满 100 醒来', function(){
  var r = APH.Res.generate('test4', 12345);
  r.rest = 18;
  r.isSleeping = true;
  r.bedId = 'bed_1';

  APH.Res.needsTick(r, true);
  if (r.rest !== 43) throw new Error('床铺睡眠第一跳应恢复到 43，实际: ' + r.rest);
  if (!r.isSleeping) throw new Error('rest=43 应继续睡眠');

  r.rest = 90;
  APH.Res.needsTick(r, true);
  if (r.rest !== 100) throw new Error('床铺睡眠满值应 clamp 到 100，实际: ' + r.rest);
  if (r.isSleeping) throw new Error('rest 达到 100 应醒来 (isSleeping=false)');
});

test('rest: 睡眠中在地面 (无床) 恢复慢 30% (+18/跳)', function(){
  var r = APH.Res.generate('test5', 12345);
  r.rest = 18;
  r.isSleeping = true;
  r.bedId = null; // 无床打地铺

  APH.Res.needsTick(r, true);
  if (r.rest !== 36) throw new Error('地铺睡眠第一跳应恢复到 36，实际: ' + r.rest);
});

test('beds: assignBeds 纯函数按容量分配床位', function(){
  var buildings = [
    { id: 'bl_house', lv: 1 }, // 基础 2 + 3*1 = 5
  ];
  var residents = [
    { id: 'rs_1' },
    { id: 'rs_2' },
    { id: 'rs_3' },
    { id: 'rs_4' },
    { id: 'rs_5' },
    { id: 'rs_6' }, // 第 6 人超容，打地铺
  ];
  APH.Res.assignBeds(buildings, residents);

  if (!residents[0].bedId) throw new Error('rs_1 应分配到床位');
  if (!residents[4].bedId) throw new Error('rs_5 应分配到床位');
  if (residents[5].bedId !== null) throw new Error('rs_6 超容，bedId 应为 null');
});

test('disturbSleep: 惊醒中断睡眠并附加心情减益', function(){
  var r = APH.Res.generate('test6', 12345);
  r.isSleeping = true;
  r.rest = 40;
  r.mood = 70;

  var woke = APH.Res.disturbSleep(r);
  if (!woke) throw new Error('disturbSleep 应返回 true');
  if (r.isSleeping) throw new Error('惊醒后 isSleeping 应为 false');
  if (r.sleepDisturbed !== 3) throw new Error('sleepDisturbed 应设为 3 跳');
  if (r.mood !== 66) throw new Error('惊醒心情应 -4 变为 66，实际: ' + r.mood);

  // 非睡眠状态不触发惊醒
  var woke2 = APH.Res.disturbSleep(r);
  if (woke2) throw new Error('已醒状态 disturbSleep 应返回 false');
});

test('assignByPriority: 睡眠中的居民不被派岗', function(){
  var residents = [
    { id: 'rs_sleep', skills: { sk_farm: 9 }, isSleeping: true, job: null },
    { id: 'rs_awake', skills: { sk_farm: 6 }, isSleeping: false, job: null }
  ];
  var buildings = [{ id: 'bl_farm', lv: 1 }]; // 2 个农场岗位
  var prio = { rs_sleep: { sk_farm: 1 }, rs_awake: { sk_farm: 1 } };

  var assigned = APH.Colony.assignByPriority(residents, buildings, prio, false);
  if (assigned.rs_sleep !== null) throw new Error('睡眠中的居民不应上岗，实际: ' + assigned.rs_sleep);
  if (assigned.rs_awake !== 'bl_farm') throw new Error('清醒居民应上岗，实际: ' + assigned.rs_awake);
});

test('capacities: 健康居民三维机能均为 1.0 (100%)', function(){
  var r = APH.Res.generate('cap1', 12345);
  var cap = APH.Res.capacitiesOf(r);
  if (cap.moving !== 1.0) throw new Error('健康居民 moving 应为 1.0，实际: ' + cap.moving);
  if (cap.manipulation !== 1.0) throw new Error('健康居民 manipulation 应为 1.0，实际: ' + cap.manipulation);
  if (cap.consciousness !== 1.0) throw new Error('健康居民 consciousness 应为 1.0，实际: ' + cap.consciousness);
});

test('capacities: 外伤削弱移动与操作机能', function(){
  var r = APH.Res.generate('cap2', 12345);
  r.ailments = [{ type: 'wound', sev: 40, age: 0 }];
  r.illness = 40;
  var cap = APH.Res.capacitiesOf(r);
  // moving: 1.0 - 40*0.005 = 0.8
  // manipulation: 1.0 - 40*0.004 = 0.84
  if (Math.abs(cap.moving - 0.8) > 0.01) throw new Error('moving 应为 0.8，实际: ' + cap.moving);
  if (Math.abs(cap.manipulation - 0.84) > 0.01) throw new Error('manipulation 应为 0.84，实际: ' + cap.manipulation);
});

test('capacities: 严重疫病削弱认知并作为全局上限', function(){
  var r = APH.Res.generate('cap3', 12345);
  r.ailments = [{ type: 'plague', sev: 50, age: 0 }];
  r.illness = 50;
  var cap = APH.Res.capacitiesOf(r);
  // consciousness: 1.0 - 50*0.009 - 50*0.003 = 1.0 - 0.45 - 0.15 = 0.40
  // moving & manipulation capped by consciousness 0.40
  if (Math.abs(cap.consciousness - 0.40) > 0.01) throw new Error('consciousness 应为 0.40，实际: ' + cap.consciousness);
  if (cap.moving > 0.4001) throw new Error('moving 应被 consciousness 压制在 0.40 以下，实际: ' + cap.moving);
  if (cap.manipulation > 0.4001) throw new Error('manipulation 应被 consciousness 压制在 0.40 以下，实际: ' + cap.manipulation);
});

test('efficiency: 整合 manipulation 机能损耗', function(){
  var r = APH.Res.generate('cap4', 12345);
  r.food = 100;
  r.mood = 100;
  r.ailments = [{ type: 'infection', sev: 60, age: 0 }];
  r.illness = 60;
  var eff = APH.Res.efficiency(r);
  var cap = APH.Res.capacitiesOf(r);
  if (eff <= 0) throw new Error('eff 应大于 0');
  if (cap.manipulation >= 1.0) throw new Error('感染者 manipulation 应小于 1.0');
});

test('recreation: 居民生成带默认娱乐值 80', function(){
  var r = APH.Res.generate('rec1', 12345);
  if (r.recreation !== 80) throw new Error('recreation 初始值应为 80，实际: ' + r.recreation);
});

test('recreation: needsTick 自然衰减 5/跳', function(){
  var r = APH.Res.generate('rec2', 12345);
  r.recreation = 60;
  APH.Res.needsTick(r, true);
  if (r.recreation !== 55) throw new Error('recreation 衰减后应为 55，实际: ' + r.recreation);
});

test('recreation: 高娱乐提供 +8 身心愉悦，低娱乐惩罚 -5 极度枯燥', function(){
  var rHigh = APH.Res.generate('rec3', 12345);
  rHigh.food = 100;
  rHigh.mood = 70;
  rHigh.recreation = 85;
  APH.Res.needsTick(rHigh, true);
  // 70 + 2(food) + 3(bed) + 8(joy) = 83
  if (rHigh.mood < 80) throw new Error('高娱乐应获得身心愉悦加成，实际 mood: ' + rHigh.mood);

  var rLow = APH.Res.generate('rec4', 12345);
  rLow.food = 100;
  rLow.mood = 70;
  rLow.recreation = 15;
  APH.Res.needsTick(rLow, true);
  // low recreation penalty -5
  if (rLow.mood > 72) throw new Error('低娱乐应受枯燥惩罚，实际 mood: ' + rLow.mood);
});

test('recreation: enjoyRecreation 增加娱乐值', function(){
  var r = APH.Res.generate('rec5', 12345);
  r.recreation = 40;
  APH.Res.enjoyRecreation(r, 25);
  if (r.recreation !== 65) throw new Error('enjoyRecreation 后应为 65，实际: ' + r.recreation);
});


