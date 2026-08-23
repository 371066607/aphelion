/* T3 Boss: 击杀守护者掉落≥4件+保底遗件 (DOM桩加载全模块) */
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

let pass=0,fail=0;
function test(name,fn){ try{fn();pass++;console.log('  ✓ '+name);}
  catch(e){fail++;console.log('  ✗ '+name+'\n      '+e.message);} }
const A=(c,m)=>{ if(!c) throw new Error(m||'断言失败'); };

const SRC=path.join(__dirname,'..','src');
for(const f of ['config.js','utils.js','save.js','planet.js','llm.js','combat.js',
                'colony.js','rivals.js','world.js','entities.js','sfx.js','ui.js','main.js']){
  new Function(fs.readFileSync(path.join(SRC,f),'utf-8'))();
}
const APH=window.APH, U=APH.U, T=APH.CFG.entType;

/* 最小运行态 */
APH.state.meta={stats:{scans:0,kills:0,deaths:0},research:0,res:{mineral:0}};
APH.state.spec=APH.Planet.fallbackPlanet(777);
APH.state.seed=777;
APH.state.entities=[{id:'player',type:T.PLAYER,x:0,y:0}];
APH.state.px=0; APH.state.py=0; APH.state.parts=[]; APH.state.carry={};
APH.state.mode='running'; APH.state.iFrameT=0; APH.state.shake=0; APH.state.noiseT=0;
APH.state.war={angerMin:0,raidWarn:0,raidActive:false,wins:0,raids:0};

/* 命中测试的稳定做法:
   敌人 hp 满(不触发flee), 弹丸从敌人正后方8px 以游戏真实速度430发射,
   dt=0.02 → 位移8.6px < 半径14 → 必命中(线段扫描)。dmg 一击致命。 */
test('Boss击杀: 掉落≥4普通+1保底遗件', () => {
  const f=APH.state.spec.enemies.factions[0];
  const boss=APH.Ent.makeEnemy(f, 30, 100);
  boss.isBoss=true; boss.hp=99999; boss.maxHp=99999;
  APH.state.entities.push(boss);
  const bx=boss.x, by=boss.y;
  APH.state.entities.push(APH.Combat.makeProj(bx-8,by,430,0,'player',99999));
  APH.Combat.updateCombat(0.02,false);
  const dropped=APH.state.entities.filter(e=>e.type===T.DROPPED);
  A(dropped.length>=5,'Boss应掉≥5件, got '+dropped.length);
  A(dropped.some(d=>d.itemId==='it_relic'),'应有保底遗件');
});
test('普通敌人: 仍然只掉1件', () => {
  APH.state.entities=[{id:'player',type:T.PLAYER,x:0,y:0}];
  APH.state.parts=[];
  const f=APH.state.spec.enemies.factions[0];
  const en2=APH.Ent.makeEnemy(f, 30, 100);
  en2.hp=9999;
  APH.state.entities.push(en2);
  const ex=en2.x, ey=en2.y;
  APH.state.entities.push(APH.Combat.makeProj(ex-8,ey,430,0,'player',99999));
  APH.Combat.updateCombat(0.02,false);
  const dropped=APH.state.entities.filter(e=>e.type===T.DROPPED);
  A(dropped.length===1,'普通敌应掉1件, got '+dropped.length);
});

console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail?1:0);
