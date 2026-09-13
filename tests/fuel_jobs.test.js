'use strict';

const FuelPJ=APH.ProductionJobs,FuelL=APH.Logistics,FuelC=APH.Colony,FuelT=APH.CFG.entType;

function fuelState(buildings,entities){
  return {scene:'home',colony:{rulesVersion:1,buildings:buildings||[],buildQueue:[],pendingGround:[],
    scene:APH.TerrainModel.home(17),logistics:{v:1,nextTask:1,nextReservation:1,tasks:[],reservations:[]}},
    meta:{res:{wood:900},tech:{},residents:[]},entities:entities||[],power:{charge:{},grace:{}}};
}

test('fuel jobs: 低燃料发电机创建批量木材运输任务',()=>{
  const b={id:'bl_wood_generator',uid:'gen',x:960,y:960,fuelWood:0};
  const s=fuelState([b],[]),out=FuelPJ.prepare(s),targets=FuelPJ.targets(s);
  const cfg=APH.CFG.power.wood;
  if(!out.modern||targets.length!==1)throw new Error('低燃料发电机应创建一个目标');
  if(targets[0].building!==b||targets[0].job!=='haul'||targets[0].task.productionMode!=='fuel')
    throw new Error('燃料目标必须开放给搬运岗位: '+JSON.stringify(targets[0]));
  if(targets[0].task.need.wood!==cfg.refillBatch)throw new Error('燃料批量必须来自 CFG');
  if(s.meta.res.wood!==900||b.fuelWood!==0)throw new Error('建任务不得隔空扣木或加机内燃料');
});

test('fuel jobs: 实物木材到场后无需工人直接转入唯一机仓',()=>{
  const b={id:'bl_wood_generator',uid:'gen',x:960,y:960,fuelWood:0};
  const batch=APH.CFG.power.wood.refillBatch;
  const pile={id:'wood-pile',type:FuelT.DROPPED,itemId:'it_wood',n:batch,x:100,y:100};
  const s=fuelState([b],[pile]);FuelPJ.prepare(s);
  const task=FuelL.taskFor(s.colony,b.productionTaskId);
  const rr=FuelL.reserveForTask(s.colony,s.meta.res,s.entities,task,'hauler',{from:pile,
    stockSpot:{x:APH.CFG.HAB.x,y:APH.CFG.HAB.y+140}}).reservation;
  if(rr.source.id!=='wood-pile')throw new Error('应从近处实体木材取料');
  if(!FuelL.pickup(s.colony,s.meta.res,s.entities,rr.id,'hauler',pile).ok)throw new Error('到来源应能取燃料');
  if(!FuelL.deliver(s.colony,task,rr.id,'hauler',task.deliverySpot||task).ok)throw new Error('到发电机互动位应能送达');
  const globalBefore=s.meta.res.wood,out=FuelPJ.prepare(s);
  if(b.fuelWood!==batch||!pile.dead||s.meta.res.wood!==globalBefore)
    throw new Error('送达木材必须只进入 b.fuelWood: '+JSON.stringify({b,pile,res:s.meta.res}));
  if(FuelL.taskFor(s.colony,task.id)||b.productionTaskId||FuelPJ.targets(s).length)
    throw new Error('补给完成后不得残留或重复创建燃料任务');
  if(!out.modern)throw new Error('prepare 应保持现代状态');
});

test('fuel jobs: 现代发电只烧机内燃料，legacy 仍烧数字库存',()=>{
  const cfg=APH.CFG.power.wood;
  const modern={id:'bl_wood_generator',x:0,y:0,fuelWood:1},modernRes={wood:900};
  const watts=FuelC.powerWoodOutput(modern,modernRes,cfg.burnSec,true);
  if(watts!==cfg.watts||modern.fuelWood!==0||modernRes.wood!==900)
    throw new Error('现代发电不得碰全局木材: '+JSON.stringify({watts,modern,modernRes}));
  if(FuelC.powerWoodOutput(modern,modernRes,1,true)!==0||modernRes.wood!==900)
    throw new Error('机仓空时不能靠全局库存隔空发电');

  const legacy={id:'bl_wood_generator',x:0,y:0},legacyRes={wood:2};
  if(FuelC.powerWoodOutput(legacy,legacyRes,cfg.burnSec)!==cfg.watts||legacyRes.wood!==1)
    throw new Error('legacy 数字木材燃烧语义不得改变');
});

test('fuel jobs: powerSettle 现代规则透传且 fuelWood 随建筑记录存档',()=>{
  const b={id:'bl_wood_generator',uid:'gen',x:0,y:0,fuelWood:0},s=fuelState([b],[]);
  const out=FuelC.powerSettle([b],s.meta.res,s.power,1,{rulesVersion:1,isDay:true});
  if(out.prodW!==0||s.meta.res.wood!==900)throw new Error('现代 powerSettle 不得烧全局木材');
  b.fuelWood=6;
  const prior=APH.state;APH.state=s;
  try{
    const ent={type:FuelT.BUILDING,bid:'bl_wood_generator',x:0,y:0};
    if(FuelC.recordOf(ent)!==b)throw new Error('实体必须回指携带 fuelWood 的 canonical 建筑记录');
    const loaded=JSON.parse(JSON.stringify(s.colony));
    if(loaded.buildings[0].fuelWood!==6)throw new Error('fuelWood 未随建筑记录序列化');
  }finally{APH.state=prior;}
});

test('fuel jobs: 发电机拆除会把已送达燃料退到原地',()=>{
  const b={id:'bl_wood_generator',uid:'gen',x:960,y:960,fuelWood:0},s=fuelState([b],[]);
  FuelPJ.prepare(s);
  const task=FuelL.taskFor(s.colony,b.productionTaskId),batch=APH.CFG.power.wood.refillBatch;
  task.deliveredLots.push({key:'wood',amount:batch,itemId:'it_wood',itemCount:batch});
  s.colony.buildings=[];FuelPJ.prepare(s);
  if(FuelL.taskFor(s.colony,task.id)||s.colony.pendingGround.length!==1||s.colony.pendingGround[0].n!==batch)
    throw new Error('拆除发电机必须取消任务并原地返还燃料');
});

test('power grid: 正式导线使用占格而非旧中心四舍五入坐标',()=>{
  const make=(id,gx,gy)=>APH.Construction.record(id,gx*APH.CFG.GRID,gy*APH.CFG.GRID,0);
  const buildings=[make('bl_ancient_generator',2,2),make('bl_conduit',3,2),make('bl_heater',4,2)];
  const out=FuelC.powerSettle(buildings,{}, {},1,{rulesVersion:1,isDay:false});
  const heater=buildings[2],status=out.status[Math.round(heater.x)+','+Math.round(heater.y)];
  if(!status||!status.grid||!status.powered)throw new Error('相邻正式导线必须让暖气联网供电');
});

test('power grid: 现代建筑下方同格导线接网，旧几何不改变接线语义',()=>{
  const make=(id,gx,gy)=>APH.Construction.record(id,gx*APH.CFG.GRID,gy*APH.CFG.GRID,0);
  const gen=make('bl_ancient_generator',2,2),wire=make('bl_conduit',2,2),heater=make('bl_heater',3,2);
  const modern=FuelC.powerNets([gen,wire,heater]);
  if(!modern.groups.some(g=>g.gens.includes(gen)&&g.cons.includes(heater)))throw new Error('建筑下方同格导线应连接供需节点');
  const oldGen={id:'bl_ancient_generator',x:96,y:96},oldWire={id:'bl_conduit',x:96,y:96},oldHeater={id:'bl_heater',x:144,y:96};
  const legacy=FuelC.powerNets([oldGen,oldWire,oldHeater]);
  if(legacy.groups.some(g=>g.gens.includes(oldGen)&&g.cons.includes(oldHeater)))throw new Error('旧档同格语义不能被迁移');
});
