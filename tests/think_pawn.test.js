/* #168 thinkPawn: 指挥官与居民同一套决策优先级 */
'use strict';
const Res = window.APH.Res;

function pawn(over){
  return Object.assign({
    id: 'player', x: 100, y: 100,
    drafted: false, food: 80, rest: 100, recreation: 80,
    wantSleep: false, isSleeping: false, downed: false, medLying: false,
    prio: { sk_gather: 2, sk_build: 2, sk_haul: 2 },
    order: null, haulCarry: null,
    nearFood: false, nearBed: false, job: null, gathering: false
  }, over);
}
function world(over){
  return Object.assign({
    raid: false, night: false,
    eatBelow: 60, restSleepAt: 20, restNightAt: 75, joyAt: 30,
    meal: { x: 200, y: 100 },
    house: { x: 300, y: 100 },
    blueprint: { x: 400, y: 100 },
    drop: { x: 500, y: 100, itemId: 'it_wood', n: 1 },
    flora: { id: 'fl_1', x: 600, y: 100 },
    berry: { id: 'fl_b', x: 180, y: 100 },
    joy: { x: 700, y: 100 },
    storage: { x: 250, y: 100 }
  }, over);
}

test('#168 thinkPawn: 导出', () => {
  if (!Res || typeof Res.thinkPawn !== 'function') throw new Error('缺失 APH.Res.thinkPawn');
});

test('#168 thinkPawn: 征召中不自治', () => {
  const i = Res.thinkPawn(pawn({ drafted: true, food: 10 }), world());
  if (i.type !== 'none') throw new Error('征召应 none, 实际: ' + i.type);
});

test('#168 thinkPawn: 睡着/倒地不自治', () => {
  if (Res.thinkPawn(pawn({ isSleeping: true }), world()).type !== 'none') throw new Error('睡着应 none');
  if (Res.thinkPawn(pawn({ downed: true }), world()).type !== 'none') throw new Error('倒地应 none');
});

test('#168 thinkPawn: 饿了去吃饭，优先于睡觉和干活', () => {
  const i = Res.thinkPawn(pawn({ food: 40, rest: 5 }), world());
  if (i.type !== 'eat') throw new Error('饿了应 eat, 实际: ' + i.type);
  if (i.x !== 200) throw new Error('应走向口粮');
});

test('#168 thinkPawn: 贴着粮就地吃', () => {
  const i = Res.thinkPawn(pawn({ food: 40, nearFood: true }), world());
  if (i.type !== 'eat_now') throw new Error('贴粮应 eat_now, 实际: ' + i.type);
});

test('#168 thinkPawn: 饿了没粮去采浆果', () => {
  const i = Res.thinkPawn(pawn({ food: 40 }), world({ meal: null }));
  if (i.type !== 'gather' || !i.emergency) throw new Error('无口粮应紧急采果, 实际: ' + JSON.stringify(i));
});

test('#168 thinkPawn: 困了去睡觉，优先于建造', () => {
  const i = Res.thinkPawn(pawn({ rest: 10, wantSleep: true }), world());
  if (i.type !== 'sleep') throw new Error('困了应 sleep, 实际: ' + i.type);
  if (i.x !== 300) throw new Error('应走向居住舱');
});

test('#168 thinkPawn: 贴床就睡', () => {
  const i = Res.thinkPawn(pawn({ rest: 10, wantSleep: true, nearBed: true }), world());
  if (i.type !== 'sleep_now') throw new Error('贴床应 sleep_now, 实际: ' + i.type);
});

test('#169 thinkPawn: 强制建造走指定蓝图坐标', () => {
  const i = Res.thinkPawn(pawn({ order: { type: 'build', x: 1250, y: 1180 } }), world());
  if (i.type !== 'build' || i.x !== 1250 || i.y !== 1180) throw new Error('右键蓝图应强制走该坐标, 实际: ' + JSON.stringify(i));
});

test('#168 thinkPawn: 不饿不困去建造', () => {
  const i = Res.thinkPawn(pawn(), world());
  if (i.type !== 'build') throw new Error('有蓝图应 build, 实际: ' + i.type);
});

test('#168 thinkPawn: 无蓝图去搬运', () => {
  const i = Res.thinkPawn(pawn(), world({ blueprint: null }));
  if (i.type !== 'haul') throw new Error('有地上堆应 haul, 实际: ' + i.type);
});

test('#168 thinkPawn: 工作优先于娱乐', () => {
  const i = Res.thinkPawn(pawn({ recreation: 5 }), world({ blueprint: null, drop: null }));
  if (i.type !== 'gather') throw new Error('有规划采集应先干活, 实际: ' + i.type);
});

test('#168 thinkPawn: 无活才娱乐', () => {
  const i = Res.thinkPawn(pawn({ recreation: 5, prio: { sk_gather: 0, sk_build: 0, sk_haul: 0 } }), world({ blueprint: null, drop: null, flora: null }));
  if (i.type !== 'joy') throw new Error('无聊应 joy, 实际: ' + i.type);
});

test('#168 thinkPawn: 没事闲逛', () => {
  const i = Res.thinkPawn(pawn({ prio: { sk_gather: 0, sk_build: 0, sk_haul: 0 } }), world({ blueprint: null, drop: null, flora: null, joy: null }));
  if (i.type !== 'idle') throw new Error('应 idle, 实际: ' + i.type);
});

test('#168 thinkPawn: 有岗位则上岗，不乱跑采集', () => {
  const i = Res.thinkPawn(pawn({ job: 'bl_farm' }), world({ blueprint: null, drop: null }));
  if (i.type !== 'job') throw new Error('有岗位应 job, 实际: ' + i.type);
});

test('#168 thinkPawn: 有岗位不丢下工去满图搬运', () => {
  const i = Res.thinkPawn(pawn({ job: 'bl_farm' }), world({ blueprint: null }));
  if (i.type !== 'job') throw new Error('农民不应被远处地上堆抢走, 实际: ' + i.type);
});
