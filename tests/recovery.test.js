const assert=require('assert');
if(!window.APH.Recovery)require('../src/recovery.js');

function recoveryState(seed){
  APH.CFG.recovery=Object.assign({},APH.CFG.recovery,{materialFraction:.5});
  const scene=APH.TerrainModel.home(seed||77);
  const descriptor=APH.TerrainModel.resources(scene,{}).find(function(e){return e.repairable;});
  assert(descriptor,'测试 seed 应生成可修复残骸');
  const wreck=Object.assign({},descriptor,{id:descriptor.uid,hp:20,maxHp:20});
  const resident={id:'repair_worker',subSkill:'sk_build',skills:{sk_build:0}};
  const worker={id:resident.id,rid:resident.id,type:APH.CFG.entType.RESIDENT,x:wreck.x+48,y:wreck.y,
    userOrder:{type:'gather',flora:wreck}};
  return {scene:'home',mode:'running',meta:{tech:{te_machining:1},residents:[resident],res:{}},
    colony:{rulesVersion:1,scene:scene,buildings:[],buildQueue:[],depleted:{},floraState:{}},
    entities:[wreck,worker],designations:{[wreck.id]:'mine'},parts:[],wreck:wreck,worker:worker};
}

test('Recovery.plan 缺料蓝图沿正式建造需求走半价，不预扣库存',function(){
  const s=recoveryState(77), before=JSON.stringify(s.meta.res);
  const out=APH.Recovery.plan(s,s.wreck);
  assert.equal(out.ok,true,out.why);
  assert.equal(out.q.uid,'repair_'+s.wreck.uid);
  assert.equal(out.q.repairSourceId,s.wreck.id);
  assert.equal(out.q.geometryVersion,1);
  assert.equal(out.q.gx,Math.floor(s.wreck.x/48));
  assert.equal(out.q.gy,Math.floor(s.wreck.y/48));
  assert.equal(out.q.total,APH.Colony.get('bl_solar_panel').buildTime);
  assert.deepEqual(out.q.need,{iron:13,stone:5,mineral:13});
  assert.equal(out.q.materialsPaid,false);
  assert.equal(JSON.stringify(s.meta.res),before);
  assert.equal(!!s.wreck.dead,false);
  assert.equal(s.wreck.pendingRepair,out.q.uid);
  assert.equal(s.designations[s.wreck.id],undefined);
  assert.equal(s.worker.userOrder,null);
  assert(s.entities.some(function(e){return e.type===APH.CFG.entType.BLUEPRINT&&e.id===out.q.uid;}));
  assert.equal(APH.Recovery.plan(s,s.wreck).ok,false,'同一残骸不得重复排队');
});

test('Recovery.plan 遵守真实科技与空间校验',function(){
  const noTech=recoveryState(77);
  delete noTech.meta.tech.te_machining;
  const denied=APH.Recovery.plan(noTech,noTech.wreck);
  assert.equal(denied.ok,false);
  assert(denied.why.indexOf('研发')>=0);
  assert.equal(noTech.colony.buildQueue.length,0);

  const occupied=recoveryState(77);
  occupied.colony.buildings.push(APH.Construction.record('bl_bed',occupied.wreck.x,occupied.wreck.y,0));
  const blocked=APH.Recovery.plan(occupied,occupied.wreck);
  assert.equal(blocked.ok,false);
  assert(blocked.why.indexOf('占用')>=0);
  assert.equal(occupied.wreck.pendingRepair,undefined);
});

test('Recovery.cancel 只解除源残骸锁，不改队列与物流状态',function(){
  const s=recoveryState(77), out=APH.Recovery.plan(s,s.wreck), q=out.q;
  q.taskId='task_kept';
  const queueBefore=s.colony.buildQueue.slice();
  const cancelled=APH.Recovery.cancel(s,q);
  assert.equal(cancelled.ok,true,cancelled.why);
  assert.equal(s.wreck.pendingRepair,undefined);
  assert.deepEqual(s.colony.buildQueue,queueBefore);
  assert.equal(q.taskId,'task_kept');
});

test('修复锁定期间 workOnFlora 不伤残骸也不产生拆解收益',function(){
  const s=recoveryState(77), q=APH.Recovery.plan(s,s.wreck).q;
  const hp=s.wreck.hp;
  const out=APH.Colony.workOnFlora(s.wreck,s.meta.residents[0],100);
  assert.equal(out.locked,true);
  assert.equal(out.done,false);
  assert.equal(out.dropItemId,null);
  assert.equal(s.wreck.hp,hp);
  assert.equal(s.wreck.pendingRepair,q.uid);
});

test('正式施工完成会消耗修复源，并只生成目标建筑',function(){
  const s=recoveryState(77), q=APH.Recovery.plan(s,s.wreck).q;
  const workCell=APH.BuildGrid.interactionCells(q,APH.Colony.list(),{scene:s.colony.scene})[0];
  s.worker.x=(workCell.gx+.5)*48;s.worker.y=(workCell.gy+.5)*48;
  const task=APH.Logistics.ensureTask(s.colony,{kind:'construction',targetId:q.uid,x:q.x,y:q.y,need:q.need});
  task.deliveredLots=Object.keys(q.need).map(function(key){return {key:key,amount:q.need[key],itemId:'it_'+key,itemCount:q.need[key]};});
  q.taskId=task.id;
  APH.Colony.tickConstruction(s,q.total);
  assert.equal(s.colony.buildQueue.length,0);
  assert.equal(s.colony.buildings.filter(function(b){return b.id==='bl_solar_panel';}).length,1);
  assert.equal(s.wreck.dead,true);
  assert.equal(s.colony.depleted[s.wreck.uid],true);
  assert.equal(s.entities.some(function(e){return e.kind==='rock_wreckage'&&!e.dead;}),false);
  assert.equal(s.entities.filter(function(e){return e.type===APH.CFG.entType.DROPPED;}).length,0);
});

test('Recovery.complete 永久采空源残骸，重复完成不生成任何收益',function(){
  const s=recoveryState(77), q=APH.Recovery.plan(s,s.wreck).q;
  const resBefore=JSON.stringify(s.meta.res), entityCount=s.entities.length;
  const first=APH.Recovery.complete(s,q);
  assert.equal(first.ok,true,first.why);
  assert.equal(first.already,false);
  assert.equal(s.wreck.dead,true);
  assert.equal(s.wreck._queued,true);
  assert.equal(s.wreck.amount,0);
  assert.equal(s.colony.depleted[s.wreck.uid],true);
  assert.deepEqual(s.colony.floraState[s.wreck.id],{hp:0,dead:true,depleted:true});
  const rebuilt=APH.TerrainModel.resources(s.colony.scene,s.colony.depleted)
    .find(function(e){return e.uid===s.wreck.uid;});
  assert(rebuilt&&rebuilt.depleted,'读档重建时该残骸必须保持采空');
  const second=APH.Recovery.complete(s,q);
  assert.equal(second.ok,true);
  assert.equal(second.already,true);
  assert.equal(JSON.stringify(s.meta.res),resBefore);
  assert.equal(s.entities.length,entityCount);
});

test('Recovery.reconcile 解开孤儿锁，缺源蓝图只报错且绝不补实体',function(){
  const s=recoveryState(77);
  s.wreck.pendingRepair='missing_q';
  let out=APH.Recovery.reconcile(s);
  assert.deepEqual(out.unlocked,[s.wreck.id]);
  assert.equal(s.wreck.pendingRepair,undefined);

  const missing={uid:'repair_missing',repairSourceId:'missing_source'};
  s.colony.buildQueue.push(missing);
  const count=s.entities.length;
  out=APH.Recovery.reconcile(s);
  assert.equal(out.ok,false);
  assert.equal(out.errors.length,1);
  assert.equal(out.errors[0].q,missing);
  assert.equal(s.entities.length,count,'reconcile 不得凭空补回残骸实体');
  assert.equal(s.colony.buildQueue[0],missing,'reconcile 不得替 root 擅自取消蓝图');
});

test('Colony 重建会恢复 pendingRepair，reconcile 保留合法修复队列',function(){
  const source=recoveryState(77), q=APH.Recovery.plan(source,source.wreck).q;
  source.colony.floraState[source.wreck.id]={hp:source.wreck.hp,dead:false,pendingRepair:q.uid};
  const prior=APH.state;
  try{
    APH.state={scene:'home',seed:77,meta:source.meta,colony:source.colony,entities:[],parts:[],war:{},clock:0};
    APH.Colony.buildColonyWorld(77);
    const restored=APH.state.entities.find(function(e){return e.id===source.wreck.id;});
    assert(restored,'可修复源应由地形清单重建');
    assert.equal(restored.pendingRepair,q.uid);
    const report=APH.Recovery.reconcile(APH.state);
    assert.equal(report.ok,true);
    assert.equal(report.errors.length,0);
    assert.equal(restored.pendingRepair,q.uid);
  }finally{APH.state=prior;}
});
