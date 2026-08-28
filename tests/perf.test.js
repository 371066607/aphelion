
/* T1 性能护栏: guardTrim 纯函数(经 DOM 桩加载 main.js) */
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
                'colony.js','rivals.js','events.js','residents.js','combat.js',
                'world.js','entities.js','sfx.js','sprites.js','ui.js','main.js']){
  new Function(fs.readFileSync(path.join(SRC,f),'utf-8'))();
}

// main 未导出 guardTrim → 通过 APH.Main.__perfGuard 暴露? 未暴露则跳过。
// 更稳: 从源码正则提取函数体 eval(纯函数无外部依赖除U/T/CFG) — 不优雅。
// 直接验证行为契约: state.entities 超 cap 后由 frame 循环裁剪不可行(rAF停用),
// 所以这里直接测导出。若无导出则本测试驱动我们补导出。
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

console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail?1:0);
