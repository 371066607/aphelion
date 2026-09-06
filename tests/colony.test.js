
/* colony.js: 建筑目录/建造校验/生产tick/科技树 */
'use strict';
const U2 = window.APH.U, Colony = window.APH.Colony;

test('建筑目录: 全部 bl_ 前缀, 发射台免费且唯一', () => {
  const L = Colony.list();
  for(const id in L){ if(!id.startsWith('bl_')) throw new Error('前缀违规:'+id); }
  if(L.bl_landing_pad.cost !== 0) throw new Error('发射台应免费');
});

test('canPlace: 无限建造跳过材料和科技', () => {
  const noMat = Colony.canPlace([], {}, 'bl_warehouse', 600, 600, { wood:0, iron:0 }, true);
  if(!noMat.ok) throw new Error('freeBuild 没木头也应放, 原因: '+noMat.why);
  const noTech = Colony.canPlace([], {}, 'bl_spike_trap', 500, 500, { stone:0, wood:0 }, true);
  if(!noTech.ok) throw new Error('freeBuild 没科技也应放, 原因: '+noTech.why);
  const overlap = Colony.canPlace([{id:'bl_warehouse',x:600,y:600}], {}, 'bl_warehouse', 600, 600, {}, true);
  if(overlap.ok) throw new Error('freeBuild 仍不可重叠');
});

test('canPlace: 建材不足拒绝', () => {
  const r = Colony.canPlace([], {}, 'bl_warehouse', 600, 600, { wood:0, iron:0 });
  if(r.ok) throw new Error('木材0 < 20 应拒绝');
});
test('canPlace: 数量上限拒绝', () => {
  const bs=[{id:'bl_warehouse',x:500,y:500},{id:'bl_warehouse',x:800,y:500},{id:'bl_warehouse',x:500,y:900}];
  const r = Colony.canPlace(bs, 999, 'bl_warehouse', 700, 700);
  if(r.ok) throw new Error('仓库max=3 第4座应拒绝');
});
test('canPlace: 离核心太近 / 建筑重叠 拒绝', () => {
  // CFG.HAB = {x:1100,y:1100}
  let r = Colony.canPlace([], 999, 'bl_warehouse', 1130, 1100);
  if(r.ok) throw new Error('核心区130px内应拒绝');
  r = Colony.canPlace([{id:'bl_mine',x:600,y:600}], 999, 'bl_lab', 615, 608);
  if(r.ok) throw new Error('重叠应拒绝');
});
test('canPlace: 矿材不足拒绝', () => {
  const r = Colony.canPlace([], 999, 'bl_warehouse', 600, 600, 0);
  if(r.ok) throw new Error('矿材0 < 20 应拒绝');
  if(r.why.indexOf('矿材')<0) throw new Error('原因应提矿材: '+r.why);
});
test('productionTick: 无人不上岗则不产', () => {
  const meta={ research:0, res:{mineral:0} };
  const out = Colony.productionTick(meta, [
    {id:'bl_mine'},{id:'bl_mine'},{id:'bl_lab'},
  ], []);
  if(out.mineral!==0||out.research!==0) throw new Error('无人应0: '+JSON.stringify(out));
});
test('productionTick: 采矿机+2矿/实验室+1研究(有人)', () => {
  const meta={ research:0, res:{mineral:0} };
  const mk=()=>({job:'bl_mine', skills:{sk_craft:0}, mood:60, food:50});
  const lb=()=>({job:'bl_lab', skills:{}, mood:60, food:50});
  const out = Colony.productionTick(meta, [
    {id:'bl_mine'},{id:'bl_mine'},{id:'bl_lab'},
  ], [mk(), mk(), lb()]);
  if(out.mineral!==4||out.research!==1) throw new Error('产出错误 '+JSON.stringify(out));
  if(meta.research!==1) throw new Error('研究应入账');
  if((meta.res.mineral||0)!==0) throw new Error('矿应堆地上不入仓: '+meta.res.mineral);
  if(!out.piles || out.piles.length!==2) throw new Error('应两堆矿: '+JSON.stringify(out.piles));
});

test('科技树: te_前缀 + canBuy 边界', () => {
  const T = Colony.TECHS;
  for(const id in T){
    if(!id.startsWith('te_')) throw new Error('id规范: '+id);
    if(T[id].cost<=0) throw new Error('成本非法');
  }
  const meta={research:30};
  let r = Colony.canBuy(meta,'te_o2tank',{});
  if(r.ok) throw new Error('research=30 < cost=40 应不可购');   // 修复: 断言方向写反
  meta.research=100;
  r = Colony.canBuy(meta,'te_o2tank',{te_o2tank:3});
  if(r.ok) throw new Error('满级应拒绝');
});
test('buyTech: 扣费+升级+效果由applyTech解释(数据分离)', () => {
  const meta={research:100};
  const r1=Colony.buyTech(meta,'te_o2tank',{});
  if(!r1.ok || r1.owned.te_o2tank!==1) throw new Error('购买失败');
  if(meta.research!==60) throw new Error('未扣费: '+meta.research);
  const r2=Colony.buyTech(meta,'te_weaponry',r1.owned);
  if(!r2.ok) throw new Error('第二个科技应可购');
  if(!r2.owned.te_weaponry) throw new Error('独立计数失效');
});

test('buildQueue v2: 玩家在场进度增长', () => {
  let q=[{bid:'bl_mine',x:600,y:600,total:20,progress:0}];
  const r=Colony.queueTick(q, 2, {x:610,y:610}, 0);   // 玩家在旁
  if (r.done.length!==0) throw new Error('不应完工');
});
test('buildQueue v2: 玩家离开进度冻结', () => {
  let q=[{bid:'bl_mine',x:600,y:600,total:20,progress:0.5}];
  const r=Colony.queueTick(q, 5, {x:2000,y:2000}, 0);  // 玩家远离
  if (r.queue[0].progress !== 0.5) throw new Error('离场进度应冻结');
  if (r.queue[0].building !== false) throw new Error('building应为false');
});
test('buildQueue v2: 进度满完工出队', () => {
  let q=[{bid:'bl_mine',x:600,y:600,total:20,progress:0.9}];
  const r=Colony.queueTick(q, 5, {x:605,y:605}, 0);
  if (r.done.length!==1 || r.done[0].bid!=='bl_mine') throw new Error('应完工');
});
test('builderBonusOf: 最高建造技能×0.15', () => {
  const a={skills:{sk_build:4}}, b={skills:{sk_build:8}};
  if (Colony.builderBonusOf([a])!==0.6) throw new Error('技能4→0.6');
  if (Colony.builderBonusOf([a,b])!==1.2) throw new Error('取最高8→1.2');
});

test('canUpgrade: 费用与上限校验', () => {
  const def = Colony.get('bl_mine');
  const r = Colony.canUpgrade({id:'bl_mine',lv:1}, def, 1000);
  if (!r.ok) throw new Error('Lv1应可升: '+r.why);
  const r2 = Colony.canUpgrade({id:'bl_mine',lv:4}, def, 99999);
  if (r2.ok) throw new Error('超上限应拒绝');
});
test('upgradeCost: 1.6倍指数曲线', () => {
  if (Colony.upgradeCost({cost:45},0) !== 45) throw new Error('lv0=基础价');
  if (Colony.upgradeCost({cost:45},1) !== 72) throw new Error('lv1=72');
});
test('mineOutput/labOutput: 随等级线性', () => {
  if (Colony.mineOutput(1)!==2||Colony.mineOutput(3)!==6) throw new Error('矿产出错误');
  if (Colony.labOutput(undefined)!==1) throw new Error('默认lv=1');
});
test('productionTick: 消费建筑等级', () => {
  const meta={research:0,res:{mineral:0}};
  const w={job:'bl_mine', skills:{sk_craft:0}, mood:60, food:50};
  const l={job:'bl_lab', skills:{}, mood:60, food:50};
  const out=Colony.productionTick(meta,[{id:'bl_mine',lv:3},{id:'bl_lab'}], [w,l]);
  if(out.mineral!==6||meta.research!==1) throw new Error('等级产出未生效: '+JSON.stringify(out));
  if((meta.res.mineral||0)!==0) throw new Error('矿应堆地上');
});

test('housingCapacity: 基础2+房3×lv+医疗1', () => {
  if (Colony.housingCapacity([]) !== 2) throw new Error('空=2');
  const cap = Colony.housingCapacity([{id:'bl_house',lv:1},{id:'bl_clinic'}]);
  if (cap !== 6) throw new Error('应6: '+cap);
});
test('refundOf: 半价退款, 发射台不可拆', () => {
  if (Colony.refundOf(Colony.get('bl_mine')) !== 22) throw new Error('45半价=22');
  if (Colony.refundOf(Colony.get('bl_landing_pad')) !== 0) throw new Error('pad不可拆');
});

/* ---- 2026-08-25 建筑系统QA回归 ---- */
test('carryMaxOf: 仓库加成纯函数化(重启不丢/拆除自动回退)', () => {
  const base = window.APH.CFG.player.carryMax;   // 40
  if (Colony.carryMaxOf([]) !== base) throw new Error('无仓库=基础'+base);
  if (Colony.carryMaxOf([{id:'bl_warehouse'},{id:'bl_warehouse'}]) !== base+40)
    throw new Error('两仓库应+'+40);
  if (Colony.carryMaxOf([{id:'bl_mine',lv:3}]) !== base) throw new Error('非仓库不加成');
});

test('buildColonyWorld: 实体重建保留lv(重载后炮塔不退1级)', () => {
  const prevEnt = window.APH.Ent;
  window.APH.Ent = { makeRock:(x,y)=>({id:'rock',type:'rock',x,y}) };
  try{
    window.APH.state = { colony:{ buildings:[
        {id:'bl_turret',x:1500,y:900,lv:3},
        {id:'bl_mine',x:800,y:800,lv:2},
      ], buildQueue:[] } };
    Colony.buildColonyWorld(42);
    const t = window.APH.state.entities.find(e=>e.bid==='bl_turret');
    const m = window.APH.state.entities.find(e=>e.bid==='bl_mine');
    if (!t || t.lv!==3) throw new Error('炮塔实体lv应=3, 实际='+(t&&t.lv));
    if (!m || m.lv!==2) throw new Error('采矿机实体lv应=2');
  } finally { window.APH.Ent = prevEnt; }
});

test('buildColonyWorld: 施工队列重实体化为蓝图(重载后蓝图仍可见)', () => {
  const prevEnt = window.APH.Ent;
  window.APH.Ent = { makeRock:(x,y)=>({id:'rock',type:'rock',x,y}) };
  try{
    window.APH.state = { colony:{ buildings:[{id:'bl_house',x:1400,y:1300,lv:1}],
      buildQueue:[{bid:'bl_farm',x:900,y:900,total:15,progress:0.4}] } };
    Colony.buildColonyWorld(42);
    const bp = window.APH.state.entities.find(e=>e.type==='blueprint');
    if (!bp || bp.bid!=='bl_farm') throw new Error('蓝图实体应重建');
    if (bp.progress!==0.4) throw new Error('蓝图进度应保留');
  } finally { window.APH.Ent = prevEnt; }
});

/* ---- 占位格(2026-08-25: 建筑不再全是1格) ---- */
test('footprintOf: cells×48格网', () => {
  const f1=Colony.footprintOf('bl_warehouse'), f2=Colony.footprintOf('bl_turret');
  if(f1.w!==96||f1.h!==96) throw new Error('2x2应96px: '+JSON.stringify(f1));
  if(f2.w!==48||f2.h!==48) throw new Error('1x1应48px: '+JSON.stringify(f2));
});
test('canPlace: 占位矩形碰撞——贴邻拒绝/隔空可放/1x1与2x2混排', () => {
  // warehouse 2x2(96px) 中心600 → 占位552-648
  let r=Colony.canPlace([{id:'bl_warehouse',x:600,y:600}], 999, 'bl_warehouse', 690, 600);
  if(r.ok) throw new Error('中心距90<96 应重叠拒绝');
  r=Colony.canPlace([{id:'bl_warehouse',x:600,y:600}], 999, 'bl_warehouse', 760, 600);
  if(!r.ok) throw new Error('中心距160>96 应可放: '+(r&&r.why));
  // 1x1炮塔侵入2x2仓库占位
  r=Colony.canPlace([{id:'bl_warehouse',x:600,y:600}], 999, 'bl_turret', 660, 600);
  if(r.ok) throw new Error('1x1距60<72 应拒绝');
  r=Colony.canPlace([{id:'bl_warehouse',x:600,y:600}], 999, 'bl_turret', 700, 600);
  if(!r.ok) throw new Error('1x1距100>72 应可放: '+(r&&r.why));
});
test('建筑目录: 大建筑2x2/小建筑1x1 且带dispH', () => {
  const L=Colony.list();
  ['bl_warehouse','bl_barracks','bl_lab','bl_farm','bl_pasture','bl_house','bl_clinic','bl_workshop'].forEach(id=>{
    if(!L[id].cells || L[id].cells[0]!==2) throw new Error(id+' 应2x2');
    if(!L[id].dispH) throw new Error(id+' 缺dispH');
  });
  ['bl_mine','bl_turret'].forEach(id=>{
    if(!L[id].cells || L[id].cells[0]!==1) throw new Error(id+' 应1x1');
  });
});

/* ---- U6 畜牧群增长(2026-08-26): herd自然增长+产肉/皮 ---- */
test('ranchTick: 无牧民不增长不产肉不出皮', () => {
  const p={herd:2, lv:1}, res={};
  const o=Colony.ranchTick(p, 0, res, ()=>0.01);   // 必中增长窗
  if(o.grew) throw new Error('无牧民(skill=0)不应增长');
  if(o.foodGain!==0) throw new Error('无牧民不应产肉: '+o.foodGain);
  if(res.food) throw new Error('res.food不应入账');
  if(o.leatherGain!==0||res.leather) throw new Error('skill=0不应产皮');
});
test('ranchTick: 增长概率受技能调制且封顶cap=3+lv*2', () => {
  const p={herd:7, lv:2};                          // cap=7 已满
  const o=Colony.ranchTick(p, 5, {}, ()=>0.0);
  if(o.grew||p.herd!==7) throw new Error('满cap不应增长');
  const p2={herd:6, lv:2};
  const o2=Colony.ranchTick(p2, 0.01, {}, ()=>0.05); // 概率0.22*(1+0.06*0.01)≈0.22>0.05
  if(!o2.grew||p2.herd!==7) throw new Error('低概率窗内rand<prob应增长');
});
test('ranchTick: 皮革阈值3只起, 随herd/等级线性', () => {
  const a=Colony.ranchTick({herd:2, lv:1}, 3, {}, ()=>0.99); // herd=2<3 无皮
  if(a.leatherGain) throw new Error('herd<3不应产皮');
  const b=Colony.ranchTick({herd:3, lv:1}, 3, {}, ()=>0.99); // floor(3/3)=1皮
  if(b.leatherGain!==1) throw new Error('herd=3应+1皮: '+b.leatherGain);
  const c=Colony.ranchTick({herd:6, lv:1}, 3, {}, ()=>0.99); // floor(6/3)=2皮
  if(c.leatherGain!==2) throw new Error('herd=6应+2皮: '+c.leatherGain);
  const d=Colony.ranchTick({herd:4, lv:2}, 3, {}, ()=>0.99); // floor((4+1)/3)=1皮
  if(d.leatherGain!==1) throw new Error('lv2 her=4应+1皮: '+d.leatherGain);
});
test('畜牧圈升级: 皮革专属货币, 研究点不可替代', () => {
  const def=Colony.get('bl_pasture');
  if(!def.upg||def.upg.costRes!=='leather') throw new Error('pasture应costRes=leather');
  const cost=Colony.upgradeCost(def,1);            // round(55*1.6)=88
  let r=Colony.canUpgrade({lv:1}, def, 9999, 87);
  if(r.ok) throw new Error('皮革不足应拒绝');
  if(r.why.indexOf('皮革')<0) throw new Error('拒绝原因应提皮革: '+r.why);
  r=Colony.canUpgrade({lv:1}, def, 9999, 88);
  if(!r.ok||r.costRes!=='leather'||r.cost!==88) throw new Error('皮革够88应可升');
  r=Colony.canUpgrade({lv:2}, def, 9999, 999);
  if(r.ok) throw new Error('maxLv=2已达顶');
});
test('ranchTick: 效率打折减产', () => {
  const o1=Colony.ranchTick({herd:6, lv:1}, 3, {}, ()=>0.99, 1);
  const o2=Colony.ranchTick({herd:6, lv:1}, 3, {}, ()=>0.99, 0.4);
  if(!(o2.foodGain < o1.foodGain)) throw new Error('病牧应少肉: '+o2.foodGain+' vs '+o1.foodGain);
  if(!(o2.leatherGain < o1.leatherGain)) throw new Error('病牧应少皮: '+o2.leatherGain+' vs '+o1.leatherGain);
});
test('ranchTick: herdMul 本跳产出×3 并消耗', () => {
  const p={herd:6, lv:1, herdMul:3};
  const o=Colony.ranchTick(p, 3, {}, ()=>0.99, 1);
  if(o.foodGain!==9) throw new Error('肉应×3=9 got '+o.foodGain);
  if(o.leatherGain!==6) throw new Error('皮应×3=6 got '+o.leatherGain);
  if(p.herdMul!==1) throw new Error('herdMul 应用后应收口');
});

test('queueTick: 居民坐标数组可施工, 远离冻结', () => {
  let q=[{bid:'bl_mine',x:600,y:600,total:20,progress:0.5}];
  let r=Colony.queueTick(q, 5, [{x:2000,y:2000},{x:605,y:605}], 0);
  if(r.queue[0].progress<=0.5) throw new Error('工人在旁应推进');
  const progressed=r.queue[0].progress;
  r=Colony.queueTick(r.queue, 5, [{x:2000,y:2000}], 0);
  if(r.queue[0].progress!==progressed) throw new Error('无人应冻结');
});
test('shortageBrief: 缺矿/缺粮紧急', () => {
  const a=Colony.shortageBrief({res:{mineral:0,food:0},residents:[{}]}, []);
  if(!a.urgent || a.mission.indexOf('食物')<0) throw new Error('无粮应催补给: '+JSON.stringify(a));
  const b=Colony.shortageBrief({res:{mineral:5,food:99},residents:[]}, []);
  if(!b.urgent || b.mission.indexOf('矿材')<0) throw new Error('缺矿应催矿: '+JSON.stringify(b));
});
test('shortageBrief: 有病人无药时提示工坊', () => {
  const a=Colony.shortageBrief({
    res:{mineral:40,food:99,med:0},
    residents:[{illness:55,job:'bl_farm'}]
  }, []);
  if(a.urgent) throw new Error('粮矿足不应紧急: '+JSON.stringify(a));
  if(a.text.indexOf('生病')<0) throw new Error('应提生病: '+a.text);
});
test('cycleJob: 在已有建筑间轮转并锁岗', () => {
  const r={job:null};
  Colony.cycleJob(r, [{id:'bl_farm'},{id:'bl_mine'}]);
  if(r.job!=='bl_farm' || !r.jobLocked) throw new Error('应转到农场: '+r.job);
  Colony.cycleJob(r, [{id:'bl_farm'},{id:'bl_mine'}]);
  if(r.job!=='bl_mine') throw new Error('下一岗矿机: '+r.job);
});
test('cycleJob: 有医疗舱时可转到诊所岗', () => {
  const r={job:'bl_lab'};
  Colony.cycleJob(r, [{id:'bl_lab'},{id:'bl_clinic'}]);
  if(r.job!=='bl_clinic') throw new Error('实验室下一岗应是医疗舱: '+r.job);
  const no={job:null};
  Colony.cycleJob(no, [{id:'bl_farm'}]);
  if(no.job!=='bl_farm') throw new Error('无舱时循环不应出现诊所: '+no.job);
});
test('harvestMods: 无法则不修正', () => {
  const m=Colony.harvestMods([], 0, true);
  if(m.farmMul!==1||m.labMul!==1||m.acid||m.storm) throw new Error(JSON.stringify(m));
});
test('harvestMods: 夜间酸雨减农, 白天不减', () => {
  const laws=[{id:'lw_night_acid'}];
  const n=Colony.harvestMods(laws, 0, true);
  if(n.farmMul!==0.5||!n.acid) throw new Error('夜间应减半: '+JSON.stringify(n));
  const d=Colony.harvestMods(laws, 0, false);
  if(d.farmMul!==1||d.acid) throw new Error('白天不应酸雨: '+JSON.stringify(d));
});
test('harvestMods: 磁暴窗口停实验室', () => {
  const laws=[{id:'lw_storm'}];
  const on=Colony.harvestMods(laws, 10, false);
  if(on.labMul!==0||!on.storm) throw new Error('窗内应停: '+JSON.stringify(on));
  const off=Colony.harvestMods(laws, 40, false);
  if(off.labMul!==1||off.storm) throw new Error('窗外应正常: '+JSON.stringify(off));
});
test('productionTick: 磁暴 labMul=0 不产研究', () => {
  const meta={research:0,res:{mineral:0}};
  const l={job:'bl_lab', skills:{}, mood:80, food:80};
  const out=Colony.productionTick(meta,[{id:'bl_lab'}], [l], {labMul:0});
  if(out.research!==0||meta.research!==0) throw new Error('磁暴应0研究');
});
test('climateLaws: 同 seed 确定, 1~2条且仅酸雨/磁暴', () => {
  const a=Colony.climateLaws(42), b=Colony.climateLaws(42), c=Colony.climateLaws(99);
  if(JSON.stringify(a)!==JSON.stringify(b)) throw new Error('应确定');
  [a,c].forEach(ls=>{
    if(ls.length<1||ls.length>2) throw new Error('应1~2条: '+ls.length);
    ls.forEach(l=>{
      if(l.id!=='lw_night_acid'&&l.id!=='lw_storm') throw new Error('非法id '+l.id);
    });
  });
});
test('refundMineralOf: 半价矿材, 发射台0', () => {
  if(Colony.refundMineralOf(Colony.get('bl_warehouse'))!==10) throw new Error('20半价=10');
  if(Colony.refundMineralOf(Colony.get('bl_landing_pad'))!==0) throw new Error('pad矿退0');
});
test('workshopTick: 无人不产, 有人扣矿产药, 矿不够停工', () => {
  const res={mineral:10, med:0};
  const o0=Colony.workshopTick(null, res, 1);
  if(o0.med!==0||res.mineral!==10) throw new Error('无人不应动仓');
  const w={skills:{sk_craft:0}, mood:80, food:90, illness:0};
  const o=Colony.workshopTick(w, res, 1);
  if(o.spent!==2||res.mineral!==8) throw new Error('应扣2矿: '+res.mineral);
  if(!(o.med>=1)||res.med) throw new Error('药应返回但不入仓: '+JSON.stringify(o)+' med='+res.med);
  const poor={mineral:1, med:0};
  Colony.workshopTick(w, poor, 1);
  if(poor.mineral!==1||poor.med) throw new Error('矿不够不应产');
});
test('cycleJob: 有工坊可转到手工岗', () => {
  const r={job:'bl_mine'};
  Colony.cycleJob(r, [{id:'bl_mine'},{id:'bl_workshop'}]);
  if(r.job!=='bl_workshop') throw new Error('矿下一岗应是工坊: '+r.job);
});
test('collectHome: 矿粮药入仓, 遗件变研究点', () => {
  const meta={research:0, res:{mineral:0, food:0, med:0}};
  const a=Colony.collectHome(meta,'it_mineral',2);
  if(a.kind!=='stock'||meta.res.mineral!==2) throw new Error('矿应入仓');
  Colony.collectHome(meta,'it_alloy',1);
  if(meta.res.mineral!==5) throw new Error('合金×3: '+meta.res.mineral);
  Colony.collectHome(meta,'it_food',3);
  if(meta.res.food!==3) throw new Error('粮应入仓');
  const b=Colony.collectHome(meta,'it_relic',1);
  if(b.kind!=='research'||meta.research!==40) throw new Error('遗件应变研究点');
});
test('serializeGround: 地上堆+搬运中的都记下', () => {
  const T=window.APH.CFG.entType;
  const g=Colony.serializeGround([
    {type:T.DROPPED, itemId:'it_food', n:3, x:1, y:2},
    {type:T.DROPPED, itemId:'it_med', n:1, x:3, y:4, dead:true},
    {type:T.RESIDENT, haulCarry:{itemId:'it_mineral', n:2}, x:5, y:6},
  ]);
  if(g.length!==2) throw new Error('死堆不应入档: '+g.length);
  if(g[0].itemId!=='it_food'||g[1].itemId!=='it_mineral') throw new Error(JSON.stringify(g));
});
test('stockOf/takeStock: 先仓后堆, 搬运途中不计', () => {
  const T=window.APH.CFG.entType;
  const pile={type:T.DROPPED, itemId:'it_food', n:5, x:10, y:40};
  const haul={type:T.RESIDENT, haulCarry:{itemId:'it_food', n:9}, x:0, y:40};
  const ents=[pile, haul];
  if(Colony.groundCount(ents,'food')!==5) throw new Error('搬运中不应计入地上');
  if(Colony.stockOf({food:2}, ents, 'food')!==7) throw new Error('仓+地应合计');
  const res={food:2};
  const t=Colony.takeStock(res, ents, 'food', 3);
  if(!t.ok || t.fromRes!==2 || t.fromGround!==1 || res.food!==0) throw new Error(JSON.stringify(t)+' res='+res.food);
  if(pile.n!==4) throw new Error('应从地上再扣1: '+pile.n);
});
test('ensureStock: 合金整件补仓, takeStock 不拆件', () => {
  const T=window.APH.CFG.entType;
  const a={type:T.DROPPED, itemId:'it_alloy', n:1, x:10, y:40};
  const res={mineral:0};
  if(!Colony.ensureStock(res, [a], 'mineral', 2) || res.mineral!==3 || !a.dead)
    throw new Error('合金应整件入仓: '+res.mineral+' dead='+a.dead);
  const b={type:T.DROPPED, itemId:'it_alloy', n:1, x:10, y:40};
  const t=Colony.takeStock({mineral:0}, [b], 'mineral', 2);
  if(t.ok || (b.n||0)!==1) throw new Error('takeStock 不应拆合金: '+JSON.stringify(t)+' n='+b.n);
});
test('shortageBrief: 地上粮药计入短缺', () => {
  const a=Colony.shortageBrief({res:{mineral:40,food:0},residents:[{}]}, [], {food:10});
  if(a.urgent) throw new Error('地上有粮矿足不应紧急: '+JSON.stringify(a));
  const b=Colony.shortageBrief({
    res:{mineral:40,food:99,med:0},
    residents:[{illness:55}]
  }, [], {med:1});
  if(b.text.indexOf('生病')>=0) throw new Error('地上有药不应催工坊: '+b.text);
});

/* ============ T10 尖刺陷阱与沙袋 (#83) ============ */
test('#83 trapTriggers: 敌人进入陷阱格(24px)且armed → 触发', () => {
  const traps=[{id:'bl_spike_trap',x:100,y:100,armed:true}];
  const hit=Colony.trapTriggers(traps,{x:110,y:105});
  if(!hit) throw new Error('格内应触发: '+JSON.stringify(hit));
  if(hit!==traps[0]) throw new Error('应返回该陷阱');
  const miss=Colony.trapTriggers(traps,{x:160,y:160});
  if(miss) throw new Error('格外不应触发');
});
test('#83 trapTriggers: 已触发(armed=false)不再触发', () => {
  const traps=[{id:'bl_spike_trap',x:100,y:100,armed:false}];
  const hit=Colony.trapTriggers(traps,{x:105,y:103});
  if(hit) throw new Error('已触发陷阱不应再触发');
});
test('#83 trapStrike: 穿刺伤害+出血计时+hitFlash', () => {
  const en={hp:50};
  const r=Colony.trapStrike(en);
  if(r.dmg!==12) throw new Error('应 12 伤: '+r.dmg);
  if(en.hp!==38) throw new Error('hp 应 38: '+en.hp);
  if(en.bleedT!==5) throw new Error('出血 5s: '+en.bleedT);
  if(!(en.hitFlash>0)) throw new Error('应 hitFlash');
});
test('#83 sandbagMul: 沙袋格内 ×0.5 格外 ×1', () => {
  const bags=[{id:'bl_sandbag',x:200,y:200}];
  const inside=Colony.sandbagMul(bags,{x:205,y:198});
  if(inside!==0.5) throw new Error('格内应 0.5: '+inside);
  const outside=Colony.sandbagMul(bags,{x:300,y:300});
  if(outside!==1) throw new Error('格外应 1: '+outside);
  if(Colony.sandbagMul([],{x:0,y:0})!==1) throw new Error('无沙袋应 1');
});
test('#83 bleedMul: 出血减速 ×0.7, 无出血 ×1', () => {
  const bleeding={bleedT:3};
  if(Colony.bleedMul(bleeding)!==0.7) throw new Error('出血应 0.7');
  const fine={bleedT:0};
  if(Colony.bleedMul(fine)!==1) throw new Error('无出血应 1');
});
test('#83 canPlace: 陷阱/沙袋科技挂靠炮术+成本', () => {
  const t1=Colony.canPlace([], {te_ballistics:true}, 'bl_spike_trap', 500, 500, {stone:99,wood:99});
  if(!t1.ok) throw new Error('炮术后可建陷阱: '+JSON.stringify(t1));
  const t2=Colony.canPlace([], {}, 'bl_spike_trap', 500, 500, {stone:99,wood:99});
  if(t2.ok) throw new Error('无炮术不可建');
  const t3=Colony.canPlace([], {te_ballistics:true}, 'bl_sandbag', 500, 500, {stone:99});
  if(!t3.ok) throw new Error('沙袋应可建');
  const t4=Colony.canPlace([], {te_ballistics:true}, 'bl_sandbag', 500, 500, {stone:0});
  if(t4.ok) throw new Error('缺石不可建');
});
