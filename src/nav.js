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

  function sceneOf(scene){
    scene = scene || {};
    if(scene.generation===1&&window.APH.TerrainModel&&APH.TerrainModel.dimensions&&APH.TerrainModel.hasObservation(scene)){
      var terrainDims=APH.TerrainModel.dimensions(scene);
      return {grid:terrainDims.grid,cols:terrainDims.cols,rows:terrainDims.rows};
    }
    var grid = scene.grid || GRID;
    var hasWidth=scene.width != null, hasHeight=scene.height != null;
    return { grid:grid, cols:hasWidth?Math.floor(scene.width/grid):NC, rows:hasHeight?Math.floor(scene.height/grid):NC };
  }
  function dimensionsOf(grid, scene){
    var spec=sceneOf(scene);
    return { grid:spec.grid, cols:(grid && grid[0] && grid[0].length) || spec.cols, rows:(grid && grid.length) || spec.rows };
  }
  function geometryIndex(buildings, scene){
    if(window.APH.BuildGrid && APH.BuildGrid.index) return APH.BuildGrid.index(buildings, scene && scene.definitions, scene);
    return null;
  }

  /* ---------- 障碍矩阵: 建筑记录 → descriptor 尺寸的 0/1 ---------- */
  var gridCache=new WeakMap();
  function gridOf(buildings, scene){
    var terrainRevision=scene&&scene.generation===1&&window.APH.TerrainModel&&APH.TerrainModel.revision&&APH.TerrainModel.hasObservation(scene)
      ? APH.TerrainModel.revision(scene)
      : [scene&&scene.width,scene&&scene.height,scene&&scene.seed,scene&&scene.generation,scene&&scene.kind].join(':');
    var signature=JSON.stringify([terrainRevision,(buildings||[]).map(function(b){return b&&[b.id,b.uid,b.x,b.y,b.gx,b.gy,b.rotation,b.cells,b.geometryVersion,b.solid,b.dead];})]);
    var cached=buildings&&gridCache.get(buildings);
    if(cached&&cached.signature===signature)return cached.grid;
    var spec=sceneOf(scene), cols=spec.cols, rows=spec.rows;
    var g = [];
    for (var y = 0; y < rows; y++) { g.push(new Array(cols).fill(0)); }
    if(scene&&scene.generation===1&&APH.TerrainModel){
      g.costs=[];
      for(var ty=0;ty<rows;ty++){
        g.costs[ty]=[];
        for(var tx=0;tx<cols;tx++){
          var terrain=APH.TerrainModel.cellAt(scene,(tx+.5)*spec.grid,(ty+.5)*spec.grid);
          if(!terrain.walkable)g[ty][tx]=1;
          g.costs[ty][tx]=terrain.walkable&&isFinite(terrain.moveCost)&&terrain.moveCost>0?terrain.moveCost:Infinity;
        }
      }
    }
    g.revision=signature;g.blockedAny=false;g.costedAny=false;g.scene=scene||null;
    function cache(){g.blockedAny=g.some(function(row){return row.indexOf(1)>=0;});g.costedAny=!!(g.costs&&g.costs.some(function(row){return row.some(function(c){return Math.abs(c-1)>1e-9;});}));if(buildings)gridCache.set(buildings,{signature:signature,grid:g});return g;}
    var spatial=geometryIndex(buildings, scene);
    if(spatial){
      Object.keys(spatial.blocked).forEach(function(k){
        var p=k.split(',').map(Number);
        if(p[0]>=0&&p[0]<cols&&p[1]>=0&&p[1]<rows) g[p[1]][p[0]]=1;
      });
      /* Existing callers historically clamp legacy walls at world edges. Keep that
         compatibility only for the default world; explicit scenes reject partial cells. */
      if(!scene || (scene.width == null && scene.height == null)) (buildings||[]).forEach(function(b){
        if(!b || !BLOCKERS[b.id||b.bid] || (window.APH.BuildGrid && APH.BuildGrid.isNew && APH.BuildGrid.isNew(b))) return;
        var cx=Math.max(0,Math.min(cols-1,Math.floor((b.x||0)/spec.grid))), cy=Math.max(0,Math.min(rows-1,Math.floor((b.y||0)/spec.grid)));
        g[cy][cx]=1;
      });
      return cache();
    }
    (buildings || []).forEach(function(b){
      if (!b || !BLOCKERS[b.id||b.bid]) return;
      var cx = Math.floor((b.x || 0) / spec.grid), cy = Math.floor((b.y || 0) / spec.grid);
      cx = Math.max(0, Math.min(cols - 1, cx)); cy = Math.max(0, Math.min(rows - 1, cy));
      g[cy][cx] = 1;
    });
    return cache();
  }

  /* 视线检查: from→to 线段逐格采样, 无墙则无需绕行 */
  /* 视线检查: from→to 线段逐格采样, 无墙则无需绕行
     P2 (#94): 传入 trapCost 时——直线途经任何被惩罚格(陷阱)也判不清(强制走 A* 比较绕行) */
  function lineClear(grid, from, to, costFn, scene){
    var dims=dimensionsOf(grid,scene), stepGrid=dims.grid;
    var dx = to.x - from.x, dy = to.y - from.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1) return true;
    var steps = Math.ceil(d / (stepGrid / 4));
    for (var i = 1; i <= steps; i++){
      var px = from.x + dx * i / steps;
      var py = from.y + dy * i / steps;
      var cx = Math.floor(px / stepGrid), cy = Math.floor(py / stepGrid);
      if (!grid[cy] || grid[cy][cx] === 1) return false;
      if (costFn && costFn(cx, cy) > 0) return false;   // 途经陷阱: 强制寻路比较
    }
    return true;
  }

  /* ---------- A*: 返回世界坐标路径点数组 | null ----------
     p = [{x,y}...] 不含起点、含终点(终点精确坐标)。
     8 向邻接 + 对角线禁止穿角。
     起终点直线无墙时直接返回 [终点] (空地=直线, walkToward 兼容)。 */
  /* P2 敌避陷阱 (#94): astar 可选 cost 函数 (见下) —— 通过它实现罚权绕行 */
  function terrainCost(grid, x, y){
    var cost=grid&&grid.costs&&grid.costs[y]&&grid.costs[y][x];
    return isFinite(cost)&&cost>0?cost:1;
  }
  function astar(grid, from, to, costFn, scene){
    if (!grid || !from || !to) return null;
    var activeScene=scene||grid.scene;
    var dims=dimensionsOf(grid,activeScene), cols=dims.cols, rows=dims.rows, stepGrid=dims.grid;
    /* Observation 是现代地图的边界真相。越界目标不能先钳到边缘格、
       再由 rebuild 把原始坐标追加回路径，否则实体仍会走出地图。 */
    var observedBounds=activeScene&&activeScene.generation===1&&window.APH.TerrainModel&&APH.TerrainModel.hasObservation(activeScene);
    if(observedBounds&&(!isFinite(to.x)||!isFinite(to.y)||to.x<0||to.y<0||to.x>=cols*stepGrid||to.y>=rows*stepGrid)) return null;
    var pen = costFn || function(){ return 0; };   // P2: 代价惩罚函数(陷阱格) — 必须先定义, lineClear 用
    var pathCost=function(x,y){return pen(x,y)+Math.max(0,terrainCost(grid,x,y)-1);};
    var sx = Math.max(0, Math.min(cols - 1, Math.floor(from.x / stepGrid)));
    var sy = Math.max(0, Math.min(rows - 1, Math.floor(from.y / stepGrid)));
    var tx = Math.max(0, Math.min(cols - 1, Math.floor(to.x / stepGrid)));
    var ty = Math.max(0, Math.min(rows - 1, Math.floor(to.y / stepGrid)));
    if (grid[ty][tx] === 1 && !(sx === tx && sy === ty)) return null;  // 目标在墙内: 无精确路径
    if (lineClear(grid, from, to, pathCost, activeScene)) return [{ x: to.x, y: to.y }];
    if (grid[sy][sx] === 1) sx = -1;   // 起点本身被墙覆盖: 从邻格逃生(起点不入路径)

    var open = [{ x: sx, y: sy, g: 0, f: heur(sx, sy, tx, ty), prev: null }];
    var closed = {};
    var key = function(x, y){ return y * cols + x; };

    while (open.length){
      // 取 f 最小 (规模小, 线性扫描)
      var bi = 0;
      for (var i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
      var cur = open.splice(bi, 1)[0];
      var ck = key(cur.x, cur.y);
      if (closed[ck]) continue;
      closed[ck] = true;
      if (cur.x === tx && cur.y === ty) return rebuild(cur, to, stepGrid);
      for (var dy = -1; dy <= 1; dy++){
        for (var dx = -1; dx <= 1; dx++){
          if (!dx && !dy) continue;
          var nx = cur.x + dx, ny = cur.y + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          if (grid[ny][nx] === 1) continue;
          if (dx && dy){
            // 对角: 两正交向必须都通, 防贴角穿墙
            if (grid[cur.y][nx] === 1 || grid[ny][cur.x] === 1) continue;
          }
          var nk = key(nx, ny);
          if (closed[nk]) continue;
          var move=(dx&&dy)?Math.SQRT2:1;
          var ng = cur.g + move*terrainCost(grid,nx,ny) + pen(nx, ny);   // 地形倍率 + P2 陷阱罚权
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

  function rebuild(node, to, stepGrid){
    var chain = [];
    while (node){ chain.unshift(node); node = node.prev; }
    /* chain[0] = 起点格: 调用方已经在起点, 不入路径 */
    var pts = chain.slice(1).map(function(n){
      return { x: n.x * stepGrid + stepGrid / 2, y: n.y * stepGrid + stepGrid / 2 };
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
  function followPath(e, path, dt, speed, grid){
    if (!e || !path || !path.length){ if (e) e.walking = false; return e; }
    var spd = speed != null ? speed : (CFG.walk && CFG.walk.speed != null ? CFG.walk.speed : 56);
    var step = spd * (dt || 0);
    if (!e.path || e.path !== path){ e.path = path; e.pathI = 0; }
    while (e.pathI < e.path.length){
      var t = e.path[e.pathI];
      var dx = t.x - e.x, dy = t.y - e.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      /* 速度只在这里按目标格地形缩放一次；调用方仍传基础速度。 */
      var dims=dimensionsOf(grid,grid&&grid.scene), gx=Math.floor(t.x/dims.grid), gy=Math.floor(t.y/dims.grid);
      var terrainStep=step/terrainCost(grid,gx,gy);
      if (d <= terrainStep){
        e.x = t.x; e.y = t.y;
        e.pathI++;
        step -= d*terrainCost(grid,gx,gy); // 消耗对应地形的基础步长
        if (step <= 1e-6) break; // 步长耗尽: 停在路径点上, 保持 walking(还有路要走)
        continue;
      }
      e.x += dx / d * terrainStep;
      e.y += dy / d * terrainStep;
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

  var roomCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function roomCellKey(c){ return c.gx + ',' + c.gy; }
  function roomSignature(cells){ return cells.slice().sort(function(a,b){ return a.gy-b.gy || a.gx-b.gx; }).map(roomCellKey).join('|'); }
  function roomStructureSignature(buildings, scene){
    var parts=[], spec=sceneOf(scene), defs=scene && scene.definitions, BG=window.APH.BuildGrid;
    (buildings||[]).forEach(function(b){
      var id=b&& (b.id||b.bid), d=(defs&&defs[id])||b.def||b.definition||{};
      if(!b || !(ROOM_EDGE[id] || d.roomEdge)) return;
      var cells=BG&&BG.cellsOf?BG.cellsOf(b,defs,scene):[{gx:Math.floor((b.x||0)/spec.grid),gy:Math.floor((b.y||0)/spec.grid)}];
      cells.forEach(function(c){ parts.push(id+'@'+c.gx+','+c.gy); });
    });
    return spec.cols+'x'+spec.rows+'@'+spec.grid+'#'+parts.sort().join('|');
  }
  function inheritTemp(cells, oldRooms, ambient){
    var wanted={}, total=0, count=0;
    cells.forEach(function(c){ wanted[roomCellKey(c)]=true; });
    (oldRooms||[]).forEach(function(old){
      if(typeof old.temp!=='number') return;
      var overlap=(old.cells||[]).reduce(function(n,c){ return n+(wanted[roomCellKey(c)]?1:0); },0);
      total+=old.temp*overlap; count+=overlap;
    });
    return count ? total/count : ambient;
  }
  function roomsOf(buildings, scene){
    var spec=sceneOf(scene), rows=spec.rows, cols=spec.cols, signature=roomStructureSignature(buildings,scene);
    var cached=roomCache && buildings && roomCache.get(buildings);
    if(cached && cached.signature===signature) return cached.rooms;
    var g=[];
    for(var y=0;y<rows;y++) g.push(new Array(cols).fill(0));
    var hasAny=false, defs=scene&&scene.definitions, BG=window.APH.BuildGrid;
    (buildings||[]).forEach(function(b){
      if(!b) return;
      var id=b.id||b.bid, d=(defs&&defs[id])||b.def||b.definition||{};
      if(!(ROOM_EDGE[id]||d.roomEdge)) return;
      var cells=BG&&BG.cellsOf?BG.cellsOf(b,defs,scene):[{gx:Math.floor((b.x||0)/spec.grid),gy:Math.floor((b.y||0)/spec.grid)}];
      cells.forEach(function(c){ if(c.gx>=0&&c.gx<cols&&c.gy>=0&&c.gy<rows){g[c.gy][c.gx]=1;hasAny=true;} });
    });
    if(!hasAny){ if(roomCache&&buildings) roomCache.set(buildings,{signature:signature,rooms:[]}); return []; }
    var outside=[], stack=[];
    for(var y2=0;y2<rows;y2++) outside.push(new Array(cols).fill(false));
    for(var x=0;x<cols;x++){ if(!g[0][x])stack.push([0,x]);if(!g[rows-1][x])stack.push([rows-1,x]); }
    for(var y3=0;y3<rows;y3++){ if(!g[y3][0])stack.push([y3,0]);if(!g[y3][cols-1])stack.push([y3,cols-1]); }
    while(stack.length){ var cur=stack.pop(), cy=cur[0],cx=cur[1]; if(cy<0||cy>=rows||cx<0||cx>=cols||outside[cy][cx]||g[cy][cx])continue; outside[cy][cx]=true; stack.push([cy-1,cx],[cy+1,cx],[cy,cx-1],[cy,cx+1]); }
    var seen=[], rooms=[], oldRooms=(cached&&cached.rooms)||[];
    for(var y4=0;y4<rows;y4++) seen.push(new Array(cols).fill(false));
    for(var y5=0;y5<rows;y5++) for(var x5=0;x5<cols;x5++){
      if(outside[y5][x5]||g[y5][x5]||seen[y5][x5]) continue;
      var cells2=[], queue=[[y5,x5]];seen[y5][x5]=true;
      while(queue.length){var c2=queue.pop(),ry=c2[0],rx=c2[1];cells2.push({gx:rx,gy:ry});[[ry-1,rx],[ry+1,rx],[ry,rx-1],[ry,rx+1]].forEach(function(n){if(n[0]>=0&&n[0]<rows&&n[1]>=0&&n[1]<cols&&!outside[n[0]][n[1]]&&!g[n[0]][n[1]]&&!seen[n[0]][n[1]]){seen[n[0]][n[1]]=true;queue.push(n);}});}
      var mnX=Infinity,mnY=Infinity,mxX=-1,mxY=-1;cells2.forEach(function(c3){mnX=Math.min(mnX,c3.gx);mnY=Math.min(mnY,c3.gy);mxX=Math.max(mxX,c3.gx);mxY=Math.max(mxY,c3.gy);});
      var exact=null,sig=roomSignature(cells2);oldRooms.forEach(function(r){if(!exact&&roomSignature(r.cells||[])===sig)exact=r;});
      rooms.push(exact || {id:'room_'+cells2[0].gx+'_'+cells2[0].gy,cells:cells2,minX:mnX,minY:mnY,maxX:mxX,maxY:mxY,sz:cells2.length,cx:(mnX+mxX)/2,cy:(mnY+mxY)/2,temp:inheritTemp(cells2,oldRooms,scene&&typeof scene.ambient==='number'?scene.ambient:21)});
    }
    if(roomCache&&buildings) roomCache.set(buildings,{signature:signature,rooms:rooms});
    return rooms;
  }

  /* 点(世界坐标)是否落在任一房间内 */
  function inRooms(point, rooms, scene){
    if (!point || !rooms || !rooms.length) return false;
    var spec=sceneOf(scene), gx = Math.floor((point.x || 0) / spec.grid), gy = Math.floor((point.y || 0) / spec.grid);
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
  function roomAt(point, rooms, scene){
    if (!point || !rooms || !rooms.length) return null;
    var spec=sceneOf(scene), gx = Math.floor((point.x || 0) / spec.grid), gy = Math.floor((point.y || 0) / spec.grid);
    for (var i = 0; i < rooms.length; i++) {
      var r = rooms[i];
      if (gx < r.minX || gx > r.maxX || gy < r.minY || gy > r.maxY) continue;
      for (var j = 0; j < r.cells.length; j++) {
        if (r.cells[j].gx === gx && r.cells[j].gy === gy) return r;
      }
    }
    return null;
  }

  var ROLE_NAMES = { bedroom:'卧室', dining:'食堂', rec:'娱乐室', hospital:'医院', workshop:'车间', empty:'空房间', none:'室外' };
  function roomRoleOf(room, buildings){
    if(!room) return 'none';
    var tags = {};
    (buildings || []).forEach(function(b){
      if(!b) return;
      if(!roomAt({ x:b.x, y:b.y }, [room])) return;
      tags[b.id || b.bid] = true;
    });
    if(tags.bl_clinic) return 'hospital';
    if(tags.bl_house) return 'bedroom';
    if(tags.bl_dining_table) return 'dining';
    if(tags.bl_tv || tags.bl_campfire) return 'rec';
    if(tags.bl_workshop || tags.bl_lab) return 'workshop';
    return 'empty';
  }
  function roomRoleName(role){ return ROLE_NAMES[role] || ROLE_NAMES.none; }
  return { GRID: GRID, NC: NC, gridOf: gridOf, astar: astar, followPath: followPath,
           terrainCost:terrainCost, roomsOf: roomsOf, inRooms: inRooms, roomAt: roomAt,
           roomRoleOf: roomRoleOf, roomRoleName: roomRoleName };
})();
