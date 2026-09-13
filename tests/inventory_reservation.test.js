'use strict';

const InventoryColony=APH.Colony,InventoryLogistics=APH.Logistics,InventoryT=APH.CFG.entType;

function inventoryState(res,entities,rulesVersion){
  return {scene:'home',meta:{res:res||{}},entities:entities||[],colony:{rulesVersion:rulesVersion==null?1:rulesVersion,
    buildings:[],logistics:{v:1,nextTask:1,nextReservation:1,tasks:[],reservations:[]}}};
}

function inInventoryState(s,fn){
  const prior=APH.state;APH.state=s;
  try{return fn();}finally{APH.state=prior;}
}

function reserve(s,target,key,n,carrier){
  const task=InventoryLogistics.ensureTask(s.colony,{kind:'generic',targetId:target,x:100,y:0,need:{[key]:n}});
  const out=InventoryLogistics.reserveForTask(s.colony,s.meta.res,s.entities,task,carrier,{from:{x:0,y:0},stockSpot:{x:0,y:0}});
  if(!out.ok)throw new Error('测试预订失败: '+JSON.stringify(out));
  return out.reservation;
}

test('inventory reservation: haveStock 与 stockOf 排除 stock/drop 预约并识别 exact 实体',()=>{
  const berry={id:'berry',type:InventoryT.DROPPED,itemId:'it_berry',n:3,x:0,y:0};
  const gear={id:'gear',type:InventoryT.DROPPED,itemId:'it_pickaxe',n:2,x:5,y:0};
  const sample={id:'sample',type:InventoryT.DROPPED,itemId:'specimen_dew',n:2,x:8,y:0};
  const s=inventoryState({food:5},[berry,gear,sample]);
  reserve(s,'cook','it_berry',2,'cook1');reserve(s,'meal','food',4,'meal1');
  inInventoryState(s,()=>{
    if(InventoryColony.haveStock('food')!==2)throw new Error('通用粮可用量应为 stock1 + berry1');
    if(InventoryColony.stockOf(s.meta.res,s.entities,'it_berry')!==1)throw new Error('exact berry 应排除同源预约');
    if(InventoryColony.stockOf(s.meta.res,s.entities,'it_pickaxe')!==2)throw new Error('无 store 的装备实体应可计数');
    if(InventoryColony.stockOf(s.meta.res,s.entities,'specimen_dew')!==2)throw new Error('标本实体应可计数');
  });
});

test('inventory reservation: takeStock 不足时原子失败，不扣半份或破坏预约',()=>{
  const berry={id:'berry',type:InventoryT.DROPPED,itemId:'it_berry',n:3,x:0,y:0};
  const s=inventoryState({food:5},[berry]);
  reserve(s,'cook','it_berry',2,'cook1');reserve(s,'meal','food',4,'meal1');
  const before=JSON.stringify({res:s.meta.res,berry:berry,logistics:s.colony.logistics});
  const out=InventoryColony.takeStock(s.meta.res,s.entities,'food',3,s);
  if(out.ok||out.taken!==0)throw new Error('可用粮仅2时扣3必须失败');
  if(JSON.stringify({res:s.meta.res,berry:berry,logistics:s.colony.logistics})!==before)
    throw new Error('失败路径发生了部分扣取');
});

test('inventory reservation: takeStock 只消费未预约 stock 与实体，结果和 haveStock 一致',()=>{
  const berry={id:'berry',type:InventoryT.DROPPED,itemId:'it_berry',n:3,x:0,y:0};
  const s=inventoryState({food:5},[berry]);
  reserve(s,'cook','it_berry',2,'cook1');reserve(s,'meal','food',4,'meal1');
  const out=InventoryColony.takeStock(s.meta.res,s.entities,'food',2,s);
  if(!out.ok||out.taken!==2||out.fromRes!==1||out.fromGround!==1)throw new Error('扣取来源错误: '+JSON.stringify(out));
  if(s.meta.res.food!==4||berry.n!==2)throw new Error('只能留下被预约的 stock4 与 berry2');
  if(InventoryColony.stockOf(s.meta.res,s.entities,'food',s)!==0)throw new Error('扣后不应还有未预约粮');
});

test('inventory reservation: takeDropped exact 失败原子且不会抢同实体预约',()=>{
  const gear={id:'gear',type:InventoryT.DROPPED,itemId:'it_pickaxe',n:2,x:0,y:0};
  const s=inventoryState({},[gear]);reserve(s,'equip','it_pickaxe',1,'smith');
  if(InventoryColony.takeDropped(s.entities,'it_pickaxe',2,s)!==0||gear.n!==2)
    throw new Error('exact 可用1时扣2应原子失败');
  if(InventoryColony.takeDropped(s.entities,'it_pickaxe',1,s)!==1||gear.n!==1)
    throw new Error('只能扣未预约的1件装备');
});

test('inventory reservation: ensureStock 只补足未预约库存，失败不搬半份',()=>{
  const berry={id:'berry',type:InventoryT.DROPPED,itemId:'it_berry',n:2,x:0,y:0};
  const s=inventoryState({food:2},[berry]);reserve(s,'meal','food',2,'meal1');
  if(!InventoryColony.ensureStock(s.meta.res,s.entities,'food',2,s)||s.meta.res.food!==4||!berry.dead)
    throw new Error('应搬入2份实体粮，保留原stock预约');
  s.meta.res.food-=2;
  if(s.meta.res.food!==2)throw new Error('普通消费后应完整留下预约库存');

  const one={id:'one',type:InventoryT.DROPPED,itemId:'it_berry',n:1,x:0,y:0};
  const fail=inventoryState({food:0},[one]);reserve(fail,'cook','it_berry',1,'cook1');
  const before=JSON.stringify(one);
  if(InventoryColony.ensureStock(fail.meta.res,fail.entities,'food',1,fail)||JSON.stringify(one)!==before||fail.meta.res.food!==0)
    throw new Error('只有预约食材时 ensureStock 必须零副作用失败');
});

test('inventory reservation: 现代矿材消费拆合金后把余量留在库存，单位守恒',()=>{
  const alloy={id:'alloy',type:InventoryT.DROPPED,itemId:'it_alloy',n:1,x:0,y:0};
  const s=inventoryState({mineral:0},[alloy]);
  const out=InventoryColony.takeStock(s.meta.res,s.entities,'mineral',2,s);
  if(!out.ok||out.taken!==2||out.groundRemoved!==3||out.surplus!==1||!alloy.dead||s.meta.res.mineral!==1)
    throw new Error('合金拆分后应消费2、保留1: '+JSON.stringify(out));
});

test('inventory reservation: legacy 保留原先允许部分扣取与不拆合金行为',()=>{
  const food={id:'food',type:InventoryT.DROPPED,itemId:'it_food',n:1,x:0,y:0};
  const s=inventoryState({food:1},[food],0);
  const partial=InventoryColony.takeStock(s.meta.res,s.entities,'food',3,s);
  if(partial.ok||partial.taken!==2||s.meta.res.food!==0||!food.dead)throw new Error('legacy 部分扣取语义被改变');
  const alloy={id:'alloy',type:InventoryT.DROPPED,itemId:'it_alloy',n:1,x:0,y:0};
  const noSplit=InventoryColony.takeStock({mineral:0},[alloy],'mineral',2,s);
  if(noSplit.ok||alloy.dead)throw new Error('legacy takeStock 仍不得拆合金');
});

test('inventory reservation: nearestMeal 跳过被完整预约的熟食堆',()=>{
  const cooked={id:'cooked',type:InventoryT.DROPPED,itemId:'it_roasted_meat',n:1,x:10,y:0};
  const berry={id:'berry',type:InventoryT.DROPPED,itemId:'it_berry',n:1,x:20,y:0};
  const s=inventoryState({},[cooked,berry]);
  reserve(s,'kitchen','it_roasted_meat',1,'cook1');
  inInventoryState(s,()=>{
    const meal=InventoryColony.nearestMeal({x:0,y:0},100);
    if(!meal||meal.kind!=='pile'||meal.drop!==berry)
      throw new Error('居民应跳过已预约熟食并选择可用粮堆');
  });
});

test('inventory reservation: nearestMeal 的现代数值粮固定在迫降舱且排除预约',()=>{
  const warehouse={id:'warehouse-entity',type:InventoryT.BUILDING,bid:'bl_warehouse',x:20,y:30};
  const s=inventoryState({food:2},[warehouse]);
  s.colony.buildings=[{id:'bl_warehouse',uid:'warehouse-record',x:20,y:30}];
  inInventoryState(s,()=>{
    const meal=InventoryColony.nearestMeal({x:APH.CFG.HAB.x,y:APH.CFG.HAB.y},1000);
    if(!meal||meal.kind!=='stock'||meal.x!==APH.CFG.HAB.x||meal.y!==APH.CFG.HAB.y+140)
      throw new Error('现代数值粮不得隔空定位到仓库: '+JSON.stringify(meal));
  });
  reserve(s,'meal','food',2,'meal1');
  inInventoryState(s,()=>{
    if(InventoryColony.nearestMeal({x:APH.CFG.HAB.x,y:APH.CFG.HAB.y},1000)!==null)
      throw new Error('数值粮被完整预约后不得继续作为餐源');
  });
});

test('inventory reservation: nibblePile 只吃未预约份数',()=>{
  const berry={id:'berry',type:InventoryT.DROPPED,itemId:'it_berry',n:3,x:0,y:0};
  const s=inventoryState({},[berry]);reserve(s,'cook','it_berry',2,'cook1');
  inInventoryState(s,()=>{
    if(InventoryColony.nibblePile(berry,2)!==1||berry.n!==2||berry.dead)
      throw new Error('只能吃掉未预约的1份，并留下预约2份');
    if(InventoryColony.nibblePile(berry,1)!==0||berry.n!==2)
      throw new Error('剩余全被预约时不得继续偷吃');
  });
});

test('inventory reservation: takeStock 空实体参数仍从当前 meta 识别预约',()=>{
  const s=inventoryState({food:2},[]);reserve(s,'meal','food',1,'meal1');
  inInventoryState(s,()=>{
    const fail=InventoryColony.takeStock(s.meta.res,[],'food',2);
    if(fail.ok||fail.taken!==0||s.meta.res.food!==2)
      throw new Error('无显式 context 时也必须原子拒绝抢预约库存');
    const ok=InventoryColony.takeStock(s.meta.res,[],'food',1);
    if(!ok.ok||ok.taken!==1||s.meta.res.food!==1)
      throw new Error('应能扣掉唯一未预约的数值粮');
  });
});

test('inventory reservation: 过客请熟食跳过预约堆且只在实际扣到后结算',()=>{
  const reserved={id:'reserved-meal',type:InventoryT.DROPPED,itemId:'it_roasted_meat',n:1,x:10,y:0};
  const free={id:'free-meal',type:InventoryT.DROPPED,itemId:'it_berry_stew',n:1,x:20,y:0};
  const visitor={id:'visitor',type:APH.CFG.entType.VISITOR,name:'访客',fed:false,impression:50};
  const s=inventoryState({},[reserved,free,visitor]);
  reserve(s,'kitchen','it_roasted_meat',1,'cook1');
  inInventoryState(s,()=>{
    if(!APH.Visitors.offerMeal(visitor))throw new Error('有未预约熟食时应能请客');
  });
  if(!visitor.fed||visitor.impression!==85||reserved.n!==1||reserved.dead||!free.dead)
    throw new Error('必须保留预约熟食并消费实际可用熟食');

  const locked={id:'only-meal',type:InventoryT.DROPPED,itemId:'it_roasted_meat',n:1,x:10,y:0};
  const visitor2={id:'visitor2',type:APH.CFG.entType.VISITOR,name:'访客2',fed:false,impression:50};
  const s2=inventoryState({},[locked,visitor2]);reserve(s2,'kitchen','it_roasted_meat',1,'cook2');
  inInventoryState(s2,()=>{
    if(APH.Visitors.offerMeal(visitor2))throw new Error('只有预约熟食时必须拒绝请客');
  });
  if(visitor2.fed||visitor2.impression!==50||locked.n!==1||locked.dead)
    throw new Error('扣料失败不得白送好感或破坏预约堆');
});

test('inventory reservation: 请居民吃饭不会拿预约粮换好感',()=>{
  const resident={id:'r1',name:'居民',mood:50};
  const ent={id:'resident-entity',rid:'r1',type:InventoryT.RESIDENT,x:0,y:0};
  const s=inventoryState({food:2},[ent]);s.meta.residents=[resident];s.meta.bonds={};
  reserve(s,'meal','food',1,'meal1');
  inInventoryState(s,()=>{
    if(APH.Visitors.offerMealToResident(ent))throw new Error('可用粮少于请客成本时必须拒绝');
  });
  if(s.meta.res.food!==2||resident.mood!==50||Object.keys(s.meta.bonds).length)
    throw new Error('扣料失败不得增加居民心情或关系');
});

test('meal sourcing: 现代居民跳过家具内不可达口粮并选择可达食物',()=>{
  const previous=APH.state;
  try{
    const b=APH.Construction.record('bl_storage_shelf',960,960,0);
    const blocked={id:'blocked_meal',type:APH.CFG.entType.DROPPED,itemId:'it_food',n:8,x:b.x,y:b.y};
    const reachable={id:'reachable_meal',type:APH.CFG.entType.DROPPED,itemId:'it_berry',n:8,x:1200,y:1008};
    APH.state={scene:'home',meta:{res:{}},colony:{rulesVersion:1,buildings:[b],scene:APH.TerrainModel.legacy(1,'home')},entities:[blocked,reachable]};
    const meal=APH.Colony.nearestMeal({x:840,y:1008},1e9);
    if(!meal||meal.drop!==reachable)throw new Error('不能守着不可达的近处口粮饿死');
  }finally{APH.state=previous;}
});
