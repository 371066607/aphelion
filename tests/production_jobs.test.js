'use strict';

if(!window.APH.ProductionJobs){
  const fs=require('fs'),path=require('path');
  new Function(fs.readFileSync(path.join(__dirname,'..','src','production_jobs.js'),'utf8'))();
}

const PJ=APH.ProductionJobs,L=APH.Logistics,T=APH.CFG.entType;

function state(buildings){
  return {scene:'home',colony:{rulesVersion:1,buildings:buildings||[],buildQueue:[],pendingGround:[],
    scene:APH.TerrainModel.home(7),logistics:{v:1,nextTask:1,nextReservation:1,tasks:[],reservations:[]}},
    meta:{tech:{te_machining:1,te_stonecutting:1,te_alien_culinary:1,te_bio_adaptation:1,te_herbal_remedies:1},
      res:{mineral:20,wood:20,iron:20,food:20,leather:20,herb:20,glow_fluid:20},residents:[]},entities:[]};
}

function deliverDirect(task){
  Object.keys(task.need).forEach(key=>task.deliveredLots.push({key,amount:task.need[key],itemId:key.indexOf('it_')===0?key:'it_'+key,itemCount:task.need[key]}));
}

test('production jobs: prepare 创建实际配方需求与默认工坊药品任务',()=>{
  const workshop={id:'bl_workshop',uid:'shop',x:960,y:960,recipe:'it_pickaxe'};
  const kitchen={id:'bl_kitchen',uid:'kitchen',x:1200,y:960,recipe:'it_berry_stew'};
  const campfire={id:'bl_campfire',uid:'fire',x:1440,y:960};
  const medicine={id:'bl_workshop',uid:'medshop',x:1680,y:960};
  const lab={id:'bl_lab',uid:'lab',x:1920,y:960,analysisTarget:'specimen_dew'};
  const s=state([workshop,kitchen,campfire,medicine,lab]);
  const first=PJ.prepare(s),second=PJ.prepare(s),byUid=Object.fromEntries(PJ.targets(s).map(x=>[x.task.targetId,x]));
  if(!first.changed||second.changed)throw new Error('相同状态不应每帧重建任务');
  if(JSON.stringify(byUid.shop.task.need)!==JSON.stringify({wood:15,iron:10}))throw new Error('工坊 costRes 未原样进入任务');
  if(JSON.stringify(byUid.kitchen.task.need)!==JSON.stringify({it_berry:2,it_crystal_berry:1,wood:1}))throw new Error('厨房 costRes 未原样进入任务');
  if(JSON.stringify(byUid.fire.task.need)!==JSON.stringify({food:2,wood:1}))throw new Error('篝火默认烤肉需求错误');
  if(JSON.stringify(byUid.medshop.task.need)!==JSON.stringify({mineral:2}))throw new Error('默认工坊药品需求错误');
  if(JSON.stringify(byUid.lab.task.need)!==JSON.stringify({specimen_dew:1}))throw new Error('科研台应搬运当前实物标本');
  if(byUid.shop.job!=='bl_workshop'||byUid.fire.job!=='bl_kitchen'||byUid.lab.job!=='bl_lab')throw new Error('运输目标岗位错误');
});

test('production jobs: 共享库存由 Logistics 精确预订，送达前完全不推进',()=>{
  const a={id:'bl_campfire',uid:'a',x:960,y:960},b={id:'bl_campfire',uid:'b',x:1200,y:960};
  const s=state([a,b]);s.meta.res={food:2,wood:1};PJ.prepare(s);
  const targets=PJ.targets(s),ta=targets[0].task,tb=targets[1].task;
  const r1=L.reserveForTask(s.colony,s.meta.res,s.entities,ta,'r1',{stockSpot:{x:0,y:0}});
  const r2=L.reserveForTask(s.colony,s.meta.res,s.entities,tb,'r2',{stockSpot:{x:0,y:0}});
  if(!r1.ok||r2.ok)throw new Error('两工位不得重复预订同一份食材');
  const before=s.meta.res.food,out=PJ.tick(s,a,3,1,20);
  if(out.done||a.cookProgress)throw new Error('材料送达前不得烹饪');
  if(s.meta.res.food!==before)throw new Error('预订与空转不得扣库存');
});

test('production jobs: 只消费工位已送材料，完成一次后产出与工单各推进一次',()=>{
  const b={id:'bl_kitchen',uid:'k',x:960,y:960,bills:[]};
  APH.Colony.addBill(b,'it_roasted_meat',1);
  const s=state([b]);PJ.prepare(s);
  const task=L.taskFor(s.colony,b.productionTaskId);deliverDirect(task);
  const globalBefore=JSON.stringify(s.meta.res),out=PJ.tick(s,b,4,1,20);
  if(!out.done||out.producedItemId!=='it_roasted_meat'||b.bills[0].done!==1)throw new Error('单份工单未完成: '+JSON.stringify(out));
  if(JSON.stringify(s.meta.res)!==globalBefore)throw new Error('工位加工不得再次扣全局库存');
  if(L.taskFor(s.colony,task.id)||b.productionTaskId)throw new Error('完成后应消费并移除该物流任务');
  const again=PJ.tick(s,b,4,1,20);
  if(again.done||b.bills[0].done!==1)throw new Error('同一工单不得重复产出/重复扣料');
});

test('production jobs: 在途读档保留任务，原搬运者可继续送达后生产',()=>{
  const b={id:'bl_workshop',uid:'shop',x:960,y:960,recipe:'it_pickaxe'};
  const s=state([b]);PJ.prepare(s);
  let task=L.taskFor(s.colony,b.productionTaskId);
  const rr=L.reserveForTask(s.colony,s.meta.res,s.entities,task,'r1',{stockSpot:{x:0,y:0}}).reservation;
  L.pickup(s.colony,s.meta.res,s.entities,rr.id,'r1',{x:0,y:0});
  const loaded=JSON.parse(JSON.stringify(s.colony)),s2=state([]);s2.colony=loaded;s2.colony.buildings=loaded.buildings;
  const carrier={id:'r1',rid:'r1',type:T.RESIDENT,x:100,y:100};s2.entities=[carrier];
  const restored=L.restore(s2.colony,s2.meta.res,s2.entities);
  if(restored.reattached.length!==1)throw new Error('读档应保留 canonical 在途货物');
  PJ.prepare(s2);task=L.taskFor(s2.colony,s2.colony.buildings[0].productionTaskId);
  task.deliverySpot={x:100,y:100};
  if(!L.deliver(s2.colony,task,rr.id,'r1',carrier).ok)throw new Error('读档后应继续送达');
  Object.keys(task.need).forEach(key=>{const missing=L.taskState(s2.colony,task).missing[key]||0;if(missing)task.deliveredLots.push({key,amount:missing,itemId:'it_'+key,itemCount:missing});});
  if(!PJ.tick(s2,s2.colony.buildings[0],6,1,20).done)throw new Error('补齐工位材料后应完成生产');
});

test('production jobs: 切配方和拆工位取消任务，已送达与在途材料全部落地守恒',()=>{
  const b={id:'bl_workshop',uid:'shop',x:960,y:960,recipe:'it_pickaxe',craftProgress:5};
  const s=state([b]);PJ.prepare(s);
  let task=L.taskFor(s.colony,b.productionTaskId);
  task.deliveredLots.push({key:'wood',amount:4,itemId:'it_wood',itemCount:4});
  const rr=L.reserveForTask(s.colony,s.meta.res,s.entities,task,'r1',{stockSpot:{x:0,y:0}}).reservation;
  L.pickup(s.colony,s.meta.res,s.entities,rr.id,'r1',{x:0,y:0});L.touchCargo(s.colony,rr.id,{x:400,y:410});
  b.recipe='it_suit_cryo';PJ.prepare(s);
  if(b.craftProgress!==0||s.colony.pendingGround.length!==2)throw new Error('切配方应退回已送达和在途两批材料');
  const returned=s.colony.pendingGround.reduce((n,d)=>n+(d.n||0),0);
  if(returned!==15)throw new Error('切配方物料不守恒: '+JSON.stringify(s.colony.pendingGround));
  task=L.taskFor(s.colony,b.productionTaskId);deliverDirect(task);
  s.colony.buildings=[];PJ.prepare(s);
  if(s.colony.pendingGround.reduce((n,d)=>n+(d.n||0),0)!==31)throw new Error('拆工位应把新配方送达材料也退到地面');
  if(L.ensureState(s.colony).tasks.some(t=>t.productionJob))throw new Error('拆除后不得留孤儿生产任务');
});

test('production jobs: 科研台送达前不推进，送达后只消费一份标本并返回原化验结果',()=>{
  const b={id:'bl_lab',uid:'lab',x:960,y:960,analysisTarget:'specimen_flora_glow',analysisProgress:0};
  const s=state([b]);s.meta.res.specimen_flora_glow=3;PJ.prepare(s);
  const task=L.taskFor(s.colony,b.productionTaskId),globalBefore=s.meta.res.specimen_flora_glow;
  const waiting=PJ.tick(s,b,4,1,30);
  if(waiting.done||b.analysisProgress)throw new Error('标本未送达时科研进度不得推进');
  deliverDirect(task);
  const out=PJ.tick(s,b,4,1,30);
  if(!out.done||out.specimenId!=='specimen_flora_glow'||out.def!==APH.Colony.SPECIMEN_ANALYSIS.specimen_flora_glow)
    throw new Error('应原样返回 labAnalysisTick 的结算数据: '+JSON.stringify(out));
  if(!out.materials||out.materials.consumed.specimen_flora_glow!==1)
    throw new Error('化验完成只能消费工位的一份标本: '+JSON.stringify(out.materials));
  if(s.meta.res.specimen_flora_glow!==globalBefore)throw new Error('科研加工不得再次扣全局标本库存');
  if(L.taskFor(s.colony,task.id))throw new Error('化验完成后物流任务应只结算一次');
});

test('production jobs: 现代默认工坊消耗已送矿材产药，legacy 完全不接管',()=>{
  const b={id:'bl_workshop',uid:'med',x:960,y:960,lv:1},s=state([b]);PJ.prepare(s);
  const task=L.taskFor(s.colony,b.productionTaskId);deliverDirect(task);
  const out=PJ.tick(s,b,5,1,1);
  if(!out.done||out.producedItemId!=='it_med'||out.count!==2)throw new Error('默认药品语义错误: '+JSON.stringify(out));
  const legacy=state([{id:'bl_workshop',uid:'old',x:1,y:1}]);legacy.colony.rulesVersion=0;
  if(PJ.prepare(legacy).modern||PJ.targets(legacy).length||PJ.tick(legacy,legacy.colony.buildings[0],1,1,1).why!=='legacy')
    throw new Error('老档不得进入物理生产任务');
});

test('production jobs: 换配方把退款放在可达互动格而非阻挡的工位中心',()=>{
  const b=APH.Construction.record('bl_workshop',960,960,0);b.recipe='it_pickaxe';
  const s=state([b]);PJ.prepare(s);
  const task=L.taskFor(s.colony,b.productionTaskId);
  task.deliveredLots.push({key:'wood',amount:4,itemId:'it_wood',itemCount:4});
  const spot=task.deliverySpot;
  if(!spot)throw new Error('工位必须有合法交付位置');
  b.recipe='it_suit_cryo';PJ.prepare(s);
  const refund=s.colony.pendingGround.find(d=>d.itemId==='it_wood');
  if(!refund||refund.n!==4||refund.x!==spot.x||refund.y!==spot.y)throw new Error('退款必须留在原交付格');
  const grid=APH.Nav.gridOf(s.colony.buildings,s.colony.scene);
  if(!APH.Nav.astar(grid,{x:720,y:960},refund))throw new Error('退款必须在实体工坊仍存在时可达');
});
