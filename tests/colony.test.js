
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
