/* #170 作息表 */
'use strict';
const Res = window.APH.Res;
const CFG = window.APH.CFG;

test('#170 schedule: hourOfDay 把一天切成 24 小时', () => {
  if (typeof Res.hourOfDay !== 'function') throw new Error('缺失 hourOfDay');
  const day = CFG.DAY_LEN || 3600;
  if (Res.hourOfDay(0, day) !== 0) throw new Error('clock 0 应为 0 点');
  if (Res.hourOfDay(day / 24, day) !== 1) throw new Error('过 1 小时应为 1 点');
  if (Res.hourOfDay(day - 1, day) !== 23) throw new Error('一天末尾应为 23 点');
});

test('#170 schedule: 默认夜里睡白天工作', () => {
  const sch = Res.defaultSchedule();
  if (!sch || sch.length !== 24) throw new Error('应有 24 格');
  if (sch[3] !== 'work') throw new Error('白天 3 点应工作, 实际: ' + sch[3]);
  if (sch[15] !== 'sleep') throw new Error('夜里 15 点应睡觉, 实际: ' + sch[15]);
});

test('#170 schedule: 缺字段补默认，点击循环', () => {
  const a = Res.ensureSchedule(null);
  if (a.length !== 24) throw new Error('应补 24 格');
  const n = Res.cycleScheduleSlot('work');
  if (n !== 'joy') throw new Error('工作下一格应娱乐, 实际: ' + n);
  if (Res.cycleScheduleSlot('any') !== 'work') throw new Error('任意下一格应工作');
});

test('#170 thinkPawn: 睡眠格且精力未满去睡觉', () => {
  const sch = Res.defaultSchedule();
  const i = Res.thinkPawn(
    { id: 'player', x: 100, y: 100, food: 80, rest: 60, recreation: 80, schedule: sch, prio: { sk_gather: 2, sk_build: 0, sk_haul: 0 } },
    { hour: 15, house: { x: 300, y: 100 }, eatBelow: 60, restSleepAt: 20, restNightAt: 75, joyAt: 30 }
  );
  if (i.type !== 'sleep') throw new Error('睡眠格应去睡觉, 实际: ' + i.type);
});

test('#170 thinkPawn: 睡眠格精力已满不困在床循环', () => {
  const sch = Res.defaultSchedule();
  const i = Res.thinkPawn(
    { id: 'player', x: 100, y: 100, food: 80, rest: 100, recreation: 80, schedule: sch, prio: { sk_gather: 2, sk_build: 0, sk_haul: 0 } },
    { hour: 15, house: { x: 300, y: 100 }, flora: { id: 'f', x: 600, y: 100 }, eatBelow: 60, restSleepAt: 20, joyAt: 30 }
  );
  if (i.type === 'sleep' || i.type === 'sleep_now') throw new Error('睡饱不应再强制睡');
});

test('#170 thinkPawn: 工作格轻微无聊不去篝火', () => {
  const sch = Res.defaultSchedule();
  const i = Res.thinkPawn(
    { id: 'player', x: 100, y: 100, food: 80, rest: 100, recreation: 20, schedule: sch, prio: { sk_gather: 2, sk_build: 0, sk_haul: 0 } },
    { hour: 3, flora: { id: 'f', x: 600, y: 100 }, joy: { x: 700, y: 100 }, eatBelow: 60, restSleepAt: 20, joyAt: 30 }
  );
  if (i.type !== 'gather') throw new Error('工作时间应去干活, 实际: ' + i.type);
});

test('#170 thinkPawn: 娱乐格优先休闲', () => {
  const sch = Res.defaultSchedule();
  const i = Res.thinkPawn(
    { id: 'player', x: 100, y: 100, food: 80, rest: 100, recreation: 20, schedule: sch, prio: { sk_gather: 2, sk_build: 0, sk_haul: 0 } },
    { hour: 11, flora: { id: 'f', x: 600, y: 100 }, joy: { x: 700, y: 100 }, eatBelow: 60, restSleepAt: 20, joyAt: 30 }
  );
  if (i.type !== 'joy') throw new Error('娱乐格应休闲, 实际: ' + i.type);
});
