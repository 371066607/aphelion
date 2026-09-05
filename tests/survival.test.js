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

test('rest: needsTick 精力 < 20 标记困倦，不原地瞬睡', function(){
  var r = APH.Res.generate('test3', 12345);
  r.rest = 25;
  APH.Res.needsTick(r, true); // 25 - 7 = 18 < 20
  if (r.rest !== 18) throw new Error('rest 应为 18，实际: ' + r.rest);
  if (!r.wantSleep) throw new Error('rest=18 应标记 wantSleep');
  if (r.isSleeping) throw new Error('有床可去时不应原地瞬睡');
});

test('rest: 夜间精力未满也想睡 (作息)', function(){
  var r = APH.Res.generate('night1', 1);
  r.rest = 50;
  window.APH = window.APH || APH;
  window.APH.World = window.APH.World || {};
  var old = window.APH.World.daylight;
  window.APH.World.daylight = function(){ return 0.2; };
  APH.Res.needsTick(r, true);
  window.APH.World.daylight = old;
  if (r.rest !== 43) throw new Error('rest 应为 43，实际: ' + r.rest);
  if (!r.wantSleep) throw new Error('夜间 rest=43 应 wantSleep');
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

test('downed: 认知 < 30% 触发击倒与 90s 濒死倒计时', function(){
  var r = APH.Res.generate('down1', 12345);
  r.ailments = [{ type: 'plague', sev: 70, age: 0 }];
  r.illness = 70;
  var isDown = APH.Res.checkDowned(r);
  if (!isDown) throw new Error('认知低于 30% 应触发击倒');
  if (!r.downed) throw new Error('r.downed 应为 true');
  if (r.bleedOutTimer !== 90) throw new Error('濒死倒计时初始应为 90s，实际: ' + r.bleedOutTimer);
});

test('downed: 击倒者不参与工作分配', function(){
  var residents = [
    { id: 'rs_down', skills: { sk_farm: 9 }, downed: true, job: null },
    { id: 'rs_work', skills: { sk_farm: 5 }, downed: false, job: null }
  ];
  var buildings = [{ id: 'bl_farm', lv: 1 }];
  var prio = { rs_down: { sk_farm: 1 }, rs_work: { sk_farm: 1 } };
  var assigned = APH.Colony.assignByPriority(residents, buildings, prio, false);
  if (assigned.rs_down !== null) throw new Error('击倒者不应上岗');
  if (assigned.rs_work !== 'bl_farm') throw new Error('健康者应上岗');
});

test('rescue: rescueTick 推进濒死倒计时与送医止血康复', function(){
  var r = APH.Res.generate('down2', 12345);
  r.downed = true;
  r.bleedOutTimer = 90;

  // 1. 倒计时推进 30s
  var result1 = APH.Res.rescueTick([r], [{ id: 'bl_clinic', lv: 1 }], 30, false, { inClinic: false });
  if (r.bleedOutTimer !== 60) throw new Error('倒计时推进 30s 后应为 60s，实际: ' + r.bleedOutTimer);
  if (result1.dead.length > 0) throw new Error('未超时不应死亡');

  // 2. 送入医疗舱并用药止血
  var result2 = APH.Res.rescueTick([r], [{ id: 'bl_clinic', lv: 1 }], 10, true, { inClinic: true });
  if (r.downed) throw new Error('成功送医用药后应脱离 downed 状态');
  if (r.bleedOutTimer !== null) throw new Error('脱离击倒后 bleedOutTimer 应清空为 null');
  if (!result2.medUsed) throw new Error('抢救应消耗药品');
});

test('rescue: 倒计时归零判定死亡并产生悼念心情减益', function(){
  var r1 = APH.Res.generate('down3', 12345);
  r1.downed = true;
  r1.bleedOutTimer = 5;

  var r2 = APH.Res.generate('alive', 12345);
  r2.mood = 80;

  var result = APH.Res.rescueTick([r1, r2], [], 10, false, { inClinic: false });
  if (result.dead.indexOf(r1.id) < 0) throw new Error('倒计时归零 r1 应进入死亡名单');
  // 悼念全员心情 -8
  if (r2.mood > 72) throw new Error('同伴死亡 r2 应受到悼念心情减益，实际 mood: ' + r2.mood);
});

test('exposure: 居民生成带默认暴露值 0', function(){
  var r = APH.Res.generate('exp1', 12345);
  if (r.exposure !== 0) throw new Error('exposure 初始值应为 0，实际: ' + r.exposure);
});

test('exposure: 极端天气室外累积，避难所内快速消退', function(){
  var r = APH.Res.generate('exp2', 12345);
  r.exposure = 20;

  // 1. 极端天气室外 +10
  APH.Res.exposureTick(r, false, true, 'lw_night_acid');
  if (r.exposure !== 30) throw new Error('极端天气室外应累积至 30，实际: ' + r.exposure);

  // 2. 避难所内消退 -15
  APH.Res.exposureTick(r, true, true, 'lw_night_acid');
  if (r.exposure !== 15) throw new Error('避难所内消退后应为 15，实际: ' + r.exposure);
});

test('exposure: isSheltered 判定建筑与核心范围', function(){
  var buildings = [{ x: 1000, y: 1000, size: 48 }];
  var hab = { x: 1100, y: 1100, r: 92 };

  // 靠近建筑 -> 避难所
  var sheltered1 = APH.Res.isSheltered({ x: 1010, y: 1010 }, buildings, hab);
  if (!sheltered1) throw new Error('靠近建筑应判定为避难所');

  // 靠近核心 -> 避难所
  var sheltered2 = APH.Res.isSheltered({ x: 1120, y: 1120 }, buildings, hab);
  if (!sheltered2) throw new Error('靠近核心应判定为避难所');

  // 开阔荒野 -> 非避难所
  var sheltered3 = APH.Res.isSheltered({ x: 500, y: 500 }, buildings, hab);
  if (sheltered3) throw new Error('开阔荒野不应判定为避难所');
});

test('exposure: 严重暴露 (>80) 转化为急性感染病症', function(){
  var r = APH.Res.generate('exp3', 12345);
  r.exposure = 85;
  r.ailments = [];

  APH.Res.exposureTick(r, false, true, 'lw_night_acid');
  if (r.ailments.length === 0) throw new Error('严重酸雨暴露应转化为感染病症');
  if (r.ailments[0].type !== 'infection') throw new Error('酸雨暴露应转化为 infection');
  if (r.exposure >= 80) throw new Error('转化后 exposure 应被重置/回落');
});

test('survival_integration: 居民生存全属性在名册与实体模型中完整流通', function(){
  var r = APH.Res.generate('full1', 12345);
  r.rest = 15;
  r.recreation = 10;
  r.exposure = 60;
  r.ailments = [{ type: 'wound', sev: 20, age: 0 }];
  r.illness = 20;

  // 1. 机能计算
  var cap = APH.Res.capacitiesOf(r);
  if (cap.moving >= 1.0 || cap.manipulation >= 1.0) throw new Error('机能应受损');

  // 2. 状态推进
  APH.Res.needsTick(r, false);
  if (!r.wantSleep) throw new Error('精力 < 20 应标记 wantSleep');
  if (r.isSleeping) throw new Error('困倦后应走去床，不应 needsTick 原地瞬睡');

  // 3. 娱乐补充
  APH.Res.enjoyRecreation(r, 80);
  if (r.recreation < 80) throw new Error('娱乐值应补充至高水平');

  // 4. 击倒保护
  r.ailments = [{ type: 'plague', sev: 80, age: 0 }];
  r.illness = 80;
  var isDown = APH.Res.checkDowned(r);
  if (!isDown || !r.downed) throw new Error('重度疫病应触发击倒');
});


/* #66 玩家床边睡眠/唤醒 (纯函数 seam, #67 累塌/#70 医疗舱可复用) */
test('playerRestTick: 清醒在家园每跳掉 7 精力', function(){
  var needs = { rest: 80, isSleeping: false };
  APH.Res.playerRestTick(needs, 'home', false);
  if (needs.rest !== 73) throw new Error('清醒家园跳应掉至 73, 实际: ' + needs.rest);
  if (needs.isSleeping) throw new Error('rest=73 不应入睡');
});

test('playerRestTick: 睡眠中床上 +25/跳, 地铺 +18/跳', function(){
  var bed = { rest: 40, isSleeping: true };
  APH.Res.playerRestTick(bed, 'home', true);
  if (bed.rest !== 65) throw new Error('床上睡眠应恢复至 65, 实际: ' + bed.rest);
  var floor = { rest: 40, isSleeping: true };
  APH.Res.playerRestTick(floor, 'home', false);
  if (floor.rest !== 58) throw new Error('地铺睡眠应恢复至 58, 实际: ' + floor.rest);
});

test('playerRestTick: 睡眠回满 100 自动醒', function(){
  var needs = { rest: 90, isSleeping: true };
  APH.Res.playerRestTick(needs, 'home', true);
  if (needs.rest !== 100) throw new Error('应 clamp 到 100, 实际: ' + needs.rest);
  if (needs.isSleeping) throw new Error('回满应自动醒 (isSleeping=false)');
});

test('playerRestTick: 清醒在远征精力冻结', function(){
  var needs = { rest: 40, isSleeping: false };
  APH.Res.playerRestTick(needs, 'expedition', false);
  if (needs.rest !== 40) throw new Error('远征清醒跳精力应冻结, 实际: ' + needs.rest);
});

/* #67 累塌: 家园精力见底(<=0)原地强制睡着(打地铺, bedId=null), 唤醒规则继承 #66 */
test('playerRestTick: 家园精力见底(<=0)原地累塌(地铺睡, bedId=null)', function(){
  var needs = { rest: 3, isSleeping: false };
  APH.Res.playerRestTick(needs, 'home', false);
  if (needs.rest !== 0) throw new Error('家园清醒跳掉 7 后应钳到 0, 实际: ' + needs.rest);
  if (!needs.isSleeping) throw new Error('精力归零应原地累塌睡着, 实际仍清醒');
  if (needs.bedId !== null) throw new Error('累塌为打地铺 bedId 应为 null, 实际: ' + needs.bedId);
});

test('playerRestTick: 累塌后地铺恢复 +18/跳', function(){
  var needs = { rest: 0, isSleeping: true, bedId: null };
  APH.Res.playerRestTick(needs, 'home', false);
  if (needs.rest !== 18) throw new Error('地铺睡应恢复至 18, 实际: ' + needs.rest);
  if (!needs.isSleeping) throw new Error('未回满应保持睡着');
});

test('playerRestTick: 累塌恢复回满自动醒且清 bedId (对齐 playerWake)', function(){
  var needs = { rest: 90, isSleeping: true, bedId: null };
  APH.Res.playerRestTick(needs, 'home', false);
  if (needs.rest !== 100) throw new Error('应 clamp 到 100, 实际: ' + needs.rest);
  if (needs.isSleeping) throw new Error('回满应自动醒 (isSleeping=false)');
  if (needs.bedId !== null) throw new Error('自动醒应清 bedId, 实际: ' + needs.bedId);
});

test('playerRestTick: 远征精力冻结且 0 值不触发累塌', function(){
  var needs = { rest: 0, isSleeping: false };
  APH.Res.playerRestTick(needs, 'expedition', false);
  if (needs.rest !== 0) throw new Error('远征清醒跳精力应冻结在 0, 实际: ' + needs.rest);
  if (needs.isSleeping) throw new Error('远征精力为 0 不得累塌睡着');
});

test('playerRestTick: 睡眠回满自动醒同时清 bedId (#67 修复)', function(){
  var needs = { rest: 90, isSleeping: true, bedId: 'bed_player' };
  APH.Res.playerRestTick(needs, 'home', true);
  if (needs.isSleeping) throw new Error('回满应自动醒');
  if (needs.bedId !== null) throw new Error('自动醒应清 bedId, 实际: ' + needs.bedId);
});

test('setPlayerSleeping: 可传入自定义床ID (默认保留 bed_player, #70 预留)', function(){
  var a = { isSleeping: false, bedId: null };
  APH.Res.setPlayerSleeping(a, true, true, 'bed_med');
  if (a.bedId !== 'bed_med') throw new Error('自定义床ID应生效, 实际: ' + a.bedId);
  var b = { isSleeping: false, bedId: null };
  APH.Res.setPlayerSleeping(b, true, true);
  if (b.bedId !== 'bed_player') throw new Error('缺省应保留 bed_player, 实际: ' + b.bedId);
});

test('playerRestTick: 医疗舱躺卧(bedId=bed_med, hasBed=true) 按床速 +25/跳', function(){
  var needs = { rest: 40, isSleeping: true, bedId: 'bed_med' };
  APH.Res.playerRestTick(needs, 'home', true);
  if (needs.rest !== 65) throw new Error('舱内躺卧应按床速恢复至 65, 实际: ' + needs.rest);
  if (!needs.isSleeping) throw new Error('未回满应保持舱内躺卧');
  if (needs.bedId !== 'bed_med') throw new Error('舱内躺卧应保留 bed_med, 实际: ' + needs.bedId);
});

test('playerRestTick: 舱内回满自动醒并清 bedId=bed_med', function(){
  var needs = { rest: 90, isSleeping: true, bedId: 'bed_med' };
  APH.Res.playerRestTick(needs, 'home', true);
  if (needs.rest !== 100) throw new Error('应 clamp 到 100, 实际: ' + needs.rest);
  if (needs.isSleeping) throw new Error('回满应自动醒 (isSleeping=false)');
  if (needs.bedId !== null) throw new Error('自动醒应清 bedId, 实际: ' + needs.bedId);
});

test('playerWake: 清 bedId=bed_med', function(){
  var needs = { isSleeping: true, bedId: 'bed_med' };
  if (APH.Res.playerWake(needs) !== true) throw new Error('舱内躺卧唤醒应返回 true');
  if (needs.isSleeping) throw new Error('唤醒后 isSleeping 应为 false');
  if (needs.bedId !== null) throw new Error('唤醒后 bedId 应清空, 实际: ' + needs.bedId);
});

test('setPlayerSleeping: 靠床 E 入睡绑床, 无床打地铺, 离床清床', function(){
  var a = { isSleeping: false, bedId: null };
  APH.Res.setPlayerSleeping(a, true, true);
  if (!a.isSleeping) throw new Error('应入睡');
  if (a.bedId !== 'bed_player') throw new Error('有床应绑定 bed_player, 实际: ' + a.bedId);
  var b = { isSleeping: false, bedId: null };
  APH.Res.setPlayerSleeping(b, true, false);
  if (!b.isSleeping) throw new Error('无床也应能入睡(打地铺)');
  if (b.bedId !== null) throw new Error('无床 bedId 应为 null, 实际: ' + b.bedId);
  APH.Res.setPlayerSleeping(b, false, false);
  if (b.isSleeping) throw new Error('flag=false 应醒来');
  if (b.bedId !== null) throw new Error('醒来应清床');
});

test('playerWake: 清睡眠返回 true, 非睡眠/null 返回 false', function(){
  var a = { isSleeping: true, bedId: 'bed_player' };
  if (APH.Res.playerWake(a) !== true) throw new Error('睡眠中唤醒应返回 true');
  if (a.isSleeping) throw new Error('唤醒后 isSleeping 应为 false');
  if (a.bedId !== null) throw new Error('唤醒后 bedId 应清空');
  if (APH.Res.playerWake(a) !== false) throw new Error('非睡眠调用应返回 false');
  if (APH.Res.playerWake(null) !== false) throw new Error('null 调用应返回 false');
});

test('ensurePlayerNeeds: 缺省 isSleeping=false 且不覆盖已有值', function(){
  var a = APH.Res.ensurePlayerNeeds({});
  if (a.playerNeeds.isSleeping !== false) throw new Error('新档 isSleeping 默认应为 false');
  var b = APH.Res.ensurePlayerNeeds({ playerNeeds:{ isSleeping: true } });
  if (b.playerNeeds.isSleeping !== true) throw new Error('已有 isSleeping 不得覆盖');
});

/* #72 家园击倒: 玩家击倒倒计时/送医复活/远征 no-op(纯函数) */
test('playerDownedTick: 家园倒计时递减', function(){
  var needs = { downed: true, downT: 90 };
  var res = APH.Res.playerDownedTick(needs, 'home', 30, { inClinic:false, hasClinic:true, hasResidents:false });
  if (res.dead || res.revived) throw new Error('倒计时未归零不应死/复活');
  if (needs.downT !== 60) throw new Error('家园倒计时应减到 60, 实际: ' + needs.downT);
});

test('playerDownedTick: 有居民+舱内送医复活', function(){
  var needs = { downed: true, downT: 30 };
  var res = APH.Res.playerDownedTick(needs, 'home', 0.016,
    { inClinic:true, hasClinic:true, hasResidents:true });
  if (!res.revived) throw new Error('有居民+舱内应复活');
  if (needs.downed !== false) throw new Error('复活应清 downed');
  if (needs.downT !== null) throw new Error('复活应清 downT');
});

test('playerDownedTick: 有舱无居民不解救(继续倒计时)', function(){
  var needs = { downed: true, downT: 90 };
  var res = APH.Res.playerDownedTick(needs, 'home', 10,
    { inClinic:true, hasClinic:true, hasResidents:false });
  if (res.dead || res.revived) throw new Error('无居民不应复活/死亡');
  if (needs.downT !== 80) throw new Error('应继续倒计时到 80, 实际: ' + needs.downT);
});

test('playerDownedTick: 倒计时归零判定死亡', function(){
  var needs = { downed: true, downT: 5 };
  var res = APH.Res.playerDownedTick(needs, 'home', 10, { inClinic:false, hasClinic:false, hasResidents:false });
  if (!res.dead) throw new Error('倒计时归零应判定死亡');
  if (needs.downed !== false) throw new Error('死亡应清 downed');
  if (needs.downT !== null) throw new Error('死亡应清 downT');
});

test('playerDownedTick: 远征 no-op(老档保护)', function(){
  var needs = { downed: true, downT: 42 };
  var res = APH.Res.playerDownedTick(needs, 'expedition', 30, { inClinic:false, hasClinic:false, hasResidents:false });
  if (res.dead || res.revived) throw new Error('远征击倒不应死/复活');
  if (needs.downT !== 42) throw new Error('远征 downT 不应变化, 实际: ' + needs.downT);
});

test('playerDownedTick: 未击倒 no-op', function(){
  var needs = { downed: false, downT: null };
  var res = APH.Res.playerDownedTick(needs, 'home', 30, { inClinic:false, hasClinic:false, hasResidents:false });
  if (res.dead || res.revived) throw new Error('未击倒不应有任何结果');
  if (needs.downed !== false) throw new Error('未击倒状态不应改变');
});

test('ensurePlayerNeeds: 缺省 downed=false / downT=null 且不覆盖已有值 (#72)', function(){
  var a = APH.Res.ensurePlayerNeeds({});
  if (a.playerNeeds.downed !== false) throw new Error('新档 downed 默认应为 false');
  if (a.playerNeeds.downT !== null) throw new Error('新档 downT 默认应为 null');
  var b = APH.Res.ensurePlayerNeeds({ playerNeeds:{ downed: true, downT: 30 } });
  if (b.playerNeeds.downed !== true) throw new Error('已有 downed 不得覆盖');
  if (b.playerNeeds.downT !== 30) throw new Error('已有 downT 不得覆盖');
});

/* #65 玩家走到粮边吃: playerEatOnce 纯函数(只改 food, clamp 0..100,
   不复用居民 eatOnce 以免向 playerNeeds 写入 mood/recreation 等污染字段) */
test('playerEatOnce: 生食加 25 饱食', function(){
  var needs = { food:30 };
  var res = APH.Res.playerEatOnce(needs, 'it_food');
  if (!res.ate) throw new Error('生食应 ate=true');
  if (needs.food !== 55) throw new Error('30+25 应=55, 实际: ' + needs.food);
  if (res.gain !== 25) throw new Error('gain 应为 25, 实际: ' + res.gain);
});

test('playerEatOnce: 熟食用 itemDef.foodGain (炙烤异星肉排 +40)', function(){
  var needs = { food:30 };
  var res = APH.Res.playerEatOnce(needs, 'it_roasted_meat');
  if (!res.ate) throw new Error('熟食应 ate=true');
  if (needs.food !== 70) throw new Error('30+40 应=70, 实际: ' + needs.food);
  if (res.gain !== 40) throw new Error('gain 应为 40, 实际: ' + res.gain);
});

test('playerEatOnce: 满饱食不触发 (food>=阈值 ate=false)', function(){
  var needs = { food:80 };
  var res = APH.Res.playerEatOnce(needs, 'it_food');
  if (res.ate) throw new Error('满饱食应 ate=false');
  if (needs.food !== 80) throw new Error('满饱食不应改 food');
});

test('playerEatOnce: clamp 到 100 (55+50 alien_feast=105→100)', function(){
  var needs = { food:55 };
  var res = APH.Res.playerEatOnce(needs, 'it_alien_feast');
  if (!res.ate) throw new Error('应 ate=true');
  if (needs.food !== 100) throw new Error('55+50 应 clamp 到 100, 实际: ' + needs.food);
  if (res.gain !== 45) throw new Error('clamp 后实际 gain 应为 45, 实际: ' + res.gain);
});

test('playerEatOnce: food=null 不触发且不污染 mood/recreation', function(){
  var needs = { food:null, mood:70, recreation:80, exposure:10 };
  var res = APH.Res.playerEatOnce(needs, 'it_food');
  if (res.ate) throw new Error('food=null 应 ate=false');
  if (needs.mood !== 70) throw new Error('不得污染 mood');
  if (needs.recreation !== 80) throw new Error('不得污染 recreation');
  if (needs.exposure !== 10) throw new Error('不得污染 exposure');
});

test('playerEatOnce: 进食后只改 food, 不写 mood/recreation/exposure', function(){
  var needs = { food:30, mood:70, recreation:80, exposure:10 };
  var res = APH.Res.playerEatOnce(needs, 'it_food');
  if (!res.ate) throw new Error('应 ate=true');
  if (needs.mood !== 70) throw new Error('进食不得写 mood, 实际: ' + needs.mood);
  if (needs.recreation !== 80) throw new Error('进食不得写 recreation');
  if (needs.exposure !== 10) throw new Error('进食不得写 exposure');
});





