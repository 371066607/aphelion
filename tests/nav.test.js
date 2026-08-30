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

test('gridOf: 墙格=1 闸门=1 其他建筑=0 营地=1', () => {
  const g = Nav.gridOf([
    { id: 'bl_wall', x: 48*5, y: 48*5 },
    { id: 'bl_gate', x: 48*6, y: 48*6 },
    { id: 'bl_house', x: 48*7, y: 48*7 },
    { id: 'bl_siege_camp', x: 48*8, y: 48*8 },
  ]);
  if (g[5][5] !== 1) throw new Error('墙应为1');
  if (g[6][6] !== 1) throw new Error('闸门应为1(可通行但计价)');
  if (g[7][7] !== 0) throw new Error('普通建筑应可通行: '+g[7][7]);
  if (g[8][8] !== 1) throw new Error('围攻营地应为1');
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

test('followPath: 空路径立即停', () => {
  const e = { x: 5, y: 5, path: [], pathI: 0 };
  Nav.followPath(e, [], 1, 48);
  if (e.walking !== false) throw new Error('空路径应停');
});
