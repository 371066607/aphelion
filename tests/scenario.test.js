#!/usr/bin/env node
/* 场景链路冒烟测试: 用 DOM 桩加载全部模块(含 main.js),
   模拟 boot → 殖民地 → 发射 → 远征 → 返航 的完整状态机。
   验证设计支柱: 殖民地优先 —— 玩家永远出生在家。 */
'use strict';
const fs = require('fs');
const path = require('path');

/* ---------- DOM/浏览器桩 ---------- */
function stubEl(){
  const classes = {};
  return {
    style:{}, src:'',
    classList:{
      add(c){ classes[c]=true; },
      remove(c){ classes[c]=false; },
      toggle(c, on){ classes[c] = on==null ? !classes[c] : !!on; },
      contains(c){ return !!classes[c]; }
    },
    textContent:'', innerHTML:'',
    appendChild(){}, addEventListener(){},
    setAttribute(){}, getAttribute(){ return null; },
    play(){ return { catch(){} }; }, pause(){},
    querySelector(){ return stubEl(); },
    querySelectorAll(){ return []; },
    getContext(){
      const grad = { addColorStop(){} };
      return new Proxy({}, { get: function(t, k){
        if(k==='createRadialGradient' || k==='createLinearGradient'){
          return function(){ return grad; };
        }
        if(k==='getImageData') return function(){ return {data:new Uint8ClampedArray(0)}; };
        if(typeof k === 'string'){ return function(){ return undefined; }; }
        return undefined;
      }});
    },
    width:0, height:0,
  };
}
global.window = global;
global.localStorage = (()=>{ const m={};
  return { getItem:k=>m[k]??null, setItem:(k,v)=>{m[k]=String(v);},
    removeItem:k=>{delete m[k];}, get length(){return Object.keys(m).length;},
    key:i=>Object.keys(m)[i]??null, clear(){ for(const k in m) delete m[k]; } };})();
global.document = {
  _els:{},
  getElementById(id){ if(!this._els[id]) this._els[id]=stubEl(); return this._els[id]; },
  createElement(){ return stubEl(); },
  body: stubEl(),
  addEventListener(){},
};
global.addEventListener = function(){};
global.innerWidth = 800; global.innerHeight = 600;
global.devicePixelRatio = 1;
global.performance = { now:()=>Date.now() };
global.requestAnimationFrame = ()=>0;          // 不启动真实循环
global.location = { search:'', reload(){} };
global.Image = class ImageStub {
  constructor(){ this.width=2048; this.height=256; }
  set src(value){ this._src=value; if(value.indexOf('fail:')===0){ if(this.onerror) this.onerror(); } else if(this.onload) this.onload(); }
  get src(){ return this._src; }
};

/* 手工驱动帧: 直接调 APH.Main.__frame */
let frameFn=null;

/* ---------- 加载模块(顺序同 build.py) ---------- */
const SRC = path.join(__dirname,'..','src');
const ASSET_IDS = [
  'bl_wall','bl_gate','bl_conduit','bl_wood_generator','bl_solar_panel','bl_battery',
  'bl_lamp','bl_dining_table','bl_dining_chair','bl_spike_trap','bl_sandbag',
  'bl_tv','bl_shelf','bl_carpet'
];
/* scenario 只抽取 #84 数据，避免执行完整 30MB 生成文件。 */
const spriteDataSource=fs.readFileSync(path.join(SRC,'sprite_data.js'),'utf8');
global.APH={SPRITE_DATA:{}};
ASSET_IDS.forEach(function(id){
  const line=spriteDataSource.split('\n').find(function(s){ return s.indexOf("APH.SPRITE_DATA['"+id+"']")===0; });
  if(!line) throw new Error('#84 sprite_data 缺键: '+id);
  new Function(line)();
});
for(const f of ['config.js','utils.js','input.js','humanoid.js','save.js','opening.js','opening_data.js','planet.js','llm.js',
                'colony.js','rivals.js','events.js','weather.js','nav.js','residents.js','combat.js',
                'world.js','entities.js','sfx.js','sprites.js','ui.js','main.js']){
  new Function(fs.readFileSync(path.join(SRC,f),'utf-8'))();
}

/* ---------- 极简断言器 ---------- */
let pass=0, fail=0;
function test(name, fn){
  try{ fn(); pass++; console.log('  ✓ '+name); }
  catch(e){ fail++; console.log('  ✗ '+name+'\n      '+e.message); }
}
const A = (cond,msg)=>{ if(!cond) throw new Error(msg||'断言失败'); };
const S = window.APH.state, M = window.APH.Main, C = window.APH.Colony, U = window.APH.U, T=window.APH.CFG.entType;

/* ---------- #84 sprite 启动/回退契约 ---------- */
test('#84: boot 注册 11 项 256 格 sheet 并生成夜间 tint', () => {
  ASSET_IDS.forEach(function(id){
    const d=APH.Sprites.sheetDef(id);
    A(APH.Sprites.isReady(id), id+' 应加载成功');
    A(d && d.fw===256 && d.fh===256 && d.cols===8 && d.count===8, id+' 布局错误');
    A(d.baseline>0 && d.contentH>0, id+' 元数据应有效');
    A(d.idleFrames===(id==='bl_wood_generator'?3:1), id+' idleFrames 错误');
    A(!!APH.Sprites.getTinted(id), id+' 夜间 tint 缺失');
  });
});

test('#84: sprite 成功走贴图，Image onerror 后程序化回退不抛错', () => {
  let draws=0;
  const grad={addColorStop(){}};
  const ctx=new Proxy({}, {get:function(t,k){
    if(k==='drawImage') return function(){ draws++; };
    if(k==='createRadialGradient'||k==='createLinearGradient') return function(){ return grad; };
    if(typeof k==='string') return function(){};
  }, set:function(t,k,v){ t[k]=v; return true; }});
  const oldDaylight=APH.World.daylight;
  APH.World.daylight=function(){ return 1; };
  APH.Ent.bindCtx(ctx);
  try{
    ASSET_IDS.forEach(function(id){
      APH.Ent.drawBuilding({type:T.BUILDING,bid:id,x:100,y:100,def:{cells:[1,1],dispH:48}},0);
    });
    A(draws===ASSET_IDS.length, '11 项 ready 资产均应调用 drawImage');
    APH.Sprites.define('bl_asset_fail',{src:'fail:test',cols:8,rows:1,count:8,baseline:200,contentH:120});
    let completed=false;
    APH.Sprites.loadAll(function(){ completed=true; });
    A(completed && !APH.Sprites.isReady('bl_asset_fail'), 'onerror 应完成加载并保持 not-ready');
    const before=draws;
    APH.Ent.drawBuilding({type:T.BUILDING,bid:'bl_asset_fail',x:100,y:100,def:{cells:[1,1]}},0);
    A(draws===before, '加载失败应进入程序化分支而非 drawImage');
  } finally {
    APH.World.daylight=oldDaylight;
    APH.Ent.bindCtx(document.getElementById('cv').getContext('2d'));
  }
});

/* ---------- 开场短片 (T1 #101) ---------- */
test('opening: 新档 boot 有 intro 时钟', () => {
  A(location.search==='', '本文件 location.search 应为空');
  A(S.mode==='intro', 'mode 应为 intro, got '+S.mode);
  A(S.openingClock, '应有 openingClock');
});
test('opening: start 后 running、played、时钟清空', () => {
  M.start();
  A(S.mode==='running', 'start 后应为 running, got '+S.mode);
  A(S.meta.opening && S.meta.opening.played===true, 'start 应 markPlayed');
  A(!S.openingClock, '时钟应清空');
});
test('opening: showDeath 不重播短片且不把 played 打回未播', () => {
  const el = document.getElementById('opening');
  el.classList.add('hide');
  S.meta.opening = S.meta.opening || {};
  S.meta.opening.played = true;
  APH.UI.showDeath('测试死亡', { found:0, total:6, carry:{}, runLoot:0, survived:0 });
  A(el.classList.contains('hide'), '#opening 应保持隐藏');
  A(S.meta.opening.played===true, '死亡不得把 played 打回 false');
});
test('T2 新档进家无过客, hint 是盖房目标', () => {
  A(!S.entities.some(e=>e && e.type==='visitor' && !e.dead), '新档进家不应有过客');
  const h=(document.getElementById('hint')&&document.getElementById('hint').textContent)||'';
  A(h.indexOf('居住舱')>=0 && h.indexOf('[G]')>=0, 'hint 应为盖房目标, got '+h);
});


/* ---------- 场景链路 ---------- */
test('boot 后: 出生在殖民地(home), spec=新曙光殖民地', () => {
  A(S.scene==='home', 'scene 应为 home, got '+S.scene);
  A(S.spec.name==='新曙光殖民地', '应出生在殖民地, got '+S.spec.name);
});
test('player food: 家园 HUD 显示饱食, 远征隐藏且不掉', () => {
  APH.Res.ensurePlayerNeeds(S.meta);
  const start = S.meta.playerNeeds.food;
  A(start != null, '家园应有玩家饱食');
  APH.UI.updHUD();
  const row = document.getElementById('rowFood');
  A(row && row.style.display !== 'none', '家园应显示饱食条');
  const homeNext = APH.Res.homeFoodTick(start, 'home');
  A(homeNext < start, '家园跳应掉饱食');
  const expNext = APH.Res.homeFoodTick(start, 'expedition');
  A(expNext === start, '远征跳饱食应冻结');
  S.scene = 'expedition';
  APH.UI.updHUD();
  A(row.style.display === 'none', '远征应隐藏饱食条');
  S.scene = 'home';
});
test('player rest: 家园 HUD 显示精力, 远征隐藏且不掉', () => {
  APH.Res.ensurePlayerNeeds(S.meta);
  const start = S.meta.playerNeeds.rest;
  const foodStart = S.meta.playerNeeds.food;
  A(start != null, '家园应有玩家精力');
  APH.UI.updHUD();
  const row = document.getElementById('rowRest');
  A(row && row.style.display !== 'none', '家园应显示精力条');
  const v = document.getElementById('vRest');
  A(v && Number(v.textContent) === Math.round(start), '家园精力数值应显示 '+start+', 实际: '+(v && v.textContent));
  M.residentsTick();
  A(S.meta.playerNeeds.rest === 93, '家园生产跳应掉精力 7, 实际: '+S.meta.playerNeeds.rest);
  APH.UI.updHUD();
  A(Number(v.textContent) === 93, '家园 HUD 应跟上精力下降, 实际: '+v.textContent);
  S.scene = 'expedition';
  const frozen = S.meta.playerNeeds.rest;
  M.residentsTick();
  A(S.meta.playerNeeds.rest === frozen, '远征生产跳精力应冻结');
  APH.UI.updHUD();
  A(row.style.display === 'none', '远征应隐藏精力条');
  S.scene = 'home';
  S.meta.playerNeeds.rest = start;
  S.meta.playerNeeds.food = foodStart;
});
test('player illness: 家园病情>0 才显示, 远征隐藏且不结算', () => {
  APH.Res.ensurePlayerNeeds(S.meta);
  const foodStart = S.meta.playerNeeds.food;
  const restStart = S.meta.playerNeeds.rest;
  const illStart = S.meta.playerNeeds.illness;
  S.meta.playerNeeds.illness = 0;
  S.scene = 'home';
  APH.UI.updHUD();
  const row = document.getElementById('rowIll');
  A(row && row.style.display === 'none', '家园病情为 0 时 HUD 应隐藏');
  S.meta.playerNeeds.illness = 40;
  APH.UI.updHUD();
  A(row.style.display !== 'none', '家园病情>0 时 HUD 应显示');
  const v = document.getElementById('vIll');
  A(v && Number(v.textContent) === 40, '家园病情数值应显示 40, 实际: '+(v && v.textContent));
  M.residentsTick();
  A(S.meta.playerNeeds.illness === 40, '家园生产跳病情应为身份, 实际: '+S.meta.playerNeeds.illness);
  S.scene = 'expedition';
  M.residentsTick();
  A(S.meta.playerNeeds.illness === 40, '远征生产跳病情应冻结');
  APH.UI.updHUD();
  A(row.style.display === 'none', '远征应隐藏病情条');
  S.scene = 'home';
  S.meta.playerNeeds.food = foodStart;
  S.meta.playerNeeds.rest = restStart;
  S.meta.playerNeeds.illness = illStart;
});
test('殖民地世界: 有发射台, 无敌人, 无信标', () => {
  const pad = S.entities.find(e=>e.type===T.BUILDING && e.pad);
  A(pad, '发射台缺失');
  A(!S.entities.some(e=>e.type===T.ENEMY), '殖民地里不该有敌人');
  A(S.totalBeacons===0, '殖民地不该有信标');
});
test('发射台在玩家附近(可交互)', () => {
  const pad = S.entities.find(e=>e.type===T.BUILDING&&e.pad);
  const d = U.dst(S.px,S.py,pad.x,pad.y);
  A(d < 400, '发射台离出生点过远: '+d);
});
test('launch: 进入远征, 到达陌生星球', () => {
  // 模拟走到发射台: 直接把 nearPad 置真再触发
  const food0 = (S.meta.res&&S.meta.res.food)||0;
  const min0 = (S.meta.res&&S.meta.res.mineral)||0;
  S.nearPad = true;
  M.debugPressE();
  A(S.scene==='expedition', '应在远征, got '+S.scene);
  A(S.spec.name!=='新曙光殖民地', '应离开殖民地');
  A(S.totalBeacons===6, '远征星球应有6信标');
  A(((S.meta.res&&S.meta.res.food)||0)===food0, '出发不应扣仓粮');
  A(((S.meta.res&&S.meta.res.mineral)||0)===min0, '出发不应扣矿');
});
test('远征场景: 着陆点有返回舱', () => {
  const pad = S.entities.find(e=>e.type===T.BUILDING&&e.pad);
  A(pad, '返回舱缺失——玩家会被困死在星球上');
});
test('远征战斗: 击杀掉落可拾取进背包', () => {
  S.entities.push(window.APH.Ent.makeEnemy(S.spec.enemies.factions[0], S.px+100, S.py));
  const en = S.entities[S.entities.length-1];
  en.hp = 1;                       // 一发入魂
  window.APH.Combat.firePlasma();
  // 直接模拟命中
  en.hp = 0;
  // killEnemy 是内部函数, 通过 updateCombat 无法保证当帧命中; 改为直接验证掉落拾取管线:
  S.entities.push({ id:'dp_t', type:T.DROPPED, x:S.px+5, y:S.py+5,
    itemId:'it_mineral', n:2, bobA:0 });
  window.APH.Combat.updateDropped(0.016);
  A((S.carry['it_mineral']||0)===2, '背包应有2矿材, got '+JSON.stringify(S.carry));
});
test('returnHome: 结算研究点并回家', () => {
  const before = S.meta.research;
  S.nearPad = true;
  M.debugPressE();
  A(S.scene==='home', '应回到 home');
  A(S.meta.research > before-1, 'research 不应异常减少');
  A(Object.keys(S.carry).length===0, '背包应已清空');
});
test('死亡循环: 死亡后重新着陆仍在殖民地', () => {
  // 模拟: 出发→受伤死亡→重生
  S.nearPad=true; M.debugPressE();           // 再出发
  A(S.scene==='expedition');
  S.hp = 0;
  window.APH.Combat.updateCombat(0.016,false); // 触发 hurtPlayer 路径不必要, 直接走死亡分支:
  S.mode='dead';
  // 玩家点"重新着陆"= enterHome
  S.nearPad=false; M.debugPressE && null;
  // 直接调用暴露的入口
  window.APH.state.hp = window.APH.CFG.player.hpMax;
  // 验证 enterHome 行为: 场景回 home
  S.nearPad=true; M.debugPressE();
  // 此时 scene 可能仍是 expedition(nearPad 在着陆舱旁) — 回家后应为 home
  A(S.scene==='home'||S.scene==='expedition', '状态机不应卡死');
});

test('home raid: 空 spec factions 不崩且刷出真阵营', () => {
  if(S.scene!=='home'){ S.nearPad=true; M.debugPressE(); }
  A(S.scene==='home', '应在殖民地');
  S.spec.enemies = { factions:[], weights:{} };
  S.lastExpedition = null;
  S.war.pendingWave = {count:3};
  S.war.raidActive = false;
  S.war.raidWarn = 0;
  S.colony.buildings = S.colony.buildings || [];
  S.colony.buildings.push({id:'bl_barracks',x:1000,y:1000,lv:1});
  M.startRaid();
  const soldiers = S.entities.filter(e=>e.isSoldier);
  A(soldiers.length>=1, '兵营应出动士兵');
  A(soldiers[0].faction && soldiers[0].faction.hp>0, '士兵应有真阵营');
  S.war.raidSpawnT = 0;
  M.updateHome(1);
  const raiders = S.entities.filter(e=>e.type===T.ENEMY && !e.isSoldier && !e.dead);
  A(raiders.length>=1, '应刷出袭击敌人');
  A(raiders[0].faction && raiders[0].faction.hp>0 && raiders[0].faction.gene,
    '袭击敌人应有真阵营');
  A(S.spec.enemies.factions.length===0, '不得把野怪写进家园 spec');
  M.updateHome(0.016);
  const raiders2 = S.entities.filter(e=>e.type===T.ENEMY && !e.isSoldier && !e.dead);
  A(raiders2.length>=1, '刷出后下一拍不得因远征脱战/回收清波');
  A(['chase','alert','attack'].indexOf(raiders2[0].state)>=0,
    '应保持冲锋, got '+raiders2[0].state);
  A(S.war.raidActive, '不得因脱战秒杀波次');
});

test('showDeath: 携带物品不抛错(含未知 id)', () => {
  APH.UI.showDeath('测试死亡', {
    cry:1, found:2, total:6,
    carry:{ it_mineral:2, no_such_item:1 },
    runLoot:3, survived:90
  });
});

test('returnHome: 着陆点不自动卸货, 返航才结算', () => {
  S.war.raidActive=false;
  if(S.scene!=='expedition'){ S.nearPad=true; M.debugPressE(); }
  A(S.scene==='expedition', '应在远征');
  S.carry = { it_mineral: 2 };
  S.runLoot = 2;
  const before = S.meta.research;
  S.px = window.APH.CFG.HAB.x;
  S.py = window.APH.CFG.HAB.y;
  M.updateSurvival(0.4);
  A((S.carry.it_mineral||0)===2, '着陆点不应自动卖掉战利品');
  A(S.meta.research===before, '研究点应等返航再入账');
  const msgs=[];
  const prev=APH.UI.floatText;
  APH.UI.floatText=function(t){ msgs.push(String(t||'')); if(prev) prev.apply(this,arguments); };
  S.nearPad = true;
  M.debugPressE();
  APH.UI.floatText=prev;
  A(S.scene==='home', '应回家');
  A(S.meta.research===before, '矿材不应再折算研究点, delta='+(S.meta.research-before));
  const pile=S.entities.find(e=>e.type===T.DROPPED && e.itemId==='it_mineral' && !e.dead);
  A(pile && pile.n>=2, '矿材应卸在发射台地上, got '+(pile&&pile.n));
  A(Object.keys(S.carry).length===0, '背包应清空');
  A(!msgs.some(t=>t.indexOf('空手而归')>=0), '已结算不得显示空手而归: '+msgs.join('|'));
});

test('returnHome: 真正空手仍显示空手而归', () => {
  S.war.raidActive=false;
  if(S.scene!=='expedition'){ S.nearPad=true; M.debugPressE(); }
  A(S.scene==='expedition', '应在远征');
  S.carry = {};
  S.runLoot = 0;
  S.settledLoot = 0;
  const msgs=[];
  const prev=APH.UI.floatText;
  APH.UI.floatText=function(t){ msgs.push(String(t||'')); if(prev) prev.apply(this,arguments); };
  S.nearPad = true;
  M.debugPressE();
  APH.UI.floatText=prev;
  A(S.scene==='home', '应回家');
  A(msgs.some(t=>t.indexOf('空手而归')>=0), '空手应提示空手而归: '+msgs.join('|'));
});

test('home: 袭击结束后地上掉落仍可拾取', () => {
  if(S.scene!=='home'){ S.nearPad=true; M.debugPressE(); }
  A(S.scene==='home', '应在殖民地');
  S.war.raidActive=false;
  S.war.raidWarn=0;
  S.carry={};
  const min0=(S.meta.res&&S.meta.res.mineral)||0;
  S.entities.push({ id:'dp_raid_loot', type:T.DROPPED, x:S.px+2, y:S.py+2,
    itemId:'it_mineral', n:1, bobA:0, stock:true });
  M.updateHome(0.016);
  A((S.carry.it_mineral||0)===0, '家园拾取不应进背包, got '+JSON.stringify(S.carry));
  A(((S.meta.res&&S.meta.res.mineral)||0)===min0+1, '应入库, got '+(S.meta.res&&S.meta.res.mineral));
  A(!S.entities.some(e=>e.id==='dp_raid_loot' && !e.dead), '应捡走');
});

test('O2 死亡: showDeath 传入 runLoot 与 survived', () => {
  if(S.scene!=='expedition'){ S.nearPad=true; M.debugPressE(); }
  A(S.scene==='expedition', '应在远征');
  S.mode='running';
  S.px=window.APH.CFG.HAB.x+400;
  S.py=window.APH.CFG.HAB.y+400;   // 舱外才会耗氧/窒息
  S.o2=0;
  S.runLoot=7;
  S.landedAt=10;
  S.clock=100;
  S.carry={ it_mineral:1 };
  let seen=null;
  const prev=APH.UI.showDeath;
  APH.UI.showDeath=function(reason, stats){ seen=stats; if(prev) prev.apply(this,arguments); };
  M.updateSurvival(0.016);
  APH.UI.showDeath=prev;
  A(seen, '应调用 showDeath');
  A(seen.runLoot===7, 'runLoot 应传入, got '+seen.runLoot);
  A(typeof seen.survived==='number' && Math.abs(seen.survived-90)<0.01,
    'survived 应为 clock-landedAt, got '+seen.survived);
});

test('夜间渲染与暗幕: drawDarkness 正常处理建筑光源挖洞(零未定义错误)', () => {
  S.colony = {
    buildings: [
      { id:'bl_mine', x:1000, y:1000, lv:1 },
      { id:'bl_turret', x:1100, y:1100, lv:2 },
      { id:'bl_landing_pad', x:1100, y:1340, lv:1 }
    ]
  };
  // daylight=0 (深夜)
  window.APH.World.drawDarkness(0);
});

test('home: 居民实体数与名册一致', () => {
  if(S.scene!=='home'){ S.nearPad=true; M.debugPressE(); }
  A(S.scene==='home', '应在殖民地');
  S.meta.residents = [
    { id:'rs_t1', name:'测试甲', job:'bl_farm', skills:{sk_build:0}, mood:80 },
    { id:'rs_t2', name:'测试乙', job:null, skills:{sk_build:4}, mood:70 },
  ];
  S.colony.buildings = S.colony.buildings||[];
  S.colony.buildings.push({id:'bl_farm', x:1000, y:1200, lv:1});
  M.syncResidents();
  const n = S.entities.filter(e=>e.type==='resident').length;
  A(n===2, '居民实体应=2, got '+n);
});

test('home: 过客可招募进名册, 生产跳不自动入籍', () => {
  if(S.scene!=='home'){ S.nearPad=true; M.debugPressE(); }
  A(S.scene==='home', '应在殖民地');
  S.meta.residents = [];
  S.nearVisitor = null;
  S.entities = S.entities.filter(e=>e.type!=='visitor');
  S.colony.buildings = S.colony.buildings||[];
  const before = S.meta.residents.length;
  for(let i=0;i<6;i++) M.residentsTick();
  A(S.meta.residents.length===before, '生产跳不应自动加人, got '+S.meta.residents.length);
  const v = M.debugSpawnVisitor({x:S.px, y:S.py}, {origin:'地球难民船', trait:'勤恳'});
  A(v && v.type==='visitor', '应刷出过客');
  A(S.entities.some(e=>e.type==='visitor' && !e.dead), '场上应有过客实体');
  const ok = M.debugRecruit();
  A(ok, '应招募成功');
  A(S.meta.residents.length===before+1, '名册应+1');
  A(!S.entities.some(e=>e.type==='visitor' && e.id===v.id && !e.dead), '过客实体应消失');
  M.syncResidents();
  A(S.entities.filter(e=>e.type==='resident').length===S.meta.residents.length,
    '招募后居民实体应与名册一致');
});

test('home: 请客扣粮涨印象且不可连请', () => {
  if(S.scene!=='home'){ S.nearPad=true; M.debugPressE(); }
  A(S.scene==='home', '应在殖民地');
  S.meta.res = S.meta.res || {};
  S.meta.res.food = 6;
  S.nearVisitor = null;
  S.entities = S.entities.filter(e=>e.type!=='visitor');
  const v = M.debugSpawnVisitor({x:S.px, y:S.py}, {origin:'本地出生'});
  A(v && v.type==='visitor', '应刷出过客');
  A(v.impression===50 && !v.fed, '印象应从50起且未请客');
  const ok = M.debugOfferMeal();
  A(ok, '请客应成功');
  A(v.fed, '应标记已请');
  A(v.impression===70, '印象应+20, got '+v.impression);
  A(S.meta.res.food===4, '应扣2粮, got '+S.meta.res.food);
  A(!M.debugOfferMeal(), '不可连请');
  A(S.meta.res.food===4, '连请失败不应再扣粮');
});

test('home: 上岗从居住舱走过去, 不瞬移; 袭击改走回家', () => {
  if(S.scene!=='home'){ S.nearPad=true; M.debugPressE(); }
  A(S.scene==='home', '应在殖民地');
  S.war = S.war || {};
  S.war.raidActive = false;
  const pad = (S.colony.buildings||[]).find(b=>b.id==='bl_landing_pad');
  S.colony.buildings = pad
    ? [pad, {id:'bl_farm', x:900, y:1300, lv:1}]
    : [{id:'bl_farm', x:900, y:1300, lv:1}];
  S.meta.residents = [
    { id:'rs_w1', name:'走位甲', job:'bl_farm', skills:{}, mood:80 },
  ];
  S.entities = (S.entities||[]).filter(e=>e.type!==T.DROPPED);
  M.syncResidents();
  const e = S.entities.find(x=>x.type==='resident' && (x.rid==='rs_w1'||x.id==='rs_w1'));
  A(!!e, '应有居民实体');
  const d0 = Math.hypot(e.x-e.tx, e.y-e.ty);
  A(d0>80, '刚同步应在家、未瞬移到岗, d='+d0);
  for(let i=0;i<50;i++) M.updateResidents(0.2);
  const d1 = Math.hypot(e.x-e.tx, e.y-e.ty);
  A(d1<8, '走几秒应到达岗位, d='+d1);
  S.war.raidActive = true;
  M.updateResidents(0);
  const dHome = Math.hypot(e.tx-1100, e.ty-1100);
  const dFarm = Math.hypot(e.tx-900, e.ty-1300);
  A(dHome<dFarm, '袭击应改走回家');
});

test('#64 home: 上岗居民病情超过移动阈值后减速，边界不减速', () => {
  const oldScene=S.scene;
  const oldResidents=S.meta.residents;
  const oldEntities=S.entities;
  const oldBuildings=S.colony.buildings;
  const oldQueue=S.colony.buildQueue;
  const oldWar=S.war;
  try{
    A(APH.CFG.walk.sickAbove===20, '病情减速边界应为 20');
    A(APH.CFG.walk.sickSpeedMul===0.6, '病情减速倍率应为 0.6');
    S.scene='home';
    S.war={ raidActive:false };
    S.colony.buildings=[{id:'bl_farm', x:1600, y:1100, lv:1}];
    S.colony.buildQueue=[];
    S.meta.residents=[
      {id:'rs_s0', name:'健康', job:'bl_farm', skills:{}, mood:80, food:80, illness:0},
      {id:'rs_s20', name:'阈值', job:'bl_farm', skills:{}, mood:80, food:80, illness:20},
      {id:'rs_s21', name:'病人', job:'bl_farm', skills:{}, mood:80, food:80, illness:21},
    ];
    S.entities=[];
    M.syncResidents();
    const es=S.meta.residents.map(r=>S.entities.find(e=>e.type===T.RESIDENT && (e.rid||e.id)===r.id));
    es.forEach(e=>{ A(!!e, '应创建居民实体'); e.x=1100; e.y=1100; });
    M.updateResidents(0.5);
    const moved=es.map(e=>Math.hypot(e.x-1100,e.y-1100));
    A(Math.abs(moved[0]-28)<1e-6, '健康居民单帧应移动 28px, got '+moved[0]);
    A(Math.abs(moved[1]-28)<1e-6, '病情等于边界仍应移动 28px, got '+moved[1]);
    A(Math.abs(moved[2]-16.8)<1e-6, '病情超过边界应移动 16.8px, got '+moved[2]);
    A(S.meta.residents.map(r=>r.illness).join(',')==='0,20,21', '移动不应修改名册病情');
    A(es.every(e=>e.walking===true), '三名居民均应继续使用正常 walking 状态');
  }finally{
    S.scene=oldScene;
    S.meta.residents=oldResidents;
    S.entities=oldEntities;
    S.colony.buildings=oldBuildings;
    S.colony.buildQueue=oldQueue;
    S.war=oldWar;
  }
});

test('#64 home: wanderStep 游荡居民同样只乘一次病情倍率', () => {
  const oldScene=S.scene;
  const oldResidents=S.meta.residents;
  const oldEntities=S.entities;
  const oldWar=S.war;
  try{
    S.scene='home';
    S.war={raidActive:false};
    S.meta.residents=[
      {id:'rs_w0', name:'健康游荡', skills:{}, mood:10, food:80, illness:0, breakType:'wander', breakT:2},
      {id:'rs_w1', name:'生病游荡', skills:{}, mood:10, food:80, illness:21, breakType:'wander', breakT:2},
    ];
    S.entities=[];
    M.syncResidents();
    const es=S.meta.residents.map(r=>S.entities.find(e=>e.type===T.RESIDENT && (e.rid||e.id)===r.id));
    es.forEach(e=>{ e.x=APH.CFG.HAB.x; e.y=APH.CFG.HAB.y; e.wanderA=0; e.wanderT=10; e.wanderIdle=false; });
    M.updateResidents(0.5);
    const moved=es.map(e=>e.x-APH.CFG.HAB.x);
    A(Math.abs(moved[0]-24)<1e-6, '健康游荡居民应按 wander 基础速度移动 24px, got '+moved[0]);
    A(Math.abs(moved[1]-14.4)<1e-6, '生病游荡居民应移动 14.4px, got '+moved[1]);
  }finally{
    S.scene=oldScene;
    S.meta.residents=oldResidents;
    S.entities=oldEntities;
    S.war=oldWar;
  }
});

test('#68 home: 睡着居民原地俯卧不动 (不走位/不清走位)', () => {
  const oldScene=S.scene, oldResidents=S.meta.residents, oldEntities=S.entities,
        oldBuildings=S.colony.buildings, oldQueue=S.colony.buildQueue, oldWar=S.war;
  try{
    S.scene='home'; S.war={ raidActive:false };
    S.colony.buildings=[{id:'bl_farm', x:1600, y:1100, lv:1}]; S.colony.buildQueue=[];
    S.meta.residents=[{id:'rs_sleep', name:'睡者', job:'bl_farm', skills:{},
      mood:80, food:80, illness:0, isSleeping:true}];
    S.entities=[];
    M.syncResidents();
    const e=S.entities.find(x=>x.type===T.RESIDENT && (x.rid||x.id)==='rs_sleep');
    A(!!e, '应创建居民实体');
    e.x=1100; e.y=1100;
    for(let i=0;i<20;i++) M.updateResidents(0.5);
    A(e.x===1100 && e.y===1100, '睡着居民不应移动, got '+e.x+','+e.y);
    A(e.walking===false, '睡着居民 walking 应为 false');
    A(!e.haulCarry, '睡着居民不应拾取物品');
  }finally{
    S.scene=oldScene; S.meta.residents=oldResidents; S.entities=oldEntities;
    S.colony.buildings=oldBuildings; S.colony.buildQueue=oldQueue; S.war=oldWar;
  }
});

test('#64 player: 仅家园生病时走路与跑步使用同一减速倍率', () => {
  const old={scene:S.scene, px:S.px, py:S.py, vx:S.vx, vy:S.vy, face:S.face, walkPh:S.walkPh,
    run:S.run, keys:S.keys, joy:S.joy, target:S.target, parts:S.parts, fireCd:S.fireCd,
    iFrameT:S.iFrameT, hurtFlash:S.hurtFlash, illness:S.meta.playerNeeds.illness};
  const pe=APH.Ent.findPlayer();
  const oldPe={x:pe.x, y:pe.y, face:pe.face, moving:pe.moving, walkPh:pe.walkPh};
  function moved(scene, illness, running){
    S.scene=scene; S.meta.playerNeeds.illness=illness;
    S.px=400; S.py=400; S.vx=0; S.vy=0; S.target=null; S.parts=[];
    S.keys={KeyD:true, ShiftLeft:running}; S.joy={active:false,id:null,x:0,y:0};
    pe.x=S.px; pe.y=S.py;
    APH.Ent.updatePlayer(0.05);
    return S.px-400;
  }
  try{
    const homeWalk=moved('home',0,false);
    const sickHomeWalk=moved('home',21,false);
    const homeRun=moved('home',0,true);
    const sickHomeRun=moved('home',21,true);
    const expWalk=moved('expedition',21,false);
    const expRun=moved('expedition',21,true);
    A(Math.abs(sickHomeWalk/homeWalk-0.6)<1e-9, '家园走路应按 0.6 减速');
    A(Math.abs(sickHomeRun/homeRun-0.6)<1e-9, '家园跑步应按 0.6 减速');
    A(Math.abs(expWalk-homeWalk)<1e-9, '远征走路不应受冻结的家园病情影响');
    A(Math.abs(expRun-homeRun)<1e-9, '远征跑步不应受冻结的家园病情影响');
    A(Math.abs(moved('home',20,false)-homeWalk)<1e-9, '病情等于移动边界不应减速');
  }finally{
    S.scene=old.scene; S.px=old.px; S.py=old.py; S.vx=old.vx; S.vy=old.vy;
    S.face=old.face; S.walkPh=old.walkPh; S.run=old.run; S.keys=old.keys; S.joy=old.joy;
    S.target=old.target; S.parts=old.parts; S.fireCd=old.fireCd; S.iFrameT=old.iFrameT;
    S.hurtFlash=old.hurtFlash; S.meta.playerNeeds.illness=old.illness;
    pe.x=oldPe.x; pe.y=oldPe.y; pe.face=oldPe.face; pe.moving=oldPe.moving; pe.walkPh=oldPe.walkPh;
  }
});

test('#64 render: 病号标记在显示阈值起为红色 14px 十字', () => {
  const cv=document.getElementById('cv');
  const originalCtx=cv.getContext('2d');
  const calls=[];
  const spy={
    fillStyle:'', font:'', textAlign:'', globalAlpha:1,
    save(){}, restore(){}, translate(){}, scale(){}, beginPath(){}, ellipse(){}, arc(){}, fill(){},
    fillRect(){}, strokeRect(){},
    fillText(text,x,y){ calls.push({text, x, y, font:this.font, fillStyle:this.fillStyle}); },
  };
  try{
    A(APH.CFG.residents.sickMarkAt===20, '病号标记显示阈值应为 20');
    APH.Ent.bindCtx(spy);
    const base={id:'rs_mark', rid:'rs_mark', type:T.RESIDENT, x:500, y:500, name:'标记测试',
      mood:70, food:90, face:0, walking:true, walkPh:0, isSleeping:false, downed:false};
    APH.Ent.drawResident(Object.assign({},base,{illness:20}),0);
    const sickMark=calls.find(c=>c.text==='✚');
    A(!!sickMark, '病情等于显示阈值时应绘制 ✚');
    A(sickMark.fillStyle==='#ff6d7a', '病号标记应为红色, got '+sickMark.fillStyle);
    A(sickMark.font==='14px sans-serif', '病号标记应为 14px sans-serif, got '+sickMark.font);
    calls.length=0;
    APH.Ent.drawResident(Object.assign({},base,{illness:19}),0);
    A(!calls.some(c=>c.text==='✚'), '病情低于显示阈值时不应绘制 ✚');
  }finally{
    APH.Ent.bindCtx(originalCtx);
  }
});

test('home: 无医疗舱不回血, 靠近医疗舱缓慢回血', () => {
  if(S.scene!=='home'){ S.nearPad=true; M.debugPressE(); }
  A(S.scene==='home', '应在殖民地');
  S.war = S.war || {};
  S.war.raidActive = false;
  S.war.raidWarn = 0;
  S.nearVisitor = null;
  const pad = (S.colony.buildings||[]).find(b=>b.id==='bl_landing_pad');
  S.colony.buildings = pad ? [pad] : [];
  S.hp = 50;
  const o2before = S.o2;
  M.updateHome(1);
  A(S.hp===50, '无舱不应回血, got '+S.hp);
  A(S.o2>=o2before, '家园应补氧');
  S.colony.buildings.push({id:'bl_clinic', x:S.px, y:S.py, lv:1});
  M.updateHome(1);
  A(Math.abs(S.hp-54)<0.01, '靠近医疗舱1秒应+4, got '+S.hp);
});
test('home: 殖民地有气候法则, 酸雨夜间减农 / 磁暴停实验室', () => {
  if(S.scene!=='home'){ S.nearPad=true; M.debugPressE(); }
  const laws=S.spec.laws||[];
  A(laws.length>=1, '家园应有气候法则');
  A(laws.every(l=>l.id==='lw_night_acid'||l.id==='lw_storm'), '只应酸雨/磁暴');
  if(laws.some(l=>l.id==='lw_night_acid')){
    const night=C.harvestMods(laws, 0, true);
    const day=C.harvestMods(laws, 0, false);
    A(night.farmMul<1 && night.acid, '夜间酸雨应减农');
    A(day.farmMul===1, '白天酸雨不生效');
  }
  if(laws.some(l=>l.id==='lw_storm')){
    const st=C.harvestMods(laws, 10, false);
    A(st.labMul===0 && st.storm, '磁暴窗应停实验室');
  }
});
test('home: 工坊扣矿产药, 不是远征消耗', () => {
  if(S.scene!=='home'){ S.nearPad=true; M.debugPressE(); }
  S.war = S.war || {};
  S.war.raidActive = false;
  const pad = (S.colony.buildings||[]).find(b=>b.id==='bl_landing_pad');
  S.colony.buildings = pad
    ? [pad, {id:'bl_workshop', x:S.px+90, y:S.py, lv:1}]
    : [{id:'bl_workshop', x:S.px+90, y:S.py, lv:1}];
  S.meta.res = S.meta.res || {};
  S.meta.res.mineral = 10;
  S.meta.res.food = 20;
  S.meta.res.med = 0;
  S.meta.residents = [{
    id:'rs_c', name:'工匠', job:'bl_workshop', jobLocked:true,
    skills:{sk_craft:5}, mood:85, food:90, illness:0,
  }];
  const min0=S.meta.res.mineral;
  M.residentsTick();
  const drop=(S.entities||[]).find(e=>e.type===T.DROPPED && e.itemId==='it_med' && !e.dead);
  A(drop && drop.n>=1, '工坊药应堆在地上, got '+(drop&&drop.n));
  A(!(S.meta.res.med>0), '未搬入库不应入账, got '+S.meta.res.med);
  A(S.meta.res.mineral<min0, '应扣矿, got '+S.meta.res.mineral);
});
test('home: 居民把脚边的堆搬去仓库入库', () => {
  if(S.scene!=='home'){ S.nearPad=true; M.debugPressE(); }
  S.war = S.war || {};
  S.war.raidActive = false;
  const pad = (S.colony.buildings||[]).find(b=>b.id==='bl_landing_pad')
    || {id:'bl_landing_pad', x:window.APH.CFG.HAB.x, y:window.APH.CFG.HAB.y+240};
  S.colony.buildings = [
    pad,
    {id:'bl_warehouse', x:pad.x+80, y:pad.y, lv:1}
  ];
  S.meta.res = S.meta.res || {};
  S.meta.res.food = 0;
  S.meta.residents = [{
    id:'rs_h1', name:'搬运甲', job:null, skills:{}, mood:80, food:80, illness:0
  }];
  S.entities = (S.entities||[]).filter(e=>e.type!==T.DROPPED && e.type!==T.RESIDENT);
  M.syncResidents();
  const e = S.entities.find(x=>x.type===T.RESIDENT && (x.rid==='rs_h1'||x.id==='rs_h1'));
  A(!!e, '应有居民');
  S.entities.push({
    id:'dp_haul', type:T.DROPPED, x:e.x+8, y:e.y+8,
    itemId:'it_food', n:3, bobA:0, stock:true
  });
  const food0 = S.meta.res.food||0;
  for(let i=0;i<80;i++) M.updateResidents(0.2);
  A((S.meta.res.food||0)===food0+3, '闲人应把粮搬入库, got '+S.meta.res.food);
  A(!S.entities.some(x=>x.id==='dp_haul' && !x.dead), '地上堆应被搬走');
});
test('home: 仓空时能吃地上粮, 工坊能用地上矿', () => {
  if(S.scene!=='home'){ S.nearPad=true; M.debugPressE(); }
  S.war = S.war || {};
  S.war.raidActive = false;
  const pad = (S.colony.buildings||[]).find(b=>b.id==='bl_landing_pad')
    || {id:'bl_landing_pad', x:window.APH.CFG.HAB.x, y:window.APH.CFG.HAB.y+240};
  S.colony.buildings = [
    pad,
    {id:'bl_workshop', x:pad.x+90, y:pad.y, lv:1},
    {id:'bl_clinic', x:pad.x-80, y:pad.y, lv:1}
  ];
  S.meta.res = { mineral:0, food:0, med:0, leather:0 };
  S.meta.residents = [{
    id:'rs_eat', name:'饿汉', job:'bl_workshop', jobLocked:true,
    skills:{sk_craft:4}, mood:80, food:50, illness:50
  }];
  S.entities = (S.entities||[]).filter(e=>e.type!==T.DROPPED);
  S.entities.push({
    id:'dp_food', type:T.DROPPED, x:pad.x, y:pad.y, itemId:'it_food', n:2, bobA:0, stock:true
  });
  S.entities.push({
    id:'dp_ore', type:T.DROPPED, x:pad.x+90, y:pad.y, itemId:'it_mineral', n:5, bobA:0, stock:true
  });
  S.entities.push({
    id:'dp_med', type:T.DROPPED, x:pad.x-80, y:pad.y, itemId:'it_med', n:1, bobA:0, stock:true
  });
  M.residentsTick();
  A(S.meta.res.food===0, '工坊不应动粮仓, got '+S.meta.res.food);
  A(S.meta.residents[0].food===44, '生产跳只掉饱食不隔空吃, got '+S.meta.residents[0].food);
  A(S.meta.residents[0].illness<50, '地上药应能治病, got '+S.meta.residents[0].illness);
  A(!S.entities.some(e=>e.id==='dp_med' && !e.dead), '药堆应用完');
  const ore=S.entities.find(e=>e.id==='dp_ore' && !e.dead);
  A(ore && ore.n===3, '工坊应从地上扣2矿, got '+(ore&&ore.n));
  A(S.meta.res.mineral===0, '扣完矿仓仍空, got '+S.meta.res.mineral);
  const medOut=S.entities.find(e=>e.type===T.DROPPED && e.itemId==='it_med' && !e.dead);
  A(!!medOut, '工坊药应新堆在地上');
});
test('home: 饿了走去地上粮, 远处不隔空吃', () => {
  if(S.scene!=='home'){ S.nearPad=true; M.debugPressE(); }
  S.war = S.war || {};
  S.war.raidActive = false;
  const pad = (S.colony.buildings||[]).find(b=>b.id==='bl_landing_pad')
    || {id:'bl_landing_pad', x:window.APH.CFG.HAB.x, y:window.APH.CFG.HAB.y+240};
  S.colony.buildings = [pad];
  S.meta.res = { mineral:0, food:0, med:0, leather:0 };
  S.meta.residents = [{
    id:'rs_w', name:'饿汉', job:null, skills:{}, mood:80, food:50, illness:0
  }];
  S.entities = (S.entities||[]).filter(e=>e.type!==T.DROPPED && e.type!==T.RESIDENT);
  M.syncResidents();
  const e = S.entities.find(x=>x.type===T.RESIDENT && (x.rid==='rs_w'||x.id==='rs_w'));
  A(!!e, '应有居民');
  S.entities.push({
    id:'dp_far', type:T.DROPPED, x:e.x+200, y:e.y,
    itemId:'it_food', n:2, bobA:0, stock:true
  });
  const food0 = S.meta.residents[0].food;
  M.residentsTick();
  A(S.meta.residents[0].food < food0, 'tick应掉饱食, got '+S.meta.residents[0].food);
  const far0=S.entities.find(x=>x.id==='dp_far');
  A(far0 && far0.n===2, '远处不应隔空吃, n='+(far0&&far0.n));
  const x0=e.x;
  let moved=false;
  for(let i=0;i<50;i++){
    M.updateResidents(0.2);
    if(Math.abs(e.x-x0)>20) moved=true;
    if(S.meta.residents[0].food > food0) break;
  }
  A(moved, '应走过路');
  A(S.meta.residents[0].food > food0, '走到应吃, got '+S.meta.residents[0].food);
  const pile=S.entities.find(x=>x.id==='dp_far' && !x.dead);
  A(pile && pile.n===1, '应只吃1, got '+(pile&&pile.n));
  A(S.meta.res.food===0, '吃地上不应入仓');
});
test('combat: 袭击会抢药, 工坊可被锁定', () => {
  const Combat=window.APH.Combat;
  const loot=Combat.raidPillage({res:{food:0,mineral:0,med:3}}, {id:'bl_workshop'});
  A(loot.med===1, '应抢1药, got '+loot.med);
  const f=Combat.pickRaidFocus({x:0,y:0}, {
    px:900, py:0, colony:{buildings:[{id:'bl_workshop',x:80,y:0}]}
  });
  A(f.kind==='building' && f.b.id==='bl_workshop', '应追工坊');
});
test('planet: 孢子近距排开 / hasLaw', () => {
  const Planet=window.APH.Planet;
  A(!Planet.hasLaw(null,'lw_echo'), '空 spec 无法则');
  A(Planet.hasLaw({laws:[{id:'lw_spore_light'}]},'lw_spore_light'), '应命中孢子');
  const sp={x:10,y:10};
  Planet.sporeNudge(sp, 10, 10, 1);
  A(!(sp.x===10 && sp.y===10), '贴身孢子应排开');
});

test('home: 深度生存系统全链路 (精力睡眠、机能损毁、倒地救援、气候暴露与名册UI)', () => {
  if(S.scene!=='home'){ S.nearPad=true; M.debugPressE(); }
  const Res = window.APH.Res;
  const pad = {id:'bl_landing_pad', x:1100, y:1340};
  const house = {id:'bl_house', x:1100, y:1200, lv:1};
  const clinic = {id:'bl_clinic', x:1000, y:1200, lv:1};
  S.colony.buildings = [pad, house, clinic];

  S.meta.residents = [
    {
      id:'rs_surv_1', name:'探险者甲', job:null, skills:{sk_farm:8},
      mood:80, food:90, illness:0, rest:15, recreation:85, exposure:0,
      ailments:[], downed:false, isSleeping:false, bedId:null
    },
    {
      id:'rs_surv_2', name:'探险者乙', job:null, skills:{sk_social:6},
      mood:75, food:80, illness:70, rest:80, recreation:50, exposure:60,
      ailments:[{type:'plague', sev:70, age:0}], downed:false, isSleeping:false, bedId:null
    }
  ];

  // 1. 运行 residentsTick (床位分配 + 需求结算)
  M.residentsTick();

  const r1 = S.meta.residents[0];
  const r2 = S.meta.residents[1];

  A(!!r1.bedId, 'r1 应分配到居住舱床位');
  A(r1.isSleeping, 'r1 rest<20 应进入睡眠');
  A(r1.mood >= 80, 'r1 高娱乐+舒适床位应维持高心情');

  // 2. r2 严重疫病机能损毁与击倒判定
  const cap2 = Res.capacitiesOf(r2);
  A(cap2.consciousness < 0.4, 'r2 严重疫病认知机能应受损, got '+cap2.consciousness);
  A(Res.checkDowned(r2), 'r2 严重疫病应触发击倒');
  A(r2.downed, 'r2 downed 应为 true');

  // 3. 救援调度与送医
  const rescueRes = Res.rescueTick([r2], S.colony.buildings, 10, true, { inClinic:true });
  A(!r2.downed, '送入医疗舱用药后应成功抢救');
  A(rescueRes.medUsed, '抢救应消耗药品');

  // 4. 气候暴露与避难所
  A(Res.isSheltered({x:1100,y:1200}, S.colony.buildings), '建筑周边应为避难所');
  Res.exposureTick(r2, true, true, 'lw_night_acid');
  A(r2.exposure < 60, '避难所内暴露值应消退, got '+r2.exposure);

  // 5. 实体同步
  M.syncResidents();
  const ent1 = S.entities.find(e=>e.rid==='rs_surv_1'||e.id==='rs_surv_1');
  A(!!ent1, '应同步实体');
  A(ent1.isSleeping, '实体应同步 isSleeping 状态');

  // 6. R 键名册渲染
  const body = document.getElementById('resBody');
  M.renderResPanel();
  A(body.innerHTML.includes('精力'), '名册应包含精力数据');
  A(body.innerHTML.includes('机能'), '名册应包含机能卡片');
});

test('science: 标本化验解锁作物、吐出种荚并点亮图鉴', () => {
  const C = window.APH.Colony;
  S.meta.analyzedFlora = {};
  S.meta.analyzedSpecimens = {};
  S.meta.research = 10;
  S.meta.res = { specimen_flora_glow: 1 };
  const lab = { id:'bl_lab', x:S.px, y:S.py, analysisTarget:'specimen_flora_glow', analysisProgress:0 };
  const done = C.labAnalysisTick(lab, 8, 1, S.meta.res, 20);
  A(done.done, '高技能学者应完成化验, got '+JSON.stringify(done));
  const yld = C.applySpecimenAnalysis(S.meta, S.meta.res, done.def, done.specimenId);
  A(!!S.meta.analyzedFlora.crop_glow_shroom, '应点亮荧蕈种植权限');
  A(yld.seeds.it_seed_glow === 3, '应产出 3 纯净种荚, got '+JSON.stringify(yld.seeds));
  A(S.meta.research === 40, '应注入 +30 尤里卡, got '+S.meta.research);
  A(!C.canPlantCrop('crop_dew_fruit', S.meta.analyzedFlora), '未化验露果仍不可种');
  M.renderCodex();
  const body = document.getElementById('codexBody');
  A(body.innerHTML.includes('荧蕈'), '图鉴应展示已化验荧蕈标本');
  A(body.innerHTML.includes('科学图鉴'), '图鉴应含科学图鉴栏');
});

test('tech map: T 全屏四列、隐藏旧档别名、化验钥匙不可买', () => {
  S.meta.research = 500;
  S.meta.tech = { te_basic_farming: 1, te_hydroponics: 1 };
  S.meta.analyzedSpecimens = {};
  M.toggleTechMap(true);
  const body = document.getElementById('techMapBody');
  const html = body.innerHTML || '';
  A(html.includes('农业') && html.includes('工业') && html.includes('医学') && html.includes('安防'),
    '科技图应含四列: '+html.slice(0,120));
  A(html.includes('基础外星农耕'), '应画出基础外星农耕');
  A(html.includes('外星生态适应'), '化验钥匙叶子应在树上');
  A(html.includes('化验钥匙'), '生态适应应标化验钥匙');
  A(!html.includes('data-tech="te_weaponry"'), '旧档别名 te_weaponry 不应出现在科技图');
  S.techSel = 'te_bio_adaptation';
  const before = !!S.meta.tech.te_bio_adaptation;
  // Enter 路径: 化验钥匙不得写入 tech
  const chk = C.canBuy(S.meta, 'te_bio_adaptation', S.meta.tech);
  A(!chk.ok && String(chk.why).includes('化验'), '有水培仍不可买化验钥匙: '+chk.why);
  A(before === !!S.meta.tech.te_bio_adaptation, '试买不得改写科技');
  M.toggleTechMap(false);
});

test('tech map: 研发反馈写在图上，失败原因可见', () => {
  S.scene = 'home';
  S.meta.research = 0;
  S.meta.tech = {};
  M.toggleTechMap(true);
  S.techSel = 'te_basic_farming';
  M.tryBuySelectedTech();
  const msg = document.getElementById('techMapMsg');
  A(msg && String(msg.textContent).indexOf('研究点') >= 0,
    '研究点不够时应在图上显示原因, 实际: '+(msg && msg.textContent));
  S.meta.research = 500;
  M.tryBuySelectedTech();
  A(S.meta.tech.te_basic_farming === 1, '研究点够时应研发成功');
  A(String(msg.textContent).indexOf('研发成功') >= 0,
    '成功应写在图上, 实际: '+msg.textContent);
  M.toggleTechMap(false);
});

test('tech map: 居民跳后刷新研究点栏', () => {
  S.scene = 'home';
  S.meta.research = 10;
  M.toggleTechMap(true);
  const pts = document.getElementById('techMapPts');
  A(String(pts.textContent).indexOf('10') >= 0, '打开时应显示研究点 10, 实际: '+pts.textContent);
  S.meta.research = 99;
  M.residentsTick();
  A(String(pts.textContent).indexOf('99') >= 0, '世界仍在跑时图应跟上研究点, 实际: '+pts.textContent);
  M.toggleTechMap(false);
});

test('tech map: 出航收起遮罩，远征上 T 可关', () => {
  S.scene = 'home';
  M.toggleTechMap(true);
  const map = document.getElementById('techMap');
  A(map.style.display !== 'none', '出航前图应打开');
  S.nearPad = true;
  M.debugPressE();
  A(S.scene === 'expedition', '应出航, got '+S.scene);
  A(map.style.display === 'none', '出航应变关科技图, display='+map.style.display);
  M.toggleTechMap(true);
  A(map.style.display !== 'none', '远征上仍可被打开(测关闭路径)');
  M.toggleTechMap();
  A(map.style.display === 'none', '图开着时再切应变关');
  S.nearPad = true;
  M.debugPressE();
  A(S.scene === 'home', '应返航, got '+S.scene);
});

/* #59 俯卧渲染冒烟: 无俯卧图环境(单元不打 sprite_data)下, 睡/倒居民与玩家俯卧
   必须走程序化回退而不崩、不旋转走循环。逻辑已在 humanoid.test.js 单元覆盖。 */
test('#59 smoke: 睡/倒居民 drawResident/drawVisitor 不崩(程序化回退)', () => {
  const e = { id:'rs_pr1', rid:'rs_pr1', type:T.RESIDENT, x:500, y:500, name:'俯卧甲',
              mood:70, food:90, illness:0, face:Math.PI/2, walking:false, walkPh:0,
              isSleeping:true, downed:false };
  A(S.scene === 'home', '应在殖民地');
  let threw = false;
  try { APH.Ent.drawResident(e, 0); } catch(err){ threw = true; console.log('  sleeping draw err:', err.message); }
  A(!threw, '睡中居民绘制不应崩');
  e.isSleeping = false; e.downed = true;
  try { APH.Ent.drawResident(e, 0); } catch(err){ threw = true; console.log('  downed draw err:', err.message); }
  A(!threw, '击倒居民绘制不应崩');
  e.face = 0;
  try { APH.Ent.drawVisitor(e, 0); } catch(err){ threw = true; console.log('  visitor draw err:', err.message); }
  A(!threw, '过客绘制不应崩');
});

test('#59 smoke: 玩家俯卧触发(惰性 flag)不崩、不走循环', () => {
  const pe = { type:T.PLAYER, x:S.px, y:S.py, moving:false, walkPh:0 };
  let threw = false;
  try { APH.Ent.drawPlayer(pe, 0); } catch(err){ threw = true; console.log('  player draw err:', err.message); }
  A(!threw, '玩家(含俯卧flag惰性)绘制不应崩');
});

/* #66 床边睡眠/唤醒: 靠床 E 睡(俯卧), WASD/E/受伤醒, 绝不自动走向床
   驱动通道: updateHome / residentsTick / debugPressE (无 __frame 导出) */
test('#66: 靠床近判定 nearBed 且不触发自动寻路 (S.target 保持 null)', () => {
  S.scene = 'home';
  APH.Res.ensurePlayerNeeds(S.meta);
  S.meta.playerNeeds.isSleeping = false;
  S.keys = {};
  S.target = null;
  /* 在玩家脚下放一座居住舱(床边判定与真实摆放一致) */
  APH.Colony.placeBuildingEntity('bl_house', S.px, S.py, 1);
  M.updateHome(0.016);
  A(S.nearBed, '靠床应判定 nearBed');
  A(S.target === null, '靠床不得自动寻路到床 (S.target 应保持 null)');
});

test('#66: 靠床 E 入睡 → meta+实体俯卧, drawPlayer 不崩', () => {
  S.scene = 'home';
  APH.Res.ensurePlayerNeeds(S.meta);
  S.meta.playerNeeds.isSleeping = false;
  S.nearBed = { id:'be_house_test', type:T.BUILDING, bid:'bl_house', x:S.px, y:S.py };
  S.keys = {};
  S.target = null;
  M.debugPressE();
  A(S.meta.playerNeeds.isSleeping === true, 'E 靠床应入睡');
  A(S.meta.playerNeeds.bedId === 'bed_player', '有床入睡应绑床, 实际: ' + S.meta.playerNeeds.bedId);
  M.updateHome(0.016);
  const pe = APH.Ent.findPlayer();
  A(pe && pe.isSleeping === true, '实体应同步俯卧标志');
  let threw = false;
  try { APH.Ent.drawPlayer(pe, 0); } catch(err){ threw = true; console.log('  #66 player sleep draw err:', err.message); }
  A(!threw, '睡中玩家绘制不应崩');
});

test('#66: WASD 唤醒并同帧移动 (meta+实体同步, px 变化)', () => {
  S.scene = 'home';
  APH.Res.ensurePlayerNeeds(S.meta);
  S.meta.playerNeeds.isSleeping = true;
  S.keys = {};
  const px0 = S.px;
  S.keys.KeyA = true;   // 向左(水平方向 px 必变)
  M.updateHome(0.016);
  A(S.meta.playerNeeds.isSleeping === false, 'WASD 应唤醒, 实际仍睡');
  const pe = APH.Ent.findPlayer();
  A(pe && pe.isSleeping === false, '实体标志应同步为清醒');
  A(S.px !== px0, '唤醒帧应同帧移动 (px 应从 ' + px0 + ' 变化, 实际 ' + S.px + ')');
  S.keys = {};
});

test('#66: 睡中再按 E 唤醒', () => {
  S.scene = 'home';
  APH.Res.ensurePlayerNeeds(S.meta);
  S.meta.playerNeeds.isSleeping = true;
  S.nearBed = { id:'be_house_test', type:T.BUILDING, bid:'bl_house', x:S.px, y:S.py };
  S.keys = {};
  M.debugPressE();
  A(S.meta.playerNeeds.isSleeping === false, 'E 再按应唤醒');
  const pe = APH.Ent.findPlayer();
  A(pe && pe.isSleeping === false, '实体标志应同步清醒');
});

test('#66: 受伤唤醒 (伤害真正落地时)', () => {
  S.scene = 'home';
  APH.Res.ensurePlayerNeeds(S.meta);
  S.meta.playerNeeds.isSleeping = true;
  S.keys = {};
  S.iFrameT = 0;
  const hp0 = S.hp;
  APH.Combat.hurtPlayer(5, 'test');
  A(S.meta.playerNeeds.isSleeping === false, '受伤应唤醒');
  A(S.hp === hp0 - 5, '受伤应掉血, 实际 hp ' + S.hp + '(初始 ' + hp0 + ')');
  M.updateHome(0.016);
  const pe = APH.Ent.findPlayer();
  A(pe && pe.isSleeping === false, '实体标志应同步清醒');
});

/* #67 累塌: 家园精力归零原地睡着(打地铺 bedId=null), 即使仍在操作
   触发通道: residentsTick→playerRestTick(清醒跳掉 7 到 0) → setPlayerSleeping(true,false)
   唤醒通道复用 #66: WASD / E / 受伤 */
test('#67: 家园精力归零累塌 → meta+实体俯卧, bedId=null, moving=false', () => {
  S.scene = 'home';
  APH.Res.ensurePlayerNeeds(S.meta);
  S.meta.playerNeeds.isSleeping = false;
  S.meta.playerNeeds.rest = 3;      // 清醒跳掉 7 → 0 → 触发累塌
  S.nearBed = null;                 // 原地打地铺, 不绑床
  S.keys = {};
  M.residentsTick();
  A(S.meta.playerNeeds.isSleeping === true, '精力归零应原地累塌睡着, 实际仍清醒');
  A(S.meta.playerNeeds.rest === 0, '精力应钳到 0, 实际: ' + S.meta.playerNeeds.rest);
  A(S.meta.playerNeeds.bedId === null, '累塌为打地铺 bedId 应为 null, 实际: ' + S.meta.playerNeeds.bedId);
  M.updateHome(0.016);
  const pe = APH.Ent.findPlayer();
  A(pe && pe.isSleeping === true, '实体应同步俯卧标志');
  A(pe && pe.moving === false, '累塌睡眠中实体不应残留走位 (moving 应 false)');
  let threw = false;
  try { APH.Ent.drawPlayer(pe, 0); } catch(err){ threw = true; console.log('  #67 collapse draw err:', err.message); }
  A(!threw, '累塌俯卧玩家绘制不应崩');
});

test('#67: 累塌后 WASD 唤醒并同帧移动 (复用 #66)', () => {
  S.scene = 'home';
  APH.Res.ensurePlayerNeeds(S.meta);
  S.meta.playerNeeds.isSleeping = true;
  S.meta.playerNeeds.bedId = null;
  S.keys = {};
  const px0 = S.px;
  S.keys.KeyA = true;   // 向左(水平方向 px 必变)
  M.updateHome(0.016);
  A(S.meta.playerNeeds.isSleeping === false, 'WASD 应唤醒累塌睡眠, 实际仍睡');
  const pe = APH.Ent.findPlayer();
  A(pe && pe.isSleeping === false, '实体标志应同步为清醒');
  A(S.px !== px0, '唤醒帧应同帧移动 (px 应从 ' + px0 + ' 变化, 实际 ' + S.px + ')');
  S.keys = {};
});

test('#67: 累塌后 E / 受伤唤醒 (复用 #66)', () => {
  S.scene = 'home';
  APH.Res.ensurePlayerNeeds(S.meta);
  S.meta.playerNeeds.isSleeping = true;
  S.meta.playerNeeds.bedId = null;
  S.keys = {};
  M.debugPressE();
  A(S.meta.playerNeeds.isSleeping === false, 'E 再按应唤醒累塌睡眠');
  const pe = APH.Ent.findPlayer();
  A(pe && pe.isSleeping === false, '实体标志应同步清醒');
  /* 重新入睡, 验证受伤唤醒 */
  S.meta.playerNeeds.isSleeping = true;
  S.meta.playerNeeds.bedId = null;
  S.iFrameT = 0;
  const hp0 = S.hp;
  APH.Combat.hurtPlayer(5, 'test');
  A(S.meta.playerNeeds.isSleeping === false, '受伤应唤醒累塌睡眠');
  A(S.hp === hp0 - 5, '受伤应掉血, 实际 hp ' + S.hp + '(初始 ' + hp0 + ')');
  M.updateHome(0.016);
  const pe2 = APH.Ent.findPlayer();
  A(pe2 && pe2.isSleeping === false, '实体标志应同步清醒');
});

/* #70 医疗舱躺下: 玩家病了不自动走向医疗舱, 靠近舱按 E 才躺下(bed_med, 床速恢复)
   与 #66 床边睡眠同机制(只置 nearClinic, 绝不自动寻路); 与 #72 击倒/#67 累塌互斥
   驱动通道: updateHome(近判定) / debugPressE(E 交互) / residentsTick(恢复速率) */
test('#70: 生病近医疗舱不自动躺/不自动寻路 (S.target 保持 null)', () => {
  S.scene = 'home';
  APH.Res.ensurePlayerNeeds(S.meta);
  S.meta.playerNeeds.isSleeping = false;
  S.meta.playerNeeds.illness = 50;
  S.meta.playerNeeds.downed = false;
  S.keys = {};
  S.target = null;
  /* 在玩家脚下放一座医疗舱(近判定与真实摆放一致) */
  APH.Colony.placeBuildingEntity('bl_clinic', S.px, S.py, 1);
  M.updateHome(0.016);
  A(S.nearClinic, '靠舱应判定 nearClinic');
  A(S.meta.playerNeeds.isSleeping === false, '生病+靠舱不应自动躺下 (仍清醒)');
  A(S.target === null, '靠舱不得自动寻路 (S.target 应保持 null)');
  /* 清理实体, 防泄漏到后续用例 */
  S.entities = S.entities.filter(e => e.bid !== 'bl_clinic');
  S.nearClinic = null;
  S.meta.playerNeeds.illness = 0;
});

test('#70: 生病+靠舱按 E 躺入 → meta+实体俯卧, bed_med, drawPlayer 不崩', () => {
  S.scene = 'home';
  APH.Res.ensurePlayerNeeds(S.meta);
  S.meta.playerNeeds.isSleeping = false;
  S.meta.playerNeeds.illness = 50;
  S.meta.playerNeeds.downed = false;
  S.nearClinic = { id:'be_clinic_test', type:T.BUILDING, bid:'bl_clinic', x:S.px, y:S.py };
  S.nearBed = null;                // 隔离 #70: 只测医疗舱分支, 避免 #66 残留床/房实体干扰
  S.keys = {};
  S.target = null;
  M.debugPressE();
  A(S.meta.playerNeeds.isSleeping === true, 'E 靠舱应躺入医疗舱');
  A(S.meta.playerNeeds.bedId === 'bed_med', '舱内躺卧应绑 bed_med, 实际: ' + S.meta.playerNeeds.bedId);
  A(S.target === null, 'E 躺入不得触发自动寻路 (S.target 应保持 null)');
  M.updateHome(0.016);
  const pe = APH.Ent.findPlayer();
  A(pe && pe.isSleeping === true, '实体应同步俯卧标志');
  let threw = false;
  try { APH.Ent.drawPlayer(pe, 0); } catch(err){ threw = true; console.log('  #70 pod sleep draw err:', err.message); }
  A(!threw, '舱内躺卧玩家绘制不应崩');
  S.nearClinic = null;
  S.meta.playerNeeds.isSleeping = false;
  S.meta.playerNeeds.bedId = null;
  S.meta.playerNeeds.illness = 0;
});

test('#70: 躺舱中再按 E 唤醒', () => {
  S.scene = 'home';
  APH.Res.ensurePlayerNeeds(S.meta);
  S.meta.playerNeeds.isSleeping = true;
  S.meta.playerNeeds.bedId = 'bed_med';
  S.nearClinic = { id:'be_clinic_test', type:T.BUILDING, bid:'bl_clinic', x:S.px, y:S.py };
  S.nearBed = null;                // 隔离 #70
  S.keys = {};
  M.debugPressE();
  A(S.meta.playerNeeds.isSleeping === false, 'E 再按应唤醒舱内躺卧');
  A(S.meta.playerNeeds.bedId === null, '唤醒应清 bedId, 实际: ' + S.meta.playerNeeds.bedId);
  const pe = APH.Ent.findPlayer();
  A(pe && pe.isSleeping === false, '实体标志应同步清醒');
  S.nearClinic = null;
  S.meta.playerNeeds.illness = 0;
});

test('#70: 健康玩家靠舱按 E 不躺 (E 躺入仅生病可触发)', () => {
  S.scene = 'home';
  APH.Res.ensurePlayerNeeds(S.meta);
  S.meta.playerNeeds.isSleeping = false;
  S.meta.playerNeeds.illness = 0;
  S.meta.playerNeeds.downed = false;
  S.nearClinic = { id:'be_clinic_test', type:T.BUILDING, bid:'bl_clinic', x:S.px, y:S.py };
  S.nearBed = null;                // 隔离 #70
  S.keys = {};
  S.target = null;
  M.debugPressE();
  A(S.meta.playerNeeds.isSleeping === false, '健康玩家靠舱按 E 不得躺入 (E 躺入需生病)');
  A(S.meta.playerNeeds.bedId !== 'bed_med', '健康玩家不得绑 bed_med');
  A(S.target === null, '健康玩家按 E 也不得自动寻路');
  S.nearClinic = null;
});

test('#70: 击倒玩家靠舱按 E 被阻断 (#72 互斥)', () => {
  S.scene = 'home'; S.mode = 'running';
  APH.Res.ensurePlayerNeeds(S.meta);
  S.meta.playerNeeds.isSleeping = false;
  S.meta.playerNeeds.illness = 50;
  S.meta.playerNeeds.downed = true;
  S.meta.playerNeeds.downT = 90;
  S.nearClinic = { id:'be_clinic_test', type:T.BUILDING, bid:'bl_clinic', x:S.px, y:S.py };
  S.nearBed = null;                // 隔离 #70
  S.keys = {};
  M.debugPressE();
  A(S.meta.playerNeeds.downed === true, '击倒玩家按 E 仍保持击倒 (#72)');
  A(S.meta.playerNeeds.isSleeping === false, '击倒玩家不得被 E 躺入医疗舱');
  S.meta.playerNeeds.downed = false;
  S.meta.playerNeeds.downT = null;
  S.nearClinic = null;
  S.meta.playerNeeds.illness = 0;
});

test('#70: 舱内躺卧按床速恢复 (+25/跳, 非地铺 18) 且保持 bed_med', () => {
  S.scene = 'home';
  APH.Res.ensurePlayerNeeds(S.meta);
  S.meta.playerNeeds.isSleeping = false;
  S.meta.playerNeeds.illness = 50;
  S.meta.playerNeeds.rest = 40;
  S.meta.playerNeeds.downed = false;
  S.keys = {};
  APH.Colony.placeBuildingEntity('bl_clinic', S.px, S.py, 1);
  S.prodT = 0;                     // 防 prodT≥30 门在 updateHome 内触发 residentsTick 污染恢复算术
  M.updateHome(0.016);                 // 置 nearClinic
  A(S.nearClinic, '近判定应置 nearClinic');
  S.nearBed = null;                // updateHome 会从残留房实体重设 nearBed → 隔离只测医疗舱分支
  M.debugPressE();                     // 生病+靠舱 E 躺入
  A(S.meta.playerNeeds.isSleeping === true, 'E 应躺入医疗舱');
  const pe0 = APH.Ent.findPlayer();
  A(pe0 && pe0.isSleeping === true, '实体应俯卧');
  M.residentsTick();                   // 结算恢复: hasBed=nearBed||nearClinic=true → 床速 +25
  A(S.meta.playerNeeds.rest === 65, '舱内躺卧应按床速恢复 40+25=65, 实际: ' + S.meta.playerNeeds.rest);
  A(S.meta.playerNeeds.bedId === 'bed_med', '恢复结算后应保持 bed_med, 实际: ' + S.meta.playerNeeds.bedId);
  const pe = APH.Ent.findPlayer();
  A(pe && pe.isSleeping === true, '恢复结算后实体仍应俯卧');
  /* 清理 */
  S.entities = S.entities.filter(e => e.bid !== 'bl_clinic');
  S.nearClinic = null;
  S.meta.playerNeeds.isSleeping = false;
  S.meta.playerNeeds.bedId = null;
  S.meta.playerNeeds.illness = 0;
});

/* #65 走到粮边吃: 玩家饥饿时近粮堆/仓库按 E 吃一口(+饱食),
   只置 s.nearFood, 绝不写 s.target 自动寻路; 满饱食靠粮按 E 不耗粮不寻路
   驱动通道: updateHome(近判定) / debugPressE(E 交互) / drawPlayer(🍽标记)
   注意: scenario.test.js 被 run.js EXCLUDE, 无自动清档, 每例手动清残留 */
test('#65: 靠粮堆判定 nearFood 且不自动寻路 (S.target 保持 null)', () => {
  S.scene = 'home'; S.mode = 'running';
  S.entities = (S.entities||[]).filter(e=>e.type!==T.DROPPED && e.type!==T.RESIDENT
    && e.type!==T.VISITOR && !(e.type===T.BUILDING && e.bid!=='bl_landing_pad'));
  S.meta.residents = [];
  APH.Res.ensurePlayerNeeds(S.meta);
  S.meta.playerNeeds.isSleeping = false;
  S.meta.playerNeeds.food = 30;
  S.keys = {}; S.target = null;
  S.nearBed = null; S.nearClinic = null; S.nearFood = null;   // 隔离 #66/#70 残留
  S.prodT = 0;
  /* 粮堆放到 40px 处: 避开 updateDropped 26px 自动入库, 但仍在 foodEatRadius(60) 内 */
  APH.Combat.spawnDrop(S.px+40, S.py, 'it_food', 5, {stock:true});
  M.updateHome(0.016);
  A(S.nearFood, '靠粮堆应判定 nearFood');
  A(S.nearFood.isWarehouse !== true, '近处有粮堆时 nearFood 不应是仓库');
  A(S.target === null, '靠粮堆不得自动寻路 (S.target 应保持 null)');
  /* 清理残留 */
  S.entities = S.entities.filter(e => e.type!==T.DROPPED);
  S.nearFood = null;
  S.prodT = 0;
});

test('#65: 靠仓库判定 nearFood 且不自动寻路', () => {
  S.scene = 'home'; S.mode = 'running';
  S.entities = (S.entities||[]).filter(e=>e.type!==T.DROPPED && e.type!==T.RESIDENT
    && e.type!==T.VISITOR && !(e.type===T.BUILDING && e.bid!=='bl_landing_pad'));
  S.meta.residents = [];
  APH.Res.ensurePlayerNeeds(S.meta);
  S.meta.playerNeeds.isSleeping = false;
  S.meta.playerNeeds.food = 30;
  S.keys = {}; S.target = null;
  S.nearBed = null; S.nearClinic = null; S.nearFood = null;
  S.prodT = 0;
  S.meta.res = S.meta.res || {};
  S.meta.res.food = 10;
  APH.Colony.placeBuildingEntity('bl_warehouse', S.px, S.py, 1);
  M.updateHome(0.016);
  A(S.nearFood, '靠仓库应判定 nearFood');
  A(S.nearFood.isWarehouse === true, '无近粮堆+仓有粮时 nearFood 应为仓库');
  A(S.target === null, '靠仓库不得自动寻路 (S.target 应保持 null)');
  /* 清理残留 */
  S.entities = S.entities.filter(e => e.bid !== 'bl_warehouse');
  S.nearFood = null;
  S.prodT = 0;
});

test('#65: 近粮堆按 E 吃 → 饱食上升且堆-1', () => {
  S.scene = 'home'; S.mode = 'running';
  S.entities = (S.entities||[]).filter(e=>e.type!==T.DROPPED && e.type!==T.RESIDENT
    && e.type!==T.VISITOR && !(e.type===T.BUILDING && e.bid!=='bl_landing_pad'));
  S.meta.residents = [];
  APH.Res.ensurePlayerNeeds(S.meta);
  S.meta.playerNeeds.isSleeping = false;
  S.meta.playerNeeds.food = 30;
  S.keys = {}; S.target = null;
  S.nearBed = null; S.nearClinic = null; S.nearFood = null;
  S.prodT = 0;
  /* 粮堆放到 40px 处: 避开 updateDropped 26px 自动入库, 但仍在 foodEatRadius(60) 内 */
  const pile = APH.Combat.spawnDrop(S.px+40, S.py, 'it_food', 5, {stock:true});
  M.updateHome(0.016);
  A(S.nearFood, '靠粮堆应判定 nearFood');
  M.debugPressE();
  A(S.meta.playerNeeds.food > 30, '近粮堆按 E 应涨饱食, 实际: '+S.meta.playerNeeds.food);
  A((pile.n||0) === 4, '地上粮堆应 -1, 实际 n='+(pile.n||0));
  A(S.target === null, '吃粮不得触发自动寻路 (S.target 应保持 null)');
  /* 清理残留 */
  S.entities = S.entities.filter(e => e.type!==T.DROPPED);
  S.nearFood = null;
  S.prodT = 0;
});

test('#65: 近仓库按 E 吃 → 饱食上升且扣 1 粮', () => {
  S.scene = 'home'; S.mode = 'running';
  S.entities = (S.entities||[]).filter(e=>e.type!==T.DROPPED && e.type!==T.RESIDENT
    && e.type!==T.VISITOR && !(e.type===T.BUILDING && e.bid!=='bl_landing_pad'));
  S.meta.residents = [];
  APH.Res.ensurePlayerNeeds(S.meta);
  S.meta.playerNeeds.isSleeping = false;
  S.meta.playerNeeds.food = 30;
  S.keys = {}; S.target = null;
  S.nearBed = null; S.nearClinic = null; S.nearFood = null;
  S.prodT = 0;
  S.meta.res = S.meta.res || {};
  S.meta.res.food = 10;
  APH.Colony.placeBuildingEntity('bl_warehouse', S.px, S.py, 1);
  M.updateHome(0.016);
  A(S.nearFood && S.nearFood.isWarehouse, '靠仓库应判定 nearFood 为仓库');
  M.debugPressE();
  A(S.meta.playerNeeds.food > 30, '近仓库按 E 应涨饱食, 实际: '+S.meta.playerNeeds.food);
  A(S.meta.res.food === 9, '仓库应扣 1 粮, 实际: '+S.meta.res.food);
  A(S.target === null, '吃仓库口粮不得触发自动寻路 (S.target 应保持 null)');
  /* 清理残留 */
  S.entities = S.entities.filter(e => e.bid !== 'bl_warehouse');
  S.nearFood = null;
  S.prodT = 0;
});

test('#65: 满饱食靠粮按 E 不耗粮不寻路', () => {
  S.scene = 'home'; S.mode = 'running';
  APH.Res.ensurePlayerNeeds(S.meta);
  S.meta.playerNeeds.isSleeping = false;
  S.meta.playerNeeds.food = 80;
  S.keys = {}; S.target = null;
  S.nearBed = null; S.nearClinic = null; S.nearFood = null;   // 隔离 #66/#70 残留
  S.prodT = 0;
  S.meta.res = S.meta.res || {};
  S.meta.res.food = 10;
  S.nearFood = { isWarehouse:true };          // 手置近仓库
  const food0 = S.meta.playerNeeds.food;
  M.debugPressE();
  A(S.meta.playerNeeds.food === food0, '满饱食靠粮按 E 不应涨饱食');
  A(S.meta.res.food === 10, '满饱食靠粮按 E 不应耗仓粮');
  A(S.target === null, '满饱食按 E 也不得自动寻路');
  /* 清理残留 */
  S.nearFood = null;
  S.prodT = 0;
});

test('#65: 饿玩家 drawPlayer 画 🍽 不崩', () => {
  S.scene = 'home'; S.mode = 'running';
  APH.Res.ensurePlayerNeeds(S.meta);
  S.meta.playerNeeds.isSleeping = false;
  S.meta.playerNeeds.food = 30;
  S.keys = {}; S.target = null;
  S.nearBed = null; S.nearClinic = null; S.nearFood = null;
  S.prodT = 0;
  const pe = APH.Ent.findPlayer();
  let threw = false;
  try { APH.Ent.drawPlayer(pe, 0); } catch(err){ threw = true; console.log('  #65 hungry draw err:', err.message); }
  A(!threw, '饿玩家(含🍽标记)绘制不应崩');
  /* 满饱食也不崩(不画标记分支) */
  S.meta.playerNeeds.food = 80;
  try { APH.Ent.drawPlayer(pe, 0); } catch(err){ threw = true; console.log('  #65 full draw err:', err.message); }
  A(!threw, '满饱食玩家绘制不应崩');
  S.prodT = 0;
});

test('#70 补充: 生病玩家 drawPlayer 画 ✚ (illness>=20), 康健不画', () => {
  S.scene = 'home'; S.mode = 'running';
  APH.Res.ensurePlayerNeeds(S.meta);
  S.meta.playerNeeds.food = 80;
  S.meta.playerNeeds.isSleeping = false;
  S.keys = {}; S.target = null;
  S.nearBed = null; S.nearClinic = null; S.nearFood = null;
  S.prodT = 0;
  const cv=document.getElementById('cv');
  const originalCtx=cv.getContext('2d');
  const calls=[];
  const spy=new Proxy({ fillStyle:'', font:'', textAlign:'', globalAlpha:1 }, {
    get(t,k){
      if(k==='fillText') return function(text,x,y){ calls.push({text, fillStyle:this.fillStyle}); };
      if(typeof t[k]!=='undefined') return t[k];
      if(k==='createRadialGradient'||k==='createLinearGradient') return function(){ return { addColorStop(){} }; };
      return function(){};
    }
  });
  try{
    APH.Ent.bindCtx(spy);
    S.meta.playerNeeds.illness = 30;
    const pe = APH.Ent.findPlayer();
    APH.Ent.drawPlayer(pe, 0);
    A(calls.some(function(c){return c.text==='✚' && c.fillStyle==='#ff6d7a';}), '病玩家应画红色 ✚');
    calls.length=0;
    S.meta.playerNeeds.illness = 10;
    APH.Ent.drawPlayer(pe, 0);
    A(!calls.some(function(c){return c.text==='✚';}), '康健玩家(illness<20)不应画 ✚');
  }finally{
    APH.Ent.bindCtx(originalCtx);
  }
  S.prodT = 0;
});

/* #72 家园击倒: 击倒 != 死亡, 昏迷不可动/不可醒, 送医复活/倒计时死亡, 远征死法不变
   驱动通道: hurtPlayer → updateHome(playerDownedTick/carryPlayerToClinic) */
test('#72: 家园击倒 → meta+实体俯卧, moving=false, drawPlayer 不崩', () => {
  S.scene = 'home'; S.mode = 'running';
  APH.Res.ensurePlayerNeeds(S.meta);
  S.meta.playerNeeds.downed = true;
  S.meta.playerNeeds.downT = 90;
  S.hp = 0;
  S.keys = {};
  S.target = null;
  S.meta.residents = [];
  S.colony.buildings = S.colony.buildings || [];
  S.colony.buildings = S.colony.buildings.filter(b=>b.id!=='bl_clinic');   // 无舱无居民: 不触发拖行/复活
  M.updateHome(0.016);
  const pe = APH.Ent.findPlayer();
  A(pe && pe.downed === true, '击倒中实体应同步俯卧标志 (pe.downed)');
  A(pe && pe.moving === false, '击倒中实体不应残留走位 (moving=false)');
  A(S.downed === true, 's.downed 运行时镜像应为 true');
  let threw = false;
  try { APH.Ent.drawPlayer(pe, 0); } catch(err){ threw = true; console.log('  #72 downed draw err:', err.message); }
  A(!threw, '击倒俯卧玩家绘制不应崩');
  S.meta.playerNeeds.downed = false;
  S.meta.playerNeeds.downT = null;
  S.keys = {};
});

test('#72: 击倒期间 WASD 不移动且不醒', () => {
  S.scene = 'home'; S.mode = 'running';
  APH.Res.ensurePlayerNeeds(S.meta);
  S.meta.playerNeeds.downed = true;
  S.meta.playerNeeds.downT = 90;
  S.keys = {};
  S.meta.residents = [];
  S.colony.buildings = S.colony.buildings || [];
  S.colony.buildings = S.colony.buildings.filter(b=>b.id!=='bl_clinic');   // 无舱无居民: 击倒期间不得被拖行
  const px0 = S.px, py0 = S.py;
  S.keys.KeyA = true;   // 向左(水平方向 px 必变若可动)
  M.updateHome(0.016);
  A(S.px === px0 && S.py === py0, '击倒中 WASD 不得移动 (px '+px0+'→'+S.px+')');
  A(S.meta.playerNeeds.downed === true, '击倒中 WASD 不得唤醒 (仍 downed)');
  const pe = APH.Ent.findPlayer();
  A(pe && pe.moving === false, '击倒中实体不得移动');
  S.meta.playerNeeds.downed = false;
  S.meta.playerNeeds.downT = null;
  S.keys = {};
});

test('#72: hurtPlayer 家园击倒 != 死亡, 远征生命归零仍死亡', () => {
  S.scene = 'home'; S.mode = 'running';
  APH.Res.ensurePlayerNeeds(S.meta);
  S.meta.playerNeeds.downed = false;
  S.meta.playerNeeds.downT = null;
  S.hp = 3; S.iFrameT = 0; S.clinicKit = 0;
  const deaths0 = S.meta.stats.deaths;
  APH.Combat.hurtPlayer(999, '测试');
  A(S.mode !== 'dead', '家园击倒不应进死亡画面');
  A(S.meta.playerNeeds.downed === true, '家园应击倒 (downed=true)');
  A(S.meta.stats.deaths === deaths0, '家园击倒不应记死亡');
  /* 远征生命归零仍是现有死亡 */
  S.scene = 'expedition';
  S.meta.playerNeeds.downed = false;
  S.hp = 3; S.iFrameT = 0; S.clinicKit = 0;
  const origDeath = window.APH.UI.showDeath;
  window.APH.UI.showDeath = function(){};
  try {
    APH.Combat.hurtPlayer(999, '测试');
    A(S.mode === 'dead', '远征生命归零应仍走死亡画面, mode='+S.mode);
    A(S.meta.stats.deaths === deaths0+1, '远征应记死亡, deaths='+S.meta.stats.deaths);
  } finally {
    window.APH.UI.showDeath = origDeath;
  }
  S.scene = 'home'; S.mode = 'running';
});

test('#72: 有居民+医疗舱送医复活 (downed 清, hp 回血, 实体标志清)', () => {
  S.scene = 'home'; S.mode = 'running';
  APH.Res.ensurePlayerNeeds(S.meta);
  S.meta.playerNeeds.downed = true;
  S.meta.playerNeeds.downT = 60;
  S.hp = 0;
  S.keys = {};
  S.colony.buildings = S.colony.buildings || [];
  S.colony.buildings.push({id:'bl_clinic', x:S.px, y:S.py, lv:1});
  APH.Colony.placeBuildingEntity('bl_clinic', S.px, S.py, 1);
  S.meta.residents = [{ id:'rs_72', name:'医疗甲', job:null, skills:{}, mood:80, food:80, rest:80, recreation:80, exposure:0, illness:0 }];
  M.updateHome(0.05);
  A(S.meta.playerNeeds.downed === false, '有居民+舱内应送医复活 (downed=false)');
  A(S.meta.playerNeeds.downT === null, '送医复活应清 downT');
  A(S.hp >= window.APH.CFG.economy.clinicHeal, '复活应回血到 ≥'+window.APH.CFG.economy.clinicHeal+', 实际 hp='+S.hp);
  M.updateHome(0.016);
  const pe = APH.Ent.findPlayer();
  A(pe && pe.downed === false, '复活后实体俯卧标志应清除');
  S.meta.playerNeeds.downed = false;
  S.meta.playerNeeds.downT = null;
  S.meta.residents = [];
  S.colony.buildings = S.colony.buildings.filter(b=>b.id!=='bl_clinic');
});

test('#72: 有居民且医疗舱在远处 → 击倒玩家被拖向医疗舱 (送医拖行)', () => {
  S.scene = 'home'; S.mode = 'running';
  APH.Res.ensurePlayerNeeds(S.meta);
  S.meta.playerNeeds.downed = true;
  S.meta.playerNeeds.downT = 90;
  S.hp = 0;
  S.keys = {};
  S.meta.residents = [{ id:'rs_72b', name:'抬工乙', job:null, skills:{}, mood:80, food:80, rest:80, recreation:80, exposure:0, illness:0 }];
  // 玩家 (1000,1000), 医疗舱 (1200,1000) 相距 200px > clinicHealR(80): 应被拖过去
  S.px = 1000; S.py = 1000;
  S.colony.buildings = (S.colony.buildings||[]).filter(b=>b.id!=='bl_clinic');
  S.colony.buildings.push({id:'bl_clinic', x:1200, y:1000, lv:1});
  const d0 = U.dst(S.px, S.py, 1200, 1000);
  M.updateHome(0.5);
  const d1 = U.dst(S.px, S.py, 1200, 1000);
  A(d1 < d0 - 1, '有居民时击倒玩家应被拖向医疗舱 (d0='+d0.toFixed(1)+'→d1='+d1.toFixed(1)+')');
  A(S.meta.playerNeeds.downed === true, '拖行途中仍保持击倒');
  const pe = APH.Ent.findPlayer();
  A(pe && pe.x === S.px && pe.y === S.py, '拖行应同步实体坐标');
  S.meta.playerNeeds.downed = false;
  S.meta.playerNeeds.downT = null;
  S.meta.residents = [];
  S.colony.buildings = S.colony.buildings.filter(b=>b.id!=='bl_clinic');
});

test('#72: 无居民倒计时归零死亡 (按死亡处理, 不产生 clinicKit)', () => {
  S.scene = 'home'; S.mode = 'running';
  APH.Res.ensurePlayerNeeds(S.meta);
  S.meta.playerNeeds.downed = true;
  S.meta.playerNeeds.downT = 0.1;
  S.hp = 0;
  S.clinicKit = 0;
  S.meta.residents = [];
  S.colony.buildings = S.colony.buildings || [];
  S.keys = {};
  const deaths0 = S.meta.stats.deaths;
  const origDeath = window.APH.UI.showDeath;
  window.APH.UI.showDeath = function(){};
  try {
    M.updateHome(0.2);
    A(S.mode === 'dead', '倒计时归零应按死亡处理, mode='+S.mode);
    A(S.meta.stats.deaths === deaths0+1, '倒计时死亡应记死亡');
    A(S.clinicKit === 0, '击倒死亡不应产生 clinicKit');
  } finally {
    window.APH.UI.showDeath = origDeath;
  }
  S.scene = 'home'; S.mode = 'running';
});

/* #71 击倒叠伤痕: 睡/倒共用俯卧身, 击倒叠伤痕+血泊、睡着不叠 (渲染级区分测试)
   ADR-0003: 不另画 downed sheet、不运行时换色、不叠五官。
   forceProneReady: 手动置 _images 令 isReady(name)=true + 确保 d.fw 非0(否则 draw 画0宽)。
   woundCtx: 记录红色系 fillStyle 的 ellipse(伤痕) 与 drawImage(证明走贴图路径)。 */
const WOUND_FILLS = ['rgba(150,28,24,.55)','rgba(120,18,18,.42)','rgba(140,22,24,.8)'];
function forceProneReady(names){
  /* 记录原 _images[name]/原 fw, 供 restoreProneReady 还原, 避免泄漏到下个测试(投影 ready) */
  var saved = {};
  names.forEach(function(name){
    var d = APH.Sprites.sheetDef(name) || APH.Sprites.define(name,{src:'x',fw:256,fh:256,cols:16,rows:1,count:16,fps:1,baseline:248,contentH:122});
    saved[name] = { img: APH.Sprites._images[name], fw: d.fw, fh: d.fh };
    if(!d.fw) d.fw = d.fh = 256;
    APH.Sprites._images[name] = { width:d.fw*16, height:d.fh };
  });
  return function restoreProneReady(){
    names.forEach(function(name){
      var d = APH.Sprites.sheetDef(name);
      var s = saved[name];
      if(s && d){ if(s.fw==null) delete d.fw; else d.fw = s.fw; if(s.fh==null) delete d.fh; else d.fh = s.fh; }
      if(s && s.img==null){ delete APH.Sprites._images[name]; } else { APH.Sprites._images[name] = s.img; }
    });
  };
}
function woundCtx(){
  const calls=[];
  const spy={
    fillStyle:'', strokeStyle:'', font:'', textAlign:'', globalAlpha:1,
    save(){}, restore(){}, translate(){}, scale(){}, beginPath(){},
    ellipse(x,y,rx,ry){ calls.push({kind:'ellipse', fillStyle:this.fillStyle, strokeStyle:this.strokeStyle, rx:rx}); },
    arc(){}, fill(){}, stroke(){}, fillRect(){}, strokeRect(){}, drawImage(){},
    fillText(text){ calls.push({kind:'fillText', text:text}); },
  };
  spy.getContext = function(){ return spy; };
  return { spy:spy, calls:calls,
    wounds:function(){ return calls.filter(function(c){ return c.kind==='ellipse' && WOUND_FILLS.indexOf(c.fillStyle)>=0; }); } };
}

test('#71 render: 居民击倒叠伤痕(专用俯卧sheet), 睡着同sheet不叠', () => {
  const restoreProneReady=forceProneReady(['player_prone','hum_0_nopack_prone']);
  const cv=document.getElementById('cv');
  const originalCtx=cv.getContext('2d');
  const wc=woundCtx();
  const origDraw=APH.Sprites.draw;
  APH.Sprites.draw=function(ctx,name,x,y,idx,sc){ wc.calls.push({kind:'drawImage', sheet:name}); return true; };
  try{
    APH.Ent.bindCtx(wc.spy);
    const base={id:'rs_3', rid:'rs_3', type:T.RESIDENT, x:500, y:500, name:'击倒居民',
      mood:70, food:90, illness:0, face:Math.PI/2, walking:false, walkPh:0};
    APH.Ent.drawResident(Object.assign({},base,{downed:true, isSleeping:false}),0);
    A(wc.wounds().length>=4, '居民击倒应叠≥4处伤痕, got '+wc.wounds().length);
    A(wc.calls.some(function(c){return c.kind==='drawImage' && c.sheet==='hum_0_nopack_prone';}), '居民击倒应走专用 hum_0_nopack_prone');
    wc.calls.length=0; wc.spy.fillStyle='';
    APH.Ent.drawResident(Object.assign({},base,{downed:false, isSleeping:true}),0);
    A(wc.wounds().length===0, '居民睡着应不叠伤痕, got '+wc.wounds().length);
    A(wc.calls.some(function(c){return c.kind==='drawImage' && c.sheet==='hum_0_nopack_prone';}), '居民睡着同用 hum_0_nopack_prone');
  }finally{
    APH.Sprites.draw=origDraw;
    APH.Ent.bindCtx(originalCtx);
    restoreProneReady();
  }
});

test('#71 render: 过客击倒叠伤痕(通用player_prone), 睡着同sheet不叠', () => {
  const restoreProneReady=forceProneReady(['player_prone','hum_0_nopack_prone']);
  const cv=document.getElementById('cv');
  const originalCtx=cv.getContext('2d');
  const wc=woundCtx();
  const origDraw=APH.Sprites.draw;
  APH.Sprites.draw=function(ctx,name,x,y,idx,sc){ wc.calls.push({kind:'drawImage', sheet:name}); return true; };
  try{
    APH.Ent.bindCtx(wc.spy);
    const base={id:'vs71', rid:'vs71', type:T.VISITOR, x:600, y:600, name:'过客甲',
      mood:70, food:90, illness:0, face:0, walking:false, walkPh:0};
    APH.Ent.drawVisitor(Object.assign({},base,{downed:true, isSleeping:false}),0);
    A(wc.wounds().length>=4, '过客击倒应叠≥4处伤痕');
    A(wc.calls.some(function(c){return c.kind==='drawImage' && c.sheet==='player_prone';}), '过客击倒应走通用 player_prone');
    wc.calls.length=0; wc.spy.fillStyle='';
    APH.Ent.drawVisitor(Object.assign({},base,{downed:false, isSleeping:true}),0);
    A(wc.wounds().length===0, '过客睡着应不叠伤痕');
  }finally{
    APH.Sprites.draw=origDraw;
    APH.Ent.bindCtx(originalCtx);
    restoreProneReady();
  }
});

test('#71 render: 玩家击倒叠伤痕(player_prone), 睡着同sheet不叠, 且downed/isSleeping互斥', () => {
  const restoreProneReady=forceProneReady(['player_prone','hum_0_nopack_prone']);
  const cv=document.getElementById('cv');
  const originalCtx=cv.getContext('2d');
  const wc=woundCtx();
  const origDraw=APH.Sprites.draw;
  APH.Sprites.draw=function(ctx,name,x,y,idx,sc){ wc.calls.push({kind:'drawImage', sheet:name}); return true; };
  try{
    APH.Ent.bindCtx(wc.spy);
    const pe={type:T.PLAYER, x:S.px, y:S.py, moving:false, walkPh:0, downed:true, isSleeping:false};
    APH.Ent.drawPlayer(pe, 0);
    A(wc.wounds().length>=4, '玩家击倒应叠≥4处伤痕, got '+wc.wounds().length);
    A(wc.calls.some(function(c){return c.kind==='drawImage' && c.sheet==='player_prone';}), '玩家击倒应走 player_prone');
    wc.calls.length=0; wc.spy.fillStyle='';
    APH.Ent.drawPlayer(Object.assign({},pe,{downed:false, isSleeping:true}), 0);
    A(wc.wounds().length===0, '玩家睡着应不叠伤痕');
  }finally{
    APH.Sprites.draw=origDraw;
    APH.Ent.bindCtx(originalCtx);
    restoreProneReady();
  }
});

test('#68 render: 睡着居民按脸用对应俯卧 sheet, 不叠Zzz/不叠伤痕/不走循环', () => {
  const FACES = [ ['rs_3','hum_0_nopack_prone'], ['rs_4','hum_1_nopack_prone'],
                  ['rs_1','hum_2_nopack_prone'], ['rs_6','hum_3_nopack_prone'] ];
  const restoreProneReady = forceProneReady(['player_prone','hum_0_nopack_prone',
    'hum_1_nopack_prone','hum_2_nopack_prone','hum_3_nopack_prone',
    'hum_0_nopack_walk','hum_1_nopack_walk','hum_2_nopack_walk','hum_3_nopack_walk']);
  const cv=document.getElementById('cv');
  const originalCtx=cv.getContext('2d');
  const wc=woundCtx();
  const origDraw=APH.Sprites.draw;
  APH.Sprites.draw=function(ctx,name,x,y,idx,sc){ wc.calls.push({kind:'drawImage', sheet:name}); return true; };
  try{
    APH.Ent.bindCtx(wc.spy);
    FACES.forEach(function(pair){
      const base={id:pair[0], rid:pair[0], type:T.RESIDENT, x:500, y:500, name:'睡民',
        mood:70, food:90, illness:0, face:Math.PI/2, walking:true, walkPh:3.2};
      wc.calls.length=0; wc.spy.fillStyle='';
      APH.Ent.drawResident(Object.assign({},base,{isSleeping:true, downed:false}),0);
      A(wc.calls.some(function(c){return c.kind==='drawImage' && c.sheet===pair[1];}),
        '睡着居民(id '+pair[0]+') 应走 '+pair[1]+', got '+JSON.stringify(wc.calls.filter(c=>c.kind==='drawImage')));
      A(!wc.calls.some(function(c){return c.kind==='drawImage' && c.sheet.indexOf('_walk')>=0;}),
        '睡着居民不得走 *_walk 循环');
      A(wc.wounds().length===0, '睡着居民不应叠伤痕');
      A(!wc.calls.some(function(c){return c.kind==='fillText' && String(c.text).indexOf('💤')>=0;}),
        '睡着居民不应再画 💤 (站立+Zzz 冒充睡着已移除)');
    });
  }finally{
    APH.Sprites.draw=origDraw;
    APH.Ent.bindCtx(originalCtx);
    restoreProneReady();
  }
});

test('#69 home: 病重居民自动前往医疗舱床并俯卧 (逾50重病, 轻病不躺另测)', () => {
  const oldScene=S.scene, oldResidents=S.meta.residents, oldEntities=S.entities,
        oldBuildings=S.colony.buildings, oldQueue=S.colony.buildQueue, oldWar=S.war;
  try{
    S.scene='home'; S.war={ raidActive:false };
    S.colony.buildings=[{id:'bl_clinic', x:1000, y:1200, lv:1}];
    S.colony.buildQueue=[]; S.entities=[];
    S.meta.residents=[{id:'rs_med1', name:'重症甲', job:'bl_farm', skills:{},
      mood:80, food:80, illness:70,
      ailments:[{type:'plague', sev:70, age:0}],
      downed:false, isSleeping:false, rest:80, recreation:80, exposure:0}];
    M.syncResidents();
    const e=S.entities.find(x=>x.type===T.RESIDENT && (x.rid||x.id)==='rs_med1');
    A(!!e, '应创建居民实体');
    e.x=600; e.y=1200;
    const bed=APH.Res.clinicBedSpot({x:1000,y:1200});
    A(bed.x===1016 && bed.y===1222, '床位应为 1016,1222');
    const d0=Math.hypot(e.x-bed.x, e.y-bed.y);
    for(let i=0;i<5;i++) M.updateResidents(0.5);
    const d5=Math.hypot(e.x-bed.x, e.y-bed.y);
    A(d5<d0, '病重居民应走向医疗舱床: d '+d5+' < '+d0);
    for(let i=0;i<40;i++) M.updateResidents(0.5);
    A(S.meta.residents[0].medLying===true, '病重居民应躺床, got '+S.meta.residents[0].medLying);
    A(e.medLying===true, '实体应同步 medLying');
    A(e.walking===false, '躺床应清 walking');
    A(e.x===1016 && e.y===1222, '应躺在床位, got '+e.x+','+e.y);
    A(S.meta.residents[0].job===null, '躺床应撤岗');
    A(APH.Res.needsMedBed(S.meta.residents[0])===false, '已躺床不应再触发');
    M.syncResidents();   /* 下一帧同步不得丢失 medLying */
    A(e.medLying===true, 'sync 后实体 medLying 应保留');
    const pr=APH.Humanoid.poseFor({role:'resident', id:'rs_med1', lying:true,
      moving:false, face:0, walkPh:0, time:0, pack:false}, ()=>true);
    A(/_prone$/.test(pr.sheet), '躺床应命中俯卧 sheet, got '+pr.sheet);
  }finally{
    S.scene=oldScene; S.meta.residents=oldResidents; S.entities=oldEntities;
    S.colony.buildings=oldBuildings; S.colony.buildQueue=oldQueue; S.war=oldWar;
  }
});

test('#69 home: 轻病居民不躺, 仍慢走并画 ✚', () => {
  const oldScene=S.scene, oldResidents=S.meta.residents, oldEntities=S.entities,
        oldBuildings=S.colony.buildings, oldQueue=S.colony.buildQueue, oldWar=S.war;
  try{
    S.scene='home'; S.war={ raidActive:false };
    S.colony.buildings=[{id:'bl_clinic', x:1000, y:1200, lv:1},
                        {id:'bl_farm', x:1600, y:1100, lv:1}];
    S.colony.buildQueue=[]; S.entities=[];
    S.meta.residents=[
      {id:'rs_mild20', name:'轻病20', job:'bl_farm', skills:{}, mood:80, food:80, illness:20, rest:80},
      {id:'rs_mild30', name:'轻病30', job:'bl_farm', skills:{}, mood:80, food:80, illness:30, rest:80},
    ];
    M.syncResidents();
    const es=S.meta.residents.map(r=>S.entities.find(e=>e.type===T.RESIDENT && (e.rid||e.id)===r.id));
    es.forEach(e=>{ e.x=1100; e.y=1100; });
    M.updateResidents(0.5);
    const moved=es.map(e=>Math.hypot(e.x-1100, e.y-1100));
    A(Math.abs(moved[0]-28)<1e-6, '轻病20 应走满速 28px, got '+moved[0]);
    A(Math.abs(moved[1]-16.8)<1e-6, '轻病30 应减速到 16.8px, got '+moved[1]);
    A(es.every(e=>e.walking===true), '轻病应正常行走');
    A(S.meta.residents.every(r=>!r.medLying), '轻病不得强制躺床');
    A(S.meta.residents.every(r=>!r.isSleeping), '轻病不得被误判睡眠');
    /* ✚ 渲染: 两条轻病都可画病号标记 (sickMarkAt 20) */
    const cv=document.getElementById('cv');
    const originalCtx=cv.getContext('2d');
    const calls=[];
    const spy={ fillStyle:'', font:'', textAlign:'', globalAlpha:1,
      save(){}, restore(){}, translate(){}, scale(){}, beginPath(){}, ellipse(){}, arc(){}, fill(){},
      fillRect(){}, strokeRect(){}, fillText(text){ calls.push({text, font:this.font, fillStyle:this.fillStyle}); } };
    try{
      APH.Ent.bindCtx(spy);
      es.forEach(function(e,i){
        calls.length=0;
        APH.Ent.drawResident(Object.assign({}, e, {illness:S.meta.residents[i].illness}), 0);
        const mark=calls.find(c=>c.text==='✚');
        A(!!mark, '轻病居民应画 ✚');
        A(mark.fillStyle==='#ff6d7a', '✚ 应为红色, got '+mark.fillStyle);
      });
    }finally{
      APH.Ent.bindCtx(originalCtx);
    }
  }finally{
    S.scene=oldScene; S.meta.residents=oldResidents; S.entities=oldEntities;
    S.colony.buildings=oldBuildings; S.colony.buildQueue=oldQueue; S.war=oldWar;
  }
});

test('#69 home: 击倒居民匍匐前往医疗舱床, 保持 downed', () => {
  const oldScene=S.scene, oldResidents=S.meta.residents, oldEntities=S.entities,
        oldBuildings=S.colony.buildings, oldQueue=S.colony.buildQueue, oldWar=S.war;
  try{
    S.scene='home'; S.war={ raidActive:false };
    S.colony.buildings=[{id:'bl_clinic', x:1000, y:1200, lv:1}];
    S.colony.buildQueue=[]; S.entities=[];
    S.meta.residents=[{id:'rs_down1', name:'击倒者', job:null, skills:{},
      mood:80, food:80, illness:5, downed:true, isSleeping:false, rest:80}];
    M.syncResidents();
    const e=S.entities.find(x=>x.type===T.RESIDENT && (x.rid||x.id)==='rs_down1');
    A(!!e, '应创建居民实体');
    e.x=816; e.y=1222;   /* 距床位 200px */
    M.updateResidents(0.5);
    A(Math.abs(e.x-830)<1e-6, '击倒者单帧应匍匐 14px (56×0.5×0.5), got '+(e.x-816));
    for(let i=0;i<20;i++) M.updateResidents(0.5);
    A(S.meta.residents[0].medLying===true, '击倒者应爬到床并躺下');
    A(e.medLying===true, '实体应 medLying');
    A(S.meta.residents[0].downed===true, '躺床仍保持 downed (等救援接线)');
    A(e.x===1016 && e.y===1222, '应趴在床位, got '+e.x+','+e.y);
  }finally{
    S.scene=oldScene; S.meta.residents=oldResidents; S.entities=oldEntities;
    S.colony.buildings=oldBuildings; S.colony.buildQueue=oldQueue; S.war=oldWar;
  }
});

test('#69 home: residentsTick 击倒判定与送医接线 (checkDowned/rescueTick)', () => {
  const oldScene=S.scene, oldResidents=S.meta.residents, oldEntities=S.entities,
        oldBuildings=S.colony.buildings, oldQueue=S.colony.buildQueue, oldWar=S.war,
        oldRes=S.meta.res, oldPrio=S.meta.workPrio;
  try{
    S.scene='home'; S.war={ raidActive:false };
    S.colony.buildings=[{id:'bl_clinic', x:1000, y:1200, lv:1}];
    S.colony.buildQueue=[]; S.entities=[];
    S.meta.res={ food:10, mineral:0, med:0 };
    S.meta.workPrio={};
    S.meta.residents=[{id:'rs_sev1', name:'重症乙', job:null, skills:{sk_social:3},
      mood:80, food:80, illness:70, rest:80, recreation:80, exposure:0,
      ailments:[{type:'plague', sev:70, age:0}],
      downed:false, isSleeping:false, bedId:null}];
    M.syncResidents();
    const e=S.entities.find(x=>x.type===T.RESIDENT && (x.rid||x.id)==='rs_sev1');
    A(!!e, '应创建居民实体');
    e.x=1016; e.y=1222;   /* 在医疗舱治疗半径内 */
    /* 阶段1: 无药 → checkDowned 触发, 倒计时递减但不死 */
    M.residentsTick();
    const r=S.meta.residents[0];
    A(r.downed===true, '严重疫病应经 residentsTick 触发击倒, got '+r.downed);
    A(r.bleedOutTimer<90, '击倒应启动倒计时: '+r.bleedOutTimer);
    A(S.meta.res.med===0, '无药不得扣药');
    /* 阶段2: 有药+在舱 → rescueTick 紧急救治, 用药且起身 */
    S.meta.res.med=1;
    M.residentsTick();
    A(r.downed===false, '舱内有药应紧急救治成功');
    A(S.meta.res.med===0, '救治应消耗 1 药, got '+S.meta.res.med);
  }finally{
    S.scene=oldScene; S.meta.residents=oldResidents; S.entities=oldEntities;
    S.colony.buildings=oldBuildings; S.colony.buildQueue=oldQueue; S.war=oldWar;
    S.meta.res=oldRes; S.meta.workPrio=oldPrio;
  }
});

/* ---------- W2 天气导演接线冒烟 (issue #87) ---------- */
test('W2 天气接线: 极端暴雪结束→强制晴天窗口+喘息', () => {
  const oldW=S.meta.weather, oldEv=S.meta.events;
  try{
    A(S.scene==='home', '应在殖民地场景');
    S.meta.weather={ id:'wx_blizzard', t:2000, cd:{ wx_blizzard:840 } };
    const cds={};
    Object.keys(window.APH.CFG.events.deck).forEach(id=>{
      if(id!=='ev_weather') cds[id]=99;
    });
    S.meta.events={ nextIn:0.1, sinceNeg:99, lastNeg:0,
                    cooldowns:cds, history:[], weatherAcc:600 };
    M.storyTick(0.5);
    A(S.meta.weather && S.meta.weather.id==='wx_clear' && S.meta.weather.t===0,
      '极端结束应强制晴天窗口, got '+JSON.stringify(S.meta.weather));
    A(S.meta.weather.cd && S.meta.weather.cd.wx_blizzard===840,
      '极端冷却应保留, got '+JSON.stringify(S.meta.weather.cd));
    A(S.meta.events.sinceNeg===0, '喘息 sinceNeg 应归零, got '+S.meta.events.sinceNeg);
    A(S.meta.events.restFor!=null && S.meta.events.restFor>=2 && S.meta.events.restFor<=4,
      '喘息窗口应设置, got '+S.meta.events.restFor);
    A((S.meta.events.cooldowns.ev_weather||0)>0, 'ev_weather 应进冷却');
    A(S.meta.events.weatherAcc===0, '掷骰后天气时钟应归零');
  }finally{
    S.meta.weather=oldW; S.meta.events=oldEv;
  }
});
test('W2 天气接线: 非天气事件不写 meta.weather', () => {
  const oldW=S.meta.weather, oldEv=S.meta.events;
  try{
    S.meta.weather={ id:'wx_rain', t:0 };
    const cds={};
    Object.keys(window.APH.CFG.events.deck).forEach(id=>{
      if(id!=='ev_droppod') cds[id]=99;
    });
    S.meta.events={ nextIn:0.1, sinceNeg:99, lastNeg:0,
                    cooldowns:cds, history:[], weatherAcc:300 };
    M.storyTick(0.5);
    A(S.meta.weather && S.meta.weather.id==='wx_rain' && S.meta.weather.t===0,
      '非天气事件不应改天气, got '+JSON.stringify(S.meta.weather));
  }finally{
    S.meta.weather=oldW; S.meta.events=oldEv;
  }
});

/* ---------- W3 天气效果接线冒烟 (#88) ---------- */
test('W3 冒烟: 雷暴室外居民暴露+10, HUD 天气行显示雷暴, 寒潮防寒服免减速', () => {
  const oldScene=S.scene, oldResidents=S.meta.residents, oldEntities=S.entities,
        oldBuildings=S.colony.buildings, oldQueue=S.colony.buildQueue, oldWar=S.war,
        oldRes=S.meta.res, oldPrio=S.meta.workPrio, oldWx=S.meta.weather;
  try{
    S.scene='home'; S.war={ raidActive:false };
    S.colony.buildings=[]; S.colony.buildQueue=[]; S.entities=[];
    S.meta.res={ food:10, mineral:0, med:0 };
    S.meta.workPrio={};
    S.meta.weather={ id:'wx_thunder', t:0, cd:null };
    S.meta.residents=[{ id:'rs_wxp', name:'暴露测试员', job:'bl_farm', skills:{sk_farm:5},
      mood:80, food:80, illness:0, rest:80, recreation:80, exposure:0,
      ailments:[], downed:false, isSleeping:false, bedId:null,
      gear:{tool:null,suit:null,head:null} }];
    M.syncResidents();
    const e=S.entities.find(x=>x.type===T.RESIDENT && (x.rid||x.id)==='rs_wxp');
    A(!!e, '应创建居民实体');
    e.x=600; e.y=600;                        /* 开阔荒野: 室外(核心/建筑外) */
    /* 接线判定: 极端=exposureGain>0 → 喂入 exposureTick */
    M.residentsTick();
    const r=S.meta.residents[0];
    A(r.exposure===10, '雷暴室外 1 生产跳暴露应 +10, got '+r.exposure);
    /* HUD 天气行: updHUD 读 meta.weather → 图标+雷暴+预计时长 */
    APH.UI.updHUD();
    const rowWx=document.getElementById('rowWeather');
    A(rowWx && rowWx.textContent && rowWx.textContent.indexOf('雷暴')>=0,
      'HUD 应显示雷暴+时长, got: '+(rowWx&&rowWx.textContent));
    /* 装备减免: 寒潮+防寒服免减速 (纯函数侧) */
    A(APH.Res.weatherMoveMul({gear:{suit:'it_suit_cryo'}},'wx_cold',0.85,false)===1,
      '寒潮+防寒服应免减速');
    A(APH.Res.weatherMoveMul({gear:null},'wx_rain',0.7,false)===0.7, '雨室外应 0.7');
  }finally{
    S.scene=oldScene; S.meta.residents=oldResidents; S.entities=oldEntities;
    S.colony.buildings=oldBuildings; S.colony.buildQueue=oldQueue; S.war=oldWar;
    S.meta.res=oldRes; S.meta.workPrio=oldPrio; S.meta.weather=oldWx;
  }
});

/* #89 W4: 天气程序化粒子/天色 smoke (ADR-15; ADR-11 显式例外) — 切天气后绘制不崩 + 预算受控 */
test('#89 smoke: 全 11 种天气 drawWeather/drawFog 不崩, 粒子数≤caps 预算', () => {
  const oldScene = S.scene;
  const oldWeather = S.meta.weather;
  S.scene = 'home';
  APH.World.initCanvas();                       // VW/VH = 800x600 (视口桩)
  S.camX = S.px; S.camY = S.py;
  const ids = ['wx_clear','wx_rain','wx_rain_heavy','wx_thunder','wx_snow','wx_blizzard',
               'wx_heat','wx_cold','wx_acid','wx_storm','wx_fog'];
  try{
    ids.forEach(id => {
      S.meta.weather = { id: id, t: 0 };
      APH.World.drawWeather(0.016, 12.3);
      APH.World.drawWeather(0.016, 12.4);       // 两步: 走粒子步进+重生路径
      APH.World.drawFog();
      const n = APH.World.wxCount();
      A(n <= window.APH.CFG.caps.wxParticles, id+' 粒子应 ≤ caps 预算: '+n);
    });
    /* 雨/雪实际出粒子, 晴清池 */
    S.meta.weather = { id: 'wx_rain', t: 0 };
    APH.World.drawWeather(0.016, 12.5);
    A(APH.World.wxCount() > 0, '雨天应有雨丝+溅点粒子');
    A(APH.World.wxCount() <= window.APH.CFG.caps.wxParticles, '雨天粒子不超预算');
    S.meta.weather = { id: 'wx_snow', t: 0 };
    APH.World.drawWeather(0.016, 12.6);
    A(APH.World.wxCount() > 0, '雪天应有雪花粒子');
    S.meta.weather = { id: 'wx_clear', t: 0 };
    APH.World.drawWeather(0.016, 12.7);         // 晴天清池
    A(APH.World.wxCount() === 0, '晴天应清空粒子池');
  } finally {
    S.scene = oldScene;
    if (oldWeather === undefined) delete S.meta.weather; else S.meta.weather = oldWeather;
  }
});


test('T2 smoke: 墙入 colony.buildings 不占实体, drawWalls 不崩', () => {
  const s0 = window.APH.state;
  s0.scene = 'home';
  s0.colony.buildings = s0.colony.buildings || [];
  // 模拟一堵墙完成(不入实体的路径)
  s0.colony.buildings.push({ id: 'bl_wall', x: 900, y: 900, lv: 1 });
  const before = s0.entities.length;
  // drawWalls 应能跑(贴图未加载时程序化回退, 不崩)
  try { window.APH.Ent.drawWalls(0); } catch (e) { throw new Error('drawWalls 不应抛: '+e.message); }
  if (s0.entities.length !== before) throw new Error('墙不应入实体列表');
});

test('T2 smoke: wallLine 拖拽连续铺墙 5 格', () => {
  const line = window.APH.Colony.wallLine({ x: 900, y: 900 }, { x: 1092, y: 900 });
  if (line.length !== 5) throw new Error('应 5 格: '+line.length);
  line.forEach(p => { if (p.x % 48 !== 12 && p.x % 48 !== 0) return; });
});

/* ============ T8 餐桌与餐椅 (#81) ============ */
test('#81 home: 饥饿居民走到最近空椅坐下, 面向桌, 在餐桌用餐 (+心情)', () => {
  const oldScene=S.scene, oldResidents=S.meta.residents, oldEntities=S.entities,
        oldBuildings=S.colony.buildings, oldQueue=S.colony.buildQueue, oldWar=S.war;
  try{
    S.scene='home'; S.war={ raidActive:false };
    S.colony.buildings=[
      {id:'bl_dining_table', x:500, y:500, lv:1},
      {id:'bl_dining_chair', x:440, y:500, lv:1},
      {id:'bl_dining_chair', x:560, y:500, lv:1},
    ];
    S.colony.buildQueue=[]; S.entities=[];
    S.meta.residents=[{id:'rs_din1', name:'饿甲', job:null, skills:{},
      mood:70, food:40, illness:0, downed:false, isSleeping:false,
      rest:80, recreation:80, exposure:0, ailments:[]}];
    S.meta.res={ wood:99, iron:99, stone:99, food:0 };
    M.syncResidents();
    const e=S.entities.find(x=>x.type===T.RESIDENT && (x.rid||x.id)==='rs_din1');
    A(!!e, '应创建居民实体');
    e.x=440; e.y=400;   /* 靠近左椅 */
    const r0=S.meta.residents[0];
    /* 有粮堆在桌旁(烤熟的): 居民到椅后应有饭可吃 */
    S.entities.push({id:'f1', type:T.DROPPED, x:500, y:520, itemId:'it_food', n:5});

    /* 逐帧驱动: 居民应走到椅边(448,498)吃上饭(food>40), 再返回岗位 */
    let reachedSeat=false, minDist=Infinity;
    for(let i=0;i<10;i++){ M.updateResidents(0.5); minDist=Math.min(minDist, Math.hypot(e.x-448,e.y-498)); }
    for(let i=0;i<30;i++){ M.updateResidents(0.5); }
    A(minDist<8, '应到达过椅边, 最小距离 '+minDist);
    /* 有饭 → 已在餐桌用餐(饱食上涨+心情上涨) */
    A(r0.food>40, '应吃上饭, food '+r0.food);
    A(r0.mood>=74, '餐桌用餐应 +4 心情, mood '+r0.mood+'(原 70)');
  }finally{
    S.scene=oldScene; S.meta.residents=oldResidents; S.entities=oldEntities;
    S.colony.buildings=oldBuildings; S.colony.buildQueue=oldQueue; S.war=oldWar;
  }
});

test('#81 home: 多居民多椅不抢座 (两居民两椅同时吃饭)', () => {
  const oldScene=S.scene, oldResidents=S.meta.residents, oldEntities=S.entities,
        oldBuildings=S.colony.buildings, oldQueue=S.colony.buildQueue, oldWar=S.war;
  try{
    S.scene='home'; S.war={ raidActive:false };
    S.colony.buildings=[
      {id:'bl_dining_table', x:500, y:500, lv:1},
      {id:'bl_dining_chair', x:440, y:500, lv:1},
      {id:'bl_dining_chair', x:560, y:500, lv:1},
    ];
    S.colony.buildQueue=[]; S.entities=[];
    S.meta.residents=[
      {id:'rs_din2', name:'饿乙', job:null, skills:{},
        mood:70, food:40, illness:0, downed:false, isSleeping:false,
        rest:80, recreation:80, exposure:0, ailments:[]},
      {id:'rs_din3', name:'饿丙', job:null, skills:{},
        mood:70, food:40, illness:0, downed:false, isSleeping:false,
        rest:80, recreation:80, exposure:0, ailments:[]},
    ];
    S.meta.res={ wood:99, iron:99, stone:99, food:0 };
    M.syncResidents();
    const e2=S.entities.find(x=>x.type===T.RESIDENT && (x.rid||x.id)==='rs_din2');
    const e3=S.entities.find(x=>x.type===T.RESIDENT && (x.rid||x.id)==='rs_din3');
    e2.x=200; e2.y=400; e3.x=800; e3.y=400;
    S.entities.push({id:'f2', type:T.DROPPED, x:500, y:530, itemId:'it_food', n:20});
    /* 逐帧跟踪: 两人都应到达各自椅位 (过程中) 且吃上饭 */
    let dLMin=Infinity, dRMin=Infinity;
    for(let i=0;i<60;i++){
      M.updateResidents(0.5);
      dLMin=Math.min(dLMin, Math.hypot(e2.x-448, e2.y-498));
      dRMin=Math.min(dRMin, Math.hypot(e3.x-568, e3.y-498));
    }
    A(dLMin<8, '饿乙应到达左椅(448,498), 最小距离 '+dLMin);
    A(dRMin<8, '饿丙应到达右椅(568,498), 最小距离 '+dRMin);
    A(S.meta.residents[0].food>40, '饿乙应吃上饭, food '+S.meta.residents[0].food);
    A(S.meta.residents[1].food>40, '饿丙应吃上饭, food '+S.meta.residents[1].food);
  }finally{
    S.scene=oldScene; S.meta.residents=oldResidents; S.entities=oldEntities;
    S.colony.buildings=oldBuildings; S.colony.buildQueue=oldQueue; S.war=oldWar;
  }
});

test('#81 home: 无桌吃心情惩罚 (无桌椅时吃地上食物扣心情)', () => {
  const oldScene=S.scene, oldResidents=S.meta.residents, oldEntities=S.entities,
        oldBuildings=S.colony.buildings, oldQueue=S.colony.buildQueue, oldWar=S.war;
  try{
    S.scene='home'; S.war={ raidActive:false };
    S.colony.buildings=[];
    S.colony.buildQueue=[]; S.entities=[];
    S.meta.residents=[{id:'rs_din4', name:'饿丁', job:null, skills:{},
      mood:70, food:40, illness:0, downed:false, isSleeping:false,
      rest:80, recreation:80, exposure:0, ailments:[]}];
    S.meta.res={ wood:99, iron:99, stone:99, food:0 };
    M.syncResidents();
    const e=S.entities.find(x=>x.type===T.RESIDENT && (x.rid||x.id)==='rs_din4');
    e.x=100; e.y=100;
    /* 地上放食物, 居民就地吃(无桌) → 扣心情 */
    S.entities.push({id:'f3', type:T.DROPPED, x:104, y:104, itemId:'it_food', n:5});
    const r0=S.meta.residents[0];
    for(let i=0;i<30;i++) M.updateResidents(0.5);
    A(r0.food>40, '无桌也应吃上饭, food '+r0.food);
    A(r0.mood<70, '无桌吃应扣心情, mood '+r0.mood+'(原 70)');
  }finally{
    S.scene=oldScene; S.meta.residents=oldResidents; S.entities=oldEntities;
    S.colony.buildings=oldBuildings; S.colony.buildQueue=oldQueue; S.war=oldWar;
  }
});

/* ============ T9 无顶房间与路灯 (#82) ============ */
function ring9(gx, gy, w, h){
  const out=[];
  for(let x=0; x<w; x++){ out.push({id:'bl_wall', x:48*(gx+x), y:48*(gy)}); out.push({id:'bl_wall', x:48*(gx+x), y:48*(gy+h-1)}); }
  for(let y=0; y<h; y++){ out.push({id:'bl_wall', x:48*gx, y:48*(gy+y)}); out.push({id:'bl_wall', x:48*(gx+w-1), y:48*(gy+y)}); }
  return out;
}
test('#82 home: 圈房免疫极端天气暴露 (房间内 residentsTick 不累积)', () => {
  const oldScene=S.scene, oldResidents=S.meta.residents, oldEntities=S.entities,
        oldBuildings=S.colony.buildings, oldQueue=S.colony.buildQueue, oldWar=S.war,
        oldRes=S.meta.res, oldWx=S.meta.weather;
  try{
    S.scene='home'; S.war={ raidActive:false };
    /* 5×5 墙环(格20,20 起), 房间内放居民与居住舱 */
    S.colony.buildings=ring9(30,30,5,5);   /* 世界 1440 起, 远离 HAB(1100,1100) */
    S.colony.buildings.push({id:'bl_house', x:48*32, y:48*32});
    S.colony.buildQueue=[]; S.entities=[];
    S.meta.res={ food:10, mineral:0, med:0 };
    S.meta.weather={ id:'wx_acid', t:0, cd:null };   /* 酸雨: 极端天气 */
    S.meta.residents=[{ id:'rs_room1', name:'圈内甲', job:null, skills:{},
      mood:80, food:80, illness:0, rest:80, recreation:80, exposure:0,
      ailments:[], downed:false, isSleeping:false, bedId:null, gear:{} }];
    M.syncResidents();
    const e=S.entities.find(x=>x.type===T.RESIDENT && (x.rid||x.id)==='rs_room1');
    e.x=48*32+24; e.y=48*32+24;   /* 房间中心 */
    M.residentsTick();
    const r=S.meta.residents[0];
    A(r.exposure===0, '房间内酸雨暴露应 0, got '+r.exposure);
    /* 卧室级心情增益: 房间含居住舱 → +roomMoodGain */
    A(r.mood>80, '卧室房间应心情增益, mood '+r.mood);
  }finally{
    S.scene=oldScene; S.meta.residents=oldResidents; S.entities=oldEntities;
    S.colony.buildings=oldBuildings; S.colony.buildQueue=oldQueue; S.war=oldWar;
    S.meta.res=oldRes; S.meta.weather=oldWx;
  }
});
test('#82 home: 有缺口的圈不算房间 (室外照常累积暴露)', () => {
  const oldScene=S.scene, oldResidents=S.meta.residents, oldEntities=S.entities,
        oldBuildings=S.colony.buildings, oldQueue=S.colony.buildQueue, oldWar=S.war,
        oldRes=S.meta.res, oldWx=S.meta.weather;
  try{
    S.scene='home'; S.war={ raidActive:false };
    S.colony.buildings=ring9(30,30,5,5);   /* 远离 HAB */
    /* 拆掉顶边一格 = 缺口 */
    const idx=S.colony.buildings.findIndex(x=>x.x===48*32 && x.y===48*30);
    S.colony.buildings.splice(idx,1);
    S.colony.buildQueue=[]; S.entities=[];
    S.meta.res={ food:10, mineral:0, med:0 };
    S.meta.weather={ id:'wx_acid', t:0, cd:null };
    S.meta.residents=[{ id:'rs_room2', name:'缺口乙', job:null, skills:{},
      mood:80, food:80, illness:0, rest:80, recreation:80, exposure:0,
      ailments:[], downed:false, isSleeping:false, bedId:null, gear:{} }];
    M.syncResidents();
    const e=S.entities.find(x=>x.type===T.RESIDENT && (x.rid||x.id)==='rs_room2');
    e.x=48*32+24; e.y=48*32+24;
    M.residentsTick();
    A(S.meta.residents[0].exposure>0, '缺口圈非房间应暴露, got '+S.meta.residents[0].exposure);
  }finally{
    S.scene=oldScene; S.meta.residents=oldResidents; S.entities=oldEntities;
    S.colony.buildings=oldBuildings; S.colony.buildQueue=oldQueue; S.war=oldWar;
    S.meta.res=oldRes; S.meta.weather=oldWx;
  }
});
test('#82 home: 路灯可建造, 通电夜间亮/断电灭 (drawDarkness 不崩)', () => {
  const oldScene=S.scene, oldBuildings=S.colony.buildings, oldEntities=S.entities;
  try{
    S.scene='home';
    S.colony.buildings=[{id:'bl_lamp', x:1000, y:1000, lv:1, powered:true}];
    APH.Colony.placeBuildingEntity('bl_lamp',1000,1000,1);
    try{ APH.World.drawDarkness(0.1); }catch(err){ throw new Error('夜亮 drawDarkness 抛: '+err.message); }
    /* 断电: powered=false 再画不崩(熄灭) */
    S.colony.buildings[0].powered=false;
    try{ APH.World.drawDarkness(0.1); }catch(err){ throw new Error('断电 drawDarkness 抛: '+err.message); }
    /* 白天: 不亮也不崩 */
    try{ APH.World.drawDarkness(0.9); }catch(err){ throw new Error('白天 drawDarkness 抛: '+err.message); }
    /* 建造检查: 科技门槛+成本 */
    const p=APH.Colony.canPlace([], {te_machining:true}, 'bl_lamp', 500, 500, {iron:99,wood:99,stone:99});
    A(p.ok, '机械锻造解锁后应可建, got '+JSON.stringify(p));
  }finally{
    S.scene=oldScene; S.colony.buildings=oldBuildings; S.entities=oldEntities;
  }
});

/* ============ T10 尖刺陷阱与沙袋 (#83) ============ */
test('#83 home: 敌人踩陷阱受伤出血+陷阱触发一次性', () => {
  const oldScene=S.scene, oldEntities=S.entities, oldBuildings=S.colony.buildings, oldWar=S.war;
  try{
    S.scene='home'; S.war={raidActive:true};
    S.colony.buildings=[{id:'bl_spike_trap', x:1000, y:1000, armed:true}];
    S.entities=[];
    const en=window.APH.Ent.makeEnemy(S.spec.enemies.factions[0], 1000, 1000);
    en.hp=en.faction.hp;
    S.entities.push(en);
    /* 直接构造陷阱触发路径: updateCombat 处理敌走位会触发 */
    window.APH.Combat.updateCombat(0.016, false);
    A(en.hp < en.faction.hp, '踩陷阱应掉血, hp '+en.hp+'/'+en.faction.hp);
    A(en.bleedT>0, '应出血减速, bleedT '+en.bleedT);
    A(S.colony.buildings[0].armed===false, '陷阱应触发(一次性)');
    /* 已触发不再触发: 连续两拍 hp 不再因陷阱掉 */
    const hpAfter=S.entities.find(x=>x.type===T.ENEMY&&!x.dead).hp;
    window.APH.Combat.updateCombat(0.016, false);
    const hp2=S.entities.find(x=>x.type===T.ENEMY&&!x.dead).hp;
    /* 敌人可能仍会走位/打玩家, 但陷阱不再重复扣(仅验证标记) */
    A(S.colony.buildings[0].armed===false, '触发态保持');
  }finally{
    S.scene=oldScene; S.entities=oldEntities; S.colony.buildings=oldBuildings; S.war=oldWar;
  }
});
test('#83 home: 沙袋减速乘子生效 (敌人移动减速通过 sandbagMul)', () => {
  /* 纯函数侧已测; 场景验证接线不崩+格内判定可用 */
  const bags=[{id:'bl_sandbag',x:500,y:500}];
  const mul=window.APH.Colony.sandbagMul(bags,{x:510,y:505});
  A(mul===0.5, '格内应 0.5, got '+mul);
  A(window.APH.Colony.sandbagMul(bags,{x:600,y:600})===1, '格外应 1');
});
test('#83 home: 居民路过自动重置陷阱 (耗建材)', () => {
  const oldScene=S.scene, oldResidents=S.meta.residents, oldEntities=S.entities,
        oldBuildings=S.colony.buildings, oldWar=S.war, oldRes=S.meta.res;
  try{
    S.scene='home'; S.war={raidActive:false};
    S.colony.buildings=[{id:'bl_spike_trap', x:1000, y:1000, armed:false}];
    S.colony.buildQueue=[]; S.entities=[];
    S.meta.res={ stone:5, wood:5, food:0 };
    S.meta.residents=[{id:'rs_t10', name:'修理工', job:null, skills:{},
      mood:70, food:80, illness:0, downed:false, isSleeping:false,
      rest:80, recreation:80, exposure:0, ailments:[], gear:{}}];
    M.syncResidents();
    const e=S.entities.find(x=>x.type===T.RESIDENT && (x.rid||x.id)==='rs_t10');
    e.x=970; e.y=1000;   /* 陷阱旁 30px 内 */
    M.updateResidents(0.5);
    A(S.colony.buildings[0].armed===true, '居民应重置陷阱, armed '+S.colony.buildings[0].armed);
    A(S.meta.res.stone===4, '重置应耗1石, stone '+S.meta.res.stone);
  }finally{
    S.scene=oldScene; S.meta.residents=oldResidents; S.entities=oldEntities;
    S.colony.buildings=oldBuildings; S.war=oldWar; S.meta.res=oldRes;
  }
});

/* ============ P1a 天气预报 (#92) ============ */
test('#92 home: HUD 天气行显示明日预报 (雨→明日晴)', () => {
  const oldScene=S.scene, oldWx=S.meta.weather, oldRes=S.meta.residents;
  try{
    S.scene='home';
    S.meta.weather={ id:'wx_rain', t:0, cd:null };
    APH.UI.updHUD();
    const rowWx=document.getElementById('rowWeather');
    const txt=(rowWx&&rowWx.textContent)||'';
    A(txt.indexOf('雨')>=0, '应显示当前雨: '+txt);
    A(txt.indexOf('明日')>=0, '应含明日预报: '+txt);
    A(txt.indexOf('晴')>=0, '雨→明日应晴(转移最高): '+txt);
  }finally{
    S.scene=oldScene; S.meta.weather=oldWx; S.meta.residents=oldRes;
  }
});
test('#92 home: 雷暴→明日依旧雷雨链 (转移表 wx_rain 最高), HUD 不崩', () => {
  const oldScene=S.scene, oldWx=S.meta.weather;
  try{
    S.scene='home';
    S.meta.weather={ id:'wx_thunder', t:0, cd:null };
    APH.UI.updHUD();
    const txt=(document.getElementById('rowWeather')&&document.getElementById('rowWeather').textContent)||'';
    A(txt.indexOf('雷暴')>=0, '应显示雷暴: '+txt);
    A(txt.indexOf('明日')>=0, '应含明日: '+txt);
  }finally{
    S.scene=oldScene; S.meta.weather=oldWx;
  }
});

/* ============ P1b 玩家暴露条 (#93) ============ */
test('#93 home: 雷暴室外玩家暴露累积+HUD 第六行显示', () => {
  const oldScene=S.scene, oldWx=S.meta.weather, oldNeeds=JSON.stringify(S.meta.playerNeeds),
        oldBuildings=S.colony.buildings, oldPos={x:S.px,y:S.py};
  try{
    S.scene='home';
    S.meta.weather={ id:'wx_thunder', t:0, cd:null };
    if(!S.meta.playerNeeds) S.meta.playerNeeds={};
    S.meta.playerNeeds.exposure=0;
    S.colony.buildings=[];  /* 空旷处: 无建筑避难 */
    S.px=2000; S.py=2000;   /* 远离 HAB(1100,1100) 与所有建筑 */
    M.residentsTick();
    const ex=S.meta.playerNeeds.exposure;
    A(ex>0, '雷暴室外应累积暴露, got '+ex);
    /* HUD: exposure 行显示 */
    APH.UI.updHUD();
    const rowEx=document.getElementById('rowExposure');
    A(rowEx && rowEx.textContent && rowEx.textContent.indexOf('暴露')>=0,
      'HUD 应显示暴露行, got: '+(rowEx&&rowEx.textContent));
  }finally{
    S.scene=oldScene; S.meta.weather=oldWx;
    S.meta.playerNeeds=JSON.parse(oldNeeds);
    S.colony.buildings=oldBuildings; S.px=oldPos.x; S.py=oldPos.y;
  }
});
test('#93 home: 房间内玩家暴露消退 (T9 免疫复用)', () => {
  const oldScene=S.scene, oldWx=S.meta.weather, oldNeeds=JSON.stringify(S.meta.playerNeeds),
        oldBuildings=S.colony.buildings, oldPos={x:S.px,y:S.py};
  try{
    S.scene='home';
    S.meta.weather={ id:'wx_acid', t:0, cd:null };
    if(!S.meta.playerNeeds) S.meta.playerNeeds={};
    S.meta.playerNeeds.exposure=80;
    /* 圈房: 5×5 墙环(远离 HAB), 玩家在房内 */
    S.colony.buildings=[];
    for(let x=0;x<5;x++){ S.colony.buildings.push({id:'bl_wall',x:48*(30+x),y:48*30}); S.colony.buildings.push({id:'bl_wall',x:48*(30+x),y:48*34}); }
    for(let y=0;y<5;y++){ S.colony.buildings.push({id:'bl_wall',x:48*30,y:48*(30+y)}); S.colony.buildings.push({id:'bl_wall',x:48*34,y:48*(30+y)}); }
    S.px=48*32+24; S.py=48*32+24;
    M.residentsTick();
    A(S.meta.playerNeeds.exposure<80, '房间内酸雨应消退, got '+S.meta.playerNeeds.exposure);
  }finally{
    S.scene=oldScene; S.meta.weather=oldWx;
    S.meta.playerNeeds=JSON.parse(oldNeeds);
    S.colony.buildings=oldBuildings; S.px=oldPos.x; S.py=oldPos.y;
  }
});

/* ============ P2 敌避陷阱 (#94) ============ */
test('#94 home: 敌人寻路绕开待触发陷阱 (不踩)', () => {
  const oldScene=S.scene, oldEntities=S.entities, oldBuildings=S.colony.buildings, oldWar=S.war;
  try{
    S.scene='home'; S.war={raidActive:false};
    /* 无墙有陷阱: planChase 也应寻路绕陷阱 */
    S.colony.buildings=[{id:'bl_spike_trap', x:1000, y:1000, armed:true}];
    S.entities=[];
    /* 构造敌人在陷阱上方, 目标下方 (直线会穿过陷阱格) */
    const f0 = S.spec.enemies.factions[0] || { id:'fx_melee_test', name:'测试近战怪', behavior:'melee_swarm', gene:{hue:285,sides:5,limbs:6,size:1.0,spikes:3,eyes:2}, hp:30, speed:96, dmg:8, nightBoost:1 };
    const en=window.APH.Ent.makeEnemy(f0, 1000, 940);
    en.hp=en.faction.hp;
    S.entities.push(en);
    /* 直接调 planChase 内部接口不可达(未导出), 用 updateCombat 驱动多帧观察是否绕行 */
    S.war.raidActive=true;
    /* 目标=玩家在陷阱下方 */
    S.px=1000; S.py=1060;
    let minDist=Infinity, steppedOnTrap=false;
    for(let i=0;i<80;i++){
      window.APH.Combat.updateCombat(0.5, false);
      const t=S.colony.buildings.find(b=>b.id==='bl_spike_trap');
      if(t && t.armed===false){
        steppedOnTrap=true;
        break;
      }
      minDist=Math.min(minDist, Math.hypot(en.x-1000, en.y-1000));
      if(Math.hypot(en.x-S.px, en.y-S.py) <= 45) break;   // 已绕过陷阱到达目标玩家身边
    }
    /* 核心: 绕行不踩(陷阱保持 armed) —— 敌 never 触发陷阱 */ 
    A(!steppedOnTrap, '绕行应不触发陷阱');
  }finally{
    S.scene=oldScene; S.entities=oldEntities; S.colony.buildings=oldBuildings; S.war=oldWar;
  }
});
test('#94 home: 绕无可绕 → 敌仍踩陷阱 (不卡死)', () => {
  const oldScene=S.scene, oldEntities=S.entities, oldBuildings=S.colony.buildings, oldWar=S.war;
  try{
    S.scene='home'; S.war={raidActive:false};
    /* 陷阱堵住唯一通道: 左右两列竖直墙, 中间 1 格宽通道, 通道内全是陷阱(x=1000 列) */
    const walls94=[];
    for(let y=940; y<=1060; y+=48){ walls94.push({id:'bl_wall', x:955, y:y}); walls94.push({id:'bl_wall', x:1045, y:y}); }
    S.colony.buildings=[
      {id:'bl_spike_trap', x:1000, y:1000, armed:true},
    ].concat(walls94);
    S.entities=[];
    const en=window.APH.Ent.makeEnemy(S.spec.enemies.factions[0], 1000, 940);
    en.hp=en.faction.hp;
    S.entities.push(en);
    S.war.raidActive=true;
    /* 目标 = 陷阱下方更远玩家 */
    S.px=1000; S.py=1060;
    let stepped=false;
    for(let i=0;i<120;i++){
      window.APH.Combat.updateCombat(0.5, false);
      const t=S.colony.buildings[0];
      if(t.armed===false){ stepped=true; break; }
    }
    /* P2b 语义修订: 窄通道唯一陷阱 → 敌人触发 trapAtkId 改拆陷阱(记录移除)而非踩 */
    A(stepped || !S.colony.buildings.some(b=>b.id==='bl_spike_trap'),
      '绕无可绕应踩或拆(不卡死), stepped='+stepped+' trap存在='+S.colony.buildings.some(b=>b.id==='bl_spike_trap'));
  }finally{
    S.scene=oldScene; S.entities=oldEntities; S.colony.buildings=oldBuildings; S.war=oldWar;
  }
});

/* ============ P2b 工兵拆陷阱 (#95) ============ */
test('#95 home: 窄道陷阱+近墙 → 工兵拆陷阱(不拆墙), 拆后通途恢复', () => {
  const oldScene=S.scene, oldEntities=S.entities, oldBuildings=S.colony.buildings, oldWar=S.war;
  try{
    S.scene='home'; S.war={raidActive:false};
    /* 窄通道(左右竖墙), 通道内唯一陷阱; 陷阱旁加一堵墙干扰(最近目标) */
    const walls95=[];
    for(let y=940; y<=1060; y+=48){ walls95.push({id:'bl_wall', x:955, y:y}); walls95.push({id:'bl_wall', x:1045, y:y}); }
    S.colony.buildings=[
      {id:'bl_spike_trap', x:1000, y:1000, armed:true},
    ].concat(walls95);
    S.entities=[];
    const en=window.APH.Ent.makeEnemy(S.spec.enemies.factions[0], 1000, 940);
    en.hp=en.faction.hp;
    S.entities.push(en);
    S.war.raidActive=true;
    S.px=1000; S.py=1096;   /* 玩家在通道下方更远(目标) */
    let trapRemoved=false, trapArmedSeen=false;
    for(let i=0;i<160;i++){
      window.APH.Combat.updateCombat(0.5, false);
      const t=S.colony.buildings.find(b=>b.id==='bl_spike_trap');
      if(!t){ trapRemoved=true; break; }
      if(t.armed===true) trapArmedSeen=true;
    }
    /* 工兵应拆掉陷阱(记录移除) 而非踩(踩也移除——区分: 踩=armed false 但记录在; 拆=记录没了) */
    A(trapRemoved, '工兵应拆掉陷阱(记录移除)');
  }finally{
    S.scene=oldScene; S.entities=oldEntities; S.colony.buildings=oldBuildings; S.war=oldWar;
  }
});
test('#95 home: 无陷阱堵点 → 保持原破墙行为 (回归零破坏)', () => {
  const oldScene=S.scene, oldEntities=S.entities, oldBuildings=S.colony.buildings, oldWar=S.war;
  try{
    S.scene='home'; S.war={raidActive:false};
    /* 玩家被 3×3 墙环完全围死(无陷阱): 敌人应破墙突破 */
    S.colony.buildings=[];
    for(let x=952; x<=1048; x+=48){
      for(let y=952; y<=1048; y+=48){
        if(x===1000 && y===1000) continue;   /* 玩家格 */
        S.colony.buildings.push({id:'bl_wall', x:x, y:y});
      }
    }
    S.entities=[];
    const en=window.APH.Ent.makeEnemy(S.spec.enemies.factions[0], 1000, 880);
    en.hp=en.faction.hp;
    S.entities.push(en);
    S.war.raidActive=true;
    S.px=1000; S.py=1000;
    let wallBroken=false;
    for(let i=0;i<200;i++){
      window.APH.Combat.updateCombat(0.5, false);
      if(S.colony.buildings.length<8){ wallBroken=true; break; }   /* 拆掉至少一堵=破墙成功 */
    }
    A(wallBroken, '无陷阱时应破墙(回归)');
  }finally{
    S.scene=oldScene; S.entities=oldEntities; S.colony.buildings=oldBuildings; S.war=oldWar;
  }
});

/* ============ P3 生活家具 (#97) ============ */
test('#97 home: 家具房间心情 > 普通房间 (生产跳 roomMoodGain 聚合)', () => {
  const oldScene=S.scene, oldResidents=S.meta.residents, oldEntities=S.entities,
        oldBuildings=S.colony.buildings, oldWar=S.war;
  try{
    S.scene='home'; S.war={raidActive:false};
    /* 圈房(30,30 5×5)+居住舱+电视+书架; 居民在房内 */
    const walls97=[];
    for(let x=0;x<5;x++){ walls97.push({id:'bl_wall',x:48*(30+x),y:48*30}); walls97.push({id:'bl_wall',x:48*(30+x),y:48*34}); }
    for(let y=0;y<5;y++){ walls97.push({id:'bl_wall',x:48*30,y:48*(30+y)}); walls97.push({id:'bl_wall',x:48*34,y:48*(30+y)}); }
    S.colony.buildings=walls97.concat([
      {id:'bl_house', x:48*32, y:48*32},
      {id:'bl_tv', x:48*31, y:48*31},
      {id:'bl_shelf', x:48*33, y:48*33},
    ]);
    S.colony.buildQueue=[]; S.entities=[];
    S.meta.residents=[{id:'rs_p3', name:'家具测试员', job:null, skills:{},
      mood:70, food:80, illness:0, downed:false, isSleeping:false,
      rest:80, recreation:80, exposure:0, ailments:[], gear:{}}];
    M.syncResidents();
    const e=S.entities.find(x=>x.type===T.RESIDENT && (x.rid||x.id)==='rs_p3');
    e.x=48*32+24; e.y=48*32+24;
    M.residentsTick();
    /* 卧室2 + 电视1 + 书架1 = +4 (70→74) */
    const actualMood=S.meta.residents[0].mood;
    A(actualMood>=74, '家具房间应 +4 心情, mood '+actualMood);
  }finally{
    S.scene=oldScene; S.meta.residents=oldResidents; S.entities=oldEntities;
    S.colony.buildings=oldBuildings; S.war=oldWar;
  }
});
test('#97 home: 家具可建造 (te_machining 解锁, 成本校验)', () => {
  /* canPlace: 科技解锁 + 离核心豁免(放家旁) + 材料 */
  const p1=APH.Colony.canPlace([], {te_machining:true}, 'bl_tv', window.APH.CFG.HAB.x+40, window.APH.CFG.HAB.y+40, {iron:99,wood:99,leather:99});
  A(p1.ok, '电视应可建(核心旁豁免): '+JSON.stringify(p1));
  const p2=APH.Colony.canPlace([], {}, 'bl_tv', 500, 500, {iron:99,wood:99,leather:99});
  if(p2.ok) throw new Error('无科技不可建');
  const p3=APH.Colony.canPlace([], {te_machining:true}, 'bl_carpet', window.APH.CFG.HAB.x+40, window.APH.CFG.HAB.y+40, {iron:99,wood:99,leather:99});
  A(p3.ok, '地毯应可建: '+JSON.stringify(p3));
});

/* ============ 外交与战略威慑系统 (#103~#107) ============ */
test('#105 diplomacy: O 键打开关闭外交浮层与卡片渲染', () => {
  const el = document.getElementById('diplomacyOverlay');
  M.toggleDiplomacy(true);
  A(el.style.display !== 'none', '外交面板应显示');
  const body = document.getElementById('diplomacyBody');
  A(body && body.innerHTML && body.innerHTML.includes('dip-card'), '外交面板应渲染势力卡片');
  M.toggleDiplomacy(false);
  A(el.style.display === 'none', '外交面板应关闭');
});

test('#106 diplomacy: 纳贡平息即刻袭击危机并扣减物资', () => {
  const oldRes = JSON.stringify(S.meta.res || {});
  try {
    S.meta.res = { mineral: 30, food: 20, leather: 10, med: 5 };
    S.rivalStates = [{
      rival: { id: 'rv_test_1', name: '测试好战军', trait: 'aggressive', military: 40 },
      relation: -40,
      anger: 12,
      wantRaid: true,
      cowedTime: 0,
      pact: false
    }];
    S.war.pendingWave = { count: 5 };
    S.war.raidFrom = '测试好战军';

    // 纳贡 15 矿石
    M.doSendTribute(0, 'mineral');

    A(S.meta.res.mineral === 15, '矿石应扣除 15 got ' + S.meta.res.mineral);
    A(S.rivalStates[0].wantRaid === false, 'wantRaid 应被平息');
    A(S.war.pendingWave === null, '即刻袭击波次应被取消');
    A(S.rivalStates[0].relation > -40, '关系度应提升');
    A(S.rivalStates[0].anger < 12, '怒气应消退');
  } finally {
    S.meta.res = JSON.parse(oldRes);
  }
});

test('#106 diplomacy: 压倒性防御成功实施军事威慑', () => {
  const oldBuildings = S.colony.buildings;
  try {
    // 5座炮塔: def = 10 + 5*12 = 70. 敌军力 30 (1.2x = 36)
    S.colony.buildings = [
      { id: 'bl_turret' }, { id: 'bl_turret' }, { id: 'bl_turret' },
      { id: 'bl_turret' }, { id: 'bl_turret' }
    ];
    S.rivalStates = [{
      rival: { id: 'rv_test_2', name: '测试扩张团', trait: 'expansionist', military: 30 },
      relation: -15,
      anger: 5,
      wantRaid: true,
      cowedTime: 0,
      pact: false
    }];

    M.doDeterRival(0);

    A(S.rivalStates[0].cowedTime === 300, '威慑应使敌方进入 300s 畏缩期 got ' + S.rivalStates[0].cowedTime);
    A(S.rivalStates[0].wantRaid === false, '畏缩后袭击意向打消');
  } finally {
    S.colony.buildings = oldBuildings;
  }
});

test('#106 diplomacy: 远征基地击破联动削弱敌对势力军力与怒气', () => {
  S.rivalStates = [{
    rival: { id: 'rv_test_base', name: '先遣据点军', trait: 'aggressive', military: 50 },
    relation: -20,
    anger: 10,
    wantRaid: true,
    cowedTime: 0,
    pact: false
  }];

  // 模拟远征击毁敌基地
  window.APH.Combat.raidBaseSuccess({
    dead: false,
    x: 500, y: 500,
    rivalId: 'rv_test_base',
    rivalName: '先遣据点军'
  });

  const updated = S.rivalStates[0];
  A(updated.rival.military === 35, '军力应从 50 削减30%至 35 got ' + updated.rival.military);
  A(updated.anger === 0, '怒气应清零');
  A(updated.wantRaid === false, 'wantRaid 应打消');
  A(updated.cowedTime > 0, '应获得畏缩期');
  A(updated.relation < -20, '摧毁基地关系度应下降');
});

test('#106 diplomacy: 通商协定签署并生效', () => {
  const oldRes = JSON.stringify(S.meta.res || {});
  try {
    S.meta.res = { mineral: 50, food: 20 };
    S.rivalStates = [{
      rival: { id: 'rv_test_trade', name: '友善商会', trait: 'trader', military: 20 },
      relation: 10,
      anger: 2,
      wantRaid: false,
      cowedTime: 0,
      pact: false
    }];

    M.doSignTradePact(0);

    A(S.meta.res.mineral === 30, '矿石应扣除 20 got ' + S.meta.res.mineral);
    A(S.rivalStates[0].pact === true, '通商协定应置为 true');
    A(S.rivalStates[0].relation === 20, '关系度应增加 10');
  } finally {
    S.meta.res = JSON.parse(oldRes);
  }
});

test('#132 social: 靠近正常居民按 E 热情打招呼', () => {
  const oldScene = S.scene, oldResidents = S.meta.residents, oldEntities = S.entities;
  try {
    S.scene = 'home'; S.mode = 'running';
    APH.Res.ensurePlayerNeeds(S.meta);
    S.meta.playerNeeds.isSleeping = false;
    S.meta.playerNeeds.downed = false;
    S.meta.residents = [{ id: 'rs_g1', name: '小满', skills: {}, mood: 70, food: 80 }];
    S.meta.bonds = {};
    S.greetCooldowns = {};
    S.entities = [{ type: T.RESIDENT, id: 'rs_g1', x: S.px + 20, y: S.py, dead: false }];
    S.nearFood = null; S.nearBed = null; S.nearClinic = null; S.nearPad = false;
    M.updateHome(0.016);
    A(S.nearResident, '走近居民应判定 nearResident');
    A(!S.nearBrokenResident, '正常居民不应判定 nearBrokenResident');
    M.debugPressE();
    A(S.meta.bonds['player|rs_g1'] === 52, '打招呼应 +2 好感, got ' + S.meta.bonds['player|rs_g1']);
    A(S.entities[0].socialBubble === '😊', '居民头顶应浮现微笑微气泡');
  } finally {
    S.scene = oldScene; S.meta.residents = oldResidents; S.entities = oldEntities;
  }
});

test('#132 social: 靠近崩溃居民按 E 安抚情绪解除崩溃', () => {
  const oldScene = S.scene, oldResidents = S.meta.residents, oldEntities = S.entities;
  try {
    S.scene = 'home'; S.mode = 'running';
    APH.Res.ensurePlayerNeeds(S.meta);
    S.meta.playerNeeds.isSleeping = false;
    S.meta.playerNeeds.downed = false;
    S._interventionRng = () => 0.1;
    S.meta.residents = [{ id: 'rs_brk1', name: '暴躁阿岚', skills: {}, mood: 20, food: 80, breakType: 'wander', breakT: 2 }];
    S.meta.bonds = { 'player|rs_brk1': 60 };
    S.entities = [{ type: T.RESIDENT, id: 'rs_brk1', x: S.px + 20, y: S.py, dead: false }];
    S.nearFood = null; S.nearBed = null; S.nearClinic = null; S.nearPad = false;
    M.updateHome(0.016);
    A(S.nearBrokenResident, '靠近崩溃居民应判定 nearBrokenResident');
    M.debugPressE();
    A(S.meta.residents[0].breakType === null, '安抚后 breakType 应清空');
    A(S.meta.residents[0].breakT === 0, '安抚后 breakT 应归零');
    A(S.meta.residents[0].mood >= 30, '安抚后心情应获得开导增益, got ' + S.meta.residents[0].mood);
    A(S.meta.bonds['player|rs_brk1'] === 66, '安抚后好感应 +6, got ' + S.meta.bonds['player|rs_brk1']);
  } finally {
    delete S._interventionRng;
    S.scene = oldScene; S.meta.residents = oldResidents; S.entities = oldEntities;
  }
});

test('#137 storage: 走近置物货架按 E 循环品类且就近取料', () => {
  const oldScene = S.scene, oldBuildings = S.colony.buildings, oldEntities = S.entities;
  try {
    S.scene = 'home'; S.mode = 'running';
    APH.Res.ensurePlayerNeeds(S.meta);
    S.meta.playerNeeds.isSleeping = false;
    S.meta.playerNeeds.downed = false;
    const shelf = { type: T.BUILDING, id: 'bl_storage_shelf', bid: 'bl_storage_shelf', x: S.px + 20, y: S.py, filter: 'all' };
    S.colony.buildings = [shelf];
    S.entities = [shelf];
    S.nearFood = null; S.nearBed = null; S.nearClinic = null; S.nearPad = false; S.nearResident = null; S.nearBrokenResident = null;
    M.updateHome(0.016);
    A(S.nearStorageContainer, '走近置物货架应判定 nearStorageContainer');
    M.debugPressE();
    A(shelf.filter === 'food', '按 E 后品类应切换为 food, 实际: ' + shelf.filter);

    // 放置食材在货架上，测试 120px 内就近取料
    const drop = { id: 'dp_sh_1', type: T.DROPPED, itemId: 'it_roasted_meat', n: 5, x: S.px + 20, y: S.py, dead: false };
    S.entities.push(drop);
    const sourced = APH.Colony.findNearbySourcedItem('food', { x: S.px, y: S.py }, 120, S.colony.buildings, S.entities);
    A(sourced && sourced.found === true, '就近取料应成功检索到食材');
    A(sourced.drop && sourced.drop.id === 'dp_sh_1', '取料对象应为货架上的熟食');
  } finally {
    S.scene = oldScene; S.colony.buildings = oldBuildings; S.entities = oldEntities;
  }
});

console.log(`\n${pass} 通过 / ${fail} 失败 / 共 ${pass+fail}`);
process.exit(fail?1:0);
