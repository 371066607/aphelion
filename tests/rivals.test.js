
/* rivals.js: AI成长/袭击决策/warScore/波次 */
'use strict';
const R = window.APH.Rivals;

test('growthTick: aggressive 军事增长快于经济', () => {
  const r = { military:10, economy:10, trait:'aggressive' };
  const g = R.growthTick(r, 10);
  const dMil = g.military-10, dEco = g.economy-10;
  if(!(dMil > dEco)) throw new Error('aggressive 应军>经: '+dMil+' vs '+dEco);
  if(r.military!==10) throw new Error('原对象被修改(应纯函数)');
});
test('growthTick: trader 经济增长快于军事', () => {
  const g = R.growthTick({military:10,economy:10,trait:'trader'},10);
  if(!((g.economy-10) > (g.military-10))) throw new Error('trader 应经>军');
});
test('shouldRaid: 军力不足1.3倍防御 → 不袭', () => {
  const r = { military:20, trait:'aggressive' };
  const d = R.shouldRaid(r, 30, 99);          // 20 < 39
  if(d.should) throw new Error('军力不足不应袭击');
});
test('shouldRaid: 优势+愤怒满 → 袭', () => {
  const r = { military:60, trait:'aggressive' };
  const d = R.shouldRaid(r, 20, 10);           // 60>26, anger10>4.4
  if(!d.should) throw new Error('优势应袭击: '+d.reason);
});
test('shouldRaid: trader 几乎不打(愤怒需求×4)', () => {
  const r = { military:100, trait:'trader' };
  const early = R.shouldRaid(r, 20, 10);
  if(early.should) throw new Error('trader anger=10 不该打');
  const late = R.shouldRaid(r, 20, 20);
  if(!late.should) throw new Error('trader 愤怒极久仍应打');
});
test('warScore: 边界 0~100 且军力占主导', () => {
  if(R.warScore(0,100,0,0)!==60) throw new Error('全优势应60');
  if(R.warScore(100,0,0,0)!==0) throw new Error('全劣势应0');
  const w = R.warScore(50,50,3,2);
  if(w!==30+9+4) throw new Error('50/50+战果应=43 got '+w);   // base30+wins9+raids4
});
test('raidWave: 规模随军力阶梯上升(总兵力)', () => {
  const a=R.raidWave({military:15}), b=R.raidWave({military:40}),
        c=R.raidWave({military:70}), d=R.raidWave({military:120});
  if(!(a.total<b.total && b.total<c.total && c.total<d.total))
    throw new Error('阶梯应递增: '+[a.total,b.total,c.total,d.total]);
  if(a.elite||b.elite) throw new Error('低阶不应elite');
  if(!c.elite||!d.elite) throw new Error('高阶应elite');
});

/* ---- 阶段E: 战术分流 ---- */
test('raidWave: trait → 战术分流(强攻/盗掠/围攻)', () => {
  if(R.raidWave({military:40,trait:'aggressive'}).tactic!=='assault')
    throw new Error('aggressive 应强攻');
  if(R.raidWave({military:40,trait:'trader'}).tactic!=='pillage')
    throw new Error('trader 应盗掠');
  if(R.raidWave({military:40,trait:'expansionist'}).tactic!=='siege')
    throw new Error('expansionist 应围攻');
  if(R.raidWave({military:40}).tactic!=='assault')
    throw new Error('无 trait 应回退强攻');
});
test('raidWave: 战术兵力系数——强攻×1.2 盗掠×0.7', () => {
  const base=5;                                 // military 40 档
  const a=R.raidWave({military:40,trait:'aggressive'});
  const p=R.raidWave({military:40,trait:'trader'});
  if(a.count!==Math.round(base*1.2)) throw new Error('强攻应'+Math.round(base*1.2)+' got '+a.count);
  if(p.count!==Math.round(base*0.7)) throw new Error('盗掠应'+Math.round(base*0.7)+' got '+p.count);
  if(p.count>=a.count) throw new Error('盗掠兵力应低于强攻');
});
test('raidWave: 军力≥90 拆两波且总量不缩水', () => {
  const d=R.raidWave({military:120,trait:'aggressive'});
  if(d.waves!==2) throw new Error('全面进攻应拆2波');
  if(d.total<10) throw new Error('两波合计不应少于原10×1.2的一半×2, got '+d.total);
  if(d.count*d.waves!==d.total) throw new Error('total 应=count×waves');
  const c=R.raidWave({military:70,trait:'aggressive'});
  if(c.waves!==1) throw new Error('军力<90 应单波');
});
test('raidWave: label 带战术前缀', () => {
  const w=R.raidWave({military:40,trait:'expansionist'});
  if(w.label.indexOf('围攻')!==0) throw new Error('label 应带战术前缀 got '+w.label);
});

/* ---- D1: 势力外交与战略威慑 (Issue #104) ---- */
test('defaultRelationOf: 按 trait 分流初始好感', () => {
  if(R.defaultRelationOf('aggressive') !== -40) throw new Error('aggressive 初始应 -40');
  if(R.defaultRelationOf('expansionist') !== -15) throw new Error('expansionist 初始应 -15');
  if(R.defaultRelationOf('trader') !== 20) throw new Error('trader 初始应 20');
  if(R.defaultRelationOf('unknown') !== -20) throw new Error('未知 trait 兜底应 -20');
});

test('relationTierOf: 三级状态机划分', () => {
  if(R.relationTierOf(-50) !== 'hostile') throw new Error('-50 应为 hostile');
  if(R.relationTierOf(-31) !== 'hostile') throw new Error('-31 应为 hostile');
  if(R.relationTierOf(-30) !== 'neutral') throw new Error('-30 应为 neutral');
  if(R.relationTierOf(0) !== 'neutral') throw new Error('0 应为 neutral');
  if(R.relationTierOf(40) !== 'neutral') throw new Error('40 应为 neutral');
  if(R.relationTierOf(41) !== 'allied') throw new Error('41 应为 allied');
  if(R.relationTierOf(100) !== 'allied') throw new Error('100 应为 allied');
});

test('sendTribute: 资源充足纳贡成功并平息怒气与撤销袭击', () => {
  const rs = { rival: { trait:'aggressive', military:40 }, relation:-40, anger:10, wantRaid:true };
  const res = R.sendTribute(rs, 'mineral', 20);
  if(!res.success) throw new Error('纳贡应成功');
  if(res.cost !== 15) throw new Error('矿石消耗应为 15 got '+res.cost);
  if(res.newState.relation !== -25) throw new Error('关系度应升至 -25 got '+res.newState.relation);
  if(res.newState.anger !== 4) throw new Error('怒气应扣减6分至4 got '+res.newState.anger);
  if(res.newState.wantRaid !== false) throw new Error('wantRaid 应被化解');
  if(rs.relation !== -40) throw new Error('原状态对象应保持纯函数不变');
});

test('sendTribute: 资源不足纳贡失败', () => {
  const rs = { rival: { trait:'aggressive' }, relation:-40, anger:10 };
  const res = R.sendTribute(rs, 'mineral', 10);
  if(res.success) throw new Error('资源不足不应成功');
  if(!res.reason) throw new Error('失败应有原因');
});

test('signTradePact: 关系达标签署通商协定', () => {
  const rs = { rival: { trait:'trader' }, relation:10, pact:false };
  const res = R.signTradePact(rs, 30);
  if(!res.success) throw new Error('签署通商协定应成功');
  if(!res.newState.pact) throw new Error('pact 应置为 true');
  if(res.newState.relation !== 20) throw new Error('签署条约应加好感');
});

test('signTradePact: 负关系拒绝签署通商', () => {
  const rs = { rival: { trait:'aggressive' }, relation:-20, pact:false };
  const res = R.signTradePact(rs, 50);
  if(res.success) throw new Error('负关系不应允许通商');
});

test('deterRival: 压倒性防御威慑成功', () => {
  const rs = { rival: { military:30 }, wantRaid:true, cowedTime:0 };
  const res = R.deterRival(rs, 40); // 40 >= 30*1.2 (36)
  if(!res.success) throw new Error('防御超1.2倍威慑应成功');
  if(res.newState.cowedTime <= 0) throw new Error('cowedTime 应设置');
  if(res.newState.wantRaid !== false) throw new Error('威慑应打消 wantRaid');
});

test('deterRival: 防御不足威慑失败', () => {
  const rs = { rival: { military:30 }, wantRaid:true };
  const res = R.deterRival(rs, 30); // 30 < 36
  if(res.success) throw new Error('防御不足威慑应失败');
});

test('applyBaseRaid: 远征基地击破战略重创', () => {
  const rs = { rival: { military:50, economy:40 }, relation:-20, anger:8, wantRaid:true };
  const next = R.applyBaseRaid(rs);
  if(next.rival.military !== 35) throw new Error('军力应削减30%至35 got '+next.rival.military);
  if(next.anger !== 0) throw new Error('怒气应清零');
  if(next.wantRaid !== false) throw new Error('wantRaid 应取消');
  if(next.cowedTime <= 0) throw new Error('应获得畏缩期');
  if(next.relation !== -35) throw new Error('摧毁基地关系应降15点');
});

test('growthTick: 畏缩期间军力不增长', () => {
  const r = { military:20, economy:20, trait:'aggressive' };
  const g = R.growthTick(r, 1, 100); // cowedTime = 100
  if(g.military !== 20) throw new Error('畏缩期军力不应增长');
  if(g.economy <= 20) throw new Error('经济仍应增长');
});

test('shouldRaid: 盟友绝不袭击 / 畏缩期不袭击 / 中立门槛提高', () => {
  const r = { military:80, trait:'aggressive' };
  // 盟友
  const dAllied = R.shouldRaid(r, 20, 99, 60, 0); // relation=60
  if(dAllied.should) throw new Error('盟友绝不袭击');
  // 畏缩期
  const dCowed = R.shouldRaid(r, 20, 99, -50, 60); // cowedTime=60
  if(dCowed.should) throw new Error('畏缩期不袭击');
  // 中立门槛提高 (军力需要 1.5 倍)
  // playerDef=50, 50*1.3=65, 50*1.5=75. r.military=70. 宿敌会打, 中立不打
  const dHostile = R.shouldRaid({ military:70, trait:'aggressive' }, 50, 20, -40, 0);
  const dNeutral = R.shouldRaid({ military:70, trait:'aggressive' }, 50, 20, 0, 0);
  if(!dHostile.should) throw new Error('宿敌70>65应袭击');
  if(dNeutral.should) throw new Error('中立70<75不应袭击');
});

