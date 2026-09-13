/* ============================================================
   Aphelion · observe.js — 从群系砖表观测格网 (ADR-48)
   挂载: window.APH.Observe
   对外：observe / ensure* / gridOf / cellAt / land。求解器藏在里面。
   ============================================================ */
window.APH = window.APH || {};

APH.Observe = (function(){
  'use strict';
  var U = APH.U, CFG = APH.CFG;

  function link(adj, a, b){
    if(!adj[a]) adj[a] = {};
    if(!adj[b]) adj[b] = {};
    adj[a][b] = 1;
    adj[b][a] = 1;
  }
  function clique(adj, ids){
    var i, j;
    for(i = 0; i < ids.length; i++){
      for(j = i; j < ids.length; j++) link(adj, ids[i], ids[j]);
    }
  }
  function table(tiles, bonds){
    var adj = {}, t = {}, i;
    for(i = 0; i < tiles.length; i++) t[tiles[i].id] = { w: tiles[i].w };
    for(i = 0; i < bonds.length; i++) clique(adj, bonds[i]);
    return { tiles: t, adj: adj };
  }

  var GROUND6 = ['landing','woodland','lakeshore','ridge','alien','wreckage'];
  var TABLES = {};
  TABLES.biome_landing = table(
    [
      { id:'landing', w:3 }, { id:'woodland', w:8 }, { id:'lakeshore', w:4 },
      { id:'ridge', w:3 }, { id:'alien', w:3 }, { id:'wreckage', w:3 },
      { id:'water', w:3 }, { id:'tree', w:2 }, { id:'rock_stone', w:2 },
      { id:'rock_iron', w:1 }, { id:'bush_berry', w:1 }, { id:'bush_herb', w:1 },
      { id:'bush_alien', w:1 }, { id:'rock_wreckage', w:1 }
    ],
    [
      GROUND6,
      ['water','water'], ['water','lakeshore'],
      ['woodland','tree','bush_berry','bush_herb'],
      ['ridge','rock_stone','rock_iron'],
      ['alien','bush_alien'],
      ['wreckage','rock_wreckage','rock_iron']
    ]
  );
  TABLES.biome_spore_forest = table(
    [
      { id:'spore_moss', w:8 }, { id:'spore_grove', w:5 },
      { id:'spore_water', w:3 }, { id:'glow_cap', w:2 }
    ],
    [
      ['spore_moss','spore_grove','glow_cap'],
      ['spore_moss','spore_water'], ['spore_water','spore_water']
    ]
  );
  TABLES.biome_crystal_wasteland = table(
    [
      { id:'silica', w:8 }, { id:'spire', w:4 },
      { id:'crystal_water', w:2 }, { id:'shard', w:2 }
    ],
    [
      ['silica','spire','shard'],
      ['silica','crystal_water'], ['crystal_water','crystal_water']
    ]
  );
  TABLES.biome_acid_marsh = table(
    [
      { id:'peat', w:7 }, { id:'bog', w:5 },
      { id:'acid_pool', w:3 }, { id:'reed', w:2 }
    ],
    [
      ['peat','bog','reed'],
      ['bog','acid_pool'], ['acid_pool','acid_pool']
    ]
  );
  TABLES.biome_cryo_tundra = table(
    [
      { id:'permafrost', w:8 }, { id:'snowfield', w:5 },
      { id:'pack_ice', w:3 }, { id:'frost_shrub', w:2 }
    ],
    [
      ['permafrost','snowfield','frost_shrub'],
      ['snowfield','pack_ice'], ['pack_ice','pack_ice']
    ]
  );

  function keysOf(obj){
    var out = [], k;
    for(k in obj) if(obj.hasOwnProperty(k)) out.push(k);
    return out;
  }
  function countOf(obj){
    var n = 0, k;
    for(k in obj) if(obj.hasOwnProperty(k)) n++;
    return n;
  }
  function pickWeighted(set, tiles, rng){
    var ids = keysOf(set), i, sum = 0, w, r;
    for(i = 0; i < ids.length; i++){
      w = tiles[ids[i]] ? tiles[ids[i]].w : 1;
      sum += w;
    }
    r = rng() * sum;
    for(i = 0; i < ids.length; i++){
      w = tiles[ids[i]] ? tiles[ids[i]].w : 1;
      r -= w;
      if(r <= 0) return ids[i];
    }
    return ids[ids.length - 1];
  }
  function cloneSet(src){
    var o = {}, k;
    for(k in src) if(src.hasOwnProperty(k)) o[k] = 1;
    return o;
  }
  function allTiles(tiles){
    var o = {}, k;
    for(k in tiles) if(tiles.hasOwnProperty(k)) o[k] = 1;
    return o;
  }
  function pinMap(pins, W, H){
    var m = {}, i, p, x, y;
    pins = pins || [];
    for(i = 0; i < pins.length; i++){
      p = pins[i];
      x = p.gx; y = p.gy;
      if(x < 0 || y < 0 || x >= W || y >= H || !p.tile) continue;
      m[y * W + x] = p.tile;
    }
    return m;
  }
  function neighbors(i, W, H){
    var x = i % W, y = (i - x) / W, out = [];
    if(x > 0) out.push(i - 1);
    if(x + 1 < W) out.push(i + 1);
    if(y > 0) out.push(i - W);
    if(y + 1 < H) out.push(i + W);
    return out;
  }
  function canTouch(adj, remaining, tile){
    var a;
    for(a in remaining){
      if(remaining.hasOwnProperty(a) && adj[a] && adj[a][tile]) return true;
    }
    return false;
  }
  function propagate(poss, adj, W, H, start){
    var q = start.slice(), seen = {}, i, nbs, ni, n, tile, next, changed;
    while(q.length){
      i = q.pop();
      seen[i] = 0;
      nbs = neighbors(i, W, H);
      for(n = 0; n < nbs.length; n++){
        ni = nbs[n];
        next = {};
        changed = false;
        for(tile in poss[ni]){
          if(!poss[ni].hasOwnProperty(tile)) continue;
          if(canTouch(adj, poss[i], tile)) next[tile] = 1;
          else changed = true;
        }
        if(!countOf(next)) return false;
        if(changed){
          poss[ni] = next;
          if(!seen[ni]){ seen[ni] = 1; q.push(ni); }
        }
      }
    }
    return true;
  }
  function collapseOne(poss, tiles, rng, W, H, adj){
    var i, n, best = 1e9, ties = [], pick, tile, only;
    for(i = 0; i < poss.length; i++){
      n = countOf(poss[i]);
      if(n === 0) return false;
      if(n === 1) continue;
      if(n < best){ best = n; ties = [i]; }
      else if(n === best) ties.push(i);
    }
    if(!ties.length) return 'done';
    pick = ties[Math.floor(rng() * ties.length)];
    tile = pickWeighted(poss[pick], tiles, rng);
    only = {}; only[tile] = 1;
    poss[pick] = only;
    if(!propagate(poss, adj, W, H, [pick])) return 'dead';
    return 'cont';
  }
  function materialize(poss, W, H){
    var g = [], y, x, ids, row;
    for(y = 0; y < H; y++){
      row = [];
      for(x = 0; x < W; x++){
        ids = keysOf(poss[y * W + x]);
        if(ids.length !== 1) return null;
        row.push(ids[0]);
      }
      g.push(row);
    }
    return g;
  }
  function tryWfc(tab, W, H, pins, rng){
    var poss = [], i, pinned = pinMap(pins, W, H), tile, only, starts = [];
    for(i = 0; i < W * H; i++) poss[i] = allTiles(tab.tiles);
    for(i in pinned){
      if(!pinned.hasOwnProperty(i)) continue;
      tile = pinned[i];
      if(!tab.tiles[tile]) return null;
      only = {}; only[tile] = 1;
      poss[+i] = only;
      starts.push(+i);
    }
    if(starts.length && !propagate(poss, tab.adj, W, H, starts)) return null;
    for(i = 0; i < W * H + 4; i++){
      var step = collapseOne(poss, tab.tiles, rng, W, H, tab.adj);
      if(step === 'dead') return null;
      if(step === 'done') return materialize(poss, W, H);
    }
    return null;
  }
  function partitionTile(tab, x, y){
    var G = CFG.GRID || 48, hab = CFG.HAB || {x:1100,y:1100,r:92}, lake = CFG.LAKE || {x:1660,y:1560,r:148};
    var wx = (x + 0.5) * G, wy = (y + 0.5) * G;
    var dHab = U.dst(wx, wy, hab.x, hab.y), dLake = U.dst(wx, wy, lake.x, lake.y);
    if(dHab < (hab.r || 92) + 40 && tab.tiles.landing) return 'landing';
    if(dLake < (lake.r || 148) && tab.tiles.water) return 'water';
    if(dLake < (lake.r || 148) + G && tab.tiles.lakeshore) return 'lakeshore';
    if(tab.tiles.woodland) return 'woodland';
    var ids = keysOf(tab.tiles);
    return ids[0];
  }
  function fallbackGrid(tab, W, H, pins, rng, biomeId){
    var g = [], y, x, row, pinned = pinMap(pins, W, H), i, all = allTiles(tab.tiles), tile;
    for(y = 0; y < H; y++){
      row = [];
      for(x = 0; x < W; x++){
        i = y * W + x;
        if(pinned.hasOwnProperty(i) && tab.tiles[pinned[i]]) tile = pinned[i];
        else if(biomeId === 'biome_landing') tile = partitionTile(tab, x, y);
        else tile = pickWeighted(all, tab.tiles, rng);
        row.push(tile);
      }
      g.push(row);
    }
    return g;
  }
  function hushDryShore(grid, pins){
    var W, H, y, x, i, pinned, wet = false, waters, woodland;
    if(!grid || !grid.length) return grid;
    H = grid.length; W = grid[0].length;
    waters = (CFG.observe && CFG.observe.waterTiles) || ['water'];
    for(y = 0; y < H; y++) for(x = 0; x < W; x++) if(inList(waters, grid[y][x])) wet = true;
    if(wet) return grid;
    pinned = pinMap(pins, W, H);
    woodland = 'woodland';
    for(y = 0; y < H; y++) for(x = 0; x < W; x++){
      i = y * W + x;
      if(grid[y][x] === 'lakeshore' && !pinned.hasOwnProperty(i)) grid[y][x] = woodland;
    }
    return grid;
  }

  function observe(opts){
    opts = opts || {};
    var biomeId = opts.biomeId || 'biome_landing';
    var tab = TABLES[biomeId] || TABLES.biome_landing;
    var W = opts.widthCells | 0;
    var H = opts.heightCells | 0;
    var seed = (opts.seed >>> 0);
    var pins = opts.pins || [];
    var retries = CFG.observe.retries;
    var attempt, rng, grid;
    if(W < 1) W = 1;
    if(H < 1) H = 1;
    for(attempt = 0; attempt < retries; attempt++){
      rng = U.makeRng((seed ^ Math.imul(attempt + 1, 0x9E3779B9)) >>> 0);
      grid = tryWfc(tab, W, H, pins, rng);
      if(grid){
        grid = hushDryShore(grid, pins);
        return { grid: grid, degraded: false, biomeId: TABLES[biomeId] ? biomeId : 'biome_landing' };
      }
    }
    rng = U.makeRng((seed ^ 0xC0FFEE11) >>> 0);
    return {
      grid: hushDryShore(fallbackGrid(tab, W, H, pins, rng, biomeId), pins),
      degraded: true,
      biomeId: TABLES[biomeId] ? biomeId : 'biome_landing'
    };
  }

  function gridOf(holder){
    if(!holder || !holder.observation || !holder.observation.grid) return null;
    return holder.observation.grid;
  }
  function stamp(holder, result){
    holder.observation = {
      grid: result.grid,
      degraded: !!result.degraded,
      biomeId: result.biomeId
    };
    return holder;
  }
  function sizeOf(opts){
    var cells = Math.floor((CFG.WORLD || 2200) / (CFG.GRID || 48));
    return {
      widthCells: (opts && opts.widthCells) || cells,
      heightCells: (opts && opts.heightCells) || cells
    };
  }
  function defaultHomePins(W, H){
    var G = CFG.GRID || 48, o = CFG.observe || {}, hab = CFG.HAB || {x:1100,y:1100};
    var cx = Math.floor(hab.x / G), cy = Math.floor(hab.y / G);
    var half = (o.habCells || 20) / 2, pins = [], gx, gy, i, ang, r, nWood, nStone;
    for(gy = Math.floor(cy - half); gy < cy + half; gy++){
      for(gx = Math.floor(cx - half); gx < cx + half; gx++){
        if(gx >= 0 && gy >= 0 && gx < W && gy < H) pins.push({ gx: gx, gy: gy, tile: 'landing' });
      }
    }
    nWood = o.starterWood || 24; nStone = o.starterStone || 18; r = o.starterRing || 8;
    for(i = 0; i < nWood; i++){
      ang = i * Math.PI * 2 / nWood;
      gx = Math.round(cx + Math.cos(ang) * r); gy = Math.round(cy + Math.sin(ang) * r);
      if(gx >= 0 && gy >= 0 && gx < W && gy < H) pins.push({ gx: gx, gy: gy, tile: 'tree' });
    }
    for(i = 0; i < nStone; i++){
      ang = i * Math.PI * 2 / nStone + 0.19;
      gx = Math.round(cx + Math.cos(ang) * (r + 1)); gy = Math.round(cy + Math.sin(ang) * (r + 1));
      if(gx >= 0 && gy >= 0 && gx < W && gy < H) pins.push({ gx: gx, gy: gy, tile: 'rock_stone' });
    }
    return pins;
  }
  function syncLakeR(holder){
    if(!holder || !holder.terrain) return;
    if(!hasWater(holder)) holder.terrain.lakeR = 0;
  }
  function ensureHome(colony, opts){
    colony = colony || {};
    if(gridOf(colony)) return colony;
    opts = opts || {};
    var sz = sizeOf(opts);
    var pins = opts.pins != null ? opts.pins : defaultHomePins(sz.widthCells, sz.heightCells);
    stamp(colony, observe({
      seed: opts.seed,
      biomeId: (CFG.observe && CFG.observe.homeBiome) || 'biome_landing',
      widthCells: sz.widthCells,
      heightCells: sz.heightCells,
      pins: pins
    }));
    syncLakeR(colony);
    return colony;
  }
  function ensurePlanet(spec, opts){
    if(!spec) return spec;
    if(gridOf(spec)) return spec;
    opts = opts || {};
    var sz = sizeOf(opts);
    var biomeId = (spec.biome && spec.biome.id) || opts.biomeId;
    stamp(spec, observe({
      seed: spec.seed,
      biomeId: biomeId,
      widthCells: sz.widthCells,
      heightCells: sz.heightCells,
      pins: opts.pins
    }));
    syncLakeR(spec);
    return spec;
  }

  function inList(list, id){
    var i;
    list = list || [];
    for(i = 0; i < list.length; i++) if(list[i] === id) return true;
    return false;
  }
  function hasWater(holder){
    var grid = gridOf(holder), y, x, waters;
    if(!grid) return false;
    waters = (CFG.observe && CFG.observe.waterTiles) || ['water'];
    for(y = 0; y < grid.length; y++){
      for(x = 0; x < grid[y].length; x++){
        if(inList(waters, grid[y][x])) return true;
      }
    }
    return false;
  }
  function cellAt(holder, gx, gy){
    var grid = gridOf(holder), tile, water, fertTbl, fertility;
    if(!grid || gy < 0 || gy >= grid.length || gx < 0 || gx >= grid[gy].length) return null;
    tile = grid[gy][gx];
    water = inList((CFG.observe && CFG.observe.waterTiles) || ['water'], tile);
    fertTbl = (CFG.observe && CFG.observe.fertility) || {};
    fertility = fertTbl[tile];
    if(fertility == null) fertility = water ? 0 : (fertTbl.default != null ? fertTbl.default : 0);
    return {
      tile: tile,
      walkable: !water,
      fertility: fertility,
      water: water,
      shore: tile === 'lakeshore' && hasWater(holder),
      floraKind: inList((CFG.observe && CFG.observe.floraTiles) || [], tile) ? tile : null
    };
  }
  function walkableWorld(holder, x, y){
    var G = CFG.GRID || 48, c;
    if(!gridOf(holder)) return true;
    c = cellAt(holder, Math.floor(x / G), Math.floor(y / G));
    return !!(c && c.walkable);
  }
  function scatterFree(holder, x, y){
    var G = CFG.GRID || 48, c;
    if(!gridOf(holder)) return true;
    c = cellAt(holder, Math.floor(x / G), Math.floor(y / G));
    if(!c) return true;
    return !!(c.walkable && !c.floraKind);
  }
  function paintBlockers(nav, holder){
    var y, x, c;
    if(!nav || !gridOf(holder)) return nav;
    for(y = 0; y < nav.length; y++){
      for(x = 0; x < nav[y].length; x++){
        c = cellAt(holder, x, y);
        if(c && !c.walkable) nav[y][x] = 1;
      }
    }
    return nav;
  }
  function floraHp(kind){
    var hp = (CFG.observe && CFG.observe.floraHp) || {};
    if(hp[kind] != null) return hp[kind];
    return hp.default != null ? hp.default : 0;
  }
  function floraFrom(holder){
    var grid = gridOf(holder), out = [], y, x, c, G, hp;
    if(!grid) return out;
    G = CFG.GRID || 48;
    for(y = 0; y < grid.length; y++){
      for(x = 0; x < grid[y].length; x++){
        c = cellAt(holder, x, y);
        if(!c || !c.floraKind) continue;
        hp = floraHp(c.floraKind);
        out.push({
          id: 'flora_' + c.floraKind + '_' + x + '_' + y,
          type: 'flora', kind: c.floraKind,
          x: (x + 0.5) * G, y: (y + 0.5) * G,
          hp: hp, maxHp: hp
        });
      }
    }
    return out;
  }

  function destinations(meta){
    var out = [{ kind: 'unknown' }], seen = {}, list, i, p;
    list = (meta && meta.atlas) || [];
    for(i = 0; i < list.length; i++){
      p = list[i];
      if(!p || !p.id || seen[p.id]) continue;
      seen[p.id] = 1;
      out.push({ kind: 'known', id: p.id, name: p.name, biomeId: p.biomeId });
    }
    return out;
  }
  function canLaunch(dest){
    if(!dest || dest.kind == null) return { ok: false, why: 'no_destination' };
    if(dest.kind === 'unknown') return { ok: true };
    if(dest.kind === 'known' && dest.id) return { ok: true };
    return { ok: false, why: 'no_destination' };
  }
  function fromCodex(){ return { ok: false, why: 'codex_readonly' }; }
  function rememberAtlas(meta, spec){
    var i;
    if(!meta || !spec || !spec.id) return;
    meta.atlas = meta.atlas || [];
    for(i = 0; i < meta.atlas.length; i++) if(meta.atlas[i] && meta.atlas[i].id === spec.id) return;
    meta.atlas.push({ id: spec.id, name: spec.name, biomeId: spec.biome && spec.biome.id });
  }
  function persistPlanet(spec, opts){
    if(!spec || !spec.id || !opts || !opts.savePlanet) return;
    opts.savePlanet(spec.id, spec);
  }
  function land(dest, opts){
    opts = opts || {};
    var spec, first, gate;
    if(opts.run && opts.run.spec && gridOf(opts.run.spec)){
      if(!dest || dest.kind === 'resume' || (dest.kind === 'known' && dest.id === opts.run.spec.id)){
        return { ok: true, spec: opts.run.spec, resumed: true, first: false };
      }
    }
    gate = canLaunch(dest);
    if(!gate.ok) return gate;
    if(dest.kind === 'known'){
      spec = opts.loadPlanet ? opts.loadPlanet(dest.id) : null;
      if(!spec) return { ok: false, why: 'missing' };
    } else {
      if(!opts.makePlanet) return { ok: false, why: 'no_planet' };
      spec = opts.makePlanet(opts.seed);
      if(!spec) return { ok: false, why: 'no_planet' };
    }
    first = !gridOf(spec);
    ensurePlanet(spec, opts);
    persistPlanet(spec, opts);
    rememberAtlas(opts.meta, spec);
    return { ok: true, spec: spec, resumed: false, first: first };
  }

  return {
    observe: observe, ensureHome: ensureHome, ensurePlanet: ensurePlanet, gridOf: gridOf,
    cellAt: cellAt, hasWater: hasWater, walkableWorld: walkableWorld, scatterFree: scatterFree,
    paintBlockers: paintBlockers, floraFrom: floraFrom,
    destinations: destinations, canLaunch: canLaunch, fromCodex: fromCodex, land: land
  };
})();
