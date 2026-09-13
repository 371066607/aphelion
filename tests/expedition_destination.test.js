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

test('#202 loadMeta: future authoritative meta 在任何迁移或 Atlas 回填前拒绝且磁盘零变化',()=>{
  const spec=Planet.newObservedPlanet(0x20220),metaRaw=JSON.stringify(fixture().meta);
  const futureMeta={v:APH.CFG.save.VERSION+1,res:{food:99},residents:[],futureField:{keep:true}};
  const oldColony={v:APH.CFG.save.COLONY_VERSION-1,rulesVersion:1,buildings:[],buildQueue:[],pendingGround:[],
    scene:{v:1,kind:'home',generation:0,seed:22,width:APH.CFG.WORLD,height:APH.CFG.WORLD,grid:APH.CFG.GRID},
    metaSnapshot:futureMeta,stock:futureMeta.res};
  const colonyRaw=JSON.stringify(oldColony),planetRaw=JSON.stringify(spec);
  localStorage.setItem(APH.CFG.save.KEY_META,metaRaw);
  localStorage.setItem(APH.CFG.save.KEY_COLONY,colonyRaw);
  localStorage.setItem(APH.CFG.save.KEY_PLANET+spec.id,planetRaw);
  let threw=false;
  try{Save.loadMeta();}catch(e){threw=true;assert(e.aphSaveVersion===futureMeta.v,'错误应带 future meta 版本');}
  assert(threw,'家园快照中的 future authoritative meta 必须拒绝读取');
  assert(localStorage.getItem(APH.CFG.save.KEY_META)===metaRaw,'拒绝前不得写回 meta');
  assert(localStorage.getItem(APH.CFG.save.KEY_COLONY)===colonyRaw,'拒绝前不得升级或改写 colony envelope');
  assert(localStorage.getItem(APH.CFG.save.KEY_PLANET+spec.id)===planetRaw,'拒绝前不得因 Atlas 扫描改写 PlanetSpec');
  assert(Save.saveMeta(fixture().meta)===false,'普通 saveMeta 也不得覆盖 future authoritative meta');
  assert(localStorage.getItem(APH.CFG.save.KEY_META)===metaRaw&&localStorage.getItem(APH.CFG.save.KEY_COLONY)===colonyRaw,
    'saveMeta 拒绝 future authoritative meta 时必须保持原始字节');
});

test('#202 loadMeta: 任意非对象 authoritative metaSnapshot 回退 standalone 且不迁移 colony',()=>{
  ['corrupt',[], '',0,null].forEach((bad,index)=>{
    Save.wipeAll();
    const standalone=fixture().meta;standalone.marker='standalone-'+index;
    const colony={v:APH.CFG.save.COLONY_VERSION-1,rulesVersion:1,buildings:[],buildQueue:[],pendingGround:[],
      scene:{v:1,kind:'home',generation:0,seed:23,width:APH.CFG.WORLD,height:APH.CFG.WORLD,grid:APH.CFG.GRID},
      metaSnapshot:bad,stock:{food:99}};
    const colonyRaw=JSON.stringify(colony);
    localStorage.setItem(APH.CFG.save.KEY_META,JSON.stringify(standalone));
    localStorage.setItem(APH.CFG.save.KEY_COLONY,colonyRaw);
    const loaded=Save.loadMeta();
    assert(loaded&&loaded.marker==='standalone-'+index,'损坏 nested meta 应回退可读 standalone meta: '+JSON.stringify(bad));
    assert(localStorage.getItem(APH.CFG.save.KEY_COLONY)===colonyRaw,
      '回退损坏 nested meta 时不得迁移或改写 colony 原始字节: '+JSON.stringify(bad));
  });
});

test('#202 saveMeta: 活动旧实例在 emit 前拒绝覆盖另一标签页的 future metaSnapshot',()=>{
  const meta=fixture().meta,liveColony={v:APH.CFG.save.COLONY_VERSION,buildings:[],buildQueue:[],marker:'live'};
  const futureMeta={v:APH.CFG.save.VERSION+1,res:{food:88},futureField:'new-tab'};
  const diskColony={v:APH.CFG.save.COLONY_VERSION,rulesVersion:1,buildings:[],buildQueue:[],pendingGround:[],
    scene:{v:1,kind:'home',generation:0,seed:24,width:APH.CFG.WORLD,height:APH.CFG.WORLD,grid:APH.CFG.GRID},
    metaSnapshot:futureMeta,stock:futureMeta.res};
  const raw=JSON.stringify(diskColony),beforeLive=JSON.stringify(liveColony),priorState=window.APH.state;
  let emitted=0;const listener=function(){emitted++;};
  localStorage.setItem(APH.CFG.save.KEY_COLONY,raw);
  window.APH.state={meta:meta,colony:liveColony,scene:'home',_worldReady:true};
  APH.U.on('metaWillSave',listener);
  try{
    assert(Save.saveMeta(meta)===false,'活动旧实例必须拒绝 future authoritative meta');
    assert(Save.saveColony(liveColony)===false,'统一 colony 写入口也必须拒绝 future authoritative meta');
  }finally{APH.U.off('metaWillSave',listener);window.APH.state=priorState;}
  assert(emitted===0,'拒绝必须发生在 metaWillSave/checkpoint 之前');
  assert(JSON.stringify(liveColony)===beforeLive,'拒绝前不得把旧 meta 写进活动 colony 对象');
  assert(localStorage.getItem(APH.CFG.save.KEY_COLONY)===raw,'磁盘 future colony 必须保持原始字节');
  assert(localStorage.getItem(APH.CFG.save.KEY_META)===null,'拒绝后不得单独写出旧 meta key');
});

test('#202 save planet: future authoritative metaSnapshot 不得被发现或重访覆盖',()=>{
  const spec=Planet.newObservedPlanet(0x20221),meta=fixture().meta;
  const futureMeta={v:APH.CFG.save.VERSION+1,res:{food:77},futureField:'keep'};
  const colony={v:APH.CFG.save.COLONY_VERSION,rulesVersion:1,buildings:[],buildQueue:[],pendingGround:[],
    scene:APH.TerrainModel.newHome(221),metaSnapshot:futureMeta,stock:futureMeta.res};
  const colonyRaw=JSON.stringify(colony);
  localStorage.setItem(APH.CFG.save.KEY_COLONY,colonyRaw);
  let out=Save.savePlanetDiscovery(meta,spec,21);
  assert(out&&!out.ok&&out.why==='persistence-failed','发现不得覆盖 future authoritative meta');
  assert(localStorage.getItem(APH.CFG.save.KEY_COLONY)===colonyRaw&&Save.loadPlanet(spec.id)===null,
    '发现拒绝后 colony 与 PlanetSpec 必须零变化');

  Save.wipeAll();Save.savePlanet(spec.id,spec);localStorage.setItem(APH.CFG.save.KEY_COLONY,colonyRaw);
  const planetRaw=localStorage.getItem(APH.CFG.save.KEY_PLANET+spec.id);
  out=Save.savePlanetVisit(meta,spec,22);
  assert(out&&!out.ok&&out.why==='persistence-failed','重访不得覆盖 future authoritative meta');
  assert(localStorage.getItem(APH.CFG.save.KEY_COLONY)===colonyRaw&&
    localStorage.getItem(APH.CFG.save.KEY_PLANET+spec.id)===planetRaw&&localStorage.getItem(APH.CFG.save.KEY_META)===null,
    '重访拒绝后 colony、PlanetSpec 与 meta 必须零变化');
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

test('#202 atlas: 首访与重访保留发现时间和扩展字段，只递增访问记录',()=>{
  const meta=fixture().meta,spec=Planet.newObservedPlanet(0x20201);
  let out=APH.Atlas.record(meta,spec,1200);
  assert(out.ok&&out.entry.visits===1&&out.entry.lastVisitedAt===1200,'首次发现应同时记为第一次实际着陆');
  meta.atlas.planets[spec.id].futureSummary={keep:true};
  out=APH.Atlas.visit(meta,spec,2400);
  assert(out.ok&&out.entry.visits===2&&out.entry.lastVisitedAt===2400,'重访应只递增 visits 并更新时间');
  assert(out.entry.discoveredAt===1200&&out.entry.futureSummary.keep===true,'重访不得覆盖发现时间或未知摘要字段');
});

test('#202 legacy backfill: 旧短 P ID 原样进入 Atlas，且不伪造 Observation',()=>{
  const p1=Planet.fallbackPlanet(1),p4097=Planet.fallbackPlanet(4097);
  assert(p1.id==='P1'&&p4097.id==='P1','夹具必须复现旧低 12 位碰撞命名，而不是改写历史 ID');
  const other=Planet.fallbackPlanet(0xABC);
  assert(Save.savePlanet(p1.id,p1)&&Save.savePlanet(other.id,other),'旧 PlanetSpec 夹具写入失败');
  const before1=localStorage.getItem(APH.CFG.save.KEY_PLANET+p1.id);
  const beforeOther=localStorage.getItem(APH.CFG.save.KEY_PLANET+other.id);
  const meta=Save.loadMeta(),ids=APH.Atlas.list(meta).map(function(e){return e.planetId;}).sort();
  assert(ids.join(',')==='P1,PABC','Atlas 回填必须保留既有 key/ID: '+ids.join(','));
  assert(APH.Atlas.find(meta,'P1').observed===false&&APH.Atlas.find(meta,'PABC').observed===false,
    '无 Observation 的旧档不得被标成已观测地图');
  assert(localStorage.getItem(APH.CFG.save.KEY_PLANET+p1.id)===before1&&
    localStorage.getItem(APH.CFG.save.KEY_PLANET+other.id)===beforeOther,'回填索引不得改写 PlanetSpec 原始字节');
  assert(Save.loadPlanet('P00000001')===null,'回填不得把旧 P1 偷偷重命名为新全 seed ID');
});

test('#202 atlas migration: #201 的 visits 0 发现先归一为首访，再重访变 2',()=>{
  const spec=Planet.newObservedPlanet(0x20222),meta=fixture().meta;
  meta.atlas={v:APH.Atlas.VERSION,order:[spec.id],planets:{}};
  meta.atlas.planets[spec.id]={planetId:spec.id,seed:spec.seed,name:spec.name,discoveredAt:120,visits:0,observed:true};
  Save.savePlanet(spec.id,spec);localStorage.setItem(APH.CFG.save.KEY_META,JSON.stringify(meta));
  const loaded=Save.loadMeta(),migrated=APH.Atlas.find(loaded,spec.id);
  assert(migrated.visits===1&&migrated.lastVisitedAt===120,'#201 发现应迁移为一次实际首访: '+JSON.stringify(migrated));
  const out=Save.savePlanetVisit(loaded,spec,240),visited=APH.Atlas.find(loaded,spec.id);
  assert(out.ok&&visited.visits===2&&visited.lastVisitedAt===240,'迁移后的第一次重访应成为第 2 次访问');
});

test('#202 legacy backfill: 危险运行字段损坏的 PlanetSpec 不进入 Atlas',()=>{
  const badTier=Planet.fallbackPlanet(0x230),badDensity=Planet.fallbackPlanet(0x231),badNight=Planet.fallbackPlanet(0x232),badWeights=Planet.fallbackPlanet(0x233);
  badTier.tier=999;badDensity.terrain.crystalDensity=-1;delete badNight.enemies.factions[0].nightBoost;badWeights.enemies.weights={};
  [badTier,badDensity,badNight,badWeights].forEach(function(spec){
    localStorage.setItem(APH.CFG.save.KEY_PLANET+spec.id,JSON.stringify(spec));
  });
  const meta=Save.loadMeta();
  assert(APH.Atlas.list(meta).length===0,'损坏 PlanetSpec 不得成为可选目的地: '+JSON.stringify(APH.Atlas.list(meta)));
});

test('#202 visit: 已知星只原子保存 Atlas 访问记录，不改写 PlanetSpec',()=>{
  const s=fixture(),spec=Planet.newObservedPlanet(0x20202);
  assert(Save.savePlanetDiscovery(s.meta,spec,1000).ok,'已知星夹具发现失败');
  const planetKey=APH.CFG.save.KEY_PLANET+spec.id,planetRaw=localStorage.getItem(planetKey);
  const out=Save.savePlanetVisit(s.meta,spec,3000),entry=APH.Atlas.find(s.meta,spec.id);
  assert(out.ok&&entry.visits===2&&entry.lastVisitedAt===3000&&entry.discoveredAt===1000,
    '重访没有写入精确的访问记录: '+JSON.stringify(entry));
  assert(localStorage.getItem(planetKey)===planetRaw,'重访不得序列化或改写 PlanetSpec');
  const loaded=Save.loadMeta(),reloaded=APH.Atlas.find(loaded,spec.id);
  assert(reloaded&&reloaded.visits===2&&reloaded.lastVisitedAt===3000,'重访记录必须可从持久 meta 重载');
});

test('#202 visit: colony 写失败回滚 meta/colony，PlanetSpec 与调用方内存零变化',()=>{
  const s=fixture(),spec=Planet.newObservedPlanet(0x20203),priorState=window.APH.state;
  assert(Save.savePlanetDiscovery(s.meta,spec,1001).ok,'失败夹具发现失败');
  s.meta.marker='memory-meta';s.colony.marker='memory-colony';
  const colony={v:APH.CFG.save.COLONY_VERSION,rulesVersion:1,buildings:[],buildQueue:[],pendingGround:[],
    scene:APH.TerrainModel.newHome(202),metaSnapshot:JSON.parse(JSON.stringify(s.meta)),stock:JSON.parse(JSON.stringify(s.meta.res)),marker:'disk-colony'};
  localStorage.setItem(APH.CFG.save.KEY_COLONY,JSON.stringify(colony));
  const keys=[APH.CFG.save.KEY_PLANET+spec.id,APH.CFG.save.KEY_META,APH.CFG.save.KEY_COLONY];
  const raws=keys.map(function(key){return localStorage.getItem(key);}),memoryBefore=JSON.stringify(s);
  const realSet=localStorage.setItem;let colonyWrites=0;
  window.APH.state={meta:s.meta,colony:s.colony};
  try{
    localStorage.setItem=function(key,value){
      if(key===APH.CFG.save.KEY_COLONY&&colonyWrites++===0)throw new Error('quota at colony');
      return realSet.call(localStorage,key,value);
    };
    const out=Save.savePlanetVisit(s.meta,spec,3001);
    assert(out&&!out.ok&&out.why==='persistence-failed','访问记录持久化失败应显式返回');
  }finally{localStorage.setItem=realSet;window.APH.state=priorState;}
  keys.forEach(function(key,i){assert(localStorage.getItem(key)===raws[i],key+' 未按原始字节回滚');});
  assert(JSON.stringify(s)===memoryBefore,'失败事务不得改变调用方 meta/colony 内存');
});
