/* T5 弹道掩体 (issue #78, parent #73)
   seams: APH.Combat.{segHitBox, updateCombat, makeProj} + CFG.ballistic
   期望值手工推导: GRID=48; 墙记录坐标=48 倍数(colony.wallCells 格心),
   碰撞盒=格心±CFG.ballistic.wallHalf(24) → 测试墙(624,768)盒 x∈[600,648] y∈[744,792]。
   弹丸推进: dt=0.05 → 位移=CFG.combat.plasmaSpeed*0.05=21.5px/帧。
   伤害: player 弹丸=CFG.combat.plasmaDmg(13); enemy 弹丸=构造 dmg(10);
         siege 弹丸 dmg=0 → 墙伤害=CFG.wall.shellDmg(30, T4 两发一墙语义)。 */
'use strict';
const C = window.APH.Combat, U = window.APH.U, CFG = window.APH.CFG;
const T = CFG.entType;

const WALL_HALF = CFG.ballistic.wallHalf;    // 24 = GRID/2
const PLASMA = CFG.combat.plasmaDmg;         // 13
const SHELL = CFG.wall.shellDmg;             // 30
const WALL_HP = CFG.wall.hp;                 // 60
const STEP = CFG.combat.plasmaSpeed * 0.05;  // 21.5 px/帧
const DT = 0.05;
const WX = 624, WY = 768;                    // 墙格心 (13,16)
const WMIN_X = WX - WALL_HALF, WMAX_X = WX + WALL_HALF;   // 600,648
const WMIN_Y = WY - WALL_HALF, WMAX_Y = WY + WALL_HALF;   // 744,792

/* ---------- 场景脚手架 ---------- */
function mkState(buildings, over){
  return Object.assign({
    scene:'home',
    colony:{ buildings: buildings || [] },
    entities: [],
    meta:{ res:{ food:0, mineral:0, med:0 }, stats:{ kills:0, deaths:0 }, residents:[] },
    parts:[], shake:0, px:1200, py:768, seed:1,
    hp:100, iFrameT:0, noiseT:0, mode:'running',
  }, over||{});
}
function withState(s, fn){
  const prev = window.APH.state;
  window.APH.state = s;
  try{ return fn(); } finally { window.APH.state = prev; }
}
function wallAt(x, y, extra){
  return Object.assign({ id:'bl_wall', x:x, y:y, lv:1, hp:WALL_HP }, extra||{});
}
function countEvt(evt){
  var n = 0;
  var fn = function(){ n++; };
  U.on(evt, fn);
  return { get(){ return n; }, off(){ U.off(evt, fn); } };
}

/* ============ 线段 vs 墙块碰撞盒 (纯函数) ============ */
test('segHitBox: 线段穿越墙盒=命中(水平/垂直/斜线)', () => {
  if (!C.segHitBox(400, 768, 700, 768, WX, WY, WALL_HALF))
    throw new Error('水平穿越应命中');
  if (!C.segHitBox(WX, 600, WX, 900, WX, WY, WALL_HALF))
    throw new Error('垂直穿越应命中');
  /* 斜线 (610,700)→(640,800): y 入 [744,792] 于 t∈[0.44,0.92], x 恒在盒内 → 命中 */
  if (!C.segHitBox(610, 700, 640, 800, WX, WY, WALL_HALF))
    throw new Error('斜线穿盒应命中');
});

test('segHitBox: 线段未达墙盒=不命中(不足/上方掠过/盒外)', () => {
  if (C.segHitBox(400, 768, 590, 768, WX, WY, WALL_HALF))
    throw new Error('止于盒前的短段不应命中');
  if (C.segHitBox(400, 700, 700, 700, WX, WY, WALL_HALF))
    throw new Error('上方掠过不应命中');
  if (C.segHitBox(400, 795, 700, 798, WX, WY, WALL_HALF))
    throw new Error('盒外平行线不应命中');
  if (C.segHitBox(500, 768, 500, 768, WX, WY, WALL_HALF))
    throw new Error('零长盒外点不应命中');
});

test('segHitBox: 贴边与零长盒内点=命中(隧穿安全, 判据含端点)', () => {
  if (!C.segHitBox(400, WMAX_Y, 700, WMAX_Y, WX, WY, WALL_HALF))
    throw new Error('贴下缘应命中(含边界)');
  if (!C.segHitBox(WX, WY, WX, WY, WX, WY, WALL_HALF))
    throw new Error('零长盒内点应命中');
});

/* ============ 弹丸命中墙: 扣血+消散 ============ */
test('updateCombat: 玩家弹丸穿自家墙=墙扣血+弹丸消散+wallHit一次', () => {
  const wall = wallAt(WX, WY);
  const s = mkState([wall]);
  let hit = countEvt('wallHit');
  withState(s, function(){
    const proj = C.makeProj(590, WY, CPPS(), 0, 'player', PLASMA);
    s.entities.push(proj);
    C.updateCombat(DT, false);
    if (wall.hp !== WALL_HP - PLASMA) throw new Error('墙应扣 ' + PLASMA + ': ' + wall.hp);
    if (!proj.dead) throw new Error('命中墙的弹丸应消散');
    if (s.entities.indexOf(proj) >= 0) throw new Error('消散弹丸应从实体表移除');
    if (hit.get() !== 1) throw new Error('应发 wallHit 一次: ' + hit.get());
    if (s.colony.buildings.indexOf(wall) < 0) throw new Error('未碎墙应保留记录');
    if (!(s.shake > 0)) throw new Error('命中应有震屏');
  });
  hit.off();
});

test('updateCombat: 第二发连击自家墙继续扣血 47→34(不豁免)', () => {
  const wall = wallAt(WX, WY);
  const s = mkState([wall]);
  let hit = countEvt('wallHit');
  withState(s, function(){
    const p1 = C.makeProj(590, WY, CPPS(), 0, 'player', PLASMA);
    s.entities.push(p1);
    C.updateCombat(DT, false);
    if (wall.hp !== WALL_HP - PLASMA) throw new Error('第一发后应 ' + (WALL_HP-PLASMA) + ': ' + wall.hp);
    const p2 = C.makeProj(590, WY, CPPS(), 0, 'player', PLASMA);
    s.entities.push(p2);
    C.updateCombat(DT, false);
    if (wall.hp !== WALL_HP - PLASMA * 2) throw new Error('第二发应 ' + (WALL_HP-PLASMA*2) + ': ' + wall.hp);
    if (hit.get() !== 2) throw new Error('应 wallHit 两次: ' + hit.get());
  });
  hit.off();
});

/* ============ 敌人弹药被墙挡 ============ */
test('updateCombat: 敌人酸弹被墙挡(玩家躲墙后 hp 不掉)', () => {
  const wall = wallAt(WX, WY);
  const s = mkState([wall], { px:700, py:WY });
  let hit = countEvt('wallHit');
  withState(s, function(){
    for (var i = 0; i < 6; i++){
      if (i === 0){
        s.entities.push(C.makeProj(590, WY, CPPS(), 0, 'enemy', 10));
      }
      C.updateCombat(DT, false);
    }
    if (s.hp !== 100) throw new Error('墙后玩家应无伤: ' + s.hp);
    if (wall.hp !== WALL_HP - 10) throw new Error('墙应扣酸弹伤害10: ' + wall.hp);
    if (hit.get() !== 1) throw new Error('酸弹应被墙消耗一次: ' + hit.get());
    /* 酸弹已消散: 实体表中无存活 enemy 弹丸 */
    if (s.entities.some(function(e){ return e.type === T.PROJECTILE && !e.dead; }))
      throw new Error('酸弹应消散');
  });
  hit.off();
});

/* ============ 墙碎后弹道恢复穿透 ============ */
test('updateCombat: 墙碎后弹道恢复穿透(第二发穿旧墙格命中后方敌人)', () => {
  const wall = wallAt(WX, WY, { hp: 5 });          // 一发 plasma(13) 即碎
  const foe = { id:'foe_t5', type:T.ENEMY, x:700, y:WY, hp:30, dead:false,
                isSoldier:false, state:'attack', wanderA:0, atkCd:5, walkPh:0,
                faction:{ id:'fx_raid', name:'袭击种', behavior:'melee_swarm',
                          gene:{ hue:1, sides:5, limbs:6, size:1, spikes:1, eyes:2 },
                          hp:30, speed:80, dmg:5, nightBoost:1 } };
  const s = mkState([wall], { px:706, py:WY });
  let hit = countEvt('wallHit');
  withState(s, function(){
    s.entities.push(foe);
    /* 第一发: 击碎墙(5-13<=0 → destroyWall 移除记录+掉石料) */
    const p1 = C.makeProj(590, WY, CPPS(), 0, 'player', PLASMA);
    s.entities.push(p1);
    C.updateCombat(DT, false);
    if (!p1.dead) throw new Error('首发应被墙消耗');
    if (s.colony.buildings.indexOf(wall) >= 0) throw new Error('墙碎后记录应移除');
    if (!s.entities.some(function(e){ return e.type === T.DROPPED && e.itemId === 'it_stone'; }))
      throw new Error('墙毁应掉石料');
    /* 第二发: 沿同一直线穿越旧墙格(hp=0 已被移除) → 命中墙后敌人(700,768) */
    const p2 = C.makeProj(590, WY, CPPS(), 0, 'player', PLASMA);
    s.entities.push(p2);
    for (var i = 0; i < 5; i++) C.updateCombat(DT, false);
    if (p2.dead !== true) throw new Error('第二发应命中目标消散');
    if (foe.hp !== 30 - PLASMA) throw new Error('墙后敌人应受 ' + PLASMA + ' 伤: ' + foe.hp);
    if (hit.get() !== 1) throw new Error('碎墙后不应再发 wallHit: ' + hit.get());
  });
  hit.off();
});

/* ============ 闸门不挡弹 / 0血残留记录不拦截 ============ */
test('updateCombat: 闸门不挡弹(穿门语义延续, 弹丸直穿)', () => {
  const gate = { id:'bl_gate', x:WX, y:WY, lv:1 };
  const s = mkState([gate]);
  let hit = countEvt('wallHit');
  withState(s, function(){
    const proj = C.makeProj(590, WY, CPPS(), 0, 'player', PLASMA);
    s.entities.push(proj);
    C.updateCombat(DT, false);
    if (proj.dead) throw new Error('弹丸不应被闸门拦下');
    if (hit.get() !== 0) throw new Error('闸门不应发 wallHit');
    if (gate.hp != null) throw new Error('闸门不应被弹丸扣血');
    if (s.colony.buildings.indexOf(gate) < 0) throw new Error('闸门记录应保留');
  });
  hit.off();
});

test('updateCombat: 0血墙残留记录不拦截(弹丸直穿)', () => {
  const wall = wallAt(WX, WY, { hp: 0 });
  const s = mkState([wall]);
  let hit = countEvt('wallHit');
  withState(s, function(){
    const proj = C.makeProj(590, WY, CPPS(), 0, 'player', PLASMA);
    s.entities.push(proj);
    C.updateCombat(DT, false);
    if (proj.dead) throw new Error('0血墙不应拦截');
    if (hit.get() !== 0) throw new Error('0血墙不应发 wallHit');
  });
  hit.off();
});

/* ============ 围攻炮弹 vs 墙 (T4 两发一墙语义保持) ============ */
test('updateCombat: 围攻炮弹对墙用 shellDmg(两发击穿一墙)', () => {
  const wall = wallAt(WX, WY);
  const s = mkState([wall]);
  let hit = countEvt('wallHit');
  withState(s, function(){
    const p1 = C.makeProj(590, WY, CPPS(), 0, 'siege', 0);
    s.entities.push(p1);
    C.updateCombat(DT, false);
    if (wall.hp !== WALL_HP - SHELL) throw new Error('首发应 ' + (WALL_HP-SHELL) + ': ' + wall.hp);
    if (!p1.dead) throw new Error('围攻弹命中墙应消散');
    if (s.colony.buildings.indexOf(wall) < 0) throw new Error('首发不应碎墙');
    const p2 = C.makeProj(590, WY, CPPS(), 0, 'siege', 0);
    s.entities.push(p2);
    C.updateCombat(DT, false);
    if (s.colony.buildings.indexOf(wall) >= 0) throw new Error('两发应击穿(记录移除)');
    if (hit.get() !== 2) throw new Error('应 wallHit 两次: ' + hit.get());
    if (!s.entities.some(function(e){ return e.type === T.DROPPED && e.itemId === 'it_stone'; }))
      throw new Error('击穿应掉石料');
  });
  hit.off();
});

/* 弹丸速度 (与 firePlasma 同速度, 走 CFG 不写死) */
function CPPS(){ return CFG.combat.plasmaSpeed; }
