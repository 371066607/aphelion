window.APH=window.APH||{};
APH.Scene=(function(){
  'use strict';
  function of(state){
    var s=state||APH.state||{};
    return s.scene==='home'&&s.colony&&s.colony.scene?s.colony.scene:
      s.worldDescriptor||{v:1,kind:s.scene||'home',width:APH.CFG.WORLD,height:APH.CFG.WORLD,grid:APH.CFG.GRID,generation:0};
  }
  function desc(sceneOrState){
    if(sceneOrState && sceneOrState.width!=null && sceneOrState.height!=null) return sceneOrState;
    return of(sceneOrState);
  }
  function dimensions(sceneOrState){
    var d=desc(sceneOrState);
    if(d&&d.generation===1&&window.APH.TerrainModel&&APH.TerrainModel.hasObservation(d))
      return APH.TerrainModel.dimensions(d);
    var grid=d.grid||APH.CFG.GRID;
    return {grid:grid,width:d.width||APH.CFG.WORLD,height:d.height||APH.CFG.WORLD,
      cols:Math.ceil((d.width||APH.CFG.WORLD)/grid),rows:Math.ceil((d.height||APH.CFG.WORLD)/grid)};
  }
  function clampPoint(x,y,sceneOrState,pad){
    pad=pad==null?100:pad;
    var d=dimensions(sceneOrState), w=d.width, h=d.height;
    var maxX=Math.max(pad,w-pad), maxY=Math.max(pad,h-pad);
    return {x:APH.U.clamp(x,pad,maxX), y:APH.U.clamp(y,pad,maxY)};
  }
  return {of:of,dimensions:dimensions,width:function(s){return dimensions(s).width;},
    height:function(s){return dimensions(s).height;},clampPoint:clampPoint};
})();
