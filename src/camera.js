/* ============================================================
   Aphelion · camera.js — 纯相机投影/缩放数学
   挂载: window.APH.Camera

   所有坐标均使用 CSS 像素与世界像素；DPR 只由 canvas transform 处理。
   ============================================================ */
window.APH=window.APH||{};

APH.Camera=(function(){
  'use strict';
  var CFG=APH.CFG||{};

  function finite(v,fallback){v=Number(v);return isFinite(v)?v:fallback;}
  function limits(){
    var c=CFG.camera||{};
    var min=finite(c.zoomMin,.5),max=finite(c.zoomMax,2);
    if(min<=0)min=.5;
    if(max<min)max=min;
    return {min:min,max:max};
  }
  function zoom(s){
    var lim=limits(),z=finite(s&&s.camZoom,1);
    return Math.max(lim.min,Math.min(lim.max,z));
  }
  function screen(vp){
    vp=vp||{};
    return {w:Math.max(1,finite(vp.w,1)),h:Math.max(1,finite(vp.h,1))};
  }
  function bounds(s){
    s=s||{};
    var d=s.scene==='home'&&s.colony&&s.colony.scene?s.colony.scene:s.worldDescriptor;
    if(d&&d.generation===1&&window.APH.TerrainModel&&APH.TerrainModel.hasObservation(d)){
      var terrain=APH.TerrainModel.dimensions(d);
      return {width:terrain.width,height:terrain.height};
    }
    return {
      width:Math.max(1,finite(d&&d.width,finite(CFG.WORLD,2200))),
      height:Math.max(1,finite(d&&d.height,finite(CFG.WORLD,2200)))
    };
  }
  function viewport(s,vp){
    var p=screen(vp),z=zoom(s),w=p.w/z,h=p.h/z;
    var x=finite(s&&s.camX,0),y=finite(s&&s.camY,0);
    return {x:x,y:y,left:x-w/2,top:y-h/2,right:x+w/2,bottom:y+h/2,
      width:w,height:h,halfW:w/2,halfH:h/2,zoom:z,w:p.w,h:p.h};
  }
  function toWorld(s,x,y,vp){
    var v=viewport(s,vp);
    return {x:v.x+(finite(x,0)-v.w/2)/v.zoom,y:v.y+(finite(y,0)-v.h/2)/v.zoom};
  }
  function toScreen(s,x,y,vp){
    var v=viewport(s,vp);
    return {x:(finite(x,0)-v.x)*v.zoom+v.w/2,y:(finite(y,0)-v.y)*v.zoom+v.h/2};
  }
  function clampAxis(value,size,half){
    if(half*2>=size)return size/2;
    return Math.max(half,Math.min(size-half,finite(value,size/2)));
  }
  function clamp(s,vp){
    if(!s)return s;
    var v=viewport(s,vp),b=bounds(s);
    s.camX=clampAxis(s.camX,b.width,v.halfW);
    s.camY=clampAxis(s.camY,b.height,v.halfH);
    return s;
  }
  function setZoom(s,z,anchor,vp){
    if(!s)return 1;
    var p=screen(vp),a=anchor||{x:p.w/2,y:p.h/2};
    var before=toWorld(s,a.x,a.y,p),lim=limits();
    s.camZoom=Math.max(lim.min,Math.min(lim.max,finite(z,zoom(s))));
    s.camX=before.x-(finite(a.x,p.w/2)-p.w/2)/s.camZoom;
    s.camY=before.y-(finite(a.y,p.h/2)-p.h/2)/s.camZoom;
    clamp(s,p);
    return s.camZoom;
  }

  return {zoom:zoom,viewport:viewport,toWorld:toWorld,toScreen:toScreen,
    setZoom:setZoom,clamp:clamp};
})();
