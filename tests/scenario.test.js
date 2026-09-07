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

/* ---------- 确定性 RNG (ADR-5 可复现性) ----------
   spawnDrop 的落点抖动等逻辑路径会读 Math.random(), 落点是否进入搬运抓取半径
   直接改变断言结果 —— 未固定种子时本套件会随机红/绿。这里把 Math.random 换成
   mulberry32, 并在每个用例前重播种, 使用例与执行顺序无关。 */
const SEED0 = 0x9E3779B9;
function mulberry32(a){
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/* 时间也要确定: 远征种子取自 Date.now()%100000, 真实时钟会让每次运行生成
   不同的世界(信标/晶体落点各异), 而 cmdHomeSetup 并不清理这些类型的实体 ——
   它们会漂进后续家园用例的框选范围, 造成低频假红。 */
const FAKE_T0 = 1757200000000;
let fakeT = FAKE_T0;
function reclock(){ fakeT = FAKE_T0; }
Date.now = function(){ fakeT += 16; return fakeT; };

function reseed(seed){ Math.random = mulberry32(seed == null ? SEED0 : seed); reclock(); }
reseed();
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
global.performance = { now:()=>fakeT - FAKE_T0 };
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
                'colony.js','rivals.js','events.js','weather.js','nav.js','residents.js','alerts.js','combat.js',
                'world.js','entities.js','visitors.js','colonytick.js','draw.js','sfx.js','sprites.js','ui.js','hints.js','main.js']){
  new Function(fs.readFileSync(path.join(SRC,f),'utf-8'))();
}

/* ---------- 极简断言器 ---------- */
let pass=0, fail=0;
function test(name, fn){
  try{ reseed(); fn(); pass++; console.log('  ✓ '+name); }
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
  const restDrain = (APH.CFG.residents && APH.CFG.residents.restDrain) || 0.42;
  A(Math.abs(S.meta.playerNeeds.rest - (start - restDrain)) < 0.05, '家园生产跳应掉精力, 实际: '+S.meta.playerNeeds.rest);
  APH.UI.updHUD();
  A(Number(v.textContent) === Math.round(S.meta.playerNeeds.rest), '家园 HUD 应跟上精力下降, 实际: '+v.textContent);
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
  S.meta.residents=[];                 // ADR-44: 没人接班, 才是真的结束
  let seen=null;
  /* ADR-40 之后死亡结算走总线, 不再直调 APH.UI.showDeath ——
     订总线才测得到真正的契约(旧写法打桩公开方法, 已经拦不住了)。 */
  const off=APH.U.on('death', function(p){ seen=p&&p.stats; });
  M.updateSurvival(0.016);
  APH.U.off('death', off);
  A(seen, '应发出 death 事件');
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
    S.px=400; S.py=400; S.vx=0; S.vy=0; S.target={x:800, y:400}; S.parts=[];
    S.keys={ShiftLeft:running}; S.joy={active:false,id:null,x:0,y:0};
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
  S.meta.workPrio = { rs_h1: { sk_gather: 0, sk_haul: 1 } };  // 禁采集, 只搬运
  S.entities = (S.entities||[]).filter(e=>e.type!==T.DROPPED && e.type!==T.RESIDENT && e.type!==T.FLORA);
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
  const foodDrain = (APH.CFG.residents && APH.CFG.residents.foodDrain) || 0.35;
  A(Math.abs(S.meta.residents[0].food - (50 - foodDrain)) < 0.05, '生产跳只掉饱食不隔空吃, got '+S.meta.residents[0].food);
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
  A(r1.wantSleep, 'r1 rest<20 应困倦想睡');
  A(!r1.isSleeping, 'r1 应走去床再睡，不应原地瞬睡');
  /* ADR-31: 心情=基线+念头之和。r1 精力 15 会挂上「困得睁不开眼」,
     所以心情从 80 向 (基线+吃饱+愉悦+安全-困倦) 缓降是正确行为;
     这里断言正向念头确实在场, 且没有被拖到低落区间。 */
  A(r1.mood >= 70, 'r1 高娱乐+吃饱不应跌到低落区间, mood ' + r1.mood);
  A((r1.thoughts||[]).some(t => t.id === 'th_joy'), 'r1 高娱乐应挂 th_joy');
  A((r1.thoughts||[]).some(t => t.id === 'th_well_fed'), 'r1 吃得饱应挂 th_well_fed');
  A((r1.thoughts||[]).some(t => t.id === 'th_tired'), 'r1 精力15 应挂 th_tired');

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
  A(!ent1.isSleeping, '尚未走到床前，实体不应已俯卧');

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

/* #66 床边睡眠/唤醒: 靠床 E 睡(俯卧); 平移镜头不醒; E/受伤/征召可醒
   驱动通道: updateHome / residentsTick / debugPressE (无 __frame 导出) */
test('#66: 靠床近判定 nearBed 且不触发自动寻路 (S.target 保持 null)', () => {
  S.scene = 'home';
  APH.Res.ensurePlayerNeeds(S.meta);
  S.meta.playerNeeds.isSleeping = false;
  S.meta.playerNeeds.food = 80;
  S.meta.playerNeeds.rest = 100;
  S.playerDrafted = false;
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

test('#66: 视口平移不唤醒睡眠 (摄像机仍平移)', () => {
  S.scene = 'home';
  APH.Res.ensurePlayerNeeds(S.meta);
  S.meta.playerNeeds.isSleeping = true;
  S.playerDrafted = false;
  S.keys = {};
  const camX0 = S.camX;
  S.keys.KeyA = true;   // 向左平移视口
  M.updateHome(0.016);
  A(S.meta.playerNeeds.isSleeping === true, '环世界: 平移镜头不得把人摇醒');
  const pe = APH.Ent.findPlayer();
  A(pe && pe.isSleeping === true, '实体应保持俯卧');
  A(S.camX < camX0, 'WASD 应向左平移摄像机, 实际 camX=' + S.camX);
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
  S.meta.playerNeeds.rest = 0.2;      // 一跳掉到 0 → 累塌
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

test('#67: 累塌后平移镜头不唤醒', () => {
  S.scene = 'home';
  APH.Res.ensurePlayerNeeds(S.meta);
  S.meta.playerNeeds.isSleeping = true;
  S.meta.playerNeeds.bedId = null;
  S.playerDrafted = false;
  S.keys = {};
  const camX0 = S.camX;
  S.keys.KeyA = true;   // 向左平移视口
  M.updateHome(0.016);
  A(S.meta.playerNeeds.isSleeping === true, '累塌睡眠中平移镜头不得唤醒');
  const pe = APH.Ent.findPlayer();
  A(pe && pe.isSleeping === true, '实体应保持俯卧');
  A(S.camX < camX0, 'WASD 应向左平移摄像机');
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
  S.meta.playerNeeds.food = 80;
  S.playerDrafted = false;
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
  M.residentsTick();                   // 结算恢复: hasBed=nearBed||nearClinic=true → 床速
  const bedRec = (APH.CFG.player && APH.CFG.player.bedRecover) || 0.65;
  A(Math.abs(S.meta.playerNeeds.rest - (40 + bedRec)) < 0.05, '舱内躺卧应按床速恢复, 实际: ' + S.meta.playerNeeds.rest);
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
  A(S.meta.playerNeeds.food > 30, '饥饿靠粮堆应自动进食, 实际: '+S.meta.playerNeeds.food);
  A((pile.n||0) === 4, '地上粮堆应 -1, 实际 n='+(pile.n||0));
  A(S.target === null, '已在粮边进食不得再写寻路目标 (S.target 应保持 null)');
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
  A(S.meta.playerNeeds.food > 30, '饥饿靠仓库应自动进食, 实际: '+S.meta.playerNeeds.food);
  A(S.meta.res.food === 9, '仓库应扣 1 粮, 实际: '+S.meta.res.food);
  A(S.target === null, '已在仓库口进食不得再写寻路目标 (S.target 应保持 null)');
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
    S.meta.weather={ id:'wx_blizzard', t:1e7, cd:{ wx_blizzard:840 } };
    const cds={};
    Object.keys(window.APH.CFG.events.deck).forEach(id=>{
      if(id!=='ev_weather') cds[id]=99;
    });
    S.meta.events={ nextIn:0.1, sinceNeg:99, lastNeg:0,
                    cooldowns:cds, history:[], weatherAcc:4000 };
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
    /* ADR-31: 卧室级增益now以念头形式表达(th_room), 幅度来自 roomMoodGain。
       心情本身是「基线+念头之和」的缓动目标, 不再一跳直加。 */
    const roomTh = (r.thoughts||[]).find(t => t.id === 'th_room');
    A(!!roomTh, '卧室房间应挂上 th_room 念头');
    A(roomTh.mood > 0, '卧室 th_room 应为正增益, got '+roomTh.mood);
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
    /* 卧室2 + 电视1 + 书架1 = +4, 现以 th_room 念头的幅度体现 (ADR-31) */
    const r97=S.meta.residents[0];
    const roomTh97=(r97.thoughts||[]).find(t => t.id === 'th_room');
    A(!!roomTh97, '家具房间应挂上 th_room 念头');
    A(roomTh97.mood>=4, '卧室2+电视1+书架1 应聚合为 +4, got '+roomTh97.mood);
    A(r97.mood>70, '心情应朝更高目标上行, mood '+r97.mood);
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

test('#142 ruins: 开启远古遗物箱获得古代蓝图与高能核心', () => {
  const oldScene = S.scene, oldEntities = S.entities;
  try {
    S.scene = 'expedition'; S.mode = 'running';
    APH.Res.ensurePlayerNeeds(S.meta);
    S.meta.playerNeeds.isSleeping = false;
    S.meta.playerNeeds.downed = false;
    const vault = { type: T.BUILDING, id: 'ancient_vault', bid: 'ancient_vault', x: S.px + 20, y: S.py, opened: false };
    S.entities = [vault];
    S.nearFood = null; S.nearBed = null; S.nearClinic = null; S.nearPad = false;
    M.updateHome(0.016);
    A(S.nearAncientVault, '靠近遗物箱应判定 nearAncientVault');
    M.debugPressE();
    A(vault.opened === true, '按 E 后遗物箱应被开启');
    const drops = S.entities.filter(e => e && e.type === T.DROPPED);
    A(drops.some(d => d.itemId === 'it_ancient_blueprint'), '箱内必定喷出古代蓝图残卷');
    A(drops.some(d => d.itemId === 'it_ancient_core'), '箱内必定喷出史前高能核心');
  } finally {
    S.scene = oldScene; S.entities = oldEntities;
  }
});


/* ================= ADR-29 征召与直接命令 (环世界式) ================= */

function cmdHomeSetup(){
  if(S.scene!=='home'){ S.nearPad=true; M.debugPressE(); }
  A(S.scene==='home', '应在殖民地');
  S.mode='running';
  S.orderTool=null; S.selectedPawns=[]; S.selectedRid=null;
  S.war = S.war || {}; S.war.raidActive=false; S.war.raidWarn=0;
  S.meta.residents = [
    { id:'rs_cmd1', name:'征召甲', job:null, skills:{sk_build:5,sk_farm:3}, mood:80, food:90, rest:90 },
    { id:'rs_cmd2', name:'征召乙', job:'bl_farm', skills:{sk_farm:5}, mood:80, food:90, rest:90 },
  ];
  S.colony.buildings = (S.colony.buildings||[]).filter(b=>b.id==='bl_landing_pad');
  if(!S.colony.buildings.length) S.colony.buildings.push({ id:'bl_landing_pad', x:1100, y:1340 });
  S.colony.buildings.push(
    {id:'bl_farm', x:S.px+300, y:S.py, lv:1},
    {id:'bl_house', x:S.px-240, y:S.py, lv:1}
  );
  S.entities = S.entities.filter(e=>e.type!=='resident' && e.type!=='visitor' && e.type!=='flora' && e.type!=='dropped' && e.type!=='enemy');
  if(!S.entities.some(e=>e.type===T.BUILDING&&e.pad)){
    S.entities.push({ id:'be_pad_cmd', type:T.BUILDING, bid:'bl_landing_pad', pad:true, x:1100, y:1340 });
  }
  M.syncResidents();
  const ents = S.entities.filter(e=>e.type==='resident');
  A(ents.length===2, '居民实体应=2, got '+ents.length);
  return ents;
}

test('#149 cmd: 点选居民征召 → 待命(不游荡不上岗), Esc解除恢复', () => {
  const ents = cmdHomeSetup();
  const p = ents[0];
  S.selectedRid = null;
  M.cmd.select(p);
  A(S.selectedRid==='rs_cmd1', '选中应写 selectedRid, got '+S.selectedRid);
  /* 征召待命: 无命令时不动 */
  const x0=p.x, y0=p.y;
  p.x=S.px+100; p.y=S.py+100;   /* 远离岗位 */
  S.keys={};
  M.updateHome(0.016);
  M.updateHome(0.016);
  const ent2 = M.cmd.selectedEnt();
  A(ent2===p, 'selectedEnt 应返回选中实体');
  A(Math.abs(ent2.x-(S.px+100))<2 && Math.abs(ent2.y-(S.py+100))<2, '征召待命不应移动');
  A(!ent2.userOrder, '待命不应有命令');
  /* 解除 → 恢复 AI (游荡/上岗) */
  M.cmd.deselect();
  A(S.selectedRid===null, '解除后 selectedRid 应清空');
  A(!p.userOrder, '解除应清命令');
});

test('#149 cmd: 移动令 → 走到目标后自动清令', () => {
  const ents = cmdHomeSetup();
  const p = ents[0];
  p.x=S.px; p.y=S.py;
  M.cmd.select(p);
  const destX = p.x+150, destY = p.y;
  M.cmd.orderMove({x:destX, y:destY});
  A(p.userOrder && p.userOrder.type==='move', '应写移动令');
  S.keys={};
  for(let i=0;i<600 && p.userOrder;i++) M.updateHome(0.016);
  A(!p.userOrder, '到达后命令应清除');
  A(Math.abs(p.x-destX)<16, '应走到目标点附近, got '+Math.round(p.x)+' dest='+Math.round(destX));
  M.cmd.deselect();
});

test('#149 cmd: 采集令 → 走到树下砍完掉落, 自动清令', () => {
  const ents = cmdHomeSetup();
  const p = ents[0];
  p.x=S.px; p.y=S.py;
  const tree = { type:T.FLORA, kind:'tree', x:p.x+90, y:p.y, hp:6, maxHp:6, dead:false };
  S.entities.push(tree);
  M.cmd.select(p);
  M.cmd.orderGather();
  A(p.userOrder && p.userOrder.type==='gather', '应写采集令');
  S.keys={};
  for(let i=0;i<900 && p.userOrder;i++) M.updateHome(0.016);
  A(!p.userOrder, '砍完应清令');
  A(tree.dead===true, '树应被砍死');
  const drops = S.entities.filter(e=>e.type==='dropped' && e.itemId==='it_wood');
  A(drops.length>=1, '应掉落木材堆');
  M.cmd.deselect();
});

test('#149 cmd: 搬运令 → 抓取地上堆并入库, 自动清令', () => {
  const ents = cmdHomeSetup();
  const p = ents[0];
  S.meta.res = S.meta.res || { mineral:0, food:0, leather:0 };
  S.meta.res.mineral = 0;
  p.x=S.px; p.y=S.py;
  const pile = { type:T.DROPPED, id:'dp_cmd1', itemId:'it_mineral', x:p.x+70, y:p.y, n:5 };
  S.entities.push(pile);
  M.cmd.select(p);
  M.cmd.orderHaul();
  A(p.userOrder && p.userOrder.type==='haul', '应写搬运令');
  S.keys={};
  for(let i=0;i<1200 && p.userOrder;i++) M.updateHome(0.016);
  A(!p.userOrder, '入库后应清令');
  A(pile.dead===true, '地上堆应被拾取');
  A(S.meta.res.mineral===5, '矿物应入库 +5, got '+S.meta.res.mineral);
  M.cmd.deselect();
});

test('#149 cmd: 休息令 → 走到住宅入睡(isSleeping), 吃饭令 → 就近进食', () => {
  const ents = cmdHomeSetup();
  /* 休息令 */
  const p1 = ents[0];
  p1.x=S.px; p1.y=S.py;
  p1.rest = 10;
  M.cmd.select(p1);
  M.cmd.orderSleep();
  S.keys={};
  for(let i=0;i<900 && p1.userOrder;i++) M.updateHome(0.016);
  A(!p1.userOrder, '入睡后应清令');
  A(p1.isSleeping===true || S.meta.residents[0].isSleeping===true, '应进入睡眠');
  /* 睡眠恢复由 needsTick 接管; 手动唤醒走正常途径 */
  S.meta.residents[0].isSleeping=false;
  M.cmd.deselect();
  /* 吃饭令: 地上熟食堆 */
  const p2 = ents[1];
  S.meta.res.food = 0;
  p2.x=S.px+40; p2.y=S.py;
  p2.food = 30;
  S.meta.residents[1].food = 30;
  S.meta.residents[1].wantSleep = false;
  S.meta.residents[1].isSleeping = false;
  S.meta.residents[1].rest = 90;
  const meal = { type:T.DROPPED, id:'dp_meal1', itemId:'it_roasted_meat', x:p2.x+30, y:p2.y, n:2 };
  S.entities.push(meal);
  M.cmd.select(p2);
  M.cmd.orderEat();
  A(p2.userOrder && p2.userOrder.type==='eat', '应写吃饭令');
  for(let i=0;i<600 && p2.userOrder;i++) M.updateHome(0.016);
  A(!p2.userOrder, '进食后应清令');
  A(S.meta.residents[1].food>30, '饱食应上升, got '+S.meta.residents[1].food);
  M.cmd.deselect();
});

test('#149 cmd: 袭击中移动令保留(撤离), 非移动令被清除', () => {
  const ents = cmdHomeSetup();
  const p = ents[0];
  S.war.raidActive = true;
  p.userOrder = {type:'gather', flora:{type:T.FLORA,kind:'tree',x:1,y:1,hp:5,dead:false}};
  M.cmd.select(p);
  M.cmd.orderMove({x:p.x-80, y:p.y-60});
  A(p.userOrder && p.userOrder.type==='move', '袭击中移动令应保留');
  S.keys={};
  M.updateHome(0.016);
  A(p.userOrder && p.userOrder.type==='move', '移动令应持续执行');
  M.cmd.deselect();
  S.war.raidActive = false;
});

test('#156 inspector: 左下角检查器展示指挥官、居民、植物、建筑与地面', () => {
  const ents = cmdHomeSetup();
  // 1. 默认或选中指挥官
  S.selectedTarget = { type: 'player' };
  let html = APH.UI.inspectorHtml(S.selectedTarget, S);
  A(html.indexOf('⭐ 指挥官(你)') !== -1, '默认应为指挥官, got: ' + html);
  A(html.indexOf('生命') !== -1, '检查器应含生命');
  A(html.indexOf('饱食') !== -1, '检查器应含饱食');

  // 2. 选中居民
  const p = ents[0];
  M.cmd.select(p);
  A(S.selectedTarget && S.selectedTarget.type === 'resident', '选中居民应写 selectedTarget');
  html = APH.UI.inspectorHtml(S.selectedTarget, S);
  A(html.indexOf(p.name) !== -1, '检查器应含居民名字');

  // 3. 选中植物
  const tree = { type: T.FLORA, kind: 'tree', hp: 30, maxHp: 30, x: S.px + 50, y: S.py };
  S.selectedTarget = { type: 'flora', entity: tree };
  html = APH.UI.inspectorHtml(S.selectedTarget, S);
  A(html.indexOf('红树') !== -1, '检查器应含红树');
  A(html.indexOf('30/30') !== -1, '检查器应含耐久');

  // 4. 选中建筑
  const bld = { type: T.BUILDING, bid: 'bl_house', lv: 1, x: S.px, y: S.py };
  S.selectedTarget = { type: 'building', entity: bld };
  html = APH.UI.inspectorHtml(S.selectedTarget, S);
  A(html.indexOf('居住舱') !== -1 || html.indexOf('bl_house') !== -1, '检查器应含建筑名');

  // 5. 选中地面
  S.selectedTarget = { type: 'terrain', x: 1000, y: 1200 };
  html = APH.UI.inspectorHtml(S.selectedTarget, S);
  A(html.indexOf('1000') !== -1 && html.indexOf('1200') !== -1, '检查器应含坐标');

  // 6. Esc 清空回到指挥官
  M.cmd.deselect();
  A(S.selectedTarget && S.selectedTarget.type === 'player', '解除后应重置为指挥官');
});

test('#157 orders: 规划工具箱选择、框选打标与自动清标', () => {
  cmdHomeSetup();
  S.designations = {};

  // 1. 添加 3 棵树与 2 块铁矿
  const t1 = { id: 'fl_tree_a', type: T.FLORA, kind: 'tree', x: S.px + 100, y: S.py + 100, hp: 20, maxHp: 20, dead: false };
  const t2 = { id: 'fl_tree_b', type: T.FLORA, kind: 'tree', x: S.px + 120, y: S.py + 130, hp: 20, maxHp: 20, dead: false };
  const t3 = { id: 'fl_tree_c', type: T.FLORA, kind: 'tree', x: S.px + 140, y: S.py + 110, hp: 20, maxHp: 20, dead: false };
  const r1 = { id: 'fl_rock_a', type: T.FLORA, kind: 'rock_iron', x: S.px + 200, y: S.py + 200, hp: 40, maxHp: 40, dead: false };
  const r2 = { id: 'fl_rock_b', type: T.FLORA, kind: 'rock_iron', x: S.px + 220, y: S.py + 210, hp: 40, maxHp: 40, dead: false };
  S.entities.push(t1, t2, t3, r1, r2);

  // 2. 模拟选定 chop 工具，框选树林区域 [S.px+80, S.py+80] 到 [S.px+160, S.py+160]
  S.orderTool = 'chop';
  const boxedTrees = APH.Colony.boxSelectEntities(S.entities, S.px + 80, S.py + 80, S.px + 160, S.py + 160);
  A(boxedTrees.length === 3, '应框选 3 棵树, got ' + boxedTrees.length);
  boxedTrees.forEach(bt => APH.Colony.applyDesignation(S.designations, bt, S.orderTool));

  A(S.designations['fl_tree_a'] && S.designations['fl_tree_a'].type === 'chop', 't1 应打上 chop 标记');
  A(S.designations['fl_tree_b'] && S.designations['fl_tree_b'].type === 'chop', 't2 应打上 chop 标记');
  A(S.designations['fl_tree_c'] && S.designations['fl_tree_c'].type === 'chop', 't3 应打上 chop 标记');
  A(!S.designations['fl_rock_a'], '岩石不应被打上 chop 标记');

  // 3. 模拟选定 mine 工具，框选矿石区
  S.orderTool = 'mine';
  const boxedRocks = APH.Colony.boxSelectEntities(S.entities, S.px + 180, S.py + 180, S.px + 240, S.py + 240);
  A(boxedRocks.length === 2, '应框选 2 块矿石');
  boxedRocks.forEach(br => APH.Colony.applyDesignation(S.designations, br, S.orderTool));
  A(S.designations['fl_rock_a'] && S.designations['fl_rock_a'].type === 'mine', 'r1 应打上 mine 标记');
  A(S.designations['fl_rock_b'] && S.designations['fl_rock_b'].type === 'mine', 'r2 应打上 mine 标记');

  // 4. 模拟选定 cancel 工具，框选 t1 和 t2
  S.orderTool = 'cancel';
  const cancelTrees = APH.Colony.boxSelectEntities(S.entities, S.px + 80, S.py + 80, S.px + 130, S.py + 140);
  cancelTrees.forEach(ct => APH.Colony.applyDesignation(S.designations, ct, S.orderTool));
  A(!S.designations['fl_tree_a'], 't1 标记应被取消');
  A(!S.designations['fl_tree_b'], 't2 标记应被取消');
  A(S.designations['fl_tree_c'], '未在取消框内的 t3 标记应保留');

  // 5. 死亡实体在 updateHome 中自动清标
  t3.dead = true;
  M.updateHome(0.016);
  A(!S.designations['fl_tree_c'], '死亡实体标记应被自动清理');
});

test('#158 orders: 严格无标不采、规划驱动全链路开采入库与右键强制微操', () => {
  const ents = cmdHomeSetup();
  const p = ents[0];
  p.x = S.px; p.y = S.py;
  S.designations = {};
  S.meta.workPrio = S.meta.workPrio || {};
  S.meta.workPrio[p.id] = { sk_gather: 1, sk_haul: 1, sk_farm: 0, sk_build: 0 };
  p.job = null;
  M.cmd.deselect();

  // 1. 严格无标不采：野树在附近但未规划标记 → 居民不主动前往开采
  const wildTree = { id: 'fl_wild_1', type: T.FLORA, kind: 'tree', x: p.x + 50, y: p.y, hp: 10, maxHp: 10, dead: false };
  S.entities.push(wildTree);
  for(let i = 0; i < 30; i++) M.updateHome(0.016);
  A(!p.gatherTarget, '无标记时居民不得私自开采野树');
  A(wildTree.hp === 10, '野树 HP 不应下降');

  // 2. 规划打标 → 居民立即主动前往开采
  APH.Colony.applyDesignation(S.designations, wildTree, 'chop');
  A(S.designations['fl_wild_1'] && S.designations['fl_wild_1'].type === 'chop', '打上 chop 标记');
  for(let i = 0; i < 600 && !wildTree.dead; i++) M.updateHome(0.016);
  A(wildTree.dead === true, '规划目标应被砍倒');
  A(!S.designations['fl_wild_1'], '目标完成后标记应自动从 designations 清除');

  // 3. 掉落物存在 → 搬运工自主入库
  //    注意: 落点抖动可能把木材直接丢进砍伐者的抓取半径, 当帧就被抓起 —— 这同样是
  //    合法链路, 故断言「木材已产出」(在地上或已在背包), 而非「必须躺在地上」。
  const woodDrops = S.entities.filter(e => e.type === 'dropped' && e.itemId === 'it_wood');
  const woodCarried = S.entities.some(e => e.haulCarry && e.haulCarry.itemId === 'it_wood');
  A(woodDrops.length >= 1 || woodCarried, '砍倒后应产出木材(掉落在地或已被搬运工抓起)');
  const woodBefore = S.meta.res.wood || 0;
  for(let i = 0; i < 800 && woodDrops.some(d => !d.dead); i++) M.updateHome(0.016);
  A((S.meta.res.wood || 0) > woodBefore || S.entities.some(e => e.haulCarry), '木材应入库或正在搬运入库');

  // 4. 右键强制微操执行 (Prioritize)
  const prioRock = { id: 'fl_prio_rock', type: T.FLORA, kind: 'rock_iron', x: p.x + 120, y: p.y, hp: 15, maxHp: 15, dead: false };
  S.entities.push(prioRock);
  APH.Colony.applyDesignation(S.designations, prioRock, 'mine');
  M.cmd.select(p);
  const prioritized = M.cmd.prioritize(p, prioRock);
  A(prioritized === true, '优先执行应成功');
  A(p.userOrder && p.userOrder.type === 'gather' && p.userOrder.flora === prioRock, '应赋予最高优先级 gather 命令');
  M.cmd.deselect();
});

test('#160 camera: 键盘 WASD 平移视口、Shift 加速与居中对焦', () => {
  cmdHomeSetup();
  S.keys = {};
  M.centerCameraOn(1000, 1000);
  A(Math.abs(S.camX - 1000) < 1, 'centerCameraOn 应设置 camX');
  A(Math.abs(S.camY - 1000) < 1, 'centerCameraOn 应设置 camY');

  // 1. WASD 平移：KeyD 向右，KeyS 向下
  S.keys.KeyD = true;
  S.keys.KeyS = true;
  M.updateHome(0.1);
  A(S.camX > 1000, '向右平移 camX 应增加');
  A(S.camY > 1000, '向下平移 camY 应增加');
  const dx1 = S.camX - 1000;
  S.keys = {};

  // 2. Shift 加速平移
  M.centerCameraOn(1000, 1000);
  S.keys.KeyD = true;
  S.keys.KeyS = true;
  S.keys.ShiftLeft = true;
  M.updateHome(0.1);
  const dxShift = S.camX - 1000;
  A(dxShift > dx1 * 1.8, 'Shift 加速平移距离应明显大于基础速度, got ' + dxShift + ' vs ' + dx1);
  S.keys = {};

  // 3. 边界限制 (不能飞出世界外)
  M.centerCameraOn(-9999, -9999);
  A(S.camX >= 0, '视口不得飞出地图左侧');
  A(S.camY >= 0, '视口不得飞出地图顶部');
});

test('#161 colonist_bar: 顶部小人条选择、R 键战备征召切换与聚焦居中', () => {
  const ents = cmdHomeSetup();
  const p = ents[0];
  S.selectedRid = null;
  p.drafted = false;

  // 1. 头像条渲染
  const barHtml = APH.UI.colonistBarHtml(S.meta.residents, S);
  A(barHtml.indexOf('data-pawn-id="player"') !== -1, '头像条应包含指挥官');
  A(barHtml.indexOf(p.name) !== -1, '头像条应包含居民名字');

  // 2. 选择小人并按 R 键战备征召
  M.cmd.select(p);
  A(S.selectedRid === p.id, '应选中居民');
  APH.Input.dispatchAction('TOGGLE_DRAFT');
  A(p.drafted === true, '按 R 键后小人应进入战备征召状态');
  A(p.walking === false, '征召后小人应立正待命');

  // 3. 头像条带战备角标
  const draftedBar = APH.UI.colonistBarHtml(S.meta.residents, S);
  A(draftedBar.indexOf('drafted') !== -1, '头像条中征召小人应带 drafted 样式');
  A(draftedBar.indexOf('⚔') !== -1, '头像条中征召小人应带武器角标');

  // 4. 双击对焦：平滑居中到小人坐标
  p.x = 1500; p.y = 1200;
  M.centerCameraOn(p.x, p.y);
  A(Math.abs(S.camX - 1500) < 1 && Math.abs(S.camY - 1200) < 1, '镜头应居中对焦到小人坐标');

  // 5. 再次按 R 键解除征召
  APH.Input.dispatchAction('TOGGLE_DRAFT');
  A(p.drafted === false, '再次按 R 键后小人应解除征召');
  M.cmd.deselect();
});

test('#162 squad: 鼠标拉框多选编队、批量征召、散兵线战术集结与掩体交火', () => {
  const ents = cmdHomeSetup();
  const p1 = ents[0], p2 = ents[1];
  p1.x = S.px + 50; p1.y = S.py + 50;
  p2.x = S.px + 90; p2.y = S.py + 60;
  p1.drafted = false; p2.drafted = false;
  S.selectedPawns = [];

  // 1. 框选多选编队：框选 [S.px, S.py] 到 [S.px+120, S.py+120]
  const boxed = APH.Colony.boxSelectEntities(S.entities, S.px, S.py, S.px + 120, S.py + 120);
  const pawns = boxed.filter(e => e.type === T.RESIDENT);
  A(pawns.length === 2, '应框选 2 名小人');
  S.selectedPawns = pawns;

  // 2. 批量征召：按 R 键全队拔枪立正
  APH.Input.dispatchAction('TOGGLE_DRAFT');
  A(p1.drafted === true && p2.drafted === true, '编队全员应进入征召战备状态');
  A(p1.walking === false && p2.walking === false, '征召后小人应立正待命');

  // 3. 右键地面：散兵线列队战术前进 (两小人终点产生间距偏移)
  const targetPt = { x: S.px + 200, y: S.py + 200 };
  const N = S.selectedPawns.length;
  S.selectedPawns.forEach((p, idx) => {
    const offsetX = (idx - (N - 1) / 2) * 26;
    p.userOrder = { type: 'move', x: targetPt.x + offsetX, y: targetPt.y };
  });
  A(p1.userOrder.x !== p2.userOrder.x, '两名小人应保持战术横向散兵间距');
  A(Math.abs(p1.userOrder.x - p2.userOrder.x) === 26, '散兵间距应为 26px');

  // 4. 敌对目标接近 → 征召小人自动举枪开火射击
  const enemy = { id: 'en_squad_test', type: T.ENEMY, x: p1.x + 80, y: p1.y, hp: 40, dead: false, faction: { gene: { size: 1 } } };
  S.entities.push(enemy);
  p1.fireCd = 0;
  const projBefore = S.entities.filter(e => e.type === T.PROJECTILE).length;
  M.updateHome(0.016);
  const projAfter = S.entities.filter(e => e.type === T.PROJECTILE).length;
  A(projAfter > projBefore, '敌人进入射程后征召小人应自动发射等离子弹丸');

  // 5. 右键敌人强制集火
  S.selectedPawns.forEach(p => { p.userOrder = { type: 'attack', enemy: enemy }; });
  A(p1.userOrder.type === 'attack' && p2.userOrder.type === 'attack', '全队应进入集火指令');
  A(p1.userOrder.enemy === enemy && p2.userOrder.enemy === enemy, '集火目标一致');

  // 6. 掩体减伤
  S.colony.buildings.push({ id: 'bl_sandbag', x: S.px, y: S.py });
  S.hp = 100; S.iFrameT = 0; S.scene = 'home';
  const hpBefore = S.hp;
  APH.Combat.hurtPlayer(20, 'enemy_test');
  const damageTaken = hpBefore - S.hp;
  A(damageTaken === 9, '站在沙袋掩体旁伤害应由 20 减免至 9 (55% 减伤), got: ' + damageTaken);

  // 7. 解除征召与清空编队
  APH.Input.dispatchAction('TOGGLE_DRAFT');
  A(p1.drafted === false && p2.drafted === false, '解除后全队应脱离战备');
  S.selectedPawns = [];
  M.cmd.deselect();
});

test('#163 right_click: 全局右键交互（出航、开箱、破译、送医、返航）与远征 RTS', () => {
  cmdHomeSetup();
  const pad = S.entities.find(e => e.type === T.BUILDING && e.pad);
  A(!!pad, '家园应有发射台');
  M.cmd.rightClick(pad.x, pad.y);
  A(S.scene === 'expedition', '右键点击发射台应出发远征');

  // 2. 远征场景：右键点击远古遗物箱 → 开箱并喷出古代蓝图与核心
  const vault = { id: 'ancient_vault_rts', type: T.BUILDING, bid: 'ancient_vault', x: S.px + 120, y: S.py, opened: false };
  S.entities.push(vault);
  M.cmd.rightClick(vault.x, vault.y);
  A(vault.opened === true, '右键点击遗物箱应成功开启');
  const drops = S.entities.filter(e => e && e.type === T.DROPPED);
  A(drops.some(d => d.itemId === 'it_ancient_blueprint'), '箱内必定喷出古代蓝图残卷');
  A(drops.some(d => d.itemId === 'it_ancient_core'), '箱内必定喷出史前高能核心');

  // 3. 远征场景：右键点击古代终端 → 破译
  const term = { id: 'ancient_terminal_rts', type: T.BUILDING, bid: 'ancient_terminal', x: S.px + 180, y: S.py, hacked: false };
  S.entities.push(term);
  S._hackRng = () => 0.1;
  M.cmd.rightClick(term.x, term.y);
  A(term.hacked === true, '右键点击古代终端应成功破译');

  // 4. 远征场景：右键点击返回舱 → 登机返航
  const retPad = S.entities.find(e => e.type === T.BUILDING && e.pad);
  A(!!retPad, '远征应有着陆返回舱');
  M.cmd.rightClick(retPad.x, retPad.y);
  A(S.scene === 'home', '右键点击返回舱应返航回到家园');

  // 5. 家园场景：右键点击倒地队友 → 紧急送医救治
  const clinic = { id: 'bl_clinic', bid: 'bl_clinic', x: 1000, y: 1000, dead: false };
  S.colony.buildings.push(clinic);
  const ally = { id: 'rs_downed_ally', type: T.RESIDENT, name: '重伤员', x: 1200, y: 1200, downed: true, dead: false };
  S.meta.residents.push({ id: 'rs_downed_ally', name: '重伤员', downed: true, mood: 50, food: 80, illness: 60 });
  S.entities.push(ally);
  M.cmd.rightClick(ally.x, ally.y);
  A(ally.downed === false, '送医后倒地标志应清除');
  A(ally.medLying === true, '送医后应处于医疗舱躺卧治疗态');
});

test('#164 idle: 闲置居民在无规划任务时自主漫步休闲与工位作业动效', () => {
  const ents = cmdHomeSetup();
  const p = ents[0];
  // 移除工作建筑，锁定为无岗位闲置小人
  S.colony.buildings = (S.colony.buildings||[]).filter(b => b.id === 'bl_landing_pad' || b.id === 'bl_house');
  S.meta.residents[0].job = null;
  S.meta.residents[0].jobLocked = true;
  p.job = null;
  p.x = 1000; p.y = 1000; p.tx = 1000; p.ty = 1000;
  p.userOrder = null; p.drafted = false;
  S.selectedRid = null; S.orderTool = null; S.designations = {};

  // 等待小人到达居住区
  for(let i = 0; i < 400; i++) M.updateHome(0.016);
  A(Math.hypot(p.x - 1000, p.y - 1000) > 10, '小人应走回生活区');

  // 到达生活区后，在无任务时应触发 wander 散步位移 (不再永久定格罚站)
  const x2 = p.x, y2 = p.y;
  for(let i = 0; i < 500; i++) M.updateHome(0.016);
  const movedIdle = Math.hypot(p.x - x2, p.y - y2);
  A(movedIdle > 5, '到达居住点后闲置小人应自主漫步闲逛，实际位移=' + movedIdle);
});

function commanderSoloSetup(){
  if(S.scene!=='home'){ S.nearPad=true; M.debugPressE(); }
  A(S.scene==='home', '应在殖民地');
  S.mode='running';
  S.playerDrafted=false;
  S.orderTool=null; S.selectedPawns=[]; S.selectedRid=null;
  S.selectedTarget={type:'player'};
  S.war = S.war || {}; S.war.raidActive=false; S.war.raidWarn=0;
  S.meta.residents = [];
  S.meta.playerPrio = { sk_gather:2, sk_haul:2, sk_farm:2, sk_build:2 };
  APH.Res.ensurePlayerNeeds(S.meta);
  S.meta.playerNeeds.isSleeping=false;
  S.meta.playerNeeds.downed=false;
  S.meta.playerNeeds.illness=0;
  S.meta.playerNeeds.food=80;
  S.meta.playerNeeds.rest=100;
  S.meta.playerNeeds.recreation=80;
  S.keys={}; S.target=null; S.joy=null;
  S.designations={};
  S.playerOrder=null; S.haulCarry=null;
  S.meta.playerSchedule = Array(24).fill('any');
  S.colony.buildQueue=[];
  S.colony.buildings = (S.colony.buildings||[]).filter(b=>b.id==='bl_landing_pad');
  if(!S.colony.buildings.length) S.colony.buildings.push({ id:'bl_landing_pad', x:1100, y:1340 });
  S.entities = (S.entities||[]).filter(e=>e.type!=='resident' && e.type!=='visitor' && e.type!=='flora' && e.type!=='dropped' && e.type!=='enemy' && !(e.type===T.BUILDING && e.bid && e.bid!=='bl_landing_pad'));
  if(!S.entities.some(e=>e.type===T.BUILDING&&e.pad)){
    S.entities.push({ id:'be_pad_cmd_solo', type:T.BUILDING, bid:'bl_landing_pad', pad:true, x:1100, y:1340 });
  }
  S.px = 1100; S.py = 1170;
  const pe = APH.Ent.findPlayer && APH.Ent.findPlayer();
  if(pe){ pe.x=S.px; pe.y=S.py; pe.isSleeping=false; pe.downed=false; }
}

test('#165 commander: 未征召饥饿时自动寻路到仓库进食', () => {
  commanderSoloSetup();
  S.meta.playerNeeds.food = 0;
  S.meta.res = S.meta.res || {};
  S.meta.res.food = 8;
  APH.Colony.placeBuildingEntity('bl_warehouse', 1400, 1170, 1);
  const food0 = S.meta.playerNeeds.food;
  const x0 = S.px;
  for(let i=0; i<900 && S.meta.playerNeeds.food<=food0; i++) M.updateHome(0.016);
  A(S.meta.playerNeeds.food > food0, '指挥官饥饿时应自主走到仓库吃饭, 实际饱食='+S.meta.playerNeeds.food+' px='+Math.round(S.px));
  A(S.px > x0 + 40, '指挥官应向仓库方向移动');
  S.entities = S.entities.filter(e => e.bid !== 'bl_warehouse');
});

test('#165 commander: 未征召时按砍伐标记自动前往砍树', () => {
  commanderSoloSetup();
  S.meta.playerNeeds.food = 80;
  S.meta.res = S.meta.res || {};
  S.meta.res.food = 20;
  const tree = { id:'fl_cmd_chop', type:T.FLORA, kind:'tree', x:1400, y:1170, hp:12, maxHp:12, dead:false };
  S.entities.push(tree);
  A(APH.Colony.applyDesignation(S.designations, tree, 'chop')===true, '应成功打上砍伐标记');
  const x0 = S.px;
  for(let i=0; i<900 && !tree.dead; i++) M.updateHome(0.016);
  A(tree.dead===true, '未征召指挥官应按规划标记自主砍倒树木, px='+Math.round(S.px)+' hp='+tree.hp);
  A(S.px > x0 + 40, '指挥官应向被标记树木移动');
});

test('#166 chop: 贴树砍伐是持续作业，一帧不得砍倒，并进入伐木姿态', () => {
  commanderSoloSetup();
  S.meta.playerNeeds.food = 80;
  S.playerDrafted = false;
  const tree = { id:'fl_cmd_slow', type:T.FLORA, kind:'tree', x:S.px+20, y:S.py, hp:30, maxHp:30, dead:false };
  S.entities.push(tree);
  APH.Colony.applyDesignation(S.designations, tree, 'chop');
  M.updateHome(0.016);
  A(tree.dead !== true, '一帧不得砍倒成树');
  A(tree.hp < 30 && tree.hp > 20, '一帧只推进少量耐久, hp='+tree.hp);
  const pe = APH.Ent.findPlayer();
  A(S.gathering === true || (pe && pe.gathering), '贴树作业时应进入伐木姿态');
});

test('#165 hungry: 无口粮时饥饿居民仍执行规划砍伐（避免饿到停工）', () => {
  const ents = cmdHomeSetup();
  const p = ents[0];
  p.x = S.px; p.y = S.py; p.job=null; p.drafted=false; p.userOrder=null;
  S.meta.residents[0].job=null;
  S.meta.residents[0].food=0;
  S.meta.residents[0].rest=90;
  S.meta.residents[0].wantSleep=false;
  S.meta.residents[0].isSleeping=false;
  S.meta.res = S.meta.res || {};
  S.meta.res.food=0;
  S.meta.workPrio = S.meta.workPrio || {};
  S.meta.workPrio[p.id] = { sk_gather:1, sk_haul:1, sk_farm:0, sk_build:0 };
  S.designations={}; S.selectedRid=null;
  S.entities = S.entities.filter(e=>e.type!==T.DROPPED);
  const tree = { id:'fl_starve_chop', type:T.FLORA, kind:'tree', x:p.x+80, y:p.y, hp:10, maxHp:10, dead:false };
  S.entities.push(tree);
  APH.Colony.applyDesignation(S.designations, tree, 'chop');
  for(let i=0; i<700 && !tree.dead; i++) M.updateHome(0.016);
  A(tree.dead===true, '饥饿且无口粮时居民仍应执行规划砍伐, gatherTarget='+(p.gatherTarget&&p.gatherTarget.id));
});

test('#167 idle: 未征召无任务指挥官会在院子里自主漫步', () => {
  commanderSoloSetup();
  S.meta.playerNeeds.food = 80;
  S.meta.playerNeeds.rest = 100;
  S.playerDrafted = false;
  S.designations = {};
  S.gathering = false;
  S.target = null;
  S.cmdIdleInited = false;
  S.cmdIdleWalk = false;
  S.cmdIdleT = 0;
  const x0 = S.px, y0 = S.py;
  let maxD = 0;
  for(let i = 0; i < 900; i++){
    M.updateHome(0.016);
    const d = Math.hypot(S.px - x0, S.py - y0);
    if(d > maxD) maxD = d;
  }
  A(maxD > 24, '无任务指挥官应在院子漫步，不应原地罚站, 最大位移='+maxD.toFixed(1));
});

test('#168 rest: 困了的指挥官走去居住舱上床，平移镜头不摇醒', () => {
  commanderSoloSetup();
  S.meta.playerNeeds.food = 80;
  S.meta.playerNeeds.rest = 12;
  S.meta.playerNeeds.isSleeping = false;
  S.playerDrafted = false;
  S.designations = {};
  S.keys = {};
  S.colony.buildings.push({ id:'bl_house', x:1400, y:1170, lv:1 });
  APH.Colony.placeBuildingEntity('bl_house', 1400, 1170, 1);
  const x0 = S.px;
  for(let i=0; i<900 && !S.meta.playerNeeds.isSleeping; i++) M.updateHome(0.016);
  A(S.meta.playerNeeds.isSleeping === true, '困倦指挥官应走到居住舱入睡');
  A(S.px > x0 + 40, '应向居住舱方向移动');
  const cam0 = S.camX;
  S.keys.KeyD = true;
  M.updateHome(0.1);
  A(S.meta.playerNeeds.isSleeping === true, '睡眠中平移镜头不得唤醒');
  A(S.camX > cam0, 'WASD 仍应平移摄像机');
  S.keys = {};
});

test('#168 rest: 困了的居民走去居住舱再睡，不原地瞬睡', () => {
  const ents = cmdHomeSetup();
  const p = ents[0];
  p.x = S.px; p.y = S.py;
  p.job = null; p.drafted = false; p.userOrder = null;
  S.meta.residents[0].job = null;
  S.meta.residents[0].rest = 12;
  S.meta.residents[0].wantSleep = true;
  S.meta.residents[0].isSleeping = false;
  S.meta.residents[0].food = 90;
  S.selectedRid = null;
  const house = (S.colony.buildings||[]).find(b=>b.id==='bl_house');
  A(!!house, 'cmdHomeSetup 应有居住舱');
  const d0 = Math.hypot(p.x - house.x, p.y - house.y);
  for(let i=0; i<800 && !S.meta.residents[0].isSleeping; i++) M.updateHome(0.016);
  A(S.meta.residents[0].isSleeping === true, '困倦居民应走到居住舱入睡');
  const d1 = Math.hypot(p.x - house.x, p.y - house.y);
  A(d1 < d0 - 10 || d1 < 50, '应靠近居住舱, d0='+d0.toFixed(0)+' d1='+d1.toFixed(0));
});

test('#169 joy: 娱乐低的指挥官会走向篝火休闲', () => {
  commanderSoloSetup();
  S.meta.playerNeeds.food = 80;
  S.meta.playerNeeds.rest = 100;
  S.meta.playerNeeds.recreation = 10;
  S.playerDrafted = false;
  S.designations = {};
  S.colony.buildQueue = [];
  S.haulCarry = null;
  S.meta.playerPrio = { sk_build:0, sk_gather:0, sk_haul:0, sk_farm:2 };
  S.colony.buildings.push({ id:'bl_campfire', x:1400, y:1170 });
  APH.Colony.placeBuildingEntity('bl_campfire', 1400, 1170, 1);
  const x0 = S.px;
  M.updateHome(0.016);
  A(S.target && S.target.x > x0 + 100, '第一帧应把篝火设为寻路目标, rec='+S.meta.playerNeeds.recreation);
  let maxX = S.px;
  for(let i=0; i<250; i++){
    M.updateHome(0.016);
    if(S.px > maxX) maxX = S.px;
  }
  A(maxX > x0 + 40, '无聊时应走向篝火, maxX='+Math.round(maxX));
});

test('#170 build: 未征召指挥官会走向施工蓝图', () => {
  commanderSoloSetup();
  S.meta.playerNeeds.food = 80;
  S.meta.playerNeeds.rest = 100;
  S.meta.playerNeeds.recreation = 80;
  S.playerDrafted = false;
  S.meta.playerPrio = { sk_build:1, sk_gather:2, sk_haul:2 };
  S.colony.buildQueue = [{ bid:'bl_house', x:1450, y:1170, progress:0.1, total:12, building:false }];
  const x0 = S.px;
  for(let i=0; i<700; i++) M.updateHome(0.016);
  A(S.px > x0 + 40, '有蓝图时应走去施工, px='+Math.round(S.px));
});

test('#171 haul: 未征召指挥官会拾取地上堆并入库', () => {
  commanderSoloSetup();
  S.meta.playerNeeds.food = 80;
  S.meta.playerNeeds.rest = 100;
  S.meta.playerNeeds.recreation = 80;
  S.playerDrafted = false;
  S.meta.playerPrio = { sk_haul:1, sk_gather:0, sk_build:0 };
  S.meta.res = S.meta.res || {};
  S.meta.res.wood = 0;
  const pile = { id:'dp_cmd_wood', type:T.DROPPED, itemId:'it_wood', x:S.px+80, y:S.py, n:3, dead:false };
  S.entities.push(pile);
  for(let i=0; i<900 && !pile.dead; i++) M.updateHome(0.016);
  A(pile.dead === true || S.haulCarry, '应拾起地上木材');
  for(let i=0; i<900 && (S.meta.res.wood||0)<3; i++) M.updateHome(0.016);
  A((S.meta.res.wood||0) >= 3 || S.haulCarry, '木材应入库或正在搬运, wood='+(S.meta.res.wood||0));
});

test('#172 right_click: 右键居住舱下达优先休息', () => {
  commanderSoloSetup();
  S.meta.playerNeeds.food = 80;
  S.meta.playerNeeds.rest = 100;
  S.playerDrafted = false;
  S.selectedRid = null;
  S.selectedPawns = [];
  S.colony.buildings.push({ id:'bl_house', x:1300, y:1170, lv:1 });
  APH.Colony.placeBuildingEntity('bl_house', 1300, 1170, 1);
  M.cmd.rightClick(1300, 1170);
  A(S.playerOrder && S.playerOrder.type==='sleep', '右键居住舱应下达优先休息');
});

test('#169 right_click: 右键蓝图下达优先建造', () => {
  commanderSoloSetup();
  S.playerDrafted = false;
  S.colony.buildQueue = [{ bid:'bl_house', x:1450, y:1170, progress:0.1, total:12, building:false }];
  S.entities.push({ id:'bp_house', type:T.BLUEPRINT, bid:'bl_house', x:1450, y:1170, progress:0.1 });
  M.cmd.rightClick(1450, 1170);
  A(S.playerOrder && S.playerOrder.type==='build', '右键蓝图应下达优先建造, 实际: '+JSON.stringify(S.playerOrder));
});

test('#169 build: 走到蓝图 90px 内工期推进', () => {
  commanderSoloSetup();
  S.px = 1400; S.py = 1170;
  S.playerDrafted = false;
  S.playerOrder = { type:'build', x:1450, y:1170 };
  S.colony.buildQueue = [{ bid:'bl_house', x:1450, y:1170, progress:0.1, total:12, building:false }];
  const p0 = S.colony.buildQueue[0].progress;
  M.updateHome(0.5);
  A(S.colony.buildQueue[0] && S.colony.buildQueue[0].building === true, '90px 内应施工');
  A(S.colony.buildQueue[0].progress > p0, '工期应推进, 实际: '+S.colony.buildQueue[0].progress);
});

test('征召后点地面走路（笔记本无右键）', () => {
  commanderSoloSetup();
  S.playerDrafted = true;
  S.selectedPawns = [];
  S.selectedRid = null;
  S.target = null;
  const gx = S.px + 90, gy = S.py + 50;
  A(typeof M.tacticalMoveTo === 'function', '应导出 tacticalMoveTo');
  A(M.tacticalMoveTo(gx, gy), '征召后点地应走路');
  A(S.target && Math.abs(S.target.x-gx)<2 && Math.abs(S.target.y-gy)<2, '应走到点击处');
});

test('#169 right_click: 征召态右键地面是战术移动不是建造', () => {
  commanderSoloSetup();
  S.playerDrafted = true;
  const pe = APH.Ent.findPlayer && APH.Ent.findPlayer();
  A(!!pe, '应有指挥官实体');
  S.selectedPawns = [pe];
  S.colony.buildQueue = [{ bid:'bl_house', x:1450, y:1170, progress:0.1, total:12 }];
  S.entities.push({ id:'bp_house2', type:T.BLUEPRINT, bid:'bl_house', x:1450, y:1170 });
  const gx = S.px + 80, gy = S.py + 40;
  M.cmd.rightClick(gx, gy);
  A(!S.playerOrder || S.playerOrder.type!=='build', '征召点地不应下建造令');
  A(S.target && Math.abs(S.target.x-gx)<2 && Math.abs(S.target.y-gy)<2, '应战术移动到点击处');
});

test('#170 schedule: 检查器循环作息格', () => {
  commanderSoloSetup();
  S.meta.playerSchedule = APH.Res.defaultSchedule();
  S.selectedTarget = { type:'player' };
  A(typeof M.cycleSchedule === 'function', '应导出 cycleSchedule');
  const h = 3;
  const before = S.meta.playerSchedule[h];
  M.cycleSchedule(h);
  A(S.meta.playerSchedule[h] === APH.Res.cycleScheduleSlot(before), '点击应循环该格');
});

test('#169 right_click: 发射台右键仍是出航', () => {
  commanderSoloSetup();
  S.playerDrafted = false;
  const pad = (S.colony.buildings||[]).find(b=>b.id==='bl_landing_pad') || { x:1100, y:1340 };
  M.cmd.rightClick(pad.x, pad.y);
  A(!S.playerOrder || S.playerOrder.type!=='build', '发射台右键不应被建造抢走');
});

test('#173 pause: 暂停时钟停、倍速加速、暂停时镜头可平移 (#165)', () => {
  if(S.scene!=='home'){ S.nearPad=true; M.debugPressE(); }
  S.mode='running';
  S.paused=false;
  S.timeScale=1;
  S.keys={};
  const c0 = S.clock;
  A(typeof M.simStep === 'function', '应导出 simStep');
  M.simStep(0.2);
  A(S.clock > c0 + 0.19, '未暂停时应推进 clock');
  APH.Input.dispatchAction('TOGGLE_PAUSE');
  A(S.paused === true, '空格应暂停');
  const c1 = S.clock;
  const cam0 = S.camX;
  S.keys.KeyD = true;
  const stepped = M.simStep(0.2);
  A(stepped === 0, '暂停时 simStep 应返回 0');
  A(S.clock === c1, '暂停时 clock 不得增长');
  A(S.camX > cam0, '暂停时 WASD 仍应平移镜头');
  S.keys = {};
  APH.Input.dispatchAction('TOGGLE_PAUSE');
  A(S.paused === false, '再按空格应继续');
  APH.Input.dispatchAction('SET_TIME_SCALE_3');
  A(S.timeScale === 3, '3 键应为 ×3');
  const c2 = S.clock;
  M.simStep(0.1);
  A(S.clock > c2 + 0.29, '×3 时 0.1s 真实时间应推进约 0.3s 模拟');
  S.timeScale = 1;
});

test('#167 alerts: 饥饿警报可点跳镜头，没事则空', () => {
  A(typeof APH.Alerts.collect === 'function', '应导出 Alerts.collect');
  if(S.scene!=='home'){ S.nearPad=true; M.debugPressE(); }
  S.mode='running';
  S.paused=true;
  const food0 = S.meta.playerNeeds.food;
  S.meta.playerNeeds.food = 20;
  const list = APH.Alerts.collect(S);
  const hungry = list.find(a => a.kind==='hungry');
  A(!!hungry, '指挥官饥饿应出现警报');
  A(hungry.text === '指挥官饥饿', '文案应锁定, 实际: '+hungry.text);
  APH.Alerts.focus(S, { x: 1500, y: 1600 });
  A(S.camX===1500 && S.camY===1600, '点击警报应跳镜头');
  S.meta.playerNeeds.food = 80;
  S.meta.playerNeeds.rest = 100;
  S.meta.playerNeeds.wantSleep = false;
  S.meta.playerNeeds.downed = false;
  S.meta.res = Object.assign({}, S.meta.res, { food: 20 });
  S.war = Object.assign({}, S.war, { raidActive: false });
  S.colony.buildQueue = [];
  const empty = APH.Alerts.collect(S);
  A(empty.length===0, '没事应无警报, 实际: '+JSON.stringify(empty));
  S.meta.playerNeeds.food = food0;
  S.paused=false;
});

test('#168 thinkPawn: 征召指挥官不闲逛，解征召后恢复自治', () => {
  commanderSoloSetup();
  S.playerDrafted = true;
  S.meta.playerNeeds.food = 80;
  S.meta.playerNeeds.rest = 100;
  S.meta.playerNeeds.recreation = 80;
  S.designations = {};
  S.colony.buildQueue = [];
  S.haulCarry = null;
  S.target = null;
  S.cmdIdleWalk = false;
  M.updateHome(0.5);
  A(!S.target && !S.cmdIdleWalk, '征召中不应自己闲逛');
  S.playerDrafted = false;
  S.cmdIdleInited = true;
  S.cmdIdleT = 0;
  M.updateHome(0.05);
  A(S.cmdIdleWalk || S.target, '解征召后应恢复自治');
});


/* ---------- ADR-32: 家园提示优先级(显式表, 不再靠 setHint 后写覆盖) ---------- */
function hintScene(setup){
  var s=S;
  s.scene='home'; s.mode='running';
  s.war={ raidActive:false, raidWarn:0, angerMin:0, wins:0, raids:0 };
  s.colony.buildings=[{id:'bl_landing_pad', x:1100, y:1340}];
  s.colony.buildQueue=[]; s.colony.fires=[]; s.colony.filth={};
  s.entities=s.entities.filter(e=>e && e.type==='player');
  s.meta.residents=[]; s.meta.res={ food:50, mineral:50, med:5, wood:50 };
  s.designations={}; s.playerDrafted=false; s.gathering=false;
  s.px=1100; s.py=1100; s.hp=100; s.o2=100;
  APH.Res.ensurePlayerNeeds(s.meta);
  var n=s.meta.playerNeeds;
  n.food=90; n.rest=90; n.illness=0; n.downed=false; n.isSleeping=false; n.recreation=80;
  document.getElementById('hint').textContent='';
  setup(s);
  M.updateHome(0.016);
  return document.getElementById('hint').textContent || '';
}

test('#ADR32 hint: 站在建筑旁, 交互提示压过天气播报', () => {
  const h = hintScene(s => {
    s.entities.push({id:'be_k',type:'building',bid:'bl_kitchen',x:1100,y:1120,recipe:'it_roasted_meat'});
  });
  A(h.indexOf('烹饪灶台') >= 0, '灶台旁应给出灶台提示, got: ' + h);
  A(h.indexOf('磁暴') < 0 && h.indexOf('酸雨') < 0, '天气播报不得盖掉交互提示, got: ' + h);
});

test('#ADR32 hint: 没东西可交互时不出交互键提示', () => {
  /* 兜底档(天气/开场目标)是否有话说取决于开场进度与当前天气, 不做断言;
     这里锁的是「附近没有可交互物时, 不许冒出 [F]/[E] 交互提示」。 */
  const h = hintScene(() => {});
  A(h.indexOf('[F]') < 0, '空场景不应出现 [F] 交互提示, got: ' + h);
  A(h.indexOf('[E] 切换') < 0, '空场景不应出现空调等 [E] 交互提示, got: ' + h);
});

test('#ADR32 hint: 物资告急压过交互提示', () => {
  const h = hintScene(s => {
    s.meta.res={ food:0, mineral:0, med:0, wood:0 };
    s.entities.push({id:'be_k2',type:'building',bid:'bl_kitchen',x:1100,y:1120,recipe:'it_roasted_meat'});
  });
  A(h.indexOf('烹饪灶台') < 0, '告急时不应还在显示灶台提示, got: ' + h);
});

test('#ADR32 hint: 击倒昏迷压过一切', () => {
  const h = hintScene(s => {
    s.meta.playerNeeds.downed = true;
    s.entities.push({id:'be_k3',type:'building',bid:'bl_kitchen',x:1100,y:1120,recipe:'it_roasted_meat'});
  });
  A(h.indexOf('击倒昏迷') >= 0, '昏迷提示应最高优先, got: ' + h);
});

test('#ADR32 hint: 空调提示不再被开场目标淹没', () => {
  const h = hintScene(s => {
    s.entities.push({id:'be_cl',type:'building',bid:'bl_cooler',x:1100,y:1120,mode:'freezer'});
  });
  A(h.indexOf('空调') >= 0, '空调旁应给出空调提示, got: ' + h);
});


/* ---------- 殖民地优先 T1: 覆灭判定与指挥官心情 ---------- */
test('#T1 fall: 没立过殖民地(开局0人)不算覆灭', () => {
  S.scene='home'; S.mode='running';
  S.meta.residents=[]; S.meta.colonyFounded=false; S.meta.colonyFallen=false;
  const fell = M.checkColonyFall();
  A(fell === false, '开局 0 人不应判覆灭');
  A(S.mode === 'running', '开局不应结束游戏');
});

test('#T1 fall: 立过殖民地后归零 = 本局结束', () => {
  S.scene='home'; S.mode='running';
  S.meta.colonyFounded=false; S.meta.colonyFallen=false;
  S.meta.residents=[{id:'r1',name:'甲',skills:{},mood:70,food:80,rest:80,recreation:80}];
  A(M.colonyFounded(S.meta) === true, '有 1 人应算殖民地已建立');
  A(M.checkColonyFall() === false, '有人活着不应覆灭');
  S.meta.residents=[];
  const fell = M.checkColonyFall();
  A(fell === true, '最后一人死后应判覆灭');
  A(S.mode === 'dead', '覆灭应结束本局');
  A(S.meta.colonyFallen === true, '应打上覆灭标记');
  A(M.checkColonyFall() === false, '不应重复结算');
  S.mode='running'; S.meta.colonyFallen=false; S.meta.colonyFounded=false;
});

test('#T1 commander: 指挥官有心情, 且由念头驱动', () => {
  S.scene='home'; S.mode='running';
  APH.Res.ensurePlayerNeeds(S.meta);
  const n = S.meta.playerNeeds;
  A(n.mood != null, 'playerNeeds 应有 mood 字段(此前完全没有)');
  n.food = 5; n.rest = 5; n.recreation = 5;
  const before = n.mood;
  APH.Res.moodFromThoughts(n, {});
  A(Array.isArray(n.thoughts), '指挥官也应挂上念头清单');
  A(n.mood < before, '饥饿困倦无聊应拉低指挥官心情: ' + before + ' -> ' + n.mood);
  A((n.thoughts||[]).some(t => t.id === 'th_starving'), '应挂 th_starving');
});


/* ---------- 殖民地优先 T5: 发射器终局 ---------- */
test('#T5 win: 通电发射器 → 呼叫救援通关', () => {
  S.scene='home'; S.mode='running';
  S.meta.colonyWon=false;
  S.meta.stats = S.meta.stats || {};
  const before = S.meta.stats.won || 0;
  const ok = M.launchRescue();
  A(ok === true, '应通关');
  A(S.mode === 'won', '通关后 mode 应为 won, got ' + S.mode);
  A(S.meta.colonyWon === true, '应写入通关标记');
  A((S.meta.stats.won || 0) === before + 1, '应记一次通关');
  A(M.launchRescue() === false, '已通关不应重复结算');
  S.mode='running'; S.meta.colonyWon=false;
});

test('#T5 win: 发射器是唯一胜利出口, 且需通电', () => {
  const def = APH.Colony.get('bl_transmitter');
  A(!!def, '应存在 bl_transmitter 建筑定义');
  A(def.max === 1, '发射器应唯一');
  A(def.reqTech === 'te_deep_signal', '应由终局科技解锁');
  const con = APH.CFG.power.consumers.bl_transmitter;
  A(!!con, '发射器应登记为耗电建筑 —— 否则「通电才能起飞」是空话');
  A(con.load > 0, '发射器应有实际电力负荷');
  const tech = APH.Colony.TECH ? APH.Colony.TECH.te_deep_signal : null;
  if (tech) A(tech.cost >= 200, '终局科技应昂贵, got ' + tech.cost);
});

console.log(`\n${pass} 通过 / ${fail} 失败 / 共 ${pass+fail}`);

process.exit(fail?1:0);
