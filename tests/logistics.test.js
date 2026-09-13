'use strict';

const L = window.APH.Logistics;
const Colony = window.APH.Colony;
const T = window.APH.CFG.entType;

function setup(){
  return {
    colony:{buildings:[],buildQueue:[]},
    stock:{wood:10,stone:4},
    entities:[{id:'drop_wood',type:T.DROPPED,itemId:'it_wood',n:5,x:100,y:100}]
  };
}

test('logistics: 精确预订锁来源但不提前扣料', () => {
  const s=setup();
  const task=L.ensureTask(s.colony,{kind:'blueprint',targetId:'bp_1',x:300,y:300,need:{wood:12}});
  const a=L.reserveForTask(s.colony,s.stock,s.entities,task,'r1',{stockSpot:{x:20,y:20},from:{x:95,y:95}});
  const b=L.reserveForTask(s.colony,s.stock,s.entities,task,'r2',{stockSpot:{x:20,y:20},from:{x:95,y:95}});
  if(!a.ok||!b.ok) throw new Error('两名搬运者应分别拿到预订');
  if(a.reservation.source.id!=='drop_wood') throw new Error('近处地堆应优先: '+JSON.stringify(a));
  if(b.reservation.source.id!=='stock:wood') throw new Error('同一地堆已锁满后应预订仓储: '+JSON.stringify(b));
  if(s.stock.wood!==10||s.entities[0].n!==5) throw new Error('预订阶段不得转移所有权');
  if(L.available(s.colony,s.stock,s.entities,'wood')!==3) throw new Error('可用量应排除已预订 12 份');
});

test('logistics: 走到来源才能取料，走到互动点才能送达', () => {
  const s=setup();
  const task=L.ensureTask(s.colony,{kind:'blueprint',targetId:'bp_1',x:300,y:300,
    deliverySpot:{x:348,y:300},need:{wood:5}});
  const rr=L.reserveForTask(s.colony,s.stock,s.entities,task,'r1',{stockSpot:{x:20,y:20},from:{x:100,y:100}}).reservation;
  if(L.pickup(s.colony,s.stock,s.entities,rr.id,'r1',{x:140,y:100}).ok) throw new Error('离来源太远不该隔空取料');
  if(!L.pickup(s.colony,s.stock,s.entities,rr.id,'r1',{x:100,y:100}).ok) throw new Error('到来源后应能取料');
  if(!s.entities[0].dead||s.stock.wood!==10) throw new Error('取地堆后应只移动该来源所有权');
  if(L.deliver(s.colony,task,rr.id,'r1',{x:300,y:300}).ok) throw new Error('中心不等于合法互动点');
  const out=L.deliver(s.colony,task,rr.id,'r1',{x:348,y:300});
  if(!out.ok||!out.state.ready) throw new Error('材料到互动点后工地应 ready: '+JSON.stringify(out));
  if(L.reservationForCarrier(s.colony,'r1')) throw new Error('送达后搬运者不应残留预订');
});

test('logistics: 取消把在途与已送达货物原地落下，不瞬移回库存', () => {
  const s=setup();
  const task=L.ensureTask(s.colony,{kind:'blueprint',targetId:'bp_1',x:300,y:300,need:{wood:8}});
  const r1=L.reserveForTask(s.colony,s.stock,s.entities,task,'r1',{stockSpot:{x:20,y:20},from:{x:100,y:100}}).reservation;
  L.pickup(s.colony,s.stock,s.entities,r1.id,'r1',{x:100,y:100});
  L.deliver(s.colony,task,r1.id,'r1',{x:300,y:300});
  const r2=L.reserveForTask(s.colony,s.stock,s.entities,task,'r2',{stockSpot:{x:20,y:20},from:{x:20,y:20}}).reservation;
  L.pickup(s.colony,s.stock,s.entities,r2.id,'r2',{x:20,y:20});
  L.touchCargo(s.colony,r2.id,{x:180,y:190});
  const before=s.stock.wood;
  const out=L.cancelTask(s.colony,task);
  if(!out.ok||out.drops.length!==2) throw new Error('应返还工地与在途两批货: '+JSON.stringify(out));
  if(s.stock.wood!==before) throw new Error('取消不得自动加回全局库存');
  if(!out.drops.some(d=>d.x===300&&d.y===300)||!out.drops.some(d=>d.x===180&&d.y===190))
    throw new Error('返还坐标不守原位置: '+JSON.stringify(out.drops));
});

test('logistics: releaseCarrier 只释放该搬运者，工地已送达材料保留', () => {
  const s=setup();
  const task=L.ensureTask(s.colony,{kind:'blueprint',targetId:'bp_1',x:300,y:300,need:{wood:8}});
  task.deliveredLots.push({key:'wood',amount:3,itemId:'it_wood',itemCount:3});
  const rr=L.reserveForTask(s.colony,s.stock,s.entities,task,'r1',{stockSpot:{x:20,y:20},from:{x:20,y:20}}).reservation;
  L.pickup(s.colony,s.stock,s.entities,rr.id,'r1',{x:20,y:20});
  const out=L.releaseCarrier(s.colony,'r1',{x:70,y:80});
  if(out.drops.length!==1||out.drops[0].x!==70) throw new Error('在途货应在搬运者处落地');
  if(L.taskState(s.colony,task).delivered.wood!==3) throw new Error('释放搬运者不应动已送达材料');
});

test('logistics: restore 保留有原搬运者的 canonical cargo，缺人时才落地', () => {
  const s=setup();
  const task=L.ensureTask(s.colony,{kind:'blueprint',targetId:'bp_1',x:300,y:300,need:{wood:5}});
  s.colony.buildQueue=[{uid:'bp_1',taskId:task.id}];
  const rr=L.reserveForTask(s.colony,s.stock,s.entities,task,'r1',{stockSpot:{x:20,y:20},from:{x:20,y:20}}).reservation;
  L.pickup(s.colony,s.stock,s.entities,rr.id,'r1',{x:20,y:20});
  L.touchCargo(s.colony,rr.id,{x:150,y:160});
  let out=L.restore(s.colony,s.stock,[{id:'r1',type:T.RESIDENT,x:0,y:0}]);
  if(out.reattached.length!==1||out.drops.length) throw new Error('原搬运者在场应续送');
  out=L.restore(s.colony,s.stock,[]);
  if(out.drops.length!==1||out.drops[0].x!==150||out.drops[0].n!==5) throw new Error('搬运者缺失应按最后位置落地');
  if(L.reservationForCarrier(s.colony,'r1')) throw new Error('落地后不得留下幽灵 cargo');
});

test('logistics: 读档计数器落后时不得复用已有任务或预订 ID', () => {
  const colony={logistics:{v:1,nextTask:1,nextReservation:1,
    tasks:[{id:'lt_7',kind:'construction',targetId:'old',need:{wood:1},deliveredLots:[]}],
    reservations:[{id:'lr_9',taskId:'lt_7',carrierId:'old',key:'wood',amount:1,phase:'reserved',
      source:{kind:'stock',id:'stock:wood',x:0,y:0,key:'wood',itemId:'it_wood',amount:1,itemCount:1}}]}};
  const task=L.ensureTask(colony,{kind:'construction',targetId:'new',need:{stone:1}});
  const rr=L.reserveForTask(colony,{stone:1},[],task,'new-carrier',{stockSpot:{x:0,y:0}});
  if(task.id!=='lt_8'||!rr.ok||rr.reservation.id!=='lr_10')
    throw new Error('计数器必须越过旧 ID: '+JSON.stringify({task,rr}));
});

test('logistics: JSON 读档保留已送达与在途所有权，续送后总量只消耗一次', () => {
  const s=setup();
  const task=L.ensureTask(s.colony,{kind:'construction',targetId:'bp_save',x:300,y:300,need:{wood:6}});
  task.deliveredLots.push({key:'wood',amount:2,itemId:'it_wood',itemCount:2});
  s.stock.wood=8;s.entities[0].n=3; // 初始总量 13：仓 8、地上 3、工地 2。
  s.colony.buildQueue=[{uid:'bp_save',taskId:task.id}];
  const rr=L.reserveForTask(s.colony,s.stock,s.entities,task,'r1',{stockSpot:{x:20,y:20},from:{x:20,y:20}}).reservation;
  L.pickup(s.colony,s.stock,s.entities,rr.id,'r1',{x:20,y:20});
  L.touchCargo(s.colony,rr.id,{x:160,y:170});
  const loadedColony=JSON.parse(JSON.stringify(s.colony));
  const loadedStock=JSON.parse(JSON.stringify(s.stock));
  let out=L.restore(loadedColony,loadedStock,[{id:'r1',type:T.RESIDENT,x:160,y:170}]);
  if(out.reattached.length!==1||out.drops.length) throw new Error('读档后原搬运者应保有 canonical cargo');
  const loadedTask=L.taskFor(loadedColony,task.id);
  out=L.deliver(loadedColony,loadedTask,rr.id,'r1',{x:300,y:300});
  if(!out.ok||!out.state.ready||loadedStock.wood!==4)
    throw new Error('续送后工地应齐料且库存只扣在 pickup 一次: '+JSON.stringify({out,loadedStock}));
  if(!L.completeTask(loadedColony,loadedTask).ok) throw new Error('齐料任务应能消费并完成');
  if(loadedStock.wood+s.entities[0].n!==7) throw new Error('初始 13 减施工 6 后应剩 7');
});

test('logistics: completeTask 只消费需求量并把 storeN 超额退成单位物资', () => {
  const s=setup();
  const task=L.ensureTask(s.colony,{kind:'construction',targetId:'bp_alloy',x:300,y:300,
    deliverySpot:{x:348,y:300},need:{mineral:2}});
  const alloy={id:'drop_alloy',type:T.DROPPED,itemId:'it_alloy',n:1,x:100,y:100};
  const rr=L.reserveForTask(s.colony,s.stock,[alloy],task,'r1',{from:{x:100,y:100}}).reservation;
  if(rr.amount!==3||rr.source.itemCount!==1) throw new Error('合金应按 3 矿材单位预订');
  L.pickup(s.colony,s.stock,[alloy],rr.id,'r1',{x:100,y:100});
  L.deliver(s.colony,task,rr.id,'r1',{x:348,y:300});
  const out=L.completeTask(s.colony,task);
  if(!out.ok||out.consumed.mineral!==2||out.drops.length!==1)
    throw new Error('工程应仅消费 2 并退 1: '+JSON.stringify(out));
  const d=out.drops[0];
  if(d.itemId!=='it_mineral'||d.n!==1||d.x!==348||d.y!==300)
    throw new Error('余量应在互动点规范化为 1 矿材: '+JSON.stringify(d));
});

test('logistics: restore 取消已无蓝图的施工孤儿并返还已送达与在途物资', () => {
  const s=setup();
  const task=L.ensureTask(s.colony,{kind:'construction',targetId:'gone_bp',x:300,y:300,need:{wood:5}});
  task.deliveredLots.push({key:'wood',amount:2,itemId:'it_wood',itemCount:2});
  const rr=L.reserveForTask(s.colony,s.stock,s.entities,task,'r1',{stockSpot:{x:20,y:20},from:{x:20,y:20}}).reservation;
  L.pickup(s.colony,s.stock,s.entities,rr.id,'r1',{x:20,y:20});
  L.touchCargo(s.colony,rr.id,{x:170,y:180});
  const out=L.restore(s.colony,s.stock,[{id:'r1',type:T.RESIDENT,x:170,y:180}]);
  if(out.reattached.length||out.drops.length!==2)
    throw new Error('孤儿任务不能续送，应返还两批: '+JSON.stringify(out));
  if(!out.drops.some(d=>d.x===300&&d.y===300&&d.n===2)||!out.drops.some(d=>d.x===170&&d.y===180&&d.n===3))
    throw new Error('孤儿返还坐标/数量错误: '+JSON.stringify(out.drops));
  if(L.taskFor(s.colony,task.id)||L.reservationForCarrier(s.colony,'r1'))
    throw new Error('孤儿任务与运输预订必须清干净');
});

test('construction: 正式蓝图缺料冻结；旧蓝图保持已付款兼容', () => {
  const formal=[{bid:'bl_house',x:100,y:100,total:10,progress:0,materialsPaid:false}];
  const old=[{bid:'bl_house',x:100,y:100,total:10,progress:0}];
  let r=Colony.queueTick(formal,2,[{x:100,y:100}],0);
  if(r.queue[0].progress!==0||r.queue[0].building) throw new Error('缺料蓝图不得施工');
  r=Colony.queueTick(old,2,[{x:100,y:100}],0);
  if(r.queue[0].progress<=0) throw new Error('旧档蓝图应视为已付款');
});

test('construction: 到料且居民到场才完工，保留统一 geometry record', () => {
  const q={uid:'b_7',id:'bl_bed',bid:'bl_bed',geometryVersion:1,gx:10,gy:10,rotation:1,
    cells:[1,2],layer:'furniture',solid:true,interaction:'front',x:528,y:504,lv:1,
    total:1,progress:.9,materialsPaid:false,need:{wood:1}};
  const s={px:528,py:504,colony:{buildings:[],buildQueue:[q],scene:{width:2200,height:2200,grid:48}},
    meta:{residents:[{id:'r1',mainSkill:'sk_build',skills:{sk_build:5}}],workPrio:{}},
    entities:[],parts:[]};
  const workSpot=APH.Construction.spot(s,q,{x:700,y:504});
  s.entities.push({id:'r1',rid:'r1',type:T.RESIDENT,x:workSpot.x,y:workSpot.y});
  const task=L.ensureTask(s.colony,{kind:'blueprint',targetId:q.uid,x:q.x,y:q.y,need:q.need});
  q.taskId=task.id;
  task.deliveredLots.push({key:'wood',amount:1,itemId:'it_wood',itemCount:1});
  Colony.tickConstruction(s,1);
  if(s.colony.buildQueue.length) throw new Error('到料且居民在外侧应完工: '+JSON.stringify({q:s.colony.buildQueue,log:s.colony.logistics,entities:s.entities}));
  const b=s.colony.buildings[0];
  if(!b||b.uid!=='b_7'||b.gx!==10||b.rotation!==1||b.geometryVersion!==1||b.interaction!=='front')
    throw new Error('蓝图不得退化成 bid/x/y: '+JSON.stringify(b));
});

test('construction: 遗留 s.px 不能幽灵施工，活人占格时不得封死成品', () => {
  const legacy={bid:'bl_house',x:100,y:100,total:1,progress:0};
  const noPawn={px:100,py:100,colony:{buildings:[],buildQueue:[legacy]},meta:{residents:[],workPrio:{}},entities:[],parts:[]};
  Colony.tickConstruction(noPawn,1);
  if(noPawn.colony.buildQueue[0].progress!==0) throw new Error('无玩家化身后 s.px 不得继续施工');

  const q={uid:'b_8',id:'bl_bed',bid:'bl_bed',geometryVersion:1,gx:10,gy:10,rotation:0,
    cells:[1,2],layer:'furniture',solid:true,x:504,y:528,total:1,progress:.9};
  const blocked={colony:{buildings:[],buildQueue:[q],scene:{width:2200,height:2200,grid:48}},
    meta:{residents:[{id:'r1',mainSkill:'sk_build',skills:{sk_build:5}}],workPrio:{}},
    entities:[{id:'r1',rid:'r1',type:T.RESIDENT,x:504,y:528}],parts:[]};
  Colony.tickConstruction(blocked,1);
  if(!blocked.colony.buildQueue.length||blocked.colony.buildQueue[0].progress>=1)
    throw new Error('活人占在 footprint 内不得落成封死');
});

test('construction: 倒地、睡眠、征召居民与失能强制指令都不能施工', () => {
  const cases=[
    {name:'倒地居民',profile:{downed:true},entity:{}},
    {name:'睡眠居民',profile:{isSleeping:true},entity:{}},
    {name:'征召居民',profile:{},entity:{drafted:true}},
    {name:'倒地强制建造',profile:{downed:true},entity:{userOrder:{type:'build'}}}
  ];
  cases.forEach((c,i)=>{
    const rid='disabled_'+i;
    const q={bid:'bl_house',x:100,y:100,total:10,progress:0};
    const profile=Object.assign({id:rid,mainSkill:'sk_build',skills:{sk_build:5}},c.profile);
    const entity=Object.assign({id:rid,rid:rid,type:T.RESIDENT,x:100,y:100},c.entity);
    const s={colony:{buildings:[],buildQueue:[q]},meta:{residents:[profile],workPrio:{}},entities:[entity],parts:[]};
    Colony.tickConstruction(s,2);
    if(s.colony.buildQueue[0].progress!==0) throw new Error(c.name+'不应推进施工');
  });
});

test('logistics: 同一物品的通用资源与精确配方不能跨 key 重复预订', function(){
  const c={buildQueue:[]}, pile={id:'shared',type:T.DROPPED,itemId:'it_wood',n:5,x:100,y:100};
  const a=L.ensureTask(c,{kind:'production',targetId:'a',need:{wood:3}});
  const b=L.ensureTask(c,{kind:'production',targetId:'b',need:{it_wood:3}});
  const ra=L.reserveForTask(c,{},[pile],a,'r1');
  const rb=L.reserveForTask(c,{},[pile],b,'r2');
  if(!ra.ok||!rb.ok||ra.reservation.source.itemCount!==3||rb.reservation.source.itemCount!==2)
    throw new Error('同源物资被跨 key 双订');
  if(L.availableDrop(c,pile)!==0||L.available(c,{},[pile],'wood')!==0||L.available(c,{},[pile],'it_wood')!==0)
    throw new Error('自由可用数量包含预订原料');
  L.pickup(c,{},[pile],ra.reservation.id,'r1',pile);
  if(L.availableDrop(c,pile)!==0)throw new Error('取料后还在扣已携带的预订');
});

test('logistics: 预订按物品重量拆成多人多趟且总量守恒', function(){
  const prior=APH.CFG.haul.carryWeight;APH.CFG.haul.carryWeight=40;
  try{
    const colony={buildQueue:[]};
    const pile={id:'iron_bulk',type:T.DROPPED,itemId:'it_iron',n:50,x:100,y:100};
    const task=L.ensureTask(colony,{kind:'construction',targetId:'large_build',x:300,y:300,need:{iron:50}});
    const a=L.reserveForTask(colony,{},[pile],task,'r1',{from:pile,maxWeight:999}).reservation;
    const b=L.reserveForTask(colony,{},[pile],task,'r2',{from:pile}).reservation;
    if(a.source.itemCount!==20||a.amount!==20||b.source.itemCount!==20||b.amount!==20)
      throw new Error('铁矿每份重2，40负重应各锁20且 maxWeight 不得突破配置: '+JSON.stringify({a,b}));
    [a,b].forEach(function(rr){
      if(!L.pickup(colony,{},[pile],rr.id,rr.carrierId,pile).ok)throw new Error('首趟取料失败');
      if(!L.deliver(colony,task,rr.id,rr.carrierId,{x:300,y:300}).ok)throw new Error('首趟送达失败');
    });
    const c=L.reserveForTask(colony,{},[pile],task,'r1',{from:pile,maxWeight:10}).reservation;
    if(c.source.itemCount!==5||c.amount!==5)throw new Error('显式10负重应把第二趟切成5铁: '+JSON.stringify(c));
    L.pickup(colony,{},[pile],c.id,'r1',pile);L.deliver(colony,task,c.id,'r1',{x:300,y:300});
    const d=L.reserveForTask(colony,{},[pile],task,'r2',{from:pile}).reservation;
    if(d.source.itemCount!==5||d.amount!==5)throw new Error('最后一趟只应锁剩余5铁');
    L.pickup(colony,{},[pile],d.id,'r2',pile);L.deliver(colony,task,d.id,'r2',{x:300,y:300});
    const state=L.taskState(colony,task),done=L.completeTask(colony,task);
    if(!state.ready||!done.ok||done.consumed.iron!==50||!pile.dead||pile.n!==0)
      throw new Error('多趟送达后应准确消费50铁: '+JSON.stringify({state,done,pile}));
  }finally{if(prior==null)delete APH.CFG.haul.carryWeight;else APH.CFG.haul.carryWeight=prior;}
});

test('logistics: 数值库存按对应 itemId 重量限额且 opts 不能放大上限', function(){
  const prior=APH.CFG.haul.carryWeight;APH.CFG.haul.carryWeight=40;
  try{
    const colony={buildQueue:[]},stock={iron:50};
    const task=L.ensureTask(colony,{kind:'construction',targetId:'stock_build',need:{iron:50}});
    const rr=L.reserveForTask(colony,stock,[],task,'r1',{stockSpot:{x:10,y:20},maxWeight:999}).reservation;
    if(rr.source.kind!=='stock'||rr.source.itemId!=='it_iron'||rr.source.itemCount!==20||rr.amount!==20)
      throw new Error('stock iron 应按 it_iron 重2限制为20: '+JSON.stringify(rr));
    if(!L.pickup(colony,stock,[],rr.id,'r1',{x:10,y:20}).ok||stock.iron!==30)
      throw new Error('数值库存只应扣本趟20铁');
  }finally{if(prior==null)delete APH.CFG.haul.carryWeight;else APH.CFG.haul.carryWeight=prior;}
});

test('logistics: pickup 只取预订的 id+itemId 并按实体当前位置验距离', function(){
  const colony={buildQueue:[]};
  const wrong={id:'duplicate',type:T.DROPPED,itemId:'it_stone',n:4,x:100,y:100};
  const source={id:'duplicate',type:T.DROPPED,itemId:'it_wood',n:2,x:100,y:100};
  const task=L.ensureTask(colony,{kind:'construction',targetId:'bp_source',x:300,y:300,need:{wood:2}});
  const rr=L.reserveForTask(colony,{},[wrong,source],task,'r1',{from:{x:100,y:100}}).reservation;
  source.x=180;source.y=100;
  if(L.pickup(colony,{},[wrong,source],rr.id,'r1',{x:100,y:100}).ok)
    throw new Error('来源移动后不得按预订时旧坐标隔空抓取');
  if(!L.reservationForCarrier(colony,'r1'))throw new Error('距离不足不应释放仍有效的预订');
  const out=L.pickup(colony,{},[wrong,source],rr.id,'r1',{x:180,y:100});
  if(!out.ok||wrong.n!==4||!source.dead||out.cargo.itemId!=='it_wood')
    throw new Error('必须取匹配 itemId 的第一有效实体: '+JSON.stringify({out,wrong,source}));
});
