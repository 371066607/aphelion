'use strict';
/* ============================================================
   Aphelion · nav.js — 48px 格网寻路引擎 (ADR-13 / docs/adr/0004)
   挂载: window.APH.Nav
   纯函数: 障碍矩阵·A星·路径步进, node 直测。
   障碍集合: bl_wall / bl_siege_camp (ADR-13: 闸门可通行,
   开门延迟由 T2 移动层施加; 其余建筑可通行=显式简化)。
   ============================================================ */
window.APH = window.APH || {};

APH.Nav = (function(){
  var CFG = APH.CFG;
  var GRID = CFG.GRID;                    // ADR-4 逻辑格网
  var NC = Math.ceil(CFG.WORLD / GRID);   // 2200/48 → 46 格

  /* 障碍建筑 id 集合 (闸门=可通行, 见 ADR-13) */
  var BLOCKERS = { bl_wall: 1, bl_siege_camp: 1 };

  /* ---------- 障碍矩阵: 殖民地建筑记录 → 46×46 0/1 ---------- */
  function gridOf(buildings){
    var g = [];
    for (var y = 0; y < NC; y++) { g.push(new Array(NC).fill(0)); }
    (buildings || []).forEach(function(b){
      if (!b || !BLOCKERS[b.id]) return;
      var cx = Math.floor((b.x || 0) / GRID), cy = Math.floor((b.y || 0) / GRID);
      cx = Math.max(0, Math.min(NC - 1, cx));
      cy = Math.max(0, Math.min(NC - 1, cy));
      g[cy][cx] = 1;
    });
    return g;
  }

  /* 视线检查: from→to 线段逐格采样, 无墙则无需绕行 */
  /* 视线检查: from→to 线段逐格采样, 无墙则无需绕行
     P2 (#94): 传入 trapCost 时——直线途经任何被惩罚格(陷阱)也判不清(强制走 A* 比较绕行) */
  function lineClear(grid, from, to, costFn){
    var dx = to.x - from.x, dy = to.y - from.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1) return true;
    var steps = Math.ceil(d / (GRID / 4));
    for (var i = 1; i <= steps; i++){
      var px = from.x + dx * i / steps;
      var py = from.y + dy * i / steps;
      var cx = Math.floor(px / GRID), cy = Math.floor(py / GRID);
      if (grid[cy][cx] === 1) return false;
      if (costFn && costFn(cx, cy) > 0) return false;   // 途经陷阱: 强制寻路比较
    }
    return true;
  }

  /* ---------- A*: 返回世界坐标路径点数组 | null ----------
     p = [{x,y}...] 不含起点、含终点(终点精确坐标)。
     8 向邻接 + 对角线禁止穿角。
     起终点直线无墙时直接返回 [终点] (空地=直线, walkToward 兼容)。 */
  /* P2 敌避陷阱 (#94): astar 可选 cost 函数 (见下) —— 通过它实现罚权绕行 */
  function astar(grid, from, to, costFn){
    if (!grid || !from || !to) return null;
    var pen = costFn || function(){ return 0; };   // P2: 代价惩罚函数(陷阱格) — 必须先定义, lineClear 用
    var sx = Math.max(0, Math.min(NC - 1, Math.floor(from.x / GRID)));
    var sy = Math.max(0, Math.min(NC - 1, Math.floor(from.y / GRID)));
    var tx = Math.max(0, Math.min(NC - 1, Math.floor(to.x / GRID)));
    var ty = Math.max(0, Math.min(NC - 1, Math.floor(to.y / GRID)));
    if (grid[ty][tx] === 1 && !(sx === tx && sy === ty)) return null;  // 目标在墙内: 无精确路径
    if (lineClear(grid, from, to, pen)) return [{ x: to.x, y: to.y }];
    if (grid[sy][sx] === 1) sx = -1;   // 起点本身被墙覆盖: 从邻格逃生(起点不入路径)

    var open = [{ x: sx, y: sy, g: 0, f: heur(sx, sy, tx, ty), prev: null }];
    var closed = {};
    var key = function(x, y){ return y * NC + x; };

    while (open.length){
      // 取 f 最小 (规模小, 线性扫描)
      var bi = 0;
      for (var i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
      var cur = open.splice(bi, 1)[0];
      var ck = key(cur.x, cur.y);
      if (closed[ck]) continue;
      closed[ck] = true;
      if (cur.x === tx && cur.y === ty) return rebuild(cur, to);
      for (var dy = -1; dy <= 1; dy++){
        for (var dx = -1; dx <= 1; dx++){
          if (!dx && !dy) continue;
          var nx = cur.x + dx, ny = cur.y + dy;
          if (nx < 0 || ny < 0 || nx >= NC || ny >= NC) continue;
          if (grid[ny][nx] === 1) continue;
          if (dx && dy){
            // 对角: 两正交向必须都通, 防贴角穿墙
            if (grid[cur.y][nx] === 1 || grid[ny][cur.x] === 1) continue;
          }
          var nk = key(nx, ny);
          if (closed[nk]) continue;
          var ng = cur.g + 1 + pen(nx, ny);   // P2: +代价惩罚(陷阱格)
          var ex = open.find(function(o){ return o.x === nx && o.y === ny; });
          if (ex){
            if (ng < ex.g) { ex.g = ng; ex.f = ng + heur(nx, ny, tx, ty); ex.prev = cur; }
          } else {
            open.push({ x: nx, y: ny, g: ng, f: ng + heur(nx, ny, tx, ty), prev: cur });
          }
        }
      }
    }
    return null;
  }

  function heur(x, y, tx, ty){
    var dx = Math.abs(x - tx), dy = Math.abs(y - ty);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);   // octile
  }

  function rebuild(node, to){
    var chain = [];
    while (node){ chain.unshift(node); node = node.prev; }
    /* chain[0] = 起点格: 调用方已经在起点, 不入路径 */
    var pts = chain.slice(1).map(function(n){
      return { x: n.x * GRID + GRID / 2, y: n.y * GRID + GRID / 2 };
    });
    var last = chain[chain.length - 1];
    /* 终点格(若已入路径)保留格心, 否则 push 精确终点 */
    if (!pts.length || Math.abs(pts[pts.length - 1].x - to.x) > 1e-6 || Math.abs(pts[pts.length - 1].y - to.y) > 1e-6){
      pts.push({ x: to.x, y: to.y });   // 终点精确
    }
    return pts;
  }

  /* ---------- 沿路径步进 (与 walkToward 语义对齐) ----------
     e.path / e.pathI 由调用方持久; 到达清 walking, 设 face。 */
  function followPath(e, path, dt, speed){
    if (!e || !path || !path.length){ if (e) e.walking = false; return e; }
    var spd = speed != null ? speed : (CFG.walk && CFG.walk.speed != null ? CFG.walk.speed : 56);
    var step = spd * (dt || 0);
    if (!e.path || e.path !== path){ e.path = path; e.pathI = 0; }
    while (e.pathI < e.path.length){
      var t = e.path[e.pathI];
      var dx = t.x - e.x, dy = t.y - e.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d <= step){
        e.x = t.x; e.y = t.y;
        e.pathI++;
        step -= d;               // 扣除本段耗步, 剩余步长续走下一段
        if (step <= 1e-6) break; // 步长耗尽: 停在路径点上, 保持 walking(还有路要走)
        continue;
      }
      e.x += dx / d * step;
      e.y += dy / d * step;
      e.face = Math.atan2(dy, dx);
      e.walking = true;
      return e;
    }
    e.walking = (e.pathI < e.path.length);   // 步长耗尽时还有路要走 → 保持 walking
    return e;
  }

  /* ---------- T9 无顶房间判定 (issue #82): 墙/门围合封闭区域 = 房间 ----------
     ADR-13: 墙=不可通行; 门=可通行(移动)但围合判定里门同样算边界(RimWorld 房间含门)。
     算法: 边界矩阵(boundary=1: 墙或门) → 从四边灌外部(flood) → 未灌到的开放格 = 房间内部。
     纯函数: 输入 buildings 记录数组, 输出房间列表:[{cells:[{gx,gy}], minX,minY,maxX,maxY, sz}]。
     边界外(远于任一建筑3格)的开放格不算房间(防把整张地图当房间)。 */
  var ROOM_EDGE = { bl_wall: 1, bl_gate: 1 };   // 房间边界集合 (门算围合)

  function roomsOf(buildings){
    var g = [];
    for (var y = 0; y < NC; y++) { g.push(new Array(NC).fill(0)); }
    var hasAny=false;
    (buildings || []).forEach(function(b){
      if (!b || !ROOM_EDGE[b.id]) return;
      var cx = Math.floor((b.x || 0) / GRID), cy = Math.floor((b.y || 0) / GRID);
      cx = Math.max(0, Math.min(NC - 1, cx));
      cy = Math.max(0, Math.min(NC - 1, cy));
      g[cy][cx] = 1;
      hasAny=true;
    });
    if(!hasAny) return [];

    /* 外部泛滥: 从四条边界的开放格(非边界) BFS——所有通向外界的格归外部 */
    var outside = [];
    for (var y2 = 0; y2 < NC; y2++) { outside.push(new Array(NC).fill(false)); }
    var stack = [];
    for (var x = 0; x < NC; x++) {
      if (g[0][x] === 0) stack.push([0, x]);
      if (g[NC-1][x] === 0) stack.push([NC-1, x]);
    }
    for (var y3 = 0; y3 < NC; y3++) {
      if (g[y3][0] === 0) stack.push([y3, 0]);
      if (g[y3][NC-1] === 0) stack.push([y3, NC-1]);
    }
    while (stack.length) {
      var c = stack.pop();
      var cy2 = c[0], cx2 = c[1];
      if (cy2 < 0 || cy2 >= NC || cx2 < 0 || cx2 >= NC) continue;
      if (outside[cy2][cx2] || g[cy2][cx2] === 1) continue;
      outside[cy2][cx2] = true;
      stack.push([cy2-1, cx2], [cy2+1, cx2], [cy2, cx2-1], [cy2, cx2+1]);
    }

    /* 未灌到且非边界的开放格 = 房间; 按连通分量分组 */
    var rooms = [];
    var seen = [];
    for (var y4 = 0; y4 < NC; y4++) { seen.push(new Array(NC).fill(false)); }
    for (var y5 = 0; y5 < NC; y5++) {
      for (var x5 = 0; x5 < NC; x5++) {
        if (outside[y5][x5] || g[y5][x5] === 1 || seen[y5][x5]) continue;
        var cells = [];
        var q = [[y5, x5]];
        seen[y5][x5] = true;
        while (q.length) {
          var cur = q.pop();
          cells.push({ gx: cur[1], gy: cur[0] });
          var nbs = [[cur[0]-1, cur[1]], [cur[0]+1, cur[1]], [cur[0], cur[1]-1], [cur[0], cur[1]+1]];
          nbs.forEach(function(n){
            var ny=n[0], nx=n[1];
            if (ny < 0 || ny >= NC || nx < 0 || nx >= NC) return;
            if (outside[ny][nx] || g[ny][nx] === 1 || seen[ny][nx]) return;
            seen[ny][nx] = true;
            q.push([ny, nx]);
          });
        }
        if (!cells.length) continue;
        var mnX=Infinity, mnY=Infinity, mxX=-1, mxY=-1;
        cells.forEach(function(cell){
          mnX=Math.min(mnX,cell.gx); mnY=Math.min(mnY,cell.gy);
          mxX=Math.max(mxX,cell.gx); mxY=Math.max(mxY,cell.gy);
        });
        rooms.push({ cells: cells, minX:mnX, minY:mnY, maxX:mxX, maxY:mxY,
          sz: cells.length, cx:(mnX+mxX)/2, cy:(mnY+mxY)/2 });
      }
    }
    return rooms;
  }

  /* 点(世界坐标)是否落在任一房间内 */
  function inRooms(point, rooms){
    if (!point || !rooms || !rooms.length) return false;
    var gx = Math.floor((point.x || 0) / GRID), gy = Math.floor((point.y || 0) / GRID);
    for (var i = 0; i < rooms.length; i++) {
      var r = rooms[i];
      if (gx < r.minX || gx > r.maxX || gy < r.minY || gy > r.maxY) continue;
      for (var j = 0; j < r.cells.length; j++) {
        if (r.cells[j].gx === gx && r.cells[j].gy === gy) return true;
      }
    }
    return false;
  }

  /* 返回点所在的房间对象或 null */
  function roomAt(point, rooms){
    if (!point || !rooms || !rooms.length) return null;
    var gx = Math.floor((point.x || 0) / GRID), gy = Math.floor((point.y || 0) / GRID);
    for (var i = 0; i < rooms.length; i++) {
      var r = rooms[i];
      if (gx < r.minX || gx > r.maxX || gy < r.minY || gy > r.maxY) continue;
      for (var j = 0; j < r.cells.length; j++) {
        if (r.cells[j].gx === gx && r.cells[j].gy === gy) return r;
      }
    }
    return null;
  }

  return { GRID: GRID, NC: NC, gridOf: gridOf, astar: astar, followPath: followPath,
           roomsOf: roomsOf, inRooms: inRooms, roomAt: roomAt };
})();
