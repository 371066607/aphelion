const assert = require('assert');
const crypto = require('crypto');
const S=APH.Save;
test('colony v1 migration preserves coordinates, stock, paid blueprints and legacy beds',()=>{
  const old={v:1,buildings:[{id:'bl_house',x:1104,y:1056,lv:2},{id:'bl_transmitter',x:1600,y:1500,lv:1}],
    buildQueue:[{bid:'bl_lab',x:1296,y:1200,total:25,progress:12}],
    ground:[{itemId:'it_wood',n:17,x:1010,y:990}]};
  localStorage.setItem(APH.CFG.save.KEY_COLONY,JSON.stringify(old));
  const c=S.loadColony();
  assert.strictEqual(c.v,3); assert.strictEqual(c.scene.width,2200);
  assert.strictEqual(c.scene.generation,0);
  assert.strictEqual(c.scene.observation,undefined);
  assert.deepStrictEqual(APH.TerrainModel.landmarks(c.scene),{
    hab:{x:1100,y:1100,r:92},lake:{x:1660,y:1560,r:148}
  });
  assert.deepStrictEqual(APH.TerrainModel.resources(c.scene,{}),[]);
  assert.deepStrictEqual(c.ground,old.ground);
  assert.strictEqual(c.buildings[0].x,1104); assert.strictEqual(c.buildings[0].lv,2);
  assert.deepStrictEqual(c.buildings[0].legacyFootprint,[2,2]);
  assert.deepStrictEqual(c.buildings[1].legacyFootprint,[3,3]);
  assert.strictEqual(c.buildQueue[0].materialsPaid,true); assert.strictEqual(c.buildQueue[0].progress,12);
  const once=JSON.stringify(c); S.saveColony(c); assert.strictEqual(JSON.stringify(S.loadColony()),once);
});
test('colony migration stable IDs do not collide and explicit scene is preserved',()=>{
  const scene={v:1,kind:'home',width:6144,height:6144,grid:48,generation:1,seed:19};
  const c=S.migrate({v:1,scene,buildings:[{id:'bl_house',uid:'b_legacy_1',x:41,y:83},{id:'bl_wall',x:48,y:48}]});
  assert.strictEqual(c.v,3); assert.strictEqual(c.scene,scene); assert.ok(c.scene.observation);
  assert.notStrictEqual(c.buildings[0].uid,c.buildings[1].uid);
  assert.strictEqual(c.buildings[0].x,41); assert.strictEqual(c.buildings[0].y,83);
});
test('colony future envelope rejected without overwriting and PlanetSpec remains v1',()=>{
  const raw=JSON.stringify({v:4,buildings:[]}); localStorage.setItem(APH.CFG.save.KEY_COLONY,raw);
  assert.throws(()=>S.loadColony(),/高于/); assert.strictEqual(localStorage.getItem(APH.CFG.save.KEY_COLONY),raw);
  S.savePlanet('compat',{v:1,id:'compat',laws:[]}); assert.strictEqual(S.loadPlanet('compat').v,1);
});

test('#199 future additive Observation is preserved instead of being downgraded',()=>{
  const observation={v:2,widthCells:128,heightCells:128,biomeId:'biome_landing',degraded:false,
    ground:new Array(128*128).fill('ridge'),resources:[],futureMarker:{format:'keep-me'}};
  const raw=JSON.stringify({v:3,rulesVersion:1,scene:{v:1,kind:'home',width:6144,height:6144,grid:48,
    generation:1,seed:51,observation},buildings:[],buildQueue:[],ground:[],depleted:{},
    logistics:{v:1,nextTask:1,nextReservation:1,tasks:[],reservations:[]}});
  localStorage.setItem(APH.CFG.save.KEY_COLONY,raw);
  const loaded=S.loadColony();
  assert.deepStrictEqual(loaded.scene.observation,observation);
  assert.strictEqual(localStorage.getItem(APH.CFG.save.KEY_COLONY),raw);
});

test('#199 malformed future Observation is rejected without overwriting',()=>{
  const ground=new Array(128*128).fill('ridge');
  const complete={v:2,widthCells:128,heightCells:128,biomeId:'biome_landing',degraded:false,ground,resources:[]};
  const malformed=[
    {label:'versioned grid without row-major ground',value:{v:2,widthCells:128,heightCells:128,grid:[['ridge']]}},
    {label:'missing biomeId',value:Object.assign({},complete,{biomeId:undefined})},
    {label:'missing degraded',value:Object.assign({},complete,{degraded:undefined})},
    {label:'missing resources',value:Object.assign({},complete,{resources:undefined})},
    {label:'non-array resources',value:Object.assign({},complete,{resources:{}})},
    {label:'incomplete resource record',value:Object.assign({},complete,{resources:[{gx:0,gy:0,kind:'tree',yieldItemId:'it_wood'}]})}
  ];
  malformed.forEach(function(fixture){
    const raw=JSON.stringify({v:3,rulesVersion:1,scene:{v:1,kind:'home',width:6144,height:6144,grid:48,
      generation:1,seed:51,observation:fixture.value},buildings:[],buildQueue:[],ground:[]});
    localStorage.setItem(APH.CFG.save.KEY_COLONY,raw);
    assert.throws(()=>S.loadColony(),function(error){return error&&error.aphObservationVersion===2;},fixture.label);
    assert.strictEqual(localStorage.getItem(APH.CFG.save.KEY_COLONY),raw,fixture.label+' was overwritten');
  });
});

test('#199 new home is observed and atomically saved before the first running state',()=>{
  const oldState=APH.state;
  try{
    APH.state={meta:{v:1,res:{wood:0,stone:0,food:0},residents:[]}};
    const first=S.loadColony();
    const o=first.scene&&first.scene.observation;
    assert.ok(o&&o.v===1&&o.ground.length===o.widthCells*o.heightCells);
    assert.strictEqual(first.scene.generation,1);
    const resources=APH.TerrainModel.resources(first.scene,{});
    assert.ok(resources.length>=1800&&resources.length<=2300,'new home resources escaped the existing ~2000-object budget: '+resources.length);
    assert.strictEqual(resources.filter(r=>r.starter&&r.kind==='tree').length,24);
    assert.strictEqual(resources.filter(r=>r.starter&&r.kind==='rock_stone').length,18);
    assert.strictEqual(resources.filter(r=>r.kind==='bush_berry'&&r.days===2).length,12);
    assert.strictEqual(new Set(resources.map(r=>r.x+','+r.y)).size,resources.length);
    assert.ok(resources.every(r=>APH.CFG.items[r.yieldItemId]),'observation contains a resource without a real yield item');
    const coreRule=APH.CFG.observe.resourceSemantics.rock_wreckage.variants.homeCore;
    const core=resources.find(r=>r.coreWreckage);
    assert.ok(coreRule&&core,'home core wreckage semantics are not configured');
    assert.strictEqual(core.yieldItemId,coreRule.yieldItemId);
    assert.strictEqual(core.amount,coreRule.amount);
    resources.forEach(function(resource){
      const rule=APH.CFG.observe.resourceSemantics[resource.kind];
      const expected=resource.coreWreckage?coreRule:rule;
      assert.strictEqual(resource.amount,expected.amount,'amount escaped CFG for '+resource.uid);
      if(expected.yieldItemIds) assert.ok(expected.yieldItemIds.includes(resource.yieldItemId),'yield escaped CFG list for '+resource.uid);
      else assert.strictEqual(resource.yieldItemId,expected.yieldItemId,'yield escaped CFG for '+resource.uid);
    });
    const raw=JSON.parse(localStorage.getItem(APH.CFG.save.KEY_COLONY));
    assert.deepStrictEqual(raw.scene.observation,o);
    assert.deepStrictEqual(raw.metaSnapshot,APH.state.meta);
    const signature=JSON.stringify({ground:o.ground,resources:o.resources});
    const second=S.loadColony();
    assert.strictEqual(JSON.stringify({ground:second.scene.observation.ground,resources:second.scene.observation.resources}),signature);
  }finally{ APH.state=oldState; }
});

test('#199 generation 1 migration is anchored to the pre-repair deterministic map',()=>{
  const expected={
    1:{cells:'06836c2b9d9943ab4c684d8c6ac9de2db353b9d4f1461f6e3f79aa0bb2218f12',resources:'4f6aa7c7a382bdc0a96797f8eb9444591546b04015b7a3e4b94f15a29e2ea536'},
    2:{cells:'06836c2b9d9943ab4c684d8c6ac9de2db353b9d4f1461f6e3f79aa0bb2218f12',resources:'32ac9466b0315a4d1c8bdce624b4a28f1c4a47e87e4cc16d17aff510eded5b07'}
  };
  function digest(value){return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');}
  [1,2].forEach(function(resourceVersion){
    const scene=APH.TerrainModel.home(19);scene.resourceVersion=resourceVersion;
    const cells=[];
    for(let gy=0;gy<128;gy++) for(let gx=0;gx<128;gx++){
      const c=APH.TerrainModel.cellAt(scene,(gx+.5)*48,(gy+.5)*48);
      cells.push([c.region,c.walkable,c.buildable,c.fertility,c.moveCost]);
    }
    const resources=APH.TerrainModel.resources(scene,{}).map(r=>[
      r.uid,r.kind,r.x,r.y,r.yieldItemId,r.amount,r.starter||false,r.coreWreckage||false,
      r.seedItem||null,r.repairable||false
    ]);
    assert.strictEqual(digest(cells),expected[resourceVersion].cells,'legacy ground golden drifted for resourceVersion '+resourceVersion);
    assert.strictEqual(digest(resources),expected[resourceVersion].resources,'legacy resources golden drifted for resourceVersion '+resourceVersion);
  });
});

test('#199 generation 1 is snapshotted once without changing terrain, resources or buildings',()=>{
  const scene=APH.TerrainModel.home(19),buildings=[{id:'bl_wall',uid:'keep_wall',x:48*30,y:48*20,geometryVersion:1,rotation:0}];
  const beforeCells=[];
  for(let gy=0;gy<128;gy++) for(let gx=0;gx<128;gx++){
    const c=APH.TerrainModel.cellAt(scene,(gx+.5)*48,(gy+.5)*48);
    beforeCells.push([c.region,c.walkable,c.buildable,c.fertility,c.moveCost]);
  }
  const beforeResources=APH.TerrainModel.resources(scene,{}).map(r=>[r.uid,r.kind,r.x,r.y,r.yieldItemId,r.amount]);
  localStorage.setItem(APH.CFG.save.KEY_COLONY,JSON.stringify({v:2,rulesVersion:1,scene,buildings,buildQueue:[],ground:[],depleted:{}}));
  const snapshotFn=APH.TerrainModel.snapshotObservation;
  let bootSnapshots=0;
  APH.TerrainModel.snapshotObservation=function(value){bootSnapshots++;return snapshotFn(value);};
  let migrated;
  try{S.loadMeta();migrated=S.loadColony();}
  finally{APH.TerrainModel.snapshotObservation=snapshotFn;}
  assert.strictEqual(bootSnapshots,1,'normal boot snapshotted the same generation 1 home more than once');
  assert.strictEqual(migrated.v,3);assert.ok(migrated.scene.observation);
  assert.deepStrictEqual(
    migrated.buildings.map(b=>[b.id,b.uid,b.x,b.y,b.geometryVersion,b.rotation]),
    buildings.map(b=>[b.id,b.uid,b.x,b.y,b.geometryVersion,b.rotation])
  );
  const afterCells=[];
  for(let gy=0;gy<128;gy++) for(let gx=0;gx<128;gx++){
    const c=APH.TerrainModel.cellAt(migrated.scene,(gx+.5)*48,(gy+.5)*48);
    afterCells.push([c.region,c.walkable,c.buildable,c.fertility,c.moveCost]);
  }
  const afterResources=APH.TerrainModel.resources(migrated.scene,{}).map(r=>[r.uid,r.kind,r.x,r.y,r.yieldItemId,r.amount]);
  assert.deepStrictEqual(afterCells,beforeCells);
  assert.deepStrictEqual(afterResources,beforeResources);
  assert.ok(JSON.parse(localStorage.getItem(APH.CFG.save.KEY_COLONY)).scene.observation,'migration was not persisted');
  const snapshot=APH.TerrainModel.snapshotObservation,signature=JSON.stringify(migrated.scene.observation);
  APH.TerrainModel.snapshotObservation=()=>{throw new Error('snapshot reran');};
  try{assert.strictEqual(JSON.stringify(S.loadColony().scene.observation),signature);}
  finally{APH.TerrainModel.snapshotObservation=snapshot;}
});

test('#199 failed persistent write keeps one complete in-memory migration and can recover',()=>{
  const scene=APH.TerrainModel.home(27),oldRaw=JSON.stringify({v:2,rulesVersion:1,scene,buildings:[],buildQueue:[],ground:[]});
  localStorage.setItem(APH.CFG.save.KEY_COLONY,oldRaw);
  const realSet=localStorage.setItem,snapshot=APH.TerrainModel.snapshotObservation;
  let calls=0;
  APH.TerrainModel.snapshotObservation=function(value){calls++;return snapshot(value);};
  localStorage.setItem=()=>{throw new Error('quota');};
  try{
    const first=S.loadColony(),signature=JSON.stringify(first.scene.observation);
    assert.ok(first.scene.observation&&first.v===3);
    assert.strictEqual(localStorage.getItem(APH.CFG.save.KEY_COLONY),oldRaw);
    const second=S.loadColony();
    assert.strictEqual(JSON.stringify(second.scene.observation),signature);
    assert.strictEqual(calls,1,'failed write caused the migration to rerun');
    localStorage.setItem=realSet;
    assert.strictEqual(S.saveColony(second),true);
    assert.ok(JSON.parse(localStorage.getItem(APH.CFG.save.KEY_COLONY)).scene.observation);
  }finally{
    localStorage.setItem=realSet;APH.TerrainModel.snapshotObservation=snapshot;S.wipeAll();
  }
});
