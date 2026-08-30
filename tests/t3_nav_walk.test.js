/* T3 居民与过客绕墙寻路 (issue #76 / parent #73)
   seams: APH.Res.walkAround(e,target,dt,speed,grid) — walkToward 的寻路升级
   grid = APH.Nav.gridOf(colony.buildings): 墙格=1, 闸门/普通建筑=0 (ADR-13)
   语义契约:
     A. 无墙(全通矩阵/无 grid) → 直线退化, 与 walkToward 逐帧一致 (path 缓存清空);
     B. 有墙 & 直线被挡 → A* 绕行, 路径不穿墙、终点精确、能到达;
     C. 寻路失败(封闭) → 退化直线, 不卡死;
     D. 缓存: 目标未变沿用 e.path; 目标变更/到段才重算 (e.pathGoal 见证);
     E. 闸门=可通行 (ADR-13), 唯一开口时路径经门格;
     F. 睡者/医疗舱俯卧者守卫同 walkToward (#68/#69), 并清路径缓存。
   期望值全部手工推导(独立真相源), 不随实现重算。 */
'use strict';
const Nav = window.APH.Nav;
const Res = window.APH.Res;
const G = 48;   // CFG.GRID

/* ---------- A: 无墙 → 直线退化 = walkToward 原语义 ---------- */
test('T3 walkAround: 无墙=walkToward 逐帧一致(直线+清缓存)', () => {
  const g = Nav.gridOf([]);
  const e = { x:0, y:0, walkPh:0 };
  Res.walkAround(e, {x:100,y:0}, 1, 40, g);
  if (e.x!==40 || e.y!==0 || e.walking!==true) throw new Error('1秒应走40: '+JSON.stringify(e));
  if (e.face!==0) throw new Error('朝右 face=0: '+e.face);
  if (!(e.walkPh>0)) throw new Error('走动应推进 walkPh: '+e.walkPh);
  if (e.path!==null || e.pathGoal!==null) throw new Error('直线退化应清缓存: '+JSON.stringify(e.path));
  Res.walkAround(e, {x:100,y:0}, 2, 40, g);
  if (e.x!==100 || e.walking!==false) throw new Error('应到达并停下: '+JSON.stringify(e));
});

test('T3 walkAround: 无 grid(null)也退化直线', () => {
  const e = { x:0, y:0 };
  Res.walkAround(e, {x:100,y:0}, 1, 40, null);
  if (e.x!==40 || !e.walking) throw new Error('无grid应直线走: '+JSON.stringify(e));
  if (e.path!==null) throw new Error('应清路径缓存');
});

test('T3 walkAround: 无墙斜向逐帧与 walkToward 完全一致', () => {
  const g = Nav.gridOf([]);
  const a = { x:0, y:0, walkPh:0 }, b = { x:0, y:0, walkPh:0 };
  const tgt = { x:120, y:40 };
  for (let i=0;i<5;i++){
    Res.walkAround(a, tgt, 0.5, 40, g);
    Res.walkToward(b, tgt, 0.5, 40);
    if (a.x!==b.x || a.y!==b.y || a.walking!==b.walking || a.face!==b.face || a.walkPh!==b.walkPh)
      throw new Error('第'+i+'帧不一致: '+JSON.stringify(a)+' vs '+JSON.stringify(b));
  }
  /* 手推: 单位向量 (120,40)/√16000, 每帧20px, 5帧 → (94.8683...,31.6227...) */
  if (Math.abs(a.x-94.86832980505138)>1e-9 || Math.abs(a.y-31.622776601683793)>1e-9)
    throw new Error('5帧位置应 (94.8683,31.6228): '+JSON.stringify(a));
  if (!a.walking) throw new Error('5帧后仍在途中应 walking');
});

/* ---------- B: 绕墙路径 ---------- */
test('T3 walkAround: 一堵墙+缺口→绕缺口(不穿墙/终点精确/能到达)', () => {
  /* 12×5 墙在格列6(x=288), 缺口 y=1 (格6,1); 起点(96,96)终点(480,96) */
  const walls = [];
  for (let y=0;y<5;y++) if (y!==1) walls.push({ id:'bl_wall', x:288, y:48*y });
  const g = Nav.gridOf(walls);
  const e = { x:96, y:96, walkPh:0 };
  const tgt = { x:480, y:96 };
  Res.walkAround(e, tgt, 1, 40, g);
  if (!e.path || e.path.length<2) throw new Error('应有多点绕行路径: '+JSON.stringify(e.path));
  if (e.pathGoal.x!==480 || e.pathGoal.y!==96) throw new Error('pathGoal应=目标: '+JSON.stringify(e.pathGoal));
  let hit=false;
  for (const pt of e.path){
    const cx=Math.floor(pt.x/G), cy=Math.floor(pt.y/G);
    if (g[cy][cx]===1) throw new Error('路径穿墙: '+cx+','+cy);
    if (cx===6 && cy===1) hit=true;
  }
  if (!hit) throw new Error('应经过缺口(6,1): '+JSON.stringify(e.path));
  const last=e.path[e.path.length-1];
  if (last.x!==480 || last.y!==96) throw new Error('终点应精确: '+JSON.stringify(last));
  /* 走完能到达 */
  let guard=0;
  while (e.walking && guard++<120) Res.walkAround(e, tgt, 1, 40, g);
  if (e.x!==480 || e.y!==96 || e.walking!==false) throw new Error('绕墙应到达并停下: '+JSON.stringify(e)+' 帧数'+guard);
  if (!(e.walkPh>0)) throw new Error('绕行走动应推进 walkPh');
  /* 到段(到达)后再调: 重算路径(新数组), 目标不变 */
  const p1=e.path;
  Res.walkAround(e, tgt, 1, 40, g);
  if (e.path===p1) throw new Error('到段后应重算路径');
  if (e.pathGoal.x!==480 || e.pathGoal.y!==96) throw new Error('目标未变 pathGoal 应保持');
});

/* ---------- C: 寻路失败 → 退化直线不卡死 ---------- */
test('T3 walkAround: 封闭围栏无路→退化直线(不卡死)', () => {
  /* 3×3 围栏(内格(1,1)空), 目标在围栏外 (4,1) */
  const walls = [];
  for (let x=0;x<=2;x++){ walls.push({ id:'bl_wall', x:48*x, y:0 }); walls.push({ id:'bl_wall', x:48*x, y:48*2 }); }
  walls.push({ id:'bl_wall', x:0, y:48 }); walls.push({ id:'bl_wall', x:48*2, y:48 });
  const g = Nav.gridOf(walls);
  const e = { x:48, y:48, walkPh:0 };
  const tgt = { x:192, y:48 };
  Res.walkAround(e, tgt, 1, 40, g);
  if (e.path!==null || e.pathGoal!==null) throw new Error('失败应退化直线(清缓存): '+JSON.stringify(e.path));
  if (e.x!==88 || e.y!==48 || e.walking!==true) throw new Error('应直线走40px: '+JSON.stringify(e));
  if (e.face!==0 || !(e.walkPh>0)) throw new Error('直线走应设face/推进walkPh');
  Res.walkAround(e, tgt, 1, 40, g);
  if (e.x!==128 || e.walking!==true) throw new Error('第二帧继续走不卡死: '+JSON.stringify(e));
});

/* ---------- D: 缓存语义 ---------- */
test('T3 walkAround: 目标未变沿用缓存路径, 目标变更重算', () => {
  const walls = [];
  for (let y=0;y<5;y++) if (y!==1) walls.push({ id:'bl_wall', x:288, y:48*y });
  const g = Nav.gridOf(walls);
  const e = { x:96, y:96 };
  const tgt = { x:480, y:96 };
  Res.walkAround(e, tgt, 0.5, 40, g);
  const p1 = e.path;
  if (!p1) throw new Error('应有路径');
  Res.walkAround(e, tgt, 0.5, 40, g);
  if (e.path!==p1) throw new Error('目标未变应沿用缓存路径');
  Res.walkAround(e, tgt, 0.5, 40, g);
  if (e.path!==p1) throw new Error('第三帧仍应沿用缓存路径');
  /* 目标变更 → 重算: 新数组, pathGoal 更新 */
  const tgt2 = { x:480, y:192 };
  Res.walkAround(e, tgt2, 0.5, 40, g);
  if (e.path===p1) throw new Error('目标变更应重算');
  if (e.pathGoal.x!==480 || e.pathGoal.y!==192) throw new Error('pathGoal应更新: '+JSON.stringify(e.pathGoal));
  if (!e.path || e.path.length<2) throw new Error('变更后应有绕行路径');
  const last=e.path[e.path.length-1];
  if (last.x!==480 || last.y!==192) throw new Error('新路径终点应精确: '+JSON.stringify(last));
});

/* ---------- E: 闸门=可通行 (ADR-13) ---------- */
test('T3 walkAround: 围栏唯一开口=闸门→路径经门格并到达', () => {
  const walls = [];
  for (let x=0;x<=2;x++) walls.push({ id:'bl_wall', x:48*x, y:0 });   // 顶行
  walls.push({ id:'bl_wall', x:0, y:48*2 }); walls.push({ id:'bl_wall', x:48*2, y:48*2 });
  walls.push({ id:'bl_wall', x:0, y:48 }); walls.push({ id:'bl_wall', x:48*2, y:48 });
  walls.push({ id:'bl_gate', x:48*1, y:48*2 });   // 唯一开口=闸门(格(1,2))
  const g = Nav.gridOf(walls);
  const e = { x:48, y:48 };
  const tgt = { x:144, y:48 };                    // 围栏外 (3,1)
  Res.walkAround(e, tgt, 1, 40, g);
  if (!e.path) throw new Error('闸门应可通行, 应有路径');
  let viaGate=false;
  for (const pt of e.path){
    const cx=Math.floor(pt.x/G), cy=Math.floor(pt.y/G);
    if (g[cy][cx]===1) throw new Error('路径穿墙: '+cx+','+cy);
    if (cx===1 && cy===2) viaGate=true;   // 唯一出口必经门格
  }
  if (!viaGate) throw new Error('应经闸门格(1,2): '+JSON.stringify(e.path));
  let guard=0;
  while (e.walking && guard++<120) Res.walkAround(e, tgt, 1, 40, g);
  if (e.x!==144 || e.y!==48) throw new Error('经闸门应到达: '+JSON.stringify(e));
  /* 配对: 门补成墙 → 无路 → 退化直线 */
  const w2 = walls.filter(w=>w.id!=='bl_gate');
  w2.push({ id:'bl_wall', x:48*1, y:48*2 });
  const g2 = Nav.gridOf(w2);
  const e2 = { x:48, y:48 };
  Res.walkAround(e2, tgt, 1, 40, g2);
  if (e2.path!==null) throw new Error('无门封闭应退化直线');
  if (e2.x!==88 || e2.y!==48 || !e2.walking) throw new Error('应直线走: '+JSON.stringify(e2));
});

/* ---------- F: 守卫 (#68/#69) + 缓存清理 ---------- */
test('T3 walkAround: 睡着/俯卧者不移动并清路径缓存', () => {
  const g = Nav.gridOf([]);
  const e = { x:0, y:0, isSleeping:true, walking:true, walkPh:7, face:0.5,
              path:[{x:300,y:0}], pathI:1, pathGoal:{x:300,y:0} };
  Res.walkAround(e, {x:100,y:0}, 1, 40, g);
  if (e.x!==0 || e.y!==0) throw new Error('睡着不应移动: '+JSON.stringify(e));
  if (e.walking!==false) throw new Error('睡着应清 walking');
  if (e.walkPh!==7) throw new Error('睡着不应推进 walkPh: '+e.walkPh);
  if (e.path!==null || e.pathI!==0 || e.pathGoal!==null) throw new Error('睡者应清路径缓存');
  const m = { x:0, y:0, medLying:true, walking:true, walkPh:7, face:0.5,
              path:[{x:300,y:0}], pathI:1, pathGoal:{x:300,y:0} };
  Res.walkAround(m, {x:100,y:0}, 1, 40, g);
  if (m.x!==0 || m.y!==0 || m.walking!==false || m.walkPh!==7) throw new Error('俯卧者不应移动: '+JSON.stringify(m));
  if (m.path!==null || m.pathGoal!==null) throw new Error('俯卧者应清路径缓存');
});

/* ---------- 补充: 有墙但视线通 → 直线单点路径(walkToward 兼容) ---------- */
test('T3 walkAround: 有墙但直线无挡→单点路径直达(轨迹同直线)', () => {
  const g = Nav.gridOf([{ id:'bl_wall', x:288, y:288 }]);   // 远处的墙, 不在线上
  const e = { x:0, y:0 };
  const tgt = { x:100, y:0 };
  Res.walkAround(e, tgt, 1, 40, g);
  if (e.x!==40 || e.y!==0 || !e.walking) throw new Error('直线段应走40: '+JSON.stringify(e));
  if (!e.path || e.path.length!==1 || e.path[0].x!==100 || e.path[0].y!==0)
    throw new Error('视线通应单点路径: '+JSON.stringify(e.path));
  if (e.pathGoal.x!==100 || e.pathGoal.y!==0) throw new Error('pathGoal应=目标');
  Res.walkAround(e, tgt, 2, 40, g);
  if (e.x!==100 || e.y!==0 || e.walking!==false) throw new Error('应到达并停: '+JSON.stringify(e));
  if (e.pathI!==1) throw new Error('到段状态 pathI 应=1: '+e.pathI);
});
