'use strict';

const assert=require('assert');
const CFG=window.APH.CFG;
const Planet=window.APH.Planet;
const TM=window.APH.TerrainModel;
const Colony=window.APH.Colony;
const Runtime=window.APH.WorldRuntime;

function clone(value){return JSON.parse(JSON.stringify(value));}
function landingCell(){return {gx:Math.floor(CFG.HAB.x/CFG.GRID),gy:Math.floor(CFG.HAB.y/CFG.GRID)};}
function assertResourceRecord(resource,seed,label,options){
  assert.equal(TM.resourceError(resource,true,seed,options),null,label+' 资源语义不完整');
  assert.equal(typeof resource.visualKind,'string',label+' 缺少视觉类型');
  assert(CFG.items[resource.yieldItemId],label+' 产出物不存在');
  assert(resource.amount>0&&resource.hp>0,label+' 数量/耐久无效');
  assert.equal(typeof resource.depleted,'boolean',label+' 缺少耗尽态');
  assert.equal(resource.seed,resource.seed>>>0,label+' seed 不是 uint32');
  assert.equal(typeof resource.renewable,'boolean',label+' 缺少再生策略');
  assert(Number.isInteger(resource.regenTicks)&&resource.regenTicks>=0,label+' 再生周期无效');
}

test('#203 所有受支持资源类型都有完整且可验证的共享语义',function(){
  const rules=CFG.observe.resourceSemantics;
  Object.keys(rules).forEach(function(kind,index){
    const record=TM.resourceRecord(20300,kind,index,0,null,'semantic_'+kind);
    assert(record,'无法生成资源记录 '+kind);
    assertResourceRecord(record,20300,kind);
    assert.equal(typeof rules[kind].name,'string',kind+' 缺少可见名称');
    assert.equal(record.visualKind,rules[kind].visualKind,kind+' 视觉类型分叉');
  });
});

test('#203 Observation 是四类远征群系唯一且确定的自然资源事实源',function(){
  const found={};
  for(let seed=0;seed<256&&Object.keys(found).length<4;seed++){
    const spec=Planet.newObservedPlanet(seed);
    found[spec.biome.id]=spec;
  }
  assert.equal(Object.keys(found).length,4,'没有覆盖四类远征群系');
  Object.keys(found).forEach(function(biomeId){
    const spec=found[biomeId],again=Planet.newObservedPlanet(spec.seed),observation=spec.observation;
    assert.equal(JSON.stringify(observation),JSON.stringify(again.observation),biomeId+' 同 seed 资源不稳定');
    assert(observation.resources.length>0,biomeId+' 没有自然资源');
    const profile=CFG.observe.biomes[biomeId],landing=landingCell(),safe=CFG.expedition.landingSafeRadiusCells;
    const beaconCells=new Set(spec.beacons.map(function(beacon){return Math.floor(beacon.x/CFG.GRID)+','+Math.floor(beacon.y/CFG.GRID);}));
    observation.resources.forEach(function(resource){
      assertResourceRecord(resource,spec.seed,biomeId+' '+resource.uid);
      const cell=APH.Observe.cellAt(observation,resource.gx,resource.gy);
      assert(cell&&cell.walkable,resource.uid+' 落在水或越界');
      assert(profile.resourceGround[resource.kind].includes(cell.tile),resource.uid+' 地表与资源不兼容');
      assert(!beaconCells.has(resource.gx+','+resource.gy),resource.uid+' 与信标关键格重叠');
      assert(Math.abs(resource.gx-landing.gx)>safe||Math.abs(resource.gy-landing.gy)>safe,resource.uid+' 侵入着陆安全区');
    });
    const primary=spec.biome.primaryFlora;
    assert(observation.resources.filter(function(r){return r.kind===primary;}).length>=4,biomeId+' 缺少保底主植物');
    const entities=TM.resources(TM.planet(spec),{});
    assert.equal(entities.errors.length,0,biomeId+' 实体化发生资源错误');
    assert.equal(entities.length,observation.resources.length,biomeId+' 又叠加了第二套自然资源');
    entities.forEach(function(entity){
      const source=observation.resources.find(function(r){return r.uid===entity.uid;});
      assert(source,'实体不来自 Observation: '+entity.id);
      assert.equal(entity.yieldItemId,source.yieldItemId);
      assert.equal(entity.seed,source.seed);
      assert.equal(entity.maxHp,source.hp);
    });
    assert(Planet.validate(spec).ok,biomeId+' 新 PlanetSpec 未通过校验');
  });
});

test('#203 未知资源类型在校验、实体化与采集处显式失败且绝不掉木材',function(){
  const spec=clone(Planet.newObservedPlanet(20301));
  const bad=spec.observation.resources[0];
  bad.kind='flora_not_registered';bad.visualKind='flora_not_registered';
  const checked=Planet.validate(spec);
  assert(!checked.ok&&checked.errors.some(function(error){return error.includes('unknown-resource-kind');}),
    'PlanetSpec 没有报告未知资源类型');
  const list=TM.resources(TM.planet(spec),{});
  assert.equal(list.some(function(resource){return resource.uid===bad.uid;}),false,'未知资源被实体化');
  assert(list.errors.some(function(error){return error.error.includes('unknown-resource-kind');}),'实体化没有明确错误');
  const target={id:'bad_resource',type:'flora',kind:'flora_not_registered',hp:10,maxHp:10};
  const before=clone(target),out=Colony.workOnFlora(target,{skills:{sk_farm:10}},999);
  assert(!out.done&&out.error&&out.error.includes('unknown-resource-kind'),'采集没有显式失败');
  assert.deepEqual(target,before,'失败采集修改了资源状态');
  assert.notEqual(out.dropItemId,'it_wood','未知类型静默回退为木材');
});

test('#203 新资源拒绝显式语义篡改，同时兼容旧 v1 最小记录并补齐字段',function(){
  const source=Planet.newObservedPlanet(20301);
  const mutations=[
    ['yieldItemId',function(r){r.yieldItemId=r.yieldItemId==='it_wood'?'it_stone':'it_wood';},'invalid-resource-yield'],
    ['amount',function(r){r.amount+=1;},'invalid-resource-amount'],
    ['hp',function(r){r.hp+=1;},'invalid-resource-hp'],
    ['depleted',function(r){r.depleted=true;},'invalid-resource-depleted'],
    ['seed',function(r){r.seed=(r.seed+1)>>>0;},'invalid-resource-seed'],
    ['regenTicks',function(r){r.regenTicks+=1;},'invalid-resource-regen'],
  ];
  mutations.forEach(function(entry){
    const broken=clone(source);entry[1](broken.observation.resources[0]);
    const checked=Planet.validate(broken);
    assert(!checked.ok&&checked.errors.some(function(error){return error.includes(entry[2]);}),
      entry[0]+' 篡改未被拒绝: '+JSON.stringify(checked));
  });
  const duplicate=clone(source);
  duplicate.observation.resources[1].uid=duplicate.observation.resources[0].uid;
  const duplicateCheck=Planet.validate(duplicate);
  assert(!duplicateCheck.ok&&duplicateCheck.errors.some(function(error){return error.includes('duplicate-resource-uid');}),
    '重复 uid 未在 PlanetSpec 边界拒绝');
  const duplicateEntities=TM.resources(TM.planet(duplicate),{});
  assert.equal(new Set(duplicateEntities.map(function(resource){return resource.id;})).size,duplicateEntities.length,
    '绕过 Planet.validate 后实体化产生了重复实体身份');

  const mutated=Planet.newObservedPlanet(20302);
  assert(Planet.validate(mutated).ok,'同对象突变夹具首次校验失败');
  const first=mutated.observation.resources[0],second=mutated.observation.resources[1];
  mutated.observation.resources[1]=TM.resourceRecord(mutated.seed,first.kind,first.gx,first.gy,null,second.uid);
  const mutatedCheck=Planet.validate(mutated);
  assert(!mutatedCheck.ok&&mutatedCheck.errors.some(function(error){return error.includes('duplicate-resource-cell');}),
    '成功缓存后的同对象坐标突变绕过了 PlanetSpec 校验');
  const mutatedEntities=TM.resources(TM.planet(mutated),{});
  assert(mutatedEntities.errors.some(function(error){return error.error==='duplicate-resource-cell';}),
    '实体化没有显式报告缓存对象的同格冲突');

  const legacy=clone(source);
  legacy.observation.resources=legacy.observation.resources.map(function(resource){
    return {gx:resource.gx,gy:resource.gy,kind:resource.kind,
      yieldItemId:resource.yieldItemId,amount:resource.amount};
  });
  assert(Planet.validate(legacy).ok,'旧 v1 最小资源记录不应因新增派生字段被拒绝');
  const materialized=TM.resources(TM.planet(legacy),{});
  assert.equal(materialized.errors.length,0,'旧 v1 记录补齐时发生错误');
  assert.equal(materialized.length,legacy.observation.resources.length,'旧 v1 资源补齐后数量变化');
  materialized.forEach(function(resource){
    assert(resource.uid&&resource.visualKind&&resource.hp>0&&typeof resource.depleted==='boolean'&&
      typeof resource.renewable==='boolean'&&Number.isInteger(resource.regenTicks),'旧 v1 记录没有补齐运行语义');
  });
});

test('#203 Observation 资源身份与覆盖物隔离，存档恢复引用不会串实体',function(){
  const spec=Planet.newObservedPlanet(20303);spec.tier=2;
  const poisoned=clone(spec),poisonedSource=poisoned.observation.resources[0];
  poisonedSource.uid='rw_0';
  const rejected=Planet.validate(poisoned);
  assert(!rejected.ok&&rejected.errors.some(function(error){return error.includes('invalid-resource-uid');}),
    'Observation 资源冒充遗迹实体 id 未被 PlanetSpec 边界拒绝');
  const rejectedEntities=TM.resources(TM.planet(poisoned),{});
  assert(!rejectedEntities.some(function(entity){return entity.id==='rw_0';})&&
    rejectedEntities.errors.some(function(error){return error.error==='invalid-resource-uid';}),
    '绕过 Planet.validate 后仍实体化了保留命名空间 uid');
  const explicitNull=clone(spec);explicitNull.observation.resources[0].uid=null;
  const nullRoundTrip=JSON.parse(JSON.stringify(explicitNull));
  const nullRejected=Planet.validate(nullRoundTrip),nullEntities=TM.resources(TM.planet(nullRoundTrip),{});
  assert(!nullRejected.ok&&nullRejected.errors.some(function(error){return error.includes('invalid-resource-uid');}),
    'JSON 中显式 uid:null 被误当成旧记录缺省字段');
  assert(nullEntities.errors.some(function(error){return error.error==='invalid-resource-uid';}),
    '运行时实体化把显式 uid:null 静默补成了合法身份');

  const resources=TM.resources(TM.planet(spec),{}),overlays=Planet.expeditionOverlays(spec,'resources');
  assert.equal(resources.errors.length,0,'正常 Observation 资源实体化失败');
  assert(overlays.ruins&&overlays.failures.length===0,'跨实体身份夹具缺少完整覆盖物');
  const ids=resources.map(function(resource){return resource.id;})
    .concat(overlays.deposits.map(function(deposit){return deposit.id;}))
    .concat(overlays.rivalBase?[overlays.rivalBase.id]:[])
    .concat(overlays.ruins.walls.map(function(_,i){return 'rw_'+i;}),['rg_0','rt_0','rv_0']);
  assert.equal(new Set(ids).size,ids.length,'自然资源与覆盖物实体身份发生冲突');

  const flora=resources[0],wall={id:'rw_0',type:'building',bid:'ancient_wall',x:0,y:0};
  const pawn={id:'rs_resource_ref',type:'resident',x:flora.x,y:flora.y,
    userOrder:{type:'gather',flora:flora}};
  const restored=Runtime.restore(clone(Runtime.serializable({entities:[pawn,flora,wall]})));
  const restoredPawn=restored.entities.find(function(entity){return entity.id==='rs_resource_ref';});
  const restoredFlora=restored.entities.find(function(entity){return entity.id===flora.id;});
  assert(restoredPawn.userOrder.flora===restoredFlora&&restoredFlora.type==='flora'&&restoredFlora.bid!=='ancient_wall',
    '恢复后的采集引用被遗迹实体覆盖');
});

test('#203 四类远征群系的保底植物都能推进植物取样目标',function(){
  const E=APH.ExpeditionState,objective=E.objective('samples');
  Object.keys(CFG.observe.expeditionResourceMinimums).forEach(function(biomeId){
    let spec=null;
    for(let seed=0;seed<512&&!spec;seed++){
      const candidate=Planet.newObservedPlanet(seed);
      if(candidate.biome.id===biomeId)spec=candidate;
    }
    assert(spec,'无法生成群系 '+biomeId);
    const kind=CFG.observe.expeditionResourceMinimums[biomeId][0].kind;
    const sample=spec.observation.resources.find(function(resource){return resource.kind===kind;});
    assert(sample&&objective.itemIds.includes(sample.yieldItemId),biomeId+' 的保底植物不属于取样目标');
    const run={id:'sample_'+biomeId,objective:clone(objective),cargo:{}};
    const colony={expedition:{active:run}};
    const advanced=E.addCargo(colony,run.id,sample.yieldItemId,sample.amount);
    assert(advanced.ok&&advanced.objective.progress===sample.amount,biomeId+' 标本未推进任务进度');
  });
});

test('#203 采集耗尽、WorldRuntime 往返与再生保留完整资源身份',function(){
  let spec,scene,all,renewable,finite;
  for(let seed=20302;seed<20400&&(!renewable||!finite);seed++){
    spec=Planet.newObservedPlanet(seed);scene=TM.planet(spec);all=TM.resources(scene,{});
    renewable=all.find(function(resource){return resource.renewable;});
    finite=all.find(function(resource){return !resource.renewable;});
  }
  assert(renewable&&finite,'fixture 缺少可再生与有限资源');
  const previous=APH.state;
  try{
    const state={scene:'expedition',seed:spec.seed,worldDescriptor:scene,entities:[renewable,finite],floraRespawn:[],
      expeditionRegenT:7,overlayFailures:[],colony:{},clock:10};
    APH.state=state;
    const harvested=Colony.workOnFlora(renewable,{skills:{sk_farm:8,sk_craft:8},mood:80,food:80},999);
    assert(harvested.done&&harvested.dropItemId===renewable.yieldItemId&&harvested.dropCount===renewable.amount,'可再生资源掉落错误');
    assert(renewable.dead&&renewable.depleted&&renewable.hp===0,'可再生资源没有进入明确耗尽态');
    assert.equal(state.floraRespawn.length,1,'可再生资源没有入队');
    const queued=state.floraRespawn[0];
    ['sourceId','uid','kind','visualKind','yieldItemId','amount','hp','seed','renewable','regenTicks'].forEach(function(key){
      assert.notEqual(queued[key],undefined,'再生队列丢失 '+key);
    });
    const snapshot=Runtime.serializable(state),restored=Runtime.restore(clone(snapshot),{colony:{}});
    assert.equal(restored.expeditionRegenT,7,'远征再生时钟未持久化');
    assert.equal(restored.floraRespawn[0].yieldItemId,renewable.yieldItemId,'快照丢失产出身份');
    assert.equal(restored.floraRespawn[0].seed,renewable.seed,'快照丢失资源 seed');
    restored.floraRespawn[0].ticksLeft=1;
    const regrown=Colony.floraRespawnTick(restored);
    assert.equal(regrown.length,1,'到期资源没有再生');
    assert.equal(regrown[0].id,renewable.id,'再生没有回到同一来源身份');
    assert.equal(regrown[0].yieldItemId,renewable.yieldItemId,'再生偷换产出');
    assert.equal(regrown[0].seed,renewable.seed,'再生偷换 seed');
    assert.equal(regrown[0].regenTicks,renewable.regenTicks,'再生偷换周期');
    assert.equal(regrown[0].depleted,false,'再生资源没有恢复为未耗尽态');
    APH.state=state;
    const mined=Colony.workOnFlora(finite,{skills:{sk_craft:8},mood:80,food:80},999);
    assert(mined.done&&state.floraRespawn.length===1,'有限矿物被加入再生队列');
    assert(finite.dead&&finite.depleted&&finite.hp===0,'有限资源没有保存明确耗尽态');
    const finiteRestored=Runtime.restore(clone(Runtime.serializable(state)),{colony:{}}).entities.find(function(entity){return entity.id===finite.id;});
    assert(finiteRestored&&finiteRestored.dead&&finiteRestored.depleted&&finiteRestored.hp===0,'有限资源耗尽态未通过 runtime 往返');
  }finally{APH.state=previous;}
});

test('#203 遗迹、任务矿点与敌对基地按完整占地确定落在合法空地',function(){
  [20303,20304,20305].forEach(function(seed){
    const spec=Planet.newObservedPlanet(seed);spec.tier=2;
    const first=Planet.expeditionOverlays(spec,'resources'),again=Planet.expeditionOverlays(spec,'resources');
    function layout(out){return {ruin:out.ruins&&out.ruins.placement,deposits:out.deposits.map(function(d){return d.placement;}),base:out.rivalBase&&out.rivalBase.placement,
      guards:out.guards.map(function(g){return g.placement;}),failures:out.failures};}
    assert.deepEqual(layout(first),layout(again),'seed '+seed+' 覆盖物位置不确定');
    assert.deepEqual(first.failures,[],'seed '+seed+' 有合法地图却放置失败');
    assert(first.ruins&&first.ruins.placement&&first.rivalBase&&first.deposits.length===CFG.expedition.resourceDeposits.length&&first.guards.length===3,
      'seed '+seed+' 覆盖物不完整');
    const scene=TM.planet(spec),claimed=new Set(),natural=new Set(spec.observation.resources.map(function(r){return r.gx+','+r.gy;}));
    spec.beacons.forEach(function(b){natural.add(Math.floor(b.x/CFG.GRID)+','+Math.floor(b.y/CFG.GRID));});
    const placements=[first.ruins.placement,first.rivalBase.placement].concat(first.deposits.map(function(d){return d.placement;}));
    placements.forEach(function(placement){
      placement.cells.forEach(function(cell){
        const key=cell.gx+','+cell.gy;
        assert(TM.cellAt(scene,(cell.gx+.5)*CFG.GRID,(cell.gy+.5)*CFG.GRID).walkable,'覆盖物落入水格 '+key);
        assert(!natural.has(key),'覆盖物压住自然资源或信标 '+key);
        assert(!claimed.has(key),'覆盖物互相重叠 '+key);claimed.add(key);
      });
    });
    first.guards.forEach(function(guard){
      assert(guard.placement&&guard.placement.cells.length===1,'守军缺少合法占地');
      const cell=guard.placement.cells[0],key=cell.gx+','+cell.gy;
      assert(TM.cellAt(scene,guard.x,guard.y).walkable,'守军落入水格 '+key);
      assert(!natural.has(key),'守军压住自然资源或信标 '+key);
      assert(!claimed.has(key),'守军压住覆盖物或另一守军 '+key);claimed.add(key);
    });
    first.deposits.forEach(function(deposit){
      assertResourceRecord({uid:deposit.uid,gx:Math.floor(deposit.x/CFG.GRID),gy:Math.floor(deposit.y/CFG.GRID),kind:deposit.kind,
        visualKind:deposit.visualKind,yieldItemId:deposit.yieldItemId,amount:deposit.amount,hp:deposit.hp,depleted:deposit.depleted,
        seed:deposit.seed,renewable:deposit.renewable,regenTicks:deposit.regenTicks,mineral:deposit.mineral},spec.seed,deposit.id,{allowTunedAmountHp:true});
    });
  });
});

test('#203 覆盖物有限扫描在零水地图成功，密占地图明确失败',function(){
  const width=12,height=12,ground=new Array(width*height).fill('spore_moss');
  const scene={v:1,kind:'expedition',generation:1,seed:20306,grid:CFG.GRID,
    observation:{v:1,widthCells:width,heightCells:height,biomeId:'biome_spore_forest',degraded:false,ground:ground,resources:[]}};
  const fallback=TM.findOverlayPlacement(scene,{seed:20306,footprint:[2,2],safeRadius:0,minDistance:0,maxDistance:99,tries:0,origin:{gx:6,gy:6}});
  assert(fallback.ok&&fallback.fallback,'零水地图的确定性有限扫描没有成功');
  const occupied={};for(let gy=0;gy<height;gy++)for(let gx=0;gx<width;gx++)occupied[gx+','+gy]=true;
  const failed=TM.findOverlayPlacement(scene,{seed:20306,footprint:[1,1],safeRadius:0,minDistance:0,maxDistance:99,tries:3,origin:{gx:6,gy:6},occupied:occupied});
  assert(!failed.ok&&failed.why==='no-valid-footprint'&&Number.isInteger(failed.attempts),'密占地图没有显式有限失败');
});
