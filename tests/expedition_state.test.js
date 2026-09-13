'use strict';

if(!window.APH.ExpeditionState){
  const fs=require('fs'),path=require('path');
  new Function(fs.readFileSync(path.join(__dirname,'..','src','expedition_state.js'),'utf8'))();
}
if(!window.APH.Storage){
  const fs=require('fs'),path=require('path');
  new Function(fs.readFileSync(path.join(__dirname,'..','src','storage.js'),'utf8'))();
}
const E=window.APH.ExpeditionState;
const CFG=window.APH.CFG;
const DEST={kind:'planet',planetId:'P00000011',seed:17};

function fixture(){
  return {meta:{research:5,res:{food:8},residents:[
    {id:'r1',name:'甲',skills:{sk_build:3},worldId:'home'},
    {id:'r2',name:'乙',skills:{sk_lore:3},downed:true,worldId:'home'},
    {id:'r3',name:'丙',skills:{sk_farm:3},medLying:true,worldId:'home'}
  ]},colony:{pendingGround:[]}};
}

test('expedition state: 击败守护者只记账, 不结束永久家园',()=>{
  const s={mode:'running',clock:12,cry:3,guardianCleared:false};
  E.noteGuardianCleared(s);
  if(s.guardianCleared!==true) throw new Error('应记下守护者已清除');
  if(s.mode!=='running') throw new Error('不得把家园打成通关: '+s.mode);
});

test('expedition state: 三类 objective 只接受 CFG 中真实且类别匹配的物品',()=>{
  const s=fixture();
  ['resources','samples','relics'].forEach(kind=>{
    if(!E.objective(kind))throw new Error(kind+' 应可供主入口查询');
    const out=E.validateSelection(s.meta,['r1'],{food:1},kind,DEST);
    if(!out.ok||out.objective.kind!==kind)throw new Error(kind+' 目标应有效: '+JSON.stringify(out));
  });
  const saved=CFG.expedition.objectives.samples;
  try{
    CFG.expedition.objectives.samples={target:1,itemIds:['it_ghost']};
    const bad=E.validateSelection(s.meta,['r1'],{food:1},'samples',DEST);
    if(bad.ok||bad.why!=='invalid-objective')throw new Error('未知奖励物不得进入目标');
  }finally{CFG.expedition.objectives.samples=saved;}
});

test('expedition state: 倒地/医疗居民被过滤，补给不足或目标错误时绝不扣粮',()=>{
  const s=fixture(),before=s.meta.res.food;
  if(E.eligibleMembers(s.meta).map(r=>r.id).join(',')!=='r1')throw new Error('只应列出健康且在 home 的队员');
  let out=E.begin(s.meta,s.colony,['r1','r2'],{food:2},'resources',DEST);
  if(out.ok||out.why!=='unfit-member'||s.meta.res.food!==before)throw new Error('倒地成员应拒绝且不扣粮');
  [-1,NaN,1.5].forEach(food=>{
    out=E.begin(s.meta,s.colony,['r1'],{food:food},'resources',DEST);
    if(out.ok||out.why!=='invalid-supply'||s.meta.res.food!==before)throw new Error('非法补给 '+food+' 应拒绝且不扣粮');
  });
  out=E.begin(s.meta,s.colony,['r1'],{food:99},'resources',DEST);
  if(out.ok||out.why!=='insufficient-food'||s.meta.res.food!==before)throw new Error('缺粮应拒绝且不扣粮');
  out=E.begin(s.meta,s.colony,['r1'],{food:2},'unknown',DEST);
  if(out.ok||s.meta.res.food!==before)throw new Error('错误目标应拒绝且不扣粮');
  if(E.active(s.colony))throw new Error('失败路径不得残留 active run');
});

test('expedition state: 显式零补给和省略补给均可出发且不扣库存',()=>{
  let s=fixture(),out=E.begin(s.meta,s.colony,['r1'],{food:0},'resources',DEST);
  if(!out.ok||out.run.supply.food!==0||s.meta.res.food!==8)throw new Error('food=0 应可出发');
  s=fixture();out=E.begin(s.meta,s.colony,['r1'],{},'resources',DEST);
  if(!out.ok||out.run.supply.food!==0||s.meta.res.food!==8)throw new Error('省略 food 应按 0');
});

test('expedition state: begin 生成稳定 runId 并只改变所选居民 worldId',()=>{
  const s=fixture();s.meta.residents[1].downed=false;s.meta.residents[2].medLying=false;
  const out=E.begin(s.meta,s.colony,['r1','r3'],{food:3},'samples',DEST);
  if(!out.ok||out.run.id!=='ex_1'||s.meta.res.food!==5)throw new Error('远征建立失败: '+JSON.stringify(out));
  if(s.meta.residents[0].worldId!=='ex_1'||s.meta.residents[2].worldId!=='ex_1'||s.meta.residents[1].worldId!=='home')
    throw new Error('world roster 归属错误');
  if(E.membersForWorld(s.meta,'ex_1').length!==2||out.run.roster.length!==2)throw new Error('远征名册快照错误');
  const again=E.begin(s.meta,s.colony,['r2'],{food:1},'resources',DEST);
  if(again.ok||again.why!=='active-run'||s.meta.res.food!==5)throw new Error('已有远征不得重复扣补给');
});

test('expedition state: 现代补给合并迫降舱与精确实体库存，并避开已预订食材',()=>{
  const s=fixture();s.colony.rulesVersion=1;s.colony.logistics={v:1,nextTask:1,nextReservation:1,tasks:[],reservations:[]};
  s.meta.res.food=2;
  const berry={id:'berry',type:CFG.entType.DROPPED,itemId:'it_berry',n:3,x:10,y:10,containerId:'landing_cargo'};
  const meal={id:'meal',type:CFG.entType.DROPPED,itemId:'it_roasted_meat',n:2,x:12,y:10,containerId:'landing_cargo'};
  const entities=[berry,meal],reserveBerry=APH.Logistics.ensureTask(s.colony,{kind:'production',targetId:'cook',need:{it_berry:2}});
  APH.Logistics.reserveForTask(s.colony,s.meta.res,entities,reserveBerry,'cook1',{from:{x:10,y:10},stockSpot:{x:0,y:0}});
  const reserveFood=APH.Logistics.ensureTask(s.colony,{kind:'construction',targetId:'bp',need:{food:1}});
  APH.Logistics.reserveForTask(s.colony,s.meta.res,entities,reserveFood,'build1',{from:{x:0,y:0},stockSpot:{x:0,y:0}});
  const context={entities:entities};
  if(E.availableFood(s.meta,s.colony,context)!==4)throw new Error('可用粮应排除跨 key 实体锁与迫降舱预订');
  const out=E.begin(s.meta,s.colony,['r1'],{food:4},'resources',DEST,context);
  if(!out.ok||s.meta.res.food!==1||berry.n!==2||!meal.dead)throw new Error('现代补给扣取来源错误: '+JSON.stringify(out));
  const lots=Object.fromEntries(out.run.supply.foodLots.map(x=>[x.itemId,x.n]));
  if(lots.it_food!==1||lots.it_berry!==1||lots.it_roasted_meat!==2)throw new Error('补给必须保存精确来源类型: '+JSON.stringify(lots));
  const locks=s.colony.logistics.reservations;
  if(locks.length!==2||locks.find(x=>x.source.id==='berry').source.itemCount!==2)throw new Error('出征补给不得抢走任务预订');
});

test('expedition state: 现代补给不足失败时数字库存、实体与任务锁均零变化',()=>{
  const s=fixture();s.colony.rulesVersion=1;s.colony.logistics={v:1,nextTask:1,nextReservation:1,tasks:[],reservations:[]};s.meta.res.food=1;
  const berry={id:'berry',type:CFG.entType.DROPPED,itemId:'it_berry',n:1,x:0,y:0},entities=[berry];
  const task=APH.Logistics.ensureTask(s.colony,{kind:'production',targetId:'cook',need:{it_berry:1}});
  APH.Logistics.reserveForTask(s.colony,s.meta.res,entities,task,'cook1',{from:{x:0,y:0},stockSpot:{x:0,y:0}});
  const before=JSON.stringify({res:s.meta.res,entity:berry,logistics:s.colony.logistics});
  const out=E.begin(s.meta,s.colony,['r1'],{food:2},'resources',DEST,{entities:entities});
  if(out.ok||out.why!=='insufficient-food'||JSON.stringify({res:s.meta.res,entity:berry,logistics:s.colony.logistics})!==before)
    throw new Error('补给不足不得发生部分扣取');
});

test('expedition state: cargo 推进目标，reward 只描述实际回收物且不凭空加货',()=>{
  const s=fixture(),run=E.begin(s.meta,s.colony,['r1'],{food:1},'resources',DEST).run;
  const target=run.objective.target;
  E.addCargo(s.colony,run.id,'it_crystal_ore',target-1);
  let obj=E.objectiveState(s.colony,run.id);
  if(obj.progress!==target-1||obj.complete||obj.reward.items.it_crystal_ore!==target-1)throw new Error('目标计数错误');
  E.addCargo(s.colony,run.id,'it_mineral',1);obj=E.objectiveState(s.colony,run.id);
  if(!obj.complete||obj.progress!==target)throw new Error('资源目标应按真实 cargo 达成');
  if(run.cargo.it_crystal_ore!==target-1||run.cargo.it_mineral!==1)throw new Error('目标不得另外发奖励');
  const bad=E.addCargo(s.colony,run.id,'it_ghost',1);
  if(bad.ok||run.cargo.it_ghost)throw new Error('未知物品不得写入远征货物');
});

test('expedition state: JSON snapshot/restore 保留成员、货物、目标和 runtime',()=>{
  const s=fixture(),run=E.begin(s.meta,s.colony,['r1'],{food:2},'relics',DEST).run;
  E.addCargo(s.colony,run.id,'it_relic',1);
  E.setRuntime(s.colony,run.id,{planetId:'pl_7',clock:42,entities:[{id:'loot_1'}]});
  const json=JSON.stringify(E.snapshot(s.colony));
  const meta={research:s.meta.research,res:{food:s.meta.res.food},residents:[]};
  const colony={};
  const out=E.restore(meta,colony,json);
  if(!out.ok||out.run.id!==run.id||out.run.cargo.it_relic!==1||!out.run.objective.complete)
    throw new Error('活动远征读档不完整: '+JSON.stringify(out));
  if(out.run.runtime.planetId!=='pl_7'||out.run.runtime.entities[0].id!=='loot_1')throw new Error('runtime 未保留');
  if(out.run.destination.planetId!==DEST.planetId||out.run.destination.seed!==DEST.seed)
    throw new Error('目的地身份未随 snapshot/restore 保留');
  if(!out.run.supply.foodLots||out.run.supply.foodLots[0].itemId!=='it_food'||out.run.supply.foodLots[0].n!==2)
    throw new Error('补给来源批次未保留');
  if(meta.residents.length!==1||meta.residents[0].id!=='r1'||meta.residents[0].worldId!==run.id)
    throw new Error('名册快照未恢复 world 归属');
});

test('expedition state: restore 明确拒绝缺少已解析目的地的旧 Active Run',()=>{
  const s=fixture(),run=E.begin(s.meta,s.colony,['r1'],{food:0},'resources',DEST).run;
  const snap=E.snapshot(s.colony);delete snap.active.destination;
  const out=E.restore(s.meta,s.colony,snap);
  if(out.ok||out.why!=='invalid-destination'||!out.run||out.run.id!==run.id)
    throw new Error('恢复层必须暴露目的地损坏并保留 run 供上层安全回收: '+JSON.stringify(out));
});

test('expedition state: 返航保留原 itemId 落地，研究物沿 settleGoods，runId 重放只结一次',()=>{
  const s=fixture(),run=E.begin(s.meta,s.colony,['r1'],{food:2},'resources',DEST).run;
  E.setCargo(s.colony,run.id,{it_wood:2,it_alloy:1,it_crystal_ore:2,it_relic:1,specimen_dew:1});
  const first=E.returnHome(s.meta,s.colony,run.id,{x:1100,y:1200});
  if(!first.ok||first.alreadySettled||first.research!==44||s.meta.research!==49)
    throw new Error('首次返航研究结算错误: '+JSON.stringify(first));
  const byId=Object.fromEntries(s.colony.pendingGround.map(d=>[d.itemId,d.n]));
  if(byId.it_wood!==2||byId.it_alloy!==1||byId.specimen_dew!==1||byId.it_food!==2||byId.it_mineral)
    throw new Error('非研究货物必须保留原 itemId 待入库: '+JSON.stringify(byId));
  if(byId.it_crystal_ore||byId.it_relic)throw new Error('研究类应按 settleGoods 转研究点');
  if(s.meta.residents[0].worldId!=='home'||E.active(s.colony))throw new Error('返航应恢复 home 归属并清 active');

  /* 模拟 pendingGround 已被主入口刷成实体并保存，再重启重放返航按钮。 */
  s.colony.pendingGround=[];
  const meta2=JSON.parse(JSON.stringify(s.meta)),colony2=JSON.parse(JSON.stringify(s.colony));
  const second=E.returnHome(meta2,colony2,run.id,{x:1100,y:1200});
  if(!second.ok||!second.alreadySettled||second.research!==0||second.drops.length)
    throw new Error('重复返航必须是空 effects: '+JSON.stringify(second));
  if(meta2.research!==49||colony2.pendingGround.length)throw new Error('读档重放不得重复研究或货物');
});

test('expedition state: 返航只退还剩余补给且不计入 objective',()=>{
  const s=fixture(),run=E.begin(s.meta,s.colony,['r1'],{food:3},'resources',DEST).run;
  run.supply.food=1;
  E.addCargo(s.colony,run.id,'it_crystal_ore',1);
  const before=E.objectiveState(s.colony,run.id).progress;
  const out=E.returnHome(s.meta,s.colony,run.id,{x:10,y:20});
  const food=out.drops.filter(d=>d.itemId==='it_food').reduce((n,d)=>n+d.n,0);
  if(food!==1)throw new Error('只应退还未吃的 1 份补给: '+JSON.stringify(out.drops));
  if(out.receipt.objective.progress!==before)throw new Error('补给退还不得计入远征目标');
});

test('expedition state: 未吃完的现代精确食物按原类型返航且共享记忆只记一次',()=>{
  const s=fixture();s.colony.rulesVersion=1;s.colony.logistics={v:1,nextTask:1,nextReservation:1,tasks:[],reservations:[]};s.meta.res.food=0;
  const entities=[{id:'berries',type:CFG.entType.DROPPED,itemId:'it_berry',n:2,x:1,y:1},
    {id:'meal',type:CFG.entType.DROPPED,itemId:'it_roasted_meat',n:2,x:2,y:1}];
  const run=E.begin(s.meta,s.colony,['r1'],{food:4},'samples',DEST,{entities:entities}).run;
  run.supply.food=3;run.runtime.clock=42;
  const original=APH.Res.rememberShared,calls=[];
  try{
    APH.Res.rememberShared=(meta,ids,memory)=>{calls.push({ids:ids.slice(),memory:memory});return {ok:true};};
    const first=E.returnHome(s.meta,s.colony,run.id,{x:10,y:20});
    const returned=Object.fromEntries(first.drops.map(x=>[x.itemId,x.n]));
    if(returned.it_berry!==1||returned.it_roasted_meat!==2||returned.it_food)
      throw new Error('未吃补给应按精确来源返还: '+JSON.stringify(returned));
    if(calls.length!==1||calls[0].memory.id!=='expedition:'+run.id||calls[0].memory.clock!==42||calls[0].memory.kind!=='expedition')
      throw new Error('首次结算应写一次稳定共享记忆: '+JSON.stringify(calls));
    E.returnHome(s.meta,s.colony,run.id,{x:10,y:20});
    if(calls.length!==1)throw new Error('重复返航不得重复写记忆/关系');
  }finally{APH.Res.rememberShared=original;}
});
