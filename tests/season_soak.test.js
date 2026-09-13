#!/usr/bin/env node
'use strict';
/* Independent long-run contract: no source patching, no clock jump and no
   refilling state after setup.  Real frame-sized steps cover one CFG season. */
const fs=require('fs'),path=require('path');
function el(){const c={};return {style:{},classList:{add(k){c[k]=1;},remove(k){delete c[k];},toggle(){},contains(k){return!!c[k];}},textContent:'',innerHTML:'',appendChild(){},addEventListener(){},setAttribute(){},getAttribute(){return null;},querySelector(){return el();},querySelectorAll(){return [];},play(){return{catch(){}};},pause(){},getContext(){const g={addColorStop(){}};return new Proxy({}, {get(t,k){return k==='createRadialGradient'||k==='createLinearGradient'?()=>g:()=>{};}});}};}
global.window=global;global.localStorage=(()=>{const m={};return{getItem:k=>m[k]||null,setItem:(k,v)=>m[k]=String(v),removeItem:k=>delete m[k],clear(){Object.keys(m).forEach(k=>delete m[k]);}}})();
global.document={getElementById(){return el();},createElement(){return el();},body:el(),addEventListener(){}};
global.addEventListener=()=>{};global.innerWidth=800;global.innerHeight=600;global.devicePixelRatio=1;global.requestAnimationFrame=()=>0;global.location={search:'',reload(){}};global.performance={now:()=>0};global.Image=class{set src(v){this._src=v;if(this.onload)this.onload();}};
global.APH={SPRITE_DATA:{}};
const SRC=path.join(__dirname,'..','src');
for(const f of ['config.js','utils.js','atlas.js','observe.js','entity_index.js','world_runtime.js','terrain_model.js','build_grid.js','scene.js','camera.js','building_art_data.js','building_art.js','input.js','humanoid.js','planet.js','save.js','opening.js','opening_data.js','llm.js','colony.js','construction.js','recovery.js','home_progress.js','logistics.js','production_jobs.js','storage.js','rivals.js','events.js','nav.js','weather.js','residents.js','ecology.js','expedition_state.js','alerts.js','combat.js','world.js','entities.js','visitors.js','colonytick.js','draw.js','sfx.js','sprites.js','ui.js','expedition_ui.js','map_ui.js','hints.js','building_proto_model.js','building_proto_draw.js','building_proto.js','main.js'])new Function(fs.readFileSync(path.join(SRC,f),'utf8'))();
const S=APH.state,M=APH.Main,T=APH.CFG.entType,CFG=APH.CFG;
// Make the independent fixture reproducible, including idle wandering.
Math.random=APH.U.makeRng(9301);
function ok(v,msg){if(!v)throw new Error(msg);}
function built(id,gx,gy,rotation,extra){
  return Object.assign(APH.Construction.record(id,gx*CFG.GRID,gy*CFG.GRID,rotation||0),extra||{});
}
function assertModernConduitPower(){
  const buildings=[
    built('bl_ancient_generator',2,2),
    built('bl_conduit',3,2),
    built('bl_heater',4,2)
  ];
  const result=APH.Colony.powerSettle(buildings,{}, {},1,{rulesVersion:1,isDay:false});
  const heater=buildings[2],status=result.status[Math.round(heater.x)+','+Math.round(heater.y)];
  ok(status&&status.grid===true&&status.powered===true,
    'modern BuildGrid conduit must power adjacent heater: '+JSON.stringify(result));
}
function residentDump(home,r){
  const e=(home.entities||[]).find(x=>x&&x.type===T.RESIDENT&&(x.rid===r.id||x.id===r.id));
  const rooms=APH.Nav.roomsOf((home.colony&&home.colony.buildings)||[],home.colony&&home.colony.scene);
  const room=e&&APH.Nav.roomAt(e,rooms,home.colony&&home.colony.scene);
  return {id:r.id,hp:r.hp,food:r.food,rest:r.rest,exposure:r.exposure,
    hypothermia:r.hypothermia,heatstroke:r.heatstroke,illness:r.illness,
    downed:r.downed,worldId:r.worldId,parts:r.parts,capacities:APH.Res.capacitiesOf(r),
    ailments:r.ailments,pos:e&&{x:e.x,y:e.y},room:room&&room.id};
}
function setup(){
  APH.Save.wipeAll();S.meta=APH.Save.loadMeta();S.colony=APH.Save.loadColony();delete S.worlds;
  S.scene='home';S.seed=9301;S.mode='running';S.paused=false;S.timeScale=1;S.clock=0;S.parts=[];S.entities=[];S.power={};S.war={raidActive:false,raidWarn:0};S._worldReady=true;
  const seasonSeconds=CFG.seasons.daysPerSeason*CFG.DAY_LEN;
  const generatorN=4;
  /* 四台 14W 木柴机刚好带动暖气(40W)、医疗舱(6W)和炮塔(10W)。
     木料按完整季节真实燃烧量一次性备齐；运行中不再补任何库存。 */
  const seasonFuel=Math.ceil(seasonSeconds/CFG.power.wood.burnSec*generatorN*1.08);
  S.meta.res={food:0,wood:seasonFuel,stone:200,iron:0,mineral:0,med:30};S.meta.tech={te_machining:1,te_medicine:1,te_ballistics:1,te_turret_tech:1,te_heavy_plasma:1};S.meta.analyzedFlora={crop_dew_fruit:true};
  S.meta.residents=['a','b','c'].map((id,i)=>{const r=APH.Res.generate('soak_'+id,40+i,[]);r.id='soak_'+id;r.name='留守'+id;r.food=85;r.rest=90;r.recreation=90;r.mood=80;r.skills.sk_farm=8;
    r.job=i===0?'bl_crop_plot':null; /* 一人种植，其余保留为燃料/搬运人手。 */
    if(i===1)r.schedule=Array.from({length:24},(_,h)=>h<12?'sleep':'work'); /* 夜班守炉。 */
    if(i===2)r.schedule=Array.from({length:24},(_,h)=>h<12?'work':'sleep'); /* 与夜班互补，返航后守白班。 */
    r.jobLocked=true;r.worldId='home';return r;});
  const B=[];
  /* 14×11 格的正式围合基地；所有记录走 Construction/BuildGrid 几何。 */
  for(let gx=14;gx<=27;gx++){
    B.push(built('bl_wall',gx,17));
    B.push(built(gx===20?'bl_gate':'bl_wall',gx,27));
  }
  for(let gy=18;gy<27;gy++){
    B.push(built('bl_wall',14,gy));
    B.push(built('bl_wall',27,gy));
  }
  /* 第二层完整围护让一次真实袭击能形成可补救危机：外围可被拆穿，
     但内层生活区仍保持 room/保温，不靠运行时修墙或删除敌人作弊。 */
  for(let gx=12;gx<=29;gx++){
    B.push(built('bl_wall',gx,15));
    B.push(built(gx===20?'bl_gate':'bl_wall',gx,29));
  }
  for(let gy=16;gy<29;gy++){
    B.push(built('bl_wall',12,gy));
    B.push(built('bl_wall',29,gy));
  }
  B.push(built('bl_landing_pad',22,32));
  ['a','b','c'].forEach((id,i)=>B.push(built('bl_bed',15+i*2,18,0,{uid:'soak_bed_'+id})));
  B.push(built('bl_storage_shelf',15,23,0,{uid:'soak_food',filter:'food'}));
  B.push(built('bl_dining_table',18,22));
  B.push(built('bl_dining_chair',17,22));
  B.push(built('bl_dining_chair',20,22));
  B.push(built('bl_tv',22,22));
  B.push(built('bl_shelf',22,23));
  B.push(built('bl_clinic',23,18));
  B.push(built('bl_heater',25,18));
  B.push(built('bl_crop_plot',24,23,0,{uid:'soak_crop',crop:'crop_dew_fruit',plot:{stage:0,t:0}}));
  /* 四台机与库存、居民都在围墙内；连续导线接医疗、暖气与一座炮塔，不写 powered。 */
  [18,19,20,21].forEach((gx,i)=>B.push(built('bl_wood_generator',gx,25,0,{uid:'soak_gen_'+i,fuelWood:8})));
  for(let gx=18;gx<=25;gx++)B.push(built('bl_conduit',gx,24));
  for(let gy=19;gy<=23;gy++)B.push(built('bl_conduit',25,gy));
  B.push(built('bl_conduit',23,19),built('bl_conduit',24,19));
  /* 炮塔必须在墙外才不会被自家墙挡弹。独立史前电源只供外围六炮塔；
     内部木柴网仍真实烧料、补给并承担暖气与医疗。 */
  const turretCells=[[16,14],[23,14],[16,30],[23,30],[11,22],[30,22]];
  turretCells.forEach((p,i)=>B.push(built('bl_turret',p[0],p[1],0,{uid:'soak_turret_'+i})));
  B.push(built('bl_ancient_generator',11,15,0,{uid:'soak_defense_power'}));
  for(let gx=12;gx<=29;gx++){B.push(built('bl_conduit',gx,15));B.push(built('bl_conduit',gx,29));}
  for(let gy=16;gy<29;gy++){B.push(built('bl_conduit',12,gy));B.push(built('bl_conduit',29,gy));}
  S.colony.buildings=B;
  S.colony.rulesVersion=1;S.colony.scene=APH.TerrainModel.home(9301);S.meta.workPrio={};
  APH.Res.assignBeds(B,S.meta.residents,{modern:true});M.syncResidents();
  const foodShelf=B.find(b=>b.uid==='soak_food');
  const foodDest=APH.Storage.destination(S,'it_food',{x:CFG.HAB.x,y:CFG.HAB.y});
  ok(foodDest&&foodDest.containerId===foodShelf.uid,'initial food shelf must expose a legal storage destination');
  ok(APH.Storage.deposit(S,'it_food',8,foodDest).ok,'initial food must enter through physical storage');
  const rooms=APH.Nav.roomsOf(B,S.colony.scene);
  ok(rooms.length>=1,'setup must create an enclosed room, got '+rooms.length);
  ['soak_bed_a','soak_bed_b','soak_bed_c','soak_food','soak_crop'].forEach(uid=>{
    const b=B.find(x=>x.uid===uid);ok(b&&APH.Nav.roomAt(b,rooms,S.colony.scene),'fixture '+uid+' must be inside');
  });
  return {initialWood:seasonFuel,initialGeneratorFuel:generatorN*8,
    wallCells:B.filter(b=>b.id==='bl_wall').map(b=>({gx:b.gx,gy:b.gy}))};
}
try{
  assertModernConduitPower();
  const fixture=setup();
  const days=CFG.seasons.daysPerSeason,seasonSeconds=days*CFG.DAY_LEN,dt=.05,scale=3,steps=Math.ceil(seasonSeconds/(dt*scale));
  S.timeScale=scale;
  let warned=false,warningRecovered=false,harvested=false,returned=false,returnedAt=null,ironReturned=0,mined=false,orderedHome=false;
  let raidWarned=false,raidSeen=false,raidResolved=false,raidInterventions=0,fuelRefilled=false,fuelRefillEvents=0,fuelRefilledUnits=0;
  let previousRaidActive=false,wallRepairsQueued=0,wallRepairRecovered=false;
  const defending=new Set();let defenseOrders=0;
  let firstFailure=null,firstDowned=null,executedSteps=0;
  const expectedIds=['soak_a','soak_b','soak_c'];
  /* A real expedition with cargo returns during the run; two residents remain home. */
  const launch=M.launchExpedition({memberIds:['soak_c'],supply:{food:0},objective:'resources',destination:{kind:'unknown'}});ok(launch&&launch.ok,'setup expedition failed');
  const run=APH.ExpeditionState.active(S.colony);ok(run&&S.meta.residents.filter(r=>r.worldId==='home').length===2,'expedition must leave two residents');
  /* 资源远征必须真的走到有限矿脉并采完；测试仅隔离随机战斗，不伪造 cargo。 */
  S.entities=S.entities.filter(e=>e.type!==T.ENEMY);S.spawnT=Infinity;
  const ore=S.entities.find(e=>e.expeditionResource&&e.yieldItemId==='it_iron');
  const explorer=S.entities.find(e=>e.type===T.RESIDENT&&e.rid==='soak_c');
  ok(ore&&explorer,'resource expedition must generate iron and its assigned pawn');
  const oreAmount=ore.amount,expeditionStartedAt=S.clock;
  const previousGeneratorFuel={};
  (S.worlds.home.colony.buildings||[]).filter(b=>b.id==='bl_wood_generator').forEach(b=>previousGeneratorFuel[b.uid]=b.fuelWood||0);
  explorer.userOrder={type:'gather',flora:ore};
  for(let i=0;i<steps;i++){
    executedSteps=i+1;
    M.simStep(dt);
    const home=S.worlds&&S.worlds.home||S;
    const food=APH.Logistics.available(home.colony,S.meta.res,home.entities,'food');
    harvested=harvested||!!(S.meta.alienHarvests&&S.meta.alienHarvests.crop_dew_fruit);
    /* 开局就是一次可见短缺；唯一补救来自田圃的真实生长、收割和搬运。 */
    if(food<12)warned=true;
    if(warned&&harvested&&food>=18)warningRecovered=true;
    if(!returned&&S.scene==='expedition'){
      mined=mined||!!(ore.dead&&(S.carry.it_iron||0)>=oreAmount);
      if(mined&&!orderedHome){explorer.userOrder={type:'move',x:CFG.HAB.x,y:CFG.HAB.y+70};orderedHome=true;}
      if(mined&&S.clock-expeditionStartedAt>=300&&Math.hypot(explorer.x-CFG.HAB.x,explorer.y-(CFG.HAB.y+70))<65){
        const r=M.returnHome();returned=!!(r&&r.ok);if(returned)returnedAt=S.clock;
        if(returned)ironReturned=S.entities.filter(e=>e&&e.type===T.DROPPED&&!e.dead&&e.itemId==='it_iron').reduce((n,e)=>n+(e.n||1),0);
      }
    }
    raidWarned=raidWarned||!!(home.war&&home.war.raidWarn>0);
    const raidActive=!!(home.war&&home.war.raidActive);
    raidSeen=raidSeen||raidActive;
    if(previousRaidActive&&!raidActive){
      raidResolved=true;
      /* 预警后玩家使用普通建造入口补回被拆墙；材料照常预约、搬运、施工。 */
      fixture.wallCells.filter(p=>!home.colony.buildings.some(b=>b.id==='bl_wall'&&!b.dead&&b.gx===p.gx&&b.gy===p.gy)).forEach(p=>{
        APH.WorldRuntime.run(home,()=>M.tryPlace('bl_wall',p.gx*CFG.GRID,p.gy*CFG.GRID));
        wallRepairsQueued++;
      });
    }
    previousRaidActive=raidActive;
    // 室内出现活敌时下正常征召/移动令；危险解除后解散，恢复吃饭与后勤。
    // 安全房间豁免不代表居民应忽视入室敌人，固定炮塔也不是全自动胜利。
    const defenseRooms=APH.Nav.roomsOf(home.colony.buildings,home.colony.scene);
    const threats=home.entities.filter(en=>en&&en.type===T.ENEMY&&!en.dead&&!en.downed&&!en.isSoldier&&!en.retreat);
    home.entities.filter(e=>e&&e.type===T.RESIDENT&&!e.dead).forEach(e=>{
      const r=S.meta.residents.find(r=>r.id===(e.rid||e.id));
      if(!r||r.downed||r.isSleeping||r.medLying)return;
      const room=APH.Nav.roomAt(e,defenseRooms,home.colony.scene);
      const target=threats.filter(en=>room?APH.Nav.roomAt(en,defenseRooms,home.colony.scene)===room:Math.hypot(en.x-e.x,en.y-e.y)<240)
        .sort((a,b)=>Math.hypot(a.x-e.x,a.y-e.y)-Math.hypot(b.x-e.x,b.y-e.y))[0];
      if(target){
        if(!defending.has(r.id)){M.cmd.draft(e,true);defending.add(r.id);defenseOrders++;}
        if(Math.hypot(target.x-e.x,target.y-e.y)>CFG.combat.plasmaSpeed*CFG.combat.plasmaLife*.7)M.cmd.prioritize(e,target);
      }else if(defending.has(r.id)){
        M.cmd.draft(e,false);M.cmd.prioritize(e,{x:e.x,y:e.y});defending.delete(r.id);
      }
    });
    /* 炮塔只会击倒来袭者；预警后的合法玩家处置是右键俘虏，
       这里走同一个公开命令入口，让危机能被实际干预并结束。 */
    (home.entities||[]).filter(e=>e&&e.type===T.ENEMY&&!e.dead&&e.downed).forEach(en=>{
      APH.WorldRuntime.run(home,()=>M.cmd.rightClick(en.x,en.y));
      ok(en.dead,'right-click defense intervention must capture downed raider '+en.id);
      raidInterventions++;
    });
    home.colony.buildings.filter(b=>b.id==='bl_wood_generator').forEach(b=>{
      const now=b.fuelWood||0,prior=previousGeneratorFuel[b.uid];
      if(prior!=null&&now>prior){fuelRefilled=true;fuelRefillEvents++;fuelRefilledUnits+=now-prior;}
      previousGeneratorFuel[b.uid]=now;
    });
    if(wallRepairsQueued&&fixture.wallCells.every(p=>home.colony.buildings.some(b=>b.id==='bl_wall'&&!b.dead&&b.gx===p.gx&&b.gy===p.gy)))wallRepairRecovered=true;
    if(!firstDowned&&S.meta.residents.some(r=>r.downed))firstDowned={step:i,clock:S.clock,residents:S.meta.residents.filter(r=>r.downed).map(r=>residentDump(r.worldId==='home'?home:(S.worlds&&S.worlds.expedition)||S,r))};
    const missing=expectedIds.filter(id=>!S.meta.residents.some(r=>r.id===id));
    if(!firstFailure&&(!S.mode||S.mode==='dead'||missing.length))firstFailure={step:i,clock:S.clock,food,mode:S.mode,missing,firstDowned,
      weather:S.meta.weather,war:home.war,stock:Object.assign({},S.meta.res),rooms:APH.Nav.roomsOf(home.colony.buildings,home.colony.scene).length,
      roomTemps:APH.Nav.roomsOf(home.colony.buildings,home.colony.scene).map(r=>r.temp),
      powerStatus:home.powerStatus&&{prodW:home.powerStatus.prodW,loadW:home.powerStatus.loadW,shed:home.powerStatus.shed},
      generators:home.colony.buildings.filter(b=>b.id==='bl_wood_generator').map(b=>({x:b.x,y:b.y,fuelWood:b.fuelWood,burnT:b.burnT,powered:b.powered,grid:b.grid})),
      heater:home.colony.buildings.filter(b=>b.id==='bl_heater').map(b=>({x:b.x,y:b.y,powered:b.powered,grid:b.grid})),
      residents:S.meta.residents.map(r=>residentDump(r.worldId==='home'?home:(S.worlds&&S.worlds.expedition)||S,r))};
    if(firstFailure)break;
  }
  const finalHome=S.worlds&&S.worlds.home||S;
  const finalGeneratorFuel=finalHome.colony.buildings.filter(b=>b.id==='bl_wood_generator').reduce((n,b)=>n+(b.fuelWood||0),0);
  const report={passed:false,fixtureSeed:9301,generatedAt:new Date().toISOString(),scope:'Automated six-day soak of a legal prebuilt colony with one season of initial fuel stock; normal gather, return, civilian draft/movement and capture commands provide intervention, and destroyed raid walls are rebuilt through construction when any are lost. This is not a fresh-save manual playthrough. Resource expedition enemy encounters are isolated; home raids remain active.',
    exitReady:!firstFailure&&S.clock>=seasonSeconds&&S.meta.residents.every(r=>!r.downed),
    clock:S.clock,steps:executedSteps,dt,timeScale:scale,days,harvested,mined,returned,
    physicalIronAtReturn:ironReturned,expeditionSeconds:returnedAt==null?null:returnedAt-expeditionStartedAt,
    foodWarning:{seen:warned,recovered:warningRecovered},
    raid:{warned:raidWarned,seen:raidSeen,resolved:raidResolved,captures:raidInterventions,defenseOrders,
      destroyedWalls:wallRepairsQueued,rebuildRequired:wallRepairsQueued>0,rebuildRecovered:wallRepairsQueued===0||wallRepairRecovered},
    fuel:{initialStock:fixture.initialWood,finalStock:S.meta.res.wood||0,
      initialGeneratorFuel:fixture.initialGeneratorFuel,finalGeneratorFuel,
      refillEvents:fuelRefillEvents,refilledUnitsObserved:fuelRefilledUnits},
    rooms:APH.Nav.roomsOf(finalHome.colony.buildings,finalHome.colony.scene).map(r=>({id:r.id,temp:r.temp})),
    residents:S.meta.residents.map(r=>residentDump(finalHome,r))};
  const evidenceDir=path.join(__dirname,'..','docs','evidence','colony-home');
  fs.mkdirSync(evidenceDir,{recursive:true});fs.writeFileSync(path.join(evidenceDir,'season.json'),JSON.stringify(report,null,2)+'\n');
  ok(!firstFailure,'survival chain first failure: '+JSON.stringify(firstFailure));
  ok(S.clock>=seasonSeconds,'did not complete configured full season: '+S.clock+'/'+seasonSeconds);
  ok(harvested,'crop production never harvested');ok(mined,'expedition did not mine its finite iron deposit');ok(returned,'expedition did not return');
  ok(S.meta.residents.every(r=>r.worldId==='home'),'returned expeditioner did not rejoin home');
  ok(ironReturned>=oreAmount,'returned iron was not unloaded as a physical home pile');
  ok(warned,'no low-food warning window');
  ok(warningRecovered,'crop loop did not recover the warned food shortage');
  ok(fuelRefilled&&fuelRefillEvents>0&&S.meta.res.wood<fixture.initialWood,'wood generators did not use real stock-to-machine fuel logistics');
  ok(raidWarned&&raidSeen&&raidResolved,'raid warning and defense must reach a resolved raid');
  if(wallRepairsQueued>0)ok(wallRepairRecovered,'destroyed raid walls were not rebuilt through ordinary construction logistics');
  ok(S.meta.residents.every(r=>!r.downed),'residents did not recover by season end: '+JSON.stringify(firstDowned));
  report.passed=true;fs.writeFileSync(path.join(evidenceDir,'season.json'),JSON.stringify(report,null,2)+'\n');
  console.log('✓ season soak '+days+' days/season, '+steps+' frame-sized sim steps');
}catch(e){console.error('✗ season soak\n  '+e.message);process.exitCode=1;}
