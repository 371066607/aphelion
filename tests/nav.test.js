/* T1 网格寻路引擎 (ADR-13 / 0004)
   seams: APH.Nav.{gridOf, astar, followPath} — 纯函数, 无 DOM。
   期望值全部手工推导(独立真相源), 不随实现重算。 */
'use strict';
const Nav = window.APH.Nav;
const G = 48;   // CFG.GRID

/* ---------- gridOf: 障碍矩阵 ---------- */
test('gridOf: 空建筑=全通矩阵', () => {
  const g = Nav.gridOf([]);
  if (!Array.isArray(g) || g.length !== 46) throw new Error('高度应为46格: '+g.length);
  for (let y = 0; y < 46; y++)
    for (let x = 0; x < 46; x++)
      if (g[y][x] !== 0) throw new Error('空白格应为0: '+x+','+y);
});

test('gridOf: 墙格=1 营地=1 闸门=可通行(0) 其他建筑=0', () => {
  const g = Nav.gridOf([
    { id: 'bl_wall', x: 48*5, y: 48*5 },
    { id: 'bl_gate', x: 48*6, y: 48*6 },
    { id: 'bl_house', x: 48*7, y: 48*7 },
    { id: 'bl_siege_camp', x: 48*8, y: 48*8 },
  ]);
  if (g[5][5] !== 1) throw new Error('墙应为1');
  if (g[6][6] !== 0) throw new Error('闸门应可通行(ADR-13, 开门延迟在T2移动层): '+g[6][6]);
  if (g[7][7] !== 0) throw new Error('普通建筑应可通行: '+g[7][7]);
  if (g[8][8] !== 1) throw new Error('围攻营地应为1');
});

test('astar: 围栏留闸门→路径穿门', () => {
  /* 3×3 围栏: 墙圈, 南边一扇闸门 (1,2) — y=2 行只放 x=0/x=2, (1,2) 是闸门 */
  const walls = [];
  for (let x = 0; x <= 2; x++) {
    walls.push({ id: 'bl_wall', x: 48*x, y: 0 });
  }
  walls.push({ id: 'bl_wall', x: 0, y: 48*2 });
  walls.push({ id: 'bl_wall', x: 48*2, y: 48*2 });
  walls.push({ id: 'bl_wall', x: 0, y: 48 });
  walls.push({ id: 'bl_wall', x: 48*2, y: 48 });
  walls.push({ id: 'bl_gate', x: 48*1, y: 48*2 });   // 唯一开口=闸门
  const g = Nav.gridOf(walls);
  if (g[2][1] !== 0) throw new Error('闸门格应为0: '+g[2][1]);
  const p = Nav.astar(g, { x: 48*1, y: 48*1 }, { x: 48*1, y: 48*4 });
  if (!p) throw new Error('闸门应可通行: '+JSON.stringify(p));
  /* 终点精确; 且直线(1,1)→(1,4)纵向穿过门格(1,2)=门可通行的直接证据 */
  if (p[p.length-1].x !== 48 || p[p.length-1].y !== 192) throw new Error('终点应精确: '+JSON.stringify(p));
  /* 配对验证: 同样围栏没有门(缺口补墙) → 无路(锁死「门=唯一开口可出」语义) */
  const w2 = walls.filter(w => w.id !== 'bl_gate');
  w2.push({ id: 'bl_wall', x: 48*1, y: 48*2 });   // 缺口补墙
  const g2 = Nav.gridOf(w2);
  if (Nav.astar(g2, { x: 48*1, y: 48*1 }, { x: 48*1, y: 48*4 }) !== null) throw new Error('无门封闭应无路');
});

test('gridOf: 越界坐标 clamp 不出错', () => {
  const g = Nav.gridOf([
    { id: 'bl_wall', x: -100, y: 48*3 },
    { id: 'bl_wall', x: 99999, y: 99999 },
  ]);
  if (g[3][0] !== 1) throw new Error('负坐标应clamp到0格: '+g[3][0]);
  if (g[45][45] !== 1) throw new Error('超界应clamp到45格');
});

/* ---------- astar: 绕墙路径 ---------- */
test('astar: 空地=直线两点', () => {
  const g = Nav.gridOf([]);
  const p = Nav.astar(g, { x: 48*2, y: 48*2 }, { x: 48*4, y: 48*4 });
  if (!p || p.length !== 1) throw new Error('空地应直达单点: '+(p && p.length));
  if (p[0].x !== 48*4 || p[0].y !== 48*4) throw new Error('终点应精确: '+JSON.stringify(p[0]));
});

test('astar: 一堵墙+缺口→绕缺口(不穿墙)', () => {
  /* 12×5 墙在 x=6, 缺口在 y=1 (格5,1) */
  const walls = [];
  for (let y = 0; y < 5; y++) if (y !== 1) walls.push({ id: 'bl_wall', x: 48*6, y: 48*y });
  const g = Nav.gridOf(walls);
  const p = Nav.astar(g, { x: 48*2, y: 48*2 }, { x: 48*10, y: 48*2 });
  if (!p) throw new Error('应有路径');
  // 路径点序列: 每个点都必须通行, 且终点精确, 且路径经过缺口格 (6,1)
  let hit = false;
  for (const pt of p) {
    const cx = Math.floor(pt.x / G), cy = Math.floor(pt.y / G);
    if (g[cy] && g[cy][cx] === 1) throw new Error('路径穿墙: '+cx+','+cy);
    if (cx === 6 && cy === 1) hit = true;
  }
  if (!hit) throw new Error('应经过缺口(6,1), 实际: '+JSON.stringify(p));
});

test('astar: 封闭围栏内→无路返回null', () => {
  /* 3×3 围栏: 墙圈 中间空一格 */
  const walls = [];
  for (let x = 0; x <= 2; x++) { walls.push({ id: 'bl_wall', x: 48*x, y: 0 }); walls.push({ id: 'bl_wall', x: 48*x, y: 48*2 }); }
  walls.push({ id: 'bl_wall', x: 0, y: 48 }); walls.push({ id: 'bl_wall', x: 48*2, y: 48 });
  const g = Nav.gridOf(walls);
  const p = Nav.astar(g, { x: 48*1, y: 48*1 }, { x: 48*4, y: 48*1 });
  if (p !== null) throw new Error('封闭死角应无路, 实际: '+JSON.stringify(p));
});

test('astar: 起终点同格→直达终点', () => {
  const g = Nav.gridOf([]);
  const p = Nav.astar(g, { x: 48*3, y: 48*3 }, { x: 48*3+10, y: 48*3+10 });
  if (!p || p.length !== 1) throw new Error('同格应直达: '+(p && p.length));
});

test('astar: 起点在墙内→仍能找到(退化放行)', () => {
  /* 起点被墙覆盖时不应挂, 输出有效路径或null均可, 但不得抛错 */
  const g = Nav.gridOf([{ id: 'bl_wall', x: 48*4, y: 48*4 }]);
  let p = null;
  try { p = Nav.astar(g, { x: 48*4, y: 48*4 }, { x: 48*8, y: 48*8 }); } catch (e) { throw new Error('不应抛错'); }
  if (p && p.some(pt => g[Math.floor(pt.y/G)][Math.floor(pt.x/G)] === 1))
    throw new Error('路径不应传回墙内终点以外的墙格');
});

/* ---------- followPath: 沿路径步进 ---------- */
test('followPath: 两点路径逐步到达并清walking', () => {
  const e = { x: 0, y: 0, path: [{ x: 100, y: 0 }], pathI: 0, walking: false };
  const step = 50; // 每跳50px
  let out = Nav.followPath(e, e.path, 1, step);
  if (out.x !== 50 || out.y !== 0 || !e.walking || e.pathI !== 0) throw new Error('第一跳应到50: '+JSON.stringify(out));
  out = Nav.followPath(e, e.path, 1, step);
  if (out.x !== 100 || out.y !== 0) throw new Error('第二跳应到100: '+JSON.stringify(out));
  if (e.walking !== false) throw new Error('到达应清walking');
  if (e.face !== 0) throw new Error('朝右face=0: '+e.face);
});

test('followPath: 多段路径逐段前进', () => {
  const e = { x: 0, y: 0, path: [{ x: 48, y: 0 }, { x: 48, y: 48 }], pathI: 0 };
  Nav.followPath(e, e.path, 1, 48);   // 到第一段终点
  if (e.pathI !== 1) throw new Error('应推进到段1: '+e.pathI);
  Nav.followPath(e, e.path, 1, 96);   // 一跳到第二段终点之外
  if (e.pathI !== 2 || e.walking !== false) throw new Error('应到终点并停下: '+e.pathI);
});

test('followPath: 最后一步超额吞掉(不越点)', () => {
  const e = { x: 0, y: 0, path: [{ x: 10, y: 0 }], pathI: 0 };
  Nav.followPath(e, e.path, 1, 100);
  if (e.x !== 10 || e.y !== 0) throw new Error('不能越过终点: '+JSON.stringify(e));
});

test('followPath: 精确落点帧保持walking(不闪烁)', () => {
  /* 速度×dt 恰好等于到第一段距离: 到达中间点但还有路走, walking 必须保持 true */
  const e = { x: 0, y: 0, path: [{ x: 48, y: 0 }, { x: 48, y: 48 }], pathI: 0 };
  Nav.followPath(e, e.path, 1, 48);   // step=48 恰好到段1
  if (e.pathI !== 1) throw new Error('应到段1: '+e.pathI);
  if (e.walking !== true) throw new Error('还有第二段, walking应保持true: '+e.walking);
});

test('followPath: 空路径立即停', () => {
  const e = { x: 5, y: 5, path: [], pathI: 0 };
  Nav.followPath(e, [], 1, 48);
  if (e.walking !== false) throw new Error('空路径应停');
});

/* ============ T9 无顶房间判定 (#82) ============ */
function ring(gx, gy, w, h){
  /* 构造 w×h 矩形墙环(世界坐标, 48px 格中心) */
  const out=[];
  for(let x=0; x<w; x++){ out.push({id:'bl_wall', x:48*(gx+x), y:48*(gy)}); out.push({id:'bl_wall', x:48*(gx+x), y:48*(gy+h-1)}); }
  for(let y=0; y<h; y++){ out.push({id:'bl_wall', x:48*gx, y:48*(gy+y)}); out.push({id:'bl_wall', x:48*(gx+w-1), y:48*(gy+y)}); }
  return out;
}
test('#82 roomsOf: 3×3 墙环 → 内部 1×1 房间', () => {
  const rooms = Nav.roomsOf(ring(10,10,3,3));
  if(rooms.length!==1) throw new Error('应 1 个房间: '+rooms.length);
  const r=rooms[0];
  if(r.sz!==1) throw new Error('3×3 环内部应 1 格: '+r.sz);
  if(r.minX!==11 || r.minY!==11) throw new Error('房间应在 (11,11): '+JSON.stringify(r));
});
test('#82 roomsOf: 5×5 墙环(留缺口) → 无房间(有缺口即连通外部)', () => {
  const b=ring(20,20,5,5);
  /* 拆掉顶边中间一格 = 缺口 */
  const idx=b.findIndex(x=>x.x===48*22 && x.y===48*20);
  b.splice(idx,1);
  const rooms = Nav.roomsOf(b);
  if(rooms.length!==0) throw new Error('有缺口不应有房间: '+rooms.length);
});
test('#82 roomsOf: 门算边界(围合含门) → 仍成房间', () => {
  const b=ring(30,30,4,4);
  /* 顶边中间一格换成门 */
  const idx=b.findIndex(x=>x.x===48*31 && x.y===48*30);
  b[idx]={id:'bl_gate', x:48*31, y:48*30};
  const rooms = Nav.roomsOf(b);
  if(rooms.length!==1) throw new Error('含门的围合应为房间: '+rooms.length);
  if(rooms[0].sz!==4) throw new Error('4×4 环内部应 4 格: '+rooms[0].sz);
});
test('#82 inRooms: 点在世界坐标判房间内外', () => {
  const rooms = Nav.roomsOf(ring(40,40,3,3));
  /* 房间格 (41,41) → 世界 48*41+24 */
  if(!Nav.inRooms({x:48*41+24, y:48*41+24}, rooms)) throw new Error('内部点应在房间');
  if(Nav.inRooms({x:48*40+24, y:48*40+24}, rooms)) throw new Error('墙格不算房间');
  if (Nav.inRooms({x:48*45+24, y:48*45+24}, rooms)) throw new Error('外部点不应在房间');
});
