'use strict';

function constructionTargetFixture(){
  const a=window.APH, s={scene:'home',mode:'running',clock:0,parts:[],entities:[],
    war:{raidActive:false},designations:{},selectedRid:null,selectedPawns:[],
    meta:a.Save.loadMeta(),colony:{rulesVersion:1,scene:a.TerrainModel.legacy(17,'home'),buildings:[],buildQueue:[]}};
  const r=a.Res.generate('rs_target_worker',33,[]);
  r.job=null;r.food=100;r.rest=100;r.recreation=100;r.schedule=new Array(24).fill('work');
  s.meta.residents=[r];s.meta.workPrio={[r.id]:{sk_build:2,sk_haul:0,sk_gather:0}};
  const floor=a.Construction.record('bl_floor',21*48,21*48,0);
  const bed=a.Construction.record('bl_bed',21*48,21*48,2);
  [floor,bed].forEach((q,i)=>{
    q.uid='b_target_'+i;q.total=a.Colony.get(q.bid).buildTime;q.progress=0;
    q.materialsPaid=false;q.need=a.Construction.materialNeed(a.Colony.get(q.bid));
    const task=a.Logistics.ensureTask(s.colony,{kind:'construction',targetId:q.uid,x:q.x,y:q.y,need:q.need});
    Object.keys(q.need).forEach(key=>task.deliveredLots.push({key,amount:q.need[key],itemId:'it_'+key,itemCount:q.need[key]}));
    q.taskId=task.id;s.colony.buildQueue.push(q);
  });
  return {a,s,r,floor,bed};
}

test('construction: overlapping floor and reversed bed finish without switching targets each frame',()=>{
  const old=window.APH.state, {a,s,r}=constructionTargetFixture();
  try{
    a.state=s;a.ResidentWork.syncResidentEntities();
    const e=s.entities.find(e=>e.rid===r.id);e.x=1032;e.y=1041.2;
    for(let i=0;i<800&&s.colony.buildQueue.length;i++){
      s.clock+=.05;a.ResidentWork.update(s,.05);a.Colony.tickConstruction(s,.05);
    }
    if(s.colony.buildQueue.length)throw Error('worker keeps reversing between interaction cells: '+JSON.stringify({x:e.x,y:e.y,queue:s.colony.buildQueue.map(q=>[q.bid,q.progress])}));
    if(s.colony.buildings.length!==2)throw Error('both planned layers must complete');
    if(s.colony.logistics.tasks.length||s.colony.logistics.reservations.length)throw Error('completed material tasks must be consumed');
  }finally{a.state=old;}
});

function overlappingLampFixture(){
  const {a,s,r}=constructionTargetFixture();
  s.colony.buildQueue=[];s.colony.logistics={tasks:[],reservations:[]};
  const floor=a.Construction.record('bl_floor',21*48,21*48,0);
  const lamp=a.Construction.record('bl_lamp',21*48,21*48,2);
  [floor,lamp].forEach((q,i)=>{
    q.uid='b_identity_'+i;q.total=a.Colony.get(q.bid).buildTime;q.progress=0;
    q.materialsPaid=false;q.need=a.Construction.materialNeed(a.Colony.get(q.bid));
    const task=a.Logistics.ensureTask(s.colony,{kind:'construction',targetId:q.uid,x:q.x,y:q.y,need:q.need});
    Object.keys(q.need).forEach(key=>task.deliveredLots.push({key,amount:q.need[key],itemId:'it_'+key,itemCount:q.need[key]}));
    q.taskId=task.id;s.colony.buildQueue.push(q);
  });
  s.colony.buildings.push(a.Construction.record('bl_wall',21*48,22*48,0));
  a.state=s;a.ResidentWork.syncResidentEntities();
  const e=s.entities.find(en=>en.rid===r.id);e.x=lamp.x;e.y=lamp.y;
  return {a,s,r,e,floor,lamp};
}

function finishLamp({a,s,e,floor,lamp}){
  for(let i=0;i<500&&!s.colony.buildings.some(b=>b.uid===lamp.uid);i++){
    s.clock+=.05;a.ResidentWork.update(s,.05);a.Colony.tickConstruction(s,.05);
  }
  if(!s.colony.buildings.some(b=>b.uid===lamp.uid))
    throw Error('reachable lamp was not finished: '+JSON.stringify({worker:{x:e.x,y:e.y,target:e.constructionTargetUid,reason:e.workReason},queue:s.colony.buildQueue.map(q=>[q.uid,q.progress])}));
  const pendingFloor=s.colony.buildQueue.find(q=>q.uid===floor.uid);
  if(!pendingFloor||pendingFloor.progress!==0)throw Error('blocked floor should remain untouched');
}

test('construction: overlapping floor and north-facing lamp keep the chosen blueprint identity',()=>{
  const old=window.APH.state;
  try{finishLamp(overlappingLampFixture());}finally{window.APH.state=old;}
});

test('construction: forced UID selects the lamp when another blueprint shares its centre',()=>{
  const old=window.APH.state;
  try{
    const fixture=overlappingLampFixture();
    fixture.e.userOrder={type:'build',x:fixture.lamp.x,y:fixture.lamp.y,uid:fixture.lamp.uid};
    finishLamp(fixture);
  }finally{window.APH.state=old;}
});

test('construction: coordinate-free build order keeps the identity selected by nearestBlueprint',()=>{
  const old=window.APH.state;
  try{
    const fixture=overlappingLampFixture();
    fixture.e.userOrder={type:'build'};
    finishLamp(fixture);
  }finally{window.APH.state=old;}
});

test('construction: legacy coordinate-only build order still finds its blueprint',()=>{
  const old=window.APH.state;
  try{
    const {a,s,r,floor}=constructionTargetFixture();
    s.colony.buildQueue=s.colony.buildQueue.filter(q=>q.uid===floor.uid);
    a.state=s;a.ResidentWork.syncResidentEntities();
    const e=s.entities.find(en=>en.rid===r.id);e.x=floor.x;e.y=floor.y;
    e.userOrder={type:'build',x:floor.x,y:floor.y};
    for(let i=0;i<200&&!s.colony.buildings.some(b=>b.uid===floor.uid);i++){
      s.clock+=.05;a.ResidentWork.update(s,.05);a.Colony.tickConstruction(s,.05);
    }
    if(!s.colony.buildings.some(b=>b.uid===floor.uid))throw Error('coordinate-only build order stopped working');
  }finally{window.APH.state=old;}
});

test('construction: thinkPawn carries blueprint identity through automatic and forced intents',()=>{
  const a=window.APH, blueprint={uid:'bp_lamp',x:1032,y:1032};
  const pawn={food:100,rest:100,prio:{sk_build:2},schedule:new Array(24).fill('work')};
  const automatic=a.Res.thinkPawn(pawn,{hour:12,blueprint});
  if(automatic.type!=='build'||automatic.uid!==blueprint.uid)throw Error('automatic intent lost blueprint UID');
  const forced=a.Res.thinkPawn(Object.assign({},pawn,{order:{type:'build',x:blueprint.x,y:blueprint.y,uid:blueprint.uid}}),{hour:12,blueprint});
  if(forced.type!=='build'||forced.uid!==blueprint.uid)throw Error('forced intent lost blueprint UID');
});
