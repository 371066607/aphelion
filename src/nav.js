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
  function lineClear(grid, from, to){
    var dx = to.x - from.x, dy = to.y - from.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1) return true;
    var steps = Math.ceil(d / (GRID / 4));
    for (var i = 1; i <= steps; i++){
      var px = from.x + dx * i / steps;
      var py = from.y + dy * i / steps;
      var cx = Math.floor(px / GRID), cy = Math.floor(py / GRID);
      if (grid[cy][cx] === 1) return false;
    }
    return true;
  }

  /* ---------- A*: 返回世界坐标路径点数组 | null ----------
     p = [{x,y}...] 不含起点、含终点(终点精确坐标)。
     8 向邻接 + 对角线禁止穿角。
     起终点直线无墙时直接返回 [终点] (空地=直线, walkToward 兼容)。 */
  function astar(grid, from, to){
    if (!grid || !from || !to) return null;
    var sx = Math.max(0, Math.min(NC - 1, Math.floor(from.x / GRID)));
    var sy = Math.max(0, Math.min(NC - 1, Math.floor(from.y / GRID)));
    var tx = Math.max(0, Math.min(NC - 1, Math.floor(to.x / GRID)));
    var ty = Math.max(0, Math.min(NC - 1, Math.floor(to.y / GRID)));
    if (grid[ty][tx] === 1 && !(sx === tx && sy === ty)) return null;  // 目标在墙内: 无精确路径
    if (lineClear(grid, from, to)) return [{ x: to.x, y: to.y }];
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
          var ng = cur.g + 1;
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

  return { GRID: GRID, NC: NC, gridOf: gridOf, astar: astar, followPath: followPath };
})();
