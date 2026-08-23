
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
