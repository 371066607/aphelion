
/* colony.js: 建筑目录/建造校验/生产tick/科技树 */
'use strict';
const U2 = window.APH.U, Colony = window.APH.Colony;

test('建筑目录: 全部 bl_ 前缀, 发射台免费且唯一', () => {
  const L = Colony.list();
  for(const id in L){ if(!id.startsWith('bl_')) throw new Error('前缀违规:'+id); }
  if(L.bl_landing_pad.cost !== 0) throw new Error('发射台应免费');
});

test('canPlace: 资源不足拒绝', () => {
  const r = Colony.canPlace([], 10, 'bl_warehouse', 600, 600);
  if(r.ok) throw new Error('研究点10 < 30 应拒绝');
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
test('productionTick: 采矿机+2矿/实验室+1研究', () => {
  const meta={ research:0, res:{mineral:0} };
  const out = Colony.productionTick(meta, [
    {id:'bl_mine'},{id:'bl_mine'},{id:'bl_lab'},
  ]);
  if(out.mineral!==4||out.research!==1) throw new Error('产出错误 '+JSON.stringify(out));
  if(meta.res.mineral!==4||meta.research!==1) throw new Error('未入账');
});

test('科技树: te_前缀/exo例外检查 + canBuy 边界', () => {
  const T = Colony.TECHS;
  for(const id in T){
    if(!(id.startsWith('te_')||id.startsWith('exo_'))) throw new Error('id规范: '+id);
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
  Colony.productionTick(meta,[{id:'bl_mine',lv:3},{id:'bl_lab'}]);
  if(meta.res.mineral!==6||meta.research!==1) throw new Error('等级产出未生效');
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
  ['bl_warehouse','bl_barracks','bl_lab','bl_farm','bl_pasture','bl_house','bl_clinic'].forEach(id=>{
    if(!L[id].cells || L[id].cells[0]!==2) throw new Error(id+' 应2x2');
    if(!L[id].dispH) throw new Error(id+' 缺dispH');
  });
  ['bl_mine','bl_turret'].forEach(id=>{
    if(!L[id].cells || L[id].cells[0]!==1) throw new Error(id+' 应1x1');
  });
});

/* ---- U6 畜牧群增长(2026-08-26): herd自然增长+产肉/皮 ---- */
test('ranchTick: 无牧民不增长不出皮, 有羊仍出肉', () => {
  const p={herd:2, lv:1}, res={};
  const o=Colony.ranchTick(p, 0, res, ()=>0.01);   // 必中增长窗
  if(o.grew) throw new Error('无牧民(skill=0)不应增长');
  if(o.foodGain!==1) throw new Error('herd=2应产1肉: '+o.foodGain);
  if(res.food!==1) throw new Error('res.food未入账');
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
  const res={};
  Colony.ranchTick({herd:2, lv:1}, 3, res, ()=>0.99); // herd=2<3 无皮
  if(res.leather) throw new Error('herd<3不应产皮');
  Colony.ranchTick({herd:3, lv:1}, 3, res, ()=>0.99); // floor(3/3)=1皮
  if(res.leather!==1) throw new Error('herd=3应+1皮: '+res.leather);
  Colony.ranchTick({herd:6, lv:1}, 3, res, ()=>0.99); // floor(6/3)=2皮
  if(res.leather!==3) throw new Error('herd=6应再+2皮: '+res.leather);
  Colony.ranchTick({herd:4, lv:2}, 3, res, ()=>0.99); // floor((4+1)/3)=1皮(lv放宽)
  if(res.leather!==4) throw new Error('lv2 her=4应+1皮: '+res.leather);
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
