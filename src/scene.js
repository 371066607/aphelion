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
  function clampPoint(x,y,sceneOrState,pad){
    pad=pad==null?100:pad;
    var d=desc(sceneOrState), w=d.width||APH.CFG.WORLD, h=d.height||APH.CFG.WORLD;
    var maxX=Math.max(pad,w-pad), maxY=Math.max(pad,h-pad);
    return {x:APH.U.clamp(x,pad,maxX), y:APH.U.clamp(y,pad,maxY)};
  }
  return {of:of,width:function(s){return of(s).width;},height:function(s){return of(s).height;},clampPoint:clampPoint};
})();
