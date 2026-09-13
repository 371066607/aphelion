'use strict';

const Planet=window.APH.Planet, Save=window.APH.Save, ExpeditionState=window.APH.ExpeditionState;

function assert(ok,message){if(!ok)throw new Error(message||'断言失败');}
function fixture(){
  return {meta:{v:1,research:0,res:{food:5},residents:[{id:'r1',name:'甲',worldId:'home'}],stats:{}},
    colony:{pendingGround:[]}};
}
function destination(spec){return {kind:'planet',planetId:spec.id,seed:spec.seed};}

test('#201 new planet: 全 seed ID 不碰撞且第一次创建即带确定 Observation',()=>{
  const p1=Planet.newObservedPlanet(1),p2=Planet.newObservedPlanet(4097),again=Planet.newObservedPlanet(1);
  assert(p1.id!==p2.id,'seed 1/4097 不得继续发生低 12 位 ID 碰撞');
  assert(/^P[0-9A-F]{8}$/.test(p1.id),'新 ID 应保留 P 前缀并编码完整 32-bit seed: '+p1.id);
  assert(JSON.stringify(p1)===JSON.stringify(again),'同 seed 新星及 Observation 必须可复现');
  assert(p1.observation&&p1.observation.biomeId===p1.biome.id,'PlanetSpec 必须持有匹配群系的 Observation');
  const scene=APH.TerrainModel.planet(p1),center=APH.TerrainModel.cellAt(scene,APH.CFG.HAB.x,APH.CFG.HAB.y);
  assert(APH.TerrainModel.hasObservation(scene)&&center.walkable,'远征描述应是可着陆的 observed terrain');
});

test('#201 discovery: PlanetSpec 与 Atlas 同批成功后才更新内存与可重载状态',()=>{
  const s=fixture(),spec=Planet.newObservedPlanet(20201);
  const out=Save.savePlanetDiscovery(s.meta,spec,1234);
  assert(out&&out.ok,'发现事务应成功: '+JSON.stringify(out));
  const loaded=Save.loadPlanet(spec.id),meta=Save.loadMeta();
  assert(loaded&&JSON.stringify(loaded.observation)===JSON.stringify(spec.observation),'PlanetSpec Observation 未持久化');
  const entry=APH.Atlas.find(meta,spec.id);
  assert(entry&&entry.planetId===spec.id&&entry.seed===spec.seed&&entry.discoveredAt===1234,'Atlas 未记录同一星球身份');
  assert(APH.Atlas.find(s.meta,spec.id),'成功后应一次更新调用方 meta Atlas');
});

test('#201 discovery: 任一持久化写失败会回滚且不建立远征或扣补给',()=>{
  const s=fixture(),spec=Planet.newObservedPlanet(20202),before=JSON.stringify(s),realSet=localStorage.setItem;
  try{
    localStorage.setItem=function(key,value){
      if(key===APH.CFG.save.KEY_META)throw new Error('quota');
      return realSet.call(localStorage,key,value);
    };
    const saved=Save.savePlanetDiscovery(s.meta,spec,1235);
    assert(saved&&!saved.ok&&saved.why==='persistence-failed','写失败应显式返回 persistence-failed');
  }finally{localStorage.setItem=realSet;}
  assert(JSON.stringify(s)===before,'失败事务不得改写内存 meta/colony/补给');
  assert(Save.loadPlanet(spec.id)===null,'失败事务不得留下半份 PlanetSpec');
  assert(!ExpeditionState.active(s.colony),'失败事务不得建立 Active Run');
});

test('#201 discovery: 第三步 colony 写失败会按原始字节回滚 planet/meta/colony 与内存',()=>{
  const s=fixture(),spec=Planet.newObservedPlanet(20212),priorState=window.APH.state;
  s.meta.marker='meta-before';s.colony.marker='memory-before';
  const oldPlanet=Object.assign({},spec,{name:'旧档星名',preserved:{planet:true}});
  const oldMeta=Object.assign({},s.meta,{preserved:{meta:true}});
  const oldColony={v:APH.CFG.save.COLONY_VERSION,buildings:[],buildQueue:[],pendingGround:[],
    scene:{v:1,kind:'home',generation:0,seed:7,width:APH.CFG.WORLD,height:APH.CFG.WORLD,grid:APH.CFG.GRID},
    metaSnapshot:oldMeta,stock:oldMeta.res,preserved:{colony:true}};
  const keys=[APH.CFG.save.KEY_PLANET+spec.id,APH.CFG.save.KEY_META,APH.CFG.save.KEY_COLONY];
  const raws=[JSON.stringify(oldPlanet),JSON.stringify(oldMeta),JSON.stringify(oldColony)];
  keys.forEach((key,i)=>localStorage.setItem(key,raws[i]));
  const memoryBefore=JSON.stringify(s),realSet=localStorage.setItem;let colonyWrites=0;
  window.APH.state={meta:s.meta,colony:s.colony};
  try{
    localStorage.setItem=function(key,value){
      if(key===APH.CFG.save.KEY_COLONY&&colonyWrites++===0)throw new Error('quota at colony');
      return realSet.call(localStorage,key,value);
    };
    const out=Save.savePlanetDiscovery(s.meta,spec,1235);
    assert(out&&!out.ok&&out.why==='persistence-failed','第三步失败应显式返回 persistence-failed');
  }finally{localStorage.setItem=realSet;window.APH.state=priorState;}
  keys.forEach((key,i)=>assert(localStorage.getItem(key)===raws[i],key+' 未按原始字节回滚'));
  assert(JSON.stringify(s)===memoryBefore,'失败事务不得改写调用方 meta/colony 内存');
  assert(!ExpeditionState.active(s.colony),'回滚后不得建立 Active Run');
});

test('#201 discovery: 无法读取的未来家园快照会安全拒绝且不写半份发现',()=>{
  const s=fixture(),spec=Planet.newObservedPlanet(20203),future={v:APH.CFG.save.COLONY_VERSION+1,buildings:[]};
  localStorage.setItem(APH.CFG.save.KEY_COLONY,JSON.stringify(future));
  const beforeMeta=JSON.stringify(s.meta),out=Save.savePlanetDiscovery(s.meta,spec,1236);
  assert(out&&!out.ok&&out.why==='persistence-failed','准备持久化异常应转为可处理失败');
  assert(JSON.stringify(s.meta)===beforeMeta,'准备失败不得改变调用方 meta');
  assert(Save.loadPlanet(spec.id)===null,'准备失败不得先写 PlanetSpec');
  assert(localStorage.getItem(APH.CFG.save.KEY_META)===null,'准备失败不得先写 Atlas');
  assert(localStorage.getItem(APH.CFG.save.KEY_COLONY)===JSON.stringify(future),'未来家园快照不得被改写');
});

test('#201 discovery: 未来 PlanetSpec 或 Atlas 版本不得被新发现降级覆盖',()=>{
  const spec=Planet.newObservedPlanet(20204),futurePlanet=Object.assign({},spec,{v:APH.CFG.save.VERSION+1,futureField:'keep'});
  const planetRaw=JSON.stringify(futurePlanet),meta=fixture().meta;
  localStorage.setItem(APH.CFG.save.KEY_PLANET+spec.id,planetRaw);
  let out=Save.savePlanetDiscovery(meta,spec,1237);
  assert(out&&!out.ok&&out.why==='persistence-failed','未来 PlanetSpec 应明确拒绝');
  assert(localStorage.getItem(APH.CFG.save.KEY_PLANET+spec.id)===planetRaw,'未来 PlanetSpec 不得被降级改写');
  assert(localStorage.getItem(APH.CFG.save.KEY_META)===null&&!meta.atlas,'拒绝后不得写 Atlas');

  Save.wipeAll();
  const futureAtlasMeta=fixture().meta;futureAtlasMeta.atlas={v:APH.Atlas.VERSION+1,order:[],planets:{},futureField:'keep'};
  const before=JSON.stringify(futureAtlasMeta);
  out=Save.savePlanetDiscovery(futureAtlasMeta,spec,1238);
  assert(out&&!out.ok&&out.why==='persistence-failed','未来 Atlas 应明确拒绝');
  assert(JSON.stringify(futureAtlasMeta)===before,'未来 Atlas 不得在内存中被降级改写');
  assert(Save.loadPlanet(spec.id)===null&&localStorage.getItem(APH.CFG.save.KEY_META)===null,'未来 Atlas 拒绝后不得写半份发现');
});

test('#201 atlas: loadMeta 与普通 saveMeta 原样保留未来 Atlas 顶层字段',()=>{
  const futureAtlas={v:APH.Atlas.VERSION+1,order:[],planets:{},futureField:{keep:true}};
  localStorage.setItem(APH.CFG.save.KEY_META,JSON.stringify({v:APH.CFG.save.VERSION,res:{food:1},stats:{},atlas:futureAtlas}));
  const loaded=Save.loadMeta();
  assert(JSON.stringify(loaded.atlas)===JSON.stringify(futureAtlas),'loadMeta 不得投影覆盖未来 Atlas');
  Save.saveMeta(loaded);
  const persisted=JSON.parse(localStorage.getItem(APH.CFG.save.KEY_META));
  assert(JSON.stringify(persisted.atlas)===JSON.stringify(futureAtlas),'普通 saveMeta 不得丢未来 Atlas 字段');
});

test('#201 expedition state: destination 必须已解析并写进唯一 Active Run',()=>{
  let s=fixture(),before=s.meta.res.food;
  let out=ExpeditionState.begin(s.meta,s.colony,['r1'],{food:2},'resources',null);
  assert(!out.ok&&out.why==='invalid-destination'&&s.meta.res.food===before,'缺少目的地应拒绝且不扣粮');
  out=ExpeditionState.begin(s.meta,s.colony,['r1'],{food:2},'resources',{kind:'unknown'});
  assert(!out.ok&&out.why==='unresolved-destination'&&s.meta.res.food===before,'未解析未知星不得进入 Active Run');
  const spec=Planet.newObservedPlanet(30303);
  out=ExpeditionState.begin(s.meta,s.colony,['r1'],{food:2},'resources',destination(spec));
  assert(out.ok&&s.meta.res.food===before-2,'有效目的地应只扣一次补给');
  assert(out.run.destination.planetId===spec.id&&out.run.destination.seed===spec.seed,'Active Run 缺少 Planet identity');
  assert(ExpeditionState.active(s.colony)===out.run,'不得另建第二份 active run');
});
