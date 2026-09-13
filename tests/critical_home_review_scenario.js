#!/usr/bin/env node
'use strict';

/* 复用 scenario 的真实 DOM 桩和模块加载顺序，但不执行整套 scenario 用例。 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const scenarioPath = path.join(__dirname, 'scenario.test.js');
let bootstrap = fs.readFileSync(scenarioPath, 'utf8').replace(/^#!.*\n/, '');
bootstrap = bootstrap.slice(0, bootstrap.indexOf('/* ---------- 极简断言器 ---------- */'));
const sandbox = {
  require, console, process, Buffer, Uint8ClampedArray,
  setTimeout, clearTimeout, setInterval, clearInterval,
  __dirname
};
sandbox.global = sandbox;
vm.createContext(sandbox);
vm.runInContext(bootstrap, sandbox, {filename:'critical-home-review-bootstrap.js'});

const APH = sandbox.APH;
APH.Main.start();
const s = APH.state;
const T = APH.CFG.entType;
const pawn = s.entities.find(function(e){ return e && e.type === T.RESIDENT && !e.dead; });
assert.ok(pawn, '测试前置：家园必须有真实居民实体');
const resident = s.meta.residents.find(function(r){ return r && r.id === (pawn.rid || pawn.id); });
assert.ok(resident, '测试前置：居民实体必须连到 canonical 名册');

s.scene = 'home';
s.mode = 'running';
s.colony.rulesVersion = 1;
s.colony.buildQueue = [];
s.colony.logistics = {v:1,nextTask:1,nextReservation:1,tasks:[],reservations:[]};
s.meta.res.stone = 1;
s.meta.workPrio = s.meta.workPrio || {};
s.meta.workPrio[resident.id] = {sk_build:0,sk_gather:0,sk_haul:0};
resident.downed = false;
resident.isSleeping = false;
resident.medLying = false;
resident.food = 100;
resident.rest = 100;
resident.recreation = 100;
pawn.drafted = false;
pawn.x = s.px;
pawn.y = s.py;

const trap = {
  id:'bl_spike_trap', uid:'critical_review_trap',
  x:pawn.x, y:pawn.y, armed:false
};
s.colony.buildings = [trap];
const task = APH.Logistics.ensureTask(s.colony, {
  kind:'generic', targetId:'critical_review_target',
  x:pawn.x+200, y:pawn.y, need:{stone:1}
});
const held = APH.Logistics.reserveForTask(
  s.colony, s.meta.res, s.entities, task, 'offscreen_carrier',
  {stockSpot:{x:s.px,y:s.py},from:{x:s.px,y:s.py}}
);
assert.ok(held.ok, '测试前置：唯一石材应被工单预约');
assert.strictEqual(APH.Logistics.available(s.colony,s.meta.res,[],'stone'),0,
  '测试前置：预约后不能再有可用石材');

APH.Main.updateResidents(0.1);

assert.strictEqual(s.meta.res.stone,1, '陷阱重置不得扣走工单已预约的唯一石材');
assert.strictEqual(trap.armed,false, '没有未预约材料时陷阱必须保持未重置');
assert.ok(APH.Logistics.reservationForCarrier(s.colony,'offscreen_carrier'),
  '被拒绝的陷阱重置不得破坏原工单预约');

console.log('✓ critical home scenario: 陷阱重置尊重物流预约');

// Losing a carrier must transfer ordinary hauled goods back to the world once.
const other=s.entities.find(e=>e&&e.type===T.RESIDENT&&!e.dead);
other.haulCarry=[{itemId:'it_wood',n:7},{itemId:'specimen_dew',n:2}];
const before=APH.Colony.itemCount(s.entities,'it_wood');
s.meta.residents=s.meta.residents.filter(r=>r.id!==(other.rid||other.id));
APH.Main.syncResidents();APH.Main.syncResidents();
assert.equal(APH.Colony.itemCount(s.entities,'it_wood'),before+7);
assert.equal(s.entities.filter(e=>e&&!e.dead&&e.itemId==='specimen_dew').reduce((n,e)=>n+e.n,0),2);
console.log('✓ carrier removal returns ordinary cargo exactly once');

// Deconstruction follows the selected remote building and returns its real fuel.
const closeBuilding={id:'bl_bed',uid:'close_bed',x:1100,y:1100};
const farGenerator=APH.Construction.record('bl_wood_generator',1920,1920,0);farGenerator.uid='far_generator';farGenerator.fuelWood=6;
s.colony.buildings=[closeBuilding,farGenerator];
const farEntity={id:'far_entity',bid:farGenerator.id,type:T.BUILDING,x:farGenerator.x,y:farGenerator.y};s.entities.push(farEntity);
s.selectedTarget={type:'building',entity:farEntity};s.px=1100;s.py=1100;
const woodBefore=APH.Colony.itemCount(s.entities,'it_wood');
APH.Input.dispatchAction('DEMOLISH_NEAREST');
assert(s.colony.buildings.includes(closeBuilding));assert(!s.colony.buildings.includes(farGenerator));
const woodRefund=Math.floor(APH.Construction.materialNeed(APH.Colony.get('bl_wood_generator'),1).wood/2);
assert.equal(APH.Colony.itemCount(s.entities,'it_wood'),woodBefore+6+woodRefund);
console.log('✓ remote selected deconstruction returns fuel and salvage to ground');

// A resource mission mines a finite deposit and returns physical iron, not just research.
s.meta.residents.forEach(r=>{r.downed=false;r.dead=false;r.food=100;r.rest=100;r.recreation=100;r.isSleeping=false;r.medLying=false;});
const explorerId=s.meta.residents[0].id;
const launch=APH.Main.launchExpedition({memberIds:[explorerId],supply:{food:0},objective:'resources',destination:{kind:'unknown'}});
assert(launch&&launch.ok);
// This is a mining/return fixture; combat is covered separately.
s.entities=s.entities.filter(e=>e.type!==T.ENEMY);s.spawnT=Infinity;
const ore=s.entities.find(e=>e.expeditionResource&&e.yieldItemId==='it_iron');
const explorer=s.entities.find(e=>e.type===T.RESIDENT&&e.rid===explorerId);
assert(ore&&explorer);explorer.userOrder={type:'gather',flora:ore};
for(let i=0;i<2400&&(s.carry.it_iron||0)<ore.amount;i++)APH.Main.simStep(.05);
assert(ore.dead);assert.equal(s.carry.it_iron,ore.amount);
const runtime=APH.WorldRuntime.serializable(s);
const restored=APH.WorldRuntime.restore(runtime,s);
assert(!restored.entities.some(e=>e.id===ore.id&&!e.dead));
const returned=APH.Main.returnHome();assert(returned&&returned.ok);
assert(s.entities.some(e=>e.type===T.DROPPED&&!e.dead&&e.itemId==='it_iron'&&e.n>=ore.amount));
console.log('✓ finite expedition ore is mined, persisted and returned as physical iron');

// A protected civilian can sustain indoor fuel logistics during a raid.
// An active intruder in the same room restores the existing shelter behavior.
const G=APH.CFG.GRID,roomBuildings=[];
const rb=(id,gx,gy)=>APH.Construction.record(id,gx*G,gy*G,0);
for(let gx=17;gx<=26;gx++){roomBuildings.push(rb('bl_wall',gx,18),rb('bl_wall',gx,28));}
for(let gy=19;gy<28;gy++){roomBuildings.push(rb('bl_wall',17,gy),rb('bl_wall',26,gy));}
const generator=rb('bl_wood_generator',21,22);generator.fuelWood=0;roomBuildings.push(generator);
s.colony.buildings=roomBuildings;s.colony.buildQueue=[];s.colony.logistics={v:1,nextTask:1,nextReservation:1,tasks:[],reservations:[]};s.colony.pendingGround=[];
const worker=s.meta.residents[0];s.meta.residents=[worker];worker.job=null;worker.downed=false;worker.isSleeping=false;worker.medLying=false;worker.food=100;worker.rest=100;worker.recreation=100;worker.wantSleep=false;worker.illness=0;
s.meta.workPrio[worker.id]={sk_build:0,sk_gather:0,sk_haul:2};s.meta.res={wood:16};
s.entities=[];APH.Main.syncResidents();
const carrier=s.entities.find(e=>e.type===T.RESIDENT);carrier.x=20.5*G;carrier.y=22.5*G;carrier.drafted=false;
const intruder={id:'raid_intruder',type:T.ENEMY,x:23.5*G,y:22.5*G,dead:false,downed:false};s.entities.push(intruder);s.war={raidActive:true};
APH.Main.updateResidents(.05);
assert(!APH.Logistics.reservationForCarrier(s.colony,worker.id),'intruder in the room must block civilian logistics');
intruder.x=30*G;intruder.y=22*G;
for(let i=0;i<1600&&generator.fuelWood<8;i++)APH.Main.updateResidents(.05);
assert.equal(generator.fuelWood,8,'sheltered civilian must actually deliver generator fuel during a raid');
assert.equal(s.meta.res.wood,8,'fuel must come from the real landing inventory');
console.log('✓ sheltered wartime fuel logistics continue; intruders stop civilian work');

// A destroyed vertical wall is rebuilt using ordinary planning, hauling and work.
s.war={raidActive:false};s.entities=s.entities.filter(e=>e.type!==T.ENEMY);s.spawnT=Infinity;
s.meta.res.stone=8;worker.food=100;worker.rest=100;worker.isSleeping=false;worker.wantSleep=false;
worker.schedule=Array.from({length:24},()=> 'work');worker.skills.sk_build=1;worker.mainSkill='sk_farm';worker.subSkill='sk_craft';s.meta.workPrio[worker.id].sk_build=2;
const hole={gx:26,gy:23};
s.colony.buildings=s.colony.buildings.filter(b=>!(b.id==='bl_wall'&&b.gx===hole.gx&&b.gy===hole.gy));
assert.equal(APH.Nav.roomsOf(s.colony.buildings,s.colony.scene).length,0);
APH.Main.tryPlace('bl_wall',hole.gx*G,hole.gy*G);
assert(s.colony.buildQueue.some(b=>b.gx===hole.gx&&b.gy===hole.gy),'wall gap must accept an ordinary blueprint');
for(let i=0;i<3600&&!s.colony.buildings.some(b=>b.id==='bl_wall'&&b.gx===hole.gx&&b.gy===hole.gy);i++)APH.Main.simStep(.05);
assert(s.colony.buildings.some(b=>b.id==='bl_wall'&&b.gx===hole.gx&&b.gy===hole.gy),'worker must deliver stone and rebuild the actual wall even below legacy specialist level');
assert(APH.Nav.roomsOf(s.colony.buildings,s.colony.scene).length>0,'rebuilt wall must restore room enclosure');
assert(s.meta.res.stone<8,'repair must spend real stone');
console.log('✓ destroyed vertical wall is physically supplied and rebuilt, restoring shelter');
