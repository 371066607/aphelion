/* T1 性能护栏: guardTrim 纯函数 + P1-P3 每帧成本 (经 DOM 桩加载 main.js) */
'use strict';
const fs=require('fs'), path=require('path');
function stubEl(){ return {
  style:{}, classList:{add(){},remove(){}}, textContent:'', innerHTML:'',
  appendChild(){}, addEventListener(){}, querySelector(){return stubEl();},
  getContext(){
    const grad={addColorStop(){}};
    return new Proxy({},{get:function(t,k){
      if(k==='createRadialGradient'||k==='createLinearGradient') return function(){return grad;};
      if(typeof k==='string') return function(){ return undefined; };
      return undefined; }});
  }, width:0, height:0 }; }
global.window=global;
global.localStorage={_m:{},getItem(k){return this._m[k]??null;},setItem(k,v){this._m[k]=String(v);},
  removeItem(k){delete this._m[k];}};
global.document={ _els:{}, getElementById(id){ if(!this._els[id]) this._els[id]=stubEl(); return this._els[id]; },
  createElement(){return stubEl();}, body:stubEl(), addEventListener(){} };
global.addEventListener=function(){};
global.innerWidth=800; global.innerHeight=600;
global.performance={now:()=>Date.now()};
global.requestAnimationFrame=()=>0;
global.location={search:'',reload(){}};
global.Image=class{constructor(){this.width=2048;this.height=256;} set src(v){this._src=v;} get src(){return this._src;}};

let pass=0,fail=0;
function test(name,fn){ try{fn();pass++;console.log('  ✓ '+name);}
  catch(e){fail++;console.log('  ✗ '+name+'\n      '+e.message);} }
const A=(c,m)=>{ if(!c) throw new Error(m||'断言失败'); };

const SRC=path.join(__dirname,'..','src');
for(const f of ['config.js','utils.js','humanoid.js','save.js','planet.js','llm.js',
                'colony.js','rivals.js','events.js','weather.js','nav.js','residents.js','combat.js',
                'world.js','entities.js','sfx.js','sprites.js','ui.js','main.js']){
  new Function(fs.readFileSync(path.join(SRC,f),'utf-8'))();
}

const M = window.APH.Main;
A(typeof M==='object','Main 存在');
if (typeof M.guardTrim!=='function'){
  console.log('  ⚠ guardTrim 未从 Main 导出 —— 需要在 main.js APH.Main 中补导出');
  process.exit(2);   // 特殊退出码: 提示需要接线
}

const T=window.APH.CFG.entType;
test('guardTrim: 未超限返回空', () => {
  const ents=[{id:'a',type:T.DROPPED,x:0,y:0},{id:'b',type:T.ENEMY,x:10,y:10}];
  A(M.guardTrim(ents,0,0,400).length===0);
});
test('guardTrim: 超限回收离玩家最远的可牺牲实体', () => {
  const ents=[
    {id:'near',type:T.DROPPED,x:5,y:5},
    {id:'far',type:T.ENEMY,x:1000,y:1000},
    {id:'player',type:T.PLAYER,x:0,y:0},
    {id:'rock_protected',type:T.ROCK,x:2000,y:2000},   // 岩石不回收
  ];
  const out=M.guardTrim(ents,0,0,3);        // 4→3 删1个
  A(out.length===1,'应删1个');
  A(out[0]==='far','应删最远的敌人, got '+out[0]);
});
test('guardTrim: 大超限时只删可牺牲类型', () => {
  const ents=[];
  for(let i=0;i<50;i++) ents.push({id:'rk'+i,type:T.ROCK,x:i,y:i});
  for(let i=0;i<10;i++) ents.push({id:'dp'+i,type:T.DROPPED,x:i*2,y:i*2});
  const out=M.guardTrim(ents,0,0,45);   // need=15 但可牺牲仅10个 → 删尽10
  A(out.length===10,'可牺牲不足时应删尽(10), got '+out.length);
  out.forEach(id=>A(id.startsWith('dp'),'只应删dropped: '+id));
});

/* P1-P3 每帧成本护栏: 完整殖民地(建筑/居民/房间/家具/陷阱) updateResidents 240 帧 */
test('perf: 完整殖民地 updateResidents 240帧 < 3000ms (P1-P3 叠加后每帧成本)', () => {
  const S=window.APH.state;
  const oldScene=S.scene, oldBuildings=S.colony.buildings, oldEntities=S.entities,
        oldWar=S.war, oldResidents=S.meta.residents;
  try{
    S.scene='home'; S.war={raidActive:false};
    const b=[];
    for(let x=0;x<30;x++){ b.push({id:'bl_wall',x:900+x*48,y:900}); b.push({id:'bl_wall',x:900+x*48,y:2300}); }
    for(let y=0;y<30;y++){ b.push({id:'bl_wall',x:900,y:900+y*48}); b.push({id:'bl_wall',x:2292,y:900+y*48}); }
    for(let i=0;i<10;i++){ b.push({id:'bl_tv',x:960+i*48,y:1000}); b.push({id:'bl_shelf',x:960+i*48,y:1048}); }
    b.push({id:'bl_spike_trap',x:960,y:1100,armed:true});
    b.push({id:'bl_sandbag',x:1008,y:1100});
    b.push({id:'bl_house',x:1050,y:1000});
    S.colony.buildings=b; S.colony.buildQueue=[];
    S.entities=[];
    S.meta.residents=[];
    for(let i=0;i<8;i++){
      S.meta.residents.push({id:'rs_p'+i,name:'居民'+i,job:null,skills:{},mood:70,food:60,illness:0,downed:false,isSleeping:false,rest:80,recreation:80,exposure:0,ailments:[],gear:{}});
    }
    M.syncResidents();
    const t0=Date.now();
    for(let i=0;i<240;i++){ M.updateResidents(0.5); }
    const dt=Date.now()-t0;
    A(dt<3000, '240帧应<3000ms, got '+dt+'ms ('+(dt/240).toFixed(1)+'ms/帧)');
  }finally{
    S.scene=oldScene; S.colony.buildings=oldBuildings; S.entities=oldEntities;
    S.war=oldWar; S.meta.residents=oldResidents;
  }
});

console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail?1:0);
