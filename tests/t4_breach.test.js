/* T4 袭击者寻路+破墙+围攻炮击目标 (issue #77, parent #73)
   seams: APH.Combat.{planChase, breachFocus, wallHp, strikeWall, destroyWall,
   pickShellTarget} + APH.Nav.followPath (T1 引擎)
   期望值手工推导: GRID=48; 墙记录坐标=48 倍数(colony.wallCells 放置规则),
   格号=floor(坐标/48)。 */
'use strict';
const C = window.APH.Combat, U = window.APH.U, CFG = window.APH.CFG;
const Nav = window.APH.Nav;
const T = CFG.entType;

/* ---------- 场景脚手架 ---------- */
function mkState(buildings){
  return {
    scene:'home',
    colony:{ buildings: buildings || [] },
    entities: [],
    meta:{ res:{ food:0, mineral:0, med:0 }, stats:{ kills:0 }, residents:[] },
    parts:[], shake:0, px:0, py:0, seed:1,
  };
}
/* spawnDrop 读全局 APH.state(生产中与传入 s 同一对象): 临时替换并还原 */
function withState(s, fn){
  const prev = window.APH.state;
  window.APH.state = s;
  try{ return fn(); } finally { window.APH.state = prev; }
}
/* 竖墙列 x=624(格13), 行 12..18(y=576..864), 无缺口 */
function wallLineNoGap(){
  var out=[];
  for(var cy=12; cy<=18; cy++) out.push({ id:'bl_wall', x:624, y:cy*48, lv:1, hp:CFG.wall.hp });
  return out;
}

/* ============ 绕墙找门 ============ */
test('planChase: 无墙 → direct(原直线冲脸行为)', () => {
  const s = mkState([{ id:'bl_warehouse', x:900, y:800, lv:1 }]);
  const en = { x:400, y:800 };
  const plan = C.planChase(en, { x:900, y:800, kind:'building' }, s);
  if (plan.mode !== 'direct') throw new Error('无墙应 direct: '+JSON.stringify(plan));
});

test('planChase: 有墙但不挡视线 → direct', () => {
  // 敌(400,560)格(8,11) → 目标(900,400)格(18,8): 连线不穿 x=624 列(墙行 12..18)
  const s = mkState(wallLineNoGap().concat([{ id:'bl_warehouse', x:900, y:400, lv:1 }]));
  const en = { x:400, y:560 };
  const plan = C.planChase(en, { x:900, y:400, kind:'building' }, s);
  if (plan.mode !== 'direct') throw new Error('视线可见应 direct: '+JSON.stringify(plan));
});

test('planChase: 墙列挡路 → path(绕墙路径, 终点=目标)', () => {
  // 敌(400,800)格(8,16) → 目标(900,800)格(18,16); 墙列 x=624 行 12..18 挡住
  const s = mkState(wallLineNoGap().concat([{ id:'bl_warehouse', x:900, y:800, lv:1 }]));
  const en = { x:400, y:800 };
  const plan = C.planChase(en, { x:900, y:800, kind:'building' }, s);
  if (plan.mode !== 'path') throw new Error('应绕墙: '+JSON.stringify(plan));
  if (!plan.path || plan.path.length <= 1) throw new Error('路径应>1点');
  /* 每点不落墙格; 终点=精确目标 */
  const blocked = {};
  wallLineNoGap().forEach(function(w){ blocked[Math.floor(w.y/48)*48+Math.floor(w.x/48)]=1; });
  plan.path.forEach(function(p){
    if (blocked[Math.floor(p.y/48)*48+Math.floor(p.x/48)])
      throw new Error('路径点穿墙: '+JSON.stringify(p));
  });
  const last = plan.path[plan.path.length-1];
  if (Math.abs(last.x-900)>0.5 || Math.abs(last.y-800)>0.5)
    throw new Error('终点应=目标: '+JSON.stringify(last));
  /* 首点=起点邻格 */
  const f = plan.path[0];
  if (Math.abs(Math.floor(f.x/48)-8)>1 || Math.abs(Math.floor(f.y/48)-16)>1)
    throw new Error('首点应邻起点格: '+JSON.stringify(f));
});

test('planChase: 闸门格不是障碍 → 直接穿门(direct)', () => {
  // 墙列挖掉(13,16)补 bl_gate: 直线视线变通 → 按原行为直线
  var walls = wallLineNoGap().filter(function(w){ return w.y !== 16*48; });
  walls.push({ id:'bl_gate', x:624, y:16*48, lv:1 });
  const s = mkState(walls.concat([{ id:'bl_warehouse', x:900, y:800, lv:1 }]));
  const en = { x:400, y:800 };
  const plan = C.planChase(en, { x:900, y:800, kind:'building' }, s);
  if (plan.mode !== 'direct') throw new Error('闸门应可穿: '+JSON.stringify(plan));
});

/* ============ 无路转拆墙 ============ */
/* 目标(624,624)即格(13,13), 八邻全墙(环) */
function ringWalls(){
  return [
    { id:'bl_wall', x:576, y:576, lv:1 }, { id:'bl_wall', x:624, y:576, lv:1 }, { id:'bl_wall', x:672, y:576, lv:1 },
    { id:'bl_wall', x:576, y:624, lv:1 }, { id:'bl_wall', x:672, y:624, lv:1 },
    { id:'bl_wall', x:576, y:672, lv:1 }, { id:'bl_wall', x:624, y:672, lv:1 }, { id:'bl_wall', x:672, y:672, lv:1 },
  ];
}

test('planChase: 目标被墙环完全封死 → breach(拆最近墙)', () => {
  const s = mkState(ringWalls().concat([{ id:'bl_warehouse', x:624, y:624, lv:1 }]));
  const en = { x:400, y:624 };   // 格(8,13); 最近墙=西侧(576,624) d=176
  const plan = C.planChase(en, { x:624, y:624, kind:'building' }, s);
  if (plan.mode !== 'breach') throw new Error('封死应 breach: '+JSON.stringify(plan));
  if (!plan.wall || plan.wall.b.x !== 576 || plan.wall.b.y !== 624)
    throw new Error('应瞄最近墙(576,624): '+JSON.stringify(plan.wall));
  if (plan.wall.kind !== 'wall') throw new Error('墙焦点kind应为wall');
});

test('planChase: 目标格本身是墙(玩家卡墙内) → breach', () => {
  const s = mkState(wallLineNoGap());
  const en = { x:400, y:800 };
  const plan = C.planChase(en, { x:624, y:792, kind:'player' }, s);   // 格(13,16)=墙
  if (plan.mode !== 'breach') throw new Error('目标墙内应 breach: '+plan.mode);
  if (!plan.wall || plan.wall.b.id !== 'bl_wall') throw new Error('应给墙焦点');
});

/* ============ 墙 hp: 递减/归零移除/掉落 ============ */
test('wallHp: 旧存档无 hp 字段 → 兜底 CFG.wall.hp', () => {
  if (C.wallHp({ id:'bl_wall' }) !== CFG.wall.hp) throw new Error('默认应 '+CFG.wall.hp);
  if (C.wallHp({ id:'bl_wall', hp:33 }) !== 33) throw new Error('应读已有字段');
});

test('strikeWall: 默认耐久递减(每击=敌人伤害); 未拆不掉石', () => {
  const b = { id:'bl_wall', x:624, y:768, lv:1 };
  const s = mkState([b]);
  const en = { x:420, y:780, faction:{ dmg:10 } };
  C.strikeWall(en, b, s);
  if (b.hp !== CFG.wall.hp-10) throw new Error('一击后应 '+(CFG.wall.hp-10)+': '+b.hp);
  C.strikeWall(en, b, s);
  if (b.hp !== CFG.wall.hp-20) throw new Error('两击后应 '+(CFG.wall.hp-20)+': '+b.hp);
  if (s.entities.length !== 0) throw new Error('未拆不应掉石');
});

test('strikeWall: 归零→移除记录+掉石料1~2+wallDown事件+震屏', () => {
  let downEvt = 0;
  const fn = function(){ downEvt++; };
  U.on('wallDown', fn);
  const b = { id:'bl_wall', x:624, y:768, lv:1, hp:8 };
  const s = mkState([b, { id:'bl_warehouse', x:900, y:800, lv:1 }]);
  const en = { x:420, y:780, faction:{ dmg:10 } };
  const hit = withState(s, function(){
    return C.strikeWall(en, b, s);
  });
  if (!hit) throw new Error('应命中过');
  if (s.colony.buildings.length !== 1 || s.colony.buildings[0].id !== 'bl_warehouse')
    throw new Error('墙记录应移除且仓库保留: '+JSON.stringify(s.colony.buildings));
  const drops = s.entities.filter(function(e){ return e.type===T.DROPPED && e.itemId==='it_stone'; });
  if (drops.length !== 1) throw new Error('应掉一堆石料: '+JSON.stringify(s.entities));
  if (drops[0].n < CFG.wall.dropStoneMin || drops[0].n > CFG.wall.dropStoneMax)
    throw new Error('石料应 1~2: '+drops[0].n);
  if (!(s.shake > 0)) throw new Error('墙毁应有震屏');
  if (downEvt !== 1) throw new Error('应发 wallDown 一次: '+downEvt);
  U.off('wallDown', fn);
});

test('strikeWall: 已拆除(0血)墙不再命中', () => {
  const b = { id:'bl_wall', x:624, y:768, lv:1, hp:0 };
  const s = mkState([b]);
  const en = { x:420, y:780, faction:{ dmg:10 } };
  if (C.strikeWall(en, b, s) !== false) throw new Error('0血墙不应命中');
});

test('strikeWall: 拆掉环上墙 → 原目标恢复可达(direct)', () => {
  const ring = ringWalls();
  const s = mkState(ring.concat([{ id:'bl_warehouse', x:624, y:624, lv:1 }]));
  const en = { x:400, y:624, faction:{ dmg:10 } };
  const west = ring[3];                       // (576,624) 西墙
  withState(s, function(){
    for (let i=0; i<6; i++) C.strikeWall(en, west, s);   // 60 → 0 拆穿
  });
  if (s.colony.buildings.indexOf(west) >= 0) throw new Error('墙应已移除');
  const plan = C.planChase(en, { x:624, y:624, kind:'building' }, s);
  if (plan.mode !== 'direct' && plan.mode !== 'path')
    throw new Error('破墙后应恢复可达: '+plan.mode);
});

/* ============ 沿路径推进 (Nav.followPath) ============ */
test('followPath: 逐段推进→到达终点清 walking', () => {
  const en = { x:400, y:800, path:null, pathI:0 };
  const path = [ { x:456, y:800 }, { x:1000, y:800 } ];   // 格(9,16)心=456
  Nav.followPath(en, path, 1, 100);       // 步长100: 先吞56到第一点, 余44走第二段
  if (en.x !== 500 || en.pathI !== 1 || !en.walking)
    throw new Error('第一帧应到(500,800)/pathI=1: '+en.x+'/'+en.pathI+'/'+en.walking);
  Nav.followPath(en, path, 1, 100);
  if (en.x !== 600) throw new Error('第二帧应600: '+en.x);
  Nav.followPath(en, path, 10, 100);
  if (en.x !== 1000 || en.walking) throw new Error('应到终点并停走: '+en.x+'/'+en.walking);
});

/* ============ 围攻炮击目标选择(纯函数) ============ */
test('pickShellTarget: 优先墙(即使距离更远)', () => {
  const blds = [
    { id:'bl_warehouse', x:700, y:300, lv:1 },   // d=400+300惩罚
    { id:'bl_wall', x:900, y:300, lv:1 },        // d=600+0
  ];
  const t = C.pickShellTarget(300, 300, blds);
  if (!t || t.id !== 'bl_wall') throw new Error('应选墙: '+(t && t.id));
});

test('pickShellTarget: 炮塔与墙同组取最近', () => {
  const blds = [
    { id:'bl_wall', x:900, y:300, lv:1 },        // d=600
    { id:'bl_turret', x:820, y:300, lv:1 },      // d=520 → 同组最近
    { id:'bl_farm', x:600, y:300, lv:1 },        // d=300+300惩罚
  ];
  const t = C.pickShellTarget(300, 300, blds);
  if (!t || t.id !== 'bl_turret') throw new Error('应选炮塔: '+(t && t.id));
});

test('pickShellTarget: 无优先建筑 → 最近一般建筑', () => {
  const blds = [
    { id:'bl_farm', x:700, y:300, lv:1 },
    { id:'bl_house', x:750, y:300, lv:1 },
  ];
  const t = C.pickShellTarget(300, 300, blds);
  if (!t || t.id !== 'bl_farm') throw new Error('应选农场: '+(t && t.id));
});

test('pickShellTarget: 发射台排除/0血墙排除/空表null', () => {
  if (C.pickShellTarget(300, 300, [{ id:'bl_landing_pad', x:350, y:300 }]) !== null)
    throw new Error('只发射台应 null');
  const blds = [
    { id:'bl_landing_pad', x:350, y:300 },
    { id:'bl_wall', x:900, y:300, lv:1, hp:0 },
    { id:'bl_warehouse', x:700, y:300 },
  ];
  const t = C.pickShellTarget(300, 300, blds);
  if (!t || t.id !== 'bl_warehouse') throw new Error('0血墙应排除: '+(t && t.id));
  if (C.pickShellTarget(300, 300, []) !== null) throw new Error('空表应 null');
});
