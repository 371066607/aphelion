/* ============================================================
   Aphelion · build_grid.js — shared building geometry contract.
   New geometry records use grid anchors; legacy pixel records retain their
   historical one-cell navigation occupancy until their interaction path moves.
   ============================================================ */
window.APH = window.APH || {};

APH.BuildGrid = (function(){
  'use strict';
  var DEFAULT_GRID = 48;
  var DIRS = [[0,-1],[1,0],[0,1],[-1,0]];

  function dimensionsOf(scene){
    if(scene&&scene.generation===1&&window.APH.TerrainModel&&APH.TerrainModel.hasObservation(scene)){
      var terrain=APH.TerrainModel.dimensions(scene);
      return {grid:terrain.grid,cols:terrain.cols,rows:terrain.rows,bounded:true};
    }
    var grid=(scene&&scene.grid)||DEFAULT_GRID;
    return {grid:grid,cols:scene&&scene.width!=null?Math.floor(scene.width/grid):0,
      rows:scene&&scene.height!=null?Math.floor(scene.height/grid):0,
      bounded:!!(scene&&scene.width!=null&&scene.height!=null)};
  }
  function gridOf(scene){ return dimensionsOf(scene).grid; }
  function key(gx, gy){ return gx + ',' + gy; }
  function rotationOf(record){
    var r = Math.round(Number(record && record.rotation) || 0) % 4;
    return r < 0 ? r + 4 : r;
  }
  function isNew(record){ return !!record && Number(record.geometryVersion) === 1; }
  function recordId(record){ return record && (record.bid || record.id); }
  function definitionOf(record, definitions){
    if (!record) return {};
    var id=recordId(record), base=(definitions && definitions[id]) || {};
    if (!id) return record;
    /* New records may override catalogue geometry without mutating it. */
    var out={}, fields=['cells','w','h','layer','solid','interaction','access','roomEdge'];
    Object.keys(base).forEach(function(k){out[k]=base[k];});
    if(record.definition) Object.keys(record.definition).forEach(function(k){out[k]=record.definition[k];});
    fields.forEach(function(k){if(record[k] != null) out[k]=record[k];});
    return out;
  }
  function dimensions(definition){
    var cells = definition && definition.cells;
    return { w: Math.max(1, Number(cells && cells[0]) || Number(definition && definition.w) || 1),
             h: Math.max(1, Number(cells && cells[1]) || Number(definition && definition.h) || 1) };
  }
  /* Accept either a building record or a definition. */
  function footprint(record, definitions){
    var d = definitionOf(record, definitions), legacy=record && !isNew(record) && record.legacyFootprint;
    var size = legacy && legacy !== true ? dimensions({cells:Array.isArray(legacy)?legacy:[legacy.w,legacy.h]}) : dimensions(d), r = rotationOf(record);
    return r % 2 ? { w:size.h, h:size.w } : size;
  }
  function legacyCell(record, scene){
    var g = gridOf(scene);
    return { gx:Math.floor((Number(record && record.x) || 0) / g), gy:Math.floor((Number(record && record.y) || 0) / g) };
  }
  function cellsOf(record, definitions, scene){
    if (!record) return [];
    if (!isNew(record)) return [legacyCell(record, scene)];
    var fp = footprint(record, definitions), out = [];
    for (var y = 0; y < fp.h; y++) for (var x = 0; x < fp.w; x++) out.push({ gx:record.gx + x, gy:record.gy + y });
    return out;
  }
  /* Placement and overlap preserve legacy AABB, while navigation keeps legacy single-cell behavior. */
  function placementCells(record, definitions, scene){
    if(isNew(record)) return cellsOf(record,definitions,scene);
    var g=gridOf(scene), fp=footprint(record,definitions), left=(Number(record&&record.x)||0)-fp.w*g/2, top=(Number(record&&record.y)||0)-fp.h*g/2, out=[];
    var startX=Math.floor(left/g), startY=Math.floor(top/g);
    for(var y=0;y<fp.h;y++) for(var x=0;x<fp.w;x++) out.push({gx:startX+x,gy:startY+y});
    return out;
  }
  function rectOf(record, definitions, scene){
    var g = gridOf(scene), fp = footprint(record, definitions);
    if (!isNew(record)) return { x:(Number(record && record.x) || 0)-fp.w*g/2, y:(Number(record && record.y) || 0)-fp.h*g/2, w:fp.w * g, h:fp.h * g };
    return { x:record.gx * g, y:record.gy * g, w:fp.w * g, h:fp.h * g };
  }
  function valid(c, scene){
    var dims=dimensionsOf(scene);
    if (!dims.bounded) return c.gx >= 0 && c.gy >= 0;
    return c.gx >= 0 && c.gy >= 0 && c.gx < dims.cols && c.gy < dims.rows;
  }
  function perimeterCells(record, definitions, scene){
    var own = {}, candidates = {};
    cellsOf(record, definitions, scene).forEach(function(c){ own[key(c.gx,c.gy)] = true; });
    cellsOf(record, definitions, scene).forEach(function(c){
      DIRS.forEach(function(d){ var n={gx:c.gx+d[0],gy:c.gy+d[1]}, k=key(n.gx,n.gy); if (!own[k] && valid(n,scene)) candidates[k]=n; });
    });
    return Object.keys(candidates).map(function(k){ return candidates[k]; }).sort(cellSort);
  }
  function interactionCells(record, definitions, options){
    options = options || {};
    var scene = options.scene, d = definitionOf(record, definitions), directional = d.interaction === 'front' || d.access === 'front';
    var out;
    if (!directional) out = perimeterCells(record, definitions, scene);
    else {
      var fp=footprint(record,definitions), r=rotationOf(record);
      out=[];
      if(r===0) for(var x=0;x<fp.w;x++) out.push({gx:record.gx+x,gy:record.gy+fp.h});
      else if(r===1) for(var y=0;y<fp.h;y++) out.push({gx:record.gx-1,gy:record.gy+y});
      else if(r===2) for(var x2=0;x2<fp.w;x2++) out.push({gx:record.gx+x2,gy:record.gy-1});
      else for(var y2=0;y2<fp.h;y2++) out.push({gx:record.gx+fp.w,gy:record.gy+y2});
      out=out.filter(function(c){ return valid(c,scene); });
    }
    var blocked=options.blocked || {};
    return out.filter(function(c){ return !blocked[key(c.gx,c.gy)]; }).sort(cellSort);
  }
  function index(records, definitions, scene){
    var result={ layers:{}, physical:{}, blocked:{}, records:{} };
    (records || []).forEach(function(record){
      if(!record) return;
      var d=definitionOf(record,definitions), layer=d.layer || record.layer || 'structure';
      placementCells(record,definitions,scene).forEach(function(c){
        if(!valid(c,scene)) return;
        var k=key(c.gx,c.gy); result.layers[layer]=result.layers[layer] || {};
        (result.layers[layer][k]=result.layers[layer][k] || []).push(record);
        if(layer==='structure'||layer==='furniture') (result.physical[k]=result.physical[k] || []).push(record);
        /* Legacy furniture deliberately retain the current walking contract. */
      });
      var id=recordId(record);
      if((id==='bl_wall'||id==='bl_siege_camp'||(isNew(record)&&d.solid)) && id!=='bl_gate') {
        cellsOf(record,definitions,scene).forEach(function(c){ if(valid(c,scene)) result.blocked[key(c.gx,c.gy)]=true; });
      }
    });
    return result;
  }
  function cellSort(a,b){ return a.gy-b.gy || a.gx-b.gx; }
  return { key:key, isNew:isNew, recordId:recordId, normalizeRotation:rotationOf, definitionOf:definitionOf,
    footprint:footprint, cellsOf:cellsOf, placementCells:placementCells, rectOf:rectOf, interactionCells:interactionCells, index:index };
})();
