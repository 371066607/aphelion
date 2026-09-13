'use strict';
if(!window.APH.Ecology) require('../src/ecology.js');
const Ecology=window.APH.Ecology;
const TM=window.APH.TerrainModel;
const T=window.APH.CFG.entType;

function state(seed){
  return {scene:'home',clock:0,_background:true,meta:{residents:[]},colony:{scene:TM.home(seed),buildings:[]},entities:[]};
}
function at(scene, region){
  for(let y=0;y<128;y++) for(let x=0;x<128;x++){
    const px=(x+.5)*48,py=(y+.5)*48;
    if(TM.cellAt(scene,px,py).region===region) return {x:px,y:py};
  }
  throw new Error('没有 '+region+' fixture');
}

test('ecology: 新家园按种子稳定生成约十二只野生动物，重复 seed 不刷重', function(){
  const a=state(77),b=state(77);
  const made=Ecology.seed(a), again=Ecology.seed(a), madeB=Ecology.seed(b);
  if(made.length!==window.APH.CFG.ecology.count || again.length!==0) throw new Error('seed 数量或去重失效');
  const ids=a.entities.map(e=>e.id).sort().join(',');
  if(ids!==b.entities.map(e=>e.id).sort().join(',')) throw new Error('同 seed 动物 id 不稳定');
  if(a.entities.some(e=>!e.wild||e.type!==T.ANIMAL)) throw new Error('野生动物不在统一 animal entities 契约');
  const hp=window.APH.CFG.ecology.hp;
  if(!(hp>0) || a.entities.some(e=>e.hp!==hp||e.maxHp!==hp)) throw new Error('动物血量必须来自 CFG.ecology.hp');
  const legacy={scene:'home',meta:{residents:[]},colony:{scene:TM.legacy(77),buildings:[]},entities:[]};
  if(Ecology.seed(legacy).length) throw new Error('旧档不应生成野生动物');
});

test('ecology: 普通动物避开居民并留下可见行为状态', function(){
  const s=state(9), p=at(s.colony.scene,'woodland');
  const a={id:'grazer',type:T.ANIMAL,wild:true,kind:'grazer',x:p.x,y:p.y,feedCd:0,wanderT:9};
  const r={id:'r1',rid:'r1',type:T.RESIDENT,x:p.x-20,y:p.y};
  s.meta.residents=[{id:'r1',mood:80}];s.entities=[a,r];
  Ecology.tick(s,1);
  if(a.x<=p.x || a.workReason!=='避开居民') throw new Error('普通动物没有逃离靠近的居民');
});

test('ecology: 岩丘护域者先警告，再按冷却伤害并驱离', function(){
  const s=state(11), p=at(s.colony.scene,'ridge');
  const a={id:'guard',type:T.ANIMAL,wild:true,kind:'ridge_guard',x:p.x,y:p.y,feedCd:0,attackCd:0,warningT:0};
  const r={id:'r1',rid:'r1',type:T.RESIDENT,x:p.x-20,y:p.y};
  const colonist={id:'r1',mood:80,illness:0,ailments:[]};s.meta.residents=[colonist];s.entities=[a,r];
  Ecology.tick(s,.1);
  if(!a.warning || colonist.ailments.length) throw new Error('护域者没有先发警告');
  Ecology.tick(s,window.APH.CFG.ecology.guardWarningSeconds+.1);
  if(!colonist.ailments.length || r.workReason!=='被岩丘护域者驱离' || !(a.attackCd>0)) throw new Error('警告结束后未按既有伤害与冷却驱离');
});

test('ecology: 农田旁觅食会消耗成熟作物进度', function(){
  const s=state(13), p=at(s.colony.scene,'woodland');
  const farm={id:'bl_farm',x:p.x+10,y:p.y,plot:{stage:3,t:7}};
  const a={id:'grazer',type:T.ANIMAL,wild:true,kind:'grazer',x:p.x,y:p.y,feedCd:0,wanderT:9};
  s.colony.buildings=[farm];s.entities=[a];
  Ecology.tick(s,.1);
  if(farm.plot.stage!==2 || a.workReason!=='啃食农作物') throw new Error('觅食没有留下成熟农作物的可见代价');
});

test('ecology: 刺激性植物风险有位置边界，采掉或离开后解除',function(){
  const s=state(17),e={id:'alien',type:T.FLORA,x:500,y:500,exposureRisk:true};s.entities=[e];
  if(!Ecology.exposedAt(s,{x:510,y:500})||Ecology.exposedAt(s,{x:800,y:500}))throw new Error('风险没有空间边界');
  e.dead=true;if(Ecology.exposedAt(s,{x:500,y:500}))throw new Error('采空后仍暴露');
});
