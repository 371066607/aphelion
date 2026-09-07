/* #167 警报条: 纯函数 collect / focus */
'use strict';
const Alerts = window.APH.Alerts;

test('#167 alerts: 导出 collect/focus', () => {
  if (!Alerts || typeof Alerts.collect !== 'function') throw new Error('缺失 APH.Alerts.collect');
  if (typeof Alerts.focus !== 'function') throw new Error('缺失 APH.Alerts.focus');
});

function snap(over) {
  const s = {
    scene: 'home',
    px: 1100, py: 1100, camX: 400, camY: 400,
    meta: {
      playerNeeds: { food: 80, rest: 100, downed: false, isSleeping: false },
      res: { food: 12, wood: 40, mineral: 40 },
      residents: []
    },
    colony: { buildings: [], buildQueue: [] },
    entities: [],
    war: { raidActive: false }
  };
  if (over) {
    if (over.meta) {
      Object.assign(s.meta, over.meta);
      if (over.meta.playerNeeds) s.meta.playerNeeds = Object.assign({}, s.meta.playerNeeds, over.meta.playerNeeds);
      if (over.meta.res) s.meta.res = Object.assign({}, s.meta.res, over.meta.res);
    }
    if (over.colony) Object.assign(s.colony, over.colony);
    if (over.war) Object.assign(s.war, over.war);
    if (over.entities) s.entities = over.entities;
    if (over.scene) s.scene = over.scene;
    if (over.px != null) s.px = over.px;
    if (over.py != null) s.py = over.py;
  }
  return s;
}

test('#167 alerts: 没事返回空数组', () => {
  const list = Alerts.collect(snap());
  if (!Array.isArray(list) || list.length !== 0) throw new Error('没事应为空: ' + JSON.stringify(list));
  if (Alerts.collect(null).length !== 0) throw new Error('空状态应为空');
});

test('#167 alerts: 远征不报家园警报', () => {
  const list = Alerts.collect(snap({
    scene: 'expedition',
    meta: { playerNeeds: { food: 10 } }
  }));
  if (list.length !== 0) throw new Error('远征不应出家园警报: ' + JSON.stringify(list));
});

test('#167 alerts: 指挥官饥饿', () => {
  const list = Alerts.collect(snap({ meta: { playerNeeds: { food: 40 } } }));
  const hit = list.find(a => a.kind === 'hungry');
  if (!hit) throw new Error('应有饥饿警报: ' + JSON.stringify(list));
  if (hit.text !== '指挥官饥饿') throw new Error('文案: ' + hit.text);
  if (hit.x !== 1100 || hit.y !== 1100) throw new Error('应跳到指挥官坐标');
});

test('#167 alerts: 居民饥饿用其名字与坐标', () => {
  const list = Alerts.collect(snap({
    meta: { residents: [{ id: 'rs_a', name: '青禾', food: 20 }] },
    entities: [{ type: 'resident', rid: 'rs_a', x: 1300, y: 1400 }]
  }));
  const hit = list.find(a => a.kind === 'hungry' && a.text.indexOf('青禾') >= 0);
  if (!hit) throw new Error('应有居民饥饿: ' + JSON.stringify(list));
  if (hit.text !== '青禾饥饿') throw new Error('文案: ' + hit.text);
  if (hit.x !== 1300 || hit.y !== 1400) throw new Error('应跳到居民坐标');
});

test('#167 alerts: 困了但已睡不再报', () => {
  const awake = Alerts.collect(snap({ meta: { playerNeeds: { rest: 10, wantSleep: true } } }));
  if (!awake.some(a => a.kind === 'sleepy' && a.text === '指挥官需要睡觉'))
    throw new Error('清醒困倦应报警: ' + JSON.stringify(awake));
  const asleep = Alerts.collect(snap({ meta: { playerNeeds: { rest: 10, wantSleep: true, isSleeping: true } } }));
  if (asleep.some(a => a.kind === 'sleepy')) throw new Error('睡着不应再报困: ' + JSON.stringify(asleep));
});

test('#167 alerts: 倒地优先于饥饿', () => {
  const list = Alerts.collect(snap({
    meta: { playerNeeds: { food: 10, downed: true } },
    war: { raidActive: true }
  }));
  if (!list.length) throw new Error('应有警报');
  if (list[0].kind !== 'raid') throw new Error('袭击应最优先, 实际: ' + list[0].kind);
  const kinds = list.map(a => a.kind);
  if (kinds.indexOf('downed') < 0 || kinds.indexOf('hungry') < 0)
    throw new Error('倒地与饥饿应同时在列: ' + kinds);
  if (kinds.indexOf('downed') > kinds.indexOf('hungry'))
    throw new Error('倒地应排在饥饿前: ' + kinds);
  const d = list.find(a => a.kind === 'downed');
  if (d.text !== '指挥官倒地') throw new Error('倒地文案: ' + d.text);
});

test('#167 alerts: 仓库没粮', () => {
  const list = Alerts.collect(snap({
    meta: { res: { food: 0 } },
    colony: { buildings: [{ id: 'bl_warehouse', x: 1200, y: 1150 }] }
  }));
  const hit = list.find(a => a.kind === 'no_food');
  if (!hit) throw new Error('仓空应报警: ' + JSON.stringify(list));
  if (hit.text !== '仓库没有口粮') throw new Error('文案: ' + hit.text);
  if (hit.x !== 1200 || hit.y !== 1150) throw new Error('应跳到仓库');
});

test('#167 alerts: 蓝图缺料', () => {
  const list = Alerts.collect(snap({
    meta: { res: { wood: 0, stone: 0, mineral: 0 } },
    colony: { buildQueue: [{ bid: 'bl_house', x: 1250, y: 1180, progress: 0 }] }
  }));
  const hit = list.find(a => a.kind === 'missing');
  if (!hit) throw new Error('缺料应报警: ' + JSON.stringify(list));
  if (hit.text !== '居住舱缺料') throw new Error('文案: ' + hit.text);
  if (hit.x !== 1250 || hit.y !== 1180) throw new Error('应跳到蓝图');
});

test('#167 alerts: focus 把镜头移到警报坐标', () => {
  const s = snap();
  Alerts.focus(s, { x: 1500, y: 1600 });
  if (s.camX !== 1500 || s.camY !== 1600) throw new Error('镜头应跳到 1500,1600 实际: ' + s.camX + ',' + s.camY);
});

/* ---------- 殖民地优先 T3: 入冬预警 ---------- */
function winterState(dayIndex, food, residents){
  const DL = APH.CFG.DAY_LEN;
  return {
    scene: 'home', clock: dayIndex * DL,
    px: 1100, py: 1100, entities: [],
    war: { raidActive:false, raidWarn:0 },
    colony: { buildings: [], buildQueue: [] },
    meta: {
      res: { food: food },
      residents: residents || [],
      playerNeeds: { food: 90, rest: 90, illness: 0, downed: false, isSleeping: false },
    },
  };
}
function hasWinter(list){ return list.some(a => a.kind === 'winter'); }

test('T3 alert: 入冬前存粮不足 → 预警; 存粮充足 → 不吵', () => {
  const per = APH.CFG.seasons.daysPerSeason;
  const warn = APH.CFG.seasons.winterWarnDays;
  const eve = per * 3 - warn;                  // 刚进入预警窗口
  const pop = [{ id:'r1', name:'甲', food:90, rest:90 }];
  const need = APH.Colony.winterFoodNeed(pop.length + 1);   // 由真实经济推导

  const low = APH.Alerts.collect(winterState(eve, 0, pop));
  if (!hasWinter(low)) throw new Error('入冬前缺粮应预警');

  const ok = APH.Alerts.collect(winterState(eve, need + 10, pop));
  if (hasWinter(ok)) throw new Error('存粮充足不应预警(否则是噪音)');
});

test('T3 alert: 距冬还早不预警, 入冬当季缺粮持续预警', () => {
  const per = APH.CFG.seasons.daysPerSeason;
  const pop = [{ id:'r1', name:'甲', food:90, rest:90 }];
  const early = APH.Alerts.collect(winterState(0, 0, pop));
  if (hasWinter(early)) throw new Error('开年距冬还远, 不应预警');

  const inWinter = APH.Alerts.collect(winterState(per * 3 + 1, 0, pop));
  if (!hasWinter(inWinter)) throw new Error('冬天缺粮应持续预警');
});

test('T3 alert: 冬季预警排在袭击/倒地之下, 缺料之上', () => {
  const per = APH.CFG.seasons.daysPerSeason;
  const st = winterState(per * 3, 0, [{ id:'r1', name:'甲', food:90, rest:90 }]);
  st.war.raidActive = true;
  const list = APH.Alerts.collect(st);
  const iRaid = list.findIndex(a => a.kind === 'raid');
  const iWinter = list.findIndex(a => a.kind === 'winter');
  if (iRaid < 0 || iWinter < 0) throw new Error('两条警报都应在场');
  if (!(iRaid < iWinter)) throw new Error('袭击应排在冬季预警之前');
  const P = APH.CFG.alerts.prio;
  if (!(P.winter > P.missing)) throw new Error('冬季预警应高于缺料');
  if (!(P.winter < P.hungry)) throw new Error('冬季预警应低于已经在挨饿');
});
