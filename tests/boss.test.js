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
for(const f of ['config.js','utils.js','humanoid.js','save.js','planet.js','llm.js',
                'colony.js','rivals.js','events.js','residents.js','alerts.js','combat.js',
                'world.js','entities.js','sfx.js','sprites.js','ui.js','main.js']){
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
/* ---- 阶段E 冒烟: 袭击战术 ---- */
test('阶段E 盗掠者: 偷地上物、不伤玩家、raidStole 计数', () => {
  APH.state.scene='home';
  APH.state.colony={buildings:[]};
  APH.state.hp=100;
  APH.state.war.raidActive=true; APH.state.war.tactic='pillage';
  APH.state.war.stolen=0; APH.state.war.routed=false;
  APH.state.px=600; APH.state.py=600;
  APH.state.entities=[{id:'player',type:T.PLAYER,x:600,y:600}];
  const f=APH.state.spec.enemies.factions[0];
  const en=APH.Ent.makeEnemy(f,600,620);
  en.pillager=true; en.atkCd=0;
  APH.state.entities.push(en);
  APH.state.entities.push({id:'dp_t',type:T.DROPPED,x:602,y:622,itemId:'it_mineral',n:2});
  APH.Combat.updateCombat(0.02,false);
  A(APH.state.hp===100,'盗掠者不应伤玩家');
  A(!APH.state.entities.some(e=>e.type===T.DROPPED),'应偷走地上物');
  A((APH.state.war.stolen||0)>=1,'raidStole 应计数, got '+APH.state.war.stolen);
});
test('阶段E 溃退者: 背向家园撤离并越界消失', () => {
  APH.state.scene='home';
  APH.state.war.raidActive=true; APH.state.war.routed=true;
  APH.state.entities=[{id:'player',type:T.PLAYER,x:0,y:0}];
  const f=APH.state.spec.enemies.factions[0];
  const HAB=APH.CFG.HAB;
  const en=APH.Ent.makeEnemy(f, HAB.x+1020, HAB.y);   // 超 fleeDespawnR=1000
  en.retreat=true;
  APH.state.entities.push(en);
  APH.Combat.updateCombat(0.02,false);
  A(!APH.state.entities.some(e=>e.id===en.id),'越界溃退者应消失');
});
test('阶段E 围攻营地: 弹丸可拆并联动全体溃退', () => {
  APH.state.scene='home';
  APH.state.war.raidActive=true; APH.state.war.routed=false;
  APH.state.war.tactic='siege'; APH.state.war.wave={count:3,waves:1};
  APH.state.entities=[{id:'player',type:T.PLAYER,x:0,y:0}];
  const camp={id:'bl_siege_camp_t',type:T.BUILDING,bid:'bl_siege_camp',
              x:300,y:300,hp:10,maxHp:10};
  APH.state.entities.push(camp);
  let down=0; U.on('siegeCampDown',()=>{down++;});
  APH.state.entities.push(APH.Combat.makeProj(300-8,300,430,0,'player',99999));
  APH.Combat.updateCombat(0.02,false);
  A(down===1,'应触发 siegeCampDown');
  A(!APH.state.entities.some(e=>e.bid==='bl_siege_camp'),'营地应被移除');
  A(APH.state.war.routed===true,'main 溃退联动应置 routed');
});
test('阶段E 围攻营地: 士兵可拆营', () => {
  APH.state.scene='home';
  APH.state.war.raidActive=true; APH.state.war.routed=false;
  APH.state.colony={buildings:[]};
  APH.state.entities=[{id:'player',type:T.PLAYER,x:0,y:0}];
  const camp={id:'bl_siege_camp_s',type:T.BUILDING,bid:'bl_siege_camp',
              x:400,y:300,hp:6,maxHp:10};
  APH.state.entities.push(camp);
  const f=APH.state.spec.enemies.factions[0];
  const sol=APH.Ent.makeEnemy(f, 400, 300);
  sol.isSoldier=true; sol.atkCd=0; sol.hp=40; sol.maxHp=40;
  sol.faction=Object.assign({}, f, {speed:120, dmg:6});
  APH.state.entities.push(sol);
  APH.Combat.updateCombat(0.02,false);
  A(camp.hp<6 || camp.dead, '士兵应打到营地, hp='+camp.hp);
});
test('阶段E 围攻弹丸: 命中建筑停机', () => {
  APH.state.scene='home';
  APH.state.colony={buildings:[{id:'bl_farm',x:400,y:300,offlineT:0}]};
  APH.state.entities=[{id:'player',type:T.PLAYER,x:0,y:0}];
  const p=APH.Combat.makeProj(400-8,300,430,0,'siege',0);
  p.offlineSec=20; p.life=5;
  APH.state.entities.push(p);
  APH.Combat.updateCombat(0.02,false);
  A((APH.state.colony.buildings[0].offlineT||0)>=20, '围攻弹应让建筑停机');
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
