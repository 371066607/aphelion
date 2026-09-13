/* Formal planning seam: one record drives preview, collision and interaction. */
window.APH = window.APH || {};
APH.Construction = (function(){
  'use strict';
  var CFG=APH.CFG;
  var BASIC={bl_wall:1,bl_gate:1,bl_bed:1,bl_floor:1,bl_storage_shelf:1,bl_campfire:1,bl_dining_table:1,bl_dining_chair:1};
  var SHAPES={bl_bed:[1,2],bl_dining_table:[2,2],bl_lab:[2,1],bl_kitchen:[2,1],bl_workshop:[2,1]};
  function record(bid, wx, wy, rotation){
    var d=APH.Colony.get(bid)||{}, cells=(SHAPES[bid]||d.cells||[1,1]).slice();
    var r=((Math.round(rotation||0)%4)+4)%4;
    var w=cells[r%2?1:0], h=cells[r%2?0:1], g=CFG.GRID;
    var gx=Math.floor(wx/g),gy=Math.floor(wy/g);
    var layer=bid==='bl_floor'||bid==='bl_carpet'?'floor':bid==='bl_conduit'?'conduit':
      bid==='bl_wall'||bid==='bl_gate'?'structure':'furniture';
    var solid=layer==='furniture' && ['bl_crop_plot','bl_farm','bl_spike_trap','bl_sandbag','bl_campfire'].indexOf(bid)<0;
  return {id:bid,bid:bid,geometryVersion:1,gx:gx,gy:gy,rotation:r,cells:cells,layer:layer,
      solid:solid||bid==='bl_wall',interaction:(bid==='bl_wall'||bid==='bl_gate')?'perimeter':'front',x:(gx+w/2)*g,y:(gy+h/2)*g,lv:1};
  }
  function ghost(s,bid,wx,wy,rotation){
    var d=APH.Colony.get(bid); if(!d)return {ok:false,why:'未知建筑'};
    var b=record(bid,wx,wy,rotation), grid=APH.BuildGrid, rect=grid.rectOf(b),
      scene=s.colony.scene||{width:CFG.WORLD,height:CFG.WORLD,grid:CFG.GRID};
    var why='';
    if(rect.x<0||rect.y<0||rect.x+rect.w>scene.width||rect.y+rect.h>scene.height)why='超出家园边界';
    if(!BASIC[bid]&&d.reqTech&&!(s.meta.tech||{})[d.reqTech]&&!s.devFreeBuild)why='需先研发：'+(APH.Colony.TECHS[d.reqTech]||{}).name;
    var objects=(s.colony.buildings||[]).concat(s.colony.buildQueue||[]);
    var count=0;
    objects.forEach(function(o){
      var id=o.bid||o.id;if(id===bid)count++;
      var def=APH.Colony.get(id)||{};
      var layer=o.layer||(id==='bl_conduit'?'conduit':id==='bl_carpet'||id==='bl_floor'?'floor':'furniture');
      var physical=b.layer==='furniture'||b.layer==='structure';
      if(layer!==b.layer&&!(physical&&(layer==='furniture'||layer==='structure')))return;
      var other=grid.rectOf(o,APH.Colony.list());
      if(rect.x<other.x+other.w&&rect.x+rect.w>other.x&&rect.y<other.y+other.h&&rect.y+rect.h>other.y)why='该空间已被占用';
    });
    (s.entities||[]).forEach(function(e){
      if(e&&!e.dead&&e.type===CFG.entType.FLORA&&e.x>=rect.x&&e.x<rect.x+rect.w&&e.y>=rect.y&&e.y<rect.y+rect.h)why='先清理这里的植被或矿石';
    });
    if(count>=(d.max||99)&&!s.devFreeBuild)why='已达数量上限';
    if(APH.TerrainModel&&scene.generation===1)grid.cellsOf(b).forEach(function(c){
      if(!APH.TerrainModel.cellAt(scene,(c.gx+.5)*CFG.GRID,(c.gy+.5)*CFG.GRID).buildable)why='地形不能建设';
    });
    return {ok:!why,why:why,record:b,bid:bid,x:b.x,y:b.y,w:rect.w,h:rect.h};
  }
  function spot(s,b,from){
    if(!b)return null;
    if(b.geometryVersion!==1)return {x:b.x,y:b.y+22};
    var nav=APH.Nav.gridOf(s.colony.buildings,s.colony.scene);
    var cells=APH.BuildGrid.interactionCells(b,APH.Colony.list(),{scene:s.colony.scene});
    cells.sort(function(a,c){return Math.hypot((a.gx+.5)*CFG.GRID-from.x,(a.gy+.5)*CFG.GRID-from.y)-Math.hypot((c.gx+.5)*CFG.GRID-from.x,(c.gy+.5)*CFG.GRID-from.y);});
    for(var i=0;i<cells.length;i++){
      var c=cells[i],p={x:(c.gx+.5)*CFG.GRID,y:(c.gy+.5)*CFG.GRID};
      if(nav[c.gy]&&!nav[c.gy][c.gx]&&APH.Nav.astar(nav,from,p))return p;
    }
    return null;
  }
    function materialNeed(def,mul){
    def=def||{};mul=mul==null?1:mul;
    var raw=Object.assign({},def.costRes||{}),need={};
    raw.mineral=(raw.mineral||0)+(def.costMineral||0);
    Object.keys(raw).forEach(function(k){var n=Math.max(0,Math.round(raw[k]*mul));if(n)need[k]=n;});
    return need;
  }
  function cellsOf(bid){
    var d=APH.Colony.get(bid)||{};
    return (SHAPES[bid]||d.cells||[1,1]).slice();
  }
  return {materialNeed:materialNeed,record:record,ghost:ghost,spot:spot,cellsOf:cellsOf,isBasic:function(id){return !!BASIC[id];}};
})();
