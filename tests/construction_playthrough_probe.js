#!/usr/bin/env node
/* Deterministic command-driven new-game construction evidence, not mouse QA.
   node tests/construction_playthrough_probe.js [report.json] [--seconds N] [--resume report.json]
   --seconds limits newly simulated time; resumed reports keep cumulative time.
   Reuses scenario's full-module DOM bootstrap and the lab's legal room layout. */
'use strict';
const fs=require('fs'),path=require('path');
function parseArgs(args){
  let reportPath,resumePath,maxSeconds=1800;
  for(let i=0;i<args.length;i++){
    if(args[i]==='--seconds'){
      const value=args[++i];
      maxSeconds=Number(value);
      if(!value||!Number.isFinite(maxSeconds)||maxSeconds<=0)throw Error('--seconds requires a positive finite number');
    }else if(args[i]==='--resume'){
      resumePath=args[++i];
      if(!resumePath||resumePath.startsWith('--'))throw Error('--resume requires a report path');
    }else if(args[i].startsWith('--')||reportPath){
      throw Error('Usage: node tests/construction_playthrough_probe.js [report.json] [--seconds N] [--resume report.json]');
    }else reportPath=args[i];
  }
  return {output:path.resolve(reportPath||'/tmp/aphelion-construction-playthrough.json'),maxSeconds,resumePath:resumePath&&path.resolve(resumePath)};
}
const {output,maxSeconds,resumePath}=parseArgs(process.argv.slice(2));
const resumeReport=resumePath?JSON.parse(fs.readFileSync(resumePath,'utf8')):null;
if(resumeReport){
  const entries=resumeReport.storage&&resumeReport.storage.entries;
  if(!entries||typeof entries.aphelion_meta!=='string'||typeof entries.aphelion_colony_v1!=='string'||Object.values(entries).some(v=>typeof v!=='string'))
    throw Error('RESUME_MISSING_STORAGE: original memory-only save strings are required; report state cannot substitute for a save');
  if(!Number.isFinite(resumeReport.fakeTime)||!Number.isFinite(resumeReport.simulatedSeconds)||!Array.isArray(resumeReport.sites)||resumeReport.sites.length!==2||!Number.isInteger(resumeReport.phase)||resumeReport.phase<0||resumeReport.phase>3)
    throw Error('RESUME_INVALID_PROBE_METADATA');
}
const scenario=fs.readFileSync(path.join(__dirname,'scenario.test.js'),'utf8');
const bootstrap=scenario.split('/* ---------- 极简断言器 ---------- */')[0].replace(/^#!.*\n/,'')
  .replace(/const FAKE_T0 = \d+;/,'const FAKE_T0 = 1700000058098;')
  .replace('Date.now = function(){ fakeT += 16; return fakeT; };','Date.now = function(){ return fakeT; };')
  // Install the raw mock save before any module (especially main's boot) loads.
  .replace('global.document = {',"if(resumeReport){for(const [key,value] of Object.entries(resumeReport.storage.entries))localStorage.setItem(key,value);fakeT=resumeReport.fakeTime;}\nglobal.document = {");
const lab=fs.readFileSync(path.join(__dirname,'visual_lab.html'),'utf8');
const roomHelpers=lab.slice(lab.indexOf('function roomItems('),lab.indexOf('// Staged commands'));
const exercise=`
const a=APH,s=a.state;a.Main.start();s.paused=true;
if(s.colony.scene.seed!==58098||s.meta.residents.length!==3||(!resumeReport&&s.colony.buildings.length))throw Error('ordinary start contract '+JSON.stringify({seed:s.colony.scene.seed,residents:s.meta.residents.length,buildings:s.colony.buildings.length}));
const site=resumeReport?{sites:resumeReport.sites,items:resumeReport.sites.flatMap(([ox,oy],i)=>roomItems(ox,oy,true,i===1))}:findRoomSite(a,true);
const phases=[site.items.filter(v=>v[0]==='bl_floor'),site.items.filter(v=>v[0]==='bl_wall'||v[0]==='bl_gate'),site.items.filter(v=>!['bl_floor','bl_wall','bl_gate'].includes(v[0]))];
const initialSteps=resumeReport?Math.round(resumeReport.simulatedSeconds*20):0;
let phase=resumeReport?resumeReport.phase:0,steps=initialSteps,interrupted=null,wakeWait=null;
const samples=resumeReport?(resumeReport.samples||[]).slice():[],remoteGatherCommands=resumeReport?(resumeReport.remoteGatherCommands||[]).slice():[];
const restoredState=resumeReport?{seconds:s.clock,phase,sites:site.sites,storageKeys:Object.keys(resumeReport.storage.entries),residents:s.meta.residents.map(r=>r.id),stock:JSON.parse(JSON.stringify(s.meta.res)),queue:s.colony.buildQueue.map(q=>({uid:q.uid,bid:q.bid,need:q.need}))}:null;
function plan(){for(const [id,x,y,r] of phases[phase]){s.buildRotation=r;const before=s.colony.buildQueue.length;a.Main.tryPlace(id,x,y);if(s.colony.buildQueue.length!==before+1)throw Error('legal planning failed '+id)}}
if(!resumeReport){
s.devFreeBuild=false;plan();s.designations=s.designations||{};
const natural=s.entities.filter(e=>e.type===a.CFG.entType.FLORA&&!e.dead).sort((a,b)=>Math.hypot(a.x-1100,a.y-1100)-Math.hypot(b.x-1100,b.y-1100));
for(const [kind,n] of [['tree',8],['rock_stone',34],['bush_berry',3],['rock_wreckage',1]])natural.filter(e=>e.kind===kind).slice(0,n).forEach(e=>{s.designations[e.id]={type:kind.startsWith('rock')?'mine':'chop',entityId:e.id}});
}
function commandRemoteMine(){
  const missing=new Set();
  for(const q of s.colony.buildQueue){
    if(q.materialsPaid===false&&q.taskId)Object.keys(a.Logistics.taskState(s.colony,q.taskId).missing).forEach(k=>missing.add(k));
  }
  if(!missing.size)return;
  const workers=s.entities.filter(e=>{
    const r=e.type===a.CFG.entType.RESIDENT&&a.Res.residentOf(e);
    return r&&!e.dead&&!e.drafted&&!e.userOrder&&!e.job&&!r.job&&!r.downed&&!r.isSleeping&&!r.medLying&&!a.Res.isBroken(r)&&r.food>=25&&r.rest>=10&&!e.haulCarry&&!a.Logistics.reservationForCarrier(s.colony,r.id);
  });
  const mines=s.entities.filter(e=>e.type===a.CFG.entType.FLORA&&!e.dead&&e.hp>0&&s.designations&&s.designations[e.id]&&s.designations[e.id].type==='mine');
  const radius=a.CFG.gathering.searchRadius;
  if(!workers.length||!mines.length||mines.some(m=>workers.some(e=>a.U.dst(e.x,e.y,m.x,m.y)<radius)))return;
  const ordered=new Set(s.entities.filter(e=>e.userOrder&&e.userOrder.type==='gather'&&e.userOrder.flora).map(e=>e.userOrder.flora.id));
  const candidates=[];
  for(const target of mines){
    if(ordered.has(target.id))continue;
    const rule=a.CFG.observe.resourceSemantics[target.kind],itemId=target.yieldItemId||(rule&&rule.yieldItemId);
    const key=(a.CFG.items[itemId]||{}).store;
    if(!missing.has(key))continue;
    for(const worker of workers)candidates.push({worker,target,distance:a.U.dst(worker.x,worker.y,target.x,target.y)});
  }
  candidates.sort((x,y)=>x.distance-y.distance);
  const nav=a.Nav.gridOf(s.colony.buildings,s.colony.scene);
  for(const candidate of candidates){
    const {worker,target,distance}=candidate;
    if(!a.Nav.astar(nav,worker,target))continue;
    worker.userOrder={type:'gather',flora:target};
    remoteGatherCommands.push({scripted:true,worker:worker.rid,target:{id:target.id,kind:target.kind,x:target.x,y:target.y},clock:s.clock,distance,reason:'Explicit gather command for missing construction material; all remaining designated mines are outside available workers automatic search radius; not mouse QA'});
    break;
  }
}
function snapshot(status,error){
  if(a.Main.checkpointWorlds(s)===false)throw Error('FORMAL_CHECKPOINT_FAILED');
  const entries={};
  for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);entries[key]=localStorage.getItem(key);}
  const rooms=a.Nav.roomsOf(s.colony.buildings,s.colony.scene).map(r=>({type:r.type,area:r.cells.length}));
  const complete=!interrupted&&site.items.length===72&&s.colony.buildings.length===72&&rooms.length===2&&!s.colony.buildQueue.length&&phase===3;
  return {scope:'Node DOM stubs; scripted formal planning, designations and explicit remote gather commands (not mouse QA), original 3 residents/stock/needs, real gathering/material delivery/construction; no free build or injected supplies',status,complete,interrupted:!!interrupted,signal:interrupted,error,seed:s.colony.scene.seed,requested:site.items.length,maxSeconds,resumed:!!resumeReport,resumedFrom:resumePath||null,restoredState,storage:{scope:'memory-only mock localStorage; original string values from formal checkpoint',entries},fakeTime:fakeT,sites:site.sites,phase,seconds:s.clock,simulatedSeconds:steps*.05,runSimulatedSeconds:(steps-initialSteps)*.05,samples,remoteGatherCommands,rooms,built:s.colony.buildings.length,available:['wood','stone','iron','mineral','food'].map(k=>[k,a.Colony.stockOf(s.meta.res,s.entities,k)]),workers:s.entities.filter(e=>e.type===a.CFG.entType.RESIDENT).map(e=>({id:e.rid,x:e.x,y:e.y,tx:e.tx,ty:e.ty,reason:e.workReason,person:a.Res.residentOf(e)})),buildings:s.colony.buildings,queue:s.colony.buildQueue,logistics:s.colony.logistics,drops:s.entities.filter(e=>e.type===a.CFG.entType.DROPPED),designations:s.designations};
}
function save(status,error){
  const report=snapshot(status,error);
  fs.writeFileSync(output,JSON.stringify(report,null,2));
  return report;
}
function onSignal(signal){
  if(interrupted)return;
  interrupted=signal;s.paused=true;
  process.exitCode=signal==='SIGINT'?130:143;
  try{save('interrupted')}finally{if(wakeWait)wakeWait()}
}
const onInt=()=>onSignal('SIGINT'),onTerm=()=>onSignal('SIGTERM');
process.on('SIGINT',onInt);process.on('SIGTERM',onTerm);
// Use a real monotonic clock: scenario's performance.now/Date.now are simulated.
const realNow=()=>Number(process.hrtime.bigint())/1e6;
function rest(ms){
  return new Promise(resolve=>{
    const timer=setTimeout(done,ms);
    function done(){clearTimeout(timer);wakeWait=null;resolve()}
    wakeWait=done;
  });
}
try{
  save('running');
  const maxSteps=initialSteps+Math.floor(maxSeconds*20);
  while(steps<maxSteps&&phase<phases.length&&s.mode==='running'&&!interrupted){
    const chunkStart=realNow();
    do{
      s.paused=false;fakeT+=50;a.Main.simStep(.05);steps++;
      if(!s.colony.buildQueue.length){phase++;if(phase<phases.length)plan()}
      if(steps%600===0)commandRemoteMine();
      if(steps%6000===0){
        const sample={seconds:steps*.05,built:s.colony.buildings.length,queued:s.colony.buildQueue.length,phase};
        samples.push(sample);save('running');console.log(JSON.stringify(sample));
      }
    }while(realNow()-chunkStart<20&&steps<maxSteps&&phase<phases.length&&s.mode==='running'&&!interrupted);
    // About 25% duty cycle; a single synchronous simStep cannot be preempted.
    await rest(Math.max(1,(realNow()-chunkStart)*3));
  }
  s.paused=true;
  const report=snapshot(interrupted?'interrupted':'incomplete');
  if(report.complete)report.status='complete';
  else if(!interrupted)report.status=s.mode==='running'?'time_limit':'stopped';
  fs.writeFileSync(output,JSON.stringify(report,null,2));
  if(report.complete)console.log('Construction completed '+site.items.length+' components in '+s.clock.toFixed(2)+' simulated seconds');
  else{
    if(!interrupted)process.exitCode=1;
    console.error('NORMAL_CONSTRUCTION_INCOMPLETE '+s.colony.buildings.length+'/'+site.items.length+' ('+report.status+')');
  }
}catch(e){
  s.paused=true;save(interrupted?'interrupted':'error',e.stack);throw e;
}finally{
  process.removeListener('SIGINT',onInt);process.removeListener('SIGTERM',onTerm);
}
`;
new Function('require','__dirname','output','maxSeconds','resumeReport','resumePath',bootstrap+roomHelpers+'return (async function(){'+exercise+'})()')(require,__dirname,output,maxSeconds,resumeReport,resumePath)
  .catch(e=>{console.error(e.stack);if(!process.exitCode)process.exitCode=1});
