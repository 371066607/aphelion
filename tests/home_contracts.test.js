const assert=require('assert');

test('home snapshot: meta-only resource spending persists with in-flight cargo atomically',()=>{
  const prior=APH.state;
  try{
    const meta=APH.Save.loadMeta();meta.res.food=10;
    const colony={v:2,rulesVersion:1,buildings:[],buildQueue:[],scene:APH.TerrainModel.home(44),logistics:{tasks:[],reservations:[]}};
    APH.state={meta,colony,scene:'home',_worldReady:true,entities:[],clock:20};
    APH.Colony.persist();
    const oldMeta=localStorage.getItem(APH.CFG.save.KEY_META);
    meta.res.food--;
    APH.Save.saveMeta(meta);
    assert.equal(APH.Save.loadMeta().res.food,9);
    assert.equal(APH.Save.loadColony().stock.food,9);
    // 模拟兼容 meta key 未能更新；原子家园快照仍是权威。
    localStorage.setItem(APH.CFG.save.KEY_META,oldMeta||'{}');
    assert.equal(APH.Save.loadMeta().res.food,9);
    const task=APH.Logistics.ensureTask(colony,{kind:'construction',targetId:'q',need:{food:2}});
    const rr=APH.Logistics.reserveForTask(colony,meta.res,[],task,'worker',{stockSpot:{x:0,y:0}}).reservation;
    APH.Logistics.pickup(colony,meta.res,[],rr.id,'worker',{x:0,y:0});
    APH.Save.saveMeta(meta);
    const loaded=APH.Save.loadColony();
    assert.equal(loaded.stock.food,7);
    assert.equal(loaded.logistics.reservations[0].cargo.amount,2);
    assert.equal(APH.Save.loadMeta().res.food,7);
  }finally{APH.state=prior;}
});

test('construction cost includes mineral and large beacon works from its legal interaction cell',()=>{
  const def=APH.Colony.get('bl_transmitter');
  const need=APH.Construction.materialNeed(def,1);
  assert.equal(need.mineral,def.costMineral+(def.costRes.mineral||0));
  assert(need.mineral>=200);
  const q=Object.assign(APH.Construction.record('bl_transmitter',480,480,0),{total:10,progress:0,materialsPaid:false,need});
  const c=APH.BuildGrid.interactionCells(q,APH.Colony.list())[0],pos={x:(c.gx+.5)*48,y:(c.gy+.5)*48};
  assert(Math.hypot(pos.x-q.x,pos.y-q.y)>=96);
  assert.equal(APH.Colony.queueTick([q],20,[pos],0,()=>false).done.length,0);
  assert.equal(APH.Colony.queueTick([q],20,[pos],0,()=>true).done.length,1);
  assert.equal(APH.Colony.queueTick([q],20,[{x:q.x,y:q.y}],0,()=>true).done.length,0);
});

test('modern bed capacity has no imaginary landing-cabin beds',()=>{
  assert.equal(APH.Colony.housingCapacity([],{rulesVersion:1}),0);
  assert.equal(APH.Colony.housingCapacity([{id:'bl_bed'},{id:'bl_bed',dead:true}],{rulesVersion:1}),1);
  assert.equal(APH.Colony.housingCapacity([],{}),2);
});

test('new-map tree regen clamps to 128-grid scene, not CFG.WORLD',()=>{
  const scene=APH.TerrainModel.home(4);
  const s={colony:{scene},seed:4,clock:100,floraRespawn:[{kind:'tree',x:6000,y:6000,ticksLeft:1}]};
  const spawned=APH.Colony.floraRespawnTick(s);
  assert.equal(spawned.length,1);
  assert(spawned[0].x>=100 && spawned[0].x<=scene.width-100, 'x='+spawned[0].x);
  assert(spawned[0].y>=100 && spawned[0].y<=scene.height-100, 'y='+spawned[0].y);
  assert(spawned[0].x>APH.CFG.WORLD, '新图再生被夹进旧 2200 边界: '+spawned[0].x);
});

test('new-map exhausted mineral cannot return from a stale respawn queue',()=>{
  const s={colony:{scene:APH.TerrainModel.home(4)},floraRespawn:[{kind:'rock_iron',x:700,y:700,ticksLeft:1}],clock:100};
  assert.equal(APH.Colony.floraRespawnTick(s).length,0);
  assert.equal(s.floraRespawn.length,0);
});

test('recovery suppresses negative event cards and first-day protection excludes raids',()=>{
  const raid=APH.Events.DECK.find(x=>x.id==='ev_raid');
  assert.equal(raid.can({rivalReady:true,raidProtected:true}),false);
  assert.equal(raid.can({rivalReady:true,recovering:true}),false);
  for(let i=0;i<100;i++){
    const p=APH.Events.pickEvent({recovering:true,threat:8,moodAvg:80,sinceNeg:1000,cooldowns:{},residentCount:20,hasSpareBed:true,hasFarm:true,hasPasture:true,hasTurret:true,visitorSlot:true,rivalReady:true},()=>i/100);
    assert(!p||!p.neg);
  }
});

test('construction integration persists excess delivery for ground placement before completion save',()=>{
  const q=Object.assign(APH.Construction.record('bl_bed',480,480,0),{uid:'surplus_build',total:1,progress:0,materialsPaid:false,need:{mineral:20}});
  const s={colony:{v:2,buildings:[],buildQueue:[q],scene:APH.TerrainModel.home(4)},meta:{residents:[{id:'builder',mainSkill:'sk_build',skills:{sk_build:3}}],workPrio:{}},entities:[],parts:[]};
  const pos=APH.Construction.spot(s,q,{x:600,y:700});
  s.entities.push({id:'builder',rid:'builder',type:APH.CFG.entType.RESIDENT,x:pos.x,y:pos.y});
  const task=APH.Logistics.ensureTask(s.colony,{kind:'construction',targetId:q.uid,need:q.need,x:q.x,y:q.y,deliverySpot:pos});q.taskId=task.id;
  task.deliveredLots.push({key:'mineral',amount:21,itemId:'it_alloy',itemCount:7});
  APH.Colony.tickConstruction(s,5);
  assert.equal(s.colony.buildQueue.length,0);
  assert.equal(s.colony.pendingGround.length,1);
  assert.equal(s.colony.pendingGround[0].itemId,'it_mineral');
  assert.equal(s.colony.pendingGround[0].n,1);
  APH.Save.saveColony(s.colony);
  assert.equal(APH.Save.loadColony().pendingGround[0].n,1);
});

test('rooting requires three continuous days of valid cold-stored food and harvested alien crops',()=>{
  const b=[];
  for(let x=0;x<7;x++)for(let y=0;y<7;y++)if(x===0||y===0||x===6||y===6)b.push(APH.Construction.record('bl_wall',x*48,y*48,0));
  b.push({id:'bl_bed',uid:'bed',x:100,y:100},{id:'bl_farm',x:100,y:150},
    {id:'bl_cooler',x:120,y:120,powered:true,grid:true},
    {id:'bl_battery',x:140,y:140},{id:'bl_storage_shelf',uid:'cold_shelf',filter:'food',x:150,y:150},
    {id:'bl_crop_plot',crop:'crop_dew_fruit',x:170,y:170},
    {id:'bl_transmitter',x:190,y:190,powered:true,grid:true});
  const s={scene:'home',mode:'running',clock:0,colony:{rulesVersion:1,buildings:b,scene:APH.TerrainModel.home(5)},entities:[
    {id:'cold_food',type:APH.CFG.entType.DROPPED,itemId:'it_food',n:100,containerId:'cold_shelf',storageX:150,storageY:150,x:150,y:150,decayHp:10}
  ],power:{charge:{'140,140':10}},meta:{res:{food:100000},residents:[{id:'r',bedId:'bed:0'}],analyzedFlora:{crop_dew_fruit:true},alienHarvests:{crop_dew_fruit:6}}};
  const rooms=APH.Nav.roomsOf(b,s.colony.scene);assert(rooms.length);rooms[0].temp=-2;
  assert(APH.HomeProgress.checks(s).every(c=>c.ok));
  /* Fixed daily simulation steps: qualification must be continuous, not a
     one-shot timestamp or a wall-clock wait. */
  APH.HomeProgress.tick(s,APH.CFG.DAY_LEN);
  APH.HomeProgress.tick(s,APH.CFG.DAY_LEN);
  assert.equal(s.meta.rooting.achieved,false);
  s.entities[0].decayHp=0;APH.HomeProgress.tick(s,30);assert.equal(s.meta.rooting.seconds,0);
  s.entities[0].decayHp=10;APH.HomeProgress.tick(s,APH.CFG.DAY_LEN*3-1);
  assert.equal(s.meta.rooting.achieved,false);
  APH.HomeProgress.tick(s,1);assert.equal(s.meta.rooting.achieved,true);assert.equal(s.mode,'running');
});
