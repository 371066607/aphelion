#!/usr/bin/env node
/* 居民世界侧接线的长仿真对拍 (issue #206)
   node tests/resident_trace_probe.js <仓库根> [步数]

   搬迁型重构（1000+ 行换文件）光靠单元/场景测试不够：断言只覆盖被想到的路径。
   本探针给同一 seed、同一夹具、只差源码树的两次运行做逐帧状态对拍 —— 摘要
   逐字节相同 = 居民 AI 的决策序列没有漂移。模块清单从该树的 build.py
   MODULE_ORDER 读取，所以两棵树各自加载自己的实现。

   用法（拿一个 worktree 当基线）：
     git worktree add /tmp/base <重构前 commit>
     TRACE_DUMP=/tmp/a.json node tests/resident_trace_probe.js /tmp/base 600
     TRACE_DUMP=/tmp/b.json node tests/resident_trace_probe.js . 600
     cmp /tmp/a.json /tmp/b.json

   确定性边界（实测，别把窗口开大）：约 760 步之后，**同一棵树**的两次运行
   也会开始出现浮点级差异（同一步位移 1.7469 vs 1.7839，随后累积），而
   Math.random 调用次数、天气、库存、任务分配完全一致 —— 是既有仿真不确定性，
   不是本探针的用途。600 步窗口内两次运行逐字节一致（已验收）。 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = process.argv[2];
const STEPS = Number(process.argv[3] || 6000);
const SRC = path.join(ROOT, 'src');

function el(){ const c = {}; return { style:{}, classList:{add(k){c[k]=1;},remove(k){delete c[k];},toggle(){},contains(k){return !!c[k];}}, textContent:'', innerHTML:'', appendChild(){}, addEventListener(){}, setAttribute(){}, getAttribute(){return null;}, querySelector(){return el();}, querySelectorAll(){return [];}, play(){return {catch(){}};}, pause(){}, getContext(){ const g={addColorStop(){}}; return new Proxy({},{get(t,k){return (k==='createRadialGradient'||k==='createLinearGradient')?()=>g:()=>{};}});} }; }
global.window = global;
global.localStorage = (()=>{ const m={}; return { getItem:k=>m[k]||null, setItem:(k,v)=>m[k]=String(v), removeItem:k=>delete m[k], clear(){Object.keys(m).forEach(k=>delete m[k]);} }; })();
global.document = { getElementById(){return el();}, createElement(){return el();}, body:el(), addEventListener(){} };
global.addEventListener=()=>{}; global.innerWidth=800; global.innerHeight=600; global.devicePixelRatio=1;
global.requestAnimationFrame=()=>0; global.location={search:'',reload(){}}; global.performance={now:()=>0};
global.Image=class{ set src(v){this._src=v;if(this.onload)this.onload();} };
global.APH={SPRITE_DATA:{}};

const order = (()=>{
  const py = fs.readFileSync(path.join(ROOT,'build.py'),'utf-8');
  const m = /MODULE_ORDER\s*=\s*\[([\s\S]*?)\]/.exec(py);
  return [...m[1].matchAll(/"([^"]+)"/g)].map(x=>x[1]);
})();
for (const f of order) new Function(fs.readFileSync(path.join(SRC,f),'utf-8'))();

const S = APH.state, M = APH.Main, T = APH.CFG.entType, CFG = APH.CFG;
let rngCalls=0; const _rng=APH.U.makeRng(9301);
Math.random = function(){ rngCalls++; return _rng(); };
/* combat.js 的掉落/战利品用 Date.now() 播种 RNG —— 墙钟会让同一 seed 的两次
   仿真走岔。这里把它钉成仿真时钟的函数, 保证「只差源码树」这一个变量。 */
const T0 = 1700000000000;
Object.defineProperty(Date, 'now', { value: () => T0 + Math.round((S.clock || 0) * 1000), writable: true });

/* 夹具: 一个能同时触发种植/搬运/进食/社交/游荡/建造的小殖民地 */
APH.Save.wipeAll();
S.meta = APH.Save.loadMeta(); S.colony = APH.Save.loadColony(); delete S.worlds;
S.scene='home'; S.seed=9301; S.mode='running'; S.paused=false; S.timeScale=1; S.clock=0;
S.parts=[]; S.entities=[]; S.power={}; S.war={raidActive:false,raidWarn:0}; S._worldReady=true;
S.meta.res={food:40,wood:400,stone:200,iron:60,mineral:60,med:10};
S.meta.tech={te_machining:1,te_medicine:1,te_agriculture:1};
S.meta.residents=[];
for (let i=0;i<4;i++){
  const r = APH.Res.generate('trace_'+i, 60+i*7, []);
  r.id='trace_'+i; r.name='对拍'+i; r.food=70; r.rest=80; r.recreation=70; r.mood=75;
  r.skills.sk_farm=6; r.skills.sk_haul=5; r.skills.sk_build=4;
  r.worldId='home'; S.meta.residents.push(r);
}
const built=(id,gx,gy,rot)=>Object.assign(APH.Construction.record(id,gx*CFG.GRID,gy*CFG.GRID,rot||0),{});
const B=[];
for(let gx=14;gx<=27;gx++){ B.push(built('bl_wall',gx,17)); B.push(built(gx===20?'bl_gate':'bl_wall',gx,27)); }
for(let gy=18;gy<27;gy++){ B.push(built('bl_wall',14,gy)); B.push(built('bl_wall',27,gy)); }
B.push(built('bl_bed',16,19,0,{uid:'bed_a'}));
B.push(built('bl_bed',17,19,0,{uid:'bed_b'}));
B.push(built('bl_dining_table',20,21));
B.push(built('bl_dining_chair',20,22));
B.push(built('bl_storage_shelf',18,20,0,{uid:'shelf_a'}));
B.push(built('bl_crop_plot',21,20));
B.push(built('bl_campfire',22,22));
B.push(built('bl_workshop',24,20));
APH.Colony.place ? null : null;
S.colony.buildings=B; S.colony.rulesVersion=1;
/* 地面物资: 让搬运/入库有活干 */
[['it_wood',3],['it_stone',2],['it_food',4],['it_med',1]].forEach(([id,n],i)=>{
  /* spawnDrop 自己就进 s.entities —— 不要再 push 返回值, 否则同一堆会出现两次 */
  APH.Combat.spawnDrop(300+i*60, 320+i*40, id, n, {stock:false, jitter:0, merge:false});
});
APH.Res.assignBeds(B, S.meta.residents, {modern:true});
M.syncResidents();
M.setResidentJob ? null : null;

/* 摘要: 居民/实体/殖民地的可观测状态 */
const crypto = require('crypto');
function digest(){
  const num=v=>+(Number(v)||0).toFixed(4);
  const res = (S.meta.residents||[]).map(r=>({id:r.id,food:num(r.food),rest:num(r.rest),
    mood:num(r.mood),recreation:num(r.recreation),hp:num(r.hp),
    downed:!!r.downed,sleeping:!!r.isSleeping,job:r.job||null,bed:r.bedId||null,
    med:!!r.medLying,illness:num(r.illness),break:r.breakType||null}));
  const ents=(S.entities||[]).filter(e=>e&&!e.dead).map(e=>({t:e.type,x:+(e.x||0).toFixed(3),y:+(e.y||0).toFixed(3),
    id:e.id||null,item:e.itemId||null,n:e.n==null?null:e.n,carry:e.haulCarry?(Array.isArray(e.haulCarry)?e.haulCarry.length:1):0,
    reason:e.workReason||null,gather:!!e.gathering,walking:!!e.walking}))
    .sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  return {rng:rngCalls,weather:(window.APH.Weather&&APH.Weather.currentId)?APH.Weather.currentId(S.meta):null,clock:+S.clock.toFixed(3),stock:JSON.stringify(S.meta.res),residents:res,ents,
    buildings:B.length, ground:(B||[]).filter(b=>b.id==='bl_wall').length};
}
const fixture=digest();
const frames=[];
for (let i=0;i<STEPS;i++){
  S.clock += 1/30;
  M.simStep(1/30);
  if (i<20 || i===STEPS-1 || i%(Math.floor(STEPS/40))===0) frames.push({step:i,d:digest()});
  if (process.env.TRACE_ONE){
    const e=(S.entities||[]).find(x=>x&&x.id===process.env.TRACE_ONE);
    if(e && i>=700 && i<=830) frames.push({step:i,d:{one:{x:e.x,y:e.y,tx:e.tx,ty:e.ty,walking:!!e.walking,
      goal:e.goal||null,pathI:e.pathI==null?null:e.pathI,path:e.path?e.path.length:null,reason:e.workReason||null,
      strollT:+(e.strollT||0).toFixed(4),idleT:+(e.idleT||0).toFixed(4),face:+(e.face||0).toFixed(4)}}});
  }
}
const sample=frames[frames.length-1].d;
if (process.env.TRACE_DUMP) fs.writeFileSync(process.env.TRACE_DUMP, JSON.stringify(frames,null,1));
const hash=crypto.createHash('sha256').update(JSON.stringify(frames)).digest('hex');
console.log(JSON.stringify({root:ROOT,steps:STEPS,hash,fixture,stock:sample.stock,clock:sample.clock,
  entities:sample.ents.length,residentState:sample.residents.map(r=>r.id+':'+r.job+':'+r.food+':'+r.break)}));
