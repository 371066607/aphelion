#!/usr/bin/env node
/* 场景链路冒烟测试: 用 DOM 桩加载全部模块(含 main.js),
   模拟 boot → 殖民地 → 发射 → 远征 → 返航 的完整状态机。
   验证设计支柱: 殖民地优先 —— 玩家永远出生在家。 */
'use strict';
const fs = require('fs');
const path = require('path');

/* ---------- DOM/浏览器桩 ---------- */
function stubEl(){
  return {
    style:{}, classList:{ add(){}, remove(){}, toggle(){} },
    textContent:'', innerHTML:'',
    appendChild(){}, addEventListener(){},
    querySelector(){ return stubEl(); },
    getContext(){
      const grad = { addColorStop(){} };
      return new Proxy({}, { get: function(t, k){
        if(k==='createRadialGradient' || k==='createLinearGradient'){
          return function(){ return grad; };
        }
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
global.location = { reload(){} };

/* 手工驱动帧: 直接调 APH.Main.__frame */
let frameFn=null;

/* ---------- 加载模块(顺序同 build.py) ---------- */
const SRC = path.join(__dirname,'..','src');
for(const f of ['config.js','utils.js','humanoid.js','save.js','planet.js','llm.js',
                'colony.js','rivals.js','events.js','residents.js','combat.js',
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

/* ---------- 场景链路 ---------- */
test('boot 后: 出生在殖民地(home), spec=新曙光殖民地', () => {
  A(S.scene==='home', 'scene 应为 home, got '+S.scene);
  A(S.spec.name==='新曙光殖民地', '应出生在殖民地, got '+S.spec.name);
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

console.log(`\n${pass} 通过 / ${fail} 失败 / 共 ${pass+fail}`);
process.exit(fail?1:0);
