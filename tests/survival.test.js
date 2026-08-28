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
