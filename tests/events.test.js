/* events.js: 事件叙事者 — 财富值/抽卡/喘息窗口/怜悯/导演节奏 */
'use strict';
const Ev = window.APH.Events;
const CFG = window.APH.CFG;
const A = window.APH.U.assert;

function baseCtx(over){
  return Object.assign({
    threat:0, moodAvg:80, sinceNeg:99, cooldowns:{},
    residentCount:2, hasSpareBed:true, hasPasture:true, hasFarm:true,
    hasTurret:true, visitorSlot:true, rivalReady:true, raidActive:false,
  }, over||{});
}
/* 固定 rng 序列 */
function seqRng(vals){
  let i=0;
  return () => vals[Math.min(i++, vals.length-1)];
}

test('wealthScore: 资源+建筑+人口+科技累加且随发展增长', () => {
  const meta0={ res:{mineral:0,food:0,leather:0,med:0}, residents:[], tech:{}, research:0 };
  const w0=Ev.wealthScore(meta0, {}, []);
  A(w0===0, '空殖民地财富应为0, got '+w0);
  const meta1={
    res:{mineral:10,food:5,leather:2,med:1}, residents:[{},{}],
    tech:{te_radar:1}, research:20,
  };
  const w1=Ev.wealthScore(meta1, {mineral:3}, [{id:'bl_farm',lv:1}]);
  // 资源 10+3+5 + 2*2 + 1*3 = 25; 农场 35+15=50; 人口 2*40=80; 科技 40; 研究 20
  A(w1===25+50+80+40+20, '财富合计应为215, got '+w1);
});

test('threatLevel: 随财富阶梯上升且封顶', () => {
  A(Ev.threatLevel(0)===0, '0财富=0威胁');
  A(Ev.threatLevel(CFG.events.wealthPerThreat)===1, '一档财富=1威胁');
  A(Ev.threatLevel(1e9)===CFG.events.threatMax, '威胁封顶');
});

test('pickEvent: 喘息窗口内负面事件被排除', () => {
  const ctx=baseCtx({ sinceNeg:0.5 });          // < restMinutes[0]
  for(let i=0;i<20;i++){
    const p=Ev.pickEvent(ctx, seqRng([i/20]));
    A(p===null || !p.neg, '喘息窗口内不得抽到负面, got '+(p&&p.id));
  }
});
test('pickEvent: restFor 覆盖默认喘息窗口', () => {
  const cds={};
  Object.keys(CFG.events.deck).forEach(id => {
    if(id!=='ev_droppod' && id!=='ev_plague') cds[id]=5;
  });
  const p=Ev.pickEvent(baseCtx({ cooldowns:cds, sinceNeg:3, restFor:4, moodAvg:80 }), seqRng([0.99]));
  A(p===null || !p.neg, 'restFor=4 时 sinceNeg=3 仍挡负面, got '+(p&&p.id));
});

test('pickEvent: 冷却中的卡不参与', () => {
  const cds={};
  Object.keys(CFG.events.deck).forEach(id => { cds[id]=5; });
  delete cds.ev_aurora;
  const p=Ev.pickEvent(baseCtx({ cooldowns:cds }), seqRng([0.5]));
  A(p && p.id==='ev_aurora', '只剩极光可抽, got '+(p&&p.id));
});

test('pickEvent: 资格谓词过滤(无牧场无兽群/无居民无极光疫病)', () => {
  const ctx=baseCtx({ hasPasture:false, residentCount:0, hasFarm:false,
                      hasTurret:false, rivalReady:false, hasSpareBed:false,
                      visitorSlot:false });
  for(let i=0;i<20;i++){
    const p=Ev.pickEvent(ctx, seqRng([i/20]));
    A(p===null || p.id==='ev_droppod', '资格全关时只剩补给舱, got '+(p&&p.id));
  }
});

test('pickEvent: 心情怜悯 — 低心情时负面权重减半', () => {
  // 只留一正一负: 补给舱 w10, 疫病 w8(threat0)
  const cds={};
  Object.keys(CFG.events.deck).forEach(id => {
    if(id!=='ev_droppod' && id!=='ev_plague') cds[id]=5;
  });
  // 高心情: 负面权重8, roll 落在 10~18 抽到疫病
  const hi=Ev.pickEvent(baseCtx({ cooldowns:cds, moodAvg:80 }), seqRng([14/18]));
  A(hi && hi.id==='ev_plague', '高心情按原权重可抽到疫病, got '+(hi&&hi.id));
  // 低心情: 疫病权重4, 同比例 roll 落在正面区
  const lo=Ev.pickEvent(baseCtx({ cooldowns:cds, moodAvg:20 }), seqRng([14/18*(14/18)]));
  A(lo && lo.id==='ev_droppod', '低心情负面权重减半后应偏向正面, got '+(lo&&lo.id));
});

test('pickEvent: 威胁级放大负面权重', () => {
  const cds={};
  Object.keys(CFG.events.deck).forEach(id => {
    if(id!=='ev_droppod' && id!=='ev_plague') cds[id]=5;
  });
  // threat 5: 疫病权重 8*1.75=14; 总 24; roll=0.5 → 12 落在疫病区
  const p=Ev.pickEvent(baseCtx({ cooldowns:cds, threat:5 }), seqRng([0.5]));
  A(p && p.id==='ev_plague', '高威胁应更容易抽到负面, got '+(p&&p.id));
});

test('directorTick: 间隔未到不发事件, 到点才抽', () => {
  let st={ nextIn:1.5, sinceNeg:99, cooldowns:{} };
  const r1=Ev.directorTick(st, baseCtx(), seqRng([0.1,0.1]), 0.5);
  A(r1.fired===null, '1.5分钟间隔第一跳不该发');
  A(Math.abs(r1.state.nextIn-1.0)<1e-9, 'nextIn 应递减0.5, got '+r1.state.nextIn);
  let st2={ nextIn:0.4, sinceNeg:99, cooldowns:{} };
  const r2=Ev.directorTick(st2, baseCtx(), seqRng([0.1,0.1]), 0.5);
  A(r2.fired!==null, '到点应发事件');
  A(r2.state.nextIn>=CFG.events.intervalMin, '发完应重置间隔');
  A((r2.state.cooldowns[r2.fired]||0)>0, '发出的事件应进冷却');
});

test('directorTick: 负面事件重置喘息计时', () => {
  // 只留 ev_raid 可抽(权重最高的负面)
  const cds={};
  Object.keys(CFG.events.deck).forEach(id => { if(id!=='ev_raid') cds[id]=99; });
  const st={ nextIn:0.1, sinceNeg:99, cooldowns:cds };
  const r=Ev.directorTick(st, baseCtx(), seqRng([0.0,0.5]), 0.5);
  A(r.fired==='ev_raid', '应抽到袭击, got '+r.fired);
  A(r.state.sinceNeg===0, '负面事件后 sinceNeg 归零');
});

test('directorTick: 不修改入参状态(纯函数)', () => {
  const st={ nextIn:2, sinceNeg:5, cooldowns:{ ev_plague:3 } };
  Ev.directorTick(st, baseCtx(), seqRng([0.1]), 0.5);
  A(st.nextIn===2 && st.sinceNeg===5 && st.cooldowns.ev_plague===3, '入参不得被改');
});

test('directorTick: 冷却随时间衰减并过期移除', () => {
  const st={ nextIn:9, sinceNeg:99, cooldowns:{ ev_plague:0.6, ev_herd:5 } };
  const r=Ev.directorTick(st, baseCtx(), seqRng([0.1]), 0.5);
  A(Math.abs(r.state.cooldowns.ev_herd-4.5)<1e-9, '冷却应减0.5');
  A(Math.abs(r.state.cooldowns.ev_plague-0.1)<1e-9, '快到期冷却仍在');
  const r2=Ev.directorTick(r.state, baseCtx(), seqRng([0.1]), 0.5);
  A(r2.state.cooldowns.ev_plague===undefined, '过期冷却应移除');
});

test('textOf: 每张卡都有中文名与文案', () => {
  Ev.DECK.forEach(card => {
    const t=Ev.textOf(card.id);
    A(t.name && t.name.length>=2, card.id+' 缺名字');
    A(t.lore && t.lore.length>=10, card.id+' 缺文案');
  });
});

test('deck 配置完整性: DECK 每张卡在 CFG.events.deck 有 w/cd', () => {
  Ev.DECK.forEach(card => {
    const c=CFG.events.deck[card.id];
    A(c && c.w>0 && c.cd>0, card.id+' 缺 CFG 配置');
  });
});
